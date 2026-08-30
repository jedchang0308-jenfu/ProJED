import React from 'react';
import useDialogStore from '../store/useDialogStore';
import useRecordStore from '../store/useRecordStore';
import { recordService } from '../services/dataBackend';
import {
  clearMeetingDraftSnapshot,
  getMeetingDraftRecoveryScopeKey,
  loadLatestMeetingDraftSnapshot,
  MeetingDraftCheckpointError,
  saveEmergencyMeetingDraftSnapshot,
  saveMeetingDraftSnapshot,
} from '../services/meetingDraftRecoveryService';
import type { EditableKnowledgeRecord, KnowledgeRecordInput, MeetingDraftRecoverySnapshot, MeetingTaskActivity } from '../types';
import {
  acquireCheckpointLease,
  CHECKPOINT_IDLE_MS,
  getCheckpointDecision,
  getUtf8ByteLength,
  reserveCheckpointAttempt,
} from '../utils/recordDraftCheckpointPolicy';
import { getRecordDraftSignature } from '../utils/meetingRecordWorkflow';
import { useMeetingRecordAvailability } from '../utils/meetingRecordAvailability';

const CHECKPOINT_LEDGER_PREFIX = 'projed:meeting-draft-checkpoint-ledger:v1:';
const CHECKPOINT_LEASE_PREFIX = 'projed:meeting-draft-checkpoint-lease:v1:';

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

const getRecoverySignature = ({ draft, activities, appendedMeetingActivityIds }: RecoverySignatureInput) =>
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

const toCheckpointRecord = (draft: NonNullable<ReturnType<typeof useRecordStore.getState>['draft']>): KnowledgeRecordInput => ({
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
  remoteSignature: string | null,
): MeetingDraftRecoverySnapshot | null => {
  if (!state.isMeetingMode || state.draft?.type !== 'meeting' || state.draft.status !== 'draft') return null;
  const draft = toCheckpointRecord(state.draft);
  return {
    schemaVersion: 1,
    scopeKey: getMeetingDraftRecoveryScopeKey(ownerUserId, workspaceId, boardId, state.draft.id ?? ''),
    ownerUserId,
    workspaceId,
    boardId,
    draftId: state.draft.id ?? '',
    savedAt: Date.now(),
    localSignature: getRecoverySignature({
      draft,
      activities: state.meetingActivities,
      appendedMeetingActivityIds: state.appendedMeetingActivityIds,
    }),
    remoteSignature,
    baselineSignature: state.draftBaselineSignature,
    contentCursorOffset: state.contentCursorOffset,
    draft,
    meetingActivities: state.meetingActivities,
    appendedMeetingActivityIds: state.appendedMeetingActivityIds,
  };
};

const getRecordRecoverySignature = (record: EditableKnowledgeRecord): string | null => {
  const recovery = record.metadata?.projedDraftRecovery;
  if (recovery && typeof recovery === 'object' && !Array.isArray(recovery)) {
    const signature = (recovery as { localSignature?: unknown }).localSignature;
    if (typeof signature === 'string') return signature;
  }
  return getRecoverySignature({
    draft: {
      id: record.id,
      type: record.type,
      title: record.title,
      content: record.content,
      status: record.status,
      visibility: record.visibility,
      participantsText: record.participantsText,
      occurredAt: record.occurredAt,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      recordedBy: record.recordedBy,
      metadata: getCleanMetadata(record.metadata),
      taskLinks: record.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
    },
    activities: [],
    appendedMeetingActivityIds: [],
  });
};

const createRecoveredDraftId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `recovered_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

export const useMeetingDraftRecovery = ({
  userId,
  workspaceId,
  boardId,
  recordsLoaded,
}: MeetingDraftRecoveryProps) => {
  const { isMeetingRecordUnavailable } = useMeetingRecordAvailability();
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [version, setVersion] = React.useState(0);
  const stateRef = React.useRef(useRecordStore.getState());
  const remoteSignatureRef = React.useRef<string | null>(null);
  const changedAtRef = React.useRef<number | null>(null);
  const lastAttemptAtRef = React.useRef<number | null>(null);
  const lastConfirmedAtRef = React.useRef<number | null>(null);
  const retryCountRef = React.useRef(0);
  const attemptTimestampsRef = React.useRef<number[]>([]);
  const currentSignatureRef = React.useRef<string | null>(null);
  const localSavedSignatureRef = React.useRef<string | null>(null);
  const restoredScopeRef = React.useRef<string | null>(null);
  const localTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = React.useRef(false);
  const tabIdRef = React.useRef(`tab_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  React.useEffect(() => {
    return useRecordStore.subscribe((next, previous) => {
      stateRef.current = next;
      const nextActive = next.isMeetingMode && next.draft?.type === 'meeting' && next.draft.status === 'draft';
      const previousActive = previous.isMeetingMode && previous.draft?.type === 'meeting' && previous.draft.status === 'draft';
      const nextRecord = nextActive ? toCheckpointRecord(next.draft!) : null;
      const nextSignature = nextRecord
        ? getRecoverySignature({
            draft: nextRecord,
            activities: next.meetingActivities,
            appendedMeetingActivityIds: next.appendedMeetingActivityIds,
          })
        : null;
      if (nextSignature && nextSignature !== currentSignatureRef.current) {
        currentSignatureRef.current = nextSignature;
        changedAtRef.current = Date.now();
        if (next.lastSaveFeedback && next.lastSaveFeedback.recordId === next.draft?.id) {
          remoteSignatureRef.current = nextSignature;
          lastConfirmedAtRef.current = next.lastSaveFeedback.savedAt;
          retryCountRef.current = 0;
        }
        if (next.meetingDraftRecovery.restoredAt && next.meetingDraftRecovery.restoredAt !== previous.meetingDraftRecovery.restoredAt) {
          changedAtRef.current = null;
          localSavedSignatureRef.current = nextSignature;
        }
        if (!previousActive || previous.draft?.id !== next.draft?.id) {
          const remote = next.records.find(record => record.id === next.draft?.id);
          if (remote && remote.status === 'draft') {
            remoteSignatureRef.current = getRecordRecoverySignature(remote);
            lastConfirmedAtRef.current = remote.updatedAt ?? Date.now();
          }
        }
        setVersion(value => value + 1);
      }
      if (next.meetingDraftRecoveryClearToken !== previous.meetingDraftRecoveryClearToken) {
        if (userId && workspaceId && boardId && previous.draft?.id) {
          void clearMeetingDraftSnapshot(getMeetingDraftRecoveryScopeKey(userId, workspaceId, boardId, previous.draft.id));
        }
        setVersion(value => value + 1);
      }
    });
  }, [boardId, userId, workspaceId]);

  React.useEffect(() => {
    if (!recordsLoaded) return;
    const state = useRecordStore.getState();
    if (!state.isMeetingMode || state.draft?.type !== 'meeting' || state.draft.status !== 'draft') return;
    const draft = toCheckpointRecord(state.draft);
    const signature = getRecoverySignature({
      draft,
      activities: state.meetingActivities,
      appendedMeetingActivityIds: state.appendedMeetingActivityIds,
    });
    currentSignatureRef.current = signature;
    const remote = state.records.find(record => record.id === state.draft?.id && record.status === 'draft');
    if (remote) {
      remoteSignatureRef.current = getRecordRecoverySignature(remote);
      lastConfirmedAtRef.current = remote.updatedAt ?? Date.now();
    }
    const draftIsDirty = signature !== remoteSignatureRef.current && (
      getRecordDraftSignature(state.draft) !== state.draftBaselineSignature
      || state.meetingActivities.length > 0
    );
    changedAtRef.current = draftIsDirty ? Date.now() : null;
  }, [boardId, recordsLoaded, userId, workspaceId]);

  React.useEffect(() => {
    if (!userId || !workspaceId || !boardId || isMeetingRecordUnavailable) return;
    const currentScope = getMeetingDraftRecoveryScopeKey(userId, workspaceId, boardId, '');
    if (restoredScopeRef.current === currentScope || !recordsLoaded) return;
    restoredScopeRef.current = currentScope;
    let cancelled = false;
    void (async () => {
      const snapshot = await loadLatestMeetingDraftSnapshot(currentScope);
      if (cancelled || !snapshot) return;
      const currentState = useRecordStore.getState();
      if (currentState.draft || currentState.isMeetingMode) return;
      const remote = currentState.records.find(record => record.id === snapshot.draftId);
      const remoteSignature = remote ? getRecordRecoverySignature(remote) : null;
      const remoteIsNewer = Boolean(remote && (remote.updatedAt ?? 0) > snapshot.savedAt);
      const sameAsRemote = Boolean(remote && remote.status === 'draft' && remoteSignature === snapshot.localSignature);
      if (!remote || sameAsRemote || !remoteIsNewer) {
        remoteSignatureRef.current = remoteSignature ?? snapshot.remoteSignature;
        lastConfirmedAtRef.current = remote ? remote.updatedAt ?? snapshot.savedAt : snapshot.savedAt;
        useRecordStore.getState().restoreMeetingDraftSnapshot(snapshot);
        setVersion(value => value + 1);
        return;
      }

      useRecordStore.getState().setMeetingDraftRecovery({
        cloudStatus: 'conflict',
        message: '偵測到雲端已有較新版本，請選擇保留本機內容或使用雲端版本。',
        conflictSnapshot: snapshot,
      });
      const choice = await useDialogStore.getState().showActionDialog({
        title: '找到尚未恢復的會議草稿',
        message: 'F5 前的本機內容與雲端版本不同，請選擇要保留哪一份。',
        actions: [
          { id: 'local_as_new', label: '保留本機為新草稿', description: '另存為新的會議草稿，不覆蓋雲端內容。', variant: 'primary' },
          { id: 'use_cloud', label: '使用雲端版本', description: '捨棄本機恢復點，開啟雲端目前版本。', variant: 'secondary' },
          { id: 'later', label: '稍後處理', description: '先關閉提示，本機恢復點會保留 7 天。', variant: 'secondary' },
        ],
      });
      if (cancelled) return;
      if (choice === 'local_as_new') {
        const recoveredDraftId = createRecoveredDraftId();
        const recovered = {
          ...snapshot,
          draftId: recoveredDraftId,
          scopeKey: getMeetingDraftRecoveryScopeKey(userId, workspaceId, boardId, recoveredDraftId),
          remoteSignature: null,
          draft: { ...snapshot.draft, id: recoveredDraftId, status: 'draft' as const },
        };
        recovered.draftId = recovered.draft.id!;
        recovered.scopeKey = getMeetingDraftRecoveryScopeKey(userId, workspaceId, boardId, recovered.draftId);
        useRecordStore.getState().restoreMeetingDraftSnapshot(recovered);
        setVersion(value => value + 1);
      } else if (choice === 'use_cloud' && remote) {
        await clearMeetingDraftSnapshot(snapshot.scopeKey);
        useRecordStore.getState().openExistingRecord(remote);
        useRecordStore.getState().startMeetingRecord();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, isMeetingRecordUnavailable, recordsLoaded, userId, workspaceId]);

  React.useEffect(() => {
    if (!userId || !workspaceId || !boardId || isMeetingRecordUnavailable || !recordsLoaded) return undefined;
    const schedule = () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      localTimerRef.current = setTimeout(() => {
        const snapshot = buildRecoverySnapshot(stateRef.current, userId, workspaceId, boardId, remoteSignatureRef.current);
        if (!snapshot || changedAtRef.current === null || snapshot.localSignature === localSavedSignatureRef.current) return;
        useRecordStore.getState().setMeetingDraftRecovery({ localStatus: 'saving', message: null });
        void saveMeetingDraftSnapshot(snapshot).then(result => {
          useRecordStore.getState().setMeetingDraftRecovery({
            localStatus: result.status,
            localSavedAt: snapshot.savedAt,
            message: result.status === 'error' ? '本機保存失敗，請勿關閉此分頁。' : null,
          });
          localSavedSignatureRef.current = snapshot.localSignature;
        });
      }, 500);
    };
    schedule();
    return () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
    };
  }, [boardId, isMeetingRecordUnavailable, recordsLoaded, userId, version, workspaceId]);

  React.useEffect(() => {
    if (!userId || !workspaceId || !boardId || isMeetingRecordUnavailable || !recordsLoaded) return undefined;
    const scheduleCloud = () => {
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
      const state = stateRef.current;
      const snapshot = buildRecoverySnapshot(state, userId, workspaceId, boardId, remoteSignatureRef.current);
      if (!snapshot || changedAtRef.current === null || snapshot.localSignature === remoteSignatureRef.current || inFlightRef.current) return;
      const payloadBytes = getUtf8ByteLength(JSON.stringify(snapshot));
      const now = Date.now();
      const decision = getCheckpointDecision({
        now,
        changedAt: changedAtRef.current ?? now,
        lastAttemptAt: lastAttemptAtRef.current,
        lastConfirmedAt: lastConfirmedAtRef.current,
        retryCount: retryCountRef.current,
        attemptTimestamps: attemptTimestampsRef.current,
        payloadBytes,
        online,
      });
      if (!decision.allowed) {
        if (decision.reason === 'offline') {
          useRecordStore.getState().setMeetingDraftRecovery({ cloudStatus: 'paused', message: '目前離線，內容已保留在本機；恢復連線後再嘗試雲端保存。' });
          return;
        }
        if (decision.reason === 'oversize') {
          useRecordStore.getState().setMeetingDraftRecovery({ cloudStatus: 'error', message: '會議草稿內容過大，已停止雲端 checkpoint；請先發布或精簡內容。' });
          return;
        }
        if (decision.nextAt !== null) {
          useRecordStore.getState().setMeetingDraftRecovery({ cloudStatus: 'scheduled', message: null });
          cloudTimerRef.current = setTimeout(scheduleCloud, Math.max(250, decision.nextAt - now));
        }
        return;
      }
      const ledgerKey = `${CHECKPOINT_LEDGER_PREFIX}${userId}`;
      const attempts = reserveCheckpointAttempt(ledgerKey, now);
      if (!attempts) {
        useRecordStore.getState().setMeetingDraftRecovery({ cloudStatus: 'paused', message: '已達本機每小時雲端保存上限；內容仍保留在本機。' });
        return;
      }
      const releaseLease = acquireCheckpointLease(`${CHECKPOINT_LEASE_PREFIX}${snapshot.scopeKey}`, tabIdRef.current, now);
      if (!releaseLease) {
        cloudTimerRef.current = setTimeout(scheduleCloud, 30_000);
        return;
      }
      attemptTimestampsRef.current = attempts;
      lastAttemptAtRef.current = now;
      inFlightRef.current = true;
      useRecordStore.getState().setMeetingDraftRecovery({ cloudStatus: 'saving', message: null });
      void recordService.checkpointDraft(workspaceId, boardId, {
        ownerUserId: userId,
        workspaceId,
        boardId,
        record: {
          ...snapshot.draft,
          metadata: {
            ...getCleanMetadata(snapshot.draft.metadata),
            projedDraftRecovery: {
              schemaVersion: 1,
              ownerUserId: userId,
              workspaceId,
              boardId,
              localSignature: snapshot.localSignature,
              remoteSignature: remoteSignatureRef.current,
              meetingActivities: snapshot.meetingActivities,
              appendedMeetingActivityIds: snapshot.appendedMeetingActivityIds,
              checkpointedAt: now,
            },
          },
        },
        meetingActivities: snapshot.meetingActivities,
        appendedMeetingActivityIds: snapshot.appendedMeetingActivityIds,
        localSignature: snapshot.localSignature,
        remoteSignature: remoteSignatureRef.current,
      }).then(result => {
        remoteSignatureRef.current = result.remoteSignature;
        lastConfirmedAtRef.current = result.confirmedAt;
        retryCountRef.current = 0;
        useRecordStore.getState().setMeetingDraftRecovery({ cloudStatus: 'saved', cloudSavedAt: result.confirmedAt, message: null });
      }).catch(error => {
        retryCountRef.current += 1;
        const checkpointError = error instanceof MeetingDraftCheckpointError ? error : null;
        useRecordStore.getState().setMeetingDraftRecovery({
          cloudStatus: checkpointError?.kind === 'conflict' ? 'conflict' : 'error',
          message: checkpointError?.message ?? '雲端暫時無法保存，草稿仍保留在本機。',
          conflictSnapshot: checkpointError?.kind === 'conflict' ? snapshot : null,
        });
      }).finally(() => {
        inFlightRef.current = false;
        releaseLease();
        scheduleCloud();
      });
    };
    const timer = setTimeout(scheduleCloud, CHECKPOINT_IDLE_MS);
    return () => {
      clearTimeout(timer);
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  }, [boardId, isMeetingRecordUnavailable, online, recordsLoaded, userId, version, workspaceId]);

  React.useEffect(() => {
    if (!userId || !workspaceId || !boardId || isMeetingRecordUnavailable) return undefined;
    const handleEmergencySave = () => {
      const snapshot = buildRecoverySnapshot(stateRef.current, userId, workspaceId, boardId, remoteSignatureRef.current);
      if (snapshot) saveEmergencyMeetingDraftSnapshot(snapshot);
    };
    window.addEventListener('pagehide', handleEmergencySave);
    window.addEventListener('beforeunload', handleEmergencySave);
    return () => {
      window.removeEventListener('pagehide', handleEmergencySave);
      window.removeEventListener('beforeunload', handleEmergencySave);
    };
  }, [boardId, isMeetingRecordUnavailable, userId, workspaceId]);

};
