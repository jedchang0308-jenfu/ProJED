import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/TaskDetailsModal.tsx', import.meta.url), 'utf8');

const checks = [
  {
    name: 'TaskDetailsModal imports a delete icon for note removal',
    pass: source.includes('Trash2') && source.includes("from 'lucide-react'"),
  },
  {
    name: 'TaskDetailsModal defines deleteNote guarded by edit permission and confirmation',
    pass: source.includes('const deleteNote = (noteId: string) =>') &&
      source.includes('if (!canEditTask) return;') &&
      source.includes('window.confirm('),
  },
  {
    name: 'deleteNote removes the target note and preserves one blank note for the last deletion',
    pass: source.includes('current.filter((item) => item.id !== noteId)') &&
      source.includes('nextNotes.length > 0 ? nextNotes : [createNote(1)]'),
  },
  {
    name: 'note cards expose stable hooks for delete browser QC',
    pass: source.includes('data-task-detail-note-card="true"') &&
      source.includes('data-task-detail-note-delete="true"') &&
      source.includes('data-task-detail-note-title-input="true"') &&
      source.includes('data-task-detail-note-content-input="true"'),
  },
  {
    name: 'delete button is disabled when task editing is not allowed',
    pass: source.includes('disabled={!canEditTask}') &&
      source.includes('刪除此備註欄') &&
      source.includes('aria-label={`刪除備註欄：${note.title ||'),
  },
];

const failed = checks.filter((check) => !check.pass);

if (failed.length) {
  console.error('DEV-050 task detail note delete contract failed:');
  failed.forEach((check) => console.error(`- ${check.name}`));
  process.exit(1);
}

console.log('DEV-050 task detail note delete contract passed.');
