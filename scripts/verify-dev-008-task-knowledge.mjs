import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-008');
const sources = [
  'src/utils/recordContentMentions.ts',
  'src/utils/taskKnowledgeSnippets.ts',
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
const taskKnowledge = await import(pathToFileURL(join(tempRoot, 'utils', 'taskKnowledgeSnippets.js')).href);

const failures = [];
const assert = (label, condition) => {
  if (!condition) failures.push(label);
};
const assertEqual = (label, actual, expected) => {
  if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const taskA = mentions.serializeTaskMention('task_a', '任務 A');
const taskB = mentions.serializeTaskMention('task_b', '任務 B');
const synthesizedMeeting = [
  '## 本次會議總結',
  '- 本次會議依任務彙整，不使用逐筆流水帳。',
  '',
  '## 任務討論與結論',
  `### ${taskA}`,
  '- 結論：A 的設計方向已確認。',
  '- 決議：RD 先完成資料流調整。',
  '- 待辦：PM 補驗收標準。',
  '- 阻塞：未記錄明確阻塞。',
  '- 狀態變更摘要：待辦 -> 進行中；排程更新已合併。',
  '',
  `### ${taskB}`,
  '- 結論：B 的 QA case 要補齊。',
  '- 決議：QA 先補實際輸入測試。',
  '- 待辦：QC 做 viewport smoke。',
  '- 阻塞：未記錄明確阻塞。',
  '- 狀態變更摘要：本次未記錄狀態變更。',
  '',
  '## 待校稿項目',
  '- 請確認 A / B 的負責人與期限。',
].join('\n');

const snippetsA = taskKnowledge.extractTaskRecordSnippets(synthesizedMeeting, 'task_a');
const snippetsB = taskKnowledge.extractTaskRecordSnippets(synthesizedMeeting, 'task_b');

assertEqual('task A snippet count', snippetsA.length, 1);
assert('task A includes conclusion', snippetsA[0]?.text.includes('A 的設計方向已確認'));
assert('task A includes status summary', snippetsA[0]?.text.includes('狀態變更摘要'));
assert('task A excludes task B detail', snippetsA.every(snippet => !snippet.text.includes('B 的 QA case')));

assertEqual('task B snippet count', snippetsB.length, 1);
assert('task B includes its discussion', snippetsB[0]?.text.includes('B 的 QA case'));
assert('task B excludes task A detail', !snippetsB[0]?.text.includes('A 的設計方向'));

const linkedOnly = taskKnowledge.extractTaskRecordSnippets('只有關聯任務，沒有 inline tag 的紀錄內容。', 'task_a');
assertEqual('linked-only fallback count', linkedOnly.length, 1);
assertEqual('linked-only fallback kind', linkedOnly[0]?.kind, 'linked_record');
assert('linked-only fallback text is visible', linkedOnly[0]?.text.includes('只有關聯任務'));

assert('query matches current task snippet', taskKnowledge.taskKnowledgeMatchesQuery('設計方向', snippetsA.map(snippet => snippet.text)));
assert('query excludes other task detail', !taskKnowledge.taskKnowledgeMatchesQuery('QA case', snippetsA.map(snippet => snippet.text)));

const listTask = mentions.serializeTaskMention('list_research', '研發開發');
const parentTask = mentions.serializeTaskMention('parent_a', '父任務 A');
const childTask = mentions.serializeTaskMention('child_a1', '子任務 A-1');
const siblingTask = mentions.serializeTaskMention('child_a2', '子任務 A-2');
const treeMeeting = [
  '## 任務討論與結論',
  `### ${listTask}`,
  `#### ${parentTask}`,
  '父任務入口設計確認。',
  `##### ${childTask}`,
  'RD 要補權限錯誤代碼，QA 明天以前補失敗回傳測試。',
  `##### ${siblingTask}`,
  '兄弟任務只確認排程，不影響子任務 A-1。',
  '',
  '## 待校稿項目',
  '- 請確認。'
].join('\n');
const listTreeSnippets = taskKnowledge.extractTaskRecordSnippets(treeMeeting, 'list_research', { maxLength: 700 });
const parentTreeSnippets = taskKnowledge.extractTaskRecordSnippets(treeMeeting, 'parent_a', { maxLength: 700 });
const childTreeSnippets = taskKnowledge.extractTaskRecordSnippets(treeMeeting, 'child_a1', { maxLength: 700 });

assertEqual('tree list snippet count', listTreeSnippets.length, 1);
assert('tree list snippet includes grouped card context', listTreeSnippets[0]?.text.includes('父任務入口設計確認'));
assertEqual('tree parent snippet count', parentTreeSnippets.length, 1);
assert('tree parent snippet includes grouped child context', parentTreeSnippets[0]?.text.includes('RD 要補權限錯誤代碼'));
assertEqual('tree child snippet count', childTreeSnippets.length, 1);
assert('tree child snippet keeps child detail', childTreeSnippets[0]?.text.includes('QA 明天以前補失敗回傳測試'));
assert('tree child snippet excludes sibling detail', !childTreeSnippets[0]?.text.includes('兄弟任務只確認排程'));

const numberedTreeMeeting = [
  '2. 任務討論與結論',
  `2.1 ${listTask}`,
  `2.1.1 ${parentTask}`,
  '父任務入口設計確認。',
  `2.1.1.1 ${childTask}`,
  'RD 要補權限錯誤代碼，QA 明天以前補失敗回傳測試。',
  `2.1.1.2 ${siblingTask}`,
  '兄弟任務只確認排程，不影響子任務 A-1。',
  '',
  '3. 待校稿項目',
  '- 請確認。'
].join('\n');
const numberedListSnippets = taskKnowledge.extractTaskRecordSnippets(numberedTreeMeeting, 'list_research', { maxLength: 700 });
const numberedParentSnippets = taskKnowledge.extractTaskRecordSnippets(numberedTreeMeeting, 'parent_a', { maxLength: 700 });
const numberedChildSnippets = taskKnowledge.extractTaskRecordSnippets(numberedTreeMeeting, 'child_a1', { maxLength: 700 });

assertEqual('numbered tree list snippet count', numberedListSnippets.length, 1);
assert('numbered tree list snippet includes grouped card context', numberedListSnippets[0]?.text.includes('父任務入口設計確認'));
assertEqual('numbered tree parent snippet count', numberedParentSnippets.length, 1);
assert('numbered tree parent snippet includes grouped child context', numberedParentSnippets[0]?.text.includes('RD 要補權限錯誤代碼'));
assertEqual('numbered tree child snippet count', numberedChildSnippets.length, 1);
assert('numbered tree child snippet keeps child detail', numberedChildSnippets[0]?.text.includes('QA 明天以前補失敗回傳測試'));
assert('numbered tree child snippet excludes sibling detail', !numberedChildSnippets[0]?.text.includes('兄弟任務只確認排程'));

const timelineSource = readFileSync('src/components/Records/TaskRecordTimeline.tsx', 'utf8');
const requiredTimelineSnippets = [
  '任務知識',
  'extractTaskRecordSnippets(record.content, nodeId)',
  '搜尋此任務的會議細節、變更或備註',
  '片段',
  '關聯紀錄',
];
for (const snippet of requiredTimelineSnippets) {
  assert(`TaskRecordTimeline missing snippet: ${snippet}`, timelineSource.includes(snippet));
}

if (failures.length > 0) {
  console.error('DEV-008 task knowledge verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-008 task knowledge verification passed: task-scoped synthesized snippets, fallback, search, and UI hooks checked.');
