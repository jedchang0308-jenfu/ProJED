import type { IncomingMessage } from 'node:http';

import { runActorTransaction } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { QuickTaskRepository, type QuickTaskCreateInput } from './quickTask.js';

export interface QuickTaskHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

function errorResult(error: unknown, requestId: string): QuickTaskHttpResult {
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

export function createQuickTaskHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  repository = new QuickTaskRepository(),
) {
  return async (request: IncomingMessage, requestId: string): Promise<QuickTaskHttpResult> => {
    if (request.url !== '/api/v1/quick-tasks') return { matched: false };
    if (request.method !== 'POST') {
      if (request.method !== 'GET') request.resume();
      return { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } };
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
      if (actor.entry !== 'quick') {
        request.resume();
        throw new KernelError('ACCESS_DENIED', 'Quick task Session entry is required', 403);
      }
      assertExpectedActor(request, actor);
      const body = await readJsonBody(request);
      const keys = Object.keys(body).sort().join('|');
      if (keys !== 'captureId|title|workspaceHint') {
        throw new KernelError('DOMAIN_DATA_INVALID', 'Quick task body is invalid', 400);
      }
      const data = await runActorTransaction(database, config, actor, port => repository.create(
        port,
        body as unknown as QuickTaskCreateInput,
      ));
      return { matched: true, status: data.created ? 201 : 200, body: { data } };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
