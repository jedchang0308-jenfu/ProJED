import type { IncomingMessage } from 'node:http';
import { runActorTransaction } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { asKernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';
import { QuickTaskRepository } from './quickTask.js';
import type { QuickTaskHttpResult } from './quickTaskHttp.js';

/** Source-prepared readback. Not registered in the production runtime yet. */
export function createQuickTaskReceiptHttpDispatcher(config: RuntimeConfig, database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver, repository = new QuickTaskRepository()) {
  return async (request: IncomingMessage, requestId: string): Promise<QuickTaskHttpResult> => {
    const match = /^\/api\/v1\/quick-tasks\/([^/?]+)\/receipt$/u.exec(request.url ?? '');
    const captureId = match?.[1];
    if (!captureId) return { matched: false };
    const error = (status: number, code: string): QuickTaskHttpResult => ({ matched: true, status,
      body: { error: { code, requestId, retryable: status === 429 || status >= 500 } } });
    if (request.method !== 'GET') { request.resume(); return error(405, 'METHOD_NOT_ALLOWED'); }
    if (!resolveActor) return error(404, 'ENDPOINT_UNAVAILABLE');
    try {
      const actor = await resolveActor(request);
      assertExpectedActor(request, actor);
      const data = await runActorTransaction(database, config, actor, port => repository.readReceipt(port, captureId));
      return { matched: true, status: 200, body: { data } };
    } catch (failure) {
      const problem = asKernelError(failure);
      return error(problem.httpStatus, problem.code);
    }
  };
}
