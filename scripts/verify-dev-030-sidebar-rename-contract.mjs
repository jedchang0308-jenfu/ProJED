import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  sidebar: 'src/components/Sidebar.tsx',
  globalContextMenu: 'src/components/GlobalContextMenu.tsx',
  browserVerifier: 'scripts/verify-dev-030-sidebar-rename-contract-browser.pw.js',
  packageJson: 'package.json',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const sidebar = read(files.sidebar);
const globalContextMenu = read(files.globalContextMenu);
const browserVerifier = read(files.browserVerifier);
const pkg = read(files.packageJson);

assert(
  'workspace title is focusable but not click-to-edit',
  sidebar.includes('data-sidebar-workspace-title="true"') &&
    sidebar.includes("event.key !== 'F2'") &&
    sidebar.includes('startWorkspaceTitleEdit(workspace)') &&
    !sidebar.includes('onClick={() => startWorkspaceTitleEdit(ws)}') &&
    !sidebar.includes('title="點擊改名，右鍵開啟選單"'),
);

assert(
  'board title click bubbles to board row instead of starting rename',
  sidebar.includes('data-sidebar-board-row="true"') &&
    sidebar.includes('data-sidebar-board-title="true"') &&
    sidebar.includes("event.key === 'F2'") &&
    sidebar.includes('startBoardTitleEdit(ws, board)') &&
    sidebar.includes('點擊開啟看板，右鍵開啟選單，F2 重新命名') &&
    !sidebar.includes('event.stopPropagation();\n                              if (!canEditBoardSettings) return;\n                              startBoardTitleEdit(ws, board);'),
);

assert(
  'explicit context menu rename entry points remain available',
  globalContextMenu.includes('handleRenameWorkspace') &&
    globalContextMenu.includes('setPendingWorkspaceTitleEditId(contextMenuState.workspaceId)') &&
    globalContextMenu.includes('重新命名工作區') &&
    globalContextMenu.includes('handleRenameBoard') &&
    globalContextMenu.includes('setPendingBoardTitleEdit({') &&
    globalContextMenu.includes('重新命名看板'),
);

assert(
  'browser verifier covers click, right-click, F2, Enter, and Escape',
  browserVerifier.includes('workspace-click-no-rename') &&
    browserVerifier.includes('workspace-context-menu-rename') &&
    browserVerifier.includes('workspace-f2-rename') &&
    browserVerifier.includes('board-click-no-rename') &&
    browserVerifier.includes('board-context-menu-rename') &&
    browserVerifier.includes('board-f2-rename') &&
    browserVerifier.includes("await page.keyboard.press('Escape')") &&
    browserVerifier.includes("await page.keyboard.press('Enter')"),
);

assert(
  'package exposes DEV-030 verifiers',
  pkg.includes('"verify:dev-030-sidebar-rename-contract"') &&
    pkg.includes('"verify:dev-030-sidebar-rename-contract-browser"'),
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
