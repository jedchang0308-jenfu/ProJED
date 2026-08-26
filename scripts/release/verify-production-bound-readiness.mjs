import { createClient } from '@supabase/supabase-js';
import { loadServerVerificationEnv, readEnvFile, resolveProductionPublicEnv } from './env-boundary.mjs';
import { PRODUCTION_CONTRACT } from './production-contract.mjs';
import { resolveCredentialRotationPolicyDecision } from './credential-rotation-evidence.mjs';

const strict = process.argv.includes('--strict');
const serverEnv = loadServerVerificationEnv();
const productionEnv = readEnvFile('.env.production');
const results = [];
const projectRef = (() => {
  try { return new URL(serverEnv.SUPABASE_URL ?? '').hostname.split('.')[0] || null; } catch { return null; }
})();
const credentialRotationPolicy = projectRef
  ? resolveCredentialRotationPolicyDecision({ projectRef })
  : null;

const add = (name, status, extra = {}) => results.push({ name, status, ...extra });
const failOrPending = () => strict ? 'fail' : 'pending';
const decodeJwt = token => {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
};
const validPublicKey = token => token?.startsWith('sb_publishable_') || decodeJwt(token)?.role === 'anon';
const validAdminKey = token => token?.startsWith('sb_secret_') || decodeJwt(token)?.role === 'service_role';

try {
  resolveProductionPublicEnv({ parentEnv: {} });
  add('production-public-contract', 'pass');
} catch (error) {
  add('production-public-contract', 'fail', { reason: error.message });
}

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_AUTH_REDIRECT_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'];
for (const key of required) add(`server-key:${key}`, serverEnv[key] ? 'pass' : failOrPending());
add('server-target', serverEnv.SUPABASE_URL === PRODUCTION_CONTRACT.supabaseUrl ? 'pass' : 'fail', { expected: PRODUCTION_CONTRACT.supabaseProjectRef });
add('production-redirect', productionEnv.VITE_SUPABASE_AUTH_REDIRECT_URL === PRODUCTION_CONTRACT.canonicalRedirectUrl ? 'pass' : 'fail', { expected: 'canonical-production-redirect' });
add('server-verification-redirect-present', serverEnv.SUPABASE_AUTH_REDIRECT_URL ? 'pass' : failOrPending());
add('server-public-key-shape', validPublicKey(serverEnv.SUPABASE_ANON_KEY) ? 'pass' : 'fail');
add('server-admin-key-shape', validAdminKey(serverEnv.SUPABASE_SERVICE_ROLE_KEY) ? 'pass' : 'fail');
const credentialRotationConfirmedBy = ['SUPABASE_CREDENTIAL_ROTATION_VERIFIED', 'P8_CREDENTIAL_ROTATION_VERIFIED', 'P7_CREDENTIAL_ROTATION_CONFIRMED']
  .find(key => serverEnv[key] === 'true');
add('credential-rotation-confirmed', credentialRotationConfirmedBy || credentialRotationPolicy ? 'pass' : failOrPending(), {
  confirmed_by: credentialRotationConfirmedBy ?? (credentialRotationPolicy ? `policy:${credentialRotationPolicy.policy_id}` : undefined),
});

if (serverEnv.SUPABASE_URL && serverEnv.SUPABASE_ANON_KEY && serverEnv.SUPABASE_SERVICE_ROLE_KEY && serverEnv.SUPABASE_ACCESS_TOKEN) {
  try {
    const anonResponse = await fetch(`${serverEnv.SUPABASE_URL}/rest/v1/tenants?select=id&limit=1`, { headers: { apikey: serverEnv.SUPABASE_ANON_KEY, Authorization: `Bearer ${serverEnv.SUPABASE_ANON_KEY}` } });
    add('readonly-rest-probe', [200, 206].includes(anonResponse.status) ? 'pass' : 'fail', { http_status: anonResponse.status });
  } catch (error) {
    add('readonly-rest-probe', 'fail', { reason: error.message });
  }
  try {
    const admin = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    add('readonly-admin-probe', error ? 'fail' : 'pass', error ? { reason: error.message } : {});
  } catch (error) {
    add('readonly-admin-probe', 'fail', { reason: error.message });
  }
  try {
    const managementResponse = await fetch('https://api.supabase.com/v1/projects', { headers: { Authorization: `Bearer ${serverEnv.SUPABASE_ACCESS_TOKEN}` } });
    add('readonly-management-probe', [200, 401, 403].includes(managementResponse.status) ? (managementResponse.status === 200 ? 'pass' : 'fail') : 'fail', { http_status: managementResponse.status });
  } catch (error) {
    add('readonly-management-probe', 'fail', { reason: error.message });
  }
} else {
  add('readonly-probes', failOrPending());
}

const failed = results.filter(result => result.status === 'fail');
const pending = results.filter(result => result.status === 'pending');
const ok = failed.length === 0 && (!strict || pending.length === 0);
console.log(JSON.stringify({ ok, strict, project_ref: PRODUCTION_CONTRACT.supabaseProjectRef, results }, null, 2));
if (!ok) process.exit(1);
