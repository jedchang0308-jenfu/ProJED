import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  types: 'src/components/Wbs/taskDrag/taskDragTypes.ts',
  intent: 'src/components/Wbs/taskDrag/taskDropIntent.ts',
  target: 'src/components/Wbs/taskDrag/taskDragTargetAdapter.ts',
  session: 'src/components/Wbs/taskDrag/useTaskDragSession.ts',
  commit: 'src/components/Wbs/taskDrag/taskDragCommit.ts',
  presenter: 'src/components/Wbs/taskDrag/TaskDragPresenter.tsx',
  panBroker: 'src/hooks/useMobilePanBroker.ts',
  context: 'src/components/Wbs/mobileTaskActionContext.ts',
  board: 'src/components/BoardView.tsx',
  card: 'src/components/Wbs/KanbanCard.tsx',
  checklist: 'src/components/Wbs/KanbanChecklist.tsx',
  column: 'src/components/Wbs/KanbanColumn.tsx',
  workbench: 'src/components/TaskWorkbenchPanel.tsx',
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

check('mobile and desktop commit use the same canonical resolver',
  (source.commit.match(/resolveTaskDropIntent\(/g) || []).length >= 2
  && source.intent.includes('export const resolveTaskDropIntent')
  && !source.target.includes('rect.top + rect.height / 2'));

check('explicit target surface kinds exist for card, checklist, and column',
  source.card.includes('data-task-drop-surface-kind="kanban-card"')
  && source.card.includes('data-mobile-task-card-primary="true"')
  && source.checklist.includes('data-task-drop-surface-kind="checklist-row"')
  && source.column.includes('data-task-drop-surface-kind="column-header"'));

check('mobile hit testing is exact, innermost-first, and blocks ancestor fall-through',
  source.target.includes('document.elementFromPoint(point.x, point.y)')
  && source.target.includes('The innermost task surface owns the point')
  && source.target.includes("sourceSurfaceKind === 'checklist-row' && domSurfaceKind === 'kanban-card'")
  && !source.target.includes('findNearestCandidate'));

check('target stability tracks lock, pending handover, and freshness', hasAll(source.types, [
  'lockedTargetRect', 'pendingTargetId', 'pendingSince', 'lastStableAt',
]) && hasAll(source.target, [
  'stabilizeCandidate', 'pointInsideTargetCore',
  'if (!withinRetainRegion)', 'MOBILE_RELEASE_FRESHNESS_MS',
]));

check('task drag owns touch movement after long press and pan broker yields', hasAll(source.panBroker, [
  'isTaskDragTouchActive', 'document.body.hasAttribute', 'move:task-drag-owner', 'reset();',
]));

check('release cannot fall back to a stale previous target',
  source.session.includes('withoutTarget(latestObservation)')
  && !source.session.includes("latestObservation.targetKind === 'none'\n      ? stateToObservation"));

check('normal mobile touchend is not prevented without an active drag',
  source.session.includes("if (stateRef.current?.phase !== 'dragging') return;\n    const point = readTaskTouchPoint(event);"));

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
  source.card.includes('data-kanban-drag-source-placeholder-neutral="true"')
  && !source.card.includes('showSourceInsertionMarker')
  && !source.checklist.includes('showSourceInsertionMarker')
  && !source.checklist.includes("import { KanbanInsertionMarker }")
  && source.presenter.includes('data-mobile-drop-indicator="true"'));

check('browser verifier covers finger-centered hit, single live indicator, pan ownership, boundary jitter, and deliberate handover', hasAll(source.browser, [
  'finger-centered point selects canonical same-parent order',
  'adjacent checklist boundary jitter keeps one stable target',
  'mobile checklist drag exposes only the live target indicator',
  'rapid multi-row movement cannot retain a stale indicator or use a tall card outer rect',
  'checklist source geometry cannot fall through to its expanded parent card',
  'a visible indicator must never remain on a target outside its retain region',
  'an invalid innermost source row must block fall-through to its ancestor card',
  'source placeholder must not render an insertion marker during mobile drag',
  'pan broker must not scroll the column after task drag owns the gesture',
  'jitterTargets.every',
  'deliberate movement to the second row must hand over within 100ms',
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

check('desktop approved presenter and collision path remain present', hasAll(source.board, [
  '<DragOverlay dropAnimation={null}>',
  'pointer-events-none translate-x-4 translate-y-4 rounded-lg',
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
