import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr, pid: child.pid }));
});

const buildArtifacts = async () => {
  const { buildProductionArtifact } = await import('./release/build-production-artifact.mjs');
  for (const releaseId of artifactIds) {
    const result = await buildProductionArtifact({ releaseId });
    artifacts.set(releaseId, { releaseId, distDir: result.distDir, manifestPath: result.manifestPath });
  }
};

const contentType = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  })[extension] || 'application/octet-stream';
};

const createServer = async () => {
  let activeReleaseId = artifactIds[0];
  const switchHistory = [];
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/__dev096/switch') {
      const next = requestUrl.searchParams.get('release');
      if (!artifacts.has(next)) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'unknown release' }));
        return;
      }
      activeReleaseId = next;
      switchHistory.push({ releaseId: next, at: new Date().toISOString() });
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, releaseId: next }));
      return;
    }
    if (requestUrl.pathname === '/__dev096/status') {
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, activeReleaseId, switchHistory }));
      return;
    }

    const artifact = artifacts.get(activeReleaseId);
    const requested = decodeURIComponent(requestUrl.pathname.replace(/^\//, ''));
    const relativePath = requested && !requested.endsWith('/') ? requested : 'index.html';
    const candidate = path.resolve(artifact.distDir, relativePath);
    const safeRoot = path.resolve(artifact.distDir) + path.sep;
    const filePath = candidate.startsWith(safeRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(artifact.distDir, 'index.html');
    const headers = {
      'Content-Type': contentType(filePath),
      'Cache-Control': /(^|\/)(index\.html|release-meta\.json|sw\.js)$/.test(relativePath) ? 'no-store' : 'public, max-age=0, must-revalidate',
    };
    response.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  runtime.port = server.address().port;
  return { server, switchHistory };
};

const browserCode = (baseUrl) => `
async (page) => {
  const observations = [];
  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(message + ': ' + JSON.stringify(details));
  };
  const switchRelease = async (releaseId) => {
    const response = await page.evaluate(async (id) => {
      const result = await fetch('/__dev096/switch?release=' + encodeURIComponent(id));
      return { ok: result.ok, status: result.status };
    }, releaseId);
    assert(response.ok, 'fixture release switch should succeed', { releaseId, status: response.status });
  };
  const waitForCurrent = async (releaseId, targetPage = page) => {
    try {
      await targetPage.waitForFunction((expected) => localStorage.getItem('projed.pwa-update.current-version.v1') === 'release:' + expected, releaseId, { timeout: 30000 });
    } catch (error) {
      const diagnostic = await targetPage.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return {
          href: window.location.href,
          current: localStorage.getItem('projed.pwa-update.current-version.v1'),
          transaction: localStorage.getItem('projed.pwa-update.transaction.v1'),
          completed: localStorage.getItem('projed.pwa-update.completed-version.v1'),
          controller: navigator.serviceWorker.controller?.scriptURL ?? null,
          registration: {
            installing: registration?.installing?.state ?? null,
            waiting: registration?.waiting?.state ?? null,
            active: registration?.active?.state ?? null,
          },
          activationMessages: window.__DEV096_ACTIVATION_MESSAGES ?? [],
          serviceWorkerEvents: window.__DEV096_SW_EVENTS ?? [],
          transactionWrites: JSON.parse(sessionStorage.getItem('__DEV096_TX_WRITES') || '[]'),
          prompt: document.querySelector('[data-pwa-update-prompt]')?.textContent ?? null,
        };
      });
      throw new Error('current version did not converge to ' + releaseId + ': ' + JSON.stringify(diagnostic) + '; ' + (error instanceof Error ? error.message : error));
    }
    const current = await targetPage.evaluate(() => localStorage.getItem('projed.pwa-update.current-version.v1'));
    assert(current === 'release:' + releaseId, 'startup should record the loaded release', { expected: releaseId, current });
  };
  const waitForUpdatePrompt = async (targetPage = page) => {
    await targetPage.locator('[data-pwa-update-prompt]').waitFor({ state: 'visible', timeout: 30000 });
    const text = await targetPage.locator('[data-pwa-update-prompt]').innerText();
    assert(text.includes('一鍵更新') && !text.includes('一鍵更新到最新版'), 'real SW prompt should use compact CTA', { text });
  };
  const registration = async (targetPage = page) => targetPage.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error('service worker registration missing');
    await registration.update();
    return { waiting: Boolean(registration.waiting), installing: Boolean(registration.installing), controller: Boolean(navigator.serviceWorker.controller) };
  });
  const waitForWaitingWorker = async (targetPage = page) => {
    return targetPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !registration?.waiting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return { waiting: Boolean(registration?.waiting), installing: Boolean(registration?.installing), controller: Boolean(navigator.serviceWorker.controller) };
    });
  };

  await page.addInitScript(() => {
    window.__DEV096_ACTIVATION_MESSAGES = [];
    window.__DEV096_SW_EVENTS = [];
    if (!window.__DEV096_STORAGE_HOOKED) {
      window.__DEV096_STORAGE_HOOKED = true;
      const transactionKey = 'projed.pwa-update.transaction.v1';
      const originalSetItem = Storage.prototype.setItem;
      const originalRemoveItem = Storage.prototype.removeItem;
      const record = (operation, value) => {
        const entries = JSON.parse(sessionStorage.getItem('__DEV096_TX_WRITES') || '[]');
        entries.push({ operation, value, current: localStorage.getItem('projed.pwa-update.current-version.v1'), at: Date.now() });
        sessionStorage.setItem('__DEV096_TX_WRITES', JSON.stringify(entries.slice(-40)));
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
    const originalPostMessage = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function(message, transfer) {
      window.__DEV096_ACTIVATION_MESSAGES.push({ message, url: this.scriptURL });
      return originalPostMessage.call(this, message, transfer);
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.__DEV096_SW_EVENTS.push({ type: 'controllerchange', at: Date.now() });
    });
  });
  await page.goto('${baseUrl}/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller) || Boolean(navigator.serviceWorker.ready), null, { timeout: 30000 });
  await waitForCurrent('dev096-A');
  await page.evaluate(async () => {
    localStorage.setItem('__DEV096_BUSINESS_LOCAL_MARKER', 'keep-local');
    sessionStorage.setItem('__DEV096_BUSINESS_SESSION_MARKER', 'keep-session');
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
  observations.push({ step: 'initial-A', current: await page.evaluate(() => localStorage.getItem('projed.pwa-update.current-version.v1')) });

  const secondPage = await page.context().newPage();
  await secondPage.goto('${baseUrl}/', { waitUntil: 'networkidle' });
  await waitForCurrent('dev096-A', secondPage);
  await switchRelease('dev096-B');
  const [bRegistration, secondRegistration] = await Promise.all([registration(), registration(secondPage)]);
  const [bWaiting, secondWaiting] = await Promise.all([
    bRegistration.waiting ? Promise.resolve(bRegistration) : waitForWaitingWorker(),
    secondRegistration.waiting ? Promise.resolve(secondRegistration) : waitForWaitingWorker(secondPage),
  ]);
  assert(bWaiting.waiting && secondWaiting.waiting, 'B should be waiting in both tabs before user applies update', { first: bWaiting, second: secondWaiting });
  await Promise.all([waitForUpdatePrompt(), waitForUpdatePrompt(secondPage)]);
  const transactionIdsBeforeApply = await Promise.all([
    page.evaluate(() => JSON.parse(localStorage.getItem('projed.pwa-update.transaction.v1') || 'null')?.transactionId),
    secondPage.evaluate(() => JSON.parse(localStorage.getItem('projed.pwa-update.transaction.v1') || 'null')?.transactionId),
  ]);
  assert(transactionIdsBeforeApply[0] && transactionIdsBeforeApply[0] === transactionIdsBeforeApply[1], 'both tabs should share one transaction before apply', { transactionIdsBeforeApply });
  await page.screenshot({ path: 'output/playwright/dev-096/real-sw-a-to-b-before-apply.png' });
  await Promise.all([
    page.locator('[data-pwa-update-action]').click(),
    secondPage.locator('[data-pwa-update-action]').click(),
  ]);
  await Promise.all([waitForCurrent('dev096-B'), waitForCurrent('dev096-B', secondPage)]);
  const completedB = await page.evaluate(() => localStorage.getItem('projed.pwa-update.completed-version.v1'));
  assert(completedB === 'release:dev096-B', 'A→B should complete only after post-reload version reconciliation', { completedB });
  assert(await secondPage.evaluate(() => localStorage.getItem('projed.pwa-update.completed-version.v1')) === 'release:dev096-B', 'both tabs should reconcile completed B');
  await Promise.all([page.waitForTimeout(1000), secondPage.waitForTimeout(1000)]);
  assert(await page.locator('[data-pwa-update-prompt]').count() === 0, 'completed B should not show the same update prompt again');
  assert(await secondPage.locator('[data-pwa-update-prompt]').count() === 0, 'completed B should hide the prompt in the second tab');
  const safetyReadback = await page.evaluate(async () => {
    const cacheResponse = await (await caches.open('dev096-business-data')).match('/__dev096/business-marker');
    const databaseValue = await new Promise((resolve) => {
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
      local: localStorage.getItem('__DEV096_BUSINESS_LOCAL_MARKER'),
      session: sessionStorage.getItem('__DEV096_BUSINESS_SESSION_MARKER'),
      cache: cacheResponse ? await cacheResponse.text() : null,
      indexeddb: databaseValue,
    };
  });
  assert(safetyReadback.local === 'keep-local' && safetyReadback.session === 'keep-session' && safetyReadback.cache === 'keep-cache' && safetyReadback.indexeddb === 'keep-indexeddb', 'normal update should preserve business storage markers', safetyReadback);
  observations.push({ step: 'business-storage-preserved', safetyReadback });
  observations.push({ step: 'completed-B-multitab', current: completedB, sharedTransactionId: transactionIdsBeforeApply[0] });
  await secondPage.close();

  await switchRelease('dev096-C');
  const cRegistration = await registration();
  const cWaiting = cRegistration.waiting ? cRegistration : await waitForWaitingWorker();
  assert(cWaiting.waiting, 'C should be waiting after B→C publication', cWaiting);
  await waitForUpdatePrompt();
  await page.locator('[data-pwa-update-action]').click();
  await waitForCurrent('dev096-C');
  const completedC = await page.evaluate(() => localStorage.getItem('projed.pwa-update.completed-version.v1'));
  assert(completedC === 'release:dev096-C', 'B→C should converge to C', { completedC });
  observations.push({ step: 'completed-C', current: completedC });

  await page.evaluate(async () => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('projed.pwa-update.')) localStorage.removeItem(key);
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    for (const cacheName of await caches.keys()) await caches.delete(cacheName);
  });
  await switchRelease('dev096-A');
  await page.reload({ waitUntil: 'networkidle' });
  await waitForCurrent('dev096-A');
  await switchRelease('dev096-B');
  const waitingB = await registration();
  const bWaitingForRetarget = waitingB.waiting ? waitingB : await waitForWaitingWorker();
  assert(bWaitingForRetarget.waiting, 'B should be waiting in retarget fixture', bWaitingForRetarget);
  await waitForUpdatePrompt();
  await switchRelease('dev096-C');
  await page.locator('[data-pwa-update-action]').click();
  await waitForCurrent('dev096-C');
  const retargetedCompleted = await page.evaluate(() => localStorage.getItem('projed.pwa-update.completed-version.v1'));
  assert(retargetedCompleted === 'release:dev096-C', 'B waiting followed by C publication should retarget before activation', { retargetedCompleted });
  observations.push({ step: 'retargeted-B-to-C', current: retargetedCompleted });
  await page.screenshot({ path: 'output/playwright/dev-096/real-sw-retargeted-c.png' });

  const artifact = {
    ok: true,
    source: 'dev-096-real-service-worker-fixture',
    baseUrl: '${baseUrl}',
    artifacts: ['dev096-A', 'dev096-B', 'dev096-C'],
    observations,
    finalCurrent: await page.evaluate(() => localStorage.getItem('projed.pwa-update.current-version.v1')),
  };
  await page.evaluate((value) => { window.__DEV096_SW_ARTIFACT = value; }, artifact);
  return JSON.stringify(artifact, null, 2);
}
`;

const runBrowser = async (baseUrl) => {
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

const closeServer = (server) => new Promise((resolve) => {
  if (!server.listening) return resolve();
  server.close(() => resolve());
});

let server;
try {
  await buildArtifacts();
  const running = await createServer();
  server = running.server;
  console.log(JSON.stringify({ event: 'runtime-started', ...runtime }));
  const output = await runBrowser(`http://127.0.0.1:${runtime.port}`);
  console.log(output);
  const result = await fetch(`http://127.0.0.1:${runtime.port}/__dev096/status`).then((response) => response.json());
  console.log(JSON.stringify({ event: 'fixture-status', result }));
  console.log(JSON.stringify({ ok: true, runtime: { ...runtime, portReleased: false } }));
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  if (server) await closeServer(server);
  console.log(JSON.stringify({ event: 'runtime-cleanup', project: runtime.project, purpose: runtime.purpose, port: runtime.port, cleanupCondition: runtime.cleanupCondition, portReleased: true }));
}
