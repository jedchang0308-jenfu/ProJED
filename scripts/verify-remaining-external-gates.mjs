import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFileSync(join(root, path), 'utf8');

const paths = {
  packageJson: 'package.json',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
  dev011012Readiness: 'scripts/verify-dev-011-012-production-ui-smoke-readiness.mjs',
  dev011012Executor: 'scripts/verify-dev-011-012-production-ui-smoke.mjs',
  dev025ExecutionReadiness: 'scripts/verify-dev-025-mutating-qc-readiness.mjs',
  dev025FixtureReadiness: 'scripts/verify-dev-025-mutating-qc-fixture-readiness.mjs',
  dev025MutatingExecutor: 'scripts/verify-dev-025-mutating-qc-execution.mjs',
  dev028ManualReadiness: 'scripts/verify-dev-028-manual-click-qc-readiness.mjs',
  dev040RemoteReadiness: 'scripts/verify-dev-040-p0-remote-readiness.mjs',
  dev045RemoteReadiness: 'scripts/verify-dev-045-calendar-subscription-remote-readiness.mjs',
  dev045LocalDbSmoke: 'scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs',
  dev045ReleaseEvidence: 'ai-doc/release/PREPRODUCTION-DEV-045-20260713.md',
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
  'verify:dev-011-012-production-ui-smoke':
    'node scripts/verify-dev-011-012-production-ui-smoke.mjs',
  'verify:dev-025-mutating-qc-readiness':
    'node scripts/verify-dev-025-mutating-qc-readiness.mjs',
  'verify:dev-025-mutating-qc-fixture-readiness':
    'node scripts/verify-dev-025-mutating-qc-fixture-readiness.mjs',
  'verify:dev-025-mutating-qc-execution':
    'node scripts/verify-dev-025-mutating-qc-execution.mjs',
  'verify:dev-028-manual-click-qc-readiness':
    'node scripts/verify-dev-028-manual-click-qc-readiness.mjs',
  'verify:dev-040-p0-remote-readiness':
    'node scripts/verify-dev-040-p0-remote-readiness.mjs',
  'verify:dev-044-undo-coverage': 'node scripts/verify-dev-044-undo-coverage.mjs',
  'verify:dev-045-calendar-subscription-remote-readiness':
    'node scripts/verify-dev-045-calendar-subscription-remote-readiness.mjs',
  'verify:dev-045-calendar-subscription-local-db-smoke':
    'node scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs',
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
  'DEV-045 v3 release is closed by production Level 4 and cleanup evidence',
  includesAll(existing.devTask ?? '', [
    'DEV-045 [交付點] [完成] [P1] [正式環境已交付 / Level 4通過]',
    'Production Released / 38-of-38 Migration Aligned / Edge v4 / Firebase Live / Level 4 Passed',
    'verify:dev-045-calendar-subscription-local-db-smoke',
  ]) && includesAll(existing.dev045ReleaseEvidence ?? '', [
    'Production Released / Level 4 Post-deploy Smoke Passed / Cleanup Complete',
    'Production execution evidence',
    'production residual count為0',
    'Rollback baseline and residual risk',
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
    'verify:dev-025-mutating-qc-execution',
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
  'DEV-028 manual click QC is closed by user report while production remains gated',
  includesAll(existing.devTask ?? '', [
    'User-Reported Manual Click QC Passed',
    '2026-07-09 使用者回報 DEV-028 人工親自點擊 QC 通過',
    'production release 需另行授權',
    '未附逐項截圖/錄影證據',
  ]),
);

add(
  'DEV-011/012 production UI smoke is closed by hotfix release and fixture evidence',
  includesAll(existing.devTask ?? '', [
    'Done / Production Release Deployed / Production UI Smoke Passed',
    'codex/dev011012-rag-order-hotfix',
    '7704e2f',
    'assets/index-BkwGqGCZ.js',
    'published_record_found=true',
    'record_task_links=2',
    'rag_enabled=true',
    'source_document_present=true',
    'verify:dev-011-012-production-ui-smoke-readiness',
    'verify:dev-011-012-production-ui-smoke',
    'DEV011012_ALLOW_PRODUCTION_FIXTURE=1',
  ]),
);

const nextStepRows = [
  'DEV-025 受控跨工作區移動專案 DB QC',
  'DEV-040 Phase 1 P0 production/Edge gate',
  'DEV-044 Phase 3 destructive recovery human re-entry',
].map(token => lineContaining(existing.devTask ?? '', token));

add(
  'remaining next-step rows preserve release or pending status for unresolved external gates',
  nextStepRows.every(row => {
    if (!row) return false;
    return /Pending|pending|gate|required|re-entry/i.test(row);
  }),
  nextStepRows,
);

add(
  'documentation map closes DEV-045 while preserving unresolved external-gate boundaries',
  includesAll(existing.documentationMap ?? '', [
    'verify:remaining-external-gates',
    'Production Released / Level 4 Passed / Cleanup Complete',
    'DEV-037 + DEV-045 Production Delivered',
    'guarded mutating executor',
    'Mutating QC Pending',
    'staging / disposable fixture',
    'DEV-044 durable/destructive recovery 仍需另行 gate',
  ]),
);

add(
  'dev_task records completed DEV-045 release and keeps the remaining-gates audit',
  includesAll(existing.devTask ?? '', [
    'verify:remaining-external-gates',
    'PM evidence',
    'DEV-045 舊 v2 remote gate 被產品方向修訂凍結',
    'v3 contract',
    '正式環境已交付 / Level 4通過',
    'fixture residual為0',
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
