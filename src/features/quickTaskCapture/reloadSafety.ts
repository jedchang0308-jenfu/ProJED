import type { PwaReloadSafetyReason, PwaReloadSafetyOwnerSnapshot } from '../../services/pwaReloadSafety';

type QuickReloadState = {
  draft: boolean;
  composing: boolean;
  voice: boolean;
  localCommit: boolean;
  claim: boolean;
};

export const installQuickReloadSafety = async (getState: () => QuickReloadState) => {
  const safety = await import('../../services/pwaReloadSafety');
  let revision = 0;
  let previousSignature = '';
  const readSnapshot = (): PwaReloadSafetyOwnerSnapshot => {
    const state = getState();
    const reasons: PwaReloadSafetyReason[] = [
      ...(state.draft || state.composing ? ['FORM_DRAFT_UNSAVED' as const] : []),
      ...(state.voice || state.claim ? ['CLIENT_JOB_IN_FLIGHT' as const] : []),
      ...(state.localCommit ? ['PENDING_WRITE' as const] : []),
    ];
    const signature = reasons.join('|');
    if (signature !== previousSignature) {
      previousSignature = signature;
      revision += 1;
    }
    return { ownerId: 'quick-task-capture', state: reasons.length ? 'dirty' : 'safe', reasonCodes: reasons, revision };
  };
  const unregister = safety.registerPwaReloadSafetyOwner({
    ownerId: 'quick-task-capture',
    getSnapshot: readSnapshot,
    prepareForReload: async () => {
      const snapshot = readSnapshot();
      return snapshot.state === 'safe'
        ? { ok: true as const, revision: snapshot.revision }
        : { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const };
    },
  });
  safety.setPwaReloadSafetyCurrentView('quick-task');
  const epoch = `quick-task:${Date.now()}`;
  safety.setPwaReloadReadiness('version-shell', epoch, true);
  safety.setPwaReloadReadiness('auth-shell', epoch, true);
  safety.setPwaReloadReadiness('active-view', epoch, true);
  const refresh = () => safety.refreshPwaReloadSafety('quick-task');
  window.addEventListener('input', refresh, true);
  window.addEventListener('compositionstart', refresh, true);
  window.addEventListener('compositionend', refresh, true);
  refresh();
  return () => {
    window.removeEventListener('input', refresh, true);
    window.removeEventListener('compositionstart', refresh, true);
    window.removeEventListener('compositionend', refresh, true);
    unregister();
    safety.setPwaReloadReadiness('active-view', epoch, false);
  };
};
