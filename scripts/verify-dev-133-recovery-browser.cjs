/* eslint-disable */
// Isolated UI/IDB checks; Auth and RPC are simulated, never real account/data operations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = process.env.DEV133_BASE_URL || 'http://localhost:4000';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.join(root, 'output/playwright/dev-133-recovery-entry');
fs.mkdirSync(output, { recursive: true });
const result = {
  devId: 'DEV-133', slice: 'conditional-recovery-entry', status: 'FAIL',
  layer: 'Real local browser/UI/IndexedDB; simulated Auth/RPC; no hosted integration',
  route: origin + '/quick-task/?install=1', cases: [], screenshots: [],
  browserErrors: [], externalRequests: [], httpFailures: [],
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(['src/quickTask/main.ts', 'src/quickTask/quick-task.css', 'src/features/quickTaskCapture/outbox.ts'].map(file => [
    file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'),
  ])),
  runtime: { project: 'ProJED', purpose: 'DEV-133 isolated recovery UI checks', appPort: new URL(origin).port,
    appOwnership: 'Pre-existing user runtime; reused', browserPort: 0,
    cleanupCondition: 'Close every test context and only this BrowserServer; preserve user runtime/tab' },
};
const makeRecord = (number, fields = {}) => ({
  schemaVersion: 1, captureId: 'task_workbench_unplaced_00000000-0000-4000-8000-' + String(number).padStart(12, '0'),
  accountId: null, title: '測試待辦 ' + number, workspaceHint: null,
  clientCreatedAt: Date.now() - 10000 + number, updatedAt: Date.now(), state: 'awaiting_auth',
  attemptCount: 0, nextAttemptAt: null, lastErrorCode: null, leaseId: null, leaseExpiresAt: null, claimIntent: null,
  ...fields,
});
const unbound = () => [1, 2, 3, 4].map(number => makeRecord(number));
const authModule = [
  "import { getQuickAuthContext, saveQuickAuthContext } from '/src/features/quickTaskCapture/outbox.ts';",
  'let epoch = 1;',
  'let account = window.__qaAccount;',
  'let snapshot = account ? { accountId: account, accessToken: "fixture-token-" + account, authEpoch: epoch } : null;',
  'export const getQuickAuthSnapshot = () => snapshot;',
  'export const loadQuickSession = async () => { await window.__fixtureReady; return snapshot; };',
  'export const getQuickBindingContext = async () => { await window.__fixtureReady; const context = await getQuickAuthContext(); return context?.bindingAllowed ? context : null; };',
  'export const verifyQuickSessionState = async expected => {',
  '  await window.__fixtureReady;',
  '  if (window.__qaVerificationGate) await window.__qaVerificationGate;',
  '  if (window.__qaUnreachable) return { status: "unreachable", snapshot: null };',
  '  if (!snapshot) return { status: "unauthenticated", snapshot: null };',
  '  if (snapshot.accountId !== expected.accountId || snapshot.authEpoch !== expected.authEpoch) return { status: "stale", snapshot: null };',
  '  const current = await getQuickAuthContext();',
  '  const context = { key: "current", projectRef: "fixture", accountId: snapshot.accountId, displayLabel: snapshot.accountId + "@example.invalid", verifiedAt: Date.now(), bindingAllowed: true, revision: current?.accountId === snapshot.accountId ? current.revision : (current?.revision ?? 0) + 1, barrierAt: null };',
  '  await saveQuickAuthContext(context, current?.revision);',
  '  const verified = { ...snapshot, email: context.displayLabel, contextRevision: context.revision, contextProjectRef: "fixture" };',
  '  window.__qaVerified = true;',
  '  return { status: "verified", snapshot: verified };',
  '};',
  'export const verifyQuickSession = async expected => { const verification = await verifyQuickSessionState(expected); return verification.snapshot; };',
  'export const startQuickGoogleSignIn = async redirect => { window.__qaLoginCalls.push(redirect); };',
  'export const signOutQuickSession = async () => window.__qaSwitchAccount(null);',
  'export const completeQuickOAuthCallback = async () => null;',
  'export const subscribeQuickAuth = async callback => {',
  '  window.__qaSwitchAccount = next => { account = next; epoch++; snapshot = next ? { accountId: next, accessToken: "fixture-token-" + next, authEpoch: epoch } : null; callback(snapshot); };',
  '  queueMicrotask(() => callback(snapshot));',
  '  return { unsubscribe() {} };',
  '};',
].join('\n');
const serviceModule = [
  'export const createQuickUnplacedTask = async ({ capture, auth }) => {',
  '  window.__qaRpcCalls.push({ captureId: capture.captureId, accountId: auth.accountId });',
  '  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(capture.title));',
  '  return { status: "committed", captureId: capture.captureId, ownerId: auth.accountId, titleHash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""), committedAt: Date.now(), created: true };',
  '};',
].join('\n');
let browserServer;
let browser;
const openFixture = async (records = [], options = {}) => {
  const context = await browser.newContext({ viewport: { width: 614, height: 668 } });
  await context.addInitScript(({ records, options }) => {
    if (location.origin === 'null') return;
    window.__qaAccount = options.account ?? null;
    window.__qaUnreachable = options.unreachable ?? false;
    window.__qaRpcCalls = [];
    window.__qaLoginCalls = [];
    window.__fixtureReady = new Promise((resolve, reject) => {
      const request = indexedDB.open('projed-quick-task-v1', 2);
      request.onupgradeneeded = () => {
        const captures = request.result.createObjectStore('captures', { keyPath: 'captureId' });
        captures.createIndex('accountId', 'accountId');
        captures.createIndex('state', 'state');
        captures.createIndex('claimIntent.nonceHash', 'claimIntent.nonceHash', { unique: true });
        request.result.createObjectStore('auth_context', { keyPath: 'key' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['captures', 'auth_context'], 'readwrite');
        // Each fixture uses a fresh browser context; reload preserves the existing records.
        const count = tx.objectStore('captures').count();
        count.onsuccess = () => {
          if (count.result === 0 && !sessionStorage.getItem('qa-seeded')) {
            records.forEach(record => tx.objectStore('captures').put(record));
            if (options.account) tx.objectStore('auth_context').put({
              key: 'current', projectRef: 'fixture', accountId: options.account,
              displayLabel: options.account + '@example.invalid', verifiedAt: Date.now(),
              bindingAllowed: true, revision: 1, barrierAt: null,
            });
          }
        };
        tx.oncomplete = () => { sessionStorage.setItem('qa-seeded', '1'); db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  }, { records, options });
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) {
      result.externalRequests.push(new URL(url).origin);
      return route.abort();
    }
    if (/\/src\/features\/quickTaskCapture\/auth\.ts(?:\?|$)/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: authModule });
    }
    if (/\/src\/services\/supabase\/quickTaskCaptureService\.ts(?:\?|$)/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: serviceModule });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.browserErrors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) result.httpFailures.push({ status: response.status(), url: response.url() }); });
  await page.goto(result.route, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#quick-task-auth-status').textContent.includes('正在'));
  return { context, page };
};
const readRows = page => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('projed-quick-task-v1', 2);
  request.onsuccess = () => {
    const db = request.result;
    const read = db.transaction('captures').objectStore('captures').getAll();
    read.onsuccess = () => { db.close(); resolve(read.result); };
    read.onerror = () => { db.close(); reject(read.error); };
  };
}));
const runCase = async (id, records, options, check) => {
  let fixture;
  try {
    fixture = await openFixture(records, options);
    await check(fixture.page);
    result.cases.push({ id, status: 'SIMULATION PASS' });
  } catch (error) {
    result.cases.push({ id, status: 'FAIL', error: error.message });
  } finally {
    if (fixture) await fixture.context.close();
  }
};
const compact = page => page.locator('#quick-task-recovery [data-recover]');
const noRecovery = page => page.locator('#quick-task-recovery-details').waitFor({ state: 'hidden' });
const calls = page => page.evaluate(() => ({ rpc: window.__qaRpcCalls, login: window.__qaLoginCalls }));
const main = async () => {
  browserServer = await chromium.launchServer({
    headless: true, host: '127.0.0.1', port: 0,
    executablePath: process.env.DEV133_CHROME_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  result.runtime.browserPid = browserServer.process().pid;
  result.runtime.browserPort = Number(new URL(browserServer.wsEndpoint()).port);
  browser = await chromium.connect(browserServer.wsEndpoint());
  result.browserVersion = browser.version();

  await runCase('R01-empty-and-create', [], {}, async page => {
    await noRecovery(page);
    await page.getByRole('textbox', { name: '任務名稱' }).fill('由正常建立入口保存');
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await page.getByText('已記下，待同步').waitFor();
    assert.equal(await page.getByRole('button', { name: '登入以同步', exact: true }).count(), 0);
    await page.getByRole('textbox', { name: '任務名稱' }).fill('下一筆');
    await page.getByRole('textbox', { name: '任務名稱' }).fill('');
    await compact(page).waitFor();
    assert.equal(await compact(page).innerText(), '本機待同步任務');
    const rows = await readRows(page);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].accountId, null);
    assert.equal((await calls(page)).rpc.length, 0);
  });
  await runCase('R02-automatic-states-hidden', [
    makeRecord(1, { accountId: 'A', state: 'pending' }),
    makeRecord(2, { accountId: 'A', state: 'failed_retryable', nextAttemptAt: Date.now() + 600000 }),
    makeRecord(3, { accountId: 'A', state: 'syncing', leaseId: 'active', leaseExpiresAt: Date.now() + 600000 }),
    makeRecord(4, { accountId: 'A', state: 'synced' }),
  ], { account: 'A' }, async page => {
    await noRecovery(page);
    const rows = await readRows(page);
    assert.equal(rows[0].state, 'synced');
    assert.equal(rows.length, 4);
    assert.equal((await calls(page)).rpc.length, 1);
  });
  await runCase('R03-unreachable-owner-stays-automatic', [makeRecord(1, { accountId: 'A', state: 'pending' })],
    { account: 'A', unreachable: true }, async page => {
      await noRecovery(page);
      assert.equal((await readRows(page))[0].accountId, 'A');
      assert.equal((await calls(page)).rpc.length, 0);
    });
  await runCase('R04-anonymous-compact-login-and-draft', unbound(), {}, async page => {
    await compact(page).waitFor();
    assert.equal(await page.locator('#quick-task-recovery').innerText(), '本機待同步任務');
    await compact(page).focus();
    await page.keyboard.press('Enter');
    assert.equal((await calls(page)).login.length, 0);
    assert.equal(await page.locator('#quick-task-auth-status button').evaluate(element => element === document.activeElement), true);
    const title = page.getByRole('textbox', { name: '任務名稱' });
    await title.fill('仍可快速輸入');
    await noRecovery(page);
    await title.fill('');
    await compact(page).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await readRows(page)).length, 4);
    assert.equal(await compact(page).innerText(), '本機待同步任務');
  });
  await runCase('R05-claim-defer-confirm-same-id', unbound(), { account: 'A' }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    assert.match(await page.locator('#quick-task-recovery').innerText(), /同步到 A@example.invalid/);
    const nonceBefore = (await readRows(page))[0].claimIntent.nonceHash;
    assert.equal((await readRows(page))[0].accountId, null);
    assert.equal((await calls(page)).rpc.length, 0);
    await page.getByRole('button', { name: '稍後處理', exact: true }).click();
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    assert.notEqual((await readRows(page))[0].claimIntent.nonceHash, nonceBefore);
    await page.getByRole('button', { name: '確認同步', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#quick-task-recovery')?.dataset.compact === 'true'
      && document.querySelector('[data-recover]')?.textContent === '本機待同步任務');
    const rows = await readRows(page);
    assert.equal(rows[0].accountId, 'A');
    assert.equal(rows[0].state, 'synced');
    assert.equal(rows.filter(record => record.accountId === null).length, 3);
    assert.deepEqual((await calls(page)).rpc, [{ captureId: rows[0].captureId, accountId: 'A' }]);
    assert.equal((await calls(page)).login.length, 0);
  });
  await runCase('R06-account-switch-needs-new-confirmation', unbound(), { account: 'A' }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    const nonceBefore = (await readRows(page))[0].claimIntent.nonceHash;
    await page.evaluate(() => window.__qaSwitchAccount('B'));
    await compact(page).waitFor();
    assert.equal(await page.getByRole('button', { name: '確認同步', exact: true }).count(), 0);
    assert.equal((await readRows(page))[0].accountId, null);
    assert.equal((await calls(page)).rpc.length, 0);
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    assert.match(await page.locator('#quick-task-recovery').innerText(), /同步到 B@example.invalid/);
    assert.notEqual((await readRows(page))[0].claimIntent.nonceHash, nonceBefore);
  });
  await runCase('R07-confirmation-reload-does-not-claim', unbound(), { account: 'A' }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    const nonceBefore = (await readRows(page))[0].claimIntent.nonceHash;
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await readRows(page))[0].accountId, null);
    assert.equal((await calls(page)).rpc.length, 0);
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    assert.notEqual((await readRows(page))[0].claimIntent.nonceHash, nonceBefore);
  });
  await runCase('R08-exhausted-manual-retry', [makeRecord(1, {
    accountId: 'A', state: 'failed_permanent', lastErrorCode: 'AUTO_RETRY_EXHAUSTED', attemptCount: 8,
  })], { account: 'A' }, async page => {
    assert.equal(await compact(page).innerText(), '同步異常 1 筆');
    assert.equal((await calls(page)).rpc.length, 0);
    await compact(page).click();
    await page.getByRole('button', { name: '重試', exact: true }).click();
    await noRecovery(page);
    const rows = await readRows(page);
    assert.equal(rows[0].state, 'synced');
    assert.equal(rows[0].attemptCount, 1);
    assert.deepEqual((await calls(page)).rpc, [{ captureId: rows[0].captureId, accountId: 'A' }]);
  });
  await runCase('R09-workspace-guidance', [makeRecord(1, {
    accountId: 'A', state: 'failed_permanent', lastErrorCode: 'QT_NO_AVAILABLE_WORKSPACE',
  })], { account: 'A' }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '前往工作台', exact: true }).waitFor();
    assert.match(await page.locator('#quick-task-recovery').innerText(), /完成帳號與工作台設定/);
    assert.equal(await page.getByRole('button', { name: '重試', exact: true }).count(), 1);
    assert.equal((await calls(page)).rpc.length, 0);
  });
  await runCase('R10-conflict-not-blindly-retried', [makeRecord(1, {
    accountId: 'A', state: 'failed_permanent', lastErrorCode: 'QT_IDEMPOTENCY_CONFLICT', title: '<img src=x onerror=alert(1)>',
  })], { account: 'A' }, async page => {
    await compact(page).click();
    assert.equal(await page.getByRole('button', { name: '重試', exact: true }).count(), 0);
    assert.equal(await page.locator('#quick-task-recovery img').count(), 0);
    assert.match(await page.locator('#quick-task-recovery').innerText(), /需要查證/);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await compact(page).waitFor();
    assert.equal((await readRows(page)).length, 1);
  });
  await runCase('R11-foreign-owner-content-hidden', [makeRecord(1, {
    accountId: 'B', state: 'pending', title: '不可出現在 A 畫面的 B 名稱',
  })], { account: 'A' }, async page => {
    assert.equal(await compact(page).innerText(), '原帳號待辦 1 筆');
    await compact(page).click();
    assert.equal((await page.locator('body').innerText()).includes('不可出現在 A 畫面的 B 名稱'), false);
    assert.equal((await calls(page)).rpc.length, 0);
    assert.equal((await readRows(page))[0].accountId, 'B');
  });
  await runCase('R12-auth-failure-login-action', [makeRecord(1, {
    accountId: 'A', state: 'failed_auth', lastErrorCode: 'QT_AUTH_REQUIRED',
  })], { account: 'A', unreachable: true }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '重新登入', exact: true }).click();
    assert.deepEqual((await calls(page)).login, [origin + '/quick-task/']);
    assert.equal((await calls(page)).rpc.length, 0);
    assert.equal((await readRows(page))[0].accountId, 'A');
  });
  await runCase('R13-account-switch-during-confirmation', unbound(), { account: 'A' }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    await page.evaluate(() => { window.__qaVerificationGate = new Promise(resolve => { window.__qaReleaseVerification = resolve; }); });
    await page.getByRole('button', { name: '確認同步', exact: true }).click();
    await page.evaluate(() => { window.__qaSwitchAccount('B'); window.__qaReleaseVerification(); });
    await compact(page).waitFor();
    assert.ok((await readRows(page)).every(record => record.accountId === null));
    assert.equal((await calls(page)).rpc.length, 0);
  });
  await runCase('R14-expired-claim-preserves-record', unbound(), { account: 'A' }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    await page.evaluate(async () => {
      const outbox = await import('/src/features/quickTaskCapture/outbox.ts');
      const rows = await outbox.listQuickCaptures(null);
      await outbox.putClaimIntent(rows[0].captureId, rows[0].claimIntent.nonceHash, Date.now() - 1);
    });
    await page.getByRole('button', { name: '確認同步', exact: true }).click();
    await compact(page).waitFor();
    assert.ok((await readRows(page)).every(record => record.accountId === null));
    assert.equal((await calls(page)).rpc.length, 0);
  });
  await runCase('R15-profile-recovery-keeps-id', [makeRecord(1, {
    accountId: 'A', state: 'failed_permanent', lastErrorCode: '23503',
  })], { account: 'A' }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '前往工作台', exact: true }).waitFor();
    await page.getByRole('button', { name: '重試', exact: true }).click();
    await noRecovery(page);
    const rows = await readRows(page);
    assert.equal(rows[0].state, 'synced');
    assert.deepEqual((await calls(page)).rpc, [{ captureId: rows[0].captureId, accountId: 'A' }]);
  });
  await runCase('R16-defer-during-confirmation-does-not-claim', unbound(), { account: 'A' }, async page => {
    await compact(page).click();
    await page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    await page.evaluate(() => { window.__qaVerificationGate = new Promise(resolve => { window.__qaReleaseVerification = resolve; }); });
    await page.getByRole('button', { name: '確認同步', exact: true }).click();
    await page.getByRole('button', { name: '稍後處理', exact: true }).click();
    await compact(page).waitFor();
    await page.evaluate(() => window.__qaReleaseVerification());
    await page.waitForTimeout(200);
    assert.ok((await readRows(page)).every(record => record.accountId === null));
    assert.equal((await calls(page)).rpc.length, 0);
  });

  // Visual evidence uses the frozen candidate after the interaction checks.
  const visual = await openFixture(unbound(), { account: 'A' });
  try {
    for (const viewport of [{ width: 614, height: 668 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
      await visual.page.setViewportSize(viewport);
      const metrics = await visual.page.evaluate(() => ({
        width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
        entryHeight: document.querySelector('[data-recover]').getBoundingClientRect().height,
        legacyActions: document.querySelectorAll('[data-dismiss-recovery]').length,
      }));
      assert.ok(metrics.scrollWidth <= metrics.width + 1, 'Horizontal overflow');
      assert.ok(metrics.entryHeight >= 44, 'Recovery target smaller than 44px');
      assert.equal(metrics.legacyActions, 0);
      const filename = 'recovery-compact-' + viewport.width + '.png';
      await visual.page.screenshot({ path: path.join(output, filename), fullPage: true });
      result.screenshots.push({ path: filename, viewport, metrics });
    }
    await visual.page.setViewportSize({ width: 614, height: 668 });
    await compact(visual.page).click();
    await visual.page.getByRole('button', { name: '確認同步', exact: true }).waitFor();
    await visual.page.screenshot({ path: path.join(output, 'recovery-confirmation-614.png'), fullPage: true });
    result.screenshots.push({ path: 'recovery-confirmation-614.png', viewport: { width: 614, height: 668 } });
  } finally { await visual.context.close(); }
  assert.equal(result.browserErrors.length, 0, JSON.stringify(result.browserErrors));
  assert.equal(result.externalRequests.length, 0, 'Unexpected external network requests');
  assert.equal(result.httpFailures.length, 0, JSON.stringify(result.httpFailures));
  assert.ok(result.cases.every(check => check.status === 'SIMULATION PASS'), 'Some recovery cases failed');
  result.sourceHashesVerifiedAfter = Object.entries(result.sourceHashes).every(([file, hash]) =>
    crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') === hash);
  assert.ok(result.sourceHashesVerifiedAfter, 'Source changed during verification');
  result.status = 'PASS';
};
const portIsReleased = port => new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.on('connect', () => { socket.destroy(); resolve(false); });
  socket.on('error', () => { socket.destroy(); resolve(true); });
});
main().catch(error => { result.runnerError = error.message; }).finally(async () => {
  if (browser) await browser.close();
  if (browserServer) {
    await browserServer.close();
    result.runtime.browserProcessExited = browserServer.process().exitCode !== null;
    result.runtime.browserPortReleased = await portIsReleased(result.runtime.browserPort);
    if (!result.runtime.browserProcessExited || !result.runtime.browserPortReleased) result.status = 'FAIL';
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, passed: result.cases.filter(check => check.status !== 'FAIL').length,
    total: result.cases.length, failures: result.cases.filter(check => check.status === 'FAIL'),
    runnerError: result.runnerError, runtime: result.runtime }));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
});
