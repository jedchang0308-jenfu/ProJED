import { existsSync } from 'node:fs';
import path from 'node:path';
import './load-server-verification-env.mjs';
import { resolveCredentialRotationPolicyDecision } from './release/credential-rotation-evidence.mjs';

const strict = process.argv.includes('--strict');

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_AUTH_REDIRECT_URL',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
];

const manualGates = [
  {
    name: 'credential-rotation',
    env: [
      'SUPABASE_CREDENTIAL_ROTATION_VERIFIED',
      'P8_CREDENTIAL_ROTATION_VERIFIED',
      'P7_CREDENTIAL_ROTATION_CONFIRMED',
    ],
  },
];

const placeholderPatterns = [
  /^your-/i,
  /your-project-ref/i,
  /your-current-/i,
  /\.\.\./,
];

const isPlaceholder = value =>
  !value || placeholderPatterns.some(pattern => pattern.test(value));

const results = [];
const projectRef = (() => {
  try { return new URL(process.env.SUPABASE_URL ?? '').hostname.split('.')[0] || null; } catch { return null; }
})();
const credentialRotationPolicy = projectRef
  ? resolveCredentialRotationPolicyDecision({ projectRef })
  : null;

const addResult = (name, status, extra = {}) => {
  results.push({ name, status, ...extra });
};

const hasAllRequiredEnv = requiredEnv.every(key => {
  const value = process.env[key];
  return value && !isPlaceholder(value);
});
const envFilePath = path.resolve(process.cwd(), '.env.p8.local');
const hasEnvFile = existsSync(envFilePath);
addResult('.env.p8.local', hasEnvFile || hasAllRequiredEnv ? 'pass' : strict ? 'fail' : 'pending', {
  reason: hasEnvFile || hasAllRequiredEnv
    ? undefined
    : 'create .env.p8.local or provide equivalent process env values before P8 sign-off',
});

for (const key of requiredEnv) {
  const value = process.env[key];
  if (!value) {
    addResult(key, 'fail', { reason: 'missing' });
    continue;
  }

  if (isPlaceholder(value)) {
    addResult(key, 'fail', { reason: 'placeholder value' });
    continue;
  }

  addResult(key, 'pass');
}

for (const gate of manualGates) {
  const confirmedBy = gate.env.find(key => process.env[key] === 'true');
  const policyDecision = gate.name === 'credential-rotation' ? credentialRotationPolicy : null;
  addResult(gate.name, confirmedBy || policyDecision ? 'pass' : strict ? 'fail' : 'pending', {
    env: gate.env,
    confirmed_by: confirmedBy ?? (policyDecision ? `policy:${policyDecision.policy_id}` : undefined),
    reason: confirmedBy || policyDecision ? undefined : 'manual gate not confirmed',
  });
}

const failed = results.filter(result => result.status === 'fail');
const pending = results.filter(result => result.status === 'pending');
const ok = failed.length === 0 && (!strict || pending.length === 0);

console.log(JSON.stringify({
  ok,
  strict,
  results,
}, null, 2));

if (!ok) {
  process.exit(1);
}
