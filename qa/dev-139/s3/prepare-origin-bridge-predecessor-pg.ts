import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { loadRuntimeConfig, sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { verifyOriginMigrationBridgePostgres } from './verify-origin-migration-bridge-pg.js';

// Test setup only: build the real predecessor schema from its unchanged SQL,
// then exercise the new runtime before the normal runner applies 0053.
// Never shorten a populated ledger or connect to a managed database.
const config = loadRuntimeConfig();
assert.equal(config.env, 'disposable');
assert.match(config.binding.databaseName, /^dev139_s3_[a-f0-9]{32}$/u);
assert.equal(config.profile.migrations.length, 53);
assert.equal(config.profile.migrations[52]?.version, '0053_origin_switch_intents_v1');
const url = new URL(process.env.PROJED_MIGRATOR_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.protocol, 'postgresql:');
assert.equal(Number(url.port), config.binding.databasePort);
assert.equal(decodeURIComponent(url.pathname.slice(1)), config.binding.databaseName);
assert.equal(decodeURIComponent(url.username), 'projed_migrator_disposable');
assert.equal(url.search + url.hash, '');
const migrations = config.profile.migrations.slice(0, 52).map(({ version, path }) => {
  const sql = readFileSync(path);
  const checksum = sha256(sql);
  assert.equal(config.binding.migrationSha256[path], checksum);
  return { version, sql: sql.toString('utf8'), checksum };
});
const client = new pg.Client({ connectionString: url.href });
try {
  await client.connect();
  const identity = (await client.query<{ db: string; role: string }>(
    'SELECT current_database() AS db, current_user AS role')).rows[0];
  assert.equal(identity?.db, config.binding.databaseName);
  assert.equal(identity?.role, 'projed_migrator_disposable');
  assert.equal((await client.query("SELECT to_regclass('projed_core.schema_migrations') AS ledger")).rows[0]?.ledger, null,
    'Predecessor setup requires a fresh task-owned database');
  for (const migration of migrations) {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE projed_owner_disposable');
      await client.query(migration.sql);
      await client.query('INSERT INTO projed_core.schema_migrations(version, checksum) VALUES ($1, $2)',
        [migration.version, migration.checksum]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { await client.end(); }
const database = new RuntimeDatabase(config);
try {
  await verifyOriginMigrationBridgePostgres(database, config, 52);
  console.log(JSON.stringify({ checks: ['real-predecessor-52-origin-migration-bridge'], status: 'PASS' }));
} finally { await database.end(); }
