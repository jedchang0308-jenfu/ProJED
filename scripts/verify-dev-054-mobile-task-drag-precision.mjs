import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  types: 'src/components/Wbs/taskDrag/taskDragTypes.ts',
  intent: 'src/components/Wbs/taskDrag/taskDropIntent.ts',
  target: 'src/components/Wbs/taskDrag/taskDragTargetAdapter.ts',
  session: 'src/components/Wbs/taskDrag/useTaskDragSession.ts',
  gesturePolicy: 'src/components/Wbs/taskDrag/taskGesturePolicy.ts',
  gestureSurface: 'src/components/Wbs/taskDrag/useTaskGestureSurface.ts',
  dragSensors: 'src/hooks/useDragSensors.ts',
  commit: 'src/components/Wbs/taskDrag/taskDragCommit.ts',
  presenter: 'src/components/Wbs/taskDrag/TaskDragPresenter.tsx',
  originField: 'src/components/Wbs/taskDrag/TaskOriginTitleField.tsx',
  originPreview: 'src/components/Wbs/taskDrag/desktopTaskDropPreview.ts',
  panBroker: 'src/hooks/useMobilePanBroker.ts',
  context: 'src/components/Wbs/mobileTaskActionContext.ts',
  board: 'src/components/BoardView.tsx',
  card: 'src/components/Wbs/KanbanCard.tsx',
  checklist: 'src/components/Wbs/KanbanChecklist.tsx',
  column: 'src/components/Wbs/KanbanColumn.tsx',
  workbench: 'src/components/TaskWorkbenchPanel.tsx',
  css: 'src/index.css',
  spec: 'ai-doc/specs/SPEC-054-mobile-task-drag-precision.md',
  qa: 'ai-doc/qa/QA-DEV-054-mobile-task-drag-precision.md',
  browser: 'scripts/verify-dev-054-mobile-task-drag-precision-browser.pw.js',
  packageJson: 'package.json',
};

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [
  key,
  existsSync(resolve(file)) ? readFileSync(resolve(file), 'utf8') : '',
]));
const results = [];
const check = (name, ok, details) => results.push({ name, ok: Boolean(ok), details });
const hasAll = (value, needles) => needles.every((needle) => value.includes(needle));

Object.entries(files).forEach(([key, file]) => check(`file exists:${key}`, existsSync(resolve(file)), file));

check('mobile engineering constants match the stabilized targeting contract', hasAll(source.target, [
  'MOBILE_PREVIEW_FINGER_CLEARANCE_PX = 12',
  'MOBILE_TARGET_RETAIN_PX = 12',
  'MOBILE_TARGET_CORE_MAX_INSET_PX = 12',
  'MOBILE_TARGET_CORE_HEIGHT_RATIO = 0.34',
  'MOBILE_RELEASE_FRESHNESS_MS = 120',
  'EDGE_SCROLL_MAX_STEP_PX = 3',
]));

check('task intent and action hit testing use the raw finger point',
  source.target.indexOf("closest('[data-mobile-task-action]')") < source.target.indexOf('const intentPoint = getTaskIntentPoint(point)')
  && source.target.includes('y: rawPoint.y'));

check('mobile and desktop preview and commit use the same canonical outcome resolver',
  source.target.includes('resolveTaskDropOutcome({')
  && source.originPreview.includes('resolveTaskDropOutcome({')
  && source.commit.includes('resolveTaskDropOutcome({')
  && source.intent.includes('export const resolveTaskDropOutcome')
  && !source.target.includes('rect.top + rect.height / 2'));

check('explicit target surface kinds exist for card, checklist, and column',
  source.card.includes('data-task-drop-surface-kind="kanban-card"')
  && source.card.includes('data-mobile-task-card-primary="true"')
  && source.checklist.includes('data-task-drop-surface-kind="checklist-row"')
  && source.column.includes('data-task-drop-surface-kind="column-header"')
  && /data-mobile-pan-surface="kanban-column"[\s\S]*?data-mobile-drop-target=\{nodeId\}[\s\S]*?data-task-drop-surface-kind="column-drop"/.test(source.column));

check('mobile container surfaces own their geometry instead of borrowing the first descendant task',
  source.target.includes("surfaceKind === 'column-drop'")
  && source.target.includes("surfaceKind === 'root-drop'")
  && source.target.includes("surfaceKind === 'checklist-drop'")
  && source.target.includes('containerOwnsGeometry'));

check('mobile hit testing is exact, title-child-first, innermost-first, and blocks ancestor fall-through',
  source.target.includes('document.elementFromPoint(point.x, point.y)')
  && source.target.includes('The innermost task surface owns the point')
  && source.target.includes('resolveTaskTitleChildDropTarget({')
  && source.target.indexOf('resolveTaskTitleChildDropTarget({') < source.target.indexOf('collectDirectCandidates(intentPoint, state)')
  && !source.target.includes('findNearestCandidate'));

check('target stability tracks lock, pending handover, and freshness', hasAll(source.types, [
  'lockedTargetRect', 'pendingTargetId', 'pendingSince', 'lastStableAt',
]) && hasAll(source.target, [
  'stabilizeCandidate', 'pointInsideTargetCore',
  'if (!withinRetainRegion)', 'MOBILE_RELEASE_FRESHNESS_MS',
]) && source.session.includes('Date.now() - releaseObservation.lastStableAt <= MOBILE_RELEASE_FRESHNESS_MS')
  && !source.target.includes('now - state.lastStableAt <= MOBILE_RELEASE_FRESHNESS_MS'));

check('task drag owns touch movement after long press and pan broker yields', hasAll(source.panBroker, [
  'isTaskDragTouchActive', 'document.body.hasAttribute', 'task-drag-owner',
]) && source.panBroker.includes('reset('));

check('actual touch owns the dedicated drag session independently of viewport width',
  source.gestureSurface.includes('if (mobileActionEnabled && sourceKind)')
  && !source.gestureSurface.includes('if (isMobileTaskActionMode() && mobileActionEnabled && sourceKind)')
  && !source.session.includes('if (!isMobileTaskActionMode()) return false;')
  && !source.dragSensors.includes('TouchSensor'));

check('every eligible task long-press surface suppresses native selection and iOS callout from touchstart',
  hasAll(source.css, [
    '[data-task-touch-gesture-surface="true"]',
    '-webkit-touch-callout: none;',
    '-webkit-user-select: none;',
    'user-select: none;',
    ':is(input, textarea, [contenteditable="true"])',
  ])
  && hasAll(source.column, ['data-task-touch-gesture-surface=', 'taskGesture.touchGestureEnabled'])
  && hasAll(source.card, ['data-task-touch-gesture-surface=', 'taskGesture.touchGestureEnabled'])
  && hasAll(source.checklist, ['data-task-touch-gesture-surface=', 'taskGesture.touchGestureEnabled'])
  && hasAll(source.workbench, ['data-task-touch-gesture-surface=', 'touchGestureEnabled={taskGesture.touchGestureEnabled}']));

check('Workbench keeps native pan while only eligible unplaced rows receive touch ownership',
  source.workbench.includes("sourceKind: 'workbench-unplaced-row'")
  && source.workbench.includes('sourceKind: null')
  && source.workbench.includes('mobileActionEnabled: false')
  && !source.css.includes('[data-task-touch-gesture-surface="true"] {\n  touch-action: none;'));

const workbenchChildGuard = source.target.indexOf("if (state.source.kind !== 'workbench-unplaced-row')");
const invalidChildZoneReturn = source.target.indexOf('if (childZone) return observation;', workbenchChildGuard);
const workbenchDirectCandidate = source.target.indexOf('const directCandidate = collectDirectCandidates(intentPoint, state)[0] || null;', invalidChildZoneReturn);
check('Workbench unplaced rows can resolve direct board targets without enabling child-drop intent',
  workbenchChildGuard >= 0
  && invalidChildZoneReturn > workbenchChildGuard
  && workbenchDirectCandidate > invalidChildZoneReturn);

check('release cannot fall back to a stale previous target',
  source.session.includes('withoutTarget(latestObservation)')
  && !source.session.includes("latestObservation.targetKind === 'none'\n      ? stateToObservation"));

check('normal mobile touchend is not prevented without an active drag',
  /if \(stateRef\.current\?\.phase !== 'dragging'\) return;\r?\n\s+const point = readTaskTouchPoint\(event\);/.test(source.session));

check('long press release arms a directly tappable action rail', hasAll(source.session, [
  "phase: 'armed'", "type: 'end:armed'", 'activateAction', "cancelWithReason('armed-outside-tap')",
]) && hasAll(source.presenter, [
  'onClick={(event) => {', 'onAction(item.key)', 'data-mobile-task-action-rail-mode={state.phase}',
]));

check('preview remains finger-coupled and preserves z-order',
  source.presenter.includes('MOBILE_PREVIEW_FINGER_CLEARANCE_PX')
  && source.presenter.includes('data-mobile-preview-anchor="finger"')
  && !source.presenter.includes('MOBILE_PREVIEW_INDICATOR_GAP_PX')
  && source.presenter.includes('z-[80]')
  && source.presenter.includes('z-[90]')
  && source.presenter.includes('z-[95]'));

check('mobile source placeholders do not impersonate the live drop indicator',
  source.card.includes('data-kanban-drag-source-placeholder={isDragPlaceholder')
  && source.card.includes('kanban-drag-origin-placeholder')
  && !source.card.includes('showSourceInsertionMarker')
  && !source.checklist.includes('showSourceInsertionMarker')
  && !source.checklist.includes("import { KanbanInsertionMarker }")
  && source.presenter.includes('data-mobile-drop-indicator="true"'));

check('mobile source lookup keeps placement identity across nested source surfaces',
  source.target.includes('data-task-surface-frame="true"][data-task-placement-id]')
  && source.target.includes('owningPlacement === placementId'));

check('mobile source origin is a shared blue no-op title field outside normal flow', hasAll(source.target, [
  'resolveMobileTaskOriginFieldRect',
  'findMobileSourcePlaceholder',
  'originFieldRect,',
  "candidate.outcomeKind === 'move' ? candidate.indicatorRect : null",
  "candidate.outcomeKind === 'origin' ? candidate.originFieldRect : null",
]) && hasAll(source.presenter, [
  'data-mobile-drop-origin="true"',
  'data-mobile-drop-noop="true"',
  'data-mobile-origin-field="true"',
  'data-mobile-drop-feedback-layer="fixed-overlay"',
]) && hasAll(source.originField, [
  'bg-blue-500',
  'text-white',
]) && source.originPreview.includes('export const resolveTaskOriginFieldRect'));

check('browser verifier covers non-center raw-finger hit, single live indicator, pan ownership, boundary jitter, and deliberate handover', hasAll(source.browser, [
  'non-center raw finger point selects the explicit same-parent boundary',
  'adjacent checklist boundary jitter keeps one stable target',
  'mobile checklist drag exposes only the live target indicator',
  'rapid multi-row movement cannot retain a stale indicator or use a title-only boundary',
  'checklist source geometry cannot fall through to its expanded parent card',
  'a visible indicator must never remain on a target outside its retain region',
  'an invalid innermost source row must block fall-through to its ancestor card',
  'source placeholder must not render an insertion marker during mobile drag',
  'pan broker must not scroll the column after task drag owns the gesture',
  'jitterTargets.every',
  'deliberate movement to the second row must hand over within 100ms',
  'a checklist source origin must show one blue no-op title field and no insertion marker',
  'mobile card and column origins reuse the blue title-field feedback',
  'origin title field must fit the viewport',
  'mobile action rail must take priority and clear origin feedback while hovered',
  'card and column origin releases must be zero-write no-ops',
  'every kanban task level owns native selection before long press activates',
  '500ms and 8px gesture boundaries separate tap pan and drag',
  'actual touch starts the dedicated drag session above the old 768px width gate',
  'Workbench unplaced rows drag into the inline board while placed rows stay non-draggable',
]));

const placedStart = source.workbench.indexOf('const WorkbenchPlacedReadOnlyCard');
const placedEnd = source.workbench.indexOf('const WorkbenchDragCard:', placedStart);
const placedSource = source.workbench.slice(placedStart, placedEnd);
check('workbench placed row remains non-draggable',
  placedStart >= 0
  && placedSource.includes('sourceKind: null')
  && placedSource.includes('mobileActionEnabled: false')
  && placedSource.includes('canUseDragSurface={false}')
  && !placedSource.includes('useDraggable('));

check('desktop presenter keeps its collision path while honoring the latest half-scale pointer attachment', hasAll(source.board, [
  '<DragOverlay dropAnimation={null}>{null}</DragOverlay>',
  'resolvePointerUpperRightOverlayPosition',
  'pointer-events-none fixed z-[93] flex h-10 origin-top-left items-center gap-2 rounded-lg',
  'data-task-drag-overlay-scale={DESKTOP_TASK_DRAG_OVERLAY_SCALE}',
  'collisionDetection={collisionDetection}',
]));

check('DEV-054 static and browser commands are registered',
  source.packageJson.includes('"verify:dev-054-mobile-task-drag-precision"')
  && source.packageJson.includes('"verify:dev-054-mobile-task-drag-precision-browser"'));

check('QA retains the required iOS and Android physical completion gate',
  source.qa.includes('iOS') && source.qa.includes('Android')
  && source.qa.includes('各 50') && source.qa.includes('wrong commit')
  && source.spec.includes('required completion gate'));

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length) process.exit(1);
