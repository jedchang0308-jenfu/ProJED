import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  sidebar: 'src/components/Sidebar.tsx',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  mainLayout: 'src/components/MainLayout.tsx',
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
  'Sidebar has a mobile/narrow viewport branch',
  source.sidebar.includes("(max-width: 767px), (hover: none) and (pointer: coarse)") &&
    source.sidebar.includes('isNarrowViewport') &&
    source.sidebar.includes('data-mobile-sidebar-overlay={isNarrowViewport ?'),
);

assert(
  'mobile collapsed Sidebar is removed from layout flow',
  source.sidebar.includes('if (!isSidebarOpen)') &&
    source.sidebar.includes('return null;') &&
    !source.sidebar.includes("'w-10'") &&
    !source.sidebar.includes('data-sidebar-panel={isSidebarOpen ?'),
);

assert(
  'Sidebar opens as mobile overlay and desktop inline panel',
  source.sidebar.includes("data-sidebar-overlay={isNarrowViewport ? 'true' : undefined}") &&
    source.sidebar.includes("data-sidebar-inline={!isNarrowViewport ? 'true' : undefined}") &&
    source.sidebar.includes('{isNarrowViewport ? (') &&
    source.sidebar.includes('data-sidebar-backdrop="true"') &&
    source.sidebar.includes('data-mobile-sidebar-overlay') &&
    source.sidebar.includes('data-mobile-sidebar-backdrop') &&
    source.sidebar.includes("setSidebarOpen(false)") &&
    source.sidebar.includes("event.key !== 'Escape'"),
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
  'TaskWorkbenchPanel closed state returns no in-flow rail on mobile and desktop',
    source.taskWorkbench.includes('const isExpanded = isNarrowViewport ? mobileOverlayOpen : panelPrefs.open;') &&
    source.taskWorkbench.includes('if (!isExpanded)') &&
    source.taskWorkbench.includes('return null;') &&
    source.taskWorkbench.includes("data-task-workbench-overlay={isNarrowViewport ? 'true' : undefined}") &&
    source.taskWorkbench.includes("data-task-workbench-inline={!isNarrowViewport ? 'true' : undefined}") &&
    source.taskWorkbench.includes('{isNarrowViewport ? (') &&
    source.taskWorkbench.includes('data-task-workbench-backdrop="true"') &&
    source.taskWorkbench.includes('data-mobile-task-workbench-overlay') &&
    !source.taskWorkbench.includes('data-task-workbench-panel="collapsed"') &&
    !source.taskWorkbench.includes('data-task-workbench-collapsed-toggle') &&
    !source.taskWorkbench.includes('data-task-workbench-collapsed-count'),
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
  'desktop Sidebar and TaskWorkbench can stay open side by side',
  source.sidebar.includes("'relative z-10 h-full shadow-none'") &&
    source.taskWorkbench.includes("'relative z-10 h-full shadow-none'") &&
    source.taskWorkbench.includes('style={{ width: panelOverlayWidth }}') &&
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
