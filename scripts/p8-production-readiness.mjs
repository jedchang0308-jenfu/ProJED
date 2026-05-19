import { spawn } from 'node:child_process';
import './load-local-env.mjs';

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

const gateEnv = { ...process.env };
if (
  gateEnv.SUPABASE_BROWSER_OAUTH_E2E_CONFIRMED === 'true' ||
  gateEnv.P8_BROWSER_OAUTH_E2E_CONFIRMED === 'true'
) {
  gateEnv.P7_BROWSER_OAUTH_E2E_CONFIRMED = 'true';
}
if (
  gateEnv.SUPABASE_CREDENTIAL_ROTATION_VERIFIED === 'true' ||
  gateEnv.P8_CREDENTIAL_ROTATION_VERIFIED === 'true'
) {
  gateEnv.P7_CREDENTIAL_ROTATION_CONFIRMED = 'true';
}

const steps = [
  {
    name: 'p8-preflight',
    command: 'npm.cmd',
    args: ['run', 'verify:supabase:p8-preflight', '--', '--strict'],
    env: gateEnv,
  },
  {
    name: 'p7-release-gate-strict',
    command: 'npm.cmd',
    args: ['run', 'verify:supabase:p7-release-gate', '--', '--strict'],
    env: gateEnv,
  },
  {
    name: 'p8-credential-rotation-strict',
    command: 'npm.cmd',
    args: ['run', 'verify:supabase:p8-credential-rotation', '--', '--strict'],
    env: gateEnv,
  },
  {
    name: 'p8-browser-smoke-residual-check',
    command: 'npm.cmd',
    args: ['run', 'verify:supabase:p8-browser-cleanup', '--', '--dry-run', '--fail-on-found'],
    env: gateEnv,
  },
];

const results = [];

for (const step of steps) {
  const code = await run(step.command, step.args, step.env);
  results.push({ name: step.name, status: code === 0 ? 'pass' : 'fail', code });
  if (code !== 0) {
    break;
  }
}

const failed = results.filter(result => result.status === 'fail');

console.log(JSON.stringify({
  ok: failed.length === 0 && results.length === steps.length,
  results,
}, null, 2));

if (failed.length > 0 || results.length !== steps.length) {
  process.exit(1);
}
