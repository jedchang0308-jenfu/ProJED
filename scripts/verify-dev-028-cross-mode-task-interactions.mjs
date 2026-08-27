import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  taskInteractions: 'src/utils/taskInteractions.ts',
  boardStore: 'src/store/useBoardStore.ts',
  types: 'src/types/index.ts',
  globalContextMenu: 'src/components/GlobalContextMenu.tsx',
  mainLayout: 'src/components/MainLayout.tsx',
  indexCss: 'src/index.css',
  globalDialog: 'src/components/GlobalDialog.tsx',
  taskDetailsModal: 'src/components/TaskDetailsModal.tsx',
  boardView: 'src/components/BoardView.tsx',
  wbsNodeItem: 'src/components/Wbs/WbsNodeItem.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  taskDateBadge: 'src/components/Wbs/TaskDateBadge.tsx',
  kanbanTagSticker: 'src/components/Tags/KanbanTagSticker.tsx',
  tagChip: 'src/components/Tags/TagChip.tsx',
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
  manualClickReadiness: 'scripts/verify-dev-028-manual-click-qc-readiness.mjs',
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
const mainLayout = read(files.mainLayout);
const indexCss = read(files.indexCss);
const globalDialog = read(files.globalDialog);
const taskDetailsModal = read(files.taskDetailsModal);
const boardView = read(files.boardView);
const wbsNodeItem = read(files.wbsNodeItem);
const kanbanColumn = read(files.kanbanColumn);
const kanbanCard = read(files.kanbanCard);
const kanbanChecklist = read(files.kanbanChecklist);
const taskDateBadge = read(files.taskDateBadge);
const kanbanTagSticker = read(files.kanbanTagSticker);
const mindMapView = read(files.mindMapView);
const mindMapNode = read(files.mindMapNode);
const mindMapKeyboard = read(files.mindMapKeyboard);
const ganttView = read(files.ganttView);
const ganttTaskBar = read(files.ganttTaskBar);
const sharedTaskSidebar = read(files.sharedTaskSidebar);
const tagPicker = read(files.tagPicker);
const statusFilterBar = read(files.statusFilterBar);
const ragSidebar = read(files.ragSidebar);
const browserVerifier = read(files.browserVerifier);
const manualClickReadiness = read(files.manualClickReadiness);
const pkg = read(files.packageJson);
const spec = read(files.spec);
const qa = read(files.qa);
const kanbanCardTitleStart = kanbanCard.indexOf('kanban-task-title-row');
const kanbanCardTitleSection = kanbanCard.slice(
  kanbanCardTitleStart,
  kanbanCard.indexOf('{isSelectingMode &&', kanbanCardTitleStart),
);

assert(
  'shared task detail event, clear lifecycle, and detail-title edit signal are defined',
  taskInteractions.includes("OPEN_TASK_DETAILS_EVENT = 'open-task-details'") &&
    taskInteractions.includes("CLEAR_TASK_SELECTION_EVENT = 'clear-task-selection'") &&
    taskInteractions.includes('export const clearTaskSelection') &&
    taskInteractions.includes('setSelectedTaskId(null)') &&
    taskInteractions.includes('dispatchEvent(new CustomEvent(CLEAR_TASK_SELECTION_EVENT))') &&
    taskInteractions.includes('selectAndOpenTaskDetails') &&
    taskInteractions.includes('prepareNewTaskNaming') &&
    taskInteractions.includes('openTaskDetails(taskId)') &&
    taskInteractions.includes('setPendingTitleEditNodeId(taskId)') &&
    boardStore.includes('selectedTaskId: null') &&
    boardStore.includes('pendingTitleEditInitialValue: null') &&
    types.includes('selectedTaskId: string | null') &&
    !boardStore.includes('pendingDirectTitleEditNodeId') &&
    !types.includes('pendingDirectTitleEditNodeId'),
);

assert(
  'global task details listener is permanent and task keyboard no longer starts outer rename',
  globalContextMenu.includes('document.addEventListener(OPEN_TASK_DETAILS_EVENT, handleOpenTaskDetails)') &&
    globalContextMenu.includes('setDetailsNodeId(customEvent.detail.taskId)') &&
    globalContextMenu.includes('clearTaskSelection();') &&
    globalContextMenu.includes('onClose={() => {') &&
    globalContextMenu.includes("!['list', 'board', 'gantt'].includes(currentView)") &&
    globalContextMenu.includes("event.key === 'Enter'") &&
    !globalContextMenu.includes("event.key === 'F2' || event.key.toLowerCase() === 't'") &&
    !globalContextMenu.includes('pendingDirectTitleEditNodeId === selectedTaskId') &&
    !globalContextMenu.includes('setPendingTitleEditNodeId(selectedTaskId, event.key)') &&
    !globalContextMenu.includes('重新命名任務'),
);

assert(
  'TaskDetailsModal exposes the only task-title edit locus',
  taskDetailsModal.includes('data-task-details-modal="true"') &&
    taskDetailsModal.includes('data-task-id={node.id}') &&
    taskDetailsModal.includes('data-task-details-title-input="true"') &&
    taskDetailsModal.includes('aria-label="編輯任務名稱"') &&
    taskDetailsModal.includes('border border-slate-200 bg-slate-50/80') &&
    !taskDetailsModal.includes('更多詳情選項') &&
    !taskDetailsModal.includes('CalendarDays') &&
    !taskDetailsModal.includes('Pencil') &&
    !taskDetailsModal.includes('<span>時間設定</span>') &&
    !taskDetailsModal.includes('<h2 className="text-sm font-semibold text-slate-700">備註欄</h2>'),
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
  'list mode is selection-first and has no outer title edit surface',
  wbsNodeItem.includes('selectAndOpenTaskDetails(node.id)') &&
    wbsNodeItem.includes('isTaskPrimaryActionTarget(event.target)') &&
    wbsNodeItem.includes('data-task-selected') &&
    wbsNodeItem.includes('data-task-id={node.id}') &&
    !wbsNodeItem.includes('data-task-title-input="true"') &&
    !wbsNodeItem.includes('title="重新命名任務"') &&
    !wbsNodeItem.includes('pendingTitleEditInitialValue') &&
    !wbsNodeItem.includes('title="點擊以編輯任務名稱"'),
);

assert(
  'board hierarchy distinguishes framed elevated L2 cards from inset unlined L3+ rows without progress bars',
  kanbanColumn.includes('selectAndOpenTaskDetails(nodeId)') &&
    kanbanColumn.includes('prepareNewTaskNaming(newNode.id)') &&
    kanbanColumn.includes('data-task-id={nodeId}') &&
    kanbanCard.includes('selectAndOpenTaskDetails(nodeId)') &&
    kanbanCard.includes('kanban-checklist-section') &&
    kanbanCard.includes('<KanbanChecklist') &&
    kanbanCard.includes('KanbanTagSticker') &&
    kanbanChecklist.includes('KanbanTagSticker') &&
    kanbanCard.includes('surface="checklist"') &&
    !kanbanColumn.includes('kanban-task-progress') &&
    !kanbanCard.includes('kanban-task-progress') &&
    kanbanColumn.includes('data-kanban-header-visual="tonal-borderless"') &&
    // The inline column "新增任務" affordance was intentionally removed by
    // the compact Kanban contract (90cfcb4). Creation remains available from
    // the canonical task menu / drag command paths; this verifier must not
    // resurrect the retired visual marker as a required baseline.
    !kanbanColumn.includes('data-kanban-add-task-visual="borderless"') &&
    boardView.includes('data-kanban-add-column-visual="borderless"') &&
    !boardView.includes('border-2 border-dashed border-slate-200') &&
    !kanbanColumn.includes('variant="dashed"') &&
    !kanbanColumn.includes('flex flex-col gap-1 border-b') &&
    kanbanCard.includes('data-kanban-card-visual="framed-elevated"') &&
    kanbanCard.includes('data-task-hierarchy-level="L2"') &&
    kanbanCard.includes('data-kanban-checklist-visual="inset-rail"') &&
    kanbanCard.includes('kanban-checklist-section') &&
    kanbanCard.includes('mt-1 rounded-md border-l-2') &&
    kanbanChecklist.includes('data-kanban-checklist-row-visual="flat-unlined"') &&
    kanbanChecklist.includes('data-task-hierarchy-level="L3+"') &&
    !kanbanChecklist.includes('border-b border-slate-200/80') &&
    !kanbanChecklist.includes('kanban-checklist-root mt-px border-t') &&
    taskDateBadge.includes('data-task-date-visual="borderless"') &&
    taskDateBadge.includes("bg-slate-100/80 text-slate-500") &&
    kanbanTagSticker.includes('data-kanban-tag-sticker="true"') &&
    kanbanTagSticker.includes('data-kanban-tag-popover="true"') &&
    !kanbanCard.includes('<TagChip') &&
    !kanbanChecklist.includes('<TagChip') &&
    !kanbanCard.includes('CheckSquare') &&
    !kanbanCard.includes('childStats.completed') &&
    kanbanChecklist.includes('selectAndOpenTaskDetails(child.id)') &&
    kanbanChecklist.includes('data-task-id={child.id}') &&
    kanbanChecklist.includes('surface="checklist"') &&
    !kanbanChecklist.includes('{grandchildIds.length}') &&
    !kanbanColumn.includes('data-task-title-input="true"') &&
    !kanbanCard.includes('data-task-title-input="true"') &&
    !kanbanChecklist.includes('data-task-title-input="true"') &&
    !kanbanColumn.includes('title="重新命名任務"') &&
    !kanbanCard.includes('title="重新命名任務"') &&
    !kanbanChecklist.includes('title="重新命名任務"') &&
    !kanbanCard.includes('title="點擊以編輯任務名稱"') &&
    !kanbanChecklist.includes('title="點擊以編輯任務名稱"'),
);

assert(
  'Kanban dates share the title-row checklist surface and show only due dates',
    kanbanCardTitleSection.includes('<TaskDateBadge') &&
    kanbanCardTitleSection.includes('surface="checklist"') &&
    kanbanCardTitleSection.includes('className="ml-0.5 self-center"') &&
    kanbanColumn.includes('showStartDate={false}') &&
    kanbanCard.includes('showStartDate={false}') &&
    kanbanChecklist.includes('showStartDate={false}') &&
    !kanbanColumn.includes('state.showStartDate') &&
    !kanbanCard.includes('s => s.showStartDate') &&
    !kanbanChecklist.includes('s => s.showStartDate') &&
    taskDateBadge.includes('Boolean((showStartDate && startDate) || endDate)') &&
    taskDateBadge.includes("const isDueToday = status !== 'completed' && Boolean(endDate)") &&
    taskDateBadge.includes('const isEndDateEffectivelyLocked = endLocked || durationLocked') &&
    taskDateBadge.includes("data-task-due-date={endDate || ''}"),
);

assert(
  'Escape and view changes clear task selection without touching other temporary modes',
  mainLayout.includes("import { clearTaskSelection } from '../utils/taskInteractions';") &&
    mainLayout.includes('if (!hasBlockingOverlay)') &&
    mainLayout.includes('clearTaskSelection();') &&
    indexCss.includes('[data-desktop-task-hover-preview="true"]:hover') &&
    indexCss.includes('@apply ring-2 ring-inset ring-primary-500 bg-primary-50/60;') &&
    boardStore.includes('set({ currentView: view, selectedTaskId: null })') &&
    boardStore.includes('set({ activeBoardId: id, selectedTaskId: null })') &&
    boardStore.includes('set({ activeWorkspaceId: id, selectedTaskId: null })'),
);

assert(
  'mind map keeps shared select/double-details actions while DEV-073 host owns the quick-title exception',
  mindMapView.includes('openTaskDetails(nodeId)') &&
    mindMapView.includes('CLEAR_TASK_SELECTION_EVENT') &&
    mindMapView.includes('clearTaskSelection();') &&
    mindMapView.includes('initialSelectionBoardRef') &&
    mindMapView.includes('clearSelection();') &&
    mindMapView.includes('setContextMenuState({') &&
    mindMapNode.includes("interactionBinding.dispatch('pointer.primary')") &&
    mindMapNode.includes("interactionBinding.dispatch('pointer.double')") &&
    mindMapNode.includes('data-mindmap-quick-title-input="true"') &&
    mindMapView.includes('handleNodePointerPrimary') &&
    mindMapNode.includes('onOpenContextMenu(node.id') &&
    !mindMapNode.includes('data-mindmap-title-input') &&
    mindMapNode.includes('onDoubleClick') &&
    !mindMapKeyboard.includes("type: 'rename-selected'") &&
    !mindMapKeyboard.includes("event.key === 'F2' && state.hasSelectedNode") &&
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
    sharedTaskSidebar.includes('prepareNewTaskNaming(newNode.id)') &&
    !sharedTaskSidebar.includes('data-task-title-input="true"') &&
    !sharedTaskSidebar.includes('title="重新命名任務"'),
);

assert(
  'package exposes DEV-028 verifiers',
  pkg.includes('"verify:dev-028-cross-mode-task-interactions"') &&
    pkg.includes('"verify:dev-028-cross-mode-task-interactions-browser"') &&
    pkg.includes('"verify:dev-060-kanban-due-date-browser"') &&
    pkg.includes('"verify:dev-028-manual-click-qc-readiness"') &&
    pkg.includes('"verify:dev-063-kanban-hierarchy-visual-browser"'),
);

assert(
  'Manual click QC gate is registered with user-reported pass and production boundary',
  manualClickReadiness.includes("evidence_source: 'user_report'") &&
    manualClickReadiness.includes('formal_manual_evidence_attached: false') &&
    manualClickReadiness.includes('自動化 Playwright browser smoke 只能作為輔助證據，不能取代人工點擊') &&
    manualClickReadiness.includes('MAN-028-001') &&
    manualClickReadiness.includes('MAN-028-028') &&
    manualClickReadiness.includes('User-Reported Manual Click QC Passed') &&
    manualClickReadiness.includes('production release 需另行授權') &&
    manualClickReadiness.includes('verify:dev-028-manual-click-qc-readiness'),
);

assert(
  'browser verifier covers four modes and selected clear lifecycle',
  browserVerifier.includes('switchMode = async (mode)') &&
    browserVerifier.includes("mode: 'list'") &&
    browserVerifier.includes("switchMode('mindmap')") &&
    browserVerifier.includes("mode: 'board'") &&
    browserVerifier.includes("mode: 'gantt'") &&
    browserVerifier.includes('data-task-details-modal') &&
    browserVerifier.includes("await page.keyboard.press('Escape')") &&
    browserVerifier.includes('data-task-selected="true"') &&
    browserVerifier.includes('selectedCount === 0') &&
    browserVerifier.includes('mindmap should clear selected node after closing details') &&
    browserVerifier.includes('blank click should clear mindmap selection') &&
    browserVerifier.includes('mindmap single click should select') &&
    browserVerifier.includes('mindmap double click should open TaskDetailsModal') &&
    browserVerifier.includes('data-task-action-id="task.open-details"') &&
    browserVerifier.includes('context menu should not expose task rename') &&
    browserVerifier.includes('data-task-details-title-input="true"'),
);

assert(
  'PM docs preserve detail-only rename addendum and QA gates',
  spec.includes('L2 完整中性外框＋陰影、L3+ 內嵌左導軌＋無線條扁平列分層') &&
    spec.includes('DEV-063 看板 L2／L3+ 視覺層級強化增補') &&
    spec.includes('不把 Level 3+ 下層任務預設收進 Card back') &&
    spec.includes('只能先進入任務詳情') &&
    spec.includes('TaskDetailsModal') &&
    spec.includes('清單、心智圖、看板、甘特') &&
    qa.includes('改名只能在任務詳情頁 title edit') &&
    qa.includes('ZT-028-010') &&
    qa.includes('RD Slice Phase Gates') &&
    qa.includes('QA-063-005') &&
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
