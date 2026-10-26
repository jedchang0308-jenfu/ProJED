import { randomUUID } from 'node:crypto';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import type { RuntimeConfig } from './config.js';
import type { ExpectedMigration, RuntimeDatabase } from './db.js';

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

function json(response: ServerResponse, status: number, value: unknown, requestId: string): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-request-id': requestId,
  });
  response.end(JSON.stringify(value));
}

function inside(root: string, candidate: string): boolean {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate === root || candidate.startsWith(prefix);
}

function serveStatic(config: RuntimeConfig, request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  let relative: string;
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  } catch {
    return false;
  }
  if (relative.includes('\0') || relative.split('/').includes('..')) return false;
  let path: string;
  try {
    path = realpathSync(resolve(config.staticRoot, relative));
    if (!inside(config.staticRoot, path) || !statSync(path).isFile()) return false;
  } catch {
    return false;
  }
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

export function createKernelHttpServer(
  config: RuntimeConfig,
  database: RuntimeDatabase,
  expectedMigrations: readonly ExpectedMigration[],
): KernelHttpServer {
  let shuttingDown = false;
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
