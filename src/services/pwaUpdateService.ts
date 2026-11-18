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
  renewPwaUpdateTransactionLease,
  serializePwaUpdateTransaction,
  transitionPwaUpdateTransaction,
  type PwaUpdatePhase,
  type PwaUpdateTransactionV1,
} from './pwaUpdateTransaction';
import { confirmLoadedAppVersion, reserveAppVersionNavigation } from './pwaVersionPin';
import { capturePwaReloadLocation, clearPwaReloadLocation } from './pwaReloadLocation';
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

export type PwaCheckPhase = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error' | 'cancelled' | 'busy';
export type PwaCheckErrorCode = 'CHECK_OFFLINE' | 'CHECK_TIMEOUT' | 'CHECK_FAILED' | 'CHECK_UNAVAILABLE' | 'CHECK_VERSION_UNKNOWN';
export type PwaUpdateCheckState = {
  requestId: number;
  phase: PwaCheckPhase;
  currentVersion: string | null;
  latestVersion: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  errorCode: PwaCheckErrorCode | null;
};
export type PwaUpdateState = {
  check: PwaUpdateCheckState;
  localUpdateBusy: boolean;
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
  errorCode: string | null;
  failureKind: 'update' | 'load' | 'cache-recovery' | null;
  reloadSafetyState: 'booting' | 'safe' | 'dirty' | 'preparing' | 'blocked';
  reloadSafetyCode: PwaReloadSafetyFailureCode | null;
  pendingBoundary: PwaReloadBoundary | null;
  pendingLocalTarget: string | null;
};

type PwaUpdateListener = (state: PwaUpdateState) => void;

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const APP_SHELL_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const CURRENT_VERSION_KEY = 'projed.pwa-update.current-version.v1';
const LEGACY_APP_VERSION_KEY = 'projed.pwaUpdate.currentBundle';
const COMPLETED_VERSION_KEY = 'projed.pwa-update.completed-version.v1';
const TRANSACTION_KEY = 'projed.pwa-update.transaction.v1';
const TAB_ID_KEY = 'projed.pwa-update.tab-id.v1';
const DISMISSED_TARGET_KEY = 'projed.pwa-update.dismissed-target.v1';
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
let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;
let workbox: Workbox | null = null;
let updateChannel: BroadcastChannel | null = null;
let applyPromise: Promise<boolean> | null = null;
let retryPromise: Promise<boolean> | null = null;
let recoveryPromise: Promise<boolean> | null = null;
let documentSuspended = false;
const CHECK_TIMEOUT_MS = 10_000;
const nativeUpdates = new WeakMap<ServiceWorkerRegistration, Promise<void>>();
type DetectionFlight = {
  requestId: number;
  startedAt: number;
  deadlineAt: number;
  controller: AbortController;
  requireWorker: boolean;
  closed: boolean;
  promise: Promise<PwaUpdateCheckState>;
};
let checkSequence = 0;
let detectionFlight: DetectionFlight | null = null;
let appShellCheckListenersBound = false;
let crossTabListenersBound = false;
let setupDone = false;
let testControlsInstalled = false;
let memoryTabId: string | null = null;
let normalReloadRequested = false;
let safetySubscriptionBound = false;

let updateState: PwaUpdateState = {
  check: { requestId: 0, phase: 'idle', currentVersion: null, latestVersion: null, startedAt: null, finishedAt: null, errorCode: null },
  localUpdateBusy: false,
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
  errorCode: null,
  failureKind: null,
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

const isLocalUpdateBusy = () => Boolean(applyPromise || retryPromise || recoveryPromise
  || updateState.reloadSafetyState === 'preparing' || normalReloadRequested);
const cloneState = (): PwaUpdateState => ({
  ...updateState, localUpdateBusy: isLocalUpdateBusy(), check: { ...updateState.check },
});

const dispatchStateEvent = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PwaUpdateState>(STATE_EVENT_NAME, { detail: cloneState() }));
};

const notifyUpdateListeners = () => {
  listeners.forEach((listener) => listener(cloneState()));
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

const dismissedTarget = () => {
  try {
    return localStorage.getItem(DISMISSED_TARGET_KEY) ?? getSessionValue(DISMISSED_TARGET_KEY);
  } catch {
    return getSessionValue(DISMISSED_TARGET_KEY);
  }
};

const extractBundleVersionFromSrc = (src: string | null | undefined) => {
  const match = src?.match(/\/assets\/(?:index|main)-([A-Za-z0-9_-]+)\.js/);
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

const getEmbeddedAppShellVersion = () => {
  if (typeof document === 'undefined') return null;
  const value = document.querySelector('meta[name="projed-shell-version"]')?.getAttribute('content')?.trim();
  return value || null;
};

const getCurrentAppVersion = () => {
  const releaseVersion = canonicalReleaseVersion(getProductionReleaseId());
  if (releaseVersion) return releaseVersion;
  // Vite's staging build also sets PROD=true. It does not receive the sealed
  // release ID, so it uses the build-wide app-shell version emitted into both
  // HTML entries, with the historical bundle hash as a compatibility fallback.
  return getEmbeddedAppShellVersion() || canonicalBundleVersion(getCurrentBundleHash());
};

const extractAppShellVersionFromHtml = (html: string) => (
  extractBundleVersionFromSrc(html.match(/<script[^>]+src=["']([^"']*\/assets\/(?:index|main)-[A-Za-z0-9_-]+\.js)["']/)?.[1])
);

const waitUntil = <T>(promise: Promise<T>, deadlineAt: number, signal?: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (error: unknown, value?: T) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', aborted);
    if (error) reject(error);
    else resolve(value as T);
  };
  const timer = setTimeout(() => finish(new Error('CHECK_TIMEOUT')), Math.max(0, deadlineAt - Date.now()));
  const aborted = () => finish(signal?.reason ?? new Error('CHECK_CANCELLED'));
  if (signal?.aborted) aborted();
  else signal?.addEventListener('abort', aborted, { once: true });
  promise.then(value => {
    if (signal?.aborted) aborted();
    else if (Date.now() >= deadlineAt) finish(new Error('CHECK_TIMEOUT'));
    else finish(null, value);
  }, error => finish(error));
});
const refreshWorker = (registration: ServiceWorkerRegistration) => {
  let pending = nativeUpdates.get(registration);
  if (!pending) {
    pending = Promise.resolve().then(() => registration.update()).then(() => undefined).finally(() => {
      if (nativeUpdates.get(registration) === pending) nativeUpdates.delete(registration);
    });
    nativeUpdates.set(registration, pending);
  }
  return pending;
};
const validVersion = (value: unknown): value is string => typeof value === 'string'
  && /^(?:release|build|bundle):[A-Za-z0-9][A-Za-z0-9._:-]{0,200}$/.test(value);
const fetchLatestReleaseVersion = async (nonce: string, deadlineAt: number, signal: AbortSignal) => {
  const response = await waitUntil(fetch(`/release-meta.json?projed_update_check=${nonce}`, {
    signal,
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  }), deadlineAt, signal);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const meta: unknown = await waitUntil(response.json(), deadlineAt, signal);
  if (!meta || typeof meta !== 'object') throw new Error('Invalid release metadata.');
  const candidate = meta as { schemaVersion?: unknown; releaseId?: unknown };
  if (candidate.schemaVersion !== 1 || typeof candidate.releaseId !== 'string') {
    throw new Error('Invalid release metadata schema.');
  }
  const latest = canonicalReleaseVersion(candidate.releaseId);
  if (!validVersion(latest)) throw new Error('CHECK_VERSION_UNKNOWN');
  return latest;
};

const fetchLatestAppVersion = async (options?: { deadlineAt: number; signal: AbortSignal }) => {
  const controller = options ? null : new AbortController();
  const deadlineAt = options?.deadlineAt ?? Date.now() + CHECK_TIMEOUT_MS;
  const signal = options?.signal ?? controller!.signal;
  const timer = controller ? setTimeout(() => controller.abort(new Error('CHECK_TIMEOUT')), Math.max(0, deadlineAt - Date.now())) : null;
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    try {
    const response = await waitUntil(fetch(`/app-shell-meta.json?projed_update_check=${nonce}`, {
      signal,
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    }), deadlineAt, signal);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const meta: unknown = await waitUntil(response.json(), deadlineAt, signal);
    if (!meta || typeof meta !== 'object') throw new Error('Invalid app-shell metadata.');
    const candidate = meta as { schemaVersion?: unknown; version?: unknown };
    if (candidate.schemaVersion !== 1 || !validVersion(candidate.version)) {
      throw new Error('CHECK_VERSION_UNKNOWN');
    }
    return candidate.version;
  } catch (appShellError) {
    if (signal.aborted) throw signal.reason;
    if (Date.now() >= deadlineAt) throw new Error('CHECK_TIMEOUT');
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('CHECK_OFFLINE');
    // Older sealed artifacts still publish release-meta.json. New artifacts
    // use app-shell-meta as the canonical check above.
    if (getProductionReleaseId()) return await fetchLatestReleaseVersion(nonce, deadlineAt, signal);
    const response = await waitUntil(fetch(`/index.html?projed_update_check=${nonce}`, {
      signal,
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    }), deadlineAt, signal);
    if (!response.ok) throw appShellError;
    const latestHash = extractAppShellVersionFromHtml(await waitUntil(response.text(), deadlineAt, signal));
    const latest = canonicalBundleVersion(latestHash);
    if (!validVersion(latest)) throw new Error('CHECK_VERSION_UNKNOWN');
    return latest;
  }
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
};

const buildLatestReloadUrl = (targetVersion: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set(LATEST_RELOAD_PARAM, targetVersion);
  return `${url.pathname}${url.search}${url.hash}`;
};

const stripLatestReloadParam = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(LATEST_RELOAD_PARAM)) return;
  clearPwaReloadLocation();
  url.searchParams.delete(LATEST_RELOAD_PARAM);
  window.history.replaceState(null, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const statusForPhase = (phase: PwaUpdatePhase): PwaUpdateStatus => phase === 'available' ? 'update-available' : phase;

const transactionFailureMessage = (transaction: PwaUpdateTransactionV1) => {
  if (transaction.errorMessage) return transaction.errorMessage;
  switch (transaction.errorCode) {
    case 'TRANSACTION_STALE': return '先前重新載入未完成，請重試。';
    case 'POST_RELOAD_MISMATCH': return '尚未載入目標版本，請重試。';
    case 'TARGET_UNSTABLE': return '版本正在切換，請稍後重試。';
    default: return '先前更新未完成，請重試。';
  }
};

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
    errorCode: transaction.phase === 'failed' ? transaction.errorCode || 'APPLY_FAILED' : null,
    errorMessage: transaction.phase === 'failed' ? transactionFailureMessage(transaction) : null,
    failureKind: transaction.phase === 'failed' ? 'update' : null,
  });
};

const failTransaction = (transaction: PwaUpdateTransactionV1, errorCode: string, message: string) => {
  try {
    const failed = transitionPwaUpdateTransaction(transaction, 'failed', Date.now(), { errorCode, errorMessage: message.slice(0, 1024) });
    writeTransaction(failed);
    setUpdateState({
      status: 'failed',
      updateAvailable: false,
      transactionId: failed.transactionId,
      targetVersion: failed.targetVersion,
      ownerFence: failed.ownerFence,
      normalReloadReserved: failed.normalReloadReserved,
      errorMessage: message,
      errorCode,
      failureKind: 'update',
    });
  } catch {
    setUpdateState({ status: 'failed', updateAvailable: false, errorMessage: message, errorCode, failureKind: 'update' });
  }
};

const completeTransaction = (transaction: PwaUpdateTransactionV1, currentVersion: string) => {
  if (currentVersion !== transaction.targetVersion) return false;
  if (!writeCompletedVersion(currentVersion)) {
    failTransaction(transaction, 'COMPLETED_VERSION_WRITE_FAILED', '更新完成狀態無法保存，請重新整理後再試。');
    return false;
  }
  removeTransactionIf(transaction.transactionId);
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
    errorCode: null,
    failureKind: null,
  });
  return true;
};

const reconcilePendingTransaction = () => {
  if (normalReloadRequested || applyPromise || retryPromise || recoveryPromise) return;
  // Shared activation history cannot prove this document's failed view loaded.
  if (updateState.failureKind === 'load' || updateState.failureKind === 'cache-recovery') return;
  const transaction = readTransaction();
  if (!transaction) {
    const currentVersion = getCurrentAppVersion();
    const latestVersion = updateState.latestVersion;
    if (currentVersion && latestVersion && currentVersion !== latestVersion
      && readCompletedVersion() === latestVersion) {
      showAvailableTarget(currentVersion, latestVersion);
    }
    return;
  }

  const currentVersion = getCurrentAppVersion();
  const reservation = getPwaReloadReservation();
  const ownsLocalReload = transaction.ownerTabId === getTabId()
    && reservation?.targetVersion === transaction.targetVersion;
  if (currentVersion && currentVersion === transaction.targetVersion) {
    if (ownsLocalReload) completeTransaction(transaction, currentVersion);
    return;
  }
  if (!ownsLocalReload && transaction.targetVersion !== updateState.latestVersion) return;
  // A foreign attempt can change the waiting worker, not this page's local UI or navigation.
  if (transaction.ownerTabId && transaction.ownerTabId !== getTabId()) return;

  if (transaction.phase === 'failed') {
    syncStateFromTransaction(transaction);
    return;
  }

  if (isPwaUpdateTransactionStale(transaction, Date.now())) {
    failTransaction(transaction, 'TRANSACTION_STALE', '更新交易已逾時，請重新檢查版本。');
    return;
  }

  if (transaction.normalReloadReserved && ownsLocalReload) {
    clearPwaReloadReservation();
    failTransaction(transaction, 'POST_RELOAD_MISMATCH', '更新後仍未載入目標版本，請重試。');
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

  const versionConfirmed = confirmLoadedAppVersion(currentVersion);
  setUpdateState({
    currentVersion,
    latestVersion: updateState.latestVersion || currentVersion,
    previousVersion,
    pendingLocalTarget: null,
  });
  setPwaReloadReadiness('version-shell', currentVersion, true);
  if (versionConfirmed) reconcilePendingTransaction();
  const reloadReservation = getPwaReloadReservation();
  if (reloadReservation?.targetVersion === currentVersion) {
    clearPwaReloadReservation();
    if (!versionConfirmed) {
      setUpdateState({ status: 'failed', errorMessage: '無法保存已載入版本，請重試。', errorCode: 'VERSION_PIN_WRITE_FAILED', failureKind: 'update' });
    } else if (!updateState.lastAppliedAt) {
      setUpdateState({ lastAppliedAt: Date.now() });
    }
  }
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

const showAvailableTarget = (currentVersion: string, targetVersion: string, errorMessage: string | null = null) => {
  const sameTarget = updateState.targetVersion === targetVersion;
  setUpdateState({
    status: 'update-available',
    updateAvailable: true,
    currentVersion,
    latestVersion: targetVersion,
    targetVersion,
    pendingLocalTarget: targetVersion,
    dismissedAt: dismissedTarget() === targetVersion ? Date.now() : null,
    transactionId: null,
    normalReloadReserved: false,
    ownerFence: 0,
    lastUpdateFoundAt: sameTarget ? updateState.lastUpdateFoundAt || Date.now() : Date.now(),
    errorMessage: errorMessage ?? (sameTarget && updateState.updateAvailable ? updateState.errorMessage : null),
    errorCode: null,
    failureKind: null,
  });
};

const publishDetectedTarget = (currentVersion: string, latestVersion: string, flight: DetectionFlight) => {
    setUpdateState({ currentVersion, latestVersion, lastCheckedAt: Date.now() });
    if (!flightIsCurrent(flight)) return false;
    if (updateState.failureKind === 'load' || updateState.failureKind === 'cache-recovery') return false;
    const existing = readTransaction();
    // A completed version is global metadata, not proof that this document
    // has loaded it. An old tab must keep its local pending target.
    if (latestVersion === currentVersion) {
      if (updateState.targetVersion !== currentVersion || updateState.failureKind !== 'update') {
        setUpdateState({
          status: 'idle',
          updateAvailable: false,
          dismissedAt: null,
          errorMessage: null,
          errorCode: null,
          failureKind: null,
          targetVersion: null,
          transactionId: null,
          pendingLocalTarget: null,
        });
      }
      return false;
    }

    // Detection never reopens a failed activation; retry owns that effect.
    if (updateState.failureKind === 'update' && updateState.targetVersion === latestVersion) return false;

    // Another tab may already have activated and completed this target. The
    // current document is still stale, so keep a local obligation but do not
    // create a second global transaction or message the worker again.
    if (existing?.phase === 'failed' && existing.targetVersion === latestVersion
      && existing.ownerTabId === getTabId()) {
      syncStateFromTransaction(existing);
      return false;
    }
    showAvailableTarget(currentVersion, latestVersion);
    return true;
};

const flightIsCurrent = (flight: DetectionFlight) => detectionFlight === flight && !flight.closed
  && !flight.controller.signal.aborted && !documentSuspended && !isLocalUpdateBusy() && Date.now() < flight.deadlineAt;
const checkResult = (phase: PwaCheckPhase, flight?: DetectionFlight, errorCode: PwaCheckErrorCode | null = null): PwaUpdateCheckState => ({
  requestId: flight?.requestId ?? 0, phase, currentVersion: getCurrentAppVersion(), latestVersion: null,
  startedAt: flight?.startedAt ?? Date.now(), finishedAt: Date.now(), errorCode,
});
const cancelDetection = () => {
  const flight = detectionFlight;
  if (!flight) return;
  flight.closed = true;
  detectionFlight = null;
  flight.controller.abort(new Error('CHECK_CANCELLED'));
  setUpdateState({ check: checkResult('cancelled', flight) });
};
const readWorkerVersion = async (worker: ServiceWorker, deadlineAt: number, signal?: AbortSignal) => {
  if (typeof MessageChannel === 'undefined') throw new Error('CHECK_VERSION_UNKNOWN');
  const channel = new MessageChannel();
  const requestId = createId('worker');
  const response = new Promise<unknown>((resolve, reject) => {
    channel.port1.onmessage = event => resolve(event.data);
    channel.port1.onmessageerror = () => reject(new Error('CHECK_VERSION_UNKNOWN'));
  });
  try {
    worker.postMessage({ type: 'PROJED_PWA_WORKER_VERSION_V1', requestId }, [channel.port2]);
    const reply = await waitUntil(response, deadlineAt, signal);
    const identity = reply as { type?: unknown; schemaVersion?: unknown; requestId?: unknown; version?: unknown } | null;
    if (!identity || identity.type !== 'PROJED_PWA_WORKER_VERSION_V1' || identity.schemaVersion !== 1
      || identity.requestId !== requestId || !validVersion(identity.version)) throw new Error('CHECK_VERSION_UNKNOWN');
    return identity.version;
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
};

const confirmSameVersionWaitingWorker = async (flight: DetectionFlight, latestVersion: string) => {
  const registration = registeredServiceWorker;
  if (!registration) return;
  const installing = registration.installing;
  if (installing) {
    let onStateChange: () => void = () => {};
    const settled = new Promise<void>(resolve => {
      onStateChange = () => { if (installing.state !== 'parsed' && installing.state !== 'installing') resolve(); };
      installing.addEventListener('statechange', onStateChange);
      onStateChange();
    });
    try { await waitUntil(settled, flight.deadlineAt, flight.controller.signal); }
    finally { installing.removeEventListener('statechange', onStateChange); }
  }
  if (!flightIsCurrent(flight)) throw new Error('CHECK_CANCELLED');
  if (registeredServiceWorker !== registration || registration.installing) throw new Error('CHECK_VERSION_UNKNOWN');
  const waiting = registration.waiting;
  if (!waiting || waitingWorkerTargets.get(waiting) === latestVersion) return;
  const version = await readWorkerVersion(waiting, flight.deadlineAt, flight.controller.signal);
  if (!flightIsCurrent(flight)) throw new Error('CHECK_CANCELLED');
  if (version !== latestVersion || registeredServiceWorker !== registration
    || registration.waiting !== waiting || registration.installing) {
    throw new Error('CHECK_VERSION_UNKNOWN');
  }
  waitingWorkerTargets.set(waiting, version);
};
const runDetection = async (flight: DetectionFlight): Promise<PwaUpdateCheckState> => {
  let result: PwaUpdateCheckState;
  const refresh = async () => {
    let registration = registeredServiceWorker;
    if (!registration) {
      if (!serviceWorkerRegistrationPromise) throw new Error('CHECK_UNAVAILABLE');
      try {
        registration = await waitUntil(serviceWorkerRegistrationPromise, flight.deadlineAt, flight.controller.signal);
      } catch {
        if (flight.controller.signal.aborted) throw flight.controller.signal.reason;
        if (Date.now() >= flight.deadlineAt) throw new Error('CHECK_TIMEOUT');
        throw new Error('CHECK_UNAVAILABLE');
      }
    }
    await waitUntil(refreshWorker(registration), flight.deadlineAt, flight.controller.signal);
  };
  try {
    const currentVersion = getCurrentAppVersion();
    if (!validVersion(currentVersion)) throw new Error('CHECK_VERSION_UNKNOWN');
    if (!navigator.onLine) throw new Error('CHECK_OFFLINE');
    let refreshed = false;
    if (flight.requireWorker) { await refresh(); refreshed = true; }
    const options = { deadlineAt: flight.deadlineAt, signal: flight.controller.signal };
    let latestVersion = await fetchLatestAppVersion(options);
    if (flight.requireWorker && !refreshed) {
      await refresh();
      latestVersion = await fetchLatestAppVersion(options);
    }
    if (!flightIsCurrent(flight)) throw new Error('CHECK_CANCELLED');
    if (latestVersion === currentVersion && (registeredServiceWorker?.installing || registeredServiceWorker?.waiting)) {
      await confirmSameVersionWaitingWorker(flight, latestVersion);
    }
    if (!flightIsCurrent(flight)) throw new Error('CHECK_CANCELLED');
    const waiting = registeredServiceWorker?.waiting;
    if (latestVersion === currentVersion && (registeredServiceWorker?.installing
      || (waiting && waitingWorkerTargets.get(waiting) !== latestVersion))) {
      throw new Error('CHECK_VERSION_UNKNOWN');
    }
    publishDetectedTarget(currentVersion, latestVersion, flight);
    if (!flightIsCurrent(flight)) throw new Error('CHECK_CANCELLED');
    result = { ...checkResult(latestVersion === currentVersion ? 'up-to-date' : 'available', flight), currentVersion, latestVersion };
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const cancelled = flight.closed || documentSuspended || isLocalUpdateBusy() || code === 'CHECK_CANCELLED';
    const errorCode: PwaCheckErrorCode = Date.now() >= flight.deadlineAt || code === 'CHECK_TIMEOUT' ? 'CHECK_TIMEOUT'
      : !navigator.onLine || code === 'CHECK_OFFLINE' ? 'CHECK_OFFLINE'
        : code === 'CHECK_UNAVAILABLE' ? 'CHECK_UNAVAILABLE' : code === 'CHECK_VERSION_UNKNOWN' ? 'CHECK_VERSION_UNKNOWN' : 'CHECK_FAILED';
    result = checkResult(cancelled ? 'cancelled' : 'error', flight, cancelled ? null : errorCode);
  }
  if (detectionFlight === flight && !flight.closed) {
    flight.closed = true;
    detectionFlight = null;
    setUpdateState({ check: result });
  }
  return { ...result };
};
const detectUpdate = (requireWorker: boolean): DetectionFlight => {
  if (detectionFlight && !detectionFlight.closed) {
    detectionFlight.requireWorker ||= requireWorker;
    return detectionFlight;
  }
  const startedAt = Date.now();
  const flight: DetectionFlight = {
    requestId: ++checkSequence, startedAt, deadlineAt: startedAt + CHECK_TIMEOUT_MS,
    controller: new AbortController(), requireWorker, closed: false, promise: Promise.resolve(checkResult('idle')),
  };
  detectionFlight = flight;
  const timer = setTimeout(() => flight.controller.abort(new Error('CHECK_TIMEOUT')), CHECK_TIMEOUT_MS);
  flight.promise = Promise.resolve().then(() => runDetection(flight)).finally(() => {
    clearTimeout(timer);
    if (detectionFlight === flight) detectionFlight = null;
  });
  setUpdateState({ check: { ...checkResult('checking', flight), finishedAt: null } });
  return flight;
};
export const checkPwaUpdate = async (options?: { deadlineAt?: number }): Promise<PwaUpdateCheckState> => {
  if (documentSuspended) return checkResult('cancelled');
  if (isLocalUpdateBusy()) return checkResult('busy');
  const deadlineAt = options?.deadlineAt ?? Date.now() + CHECK_TIMEOUT_MS;
  if (Date.now() >= deadlineAt) return checkResult('error', undefined, 'CHECK_TIMEOUT');
  if (typeof navigator === 'undefined') return checkResult('error', undefined, 'CHECK_UNAVAILABLE');
  const flight = detectUpdate(Boolean(serviceWorkerRegistrationPromise));
  try {
    return { ...await waitUntil(flight.promise, Math.min(deadlineAt, flight.deadlineAt)) };
  } catch {
    return checkResult('error', flight, 'CHECK_TIMEOUT');
  }
};
const checkForAppShellUpdate = async (requireWorker = false) => {
  if (documentSuspended || isLocalUpdateBusy()) return false;
  return (await detectUpdate(requireWorker).promise).phase === 'available';
};
const checkWhenVisible = () => {
  if (!documentSuspended && document.visibilityState === 'visible') void checkForAppShellUpdate();
};
const bindAppShellUpdateChecks = () => {
  if (appShellCheckListenersBound || typeof window === 'undefined' || typeof document === 'undefined') return;
  appShellCheckListenersBound = true;
  window.setTimeout(checkWhenVisible, 3000);
  window.setInterval(checkWhenVisible, APP_SHELL_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', checkWhenVisible);
  window.addEventListener('pagehide', () => {
    documentSuspended = true;
    cancelDetection();
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    documentSuspended = false;
    recordLoadedAppVersion();
    syncReloadSafetyState();
    checkWhenVisible();
  });
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
  if (!capturePwaReloadLocation(targetVersion)) throw new Error('VIEW_INTENT_NOT_DURABLE');
  if (!reservePwaReloadForTarget(targetVersion)) throw new Error('RELOAD_RESERVATION_FAILED');
  if (!reserveAppVersionNavigation(targetVersion)) {
    clearPwaReloadReservation();
    clearPwaReloadLocation();
    throw new Error('VERSION_NAVIGATION_RESERVATION_FAILED');
  }
  normalReloadRequested = true;
  let pagehideReceived = false;
  const onPageHide = () => { pagehideReceived = true; };
  window.addEventListener('pagehide', onPageHide, { once: true });
  window.setTimeout(() => {
    window.removeEventListener('pagehide', onPageHide);
    if (pagehideReceived) return;
    clearPwaReloadReservation();
    clearPwaReloadLocation();
    normalReloadRequested = false;
    setUpdateState({
      status: 'update-available',
      updateAvailable: true,
      normalReloadReserved: false,
      reloadSafetyCode: 'RELOAD_NAVIGATION_NOT_STARTED',
      errorMessage: '重新載入尚未開始，請再試一次。',
    });
  }, 3000);
  window.location.replace(buildLatestReloadUrl(targetVersion));
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

const claimApplyTransaction = async (sourceVersion: string, targetVersion: string, retryFailed = false) => withApplyCriticalSection(async () => {
  const lease = await acquireIndexedDbLock(targetVersion);
  if (!lease) return null;

  const existing = readTransaction();
  if (existing && existing.phase !== 'available' && existing.phase !== 'failed' && existing.leaseExpiresAt > Date.now()) {
    await releaseIndexedDbLock(lease);
    return null;
  }
  if (existing && existing.phase === 'failed' && existing.ownerTabId === getTabId()
    && existing.targetVersion === targetVersion && !retryFailed) {
    await releaseIndexedDbLock(lease);
    return null;
  }

  const base = existing && existing.targetVersion === targetVersion && existing.phase !== 'failed'
    ? existing
    : createAvailableTransaction(sourceVersion, targetVersion);
  if (retryFailed && existing?.phase === 'failed') base.transactionId = createId('tx-retry');
  const claimed = claimPwaUpdateTransaction(base, getTabId(), lease.ownerFence, Date.now());
  if (!writeTransaction(claimed)) {
    await releaseIndexedDbLock(lease);
    throw new Error('Unable to persist PWA update owner transaction.');
  }
  if (retryFailed) clearPwaReloadReservation();
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

class UpdateTargetChanged extends Error {
  constructor(readonly latestVersion: string) {
    super('UPDATE_TARGET_CHANGED');
  }
}

const verifyConfirmedTarget = async (targetVersion: string) => {
  const latestVersion = await fetchLatestAppVersion();
  if (latestVersion !== targetVersion) throw new UpdateTargetChanged(latestVersion);
};

const prepareWaitingWorker = async (targetVersion: string) => {
  const registration = registeredServiceWorker;
  if (!registration) return null;
  await waitUntil(refreshWorker(registration), Date.now() + CHECK_TIMEOUT_MS);
  const waiting = registration.waiting ?? await waitForWaitingWorker(registration);
  if (!waiting) return null;
  const version = await readWorkerVersion(waiting, Date.now() + CHECK_TIMEOUT_MS);
  if (registration.waiting !== waiting) return null;
  // An unrelated waiting worker must never be activated by this confirmation.
  return version === targetVersion ? waiting : null;
};

const applyStandardUpdate = async (transaction: PwaUpdateTransactionV1, lease: ApplyLockRecord, canContinue: () => boolean) => {
  const renewal = startLeaseRenewal(transaction, lease);
  let current = transaction;
  try {
    const waitingWorker = await prepareWaitingWorker(current.targetVersion);
    await verifyConfirmedTarget(current.targetVersion);
    if (!canContinue()) return false;
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
    if (!canContinue()) return false;
    if (waitingWorker && registeredServiceWorker?.waiting === waitingWorker) {
      const activated = waitForWorkerActivated();
      // Message the exact worker that passed target stabilization. Workbox's
      // convenience method can still point at an older waiting worker during
      // a B-waiting→C retarget race.
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      if (!(await activated)) throw new Error('WORKER_ACTIVATION_FAILED');
    }
    await verifyConfirmedTarget(current.targetVersion);
    if (!canContinue()) return false;
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

const runQueuedApply = async (targetVersion: string, retryFailed: boolean, canContinue: () => boolean) => {
  if (!canContinue()) return false;
  const currentVersion = getCurrentAppVersion() || updateState.currentVersion;
  if (!currentVersion || !targetVersion || currentVersion === targetVersion) {
    setUpdateState({ status: 'idle', updateAvailable: false });
    return false;
  }

  await verifyConfirmedTarget(targetVersion);
  if (!canContinue()) return false;
  if (readCompletedVersion() === targetVersion) {
    if (retryFailed) clearPwaReloadReservation();
    reloadAtOwnBoundary(targetVersion);
    return true;
  }

  const ownership = await claimApplyTransaction(currentVersion, targetVersion, retryFailed);
  if (!ownership) {
    setUpdateState({ errorMessage: '另一個分頁正在更新，請稍後再按更新。' });
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
    errorCode: null,
    failureKind: null,
  });
  let applied = false;
  try {
    if (!canContinue()) return false;
    applied = await applyStandardUpdate(transaction, lease, canContinue);
    return applied;
  } catch (error) {
    if (error instanceof UpdateTargetChanged) {
      if (assertApplyOwnership(transaction)) removeTransactionIf(transaction.transactionId);
      throw error;
    }
    const message = error instanceof Error && error.message === 'TARGET_UNSTABLE'
      ? '版本正在切換，請稍後重新檢查。'
      : error instanceof Error ? error.message : '無法套用新版本。';
    console.warn('[PWA] Failed to converge app update:', error);
    const latest = readTransaction();
    if (latest && latest.transactionId === transaction.transactionId) {
      failTransaction(latest, error instanceof Error && error.message === 'TARGET_UNSTABLE' ? 'TARGET_UNSTABLE' : 'APPLY_FAILED', message);
    } else {
      setUpdateState({ status: 'failed', updateAvailable: false, errorMessage: message, errorCode: 'APPLY_FAILED', failureKind: 'update' });
    }
    return false;
  } finally {
    // A departed boundary leaves the target pending for this document's next
    // boundary. Retire only the attempt still owned by this exact fence.
    if (!applied && !canContinue() && assertApplyOwnership(transaction)) {
      removeTransactionIf(transaction.transactionId);
      setUpdateState({
        status: 'update-available', updateAvailable: true,
        pendingLocalTarget: updateState.targetVersion || transaction.targetVersion,
        transactionId: null, ownerFence: 0, normalReloadReserved: false,
      });
    }
    await releaseIndexedDbLock(lease);
  }
};

const installPwaUpdateTestControls = () => {
  if (testControlsInstalled || typeof window === 'undefined') return;
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
  testControlsInstalled = true;

  const resetState = () => {
    updateState = {
      check: { requestId: 0, phase: 'idle', currentVersion: null, latestVersion: null, startedAt: null, finishedAt: null, errorCode: null },
      localUpdateBusy: false,
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
      errorCode: null,
      failureKind: null,
      reloadSafetyState: getPwaReloadSafetySnapshot().state,
      reloadSafetyCode: getPwaReloadSafetySnapshot().code,
      pendingBoundary: null,
      pendingLocalTarget: null,
    };
    try {
      localStorage.removeItem(TRANSACTION_KEY);
      localStorage.removeItem(COMPLETED_VERSION_KEY);
      localStorage.removeItem(DISMISSED_TARGET_KEY);
    } catch {
      // Test reset remains deterministic in memory even when storage is unavailable.
    }
    removeSessionValue(DISMISSED_TARGET_KEY);
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
    simulateRecoverableCacheError: (message = '測試載入錯誤') => setUpdateState({ status: 'recoverable-cache-error', errorMessage: message, errorCode: 'CHUNK_LOAD_FAILED', failureKind: 'load' }),
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
    if (event.key === DISMISSED_TARGET_KEY && updateState.updateAvailable) {
      setUpdateState({ dismissedAt: dismissedTarget() === updateState.targetVersion ? Date.now() : null });
    }
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
  if (target) {
    try { localStorage.setItem(DISMISSED_TARGET_KEY, target); }
    catch { setSessionValue(DISMISSED_TARGET_KEY, target); }
  }
  setUpdateState({ dismissedAt: Date.now() });
};

const getCurrentViewIntent = (): ViewMode | 'quick-task' | null => {
  const view = getPwaReloadSafetySnapshot().currentView;
  if (view) return view;
  if (/^\/quick-task(?:\/|$)/.test(window.location.pathname)) return 'quick-task';
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = localStorage.getItem('projed-last-view');
    return value && ['home', 'list', 'mindmap', 'board', 'goal', 'gantt', 'calendar', 'records', 'calendar_subscriptions', 'settings', 'recycle_bin'].includes(value)
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

const applyConfirmedUpdate = (targetVersion: string, retryFailed = false): Promise<boolean> => {
  if (applyPromise) return applyPromise;
  if (retryPromise && !retryFailed) return retryPromise;
  if (recoveryPromise) return recoveryPromise;
  if (documentSuspended) return Promise.resolve(false);
  if ((updateState.status === 'failed' || updateState.failureKind === 'load' || updateState.failureKind === 'cache-recovery') && !retryFailed) return Promise.resolve(false);
  if (!updateState.updateAvailable && !updateState.targetVersion && !updateState.latestVersion) return Promise.resolve(false);
  const canContinue = () => !documentSuspended
    && getPwaReloadSafetySnapshot().state === 'safe';
  // Install the local effect guard before cancellation can synchronously notify subscribers.
  applyPromise = Promise.resolve().then(async () => {

  // Test-mode transaction controls intentionally bypass the production safety
  // gate; production never exposes this control surface.
  if ((import.meta.env.DEV || import.meta.env.MODE === 'test') && targetVersion === 'test-next' && window.__projedPwaUpdateTest) {
    return runTestModeApply();
  }

  const currentView = getCurrentViewIntent();
  const gate = await requestPwaReloadBoundary('user-confirmed', currentView);
  syncReloadSafetyState();
  if (gate.ok && !canContinue()) return false;
  if (!gate.ok) {
    setUpdateState({
      status: retryFailed ? 'failed' : 'update-available',
      updateAvailable: !retryFailed,
      pendingBoundary: null,
      pendingLocalTarget: updateState.targetVersion || updateState.latestVersion,
      errorMessage: safetyFailureMessage(gate.code),
    });
    return false;
  }

  try {
    return await runQueuedApply(targetVersion, retryFailed, canContinue);
  } catch (error) {
    const currentVersion = getCurrentAppVersion();
    if (error instanceof UpdateTargetChanged && currentVersion) {
      if (currentVersion === error.latestVersion) {
        setUpdateState({ status: 'idle', updateAvailable: false, latestVersion: currentVersion, targetVersion: null, pendingLocalTarget: null, errorMessage: null, errorCode: null, failureKind: null });
      } else {
        showAvailableTarget(currentVersion, error.latestVersion, '可用版本已變更，請再按一次更新。');
      }
    } else {
      setUpdateState({ status: 'failed', updateAvailable: false, errorMessage: '無法取得可用版本，請重試。', errorCode: 'APPLY_FAILED', failureKind: 'update' });
    }
    return false;
  }
  }).finally(() => { applyPromise = null; notifyUpdateListeners(); });
  cancelDetection();
  notifyUpdateListeners();
  return applyPromise;
};

export const applyPwaUpdate = async (confirmedTarget?: string | null) => {
  if (applyPromise) return applyPromise;
  const target = updateState.targetVersion || updateState.latestVersion;
  if (confirmedTarget && confirmedTarget !== target) {
    if (updateState.updateAvailable) setUpdateState({ errorMessage: '可用版本已變更，請再按一次更新。' });
    return false;
  }
  return updateState.updateAvailable && target ? applyConfirmedUpdate(target) : false;
};

// An explicit retry starts a new fenced attempt; background checks never reopen
// a failed activation or silently discard its diagnostic information.
const runPwaUpdateRetry = async () => {
  if (applyPromise) return applyPromise;
  const failureKind = updateState.failureKind;
  const requiresReload = failureKind === 'load' || failureKind === 'cache-recovery';
  try {
    const currentVersion = getCurrentAppVersion();
    if (!currentVersion) throw new Error('無法確認版本，請稍後重試。');
    const confirmedTarget = updateState.targetVersion;
    const latestVersion = requiresReload ? currentVersion : await fetchLatestAppVersion();
    if (confirmedTarget && confirmedTarget !== latestVersion && !requiresReload && latestVersion !== currentVersion) {
      showAvailableTarget(currentVersion, latestVersion, '可用版本已變更，請再按一次更新。');
      return false;
    }
    if (latestVersion === currentVersion && !requiresReload) {
      const transaction = readTransaction();
      if (transaction?.phase === 'failed') removeTransactionIf(transaction.transactionId);
      clearPwaReloadReservation();
      setUpdateState({ status: 'idle', updateAvailable: false, targetVersion: null, transactionId: null, pendingLocalTarget: null, errorMessage: null, errorCode: null, failureKind: null });
      return true;
    }
    if (requiresReload && latestVersion === currentVersion) {
      const gate = await requestPwaReloadBoundary('user-confirmed', getCurrentViewIntent());
      syncReloadSafetyState();
      if (!gate.ok) {
        setUpdateState({ errorMessage: safetyFailureMessage(gate.code) });
        return false;
      }
      clearPwaReloadReservation();
      reloadAtOwnBoundary(latestVersion);
      return true;
    }
    return await applyConfirmedUpdate(latestVersion, true);
  } catch (error) {
    setUpdateState({ status: 'failed', errorMessage: error instanceof Error ? error.message : '無法重試，請稍後再試。', errorCode: 'RETRY_CHECK_FAILED', failureKind: failureKind || 'update' });
    return false;
  }
};

export const retryPwaUpdate = () => {
  if (retryPromise) return retryPromise;
  if (applyPromise) return applyPromise;
  if (recoveryPromise) return recoveryPromise;
  if (documentSuspended) return Promise.resolve(false);
  retryPromise = Promise.resolve().then(runPwaUpdateRetry).finally(() => { retryPromise = null; notifyUpdateListeners(); });
  cancelDetection();
  notifyUpdateListeners();
  return retryPromise;
};

const runCacheRecovery = async () => {
  const gate = await requestPwaReloadBoundary('user-confirmed', getCurrentViewIntent());
  syncReloadSafetyState();
  if (!gate.ok) {
    setUpdateState({ errorMessage: safetyFailureMessage(gate.code) });
    return false;
  }
  setUpdateState({ status: 'recovering', updateAvailable: false, errorMessage: null });

  try {
    const currentVersion = getCurrentAppVersion();
    if (!currentVersion) throw new Error('無法確認目前版本。');
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      const scope = `${window.location.origin}/`;
      const cacheId = currentVersion.replace(/^release:/, '');
      const versionPath = `/app-releases/${currentVersion.replace(':', '-')}/`;
      for (const cacheName of [`projed-${cacheId}-precache-v2-${scope}`, 'projed-version-files']) {
        if (!cacheNames.includes(cacheName)) continue;
        const cache = await window.caches.open(cacheName);
        const versionFiles = (await cache.keys()).filter(request => new URL(request.url).pathname.startsWith(versionPath));
        const deleted = await Promise.all(versionFiles.map(request => cache.delete(request)));
        if (deleted.some(result => !result)) throw new Error('無法清除目前版本的快取。');
      }
    }
    if (documentSuspended || getPwaReloadSafetySnapshot().state !== 'safe') {
      throw new Error('無法確認內容已保存，請再試一次。');
    }
    clearPwaReloadReservation();
    reloadAtOwnBoundary(currentVersion);
  } catch (error) {
    const message = error instanceof Error ? error.message : '清除應用程式快取失敗。';
    console.warn('[PWA] Failed to clear app cache:', error);
    setUpdateState({ status: 'failed', errorMessage: message, errorCode: 'CACHE_RECOVERY_FAILED', failureKind: 'cache-recovery' });
    return false;
  }
  return true;
};

const startLocalRecovery = (work: () => Promise<boolean>) => {
  if (recoveryPromise) return recoveryPromise;
  if (applyPromise) return applyPromise;
  if (retryPromise) return retryPromise;
  if (documentSuspended) return Promise.resolve(false);
  recoveryPromise = Promise.resolve().then(work).finally(() => { recoveryPromise = null; notifyUpdateListeners(); });
  cancelDetection();
  notifyUpdateListeners();
  return recoveryPromise;
};
export const clearPwaApplicationCacheAndReload = () => startLocalRecovery(runCacheRecovery);
export const handleRecoverableAppLoadError = (error: unknown, source: 'error' | 'unhandledrejection' = 'error') => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '新版檔案載入失敗。';
  console.warn(`[PWA] Recoverable app load error from ${source}:`, error);
  setUpdateState({ status: 'recoverable-cache-error', updateAvailable: false, errorMessage: message, errorCode: 'CHUNK_LOAD_FAILED', failureKind: 'load' });
  return true;
};

export const setupPwaLifecycle = () => {
  installPwaUpdateTestControls();
  if (setupDone) return;
  setupDone = true;
  if (typeof window === 'undefined') return;
  if (!safetySubscriptionBound) {
    safetySubscriptionBound = true;
    let lastView = getPwaReloadSafetySnapshot().currentView;
    subscribePwaReloadSafety((nextState) => {
      const viewChanged = lastView !== nextState.currentView;
      lastView = nextState.currentView;
      setUpdateState({
        reloadSafetyState: nextState.state,
        reloadSafetyCode: nextState.code,
        pendingBoundary: nextState.pendingBoundary,
      });
      if (viewChanged && import.meta.env.PROD) checkWhenVisible();
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
    if (normalReloadRequested || documentSuspended) return;
    void checkForAppShellUpdate();
  });
  workbox.addEventListener('activated', (event) => {
    // Activation is deliberately not a navigation signal. With clientsClaim
    // disabled, each document decides its own later reload boundary.
    if (event.isUpdate && !normalReloadRequested && !documentSuspended) void checkForAppShellUpdate();
  });
  workbox.addEventListener('redundant', () => {
    // A redundant event can describe a duplicate worker installed by another
    // tab, not failure of the shared registration. The bounded activation
    // waiter owns the actual failure decision.
    if (!normalReloadRequested && updateState.updateAvailable) void checkForAppShellUpdate();
  });

  serviceWorkerRegistrationPromise = workbox.register({ immediate: true }).then((registration) => {
    if (!registration) throw new Error('Service worker registration returned no registration.');
    registeredServiceWorker = registration;
    const checkForUpdate = () => { void checkForAppShellUpdate(true); };
    window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    checkForUpdate();
    return registration;
  });
  void serviceWorkerRegistrationPromise.catch((error) => {
    console.warn('[PWA] Service worker registration failed:', error);
    // Registration is optional for the already loaded app. Keep genuine
    // transaction/load failures, but do not turn a background check into one.
  });
};
