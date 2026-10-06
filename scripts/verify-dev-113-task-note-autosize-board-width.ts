import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};

const editor = readFileSync('src/components/TaskNotes/TaskDetailNoteEditor.tsx', 'utf8');
const contentSurface = readFileSync('src/components/TaskNotes/TaskNoteContentSurface.tsx', 'utf8');
const field = readFileSync('src/components/TaskNotes/TaskDetailNoteField.tsx', 'utf8');
const detailsModal = readFileSync('src/components/TaskDetailsModal.tsx', 'utf8');
const indexCss = readFileSync('src/index.css', 'utf8');

assert('note editor receives account and task scope for height preference persistence', editor.includes('accountId: string | null')
  && editor.includes('taskId: string'));
assert('task note field forwards scoped props to the lazy editor', field.includes('<TaskDetailNoteEditor {...props} />'));
assert('task details modal supplies the active account and task ids', detailsModal.includes('accountId={currentAccountId}')
  && detailsModal.includes('taskId={node.id}'));
assert('height preference uses a new task-scoped storage key', editor.includes("projed.taskDetailNote.heights.v2")
  && !editor.includes("projed.taskDetailNote.heights.v1"));
assert('height scope separates account, task, and note identities', editor.includes('getTaskNoteEditorHeightScopeKey')
  && editor.includes('[accountId, taskId, noteId].map(encodeURIComponent)'));
assert('stored heights are clamped to a safe range', editor.includes('TASK_NOTE_EDITOR_MIN_HEIGHT = 36')
  && editor.includes('TASK_NOTE_EDITOR_MAX_HEIGHT = 960')
  && editor.includes('clampTaskNoteEditorHeight'));
assert('empty editor defaults to one compact line', editor.includes("TASK_NOTE_EDITOR_MIN_HEIGHT = 36")
  && contentSurface.includes('min-h-[36px]'));
assert('content changes auto-size height from scrollHeight', editor.includes("element.style.height = 'auto'")
  && editor.includes('element.scrollHeight')
  && editor.includes('autoSizeContent'));
assert('manual height can be smaller than content and expose vertical scrolling', editor.includes('preferredHeightRef.current === null')
  && contentSurface.includes('overflow-y-auto')
  && indexCss.includes('--scrollbar-system-size: 3px')
  && !editor.includes('scrollbar-thin')
  && !editor.includes('Math.max(intrinsicHeightRef.current, clampTaskNoteEditorHeight(height))'));
assert('editor width stays attached to its container and native resizing is disabled', contentSurface.includes('w-full max-w-full')
  && editor.includes("isCellVariant ? '' : 'resize-none'")
  && !editor.includes('resize-x'));
assert('full bottom edge owns the vertical resize interaction', editor.includes('data-task-note-resize-handle="bottom-edge"')
  && editor.includes('data-task-note-resize-axis="vertical"')
  && editor.includes('absolute inset-x-0 -bottom-1'));
assert('pointer movement changes only editor height', editor.includes('startHeight + event.clientY - start.startY')
  && !editor.includes('event.clientX >= rect.right'));
assert('resize completion writes the account-task-note scoped height preference', editor.includes('writeTaskNoteEditorHeight(heightPreferenceScopeKey, pendingHeightRef.current)')
  && editor.includes("window.localStorage.setItem(TASK_NOTE_EDITOR_HEIGHTS_KEY"));
assert('bottom edge exposes keyboard separator semantics', editor.includes('role="separator"')
  && editor.includes('aria-orientation="horizontal"')
  && editor.includes("event.key === 'ArrowUp'")
  && editor.includes("event.key === 'ArrowDown'"));
assert('editor suppresses horizontal overflow and enables vertical overflow when manually compacted', contentSurface.includes('overflow-x-hidden overflow-y-auto'));

const artifact = {
  devId: 'DEV-113',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-113-task-note-autosize-board-width',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};

const artifactDirectory = resolve('output/playwright/dev-113-task-note-autosize-board-width');
mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(resolve(artifactDirectory, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('DEV-113 static verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-113 static verification passed: ${checks.length} assertions.`);
