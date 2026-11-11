import type {
  ActivityEvent,
  ActivityEventListQuery,
  AuditLogEntry,
  EditableKnowledgeRecord,
  KnowledgeRecordInput,
  RecordTaskLink,
} from '../../types';
import { HttpApiClient } from './httpApiClient';

export interface ProjedRecordActivityAdapter {
  listRecords(workspaceRef: string, boardRef: string, signal?: AbortSignal): Promise<EditableKnowledgeRecord[]>;
  listRecordsByTask(
    workspaceRef: string,
    boardRef: string,
    taskRef: string,
    options?: { includeArchived?: boolean },
    signal?: AbortSignal,
  ): Promise<EditableKnowledgeRecord[]>;
  upsertRecord(
    workspaceRef: string,
    boardRef: string,
    input: KnowledgeRecordInput,
    signal?: AbortSignal,
  ): Promise<EditableKnowledgeRecord>;
  archiveRecord(workspaceRef: string, boardRef: string, recordRef: string, signal?: AbortSignal): Promise<void>;
  logActivity(event: Omit<ActivityEvent, 'id' | 'actorId' | 'createdAt'>, signal?: AbortSignal): Promise<void>;
  listActivity(query: ActivityEventListQuery, signal?: AbortSignal): Promise<ActivityEvent[]>;
  logAudit(entry: Omit<AuditLogEntry, 'id' | 'actorId' | 'createdAt'>, signal?: AbortSignal): Promise<void>;
}

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const ACTIVITY_EVENT_TYPES = new Set<string>([
  'task_created', 'task_assigned', 'task_collaborators_changed', 'task_status_changed',
  'task_moved', 'task_dates_changed', 'task_archived', 'task_collected', 'task_restored',
  'task_tags_changed', 'dependency_created', 'dependency_updated', 'dependency_deleted',
  'project_workspace_transferred',
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function data(value: unknown, label: string): unknown {
  const envelope = record(value, `${label}_ENVELOPE`);
  if (!hasOwn(envelope, 'data')) throw new Error(`HTTP_API_INVALID_${label}_DATA`);
  return envelope.data;
}

function items(value: unknown, label: string): unknown[] {
  const parsed = data(value, label);
  if (!Array.isArray(parsed)) throw new Error(`HTTP_API_INVALID_${label}_DATA`);
  return parsed;
}

function ref(value: string, label: string): string {
  const hasControl = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\') || hasControl) throw new Error(`HTTP_API_INVALID_${label}`);
  return encodeURIComponent(value);
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`HTTP_API_INVALID_${label}`);
  return Number(value);
}

function optionalInteger(value: unknown, label: string): number | undefined {
  return value === undefined ? undefined : integer(value, label);
}

function optionalString(value: unknown, label: string, nullable = false): string | null | undefined {
  if (value === undefined) return undefined;
  if (nullable && value === null) return null;
  if (typeof value !== 'string') throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function jsonRecord(value: unknown, label: string): Record<string, unknown> {
  return record(value, label);
}

function boardPath(workspaceRef: string, boardRef: string, suffix: string): string {
  return `/api/v1/workspaces/${ref(workspaceRef, 'WORKSPACE_REF')}/boards/${ref(boardRef, 'BOARD_REF')}/${suffix}`;
}

function parseLink(value: unknown): RecordTaskLink {
  const row = record(value, 'RECORD_LINK');
  for (const field of ['id', 'recordId', 'workspaceId', 'boardId', 'nodeId'] as const) {
    if (typeof row[field] !== 'string' || row[field] === '') throw new Error(`HTTP_API_INVALID_RECORD_LINK_${field.toUpperCase()}`);
  }
  if (typeof row.role !== 'string' || !['main', 'related', 'decision', 'blocker', 'follow_up'].includes(row.role)) {
    throw new Error('HTTP_API_INVALID_RECORD_LINK_ROLE');
  }
  return {
    id: row.id as string,
    recordId: row.recordId as string,
    workspaceId: row.workspaceId as string,
    boardId: row.boardId as string,
    nodeId: row.nodeId as string,
    role: row.role as RecordTaskLink['role'],
    createdAt: integer(row.createdAt, 'RECORD_LINK_CREATED_AT'),
  };
}

export function parseHttpKnowledgeRecord(value: unknown): EditableKnowledgeRecord {
  const row = record(value, 'KNOWLEDGE_RECORD');
  for (const field of ['id', 'workspaceId', 'boardId', 'title', 'content'] as const) {
    if (typeof row[field] !== 'string') throw new Error(`HTTP_API_INVALID_RECORD_${field.toUpperCase()}`);
  }
  if (typeof row.type !== 'string' || !['meeting', 'work_log'].includes(row.type)
      || typeof row.status !== 'string' || !['draft', 'published', 'archived'].includes(row.status)
      || typeof row.visibility !== 'string' || !['private', 'project', 'tenant'].includes(row.visibility)
      || typeof row.ragEnabled !== 'boolean' || !Array.isArray(row.taskLinks)) {
    throw new Error('HTTP_API_INVALID_RECORD_SHAPE');
  }
  const metadata = row.metadata === undefined ? undefined : jsonRecord(row.metadata, 'RECORD_METADATA');
  return {
    id: row.id as string,
    workspaceId: row.workspaceId as string,
    boardId: row.boardId as string,
    type: row.type as EditableKnowledgeRecord['type'],
    title: row.title as string,
    content: row.content as string,
    status: row.status as EditableKnowledgeRecord['status'],
    visibility: row.visibility as EditableKnowledgeRecord['visibility'],
    ...(optionalString(row.participantsText, 'RECORD_PARTICIPANTS') === undefined
      ? {} : { participantsText: row.participantsText as string }),
    ...(optionalInteger(row.occurredAt, 'RECORD_OCCURRED_AT') === undefined ? {} : { occurredAt: Number(row.occurredAt) }),
    ...(optionalInteger(row.startedAt, 'RECORD_STARTED_AT') === undefined ? {} : { startedAt: Number(row.startedAt) }),
    ...(optionalInteger(row.endedAt, 'RECORD_ENDED_AT') === undefined ? {} : { endedAt: Number(row.endedAt) }),
    recordedBy: optionalString(row.recordedBy, 'RECORD_RECORDED_BY', true),
    createdBy: optionalString(row.createdBy, 'RECORD_CREATED_BY', true),
    updatedBy: optionalString(row.updatedBy, 'RECORD_UPDATED_BY', true),
    createdAt: integer(row.createdAt, 'RECORD_CREATED_AT'),
    updatedAt: integer(row.updatedAt, 'RECORD_UPDATED_AT'),
    ragEnabled: row.ragEnabled,
    sourceDocumentId: optionalString(row.sourceDocumentId, 'RECORD_SOURCE_DOCUMENT_ID', true),
    ...(metadata === undefined ? {} : { metadata }),
    taskLinks: row.taskLinks.map(parseLink),
  };
}

function parseActivity(value: unknown): ActivityEvent {
  const row = record(value, 'ACTIVITY');
  for (const field of ['id', 'workspaceId', 'eventType', 'entityTable'] as const) {
    if (typeof row[field] !== 'string' || row[field] === '') throw new Error(`HTTP_API_INVALID_ACTIVITY_${field.toUpperCase()}`);
  }
  if (!ACTIVITY_EVENT_TYPES.has(row.eventType as string)) throw new Error('HTTP_API_INVALID_ACTIVITY_EVENT_TYPE');
  return {
    id: row.id as string,
    workspaceId: row.workspaceId as string,
    boardId: optionalString(row.boardId, 'ACTIVITY_BOARD_ID', true),
    actorId: optionalString(row.actorId, 'ACTIVITY_ACTOR_ID', true),
    eventType: row.eventType as ActivityEvent['eventType'],
    entityTable: row.entityTable as string,
    entityId: optionalString(row.entityId, 'ACTIVITY_ENTITY_ID', true),
    payload: jsonRecord(row.payload, 'ACTIVITY_PAYLOAD'),
    createdAt: integer(row.createdAt, 'ACTIVITY_CREATED_AT'),
  };
}

function recordBody(input: KnowledgeRecordInput): Record<string, unknown> {
  return {
    ...(input.id === undefined ? {} : { id: input.id }),
    type: input.type,
    title: input.title,
    content: input.content,
    status: input.status,
    visibility: input.visibility,
    ...(input.participantsText === undefined ? {} : { participantsText: input.participantsText }),
    ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
    ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
    ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    taskLinks: input.taskLinks,
  };
}

function activityPath(workspaceId: string, boardId?: string | null, suffix = 'activity'): string {
  const workspace = `/api/v1/workspaces/${ref(workspaceId, 'WORKSPACE_REF')}`;
  return boardId
    ? `${workspace}/boards/${ref(boardId, 'BOARD_REF')}/${suffix}`
    : `${workspace}/${suffix}`;
}

export function createHttpRecordActivityAdapter(client: HttpApiClient): ProjedRecordActivityAdapter {
  return {
    async listRecords(workspaceRef, boardRef, signal) {
      const response = await client.request<unknown>(boardPath(workspaceRef, boardRef, 'records'), { signal });
      return items(response, 'RECORDS').map(parseHttpKnowledgeRecord);
    },
    async listRecordsByTask(workspaceRef, boardRef, taskRef, options = {}, signal) {
      const query = options.includeArchived ? '?includeArchived=true' : '';
      const response = await client.request<unknown>(boardPath(
        workspaceRef, boardRef, `tasks/${ref(taskRef, 'TASK_REF')}/records${query}`,
      ), { signal });
      return items(response, 'TASK_RECORDS').map(parseHttpKnowledgeRecord);
    },
    async upsertRecord(workspaceRef, boardRef, input, signal) {
      const path = input.id === undefined
        ? boardPath(workspaceRef, boardRef, 'records')
        : boardPath(workspaceRef, boardRef, `records/${ref(input.id, 'RECORD_REF')}`);
      const response = await client.request<unknown>(path, {
        method: input.id === undefined ? 'POST' : 'PUT', body: recordBody(input), signal,
      });
      return parseHttpKnowledgeRecord(data(response, 'RECORD_UPSERT'));
    },
    async archiveRecord(workspaceRef, boardRef, recordRef, signal) {
      await client.request<unknown>(boardPath(workspaceRef, boardRef, `records/${ref(recordRef, 'RECORD_REF')}`), {
        method: 'DELETE', signal,
      });
    },
    async logActivity(event, signal) {
      await client.request<unknown>(activityPath(event.workspaceId, event.boardId), {
        method: 'POST',
        body: {
          eventType: event.eventType,
          entityTable: event.entityTable,
          entityId: event.entityId ?? null,
          payload: event.payload,
        },
        signal,
      });
    },
    async listActivity(query, signal) {
      if (query.scope === 'board' && !query.boardId) throw new Error('HTTP_API_INVALID_ACTIVITY_BOARD_ID');
      const params = new URLSearchParams({
        startedAt: String(query.startedAt),
        endedAt: String(query.endedAt),
      });
      if (query.startBoundary) params.set('startBoundary', query.startBoundary);
      for (const eventType of query.eventTypes ?? []) params.append('eventType', eventType);
      const response = await client.request<unknown>(`${activityPath(
        query.workspaceId, query.scope === 'board' ? query.boardId : null,
      )}?${params}`, { signal });
      return items(response, 'ACTIVITY').map(parseActivity);
    },
    async logAudit(entry, signal) {
      await client.request<unknown>(activityPath(entry.workspaceId, entry.boardId, 'audit'), {
        method: 'POST',
        body: {
          action: entry.action,
          entityTable: entry.entityTable,
          entityId: entry.entityId ?? null,
          beforeData: entry.beforeData ?? null,
          afterData: entry.afterData ?? null,
        },
        signal,
      });
    },
  };
}
