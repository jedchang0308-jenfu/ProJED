import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const checks = [
  {
    path: 'src/utils/meetingRecordWorkflow.ts',
    label: 'meeting record workflow helper',
    snippets: [
      'MeetingRecordWorkflowStage',
      'MeetingWorkflowStepAction',
      'MeetingWorkflowStepVisualState',
      'MeetingWorkflowStepTone',
      'getMeetingRecordActionState',
      'getMeetingWorkflowStepActions',
      'getRecordDraftSignature',
      'canSaveDraft',
      'canRunAi',
      'canPublish',
      'outcomeLabel',
      'isOptional',
      'ariaDescription',
      "'optional'",
      '直接發布只保存目前編輯器內容',
    ],
  },
  {
    path: 'src/hooks/useMeetingModeExitGuard.ts',
    label: 'meeting mode exit guard',
    snippets: [
      'showActionDialog',
      'closePanel',
      'save_and_exit',
      'exit_without_saving',
      '存草稿後離開',
      '直接離開',
      '關閉會議速記，不保存新變更。',
      'saveDraft({ nodes })',
    ],
    forbiddenSnippets: [
      '只離開會議模式，不保存新變更。',
    ],
  },
  {
    path: 'src/components/Records/RecordSidebar.tsx',
    label: 'RecordSidebar guarded workflow',
    snippets: [
      'MeetingWorkflowArrowStepper',
      'data-meeting-workflow-arrow-stepper',
      'data-meeting-workflow-step',
      'data-meeting-workflow-step-state',
      'data-meeting-workflow-step-optional',
      "'meeting-mode-locked'",
      "'draft-type-locked'",
      'data-record-context-summary',
      'data-record-composer-header',
      'data-record-composer-close',
      'data-record-composer-summary',
      'data-record-summary-kind',
      'data-record-summary-status',
      'className="sr-only"',
      'data-record-composer-workflow',
      'data-record-composer-linked-tasks',
      'data-record-composer-actions',
      'getMeetingWorkflowStepActions',
      'clipPath',
      'RecordContextSummary',
      'useMeetingModeExitGuard',
      'requestExitMeetingMode',
      '先選擇紀錄類型',
      '新增會後會議紀錄',
      '補一筆會後紀錄',
      'handleGuardedNewMeetingRecord',
      '發布工作紀錄',
      '收合會議速記面板',
      "const exitRecordButtonLabel = '離開紀錄'",
      '離開紀錄；離開不等於發布',
      'aria-label={exitRecordButtonLabel}',
      'PanelRightClose',
      'AI整理',
      '直接發布會保存目前編輯器內容',
      '目前狀態',
    ],
    forbiddenSnippets: [
      'MEETING_TERMS.action.exit',
      'MeetingWorkflowStepper',
      'grid grid-cols-5 gap-1',
      '<ChevronRight size={17}',
      'data-record-type-option',
      'MEETING_TERMS.action.collapse',
      "onClick={() => handleGuardedNewRecord('work_log')}",
      '收合面板',
      '關閉紀錄面板？',
      "aria-label={isMeetingMode ? '離開會議模式' : '關閉紀錄面板'}",
      "title={isMeetingMode ? '離開會議模式；離開不等於發布，若有未儲存變更會先詢問是否存草稿' : '關閉紀錄面板'}",
      'compactMeetingStatus',
      'compactMeetingNext',
      'needsMeetingSynthesis',
      '發布前會先由 AI 統整草稿',
      'AI整理後再發布',
      '>結束會議<',
      'data-record-type-create-before-editing',
      '建立時已決定',
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
      '新增會議記錄',
      'data-active-record-kind="meeting"',
      '紀錄中',
      '已開啟會議紀錄；離開請使用右側紀錄欄的離開紀錄。',
      '紀錄中先離開紀錄再切換檢視',
    ],
    forbiddenSnippets: [
      '結束會議模式，保留目前紀錄草稿',
      '結束會議',
      'LogOut',
      '<span className="hidden lg:inline">離開會議</span>',
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
