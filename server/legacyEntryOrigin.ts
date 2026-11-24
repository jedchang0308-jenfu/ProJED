import type { IncomingMessage } from 'node:http';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { KernelError } from './errors.js';
import { isLegacyPublicOrigin, validLegacyEntryBinding, type LegacyEntryBinding } from './legacyEntryBinding.js';

export const ENTRY_ORIGIN_HEADER = 'x-projed-entry-origin';
export const ENTRY_IDENTITY_HEADER = 'x-projed-entry-identity';
const MAX_TOKEN_BYTES = 8 * 1024;
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type PrepareLegacyEntryRequest = (request: IncomingMessage) => Promise<void>;

function denied(): never {
  // Never include token, cookie, JWKS diagnostics or the forwarded body.
  throw new KernelError('ACCESS_DENIED', 'Legacy entry transport is not authorized', 403);
}

/** Verify a separate full token: Cloud Run strips the signature from the
 * X-Serverless-Authorization token, so that header is never an app-level proof.
 * This resolver never produces a user actor or bypasses App Session checks. */
export function createLegacyEntryRequestPreparer(
  binding: LegacyEntryBinding | null,
  options: { readonly getKey?: JWTVerifyGetKey; readonly now?: () => number } = {},
): PrepareLegacyEntryRequest {
  if (binding !== null && !validLegacyEntryBinding(binding)) {
    throw new KernelError('CONFIG_INVALID', 'Legacy entry binding is invalid', 503);
  }
  // Construct lazily: disabled composition performs no network IO.
  let getKey = options.getKey;
  return async request => {
    const reserved = Object.keys(request.headers).filter(name => name.startsWith('x-projed-entry-'));
    if (reserved.length === 0) {
      if (binding && isLegacyPublicOrigin(`https://${request.headers.host}`)) denied();
      return;
    }
    if (!binding || reserved.length !== 2
        || !reserved.includes(ENTRY_ORIGIN_HEADER) || !reserved.includes(ENTRY_IDENTITY_HEADER)) denied();
    const publicOrigin = request.headers[ENTRY_ORIGIN_HEADER];
    const token = request.headers[ENTRY_IDENTITY_HEADER];
    if (!isLegacyPublicOrigin(publicOrigin) || typeof publicOrigin !== 'string'
        || typeof token !== 'string' || Buffer.byteLength(token) > MAX_TOKEN_BYTES
        || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) denied();
    getKey ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
      timeoutDuration: 3000, cooldownDuration: 30_000, cacheMaxAge: 600_000,
    });
    try {
      const now = (options.now ?? Date.now)();
      if (!Number.isSafeInteger(now) || now < 0) denied();
      const { payload, protectedHeader } = await jwtVerify(token, getKey, {
        algorithms: ['RS256'], issuer: GOOGLE_ISSUERS, audience: binding.upstreamOrigin,
        requiredClaims: ['iss', 'aud', 'sub', 'iat', 'exp', 'email', 'email_verified'],
        currentDate: new Date(now), clockTolerance: 0, maxTokenAge: '1h',
      });
      if (protectedHeader.jku !== undefined || protectedHeader.jwk !== undefined || protectedHeader.x5u !== undefined
          || payload.sub !== binding.serviceAccountSubject || payload.email !== binding.serviceAccount
          || payload.email_verified !== true || payload.aud !== binding.upstreamOrigin
          || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
          || payload.exp! <= payload.iat! || payload.exp! - payload.iat! > 3600) denied();
    } catch {
      return denied();
    }
    // Only a verified fixed relay can select either fixed old public host.
    request.headers.host = new URL(publicOrigin).host;
    request.headers['x-forwarded-proto'] = 'https';
    for (const name of [ENTRY_ORIGIN_HEADER, ENTRY_IDENTITY_HEADER, 'x-serverless-authorization']) {
      delete request.headers[name];
    }
    // Keep downstream diagnostics from accidentally exposing transport tokens.
    for (let index = request.rawHeaders.length - 2; index >= 0; index -= 2) {
      if ([ENTRY_ORIGIN_HEADER, ENTRY_IDENTITY_HEADER, 'x-serverless-authorization'].includes(request.rawHeaders[index]!.toLowerCase())) {
        request.rawHeaders.splice(index, 2);
      }
    }
  };
}
