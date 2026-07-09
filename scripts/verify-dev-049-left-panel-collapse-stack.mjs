import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  mainLayout: 'src/components/MainLayout.tsx',
  sidebar: 'src/components/Sidebar.tsx',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  taskWorkbenchCommands: 'src/components/taskWorkbenchPanelCommands.ts',
  stack: 'src/utils/leftPanelEscapeStack.ts',
  browser: 'scripts/verify-dev-049-left-panel-collapse-stack-browser.pw.js',
};

const read = (file) => readFileSync(resolve(file), 'utf8');
const source = {};
const results = [];
const assert = (name, ok, details) => results.push({ name, ok, details });

for (const [name, file] of Object.entries(files)) {
  const exists = existsSync(resolve(file));
  assert(`file exists:${name}`, exists, file);
  if (exists) source[name] = read(file);
}

assert(
  'workspace sidebar has the same header/collapse affordance pattern',
  source.sidebar?.includes('data-sidebar-control-area="true"') &&
    source.sidebar.includes('data-sidebar-title="true"') &&
    source.sidebar.includes('data-sidebar-collapse-toggle="true"') &&
    source.sidebar.includes('工作區與看板') &&
    source.sidebar.includes('<ChevronLeft size={16} />'),
);

assert(
  'workspace sidebar participates in the left-panel escape stack',
  source.sidebar?.includes("markLeftPanelOpened('workspace-sidebar')") &&
    source.sidebar.includes("markLeftPanelClosed('workspace-sidebar')") &&
    !source.sidebar.includes("window.addEventListener('keydown', handleKeyDown, { capture: true });"),
);

assert(
  'task workbench exposes a close command and participates in the stack',
  source.taskWorkbenchCommands?.includes('CLOSE_PANEL_EVENT') &&
    source.taskWorkbenchCommands.includes('closeTaskWorkbenchPanel') &&
    source.taskWorkbench?.includes('CLOSE_PANEL_EVENT') &&
    source.taskWorkbench.includes("markLeftPanelOpened('task-workbench')") &&
    source.taskWorkbench.includes("markLeftPanelClosed('task-workbench')"),
);

assert(
  'MainLayout closes the most recently opened left panel before system-page Escape handling',
  source.mainLayout?.includes('getTopOpenLeftPanel') &&
    source.mainLayout.includes('closeTaskWorkbenchPanel') &&
    source.mainLayout.indexOf('const topLeftPanel =') < source.mainLayout.indexOf("if (event.key === 'Escape' && isSystemPageView)") &&
    source.mainLayout.includes("topLeftPanel === 'task-workbench'") &&
    source.mainLayout.includes('setSidebarOpen(false);'),
);

assert(
  'left panel stack implements last-opened-first-closed order',
  source.stack?.includes('const leftPanelStack: LeftPanelId[] = [];') &&
    source.stack.includes('removePanel(panelId);') &&
    source.stack.includes('leftPanelStack.push(panelId);') &&
    source.stack.includes('leftPanelStack[leftPanelStack.length - 1] ?? null'),
);

const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
