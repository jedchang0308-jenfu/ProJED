import assert from 'node:assert/strict';
import { request as requestHttp } from 'node:http';

/** QA-only same-origin relay to an already running disposable kernel. It does
 * not create an actor or alter cookies/expected-actor headers. */
export function createQuickUpgradeApiProxy(target) {
  const endpoint = new URL(target);
  assert.ok(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' && endpoint.port
    && !endpoint.username && !endpoint.password && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash,
  'Quick upgrade relay requires an exact loopback kernel origin');
  return async (request, response) => {
    const route = { '/api/v1/session': 'GET', '/api/v1/quick-tasks': 'POST' }[request.url];
    if (!request.url?.startsWith('/api/')) return false;
    const fail = status => {
      request.resume();
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: { code: 'ISOLATED_QUICK_RELAY_REJECTED' } }));
      return true;
    };
    if (!route) return fail(404);
    if (request.method !== route) return fail(405);
    if (route === 'POST' && (request.headers.origin !== `http://${request.headers.host}`
      || request.headers['sec-fetch-site'] === 'cross-site')) return fail(403);
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, 29000); timer.unref();
    request.once('aborted', abort);
    try {
      const body = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 20000) return fail(413);
        body.push(chunk);
      }
      const headers = new Headers();
      for (const name of ['cookie', 'content-type', 'origin', 'sec-fetch-site',
        'x-projed-expected-account-id', 'x-projed-expected-context-id']) {
        if (typeof request.headers[name] === 'string') headers.set(name, request.headers[name]);
      }
      // Preserve the browser's Host/Origin pair, as a normal local reverse proxy
      // does. Production same-origin and expected-actor checks still execute.
      headers.set('host', request.headers.host);
      // Node fetch ignores a Host override. The native HTTP transport preserves
      // this pair rather than weakening the kernel's production origin check.
      const upstream = await new Promise((done, reject) => {
        const forwarded = requestHttp(endpoint.origin + request.url, { method: route,
          headers: Object.fromEntries(headers), signal: controller.signal }, async incoming => {
          try {
            const chunks = [];
            let received = 0;
            for await (const chunk of incoming) {
              received += chunk.length;
              if (received > 64000) throw new Error('Quick relay response exceeds its bound');
              chunks.push(chunk);
            }
            done({ status: incoming.statusCode ?? 502, contentType: incoming.headers['content-type'] ?? 'application/json',
              bytes: Buffer.concat(chunks) });
          } catch (error) { reject(error); }
        });
        forwarded.once('error', reject);
        forwarded.end(route === 'POST' ? Buffer.concat(body) : undefined);
      });
      response.writeHead(upstream.status, { 'content-type': upstream.contentType,
        'cache-control': 'no-store' });
      response.end(upstream.bytes);
      return true;
    } catch {
      if (!response.headersSent) return fail(503);
      response.destroy();
      return true;
    } finally { clearTimeout(timer); request.off('aborted', abort); }
  };
}
