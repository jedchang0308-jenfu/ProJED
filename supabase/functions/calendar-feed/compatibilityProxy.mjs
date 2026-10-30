/* global AbortController, Response, URL, clearTimeout, setTimeout */

const RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
};
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const textResponse = (body, status, contentType = 'text/plain; charset=utf-8') => new Response(body, {
  status,
  headers: {
    ...RESPONSE_HEADERS,
    'Content-Type': contentType,
  },
});

const unavailableResponse = () => textResponse('Calendar feed temporarily unavailable', 503);

const resolveProxyOrigin = configuredOrigin => {
  if (typeof configuredOrigin !== 'string' || configuredOrigin.trim().length === 0) return null;

  try {
    const parsed = new URL(configuredOrigin.trim());
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    ) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
};

export const proxyLegacyCalendarFeed = async ({
  configuredOrigin,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}) => {
  const proxyOrigin = resolveProxyOrigin(configuredOrigin);
  if (proxyOrigin === null) return null;
  if (!proxyOrigin || typeof fetchImpl !== 'function') return unavailableResponse();
  if (!TOKEN_RE.test(token)) return textResponse('Calendar feed not found', 404);

  const target = `${proxyOrigin}/api/v1/calendar-feeds/${encodeURIComponent(token)}.ics`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetchImpl(target, {
      method: 'GET',
      headers: { Accept: 'text/calendar' },
      redirect: 'error',
      signal: controller.signal,
    });

    if (upstream.status === 404) return textResponse('Calendar feed not found', 404);
    if (upstream.status === 410) return textResponse('Calendar feed is disabled', 410);
    if (upstream.status !== 200) return unavailableResponse();

    const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('text/calendar')) return unavailableResponse();

    return textResponse(await upstream.text(), 200, 'text/calendar; charset=utf-8');
  } catch {
    return unavailableResponse();
  } finally {
    clearTimeout(timer);
  }
};
