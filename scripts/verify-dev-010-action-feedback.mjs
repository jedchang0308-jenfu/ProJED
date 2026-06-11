import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const checks = [
  {
    path: 'src/utils/meetingRecordWorkflow.ts',
    label: 'meeting record workflow helper',
    snippets: [
      'MeetingRecordWorkflowStage',
      'getMeetingRecordActionState',
      'getRecordDraftSignature',
      'canSaveDraft',
      'canRunAi',
      'canPublish',
      '直接發布只保存目前編輯器內容',
    ],
  },
  {
    path: 'src/hooks/useMeetingModeExitGuard.ts',
    label: 'meeting mode exit guard',
    snippets: [
      'showActionDialog',
      'save_and_exit',
      'exit_without_saving',
      '存草稿後離開',
      '直接離開',
      'saveDraft({ nodes })',
    ],
  },
  {
    path: 'src/components/Records/RecordSidebar.tsx',
    label: 'RecordSidebar guarded workflow',
    snippets: [
      'MeetingWorkflowStepper',
      'meetingActionState.canSaveDraft',
      'meetingActionState.canRunAi',
      'meetingActionState.canPublish',
      'MEETING_TERMS',
      'AI整理',
      '直接發布目前編輯器內容',
      '離開會議模式',
      '流程狀態',
    ],
    forbiddenSnippets: [
      'needsMeetingSynthesis',
      '發布前會先由 AI 統整草稿',
      'AI整理後再發布',
      '>結束會議<',
    ],
  },
  {
    path: 'src/store/useRecordStore.ts',
    label: 'record store dirty baseline and optional AI',
    snippets: [
      'draftBaselineSignature',
      'getRecordDraftSignature',
      'lastSaveFeedback',
      'savedAt: Date.now()',
      'synthesizeMeetingDraft',
    ],
    forbiddenSnippets: [
      'await get().synthesizeMeetingDraft',
      'meetingSynthesisStatus !==',
      'appendMeetingActivitiesToDraft(currentDraft',
    ],
  },
  {
    path: 'src/components/MainLayout.tsx',
    label: 'MainLayout guarded meeting exit',
    snippets: [
      'useMeetingModeExitGuard',
      'requestExitMeetingMode',
      '離開會議',
      '未儲存變更會先詢問是否存草稿',
    ],
    forbiddenSnippets: [
      '結束會議模式，保留目前紀錄草稿',
      '結束會議',
    ],
  },
  {
    path: 'src/store/useDialogStore.ts',
    label: 'action dialog store',
    snippets: [
      'showActionDialog',
      "type: 'action'",
      'actions: config.actions',
    ],
  },
  {
    path: 'src/components/GlobalDialog.tsx',
    label: 'action dialog UI',
    snippets: [
      "type === 'action'",
      'actions.map',
      'action.description',
      'action.variant',
    ],
  },
];

const failures = [];

for (const check of checks) {
  const content = read(check.path);
  for (const snippet of check.snippets) {
    if (!content.includes(snippet)) {
      failures.push(`${check.label} missing: ${snippet}`);
    }
  }
  for (const snippet of check.forbiddenSnippets || []) {
    if (content.includes(snippet)) {
      failures.push(`${check.label} forbidden snippet present: ${snippet}`);
    }
  }
}

if (failures.length > 0) {
  console.error('DEV-010/018 action feedback verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`DEV-010/018 action feedback verification passed: ${checks.length} file groups checked.`);
