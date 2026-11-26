import { isDeepStrictEqual } from 'node:util';

import { MANAGED_DATABASE, assertManagedIamLogins } from '../../shared/dev139ManagedDatabase.mjs';
import { MANAGED_MEETING_AUDIO_BUCKET } from '../../shared/dev139MeetingAudio.mjs';
import { CLOUD_RUN_TARGET, renderProjedCloudRun } from './dev139-cloud-run-plan.mjs';
import { S3_MIGRATION_PATHS } from './dev139-migration-paths.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_REVISION = /^[a-f0-9]{40}$/;
const RELEASE_ID = /^[a-z][a-z0-9-]{0,40}$/;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const INPUT_KEYS = ['analysisImage', 'baseline', 'binding', 'releaseId', 'sourceRevision'];
const BINDING_KEYS = ['cloudSqlInstance', 'connectionMode', 'databaseName', 'databasePort', 'iamLogins',
  'migrationSha256', 'profileSha256', 'runtimeRole', 'staticFixtureSha256'];
const JOB_NAME = `projects/${CLOUD_RUN_TARGET.project}/locations/${CLOUD_RUN_TARGET.region}/jobs/${CLOUD_RUN_TARGET.analysisJob}`;
const JOB_URL = `https://run.googleapis.com/v2/${JOB_NAME}?allowMissing=false&validateOnly=false`;

function invalid(message = 'Analysis Job update input is outside the ProJED contract') {
  throw Object.assign(new Error(message), { code: 'ANALYSIS_JOB_UPDATE_INVALID' });
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) invalid();
}

function immutableAnalysisImage(image) {
  const prefix = `${CLOUD_RUN_TARGET.repository}/projed-prod-asr-job@sha256:`;
  if (typeof image !== 'string' || !image.startsWith(prefix) || !SHA256.test(image.slice(prefix.length))) invalid();
}

function parseBinding(value) {
  if (typeof value !== 'string' || value.length > 262_144) invalid();
  try { return JSON.parse(value); } catch { invalid(); }
}

function assertBaselineBinding(binding) {
  exactKeys(binding, BINDING_KEYS);
  try { assertManagedIamLogins(binding.iamLogins); } catch { invalid(); }
  if (binding.databaseName !== MANAGED_DATABASE.databaseName
      || binding.databasePort !== MANAGED_DATABASE.databasePort
      || binding.runtimeRole !== MANAGED_DATABASE.roles.runtime
      || binding.connectionMode !== MANAGED_DATABASE.host
      || binding.cloudSqlInstance !== MANAGED_DATABASE.cloudSqlInstance
      || !SHA256.test(binding.profileSha256 ?? '')
      || !SHA256.test(binding.staticFixtureSha256 ?? '')
      || !binding.migrationSha256 || typeof binding.migrationSha256 !== 'object'
      || Array.isArray(binding.migrationSha256)) invalid();
  const paths = Object.keys(binding.migrationSha256);
  if (paths.length === 0 || paths.length > S3_MIGRATION_PATHS.length
      || paths.some((path, index) => path !== S3_MIGRATION_PATHS[index])
      || Object.values(binding.migrationSha256).some(digest => !SHA256.test(digest ?? ''))) invalid();
  return paths.length;
}

function envMap(container) {
  if (!container || !Array.isArray(container.env)) invalid();
  const result = {};
  for (const item of container.env) {
    exactKeys(item, ['name', 'value']);
    if (typeof item.name !== 'string' || typeof item.value !== 'string' || Object.hasOwn(result, item.name)) invalid();
    result[item.name] = item.value;
  }
  return result;
}

function renderDesired({ analysisImage, binding, releaseId, sourceRevision }) {
  const placeholderDigest = '0'.repeat(64);
  try {
    return renderProjedCloudRun({
      deploymentScope: 'candidate', releaseId, sourceRevision, binding,
      runtimeImage: `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:${placeholderDigest}`,
      jobsImage: `${CLOUD_RUN_TARGET.repository}/projed-prod-jobs@sha256:${placeholderDigest}`,
      analysisImage, audioBucket: MANAGED_MEETING_AUDIO_BUCKET,
    }).jobs.analysis;
  } catch { invalid(); }
}

function validateBaseline(baseline, desired) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)
      || baseline.name !== JOB_NAME || !UUID_V4.test(baseline.uid ?? '')
      || !/^[1-9][0-9]*$/.test(baseline.generation ?? '')
      || baseline.observedGeneration !== baseline.generation
      || baseline.reconciling === true
      || baseline.terminalCondition?.type !== 'Ready'
      || baseline.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
      || (baseline.launchStage !== undefined && baseline.launchStage !== 'GA')
      || (baseline.annotations !== undefined
        && (!baseline.annotations || typeof baseline.annotations !== 'object'
          || Array.isArray(baseline.annotations) || Object.keys(baseline.annotations).length !== 0))
      || baseline.binaryAuthorization !== undefined
      || baseline.startExecutionToken !== undefined
      || baseline.runExecutionToken !== undefined
      || typeof baseline.etag !== 'string' || baseline.etag.length < 8 || baseline.etag.length > 2048
      || /[\r\n\p{Cc}]/u.test(baseline.etag)) invalid();

  exactKeys(baseline.labels, ['projed-release', 'projed-source', 'projed-task']);
  if (baseline.labels['projed-task'] !== 'dev-139'
      || !RELEASE_ID.test(baseline.labels['projed-release'] ?? '')
      || !SOURCE_REVISION.test(baseline.labels['projed-source'] ?? '')) invalid();

  if (!baseline.template || typeof baseline.template !== 'object' || Array.isArray(baseline.template)) invalid();
  const { client, clientVersion, ...baselineTemplate } = baseline.template;
  if ((client !== undefined && typeof client !== 'string')
      || (clientVersion !== undefined && typeof clientVersion !== 'string')) invalid();
  const containers = baselineTemplate.template?.containers;
  if (!Array.isArray(containers) || containers.length !== 1 || containers[0]?.name !== 'projed-analysis') invalid();
  const baselineContainer = containers[0];
  immutableAnalysisImage(baselineContainer.image);
  const environment = envMap(baselineContainer);
  const baselineBinding = parseBinding(environment.PROJED_RUNTIME_BINDING_JSON);
  const migrationCount = assertBaselineBinding(baselineBinding);

  const expectedTemplate = structuredClone(desired.template);
  expectedTemplate.template.containers[0].image = baselineContainer.image;
  const bindingVariable = expectedTemplate.template.containers[0].env.find(({ name }) => name === 'PROJED_RUNTIME_BINDING_JSON');
  if (!bindingVariable) invalid();
  bindingVariable.value = JSON.stringify(baselineBinding);
  if (!isDeepStrictEqual(baselineTemplate, expectedTemplate)) invalid();
  return { baselineTemplate, baselineBinding, migrationCount, image: baselineContainer.image };
}

/**
 * Render a conditional Cloud Run v2 Job PATCH without making provider calls.
 * Cloud Run Jobs PATCH accepts a complete Job resource and an optional etag;
 * allowMissing=false prevents a stale plan from creating a replacement Job.
 */
export function renderAnalysisJobUpdate(input) {
  exactKeys(input, INPUT_KEYS);
  const { analysisImage, baseline, binding, releaseId, sourceRevision } = input;
  if (!RELEASE_ID.test(releaseId ?? '') || !SOURCE_REVISION.test(sourceRevision ?? '')) invalid();
  immutableAnalysisImage(analysisImage);
  const desired = renderDesired({ analysisImage, binding, releaseId, sourceRevision });
  const validated = validateBaseline(baseline, desired);

  const body = { name: JOB_NAME, labels: desired.labels, template: desired.template, etag: baseline.etag };
  return {
    renderOnly: true,
    action: 'update-existing-analysis-job',
    target: { name: JOB_NAME, uid: baseline.uid, generation: baseline.generation, etag: baseline.etag },
    baseline: {
      releaseId: baseline.labels['projed-release'], sourceRevision: baseline.labels['projed-source'],
      image: validated.image, migrationCount: validated.migrationCount,
    },
    candidate: { releaseId, sourceRevision, image: analysisImage, migrationCount: S3_MIGRATION_PATHS.length },
    request: { method: 'PATCH', url: JOB_URL, body },
    expectedReadback: {
      name: JOB_NAME, uid: baseline.uid, generationGreaterThan: baseline.generation,
      etagMustDifferFrom: baseline.etag, labels: desired.labels, template: desired.template,
      executeJob: false,
    },
    rollback: {
      requiresFreshReadbackAndEtag: true,
      bodyWithoutEtag: { name: JOB_NAME, labels: structuredClone(baseline.labels), template: validated.baselineTemplate },
    },
  };
}

