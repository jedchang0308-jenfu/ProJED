import assert from 'node:assert/strict';
import test from 'node:test';
import type { Client } from 'pg';
import { PERMISSION_CAPABILITIES } from '../../../server/domainRead.js';
import { TABLES, readSource, projectBoardPermissionSourceRows } from '../../../scripts/dev139-data-migration.js';

test('source projection applies DEV-104 retirement without modifying active permissions or source rows', async () => {
  const source = Object.freeze({ tenant_id: 'workspace', project_id: 'board', role: 'member',
    capabilities: Object.freeze(['read_board', 'collect_task', 'manage_task_reference', 'edit_task']),
    updated_at: '2026-09-04 00:00:00.123456+00' });
  const spec = TABLES.find(table => table.target === 'board_role_permissions')!;
  const client = { query: async (sql: string) => {
    assert.equal(sql, spec.sourceSql);
    return { rows: [source] };
  } } as unknown as Client;
  const projected = (await readSource(client, [spec])).get(spec.target)![0];
  assert.deepEqual(projected, { ...source, capabilities: ['read_board', 'manage_task_reference', 'edit_task'] });
  assert.deepEqual(source.capabilities, ['read_board', 'collect_task', 'manage_task_reference', 'edit_task']);
});

test('the retired-capability exception does not discard an unknown permission to bypass target validation', async () => {
  const spec = TABLES.find(table => table.target === 'board_role_permissions')!;
  const client = { query: async () => ({ rows: [{ tenant_id: 'workspace', project_id: 'board', role: 'member',
    capabilities: ['read_board', 'future_write'], updated_at: '2026-09-04 00:00:00+00' }] }) } as unknown as Client;
  assert.deepEqual((await readSource(client, [spec])).get(spec.target)![0].capabilities, ['read_board', 'future_write']);
});

test('only fixed owner abilities are completed and unknown owner permissions remain rejectable', async () => {
  const spec = TABLES.find(table => table.target === 'board_role_permissions')!;
  const rows = ['owner', 'admin', 'viewer'].map(role => ({ tenant_id: 'workspace', project_id: 'board', role,
    capabilities: ['read_board', 'unknown_future_write'], updated_at: '2026-09-04 00:00:00+00' }));
  const client = { query: async () => ({ rows }) } as unknown as Client;
  const projected = (await readSource(client, [spec])).get(spec.target)!;
  assert.deepEqual(new Set(projected[0].capabilities as string[]), new Set([...PERMISSION_CAPABILITIES, 'unknown_future_write']));
  assert.deepEqual(projected[1].capabilities, rows[1].capabilities);
  assert.deepEqual(projected[2].capabilities, rows[2].capabilities);
  assert.deepEqual(rows[0].capabilities, ['read_board', 'unknown_future_write']);
});

test('only absent roles receive current defaults, while a custom empty role stays empty', () => {
  const project = { id: 'board', tenant_id: 'workspace', updated_at: '2026-09-04 00:00:00.123456+00' };
  const viewer = { tenant_id: 'workspace', project_id: 'board', role: 'viewer', capabilities: [], updated_at: project.updated_at };
  const projected = projectBoardPermissionSourceRows([viewer], [project]);
  assert.equal(projected.length, 5);
  assert.deepEqual(projected.find(row => row.role === 'viewer'), viewer);
  assert.deepEqual(new Set(projected.find(row => row.role === 'owner')!.capabilities as string[]), new Set(PERMISSION_CAPABILITIES));
  assert.ok((projected.find(row => row.role === 'member')!.capabilities as string[]).includes('manage_task_reference'));
  assert.ok(projected.every(row => row.updated_at === project.updated_at));
});
