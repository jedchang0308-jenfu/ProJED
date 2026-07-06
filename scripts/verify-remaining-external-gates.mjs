import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFileSync(join(root, path), 'utf8');

const paths = {
  packageJson: 'package.json',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
  dev011012Readiness: 'scripts/verify-dev-011-012-production-ui-smoke-readiness.mjs',
  dev025ExecutionReadiness: 'scripts/verify-dev-025-mutating-qc-readiness.mjs',
  dev025FixtureReadiness: 'scripts/verify-dev-025-mutating-qc-fixture-readiness.mjs',
  dev028ManualReadiness: 'scripts/verify-dev-028-manual-click-qc-readiness.mjs',
  dev040RemoteReadiness: 'scripts/verify-dev-040-p0-remote-readiness.mjs',
  dev045RemoteReadiness: 'scripts/verify-dev-045-calendar-subscription-remote-readiness.mjs',
};

const checks = [];
const add = (name, pass, details = undefined) => checks.push({ name, pass, details });
const includesAll = (text, tokens) => tokens.every(token => text.includes(token));
const lineContaining = (text, token) => text.split(/\r?\n/).find(line => line.includes(token)) ?? '';

for (const [label, path] of Object.entries(paths)) {
  add(`file exists:${label}`, existsSync(join(root, path)), path);
}

const existing = Object.fromEntries(
  Object.entries(paths)
    .filter(([, path]) => existsSync(join(root, path)))
    .map(([label, path]) => [label, read(path)]),
);

let packageJson = {};
try {
  packageJson = JSON.parse(existing.packageJson ?? '{}');
} catch (error) {
  add('package.json parses as JSON', false, error.message);
}

const packageScripts = packageJson.scripts ?? {};
const requiredScripts = {
  'verify:remaining-external-gates': 'node scripts/verify-remaining-external-gates.mjs',
  'verify:dev-011-012-production-ui-smoke-readiness':
    'node scripts/verify-dev-011-012-production-ui-smoke-readiness.mjs',
  'verify:dev-025-mutating-qc-readiness':
    'node scripts/verify-dev-025-mutating-qc-readiness.mjs',
  'verify:dev-025-mutating-qc-fixture-readiness':
    'node scripts/verify-dev-025-mutating-qc-fixture-readiness.mjs',
  'verify:dev-028-manual-click-qc-readiness':
    'node scripts/verify-dev-028-manual-click-qc-readiness.mjs',
  'verify:dev-040-p0-remote-readiness':
    'node scripts/verify-dev-040-p0-remote-readiness.mjs',
  'verify:dev-044-undo-coverage': 'node scripts/verify-dev-044-undo-coverage.mjs',
  'verify:dev-045-calendar-subscription-remote-readiness':
    'node scripts/verify-dev-045-calendar-subscription-remote-readiness.mjs',
};

for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
  add(
    `package exposes ${scriptName}`,
    packageScripts[scriptName] === expectedCommand,
    packageScripts[scriptName],
  );
}

const readinessCommands = Object.entries(requiredScripts)
  .map(([scriptName]) => `${scriptName}: ${packageScripts[scriptName] ?? ''}`)
  .join('\n');

add(
  'remaining external gates audit and readiness scripts do not directly deploy or mutate remote state',
  !/(supabase\s+(db\s+(push|reset)|migration\s+up|functions\s+deploy)|firebase\s+deploy|psql\s|move_project_to_workspace|playwright-cli)/i.test(readinessCommands),
  readinessCommands,
);

add(
  'DEV-045 Phase 3 remains release-gated, not marked complete',
  includesAll(existing.devTask ?? '', [
    'DEV-045 Phase 3 remote Supabase / Edge / live `.ics` gate',
    'Release-Gate Blocked by Missing Level 3',
    'Level 3 smoke path or explicit risk acceptance',
    'Supabase branch path 需 cost confirmation',
    'production 仍缺 DEV-037/045 migrations',
    'calendar-feed` version 3 未含 v2 matcher',
  ]),
);

add(
  'DEV-025 mutating DB QC remains fixture-gated',
  includesAll(existing.devTask ?? '', [
    'DEV-025 受控跨工作區移動專案 DB QC',
    'Fixture + Execution Readiness Gates Added',
    'Mutating QC Pending',
    'verify:dev-025-mutating-qc-readiness',
    'verify:dev-025-mutating-qc-fixture-readiness',
    'preview_project_workspace_transfer',
    'move_project_to_workspace',
    'RAG visibility',
  ]),
);

add(
  'DEV-040 remote Edge and production injection remain pending',
  includesAll(existing.devTask ?? '', [
    'DEV-040 Phase 1 P0 production/Edge gate',
    'Remote Read-only Preflight + Remote Readiness Static Gate Passed',
    'Edge Deploy Pending',
    'Production Injection Not Executed',
    'remote Edge 尚未部署 timeout guard',
    'production timeout injection',
  ]),
);

add(
  'DEV-044 destructive recovery remains human re-entry, outside the released safe slice',
  includesAll(existing.devTask ?? '', [
    'DEV-044 Phase 3 destructive recovery human re-entry',
    'Human Re-entry for destructive recovery',
    'DB/cross-device/destructive recovery',
    'board workspace transfer undo',
    'durable recovery、DB migration、board workspace transfer undo、destructive recovery 需另行授權',
  ]),
);

add(
  'DEV-028 still requires manual click QC and rejects automated replacement',
  includesAll(existing.devTask ?? '', [
    'DEV-028 人工親自點擊 QC',
    'Manual Click QC Readiness Gate Added',
    'Manual Click QC Pending',
    'MAN-028-001 至 MAN-028-028',
    '不得以 automated browser smoke 取代人工親自點擊 QC',
  ]),
);

add(
  'DEV-011/012 production UI smoke remains login-or-fixture gated',
  includesAll(existing.devTask ?? '', [
    'DEV-011 / DEV-012 production UI smoke',
    'Human Login or Explicit Fixture Gate Required',
    'verify:dev-011-012-production-ui-smoke-readiness',
    '已登入 Google 的正式前端',
    'production 臨時 fixture 建立/清理',
  ]),
);

const nextStepRows = [
  'DEV-045 Phase 3 remote Supabase / Edge / live `.ics` gate',
  'DEV-025 受控跨工作區移動專案 DB QC',
  'DEV-040 Phase 1 P0 production/Edge gate',
  'DEV-044 Phase 3 destructive recovery human re-entry',
  'DEV-028 人工親自點擊 QC',
  'DEV-011 / DEV-012 production UI smoke',
].map(token => lineContaining(existing.devTask ?? '', token));

add(
  'remaining next-step rows avoid closing unresolved external gates as Done or Complete',
  nextStepRows.every(row => row && !/\|\s*(Done|Complete|Completed)\s*(\/|\|)/i.test(row)),
  nextStepRows,
);

add(
  'documentation map preserves the same external-gate boundary',
  includesAll(existing.documentationMap ?? '', [
    'verify:remaining-external-gates',
    'Supabase DB / Edge deploy gate',
    '已登入正式前端 UI smoke',
    'DEV-028 人工親自點擊 QC',
    'mutating role-data QC 仍需安全 fixture',
    'remote Edge 仍未部署 timeout guard',
    'DEV-044 durable/destructive recovery 仍需另行 gate',
    'remote apply/deploy/live smoke 需 Level 3 path 或 explicit risk acceptance',
  ]),
);

add(
  'dev_task records this audit as PM evidence without changing product completion status',
  includesAll(existing.devTask ?? '', [
    'verify:remaining-external-gates',
    'PM evidence',
    'mutates_database=false',
    'remote_changes=false',
    '不代表任一外部 Gate 完成',
  ]),
);

const failures = checks.filter(check => !check.pass);
const payload = {
  ok: failures.length === 0,
  mutates_database: false,
  remote_changes: false,
  summary: {
    pass: checks.length - failures.length,
    fail: failures.length,
  },
  checks,
};

console.log(JSON.stringify(payload, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
