import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRecordComposerVariant } from '../src/utils/recordComposerVariant';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};
const read = (path: string) => readFileSync(path, 'utf8');

const meetingDraft = { type: 'meeting' as const };
const workLogDraft = { type: 'work_log' as const };
assert('meeting draft in live session is live-meeting', getRecordComposerVariant(meetingDraft, true) === 'live-meeting');
assert('existing meeting draft stays meeting-record', getRecordComposerVariant(meetingDraft, false) === 'meeting-record');
assert('work log draft is work-log', getRecordComposerVariant(workLogDraft, false) === 'work-log');
assert('empty panel is empty', getRecordComposerVariant(null, false) === 'empty');
assert('invalid meeting session fails closed', getRecordComposerVariant(null, true) === 'invalid');
assert('work log cannot masquerade as live meeting', getRecordComposerVariant(workLogDraft, true) === 'invalid');

const sidebar = read('src/components/Records/RecordSidebar.tsx');
const editor = read('src/components/Records/RecordContentEditor.tsx');
const store = read('src/store/useRecordStore.ts');
const spec = read('ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md');
const qa = read('ai-doc/qa/QA-DEV-107-record-sidebar-draft-layout.md');

assert('sidebar derives one composer variant authority', sidebar.includes('getRecordComposerVariant(draft, isMeetingMode)') && sidebar.includes('const isLiveMeeting = composerVariant === \'live-meeting\';'));
assert('variant is observable in the DOM', sidebar.includes('data-record-composer-variant={composerVariant}'));
assert('work-log workflow is restricted to work-log variant', sidebar.includes(') : isWorkLog ?') && sidebar.includes('<WorkLogWorkflowCard'));
assert('recent records are restricted to empty variant', sidebar.includes("{composerVariant === 'empty' ? (") && sidebar.includes('data-record-recent-records'));
assert('drawer owns vertical scrolling', sidebar.includes('data-record-composer-scroll-owner') && sidebar.includes('flex min-h-0 flex-1 flex-col overflow-auto'));
assert('meeting min-height follows record type', sidebar.includes("const contentMinHeightClass = draft?.type === 'meeting' ? 'min-h-[220px]' : 'min-h-[150px]';"));
const existingRecordBlockStart = store.indexOf('openExistingRecord: (record)');
const existingRecordBlockEnd = store.indexOf('\n  startMeetingRecord:', existingRecordBlockStart);
assert('existing meeting record does not switch live session state', existingRecordBlockStart >= 0 && existingRecordBlockEnd > existingRecordBlockStart && store.slice(existingRecordBlockStart, existingRecordBlockEnd).includes('isMeetingMode: false'));
assert('editor has no native resize affordance', !editor.includes('resize-y') && editor.includes('resize-none overflow-visible'));
assert('editor declares drawer scroll owner', editor.includes('data-record-content-editor-scroll-owner="record-sidebar"'));
assert('meeting-record hides live-only controls', sidebar.includes('{isLiveMeeting ? (') && sidebar.includes('{isLiveMeeting && meetingSynthesisStatus !== \'idle\' ? ('));
assert('spec defines the corrective variant and scroll contract', spec.includes('meeting-record') && spec.includes('唯一垂直 scroll owner') && spec.includes('不得以切回 meeting mode 修補'));
assert('QA defines the exact existing-draft case', qa.includes('TC-107-001') && qa.includes('既有會議草稿 exact regression') && qa.includes('1902x960'));
assert('QA keeps mobile meeting negative boundary', qa.includes('TC-107-009') && qa.includes('390 mobile-negative'));
assert('no overlay or overflow-hidden workaround was added', !sidebar.includes('overflow-hidden') && !editor.includes('overflow-hidden'));

const artifact = {
  devId: 'DEV-107',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-107-record-sidebar-layout',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};
const artifactPath = resolve('output/qa/dev-107-record-sidebar-layout/result.json');
mkdirSync(resolve('output/qa/dev-107-record-sidebar-layout'), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('DEV-107 record sidebar layout verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-107 record sidebar layout verification passed: ${checks.length} source and variant checks.`);
