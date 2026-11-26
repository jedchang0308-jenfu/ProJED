import { isDeepStrictEqual } from 'node:util';

import { CLOUD_RUN_TARGET } from './dev139-cloud-run-plan.mjs';
import { LEGACY_ENTRY_ORIGINS, LEGACY_ENTRY_TARGET } from './dev139-legacy-entry-plan.mjs';
import { S3_MIGRATION_PATHS } from './dev139-migration-paths.mjs';
import { MANAGED_SSO_BROKER_ORIGIN } from '../../shared/dev139DeploymentTarget.mjs';

const SERVICE_NAME = `projects/${CLOUD_RUN_TARGET.project}/locations/${CLOUD_RUN_TARGET.region}/services/${CLOUD_RUN_TARGET.service}`;
const SERVICE_URL = `https://run.googleapis.com/v2/${SERVICE_NAME}?allowMissing=false&validateOnly=false`;
const SERVICE_VALIDATE_URL = `https://run.googleapis.com/v2/${SERVICE_NAME}?allowMissing=false&validateOnly=true`;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const REVISION = /^projed-prod-[a-z0-9][a-z0-9-]{0,62}$/u;
const CAMPAIGN = /^[a-zA-Z0-9._-]{1,80}$/u;
const IMAGE = new RegExp(`^${CLOUD_RUN_TARGET.repository.replaceAll('.', '\\.')}/projed-prod@sha256:[a-f0-9]{64}$`, 'u');
const ENVIRONMENT = [
  'PROJED_ENV', 'PROJED_APP_ENTRY', 'PROJED_SOURCE_PROFILE', 'PROJED_RUNTIME_BINDING_JSON',
  'PROJED_DATABASE_URL', 'PROJED_MEETING_AUDIO_BUCKET', 'PROJED_PUBLIC_APP_URL',
  'PROJED_MAIN_PUBLIC_ORIGIN', 'PROJED_QUICK_PUBLIC_ORIGIN', 'PROJED_SSO_BROKER_ORIGIN',
];
const MODEL_ENV = /(?:GEMINI|VERTEX|RAG|MODEL|API_KEY|CONTENT_LOG|CACHE)/iu;
const CANDIDATE_TAG = 'dev139-origin-cutover';
const VALIDATE_ONLY_SUCCESS = {
  httpStatus: 200,
  responseErrorAbsent: true,
  providerReadbackUnchanged: ['generation', 'observedGeneration', 'traffic', 'invokerIamDisabled'],
};
const COMPATIBLE_PROXY_IMAGES = new Set([
  CLOUD_RUN_TARGET.proxyImage,
  // Immutable digest on the current 100% production revision. Candidate
  // refreshes preserve it; proxy upgrades remain a separate release concern.
  'gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861',
]);
const READBACK_KEYS = ['client', 'clientVersion', 'conditions', 'createTime', 'creator', 'etag', 'generation',
  'ingress', 'labels', 'lastModifier', 'latestCreatedRevision', 'latestReadyRevision', 'launchStage', 'name',
  'observedGeneration', 'scaling', 'template', 'terminalCondition', 'traffic', 'trafficStatuses', 'uid',
  'updateTime', 'uri', 'urls'];

function assertProvenanceLabels(labels) {
  exactKeys(labels, ['projed-release', 'projed-source', 'projed-task']);
  if (labels['projed-task'] !== 'dev-139'
      || !/^[a-z][a-z0-9-]{0,62}$/u.test(labels['projed-release'] ?? '')
      || !/^[a-f0-9]{40}$/u.test(labels['projed-source'] ?? '')) invalid();
}

function invalid(detail = 'contract') {
  throw Object.assign(new Error('Origin cutover input is outside the reviewed DEV-139 contract'), {
    code: 'ORIGIN_CUTOVER_PLAN_INVALID',
    detail,
  });
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) invalid();
}

function envMap(container) {
  if (!container || !Array.isArray(container.env)) invalid();
  const result = {};
  for (const row of container.env) {
    exactKeys(row, ['name', 'value']);
    if (typeof row.name !== 'string' || typeof row.value !== 'string' || Object.hasOwn(result, row.name)) invalid();
    result[row.name] = row.value;
  }
  if (!isDeepStrictEqual(Object.keys(result).sort(), [...ENVIRONMENT].sort())
      || Object.keys(result).some(name => MODEL_ENV.test(name))) invalid();
  return result;
}

function parseJson(value) {
  try { return JSON.parse(value); }
  catch { invalid(); }
}

function revisionName(value) {
  const prefix = `${SERVICE_NAME}/revisions/`;
  if (typeof value !== 'string' || !value.startsWith(prefix)) invalid();
  const revision = value.slice(prefix.length);
  if (!REVISION.test(revision)) invalid();
  return revision;
}

function normalizeReadback(readback, { allowOmittedTemplateMetadata = false } = {}) {
  exactKeys(readback, READBACK_KEYS);
  assertProvenanceLabels(readback.labels);
  if (readback.name !== SERVICE_NAME || readback.ingress !== 'INGRESS_TRAFFIC_ALL' || readback.launchStage !== 'GA'
      || readback.scaling?.maxInstanceCount !== 10 || Object.keys(readback.scaling).length !== 1
      || !Array.isArray(readback.urls)
      || !isDeepStrictEqual(new Set(readback.urls), new Set([CLOUD_RUN_TARGET.publicOrigin, LEGACY_ENTRY_TARGET.upstream]))
      || readback.uri !== LEGACY_ENTRY_TARGET.upstream || !Array.isArray(readback.conditions)
      || !Array.isArray(readback.trafficStatuses)) invalid();

  const latestReadyRevision = revisionName(readback.latestReadyRevision);
  if (revisionName(readback.latestCreatedRevision) !== latestReadyRevision
      || readback.terminalCondition?.type !== 'Ready'
      || readback.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
      || readback.conditions.some(condition => condition?.state !== 'CONDITION_SUCCEEDED')) invalid();

  const rawTemplate = readback.template;
  const templateKeys = ['containers', 'executionEnvironment', 'labels', 'maxInstanceRequestConcurrency', 'scaling',
    'serviceAccount', 'timeout', 'vpcAccess'];
  const hasTemplateMetadata = Object.hasOwn(rawTemplate ?? {}, 'revision')
    || Object.hasOwn(rawTemplate ?? {}, 'client') || Object.hasOwn(rawTemplate ?? {}, 'clientVersion');
  exactKeys(rawTemplate, hasTemplateMetadata ? [...templateKeys, 'client', 'clientVersion', 'revision'] : templateKeys);
  if ((!allowOmittedTemplateMetadata && !hasTemplateMetadata)
      || (hasTemplateMetadata && (rawTemplate.revision !== latestReadyRevision || typeof rawTemplate.client !== 'string'
        || typeof rawTemplate.clientVersion !== 'string'))) invalid();
  assertProvenanceLabels(rawTemplate.labels);
  const scalingKeys = Object.keys(rawTemplate.scaling ?? {}).sort();
  if (!isDeepStrictEqual(scalingKeys, ['maxInstanceCount']) || rawTemplate.scaling.maxInstanceCount !== 1) invalid();

  const traffic = readback.traffic.map(target => {
    const keys = ['revision', 'type'];
    if (Object.hasOwn(target, 'percent')) keys.push('percent');
    if (Object.hasOwn(target, 'tag')) keys.push('tag');
    exactKeys(target, keys);
    if (target.type !== 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION') invalid();
    return Object.fromEntries(Object.entries(target).filter(([key]) => key !== 'type'));
  });
  const template = {
    labels: structuredClone(rawTemplate.labels),
    scaling: { minInstanceCount: 0, maxInstanceCount: rawTemplate.scaling.maxInstanceCount },
    vpcAccess: structuredClone(rawTemplate.vpcAccess), timeout: rawTemplate.timeout,
    serviceAccount: rawTemplate.serviceAccount, containers: structuredClone(rawTemplate.containers),
    executionEnvironment: rawTemplate.executionEnvironment,
    maxInstanceRequestConcurrency: rawTemplate.maxInstanceRequestConcurrency,
  };
  return {
    name: readback.name, uid: readback.uid, generation: readback.generation,
    observedGeneration: readback.observedGeneration, etag: readback.etag,
    ready: true, latestReadyRevision, invokerIamDisabled: false,
    image: rawTemplate.containers?.[0]?.image, template, traffic,
  };
}

function assertBaseline(input) {
  exactKeys(input, ['campaign', 'qualifiedArtifact', 'readback']);
  if (!CAMPAIGN.test(input.campaign ?? '')) invalid();
  const baseline = normalizeReadback(input.readback);
  exactKeys(baseline, ['etag', 'generation', 'image', 'invokerIamDisabled', 'latestReadyRevision', 'name',
    'observedGeneration', 'ready', 'template', 'traffic', 'uid']);
  if (baseline.name !== SERVICE_NAME || !UUID.test(baseline.uid ?? '')
      || !/^[1-9][0-9]*$/u.test(baseline.generation ?? '')
      || baseline.observedGeneration !== baseline.generation || baseline.ready !== true
      || typeof baseline.etag !== 'string' || baseline.etag.length < 8 || /[\r\n\p{Cc}]/u.test(baseline.etag)
      || baseline.invokerIamDisabled !== false || !REVISION.test(baseline.latestReadyRevision ?? '')
      || !IMAGE.test(baseline.image ?? '') || !Array.isArray(baseline.traffic)) invalid();

  const weighted = baseline.traffic.filter(target => target?.percent !== undefined);
  const existingCandidateTargets = baseline.traffic.filter(target => target?.tag === CANDIDATE_TAG);
  if (weighted.length !== 1 || weighted[0].percent !== 100
      || weighted[0].revision !== baseline.latestReadyRevision
      || baseline.traffic.some(target => !target || typeof target !== 'object' || Array.isArray(target)
        || !REVISION.test(target.revision ?? '') || (target.percent !== undefined && target.percent !== 100)
        || (target.tag !== undefined && !/^[a-z][a-z0-9-]{0,62}$/u.test(target.tag)))
      || existingCandidateTargets.length > 1
      || existingCandidateTargets.some(target => target.percent !== undefined)) invalid();

  const template = baseline.template;
  exactKeys(template, ['containers', 'executionEnvironment', 'labels', 'maxInstanceRequestConcurrency', 'scaling',
    'serviceAccount', 'timeout', 'vpcAccess']);
  if (template.serviceAccount !== 'projed-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'
      || template.executionEnvironment !== 'EXECUTION_ENVIRONMENT_GEN2'
      || template.maxInstanceRequestConcurrency !== 40 || template.timeout !== '60s'
      || !isDeepStrictEqual(template.scaling, { minInstanceCount: 0, maxInstanceCount: 1 })
      || !isDeepStrictEqual(template.vpcAccess, { egress: 'PRIVATE_RANGES_ONLY', networkInterfaces: [{
        network: CLOUD_RUN_TARGET.network, subnetwork: CLOUD_RUN_TARGET.subnet,
      }] }) || !Array.isArray(template.containers) || template.containers.length !== 2) invalid();

  const app = template.containers[0];
  const proxy = template.containers[1];
  exactKeys(app, ['dependsOn', 'env', 'image', 'name', 'ports', 'resources', 'startupProbe']);
  exactKeys(proxy, ['args', 'image', 'name', 'resources', 'startupProbe']);
  if (app.name !== 'projed' || app.image !== baseline.image
      || !isDeepStrictEqual(app.resources, { limits: { cpu: '1', memory: '512Mi' }, cpuIdle: true, startupCpuBoost: true })
      || !isDeepStrictEqual(app.ports, [{ name: 'http1', containerPort: 8080 }])
      || !isDeepStrictEqual(app.dependsOn, ['cloud-sql-proxy'])
      || !isDeepStrictEqual(app.startupProbe, { timeoutSeconds: 2, periodSeconds: 5, failureThreshold: 36,
        httpGet: { path: '/health/ready', port: 8080 } })
      || proxy?.name !== 'cloud-sql-proxy' || !COMPATIBLE_PROXY_IMAGES.has(proxy.image)
      || !isDeepStrictEqual(proxy.resources, { limits: { cpu: '1', memory: '256Mi' }, cpuIdle: true, startupCpuBoost: true })
      || !isDeepStrictEqual(proxy.startupProbe, { initialDelaySeconds: 1, timeoutSeconds: 2, periodSeconds: 3,
        failureThreshold: 30, tcpSocket: { port: 5432 } })
      || !isDeepStrictEqual(proxy.args, ['--address=0.0.0.0', '--port=5432', '--private-ip', '--auto-iam-authn',
        '--lazy-refresh', '--structured-logs', '--max-connections=5',
        'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'])) invalid();
  const environment = envMap(app);
  if (environment.PROJED_ENV !== 'managed' || environment.PROJED_APP_ENTRY !== 'main'
      || environment.PROJED_SOURCE_PROFILE !== 'config/dev-139/s3-managed.profile.json'
      || environment.PROJED_MEETING_AUDIO_BUCKET !== 'jenfu-platform-prod-projed-meeting-audio'
      || environment.PROJED_PUBLIC_APP_URL !== LEGACY_ENTRY_ORIGINS.main
      || environment.PROJED_MAIN_PUBLIC_ORIGIN !== LEGACY_ENTRY_ORIGINS.main
      || environment.PROJED_QUICK_PUBLIC_ORIGIN !== LEGACY_ENTRY_ORIGINS.quick
      || environment.PROJED_SSO_BROKER_ORIGIN !== MANAGED_SSO_BROKER_ORIGIN) invalid();
  try {
    const binding = JSON.parse(environment.PROJED_RUNTIME_BINDING_JSON);
    if (binding.cloudSqlInstance !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg') invalid();
  } catch { invalid(); }
  return { baseline, environment };
}

function assertQualifiedArtifact(artifact) {
  const binding = artifact?.binding;
  const proof = artifact?.proof;
  const runtimeImage = artifact?.registryImages?.runtime;
  if (artifact?.status !== 'QUALIFIED_PRIVATE_CANDIDATE_ARTIFACT'
      || !/^[a-f0-9]{40}$/u.test(artifact.sourceRevision ?? '')
      || !/^[a-z][a-z0-9-]{0,62}$/u.test(artifact.releaseId ?? '')
      || !IMAGE.test(runtimeImage ?? '') || proof?.status !== 'PASS'
      || proof.sourceRevision !== artifact.sourceRevision || proof.releaseId !== artifact.releaseId
      || !isDeepStrictEqual(proof.binding, binding) || proof.modelsEnabled !== false
      || artifact.trafficCutover !== false || artifact.productionSchemaApplied !== false
      || !binding || typeof binding !== 'object' || Array.isArray(binding)
      || binding.cloudSqlInstance !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'
      || binding.iamLogins?.runtime !== 'projed-prod-runtime@jenfu-platform-prod.iam'
      || !/^[a-f0-9]{64}$/u.test(binding.profileSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(binding.staticFixtureSha256 ?? '')) invalid();
  const migrations = binding.migrationSha256;
  if (!migrations || typeof migrations !== 'object' || Array.isArray(migrations)
      || !isDeepStrictEqual(Object.keys(migrations).sort(), [...S3_MIGRATION_PATHS].sort())
      || Object.values(migrations).some(checksum => !/^[a-f0-9]{64}$/u.test(checksum))) invalid();
  return { binding: structuredClone(binding), releaseId: artifact.releaseId,
    runtimeImage, sourceRevision: artifact.sourceRevision };
}

function switchConfiguration(campaign) {
  return {
    campaign,
    routes: [
      { entry: 'main', sourceOrigin: LEGACY_ENTRY_ORIGINS.main, targetOrigin: CLOUD_RUN_TARGET.publicOrigin,
        sourceSessionEntry: 'main', targetSessionEntry: 'main' },
      { entry: 'quick', sourceOrigin: LEGACY_ENTRY_ORIGINS.quick, targetOrigin: LEGACY_ENTRY_TARGET.upstream,
        sourceSessionEntry: 'quick', targetSessionEntry: 'quick' },
    ],
  };
}

function providerTraffic(target) {
  return { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', ...structuredClone(target) };
}

/** Pure, provider-bound preparation. It cannot publish a URL or move traffic. */
export function renderOriginCutoverPlan(input) {
  const { baseline, environment } = assertBaseline(input);
  const artifact = assertQualifiedArtifact(input.qualifiedArtifact);
  const desiredTemplate = structuredClone(baseline.template);
  desiredTemplate.labels = {
    'projed-release': artifact.releaseId,
    'projed-source': artifact.sourceRevision,
    'projed-task': 'dev-139',
  };
  desiredTemplate.containers[0].image = artifact.runtimeImage;
  const desiredEnvironment = {
    ...environment,
    PROJED_RUNTIME_BINDING_JSON: JSON.stringify(artifact.binding),
    PROJED_PUBLIC_APP_URL: CLOUD_RUN_TARGET.publicOrigin,
    PROJED_MAIN_PUBLIC_ORIGIN: CLOUD_RUN_TARGET.publicOrigin,
    PROJED_QUICK_PUBLIC_ORIGIN: LEGACY_ENTRY_TARGET.upstream,
    PROJED_MAIN_ADDITIONAL_PUBLIC_ORIGINS: JSON.stringify([LEGACY_ENTRY_ORIGINS.main]),
    PROJED_QUICK_ADDITIONAL_PUBLIC_ORIGINS: JSON.stringify([LEGACY_ENTRY_ORIGINS.quick]),
    PROJED_ORIGIN_SWITCH_CAMPAIGN: JSON.stringify(switchConfiguration(input.campaign)),
  };
  desiredTemplate.containers[0].env = Object.entries(desiredEnvironment).map(([name, value]) => ({ name, value }));

  const refreshedCandidateTraffic = [
    ...baseline.traffic.filter(target => target.tag !== CANDIDATE_TAG).map(providerTraffic),
    providerTraffic({ revision: '<verified-candidate-revision>', tag: CANDIDATE_TAG }),
  ];

  const candidateBody = { name: SERVICE_NAME, etag: baseline.etag, template: desiredTemplate };
  const publicActivationBody = { etag: '<fresh-etag>', invokerIamDisabled: true,
    traffic: [providerTraffic({ revision: '<verified-candidate-revision>', percent: 100, tag: CANDIDATE_TAG })] };
  return {
    renderOnly: true,
    action: 'prepare-old-and-new-origin-coexistence',
    target: { name: SERVICE_NAME, uid: baseline.uid, generation: baseline.generation, etag: baseline.etag },
    origins: {
      old: { ...LEGACY_ENTRY_ORIGINS },
      new: { main: CLOUD_RUN_TARGET.publicOrigin, quick: LEGACY_ENTRY_TARGET.upstream },
    },
    campaign: switchConfiguration(input.campaign),
    stages: {
      privateCandidate: {
        authorizedByThisPlan: true, movesTraffic: false, publishesNewOrigin: false,
        preconditions: { invokerIamDisabled: false, traffic: structuredClone(baseline.traffic) },
        request: { method: 'PATCH', url: `${SERVICE_URL}&updateMask=template`, body: candidateBody },
        expectedReadback: {
          uid: baseline.uid, generationGreaterThan: baseline.generation,
          image: artifact.runtimeImage, releaseId: artifact.releaseId, sourceRevision: artifact.sourceRevision,
          invokerIamDisabled: false, traffic: structuredClone(baseline.traffic),
        },
        verificationRoute: {
          requiresFreshReadbackAndEtag: true, movesTraffic: false, publishesNewOrigin: false,
          replacesExistingZeroTrafficTag: baseline.traffic.some(target => target.tag === CANDIDATE_TAG),
          requestTemplate: {
            method: 'PATCH', url: `${SERVICE_URL}&updateMask=traffic`,
            body: { etag: '<fresh-etag>', traffic: refreshedCandidateTraffic },
          },
        },
      },
      publicActivation: {
        authorizedByThisPlan: false, requiresHumanAuthorization: true, movesTraffic: true, publishesNewOrigin: true,
        prerequisites: ['fresh-etag', 'candidate-ready', 'old-url-smoke', 'rollback-bound', 'provider-validate-only-pass'],
        preflight: {
          requiredBeforeApply: true,
          successCriteria: structuredClone(VALIDATE_ONLY_SUCCESS),
          requestTemplate: {
            method: 'PATCH', url: `${SERVICE_VALIDATE_URL}&updateMask=invokerIamDisabled,traffic`,
            body: structuredClone(publicActivationBody),
          },
        },
        requestTemplate: {
          method: 'PATCH', url: `${SERVICE_URL}&updateMask=invokerIamDisabled,traffic`,
          body: structuredClone(publicActivationBody),
        },
        postActivationVerification: {
          required: ['canonical-main-login-and-reload', 'canonical-quick-login-and-reload',
            'old-origin-guidance', 'draft-handoff-and-account-isolation', 'main-and-quick-pwa-install-guidance'],
          failureAction: 'rollback-before-retry',
        },
      },
    },
    rollback: {
      requiresFreshReadbackAndEtag: true,
      bodyWithoutEtag: { name: SERVICE_NAME, invokerIamDisabled: false,
        traffic: baseline.traffic.map(providerTraffic), template: structuredClone(baseline.template) },
    },
    exclusions: ['iam-grant', 'secret-change', 'billing-change', 'capacity-change', 'model-enable', 'data-write'],
  };
}

function assertPreparedActivationPlan(plan) {
  exactKeys(plan, ['action', 'campaign', 'exclusions', 'origins', 'renderOnly', 'rollback', 'stages', 'target']);
  if (plan.renderOnly !== true || plan.action !== 'prepare-old-and-new-origin-coexistence'
      || !isDeepStrictEqual(plan.origins, {
        old: { ...LEGACY_ENTRY_ORIGINS },
        new: { main: CLOUD_RUN_TARGET.publicOrigin, quick: LEGACY_ENTRY_TARGET.upstream },
      }) || !isDeepStrictEqual(plan.campaign, switchConfiguration(plan.campaign?.campaign))
      || !isDeepStrictEqual(plan.exclusions,
        ['iam-grant', 'secret-change', 'billing-change', 'capacity-change', 'model-enable', 'data-write'])) invalid('prepared-plan');

  const privateCandidate = plan.stages?.privateCandidate;
  const publicActivation = plan.stages?.publicActivation;
  if (privateCandidate?.authorizedByThisPlan !== true || privateCandidate.movesTraffic !== false
      || privateCandidate.publishesNewOrigin !== false || publicActivation?.authorizedByThisPlan !== false
      || publicActivation.requiresHumanAuthorization !== true || publicActivation.movesTraffic !== true
      || publicActivation.publishesNewOrigin !== true
      || !isDeepStrictEqual(publicActivation.prerequisites,
        ['fresh-etag', 'candidate-ready', 'old-url-smoke', 'rollback-bound', 'provider-validate-only-pass'])
      || publicActivation.preflight?.requiredBeforeApply !== true
      || !isDeepStrictEqual(publicActivation.preflight.successCriteria, VALIDATE_ONLY_SUCCESS)
      || !isDeepStrictEqual(publicActivation.postActivationVerification?.required,
        ['canonical-main-login-and-reload', 'canonical-quick-login-and-reload',
          'old-origin-guidance', 'draft-handoff-and-account-isolation', 'main-and-quick-pwa-install-guidance'])
      || publicActivation.postActivationVerification?.failureAction !== 'rollback-before-retry') invalid('prepared-stages');

  const candidateTemplate = privateCandidate.request?.body?.template;
  const rollback = plan.rollback?.bodyWithoutEtag;
  if (privateCandidate.request.method !== 'PATCH' || privateCandidate.request.body.name !== SERVICE_NAME
      || privateCandidate.request.body.etag !== plan.target?.etag || !candidateTemplate
      || rollback?.name !== SERVICE_NAME || rollback.invokerIamDisabled !== false
      || !Array.isArray(rollback.traffic) || rollback.traffic.some(target =>
        target?.type !== 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION')
      || !rollback.template || plan.rollback.requiresFreshReadbackAndEtag !== true
      || plan.target?.name !== SERVICE_NAME || !UUID.test(plan.target.uid ?? '')) invalid('prepared-rollback');

  const expectedRollbackTraffic = privateCandidate.preconditions?.traffic?.map(providerTraffic);
  const rollbackTemplate = structuredClone(rollback.template);
  const candidateInvariant = structuredClone(candidateTemplate);
  const rollbackEnvironment = envMap(rollbackTemplate.containers?.[0]);
  if (privateCandidate.preconditions?.invokerIamDisabled !== false
      || !isDeepStrictEqual(rollback.traffic, expectedRollbackTraffic)
      || !IMAGE.test(rollbackTemplate.containers?.[0]?.image ?? '')
      || rollbackEnvironment.PROJED_PUBLIC_APP_URL !== LEGACY_ENTRY_ORIGINS.main
      || rollbackEnvironment.PROJED_MAIN_PUBLIC_ORIGIN !== LEGACY_ENTRY_ORIGINS.main
      || rollbackEnvironment.PROJED_QUICK_PUBLIC_ORIGIN !== LEGACY_ENTRY_ORIGINS.quick
      || rollbackEnvironment.PROJED_SSO_BROKER_ORIGIN !== MANAGED_SSO_BROKER_ORIGIN) invalid('prepared-rollback');
  assertProvenanceLabels(rollbackTemplate.labels);
  delete rollbackTemplate.labels;
  delete candidateInvariant.labels;
  rollbackTemplate.containers[0].image = '<application-image>';
  candidateInvariant.containers[0].image = '<application-image>';
  rollbackTemplate.containers[0].env = [];
  candidateInvariant.containers[0].env = [];
  if (!isDeepStrictEqual(rollbackTemplate, candidateInvariant)) invalid('prepared-rollback');
  return { candidateTemplate, privateCandidate, publicActivation, rollback };
}

/** Materializes a provider-bound activation request after the private candidate exists. It is still render-only. */
export function renderOriginActivationPlan(input) {
  exactKeys(input, ['preparedPlan', 'readback']);
  const prepared = assertPreparedActivationPlan(input.preparedPlan);
  const current = normalizeReadback(input.readback, { allowOmittedTemplateMetadata: true });
  if (current.uid !== input.preparedPlan.target.uid || current.ready !== true
      || !/^[1-9][0-9]*$/u.test(current.generation ?? '') || current.observedGeneration !== current.generation
      || typeof current.etag !== 'string' || current.etag.length < 8 || /[\r\n\p{Cc}]/u.test(current.etag)
      || current.invokerIamDisabled !== false || !isDeepStrictEqual(current.template, prepared.candidateTemplate)
      || current.image !== prepared.privateCandidate.expectedReadback?.image
      || current.template.labels?.['projed-release'] !== prepared.privateCandidate.expectedReadback?.releaseId
      || current.template.labels?.['projed-source'] !== prepared.privateCandidate.expectedReadback?.sourceRevision) invalid('live-candidate');

  const weighted = current.traffic.filter(target => target.percent !== undefined);
  const candidates = current.traffic.filter(target => target.tag === CANDIDATE_TAG);
  if (weighted.length !== 1 || weighted[0].percent !== 100 || weighted[0].revision === current.latestReadyRevision
      || candidates.length !== 1 || candidates[0].revision !== current.latestReadyRevision
      || candidates[0].percent !== undefined) invalid('live-traffic');

  const environment = Object.fromEntries(current.template.containers[0].env.map(row => [row.name, row.value]));
  if (environment.PROJED_PUBLIC_APP_URL !== CLOUD_RUN_TARGET.publicOrigin
      || environment.PROJED_MAIN_PUBLIC_ORIGIN !== CLOUD_RUN_TARGET.publicOrigin
      || environment.PROJED_QUICK_PUBLIC_ORIGIN !== LEGACY_ENTRY_TARGET.upstream
      || !isDeepStrictEqual(parseJson(environment.PROJED_MAIN_ADDITIONAL_PUBLIC_ORIGINS ?? 'null'),
        [LEGACY_ENTRY_ORIGINS.main])
      || !isDeepStrictEqual(parseJson(environment.PROJED_QUICK_ADDITIONAL_PUBLIC_ORIGINS ?? 'null'),
        [LEGACY_ENTRY_ORIGINS.quick])
      || !isDeepStrictEqual(parseJson(environment.PROJED_ORIGIN_SWITCH_CAMPAIGN ?? 'null'),
        input.preparedPlan.campaign)
      || Object.keys(environment).some(name => MODEL_ENV.test(name))) invalid('live-environment');

  const activationBody = { etag: current.etag, invokerIamDisabled: true,
    traffic: [providerTraffic({ revision: current.latestReadyRevision, percent: 100, tag: CANDIDATE_TAG })] };
  const rollbackBody = { ...structuredClone(prepared.rollback), etag: '<fresh-etag>' };
  return {
    renderOnly: true,
    action: 'activate-verified-origin-candidate',
    target: { name: SERVICE_NAME, uid: current.uid, generation: current.generation, etag: current.etag },
    candidate: { revision: current.latestReadyRevision, image: current.image,
      releaseId: current.template.labels['projed-release'], sourceRevision: current.template.labels['projed-source'] },
    prerequisites: structuredClone(prepared.publicActivation.prerequisites),
    preflight: { requiredBeforeApply: true, successCriteria: structuredClone(VALIDATE_ONLY_SUCCESS), request: { method: 'PATCH',
      url: `${SERVICE_VALIDATE_URL}&updateMask=invokerIamDisabled,traffic`, body: structuredClone(activationBody) } },
    activation: { requiresHumanAuthorization: true, request: { method: 'PATCH',
      url: `${SERVICE_URL}&updateMask=invokerIamDisabled,traffic`, body: structuredClone(activationBody) } },
    postActivationVerification: structuredClone(prepared.publicActivation.postActivationVerification),
    rollback: { requiresFreshReadbackAndEtag: true, requestTemplate: { method: 'PATCH',
      url: `${SERVICE_URL}&updateMask=invokerIamDisabled,traffic,template`, body: rollbackBody } },
    exclusions: structuredClone(input.preparedPlan.exclusions),
  };
}
