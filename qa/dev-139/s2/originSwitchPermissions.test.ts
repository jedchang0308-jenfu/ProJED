import assert from 'node:assert/strict';
import test from 'node:test';
import { compareOriginSwitchPermissions, normalizeOriginSwitchPermissions, originSwitchPermissionsEqual } from '../../../server/originSwitchPermissions.js';

const workspace = '11111111-1111-4111-8111-111111111111';
const board = '22222222-2222-4222-8222-222222222222';
const otherWorkspace = '33333333-3333-4333-8333-333333333333';
const source = () => ({ version: 1, workspaces: { [workspace]: { role: 'member', capabilities: ['read_workspace'] } },
  boards: { [board]: { workspaceId: workspace, role: 'member', capabilities: ['read_board', 'edit_task'] } },
  visibleWorkspaces: [workspace] });

test('permission comparison ignores role metadata, ordering and duplicates while retaining scope and actions', () => {
  const original = source();
  const next = { ...source(), capturedAt: 999, boards: { [board]: { workspaceId: workspace, role: 'admin',
    capabilities: ['edit_task', 'read_board', 'read_board'] } } };
  assert.equal(originSwitchPermissionsEqual(original, next), true);
  assert.deepEqual(compareOriginSwitchPermissions(original, next), { workspaceMatched: true, permissionsMatched: true });
});

test('matching scopes with lost write capability are not a successful destination proof', () => {
  const next = source(); next.boards[board]!.capabilities = ['read_board'];
  assert.deepEqual(compareOriginSwitchPermissions(source(), next), { workspaceMatched: true, permissionsMatched: false });
  assert.equal(originSwitchPermissionsEqual(source(), next), false);
});

test('same Board id in another Workspace and missing resources are refused', () => {
  const moved = source(); moved.boards[board]!.workspaceId = otherWorkspace; moved.visibleWorkspaces.push(otherWorkspace);
  assert.equal(compareOriginSwitchPermissions(source(), moved).workspaceMatched, false);
  assert.equal(compareOriginSwitchPermissions(source(), { version: 1, workspaces: {}, boards: {}, visibleWorkspaces: [] }).workspaceMatched, false);
});

test('newly granted destination capabilities do not hide loss of source rights', () => {
  const extra = source(); extra.boards[board]!.capabilities.push('delete_task');
  assert.equal(compareOriginSwitchPermissions(source(), extra).permissionsMatched, true);
  assert.equal(compareOriginSwitchPermissions(extra, source()).permissionsMatched, false);
  assert.equal(originSwitchPermissionsEqual(source(), extra), false);
});

test('external Board-only access remains valid without Workspace management rights', () => {
  const external = { ...source(), workspaces: {} };
  assert.deepEqual(compareOriginSwitchPermissions(external, external), { workspaceMatched: true, permissionsMatched: true });
});

test('malformed permission state cannot become a successful empty comparison', () => {
  for (const invalid of [null, { ...source(), version: 2 }, { ...source(), visibleWorkspaces: [] },
    { ...source(), boards: { [board]: { workspaceId: workspace, capabilities: [true] } } },
    { ...source(), workspaces: { invalid: { capabilities: [] } } }]) {
    assert.throws(() => compareOriginSwitchPermissions(source(), invalid), { code: 'IDENTITY_STATE_UNAVAILABLE' });
  }
});

test('normalization neither mutates the stored snapshot nor retains mutable references', () => {
  const value = source(); const before = JSON.stringify(value);
  const normalized = normalizeOriginSwitchPermissions(value);
  assert.equal(JSON.stringify(value), before);
  value.boards[board]!.capabilities.push('delete_task');
  assert.deepEqual(normalized.boards[board]?.capabilities, ['edit_task', 'read_board']);
  assert.equal(Object.isFrozen(normalized.boards), true);
});

test('UUID case is normalized but two conflicting entries for the same UUID are refused', () => {
  const letterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const scope = { role: 'member', capabilities: ['read_workspace'] };
  const lower = { version: 1, workspaces: { [letterId]: scope }, boards: {}, visibleWorkspaces: [letterId] };
  const upper = { ...lower, workspaces: { [letterId.toUpperCase()]: scope } };
  assert.equal(originSwitchPermissionsEqual(lower, upper), true);
  assert.throws(() => normalizeOriginSwitchPermissions({ ...lower,
    workspaces: { [letterId]: scope, [letterId.toUpperCase()]: { capabilities: [] } } }), { code: 'IDENTITY_STATE_UNAVAILABLE' });
});
