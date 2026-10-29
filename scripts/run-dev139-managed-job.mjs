import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

import {
  createManagedBinding,
  loadManagedBindingFiles,
  serializeManagedBinding,
} from './lib/dev139-managed-binding.mjs';

const MANAGED_PROFILE_RELATIVE_PATH = 'config/dev-139/s3-managed.profile.json';
const CHILD_CREDENTIAL_ENV = Object.freeze([
  'PROJED_DATABASE_URL',
  'PROJED_MIGRATOR_DATABASE_URL',
  'PROJED_MIGRATION_SOURCE_BINDING_FILE',
  'PROJED_MIGRATION_SOURCE_DATABASE_URL',
  'PROJED_MIGRATION_TARGET_DATABASE_URL',
]);
const REQUIRED_ENV_BY_MODE = Object.freeze({
  binding: Object.freeze([]),
  migrate: Object.freeze(['PROJED_MIGRATOR_DATABASE_URL']),
  plan: Object.freeze([
    'PROJED_MIGRATION_SOURCE_BINDING_FILE',
    'PROJED_MIGRATION_SOURCE_DATABASE_URL',
    'PROJED_MIGRATION_TARGET_DATABASE_URL',
  ]),
  apply: Object.freeze([
    'PROJED_MIGRATION_SOURCE_BINDING_FILE',
    'PROJED_MIGRATION_SOURCE_DATABASE_URL',
    'PROJED_MIGRATION_TARGET_DATABASE_URL',
  ]),
  reconcile: Object.freeze([
    'PROJED_MIGRATION_SOURCE_BINDING_FILE',
    'PROJED_MIGRATION_SOURCE_DATABASE_URL',
    'PROJED_MIGRATION_TARGET_DATABASE_URL',
  ]),
});
const FAILURE_OUTPUT_LIMIT = 8192;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function selectManagedJobExecution(argumentsList, environment, nodeExecutable = process.execPath) {
  if (argumentsList.length !== 1 || typeof argumentsList[0] !== 'string') {
    throw new Error('Exactly one managed Job mode is required: binding, migrate, plan, apply, or reconcile');
  }
  const mode = argumentsList[0];
  const requiredEnvironment = REQUIRED_ENV_BY_MODE[mode];
  if (!requiredEnvironment) {
    throw new Error('Managed Job mode must be binding, migrate, plan, apply, or reconcile');
  }

  const missingEnvironment = requiredEnvironment.filter(name => (
    typeof environment[name] !== 'string' || environment[name].trim() === ''
  ));
  if (missingEnvironment.length > 0) {
    throw new Error(`Required managed Job environment is missing: ${missingEnvironment.join(', ')}`);
  }

  if (mode === 'binding') return Object.freeze({ mode, requiredEnvironment, command: null, args: Object.freeze([]) });
  if (mode === 'migrate') {
    return Object.freeze({
      mode,
      requiredEnvironment,
      command: nodeExecutable,
      args: Object.freeze(['scripts/migrate-dev-139-s1.mjs', '--profile=managed']),
    });
  }
  return Object.freeze({
    mode,
    requiredEnvironment,
    command: nodeExecutable,
    args: Object.freeze(['dist-jobs/scripts/dev139-data-migration.js', mode, '--target=managed']),
  });
}

export function createManagedJobChildEnvironment(environment, execution, profilePath, bindingPath) {
  const childEnvironment = { ...environment };
  for (const name of CHILD_CREDENTIAL_ENV) {
    if (!execution.requiredEnvironment.includes(name)) delete childEnvironment[name];
  }
  delete childEnvironment.PROJED_DATABASE_URL;
  childEnvironment.PROJED_SOURCE_PROFILE = profilePath;
  childEnvironment.PROJED_RUNTIME_BINDING_FILE = bindingPath;
  return childEnvironment;
}

function connectionCredentialValues(value) {
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return [];
    const values = [url.username, url.password];
    for (const valuePart of [url.username, url.password]) {
      try { values.push(decodeURIComponent(valuePart)); } catch { /* Keep the encoded part only. */ }
    }
    return values.filter(Boolean);
  } catch {
    return [];
  }
}

export function redactSensitiveOutput(value, environment, maxCharacters = FAILURE_OUTPUT_LIMIT) {
  let output = Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
  const secrets = new Set();
  for (const [name, configuredValue] of Object.entries(environment)) {
    if (/(?:URL|DSN|PASSWORD|SECRET|TOKEN|CREDENTIAL)/iu.test(name)
        && typeof configuredValue === 'string' && configuredValue.length > 0) {
      secrets.add(configuredValue);
      for (const credential of connectionCredentialValues(configuredValue)) secrets.add(credential);
    }
  }

  for (const secret of [...secrets].sort((left, right) => right.length - left.length)) {
    output = output.split(secret).join('[REDACTED]');
  }
  output = output.replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/giu, '[REDACTED POSTGRES URL]');

  if (output.length <= maxCharacters) return output;
  const truncationMarker = '\n[managed Job output truncated]';
  if (maxCharacters <= truncationMarker.length) return truncationMarker.slice(0, maxCharacters);
  return `${output.slice(0, maxCharacters - truncationMarker.length)}${truncationMarker}`;
}

function writeFailure(message, environment) {
  const sanitized = redactSensitiveOutput(message, environment, FAILURE_OUTPUT_LIMIT);
  process.stderr.write(sanitized.endsWith('\n') ? sanitized : `${sanitized}\n`);
}

function runSelectedChild(execution, childEnvironment, projectRoot, signalState, environment) {
  return new Promise(resolvePromise => {
    let child;
    let spawnError;
    const stdoutChunks = [];
    const stderrChunks = [];
    try {
      child = spawn(execution.command, execution.args, {
        cwd: projectRoot,
        env: childEnvironment,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolvePromise({ error });
      return;
    }

    signalState.child = child;
    if (signalState.interrupted) child.kill('SIGTERM');
    child.stdout.on('data', chunk => stdoutChunks.push(chunk));
    child.stderr.on('data', chunk => stderrChunks.push(chunk));
    child.once('error', error => { spawnError = error; });
    child.once('close', (code, signal) => {
      if (signalState.child === child) signalState.child = null;
      resolvePromise({
        code,
        signal,
        error: spawnError,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
      });
    });
  }).then(result => {
    if (signalState.interrupted) {
      writeFailure('Managed Job interrupted by SIGTERM; child result was discarded.', environment);
      process.exitCode = 143;
      return;
    }

    if (result.error) {
      writeFailure(`Unable to start managed Job child: ${result.error.message}`, environment);
      process.exitCode = 1;
      return;
    }

    if (result.code === 0) {
      process.stdout.write(result.stdout);
      if (result.stderr.length > 0) writeFailure(result.stderr.toString('utf8'), environment);
      return;
    }

    const diagnostics = [result.stderr.toString('utf8'), result.stdout.toString('utf8')]
      .filter(part => part.length > 0)
      .join('\n');
    const exitDescription = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.code ?? 'unknown'}`;
    writeFailure(`Managed Job child failed with ${exitDescription}.${diagnostics ? `\n${diagnostics}` : ''}`, environment);
    process.exitCode = typeof result.code === 'number' && result.code > 0 ? result.code : 1;
  });
}

async function main() {
  const signalState = { interrupted: false, child: null };
  const onSigterm = () => {
    signalState.interrupted = true;
    signalState.child?.kill('SIGTERM');
  };
  process.on('SIGTERM', onSigterm);

  let temporaryDirectory;
  try {
    const execution = selectManagedJobExecution(process.argv.slice(2), process.env);
    const files = loadManagedBindingFiles(PROJECT_ROOT);
    const binding = createManagedBinding({
      ...files,
      instance: files.profile.database.cloudSqlInstance,
      database: 'jenfu_prod',
    });
    if (signalState.interrupted) {
      process.exitCode = 143;
      return;
    }

    temporaryDirectory = mkdtempSync(join(tmpdir(), 'projed-dev139-managed-job-'));
    const bindingPath = join(temporaryDirectory, 'runtime-binding.json');
    const serializedBinding = serializeManagedBinding(binding);
    writeFileSync(bindingPath, serializedBinding, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

    if (execution.mode === 'binding') {
      if (!signalState.interrupted) process.stdout.write(serializedBinding);
      else process.exitCode = 143;
      return;
    }

    const profilePath = resolve(PROJECT_ROOT, MANAGED_PROFILE_RELATIVE_PATH);
    const childEnvironment = createManagedJobChildEnvironment(process.env, execution, profilePath, bindingPath);
    if (signalState.interrupted) {
      process.exitCode = 143;
      return;
    }
    await runSelectedChild(execution, childEnvironment, PROJECT_ROOT, signalState, process.env);
  } catch (error) {
    writeFailure(error instanceof Error ? error.message : String(error), process.env);
    process.exitCode = signalState.interrupted ? 143 : 1;
  } finally {
    process.off('SIGTERM', onSigterm);
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
