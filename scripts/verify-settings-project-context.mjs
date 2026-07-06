import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sidebar = readFileSync(join(root, 'src/components/Sidebar.tsx'), 'utf8');
const packageJson = readFileSync(join(root, 'package.json'), 'utf8');

const checks = [
  {
    name: 'Sidebar treats settings and calendar subscriptions as settings scope views',
    pass:
      sidebar.includes("const SETTINGS_SCOPE_VIEWS = ['settings', 'calendar_subscriptions'];") &&
      sidebar.includes('const isSettingsScopeView = SETTINGS_SCOPE_VIEWS.includes(currentView);'),
  },
  {
    name: 'Sidebar keeps active project available as clickable settings context',
    pass:
      sidebar.includes('data-sidebar-current-settings-project={isSettingsScopeView && isCurrentBoard') &&
      sidebar.includes("const boardItemTitle = isSettingsScopeView && isCurrentBoard") &&
      sidebar.includes("'點擊回到看板'"),
  },
  {
    name: 'Sidebar allows project switching while settings scope is open',
    pass:
      !sidebar.includes('const isBoardSwitchLocked = isSettingsScopeView;') &&
      !sidebar.includes('if (isBoardSwitchLocked) return;') &&
      !sidebar.includes('aria-disabled={isBoardSwitchLocked && !isCurrentBoard}') &&
      sidebar.includes('switchBoard(ws.id, board.id);'),
  },
  {
    name: 'Sidebar uses normal active board style in settings so the row remains discoverable',
    pass:
      sidebar.includes('isMainBoardActive') &&
      sidebar.includes('BOARD_WORKSPACE_VIEWS.includes(currentView) || isSettingsScopeView') &&
      !sidebar.includes('cursor-default border border-primary/20 bg-primary-light/40 text-primary shadow-sm') &&
      !sidebar.includes('設定中'),
  },
  {
    name: 'Settings entry remains active for settings scope views',
    pass:
      sidebar.includes('className={`flex w-full items-center gap-3 rounded-lg') &&
      sidebar.includes('isSettingsScopeView') &&
      sidebar.includes("isSettingsScopeView ? 'text-white/90' : 'text-slate-400'"),
  },
  {
    name: 'package.json exposes settings project context verifier',
    pass: packageJson.includes(
      '"verify:settings-project-context": "node scripts/verify-settings-project-context.mjs"',
    ),
  },
];

const failures = checks.filter((check) => !check.pass);

if (failures.length > 0) {
  console.error('Settings project context verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log(`Settings project context verification passed (${checks.length} checks).`);
