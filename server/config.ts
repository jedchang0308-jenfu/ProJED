import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import { KernelError } from './errors.js';

export type AppEntry = 'main' | 'quick';
export type RuntimeEnvironment = 'disposable' | 'managed';

export interface SourceProfile {
  profileVersion: 1;
  appKey: 'projed';
  kernelContractVersion: 1;
  environment: RuntimeEnvironment;
  database: {
    namePattern: string;
    host: '127.0.0.1' | 'cloud-sql-unix';
    cloudSqlInstance?: string;
    supportedPostgresMajors: readonly number[];
    schemas: readonly string[];
  };
  roles: { owner: string; migrator: string; importer: string; runtime: string };
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
  connectionMode?: 'loopback' | 'cloud-sql-unix';
  cloudSqlInstance?: string;
  profileSha256: string;
  migrationSha256: Record<string, string>;
  staticFixtureSha256: string;
}

export interface RuntimeConfig {
  env: RuntimeEnvironment;
  entry: AppEntry;
  host: '127.0.0.1' | '0.0.0.0';
  port: number;
  databaseUrl: string;
  profilePath: string;
  profile: SourceProfile;
  bindingPath: string;
  binding: RuntimeBinding;
  staticRoot: string;
  publicAppUrl?: string;
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const CLOUD_SQL_INSTANCE_RE = /^[a-z][a-z0-9-]{5,29}:[a-z0-9-]+:[a-z][a-z0-9-]{0,97}$/;
const S3_RUNTIME_MIGRATION_PATHS:readonly string[] = [
  'db/migrations/0001_runtime_boundary_v1.sql',
  'db/migrations/0002_profile_actor_v1.sql',
  'db/migrations/0003_domain_read_v1.sql',
  'db/migrations/0004_domain_command_v1.sql',
  'db/migrations/0005_collaboration_command_v1.sql',
  'db/migrations/0006_record_activity_v1.sql',
  'db/migrations/0007_board_transfer_v1.sql',
  'db/migrations/0008_unplaced_quick_capture_v1.sql',
  'db/migrations/0009_task_workbench_placement_v1.sql',
  'db/migrations/0010_task_tracking_reference_v1.sql',
  'db/migrations/0011_board_backup_import_v1.sql',
  'db/migrations/0012_account_preferences_v1.sql',
  'db/migrations/0013_calendar_subscriptions_v1.sql',
  'db/migrations/0014_snapshot_importer_v1.sql',
  'db/migrations/0015_llm_access_log_retention_v1.sql',
  'db/migrations/0016_workspace_lifecycle_compatibility_v1.sql',
  'db/migrations/0017_document_source_retention_v1.sql',
  'db/migrations/0018_google_identity_proof_v1.sql',
  'db/migrations/0019_app_sessions_v1.sql',
  'db/migrations/0020_snapshot_account_guards_v1.sql',
  'db/migrations/0021_safe_actor_context_v1.sql',
  'db/migrations/0022_first_login_registration_v1.sql',
  'db/migrations/0023_verified_login_email_v1.sql',
  'db/migrations/0024_rag_record_lifecycle_v1.sql',
  'db/migrations/0025_rag_lock_and_fk_compatibility_v1.sql',
  'db/migrations/0026_meeting_source_retention_v1.sql',
  'db/migrations/0027_meeting_cascade_compatibility_v1.sql',
  'db/migrations/0028_meeting_atomic_cascade_v1.sql',
  'db/migrations/0029_meeting_capture_runtime_v1.sql',
  'db/migrations/0030_meeting_legacy_task_pointer_v1.sql',
  'db/migrations/0031_meeting_audio_transport_v1.sql',
  'db/migrations/0032_meeting_upload_completion_v1.sql',
  'db/migrations/0033_meeting_human_review_v1.sql',
];
const PROFILE_MIGRATION_PATHS = new Map<string, readonly string[]>([
  ['^dev139_s1_[0-9a-f]{32}$', [
    'db/migrations/0001_runtime_boundary_v1.sql',
    'db/migrations/0002_profile_actor_v1.sql',
  ]],
  ['^dev139_s3_[0-9a-f]{32}$', S3_RUNTIME_MIGRATION_PATHS],
  ['^jenfu_prod$', S3_RUNTIME_MIGRATION_PATHS],
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
      || value.kernelContractVersion !== 1
      || (value.environment !== 'disposable' && value.environment !== 'managed')) {
    throw new KernelError('CONFIG_INVALID', 'Unsupported source profile identity');
  }
  const expectedMigrationPaths = PROFILE_MIGRATION_PATHS.get(value.database?.namePattern);
  const expectedHost = value.environment === 'managed' ? 'cloud-sql-unix' : '127.0.0.1';
  if (!expectedMigrationPaths || value.database?.host !== expectedHost
      || value.database?.supportedPostgresMajors?.join('|') !== '17|18'
      || value.database?.schemas?.join('|') !== 'projed_core|projed_contract'
      || (value.environment === 'managed'
        ? value.database.cloudSqlInstance !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'
        : value.database.cloudSqlInstance !== undefined)) {
    throw new KernelError('CONFIG_INVALID', 'Unexpected database contract');
  }
  if (value.roles?.owner !== 'projed_owner_disposable'
      || value.roles?.migrator !== 'projed_migrator_disposable'
      || value.roles?.importer !== 'projed_importer_disposable'
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
  const allowedKeys = new Set([
    'databaseName', 'databasePort', 'runtimeRole', 'connectionMode', 'cloudSqlInstance',
    'profileSha256', 'migrationSha256', 'staticFixtureSha256',
  ]);
  const expectedConnectionMode = profile.environment === 'managed' ? 'cloud-sql-unix' : 'loopback';
  const connectionMode = binding.connectionMode ?? 'loopback';
  if (Object.keys(binding).some(key => !allowedKeys.has(key))
      || !new RegExp(profile.database.namePattern).test(binding.databaseName)
      || positiveInteger(binding.databasePort, 'binding.databasePort') > 65535
      || binding.runtimeRole !== profile.roles.runtime
      || connectionMode !== expectedConnectionMode
      || (connectionMode === 'cloud-sql-unix'
        ? !CLOUD_SQL_INSTANCE_RE.test(binding.cloudSqlInstance ?? '')
          || binding.cloudSqlInstance !== profile.database.cloudSqlInstance
        : binding.cloudSqlInstance !== undefined)
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
  const baseInvalid = !['postgres:', 'postgresql:'].includes(url.protocol)
    || decodeURIComponent(url.pathname.slice(1)) !== binding.databaseName
    || decodeURIComponent(url.username) !== binding.runtimeRole
    || url.hash !== '';
  const connectionMode = binding.connectionMode ?? 'loopback';
  const queryKeys = [...url.searchParams.keys()];
  const connectionInvalid = connectionMode === 'cloud-sql-unix'
    ? url.hostname !== 'localhost'
      || (url.port !== '' && Number(url.port) !== binding.databasePort)
      || queryKeys.length !== 1
      || queryKeys[0] !== 'host'
      || url.searchParams.get('host') !== `/cloudsql/${binding.cloudSqlInstance}`
    : url.hostname !== '127.0.0.1'
      || Number(url.port || '5432') !== binding.databasePort
      || url.search !== '';
  if (baseInvalid || connectionInvalid) {
    throw new KernelError('CONFIG_INVALID', 'Database URL is outside the owned runtime binding');
  }
  return url;
}

export function validateStaticRoot(profile: SourceProfile, binding: RuntimeBinding): string {
  let staticRoot: string;
  try {
    staticRoot = realpathSync(resolve(profile.staticFixturePath));
    if (profile.environment === 'managed') {
      const metadataBytes = readFileSync(resolve(staticRoot, 'dev139-cloud-run-meta.json'));
      if (sha256(metadataBytes) !== binding.staticFixtureSha256) throw new Error('metadata hash mismatch');
      const metadata = JSON.parse(metadataBytes.toString('utf8')) as Record<string, unknown>;
      if (metadata.schemaVersion !== 1 || metadata.backend !== 'http'
          || typeof metadata.releaseId !== 'string' || !/^[A-Za-z0-9._-]{1,96}$/.test(metadata.releaseId)
          || metadata.entrySha256 !== sha256(readFileSync(resolve(staticRoot, 'index.html')))
          || metadata.quickEntrySha256 !== sha256(readFileSync(resolve(staticRoot, 'quick-task/index.html')))) {
        throw new Error('static entry hash mismatch');
      }
    } else {
      const entry = readFileSync(resolve(staticRoot, 'index.html'));
      if (sha256(entry) !== binding.staticFixtureSha256) throw new Error('hash mismatch');
    }
  } catch (error) {
    throw new KernelError('CONFIG_INVALID', 'Static artifact does not match the runtime binding', 500, { cause: error });
  }
  return staticRoot;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  if (env.PROJED_ENV !== 'disposable' && env.PROJED_ENV !== 'managed') {
    throw new KernelError('CONFIG_INVALID', 'PROJED_ENV must be disposable or managed');
  }
  const runtimeEnvironment = env.PROJED_ENV;
  const entry = env.PROJED_APP_ENTRY;
  if (entry !== 'main' && entry !== 'quick') throw new KernelError('CONFIG_INVALID', 'PROJED_APP_ENTRY must be main or quick');
  const profilePath = resolve(env.PROJED_SOURCE_PROFILE
    ?? (runtimeEnvironment === 'managed'
      ? 'config/dev-139/s3-managed.profile.json'
      : 'config/dev-139/s1-disposable.profile.json'));
  const loaded = loadSourceProfile(profilePath);
  if (loaded.profile.environment !== runtimeEnvironment) {
    throw new KernelError('CONFIG_INVALID', 'Runtime environment does not match the source profile');
  }
  const bindingFile = env.PROJED_RUNTIME_BINDING_FILE?.trim();
  const bindingJson = env.PROJED_RUNTIME_BINDING_JSON?.trim();
  if (Boolean(bindingFile) === Boolean(bindingJson)) {
    throw new KernelError('CONFIG_INVALID', 'Provide exactly one runtime binding source');
  }
  let bindingPath: string;
  let binding: RuntimeBinding;
  if (bindingFile) {
    bindingPath = resolve(bindingFile);
    binding = readJson<RuntimeBinding>(bindingPath).value;
  } else {
    bindingPath = '<inline>';
    try { binding = JSON.parse(bindingJson ?? '') as RuntimeBinding; }
    catch (error) { throw new KernelError('CONFIG_INVALID', 'Cannot read inline runtime binding', 500, { cause: error }); }
  }
  validateRuntimeBinding(binding, loaded.profile, loaded.sha256);
  const databaseUrl = env.PROJED_DATABASE_URL ?? '';
  validateRuntimeDatabaseUrl(databaseUrl, binding);
  const port = env.PORT === undefined ? 0 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new KernelError('CONFIG_INVALID', 'PORT is invalid');
  const host = runtimeEnvironment === 'managed' || env.PROJED_RUNTIME_MODE === 'cloud-run-config'
    ? loaded.profile.runtime.cloudRunBindHost
    : loaded.profile.runtime.bindHost;
  let publicAppUrl: string | undefined;
  if (env.PROJED_PUBLIC_APP_URL?.trim()) {
    let parsed: URL;
    try { parsed = new URL(env.PROJED_PUBLIC_APP_URL.trim()); }
    catch (error) { throw new KernelError('CONFIG_INVALID', 'PROJED_PUBLIC_APP_URL is invalid', 500, { cause: error }); }
    if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)))
        || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new KernelError('CONFIG_INVALID', 'PROJED_PUBLIC_APP_URL is outside the allowed origin contract');
    }
    publicAppUrl = parsed.toString().replace(/\/$/, '');
  }
  return {
    env: runtimeEnvironment, entry, host, port, databaseUrl, profilePath,
    profile: loaded.profile, bindingPath, binding,
    staticRoot: validateStaticRoot(loaded.profile, binding),
    ...(publicAppUrl ? { publicAppUrl } : {}),
  };
}
