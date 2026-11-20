import assert from 'node:assert/strict';
import pg from 'pg';
import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import type { StoredAppSession } from '../../../server/appSessionStore.js';

export async function verifyCentralRevocationPostgres(database: RuntimeDatabase,config: RuntimeConfig,session: StoredAppSession): Promise<void> {
  assert.equal(config.profile.environment,'disposable');
  assert.match(config.binding.databaseName,/^dev139_s3_[a-f0-9]{32}$/u);
  const url=new URL(process.env.PROJED_QA_MEETING_ADMIN_URL!);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(Number(url.port),config.binding.databasePort);
  assert.equal(url.pathname,`/${config.binding.databaseName}`);
  const admin=new pg.Client({connectionString:url.toString()});await admin.connect();
  const actor: ServerActorV1={principalId:session.identity.principalId,localUserId:session.localUserId,
    sessionTokenHash:session.tokenHash,
    entry:session.entry,contextId:session.contextId,accountGuardRevision:session.accountGuardRevision,expiresAtMs:Date.now()+10_000};
  const check=()=>runActorTransaction(database,config,actor,async()=>true);
  const revoke=()=>admin.query('SELECT projed_contract.invalidate_google_sessions_v1($1::text)',[session.identity.googleSubject]);
  let release!:()=>void;
  try {
    const privileges=await admin.query(`SELECT
      has_function_privilege('projed_runtime_disposable','projed_contract.invalidate_google_sessions_v1(text)','EXECUTE') AS execute,
      has_table_privilege('projed_runtime_disposable','projed_contract.v_google_session_accounts_v1','SELECT') AS read,
      has_column_privilege('projed_runtime_disposable','projed_contract.v_account_session_guards_v1','revision','UPDATE') AS write`);
    assert.deepEqual(privileges.rows,[{execute:false,read:false,write:false}]);
    await check();
    await admin.query('BEGIN; SET LOCAL ROLE projed_owner_disposable');
    await revoke();await admin.query('ROLLBACK');
    await check(); // cancelled publication cannot leave a stale/inactive account

    let entered!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const inFlight=runActorTransaction(database,config,actor,async()=>{entered();await gate;return 'prior-commit';});
    await started;
    try {
      await admin.query("BEGIN; SET LOCAL ROLE projed_owner_disposable; SET LOCAL lock_timeout='250ms'");
      await assert.rejects(revoke(),error=>(error as {code?:string}).code==='55P03');
      await admin.query('ROLLBACK');
    } finally { release(); }
    assert.equal(await inFlight,'prior-commit');
    await admin.query('BEGIN; SET LOCAL ROLE projed_owner_disposable');
    await revoke();await admin.query('COMMIT');
    await assert.rejects(check(),error=>error instanceof KernelError&&error.code==='ACCESS_DENIED');
    const guard=await admin.query('SELECT active,revision::text FROM projed_core.account_authorization_guards WHERE local_user_id=$1',[actor.localUserId]);
    assert.equal(guard.rows[0].active,true);
    assert.equal(guard.rows[0].revision,String(BigInt(actor.accountGuardRevision)+1n));
    await admin.query('BEGIN; SET LOCAL ROLE projed_owner_disposable');
    await revoke();await admin.query('COMMIT');
    await assert.rejects(check(),error=>error instanceof KernelError&&error.code==='ACCESS_DENIED');
  } finally { release?.();await admin.query('ROLLBACK').catch(()=>{});await admin.end(); }
}
