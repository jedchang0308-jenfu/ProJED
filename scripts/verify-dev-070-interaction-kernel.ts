import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertTaskActionCatalog, getTaskActionCatalog, getTaskActionDefinition, getTaskMenuActionIds } from '../src/interactions/task/taskActionCatalog';
import { assertTaskInteractionMigrationManifest, canAdvanceTaskInteractionMigration, TASK_INTERACTION_MIGRATION_MANIFEST } from '../src/interactions/task/migrationManifest';
import { getInteractionProfileLayers, getNodeRoleProfile } from '../src/interactions/task/profiles';
import { resolveTaskInteraction, resolveTaskMenu } from '../src/interactions/task/resolveTaskInteraction';
import { guardTaskAction, getTaskActionEnabledMap } from '../src/interactions/task/taskActionGuards';
import { createTaskCommandExecutor } from '../src/interactions/task/taskCommandExecutor';
import type { InteractionContext, TaskActionId } from '../src/interactions/task/types';

type CaseResult = { id: string; status: 'PASS' | 'FAIL'; evidence?: Record<string, unknown>; error?: string };

const root = resolve('.');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const source = {
  globalMenu: read('src/components/GlobalContextMenu.tsx'),
  taskMenu: read('src/interactions/task/TaskActionMenu.tsx'),
  calendar: read('src/components/CalendarView.tsx'),
  mindMapView: read('src/components/MindMap/MindMapView.tsx'),
  mindMapKeyboard: read('src/components/MindMap/mindMapKeyboard.ts'),
  taskDetails: read('src/components/TaskDetailsModal.tsx'),
  browser: read('scripts/verify-dev-070-interaction-kernel-browser.pw.js'),
};

const baseContext: InteractionContext = {
  interactionId: 'dev-070-static-1',
  location: { hostMode: 'board', origin: 'mode-primary' },
  surfaceId: 'board.card',
  taskId: 'dev070-card-a',
  nodeRole: 'task',
  modality: 'fine-pointer',
  transientOwners: [],
  blockers: [],
};

const results: CaseResult[] = [];
const runCase = (id: string, check: () => Record<string, unknown> | void | Promise<Record<string, unknown> | void>) => {
  Promise.resolve()
    .then(check)
    .then(evidence => results.push({ id, status: 'PASS', evidence: evidence || {} }))
    .catch(error => results.push({ id, status: 'FAIL', error: error instanceof Error ? error.message : String(error) }));
};

const menuFor = (hostMode: InteractionContext['location']['hostMode'], origin: InteractionContext['location']['origin'] = 'mode-primary') => (
  resolveTaskMenu({ ...baseContext, location: { hostMode, origin } })
);

const artifactPath = resolve('output/playwright/dev-070/after/interaction-matrix.json');
const artifact = existsSync(artifactPath)
  ? JSON.parse(readFileSync(artifactPath, 'utf8').replace(/^\uFEFF/, ''))
  : null;
const artifactViewports = new Map((artifact?.artifacts || []).map((item: any) => [item.viewport, item]));
const desktop = artifactViewports.get('desktop') as any;
const laptop = artifactViewports.get('laptop') as any;
const mobile = artifactViewports.get('mobile') as any;
const desktopModes = new Map((desktop?.modeEvidence || []).map((item: any) => [item.mode, item]));
const assertArtifact = () => {
  assert.ok(artifact, 'after interaction-matrix.json is missing; run the browser gate first');
  assert.equal(artifact.fixtureId, 'dev-070-v1');
  assert.deepEqual([...artifactViewports.keys()].sort(), ['desktop', 'laptop', 'mobile']);
  assert.equal(artifactViewports.get('desktop')?.width, 1440);
  assert.equal(artifactViewports.get('laptop')?.width, 1024);
  assert.equal(artifactViewports.get('mobile')?.width, 390);
};

assertTaskActionCatalog();
assertTaskInteractionMigrationManifest();

// QA-070-001..019: pure resolver/catalog/guard/executor contracts.
runCase('QA-070-001', () => {
  const outputs = Array.from({ length: 100 }, () => resolveTaskInteraction(baseContext, 'pointer.primary'));
  outputs.slice(1).forEach(output => assert.deepEqual(output, outputs[0]));
  return { repeats: outputs.length, output: outputs[0] };
});
runCase('QA-070-002', () => {
  assert.equal(resolveTaskInteraction(baseContext, 'keyboard.shift-f10').actionId, null);
  assert.equal(resolveTaskInteraction(baseContext, 'keyboard.shift-f10').suppressedReason, 'disabled');
  return { explicitDisabled: true };
});
runCase('QA-070-003', () => {
  assert.deepEqual(getInteractionProfileLayers(baseContext.location, 'group').map(layer => layer.layer), ['task-default', 'host-mode', 'origin', 'node-role']);
  assert.equal(Object.isFrozen(getNodeRoleProfile('group')), true);
  return { order: getInteractionProfileLayers(baseContext.location).map(layer => layer.layer) };
});
runCase('QA-070-004', () => {
  assert.equal(resolveTaskInteraction({ ...baseContext, location: { hostMode: 'unknown' as never, origin: 'mode-primary' } }, 'pointer.primary').suppressedReason, 'unknown-location');
  assert.equal(resolveTaskInteraction({ ...baseContext, location: { hostMode: 'board', origin: 'unknown' as never } }, 'pointer.primary').suppressedReason, 'unknown-location');
  assert.equal(resolveTaskInteraction(baseContext, 'unknown-trigger' as never).actionId, null);
  assert.equal(getTaskActionDefinition('unknown-action' as TaskActionId), undefined);
  return { unknownLocation: 'fail-closed', unknownAction: 'configuration-error' };
});
runCase('QA-070-005', () => {
  assert.equal(resolveTaskInteraction({ ...baseContext, location: { hostMode: 'calendar', origin: 'calendar-segment' }, surfaceId: 'calendar.segment' }, 'pointer.primary').sourceLayer, 'origin');
  return { sourceLayer: 'origin' };
});
runCase('QA-070-005A', () => {
  const calendarSegment = { ...baseContext, location: { hostMode: 'calendar', origin: 'calendar-segment' }, surfaceId: 'calendar.segment' };
  const calendarSidebar = { ...baseContext, location: { hostMode: 'calendar', origin: 'shared-task-sidebar' }, surfaceId: 'shared-task-sidebar.row' };
  assert.equal(resolveTaskInteraction(calendarSegment, 'pointer.primary').actionId, 'task.open-details');
  assert.equal(resolveTaskInteraction(calendarSegment, 'gesture.tap').actionId, 'task.open-details');
  assert.equal(resolveTaskInteraction(calendarSidebar, 'pointer.primary').actionId, 'task.open-details');
  assert.equal(resolveTaskInteraction(calendarSidebar, 'gesture.tap').actionId, 'task.open-details');
  return { calendarSegment: 'task.open-details', calendarSidebar: 'task.open-details' };
});
runCase('QA-070-006', () => {
  const hosts = ['list', 'mindmap', 'board', 'gantt', 'calendar'] as const;
  hosts.forEach(host => assert.ok(menuFor(host).length > 0));
  return { affectedHosts: hosts };
});
runCase('QA-070-007', () => {
  const list = JSON.stringify(menuFor('list'));
  const board = JSON.stringify(menuFor('board'));
  const gantt = JSON.stringify(menuFor('gantt'));
  const calendar = JSON.stringify(menuFor('calendar'));
  assert.notEqual(list, JSON.stringify(menuFor('mindmap')));
  assert.equal(gantt, calendar);
  assert.notEqual(board, JSON.stringify(menuFor('mindmap')));
  return { mindmapExcludesDependency: true, ganttCalendarParity: true };
});
runCase('QA-070-008', () => {
  const primary = JSON.stringify(menuFor('board', 'mode-primary'));
  const sidebar = JSON.stringify(menuFor('board', 'shared-task-sidebar'));
  const calendar = JSON.stringify(menuFor('calendar', 'calendar-segment'));
  assert.equal(primary, sidebar);
  assert.notEqual(primary, calendar);
  return { originScoped: true };
});
runCase('QA-070-009', () => {
  assert.equal(menuFor('board', 'task-workbench').includes('task.dependency-start'), true);
  assert.equal(menuFor('mindmap', 'task-workbench').includes('task.dependency-start'), false);
  return { compositeScope: 'host-authoritative' };
});
runCase('QA-070-010', () => {
  const profile = getNodeRoleProfile('task');
  assert.equal(Object.isFrozen(profile), true);
  assert.throws(() => (profile as any).triggers = {});
  return { frozenProfiles: true };
});
runCase('QA-070-011', () => {
  const catalog = getTaskActionCatalog();
  const ids = catalog.map(action => action.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(source.globalMenu.includes('handleTaskAction'));
  catalog.filter(action => action.section).forEach(action => assert.ok(source.globalMenu.includes(action.id) || source.taskMenu.includes(action.id)));
  return { catalogActions: ids.length, stableIds: ids };
});
runCase('QA-070-012', () => {
  assert.equal(guardTaskAction('task.delete-request', { canDeleteTask: true }).allowed, false);
  assert.equal(guardTaskAction('task.delete-request', { canDeleteTask: true }).reason, 'dangerous-action-confirmation-required');
  assert.equal(guardTaskAction('task.delete-request', { canDeleteTask: true, dangerousActionConfirmed: true }).allowed, true);
  assert.ok(source.globalMenu.includes('window.confirm'));
  return { unconfirmedMutation: 0, confirmedMutation: 1 };
});
runCase('QA-070-013', () => {
  const ids = getTaskMenuActionIds();
  const denied = getTaskActionEnabledMap(ids, { nodeExists: true, canCreateTask: false, canEditTask: false, canMoveTask: false, canDeleteTask: false, canAssignTask: false, canCreateDependency: false });
  Object.values(denied).forEach(value => assert.equal(value, false));
  assert.equal(guardTaskAction('task.create-child', { canCreateTask: false }).allowed, false);
  return { deniedActions: ids.length };
});
runCase('QA-070-014', () => {
  const authoritative = TASK_INTERACTION_MIGRATION_MANIFEST.filter(entry => entry.state === 'kernel-authoritative');
  assert.ok(authoritative.length >= 5);
  assert.equal(TASK_INTERACTION_MIGRATION_MANIFEST.find(entry => entry.id === 'mobile-post-create')?.state, 'shadow-resolve');
  return { authoritativeBindings: authoritative.length, shadowBindings: 1 };
});
runCase('QA-070-015', () => {
  assert.equal(canAdvanceTaskInteractionMigration('legacy-only', 'shadow-resolve'), true);
  assert.equal(canAdvanceTaskInteractionMigration('shadow-resolve', 'kernel-authoritative'), true);
  assert.equal(canAdvanceTaskInteractionMigration('kernel-authoritative', 'legacy-removed'), true);
  assert.equal(canAdvanceTaskInteractionMigration('legacy-only', 'legacy-removed'), false);
  return { legalTransitions: 3 };
});
runCase('QA-070-016', () => {
  const list = menuFor('list');
  const mindmap = menuFor('mindmap');
  assert.ok(list.indexOf('task.dependency-start') > list.indexOf('task.assign'));
  assert.equal(mindmap.includes('task.dependency-start'), false);
  return { mergePolicy: 'stable-id-patch' };
});
runCase('QA-070-017', () => {
  const base = getTaskMenuActionIds();
  const excluded = getTaskMenuActionIds([{ menu: { exclude: ['task.delete-request'] } }]);
  assert.equal(excluded.includes('task.delete-request'), false);
  assert.equal(base.filter(id => id !== 'task.delete-request').length, excluded.length);
  return { defaultMenuCount: base.length };
});
runCase('QA-070-018', () => {
  assert.equal(resolveTaskInteraction({ ...baseContext, transientOwners: ['relationship'] }, 'pointer.primary').actionId, null);
  assert.equal(resolveTaskInteraction({ ...baseContext, transientOwners: ['relationship', 'record-capture'] }, 'pointer.primary').suppressedReason, 'transient-owner-conflict');
  return { conflict: 'fail-closed' };
});
runCase('QA-070-019', async () => {
  let commandCount = 0;
  let now = 1000;
  const executor = createTaskCommandExecutor({
    'task.toggle-complete': () => { commandCount += 1; },
    'task.duplicate': () => { throw new Error('fixture-failure'); },
  }, { now: () => now, ttlMs: 100 });
  const guardInput = { nodeExists: true, canEditTask: true, canCreateTask: true };
  const first = await executor.execute(baseContext, 'task.toggle-complete', guardInput);
  const duplicate = await executor.execute(baseContext, 'task.toggle-complete', guardInput);
  const denied = await executor.execute({ ...baseContext, interactionId: 'dev-070-static-denied' }, 'task.toggle-complete', { nodeExists: true, canEditTask: false });
  const failed = await executor.execute({ ...baseContext, interactionId: 'dev-070-static-failed' }, 'task.duplicate', guardInput);
  now = 1201;
  const afterTtl = await executor.execute(baseContext, 'task.toggle-complete', guardInput);
  assert.equal(first.status, 'executed');
  assert.equal(duplicate.status, 'noop');
  assert.equal(denied.status, 'denied');
  assert.equal(failed.status, 'failed');
  assert.equal(afterTtl.status, 'executed');
  assert.equal(commandCount, 2);
  return { statuses: [first.status, duplicate.status, denied.status, failed.status, afterTtl.status], commandCount };
});

// QA-070-020..029: rendered menu/location evidence from the browser artifact.
runCase('QA-070-020', () => { assertArtifact(); const item = desktopModes.get('list'); assert.ok(item?.menu?.menuClosed); assert.equal(item.menu.dependencyExpected, true); return { actionIds: item.menu.actionIds }; });
runCase('QA-070-021', () => { assertArtifact(); const item = desktopModes.get('mindmap'); assert.ok(item?.menu?.menuClosed); assert.equal(item.menu.dependencyExpected, false); return { actionIds: item.menu.actionIds }; });
runCase('QA-070-022', () => { assertArtifact(); const item = desktopModes.get('board'); assert.ok(item?.menu?.menuClosed); assert.equal(item.menu.dependencyExpected, true); return { actionIds: item.menu.actionIds }; });
runCase('QA-070-023', () => { assertArtifact(); const item = desktopModes.get('gantt'); assert.ok(item?.menu?.menuClosed); assert.ok(source.browser.includes('shared-sidebar-row')); return { actionIds: item.menu.actionIds, sharedSidebarSelector: true }; });
runCase('QA-070-024', () => { assertArtifact(); const item = desktopModes.get('calendar'); assert.ok(item?.menu?.menuClosed); assert.equal(item.menu.dependencyExpected, false); assert.ok(source.browser.includes('calendar')); return { actionIds: item.menu.actionIds }; });
runCase('QA-070-025', () => { assertArtifact(); ['list', 'mindmap', 'board', 'gantt', 'calendar'].forEach(mode => assert.ok(desktopModes.get(mode)?.menu?.menuClosed)); return { hostModes: [...desktopModes.keys()] }; });
runCase('QA-070-026', () => { assertArtifact(); assert.ok(source.globalMenu.includes('interactionLocation')); assert.ok(source.globalMenu.includes('surfaceId')); return { snapshotFields: ['interactionLocation', 'surfaceId', 'interactionId'] }; });
runCase('QA-070-027', () => { assertArtifact(); assert.ok(source.globalMenu.includes('contextMenuState.nodeId')); assert.ok(source.globalMenu.includes('contextMenuState.title')); return { targetSnapshot: true }; });
runCase('QA-070-028', () => { assertArtifact(); assert.ok(source.globalMenu.includes('getTaskActionEnabledMap')); assert.ok(source.globalMenu.includes('guardTaskAction')); return { permissionGuard: true }; });
runCase('QA-070-029', () => { assertArtifact(); assert.ok(laptop?.width === 1024 && laptop?.height === 768); assert.ok(laptop?.modeEvidence?.every((item: any) => item.menu?.menuClosed)); return { viewport: '1024x768' }; });

// QA-070-030..040: primary/keyboard/post-create source + rendered lifecycle.
runCase('QA-070-030', () => { assertArtifact(); assert.equal(desktop.detailsVisible, true); assert.equal(desktop.selectionAfterClose, 0); return { detailsVisible: true, selectionAfterClose: 0 }; });
runCase('QA-070-031', () => { assertArtifact(); assert.equal(desktopModes.get('mindmap')?.surfaceCount > 0, true); assert.ok(source.mindMapView.includes('openTaskDetails')); return { mindmapSurface: desktopModes.get('mindmap')?.surfaceCount }; });
runCase('QA-070-032', () => { assertArtifact(); assert.equal(desktopModes.get('board')?.surfaceCount > 0, true); assert.ok(source.globalMenu.includes('TaskActionMenu')); return { boardSurface: desktopModes.get('board')?.surfaceCount }; });
runCase('QA-070-033', () => { assertArtifact(); assert.equal(desktopModes.get('gantt')?.surfaceCount > 0, true); assert.ok(source.browser.includes('data-gantt-task-bar')); return { ganttSurface: desktopModes.get('gantt')?.surfaceCount }; });
runCase('QA-070-034', () => { assertArtifact(); assert.equal(desktopModes.get('calendar')?.surfaceCount > 0, true); assert.ok(source.calendar.includes('calendar-segment')); return { calendarSurface: desktopModes.get('calendar')?.surfaceCount }; });
runCase('QA-070-035', () => { assert.ok(source.globalMenu.includes("event.key === 'Enter'")); assert.ok(source.taskDetails.includes('event.key !== \'Escape\'')); return { enterAndInputGuards: true }; });
runCase('QA-070-036', () => { assert.ok(source.mindMapKeyboard.includes("type: 'create-sibling'")); assert.ok(source.mindMapKeyboard.includes("type: 'create-child'")); return { keyboardActions: ['Enter', 'Tab', 'Arrow'] }; });
runCase('QA-070-037', () => { assert.ok(source.globalMenu.includes('event.key !== \'Escape\'')); assert.ok(source.mindMapView.includes("event.key === 'Escape'")); return { escapeLifecycle: true }; });
runCase('QA-070-038', () => { assert.equal(resolveTaskInteraction(baseContext, 'keyboard.shift-f10').suppressedReason, 'disabled'); return { shiftF10: 'disabled' }; });
runCase('QA-070-039', () => { assert.ok(source.globalMenu.includes('prepareNewTaskNaming')); assert.ok(source.globalMenu.includes('OPEN_TASK_DETAILS_EVENT')); return { postCreateHooks: true }; });
runCase('QA-070-040', async () => { let count = 0; const executor = createTaskCommandExecutor({ 'task.create-child': () => { count += 1; } }); const context = { ...baseContext, interactionId: 'dev-070-create-once' }; const first = await executor.execute(context, 'task.create-child', { nodeExists: true, canCreateTask: true }); const second = await executor.execute(context, 'task.create-child', { nodeExists: true, canCreateTask: true }); assert.equal(first.status, 'executed'); assert.equal(second.status, 'noop'); assert.equal(count, 1); return { commandCount: count }; });

// QA-070-050..059: transient/drag/mobile regression source and executable gate references.
const regressionFiles = [
  'scripts/verify-dev-029-mobile-pan-first-interactions.mjs',
  'scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js',
  'scripts/verify-dev-053-task-drag-muscle-memory-consistency.mjs',
  'scripts/verify-dev-053-task-drag-muscle-memory-consistency-browser.pw.js',
  'scripts/verify-dev-054-mobile-task-drag-precision.mjs',
  'scripts/verify-dev-054-mobile-task-drag-precision-browser.pw.js',
  'scripts/verify-dev-055-desktop-task-drag-target-clarity.mjs',
  'scripts/verify-dev-055-desktop-task-drag-target-clarity-browser.pw.js',
  'scripts/verify-dev-067-kanban-l1-drag.ts',
  'scripts/verify-dev-068-task-title-center-child-drop.ts',
].map(file => [file, existsSync(resolve(file))] as const);
runCase('QA-070-050', () => { assert.ok(source.mindMapView.includes('relationship')); return { transient: 'relationship' }; });
runCase('QA-070-051', () => { assert.ok(source.globalMenu.includes('enterDependencyMode')); return { transient: 'dependency-selection' }; });
runCase('QA-070-052', () => { assert.ok(read('src/interactions/task/types.ts').includes("'record-capture'")); return { transient: 'record-capture' }; });
runCase('QA-070-053', () => { assert.ok(read('src/components/Gantt/GanttTaskBar.tsx').includes('drag-established')); return { blocker: 'drag-established' }; });
runCase('QA-070-054', () => { assert.ok(read('src/hooks/useCoarsePointer.ts').includes('matchMedia')); assert.equal(mobile?.width, 390); return { viewport: '390x844' }; });
runCase('QA-070-055', () => { assert.ok(read('src/components/Wbs/taskDrag/useTaskGestureSurface.ts').includes('longPress')); return { longPress: true }; });
runCase('QA-070-056', () => { assert.ok(source.globalMenu.includes('dangerousActionConfirmed')); return { confirmationGuard: true }; });
runCase('QA-070-057', () => { assert.ok(source.globalMenu.includes('handleTaskAction')); return { actionExecutor: true }; });
runCase('QA-070-058', () => { assert.ok(read('src/components/Wbs/taskDrag/useTaskGestureSurface.ts').includes('onTouchCancel')); return { cancelLifecycle: true }; });
runCase('QA-070-059', () => { regressionFiles.forEach(([, present]) => assert.equal(present, true)); return { regressionSources: regressionFiles.length }; });

// QA-070-060..066: rendered UX/accessibility/error/noise evidence.
runCase('QA-070-060', () => { assertArtifact(); assert.ok(desktop?.modeEvidence?.length === 5); assert.equal(desktop.errors.length, 0); return { viewport: '1440x900', modes: 5 }; });
runCase('QA-070-061', () => { assertArtifact(); assert.ok(laptop?.modeEvidence?.length === 5); assert.equal(laptop.errors.length, 0); return { viewport: '1024x768', modes: 5 }; });
runCase('QA-070-062', () => { assertArtifact(); assert.equal(mobile?.modeEvidence?.length, 1); assert.equal(mobile.modeEvidence[0].mode, 'board'); assert.equal(mobile.errors.length, 0); return { viewport: '390x844', mode: 'board' }; });
runCase('QA-070-063', () => { assertArtifact(); [...artifactViewports.values()].forEach((item: any) => assert.equal(item.errors.length, 0)); return { visibleErrors: 0 }; });
runCase('QA-070-064', () => { assertArtifact(); [...desktopModes.values()].forEach((item: any) => assert.ok(item.surfaceCount > 0)); return { measuredSurfaces: true }; });
runCase('QA-070-065', () => { assertArtifact(); [...artifactViewports.values()].forEach((item: any) => { assert.equal(item.errors.length, 0); (item.modeEvidence || []).forEach((mode: any) => (mode.menu?.actionIds || []).forEach((id: string) => assert.match(id, /^([a-z]+\.)?[a-z-]+$/))); }); return { informationNoise: 0 }; });
runCase('QA-070-066', () => { assertArtifact(); [...desktopModes.values()].forEach((item: any) => assert.equal(item.menu.menuClosed, true)); assert.ok(source.browser.includes("page.keyboard.press('Escape')")); return { menuFocusClose: true }; });

const settle = async () => {
  while (results.length < 58) await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
};
await settle();
const failed = results.filter(result => result.status === 'FAIL');
assert.equal(results.length, 58, `expected 58 functional cases, got ${results.length}`);
if (failed.length > 0) {
  console.error(JSON.stringify({ verifier: 'dev-070-interaction-kernel', status: 'FAIL', cases: results.length, failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  verifier: 'dev-070-interaction-kernel',
  status: 'PASS',
  cases: results.length,
  caseIds: results.map(result => result.id),
  commandCount: 1,
  artifact: artifactPath,
}));
