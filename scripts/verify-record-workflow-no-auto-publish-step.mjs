import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-record-workflow-no-auto-publish-step');
const sources = [
  'src/utils/meetingRecordScaffold.ts',
  'src/utils/meetingRecordWorkflow.ts',
];

rmSync(tempRoot, { recursive: true, force: true });

const rewriteImports = (outputText) =>
  outputText.replaceAll("from './meetingRecordScaffold'", "from './meetingRecordScaffold.js'");

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

const workflow = await import(pathToFileURL(join(tempRoot, 'utils', 'meetingRecordWorkflow.js')).href);

const failures = [];
const assert = (label, condition, details = undefined) => {
  if (!condition) failures.push(details ? `${label}: ${JSON.stringify(details)}` : label);
};

const baseDraft = {
  id: 'meeting-draft',
  type: 'meeting',
  title: '週會',
  content: '',
  status: 'draft',
  visibility: 'tenant',
  participantsText: 'PM, RD',
  occurredAt: 1780800000000,
  taskLinks: [],
};

const getStepMap = (state) =>
  Object.fromEntries(workflow.getMeetingWorkflowStepActions(state).map(step => [step.stage, step]));

const getState = (overrides = {}) => {
  const draft = { ...baseDraft, ...(overrides.draft ?? {}) };
  return workflow.getMeetingRecordActionState({
    draft,
    activeWorkspaceId: 'workspace-1',
    activeBoardId: 'board-1',
    saving: false,
    meetingSynthesisStatus: 'idle',
    meetingSynthesisError: null,
    meetingActivityCount: 0,
    draftBaselineSignature: workflow.getRecordDraftSignature(baseDraft),
    lastSaveFeedback: null,
    ...overrides,
    draft,
  });
};

const typedState = getState({ draft: { content: '使用者剛開始輸入會議內容。' } });
const typedSteps = getStepMap(typedState);

assert('typing content stays in capture stage', typedState.stage === 'capture', { stage: typedState.stage });
assert('typing content enables publish', typedState.canPublish === true);
assert('typing content keeps capture current', typedSteps.capture.visualState === 'current' && typedSteps.capture.isRecommended, typedSteps.capture);
assert('typing content keeps AI整理 optional and enabled', typedSteps.ai_suggestion.visualState === 'optional' && typedSteps.ai_suggestion.enabled, typedSteps.ai_suggestion);
assert('typing content keeps publish available but not current', typedSteps.published.visualState === 'available' && typedSteps.published.enabled, typedSteps.published);
assert('typing content does not recommend publish', typedSteps.published.isRecommended === false, typedSteps.published);

const activityOnlyState = getState({ meetingActivityCount: 2 });
const activityOnlySteps = getStepMap(activityOnlyState);

assert('activity-only source stays in capture stage', activityOnlyState.stage === 'capture', { stage: activityOnlyState.stage });
assert('activity-only source enables AI整理', activityOnlyState.canRunAi === true && activityOnlySteps.ai_suggestion.enabled, activityOnlySteps.ai_suggestion);
assert('activity-only source does not enable publish', activityOnlyState.canPublish === false && activityOnlySteps.published.visualState === 'locked', activityOnlySteps.published);

const aiReadyState = getState({
  draft: { content: 'AI 已整理成校稿。' },
  meetingSynthesisStatus: 'ready',
});
const aiReadySteps = getStepMap(aiReadyState);

assert('AI-ready draft enters review stage', aiReadyState.stage === 'review', { stage: aiReadyState.stage });
assert('AI-ready draft marks review current', aiReadySteps.review.visualState === 'current' && aiReadySteps.review.isRecommended, aiReadySteps.review);
assert('AI-ready draft keeps publish available but not current', aiReadySteps.published.visualState === 'available' && !aiReadySteps.published.isRecommended, aiReadySteps.published);

const publishedState = getState({
  draft: { content: '正式紀錄內容。', status: 'published' },
  draftBaselineSignature: workflow.getRecordDraftSignature({ ...baseDraft, content: '正式紀錄內容。', status: 'published' }),
  lastSaveFeedback: {
    recordId: 'meeting-draft',
    status: 'published',
    savedAt: 1780800100000,
  },
});
const publishedSteps = getStepMap(publishedState);

assert('published record enters published stage', publishedState.stage === 'published', { stage: publishedState.stage });
assert('published record marks publish complete', publishedSteps.published.visualState === 'complete' && publishedSteps.published.isComplete, publishedSteps.published);

const workflowSource = readFileSync('src/utils/meetingRecordWorkflow.ts', 'utf8');
if (workflowSource.includes("state.hasContent\n          ? 'published'")) {
  failures.push('meeting workflow still promotes hasContent directly to published');
}

if (failures.length > 0) {
  console.error('Record workflow no-auto-publish-step verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Record workflow no-auto-publish-step verification passed.');
