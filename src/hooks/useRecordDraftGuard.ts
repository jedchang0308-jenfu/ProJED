import React from 'react';
import useBoardStore from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import useRecordStore from '../store/useRecordStore';
import { useWbsStore } from '../store/useWbsStore';
import { getMeetingRecordActionState, getRecordDraftSignature } from '../utils/meetingRecordWorkflow';

type GuardOptions = {
  title?: string;
  message?: string;
};

export const useRecordDraftGuard = () => {
  const { activeWorkspaceId, activeBoardId } = useBoardStore();
  const nodes = useWbsStore(state => state.nodes);
  const draft = useRecordStore(state => state.draft);
  const saving = useRecordStore(state => state.saving);
  const isMeetingMode = useRecordStore(state => state.isMeetingMode);
  const meetingActivities = useRecordStore(state => state.meetingActivities);
  const meetingSynthesisStatus = useRecordStore(state => state.meetingSynthesisStatus);
  const meetingSynthesisError = useRecordStore(state => state.meetingSynthesisError);
  const draftBaselineSignature = useRecordStore(state => state.draftBaselineSignature);
  const lastSaveFeedback = useRecordStore(state => state.lastSaveFeedback);
  const saveDraft = useRecordStore(state => state.saveDraft);
  const showActionDialog = useDialogStore(state => state.showActionDialog);

  const isDirty = React.useMemo(() => {
    if (!draft) return false;
    if (isMeetingMode && draft.type === 'meeting') {
      return getMeetingRecordActionState({
        draft,
        activeWorkspaceId,
        activeBoardId,
        saving,
        meetingSynthesisStatus,
        meetingSynthesisError,
        meetingActivityCount: meetingActivities.length,
        draftBaselineSignature,
        lastSaveFeedback,
      }).isDirty;
    }
    return getRecordDraftSignature(draft) !== draftBaselineSignature;
  }, [
    activeBoardId,
    activeWorkspaceId,
    draft,
    draftBaselineSignature,
    isMeetingMode,
    lastSaveFeedback,
    meetingActivities.length,
    meetingSynthesisError,
    meetingSynthesisStatus,
    saving,
  ]);

  return React.useCallback(async (action: () => void | Promise<void>, options: GuardOptions = {}) => {
    if (!draft || !isDirty) {
      await action();
      return true;
    }

    const choice = await showActionDialog({
      title: options.title ?? '目前紀錄有未儲存變更',
      message: options.message ?? '繼續操作會離開或替換目前草稿。你可以先存草稿，或不儲存新變更後繼續。',
      actions: [
        {
          id: 'save_and_continue',
          label: '存草稿後繼續',
          description: '保存目前內容為草稿，不會發布。',
          variant: 'primary',
        },
        {
          id: 'continue_without_saving',
          label: '不儲存，繼續',
          description: '不保存新變更；既有已保存草稿不會被刪除。',
          variant: 'danger',
        },
        {
          id: 'cancel',
          label: '取消',
          variant: 'secondary',
        },
      ],
    });

    if (choice === 'save_and_continue') {
      const saved = await saveDraft({ nodes });
      if (!saved) return false;
      await action();
      return true;
    }

    if (choice === 'continue_without_saving') {
      await action();
      return true;
    }

    return false;
  }, [draft, isDirty, nodes, saveDraft, showActionDialog]);
};
