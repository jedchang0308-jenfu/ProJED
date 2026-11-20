import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { CalendarRepository, calendarTokenHash } from '../../../server/calendar.js';
import { loadRuntimeConfig, sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { DomainWriteRepository } from '../../../server/domainWrite.js';
import { verifyCalendarMachinePostgres } from './verify-calendar-machine-pg.js';

const config = loadRuntimeConfig();
const database = new RuntimeDatabase(config);
const actorA: ServerActorV1 = { principalId: 'principal:a', localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', entry: 'main',
  contextId: '51111111-1111-4111-8111-111111111111', expiresAtMs: Date.now() + 600_000, accountGuardRevision: '1' };
const actorB: ServerActorV1 = { ...actorA, principalId: 'principal:b', localUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', contextId: '52222222-2222-4222-8222-222222222222' };
const calendar = new CalendarRepository(); const writer = new DomainWriteRepository();
let subscriptionId: string | undefined; let taskCreated = false;
try {
  await database.assertRuntimeBoundary(config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) })));
  await runActorTransaction(database, config, actorB, port => writer.createTask(port, 'ws-b', 'board-shared', {
    id: 'calendar-feed-machine-visible', title: 'Calendar feed visible', parentId: null, status: 'todo', assigneeIds: [actorA.localUserId],
    startDate: '2026-10-27', endDate: '2026-10-28', nodeType: 'task', order: 9,
  })); taskCreated = true;
  const created = await runActorTransaction(database, config, actorA, port => calendar.create(port, { name: 'Calendar machine shared', filters: {
    scope_type: 'board', workspace_ids: ['12222222-2222-4222-8222-222222222222'], project_ids: ['22222222-2222-4222-8222-222222222222'],
    assignee: { type: 'me' }, date_types: ['due_date'],
  } }));
  subscriptionId = created.subscription.id;
  const token = /\/([^/]+)\.ics$/u.exec(created.feedUrl)![1]!;
  const hash = calendarTokenHash(token);
  if (hash !== createHash('sha256').update(token).digest('hex')) throw new Error('CALENDAR_MACHINE_TOKEN_HASH_MISMATCH');
  await verifyCalendarMachinePostgres(database, config, actorA, hash,
    '22222222-2222-4222-8222-222222222222', '12222222-2222-4222-8222-222222222222');
  console.log(JSON.stringify({ status: 'PASS', scope: 'CALENDAR_MACHINE_LOCAL_ACCEPTANCE', checks: [
    'managed-bearer-without-human-session', 'legacy-owned-private-scope', 'legacy-shared-scope-frozen',
    'current-external-qualification', 'private-board-isolation', 'central-disable', 'producer-unknown-deny',
    'owner-revocation', 'expired-invite-receipt-continuity', 'disable-rotate-delete-original-token', 'pool-context-cleared',
  ] }));
} finally {
  if (subscriptionId) await runActorTransaction(database, config, actorA, port => calendar.delete(port, subscriptionId!));
  if (taskCreated) await runActorTransaction(database, config, actorB, port => writer.deleteTask(port, 'ws-b', 'board-shared', 'calendar-feed-machine-visible'));
  await database.end();
}
