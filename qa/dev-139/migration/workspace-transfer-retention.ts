import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { CollaborationWriteRepository } from '../../../server/collaborationWrite.js';
import { loadRuntimeConfig, sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { DomainReadRepository } from '../../../server/domainRead.js';
import { KernelError } from '../../../server/errors.js';
import { TaskTrackingRepository } from '../../../server/taskTracking.js';

const config = loadRuntimeConfig();
assert.equal(config.env, 'disposable');
const adminUrl = new URL(process.env.PROJED_QA_TARGET_ADMIN_URL ?? '');
assert.equal(adminUrl.hostname, '127.0.0.1');
assert.equal(Number(adminUrl.port), config.binding.databasePort);
assert.equal(adminUrl.pathname, `/${config.binding.databaseName}`);
assert.equal(adminUrl.username, 'postgres');
assert.equal(adminUrl.search, '');
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const database = new RuntimeDatabase(config);
const commands = new CollaborationWriteRepository();
const tracking = new TaskTrackingRepository();
const actor: ServerActorV1 = {
  principalId: 'qa-migration-owner',
  localUserId: '11111111-1111-4111-8111-111111111111',
  entry: 'main', contextId: randomUUID(), expiresAtMs: Date.now() + 60_000,
  accountGuardRevision: '1',
};
let createdAccountGuard = false;
const sourceWorkspace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceBoard = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rollback = new KernelError('TRANSACTION_USAGE_INVALID', 'QA rollback after assertions', 409);

await admin.connect();
try {
  await database.assertRuntimeBoundary(config.profile.migrations.map(({ version, path }) => ({
    version, checksum: sha256(readFileSync(path)),
  })));
  const guardInsert = await admin.query<{ local_user_id: string }>(`INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision)
    VALUES ($1::uuid, true, 1) ON CONFLICT (local_user_id) DO NOTHING RETURNING local_user_id::text`, [actor.localUserId]);
  createdAccountGuard = guardInsert.rowCount === 1;
  if (!createdAccountGuard) {
    const existingGuard = await admin.query<{ active: boolean; revision: string }>(
      'SELECT active, revision::text FROM projed_core.account_authorization_guards WHERE local_user_id = $1::uuid',
      [actor.localUserId],
    );
    if (existingGuard.rows.length !== 1 || existingGuard.rows[0]!.active !== true || existingGuard.rows[0]!.revision !== '1') {
      throw new Error('Existing owner account guard is not active at revision one');
    }
  }

  await assert.rejects(runActorTransaction(database, config, actor, async port => {
    const workspaces = await new DomainReadRepository().listWorkspaces(port);
    assert.equal(workspaces.some(workspace => workspace.id === 'orphan-ws'), false);
    const target = await commands.createWorkspace(port, { title: 'QA retained data transfer' });
    const blocked = await commands.previewBoardTransfer(port, sourceWorkspace, sourceBoard, target.id);
    assert.equal(blocked.blocked, true, 'existing cross-board reference must block transfer');
    await tracking.remove(port, sourceWorkspace, {
      operationId: randomUUID(), sourcePlacementId: '67890123-1234-4234-8234-123456789006',
      expectedRevision: 2,
      expectedSubtreeIds: ['67890123-1234-4234-8234-123456789006'],
    });
    const preview = await commands.previewBoardTransfer(port, sourceWorkspace, sourceBoard, target.id);
    assert.equal(preview.blocked, false);
    assert.equal(preview.counts.documents, 2, 'preview counts only the actor-visible root documents');
    assert.equal(preview.counts.ragDocumentsToResync, 2);
    await commands.moveBoardToWorkspace(port, sourceWorkspace, sourceBoard, {
      targetWorkspaceId: target.id, expectedBoardTitle: preview.boardTitle,
    });
    const logs = await port.query<{ tenant_id: string; metadata: unknown; created_at: Date }>(`
      SELECT tenant_id::text, response_metadata AS metadata, created_at
        FROM projed_core.llm_access_logs WHERE id = '01234567-1234-4234-8234-123456789011'
    `);
    assert.equal(logs.rows.length, 1);
    assert.equal(logs.rows[0]!.tenant_id, target.id);
    assert.deepEqual(logs.rows[0]!.metadata, { resultCount: 1, usage: { inputTokens: 7 } });
    assert.equal(logs.rows[0]!.created_at.toISOString(), '2026-01-02T00:00:00.000Z');
    const preferences = await port.query<{ tenant_id: string; filters: unknown; preference_version: number }>(`
      SELECT tenant_id::text, filters, preference_version
        FROM projed_core.account_board_task_filter_preferences WHERE project_id = $1::uuid
    `, [sourceBoard]);
    assert.equal(preferences.rows.length, 1);
    assert.equal(preferences.rows[0]!.tenant_id, target.id);
    assert.deepEqual(preferences.rows[0]!.filters, { status: ['todo'] });
    assert.equal(preferences.rows[0]!.preference_version, 6);
    const corpus = await port.query<{ tenant_id: string; original_metadata: boolean; original_time: boolean; children: boolean }>(`
      SELECT document.tenant_id::text,
             document.metadata = '9007199254740993.1234567890123456789'::jsonb AS original_metadata,
             document.created_at = '2026-02-01T10:11:12.123456Z'::timestamptz AS original_time,
             EXISTS (SELECT 1 FROM projed_core.document_versions version
               JOIN projed_core.document_chunks chunk ON chunk.document_version_id = version.id
               JOIN projed_core.document_embeddings embedding ON embedding.chunk_id = chunk.id
              WHERE version.id = 'd1000000-0000-4000-8000-000000000001'
                AND version.document_id = document.id
                AND version.tenant_id = document.tenant_id
                AND chunk.tenant_id = document.tenant_id
                AND embedding.tenant_id = document.tenant_id
                AND cardinality(embedding.embedding) = 3072) AS children
        FROM projed_core.documents document
       WHERE document.id = 'd0000000-0000-4000-8000-000000000001'
    `);
    assert.equal(corpus.rows.length, 1);
    assert.equal(corpus.rows[0]!.tenant_id, target.id);
    assert.equal(corpus.rows[0]!.original_metadata, true);
    assert.equal(corpus.rows[0]!.original_time, true);
    assert.equal(corpus.rows[0]!.children, true);
    throw rollback;
  }), error => error === rollback);
  const original = await admin.query<{ tenant_id: string }>(`
    SELECT tenant_id::text FROM projed_core.llm_access_logs
     WHERE id = '01234567-1234-4234-8234-123456789011'
  `);
  assert.equal(original.rows[0]!.tenant_id, sourceWorkspace);
  console.log(JSON.stringify({ status: 'PASS', evidenceLevel: 'DEV139_LOCAL_PRODUCT_COMMAND_RETENTION',
    checks: ['normal-reference-removal', 'normal-workspace-create', 'normal-board-transfer',
      'llm-log-scope-and-evidence-retained', 'account-preferences-retained',
      'document-preview-and-cascade-retained', 'transaction-rollback'] }));
} finally {
  await database.end();
  try {
    if (createdAccountGuard) {
      await admin.query('DELETE FROM projed_core.account_authorization_guards WHERE local_user_id = $1::uuid', [actor.localUserId]);
    }
  }
  finally { await admin.end(); }
}
