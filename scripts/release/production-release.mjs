import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildProductionArtifact } from './build-production-artifact.mjs';
import { verifyManifest } from './verify-production-artifact.mjs';
import { verifyRemoteOAuthCancel } from './verify-oauth-cancel-callback.mjs';
import { PRODUCTION_CONTRACT, sha256 } from './production-contract.mjs';
import { buildSanitizedChildEnv, readEnvFile } from './env-boundary.mjs';
import { summarizeCredentialRotationEvidence } from './credential-rotation-evidence.mjs';

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

const runServerReadinessGate = async () => {
  const result = await run(process.execPath, [path.join(root, 'scripts', 'p8-preflight.mjs'), '--strict'], {
    cwd: root,
    env: buildSanitizedChildEnv(process.env, {
      extra: Object.fromEntries([
        'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_AUTH_REDIRECT_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD',
        'SUPABASE_CREDENTIAL_ROTATION_VERIFIED', 'P8_CREDENTIAL_ROTATION_VERIFIED',
        'P7_CREDENTIAL_ROTATION_CONFIRMED',
      ].filter(key => process.env[key]).map(key => [key, process.env[key]])),
    }),
  });
  if (result.code !== 0) throw new Error('DEV-083 production-bound server readiness gate failed.');
  return { ok: true, gate: 'p8-preflight', strict: true };
};

const runProductionBoundReadiness = async () => {
  const result = await run(process.execPath, [path.join(root, 'scripts', 'release', 'verify-production-bound-readiness.mjs'), '--strict'], {
    cwd: root,
    env: buildSanitizedChildEnv(process.env, {
      extra: Object.fromEntries([
        'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_AUTH_REDIRECT_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD',
        'SUPABASE_CREDENTIAL_ROTATION_VERIFIED', 'P8_CREDENTIAL_ROTATION_VERIFIED',
        'P7_CREDENTIAL_ROTATION_CONFIRMED',
      ].filter(key => process.env[key]).map(key => [key, process.env[key]])),
    }),
  });
  if (result.code !== 0) throw new Error('DEV-083 production-bound read-only readiness failed.');
  return { ok: true, gate: 'production-bound-readiness', strict: true };
};

const runCredentialRotationGate = async () => {
  const result = await run(process.execPath, [path.join(root, 'scripts', 'p8-credential-rotation-check.mjs'), '--strict'], {
    cwd: root,
    env: buildSanitizedChildEnv(process.env, {
      extra: Object.fromEntries([
        'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN',
        'OLD_SUPABASE_ANON_KEY', 'OLD_SUPABASE_SERVICE_ROLE_KEY', 'OLD_SUPABASE_ACCESS_TOKEN',
        'P8_OLD_SUPABASE_ANON_KEY', 'P8_OLD_SUPABASE_SERVICE_ROLE_KEY', 'P8_OLD_SUPABASE_ACCESS_TOKEN',
        'SUPABASE_CREDENTIAL_ROTATION_VERIFIED', 'P8_CREDENTIAL_ROTATION_VERIFIED', 'P7_CREDENTIAL_ROTATION_CONFIRMED',
      ].filter(key => process.env[key]).map(key => [key, process.env[key]])),
    }),
  });
  let parsed;
  let evidence;
  try {
    parsed = JSON.parse(result.stdout);
    evidence = summarizeCredentialRotationEvidence(parsed.results);
  } catch {
    throw new Error('DEV-083 credential rotation gate did not return valid JSON evidence.');
  }
  if (result.code !== 0) {
    const unresolved = evidence.filter(item => item.status !== 'pass').map(item => `${item.name}:${item.evidence_mode}`);
    throw new Error(`DEV-083 credential rotation gate failed (${unresolved.join(', ')}).`);
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

const runBrowserSmokeAtUrl = async ({ baseUrl, releaseId, sessionPrefix, filename = path.join(root, 'scripts', 'verify-release-browser-smoke.pw.js') }) => {
  const url = new URL(baseUrl);
  url.searchParams.set('dev083ReleaseId', releaseId);
  const smoke = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'run-playwright-code.ps1'), '-SessionPrefix', sessionPrefix, '-Filename', filename, '-OutputDirectory', path.join(root, 'output', 'playwright', sessionPrefix), '-BaseUrl', url.toString()], { cwd: root, env: buildReleaseRuntimeEnv(process.env) });
  if (smoke.code !== 0) throw new Error(`DEV-083 browser smoke failed: ${redact((smoke.stderr || smoke.stdout).trim().slice(-1200))}`);
  return { ok: true, baseUrl: url.origin, expectedReleaseId: releaseId };
};

const git = async args => {
  const result = await run('git', args, { cwd: root, env: process.env });
  if (result.code !== 0) throw new Error('DEV-083 could not resolve Git source identity; refusing to continue.');
  return result.stdout.trim();
};

const assertCleanWorktree = async () => {
  const status = await git(['status', '--porcelain']);
  if (status) throw new Error('DEV-083 release build requires a clean worktree; commit or separately resolve changes before release preparation.');
};

export const assertLevel3 = (args, expectedCommit) => {
  if (!args.level3_evidence) throw new Error('DEV-083 P1 requires --level3-evidence <same-commit evidence path>; no remote deploy is attempted without it.');
  const evidencePath = path.resolve(root, args.level3_evidence);
  if (!fs.existsSync(evidencePath)) throw new Error('DEV-083 P1 Level3 evidence path does not exist.');
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')); } catch { throw new Error('DEV-083 P1 Level3 evidence must be JSON with source commit identity.'); }
  const commit = evidence.sourceCommit ?? evidence.commit ?? evidence.source?.commit;
  if (!commit) throw new Error('DEV-083 P1 Level3 evidence has no source commit identity.');
  if (expectedCommit && commit !== expectedCommit) throw new Error('DEV-083 P1 Level3 evidence source commit does not match the immutable artifact.');
  let preview;
  try { preview = new URL(evidence.previewUrl); } catch { throw new Error('DEV-083 Level3 evidence requires a valid HTTPS preview URL.'); }
  if (evidence.phase !== 'level3' || evidence.projectId !== PRODUCTION_CONTRACT.projectId
    || evidence.stagingBackend !== PRODUCTION_CONTRACT.forbiddenSupabaseProjectRef
    || preview.protocol !== 'https:' || preview.username || preview.password || preview.port
    || !new RegExp(`^${PRODUCTION_CONTRACT.siteId}--level3-smoke-[a-z0-9-]+\\.web\\.app$`).test(preview.hostname)) {
    throw new Error('DEV-083 Level3 evidence environment/preview identity mismatch.');
  }
  if (evidence.smoke?.result !== 'PASS' || typeof evidence.smoke?.scope !== 'string' || !evidence.smoke.scope.trim()
    || evidence.smoke.pageErrors !== 0 || evidence.smoke.criticalFailedRequests !== 0) {
    throw new Error('DEV-083 Level3 evidence requires passed scoped smoke with zero page errors and critical failed requests.');
  }
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
  const port = 4174;
  try {
    const existing = await fetch(`http://127.0.0.1:${port}/`);
    if (existing) throw new Error(`DEV-083 Layer2 port ${port} is already owned by another runtime; refusing to stop it.`);
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
    const smoke = await runBrowserSmokeAtUrl({ baseUrl: `http://127.0.0.1:${port}/`, releaseId: manifest.releaseId, sessionPrefix: 'dev083-layer2' });
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
    if (remaining.ok) cleanupError = new Error(`DEV-083 Layer2 cleanup failed: port ${port} is still responding.`);
  } catch {
    // Expected state after cleanup is a connection failure.
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
};

const readManifestPath = value => {
  if (!value) throw new Error('DEV-083 P1 requires --manifest <path>.');
  const manifestPath = path.resolve(root, value);
  if (!fs.existsSync(manifestPath)) throw new Error('DEV-083 manifest path does not exist.');
  return manifestPath;
};

export const assertLiveAssetCompatibility = async (manifest, { fetchImpl = fetch } = {}) => {
  const previousReleaseId = manifest.artifact?.compatibility?.sourceReleaseId;
  if (!previousReleaseId) throw new Error('DEV-134 shipping artifact must retain the current live assets; rebuild with --previous-manifest.');
  const response = await fetchImpl(`${PRODUCTION_CONTRACT.canonicalOrigin}/release-meta.json?compatibility_check=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('DEV-134 could not verify the current live asset compatibility binding.');
  const metadata = await response.json();
  if (metadata.schemaVersion !== 1 || metadata.releaseId !== previousReleaseId) throw new Error('DEV-134 previous asset binding no longer matches live; rebuild against the current live artifact.');
};

const deployExactArtifact = async ({ manifest, phase }) => {
  await assertLiveAssetCompatibility(manifest);
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
  if (!fs.existsSync(evidencePath)) throw new Error('DEV-083 P1 activation requires candidate-evidence.json from the inactive preview channel.');
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')); } catch { throw new Error('DEV-083 candidate evidence is not valid JSON.'); }
  if (evidence.phase !== 'candidate' || evidence.releaseId !== manifest.releaseId) throw new Error('DEV-083 candidate evidence release identity does not match the immutable manifest.');
  const expectedManifestPath = path.join(manifest.artifact.releaseDir, 'manifest.json');
  if (!evidence.manifestPath || path.resolve(evidence.manifestPath) !== path.resolve(expectedManifestPath)) throw new Error('DEV-083 candidate evidence manifest path does not match the immutable artifact.');
  if (evidence.provenance?.ok !== true || evidence.provenance?.releaseId !== manifest.releaseId) throw new Error('DEV-083 candidate provenance evidence is incomplete or mismatched.');
  if (evidence.oauth?.ok !== true) throw new Error('DEV-083 candidate OAuth safe-cancel evidence is incomplete.');
  return { ok: true, releaseId: evidence.releaseId, previewUrl: evidence.provenance.baseUrl };
};

const isRetryableRemoteStatus = status => [404, 408, 425, 429, 500, 502, 503, 504].includes(status);

const fetchRemoteArtifactEntry = async ({ url, entryPath, fetchImpl, retryAttempts, retryDelayMs }) => {
  const attempts = Math.max(1, Number.isInteger(retryAttempts) ? retryAttempts : 1);
  let lastResponse;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      lastResponse = await fetchImpl(url, { cache: 'no-store' });
      if (lastResponse.ok) return lastResponse;
      if (!isRetryableRemoteStatus(lastResponse.status)) break;
    } catch {
      lastResponse = null;
    }
    if (attempt < attempts && retryDelayMs > 0) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }
  throw new Error(`DEV-083 remote artifact entry failed: ${entryPath}`);
};

export const verifyRemoteArtifact = async ({
  manifest,
  baseUrl,
  fetchImpl = fetch,
  retryAttempts = fetchImpl === fetch ? 25 : 1,
  retryDelayMs = fetchImpl === fetch ? 5000 : 0,
}) => {
  if (!baseUrl) throw new Error('DEV-083 remote provenance requires a Firebase preview/canonical URL from the deploy result.');
  const origin = baseUrl.replace(/\/$/, '');
  const remoteFiles = new Map();
  for (const entry of manifest.artifact.entries ?? []) {
    const encodedPath = entry.path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const artifactUrl = new URL(`${origin}/${encodedPath}`);
    artifactUrl.searchParams.set('dev083ReleaseId', manifest.releaseId);
    const response = await fetchRemoteArtifactEntry({
      url: artifactUrl.toString(),
      entryPath: entry.path,
      fetchImpl,
      retryAttempts,
      retryDelayMs,
    });
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

// Explicit low-risk selection after reviewing the complete release diff. This is
// not an automatic risk classifier or permission to mutate production data.
export const runDirectRelease = async (args, services = {
  assertCleanWorktree, git, buildProductionArtifact, verifyManifest,
  readLiveReleaseSnapshot, deployExactArtifact, verifyRemoteArtifact, runBrowserSmokeAtUrl,
}) => {
  if (typeof args.reason !== 'string' || !args.reason.trim()) throw new Error('DEV-083 direct requires --reason describing bounded impact and quick recovery.');
  if (args.verify_only !== undefined && args.verify_only !== true) throw new Error('DEV-083 --verify-only is a boolean flag.');
  if (args.verify_only && !args.manifest) throw new Error('DEV-083 --verify-only requires the already published --manifest.');
  if (args.level3_evidence || args.approve_release) throw new Error('DEV-083 direct does not consume protected-phase evidence or approval tokens.');
  let featureFile;
  let featureSha256;
  if (args.feature_smoke !== undefined) {
    if (typeof args.feature_smoke !== 'string' || !args.feature_smoke.endsWith('.pw.js')) throw new Error('DEV-083 --feature-smoke must name an existing repository .pw.js file.');
    featureFile = fs.realpathSync(path.resolve(root, args.feature_smoke));
    const relative = path.relative(fs.realpathSync(root), featureFile);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(featureFile).isFile()) throw new Error('DEV-083 feature smoke must stay inside the repository.');
    if (featureFile === fs.realpathSync(path.join(root, 'scripts', 'verify-release-browser-smoke.pw.js'))) throw new Error('DEV-083 app-shell smoke cannot replace changed-feature verification.');
    featureSha256 = sha256(fs.readFileSync(featureFile));
  }

  let manifestPath;
  if (args.manifest) {
    manifestPath = readManifestPath(args.manifest);
  } else {
    await services.assertCleanWorktree();
    const sourceCommit = await services.git(['rev-parse', 'HEAD']);
    const artifact = await services.buildProductionArtifact({ previousManifestPath: args.previous_manifest, requirePreviousAssets: true });
    await services.assertCleanWorktree();
    if (await services.git(['rev-parse', 'HEAD']) !== sourceCommit || artifact.manifest.source.commit !== sourceCommit) throw new Error('DEV-083 release source changed during build.');
    manifestPath = artifact.manifestPath;
  }
  const verified = services.verifyManifest(manifestPath, { root });
  if (!verified.ok) throw new Error(`DEV-083 direct artifact verification failed: ${verified.errors.join('; ')}`);
  const manifest = verified.manifest;
  if (manifest.source?.dirty !== false || !manifest.source?.commit) throw new Error('DEV-083 direct requires a classified clean source artifact.');
  const evidencePath = path.join(manifest.artifact.releaseDir, 'direct-evidence.json');
  let receipt;
  if (args.verify_only) {
    if (!fs.existsSync(evidencePath)) throw new Error('DEV-083 verify-only requires the original direct release receipt.');
    receipt = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    if (receipt.phase !== 'direct' || receipt.releaseId !== manifest.releaseId || receipt.treeSha256 !== manifest.artifact.treeSha256
      || receipt.manifestPath !== manifestPath || !receipt.previousLiveRelease?.versionName) throw new Error('DEV-083 direct receipt identity/recovery mismatch.');
  } else {
    if (fs.existsSync(evidencePath)) throw new Error('DEV-083 direct already attempted; inspect live state and use --manifest with --verify-only instead of redeploying.');
    const previousLiveRelease = await services.readLiveReleaseSnapshot();
    if (!previousLiveRelease?.releaseName || !previousLiveRelease?.versionName) throw new Error('DEV-083 direct requires a previous live release/version for recovery.');
    receipt = {
      taskId: PRODUCTION_CONTRACT.taskId, phase: 'direct', releaseId: manifest.releaseId,
      manifestPath, source: manifest.source, target: manifest.target, treeSha256: manifest.artifact.treeSha256,
      reason: redact(args.reason.trim()), previousLiveRelease,
      recoveryMethod: 'Restore previousLiveRelease.versionName from Firebase Hosting release history, then verify the canonical origin.',
      published: false, complete: false, verification: 'pending', deployment: { status: 'not-started' },
    };
  }
  const save = () => fs.writeFileSync(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`);
  receipt.complete = false;
  receipt.verification = 'pending';
  delete receipt.error;
  delete receipt.provenance;
  delete receipt.browser;
  delete receipt.feature;
  save();
  try {
    if (!args.verify_only) {
      receipt.deployment = { status: 'attempting' };
      save();
      const deployment = await services.deployExactArtifact({ manifest, phase: 'direct' });
      if (deployment?.ok !== true) throw new Error('DEV-083 direct deployment did not return success.');
      receipt.deployment = { ...deployment, status: 'published' };
      receipt.published = true;
      save();
    }
    receipt.provenance = await services.verifyRemoteArtifact({ manifest, baseUrl: PRODUCTION_CONTRACT.canonicalOrigin });
    if (receipt.provenance?.ok !== true) throw new Error('DEV-083 direct canonical provenance failed.');
    receipt.published = true;
    receipt.browser = await services.runBrowserSmokeAtUrl({ baseUrl: PRODUCTION_CONTRACT.canonicalOrigin, releaseId: manifest.releaseId, sessionPrefix: 'dev083-direct' });
    if (receipt.browser?.ok !== true) throw new Error('DEV-083 direct canonical browser smoke failed.');
    if (featureFile) {
      receipt.feature = await services.runBrowserSmokeAtUrl({ baseUrl: PRODUCTION_CONTRACT.canonicalOrigin, releaseId: manifest.releaseId, sessionPrefix: 'dev083-direct-feature', filename: featureFile });
      if (receipt.feature?.ok !== true) throw new Error('DEV-083 direct feature smoke failed.');
      receipt.feature.filename = path.relative(root, featureFile).replaceAll(path.sep, '/');
      if (sha256(fs.readFileSync(featureFile)) !== featureSha256) throw new Error('DEV-083 feature smoke changed during verification.');
      receipt.feature.sha256 = featureSha256;
    }
    receipt.complete = Boolean(receipt.feature?.ok);
    receipt.verification = receipt.complete ? 'passed' : 'feature-pending';
    save();
    return { ok: true, phase: 'direct', releaseId: manifest.releaseId, manifestPath, evidencePath, published: true, complete: receipt.complete, verification: receipt.verification };
  } catch (error) {
    receipt.verification = 'failed';
    receipt.error = redact(error.message);
    if (receipt.deployment.status === 'attempting') {
      receipt.deployment.status = 'unknown';
      receipt.published = null;
    }
    save();
    throw error;
  }
};

const prepare = async args => {
  await assertCleanWorktree();
  const artifact = await buildProductionArtifact({ previousManifestPath: args.previous_manifest, requirePreviousAssets: true });
  assertLevel3(args, artifact.manifest.source.commit);
  const verified = verifyManifest(artifact.manifestPath, { root });
  if (!verified.ok) throw new Error(`DEV-083 P0 artifact verification failed: ${verified.errors.join('; ')}`);
  const layer2 = await runLayer2Smoke(artifact.distDir, verified.manifest);
  const evidencePath = path.join(artifact.releaseDir, 'prepare-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ taskId: PRODUCTION_CONTRACT.taskId, phase: 'prepare', releaseId: artifact.releaseId, manifestPath: artifact.manifestPath, level3Evidence: path.resolve(root, args.level3_evidence), layer2 }, null, 2)}\n`);
  return { ok: true, phase: 'prepare', releaseId: artifact.releaseId, manifestPath: artifact.manifestPath, evidencePath };
};

const candidate = async args => {
  const manifestPath = readManifestPath(args.manifest);
  const verified = verifyManifest(manifestPath, { root });
  if (!verified.ok) throw new Error(`DEV-083 P1 candidate artifact verification failed: ${verified.errors.join('; ')}`);
  assertLevel3(args, verified.manifest.source.commit);
  const serverReadiness = await runServerReadinessGate();
  const productionBoundReadiness = await runProductionBoundReadiness();
  const credentialRotation = await runCredentialRotationGate();
  const liveBefore = await readLiveReleaseSnapshot();
  const deployment = await deployExactArtifact({ manifest: verified.manifest, phase: 'candidate' });
  const provenance = await verifyRemoteArtifact({ manifest: verified.manifest, baseUrl: deployment.previewUrl });
  const browser = await runBrowserSmokeAtUrl({ baseUrl: deployment.previewUrl, releaseId: verified.manifest.releaseId, sessionPrefix: 'dev083-candidate' });
  const productionEnv = readEnvFile(path.join(root, '.env.production'));
  const oauth = await verifyRemoteOAuthCancel({ anonKey: productionEnv.VITE_SUPABASE_ANON_KEY, supabaseUrl: productionEnv.VITE_SUPABASE_URL });
  const liveAfter = await readLiveReleaseSnapshot();
  if (JSON.stringify(liveBefore) !== JSON.stringify(liveAfter)) throw new Error('DEV-083 candidate deployment changed the live channel release; refusing to produce candidate evidence.');
  const evidencePath = path.join(verified.manifest.artifact.releaseDir, 'candidate-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ taskId: PRODUCTION_CONTRACT.taskId, phase: 'candidate', releaseId: verified.manifest.releaseId, manifestPath, target: deployment.previewUrl ?? 'firebase-preview-channel', serverReadiness, productionBoundReadiness, credentialRotation, liveBefore, liveAfter, provenance, browser, oauth, level3Evidence: path.resolve(root, args.level3_evidence) }, null, 2)}\n`);
  return { ok: true, phase: 'candidate', releaseId: verified.manifest.releaseId, evidencePath, previewUrl: deployment.previewUrl };
};

const activate = async args => {
  const manifestPath = readManifestPath(args.manifest);
  if (!args.approve_release) throw new Error('DEV-083 P1 activate requires explicit --approve-release <release-id>; candidate verification never activates production.');
  const verified = verifyManifest(manifestPath, { root });
  if (!verified.ok) throw new Error(`DEV-083 P1 activation artifact verification failed: ${verified.errors.join('; ')}`);
  assertLevel3(args, verified.manifest.source.commit);
  if (args.approve_release !== verified.manifest.releaseId) throw new Error('DEV-083 P1 approval release id does not match the verified immutable manifest.');
  const evidencePath = path.join(verified.manifest.artifact.releaseDir, 'candidate-evidence.json');
  const candidateEvidence = assertCandidateEvidence(verified.manifest, evidencePath);
  const serverReadiness = await runServerReadinessGate();
  const productionBoundReadiness = await runProductionBoundReadiness();
  const credentialRotation = await runCredentialRotationGate();
  const liveBefore = await readLiveReleaseSnapshot();
  const evidencePathOut = path.join(verified.manifest.artifact.releaseDir, 'activation-evidence.json');
  try {
    const deployment = await deployExactArtifact({ manifest: verified.manifest, phase: 'activate' });
    const provenance = await verifyRemoteArtifact({ manifest: verified.manifest, baseUrl: PRODUCTION_CONTRACT.canonicalOrigin });
    const browser = await runBrowserSmokeAtUrl({ baseUrl: PRODUCTION_CONTRACT.canonicalOrigin, releaseId: verified.manifest.releaseId, sessionPrefix: 'dev083-canonical' });
    const productionEnv = readEnvFile(path.join(root, '.env.production'));
    const oauth = await verifyRemoteOAuthCancel({ anonKey: productionEnv.VITE_SUPABASE_ANON_KEY, supabaseUrl: productionEnv.VITE_SUPABASE_URL });
    fs.writeFileSync(evidencePathOut, `${JSON.stringify({ taskId: PRODUCTION_CONTRACT.taskId, phase: 'activate', releaseId: verified.manifest.releaseId, previousLiveRelease: liveBefore, candidateEvidence, serverReadiness, productionBoundReadiness, credentialRotation, deployment, provenance, browser, oauth, level3Evidence: path.resolve(root, args.level3_evidence) }, null, 2)}\n`);
    return { ok: true, phase: 'activate', releaseId: verified.manifest.releaseId, evidencePath: evidencePathOut };
  } catch (error) {
    fs.writeFileSync(path.join(verified.manifest.artifact.releaseDir, 'activation-failure.json'), `${JSON.stringify({ taskId: PRODUCTION_CONTRACT.taskId, phase: 'activate', releaseId: verified.manifest.releaseId, previousLiveRelease: liveBefore, error: redact(error.message) }, null, 2)}\n`);
    throw error;
  }
};

export async function runRelease(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const phase = args.phase;
  if (!['direct', 'prepare', 'candidate', 'activate'].includes(phase)) throw new Error('DEV-083 P1 usage: npm run release:production -- --phase <direct|prepare|candidate|activate> [args]. direct requires --reason; --feature-smoke records changed-feature verification.');
  if (phase === 'direct') return runDirectRelease(args);
  if (phase === 'prepare') return prepare(args);
  if (phase === 'candidate') return candidate(args);
  return activate(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runRelease().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exit(1); });
}
