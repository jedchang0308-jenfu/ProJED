/* global document, window */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { retainVersionHistory } from './release/version-retention.mjs';
import { verifyQuickUpgradeSources, runQuickBackendUpgrade } from './lib/dev139-quick-backend-upgrade.mjs';
import { createQuickUpgradeApiProxy } from './lib/dev139-quick-upgrade-proxy.mjs';

// Actual app bundles, shared Workbox worker, and one disposable browser profile.
// A built local-data mode exercises the real updater without contacting production.
const require = createRequire(import.meta.url);
const cliPlaywright = (process.env.PATH || '').split(path.delimiter)
  .filter(dir => path.basename(dir) === '.bin')
  .map(dir => path.resolve(dir, '..', 'playwright'))
  .find(dir => fs.existsSync(path.join(dir, 'package.json')));
const { chromium } = require(process.env.PROJED_PLAYWRIGHT_MODULE || cliPlaywright || 'playwright');
const artifactArgument = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const reused = artifactArgument ? path.resolve(artifactArgument) : null;
const singleButtonOnly = process.argv.includes('--single-button');
const backendUpgradeOnly = process.argv.includes('--quick-backend-upgrade');
const legacySourceRoot = process.argv.find(value => value.startsWith('--legacy-source-root='))?.split('=').slice(1).join('=');
const run = reused ? path.basename(reused) : 'dev141-' + randomUUID().slice(0, 8);
const output = path.resolve('output/playwright/dev-141', reused ? run + '-recheck-' + randomUUID().slice(0, 8) : run);
const envDir = path.join(output, 'env');
fs.mkdirSync(envDir, { recursive: true });
const artifacts = {};
const history = [];
const checks = [];
const diagnostics = [];
const record = (id, evidence) => {
  checks.push({ id, ...evidence });
  console.log(id + ' PASS');
};
const resultFile = path.join(output, 'result.json');
const version = name => 'release:' + run + '-' + name;
let active = 'A';
let unavailableVersion = null;
let context;
let server;
let upgradeApiProxy;
const MIME = {
  '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const state = page => page.evaluate(() => ({
  version: document.querySelector('meta[name="projed-shell-version"]')?.content,
  confirmed: Boolean(window.__PROJED_VERSION_BOOT__?.confirmed),
  adopted: localStorage.getItem('projed:pwa:adopted-version:v1'),
}));
const loaded = (page, name) => page.waitForFunction(expected =>
  document.querySelector('meta[name="projed-shell-version"]')?.content === expected
    && window.__PROJED_VERSION_BOOT__?.confirmed, version(name), { timeout: 25000 });
const openMenu = (page, quick = false) =>
  page.locator(quick ? '[data-quick-install-menu] summary' : '[data-app-more-menu] > summary').click();
const workerVersion = (page, expected, slot = 'active') => page.evaluate(async ({ expected, slot }) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const worker = slot === 'controller' ? navigator.serviceWorker.controller : registration?.[slot];
    if (worker) {
      const actual = await new Promise(resolve => {
        const channel = new MessageChannel();
        const finish = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
        const timer = setTimeout(() => finish(null), 350);
        channel.port1.onmessage = event => finish(event.data?.version);
        worker.postMessage({ type: 'PROJED_PWA_WORKER_VERSION_V1', requestId: 'dev141-evidence' }, [channel.port2]);
      });
      if (actual === expected) return actual;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Expected ' + slot + ' worker: ' + expected);
}, { expected: version(expected), slot });
const observe = (page, label) => {
  let navigations = 0;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
  });
  page.on('pageerror', error => diagnostics.push({ label, error: error.message }));
  return () => navigations;
};
const noPrompt = async page => {
  assert.equal(await page.locator('[data-pwa-update-prompt]:visible, [data-quick-pwa-update-prompt]:visible').count(), 0);
};
const seedLocalSession = () => {
  if (localStorage.getItem('projed-local-test.session')) return;
  const account = { id: 'local-test-user', uid: 'local-test-user', email: 'dev141@fixture.invalid', displayName: 'DEV-141', createdAt: 1704067200000 };
  localStorage.setItem('projed-local-test.selected-account', account.id);
  localStorage.setItem('projed-local-test.session', JSON.stringify(account));
};
const refreshCheck = page => page.evaluate(async () => {
  document.dispatchEvent(new Event('visibilitychange'));
  await (await navigator.serviceWorker.getRegistration('/'))?.update();
});
const publish = name => {
  active = name;
  history.push({ release: version(name), at: new Date().toISOString() });
};
let failed = null;
try {
  process.env.PROJED_RELEASE_ENV_DIR = envDir;
  process.env.VITE_DATA_BACKEND = 'local-test';
  if (backendUpgradeOnly) {
    assert.ok(legacySourceRoot, '--legacy-source-root is required for the exact old main checkout');
    assert.equal(reused, null, 'Backend upgrade builds must bind their exact source, not reuse an unbound artifact');
    record('A06-source-binding', verifyQuickUpgradeSources(path.resolve(legacySourceRoot), process.cwd()));
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:47971';
    process.env.VITE_SUPABASE_ANON_KEY = 'dev139-public-synthetic-anon-key';
    process.env.VITE_SUPABASE_AUTH_MODE = 'oauth-google';
    process.env.VITE_SUPABASE_AUTO_TEST_LOGIN = 'false';
    if (process.env.PROJED_DEV139_QUICK_PG_BASE) upgradeApiProxy = createQuickUpgradeApiProxy(process.env.PROJED_DEV139_QUICK_PG_BASE);
  }
  for (const [index, name] of (backendUpgradeOnly ? ['A', 'B'] : ['A', 'B', 'C']).entries()) {
    const dir = path.join(reused || output, name);
    if (reused) {
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'app-shell-meta.json'), 'utf8')).version, version(name));
      artifacts[name] = dir;
      continue;
    }
    process.env.PROJED_RELEASE_ID = run + '-' + name;
    const buildRoot = backendUpgradeOnly && name === 'A' ? path.resolve(legacySourceRoot) : process.cwd();
    if (backendUpgradeOnly) process.env.VITE_DATA_BACKEND = name === 'A' ? 'supabase' : 'http';
    const buildArtifact = backendUpgradeOnly && name === 'A'
      ? (await import(pathToFileURL(createRequire(path.join(buildRoot, 'package.json')).resolve('vite')).href)).build
      : build;
    const originalCwd = process.cwd();
    try {
      // The historical config has relative Rollup HTML inputs. Its normal CLI
      // entry runs in that source tree; root alone does not change those inputs.
      if (backendUpgradeOnly) process.chdir(buildRoot);
      await buildArtifact({ ...(backendUpgradeOnly
        ? { root: buildRoot, configFile: path.join(buildRoot, 'vite.config.js'), configLoader: 'runner' } : {}),
      mode: 'dev141', logLevel: 'error', build: { outDir: dir } });
    } finally { process.chdir(originalCwd); }
    const predecessor = ['A', 'B', 'C'][index - 1];
    retainVersionHistory({
      distDir: dir, version: version(name), previousDistDir: artifacts[predecessor],
      previousVersion: predecessor ? version(predecessor) : undefined,
    });
    artifacts[name] = dir;
    if (backendUpgradeOnly) record('A06-artifact-' + name, { version: version(name),
      backend: name === 'A' ? 'supabase' : 'http',
      files: ['sw.js', 'quick-task/index.html', 'app-shell-meta.json'].map(file => ({ path: file,
        sha256: createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex') })) });
    console.log('Built ' + version(name));
  }

  server = http.createServer(async (request, response) => {
    if (upgradeApiProxy && await upgradeApiProxy(request, response)) return;
    const url = new URL(request.url, 'http://localhost');
    const root = artifacts[active];
    let relative = decodeURIComponent(url.pathname).slice(1);
    if (!relative || relative === 'index.html') relative = 'index.html';
    if (relative === 'quick-task' || relative === 'quick-task/') relative = 'quick-task/index.html';
    const file = path.resolve(root, relative);
    if ((unavailableVersion && relative.startsWith('app-releases/' + unavailableVersion + '/'))
      || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  if (!singleButtonOnly && !backendUpgradeOnly) {
  const profile = path.join(output, 'profile');
  const launch = () => chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true, viewport: { width: 1280, height: 800 } });
  context = await launch();
  await context.addInitScript(seedLocalSession);
  publish('A');
  const main = context.pages()[0];
  const mainNavs = observe(main, 'main-A');
  await main.goto(origin, { waitUntil: 'domcontentloaded' });
  await loaded(main, 'A');
  const mainTrigger = main.locator('[data-app-more-menu] > summary');
  await mainTrigger.or(main.getByRole('button', { name: '使用固定測試環境' })).waitFor({ timeout: 12000 });
  if (!await mainTrigger.isVisible()) await main.getByRole('button', { name: '使用固定測試環境' }).click();
  await mainTrigger.waitFor();
  await workerVersion(main, 'A');
  const quick = await context.newPage();
  const quickNavs = observe(quick, 'quick-A');
  await quick.setViewportSize({ width: 390, height: 812 });
  await quick.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await loaded(quick, 'A');
  const draft = quick.locator('#quick-task-title');
  await draft.fill('DEV-141 draft sentinel');

  publish('B');
  await refreshCheck(main);
  await workerVersion(main, 'B', 'waiting');
  await main.locator('[data-app-more-update-badge]').waitFor();
  await quick.bringToFront();
  await refreshCheck(quick);
  await quick.locator('[data-quick-update-badge]').waitFor();
  assert.equal(await draft.inputValue(), 'DEV-141 draft sentinel');
  assert.equal(await draft.evaluate(el => document.activeElement === el), true);
  assert.equal(await main.locator('[data-app-more-menu-panel]').count(), 0);
  assert.equal(await quick.locator('[data-quick-install-menu]').getAttribute('open'), null);
  await noPrompt(main);
  await noPrompt(quick);
  assert.equal(mainNavs(), 1);
  assert.equal(quickNavs(), 1);
  await openMenu(quick, true);
  await quick.locator('[data-quick-update-available]').waitFor();
  await quick.locator('[data-quick-update-reload]').click();
  await quick.getByText(/請先|尚未保存|無法確認內容/).first().waitFor();
  assert.equal(quickNavs(), 1);
  assert.equal(await draft.inputValue(), 'DEV-141 draft sentinel');
  await quick.screenshot({ path: path.join(output, 'quick-blocked-update.png') });
  await openMenu(main);
  await main.locator('[data-app-update-available]').waitFor();
  await main.screenshot({ path: path.join(output, 'main-update-menu.png') });
  record('A01', { main: await state(main), quick: await state(quick), mainNavs: mainNavs(), quickNavs: quickNavs() });

  await main.locator('[data-app-update-later]').click();
  await main.locator('[data-app-more-update-badge]').waitFor({ state: 'hidden' });
  await main.reload({ waitUntil: 'domcontentloaded' });
  await loaded(main, 'A');
  assert.equal((await state(main)).adopted, version('A'));
  await context.close();
  context = await launch();
  const first = context.pages()[0];
  const firstNavs = observe(first, 'main-restored-A');
  await first.goto(origin, { waitUntil: 'domcontentloaded' });
  await loaded(first, 'A');
  await workerVersion(first, 'B');
  await first.locator('[data-mode-switcher-trigger]').click();
  await first.locator('[data-mode-switcher-value="gantt"]').click();
  await first.locator('[data-mobile-pan-surface="gantt"]').waitFor();
  await openMenu(first);
  await first.locator('[data-app-update-reload]').waitFor();
  assert.equal(await first.locator('[data-app-more-update-badge]').count(), 0);
  const second = await context.newPage();
  const secondNavs = observe(second, 'quick-restored-A');
  await second.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await loaded(second, 'A');
  await second.locator('#quick-task-title').fill('draft survives other tab');
  const third = await context.newPage();
  const thirdNavs = observe(third, 'quick-safe-A');
  await third.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await loaded(third, 'A');
  await first.locator('[data-app-update-reload]').click();
  await loaded(first, 'B');
  await first.locator('[data-app-more-menu] > summary').waitFor();
  await first.locator('[data-mobile-pan-surface="gantt"]').waitFor();
  assert.equal(firstNavs(), 2);
  assert.equal((await state(first)).adopted, version('B'));
  record('A02', { first: await state(first), firstNavs: firstNavs(), blockedQuickNavs: 1 });
  publish('C');
  await first.bringToFront();
  await refreshCheck(first);
  await workerVersion(first, 'C', 'waiting');
  await openMenu(first);
  await first.locator('[data-app-update-reload]').click();
  await loaded(first, 'C');
  const workerAfterManualUpdate = await workerVersion(first, 'C');
  assert.equal(firstNavs(), 3);
  await second.bringToFront();
  await refreshCheck(second);
  assert.equal(secondNavs(), 1);
  assert.equal(thirdNavs(), 1);
  assert.equal((await state(second)).version, version('A'));
  assert.equal((await state(third)).version, version('A'));
  assert.equal(await second.locator('#quick-task-title').inputValue(), 'draft survives other tab');
  record('A04', { workerAfterManualUpdate, second: await state(second), third: await state(third), secondNavs: secondNavs(), thirdNavs: thirdNavs() });
  await first.evaluate(() => window.dispatchEvent(new ErrorEvent('error', {
    message: 'Failed to fetch dynamically imported module',
    error: new Error('DEV-141 isolated chunk failure'),
  })));
  const recovery = first.locator('[data-pwa-update-prompt]');
  await recovery.waitFor();
  assert.equal(firstNavs(), 3);
  await recovery.getByRole('button', { name: '重試' }).click();
  await loaded(first, 'C');
  await recovery.waitFor({ state: 'hidden' });
  assert.equal(firstNavs(), 4);
  assert.equal(secondNavs(), 1);
  record('A05', { first: await state(first), recoveryNavs: 1, otherNavs: secondNavs() });

  // Use another clean profile to test A remaining available through two
  // releases without an update in another tab changing the browser's adopted pin.
  await context.close();
  const delayedProfile = path.join(output, 'delayed-profile');
  publish('A');
  context = await chromium.launchPersistentContext(delayedProfile, { channel: 'msedge', headless: true });
  const delaying = context.pages()[0];
  await delaying.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await loaded(delaying, 'A');
  await workerVersion(delaying, 'A');
  // The first installation intentionally does not claim a running document.
  await delaying.reload({ waitUntil: 'domcontentloaded' });
  await loaded(delaying, 'A');
  await delaying.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  publish('B');
  await refreshCheck(delaying);
  await openMenu(delaying, true);
  await delaying.locator('[data-quick-update-later]').click();
  const activeAfterB = await workerVersion(delaying, 'B', 'waiting');
  await context.close();
  publish('C');
  context = await chromium.launchPersistentContext(delayedProfile, { channel: 'msedge', headless: true });
  const reloaded = context.pages()[0];
  const devtools = await context.newCDPSession(reloaded);
  await devtools.send('Network.enable');
  await devtools.send('Network.setBypassServiceWorker', { bypass: true });
  const oldEntryResponse = reloaded.waitForResponse(response =>
    response.url().endsWith('/app-releases/' + version('A').replace(':', '-') + '/quick-task/index.html'));
  await reloaded.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await loaded(reloaded, 'A');
  assert.equal((await oldEntryResponse).fromServiceWorker(), false);
  await reloaded.locator('[data-quick-update-badge]').waitFor();
  assert.equal((await state(reloaded)).adopted, version('A'));
  record('A03', { restoredMainAfterB: version('A'), activeAfterClose: version('B'), waitingBeforeC: activeAfterB, afterCWithoutWorker: await state(reloaded) });
  await context.close();
  unavailableVersion = version('A').replace(':', '-');
  // A retired version must also be unavailable in the profile's cache to
  // reach the entry recovery screen. Seed just the adoption record.
  context = await chromium.launchPersistentContext(path.join(output, 'retired-profile'), { channel: 'msedge', headless: true, serviceWorkers: 'block' });
  const retired = context.pages()[0];
  await context.addInitScript(pinned => {
    if (!localStorage.getItem('projed:pwa:adopted-version:v1')) localStorage.setItem('projed:pwa:adopted-version:v1', pinned);
  }, version('A'));
  await retired.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  const unavailable = retired.locator('#projed-entry-recovery');
  await unavailable.waitFor();
  assert.equal(await retired.evaluate(() => localStorage.getItem('projed:pwa:adopted-version:v1')), version('A'));
  await unavailable.getByRole('button', { name: '檢查並更新' }).click();
  await unavailable.getByRole('button', { name: '更新至此版本' }).waitFor();
  assert.equal(await retired.evaluate(() => localStorage.getItem('projed:pwa:adopted-version:v1')), version('A'));
  await unavailable.getByRole('button', { name: '更新至此版本' }).click();
  await loaded(retired, 'C');
  record('A06', { retiredVersion: version('A'), recovered: await state(retired) });
  unavailableVersion = null;

  await context.close();
  publish('A');
  context = await chromium.launchPersistentContext(path.join(output, 'retarget-profile'), { channel: 'msedge', headless: true });
  const retarget = context.pages()[0];
  const retargetNavs = observe(retarget, 'retarget');
  await retarget.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await loaded(retarget, 'A');
  await workerVersion(retarget, 'A');
  await retarget.reload({ waitUntil: 'domcontentloaded' });
  await loaded(retarget, 'A');
  await retarget.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  publish('B');
  await refreshCheck(retarget);
  await workerVersion(retarget, 'B', 'waiting');
  await openMenu(retarget, true);
  const bUpdateButton = retarget.locator('[data-quick-update-reload][data-update-target="' + version('B') + '"]');
  await bUpdateButton.waitFor();
  publish('C');
  await bUpdateButton.evaluate(button => button.click());
  await retarget.getByText('可用版本已變更，請再按一次更新。').waitFor();
  assert.equal(retargetNavs(), 2);
  assert.equal((await state(retarget)).version, version('A'));
  await retarget.locator('[data-quick-update-reload]').click();
  await loaded(retarget, 'C');
  assert.equal(retargetNavs(), 3);
  await context.close();
  context = await chromium.launchPersistentContext(path.join(output, 'new-profile'), { channel: 'msedge', headless: true });
  const fresh = context.pages()[0];
  await fresh.goto(origin + '/quick-task/', { waitUntil: 'domcontentloaded' });
  await loaded(fresh, 'C');
  record('A07', { confirmedVersion: version('C'), retargetNavs: retargetNavs(), firstVisit: await state(fresh) });
  await context.close();
  }

  const installationParity = [];
  for (const manifestPath of ['manifest.webmanifest', 'quick-task/manifest.webmanifest']) {
    const a = fs.readFileSync(path.join(artifacts.A, manifestPath));
    const b = fs.readFileSync(path.join(artifacts.B, manifestPath));
    assert.ok(a.equals(b), 'Ordinary release must keep installation identity stable: ' + manifestPath);
    for (const icon of JSON.parse(a).icons) {
      const iconPath = icon.src.replace(/^\//, '');
      assert.ok(fs.readFileSync(path.join(artifacts.A, iconPath)).equals(fs.readFileSync(path.join(artifacts.B, iconPath))), 'Installed icon changed: ' + iconPath);
    }
    installationParity.push(manifestPath);
  }
  const singleButtonCases = [];
  if (backendUpgradeOnly) {
    context = await chromium.launchPersistentContext(path.join(output, 'quick-backend-profile'),
      { channel: 'msedge', headless: true, viewport: { width: 390, height: 844 } });
    await runQuickBackendUpgrade({ context, origin, output, publish, loaded, workerVersion, refreshCheck, record,
      liveBackend: upgradeApiProxy ? { owner: process.env.PROJED_DEV139_QUICK_PG_OWNER,
        other: process.env.PROJED_DEV139_QUICK_PG_OTHER,
        ownerContext: process.env.PROJED_DEV139_QUICK_PG_CONTEXT,
        proofPath: process.env.PROJED_DEV139_QUICK_PG_PROOF } : null });
    await context.close();
    record('A06-installation-parity', { installationParity, originPreserved: true,
      browserProfilePreserved: true, physicalInstalledPwa: 'NOT_RUN', reinstallation: 'NOT_REQUIRED' });
  } else {
  for (const quickEntry of [false, true]) {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 812 }]) {
     for (const controlled of [false, true]) {
      publish('A');
      const label = (quickEntry ? 'quick' : 'main') + '-' + viewport.width + '-' + (controlled ? 'controlled' : 'first-load');
      context = await chromium.launchPersistentContext(path.join(output, 'single-button-' + label), { channel: 'msedge', headless: true, viewport });
      await context.addInitScript(seedLocalSession);
      const subject = context.pages()[0];
      const navigations = observe(subject, label);
      const dialogs = [];
      const requests = [];
      subject.on('response', response => { if (response.url().startsWith(origin)) requests.push({ url: response.url(), status: response.status(), worker: response.fromServiceWorker() }); });
      subject.on('requestfailed', request => requests.push({ url: request.url(), failure: request.failure()?.errorText }));
      try {
      subject.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
      await subject.goto(origin + (quickEntry ? '/quick-task/' : '/'), { waitUntil: 'domcontentloaded' });
      await loaded(subject, 'A');
      const trigger = subject.locator(quickEntry ? '[data-quick-install-menu] summary' : '[data-app-more-menu] > summary');
      if (!quickEntry) {
        await trigger.or(subject.getByRole('button', { name: '使用固定測試環境' })).waitFor();
        if (!await trigger.isVisible()) await subject.getByRole('button', { name: '使用固定測試環境' }).click();
      }
      await trigger.waitFor();
      await workerVersion(subject, 'A');
      if (controlled) {
        await subject.reload({ waitUntil: 'domcontentloaded' });
        await loaded(subject, 'A');
        await subject.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      }
      publish('B');
      // Simulate returning to the foreground. Only the actual UI button applies B.
      await subject.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await openMenu(subject, quickEntry);
      const update = subject.locator(quickEntry ? '[data-quick-update-reload]' : '[data-app-update-reload]');
      await update.waitFor();
      await update.waitFor({ state: 'visible' });
      const before = navigations();
      await update.click();
      await loaded(subject, 'B');
      await trigger.waitFor();
      assert.equal(navigations(), before + 1, 'Exactly one page navigation after one update click');
      assert.equal((await state(subject)).adopted, version('B'));
      assert.deepEqual(dialogs, []);
      const visibleText = await subject.locator('body').innerText();
      assert.ok(!/開發人員選項|USB 偵錯|無線偵錯|chrome:\/\/webapks|adb pair/i.test(visibleText), 'Ordinary update must not require developer operations');
      singleButtonCases.push({ entry: quickEntry ? 'quick-task' : 'main', viewport, controlled, passed: true, updateClicks: 1, navigationDelta: navigations() - before, result: await state(subject), dialogs });
      console.log('A08 ' + label + ' PASS');
      } catch (error) {
        const snapshot = await subject.evaluate(() => ({ url: window.location.href, ready: document.readyState, version: document.querySelector('meta[name="projed-shell-version"]')?.content, boot: window.__PROJED_VERSION_BOOT__, body: document.body?.innerHTML.slice(0, 1600), scripts: [...document.scripts].map(s => ({ src: s.src, type: s.type })) })).catch(() => null);
        singleButtonCases.push({ entry: quickEntry ? 'quick-task' : 'main', viewport, controlled, passed: false, error: String(error), snapshot, requests });
        await subject.screenshot({ path: path.join(output, label + '-failed.png') }).catch(() => undefined);
        console.log('A08 ' + label + ' FAIL');
      } finally { await context.close(); }
     }
    }
  }
  fs.writeFileSync(path.join(output, 'single-button-cases.json'), JSON.stringify(singleButtonCases, null, 2));
  assert.ok(singleButtonCases.every(item => item.passed), 'Some normal single-button update cases failed');
  record('A08', { installationParity, cases: singleButtonCases, scope: 'Real built app/worker and normal update buttons; local browser verification, not Android WebAPK migration' });
  }
  assert.deepEqual(diagnostics, []);
} catch (error) {
  failed = error instanceof Error ? error.stack || error.message : String(error);
  console.error(failed);
  for (const [index, page] of (context?.pages() || []).entries()) {
    try {
      console.error('Fixture page', page.url(), (await page.locator('body').innerText({ timeout: 1000 })).slice(0, 700));
      await page.screenshot({ path: path.join(output, 'failed-' + index + '.png'), timeout: 2000 });
    } catch { /* The failed browser may have already detached. */ }
  }
  process.exitCode = 1;
} finally {
  try { await context?.close(); } finally {
    await new Promise(resolve => server ? server.close(resolve) : resolve());
    fs.writeFileSync(resultFile, JSON.stringify({ run, history, checks, diagnostics, failed }, null, 2) + '\n');
    console.log(resultFile);
  }
}
