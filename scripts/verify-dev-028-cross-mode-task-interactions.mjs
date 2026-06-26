import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  taskInteractions: 'src/utils/taskInteractions.ts',
  boardStore: 'src/store/useBoardStore.ts',
  types: 'src/types/index.ts',
  globalContextMenu: 'src/components/GlobalContextMenu.tsx',
  globalDialog: 'src/components/GlobalDialog.tsx',
  taskDetailsModal: 'src/components/TaskDetailsModal.tsx',
  wbsNodeItem: 'src/components/Wbs/WbsNodeItem.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  mindMapKeyboard: 'src/components/MindMap/mindMapKeyboard.ts',
  ganttView: 'src/components/GanttView.tsx',
  ganttTaskBar: 'src/components/Gantt/GanttTaskBar.tsx',
  sharedTaskSidebar: 'src/components/SharedTaskSidebar.tsx',
  recordSidebar: 'src/components/Records/RecordSidebar.tsx',
  tagPicker: 'src/components/Tags/TagPicker.tsx',
  statusFilterBar: 'src/components/ui/StatusFilterBar.tsx',
  ragSidebar: 'src/components/Rag/RagSidebar.tsx',
  browserVerifier: 'scripts/verify-dev-028-cross-mode-task-interactions-browser.pw.js',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md',
  qa: 'ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const taskInteractions = read(files.taskInteractions);
const boardStore = read(files.boardStore);
const types = read(files.types);
const globalContextMenu = read(files.globalContextMenu);
const globalDialog = read(files.globalDialog);
const taskDetailsModal = read(files.taskDetailsModal);
const wbsNodeItem = read(files.wbsNodeItem);
const kanbanColumn = read(files.kanbanColumn);
const kanbanCard = read(files.kanbanCard);
const kanbanChecklist = read(files.kanbanChecklist);
const mindMapView = read(files.mindMapView);
const mindMapNode = read(files.mindMapNode);
const mindMapKeyboard = read(files.mindMapKeyboard);
const ganttView = read(files.ganttView);
const ganttTaskBar = read(files.ganttTaskBar);
const sharedTaskSidebar = read(files.sharedTaskSidebar);
const recordSidebar = read(files.recordSidebar);
const tagPicker = read(files.tagPicker);
const statusFilterBar = read(files.statusFilterBar);
const ragSidebar = read(files.ragSidebar);
const browserVerifier = read(files.browserVerifier);
const pkg = read(files.packageJson);
const spec = read(files.spec);
const qa = read(files.qa);

assert(
  'shared task detail event and selected task state are defined',
  taskInteractions.includes("OPEN_TASK_DETAILS_EVENT = 'open-task-details'") &&
    taskInteractions.includes('selectAndOpenTaskDetails') &&
    taskInteractions.includes('prepareNewTaskNaming') &&
    taskInteractions.includes("window.matchMedia('(pointer: coarse)')") &&
    boardStore.includes('selectedTaskId: null') &&
    boardStore.includes('pendingDirectTitleEditNodeId: null') &&
    boardStore.includes('pendingTitleEditInitialValue: null') &&
    types.includes('selectedTaskId: string | null') &&
    types.includes('pendingDirectTitleEditNodeId: string | null'),
);

assert(
  'global task details listener is permanent and keyboard contract is mode-aware',
  globalContextMenu.includes('document.addEventListener(OPEN_TASK_DETAILS_EVENT, handleOpenTaskDetails)') &&
    globalContextMenu.includes('setDetailsNodeId(customEvent.detail.taskId)') &&
    globalContextMenu.includes("!['list', 'board', 'gantt'].includes(currentView)") &&
    globalContextMenu.includes("event.key === 'Enter'") &&
    globalContextMenu.includes("event.key === 'F2' || event.key.toLowerCase() === 't'") &&
    globalContextMenu.includes('pendingDirectTitleEditNodeId === selectedTaskId') &&
    globalContextMenu.includes('setPendingTitleEditNodeId(selectedTaskId, event.key)') &&
    globalContextMenu.includes('重新命名任務'),
);

assert(
  'TaskDetailsModal exposes stable verifier selectors',
  taskDetailsModal.includes('data-task-details-modal="true"') &&
    taskDetailsModal.includes('data-task-id={node.id}') &&
    taskDetailsModal.includes('更多詳情選項'),
);

assert(
  'Escape closes temporary overlays without replacing edit-specific Escape behavior',
  globalDialog.includes("e.key === 'Escape'") &&
    globalDialog.includes('e.stopImmediatePropagation()') &&
    taskDetailsModal.includes("event.key !== 'Escape'") &&
    taskDetailsModal.includes("[data-tag-picker-panel], .global-dialog-content") &&
    taskDetailsModal.includes('onClose()') &&
    globalContextMenu.includes("event.key !== 'Escape' || event.isComposing || isMoving") &&
    globalContextMenu.includes('BoardWorkspaceTransferDialog') &&
    recordSidebar.includes('data-record-help-dialog') &&
    recordSidebar.includes("event.key !== 'Escape'") &&
    tagPicker.includes('data-tag-picker-panel') &&
    tagPicker.includes('if (editingTagId)') &&
    tagPicker.includes('setIsOpen(false)') &&
    statusFilterBar.includes('data-filter-menu-panel') &&
    statusFilterBar.includes("event.key !== 'Escape'") &&
    ragSidebar.includes('if (isQuickMenuOpen) return') &&
    mindMapView.includes("if (event.key === 'Escape')") &&
    mindMapView.includes('clearSelectedRelationship()'),
);

assert(
  'list mode is selection-first and explicit rename only',
  wbsNodeItem.includes('selectAndOpenTaskDetails(node.id)') &&
    wbsNodeItem.includes('isTaskPrimaryActionTarget(event.target)') &&
    wbsNodeItem.includes('data-task-selected') &&
    wbsNodeItem.includes('data-task-id={node.id}') &&
    wbsNodeItem.includes('<Pencil size={13} />') &&
    wbsNodeItem.includes('pendingTitleEditInitialValue') &&
    !wbsNodeItem.includes('title="點擊以編輯任務名稱"'),
);

assert(
  'board columns, cards, and Level 3+ checklist keep card front content while using click-to-details',
  kanbanColumn.includes('selectAndOpenTaskDetails(nodeId)') &&
    kanbanColumn.includes('prepareNewTaskNaming(newNode.id)') &&
    kanbanColumn.includes('data-task-id={nodeId}') &&
    kanbanCard.includes('selectAndOpenTaskDetails(nodeId)') &&
    kanbanCard.includes('kanban-checklist-section') &&
    kanbanCard.includes('<KanbanChecklist') &&
    kanbanCard.includes('TagChip') &&
    kanbanCard.includes('CheckSquare') &&
    kanbanChecklist.includes('selectAndOpenTaskDetails(child.id)') &&
    kanbanChecklist.includes('data-task-id={child.id}') &&
    kanbanChecklist.includes('<Pencil size={11} />') &&
    !kanbanCard.includes('title="點擊以編輯任務名稱"') &&
    !kanbanChecklist.includes('title="點擊以編輯任務名稱"'),
);

assert(
  'mind map click opens details, right-click opens task menu, and Enter remains create-sibling',
  mindMapView.includes('openTaskDetails(nodeId)') &&
    mindMapView.includes('setContextMenuState({') &&
    mindMapNode.includes('onOpenDetails(node.id)') &&
    mindMapNode.includes('onOpenContextMenu(node.id') &&
    !mindMapNode.includes('onRelationshipStart') &&
    !mindMapView.includes('const startRelationshipFromNode') &&
    mindMapKeyboard.includes("if (event.key === 'Enter') return { type: 'create-sibling' }") &&
    mindMapKeyboard.includes("if (event.key === 'Tab') return { type: 'create-child' }"),
);

assert(
  'gantt task bar and sidebar open details without switching back to list',
  ganttView.includes('selectAndOpenTaskDetails(item.id)') &&
    !ganttView.includes("setView('list')") &&
    ganttTaskBar.includes('const latestDragState = dragStateRef.current') &&
    ganttTaskBar.includes('!latestDragState.hasDragged') &&
    ganttTaskBar.includes('data-task-selected') &&
    sharedTaskSidebar.includes('data-task-id={item.id}') &&
    sharedTaskSidebar.includes('data-task-selected') &&
    sharedTaskSidebar.includes('prepareNewTaskNaming(newNode.id)'),
);

assert(
  'package exposes DEV-028 verifiers',
  pkg.includes('"verify:dev-028-cross-mode-task-interactions"') &&
    pkg.includes('"verify:dev-028-cross-mode-task-interactions-browser"'),
);

assert(
  'browser verifier covers four modes and selected retention',
  browserVerifier.includes('switchMode = async (mode)') &&
    browserVerifier.includes("mode: 'list'") &&
    browserVerifier.includes("switchMode('mindmap')") &&
    browserVerifier.includes("mode: 'board'") &&
    browserVerifier.includes("mode: 'gantt'") &&
    browserVerifier.includes('data-task-details-modal') &&
    browserVerifier.includes("await page.keyboard.press('Escape')") &&
    browserVerifier.includes('data-task-selected="true"') &&
    browserVerifier.includes('single click should open TaskDetailsModal') &&
    browserVerifier.includes('title click should not enter rename input'),
);

assert(
  'PM docs preserve exclusions and QA gates',
  spec.includes('不降低看板卡片正面資訊密度') &&
    spec.includes('不把 Level 3+ 下層任務預設收進 Card back') &&
    spec.includes('清單、心智圖、看板、甘特') &&
    qa.includes('ZT-028-010') &&
    qa.includes('RD Slice Phase Gates') &&
    qa.includes('verify:dev-028-cross-mode-task-interactions-browser'),
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
