import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};

const editor = readFileSync('src/components/TaskNotes/TaskDetailNoteEditor.tsx', 'utf8');
const field = readFileSync('src/components/TaskNotes/TaskDetailNoteField.tsx', 'utf8');
const detailsModal = readFileSync('src/components/TaskDetailsModal.tsx', 'utf8');

assert('note editor receives board scope for layout preference persistence', editor.includes('boardId: string'));
assert('task note field forwards board scope to the lazy editor', field.includes('<TaskDetailNoteEditor {...props} />'));
assert('task details modal supplies the active board id', detailsModal.includes('boardId={node.boardId}'));
assert('layout preference uses a versioned board-scoped storage key', editor.includes("projed.taskDetailNote.widths.v1"));
assert('stored widths are clamped to a safe range', editor.includes('TASK_NOTE_EDITOR_MIN_WIDTH = 240')
  && editor.includes('TASK_NOTE_EDITOR_MAX_WIDTH = 1600')
  && editor.includes('clampTaskNoteEditorWidth'));
assert('empty editor defaults to one compact line', editor.includes("TASK_NOTE_EDITOR_MIN_HEIGHT = 36")
  && editor.includes("'min-h-[36px]"));
assert('content changes auto-size height from scrollHeight', editor.includes("element.style.height = 'auto'")
  && editor.includes('element.scrollHeight')
  && editor.includes('autoSizeContent'));
assert('saved width is applied without replacing content sizing', editor.includes('style={savedWidth ? { width: `${savedWidth}px` } : undefined}')
  && editor.includes('element.style.height'));
assert('native horizontal resize remains available to the user', editor.includes('resize-x')
  && editor.includes('isUserResizingRef'));
assert('resize completion writes the board-scoped preference', editor.includes('writeTaskNoteEditorWidth(boardId, pendingWidthRef.current)')
  && editor.includes("window.localStorage.setItem(TASK_NOTE_EDITOR_WIDTHS_KEY"));
assert('resize observer updates the in-memory width before persistence', editor.includes('new ResizeObserver')
  && editor.includes('setSavedWidth(width)'));
assert('editor suppresses horizontal overflow while allowing content to grow vertically', editor.includes('overflow-x-hidden overflow-y-hidden'));

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
