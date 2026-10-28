import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';

import type { ActorQueryPort } from '../../../server/actorTransaction.js';
import { KernelError } from '../../../server/errors.js';
import {
  buildKnowledgeRecordRagContent,
  chunkKnowledgeRecordRagContent,
  hashKnowledgeRecordRagContent,
  reconcileKnowledgeRecordMirror,
  type KnowledgeRecordRagPort,
} from '../../../server/knowledgeRecordRagMirror.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RECORD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCUMENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VERSION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const JOB_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const TASK_ID = 'task-legacy-17';

interface QueryCapture {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakeOptions {
  readonly record?: Record<string, unknown>;
  readonly links?: Array<Record<string, unknown>>;
  readonly documents?: Array<Record<string, unknown>>;
  readonly versions?: Array<Record<string, unknown>>;
  readonly chunks?: Array<Record<string, unknown>>;
  readonly jobs?: Array<Record<string, unknown>>;
  readonly failOn?: RegExp;
}

function pgResult<R extends QueryResultRow>(rows: R[], rowCount = rows.length): QueryResult<R> {
  return { rows, rowCount, command: 'SELECT', oid: 0, fields: [] };
}

function baseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: RECORD_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    record_type: 'meeting',
    title: 'Planning review',
    content: 'Decisions and follow-ups.',
    participants_text: 'Ada, Lin',
    occurred_at: '2026-10-29 10:00:00+00',
    started_at: null,
    ended_at: null,
    recorded_by: null,
    created_by: '11111111-1111-4111-8111-111111111111',
    updated_by: '22222222-2222-4222-8222-222222222222',
    status: 'published',
    visibility: 'project',
    rag_enabled: false,
    source_document_id: null,
    actor_can_write: true,
    ...overrides,
  };
}

function baseDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    source_type: 'meeting_note',
    source_table: 'knowledge_records',
    source_id: RECORD_ID,
    content_hash: null,
    visibility: 'project',
    rag_enabled: false,
    ...overrides,
  };
}

function fakePort(options: FakeOptions = {}) {
  const queries: QueryCapture[] = [];
  const authorization: Array<{ kind: string; values: string[] }> = [];
  const record = options.record ?? baseRecord();
  const links = options.links ?? [{ node_id: TASK_ID, item_exists: true }];
  const documents = options.documents ?? [];
  const versions = options.versions ?? [];
  const chunks = options.chunks ?? [];
  const jobs = options.jobs ?? [];

  const query = async <R extends QueryResultRow>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<R>> => {
    const normalized = sql.replace(/\s+/gu, ' ').trim();
    queries.push({ sql: normalized, values });
    if (options.failOn?.test(normalized)) throw new Error('simulated query failure');

    let rows: Array<Record<string, unknown>> = [];
    let rowCount = 0;
    if (/FROM projed_core\.knowledge_records record/u.test(normalized)) {
      rows = [record];
      rowCount = 1;
    } else if (/FROM projed_core\.record_task_links link/u.test(normalized)) {
      rows = links;
      rowCount = rows.length;
    } else if (/FROM projed_core\.documents document/u.test(normalized)) {
      rows = documents;
      rowCount = rows.length;
    } else if (/FROM projed_core\.document_versions/u.test(normalized)) {
      rows = versions;
      rowCount = rows.length;
    } else if (/FROM projed_core\.document_chunks/u.test(normalized)) {
      rows = chunks;
      rowCount = rows.length;
    } else if (/FROM projed_core\.rag_sync_jobs/u.test(normalized)) {
      rows = jobs;
      rowCount = rows.length;
    } else if (/INSERT INTO projed_core\.rag_sync_jobs/u.test(normalized)
        || /INSERT INTO projed_core\.documents/u.test(normalized)
        || /INSERT INTO projed_core\.document_versions/u.test(normalized)
        || /INSERT INTO projed_core\.document_chunks/u.test(normalized)
        || /UPDATE projed_core\.knowledge_records/u.test(normalized)
        || /UPDATE projed_core\.documents/u.test(normalized)) {
      rowCount = /INSERT INTO projed_core\.document_chunks/u.test(normalized)
        ? (values.length / 8)
        : 1;
    }
    return pgResult(rows as unknown as R[], rowCount);
  };

  const port = {
    query: query as ActorQueryPort['query'],
    async authorizeRecordRagMutation(tenantId: string, projectId: string, recordId: string) {
      authorization.push({ kind: 'record', values: [tenantId, projectId, recordId] });
    },
    async authorizeRagJobMutation(tenantId: string, documentId: string, jobId: string) {
      authorization.push({ kind: 'job', values: [tenantId, documentId, jobId] });
    },
  } as unknown as KnowledgeRecordRagPort;

  return { port, queries, authorization };
}

function recordMetadata() {
  return {
    recordType: 'meeting',
    recordId: RECORD_ID,
    linkedTaskIds: [TASK_ID],
    occurredAt: '2026-10-29 10:00:00+00',
    startedAt: null,
    endedAt: null,
    participantsText: 'Ada, Lin',
  };
}

test('record source builder preserves the legacy field order and uses tagged SHA-256', () => {
  const source = {
    recordType: 'meeting' as const,
    title: 'Planning review',
    content: 'Decisions and follow-ups.',
    occurredAt: '2026-10-29 10:00:00+00',
    startedAt: null,
    endedAt: null,
    participantsText: 'Ada, Lin',
  };
  const content = buildKnowledgeRecordRagContent(source, [TASK_ID]);
  assert.equal(content, [
    'Title: Planning review',
    'Type: meeting note',
    'Occurred at: 2026-10-29 10:00:00+00',
    'Participants: Ada, Lin',
    'Linked task ids: task-legacy-17',
    'Decisions and follow-ups.',
  ].join('\n'));
  const expectedHash = createHash('sha256').update(content, 'utf8').digest('hex');
  assert.equal(hashKnowledgeRecordRagContent(content),
    'sha256-v1-' + Buffer.byteLength(content, 'utf8') + '-' + expectedHash);
  assert.notEqual(hashKnowledgeRecordRagContent(content), hashKnowledgeRecordRagContent(content + ' '));
});

test('legacy 2800-character chunking is preserved and empty source has one empty chunk', () => {
  const content = 'x'.repeat(5_601);
  const chunks = chunkKnowledgeRecordRagContent(content);
  assert.deepEqual(chunks.map(chunk => [chunk.chunkIndex, chunk.content.length, chunk.tokenCount]), [
    [0, 2_800, 700],
    [1, 2_800, 700],
    [2, 1, 1],
  ]);
  assert.deepEqual(chunkKnowledgeRecordRagContent(''), [
    { chunkIndex: 0, content: '', tokenCount: 0 },
  ]);
});

test('published record creates scoped document, version, batched chunks, back-reference, and pending job in order', async () => {
  const content = 'x'.repeat(2_800 * 50 + 1);
  const db = fakePort({ record: baseRecord({ content }) });
  const result = await reconcileKnowledgeRecordMirror(db.port, {
    tenantId: TENANT_ID, projectId: PROJECT_ID, recordId: RECORD_ID,
  });

  assert.equal(result.eligible, true);
  if (!result.eligible) throw new Error('Expected an eligible mirror');
  assert.equal(result.state, 'pending');
  assert.equal(result.version, 1);
  assert.match(result.contentHash, /^sha256-v1-[0-9]+-[a-f0-9]{64}$/u);

  const sql = db.queries.map(query => query.sql);
  const documentInsert = sql.findIndex(statement => /INSERT INTO projed_core\.documents/u.test(statement));
  const versionInsert = sql.findIndex(statement => /INSERT INTO projed_core\.document_versions/u.test(statement));
  const chunkInserts = sql.map((statement, index) => ({ statement, index }))
    .filter(item => /INSERT INTO projed_core\.document_chunks/u.test(item.statement));
  const recordLink = sql.findIndex(statement => /UPDATE projed_core\.knowledge_records/u.test(statement));
  const jobInsert = sql.findIndex(statement => /INSERT INTO projed_core\.rag_sync_jobs/u.test(statement));
  assert.ok(documentInsert >= 0 && documentInsert < recordLink);
  assert.match(sql[recordLink]!, /updated_by = projed_core\.current_actor_user_id_v1\(\)/u);
  assert.ok(recordLink < versionInsert && versionInsert < chunkInserts[0]!.index);
  assert.ok(chunkInserts[0]!.index < jobInsert);
  assert.equal(chunkInserts.length, 2);
  assert.ok(chunkInserts.every(item => {
    const query = db.queries[item.index]!;
    return query.values.length <= 50 * 8;
  }));

  const documentValues = db.queries[documentInsert]!.values;
  assert.equal(documentValues[0], TENANT_ID);
  assert.equal(documentValues[1], PROJECT_ID);
  assert.equal(documentValues[3], 'meeting_note');
  assert.equal(documentValues[4], RECORD_ID);
  const versionValues = db.queries[versionInsert]!.values;
  assert.equal(versionValues[3], 1);
  assert.equal(versionValues[5], result.contentHash);
  const chunkInsert = db.queries[chunkInserts[0]!.index]!;
  assert.equal(chunkInsert.values[1], TENANT_ID);
  const insertedJob = db.queries[jobInsert]!;
  assert.equal(insertedJob.values[2], 'google');
  assert.equal(insertedJob.values[3], result.sourceDocumentId);
  assert.equal(insertedJob.values[4], result.documentVersionId);
  assert.equal(insertedJob.values[5], result.contentHash);
  const jobMetadata = JSON.parse(String(insertedJob.values[6])) as Record<string, unknown>;
  assert.equal(jobMetadata.recordId, RECORD_ID);
  assert.equal(jobMetadata.sourceTable, 'knowledge_records');
  assert.equal(jobMetadata.sourceType, 'meeting_note');
  assert.equal(jobMetadata.visibility, 'project');
  assert.equal(jobMetadata.version, 1);
  assert.equal(jobMetadata.contentHash, result.contentHash);
  assert.deepEqual(db.authorization.map(item => item.kind), ['record', 'job']);
  assert.deepEqual(db.authorization[0]?.values, [TENANT_ID, PROJECT_ID, RECORD_ID]);
  assert.deepEqual(db.authorization[1]?.values.slice(0, 2), [TENANT_ID, result.sourceDocumentId]);
});

test('complete same-hash version reuses a failed job without creating another version or retry', async () => {
  const content = buildKnowledgeRecordRagContent({
    recordType: 'meeting',
    title: 'Planning review',
    content: 'Decisions and follow-ups.',
    occurredAt: '2026-10-29 10:00:00+00',
    startedAt: null,
    endedAt: null,
    participantsText: 'Ada, Lin',
  }, [TASK_ID]);
  const contentHash = hashKnowledgeRecordRagContent(content);
  const metadata = recordMetadata();
  const chunks = chunkKnowledgeRecordRagContent(content).map(chunk => ({
    document_version_id: VERSION_ID,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    token_count: chunk.tokenCount,
    metadata,
  }));
  const jobMetadata = {
    ...metadata,
    sourceTable: 'knowledge_records',
    sourceId: RECORD_ID,
    sourceType: 'meeting_note',
    visibility: 'project',
    version: 4,
    contentHash,
  };
  const db = fakePort({
    record: baseRecord({ rag_enabled: true, source_document_id: DOCUMENT_ID }),
    documents: [baseDocument({ content_hash: contentHash, rag_enabled: true })],
    versions: [{ id: VERSION_ID, version: 4, content_hash: contentHash }],
    chunks,
    jobs: [{ id: JOB_ID, status: 'failed', metadata: jobMetadata }],
  });

  const result = await reconcileKnowledgeRecordMirror(db.port, {
    tenantId: TENANT_ID, projectId: PROJECT_ID, recordId: RECORD_ID,
  });
  assert.deepEqual(result, {
    eligible: true,
    state: 'failed',
    sourceDocumentId: DOCUMENT_ID,
    documentVersionId: VERSION_ID,
    version: 4,
    contentHash,
    jobId: JOB_ID,
  });
  const sql = db.queries.map(query => query.sql);
  const documentUpdate = sql.findIndex(statement => /UPDATE projed_core\.documents/u.test(statement));
  const recordLink = sql.findIndex(statement => /UPDATE projed_core\.knowledge_records/u.test(statement));
  const latestVersionRead = sql.findIndex(statement => /FROM projed_core\.document_versions/u.test(statement));
  assert.ok(documentUpdate >= 0 && documentUpdate < recordLink && recordLink < latestVersionRead);
  assert.equal(sql.some(statement => /INSERT INTO projed_core\.document_versions/u.test(statement)), false);
  assert.equal(sql.some(statement => /DELETE FROM projed_core\.document_chunks/u.test(statement)), false);
  assert.equal(sql.some(statement => /INSERT INTO projed_core\.rag_sync_jobs/u.test(statement)), false);
  assert.ok(sql.some(statement => /UPDATE projed_core\.rag_sync_jobs/u.test(statement)));
  assert.deepEqual(db.authorization.map(item => item.kind), ['record']);
});

test('same complete version with missing job inserts one job without rebuilding chunks', async () => {
  const content = buildKnowledgeRecordRagContent({
    recordType: 'meeting',
    title: 'Planning review',
    content: 'Decisions and follow-ups.',
    occurredAt: '2026-10-29 10:00:00+00',
    startedAt: null,
    endedAt: null,
    participantsText: 'Ada, Lin',
  }, [TASK_ID]);
  const contentHash = hashKnowledgeRecordRagContent(content);
  const db = fakePort({
    record: baseRecord({ rag_enabled: true, source_document_id: DOCUMENT_ID }),
    documents: [baseDocument({ content_hash: contentHash, rag_enabled: true })],
    versions: [{ id: VERSION_ID, version: 2, content_hash: contentHash }],
    chunks: chunkKnowledgeRecordRagContent(content).map(chunk => ({
      document_version_id: VERSION_ID,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      token_count: chunk.tokenCount,
      metadata: recordMetadata(),
    })),
  });

  const result = await reconcileKnowledgeRecordMirror(db.port, {
    tenantId: TENANT_ID, projectId: PROJECT_ID, recordId: RECORD_ID,
  });
  assert.equal(result.eligible, true);
  if (!result.eligible) throw new Error('Expected an eligible mirror');
  assert.equal(result.version, 2);
  assert.equal(result.documentVersionId, VERSION_ID);
  assert.equal(result.state, 'pending');
  const sql = db.queries.map(query => query.sql);
  assert.equal(sql.some(statement => /INSERT INTO projed_core\.document_versions/u.test(statement)), false);
  assert.equal(sql.some(statement => /DELETE FROM projed_core\.document_chunks/u.test(statement)), false);
  assert.equal(sql.filter(statement => /INSERT INTO projed_core\.rag_sync_jobs/u.test(statement)).length, 1);
  assert.deepEqual(db.authorization.map(item => item.kind), ['record', 'job']);
});

test('private transition disables local mirror, preserves pointer and versions, supersedes work, and clears local chunks', async () => {
  const db = fakePort({
    record: baseRecord({ status: 'published', visibility: 'private', rag_enabled: true, source_document_id: DOCUMENT_ID }),
    documents: [baseDocument({ rag_enabled: true })],
    jobs: [{ id: JOB_ID, status: 'running', metadata: {} }],
  });

  const result = await reconcileKnowledgeRecordMirror(db.port, {
    tenantId: TENANT_ID, projectId: PROJECT_ID, recordId: RECORD_ID,
  });
  assert.deepEqual(result, { eligible: false, state: 'disabled', sourceDocumentId: DOCUMENT_ID });
  const sql = db.queries.map(query => query.sql);
  assert.ok(sql.some(statement => /UPDATE projed_core\.documents .*rag_enabled = false/u.test(statement)));
  assert.ok(sql.some(statement => /UPDATE projed_core\.knowledge_records .*source_document_id = \$4::uuid, rag_enabled = \$5/u.test(statement)));
  const supersede = db.queries.find(query => /UPDATE projed_core\.rag_sync_jobs/u.test(query.sql));
  assert.ok(supersede);
  assert.match(supersede.sql, /status = 'superseded'/u);
  assert.match(supersede.sql, /lease_token = NULL, lease_expires_at = NULL/u);
  assert.ok(sql.some(statement => /DELETE FROM projed_core\.document_chunks/u.test(statement)));
  assert.equal(sql.some(statement => /INSERT INTO projed_core\.(document_versions|document_chunks|rag_sync_jobs)/u.test(statement)), false);
  assert.equal(sql.some(statement => /INSERT INTO projed_core\.document_embeddings/u.test(statement)), false);
  assert.deepEqual(db.authorization.map(item => item.kind), ['record']);
});

test('draft and archived transitions preserve the exact source pointer and do not write new private versions', async () => {
  for (const recordState of [
    { status: 'draft', visibility: 'project' },
    { status: 'archived', visibility: 'tenant' },
  ]) {
    const db = fakePort({
      record: baseRecord({
        status: recordState.status,
        visibility: recordState.visibility,
        rag_enabled: true,
        source_document_id: DOCUMENT_ID,
      }),
      documents: [baseDocument({ visibility: recordState.visibility, rag_enabled: true })],
    });
    const result = await reconcileKnowledgeRecordMirror(db.port, {
      tenantId: TENANT_ID, projectId: PROJECT_ID, recordId: RECORD_ID,
    });
    assert.deepEqual(result, { eligible: false, state: 'disabled', sourceDocumentId: DOCUMENT_ID });
    const sql = db.queries.map(query => query.sql);
    assert.ok(sql.some(statement => /UPDATE projed_core.knowledge_records/u.test(statement)));
    assert.ok(sql.some(statement => /UPDATE projed_core.documents/u.test(statement)));
    assert.ok(sql.some(statement => /DELETE FROM projed_core.document_chunks/u.test(statement)));
    assert.equal(sql.some(statement => /INSERT INTO projed_core.(document_versions|document_chunks|rag_sync_jobs)/u.test(statement)), false);
  }
});

test('visibility change rebuilds a fresh version even when text hash stays equal', async () => {
  const content = buildKnowledgeRecordRagContent({
    recordType: 'meeting',
    title: 'Planning review',
    content: 'Decisions and follow-ups.',
    occurredAt: '2026-10-29 10:00:00+00',
    startedAt: null,
    endedAt: null,
    participantsText: 'Ada, Lin',
  }, [TASK_ID]);
  const contentHash = hashKnowledgeRecordRagContent(content);
  const db = fakePort({
    record: baseRecord({ rag_enabled: true, source_document_id: DOCUMENT_ID, visibility: 'project' }),
    documents: [baseDocument({ content_hash: contentHash, visibility: 'tenant', rag_enabled: true })],
    versions: [{ id: VERSION_ID, version: 4, content_hash: contentHash }],
    chunks: chunkKnowledgeRecordRagContent(content).map(chunk => ({
      document_version_id: VERSION_ID,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      token_count: chunk.tokenCount,
      metadata: recordMetadata(),
    })),
    jobs: [{ id: JOB_ID, status: 'running', metadata: {} }],
  });

  const result = await reconcileKnowledgeRecordMirror(db.port, {
    tenantId: TENANT_ID, projectId: PROJECT_ID, recordId: RECORD_ID,
  });
  assert.equal(result.eligible, true);
  if (!result.eligible) throw new Error('Expected an eligible mirror');
  assert.equal(result.sourceDocumentId, DOCUMENT_ID);
  assert.equal(result.version, 5);
  assert.equal(result.contentHash, contentHash);
  const sql = db.queries.map(query => query.sql);
  const supersede = db.queries.find(query => /UPDATE projed_core.rag_sync_jobs/u.test(query.sql));
  const deleteChunks = sql.findIndex(statement => /DELETE FROM projed_core.document_chunks/u.test(statement));
  const versionInsert = sql.findIndex(statement => /INSERT INTO projed_core.document_versions/u.test(statement));
  const jobInsert = sql.findIndex(statement => /INSERT INTO projed_core.rag_sync_jobs/u.test(statement));
  assert.ok(supersede);
  assert.match(supersede.sql, /status = 'superseded'/u);
  assert.ok(deleteChunks >= 0 && deleteChunks < versionInsert && versionInsert < jobInsert);
  assert.equal(db.queries[versionInsert]?.values[3], 5);
  const metadata = JSON.parse(String(db.queries[jobInsert]?.values[6])) as Record<string, unknown>;
  assert.equal(metadata.visibility, 'project');
  assert.equal(metadata.version, 5);
});

test('mirror write failure bubbles after early pointer but before job publication', async () => {
  const db = fakePort({ failOn: /INSERT INTO projed_core\.document_chunks/u });
  let commitCount = 0;
  let rollbackCount = 0;
  const runFakeTransaction = async () => {
    try {
      const result = await reconcileKnowledgeRecordMirror(db.port, {
        tenantId: TENANT_ID, projectId: PROJECT_ID, recordId: RECORD_ID,
      });
      commitCount += 1;
      return result;
    } catch (error) {
      rollbackCount += 1;
      throw error;
    }
  };

  await assert.rejects(runFakeTransaction(), /simulated query failure/u);
  assert.equal(commitCount, 0);
  assert.equal(rollbackCount, 1);
  const sql = db.queries.map(query => query.sql);
  const recordLink = sql.findIndex(statement => /UPDATE projed_core\.knowledge_records/u.test(statement));
  const chunkInsert = sql.findIndex(statement => /INSERT INTO projed_core\.document_chunks/u.test(statement));
  assert.ok(recordLink >= 0 && recordLink < chunkInsert);
  assert.equal(sql.some(statement => /INSERT INTO projed_core\.rag_sync_jobs/u.test(statement)), false);
});

test('record authorization is required before retention queries', async () => {
  const db = fakePort({ record: baseRecord({ actor_can_write: false }) });
  await assert.rejects(
    reconcileKnowledgeRecordMirror(db.port, {
      tenantId: TENANT_ID, projectId: PROJECT_ID, recordId: RECORD_ID,
    }),
    (error: unknown) => error instanceof KernelError && error.code === 'ACCESS_DENIED',
  );
  assert.deepEqual(db.authorization.map(item => item.kind), ['record']);
  assert.equal(db.queries.some(query => /FROM projed_core\.documents document/u.test(query.sql)), false);
});
