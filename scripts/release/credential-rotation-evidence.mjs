import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const policyPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'credential-rotation-policy.json');

const assertPolicyShape = (policy, projectRef) => {
  if (!policy || policy.schemaVersion !== 1 || !policy.policyId || !policy.projectRef || !Array.isArray(policy.retiredCredentials)) {
    throw new Error('credential rotation policy is missing required fields');
  }
  if (projectRef && policy.projectRef !== projectRef) {
    throw new Error(`credential rotation policy project ref mismatch: expected ${projectRef}`);
  }
  if (policy.decision !== 'permanent-unrecoverable' || policy.missingCredentialDisposition !== 'pass-with-policy-waiver') {
    throw new Error('credential rotation policy does not declare the permanent unrecoverable waiver');
  }
  return policy;
};

export function loadCredentialRotationPolicy({ projectRef } = {}) {
  if (!fs.existsSync(policyPath)) return null;
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  return assertPolicyShape(policy, projectRef);
}

export function resolveCredentialRotationPolicyDecision({ projectRef } = {}) {
  const policy = loadCredentialRotationPolicy({ projectRef });
  return policy
    ? { policy_id: policy.policyId, decision: policy.decision }
    : null;
}

export function resolvePermanentCredentialWaiver({ policy, envName } = {}) {
  const entry = policy?.retiredCredentials?.find(item => item.envName === envName && item.allowMissing === true);
  if (!entry) return null;
  return {
    policy_id: policy.policyId,
    identity: entry.identity,
    disposition: entry.disposition,
    evidence_mode: 'permanently-unrecoverable',
    reason: `retired credential is permanently classified as unrecoverable by policy ${policy.policyId}`,
  };
}

export function classifyOldCredentialEvidence({
  credentialProvided,
  active,
  manualRotationConfirmed,
  envName,
  probeError,
  permanentWaiver,
} = {}) {
  if (!credentialProvided) {
    if (permanentWaiver) {
      return {
        status: 'pass',
        ...permanentWaiver,
      };
    }
    return {
      status: 'pending',
      evidence_mode: manualRotationConfirmed ? 'human-attested' : 'not-provided',
      reason: manualRotationConfirmed
        ? 'manual rotation confirmation supplied; inactive credential was not probed'
        : `${envName} not provided`,
    };
  }

  if (probeError) {
    return {
      status: 'pending',
      evidence_mode: 'probe-error',
      reason: probeError,
    };
  }

  return {
    status: active ? 'fail' : 'pass',
    evidence_mode: active ? 'probed-active' : 'probed-inactive',
  };
}

export function summarizeCredentialRotationEvidence(results = []) {
  return results
    .filter(result => result.name?.startsWith('old-'))
    .map(result => ({
      name: result.name,
      status: result.status,
      evidence_mode: result.evidence_mode ?? 'unknown',
    }));
}
