import React from 'react';
import useRecordStore from '../store/useRecordStore';
import {
  clearMeetingDraftSnapshot,
  getMeetingDraftRecoveryScopeKey,
  loadLatestMeetingDraftSnapshotWithSource,
  normalizeMeetingDraftRecoverySnapshot,
  saveEmergencyMeetingDraftSnapshot,
  saveMeetingDraftSnapshot,
} from '../services/meetingDraftRecoveryService';
import type { KnowledgeRecordInput, MeetingDraftRecoverySnapshotV2, MeetingTaskActivity } from '../types';
import { getRecordDraftSignature } from '../utils/meetingRecordWorkflow';
import { useMeetingRecordAvailability } from '../utils/meetingRecordAvailability';

type MeetingDraftRecoveryProps = {
  userId: string | null;
  workspaceId: string | null;
  boardId: string | null;
  recordsLoaded: boolean;
};

type RecoverySignatureInput = {
  draft: KnowledgeRecordInput;
  activities: MeetingTaskActivity[];
  appendedMeetingActivityIds: string[];
};

type ForceFlushHandler = () => Promise<boolean>;

export const MEETING_DRAFT_FORCE_FLUSH_TIMEOUT_MS = 2_000;

let activeForceFlushHandler: ForceFlushHandler | null = null;

export const registerMeetingDraftForceFlush = (handler: ForceFlushHandler) => {
  activeForceFlushHandler = handler;
  return () => {
    if (activeForceFlushHandler === handler) activeForceFlushHandler = null;
  };
};

export const forceFlushMeetingDraft = async () => {
  if (!activeForceFlushHandler) return false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      activeForceFlushHandler(),
      new Promise<boolean>(resolve => {
        timeoutId = setTimeout(() => resolve(false), MEETING_DRAFT_FORCE_FLUSH_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
};

export const getMeetingRecoverySignature = ({ draft, activities, appendedMeetingActivityIds }: RecoverySignatureInput) =>
  JSON.stringify({
    draft: getRecordDraftSignature(draft),
    activities,
    appendedMeetingActivityIds,
  });

const getCleanMetadata = (metadata?: Record<string, unknown>) => {
  const next = { ...(metadata ?? {}) };
  delete next.projedDraftRecovery;
  return next;
};

const toLocalRecord = (draft: NonNullable<ReturnType<typeof useRecordStore.getState>['draft']>): KnowledgeRecordInput => ({
  id: draft.id,
  type: 'meeting',
  title: draft.title,
  content: draft.content,
  status: 'draft',
  visibility: draft.visibility,
  participantsText: draft.participantsText,
  occurredAt: draft.occurredAt,
  startedAt: draft.startedAt,
  endedAt: draft.endedAt,
  recordedBy: draft.recordedBy,
  metadata: getCleanMetadata(draft.metadata),
  taskLinks: draft.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
});

const buildRecoverySnapshot = (
  state: ReturnType<typeof useRecordStore.getState>,
  ownerUserId: string,
  workspaceId: string,
  boardId: string,
  writeSequence: number,
): MeetingDraftRecoverySnapshotV2 | null => {
  if (!state.isMeetingMode || state.draft?.type !== 'meeting' || state.draft.status !== 'draft') return null;
  const draft = toLocalRecord(state.draft);
  return {
    schemaVersion: 2,
    scopeKey: getMeetingDraftRecoveryScopeKey(ownerUserId, workspaceId, boardId, state.draft.id ?? ''),
    ownerUserId,
    workspaceId,
    boardId,
    draftId: state.draft.id ?? '',
    savedAt: Date.now(),
    writeSequence,
    localSignature: getMeetingRecoverySignature({
      draft,
      activities: state.meetingActivities,
      appendedMeetingActivityIds: state.appendedMeetingActivityIds,
    }),
    canonicalBaselineSignature: state.draftBaselineSignature,
    contentCursorOffset: state.contentCursorOffset,
    draft,
    meetingActivities: state.meetingActivities,
    appendedMeetingActivityIds: state.appendedMeetingActivityIds,
  };
};

export const useMeetingDraftRecovery = ({
  userId,
  workspaceId,
  boardId,
  recordsLoaded,
}: MeetingDraftRecoveryProps) => {
  const { isMeetingRecordUnavailable } = useMeetingRecordAvailability();
  const [version, setVersion] = React.useState(0);
  const stateRef = React.useRef(useRecordStore.getState());
  const currentSignatureRef = React.useRef<string | null>(null);
  const localCommittedSignatureRef = React.useRef<string | null>(null);
  const changedAtRef = React.useRef<number | null>(null);
  const writeSequenceRef = React.useRef(0);
  const restoredScopeRef = React.useRef<string | null>(null);
  const localTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return useRecordStore.subscribe((next, previous) => {
      stateRef.current = next;
      const nextActive = next.isMeetingMode && next.draft?.type === 'meeting' && next.draft.status === 'draft';
      const nextRecord = nextActive ? toLocalRecord(next.draft!) : null;
      const nextSignature = nextRecord
        ? getMeetingRecoverySignature({
            draft: nextRecord,
            activities: next.meetingActivities,
            appendedMeetingActivityIds: next.appendedMeetingActivityIds,
          })
        : null;
      if (nextSignature && nextSignature !== currentSignatureRef.current) {
        currentSignatureRef.current = nextSignature;
        const isDirty = Boolean(nextRecord && (
          getRecordDraftSignature(next.draft!) !== next.draftBaselineSignature ||
          next.meetingActivities.length > 0
        ));
        changedAtRef.current = isDirty ? Date.now() : null;
        setVersion(value => value + 1);
      }
      if (next.meetingDraftRecoveryClearToken !== previous.meetingDraftRecoveryClearToken) {
        const previousDraftId = previous.draft?.type === 'meeting' ? previous.draft.id : null;
        if (userId && workspaceId && boardId && previousDraftId) {
          const scopeKey = getMeetingDraftRecoveryScopeKey(userId, workspaceId, boardId, previousDraftId);
          void clearMeetingDraftSnapshot(scopeKey).then(cleared => {
            if (!cleared && useRecordStore.getState().draft?.id === previousDraftId) {
              useRecordStore.getState().setMeetingDraftRecovery({
                localStatus: 'error',
                message: '本機清理尚未完成，內容仍保留在此裝置。',
              });
            }
          });
        }
        setVersion(value => value + 1);
      }
    });
  }, [boardId, userId, workspaceId]);

  React.useEffect(() => {
    if (!recordsLoaded) return;
    const state = useRecordStore.getState();
    if (!state.isMeetingMode || state.draft?.type !== 'meeting' || state.draft.status !== 'draft') return;
    const draft = toLocalRecord(state.draft);
    const signature = getMeetingRecoverySignature({
      draft,
      activities: state.meetingActivities,
      appendedMeetingActivityIds: state.appendedMeetingActivityIds,
    });
    stateRef.current = state;
    currentSignatureRef.current = signature;
    const draftIsDirty = getRecordDraftSignature(state.draft) !== state.draftBaselineSignature || state.meetingActivities.length > 0;
    changedAtRef.current = draftIsDirty ? Date.now() : null;
  }, [boardId, recordsLoaded, userId, workspaceId]);

  React.useEffect(() => {
    if (!userId || !workspaceId || !boardId || isMeetingRecordUnavailable || !recordsLoaded) return;
    const currentScope = getMeetingDraftRecoveryScopeKey(userId, workspaceId, boardId, '');
    if (restoredScopeRef.current === currentScope) return;
    restoredScopeRef.current = currentScope;
    let cancelled = false;
    void loadLatestMeetingDraftSnapshotWithSource(currentScope).then(loaded => {
      if (cancelled || !loaded) return;
      const { snapshot, source } = loaded;
      const currentState = useRecordStore.getState();
      if (currentState.draft || currentState.isMeetingMode) return;
      const normalized = normalizeMeetingDraftRecoverySnapshot(snapshot);
      writeSequenceRef.current = Math.max(writeSequenceRef.current, normalized.writeSequence);
      currentSignatureRef.current = normalized.localSignature;
      localCommittedSignatureRef.current = source === 'indexeddb' ? normalized.localSignature : null;
      changedAtRef.current = source === 'indexeddb' ? null : Date.now();
      // Do not enter meeting mode during app startup. A local recovery
      // snapshot is an explicit user choice, not an implicit navigation.
      // Keep the snapshot in memory so the recovery notice can offer a
      // deliberate "恢復" action without discarding the user's content.
      useRecordStore.getState().setMeetingDraftRecovery({
        localStatus: source === 'session' ? 'degraded' : 'saved',
        localSavedAt: source === 'indexeddb' ? normalized.savedAt : null,
        message: source === 'session' ? '內容暫存在此分頁，請確認後恢復。' : null,
        pendingSnapshot: normalized,
      });
      setVersion(value => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, isMeetingRecordUnavailable, recordsLoaded, userId, workspaceId]);

  const forceFlush = React.useCallback(async () => {
    if (!userId || !workspaceId || !boardId || isMeetingRecordUnavailable) return false;
    const snapshot = buildRecoverySnapshot(
      stateRef.current,
      userId,
      workspaceId,
      boardId,
      writeSequenceRef.current + 1,
    );
    if (!snapshot || changedAtRef.current === null) return true;
    if (localCommittedSignatureRef.current === snapshot.localSignature) return true;
    writeSequenceRef.current = snapshot.writeSequence;
    useRecordStore.getState().setMeetingDraftRecovery({ localStatus: 'saving', message: null });
    const result = await saveMeetingDraftSnapshot(snapshot);
    const current = useRecordStore.getState();
    if (currentSignatureRef.current === snapshot.localSignature && current.draft?.id === snapshot.draftId) {
      if (result.indexedDbSaved) {
        localCommittedSignatureRef.current = snapshot.localSignature;
        changedAtRef.current = null;
      }
      useRecordStore.getState().setMeetingDraftRecovery({
        localStatus: result.indexedDbSaved ? 'saved' : result.sessionStorageSaved ? 'degraded' : 'error',
        localSavedAt: result.indexedDbSaved ? snapshot.savedAt : null,
        message: result.indexedDbSaved ? null : result.sessionStorageSaved
          ? '內容暫存在此分頁，尚未完成裝置保存。'
          : '本機保存失敗，請保留此分頁並重試。',
      });
    }
    return result.indexedDbSaved;
  }, [boardId, isMeetingRecordUnavailable, userId, workspaceId]);

  React.useEffect(() => registerMeetingDraftForceFlush(forceFlush), [forceFlush]);

  React.useEffect(() => {
    if (!userId || !workspaceId || !boardId || isMeetingRecordUnavailable || !recordsLoaded) return undefined;
    if (localTimerRef.current) clearTimeout(localTimerRef.current);
    localTimerRef.current = setTimeout(() => {
      const snapshot = buildRecoverySnapshot(
        stateRef.current,
        userId,
        workspaceId,
        boardId,
        writeSequenceRef.current + 1,
      );
      if (!snapshot || changedAtRef.current === null || localCommittedSignatureRef.current === snapshot.localSignature) return;
      writeSequenceRef.current = snapshot.writeSequence;
      useRecordStore.getState().setMeetingDraftRecovery({ localStatus: 'saving', message: null });
      void saveMeetingDraftSnapshot(snapshot).then(result => {
        if (currentSignatureRef.current !== snapshot.localSignature || useRecordStore.getState().draft?.id !== snapshot.draftId) return;
        if (result.indexedDbSaved) {
          localCommittedSignatureRef.current = snapshot.localSignature;
          changedAtRef.current = null;
        }
        useRecordStore.getState().setMeetingDraftRecovery({
          localStatus: result.indexedDbSaved ? 'saved' : result.sessionStorageSaved ? 'degraded' : 'error',
          localSavedAt: result.indexedDbSaved ? snapshot.savedAt : null,
          message: result.indexedDbSaved ? null : result.sessionStorageSaved
            ? '內容暫存在此分頁，尚未完成裝置保存。'
            : '本機保存失敗，請勿關閉此分頁。',
        });
      });
    }, 500);
    return () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
    };
  }, [boardId, isMeetingRecordUnavailable, recordsLoaded, userId, version, workspaceId]);

  React.useEffect(() => {
    if (!userId || !workspaceId || !boardId || isMeetingRecordUnavailable) return undefined;
    const saveEmergency = () => {
      const snapshot = buildRecoverySnapshot(
        stateRef.current,
        userId,
        workspaceId,
        boardId,
        Math.max(writeSequenceRef.current, 1),
      );
      if (snapshot && changedAtRef.current !== null) saveEmergencyMeetingDraftSnapshot(snapshot);
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = stateRef.current;
      const snapshot = buildRecoverySnapshot(state, userId, workspaceId, boardId, Math.max(writeSequenceRef.current, 1));
      if (!snapshot || changedAtRef.current === null) return;
      saveEmergencyMeetingDraftSnapshot(snapshot);
      if (localCommittedSignatureRef.current !== snapshot.localSignature) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('pagehide', saveEmergency);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', saveEmergency);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [boardId, isMeetingRecordUnavailable, userId, workspaceId]);
};
