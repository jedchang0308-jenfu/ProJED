import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  board: 'src/components/BoardView.tsx',
  marker: 'src/components/Wbs/KanbanInsertionMarker.tsx',
  preview: 'src/components/Wbs/taskDrag/desktopTaskDropPreview.ts',
  browser: 'scripts/verify-dev-055-desktop-task-drag-target-clarity-browser.pw.js',
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
  'const fieldRect = getOriginFieldRect({',
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
  'bg-blue-500',
  'text-white',
  '<span className="truncate">{desktopIndicator.sourceTitle}</span>',
  '<KanbanInsertionMarker compact className="py-0" />',
]) && !source.marker.includes('emphasized'));

check('S06', 'source collision remains blocked and origin release cannot enter commit', hasAll(source.board, [
  "type: 'collision:source-block'",
  'return [];',
  'if (!canMoveTask || !over) return;',
]));

check('S07', 'cancel and end clear every origin session reference',
  (source.board.match(/desktopDragOriginIndicatorRef\.current = null/g) || []).length >= 2
  && (source.board.match(/desktopDragActivatorPointRef\.current = null/g) || []).length >= 2
  && (source.board.match(/setDesktopOriginIndicator\(null\)/g) || []).length >= 3);

check('S08', 'workbench source is excluded and mobile drag code is untouched',
  source.preview.includes("sourceSurfaceKind === 'workbench-unplaced-row'")
  && !/useTaskDragSession|TouchEvent|mobile-task-action-rail/.test(source.preview));

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

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length) process.exit(1);
