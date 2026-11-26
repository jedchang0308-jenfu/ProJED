import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sha256, type RuntimeConfig, type SourceProfile } from '../../../server/config.js';
import { RuntimeDatabase, type DatabaseLease, type ExpectedMigration } from '../../../server/db.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { acceptedMigrationLedgers, migrationLedgerMatches, runtimeMigrationPolicy } from '../../../server/migrationCompatibility.js';

const profile = JSON.parse(readFileSync('config/dev-139/s3-read-disposable.profile.json', 'utf8')) as SourceProfile;
const expected = profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) }));
const config = {
  env: 'disposable', entry: 'main', databaseUrl: 'postgres://unused@127.0.0.1:1/unused', profile,
  binding: { databaseName: 'unused', runtimeRole: 'projed_runtime_disposable',
    migrationSha256: Object.fromEntries(profile.migrations.map(({ path }, index) => [path, expected[index]!.checksum])) },
} as RuntimeConfig;
const campaign = { campaign: 'fixture', routes: [] };
const clone = () => expected.map(value => ({ ...value }));

test('only disabled campaign permits the pinned full 52 or 53 snapshots; default remains strict', () => {
  const accepted = acceptedMigrationLedgers(expected, config, runtimeMigrationPolicy(null));
  assert.deepEqual(accepted.map(value => value.length), [53, 52]);
  assert.equal(migrationLedgerMatches(expected, accepted), true);
  assert.equal(migrationLedgerMatches(expected.slice(0, 52), accepted), true);
  for (const policy of [undefined, runtimeMigrationPolicy(campaign)] as const) {
    assert.equal(migrationLedgerMatches(expected.slice(0, 52), acceptedMigrationLedgers(expected, config, policy)), false);
    assert.equal(migrationLedgerMatches(expected, acceptedMigrationLedgers(expected, config, policy)), true);
  }
});

test('bridge rejects damaged, shorter, reordered and unknown-extra ledgers', () => {
  const accepted = acceptedMigrationLedgers(expected, config, 'origin-switch-disabled');
  const wrongChecksum = clone(); wrongChecksum[0]!.checksum = 'f'.repeat(64);
  const wrongLastChecksum = clone(); wrongLastChecksum[52]!.checksum = 'f'.repeat(64);
  const missingMiddle = clone(); missingMiddle.splice(20, 1);
  const reordered = clone(); [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
  for (const ledger of [wrongChecksum, wrongLastChecksum, missingMiddle, reordered, expected.slice(0, 51),
    [...expected, { version: '0054_unknown_v1', checksum: 'a'.repeat(64) }]]) {
    assert.equal(migrationLedgerMatches(ledger, accepted), false);
  }
});

test('compatibility cannot be generalized to another tail, future source or unbound checksums', () => {
  const otherTail = clone(); otherTail[52]!.version = '0053_other_v1';
  const unbound = clone(); unbound[0]!.checksum = 'f'.repeat(64);
  for (const source of [otherTail, unbound, expected.slice(0, 52),
    [...expected, { version: '0054_unknown_v1', checksum: 'a'.repeat(64) }]]) {
    assert.equal(acceptedMigrationLedgers(source, config, 'origin-switch-disabled').length, 1);
  }
  const accepted = acceptedMigrationLedgers(expected, config, 'origin-switch-disabled');
  assert.ok(Object.isFrozen(accepted) && Object.isFrozen(accepted[0]) && Object.isFrozen(accepted[0]![0]));
});

function fixture(ledger: readonly ExpectedMigration[], invalidIdentity = false) {
  const database = new RuntimeDatabase(config);
  const releases: boolean[] = [];
  Object.defineProperty(database, 'checkout', { value: async (): Promise<DatabaseLease> => ({
    client: { async query(sql: string, values: unknown[] = []) {
      if (sql.includes('jsonb_array_elements')) {
        const snapshots = JSON.parse(String(values[2])) as [string, string][][];
        const actual = ledger.map(item => [item.version, item.checksum]);
        return { rows: [{ ok: !invalidIdentity && snapshots.some(value => JSON.stringify(value) === JSON.stringify(actual)) }] };
      }
      if (sql.includes('pg_catalog.pg_roles')) return { rows: [{ database_name: 'unused',
        role_name: invalidIdentity ? 'wrong' : config.binding.runtimeRole, is_superuser: false, bypass_rls: false }] };
      if (sql.includes('runtime_metadata')) return { rows: [{ app_key: 'projed', kernel_contract_version: 1, database_name: 'unused' }] };
      return { rows: ledger };
    } } as unknown as DatabaseLease['client'], release: (destroy = false) => { releases.push(destroy); },
  }) });
  return { database, releases };
}

test('startup and readiness use the same snapshots and retain identity rejection', async () => {
  for (const [ledger, invalidIdentity] of [[expected.slice(0, 52), false], [expected, false],
    [expected.slice(0, 51), false], [expected, true]] as const) {
    const { database, releases } = fixture(ledger, invalidIdentity);
    try {
      for (const policy of ['strict', 'origin-switch-disabled'] as const) {
        const valid = !invalidIdentity && (ledger.length === 53 || policy === 'origin-switch-disabled' && ledger.length === 52);
        if (valid) await database.assertRuntimeBoundary(expected, policy);
        else await assert.rejects(database.assertRuntimeBoundary(expected, policy), { code: 'DB_BOUNDARY_INVALID' });
        assert.equal(await database.readiness(expected, policy), valid);
      }
      assert.equal(releases.length, 4);
    } finally { await database.end(); }
  }
});

test('HTTP readiness remains strict while the origin-switch campaign is enabled', async () => {
  for (const originSwitchCampaign of [null, campaign]) {
    const { database } = fixture(expected.slice(0, 52));
    const http = createKernelHttpServer({ ...config, host: '127.0.0.1', port: 0 }, database, expected, { originSwitchCampaign });
    try {
      const address = await http.listen();
      const response = await fetch(`http://${address.host}:${address.port}/health/ready`);
      assert.equal(response.status, originSwitchCampaign ? 503 : 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    } finally { await http.shutdown(); }
  }
});
