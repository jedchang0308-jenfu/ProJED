import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/Records/RecordSidebar.tsx', 'utf8');
const editorSource = readFileSync('src/components/Records/RecordContentEditor.tsx', 'utf8');
const recordStore = readFileSync('src/store/useRecordStore.ts', 'utf8');
const spec = readFileSync('ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md', 'utf8');

const required = [
  'data-record-sidebar-title',
  'data-record-sidebar-collapse-toggle',
  'data-record-sidebar-collapse-direction="right"',
  'data-record-sidebar-expand-direction="left"',
  'aria-label={isMeetingMode ? \'收合會議速記面板\' : \'收合紀錄面板\'}',
  '<ChevronRight size={16} />',
  '<ChevronLeft size={17} />',
  'shouldShowMeetingRecoveryStatus',
  'meetingDraftRecovery.cloudStatus === \'saved\'',
  'data-record-datetime-input={dataAttribute}',
  'YYYY/MM/DD HH:mm',
  'data-record-meeting-meta-grid',
  'flex items-center gap-2 px-2 py-1',
  'h-6 min-w-0 flex-1',
  "isMeetingMode ? '分享範圍' : '紀錄分享範圍'",
  ') : !isMeetingMode ? (',
  'flex h-9 min-w-0 flex-1',
  'cursor-pointer',
  'hover:bg-emerald-800',
  'className="truncate text-[10px] font-semibold leading-3"',
  'className="flex min-h-0 flex-1 flex-col overflow-auto"',
  '<section className="flex min-h-0 flex-1 flex-col border-b border-slate-100 p-3">',
  '<div className="flex min-h-0 flex-1 flex-col space-y-3">',
  'data-record-composer-meta className="flex flex-1 flex-col space-y-3"',
  "${isMeetingMode ? 'min-h-[220px]' : 'min-h-[150px]'}",
  'editorContainerClassName={isMeetingMode ?',
];

const forbidden = [
  'BookOpenText',
  'CircleHelp',
  'PanelRightClose',
  'PanelRightOpen',
  'RecordHelpDialog',
  'data-record-help-dialog',
  '紀錄功能說明',
  'AI選用',
  '本機已保存，雲端已完成 checkpoint',
  'AI整理來源：任務變更',
  '速記、AI整理、校稿與發布在同一條流程上操作。',
  '會議流程',
  'getMeetingWorkflowStepIcon',
  'getMeetingWorkflowStepHint',
];

const failures = [];
for (const snippet of required) {
  if (!source.includes(snippet)) failures.push(`source missing: ${snippet}`);
}
for (const snippet of forbidden) {
  if (source.includes(snippet)) failures.push(`source forbidden snippet present: ${snippet}`);
}
for (const snippet of ['editorContainerClassName?: string', 'editorContainerClassName ||']) {
  if (!editorSource.includes(snippet)) failures.push(`editor source missing: ${snippet}`);
}
if (!recordStore.includes("? `會議紀錄 ${now.format('YYYY/MM/DD')}`")) {
  failures.push('new meeting default title should not include a time suffix');
}
if (!spec.includes('2026-08-27 UI 精簡 addendum') || !spec.includes('不顯示 `0 / 未選取` 摘要')) {
  failures.push('SPEC-020 should document the current sidebar quietness addendum');
}

if (failures.length) {
  console.error('DEV-092 record sidebar quietness verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`DEV-092 record sidebar quietness verification passed: ${required.length + forbidden.length + 1 + 2} checks.`);
