import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  board: 'src/components/BoardView.tsx',
  card: 'src/components/Wbs/KanbanCard.tsx',
  checklist: 'src/components/Wbs/KanbanChecklist.tsx',
  sharedChecklistTree: 'src/components/Wbs/TaskChecklistTree.tsx',
  column: 'src/components/Wbs/KanbanColumn.tsx',
  preview: 'src/components/Wbs/taskDrag/desktopTaskDropPreview.ts',
  columnDropPolicy: 'src/components/Wbs/taskDrag/desktopColumnDropPolicy.ts',
  orderingGeometry: 'src/components/Wbs/taskDrag/taskOrderingGeometry.ts',
  childPreview: 'src/components/Wbs/taskDrag/TaskChildDropPreview.tsx',
  intent: 'src/components/Wbs/taskDrag/taskDropIntent.ts',
  commit: 'src/components/Wbs/taskDrag/taskDragCommit.ts',
  workbench: 'src/components/TaskWorkbenchPanel.tsx',
  spec: 'ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md',
  qa: 'ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md',
  devTask: 'ai-doc/dev_task.md',
  map: 'ai-doc/documentation_map.md',
  browser: 'scripts/verify-dev-055-desktop-task-drag-target-clarity-browser.pw.js',
  styles: 'src/index.css',
  packageJson: 'package.json',
};

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [
  key,
  existsSync(resolve(file)) ? readFileSync(resolve(file), 'utf8') : '',
]));
const results = [];
const check = (id, name, ok, details) => results.push({ id, name, ok: Boolean(ok), details });
const hasAll = (value, needles) => needles.every((needle) => value.includes(needle));
const checklistRendererSource = `${source.checklist}\n${source.sharedChecklistTree}`;

Object.entries(files).forEach(([key, file]) => check('S00', `file exists:${key}`, existsSync(resolve(file)), file));

check('S01', 'SPEC, QA, task index, and documentation map are linked',
  source.spec.includes('QA-DEV-055')
  && source.qa.includes('SPEC-055')
  && source.devTask.includes('SPEC-055-desktop-task-drag-target-clarity.md')
  && source.devTask.includes('QA-DEV-055-desktop-task-drag-target-clarity.md')
  && source.map.includes('SPEC-055-desktop-task-drag-target-clarity.md')
  && source.map.includes('QA-DEV-055-desktop-task-drag-target-clarity.md'));

check('S02', 'desktop indicator exposes one canonical target descriptor', hasAll(source.board, [
  'data-desktop-drop-indicator="true"',
  'data-desktop-drop-target={desktopIndicator.targetNodeId}',
  'data-desktop-drop-position={desktopIndicator.position}',
  'data-desktop-drop-surface-kind={desktopIndicator.surfaceKind}',
  'data-desktop-drop-indicator-layer="fixed-overlay"',
]) && (source.board.match(/data-desktop-drop-indicator="true"/g) || []).length === 1);

check('S03', 'desktop preview and commit reuse the canonical outcome resolver',
  source.preview.includes('resolveTaskDropOutcome({')
  && source.preview.includes('export const resolveDesktopTaskDropIntent')
  && source.commit.includes('resolveDesktopTaskDropIntent({ activeData, targetData: latestTargetData')
  && source.commit.includes("if (latest.outcomeKind === 'origin')")
  && source.board.includes('resolveDesktopTaskDropPreview({'));

check('S04', 'desktop source placeholders are neutral and cannot impersonate the live target',
  (source.card.includes('data-kanban-drag-source-placeholder-neutral="true"')
    || source.card.includes('kanban-drag-origin-placeholder'))
  && source.column.includes('data-kanban-drag-source-placeholder-neutral="true"')
  && !checklistRendererSource.includes('showSourceInsertionMarker')
  && !source.card.includes("import { KanbanInsertionMarker }")
  && !source.card.includes('<KanbanInsertionMarker')
  && !source.card.includes('showSourceInsertionMarker')
  && !source.column.includes('<KanbanInsertionMarker'));

check('S04A', 'source placeholder uses a neutral outline while the live destination keeps the primary marker',
  source.styles.includes('outline: 1px dashed rgb(148 163 184);')
  && source.styles.includes('box-shadow: none !important;')
  && !source.styles.includes('outline: 2px dashed var(--color-primary-400);'));

check('S05', 'primary geometry owns targeting while complete task scope owns reorder marker boundaries',
  source.card.includes('data-task-surface-source="true"')
  && source.card.includes('data-task-card-primary="true"')
  && source.card.includes('data-mobile-task-card-primary="true"')
  && source.preview.includes("'[data-task-surface-source=\"true\"]'")
  && source.preview.includes('findTaskOrderingGeometryElement(targetElement, targetSurfaceKind)')
  && source.preview.includes("displayPosition === 'after' ? orderingGeometryRect.bottom : orderingGeometryRect.top")
  && source.orderingGeometry.includes("targetSurfaceKind !== 'kanban-card' && targetSurfaceKind !== 'checklist-row'")
  && !source.preview.includes('data-task-card-primary'));

check('S06', 'exact innermost ownership blocks invalid ancestor fallback', hasAll(source.board, [
  'data-desktop-drop-surface="true"',
  'Exact innermost ownership',
  'return resolved ? [directCollision] : [];',
]) && source.preview.includes('if (!resolved) return null;'));

check('S07', 'approved desktop overlay appearance and 8px threshold remain while DEV-068 owns pointer offset', hasAll(source.board, [
  '<DragOverlay dropAnimation={null}>{null}</DragOverlay>',
  'resolvePointerUpperRightOverlayPosition',
  'data-kanban-drag-overlay="true"',
  'data-task-drag-overlay-anchor="pointer-upper-right"',
]) && readFileSync(resolve('src/hooks/useDragSensors.ts'), 'utf8').includes('distance: 8'));

check('S08', 'workbench placed rows remain non-draggable and commit keeps the no-op guard',
  source.commit.includes("return noOp('workbench-placed-row-is-not-a-source')")
  && source.workbench.includes('const WorkbenchPlacedReadOnlyCard')
  && source.workbench.includes('canUseDragSurface={false}'));

check('S09', 'desktop preview does not import mobile rail, hysteresis, or touch lifecycle',
  !/mobile-task-action-rail|MOBILE_TARGET_RETAIN|useTaskDragSession|TouchEvent/.test(source.preview));

check('S10', 'DEV-055 static and browser commands are registered',
  source.packageJson.includes('"verify:dev-055-desktop-task-drag-target-clarity"')
  && source.packageJson.includes('"verify:dev-055-desktop-task-drag-target-clarity-browser"'));

check('S11', 'displayed preview and final commit must match and revalidate latest store state', hasAll(source.board, [
  'desktopTaskDropPreviewMatches(displayedPreview, currentPreview)',
  'desktopPreview: isWorkbenchLane ? null : currentPreview',
]) && hasAll(source.commit, [
  "noOp('desktop-preview-target-mismatch')",
  "noOp('desktop-preview-stale')",
  'const state = useWbsStore.getState();',
]));

check('S12', 'desktop task drag indicators are fixed overlays and retired child dropzones cannot create layout markers',
  source.board.includes('className={`pointer-events-none fixed z-[86]')
  && source.board.includes("desktopIndicator.kind === 'origin' || desktopIndicator.axis === 'vertical'")
  && source.board.includes("data-desktop-drop-axis={desktopIndicator.axis}")
  && source.board.includes('<TaskChildDropPreview')
  && source.childPreview.includes('className="pointer-events-none fixed inset-0 z-[94]"')
  && source.childPreview.includes('data-task-child-drop-preview="true"')
  && !source.card.includes('data-desktop-dropzone-layout="overlay"')
  && !source.card.includes('wbs-checklist-drop')
  && !source.card.includes("showChecklistDropZone ? 'h-6 opacity-100'")
  && !source.card.includes('data-kanban-insertion-marker="true"'));

check('S13', 'desktop task drag freezes sortable displacement while keeping the approved overlay',
  hasAll(`${source.card}\n${checklistRendererSource}`, [
    'freezeDesktopTaskLayout',
    "['wbs-card', 'wbs-checklist'].includes(activeType || '')",
    'transform: freezeDesktopTaskLayout || !transform ? undefined',
    'transition: freezeDesktopTaskLayout ? undefined',
  ])
  && hasAll(checklistRendererSource, [
    'useDndContext',
    'freezeDesktopTaskLayout',
    'transform: freezeDesktopTaskLayout || !transform ? undefined',
    'transition: freezeDesktopTaskLayout ? undefined',
  ])
  && hasAll(source.board, [
    'DESKTOP_INDICATOR_RECT_RETAIN_PX',
    'shouldRetainDesktopIndicatorRect',
    'indicatorRect: currentPreview.indicatorRect',
  ]));

check('S14', 'column gaps and expanded cards route to the nearest task edge while append remains confined to an explicit tail zone',
  hasAll(source.board, [
    'resolveDesktopColumnDropPointerRegion',
    'resolveDesktopTaskEdgePosition',
    'selectNearestDesktopTaskGapCandidate',
    'collision:column-gap-nearest',
    'collision:column-append-outside-tail',
  ])
  && source.columnDropPolicy.includes('DESKTOP_COLUMN_APPEND_TAIL_ZONE_PX = 32')
  && source.intent.includes("orderingPosition?: 'before' | 'after'")
  && source.column.includes('data-kanban-column-append-anchor="true"')
  && source.preview.includes('data-kanban-column-append-anchor="true"'));

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length) process.exit(1);
