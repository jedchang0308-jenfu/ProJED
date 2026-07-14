import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  settingsView: 'src/components/SettingsView.tsx',
  backupSettings: 'src/components/BackupSettings.tsx',
  recycleBinView: 'src/components/RecycleBinView.tsx',
  boardMembersPanel: 'src/components/BoardMembersPanel.tsx',
  appInstallAssistant: 'src/components/AppInstallAssistant.tsx',
  packageJson: 'package.json',
  browserVerifier: 'scripts/verify-dev-038-settings-scope-consistency-browser.pw.js',
  spec: 'ai-doc/specs/SPEC-038-settings-scope-consistency-and-risk-guardrails.md',
  qa: 'ai-doc/qa/QA-DEV-038-settings-scope-consistency-and-risk-guardrails.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

assert(
  'Settings header uses neutral settings-center framing',
  source.settingsView.includes('<h2 className="text-2xl font-bold text-slate-900">設定中心</h2>') &&
    source.settingsView.includes('看板、資料、外部連結與裝置設定') &&
    source.settingsView.includes('flex min-w-0 items-center gap-3') &&
    !source.settingsView.includes('系統設定與管理') &&
    !source.settingsView.includes('目前看板：{activeMeta}'),
);

assert(
  'Settings tabs keep distinct labels in a compact description-free toolbar',
  source.settingsView.includes("label: '備份、還原與資料移轉'") &&
    source.settingsView.includes("label: '看板權限'") &&
    source.settingsView.includes("label: '行事曆訂閱'") &&
    source.settingsView.includes("label: '快速開啟'") &&
    source.settingsView.includes('grid grid-cols-2 gap-2 sm:grid-cols-4') &&
    source.settingsView.includes('flex min-h-11 min-w-0 items-center gap-2') &&
    !source.settingsView.includes('section.description') &&
    !source.settingsView.includes('建立可供外部行事曆讀取的任務訂閱連結。'),
);

assert(
  'Backup settings uses one board-scoped round-trip package for export and import',
  source.settingsView.includes("import BackupSettings from './BackupSettings'") &&
    source.backupSettings.includes('data-backup-export-panel="true"') &&
    source.backupSettings.includes('建立看板備份') &&
    source.backupSettings.includes('data-backup-import-panel="true"') &&
    source.backupSettings.includes('匯入或還原') &&
    source.backupSettings.includes('每份檔案只對應一張看板') &&
    source.backupSettings.includes('data-backup-source-board-select="true"') &&
    !source.backupSettings.includes('匯出全域快照'),
);

assert(
  'Import is inspect-first and plans impact before transactional execution',
  source.backupSettings.includes('backupApplicationService.inspectFile(file)') &&
    source.backupSettings.includes('backupApplicationService.planImport') &&
    source.backupSettings.includes('data-backup-inspection-ready="true"') &&
    source.backupSettings.includes('data-backup-plan-ready="true"') &&
    source.backupSettings.includes('preparePreReplacementPackage') &&
    source.backupSettings.includes('data-backup-replace-confirmation="true"') &&
    !source.backupSettings.includes('.importData('),
);

assert(
  'Recycle bin is explicitly scoped to current board and confirm includes count',
  source.recycleBinView.includes('data-recycle-bin-view="current-board"') &&
    source.recycleBinView.includes('目前看板回收桶') &&
    source.recycleBinView.includes('目標：{targetLabel}') &&
    source.recycleBinView.includes('目前看板沒有已刪除任務。') &&
    source.recycleBinView.includes('archivedItems.length') &&
    source.recycleBinView.includes('將永久刪除 ${archivedItems.length} 筆已刪除任務'),
);

assert(
  'Board permissions panel uses current-board scope summary',
  source.boardMembersPanel.includes('看板權限') &&
    source.boardMembersPanel.includes('設定範圍：目前看板') &&
    source.boardMembersPanel.includes("目標：{activeWorkspace?.title || '未選擇工作區'} / {activeBoard?.title || '未選擇看板'}") &&
    !source.boardMembersPanel.includes('看板權限設定'),
);

assert(
  'Calendar and quick-open settings expose external-link and device/account scopes',
  source.settingsView.includes('data-calendar-settings-scope="external-link"') &&
    source.settingsView.includes('設定範圍') &&
    source.settingsView.includes('外部連結') &&
    source.appInstallAssistant.includes('data-pwa-install-scope="device-account"') &&
    source.appInstallAssistant.includes('設定範圍：此裝置 / 目前帳號'),
);

assert(
  'Package scripts expose DEV-038 static and browser gates',
  source.packageJson.includes('"verify:dev-038-settings-scope-consistency"') &&
    source.packageJson.includes('"verify:dev-038-settings-scope-consistency-browser"'),
);

assert(
  'DEV-038 governance docs are present',
  source.spec.includes('設定中心作用範圍一致性與高風險防呆') &&
    source.qa.includes('QA-DEV-038') &&
    source.devTask.includes('DEV-038: 設定中心作用範圍一致性與高風險防呆') &&
    source.documentationMap.includes('DEV-038: 設定中心作用範圍一致性與高風險防呆'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
