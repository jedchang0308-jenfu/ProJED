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
const mixedMeeting = [
  `${taskA}：客戶要求補充規格，決議下週三前確認。`,
  '',
  `${taskB}：供應商報價延遲，需要 PM 追蹤。`,
  '',
  `## 會議中任務變更`,
  `- 14:20 ${taskA}：狀態 待辦 -> 進行中`,
].join('\n');

const snippetsA = taskKnowledge.extractTaskRecordSnippets(mixedMeeting, 'task_a');
const snippetsB = taskKnowledge.extractTaskRecordSnippets(mixedMeeting, 'task_b');

assertEqual('task A snippet count', snippetsA.length, 2);
assert('task A includes its discussion', snippetsA.some(snippet => snippet.text.includes('補充規格')));
assert('task A includes meeting activity', snippetsA.some(snippet => snippet.text.includes('狀態 待辦 -> 進行中')));
assert('task A excludes task B detail', snippetsA.every(snippet => !snippet.text.includes('供應商報價')));

assertEqual('task B snippet count', snippetsB.length, 1);
assert('task B includes its discussion', snippetsB[0]?.text.includes('供應商報價'));
assert('task B excludes task A detail', !snippetsB[0]?.text.includes('補充規格'));

const linkedOnly = taskKnowledge.extractTaskRecordSnippets('整篇紀錄只有結構化關聯，沒有 inline tag。', 'task_a');
assertEqual('linked-only fallback count', linkedOnly.length, 1);
assertEqual('linked-only fallback kind', linkedOnly[0]?.kind, 'linked_record');
assert('linked-only fallback text is visible', linkedOnly[0]?.text.includes('結構化關聯'));

assert('query matches current task snippet', taskKnowledge.taskKnowledgeMatchesQuery('補充規格', snippetsA.map(snippet => snippet.text)));
assert('query excludes other task detail', !taskKnowledge.taskKnowledgeMatchesQuery('供應商報價', snippetsA.map(snippet => snippet.text)));

const timelineSource = readFileSync('src/components/Records/TaskRecordTimeline.tsx', 'utf8');
const requiredTimelineSnippets = [
  '任務知識',
  'extractTaskRecordSnippets(record.content, nodeId)',
  '搜尋此任務的會議細節、變更或備註',
  '備註命中',
  '整篇關聯',
];
for (const snippet of requiredTimelineSnippets) {
  assert(`TaskRecordTimeline missing snippet: ${snippet}`, timelineSource.includes(snippet));
}

if (failures.length > 0) {
  console.error('DEV-008 task knowledge verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-008 task knowledge verification passed: task-scoped snippets, fallback, search, and UI hooks checked.');
