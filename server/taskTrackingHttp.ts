import type { IncomingMessage } from 'node:http';

import { runActorTransaction } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';
import { TaskTrackingRepository } from './taskTracking.js';

export interface TaskTrackingHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

type Operation =
  | { kind: 'capability' }
  | { kind: 'list' | 'staged' | 'canonical' | 'create'; workspaceRef: string }
  | { kind: 'move' | 'stage' | 'place-staged' | 'remove' | 'restore'; workspaceRef: string; referenceId: string };

function segment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    const control = Array.from(decoded).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    return decoded && decoded.length <= 512 && decoded !== '.' && decoded !== '..'
      && !decoded.includes('/') && !decoded.includes('\\') && !control ? decoded : null;
  } catch {
    return null;
  }
}

function operationFor(rawUrl: string | undefined, method: string | undefined): Operation | null {
  if (!rawUrl || rawUrl.includes('?') || rawUrl.includes('#') || rawUrl.includes('\\')) return null;
  if (rawUrl === '/api/v1/task-tracking/capability' && method === 'GET') return { kind: 'capability' };
  const parts = rawUrl.split('/');
  if (parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1' || parts[3] !== 'workspaces'
      || parts[5] !== 'tracking-references') return null;
  const workspaceRef = segment(parts[4] ?? '');
  if (!workspaceRef) return null;
  if (parts.length === 6) {
    if (method === 'GET') return { kind: 'list', workspaceRef };
    if (method === 'POST') return { kind: 'create', workspaceRef };
    return null;
  }
  if (parts.length === 7 && parts[6] === 'staged' && method === 'GET') return { kind: 'staged', workspaceRef };
  if (parts.length === 7 && parts[6] === 'canonical-tasks' && method === 'POST') return { kind: 'canonical', workspaceRef };
  if (parts.length !== 8 || method !== 'POST') return null;
  const referenceId = segment(parts[6] ?? '');
  if (!referenceId) return null;
  switch (parts[7]) {
    case 'move': return { kind: 'move', workspaceRef, referenceId };
    case 'stage': return { kind: 'stage', workspaceRef, referenceId };
    case 'place-staged': return { kind: 'place-staged', workspaceRef, referenceId };
    case 'remove': return { kind: 'remove', workspaceRef, referenceId };
    case 'restore': return { kind: 'restore', workspaceRef, referenceId };
    default: return null;
  }
}

function isNamespace(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const pathname = new URL(rawUrl, 'http://127.0.0.1').pathname;
    return pathname === '/api/v1/task-tracking/capability'
      || /^\/api\/v1\/workspaces\/[^/]+\/tracking-references(?:\/|$)/u.test(pathname);
  } catch {
    return false;
  }
}

function errorResult(error: unknown, requestId: string): TaskTrackingHttpResult {
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

export function createTaskTrackingHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  repository = new TaskTrackingRepository(),
) {
  return async (request: IncomingMessage, requestId: string): Promise<TaskTrackingHttpResult> => {
    const operation = operationFor(request.url, request.method);
    if (!operation) {
      if (!isNamespace(request.url)) return { matched: false };
      request.resume();
      return { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } };
    }
    if (!resolveActor) {
      request.resume();
      return { matched: true, status: 404, body: { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } } };
    }
    if (request.method !== 'GET' && !isSameOriginWrite(request)) {
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
      if (operation.kind === 'capability') {
        const data = await repository.capability();
        return { matched: true, status: 200, body: { data } };
      }
      if (operation.kind === 'list') {
        const data = await runActorTransaction(database, config, actor, port => repository.list(port, operation.workspaceRef));
        return { matched: true, status: 200, body: { data } };
      }
      if (operation.kind === 'staged') {
        const data = await runActorTransaction(database, config, actor, port => repository.listStaged(port, operation.workspaceRef));
        return { matched: true, status: 200, body: { data } };
      }
      const body = await readJsonBody(request);
      if (operation.kind === 'canonical') {
        if (Object.keys(body).join('|') !== 'taskIds') {
          throw new KernelError('DOMAIN_DATA_INVALID', 'Canonical task request is invalid', 400);
        }
        const data = await runActorTransaction(
          database,
          config,
          actor,
          port => repository.listCanonicalTasks(port, operation.workspaceRef, body.taskIds),
        );
        return { matched: true, status: 200, body: { data } };
      }
      if (operation.kind !== 'create' && 'referenceId' in operation) {
        if (body.sourcePlacementId !== undefined && body.sourcePlacementId !== operation.referenceId) {
          throw new KernelError('DOMAIN_DATA_INVALID', 'Tracking reference path does not match the request body', 400);
        }
        body.sourcePlacementId = operation.referenceId;
      }
      const data = await runActorTransaction<unknown>(database, config, actor, async port => {
        switch (operation.kind) {
          case 'create': return repository.create(port, operation.workspaceRef, body);
          case 'move': return repository.move(port, operation.workspaceRef, body);
          case 'stage': return repository.stage(port, operation.workspaceRef, body);
          case 'place-staged': return repository.placeStaged(port, operation.workspaceRef, body);
          case 'remove': return repository.remove(port, operation.workspaceRef, body);
          case 'restore': return repository.restore(port, operation.workspaceRef, body);
          default: throw new KernelError('DOMAIN_DATA_INVALID', 'Tracking operation is invalid', 400);
        }
      });
      return operation.kind === 'remove'
        ? { matched: true, status: 204 }
        : { matched: true, status: 200, body: { data } };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
