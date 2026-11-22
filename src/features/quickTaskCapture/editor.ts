import {
  getQuickAuthContext, listQuickCaptureDrafts, saveQuickCaptureDraft,
} from './outbox';
import {
  createQuickCaptureId, QUICK_LOCAL_DRAFT, type QuickCaptureRecord,
} from './model';
import { isHttpBackend } from '../../services/backendMode';

type DraftStatus = 'saving' | 'local' | 'restored' | 'conflict' | 'failed' | 'empty';
type Editor = {
  accountId: string | null;
  record: QuickCaptureRecord | null;
  value: string;
  savedValue: string;
  writing: Promise<void> | null;
  error: unknown;
  attempt: QuickCaptureRecord | null;
};

// This is a local namespace, never a credential or authority to send a request.
const projectRef = () => {
  if (isHttpBackend) return `http:${window.location.origin}`;
  try { return new URL(import.meta.env.VITE_SUPABASE_URL ?? '').hostname.split('.')[0] || 'unknown'; }
  catch { return 'unknown'; }
};

/** Keeps the editable form in the existing captures DB. The existing outbox
 * sees only explicitly submitted, immutable captures, never keystrokes. */
export const installQuickDraftEditor = (
  input: HTMLInputElement,
  onStatus: (status: DraftStatus) => void,
) => {
  const namespace = projectRef();
  const fresh = (accountId: string | null, value = ''): Editor => ({
    accountId, record: null, value, savedValue: '', writing: null, error: null, attempt: null,
  });
  let active = fresh(null, input.value);
  let scopeRevision = 0;
  let initializing = true;
  let verifiedAccount: string | null = null;
  const render = (editor: Editor, status: DraftStatus) => {
    if (editor === active) onStatus(status);
  };
  const dirty = () => Boolean(active.value && (active.error || active.value !== active.savedValue || active.writing));
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!dirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  const updateUnloadGuard = () => {
    window.removeEventListener('beforeunload', beforeUnload);
    if (dirty()) window.addEventListener('beforeunload', beforeUnload);
  };
  const write = (editor: Editor): Promise<void> => {
    if (editor.writing) return editor.writing;
    editor.writing = (async () => {
      while (editor.value !== editor.savedValue) {
        const prior = editor.record;
        const record: QuickCaptureRecord = editor.attempt ?? {
          schemaVersion: 1, captureId: prior?.captureId ?? createQuickCaptureId(),
          accountId: editor.accountId, title: editor.value, workspaceHint: null,
          clientCreatedAt: prior?.clientCreatedAt ?? Date.now(), updatedAt: Date.now(),
          state: 'failed_permanent', lastErrorCode: QUICK_LOCAL_DRAFT,
          attemptCount: 0, nextAttemptAt: null, leaseId: null, leaseExpiresAt: null, claimIntent: null,
          localDraft: { revision: (prior?.localDraft?.revision ?? 0) + 1, projectRef: namespace },
        };
        editor.attempt = record;
        render(editor, 'saving');
        try {
          editor.record = await saveQuickCaptureDraft(record, prior?.localDraft?.revision ?? 0);
          editor.savedValue = record.title;
          editor.attempt = null;
          editor.error = null;
          render(editor, record.title ? 'local' : 'empty');
        } catch (error) {
          editor.error = error;
          render(editor, error instanceof Error && error.message === 'LOCAL_DRAFT_CONFLICT' ? 'conflict' : 'failed');
          break;
        }
      }
    })().finally(() => { editor.writing = null; updateUnloadGuard(); });
    updateUnloadGuard();
    return editor.writing;
  };
  const refresh = async (confirmedAccount?: string | null) => {
    if (confirmedAccount !== undefined) verifiedAccount = confirmedAccount;
    const observedRevision = scopeRevision;
    const observed = active;
    const context = await getQuickAuthContext();
    if (observedRevision !== scopeRevision || active !== observed) return;
    const accountId = context?.projectRef === namespace && context.bindingAllowed && !context.barrierAt
      && context.verifiedAt && Number.isSafeInteger(context.revision)
      && (!isHttpBackend || !navigator.onLine || context.accountId === verifiedAccount) ? context.accountId : null;
    // Text entered before any local binding was available stays unbound. A new
    // login must not silently claim it for whichever account happens to arrive.
    if (observed.accountId === null && observed.value) { initializing = false; return; }
    if (!initializing && observed.accountId === accountId) return;
    // A same-owner Session refresh must not cancel an in-flight local restore.
    const revision = ++scopeRevision;
    initializing = false;
    void write(observed);
    const next = fresh(accountId);
    active = next;
    input.value = '';
    onStatus('empty');
    const records = await listQuickCaptureDrafts(accountId, namespace);
    const latest = await getQuickAuthContext();
    if (revision !== scopeRevision || active !== next || next.value
      || context?.revision !== latest?.revision || context?.projectRef !== latest?.projectRef) return;
    const recovered = records[0];
    if (!recovered?.title) return;
    next.record = recovered;
    next.value = recovered.title;
    next.savedValue = recovered.title;
    input.value = recovered.title;
    onStatus('restored');
  };
  // No SDK, Session request, workspace list or model call on this path.
  const ready = refresh().catch(() => { initializing = false; onStatus('failed'); });
  const checkpoint = () => {
    if (active.value === input.value && (active.error || active.value === active.savedValue)) return;
    active.value = input.value;
    if (active.error instanceof Error && active.error.message === 'LOCAL_DRAFT_CONFLICT') {
      onStatus('conflict');
      updateUnloadGuard();
      return;
    }
    active.error = null;
    if (initializing) void ready.then(() => write(active));
    else void write(active);
  };
  input.addEventListener('input', checkpoint);
  input.addEventListener('change', checkpoint);
  window.addEventListener('pagehide', checkpoint);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') checkpoint();
  });
  return {
    refresh,
    checkpoint,
    async retry() {
      const editor = active;
      await editor.writing;
      if (editor !== active) return;
      if (editor.error instanceof Error && editor.error.message === 'LOCAL_DRAFT_CONFLICT') {
        // Explicitly requested local copy; leave the other tab's revision intact.
        editor.record = null;
        editor.attempt = null;
        editor.savedValue = '';
      }
      editor.error = null;
      await write(editor);
    },
    async flush() {
      await ready;
      const editor = active;
      editor.value = input.value;
      await write(editor);
      if (active !== editor) throw new Error('LOCAL_DRAFT_ACCOUNT_CHANGED');
      if (editor.error) throw editor.error;
      return editor.record;
    },
    submitted(captureId: string) {
      if (active.record?.captureId !== captureId) return;
      active = fresh(active.accountId);
      input.value = '';
      onStatus('empty');
      updateUnloadGuard();
    },
    /** Synchronous privacy fence, before asynchronous sign-out or account read. */
    hide() {
      verifiedAccount = null;
      scopeRevision += 1;
      void write(active);
      active = fresh(null);
      input.value = '';
      onStatus('empty');
      updateUnloadGuard();
    },
  };
};
