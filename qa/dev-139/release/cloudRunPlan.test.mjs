import assert from 'node:assert/strict';
import test from 'node:test';

import { MANAGED_DATABASE } from '../../../shared/dev139ManagedDatabase.mjs';
import { S3_MIGRATION_PATHS } from '../../../scripts/lib/dev139-migration-paths.mjs';
import {
  CLOUD_RUN_TARGET,
  renderProjedCloudRun,
} from '../../../scripts/lib/dev139-cloud-run-plan.mjs';

const SOURCE_REVISION = 'd'.repeat(40);
const IMAGE_DIGEST = 'a'.repeat(64);

function makeBinding(overrides = {}) {
  return {
    databaseName: MANAGED_DATABASE.databaseName,
    databasePort: MANAGED_DATABASE.databasePort,
    runtimeRole: MANAGED_DATABASE.roles.runtime,
    connectionMode: MANAGED_DATABASE.host,
    cloudSqlInstance: MANAGED_DATABASE.cloudSqlInstance,
    iamLogins: { ...MANAGED_DATABASE.iamLogins },
    profileSha256: 'b'.repeat(64),
    migrationSha256: Object.fromEntries(S3_MIGRATION_PATHS.map((path) => [path, 'c'.repeat(64)])),
    staticFixtureSha256: 'e'.repeat(64),
    ...overrides,
  };
}

function makeInput(overrides = {}) {
  return {
    releaseId: 'dev139-render-fixture',
    sourceRevision: SOURCE_REVISION,
    runtimeImage: `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:${IMAGE_DIGEST}`,
    jobsImage: `${CLOUD_RUN_TARGET.repository}/projed-prod-jobs@sha256:${IMAGE_DIGEST}`,
    analysisImage: `${CLOUD_RUN_TARGET.repository}/projed-prod-asr-job@sha256:${IMAGE_DIGEST}`,
    audioBucket: 'projed-meeting-audio',
    binding: makeBinding(),
    sourceBundleVersion: '1',
    ...overrides,
  };
}

function envMap(container) {
  return Object.fromEntries(container.env.map(({ name, value }) => [name, value]));
}

function assertInvalid(input) {
  assert.throws(() => renderProjedCloudRun(input), { code: 'CLOUD_RUN_INPUT_INVALID' });
}

test('renderer fixes the typed target and emits IAM-only, private-network create requests', () => {
  const input = makeInput();
  const plan = renderProjedCloudRun(input);

  assert.equal(plan.renderOnly, true);
  assert.equal(plan.releaseId, input.releaseId);
  assert.equal(plan.sourceRevision, input.sourceRevision);
  assert.deepEqual(
    {
      project: CLOUD_RUN_TARGET.project,
      region: CLOUD_RUN_TARGET.region,
      service: CLOUD_RUN_TARGET.service,
      repository: CLOUD_RUN_TARGET.repository,
      hostProject: CLOUD_RUN_TARGET.hostProject,
      network: CLOUD_RUN_TARGET.network,
      subnet: CLOUD_RUN_TARGET.subnet,
    },
    {
      project: 'projed-cc78d',
      region: 'asia-east1',
      service: 'projed-prod',
      repository: 'asia-east1-docker.pkg.dev/projed-cc78d/cloud-run-source-deploy',
      hostProject: 'jenfu-platform-prod',
      network: 'projects/jenfu-platform-prod/global/networks/jenfu-platform-prod-vpc',
      subnet: 'projects/jenfu-platform-prod/regions/asia-east1/subnetworks/jenfu-platform-prod-runtime',
    },
  );

  assert.equal(plan.service.name, 'projects/projed-cc78d/locations/asia-east1/services/projed-prod');
  assert.equal(plan.service.ingress, 'INGRESS_TRAFFIC_ALL');
  assert.equal(plan.service.invokerIamDisabled, false);
  assert.deepEqual(plan.service.traffic, [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', percent: 100 }]);
  assert.deepEqual(plan.service.template.vpcAccess, {
    egress: 'PRIVATE_RANGES_ONLY',
    networkInterfaces: [{
      network: CLOUD_RUN_TARGET.network,
      subnetwork: CLOUD_RUN_TARGET.subnet,
    }],
  });
  assert.deepEqual(plan.service.labels, {
    'projed-task': 'dev-139',
    'projed-release': input.releaseId,
    'projed-source': SOURCE_REVISION,
  });

  const [runtime, proxy] = plan.service.template.containers;
  assert.equal(runtime.image, input.runtimeImage);
  assert.deepEqual(runtime.dependsOn, ['cloud-sql-proxy']);
  assert.deepEqual(runtime.ports, [{ name: 'http1', containerPort: 8080 }]);
  const runtimeEnvironment = envMap(runtime);
  assert.equal(runtimeEnvironment.PROJED_RUNTIME_BINDING_JSON, JSON.stringify(input.binding));
  assert.equal(runtimeEnvironment.PROJED_DATABASE_URL, 'postgresql://projed-prod-runtime%40projed-cc78d.iam@127.0.0.1:5432/jenfu_prod');
  assert.equal(runtimeEnvironment.PROJED_SOURCE_PROFILE, 'config/dev-139/s3-managed.profile.json');
  assert.equal(runtimeEnvironment.PROJED_MEETING_AUDIO_BUCKET, input.audioBucket);
  assert.equal(Object.keys(runtimeEnvironment).some((key) => /SOURCE.*(DATABASE|BUNDLE)|DATABASE.*SOURCE|SECRET|TOKEN|PASSWORD|CREDENTIAL|PROVIDER/u.test(key)), false);
  assert.match(proxy.image, /@sha256:[a-f0-9]{64}$/u);
  assert.ok(proxy.args.includes('--private-ip'));
  assert.ok(proxy.args.includes('--auto-iam-authn'));
  assert.ok(proxy.args.includes(MANAGED_DATABASE.cloudSqlInstance));

  assert.equal(plan.foundation.organization, '361825816000');
  assert.deepEqual(plan.foundation.sharedVpc, {
    hostProject: 'jenfu-platform-prod',
    serviceProject: 'projed-cc78d',
    network: CLOUD_RUN_TARGET.network,
    subnet: CLOUD_RUN_TARGET.subnet,
  });
  assert.deepEqual(plan.foundation.serviceAccounts.map(({ email, databaseLogin }) => ({ email, databaseLogin })), [
    { email: 'projed-prod-runtime@projed-cc78d.iam.gserviceaccount.com', databaseLogin: MANAGED_DATABASE.iamLogins.runtime },
    { email: 'projed-prod-migrator@projed-cc78d.iam.gserviceaccount.com', databaseLogin: MANAGED_DATABASE.iamLogins.migrator },
    { email: 'projed-prod-importer@projed-cc78d.iam.gserviceaccount.com', databaseLogin: MANAGED_DATABASE.iamLogins.importer },
  ]);

  assert.deepEqual(Object.keys(plan.jobs), ['migrate', 'plan', 'apply', 'reconcile', 'analysis']);
  for (const [mode, job] of Object.entries(plan.jobs).filter(([mode]) => mode !== 'analysis')) {
    assert.equal(job.template.taskCount, 1);
    assert.equal(job.template.parallelism, 1);
    assert.equal(job.template.template.maxRetries, 0);
    assert.equal(job.template.template.vpcAccess.egress, 'PRIVATE_RANGES_ONLY');
    assert.deepEqual(job.template.template.volumes[0], {
      name: 'cloudsql',
      cloudSqlInstance: { instances: [MANAGED_DATABASE.cloudSqlInstance] },
    });
    const [container] = job.template.template.containers;
    assert.equal(container.image, input.jobsImage);
    assert.deepEqual(container.args, ['scripts/run-dev139-managed-job.mjs', mode]);
  }

  const migration = plan.jobs.migrate.template.template;
  assert.equal(migration.serviceAccount, 'projed-prod-migrator@projed-cc78d.iam.gserviceaccount.com');
  assert.equal(migration.volumes.some(({ secret }) => Boolean(secret)), false);
  assert.equal(migration.containers[0].env.some(({ name }) => name.includes('SOURCE_BUNDLE')), false);
  assert.equal(migration.containers[0].env.find(({ name }) => name === 'PROJED_MIGRATOR_DATABASE_URL').value,
    'postgresql://projed-prod-migrator%40projed-cc78d.iam@localhost/jenfu_prod?host=%2Fcloudsql%2Fjenfu-platform-prod%3Aasia-east1%3Ajenfu-platform-prod-pg');

  for (const mode of ['plan', 'apply', 'reconcile']) {
    const importer = plan.jobs[mode].template.template;
    assert.equal(importer.serviceAccount, 'projed-prod-importer@projed-cc78d.iam.gserviceaccount.com');
    assert.deepEqual(importer.volumes[1].secret, {
      secret: `projects/projed-cc78d/secrets/${CLOUD_RUN_TARGET.sourceBundleSecret}`,
      items: [{ version: '1', path: 'bundle.json' }],
    });
    assert.equal(importer.volumes[1].secret.items.some(({ version }) => version === 'latest'), false);
  }

  const analysis = plan.jobs.analysis.template;
  const analysisTask = analysis.template;
  const [analysisContainer] = analysisTask.containers;
  assert.equal(plan.jobs.analysis.name, 'projects/projed-cc78d/locations/asia-east1/jobs/projed-meeting-analysis');
  assert.equal(analysis.taskCount, 1);
  assert.equal(analysis.parallelism, 1);
  assert.equal(analysisTask.serviceAccount, 'projed-prod-runtime@projed-cc78d.iam.gserviceaccount.com');
  assert.equal(analysisTask.maxRetries, 0);
  assert.equal(analysisTask.timeout, '600s');
  assert.deepEqual(analysisTask.vpcAccess, plan.service.template.vpcAccess);
  assert.deepEqual(analysisTask.volumes, [{ name: 'cloudsql',
    cloudSqlInstance: { instances: [MANAGED_DATABASE.cloudSqlInstance] } }]);
  assert.equal(analysisContainer.image, input.analysisImage);
  assert.equal('command' in analysisContainer, false);
  assert.equal('args' in analysisContainer, false);
  assert.deepEqual(analysisContainer.volumeMounts, [{ name: 'cloudsql', mountPath: '/cloudsql' }]);
  const analysisEnvironment = envMap(analysisContainer);
  assert.equal(analysisEnvironment.PROJED_ENV, 'managed');
  assert.equal(analysisEnvironment.PROJED_APP_ENTRY, 'main');
  assert.equal(analysisEnvironment.PROJED_SOURCE_PROFILE, 'config/dev-139/s3-managed.profile.json');
  assert.equal(analysisEnvironment.PROJED_RUNTIME_BINDING_JSON, JSON.stringify(input.binding));
  assert.equal(analysisEnvironment.PROJED_DATABASE_URL,
    'postgresql://projed-prod-runtime%40projed-cc78d.iam@localhost/jenfu_prod?host=%2Fcloudsql%2Fjenfu-platform-prod%3Aasia-east1%3Ajenfu-platform-prod-pg');
  assert.equal(analysisEnvironment.PROJED_MEETING_AUDIO_BUCKET, input.audioBucket);

  assert.equal(plan.scheduler.name,
    'projects/projed-cc78d/locations/asia-east1/jobs/projed-meeting-analysis-recovery');
  assert.equal(plan.scheduler.schedule, '*/15 * * * *');
  assert.equal(plan.scheduler.timeZone, 'Asia/Taipei');
  assert.deepEqual(plan.scheduler.retryConfig, { retryCount: 0 });
  assert.deepEqual(plan.scheduler.httpTarget, {
    uri: 'https://run.googleapis.com/v2/projects/projed-cc78d/locations/asia-east1/jobs/projed-meeting-analysis:run',
    httpMethod: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'e30=',
    oauthToken: {
      serviceAccountEmail: 'projed-prod-meeting-scheduler@projed-cc78d.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    },
  });
  assert.equal('oidcToken' in plan.scheduler.httpTarget, false);

  assert.deepEqual(plan.foundation.enableApis[0].services, [
    'run.googleapis.com', 'compute.googleapis.com', 'sqladmin.googleapis.com', 'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com', 'secretmanager.googleapis.com', 'cloudscheduler.googleapis.com',
  ]);
  assert.deepEqual(plan.foundation.schedulerServiceAccount, {
    email: 'projed-prod-meeting-scheduler@projed-cc78d.iam.gserviceaccount.com',
    databaseLogin: null, databaseIamRoles: [], databaseGrants: [],
  });
  assert.equal(plan.foundation.sqlIamUsers.some(({ serviceAccount }) =>
    serviceAccount === plan.foundation.schedulerServiceAccount.email), false);
  assert.equal('customRoles' in plan.foundation, false);
  assert.deepEqual(plan.foundation.iamBindings.filter(({ role }) => role === 'roles/run.invoker'), [
    { resource: plan.jobs.analysis.name,
      member: 'serviceAccount:projed-prod-runtime@projed-cc78d.iam.gserviceaccount.com', role: 'roles/run.invoker' },
    { resource: plan.jobs.analysis.name,
      member: 'serviceAccount:projed-prod-meeting-scheduler@projed-cc78d.iam.gserviceaccount.com', role: 'roles/run.invoker' },
  ]);
  assert.equal(plan.foundation.iamBindings.some(({ resource, role }) =>
    role === 'roles/run.invoker' && resource !== plan.jobs.analysis.name), false);
  assert.ok(plan.foundation.operatorRequirements.serviceAccountUserOn.includes(
    plan.foundation.schedulerServiceAccount.email));
  assert.deepEqual(plan.foundation.operatorRequirements.cloudSchedulerPermissions,
    ['cloudscheduler.jobs.create', 'cloudscheduler.jobs.get']);

  assert.equal(plan.requests.length, 7);
  assert.ok(plan.requests.slice(0, 6).every(({ method, url }) =>
    method === 'POST' && url.startsWith('https://run.googleapis.com/v2/')));
  assert.deepEqual(plan.requests[6], {
    method: 'POST', url: 'https://cloudscheduler.googleapis.com/v1/projects/projed-cc78d/locations/asia-east1/jobs',
    body: plan.scheduler,
  });
  assert.equal(plan.requests[0].body, plan.service);
  assert.deepEqual(plan.requests.slice(1, 6).map(({ body }) => body), Object.values(plan.jobs));
  assert.equal(plan.requests.some(({ url }) => /hosting|traffic|setIamPolicy|secrets\/|runWithOverrides/iu.test(url)), false);
});

test('renderer rejects mutable, misplaced, and malformed image references', () => {
  const invalidReferences = [
    `ghcr.io/projed/projed-prod@sha256:${IMAGE_DIGEST}`,
    `${CLOUD_RUN_TARGET.repository}/wrong-service@sha256:${IMAGE_DIGEST}`,
    `${CLOUD_RUN_TARGET.repository}/projed-prod:latest`,
    `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:${'z'.repeat(64)}`,
    `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:abcd`,
  ];

  for (const runtimeImage of invalidReferences) assertInvalid(makeInput({ runtimeImage }));
  for (const jobsImage of invalidReferences) assertInvalid(makeInput({ jobsImage }));
  for (const analysisImage of invalidReferences) assertInvalid(makeInput({ analysisImage }));
  assertInvalid(makeInput({ analysisImage: `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:${IMAGE_DIGEST}` }));
});

test('renderer rejects invalid audio bucket names and Cloud Build source buckets', () => {
  for (const audioBucket of ['', 'ab', 'UPPERCASE', 'run-sources', 'run-sources-projed-123',
    '192.168.1.10', 'goog-audio', 'audio-google-recordings', 'x'.repeat(64), 'audio..recordings']) {
    assertInvalid(makeInput({ audioBucket }));
  }
});

test('renderer rejects invalid revisions, release identifiers, secret versions, bindings, and caller overrides', () => {
  assertInvalid(makeInput({ releaseId: 'DEV139-render-fixture' }));
  assertInvalid(makeInput({ sourceRevision: 'g'.repeat(40) }));
  assertInvalid(makeInput({ sourceBundleVersion: 'latest' }));
  assertInvalid(makeInput({ sourceBundleVersion: '0' }));
  assertInvalid(makeInput({ project: 'other-project' }));
  assertInvalid(makeInput({ environmentOverrides: { PROJED_DATABASE_URL: 'postgresql://attacker' } }));

  const wrongLogin = makeBinding({
    iamLogins: { ...MANAGED_DATABASE.iamLogins, importer: 'attacker@other-project.iam' },
  });
  assertInvalid(makeInput({ binding: wrongLogin }));
  assertInvalid(makeInput({ binding: makeBinding({ unexpected: 'extra binding field' }) }));
  assertInvalid(makeInput({ binding: makeBinding({ profileSha256: 'not-a-sha256' }) }));
  assertInvalid(makeInput({ binding: makeBinding({ profileSha256: ['b'.repeat(64)] }) }));
  assertInvalid(makeInput({ binding: makeBinding({ staticFixtureSha256: ['e'.repeat(64)] }) }));
});
