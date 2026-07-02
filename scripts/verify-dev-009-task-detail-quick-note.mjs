import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-009');
const sources = [
  'src/utils/recordContentMentions.ts',
  'src/utils/meetingRecordScaffold.ts',
  'src/utils/meetingTaskDiscussion.ts',
  'src/utils/taskKnowledgeSnippets.ts',
];

rmSync(tempRoot, { recursive: true, force: true });

const rewriteImports = (outputText) =>
  outputText
    .replaceAll("from './recordContentMentions'", "from './recordContentMentions.js'")
    .replaceAll("from './meetingRecordScaffold'", "from './meetingRecordScaffold.js'")
    .replaceAll("from './meetingTaskDiscussion'", "from './meetingTaskDiscussion.js'");

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
const discussion = await import(pathToFileURL(join(tempRoot, 'utils', 'meetingTaskDiscussion.js')).href);
const taskKnowledge = await import(pathToFileURL(join(tempRoot, 'utils', 'taskKnowledgeSnippets.js')).href);

const failures = [];
const assert = (label, condition) => {
  if (!condition) failures.push(label);
};
const assertEqual = (label, actual, expected) => {
  if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const token = mentions.serializeTaskMention('task_1', '會議中討論的任務 1');

assertEqual('blank discussion is ignored', discussion.appendTaskDiscussionToRecordContent('', 'task_1', '任務', '   '), null);
assertEqual(
  'multiline discussion normalizes into one record line',
  discussion.normalizeMeetingTaskDiscussionText(' 設計方向確認\n RD 先改資料流 '),
  '設計方向確認 / RD 先改資料流',
);

const firstAppend = discussion.appendTaskDiscussionToRecordContent(
  '',
  'task_1',
  '會議中討論的任務 1',
  '設計方向確認',
  1780800000000,
);
assert('first append creates task discussion heading', firstAppend?.includes('2. 任務討論與結論'));
assert('first append includes task mention token', firstAppend?.includes(token));
assert('first append includes discussion text', firstAppend?.includes('設計方向確認'));

const existingContent = [
  '會議速記',
  '',
  '2. 任務討論與結論',
  '- 09:00 既有討論',
  '',
  '1. 本次會議總結',
  '- 待 AI 統整。',
].join('\n');
const secondAppend = discussion.appendTaskDiscussionToRecordContent(
  existingContent,
  'task_1',
  '會議中討論的任務 1',
  '新增討論',
  1780800300000,
);
assert('second append keeps one task discussion heading', (secondAppend?.match(/2\. 任務討論與結論/g) || []).length === 1);
assert(
  'second append inserts before next heading',
  (secondAppend?.indexOf('新增討論') ?? -1) < (secondAppend?.indexOf('1. 本次會議總結') ?? -1),
);

const snippets = taskKnowledge.extractTaskRecordSnippets(firstAppend || '', 'task_1');
assert('DEV-008 task knowledge can read quick note', snippets.some(snippet => snippet.text.includes('設計方向確認')));

const storeSource = readFileSync('src/store/useRecordStore.ts', 'utf8');
for (const snippet of [
  'appendTaskDiscussionToMeetingDraft',
  'appendTaskDiscussionToRecordContent(state.draft.content, nodeId, title, text)',
  'syncDraftContentLinks(state.draft, content)',
  'contentCursorOffset: content.length',
  '...resetMeetingSynthesisState',
]) {
  assert(`useRecordStore missing snippet: ${snippet}`, storeSource.includes(snippet));
}

const modalSource = readFileSync('src/components/TaskDetailsModal.tsx', 'utf8');
for (const snippet of [
  'isMeetingMode ? (',
  '本次會議',
  'appendTaskDiscussionToMeetingDraft(node.id, node.title || node.id, meetingDiscussion)',
  "event.key === 'Enter'",
  '加入紀錄',
  '輸入此任務剛剛討論的內容',
]) {
  assert(`TaskDetailsModal missing snippet: ${snippet}`, modalSource.includes(snippet));
}

if (failures.length > 0) {
  console.error('DEV-009 task detail quick note verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-009 task detail quick note verification passed: append format, task tag, DEV-008 readability, and UI/store hooks checked.');
