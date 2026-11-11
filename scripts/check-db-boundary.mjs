import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { S1_MIGRATION_PATHS, S3_MIGRATION_PATHS } from './lib/dev139-migration-paths.mjs';
import { MANAGED_DATABASE, assertManagedIamLogins } from '../shared/dev139ManagedDatabase.mjs';

const root = process.cwd();
const profilePath = resolve(root, process.argv[2] || process.env.DEV139_PROFILE || 'config/dev-139/s1-disposable.profile.json');
const failures = [];
const checks = [];
const profileContracts = new Map([
  ['^dev139_s1_[0-9a-f]{32}$', S1_MIGRATION_PATHS],
  ['^dev139_s3_[0-9a-f]{32}$', S3_MIGRATION_PATHS],
  ['^jenfu_prod$', S3_MIGRATION_PATHS],
]);

function fail(message) {
  failures.push(message);
}

function ok(name) {
  checks.push(name);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function walk(path) {
  try {
    const entries = readdirSync(path, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const child = resolve(path, entry.name);
      return entry.isDirectory() ? walk(child) : [child];
    });
  } catch (error) {
    fail(`cannot scan ${relative(root, path)}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function assertNoForbiddenProfileKeys(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:nonce|port|pid|credentials?|password|secret|token|artifacthash|binding)$/i.test(key) || /(?:Nonce|Pid|Credential|Password|Secret|Token|ArtifactHash|Binding)$/.test(key)) {
      fail(`profile contains per-attempt or secret key: ${path}.${key}`);
    }
    assertNoForbiddenProfileKeys(child, `${path}.${key}`);
  }
}

const profile = readJson(profilePath, 'profile');
if (profile) {
  for (const field of ['appKey', 'kernelContractVersion', 'environment', 'database', 'roles', 'migrations', 'objectAllowlist', 'staticFixturePath', 'runtime']) {
    if (!(field in profile)) fail(`profile missing ${field}`);
  }
  assertNoForbiddenProfileKeys(profile);
  if (profile.appKey !== 'projed') fail('profile appKey must be projed');
  if (profile.environment !== 'disposable' && profile.environment !== 'managed') {
    fail('profile environment must be disposable or managed');
  }
  const expectedHost = profile.environment === 'managed' ? MANAGED_DATABASE.host : '127.0.0.1';
  if (profile.database?.host !== expectedHost) fail('profile database host does not match its environment');
  if (profile.environment === 'managed'
    ? profile.database?.cloudSqlInstance !== MANAGED_DATABASE.cloudSqlInstance
    : profile.database?.cloudSqlInstance !== undefined) {
    fail('profile Cloud SQL instance does not match its environment');
  }
  if (profile.environment === 'managed') {
    try {
      assertManagedIamLogins(profile.database?.iamLogins);
      ok('managed IAM login identities');
    } catch (error) {
      fail(`managed IAM login contract mismatch: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (profile.database?.iamLogins !== undefined) {
    fail('disposable profile must not define managed IAM login identities');
  }
  const expectedMigrationPaths = profileContracts.get(profile.database?.namePattern);
  if (!expectedMigrationPaths) fail('profile database name pattern drifted');
  if (profile.database?.supportedPostgresMajors?.join('|') !== '17|18') fail('profile supported PostgreSQL majors must be 17 and 18');
  if (profile.database?.schemas?.join('|') !== 'projed_core|projed_contract') fail('profile schema order drifted');
  if (new Set([profile.roles?.owner, profile.roles?.migrator, profile.roles?.importer, profile.roles?.runtime]).size !== 4) {
    fail('owner, migrator, importer and runtime roles must be distinct');
  }
  if (!Array.isArray(profile.migrations)
      || !expectedMigrationPaths
      || profile.migrations.map(({ path }) => path).join('|') !== expectedMigrationPaths.join('|')) {
    fail('profile ordered migrations do not match its DEV-139 contract');
  }
  if (!Array.isArray(profile.objectAllowlist) || profile.objectAllowlist.length === 0) {
    fail('profile object allowlist is empty');
  }
  ok('profile shape and static binding policy');
}

const migrationEntries = Array.isArray(profile?.migrations) ? profile.migrations : [];
for (const migration of migrationEntries) {
  if (!migration?.version || !migration?.path) {
    fail('migration entry requires version and path');
    continue;
  }
  const migrationPath = resolve(root, migration.path);
  if (!migrationPath.startsWith(root + sep) || !statSafe(migrationPath)) {
    fail(`missing migration: ${migration.path}`);
    continue;
  }
  const sql = readFileSync(migrationPath, 'utf8');
  const normalized = sql.toLowerCase();
  const forbidden = [
    [/create\s+extension\b/, 'CREATE EXTENSION'],
    [/security\s+definer\b/, 'SECURITY DEFINER'],
    [/\bauth\.uid\s*\(/, 'auth.uid()'],
    [/\bexecute\s+(?:format\s*\(|immediate\b)/, 'dynamic SQL'],
    [/\bcreate\s+(?:unique\s+)?(?:table|function|index|sequence|schema)\s+(?:if\s+not\s+exists\s+)?public\./, 'public object'],
    [/\b(?:from|join|update|into|references)\s+auth\./, 'auth schema reference']
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(normalized)) fail(`${migration.path}: forbidden ${label}`);
  }
  const statements = normalized.split(';').map((statement) => statement.trim()).filter(Boolean);
  const migrationSequence = /^([0-9]{4})_/.exec(migration.version)?.[1];
  const enforceIndexAllowlist = migrationSequence !== undefined && Number(migrationSequence) >= 36;
  for (const statement of statements) {
    if (/^create\s+(?:unique\s+)?index\b/i.test(statement)) {
      const indexMatch = statement.match(/^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:(?:([a-z0-9_]+)\.)?([a-z0-9_]+))\s+on\s+(?:only\s+)?(?:(?:([a-z0-9_]+)\.)?([a-z0-9_]+))/i);
      if (!indexMatch) {
        fail(`${migration.path}: cannot classify index creation`);
      } else {
        const [, indexSchema, indexName, tableSchema] = indexMatch;
        const objectSchema = indexSchema || tableSchema;
        if (!tableSchema || !objectSchema || (indexSchema && indexSchema !== tableSchema)) {
          fail(`${migration.path}: index and target table must resolve to the same explicit app schema`);
        }
        const objectName = objectSchema ? `${objectSchema}.${indexName}` : null;
        // Frozen migrations before 0036 do not enumerate every index in their
        // profile allowlists. New indexes from 0036 onward must be listed.
        if (objectName && enforceIndexAllowlist && !profile.objectAllowlist.includes(objectName)) {
          fail(`${migration.path}: object outside allowlist: ${objectName}`);
        }
        if (!['projed_core', 'projed_contract'].includes(tableSchema || '')
            || !['projed_core', 'projed_contract'].includes(objectSchema || '')) {
          fail(`${migration.path}: index target is outside app schemas`);
        }
      }
    } else {
      const objectMatch = statement.match(/\b(?:create\s+|alter\s+|drop\s+)(?:table|function|index|sequence|view)\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+\.[a-z0-9_]+)/i);
      if (objectMatch && !profile.objectAllowlist.includes(objectMatch[1])) {
        fail(`${migration.path}: object outside allowlist: ${objectMatch[1]}`);
      }
      if (/\b(?:create\s+|alter\s+|drop\s+)(?:table|function|index|sequence|view)\s+(?:if\s+not\s+exists\s+)?[a-z0-9_]+\./i.test(statement) && !/\bprojed_(?:core|contract)\./i.test(statement)) {
        fail(`${migration.path}: qualified object is outside app schemas`);
      }
    }
  }
  ok(`migration ${migration.version}`);
}

const serverRoot = resolve(root, 'server');
if (!statSafe(serverRoot, true)) {
  fail('missing production server source directory: server');
} else {
  const serverFiles = walk(serverRoot).filter((path) => /\.(?:ts|mts|cts|js|mjs)$/.test(path));
  if (serverFiles.length === 0) fail('production server source directory has no source files');
  for (const file of serverFiles) {
    const source = readFileSync(file, 'utf8');
    const display = relative(root, file);
    if (/(?:^|[\\/])qa(?:[\\/]|$)|from\s+['"][^'"]*qa\//i.test(source)) {
      fail(`${display}: production import graph references qa`);
    }
    if (/from\s+['"](?:@supabase\/|\.\.?\/.*supabase)/i.test(source)) {
      fail(`${display}: production S1 server references Supabase provider directly`);
    }
  }
  ok('production server import graph excludes QA and provider-specific clients');
}

function statSafe(path, directory = false) {
  try {
    const stat = statSync(path);
    return directory ? stat.isDirectory() : stat.isFile();
  } catch {
    return false;
  }
}

const result = { status: failures.length ? 'FAIL' : 'PASS', checks, failures };
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
