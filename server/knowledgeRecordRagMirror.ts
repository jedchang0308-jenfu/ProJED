import { createHash, randomUUID } from 'node:crypto';

import type { QueryResultRow } from 'pg';

import type { ActorQueryPort } from './actorTransaction.js';
import { KernelError } from './errors.js';

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_DOCUMENT_VERSION = 2_147_483_647;
const CHUNK_CHARS = 2_800;
const CHUNK_INSERT_BATCH_SIZE = 50;
const SOURCE_TABLE = 'knowledge_records' as const;
const EMBEDDING_PROVIDER = 'google' as const;

export interface KnowledgeRecordRagPort extends ActorQueryPort {
  authorizeRecordRagMutation(tenantId: string, projectId: string, recordId: string): Promise<void>;
  authorizeRagJobMutation(
    tenantId: string,
    documentId: string,
    jobId: string,
    claimToken?: string,
  ): Promise<void>;
}

export interface KnowledgeRecordRagContentInput {
  readonly id: string;
  readonly recordType: 'meeting' | 'work_log';
  readonly title: string;
  readonly content: string;
  readonly occurredAt: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly participantsText: string | null;
  readonly updatedBy: string | null;
  readonly createdBy: string | null;
  readonly status: 'draft' | 'published' | 'archived';
  readonly visibility: 'private' | 'project' | 'tenant';
}

export interface KnowledgeRecordRagChunk {
  readonly chunkIndex: number;
  readonly content: string;
  readonly tokenCount: number;
}

export type KnowledgeRecordMirrorResult =
  | {
      readonly eligible: false;
      readonly state: 'disabled';
      readonly sourceDocumentId: string | null;
    }
  | {
      readonly eligible: true;
      readonly state: 'synced' | 'pending' | 'running' | 'failed';
      readonly sourceDocumentId: string;
      readonly documentVersionId: string;
      readonly version: number;
      readonly contentHash: string;
      readonly jobId: string;
    };

interface StoredRecordRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  project_id: string;
  record_type: string;
  title: string;
  content: string;
  participants_text: string | null;
  occurred_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  recorded_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  status: string;
  visibility: string;
  rag_enabled: boolean;
  source_document_id: string | null;
  actor_can_write: boolean;
}

interface StoredDocumentRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  project_id: string | null;
  source_type: string;
  source_table: string | null;
  source_id: string | null;
  content_hash: string | null;
  visibility: string;
  rag_enabled: boolean;
}

interface StoredVersionRow extends QueryResultRow {
  id: string;
  version: number | string;
  content_hash: string;
}

interface StoredChunkRow extends QueryResultRow {
  document_version_id: string | null;
  chunk_index: number;
  content: string;
  token_count: number | null;
  metadata: unknown;
}

interface StoredJobRow extends QueryResultRow {
  id: string;
  status: string;
  metadata: unknown;
}

interface RecordMetadata {
  readonly recordType: 'meeting' | 'work_log';
  readonly recordId: string;
  readonly linkedTaskIds: readonly string[];
  readonly occurredAt: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly participantsText: string | null;
}

function unavailable(message: string): never {
  throw new KernelError('DB_UNAVAILABLE', message, 503);
}

function notFound(): never {
  throw new KernelError('RESOURCE_NOT_FOUND', 'Knowledge record was not found', 404);
}

function assertScope(tenantId: string, projectId: string, recordId: string): void {
  if (![tenantId, projectId, recordId].every(value => typeof value === 'string' && UUID_RE.test(value))) {
    throw new KernelError('TRANSACTION_USAGE_INVALID', 'Knowledge record RAG scope is invalid', 500);
  }
}

export function buildKnowledgeRecordRagContent(
  record: Pick<KnowledgeRecordRagContentInput,
    'recordType' | 'title' | 'content' | 'occurredAt' | 'startedAt' | 'endedAt' | 'participantsText'>,
  linkedTaskIds: readonly string[],
): string {
  return [
    'Title: ' + record.title,
    'Type: ' + (record.recordType === 'meeting' ? 'meeting note' : 'personal work log'),
    record.occurredAt ? 'Occurred at: ' + record.occurredAt : null,
    record.startedAt ? 'Started at: ' + record.startedAt : null,
    record.endedAt ? 'Ended at: ' + record.endedAt : null,
    record.participantsText ? 'Participants: ' + record.participantsText : null,
    linkedTaskIds.length ? 'Linked task ids: ' + linkedTaskIds.join(', ') : null,
    '',
    record.content,
  ].filter(Boolean).join('\n');
}

export function hashKnowledgeRecordRagContent(content: string): string {
  const digest = createHash('sha256').update(content, 'utf8').digest('hex');
  return 'sha256-v1-' + Buffer.byteLength(content, 'utf8') + '-' + digest;
}

export function chunkKnowledgeRecordRagContent(content: string): KnowledgeRecordRagChunk[] {
  const chunks: KnowledgeRecordRagChunk[] = [];
  for (let start = 0; start < content.length; start += CHUNK_CHARS) {
    const chunk = content.slice(start, start + CHUNK_CHARS);
    chunks.push({
      chunkIndex: chunks.length,
      content: chunk,
      tokenCount: Math.ceil(chunk.length / 4),
    });
  }
  if (chunks.length === 0) chunks.push({ chunkIndex: 0, content: '', tokenCount: 0 });
  return chunks;
}

function metadataFor(record: StoredRecordRow, linkedTaskIds: readonly string[]): RecordMetadata {
  return {
    recordType: record.record_type as RecordMetadata['recordType'],
    recordId: record.id,
    linkedTaskIds,
    occurredAt: record.occurred_at,
    startedAt: record.started_at,
    endedAt: record.ended_at,
    participantsText: record.participants_text,
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort()
    .map(key => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
}

function validStoredRecord(
  row: StoredRecordRow,
  tenantId: string,
  projectId: string,
  recordId: string,
): boolean {
  return row.id === recordId
    && row.tenant_id === tenantId
    && row.project_id === projectId
    && (row.record_type === 'meeting' || row.record_type === 'work_log')
    && (row.status === 'draft' || row.status === 'published' || row.status === 'archived')
    && (row.visibility === 'private' || row.visibility === 'project' || row.visibility === 'tenant')
    && typeof row.title === 'string'
    && typeof row.content === 'string'
    && [row.participants_text, row.occurred_at, row.started_at, row.ended_at].every(
      value => value === null || typeof value === 'string',
    )
    && [row.recorded_by, row.created_by, row.updated_by].every(
      value => value === null || UUID_RE.test(value),
    )
    && typeof row.rag_enabled === 'boolean'
    && row.actor_can_write === true
    && (row.source_document_id === null || UUID_RE.test(row.source_document_id));
}

function validSourceDocument(
  row: StoredDocumentRow,
  tenantId: string,
  projectId: string,
  recordId: string,
  expectedSourceType: 'meeting_note' | 'work_log',
): boolean {
  return UUID_RE.test(row.id)
    && row.tenant_id === tenantId
    && row.project_id === projectId
    && row.source_table === SOURCE_TABLE
    && row.source_id === recordId
    && row.source_type === expectedSourceType;
}

function sourceType(recordType: 'meeting' | 'work_log'): 'meeting_note' | 'work_log' {
  return recordType === 'meeting' ? 'meeting_note' : 'work_log';
}

function parseVersion(value: number | string): number {
  const version = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(version) || version < 1 || version > MAX_DOCUMENT_VERSION) {
    return unavailable('Stored document version is invalid');
  }
  return version;
}

function isJobStatus(value: string): value is 'pending' | 'running' | 'synced' | 'failed' | 'deleted' | 'superseded' {
  return value === 'pending' || value === 'running' || value === 'synced'
    || value === 'failed' || value === 'deleted' || value === 'superseded';
}

function jobMetadataMatches(
  value: unknown,
  record: StoredRecordRow,
  visibility: string,
  version: number,
  contentHash: string,
): boolean {
  let metadata = value;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      return false;
    }
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const row = metadata as Record<string, unknown>;
  return row.recordId === record.id
    && row.sourceTable === SOURCE_TABLE
    && row.sourceType === sourceType(record.record_type as 'meeting' | 'work_log')
    && row.visibility === visibility
    && row.version === version
    && row.contentHash === contentHash;
}

function completeChunks(
  stored: readonly StoredChunkRow[],
  expected: readonly KnowledgeRecordRagChunk[],
  documentVersionId: string,
  metadata: RecordMetadata,
): boolean {
  return stored.length === expected.length && stored.every((row, index) => {
    const chunk = expected[index];
    return chunk !== undefined
      && row.document_version_id === documentVersionId
      && row.chunk_index === chunk.chunkIndex
      && row.content === chunk.content
      && row.token_count === chunk.tokenCount
      && canonicalJson(row.metadata) === canonicalJson(metadata);
  });
}

async function setRecordMirrorState(
  port: KnowledgeRecordRagPort,
  tenantId: string,
  projectId: string,
  recordId: string,
  sourceDocumentId: string | null,
  enabled: boolean,
): Promise<void> {
  const updated = await port.query([
    'UPDATE projed_core.knowledge_records',
    '   SET source_document_id = $4::uuid, rag_enabled = $5,',
    '       updated_by = projed_core.current_actor_user_id_v1()',
    ' WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid',
  ].join('\n'), [tenantId, projectId, recordId, sourceDocumentId, enabled]);
  if (updated.rowCount !== 1) notFound();
}

async function supersedeWork(
  port: KnowledgeRecordRagPort,
  tenantId: string,
  documentId: string,
  keepJobId?: string,
): Promise<void> {
  await port.query([
    'UPDATE projed_core.rag_sync_jobs',
    "   SET status = 'superseded', lease_token = NULL, lease_expires_at = NULL, updated_at = now()",
    ' WHERE tenant_id = $1::uuid AND source_document_id = $2::uuid',
    "   AND status IN ('pending', 'running')",
    '   AND ($3::uuid IS NULL OR id <> $3::uuid)',
  ].join('\n'), [tenantId, documentId, keepJobId ?? null]);
}

async function insertJob(
  port: KnowledgeRecordRagPort,
  input: {
    tenantId: string;
    recordId: string;
    documentId: string;
    documentVersionId: string;
    version: number;
    contentHash: string;
    statusMetadata: RecordMetadata;
    visibility: string;
    sourceType: 'meeting_note' | 'work_log';
  },
): Promise<{ jobId: string; state: 'pending' }> {
  const jobId = randomUUID();
  const metadata = {
    ...input.statusMetadata,
    sourceTable: SOURCE_TABLE,
    sourceId: input.recordId,
    sourceType: input.sourceType,
    visibility: input.visibility,
    version: input.version,
    contentHash: input.contentHash,
  };
  await port.authorizeRagJobMutation(input.tenantId, input.documentId, jobId);
  const inserted = await port.query([
    'INSERT INTO projed_core.rag_sync_jobs(',
    '  id, tenant_id, provider, target_store_id, source_document_id,',
    '  document_version_id, content_hash, status, metadata',
    ") VALUES ($1::uuid, $2::uuid, $3, NULL, $4::uuid, $5::uuid, $6, 'pending', $7::jsonb)",
  ].join('\n'), [jobId, input.tenantId, EMBEDDING_PROVIDER, input.documentId,
    input.documentVersionId, input.contentHash, JSON.stringify(metadata)]);
  if (inserted.rowCount !== 1) unavailable('RAG indexing job could not be created');
  return { jobId, state: 'pending' };
}

async function insertChunks(
  port: KnowledgeRecordRagPort,
  tenantId: string,
  documentId: string,
  documentVersionId: string,
  chunks: readonly KnowledgeRecordRagChunk[],
  metadata: RecordMetadata,
): Promise<void> {
  for (let start = 0; start < chunks.length; start += CHUNK_INSERT_BATCH_SIZE) {
    const batch = chunks.slice(start, start + CHUNK_INSERT_BATCH_SIZE);
    const values: unknown[] = [];
    const tuples = batch.map((chunk, index) => {
      const offset = index * 8;
      values.push(randomUUID(), tenantId, documentId, documentVersionId,
        chunk.chunkIndex, chunk.content, chunk.tokenCount, JSON.stringify(metadata));
      return '($' + (offset + 1) + '::uuid, $' + (offset + 2) + '::uuid, $'
        + (offset + 3) + '::uuid, $' + (offset + 4) + '::uuid, $'
        + (offset + 5) + ', $' + (offset + 6) + ', $'
        + (offset + 7) + ', $' + (offset + 8) + '::jsonb)';
    });
    const inserted = await port.query([
      'INSERT INTO projed_core.document_chunks(',
      '  id, tenant_id, document_id, document_version_id, chunk_index, content, token_count, metadata',
      ') VALUES ' + tuples.join(', '),
    ].join('\n'), values);
    if (inserted.rowCount !== batch.length) unavailable('RAG document chunks could not be created');
  }
}

export async function reconcileKnowledgeRecordMirror(
  port: KnowledgeRecordRagPort,
  input: { readonly tenantId: string; readonly projectId: string; readonly recordId: string },
): Promise<KnowledgeRecordMirrorResult> {
  const { tenantId, projectId, recordId } = input;
  assertScope(tenantId, projectId, recordId);

  await port.authorizeRecordRagMutation(tenantId, projectId, recordId);

  const recordResult = await port.query<StoredRecordRow>([
    'SELECT record.id::text AS id, record.tenant_id::text AS tenant_id,',
    '       record.project_id::text AS project_id, record.record_type, record.title, record.content,',
    '       record.participants_text,',
    '       record.occurred_at::text AS occurred_at, record.started_at::text AS started_at,',
    '       record.ended_at::text AS ended_at,',
    '       record.recorded_by::text AS recorded_by, record.created_by::text AS created_by,',
    '       record.updated_by::text AS updated_by, record.status, record.visibility,',
    '       record.rag_enabled, record.source_document_id::text AS source_document_id,',
    '       projed_core.actor_can_write_record_v1(',
    '         record.tenant_id, record.project_id, record.visibility, record.created_by, record.recorded_by',
    '       ) AS actor_can_write',
    '  FROM projed_core.knowledge_records record',
    ' WHERE record.tenant_id = $1::uuid AND record.project_id = $2::uuid AND record.id = $3::uuid',
    ' FOR UPDATE',
  ].join('\n'), [tenantId, projectId, recordId]);
  const record = recordResult.rows[0];
  if (!record) notFound();
  if (!validStoredRecord(record, tenantId, projectId, recordId)) {
    if (record.actor_can_write !== true) {
      throw new KernelError('ACCESS_DENIED', 'Actor is not authorized to update this record', 403);
    }
    return unavailable('Stored knowledge record is invalid');
  }

  const linkResult = await port.query<{ node_id: string | null; item_exists: boolean }>([
    'SELECT COALESCE(item.legacy_task_id, item.id::text) AS node_id,',
    '       item.id IS NOT NULL AS item_exists',
    '  FROM projed_core.record_task_links link',
    '  LEFT JOIN projed_core.wbs_items item',
    '    ON item.tenant_id = link.tenant_id AND item.project_id = link.project_id AND item.id = link.item_id',
    ' WHERE link.tenant_id = $1::uuid AND link.project_id = $2::uuid AND link.record_id = $3::uuid',
    ' ORDER BY link.created_at, link.id',
  ].join('\n'), [tenantId, projectId, recordId]);
  const linkedTaskIds = linkResult.rows.map(row => {
    if (row.item_exists !== true || typeof row.node_id !== 'string' || row.node_id.length === 0) {
      return unavailable('Stored record task link is invalid');
    }
    return row.node_id;
  });
  const recordMetadata = metadataFor(record, linkedTaskIds);
  const mappedSourceType = sourceType(record.record_type as 'meeting' | 'work_log');
  const eligible = record.status === 'published' && record.visibility !== 'private';

  const documentResult = await port.query<StoredDocumentRow>([
    'SELECT document.id::text AS id, document.tenant_id::text AS tenant_id,',
    '       document.project_id::text AS project_id, document.source_type, document.source_table,',
    '       document.source_id::text AS source_id, document.content_hash, document.visibility,',
    '       document.rag_enabled',
    '  FROM projed_core.documents document',
    " WHERE document.tenant_id = $1::uuid AND document.source_table = 'knowledge_records'",
    '   AND document.source_id = $2::uuid',
    ' ORDER BY document.id',
    ' FOR UPDATE',
  ].join('\n'), [tenantId, recordId]);
  if (documentResult.rows.length > 1) unavailable('Knowledge record has multiple RAG source documents');
  const document = documentResult.rows[0] ?? null;
  if (record.source_document_id !== null && (!document || record.source_document_id !== document.id)) {
    return unavailable('Knowledge record source document pointer is inconsistent');
  }
  if (document && !validSourceDocument(document, tenantId, projectId, recordId, mappedSourceType)) {
    return unavailable('Knowledge record source document scope is inconsistent');
  }

  if (!eligible) {
    if (!document) {
      await setRecordMirrorState(port, tenantId, projectId, recordId, null, false);
      return { eligible: false, state: 'disabled', sourceDocumentId: null };
    }
    await port.query([
      'UPDATE projed_core.documents',
      '   SET rag_enabled = false, visibility = $3, updated_by = $4::uuid, updated_at = now()',
      ' WHERE tenant_id = $1::uuid AND id = $2::uuid',
      "   AND source_table = 'knowledge_records' AND source_id = $5::uuid AND project_id = $6::uuid",
    ].join('\n'), [tenantId, document.id, record.visibility, record.updated_by, recordId, projectId]);
    await setRecordMirrorState(port, tenantId, projectId, recordId, document.id, false);
    await supersedeWork(port, tenantId, document.id);
    await port.query([
      'DELETE FROM projed_core.document_chunks',
      ' WHERE tenant_id = $1::uuid AND document_id = $2::uuid',
    ].join('\n'), [tenantId, document.id]);
    return { eligible: false, state: 'disabled', sourceDocumentId: document.id };
  }

  const source: KnowledgeRecordRagContentInput = {
    id: record.id,
    recordType: record.record_type as 'meeting' | 'work_log',
    title: record.title,
    content: record.content,
    occurredAt: record.occurred_at,
    startedAt: record.started_at,
    endedAt: record.ended_at,
    participantsText: record.participants_text,
    updatedBy: record.updated_by,
    createdBy: record.created_by,
    status: record.status as 'draft' | 'published' | 'archived',
    visibility: record.visibility as 'private' | 'project' | 'tenant',
  };
  const content = buildKnowledgeRecordRagContent(source, linkedTaskIds);
  if (content.trim().length === 0) return unavailable('Published knowledge record has no indexable content');
  const contentHash = hashKnowledgeRecordRagContent(content);
  const chunks = chunkKnowledgeRecordRagContent(content);
  const documentId = document?.id ?? randomUUID();
  const documentValues = [
    tenantId, projectId, documentId, mappedSourceType, recordId, record.title, contentHash,
    record.visibility, JSON.stringify(recordMetadata), record.created_by, record.updated_by,
  ] as const;
  if (document) {
    const documentUpdateValues = [
      tenantId, documentId, recordId, record.title, contentHash, record.visibility,
      JSON.stringify(recordMetadata), record.updated_by, projectId,
    ] as const;
    const updated = await port.query([
      'UPDATE projed_core.documents',
      '   SET title = $4, content_hash = $5, visibility = $6, rag_enabled = true,',
      '       metadata = $7::jsonb, updated_by = $8::uuid, updated_at = now()',
      ' WHERE tenant_id = $1::uuid AND id = $2::uuid',
      "   AND source_table = 'knowledge_records' AND source_id = $3::uuid AND project_id = $9::uuid",
    ].join('\n'), documentUpdateValues);
    if (updated.rowCount !== 1) unavailable('RAG source document could not be updated');
  } else {
    const inserted = await port.query([
      'INSERT INTO projed_core.documents(',
      '  id, tenant_id, project_id, source_type, source_table, source_id, title,',
      '  content_hash, visibility, rag_enabled, metadata, created_by, updated_by',
      ") VALUES ($3::uuid, $1::uuid, $2::uuid, $4, 'knowledge_records', $5::uuid, $6,",
      '  $7, $8, true, $9::jsonb, $10::uuid, $11::uuid)',
    ].join('\n'), documentValues);
    if (inserted.rowCount !== 1) unavailable('RAG source document could not be created');
  }
  await setRecordMirrorState(port, tenantId, projectId, recordId, documentId, true);

  const latestResult = await port.query<StoredVersionRow>([
    'SELECT id::text AS id, version, content_hash',
    '  FROM projed_core.document_versions',
    ' WHERE tenant_id = $1::uuid AND document_id = $2::uuid',
    ' ORDER BY version DESC',
    ' LIMIT 1',
  ].join('\n'), [tenantId, documentId]);
  const latest = latestResult.rows[0] ?? null;
  let reusableVersionId: string | null = null;
  let reusableVersion: number | null = null;
  let reusableJob: StoredJobRow | null = null;

  if (document && document.content_hash === contentHash && document.visibility === record.visibility && latest
      && latest.content_hash === contentHash) {
    const latestVersion = parseVersion(latest.version);
    const chunkResult = await port.query<StoredChunkRow>([
      'SELECT document_version_id::text AS document_version_id, chunk_index, content, token_count, metadata',
      '  FROM projed_core.document_chunks',
      ' WHERE tenant_id = $1::uuid AND document_id = $2::uuid',
      ' ORDER BY chunk_index',
    ].join('\n'), [tenantId, documentId]);
    if (completeChunks(chunkResult.rows, chunks, latest.id, recordMetadata)) {
      if (!UUID_RE.test(latest.id)) return unavailable('Stored RAG document version identity is invalid');
      reusableVersionId = latest.id;
      reusableVersion = latestVersion;
      const jobs = await port.query<StoredJobRow>([
        'SELECT id::text AS id, status, metadata',
        '  FROM projed_core.rag_sync_jobs',
        ' WHERE tenant_id = $1::uuid AND source_document_id = $2::uuid',
        '   AND document_version_id = $3::uuid AND content_hash = $4',
        ' ORDER BY created_at DESC, id DESC',
      ].join('\n'), [tenantId, documentId, latest.id, contentHash]);
      reusableJob = jobs.rows.find(job => isJobStatus(job.status)
        && job.status !== 'superseded'
        && job.status !== 'deleted'
        && jobMetadataMatches(job.metadata, record, record.visibility, latestVersion, contentHash)) ?? null;
    }
  }

  if (reusableVersionId && reusableVersion !== null) {
    if (reusableJob) {
      if (!UUID_RE.test(reusableJob.id)) return unavailable('Stored RAG indexing job identity is invalid');
      await supersedeWork(port, tenantId, documentId, reusableJob.id);
      return {
        eligible: true,
        state: reusableJob.status as 'pending' | 'running' | 'synced' | 'failed',
        sourceDocumentId: documentId,
        documentVersionId: reusableVersionId,
        version: reusableVersion,
        contentHash,
        jobId: reusableJob.id,
      };
    }
    await supersedeWork(port, tenantId, documentId);
    const job = await insertJob(port, {
      tenantId,
      recordId,
      documentId,
      documentVersionId: reusableVersionId,
      version: reusableVersion,
      contentHash,
      statusMetadata: recordMetadata,
      visibility: record.visibility,
      sourceType: mappedSourceType,
    });
    return {
      eligible: true,
      state: job.state,
      sourceDocumentId: documentId,
      documentVersionId: reusableVersionId,
      version: reusableVersion,
      contentHash,
      jobId: job.jobId,
    };
  }

  const nextVersion = latest ? parseVersion(latest.version) + 1 : 1;
  if (nextVersion > MAX_DOCUMENT_VERSION) unavailable('RAG document version limit has been reached');
  await supersedeWork(port, tenantId, documentId);
  await port.query([
    'DELETE FROM projed_core.document_chunks',
    ' WHERE tenant_id = $1::uuid AND document_id = $2::uuid',
  ].join('\n'), [tenantId, documentId]);
  const documentVersionId = randomUUID();
  const versionInsert = await port.query([
    'INSERT INTO projed_core.document_versions(',
    '  id, tenant_id, document_id, version, content, content_hash, metadata',
    ') VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb)',
  ].join('\n'), [documentVersionId, tenantId, documentId, nextVersion, content, contentHash,
    JSON.stringify(recordMetadata)]);
  if (versionInsert.rowCount !== 1) unavailable('RAG document version could not be created');
  await insertChunks(port, tenantId, documentId, documentVersionId, chunks, recordMetadata);
  const job = await insertJob(port, {
    tenantId,
    recordId,
    documentId,
    documentVersionId,
    version: nextVersion,
    contentHash,
    statusMetadata: recordMetadata,
    visibility: record.visibility,
    sourceType: mappedSourceType,
  });
  return {
    eligible: true,
    state: job.state,
    sourceDocumentId: documentId,
    documentVersionId,
    version: nextVersion,
    contentHash,
    jobId: job.jobId,
  };
}
