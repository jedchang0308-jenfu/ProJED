import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFileSync(join(root, path), 'utf8');

const paths = {
  packageJson: 'package.json',
  crossModeVerifier: 'scripts/verify-dev-028-cross-mode-task-interactions.mjs',
  browserVerifier: 'scripts/verify-dev-028-cross-mode-task-interactions-browser.pw.js',
  qa: 'ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md',
  qc: 'ai-doc/qc/QC-DEV-028-detail-only-title-edit-addendum.md',
  documentationMap: 'ai-doc/documentation_map.md',
  devTask: 'ai-doc/dev_task.md',
};

const contents = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, read(path)]),
);
const packageJson = JSON.parse(contents.packageJson);
const packageScripts = packageJson.scripts ?? {};

const checks = [];
const add = (name, pass, details = undefined) => checks.push({ name, pass, details });
const includesAll = (text, tokens) => tokens.every(token => text.includes(token));

const expectedManualIds = Array.from({ length: 28 }, (_, index) =>
  `MAN-028-${String(index + 1).padStart(3, '0')}`,
);
const presentManualIds = [...contents.qa.matchAll(/MAN-028-\d{3}/g)].map(match => match[0]);
const uniqueManualIds = [...new Set(presentManualIds)];
const missingManualIds = expectedManualIds.filter(id => !uniqueManualIds.includes(id));
const unexpectedManualIds = uniqueManualIds.filter(id => !expectedManualIds.includes(id));

add(
  'package exposes DEV-028 manual click QC readiness gate',
  packageScripts['verify:dev-028-manual-click-qc-readiness'] ===
    'node scripts/verify-dev-028-manual-click-qc-readiness.mjs',
);

add(
  'QA manual matrix keeps exactly MAN-028-001 through MAN-028-028',
  missingManualIds.length === 0 && unexpectedManualIds.length === 0,
  { missingManualIds, unexpectedManualIds },
);

add(
  'QA manual click principle explicitly forbids replacing human QC with automation',
  includesAll(contents.qa, [
    'QA/QC 操作者親自點擊操作驗證',
    '自動化 Playwright browser smoke 只能作為輔助證據，不能取代人工點擊',
    '若自動化通過但人工點擊失敗，以人工點擊失敗為準',
  ]),
);

add(
  'QA matrix requires operator evidence fields and visible error sweep',
  includesAll(contents.qa, [
    '模式',
    'viewport',
    '操作步驟',
    '預期結果',
    '實際結果',
    '證據',
    '判定',
    'Visible error sweep',
    '1440x900',
    '1024x768',
    '390x844',
  ]),
);

add(
  'QA manual cases cover four modes, mobile, ESC, drag/resize, controls, and DEV-029 pan-first regression',
  includesAll(contents.qa, [
    '清單',
    '心智圖',
    '看板',
    '甘特',
    'Mobile',
    'ESC',
    '拖曳',
    'resize',
    'DEV-029',
    '短滑',
  ]),
);

add(
  'QC report records user-reported manual click pass without overclaiming production',
  includesAll(contents.qc, [
    'User-Reported Manual Click QC Passed',
    '2026-07-09 使用者回報人工親自點擊 QC 通過',
    '未附逐項截圖/錄影',
    'Production deploy 未執行',
  ]),
);

add(
  'DEV-028 automated browser verifier remains auxiliary evidence only',
  includesAll(contents.browserVerifier, [
    'data-task-details-modal',
    'data-task-details-title-input="true"',
    'context menu should not expose task rename',
    'mobile board task card should remain reachable in the viewport',
  ]) &&
    !contents.browserVerifier.includes('Manual Click QC Passed'),
);

add(
  'DEV-028 cross-mode static verifier tracks this manual gate and user-reported boundary',
  includesAll(contents.crossModeVerifier, [
    'verify-dev-028-manual-click-qc-readiness.mjs',
    'verify:dev-028-manual-click-qc-readiness',
    'Manual click QC gate is registered with user-reported pass and production boundary',
  ]),
);

add(
  'dev_task records user-reported manual click QC pass while keeping production gated',
  includesAll(contents.devTask, [
    'verify:dev-028-manual-click-qc-readiness',
    'Manual Click QC Readiness Gate Added',
    'User-Reported Manual Click QC Passed',
    '2026-07-09 使用者回報 DEV-028 人工親自點擊 QC 通過',
    'production release 需另行授權',
  ]),
);

add(
  'documentation map records user-reported pass and evidence boundary',
  includesAll(contents.documentationMap, [
    'DEV-028',
    'Manual Click QC Readiness Gate Added',
    'User-Reported Manual Click QC Passed',
    'MAN-028-001',
    '若需稽核級證據仍應補逐項截圖/錄影',
  ]),
);

const failures = checks.filter(check => !check.pass);
const payload = {
  ok: failures.length === 0,
  mutates_database: false,
  manual_qc_completed: failures.length === 0,
  evidence_source: 'user_report',
  formal_manual_evidence_attached: false,
  checks,
};

console.log(JSON.stringify(payload, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
