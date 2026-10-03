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
const quickPromptSource = fs.readFileSync('src/features/quickTaskCapture/pwaUpdatePrompt.ts', 'utf8');
const mainPromptSource = fs.readFileSync('src/components/AppUpdatePrompt.tsx', 'utf8');
const presentationSource = fs.readFileSync('src/services/pwaUpdatePresentation.ts', 'utf8');
const presentationModule = { exports: {} };
vm.runInNewContext(compile(presentationSource), { exports: presentationModule.exports, module: presentationModule });
const present = presentationModule.exports.getPwaUpdatePresentation;
const transactionModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('src/services/pwaUpdateTransaction.ts', 'utf8')), { exports: transactionModule.exports, module: transactionModule });
const tx = transactionModule.exports;
const makeFailed = () => ({ ...tx.claimPwaUpdateTransaction(tx.createPwaUpdateTransaction({ transactionId: 'old-failed', sourceVersion: 'release:A', targetVersion: 'release:B', now: Date.now() - 600_000 }), 'old-tab', 3, Date.now() - 599_999), phase: 'failed', errorCode: 'APPLY_FAILED', errorMessage: '先前啟用未完成。' });
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values };
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flushPromises = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function serviceFixture({ autoRegister = true, withApplyLockDb = false } = {}) {
  const localStorage = storage(), sessionStorage = storage(), navigations = [];
  const clock = { now: Date.now() };
  const timers = new Map(), intervals = new Map();
  let nextTimer = 0, latest = 'release:B', gateSafe = false, workerUpdate = () => Promise.resolve();
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const setTimeout = (callback, delay = 0) => {
    const id = ++nextTimer; timers.set(id, { at: clock.now + Math.max(0, Number(delay) || 0), callback }); return id;
  };
  const clearTimeout = id => timers.delete(id);
  const setInterval = (callback, delay = 0) => { const id = ++nextTimer; intervals.set(id, { callback, delay }); return id; };
  const clearInterval = id => intervals.delete(id);
  const advance = async milliseconds => {
    const end = clock.now + milliseconds;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      const [id, timer] = due; timers.delete(id); clock.now = timer.at; timer.callback(); await flushPromises();
    }
    clock.now = end; await flushPromises();
  };
  const eventTarget = () => {
    const listeners = new Map();
    return {
      addEventListener(name, listener) { const group = listeners.get(name) ?? new Set(); group.add(listener); listeners.set(name, group); },
      removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
      dispatchEvent(event) { for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event); return true; },
      listenerCount(name) { return listeners.get(name)?.size ?? 0; },
    };
  };
  const windowEvents = eventTarget(), documentEvents = eventTarget(), serviceWorkerEvents = eventTarget();
  const document = Object.assign(documentEvents, { visibilityState: 'visible', title: 'Fixture', querySelector: () => null });
  const window = Object.assign(windowEvents, {
    location: { href: 'https://fixture.invalid/', replace: value => navigations.push(value) },
    history: { replaceState() {} },
    setTimeout, setInterval, clearTimeout, clearInterval,
    caches: { keys: async () => [], delete: async () => true },
  });
  const requests = [], events = [], plans = new Map(), workerListeners = new Map(), boundaryPlans = [];
  let reloadBoundaryCalls = 0, reloadReservationCalls = 0;
  const queuedResponse = (pathname, plan) => { const queue = plans.get(pathname) ?? []; queue.push(plan); plans.set(pathname, queue); };
  const responseBody = pathname => pathname === '/release-meta.json'
    ? { schemaVersion: 1, releaseId: latest.replace(/^release:/u, '') }
    : { schemaVersion: 1, version: latest };
  let workerUpdateCount = 0;
  const registration = {
    waiting: null, installing: null, active: null, scope: 'https://fixture.invalid/',
    update() {
      workerUpdateCount++; events.push({ type: 'worker-update-start', at: clock.now });
      return Promise.resolve().then(workerUpdate).then(value => { events.push({ type: 'worker-update-settled', at: clock.now }); return value; });
    },
  };
  const registrationDeferred = deferred();
  class Workbox {
    addEventListener(name, listener) {
      const listeners = workerListeners.get(name) ?? new Set();
      listeners.add(listener);
      workerListeners.set(name, listeners);
    }
    removeEventListener(name, listener) { workerListeners.get(name)?.delete(listener); }
    register() { return autoRegister ? Promise.resolve(registration) : registrationDeferred.promise; }
  }
  const serviceWorker = Object.assign(serviceWorkerEvents, {
    controller: null,
    getRegistration: async () => registration,
    getRegistrations: async () => [registration],
  });
  const navigator = { onLine: true, serviceWorker };
  const safety = {
    getPwaReloadSafetySnapshot: () => ({ state: gateSafe ? 'safe' : 'blocked', code: 'OWNER_ACTION_REQUIRED', pendingBoundary: null }),
    getPwaReloadReservation: () => null, clearPwaReloadReservation() {},
    reservePwaReloadForTarget: () => { reloadReservationCalls++; return true; },
    requestPwaReloadBoundary: async (boundary) => {
      reloadBoundaryCalls++; events.push({ type: 'reload-gate-start', boundary, at: clock.now });
      const plan = boundaryPlans.shift();
      return plan ? plan() : gateSafe ? { ok: true } : { ok: false, code: 'OWNER_ACTION_REQUIRED' };
    },
    setPwaReloadReadiness() {}, subscribePwaReloadSafety: () => () => {},
  };
  const applyLockDb = withApplyLockDb ? (() => {
    const records = new Map();
    let hasStore = false;
    const cloneRecord = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const database = {
      objectStoreNames: { contains: name => name === 'locks' && hasStore },
      createObjectStore(name) {
        assert.equal(name, 'locks');
        hasStore = true;
        return {};
      },
      transaction(name) {
        assert.equal(name, 'locks');
        const transaction = { oncomplete: null, onerror: null, onabort: null, error: null };
        const store = {
          get(key) {
            const request = { result: undefined, error: null, onsuccess: null, onerror: null };
            queueMicrotask(() => {
              request.result = cloneRecord(records.get(key));
              request.onsuccess?.();
              queueMicrotask(() => transaction.oncomplete?.());
            });
            return request;
          },
          put(value) { records.set(value.key, cloneRecord(value)); },
          delete(key) { records.delete(key); },
        };
        transaction.objectStore = storeName => {
          assert.equal(storeName, 'locks');
          return store;
        };
        return transaction;
      },
      close() {},
    };
    return {
      records,
      open(name, version) {
        assert.equal(name, 'projed-pwa-update-v1');
        assert.equal(version, 1);
        const request = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          request.result = database;
          if (!hasStore) request.onupgradeneeded?.();
          queueMicrotask(() => request.onsuccess?.());
        });
        return request;
      },
    };
  })() : null;
  const fetch = (input, init = {}) => {
    const url = new URL(String(input), 'https://fixture.invalid/');
    const request = { url: url.toString(), pathname: url.pathname, signal: init.signal ?? null, at: clock.now };
    requests.push(request); events.push({ type: 'fetch-start', pathname: url.pathname, at: clock.now });
    request.signal?.addEventListener('abort', () => {
      request.abortedAt = clock.now; events.push({ type: 'fetch-abort', pathname: url.pathname, at: clock.now });
    }, { once: true });
    const queue = plans.get(url.pathname) ?? [];
    const plan = queue.shift() ?? {};
    if (plan.fetchDeferred) return plan.fetchDeferred.promise;
    if (plan.reject) return Promise.reject(plan.reject instanceof Error ? plan.reject : new Error(String(plan.reject)));
    const status = plan.status ?? (plan.ok === false ? 503 : 200);
    return Promise.resolve({
      ok: plan.ok ?? (status >= 200 && status < 300),
      status,
      json: () => {
        events.push({ type: 'fetch-body-start', pathname: url.pathname, at: clock.now });
        if (plan.jsonReject) return Promise.reject(plan.jsonReject instanceof Error ? plan.jsonReject : new Error(String(plan.jsonReject)));
        const body = plan.bodyDeferred ? plan.bodyDeferred.promise : Promise.resolve(plan.json ?? responseBody(url.pathname));
        return body.then(value => { events.push({ type: 'fetch-body-settled', pathname: url.pathname, at: clock.now }); return value; });
      },
      text: () => plan.bodyDeferred ? plan.bodyDeferred.promise : Promise.resolve(plan.text ?? ''),
    });
  };
  const module = { exports: {} };
  const context = {
    exports: module.exports, module, window, document, localStorage, sessionStorage, navigator,
    ...(applyLockDb ? { indexedDB: applyLockDb } : {}),
    __env: { PROD: true, DEV: false, MODE: 'qa', VITE_PROJED_RELEASE_ID: 'A' },
    require: name => name === 'workbox-window' ? { Workbox } : name.endsWith('pwaUpdateTransaction') ? tx : safety,
    console: { warn() {} }, Date: FixtureDate, crypto: { randomUUID: () => 'fixture-id' }, URL,
    AbortController, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch,
  };
  const source = fs.readFileSync('src/services/pwaUpdateService.ts', 'utf8').replaceAll('import.meta.env', '__env')
    + '\nexport const fixture = { check: checkForAppShellUpdate, checkAtNaturalBoundary, reconcile: reconcilePendingTransaction, set: setUpdateState, register: value => { registeredServiceWorker = value; }, cancel: cancelDetection, flight: () => detectionFlight };';
  vm.runInNewContext(compile(source), context);
  return {
    api: module.exports, localStorage, sessionStorage, navigations, registration, requests, events, window, document, navigator,
    emit: (name, event = { isUpdate: true }) => { for (const listener of [...(workerListeners.get(name) ?? [])]) listener(event); },
    pagehide: persisted => window.dispatchEvent({ type: 'pagehide', persisted }),
    pageshow: persisted => window.dispatchEvent({ type: 'pageshow', persisted }),
    latest: value => { latest = value; },
    offline: value => { navigator.onLine = !value; },
    safe: value => { gateSafe = value; },
    workerUpdate: implementation => { workerUpdate = implementation; },
    workerUpdateCount: () => workerUpdateCount,
    reloadBoundaryCalls: () => reloadBoundaryCalls,
    reloadReservationCalls: () => reloadReservationCalls,
    applyLockRecords: () => applyLockDb?.records ?? null,
    queueBoundary: implementation => boundaryPlans.push(implementation),
    queueResponse: queuedResponse,
    requestsFor: pathname => requests.filter(request => request.pathname === pathname),
    now: () => clock.now,
    advance,
    runIntervals: async () => { for (const timer of [...intervals.values()]) timer.callback(); await flushPromises(); },
    flush: flushPromises,
    register: async () => { registrationDeferred.resolve(registration); await flushPromises(); },
  };
}
const watchLocalBusyClear = f => {
  let sawBusy = false;
  const settled = deferred();
  const unsubscribe = f.api.subscribePwaUpdateState(state => {
    if (state.localUpdateBusy) sawBusy = true;
    else if (sawBusy) settled.resolve(state);
  });
  return { promise: settled.promise, unsubscribe };
};
const withinHarnessDeadline = (promise, label) => {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timeout = globalThis.setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), 1_500); }),
  ]).finally(() => globalThis.clearTimeout(timeout));
};
const transactionKey = 'projed.pwa-update.transaction.v1';
await check('U03-manual-check-contract-is-distinct-from-transaction-status', () => {
  const f = serviceFixture();
  assert.equal(typeof f.api.checkPwaUpdate, 'function');
  assert.equal(f.api.getPwaUpdateState().check.phase, 'idle');
  assert.equal(f.api.getPwaUpdateState().localUpdateBusy, false);
  assert.equal(typeof presentationModule.exports.getPwaCheckPresentation, 'function');
});
await check('U03-check-errors-never-invent-latest-or-retire-existing-failure', async () => {
  const f = serviceFixture({ autoRegister: false });
  f.api.fixture.register(f.registration);
  f.api.fixture.set({ status: 'failed', updateAvailable: false, failureKind: 'load', errorCode: 'CHUNK_LOAD_FAILED', errorMessage: '原始載入原因', latestVersion: 'release:previous', targetVersion: 'release:pending' });
  f.offline(true);
  const offline = await f.api.checkPwaUpdate();
  assert.equal(offline.phase, 'error'); assert.equal(offline.errorCode, 'CHECK_OFFLINE'); assert.equal(offline.latestVersion, null);
  assert.equal(f.api.getPwaUpdateState().latestVersion, 'release:previous');
  assert.equal(f.api.getPwaUpdateState().targetVersion, 'release:pending');
  assert.equal(f.api.getPwaUpdateState().errorMessage, '原始載入原因'); assert.equal(f.api.getPwaUpdateState().failureKind, 'load');

  f.offline(false); f.workerUpdate(() => Promise.reject(new Error('worker refresh failed')));
  const refreshFailure = await f.api.checkPwaUpdate();
  assert.equal(refreshFailure.phase, 'error'); assert.equal(refreshFailure.errorCode, 'CHECK_FAILED'); assert.equal(refreshFailure.latestVersion, null);
  assert.equal(f.api.getPwaUpdateState().latestVersion, 'release:previous');
  assert.equal(f.api.getPwaUpdateState().errorMessage, '原始載入原因'); assert.equal(f.api.getPwaUpdateState().failureKind, 'load');

  f.workerUpdate(() => Promise.resolve());
  f.queueResponse('/app-shell-meta.json', { json: { schemaVersion: 1, version: 'not-a-version' } });
  f.queueResponse('/release-meta.json', { json: { schemaVersion: 1, releaseId: '' } });
  const unknown = await f.api.checkPwaUpdate();
  assert.equal(unknown.phase, 'error'); assert.equal(unknown.errorCode, 'CHECK_VERSION_UNKNOWN'); assert.equal(unknown.latestVersion, null);
  assert.equal(f.api.getPwaUpdateState().latestVersion, 'release:previous');
  assert.equal(f.api.getPwaUpdateState().targetVersion, 'release:pending');
  assert.equal(f.api.getPwaUpdateState().errorMessage, '原始載入原因'); assert.equal(f.api.getPwaUpdateState().failureKind, 'load');
});
await check('U03-same-version-does-not-retire-load-or-cache-failure-R03-exception', async () => {
  for (const failureKind of ['load', 'cache-recovery']) {
    const f = serviceFixture(); f.latest('release:A');
    f.api.fixture.set({ status: 'failed', failureKind, errorCode: 'FIXTURE', errorMessage: `${failureKind} must remain` });
    await f.api.fixture.check();
    assert.equal(f.api.getPwaUpdateState().status, 'failed');
    assert.equal(f.api.getPwaUpdateState().failureKind, failureKind);
    assert.equal(f.api.getPwaUpdateState().errorMessage, `${failureKind} must remain`);
  }
});
await check('U03-snapshot-check-is-cloned-and-foreign-phase-is-not-local-busy', async () => {
  const cloneFixture = serviceFixture();
  const exposed = cloneFixture.api.getPwaUpdateState(); exposed.check.phase = 'available';
  assert.equal(cloneFixture.api.getPwaUpdateState().check.phase, 'idle');
  let notification;
  const unsubscribe = cloneFixture.api.subscribePwaUpdateState(state => { notification = state; });
  cloneFixture.api.fixture.set({ check: { requestId: 4, phase: 'checking', currentVersion: 'release:A', latestVersion: null, startedAt: cloneFixture.now(), finishedAt: null, errorCode: null } });
  notification.check.phase = 'error';
  assert.equal(cloneFixture.api.getPwaUpdateState().check.phase, 'checking');
  unsubscribe();

  const f = serviceFixture({ autoRegister: false }); f.api.fixture.register(f.registration);
  const foreign = tx.claimPwaUpdateTransaction(tx.createPwaUpdateTransaction({ transactionId: 'foreign-active', sourceVersion: 'release:A', targetVersion: 'release:B', now: f.now() }), 'other-tab', 9, f.now() + 1);
  f.localStorage.setItem(transactionKey, JSON.stringify(foreign)); f.api.fixture.reconcile();
  assert.equal(f.api.getPwaUpdateState().status, 'applying');
  assert.equal(f.api.getPwaUpdateState().localUpdateBusy, false);
  const result = await f.api.checkPwaUpdate();
  assert.equal(result.phase, 'available'); assert.notEqual(result.phase, 'busy');
  assert.equal(f.api.getPwaUpdateState().localUpdateBusy, false);
});
await check('U03-success-result-clearResult-hides-stale-CTA', () => {
  const state = { ...serviceFixture().api.getPwaUpdateState(), status: 'idle', updateAvailable: false, currentVersion: 'release:A', latestVersion: 'release:C', localUpdateBusy: false, reloadSafetyState: 'safe' };
  const oldSuccess = { requestId: 7, phase: 'available', currentVersion: 'release:A', latestVersion: 'release:B', startedAt: 1, finishedAt: 2, errorCode: null };
  const view = presentationModule.exports.getPwaCheckPresentation(state, { pending: false, result: oldSuccess });
  assert.equal(view.clearResult, true); assert.equal(view.showReload, false); assert.equal(view.handoffToPrompt, false);
  const busyView = presentationModule.exports.getPwaCheckPresentation({ ...state, latestVersion: 'release:B', localUpdateBusy: true }, { pending: false, result: oldSuccess });
  assert.equal(busyView.clearResult, true); assert.equal(busyView.showReload, false);
});
await check('U04-manual-promotion-runs-one-ordered-refresh-and-one-metadata-reread', async () => {
  const f = serviceFixture({ autoRegister: false }); f.api.fixture.register(f.registration);
  const firstBody = deferred(); f.queueResponse('/app-shell-meta.json', { bodyDeferred: firstBody });
  const background = f.api.fixture.check(false);
  await f.flush();
  assert.equal(f.requestsFor('/app-shell-meta.json').length, 1);
  const requestId = f.api.getPwaUpdateState().check.requestId;
  const manual = f.api.checkPwaUpdate(); await f.flush();
  firstBody.resolve({ schemaVersion: 1, version: 'release:B' });
  const [backgroundAvailable, result] = await Promise.all([background, manual]);
  assert.equal(backgroundAvailable, true); assert.equal(result.phase, 'available'); assert.equal(result.requestId, requestId);
  assert.equal(f.workerUpdateCount(), 1); assert.equal(f.requestsFor('/app-shell-meta.json').length, 2);
  const events = f.events.map(event => event.type === 'fetch-start' ? `fetch:${event.pathname}` : event.type);
  const firstBodySettled = events.indexOf('fetch-body-settled');
  const workerStarted = events.indexOf('worker-update-start');
  const reread = events.lastIndexOf('fetch:/app-shell-meta.json');
  assert.ok(firstBodySettled >= 0 && firstBodySettled < workerStarted && workerStarted < reread, events.join(', '));
});
await check('U05-caller-timeout-does-not-abort-flight-or-stack-native-update', async () => {
  const f = serviceFixture({ autoRegister: false }); f.api.fixture.register(f.registration);
  const nativeUpdate = deferred(); f.workerUpdate(() => nativeUpdate.promise);
  const first = f.api.checkPwaUpdate({ deadlineAt: f.now() + 100 }); await f.flush();
  const flight = f.api.fixture.flight(); assert.ok(flight); const flightSignal = flight.controller.signal;
  assert.equal(f.workerUpdateCount(), 1);
  await f.advance(100); const firstResult = await first;
  assert.equal(firstResult.phase, 'error'); assert.equal(firstResult.errorCode, 'CHECK_TIMEOUT');
  assert.equal(flightSignal.aborted, false); assert.equal(f.api.fixture.flight().requestId, flight.requestId);

  const second = f.api.checkPwaUpdate({ deadlineAt: f.now() + 250 }); await f.flush();
  assert.equal(f.workerUpdateCount(), 1);
  await f.advance(250); const secondResult = await second;
  assert.equal(secondResult.errorCode, 'CHECK_TIMEOUT'); assert.equal(flightSignal.aborted, false);
  assert.equal(f.api.fixture.flight().requestId, flight.requestId);

  await f.advance(flight.deadlineAt - f.now());
  assert.equal(flightSignal.aborted, true); assert.equal(f.api.fixture.flight(), null);
  const afterFlight = f.api.checkPwaUpdate({ deadlineAt: f.now() + 200 }); await f.flush();
  assert.equal(f.workerUpdateCount(), 1, 'unsettled registration.update must remain guarded after flight expiry');
  await f.advance(200); assert.equal((await afterFlight).errorCode, 'CHECK_TIMEOUT');
  assert.equal(f.workerUpdateCount(), 1);
  nativeUpdate.resolve(); await f.flush();
});
await check('U05-flight-timeout-aborts-metadata-and-late-body-cannot-change-target', async () => {
  const f = serviceFixture({ autoRegister: false }); f.api.fixture.register(f.registration);
  f.api.fixture.set({ latestVersion: 'release:previous', targetVersion: 'release:pending' });
  const lateBody = deferred(); f.queueResponse('/app-shell-meta.json', { bodyDeferred: lateBody });
  const pending = f.api.checkPwaUpdate(); await f.flush();
  const request = f.requestsFor('/app-shell-meta.json')[0]; assert.ok(request, JSON.stringify({ events: f.events, workerUpdates: f.workerUpdateCount() }));
  await f.advance(10_000); const result = await pending;
  assert.equal(result.phase, 'error'); assert.equal(result.errorCode, 'CHECK_TIMEOUT');
  assert.equal(request.signal.aborted, true);
  lateBody.resolve({ schemaVersion: 1, version: 'release:B' }); await f.flush();
  assert.equal(f.api.getPwaUpdateState().latestVersion, 'release:previous');
  assert.equal(f.api.getPwaUpdateState().targetVersion, 'release:pending');
  assert.equal(f.localStorage.getItem(transactionKey), null);
});
await check('U05-pagehide-cancels-flight-through-real-service-event-handler', async () => {
  const f = serviceFixture({ autoRegister: false }); f.api.setupPwaLifecycle(); f.api.fixture.register(f.registration);
  const body = deferred(); f.queueResponse('/app-shell-meta.json', { bodyDeferred: body });
  const pending = f.api.checkPwaUpdate(); await f.flush();
  const request = f.requestsFor('/app-shell-meta.json')[0]; assert.ok(request, JSON.stringify({ events: f.events, workerUpdates: f.workerUpdateCount() }));
  f.pagehide(true); const result = await pending;
  assert.equal(result.phase, 'cancelled'); assert.equal(request.signal.aborted, true);
  assert.equal(f.api.getPwaUpdateState().check.phase, 'cancelled');
});
const runCancelNotificationReentry = async ({ seed, invoke, measure }) => {
  const f = serviceFixture({ autoRegister: false }); f.api.fixture.register(f.registration);
  const lateBody = deferred(); f.queueResponse('/app-shell-meta.json', { bodyDeferred: lateBody });
  const background = f.api.fixture.check(false); await f.flush();
  assert.equal(f.requestsFor('/app-shell-meta.json').length, 1);
  f.api.fixture.set(seed);
  let reentered = false, duplicate, busyAtCancelNotification = null;
  const unsubscribe = f.api.subscribePwaUpdateState(state => {
    if (!reentered && state.check.phase === 'cancelled') {
      reentered = true;
      busyAtCancelNotification = f.api.getPwaUpdateState().localUpdateBusy;
      duplicate = invoke(f.api);
    }
  });
  const before = measure(f);
  const primary = invoke(f.api);
  await f.flush();
  const effectCount = measure(f) - before;
  lateBody.resolve({ schemaVersion: 1, version: 'release:B' });
  await Promise.all([background, primary, duplicate]);
  unsubscribe();
  assert.equal(reentered, true, 'the pending flight must publish its cancellation synchronously');
  return { effectCount, busyAtCancelNotification, busyAfterSettlement: f.api.getPwaUpdateState().localUpdateBusy };
};
await check('U05-cancel-notification-reentrant-apply-joins-single-effect', async () => {
  const result = await runCancelNotificationReentry({
    seed: { status: 'update-available', updateAvailable: true, latestVersion: 'release:B', targetVersion: 'release:B' },
    invoke: api => api.applyPwaUpdate(), measure: f => f.reloadBoundaryCalls(),
  });
  assert.equal(result.effectCount, 1, 'subscriber reentry must share one owner gate/effect');
  assert.equal(result.busyAtCancelNotification, true);
  assert.equal(result.busyAfterSettlement, false);
});
await check('U05-cancel-notification-reentrant-retry-joins-single-check', async () => {
  const result = await runCancelNotificationReentry({
    seed: { status: 'failed', failureKind: 'update', updateAvailable: false, latestVersion: 'release:B', targetVersion: 'release:B' },
    invoke: api => api.retryPwaUpdate(), measure: f => f.requestsFor('/app-shell-meta.json').length,
  });
  assert.equal(result.effectCount, 1, 'reentrant retry must perform one latest-version read');
  assert.equal(result.busyAtCancelNotification, true);
  assert.equal(result.busyAfterSettlement, false);
});
await check('U05-cancel-notification-reentrant-cache-recovery-joins-single-effect', async () => {
  const result = await runCancelNotificationReentry({
    seed: { status: 'failed', failureKind: 'cache-recovery', updateAvailable: false },
    invoke: api => api.clearPwaApplicationCacheAndReload(), measure: f => f.reloadBoundaryCalls(),
  });
  assert.equal(result.effectCount, 1, 'subscriber reentry must share one recovery gate/effect');
  assert.equal(result.busyAtCancelNotification, true);
  assert.equal(result.busyAfterSettlement, false);
});
await check('U05-terminal-notification-can-start-a-new-flight-without-old-finally-clearing-it', async () => {
  const f = serviceFixture({ autoRegister: false }); f.api.fixture.register(f.registration);
  f.queueResponse('/app-shell-meta.json', { json: { schemaVersion: 1, version: 'release:B' } });
  const secondBody = deferred(); f.queueResponse('/app-shell-meta.json', { bodyDeferred: secondBody });
  let nextCheck = null;
  const unsubscribe = f.api.subscribePwaUpdateState(state => {
    if (!nextCheck && (state.check.phase === 'available' || state.check.phase === 'up-to-date')) nextCheck = f.api.checkPwaUpdate();
  });
  const firstCheck = f.api.checkPwaUpdate(); await f.flush();
  const firstResult = await firstCheck; await f.flush();
  const secondFlight = f.api.fixture.flight();
  assert.ok(nextCheck); assert.ok(secondFlight);
  assert.ok(secondFlight.requestId > firstResult.requestId);
  assert.equal(secondFlight.requestId, f.api.getPwaUpdateState().check.requestId);
  assert.equal(f.api.getPwaUpdateState().check.phase, 'checking');
  secondBody.resolve({ schemaVersion: 1, version: 'release:B' });
  const secondResult = await nextCheck;
  assert.equal(secondResult.phase, 'available');
  assert.equal(secondResult.requestId, secondFlight.requestId);
  assert.equal(f.api.fixture.flight(), null);
  unsubscribe();
});
await check('U07-hidden-after-natural-detection-gate-cannot-reload-completed-target', async () => {
  const f = serviceFixture({ autoRegister: false }); f.api.setupPwaLifecycle(); f.api.fixture.register(f.registration);
  const waitingMessages = [];
  f.registration.waiting = { postMessage: message => waitingMessages.push(message) };
  f.safe(true);
  f.localStorage.setItem('projed.pwa-update.completed-version.v1', 'release:B');
  const gate = deferred(); f.queueBoundary(() => gate.promise);
  await f.api.fixture.checkAtNaturalBoundary('app-open'); await f.flush();
  assert.equal(f.api.getPwaUpdateState().check.phase, 'available');
  assert.equal(f.reloadBoundaryCalls(), 1);
  assert.equal(f.navigations.length, 0); assert.equal(waitingMessages.length, 0);

  f.document.visibilityState = 'hidden';
  f.document.dispatchEvent({ type: 'visibilitychange' });
  gate.resolve({ ok: true }); await f.flush();
  assert.equal(f.navigations.length, 0, 'a hidden natural-boundary effect must not take the completed-target reload shortcut');
  assert.equal(waitingMessages.length, 0, 'the completed-target shortcut must not message SKIP_WAITING');
});
await check('U07-real-three-second-app-open-pagehide-releases-pending-metadata-without-effect', async () => {
  const f = serviceFixture({ autoRegister: false }); f.api.setupPwaLifecycle(); f.api.fixture.register(f.registration);
  const waitingMessages = [];
  f.registration.waiting = { postMessage: message => waitingMessages.push(message) };
  const lateBody = deferred(); f.queueResponse('/app-shell-meta.json', { bodyDeferred: lateBody });
  await f.advance(3_000); await f.flush();
  const request = f.requestsFor('/app-shell-meta.json')[0]; assert.ok(request);
  assert.equal(f.api.getPwaUpdateState().check.phase, 'checking');
  f.pagehide(true);
  assert.equal(request.signal.aborted, true);
  lateBody.resolve({ schemaVersion: 1, version: 'release:B' }); await f.flush();
  assert.equal(f.api.getPwaUpdateState().check.phase, 'cancelled');
  assert.equal(f.reloadBoundaryCalls(), 0); assert.equal(f.navigations.length, 0); assert.equal(waitingMessages.length, 0);
});
await check('U07-manual-background-and-periodic-detection-never-own-reload-effect', async () => {
  const f = serviceFixture({ autoRegister: false }); f.api.setupPwaLifecycle(); f.api.fixture.register(f.registration);
  const waitingMessages = [];
  f.registration.waiting = { postMessage: message => waitingMessages.push(message) };
  f.safe(true);
  f.localStorage.setItem('projed.pwa-update.completed-version.v1', 'release:B');
  const manual = await f.api.checkPwaUpdate();
  const backgroundAvailable = await f.api.fixture.check(false);
  await f.runIntervals();
  assert.equal(manual.phase, 'available'); assert.equal(backgroundAvailable, true);
  assert.equal(f.requestsFor('/app-shell-meta.json').length, 3, 'manual, background, and interval triggers must each run detection');
  assert.equal(f.reloadBoundaryCalls(), 0); assert.equal(f.navigations.length, 0); assert.equal(waitingMessages.length, 0);
});
for (const invalidation of ['pagehide', 'hidden']) {
  await check(`U07-${invalidation}-during-real-prepare-retires-owner-and-keeps-target-pending`, async () => {
    const f = serviceFixture({ autoRegister: false, withApplyLockDb: true });
    f.api.setupPwaLifecycle(); f.api.fixture.register(f.registration); f.safe(true);
    const messages = [], prepareStarted = deferred(), releasePrepare = deferred();
    f.registration.waiting = { postMessage: message => messages.push(message) };
    f.workerUpdate(() => { prepareStarted.resolve(); return releasePrepare.promise; });
    const busyClear = watchLocalBusyClear(f);

    await f.api.fixture.checkAtNaturalBoundary('app-open'); await f.flush();
    await withinHarnessDeadline(prepareStarted.promise, 'prepareStableTarget registration.update');
    assert.equal(f.api.getPwaUpdateState().check.phase, 'available');
    assert.equal(f.api.getPwaUpdateState().localUpdateBusy, true);
    assert.equal(f.api.getPwaUpdateState().status, 'applying');

    if (invalidation === 'pagehide') f.pagehide(true);
    else {
      f.document.visibilityState = 'hidden';
      f.document.dispatchEvent({ type: 'visibilitychange' });
    }
    releasePrepare.resolve();
    await withinHarnessDeadline(busyClear.promise, 'apply finally after boundary invalidation');
    busyClear.unsubscribe();

    const state = f.api.getPwaUpdateState();
    assert.equal(messages.length, 0, 'the invalidated target must not receive SKIP_WAITING');
    assert.equal(f.navigations.length, 0, 'the invalidated boundary must not navigate');
    assert.equal(f.reloadReservationCalls(), 0, 'the invalidated boundary must not reserve a reload');
    assert.equal(state.localUpdateBusy, false, 'the apply guard must retire in finally');
    assert.equal(state.status, 'update-available');
    assert.equal(state.pendingLocalTarget, 'release:B');
    assert.equal(state.normalReloadReserved, false);
    assert.equal(f.localStorage.getItem(transactionKey), null, 'the departed owner transaction must be retired');
    assert.equal(f.applyLockRecords().size, 0, 'the IndexedDB owner lease must be released');
  });
}
await check('U07-hidden-between-deferred-activation-and-reload-keeps-target-pending', async () => {
  const f = serviceFixture({ autoRegister: false, withApplyLockDb: true });
  f.api.setupPwaLifecycle(); f.api.fixture.register(f.registration); f.safe(true);
  const messages = [], activationRequested = deferred();
  f.registration.waiting = { postMessage: message => { messages.push(message); activationRequested.resolve(message); } };
  const busyClear = watchLocalBusyClear(f);

  await f.api.fixture.checkAtNaturalBoundary('app-open'); await f.flush();
  await withinHarnessDeadline(activationRequested.promise, 'real activation request after stable target preparation');
  // The message is created in the service VM; compare its wire payload rather
  // than requiring the host and VM to share an Object prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: 'SKIP_WAITING' }]);
  assert.equal(f.api.getPwaUpdateState().localUpdateBusy, true);
  assert.equal(f.api.getPwaUpdateState().status, 'awaiting-controller');

  // Resolve the real activation waiter, then invalidate its natural boundary
  // before the await continuation can perform the own-reload shortcut.
  f.emit('activated', { isUpdate: false });
  f.document.visibilityState = 'hidden';
  f.document.dispatchEvent({ type: 'visibilitychange' });
  await withinHarnessDeadline(busyClear.promise, 'apply finally after deferred activation');
  busyClear.unsubscribe();

  const state = f.api.getPwaUpdateState();
  assert.equal(f.navigations.length, 0, 'activation after boundary invalidation must not trigger own reload');
  assert.equal(f.reloadReservationCalls(), 0, 'reload reservation must happen only after a fresh post-activation boundary check');
  assert.equal(state.localUpdateBusy, false, 'the apply guard must retire in finally');
  assert.equal(state.status, 'update-available');
  assert.equal(state.pendingLocalTarget, 'release:B');
  assert.equal(state.normalReloadReserved, false);
  assert.equal(f.localStorage.getItem(transactionKey), null, 'the departed owner transaction must be retired');
  assert.equal(f.applyLockRecords().size, 0, 'the IndexedDB owner lease must be released');
});
await check('R11-quick-shell-starts-shared-update-lifecycle-after-reload-safety', () => {
  assert.ok(quickMain.includes('await installQuickReloadSafety(() => ({'));
  assert.ok(quickPwaLifecycle.includes('let apiPromise: Promise<QuickPwaApi> | null = null;'));
  assert.ok(quickPwaLifecycle.includes('if (apiPromise) return apiPromise;'));
  assert.ok(quickPwaLifecycle.includes('if (!await reloadSafetyReady || disposed) throw new Error(\'CHECK_UNAVAILABLE\');'));
  assert.ok(quickPwaLifecycle.indexOf('if (!await reloadSafetyReady') < quickPwaLifecycle.indexOf("await import('../services/pwaUpdateService')"));
  assert.equal((quickPwaLifecycle.match(/pwaUpdate\.setupPwaLifecycle\(\)/gu) ?? []).length, 1);
  assert.equal((quickMain.match(/installReloadSafety\(\)/gu) ?? []).length, 1);
  assert.ok(quickMain.includes('const reloadSafetyReady = installReloadSafety();'));
  assert.ok(quickMain.includes('const getPwaApi = installQuickPwaLifecycle(reloadSafetyReady);'));
  assert.ok(!quickMain.includes("from '../services/pwaUpdateService'"));
});
await check('R12-quick-shell-mounts-the-shared-safe-reload-prompt-after-update-service', () => {
  assert.ok(quickPwaLifecycle.includes('setupPwaLifecycle();'));
  assert.ok(quickPwaLifecycle.indexOf('setupPwaLifecycle();') < quickPwaLifecycle.indexOf("await import('../features/quickTaskCapture/pwaUpdatePrompt')"));
  for (const action of ['subscribePwaUpdateState', 'applyPwaUpdate', 'retryPwaUpdate', 'clearPwaApplicationCacheAndReload', 'dismissPwaUpdatePrompt']) assert.ok(quickPwaLifecycle.includes(action));
  assert.ok(quickPromptSource.includes('getPwaUpdatePresentation(currentState)'));
  assert.ok(mainPromptSource.includes('getPwaUpdatePresentation(state)'));
  assert.ok(presentationSource.includes("state.reloadSafetyState === 'dirty' || state.reloadSafetyState === 'blocked'"));
  assert.ok(presentationSource.includes("state.status === 'recoverable-cache-error'"));
  assert.ok(presentationSource.includes("state.status === 'failed'"));
});
await check('R12-quick-prompt-mirrors-main-visibility-and-dismiss-contract', () => {
  const visible = state => present(state).visible;
  const base = { status: 'idle', updateAvailable: true, dismissedAt: null, reloadSafetyState: 'safe' };
  assert.equal(visible(base), false);
  assert.equal(visible({ ...base, reloadSafetyState: 'dirty' }), true);
  assert.equal(visible({ ...base, reloadSafetyState: 'blocked' }), true);
  assert.equal(visible({ ...base, reloadSafetyState: 'dirty', dismissedAt: Date.now() }), false);
  assert.equal(visible({ ...base, status: 'recoverable-cache-error', reloadSafetyState: 'safe' }), true);
  assert.equal(visible({ ...base, status: 'failed', reloadSafetyState: 'safe' }), true);
  assert.equal(visible({ ...base, updateAvailable: false, status: 'updated' }), false);
});
await check('R12-shared-presentation-preserves-failure-precedence-and-exact-wording', () => {
  const base = Object.freeze({ status: 'update-available', updateAvailable: true, dismissedAt: null, reloadSafetyState: 'dirty', failureKind: null, errorMessage: null });
  assert.deepEqual({ ...present(base) }, { visible: true, isRecovery: false, title: '新版已就緒', detail: null });
  assert.equal(present({ ...base, errorMessage: 'stale failure' }).detail, null);
  assert.equal(present({ ...base, reloadSafetyState: 'blocked' }).detail, '目前無法確認內容是否已保存。');
  assert.equal(present({ ...base, reloadSafetyState: 'blocked', errorMessage: '草稿尚未保存' }).detail, '草稿尚未保存');
  for (const status of ['failed', 'recoverable-cache-error']) {
    for (const [failureKind, title] of [[null, '重新載入未完成'], ['update', '重新載入未完成'], ['load', '畫面載入失敗'], ['cache-recovery', '快取恢復未完成']]) {
      const state = { ...base, status, failureKind, updateAvailable: false, dismissedAt: 1, reloadSafetyState: 'blocked' };
      for (const errorMessage of [null, '']) {
        assert.deepEqual({ ...present({ ...state, errorMessage }) }, { visible: true, isRecovery: true, title, detail: '請重試；若仍無法開啟，可清除應用程式快取後再載入。' });
      }
      assert.equal(present({ ...state, errorMessage: '原始錯誤' }).detail, '原始錯誤');
    }
  }
});
await check('R12-quick-prompt-skips-equivalent-renders-and-keeps-action-feedback', async () => {
  let writes = 0, listener, unsubscribeCount = 0, subscribeCount = 0, settle, readCount = 0;
  const nodes = [], roots = [], actions = [], windowListeners = new Map();
  let readState = { status: 'idle', updateAvailable: false, dismissedAt: null, reloadSafetyState: 'safe', failureKind: null, errorMessage: null,
    localUpdateBusy: false, check: { requestId: 0, phase: 'idle', currentVersion: null, latestVersion: null, startedAt: null, finishedAt: null, errorCode: null } };
  const measuredProperties = new Set(['hidden', 'disabled', 'textContent']);
  const createElement = tag => {
    const node = new Proxy({ tag, dataset: {}, children: [], events: {}, append(...children) { this.children.push(...children); }, setAttribute() {}, addEventListener(name, callback) { this.events[name] = callback; }, removeEventListener(name) { delete this.events[name]; }, remove() {} }, {
      set(target, property, value) { if (measuredProperties.has(property)) writes++; target[property] = value; return true; },
    });
    nodes.push(node); return node;
  };
  const module = { exports: {} };
  vm.runInNewContext(compile(quickPromptSource), {
    exports: module.exports, module,
    require: name => { assert.ok(name.endsWith('/pwaUpdatePresentation')); return presentationModule.exports; },
    document: { createElement, body: { append(...items) { roots.push(...items); } } },
    window: {
      addEventListener(name, callback) { const group = windowListeners.get(name) ?? new Set(); group.add(callback); windowListeners.set(name, group); },
      removeEventListener(name, callback) { windowListeners.get(name)?.delete(callback); },
      dispatchEvent(event) { for (const callback of [...(windowListeners.get(event.type) ?? [])]) callback(event); },
    },
  });
  const operation = name => () => { actions.push(name); return new Promise(resolve => { settle = resolve; }); };
  const cleanup = module.exports.mountQuickTaskPwaUpdatePrompt({
    read: () => { readCount++; return readState; },
    subscribe: callback => { subscribeCount++; listener = callback; return () => { unsubscribeCount++; }; },
    apply: operation('apply'), retry: operation('retry'), recover: operation('recover'), dismiss: () => actions.push('dismiss'),
  });
  const node = key => nodes.find(item => item.dataset[key]);
  const heading = nodes.find(item => item.tag === 'h2');
  const base = { ...readState, status: 'update-available', updateAvailable: true, dismissedAt: null, reloadSafetyState: 'dirty', failureKind: null, errorMessage: null };
  const measurements = [];
  for (const [scenario, state] of [
    ['safe', { ...base, reloadSafetyState: 'safe' }], ['dirty', base],
    ['blocked', { ...base, reloadSafetyState: 'blocked' }],
    ['recovery', { ...base, status: 'failed', failureKind: 'load' }],
  ]) {
    listener(state); writes = 0;
    for (let index = 0; index < 100; index++) listener({ ...state, lastCheckedAt: index, ownerFence: index, latestVersion: `release:${index}` });
    measurements.push({ scenario, notifications: 100, domPropertyWrites: writes });
  }
  fs.writeFileSync(path.join(output, 'prompt-render-measurements.json'), JSON.stringify({ layer: 'DOM property setter adapter; not browser frame timing', measurements }, null, 2));
  for (const measurement of measurements) assert.equal(measurement.domPropertyWrites, 0, `${measurement.scenario}: equivalent state should not rewrite DOM`);
  listener(base);
  assert.equal(node('pwaUpdatePrompt').hidden, false);
  assert.equal(heading.textContent, '新版已就緒');
  listener({ ...base, dismissedAt: 1 });
  assert.equal(node('pwaUpdatePrompt').hidden, true);
  for (const [key, status, failureKind, title, pendingLabel] of [
    ['pwaUpdateAction', 'update-available', null, '新版已就緒', '準備重新載入'],
    ['pwaUpdateRetry', 'failed', 'load', '畫面載入失敗', '準備重新載入'],
    ['pwaCacheRecovery', 'recoverable-cache-error', 'cache-recovery', '快取恢復未完成', '正在恢復'],
  ]) {
    listener({ ...base, status, failureKind });
    assert.equal(heading.textContent, title);
    const button = node(key), settledLabel = button.textContent;
    button.events.click();
    assert.equal(button.textContent, pendingLabel);
    assert.equal(button.disabled, true);
    const callsBeforeDuplicate = actions.length;
    button.events.click();
    assert.equal(actions.length, callsBeforeDuplicate);
    settle(true); await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.textContent, settledLabel);
    assert.equal(button.disabled, false);
  }
  listener({ ...base, status: 'failed', failureKind: 'load', errorMessage: '更新後的失敗原因' });
  assert.equal(node('pwaUpdateError').textContent, '更新後的失敗原因');
  node('pwaUpdateLater').events.click();
  assert.deepEqual(actions, ['apply', 'retry', 'recover', 'dismiss']);
  assert.equal(subscribeCount, 1);
  assert.equal(roots.length, 1);
  cleanup(); cleanup(); assert.equal(unsubscribeCount, 1);
});
await check('U06-adapter-synthetic-persisted-cycles-same-root-not-real-bfcache', async () => {
  // This is a prompt DOM adapter simulation only; it does not exercise browser bfcache or count as U06.
  let listener, readCount = 0, unsubscribeCount = 0;
  const nodes = [], roots = [], windowListeners = new Map();
  let readState = { status: 'update-available', updateAvailable: true, dismissedAt: null, reloadSafetyState: 'dirty', failureKind: null,
    errorMessage: null, localUpdateBusy: false, check: { requestId: 0, phase: 'idle', currentVersion: 'release:A', latestVersion: null, startedAt: null, finishedAt: null, errorCode: null } };
  const createElement = tag => ({ tag, dataset: {}, children: [], events: {}, append(...children) { this.children.push(...children); }, setAttribute() {}, addEventListener(name, callback) { this.events[name] = callback; }, removeEventListener(name) { delete this.events[name]; }, remove() {} });
  const module = { exports: {} };
  vm.runInNewContext(compile(quickPromptSource), {
    exports: module.exports, module,
    require: name => presentationModule.exports,
    document: { createElement: tag => { const node = createElement(tag); nodes.push(node); return node; }, body: { append(...items) { roots.push(...items); } } },
    window: {
      addEventListener(name, callback) { const group = windowListeners.get(name) ?? new Set(); group.add(callback); windowListeners.set(name, group); },
      removeEventListener(name, callback) { windowListeners.get(name)?.delete(callback); },
      dispatchEvent(event) { for (const callback of [...(windowListeners.get(event.type) ?? [])]) callback(event); },
    },
  });
  module.exports.mountQuickTaskPwaUpdatePrompt({
    read: () => { readCount++; return readState; },
    subscribe: callback => { listener = callback; return () => { unsubscribeCount++; }; },
    apply: async () => true, retry: async () => true, recover: async () => true, dismiss() {},
  });
  listener(readState);
  const rootNode = roots[0], heading = nodes.find(node => node.tag === 'h2');
  for (let cycle = 0; cycle < 5; cycle++) {
    windowListeners.get('pagehide').forEach(callback => callback({ type: 'pagehide', persisted: true }));
    readState = { ...readState, status: cycle % 2 ? 'update-available' : 'failed', failureKind: cycle % 2 ? null : 'load',
      errorMessage: cycle % 2 ? null : `cycle ${cycle}` };
    listener({ ...readState, status: 'idle', updateAvailable: false });
    windowListeners.get('pageshow').forEach(callback => callback({ type: 'pageshow', persisted: true }));
    assert.equal(readCount, cycle + 1);
    assert.equal(roots.length, 1); assert.equal(roots[0], rootNode);
    assert.equal(heading.textContent, cycle % 2 ? '新版已就緒' : '畫面載入失敗');
  }
  assert.equal(unsubscribeCount, 0);
  assert.equal(windowListeners.get('pagehide').size, 1);
  assert.equal(windowListeners.get('pageshow').size, 1);
});
results.at(-1).evidenceLevel = 'Synthetic prompt adapter persisted events; not real browser bfcache and not U06 PASS';
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
