import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveProductionPublicEnv, buildSanitizedChildEnv } from './release/env-boundary.mjs';
import { PRODUCTION_CONTRACT } from './release/production-contract.mjs';
import { scanArtifact, verifyManifest } from './release/verify-production-artifact.mjs';
import { runSelfCheck as runOAuthSelfCheck } from './release/verify-oauth-cancel-callback.mjs';
import {
  classifyOldCredentialEvidence,
  loadCredentialRotationPolicy,
  resolvePermanentCredentialWaiver,
} from './release/credential-rotation-evidence.mjs';
import {
  assertCandidateEvidence,
  assertLevel3,
  buildReleaseRuntimeEnv,
  runRelease,
  runDirectRelease,
  summarizeLiveChannel,
  verifyRemoteArtifact,
} from './release/production-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selfCheckDir = path.join(root, 'output', 'release', 'dev-083', `self-check-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`);
const results = [];

const check = async (name, fn) => {
  try {
    await fn();
    results.push({ name, status: 'pass' });
  } catch (error) {
    results.push({ name, status: 'fail', reason: error.message });
  }
};

const expectThrow = (name, fn) => {
  try {
    fn();
    results.push({ name, status: 'fail', reason: 'expected failure did not occur' });
  } catch {
    results.push({ name, status: 'pass' });
  }
};

fs.mkdirSync(selfCheckDir, { recursive: true });
try {
  await check('production-contract', () => {
    const env = resolveProductionPublicEnv({ root, parentEnv: { PATH: process.env.PATH } });
    if (env.VITE_SUPABASE_URL !== PRODUCTION_CONTRACT.supabaseUrl) throw new Error('production Supabase contract mismatch');
  });
  expectThrow('parent-vite-conflict', () => resolveProductionPublicEnv({ root, parentEnv: { VITE_SUPABASE_URL: 'https://fhisnnufoeulxqrchldf.supabase.co' } }));
  const missingRoot = path.join(selfCheckDir, 'missing');
  fs.mkdirSync(missingRoot, { recursive: true });
  fs.writeFileSync(path.join(missingRoot, '.env.production'), 'VITE_DATA_BACKEND=supabase\n');
  expectThrow('missing-required-production-key', () => resolveProductionPublicEnv({ root: missingRoot, parentEnv: { PATH: process.env.PATH } }));
  await check('server-key-sanitization', () => {
    const child = buildSanitizedChildEnv({ PATH: process.env.PATH, SUPABASE_SERVICE_ROLE_KEY: 'redacted', VITE_SUPABASE_URL: 'https://test.invalid' });
    if ('SUPABASE_SERVICE_ROLE_KEY' in child || 'VITE_SUPABASE_URL' in child) throw new Error('forbidden key survived sanitization');
  });
  await check('release-runtime-child-env-sentinel', () => {
    const child = buildReleaseRuntimeEnv({
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      SUPABASE_SERVICE_ROLE_KEY: 'server-secret-sentinel',
      SUPABASE_DB_PASSWORD: 'db-secret-sentinel',
      VITE_SUPABASE_URL: 'https://test.invalid',
      GEMINI_API_KEY: 'gemini-secret-sentinel',
      UNRELATED_SECRET: 'unrelated-secret-sentinel',
    });
    for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'VITE_SUPABASE_URL', 'GEMINI_API_KEY', 'UNRELATED_SECRET']) {
      if (key in child) throw new Error(`${key} survived release runtime sanitization`);
    }
    if (child.PROJED_RELEASE_PROFILE !== 'production') throw new Error('release runtime profile is missing');
  });
  await check('credential-rotation-evidence-modes', () => {
    const attested = classifyOldCredentialEvidence({ credentialProvided: false, manualRotationConfirmed: true, envName: 'OLD_KEY' });
    if (attested.status !== 'pending' || attested.evidence_mode !== 'human-attested') throw new Error('human attestation was accepted as an inactive probe');
    const inactive = classifyOldCredentialEvidence({ credentialProvided: true, active: false });
    if (inactive.status !== 'pass' || inactive.evidence_mode !== 'probed-inactive') throw new Error('inactive probe evidence was not classified as pass');
    const probeError = classifyOldCredentialEvidence({ credentialProvided: true, probeError: 'network unavailable' });
    if (probeError.status !== 'pending' || probeError.evidence_mode !== 'probe-error') throw new Error('probe error was accepted as inactive evidence');
    const policy = loadCredentialRotationPolicy({ projectRef: PRODUCTION_CONTRACT.supabaseProjectRef });
    const waiver = resolvePermanentCredentialWaiver({ policy, envName: 'OLD_SUPABASE_ACCESS_TOKEN' });
    const permanentlyUnrecoverable = classifyOldCredentialEvidence({ credentialProvided: false, envName: 'OLD_SUPABASE_ACCESS_TOKEN', permanentWaiver: waiver });
    if (permanentlyUnrecoverable.status !== 'pass' || permanentlyUnrecoverable.evidence_mode !== 'permanently-unrecoverable') {
      throw new Error('permanent unrecoverable credential policy was not classified as pass-with-policy-waiver');
    }
    let mismatchThrown = false;
    try {
      loadCredentialRotationPolicy({ projectRef: 'fhisnnufoeulxqrchldf' });
    } catch {
      mismatchThrown = true;
    }
    if (!mismatchThrown) throw new Error('credential rotation policy incorrectly applied to the test project');
  });
  const liveChannelBefore = JSON.stringify({ channels: [
    { name: `sites/${PRODUCTION_CONTRACT.siteId}/channels/live`, url: PRODUCTION_CONTRACT.canonicalOrigin, release: { name: `sites/${PRODUCTION_CONTRACT.siteId}/releases/live-a`, version: { name: `sites/${PRODUCTION_CONTRACT.siteId}/versions/version-a` } } },
    { name: `sites/${PRODUCTION_CONTRACT.siteId}/channels/${PRODUCTION_CONTRACT.candidateChannel}`, release: { name: `sites/${PRODUCTION_CONTRACT.siteId}/channels/${PRODUCTION_CONTRACT.candidateChannel}/releases/candidate-a`, version: { name: `sites/${PRODUCTION_CONTRACT.siteId}/versions/candidate-a` } } },
  ] });
  const liveChannelAfterCandidate = JSON.stringify({ channels: [
    { name: `sites/${PRODUCTION_CONTRACT.siteId}/channels/live`, url: PRODUCTION_CONTRACT.canonicalOrigin, release: { name: `sites/${PRODUCTION_CONTRACT.siteId}/releases/live-a`, version: { name: `sites/${PRODUCTION_CONTRACT.siteId}/versions/version-a` } } },
    { name: `sites/${PRODUCTION_CONTRACT.siteId}/channels/${PRODUCTION_CONTRACT.candidateChannel}`, release: { name: `sites/${PRODUCTION_CONTRACT.siteId}/channels/${PRODUCTION_CONTRACT.candidateChannel}/releases/candidate-b`, version: { name: `sites/${PRODUCTION_CONTRACT.siteId}/versions/candidate-b` } } },
  ] });
  await check('live-channel-snapshot-ignores-candidate-delta', () => {
    const before = summarizeLiveChannel(liveChannelBefore);
    const after = summarizeLiveChannel(liveChannelAfterCandidate);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('preview candidate delta changed live snapshot');
  });
  await check('live-channel-snapshot-detects-live-change', () => {
    const before = summarizeLiveChannel(liveChannelBefore);
    const changed = summarizeLiveChannel(liveChannelBefore.replace('live-a', 'live-b').replace('version-a', 'version-b'));
    if (JSON.stringify(before) === JSON.stringify(changed)) throw new Error('live release change was not detected');
  });
  expectThrow('live-channel-snapshot-requires-live-release', () => summarizeLiveChannel(JSON.stringify({ channels: [{ name: `sites/${PRODUCTION_CONTRACT.siteId}/channels/${PRODUCTION_CONTRACT.candidateChannel}` }] })));
  await check('supported-live-channel-command', () => {
    const source = fs.readFileSync(path.join(root, 'scripts', 'release', 'production-release.mjs'), 'utf8');
    if (source.includes('hosting:releases:list') || !source.includes('hosting:channel:list') || !source.includes("'--site'")) throw new Error('unsupported or ambiguous Firebase live-channel command remains in production release adapter');
  });
  const remoteFiles = new Map([
    ['index.html', Buffer.from('<!doctype html><div id="root"></div><script src="/assets/index.js"></script>')],
    ['assets/index.js', Buffer.from('console.log("production-entry")')],
    ['assets/lazy.js', Buffer.from('console.log("production-lazy")')],
  ]);
  const remoteReleaseMeta = {
    releaseId: 'remote-release-a',
    contractSha256: 'contract-a',
    target: { origin: PRODUCTION_CONTRACT.canonicalOrigin },
  };
  remoteFiles.set('release-meta.json', Buffer.from(`${JSON.stringify(remoteReleaseMeta)}\n`));
  const remoteManifest = {
    releaseId: remoteReleaseMeta.releaseId,
    contractSha256: remoteReleaseMeta.contractSha256,
    artifact: {
      treeSha256: 'tree-a',
      entries: [...remoteFiles.entries()].map(([entryPath, bytes]) => ({
        path: entryPath,
        size: bytes.byteLength,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      })),
      entryAssets: ['assets/index.js'],
    },
  };
  const remoteFetch = overrides => async (url) => {
    const entryPath = decodeURIComponent(new URL(url).pathname.slice(1));
    const bytes = overrides?.get(entryPath) ?? remoteFiles.get(entryPath);
    return bytes ? new Response(bytes, { status: 200 }) : new Response('not found', { status: 404 });
  };
  await check('remote-provenance-verifies-all-manifest-entries', async () => {
    const result = await verifyRemoteArtifact({ manifest: remoteManifest, baseUrl: 'https://candidate.example', fetchImpl: remoteFetch() });
    if (result.verifiedEntries !== remoteFiles.size) throw new Error('not every manifest entry was verified');
  });
  await check('remote-provenance-cache-key-is-bound-to-release', async () => {
    const stableFetch = remoteFetch();
    const observedUrls = [];
    const cacheAwareFetch = async (url, options) => {
      observedUrls.push(url);
      return stableFetch(url, options);
    };
    await verifyRemoteArtifact({ manifest: remoteManifest, baseUrl: 'https://candidate.example', fetchImpl: cacheAwareFetch });
    if (observedUrls.length !== remoteFiles.size) throw new Error('not every artifact URL was observed');
    if (observedUrls.some(url => new URL(url).searchParams.get('dev083ReleaseId') !== remoteManifest.releaseId)) {
      throw new Error('artifact URL cache key is not bound to the release');
    }
  });
  await check('remote-provenance-retries-hosting-propagation', async () => {
    const stableFetch = remoteFetch();
    let attempts = 0;
    const delayedFetch = async (url, options) => {
      attempts += 1;
      if (new URL(url).searchParams.get('dev083ReleaseId') !== remoteManifest.releaseId) {
        throw new Error('hosting propagation retry lost the release cache key');
      }
      if (attempts <= 2) return new Response('not propagated', { status: 404 });
      return stableFetch(url, options);
    };
    const result = await verifyRemoteArtifact({
      manifest: remoteManifest,
      baseUrl: 'https://candidate.example',
      fetchImpl: delayedFetch,
      retryAttempts: 3,
      retryDelayMs: 0,
    });
    if (attempts < 3 || result.verifiedEntries !== remoteFiles.size) throw new Error('hosting propagation retry did not converge');
  });
  await check('remote-provenance-detects-non-entry-asset-tamper', async () => {
    const overrides = new Map([['assets/lazy.js', Buffer.from('tampered lazy asset')]]);
    try {
      await verifyRemoteArtifact({ manifest: remoteManifest, baseUrl: 'https://candidate.example', fetchImpl: remoteFetch(overrides) });
      throw new Error('tampered non-entry asset passed');
    } catch (error) {
      if (!/hash mismatch|size mismatch/i.test(error.message)) throw error;
    }
  });
  const scanDir = path.join(selfCheckDir, 'dist');
  fs.mkdirSync(scanDir, { recursive: true });
  fs.writeFileSync(path.join(scanDir, 'app.js'), 'const origin="http://localhost:3000/";');
  expectThrow('app-owned-loopback-scan', () => {
    const scan = scanArtifact({ distDir: scanDir, root });
    if (scan.ok) throw new Error('loopback scan unexpectedly passed');
    throw new Error(scan.errors[0]);
  });
  fs.writeFileSync(path.join(scanDir, 'vendor.js'), 'const origin="http://localhost:3000/";');
  await check('vendor-loopback-tolerance', () => {
    const scan = scanArtifact({ distDir: scanDir, root });
    if (!scan.errors.some(error => error.includes('app.js'))) throw new Error('app-owned loopback was not reported');
  });
  const latest = fs.readdirSync(path.join(root, 'output', 'release', 'dev-083'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('self-check-'))
    .map(entry => {
      const manifestPath = path.join(root, 'output', 'release', 'dev-083', entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) return null;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return manifest.artifact?.treeSha256 && manifest.artifact?.distDir ? entry.name : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort()
    .reverse()[0];
  if (latest) {
    const sourceManifestPath = path.join(root, 'output', 'release', 'dev-083', latest, 'manifest.json');
    const tampered = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
    tampered.artifact.treeSha256 = 'tampered';
    const tamperedPath = path.join(selfCheckDir, 'tampered-manifest.json');
    fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered)}\n`);
    await check('manifest-tamper-detection', () => {
      if (verifyManifest(tamperedPath, { root }).ok) throw new Error('tampered manifest passed');
    });
  }
  await check('oauth-safe-cancel-self-check', () => runOAuthSelfCheck());
  const evidenceDir = path.join(selfCheckDir, 'candidate');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, 'candidate-evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({ phase: 'candidate', releaseId: 'release-a', manifestPath: path.join(evidenceDir, 'manifest.json'), provenance: { ok: true, releaseId: 'release-a', baseUrl: 'https://candidate.web.app' }, oauth: { ok: true } }));
  await check('candidate-evidence-identity', () => {
    const result = assertCandidateEvidence({ releaseId: 'release-a', artifact: { releaseDir: evidenceDir } }, evidencePath);
    if (!result.ok) throw new Error('candidate evidence was not accepted');
  });
  await check('candidate-evidence-mismatch', () => {
    try {
      assertCandidateEvidence({ releaseId: 'release-b', artifact: { releaseDir: evidenceDir } }, evidencePath);
      throw new Error('mismatched candidate evidence passed');
    } catch (error) {
      if (!/identity|mismatch/i.test(error.message)) throw error;
    }
  });
  await check('phase-safety', async () => {
    try {
      await runRelease(['--phase', 'activate']);
      throw new Error('activation unexpectedly proceeded without approval');
    } catch (error) {
      if (!/approve-release|manifest|level3-evidence/i.test(error.message)) throw error;
    }
  });

  // Exercise the actual direct orchestrator with all external operations replaced.
  // No Firebase process, browser, server, build or network runs in these fixtures.
  const directArgs = { reason: 'Icon-only fixture; bounded visual impact; restore previous Hosting version.' };
  const featureSmoke = 'scripts/verify-dev-122-mobile-zero-data-quick-task-root-browser.pw.js';
  let fixtureNumber = 0;
  const directFixture = ({ failAt, dirty = false, changedHead = false, invalidArtifact = false, missingRecovery = false } = {}) => {
    const releaseDir = path.join(selfCheckDir, `direct-${++fixtureNumber}`);
    fs.mkdirSync(releaseDir);
    const manifestPath = path.join(releaseDir, 'manifest.json');
    const manifest = {
      releaseId: `direct-fixture-${fixtureNumber}`, source: { commit: 'a'.repeat(40), dirty },
      target: { projectId: PRODUCTION_CONTRACT.projectId, origin: PRODUCTION_CONTRACT.canonicalOrigin },
      artifact: { releaseDir, treeSha256: 'fixture-tree' },
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const evidenceFile = path.join(releaseDir, 'direct-evidence.json');
    const calls = [];
    const record = name => { calls.push(name); if (failAt === name) throw new Error(`fixture ${name} failure`); };
    const previousLiveRelease = { releaseName: 'live-before', versionName: 'version-before' };
    let gitReads = 0;
    const services = {
      assertCleanWorktree: async () => { record('clean'); if (dirty) throw new Error('fixture dirty source'); },
      git: async () => { record('git'); return changedHead && ++gitReads > 1 ? 'b'.repeat(40) : manifest.source.commit; },
      buildProductionArtifact: async () => { record('build'); return { manifestPath, manifest }; },
      verifyManifest: value => { record('artifact'); assert.equal(value, manifestPath); return { ok: !invalidArtifact, errors: ['fixture tamper'], manifest }; },
      readLiveReleaseSnapshot: async () => { record('recovery'); return missingRecovery ? {} : previousLiveRelease; },
      deployExactArtifact: async ({ manifest: candidate, phase }) => {
        assert.equal(candidate, manifest);
        assert.equal(phase, 'direct');
        const before = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
        assert.deepEqual(before.previousLiveRelease, previousLiveRelease);
        assert.equal(before.deployment.status, 'attempting');
        assert.equal(before.complete, false);
        record('deploy');
        return { ok: true };
      },
      verifyRemoteArtifact: async ({ manifest: candidate, baseUrl }) => {
        assert.equal(candidate, manifest);
        assert.equal(baseUrl, PRODUCTION_CONTRACT.canonicalOrigin);
        record('provenance');
        return { ok: true, releaseId: manifest.releaseId };
      },
      runBrowserSmokeAtUrl: async ({ baseUrl, releaseId, filename }) => {
        assert.equal(baseUrl, PRODUCTION_CONTRACT.canonicalOrigin);
        assert.equal(releaseId, manifest.releaseId);
        record(filename ? 'feature' : 'browser');
        return { ok: true };
      },
    };
    return { services, calls, manifest, manifestPath, evidenceFile, previousLiveRelease };
  };
  await check('direct-build-once-live-once-with-feature', async () => {
    const f = directFixture();
    const result = await runDirectRelease({ ...directArgs, feature_smoke: featureSmoke }, f.services);
    assert.deepEqual(f.calls, ['clean', 'git', 'build', 'clean', 'git', 'artifact', 'recovery', 'deploy', 'provenance', 'browser', 'feature']);
    assert.equal(result.complete, true);
    assert.equal(result.verification, 'passed');
    assert.equal(JSON.parse(fs.readFileSync(f.evidenceFile, 'utf8')).feature.sha256.length, 64);
  });
  await check('direct-shell-only-is-feature-pending', async () => {
    const f = directFixture();
    const result = await runDirectRelease(directArgs, f.services);
    assert.equal(result.published, true);
    assert.equal(result.complete, false);
    assert.equal(result.verification, 'feature-pending');
  });
  for (const [name, args] of [
    ['missing-reason', {}], ['blank-reason', { reason: ' ' }],
    ['verify-only-without-manifest', { ...directArgs, verify_only: true }],
    ['invalid-boolean', { ...directArgs, verify_only: 'false' }],
    ['protected-evidence-in-direct', { ...directArgs, level3_evidence: 'unused.json' }],
    ['missing-feature-file', { ...directArgs, feature_smoke: 'scripts/missing-direct-feature.pw.js' }],
    ['shell-as-feature', { ...directArgs, feature_smoke: 'scripts/verify-release-browser-smoke.pw.js' }],
  ]) {
    await check(`direct-rejects-${name}-before-work`, async () => {
      const f = directFixture();
      await assert.rejects(runDirectRelease(args, f.services));
      assert.deepEqual(f.calls, []);
    });
  }
  for (const [name, options] of [
    ['dirty-source', { dirty: true }], ['source-change-during-build', { changedHead: true }],
    ['build-failure', { failAt: 'build' }], ['artifact-tamper', { invalidArtifact: true }],
    ['recovery-unavailable', { failAt: 'recovery' }], ['recovery-missing-version', { missingRecovery: true }],
  ]) {
    await check(`direct-blocks-${name}-before-deploy`, async () => {
      const f = directFixture(options);
      await assert.rejects(runDirectRelease(directArgs, f.services));
      assert.equal(f.calls.includes('deploy'), false);
    });
  }
  for (const failAt of ['deploy', 'provenance', 'browser', 'feature']) {
    await check(`direct-preserves-recovery-on-${failAt}-failure`, async () => {
      const f = directFixture({ failAt });
      await assert.rejects(runDirectRelease({ ...directArgs, feature_smoke: featureSmoke }, f.services), /fixture .* failure/);
      const receipt = JSON.parse(fs.readFileSync(f.evidenceFile, 'utf8'));
      assert.equal(receipt.complete, false);
      assert.equal(receipt.verification, 'failed');
      assert.deepEqual(receipt.previousLiveRelease, f.previousLiveRelease);
      assert.equal(receipt.published, failAt === 'deploy' ? null : true);
      assert.equal(receipt.deployment.status, failAt === 'deploy' ? 'unknown' : 'published');
    });
  }
  await check('direct-pinned-artifact-does-not-rebuild-current-source', async () => {
    const f = directFixture();
    await runDirectRelease({ ...directArgs, manifest: f.manifestPath }, f.services);
    assert.deepEqual(f.calls, ['artifact', 'recovery', 'deploy', 'provenance', 'browser']);
  });
  await check('direct-pinned-dirty-artifact-rejected', async () => {
    const f = directFixture({ dirty: true });
    await assert.rejects(runDirectRelease({ ...directArgs, manifest: f.manifestPath }, f.services), /clean source artifact/);
    assert.deepEqual(f.calls, ['artifact']);
  });
  await check('direct-verify-only-reuses-artifact-and-original-recovery', async () => {
    const f = directFixture();
    await runDirectRelease(directArgs, f.services);
    f.calls.length = 0;
    const result = await runDirectRelease({ ...directArgs, manifest: f.manifestPath, verify_only: true, feature_smoke: featureSmoke }, f.services);
    assert.equal(result.complete, true);
    assert.deepEqual(f.calls, ['artifact', 'provenance', 'browser', 'feature']);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.evidenceFile, 'utf8')).previousLiveRelease, f.previousLiveRelease);
  });
  await check('direct-does-not-redeploy-an-existing-attempt', async () => {
    const f = directFixture();
    await runDirectRelease(directArgs, f.services);
    f.calls.length = 0;
    await assert.rejects(runDirectRelease({ ...directArgs, manifest: f.manifestPath }, f.services), /already attempted/);
    assert.deepEqual(f.calls, ['artifact']);
  });
  await check('direct-reverification-failure-clears-prior-completion', async () => {
    const f = directFixture();
    await runDirectRelease({ ...directArgs, feature_smoke: featureSmoke }, f.services);
    f.calls.length = 0;
    f.services.verifyRemoteArtifact = async () => { throw new Error('fixture live changed'); };
    await assert.rejects(runDirectRelease({ ...directArgs, manifest: f.manifestPath, verify_only: true }, f.services), /live changed/);
    const receipt = JSON.parse(fs.readFileSync(f.evidenceFile, 'utf8'));
    assert.equal(receipt.complete, false);
    assert.equal(receipt.verification, 'failed');
    assert.equal(receipt.feature, undefined);
    assert.deepEqual(receipt.previousLiveRelease, f.previousLiveRelease);
    assert.deepEqual(f.calls, ['artifact']);
  });
  await check('direct-verify-only-can-resolve-uncertain-deployment', async () => {
    const f = directFixture({ failAt: 'deploy' });
    await assert.rejects(runDirectRelease(directArgs, f.services), /deploy failure/);
    f.calls.length = 0;
    const result = await runDirectRelease({ ...directArgs, manifest: f.manifestPath, verify_only: true, feature_smoke: featureSmoke }, f.services);
    assert.equal(result.published, true);
    assert.equal(result.complete, true);
    assert.deepEqual(f.calls, ['artifact', 'provenance', 'browser', 'feature']);
  });
  await check('direct-verify-only-requires-matching-receipt', async () => {
    const f = directFixture();
    await assert.rejects(runDirectRelease({ ...directArgs, manifest: f.manifestPath, verify_only: true }, f.services), /original direct release receipt/);
    await runDirectRelease(directArgs, f.services);
    const receipt = JSON.parse(fs.readFileSync(f.evidenceFile, 'utf8'));
    receipt.releaseId = 'wrong-release';
    fs.writeFileSync(f.evidenceFile, JSON.stringify(receipt));
    f.calls.length = 0;
    await assert.rejects(runDirectRelease({ ...directArgs, manifest: f.manifestPath, verify_only: true }, f.services), /identity/);
    assert.deepEqual(f.calls, ['artifact']);
  });
  const level3Path = path.join(selfCheckDir, 'level3.json');
  const level3 = {
    phase: 'level3', sourceCommit: 'a'.repeat(40), projectId: PRODUCTION_CONTRACT.projectId,
    stagingBackend: PRODUCTION_CONTRACT.forbiddenSupabaseProjectRef,
    previewUrl: `https://${PRODUCTION_CONTRACT.siteId}--level3-smoke-fixture.web.app`,
    smoke: { result: 'PASS', scope: 'Synthetic fixture for HTTPS shell only; not auth/data evidence.', pageErrors: 0, criticalFailedRequests: 0 },
  };
  await check('level3-accepts-matching-passed-scoped-evidence', () => {
    fs.writeFileSync(level3Path, JSON.stringify(level3));
    assertLevel3({ level3_evidence: level3Path }, level3.sourceCommit);
  });
  for (const [name, override] of [
    ['commit-only', { phase: undefined, previewUrl: undefined, smoke: undefined }],
    ['wrong-commit', { sourceCommit: 'b'.repeat(40) }],
    ['wrong-project', { projectId: 'other-project' }],
    ['production-backend', { stagingBackend: PRODUCTION_CONTRACT.supabaseProjectRef }],
    ['live-preview', { previewUrl: PRODUCTION_CONTRACT.canonicalOrigin }],
    ['http-preview', { previewUrl: level3.previewUrl.replace('https:', 'http:') }],
    ['lookalike-preview', { previewUrl: level3.previewUrl.replace('.web.app', '.attacker.web.app') }],
    ['failed-smoke', { smoke: { ...level3.smoke, result: 'FAIL' } }],
    ['missing-scope', { smoke: { ...level3.smoke, scope: '' } }],
    ['page-errors', { smoke: { ...level3.smoke, pageErrors: 1 } }],
    ['request-errors', { smoke: { ...level3.smoke, criticalFailedRequests: 1 } }],
  ]) {
    await check(`level3-rejects-${name}`, () => {
      fs.writeFileSync(level3Path, JSON.stringify({ ...level3, ...override }));
      assert.throws(() => assertLevel3({ level3_evidence: level3Path }, level3.sourceCommit));
    });
  }
  await check('direct-cli-missing-reason-does-not-start-work', async () => {
    await assert.rejects(runRelease(['--phase', 'direct']), /requires --reason/);
  });
  await check('unknown-phase-does-not-start-work', async () => {
    await assert.rejects(runRelease(['--phase', 'unknown']), /usage/);
  });
} finally {
  fs.rmSync(selfCheckDir, { recursive: true, force: true });
}

const failed = results.filter(result => result.status === 'fail');
console.log(JSON.stringify({ ok: failed.length === 0, taskId: PRODUCTION_CONTRACT.taskId, results }, null, 2));
if (failed.length > 0) process.exit(1);
