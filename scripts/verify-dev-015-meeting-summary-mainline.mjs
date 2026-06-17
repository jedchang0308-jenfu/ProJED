import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-015');
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

const pathOf = (...items) => items.map(([id, title]) => ({ id, title }));
const mention = (id, title) => mentions.serializeTaskMention(id, title);
const pathMentions = (...items) => items.map(([id, title]) => mention(id, title)).join(' ');
const createTask = (id, title, parentId, path, order) => ({
  id,
  title,
  parentId,
  path,
  depth: path.length - 1,
  groupId: path[0]?.id,
  groupTitle: path[0]?.title,
  order,
});

const weekly = ['weekly', '週報功能開發'];
const rd = ['rd', '研發開發'];
const requirement = ['requirement', '需求確認'];
const boss = ['boss', '問BOSS'];
const spec = ['spec', '寫成規格'];
const startDev = ['start_dev', '開始開發'];
const qa = ['qa', 'QA驗證'];
const qaPlan = ['qa_plan', '制定驗證計畫'];
const qc = ['qc', '執行QC驗證'];
const transfer = ['transfer', '技術移轉'];

const tasks = [
  createTask(...weekly, null, pathOf(weekly), 0),
  createTask(...rd, weekly[0], pathOf(weekly, rd), 0),
  createTask(...requirement, rd[0], pathOf(weekly, rd, requirement), 0),
  createTask(...boss, requirement[0], pathOf(weekly, rd, requirement, boss), 0),
  createTask(...spec, rd[0], pathOf(weekly, rd, spec), 1),
  createTask(...startDev, rd[0], pathOf(weekly, rd, startDev), 2),
  createTask(...qa, weekly[0], pathOf(weekly, qa), 1),
  createTask(...qaPlan, qa[0], pathOf(weekly, qa, qaPlan), 0),
  createTask(...qc, qa[0], pathOf(weekly, qa, qc), 1),
  createTask(...transfer, weekly[0], pathOf(weekly, transfer), 2),
];

const activities = tasks.map(task => ({
  eventType: 'task_created',
  nodeId: task.id,
  title: task.title,
  occurredAt: 1780800000000 + task.order,
  summary: `新增任務「${task.title}」。`,
}));

const result = synthesis.buildDeterministicMeetingSynthesis({
  title: '週報功能開發規劃會議',
  participantsText: 'PM, RD, QA',
  rawContent: '',
  taskLinks: tasks.map(task => ({ nodeId: task.id, role: 'related' })),
  tasks,
  activities,
});

const summarySection = result.content.split('\n\n2. 任務討論與結論')[0] || '';
const taskSection = result.content.split('\n\n2. 任務討論與結論')[1] || '';

assert('summary has mainline heading', summarySection.includes('1. 本次會議總結'));
assert('summary describes weekly mainline', summarySection.includes('本次建立「週報功能開發」工作主線'));
assert('summary includes top-level work faces', summarySection.includes('研發開發') && summarySection.includes('QA驗證') && summarySection.includes('技術移轉'));
assert('summary includes RD decomposition', summarySection.includes('需求確認') && summarySection.includes('問BOSS') && summarySection.includes('寫成規格') && summarySection.includes('開始開發'));
assert('summary includes QA decomposition', summarySection.includes('制定驗證計畫') && summarySection.includes('執行QC驗證'));
assert('summary is not first-three activity log', (summarySection.match(/新增任務「/g) || []).length <= 1);
assert('summary is not missing deeper tasks', summarySection.includes('問BOSS') && summarySection.includes('執行QC驗證'));

assert('task section keeps numbered list heading', result.content.includes(`2.1 ${pathMentions(weekly)}`));
assert('task section keeps numbered card heading with full path', result.content.includes(`2.1.1 ${pathMentions(weekly, rd)}`));
assert('task section keeps numbered child heading with full path', result.content.includes(`2.1.1.1 ${pathMentions(weekly, rd, requirement)}`));
assert('task section keeps numbered grandchild heading with full path', result.content.includes(`2.1.1.1.1 ${pathMentions(weekly, rd, requirement, boss)}`));
assert('task section keeps QA hierarchy with full path', result.content.includes(`2.1.2 ${pathMentions(weekly, qa)}`) && result.content.includes(`2.1.2.1 ${pathMentions(weekly, qa, qaPlan)}`));
assert('task section is present', taskSection.includes(mention(...transfer)));

for (const task of tasks) {
  assert(`linkedTaskIds includes ${task.id}`, result.linkedTaskIds.includes(task.id));
}

const edgeSource = readFileSync('supabase/functions/synthesize_meeting_record/index.ts', 'utf8');
assert('edge prompt defines mainline summary', edgeSource.includes('主線摘要，不是 activity log'));
assert('edge prompt bans bulk created-task list in summary', edgeSource.includes('不能逐筆列出大量'));
assert('edge prompt asks to aggregate task paths', edgeSource.includes('彙整成工作主線、工作面與下層拆解'));

if (failures.length > 0) {
  console.error('DEV-015 meeting summary mainline verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-015 meeting summary mainline verification passed: summary aggregates task tree instead of copying activity log.');
