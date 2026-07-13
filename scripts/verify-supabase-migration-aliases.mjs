import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mappings = [
  {
    alias: 'supabase/migrations/20260526070442_remote_alias_calendar_subscriptions.sql',
    canonical: 'supabase/migrations/20260527064347_calendar_subscriptions.sql',
    canonicalMd5: '204a87ae9d322bb60187f20d4c5e6443',
    evidence: 'a7bb516f3a35ddacbd38a8db2541bba7',
  },
  {
    alias: 'supabase/migrations/20260527102701_remote_alias_workspace_tags.sql',
    canonical: 'supabase/migrations/20260527064316_workspace_tags.sql',
    canonicalMd5: 'eff50baf4f2f9a6a2f3d4456360b3427',
    evidence: 'eff50baf4f2f9a6a2f3d4456360b3427',
  },
  {
    alias: 'supabase/migrations/20260527102808_remote_alias_board_level_collaboration_rls.sql',
    canonical: 'supabase/migrations/20260528092643_board_level_collaboration_rls.sql',
    canonicalMd5: '346f7b776c39071f91ee89aed07c9df0',
    evidence: '346f7b776c39071f91ee89aed07c9df0',
  },
  {
    alias: 'supabase/migrations/20260527102841_remote_alias_activity_audit_logging.sql',
    canonical: 'supabase/migrations/20260528092711_activity_audit_logging.sql',
    canonicalMd5: '3a95af2b80eecfd95851afdb3d853071',
    evidence: '8c2bc64109ae530968d08637ce1ffc77',
  },
  {
    alias: 'supabase/migrations/20260529091003_calendar_subscription_selected_assignees.sql',
    canonical: 'supabase/migrations/20260529123000_calendar_subscription_selected_assignees.sql',
    canonicalMd5: '9ce844ef23ddf53b8c30f5323753996d',
    evidence: '72C600494D3D1EA194F5DAEBF1A935B9793B7FB2B6535AC2CE533FC1E63F3F07',
  },
  {
    alias: 'supabase/migrations/20260530064014_backfill_board_workspace_admin_members.sql',
    canonical: 'supabase/migrations/20260530070000_backfill_board_workspace_admin_members.sql',
    canonicalMd5: '154cc5e4eaf1ebd6e196b094bb161217',
    evidence: '90FDBB9FA943AFE3E6C97CDABA195F9A810E24D68D55EA308AEC6A9F38645BE6',
  },
  {
    alias: 'supabase/migrations/20260603093328_board_role_permissions.sql',
    canonical: 'supabase/migrations/20260603090000_board_role_permissions.sql',
    canonicalMd5: 'd16aba34a6c018d0e35c0a41fd661fbe',
    evidence: '05A00FBD3A8EB2A907347CADFCAB6E7D016C260FDF2B72FA077334644797F5BC',
  },
  {
    alias: 'supabase/migrations/20260610053318_meeting_work_records.sql',
    canonical: 'supabase/migrations/20260604100000_meeting_work_records.sql',
    canonicalMd5: 'bc37bb54ab20335a7e57a17a45341bef',
    evidence: 'E1B1B599E23D2020B28122C6A573B88C611A41A8D380693B2129786BC4C3FC4B',
  },
  {
    alias: 'supabase/migrations/20260610053351_record_rag_visibility_guard.sql',
    canonical: 'supabase/migrations/20260604103000_record_rag_visibility_guard.sql',
    canonicalMd5: 'd73fbe5203edef94b5fb4561e6aa3f8c',
    evidence: '18CF7CCD58FEBC7D6EC8A9735E628C8C721EDF46163B79279C71C08A4BB036B6',
  },
  {
    alias: 'supabase/migrations/20260610053408_record_rag_sync_jobs.sql',
    canonical: 'supabase/migrations/20260604104000_record_rag_sync_jobs.sql',
    canonicalMd5: 'c80bb88cf26cfaa46bdb270cc9c75df3',
    evidence: 'DD03D1E31CDF6C7C126FFFADEE071794C24CAF55EB768568D39B664352FB94E7',
  },
  {
    alias: 'supabase/migrations/20260618093025_controlled_project_workspace_transfer.sql',
    canonical: 'supabase/migrations/20260618120000_controlled_project_workspace_transfer.sql',
    canonicalMd5: 'b45391ae54449ac6ca2c785addb1b055',
    evidence: '8738F937ED50546FE8A76A4EDABD6C22336780E20B071EA0036371E15349A720',
  },
];

const productionSources = [
  ['supabase/migrations/20260630060610_cloud_quick_memo_inbox_items.sql', '0E2115398A511DC5E8FC5DE543BDDF0D937BBDF6F22FE404A35DB9CC549A48FF'],
  ['supabase/migrations/20260630060727_harden_quick_memo_inbox_items_privileges.sql', 'C6D0BC07140B27008C2EA433323A4BCE247D2696A4DFC314BE4D5B0218985EFD'],
  ['supabase/migrations/20260701005406_dev_040_personal_task_zone.sql', '19E6DBE7D64CCD86D832C74CF3217F0D629FF2E24F25B5027DABCB1AF2AF39AD'],
  ['supabase/migrations/20260701010144_fix_dev_040_personal_task_zone_conflict.sql', '2C692D00D244425B8A99245FD9EE1135C6D8BB96AE93CF18FF5E575330D30733'],
  ['supabase/migrations/20260702094146_dev_042_workbench_staging.sql', 'C434A993DB477B48330CFAC49A51084E2E1C5C12243F6C3BDD6DE7188FC94EB7'],
];

const normalize = (value) => value.replace(/\r\n?/g, '\n').trim();
const md5 = (value) => createHash('md5').update(normalize(value)).digest('hex');
const sha256 = (value) => createHash('sha256').update(value).digest('hex').toUpperCase();
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const mapping of mappings) {
  const aliasPath = resolve(mapping.alias);
  const canonicalPath = resolve(mapping.canonical);
  assert(`alias exists:${mapping.alias}`, existsSync(aliasPath));
  assert(`canonical exists:${mapping.canonical}`, existsSync(canonicalPath));
  if (!existsSync(aliasPath) || !existsSync(canonicalPath)) continue;

  const alias = readFileSync(aliasPath, 'utf8');
  const executableLines = alias
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('--'));
  assert(`alias is comment-only:${mapping.alias}`, executableLines.length === 0, executableLines);
  assert(
    `alias records remote evidence:${mapping.alias}`,
    alias.includes(mapping.canonical.split('/').at(-1)) && alias.includes(mapping.evidence),
  );
  assert(
    `canonical hash is stable:${mapping.canonical}`,
    md5(readFileSync(canonicalPath, 'utf8')) === mapping.canonicalMd5,
  );
}

for (const [path, expectedSha256] of productionSources) {
  const sourcePath = resolve(path);
  assert(`production source exists:${path}`, existsSync(sourcePath));
  if (!existsSync(sourcePath)) continue;
  assert(
    `production source hash is stable:${path}`,
    sha256(readFileSync(sourcePath)) === expectedSha256,
  );
}

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length > 0) process.exit(1);
