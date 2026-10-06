import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TASK_WORKBENCH_UNPLACED_BOARD_ID } from '../src/features/taskWorkbench/placementModel';
import {
  resolveTaskMeetingRecordCapability,
  taskMeetingRecordAvailabilityMessage,
  taskMeetingRecordScopeKey,
} from '../src/utils/taskMeetingRecordCapability';
import {
  assertRecordTaskLinkSet,
  RecordTaskLinkIntegrityError,
  uniqueRecordTaskLinkIdentities,
} from '../src/services/recordTaskLinkContract';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};

const sourceNode = {
  id: 'task_workbench_unplaced_legacy-id',
  workspaceId: 'workspace-1',
  boardId: 'board-1',
};

const supported = resolveTaskMeetingRecordCapability(sourceNode, 'board-1');
assert('same-board canonical task supports read and append', supported.read.status === 'supported' && supported.append.status === 'supported');
assert('same-board read scope uses canonical task identity', supported.read.status === 'supported'
  && taskMeetingRecordScopeKey(supported.read) === 'workspace-1:board-1:task_workbench_unplaced_legacy-id');

const crossBoard = resolveTaskMeetingRecordCapability(sourceNode, 'board-2');
assert('cross-board task keeps source-board read scope', crossBoard.read.status === 'supported'
  && crossBoard.read.boardId === 'board-1');
assert('cross-board append is denied', crossBoard.append.status === 'unsupported' && crossBoard.append.reason === 'meeting-board-mismatch');
assert('cross-board message is actionable', taskMeetingRecordAvailabilityMessage(crossBoard.append) === '此任務屬於其他看板；請在原看板的會議中新增紀錄。');

const unplaced = resolveTaskMeetingRecordCapability({
  ...sourceNode,
  boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
}, 'board-1');
assert('unplaced task never receives project meeting-record capability', unplaced.read.status === 'unsupported'
  && unplaced.read.reason === 'account-unplaced'
  && unplaced.append.status === 'unsupported'
  && unplaced.append.reason === 'account-unplaced');
assert('unplaced message instructs placement before append', taskMeetingRecordAvailabilityMessage(unplaced.append) === '請先將任務放入目前會議的看板，再新增會議紀錄。');

const incomplete = resolveTaskMeetingRecordCapability({ id: '', workspaceId: 'workspace-1', boardId: 'board-1' }, 'board-1');
assert('incomplete task identity is denied', incomplete.read.status === 'unsupported' && incomplete.read.reason === 'identity-incomplete');

const requestedLinks = [
  { nodeId: 'task-1', role: 'main' as const },
  { nodeId: 'task-1', role: 'main' as const },
  { nodeId: 'task-2', role: 'related' as const },
];
const persistedLinks = [
  { nodeId: 'task-2', role: 'related' as const },
  { nodeId: 'task-1', role: 'main' as const },
];
assert('duplicate task links collapse to one identity', uniqueRecordTaskLinkIdentities(requestedLinks).length === 2);
assert('exact task-link set accepts order-independent persistence', (() => {
  try {
    assertRecordTaskLinkSet(requestedLinks, persistedLinks);
    return true;
  } catch {
    return false;
  }
})());
assert('partial task-link persistence fails closed', (() => {
  try {
    assertRecordTaskLinkSet(requestedLinks, [{ nodeId: 'task-1', role: 'main' as const }]);
    return false;
  } catch (error) {
    return error instanceof RecordTaskLinkIntegrityError;
  }
})());

const modal = readFileSync('src/components/TaskDetailsModal.tsx', 'utf8');
const hook = readFileSync('src/hooks/useTaskMeetingQuickNotes.ts', 'utf8');
const section = readFileSync('src/components/TaskNotes/TaskMeetingQuickNoteSection.tsx', 'utf8');
const store = readFileSync('src/store/useRecordStore.ts', 'utf8');
const backend = readFileSync('src/services/supabase/projedService.ts', 'utf8');
const archiveReadbackMigration = readFileSync('supabase/migrations/20260908050000_dev_110_record_archive_readback.sql', 'utf8');
assert('task detail passes canonical node and active meeting board', modal.includes('useTaskMeetingQuickNotes(node, activeMeetingBoardId)'));
assert('loader uses canonical source scope and generation guard', hook.includes('readCapability.workspaceId') && hook.includes('loadGenerationRef') && hook.includes('includeArchived: true'));
assert('unavailable capability removes composer and retry path is reserved for load errors', section.includes('isMeetingMode && composerAvailable') && section.includes('{!error && isMeetingMode && availabilityMessage'));
assert('store blocks unplaced and cross-board append', store.includes('TASK_WORKBENCH_UNPLACED_BOARD_ID') && store.includes("reason: 'meeting-board-mismatch'"));
assert('Supabase resolves all task links before record mutation', backend.indexOf('const resolutionResults =') < backend.indexOf('const insert = await knowledgeRecordToInsert'));
assert('Supabase no longer silently skips unresolved links', backend.includes('RecordTaskLinkResolutionError') && !backend.includes('Skipping unresolved record task link'));
assert('store verifies returned task-link exact set', store.includes('assertRecordTaskLinkSet(input.taskLinks, saved.taskLinks)'));
assert('archived records and task links remain readable to authorized history readers', archiveReadbackMigration.includes('record owners and board readers read records')
  && archiveReadbackMigration.includes('authorized users read record task links')
  && !archiveReadbackMigration.includes('kr.status <> \'archived\''));

const artifact = {
  devId: 'DEV-110',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-110-unplaced-task-meeting-record-boundary',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};
const artifactPath = resolve('output/playwright/dev-110-unplaced-task-meeting-record-boundary/static-result.json');
mkdirSync(resolve('output/playwright/dev-110-unplaced-task-meeting-record-boundary'), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
mkdirSync(resolve('output/qa/dev-110'), { recursive: true });
writeFileSync(resolve('output/qa/dev-110/static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('DEV-110 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-110 static verification passed: ${checks.length} assertions.`);
