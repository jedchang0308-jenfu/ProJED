import assert from 'node:assert/strict';
import test from 'node:test';

import { CLOUD_RUN_TARGET } from '../../../scripts/lib/dev139-cloud-run-plan.mjs';
import { renderAnalysisImageBuild } from '../../../scripts/lib/dev139-analysis-image-build.mjs';

const SOURCE = 'a'.repeat(40);
const ARCHIVE = 'b'.repeat(64);
const PREDECESSOR = `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:${'c'.repeat(64)}`;

function makeInput(overrides = {}) {
  return { predecessorRuntimeImage: PREDECESSOR, releaseId: 'dev139-analysis-a1', sourceArchiveSha256: ARCHIVE,
    sourceGeneration: '123456789', sourceRevision: SOURCE, ...overrides };
}

function assertInvalid(input) {
  assert.throws(() => renderAnalysisImageBuild(input), { code: 'ANALYSIS_IMAGE_BUILD_INVALID' });
}

test('renders one regional ASR-only build with exact source and predecessor bindings', () => {
  const plan = renderAnalysisImageBuild(makeInput());
  const image = `${CLOUD_RUN_TARGET.repository}/projed-prod-asr-job:dev139-analysis-a1`;
  assert.equal(plan.renderOnly, true);
  assert.deepEqual(plan.target, {
    parent: 'projects/jenfu-platform-prod/locations/asia-east1', image,
    builderServiceAccount: 'projects/jenfu-platform-prod/serviceAccounts/projed-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com',
  });
  assert.deepEqual(plan.sourceBinding, {
    bucket: 'jenfu-platform-prod_asia-east1_cloudbuild',
    object: `dev139/dev139-analysis-a1/source-${ARCHIVE}.tar.gz`, generation: '123456789', sha256: ARCHIVE,
  });
  assert.equal(plan.request.method, 'POST');
  assert.equal(plan.request.url, 'https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds');
  assert.deepEqual(plan.request.body.images, [image]);
  assert.deepEqual(plan.request.body.tags, ['dev-139', 'dev139-analysis-a1']);
  assert.equal(plan.expectedReadback.deployOrRunJob, false);
});

test('builds only asr-job and verifies immutable source, worker command, ffmpeg, binding, and disabled models', () => {
  const { request } = renderAnalysisImageBuild(makeInput());
  assert.deepEqual(request.body.steps.map(step => step.id), [
    'stage-existing-pwa', 'build-analysis-image', 'verify-analysis-image-metadata', 'verify-analysis-image-contract',
  ]);
  const stage = request.body.steps[0].args.join(' ');
  assert.ok(stage.includes(PREDECESSOR));
  assert.ok(stage.includes('--network=none'));
  const build = request.body.steps[1].args;
  assert.equal(build[0], 'build');
  assert.equal(build[build.indexOf('--target') + 1], 'asr-job');
  assert.equal(build.includes('runtime'), false);
  assert.equal(build.includes('managed-jobs'), false);
  assert.ok(build.includes(`PROJED_SOURCE_REVISION=${SOURCE}`));
  const metadata = request.body.steps[2].args.at(-1);
  assert.ok(metadata.includes('meetingAsrJob.js'));
  assert.ok(metadata.includes('ffmpeg'));
  const proof = request.body.steps[3].args.join('\n');
  for (const value of ['CURRENT_RAG_BINDING,null', 'CURRENT_MEETING_LLM_BINDING,null',
    "profile.migrations.length,53", '0053_origin_switch_intents_v1', 'PROJED_ANALYSIS_IMAGE_PROOF=']) {
    assert.ok(proof.includes(value));
  }
  assert.equal(JSON.stringify(request.body).includes('projed-prod-jobs:'), false);
  assert.equal(JSON.stringify(request.body).includes('availableSecrets'), false);
  assert.equal(JSON.stringify(request.body).includes('secretEnv'), false);
});

test('pins the builder, dedicated account, provenance, bounded time, and exact source generation', () => {
  const build = renderAnalysisImageBuild(makeInput()).request.body;
  assert.ok(build.steps.every(step => step.name === 'gcr.io/cloud-builders/docker@sha256:2d89b48c704ddcc4a199dd1cc70c21813fb675227600f19cb77e5bbf368012bc'));
  assert.equal(build.serviceAccount,
    'projects/jenfu-platform-prod/serviceAccounts/projed-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com');
  assert.deepEqual(build.options, {
    env: ['DOCKER_BUILDKIT=1'], logging: 'CLOUD_LOGGING_ONLY', sourceProvenanceHash: ['SHA256'],
  });
  assert.equal(build.queueTtl, '600s');
  assert.equal(build.timeout, '1200s');
  assert.equal(build.source.storageSource.generation, '123456789');
});

test('rejects mutable or foreign predecessors, malformed source bindings, and caller expansion', () => {
  for (const predecessorRuntimeImage of [
    `${CLOUD_RUN_TARGET.repository}/projed-prod:latest`,
    `${CLOUD_RUN_TARGET.repository}/projed-prod-asr-job@sha256:${'c'.repeat(64)}`,
    `us-docker.pkg.dev/other/repo/projed-prod@sha256:${'c'.repeat(64)}`,
  ]) assertInvalid(makeInput({ predecessorRuntimeImage }));
  for (const releaseId of ['', 'DEV139-analysis', 'dev139_analysis', 'x'.repeat(42)]) assertInvalid(makeInput({ releaseId }));
  for (const sourceRevision of ['', 'z'.repeat(40), 'a'.repeat(39)]) assertInvalid(makeInput({ sourceRevision }));
  for (const sourceArchiveSha256 of ['', 'z'.repeat(64), 'b'.repeat(63)]) assertInvalid(makeInput({ sourceArchiveSha256 }));
  for (const sourceGeneration of ['', '0', '-1', 'latest', '1.5']) assertInvalid(makeInput({ sourceGeneration }));
  assertInvalid({ ...makeInput(), project: 'other-project' });
});

