import { spawn } from 'node:child_process';
import './load-local-env.mjs';

const strict = process.argv.includes('--strict');

const run = (command, args, env = {}) => new Promise((resolve) => {
  const spawnOptions = {
    env: { ...process.env, ...env },
    stdio: 'inherit',
  };

  const child = process.platform === 'win32'
    ? spawn([command, ...args].join(' '), { ...spawnOptions, shell: true })
    : spawn(command, args, spawnOptions);

  child.on('close', code => resolve(code ?? 1));
});

const steps = [
  {
    name: 'source',
    command: 'npm.cmd',
    args: ['run', 'verify:source'],
  },
  {
    name: 'p5-crud',
    command: 'npm.cmd',
    args: ['run', 'verify:supabase:p5-crud'],
    requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    name: 'p6-readiness',
    command: 'npm.cmd',
    args: ['run', 'verify:supabase:p6-readiness'],
    requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_AUTH_REDIRECT_URL'],
  },
  {
    name: 'secret-hygiene',
    command: 'npm.cmd',
    args: ['run', 'verify:supabase:p7-secret-hygiene'],
  },
  {
    name: 'linked-db-lint',
    command: 'npx.cmd',
    args: ['supabase', 'db', 'lint', '--linked', '--fail-on', 'error'],
    requiredEnv: ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'],
  },
  {
    name: 'linked-rls-rag-smoke',
    command: 'npm.cmd',
    args: ['exec', '--', 'supabase', 'db', 'query', '--linked', '-f', 'supabase/tests/202605140002_rls_rag_smoke.sql', '-o', 'json'],
    requiredEnv: ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'],
  },
];

const results = [];

for (const step of steps) {
  const missing = (step.requiredEnv ?? []).filter(key => !process.env[key]);
  if (missing.length > 0) {
    const status = strict ? 'fail' : 'skip';
    results.push({ name: step.name, status, reason: `missing env: ${missing.join(', ')}` });
    continue;
  }

  const code = await run(step.command, step.args);
  results.push({ name: step.name, status: code === 0 ? 'pass' : 'fail', code });
}

const manualGates = [
  {
    name: 'browser-google-oauth-e2e',
    env: [
      'SUPABASE_BROWSER_OAUTH_E2E_CONFIRMED',
      'P8_BROWSER_OAUTH_E2E_CONFIRMED',
      'P7_BROWSER_OAUTH_E2E_CONFIRMED',
    ],
  },
  {
    name: 'credential-rotation',
    env: [
      'SUPABASE_CREDENTIAL_ROTATION_VERIFIED',
      'P8_CREDENTIAL_ROTATION_VERIFIED',
      'P7_CREDENTIAL_ROTATION_CONFIRMED',
    ],
  },
];

for (const gate of manualGates) {
  const confirmed = gate.env.some(envName => process.env[envName] === 'true');
  results.push({
    name: gate.name,
    status: confirmed ? 'pass' : strict ? 'fail' : 'pending',
    reason: confirmed ? undefined : `set one of ${gate.env.join(', ')}=true after completing the manual gate`,
  });
}

const failed = results.filter(result => result.status === 'fail');
const pending = results.filter(result => result.status === 'pending' || result.status === 'skip');

console.log(JSON.stringify({
  ok: failed.length === 0 && (!strict || pending.length === 0),
  strict,
  results,
}, null, 2));

if (failed.length > 0 || (strict && pending.length > 0)) {
  process.exit(1);
}
