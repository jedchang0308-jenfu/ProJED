/* global window, document */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'vite';

const require = createRequire(import.meta.url);
const cliPlaywright = (process.env.PATH || '').split(path.delimiter)
  .filter(dir => path.basename(dir) === '.bin')
  .map(dir => path.resolve(dir, '..', 'playwright'))
  .find(dir => fs.existsSync(path.join(dir, 'package.json')));
const { chromium } = require(process.env.PROJED_PLAYWRIGHT_MODULE || cliPlaywright || 'playwright');
const output = path.resolve('output/playwright/dev-143', randomUUID());
const dist = process.argv[2] ? path.resolve(process.argv[2]) : path.join(output, 'dist');
const envDir = path.join(output, 'env');
fs.mkdirSync(envDir, { recursive: true });
process.env.PROJED_RELEASE_ID = 'dev143-isolated';
process.env.PROJED_RELEASE_ENV_DIR = envDir;
process.env.VITE_DATA_BACKEND = 'http';
if (!process.argv[2]) await build({ mode: 'production', build: { outDir: dist, emptyOutDir: true } });

const user = { localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  authContextId: '11111111-1111-4111-8111-111111111111', entry: 'main',
  email: 'remembered@fixture.invalid', displayName: 'Remembered fixture', createdAt: 1,
  expiresAt: Date.now() + 90 * 86_400_000, rememberedDevice: true };
let status = 401;
let renewalStatus = 200;
let renewals = 0;
const logins = [];
const checks = [];
const check = (name, condition) => {
  assert.equal(condition, true, name);
  checks.push(name);
  console.log('PASS ' + name);
};
const cleanupOwnedProfile = (profilePath, outputPath) => {
  const ownedProfile = path.resolve(profilePath);
  if (!ownedProfile.startsWith(outputPath + path.sep) || path.basename(ownedProfile) !== 'browser-profile') {
    throw new Error('Unexpected browser profile cleanup target');
  }
  fs.rmSync(ownedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
};
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const json = (code, body) => {
    response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
  };
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/v1/session/login') {
      let body = '';
      for await (const chunk of request) body += chunk;
      logins.push(JSON.parse(body));
      const origin = 'http://' + request.headers.host;
      const query = new URLSearchParams({ client_id: 'projed', redirect_uri: origin + '/api/auth/jenfu-sso/callback',
        response_type: 'code', code_challenge: 'C'.repeat(43), code_challenge_method: 'S256', state: 'S'.repeat(43) });
      return json(200, { data: { authorizationUrl: origin + '/api/sso/authorize?' + query } });
    }
    if (url.pathname === '/api/sso/authorize') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      return response.end('<title>Synthetic login choice recorded</title>');
    }
    if (url.pathname === '/api/v1/session/renew') {
      renewals++;
      if (request.headers['x-projed-expected-account-id'] !== user.localUserId
          || request.headers['x-projed-expected-context-id'] !== user.authContextId) {
        return json(409, { error: { code: 'ACTOR_CHANGED' } });
      }
      return json(renewalStatus, renewalStatus === 200 ? { data: user }
        : { error: { code: renewalStatus === 401 ? 'ACTOR_INVALID' : 'DEPENDENCY_UNAVAILABLE' } });
    }
    if (url.pathname === '/api/v1/session') return json(status, status === 200 ? { data: user }
      : { error: { code: status === 401 ? 'ACTOR_INVALID' : 'DEPENDENCY_UNAVAILABLE' } });
    if (request.method !== 'GET') return json(503, { error: { code: 'DEPENDENCY_UNAVAILABLE' } });
    return json(200, { data: [] });
  }
  const file = path.resolve(dist, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const profile = path.join(output, 'browser-profile');
let context;
const diagnostics = [];
const timings = {};
try {
  const launch = async () => {
    const browserContext = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true,
      viewport: { width: 390, height: 844 } });
    // No external identity or model calls are allowed in this synthetic test.
    await browserContext.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    return browserContext;
  };
  context = await launch();
  const page = context.pages()[0];
  page.on('pageerror', error => diagnostics.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
  await page.goto(origin);
  const choice = page.getByRole('checkbox', { name: '在此裝置保持登入', exact: false });
  await choice.waitFor();
  check('main-remember-device-default-off', !await choice.isChecked());
  await choice.check();
  await page.getByRole('button', { name: '檢查 Jenfu-Platform 登入' }).click();
  await page.waitForURL('**/api/sso/authorize?**');
  check('main-login-forwards-explicit-choice', logins.at(-1)?.rememberDevice === true && logins.at(-1)?.entry === 'main');

  const firstQuickStart = performance.now();
  await page.goto(origin + '/quick-task/');
  await page.getByRole('textbox', { name: '任務名稱' }).waitFor();
  timings.firstQuickEditableMs = Math.round(performance.now() - firstQuickStart);
  await page.getByRole('checkbox', { name: '在此裝置保持登入', exact: false }).check();
  await page.getByRole('button', { name: '登入快速建任務' }).click();
  await page.waitForURL('**/api/sso/authorize?**');
  check('quick-login-forwards-explicit-choice', logins.at(-1)?.rememberDevice === true && logins.at(-1)?.returnPath === '/quick-task/');

  status = 200;
  const mainRenewal = page.waitForResponse(response => response.url() === origin + '/api/v1/session/renew' && response.status() === 200);
  await page.goto(origin);
  await mainRenewal;
  check('remembered-main-renews-without-showing-login', await page.getByRole('button', { name: '檢查 Jenfu-Platform 登入' }).count() === 0);
  renewalStatus = 503;
  const temporaryFailure = page.waitForResponse(response => response.url() === origin + '/api/v1/session/renew' && response.status() === 503);
  await page.reload();
  await temporaryFailure;
  check('temporary-main-renewal-failure-keeps-current-session', await page.getByRole('button', { name: '檢查 Jenfu-Platform 登入' }).count() === 0);
  renewalStatus = 200;
  const before = renewals;
  await page.goto(origin + '/quick-task/');
  await page.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  try {
    // The product deliberately uses clientsClaim:false; a first installation
    // controls the next normal navigation, never forcibly reloads a live draft.
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations())
      .some(reg => reg.active?.state === 'activated'), undefined, { timeout: 60_000 });
  } catch (error) {
    diagnostics.push(await page.evaluate(async () => ({ secure: window.isSecureContext,
      workers: (await navigator.serviceWorker.getRegistrations()).map(reg => ({ scope: reg.scope,
        installing: reg.installing?.state, waiting: reg.waiting?.state, active: reg.active?.state })),
      caches: await window.caches.keys() })));
    throw error;
  }
  await page.reload();
  await page.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  await page.waitForTimeout(500);
  check('remembered-quick-renews-on-foreground', renewals > before);
  const after = renewals;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForTimeout(300);
  check('foreground-burst-does-not-repeat-renewal', renewals === after);

  renewalStatus = 503;
  await page.reload();
  await page.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  await context.setOffline(true);
  const title = 'DEV143 offline local draft ' + randomUUID();
  const titleInput = page.getByRole('textbox', { name: '任務名稱' });
  await titleInput.fill(title);
  await page.waitForTimeout(1500);
  check('offline-input-remains-editable', await titleInput.inputValue() === title);
  await context.close(); context = undefined;
  // Restart a real browser process with the same isolated profile and cached PWA.
  context = await launch();
  await context.setOffline(true);
  const reopened = context.pages()[0];
  const cachedStart = performance.now();
  await reopened.goto(origin + '/quick-task/');
  await reopened.getByRole('textbox', { name: '任務名稱' }).waitFor();
  timings.cachedOfflineEditableMs = Math.round(performance.now() - cachedStart);
  await reopened.waitForFunction(value => document.querySelector('#quick-task-title')?.value === value
    || Array.from(document.querySelectorAll('input')).some(input => input.value === value), title);
  check('browser-restart-offline-restores-draft', await reopened.getByRole('textbox', { name: '任務名稱' }).inputValue() === title);
  await context.setOffline(false);
  renewalStatus = 401;
  status = 200;
  await reopened.reload();
  await reopened.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 尚未登入' }).waitFor();
  const retainedForOwner = () => reopened.evaluate(async ({ expectedTitle, owner }) => {
    const request = window.indexedDB.open('projed-quick-task-v1');
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('captures');
        const read = tx.objectStore('captures').getAll();
        tx.oncomplete = () => resolve(read.result.some(row => row.title === expectedTitle && row.accountId === owner));
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { expectedTitle: title, owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  check('revoked-renewal-hides-but-retains-owned-draft', await retainedForOwner()
    && await reopened.getByRole('textbox', { name: '任務名稱' }).inputValue() === '');
  renewalStatus = 200;
  user.localUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  user.authContextId = '22222222-2222-4222-8222-222222222222';
  await reopened.reload();
  await reopened.locator('#quick-task-auth-status').filter({ hasText: '此快速 App 已登入' }).waitFor();
  check('another-account-cannot-see-owned-draft', await retainedForOwner()
    && await reopened.getByRole('textbox', { name: '任務名稱' }).inputValue() === '');
  user.localUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user.authContextId = '33333333-3333-4333-8333-333333333333';
  await reopened.reload();
  await reopened.waitForFunction(value => document.querySelector('#quick-task-title')?.value === value, title);
  check('same-account-reauthentication-restores-owned-draft', await retainedForOwner()
    && await reopened.getByRole('textbox', { name: '任務名稱' }).inputValue() === title);
  await reopened.screenshot({ path: path.join(output, 'quick-restored-draft.png') });
} finally {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({
    status: checks.length === 12 ? 'PASS' : 'INCOMPLETE',
    evidenceLevel: 'ISOLATED_HEADLESS_EDGE_SYNTHETIC_HTTP_REAL_PWA_INDEXEDDB',
    production: 'NOT_RUN', checks, timings, diagnostics,
    artifact: Object.fromEntries(['index.html', 'quick-task/index.html', 'sw.js'].map(file => [file,
      createHash('sha256').update(fs.readFileSync(path.join(dist, file))).digest('hex')])),
  }, null, 2));
  // Only this run's synthetic browser profile is disposable. Keep the build,
  // screenshots and result so failed and successful runs remain reviewable.
  cleanupOwnedProfile(profile, output);
}
console.log('DEV143_BROWSER_RESULT=' + path.join(output, 'result.json'));
