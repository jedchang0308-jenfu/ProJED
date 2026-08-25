import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  sidebar: 'src/components/Sidebar.tsx',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  mainLayout: 'src/components/MainLayout.tsx',
  layoutPreferences: 'src/features/layout/preferences.ts',
  browserVerifier: 'scripts/verify-dev-042-mobile-left-sidebar-offcanvas-browser.pw.js',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-042-mobile-left-sidebar-offcanvas-collapse.md',
  qa: 'ai-doc/qa/QA-DEV-042-mobile-left-sidebar-offcanvas-collapse.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(Object.entries(files).map(([label, file]) => [label, read(file)]));

assert(
  'Sidebar keeps one responsive component for mobile-only close behavior',
  source.sidebar.includes("(max-width: 767px), (hover: none) and (pointer: coarse)") &&
    source.sidebar.includes('isNarrowViewport') &&
    source.sidebar.includes('if (isNarrowViewport) setSidebarOpen(false);'),
);

assert(
  'mobile collapsed Sidebar is removed from layout flow',
  source.sidebar.includes('if (!isSidebarOpen)') &&
    source.sidebar.includes('return null;') &&
    !source.sidebar.includes("'w-10'") &&
    !source.sidebar.includes('data-sidebar-panel={isSidebarOpen ?'),
);

assert(
  'Sidebar is inline on every viewport and never renders an overlay or backdrop',
  source.sidebar.includes('data-sidebar-inline="true"') &&
    source.sidebar.includes('relative z-10 h-full flex-shrink-0') &&
    !source.sidebar.includes('data-sidebar-overlay') &&
    !source.sidebar.includes('data-mobile-sidebar-overlay') &&
    !source.sidebar.includes('data-sidebar-backdrop') &&
    !source.sidebar.includes('data-mobile-sidebar-backdrop') &&
    !source.sidebar.includes('fixed bottom-0 left-0 top-10'),
);

assert(
  'desktop Sidebar closed state also removes in-flow rail',
  source.sidebar.includes('data-sidebar-panel="expanded"') &&
    source.sidebar.includes('data-sidebar-inline') &&
    !source.sidebar.includes('data-sidebar-panel="collapsed"') &&
    !source.sidebar.includes('ChevronRight') &&
    !source.sidebar.includes('data-sidebar-task-workbench-button="true"'),
);

assert(
  'TaskWorkbenchPanel uses the same inline panel state on mobile and desktop',
    source.taskWorkbench.includes('const isExpanded = panelPrefs.open;') &&
    source.taskWorkbench.includes('if (!isExpanded)') &&
    source.taskWorkbench.includes('return null;') &&
    source.taskWorkbench.includes('data-task-workbench-inline="true"') &&
    source.taskWorkbench.includes('relative z-20 flex h-full') &&
    !source.taskWorkbench.includes('mobileOverlayOpen') &&
    !source.taskWorkbench.includes('data-task-workbench-overlay') &&
    !source.taskWorkbench.includes('data-mobile-task-workbench-overlay') &&
    !source.taskWorkbench.includes('data-task-workbench-backdrop') &&
    !source.taskWorkbench.includes('data-mobile-task-workbench-backdrop') &&
    !source.taskWorkbench.includes('data-task-workbench-panel="collapsed"') &&
    !source.taskWorkbench.includes('data-task-workbench-collapsed-toggle') &&
    !source.taskWorkbench.includes('data-task-workbench-collapsed-count'),
);

assert(
  'TaskWorkbench shares the persisted open and width preferences across viewports',
  source.taskWorkbench.includes('const [panelPrefs, setPanelPrefs]') &&
    source.taskWorkbench.includes('readTaskWorkbenchPanelPrefs(accountId)') &&
    source.taskWorkbench.includes('const panelWidthStyle = getSharedInlinePanelWidthStyle(panelWidth);') &&
    !source.taskWorkbench.includes('MOBILE_TASK_WORKBENCH_WIDTH') &&
    !source.taskWorkbench.includes('MOBILE_TASK_WORKBENCH_VIEWPORT_GUTTER'),
);

assert(
  'mobile Sidebar and TaskWorkbench share the same inline width helper',
  source.layoutPreferences.includes('SHARED_INLINE_PANEL_VIEWPORT_GUTTER = 48;') &&
    source.layoutPreferences.includes('getSharedInlinePanelWidthStyle') &&
    source.sidebar.includes('readTaskWorkbenchPanelPrefs(accountId)') &&
    source.sidebar.includes('getSharedInlinePanelWidthStyle(mobileSharedPanelWidth)') &&
    source.taskWorkbench.includes('getSharedInlinePanelWidthStyle(panelWidth)'),
);

assert(
  'mobile and desktop reuse the same Sidebar and TaskWorkbench component instances',
  (source.mainLayout.match(/<Sidebar\s*\/>/g) || []).length === 1 &&
    !source.mainLayout.includes('MobileSidebar') &&
    !source.taskWorkbench.includes('MobileTaskWorkbench'),
);

assert(
  'desktop TaskWorkbench opens from top navigation without a collapsed rail',
  source.mainLayout.includes('data-mobile-task-workbench-nav-entry="true"') &&
    source.mainLayout.includes('toggleTaskWorkbenchPanel') &&
    source.mainLayout.includes('if (isMobileBoardOnly) setSidebarOpen(false);') &&
    !source.mainLayout.includes('sm:hidden"\n            title="開啟全域任務平台"') &&
    !source.taskWorkbench.includes('className="flex w-6 shrink-0'),
);

assert(
  'Sidebar and TaskWorkbench use inline flex positioning',
  source.sidebar.includes('relative z-10 h-full flex-shrink-0') &&
    source.taskWorkbench.includes('relative z-20 flex h-full') &&
    source.taskWorkbench.includes('style={{ width: panelWidthStyle }}') &&
    !source.taskWorkbench.includes('const panelBackdropLeft = shouldOffsetForDesktopSidebar') &&
    !source.taskWorkbench.includes('panelOverlayLeft') &&
    source.sidebar.includes('if (isNarrowViewport) setSidebarOpen(false);'),
);

assert(
  'MainLayout exposes accessible toggle and measurable main surface',
  source.mainLayout.includes('data-main-sidebar-toggle="true"') &&
    source.mainLayout.includes('data-mobile-task-workbench-nav-entry="true"') &&
    source.mainLayout.includes('toggleTaskWorkbenchPanel') &&
    source.taskWorkbench.includes('TOGGLE_PANEL_EVENT') &&
    source.mainLayout.includes('aria-label={isSidebarOpen ?') &&
    source.mainLayout.includes('data-app-main="true"'),
);

assert(
  'DEV-042 package scripts are registered',
  source.packageJson.includes('"verify:dev-042-mobile-left-sidebar-offcanvas"') &&
    source.packageJson.includes('"verify:dev-042-mobile-left-sidebar-offcanvas-browser"'),
);

assert(
  'DEV-042 docs capture deferred scope and all-phase coverage',
  source.spec.includes('Deferred Scope Audit') &&
    source.spec.includes('All-Phase Coverage Matrix') &&
    source.qa.includes('Zero-Tolerance Failures') &&
    source.qa.includes('All-Phase QA Coverage Matrix'),
);

assert(
  'DEV-042 docs capture the shared inline layout replacement',
  source.spec.includes('手機與桌機共用 Inline 元件增補') &&
    source.spec.includes('Intentional replacement') &&
    source.qa.includes('手機與桌機共用 inline 元件') &&
    source.qa.includes('不得存在 overlay 或 backdrop'),
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
