/* eslint-disable */
// UI/IndexedDB simulation only. Auth and RPC are injected stubs with no credential.
// This runner never performs hosted Auth/RPC and never owns the app server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');

const projectRoot = path.resolve(__dirname, '..');
const baseUrlValue = process.env.DEV133_BASE_URL;
const sourceRootValue = process.env.DEV133_SOURCE_ROOT;
const outputValue = process.env.DEV133_OUTPUT_DIR;
const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';

assert.ok(baseUrlValue, 'DEV133_BASE_URL is required');
assert.ok(sourceRootValue, 'DEV133_SOURCE_ROOT is required and must point to frozen source');
assert.ok(outputValue, 'DEV133_OUTPUT_DIR is required and must be unique for this run');
assert.ok(path.isAbsolute(outputValue), 'DEV133_OUTPUT_DIR must be an absolute path');

const baseUrl = new URL(baseUrlValue);
assert.equal(baseUrl.protocol, 'http:', 'Only a loopback HTTP app server is allowed');
assert.ok(['localhost', '127.0.0.1'].includes(baseUrl.hostname), 'DEV133_BASE_URL must use localhost or 127.0.0.1');
assert.ok(baseUrl.port, 'DEV133_BASE_URL must specify a port');
assert.equal(baseUrl.username, '', 'Credentials in DEV133_BASE_URL are forbidden');
assert.equal(baseUrl.password, '', 'Credentials in DEV133_BASE_URL are forbidden');
assert.equal(baseUrl.pathname, '/', 'DEV133_BASE_URL must be an origin, without a path');
assert.equal(baseUrl.search, '', 'DEV133_BASE_URL must not include a query');
assert.equal(baseUrl.hash, '', 'DEV133_BASE_URL must not include a fragment');
const origin = baseUrl.origin;
const route = new URL('/quick-task/?install=1', origin).href;

const requestedSourceRoot = fs.realpathSync(path.resolve(sourceRootValue));
assert.ok(fs.statSync(requestedSourceRoot).isDirectory(), 'DEV133_SOURCE_ROOT must be a directory');
const candidateUnderRequestedRoot = path.join(requestedSourceRoot, 'candidate');
const sourceRoot = fs.existsSync(path.join(requestedSourceRoot, 'source-manifest.json'))
  ? requestedSourceRoot
  : candidateUnderRequestedRoot;
assert.ok(fs.statSync(sourceRoot).isDirectory(), 'DEV133_SOURCE_ROOT must contain the frozen candidate source');
assert.ok(fs.existsSync(path.join(sourceRoot, 'source-manifest.json')), 'Frozen candidate/source-manifest.json is required');
assert.ok(fs.statSync(path.join(sourceRoot, 'quick-task/index.html')).isFile(), 'Frozen source root is missing quick-task/index.html');
assert.equal(sourceRoot, fs.realpathSync(sourceRoot), 'Frozen source root must resolve to its canonical directory');
assert.notEqual(sourceRoot, fs.realpathSync(projectRoot), 'DEV133_SOURCE_ROOT must be a frozen root separate from the working checkout');

const outputDir = path.resolve(outputValue);
const outputRelativeToSource = path.relative(sourceRoot, outputDir);
const outputIsInsideSource = outputRelativeToSource === ''
  || (!path.isAbsolute(outputRelativeToSource)
    && outputRelativeToSource !== '..'
    && !outputRelativeToSource.startsWith('..' + path.sep));
assert.equal(outputIsInsideSource, false, 'DEV133_OUTPUT_DIR must be outside DEV133_SOURCE_ROOT');
assert.equal(fs.existsSync(outputDir), false, 'DEV133_OUTPUT_DIR already exists; refusing to overwrite prior evidence');

const sourceFiles = [
  'quick-task/index.html',
  'src/quickTask/main.ts',
  'src/quickTask/quick-task.css',
  'src/features/quickTaskCapture/auth.ts',
  'src/features/quickTaskCapture/model.ts',
  'src/features/quickTaskCapture/outbox.ts',
  'src/features/quickTaskCapture/sync.ts',
  'src/services/supabase/quickTaskCaptureService.ts',
];
const hashFiles = files => Object.fromEntries(files.map(file => {
  const absolute = path.join(sourceRoot, file);
  assert.ok(fs.statSync(absolute).isFile(), 'Missing frozen source file: ' + file);
  return [file, crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')];
}));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceManifestPath = path.join(sourceRoot, 'source-manifest.json');
const sourceManifestBytes = fs.readFileSync(sourceManifestPath);
const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
assert.ok(sourceManifest && typeof sourceManifest === 'object' && sourceManifest.hashes && typeof sourceManifest.hashes === 'object',
  'Frozen source manifest must include its hash map');
assert.match(sourceManifest.baseProductCommit || '', /^[0-9a-f]{40}$/i, 'Frozen source manifest must identify baseProductCommit');
assert.match(sourceManifest.digest || '', /^[0-9a-f]{64}$/i, 'Frozen source manifest must identify the frozen digest');
assert.match(sourceManifest.uiOverlayDigest || '', /^[0-9a-f]{64}$/i, 'Frozen source manifest must identify uiOverlayDigest');
const manifestSha256 = sha256(sourceManifestBytes);
assert.equal(sha256(JSON.stringify(sourceManifest.hashes)), sourceManifest.digest,
  'Frozen source manifest digest does not match its selected hash map');
const sourceHashes = hashFiles(sourceFiles);
for (const [file, actualHash] of Object.entries(sourceHashes)) {
  assert.equal(sourceManifest.hashes[file], actualHash, 'Frozen source hash disagrees with source manifest: ' + file);
}
const overlayFiles = ['src/quickTask/main.ts', 'src/quickTask/quick-task.css', 'quick-task/index.html'];
const overlayHashes = Object.fromEntries(overlayFiles.map(file => [file, sourceHashes[file]]));
assert.equal(sha256(JSON.stringify(overlayHashes)), sourceManifest.uiOverlayDigest,
  'Frozen UI overlay digest does not match the selected UI source hashes');
const EXPECTED_CASE_COUNT = 25;
const { chromium } = require(playwrightModule);

// A new directory is required so this runner cannot replace an earlier PASS report.
fs.mkdirSync(outputDir, { recursive: true });
const result = {
  devId: 'DEV-133',
  slice: 'unified-sync-status-panel',
  status: 'FAIL',
  layer: 'Loopback UI and real IndexedDB; Auth/RPC module stubs only; hosted integration NOT RUN',
  hostedAuthRpc: 'PROHIBITED',
  authCredentialInjected: false,
  route,
  sourceRoot,
  sourceIdentity: {
    manifestPath: sourceManifestPath,
    manifestSha256,
    baseProductCommit: sourceManifest.baseProductCommit,
    frozenDigest: sourceManifest.digest,
    baseDigest: sourceManifest.baseDigest ?? null,
    uiOverlayDigest: sourceManifest.uiOverlayDigest,
  },
  sourceHashes,
  cases: [],
  screenshots: [],
  browserErrors: [],
  requestFailures: [],
  externalRequests: [],
  forbiddenAuthRpcRequests: [],
  httpFailures: [],
  visibleErrorFindings: [],
  visibleAccountWarningObservations: [],
  stubbedModules: { auth: 0, rpc: 0 },
  runtime: {
    project: 'ProJED',
    purpose: 'DEV-133 unified sync status UI simulation',
    appPort: Number(baseUrl.port),
    appRuntimeOwnership: 'Pre-existing loopback app runtime; runner does not start or stop it',
    browserPort: 0,
    browserProcessExited: null,
    browserPortReleased: null,
    cleanupCondition: 'Close all isolated contexts and only this runner-owned BrowserServer; preserve the app runtime',
  },
};

const makeRecord = (number, fields = {}) => ({
  schemaVersion: 1,
  captureId: 'task_workbench_unplaced_00000000-0000-4000-8000-' + String(number).padStart(12, '0'),
  accountId: null,
  title: '測試待辦 ' + number,
  workspaceHint: null,
  clientCreatedAt: Date.now() - 10000 + number,
  updatedAt: Date.now() - 1000,
  state: 'awaiting_auth',
  attemptCount: 0,
  nextAttemptAt: null,
  lastErrorCode: null,
  leaseId: null,
  leaseExpiresAt: null,
  claimIntent: null,
  receipt: null,
  ...fields,
});
const unbound = (count = 4) => Array.from({ length: count }, (_, index) => makeRecord(index + 1));

// The snapshot intentionally has no access token or bearer credential.
const authModule = [
  "import { getQuickAuthContext, saveQuickAuthContext } from '/src/features/quickTaskCapture/outbox.ts';",
  'let epoch = 1;',
  'let account = window.__qaAccount;',
  'let snapshot = account ? { accountId: account, authEpoch: epoch } : null;',
  'let authCallback = null;',
  'export const getQuickAuthSnapshot = () => snapshot;',
  'export const getQuickSessionLoadState = () => window.__qaUnreachable ? "unreachable" : snapshot ? "authenticated" : "unauthenticated";',
  'export const isQuickBindingContextCurrent = context => Boolean(context?.bindingAllowed && (snapshot ? snapshot.accountId === context.accountId : window.__qaUnreachable));',
  'export const bumpQuickAuthEpoch = () => { epoch += 1; snapshot = null; };',
  'export const loadQuickSession = async () => { await window.__fixtureReady; return snapshot; };',
  'export const getQuickBindingContext = async () => {',
  '  await window.__fixtureReady;',
  '  const context = await getQuickAuthContext();',
  '  return context?.bindingAllowed ? context : null;',
  '};',
  'export const verifyQuickSessionState = async expected => {',
  '  window.__qaVerificationActive += 1;',
  '  try {',
  '  await window.__fixtureReady;',
  '  window.__qaVerificationCount += 1;',
  '  if (window.__qaVerificationGate) await window.__qaVerificationGate;',
  '  if (window.__qaUnreachable) return { status: "unreachable", snapshot: null };',
  '  if (!snapshot) return { status: "unauthenticated", snapshot: null };',
  '  if (expected && (snapshot.accountId !== expected.accountId || snapshot.authEpoch !== expected.authEpoch)) return { status: "stale", snapshot: null };',
  '  const current = await getQuickAuthContext();',
  '  const context = { key: "current", projectRef: "fixture", accountId: snapshot.accountId, displayLabel: snapshot.accountId + "@example.invalid", verifiedAt: Date.now(), bindingAllowed: true, revision: current?.accountId === snapshot.accountId ? current.revision : (current?.revision ?? 0) + 1, barrierAt: null, sessionId: "fixture-session-" + epoch };',
  '  await saveQuickAuthContext(context, current?.revision);',
  '  const verified = { ...snapshot, email: context.displayLabel, contextRevision: context.revision, contextProjectRef: "fixture" };',
  '  window.__qaVerified = true;',
  '  return { status: "verified", snapshot: verified };',
  '  } finally { window.__qaVerificationActive -= 1; }',
  '};',
  'export const verifyQuickSession = async expected => { const result = await verifyQuickSessionState(expected); return result.snapshot; };',
  'export const startQuickGoogleSignIn = async redirect => { window.__qaLoginCalls.push(redirect); };',
  'export const signOutQuickSession = async () => window.__qaSwitchAccount(null);',
  'export const completeQuickOAuthCallback = async () => null;',
  'export const subscribeQuickAuth = async callback => {',
  '  authCallback = callback;',
  '  window.__qaRefreshStatus = () => { window.__qaRefreshCount += 1; if (authCallback) authCallback(snapshot); };',
  '  window.__qaSwitchAccount = next => { account = next; epoch += 1; snapshot = next ? { accountId: next, authEpoch: epoch } : null; if (authCallback) authCallback(snapshot); };',
  '  queueMicrotask(() => callback(snapshot));',
  '  return { unsubscribe() { authCallback = null; } };',
  '};',
].join('\n');

const serviceModule = [
  'export const createQuickUnplacedTask = async ({ capture, auth }) => {',
  '  window.__qaRpcCalls.push({ captureId: capture.captureId, accountId: auth.accountId });',
  '  if (window.__qaRpcMode === "conflict") throw Object.assign(new Error("fixture idempotency conflict"), { code: "QT_IDEMPOTENCY_CONFLICT", status: 409 });',
  '  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(capture.title));',
  '  const titleHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");',
  '  return { status: "committed", captureId: capture.captureId, ownerId: auth.accountId, titleHash: window.__qaRpcMode === "invalid-receipt" ? "0".repeat(64) : titleHash, committedAt: Date.now(), created: true };',
  '};',
].join('\n');

let browserServer;
let browser;
const activeContexts = new Set();

const openFixture = async (records = [], options = {}) => {
  const context = await browser.newContext({ viewport: { width: 726, height: 668 } });
  activeContexts.add(context);
  await context.addInitScript(({ records, options }) => {
    if (location.origin === 'null') return;
    window.__qaAccount = options.account ?? null;
    window.__qaUnreachable = options.unreachable ?? false;
    window.__qaRpcMode = options.rpcMode ?? 'success';
    window.__qaRpcCalls = [];
    window.__qaLoginCalls = [];
    window.__qaVerificationCount = 0;
    window.__qaVerificationActive = 0;
    window.__qaRefreshCount = 0;
    window.__fixtureReady = (async () => {
      const fixtureRecords = [];
      for (const source of records) {
        const record = { ...source };
        if (record.receipt === '__VALID_RECEIPT__') {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(record.title));
          const titleHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          record.receipt = {
            status: 'committed',
            captureId: record.captureId,
            ownerId: record.accountId,
            titleHash,
            committedAt: Date.now() - 100,
            created: true,
          };
        }
        fixtureRecords.push(record);
      }
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('projed-quick-task-v1', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          const captures = db.objectStoreNames.contains('captures')
            ? request.transaction.objectStore('captures')
            : db.createObjectStore('captures', { keyPath: 'captureId' });
          if (!captures.indexNames.contains('accountId')) captures.createIndex('accountId', 'accountId');
          if (!captures.indexNames.contains('state')) captures.createIndex('state', 'state');
          if (!captures.indexNames.contains('claimIntent.nonceHash')) {
            captures.createIndex('claimIntent.nonceHash', 'claimIntent.nonceHash', { unique: true });
          }
          if (!db.objectStoreNames.contains('auth_context')) db.createObjectStore('auth_context', { keyPath: 'key' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['captures', 'auth_context'], 'readwrite');
          const captures = tx.objectStore('captures');
          const count = captures.count();
          count.onsuccess = () => {
            if (count.result === 0 && !sessionStorage.getItem('qa-seeded')) {
              fixtureRecords.forEach(record => captures.put(record));
              if (options.account) tx.objectStore('auth_context').put({
                key: 'current',
                projectRef: 'fixture',
                accountId: options.account,
                displayLabel: options.account + '@example.invalid',
                verifiedAt: Date.now(),
                bindingAllowed: true,
                revision: 1,
                barrierAt: null,
                sessionId: 'fixture-session-1',
              });
            }
          };
          tx.oncomplete = () => {
            sessionStorage.setItem('qa-seeded', '1');
            window.__qaSeedCount = fixtureRecords.length;
            db.close();
            resolve();
          };
          tx.onerror = () => { db.close(); reject(tx.error); };
          tx.onabort = () => { db.close(); reject(tx.error); };
        };
      });
    })();
  }, { records, options });

  await context.route('**/*', async requestRoute => {
    const requestUrl = new URL(requestRoute.request().url());
    if (requestUrl.origin !== origin) {
      result.externalRequests.push(requestUrl.origin);
      return requestRoute.abort();
    }
    if (/\/(?:auth\/v1|rest\/v1\/rpc)(?:\/|$)/i.test(requestUrl.pathname)) {
      result.forbiddenAuthRpcRequests.push(requestUrl.href);
      return requestRoute.abort();
    }
    if (requestUrl.pathname.endsWith('/src/features/quickTaskCapture/auth.ts')) {
      result.stubbedModules.auth += 1;
      return requestRoute.fulfill({ status: 200, contentType: 'application/javascript', body: authModule });
    }
    if (requestUrl.pathname.endsWith('/src/services/supabase/quickTaskCaptureService.ts')) {
      result.stubbedModules.rpc += 1;
      return requestRoute.fulfill({ status: 200, contentType: 'application/javascript', body: serviceModule });
    }
    if (requestUrl.pathname.endsWith('/src/quickTask/main.ts')) {
      try {
        await requestRoute.request().frame().page().evaluate(() => window.__fixtureReady);
      } catch (error) {
        result.browserErrors.push('Fixture seeding failed before app bootstrap: ' + error.message);
        return requestRoute.abort();
      }
    }
    return requestRoute.continue();
  });

  const page = await context.newPage();
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') result.browserErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    if (new URL(request.url()).origin === origin) {
      result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' });
    }
  });
  page.on('response', response => {
    if (response.status() >= 400) result.httpFailures.push({ status: response.status(), url: response.url() });
  });
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const status = document.querySelector('#quick-task-auth-status');
    return status && !status.textContent.includes('正在');
  });

  const rows = await readRows(page);
  assert.equal(rows.length, records.length, 'Seeded fixture row count changed during bootstrap');
  assert.equal(new Set(rows.map(record => record.captureId)).size, rows.length, 'Fixture contains duplicate capture IDs');
  assert.ok(rows.every(record => typeof record.title === 'string' && (record.accountId === null || typeof record.accountId === 'string')),
    'Fixture contains an invalid title or owner');
  return { context, page };
};

const readRows = page => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('projed-quick-task-v1', 2);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const read = db.transaction('captures', 'readonly').objectStore('captures').getAll();
    read.onsuccess = () => { db.close(); resolve(read.result); };
    read.onerror = () => { db.close(); reject(read.error); };
  };
}));

const waitForRecord = async (page, captureId, predicate, label) => {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const record = (await readRows(page)).find(candidate => candidate.captureId === captureId);
    if (record && predicate(record)) return record;
    await page.waitForTimeout(60);
  }
  throw new Error('Timed out waiting for record ' + captureId + ' ' + (label || 'condition'));
};

const waitForButton = (page, name) => page.getByRole('button', { name, exact: true }).waitFor({ state: 'visible', timeout: 12000 });
const panel = page => page.locator('#quick-task-recovery');
const summary = page => page.locator('#quick-task-recovery > summary[data-recover]');
const summaryLabel = page => page.locator('#quick-task-recovery [data-recover-summary]');
const noPanel = page => panel(page).waitFor({ state: 'hidden' });
const calls = page => page.evaluate(() => ({
  rpc: window.__qaRpcCalls,
  login: window.__qaLoginCalls,
  verificationCount: window.__qaVerificationCount,
  refreshCount: window.__qaRefreshCount,
}));
const isPanelOpen = page => panel(page).evaluate(element => element.open);
const togglePanelTo = async (page, open) => {
  if (await isPanelOpen(page) === open) return;
  await summary(page).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(expected => document.querySelector('#quick-task-recovery')?.open === expected, open);
};
const dataCount = async page => Number(await summaryLabel(page).getAttribute('data-count') || 0);
const summaryDomText = page => summary(page).evaluate(element => element.textContent || '');

const visibleErrorSweep = async (page, caseId) => {
  const findings = await page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const nodes = Array.from(document.querySelectorAll('.inline-error, [role="alert"]'))
      .filter(visible)
      .map(element => (element.innerText || element.textContent || '').trim())
      .filter(Boolean);
    const bodyText = document.body.innerText || '';
    const infrastructureText = bodyText.match(/\bHTTP\s*[45]\d{2}\b|Internal Server Error|Not Found|\/api\/[^\s]*/gi) || [];
    return { nodes, infrastructureText };
  });
  const entry = { caseId, ...findings };
  result.visibleErrorFindings.push(entry);
  assert.deepEqual(findings.nodes, [], 'Unexpected visible alert/inline error');
  assert.deepEqual(findings.infrastructureText, [], 'Unexpected route/server error text');
};

const runCase = async (id, records, options, check) => {
  let fixture;
  try {
    fixture = await openFixture(records, options);
    await check(fixture.page);
    await visibleErrorSweep(fixture.page, id);
    result.cases.push({ id, status: 'SIMULATION PASS' });
  } catch (error) {
    result.cases.push({ id, status: 'FAIL', error: error.message, stack: error.stack });
  } finally {
    if (fixture) {
      await fixture.context.close();
      activeContexts.delete(fixture.context);
    }
  }
};

const main = async () => {
  browserServer = await chromium.launchServer({
    headless: true,
    host: '127.0.0.1',
    port: 0,
    executablePath: process.env.DEV133_CHROME_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  result.runtime.browserPid = browserServer.process().pid;
  result.runtime.browserPort = Number(new URL(browserServer.wsEndpoint()).port);
  browser = await chromium.connect(browserServer.wsEndpoint());
  result.browserVersion = browser.version();

  await runCase('R01-empty-no-recovery-status-and-create', [], {}, async page => {
    await noPanel(page);
    assert.equal(await page.locator('#quick-task-message').isVisible(), false);
    assert.equal(await page.locator('#quick-task-success').isVisible(), false);
    await page.getByRole('textbox', { name: '任務名稱' }).fill('最近任務：本機保存');
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await page.getByText('已記下，待同步', { exact: true }).waitFor();
    await panel(page).waitFor({ state: 'visible' });
    assert.equal(await isPanelOpen(page), true, 'The panel must open on first appearance');
    const summaryText = await summaryDomText(page);
    assert.ok(summaryText.includes('已記下，待同步'));
    assert.ok(summaryText.includes('最近任務：本機保存'));
    assert.ok(summaryText.includes('需確認同步帳號'));
    assert.equal(summaryText.split('最近任務：本機保存').length - 1, 1, 'The recent title must appear once in the summary');
    assert.equal(await dataCount(page), 0);
    const rows = await readRows(page);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].accountId, null);
    assert.equal((await calls(page)).rpc.length, 0);
    const title = page.getByRole('textbox', { name: '任務名稱' });
    await title.fill('下一筆輸入');
    await noPanel(page);
    await title.fill('');
    await panel(page).waitFor({ state: 'visible' });
    assert.equal(await isPanelOpen(page), true);
    assert.equal((await readRows(page)).length, 1);
  });

  await runCase('R02-same-owner-automatic-states-not-manual-recovery', [
    makeRecord(1, { accountId: 'A', state: 'pending' }),
    makeRecord(2, { accountId: 'A', state: 'failed_retryable', nextAttemptAt: Date.now() + 600000 }),
    makeRecord(3, { accountId: 'A', state: 'syncing', leaseId: 'active', leaseExpiresAt: Date.now() + 600000 }),
    makeRecord(4, { accountId: 'A', state: 'synced', receipt: '__VALID_RECEIPT__' }),
  ], { account: 'A' }, async page => {
    await noPanel(page);
    const rows = await readRows(page);
    assert.equal(rows.length, 4);
    assert.equal(rows.find(record => record.captureId.endsWith('000000000001')).state, 'synced');
    assert.equal((await calls(page)).rpc.length, 1);
    assert.equal((await calls(page)).rpc[0].accountId, 'A');
  });

  await runCase('R03-unreachable-owner-remains-automatic', [
    makeRecord(1, { accountId: 'A', state: 'pending' }),
  ], { account: 'A', unreachable: true }, async page => {
    await noPanel(page);
    const row = (await readRows(page))[0];
    assert.equal(row.accountId, 'A');
    assert.equal(row.state, 'pending');
    assert.equal((await calls(page)).rpc.length, 0);
  });

  await runCase('R04-anonymous-unbound-summary-list-and-keyboard', unbound(), {}, async page => {
    await panel(page).waitFor({ state: 'visible' });
    assert.equal(await isPanelOpen(page), true);
    assert.equal(await summaryLabel(page).textContent(), '本機待同步任務');
    assert.equal(await dataCount(page), 4);
    assert.equal(await page.locator('#quick-task-recovery-list > li').count(), 4);
    const authStyle = await page.locator('#quick-task-auth-status').evaluate(element => ({
      text: element.innerText,
      state: element.getAttribute('data-state'),
      color: getComputedStyle(element).color,
      explanationCount: element.querySelectorAll('.quick-task-auth-explanation').length,
    }));
    assert.match(authStyle.text, /此快速 App 尚未登入/);
    assert.equal(authStyle.state, 'unauthenticated');
    assert.equal(authStyle.color, 'rgb(185, 28, 28)');
    assert.equal(authStyle.explanationCount, 1);
    await summary(page).focus();
    assert.equal(await summary(page).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#quick-task-recovery')?.open === false);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#quick-task-recovery')?.open === true);
    const rows = await readRows(page);
    assert.ok(rows.every(record => record.accountId === null));
    assert.equal((await calls(page)).rpc.length, 0);
    assert.equal((await calls(page)).login.length, 0);
    const title = page.getByRole('textbox', { name: '任務名稱' });
    await title.fill('仍可快速輸入');
    await noPanel(page);
    await title.fill('');
    await panel(page).waitFor({ state: 'visible' });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await readRows(page)).length, 4);
    assert.equal(await dataCount(page), 4);
  });

  await runCase('R05-claim-defer-confirm-same-id-and-new-nonce', unbound(), { account: 'A' }, async page => {
    await panel(page).waitFor({ state: 'visible' });
    assert.equal(await isPanelOpen(page), true);
    await waitForButton(page, '確認同步');
    assert.match(await panel(page).innerText(), /同步到 A@example\.invalid/);
    const before = (await readRows(page))[0];
    const nonceBefore = before.claimIntent?.nonceHash;
    assert.ok(nonceBefore);
    assert.equal(before.accountId, null);
    assert.equal((await calls(page)).rpc.length, 0);
    await page.getByRole('button', { name: '稍後處理', exact: true }).click();
    await togglePanelTo(page, true);
    await waitForButton(page, '確認同步');
    const nonceAfter = (await readRows(page))[0].claimIntent?.nonceHash;
    assert.notEqual(nonceAfter, nonceBefore);
    await page.getByRole('button', { name: '確認同步', exact: true }).click();
    const completed = await waitForRecord(page, before.captureId, record => record.state === 'synced', 'confirmed sync');
    assert.equal(completed.accountId, 'A');
    assert.equal(completed.title, before.title);
    assert.ok(completed.receipt);
    assert.equal((await readRows(page)).filter(record => record.accountId === null).length, 3);
    assert.equal(await dataCount(page), 3);
    assert.deepEqual((await calls(page)).rpc, [{ captureId: before.captureId, accountId: 'A' }]);
    assert.equal((await calls(page)).login.length, 0);
  });

  await runCase('R06-account-switch-requires-new-confirmation', unbound(), { account: 'A' }, async page => {
    await panel(page).waitFor({ state: 'visible' });
    await waitForButton(page, '確認同步');
    const before = (await readRows(page))[0].claimIntent?.nonceHash;
    await page.evaluate(() => window.__qaSwitchAccount('B'));
    const switchedRows = await readRows(page);
    assert.equal(switchedRows[0].accountId, null);
    assert.equal((await calls(page)).rpc.length, 0);
    await panel(page).waitFor({ state: 'visible' });
    await togglePanelTo(page, true);
    await waitForButton(page, '確認同步');
    assert.match(await panel(page).innerText(), /同步到 B@example\.invalid/);
    assert.notEqual((await readRows(page))[0].claimIntent?.nonceHash, before);
    assert.equal((await readRows(page))[0].accountId, null);
  });

  await runCase('R07-reload-does-not-reuse-claim-confirmation', unbound(), { account: 'A' }, async page => {
    await waitForButton(page, '確認同步');
    const rowBefore = (await readRows(page))[0];
    const nonceBefore = rowBefore.claimIntent?.nonceHash;
    await page.reload({ waitUntil: 'networkidle' });
    const rowAfter = await waitForRecord(page, rowBefore.captureId, record => Boolean(record.claimIntent?.nonceHash), 'fresh claim intent');
    assert.equal(rowAfter.accountId, null);
    assert.notEqual(rowAfter.claimIntent?.nonceHash, nonceBefore);
    await waitForButton(page, '確認同步');
    assert.equal((await calls(page)).rpc.length, 0);
  });

  await runCase('R08-exhausted-record-can-manually-retry-same-id', [
    makeRecord(1, { accountId: 'A', state: 'failed_permanent', lastErrorCode: 'AUTO_RETRY_EXHAUSTED', attemptCount: 8 }),
  ], { account: 'A' }, async page => {
    assert.equal(await summaryLabel(page).textContent(), '同步異常');
    assert.equal(await dataCount(page), 1);
    await waitForButton(page, '重試');
    const before = (await readRows(page))[0];
    await page.getByRole('button', { name: '重試', exact: true }).click();
    const retried = await waitForRecord(page, before.captureId, record => record.state === 'synced', 'exhausted retry');
    assert.equal(retried.captureId, before.captureId);
    assert.equal(retried.title, before.title);
    assert.equal(retried.accountId, 'A');
    assert.ok(retried.receipt);
    assert.equal((await calls(page)).rpc.length, 1);
    await noPanel(page);
    assert.doesNotMatch(await page.locator('body').innerText(), /請先登出此 App，再登入建立這些待辦的原帳號|請登入建立這些待辦的原帳號/);
  });

  await runCase('R09-workspace-recovery-keeps-workbench-cta', [
    makeRecord(1, { accountId: 'A', state: 'failed_permanent', lastErrorCode: 'QT_NO_AVAILABLE_WORKSPACE' }),
  ], { account: 'A' }, async page => {
    await waitForButton(page, '前往工作台');
    assert.match(await panel(page).innerText(), /完成帳號與工作台設定/);
    assert.equal(await page.getByRole('button', { name: '重試', exact: true }).count(), 1);
    assert.equal((await calls(page)).rpc.length, 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /請先登出此 App，再登入建立這些待辦的原帳號|請登入建立這些待辦的原帳號/);
  });

  await runCase('R10-conflict-record-is-not-blindly-retried-or-rendered-as-html', [
    makeRecord(1, {
      accountId: 'A',
      state: 'failed_permanent',
      lastErrorCode: 'QT_IDEMPOTENCY_CONFLICT',
      title: '<img src=x onerror=window.__qaXss=true>',
    }),
  ], { account: 'A' }, async page => {
    assert.equal(await summaryLabel(page).textContent(), '同步異常');
    await waitForButton(page, '返回');
    assert.equal(await page.getByRole('button', { name: '重試', exact: true }).count(), 0);
    assert.equal(await panel(page).locator('img').count(), 0);
    assert.match(await panel(page).innerText(), /需要查證/);
    assert.ok((await panel(page).innerText()).includes('<img src=x onerror=window.__qaXss=true>'));
    assert.equal((await readRows(page))[0].accountId, 'A');
    assert.equal((await calls(page)).rpc.length, 0);
  });

  await runCase('R11-foreign-owner-is-counted-without-title', [
    makeRecord(1, { accountId: 'B', state: 'pending', title: '不可出現在 A 畫面的 B 名稱' }),
  ], { account: 'A' }, async page => {
    await panel(page).waitFor({ state: 'visible' });
    assert.equal(await summaryLabel(page).textContent(), '原帳號待辦');
    assert.equal(await dataCount(page), 1);
    assert.equal(await page.locator('#quick-task-recovery-list > li').count(), 0);
    assert.equal((await panel(page).innerText()).includes('不可出現在 A 畫面的 B 名稱'), false);
    assert.equal((await page.locator('body').innerText()).includes('不可出現在 A 畫面的 B 名稱'), false);
    assert.equal((await readRows(page))[0].accountId, 'B');
    assert.equal((await calls(page)).rpc.length, 0);
  });

  await runCase('R12-auth-failure-keeps-owner-and-uses-login-action', [
    makeRecord(1, { accountId: 'A', state: 'failed_auth', lastErrorCode: 'QT_AUTH_REQUIRED' }),
  ], { account: 'A', unreachable: true }, async page => {
    await waitForButton(page, '重新登入');
    await page.getByRole('button', { name: '重新登入', exact: true }).click();
    assert.deepEqual((await calls(page)).login, [route.replace('/quick-task/?install=1', '/quick-task/')]);
    assert.equal((await calls(page)).rpc.length, 0);
    assert.equal((await readRows(page))[0].accountId, 'A');
  });

  await runCase('R13-account-switch-during-confirmation-does-not-bind', unbound(), { account: 'A' }, async page => {
    await waitForButton(page, '確認同步');
    await page.evaluate(() => { window.__qaVerificationGate = new Promise(resolve => { window.__qaReleaseVerification = resolve; }); });
    await page.getByRole('button', { name: '確認同步', exact: true }).click();
    await page.evaluate(() => { window.__qaSwitchAccount('B'); window.__qaReleaseVerification(); });
    await page.waitForFunction(() => window.__qaVerificationActive === 0
      && document.querySelector('#quick-task-auth-status')?.textContent.includes('B@example.invalid'));
    await page.getByText('同步到 B@example.invalid', { exact: true }).waitFor();
    const rows = await readRows(page);
    assert.ok(rows.every(record => record.accountId === null));
    assert.equal((await calls(page)).rpc.length, 0);
  });

  await runCase('R14-expired-claim-nonce-preserves-record', unbound(), { account: 'A' }, async page => {
    await waitForButton(page, '確認同步');
    const before = (await readRows(page))[0];
    await page.evaluate(async captureId => {
      const request = indexedDB.open('projed-quick-task-v1', 2);
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('captures', 'readwrite');
      const store = tx.objectStore('captures');
      const get = store.get(captureId);
      get.onsuccess = () => store.put({ ...get.result, claimIntent: { ...get.result.claimIntent, expiresAt: Date.now() - 1 } });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, before.captureId);
    await page.getByRole('button', { name: '確認同步', exact: true }).click();
    await page.waitForTimeout(100);
    const after = (await readRows(page))[0];
    assert.equal(after.accountId, null);
    assert.equal(after.captureId, before.captureId);
    assert.equal(after.title, before.title);
    assert.equal((await calls(page)).rpc.length, 0);
  });

  await runCase('R15-profile-recovery-keeps-id-and-workbench-cta', [
    makeRecord(1, { accountId: 'A', state: 'failed_permanent', lastErrorCode: '23503' }),
  ], { account: 'A' }, async page => {
    await waitForButton(page, '前往工作台');
    const before = (await readRows(page))[0];
    await page.getByRole('button', { name: '重試', exact: true }).click();
    const after = await waitForRecord(page, before.captureId, record => record.state === 'synced', 'profile recovery retry');
    assert.equal(after.captureId, before.captureId);
    assert.equal(after.title, before.title);
    assert.equal(after.accountId, 'A');
    assert.ok(after.receipt);
    assert.equal((await calls(page)).rpc.length, 1);
  });

  await runCase('R16-collapse-during-confirmation-does-not-bind', unbound(), { account: 'A' }, async page => {
    await waitForButton(page, '確認同步');
    await page.evaluate(() => { window.__qaVerificationGate = new Promise(resolve => { window.__qaReleaseVerification = resolve; }); });
    await page.getByRole('button', { name: '確認同步', exact: true }).click();
    await page.getByRole('button', { name: '稍後處理', exact: true }).click();
    await page.evaluate(() => window.__qaReleaseVerification());
    await page.waitForFunction(() => window.__qaVerificationActive === 0);
    await page.waitForFunction(() => document.querySelector('#quick-task-recovery')?.open === false);
    assert.ok((await readRows(page)).every(record => record.accountId === null));
    assert.equal((await calls(page)).rpc.length, 0);
  });

  await runCase('R17-collapse-refresh-reopen-reverifies-without-claim', [makeRecord(1)], { account: 'A' }, async page => {
    await waitForButton(page, '確認同步');
    const before = (await readRows(page))[0];
    const nonceBefore = before.claimIntent?.nonceHash;
    const verificationBefore = (await calls(page)).verificationCount;
    await summary(page).click();
    await page.waitForFunction(() => document.querySelector('#quick-task-recovery')?.open === false);
    await page.evaluate(() => window.__qaRefreshStatus());
    await page.waitForFunction(() => window.__qaRefreshCount > 0);
    await page.waitForTimeout(150);
    assert.equal(await isPanelOpen(page), false, 'A general status refresh must preserve manual collapse');
    assert.equal((await readRows(page))[0].accountId, null);
    assert.equal((await calls(page)).rpc.length, 0);
    await summary(page).click();
    await page.waitForFunction(() => document.querySelector('#quick-task-recovery')?.open === true);
    await waitForButton(page, '確認同步');
    const after = (await readRows(page))[0];
    assert.equal(after.accountId, null, 'Reopen must not bind automatically');
    assert.notEqual(after.claimIntent?.nonceHash, nonceBefore, 'Reopen must create a fresh confirmation intent');
    assert.ok((await calls(page)).verificationCount > verificationBefore, 'Reopen must reverify the session');
    assert.equal((await calls(page)).rpc.length, 0);
    assert.equal((await calls(page)).login.length, 0);
  });

  await runCase('R18-unauthenticated-red-copy-is-scoped', [], {}, async page => {
    const status = await page.locator('#quick-task-auth-status').evaluate(element => ({
      text: element.innerText,
      state: element.getAttribute('data-state'),
      color: getComputedStyle(element).color,
      explanationCount: element.querySelectorAll('.quick-task-auth-explanation').length,
      explanation: element.querySelector('.quick-task-auth-explanation')?.textContent || '',
    }));
    assert.match(status.text, /此快速 App 尚未登入/);
    assert.equal(status.state, 'unauthenticated');
    assert.equal(status.color, 'rgb(185, 28, 28)');
    assert.equal(status.explanationCount, 1);
    assert.match(status.explanation, /先記錄在本機/);
    assert.match(status.explanation, /登入.*同步至雲端/);
  });

  await runCase('R19-other-auth-network-statuses-are-not-red', [], { account: 'A', unreachable: true }, async page => {
    const status = await page.locator('#quick-task-auth-status').evaluate(element => ({
      text: element.innerText,
      state: element.getAttribute('data-state'),
      color: getComputedStyle(element).color,
      explanationCount: element.querySelectorAll('.quick-task-auth-explanation').length,
    }));
    assert.doesNotMatch(status.text, /此快速 App 尚未登入/);
    assert.equal(status.state, null);
    assert.notEqual(status.color, 'rgb(185, 28, 28)');
    assert.equal(status.explanationCount, 0);
  });

  await runCase('R20-eleven-unbound-titles-safe-and-recent-is-excluded', (() => {
    const records = unbound(11);
    records[4].title = '<img src=x onerror=window.__qaXss=true>';
    return records;
  })(), {}, async page => {
    const newTitle = '最新待辦不重複列入清單';
    const title = page.getByRole('textbox', { name: '任務名稱' });
    await title.fill(newTitle);
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await page.getByText('已記下，待同步', { exact: true }).waitFor();
    await panel(page).waitFor({ state: 'visible' });
    assert.equal(await isPanelOpen(page), true);
    assert.equal(await dataCount(page), 11, 'The current record must not be counted twice');
    assert.equal(await summaryLabel(page).getAttribute('data-count'), '11');
    assert.match(await summaryLabel(page).getAttribute('aria-label'), /11 筆/);
    const items = await page.locator('#quick-task-recovery-list > li').allTextContents();
    assert.equal(items.length, 11);
    assert.equal(items.includes(newTitle), false);
    assert.ok(items.includes('<img src=x onerror=window.__qaXss=true>'));
    assert.equal(await page.locator('#quick-task-recovery-list img').count(), 0);
    assert.equal(await page.evaluate(() => window.__qaXss === true), false);
    const rows = await readRows(page);
    assert.equal(rows.length, 12);
    assert.equal(rows.filter(record => record.title === newTitle).length, 1);
  });

  await runCase('R21-invalid-receipt-never-marks-record-synced', [], { account: 'A', rpcMode: 'invalid-receipt' }, async page => {
    const titleValue = '無效回執仍保留的任務';
    await page.getByRole('textbox', { name: '任務名稱' }).fill(titleValue);
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await page.getByText('已記下，待同步', { exact: true }).waitFor();
    const rowsAtStart = await readRows(page);
    assert.equal(rowsAtStart.length, 1);
    const captureId = rowsAtStart[0].captureId;
    const failed = await waitForRecord(page, captureId, record => record.state === 'failed_permanent', 'invalid receipt rejection');
    assert.equal(failed.captureId, captureId);
    assert.equal(failed.accountId, 'A');
    assert.equal(failed.title, titleValue);
    assert.notEqual(failed.state, 'synced');
    assert.equal(failed.receipt ?? null, null);
    assert.ok(['INVALID_RECEIPT', 'RECEIPT_INVALID'].includes(failed.lastErrorCode));
    assert.equal((await calls(page)).rpc.length, 1);
    await togglePanelTo(page, false);
    await togglePanelTo(page, true);
    await page.getByText('同步未完成', { exact: true }).waitFor();
    assert.match(await panel(page).innerText(), /查證|保留在本機/);
  });

  await runCase('R22-idempotency-conflict-preserves-record-and-is-not-retried', [], { account: 'A', rpcMode: 'conflict' }, async page => {
    const titleValue = '衝突後保留的任務';
    await page.getByRole('textbox', { name: '任務名稱' }).fill(titleValue);
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await page.getByText('已記下，待同步', { exact: true }).waitFor();
    const initial = (await readRows(page))[0];
    const failed = await waitForRecord(page, initial.captureId, record => record.state === 'failed_permanent', 'idempotency conflict');
    assert.equal(failed.captureId, initial.captureId);
    assert.equal(failed.accountId, 'A');
    assert.equal(failed.title, titleValue);
    assert.equal(failed.state, 'failed_permanent');
    assert.equal(failed.receipt ?? null, null);
    assert.ok(['QT_IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(failed.lastErrorCode));
    assert.equal((await calls(page)).rpc.length, 1);
    await togglePanelTo(page, false);
    await togglePanelTo(page, true);
    await page.getByText('同步未完成', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '重試', exact: true }).count(), 0);
    assert.equal((await readRows(page))[0].captureId, initial.captureId);
  });

  await runCase('R23-viewport-overflow-target-size-and-keyboard-contract', unbound(), {}, async page => {
    const screenshots = [];
    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 726, height: 668 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const entry = document.querySelector('#quick-task-recovery > summary[data-recover]');
        const details = document.querySelector('#quick-task-recovery');
        const label = document.querySelector('#quick-task-recovery-summary');
        const labelStyle = getComputedStyle(label);
        const ids = (entry?.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean);
        return {
          width: root.clientWidth,
          scrollWidth: root.scrollWidth,
          entryHeight: entry?.getBoundingClientRect().height || 0,
          hasDetails: details instanceof HTMLDetailsElement,
          hasSummary: entry instanceof HTMLElement,
          controlledIdsExist: ids.length > 0 && ids.every(id => document.getElementById(id)),
          labelHeight: label.getBoundingClientRect().height,
          labelLineHeight: parseFloat(labelStyle.lineHeight) || parseFloat(labelStyle.fontSize) * 1.6,
        };
      });
      assert.ok(metrics.hasDetails && metrics.hasSummary, 'Native details/summary contract is missing');
      assert.ok(metrics.controlledIdsExist, 'summary aria-controls points to missing content');
      assert.ok(metrics.scrollWidth <= metrics.width + 1, 'Horizontal overflow at ' + viewport.width + 'px');
      assert.ok(metrics.entryHeight >= 44, 'Summary operation target is below 44px at ' + viewport.width + 'px');
      assert.ok(metrics.labelHeight <= metrics.labelLineHeight + 1, 'Short summary label and count must stay on one line at ' + viewport.width + 'px');
      const screenshot = 'viewport-' + viewport.width + '.png';
      await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
      screenshots.push({ path: screenshot, viewport, metrics });
    }
    result.screenshots.push(...screenshots);
    await togglePanelTo(page, false);
    assert.equal(await isPanelOpen(page), false);
    await togglePanelTo(page, true);
    assert.equal(await isPanelOpen(page), true);
    const list = await page.locator('#quick-task-recovery-list > li').allTextContents();
    assert.equal(list.length, 4);
  });

  await runCase('R24-successful-latest-status-and-title-share-summary', [], { account: 'A' }, async page => {
    const titleValue = '已同步的最近任務';
    await noPanel(page);
    assert.equal(await page.locator('#quick-task-message').isVisible(), false);
    assert.equal(await page.locator('#quick-task-success').isVisible(), false);
    assert.equal((await readRows(page)).length, 0);
    await page.evaluate(() => {
      const phrases = ['請先登出此 App，再登入建立這些待辦的原帳號', '請登入建立這些待辦的原帳號'];
      const visibleWarnings = [];
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
          && rect.width > 0 && rect.height > 0;
      };
      const collect = () => {
        for (const selector of ['#quick-task-message', '#quick-task-recovery-message']) {
          const element = document.querySelector(selector);
          const text = (element?.innerText || element?.textContent || '').trim();
          if (element && visible(element) && phrases.some(phrase => text.includes(phrase))) {
            visibleWarnings.push({ selector, text });
          }
        }
      };
      window.__qaVisibleAccountWarnings = visibleWarnings;
      window.__qaAccountWarningObserver = new MutationObserver(collect);
      window.__qaAccountWarningObserver.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['hidden', 'open', 'style', 'class'],
      });
    });
    await page.getByRole('textbox', { name: '任務名稱' }).fill(titleValue);
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await page.locator('#quick-task-success strong').waitFor({ state: 'visible' });
    const rows = await readRows(page);
    assert.equal(rows.length, 1);
    const saved = await waitForRecord(page, rows[0].captureId, record => record.state === 'synced', 'automatic sync');
    assert.equal(saved.accountId, 'A');
    assert.equal(saved.title, titleValue);
    assert.ok(saved.receipt);
    await panel(page).waitFor({ state: 'visible' });
    assert.equal(await isPanelOpen(page), true);
    const syncedStatus = '此任務已同步至 ProJED 主程式。';
    await page.getByText(syncedStatus, { exact: true }).waitFor({ state: 'visible' });
    const text = await summaryDomText(page);
    assert.match(text, /已建立/);
    assert.ok(text.includes(titleValue));
    assert.equal(text.split(titleValue).length - 1, 1);

    await togglePanelTo(page, false);
    assert.equal(await isPanelOpen(page), false);
    await togglePanelTo(page, true);
    assert.equal(await isPanelOpen(page), true);
    await page.getByText(/^(?:此任務|最近一筆任務)已同步至 ProJED 主程式。$/).waitFor({ state: 'visible' });

    // Delay only delivery of a real completed IDB read. Closing the panel and
    // starting the next draft must invalidate that older recovery interaction.
    // Auth/RPC remain the existing simulation; no capture is rewritten here.
    await togglePanelTo(page, false);
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction;
      let reads = 0;
      window.__qaReadGateHeld = false;
      window.__qaRestoreReadGate = () => { IDBDatabase.prototype.transaction = original; };
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = original.apply(this, args);
        const stores = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
        if (args[1] === 'readonly' && stores.length === 1 && stores[0] === 'captures') {
          const gated = ++reads === 2;
          let handler = null;
          Object.defineProperty(tx, 'oncomplete', {
            configurable: true,
            get: () => handler,
            set: value => { handler = value; },
          });
          tx.addEventListener('complete', event => {
            const deliver = () => handler?.call(tx, event);
            if (gated) {
              window.__qaDeliverOldRead = deliver;
              window.__qaReadGateHeld = true;
              window.__qaRestoreReadGate();
            } else deliver();
          }, { once: true });
        }
        return tx;
      };
    });
    await togglePanelTo(page, true);
    await page.waitForFunction(() => window.__qaReadGateHeld === true);
    const title = page.getByRole('textbox', { name: '任務名稱' });
    await title.fill('清空輸入回歸');
    await noPanel(page);
    await title.fill('');
    await noPanel(page);
    await page.evaluate(() => window.__qaDeliverOldRead());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await title.inputValue(), '');
    assert.equal((await readRows(page)).length, 1, 'Clearing the next input must not change the saved capture count');
    assert.equal((await calls(page)).rpc.length, 1);
    const visibleWarnings = await page.evaluate(() => window.__qaVisibleAccountWarnings);
    result.visibleAccountWarningObservations.push({
      caseId: 'R24-successful-latest-status-and-title-share-summary',
      watchedSelectors: ['#quick-task-message', '#quick-task-recovery-message'],
      controlledFault: 'delivery of completed real IDB pending-count read after a newer draft/render',
      visibleWarnings,
    });
    assert.deepEqual(visibleWarnings, [], 'Same-account create/sync must not show an original-account login warning');
    await page.evaluate(() => window.__qaAccountWarningObserver.disconnect());
  });

  await runCase('R25-expired-sync-lease-retries-same-record', [
    makeRecord(1, {
      accountId: 'A',
      state: 'syncing',
      leaseId: 'expired-lease',
      leaseExpiresAt: Date.now() - 1000,
    }),
  ], { account: 'A' }, async page => {
    const before = (await readRows(page))[0];
    const after = await waitForRecord(page, before.captureId, record => record.state === 'synced', 'expired lease recovery');
    assert.equal(after.captureId, before.captureId);
    assert.equal(after.title, before.title);
    assert.equal(after.accountId, 'A');
    assert.ok(after.receipt);
    assert.equal((await calls(page)).rpc.length, 1);
    await noPanel(page);
  });

  const visual = await openFixture(unbound(), {});
  try {
    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 726, height: 668 }]) {
      await visual.page.setViewportSize(viewport);
      await visual.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const metrics = await visual.page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        entryHeight: document.querySelector('#quick-task-recovery > summary[data-recover]').getBoundingClientRect().height,
      }));
      assert.ok(metrics.scrollWidth <= metrics.width + 1, 'Overflow in visual fixture at ' + viewport.width + 'px');
      assert.ok(metrics.entryHeight >= 44, 'Target below 44px in visual fixture at ' + viewport.width + 'px');
      const screenshot = 'unbound-panel-' + viewport.width + '.png';
      await visual.page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
      result.screenshots.push({ path: screenshot, viewport, metrics });
    }
    await visibleErrorSweep(visual.page, 'visual-fixture');
  } finally {
    await visual.context.close();
    activeContexts.delete(visual.context);
  }
};

const portIsReleased = port => new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port });
  const done = released => {
    socket.destroy();
    resolve(released);
  };
  socket.setTimeout(1000, () => done(true));
  socket.on('connect', () => done(false));
  socket.on('error', () => done(true));
});

const finish = async () => {
  if (browser) await browser.close();
  for (const context of Array.from(activeContexts)) {
    try { await context.close(); } catch {}
    activeContexts.delete(context);
  }
  if (browserServer) {
    await browserServer.close();
    result.runtime.browserProcessExited = browserServer.process().exitCode !== null;
    result.runtime.browserPortReleased = await portIsReleased(result.runtime.browserPort);
  }
  result.sourceHashesVerifiedAfter = false;
  try {
    result.sourceHashesVerifiedAfter = JSON.stringify(hashFiles(sourceFiles)) === JSON.stringify(sourceHashes);
  } catch (error) {
    result.sourceHashError = error.message;
  }
  result.expectedCaseCount = EXPECTED_CASE_COUNT;
  const allCasesPassed = result.cases.length === EXPECTED_CASE_COUNT && result.cases.every(testCase => testCase.status === 'SIMULATION PASS');
  const noUnexpectedErrors = result.browserErrors.length === 0
    && result.requestFailures.length === 0
    && result.externalRequests.length === 0
    && result.forbiddenAuthRpcRequests.length === 0
    && result.httpFailures.length === 0;
  const browserClean = (!browserServer)
    || (result.runtime.browserProcessExited === true && result.runtime.browserPortReleased === true);
  result.status = !result.runnerError && allCasesPassed && noUnexpectedErrors
    && result.sourceHashesVerifiedAfter && browserClean && activeContexts.size === 0
    ? 'SIMULATION PASS'
    : 'FAIL';
  result.hostedIntegration = 'NOT RUN';
  fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({
    status: result.status,
    passed: result.cases.filter(testCase => testCase.status === 'SIMULATION PASS').length,
    total: result.cases.length,
    failures: result.cases.filter(testCase => testCase.status !== 'SIMULATION PASS'),
    runnerError: result.runnerError,
    hostedIntegration: result.hostedIntegration,
    runtime: result.runtime,
  }));
  process.exitCode = result.status === 'SIMULATION PASS' ? 0 : 1;
};

main().catch(error => {
  result.runnerError = error.message;
}).finally(finish).catch(error => {
  result.finalizeError = error.message;
  process.exitCode = 1;
});
