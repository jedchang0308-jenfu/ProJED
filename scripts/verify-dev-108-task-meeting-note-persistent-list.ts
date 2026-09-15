import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  appendMeetingTaskQuickNoteMetadata,
  appendMeetingTaskQuickNoteToRecordContent,
  parseMeetingTaskQuickNotesMetadata,
  parseMeetingTaskDiscussionCandidates,
  projectMeetingTaskQuickNotes,
  reconcileMeetingTaskQuickNoteMetadata,
  validateMeetingTaskQuickNoteAggregate,
} from '../src/utils/meetingTaskQuickNotes';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};

const firstContent = '## 任務討論\n- 10:00 @[任務一](task:task-1)：確認 API 邊界\n';
const appended = appendMeetingTaskQuickNoteToRecordContent(
  firstContent,
  'task-1',
  '任務一',
  '補上驗證案例',
  new Date('2026-09-07T10:15:00+08:00').valueOf(),
  'submission-1',
);
assert('append produces a discussion line and provenance entry', Boolean(appended));
assert('candidate parser is scoped to 任務討論', parseMeetingTaskDiscussionCandidates(appended?.content ?? '').length === 2);

const metadataResult = appendMeetingTaskQuickNoteMetadata(undefined, appended!.entry);
assert('append metadata creates v1 namespace', metadataResult.status === 'appended');
assert('metadata is valid after append', parseMeetingTaskQuickNotesMetadata(metadataResult.metadata).status === 'valid');
assert('aggregate invariant passes after append', validateMeetingTaskQuickNoteAggregate(appended!.content, metadataResult.metadata).valid);

const shiftedContent = `前置說明\n\n${appended!.content.replace('補上驗證案例', '補上驗證案例（已修訂）')}`;
const shifted = reconcileMeetingTaskQuickNoteMetadata(appended!.content, shiftedContent, metadataResult.metadata);
assert('line shift and text edit rebase one entry', shifted.detachedIds.length === 0 && shifted.status === 'valid');
assert('reconciled entry adopts edited text', validateMeetingTaskQuickNoteAggregate(shiftedContent, shifted.metadata).valid);

const invalidContent = shiftedContent.replace('- 10:15 @[任務一](task:task-1)：補上驗證案例（已修訂）', '- 10:15 @[任務一](task:task-1)：');
const invalid = reconcileMeetingTaskQuickNoteMetadata(shiftedContent, invalidContent, shifted.metadata);
assert('deleted projection detaches instead of inventing a new entry', invalid.detachedIds.includes('submission-1'));

const records = [
  { id: 'record-old', type: 'meeting' as const, status: 'archived' as const, content: appended!.content, metadata: metadataResult.metadata },
  { id: 'record-new', type: 'meeting' as const, status: 'draft' as const, content: shiftedContent, metadata: shifted.metadata },
];
const projection = projectMeetingTaskQuickNotes(records, 'task-1');
assert('projection includes archived source and dedupes by record plus entry', projection.length === 2 && projection.some(item => item.archived));

const modal = readFileSync('src/components/TaskDetailsModal.tsx', 'utf8');
const hook = readFileSync('src/hooks/useTaskMeetingQuickNotes.ts', 'utf8');
const section = readFileSync('src/components/TaskNotes/TaskMeetingQuickNoteSection.tsx', 'utf8');
const contentSurface = readFileSync('src/components/TaskNotes/TaskNoteContentSurface.tsx', 'utf8');
const indexCss = readFileSync('src/index.css', 'utf8');
const store = readFileSync('src/store/useRecordStore.ts', 'utf8');
const backend = readFileSync('src/services/dataBackend.ts', 'utf8');
assert('task detail uses persistent quick-note section', modal.includes('TaskMeetingQuickNoteSection') && section.includes('data-task-meeting-quick-notes'));
assert('meeting quick-note history stays outside meeting composer condition', modal.includes('meetingQuickNotes.entries') && section.includes("if (!isMeetingMode && entries.length === 0 && !error) return null"));
assert('meeting quick-note history has one bounded Y-scroll container outside the composer', section.includes('data-task-meeting-history-scroll="true"') && section.includes('TASK_MEETING_HISTORY_MAX_HEIGHT_PX = 200') && (section.includes('overflow-y-auto') || contentSurface.includes('overflow-y-auto')) && indexCss.includes('--scrollbar-system-size: 3px') && !contentSurface.includes('scrollbar-thin') && section.includes('data-task-meeting-quick-notes-composer'));
assert('expanded quick-note history does not render a collapse action', section.includes('onClick={() => setExpanded(true)}') && !section.includes("'收合'"));
assert('store append uses explicit transaction result', store.includes("status: 'appended'" ) && store.includes('appendMeetingTaskQuickNoteMetadata'));
assert('task loader requests archived records', hook.includes('includeArchived: true') && backend.includes('options: { includeArchived?: boolean }'));
assert('legacy blue meeting composer is removed', !modal.includes('MessageSquareText') && !modal.includes('本次會議'));

const artifact = {
  devId: 'DEV-108',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-108-task-meeting-note-persistent-list',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};
const artifactPath = resolve('output/playwright/dev-108-task-meeting-note-persistent-list/static-result.json');
mkdirSync(resolve('output/playwright/dev-108-task-meeting-note-persistent-list'), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('DEV-108 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-108 static verification passed: ${checks.length} assertions.`);
