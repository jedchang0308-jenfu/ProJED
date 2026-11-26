import assert from 'node:assert/strict';
import test from 'node:test';

import { CLOUD_RUN_TARGET, renderProjedCloudRun } from '../../../scripts/lib/dev139-cloud-run-plan.mjs';
import { renderOriginCutoverPlan } from '../../../scripts/lib/dev139-origin-cutover-plan.mjs';
import { MANAGED_DATABASE } from '../../../shared/dev139ManagedDatabase.mjs';
import { S3_MIGRATION_PATHS } from '../../../scripts/lib/dev139-migration-paths.mjs';

const revision = 'projed-prod-loginpending-3c3f8b0';

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
  const service = renderProjedCloudRun({
    deploymentScope: 'candidate', releaseId: 'dev139-cutover-fixture', sourceRevision: 'e'.repeat(40), binding: binding(),
    runtimeImage: `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:${digest}`,
    jobsImage: `${CLOUD_RUN_TARGET.repository}/projed-prod-jobs@sha256:${digest}`,
    analysisImage: `${CLOUD_RUN_TARGET.repository}/projed-prod-asr-job@sha256:${digest}`,
    audioBucket: 'jenfu-platform-prod-projed-meeting-audio',
  }).service;
  return { campaign: 'dev139-origin-handoff-v1', baseline: {
    name: service.name, uid: '6203d6ac-4f16-413f-a11c-befe525283ab', generation: '40', observedGeneration: '40',
    etag: 'AAZhJksV/+Y', ready: true, latestReadyRevision: revision, invokerIamDisabled: false,
    image: service.template.containers[0].image, template: service.template,
    traffic: [{ revision, percent: 100 }, { revision: 'projed-prod-board-4059d94', tag: 'dev139-session-env' }],
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
  assert.deepEqual(plan.stages.privateCandidate.preconditions.traffic, fixture.baseline.traffic);
  assert.equal(plan.stages.privateCandidate.verificationRoute.movesTraffic, false);
  assert.deepEqual(plan.stages.privateCandidate.verificationRoute.requestTemplate.body.traffic.at(-1),
    { revision: '<verified-candidate-revision>', tag: 'dev139-origin-cutover' });
  assert.equal(plan.stages.publicActivation.authorizedByThisPlan, false);
  assert.equal(plan.stages.publicActivation.requiresHumanAuthorization, true);
  assert.equal(plan.stages.publicActivation.requestTemplate.body.invokerIamDisabled, true);
  assert.equal(plan.stages.publicActivation.requestTemplate.body.etag, '<fresh-etag>');
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

test('preserves image, runtime, network, SQL proxy, capacity, and rollback baseline', () => {
  const fixture = input();
  const plan = renderOriginCutoverPlan(fixture);
  const candidate = plan.stages.privateCandidate.request.body.template;
  assert.equal(candidate.containers[0].image, fixture.baseline.image);
  assert.equal(candidate.serviceAccount, fixture.baseline.template.serviceAccount);
  assert.deepEqual(candidate.vpcAccess, fixture.baseline.template.vpcAccess);
  assert.deepEqual(candidate.scaling, { minInstanceCount: 0, maxInstanceCount: 1 });
  assert.equal(candidate.maxInstanceRequestConcurrency, 40);
  assert.equal(candidate.containers[1].image, CLOUD_RUN_TARGET.proxyImage);
  assert.deepEqual(plan.rollback.bodyWithoutEtag.template, fixture.baseline.template);
  assert.equal(plan.rollback.requiresFreshReadbackAndEtag, true);
});

test('rejects stale, public, drifting, model-enabled, and caller-expanded baselines', () => {
  for (const mutate of [
    value => { value.baseline.observedGeneration = '39'; },
    value => { value.baseline.ready = false; },
    value => { value.baseline.invokerIamDisabled = true; },
    value => { value.baseline.traffic[0].percent = 50; },
    value => { value.baseline.traffic.push({ revision: 'projed-prod-other', percent: 100 }); },
    value => { value.baseline.image = `${CLOUD_RUN_TARGET.repository}/projed-prod:latest`; },
    value => { value.baseline.template.scaling.maxInstanceCount = 2; },
    value => { value.baseline.template.serviceAccount = 'other@example.iam.gserviceaccount.com'; },
    value => { value.baseline.template.vpcAccess.networkInterfaces[0].network += '-other'; },
    value => { value.baseline.template.containers[0].env.push({ name: 'GEMINI_API_KEY', value: 'hidden' }); },
    value => { value.baseline.template.containers[0].env.find(row => row.name === 'PROJED_MAIN_PUBLIC_ORIGIN').value = 'https://attacker.invalid'; },
    value => { value.baseline.traffic.push({ revision: 'projed-prod-old-candidate', tag: 'dev139-origin-cutover' }); },
  ]) { const value = input(); mutate(value); invalid(value); }
  invalid({ ...input(), project: 'other' });
  invalid({ ...input(), campaign: 'contains spaces' });
});

test('does not accept a baseline where an origin campaign is already active', () => {
  const value = input();
  value.baseline.template.containers[0].env.push({ name: 'PROJED_ORIGIN_SWITCH_CAMPAIGN', value: '{}' });
  invalid(value);
});
