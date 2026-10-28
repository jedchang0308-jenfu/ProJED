import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import type { RuntimeDatabase } from '../../../server/db.js';
import type { CompleteLoginInput, StoredLoginIntent } from '../../../server/appSessionStore.js';
import { PostgresAppSessionStore } from '../../../server/postgresAppSessionStore.js';
import type { ProducerVerifiedIdentity } from '../../../server/identityConsumer.js';
import { KernelError } from '../../../server/errors.js';

const opaqueHash = () => randomBytes(32).toString('hex');
const ORIGIN='https://projed.example.invalid';
function intent(oldSessionHash: string | null=null): StoredLoginIntent {
  return { tokenHash:opaqueHash(),stateHash:opaqueHash(),entry:'main',publicOrigin:ORIGIN,returnPath:'/',
    oldSessionHash,codeVerifier:randomBytes(32).toString('base64url'),status:'pending',claimHash:null,
    completedSessionHash:null,expiresAtMs:Date.now()+300_000 };
}
function complete(row: StoredLoginIntent,claimHash: string,who: 'a'|'b'='a'): CompleteLoginInput {
  const now=Date.now();
  const localUserId=who==='a'?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const identity: ProducerVerifiedIdentity={
    contractVersion:'jenfu.sso-handoff.v4',manifestSha256:'c5471fa9686566cf2ecb42f6f78f52eed5188e36bcfd8208609a96fc0f829e6a',
    issuer:'https://platform.example.invalid/api/sso',audience:'projed',identityIssuer:'https://securetoken.google.com/local-test',
    identitySubject:`firebase-${who}`,principalId:`principal:${who}`,principalKind:'personal',employeeId:null,
    googleSubject:`synthetic-google-${who}`,authEpoch:1,authenticatedAtMs:now-60_000,revokedBeforeMs:null,
    issuedAtMs:now-1,expiresAtMs:now+59_999,currentStateExpiresAtMs:now+10_000,
    sourceSessionExpiresAtMs:now+8*60*60*1000,mappingRevision:'12',
  };
  return { tokenHash:row.tokenHash,stateHash:row.stateHash,claimHash,sessionTokenHash:opaqueHash(),contextId:randomUUID(),
    verified:{ identity,actor:{principalId:identity.principalId,localUserId,entry:row.entry,contextId:randomUUID(),
      expiresAtMs:now+10_000,accountGuardRevision:'1'} },nowMs:now };
}
function denied(action: Promise<unknown>) {
  return assert.rejects(action,(error: unknown)=>error instanceof KernelError && (error.httpStatus===409||error.httpStatus===403));
}

/** True local SQL/roles, with synthetic owner identity proof; not real SSO. */
export async function verifyAppSessionsPostgres(database: RuntimeDatabase): Promise<void> {
  const store=new PostgresAppSessionStore(database);
  const first=intent();
  await store.begin(first);
  const claimHash=opaqueHash();
  assert.equal((await store.claim(first.tokenHash,first.stateHash,claimHash,Date.now())).status,'processing');
  const input=complete(first,claimHash);
  const created=await store.complete(input);
  assert.equal(created.contextId,input.contextId);
  assert.equal(created.expiresAtMs,input.verified.identity.sourceSessionExpiresAtMs);
  assert.equal((await store.readSession(created.tokenHash))?.contextId,input.contextId);
  assert.equal((await store.readLogin(first.tokenHash))?.status,'consumed');
  assert.equal((await store.readLogin(first.tokenHash))?.codeVerifier,null);
  const replay={...input,sessionTokenHash:opaqueHash()};
  await denied(store.complete(replay));
  assert.equal(await store.readSession(replay.sessionTokenHash),null);

  const cancelled=intent();
  await store.begin(cancelled);
  const cancelledClaim=opaqueHash();
  await store.claim(cancelled.tokenHash,cancelled.stateHash,cancelledClaim,Date.now());
  await store.cancel(cancelled.tokenHash,ORIGIN,Date.now());
  const late=complete(cancelled,cancelledClaim);
  await denied(store.complete(late));
  assert.equal(await store.readSession(late.sessionTokenHash),null);

  const switched=intent(created.tokenHash);
  await store.begin(switched);
  const switchClaim=opaqueHash();
  await store.claim(switched.tokenHash,switched.stateHash,switchClaim,Date.now());
  const switchedInput=complete(switched,switchClaim,'b');
  const second=await store.complete(switchedInput);
  assert.equal(second.localUserId,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.notEqual(second.contextId,created.contextId);
  assert.notEqual((await store.readSession(created.tokenHash))?.revokedAtMs,null);
  const staleStart=intent(created.tokenHash);
  await denied(store.begin(staleStart));
  assert.equal(await store.readLogin(staleStart.tokenHash),null);

  const orphan=intent(second.tokenHash);
  await store.begin(orphan); // Models a committed begin whose HTTP response was lost.
  const retry=intent(second.tokenHash);
  await store.begin(retry);
  assert.equal((await store.readLogin(orphan.tokenHash))?.status,'cancelled');
  assert.equal((await store.readLogin(retry.tokenHash))?.status,'pending');

  const lease=await database.checkout();
  try {
    assert.equal((await lease.client.query('SELECT * FROM projed_core.app_sessions')).rowCount,0);
    assert.equal((await lease.client.query('SELECT * FROM projed_core.app_login_intents')).rowCount,0);
    await lease.client.query('BEGIN');
    await lease.client.query("SELECT set_config('projed.session_token_hash',$1,true)",[second.tokenHash]);
    await assert.rejects(lease.client.query("UPDATE projed_core.app_sessions SET identity='{}'::jsonb WHERE token_hash=$1",[second.tokenHash]),
      (error: unknown)=>(error as {code?:string}).code==='42501');
    await lease.client.query('ROLLBACK');
    await lease.client.query('BEGIN');
    await lease.client.query("SELECT set_config('projed.session_token_hash',$1,true)",[created.tokenHash]);
    await assert.rejects(lease.client.query('UPDATE projed_core.app_sessions SET revoked_at_ms=NULL WHERE token_hash=$1',[created.tokenHash]),
      (error: unknown)=>(error as {code?:string}).code==='23514');
    await lease.client.query('ROLLBACK');
  } finally { lease.release(); }
}
