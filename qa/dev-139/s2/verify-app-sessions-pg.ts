import assert from 'node:assert/strict';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import type { RuntimeDatabase } from '../../../server/db.js';
import type { RuntimeConfig } from '../../../server/config.js';
import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { DomainReadRepository } from '../../../server/domainRead.js';
import { CollaborationReadRepository } from '../../../server/collaborationRead.js';
import { CollaborationWriteRepository } from '../../../server/collaborationWrite.js';
import { GooglePrincipalMappingResolver } from '../../../server/principalMappings.js';
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
  const identity: ProducerVerifiedIdentity={
    contractVersion:'jenfu.sso-handoff.v4',manifestSha256:'c5471fa9686566cf2ecb42f6f78f52eed5188e36bcfd8208609a96fc0f829e6a',
    issuer:'https://platform.example.invalid/api/sso',audience:'projed',identityIssuer:'https://securetoken.google.com/local-test',
    identitySubject:`firebase-${who}`,principalId:`principal:${who}`,principalKind:'personal',employeeId:null,
    googleSubject:`synthetic-google-${who}`,authEpoch:1,authenticatedAtMs:now-60_000,revokedBeforeMs:null,
    issuedAtMs:now-1,expiresAtMs:now+59_999,currentStateExpiresAtMs:now+10_000,
    sourceSessionExpiresAtMs:now+8*60*60*1000,mappingRevision:'12',
  };
  return { tokenHash:row.tokenHash,stateHash:row.stateHash,claimHash,sessionTokenHash:opaqueHash(),contextId:randomUUID(),
    identity,entry:row.entry,nowMs:now };
}
function denied(action: Promise<unknown>) {
  return assert.rejects(action,(error: unknown)=>error instanceof KernelError && (error.httpStatus===409||error.httpStatus===403));
}

/** True local SQL/roles, with synthetic owner identity proof; not real SSO. */
export async function verifyAppSessionsPostgres(database: RuntimeDatabase, config: RuntimeConfig): Promise<void> {
  const store=new PostgresAppSessionStore(database);
  const first=intent();
  await store.begin(first);
  const claimHash=opaqueHash();
  assert.equal((await store.claim(first.tokenHash,first.stateHash,claimHash,Date.now())).status,'processing');
  const input=complete(first,claimHash);
  const created=await store.complete(input);
  assert.equal(created.contextId,input.contextId);
  assert.equal(created.expiresAtMs,input.identity.sourceSessionExpiresAtMs);
  assert.equal(created.localUserId,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
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

  // First logins use the same transaction/state machine as existing accounts.
  // These are synthetic verified owner proofs, not a Firebase/OIDC acceptance.
  const newIdentity = (kind: 'personal'|'employee', subject: string): ProducerVerifiedIdentity => ({
    ...complete(intent(),opaqueHash()).identity,
    googleSubject:subject, identitySubject:`firebase-${subject}`, principalId:`principal:${subject}`,
    principalKind:kind, employeeId:kind==='employee'?'synthetic-new-employee':null,
    verifiedEmail:'a@example.invalid', // Deliberately matches another account; never a mapping key.
  });
  const prepare = async (proof: ProducerVerifiedIdentity) => {
    const row=intent(); const claim=opaqueHash();
    await store.begin(row); await store.claim(row.tokenHash,row.stateHash,claim,Date.now());
    return {...complete(row,claim),identity:proof};
  };
  const subject=`first-personal-${randomUUID()}`;
  const personalProof=newIdentity('personal',subject);
  const concurrentInputs=await Promise.all([prepare(personalProof),prepare(personalProof)]);
  const concurrent=await Promise.all(concurrentInputs.map(item=>store.complete(item)));
  assert.equal(concurrent[0]!.localUserId,concurrent[1]!.localUserId);
  assert.notEqual(concurrent[0]!.localUserId,created.localUserId);
  assert.notEqual(concurrent[0]!.contextId,concurrent[1]!.contextId);
  assert.equal(concurrent[0]!.accountGuardRevision,'1');
  for (const item of concurrentInputs) assert.equal((await store.readLogin(item.tokenHash))?.status,'consumed');
  const resolver=new GooglePrincipalMappingResolver(database);
  const personalMapping=await resolver.resolve(personalProof);
  assert.equal(personalMapping.status,'active');
  const employee=await store.complete(await prepare(newIdentity('employee',`first-employee-${randomUUID()}`)));
  const external=await store.complete(await prepare(newIdentity('personal',`first-external-${randomUUID()}`)));
  assert.notEqual(employee.localUserId,concurrent[0]!.localUserId);
  assert.notEqual(external.localUserId,concurrent[0]!.localUserId);
  assert.notEqual(external.localUserId,employee.localUserId);
  const owner=concurrent[0]!;
  const actor: ServerActorV1={principalId:owner.identity.principalId,localUserId:owner.localUserId,
    entry:owner.entry,contextId:owner.contextId,accountGuardRevision:owner.accountGuardRevision,
    expiresAtMs:owner.expiresAtMs};
  const reads=new DomainReadRepository();
  const collaborationReads=new CollaborationReadRepository();
  const commands=new CollaborationWriteRepository(reads);
  assert.deepEqual(await runActorTransaction(database,config,actor,port=>reads.listWorkspaces(port)),[]);
  const workspace=await runActorTransaction(database,config,actor,port=>commands.createWorkspace(port,{title:'First login personal workspace'}));
  const board=await runActorTransaction(database,config,actor,port=>commands.createBoard(port,workspace.id,{title:'First login private board'}));
  assert.equal(board.title,'First login private board');
  assert.deepEqual((await runActorTransaction(database,config,actor,port=>reads.listWorkspaceMembers(port,workspace.id)))
    .map(member=>member.userId),[owner.localUserId]);
  const employeeActor={...actor,principalId:employee.identity.principalId,localUserId:employee.localUserId,
    contextId:employee.contextId,accountGuardRevision:employee.accountGuardRevision};
  assert.deepEqual(await runActorTransaction(database,config,employeeActor,port=>reads.listWorkspaces(port)),[]);
  await assert.rejects(runActorTransaction(database,config,employeeActor,port=>reads.listTasks(port,workspace.id,board.id)),
    (error: unknown)=>error instanceof KernelError && error.code==='RESOURCE_NOT_FOUND');

  const {verifiedEmail:initialEmail,...originalGoogleProof}=personalProof;
  const refreshedProof={...personalProof,verifiedEmail:'fresh@example.invalid'};
  const {verifiedEmail:refreshedEmail,...sameGoogleProof}=refreshedProof;
  assert.equal(initialEmail,'a@example.invalid');
  assert.equal(refreshedEmail,'fresh@example.invalid');
  assert.deepEqual(sameGoogleProof,originalGoogleProof,'The second login changes only the verified email');
  const refreshedInput=await prepare(refreshedProof);
  const refreshed=await store.complete(refreshedInput);
  assert.equal(refreshed.localUserId,owner.localUserId,'Verified email refresh must retain the existing profile UUID');
  assert.equal(refreshed.accountGuardRevision,owner.accountGuardRevision,'Verified email refresh must not recreate or advance the guard');
  assert.equal(refreshed.identity.googleSubject,owner.identity.googleSubject);
  assert.notEqual(refreshed.contextId,owner.contextId);
  const refreshedMapping=await resolver.resolve(refreshedProof);
  assert.equal(refreshedMapping.status,'active');
  if(refreshedMapping.status==='active') assert.equal(refreshedMapping.localUserId,owner.localUserId);
  const refreshedActor: ServerActorV1={principalId:refreshed.identity.principalId,localUserId:refreshed.localUserId,
    entry:refreshed.entry,contextId:refreshed.contextId,accountGuardRevision:refreshed.accountGuardRevision,
    expiresAtMs:refreshed.expiresAtMs};
  const refreshedProfile=await runActorTransaction(database,config,refreshedActor,port=>port.query<{id:string;email:string|null}>(`
    SELECT id::text AS id,email FROM projed_core.profiles WHERE id=$1::uuid
  `,[owner.localUserId]));
  assert.deepEqual(refreshedProfile.rows,[{id:owner.localUserId,email:'fresh@example.invalid'}]);

  // Keep invite/RLS effects on these fresh fixture accounts, not imported seed A/B.
  const inviteWorkspace=await runActorTransaction(database,config,employeeActor,
    port=>commands.createWorkspace(port,{title:'Verified email invitation workspace'}));
  const inviteBoard=await runActorTransaction(database,config,employeeActor,
    port=>commands.createBoard(port,inviteWorkspace.id,{title:'Verified email invitation board'}));
  const oldEmailToken=randomBytes(32).toString('base64url');
  const freshEmailToken=randomBytes(32).toString('base64url');
  const inviteExpiresAt=Date.now()+60*60*1000;
  const oldEmailInvite=await runActorTransaction(database,config,employeeActor,port=>commands.createInvite(
    port,inviteWorkspace.id,inviteBoard.id,{email:'a@example.invalid',
      tokenHash:createHash('sha256').update(oldEmailToken).digest('hex'),expiresAt:inviteExpiresAt,defaultRole:'member'}));
  const freshEmailInvite=await runActorTransaction(database,config,employeeActor,port=>commands.createInvite(
    port,inviteWorkspace.id,inviteBoard.id,{email:'fresh@example.invalid',
      tokenHash:createHash('sha256').update(freshEmailToken).digest('hex'),expiresAt:inviteExpiresAt,defaultRole:'member'}));
  assert.equal(oldEmailInvite.status,'pending');
  assert.equal(freshEmailInvite.status,'pending');
  const invitesBeforeAccept=await runActorTransaction(database,config,employeeActor,
    port=>collaborationReads.listPendingInvites(port,inviteWorkspace.id,inviteBoard.id));
  assert.deepEqual(invitesBeforeAccept.map(item=>item.email).sort(),['a@example.invalid','fresh@example.invalid']);
  assert.equal((await runActorTransaction(database,config,refreshedActor,port=>reads.listWorkspaces(port)))
    .some(item=>item.id===inviteWorkspace.id),false,'New account must not see inviter workspace before accepting an invite');
  await assert.rejects(
    runActorTransaction(database,config,refreshedActor,port=>commands.acceptInvite(port,oldEmailToken)),
    (error: unknown)=>error instanceof KernelError && error.code==='RESOURCE_NOT_FOUND' && error.httpStatus===404,
    'The old email invite must be hidden by recipient RLS after verified email refresh',
  );
  assert.deepEqual((await runActorTransaction(database,config,employeeActor,
    port=>collaborationReads.listPendingInvites(port,inviteWorkspace.id,inviteBoard.id))).map(item=>item.email).sort(),
  ['a@example.invalid','fresh@example.invalid'],'The rejected old-email invite remains pending');
  const acceptedFreshInvite=await runActorTransaction(database,config,refreshedActor,
    port=>commands.acceptInvite(port,freshEmailToken));
  assert.equal(acceptedFreshInvite.status,'accepted');
  assert.equal(acceptedFreshInvite.email,'fresh@example.invalid');
  const invitedMembers=await runActorTransaction(database,config,employeeActor,
    port=>reads.listWorkspaceMembers(port,inviteWorkspace.id));
  assert.deepEqual(invitedMembers.filter(member=>member.userId===owner.localUserId).map(member=>member.profile.email),
    ['fresh@example.invalid'],'The refreshed email is accepted through the real invite and RLS path');
  await assert.rejects(runActorTransaction(database,config,refreshedActor,
    port=>reads.listWorkspaceMembers(port,inviteWorkspace.id)),
    (error: unknown)=>error instanceof KernelError && error.code==='RESOURCE_NOT_FOUND',
    'A board invitation must not grant workspace member-management access');
  assert.deepEqual(await runActorTransaction(database,config,refreshedActor,
    port=>reads.listTasks(port,inviteWorkspace.id,inviteBoard.id)),[]);
  assert.equal((await runActorTransaction(database,config,refreshedActor,port=>reads.listWorkspaces(port)))
    .some(item=>item.id===inviteWorkspace.id),true);

  await assert.rejects(
    runActorTransaction(database,config,refreshedActor,port=>port.query(`
      UPDATE projed_core.profiles SET email='unverified-change@example.invalid' WHERE id=$1::uuid
    `,[owner.localUserId])),
    (error: unknown)=>error instanceof KernelError && (error.cause as {code?:string}|undefined)?.code==='42501',
    'An authorized actor without registration scope cannot change profile email',
  );
  const displayUpdate=await runActorTransaction(database,config,refreshedActor,port=>port.query<{
    email:string|null;display_name:string|null;
  }>(`UPDATE projed_core.profiles SET display_name='Updated through actor scope',updated_at=now()
      WHERE id=$1::uuid RETURNING email,display_name`,[owner.localUserId]));
  assert.deepEqual(displayUpdate.rows,[{email:'fresh@example.invalid',display_name:'Updated through actor scope'}],
    'Existing actor-scoped display-name updates remain available');

  const existingGoogleRegistration=intent();
  const existingGoogleClaim=opaqueHash();
  await store.begin(existingGoogleRegistration);
  assert.equal((await store.claim(existingGoogleRegistration.tokenHash,existingGoogleRegistration.stateHash,
    existingGoogleClaim,Date.now())).status,'processing');
  const attemptedLocalUserId=randomUUID();
  const attemptedRegistrationEmail='existing-google-a-reuse@example.invalid';
  const registrationLease=await database.checkout();
  let registrationRollbackConfirmed=false;
  try {
    await registrationLease.client.query('BEGIN');
    await registrationLease.client.query(`SELECT set_config('projed.login_token_hash',$1,true),
      set_config('projed.verified_google_subject',$2,true),set_config('projed.actor_local_user_id',$3,true),
      set_config('projed.actor_principal_id',$4,true),set_config('projed.actor_entry',$5,true),
      set_config('projed.actor_context_id',$6,true),set_config('projed.actor_guard_revision',$7,true),
      set_config('projed.registration_user_id',$3,true),set_config('projed.registration_email',$8,true),
      set_config('projed.registration_claim_hash',$9,true)`,[
      existingGoogleRegistration.tokenHash,'synthetic-google-a',attemptedLocalUserId,'principal:a','main',randomUUID(),'1',
      attemptedRegistrationEmail,existingGoogleClaim]);
    const validRegistration=await registrationLease.client.query(`
      SELECT projed_core.current_actor_user_id_v1()::text AS actor_id,
        projed_core.registration_scope_valid_v1() AS valid,
        (SELECT local_user_id::text FROM projed_core.google_identity_proofs
          WHERE google_subject='synthetic-google-a') AS existing_user_id
    `);
    assert.deepEqual(validRegistration.rows,[{actor_id:attemptedLocalUserId,valid:true,
      existing_user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}],
    'The insert attempt has an exact actor/registration UUID, email, existing provider proof, and live processing claim');
    await assert.rejects(registrationLease.client.query(`
      INSERT INTO projed_core.profiles(id,email,display_name) VALUES($1::uuid,$2,$2)
    `,[attemptedLocalUserId,attemptedRegistrationEmail]),
    (error: unknown)=>(error as {code?:string}).code==='42501',
    '0022 first-registration policy must reject rebinding an existing Google proof');
  } finally {
    try {
      await registrationLease.client.query('ROLLBACK');
      registrationRollbackConfirmed=true;
    } catch { /* Destroy the client when the transaction state cannot be confirmed. */ }
    registrationLease.release(!registrationRollbackConfirmed);
    await store.cancel(existingGoogleRegistration.tokenHash,ORIGIN,Date.now());
  }

  const cancelledNew=await prepare(newIdentity('personal',`cancelled-new-${randomUUID()}`));
  await store.cancel(cancelledNew.tokenHash,ORIGIN,Date.now());
  await denied(store.complete(cancelledNew));
  assert.deepEqual(await resolver.resolve(cancelledNew.identity),{status:'missing'});
  assert.equal(await store.readSession(cancelledNew.sessionTokenHash),null);
  // A real duplicate Session PK fails after registration and old-Session revoke.
  // PostgreSQL must roll all those writes back, retaining the original Session.
  const rollbackIntent=intent(second.tokenHash);
  const rollbackClaim=opaqueHash();
  await store.begin(rollbackIntent);
  await store.claim(rollbackIntent.tokenHash,rollbackIntent.stateHash,rollbackClaim,Date.now());
  const rollbackInput={...complete(rollbackIntent,rollbackClaim),sessionTokenHash:created.tokenHash,
    identity:newIdentity('personal',`rollback-new-${randomUUID()}`)};
  await denied(store.complete(rollbackInput));
  assert.deepEqual(await resolver.resolve(rollbackInput.identity),{status:'missing'});
  assert.equal((await store.readLogin(rollbackIntent.tokenHash))?.status,'processing');
  assert.equal((await store.readSession(second.tokenHash))?.revokedAtMs,null);
  for (const googleSubject of ['synthetic-google-no-guard','synthetic-google-inactive']) {
    const deniedInput=await prepare({...newIdentity('personal',googleSubject)});
    await denied(store.complete(deniedInput));
    assert.deepEqual(await resolver.resolve(deniedInput.identity),{status:'inactive'});
    assert.equal(await store.readSession(deniedInput.sessionTokenHash),null);
  }
  const missingEmail=await prepare(newIdentity('personal',`no-email-${randomUUID()}`));
  const {verifiedEmail: _email,...withoutEmail}=missingEmail.identity;
  await assert.rejects(store.complete({...missingEmail,identity:withoutEmail}),error=>error instanceof KernelError);
  assert.deepEqual(await resolver.resolve(missingEmail.identity),{status:'missing'});
  const oneProofLease=await database.checkout();
  try {
    await oneProofLease.client.query('BEGIN');
    await oneProofLease.client.query("SELECT set_config('projed.verified_google_subject',$1,true)",[subject]);
    assert.equal((await oneProofLease.client.query('SELECT * FROM projed_core.google_identity_proofs WHERE google_subject=$1',[subject])).rowCount,1);
    await oneProofLease.client.query('ROLLBACK');
  } finally {oneProofLease.release();}

  const lease=await database.checkout();
  try {
    assert.equal((await lease.client.query('SELECT projed_core.actor_context_valid_v1() AS valid')).rows[0].valid,false);
    await lease.client.query('BEGIN');
    await lease.client.query(`SELECT set_config('projed.actor_local_user_id',$1,true),
      set_config('projed.actor_principal_id','principal:a',true),set_config('projed.actor_entry','main',true),
      set_config('projed.actor_context_id',$2,true)`,['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',randomUUID()]);
    for (const revision of ['', '0', '-1', '1e3', 'not-a-number', '9223372036854775808', '99999999999999999999']) {
      await lease.client.query("SELECT set_config('projed.actor_guard_revision',$1,true)",[revision]);
      assert.equal((await lease.client.query('SELECT projed_core.actor_context_valid_v1() AS valid')).rows[0].valid,false);
      assert.equal((await lease.client.query('SELECT * FROM projed_core.profiles')).rowCount,0);
    }
    await lease.client.query("SELECT set_config('projed.actor_guard_revision','1',true)");
    assert.equal((await lease.client.query('SELECT projed_core.actor_context_valid_v1() AS valid')).rows[0].valid,true);
    await lease.client.query('ROLLBACK');
    assert.equal((await lease.client.query('SELECT projed_core.actor_context_valid_v1() AS valid')).rows[0].valid,false);
    assert.equal((await lease.client.query('SELECT * FROM projed_core.app_sessions')).rowCount,0);
    assert.equal((await lease.client.query('SELECT * FROM projed_core.app_login_intents')).rowCount,0);
    assert.equal((await lease.client.query('SELECT projed_core.registration_scope_valid_v1() AS valid')).rows[0].valid,false);
    for (const sql of [
      "INSERT INTO projed_core.profiles(id,email,display_name) VALUES('11111111-1111-4111-8111-111111111112','untrusted@example.invalid','untrusted')",
      "INSERT INTO projed_core.google_identity_proofs(google_subject,local_user_id) VALUES('untrusted','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')",
      "INSERT INTO projed_core.account_authorization_guards(local_user_id,active,revision) VALUES('11111111-1111-4111-8111-111111111112',true,1)",
    ]) await assert.rejects(lease.client.query(sql),(error: unknown)=>(error as {code?:string}).code==='42501');
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
