import assert from 'node:assert/strict';
import test from 'node:test';

import { MANAGED_DATABASE } from '../../../shared/dev139ManagedDatabase.mjs';
import { CLOUD_RUN_TARGET, renderProjedCloudRun } from '../../../scripts/lib/dev139-cloud-run-plan.mjs';
import { renderAnalysisJobUpdate } from '../../../scripts/lib/dev139-analysis-job-update.mjs';
import { S3_MIGRATION_PATHS } from '../../../scripts/lib/dev139-migration-paths.mjs';

const OLD_SOURCE = '7'.repeat(40);
const NEW_SOURCE = '8'.repeat(40);
const OLD_DIGEST = '2'.repeat(64);
const NEW_DIGEST = '3'.repeat(64);
const REPOSITORY = CLOUD_RUN_TARGET.repository;
const JOB_NAME = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/projed-meeting-analysis';
const clone = value => globalThis.structuredClone(value);

function makeBinding(count = S3_MIGRATION_PATHS.length, overrides = {}) {
  return {
    databaseName: MANAGED_DATABASE.databaseName,
    databasePort: MANAGED_DATABASE.databasePort,
    runtimeRole: MANAGED_DATABASE.roles.runtime,
    connectionMode: MANAGED_DATABASE.host,
    cloudSqlInstance: MANAGED_DATABASE.cloudSqlInstance,
    iamLogins: { ...MANAGED_DATABASE.iamLogins },
    profileSha256: 'a'.repeat(64),
    migrationSha256: Object.fromEntries(S3_MIGRATION_PATHS.slice(0, count).map(path => [path, 'b'.repeat(64)])),
    staticFixtureSha256: 'c'.repeat(64),
    ...overrides,
  };
}

function currentAnalysis(binding = makeBinding()) {
  return renderProjedCloudRun({
    deploymentScope: 'candidate', releaseId: 'dev139-new-release', sourceRevision: NEW_SOURCE, binding,
    runtimeImage: `${REPOSITORY}/projed-prod@sha256:${NEW_DIGEST}`,
    jobsImage: `${REPOSITORY}/projed-prod-jobs@sha256:${NEW_DIGEST}`,
    analysisImage: `${REPOSITORY}/projed-prod-asr-job@sha256:${NEW_DIGEST}`,
    audioBucket: 'jenfu-platform-prod-projed-meeting-audio',
  }).jobs.analysis;
}

function makeBaseline() {
  const desired = currentAnalysis();
  const oldBinding = makeBinding(51);
  const template = clone(desired.template);
  const container = template.template.containers[0];
  container.image = `${REPOSITORY}/projed-prod-asr-job@sha256:${OLD_DIGEST}`;
  container.env.find(({ name }) => name === 'PROJED_RUNTIME_BINDING_JSON').value = JSON.stringify(oldBinding);
  return {
    name: JOB_NAME,
    uid: '8d938e18-3abb-4bc5-9f43-c8b8fec82de3',
    generation: '6', observedGeneration: '6',
    labels: { 'projed-release': 'dev139-old-release', 'projed-source': OLD_SOURCE, 'projed-task': 'dev-139' },
    template: { ...template, client: 'gcloud', clientVersion: '593.0.0' },
    terminalCondition: { type: 'Ready', state: 'CONDITION_SUCCEEDED' },
    etag: '"fixture-etag"',
  };
}

function makeInput(overrides = {}) {
  return {
    baseline: makeBaseline(), binding: makeBinding(),
    analysisImage: `${REPOSITORY}/projed-prod-asr-job@sha256:${NEW_DIGEST}`,
    releaseId: 'dev139-new-release', sourceRevision: NEW_SOURCE,
    ...overrides,
  };
}

function assertInvalid(input) {
  assert.throws(() => renderAnalysisJobUpdate(input), { code: 'ANALYSIS_JOB_UPDATE_INVALID' });
}

test('renders one etag-bound update for the existing analysis Job without running it', () => {
  const input = makeInput();
  const plan = renderAnalysisJobUpdate(input);
  assert.equal(plan.renderOnly, true);
  assert.equal(plan.action, 'update-existing-analysis-job');
  assert.deepEqual(plan.target, { name: JOB_NAME, uid: input.baseline.uid, generation: '6', etag: '"fixture-etag"' });
  assert.deepEqual(plan.baseline, {
    releaseId: 'dev139-old-release', sourceRevision: OLD_SOURCE,
    image: `${REPOSITORY}/projed-prod-asr-job@sha256:${OLD_DIGEST}`, migrationCount: 51,
  });
  assert.deepEqual(plan.candidate, {
    releaseId: 'dev139-new-release', sourceRevision: NEW_SOURCE,
    image: `${REPOSITORY}/projed-prod-asr-job@sha256:${NEW_DIGEST}`, migrationCount: S3_MIGRATION_PATHS.length,
  });
  assert.equal(plan.request.method, 'PATCH');
  assert.equal(plan.request.url, `https://run.googleapis.com/v2/${JOB_NAME}?allowMissing=false&validateOnly=false`);
  assert.deepEqual(Object.keys(plan.request.body).sort(), ['etag', 'labels', 'name', 'template']);
  assert.equal(plan.request.body.etag, input.baseline.etag);
  assert.equal(plan.request.body.name, JOB_NAME);
  assert.equal(plan.expectedReadback.executeJob, false);
  assert.equal(plan.expectedReadback.uid, input.baseline.uid);
  assert.equal(plan.rollback.requiresFreshReadbackAndEtag, true);
  assert.equal(Object.hasOwn(plan.rollback.bodyWithoutEtag, 'etag'), false);
});

test('changes only labels, image, and the exact current managed binding', () => {
  const input = makeInput();
  const plan = renderAnalysisJobUpdate(input);
  const baselineTemplate = clone(input.baseline.template);
  delete baselineTemplate.client;
  delete baselineTemplate.clientVersion;
  const candidateTemplate = clone(plan.request.body.template);
  const baselineContainer = baselineTemplate.template.containers[0];
  const candidateContainer = candidateTemplate.template.containers[0];
  const baselineEnv = Object.fromEntries(baselineContainer.env.map(row => [row.name, row.value]));
  const candidateEnv = Object.fromEntries(candidateContainer.env.map(row => [row.name, row.value]));
  assert.deepEqual(Object.keys(candidateEnv), Object.keys(baselineEnv));
  const changedEnvironment = Object.keys(candidateEnv).filter(name => candidateEnv[name] !== baselineEnv[name]);
  assert.deepEqual(changedEnvironment, ['PROJED_RUNTIME_BINDING_JSON']);
  assert.equal(JSON.parse(candidateEnv.PROJED_RUNTIME_BINDING_JSON).migrationSha256[S3_MIGRATION_PATHS.at(-1)], 'b'.repeat(64));
  assert.equal(candidateContainer.image, input.analysisImage);
  baselineContainer.image = candidateContainer.image;
  baselineContainer.env.find(({ name }) => name === 'PROJED_RUNTIME_BINDING_JSON').value = candidateEnv.PROJED_RUNTIME_BINDING_JSON;
  assert.deepEqual(candidateTemplate, baselineTemplate);
  assert.deepEqual(plan.request.body.labels, {
    'projed-task': 'dev-139', 'projed-release': input.releaseId, 'projed-source': input.sourceRevision,
  });
  assert.equal(Object.keys(candidateEnv).some(name => /GEMINI|RAG|VERTEX|MODEL|API_KEY|SECRET|TOKEN/i.test(name)), false);
});

test('rejects stale identity, reconciliation, resource, and mutable-image baselines', () => {
  for (const change of [
    baseline => { baseline.name += '-other'; },
    baseline => { baseline.uid = 'not-a-uuid'; },
    baseline => { baseline.generation = '0'; },
    baseline => { baseline.observedGeneration = '5'; },
    baseline => { baseline.reconciling = true; },
    baseline => { baseline.terminalCondition.state = 'CONDITION_FAILED'; },
    baseline => { baseline.etag = ''; },
    baseline => { baseline.annotations = { 'run.googleapis.com/execution-environment': 'gen1' }; },
    baseline => { baseline.binaryAuthorization = { useDefault: true }; },
    baseline => { baseline.template.template.containers[0].image = `${REPOSITORY}/projed-prod-asr-job:latest`; },
  ]) {
    const baseline = makeBaseline(); change(baseline); assertInvalid(makeInput({ baseline }));
  }
});

test('rejects infrastructure drift, hidden credentials, model flags, and incomplete environments', () => {
  for (const change of [
    baseline => { baseline.template.template.serviceAccount = 'attacker@example.iam.gserviceaccount.com'; },
    baseline => { baseline.template.template.vpcAccess.networkInterfaces[0].network += '-other'; },
    baseline => { baseline.template.template.volumes[0].cloudSqlInstance.instances[0] += '-other'; },
    baseline => { baseline.template.template.maxRetries = 1; },
    baseline => { baseline.template.template.timeout = '601s'; },
    baseline => { baseline.template.template.containers[0].resources.limits.memory = '1Gi'; },
    baseline => { baseline.template.template.containers[0].env.pop(); },
    baseline => { baseline.template.template.containers[0].env.push({ name: 'GEMINI_API_KEY', value: 'hidden' }); },
    baseline => { baseline.template.template.containers[0].env[0] = { name: 'PROJED_ENV', valueSource: { secretKeyRef: {} } }; },
  ]) {
    const baseline = makeBaseline(); change(baseline); assertInvalid(makeInput({ baseline }));
  }
});

test('rejects non-prefix baseline bindings and every incomplete or caller-expanded candidate', () => {
  const badBaseline = makeBaseline();
  const environment = badBaseline.template.template.containers[0].env;
  const bindingRow = environment.find(({ name }) => name === 'PROJED_RUNTIME_BINDING_JSON');
  const binding = JSON.parse(bindingRow.value);
  const last = Object.keys(binding.migrationSha256).at(-1);
  delete binding.migrationSha256[last];
  binding.migrationSha256[S3_MIGRATION_PATHS.at(-1)] = 'b'.repeat(64);
  bindingRow.value = JSON.stringify(binding);
  assertInvalid(makeInput({ baseline: badBaseline }));

  assertInvalid(makeInput({ binding: makeBinding(S3_MIGRATION_PATHS.length - 1) }));
  assertInvalid(makeInput({ releaseId: 'DEV139-invalid' }));
  assertInvalid(makeInput({ sourceRevision: 'z'.repeat(40) }));
  assertInvalid(makeInput({ analysisImage: `${REPOSITORY}/projed-prod-asr-job:latest` }));
  assertInvalid({ ...makeInput(), project: 'other-project' });
});

