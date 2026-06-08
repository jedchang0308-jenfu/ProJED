import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const checks = [
  {
    path: 'src/components/BoardView.tsx',
    label: 'BoardView action feedback',
    snippets: [
      'canSaveMeetingRecord',
      'canPublishMeetingRecord',
      'title={!canSaveMeetingRecord',
      'title={isMeetingPublished',
      '請先輸入會議標題；AI整理後再發布。',
      'publishMeetingLabel',
      'lastSaveFeedback',
      '會議紀錄已發布',
    ],
    forbiddenSnippets: [
      'disabled={!canSaveMeetingRecord || savingRecordDraft}',
      '任務變更會納入紀錄',
    ],
  },
  {
    path: 'src/components/Records/RecordSidebar.tsx',
    label: 'RecordSidebar action feedback',
    snippets: [
      'canSave',
      'canPublish',
      'title={!canSave',
      'title={isPublished',
      '請先輸入標題；AI整理後再發布。',
      'publishLabel',
      'lastSaveFeedback',
      '已儲存為正式紀錄',
    ],
    forbiddenSnippets: [
      'disabled={!canSave || saving}',
      '任務狀態、移動與關鍵變更會在儲存時納入紀錄',
    ],
  },
  {
    path: 'src/store/useRecordStore.ts',
    label: 'record store draft/publish split',
    snippets: [
      'const wantsPublish = currentDraft.status ===',
      "draft.type === 'work_log'",
      'await get().synthesizeMeetingDraft(options.nodes)',
      'lastSaveFeedback',
      'savedAt: Date.now()',
    ],
    forbiddenSnippets: [
      'const appended = isMeetingMode',
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
  console.error('DEV-010 action feedback verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`DEV-010 action feedback verification passed: ${checks.length} file groups checked.`);
