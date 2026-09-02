import fs from 'node:fs';
import path from 'node:path';

export const RELEASE_CAPSULE_STATES = Object.freeze([
  'CI_VERIFIED',
  'ARTIFACT_READY',
  'CANDIDATE_DEPLOYED',
  'CANDIDATE_READY',
  'LIVE_VERIFIED',
]);

const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

export const releaseCapsulePath = manifest => path.join(manifest.artifact.releaseDir, 'release-capsule.json');

export function createReleaseCapsule(manifest) {
  const capsule = {
    schemaVersion: 1,
    taskId: manifest.taskId,
    releaseId: manifest.releaseId,
    state: 'CI_VERIFIED',
    source: manifest.source,
    target: manifest.target,
    artifact: {
      manifestPath: path.join(manifest.artifact.releaseDir, 'manifest.json'),
      treeSha256: manifest.artifact.treeSha256,
    },
    inputFingerprints: {
      productionContractSha256: manifest.contractSha256,
      publicEnvironmentSha256: manifest.environment.publicEnvSha256,
    },
    gates: manifest.gates,
    evidence: {},
    promotion: { candidate: null, live: null },
    updatedAt: new Date().toISOString(),
  };
  writeJson(releaseCapsulePath(manifest), capsule);
  return capsule;
}

export function updateReleaseCapsule(manifest, { state, evidence, promotion } = {}) {
  const capsulePath = releaseCapsulePath(manifest);
  if (!fs.existsSync(capsulePath)) throw new Error('RELEASE P1: release capsule is missing.');
  const current = JSON.parse(fs.readFileSync(capsulePath, 'utf8'));
  if (current.taskId !== manifest.taskId || current.releaseId !== manifest.releaseId || current.artifact?.treeSha256 !== manifest.artifact.treeSha256) {
    throw new Error('RELEASE P1: release capsule identity does not match the immutable artifact.');
  }
  if (state && !RELEASE_CAPSULE_STATES.includes(state)) throw new Error(`RELEASE P1: unsupported capsule state ${state}.`);
  const next = {
    ...current,
    ...(state ? { state } : {}),
    evidence: { ...current.evidence, ...evidence },
    promotion: { ...current.promotion, ...promotion },
    updatedAt: new Date().toISOString(),
  };
  writeJson(capsulePath, next);
  return next;
}
