import React, { useEffect, useMemo, useState } from 'react';
import useDialogStore from '../store/useDialogStore';
import useRecordStore from '../store/useRecordStore';
import useRagStore from '../store/useRagStore';
import { useWbsStore } from '../store/useWbsStore';
import { refreshPwaReloadSafety, setPwaReloadReadiness, setPwaReloadSafetyCurrentView, installPwaReloadSafetyTestControls } from '../services/pwaReloadSafety';
import { usePwaReloadSafetyOwner } from '../hooks/usePwaReloadSafetyOwner';
import type { PwaReloadSafetyReason, PwaReloadSafetyOwnerSnapshot } from '../services/pwaReloadSafety';
import type { ViewMode } from '../types';
import { getRecordDraftSignature } from '../utils/meetingRecordWorkflow';

type PwaReloadSafetyBridgeProps = { children: React.ReactNode };

const useOwnerSnapshot = (
  ownerId: PwaReloadSafetyOwnerSnapshot['ownerId'],
  state: 'safe' | 'dirty',
  reasons: PwaReloadSafetyReason[],
) => {
  const signature = `${state}:${reasons.join(',')}`;
  const [revisionState, setRevisionState] = useState({ signature, revision: 1 });
  let revision = revisionState.revision;
  if (revisionState.signature !== signature) {
    revision = revisionState.revision + 1;
    setRevisionState({ signature, revision });
  }
  return useMemo(() => ({ ownerId, state, reasonCodes: reasons, revision }), [ownerId, reasons, revision, state]);
};

const isTaskDragActive = () => (
  typeof document !== 'undefined'
  && (
    document.body.hasAttribute('data-task-drag-touch-active')
    || Boolean(document.querySelector('[data-task-drag-session-id], [data-task-drag-source-id]'))
  )
);

const isInlineEditorActive = () => {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return Boolean(active.closest('[data-inline-editor="true"], [data-workspace-title-input], [data-board-title-input], [data-tag-picker-panel], [data-mindmap-node-editor]'));
};

const PwaReloadSafetyOwners: React.FC<{ currentView: ViewMode; userId: string | null }> = ({ currentView, userId }) => {
  const [, setDomRevision] = useState(0);

  useEffect(() => {
    const bump = () => setDomRevision(value => value + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    window.addEventListener('input', bump, true);
    window.addEventListener('focusin', bump, true);
    window.addEventListener('focusout', bump, true);
    window.addEventListener('dragstart', bump, true);
    window.addEventListener('dragend', bump, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('input', bump, true);
      window.removeEventListener('focusin', bump, true);
      window.removeEventListener('focusout', bump, true);
      window.removeEventListener('dragstart', bump, true);
      window.removeEventListener('dragend', bump, true);
    };
  }, []);

  // Zustand 5 forwards selector results through useSyncExternalStore. Selecting a
  // fresh object here makes every snapshot look changed and can cause an
  // infinite React render loop as soon as the authenticated owner bridge mounts.
  const recordDraft = useRecordStore(state => state.draft);
  const recordBaseline = useRecordStore(state => state.draftBaselineSignature);
  const recordSaving = useRecordStore(state => state.saving);
  const meetingSynthesisStatus = useRecordStore(state => state.meetingSynthesisStatus);
  const meetingProjectImportStatus = useRecordStore(state => state.meetingProjectImportStatus);
  const meetingRecoveryCloudStatus = useRecordStore(state => state.meetingDraftRecovery.cloudStatus);
  const recordDirty = Boolean(recordDraft && recordBaseline !== null && getRecordDraftSignature(recordDraft) !== recordBaseline);
  const recordReasons = useMemo<PwaReloadSafetyReason[]>(() => [
    ...(recordDirty ? ['RECORD_DRAFT_UNSAVED' as const] : []),
    ...(recordSaving ? ['RECORD_SAVE_IN_FLIGHT' as const] : []),
    ...(meetingSynthesisStatus === 'synthesizing' || meetingProjectImportStatus === 'loading' ? ['CLIENT_JOB_IN_FLIGHT' as const] : []),
    ...(meetingRecoveryCloudStatus === 'error' || meetingRecoveryCloudStatus === 'conflict' ? ['PENDING_WRITE' as const] : []),
  ], [meetingProjectImportStatus, meetingRecoveryCloudStatus, meetingSynthesisStatus, recordDirty, recordSaving]);
  const recordSnapshot = useOwnerSnapshot('record-draft', recordReasons.length ? 'dirty' : 'safe', recordReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'record-draft' as const,
    getSnapshot: () => recordSnapshot,
    prepareForReload: async () => {
      const latest = useRecordStore.getState();
      if (!latest.draft) return { ok: true as const, revision: recordSnapshot.revision };
      if (latest.saving || latest.meetingSynthesisStatus === 'synthesizing' || latest.meetingProjectImportStatus === 'loading') {
        return { ok: false as const, code: 'OWNER_PREPARE_TIMEOUT' as const };
      }
      const saved = await latest.saveDraft({ nodes: useWbsStore.getState().nodes });
      return saved ? { ok: true as const, revision: recordSnapshot.revision + 1 } : { ok: false as const, code: 'OWNER_PREPARE_FAILED' as const };
    },
  }), [recordSnapshot]));

  const dialogIsOpen = useDialogStore(state => state.isOpen);
  const dialogType = useDialogStore(state => state.type);
  const dialogReasons = useMemo<PwaReloadSafetyReason[]>(() => (
    dialogIsOpen && (dialogType === 'prompt' || dialogType === 'action') ? ['DIRTY_MODAL'] : []
  ), [dialogIsOpen, dialogType]);
  const dialogSnapshot = useOwnerSnapshot('dirty-dialog', dialogReasons.length ? 'dirty' : 'safe', dialogReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'dirty-dialog' as const,
    getSnapshot: () => dialogSnapshot,
    prepareForReload: async () => dialogReasons.length
      ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const }
      : { ok: true as const, revision: dialogSnapshot.revision },
  }), [dialogReasons, dialogSnapshot]));

  const taskDetailsActive = typeof document !== 'undefined' && Boolean(document.querySelector('[data-task-details-modal="true"]'));
  const taskDetailsState = typeof document !== 'undefined' ? document.querySelector('[data-task-details-modal="true"]')?.getAttribute('data-pwa-task-details-state') : null;
  const taskDetailsReasons = useMemo<PwaReloadSafetyReason[]>(() => (
    taskDetailsActive && taskDetailsState !== 'safe' ? ['PENDING_WRITE'] : []
  ), [taskDetailsActive, taskDetailsState]);
  const taskDetailsSnapshot = useOwnerSnapshot('task-details', taskDetailsReasons.length ? 'dirty' : 'safe', taskDetailsReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'task-details' as const,
    getSnapshot: () => taskDetailsSnapshot,
    prepareForReload: async () => taskDetailsReasons.length
      ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const }
      : { ok: true as const, revision: taskDetailsSnapshot.revision },
  }), [taskDetailsReasons, taskDetailsSnapshot]));

  const calendarFormActive = typeof document !== 'undefined' && Boolean(document.querySelector('[data-calendar-subscription-view-mode="builder"]'));
  const calendarState = typeof document !== 'undefined' ? document.querySelector('[data-calendar-subscription-root="true"]')?.getAttribute('data-pwa-calendar-state') : null;
  const calendarReasons = useMemo<PwaReloadSafetyReason[]>(() => (
    calendarFormActive && calendarState !== 'safe' ? ['FORM_DRAFT_UNSAVED'] : []
  ), [calendarFormActive, calendarState]);
  const calendarSnapshot = useOwnerSnapshot('calendar-subscription-form', calendarReasons.length ? 'dirty' : 'safe', calendarReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'calendar-subscription-form' as const,
    getSnapshot: () => calendarSnapshot,
    prepareForReload: async () => calendarReasons.length
      ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const }
      : { ok: true as const, revision: calendarSnapshot.revision },
  }), [calendarReasons, calendarSnapshot]));

  const backupState = typeof document !== 'undefined' ? document.querySelector('[data-backup-settings-section="true"]')?.getAttribute('data-pwa-backup-state') : null;
  const backupReasons = useMemo<PwaReloadSafetyReason[]>(() => (
    backupState && backupState !== 'safe' ? ['BACKUP_RESTORE_IN_FLIGHT'] : []
  ), [backupState]);
  const backupSnapshot = useOwnerSnapshot('backup-import', backupReasons.length ? 'dirty' : 'safe', backupReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'backup-import' as const,
    getSnapshot: () => backupSnapshot,
    prepareForReload: async () => backupReasons.length
      ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const }
      : { ok: true as const, revision: backupSnapshot.revision },
  }), [backupReasons, backupSnapshot]));

  const ragIsLoading = useRagStore(state => state.isLoading);
  const ragQueryDraft = useRagStore(state => state.queryDraft);
  const ragReasons = useMemo<PwaReloadSafetyReason[]>(() => [
    ...(ragQueryDraft.trim() ? ['FORM_DRAFT_UNSAVED' as const] : []),
    ...(ragIsLoading ? ['CLIENT_JOB_IN_FLIGHT' as const] : []),
  ], [ragIsLoading, ragQueryDraft]);
  const ragSnapshot = useOwnerSnapshot('rag-query', ragReasons.length ? 'dirty' : 'safe', ragReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'rag-query' as const,
    getSnapshot: () => ragSnapshot,
    prepareForReload: async () => ragReasons.length
      ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const }
      : { ok: true as const, revision: ragSnapshot.revision },
  }), [ragReasons, ragSnapshot]));

  const inviteState = typeof document !== 'undefined' ? document.querySelector('[data-board-share-dialog]') : null;
  const inviteInput = inviteState?.querySelector<HTMLInputElement>('input[data-board-share-invite-email="true"]');
  const inviteLoading = inviteState?.matches('[data-board-share-loading="true"]') ?? false;
  const inviteReasons = useMemo<PwaReloadSafetyReason[]>(() => (
    inviteState && ((inviteInput?.value.trim() ?? '') || inviteLoading) ? ['FORM_DRAFT_UNSAVED'] : []
  ), [inviteInput?.value, inviteLoading, inviteState]);
  const inviteSnapshot = useOwnerSnapshot('board-member-invite', inviteReasons.length ? 'dirty' : 'safe', inviteReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'board-member-invite' as const,
    getSnapshot: () => inviteSnapshot,
    prepareForReload: async () => inviteReasons.length
      ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const }
      : { ok: true as const, revision: inviteSnapshot.revision },
  }), [inviteReasons, inviteSnapshot]));

  const domSafetyState = {
    inlineEditorActive: isInlineEditorActive(),
    taskDragActive: isTaskDragActive(),
  };
  const inlineReasons = useMemo<PwaReloadSafetyReason[]>(() => (
    domSafetyState.inlineEditorActive ? ['FORM_DRAFT_UNSAVED'] : []
  ), [domSafetyState.inlineEditorActive]);
  const inlineSnapshot = useOwnerSnapshot('inline-editor', inlineReasons.length ? 'dirty' : 'safe', inlineReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'inline-editor' as const,
    getSnapshot: () => inlineSnapshot,
    prepareForReload: async () => inlineReasons.length
      ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const }
      : { ok: true as const, revision: inlineSnapshot.revision },
  }), [inlineReasons, inlineSnapshot]));

  const taskDragReasons = useMemo<PwaReloadSafetyReason[]>(() => (
    domSafetyState.taskDragActive ? ['TRANSIENT_DRAG_ACTIVE'] : []
  ), [domSafetyState.taskDragActive]);
  const taskDragSnapshot = useOwnerSnapshot('task-drag', taskDragReasons.length ? 'dirty' : 'safe', taskDragReasons);
  usePwaReloadSafetyOwner(useMemo(() => ({
    ownerId: 'task-drag' as const,
    getSnapshot: () => taskDragSnapshot,
    prepareForReload: async () => taskDragReasons.length
      ? { ok: false as const, code: 'OWNER_ACTION_REQUIRED' as const }
      : { ok: true as const, revision: taskDragSnapshot.revision },
  }), [taskDragReasons, taskDragSnapshot]));

  useEffect(() => {
    setPwaReloadSafetyCurrentView(currentView);
  }, [currentView]);

  useEffect(() => {
    const epoch = `${userId ?? 'anonymous'}:${currentView}:${Date.now()}`;
    setPwaReloadReadiness('active-view', epoch, true);
    return () => setPwaReloadReadiness('active-view', epoch, false);
  }, [currentView, userId]);

  useEffect(() => {
    refreshPwaReloadSafety(currentView);
  }, [backupReasons, calendarReasons, currentView, dialogReasons, inlineReasons, inviteReasons, ragReasons, recordReasons, taskDetailsReasons, taskDragReasons, userId]);

  return null;
};

export const PwaReloadSafetyBridge: React.FC<PwaReloadSafetyBridgeProps> = ({ children }) => {
  useEffect(() => {
    installPwaReloadSafetyTestControls();
  }, []);

  return <>{children}</>;
};

export { PwaReloadSafetyOwners };
