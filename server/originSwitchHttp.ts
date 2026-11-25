import type { IncomingMessage } from 'node:http';
import { runActorTransaction } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { assertExpectedActor } from './expectedActorHttp.js';
import { asKernelError, KernelError } from './errors.js';
import type { OriginSwitchConfig } from './originSwitchConfig.js';
import { OriginSwitchRepository, validateOriginSwitchId } from './originSwitch.js';
import type { QuickTaskHttpResult } from './quickTaskHttp.js';

export function createOriginSwitchHttpDispatcher(config: RuntimeConfig, database: RuntimeDatabase,
  campaign: OriginSwitchConfig | null, resolveActor?: TrustedSessionActorResolver) {
  const repository = campaign ? new OriginSwitchRepository(campaign) : null;
  return async (request: IncomingMessage, requestId: string): Promise<QuickTaskHttpResult> => {
    const path = request.url ?? '';
    if (!path.startsWith('/api/v1/origin-switch/')) return { matched: false };
    const error = (status: number, code: string): QuickTaskHttpResult => ({ matched: true, status,
      body: { error: { code, requestId, retryable: status === 429 || status >= 500 } } });
    if (path === '/api/v1/origin-switch/config') {
      if (request.method !== 'GET') { request.resume(); return error(405, 'METHOD_NOT_ALLOWED'); }
      return { matched: true, status: 200, body: { data: campaign } };
    }
    const create = path === '/api/v1/origin-switch/intents';
    const match = /^\/api\/v1\/origin-switch\/intents\/([^/?]+)(\/confirm)?$/u.exec(path);
    if (!create && !match) { request.resume(); return error(404, 'ENDPOINT_UNAVAILABLE'); }
    if (!repository || !resolveActor) { request.resume(); return error(404, 'ENDPOINT_UNAVAILABLE'); }
    const confirm = match?.[2] === '/confirm';
    if (request.method !== (create || confirm ? 'POST' : 'GET')) { request.resume(); return error(405, 'METHOD_NOT_ALLOWED'); }
    if (request.method === 'POST' && !isSameOriginWrite(request)) { request.resume(); return error(403, 'ACCESS_DENIED'); }
    try {
      const actor = await resolveActor(request);
      assertExpectedActor(request, actor);
      const body = request.method === 'POST' ? await readJsonBody(request) : {};
      if (create) {
        if (Object.keys(body).sort().join('|') !== 'campaign|entry|id|targetOrigin'
          || typeof body.campaign !== 'string' || typeof body.targetOrigin !== 'string'
          || (body.entry !== 'main' && body.entry !== 'quick')) throw new KernelError('DOMAIN_DATA_INVALID', 'Invalid origin intent', 400);
        validateOriginSwitchId(body.id);
        const input: { id: string; campaign: string; entry: 'main' | 'quick'; targetOrigin: string }
          = { id: body.id, campaign: body.campaign, entry: body.entry, targetOrigin: body.targetOrigin };
        const data = await runActorTransaction(database, config, actor, port => repository.create(port, actor, input),
          { originSwitchIntentId: input.id });
        return { matched: true, status: 200, body: { data } };
      }
      const id = match?.[1]; validateOriginSwitchId(id);
      if (Object.keys(body).length) throw new KernelError('DOMAIN_DATA_INVALID', 'Invalid origin confirmation', 400);
      const data = await runActorTransaction(database, config, actor, port => confirm
        ? repository.confirm(port, actor, id) : repository.read(port, actor, id), { originSwitchIntentId: id });
      return { matched: true, status: 200, body: { data } };
    } catch (failure) {
      const problem = asKernelError(failure);
      return error(problem.httpStatus, problem.code);
    }
  };
}
