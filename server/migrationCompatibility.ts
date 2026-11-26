import type { RuntimeConfig } from './config.js';
import type { ExpectedMigration } from './db.js';
import type { OriginSwitchConfig } from './originSwitchConfig.js';

export type RuntimeMigrationPolicy = 'strict' | 'origin-switch-disabled';

/** Derived from the parsed feature configuration, never an environment bypass. */
export function runtimeMigrationPolicy(campaign: OriginSwitchConfig | null | undefined): RuntimeMigrationPolicy {
  return campaign == null ? 'origin-switch-disabled' : 'strict';
}

/** Temporary 0052 -> 0053 bridge. The source profile/binding still contains all
 * 53 migrations. Only the named, disabled feature's final migration may be
 * absent; both accepted ledgers are complete checksum-pinned snapshots.
 * Remove this exception once all supported runtimes require 0053. */
export function acceptedMigrationLedgers(
  expected: readonly ExpectedMigration[], config: RuntimeConfig, policy: RuntimeMigrationPolicy = 'strict',
): readonly (readonly ExpectedMigration[])[] {
  const full = Object.freeze(expected.map(item => Object.freeze({ ...item })));
  const profile = config.profile.migrations;
  const eligible = policy === 'origin-switch-disabled' && full.length === 53 && profile?.length === 53
    && full[51]?.version === '0052_orgmaster_user_directory_v1'
    && full[52]?.version === '0053_origin_switch_intents_v1'
    && full.every((item, index) => item.version.startsWith(`${String(index + 1).padStart(4, '0')}_`)
      && /^[a-f0-9]{64}$/u.test(item.checksum)
      && profile[index]?.version === item.version
      && profile[index]?.path === `db/migrations/${item.version}.sql`
      && config.binding.migrationSha256[profile[index]!.path] === item.checksum);
  return Object.freeze(eligible ? [full, Object.freeze(full.slice(0, 52))] : [full]);
}

export function migrationLedgerMatches(
  ledger: readonly ExpectedMigration[], accepted: readonly (readonly ExpectedMigration[])[],
): boolean {
  return accepted.some(expected => ledger.length === expected.length
    && expected.every((item, index) => ledger[index]?.version === item.version && ledger[index]?.checksum === item.checksum));
}
