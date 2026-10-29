import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MANAGED_DATABASE, assertManagedIamLogins } from '../../shared/dev139ManagedDatabase.mjs';

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
  if (database && database !== MANAGED_DATABASE.databaseName) throw new Error(`Managed database name must be ${MANAGED_DATABASE.databaseName}`);
  assertManagedIamLogins(profile.database?.iamLogins);
  if (profile.profileVersion !== 1 || profile.appKey !== 'projed' || profile.environment !== 'managed'
      || profile.database?.namePattern !== `^${MANAGED_DATABASE.databaseName}$` || profile.database?.host !== MANAGED_DATABASE.host
      || profile.database?.cloudSqlInstance !== MANAGED_DATABASE.cloudSqlInstance
      || profile.roles?.runtime !== MANAGED_DATABASE.roles.runtime) {
    throw new Error('Managed profile contract mismatch');
  }
  if (instance !== MANAGED_DATABASE.cloudSqlInstance) throw new Error('Managed Cloud SQL instance must match the source profile');

  const migrationSha256 = Object.fromEntries(profile.migrations.map(({ path }) => {
    const migrationBytes = migrationBytesByPath instanceof Map
      ? migrationBytesByPath.get(path)
      : migrationBytesByPath?.[path];
    if (migrationBytes === undefined) throw new Error(`Managed migration bytes are missing: ${path}`);
    return [path, sha256(migrationBytes)];
  }));

  return {
    databaseName: MANAGED_DATABASE.databaseName,
    databasePort: MANAGED_DATABASE.databasePort,
    runtimeRole: MANAGED_DATABASE.roles.runtime,
    connectionMode: MANAGED_DATABASE.host,
    cloudSqlInstance: instance,
    iamLogins: profile.database.iamLogins,
    profileSha256: sha256(profileBytes),
    migrationSha256,
    staticFixtureSha256: sha256(staticFixtureBytes),
  };
}

export function serializeManagedBinding(binding) {
  return `${JSON.stringify(binding, null, 2)}\n`;
}
