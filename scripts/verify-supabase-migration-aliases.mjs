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
];

const normalize = (value) => value.replace(/\r\n?/g, '\n').trim();
const md5 = (value) => createHash('md5').update(normalize(value)).digest('hex');
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

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length > 0) process.exit(1);
