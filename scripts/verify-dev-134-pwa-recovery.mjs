import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { retainPreviousAssets, buildProductionArtifact } from './release/build-production-artifact.mjs';
import { verifyManifest } from './release/verify-production-artifact.mjs';
import { assertLiveAssetCompatibility } from './release/production-release.mjs';
import { PRODUCTION_CONTRACT, contractDigest, sha256 } from './release/production-contract.mjs';

const root = process.cwd();
const output = path.resolve(process.env.DEV134_REPORT_DIR ?? path.join(root, 'output', 'qa', 'dev-134'));
fs.mkdirSync(output, { recursive: true });
const results = [];
const check = async (name, work) => {
  try { await work(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
};
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const quickMain = fs.readFileSync('src/quickTask/main.ts', 'utf8');
const quickPwaLifecycle = quickMain.slice(quickMain.indexOf('const installQuickPwaLifecycle'), quickMain.indexOf('const needsRecovery'));
const transactionModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('src/services/pwaUpdateTransaction.ts', 'utf8')), { exports: transactionModule.exports, module: transactionModule });
const tx = transactionModule.exports;
const makeFailed = () => ({ ...tx.claimPwaUpdateTransaction(tx.createPwaUpdateTransaction({ transactionId: 'old-failed', sourceVersion: 'release:A', targetVersion: 'release:B', now: Date.now() - 600_000 }), 'old-tab', 3, Date.now() - 599_999), phase: 'failed', errorCode: 'APPLY_FAILED', errorMessage: '先前啟用未完成。' });
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values };
};
function serviceFixture() {
  const localStorage = storage(), sessionStorage = storage(), navigations = [];
  let latest = 'release:B', networkFailure = false, gateSafe = false;
  const document = { visibilityState: 'visible', querySelector: () => null, addEventListener() {} };
  const window = { location: { href: 'https://fixture.invalid/', replace: value => navigations.push(value) }, history: { replaceState() {} }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {}, setTimeout: () => 1, setInterval: () => 1, clearTimeout() {}, clearInterval() {} };
  const workerListeners = new Map();
  class Workbox { addEventListener(name, listener) { workerListeners.set(name, listener); } register() { return Promise.resolve({ update: () => Promise.reject(new Error('injected background outage')) }); } }
  const safety = {
    getPwaReloadSafetySnapshot: () => ({ state: gateSafe ? 'safe' : 'blocked', code: 'OWNER_ACTION_REQUIRED', pendingBoundary: null }),
    getPwaReloadReservation: () => null, clearPwaReloadReservation() {}, reservePwaReloadForTarget: () => true,
    requestPwaReloadBoundary: async () => gateSafe ? { ok: true } : { ok: false, code: 'OWNER_ACTION_REQUIRED' },
    setPwaReloadReadiness() {}, subscribePwaReloadSafety: () => () => {},
  };
  const module = { exports: {} };
  const context = {
    exports: module.exports, module, window, document, localStorage, sessionStorage,
    navigator: { onLine: true, serviceWorker: { addEventListener() {}, removeEventListener() {} } },
    __env: { PROD: true, DEV: false, MODE: 'qa', VITE_PROJED_RELEASE_ID: 'A' },
    require: name => name === 'workbox-window' ? { Workbox } : name.endsWith('pwaUpdateTransaction') ? tx : safety,
    console: { warn() {} }, Date, crypto: { randomUUID: () => 'fixture-id' }, URL,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async () => { if (networkFailure) throw new Error('injected network outage'); return { ok: true, json: async () => ({ schemaVersion: 1, version: latest, releaseId: latest.slice(8) }) }; },
  };
  const source = fs.readFileSync('src/services/pwaUpdateService.ts', 'utf8').replaceAll('import.meta.env', '__env')
    + '\nexport const fixture = { check: checkForAppShellUpdate, reconcile: reconcilePendingTransaction, set: setUpdateState };';
  vm.runInNewContext(compile(source), context);
  return { api: module.exports, localStorage, sessionStorage, navigations, emit: name => workerListeners.get(name)?.({ isUpdate: true }), latest: value => { latest = value; }, offline: value => { networkFailure = value; }, safe: value => { gateSafe = value; } };
}
const transactionKey = 'projed.pwa-update.transaction.v1';
await check('R11-quick-shell-starts-shared-update-lifecycle-after-reload-safety', () => {
  assert.ok(quickMain.includes('await installQuickReloadSafety(() => ({'));
  assert.ok(quickPwaLifecycle.includes('void reloadSafetyReady.then(async (ready) => {'));
  assert.ok(quickPwaLifecycle.indexOf('if (!ready)') < quickPwaLifecycle.indexOf("await import('../services/pwaUpdateService')"));
  assert.ok(quickPwaLifecycle.includes('setupPwaLifecycle();'));
  assert.ok(quickMain.includes('installQuickPwaLifecycle(installReloadSafety());'));
  assert.ok(!quickMain.includes("from '../services/pwaUpdateService'"));
});
await check('R01-failed-replay-preserves-original-reason-and-stops-background-apply', async () => {
  const f = serviceFixture();
  f.localStorage.setItem(transactionKey, JSON.stringify(makeFailed()));
  for (let i = 0; i < 3; i++) { f.api.fixture.reconcile(); await f.api.fixture.check(); }
  assert.equal(f.api.getPwaUpdateState().errorMessage, '先前啟用未完成。');
  assert.equal(f.api.getPwaUpdateState().errorCode, 'APPLY_FAILED');
  assert.equal(f.api.getPwaUpdateState().failureKind, 'update');
  assert.equal(f.navigations.length, 0);
  assert.equal(JSON.parse(f.localStorage.getItem(transactionKey)).errorCode, 'APPLY_FAILED');
});
await check('R01-old-v1-record-without-message-still-has-a-recovery-reason', async () => {
  const f = serviceFixture(), failed = makeFailed(); delete failed.errorMessage;
  f.localStorage.setItem(transactionKey, JSON.stringify(failed)); f.api.fixture.reconcile();
  assert.match(f.api.getPwaUpdateState().errorMessage, /重試/);
  assert.equal(tx.parsePwaUpdateTransaction(JSON.stringify(failed)).errorCode, 'APPLY_FAILED');
  assert.equal(tx.parsePwaUpdateTransaction(JSON.stringify({ ...failed, errorMessage: 'x'.repeat(1025) })), null);
});
await check('R03-same-version-retires-only-resolved-pwa-failure', async () => {
  const f = serviceFixture(); f.localStorage.setItem(transactionKey, JSON.stringify(makeFailed())); f.localStorage.setItem('business-draft', 'keep');
  f.latest('release:A'); f.api.fixture.reconcile(); await f.api.fixture.check();
  assert.equal(f.api.getPwaUpdateState().status, 'idle'); assert.equal(f.localStorage.getItem(transactionKey), null);
  assert.equal(f.localStorage.getItem('business-draft'), 'keep'); assert.equal(f.navigations.length, 0);
});
await check('R04-network-and-worker-check-failures-do-not-report-a-load-failure', async () => {
  const f = serviceFixture(); f.offline(true); f.api.setupPwaLifecycle();
  await new Promise(resolve => setImmediate(resolve)); await f.api.fixture.check();
  assert.equal(f.api.getPwaUpdateState().failureKind, null); assert.notEqual(f.api.getPwaUpdateState().status, 'failed');
  f.offline(false); f.latest('release:A'); await f.api.fixture.check(); assert.equal(f.api.getPwaUpdateState().status, 'idle');
});
await check('worker-waiting-and-activated-events-cannot-hide-genuine-failures', async () => {
  for (const failureKind of ['update', 'load', 'cache-recovery']) {
    const f = serviceFixture(); f.api.setupPwaLifecycle();
    if (failureKind === 'update') { f.localStorage.setItem(transactionKey, JSON.stringify(makeFailed())); f.api.fixture.reconcile(); }
    else f.api.fixture.set({ status: 'failed', failureKind, errorCode: 'FIXTURE', errorMessage: 'Keep real failure' });
    const message = f.api.getPwaUpdateState().errorMessage;
    for (const name of ['waiting', 'activated']) {
      f.emit(name); assert.equal(f.api.getPwaUpdateState().status, 'failed');
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.api.getPwaUpdateState().status, 'failed'); assert.equal(f.api.getPwaUpdateState().errorMessage, message);
    }
  }
});
await check('cross-tab-transaction-replay-cannot-hide-this-document-load-failure', () => {
  for (const failureKind of ['load', 'cache-recovery']) {
    const f = serviceFixture();
    f.api.fixture.set({ status: 'failed', failureKind, errorMessage: 'Keep this document failure' });
    for (const targetVersion of ['release:A', 'release:B']) {
      f.localStorage.setItem(transactionKey, JSON.stringify({ ...makeFailed(), targetVersion }));
      f.api.fixture.reconcile();
      assert.equal(f.api.getPwaUpdateState().failureKind, failureKind);
      assert.equal(f.api.getPwaUpdateState().errorMessage, 'Keep this document failure');
    }
  }
});
await check('R05-dirty-retry-and-load-recovery-cannot-navigate-or-clear-storage', async () => {
  const f = serviceFixture(); f.localStorage.setItem(transactionKey, JSON.stringify(makeFailed())); f.api.fixture.reconcile();
  assert.equal(await f.api.retryPwaUpdate(), false); assert.equal(f.api.getPwaUpdateState().status, 'failed');
  const before = f.localStorage.getItem(transactionKey); assert.equal(await f.api.clearPwaApplicationCacheAndReload(), false);
  assert.equal(f.localStorage.getItem(transactionKey), before); assert.equal(f.navigations.length, 0);
  f.api.handleRecoverableAppLoadError(new Error('injected chunk failure'));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.navigations.length, 0);
  f.latest('release:A'); await f.api.fixture.check(); assert.equal(f.api.getPwaUpdateState().failureKind, 'load');
});
await check('same-version-load-and-cache-failure-retry-reloads-instead-of-hiding-error', async () => {
  for (const failureKind of ['load', 'cache-recovery']) {
    const f = serviceFixture(); f.latest('release:A');
    f.api.fixture.set({ status: 'failed', failureKind, errorCode: 'FIXTURE', errorMessage: 'Needs real reload' });
    assert.equal(await f.api.retryPwaUpdate(), false); assert.equal(f.navigations.length, 0);
    assert.equal(f.api.getPwaUpdateState().failureKind, failureKind);
    f.safe(true); assert.equal(await f.api.retryPwaUpdate(), true);
    assert.equal(f.navigations.length, 1); assert.match(f.navigations[0], /projed_update_latest=/);
  }
});

const fixtureRoot = fs.mkdtempSync(path.join(output, 'asset-fixture-'));
function artifact(id, files, compatibility) {
  const dir = path.join(fixtureRoot, id), dist = path.join(dir, 'dist'); fs.mkdirSync(dist, { recursive: true });
  files = { 'release-meta.json': JSON.stringify({ releaseId: id, contractSha256: contractDigest() }), ...files };
  for (const [name, bytes] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dist, name)), { recursive: true }); fs.writeFileSync(path.join(dist, name), bytes); }
  const entries = Object.keys(files).sort((a, b) => path.join(dist, a).localeCompare(path.join(dist, b))).map(name => { const bytes = fs.readFileSync(path.join(dist, name)); return { path: name, size: bytes.length, sha256: sha256(bytes) }; });
  const manifest = { schemaVersion: 1, taskId: PRODUCTION_CONTRACT.taskId, releaseId: id, source: { dirty: false }, target: { projectId: PRODUCTION_CONTRACT.projectId, origin: PRODUCTION_CONTRACT.canonicalOrigin }, environment: { supabaseProjectRef: PRODUCTION_CONTRACT.supabaseProjectRef, redirectUrl: PRODUCTION_CONTRACT.canonicalRedirectUrl }, contractSha256: contractDigest(), artifact: { distDir: dist, entries, treeSha256: sha256(entries.map(entry => `${entry.path}\0${entry.size}\0${entry.sha256}`).join('\n')), ...(compatibility ? { compatibility } : {}) } };
  const manifestPath = path.join(dir, 'manifest.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest)); return { dist, manifest, manifestPath };
}
try {
  const old = artifact('old', { 'assets/main-old.js': 'old', 'assets/lazy-old.js': 'export default 1;', 'index.html': 'old HTML', 'sw.js': 'old worker' });
  await check('R07-one-previous-release-assets-retained-without-old-html-or-worker', () => {
    assert.equal(verifyManifest(old.manifestPath).ok, true);
    const next = artifact('next', { 'assets/main-next.js': 'next', 'index.html': 'new HTML', 'sw.js': 'new worker' });
    const provenance = retainPreviousAssets({ distDir: next.dist, previousManifestPath: old.manifestPath });
    assert.equal(provenance.sourceReleaseId, 'old'); assert.equal(provenance.entries.length, 2);
    assert.equal(fs.readFileSync(path.join(next.dist, 'assets/lazy-old.js'), 'utf8'), 'export default 1;');
    assert.equal(fs.readFileSync(path.join(next.dist, 'index.html'), 'utf8'), 'new HTML'); assert.equal(fs.readFileSync(path.join(next.dist, 'sw.js'), 'utf8'), 'new worker');
  });
  await check('R07-collision-tamper-and-file-manifest-tamper-rejected', () => {
    const collision = artifact('collision', { 'assets/main-old.js': 'collision' });
    assert.throws(() => retainPreviousAssets({ distDir: collision.dist, previousManifestPath: old.manifestPath }), /collision/);
    fs.writeFileSync(path.join(old.dist, 'assets/lazy-old.js'), 'tampered');
    assert.throws(() => retainPreviousAssets({ distDir: collision.dist, previousManifestPath: old.manifestPath }), /verification/);
    const malformed = artifact('malformed', { 'assets/main-malformed.js': 'malformed' });
    malformed.manifest.artifact.entries.push({ path: 'assets/../../outside.js', size: 1, sha256: 'x' }); fs.writeFileSync(malformed.manifestPath, JSON.stringify(malformed.manifest));
    assert.equal(verifyManifest(malformed.manifestPath).ok, false);
  });
  await check('R07-shared-current-assets-are-not-misclassified-as-inherited', () => {
    const previous = artifact('shared-old', { 'assets/shared.js': 'shared', 'assets/main-shared-old.js': 'shared-old' });
    const next = artifact('shared-next', { 'assets/shared.js': 'shared', 'assets/main-shared-next.js': 'shared-next' });
    const provenance = retainPreviousAssets({ distDir: next.dist, previousManifestPath: previous.manifestPath });
    assert.deepEqual(provenance.entries.map(entry => entry.path), ['assets/main-shared-old.js']);
    // shared.js belongs to the current build too. A later release must retain it
    // if that later build changes the vendor, rather than excluding it as inherited.
    const third = artifact('shared-third', { 'assets/main-shared-third.js': 'shared-third' });
    const boundPrevious = artifact('shared-bound', { 'assets/shared.js': 'shared', 'assets/main-shared-bound.js': 'shared-bound', 'assets/main-shared-old.js': 'shared-old' }, provenance);
    retainPreviousAssets({ distDir: third.dist, previousManifestPath: boundPrevious.manifestPath });
    assert.equal(fs.readFileSync(path.join(third.dist, 'assets/shared.js'), 'utf8'), 'shared');
  });
  await check('R07-destination-directory-link-cannot-escape-artifact', () => {
    const previous = artifact('link-old', { 'assets/main-link-old.js': 'link-old' });
    const next = artifact('link-next', { 'index.html': 'new HTML' });
    const outside = path.join(fixtureRoot, 'outside-destination'); fs.mkdirSync(outside);
    const link = path.join(next.dist, 'assets'); fs.symlinkSync(outside, link, 'junction');
    try { assert.throws(() => retainPreviousAssets({ distDir: next.dist, previousManifestPath: previous.manifestPath }), /directory escapes/); }
    finally { fs.unlinkSync(link); }
    assert.equal(fs.readdirSync(outside).length, 0);
  });
  await check('R07-retention-does-not-accumulate-earlier-generations', () => {
    const previous = artifact('previous', { 'assets/main-previous.js': 'previous', 'assets/inherited.js': 'inherited' }, { entries: [{ path: 'assets/inherited.js' }], schemaVersion: 1, sourceReleaseId: 'earlier', sourceTreeSha256: 'a'.repeat(64) });
    previous.manifest.artifact.compatibility.entries = previous.manifest.artifact.entries.filter(entry => entry.path === 'assets/inherited.js'); fs.writeFileSync(previous.manifestPath, JSON.stringify(previous.manifest));
    const next = artifact('bounded', { 'assets/main-bounded.js': 'bounded' });
    retainPreviousAssets({ distDir: next.dist, previousManifestPath: previous.manifestPath });
    assert.equal(fs.existsSync(path.join(next.dist, 'assets/main-previous.js')), true); assert.equal(fs.existsSync(path.join(next.dist, 'assets/inherited.js')), false);
  });
  await check('R07-shipping-build-requires-previous-binding-before-build', async () => {
    await assert.rejects(buildProductionArtifact({ parentEnv: {}, requirePreviousAssets: true }), /previous-manifest/);
    await assert.rejects(assertLiveAssetCompatibility({ artifact: {} }), /retain/);
    const manifest = { artifact: { compatibility: { sourceReleaseId: 'current' } } };
    await assertLiveAssetCompatibility(manifest, { fetchImpl: async () => ({ ok: true, json: async () => ({ schemaVersion: 1, releaseId: 'current' }) }) });
    await assert.rejects(assertLiveAssetCompatibility(manifest, { fetchImpl: async () => ({ ok: true, json: async () => ({ schemaVersion: 1, releaseId: 'other' }) }) }), /no longer matches/);
  });
  await check('R08-firebase-native-static-matcher-excludes-missing-assets', async () => {
    const require = createRequire(import.meta.url);
    // Superstatic's legacy glob-slash uses host filesystem separators for URL
    // paths. Hosting runs on POSIX; emulate that URL normalization in this
    // isolated process without modifying installed dependencies.
    require('glob-slash').normalize = value => path.posix.normalize(path.posix.join('/', value));
    const superstatic = require('superstatic').server;
    const dist = path.join(fixtureRoot, 'hosting'); fs.mkdirSync(path.join(dist, 'quick-task'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), 'MAIN'); fs.writeFileSync(path.join(dist, 'quick-task/index.html'), 'QUICK');
    const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8')).hosting;
    const runtime = { project: root, purpose: 'Firebase native static routing fixture', pid: process.pid, port: 0, cleanup: 'close in finally and verify refused connection' };
    fs.writeFileSync(path.join(output, 'routing-runtime.json'), JSON.stringify(runtime, null, 2));
    const server = superstatic({ cwd: root, config: { ...config, public: path.relative(root, dist) }, port: 0, hostname: '127.0.0.1' }).listen();
    await new Promise(resolve => server.once('listening', resolve)); const port = server.address().port;
    runtime.port = port;
    fs.writeFileSync(path.join(output, 'routing-runtime.json'), JSON.stringify(runtime, null, 2));
    try {
      assert.equal((await fetch(`http://127.0.0.1:${port}/assets/missing.js`)).status, 404);
      assert.equal(await (await fetch(`http://127.0.0.1:${port}/boards/example`)).text(), 'MAIN');
      assert.equal(await (await fetch(`http://127.0.0.1:${port}/quick-task/example`)).text(), 'QUICK');
    } finally { await new Promise(resolve => server.close(resolve)); }
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) }));
    runtime.closed = true;
    fs.writeFileSync(path.join(output, 'routing-runtime.json'), JSON.stringify(runtime, null, 2));
    results.push({ name: 'R08-runtime-cleanup', ok: true, ...runtime });
  });
} finally {
  if (fs.realpathSync(fixtureRoot).startsWith(fs.realpathSync(output) + path.sep)) fs.rmSync(fixtureRoot, { recursive: true });
  else results.push({ name: 'safe-fixture-cleanup', ok: false, error: 'Unsafe fixture cleanup path; preserved.' });
}
const report = { ok: results.every(result => result.ok), boundary: 'local service adapter + sealed artifact fixtures + Firebase static delivery; no production mutation', results };
fs.writeFileSync(path.join(output, 'recovery-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, pass: results.filter(result => result.ok).length, failed: results.filter(result => !result.ok) }, null, 2));
if (!report.ok) process.exitCode = 1;
