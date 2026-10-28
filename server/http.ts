import { randomUUID } from 'node:crypto';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import type { RuntimeConfig } from './config.js';
import type { ExpectedMigration, RuntimeDatabase } from './db.js';
import { createBackupHttpDispatcher } from './backupHttp.js';
import { createCalendarHttpDispatcher } from './calendarHttp.js';
import { createPreferencesHttpDispatcher } from './preferencesHttp.js';
import { createCollaborationWriteHttpDispatcher } from './collaborationWriteHttp.js';
import {
  createDomainReadHttpDispatcher,
  isPrivateApiRequest,
  type TrustedSessionActorResolver,
} from './domainReadHttp.js';
import { createDomainWriteHttpDispatcher } from './domainWriteHttp.js';
import { createRecordActivityHttpDispatcher } from './recordActivityHttp.js';
import { createQuickTaskHttpDispatcher } from './quickTaskHttp.js';
import {
  createSessionHttpDispatcher,
  type TrustedSessionDestroyer,
  type TrustedSessionLogoutIdentityResolver,
  type TrustedSessionInfoResolver,
} from './sessionHttp.js';
import { createTaskWorkbenchHttpDispatcher } from './taskWorkbenchHttp.js';
import { createTaskTrackingHttpDispatcher } from './taskTrackingHttp.js';
import {createRagHttpDispatcher} from './ragHttp.js';
import type {RagProvider} from './geminiRagProvider.js';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function idFor(request: IncomingMessage): string {
  const value = request.headers['x-request-id'];
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : randomUUID();
}

function safeResponseHeaders(headers?: Readonly<Record<string, string>>): Record<string, string> {
  const safeHeaders: Record<string, string> = {};
  const allowed = new Set(['set-cookie', 'location', 'referrer-policy']);
  const seen = new Set<string>();
  for (const [rawName, value] of Object.entries(headers ?? {})) {
    const name = rawName.toLowerCase();
    if (!allowed.has(name)) continue;
    if (seen.has(name) || typeof value !== 'string' || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('Invalid response header');
    }
    if (name === 'location' && /[\r\n]/.test(value)) throw new Error('Invalid redirect');
    seen.add(name);
    safeHeaders[name] = value;
  }
  return safeHeaders;
}

function json(
  response: ServerResponse,
  status: number,
  value: unknown,
  requestId: string,
  headers?: Readonly<Record<string, string>>,
): void {
  if(response.destroyed||response.writableEnded)return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-request-id': requestId,
    ...safeResponseHeaders(headers),
  });
  response.end(JSON.stringify(value));
}

function text(response: ServerResponse, status: number, value: string, contentType: string, requestId: string): void {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-request-id': requestId,
  });
  response.end(value);
}

function inside(root: string, candidate: string): boolean {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate === root || candidate.startsWith(prefix);
}

function resolveStaticFile(root: string, relative: string): string | null {
  try {
    const path = realpathSync(resolve(root, relative));
    return inside(root, path) && statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

function serveStatic(config: RuntimeConfig, request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  let relative: string;
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    relative = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return false;
  }
  if (relative.includes('\0') || relative.includes('\\') || relative.split('/').includes('..')) return false;
  const exactCandidates = relative.length === 0
    ? [config.entry === 'quick' ? 'quick-task/index.html' : 'index.html']
    : [relative, ...(relative.endsWith('/') ? [`${relative}index.html`] : [])];
  let path = exactCandidates.map(candidate => resolveStaticFile(config.staticRoot, candidate)).find(Boolean) ?? null;
  if (!path && extname(relative) === '' && !relative.startsWith('assets/')) {
    const fallback = config.entry === 'quick' || relative === 'quick-task' || relative.startsWith('quick-task/')
      ? 'quick-task/index.html'
      : 'index.html';
    path = resolveStaticFile(config.staticRoot, fallback);
  }
  if (!path) return false;
  const extension = extname(path).toLowerCase();
  const immutable = /[.-][a-f0-9]{8,}[.-]/i.test(path);
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(path).pipe(response);
  return true;
}

export interface KernelHttpServer {
  server: Server;
  listen(): Promise<{ host: string; port: number }>;
  shutdown(): Promise<void>;
}

export interface KernelHttpOptions {
  readonly ragProvider?:RagProvider;
  readonly resolveActor?: TrustedSessionActorResolver;
  readonly destroySession?: TrustedSessionDestroyer;
  readonly resolveSessionInfo?: TrustedSessionInfoResolver;
  readonly resolveLogoutIdentity?: TrustedSessionLogoutIdentityResolver;
  readonly dispatchAuth?: (
    request: IncomingMessage,
    requestId: string,
  ) => Promise<{
    matched: boolean;
    status?: number;
    body?: unknown;
    headers?: Readonly<Record<string, string>>;
  }>;
}

function writeAuthResult(
  response: ServerResponse,
  result: { status?: number; body?: unknown; headers?: Readonly<Record<string, string>> },
  requestId: string,
): void {
  const status = result.status ?? 200;
  if (!Number.isInteger(status) || status < 200 || status > 599 || [204, 205, 304].includes(status)) {
    throw new Error('Invalid auth response status');
  }
  const body = JSON.stringify(result.body ?? null);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-request-id': requestId,
    ...safeResponseHeaders(result.headers),
  });
  response.end(body);
}

function authUnavailable(response: ServerResponse, requestId: string): void {
  json(response, 503, { error: { code: 'AUTH_UNAVAILABLE', requestId, retryable: true } }, requestId);
}

export function createKernelHttpServer(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  expectedMigrations: readonly ExpectedMigration[],
  options: KernelHttpOptions = {},
): KernelHttpServer {
  let shuttingDown = false;
  const dispatchSession = createSessionHttpDispatcher(
    config, database, options.resolveActor, options.destroySession, options.resolveSessionInfo,
    options.resolveLogoutIdentity,
  );
  const dispatchCollaborationWrite = createCollaborationWriteHttpDispatcher(config, database, options.resolveActor);
  const dispatchRecordActivity = createRecordActivityHttpDispatcher(config, database, options.resolveActor);
  const dispatchQuickTask = createQuickTaskHttpDispatcher(config, database, options.resolveActor);
  const dispatchTaskWorkbench = createTaskWorkbenchHttpDispatcher(config, database, options.resolveActor);
  const dispatchTaskTracking = createTaskTrackingHttpDispatcher(config, database, options.resolveActor);
  const dispatchBackup = createBackupHttpDispatcher(config, database, options.resolveActor);
  const dispatchPreferences = createPreferencesHttpDispatcher(config, database, options.resolveActor);
  const dispatchCalendar = createCalendarHttpDispatcher(config, database, options.resolveActor);
  const dispatchDomainRead = createDomainReadHttpDispatcher(config, database, options.resolveActor);
  const dispatchDomainWrite = createDomainWriteHttpDispatcher(config, database, options.resolveActor);
  const dispatchRag = createRagHttpDispatcher(config,database,options.resolveActor,options.ragProvider);
  const server = createServer({
    maxHeaderSize: 16 * 1024,
    requestTimeout: config.profile.runtime.timeouts.requestMillis,
  }, async (request, response) => {
    const requestId = idFor(request);
    if (shuttingDown) {
      json(response, 503, { status: 'unavailable', requestId }, requestId);
      return;
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/health/live') {
      if (request.method !== 'GET') json(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId }, requestId);
      else json(response, 200, { status: 'ok' }, requestId);
      return;
    }
    if (url.pathname === '/health/ready') {
      if (request.method !== 'GET') {
        json(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId }, requestId);
        return;
      }
      const ready = await database.readiness(expectedMigrations);
      json(response, ready ? 200 : 503, ready ? { status: 'ok' } : { status: 'unavailable', requestId }, requestId);
      return;
    }
    const calendar = await dispatchCalendar(request, requestId);
    if (calendar.matched) {
      if (calendar.text !== undefined) {
        text(response, calendar.status ?? 500, calendar.text, calendar.contentType ?? 'text/plain; charset=utf-8', requestId);
      } else {
        json(response, calendar.status ?? 500, calendar.body ?? {
          error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
        }, requestId);
      }
      return;
    }
    if (options.dispatchAuth) {
      try {
        const auth = await options.dispatchAuth(request, requestId);
        if (!auth || typeof auth.matched !== 'boolean') throw new Error('Invalid auth dispatcher result');
        if (auth.matched) {
          try {
            writeAuthResult(response, auth, requestId);
          } catch {
            authUnavailable(response, requestId);
          }
          return;
        }
      } catch {
        authUnavailable(response, requestId);
        return;
      }
    }
    const session = await dispatchSession(request, requestId);
    if (session.matched) {
      try {
        json(response, session.status ?? 500, session.body ?? {
          error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
        }, requestId, session.headers);
      } catch {
        authUnavailable(response, requestId);
      }
      return;
    }
    const preferences = await dispatchPreferences(request, requestId);
    if (preferences.matched) {
      json(response, preferences.status ?? 500, preferences.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    const rag=await dispatchRag(request,requestId);
    if(rag.matched){json(response,rag.status??500,rag.body,requestId);return;}
    const collaborationWrite = await dispatchCollaborationWrite(request, requestId);
    if (collaborationWrite.matched) {
      json(response, collaborationWrite.status ?? 500, collaborationWrite.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    const quickTask = await dispatchQuickTask(request, requestId);
    if (quickTask.matched) {
      json(response, quickTask.status ?? 500, quickTask.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    const taskWorkbench = await dispatchTaskWorkbench(request, requestId);
    if (taskWorkbench.matched) {
      json(response, taskWorkbench.status ?? 500, taskWorkbench.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    const taskTracking = await dispatchTaskTracking(request, requestId);
    if (taskTracking.matched) {
      json(response, taskTracking.status ?? 500, taskTracking.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    const backup = await dispatchBackup(request, requestId);
    if (backup.matched) {
      json(response, backup.status ?? 500, backup.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    const recordActivity = await dispatchRecordActivity(request, requestId);
    if (recordActivity.matched) {
      json(response, recordActivity.status ?? 500, recordActivity.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    const domainWrite = await dispatchDomainWrite(request, requestId);
    if (domainWrite.matched) {
      json(response, domainWrite.status ?? 500, domainWrite.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    const domainRead = await dispatchDomainRead(request, requestId);
    if (domainRead.matched) {
      json(response, domainRead.status ?? 500, domainRead.body ?? {
        error: { code: 'DB_UNAVAILABLE', requestId, retryable: true },
      }, requestId);
      return;
    }
    if (isPrivateApiRequest(request.url)) {
      json(response, 404, { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } }, requestId);
      return;
    }
    if (serveStatic(config, request, response)) return;
    json(response, 404, { code: 'ENDPOINT_UNAVAILABLE', requestId }, requestId);
  });

  return {
    server,
    listen: () => new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        server.off('error', reject);
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('HTTP server did not return an IP address'));
          return;
        }
        resolveListen({ host: config.host, port: address.port });
      });
    }),
    shutdown: async () => {
      shuttingDown = true;
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
        server.closeIdleConnections();
      });
      await database.end();
    },
  };
}
