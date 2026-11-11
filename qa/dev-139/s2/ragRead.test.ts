import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActorQueryPort } from '../../../server/actorTransaction.js';
import { KernelError } from '../../../server/errors.js';
import {
  hasIncompleteRagIndex,
  readLiveRagSnapshot,
  readRagKnowledge,
  resolveRagScope,
  writeRagAccessLog,
} from '../../../server/ragRead.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const CHUNK_ID = '44444444-4444-4444-8444-444444444444';

interface FakeResult {
  rows: unknown[];
  rowCount?: number;
}

function fakePort(handler: (text: string, values: readonly unknown[]) => FakeResult) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const port = {
    query: async (text: string, values: readonly unknown[] = []) => {
      calls.push({ text, values });
      const result = handler(text, values);
      return {
        rows: result.rows as never[],
        rowCount: result.rowCount ?? result.rows.length,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    },
  } as unknown as ActorQueryPort;
  return { port, calls };
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof KernelError && error.code === code;
}

test('RAG scope authorizes workspace readers and board-only guests on the exact board', async () => {
  const workspace = fakePort(text => text.includes('SELECT tenant.id::text AS id')
    ? { rows: [{ id: TENANT_ID, legacy_workspace_id: 'ws-legacy' }] }
    : { rows: [{ allowed: true }] });
  assert.deepEqual(await resolveRagScope(workspace.port, 'ws-legacy', null), {
    tenantId: TENANT_ID,
    projectId: null,
  });
  assert.match(workspace.calls[1]!.text, /actor_has_workspace_capability_v1\([^)]*'read_workspace'\)/u);

  const boardGuest = fakePort(text => {
    if (text.includes('SELECT tenant.id::text AS id')) {
      return { rows: [{ id: TENANT_ID, legacy_workspace_id: 'ws-legacy' }] };
    }
    if (text.includes('SELECT project.id::text AS id')) {
      return { rows: [{ id: PROJECT_ID, legacy_board_id: 'board-guest', tenant_id: TENANT_ID }] };
    }
    return { rows: [{ allowed: true }] };
  });
  assert.deepEqual(await resolveRagScope(boardGuest.port, 'ws-legacy', 'board-guest'), {
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
  });
  const capabilityCall = boardGuest.calls.at(-1)!;
  assert.match(capabilityCall.text, /actor_has_board_capability_v1\([^)]*'read_board'\)/u);
  assert.deepEqual(capabilityCall.values, [TENANT_ID, PROJECT_ID]);
});

test('RAG scope and vector validation fail closed before retrieving chunks', async () => {
  const denied = fakePort(text => text.includes('SELECT tenant.id::text AS id')
    ? { rows: [{ id: TENANT_ID, legacy_workspace_id: 'ws-legacy' }] }
    : { rows: [{ allowed: false }] });
  await assert.rejects(resolveRagScope(denied.port, 'ws-legacy', null), errorCode('ACCESS_DENIED'));

  let calls = 0;
  const noQuery = fakePort(() => { calls += 1; return { rows: [] }; });
  const scope = { tenantId: TENANT_ID, projectId: null };
  await assert.rejects(readRagKnowledge(noQuery.port, scope, [0.1], 0.2, 10), errorCode('DOMAIN_DATA_INVALID'));
  await assert.rejects(
    readRagKnowledge(noQuery.port, scope, Array.from({ length: 3072 }, (_, index) => index === 3 ? Number.NaN : 0.1), 0.2, 10),
    errorCode('DOMAIN_DATA_INVALID'),
  );
  await assert.rejects(
    readRagKnowledge(noQuery.port, scope, Array.from({ length: 3072 }, () => 1e100), 0.2, 10),
    errorCode('DOMAIN_DATA_INVALID'),
  );
  assert.equal(calls, 0);
});

test('RAG completeness uses visible current versions and rejects an invalid database result', async () => {
  const pending = fakePort(() => ({ rows: [{ incomplete: true }] }));
  assert.equal(await hasIncompleteRagIndex(pending.port, { tenantId: TENANT_ID, projectId: PROJECT_ID }), true);
  assert.deepEqual(pending.calls[0]!.values, [TENANT_ID, PROJECT_ID]);
  const complete = fakePort(() => ({ rows: [{ incomplete: false }] }));
  assert.equal(await hasIncompleteRagIndex(complete.port, { tenantId: TENANT_ID, projectId: null }), false);
  const malformed = fakePort(() => ({ rows: [] }));
  await assert.rejects(hasIncompleteRagIndex(malformed.port, { tenantId: TENANT_ID, projectId: null }), errorCode('DB_BOUNDARY_INVALID'));
});

test('RAG retrieval passes float32 values and selects only current, authorized embeddings before full cosine ranking', async () => {
  const fake = fakePort(() => ({ rows: [{
    scope_authorized: true,
    chunk_id: null,
    document_id: null,
    title: null,
    content: null,
    similarity: null,
    source_table: null,
    source_id: null,
    source_type: null,
  }] }));
  const vector = Array.from({ length: 3072 }, (_, index) => index === 0 ? 0.123456789 : 0.5);

  assert.deepEqual(await readRagKnowledge(fake.port, { tenantId: TENANT_ID, projectId: PROJECT_ID }, vector, 0.35, 10), []);
  const call = fake.calls[0]!;
  assert.match(call.text, /WITH authorized_scope AS MATERIALIZED/u);
  assert.match(call.text, /actor_has_board_capability_v1\([^)]*'read_board'\)/u);
  assert.match(call.text, /max\(candidate\.version\)/u);
  assert.match(call.text, /version\.content_hash = document\.content_hash/u);
  assert.match(call.text, /embedding\.provider = 'google'/u);
  assert.match(call.text, /embedding\.model = 'gemini-embedding-001'/u);
  assert.match(call.text, /embedding\.dimensions = 3072/u);
  assert.match(call.text, /embedding\.content_hash = document\.content_hash/u);
  assert.match(call.text, /FROM unnest\(query\.vector\) WITH ORDINALITY/u);
  assert.match(call.text, /NULLIF\([\s\S]*,\s*0\s*\)/u);
  assert.match(call.text, /ORDER BY scored\.similarity DESC, scored\.document_id, scored\.chunk_id/u);
  assert.deepEqual(call.values.slice(0, 2), [TENANT_ID, PROJECT_ID]);
  assert.equal((call.values[2] as number[]).length, 3072);
  assert.equal((call.values[2] as number[])[0], Math.fround(0.123456789));
  assert.equal(call.values[3], 0.35);
  assert.equal(call.values[4], 10);
});

test('live snapshot reads only current visible workspace sources and stays within the context budget', async () => {
  const fake = fakePort(() => ({ rows: [{
    scope_authorized: true,
    workspace_id: 'ws-legacy',
    workspace_title: 'Workspace',
    project_id: null,
    boards: [{ projectId: 'board-a', title: 'Board', titleTruncated: false }],
    tasks: [{ projectId: 'board-a', taskId: 'task-a', title: 'Task', status: 'in_progress', startDate: null, endDate: null, assigneeIds: [], assigneesTruncated: false }],
    dependencies: [],
    members: [{ projectId: 'board-a', userId: USER_ID, role: 'member', displayName: 'Member' }],
    boards_truncated: false,
    tasks_truncated: false,
    dependencies_truncated: false,
    members_truncated: false,
  }] }));

  const snapshot = await readLiveRagSnapshot(fake.port, { tenantId: TENANT_ID, projectId: null });
  const parsed = JSON.parse(snapshot) as Record<string, unknown>;
  assert.ok(Buffer.byteLength(snapshot, 'utf8') <= 64 * 1024);
  assert.equal((parsed.scope as Record<string, unknown>).requestedRange, 'workspace-visible-boards');
  assert.ok(Array.isArray(parsed.tasks));
  const sql = fake.calls[0]!.text;
  for (const table of ['projed_core.tenants', 'projed_core.projects', 'projed_core.wbs_items', 'projed_core.wbs_dependencies', 'projed_core.project_members']) {
    assert.ok(sql.includes(table), `expected visible source ${table}`);
  }
  assert.equal(/knowledge_records|tenant_members/u.test(sql), false);
  assert.match(sql, /LIMIT 251/u);
  assert.match(sql, /LIMIT 201/u);
  assert.match(sql, /item\.sort_order,\s*item\.created_at,\s*item\.id/u);
});

test('RAG audit writes a server UUID, query hash and safe metadata without raw query or answer', async () => {
  const fake = fakePort(() => ({ rows: [{ id: 'server-generated' }], rowCount: 1 }));
  const privateQuery = 'query-body-must-not-be-stored';
  await writeRagAccessLog(fake.port, { tenantId: TENANT_ID, projectId: PROJECT_ID }, {
    model: 'gemini-3.1-flash-lite',
    query: privateQuery,
    chunkIds: [CHUNK_ID],
    answerLength: 42,
  });

  const call = fake.calls[0]!;
  assert.match(call.text, /INSERT INTO projed_core\.llm_access_logs/u);
  assert.match(call.text, /current_actor_user_id_v1\(\)/u);
  assert.match(call.text, /'google'/u);
  assert.match(call.text, /response_metadata/u);
  assert.equal(call.values.includes(privateQuery), false);
  assert.equal(call.values[4], '4f169dde8d0443d8582e219c5049402be2d05539b7f31ce65e4dd094dca37521');
  assert.deepEqual(call.values[5], [CHUNK_ID]);
  assert.equal(call.values[6], 42);
});
