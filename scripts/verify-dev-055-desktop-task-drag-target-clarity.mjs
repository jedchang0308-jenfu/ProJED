import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  board: 'src/components/BoardView.tsx',
  card: 'src/components/Wbs/KanbanCard.tsx',
  checklist: 'src/components/Wbs/KanbanChecklist.tsx',
  column: 'src/components/Wbs/KanbanColumn.tsx',
  preview: 'src/components/Wbs/taskDrag/desktopTaskDropPreview.ts',
  intent: 'src/components/Wbs/taskDrag/taskDropIntent.ts',
  commit: 'src/components/Wbs/taskDrag/taskDragCommit.ts',
  workbench: 'src/components/TaskWorkbenchPanel.tsx',
  spec: 'ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md',
  qa: 'ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md',
  devTask: 'ai-doc/dev_task.md',
  map: 'ai-doc/documentation_map.md',
  browser: 'scripts/verify-dev-055-desktop-task-drag-target-clarity-browser.pw.js',
  packageJson: 'package.json',
};

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [
  key,
  existsSync(resolve(file)) ? readFileSync(resolve(file), 'utf8') : '',
]));
const results = [];
const check = (id, name, ok, details) => results.push({ id, name, ok: Boolean(ok), details });
const hasAll = (value, needles) => needles.every((needle) => value.includes(needle));

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
  'data-desktop-drop-target={desktopDropPreview.targetNodeId}',
  'data-desktop-drop-position={desktopDropPreview.displayPosition}',
  'data-desktop-drop-surface-kind={desktopDropPreview.targetSurfaceKind}',
  'data-desktop-drop-indicator-layer="fixed-overlay"',
]) && (source.board.match(/data-desktop-drop-indicator="true"/g) || []).length === 1);

check('S03', 'desktop preview and commit reuse the canonical intent resolver',
  source.preview.includes('resolveTaskDropIntent({')
  && source.preview.includes('export const resolveDesktopTaskDropIntent')
  && source.commit.includes('resolveDesktopTaskDropIntent({ activeData, targetData: overData')
  && source.board.includes('resolveDesktopTaskDropPreview({'));

check('S04', 'desktop source placeholders are neutral and cannot impersonate the live target',
  source.card.includes('data-kanban-drag-source-placeholder-neutral="true"')
  && source.column.includes('data-kanban-drag-source-placeholder-neutral="true"')
  && !source.checklist.includes('showSourceInsertionMarker')
  && !source.card.includes("import { KanbanInsertionMarker }")
  && !source.card.includes('<KanbanInsertionMarker')
  && !source.card.includes('showSourceInsertionMarker')
  && !source.column.includes('<KanbanInsertionMarker'));

check('S05', 'card primary geometry is shared without removing the mobile marker',
  source.card.includes('data-task-card-primary="true"')
  && source.card.includes('data-mobile-task-card-primary="true"')
  && source.preview.includes("'[data-task-card-primary=\"true\"]'"));

check('S06', 'exact innermost ownership blocks invalid ancestor fallback', hasAll(source.board, [
  'data-desktop-drop-surface="true"',
  'Exact innermost ownership',
  'return resolved ? [directCollision] : [];',
]) && source.preview.includes('if (!resolved) return null;'));

check('S07', 'approved desktop overlay and 8px mouse threshold remain intact', hasAll(source.board, [
  '<DragOverlay dropAnimation={null}>',
  'data-kanban-drag-overlay="true"',
  'translate-x-4 translate-y-4',
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

check('S12', 'desktop task drag indicator is overlay-only and does not create a layout marker',
  source.board.includes('className="pointer-events-none fixed z-[86] -translate-y-1/2"')
  && source.card.includes('data-desktop-dropzone-layout="overlay"')
  && source.card.includes("showChecklistAppendSurface ? 'z-20' : '-z-10 pointer-events-none'")
  && !source.card.includes("showChecklistDropZone ? 'h-6 opacity-100'")
  && !source.card.includes('data-kanban-insertion-marker="true"'));

check('S13', 'desktop task drag freezes sortable displacement while keeping the approved overlay',
  hasAll(source.card, [
    'freezeDesktopTaskLayout',
    "['wbs-card', 'wbs-checklist'].includes(activeType || '')",
    'transform: freezeDesktopTaskLayout ? undefined : CSS.Transform.toString(transform)',
  ])
  && hasAll(source.checklist, [
    'useDndContext',
    'freezeDesktopTaskLayout',
    'transform: freezeDesktopTaskLayout ? undefined : CSS.Transform.toString(transform)',
  ])
  && hasAll(source.board, [
    'DESKTOP_INDICATOR_RECT_RETAIN_PX',
    'shouldRetainDesktopIndicatorRect',
    'indicatorRect: currentPreview.indicatorRect',
  ]));

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length) process.exit(1);
