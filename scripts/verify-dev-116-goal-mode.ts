import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGoalSparseProjection } from '../src/features/goalMode/projection';
import { getHostModeProfile } from '../src/interactions/task/profiles';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const checks: Array<{ id: string; label: string; status: 'PASS' | 'FAIL'; details?: unknown }> = [];
const failures: string[] = [];
const check = (id: string, label: string, condition: boolean, details?: unknown) => {
  checks.push({ id, label, status: condition ? 'PASS' : 'FAIL', details });
  if (!condition) failures.push(`${id} ${label}`);
};

const types = read('src/types/index.ts');
const app = read('src/App.tsx');
const layout = read('src/components/MainLayout.tsx');
const modeSwitcher = read('src/components/ui/ModeSwitcher.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const goal = read('src/components/GoalView.tsx');
const projectionSource = read('src/features/goalMode/projection.ts');
const recordStore = read('src/store/useRecordStore.ts');
const quickNotes = read('src/utils/meetingTaskQuickNotes.ts');
const interactionTypes = read('src/interactions/task/types.ts');
const profiles = read('src/interactions/task/profiles.ts');
const resolver = read('src/interactions/task/resolveTaskInteraction.ts');
const pwaManifest = read('src/services/pwaReloadOwnerManifest.ts');
const pwaUpdate = read('src/services/pwaUpdateService.ts');
const localTest = read('src/utils/localTestEnvironment.ts');
const hierarchyLayoutPath = 'src/components/Wbs/TaskHierarchyIndentedRow.tsx';
const hierarchyLayout = existsSync(resolve(hierarchyLayoutPath)) ? read(hierarchyLayoutPath) : '';
const listNode = read('src/components/Wbs/WbsNodeItem.tsx');

check('P01', 'ViewMode includes goal', types.includes("'goal'"));
check('P02', 'App lazy-loads and renders GoalView', app.includes("import('./components/GoalView')") && app.includes("case 'goal':") && app.includes('hostMode="goal"'));
check('P03', 'goal is a board workspace and filter view', layout.includes("'goal'") && layout.includes('value: \'goal\''));
check('P04', 'sidebar treats goal as active board workspace', sidebar.includes("'goal'"));
check('P05', 'goal is covered by PWA reload ownership', pwaManifest.includes("  'goal',") && pwaUpdate.includes("'goal'"));
check('P06', 'local test can restore goal view', localTest.includes("  'goal',"));
check('P07', 'goal interaction host and surface are typed', interactionTypes.includes("'goal'") && interactionTypes.includes("'goal.row'"));
check('P08', 'goal and board share the same task context-menu profile and presenter path without re-enabling duplicate description hover', getHostModeProfile('goal') === getHostModeProfile('board') && profiles.includes('goal: BOARD_GOAL_TASK_PROFILE') && goal.includes('interactionBinding.openMenu') && !goal.includes("'data-task-surface-source': 'true'"));
check('P09', 'interaction resolver recognizes goal host', resolver.includes("'goal'"));
check('P10', 'goal has no inline add explanation/record controls', !goal.includes('＋說明') && !goal.includes('＋紀錄') && !goal.includes('新增說明') && !goal.includes('新增紀錄'));
check('P11', 'sparse projection exports independent columns', projectionSource.includes('buildGoalSparseProjection') && projectionSource.includes('descriptionCell') && projectionSource.includes('meetingCell'));

const sparse = buildGoalSparseProjection([
  { taskId: 'parent', level: 0, description: 'parent description', meeting: null },
  { taskId: 'child-a', level: 1, description: null, meeting: 'child decision' },
  { taskId: 'child-b', level: 1, description: null, meeting: null },
  { taskId: 'sibling', level: 0, description: null, meeting: null },
]);
check('P12', 'parent description spans only blank descendants', sparse.rows[0].descriptionCell.kind === 'owner' && sparse.rows[0].descriptionCell.rowSpan === 3 && sparse.rows[1].descriptionCell.kind === 'covered' && sparse.rows[3].descriptionCell.kind === 'empty');
check('P13', 'meeting column remains independent from description', sparse.rows[0].meetingCell.kind === 'empty' && sparse.rows[1].meetingCell.kind === 'owner' && sparse.rows[1].meetingCell.rowSpan === 1);
check('P14', 'empty optional columns can disappear', !buildGoalSparseProjection([{ taskId: 'x', level: 0 }]).hasDescriptionColumn && !buildGoalSparseProjection([{ taskId: 'x', level: 0 }]).hasMeetingColumn);
check('P15', 'projection is immutable at input boundary', sparse.rows[0].description === 'parent description' && sparse.rows[1].meeting === 'child decision');
check('P16', 'record projector is exact workspace × board and keeps every valid note by task', quickNotes.includes('projectMeetingTaskQuickNotesByTask') && quickNotes.includes('byTaskId') && quickNotes.includes('record.workspaceId !== scope.workspaceId') && quickNotes.includes('record.boardId !== scope.boardId'));
check('P17', 'malformed aggregate is rejected as a whole', quickNotes.includes('invalidRecordIds.add(recordId)') && quickNotes.includes('aggregateValid = false'));
check('P18', 'record list lifecycle is discriminated and scope-keyed', recordStore.includes('RecordListLoadState') && recordStore.includes('recordListLoad') && recordStore.includes('createRecordScopeKey'));
check('P19', 'stale record requests cannot overwrite current scope', recordStore.includes('recordListRequestSequence') && recordStore.includes('if (requestId !== recordListRequestSequence) return;') && recordStore.includes('resetRecordList'));
const continuitySetStart = recordStore.indexOf('const MEETING_CONTINUITY_VIEWS');
const continuitySetEnd = recordStore.indexOf('const activeBoardIdForMeeting');
const continuitySet = continuitySetStart >= 0 && continuitySetEnd > continuitySetStart
  ? recordStore.slice(continuitySetStart, continuitySetEnd)
  : '';
const continuityFallbackCount = recordStore.split("if (!isMeetingContinuityView(currentView)) setView('board');").length - 1;
check('P20', 'goal participates in meeting start and recovery continuity', continuitySet.includes("'goal'") && continuityFallbackCount === 2, { continuityFallbackCount });
check('P21', 'goal content has no duplicate introduction header', !goal.includes('<header') && !goal.includes('以任務目標、目的與會議紀錄快速對齊方向') && !goal.includes('>目標模式</h1>') && !goal.includes('<Target'));
check('P22', 'filtered-zero state keeps contextual reset action', goal.includes('目前篩選沒有符合的任務') && goal.includes('onClick={resetTaskFilters}') && goal.includes('清除篩選'));
const goalHeaderMarkup = goal.match(/<thead[\s\S]*?<\/thead>/)?.[0] || '';
check('P23', 'goal headers use flat labels and compact task-name width while owner content has bounded Y-scroll',
  ((goalHeaderMarkup.includes('<GoalColumnHeader') && goalHeaderMarkup.includes('column="task"') && goal.includes("task: '任務名稱'"))
    || (goalHeaderMarkup.includes('id="goal-column-task"') && goalHeaderMarkup.includes('任務名稱')))
  && !goalHeaderMarkup.includes('<div') && goal.includes('min-w-[252px]') && goal.includes('GOAL_TASK_COLUMN_WIDTH_PX = 252') && goal.includes('goalTableMinWidth') && goal.includes('任務名稱、任務目的、會議紀錄、負責人、狀態、開始日期、結束日期與工期') && !goal.includes('>任務目標</th>') && goal.includes('data-goal-content-scroll') && goal.includes('GOAL_CONTENT_ROW_HEIGHT_PX') && goal.includes('overflow-y-auto'));
check('P24', 'goal keeps its internal value while exposing the OKR mode label', layout.includes("{ value: 'goal', label: 'OKR模式'") && !layout.includes("{ value: 'goal', label: '目標模式'"));
check('P25', 'mode switcher removes the visible introduction row but keeps an accessible menu name', modeSwitcher.includes('aria-label="切換模式"') && !modeSwitcher.includes('data-mode-switcher-close') && !modeSwitcher.includes('>切換模式</div>'));
check('P26', 'goal and list share hierarchy indentation geometry', hierarchyLayout.includes('task-hierarchy-indented-row') && hierarchyLayout.includes('data-task-hierarchy-disclosure') && goal.includes("from './Wbs/TaskHierarchyIndentedRow'") && read('src/components/Wbs/WbsNodeItem.tsx').includes("from './TaskHierarchyIndentedRow'") && !goal.includes('row.level * 16'));
check('P27', 'goal owns task capabilities while progress stays list-only', goal.includes('useTaskPlacementController') && goal.includes('DesktopTaskDragHost') && !goal.includes('<DndContext') && !goal.includes('data-goal-task-progress') && goal.includes('<TagChip') && goal.includes('<TaskAssignmentPicker') && goal.includes('showIcon={false}') && goal.includes('data-goal-planning-control') && listNode.includes('data-task-progress-indicator') && !hierarchyLayout.includes('TaskAssignmentPicker') && !hierarchyLayout.includes('TagChip'));
check('P29', 'goal date inputs do not use an extra row layout wrapper', !goal.includes('relative flex h-8 min-w-0 items-center') && goal.includes('data-goal-column="end-date"') && goal.includes('type="date"'));
check('P30', 'goal task title does not use a redundant text wrapper', goal.includes('task-title-text min-w-0 flex-1 truncate') && !goal.includes('task-title-text relative flex min-w-0 flex-1 items-center gap-[2px]'));
const taskDragManifestStart = pwaManifest.indexOf("ownerId: 'task-drag'");
const taskDragManifest = taskDragManifestStart >= 0 ? pwaManifest.slice(taskDragManifestStart) : '';
check('P28', 'goal drag participates in the existing PWA task-drag owner', taskDragManifest.includes("surfaces: ['list', 'mindmap', 'board', 'goal', 'gantt', 'calendar']"));

const artifact = {
  devId: 'DEV-116',
  status: failures.length ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-116-goal-mode',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};
const artifactDir = resolve('output/playwright/dev-116-goal-mode');
mkdirSync(artifactDir, { recursive: true });
writeFileSync(resolve(artifactDir, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length) {
  console.error('DEV-116 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`DEV-116 static verification passed: ${checks.length} assertions.`);
