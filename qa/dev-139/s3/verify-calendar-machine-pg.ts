import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { buildCalendarFeed, CalendarRepository, calendarTokenHash } from '../../../server/calendar.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { DomainWriteRepository } from '../../../server/domainWrite.js';
import { KernelError } from '../../../server/errors.js';

/** Actual ProJED 0048/RLS/managed feed against the existing task-owned cluster.
 * The central producer is explicitly synthetic here; OrgMaster separately
 * tests its real point reader and global disable/restore transaction. */
export async function verifyCalendarMachinePostgres(database: RuntimeDatabase, config: RuntimeConfig,
  actor: ServerActorV1, tokenHash: string, projectId: string, tenantId: string) {
  const adminUrl = process.env.PROJED_QA_MEETING_ADMIN_URL;
  if (!adminUrl) throw new Error('CALENDAR_MACHINE_FIXTURE_ADMIN_REQUIRED');
  const target = new URL(adminUrl);
  if (target.hostname !== '127.0.0.1' || !/^\/dev139_s3_[a-f0-9]{32}$/u.test(target.pathname)
    || target.pathname !== new URL(config.databaseUrl).pathname || target.port !== new URL(config.databaseUrl).port) throw new Error('CALENDAR_MACHINE_FIXTURE_TARGET_INVALID');
  const admin = new pg.Client({ connectionString: adminUrl }); await admin.connect();
  const calendar = new CalendarRepository(); const writer = new DomainWriteRepository();
  const managed = { ...config, env: 'managed' } as RuntimeConfig;
  const inviteId = randomUUID(); const ownTaskRef = `calendar-machine-${randomUUID()}`;
  let ownId: string | undefined; let schemaOwned = false; let taskCreated = false;
  const reject = (work: Promise<unknown>, status: number) => assert.rejects(work, error => error instanceof KernelError && error.httpStatus === status);
  try {
    assert.match((await admin.query('SELECT current_database() name')).rows[0].name, /^dev139_s3_[a-f0-9]{32}$/u);
    assert.equal((await admin.query("SELECT to_regnamespace('orgmaster_contract') name")).rows[0].name, null);
    await admin.query(`CREATE SCHEMA orgmaster_contract;
      CREATE TABLE orgmaster_contract.calendar_machine_fixture(singleton boolean PRIMARY KEY DEFAULT true,status text NOT NULL,qualified boolean NOT NULL DEFAULT true,board_id text);
      INSERT INTO orgmaster_contract.calendar_machine_fixture VALUES(true,'UNREGISTERED',true,NULL);
      CREATE FUNCTION orgmaster_contract.read_projed_calendar_principal_v1(text)
      RETURNS TABLE(contract_version text,google_subject text,principal_id text,principal_kind text,status text)
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
       SELECT 'orgmaster.projed-calendar-principal.v1',$1,'principal:a','personal',fixture.status
       FROM orgmaster_contract.calendar_machine_fixture fixture $$;
      CREATE FUNCTION orgmaster_contract.read_projed_external_qualification_v1(text,text)
      RETURNS TABLE(contract_version text,invitation_id text,principal_id text,google_subject text,board_id text,role text,status text)
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
       SELECT 'orgmaster.projed-external-qualification.v1',$1,$2,'synthetic-google-a',
         fixture.board_id,'member',CASE WHEN fixture.qualified THEN 'ACTIVE' ELSE 'INACTIVE' END
       FROM orgmaster_contract.calendar_machine_fixture fixture $$;
      REVOKE ALL ON FUNCTION orgmaster_contract.read_projed_calendar_principal_v1(text),orgmaster_contract.read_projed_external_qualification_v1(text,text) FROM PUBLIC;
      GRANT USAGE ON SCHEMA orgmaster_contract TO projed_runtime_disposable;
      GRANT EXECUTE ON FUNCTION orgmaster_contract.read_projed_calendar_principal_v1(text),orgmaster_contract.read_projed_external_qualification_v1(text,text) TO projed_runtime_disposable`);
    schemaOwned = true;
    await admin.query('UPDATE orgmaster_contract.calendar_machine_fixture SET board_id=$1', [projectId]);
    await runActorTransaction(database, config, actor, port => writer.createTask(port, 'ws-a', 'board-a', {
      id: ownTaskRef, title: 'Calendar machine private own', parentId: null, status: 'todo', assigneeIds: [actor.localUserId],
      startDate: '2026-10-27', endDate: '2026-10-28', nodeType: 'task', order: 1,
    }));
    taskCreated = true;
    const own = await runActorTransaction(database, config, actor, port => calendar.create(port, { name: 'Calendar machine own', filters: {
      version: 1, scope_type: 'board', workspace_ids: ['11111111-1111-4111-8111-111111111111'], project_ids: ['21111111-1111-4111-8111-111111111111'],
      assignee: { type: 'me' }, statuses: ['todo'], date_types: ['due_date'],
    } }));
    ownId = own.subscription.id; const ownToken = /\/([^/]+)\.ics$/u.exec(own.feedUrl)![1]!;
    const ownHash = calendarTokenHash(ownToken);
    assert.match(await buildCalendarFeed(database, managed, ownHash), /Calendar machine private own/u);
    assert.equal((await buildCalendarFeed(database, managed, tokenHash)).includes('Calendar feed visible'), false);
    const direct = await database.checkout();
    try { assert.equal((await direct.client.query('SELECT google_subject FROM projed_core.google_identity_proofs')).rows.length, 0); }
    finally { direct.release(); }
    await admin.query("UPDATE orgmaster_contract.calendar_machine_fixture SET status='ACTIVE'");
    await admin.query(`INSERT INTO projed_core.board_invites(id,tenant_id,project_id,legacy_workspace_id,legacy_board_id,email,token_hash,default_role,status,invited_by,expires_at,accepted_at,
      external_inviter_principal_id,external_recipient_principal_id,external_recipient_user_id)
      VALUES($1,$2,$3,'ws-b','board-shared','calendar-machine@example.invalid',$4,'member','accepted',$5,clock_timestamp()-interval '1 day',clock_timestamp()-interval '2 days',
      'principal:b','principal:a',$6)`, [inviteId,tenantId,projectId,'d'.repeat(64),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',actor.localUserId]);
    assert.match(await buildCalendarFeed(database, managed, tokenHash), /Calendar feed visible/u);
    assert.equal((await buildCalendarFeed(database, managed, tokenHash)).includes('B secret'), false);
    await admin.query('UPDATE orgmaster_contract.calendar_machine_fixture SET qualified=false');
    assert.equal((await buildCalendarFeed(database, managed, tokenHash)).includes('Calendar feed visible'), false);
    await admin.query('UPDATE orgmaster_contract.calendar_machine_fixture SET qualified=true');
    await admin.query('UPDATE projed_core.board_invites SET external_access_revoked_at=clock_timestamp() WHERE id=$1', [inviteId]);
    assert.equal((await buildCalendarFeed(database, managed, tokenHash)).includes('Calendar feed visible'), false);
    await admin.query("UPDATE orgmaster_contract.calendar_machine_fixture SET status='INACTIVE'");
    await reject(buildCalendarFeed(database, managed, ownHash), 410);
    await admin.query("UPDATE orgmaster_contract.calendar_machine_fixture SET status='UNAVAILABLE'");
    await reject(buildCalendarFeed(database, managed, ownHash), 503);
    await admin.query("UPDATE orgmaster_contract.calendar_machine_fixture SET status='UNREGISTERED'");
    assert.match(await buildCalendarFeed(database, managed, ownHash), /Calendar machine private own/u);
    await admin.query('UPDATE projed_core.calendar_subscriptions SET is_active=false WHERE id=$1', [ownId]);
    await reject(buildCalendarFeed(database, managed, ownHash), 410);
    await admin.query('UPDATE projed_core.calendar_subscriptions SET is_active=true,token_hash=$2 WHERE id=$1', [ownId,'e'.repeat(64)]);
    await reject(buildCalendarFeed(database, managed, ownHash), 404);
    await runActorTransaction(database, config, actor, port => calendar.delete(port, ownId!)); ownId = undefined;
    await reject(buildCalendarFeed(database, managed, 'e'.repeat(64)), 404);
  } finally {
    if (ownId) await admin.query('DELETE FROM projed_core.calendar_subscriptions WHERE id=$1', [ownId]);
    await admin.query('DELETE FROM projed_core.board_invites WHERE id=$1', [inviteId]);
    if (taskCreated) await runActorTransaction(database, config, actor, port => writer.deleteTask(port, 'ws-a', 'board-a', ownTaskRef));
    if (schemaOwned) await admin.query('DROP SCHEMA orgmaster_contract CASCADE'); await admin.end();
  }
}
