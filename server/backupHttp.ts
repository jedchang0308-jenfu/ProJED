import type { IncomingMessage } from 'node:http';

import { runActorTransaction } from './actorTransaction.js';
import { BackupRepository, parseExecuteRequest, parsePlanRequest } from './backup.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';

const MAX_BACKUP_REQUEST_BYTES = 12 * 1024 * 1024;

export interface BackupHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

type Operation =
  | { kind: 'source' | 'fingerprint'; workspaceRef: string; boardRef: string }
  | { kind: 'plan' | 'execute' };

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
  if (!rawUrl || rawUrl.length > 8 * 1024 || rawUrl.includes('?') || rawUrl.includes('#') || rawUrl.includes('\\')) return null;
  if (method === 'POST' && rawUrl === '/api/v1/backup/import/plan') return { kind: 'plan' };
  if (method === 'POST' && rawUrl === '/api/v1/backup/import/execute') return { kind: 'execute' };
  const parts = rawUrl.split('/');
  if (method !== 'GET' || parts.length !== 9 || parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1'
      || parts[3] !== 'workspaces' || parts[5] !== 'boards' || parts[7] !== 'backup') return null;
  const workspaceRef = segment(parts[4] ?? '');
  const boardRef = segment(parts[6] ?? '');
  if (!workspaceRef || !boardRef) return null;
  if (parts[8] !== 'source' && parts[8] !== 'fingerprint') return null;
  return { kind: parts[8], workspaceRef, boardRef };
}

function isNamespace(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const pathname = new URL(rawUrl, 'http://127.0.0.1').pathname;
    return pathname.startsWith('/api/v1/backup/')
      || /^\/api\/v1\/workspaces\/[^/]+\/boards\/[^/]+\/backup(?:\/|$)/u.test(pathname);
  } catch {
    return false;
  }
}

function errorResult(error: unknown, requestId: string): BackupHttpResult {
  const kernelError = asKernelError(error);
  return {
    matched: true,
    status: kernelError.httpStatus,
    body: { error: {
      code: kernelError.code,
      requestId,
      retryable: kernelError.httpStatus === 429 || kernelError.httpStatus >= 500,
    } },
  };
}

export function createBackupHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  repository = new BackupRepository(),
) {
  return async (request: IncomingMessage, requestId: string): Promise<BackupHttpResult> => {
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
    if (request.method === 'POST' && !isSameOriginWrite(request)) {
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
      if (operation.kind === 'source') {
        const data = await runActorTransaction(database, config, actor,
          port => repository.readBoardSource(port, operation.workspaceRef, operation.boardRef));
        return { matched: true, status: 200, body: { data } };
      }
      if (operation.kind === 'fingerprint') {
        const data = await runActorTransaction(database, config, actor,
          port => repository.readBoardFingerprint(port, operation.workspaceRef, operation.boardRef));
        return { matched: true, status: 200, body: { data } };
      }
      const body = await readJsonBody(request, MAX_BACKUP_REQUEST_BYTES);
      const data = operation.kind === 'plan'
        ? await runActorTransaction(database, config, actor, port => repository.planImport(port, parsePlanRequest(body)))
        : await runActorTransaction(database, config, actor, port => repository.executeImport(port, parseExecuteRequest(body)));
      return { matched: true, status: 200, body: { data } };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
