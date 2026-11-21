import type { IncomingMessage } from 'node:http';

import { runActorTransaction } from './actorTransaction.js';
import { buildCalendarFeed, CalendarRepository, calendarTokenHash, normalizeCalendarInput } from './calendar.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';

const MAX_BODY_BYTES = 128 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

type Operation =
  | { kind: 'feed'; token: string }
  | { kind: 'list' | 'create' | 'references' }
  | { kind: 'update' | 'delete' | 'enable' | 'disable' | 'rotate'; id: string };

export interface CalendarHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
  readonly text?: string;
  readonly contentType?: string;
}

function operationFor(rawUrl: string | undefined, method: string | undefined): Operation | null {
  if (!rawUrl || rawUrl.length > 8 * 1024 || rawUrl.includes('#') || rawUrl.includes('\\')) return null;
  let url: URL;
  try { url = new URL(rawUrl, 'http://127.0.0.1'); } catch { return null; }
  if (rawUrl !== `${url.pathname}${url.search}` || url.search) return null;
  const parts = url.pathname.split('/');
  if (parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'v1') return null;
  if (parts[3] === 'calendar-feeds' && parts.length === 5 && method === 'GET') {
    let candidate: string;
    try { candidate = decodeURIComponent((parts[4] ?? '').replace(/\.ics$/i, '')); } catch { return null; }
    return TOKEN_RE.test(candidate) && parts[4]?.toLowerCase().endsWith('.ics') ? { kind: 'feed', token: candidate } : null;
  }
  if (parts[3] !== 'calendar-subscriptions') return null;
  if (parts.length === 4) {
    if (method === 'GET') return { kind: 'list' };
    if (method === 'POST') return { kind: 'create' };
    return null;
  }
  if (parts.length === 5 && parts[4] === 'references' && method === 'GET') return { kind: 'references' };
  const id = parts[4] ?? '';
  if (!UUID_RE.test(id)) return null;
  if (parts.length === 5 && method === 'PATCH') return { kind: 'update', id };
  if (parts.length === 5 && method === 'DELETE') return { kind: 'delete', id };
  if (parts.length === 6 && method === 'POST') {
    if (parts[5] === 'enable') return { kind: 'enable', id };
    if (parts[5] === 'disable') return { kind: 'disable', id };
    if (parts[5] === 'rotate-token') return { kind: 'rotate', id };
  }
  return null;
}

function isNamespace(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const path = new URL(rawUrl, 'http://127.0.0.1').pathname;
    return path.startsWith('/api/v1/calendar-subscriptions') || path.startsWith('/api/v1/calendar-feeds');
  } catch { return false; }
}

function errorResult(error: unknown, requestId: string, publicFeed: boolean): CalendarHttpResult {
  const kernelError = asKernelError(error);
  if (publicFeed) {
    const status = kernelError.httpStatus === 410 ? 410 : kernelError.httpStatus >= 500 ? 500 : 404;
    return {
      matched: true,
      status,
      text: status === 410 ? 'Calendar feed is disabled' : status === 500 ? 'Calendar feed error' : 'Calendar feed not found',
      contentType: 'text/plain; charset=utf-8',
    };
  }
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

export function createCalendarHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
) {
  const repository = new CalendarRepository();
  return async (request: IncomingMessage, requestId: string): Promise<CalendarHttpResult> => {
    const operation = operationFor(request.url, request.method);
    if (!operation) {
      if (!isNamespace(request.url)) return { matched: false };
      request.resume();
      return { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } };
    }
    if (operation.kind === 'feed') {
      try {
        return {
          matched: true,
          status: 200,
          text: await buildCalendarFeed(database, config, calendarTokenHash(operation.token)),
          contentType: 'text/calendar; charset=utf-8',
        };
      } catch (error) {
        return errorResult(error, requestId, true);
      }
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
      if (actor.entry !== 'main') {
        request.resume();
        throw new KernelError('ACCESS_DENIED', 'Main Session entry is required', 403);
      }
      assertExpectedActor(request, actor);
      let data: unknown;
      if (operation.kind === 'list') {
        data = await runActorTransaction(database, config, actor, port => repository.list(port));
      } else if (operation.kind === 'references') {
        data = await runActorTransaction(database, config, actor, port => repository.listReferences(port));
      } else if (operation.kind === 'create' || operation.kind === 'update') {
        const body = await readJsonBody(request, MAX_BODY_BYTES);
        const updateId = operation.kind === 'update' ? operation.id : null;
        data = await runActorTransaction(database, config, actor, async port => {
          const input = await normalizeCalendarInput(port, body);
          return updateId === null ? repository.create(port, input) : repository.update(port, updateId, input);
        });
      } else if (operation.kind === 'enable' || operation.kind === 'disable') {
        await runActorTransaction(database, config, actor,
          port => repository.setActive(port, operation.id, operation.kind === 'enable'));
        data = null;
      } else if (operation.kind === 'rotate') {
        data = await runActorTransaction(database, config, actor, port => repository.rotate(port, operation.id));
      } else if (operation.kind === 'delete') {
        await runActorTransaction(database, config, actor, port => repository.delete(port, operation.id));
        data = null;
      } else {
        throw new KernelError('DOMAIN_DATA_INVALID', 'Calendar operation is invalid', 400);
      }
      return { matched: true, status: 200, body: { data } };
    } catch (error) {
      return errorResult(error, requestId, false);
    }
  };
}
