import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  board: 'src/components/BoardView.tsx',
  marker: 'src/components/Wbs/KanbanInsertionMarker.tsx',
  preview: 'src/components/Wbs/taskDrag/desktopTaskDropPreview.ts',
  target: 'src/components/Wbs/taskDrag/taskDragTargetAdapter.ts',
  session: 'src/components/Wbs/taskDrag/useTaskDragSession.ts',
  presenter: 'src/components/Wbs/taskDrag/TaskDragPresenter.tsx',
  originField: 'src/components/Wbs/taskDrag/TaskOriginTitleField.tsx',
  browser: 'scripts/verify-dev-055-desktop-task-drag-target-clarity-browser.pw.js',
  mobileBrowser: 'scripts/verify-dev-054-mobile-task-drag-precision-browser.pw.js',
  spec: 'ai-doc/specs/SPEC-058-desktop-drag-origin-insertion-feedback.md',
  qa: 'ai-doc/qa/QA-DEV-058-desktop-drag-origin-insertion-feedback.md',
  devTask: 'ai-doc/dev_task.md',
  map: 'ai-doc/documentation_map.md',
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

check('S01', 'DEV-058 documentation is linked',
  source.spec.includes('QA-DEV-058')
  && source.qa.includes('SPEC-058')
  && source.devTask.includes('SPEC-058-desktop-drag-origin-insertion-feedback.md')
  && source.devTask.includes('QA-DEV-058-desktop-drag-origin-insertion-feedback.md')
  && source.map.includes('SPEC-058-desktop-drag-origin-insertion-feedback.md'));

check('S02', 'origin field geometry reuses the desktop task title geometry path', hasAll(source.preview, [
  'export const resolveDesktopTaskOriginIndicator',
  'taskDragSourceKindToSurfaceKind(activeData?.type)',
  'const getTaskTitleElement = (',
  'export const resolveTaskOriginFieldRect = ({',
  'const fieldRect = resolveTaskOriginFieldRect({',
]));

check('S03', 'mouse movement gates the origin indicator to the captured source rect', hasAll(source.board, [
  'desktopDragActivatorPointRef',
  'const handleDragMove = (event: any) =>',
  'pointer.x >= sourceRect.left',
  'pointer.y >= sourceRect.top',
  'onDragMove={handleDragMove}',
]));

check('S04', 'origin feedback is explicit no-op metadata in the single fixed overlay', hasAll(source.board, [
  "position: 'origin' as const",
  "data-desktop-drop-origin={desktopIndicator.kind === 'origin' ? 'true' : undefined}",
  "data-desktop-drop-noop={desktopIndicator.kind === 'origin' ? 'true' : undefined}",
  'data-desktop-drop-indicator-layer="fixed-overlay"',
]) && (source.board.match(/data-desktop-drop-indicator="true"/g) || []).length === 1);

check('S05', 'origin feedback fills the exact title field blue while normal targets keep the existing marker', hasAll(source.board, [
  'data-desktop-origin-field="true"',
  '<TaskOriginTitleField',
  '<KanbanInsertionMarker compact className="py-0" />',
]) && hasAll(source.originField, [
  'bg-blue-500',
  'text-white',
  '<span className="truncate">{title}</span>',
]) && !source.marker.includes('emphasized'));

check('S06', 'source collision remains blocked and origin release cannot enter commit', hasAll(source.board, [
  "type: 'collision:source-block'",
  'return [];',
  'if (!canMoveTask) return;',
  'if (!over) return;',
]));

check('S07', 'cancel and end clear every origin session reference',
  (source.board.match(/desktopDragOriginIndicatorRef\.current = null/g) || []).length >= 2
  && (source.board.match(/desktopDragActivatorPointRef\.current = null/g) || []).length >= 2
  && (source.board.match(/setDesktopOriginIndicator\(null\)/g) || []).length >= 3);

check('S08', 'workbench source remains excluded from the shared origin geometry',
  source.preview.includes("sourceSurfaceKind === 'workbench-unplaced-row'")
  && source.target.includes("sourceSurfaceKind === 'workbench-unplaced-row'"));

check('S09', 'browser contract proves one blue title-field no-op state and zero writes', hasAll(source.browser, [
  "originIndicator.position === 'origin'",
  "originIndicator.feedbackKind === 'origin-field'",
  "originIndicator.fieldClassName.includes('bg-blue-500')",
  "originIndicator.fieldClassName.includes('text-white')",
  "originIndicator.fieldColor === 'rgb(255, 255, 255)'",
  'originIndicator.fieldText === beforeNodes[sourceId].title',
  'zero-write no-op',
]));

check('S10', 'DEV-058 verifier command is registered',
  source.packageJson.includes('"verify:dev-058-desktop-drag-origin-insertion-feedback"'));

check('S11', 'mobile origin remains a no-op observation and reuses the same title field', hasAll(source.target, [
  'resolveMobileTaskOriginFieldRect',
  'findMobileSourcePlaceholder',
  'originFieldRect,',
]) && hasAll(source.session, [
  'originFieldRect: state.originFieldRect',
  'originFieldRect: initialOriginFieldRect',
  'originFieldRect: null',
]) && hasAll(source.presenter, [
  'state.childIntentPhase !== \'armed\'',
  'state.originFieldRect',
  'sourceSurfaceKind',
  'data-mobile-drop-origin="true"',
  'data-mobile-drop-noop="true"',
  'data-mobile-origin-field="true"',
  '<TaskOriginTitleField',
]));

check('S12', 'mobile browser contract covers all source surfaces, feedback switching, and zero writes', hasAll(source.mobileBrowser, [
  'a checklist source origin must show one blue no-op title field and no insertion marker',
  'mobile card and column origins reuse the blue title-field feedback',
  'leaving origin for a valid target must restore only the existing insertion marker',
  'returning to the source must replace the normal marker with the blue origin field',
  'mobile action rail must take priority and clear origin feedback while hovered',
  'card and column origin releases must be zero-write no-ops',
]));

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length) process.exit(1);
