import type { IncomingMessage } from 'node:http';

import { runActorTransaction } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import {
  DomainWriteRepository,
  type DomainDependencyCreate,
  type DomainTaskCreate,
  type DomainTaskTagCreate,
  type DomainTaskTagUpdate,
  type DomainTaskUpdate,
} from './domainWrite.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { asKernelError, KernelError } from './errors.js';

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
export const MAX_RECORD_BODY_BYTES = 32 * 1024 * 1024;

export interface DomainWriteHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

type DomainWriteOperation =
  | { kind: 'task-create'; workspaceRef: string; boardRef: string }
  | { kind: 'task-update' | 'task-delete'; workspaceRef: string; boardRef: string; itemRef: string }
  | { kind: 'task-batch'; workspaceRef: string; boardRef: string }
  | { kind: 'task-tags'; workspaceRef: string; boardRef: string; itemRef: string }
  | { kind: 'tag-create'; workspaceRef: string }
  | { kind: 'tag-update' | 'tag-delete'; workspaceRef: string; itemRef: string }
  | { kind: 'dependency-create'; workspaceRef: string; boardRef: string }
  | { kind: 'dependency-set' | 'dependency-update' | 'dependency-delete'; workspaceRef: string; boardRef: string; itemRef: string };

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

function operationFor(rawUrl: string | undefined, method: string | undefined): DomainWriteOperation | null {
  if (!rawUrl || rawUrl.length > 8 * 1024 || rawUrl.includes('?') || rawUrl.includes('#') || rawUrl.includes('\\')) return null;
  const parts = rawUrl.split('/');
  if (parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1' || parts[3] !== 'workspaces') return null;
  const workspaceRef = segment(parts[4] ?? '');
  if (!workspaceRef) return null;
  if (parts.length === 6 && parts[5] === 'tags' && method === 'POST') return { kind: 'tag-create', workspaceRef };
  if (parts.length === 7 && parts[5] === 'tags') {
    const itemRef = segment(parts[6] ?? '');
    if (!itemRef) return null;
    if (method === 'PATCH') return { kind: 'tag-update', workspaceRef, itemRef };
    if (method === 'DELETE') return { kind: 'tag-delete', workspaceRef, itemRef };
    return null;
  }
  if (parts.length < 8 || parts[5] !== 'boards') return null;
  const boardRef = segment(parts[6] ?? '');
  if (!boardRef) return null;
  if (parts.length === 8 && parts[7] === 'tasks' && method === 'POST') return { kind: 'task-create', workspaceRef, boardRef };
  if (parts.length === 8 && parts[7] === 'tasks:batch-update' && method === 'POST') return { kind: 'task-batch', workspaceRef, boardRef };
  if (parts.length === 8 && parts[7] === 'dependencies' && method === 'POST') {
    return { kind: 'dependency-create', workspaceRef, boardRef };
  }
  const itemRef = segment(parts[8] ?? '');
  if (!itemRef) return null;
  if (parts.length === 10 && parts[7] === 'tasks' && parts[9] === 'tags' && method === 'PUT') {
    return { kind: 'task-tags', workspaceRef, boardRef, itemRef };
  }
  if (parts.length !== 9) return null;
  if (parts[7] === 'tasks') {
    if (method === 'PATCH') return { kind: 'task-update', workspaceRef, boardRef, itemRef };
    if (method === 'DELETE') return { kind: 'task-delete', workspaceRef, boardRef, itemRef };
  }
  if (parts[7] === 'dependencies') {
    if (method === 'PUT') return { kind: 'dependency-set', workspaceRef, boardRef, itemRef };
    if (method === 'PATCH') return { kind: 'dependency-update', workspaceRef, boardRef, itemRef };
    if (method === 'DELETE') return { kind: 'dependency-delete', workspaceRef, boardRef, itemRef };
  }
  return null;
}

function isWriteShape(rawUrl: string | undefined): boolean {
  return rawUrl?.startsWith('/api/v1/workspaces/') === true
    && (/\/(?:tasks(?::batch-update)?|dependencies|tags)(?:\/|$)/.test(rawUrl));
}

function errorResult(error: unknown, requestId: string): DomainWriteHttpResult {
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

export function isSameOriginWrite(request: IncomingMessage): boolean {
  const fetchSite = request.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site') return false;
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  const forwardedProtocol = request.headers['x-forwarded-proto'];
  if (Array.isArray(forwardedProtocol) || (typeof forwardedProtocol === 'string' && forwardedProtocol.includes(','))) {
    return false;
  }
  const protocol = typeof forwardedProtocol === 'string'
    ? forwardedProtocol.trim().toLowerCase()
    : ((request.socket as { encrypted?: boolean } | undefined)?.encrypted ? 'https' : 'http');
  if (protocol !== 'http' && protocol !== 'https') return false;
  try {
    return new URL(origin).origin.toLowerCase() === new URL(`${protocol}://${host}`).origin.toLowerCase();
  } catch {
    return false;
  }
}

export async function readJsonBody(
  request: IncomingMessage,
  maximumBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const contentType = request.headers['content-type'] ?? '';
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'JSON request body is required', 415);
  }
  const declared = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    request.resume();
    throw new KernelError('DOMAIN_DATA_INVALID', 'Request body is too large', 413);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumBytes) tooLarge = true;
    else chunks.push(bytes);
  }
  if (tooLarge) throw new KernelError('DOMAIN_DATA_INVALID', 'Request body is too large', 413);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Request body is invalid', 400);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Request body must be an object', 400);
  }
  return value as Record<string, unknown>;
}

export function createDomainWriteHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  repository = new DomainWriteRepository(),
) {
  return async (request: IncomingMessage, requestId: string): Promise<DomainWriteHttpResult> => {
    if (request.method === 'GET') return { matched: false };
    const operation = operationFor(request.url, request.method);
    if (!operation) {
      return isWriteShape(request.url)
        ? { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } }
        : { matched: false };
    }
    if (!resolveActor) {
      request.resume();
      return { matched: true, status: 404, body: { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } } };
    }
    if (!isSameOriginWrite(request)) {
      request.resume();
      return { matched: true, status: 403, body: { error: { code: 'ACCESS_DENIED', requestId, retryable: false } } };
    }
    try {
      const actor = await resolveActor(request);
      const body = request.method === 'DELETE' ? {} : await readJsonBody(request);
      const data = await runActorTransaction(database, config, actor, async (port) => {
        switch (operation.kind) {
          case 'task-create': return repository.createTask(port, operation.workspaceRef, operation.boardRef, body as unknown as DomainTaskCreate);
          case 'task-update': return repository.updateTask(port, operation.workspaceRef, operation.boardRef, operation.itemRef, body as DomainTaskUpdate);
          case 'task-delete': return repository.deleteTask(port, operation.workspaceRef, operation.boardRef, operation.itemRef);
          case 'task-batch': {
            if (!Array.isArray(body.updates)) throw new KernelError('DOMAIN_DATA_INVALID', 'Task updates are required', 400);
            return repository.batchUpdateTasks(
              port, operation.workspaceRef, operation.boardRef,
              body.updates as Array<{ id: string; data: DomainTaskUpdate }>,
            );
          }
          case 'task-tags': {
            if (!Array.isArray(body.tagIds)) throw new KernelError('DOMAIN_DATA_INVALID', 'tagIds are required', 400);
            return repository.setTaskTags(port, operation.workspaceRef, operation.boardRef, operation.itemRef, body.tagIds as string[]);
          }
          case 'tag-create': return repository.createTag(port, operation.workspaceRef, body as unknown as DomainTaskTagCreate);
          case 'tag-update': return repository.updateTag(port, operation.workspaceRef, operation.itemRef, body as DomainTaskTagUpdate);
          case 'tag-delete': return repository.deleteTag(port, operation.workspaceRef, operation.itemRef);
          case 'dependency-create': return repository.setDependency(port, operation.workspaceRef, operation.boardRef, body as unknown as DomainDependencyCreate);
          case 'dependency-set': return repository.setDependency(
            port, operation.workspaceRef, operation.boardRef, { ...body, id: operation.itemRef } as unknown as DomainDependencyCreate,
          );
          case 'dependency-update': return repository.updateDependency(port, operation.workspaceRef, operation.boardRef, operation.itemRef, body);
          case 'dependency-delete': return repository.deleteDependency(port, operation.workspaceRef, operation.boardRef, operation.itemRef);
        }
      });
      return { matched: true, status: operation.kind.endsWith('create') ? 201 : 200, body: { data: data ?? null } };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
