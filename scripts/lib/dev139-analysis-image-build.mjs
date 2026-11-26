import { CLOUD_RUN_TARGET } from './dev139-cloud-run-plan.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_REVISION = /^[a-f0-9]{40}$/;
const RELEASE_ID = /^[a-z][a-z0-9-]{0,40}$/;
const INPUT_KEYS = ['predecessorRuntimeImage', 'releaseId', 'sourceArchiveSha256', 'sourceGeneration', 'sourceRevision'];
const DOCKER_BUILDER = 'gcr.io/cloud-builders/docker@sha256:2d89b48c704ddcc4a199dd1cc70c21813fb675227600f19cb77e5bbf368012bc';
const SOURCE_BUCKET = 'jenfu-platform-prod_asia-east1_cloudbuild';
const BUILDER_ACCOUNT = `projects/${CLOUD_RUN_TARGET.project}/serviceAccounts/projed-prod-builder@${CLOUD_RUN_TARGET.project}.iam.gserviceaccount.com`;

function invalid() {
  throw Object.assign(new Error('Analysis image build input is outside the ProJED contract'), {
    code: 'ANALYSIS_IMAGE_BUILD_INVALID',
  });
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) invalid();
}

function immutableRuntimeImage(image) {
  const prefix = `${CLOUD_RUN_TARGET.repository}/projed-prod@sha256:`;
  if (typeof image !== 'string' || !image.startsWith(prefix) || !SHA256.test(image.slice(prefix.length))) invalid();
}

function stagePredecessorScript(predecessorRuntimeImage) {
  return `set -euo pipefail
base=${predecessorRuntimeImage}
docker pull "$base"
container=$(docker create "$base")
trap 'docker rm "$container" >/dev/null' EXIT
mkdir -p output/verified-predecessor
docker cp "$container:/app/dist" output/verified-predecessor/dist
docker cp "$container:/app/http-artifact-manifest.json" output/verified-predecessor/manifest.json
docker run --rm --network=none --user=0 --volume=/workspace:/workspace --workdir=/workspace --entrypoint=node "$base" scripts/stage-dev139-predecessor.mjs --manifest=output/verified-predecessor/manifest.json --dist=output/verified-predecessor/dist --output=dev139-predecessor`;
}

function inspectImageScript(image, sourceRevision) {
  return `set -euo pipefail
image=${image}
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" = "${sourceRevision}"
test "$(docker image inspect --format '{{.Config.User}}' "$image")" = "node"
test "$(docker image inspect --format '{{json .Config.Cmd}}' "$image")" = '["node","dist-server/server/meetingAsrJob.js"]'
docker run --rm --network=none --read-only --tmpfs /tmp --entrypoint=ffmpeg "$image" -version >/dev/null`;
}

function proofProgram() {
  return `import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {CURRENT_RAG_BINDING} from './dist-server/server/ragRuntimeBinding.js';
import {CURRENT_MEETING_LLM_BINDING} from './dist-server/server/meetingLlmRuntimeBinding.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(process.getuid(),1000);
assert.equal(CURRENT_RAG_BINDING,null);
assert.equal(CURRENT_MEETING_LLM_BINDING,null);
const profileBytes=readFileSync('config/dev-139/s3-managed.profile.json');
const profile=JSON.parse(profileBytes);
assert.equal(profile.profileVersion,1);
assert.equal(profile.appKey,'projed');
assert.equal(profile.environment,'managed');
assert.equal(profile.migrations.length,53);
assert.equal(profile.migrations.at(-1).version,'0053_origin_switch_intents_v1');
const migrationSha256=Object.fromEntries(profile.migrations.map(({path})=>[path,hash(readFileSync(path))]));
const manifest=JSON.parse(readFileSync('http-artifact-manifest.json'));
assert.equal(manifest.sourceRevision,process.argv[1]);
assert.equal(manifest.releaseId,process.argv[2]);
const binding={databaseName:'jenfu_prod',databasePort:5432,runtimeRole:'projed_runtime_disposable',
connectionMode:'cloud-sql-iam',cloudSqlInstance:'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
iamLogins:profile.database.iamLogins,profileSha256:hash(profileBytes),migrationSha256,
staticFixtureSha256:hash(readFileSync('dist/dev139-cloud-run-meta.json'))};
console.log('PROJED_ANALYSIS_IMAGE_PROOF='+JSON.stringify({status:'PASS',sourceRevision:manifest.sourceRevision,
releaseId:manifest.releaseId,binding,modelsEnabled:false}));`;
}

/** Render one regional Cloud Build request for the ASR image only. */
export function renderAnalysisImageBuild(input) {
  exactKeys(input, INPUT_KEYS);
  const { predecessorRuntimeImage, releaseId, sourceArchiveSha256, sourceGeneration, sourceRevision } = input;
  immutableRuntimeImage(predecessorRuntimeImage);
  if (!RELEASE_ID.test(releaseId ?? '') || !SOURCE_REVISION.test(sourceRevision ?? '')
      || !SHA256.test(sourceArchiveSha256 ?? '') || !/^[1-9][0-9]*$/.test(sourceGeneration ?? '')) invalid();

  const image = `${CLOUD_RUN_TARGET.repository}/projed-prod-asr-job:${releaseId}`;
  const sourceObject = `dev139/${releaseId}/source-${sourceArchiveSha256}.tar.gz`;
  const commonBuildArgs = [
    '--platform=linux/amd64',
    '--build-arg', `PROJED_RELEASE_ID=${releaseId}`,
    '--build-arg', 'PROJED_HTTP_BUILD_MODE=legacy-entry',
    '--build-arg', 'PROJED_PREVIOUS_RELEASE_MANIFEST=/app/dev139-predecessor/manifest.json',
    '--build-arg', `PROJED_SOURCE_REVISION=${sourceRevision}`,
    '--label', `org.opencontainers.image.revision=${sourceRevision}`,
    '--label', 'projed.task=dev-139',
  ];
  const build = {
    source: { storageSource: { bucket: SOURCE_BUCKET, object: sourceObject, generation: sourceGeneration } },
    serviceAccount: BUILDER_ACCOUNT,
    options: { env: ['DOCKER_BUILDKIT=1'], logging: 'CLOUD_LOGGING_ONLY', sourceProvenanceHash: ['SHA256'] },
    queueTtl: '600s', timeout: '1200s',
    steps: [
      { id: 'stage-existing-pwa', name: DOCKER_BUILDER, entrypoint: 'bash',
        args: ['-c', stagePredecessorScript(predecessorRuntimeImage)] },
      { id: 'build-analysis-image', name: DOCKER_BUILDER,
        args: ['build', ...commonBuildArgs, '--target', 'asr-job', '-f', 'Dockerfile.dev139', '-t', image, '.'] },
      { id: 'verify-analysis-image-metadata', name: DOCKER_BUILDER, entrypoint: 'bash',
        args: ['-c', inspectImageScript(image, sourceRevision)] },
      { id: 'verify-analysis-image-contract', name: DOCKER_BUILDER,
        args: ['run', '--rm', '--network=none', '--read-only', '--tmpfs', '/tmp', '--entrypoint=node', image,
          '--input-type=module', '-e', proofProgram(), sourceRevision, releaseId] },
    ],
    images: [image], tags: ['dev-139', releaseId],
  };
  const parent = `projects/${CLOUD_RUN_TARGET.project}/locations/${CLOUD_RUN_TARGET.region}`;
  return {
    renderOnly: true,
    target: { parent, image, builderServiceAccount: BUILDER_ACCOUNT },
    sourceBinding: { bucket: SOURCE_BUCKET, object: sourceObject, generation: sourceGeneration, sha256: sourceArchiveSha256 },
    preconditions: { imageTagMustBeAbsent: true, sourceObjectGenerationMustMatch: true, predecessorMustExist: true },
    request: { method: 'POST', url: `https://cloudbuild.googleapis.com/v1/${parent}/builds`, body: build },
    expectedReadback: { status: 'SUCCESS', sourceRevision, releaseId, proofPrefix: 'PROJED_ANALYSIS_IMAGE_PROOF=',
      immutableImageDigestRequired: true, deployOrRunJob: false },
  };
}
