import { MANAGED_DATABASE, assertManagedIamLogins, validateManagedDatabaseUrl,
  validateManagedRuntimeJobDatabaseUrl } from '../../shared/dev139ManagedDatabase.mjs';
import { S3_MIGRATION_PATHS } from './dev139-migration-paths.mjs';
import { MANAGED_MEETING_AUDIO_BUCKET } from '../../shared/dev139MeetingAudio.mjs';
import { LEGACY_ENTRY_ORIGINS, LEGACY_ENTRY_TARGET } from './dev139-legacy-entry-plan.mjs';
import { MANAGED_PROJECT_ID, MANAGED_PROJECT_NUMBER, MANAGED_IMAGE_REPOSITORY,
  MANAGED_PUBLIC_ORIGIN, MANAGED_SSO_BROKER_ORIGIN } from '../../shared/dev139DeploymentTarget.mjs';

export const CLOUD_RUN_TARGET = Object.freeze({
  project: MANAGED_PROJECT_ID, projectNumber: MANAGED_PROJECT_NUMBER, organization: '361825816000',
  region: 'asia-east1', service: 'projed-prod', analysisJob: 'projed-meeting-analysis',
  recoveryScheduler: 'projed-meeting-analysis-recovery',
  publicOrigin: MANAGED_PUBLIC_ORIGIN,
  repository: MANAGED_IMAGE_REPOSITORY,
  hostProject: 'jenfu-platform-prod', sqlInstance: 'jenfu-platform-prod-pg',
  network: 'projects/jenfu-platform-prod/global/networks/jenfu-platform-prod-vpc',
  subnet: 'projects/jenfu-platform-prod/regions/asia-east1/subnetworks/jenfu-platform-prod-runtime',
  sourceBundleSecret: 'projed-prod-migration-source',
  proxyImage: 'gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f',
});

const SHA256 = /^[a-f0-9]{64}$/;
const INPUT_KEYS = ['analysisImage', 'audioBucket', 'binding', 'jobsImage', 'releaseId', 'runtimeImage',
  'sourceBundleVersion', 'sourceRevision'];
const BINDING_KEYS = ['cloudSqlInstance', 'connectionMode', 'databaseName', 'databasePort', 'iamLogins',
  'migrationSha256', 'profileSha256', 'runtimeRole', 'staticFixtureSha256'];
function invalid() { throw Object.assign(new Error('Cloud Run render inputs are outside the ProJED contract'), { code: 'CLOUD_RUN_INPUT_INVALID' }); }
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) invalid();
}
function immutableImage(image, suffix) {
  const prefix = `${CLOUD_RUN_TARGET.repository}/${suffix}@sha256:`;
  if (typeof image !== 'string' || !image.startsWith(prefix) || !SHA256.test(image.slice(prefix.length))) invalid();
}
function account(purpose) { return `projed-prod-${purpose}@${CLOUD_RUN_TARGET.project}.iam.gserviceaccount.com`; }
function databaseUrl(binding, purpose) {
  const login = encodeURIComponent(binding.iamLogins[purpose]);
  return purpose === 'runtime'
    ? `postgresql://${login}@127.0.0.1:5432/${binding.databaseName}`
    : `postgresql://${login}@localhost/${binding.databaseName}?host=${encodeURIComponent(`/cloudsql/${binding.cloudSqlInstance}`)}`;
}
function runtimeJobDatabaseUrl(binding) {
  const login = encodeURIComponent(binding.iamLogins.runtime);
  const raw = `postgresql://${login}@localhost/${binding.databaseName}?host=${encodeURIComponent(`/cloudsql/${binding.cloudSqlInstance}`)}`;
  try { validateManagedRuntimeJobDatabaseUrl(raw, binding); } catch { invalid(); }
  return raw;
}
function vpcAccess() {
  return { egress: 'PRIVATE_RANGES_ONLY', networkInterfaces: [{ network: CLOUD_RUN_TARGET.network, subnetwork: CLOUD_RUN_TARGET.subnet }] };
}
function env(name, value) { return { name, value }; }
// Cloud Run v2 create uses serviceId/jobId; the server rejects resource.name
// in the create body. Keep names on the desired resources for exact readback.
function createBody(resource) {
  return Object.fromEntries(Object.entries(resource).filter(([key]) => key !== 'name'));
}

/** Pure create-request rendering. This performs no provider calls or deployment
 * admission; the caller must extract binding from the immutable Job image and
 * verify source, grants, route and existing resources before any mutation. */
export function renderProjedCloudRun(input) {
  const candidateOnly = input?.deploymentScope === 'candidate';
  const hasEntryStage = input !== null && typeof input === 'object' && Object.hasOwn(input, 'entryStage');
  const keys = candidateOnly
    ? [...INPUT_KEYS.filter(key => key !== 'sourceBundleVersion'), 'deploymentScope'] : INPUT_KEYS;
  exactKeys(input, hasEntryStage ? [...keys, 'entryStage'] : keys);
  // D6 keeps current browser origins first. Explicit final entry reuses the
  // two provider-observed aliases of this service, preserving host-only cookies.
  const entryStage = hasEntryStage ? input.entryStage : 'legacy';
  if (entryStage !== 'legacy' && entryStage !== 'direct') invalid();
  const entryOrigins = entryStage === 'legacy' ? LEGACY_ENTRY_ORIGINS
    : { main: CLOUD_RUN_TARGET.publicOrigin, quick: LEGACY_ENTRY_TARGET.upstream };
  // Both transports use the same Session composition. Configuration is not
  // qualification: identity pins and provider bindings remain independent.
  const sessionEnvironment = [env('PROJED_SSO_BROKER_ORIGIN', MANAGED_SSO_BROKER_ORIGIN),
    env('PROJED_MAIN_PUBLIC_ORIGIN', entryOrigins.main),
    env('PROJED_QUICK_PUBLIC_ORIGIN', entryOrigins.quick)];
  const { binding, runtimeImage, jobsImage, analysisImage, audioBucket, releaseId, sourceRevision, sourceBundleVersion } = input;
  if (typeof releaseId !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(releaseId)
      || typeof sourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(sourceRevision)
      || (!candidateOnly && (typeof sourceBundleVersion !== 'string'
        || !/^[1-9][0-9]{0,9}$/.test(sourceBundleVersion)))) invalid();
  immutableImage(runtimeImage, 'projed-prod');
  immutableImage(jobsImage, 'projed-prod-jobs');
  immutableImage(analysisImage, 'projed-prod-asr-job');
  if (audioBucket !== MANAGED_MEETING_AUDIO_BUCKET) invalid();
  exactKeys(binding, BINDING_KEYS);
  try {
    assertManagedIamLogins(binding.iamLogins);
    for (const purpose of ['runtime', 'migrator', 'importer']) validateManagedDatabaseUrl(databaseUrl(binding, purpose), binding, purpose);
  } catch { invalid(); }
  if (typeof binding.profileSha256 !== 'string' || !SHA256.test(binding.profileSha256)
      || typeof binding.staticFixtureSha256 !== 'string' || !SHA256.test(binding.staticFixtureSha256)
      || !binding.migrationSha256 || typeof binding.migrationSha256 !== 'object'
      || Object.keys(binding.migrationSha256).sort().join('|') !== [...S3_MIGRATION_PATHS].sort().join('|')
      || Object.values(binding.migrationSha256).some(sha => typeof sha !== 'string' || !SHA256.test(sha))) invalid();

  const target = CLOUD_RUN_TARGET;
  const parent = `projects/${target.project}/locations/${target.region}`;
  const labels = { 'projed-task': 'dev-139', 'projed-release': releaseId, 'projed-source': sourceRevision };
  const service = {
    name: `${parent}/services/${target.service}`, labels,
    ingress: 'INGRESS_TRAFFIC_ALL',
    // A new candidate remains behind IAM. Publication of the direct run.app
    // entry is separate and is not authorized by rendering this plan.
    invokerIamDisabled: false,
    traffic: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', percent: 100 }],
    template: {
      serviceAccount: account('runtime'), executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
      scaling: { minInstanceCount: 0, maxInstanceCount: 1 }, maxInstanceRequestConcurrency: 40,
      timeout: '60s', vpcAccess: vpcAccess(),
      containers: [
        {
          name: 'projed', image: runtimeImage, dependsOn: ['cloud-sql-proxy'],
          ports: [{ name: 'http1', containerPort: 8080 }],
          env: [env('PROJED_ENV', 'managed'), env('PROJED_APP_ENTRY', 'main'),
            env('PROJED_SOURCE_PROFILE', 'config/dev-139/s3-managed.profile.json'),
            env('PROJED_RUNTIME_BINDING_JSON', JSON.stringify(binding)),
            env('PROJED_DATABASE_URL', databaseUrl(binding, 'runtime')),
            env('PROJED_MEETING_AUDIO_BUCKET', audioBucket),
            env('PROJED_PUBLIC_APP_URL', entryOrigins.main),
            ...sessionEnvironment],
          resources: { limits: { cpu: '1', memory: '512Mi' }, cpuIdle: true, startupCpuBoost: true },
          startupProbe: { initialDelaySeconds: 0, timeoutSeconds: 2, periodSeconds: 5, failureThreshold: 36,
            httpGet: { path: '/health/ready', port: 8080 } },
        },
        {
          name: 'cloud-sql-proxy', image: target.proxyImage,
          args: ['--address=0.0.0.0', '--port=5432', '--private-ip', '--auto-iam-authn',
            '--lazy-refresh', '--structured-logs', '--max-connections=5', MANAGED_DATABASE.cloudSqlInstance],
          resources: { limits: { cpu: '1', memory: '256Mi' }, cpuIdle: true, startupCpuBoost: true },
          startupProbe: { initialDelaySeconds: 1, timeoutSeconds: 2, periodSeconds: 3, failureThreshold: 30,
            tcpSocket: { port: 5432 } },
        },
      ],
    },
  };
  const jobs = {};
  for (const mode of candidateOnly ? ['migrate'] : ['migrate', 'plan', 'apply', 'reconcile']) {
    const purpose = mode === 'migrate' ? 'migrator' : 'importer';
    const name = mode === 'migrate' ? 'projed-prod-migration' : `projed-prod-snapshot-${mode}`;
    const environment = [env('PROJED_ENV', 'managed')];
    const volumes = [{ name: 'cloudsql', cloudSqlInstance: { instances: [binding.cloudSqlInstance] } }];
    const mounts = [{ name: 'cloudsql', mountPath: '/cloudsql' }];
    if (mode === 'migrate') environment.push(env('PROJED_MIGRATOR_DATABASE_URL', databaseUrl(binding, purpose)));
    else {
      environment.push(env('PROJED_MIGRATION_TARGET_DATABASE_URL', databaseUrl(binding, purpose)),
        env('PROJED_MIGRATION_SOURCE_BUNDLE_FILE', '/secrets/source/bundle.json'));
      volumes.push({ name: 'source-bundle', secret: {
        secret: `projects/${target.project}/secrets/${target.sourceBundleSecret}`,
        items: [{ version: sourceBundleVersion, path: 'bundle.json' }],
      } });
      mounts.push({ name: 'source-bundle', mountPath: '/secrets/source' });
    }
    jobs[mode] = {
      name: `${parent}/jobs/${name}`, labels,
      template: { taskCount: 1, parallelism: 1, template: {
        serviceAccount: account(purpose), executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
        maxRetries: 0, timeout: '1800s', vpcAccess: vpcAccess(), volumes,
        containers: [{ name: 'projed-job', image: jobsImage, command: ['node'],
          args: ['scripts/run-dev139-managed-job.mjs', mode], env: environment, volumeMounts: mounts,
          resources: { limits: { cpu: '1', memory: '512Mi' } } }],
      } },
    };
  }

  const analysisJob = `${parent}/jobs/${target.analysisJob}`;
  const meetingSchedulerAccount = account('meeting-scheduler');
  const schedulerName = `${parent}/jobs/${target.recoveryScheduler}`;
  jobs.analysis = {
    name: analysisJob, labels,
    template: { taskCount: 1, parallelism: 1, template: {
      serviceAccount: account('runtime'), executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
      maxRetries: 0, timeout: '600s', vpcAccess: vpcAccess(),
      volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: [binding.cloudSqlInstance] } }],
      containers: [{ name: 'projed-analysis', image: analysisImage,
        env: [env('PROJED_ENV', 'managed'), env('PROJED_APP_ENTRY', 'main'),
          env('PROJED_SOURCE_PROFILE', 'config/dev-139/s3-managed.profile.json'),
          env('PROJED_RUNTIME_BINDING_JSON', JSON.stringify(binding)),
          env('PROJED_DATABASE_URL', runtimeJobDatabaseUrl(binding)),
          env('PROJED_MEETING_AUDIO_BUCKET', audioBucket), ...sessionEnvironment],
        volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }],
        resources: { limits: { cpu: '1', memory: '512Mi' } } }],
    } },
  };

  const scheduler = {
    name: schedulerName,
    schedule: '*/15 * * * *',
    timeZone: 'Asia/Taipei',
    retryConfig: { retryCount: 0 },
    httpTarget: {
      uri: `https://run.googleapis.com/v2/${analysisJob}:run`,
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'e30=',
      oauthToken: {
        serviceAccountEmail: meetingSchedulerAccount,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
      },
    },
  };

  const sqlCondition = { title: 'projed-exact-sql-instance', expression:
    `resource.type == 'sqladmin.googleapis.com/Instance' && resource.name == 'projects/${target.hostProject}/instances/${target.sqlInstance}'` };
  const foundation = {
    organization: target.organization,
    enableApis: [{ project: target.project, services: ['run.googleapis.com', 'compute.googleapis.com',
      'sqladmin.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'secretmanager.googleapis.com',
      'cloudscheduler.googleapis.com', 'speech.googleapis.com', 'aiplatform.googleapis.com', 'storage.googleapis.com'] }],
    privateNetwork: { project: target.project, network: target.network, subnet: target.subnet,
      crossProjectAssociationRequired: false },
    serviceAccounts: (candidateOnly ? ['runtime', 'migrator'] : ['runtime', 'migrator', 'importer'])
      .map(purpose => ({ email: account(purpose), databaseLogin: binding.iamLogins[purpose] })),
    schedulerServiceAccount: candidateOnly ? null : {
      email: meetingSchedulerAccount, databaseLogin: null, databaseIamRoles: [], databaseGrants: [],
    },
    // Existing source buckets retain deleted objects for seven days. Audio
    // requires its own bucket so exact-generation cleanup really removes it.
    audioStorage: {
      resource: `projects/_/buckets/${audioBucket}`,
      createRequest: { method: 'POST', url: `https://storage.googleapis.com/storage/v1/b?project=${target.project}`,
        body: { name: audioBucket, location: target.region.toUpperCase(), storageClass: 'STANDARD',
          iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' },
          versioning: { enabled: false }, softDeletePolicy: { retentionDurationSeconds: '0' } } },
      // No age-based lifecycle: the app's seven-day deadline starts at stop,
      // not object creation. The existing generation-bound worker owns expiry.
      expiryExecutor: target.analysisJob,
    },
    customRoles: [
      { name: `projects/${target.project}/roles/projedMeetingInference`,
        title: 'ProJED meeting inference', stage: 'GA',
        includedPermissions: ['aiplatform.endpoints.predict'] },
      { name: `projects/${target.project}/roles/projedSpeechV1Quota`,
        title: 'ProJED Speech V1 quota', stage: 'GA',
        includedPermissions: ['serviceusage.services.use'] },
      { name: `projects/${target.project}/roles/projedMeetingAudio`,
        title: 'ProJED private meeting audio', stage: 'GA',
        includedPermissions: ['storage.objects.create', 'storage.objects.get', 'storage.objects.delete'] },
    ],
    // Desired configuration only, never provider qualification. In particular,
    // neither API enablement nor cache=false proves an abuse-logging exemption.
    providerConfiguration: {
      qualificationApplied: false,
      speech: { method: 'speech:recognize', apiVersion: 'v1', dataLogging: 'disabled',
        optInProhibited: true, externalOptInRevokesQualification: true,
        runtimeServiceAccountProbeRequired: true },
      vertex: { cacheConfig: { url: `https://us-central1-aiplatform.googleapis.com/v1/projects/${target.project}/cacheConfig`,
        body: { name: `projects/${target.project}/cacheConfig`, disableCache: true } },
        requestResponseLogging: 'disabled', abuseMonitoring: 'exempt',
        models: [{ location: 'us-central1', model: 'gemini-embedding-001' },
          { location: 'global', model: 'gemini-3.1-flash-lite' }, { location: 'global', model: 'gemini-3.5-flash' }],
        projectSettingReadbackRequired: true, applicableAgreementEvidenceRequired: true },
    },
    iamBindings: [
      ...(candidateOnly ? ['runtime', 'migrator'] : ['runtime', 'migrator', 'importer']).flatMap(purpose => ['roles/cloudsql.client', 'roles/cloudsql.instanceUser']
        .map(role => ({ resource: `projects/${target.hostProject}`, member: `serviceAccount:${account(purpose)}`, role, condition: sqlCondition }))),
      ...(candidateOnly ? [] : [{ resource: `projects/${target.project}/secrets/${target.sourceBundleSecret}`,
        member: `serviceAccount:${account('importer')}`, role: 'roles/secretmanager.secretAccessor' }]),
      { resource: analysisJob, member: `serviceAccount:${account('runtime')}`,
        role: 'roles/run.invoker' },
      ...(candidateOnly ? [] : [{ resource: analysisJob, member: `serviceAccount:${meetingSchedulerAccount}`,
        role: 'roles/run.invoker' }]),
      { resource: `projects/${target.project}`, member: `serviceAccount:${account('runtime')}`,
        role: `projects/${target.project}/roles/projedMeetingInference` },
      { resource: `projects/${target.project}`, member: `serviceAccount:${account('runtime')}`,
        role: `projects/${target.project}/roles/projedSpeechV1Quota` },
      { resource: `projects/_/buckets/${audioBucket}`, member: `serviceAccount:${account('runtime')}`,
        role: `projects/${target.project}/roles/projedMeetingAudio` },
    ],
    sqlIamUsers: (candidateOnly ? ['runtime', 'migrator'] : ['runtime', 'migrator', 'importer']).map(purpose => ({
      project: target.hostProject, instance: target.sqlInstance, type: 'CLOUD_IAM_SERVICE_ACCOUNT',
      serviceAccount: account(purpose), databaseLogin: binding.iamLogins[purpose],
    })),
    ownerBootstrap: { project: target.hostProject, database: binding.databaseName,
      roles: MANAGED_DATABASE.roles, requiresTemporaryOwnerDatabaseCreate: true,
      revokeOwnerDatabaseCreateAfterMigration: true, implementedByThisRenderer: false,
      migrationJobInput: { ...(candidateOnly ? { profile: 'central-candidate' } : {}), sourceRevision, job:jobs.migrate, expectedMigrations:S3_MIGRATION_PATHS.map(path => ({
        version:path.slice('db/migrations/'.length,-'.sql'.length),checksum:binding.migrationSha256[path],
      })) },
      coordinatorPermissions: { principal:'dev010-prod-iac@jenfu-platform-prod.iam.gserviceaccount.com',
        job:jobs.migrate.name, cloudRunPermissions:['run.jobs.get','run.jobs.run','run.executions.get','run.operations.get'],
        loggingProject:target.project,loggingPermissions:['logging.logEntries.list'],
        loggingFilterScope:{job:'projed-prod-migration',location:target.region,execution:'exact-started-execution',stream:'stdout-migration-ledger-only'},
        iamChangesApplied:false },
    },
    operatorRequirements: {
      // Requirements for the authenticated operator, not automatic grants to an
      // arbitrary principal or a new owner/editor role.
      serviceAccountUserOn: (candidateOnly ? ['runtime', 'migrator']
        : ['runtime', 'migrator', 'importer', 'meeting-scheduler']).map(account),
      artifactReaderOn: `projects/${target.project}/locations/${target.region}/repositories/${target.repository.split('/').at(-1)}`,
      cloudRunProject: target.project,
      cloudRunPermissions: ['run.services.create', 'run.services.get', 'run.jobs.create',
        'run.jobs.get', 'run.jobs.run', 'run.executions.get', 'run.operations.get'],
      cloudSchedulerPermissions: candidateOnly ? [] : ['cloudscheduler.jobs.create', 'cloudscheduler.jobs.get'],
      cloudSchedulerProject: target.project,
      networkProject: target.project,
      apiEnableProjects: [target.project],
    },
  };
  // POST create requests intentionally cannot replace an existing service/job,
  // execute an import, rewrite Hosting, change existing traffic or grant permissions.
  const requests = [
    { method: 'POST', url: `https://run.googleapis.com/v2/${parent}/services?serviceId=${target.service}`, body: createBody(service) },
    ...Object.values(jobs).map(job => ({ method: 'POST',
      url: `https://run.googleapis.com/v2/${parent}/jobs?jobId=${job.name.split('/').at(-1)}`, body: createBody(job) })),
    ...(candidateOnly ? [] : [{ method: 'POST', url: `https://cloudscheduler.googleapis.com/v1/${parent}/jobs`, body: scheduler }]),
  ];
  return { renderOnly: true, sourceRevision, releaseId, entryStage, entryOrigins: { ...entryOrigins }, service, jobs,
    scheduler: candidateOnly ? null : scheduler, foundation, requests };
}
