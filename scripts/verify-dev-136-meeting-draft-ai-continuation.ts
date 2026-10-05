import {
  getMeetingRecordActionState,
  getMeetingSynthesisResumeState,
  getMeetingWorkflowStepActions,
  getRecordDraftSignature,
  type MeetingRecordDraftLike,
  type MeetingSynthesisWorkflowStatus,
} from '../src/utils/meetingRecordWorkflow';

const failures: string[] = [];
const checks: Array<{ label: string; passed: boolean }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, passed: condition });
  if (!condition) failures.push(label);
};

const originalContent = '原始速記\n討論後由 AI 整理的內容';
const draft: MeetingRecordDraftLike = {
  id: 'dev136-draft',
  type: 'meeting',
  title: 'DEV-136 可續編草稿',
  content: originalContent,
  status: 'draft',
  visibility: 'private',
  taskLinks: [],
  metadata: {
    meetingSynthesis: {
    runId: 'dev136-run-1',
    contractVersion: 'dev136-contract',
    functionVersion: 'dev136-function',
    provider: 'deterministic-test',
    generatedAt: '2026-10-05T00:00:00.000Z',
    quality: { passed: true },
      sourceContent: '原始速記',
      outputContent: originalContent,
      warnings: ['請確認追蹤事項。', 7],
    },
  },
};

const restored = getMeetingSynthesisResumeState(draft);
assert('a saved draft with matching trace resumes AI review', restored?.status === 'ready');
assert('resumed state retains provider and only valid warning strings', restored?.provider === 'deterministic-test' && restored.warnings.length === 1);
assert('line ending and trailing whitespace do not invalidate the trace', getMeetingSynthesisResumeState({
  ...draft,
  content: `${originalContent.replace(/\n/g, '\r\n')}  `,
})?.status === 'ready');
assert('manually changed output does not resume a stale AI-ready state', getMeetingSynthesisResumeState({
  ...draft,
  content: `${originalContent}\n人工補充`,
}) === null);
assert('published records do not resume AI editing state', getMeetingSynthesisResumeState({
  ...draft,
  status: 'published',
}) === null);
assert('trace without a passing quality marker is not considered resumable', getMeetingSynthesisResumeState({
  ...draft,
  metadata: { meetingSynthesis: { ...draft.metadata?.meetingSynthesis, quality: { passed: false } } },
}) === null);

const getActionState = (
  status: MeetingSynthesisWorkflowStatus,
  record: MeetingRecordDraftLike = draft,
) => getMeetingRecordActionState({
  draft: record,
  activeWorkspaceId: 'workspace-1',
  activeBoardId: 'board-1',
  saving: false,
  meetingSynthesisStatus: status,
  meetingSynthesisError: null,
  meetingActivityCount: 0,
  draftBaselineSignature: getRecordDraftSignature(record),
  lastSaveFeedback: null,
});

const resumedState = getActionState(restored?.status ?? 'idle');
const resumedSteps = getMeetingWorkflowStepActions(resumedState);
assert('resumed draft retains all four ordered workflow stages', resumedSteps.map(step => step.stage).join(',') === 'capture,ai_suggestion,review,published');
assert('saved AI result can be opened and re-run', resumedState.canRunAi && resumedSteps.find(step => step.stage === 'ai_suggestion')?.enabled === true);
assert('clean saved AI result is marked as reviewed', resumedSteps.find(step => step.stage === 'review')?.visualState === 'complete');

const unprocessedState = getActionState('idle');
const unprocessedSteps = getMeetingWorkflowStepActions(unprocessedState);
const reviewStep = unprocessedSteps.find(step => step.stage === 'review');
assert('AI remains optional and a content draft can still be saved from the review stage', unprocessedState.canRunAi && reviewStep?.enabled === true && reviewStep.actionLabel === '存草稿');
assert('review step is presented as available when AI is skipped', reviewStep?.visualState === 'available');

const errorState = getActionState('error');
assert('failed AI can be retried without losing the draft', errorState.canRunAi);

const publishedState = getActionState('idle', { ...draft, status: 'published' });
const publishedSteps = getMeetingWorkflowStepActions(publishedState);
assert('published record is recognized from persisted status', publishedState.isPublished);
assert('published record disables AI, save, and publish actions', !publishedState.canRunAi && !publishedState.canSaveDraft && !publishedState.canPublish && publishedSteps.every(step => !step.enabled));

const result = {
  verifier: 'DEV-136 meeting draft AI continuation',
  passed: failures.length === 0,
  passedCount: checks.filter(check => check.passed).length,
  totalCount: checks.length,
  checks,
  failures,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
