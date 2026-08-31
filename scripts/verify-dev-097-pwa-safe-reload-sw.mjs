import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'output', 'playwright', 'dev-097', 'sw-integration-result.json');
const artifactIds = ['dev097-A', 'dev097-B', 'dev097-C'];
const artifacts = new Map();
const runtime = {
  project: root,
  purpose: 'DEV-097 real Service Worker two-tab N→N+1→N+2 convergence and cache isolation',
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
    const reusable = process.env.DEV097_REUSE_ARTIFACTS === '1' && fs.existsSync(manifestPath);
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
  const switchHistory = [];
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/__dev097/switch') {
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
    if (requestUrl.pathname === '/__dev097/status') {
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
  const attachDiagnostics = target => {
    target.on('pageerror', error => diagnostics.push({ type: 'pageerror', message: error.message }));
    target.on('console', message => {
      if (message.type() === 'error' || message.text().includes('[PWA]')) {
        diagnostics.push({ type: 'console-' + message.type(), message: message.text() });
      }
    });
    target.on('response', response => {
      if (response.status() >= 500) diagnostics.push({ type: 'http', status: response.status(), url: response.url() });
    });
  };
  attachDiagnostics(page);
  await context.addInitScript(() => {
    const loadCount = Number(sessionStorage.getItem('__DEV097_LOAD_COUNT') || '0') + 1;
    sessionStorage.setItem('__DEV097_LOAD_COUNT', String(loadCount));
    window.__DEV097_SW_EVENTS = JSON.parse(sessionStorage.getItem('__DEV097_SW_EVENTS') || '[]');
    window.__DEV097_SW_MESSAGES = JSON.parse(sessionStorage.getItem('__DEV097_SW_MESSAGES') || '[]');
    window.__DEV097_UPDATE_STATES = JSON.parse(sessionStorage.getItem('__DEV097_UPDATE_STATES') || '[]');
    window.addEventListener('projed:pwa-update-state', event => {
      const detail = event.detail || {};
      window.__DEV097_UPDATE_STATES.push({
        status: detail.status,
        currentVersion: detail.currentVersion,
        latestVersion: detail.latestVersion,
        targetVersion: detail.targetVersion,
        transactionId: detail.transactionId,
        normalReloadReserved: detail.normalReloadReserved,
        reloadSafetyState: detail.reloadSafetyState,
        reloadSafetyCode: detail.reloadSafetyCode,
        errorMessage: detail.errorMessage,
        at: Date.now(),
      });
      sessionStorage.setItem('__DEV097_UPDATE_STATES', JSON.stringify(window.__DEV097_UPDATE_STATES.slice(-80)));
    });
    if (!window.__DEV097_STORAGE_HOOKED) {
      window.__DEV097_STORAGE_HOOKED = true;
      const transactionKey = 'projed.pwa-update.transaction.v1';
      const originalSetItem = Storage.prototype.setItem;
      const originalRemoveItem = Storage.prototype.removeItem;
      const record = (operation, value) => {
        const entries = JSON.parse(sessionStorage.getItem('__DEV097_TX_WRITES') || '[]');
        entries.push({ operation, value, at: Date.now() });
        sessionStorage.setItem('__DEV097_TX_WRITES', JSON.stringify(entries.slice(-80)));
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
    if (!window.__DEV097_SW_HOOKED) {
      window.__DEV097_SW_HOOKED = true;
      const originalPostMessage = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function(message, transfer) {
        window.__DEV097_SW_MESSAGES.push({ message, scriptURL: this.scriptURL, at: Date.now() });
        sessionStorage.setItem('__DEV097_SW_MESSAGES', JSON.stringify(window.__DEV097_SW_MESSAGES.slice(-20)));
        return originalPostMessage.call(this, message, transfer);
      };
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.__DEV097_SW_EVENTS.push({ type: 'controllerchange', at: Date.now() });
        sessionStorage.setItem('__DEV097_SW_EVENTS', JSON.stringify(window.__DEV097_SW_EVENTS.slice(-20)));
      });
    }
  });

  const readState = async target => target.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const cache = await caches.open('dev097-business-data');
    return {
      href: location.href,
      current: sessionStorage.getItem('projed.pwa-update.current-version.v1'),
      completed: localStorage.getItem('projed.pwa-update.completed-version.v1'),
      transaction: JSON.parse(localStorage.getItem('projed.pwa-update.transaction.v1') || 'null'),
      reservation: JSON.parse(sessionStorage.getItem('projed.pwa-reload.reserved-target.v1') || 'null'),
      loadCount: Number(sessionStorage.getItem('__DEV097_LOAD_COUNT') || '0'),
      sessionMarker: sessionStorage.getItem('__DEV097_BUSINESS_SESSION'),
      localMarker: localStorage.getItem('__DEV097_BUSINESS_LOCAL'),
      cacheMarker: await cache.match('/__dev097/business-marker').then(response => response?.text() ?? null),
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      active: registration?.active?.scriptURL ?? null,
      waiting: registration?.waiting?.scriptURL ?? null,
      promptCount: document.querySelectorAll('[data-pwa-update-prompt]').length,
      transactionWrites: JSON.parse(sessionStorage.getItem('__DEV097_TX_WRITES') || '[]'),
      workerMessages: window.__DEV097_SW_MESSAGES || [],
      workerEvents: window.__DEV097_SW_EVENTS || [],
      updateStates: window.__DEV097_UPDATE_STATES || [],
      cacheNames: await caches.keys(),
    };
  });
  const waitForCurrent = async (target, releaseId) => {
    try {
      await target.waitForFunction(expected => sessionStorage.getItem('projed.pwa-update.current-version.v1') === 'release:' + expected, releaseId, { timeout: 60000 });
    } catch (error) {
      throw new Error('release did not converge to ' + releaseId + ': ' + JSON.stringify(await readState(target)) + '; diagnostics=' + JSON.stringify(diagnostics) + '; ' + error.message);
    }
  };
  const switchRelease = async releaseId => {
    const result = await page.evaluate(async id => {
      const response = await fetch('/__dev097/switch?release=' + encodeURIComponent(id));
      return { ok: response.ok, status: response.status };
    }, releaseId);
    assert(result.ok, 'fixture switch should succeed', { releaseId, result });
  };
  const triggerUpdate = async target => {
    await target.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('service worker registration missing');
      await registration.update();
    }).catch(() => undefined);
  };
  const transactionIdsFor = (states, releaseId) => {
    const ids = [];
    for (const state of states) {
      for (const write of state.transactionWrites) {
        if (write.operation !== 'set' || !write.value) continue;
        try {
          const parsed = JSON.parse(write.value);
          if (parsed.targetVersion === 'release:' + releaseId && parsed.transactionId) ids.push(parsed.transactionId);
        } catch {}
      }
    }
    return [...new Set(ids)];
  };
  const skipWaitingCount = states => states.flatMap(state => state.workerMessages)
    .filter(entry => JSON.stringify(entry.message).includes('SKIP_WAITING')).length;

  await page.goto('${baseUrl}/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
  await waitForCurrent(page, 'dev097-A');
  await page.evaluate(async () => {
    localStorage.setItem('__DEV097_BUSINESS_LOCAL', 'keep-local');
    sessionStorage.setItem('__DEV097_BUSINESS_SESSION', 'tab-a');
    const cache = await caches.open('dev097-business-data');
    await cache.put('/__dev097/business-marker', new Response('keep-cache'));
  });
  const secondPage = await context.newPage();
  attachDiagnostics(secondPage);
  await secondPage.goto('${baseUrl}/', { waitUntil: 'networkidle' });
  await secondPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
  await waitForCurrent(secondPage, 'dev097-A');
  await secondPage.evaluate(() => sessionStorage.setItem('__DEV097_BUSINESS_SESSION', 'tab-b'));
  const pages = [page, secondPage];
  const initial = await Promise.all(pages.map(readState));

  const converge = async releaseId => {
    const before = await Promise.all(pages.map(readState));
    await switchRelease(releaseId);
    await Promise.all(pages.map(triggerUpdate));
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const states = await Promise.all(pages.map(target => readState(target).catch(() => null)));
      if (states.some(state => state?.current === 'release:' + releaseId)) break;
      await page.waitForTimeout(100);
    }
    let mid = await Promise.all(pages.map(readState));
    for (let index = 0; index < pages.length; index += 1) {
      if (mid[index].current === 'release:' + releaseId) continue;
      await pages[index].bringToFront();
      await pages[index].evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => undefined);
    }
    const convergence = await Promise.allSettled(pages.map(target => waitForCurrent(target, releaseId)));
    if (convergence.some(result => result.status === 'rejected')) {
      throw new Error('two-tab convergence failed for ' + releaseId + ': results=' + JSON.stringify(convergence) + '; states=' + JSON.stringify(await Promise.all(pages.map(readState))) + '; diagnostics=' + JSON.stringify(diagnostics));
    }
    const after = await Promise.all(pages.map(readState));
    const transactionIds = transactionIdsFor(after, releaseId);
    assert(transactionIds.length === 1, 'one release should have exactly one global transaction', { releaseId, transactionIds, before, mid, after });
    assert(skipWaitingCount(after) === (releaseId === 'dev097-B' ? 1 : 2), 'each release should add exactly one SKIP_WAITING message', { releaseId, after });
    after.forEach((state, index) => {
      assert(state.current === 'release:' + releaseId && state.completed === 'release:' + releaseId, 'both tabs should converge and reconcile completion', { releaseId, index, state });
      assert(state.loadCount === before[index].loadCount + 1, 'each tab should perform exactly one application navigation per release', { releaseId, index, before: before[index], after: state });
      assert(state.promptCount === 0, 'safe path must remain silent', { releaseId, index, state });
      assert(state.reservation === null, 'successful reload must clear local reservation', { releaseId, index, state });
    });
    return { releaseId, before, mid, after, transactionIds };
  };

  const releaseB = await converge('dev097-B');
  const releaseC = await converge('dev097-C');
  const finalStates = await Promise.all(pages.map(readState));
  finalStates.forEach((state, index) => {
    assert(state.localMarker === 'keep-local' && state.cacheMarker === 'keep-cache', 'business local/cache data must survive updates', { index, state });
    assert(state.sessionMarker === (index === 0 ? 'tab-a' : 'tab-b'), 'per-tab session data must survive updates', { index, state });
    for (const releaseId of ['dev097-A', 'dev097-B', 'dev097-C']) {
      assert(state.cacheNames.some(name => name.includes('projed-' + releaseId)), 'release-scoped cache must remain available', { index, releaseId, cacheNames: state.cacheNames });
    }
  });
  assert(diagnostics.length === 0, 'real SW flow must have no visible/browser errors', { diagnostics });
  await page.screenshot({ path: 'output/playwright/dev-097/real-sw-final-c.png' });
  const artifact = {
    ok: true,
    source: 'dev-097-real-service-worker-two-tab-convergence',
    initial,
    releases: [releaseB, releaseC],
    finalStates,
    diagnostics,
  };
  await page.evaluate(value => { window.__DEV097_SW_ARTIFACT = value; }, artifact);
  await secondPage.close();
  return JSON.stringify(artifact, null, 2);
}
`;

const runBrowser = async baseUrl => {
  const session = `dev097-sw-${Date.now()}`;
  const codePath = path.join(os.tmpdir(), `${session}.pw.js`);
  fs.writeFileSync(codePath, browserCode(baseUrl), 'utf8');
  const cliArgs = ['--yes', '--package', '@playwright/cli', 'playwright-cli'];
  try {
    const opened = await run('npx.cmd', [...cliArgs, '-s', session, 'open', `${baseUrl}/`], { cwd: root });
    if (opened.code !== 0) throw new Error(`Playwright open failed: ${opened.stderr || opened.stdout}`);
    const executed = await run('npx.cmd', [...cliArgs, '-s', session, 'run-code', `--filename=${codePath}`], { cwd: root });
    if (executed.code !== 0) throw new Error(`DEV-097 SW verification failed: ${executed.stderr || executed.stdout}`);
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
  try {
    return JSON.parse(JSON.parse(match[1].trim()));
  } catch {
    return null;
  }
};

let server;
let artifact = {
  devId: 'DEV-097',
  generatedAt: new Date().toISOString(),
  sourceRevision: process.env.GITHUB_SHA || 'working-tree',
  command: 'npm.cmd run verify:dev-097-pwa-safe-reload-sw',
  fixture: 'immutable dev097-A/dev097-B/dev097-C production artifacts + two controlled documents + real Service Worker activation',
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
  if (!artifact.ok) throw new Error('DEV-097 SW browser result was not parseable or did not pass.');
  console.log(JSON.stringify({ ok: true, runtime: { ...runtime, portReleased: false } }));
} catch (error) {
  artifact = {
    ...artifact,
    error: error instanceof Error ? error.message : String(error),
  };
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  if (server) await closeServer(server);
  artifact = {
    ...artifact,
    runtime: { ...runtime, portReleased: true },
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ event: 'runtime-cleanup', project: runtime.project, purpose: runtime.purpose, port: runtime.port, cleanupCondition: runtime.cleanupCondition, portReleased: true, artifact: outputPath }));
}
