import { randomUUID } from 'node:crypto';

import type { ActorQueryPort } from './actorTransaction.js';
import { resolveBoard, resolveWorkspace, type BoardIdentity } from './domainRead.js';
import { KernelError } from './errors.js';
import { reconcileKnowledgeRecordMirror } from './knowledgeRecordRagMirror.js';

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const RECORD_TYPES = new Set(['meeting', 'work_log']);
const RECORD_STATUSES = new Set(['draft', 'published', 'archived']);
const RECORD_VISIBILITIES = new Set(['private', 'project', 'tenant']);
const LINK_ROLES = new Set(['main', 'related', 'decision', 'blocker', 'follow_up']);
const MAX_RECORD_CONTENT_CODE_UNITS = 4 * 1024 * 1024;
const ACTIVITY_TYPES = new Set([
  'task_created', 'task_assigned', 'task_collaborators_changed', 'task_status_changed',
  'task_moved', 'task_dates_changed', 'task_archived', 'task_collected', 'task_restored',
  'task_tags_changed', 'dependency_created',
  'dependency_updated', 'dependency_deleted', 'project_workspace_transferred',
]);
const AUDIT_ACTIONS = new Set([
  'invite_created', 'invite_revoked', 'invite_accepted', 'member_invited', 'member_removed',
  'member_role_changed', 'board_deleted', 'workspace_deleted', 'board_workspace_transferred',
]);

export type DomainKnowledgeRecordType = 'meeting' | 'work_log';
export type DomainKnowledgeRecordStatus = 'draft' | 'published' | 'archived';
export type DomainKnowledgeRecordVisibility = 'private' | 'project' | 'tenant';
export type DomainRecordTaskLinkRole = 'main' | 'related' | 'decision' | 'blocker' | 'follow_up';

export interface DomainRecordTaskLink {
  id: string;
  recordId: string;
  workspaceId: string;
  boardId: string;
  nodeId: string;
  role: DomainRecordTaskLinkRole;
  createdAt: number;
}

export interface DomainKnowledgeRecord {
  id: string;
  workspaceId: string;
  boardId: string;
  type: DomainKnowledgeRecordType;
  title: string;
  content: string;
  status: DomainKnowledgeRecordStatus;
  visibility: DomainKnowledgeRecordVisibility;
  participantsText?: string;
  occurredAt?: number;
  startedAt?: number;
  endedAt?: number;
  recordedBy?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: number;
  updatedAt: number;
  ragEnabled: boolean;
  sourceDocumentId?: string | null;
  metadata?: Record<string, unknown>;
  taskLinks: DomainRecordTaskLink[];
}

export interface DomainKnowledgeRecordInput {
  id?: string;
  type: DomainKnowledgeRecordType;
  title: string;
  content: string;
  status: DomainKnowledgeRecordStatus;
  visibility: DomainKnowledgeRecordVisibility;
  participantsText?: string;
  occurredAt?: number;
  startedAt?: number;
  endedAt?: number;
  recordedBy?: string | null;
  metadata?: Record<string, unknown>;
  taskLinks: Array<{ nodeId: string; role: DomainRecordTaskLinkRole }>;
}

export interface DomainActivityEvent {
  id: string;
  workspaceId: string;
  boardId?: string | null;
  actorId?: string | null;
  eventType: string;
  entityTable: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface DomainActivityEventInput {
  workspaceId: string;
  boardId?: string | null;
  eventType: string;
  entityTable: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
}

export interface DomainActivityQuery {
  workspaceId: string;
  boardId?: string | null;
  scope: 'workspace' | 'board';
  startedAt: number;
  endedAt: number;
  startBoundary?: 'inclusive' | 'exclusive';
  eventTypes?: string[];
}

export interface DomainAuditInput {
  workspaceId: string;
  boardId?: string | null;
  action: string;
  entityTable: string;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}

type RecordRow = {
  id: string;
  legacy_record_id: string | null;
  record_type: DomainKnowledgeRecordType;
  title: string;
  content: string;
  participants_text: string | null;
  occurred_at_ms: string | null;
  started_at_ms: string | null;
  ended_at_ms: string | null;
  recorded_by: string | null;
  status: DomainKnowledgeRecordStatus;
  visibility: DomainKnowledgeRecordVisibility;
  rag_enabled: boolean;
  source_document_id: string | null;
  metadata: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at_ms: string;
  updated_at_ms: string;
  links: unknown;
};

function invalid(message: string, status = 400): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, status);
}

function notFound(): never {
  throw new KernelError('RESOURCE_NOT_FOUND', 'Resource is unavailable', 404);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.trim() === '')) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function optionalText(value: unknown, label: string, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  return text(value, label, maximum, true);
}

function milliseconds(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) invalid('Stored timestamp is invalid', 503);
  return parsed;
}

function timestamp(value: unknown, label: string, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) invalid(`${label} is required`);
    return null;
  }
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalid(`${label} is invalid`);
  return new Date(Number(value)).toISOString();
}

function jsonObject(value: unknown, label: string, nullable = false): Record<string, unknown> | null {
  if (nullable && (value === undefined || value === null)) return null;
  if (!isObject(value)) invalid(`${label} must be an object`);
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length > 64 * 1024) invalid(`${label} is too large`);
    return JSON.parse(encoded) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof KernelError) throw error;
    invalid(`${label} is invalid`);
  }
}

function externalRef(value: unknown, label: string): string {
  const result = text(value, label, 512);
  if (result.trim() !== result || result.includes('/') || result.includes('\\')
      || Array.from(result).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    invalid(`${label} is invalid`);
  }
  return result;
}

function recordId(row: Pick<RecordRow, 'id' | 'legacy_record_id'>): string {
  return row.legacy_record_id ?? row.id;
}

function metadata(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined;
}

function parseLinks(value: unknown, recordExternalId: string, workspaceRef: string, boardRef: string): DomainRecordTaskLink[] {
  if (!Array.isArray(value)) invalid('Stored record links are invalid', 503);
  return value.map((candidate) => {
    if (!isObject(candidate) || typeof candidate.id !== 'string' || typeof candidate.nodeId !== 'string'
        || typeof candidate.role !== 'string' || !LINK_ROLES.has(candidate.role)
        || typeof candidate.createdAt !== 'string') invalid('Stored record link is invalid', 503);
    const createdAt = milliseconds(candidate.createdAt);
    if (createdAt === undefined) invalid('Stored record link timestamp is invalid', 503);
    return {
      id: candidate.id,
      recordId: recordExternalId,
      workspaceId: workspaceRef,
      boardId: boardRef,
      nodeId: candidate.nodeId,
      role: candidate.role as DomainRecordTaskLinkRole,
      createdAt,
    };
  });
}

function mapRecord(row: RecordRow, workspaceRef: string, boardRef: string): DomainKnowledgeRecord {
  const externalId = recordId(row);
  const occurredAt = milliseconds(row.occurred_at_ms);
  const startedAt = milliseconds(row.started_at_ms);
  const endedAt = milliseconds(row.ended_at_ms);
  const recordMetadata = metadata(row.metadata);
  return {
    id: externalId,
    workspaceId: workspaceRef,
    boardId: boardRef,
    type: row.record_type,
    title: row.title,
    content: row.content,
    status: row.status,
    visibility: row.visibility,
    ...(row.participants_text === null ? {} : { participantsText: row.participants_text }),
    ...(occurredAt === undefined ? {} : { occurredAt }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(endedAt === undefined ? {} : { endedAt }),
    recordedBy: row.recorded_by,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: milliseconds(row.created_at_ms)!,
    updatedAt: milliseconds(row.updated_at_ms)!,
    ragEnabled: row.rag_enabled,
    sourceDocumentId: row.source_document_id,
    ...(recordMetadata === undefined ? {} : { metadata: recordMetadata }),
    taskLinks: parseLinks(row.links, externalId, workspaceRef, boardRef),
  };
}

const RECORD_SELECT = `
  SELECT record.id::text, record.legacy_record_id, record.record_type, record.title, record.content,
         record.participants_text,
         CASE WHEN record.occurred_at IS NULL THEN NULL ELSE floor(extract(epoch FROM record.occurred_at) * 1000)::bigint::text END AS occurred_at_ms,
         CASE WHEN record.started_at IS NULL THEN NULL ELSE floor(extract(epoch FROM record.started_at) * 1000)::bigint::text END AS started_at_ms,
         CASE WHEN record.ended_at IS NULL THEN NULL ELSE floor(extract(epoch FROM record.ended_at) * 1000)::bigint::text END AS ended_at_ms,
         record.recorded_by::text, record.status, record.visibility, record.rag_enabled,
         record.source_document_id::text, record.metadata, record.created_by::text, record.updated_by::text,
         floor(extract(epoch FROM record.created_at) * 1000)::bigint::text AS created_at_ms,
         floor(extract(epoch FROM record.updated_at) * 1000)::bigint::text AS updated_at_ms,
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', link.id::text,
           'nodeId', COALESCE(item.legacy_task_id, item.id::text),
           'role', link.role,
           'createdAt', floor(extract(epoch FROM link.created_at) * 1000)::bigint::text
         ) ORDER BY link.created_at, link.id) FILTER (WHERE link.id IS NOT NULL), '[]'::jsonb) AS links
    FROM projed_core.knowledge_records record
    LEFT JOIN projed_core.record_task_links link
      ON link.tenant_id = record.tenant_id AND link.project_id = record.project_id AND link.record_id = record.id
    LEFT JOIN projed_core.wbs_items item
      ON item.tenant_id = link.tenant_id AND item.project_id = link.project_id AND item.id = link.item_id
`;

const RECORD_GROUP = `
  GROUP BY record.id
`;

async function resolveRecordInternalId(
  port: ActorQueryPort,
  board: BoardIdentity,
  recordRef: string,
): Promise<string> {
  const ref = externalRef(recordRef, 'recordRef');
  const result = await port.query<{ id: string }>(UUID_RE.test(ref) ? `
    SELECT id::text FROM projed_core.knowledge_records
     WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid
  ` : `
    SELECT id::text FROM projed_core.knowledge_records
     WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND legacy_record_id = $3
  `, [board.tenantId, board.id, ref]);
  if (result.rows.length !== 1) notFound();
  return result.rows[0]!.id;
}

async function resolveTaskInternalId(port: ActorQueryPort, board: BoardIdentity, nodeRef: string): Promise<string> {
  const ref = externalRef(nodeRef, 'nodeId');
  const result = await port.query<{ id: string }>(UUID_RE.test(ref) ? `
    SELECT id::text FROM projed_core.wbs_items
     WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid
  ` : `
    SELECT id::text FROM projed_core.wbs_items
     WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND legacy_task_id = $3
  `, [board.tenantId, board.id, ref]);
  if (result.rows.length !== 1) notFound();
  return result.rows[0]!.id;
}

async function bumpRevision(port: ActorQueryPort, tenantId: string, projectId: string | null): Promise<void> {
  const result = await port.query(`
    UPDATE projed_core.resource_revisions
       SET revision = revision + 1, updated_at = now()
     WHERE tenant_id = $1::uuid AND project_id IS NOT DISTINCT FROM $2::uuid
  `, [tenantId, projectId]);
  if (result.rowCount !== 1) invalid('Resource revision is unavailable', 503);
}

function validateRecordInput(input: DomainKnowledgeRecordInput): {
  value: DomainKnowledgeRecordInput;
  occurredAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  metadata: Record<string, unknown>;
  links: Array<{ nodeId: string; role: DomainRecordTaskLinkRole }>;
} {
  if (!isObject(input) || !RECORD_TYPES.has(input.type) || !RECORD_STATUSES.has(input.status)
      || !RECORD_VISIBILITIES.has(input.visibility)) invalid('Knowledge record shape is invalid');
  text(input.title, 'record title', 500, true);
  text(input.content, 'record content', MAX_RECORD_CONTENT_CODE_UNITS, true);
  const occurredAt = timestamp(input.occurredAt, 'occurredAt', input.type === 'meeting');
  const startedAt = timestamp(input.startedAt, 'startedAt', input.type === 'work_log');
  const endedAt = timestamp(input.endedAt, 'endedAt', input.type === 'work_log');
  if (startedAt !== null && endedAt !== null && startedAt > endedAt) invalid('Record time range is invalid');
  optionalText(input.participantsText, 'participantsText', 20_000);
  if (input.recordedBy !== undefined && input.recordedBy !== null && !UUID_RE.test(input.recordedBy)) {
    invalid('recordedBy is invalid');
  }
  const recordMetadata = jsonObject(input.metadata ?? {}, 'metadata')!;
  if (!Array.isArray(input.taskLinks) || input.taskLinks.length > 500) invalid('taskLinks are invalid');
  const unique = new Map<string, { nodeId: string; role: DomainRecordTaskLinkRole }>();
  for (const link of input.taskLinks) {
    if (!isObject(link) || typeof link.role !== 'string' || !LINK_ROLES.has(link.role)) invalid('task link is invalid');
    const nodeId = externalRef(link.nodeId, 'nodeId');
    const role = link.role as DomainRecordTaskLinkRole;
    unique.set(`${nodeId}\u0000${role}`, { nodeId, role });
  }
  return { value: input, occurredAt, startedAt, endedAt, metadata: recordMetadata, links: [...unique.values()] };
}

export class RecordActivityRepository {
  async listRecords(port: ActorQueryPort, workspaceRef: string, boardRef: string): Promise<DomainKnowledgeRecord[]> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const result = await port.query<RecordRow>(`${RECORD_SELECT}
      WHERE record.tenant_id = $1::uuid AND record.project_id = $2::uuid AND record.status <> 'archived'
      ${RECORD_GROUP}
      ORDER BY record.updated_at DESC, record.id
    `, [board.tenantId, board.id]);
    return result.rows.map(row => mapRecord(row, workspaceRef, boardRef));
  }

  async listRecordsByTask(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    nodeRef: string,
    includeArchived = false,
  ): Promise<DomainKnowledgeRecord[]> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const taskId = await resolveTaskInternalId(port, board, nodeRef);
    const result = await port.query<RecordRow>(`${RECORD_SELECT}
      WHERE record.tenant_id = $1::uuid AND record.project_id = $2::uuid
        AND ($4::boolean OR record.status <> 'archived')
        AND EXISTS (
          SELECT 1 FROM projed_core.record_task_links target_link
           WHERE target_link.tenant_id = record.tenant_id
             AND target_link.project_id = record.project_id
             AND target_link.record_id = record.id
             AND target_link.item_id = $3::uuid
        )
      ${RECORD_GROUP}
      ORDER BY record.updated_at DESC, record.id
    `, [board.tenantId, board.id, taskId, includeArchived]);
    return result.rows.map(row => mapRecord(row, workspaceRef, boardRef));
  }

  async upsertRecord(
    port: ActorQueryPort,
    workspaceRef: string,
    boardRef: string,
    input: DomainKnowledgeRecordInput,
  ): Promise<DomainKnowledgeRecord> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const validated = validateRecordInput(input);
    const actor = await port.query<{ id: string }>('SELECT projed_core.current_actor_user_id_v1()::text AS id');
    const actorId = actor.rows[0]?.id;
    if (!actorId) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);

    const requestedId = input.id === undefined ? undefined : externalRef(input.id, 'recordId');
    let internalId: string | undefined;
    if (requestedId !== undefined) {
      const existing = await port.query<{ id: string }>(UUID_RE.test(requestedId) ? `
        SELECT id::text FROM projed_core.knowledge_records
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid FOR UPDATE
      ` : `
        SELECT id::text FROM projed_core.knowledge_records
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND legacy_record_id = $3 FOR UPDATE
      `, [board.tenantId, board.id, requestedId]);
      internalId = existing.rows[0]?.id;
    }

    if (internalId) {
      const authorization = await port.query<{ allowed: boolean }>(`
        SELECT projed_core.actor_can_write_record_v1(
          tenant_id, project_id, visibility, created_by, recorded_by
        ) AS allowed
          FROM projed_core.knowledge_records
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid
      `, [board.tenantId, board.id, internalId]);
      if (authorization.rows.length !== 1) notFound();
      if (authorization.rows[0]?.allowed !== true) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    } else {
      const authorization = await port.query<{ allowed: boolean }>(`
        SELECT (
          projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'create_task')
          OR projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'edit_task')
        ) AS allowed
      `, [board.tenantId, board.id]);
      if (authorization.rows[0]?.allowed !== true) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    }

    const resolvedLinks: Array<{ id: string; nodeId: string; role: DomainRecordTaskLinkRole }> = [];
    for (const link of validated.links) {
      resolvedLinks.push({ ...link, id: await resolveTaskInternalId(port, board, link.nodeId) });
    }

    if (internalId) {
      const updated = await port.query(`
        UPDATE projed_core.knowledge_records
           SET record_type = $4, title = $5, content = $6, participants_text = $7,
               occurred_at = $8::timestamptz, started_at = $9::timestamptz, ended_at = $10::timestamptz,
                status = $11, visibility = $12, rag_enabled = false,
                metadata = $13::jsonb, updated_by = $14::uuid, updated_at = now()
         WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid
      `, [board.tenantId, board.id, internalId, input.type, input.title, input.content,
        input.participantsText ?? null, validated.occurredAt, validated.startedAt, validated.endedAt,
        input.status, input.visibility, JSON.stringify(validated.metadata), actorId]);
      if (updated.rowCount !== 1) notFound();
    } else {
      internalId = UUID_RE.test(requestedId ?? '') ? requestedId : randomUUID();
      const inserted = await port.query(`
        INSERT INTO projed_core.knowledge_records(
          id, tenant_id, project_id, legacy_record_id, record_type, title, content, participants_text,
          occurred_at, started_at, ended_at, recorded_by, status, visibility, rag_enabled,
          source_document_id, metadata, created_by, updated_by
        ) VALUES (
          $3::uuid, $1::uuid, $2::uuid, $4, $5, $6, $7, $8,
          $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::uuid, $13, $14, false,
          NULL, $15::jsonb, $16::uuid, $16::uuid
        )
      `, [board.tenantId, board.id, internalId, requestedId && !UUID_RE.test(requestedId) ? requestedId : null,
        input.type, input.title, input.content, input.participantsText ?? null,
        validated.occurredAt, validated.startedAt, validated.endedAt, actorId,
        input.status, input.visibility, JSON.stringify(validated.metadata), actorId]);
      if (inserted.rowCount !== 1) invalid('Knowledge record could not be created', 503);
    }

    await port.query(`
      DELETE FROM projed_core.record_task_links
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND record_id = $3::uuid
    `, [board.tenantId, board.id, internalId]);
    for (const link of resolvedLinks) {
      await port.query(`
        INSERT INTO projed_core.record_task_links(
          id, tenant_id, project_id, record_id, item_id, role, created_by
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::uuid)
      `, [randomUUID(), board.tenantId, board.id, internalId, link.id, link.role, actorId]);
    }
    if (!internalId) invalid('Knowledge record identity is unavailable', 503);
    await reconcileKnowledgeRecordMirror(port, {tenantId:board.tenantId,projectId:board.id,recordId:internalId});
    await bumpRevision(port, board.tenantId, board.id);

    const records = await this.listRecordsByInternalId(port, board, workspaceRef, boardRef, internalId);
    const saved = records[0];
    if (!saved) notFound();
    return saved;
  }

  async archiveRecord(port: ActorQueryPort, workspaceRef: string, boardRef: string, recordRef: string): Promise<void> {
    const board = await resolveBoard(port, workspaceRef, boardRef);
    const internalId = await resolveRecordInternalId(port, board, recordRef);
    const actor = await port.query<{ id: string }>('SELECT projed_core.current_actor_user_id_v1()::text AS id');
    const result = await port.query(`
      UPDATE projed_core.knowledge_records
         SET status = 'archived', rag_enabled = false,
             updated_by = $4::uuid, updated_at = now()
       WHERE tenant_id = $1::uuid AND project_id = $2::uuid AND id = $3::uuid
    `, [board.tenantId, board.id, internalId, actor.rows[0]?.id]);
    if (result.rowCount !== 1) notFound();
    await reconcileKnowledgeRecordMirror(port, {tenantId:board.tenantId,projectId:board.id,recordId:internalId});
    await bumpRevision(port, board.tenantId, board.id);
  }

  private async listRecordsByInternalId(
    port: ActorQueryPort,
    board: BoardIdentity,
    workspaceRef: string,
    boardRef: string,
    internalId: string,
  ): Promise<DomainKnowledgeRecord[]> {
    const result = await port.query<RecordRow>(`${RECORD_SELECT}
      WHERE record.tenant_id = $1::uuid AND record.project_id = $2::uuid AND record.id = $3::uuid
      ${RECORD_GROUP}
    `, [board.tenantId, board.id, internalId]);
    return result.rows.map(row => mapRecord(row, workspaceRef, boardRef));
  }

  async logActivity(port: ActorQueryPort, input: DomainActivityEventInput): Promise<DomainActivityEvent> {
    if (!isObject(input) || !ACTIVITY_TYPES.has(input.eventType)) invalid('activity eventType is invalid');
    const workspace = await resolveWorkspace(port, input.workspaceId);
    let board: BoardIdentity | null = null;
    if (input.boardId !== undefined && input.boardId !== null) {
      board = await resolveBoard(port, input.workspaceId, input.boardId);
    }
    const authorization = await port.query<{ allowed: boolean }>(board ? `
      SELECT projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'write_activity') AS allowed
    ` : `
      SELECT projed_core.actor_has_workspace_capability_v1($1::uuid, 'read_activity') AS allowed
    `, board ? [workspace.id, board.id] : [workspace.id]);
    if (authorization.rows[0]?.allowed !== true) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    text(input.entityTable, 'entityTable', 120);
    const entityRef = input.entityId === undefined || input.entityId === null
      ? null
      : externalRef(input.entityId, 'entityId');
    const payload = jsonObject(input.payload, 'payload')!;
    const actor = await port.query<{ id: string }>('SELECT projed_core.current_actor_user_id_v1()::text AS id');
    const id = randomUUID();
    const result = await port.query(`
      INSERT INTO projed_core.activity_events(
        id, tenant_id, project_id, actor_id, event_type, entity_table, entity_id, entity_ref, payload
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::uuid, $8, $9::jsonb)
    `, [id, workspace.id, board?.id ?? null, actor.rows[0]?.id, input.eventType, input.entityTable,
      entityRef && UUID_RE.test(entityRef) ? entityRef : null, entityRef, JSON.stringify(payload)]);
    if (result.rowCount !== 1) invalid('Activity event could not be created', 503);
    await bumpRevision(port, workspace.id, board?.id ?? null);
    return {
      id,
      workspaceId: input.workspaceId,
      boardId: input.boardId ?? null,
      actorId: actor.rows[0]?.id ?? null,
      eventType: input.eventType,
      entityTable: input.entityTable,
      entityId: entityRef,
      payload,
      createdAt: Date.now(),
    };
  }

  async listActivity(port: ActorQueryPort, query: DomainActivityQuery): Promise<DomainActivityEvent[]> {
    if (!isObject(query) || (query.scope !== 'workspace' && query.scope !== 'board')) invalid('activity scope is invalid');
    if (!Number.isSafeInteger(query.startedAt) || !Number.isSafeInteger(query.endedAt)
        || query.startedAt < 0 || query.endedAt < query.startedAt) invalid('activity time range is invalid');
    const workspace = await resolveWorkspace(port, query.workspaceId);
    let board: BoardIdentity | null = null;
    if (query.scope === 'board') {
      if (typeof query.boardId !== 'string') invalid('boardId is required');
      board = await resolveBoard(port, query.workspaceId, query.boardId);
    }
    if (query.startBoundary !== undefined && query.startBoundary !== 'inclusive' && query.startBoundary !== 'exclusive') {
      invalid('startBoundary is invalid');
    }
    const eventTypes = query.eventTypes === undefined ? null : [...new Set(query.eventTypes)];
    if (eventTypes && (eventTypes.length > 50 || eventTypes.some(value => !ACTIVITY_TYPES.has(value)))) {
      invalid('eventTypes are invalid');
    }
    const result = await port.query<{
      id: string; legacy_board_id: string | null; actor_id: string | null; event_type: string;
      entity_table: string; entity_ref: string | null; payload: unknown; created_at_ms: string;
    }>(`
      SELECT event.id::text, project.legacy_board_id, event.actor_id::text, event.event_type,
             event.entity_table, COALESCE(event.entity_ref, event.entity_id::text) AS entity_ref,
             event.payload,
             floor(extract(epoch FROM event.created_at) * 1000)::bigint::text AS created_at_ms
        FROM projed_core.activity_events event
        LEFT JOIN projed_core.projects project
          ON project.tenant_id = event.tenant_id AND project.id = event.project_id
       WHERE event.tenant_id = $1::uuid
         AND ($2::uuid IS NULL OR event.project_id = $2::uuid)
         AND CASE WHEN $5::boolean THEN event.created_at > $3::timestamptz ELSE event.created_at >= $3::timestamptz END
         AND event.created_at <= $4::timestamptz
         AND ($6::text[] IS NULL OR event.event_type = ANY($6::text[]))
       ORDER BY event.created_at, event.id
    `, [workspace.id, board?.id ?? null, new Date(query.startedAt).toISOString(),
      new Date(query.endedAt).toISOString(), query.startBoundary === 'exclusive', eventTypes]);
    return result.rows.map(row => ({
      id: row.id,
      workspaceId: query.workspaceId,
      boardId: board ? query.boardId : row.legacy_board_id,
      actorId: row.actor_id,
      eventType: row.event_type,
      entityTable: row.entity_table,
      entityId: row.entity_ref,
      payload: jsonObject(row.payload, 'stored activity payload')!,
      createdAt: milliseconds(row.created_at_ms)!,
    }));
  }

  async logAudit(port: ActorQueryPort, input: DomainAuditInput): Promise<void> {
    if (!isObject(input) || !AUDIT_ACTIONS.has(input.action)) invalid('audit action is invalid');
    const workspace = await resolveWorkspace(port, input.workspaceId);
    let board: BoardIdentity | null = null;
    if (input.boardId !== undefined && input.boardId !== null) {
      board = await resolveBoard(port, input.workspaceId, input.boardId);
    }
    const authorization = await port.query<{ allowed: boolean }>(board ? `
      SELECT projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'write_audit') AS allowed
    ` : `
      SELECT projed_core.actor_has_workspace_capability_v1($1::uuid, 'write_audit') AS allowed
    `, board ? [workspace.id, board.id] : [workspace.id]);
    if (authorization.rows[0]?.allowed !== true) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    text(input.entityTable, 'entityTable', 120);
    const entityRef = input.entityId === undefined || input.entityId === null
      ? null
      : externalRef(input.entityId, 'entityId');
    const beforeData = jsonObject(input.beforeData, 'beforeData', true);
    const afterData = jsonObject(input.afterData, 'afterData', true);
    const actor = await port.query<{ id: string }>('SELECT projed_core.current_actor_user_id_v1()::text AS id');
    const result = await port.query(`
      INSERT INTO projed_core.audit_logs(
        id, tenant_id, project_id, actor_id, action, entity_table,
        entity_id, entity_ref, before_data, after_data
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::uuid, $8, $9::jsonb, $10::jsonb)
    `, [randomUUID(), workspace.id, board?.id ?? null, actor.rows[0]?.id, input.action, input.entityTable,
      entityRef && UUID_RE.test(entityRef) ? entityRef : null, entityRef,
      beforeData === null ? null : JSON.stringify(beforeData), afterData === null ? null : JSON.stringify(afterData)]);
    if (result.rowCount !== 1) invalid('Audit event could not be created', 503);
  }
}
