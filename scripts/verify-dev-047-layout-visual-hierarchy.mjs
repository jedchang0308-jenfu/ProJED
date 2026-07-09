import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const source = {
  mainLayout: read('src/components/MainLayout.tsx'),
  sidebar: read('src/components/Sidebar.tsx'),
  statusFilterBar: read('src/components/ui/StatusFilterBar.tsx'),
  taskWorkbench: read('src/components/TaskWorkbenchPanel.tsx'),
  boardView: read('src/components/BoardView.tsx'),
};

const assert = (name, condition) => {
  if (!condition) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: ${name}`);
};

const taskCommandCenterTitleBlock =
  source.taskWorkbench.match(/data-task-command-center-title="true"[\s\S]*?全域任務平台[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
const topbarFilterTriggerBlock =
  source.statusFilterBar.match(/id="filter-menu-trigger"[\s\S]*?<\/button>/)?.[0] ?? '';
const taskWorkbenchFilterTriggerBlock =
  source.taskWorkbench.match(/data-task-workbench-filter-toggle="true"[\s\S]*?<\/button>/)?.[0] ?? '';

assert(
  'topbar is tagged and styled as a global command layer',
  source.mainLayout.includes('data-layout-region="topbar"') &&
    source.mainLayout.includes('data-app-topbar="true"') &&
    source.mainLayout.includes('bg-white/95') &&
    source.mainLayout.includes('border-slate-300/80') &&
    source.mainLayout.includes('shadow-[0_1px_8px_rgba(15,23,42,0.08)]'),
);

assert(
  'topbar controls are grouped for scanability',
  source.mainLayout.includes('data-topbar-context-group="true"') &&
    source.mainLayout.includes('data-topbar-board-controls="true"') &&
    source.mainLayout.includes('data-topbar-action-group="true"') &&
    source.mainLayout.includes('hidden shrink-0 items-center gap-1 rounded-lg') &&
    source.mainLayout.includes('sm:flex'),
);

assert(
  'workspace sidebar is visually quieter than the task command center',
  source.sidebar.includes('data-layout-region="workspace-sidebar"') &&
    source.sidebar.includes('border-r border-slate-300/80 bg-slate-50') &&
    source.sidebar.includes('data-sidebar-workspace-list="true"') &&
    source.sidebar.includes('bg-slate-50/90') &&
    source.sidebar.includes('hover:bg-white hover:shadow-sm'),
);

assert(
  'task workbench is promoted as the task command center',
  source.taskWorkbench.includes('data-layout-region="task-command-center"') &&
    source.taskWorkbench.includes('border-r-2 border-[#b7c5cf] bg-gradient-to-b from-[#f7f9fa] via-[#eef3f6] to-[#e4ebef]') &&
    source.taskWorkbench.includes('shadow-[4px_0_20px_rgba(70,92,106,0.16)]') &&
    source.taskWorkbench.includes('data-task-command-center-title="true"') &&
    source.taskWorkbench.includes('border border-[#c7d1d8] bg-[#fbfcfc]'),
);

assert(
  'task command center title does not use a filter-like icon',
  taskCommandCenterTitleBlock.includes('全域任務平台') &&
    !taskCommandCenterTitleBlock.includes('<SlidersHorizontal') &&
    source.taskWorkbench.includes('<SlidersHorizontal size={13} />'),
);

assert(
  'task command center controls use the muted Morandi task hub treatment',
  source.taskWorkbench.includes('data-task-workbench-filter-control-area="true"') &&
    source.taskWorkbench.includes('border-b border-[#c3ccd2] bg-gradient-to-r from-[#fbfcfc] via-[#f1f5f7] to-[#e8eef2]') &&
    source.taskWorkbench.includes('border-[#c7d1d8] bg-[#fbfcfc] text-[#536b7b]') &&
    source.taskWorkbench.includes('hover:bg-[#e4ecf1] hover:text-[#304a5c]') &&
    source.statusFilterBar.includes('border-[#a9bbc8] bg-[#e7eef2] text-[#304a5c]'),
);

assert(
  'unplaced and placed task bodies share one Morandi blue-gray task tone while headers use a separate title tone',
  source.taskWorkbench.includes("isOver ? 'bg-[#e6edf2] ring-2 ring-inset ring-[#a9bbc8]/60' : 'bg-[#f2f5f7]'") &&
    source.taskWorkbench.includes("isPlacedBoardLaneOver ? 'bg-[#e6edf2] ring-2 ring-inset ring-[#a9bbc8]/60' : 'bg-[#f2f5f7]'") &&
    source.taskWorkbench.includes('bg-[#e1e9ee]/95') &&
    !source.taskWorkbench.includes('bg-[#fbfcfc]/85') &&
    !source.taskWorkbench.includes('bg-[#e8eef2]/95'),
);

assert(
  'topbar task filter trigger is icon-only without visible count or dropdown label',
  topbarFilterTriggerBlock.includes('<SlidersHorizontal size={13} />') &&
    !topbarFilterTriggerBlock.includes('<span') &&
    !topbarFilterTriggerBlock.includes('<ChevronDown') &&
    !topbarFilterTriggerBlock.includes('rounded-full bg-amber-400'),
);

assert(
  'task command center filter trigger is icon-only without visible count or dropdown label',
  taskWorkbenchFilterTriggerBlock.includes('<SlidersHorizontal size={13} />') &&
    !taskWorkbenchFilterTriggerBlock.includes('<span') &&
    !taskWorkbenchFilterTriggerBlock.includes('<ChevronDown') &&
    !taskWorkbenchFilterTriggerBlock.includes('rounded-full bg-amber-400'),
);

assert(
  'board canvas is tagged and kept neutral behind the task hub',
  source.boardView.includes('data-layout-region="board-shell"') &&
    source.boardView.includes('data-layout-region="board-workspace"') &&
    source.boardView.includes('data-layout-region="board-canvas"') &&
    source.boardView.includes('overflow-hidden bg-slate-100') &&
    source.boardView.includes('bg-slate-100/90'),
);

if (process.exitCode) process.exit(process.exitCode);
