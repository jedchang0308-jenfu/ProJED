import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';

import { MANAGED_DATABASE } from '../../../shared/dev139ManagedDatabase.mjs';
import { buildCalendarIcs } from '../../../server/calendarIcs.ts';
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
    audioBucket: 'jenfu-platform-prod-projed-meeting-audio',
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

test('candidate preparation needs no source credential and cannot schedule or import production data', () => {
  const input = makeInput();
  delete input.sourceBundleVersion;
  const plan = renderProjedCloudRun({ ...input, deploymentScope: 'candidate' });
  assert.deepEqual(Object.keys(plan.jobs), ['migrate', 'analysis']);
  assert.equal(plan.scheduler, null);
  assert.equal(plan.requests.length, 3);
  assert.ok(plan.requests.every(({ method, url }) => method === 'POST'
    && url.startsWith('https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/')
    && !url.endsWith(':run')));
  assert.equal(JSON.stringify(plan.requests).includes('secret'), false);
  assert.equal(plan.foundation.iamBindings.some(({ role }) => role === 'roles/secretmanager.secretAccessor'), false);
  assert.deepEqual(plan.foundation.operatorRequirements.cloudSchedulerPermissions, []);
  assert.equal(plan.foundation.schedulerServiceAccount, null);
  assert.equal(plan.foundation.serviceAccounts.some(({ email }) => email.includes('importer')), false);
  assert.equal(plan.service.invokerIamDisabled, false);
  assert.equal(plan.service.name.endsWith('/services/projed-prod'), true);
  assert.equal(envMap(plan.service.template.containers[0]).PROJED_PUBLIC_APP_URL, 'https://projed-cc78d.web.app');
  assert.equal(plan.service.template.vpcAccess.egress, 'PRIVATE_RANGES_ONLY');
  assert.equal(plan.foundation.providerConfiguration.qualificationApplied, false);
  assert.equal(plan.foundation.providerConfiguration.vertex.applicableAgreementEvidenceRequired, true);
  assert.equal(plan.foundation.ownerBootstrap.migrationJobInput.expectedMigrations.length, S3_MIGRATION_PATHS.length);
  assert.equal(plan.foundation.ownerBootstrap.migrationJobInput.profile, 'central-candidate');
});

test('D6 defaults to old main/Quick origins; final direct mode only changes entry settings', () => {
  const input = makeInput();
  const legacy = renderProjedCloudRun(input);
  const direct = renderProjedCloudRun({ ...input, entryStage: 'direct' });
  assert.equal(legacy.entryStage, 'legacy');
  assert.deepEqual(legacy.entryOrigins, { main: 'https://projed-cc78d.web.app', quick: 'https://projed-cc78d.firebaseapp.com' });
  assert.deepEqual(direct.entryOrigins, { main: 'https://projed-prod-9536592944.asia-east1.run.app', quick: 'https://projed-prod-56gnizku7q-de.a.run.app' });
  for (const plan of [legacy, direct]) {
    const environment = envMap(plan.service.template.containers[0]);
    assert.equal(environment.PROJED_PUBLIC_APP_URL, plan.entryOrigins.main);
    assert.equal(environment.PROJED_MAIN_PUBLIC_ORIGIN, plan.entryOrigins.main);
    assert.equal(environment.PROJED_QUICK_PUBLIC_ORIGIN, plan.entryOrigins.quick);
    assert.equal(environment.PROJED_SSO_BROKER_ORIGIN, 'https://jenfu-platform-prod-9536592944.asia-east1.run.app');
    const background = envMap(plan.jobs.analysis.template.template.containers[0]);
    for (const name of ['PROJED_SSO_BROKER_ORIGIN', 'PROJED_MAIN_PUBLIC_ORIGIN', 'PROJED_QUICK_PUBLIC_ORIGIN']) {
      assert.equal(background[name], environment[name]);
    }
    assert.notEqual(new URL(plan.entryOrigins.main).host, new URL(plan.entryOrigins.quick).host);
    assert.equal(environment.PROJED_SSO_ENABLED, undefined);
    assert.equal(plan.service.invokerIamDisabled, false);
    assert.equal(plan.foundation.providerConfiguration.qualificationApplied, false);
  }
  const stripJobOrigins = plan => {
    const jobs = structuredClone(plan.jobs);
    jobs.analysis.template.template.containers[0].env = jobs.analysis.template.template.containers[0].env.filter(({ name }) =>
      !['PROJED_MAIN_PUBLIC_ORIGIN', 'PROJED_QUICK_PUBLIC_ORIGIN'].includes(name));
    return jobs;
  };
  assert.deepEqual(stripJobOrigins(legacy), stripJobOrigins(direct));
  assert.deepEqual(legacy.scheduler, direct.scheduler);
  assert.deepEqual(legacy.foundation, direct.foundation);
  const stripOrigins = plan => {
    const service = structuredClone(plan.service);
    service.template.containers[0].env = service.template.containers[0].env.filter(({ name }) =>
      !['PROJED_PUBLIC_APP_URL', 'PROJED_MAIN_PUBLIC_ORIGIN', 'PROJED_QUICK_PUBLIC_ORIGIN'].includes(name));
    return service;
  };
  assert.deepEqual(stripOrigins(legacy), stripOrigins(direct));
  assert.deepEqual(renderProjedCloudRun({ ...input, entryStage: 'legacy' }), legacy);
  for (const entryStage of ['other', '', null, false, undefined, { main: 'https://attacker.invalid' }]) {
    assertInvalid({ ...input, entryStage });
  }
  assertInvalid({ ...input, publicOrigin: 'https://attacker.invalid' });
  assertInvalid({ ...input, entryOrigins: { main: 'https://attacker.invalid' } });
});

test('calendar event links follow the selected entry stage and preserve the original task destination', () => {
  const task = { id: 'task-id', tenantId: 'tenant-id', projectId: 'project-id', legacyTaskId: 'original-task',
    title: 'entry stage link', description: '', status: 'todo', assigneeIds: [], collaboratorIds: [], tagIds: [],
    startDate: null, endDate: '2026-11-23', updatedAt: '2026-11-23T00:00:00Z' };
  for (const entryStage of ['legacy', 'direct']) {
    const plan = renderProjedCloudRun(makeInput({ entryStage }));
    const feed = buildCalendarIcs({ subscriptionId: 'subscription', name: 'entry stage fixture', tasks: [task],
      dateTypesByProjectId: new Map([['project-id', ['due_date']]]), tenantNameById: new Map(),
      projectNameById: new Map(), workspaceRefById: new Map([['tenant-id', 'original-workspace']]),
      boardRefById: new Map([['project-id', 'original-board']]), memberLabelById: new Map(),
      appBaseUrl: envMap(plan.service.template.containers[0]).PROJED_PUBLIC_APP_URL,
      now: new Date('2026-11-23T00:00:00Z') }).replaceAll('\r\n ', '');
    const line = feed.split('\r\n').find(value => value.startsWith('URL:'));
    assert.ok(line);
    const destination = new URL(line.slice(4).replaceAll('\\,', ','));
    assert.equal(destination.origin, entryStage === 'legacy' ? 'https://projed-cc78d.web.app' : CLOUD_RUN_TARGET.publicOrigin);
    assert.equal(destination.searchParams.get('modal'), 'tasknode');
    assert.equal(destination.searchParams.get('wsId'), 'original-workspace');
    assert.equal(destination.searchParams.get('boardId'), 'original-board');
    assert.equal(destination.searchParams.get('itemId'), 'original-task');
  }
});

test('candidate and formal preparation preserve the same old-entry contract without enabling a Session', () => {
  const { sourceBundleVersion, ...input } = makeInput();
  const candidate = renderProjedCloudRun({ ...input, deploymentScope: 'candidate' });
  assert.equal(candidate.entryStage, 'legacy');
  assert.deepEqual(candidate.entryOrigins, renderProjedCloudRun({ ...input, sourceBundleVersion }).entryOrigins);
  assert.deepEqual(Object.keys(candidate.jobs), ['migrate', 'analysis']);
  assert.equal(candidate.scheduler, null);
  assert.equal(JSON.stringify(candidate.requests).includes('allUsers'), false);
  assert.equal(JSON.stringify(candidate.requests).includes('setIamPolicy'), false);
});

test('Cloud Run create uses query IDs and omits names while preserving desired readback identity', () => {
  for (const candidate of [false, true]) {
    const full = makeInput();
    const input = { ...full };
    delete input.sourceBundleVersion;
    const plan = renderProjedCloudRun(candidate ? { ...input, deploymentScope: 'candidate' } : full);
    for (const resource of [plan.service, ...Object.values(plan.jobs)]) {
      const id = resource.name.split('/').at(-1);
      const kind = resource === plan.service ? 'serviceId' : 'jobId';
      const request = plan.requests.find(({ url }) => new URL(url).searchParams.get(kind) === id);
      assert.ok(request, `missing create request for ${resource.name}`);
      assert.equal(Object.hasOwn(request.body, 'name'), false);
      const { name, ...body } = resource;
      assert.deepEqual(request.body, body);
      assert.ok(name.startsWith('projects/jenfu-platform-prod/locations/asia-east1/'));
    }
    if (!candidate) assert.equal(plan.requests.at(-1).body.name, plan.scheduler.name);
  }
});

test('candidate scope is explicit and preserves image, bucket and exact-input rejection', () => {
  const { sourceBundleVersion, ...input } = makeInput();
  const candidate = { ...input, deploymentScope: 'candidate' };
  assertInvalid(input);
  assertInvalid({ ...candidate, sourceBundleVersion });
  assertInvalid({ ...candidate, deploymentScope: 'other' });
  assertInvalid({ ...candidate, runtimeImage: `${CLOUD_RUN_TARGET.repository}/projed-prod:latest` });
  assertInvalid({ ...candidate, audioBucket: 'unapproved-audio-bucket' });
  assertInvalid({ ...candidate, binding: { ...input.binding, migrationSha256: {} } });
});

test('owner window input comes from the same fixed Job and complete ordered migration hashes', () => {
  const input = makeInput();
  input.binding.migrationSha256 = Object.fromEntries([...S3_MIGRATION_PATHS].reverse().map((path,index) => [path,index.toString(16).padStart(64,'0')]));
  const plan = renderProjedCloudRun(input);
  const owner = plan.foundation.ownerBootstrap;
  assert.deepEqual(owner.migrationJobInput, {sourceRevision:input.sourceRevision,job:plan.jobs.migrate,
    expectedMigrations:S3_MIGRATION_PATHS.map(path => ({version:path.slice('db/migrations/'.length,-4),checksum:input.binding.migrationSha256[path]}))});
  assert.equal(owner.migrationJobInput.expectedMigrations.length,S3_MIGRATION_PATHS.length);
  assert.equal(owner.coordinatorPermissions.job,plan.jobs.migrate.name);
  assert.equal(owner.coordinatorPermissions.iamChangesApplied,false);
  assert.deepEqual(owner.coordinatorPermissions.cloudRunPermissions,['run.jobs.get','run.jobs.run','run.executions.get','run.operations.get']);
  assert.deepEqual(owner.coordinatorPermissions.loggingPermissions,['logging.logEntries.list']);
  assert.equal(owner.implementedByThisRenderer,false);
  assert.ok(plan.requests.every(({url}) => !url.includes('setIamPolicy') && !url.endsWith(':run')));
});

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
      project: 'jenfu-platform-prod',
      region: 'asia-east1',
      service: 'projed-prod',
      repository: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/projed-release',
      hostProject: 'jenfu-platform-prod',
      network: 'projects/jenfu-platform-prod/global/networks/jenfu-platform-prod-vpc',
      subnet: 'projects/jenfu-platform-prod/regions/asia-east1/subnetworks/jenfu-platform-prod-runtime',
    },
  );

  assert.equal(plan.service.name, 'projects/jenfu-platform-prod/locations/asia-east1/services/projed-prod');
  assert.equal(plan.foundation.operatorRequirements.artifactReaderOn,
    'projects/jenfu-platform-prod/locations/asia-east1/repositories/projed-release');
  assert.equal(plan.foundation.operatorRequirements.networkProject, CLOUD_RUN_TARGET.project);
  assert.equal('sharedVpcAdministration' in plan.foundation.operatorRequirements, false);
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
  assert.equal(runtimeEnvironment.PROJED_DATABASE_URL, 'postgresql://projed-prod-runtime%40jenfu-platform-prod.iam@127.0.0.1:5432/jenfu_prod');
  assert.equal(runtimeEnvironment.PROJED_SOURCE_PROFILE, 'config/dev-139/s3-managed.profile.json');
  assert.equal(runtimeEnvironment.PROJED_MEETING_AUDIO_BUCKET, input.audioBucket);
  assert.equal(Object.keys(runtimeEnvironment).some((key) => /SOURCE.*(DATABASE|BUNDLE)|DATABASE.*SOURCE|SECRET|TOKEN|PASSWORD|CREDENTIAL|PROVIDER/u.test(key)), false);
  assert.match(proxy.image, /@sha256:[a-f0-9]{64}$/u);
  assert.ok(proxy.args.includes('--private-ip'));
  assert.ok(proxy.args.includes('--auto-iam-authn'));
  assert.ok(proxy.args.includes(MANAGED_DATABASE.cloudSqlInstance));

  assert.equal(plan.foundation.organization, '361825816000');
  assert.deepEqual(plan.foundation.privateNetwork, {
    project: 'jenfu-platform-prod',
    network: CLOUD_RUN_TARGET.network,
    subnet: CLOUD_RUN_TARGET.subnet,
    crossProjectAssociationRequired: false,
  });
  assert.deepEqual(plan.foundation.serviceAccounts.map(({ email, databaseLogin }) => ({ email, databaseLogin })), [
    { email: 'projed-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', databaseLogin: MANAGED_DATABASE.iamLogins.runtime },
    { email: 'projed-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com', databaseLogin: MANAGED_DATABASE.iamLogins.migrator },
    { email: 'projed-prod-importer@jenfu-platform-prod.iam.gserviceaccount.com', databaseLogin: MANAGED_DATABASE.iamLogins.importer },
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
  assert.equal(migration.serviceAccount, 'projed-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com');
  assert.equal(migration.volumes.some(({ secret }) => Boolean(secret)), false);
  assert.equal(migration.containers[0].env.some(({ name }) => name.includes('SOURCE_BUNDLE')), false);
  assert.equal(migration.containers[0].env.find(({ name }) => name === 'PROJED_MIGRATOR_DATABASE_URL').value,
    'postgresql://projed-prod-migrator%40jenfu-platform-prod.iam@localhost/jenfu_prod?host=%2Fcloudsql%2Fjenfu-platform-prod%3Aasia-east1%3Ajenfu-platform-prod-pg');

  for (const mode of ['plan', 'apply', 'reconcile']) {
    const importer = plan.jobs[mode].template.template;
    assert.equal(importer.serviceAccount, 'projed-prod-importer@jenfu-platform-prod.iam.gserviceaccount.com');
    assert.deepEqual(importer.volumes[1].secret, {
      secret: `projects/jenfu-platform-prod/secrets/${CLOUD_RUN_TARGET.sourceBundleSecret}`,
      items: [{ version: '1', path: 'bundle.json' }],
    });
    assert.equal(importer.volumes[1].secret.items.some(({ version }) => version === 'latest'), false);
  }

  const analysis = plan.jobs.analysis.template;
  const analysisTask = analysis.template;
  const [analysisContainer] = analysisTask.containers;
  assert.equal(plan.jobs.analysis.name, 'projects/jenfu-platform-prod/locations/asia-east1/jobs/projed-meeting-analysis');
  assert.equal(analysis.taskCount, 1);
  assert.equal(analysis.parallelism, 1);
  assert.equal(analysisTask.serviceAccount, 'projed-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com');
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
    'postgresql://projed-prod-runtime%40jenfu-platform-prod.iam@localhost/jenfu_prod?host=%2Fcloudsql%2Fjenfu-platform-prod%3Aasia-east1%3Ajenfu-platform-prod-pg');
  assert.equal(analysisEnvironment.PROJED_MEETING_AUDIO_BUCKET, input.audioBucket);

  assert.equal(plan.scheduler.name,
    'projects/jenfu-platform-prod/locations/asia-east1/jobs/projed-meeting-analysis-recovery');
  assert.equal(plan.scheduler.schedule, '*/15 * * * *');
  assert.equal(plan.scheduler.timeZone, 'Asia/Taipei');
  assert.deepEqual(plan.scheduler.retryConfig, { retryCount: 0 });
  assert.deepEqual(plan.scheduler.httpTarget, {
    uri: 'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/jobs/projed-meeting-analysis:run',
    httpMethod: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'e30=',
    oauthToken: {
      serviceAccountEmail: 'projed-prod-meeting-scheduler@jenfu-platform-prod.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    },
  });
  assert.equal('oidcToken' in plan.scheduler.httpTarget, false);

  assert.deepEqual(plan.foundation.enableApis[0].services, [
    'run.googleapis.com', 'compute.googleapis.com', 'sqladmin.googleapis.com', 'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com', 'secretmanager.googleapis.com', 'cloudscheduler.googleapis.com',
    'speech.googleapis.com', 'aiplatform.googleapis.com', 'storage.googleapis.com',
  ]);
  assert.deepEqual(plan.foundation.schedulerServiceAccount, {
    email: 'projed-prod-meeting-scheduler@jenfu-platform-prod.iam.gserviceaccount.com',
    databaseLogin: null, databaseIamRoles: [], databaseGrants: [],
  });
  assert.equal(plan.foundation.sqlIamUsers.some(({ serviceAccount }) =>
    serviceAccount === plan.foundation.schedulerServiceAccount.email), false);
  assert.equal(plan.foundation.customRoles.some(({ name }) => /scheduler/i.test(name)), false);
  assert.deepEqual(plan.foundation.iamBindings.filter(({ role }) => role === 'roles/run.invoker'), [
    { resource: plan.jobs.analysis.name,
      member: 'serviceAccount:projed-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', role: 'roles/run.invoker' },
    { resource: plan.jobs.analysis.name,
      member: 'serviceAccount:projed-prod-meeting-scheduler@jenfu-platform-prod.iam.gserviceaccount.com', role: 'roles/run.invoker' },
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
    method: 'POST', url: 'https://cloudscheduler.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/jobs',
    body: plan.scheduler,
  });
  assert.deepEqual(plan.requests[0].body, {
    labels: plan.service.labels, ingress: plan.service.ingress,
    invokerIamDisabled: plan.service.invokerIamDisabled,
    traffic: plan.service.traffic, template: plan.service.template,
  });
  assert.deepEqual(plan.requests.slice(1, 6).map(({ body }) => body),
    Object.values(plan.jobs).map(job => ({ labels: job.labels, template: job.template })));
  assert.equal(plan.requests.some(({ url }) => /hosting|traffic|setIamPolicy|secrets\/|runWithOverrides/iu.test(url)), false);
});

test('meeting IAM grants inference only to runtime and audio access only on the private bucket', () => {
  const { foundation, requests } = renderProjedCloudRun(makeInput());
  const roles = Object.fromEntries(foundation.customRoles.map(role => [role.name, role.includedPermissions]));
  const inferenceRole = 'projects/jenfu-platform-prod/roles/projedMeetingInference';
  const audioRole = 'projects/jenfu-platform-prod/roles/projedMeetingAudio';
  assert.deepEqual(roles[inferenceRole], ['aiplatform.endpoints.predict']);
  const quotaRole = 'projects/jenfu-platform-prod/roles/projedSpeechV1Quota';
  assert.deepEqual(roles[quotaRole], ['serviceusage.services.use']);
  assert.equal(foundation.iamBindings.filter(binding => binding.role === quotaRole).length, 1);
  assert.deepEqual(roles[audioRole], ['storage.objects.create', 'storage.objects.get', 'storage.objects.delete']);
  assert.deepEqual(foundation.iamBindings.filter(({ role }) => role === inferenceRole || role === audioRole), [
    { resource: 'projects/jenfu-platform-prod', member: 'serviceAccount:projed-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', role: inferenceRole },
    { resource: 'projects/_/buckets/jenfu-platform-prod-projed-meeting-audio', member: 'serviceAccount:projed-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', role: audioRole },
  ]);
  assert.equal(foundation.iamBindings.some(({ role }) => /roles\/(?:owner|editor|storage\.admin|aiplatform\.admin)$/.test(role)), false);
  assert.ok(requests.every(({ url }) => !/setIamPolicy|iam.googleapis.com|cacheConfig|storage.googleapis.com/.test(url)));
});

test('audio deletion and provider ZDR settings remain explicit unexecuted foundation prerequisites', () => {
  const plan = renderProjedCloudRun(makeInput({ audioBucket: 'jenfu-platform-prod-projed-meeting-audio' }));
  const storage = plan.foundation.audioStorage;
  assert.equal(storage.resource, 'projects/_/buckets/jenfu-platform-prod-projed-meeting-audio');
  assert.deepEqual(storage.createRequest.body, {
    name: 'jenfu-platform-prod-projed-meeting-audio', location: 'ASIA-EAST1', storageClass: 'STANDARD',
    iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' },
    versioning: { enabled: false }, softDeletePolicy: { retentionDurationSeconds: '0' },
  });
  assert.equal('retentionPolicy' in storage.createRequest.body, false);
  assert.equal('lifecycle' in storage.createRequest.body, false);
  assert.equal(storage.expiryExecutor, 'projed-meeting-analysis');
  const provider = plan.foundation.providerConfiguration;
  assert.equal(provider.qualificationApplied, false);
  assert.deepEqual(provider.vertex.cacheConfig.body, { name: 'projects/jenfu-platform-prod/cacheConfig', disableCache: true });
  assert.equal(provider.vertex.abuseMonitoring, 'exempt');
  assert.deepEqual(provider.vertex.models, [{ location: 'us-central1', model: 'gemini-embedding-001' },
    { location: 'global', model: 'gemini-3.1-flash-lite' }, { location: 'global', model: 'gemini-3.5-flash' }]);
  assert.equal(provider.vertex.applicableAgreementEvidenceRequired, true);
  assert.equal(provider.vertex.projectSettingReadbackRequired, true);
  assert.equal(provider.speech.method, 'speech:recognize');
  assert.equal(provider.speech.apiVersion, 'v1');
  assert.equal(provider.speech.dataLogging, 'disabled');
  assert.equal(provider.speech.optInProhibited, true);
  assert.equal(provider.speech.externalOptInRevokesQualification, true);
  assert.equal(provider.speech.runtimeServiceAccountProbeRequired, true);
  assert.equal(Object.hasOwn(provider.speech, 'projectSettingReadbackRequired'), false);
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

test('renderer rejects every bucket outside the approved private meeting storage', () => {
  for (const audioBucket of ['other-private-meeting-audio', '', 'ab', 'UPPERCASE', 'run-sources', 'run-sources-projed-123',
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
