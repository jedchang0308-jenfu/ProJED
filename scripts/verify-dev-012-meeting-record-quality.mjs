import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-012');
const sources = [
  'src/utils/recordContentMentions.ts',
  'src/utils/meetingRecordSynthesis.ts',
  'src/utils/taskKnowledgeSnippets.ts',
];

rmSync(tempRoot, { recursive: true, force: true });

const rewriteImports = (outputText) =>
  outputText
    .replaceAll("from './recordContentMentions'", "from './recordContentMentions.js'")
    .replaceAll("from './meetingRecordSynthesis'", "from './meetingRecordSynthesis.js'")
    .replaceAll("from './taskKnowledgeSnippets'", "from './taskKnowledgeSnippets.js'");

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
const taskKnowledge = await import(pathToFileURL(join(tempRoot, 'utils', 'taskKnowledgeSnippets.js')).href);

const failures = [];
const assert = (label, condition) => {
  if (!condition) failures.push(label);
};
const count = (text, pattern) => (text.match(pattern) || []).length;

const taskA = mentions.serializeTaskMention('task_a', '任務 A');
const taskB = mentions.serializeTaskMention('task_b', '任務 B');
const taskC = mentions.serializeTaskMention('task_c', '任務 C');
const taskD = mentions.serializeTaskMention('task_d', '任務 D');
const result = synthesis.buildDeterministicMeetingSynthesis({
  title: '產品週會',
  participantsText: 'PM, RD, QA',
  rawContent: [
    '## 任務討論',
    '- 待 AI 統整。',
    '今天先看 A 的設計，再回來補 B 的 QA。',
    `- 09:00 ${taskA} 設計方向確認，RD 先改資料流，不要動資料表。`,
    `- 09:04 ${taskB} QA case 要補實際輸入測試，尤其是貼上和中文輸入。`,
    `- 09:08 ${taskA} 還要補驗收文字，PM 明天確認。`,
    `- 09:12 ${taskC} 設計方向確認。`,
    `- 09:16 ${taskD} QA 補測三筆邊界金額：0.004、0.005、999999.995；結果與財務確認一致，採四捨五入到小數第二位。`,
  ].join('\n'),
  taskLinks: [
    { nodeId: 'task_a', role: 'main' },
    { nodeId: 'task_b', role: 'related' },
    { nodeId: 'task_c', role: 'related' },
    { nodeId: 'task_d', role: 'related' },
  ],
  tasks: [
    { id: 'task_a', title: '任務 A', status: 'in_progress', detailNotesText: '已有初版設計。' },
    { id: 'task_b', title: '任務 B', status: 'todo', description: '補 UX 驗證計畫。' },
    { id: 'task_c', title: '任務 C', status: 'todo', description: '專案既有背景不應寫入。' },
    { id: 'task_d', title: '任務 D', status: 'completed', description: '補測結果不應被當成下一步。' },
  ],
  activities: [
    { eventType: 'task_status_changed', nodeId: 'task_a', title: '任務 A', occurredAt: 1780800000000, summary: '狀態由「待辦」改為「進行中」。' },
    { eventType: 'task_status_changed', nodeId: 'task_a', title: '任務 A', occurredAt: 1780800300000, summary: '狀態由「待辦」改為「進行中」。' },
    { eventType: 'task_dates_changed', nodeId: 'task_b', title: '任務 B', occurredAt: 1780800600000, summary: '日期由「2026-06-07 至 2026-06-08」改為「2026-06-09 至 2026-06-10」。' },
    { eventType: 'task_assigned', nodeId: 'task_b', title: '任務 B', occurredAt: 1780800700000, summary: '負責人改為「王小明」。' },
    { eventType: 'task_created', nodeId: 'task_c', title: '任務封存', occurredAt: 1780800800000, summary: '新增任務「任務封存」。' },
  ],
});

for (const snippet of [
  '1. 本次會議總結',
  '2. 任務討論與結論',
  '3. 待校稿項目',
  taskA,
  taskB,
  taskC,
  taskD,
]) {
  assert(`natural synthesis missing snippet: ${snippet}`, result.content.includes(snippet));
}
assert('natural synthesis should not use markdown headings', !/^#{1,6}\s+/m.test(result.content));
assert('natural synthesis should not say meeting change prefix', !result.content.includes('會中變更'));
assert('assignee change includes target assignee', result.content.includes('負責人改為「王小明」'));
assert('created task includes concrete task title', result.content.includes('新增任務「任務封存」'));
assert('created task does not use empty system phrase', !result.content.includes('新任務：新增任務') && !result.content.includes('新增任務：新增任務'));
assert('natural synthesis should not use system task labels', !result.content.includes('本任務') && !result.content.includes('子任務：'));
const summarySection = result.content.split('\n\n2. 任務討論與結論')[0] || '';
assert('summary should not become activity log', (summarySection.match(/新增任務「/g) || []).length <= 1);

for (const fixedLabel of ['- 結論：', '- 決議：', '- 待辦：', '- 阻塞：', '- 狀態變更摘要：']) {
  assert(`natural synthesis should not use fixed label ${fixedLabel}`, !result.content.includes(fixedLabel));
}

assert('duplicate status activity is collapsed once', count(result.content, /狀態由「待辦」改為「進行中」/g) === 1);
assert('raw timestamp lines are not copied', !/09:(00|04|08|12)/.test(result.content));
assert('draft task-discussion heading is not copied into summary', !result.content.includes('- ## 任務討論'));
assert('draft pending placeholder is not copied', !result.content.includes('待 AI 統整'));
assert('summary does not keep orphan leading punctuation', !result.content.includes('\n- ：'));
assert('task A keeps human note', result.content.includes('RD 先改資料流'));
assert('task B keeps human note', result.content.includes('QA case 要補實際輸入測試'));

for (const forbidden of [
  '目前任務狀態',
  '任務背景是',
  '既有備註指出',
  '本次會議沒有留下完整討論內容',
  '請校稿者補上任務內容',
  '請校稿者確認這段紀要',
]) {
  assert(`natural synthesis should not fabricate static filler: ${forbidden}`, !result.content.includes(forbidden));
}

const extractSection = (content, mention) => {
  const escapedMention = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startMatch = new RegExp(`^2\\.\\d+ ${escapedMention}`, 'm').exec(content);
  if (!startMatch) return '';
  const start = startMatch.index;
  const afterStart = content.slice(start + startMatch[0].length);
  const nextMatch = /\n2\.\d+ /.exec(afterStart);
  return nextMatch ? content.slice(start, start + startMatch[0].length + nextMatch.index) : content.slice(start);
};

const sectionA = extractSection(result.content, taskA);
const sectionB = extractSection(result.content, taskB);
const sectionC = extractSection(result.content, taskC);
const sectionD = extractSection(result.content, taskD);
assert('task A has explicit next step from human note', sectionA.includes('下一步：') && sectionA.includes('PM 明天確認'));
assert('task B has explicit next step from human note', sectionB.includes('下一步：') && sectionB.includes('要補實際輸入測試'));
assert('task C has no fabricated next step', !sectionC.includes('下一步：'));
assert('completed QA result is not treated as next step', sectionD.includes('QA 補測三筆邊界金額') && !sectionD.includes('下一步：'));

const snippetsA = taskKnowledge.extractTaskRecordSnippets(result.content, 'task_a', { maxLength: 700 });
const snippetsB = taskKnowledge.extractTaskRecordSnippets(result.content, 'task_b', { maxLength: 700 });

assert('task A snippet extracted', snippetsA.length === 1);
assert('task B snippet extracted', snippetsB.length === 1);
assert('task A snippet keeps A discussion', snippetsA[0]?.text.includes('設計方向確認'));
assert('task A snippet excludes B discussion', !snippetsA[0]?.text.includes('QA case'));
assert('task B snippet keeps B discussion', snippetsB[0]?.text.includes('QA case'));
assert('task B snippet excludes A second discussion', !snippetsB[0]?.text.includes('PM 明天確認'));

const storeSource = readFileSync('src/store/useRecordStore.ts', 'utf8');
for (const forbiddenSource of [
  'status: node?.status',
  'description: node?.description',
  'detailNotesText: getTaskDetailNotesText(node)',
  'startDate: node?.startDate',
  'endDate: node?.endDate',
]) {
  assert(`source package should not pass static task metadata: ${forbiddenSource}`, !storeSource.includes(forbiddenSource));
}

const edgeSource = readFileSync('supabase/functions/synthesize_meeting_record/index.ts', 'utf8');
assert('edge default model is gemini-3.5-flash', edgeSource.includes("configuredModel || 'gemini-3.5-flash'"));
assert('edge fallback model is explicit', edgeSource.includes("'gemini-3.1-flash-lite'"));
assert('edge fallback warning is surfaced', edgeSource.includes('不可用，已改用'));
assert('edge prompt asks for natural language', edgeSource.includes('自然語言'));
assert('edge prompt bans fixed five-column template', edgeSource.includes('不要使用固定五欄填空模板'));
assert('edge prompt bans static task metadata as content', edgeSource.includes('不要把 task.status'));
assert('edge prompt bans AI meta intro', edgeSource.includes('不要在開頭寫 AI 做了什麼'));
assert('edge prompt restricts next steps to human content', edgeSource.includes('「下一步」只能整理 rawContent 中人類明確講到'));
assert('edge prompt bans markdown headings', edgeSource.includes('不得有任何行以 #'));
assert('edge prompt requires numbered headings', edgeSource.includes('1. / 2.1 / 2.1.1'));
assert('edge prompt bans system task labels', edgeSource.includes('不要加「本任務」或「子任務：」'));
assert('edge prompt requires assignee target', edgeSource.includes('負責人變更必須說明變為誰'));
assert('edge model error is explicit', edgeSource.includes('請檢查 GEMINI_MEETING_SYNTHESIS_MODEL'));

for (const docPath of [
  'ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md',
  'ai-doc/qa/QA-DEV-012-ai-meeting-record-natural-language-quality.md',
]) {
  const doc = readFileSync(docPath, 'utf8');
  assert(`${docPath} references DEV-012`, doc.includes('DEV-012'));
  assert(`${docPath} references gemini-3.5-flash`, doc.includes('gemini-3.5-flash'));
}

if (failures.length > 0) {
  console.error('DEV-012 meeting record quality verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-012 meeting record quality verification passed: natural language synthesis, task snippets, model default, and docs checked.');
