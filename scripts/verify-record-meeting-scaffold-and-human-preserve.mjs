import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-record-meeting-scaffold-and-human-preserve');
const sources = [
  'src/utils/recordContentMentions.ts',
  'src/utils/meetingRecordScaffold.ts',
  'src/utils/meetingRecordSynthesis.ts',
  'src/utils/meetingHumanDraftMerge.ts',
  'src/utils/meetingTaskDiscussion.ts',
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

const scaffold = await import(pathToFileURL(join(tempRoot, 'utils', 'meetingRecordScaffold.js')).href);
const synthesis = await import(pathToFileURL(join(tempRoot, 'utils', 'meetingRecordSynthesis.js')).href);
const humanMerge = await import(pathToFileURL(join(tempRoot, 'utils', 'meetingHumanDraftMerge.js')).href);
const discussion = await import(pathToFileURL(join(tempRoot, 'utils', 'meetingTaskDiscussion.js')).href);

const failures = [];
const assert = (label, condition, details = undefined) => {
  if (!condition) failures.push(details ? `${label}: ${JSON.stringify(details)}` : label);
};

const initialScaffold = scaffold.createMeetingRecordScaffold();
assert('meeting scaffold includes summary heading', initialScaffold.includes('1. 本次會議總結'));
assert('meeting scaffold includes task heading', initialScaffold.includes('2. 任務討論與結論'));
assert('meeting scaffold includes temporary/other heading', initialScaffold.includes('3. 臨時動議&其他'));
assert('meeting scaffold alone is not meaningful content', !scaffold.hasMeaningfulMeetingRecordContent(initialScaffold));
assert(
  'meeting scaffold plus human note is meaningful content',
  scaffold.hasMeaningfulMeetingRecordContent(`${initialScaffold}\n飲水機更換由行政下週確認。`),
);

const rawContent = [
  initialScaffold,
  '',
  '飲水機更換由行政下週確認。',
  '尾牙日期先抓 12/20，等老闆確認。',
].join('\n');
const result = synthesis.buildDeterministicMeetingSynthesis({
  title: '營運例會',
  participantsText: 'PM, 行政',
  rawContent,
  taskLinks: [],
  tasks: [],
  activities: [],
});

assert('AI synthesis uses new third section heading', result.content.includes('3. 臨時動議&其他'), result.content);
assert('AI synthesis preserves unlisted human note', result.content.includes('飲水機更換由行政下週確認'), result.content);
assert('AI synthesis preserves second unlisted human note', result.content.includes('尾牙日期先抓 12/20'), result.content);
assert('AI synthesis does not output old third heading', !/^3\.\s+其他$/m.test(result.content), result.content);

const aiWithoutTemporaryMotion = [
  '1. 本次會議總結',
  '- 本次會議先整理營運事項。',
  '',
  '2. 任務討論與結論',
  '- 尚無會中補記或任務變更可整理。',
  '',
  '3. 臨時動議&其他',
  '- 請確認上述整理是否符合會議實際發言與操作。',
].join('\n');
const merged = humanMerge.mergeHumanDraftWithAiSynthesis(aiWithoutTemporaryMotion, rawContent);

assert('human merge guard preserves unlisted human note', merged.includes('飲水機更換由行政下週確認'), merged);
assert('human merge guard removes generic placeholder when adding human notes', !merged.includes('請確認上述整理是否符合會議實際發言與操作'), merged);
assert('human merge guard is idempotent', humanMerge.mergeHumanDraftWithAiSynthesis(merged, rawContent) === merged);

const numberedTaskDraft = [
  initialScaffold,
  '',
  '2.1 @[新任務](task:task_main)',
  '2.1',
  '',
  '2.1.1 @[功能確認](task:task_feature)',
  '2.1.1',
  '',
  '2.1.1.1 @[RD先確認](task:task_rd)',
  '2.1.1.1 狀態由「待辦」改為「已完成」。',
].join('\n');
const numberedTaskResult = synthesis.buildDeterministicMeetingSynthesis({
  title: '任務例會',
  rawContent: numberedTaskDraft,
  taskLinks: [],
  tasks: [
    { id: 'task_main', title: '新任務', path: [{ id: 'task_main', title: '新任務' }] },
    {
      id: 'task_feature',
      title: '功能確認',
      parentId: 'task_main',
      path: [
        { id: 'task_main', title: '新任務' },
        { id: 'task_feature', title: '功能確認' },
      ],
    },
    {
      id: 'task_rd',
      title: 'RD先確認',
      parentId: 'task_feature',
      path: [
        { id: 'task_main', title: '新任務' },
        { id: 'task_feature', title: '功能確認' },
        { id: 'task_rd', title: 'RD先確認' },
      ],
    },
  ],
  activities: [{
    eventType: 'task_status_changed',
    nodeId: 'task_rd',
    title: 'RD先確認',
    occurredAt: 1780800000000,
    summary: '狀態由「待辦」改為「已完成」。',
  }],
});
assert('AI synthesis removes duplicate empty task section number 2.1', !/^2\.1$/m.test(numberedTaskResult.content), numberedTaskResult.content);
assert('AI synthesis removes duplicate empty task section number 2.1.1', !/^2\.1\.1$/m.test(numberedTaskResult.content), numberedTaskResult.content);
assert('AI synthesis removes duplicate empty task section number 2.1.1.1', !/^2\.1\.1\.1$/m.test(numberedTaskResult.content), numberedTaskResult.content);
assert('AI synthesis preserves task section content while removing empty numbers', numberedTaskResult.content.includes('狀態由「待辦」改為「已完成」。'), numberedTaskResult.content);

const directProjectChangeDraft = [
  initialScaffold,
  '',
  '2.1 @[品質驗證測試任務 1](task:qc-card-1)',
  '新增任務。',
  '',
  '2.1.1 @[品質驗證測試任務 1.1](task:qc-card-1-child-1)',
  '狀態由「待辦」改為「已完成」。',
  '',
  '2.1.2 @[品質驗證測試任務 2](task:qc-card-2)',
  '日期由「未設定 至 未設定」改為「未設定 至 2026-07-21」。',
  '',
  '3. 臨時動議&其他',
  '臨時討論：飲水機更換由行政下週確認。',
].join('\n');
const directProjectChangeResult = synthesis.buildDeterministicMeetingSynthesis({
  title: '專案變化例會',
  rawContent: directProjectChangeDraft,
  taskLinks: [],
  tasks: [
    {
      id: 'qc-card-1',
      title: '品質驗證測試任務 1',
      path: [{ id: 'qc-card-1', title: '品質驗證測試任務 1' }],
    },
    {
      id: 'qc-card-1-child-1',
      title: '品質驗證測試任務 1.1',
      parentId: 'qc-card-1',
      path: [
        { id: 'qc-card-1', title: '品質驗證測試任務 1' },
        { id: 'qc-card-1-child-1', title: '品質驗證測試任務 1.1' },
      ],
    },
    {
      id: 'qc-card-2',
      title: '品質驗證測試任務 2',
      path: [{ id: 'qc-card-2', title: '品質驗證測試任務 2' }],
    },
  ],
  activities: [],
});
const directProjectChangeTaskSection = directProjectChangeResult.content.slice(
  directProjectChangeResult.content.indexOf('2. 任務討論與結論'),
  directProjectChangeResult.content.indexOf('3. 臨時動議&其他'),
);
assert('direct project change import remains in task discussion after AI synthesis', directProjectChangeTaskSection.includes('狀態由「待辦」改為「已完成」。'), directProjectChangeResult.content);
assert('direct project change import does not leave task section empty after AI synthesis', !directProjectChangeTaskSection.includes('尚無會中補記或任務變更可整理'), directProjectChangeResult.content);
assert('direct project change import keeps linked task ids after AI synthesis', directProjectChangeResult.linkedTaskIds.includes('qc-card-1-child-1') && directProjectChangeResult.linkedTaskIds.includes('qc-card-2'), directProjectChangeResult);

const aiMissingDirectProjectChange = [
  '1. 本次會議總結',
  '- 本次會議整理專案變化。',
  '',
  '2. 任務討論與結論',
  '- 尚無會中補記或任務變更可整理。',
  '',
  '3. 臨時動議&其他',
  '- 請確認上述整理是否符合會議實際發言與操作。',
].join('\n');
const mergedDirectProjectChange = humanMerge.mergeHumanDraftWithAiSynthesis(aiMissingDirectProjectChange, directProjectChangeDraft);
const mergedTaskSection = mergedDirectProjectChange.slice(
  mergedDirectProjectChange.indexOf('2. 任務討論與結論'),
  mergedDirectProjectChange.indexOf('3. 臨時動議&其他'),
);
assert('human merge guard restores missing direct project change evidence into task section', mergedTaskSection.includes('狀態由「待辦」改為「已完成」。'), mergedDirectProjectChange);
assert('human merge guard does not put direct project change evidence only in other section', mergedTaskSection.includes('日期由「未設定 至 未設定」改為「未設定 至 2026-07-21」。'), mergedDirectProjectChange);
assert('human merge guard still preserves temporary motion in other section', mergedDirectProjectChange.includes('臨時討論：飲水機更換由行政下週確認。'), mergedDirectProjectChange);

const appended = discussion.appendTaskDiscussionToRecordContent(
  initialScaffold,
  'task_1',
  '討論中的任務',
  'RD 補 API 錯誤處理',
  1780800000000,
);
assert(
  'task discussion appends into numbered task section',
  Boolean(
    appended?.includes('2. 任務討論與結論') &&
    appended.indexOf('@[討論中的任務](task:task_1)：RD 補 API 錯誤處理') > appended.indexOf('2. 任務討論與結論') &&
    appended.indexOf('@[討論中的任務](task:task_1)：RD 補 API 錯誤處理') < appended.indexOf('3. 臨時動議&其他')
  ),
  { appended },
);
assert('task discussion does not create legacy markdown task heading', !appended?.includes('## 任務討論'));

const storeSource = readFileSync('src/store/useRecordStore.ts', 'utf8');
assert('record store creates meeting scaffold', storeSource.includes('createMeetingRecordScaffold()'));
assert('record store publish guard uses meaningful meeting content', storeSource.includes('hasMeaningfulMeetingRecordContent(draft.content)'));
assert('record store merges human draft after AI synthesis', storeSource.includes('mergeHumanDraftWithAiSynthesis(projectMergedContent, preservedDraft.content)'));

const workflowSource = readFileSync('src/utils/meetingRecordWorkflow.ts', 'utf8');
assert('meeting workflow content state ignores scaffold-only content', workflowSource.includes('hasMeaningfulMeetingRecordContent(draft.content)'));

const edgeSource = readFileSync('supabase/functions/synthesize_meeting_record/index.ts', 'utf8');
assert('edge prompt preserves temporary motions', edgeSource.includes('臨時動議&其他'));
assert('edge prompt forbids omitting non-task human text', edgeSource.includes('不得弱化、不得省略'));

if (failures.length > 0) {
  console.error('Record meeting scaffold and human preserve verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Record meeting scaffold and human preserve verification passed.');
