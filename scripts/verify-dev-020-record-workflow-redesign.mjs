import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

const checks = [
  {
    path: 'src/components/MainLayout.tsx',
    label: 'topbar record entry',
    snippets: [
      '新增會議記錄',
      '新增個人紀錄',
      'BriefcaseBusiness',
      'useRecordDraftGuard',
      'handleStartWorkLog',
      'const isNonMeetingRecordOpen = isRecordOpen && !isMeetingMode',
      'data-active-record-kind="meeting"',
      'data-active-record-kind="work-log"',
      '紀錄中',
      '已開啟會議紀錄；離開請使用右側紀錄欄的離開紀錄。',
      '已開啟個人紀錄；若要新增會議記錄，請先離開目前紀錄。',
      '!isMeetingMode && !isRecordOpen',
      "label: '紀錄庫'",
      '紀錄中先離開紀錄再切換檢視',
    ],
    forbiddenSnippets: [
      'LogOut',
      '<span className="hidden lg:inline">離開會議</span>',
      "label: '紀錄庫(開發中)'",
      '選取模式中無法切換檢視"',
    ],
  },
  {
    path: 'src/hooks/useRecordDraftGuard.ts',
    label: 'shared draft guard',
    snippets: [
      'showActionDialog',
      '存草稿後繼續',
      '不儲存，繼續',
      '取消',
      'saveDraft({ nodes })',
      'getRecordDraftSignature',
      'getMeetingRecordActionState',
    ],
  },
  {
    path: 'src/components/Records/RecordSidebar.tsx',
    label: 'record composer workflow',
    snippets: [
      'data-project-change-import-panel',
      'data-record-help-dialog',
      'data-record-context-summary',
      'data-record-sidebar-header',
      'data-record-composer-shell',
      'data-record-composer-header',
      'data-record-composer-close',
      'data-record-composer-summary',
      'data-record-summary-kind',
      'data-record-summary-status',
      'className="sr-only"',
      'data-record-composer-meta',
      'data-record-compact-controls',
      'data-record-status-summary',
      'data-record-visibility-control',
      'data-record-composer-linked-tasks',
      'isLinkedTasksOpen',
      'data-record-linked-tasks-toggle',
      'aria-expanded={isLinkedTasksOpen}',
      'data-record-linked-tasks-list',
      'data-record-composer-actions',
      '功能說明',
      '整理專案變化',
      '插入紀錄並開始撰寫',
      '整個看板',
      '整個工作區',
      '新增會後會議紀錄',
      '補一筆會後紀錄',
      "const exitRecordButtonLabel = '離開紀錄'",
      '離開紀錄；離開不等於發布',
      'aria-label={exitRecordButtonLabel}',
      'data-record-workflow-kind="meeting"',
      'data-record-workflow-kind="work-log"',
      'data-work-log-workflow-step',
      'project_import',
      '個人流程',
      '匯入、撰寫、存草稿與發布在同一條流程上操作。',
      'handleGuardedNewMeetingRecord',
      'handleGuardedClosePanel',
      'handleGuardedOpenExistingRecord',
      'eventLogService.listActivity',
      'createProjectChangeSynthesisInput',
      'synthesizeMeetingRecord',
      '目前狀態',
      '選取任務',
    ],
    forbiddenSnippets: [
      '<option value="published">已發布</option>',
      'onClick={closePanel}',
      "onClick={() => openNewRecord('meeting')}",
      "onClick={() => openNewRecord('work_log')}",
      "onClick={() => handleGuardedNewRecord('work_log')}",
      '關閉紀錄面板？',
      "aria-label={isMeetingMode ? '離開會議模式' : '關閉紀錄面板'}",
      "title={isMeetingMode ? '離開會議模式；離開不等於發布，若有未儲存變更會先詢問是否存草稿' : '關閉紀錄面板'}",
      "{isMeetingMode ? '會議速記' : '專案紀錄'}",
      '收合面板',
      '建立時已決定',
      '會議紀錄中',
      '個人紀錄中',
    ],
  },
  {
    path: 'src/utils/projectChangeImport.ts',
    label: 'project change import helper',
    snippets: [
      'PROJECT_CHANGE_EVENT_TYPES',
      'task_created',
      'task_status_changed',
      'task_dates_changed',
      'task_assigned',
      'task_collaborators_changed',
      'task_moved',
      'task_tags_changed',
      'task_archived',
      'task_restored',
      'createProjectChangeSynthesisInput',
      'path',
      'MeetingSynthesisInput',
    ],
  },
  {
    path: 'src/services/dataBackend.ts',
    label: 'activity event read service',
    snippets: [
      'ActivityEventListQuery',
      'localTestEventLogService.logActivity',
      'supabaseEventLogService.listActivity',
      'listActivity',
    ],
  },
  {
    path: 'src/services/localTestService.ts',
    label: 'local-test activity persistence',
    snippets: [
      'ACTIVITY_EVENTS_KEY',
      'localTestEventLogService',
      'readActivityEvents',
      'writeActivityEvents',
      'listActivity',
    ],
  },
  {
    path: 'src/services/supabase/projedService.ts',
    label: 'supabase activity query',
    snippets: [
      'ActivityEventListQuery',
      'ActivityEventRow',
      'mapActivityEvent',
      ".from('activity_events')",
      ".gte('created_at'",
      ".lte('created_at'",
    ],
  },
  {
    path: 'src/components/Records/RecordsView.tsx',
    label: 'records library guarded actions',
    snippets: [
      'useRecordDraftGuard',
      'handleNewMeetingRecord',
      'handleOpenRecord',
      '補一筆會後紀錄',
    ],
    forbiddenSnippets: [
      "onClick={() => handleNewRecord('work_log')}",
    ],
  },
  {
    path: 'src/components/Records/TaskRecordTimeline.tsx',
    label: 'task knowledge guarded actions',
    snippets: [
      'useRecordDraftGuard',
      'handleNewRecord',
      'handleOpenRecord',
      '補會後紀錄',
      '補工作紀錄',
      '自動關聯目前任務',
    ],
  },
  {
    path: 'src/store/useRecordStore.ts',
    label: 'draft save semantics',
    snippets: [
      "if (wantsPublish && !draft.content.trim())",
      "set({ error: '請先輸入標題。' })",
    ],
    forbiddenSnippets: [
      "(wantsPublish || draft.type === 'work_log') && !draft.content.trim()",
      '標題與內容不可空白。',
    ],
  },
];

const failures = [];

for (const check of checks) {
  const content = read(check.path);
  for (const snippet of check.snippets) {
    if (!content.includes(snippet)) failures.push(`${check.label} missing: ${snippet}`);
  }
  for (const snippet of check.forbiddenSnippets || []) {
    if (content.includes(snippet)) failures.push(`${check.label} forbidden snippet present: ${snippet}`);
  }
}

if (failures.length) {
  console.error('DEV-020 record workflow redesign verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`DEV-020 record workflow redesign verification passed: ${checks.length} file groups checked.`);
