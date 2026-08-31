import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'output', 'playwright', 'dev-096', 'sw-integration-result.json');
const artifactIds = ['dev096-A', 'dev096-B', 'dev096-C'];
const artifacts = new Map();
const runtime = {
  project: root,
  purpose: 'DEV-096 real Service Worker A→B→C and B-waiting→C convergence',
  port: null,
  pid: process.pid,
  cleanupCondition: 'close Playwright session, temporary code file and HTTP server before exit',
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
});

const buildArtifacts = async () => {
  const { buildProductionArtifact } = await import('./release/build-production-artifact.mjs');
  for (const releaseId of artifactIds) {
    const releaseDir = path.join(root, 'output', 'release', 'dev-083', releaseId);
    const manifestPath = path.join(releaseDir, 'manifest.json');
    const reusable = process.env.DEV096_REUSE_ARTIFACTS === '1' && fs.existsSync(manifestPath);
    const result = reusable
      ? {
          releaseId,
          releaseDir,
          distDir: path.join(releaseDir, 'dist'),
          manifestPath,
          manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
        }
      : await buildProductionArtifact({ releaseId });
    artifacts.set(releaseId, result);
    const serviceWorker = fs.readFileSync(path.join(result.distDir, 'sw.js'), 'utf8');
    if (!serviceWorker.includes(`projed-${releaseId}`)) throw new Error(`SW cache namespace missing for ${releaseId}`);
    if (serviceWorker.includes('clientsClaim()') || serviceWorker.includes('cleanupOutdatedCaches()')) {
      throw new Error(`SW isolation flags regressed for ${releaseId}`);
    }
  }
};

const contentType = filePath => ({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}[path.extname(filePath).toLowerCase()] || 'application/octet-stream');

const createServer = async () => {
  let activeReleaseId = artifactIds[0];
  let metadataReleaseId = artifactIds[0];
  const switchHistory = [];
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/__dev096/switch') {
      const active = requestUrl.searchParams.get('release');
      const metadata = requestUrl.searchParams.get('metadata') || active;
      if (!artifacts.has(active) || !artifacts.has(metadata)) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'unknown release' }));
        return;
      }
      activeReleaseId = active;
      metadataReleaseId = metadata;
      switchHistory.push({ activeReleaseId: active, metadataReleaseId: metadata, at: new Date().toISOString() });
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, activeReleaseId, metadataReleaseId }));
      return;
    }
    if (requestUrl.pathname === '/__dev096/status') {
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, activeReleaseId, metadataReleaseId, switchHistory }));
      return;
    }
    const requested = decodeURIComponent(requestUrl.pathname.replace(/^\//, ''));
    const relativePath = requested && !requested.endsWith('/') ? requested : 'index.html';
    const servedReleaseId = relativePath === 'release-meta.json' ? metadataReleaseId : activeReleaseId;
    const artifact = artifacts.get(servedReleaseId);
    const candidate = path.resolve(artifact.distDir, relativePath);
    const safeRoot = path.resolve(artifact.distDir) + path.sep;
    const filePath = candidate.startsWith(safeRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(artifact.distDir, 'index.html');
    response.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': /(^|\/)(index\.html|release-meta\.json|sw\.js)$/.test(relativePath) ? 'no-store' : 'public, max-age=0, must-revalidate',
    });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  runtime.port = server.address().port;
  return { server, switchHistory };
};

const browserCode = baseUrl => `
async (page) => {
  const context = page.context();
  const diagnostics = [];
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(message + ': ' + JSON.stringify(details));
  };
  const attach = target => {
    target.on('pageerror', error => diagnostics.push({ type: 'pageerror', message: error.message }));
    target.on('console', message => {
      if (message.type() === 'error' || message.text().includes('[PWA]')) diagnostics.push({ type: 'console-' + message.type(), message: message.text() });
    });
    target.on('response', response => {
      if (response.status() >= 500) diagnostics.push({ type: 'http', status: response.status(), url: response.url() });
    });
  };
  attach(page);
  await context.addInitScript(() => {
    sessionStorage.setItem('__DEV096_LOAD_COUNT', String(Number(sessionStorage.getItem('__DEV096_LOAD_COUNT') || '0') + 1));
    window.__DEV096_SW_MESSAGES = JSON.parse(sessionStorage.getItem('__DEV096_SW_MESSAGES') || '[]');
    if (!window.__DEV096_STORAGE_HOOKED) {
      window.__DEV096_STORAGE_HOOKED = true;
      const transactionKey = 'projed.pwa-update.transaction.v1';
      const originalSetItem = Storage.prototype.setItem;
      const originalRemoveItem = Storage.prototype.removeItem;
      const record = (operation, value) => {
        const entries = JSON.parse(sessionStorage.getItem('__DEV096_TX_WRITES') || '[]');
        entries.push({ operation, value, at: Date.now() });
        sessionStorage.setItem('__DEV096_TX_WRITES', JSON.stringify(entries.slice(-120)));
      };
      Storage.prototype.setItem = function(key, value) {
        if (this === localStorage && key === transactionKey) record('set', value);
        return originalSetItem.call(this, key, value);
      };
      Storage.prototype.removeItem = function(key) {
        if (this === localStorage && key === transactionKey) record('remove', null);
        return originalRemoveItem.call(this, key);
      };
    }
    if (!window.__DEV096_SW_HOOKED) {
      window.__DEV096_SW_HOOKED = true;
      const originalPostMessage = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function(message, transfer) {
        window.__DEV096_SW_MESSAGES.push({ message, scriptURL: this.scriptURL, at: Date.now() });
        sessionStorage.setItem('__DEV096_SW_MESSAGES', JSON.stringify(window.__DEV096_SW_MESSAGES.slice(-30)));
        return originalPostMessage.call(this, message, transfer);
      };
    }
  });

  const readState = target => target.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const cacheResponse = await (await caches.open('dev096-business-data')).match('/__dev096/business-marker');
    const indexedDb = await new Promise(resolve => {
      const request = indexedDB.open('dev096-business-db');
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('markers')) { database.close(); resolve(null); return; }
        const read = database.transaction('markers', 'readonly').objectStore('markers').get('marker');
        read.onsuccess = () => { database.close(); resolve(read.result ?? null); };
        read.onerror = () => { database.close(); resolve(null); };
      };
      request.onerror = () => resolve(null);
    });
    return {
      current: sessionStorage.getItem('projed.pwa-update.current-version.v1'),
      completed: localStorage.getItem('projed.pwa-update.completed-version.v1'),
      transaction: JSON.parse(localStorage.getItem('projed.pwa-update.transaction.v1') || 'null'),
      reservation: JSON.parse(sessionStorage.getItem('projed.pwa-reload.reserved-target.v1') || 'null'),
      loadCount: Number(sessionStorage.getItem('__DEV096_LOAD_COUNT') || '0'),
      localMarker: localStorage.getItem('__DEV096_BUSINESS_LOCAL_MARKER'),
      sessionMarker: sessionStorage.getItem('__DEV096_BUSINESS_SESSION_MARKER'),
      cacheMarker: cacheResponse ? await cacheResponse.text() : null,
      indexedDb,
      promptCount: document.querySelectorAll('[data-pwa-update-prompt]').length,
      waiting: registration?.waiting?.scriptURL ?? null,
      active: registration?.active?.scriptURL ?? null,
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      cacheNames: await caches.keys(),
      transactionWrites: JSON.parse(sessionStorage.getItem('__DEV096_TX_WRITES') || '[]'),
      workerMessages: JSON.parse(sessionStorage.getItem('__DEV096_SW_MESSAGES') || '[]'),
    };
  });
  const waitForCurrent = async (target, releaseId) => {
    try {
      await target.waitForFunction(expected => sessionStorage.getItem('projed.pwa-update.current-version.v1') === 'release:' + expected, releaseId, { timeout: 60000 });
    } catch (error) {
      throw new Error('current did not converge to ' + releaseId + ': ' + JSON.stringify(await readState(target)) + '; ' + error.message);
    }
  };
  const setFixture = async (releaseId, metadataReleaseId = releaseId) => {
    const result = await page.evaluate(async value => {
      const response = await fetch('/__dev096/switch?release=' + encodeURIComponent(value.releaseId) + '&metadata=' + encodeURIComponent(value.metadataReleaseId));
      return { ok: response.ok, status: response.status };
    }, { releaseId, metadataReleaseId });
    assert(result.ok, 'fixture switch should succeed', { releaseId, metadataReleaseId, result });
  };
  const triggerUpdate = target => target.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error('service worker registration missing');
    await registration.update();
  }).catch(() => undefined);
  const transactionIdsFor = (states, releaseId) => [...new Set(states.flatMap(state => state.transactionWrites).flatMap(write => {
    if (write.operation !== 'set' || !write.value) return [];
    try {
      const parsed = JSON.parse(write.value);
      return parsed.targetVersion === 'release:' + releaseId && parsed.transactionId ? [parsed.transactionId] : [];
    } catch { return []; }
  }))];
  const skipWaitingCount = states => states.flatMap(state => state.workerMessages).filter(entry => JSON.stringify(entry.message).includes('SKIP_WAITING')).length;

  await page.goto('${baseUrl}/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
  await waitForCurrent(page, 'dev096-A');
  await page.evaluate(async () => {
    localStorage.setItem('__DEV096_BUSINESS_LOCAL_MARKER', 'keep-local');
    sessionStorage.setItem('__DEV096_BUSINESS_SESSION_MARKER', 'tab-a');
    const cache = await caches.open('dev096-business-data');
    await cache.put('/__dev096/business-marker', new Response('keep-cache'));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('dev096-business-db', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('markers');
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('markers', 'readwrite');
        transaction.objectStore('markers').put('keep-indexeddb', 'marker');
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  const secondPage = await context.newPage();
  attach(secondPage);
  await secondPage.goto('${baseUrl}/', { waitUntil: 'networkidle' });
  await secondPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
  await waitForCurrent(secondPage, 'dev096-A');
  await secondPage.evaluate(() => sessionStorage.setItem('__DEV096_BUSINESS_SESSION_MARKER', 'tab-b'));
  const pages = [page, secondPage];
  const initial = await Promise.all(pages.map(readState));

  const converge = async releaseId => {
    const before = await Promise.all(pages.map(readState));
    await setFixture(releaseId);
    await Promise.all(pages.map(triggerUpdate));
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const states = await Promise.all(pages.map(target => readState(target).catch(() => null)));
      if (states.some(state => state?.current === 'release:' + releaseId)) break;
      await page.waitForTimeout(100);
    }
    for (const target of pages) {
      const state = await readState(target);
      if (state.current !== 'release:' + releaseId) {
        await target.bringToFront();
        await target.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => undefined);
      }
    }
    await Promise.all(pages.map(target => waitForCurrent(target, releaseId)));
    const after = await Promise.all(pages.map(readState));
    const transactionIds = transactionIdsFor(after, releaseId);
    assert(transactionIds.length === 1, 'release should use one transaction identity', { releaseId, transactionIds });
    assert(skipWaitingCount(after) === (releaseId === 'dev096-B' ? 1 : 2), 'release should add one activation message', { releaseId, after });
    after.forEach((state, index) => {
      assert(state.current === 'release:' + releaseId && state.completed === 'release:' + releaseId, 'both tabs should reconcile target', { releaseId, index, state });
      assert(state.loadCount === before[index].loadCount + 1, 'each tab should navigate exactly once', { releaseId, index, before: before[index], after: state });
      assert(state.promptCount === 0 && state.reservation === null, 'safe convergence should be silent and clear reservation', { releaseId, index, state });
      assert(state.localMarker === 'keep-local' && state.cacheMarker === 'keep-cache' && state.indexedDb === 'keep-indexeddb', 'business storage should survive', { releaseId, index, state });
      assert(state.sessionMarker === (index === 0 ? 'tab-a' : 'tab-b'), 'session storage should survive', { releaseId, index, state });
    });
    return { releaseId, before, after, transactionIds };
  };

  const releaseB = await converge('dev096-B');
  const releaseC = await converge('dev096-C');
  await secondPage.close();
  await page.evaluate(async () => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('projed.pwa-update.')) localStorage.removeItem(key);
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('projed.pwa-') || key.startsWith('__DEV096_')) sessionStorage.removeItem(key);
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    for (const cacheName of await caches.keys()) await caches.delete(cacheName);
  });
  await setFixture('dev096-A');
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
  await waitForCurrent(page, 'dev096-A');
  const retargetBaseline = await readState(page);
  await setFixture('dev096-B', 'dev096-A');
  await triggerUpdate(page);
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const waitingB = await readState(page);
  assert(waitingB.current === 'release:dev096-A' && waitingB.loadCount === retargetBaseline.loadCount, 'B should remain waiting while metadata still points to A', { retargetBaseline, waitingB });
  await setFixture('dev096-C');
  await triggerUpdate(page);
  await waitForCurrent(page, 'dev096-C');
  const retargeted = await readState(page);
  const retargetTransactionIds = transactionIdsFor([retargeted], 'dev096-C');
  assert(retargeted.completed === 'release:dev096-C' && retargeted.loadCount === retargetBaseline.loadCount + 1, 'B waiting should retarget directly to C with one navigation', { retargetBaseline, retargeted });
  assert(retargetTransactionIds.length === 1 && skipWaitingCount([retargeted]) === 1, 'retarget should use one C transaction and one activation message', { retargetTransactionIds, retargeted });
  assert(retargeted.promptCount === 0, 'retarget safe path should remain silent', retargeted);
  assert(diagnostics.length === 0, 'real SW regression should have no browser errors', { diagnostics });
  await page.screenshot({ path: 'output/playwright/dev-096/real-sw-retargeted-c.png' });
  const artifact = { ok: true, source: 'dev-096-real-service-worker-convergence', initial, releases: [releaseB, releaseC], retarget: { baseline: retargetBaseline, waitingB, final: retargeted, transactionIds: retargetTransactionIds }, diagnostics };
  await page.evaluate(value => { window.__DEV096_SW_ARTIFACT = value; }, artifact);
  return JSON.stringify(artifact, null, 2);
}
`;

const runBrowser = async baseUrl => {
  const session = `dev096-sw-${Date.now()}`;
  const codePath = path.join(os.tmpdir(), `${session}.pw.js`);
  fs.writeFileSync(codePath, browserCode(baseUrl), 'utf8');
  const cliArgs = ['--yes', '--package', '@playwright/cli', 'playwright-cli'];
  try {
    const opened = await run('npx.cmd', [...cliArgs, '-s', session, 'open', `${baseUrl}/`], { cwd: root });
    if (opened.code !== 0) throw new Error(`Playwright open failed: ${opened.stderr || opened.stdout}`);
    const executed = await run('npx.cmd', [...cliArgs, '-s', session, 'run-code', `--filename=${codePath}`], { cwd: root });
    if (executed.code !== 0) throw new Error(`Playwright real SW verification failed: ${executed.stderr || executed.stdout}`);
    return `${executed.stdout}\n${executed.stderr}`;
  } finally {
    await run('npx.cmd', [...cliArgs, '-s', session, 'close'], { cwd: root }).catch(() => undefined);
    fs.rmSync(codePath, { force: true });
  }
};

const closeServer = server => new Promise(resolve => {
  if (!server.listening) return resolve();
  server.close(() => resolve());
});

const parsePlaywrightResult = output => {
  const match = output.match(/### Result\s*\n([\s\S]*?)(?=\n### Ran Playwright code|\n### Events|$)/);
  if (!match) return null;
  try { return JSON.parse(JSON.parse(match[1].trim())); } catch { return null; }
};

let server;
let artifact = {
  devId: 'DEV-096',
  generatedAt: new Date().toISOString(),
  sourceRevision: process.env.GITHUB_SHA || 'working-tree',
  command: 'npm.cmd run verify:dev-096-pwa-update-transaction-convergence-sw',
  fixture: 'immutable dev096-A/B/C artifacts + two tabs + controlled metadata retarget',
  ok: false,
  assertions: null,
  runtime,
};
try {
  await buildArtifacts();
  const running = await createServer();
  server = running.server;
  console.log(JSON.stringify({ event: 'runtime-started', ...runtime }));
  const browserOutput = await runBrowser(`http://127.0.0.1:${runtime.port}`);
  const assertions = parsePlaywrightResult(browserOutput);
  artifact = { ...artifact, ok: assertions?.ok === true, assertions, runtime: { ...runtime, portReleased: false } };
  console.log(browserOutput);
  if (!artifact.ok) throw new Error('DEV-096 real SW result was not parseable or did not pass.');
} catch (error) {
  artifact = { ...artifact, error: error instanceof Error ? error.message : String(error) };
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  if (server) await closeServer(server);
  artifact = { ...artifact, runtime: { ...runtime, portReleased: true } };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ event: 'runtime-cleanup', project: runtime.project, purpose: runtime.purpose, port: runtime.port, cleanupCondition: runtime.cleanupCondition, portReleased: true, artifact: outputPath }));
}
