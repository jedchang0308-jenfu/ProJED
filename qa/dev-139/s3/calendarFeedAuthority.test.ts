import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { runCalendarFeedTransaction } from '../../../server/calendarFeedTransaction.js';
import { KernelError } from '../../../server/errors.js';

const owner = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';
const boardId = '33333333-3333-4333-8333-333333333333';
const tenantId = '44444444-4444-4444-8444-444444444444';
const config = { env: 'managed', profile: { runtime: { timeouts: { transactionMillis: 5000, statementMillis: 2000, lockMillis: 1000, idleInTransactionMillis: 5000 } } } } as RuntimeConfig;
function fixture(options: { state?: string; proofCount?: number; active?: boolean; subscriptionActive?: boolean; missing?: boolean; qualification?: boolean } = {}) {
  const calls: Array<{ sql: string; values: readonly unknown[] }> = []; const releases: unknown[] = [];
  let permissions: Record<string, unknown> | undefined;
  const database = { async checkout() { return { release(destroy?: boolean) { releases.push(destroy); }, client: {
    async query(sql: string, values: readonly unknown[] = []) {
      calls.push({ sql, values });
      if (sql.includes('FROM projed_core.calendar_subscriptions')) return { rows: options.missing ? [] : [{ id: subscriptionId, owner_user_id: owner, is_active: options.subscriptionActive !== false, expires_at: null }] };
      if (sql.includes('FROM projed_core.account_authorization_guards')) return { rows: [{ active: options.active !== false, revision: '3' }] };
      if (sql.includes('FROM projed_core.google_identity_proofs')) return { rows: Array.from({ length: options.proofCount ?? 1 }, () => ({ google_subject: 'verified-google-subject' })) };
      if (sql.includes('read_projed_calendar_principal_v1')) return { rows: [{ contract_version: 'orgmaster.projed-calendar-principal.v1', google_subject: 'verified-google-subject', principal_id: 'principal-external', principal_kind: 'personal', status: options.state ?? 'UNREGISTERED' }] };
      if (sql.includes('WHERE tenant.owner_id=projed_core.current_actor_user_id_v1()')) return { rows: [{ id: boardId, tenant_id: tenantId, can_manage: false }] };
      if (sql.includes('FROM projed_core.tenants tenant')) return { rows: [] };
      if (sql.includes('FROM projed_core.projects board')) return { rows: [{ id: boardId, workspace_id: tenantId, board_role: 'member', inherited_role: null, capabilities: ['read_board','create_task'], owns_workspace: false, external_invite_id: subscriptionId, approved_role: 'viewer', direct_capabilities: ['read_board','create_task'], approved_capabilities: ['read_board'] }] };
      if (sql.includes('read_projed_external_qualification_v1')) return { rows: options.qualification === false ? [] : [{ allowed: 1 }], rowCount: options.qualification === false ? 0 : 1 };
      if (sql.includes("set_config('projed.session_permissions',$1")) permissions = JSON.parse(values[0] as string);
      if (sql.includes('actor_context_valid_v1() AS valid')) return { rows: [{ valid: true }] };
      return { rows: [], rowCount: 0 };
    },
  } }; } } as unknown as RuntimeDatabase;
  return { database, calls, releases, permissions: () => permissions };
}
test('managed Calendar bearer is its own authority and preserves only owned legacy scope without a human Session', async () => {
  const h = fixture(); const result = await runCalendarFeedTransaction(h.database, config, 'a'.repeat(64), async port => { await port.query('SELECT 1'); return 'feed'; });
  assert.equal(result, 'feed'); assert.equal(h.calls.some(call => call.sql.includes('FROM projed_core.app_sessions')), false);
  assert.deepEqual(h.permissions()?.visibleWorkspaces, [tenantId]);
  assert.deepEqual(Object.keys(h.permissions()?.boards as object), [boardId]);
  assert.ok(h.calls.findIndex(call => call.sql.includes('projed:runtime-transaction:v1')) < h.calls.findIndex(call => call.sql.includes('FOR SHARE')));
  assert.equal(h.calls.at(-1)?.sql, 'COMMIT');
});
test('known external principal reads only its currently approved Board capabilities', async () => {
  const h = fixture({ state: 'ACTIVE' }); await runCalendarFeedTransaction(h.database, config, 'a'.repeat(64), async () => 'feed');
  const boards = h.permissions()?.boards as Record<string, { capabilities: string[] }>;
  assert.deepEqual(boards[boardId]?.capabilities, ['read_board']);
  assert.ok(h.calls.some(call => call.sql.includes('read_projed_external_qualification_v1')));
});
test('missing current external qualification freezes shared scope', async () => {
  const h = fixture({ state: 'ACTIVE', qualification: false }); await runCalendarFeedTransaction(h.database, config, 'a'.repeat(64), async () => 'feed');
  assert.deepEqual(h.permissions()?.boards, {});
});
for (const [name, options, status] of [
  ['disabled account', { active: false }, 410], ['disabled subscription', { subscriptionActive: false }, 410],
  ['rotated or deleted token', { missing: true }, 404], ['centrally disabled Principal', { state: 'INACTIVE' }, 410],
  ['unknown producer state', { state: 'UNAVAILABLE' }, 503], ['missing Google proof', { proofCount: 0 }, 503],
  ['ambiguous Google proof', { proofCount: 2 }, 503],
] as const) test(`Calendar bearer rejects ${name}`, async () => {
  const h = fixture(options);
  await assert.rejects(runCalendarFeedTransaction(h.database, config, 'a'.repeat(64), async () => assert.fail('must not expose a read port')), (error: unknown) => error instanceof KernelError && error.httpStatus === status);
  assert.equal(h.calls.at(-1)?.sql, 'ROLLBACK');
});
test('machine callback cannot obtain a mutation or transaction-control port', async () => {
  for (const sql of ['UPDATE projed_core.projects SET title=title', 'SELECT 1; UPDATE projed_core.projects SET title=title', 'SELECT set_config(\'projed.actor_local_user_id\',\'other\',true)', 'COMMIT']) {
    const h = fixture(); await assert.rejects(runCalendarFeedTransaction(h.database, config, 'a'.repeat(64), port => port.query(sql)), /Calendar read port is unavailable/);
    assert.equal(h.calls.at(-1)?.sql, 'ROLLBACK');
  }
});
test('malformed bearer is rejected before database checkout', async () => {
  const h = fixture(); await assert.rejects(runCalendarFeedTransaction(h.database, config, 'wrong', async () => 'feed'));
  assert.equal(h.calls.length, 0);
});
