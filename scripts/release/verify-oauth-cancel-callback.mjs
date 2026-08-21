import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_CONTRACT } from './production-contract.mjs';
import { readEnvFile } from './env-boundary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function assertCanonicalCallback(urlValue) {
  const url = new URL(urlValue);
  if (url.origin !== PRODUCTION_CONTRACT.canonicalOrigin || url.pathname !== '/') throw new Error('OAuth callback did not return to the canonical production origin/path.');
  return true;
}
export function verifyCallbackChain({ authorizeLocation, callbackLocation, finalLocation }) {
  if (!authorizeLocation || !callbackLocation || !finalLocation) throw new Error('OAuth callback chain is incomplete.');
  const google = new URL(authorizeLocation);
  if (!/(^|\.)google\.com$/i.test(google.hostname) && !/(^|\.)googleusercontent\.com$/i.test(google.hostname)) throw new Error('OAuth authorize response did not redirect to Google.');
  const callback = new URL(callbackLocation);
  if (callback.origin !== PRODUCTION_CONTRACT.supabaseUrl || callback.pathname !== '/auth/v1/callback') throw new Error('OAuth provider callback target is not the production Supabase callback.');
  if (!callback.searchParams.get('state')) throw new Error('OAuth callback state is missing.');
  assertCanonicalCallback(finalLocation);
  return { ok: true, canonicalOrigin: PRODUCTION_CONTRACT.canonicalOrigin, callbackPath: callback.pathname };
}

const request = async (url, options = {}) => fetch(url, { redirect: 'manual', ...options });

export async function verifyRemoteOAuthCancel({ anonKey, supabaseUrl = PRODUCTION_CONTRACT.supabaseUrl } = {}) {
  if (!anonKey) throw new Error('OAuth safe-cancel verification requires the public Supabase anon key; no credential is printed.');
  const authorizeUrl = new URL(`${supabaseUrl}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'google');
  authorizeUrl.searchParams.set('redirect_to', PRODUCTION_CONTRACT.canonicalRedirectUrl);
  const authorizeResponse = await request(authorizeUrl, { headers: { apikey: anonKey, 'x-client-info': 'projed-dev-083-safe-cancel' } });
  if (![301, 302, 303, 307, 308].includes(authorizeResponse.status)) throw new Error('Production OAuth authorize did not return a redirect.');
  const googleLocation = authorizeResponse.headers.get('location');
  if (!googleLocation) throw new Error('Production OAuth authorize redirect location is missing.');
  const googleUrl = new URL(googleLocation);
  if (!/(^|\.)google\.com$/i.test(googleUrl.hostname) && !/(^|\.)googleusercontent\.com$/i.test(googleUrl.hostname)) throw new Error('Production OAuth authorize target is not Google.');
  const redirectTo = googleUrl.searchParams.get('redirect_uri') || googleUrl.searchParams.get('redirect_to');
  if (!redirectTo) throw new Error('Google authorize request did not carry a callback URI.');
  const callback = new URL(redirectTo);
  if (callback.origin !== PRODUCTION_CONTRACT.supabaseUrl || callback.pathname !== '/auth/v1/callback') throw new Error('Google authorize callback URI is not the production Supabase callback.');
  const state = googleUrl.searchParams.get('state');
  if (!state) throw new Error('OAuth state is missing from the Google authorize request.');
  callback.searchParams.set('state', state);
  callback.searchParams.set('error', 'access_denied');
  callback.searchParams.set('error_description', 'cancelled by DEV-083 safe-cancel test');
  callback.searchParams.set('error_code', 'access_denied');
  const callbackResponse = await request(callback, { headers: { apikey: anonKey, 'x-client-info': 'projed-dev-083-safe-cancel' } });
  if (![301, 302, 303, 307, 308].includes(callbackResponse.status)) throw new Error('Supabase OAuth cancel callback did not return a redirect.');
  const finalLocation = callbackResponse.headers.get('location');
  assertCanonicalCallback(finalLocation);
  return { ok: true, status: callbackResponse.status, canonicalOrigin: PRODUCTION_CONTRACT.canonicalOrigin };
}

export function runSelfCheck() {
  verifyCallbackChain({
    authorizeLocation: 'https://accounts.google.com/o/oauth2/v2/auth?state=redacted',
    callbackLocation: `${PRODUCTION_CONTRACT.supabaseUrl}/auth/v1/callback?state=redacted&code=redacted`,
    finalLocation: `${PRODUCTION_CONTRACT.canonicalOrigin}/?error=access_denied`,
  });
  let failed = false;
  try {
    verifyCallbackChain({
      authorizeLocation: 'https://accounts.google.com/o/oauth2/v2/auth',
      callbackLocation: 'https://fhisnnufoeulxqrchldf.supabase.co/auth/v1/callback?state=x',
      finalLocation: 'http://localhost:3000/',
    });
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('OAuth safe-cancel negative self-check did not fail.');
  return { ok: true, cases: 2 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.includes('--self-check')) {
      console.log(JSON.stringify(runSelfCheck(), null, 2));
      process.exit(0);
    }
    const manifestIndex = process.argv.indexOf('--manifest');
    const manifestPath = manifestIndex >= 0 ? process.argv[manifestIndex + 1] : '';
    const productionEnv = readEnvFile(path.join(root, '.env.production'));
    if (!manifestPath || !fs.existsSync(manifestPath)) throw new Error('Use --manifest <path> for remote OAuth safe-cancel verification.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.target?.origin !== PRODUCTION_CONTRACT.canonicalOrigin) throw new Error('Manifest target is not canonical production.');
    verifyRemoteOAuthCancel({ anonKey: productionEnv.VITE_SUPABASE_ANON_KEY, supabaseUrl: productionEnv.VITE_SUPABASE_URL }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exit(1); });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
