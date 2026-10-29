import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';
import {
  assertManagedIamLogins,
  fetchManagedJobToken,
  managedJobConnectionOptions,
  prepareManagedDatabaseSession,
  validateManagedDatabaseUrl,
} from '../shared/dev139ManagedDatabase.mjs';
import { S1_MIGRATION_PATHS, S3_MIGRATION_PATHS } from './lib/dev139-migration-paths.mjs';

const { Client } = pg;
const profileContracts = new Map([
  [resolve('config/dev-139/s1-disposable.profile.json'), {
    name: 's1',
    environment: 'disposable',
    host: '127.0.0.1',
    namePattern: '^dev139_s1_[0-9a-f]{32}$',
    migrationPaths: S1_MIGRATION_PATHS,
  }],
  [resolve('config/dev-139/s3-read-disposable.profile.json'), {
    name: 's3-read',
    environment: 'disposable',
    host: '127.0.0.1',
    namePattern: '^dev139_s3_[0-9a-f]{32}$',
    migrationPaths: S3_MIGRATION_PATHS,
  }],
  [resolve('config/dev-139/s3-managed.profile.json'), {
    name: 's3-managed',
    environment: 'managed',
    host: 'cloud-sql-iam',
    namePattern: '^jenfu_prod$',
    migrationPaths: S3_MIGRATION_PATHS,
  }],
]);
const defaultProfilePath = resolve('config/dev-139/s1-disposable.profile.json');
const profileOption = process.argv.find(argument => argument.startsWith('--profile='))?.slice('--profile='.length);
if (profileOption && profileOption !== 'managed') throw new Error('Unsupported migration profile option');
const profilePath = resolve(process.env.PROJED_SOURCE_PROFILE
  || (profileOption === 'managed' ? 'config/dev-139/s3-managed.profile.json' : defaultProfilePath));
const profileContract = profileContracts.get(profilePath);
if (!profileContract) throw new Error('Only source-controlled DEV-139 profiles are accepted');
const profileBytes = readFileSync(profilePath);
const profile = JSON.parse(profileBytes.toString('utf8'));
const expectedMigrationPaths = profileContract.migrationPaths;
if (profile.profileVersion !== 1 || profile.appKey !== 'projed' || profile.kernelContractVersion !== 1
    || profile.environment !== profileContract.environment || profile.database?.host !== profileContract.host
    || profile.database?.namePattern !== profileContract.namePattern
    || profile.database?.supportedPostgresMajors?.join('|') !== '17|18'
    || profile.roles?.owner !== 'projed_owner_disposable'
    || profile.roles?.migrator !== 'projed_migrator_disposable'
    || profile.roles?.importer !== 'projed_importer_disposable'
    || profile.roles?.runtime !== 'projed_runtime_disposable'
    || profile.migrations?.map(({ path }) => path).join('|') !== expectedMigrationPaths.join('|')) {
  throw new Error('DEV-139 profile contract mismatch');
}
if (profileContract.environment === 'managed') assertManagedIamLogins(profile.database.iamLogins);
const boundaryCheck = spawnSync(process.execPath, ['scripts/check-db-boundary.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, DEV139_PROFILE: profilePath },
  stdio: 'inherit',
});
if (boundaryCheck.error || boundaryCheck.status !== 0) throw new Error('DEV-139 DB boundary check failed');
const bindingPath = process.env.PROJED_RUNTIME_BINDING_FILE;
if (!bindingPath) throw new Error('PROJED_RUNTIME_BINDING_FILE is required');
const binding = JSON.parse(readFileSync(resolve(bindingPath), 'utf8'));
const connectionString = process.env.PROJED_MIGRATOR_DATABASE_URL;
if (!connectionString) throw new Error('PROJED_MIGRATOR_DATABASE_URL is required');
const managed = profileContract.environment === 'managed';
const migrationBinding = binding;
if (managed) {
  if (profile.database.cloudSqlInstance !== binding.cloudSqlInstance) {
    throw new Error('Managed database binding does not match the source profile');
  }
  assertManagedIamLogins(binding.iamLogins);
  validateManagedDatabaseUrl(connectionString, migrationBinding, 'migrator');
} else {
  const url = new URL(connectionString);
  const connectionMode = binding.connectionMode ?? 'loopback';
  const baseInvalid = !['postgres:', 'postgresql:'].includes(url.protocol)
    || decodeURIComponent(url.pathname.slice(1)) !== binding.databaseName
    || decodeURIComponent(url.username) !== profile.roles.migrator
    || url.hash;
  const connectionInvalid = connectionMode !== 'loopback' || binding.cloudSqlInstance !== undefined
    || url.hostname !== '127.0.0.1'
    || Number(url.port || '5432') !== binding.databasePort
    || url.search;
  if (baseInvalid || connectionInvalid) {
    throw new Error('Migrator URL is outside the owned runtime binding');
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (binding.profileSha256 !== sha256(profileBytes)
    || Object.keys(binding.migrationSha256 ?? {}).sort().join('|') !== [...expectedMigrationPaths].sort().join('|')) {
  throw new Error('Runtime binding does not match the source-controlled profile');
}
const migrations = profile.migrations.map(({ version, path }) => {
  const sql = readFileSync(resolve(path));
  const checksum = sha256(sql);
  if (binding.migrationSha256?.[path] !== checksum) throw new Error(`Migration binding mismatch: ${path}`);
  return { version, sql: sql.toString('utf8'), checksum };
});

let client;
try {
  if (managed) {
    const token = await fetchManagedJobToken();
    client = new Client({
      ...managedJobConnectionOptions(connectionString, migrationBinding, 'migrator', token),
      application_name: `projed-dev139-${profileContract.name}-migrator`,
    });
  } else {
    client = new Client({ connectionString, application_name: `projed-dev139-${profileContract.name}-migrator` });
  }
  await client.connect();
  if (managed) await prepareManagedDatabaseSession(client, migrationBinding, 'migrator');
  const identity = await client.query('SELECT current_database() AS database_name, current_user AS role_name');
  if (identity.rows[0]?.database_name !== binding.databaseName || identity.rows[0]?.role_name !== profile.roles.migrator) {
    throw new Error('Migrator identity mismatch');
  }
  await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', ['projed:migration:dev139']);
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${profile.roles.owner}`);
      const ledgerExists = await client.query("SELECT to_regclass('projed_core.schema_migrations') AS ledger");
      if (ledgerExists.rows[0]?.ledger) {
        const ledger = await client.query('SELECT version, checksum FROM projed_core.schema_migrations ORDER BY version');
        const preceding = ledger.rows.slice(0, index);
        if (preceding.length !== index || preceding.some((row, rowIndex) => row.version !== migrations[rowIndex].version || row.checksum !== migrations[rowIndex].checksum)) {
          throw new Error(`Migration ledger prefix mismatch before ${migration.version}`);
        }
        const existing = ledger.rows[index];
        if (existing) {
          if (existing.version !== migration.version || existing.checksum !== migration.checksum) {
            throw new Error(`Migration checksum mismatch: ${migration.version}`);
          }
          await client.query('ROLLBACK');
          continue;
        }
      } else if (index !== 0) {
        throw new Error('Migration ledger is missing');
      }
      await client.query(migration.sql);
      await client.query('INSERT INTO projed_core.schema_migrations(version, checksum) VALUES ($1, $2)', [migration.version, migration.checksum]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  let finalLedger;
  if (managed) {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${profile.roles.owner}`);
      finalLedger = await client.query('SELECT version, checksum FROM projed_core.schema_migrations ORDER BY version');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } else {
    await client.query(`SET ROLE ${profile.roles.owner}`);
    finalLedger = await client.query('SELECT version, checksum FROM projed_core.schema_migrations ORDER BY version');
    await client.query('RESET ROLE');
  }
  if (finalLedger.rows.length !== migrations.length
      || finalLedger.rows.some((row, index) => row.version !== migrations[index].version || row.checksum !== migrations[index].checksum)) {
    throw new Error('Final migration ledger mismatch');
  }
  console.log(JSON.stringify({ status: 'PASS', migrations: migrations.map(({ version, checksum }) => ({ version, checksum })) }));
} catch (error) {
  if (!managed) throw error;
  const code = typeof error === 'object' && error && 'code' in error
    && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code : 'MIGRATION_FAILED';
  console.error(JSON.stringify({ status: 'FAIL', code }));
  process.exitCode = 1;
} finally {
  if (client) {
    try {
      await client.end();
    } catch {
      console.error(JSON.stringify({ status: 'FAIL', code: 'MIGRATION_CLIENT_CLEANUP_FAILED' }));
      process.exitCode = 1;
    }
  }
}
