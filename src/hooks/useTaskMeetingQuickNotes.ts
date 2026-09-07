import * as React from 'react';
import { recordService } from '../services/dataBackend';
import useBoardStore from '../store/useBoardStore';
import useRecordStore from '../store/useRecordStore';
import {
  getMeetingTaskQuickNotes,
  parseMeetingTaskQuickNotesMetadata,
  projectMeetingTaskQuickNotes,
  type MeetingTaskQuickNoteProjection,
} from '../utils/meetingTaskQuickNotes';

export const useTaskMeetingQuickNotes = (taskId: string) => {
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const records = useRecordStore(state => state.records);
  const draft = useRecordStore(state => state.draft);
  const [remoteRecords, setRemoteRecords] = React.useState<typeof records>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const recordsFingerprint = records
    .map(record => `${record.id}:${record.updatedAt ?? 0}:${record.status}`)
    .join('|');
  const draftFingerprint = draft?.type === 'meeting'
    ? `${draft.id ?? 'new'}:${draft.content.length}:${JSON.stringify(getMeetingTaskQuickNotes(draft.metadata)?.entries ?? [])}`
    : '';

  const refresh = React.useCallback(async () => {
    if (!activeWorkspaceId || !activeBoardId || !taskId) {
      setRemoteRecords([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await recordService.listByNode(activeWorkspaceId, activeBoardId, taskId, { includeArchived: true });
      setRemoteRecords(loaded);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeBoardId, activeWorkspaceId, taskId]);

  React.useEffect(() => {
    void refresh();
  }, [draftFingerprint, recordsFingerprint, refresh]);

  const sourceRecords = React.useMemo(() => {
    const byId = new Map<string, typeof records[number]>();
    [...records, ...remoteRecords].forEach(record => byId.set(record.id, record));
    if (draft?.type === 'meeting' && draft.id) {
      byId.set(draft.id, {
        ...draft,
        taskLinks: draft.taskLinks.map(link => ({
          nodeId: link.nodeId,
          role: link.role,
          recordId: draft.id as string,
          workspaceId: activeWorkspaceId ?? '',
          boardId: activeBoardId ?? '',
        })),
      } as typeof records[number]);
    }
    return Array.from(byId.values());
  }, [activeBoardId, activeWorkspaceId, draft, records, remoteRecords]);

  const invalidRecordIds = React.useMemo(() => sourceRecords
    .filter(record => parseMeetingTaskQuickNotesMetadata(record.metadata).status === 'invalid')
    .map(record => record.id), [sourceRecords]);

  const entries = React.useMemo<MeetingTaskQuickNoteProjection[]>(() => (
    projectMeetingTaskQuickNotes(sourceRecords, taskId)
  ), [sourceRecords, taskId]);

  const activeDraftInvalid = draft?.type === 'meeting'
    && parseMeetingTaskQuickNotesMetadata(draft.metadata).status === 'invalid';
  const activeSourceInvalid = sourceRecords.some(record => (
    record.status !== 'archived' && parseMeetingTaskQuickNotesMetadata(record.metadata).status === 'invalid'
  ));

  return {
    entries,
    loading,
    error: error
      ?? (activeDraftInvalid ? '目前草稿的會議補記資料無法辨識，請先復原或重新開啟。' : null)
      ?? (invalidRecordIds.length > 0 ? '部分會議紀錄的補記資料無法辨識，已隔離未顯示。' : null),
    composerBlocked: activeDraftInvalid || activeSourceInvalid,
    invalidRecordIds,
    refresh,
  };
};
