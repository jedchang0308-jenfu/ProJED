import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadTestActorConfig, isAuthorizedTestUrl, isPublicTestKey, distinctReadyActors, testProjectRef } from './dev133-test-actor-support.mjs';
import { inspectTestActor } from './dev133-actor-probe.mjs';

const root = mkdtempSync(path.join(os.tmpdir(), 'dev133-readiness-contract-'));
let cases = 0;
try {
  writeFileSync(path.join(root, '.env.p8.local'), 'VITE_SUPABASE_URL=https://production.invalid\nSUPABASE_ACCESS_TOKEN=must-not-load\n');
  writeFileSync(path.join(root, '.env.local'), `VITE_SUPABASE_URL=https://${testProjectRef}.supabase.co\nVITE_SUPABASE_TEST_PASSWORD="  meaningful spaces  "\nSUPABASE_SERVICE_ROLE_KEY=must-not-load\n`);
  const config = loadTestActorConfig(root, {});
  assert.equal(config.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(config.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(config.VITE_SUPABASE_TEST_PASSWORD, '  meaningful spaces  ');
  assert.equal(config.VITE_SUPABASE_URL, `https://${testProjectRef}.supabase.co`);
  cases += 1;
  for (const url of [
    `https://${testProjectRef}.evil.invalid`, `http://${testProjectRef}.supabase.co`,
    `https://user:pass@${testProjectRef}.supabase.co`, `https://${testProjectRef}.supabase.co:444`,
    `https://${testProjectRef}.supabase.co/path`, `https://${testProjectRef}.supabase.co/?redirect=other`,
    'https://knodlkxqpcqyrtgwpdst.supabase.co',
  ]) { assert.equal(isAuthorizedTestUrl(url), false); cases += 1; }
  assert.equal(isAuthorizedTestUrl(`https://${testProjectRef}.supabase.co/`), true);
  cases += 1;
  const keyFor = claims => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  assert.equal(isPublicTestKey(keyFor({ role: 'service_role', ref: testProjectRef })), false);
  assert.equal(isPublicTestKey(keyFor({ role: 'anon', ref: 'other-project' })), false);
  assert.equal(isPublicTestKey('sb_secret_forbidden'), false);
  assert.equal(isPublicTestKey(keyFor({ role: 'anon', ref: testProjectRef })), true);
  cases += 1;
  assert.equal(distinctReadyActors([{ actor: { ready: true }, accountId: 'same' }, { actor: { ready: true }, accountId: 'same' }]), false);
  assert.equal(distinctReadyActors([{ actor: { ready: true }, accountId: 'a' }, { actor: { ready: true }, accountId: 'b' }]), true);
  cases += 1;

  const makeClient = ({ email = 'actor-b@test.invalid', finalId = 'b', finalToken = 'private-test-token', queryError = false } = {}) => {
    let dataReads = 0;
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'b', email } }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: finalId }, access_token: finalToken } }, error: null }),
      },
      from: () => {
        dataReads += 1;
        const query = {
          select: () => query, eq: () => query, limit: () => query,
          then: resolve => resolve({ data: [{ id: 'owned-fixture' }], error: queryError ? { message: 'secret-must-not-leak' } : null }),
        };
        return query;
      },
    };
    return { client, reads: () => dataReads };
  };
  const valid = makeClient();
  const pass = await inspectTestActor(valid.client, 'B', 'actor-b@test.invalid', 'private-test-token');
  assert.equal(pass.actor.ready, true);
  assert.equal(JSON.stringify(pass).includes('private-test-token'), false);
  assert.equal(JSON.stringify(pass).includes('@'), false);
  cases += 1;
  const wrong = makeClient({ email: 'unexpected@test.invalid' });
  const denied = await inspectTestActor(wrong.client, 'B', 'actor-b@test.invalid', 'private-test-token');
  assert.equal(denied.actor.ready, false);
  assert.equal(wrong.reads(), 0);
  cases += 1;
  for (const changes of [{ finalId: 'a' }, { finalToken: 'refreshed' }]) {
    const changed = makeClient(changes);
    const result = await inspectTestActor(changed.client, 'B', 'actor-b@test.invalid', 'private-test-token');
    assert.equal(result.actor.ready, false);
    assert.equal(result.actor.reason, 'session-changed-during-readback');
    cases += 1;
  }
  const failed = makeClient({ queryError: true });
  const failure = await inspectTestActor(failed.client, 'B', 'actor-b@test.invalid', 'private-test-token');
  assert.equal(failure.actor.ready, false);
  assert.equal(JSON.stringify(failure).includes('secret-must-not-leak'), false);
  cases += 1;
  console.log(JSON.stringify({ devId: 'DEV-133', status: 'PASS', cases, evidence: 'isolated regression only; not real actor acceptance' }));
} finally {
  if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('dev133-readiness-contract-')) rmSync(root, { recursive: true, force: true });
}
