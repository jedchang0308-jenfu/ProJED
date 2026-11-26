import { isDeepStrictEqual } from 'node:util';

import { CLOUD_RUN_TARGET } from './dev139-cloud-run-plan.mjs';
import { LEGACY_ENTRY_ORIGINS, LEGACY_ENTRY_TARGET } from './dev139-legacy-entry-plan.mjs';
import { MANAGED_SSO_BROKER_ORIGIN } from '../../shared/dev139DeploymentTarget.mjs';

const SERVICE_NAME = `projects/${CLOUD_RUN_TARGET.project}/locations/${CLOUD_RUN_TARGET.region}/services/${CLOUD_RUN_TARGET.service}`;
const SERVICE_URL = `https://run.googleapis.com/v2/${SERVICE_NAME}?allowMissing=false&validateOnly=false`;
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

function invalid() {
  throw Object.assign(new Error('Origin cutover input is outside the reviewed DEV-139 contract'), {
    code: 'ORIGIN_CUTOVER_PLAN_INVALID',
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

function assertBaseline(input) {
  exactKeys(input, ['baseline', 'campaign']);
  if (!CAMPAIGN.test(input.campaign ?? '')) invalid();
  const baseline = input.baseline;
  exactKeys(baseline, ['etag', 'generation', 'image', 'invokerIamDisabled', 'latestReadyRevision', 'name',
    'observedGeneration', 'ready', 'template', 'traffic', 'uid']);
  if (baseline.name !== SERVICE_NAME || !UUID.test(baseline.uid ?? '')
      || !/^[1-9][0-9]*$/u.test(baseline.generation ?? '')
      || baseline.observedGeneration !== baseline.generation || baseline.ready !== true
      || typeof baseline.etag !== 'string' || baseline.etag.length < 8 || /[\r\n\p{Cc}]/u.test(baseline.etag)
      || baseline.invokerIamDisabled !== false || !REVISION.test(baseline.latestReadyRevision ?? '')
      || !IMAGE.test(baseline.image ?? '') || !Array.isArray(baseline.traffic)) invalid();

  const weighted = baseline.traffic.filter(target => target?.percent !== undefined);
  if (weighted.length !== 1 || weighted[0].percent !== 100
      || weighted[0].revision !== baseline.latestReadyRevision
      || baseline.traffic.some(target => !target || typeof target !== 'object' || Array.isArray(target)
        || !REVISION.test(target.revision ?? '') || (target.percent !== undefined && target.percent !== 100)
        || (target.tag !== undefined && !/^[a-z][a-z0-9-]{0,62}$/u.test(target.tag)))
      || baseline.traffic.some(target => target.tag === CANDIDATE_TAG)) invalid();

  const template = baseline.template;
  exactKeys(template, ['containers', 'executionEnvironment', 'maxInstanceRequestConcurrency', 'scaling',
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
  if (app?.name !== 'projed' || app.image !== baseline.image
      || app.resources?.limits?.cpu !== '1' || app.resources?.limits?.memory !== '512Mi'
      || proxy?.name !== 'cloud-sql-proxy' || proxy.image !== CLOUD_RUN_TARGET.proxyImage
      || proxy.resources?.limits?.cpu !== '1' || proxy.resources?.limits?.memory !== '256Mi'
      || !Array.isArray(proxy.args) || proxy.args.at(-1) !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg') invalid();
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

/** Pure, provider-bound preparation. It cannot publish a URL or move traffic. */
export function renderOriginCutoverPlan(input) {
  const { baseline, environment } = assertBaseline(input);
  const desiredTemplate = structuredClone(baseline.template);
  const desiredEnvironment = {
    ...environment,
    PROJED_PUBLIC_APP_URL: CLOUD_RUN_TARGET.publicOrigin,
    PROJED_MAIN_PUBLIC_ORIGIN: CLOUD_RUN_TARGET.publicOrigin,
    PROJED_QUICK_PUBLIC_ORIGIN: LEGACY_ENTRY_TARGET.upstream,
    PROJED_MAIN_ADDITIONAL_PUBLIC_ORIGINS: JSON.stringify([LEGACY_ENTRY_ORIGINS.main]),
    PROJED_QUICK_ADDITIONAL_PUBLIC_ORIGINS: JSON.stringify([LEGACY_ENTRY_ORIGINS.quick]),
    PROJED_ORIGIN_SWITCH_CAMPAIGN: JSON.stringify(switchConfiguration(input.campaign)),
  };
  desiredTemplate.containers[0].env = Object.entries(desiredEnvironment).map(([name, value]) => ({ name, value }));

  const candidateBody = { name: SERVICE_NAME, etag: baseline.etag, template: desiredTemplate };
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
          image: baseline.image, invokerIamDisabled: false, traffic: structuredClone(baseline.traffic),
        },
        verificationRoute: {
          requiresFreshReadbackAndEtag: true, movesTraffic: false, publishesNewOrigin: false,
          requestTemplate: {
            method: 'PATCH', url: `${SERVICE_URL}&updateMask=traffic`,
            body: { etag: '<fresh-etag>', traffic: [...structuredClone(baseline.traffic),
              { revision: '<verified-candidate-revision>', tag: CANDIDATE_TAG }] },
          },
        },
      },
      publicActivation: {
        authorizedByThisPlan: false, requiresHumanAuthorization: true,
        prerequisites: ['fresh-etag', 'candidate-ready', 'old-url-smoke', 'new-url-login-smoke', 'pwa-handoff-smoke'],
        requestTemplate: {
          method: 'PATCH', url: `${SERVICE_URL}&updateMask=invokerIamDisabled,traffic`,
          body: { etag: '<fresh-etag>', invokerIamDisabled: true,
            traffic: [{ revision: '<verified-candidate-revision>', percent: 100, tag: CANDIDATE_TAG }] },
        },
      },
    },
    rollback: {
      requiresFreshReadbackAndEtag: true,
      bodyWithoutEtag: { name: SERVICE_NAME, invokerIamDisabled: false,
        traffic: structuredClone(baseline.traffic), template: structuredClone(baseline.template) },
    },
    exclusions: ['iam-grant', 'secret-change', 'billing-change', 'capacity-change', 'model-enable', 'data-write'],
  };
}
