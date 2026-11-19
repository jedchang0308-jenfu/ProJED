/* global document, indexedDB, caches */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PROJED_PLAYWRIGHT_MODULE || 'playwright');
const [oldDir, fixedDir] = process.argv.slice(2).map(p => path.resolve(p));
assert.ok(oldDir && fixedDir, 'Provide old and fixed built artifacts');
const output = path.resolve('output/playwright/installed-manifest-update');
fs.mkdirSync(output, { recursive: true });
let published = false;
let invalid = false;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const paths = ['/manifest.webmanifest', '/quick-task/manifest.webmanifest'];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  let file = path.join(published ? fixedDir : oldDir, relative);
  if (!fs.existsSync(file)) file = path.join(oldDir, relative);
  if (!file.startsWith(published ? fixedDir : oldDir) && !file.startsWith(oldDir) || !fs.existsSync(file)) return res.writeHead(404).end();
  let body = fs.readFileSync(file);
  if (paths.includes(pathname)) {
    if (invalid) body = Buffer.from('{"id":"/wrong-app/"}');
    else if (!published) body = Buffer.from(body.toString().replaceAll('ProJED-建待辦', 'ProJED-快速建任務').replace('standalone', 'minimal-ui'));
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
let browser;
const checks = [];
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const quick = await context.newPage();
  await quick.goto(origin + '/quick-task/');
  await quick.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  await quick.reload();
  await quick.waitForSelector('#quick-task-title');
  const cdp = await context.newCDPSession(quick);
  assert.equal(JSON.parse((await cdp.send('Page.getAppManifest')).data).display, 'minimal-ui');
  const other = await context.newPage();
  await other.goto(origin);
  await other.waitForSelector('#root');
  await quick.evaluate(() => {
    localStorage.setItem('manifest-regression-unsynced', 'preserve me');
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('manifest-regression-data', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('pending');
      open.onerror = reject;
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('pending', 'readwrite');
        tx.objectStore('pending').put('unsynced task', 'task');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  const before = await quick.evaluate(() => ({ adopted: localStorage.getItem('projed:pwa:adopted-version:v1'), tab: sessionStorage.getItem('projed:pwa:tab-version:v1'), shell: document.querySelector('meta[name="projed-shell-version"]')?.content }));
  let navigations = 0;
  for (const page of [quick, other]) page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  published = true;
  assert.equal(JSON.parse((await cdp.send('Page.getAppManifest')).data).display, 'minimal-ui', 'Existing browser still sees the old manifest');
  checks.push('Reproduced old cached minimal-ui despite new server manifest');
  await quick.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await quick.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting), null, { timeout: 45000 });
  await quick.waitForFunction(async () => (await (await fetch('/quick-task/manifest.webmanifest', { cache: 'no-store' })).json()).display === 'standalone', null, { timeout: 15000 });
  const after = await quick.evaluate(async () => ({
    adopted: localStorage.getItem('projed:pwa:adopted-version:v1'), tab: sessionStorage.getItem('projed:pwa:tab-version:v1'), shell: document.querySelector('meta[name="projed-shell-version"]')?.content,
    local: localStorage.getItem('manifest-regression-unsynced'),
    manifests: await Promise.all(['/manifest.webmanifest', '/quick-task/manifest.webmanifest'].map(async p => (await fetch(p, { cache: 'no-store' })).json())),
  }));
  fs.writeFileSync(path.join(output, 'cache-debug.json'), JSON.stringify({after, caches: await quick.evaluate(async () => {
    const result = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      result[name] = await Promise.all((await cache.keys()).filter(k => /manifest.webmanifest/.test(k.url)).map(async k => ({url:k.url, body: await (await cache.match(k)).text()})));
    }
    return result;
  })}, null, 2));
  assert.deepEqual({ adopted: after.adopted, tab: after.tab, shell: after.shell }, before);
  assert.equal(navigations, 0, 'Neither tab reloads');
  assert.equal(after.local, 'preserve me');
  for (const pathname of paths) assert.equal(await quick.evaluate(async p => (await (await caches.match(p, { ignoreSearch: true })).json()).display, pathname), 'standalone');
  checks.push('Waiting worker repairs both old active-worker manifest caches without activation/reload/adopting new app');
  assert.equal(await quick.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('manifest-regression-data');
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('pending'); const r = tx.objectStore('pending').get('task'); r.onsuccess = () => { resolve(r.result); db.close(); }; };
  })), 'unsynced task');
  checks.push('Local storage and unsynced IndexedDB record preserved');
  const next = await context.newPage();
  await next.goto(origin + '/quick-task/');
  await next.waitForSelector('#quick-task-title');
  const nextCdp = await context.newCDPSession(next);
  const readback = await nextCdp.send('Page.getAppManifest');
  assert.equal(JSON.parse(readback.data).display, 'standalone');
  assert.equal(JSON.parse(readback.data).name, 'ProJED-建待辦');
  assert.deepEqual(readback.errors, []);
  assert.equal(navigations, 0);
  checks.push('Browser native manifest reader sees standalone/new name on next normal launch');
  // Run installed repair directly for network failure / invalid response preservation.
  const { refreshInstalledManifestCaches } = await import('./pwa-manifest-cache-source.mjs');
  const repair = refreshInstalledManifestCaches.toString();
  const runRepair = () => context.serviceWorkers()[0].evaluate(async source => eval('(' + source + ')()'), repair);
  invalid = true;
  await runRepair();
  invalid = false;
  await context.setOffline(true);
  await runRepair();
  assert.equal(await quick.evaluate(async () => (await (await caches.match('/quick-task/manifest.webmanifest', { ignoreSearch: true })).json()).display), 'standalone');
  await context.setOffline(false);
  checks.push('Invalid/offline install metadata leaves existing valid cache intact');
  // Allow the new worker to activate after closing clients, then test its live route.
  await Promise.all([quick.close(), other.close(), next.close()]);
  const fresh = await context.newPage();
  await fresh.goto(origin + '/quick-task/');
  await fresh.waitForSelector('#quick-task-title');
  await fresh.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration())?.waiting);
  for (const pathname of paths) {
    // Legacy entries are allowed; current worker's precache must exclude canonical identities.
    assert.ok(!fs.readFileSync(path.join(fixedDir, 'sw.js'), 'utf8').includes('url:"' + pathname.slice(1) + '",revision:'), pathname);
  }
  await context.setOffline(true);
  assert.equal(await fresh.evaluate(async () => (await (await fetch('/quick-task/manifest.webmanifest')).json()).display), 'standalone');
  checks.push('New worker excludes canonical manifests from precache and retains offline identity');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ok: true, oldDir, fixedDir, checks, before, after, readback }, null, 2));
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ checks, error: error.stack }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await new Promise(r => server.close(r));
}
