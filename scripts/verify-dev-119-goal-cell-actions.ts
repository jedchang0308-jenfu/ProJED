import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  areTaskNoteRichContentsEqual,
  buildTaskPurposeUpdates,
  createPlainTaskNoteRichContent,
  getTaskPurposeNote,
  taskNoteRichContentToPlainText,
} from '../src/utils/taskNoteRichContent';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const hash = (path: string) => createHash('sha256').update(read(path)).digest('hex');
const checks: Array<{ id: string; label: string; status: 'PASS' | 'FAIL'; details?: unknown }> = [];
const failures: string[] = [];
const check = (id: string, label: string, condition: boolean, details?: unknown) => {
  checks.push({ id, label, status: condition ? 'PASS' : 'FAIL', details });
  if (!condition) failures.push(`${id} ${label}`);
};

const goal = read('src/components/GoalView.tsx');
const session = read('src/components/GoalCellSessionProvider.tsx');
const editor = read('src/components/TaskNotes/TaskDetailNoteEditor.tsx');
const richContent = read('src/utils/taskNoteRichContent.ts');
const wbs = read('src/store/useWbsStore.ts');
const app = read('src/App.tsx');
const pwaBridge = read('src/components/PwaReloadSafetyBridge.tsx');
const pwaManifest = read('src/services/pwaReloadOwnerManifest.ts');
const indexCss = read('src/index.css');
const systemScrollbarConsumers = [
  'src/components/BoardView.tsx',
  'src/components/GoalView.tsx',
  'src/components/RecycleBinView.tsx',
  'src/components/SharedTaskSidebar.tsx',
  'src/components/Sidebar.tsx',
  'src/components/TaskWorkbenchPanel.tsx',
  'src/components/TaskNotes/TaskNoteContentSurface.tsx',
  'src/components/Wbs/KanbanColumnPresentation.tsx',
  'src/components/Wbs/WbsListView.tsx',
].map(read);

const legacyNode = {
  detailNotes: undefined,
  description: '舊版目的\n第二行',
};
const legacyNote = getTaskPurposeNote(legacyNode);
const legacyRich = createPlainTaskNoteRichContent(legacyNote.content);
const legacyUpdates = buildTaskPurposeUpdates(legacyNode, { content: '新的目的', richContent: createPlainTaskNoteRichContent('新的目的') });
const richNote = {
  id: 'note_default',
  title: '任務目的',
  content: '原始純文字',
  richContent: createPlainTaskNoteRichContent('原始純文字'),
};
const otherNote = { id: 'note-2', title: '決策', content: '保留', richContent: createPlainTaskNoteRichContent('保留') };
const richNotes = [richNote, otherNote];
const richUpdates = buildTaskPurposeUpdates({ detailNotes: richNotes, description: richNote.content }, { content: '', richContent: createPlainTaskNoteRichContent('') });
const noOpUpdates = buildTaskPurposeUpdates({ detailNotes: richNotes, description: richNote.content }, richNote);

check('P01', 'legacy purpose resolves to default note', legacyNote.id === 'note_default' && legacyNote.title === '任務目的' && legacyNote.content === '舊版目的\n第二行');
check('P02', 'plain legacy edit upgrades through shared rich serializer', legacyUpdates.description === '新的目的' && legacyUpdates.detailNotes?.[0]?.content === '新的目的' && Boolean(legacyUpdates.detailNotes?.[0]?.richContent));
check('P03', 'rich content projection is canonical and clear stays empty', taskNoteRichContentToPlainText(legacyRich) === legacyNote.content && richUpdates.description === '' && richUpdates.detailNotes?.[0]?.content === '');
check('P04', 'other notes and identity survive first-note update', richUpdates.detailNotes?.[1] === otherNote && richUpdates.detailNotes?.[0]?.id === 'note_default' && richUpdates.detailNotes?.[0]?.title === '任務目的');
check('P05', 'semantic no-op reuses latest notes array', noOpUpdates.detailNotes === richNotes);
check('P06', 'cell editor uses same Lexical variant without details chrome', editor.includes("variant: 'cell'") && editor.includes('showToolbar={!isCellVariant}') && editor.includes('data-goal-cell-editor') && editor.includes('data-task-note-resize-handle') && editor.includes('!isCellVariant && canEdit'));
check('P07', 'cell keyboard contract keeps save/cancel/newline and composition guard', editor.includes('INSERT_LINE_BREAK_COMMAND') && editor.includes("onCommit('save')") && editor.includes("onCancel()") && editor.includes('event.isComposing'));
check('P08', 'Goal cell retains one bounded scroll element and reversible fit', goal.includes('data-goal-content-scroll') && goal.includes('data-goal-content-expanded') && goal.includes('overflow-y-auto') && goal.includes("maxHeight: 'none'") && goal.includes('GOAL_CONTENT_EDGE_HIT_PX'));
check('P09', 'Goal cell handles selection, F2 and keyboard menu without changing task menu', goal.includes('data-goal-cell-key') && goal.includes("event.key === 'F2'") && goal.includes("event.key === 'F10'") && goal.includes('GoalCellActionMenu') && !goal.includes('aria-selected'));
check('P10', 'single cross-view session owns draft and recovery', session.includes("'idle' | 'editing' | 'saving' | 'error' | 'unknown'") && session.includes('GoalCellRecoveryNotice') && session.includes('sourceVisible') && app.includes('<GoalCellSessionProvider'));
check('P11', 'session checks latest task scope and permission before every write', session.includes('latestNode.isArchived') && session.includes('latestNode.boardId !== current.boardId') && session.includes('canEditCanonicalTask(latestNode)') && session.includes('getTaskPurposeNote(latestNode)'));
check('P12', 'persistence result distinguishes callback failure and unknown timeout', session.includes('onPersistSuccess') && session.includes('onPersistError') && session.includes('SESSION_TIMEOUT_MS') && session.includes("status: 'unknown'") && session.includes("status: 'error'"));
check('P13', 'forced retry does not create empty undo', wbs.includes('if (hasChanges) {') && wbs.includes('forcePersistence') && session.includes('skipActivity: forcePersistence'));
check('P14', 'PWA safety sees unfocused Goal session marker through existing owner', pwaBridge.includes('data-goal-edit-session-state') && pwaManifest.includes('GoalCellSessionProvider') && pwaBridge.includes("ownerId: 'inline-editor'"));
check('P15', 'meeting cell remains read-only and only task purpose enters editor', goal.includes('column="meeting"') && goal.includes('canEdit={false}') && goal.includes('column="description"') && session.includes('makeCellKey'));
check('P16', 'DEV-116 verifier baselines include the SPEC-121 R8 compact Goal geometry oracle', hash('scripts/verify-dev-116-goal-mode.ts') === 'bfba4107ae8cc62cfd0333b168f9fdb6e16da17bf88a3c4097ac08840bb413b2' && hash('scripts/verify-dev-116-goal-mode-browser.pw.js') === 'dcefce722bca12495f97f80cd39bdb83b991723f67095437584e028ec04ca66f');
check('P17', 'rich equality remains available for semantic conflict/no-op checks', richContent.includes('areTaskNoteRichContentsEqual') && areTaskNoteRichContentsEqual(legacyRich, legacyRich));
check('P18', 'one shared system scrollbar foundation replaces per-surface utilities and preserves explicit exceptions', indexCss.includes('--scrollbar-system-size: 3px') && indexCss.includes(':where(*)::-webkit-scrollbar') && indexCss.includes('.no-scrollbar') && indexCss.includes('.scrollbar-gantt') && indexCss.includes('scrollbar-width: auto') && indexCss.includes('width: 12px') && !indexCss.includes('.scrollbar-thin') && !indexCss.includes('.scrollbar-subtle') && !indexCss.includes('.goal-content-scrollbar') && systemScrollbarConsumers.every(source => !/scrollbar-(?:thin|subtle)|goal-content-scrollbar|custom-scrollbar|scrollbar-(?:thumb|track)-/.test(source)));

const artifact = {
  devId: 'DEV-119',
  status: failures.length ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-119-goal-cell-actions',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};
const artifactDir = resolve('output/playwright/dev-119-goal-cell-actions');
mkdirSync(artifactDir, { recursive: true });
writeFileSync(resolve(artifactDir, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length) {
  console.error('DEV-119 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`DEV-119 static verification passed: ${checks.length} assertions.`);
