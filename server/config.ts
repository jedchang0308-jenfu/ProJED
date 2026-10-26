import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import { KernelError } from './errors.js';

export type AppEntry = 'main' | 'quick';

export interface SourceProfile {
  profileVersion: 1;
  appKey: 'projed';
  kernelContractVersion: 1;
  environment: 'disposable';
  database: {
    namePattern: string;
    host: '127.0.0.1';
    supportedPostgresMajors: readonly number[];
    schemas: readonly string[];
  };
  roles: { owner: string; migrator: string; runtime: string };
  migrations: readonly { version: string; path: string }[];
  objectAllowlist: readonly string[];
  staticFixturePath: string;
  runtime: {
    bindHost: '127.0.0.1';
    cloudRunBindHost: '0.0.0.0';
    pool: { max: number; min: number; idleTimeoutMillis: number; connectionTimeoutMillis: number; maxWaiting: number };
    timeouts: {
      requestMillis: number;
      transactionMillis: number;
      statementMillis: number;
      lockMillis: number;
      idleInTransactionMillis: number;
      shutdownMillis: number;
    };
  };
}

export interface RuntimeBinding {
  databaseName: string;
  databasePort: number;
  runtimeRole: string;
  profileSha256: string;
  migrationSha256: Record<string, string>;
  staticFixtureSha256: string;
}

export interface RuntimeConfig {
  env: 'disposable';
  entry: AppEntry;
  host: '127.0.0.1' | '0.0.0.0';
  port: number;
  databaseUrl: string;
  profilePath: string;
  profile: SourceProfile;
  bindingPath: string;
  binding: RuntimeBinding;
  staticRoot: string;
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const PROFILE_MIGRATION_PATHS = new Map<string, readonly string[]>([
  ['^dev139_s1_[0-9a-f]{32}$', [
    'db/migrations/0001_runtime_boundary_v1.sql',
    'db/migrations/0002_profile_actor_v1.sql',
  ]],
  ['^dev139_s3_[0-9a-f]{32}$', [
    'db/migrations/0001_runtime_boundary_v1.sql',
    'db/migrations/0002_profile_actor_v1.sql',
    'db/migrations/0003_domain_read_v1.sql',
    'db/migrations/0004_domain_command_v1.sql',
    'db/migrations/0005_collaboration_command_v1.sql',
  ]],
]);

export function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson<T>(path: string): { value: T; bytes: Buffer } {
  try {
    const bytes = readFileSync(path);
    return { value: JSON.parse(bytes.toString('utf8')) as T, bytes };
  } catch (error) {
    throw new KernelError('CONFIG_INVALID', `Cannot read JSON configuration: ${path}`, 500, { cause: error });
  }
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new KernelError('CONFIG_INVALID', `${name} must be a positive integer`);
  }
  return Number(value);
}

export function loadSourceProfile(path: string): { profile: SourceProfile; sha256: string } {
  const absolutePath = resolve(path);
  const { value, bytes } = readJson<SourceProfile>(absolutePath);
  if (value.profileVersion !== 1 || value.appKey !== 'projed'
      || value.kernelContractVersion !== 1 || value.environment !== 'disposable') {
    throw new KernelError('CONFIG_INVALID', 'Unsupported source profile identity');
  }
  const expectedMigrationPaths = PROFILE_MIGRATION_PATHS.get(value.database?.namePattern);
  if (!expectedMigrationPaths || value.database?.host !== '127.0.0.1'
      || value.database?.supportedPostgresMajors?.join('|') !== '17|18'
      || value.database?.schemas?.join('|') !== 'projed_core|projed_contract') {
    throw new KernelError('CONFIG_INVALID', 'Unexpected disposable database contract');
  }
  if (value.roles?.owner !== 'projed_owner_disposable'
      || value.roles?.migrator !== 'projed_migrator_disposable'
      || value.roles?.runtime !== 'projed_runtime_disposable') {
    throw new KernelError('CONFIG_INVALID', 'Unexpected database roles');
  }
  if (!Array.isArray(value.migrations)
      || value.migrations.map(({ path: migrationPath }) => migrationPath).join('|') !== expectedMigrationPaths.join('|')
      || new Set(value.migrations.map(({ path: migrationPath }) => migrationPath)).size !== expectedMigrationPaths.length) {
    throw new KernelError('CONFIG_INVALID', 'Ordered migrations do not match the selected DEV-139 profile');
  }
  positiveInteger(value.runtime?.pool?.max, 'runtime.pool.max');
  positiveInteger(value.runtime?.pool?.maxWaiting, 'runtime.pool.maxWaiting');
  for (const [name, limit] of Object.entries(value.runtime?.timeouts ?? {})) positiveInteger(limit, `runtime.timeouts.${name}`);
  return { profile: Object.freeze(value), sha256: sha256(bytes) };
}

export function validateRuntimeBinding(binding: RuntimeBinding, profile: SourceProfile, profileHash: string): void {
  if (!new RegExp(profile.database.namePattern).test(binding.databaseName)
      || positiveInteger(binding.databasePort, 'binding.databasePort') > 65535
      || binding.runtimeRole !== profile.roles.runtime
      || binding.profileSha256 !== profileHash
      || !SHA256_RE.test(binding.staticFixtureSha256)) {
    throw new KernelError('CONFIG_INVALID', 'Runtime binding does not match the DEV-139 profile');
  }
  for (const migration of profile.migrations) {
    if (!SHA256_RE.test(binding.migrationSha256?.[migration.path] ?? '')) {
      throw new KernelError('CONFIG_INVALID', `Migration binding is missing: ${migration.path}`);
    }
  }
  if (Object.keys(binding.migrationSha256).some((path) => !profile.migrations.some((item) => item.path === path))) {
    throw new KernelError('CONFIG_INVALID', 'Runtime binding includes an unknown migration');
  }
}

export function validateRuntimeDatabaseUrl(raw: string, binding: RuntimeBinding): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new KernelError('CONFIG_INVALID', 'PROJED_DATABASE_URL is invalid', 500, { cause: error });
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== '127.0.0.1'
      || Number(url.port || '5432') !== binding.databasePort
      || decodeURIComponent(url.pathname.slice(1)) !== binding.databaseName
      || decodeURIComponent(url.username) !== binding.runtimeRole
      || url.search !== '' || url.hash !== '') {
    throw new KernelError('CONFIG_INVALID', 'Database URL is outside the owned disposable binding');
  }
  return url;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  if (env.PROJED_ENV !== 'disposable') throw new KernelError('CONFIG_INVALID', 'DEV-139 only accepts PROJED_ENV=disposable');
  const entry = env.PROJED_APP_ENTRY;
  if (entry !== 'main' && entry !== 'quick') throw new KernelError('CONFIG_INVALID', 'PROJED_APP_ENTRY must be main or quick');
  const profilePath = resolve(env.PROJED_SOURCE_PROFILE ?? 'config/dev-139/s1-disposable.profile.json');
  const loaded = loadSourceProfile(profilePath);
  if (!env.PROJED_RUNTIME_BINDING_FILE) throw new KernelError('CONFIG_INVALID', 'PROJED_RUNTIME_BINDING_FILE is required');
  const bindingPath = resolve(env.PROJED_RUNTIME_BINDING_FILE);
  const binding = readJson<RuntimeBinding>(bindingPath).value;
  validateRuntimeBinding(binding, loaded.profile, loaded.sha256);
  const databaseUrl = env.PROJED_DATABASE_URL ?? '';
  validateRuntimeDatabaseUrl(databaseUrl, binding);
  const port = env.PORT === undefined ? 0 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new KernelError('CONFIG_INVALID', 'PORT is invalid');
  const host = env.PROJED_RUNTIME_MODE === 'cloud-run-config'
    ? loaded.profile.runtime.cloudRunBindHost
    : loaded.profile.runtime.bindHost;
  return {
    env: 'disposable', entry, host, port, databaseUrl, profilePath,
    profile: loaded.profile, bindingPath, binding,
    staticRoot: realpathSync(resolve(loaded.profile.staticFixturePath)),
  };
}
