import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-022');
const sources = [
  'src/utils/recordContentMentions.ts',
  'src/utils/meetingRecordScaffold.ts',
  'src/utils/meetingTaskDiscussion.ts',
  'src/utils/projectChangeImport.ts',
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
const projectChangeImport = await import(pathToFileURL(join(tempRoot, 'utils', 'projectChangeImport.js')).href);

const failures = [];
const assert = (label, condition) => {
  if (!condition) failures.push(label);
};
const countRegex = (text, pattern) => (text.match(pattern) || []).length;

const {
  PROJECT_CHANGE_IMPORT_BLOCK_START,
  PROJECT_CHANGE_IMPORT_BLOCK_END,
  mergeProjectChangeImportBlocks,
  normalizeProjectChangeImportEvidence,
  wrapProjectChangeImportContent,
} = projectChangeImport;

const importedRenderedMeetingRecord = [
  '1. 本次會議總結',
  '- 本次更新「Done（副本）」。',
  '- 本次建立「Done（副本）」工作主線，拆成「QC task 3」等工作面。',
  '',
  '2. 任務討論與結論',
  '2.1 @[Done（副本）](task:node_done_copy)',
  '任務已封存。',
  '',
  '2.1.1 @[Done（副本）](task:node_done_copy) @[QC task 3](task:node_qc3)',
  '新增任務。',
  '',
  '2.1.1.1 @[Done（副本）](task:node_done_copy) @[QC task 3](task:node_qc3) @[QC task 3.1](task:node_qc31)',
  '新增任務。',
  '',
  '3. 其他',
  '- 請確認上述整理是否符合會議實際發言與操作。',
].join('\n');

const protectedImportBlock = wrapProjectChangeImportContent(importedRenderedMeetingRecord);
const preservedContent = [
  '會議手寫內容：PM 要把專案變化和今天發言整理成一份紀錄。',
  protectedImportBlock,
].join('\n\n');
const aiRecord = [
  '1. 本次會議總結',
  '- 本次建立「Done」工作主線，拆成「QC task 4」與「QC task 5」等工作面。',
  '',
  '2. 任務討論與結論',
  '2.1 @[Done](task:local-col-done)',
  '狀態由「已完成」改為「進行中」。',
  '',
  '2.1.1 @[Done](task:local-col-done) @[QC task 4](task:node_qc4)',
  '新增任務「QC task 4」。',
  '',
  '3. 其他',
  '- 請確認上述整理是否符合會議實際發言與操作。',
].join('\n');

const merged = mergeProjectChangeImportBlocks(aiRecord, preservedContent);

assert('final content has one meeting summary heading', countRegex(merged, /^1\.\s+本次會議總結/gm) === 1);
assert('final content has one task discussion heading', countRegex(merged, /^2\.\s+任務討論與結論/gm) === 1);
assert('final content has one other heading', countRegex(merged, /^3\.\s+其他/gm) === 1);
assert('final content removes import start marker', !merged.includes(PROJECT_CHANGE_IMPORT_BLOCK_START));
assert('final content removes import end marker', !merged.includes(PROJECT_CHANGE_IMPORT_BLOCK_END));
assert('final content keeps AI main meeting task', merged.includes('(task:node_qc4)'));
assert('final content keeps imported project change task mention', merged.includes('(task:node_qc3)'));
assert('final content uses fallback evidence note instead of second meeting record', merged.includes('專案變化補充'));

const evidence = normalizeProjectChangeImportEvidence(importedRenderedMeetingRecord);
assert('evidence strips summary heading', !/^1\.\s+本次會議總結/m.test(evidence));
assert('evidence strips task discussion heading', !/^2\.\s+任務討論與結論/m.test(evidence));
assert('evidence strips other heading', !/^3\.\s+其他/m.test(evidence));
assert('evidence keeps task mention', evidence.includes('(task:node_qc3)'));

const repeated = mergeProjectChangeImportBlocks(merged, preservedContent);
assert('single-record merge remains idempotent', repeated === merged);

const syncedLinks = mentions.syncTaskLinksFromRecordContent(
  merged,
  [{ nodeId: 'node_qc4', role: 'related' }],
  ['node_qc4'],
);
assert('taskLinks keep AI task', syncedLinks.some(link => link.nodeId === 'node_qc4'));
assert('taskLinks include imported project change task', syncedLinks.some(link => link.nodeId === 'node_qc3'));

const packageSource = readFileSync('package.json', 'utf8');
assert('package exposes DEV-022 verifier', packageSource.includes('verify:dev-022-project-change-single-record'));

for (const docPath of [
  'ai-doc/specs/SPEC-022-project-change-single-record-integration.md',
  'ai-doc/qa/QA-DEV-022-project-change-single-record-integration.md',
  'ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md',
  'ai-doc/backlog.md',
  'ai-doc/dev_task.md',
  'ai-doc/documentation_map.md',
]) {
  const doc = readFileSync(docPath, 'utf8');
  assert(`${docPath} references DEV-022`, doc.includes('DEV-022'));
}

if (failures.length > 0) {
  console.error('DEV-022 project change single-record verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-022 project change single-record verification passed: imported project changes are evidence, not a second rendered meeting record.');
