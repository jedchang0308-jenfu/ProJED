import { createServer, type IncomingMessage, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { createServiceIdentityTokenProvider } from './serviceIdentityToken.js';
import { isLegacyPublicOrigin, validLegacyEntryBinding, type LegacyEntryBinding } from './legacyEntryBinding.js';
import { ENTRY_IDENTITY_HEADER, ENTRY_ORIGIN_HEADER } from './legacyEntryOrigin.js';

// Preserve the existing record-body contract (audio/import have lower limits
// enforced by their own endpoints). Never collect an unbounded request body.
const MAX_REQUEST = 32 * 1024 * 1024;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const RESPONSE_HEADERS = ['content-type', 'etag', 'last-modified', 'service-worker-allowed',
  'x-content-type-options', 'x-projed-expires-at', 'content-disposition', 'x-request-id',
  'referrer-policy', 'content-security-policy', 'permissions-policy'];

function withinSignal<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('RELAY_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    // Attach both handlers even if already cancelled: a late provider rejection
    // must not become an unhandled rejection or trigger another dispatch.
    pending.then(value => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) abort(); else resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    if (signal.aborted) abort();
  });
}

function safeSessionCookie(value: string): boolean {
  if (!value.startsWith('__session=')) return false;
  const attributes = value.split(';').slice(1).map(part => part.trim());
  const names = attributes.map(part => part.split('=', 1)[0]!.toLowerCase());
  return new Set(names).size === names.length && !names.includes('domain')
    && attributes.some(part => /^Path=\/$/i.test(part))
    && attributes.some(part => /^HttpOnly$/i.test(part))
    && attributes.some(part => /^Secure$/i.test(part))
    && attributes.some(part => /^SameSite=Lax$/i.test(part));
}

function publicOrigin(request: IncomingMessage): string {
  // This is only routing, never proof of a user. The authenticated relay attests
  // the selected fixed host; the central app still validates host-bound Session
  // and browser Origin. No forwarded host is trusted directly by the app.
  const candidates = [request.headers['x-fh-requested-host'], request.headers['x-forwarded-host']]
    .filter(value => value !== undefined);
  const value = candidates[0] ?? request.headers.host;
  if (typeof value !== 'string' || candidates.some(candidate => candidate !== value)
      || !isLegacyPublicOrigin(`https://${value}`)) throw new Error('RELAY_ORIGIN_DENIED');
  return `https://${value}`;
}

function allowedPath(raw: string): { path: string; privateResponse: boolean } {
  if (raw.length > 8192 || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')
      || /[\u0000-\u0020\u007f#]/u.test(raw)) throw new Error('RELAY_PATH_DENIED');
  const url = new URL(raw, 'https://projed.invalid');
  const rawPath = raw.split('?', 1)[0]!;
  const decoded = decodeURIComponent(rawPath);
  if (url.origin !== 'https://projed.invalid' || url.pathname !== rawPath
      || decoded.includes('\\') || decoded.split('/').includes('..') || /%2f|%5c|%00/i.test(rawPath)) {
    throw new Error('RELAY_PATH_DENIED');
  }
  const api = rawPath.startsWith('/api/v1/')
    || /^\/api\/auth\/jenfu-sso\/(?:start|callback|cancel)$/.test(rawPath);
  const asset = ['/', '/quick-task', '/quick-task/', '/quick-task/index.html', '/index.html', '/sw.js',
    '/manifest.webmanifest', '/quick-task/manifest.webmanifest', '/app-shell-meta.json', '/release-meta.json', '/app-version-retention.json',
    '/dev139-cloud-run-meta.json', '/pwa-update-bridge.html', '/favicon.ico', '/vite.svg'].includes(rawPath)
    || /^\/(?:assets|app-releases|icons)\/.+/.test(rawPath) || /^\/workbox-[A-Za-z0-9_-]+\.js$/.test(rawPath);
  if (!api && !asset) throw new Error('RELAY_PATH_DENIED');
  return { path: raw, privateResponse: api };
}

async function readBody(request: IncomingMessage, signal: AbortSignal): Promise<Buffer | undefined> {
  const length = request.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST)) throw new Error('RELAY_BODY_LIMIT');
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let total = 0;
    const cleanup = () => {
      request.removeListener('data', data); request.removeListener('end', end);
      request.removeListener('error', error); signal.removeEventListener('abort', abort);
    };
    const error = (reason: unknown) => { cleanup(); request.pause(); reject(reason); };
    const abort = () => error(new Error('RELAY_CANCELLED'));
    const data = (part: Buffer) => {
      total += part.length;
      if (total > MAX_REQUEST) { error(new Error('RELAY_BODY_LIMIT')); return; }
      parts.push(part);
    };
    const end = () => { cleanup(); resolve(total ? Buffer.concat(parts, total) : undefined); };
    request.on('data', data); request.once('end', end); request.once('error', error);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** A fixed upstream, no retries, no DB/identity authority and no content logs.
 * A binding must be published after resource/IAM qualification; env flags are
 * insufficient. Creating this server does not deploy or expose anything. */
export function createLegacyEntryRelay(
  binding: LegacyEntryBinding | null,
  options: { readonly fetchImpl?: typeof fetch;
    readonly getIdentityToken?: (audience: string) => Promise<string>;
    readonly timeoutMs?: number } = {},
): Server {
  if (binding === null || !validLegacyEntryBinding(binding)) throw new Error('LEGACY_ENTRY_UNQUALIFIED');
  // Leave room for the existing 29-second audio operation, token retrieval and
  // transfer. This deadline covers the whole request, including stalled bodies.
  const timeoutMs = options.timeoutMs ?? 55_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 55_000) throw new Error('RELAY_TIMEOUT_INVALID');
  const getIdentityToken = options.getIdentityToken ?? createServiceIdentityTokenProvider({ brokerOrigin: binding.upstreamOrigin });
  return createServer({ maxHeaderSize: 16 * 1024, requestTimeout: timeoutMs }, async (request, response) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const cancel = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', cancel); response.once('close', cancel);
    let dispatched = false;
    let mutation = false;
    const fail = (status: number, code: string) => {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) { response.destroy(); return; }
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'referrer-policy': 'no-referrer', ...(!request.complete ? { connection: 'close' } : {}) });
      response.end(JSON.stringify({ error: { code, retryable: false } }));
    };
    try {
      const method = request.method ?? '';
      if (!METHODS.has(method)) { fail(405, 'METHOD_NOT_ALLOWED'); return; }
      mutation = method !== 'GET' && method !== 'HEAD';
      let origin: string;
      let selected: ReturnType<typeof allowedPath>;
      try { origin = publicOrigin(request); selected = allowedPath(request.url ?? ''); }
      catch { fail(403, 'ACCESS_DENIED'); return; }
      if (mutation && (!selected.privateResponse || request.headers.origin !== origin
          || request.headers['sec-fetch-site'] === 'cross-site')) { fail(403, 'ACCESS_DENIED'); return; }
      // Browser supplied transport credentials/hints cannot be forwarded.
      if (Object.keys(request.headers).some(name => name.startsWith('x-projed-entry-'))) { fail(403, 'ACCESS_DENIED'); return; }
      const cookies = (request.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith('__session='));
      if (cookies.length > 1) { fail(403, 'ACCESS_DENIED'); return; }
      const body = await readBody(request, controller.signal);
      if (!mutation && body) { fail(400, 'INVALID_REQUEST'); return; }
      if (controller.signal.aborted) throw new Error('RELAY_CANCELLED');
      const token = await withinSignal(getIdentityToken(binding.upstreamOrigin), controller.signal);
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || Buffer.byteLength(token) > 8192) {
        throw new Error('RELAY_IDENTITY_UNAVAILABLE');
      }
      if (controller.signal.aborted) throw new Error('RELAY_CANCELLED');
      const headers = new Headers({ [ENTRY_ORIGIN_HEADER]: origin, [ENTRY_IDENTITY_HEADER]: token,
        'x-serverless-authorization': `Bearer ${token}`, 'accept-encoding': 'identity' });
      for (const name of ['accept', 'content-type', 'origin', 'referer', 'sec-fetch-site',
        'x-projed-expected-account-id', 'x-projed-expected-context-id', 'x-projed-source-version', 'x-projed-record-id',
        'if-none-match', 'if-modified-since']) {
        const value = request.headers[name];
        if (typeof value === 'string') headers.set(name, value);
      }
      if (cookies[0]) headers.set('cookie', cookies[0]);
      dispatched = true;
      // Callback GET consumes an OAuth code and may create a Session too.
      mutation ||= selected.path.split('?', 1)[0] === '/api/auth/jenfu-sso/callback';
      const pendingResponse = (options.fetchImpl ?? fetch)(binding.upstreamOrigin + selected.path, {
        method, headers, ...(body ? { body: new Uint8Array(body.buffer, body.byteOffset, body.length) } : {}),
        redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      }).then(upstream => {
        if (controller.signal.aborted) {
          void upstream.body?.cancel().catch(() => undefined);
          throw new Error('RELAY_CANCELLED');
        }
        return upstream;
      });
      const upstream = await withinSignal(pendingResponse, controller.signal);
      const outgoing: Record<string, string | string[]> = {};
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value !== null) outgoing[name] = value;
      }
      outgoing['cache-control'] = selected.privateResponse ? 'no-store' : upstream.headers.get('cache-control') ?? 'no-cache';
      if (selected.privateResponse) outgoing['referrer-policy'] = 'no-referrer';
      const location = upstream.headers.get('location');
      if (location !== null) {
        const target = new URL(location, origin);
        if (!isLegacyPublicOrigin(target.origin) || location.startsWith('//') || /[\r\n\\]/.test(location)) {
          void upstream.body?.cancel().catch(() => undefined); throw new Error('RELAY_REDIRECT_DENIED');
        }
        outgoing.location = location;
      }
      const setCookies = upstream.headers.getSetCookie();
      if (setCookies.length > 1 || setCookies.some(value => !safeSessionCookie(value))) {
        void upstream.body?.cancel().catch(() => undefined); throw new Error('RELAY_COOKIE_DENIED');
      }
      if (setCookies.length) outgoing['set-cookie'] = setCookies;
      if (controller.signal.aborted || response.destroyed) {
        void upstream.body?.cancel().catch(() => undefined); return;
      }
      // Stream with backpressure: board exports must not acquire an artificial
      // 16 MiB ceiling or accumulate every concurrent response in relay RAM.
      // fetch can decompress, so length is safe only for an identity response.
      const length = upstream.headers.get('content-length');
      if (!upstream.headers.has('content-encoding') && length !== null && /^\d+$/.test(length)) outgoing['content-length'] = length;
      response.writeHead(upstream.status, outgoing);
      if (method === 'HEAD' || !upstream.body) {
        void upstream.body?.cancel().catch(() => undefined); response.end();
      } else {
        await pipeline(Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>), response, { signal: controller.signal });
      }
    } catch (error) {
      const bodyLimit = error instanceof Error && error.message === 'RELAY_BODY_LIMIT';
      fail(bodyLimit ? 413 : 503, dispatched && mutation ? 'DB_COMMIT_UNKNOWN' : bodyLimit ? 'PAYLOAD_TOO_LARGE' : 'DEPENDENCY_UNAVAILABLE');
    } finally {
      clearTimeout(timer);request.removeListener('aborted', cancel);response.removeListener('close', cancel);
    }
  });
}
