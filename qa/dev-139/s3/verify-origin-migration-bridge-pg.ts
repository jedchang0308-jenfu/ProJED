import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadRuntimeConfig, sha256, type RuntimeConfig } from '../../../server/config.js';
import { RuntimeDatabase, type ExpectedMigration } from '../../../server/db.js';
import { runtimeMigrationPolicy } from '../../../server/migrationCompatibility.js';

/** Read-only probe for actual predecessor/current disposable databases.
 * Never delete ledger rows to simulate an older schema. The setup runner must
 * call the 52 probe before applying 0053, then the 53 probe afterwards. */
export async function verifyOriginMigrationBridgePostgres(
  database: RuntimeDatabase, config: RuntimeConfig, expectedCount: 52 | 53 | 54,
): Promise<void> {
  assert.equal(config.env, 'disposable', 'Bridge probe must never run against managed data');
  const expected: ExpectedMigration[] = config.profile.migrations.map(({ version, path }) => ({
    version, checksum: sha256(readFileSync(path)),
  }));
  assert.ok(expected.length === 53 || expected.length === 54);
  const lease = await database.checkout();
  try {
    const ledger = await lease.client.query<ExpectedMigration>(
      'SELECT version, checksum FROM projed_core.schema_migrations ORDER BY version');
    assert.deepEqual(ledger.rows, expected.slice(0, expectedCount));
    const table = await lease.client.query<{ present: boolean }>(
      "SELECT to_regclass('projed_core.origin_switch_intents') IS NOT NULL AS present");
    assert.equal(table.rows[0]?.present, expectedCount >= 53, 'Probe requires the real schema, not a shortened ledger');
    const device = await lease.client.query<{ present: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='projed_core' AND table_name='app_sessions' AND column_name='session_version') AS present");
    assert.equal(device.rows[0]?.present, expectedCount >= 54);
  } finally { lease.release(); }
  const disabled = runtimeMigrationPolicy(null);
  const enabled = runtimeMigrationPolicy({ campaign: 'bridge-probe', routes: [] });
  if (expected.length === 54) {
    // The new Session SQL uses 0054 columns even when no user has opted in.
    // Reusing the old optional-origin bridge would conceal a startup failure.
    for (const policy of [undefined, disabled, enabled]) {
      if (expectedCount === 54) await database.assertRuntimeBoundary(expected, policy);
      else await assert.rejects(database.assertRuntimeBoundary(expected, policy), { code: 'DB_BOUNDARY_INVALID' });
      assert.equal(await database.readiness(expected, policy), expectedCount === 54);
    }
    return;
  }
  await database.assertRuntimeBoundary(expected, disabled);
  assert.equal(await database.readiness(expected, disabled), true);
  if (expectedCount === 52) {
    await assert.rejects(database.assertRuntimeBoundary(expected, enabled), { code: 'DB_BOUNDARY_INVALID' });
    assert.equal(await database.readiness(expected, enabled), false);
    await assert.rejects(database.assertRuntimeBoundary(expected), { code: 'DB_BOUNDARY_INVALID' });
  } else {
    await database.assertRuntimeBoundary(expected, enabled);
    assert.equal(await database.readiness(expected, enabled), true);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = process.argv[2];
  assert.ok(count === '52' || count === '53' || count === '54', 'Pass the actual expected schema count: 52, 53 or 54');
  const config = loadRuntimeConfig();
  const database = new RuntimeDatabase(config);
  try {
    await verifyOriginMigrationBridgePostgres(database, config, Number(count) as 52 | 53 | 54);
    console.log(JSON.stringify({ check: 'origin-migration-bridge', ledgerCount: Number(count), status: 'PASS' }));
  } finally { await database.end(); }
}
