import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildProductionArtifact } from './build-production-artifact.mjs';
import { verifyManifest } from './verify-production-artifact.mjs';
import { verifyRemoteOAuthCancel } from './verify-oauth-cancel-callback.mjs';
import {
  PRODUCTION_CONTRACT,
  canonicalJson,
  releaseTaskSlug,
  resolveReleaseTaskId,
  sha256,
} from './production-contract.mjs';
import {
  buildSanitizedChildEnv,
  loadServerVerificationEnv,
  resolveProductionPublicEnv,
} from './env-boundary.mjs';
import { summarizeCredentialRotationEvidence } from './credential-rotation-evidence.mjs';
import { updateReleaseCapsule } from './release-capsule.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const firebaseCommand = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
const redact = value => String(value ?? '').replace(/(?:sb_secret_|sbp_)[A-Za-z0-9_-]+/gi, '[redacted]').replace(/eyJ[A-Za-z0-9_-]{20,}/g, '[redacted-token]');

const parseArgs = argv => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replaceAll('-', '_');
    args[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const shell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);
  const child = spawn(command, args, { ...options, shell, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
});

const verificationEnv = (parentEnv, serverEnvPath) => loadServerVerificationEnv({ root, parentEnv, envPath: serverEnvPath });

const runServerReadinessGate = async ({ parentEnv = process.env, serverEnvPath, taskId = PRODUCTION_CONTRACT.taskId } = {}) => {
  const result = await run(process.execPath, [path.join(root, 'scripts', 'p8-preflight.mjs'), '--strict'], {
    cwd: root,
    env: buildSanitizedChildEnv(parentEnv, { extra: verificationEnv(parentEnv, serverEnvPath) }),
  });
  if (result.code !== 0) throw new Error(`${taskId} production-bound server readiness gate failed.`);
  return { ok: true, gate: 'p8-preflight', strict: true };
};

const runProductionBoundReadiness = async ({ parentEnv = process.env, serverEnvPath, productionEnvPath, taskId = PRODUCTION_CONTRACT.taskId } = {}) => {
  const result = await run(process.execPath, [path.join(root, 'scripts', 'release', 'verify-production-bound-readiness.mjs'), '--strict'], {
    cwd: root,
    env: buildSanitizedChildEnv(parentEnv, {
      extra: {
        ...verificationEnv(parentEnv, serverEnvPath),
        ...(productionEnvPath ? { PROJED_PRODUCTION_ENV_PATH: path.resolve(root, productionEnvPath) } : {}),
        ...(serverEnvPath ? { PROJED_SERVER_ENV_PATH: path.resolve(root, serverEnvPath) } : {}),
      },
    }),
  });
  if (result.code !== 0) throw new Error(`${taskId} production-bound read-only readiness failed.`);
  return { ok: true, gate: 'production-bound-readiness', strict: true };
};

const runCredentialRotationGate = async ({ parentEnv = process.env, serverEnvPath, taskId = PRODUCTION_CONTRACT.taskId } = {}) => {
  const result = await run(process.execPath, [path.join(root, 'scripts', 'p8-credential-rotation-check.mjs'), '--strict'], {
    cwd: root,
    env: buildSanitizedChildEnv(parentEnv, { extra: verificationEnv(parentEnv, serverEnvPath) }),
  });
  let parsed;
  let evidence;
  try {
    parsed = JSON.parse(result.stdout);
    evidence = summarizeCredentialRotationEvidence(parsed.results);
  } catch {
    throw new Error(`${taskId} credential rotation gate did not return valid JSON evidence.`);
  }
  if (result.code !== 0) {
    const unresolved = evidence.filter(item => item.status !== 'pass').map(item => `${item.name}:${item.evidence_mode}`);
    throw new Error(`${taskId} credential rotation gate failed (${unresolved.join(', ')}).`);
  }
  return {
    ok: true,
    gate: 'p8-credential-rotation',
    strict: true,
    policy: parsed.credential_rotation_policy ?? null,
    oldCredentialEvidence: evidence,
  };
};

export const buildReleaseRuntimeEnv = (parentEnv = process.env) => buildSanitizedChildEnv(parentEnv, {
  extra: { PROJED_RELEASE_PROFILE: 'production' },
});

const runBrowserSmokeAtUrl = async ({ baseUrl, releaseId, sessionPrefix, taskId = PRODUCTION_CONTRACT.taskId }) => {
  const url = new URL(baseUrl);
  url.searchParams.set('projedReleaseId', releaseId);
  const smoke = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'run-playwright-code.ps1'), '-SessionPrefix', sessionPrefix, '-Filename', path.join(root, 'scripts', 'verify-release-browser-smoke.pw.js'), '-OutputDirectory', path.join(root, 'output', 'playwright', sessionPrefix), '-BaseUrl', url.toString()], { cwd: root, env: buildReleaseRuntimeEnv(process.env) });
  if (smoke.code !== 0) throw new Error(`${taskId} browser smoke failed: ${redact((smoke.stderr || smoke.stdout).trim().slice(-1200))}`);
  return { ok: true, baseUrl: url.origin, expectedReleaseId: releaseId };
};

const git = async args => {
  const result = await run('git', args, { cwd: root, env: process.env });
  return result.code === 0 ? result.stdout.trim() : '';
};

const assertCleanWorktree = async (taskId = PRODUCTION_CONTRACT.taskId) => {
  const status = await git(['status', '--porcelain']);
  if (status) throw new Error(`${taskId} P1 prepare requires a clean tracked worktree; commit or separately resolve changes before release preparation.`);
};

const assertLevel3 = (args, expectedCommit, taskId = PRODUCTION_CONTRACT.taskId) => {
  if (!args.level3_evidence) throw new Error(`${taskId} P1 requires --level3-evidence <same-commit evidence path>; no remote deploy is attempted without it.`);
  const evidencePath = path.resolve(root, args.level3_evidence);
  if (!fs.existsSync(evidencePath)) throw new Error(`${taskId} P1 Level3 evidence path does not exist.`);
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')); } catch { throw new Error(`${taskId} P1 Level3 evidence must be JSON with source commit identity.`); }
  const commit = evidence.sourceCommit ?? evidence.commit ?? evidence.source?.commit;
  if (!commit) throw new Error(`${taskId} P1 Level3 evidence has no source commit identity.`);
  if (expectedCommit && commit !== expectedCommit) throw new Error(`${taskId} P1 Level3 evidence source commit does not match the immutable artifact.`);
};

const waitForHttp = async (url, timeoutMs = 20000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.status;
    } catch {
      // Runtime is not ready yet; retry until the bounded timeout.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`DEV-083 Layer2 runtime did not become ready at ${url}.`);
};

export const runLayer2Smoke = async (distDir, manifest) => {
  const taskId = resolveReleaseTaskId(manifest.taskId);
  const port = 4174;
  try {
    const existing = await fetch(`http://127.0.0.1:${port}/`);
    if (existing) throw new Error(`${taskId} Layer2 port ${port} is already owned by another runtime; refusing to stop it.`);
  } catch (error) {
    if (String(error.message).includes('already owned')) throw error;
  }
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const childEnv = buildSanitizedChildEnv(process.env, {
    releaseEnvDir: path.join(manifest.artifact.releaseDir, 'env'),
    releaseId: manifest.releaseId,
    extra: { NODE_ENV: 'production' },
  });
  const child = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', distDir], { cwd: root, env: childEnv, stdio: ['ignore', 'ignore', 'ignore'] });
  let result;
  let primaryError;
  try {
    await waitForHttp(`http://127.0.0.1:${port}/`);
    const provenance = await verifyRemoteArtifact({ manifest, baseUrl: `http://127.0.0.1:${port}/` });
    const smoke = await runBrowserSmokeAtUrl({ baseUrl: `http://127.0.0.1:${port}/`, releaseId: manifest.releaseId, sessionPrefix: `${releaseTaskSlug(taskId)}-layer2`, taskId });
    result = { ok: true, baseUrl: `http://127.0.0.1:${port}/`, port, processPid: child.pid, provenance, smoke, cleanup: 'task-owned process tree terminated and port probe failed' };
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  try {
    if (!child.killed) {
      if (process.platform === 'win32') await run('taskkill', ['/PID', String(child.pid), '/T', '/F'], { cwd: root, env: process.env });
      else child.kill('SIGTERM');
    }
    const remaining = await fetch(`http://127.0.0.1:${port}/`);
    if (remaining.ok) cleanupError = new Error(`${taskId} Layer2 cleanup failed: port ${port} is still responding.`);
  } catch {
    // Expected state after cleanup is a connection failure.
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
};

const readManifestPath = (value, taskId = PRODUCTION_CONTRACT.taskId) => {
  if (!value) throw new Error(`${taskId} P1 requires --manifest <path>.`);
  const manifestPath = path.resolve(root, value);
  if (!fs.existsSync(manifestPath)) throw new Error(`${taskId} manifest path does not exist.`);
  return manifestPath;
};

const deployExactArtifact = async ({ manifest, phase }) => {
  const configPath = path.resolve(manifest.artifact.firebaseConfig);
  const configDir = path.dirname(configPath);
  const config = path.basename(configPath);
  const args = phase === 'candidate'
    ? ['hosting:channel:deploy', PRODUCTION_CONTRACT.candidateChannel, '--project', PRODUCTION_CONTRACT.projectId, '--expires', PRODUCTION_CONTRACT.candidateExpires, '--config', config, '--json']
    : ['deploy', '--only', 'hosting', '--project', PRODUCTION_CONTRACT.projectId, '--config', config, '--json'];
  const result = await run(firebaseCommand, args, { cwd: configDir, env: process.env });
  if (result.code !== 0) throw new Error(`DEV-083 ${phase} Firebase deployment failed; live activation state was not assumed.`);
  const url = result.stdout.match(/https:\/\/[A-Za-z0-9.-]+\.web\.app/)?.[0] ?? null;
  return { ok: true, phase, previewUrl: url };
};

const findLiveChannel = value => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findLiveChannel(item);
      if (match) return match;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const name = typeof value.name === 'string' ? value.name : '';
  const channelId = typeof value.channelId === 'string' ? value.channelId : '';
  if (channelId === 'live' || /\/channels\/live$/.test(name)) return value;
  for (const child of Object.values(value)) {
    const match = findLiveChannel(child);
    if (match) return match;
  }
  return null;
};

export const summarizeLiveChannel = stdout => {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error('DEV-083 Firebase channel list was not valid JSON; previous live release cannot be recorded safely.'); }
  const channel = findLiveChannel(parsed);
  if (!channel) throw new Error('DEV-083 Firebase channel list did not contain the live channel; refusing to continue.');
  const release = channel.release && typeof channel.release === 'object' ? channel.release : null;
  const releaseName = typeof release?.name === 'string' ? release.name : '';
  const versionName = typeof release?.version === 'string'
    ? release.version
    : typeof release?.version?.name === 'string' ? release.version.name : '';
  if (!releaseName || !versionName) throw new Error('DEV-083 live channel has no current release/version; refusing to continue.');
  return {
    source: 'firebase-hosting-channel-list',
    channel: 'live',
    channelName: typeof channel.name === 'string' ? channel.name : 'live',
    channelUrl: typeof channel.url === 'string' ? channel.url : null,
    releaseName,
    versionName,
  };
};

const readLiveReleaseSnapshot = async () => {
  const result = await run(firebaseCommand, ['hosting:channel:list', '--project', PRODUCTION_CONTRACT.projectId, '--site', PRODUCTION_CONTRACT.siteId, '--json'], { cwd: root, env: process.env });
  if (result.code !== 0) throw new Error('DEV-083 could not read the current live Firebase channel; refusing to continue.');
  return summarizeLiveChannel(result.stdout);
};

export const assertCandidateEvidence = (manifest, evidencePath) => {
  const taskId = resolveReleaseTaskId(manifest.taskId);
  if (!fs.existsSync(evidencePath)) throw new Error(`${taskId} P1 activation requires candidate-evidence.json from the inactive preview channel.`);
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')); } catch { throw new Error(`${taskId} candidate evidence is not valid JSON.`); }
  if (evidence.taskId !== taskId || evidence.phase !== 'candidate' || evidence.releaseId !== manifest.releaseId) throw new Error(`${taskId} candidate evidence release identity does not match the immutable manifest.`);
  const expectedManifestPath = path.join(manifest.artifact.releaseDir, 'manifest.json');
  if (!evidence.manifestPath || path.resolve(evidence.manifestPath) !== path.resolve(expectedManifestPath)) throw new Error(`${taskId} candidate evidence manifest path does not match the immutable artifact.`);
  if (evidence.provenance?.ok !== true || evidence.provenance?.releaseId !== manifest.releaseId) throw new Error(`${taskId} candidate provenance evidence is incomplete or mismatched.`);
  if (evidence.oauth?.ok !== true) throw new Error(`${taskId} candidate OAuth safe-cancel evidence is incomplete.`);
  return { ok: true, releaseId: evidence.releaseId, previewUrl: evidence.provenance.baseUrl };
};

export const assertFeatureEvidence = (manifest, candidateEvidence, evidencePath) => {
  if (!evidencePath || !fs.existsSync(evidencePath)) throw new Error(`${manifest.taskId} P1 requires production-bound feature evidence before activation.`);
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')); } catch { throw new Error(`${manifest.taskId} feature evidence is not valid JSON.`); }
  const errors = [];
  if (evidence.taskId !== manifest.taskId) errors.push('task id mismatch');
  if (evidence.releaseId !== manifest.releaseId) errors.push('release id mismatch');
  if (evidence.artifactTreeSha256 !== manifest.artifact.treeSha256) errors.push('artifact digest mismatch');
  if (evidence.environment !== 'production-bound-candidate') errors.push('environment must be production-bound-candidate');
  if (evidence.baseUrl !== candidateEvidence.previewUrl) errors.push('candidate URL mismatch');
  if (evidence.status !== 'PASS') errors.push('feature smoke status is not PASS');
  if (evidence.fixture?.isolated !== true || evidence.cleanup?.residualRows !== 0 || evidence.cleanup?.status !== 'PASS') errors.push('isolated fixture cleanup is incomplete');
  if (!Array.isArray(evidence.scenarios) || evidence.scenarios.length === 0 || evidence.scenarios.some(item => item.status !== 'PASS')) errors.push('feature scenario evidence is incomplete');
  if (errors.length > 0) throw new Error(`${manifest.taskId} feature evidence failed: ${errors.join('; ')}.`);
  return { ok: true, evidencePath: path.resolve(evidencePath), scenarios: evidence.scenarios.length };
};

const assertCandidateAcceptance = (manifest, candidateEvidence) => {
  if (!manifest.gates?.featureAcceptanceRequired) return { ok: true, required: false };
  const acceptancePath = path.join(manifest.artifact.releaseDir, 'candidate-acceptance.json');
  if (!fs.existsSync(acceptancePath)) throw new Error(`${manifest.taskId} P1 activation requires candidate-acceptance.json.`);
  const acceptance = JSON.parse(fs.readFileSync(acceptancePath, 'utf8'));
  if (acceptance.taskId !== manifest.taskId || acceptance.releaseId !== manifest.releaseId || acceptance.previewUrl !== candidateEvidence.previewUrl || acceptance.featureEvidence?.ok !== true) {
    throw new Error(`${manifest.taskId} candidate acceptance identity is incomplete or mismatched.`);
  }
  return { ok: true, required: true, evidencePath: acceptancePath };
};

export const verifyRemoteArtifact = async ({ manifest, baseUrl, fetchImpl = fetch }) => {
  if (!baseUrl) throw new Error('DEV-083 remote provenance requires a Firebase preview/canonical URL from the deploy result.');
  const origin = baseUrl.replace(/\/$/, '');
  const remoteFiles = new Map();
  for (const entry of manifest.artifact.entries ?? []) {
    const encodedPath = entry.path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const response = await fetchImpl(`${origin}/${encodedPath}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`DEV-083 remote artifact entry failed: ${entry.path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== entry.size) throw new Error(`DEV-083 remote artifact size mismatch: ${entry.path}`);
    if (sha256(bytes) !== entry.sha256) throw new Error(`DEV-083 remote artifact hash mismatch: ${entry.path}`);
    const text = Buffer.from(bytes).toString('utf8');
    if (text.includes(PRODUCTION_CONTRACT.forbiddenSupabaseProjectRef) || /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role/i.test(text)) throw new Error(`DEV-083 remote artifact contains forbidden identity or secret pattern: ${entry.path}`);
    remoteFiles.set(entry.path, bytes);
  }
  if (!remoteFiles.has('release-meta.json')) throw new Error('DEV-083 immutable manifest has no release-meta.json entry.');
  if (!remoteFiles.has('index.html')) throw new Error('DEV-083 immutable manifest has no index.html entry.');
  let meta;
  try {
    meta = JSON.parse(Buffer.from(remoteFiles.get('release-meta.json')).toString('utf8'));
  } catch {
    throw new Error('DEV-083 remote release-meta.json is not valid JSON.');
  }
  if (meta.releaseId !== manifest.releaseId || meta.contractSha256 !== manifest.contractSha256 || meta.target?.origin !== PRODUCTION_CONTRACT.canonicalOrigin) throw new Error('DEV-083 remote release metadata does not match the immutable manifest.');
  const indexText = Buffer.from(remoteFiles.get('index.html')).toString('utf8');
  if (indexText.includes(PRODUCTION_CONTRACT.forbiddenSupabaseProjectRef)) throw new Error('DEV-083 remote index references forbidden test project.');
  return { ok: true, baseUrl: origin, releaseId: meta.releaseId, treeSha256: manifest.artifact.treeSha256, verifiedEntries: remoteFiles.size };
};

const prepare = async args => {
  const taskId = resolveReleaseTaskId(args.task_id);
  await assertCleanWorktree(taskId);
  const artifact = await buildProductionArtifact({
    taskId,
    productionEnvPath: args.production_env,
    requireFeatureEvidence: Boolean(args.require_feature_evidence),
  });
  assertLevel3(args, artifact.manifest.source.commit, taskId);
  const verified = verifyManifest(artifact.manifestPath, { root, expectedTaskId: taskId, productionEnvPath: args.production_env });
  if (!verified.ok) throw new Error(`${taskId} P0 artifact verification failed: ${verified.errors.join('; ')}`);
  const layer2 = await runLayer2Smoke(artifact.distDir, verified.manifest);
  const evidencePath = path.join(artifact.releaseDir, 'prepare-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ taskId, phase: 'prepare', releaseId: artifact.releaseId, manifestPath: artifact.manifestPath, level3Evidence: path.resolve(root, args.level3_evidence), layer2 }, null, 2)}\n`);
  updateReleaseCapsule(verified.manifest, { state: 'ARTIFACT_READY', evidence: { prepare: evidencePath } });
  return { ok: true, phase: 'prepare', releaseId: artifact.releaseId, manifestPath: artifact.manifestPath, evidencePath };
};

const candidate = async args => {
  const taskId = resolveReleaseTaskId(args.task_id);
  const manifestPath = readManifestPath(args.manifest, taskId);
  const verified = verifyManifest(manifestPath, { root, expectedTaskId: taskId, productionEnvPath: args.production_env });
  if (!verified.ok) throw new Error(`${taskId} P1 candidate artifact verification failed: ${verified.errors.join('; ')}`);
  assertLevel3(args, verified.manifest.source.commit, taskId);
  const publicEnv = resolveProductionPublicEnv({ root, parentEnv: process.env, envPath: args.production_env });
  if (sha256(canonicalJson(publicEnv)) !== verified.manifest.environment.publicEnvSha256) throw new Error(`${taskId} production environment fingerprint does not match the immutable artifact.`);
  const gateContext = { taskId, serverEnvPath: args.server_env, productionEnvPath: args.production_env };
  const serverReadiness = await runServerReadinessGate(gateContext);
  const productionBoundReadiness = await runProductionBoundReadiness(gateContext);
  const credentialRotation = await runCredentialRotationGate(gateContext);
  const liveBefore = await readLiveReleaseSnapshot();
  const deployment = await deployExactArtifact({ manifest: verified.manifest, phase: 'candidate' });
  const provenance = await verifyRemoteArtifact({ manifest: verified.manifest, baseUrl: deployment.previewUrl });
  const browser = await runBrowserSmokeAtUrl({ baseUrl: deployment.previewUrl, releaseId: verified.manifest.releaseId, sessionPrefix: `${releaseTaskSlug(taskId)}-candidate`, taskId });
  const oauth = await verifyRemoteOAuthCancel({ anonKey: publicEnv.VITE_SUPABASE_ANON_KEY, supabaseUrl: publicEnv.VITE_SUPABASE_URL });
  const liveAfter = await readLiveReleaseSnapshot();
  if (JSON.stringify(liveBefore) !== JSON.stringify(liveAfter)) throw new Error(`${taskId} candidate deployment changed the live channel release; refusing to produce candidate evidence.`);
  const evidencePath = path.join(verified.manifest.artifact.releaseDir, 'candidate-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ taskId, phase: 'candidate', releaseId: verified.manifest.releaseId, manifestPath, target: deployment.previewUrl ?? 'firebase-preview-channel', serverReadiness, productionBoundReadiness, credentialRotation, liveBefore, liveAfter, provenance, browser, oauth, level3Evidence: path.resolve(root, args.level3_evidence) }, null, 2)}\n`);
  const activationReady = !verified.manifest.gates?.featureAcceptanceRequired;
  updateReleaseCapsule(verified.manifest, {
    state: activationReady ? 'CANDIDATE_READY' : 'CANDIDATE_DEPLOYED',
    evidence: { candidate: evidencePath },
    promotion: { candidate: deployment.previewUrl },
  });
  return { ok: true, phase: 'candidate', releaseId: verified.manifest.releaseId, evidencePath, previewUrl: deployment.previewUrl, activationReady };
};

const acceptCandidate = async args => {
  const taskId = resolveReleaseTaskId(args.task_id);
  const manifestPath = readManifestPath(args.manifest, taskId);
  const verified = verifyManifest(manifestPath, { root, expectedTaskId: taskId, productionEnvPath: args.production_env });
  if (!verified.ok) throw new Error(`${taskId} P1 candidate acceptance artifact verification failed: ${verified.errors.join('; ')}`);
  const candidatePath = path.join(verified.manifest.artifact.releaseDir, 'candidate-evidence.json');
  const candidateEvidence = assertCandidateEvidence(verified.manifest, candidatePath);
  const featureEvidencePath = typeof args.feature_evidence === 'string' ? path.resolve(root, args.feature_evidence) : null;
  const featureEvidence = assertFeatureEvidence(verified.manifest, candidateEvidence, featureEvidencePath);
  const evidencePath = path.join(verified.manifest.artifact.releaseDir, 'candidate-acceptance.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ taskId, phase: 'accept-candidate', releaseId: verified.manifest.releaseId, previewUrl: candidateEvidence.previewUrl, featureEvidence }, null, 2)}\n`);
  updateReleaseCapsule(verified.manifest, { state: 'CANDIDATE_READY', evidence: { candidateAcceptance: evidencePath } });
  return { ok: true, phase: 'accept-candidate', releaseId: verified.manifest.releaseId, evidencePath };
};

const activate = async args => {
  const taskId = resolveReleaseTaskId(args.task_id);
  const manifestPath = readManifestPath(args.manifest, taskId);
  if (!args.approve_release) throw new Error(`${taskId} P1 activate requires explicit --approve-release <release-id>; candidate verification never activates production.`);
  const verified = verifyManifest(manifestPath, { root, expectedTaskId: taskId, productionEnvPath: args.production_env });
  if (!verified.ok) throw new Error(`${taskId} P1 activation artifact verification failed: ${verified.errors.join('; ')}`);
  assertLevel3(args, verified.manifest.source.commit, taskId);
  if (args.approve_release !== verified.manifest.releaseId) throw new Error(`${taskId} P1 approval release id does not match the verified immutable manifest.`);
  const evidencePath = path.join(verified.manifest.artifact.releaseDir, 'candidate-evidence.json');
  const candidateEvidence = assertCandidateEvidence(verified.manifest, evidencePath);
  const candidateAcceptance = assertCandidateAcceptance(verified.manifest, candidateEvidence);
  const publicEnv = resolveProductionPublicEnv({ root, parentEnv: process.env, envPath: args.production_env });
  if (sha256(canonicalJson(publicEnv)) !== verified.manifest.environment.publicEnvSha256) throw new Error(`${taskId} production environment fingerprint does not match the immutable artifact.`);
  const gateContext = { taskId, serverEnvPath: args.server_env, productionEnvPath: args.production_env };
  const serverReadiness = await runServerReadinessGate(gateContext);
  const productionBoundReadiness = await runProductionBoundReadiness(gateContext);
  const credentialRotation = await runCredentialRotationGate(gateContext);
  const liveBefore = await readLiveReleaseSnapshot();
  const evidencePathOut = path.join(verified.manifest.artifact.releaseDir, 'activation-evidence.json');
  try {
    const deployment = await deployExactArtifact({ manifest: verified.manifest, phase: 'activate' });
    const provenance = await verifyRemoteArtifact({ manifest: verified.manifest, baseUrl: PRODUCTION_CONTRACT.canonicalOrigin });
    const browser = await runBrowserSmokeAtUrl({ baseUrl: PRODUCTION_CONTRACT.canonicalOrigin, releaseId: verified.manifest.releaseId, sessionPrefix: `${releaseTaskSlug(taskId)}-canonical`, taskId });
    const oauth = await verifyRemoteOAuthCancel({ anonKey: publicEnv.VITE_SUPABASE_ANON_KEY, supabaseUrl: publicEnv.VITE_SUPABASE_URL });
    fs.writeFileSync(evidencePathOut, `${JSON.stringify({ taskId, phase: 'activate', releaseId: verified.manifest.releaseId, previousLiveRelease: liveBefore, candidateEvidence, candidateAcceptance, serverReadiness, productionBoundReadiness, credentialRotation, deployment, provenance, browser, oauth, level3Evidence: path.resolve(root, args.level3_evidence) }, null, 2)}\n`);
    updateReleaseCapsule(verified.manifest, { state: 'LIVE_VERIFIED', evidence: { activation: evidencePathOut }, promotion: { live: deployment } });
    return { ok: true, phase: 'activate', releaseId: verified.manifest.releaseId, evidencePath: evidencePathOut };
  } catch (error) {
    fs.writeFileSync(path.join(verified.manifest.artifact.releaseDir, 'activation-failure.json'), `${JSON.stringify({ taskId, phase: 'activate', releaseId: verified.manifest.releaseId, previousLiveRelease: liveBefore, error: redact(error.message) }, null, 2)}\n`);
    throw error;
  }
};

export async function runRelease(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const phase = args.phase;
  if (!['prepare', 'candidate', 'accept-candidate', 'activate'].includes(phase)) throw new Error('RELEASE P1 usage: npm run release:production -- --phase <prepare|candidate|accept-candidate|activate> [args].');
  if (phase === 'prepare') return prepare(args);
  if (phase === 'candidate') return candidate(args);
  if (phase === 'accept-candidate') return acceptCandidate(args);
  return activate(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runRelease().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exit(1); });
}
