import { KernelError } from './errors.js';

const METADATA_IDENTITY_ENDPOINT = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const MAX_TOKEN_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

function invalidConfig(): never {
  throw new KernelError('CONFIG_INVALID', 'Service identity token configuration is invalid', 503);
}

function unavailable(): never {
  throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Service identity token cannot be obtained', 503);
}

function exactHttpsOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.origin === value
      && parsed.username === ''
      && parsed.password === ''
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === '';
  } catch {
    return false;
  }
}

function validJwtStructure(value: string): boolean {
  if (value.length === 0 || Buffer.byteLength(value, 'utf8') > MAX_TOKEN_BYTES) return false;
  const parts = value.split('.');
  return parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/u.test(part));
}

async function readBoundedToken(response: Response, signal: AbortSignal): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_TOKEN_BYTES) unavailable();
  }
  if (!response.body) unavailable();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelOnAbort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancelOnAbort, { once: true });
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_TOKEN_BYTES) {
        await reader.cancel().catch(() => undefined);
        unavailable();
      }
      chunks.push(part.value);
    }
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return unavailable();
  }
}

export interface ServiceIdentityTokenProviderOptions {
  readonly brokerOrigin: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Gets a Cloud Run service identity OIDC ID token from its fixed metadata endpoint. */
export function createServiceIdentityTokenProvider(
  options: ServiceIdentityTokenProviderOptions,
): (tokenAudience: string) => Promise<string> {
  if (!options || !exactHttpsOrigin(options.brokerOrigin)) invalidConfig();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) invalidConfig();

  const endpoint = new URL(METADATA_IDENTITY_ENDPOINT);
  endpoint.searchParams.set('audience', options.brokerOrigin);
  endpoint.searchParams.set('format', 'full');

  return async (tokenAudience: string): Promise<string> => {
    if (tokenAudience !== options.brokerOrigin) {
      throw new KernelError('IDENTITY_INVALID', 'Service identity audience is invalid', 401);
    }

    const controller = new AbortController();
    let rejectTimeout!: (reason: KernelError) => void;
    const timeoutPromise = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
    const timeout = setTimeout(() => {
      controller.abort();
      rejectTimeout(new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Service identity token request timed out', 503));
    }, timeoutMs);

    const requestToken = async (): Promise<string> => {
      let response: Response;
      try {
        response = await (options.fetchImpl ?? fetch)(endpoint, {
          method: 'GET',
          headers: { 'Metadata-Flavor': 'Google', accept: 'text/plain' },
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
        });
      } catch {
        return unavailable();
      }
      if (response.status !== 200 || !response.ok || response.redirected || response.type === 'opaqueredirect') {
        return unavailable();
      }
      let token: string;
      try {
        token = await readBoundedToken(response, controller.signal);
      } catch {
        return unavailable();
      }
      if (!validJwtStructure(token)) unavailable();
      return token;
    };

    try {
      return await Promise.race([requestToken(), timeoutPromise]);
    } catch {
      return unavailable();
    } finally {
      clearTimeout(timeout);
    }
  };
}
