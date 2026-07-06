import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mainLayout: 'src/components/MainLayout.tsx',
  sidebar: 'src/components/Sidebar.tsx',
  settingsView: 'src/components/SettingsView.tsx',
  recordsView: 'src/components/Records/RecordsView.tsx',
  browserVerifier: 'scripts/verify-dev-043-system-page-exit-browser.pw.js',
  packageJson: 'package.json',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(Object.entries(files).map(([label, file]) => [label, read(file)]));

assert(
  'Settings and Records expose the same content return affordance',
  source.settingsView.includes('data-system-page-return-button="true"') &&
    source.settingsView.includes('data-settings-return-button="true"') &&
    source.recordsView.includes('data-system-page-return-button="true"') &&
    source.recordsView.includes('data-records-return-button="true"') &&
    source.settingsView.includes('回到看板') &&
    source.recordsView.includes('回到看板'),
);

assert(
  'MainLayout applies Escape consistently to settings and records pages',
  source.mainLayout.includes("const isSystemPageView = isSettingsScopeView || currentView === 'records';") &&
    source.mainLayout.includes("event.key === 'Escape' && isSystemPageView") &&
    source.mainLayout.includes('returnToBoard();') &&
    !source.mainLayout.includes('離開設定'),
);

assert(
  'Sidebar active Settings and Records entries toggle back to board',
  source.sidebar.includes('const returnToBoard = React.useCallback') &&
    source.sidebar.includes('if (isRecordsView)') &&
    source.sidebar.includes('if (isSettingsScopeView)') &&
    source.sidebar.includes("title={isRecordsView ? '回到看板' : '紀錄庫'}") &&
    source.sidebar.includes("title={isSettingsScopeView ? '回到看板' : '設定'}") &&
    source.sidebar.includes('data-sidebar-settings-button="true"') &&
    source.sidebar.includes('data-sidebar-records-button="true"'),
);

assert(
  'Settings board rows remain clickable instead of locked or greyed out',
  !source.sidebar.includes('isBoardSwitchLocked') &&
    !source.sidebar.includes('cursor-not-allowed text-slate-300 opacity-70') &&
    !source.sidebar.includes('請先離開設定頁面再切換專案') &&
    !source.sidebar.includes('設定中') &&
    source.sidebar.includes("title={canEditBoardSettings ? '點擊開啟看板，右鍵開啟選單，F2 重新命名' : '點擊開啟看板'}"),
);

assert(
  'DEV-043 package scripts are registered',
  source.packageJson.includes('"verify:dev-043-system-page-exit"') &&
    source.packageJson.includes('"verify:dev-043-system-page-exit-browser"'),
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
