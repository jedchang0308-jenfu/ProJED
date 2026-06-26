import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  useCoarsePointer: 'src/hooks/useCoarsePointer.ts',
  useTouchTapGuard: 'src/hooks/useTouchTapGuard.ts',
  mobileBoardDragScroll: 'src/hooks/useMobileBoardDragScroll.ts',
  css: 'src/index.css',
  boardView: 'src/components/BoardView.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  wbsListView: 'src/components/Wbs/WbsListView.tsx',
  wbsNodeItem: 'src/components/Wbs/WbsNodeItem.tsx',
  mindMapCanvasShell: 'src/components/MindMap/MindMapCanvasShell.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  ganttView: 'src/components/GanttView.tsx',
  ganttTaskBar: 'src/components/Gantt/GanttTaskBar.tsx',
  browserVerifier: 'scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js',
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
  'coarse pointer hook reuses centralized task interaction detection',
  source.useCoarsePointer.includes("import { isCoarsePointer as getIsCoarsePointer }") &&
    source.useCoarsePointer.includes("window.matchMedia('(pointer: coarse)')") &&
    source.ganttTaskBar.includes('useCoarsePointer()') &&
    source.mindMapNode.includes('useCoarsePointer()'),
);

assert(
  'touch tap guard suppresses compatibility click after pan threshold',
  source.useTouchTapGuard.includes('threshold = 10') &&
    source.useTouchTapGuard.includes('onTouchStart') &&
    source.useTouchTapGuard.includes('onTouchMove') &&
    source.useTouchTapGuard.includes('suppressNextTapRef.current = true') &&
    source.useTouchTapGuard.includes('onClickCapture') &&
    source.useTouchTapGuard.includes('shouldSuppressTap'),
);

assert(
  'mobile pan css utilities are available and keep drag handles explicit',
  source.css.includes('.mobile-pan-surface') &&
    source.css.includes('.mobile-pan-item') &&
    source.css.includes('.mobile-pan-rail') &&
    source.css.includes('touch-action: pan-x pan-y') &&
    source.css.includes('.task-drag-hitbox') &&
    source.css.includes('touch-action: none'),
);

assert(
  'board mode exposes pan surfaces, tap guard, and bottom rail',
  source.boardView.includes('data-mobile-pan-surface="board"') &&
    source.boardView.includes('data-mobile-board-pan="true"') &&
    source.boardView.includes('useMobileBoardDragScroll(boardPanSurfaceRef)') &&
    source.kanbanColumn.includes('data-mobile-pan-surface="kanban-column"') &&
    source.kanbanColumn.includes('data-mobile-pan-rail="kanban-column"') &&
    source.kanbanColumn.includes('data-mobile-board-pan-allow="true"') &&
    source.kanbanCard.includes('useTouchTapGuard') &&
    source.kanbanCard.includes('data-touch-tap-guard="true"') &&
    source.kanbanCard.includes('mobile-pan-item') &&
    source.kanbanCard.includes('selectAndOpenTaskDetails(nodeId)'),
);

assert(
  'mobile board drag-scroll hook covers full board surface and preserves controls',
  source.mobileBoardDragScroll.includes('addEventListener') &&
    source.mobileBoardDragScroll.includes("surface.addEventListener('touchstart', handleTouchStart, { capture: true") &&
    source.mobileBoardDragScroll.includes("surface.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false })") &&
    source.mobileBoardDragScroll.includes("surface.addEventListener('click', handleClickCapture, true)") &&
    source.mobileBoardDragScroll.includes('Math.hypot(totalX, totalY) > threshold') &&
    source.mobileBoardDragScroll.includes('surface.scrollLeft -= deltaX') &&
    source.mobileBoardDragScroll.includes('gesture.columnSurface.scrollTop -= deltaY') &&
    source.mobileBoardDragScroll.includes('data-mobile-board-pan-active') &&
    source.mobileBoardDragScroll.includes('data-mobile-board-pan-suppressed-click') &&
    source.mobileBoardDragScroll.includes('PAN_ALLOWED_INTERACTIVE_SELECTOR') &&
    source.mobileBoardDragScroll.includes('data-mobile-board-pan-allow="true"') &&
    source.mobileBoardDragScroll.includes('[data-task-drag-handle="true"]') &&
    source.mobileBoardDragScroll.includes('[data-task-interaction-control="true"]') &&
    source.mobileBoardDragScroll.includes('[data-task-details-modal="true"]') &&
    source.mobileBoardDragScroll.includes('[data-mobile-pan-surface="kanban-column"]') &&
    source.mobileBoardDragScroll.includes('.kanban-checklist-item') &&
    source.mobileBoardDragScroll.includes('.kanban-task-card'),
);

assert(
  'non-board mobile modes retain implementation hooks but are closed by mobile navigation',
  source.wbsListView.includes('data-mobile-pan-surface="wbs-list"') &&
    source.mindMapCanvasShell.includes('data-mobile-pan-surface="mindmap"') &&
    source.ganttView.includes('data-mobile-pan-surface="gantt"') &&
    source.ganttTaskBar.includes('const canEditSchedule = canEditTask && canMoveTask && !isCoarsePointer') &&
    source.browserVerifier.includes('mobile should only expose board mode') &&
    source.browserVerifier.includes('data-mode-switcher-value="list"') &&
    source.browserVerifier.includes('data-mode-switcher-value="gantt"'),
);

assert(
  'package exposes DEV-029 verifiers',
  source.packageJson.includes('"verify:dev-029-mobile-pan-first-interactions"') &&
    source.packageJson.includes('"verify:dev-029-mobile-pan-first-interactions-browser"'),
);

assert(
  'browser verifier covers mobile board-only full-surface pan contract',
    source.browserVerifier.includes('setCoarsePointer') &&
    source.browserVerifier.includes('mobile should only expose board mode') &&
    source.browserVerifier.includes('dispatchTouchSequence') &&
    source.browserVerifier.includes("step = 'card horizontal pan'") &&
    source.browserVerifier.includes("step = 'checklist horizontal pan'") &&
    source.browserVerifier.includes("step = 'checklist vertical pan'") &&
    source.browserVerifier.includes("step = 'column blank vertical pan'") &&
    source.browserVerifier.includes("step = 'add task input vertical pan'") &&
    source.browserVerifier.includes("step = 'add task button vertical pan'") &&
    source.browserVerifier.includes("step = 'board blank horizontal pan'") &&
    source.browserVerifier.includes('drag should horizontally scroll board') &&
    source.browserVerifier.includes('drag should vertically scroll column') &&
    source.browserVerifier.includes('pan should not open TaskDetailsModal') &&
    source.browserVerifier.includes('tap should open TaskDetailsModal') &&
    source.browserVerifier.includes('input should accept focus and text without mobile board pan interference') &&
    source.browserVerifier.includes('should have no visible runtime errors'),
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
