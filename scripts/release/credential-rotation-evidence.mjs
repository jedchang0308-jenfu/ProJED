export function classifyOldCredentialEvidence({
  credentialProvided,
  active,
  manualRotationConfirmed,
  envName,
  probeError,
} = {}) {
  if (!credentialProvided) {
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
