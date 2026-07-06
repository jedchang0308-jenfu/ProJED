import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-024');
const sources = [
  'src/utils/recordContentMentions.ts',
  'src/utils/projectChangeImport.ts',
  'src/utils/humanDraftSynthesisMerge.ts',
];

rmSync(tempRoot, { recursive: true, force: true });

const rewriteImports = (outputText) =>
  outputText
    .replaceAll("from './recordContentMentions'", "from './recordContentMentions.js'")
    .replaceAll("from './projectChangeImport'", "from './projectChangeImport.js'");

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
const humanDraftMerge = await import(pathToFileURL(join(tempRoot, 'utils', 'humanDraftSynthesisMerge.js')).href);

const failures = [];
const assert = (label, condition, details = undefined) => {
  if (!condition) failures.push(details ? `${label}: ${JSON.stringify(details)}` : label);
};
const countRegex = (text, pattern) => (text.match(pattern) || []).length;

const { serializeTaskMention, syncTaskLinksFromRecordContent } = mentions;
const { wrapProjectChangeImportContent } = projectChangeImport;
const { mergeHumanDraftWithAiSynthesis } = humanDraftMerge;

const aiContent = [
  '1. 本次會議總結',
  '- 已整理任務主線。',
  '',
  '2. 任務討論與結論',
  '- 尚無會中補記或任務變更可整理。',
  '',
  '3. 其他',
  '- 請確認上述整理是否符合會議實際發言與操作。',
].join('\n');

const pureHuman = '客戶要求 6/20 前確認報價風險';
const pureMerged = mergeHumanDraftWithAiSynthesis(aiContent, pureHuman);
assert('pure handwritten paragraph is preserved', pureMerged.includes(pureHuman), { pureMerged });
assert('pure handwritten paragraph is placed once', pureMerged.split(pureHuman).length - 1 === 1);

const customSectionDraft = [
  '## 會議背景',
  '本案背景是客戶要先確認量產條件。',
].join('\n');
const customMerged = mergeHumanDraftWithAiSynthesis(aiContent, customSectionDraft);
assert('custom section content is preserved with context', customMerged.includes('會議背景：本案背景是客戶要先確認量產條件。'), { customMerged });

const taskMention = serializeTaskMention('task_human_1', '人工補充任務');
const taskDraft = `${taskMention} 需要 Jane 在下週一前補齊風險清單。`;
const taskMerged = mergeHumanDraftWithAiSynthesis(aiContent, taskDraft);
assert('task mention paragraph is preserved', taskMerged.includes('(task:task_human_1)'), { taskMerged });
const taskLinks = syncTaskLinksFromRecordContent(taskMerged, [], []);
assert('task mention updates task links', taskLinks.some(link => link.nodeId === 'task_human_1'), { taskLinks });

const projectChangeBody = [
  `- ${serializeTaskMention('task_project_1', '專案變化任務')} 狀態改為進行中。`,
].join('\n');
const preservedProjectAndHuman = [
  wrapProjectChangeImportContent(projectChangeBody),
  '',
  '使用者補充：供應商需要週五前確認交期。',
].join('\n');
const projectMerged = mergeHumanDraftWithAiSynthesis(aiContent, preservedProjectAndHuman);
assert('project change evidence is still preserved', projectMerged.includes('(task:task_project_1)'), { projectMerged });
assert('human supplemental evidence is preserved with project change', projectMerged.includes('使用者補充：供應商需要週五前確認交期。'), { projectMerged });
assert('single meeting summary heading remains single', countRegex(projectMerged, /^1\.\s+/gm) === 1, { projectMerged });
assert('single task discussion heading remains single', countRegex(projectMerged, /^2\.\s+/gm) === 1, { projectMerged });
assert('single other heading remains single', countRegex(projectMerged, /^3\.\s+/gm) === 1, { projectMerged });

const repeated = mergeHumanDraftWithAiSynthesis(projectMerged, preservedProjectAndHuman);
assert('merge is idempotent on repeated synthesis', repeated === projectMerged);

const helperSource = readFileSync('src/utils/humanDraftSynthesisMerge.ts', 'utf8');
const storeSource = readFileSync('src/store/useRecordStore.ts', 'utf8');
const sidebarSource = readFileSync('src/components/Records/RecordSidebar.tsx', 'utf8');
assert('helper exports mergeHumanDraftWithAiSynthesis', helperSource.includes('export const mergeHumanDraftWithAiSynthesis'));
assert('helper reuses DEV-021 project change merge guard', helperSource.includes('mergeProjectChangeImportBlocks(aiContent, preservedDraftContent)'));
assert('store imports human draft merge guard', storeSource.includes('mergeHumanDraftWithAiSynthesis'));
assert('store no longer calls project-only merge directly for AI result', !storeSource.includes('mergeProjectChangeImportBlocks(result.content, preservedDraft.content)'));
assert('AI synthesis tooltip tells users handwritten content is preserved', sidebarSource.includes('AI整理會保留目前手寫內容'));

for (const docPath of [
  'ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md',
  'ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md',
  'ai-doc/dev_task.md',
  'ai-doc/documentation_map.md',
]) {
  const doc = readFileSync(docPath, 'utf8');
  assert(`${docPath} references DEV-024`, doc.includes('DEV-024'));
}

if (failures.length > 0) {
  console.error('DEV-024 human draft synthesis verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-024 human draft synthesis verification passed: human paragraphs, custom sections, task mentions, project changes, idempotency, store integration, and docs checked.');
