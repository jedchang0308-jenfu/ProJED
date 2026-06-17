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
    name: 'Sidebar keeps active project visible as current settings context',
    pass:
      sidebar.includes('const isCurrentSettingsProject = isSettingsScopeView && isCurrentBoard;') &&
      sidebar.includes('data-sidebar-current-settings-project={isCurrentSettingsProject') &&
      sidebar.includes('{isCurrentSettingsProject ? (') &&
      sidebar.includes('border border-primary/20 bg-white'),
  },
  {
    name: 'Sidebar blocks project switching while settings scope is open',
    pass:
      sidebar.includes('const isBoardSwitchLocked = isSettingsScopeView;') &&
      sidebar.includes('if (isBoardSwitchLocked) return;') &&
      sidebar.includes('aria-disabled={isBoardSwitchLocked && !isCurrentBoard}'),
  },
  {
    name: 'Sidebar uses soft context highlight instead of main project active style in settings',
    pass:
      sidebar.includes('isMainBoardActive') &&
      sidebar.includes('isCurrentSettingsProject') &&
      sidebar.includes('cursor-default border border-primary/20 bg-primary-light/40 text-primary shadow-sm'),
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
