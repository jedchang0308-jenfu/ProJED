import type { ViewMode } from '../types';
import {
  getPwaReloadSafetyOwnerManifest,
  type PwaReloadSafetyOwnerId,
} from './pwaReloadOwnerManifest';

export type PwaReloadSafetyState = 'booting' | 'safe' | 'dirty' | 'preparing' | 'blocked';
export type PwaReloadBoundary = 'app-open' | 'foreground' | 'view-transition' | 'user-confirmed';
export type PwaReloadReadinessScope = 'version-shell' | 'auth-shell' | 'active-view';

export type PwaReloadSafetyReason =
  | 'RECORD_DRAFT_UNSAVED'
  | 'RECORD_SAVE_IN_FLIGHT'
  | 'CLIENT_JOB_IN_FLIGHT'
  | 'FORM_DRAFT_UNSAVED'
  | 'PENDING_WRITE'
  | 'BACKUP_RESTORE_IN_FLIGHT'
  | 'TRANSIENT_DRAG_ACTIVE'
  | 'DIRTY_MODAL'
  | 'OWNER_SIGNAL_UNKNOWN';

export type PwaReloadSafetyFailureCode =
  | 'SAFETY_NOT_READY'
  | 'OWNER_SIGNAL_FAULT'
  | 'OWNER_ACTION_REQUIRED'
  | 'OWNER_PREPARE_FAILED'
  | 'OWNER_PREPARE_TIMEOUT'
  | 'LOCAL_READBACK_DIRTY'
  | 'OWNER_MANIFEST_INCOMPLETE'
  | 'VIEW_INTENT_NOT_DURABLE'
  | 'RELOAD_RESERVATION_FAILED'
  | 'RELOAD_NAVIGATION_NOT_STARTED'
  | 'WORKER_ACTIVATION_FAILED'
  | 'OLD_RELEASE_ISOLATION_FAILED';

export interface PwaReloadSafetyOwnerSnapshot {
  ownerId: PwaReloadSafetyOwnerId;
  state: 'safe' | 'dirty';
  reasonCodes: PwaReloadSafetyReason[];
  revision: number;
}

export interface PwaReloadSafetyOwner {
  ownerId: PwaReloadSafetyOwnerId;
  getSnapshot(): PwaReloadSafetyOwnerSnapshot;
  prepareForReload(): Promise<
    | { ok: true; revision: number }
    | { ok: false; code: PwaReloadSafetyFailureCode }
  >;
}

export type PwaReloadGateResult =
  | { ok: true; code: null; localState: 'safe' }
  | { ok: false; code: PwaReloadSafetyFailureCode; localState: PwaReloadSafetyState };

export type PwaReloadSafetySnapshot = {
  state: PwaReloadSafetyState;
  code: PwaReloadSafetyFailureCode | null;
  pendingBoundary: PwaReloadBoundary | null;
  currentView: ViewMode | null;
  ready: Record<PwaReloadReadinessScope, boolean>;
  owners: PwaReloadSafetyOwnerSnapshot[];
};

export const PWA_RELOAD_PREPARE_TIMEOUT_MS = 15_000;
export const PWA_RELOAD_RESERVATION_KEY = 'projed.pwa-reload.reserved-target.v1';

type Listener = (snapshot: PwaReloadSafetySnapshot) => void;
type ReadinessRecord = { epoch: string; ready: boolean };
type Reservation = { targetVersion: string; startedAt: number };

const owners = new Map<PwaReloadSafetyOwnerId, PwaReloadSafetyOwner>();
const ownerRevisions = new Map<PwaReloadSafetyOwnerId, number>();
const listeners = new Set<Listener>();
const readiness: Record<PwaReloadReadinessScope, ReadinessRecord> = {
  'version-shell': { epoch: '', ready: false },
  'auth-shell': { epoch: '', ready: false },
  'active-view': { epoch: '', ready: false },
};

const validReasons = new Set<PwaReloadSafetyReason>([
  'RECORD_DRAFT_UNSAVED',
  'RECORD_SAVE_IN_FLIGHT',
  'CLIENT_JOB_IN_FLIGHT',
  'FORM_DRAFT_UNSAVED',
  'PENDING_WRITE',
  'BACKUP_RESTORE_IN_FLIGHT',
  'TRANSIENT_DRAG_ACTIVE',
  'DIRTY_MODAL',
  'OWNER_SIGNAL_UNKNOWN',
]);

let currentState: PwaReloadSafetyState = 'booting';
let currentCode: PwaReloadSafetyFailureCode | null = null;
let pendingBoundary: PwaReloadBoundary | null = null;
let currentView: ViewMode | null = null;

const cloneSnapshot = (): PwaReloadSafetySnapshot => ({
  state: currentState,
  code: currentCode,
  pendingBoundary,
  currentView,
  ready: {
    'version-shell': readiness['version-shell'].ready,
    'auth-shell': readiness['auth-shell'].ready,
    'active-view': readiness['active-view'].ready,
  },
  owners: Array.from(owners.values()).flatMap(owner => {
    try {
      return [owner.getSnapshot()];
    } catch {
      return [];
    }
  }),
});

const notify = () => {
  const snapshot = cloneSnapshot();
  listeners.forEach(listener => listener(snapshot));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PwaReloadSafetySnapshot>('projed:pwa-reload-safety', { detail: snapshot }));
  }
};

const setState = (state: PwaReloadSafetyState, code: PwaReloadSafetyFailureCode | null = null) => {
  currentState = state;
  currentCode = code;
  notify();
};

const setBlocked = (code: PwaReloadSafetyFailureCode) => {
  setState('blocked', code);
};

const isValidSnapshot = (snapshot: PwaReloadSafetyOwnerSnapshot, ownerId: PwaReloadSafetyOwnerId) => (
  snapshot
  && snapshot.ownerId === ownerId
  && (snapshot.state === 'safe' || snapshot.state === 'dirty')
  && Number.isInteger(snapshot.revision)
  && snapshot.revision >= 0
  && Array.isArray(snapshot.reasonCodes)
  && snapshot.reasonCodes.every(reason => validReasons.has(reason))
);

const readOwnerSnapshots = () => {
  const snapshots: PwaReloadSafetyOwnerSnapshot[] = [];
  for (const [ownerId, owner] of owners) {
    let snapshot: PwaReloadSafetyOwnerSnapshot;
    try {
      snapshot = owner.getSnapshot();
    } catch {
      return { ok: false as const, code: 'OWNER_SIGNAL_FAULT' as const, snapshots: [] };
    }
    if (!isValidSnapshot(snapshot, ownerId)) {
      return { ok: false as const, code: 'OWNER_SIGNAL_FAULT' as const, snapshots: [] };
    }
    const lastRevision = ownerRevisions.get(ownerId);
    if (lastRevision !== undefined && snapshot.revision < lastRevision) {
      return { ok: false as const, code: 'OWNER_SIGNAL_FAULT' as const, snapshots: [] };
    }
    ownerRevisions.set(ownerId, snapshot.revision);
    snapshots.push(snapshot);
  }
  return { ok: true as const, snapshots };
};

const readinessIsComplete = () => Object.values(readiness).every(item => item.ready && item.epoch.length > 0);

const manifestIsComplete = (view: ViewMode | null) => {
  const required = getPwaReloadSafetyOwnerManifest(view);
  return required.every(entry => owners.has(entry.ownerId));
};

const validateViewIntent = (view: ViewMode | null) => {
  if (!view || typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem('projed-last-view') === view;
  } catch {
    return false;
  }
};

const evaluateLocalSafety = (view: ViewMode | null) => {
  if (!readinessIsComplete()) return { ok: false as const, code: 'SAFETY_NOT_READY' as const, localState: 'booting' as const };
  if (!manifestIsComplete(view)) return { ok: false as const, code: 'OWNER_MANIFEST_INCOMPLETE' as const, localState: 'blocked' as const };
  const ownerRead = readOwnerSnapshots();
  if (!ownerRead.ok) return { ok: false as const, code: ownerRead.code, localState: 'blocked' as const };
  const dirty = ownerRead.snapshots.some(snapshot => snapshot.state === 'dirty');
  return dirty
    ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const, localState: 'dirty' as const }
    : { ok: true as const, code: null, localState: 'safe' as const };
};

const asGateResult = (result: ReturnType<typeof evaluateLocalSafety>): PwaReloadGateResult => result;

export const getPwaReloadSafetySnapshot = () => cloneSnapshot();

export const subscribePwaReloadSafety = (listener: Listener) => {
  listeners.add(listener);
  listener(cloneSnapshot());
  return () => listeners.delete(listener);
};

export const setPwaReloadSafetyCurrentView = (view: ViewMode | null) => {
  currentView = view;
  notify();
};

/** Re-evaluate local owners after a component or transient UI signal changes. */
export const refreshPwaReloadSafety = (view: ViewMode | null = currentView) => {
  currentView = view;
  const local = evaluateLocalSafety(view);
  if (local.ok) setState('safe', null);
  else if (local.localState === 'dirty') setState('dirty', local.code);
  else setBlocked(local.code);
  return asGateResult(local);
};

export const registerPwaReloadSafetyOwner = (owner: PwaReloadSafetyOwner) => {
  if (owners.has(owner.ownerId)) {
    setBlocked('OWNER_SIGNAL_FAULT');
    throw new Error(`Duplicate PWA reload-safety owner: ${owner.ownerId}`);
  }
  owners.set(owner.ownerId, owner);
  ownerRevisions.delete(owner.ownerId);
  notify();
  return () => {
    if (owners.get(owner.ownerId) !== owner) return;
    owners.delete(owner.ownerId);
    ownerRevisions.delete(owner.ownerId);
    notify();
  };
};

export const setPwaReloadReadiness = (
  scope: PwaReloadReadinessScope,
  epoch: string,
  ready: boolean,
) => {
  if (!epoch || typeof epoch !== 'string') {
    setBlocked('SAFETY_NOT_READY');
    return;
  }
  readiness[scope] = { epoch, ready };
  if (!ready) setState('booting', null);
  // Readiness producers mount independently from the business owners.  The
  // last producer to become ready is therefore the only reliable point at
  // which a previously fail-closed SAFETY_NOT_READY state can converge.  A
  // notification alone leaves currentState stale until some unrelated owner
  // changes or a boundary is requested.
  else refreshPwaReloadSafety(currentView);
};

export const preparePwaReloadOwners = async (): Promise<PwaReloadGateResult> => {
  const initial = evaluateLocalSafety(currentView);
  if (initial.ok) {
    setState('safe', null);
    return asGateResult(initial);
  }
  if (initial.localState === 'booting' || initial.code === 'OWNER_MANIFEST_INCOMPLETE' || initial.code === 'OWNER_SIGNAL_FAULT') {
    setBlocked(initial.code);
    return asGateResult(initial);
  }

  setState('preparing', null);
  let prepareTimeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ ok: false; code: PwaReloadSafetyFailureCode }>(resolve => {
    prepareTimeoutId = setTimeout(() => resolve({ ok: false, code: 'OWNER_PREPARE_TIMEOUT' }), PWA_RELOAD_PREPARE_TIMEOUT_MS);
  });
  const prepare = Promise.all(Array.from(owners.values()).map(async owner => {
    try {
      return await owner.prepareForReload();
    } catch {
      return { ok: false as const, code: 'OWNER_PREPARE_FAILED' as const };
    }
  })).then(results => {
    const failure = results.find(result => !result.ok);
    return failure ?? { ok: true as const };
  });
  const result = await Promise.race([prepare, deadline]);
  if (prepareTimeoutId !== undefined) clearTimeout(prepareTimeoutId);
  if (!result.ok) {
    setBlocked(result.code);
    return { ok: false, code: result.code, localState: 'blocked' };
  }

  const readback = evaluateLocalSafety(currentView);
  if (!readback.ok) {
    const code = readback.localState === 'dirty' ? 'LOCAL_READBACK_DIRTY' : readback.code;
    setBlocked(code);
    return { ok: false, code, localState: readback.localState };
  }
  setState('safe', null);
  return asGateResult(readback);
};

export const requestPwaReloadBoundary = async (
  boundary: PwaReloadBoundary,
  view: ViewMode | null,
): Promise<PwaReloadGateResult> => {
  currentView = view;
  pendingBoundary = boundary;
  const local = evaluateLocalSafety(view);
  if (!local.ok && boundary === 'user-confirmed' && local.localState === 'dirty') {
    const prepared = await preparePwaReloadOwners();
    if (!prepared.ok) pendingBoundary = null;
    if (prepared.ok) {
      pendingBoundary = null;
      notify();
    }
    return prepared;
  }
  if (!local.ok) {
    if (local.localState === 'dirty') setState('dirty', local.code);
    else setBlocked(local.code);
    pendingBoundary = null;
    return asGateResult(local);
  }
  if ((boundary === 'view-transition' || boundary === 'user-confirmed') && !validateViewIntent(view)) {
    setBlocked('VIEW_INTENT_NOT_DURABLE');
    pendingBoundary = null;
    return { ok: false, code: 'VIEW_INTENT_NOT_DURABLE', localState: 'blocked' };
  }
  pendingBoundary = null;
  setState('safe', null);
  return { ok: true, code: null, localState: 'safe' };
};

export const reservePwaReloadForTarget = (targetVersion: string) => {
  if (!targetVersion || typeof sessionStorage === 'undefined') return false;
  const reservation: Reservation = { targetVersion, startedAt: Date.now() };
  try {
    const existingRaw = sessionStorage.getItem(PWA_RELOAD_RESERVATION_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) as Partial<Reservation> : null;
    if (existing?.targetVersion === targetVersion) return false;
    sessionStorage.setItem(PWA_RELOAD_RESERVATION_KEY, JSON.stringify(reservation));
    const readback = JSON.parse(sessionStorage.getItem(PWA_RELOAD_RESERVATION_KEY) || 'null') as Partial<Reservation> | null;
    if (readback?.targetVersion !== targetVersion || typeof readback.startedAt !== 'number') return false;
    return true;
  } catch {
    return false;
  }
};

export const clearPwaReloadReservation = () => {
  try {
    sessionStorage.removeItem(PWA_RELOAD_RESERVATION_KEY);
  } catch {
    // A failed cleanup is handled by the next document's mismatch recovery.
  }
};

export const getPwaReloadReservation = (): Reservation | null => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PWA_RELOAD_RESERVATION_KEY) || 'null') as Partial<Reservation> | null;
    return parsed?.targetVersion && typeof parsed.startedAt === 'number'
      ? { targetVersion: parsed.targetVersion, startedAt: parsed.startedAt }
      : null;
  } catch {
    return null;
  }
};

declare global {
  interface Window {
    __projedPwaReloadSafetyTest?: {
      getSnapshot: () => PwaReloadSafetySnapshot;
      setReadiness: typeof setPwaReloadReadiness;
      setCurrentView: typeof setPwaReloadSafetyCurrentView;
      requestBoundary: typeof requestPwaReloadBoundary;
      reserve: typeof reservePwaReloadForTarget;
      clear: () => void;
    };
  }
}

export const installPwaReloadSafetyTestControls = () => {
  if (typeof window === 'undefined' || (!import.meta.env.DEV && import.meta.env.MODE !== 'test')) return;
  window.__projedPwaReloadSafetyTest = {
    getSnapshot: getPwaReloadSafetySnapshot,
    setReadiness: setPwaReloadReadiness,
    setCurrentView: setPwaReloadSafetyCurrentView,
    requestBoundary: requestPwaReloadBoundary,
    reserve: reservePwaReloadForTarget,
    clear: () => {
      owners.clear();
      ownerRevisions.clear();
      (Object.keys(readiness) as PwaReloadReadinessScope[]).forEach(scope => { readiness[scope] = { epoch: '', ready: false }; });
      currentState = 'booting';
      currentCode = null;
      pendingBoundary = null;
      notify();
    },
  };
};
