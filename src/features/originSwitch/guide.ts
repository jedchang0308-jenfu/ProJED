export type GuideEntry = 'main' | 'quick';
export type GuideStage = 'intro' | 'drafts' | 'account' | 'entry' | 'complete';
export interface GuideScope {
  campaign: string;
  sourceOrigin: string;
  targetOrigin: string;
  accountId: string;
  entry: GuideEntry;
}
export interface DraftInspection {
  complete: boolean;
  online: boolean;
  editing: boolean;
  pending: number;
  unknown: number;
  conflicts: number;
  unbound: number;
}
/** The future production adapter must obtain this from a verified server
 * receipt. URL parameters, postMessage payloads and checkboxes are not proofs. */
export interface DestinationInspection {
  sourceOrigin: string;
  targetOrigin: string;
  accountId: string;
  entry: GuideEntry;
  workspaceMatched: boolean;
  permissionsMatched: boolean;
  expiresAt: number;
}
export interface GuidePorts {
  inspectDrafts(): Promise<DraftInspection>;
  inspectDestination(): Promise<DestinationInspection | null>;
  openDestination(url: string): Promise<void>;
  requestInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'>;
}
export interface GuideStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type GuideIssue = 'drafts' | 'unknown' | 'conflict' | 'unbound' | 'editing'
  | 'offline' | 'unavailable' | 'login' | 'account' | 'access' | 'expired' | 'storage' | null;
export interface GuideState {
  stage: GuideStage;
  busy: boolean;
  issue: GuideIssue;
  drafts: DraftInspection | null;
  deferred: boolean;
  verification: number;
  install: 'idle' | 'accepted' | 'dismissed' | 'unavailable';
}

export function validateScope(scope: GuideScope, approvedTargets: readonly string[]): GuideScope {
  for (const origin of [scope.sourceOrigin, scope.targetOrigin]) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) {
      throw new Error('ORIGIN_SWITCH_ORIGIN_INVALID');
    }
  }
  if (!approvedTargets.includes(scope.targetOrigin) || scope.sourceOrigin === scope.targetOrigin
    || !scope.accountId || !scope.campaign || !['main', 'quick'].includes(scope.entry)) {
    throw new Error('ORIGIN_SWITCH_SCOPE_INVALID');
  }
  return Object.freeze({ ...scope });
}

export const guideStorageKey = (scope: GuideScope) => `projed.origin-guide.v1:${JSON.stringify([
  scope.campaign, scope.sourceOrigin, scope.targetOrigin, scope.entry, scope.accountId,
])}`;

export function draftIssue(value: DraftInspection): GuideIssue {
  if (!value.complete || ![value.pending, value.unknown, value.conflicts, value.unbound]
    .every(count => Number.isSafeInteger(count) && count >= 0)) return 'unavailable';
  if (value.editing) return 'editing';
  if (value.conflicts) return 'conflict';
  if (value.unknown) return 'unknown';
  if (value.unbound) return 'unbound';
  if (value.pending) return 'drafts';
  if (!value.online) return 'offline';
  return null;
}

export function destinationIssue(scope: GuideScope, value: DestinationInspection | null, now: number): GuideIssue {
  if (!value) return 'login';
  if (value.accountId !== scope.accountId) return 'account';
  if (value.sourceOrigin !== scope.sourceOrigin || value.targetOrigin !== scope.targetOrigin
    || value.entry !== scope.entry || !value.workspaceMatched || !value.permissionsMatched) return 'access';
  if (!Number.isFinite(value.expiresAt) || value.expiresAt <= now) return 'expired';
  return null;
}

/** No business writes, source cleanup, token transfer or automatic navigation.
 * Every resumed completion rechecks its adapter evidence. Disposing a scope
 * fences late responses after account/entry changes. */
export class OriginSwitchGuide {
  readonly scope: GuideScope;
  readonly key: string;
  private state: GuideState = { stage: 'intro', busy: false, issue: null, drafts: null, deferred: false, verification: 0, install: 'idle' };
  private listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  private entryConfirmed = false;
  private resumeStage: GuideStage = 'intro';

  constructor(scope: GuideScope, approvedTargets: readonly string[], private ports: GuidePorts,
    private storage: GuideStorage, private now: () => number = Date.now) {
    this.scope = validateScope(scope, approvedTargets);
    this.key = guideStorageKey(this.scope);
    try {
      const saved: unknown = JSON.parse(storage.getItem(this.key) ?? 'null');
      if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 1
        && 'stage' in saved && ['intro', 'drafts', 'account', 'entry', 'complete'].includes(String(saved.stage))) {
        this.resumeStage = saved.stage as GuideStage;
        this.entryConfirmed = 'entryConfirmed' in saved && saved.entryConfirmed === true;
        this.state = { ...this.state, deferred: this.resumeStage !== 'intro' };
      }
    } catch { this.state = { ...this.state, issue: 'storage' }; }
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  dispose() { this.disposed = true; this.generation++; this.listeners.clear(); }

  private set(patch: Partial<GuideState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    try {
      this.storage.setItem(this.key, JSON.stringify({ version: 1, stage: this.state.stage,
        entryConfirmed: this.entryConfirmed }));
    } catch { this.state = { ...this.state, stage: 'drafts', issue: 'storage', busy: false }; }
    this.listeners.forEach(listener => listener());
  }
  private current(id: number) { return !this.disposed && this.generation === id; }
  private async inspectDrafts(id: number): Promise<boolean> {
    try {
      const drafts = await this.ports.inspectDrafts();
      if (!this.current(id)) return false;
      const issue = draftIssue(drafts);
      this.set({ drafts, issue, ...(issue ? { stage: 'drafts' as const } : {}) });
      return !issue && this.state.issue !== 'storage';
    } catch {
      if (this.current(id)) this.set({ stage: 'drafts', issue: 'unavailable' });
      return false;
    }
  }
  private async inspectAccount(id: number): Promise<boolean> {
    try {
      const value = await this.ports.inspectDestination();
      if (!this.current(id)) return false;
      const issue = destinationIssue(this.scope, value, this.now());
      this.set({ stage: issue ? 'account' : 'entry', issue,
        ...(!issue ? { verification: this.state.verification + 1 } : {}) });
      return !issue && this.state.issue !== 'storage';
    } catch {
      if (this.current(id)) this.set({ stage: 'account', issue: 'unavailable' });
      return false;
    }
  }
  async start() {
    if (this.disposed || this.state.busy) return;
    const id = ++this.generation;
    this.set({ stage: 'drafts', deferred: false, busy: true, issue: null });
    if (await this.inspectDrafts(id)) {
      this.set({ stage: 'account' });
      if (['account', 'entry', 'complete'].includes(this.resumeStage) && await this.inspectAccount(id)
        && this.entryConfirmed) this.set({ stage: 'complete' });
    }
    if (this.current(id)) this.set({ busy: false });
  }
  defer() {
    if (this.disposed) return;
    this.resumeStage = this.state.stage;
    this.generation++;
    this.set({ stage: 'intro', deferred: true, busy: false });
    // Keep the resume position, not the dismissed prompt's position.
    try { this.storage.setItem(this.key, JSON.stringify({ version: 1, stage: this.resumeStage,
      entryConfirmed: this.entryConfirmed })); } catch { this.set({ issue: 'storage' }); }
  }
  async openDestination() {
    if (this.disposed || this.state.busy || !['account', 'entry'].includes(this.state.stage)) return;
    const id = ++this.generation;
    this.set({ busy: true, issue: null });
    if (await this.inspectDrafts(id)) {
      try {
        // The URL is built only from pinned config; no query/hash carries private data.
        const url = new URL(this.scope.entry === 'quick' ? '/quick-task/' : '/', this.scope.targetOrigin);
        await this.ports.openDestination(url.href);
      } catch { if (this.current(id)) this.set({ issue: 'unavailable' }); }
    }
    if (this.current(id)) this.set({ busy: false });
  }
  async verifyAccount() {
    if (this.disposed || this.state.busy || !['account', 'entry'].includes(this.state.stage)) return;
    const id = ++this.generation;
    this.set({ busy: true, issue: null });
    if (await this.inspectDrafts(id)) await this.inspectAccount(id);
    if (this.current(id)) this.set({ busy: false });
  }
  async install() {
    if (this.disposed || this.state.busy || this.state.stage !== 'entry') return;
    const id = ++this.generation;
    this.set({ busy: true });
    if (await this.inspectDrafts(id) && await this.inspectAccount(id)) {
      try {
        const install = await this.ports.requestInstall();
        if (this.current(id)) this.set({ install });
      } catch { if (this.current(id)) this.set({ install: 'unavailable' }); }
    }
    if (this.current(id)) this.set({ busy: false });
  }
  async confirmEntry(openedAndChecked: boolean) {
    if (this.disposed || this.state.busy || this.state.stage !== 'entry' || !openedAndChecked) return;
    const id = ++this.generation;
    this.set({ busy: true });
    if (await this.inspectDrafts(id) && await this.inspectAccount(id)) {
      this.entryConfirmed = true;
      this.set({ stage: 'complete' });
    }
    if (this.current(id)) this.set({ busy: false });
  }
}
