import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const OUTPUT_PATH = 'output/qa/dev-123/local-preflight-result.json';
const removedMarker = ['13', 'gemini'].join('');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const steps = [
  { id: 'pure-contract', command: npmCommand, args: ['run', 'verify:dev-123-meeting-task-resolution'] },
  { id: 'provider-contract', command: npmCommand, args: ['run', 'verify:dev-123-provider-contract'], expected: 'PENDING_ALLOWED' },
  {
    id: 'provider-contract-fail-closed',
    command: npmCommand,
    args: ['run', 'verify:dev-123-provider-contract'],
    expected: 'FAIL_CLOSED_ALLOWED',
    expectedExitCodes: [2],
    env: {
      DEV123_PROVIDER_MODE: 'gemini',
      DEV123_PROVIDER_OUTPUT_PATH: 'output/qa/dev-123/provider-contract-fail-closed-result.json',
      GEMINI_MEETING_ZDR_API_KEY: '',
      GEMINI_MEETING_PROJECT_ID: '',
      DEV123_PROVIDER_ZDR_CONFIRMED: 'false',
      DEV123_PROVIDER_CONFIG_FINGERPRINT: '',
      DEV123_PROVIDER_FILES_DELETE_VERIFIED: 'false',
      DEV123_PROVIDER_STORE: 'true',
      DEV123_PROVIDER_BACKGROUND: 'true',
      GEMINI_MEETING_TRANSCRIBE_MODEL: 'unqualified-model',
      GEMINI_MEETING_EMBEDDING_MODEL: 'unqualified-model',
      GEMINI_MEETING_COMPOSE_MODEL: 'unqualified-model',
    },
  },
  { id: 'isolated-db', command: npmCommand, args: ['run', 'verify:dev-123-meeting-task-resolution-db-isolated'] },
  { id: 'auth-storage-local', command: npmCommand, args: ['run', 'verify:dev-123-auth-storage-local'] },
  { id: 'control-api-local', command: npmCommand, args: ['run', 'verify:dev-123-control-api-local'] },
  { id: 'schema-lint', command: npxCommand, args: ['supabase', 'db', 'lint', '--local'] },
  { id: 'typecheck', command: npxCommand, args: ['tsc', '--noEmit'] },
  { id: 'lint', command: npmCommand, args: ['run', 'lint'] },
  { id: 'build-test', command: npmCommand, args: ['run', 'build:test'] },
  { id: 'protected-dev-106', command: npmCommand, args: ['run', 'verify:dev-106-meeting-local-safety'] },
  { id: 'protected-dev-108', command: npmCommand, args: ['run', 'verify:dev-108-task-meeting-note-persistent-list'] },
  { id: 'protected-dev-109', command: npmCommand, args: ['run', 'verify:dev-109-meeting-live-task-change-capture'] },
  { id: 'protected-dev-110', command: npmCommand, args: ['run', 'verify:dev-110-unplaced-task-meeting-record-boundary'] },
  { id: 'protected-dev-117', command: npmCommand, args: ['run', 'verify:dev-117-cross-mode-meeting-continuity'] },
  { id: 'browser-entry', command: npmCommand, args: ['run', 'verify:dev-123-meeting-task-resolution-browser'] },
  { id: 'browser-media', command: npmCommand, args: ['run', 'verify:dev-123-meeting-task-resolution-browser-media'] },
];

const spawnSpec = (command, args) => process.platform === 'win32'
  ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', [command, ...args].join(' ')] }
  : { command, args };

const runStep = (step) => {
  const startedAt = new Date().toISOString();
  const target = spawnSpec(step.command, step.args);
  const result = spawnSync(target.command, target.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ...(step.env ?? {}) },
    timeout: 300_000,
    windowsHide: true,
  });
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  const spawnError = result.error ? `\n[spawn-error]\n${result.error.message}` : '';
  const output = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}${spawnError}`;
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const exitCode = timedOut ? 124 : result.status ?? 1;
  const expectedExitCodes = step.expectedExitCodes ?? [0];
  return {
    id: step.id,
    command: [step.command, ...step.args].join(' '),
    expected: step.expected ?? 'PASS',
    status: expectedExitCodes.includes(exitCode) ? 'PASS' : 'FAIL',
    exitCode,
    startedAt,
    finishedAt: new Date().toISOString(),
    outputTail: output.slice(-6000),
  };
};

const validateNoRemovedMarker = () => {
  const result = spawnSync(process.platform === 'win32' ? 'rg.exe' : 'rg', [
    '-n', '--hidden', '--glob', '!node_modules/**', '--glob', '!dist/**', '--glob', '!.git/**', '--glob', '!scripts/verify-dev-123-local-preflight.mjs', removedMarker, '.',
  ], { cwd: process.cwd(), encoding: 'utf8', shell: false, windowsHide: true });
  return {
    id: 'removed-marker-scan',
    command: 'rg -n --hidden --glob !node_modules/** --glob !dist/** --glob !.git/** --glob !scripts/verify-dev-123-local-preflight.mjs <removed-marker> .',
    expected: 'NO_MATCHES',
    status: result.status === 1 ? 'PASS' : 'FAIL',
    exitCode: result.status ?? 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    outputTail: String(result.stdout ?? result.stderr ?? '').slice(-2000),
  };
};

const parseArtifactStatus = (path, expectedStatus) => {
  try {
    const artifact = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    const passed = artifact.status === expectedStatus || (expectedStatus === 'PASS' && artifact.passed === true);
    return {
      path,
      status: passed ? 'PASS' : 'FAIL',
      observedStatus: artifact.status ?? (artifact.passed === true ? 'PASS' : null),
    };
  } catch (error) {
    return { path, status: 'FAIL', error: error instanceof Error ? error.message : String(error) };
  }
};

const startedAt = new Date().toISOString();
const results = steps.map(runStep);
const markerScan = validateNoRemovedMarker();
results.push(markerScan);
const artifacts = [
  parseArtifactStatus('output/qa/dev-123/provider-contract-result.json', 'PENDING'),
  parseArtifactStatus('output/qa/dev-123/provider-contract-fail-closed-result.json', 'FAIL_CLOSED'),
  parseArtifactStatus('output/qa/dev-123/db-isolated-result.json', 'PASS'),
  parseArtifactStatus('output/qa/dev-123/auth-storage-local-result.json', 'PASS'),
  parseArtifactStatus('output/qa/dev-123/control-api-local-result.json', 'PASS'),
  parseArtifactStatus('output/playwright/dev-123-meeting-task-resolution/result.json', 'PASS'),
  parseArtifactStatus('output/playwright/dev-123-meeting-task-resolution-media/result.json', 'PASS'),
];
const failedSteps = results.filter((step) => step.status !== 'PASS');
const failedArtifacts = artifacts.filter((artifact) => artifact.status !== 'PASS');
const status = failedSteps.length || failedArtifacts.length ? 'FAIL' : 'PASS_WITH_EXTERNAL_GATES_PENDING';
const report = {
  devId: 'DEV-123',
  status,
  startedAt,
  finishedAt: new Date().toISOString(),
  externalGates: ['hosted authenticated DB/Storage', 'provider WP-123-0a/0b', 'full QA/QC', 'release'],
  steps: results,
  artifacts,
  runtimePolicy: 'This orchestrator reuses the configured local Vite/Supabase runtime; task-owned browser and isolated DB runtimes must be cleaned by their existing verifiers.',
};

mkdirSync('output/qa/dev-123', { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (status === 'FAIL') process.exitCode = 1;
