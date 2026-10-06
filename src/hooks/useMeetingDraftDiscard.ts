import React from 'react';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import useRecordStore from '../store/useRecordStore';
import { clearMeetingDraftSnapshot, getMeetingDraftRecoveryScopeKey } from '../services/meetingDraftRecoveryService';
import { getRecordDraftSignature } from '../utils/meetingRecordWorkflow';

export const useMeetingDraftDiscard = () => {
  const userId = useAuthStore(state => state.user?.uid ?? null);
  const { activeWorkspaceId, activeBoardId } = useBoardStore();
  const draft = useRecordStore(state => state.draft);
  const isMeetingMode = useRecordStore(state => state.isMeetingMode);
  const meetingActivities = useRecordStore(state => state.meetingActivities);
  const draftBaselineSignature = useRecordStore(state => state.draftBaselineSignature);
  const localStatus = useRecordStore(state => state.meetingDraftRecovery.localStatus);
  const closePanel = useRecordStore(state => state.closePanel);
  const resetMeetingDraftRecoveryState = useRecordStore(state => state.resetMeetingDraftRecoveryState);
  const setMeetingDraftRecovery = useRecordStore(state => state.setMeetingDraftRecovery);
  const showActionDialog = useDialogStore(state => state.showActionDialog);

  const canDiscard = Boolean(
    isMeetingMode
    && draft?.type === 'meeting'
    && (
      getRecordDraftSignature(draft) !== draftBaselineSignature
      || meetingActivities.length > 0
      || localStatus !== 'idle'
    ),
  );

  const discard = React.useCallback(async () => {
    if (!canDiscard || !userId || !activeWorkspaceId || !activeBoardId || draft?.type !== 'meeting' || !draft.id) return false;
    const choice = await showActionDialog({
      title: '刪除未儲存內容並離開？',
      message: '這會刪除本次尚未正式儲存的會議內容；若已有草稿，已儲存的版本仍會保留。',
      actions: [
        {
          id: 'discard',
          label: '刪除並離開',
          description: '清除目前裝置上的未儲存內容，且無法由本機復原。',
          variant: 'danger',
        },
        { id: 'cancel', label: '取消', variant: 'secondary' },
      ],
    });
    if (choice !== 'discard') return false;

    const scopeKey = getMeetingDraftRecoveryScopeKey(userId, activeWorkspaceId, activeBoardId, draft.id);
    const cleared = await clearMeetingDraftSnapshot(scopeKey);
    if (!cleared) {
      setMeetingDraftRecovery({
        localStatus: 'error',
        message: '本機內容尚未清除，請重試；會議仍保留在目前畫面。',
      });
      return false;
    }
    resetMeetingDraftRecoveryState();
    closePanel();
    return true;
  }, [activeBoardId, activeWorkspaceId, canDiscard, closePanel, draft, resetMeetingDraftRecoveryState, setMeetingDraftRecovery, showActionDialog, userId]);

  return { canDiscard, discard };
};
