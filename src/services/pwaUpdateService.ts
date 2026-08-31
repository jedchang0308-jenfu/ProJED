import { Workbox } from 'workbox-window';
import {
  claimPwaUpdateTransaction,
  createPwaUpdateTransaction,
  isPwaUpdateTransactionStale,
  ownsPwaUpdateTransaction,
  parsePwaUpdateTransaction,
  PWA_UPDATE_CONTROLLER_TIMEOUT_MS,
  PWA_UPDATE_LEASE_MS,
  PWA_UPDATE_LEASE_RENEW_MS,
  PWA_UPDATE_MAX_TARGET_ROUNDS,
  retargetPwaUpdateTransaction,
  renewPwaUpdateTransactionLease,
  serializePwaUpdateTransaction,
  transitionPwaUpdateTransaction,
  type PwaUpdatePhase,
  type PwaUpdateTransactionV1,
} from './pwaUpdateTransaction';
import {
  clearPwaReloadReservation,
  getPwaReloadSafetySnapshot,
  getPwaReloadReservation,
  requestPwaReloadBoundary,
  reservePwaReloadForTarget,
  setPwaReloadReadiness,
  subscribePwaReloadSafety,
  type PwaReloadSafetyFailureCode,
  type PwaReloadBoundary,
} from './pwaReloadSafety';
import type { ViewMode } from '../types';

export type PwaUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'applying'
  | 'awaiting-controller'
  | 'verifying'
  | 'recovering'
  | 'offline-ready'
  | 'updated'
  | 'recoverable-cache-error'
  | 'failed';

export type PwaUpdateState = {
  status: PwaUpdateStatus;
  updateAvailable: boolean;
  offlineReady: boolean;
  dismissedAt: number | null;
  lastCheckedAt: number | null;
  lastUpdateFoundAt: number | null;
  lastAppliedAt: number | null;
  recoveryAttemptCount: number;
  currentVersion: string | null;
  latestVersion: string | null;
  previousVersion: string | null;
  transactionId: string | null;
  targetVersion: string | null;
  ownerFence: number;
  normalReloadReserved: boolean;
  errorMessage: string | null;
  reloadSafetyState: 'booting' | 'safe' | 'dirty' | 'preparing' | 'blocked';
  reloadSafetyCode: PwaReloadSafetyFailureCode | null;
  pendingBoundary: PwaReloadBoundary | null;
  pendingLocalTarget: string | null;
};

type PwaUpdateListener = (state: PwaUpdateState) => void;

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const APP_SHELL_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const MAX_AUTO_RECOVERY_ATTEMPTS = 1;
const CURRENT_VERSION_KEY = 'projed.pwa-update.current-version.v1';
const LEGACY_APP_VERSION_KEY = 'projed.pwaUpdate.currentBundle';
const COMPLETED_VERSION_KEY = 'projed.pwa-update.completed-version.v1';
const TRANSACTION_KEY = 'projed.pwa-update.transaction.v1';
const TAB_ID_KEY = 'projed.pwa-update.tab-id.v1';
const DISMISSED_TARGET_KEY = 'projed.pwa-update.dismissed-target.v1';
const RECOVERY_ATTEMPTS_KEY = 'projed.pwa-update.recovery.v1';
const LATEST_RELOAD_PARAM = 'projed_update_latest';
const STATE_EVENT_NAME = 'projed:pwa-update-state';
const CROSS_TAB_CHANNEL_NAME = 'projed.pwa-update.v1';
const APPLY_LOCK_NAME = 'projed.pwa-update.apply.v1';
const APPLY_LOCK_DB_NAME = 'projed-pwa-update-v1';
const APPLY_LOCK_STORE_NAME = 'locks';
const APPLY_LOCK_KEY = 'global';

const listeners = new Set<PwaUpdateListener>();
const waitingWorkerTargets = new WeakMap<ServiceWorker, string>();

let registeredServiceWorker: ServiceWorkerRegistration | null = null;
let workbox: Workbox | null = null;
let updateChannel: BroadcastChannel | null = null;
let applyPromise: Promise<boolean> | null = null;
let appShellCheckListenersBound = false;
let crossTabListenersBound = false;
let setupDone = false;
let testControlsInstalled = false;
let memoryTabId: string | null = null;
let normalReloadRequested = false;
let safetySubscriptionBound = false;

let updateState: PwaUpdateState = {
  status: 'idle',
  updateAvailable: false,
  offlineReady: false,
  dismissedAt: null,
  lastCheckedAt: null,
  lastUpdateFoundAt: null,
  lastAppliedAt: null,
  recoveryAttemptCount: 0,
  currentVersion: null,
  latestVersion: null,
  previousVersion: null,
  transactionId: null,
  targetVersion: null,
  ownerFence: 0,
  normalReloadReserved: false,
  errorMessage: null,
  reloadSafetyState: 'booting',
  reloadSafetyCode: null,
  pendingBoundary: null,
  pendingLocalTarget: null,
};

declare global {
  interface Window {
    __projedPwaUpdateTest?: {
      getState: () => PwaUpdateState;
      simulateUpdateAvailable: () => void;
      simulateUpdated: () => void;
      simulateOfflineReady: () => void;
      simulateRecoverableCacheError: (message?: string) => void;
      reset: () => void;
    };
  }
}

const cloneState = (): PwaUpdateState => ({ ...updateState });

const dispatchStateEvent = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PwaUpdateState>(STATE_EVENT_NAME, { detail: cloneState() }));
};

const notifyUpdateListeners = () => {
  const nextState = cloneState();
  listeners.forEach((listener) => listener(nextState));
  dispatchStateEvent();
};

const setUpdateState = (updates: Partial<PwaUpdateState>) => {
  updateState = { ...updateState, ...updates };
  notifyUpdateListeners();
};

const syncReloadSafetyState = () => {
  const safety = getPwaReloadSafetySnapshot();
  setUpdateState({
    reloadSafetyState: safety.state,
    reloadSafetyCode: safety.code,
    pendingBoundary: safety.pendingBoundary,
  });
};

const createId = (prefix: string) => {
  const randomUuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomUuid}`;
};

const createStableTransactionId = (sourceVersion: string, targetVersion: string) => {
  let hash = 14695981039346656037n;
  const input = `${sourceVersion}\u0000${targetVersion}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `tx-${hash.toString(16).padStart(16, '0')}`;
};

const getTabId = () => {
  if (memoryTabId) return memoryTabId;
  if (typeof sessionStorage === 'undefined') {
    memoryTabId = createId('tab');
    return memoryTabId;
  }
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) {
      memoryTabId = existing;
      return existing;
    }
    memoryTabId = createId('tab');
    sessionStorage.setItem(TAB_ID_KEY, memoryTabId);
    return memoryTabId;
  } catch {
    memoryTabId = createId('tab');
    return memoryTabId;
  }
};

const getSessionValue = (key: string) => {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const setSessionValue = (key: string, value: string) => {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeSessionValue = (key: string) => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // A storage failure is handled by the caller's visible state.
  }
};

const readRecoveryAttempts = () => {
  const stored = getSessionValue(RECOVERY_ATTEMPTS_KEY);
  if (!stored) return { count: 0, firstAttemptAt: 0 };
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return { count: 0, firstAttemptAt: 0 };
    const candidate = parsed as { count?: unknown; firstAttemptAt?: unknown };
    const count = typeof candidate.count === 'number' && Number.isInteger(candidate.count) && candidate.count >= 0
      ? candidate.count
      : 0;
    const firstAttemptAt = typeof candidate.firstAttemptAt === 'number' && Number.isFinite(candidate.firstAttemptAt)
      ? candidate.firstAttemptAt
      : 0;
    return { count, firstAttemptAt };
  } catch {
    return { count: 0, firstAttemptAt: 0 };
  }
};

const writeRecoveryAttempts = (count: number, firstAttemptAt: number) => (
  setSessionValue(RECOVERY_ATTEMPTS_KEY, JSON.stringify({ count, firstAttemptAt }))
);

const resetRecoveryAttempts = () => removeSessionValue(RECOVERY_ATTEMPTS_KEY);

const readTransaction = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return parsePwaUpdateTransaction(localStorage.getItem(TRANSACTION_KEY));
  } catch {
    return null;
  }
};

const readCompletedVersion = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(COMPLETED_VERSION_KEY);
  } catch {
    return null;
  }
};

const writeCompletedVersion = (version: string) => {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(COMPLETED_VERSION_KEY, version);
    return true;
  } catch {
    return false;
  }
};

const broadcastChange = () => {
  try {
    updateChannel?.postMessage({ type: 'transaction-changed', at: Date.now() });
  } catch {
    // storage event remains the fallback signal.
  }
};

const writeTransaction = (transaction: PwaUpdateTransactionV1) => {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(TRANSACTION_KEY, serializePwaUpdateTransaction(transaction));
    broadcastChange();
    return true;
  } catch {
    return false;
  }
};

const removeTransactionIf = (transactionId: string) => {
  if (typeof localStorage === 'undefined') return false;
  try {
    const current = readTransaction();
    if (!current || current.transactionId !== transactionId) return false;
    localStorage.removeItem(TRANSACTION_KEY);
    broadcastChange();
    return true;
  } catch {
    return false;
  }
};

const dismissedTarget = () => getSessionValue(DISMISSED_TARGET_KEY);

const extractBundleVersionFromSrc = (src: string | null | undefined) => {
  const match = src?.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
  return match?.[1] ?? null;
};

const getCurrentBundleHash = () => {
  if (typeof document === 'undefined') return null;
  const entryScript = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return extractBundleVersionFromSrc(entryScript?.getAttribute('src'));
};

const getProductionReleaseId = () => {
  const value = import.meta.env.VITE_PROJED_RELEASE_ID;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,200}$/.test(value)) return null;
  return value;
};

const canonicalReleaseVersion = (releaseId: string | null) => releaseId ? `release:${releaseId}` : null;
const canonicalBundleVersion = (hash: string | null) => hash ? `bundle:${hash}` : null;

const getCurrentAppVersion = () => {
  const releaseVersion = canonicalReleaseVersion(getProductionReleaseId());
  if (releaseVersion) return releaseVersion;
  // Vite's staging build also sets PROD=true. It does not receive the sealed
  // release ID, so it must use the app-shell hash for update convergence.
  return canonicalBundleVersion(getCurrentBundleHash());
};

const extractAppShellVersionFromHtml = (html: string) => (
  extractBundleVersionFromSrc(html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[A-Za-z0-9_-]+\.js)["']/)?.[1])
);

const fetchLatestAppVersion = async () => {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Sealed production artifacts publish release-meta.json. Preview/staging
  // artifacts do not, so compare their current index.html bundle hash.
  if (getProductionReleaseId()) {
    const response = await fetch(`/release-meta.json?projed_update_check=${nonce}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const meta: unknown = await response.json();
    if (!meta || typeof meta !== 'object') throw new Error('Invalid release metadata.');
    const candidate = meta as { schemaVersion?: unknown; releaseId?: unknown };
    if (candidate.schemaVersion !== 1 || typeof candidate.releaseId !== 'string') {
      throw new Error('Invalid release metadata schema.');
    }
    const latest = canonicalReleaseVersion(candidate.releaseId);
    if (!latest) throw new Error('Invalid release metadata release ID.');
    return latest;
  }

  const response = await fetch(`/index.html?projed_update_check=${nonce}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return canonicalBundleVersion(extractAppShellVersionFromHtml(await response.text()));
};

const buildLatestReloadUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set(LATEST_RELOAD_PARAM, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return `${url.pathname}${url.search}${url.hash}`;
};

const stripLatestReloadParam = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(LATEST_RELOAD_PARAM)) return;
  url.searchParams.delete(LATEST_RELOAD_PARAM);
  window.history.replaceState(null, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const statusForPhase = (phase: PwaUpdatePhase): PwaUpdateStatus => phase === 'available' ? 'update-available' : phase;

const syncStateFromTransaction = (transaction: PwaUpdateTransactionV1 | null) => {
  if (!transaction) return;
  const dismissed = dismissedTarget() === transaction.targetVersion;
  setUpdateState({
    status: statusForPhase(transaction.phase),
    updateAvailable: transaction.phase !== 'failed',
    dismissedAt: dismissed ? Date.now() : null,
    transactionId: transaction.transactionId,
    targetVersion: transaction.targetVersion,
    ownerFence: transaction.ownerFence,
    normalReloadReserved: transaction.normalReloadReserved,
    recoveryAttemptCount: transaction.recoveryAttemptCount,
  });
};

const failTransaction = (transaction: PwaUpdateTransactionV1, errorCode: string, message: string) => {
  try {
    const failed = transitionPwaUpdateTransaction(transaction, 'failed', Date.now(), { errorCode });
    writeTransaction(failed);
    setUpdateState({
      status: 'failed',
      updateAvailable: false,
      transactionId: failed.transactionId,
      targetVersion: failed.targetVersion,
      ownerFence: failed.ownerFence,
      normalReloadReserved: failed.normalReloadReserved,
      errorMessage: message,
    });
  } catch {
    setUpdateState({ status: 'failed', updateAvailable: false, errorMessage: message });
  }
};

const completeTransaction = (transaction: PwaUpdateTransactionV1, currentVersion: string) => {
  if (currentVersion !== transaction.targetVersion) return false;
  if (!writeCompletedVersion(currentVersion)) {
    failTransaction(transaction, 'COMPLETED_VERSION_WRITE_FAILED', '更新完成狀態無法保存，請重新整理後再試。');
    return false;
  }
  removeTransactionIf(transaction.transactionId);
  resetRecoveryAttempts();
  setUpdateState({
    status: 'idle',
    updateAvailable: false,
    dismissedAt: null,
    currentVersion,
    latestVersion: currentVersion,
    transactionId: null,
    targetVersion: null,
    ownerFence: 0,
    normalReloadReserved: false,
    recoveryAttemptCount: 0,
    lastAppliedAt: Date.now(),
    pendingLocalTarget: null,
    errorMessage: null,
  });
  return true;
};

const scheduleBoundedRecovery = (transaction: PwaUpdateTransactionV1) => {
  if (transaction.recoveryAttemptCount !== 0) {
    failTransaction(transaction, 'POST_RELOAD_MISMATCH', '更新後仍未載入目標版本，請使用下方恢復操作。');
    return false;
  }
  try {
    const recovering = transitionPwaUpdateTransaction(transaction, 'recovering', Date.now(), {
      recoveryAttemptCount: 1,
    });
    if (!writeTransaction(recovering)) throw new Error('Unable to persist recovery transaction.');
    setUpdateState({
      status: 'recovering',
      updateAvailable: false,
      recoveryAttemptCount: 1,
      transactionId: recovering.transactionId,
      targetVersion: recovering.targetVersion,
      errorMessage: '正在重新取得最新應用程式檔案。',
    });
    window.setTimeout(() => window.location.replace(buildLatestReloadUrl()), 50);
    return true;
  } catch (error) {
    failTransaction(transaction, 'RECOVERY_RESERVATION_FAILED', error instanceof Error ? error.message : '更新恢復失敗。');
    return false;
  }
};

const reconcilePendingTransaction = () => {
  if (normalReloadRequested) return;
  const transaction = readTransaction();
  if (!transaction) return;

  const currentVersion = getCurrentAppVersion();
  if (currentVersion && currentVersion === transaction.targetVersion) {
    completeTransaction(transaction, currentVersion);
    return;
  }

  if (isPwaUpdateTransactionStale(transaction, Date.now())) {
    failTransaction(transaction, 'TRANSACTION_STALE', '更新交易已逾時，請重新檢查版本。');
    return;
  }

  if (transaction.normalReloadReserved && transaction.phase !== 'failed') {
    const reservation = getPwaReloadReservation();
    const ownsLocalReload = transaction.ownerTabId === getTabId()
      && reservation?.targetVersion === transaction.targetVersion;
    if (ownsLocalReload) scheduleBoundedRecovery(transaction);
    else syncStateFromTransaction(transaction);
    return;
  }

  syncStateFromTransaction(transaction);
};

const recordLoadedAppVersion = () => {
  const currentVersion = getCurrentAppVersion();
  if (!currentVersion || typeof sessionStorage === 'undefined') return;

  let previousVersion: string | null = null;
  try {
    previousVersion = sessionStorage.getItem(CURRENT_VERSION_KEY)
      || (typeof localStorage === 'undefined' ? null : localStorage.getItem(LEGACY_APP_VERSION_KEY));
    sessionStorage.setItem(CURRENT_VERSION_KEY, currentVersion);
    // Remove obsolete cross-tab identities. The loaded release belongs to the
    // current document/session and must never be inferred from another tab.
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CURRENT_VERSION_KEY);
      localStorage.removeItem(LEGACY_APP_VERSION_KEY);
    }
  } catch {
    previousVersion = null;
  }

  setUpdateState({
    currentVersion,
    latestVersion: updateState.latestVersion || currentVersion,
    previousVersion,
    pendingLocalTarget: null,
  });
  const reloadReservation = getPwaReloadReservation();
  if (reloadReservation?.targetVersion === currentVersion) clearPwaReloadReservation();
  setPwaReloadReadiness('version-shell', currentVersion, true);
  reconcilePendingTransaction();
};

const createAvailableTransaction = (sourceVersion: string, targetVersion: string) => (
  createPwaUpdateTransaction({
    // Two tabs may discover the same publication in the same event loop.
    // Stable identity prevents duplicate ephemeral transactions before the
    // global apply lock elects one activation owner.
    transactionId: createStableTransactionId(sourceVersion, targetVersion),
    sourceVersion,
    targetVersion,
    now: Date.now(),
  })
);

const ensureAvailableTransaction = (sourceVersion: string, targetVersion: string) => {
  const existing = readTransaction();
  if (existing) {
    if (existing.targetVersion === targetVersion) return existing;
    if (existing.phase !== 'available' && existing.phase !== 'failed') return existing;
  }

  // completedVersion is cross-tab history, not proof that this document has
  // loaded the target. A stale client whose sourceVersion still differs must
  // create its own local convergence obligation at its next safe boundary.

  const next = createAvailableTransaction(sourceVersion, targetVersion);
  if (!writeTransaction(next)) throw new Error('Unable to persist PWA update transaction.');
  return next;
};

const checkForAppShellUpdate = async () => {
  if (normalReloadRequested) return false;
  const currentVersion = getCurrentAppVersion();
  if (!currentVersion || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;

  setUpdateState({ currentVersion, lastCheckedAt: Date.now() });

  try {
    const latestVersion = await fetchLatestAppVersion();
    if (!latestVersion) return false;
    // An async check may have started before controllerchange. Do not let an
    // old page publish a transaction after its normal reload was reserved.
    if (normalReloadRequested) return false;

    setUpdateState({ latestVersion });
    const observedWaitingWorker = registeredServiceWorker?.waiting;
    if (
      observedWaitingWorker
      && !registeredServiceWorker?.installing
      && latestVersion !== currentVersion
    ) {
      waitingWorkerTargets.set(observedWaitingWorker, latestVersion);
    }
    const existing = readTransaction();
    if (existing && existing.targetVersion === currentVersion) {
      completeTransaction(existing, currentVersion);
      return false;
    }
    // A completed version is global metadata, not proof that this document
    // has loaded it. An old tab must keep its local pending target.
    if (latestVersion === currentVersion) {
      if (!existing || existing.phase === 'failed') {
        setUpdateState({
          status: 'idle',
          updateAvailable: false,
          dismissedAt: null,
          errorMessage: null,
        });
      }
      return false;
    }

    // Another tab may already have activated and completed this target. The
    // current document is still stale, so keep a local obligation but do not
    // create a second global transaction or message the worker again.
    if (readCompletedVersion() === latestVersion) {
      const isDismissed = dismissedTarget() === latestVersion;
      setUpdateState({
        status: 'update-available',
        updateAvailable: true,
        dismissedAt: isDismissed ? Date.now() : null,
        currentVersion,
        latestVersion,
        pendingLocalTarget: latestVersion,
        transactionId: null,
        targetVersion: latestVersion,
        ownerFence: 0,
        normalReloadReserved: false,
        lastUpdateFoundAt: updateState.lastUpdateFoundAt || Date.now(),
        errorMessage: null,
      });
      if (getPwaReloadSafetySnapshot().state === 'safe') void applyPwaUpdateAtBoundary('app-open');
      return true;
    }

    const transaction = ensureAvailableTransaction(currentVersion, latestVersion);
    if (!transaction) return false;
    const isDismissed = dismissedTarget() === latestVersion;
    setUpdateState({
      status: transaction.phase === 'available' ? 'update-available' : statusForPhase(transaction.phase),
      updateAvailable: transaction.phase !== 'failed',
      dismissedAt: isDismissed ? Date.now() : null,
      currentVersion,
      latestVersion,
      pendingLocalTarget: latestVersion,
      transactionId: transaction.transactionId,
      targetVersion: transaction.targetVersion,
      ownerFence: transaction.ownerFence,
      normalReloadReserved: transaction.normalReloadReserved,
      lastUpdateFoundAt: transaction.phase === 'available' ? (updateState.lastUpdateFoundAt || Date.now()) : updateState.lastUpdateFoundAt,
      errorMessage: null,
    });
    if (getPwaReloadSafetySnapshot().state === 'safe') void applyPwaUpdateAtBoundary('app-open');
    return true;
  } catch (error) {
    console.warn('[PWA] App shell version check failed:', error);
    if (!updateState.updateAvailable && updateState.status === 'checking') setUpdateState({ status: 'idle' });
    return false;
  }
};

const bindAppShellUpdateChecks = () => {
  if (appShellCheckListenersBound || typeof window === 'undefined' || typeof document === 'undefined') return;
  appShellCheckListenersBound = true;
  window.setTimeout(() => void checkForAppShellUpdate(), 3000);
  window.setInterval(() => void checkForAppShellUpdate(), APP_SHELL_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForAppShellUpdate();
  });
};

const reserveAutomaticRecoveryAttempt = () => {
  const now = Date.now();
  const stored = readRecoveryAttempts();
  const withinWindow = stored.firstAttemptAt > 0 && now - stored.firstAttemptAt < RECOVERY_WINDOW_MS;
  const count = withinWindow ? stored.count : 0;
  const firstAttemptAt = withinWindow ? stored.firstAttemptAt : now;
  if (count >= MAX_AUTO_RECOVERY_ATTEMPTS) {
    setUpdateState({ recoveryAttemptCount: count });
    return false;
  }
  const nextCount = count + 1;
  if (!writeRecoveryAttempts(nextCount, firstAttemptAt)) {
    setUpdateState({ status: 'failed', errorMessage: '無法保存恢復保護狀態，請手動重新整理。' });
    return false;
  }
  setUpdateState({ recoveryAttemptCount: nextCount });
  return true;
};

const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const waitForWaitingWorker = async (registration: ServiceWorkerRegistration, previousWaiting: ServiceWorker | null = null) => {
  if (!registration.waiting && !registration.installing) return null;
  const deadline = Date.now() + PWA_UPDATE_CONTROLLER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (registration.waiting && registration.waiting !== previousWaiting) return registration.waiting;
    await delay(100);
  }
  return null;
};

const waitForWorkerActivated = () => new Promise<boolean>((resolve) => {
  if (!workbox) {
    resolve(false);
    return;
  }
  let finished = false;
  const finish = (activated: boolean) => {
    if (finished) return;
    finished = true;
    workbox?.removeEventListener('activated', onActivated);
    workbox?.removeEventListener('redundant', onRedundant);
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    window.clearTimeout(timeoutId);
    resolve(activated);
  };
  const onActivated = () => finish(true);
  const onControllerChange = () => finish(true);
  // Concurrent registration.update() calls can make one duplicate worker
  // redundant milliseconds before the shared-scope worker activates. Keep
  // waiting for the authoritative activated/controllerchange signal.
  const onRedundant = () => undefined;
  const timeoutId = window.setTimeout(() => finish(false), PWA_UPDATE_CONTROLLER_TIMEOUT_MS);
  workbox.addEventListener('activated', onActivated);
  workbox.addEventListener('redundant', onRedundant);
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
});

const reloadAtOwnBoundary = (targetVersion: string) => {
  if (!reservePwaReloadForTarget(targetVersion)) throw new Error('RELOAD_RESERVATION_FAILED');
  normalReloadRequested = true;
  let pagehideReceived = false;
  const onPageHide = () => { pagehideReceived = true; };
  window.addEventListener('pagehide', onPageHide, { once: true });
  window.setTimeout(() => {
    window.removeEventListener('pagehide', onPageHide);
    if (pagehideReceived) return;
    clearPwaReloadReservation();
    normalReloadRequested = false;
    setUpdateState({
      status: 'update-available',
      updateAvailable: true,
      normalReloadReserved: false,
      reloadSafetyCode: 'RELOAD_NAVIGATION_NOT_STARTED',
      errorMessage: '重新載入尚未開始，請再試一次。',
    });
  }, 3000);
  window.location.reload();
};

type ApplyLockRecord = {
  key: typeof APPLY_LOCK_KEY;
  targetVersion: string;
  ownerTabId: string;
  ownerFence: number;
  leaseExpiresAt: number;
};

const openApplyLockDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('PWA update lock storage is unavailable.'));
    return;
  }
  const request = indexedDB.open(APPLY_LOCK_DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(APPLY_LOCK_STORE_NAME)) {
      request.result.createObjectStore(APPLY_LOCK_STORE_NAME, { keyPath: 'key' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('PWA update lock database failed.'));
});

const acquireIndexedDbLock = async (targetVersion: string) => {
  const database = await openApplyLockDatabase();
  const ownerTabId = getTabId();
  const now = Date.now();
  const lease = await new Promise<ApplyLockRecord | null>((resolve, reject) => {
    const transaction = database.transaction(APPLY_LOCK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(APPLY_LOCK_STORE_NAME);
    const getRequest = store.get(APPLY_LOCK_KEY);
    let result: ApplyLockRecord | null = null;
    getRequest.onsuccess = () => {
      const existing = getRequest.result as ApplyLockRecord | undefined;
      if (existing && existing.leaseExpiresAt > now) return;
      result = {
        key: APPLY_LOCK_KEY,
        targetVersion,
        ownerTabId,
        ownerFence: Math.max(existing?.ownerFence ?? 0, 0) + 1,
        leaseExpiresAt: now + PWA_UPDATE_LEASE_MS,
      };
      store.put(result);
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('PWA update lock transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('PWA update lock transaction aborted.'));
  });
  database.close();
  return lease;
};

const updateIndexedDbLock = async (lease: ApplyLockRecord) => {
  const database = await openApplyLockDatabase();
  const now = Date.now();
  const updated = await new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(APPLY_LOCK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(APPLY_LOCK_STORE_NAME);
    const getRequest = store.get(APPLY_LOCK_KEY);
    let accepted = false;
    getRequest.onsuccess = () => {
      const current = getRequest.result as ApplyLockRecord | undefined;
      if (!current || current.ownerTabId !== lease.ownerTabId || current.ownerFence !== lease.ownerFence) return;
      store.put({ ...current, leaseExpiresAt: now + PWA_UPDATE_LEASE_MS });
      accepted = true;
    };
    transaction.oncomplete = () => resolve(accepted);
    transaction.onerror = () => reject(transaction.error || new Error('PWA update lock renewal failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('PWA update lock renewal aborted.'));
  });
  database.close();
  return updated;
};

const releaseIndexedDbLock = async (lease: ApplyLockRecord) => {
  try {
    const database = await openApplyLockDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(APPLY_LOCK_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(APPLY_LOCK_STORE_NAME);
      const getRequest = store.get(APPLY_LOCK_KEY);
      getRequest.onsuccess = () => {
        const current = getRequest.result as ApplyLockRecord | undefined;
        if (current?.ownerTabId === lease.ownerTabId && current.ownerFence === lease.ownerFence) store.delete(APPLY_LOCK_KEY);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('PWA update lock release failed.'));
    });
    database.close();
  } catch {
    // Lease expiry remains the recovery mechanism if release cannot be read back.
  }
};

const withApplyCriticalSection = async <T>(work: () => Promise<T>): Promise<T | null> => {
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;
  if (locks) {
    return locks.request(APPLY_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) return null;
      return work();
    });
  }
  return work();
};

const claimApplyTransaction = async (sourceVersion: string, targetVersion: string) => withApplyCriticalSection(async () => {
  const lease = await acquireIndexedDbLock(targetVersion);
  if (!lease) return null;

  const existing = readTransaction();
  if (existing && existing.phase !== 'available' && existing.phase !== 'failed' && existing.leaseExpiresAt > Date.now()) {
    await releaseIndexedDbLock(lease);
    return null;
  }
  if (existing && existing.phase === 'failed' && existing.targetVersion === targetVersion) {
    await releaseIndexedDbLock(lease);
    return null;
  }

  const base = existing && existing.targetVersion === targetVersion
    ? existing
    : createAvailableTransaction(sourceVersion, targetVersion);
  const claimed = claimPwaUpdateTransaction(base, getTabId(), lease.ownerFence, Date.now());
  if (!writeTransaction(claimed)) {
    await releaseIndexedDbLock(lease);
    throw new Error('Unable to persist PWA update owner transaction.');
  }
  return { transaction: claimed, lease };
});

const persistOwnedTransaction = (transaction: PwaUpdateTransactionV1) => {
  const current = readTransaction();
  if (!current || current.transactionId !== transaction.transactionId || current.ownerTabId !== getTabId() || current.ownerFence !== transaction.ownerFence) return false;
  return writeTransaction(transaction);
};

const startLeaseRenewal = (transaction: PwaUpdateTransactionV1, lease: ApplyLockRecord) => {
  let current = transaction;
  const intervalId = window.setInterval(() => {
    void (async () => {
      const renewed = await updateIndexedDbLock(lease).catch(() => false);
      if (!renewed) return;
      try {
        const next = renewPwaUpdateTransactionLease(current, getTabId(), lease.ownerFence, Date.now());
        if (persistOwnedTransaction(next)) current = next;
      } catch {
        // The next effect ownership check will fail closed.
      }
    })();
  }, PWA_UPDATE_LEASE_RENEW_MS);
  return {
    get current() { return current; },
    set current(next: PwaUpdateTransactionV1) { current = next; },
    stop: () => window.clearInterval(intervalId),
  };
};

const assertApplyOwnership = (transaction: PwaUpdateTransactionV1) => {
  const current = readTransaction();
  return Boolean(current && ownsPwaUpdateTransaction(current, getTabId(), transaction.ownerFence, Date.now()));
};

const prepareStableTarget = async (claimed: PwaUpdateTransactionV1) => {
  let transaction = claimed;
  let waitingWorker: ServiceWorker | null = null;
  for (let round = 0; round < PWA_UPDATE_MAX_TARGET_ROUNDS; round += 1) {
    if (!assertApplyOwnership(transaction)) throw new Error('PWA update owner lease expired.');
    const registration = registeredServiceWorker;
    if (registration) {
      const previousWaiting = registration.waiting;
      const previousTarget = previousWaiting ? waitingWorkerTargets.get(previousWaiting) : null;
      await registration.update();
      const nextWaitingWorker = previousWaiting
        && previousTarget === transaction.targetVersion
        && registration.waiting === previousWaiting
        ? previousWaiting
        : await waitForWaitingWorker(registration, previousWaiting);
      // Another client may have activated the worker already. In that case
      // there is no waiting worker left to message; this document can still
      // converge through its own reload boundary.
      if (nextWaitingWorker) waitingWorker = nextWaitingWorker;
    }
    const latest = await fetchLatestAppVersion();
    if (!latest) throw new Error('Latest app version is unavailable.');
    if (waitingWorker) waitingWorkerTargets.set(waitingWorker, latest);
    if (latest === transaction.targetVersion) {
      if (waitingWorker && waitingWorkerTargets.get(waitingWorker) !== latest) throw new Error('TARGET_UNSTABLE');
      return { transaction, waitingWorker };
    }
    if (round === PWA_UPDATE_MAX_TARGET_ROUNDS - 1) throw new Error('TARGET_UNSTABLE');
    transaction = retargetPwaUpdateTransaction(transaction, latest, Date.now());
    if (!persistOwnedTransaction(transaction)) throw new Error('PWA update retarget lost ownership.');
    setUpdateState({ latestVersion: latest, targetVersion: latest });
  }
  throw new Error('TARGET_UNSTABLE');
};

const applyStandardUpdate = async (transaction: PwaUpdateTransactionV1, lease: ApplyLockRecord) => {
  const renewal = startLeaseRenewal(transaction, lease);
  let current = transaction;
  try {
    const prepared = await prepareStableTarget(current);
    current = prepared.transaction;
    current = transitionPwaUpdateTransaction(current, 'awaiting-controller', Date.now(), { normalReloadReserved: true });
    if (!persistOwnedTransaction(current)) throw new Error('PWA update reservation was lost.');
    setUpdateState({
      status: 'awaiting-controller',
      updateAvailable: true,
      targetVersion: current.targetVersion,
      transactionId: current.transactionId,
      ownerFence: current.ownerFence,
      normalReloadReserved: true,
      errorMessage: null,
    });

    if (!assertApplyOwnership(current)) throw new Error('PWA update owner lease expired before activation.');
    if (prepared.waitingWorker) {
      const activated = waitForWorkerActivated();
      // Message the exact worker that passed target stabilization. Workbox's
      // convenience method can still point at an older waiting worker during
      // a B-waiting→C retarget race.
      prepared.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      if (!(await activated)) throw new Error('WORKER_ACTIVATION_FAILED');
    }
    reloadAtOwnBoundary(current.targetVersion);
    return true;
  } finally {
    renewal.current = current;
    renewal.stop();
  }
};

const runTestModeApply = async () => {
  const targetVersion = updateState.latestVersion || 'test-next';
  const sourceVersion = updateState.currentVersion || 'test-current';
  setUpdateState({ status: 'applying', updateAvailable: true, dismissedAt: null, targetVersion, errorMessage: null });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('projed:pwa-update-test-transaction-complete'));
  }
  setUpdateState({
    status: 'idle',
    updateAvailable: false,
    currentVersion: targetVersion,
    latestVersion: targetVersion,
    previousVersion: sourceVersion,
    transactionId: null,
    targetVersion: null,
    ownerFence: 0,
    normalReloadReserved: false,
    lastAppliedAt: Date.now(),
    errorMessage: null,
  });
  return true;
};

const runQueuedApply = async () => {
  const currentVersion = getCurrentAppVersion() || updateState.currentVersion;
  const targetVersion = updateState.targetVersion || updateState.latestVersion;
  if (!currentVersion || !targetVersion || currentVersion === targetVersion) {
    setUpdateState({ status: 'idle', updateAvailable: false });
    return false;
  }

  if (readCompletedVersion() === targetVersion) {
    reloadAtOwnBoundary(targetVersion);
    return true;
  }

  const ownership = await claimApplyTransaction(currentVersion, targetVersion);
  if (!ownership) {
    syncStateFromTransaction(readTransaction());
    return false;
  }

  const { transaction, lease } = ownership;
  setUpdateState({
    status: 'applying',
    updateAvailable: true,
    dismissedAt: null,
    transactionId: transaction.transactionId,
    targetVersion: transaction.targetVersion,
    ownerFence: transaction.ownerFence,
    normalReloadReserved: transaction.normalReloadReserved,
    errorMessage: null,
  });
  try {
    return await applyStandardUpdate(transaction, lease);
  } catch (error) {
    const message = error instanceof Error && error.message === 'TARGET_UNSTABLE'
      ? '版本正在切換，請稍後重新檢查。'
      : error instanceof Error ? error.message : '無法套用新版本。';
    console.warn('[PWA] Failed to converge app update:', error);
    const latest = readTransaction();
    if (latest && latest.transactionId === transaction.transactionId) {
      failTransaction(latest, error instanceof Error && error.message === 'TARGET_UNSTABLE' ? 'TARGET_UNSTABLE' : 'APPLY_FAILED', message);
    } else {
      setUpdateState({ status: 'failed', updateAvailable: false, errorMessage: message });
    }
    return false;
  } finally {
    await releaseIndexedDbLock(lease);
  }
};

const installPwaUpdateTestControls = () => {
  if (testControlsInstalled || typeof window === 'undefined') return;
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
  testControlsInstalled = true;

  const resetState = () => {
    updateState = {
      status: 'idle',
      updateAvailable: false,
      offlineReady: false,
      dismissedAt: null,
      lastCheckedAt: null,
      lastUpdateFoundAt: null,
      lastAppliedAt: null,
      recoveryAttemptCount: 0,
      currentVersion: null,
      latestVersion: null,
      previousVersion: null,
      transactionId: null,
      targetVersion: null,
      ownerFence: 0,
      normalReloadReserved: false,
      errorMessage: null,
      reloadSafetyState: getPwaReloadSafetySnapshot().state,
      reloadSafetyCode: getPwaReloadSafetySnapshot().code,
      pendingBoundary: null,
      pendingLocalTarget: null,
    };
    try {
      localStorage.removeItem(TRANSACTION_KEY);
      localStorage.removeItem(COMPLETED_VERSION_KEY);
    } catch {
      // Test reset remains deterministic in memory even when storage is unavailable.
    }
    removeSessionValue(DISMISSED_TARGET_KEY);
    resetRecoveryAttempts();
    notifyUpdateListeners();
  };

  window.__projedPwaUpdateTest = {
    getState: getPwaUpdateState,
    simulateUpdateAvailable: () => {
      const transaction = createAvailableTransaction('test-current', 'test-next');
      writeTransaction(transaction);
      setUpdateState({
        status: 'update-available',
        updateAvailable: true,
        dismissedAt: null,
        currentVersion: 'test-current',
        latestVersion: 'test-next',
        transactionId: transaction.transactionId,
        targetVersion: transaction.targetVersion,
        ownerFence: 0,
        normalReloadReserved: false,
        lastUpdateFoundAt: Date.now(),
        errorMessage: null,
      });
    },
    simulateUpdated: () => {
      resetState();
      setUpdateState({ status: 'updated', updateAvailable: false, currentVersion: 'test-next', latestVersion: 'test-next', previousVersion: 'test-current', lastAppliedAt: Date.now() });
    },
    simulateOfflineReady: () => setUpdateState({ status: 'offline-ready', offlineReady: true, errorMessage: null }),
    simulateRecoverableCacheError: (message = '測試載入錯誤') => setUpdateState({ status: 'recoverable-cache-error', errorMessage: message }),
    reset: resetState,
  };
};

const setupCrossTabSync = () => {
  if (crossTabListenersBound || typeof window === 'undefined') return;
  crossTabListenersBound = true;
  if ('BroadcastChannel' in window) {
    try {
      updateChannel = new BroadcastChannel(CROSS_TAB_CHANNEL_NAME);
      updateChannel.addEventListener('message', () => reconcilePendingTransaction());
    } catch {
      updateChannel = null;
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === TRANSACTION_KEY || event.key === COMPLETED_VERSION_KEY) reconcilePendingTransaction();
  });
};

export const getPwaUpdateState = () => cloneState();

export const subscribePwaUpdateState = (listener: PwaUpdateListener) => {
  listeners.add(listener);
  listener(cloneState());
  return () => {
    listeners.delete(listener);
  };
};

export const dismissPwaUpdatePrompt = () => {
  const target = updateState.targetVersion || updateState.latestVersion;
  if (target) setSessionValue(DISMISSED_TARGET_KEY, target);
  setUpdateState({ dismissedAt: Date.now() });
};

const getCurrentViewIntent = (): ViewMode | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = localStorage.getItem('projed-last-view');
    return value && ['home', 'list', 'mindmap', 'board', 'gantt', 'calendar', 'records', 'calendar_subscriptions', 'settings', 'recycle_bin'].includes(value)
      ? value as ViewMode
      : null;
  } catch {
    return null;
  }
};

const safetyFailureMessage = (code: PwaReloadSafetyFailureCode) => {
  switch (code) {
    case 'OWNER_ACTION_REQUIRED':
      return '請先儲存或取消目前編輯。';
    case 'VIEW_INTENT_NOT_DURABLE':
      return '目前畫面尚未完成保存，請稍後再試。';
    case 'RELOAD_NAVIGATION_NOT_STARTED':
      return '重新載入尚未開始，請再試一次。';
    case 'OWNER_PREPARE_FAILED':
    case 'OWNER_PREPARE_TIMEOUT':
    case 'LOCAL_READBACK_DIRTY':
      return '內容尚未保存，請完成後再試。';
    default:
      return '目前無法確認內容是否已保存。';
  }
};

const applyPwaUpdateAtBoundary = async (boundary: PwaReloadBoundary) => {
  if (applyPromise) return applyPromise;
  if (!updateState.updateAvailable && !updateState.targetVersion && !updateState.latestVersion) return false;

  // Test-mode transaction controls intentionally bypass the production safety
  // gate; production never exposes this control surface.
  if ((import.meta.env.DEV || import.meta.env.MODE === 'test') && typeof window !== 'undefined' && window.__projedPwaUpdateTest) {
    applyPromise = runTestModeApply().finally(() => { applyPromise = null; });
    return applyPromise;
  }

  const currentView = getCurrentViewIntent();
  const gate = await requestPwaReloadBoundary(boundary, currentView);
  syncReloadSafetyState();
  if (!gate.ok) {
    setUpdateState({
      status: 'update-available',
      updateAvailable: true,
      pendingBoundary: boundary,
      pendingLocalTarget: updateState.targetVersion || updateState.latestVersion,
      errorMessage: safetyFailureMessage(gate.code),
    });
    return false;
  }

  applyPromise = runQueuedApply().finally(() => { applyPromise = null; });
  return applyPromise;
};

export const applyPwaUpdate = async () => {
  if (applyPromise) return applyPromise;
  return applyPwaUpdateAtBoundary('user-confirmed');
};

export const clearPwaApplicationCacheAndReload = async () => {
  setUpdateState({ status: 'recovering', updateAvailable: false, errorMessage: null });

  try {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker is unavailable.');
    const registrations = await navigator.serviceWorker.getRegistrations();
    const unregisterResults = await Promise.all(registrations.map((registration) => registration.unregister()));
    if (unregisterResults.some((result) => result !== true)) throw new Error('Service worker unregister did not complete.');
    if (!('caches' in window)) throw new Error('Cache Storage is unavailable.');
    const cacheNames = await window.caches.keys();
    const deleteResults = await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    if (deleteResults.some((result) => result !== true)) throw new Error('Cache Storage deletion did not complete.');
    const transaction = readTransaction();
    if (transaction) removeTransactionIf(transaction.transactionId);
    resetRecoveryAttempts();
  } catch (error) {
    const message = error instanceof Error ? error.message : '清除應用程式快取失敗。';
    console.warn('[PWA] Failed to clear app cache:', error);
    setUpdateState({ status: 'failed', errorMessage: message });
    return false;
  }
  window.location.replace(buildLatestReloadUrl());
  return true;
};

export const handleRecoverableAppLoadError = (error: unknown, source: 'error' | 'unhandledrejection' = 'error') => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '新版檔案載入失敗。';
  console.warn(`[PWA] Recoverable app load error from ${source}:`, error);
  setUpdateState({ status: 'recoverable-cache-error', updateAvailable: false, errorMessage: message });
  if (!reserveAutomaticRecoveryAttempt()) {
    setUpdateState({ status: 'failed', errorMessage: message });
    return false;
  }
  window.setTimeout(() => window.location.replace(buildLatestReloadUrl()), 50);
  return true;
};

export const setupPwaLifecycle = () => {
  installPwaUpdateTestControls();
  if (setupDone) return;
  setupDone = true;
  if (typeof window === 'undefined') return;
  if (!safetySubscriptionBound) {
    safetySubscriptionBound = true;
    let previousState = getPwaReloadSafetySnapshot();
    subscribePwaReloadSafety((nextState) => {
      setUpdateState({
        reloadSafetyState: nextState.state,
        reloadSafetyCode: nextState.code,
        pendingBoundary: nextState.pendingBoundary,
      });
      const viewChanged = previousState.currentView !== null
        && nextState.currentView !== null
        && previousState.currentView !== nextState.currentView;
      const becameSafeAtAppOpen = previousState.state === 'booting' && nextState.state === 'safe';
      previousState = nextState;
      if (updateState.updateAvailable && (viewChanged || becameSafeAtAppOpen) && nextState.state === 'safe') {
        void applyPwaUpdateAtBoundary(viewChanged ? 'view-transition' : 'app-open');
      }
    });
  }
  setupCrossTabSync();
  stripLatestReloadParam();
  if (import.meta.env.PROD) {
    getTabId();
    recordLoadedAppVersion();
    bindAppShellUpdateChecks();
  } else {
    setPwaReloadReadiness('version-shell', `mode:${import.meta.env.MODE}`, true);
  }
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  workbox = new Workbox('/sw.js', { scope: '/' });
  workbox.addEventListener('waiting', () => {
    if (normalReloadRequested) return;
    setUpdateState({
      status: 'update-available',
      updateAvailable: true,
      dismissedAt: null,
      currentVersion: getCurrentAppVersion() ?? updateState.currentVersion,
      lastUpdateFoundAt: Date.now(),
      errorMessage: null,
    });
    void checkForAppShellUpdate();
  });
  workbox.addEventListener('activated', (event) => {
    // Activation is deliberately not a navigation signal. With clientsClaim
    // disabled, each document decides its own later reload boundary.
    if (event.isUpdate && !normalReloadRequested) {
      setUpdateState({ status: 'awaiting-controller', errorMessage: null });
    }
  });
  workbox.addEventListener('redundant', () => {
    // A redundant event can describe a duplicate worker installed by another
    // tab, not failure of the shared registration. The bounded activation
    // waiter owns the actual failure decision.
    if (!normalReloadRequested && updateState.updateAvailable) void checkForAppShellUpdate();
  });

  void workbox.register({ immediate: true }).then((registration) => {
    if (!registration) throw new Error('Service worker registration returned no registration.');
    registeredServiceWorker = registration;
    const checkForUpdate = () => {
      if (!navigator.onLine) return;
      const canShowChecking = !updateState.updateAvailable && updateState.status !== 'updated';
      if (canShowChecking) setUpdateState({ status: 'checking', lastCheckedAt: Date.now() });
      registration.update().catch((error) => {
        console.warn('[PWA] Update check failed:', error);
        if (!updateState.updateAvailable) setUpdateState({ status: 'failed', errorMessage: error instanceof Error ? error.message : '檢查更新失敗。' });
      }).finally(() => {
        if (!updateState.updateAvailable && updateState.status === 'checking') setUpdateState({ status: 'idle' });
        void checkForAppShellUpdate();
      });
    };
    window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
        void applyPwaUpdateAtBoundary('foreground');
      }
    });
    checkForUpdate();
  }).catch((error) => {
    console.warn('[PWA] Service worker registration failed:', error);
    setUpdateState({ status: 'failed', errorMessage: error instanceof Error ? error.message : '版本更新服務註冊失敗。' });
  });
};
