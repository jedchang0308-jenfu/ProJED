import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import pg from 'pg';
import { loadRuntimeConfig,sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { PostgresAppSessionStore } from '../../../server/postgresAppSessionStore.js';
import { REMEMBERED_DEVICE_TTL_MS,type StoredLoginIntent } from '../../../server/appSessionStore.js';
import { runActorTransaction,type ServerActorV1 } from '../../../server/actorTransaction.js';
import type { ProducerVerifiedIdentity } from '../../../server/identityConsumer.js';
import { publishSyntheticPrincipalState } from '../s2/principalStateFixture.js';

const config=loadRuntimeConfig();const database=new RuntimeDatabase(config);const store=new PostgresAppSessionStore(database);
assert.equal(config.env,'disposable');assert.match(config.binding.databaseName,/^dev139_s3_[a-f0-9]{32}$/u);
const adminUrl=new URL(process.env.PROJED_QA_MEETING_ADMIN_URL!);
assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(Number(adminUrl.port),config.binding.databasePort);
assert.equal(adminUrl.pathname,`/${config.binding.databaseName}`);
const admin=new pg.Client({connectionString:adminUrl.toString()});const checks:string[]=[];
const hash=()=>randomBytes(32).toString('hex');
const actor=(s:Awaited<ReturnType<typeof store.complete>>):ServerActorV1=>({principalId:s.identity.principalId,localUserId:s.localUserId,entry:s.entry,
 contextId:s.contextId,sessionTokenHash:s.tokenHash,accountGuardRevision:s.accountGuardRevision,expiresAtMs:s.expiresAtMs});
async function enroll(entry:'main'|'quick',rememberDevice=true,shortSource=false){
 const now=Date.now();const origin=entry==='main'?'https://projed.example.invalid':'https://quick.example.invalid';
 const row:StoredLoginIntent={tokenHash:hash(),stateHash:hash(),entry,publicOrigin:origin,returnPath:'/',oldSessionHash:null,
 codeVerifier:randomBytes(32).toString('base64url'),status:'pending',claimHash:null,completedSessionHash:null,expiresAtMs:now+300000,rememberDevice};
 const proof:ProducerVerifiedIdentity={contractVersion:'jenfu.sso-handoff.v4',manifestSha256:'c5471fa9686566cf2ecb42f6f78f52eed5188e36bcfd8208609a96fc0f829e6a',
 issuer:'https://platform.example.invalid/api/sso',audience:'projed',identityIssuer:'https://securetoken.google.com/local-test',identitySubject:'firebase-a',
 principalId:'principal:a',principalKind:'personal',employeeId:null,googleSubject:'synthetic-google-a',authEpoch:1,authenticatedAtMs:now-60000,
 revokedBeforeMs:null,issuedAtMs:now-1000,expiresAtMs:now+(shortSource?1000:60000),currentStateExpiresAtMs:now+(shortSource?1000:10000),
 sourceSessionExpiresAtMs:now+(shortSource?2000:8*60*60*1000),mappingRevision:'12'};
 await publishSyntheticPrincipalState(config,proof);await store.begin(row);const claim=hash();await store.claim(row.tokenHash,row.stateHash,claim,Date.now());
 return store.complete({tokenHash:row.tokenHash,stateHash:row.stateHash,claimHash:claim,sessionTokenHash:hash(),entry,contextId:randomUUID(),identity:proof,nowMs:Date.now()});
}
try{
 await database.assertRuntimeBoundary(config.profile.migrations.map(({version,path})=>({version,checksum:sha256(readFileSync(path))})));
 await admin.connect();checks.push('forward-migration-0054-runtime-ledger');
 const main=await enroll('main',true,true);const quick=await enroll('quick');const legacy=await enroll('main',false);
 assert.equal(main.rememberedDevice,true);assert.equal(quick.rememberedDevice,true);assert.equal(legacy.rememberedDevice,undefined);
 assert.ok(main.expiresAtMs>=Date.now()+REMEMBERED_DEVICE_TTL_MS-2000);assert.equal(legacy.expiresAtMs,legacy.identity.sourceSessionExpiresAtMs);
 const snapshotBefore=await admin.query('SELECT identity,permission_snapshot,created_resource_permissions FROM projed_core.app_sessions WHERE token_hash=$1',[main.tokenHash]);
 checks.push('opt-in-main-quick-v2-and-legacy-v1');
 await wait(Math.max(0,main.identity.sourceSessionExpiresAtMs-Date.now()+20));
 // Re-publish the original key without a source-session bearer; fresh current identity is sufficient.
 await publishSyntheticPrincipalState(config,main.identity);
 await runActorTransaction(database,config,actor(main),port=>port.query('SELECT projed_core.actor_context_valid_v1() AS valid'));
 const renewed=await store.renewSession(main,Date.now());assert.equal(renewed.contextId,main.contextId);assert.deepEqual(renewed.identity,main.identity);
 assert.ok(renewed.expiresAtMs>main.expiresAtMs);const snapshotAfter=await admin.query('SELECT identity,permission_snapshot,created_resource_permissions FROM projed_core.app_sessions WHERE token_hash=$1',[main.tokenHash]);
 assert.deepEqual(snapshotAfter.rows,snapshotBefore.rows);checks.push('source-expired-renewal-original-snapshot-and-actor');
 await assert.rejects(store.renewSession(legacy,Date.now()));checks.push('legacy-cannot-renew');
 const parallel=await Promise.all([store.renewSession(main,Date.now()),store.renewSession(main,Date.now())]);
 assert.ok(parallel[1]!.expiresAtMs>=parallel[0]!.expiresAtMs);checks.push('concurrent-monotonic-renewal');
 // Exact v1 source cap survives the forward migration; owner cannot accidentally convert old data.
 await assert.rejects(admin.query(`INSERT INTO projed_core.app_sessions(token_hash,public_origin,entry,local_user_id,google_subject,context_id,account_guard_revision,identity,expires_at_ms,permission_snapshot,session_version)
 SELECT $1,public_origin,entry,local_user_id,google_subject,$2::uuid,account_guard_revision,identity,expires_at_ms,permission_snapshot,1
 FROM projed_core.app_sessions WHERE token_hash=$3`,[hash(),randomUUID(),main.tokenHash]),(e:unknown)=>(e as {code:string}).code==='23514');checks.push('v1-source-check-retained');
 // Ordinary runtime updates cannot extend a credential through the generic revoke policy.
 const lease=await database.checkout();try{
  await lease.client.query('BEGIN');await lease.client.query("SELECT set_config('projed.session_token_hash',$1,true)",[main.tokenHash]);
  await assert.rejects(lease.client.query('UPDATE projed_core.app_sessions SET expires_at_ms=expires_at_ms+1 WHERE token_hash=$1',[main.tokenHash]));
  await lease.client.query('ROLLBACK');
 }finally{lease.release();}checks.push('runtime-renewal-scope-required');
 // Current-state outage is retryable and leaves the existing deadline untouched.
 const beforeOutage=(await store.readSession(quick.tokenHash))!;await admin.query('DELETE FROM platform_contract.synthetic_projed_states WHERE principal_id=$1',[main.identity.principalId]);
 await assert.rejects(store.renewSession(quick,Date.now()));assert.equal((await store.readSession(quick.tokenHash))!.expiresAtMs,beforeOutage.expiresAtMs);
 await publishSyntheticPrincipalState(config,main.identity);checks.push('principal-unavailable-preserves-valid-session');
 await publishSyntheticPrincipalState(config,{...main.identity,authEpoch:2});await assert.rejects(store.renewSession(quick,Date.now()));
 await publishSyntheticPrincipalState(config,main.identity);checks.push('principal-epoch-drift-refused');
 // Both possible lock orderings end with the original credential irrevocably logged out.
 await Promise.allSettled([store.renewSession(main,Date.now()),store.revokeSession(main.tokenHash,main.publicOrigin,Date.now())]);
 assert.notEqual((await store.readSession(main.tokenHash))!.revokedAtMs,null);await assert.rejects(store.renewSession(main,Date.now()));
 assert.equal((await store.readSession(quick.tokenHash))!.revokedAtMs,null);checks.push('logout-renewal-race-no-resurrection-independent-entry');
 await admin.query('SELECT projed_contract.invalidate_google_sessions_v1($1)',[main.identity.googleSubject]);
 await assert.rejects(store.renewSession(quick,Date.now()));await assert.rejects(runActorTransaction(database,config,actor(quick),port=>port.query('SELECT 1')));
 checks.push('central-revocation-fences-all-device-sessions');
 // The current worker definitions use a versioned lifetime at every original source check.
 for(const name of ['app_session_revoke_v1','meeting_run_cancel_guard_v1','meeting_asr_run_live_v1','meeting_discussion_live_v1','meeting_llm_private_scope_v1']){
  const def=await admin.query("SELECT pg_get_functiondef(oid) AS body,prosecdef,NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS no_public_execute FROM pg_proc WHERE pronamespace='projed_core'::regnamespace AND proname=$1",[name]);
  assert.match(def.rows[0].body,/session_version = 2|session_version=2/u);
  assert.equal(def.rows[0].prosecdef,false);assert.equal(def.rows[0].no_public_execute,true);
 }checks.push('worker-current-functions-versioned-horizon-invoker-and-no-public-execute');
 console.log(JSON.stringify({status:'PASS',scope:'DEV143_DEVICE_SESSION_LOCAL_ACCEPTANCE',checks}));
}finally{await admin.end();await database.end();}
