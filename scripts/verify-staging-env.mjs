import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = process.cwd();
const expectedTestRef = 'fhisnnufoeulxqrchldf';
const staging = loadEnv('staging', root, '');
const production = loadEnv('production', root, '');

const getSupabaseRef = (value) => {
  const match = value?.match(/^https:\/\/([^.]+)\.supabase\.co\/?$/i);
  return match?.[1] ?? null;
};

const stagingRef = getSupabaseRef(staging.VITE_SUPABASE_URL);
const productionRef = getSupabaseRef(production.VITE_SUPABASE_URL);
const backend = staging.VITE_DATA_BACKEND ?? staging.VITE_BACKEND ?? null;
const redirectUrl = staging.VITE_SUPABASE_AUTH_REDIRECT_URL?.trim() || null;
const checks = [
  {
    name: 'staging backend resolves to Supabase',
    ok: backend === 'supabase',
    details: { backend },
  },
  {
    name: 'staging Supabase URL resolves to the fixed ProJED-TEST project',
    ok: stagingRef === expectedTestRef,
    details: { stagingRef, expectedTestRef },
  },
  {
    name: 'staging Supabase project is not production',
    ok: Boolean(stagingRef && productionRef && stagingRef !== productionRef),
    details: { stagingRef, productionRef },
  },
  {
    name: 'staging Supabase public key is configured',
    ok: Boolean(staging.VITE_SUPABASE_ANON_KEY?.trim()),
  },
  {
    name: 'configured auth redirect is HTTPS when explicitly overridden',
    ok: !redirectUrl || redirectUrl.startsWith('https://'),
    details: { strategy: redirectUrl ? 'explicit-https' : 'current-preview-origin' },
  },
];

const failed = checks.filter((check) => !check.ok);
const summary = {
  ok: failed.length === 0,
  mode: 'staging',
  resolved: {
    backend,
    stagingRef,
    productionRef,
    hasSupabasePublicKey: Boolean(staging.VITE_SUPABASE_ANON_KEY?.trim()),
    authRedirectStrategy: redirectUrl ? 'explicit-https' : 'current-preview-origin',
    googleCalendarClientConfigured: Boolean(staging.VITE_GOOGLE_CLIENT_ID?.trim()),
  },
  files: {
    genericLocal: existsSync(resolve(root, '.env.local')),
    staging: existsSync(resolve(root, '.env.staging')),
    stagingLocal: existsSync(resolve(root, '.env.staging.local')),
    stagingExample: existsSync(resolve(root, '.env.staging.example')),
  },
  checks,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
