import type { IncomingMessage } from 'node:http';

import { runActorTransaction, type ServerActorV1 } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { TaskWorkbenchRepository } from './taskWorkbench.js';

export interface TaskWorkbenchHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

function errorResult(error: unknown, requestId: string): TaskWorkbenchHttpResult {
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

function taskPath(url: URL): string | null {
  const match = /^\/api\/v1\/task-workbench\/unplaced\/([^/]+)$/u.exec(url.pathname);
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]!);
    return decoded && !decoded.includes('/') && !decoded.includes('\\') ? decoded : null;
  } catch {
    return null;
  }
}

function assertExpectedActor(request: IncomingMessage, actor: ServerActorV1): void {
  const expectedAccountId = request.headers['x-projed-expected-account-id'];
  const expectedContextId = request.headers['x-projed-expected-context-id'];
  if (typeof expectedAccountId !== 'string' || typeof expectedContextId !== 'string'
      || expectedAccountId !== actor.localUserId || expectedContextId !== actor.contextId) {
    throw new KernelError('ACTOR_CHANGED', 'Session actor changed before task workbench request', 409);
  }
}

export function createTaskWorkbenchHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  repository = new TaskWorkbenchRepository(),
) {
  return async (request: IncomingMessage, requestId: string): Promise<TaskWorkbenchHttpResult> => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const isList = url.pathname === '/api/v1/task-workbench/unplaced' && request.method === 'GET';
    const isPlace = url.pathname === '/api/v1/task-workbench/placements' && request.method === 'POST';
    const itemId = taskPath(url);
    const isUpsert = itemId !== null && request.method === 'PUT';
    const isDelete = itemId !== null && request.method === 'DELETE';
    const isNamespace = url.pathname === '/api/v1/task-workbench/unplaced'
      || url.pathname === '/api/v1/task-workbench/placements'
      || url.pathname.startsWith('/api/v1/task-workbench/unplaced/');
    if (!isNamespace) return { matched: false };
    if ((!isList && !isPlace && !isUpsert && !isDelete) || url.search !== '') {
      request.resume();
      return { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } };
    }
    if (!resolveActor) {
      request.resume();
      return { matched: true, status: 404, body: { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } } };
    }
    if (!isList && !isSameOriginWrite(request)) {
      request.resume();
      return { matched: true, status: 403, body: { error: { code: 'ACCESS_DENIED', requestId, retryable: false } } };
    }
    try {
      const actor = await resolveActor(request);
      if (actor.entry !== 'main') {
        request.resume();
        throw new KernelError('ACCESS_DENIED', 'Main Session entry is required', 403);
      }
      assertExpectedActor(request, actor);
      if (isList) {
        const data = await runActorTransaction(database, config, actor, port => repository.list(port));
        return { matched: true, status: 200, body: { data } };
      }
      if (isDelete) {
        await runActorTransaction(database, config, actor, port => repository.remove(port, itemId));
        return { matched: true, status: 204 };
      }
      const body = await readJsonBody(request);
      if (isUpsert) {
        if (Object.keys(body).join('|') !== 'task') {
          throw new KernelError('DOMAIN_DATA_INVALID', 'Unplaced task body is invalid', 400);
        }
        const data = await runActorTransaction(database, config, actor, port => repository.upsert(port, itemId, body.task));
        return { matched: true, status: 200, body: { data } };
      }
      const data = await runActorTransaction(database, config, actor, port => repository.place(port, body));
      return { matched: true, status: 200, body: { data } };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
