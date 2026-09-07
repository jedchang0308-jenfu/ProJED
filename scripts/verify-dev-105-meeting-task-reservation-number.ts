import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  getMeetingTaskReservationValue,
  getMeetingTaskReservations,
  getMeetingTaskReservationsForSignature,
  parseMeetingTaskReservationInput,
  updateMeetingTaskReservationMetadata,
} from '../src/utils/meetingTaskReservation';
import { getRecordDraftSignature } from '../src/utils/meetingRecordWorkflow';
import { getTaskActionDefinition, getTaskMenuActionIds } from '../src/interactions/task/taskActionCatalog';
import { MEETING_TASK_MENU_PROFILE } from '../src/interactions/task/profiles';
import { resolveTaskMenu } from '../src/interactions/task/resolveTaskInteraction';
import { guardTaskAction } from '../src/interactions/task/taskActionGuards';

const root = process.cwd();
const failures: string[] = [];
const checks: Array<{ id: string; status: 'PASS'; evidence: string }> = [];

const check = (id: string, evidence: string, assertion: () => void) => {
  try {
    assertion();
    checks.push({ id, status: 'PASS', evidence });
    console.log(`PASS ${id}: ${evidence}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${id}: ${message}`);
    console.error(`FAIL ${id}: ${message}`);
  }
};

const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const baseMetadata = { otherNamespace: { preserved: true }, tags: ['keep'] } as Record<string, unknown>;
const draft = (metadata: Record<string, unknown>) => ({
  id: 'meeting-105',
  type: 'meeting' as const,
  title: 'DEV-105',
  content: '',
  status: 'draft' as const,
  visibility: 'tenant' as const,
  participantsText: '',
  occurredAt: 1704067200000,
  startedAt: null,
  endedAt: null,
  recordedBy: 'host-1',
  metadata,
  taskLinks: [],
});
const context = (surfaceId: 'board.column-header' | 'board.card' | 'board.checklist-row' | 'list.row' | 'task-details.subtask-row') => ({
  interactionId: `dev105-${surfaceId}`,
  location: { hostMode: 'board' as const, origin: 'mode-primary' as const },
  surfaceId,
  taskId: 'task-l2',
  modality: 'fine-pointer' as const,
  transientOwners: [],
  blockers: [],
});

check('TC-105-01', 'ASCII parser and metadata set/clear preserve namespace and reject invalid values.', () => {
  assert.deepEqual(parseMeetingTaskReservationInput('15'), { status: 'value', value: 15 });
  assert.deepEqual(parseMeetingTaskReservationInput(''), { status: 'clear' });
  for (const value of ['0', '-1', '1.5', '1e2', '+2', '1000', '１２', 'abc', 'NaN', 'Infinity']) {
    assert.equal(parseMeetingTaskReservationInput(value).status, 'invalid', value);
  }
  const updated = updateMeetingTaskReservationMetadata(baseMetadata, 'task-l2', 15);
  assert.equal(updated.status, 'updated');
  assert.deepEqual(updated.metadata.otherNamespace, baseMetadata.otherNamespace);
  const cleared = updateMeetingTaskReservationMetadata(updated.metadata, 'task-l2', null);
  assert.equal(cleared.status, 'cleared');
  assert.equal(cleared.metadata.meetingTaskReservations, undefined);
  const unknown = updateMeetingTaskReservationMetadata({ meetingTaskReservations: { schemaVersion: 99, values: { stale: 12 } } }, 'task-l2', 15);
  assert.equal(unknown.status, 'denied');
});

check('TC-105-02', 'Normalized reservation projection is stable by canonical task ID and affects draft signature.', () => {
  const first = { meetingTaskReservations: { schemaVersion: 1, values: { b: 2, a: 1 } } } as Record<string, unknown>;
  const second = { meetingTaskReservations: { schemaVersion: 1, values: { a: 1, b: 2 } } } as Record<string, unknown>;
  assert.deepEqual(getMeetingTaskReservationsForSignature(first), getMeetingTaskReservationsForSignature(second));
  assert.equal(getMeetingTaskReservationValue(first, 'a'), 1);
  assert.notEqual(getRecordDraftSignature(draft(first)), getRecordDraftSignature(draft({})));
  assert.equal(getRecordDraftSignature(draft(first)), getRecordDraftSignature(draft(second)));
});

check('TC-105-03', 'Meeting reservation action is host capability guarded and fails closed for non-host.', () => {
  assert.equal(guardTaskAction('task.edit-meeting-reservation', { nodeExists: true, canEditMeetingReservation: true }).allowed, true);
  assert.equal(guardTaskAction('task.edit-meeting-reservation', { nodeExists: true, canEditMeetingReservation: false }).allowed, false);
  assert.equal(guardTaskAction('task.edit-meeting-reservation', { nodeExists: false, canEditMeetingReservation: true }).allowed, false);
  assert.equal(getTaskActionDefinition('task.edit-meeting-reservation')?.capability, 'meeting-reservation');
});

check('TC-105-04', 'Canonical task lookup and fail-closed target contract are explicit in store and context-menu source.', () => {
  const store = read('src/store/useRecordStore.ts');
  const menu = read('src/components/GlobalContextMenu.tsx');
  assert.match(store, /input\.taskExists/);
  assert.match(store, /!input\.taskArchived/);
  assert.match(store, /input\.taskBoardId === input\.activeBoardId/);
  assert.match(store, /draft\.recordedBy === authUserId/);
  assert.match(menu, /currentNode\.id/);
  assert.match(menu, /taskBoardId: currentNode\.boardId/);
});

check('TC-105-05', 'One opt-in overlay exposes the same action on the three Board task surfaces only.', () => {
  assert.equal(getTaskActionDefinition('task.edit-meeting-reservation')?.defaultMenu, false);
  const base = getTaskMenuActionIds();
  assert.equal(base.includes('task.edit-meeting-reservation'), false);
  for (const surface of ['board.column-header', 'board.card', 'board.checklist-row'] as const) {
    assert.equal(resolveTaskMenu(context(surface), [MEETING_TASK_MENU_PROFILE]).includes('task.edit-meeting-reservation'), true);
  }
  assert.equal(resolveTaskMenu(context('list.row'), []).includes('task.edit-meeting-reservation'), false);
  assert.equal(resolveTaskMenu(context('task-details.subtask-row'), []).includes('task.edit-meeting-reservation'), false);
  const menu = read('src/components/GlobalContextMenu.tsx');
  assert.match(menu, /meetingReservationSurfaceIds = \['board\.column-header', 'board\.card', 'board\.checklist-row'\]/);
  assert.match(menu, /menuKind !== 'task'/);
});

check('TC-105-06', 'Inline editor uses text numeric input and explicit Enter/Escape composition handling.', () => {
  const menu = read('src/components/GlobalContextMenu.tsx');
  const actionMenu = read('src/interactions/task/TaskActionMenu.tsx');
  assert.match(menu, /data-meeting-reservation-input/);
  assert.match(menu, /inputMode="numeric"/);
  assert.match(menu, /pattern="\[0-9\]\*"/);
  assert.match(menu, /maxLength=\{3\}/);
  assert.match(menu, /bg-white/);
  assert.match(menu, /event\.nativeEvent\.isComposing/);
  assert.match(menu, /event\.key === 'Escape'/);
  assert.match(actionMenu, /data-task-action-inline-editor/);
});

check('TC-105-07', 'Invalid input remains inline and mutation result is checked before closing.', () => {
  const menu = read('src/components/GlobalContextMenu.tsx');
  assert.match(read('src/utils/meetingTaskReservation.ts'), /請輸入 1–999 的整數/);
  assert.match(menu, /result === 'denied'/);
  assert.match(menu, /closeContextMenu\(\{ preserveTaskSelection: true \}\)/);
});

check('TC-105-08', 'Shared mark renders one integrated time token containing only the exact numeric value after date, with no icon DOM, no DOM for empty values and no Details adapter injection.', () => {
  const mark = read('src/components/Wbs/MeetingTaskReservationMark.tsx');
  const column = read('src/components/Wbs/KanbanColumnPresentation.tsx');
  const card = read('src/components/Wbs/KanbanCardPresentation.tsx');
  const tree = read('src/components/Wbs/TaskChecklistTree.tsx');
  const checklist = read('src/components/Wbs/KanbanChecklist.tsx');
  assert.match(mark, /if \(value === null \|\| value === undefined\) return null/);
  assert.match(mark, /\{value\}/);
  assert.doesNotMatch(mark, /Clock3|data-meeting-task-reservation-icon/);
  assert.match(mark, /data-meeting-task-reservation-token/);
  assert.match(mark, /rounded-full bg-\[#f6cd03\]/);
  assert.match(mark, /text-black/);
  assert.doesNotMatch(mark, /border(?:-[^ ]+)?\s/);
  assert.match(column, /<MeetingTaskReservationMark value=\{meetingReservationValue\}/);
  assert.match(card, /<MeetingTaskReservationMark value=\{meetingReservationValue\}/);
  assert.match(tree, /hostAdapter\.meetingReservationValues\?\.\[childId\]/);
  assert.match(checklist, /meetingReservationValues = React\.useMemo/);
  assert.doesNotMatch(read('src/components/TaskDetailsModal.tsx'), /meetingReservationValues/);
});

check('TC-105-09', 'Existing metadata passthrough and recovery signature include reservation projection without provider/schema branch.', () => {
  const workflow = read('src/utils/meetingRecordWorkflow.ts');
  const localService = read('src/services/localTestService.ts');
  const firestore = read('src/services/firestoreService.ts');
  const supabase = read('src/services/supabase/projedService.ts');
  assert.match(workflow, /meetingTaskReservations: getMeetingTaskReservationsForSignature/);
  assert.match(localService, /metadata: input\.metadata/);
  assert.match(firestore, /metadata: input\.metadata/);
  assert.match(supabase, /metadata/);
  assert.equal(supabase.includes('meetingTaskReservations'), false);
});

check('TC-105-10', 'Regression boundaries keep action overlay and mark out of non-Board modes and preserve existing interaction surfaces.', () => {
  const card = read('src/components/Wbs/KanbanCard.tsx');
  const column = read('src/components/Wbs/KanbanColumn.tsx');
  const checklist = read('src/components/Wbs/KanbanChecklist.tsx');
  const binding = read('src/interactions/task/useTaskInteractionBinding.ts');
  assert.match(card, /surfaceId: 'board\.card'/);
  assert.match(column, /surfaceId: 'board\.column-header'/);
  assert.match(checklist, /surfaceId: 'board\.checklist-row'/);
  assert.match(card, /s\.isMeetingMode && draft\?\.type === 'meeting' && draft\.status === 'draft'/);
  assert.match(column, /state\.isMeetingMode && draft\?\.type === 'meeting' && draft\.status === 'draft'/);
  assert.match(checklist, /isMeetingMode && recordDraft\?\.type === 'meeting' && recordDraft\.status === 'draft'/);
  assert.doesNotMatch(binding, /meetingTaskReservations/);
  assert.doesNotMatch(read('src/components/TaskDetailsModal.tsx'), /預約時間/);
});

const result = {
  dev: 'DEV-105',
  devId: 'DEV-105',
  sourceRevision: 'working-tree',
  environment: 'local-source-contract',
  provider: 'local-source',
  command: 'npm run verify:dev-105-meeting-task-reservation-number',
  exitCode: failures.length ? 1 : 0,
  assertionCount: checks.length + failures.length,
  caseIds: checks.map(item => item.id),
  checks,
  status: failures.length ? 'failed' : 'passed',
  passed: failures.length === 0,
  qaStatus: failures.length ? 'FAIL' : 'PASS',
  releaseStatus: 'NOT READY',
  summary: {
    PASS: checks.length,
    FAIL: failures.length,
    NOT_RUN: 0,
    BLOCKED: 0,
  },
  failures,
  artifactPaths: ['output/qa/dev-105/result.json'],
  generatedAt: new Date().toISOString(),
};

const output = resolve(root, 'output/qa/dev-105/result.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error(`DEV-105 deterministic verification failed (${failures.length} failure(s)).`);
  process.exit(1);
}

assert.equal(existsSync(output), true);
console.log(`DEV-105 deterministic verification passed: ${checks.length} contract cases.`);
