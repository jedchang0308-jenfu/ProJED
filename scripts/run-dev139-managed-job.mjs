import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

import {
  createManagedBinding,
  loadManagedBindingFiles,
  serializeManagedBinding,
} from './lib/dev139-managed-binding.mjs';

const MANAGED_PROFILE_RELATIVE_PATH = 'config/dev-139/s3-managed.profile.json';
const SOURCE_BUNDLE_ENV = 'PROJED_MIGRATION_SOURCE_BUNDLE_FILE';
const SOURCE_BINDING_ENV = 'PROJED_MIGRATION_SOURCE_BINDING_FILE';
const SOURCE_DATABASE_URL_ENV = 'PROJED_MIGRATION_SOURCE_DATABASE_URL';
const LEGACY_SOURCE_ENV = Object.freeze([SOURCE_BINDING_ENV, SOURCE_DATABASE_URL_ENV]);
const SOURCE_MIGRATION_MODES = new Set(['plan', 'apply', 'reconcile']);
const SOURCE_PROJECT_REF = 'knodlkxqpcqyrtgwpdst';
const SOURCE_BUNDLE_MAX_BYTES = 256 * 1024;
const SOURCE_CA_MAX_BYTES = 128 * 1024;
const SOURCE_BINDING_KEYS = Object.freeze([
  'bindingVersion', 'provider', 'projectRef', 'connectionMode', 'hostname', 'port',
  'databaseName', 'readerRole', 'sslMode', 'sslRootCertSha256',
]);
const SOURCE_BUNDLE_KEYS = Object.freeze([
  'bundleVersion', 'sourceBinding', 'databaseUrl', 'sslRootCertPem',
]);
const CHILD_CREDENTIAL_ENV = Object.freeze([
  'PROJED_DATABASE_URL',
  'PROJED_MIGRATOR_DATABASE_URL',
  SOURCE_BUNDLE_ENV,
  ...LEGACY_SOURCE_ENV,
  'PROJED_MIGRATION_TARGET_DATABASE_URL',
]);
const REQUIRED_ENV_BY_MODE = Object.freeze({
  binding: Object.freeze([]),
  migrate: Object.freeze(['PROJED_MIGRATOR_DATABASE_URL']),
  plan: Object.freeze([
    SOURCE_BUNDLE_ENV,
    'PROJED_MIGRATION_TARGET_DATABASE_URL',
  ]),
  apply: Object.freeze([
    SOURCE_BUNDLE_ENV,
    'PROJED_MIGRATION_TARGET_DATABASE_URL',
  ]),
  reconcile: Object.freeze([
    SOURCE_BUNDLE_ENV,
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

  const legacySourceEnvironment = LEGACY_SOURCE_ENV.filter(name => Object.hasOwn(environment, name));
  if (legacySourceEnvironment.length > 0) {
    throw new Error(`Legacy source environment is not accepted: ${legacySourceEnvironment.join(', ')}`);
  }
  if (!SOURCE_MIGRATION_MODES.has(mode) && Object.hasOwn(environment, SOURCE_BUNDLE_ENV)) {
    throw new Error('Source bundle credentials are not accepted for this managed Job mode');
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

function invalidSourceBundle() {
  throw Object.assign(new Error('Managed source bundle is invalid'), { code: 'SOURCE_BUNDLE_INVALID' });
}

function exactObjectKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function validateSourceBindingShape(value) {
  if (!exactObjectKeys(value, SOURCE_BINDING_KEYS)) invalidSourceBundle();
  const binding = value;
  const projectRefValid = binding.projectRef === SOURCE_PROJECT_REF;
  const hostnameValid = typeof binding.hostname === 'string'
    && binding.hostname === binding.hostname.toLowerCase()
    && /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(binding.hostname);
  const databaseValid = typeof binding.databaseName === 'string'
    && /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/u.test(binding.databaseName);
  const roleValid = typeof binding.readerRole === 'string'
    && /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/u.test(binding.readerRole);
  const hashValid = typeof binding.sslRootCertSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(binding.sslRootCertSha256);
  if (binding.bindingVersion !== 1 || binding.provider !== 'supabase-postgres'
      || !projectRefValid
      || (binding.connectionMode !== 'direct' && binding.connectionMode !== 'session')
      || !hostnameValid || binding.port !== 5432 || !databaseValid || !roleValid
      || binding.sslMode !== 'verify-full' || !hashValid) {
    invalidSourceBundle();
  }
  if (binding.connectionMode === 'direct') {
    if (binding.hostname !== `db.${binding.projectRef}.supabase.co`) invalidSourceBundle();
  } else if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/u.test(binding.hostname)
      || !binding.readerRole.endsWith(`.${binding.projectRef}`)) {
    invalidSourceBundle();
  }
  return Object.freeze({ ...binding });
}

function validateSourceDatabaseUrl(raw, binding) {
  let url;
  try { url = new URL(raw); } catch { invalidSourceBundle(); }
  const queryKeys = [...url.searchParams.keys()].sort();
  let databaseName;
  let readerRole;
  try {
    databaseName = decodeURIComponent(url.pathname.slice(1));
    readerRole = decodeURIComponent(url.username);
  } catch { invalidSourceBundle(); }
  const certificatePath = url.searchParams.get('sslrootcert');
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== binding.hostname
      || Number(url.port || '5432') !== binding.port
      || databaseName !== binding.databaseName
      || readerRole !== binding.readerRole
      || url.password.length === 0 || url.hash !== ''
      || queryKeys.join('|') !== 'sslmode|sslrootcert'
      || url.searchParams.get('sslmode') !== binding.sslMode
      || typeof certificatePath !== 'string' || certificatePath.length === 0) {
    invalidSourceBundle();
  }
  return url;
}

function validateSourceBundle(value) {
  if (!exactObjectKeys(value, SOURCE_BUNDLE_KEYS) || value.bundleVersion !== 1
      || typeof value.databaseUrl !== 'string' || value.databaseUrl.length === 0
      || typeof value.sslRootCertPem !== 'string' || value.sslRootCertPem.length === 0) {
    invalidSourceBundle();
  }
  const sourceBinding = validateSourceBindingShape(value.sourceBinding);
  const sslRootCertBytes = Buffer.from(value.sslRootCertPem, 'utf8');
  if (sslRootCertBytes.length === 0 || sslRootCertBytes.length > SOURCE_CA_MAX_BYTES
      || !value.sslRootCertPem.includes('-----BEGIN CERTIFICATE-----')
      || !value.sslRootCertPem.includes('-----END CERTIFICATE-----')
      || createHash('sha256').update(sslRootCertBytes).digest('hex') !== sourceBinding.sslRootCertSha256) {
    invalidSourceBundle();
  }
  const sourceUrl = validateSourceDatabaseUrl(value.databaseUrl, sourceBinding);
  return Object.freeze({
    bundleVersion: 1,
    sourceBinding,
    databaseUrl: value.databaseUrl,
    sourceUrl,
    sslRootCertPem: value.sslRootCertPem,
    sslRootCertBytes,
  });
}

export function parseSourceBundleBytes(value) {
  let bytes;
  if (Buffer.isBuffer(value)) bytes = value;
  else if (value instanceof Uint8Array) bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  else if (typeof value === 'string') bytes = Buffer.from(value, 'utf8');
  else invalidSourceBundle();
  if (bytes.length === 0 || bytes.length > SOURCE_BUNDLE_MAX_BYTES) invalidSourceBundle();
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { invalidSourceBundle(); }
  const validated = validateSourceBundle(parsed);
  return Object.freeze({
    bundleVersion: validated.bundleVersion,
    sourceBinding: validated.sourceBinding,
    databaseUrl: validated.databaseUrl,
    sslRootCertPem: validated.sslRootCertPem,
  });
}

export function materializeSourceBundle(input, temporaryDirectory) {
  const validated = validateSourceBundle(input);
  if (typeof temporaryDirectory !== 'string' || !isAbsolute(temporaryDirectory)) invalidSourceBundle();
  try {
    if (!statSync(temporaryDirectory).isDirectory()) invalidSourceBundle();
  } catch { invalidSourceBundle(); }

  const sourceCaPath = join(temporaryDirectory, 'source-ca.pem');
  const sourceBindingPath = join(temporaryDirectory, 'source-binding.json');
  try {
    writeFileSync(sourceCaPath, validated.sslRootCertBytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(sourceBindingPath, `${JSON.stringify(validated.sourceBinding)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    });
  } catch { invalidSourceBundle(); }

  const sourceUrl = new URL(validated.databaseUrl);
  sourceUrl.searchParams.set('sslrootcert', sourceCaPath);
  return Object.freeze({
    sourceBinding: validated.sourceBinding,
    sourceBindingPath,
    sourceCaPath,
    sourceDatabaseUrl: sourceUrl.toString(),
  });
}

function readSourceBundleFile(bundlePath) {
  try {
    const file = statSync(bundlePath);
    if (!file.isFile() || file.size === 0 || file.size > SOURCE_BUNDLE_MAX_BYTES) invalidSourceBundle();
    return parseSourceBundleBytes(readFileSync(bundlePath));
  } catch { invalidSourceBundle(); }
}

async function validateMaterializedSourceBundle(materialized) {
  let contract;
  try {
    const contractPath = resolve(PROJECT_ROOT, 'dist-jobs/scripts/dev139-supabase-source-contract.js');
    contract = await import(pathToFileURL(contractPath).href);
  } catch {
    throw Object.assign(new Error('Managed source contract is unavailable'), { code: 'SOURCE_BUNDLE_INVALID' });
  }
  try {
    const binding = contract.validateSupabaseSourceBinding(materialized.sourceBinding);
    contract.validateSupabaseSourceUrl(materialized.sourceDatabaseUrl, binding);
  } catch {
    throw Object.assign(new Error('Managed source bundle is invalid'), { code: 'SOURCE_BUNDLE_INVALID' });
  }
}

export function createManagedJobChildEnvironment(environment, execution, profilePath, bindingPath, sourceBundle) {
  const childEnvironment = { ...environment };
  for (const name of CHILD_CREDENTIAL_ENV) {
    if (!execution.requiredEnvironment.includes(name)) delete childEnvironment[name];
  }
  delete childEnvironment.PROJED_DATABASE_URL;
  delete childEnvironment[SOURCE_BUNDLE_ENV];
  for (const name of LEGACY_SOURCE_ENV) delete childEnvironment[name];
  if (SOURCE_MIGRATION_MODES.has(execution.mode)) {
    if (!sourceBundle || typeof sourceBundle.sourceBindingPath !== 'string'
        || typeof sourceBundle.sourceDatabaseUrl !== 'string') invalidSourceBundle();
    childEnvironment[SOURCE_BINDING_ENV] = sourceBundle.sourceBindingPath;
    childEnvironment[SOURCE_DATABASE_URL_ENV] = sourceBundle.sourceDatabaseUrl;
  }
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

    let sourceBundle;
    if (SOURCE_MIGRATION_MODES.has(execution.mode)) {
      const sourceBundleInput = readSourceBundleFile(process.env[SOURCE_BUNDLE_ENV]);
      sourceBundle = materializeSourceBundle(sourceBundleInput, temporaryDirectory);
      await validateMaterializedSourceBundle(sourceBundle);
    }
    if (signalState.interrupted) {
      process.exitCode = 143;
      return;
    }

    const profilePath = resolve(PROJECT_ROOT, MANAGED_PROFILE_RELATIVE_PATH);
    const childEnvironment = createManagedJobChildEnvironment(
      process.env, execution, profilePath, bindingPath, sourceBundle,
    );
    if (signalState.interrupted) {
      process.exitCode = 143;
      return;
    }
    await runSelectedChild(execution, childEnvironment, PROJECT_ROOT, signalState, childEnvironment);
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
