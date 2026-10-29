import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INSTANCE_RE = /^[a-z][a-z0-9-]{5,29}:[a-z0-9-]+:[a-z][a-z0-9-]{0,97}$/;
const ALLOWED_OPTIONS = new Set(['instance', 'database', 'output']);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function parseManagedBindingOptions(argumentsList) {
  const options = {};
  for (const argument of argumentsList) {
    const match = argument.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new Error('Arguments must use --name=value');
    if (!ALLOWED_OPTIONS.has(match[1])) throw new Error(`Unsupported --${match[1]} option`);
    if (Object.hasOwn(options, match[1])) throw new Error(`Duplicate --${match[1]} option`);
    options[match[1]] = match[2];
  }
  return options;
}

export function loadManagedBindingFiles(projectRoot) {
  const profileBytes = readFileSync(resolve(projectRoot, 'config/dev-139/s3-managed.profile.json'));
  const profile = JSON.parse(profileBytes.toString('utf8'));
  const migrationBytesByPath = Object.fromEntries(profile.migrations.map(({ path }) => [
    path,
    readFileSync(resolve(projectRoot, path)),
  ]));
  const staticFixtureBytes = readFileSync(resolve(projectRoot, profile.staticFixturePath, 'dev139-cloud-run-meta.json'));
  return { profileBytes, profile, migrationBytesByPath, staticFixtureBytes };
}

export function createManagedBinding({
  instance,
  database = 'jenfu_prod',
  profileBytes,
  profile,
  migrationBytesByPath,
  staticFixtureBytes,
}) {
  if (!INSTANCE_RE.test(instance ?? '')) throw new Error('A valid --instance=project:region:instance is required');
  if (database && database !== 'jenfu_prod') throw new Error('Managed database name must be jenfu_prod');
  if (profile.profileVersion !== 1 || profile.appKey !== 'projed' || profile.environment !== 'managed'
      || profile.database?.namePattern !== '^jenfu_prod$' || profile.database?.host !== 'cloud-sql-unix'
      || profile.roles?.runtime !== 'projed_runtime_disposable') {
    throw new Error('Managed profile contract mismatch');
  }
  if (instance !== profile.database.cloudSqlInstance) throw new Error('Managed Cloud SQL instance must match the source profile');

  const migrationSha256 = Object.fromEntries(profile.migrations.map(({ path }) => {
    const migrationBytes = migrationBytesByPath instanceof Map
      ? migrationBytesByPath.get(path)
      : migrationBytesByPath?.[path];
    if (migrationBytes === undefined) throw new Error(`Managed migration bytes are missing: ${path}`);
    return [path, sha256(migrationBytes)];
  }));

  return {
    databaseName: 'jenfu_prod',
    databasePort: 5432,
    runtimeRole: profile.roles.runtime,
    connectionMode: 'cloud-sql-unix',
    cloudSqlInstance: instance,
    profileSha256: sha256(profileBytes),
    migrationSha256,
    staticFixtureSha256: sha256(staticFixtureBytes),
  };
}

export function serializeManagedBinding(binding) {
  return `${JSON.stringify(binding, null, 2)}\n`;
}
