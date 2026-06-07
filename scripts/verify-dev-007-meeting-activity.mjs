import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const checks = [
  {
    path: 'src/store/useRecordStore.ts',
    label: 'record store meeting activity buffer',
    snippets: [
      'meetingActivities: MeetingTaskActivity[]',
      'appendedMeetingActivityIds: string[]',
      'recordMeetingTaskActivity',
      'appendMeetingActivitiesToDraft',
      '## 會議中任務變更',
      'serializeTaskMention(activity.nodeId, activity.title)',
      'syncDraftContentLinks(draft, content)',
    ],
  },
  {
    path: 'src/store/useWbsStore.ts',
    label: 'wbs update meeting activity bridge',
    snippets: [
      "import useRecordStore from './useRecordStore'",
      'recordMeetingTaskActivity(newNode, event.eventType, event.payload)',
      "recordMeetingTaskActivity(normalizedNode, 'task_created'",
      "recordMeetingTaskActivity(afterNode, 'task_status_changed'",
    ],
  },
  {
    path: 'src/components/Wbs/KanbanCard.tsx',
    label: 'kanban card native meeting behavior',
    snippets: [
      'const isRecordCaptureMode = isRecordSelectionMode;',
      'insertRecordTaskMention(nodeId, node.title || nodeId)',
    ],
    forbiddenSnippets: [
      'isMeetingMode && meetingTaskCaptureEnabled',
      'const meetingTaskCaptureEnabled = useRecordStore',
    ],
  },
  {
    path: 'src/components/Wbs/KanbanChecklist.tsx',
    label: 'kanban checklist native meeting behavior',
    snippets: [
      'const isRecordCaptureMode = isRecordSelectionMode;',
      'insertRecordTaskMention(child.id, child.title || child.id)',
    ],
    forbiddenSnippets: [
      'isMeetingMode && meetingTaskCaptureEnabled',
      'const meetingTaskCaptureEnabled = useRecordStore',
    ],
  },
  {
    path: 'src/components/BoardView.tsx',
    label: 'meeting status wording',
    snippets: [
      '看板維持一般編輯',
      '任務變更會納入紀錄',
    ],
    forbiddenSnippets: [
      '點議題會插入紀錄',
      'toggleMeetingTaskCapture',
    ],
  },
  {
    path: 'src/components/Records/RecordSidebar.tsx',
    label: 'meeting activity sidebar evidence',
    snippets: [
      '本次會議變更',
      'meetingActivities.length',
      '插入任務',
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
  console.error('DEV-007 meeting activity verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`DEV-007 meeting activity verification passed: ${checks.length} file groups checked.`);
