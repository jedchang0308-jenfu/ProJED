import type { IncomingMessage } from 'node:http';

import { runActorTransaction } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { asKernelError, KernelError } from './errors.js';
import {
  RecordActivityRepository,
  type DomainActivityEventInput,
  type DomainActivityQuery,
  type DomainAuditInput,
  type DomainKnowledgeRecordInput,
} from './recordActivity.js';
import { isSameOriginWrite, MAX_RECORD_BODY_BYTES, readJsonBody } from './domainWriteHttp.js';

export interface RecordActivityHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

type RecordActivityOperation =
  | { kind: 'records-list' | 'record-create'; workspaceRef: string; boardRef: string }
  | { kind: 'record-update' | 'record-delete'; workspaceRef: string; boardRef: string; recordRef: string }
  | { kind: 'task-records'; workspaceRef: string; boardRef: string; taskRef: string; includeArchived: boolean }
  | { kind: 'activity-list' | 'activity-create' | 'audit-create'; workspaceRef: string; boardRef?: string; query?: DomainActivityQuery };

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function segment(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return decoded.length > 0 && decoded.length <= 512 && decoded !== '.' && decoded !== '..'
    && !decoded.includes('/') && !decoded.includes('\\') && !hasControlCharacter(decoded)
    ? decoded
    : null;
}

function activityQuery(url: URL, workspaceRef: string, boardRef?: string): DomainActivityQuery | null {
  if (!url.searchParams.has('startedAt') || !url.searchParams.has('endedAt')) return null;
  const startedAt = Number(url.searchParams.get('startedAt'));
  const endedAt = Number(url.searchParams.get('endedAt'));
  const boundary = url.searchParams.get('startBoundary');
  const eventTypes = url.searchParams.getAll('eventType');
  if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(endedAt)
      || (boundary !== null && boundary !== 'inclusive' && boundary !== 'exclusive')) return null;
  const allowed = new Set(['startedAt', 'endedAt', 'startBoundary', 'eventType']);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key))) return null;
  return {
    workspaceId: workspaceRef,
    boardId: boardRef ?? null,
    scope: boardRef === undefined ? 'workspace' : 'board',
    startedAt,
    endedAt,
    ...(boundary === null ? {} : { startBoundary: boundary }),
    ...(eventTypes.length ? { eventTypes } : {}),
  };
}

function operationFor(rawUrl: string | undefined, method: string | undefined): RecordActivityOperation | null {
  if (!rawUrl || rawUrl.length > 8 * 1024 || rawUrl.includes('#') || rawUrl.includes('\\')) return null;
  let url: URL;
  try {
    url = new URL(rawUrl, 'http://127.0.0.1');
  } catch {
    return null;
  }
  const parts = url.pathname.split('/');
  if (parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1' || parts[3] !== 'workspaces') return null;
  const workspaceRef = segment(parts[4] ?? '');
  if (!workspaceRef) return null;
  if (parts.length === 6 && parts[5] === 'activity') {
    if (method === 'POST' && url.search === '') return { kind: 'activity-create', workspaceRef };
    if (method === 'GET') {
      const query = activityQuery(url, workspaceRef);
      return query ? { kind: 'activity-list', workspaceRef, query } : null;
    }
    return null;
  }
  if (parts.length === 6 && parts[5] === 'audit' && method === 'POST' && url.search === '') {
    return { kind: 'audit-create', workspaceRef };
  }
  if (parts.length < 8 || parts[5] !== 'boards') return null;
  const boardRef = segment(parts[6] ?? '');
  if (!boardRef) return null;
  if (parts.length === 8 && parts[7] === 'records' && url.search === '') {
    if (method === 'GET') return { kind: 'records-list', workspaceRef, boardRef };
    if (method === 'POST') return { kind: 'record-create', workspaceRef, boardRef };
    return null;
  }
  if (parts.length === 8 && parts[7] === 'activity') {
    if (method === 'POST' && url.search === '') return { kind: 'activity-create', workspaceRef, boardRef };
    if (method === 'GET') {
      const query = activityQuery(url, workspaceRef, boardRef);
      return query ? { kind: 'activity-list', workspaceRef, boardRef, query } : null;
    }
    return null;
  }
  if (parts.length === 8 && parts[7] === 'audit' && method === 'POST' && url.search === '') {
    return { kind: 'audit-create', workspaceRef, boardRef };
  }
  if (parts.length === 9 && parts[7] === 'records' && url.search === '') {
    const recordRef = segment(parts[8] ?? '');
    if (!recordRef) return null;
    if (method === 'PUT') return { kind: 'record-update', workspaceRef, boardRef, recordRef };
    if (method === 'DELETE') return { kind: 'record-delete', workspaceRef, boardRef, recordRef };
    return null;
  }
  if (parts.length === 10 && parts[7] === 'tasks' && parts[9] === 'records' && method === 'GET') {
    const taskRef = segment(parts[8] ?? '');
    if (!taskRef) return null;
    const includeArchived = url.searchParams.get('includeArchived');
    if ([...url.searchParams.keys()].some(key => key !== 'includeArchived')
        || (includeArchived !== null && includeArchived !== 'true' && includeArchived !== 'false')) return null;
    return { kind: 'task-records', workspaceRef, boardRef, taskRef, includeArchived: includeArchived === 'true' };
  }
  return null;
}

function isRecordActivityShape(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const path = new URL(rawUrl, 'http://127.0.0.1').pathname;
    return path.startsWith('/api/v1/workspaces/') && /\/(?:records|activity|audit)(?:\/|$)/.test(path);
  } catch {
    return false;
  }
}

function errorResult(error: unknown, requestId: string): RecordActivityHttpResult {
  const kernelError = asKernelError(error);
  return {
    matched: true,
    status: kernelError.httpStatus,
    body: {
      error: {
        code: kernelError.code,
        requestId,
        retryable: kernelError.httpStatus === 429 || kernelError.httpStatus >= 500,
      },
    },
  };
}

export function createRecordActivityHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  repository = new RecordActivityRepository(),
) {
  return async (request: IncomingMessage, requestId: string): Promise<RecordActivityHttpResult> => {
    const operation = operationFor(request.url, request.method);
    if (!operation) {
      return isRecordActivityShape(request.url)
        ? { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } }
        : { matched: false };
    }
    if (!resolveActor) {
      if (request.method !== 'GET') request.resume();
      return { matched: true, status: 404, body: { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } } };
    }
    if (request.method !== 'GET' && !isSameOriginWrite(request)) {
      request.resume();
      return { matched: true, status: 403, body: { error: { code: 'ACCESS_DENIED', requestId, retryable: false } } };
    }
    try {
      const actor = await resolveActor(request);
      const body = request.method === 'GET' || request.method === 'DELETE'
        ? {}
        : await readJsonBody(
          request,
          operation.kind === 'record-create' || operation.kind === 'record-update'
            ? MAX_RECORD_BODY_BYTES
            : undefined,
        );
      const data = await runActorTransaction(database, config, actor, async (port) => {
        switch (operation.kind) {
          case 'records-list': return repository.listRecords(port, operation.workspaceRef, operation.boardRef);
          case 'task-records': return repository.listRecordsByTask(
            port, operation.workspaceRef, operation.boardRef, operation.taskRef, operation.includeArchived,
          );
          case 'record-create': return repository.upsertRecord(
            port, operation.workspaceRef, operation.boardRef, body as unknown as DomainKnowledgeRecordInput,
          );
          case 'record-update': return repository.upsertRecord(
            port, operation.workspaceRef, operation.boardRef,
            { ...body, id: operation.recordRef } as unknown as DomainKnowledgeRecordInput,
          );
          case 'record-delete': return repository.archiveRecord(
            port, operation.workspaceRef, operation.boardRef, operation.recordRef,
          );
          case 'activity-list': {
            if (!operation.query) throw new KernelError('DOMAIN_DATA_INVALID', 'Activity query is required', 400);
            return repository.listActivity(port, operation.query);
          }
          case 'activity-create': return repository.logActivity(port, {
            ...body,
            workspaceId: operation.workspaceRef,
            boardId: operation.boardRef ?? null,
          } as unknown as DomainActivityEventInput);
          case 'audit-create': return repository.logAudit(port, {
            ...body,
            workspaceId: operation.workspaceRef,
            boardId: operation.boardRef ?? null,
          } as unknown as DomainAuditInput);
        }
      });
      return {
        matched: true,
        status: operation.kind === 'record-create' || operation.kind === 'activity-create' || operation.kind === 'audit-create' ? 201 : 200,
        body: { data: data ?? null },
      };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
