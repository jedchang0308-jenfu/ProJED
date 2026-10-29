import { MANAGED_DATABASE, assertManagedIamLogins, validateManagedDatabaseUrl } from '../../shared/dev139ManagedDatabase.mjs';
import { S3_MIGRATION_PATHS } from './dev139-migration-paths.mjs';

export const CLOUD_RUN_TARGET = Object.freeze({
  project: 'projed-cc78d', projectNumber: '967362299895', organization: '361825816000',
  region: 'asia-east1', service: 'projed-prod',
  publicOrigin: 'https://projed-cc78d.web.app',
  repository: 'asia-east1-docker.pkg.dev/projed-cc78d/cloud-run-source-deploy',
  hostProject: 'jenfu-platform-prod', sqlInstance: 'jenfu-platform-prod-pg',
  network: 'projects/jenfu-platform-prod/global/networks/jenfu-platform-prod-vpc',
  subnet: 'projects/jenfu-platform-prod/regions/asia-east1/subnetworks/jenfu-platform-prod-runtime',
  sourceBundleSecret: 'projed-prod-migration-source',
  proxyImage: 'gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f',
});

const SHA256 = /^[a-f0-9]{64}$/;
const INPUT_KEYS = ['binding', 'jobsImage', 'releaseId', 'runtimeImage', 'sourceBundleVersion', 'sourceRevision'];
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
function vpcAccess() {
  return { egress: 'PRIVATE_RANGES_ONLY', networkInterfaces: [{ network: CLOUD_RUN_TARGET.network, subnetwork: CLOUD_RUN_TARGET.subnet }] };
}
function env(name, value) { return { name, value }; }

/** Pure create-request rendering. This performs no provider calls or deployment
 * admission; the caller must extract binding from the immutable Job image and
 * verify source, grants, route and existing resources before any mutation. */
export function renderProjedCloudRun(input) {
  exactKeys(input, INPUT_KEYS);
  const { binding, runtimeImage, jobsImage, releaseId, sourceRevision, sourceBundleVersion } = input;
  if (typeof releaseId !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(releaseId)
      || typeof sourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(sourceRevision)
      || typeof sourceBundleVersion !== 'string' || !/^[1-9][0-9]{0,9}$/.test(sourceBundleVersion)) invalid();
  immutableImage(runtimeImage, 'projed-prod');
  immutableImage(jobsImage, 'projed-prod-jobs');
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
    // A newly created service immediately routes to its latest ready revision,
    // behind IAM. Public invocation and the existing Hosting entry activate later.
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
            env('PROJED_PUBLIC_APP_URL', target.publicOrigin)],
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
  for (const mode of ['migrate', 'plan', 'apply', 'reconcile']) {
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

  const serviceAgent = `serviceAccount:service-${target.projectNumber}@serverless-robot-prod.iam.gserviceaccount.com`;
  const sqlCondition = { title: 'projed-exact-sql-instance', expression:
    `resource.type == 'sqladmin.googleapis.com/Instance' && resource.name == 'projects/${target.hostProject}/instances/${target.sqlInstance}'` };
  const foundation = {
    organization: target.organization,
    enableApis: [{ project: target.project, services: ['run.googleapis.com', 'compute.googleapis.com',
      'sqladmin.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'secretmanager.googleapis.com'] }],
    sharedVpc: { hostProject: target.hostProject, serviceProject: target.project, network: target.network, subnet: target.subnet },
    serviceAccounts: ['runtime', 'migrator', 'importer'].map(purpose => ({ email: account(purpose), databaseLogin: binding.iamLogins[purpose] })),
    iamBindings: [
      { resource: `projects/${target.hostProject}`, member: serviceAgent, role: 'roles/compute.networkViewer' },
      { resource: target.subnet, member: serviceAgent, role: 'roles/compute.networkUser' },
      ...['runtime', 'migrator', 'importer'].flatMap(purpose => ['roles/cloudsql.client', 'roles/cloudsql.instanceUser']
        .map(role => ({ resource: `projects/${target.hostProject}`, member: `serviceAccount:${account(purpose)}`, role, condition: sqlCondition }))),
      { resource: `projects/${target.project}/secrets/${target.sourceBundleSecret}`,
        member: `serviceAccount:${account('importer')}`, role: 'roles/secretmanager.secretAccessor' },
    ],
    sqlIamUsers: ['runtime', 'migrator', 'importer'].map(purpose => ({
      project: target.hostProject, instance: target.sqlInstance, type: 'CLOUD_IAM_SERVICE_ACCOUNT',
      serviceAccount: account(purpose), databaseLogin: binding.iamLogins[purpose],
    })),
    ownerBootstrap: { project: target.hostProject, database: binding.databaseName,
      roles: MANAGED_DATABASE.roles, requiresTemporaryOwnerDatabaseCreate: true,
      revokeOwnerDatabaseCreateAfterMigration: true, implementedByThisRenderer: false },
    operatorRequirements: {
      // Requirements for the authenticated operator, not automatic grants to an
      // arbitrary principal or a new owner/editor role.
      serviceAccountUserOn: ['runtime', 'migrator', 'importer'].map(account),
      artifactReaderOn: `projects/${target.project}/locations/${target.region}/repositories/cloud-run-source-deploy`,
      cloudRunProject: target.project,
      cloudRunPermissions: ['run.services.create', 'run.services.get', 'run.jobs.create',
        'run.jobs.get', 'run.jobs.run', 'run.executions.get', 'run.operations.get'],
      sharedVpcAdministration: { organization: target.organization,
        projects: [target.hostProject, target.project], requiresExistingAuthorizedAdministrator: true },
      apiEnableProjects: [target.project],
    },
  };
  // POST create requests intentionally cannot replace an existing service/job,
  // execute an import, rewrite Hosting, change existing traffic or grant permissions.
  const requests = [
    { method: 'POST', url: `https://run.googleapis.com/v2/${parent}/services?serviceId=${target.service}`, body: service },
    ...Object.values(jobs).map(job => ({ method: 'POST',
      url: `https://run.googleapis.com/v2/${parent}/jobs?jobId=${job.name.split('/').at(-1)}`, body: job })),
  ];
  return { renderOnly: true, sourceRevision, releaseId, service, jobs, foundation, requests };
}
