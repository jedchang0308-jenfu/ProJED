import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';

import { CLOUD_RUN_TARGET, renderProjedCloudRun } from '../../../scripts/lib/dev139-cloud-run-plan.mjs';
import { renderOriginCutoverPlan } from '../../../scripts/lib/dev139-origin-cutover-plan.mjs';
import { MANAGED_DATABASE } from '../../../shared/dev139ManagedDatabase.mjs';
import { S3_MIGRATION_PATHS } from '../../../scripts/lib/dev139-migration-paths.mjs';

const revision = 'projed-prod-loginpending-3c3f8b0';
const currentProductionProxyImage = 'gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861';

function binding() {
  return {
    databaseName: MANAGED_DATABASE.databaseName, databasePort: MANAGED_DATABASE.databasePort,
    runtimeRole: MANAGED_DATABASE.roles.runtime, connectionMode: MANAGED_DATABASE.host,
    cloudSqlInstance: MANAGED_DATABASE.cloudSqlInstance, iamLogins: { ...MANAGED_DATABASE.iamLogins },
    profileSha256: 'a'.repeat(64), staticFixtureSha256: 'b'.repeat(64),
    migrationSha256: Object.fromEntries(S3_MIGRATION_PATHS.map(path => [path, 'c'.repeat(64)])),
  };
}

function input() {
  const digest = 'd'.repeat(64);
  const candidateDigest = 'f'.repeat(64);
  const candidateBinding = { ...binding(), staticFixtureSha256: '9'.repeat(64) };
  const candidateSource = 'f'.repeat(40);
  const candidateRelease = 'dev139-qualified-origin-r2';
  const service = renderProjedCloudRun({
    deploymentScope: 'candidate', releaseId: 'dev139-cutover-fixture', sourceRevision: 'e'.repeat(40), binding: binding(),
    runtimeImage: `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:${digest}`,
    jobsImage: `${CLOUD_RUN_TARGET.repository}/projed-prod-jobs@sha256:${digest}`,
    analysisImage: `${CLOUD_RUN_TARGET.repository}/projed-prod-asr-job@sha256:${digest}`,
    audioBucket: 'jenfu-platform-prod-projed-meeting-audio',
  }).service;
  const template = globalThis.structuredClone(service.template);
  template.revision = revision;
  template.labels = { 'projed-release': 'dev139-loginpending-r6', 'projed-source': 'e'.repeat(40), 'projed-task': 'dev-139' };
  delete template.scaling.minInstanceCount;
  delete template.containers[0].startupProbe.initialDelaySeconds;
  template.client = 'gcloud';
  template.clientVersion = '593.0.0';
  const name = service.name;
  return { campaign: 'dev139-origin-handoff-v1', qualifiedArtifact: {
    status: 'QUALIFIED_PRIVATE_CANDIDATE_ARTIFACT', sourceRevision: candidateSource,
    releaseId: candidateRelease,
    registryImages: { runtime: `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:${candidateDigest}` },
    binding: candidateBinding,
    proof: { status: 'PASS', sourceRevision: candidateSource, releaseId: candidateRelease,
      binding: globalThis.structuredClone(candidateBinding), modelsEnabled: false },
    trafficCutover: false, productionSchemaApplied: false,
  }, readback: {
    name, uid: '6203d6ac-4f16-413f-a11c-befe525283ab', generation: '40', observedGeneration: '40',
    etag: 'AAZhJksV/+Y', labels: globalThis.structuredClone(template.labels), createTime: '2026-11-23T00:00:00Z',
    updateTime: '2026-11-26T00:00:00Z', creator: 'operator@example.test', lastModifier: 'operator@example.test',
    client: 'gcloud', clientVersion: '593.0.0', ingress: 'INGRESS_TRAFFIC_ALL', launchStage: 'GA', template,
    traffic: [
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision, percent: 100 },
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'projed-prod-board-4059d94', tag: 'dev139-session-env' },
    ],
    scaling: { maxInstanceCount: 10 },
    urls: ['https://projed-prod-9536592944.asia-east1.run.app', 'https://projed-prod-56gnizku7q-de.a.run.app'],
    terminalCondition: { type: 'Ready', state: 'CONDITION_SUCCEEDED' },
    conditions: [{ type: 'RoutesReady', state: 'CONDITION_SUCCEEDED' }],
    latestReadyRevision: `${name}/revisions/${revision}`, latestCreatedRevision: `${name}/revisions/${revision}`,
    trafficStatuses: [], uri: 'https://projed-prod-56gnizku7q-de.a.run.app',
  } };
}

function invalid(value) {
  assert.throws(() => renderOriginCutoverPlan(value), { code: 'ORIGIN_CUTOVER_PLAN_INVALID' });
}

test('renders a private zero-traffic candidate and a separately unauthorized activation', () => {
  const fixture = input();
  const plan = renderOriginCutoverPlan(fixture);
  assert.equal(plan.renderOnly, true);
  assert.equal(plan.stages.privateCandidate.movesTraffic, false);
  assert.equal(plan.stages.privateCandidate.publishesNewOrigin, false);
  assert.equal(Object.hasOwn(plan.stages.privateCandidate.request.body, 'invokerIamDisabled'), false);
  assert.equal(Object.hasOwn(plan.stages.privateCandidate.request.body, 'traffic'), false);
  assert.equal(plan.stages.privateCandidate.preconditions.invokerIamDisabled, false);
  assert.deepEqual(plan.stages.privateCandidate.preconditions.traffic,
    fixture.readback.traffic.map(target => Object.fromEntries(Object.entries(target).filter(([key]) => key !== 'type'))));
  assert.equal(plan.stages.privateCandidate.verificationRoute.movesTraffic, false);
  assert.deepEqual(plan.stages.privateCandidate.verificationRoute.requestTemplate.body.traffic.at(-1),
    { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
      revision: '<verified-candidate-revision>', tag: 'dev139-origin-cutover' });
  assert.equal(plan.stages.privateCandidate.verificationRoute.requestTemplate.body.traffic
    .every(target => target.type === 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION'), true);
  assert.equal(plan.stages.publicActivation.authorizedByThisPlan, false);
  assert.equal(plan.stages.publicActivation.requiresHumanAuthorization, true);
  assert.equal(plan.stages.publicActivation.requestTemplate.body.invokerIamDisabled, true);
  assert.equal(plan.stages.publicActivation.requestTemplate.body.etag, '<fresh-etag>');
  assert.equal(plan.stages.publicActivation.requestTemplate.body.traffic[0].type,
    'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION');
  assert.equal(plan.rollback.bodyWithoutEtag.traffic
    .every(target => target.type === 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION'), true);
  assert.deepEqual(plan.exclusions, ['iam-grant', 'secret-change', 'billing-change', 'capacity-change', 'model-enable', 'data-write']);
});

test('keeps old origins during the guided move and binds exact main and Quick destinations', () => {
  const plan = renderOriginCutoverPlan(input());
  const environment = Object.fromEntries(plan.stages.privateCandidate.request.body.template.containers[0].env
    .map(({ name, value }) => [name, value]));
  assert.equal(environment.PROJED_PUBLIC_APP_URL, 'https://projed-prod-9536592944.asia-east1.run.app');
  assert.equal(environment.PROJED_MAIN_PUBLIC_ORIGIN, 'https://projed-prod-9536592944.asia-east1.run.app');
  assert.equal(environment.PROJED_QUICK_PUBLIC_ORIGIN, 'https://projed-prod-56gnizku7q-de.a.run.app');
  assert.deepEqual(JSON.parse(environment.PROJED_MAIN_ADDITIONAL_PUBLIC_ORIGINS), ['https://projed-cc78d.web.app']);
  assert.deepEqual(JSON.parse(environment.PROJED_QUICK_ADDITIONAL_PUBLIC_ORIGINS), ['https://projed-cc78d.firebaseapp.com']);
  assert.deepEqual(JSON.parse(environment.PROJED_ORIGIN_SWITCH_CAMPAIGN), plan.campaign);
  assert.deepEqual(plan.campaign.routes.map(route => [route.entry, route.sourceSessionEntry, route.targetSessionEntry]),
    [['main', 'main', 'main'], ['quick', 'quick', 'quick']]);
  assert.equal(Object.keys(environment).some(name => /GEMINI|VERTEX|RAG|MODEL|API_KEY|CONTENT_LOG|CACHE/iu.test(name)), false);
});

test('binds the qualified image and runtime receipt while preserving infrastructure and rollback baseline', () => {
  const fixture = input();
  const plan = renderOriginCutoverPlan(fixture);
  const candidate = plan.stages.privateCandidate.request.body.template;
  assert.equal(candidate.containers[0].image, fixture.qualifiedArtifact.registryImages.runtime);
  assert.deepEqual(JSON.parse(candidate.containers[0].env.find(row => row.name === 'PROJED_RUNTIME_BINDING_JSON').value),
    fixture.qualifiedArtifact.binding);
  assert.deepEqual(candidate.labels, {
    'projed-release': fixture.qualifiedArtifact.releaseId,
    'projed-source': fixture.qualifiedArtifact.sourceRevision,
    'projed-task': 'dev-139',
  });
  assert.equal(candidate.serviceAccount, fixture.readback.template.serviceAccount);
  assert.deepEqual(candidate.vpcAccess, fixture.readback.template.vpcAccess);
  assert.deepEqual(candidate.scaling, { minInstanceCount: 0, maxInstanceCount: 1 });
  assert.equal(candidate.maxInstanceRequestConcurrency, 40);
  assert.equal(candidate.containers[1].image, CLOUD_RUN_TARGET.proxyImage);
  assert.equal(plan.rollback.bodyWithoutEtag.template.containers[0].image,
    fixture.readback.template.containers[0].image);
  assert.equal(plan.rollback.requiresFreshReadbackAndEtag, true);
});

test('rejects stale, public, drifting, model-enabled, and caller-expanded baselines', () => {
  for (const mutate of [
    value => { value.readback.observedGeneration = '39'; },
    value => { value.readback.terminalCondition.state = 'CONDITION_FAILED'; },
    value => { value.readback.invokerIamDisabled = true; },
    value => { value.readback.traffic[0].percent = 50; },
    value => { value.readback.traffic.push({ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'projed-prod-other', percent: 100 }); },
    value => { value.readback.template.containers[0].image = `${CLOUD_RUN_TARGET.repository}/projed-prod:latest`; },
    value => { value.readback.template.scaling.maxInstanceCount = 2; },
    value => { value.readback.template.serviceAccount = 'other@example.iam.gserviceaccount.com'; },
    value => { value.readback.template.vpcAccess.networkInterfaces[0].network += '-other'; },
    value => { value.readback.template.containers[1].image = 'gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:' + '0'.repeat(64); },
    value => { value.readback.template.containers[0].env.push({ name: 'GEMINI_API_KEY', value: 'hidden' }); },
    value => { value.readback.template.containers[0].env.find(row => row.name === 'PROJED_MAIN_PUBLIC_ORIGIN').value = 'https://attacker.invalid'; },
    value => { value.readback.traffic.push(
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'projed-prod-old-candidate', tag: 'dev139-origin-cutover' },
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'projed-prod-other-candidate', tag: 'dev139-origin-cutover' }); },
  ]) { const value = input(); mutate(value); invalid(value); }
  invalid({ ...input(), project: 'other' });
  invalid({ ...input(), campaign: 'contains spaces' });
});

test('rejects an unqualified or internally inconsistent candidate artifact', () => {
  for (const mutate of [
    value => { value.qualifiedArtifact.status = 'BUILD_ONLY'; },
    value => { value.qualifiedArtifact.registryImages.runtime = `${CLOUD_RUN_TARGET.repository}/projed-prod:latest`; },
    value => { value.qualifiedArtifact.binding.staticFixtureSha256 = '0'.repeat(64); },
    value => { value.qualifiedArtifact.proof.modelsEnabled = true; },
    value => { value.qualifiedArtifact.trafficCutover = true; },
  ]) { const value = input(); mutate(value); invalid(value); }
});

test('does not accept a baseline where an origin campaign is already active', () => {
  const value = input();
  value.readback.template.containers[0].env.push({ name: 'PROJED_ORIGIN_SWITCH_CAMPAIGN', value: '{}' });
  invalid(value);
});

test('refreshes one existing zero-traffic candidate tag and tolerates historical service/template label drift', () => {
  const value = input();
  const previousCandidate = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
    revision: 'projed-prod-origin-previous', tag: 'dev139-origin-cutover' };
  value.readback.traffic.push(previousCandidate);
  value.readback.template.labels = {
    'projed-release': 'dev139-older-template', 'projed-source': '1'.repeat(40), 'projed-task': 'dev-139',
  };
  const plan = renderOriginCutoverPlan(value);
  const traffic = plan.stages.privateCandidate.verificationRoute.requestTemplate.body.traffic;
  assert.equal(plan.stages.privateCandidate.verificationRoute.replacesExistingZeroTrafficTag, true);
  assert.equal(traffic.filter(target => target.tag === 'dev139-origin-cutover').length, 1);
  assert.deepEqual(traffic.find(target => target.tag === 'dev139-origin-cutover'),
    { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
      revision: '<verified-candidate-revision>', tag: 'dev139-origin-cutover' });
  assert.deepEqual(plan.rollback.bodyWithoutEtag.traffic.at(-1),
    { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
      revision: previousCandidate.revision, tag: previousCandidate.tag });
  assert.deepEqual(plan.rollback.bodyWithoutEtag.template.labels, value.readback.template.labels);
});

test('preserves the exact current production proxy while refreshing only the private candidate', () => {
  const value = input();
  value.readback.template.containers[1].image = currentProductionProxyImage;
  const plan = renderOriginCutoverPlan(value);
  assert.equal(plan.stages.privateCandidate.request.body.template.containers[1].image, currentProductionProxyImage);
  assert.equal(plan.rollback.bodyWithoutEtag.template.containers[1].image, currentProductionProxyImage);
});

test('CLI consumes the unmodified v2 readback envelope from stdin without a provider operation', () => {
  const result = spawnSync(process.execPath, ['scripts/create-dev139-origin-cutover-plan.mjs', '--input=-'], {
    cwd: process.cwd(), input: JSON.stringify(input()), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.renderOnly, true);
  assert.equal(plan.target.generation, '40');
  assert.equal(plan.stages.privateCandidate.movesTraffic, false);
});
