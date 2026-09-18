import assert from 'node:assert/strict';
import {
  buildTaskPurposeUpdates,
  createPlainTaskNoteRichContent,
  getTaskDetailNotesWithCanonicalPurpose,
  getTaskPurposeNote,
  getTaskPurposeText,
} from '../src/utils/taskNoteRichContent';
import type { TaskDetailNote, TaskNode } from '../src/types';

const makeNode = (detailNotes: TaskDetailNote[], description = ''): Pick<TaskNode, 'detailNotes' | 'description'> => ({
  detailNotes,
  description,
});

const legacy = makeNode([
  { id: 'legacy-description', title: '說明', content: '現況場地效益不夠高' },
  { id: 'legacy-goal', title: '達到目標', content: '重新規畫整個場域' },
  { id: 'history', title: '歷程紀錄', content: '0808 B棟重新開始工作時間' },
]);

const purpose = getTaskPurposeNote(legacy);
assert.equal(purpose.id, 'note_default');
assert.equal(purpose.title, '任務目的');
assert.equal(purpose.content, '現況場地效益不夠高\n\n重新規畫整個場域');
assert.equal(getTaskPurposeText(legacy), purpose.content);

const displayed = getTaskDetailNotesWithCanonicalPurpose(legacy);
assert.deepEqual(displayed.map(note => note.title), ['任務目的', '歷程紀錄']);
assert.equal(displayed[1]?.content, '0808 B棟重新開始工作時間');

const edited = buildTaskPurposeUpdates(legacy, { content: '已整合的新任務目的' });
assert.equal(edited.description, '已整合的新任務目的');
assert.deepEqual(edited.detailNotes?.map(note => note.title), ['任務目的', '歷程紀錄']);
assert.equal(edited.detailNotes?.[0]?.content, '已整合的新任務目的');

const duplicate = makeNode([
  { id: 'legacy-description', title: '說明', content: '同一段' },
  { id: 'legacy-goal', title: '達到目標', content: '同一段' },
]);
assert.equal(getTaskPurposeText(duplicate), '同一段');

const rich = createPlainTaskNoteRichContent('格式化目的');
const richNode = makeNode([{ id: 'note_default', title: '任務目的', content: '舊內容', richContent: rich }]);
assert.equal(getTaskPurposeNote(richNode).content, '格式化目的');
assert.deepEqual(getTaskPurposeNote(richNode).richContent, rich);

console.log('DEV-125 task purpose merge verifier: PASS (5 cases)');
