import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-021');
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
const count = (text, value) => text.split(value).length - 1;

const {
  PROJECT_CHANGE_IMPORT_BLOCK_START,
  PROJECT_CHANGE_IMPORT_BLOCK_END,
  PROJECT_CHANGE_IMPORT_BLOCK_TITLE,
  extractProjectChangeImportBlocks,
  extractProjectChangeImportEvidenceBlocks,
  mergeProjectChangeImportBlocks,
  normalizeProjectChangeImportEvidence,
  wrapProjectChangeImportContent,
} = projectChangeImport;

const importedBody = [
  '- 任務 A：@[測試任務 A](task:task_a) 狀態改為進行中。',
  '- 任務 B：@[測試任務 B](task:task_b) 期限改為 2026-06-30。',
].join('\n');
const protectedBlock = wrapProjectChangeImportContent(importedBody);
const renderedPreview = [
  '1. 本次會議總結',
  '- 本次更新「測試任務」。',
  '',
  '2. 任務討論與結論',
  '2.1 @[測試任務 A](task:task_a)',
  '- 任務 A：RD 先確認 API。',
  '',
  '3. 臨時動議&其他',
  '- 請確認上述整理是否符合會議實際發言與操作。',
].join('\n');

assert('wrapped block includes start marker', protectedBlock.includes(PROJECT_CHANGE_IMPORT_BLOCK_START));
assert('wrapped block includes title', protectedBlock.includes(PROJECT_CHANGE_IMPORT_BLOCK_TITLE));
assert('wrapped block includes body', protectedBlock.includes(importedBody));
assert('wrapped block includes end marker', protectedBlock.includes(PROJECT_CHANGE_IMPORT_BLOCK_END));
assert('task discussion body extractor returns section 2 body', projectChangeImport.extractProjectChangeImportTaskDiscussionBody(renderedPreview).includes('2.1 @[測試任務 A](task:task_a)'));
assert('task discussion body extractor omits section 1 heading', !projectChangeImport.extractProjectChangeImportTaskDiscussionBody(renderedPreview).includes('1. 本次會議總結'));
assert('task discussion body extractor omits section 3 heading', !projectChangeImport.extractProjectChangeImportTaskDiscussionBody(renderedPreview).includes('3. 臨時動議&其他'));
assert('stripProjectChangeImportBlocks removes protected block markers', !projectChangeImport.stripProjectChangeImportBlocks(protectedBlock).includes(PROJECT_CHANGE_IMPORT_BLOCK_START));
assert('stripProjectChangeImportBlocks removes protected block body', !projectChangeImport.stripProjectChangeImportBlocks(protectedBlock).includes(importedBody));

const preservedContent = [
  '會議手寫摘要：今天先討論風險。',
  protectedBlock,
].join('\n\n');
const aiContentWithoutImport = [
  '1. 會議摘要',
  '- RD 已確認本週優先修正紀錄流程。',
  '',
  '2. 下一步',
  '- QA 補上回歸案例。',
].join('\n');
const merged = mergeProjectChangeImportBlocks(aiContentWithoutImport, preservedContent);

assert('merge keeps AI synthesis', merged.includes('1. 會議摘要'));
assert('merge preserves imported project changes', merged.includes(importedBody));
assert('merge does not append protected marker block to final content', count(merged, PROJECT_CHANGE_IMPORT_BLOCK_START) === 0);
assert('merge keeps task A mention', merged.includes('(task:task_a)'));
assert('merge keeps task B mention', merged.includes('(task:task_b)'));

const repeated = mergeProjectChangeImportBlocks(merged, preservedContent);
assert('repeated merge is idempotent', repeated === merged);

const syncedLinks = mentions.syncTaskLinksFromRecordContent(
  merged,
  [{ nodeId: 'task_ai_only', role: 'related' }],
  ['task_ai_only'],
);
assert('taskLinks keep AI linked task', syncedLinks.some(link => link.nodeId === 'task_ai_only'));
assert('taskLinks include imported task A from merged content', syncedLinks.some(link => link.nodeId === 'task_a'));
assert('taskLinks include imported task B from merged content', syncedLinks.some(link => link.nodeId === 'task_b'));

const aiContentAlreadyContainingBody = `${aiContentWithoutImport}\n\n${importedBody}`;
const bodyOnlyMerged = mergeProjectChangeImportBlocks(aiContentAlreadyContainingBody, preservedContent);
assert('body-only AI inclusion does not duplicate protected content', count(bodyOnlyMerged, importedBody) === 1);

const legacyHeadingContent = [
  '會議手寫摘要',
  `${PROJECT_CHANGE_IMPORT_BLOCK_TITLE}\n${importedBody}`,
].join('\n\n');
const legacyBlocks = extractProjectChangeImportBlocks(legacyHeadingContent);
assert('legacy heading import block is extracted', legacyBlocks.length === 1 && legacyBlocks[0].includes(importedBody));
const legacyEvidenceBlocks = extractProjectChangeImportEvidenceBlocks(legacyHeadingContent);
assert('legacy heading import evidence is extracted', legacyEvidenceBlocks.length === 1 && legacyEvidenceBlocks[0].includes(importedBody));
assert('rendered meeting evidence strips section heading', !normalizeProjectChangeImportEvidence(`1. 本次會議總結\n${importedBody}`).includes('1. 本次會議總結'));

const sidebarSource = readFileSync('src/components/Records/RecordSidebar.tsx', 'utf8');
assert('RecordSidebar imports task-discussion insert helper', sidebarSource.includes('extractProjectChangeImportTaskDiscussionBody'));
assert('RecordSidebar normalizes existing legacy project-change blocks', sidebarSource.includes('normalizeProjectChangeDraftContent'));
assert('RecordSidebar strips legacy project change blocks before inserting', sidebarSource.includes('stripProjectChangeImportBlocks(draft.content)'));
assert('RecordSidebar inserts project change preview into task discussion section', sidebarSource.includes('appendLineToMarkdownSection(cleanedDraftContent, MEETING_RECORD_TASKS_HEADING, projectChangeBody)'));
assert('RecordSidebar no longer inserts raw preview content directly', !sidebarSource.includes('[draft.content.trim(), projectChangeImport.previewContent.trim()]'));

const storeSource = readFileSync('src/store/useRecordStore.ts', 'utf8');
assert('useRecordStore imports merge guard', storeSource.includes('mergeProjectChangeImportBlocks'));
assert('AI synthesis result is merged with preserved draft content', storeSource.includes('mergeProjectChangeImportBlocks(result.content, preservedDraft.content)'));
assert('syncDraftContentLinks receives merged content', /syncDraftContentLinks\([\s\S]*mergedContent[\s\S]*\)/.test(storeSource));
assert('cursor offset uses merged content length', storeSource.includes('contentCursorOffset: mergedContent.length'));
assert('raw AI content is not used as cursor length', !storeSource.includes('contentCursorOffset: result.content.length'));
assert('saveDraft persists current draft content', storeSource.includes('content: draft.content.trim()'));

for (const docPath of [
  'ai-doc/specs/SPEC-021-project-change-ai-preserve.md',
  'ai-doc/qa/QA-DEV-021-project-change-ai-preserve.md',
  'ai-doc/backlog.md',
  'ai-doc/dev_task.md',
  'ai-doc/documentation_map.md',
]) {
  const doc = readFileSync(docPath, 'utf8');
  assert(`${docPath} references DEV-021`, doc.includes('DEV-021'));
  assert(`${docPath} references project change preservation`, doc.includes('AI整理') || doc.includes('deterministic merge guard'));
}

if (failures.length > 0) {
  console.error('DEV-021 project change AI preservation verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-021 project change AI preservation verification passed: protected import block, preserve merge, idempotent merge, task mentions, store writeback, and docs checked.');
