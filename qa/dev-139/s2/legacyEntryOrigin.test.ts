import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import test from 'node:test';
import { SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { createLegacyEntryRequestPreparer, ENTRY_IDENTITY_HEADER, ENTRY_ORIGIN_HEADER } from '../../../server/legacyEntryOrigin.js';
import { CURRENT_LEGACY_ENTRY_BINDING, LEGACY_ENTRY_UPSTREAM, LEGACY_ENTRY_ACCOUNT,
  LEGACY_MAIN_ORIGIN, LEGACY_QUICK_ORIGIN, type LegacyEntryBinding } from '../../../server/legacyEntryBinding.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const binding: LegacyEntryBinding = { version: 'projed.legacy-entry.v1', upstreamOrigin: LEGACY_ENTRY_UPSTREAM,
  serviceAccount: LEGACY_ENTRY_ACCOUNT, serviceAccountSubject: '123456789012345678901', qualificationSha256: 'a'.repeat(64) };
const now = Math.floor(Date.now() / 1000);
const jwk = await exportJWK(publicKey);
const getKey = createLocalJWKSet({ keys: [{ ...jwk, kid: 'isolated-fixture', alg: 'RS256', use: 'sig' }] });
async function token(claims = {}, key = privateKey): Promise<string> {
  return new SignJWT({ email: binding.serviceAccount, email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'isolated-fixture' })
    .setIssuer('https://accounts.google.com').setAudience(binding.upstreamOrigin)
    .setSubject(binding.serviceAccountSubject).setIssuedAt(now).setExpirationTime(now + 600).sign(key);
}
function request(proof?: string, origin: unknown = LEGACY_MAIN_ORIGIN): IncomingMessage {
  const value = new IncomingMessage(new Socket());
  value.headers = { host: 'central.run.app' };
  if (proof !== undefined) {
    value.headers[ENTRY_ORIGIN_HEADER] = origin as string;
    value.headers[ENTRY_IDENTITY_HEADER] = proof;
    value.headers['x-serverless-authorization'] = 'Bearer SIGNATURE_REMOVED_BY_GOOGLE';
    value.rawHeaders = [ENTRY_IDENTITY_HEADER, proof, 'X-Serverless-Authorization', 'Bearer SIGNATURE_REMOVED_BY_GOOGLE'];
  }
  return value;
}
const prepare = createLegacyEntryRequestPreparer(binding, { getKey, now: () => now * 1000 });

test('production binding stays disabled and forged entry headers fail before key retrieval', async () => {
  assert.equal(CURRENT_LEGACY_ENTRY_BINDING, null);
  let keys = 0;
  const disabled = createLegacyEntryRequestPreparer(null, { getKey: async () => { keys++; throw new Error(); } });
  await disabled(request());
  await assert.rejects(disabled(request(await token())), /not authorized/);
  assert.equal(keys, 0);
});

test('valid fixed relay signature selects only the exact old main/Quick host and strips transport proof', async () => {
  for (const origin of [LEGACY_MAIN_ORIGIN, LEGACY_QUICK_ORIGIN]) {
    const req = request(await token(), origin);
    req.headers.cookie = '__session=opaque-user-session';
    req.headers['x-forwarded-host'] = 'attacker.invalid';
    await prepare(req);
    assert.equal(req.headers.host, new URL(origin).host);
    assert.equal(req.headers.cookie, '__session=opaque-user-session');
    assert.equal(req.headers[ENTRY_IDENTITY_HEADER], undefined);
    assert.equal(req.headers['x-serverless-authorization'], undefined);
    assert.deepEqual(req.rawHeaders, []);
  }
});

test('wrong account, unverified email and excessive token lifetime cannot select a host', async () => {
  for (const claims of [{ email: 'other@projed-cc78d.iam.gserviceaccount.com' }, { email_verified: false }]) {
    const req = request(await token(claims));
    await assert.rejects(prepare(req), /not authorized/);
    assert.equal(req.headers.host, 'central.run.app');
  }
  for (const claims of [{ sub: '999999999999999999999' }, { aud: 'https://attacker.invalid' },
    { iss: 'https://attacker.invalid' }, { iat: now + 10 }, { exp: now - 1 }, { exp: now + 7200 }]) {
    const raw = await new SignJWT({ email: binding.serviceAccount, email_verified: true,
      sub: binding.serviceAccountSubject, aud: binding.upstreamOrigin, iss: 'https://accounts.google.com',
      iat: now, exp: now + 600, ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'isolated-fixture' }).sign(privateKey);
    await assert.rejects(prepare(request(raw)), /not authorized/);
  }
});

test('forged signature, stripped Cloud Run token and client origins are refused without diagnostics disclosure', async () => {
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  for (const proof of [await token({}, wrongKey), 'header.payload.SIGNATURE_REMOVED_BY_GOOGLE', 'x'.repeat(8193)]) {
    await assert.rejects(prepare(request(proof)), error => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(proof), false);
      return /not authorized/.test(error.message);
    });
  }
  for (const origin of ['https://attacker.invalid', `${LEGACY_MAIN_ORIGIN}/`, [LEGACY_MAIN_ORIGIN]]) {
    await assert.rejects(prepare(request(await token(), origin)), /not authorized/);
  }
});

test('direct old host, duplicate/missing reserved fields and arbitrary bindings cannot bypass transport', async () => {
  const direct = request(); direct.headers.host = new URL(LEGACY_MAIN_ORIGIN).host;
  await assert.rejects(prepare(direct), /not authorized/);
  const missing = request(); missing.headers[ENTRY_ORIGIN_HEADER] = LEGACY_MAIN_ORIGIN;
  await assert.rejects(prepare(missing), /not authorized/);
  const extra = request(await token()); extra.headers['x-projed-entry-subject'] = binding.serviceAccountSubject;
  await assert.rejects(prepare(extra), /not authorized/);
  assert.throws(() => createLegacyEntryRequestPreparer({ ...binding, upstreamOrigin: 'https://attacker.invalid' } as unknown as LegacyEntryBinding), /binding is invalid/);
});
