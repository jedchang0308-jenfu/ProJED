import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-011');
const sources = [
  'src/utils/recordContentMentions.ts',
  'src/utils/meetingRecordSynthesis.ts',
];

rmSync(tempRoot, { recursive: true, force: true });

const rewriteImports = (outputText) =>
  outputText.replaceAll("from './recordContentMentions'", "from './recordContentMentions.js'");

for (const sourcePath of sources) {
  const source = readFileSync(sourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false,
    },
    fileName: sourcePath,
  });
  const outPath = join(tempRoot, sourcePath.replace(/^src[\\/]/, '').replace(/\.tsx?$/, '.js'));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rewriteImports(outputText));
}

const mentions = await import(pathToFileURL(join(tempRoot, 'utils', 'recordContentMentions.js')).href);
const synthesis = await import(pathToFileURL(join(tempRoot, 'utils', 'meetingRecordSynthesis.js')).href);

const failures = [];
const assert = (label, condition) => {
  if (!condition) failures.push(label);
};

const taskA = mentions.serializeTaskMention('task_a', '任務 A');
const taskB = mentions.serializeTaskMention('task_b', '任務 B');
const result = synthesis.buildDeterministicMeetingSynthesis({
  title: '週會',
  participantsText: 'PM, RD, QA',
  rawContent: [
    '今天討論兩件事。',
    '',
    `- 09:00 ${taskA} 設計方向確認，RD 先改資料流。`,
    `- 09:04 ${taskB} QA case 要補實際輸入測試。`,
  ].join('\n'),
  taskLinks: [
    { nodeId: 'task_a', role: 'main' },
    { nodeId: 'task_b', role: 'related' },
  ],
  tasks: [
    { id: 'task_a', title: '任務 A', status: 'in_progress', detailNotesText: '已有初版設計。' },
    { id: 'task_b', title: '任務 B', status: 'todo', description: '補 UX 驗證計畫。' },
  ],
  activities: [
    { eventType: 'task_status_changed', nodeId: 'task_a', title: '任務 A', occurredAt: 1780800000000, summary: '待辦 -> 進行中' },
    { eventType: 'task_status_changed', nodeId: 'task_a', title: '任務 A', occurredAt: 1780800300000, summary: '待辦 -> 進行中' },
    { eventType: 'task_dates_changed', nodeId: 'task_b', title: '任務 B', occurredAt: 1780800600000, summary: '排程更新 2026-06-07 -> 2026-06-09' },
  ],
});

assert('result has numbered summary heading', result.content.includes('1. 本次會議總結'));
assert('result has numbered task-oriented heading', result.content.includes('2. 任務討論與結論'));
assert('result has numbered other heading', result.content.includes('3. 其他'));
assert('result does not use markdown headings', !/^#{1,6}\s+/m.test(result.content));
assert('result keeps task A token', result.content.includes(taskA));
assert('result keeps task B token', result.content.includes(taskB));
assert('duplicate status activity is collapsed', (result.content.match(/待辦 -> 進行中/g) || []).length === 1);
assert('raw timestamp lines are not copied', !result.content.includes('09:00') && !result.content.includes('09:04'));
assert('linkedTaskIds include task A', result.linkedTaskIds.includes('task_a'));
assert('linkedTaskIds include task B', result.linkedTaskIds.includes('task_b'));

const listTask = mentions.serializeTaskMention('list_research', '研發開發');
const parentTask = mentions.serializeTaskMention('parent_a', '父任務 A');
const childTask = mentions.serializeTaskMention('child_a1', '子任務 A-1');
const grandchildTask = mentions.serializeTaskMention('grandchild_a21', '孫任務 A-2-1');
const siblingTask = mentions.serializeTaskMention('sibling_a2', '子任務 A-2');
const treeResult = synthesis.buildDeterministicMeetingSynthesis({
  title: '父子任務週會',
  participantsText: 'PM, RD, QA',
  rawContent: [
    `- 10:00 ${parentTask} 父任務本身的入口設計確認，不需要再拆新任務。`,
    `- 10:10 ${childTask} RD 要補權限錯誤代碼，QA 明天以前補失敗回傳測試。`,
    `- 10:20 ${grandchildTask} PM 今天先列出三種權限失敗情境。`,
  ].join('\n'),
  taskLinks: [
    { nodeId: 'parent_a', role: 'main' },
    { nodeId: 'child_a1', role: 'related' },
    { nodeId: 'grandchild_a21', role: 'related' },
  ],
  tasks: [
    {
      id: 'list_research',
      title: '研發開發',
      parentId: null,
      path: [{ id: 'list_research', title: '研發開發' }],
      depth: 0,
      groupId: 'list_research',
      groupTitle: '研發開發',
      order: 0,
    },
    {
      id: 'parent_a',
      title: '父任務 A',
      parentId: 'list_research',
      path: [{ id: 'list_research', title: '研發開發' }, { id: 'parent_a', title: '父任務 A' }],
      depth: 1,
      groupId: 'list_research',
      groupTitle: '研發開發',
      order: 0,
    },
    {
      id: 'child_a1',
      title: '子任務 A-1',
      parentId: 'parent_a',
      path: [{ id: 'list_research', title: '研發開發' }, { id: 'parent_a', title: '父任務 A' }, { id: 'child_a1', title: '子任務 A-1' }],
      depth: 2,
      groupId: 'list_research',
      groupTitle: '研發開發',
      order: 0,
    },
    {
      id: 'sibling_a2',
      title: '子任務 A-2',
      parentId: 'parent_a',
      path: [{ id: 'list_research', title: '研發開發' }, { id: 'parent_a', title: '父任務 A' }, { id: 'sibling_a2', title: '子任務 A-2' }],
      depth: 2,
      groupId: 'list_research',
      groupTitle: '研發開發',
      order: 1,
    },
    {
      id: 'grandchild_a21',
      title: '孫任務 A-2-1',
      parentId: 'sibling_a2',
      path: [
        { id: 'list_research', title: '研發開發' },
        { id: 'parent_a', title: '父任務 A' },
        { id: 'sibling_a2', title: '子任務 A-2' },
        { id: 'grandchild_a21', title: '孫任務 A-2-1' },
      ],
      depth: 3,
      groupId: 'list_research',
      groupTitle: '研發開發',
      order: 0,
    },
  ],
  activities: [
    { eventType: 'task_status_changed', nodeId: 'child_a1', title: '子任務 A-1', occurredAt: 1780800000000, summary: '待辦 -> 進行中' },
    { eventType: 'task_created', nodeId: 'grandchild_a21', title: '孫任務 A-2-1', occurredAt: 1780800300000, summary: '新增任務' },
  ],
});

assert('tree synthesis has one numbered list section', treeResult.content.includes(`2.1 ${listTask}`));
assert('tree synthesis has card section with full path', treeResult.content.includes(`2.1.1 ${listTask} ${parentTask}`));
assert('tree synthesis does not flatten child as parent numbered section', !treeResult.content.includes(`2.2 ${listTask} ${parentTask} ${childTask}`));
assert('tree synthesis does not flatten grandchild as parent numbered section', !treeResult.content.includes(`2.2 ${listTask} ${parentTask} ${siblingTask} ${grandchildTask}`));
assert('tree synthesis includes child subsection with full path', treeResult.content.includes(`2.1.1.1 ${listTask} ${parentTask} ${childTask}`));
assert('tree synthesis includes sibling container with full path', treeResult.content.includes(`2.1.1.2 ${listTask} ${parentTask} ${siblingTask}`));
assert('tree synthesis includes deep task with full path', treeResult.content.includes(`2.1.1.2.1 ${listTask} ${parentTask} ${siblingTask} ${grandchildTask}`));
assert('tree synthesis does not use system task labels', !treeResult.content.includes('本任務') && !treeResult.content.includes('子任務：'));
assert('tree synthesis does not use markdown headings', !/^#{1,6}\s+/m.test(treeResult.content));
assert('tree synthesis keeps child activity in child group', treeResult.content.includes('待辦 -> 進行中'));
assert('tree linked ids include list tag', treeResult.linkedTaskIds.includes('list_research'));
assert('tree linked ids include card tag', treeResult.linkedTaskIds.includes('parent_a'));
assert('tree linked ids include child tag', treeResult.linkedTaskIds.includes('child_a1'));
assert('tree linked ids include sibling container tag', treeResult.linkedTaskIds.includes('sibling_a2'));
assert('tree linked ids include grandchild tag', treeResult.linkedTaskIds.includes('grandchild_a21'));

const completedResultTask = mentions.serializeTaskMention('rounding_done', '金額四捨五入規則補測');
const completedResult = synthesis.buildDeterministicMeetingSynthesis({
  title: '補測結果會議',
  participantsText: 'QA',
  rawContent: `- 11:20 ${completedResultTask} QA 補測三筆邊界金額：0.004、0.005、999999.995；結果與財務確認一致，採四捨五入到小數第二位。`,
  taskLinks: [{ nodeId: 'rounding_done', role: 'related' }],
  tasks: [{ id: 'rounding_done', title: '金額四捨五入規則補測' }],
  activities: [
    { eventType: 'task_status_changed', nodeId: 'rounding_done', title: '金額四捨五入規則補測', occurredAt: 1780800900000, summary: '待辦 -> 已完成' },
  ],
});

assert('completed result note is not fabricated as next step', !completedResult.content.includes('下一步：'));
assert('completed result note remains in narrative', completedResult.content.includes('QA 補測三筆邊界金額'));

const storeSource = readFileSync('src/store/useRecordStore.ts', 'utf8');
for (const snippet of [
  'meetingSynthesisStatus',
  'synthesizeMeetingDraft',
  'synthesizeMeetingRecord',
  'draft: preservedDraft',
  'getMeetingTaskPath',
  'groupId: group.id',
]) {
  assert(`useRecordStore missing snippet: ${snippet}`, storeSource.includes(snippet));
}
assert('saveDraft no longer appends raw activity before publish', !storeSource.includes('appendMeetingActivitiesToDraft(currentDraft'));
assert('DEV-018 publish no longer auto-runs AI synthesis', !storeSource.includes('await get().synthesizeMeetingDraft'));

const serviceSource = readFileSync('src/services/meetingSynthesisService.ts', 'utf8');
for (const snippet of [
  "supabase.functions.invoke<MeetingSynthesisResponse>",
  "'synthesize_meeting_record'",
  'buildDeterministicMeetingSynthesis(input)',
  'MeetingSynthesisError',
]) {
  assert(`meetingSynthesisService missing snippet: ${snippet}`, serviceSource.includes(snippet));
}

const edgeSource = readFileSync('supabase/functions/synthesize_meeting_record/index.ts', 'utf8');
for (const snippet of [
  'GEMINI_API_KEY',
  'generateContent',
  'responseMimeType',
  '不要把原始 activity 流水帳逐筆列入正文',
  '不得要求建立、修改、移動、刪除任務',
  '自然語言',
  'tasks[].path',
  '2.x 是列表層',
  '不要加「本任務」或「子任務：」',
  '不得有任何行以 #',
  '容器節點若沒有 rawContent 或 activities 直接指向它',
]) {
  assert(`synthesize_meeting_record edge function missing snippet: ${snippet}`, edgeSource.includes(snippet));
}

const configSource = readFileSync('supabase/config.toml', 'utf8');
assert('supabase config includes function', configSource.includes('[functions.synthesize_meeting_record]'));

if (failures.length > 0) {
  console.error('DEV-011 AI meeting synthesis verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-011 AI meeting synthesis verification passed: task-oriented synthesis, no raw activity append, service, edge function, and config checked.');
