import { createClient } from '@supabase/supabase-js';
import './load-local-env.mjs';

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_AUTH_REDIRECT_URL',
];

const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const decodeJwtPayload = (token) => {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 3) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const classifySupabaseKey = (token, expectedKind) => {
  const payload = decodeJwtPayload(token);
  if (payload) {
    const expectedRole = expectedKind === 'public' ? 'anon' : 'service_role';
    assert(payload.role === expectedRole, `${expectedKind} JWT key must have role=${expectedRole}.`);
    return { kind: 'legacy-jwt', role: payload.role, ref: payload.ref ?? null };
  }

  if (expectedKind === 'public' && token.startsWith('sb_publishable_')) {
    return { kind: 'publishable', role: 'public', ref: null };
  }

  if (expectedKind === 'admin' && token.startsWith('sb_secret_')) {
    return { kind: 'secret', role: 'admin', ref: null };
  }

  throw new Error(
    expectedKind === 'public'
      ? 'SUPABASE_ANON_KEY must be a legacy anon JWT or a new sb_publishable key.'
      : 'SUPABASE_SERVICE_ROLE_KEY must be a legacy service_role JWT or a new sb_secret key.'
  );
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertNoError = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

const supabaseUrl = new URL(process.env.SUPABASE_URL);
const redirectUrl = new URL(process.env.SUPABASE_AUTH_REDIRECT_URL);
const projectRef = supabaseUrl.hostname.split('.')[0];
const publicKey = classifySupabaseKey(process.env.SUPABASE_ANON_KEY, 'public');
const adminKey = classifySupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY, 'admin');

assert(supabaseUrl.protocol === 'https:', 'SUPABASE_URL must use https.');
assert(redirectUrl.protocol === 'https:' || redirectUrl.hostname === 'localhost', 'SUPABASE_AUTH_REDIRECT_URL must use https outside localhost.');
assert(supabaseUrl.hostname.endsWith('.supabase.co'), 'SUPABASE_URL must be a Supabase project URL.');

for (const keyInfo of [publicKey, adminKey]) {
  if (keyInfo.ref) {
    assert(keyInfo.ref === projectRef, 'Supabase JWT key project ref must match SUPABASE_URL.');
  }
}

const anon = createClient(supabaseUrl.toString(), process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = createClient(supabaseUrl.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

assertNoError('admin.listUsers', await admin.auth.admin.listUsers({ page: 1, perPage: 1 }));

const oauth = assertNoError(
  'google.signInWithOAuth',
  await anon.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl.toString(),
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  })
);

assert(oauth.url, 'Google OAuth authorize URL was not returned.');
const authorizeUrl = new URL(oauth.url);
assert(authorizeUrl.hostname === supabaseUrl.hostname, 'Google OAuth authorize URL should be hosted by the configured Supabase project.');
assert(authorizeUrl.searchParams.get('provider') === 'google', 'Google OAuth authorize URL must target provider=google.');
assert(authorizeUrl.searchParams.get('redirect_to') === redirectUrl.toString(), 'Google OAuth authorize URL must preserve SUPABASE_AUTH_REDIRECT_URL.');

console.log(JSON.stringify({
  ok: true,
  project_ref: projectRef,
  supabase_host: supabaseUrl.hostname,
  redirect_url: redirectUrl.toString(),
  public_key_type: publicKey.kind,
  admin_key_type: adminKey.kind,
  google_oauth_authorize_url: 'generated',
  service_role_admin_api: 'reachable',
}, null, 2));
