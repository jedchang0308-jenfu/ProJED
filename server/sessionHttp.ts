import type { IncomingMessage } from 'node:http';

import { runActorTransaction, type ServerActorV1 } from './actorTransaction.js';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase } from './db.js';
import type { TrustedSessionActorResolver } from './domainReadHttp.js';
import { asKernelError, KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';
import { isSameOriginWrite, readJsonBody } from './domainWriteHttp.js';

export type TrustedSessionDestroyer = (request: IncomingMessage) => Promise<void>;

export interface SessionHttpResult {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

type SessionProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at_ms: string;
};

function errorResult(error: unknown, requestId: string): SessionHttpResult {
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

function profileData(row: SessionProfileRow, actor: ServerActorV1) {
  const createdAt = Number(row.created_at_ms);
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'Stored profile timestamp is invalid', 503);
  }
  return {
    localUserId: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt,
    expiresAt: actor.expiresAtMs,
    authContextId: actor.contextId,
    entry: actor.entry,
  };
}

async function readProfile(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  actor: ServerActorV1,
  displayName?: string,
) {
  return runActorTransaction(database, config, actor, async (port) => {
    const result = displayName === undefined
      ? await port.query<SessionProfileRow>(`
          SELECT id::text, email, display_name,
                 floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms
            FROM projed_core.profiles
           WHERE id = projed_core.current_actor_user_id_v1()
        `)
      : await port.query<SessionProfileRow>(`
          UPDATE projed_core.profiles
             SET display_name = $1, updated_at = now()
           WHERE id = projed_core.current_actor_user_id_v1()
       RETURNING id::text, email, display_name,
                 floor(extract(epoch FROM created_at) * 1000)::bigint::text AS created_at_ms
        `, [displayName]);
    if (result.rows.length !== 1) throw new KernelError('ACTOR_INVALID', 'Session profile is unavailable', 401);
    return profileData(result.rows[0]!, actor);
  });
}

export function createSessionHttpDispatcher(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  resolveActor?: TrustedSessionActorResolver,
  destroySession?: TrustedSessionDestroyer,
) {
  return async (request: IncomingMessage, requestId: string): Promise<SessionHttpResult> => {
    const isRead = request.url === '/api/v1/session' && request.method === 'GET';
    const isProfileUpdate = request.url === '/api/v1/session/profile' && request.method === 'PATCH';
    const isLogout = request.url === '/api/v1/session/logout' && request.method === 'POST';
    const isSessionPath = request.url === '/api/v1/session'
      || request.url === '/api/v1/session/profile'
      || request.url === '/api/v1/session/logout';
    if (!isRead && !isProfileUpdate && !isLogout) {
      return isSessionPath
        ? { matched: true, status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } } }
        : { matched: false };
    }
    if (!resolveActor || (isLogout && !destroySession)) {
      if (request.method !== 'GET') request.resume();
      return { matched: true, status: 404, body: { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } } };
    }
    if (request.method !== 'GET' && !isSameOriginWrite(request)) {
      request.resume();
      return { matched: true, status: 403, body: { error: { code: 'ACCESS_DENIED', requestId, retryable: false } } };
    }
    try {
      const actor = await resolveActor(request);
      if (isLogout) {
        assertExpectedActor(request, actor);
        await destroySession!(request);
        return { matched: true, status: 200, body: { data: null } };
      }
      if (isRead) return { matched: true, status: 200, body: { data: await readProfile(database, config, actor) } };
      assertExpectedActor(request, actor);
      const body = await readJsonBody(request);
      if (Object.keys(body).some(key => key !== 'displayName')
          || typeof body.displayName !== 'string'
          || body.displayName.trim() === ''
          || body.displayName.length > 120) {
        throw new KernelError('DOMAIN_DATA_INVALID', 'displayName is invalid', 400);
      }
      return {
        matched: true,
        status: 200,
        body: { data: await readProfile(database, config, actor, body.displayName.trim()) },
      };
    } catch (error) {
      return errorResult(error, requestId);
    }
  };
}
