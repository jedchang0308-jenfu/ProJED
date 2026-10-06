import * as React from 'react';
import { recordService } from '../services/dataBackend';
import useBoardStore from '../store/useBoardStore';
import useRecordStore from '../store/useRecordStore';
import type { TaskNode } from '../types';
import {
  resolveTaskMeetingRecordCapability,
  taskMeetingRecordAvailabilityMessage,
  taskMeetingRecordScopeKey,
} from '../utils/taskMeetingRecordCapability';
import {
  getMeetingTaskQuickNotes,
  parseMeetingTaskQuickNotesMetadata,
  projectMeetingTaskQuickNotes,
  type MeetingTaskQuickNoteProjection,
} from '../utils/meetingTaskQuickNotes';

type TaskMeetingQuickNoteNode = Pick<TaskNode, 'id' | 'workspaceId' | 'boardId'>;

export const useTaskMeetingQuickNotes = (
  node: TaskMeetingQuickNoteNode | null | undefined,
  activeMeetingBoardId: string | null | undefined,
) => {
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const records = useRecordStore(state => state.records);
  const draft = useRecordStore(state => state.draft);
  const [remoteRecords, setRemoteRecords] = React.useState<typeof records>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const loadGenerationRef = React.useRef(0);

  const capability = React.useMemo(
    () => resolveTaskMeetingRecordCapability(node, activeMeetingBoardId),
    [activeMeetingBoardId, node?.boardId, node?.id, node?.workspaceId],
  );
  const readCapability = capability.read;
  const appendCapability = capability.append;
  const scopeKey = taskMeetingRecordScopeKey(readCapability);

  const recordsFingerprint = records
    .filter(record => readCapability.status === 'supported'
      && record.workspaceId === readCapability.workspaceId
      && record.boardId === readCapability.boardId)
    .map(record => `${record.id}:${record.updatedAt ?? 0}:${record.status}`)
    .join('|');
  const draftFingerprint = draft?.type === 'meeting'
    && readCapability.status === 'supported'
    && activeWorkspaceId === readCapability.workspaceId
    && activeBoardId === readCapability.boardId
    ? `${draft.id ?? 'new'}:${draft.content.length}:${JSON.stringify(getMeetingTaskQuickNotes(draft.metadata)?.entries ?? [])}`
    : '';

  const refresh = React.useCallback(async () => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;

    if (readCapability.status !== 'supported') {
      setRemoteRecords([]);
      setLoading(false);
      setLoadError(false);
      return;
    }

    setLoading(true);
    setLoadError(false);
    try {
      const loaded = await recordService.listByNode(
        readCapability.workspaceId,
        readCapability.boardId,
        readCapability.taskId,
        { includeArchived: true },
      );
      if (loadGenerationRef.current !== generation) return;
      setRemoteRecords(loaded);
    } catch (error) {
      if (loadGenerationRef.current !== generation) return;
      console.warn('[taskMeetingQuickNotes] Failed to load meeting records:', error);
      setRemoteRecords([]);
      setLoadError(true);
    } finally {
      if (loadGenerationRef.current === generation) setLoading(false);
    }
  }, [readCapability, scopeKey]);

  React.useEffect(() => {
    void refresh();
  }, [draftFingerprint, recordsFingerprint, refresh]);

  const sourceRecords = React.useMemo(() => {
    if (readCapability.status !== 'supported') return [];

    const byId = new Map<string, typeof records[number]>();
    records
      .filter(record => (
        record.workspaceId === readCapability.workspaceId
        && record.boardId === readCapability.boardId
      ))
      .forEach(record => byId.set(record.id, record));
    remoteRecords.forEach(record => byId.set(record.id, record));

    if (
      draft?.type === 'meeting'
      && draft.id
      && activeWorkspaceId === readCapability.workspaceId
      && activeBoardId === readCapability.boardId
    ) {
      byId.set(draft.id, {
        ...draft,
        taskLinks: draft.taskLinks.map(link => ({
          nodeId: link.nodeId,
          role: link.role,
          recordId: draft.id as string,
          workspaceId: readCapability.workspaceId,
          boardId: readCapability.boardId,
        })),
      } as typeof records[number]);
    }
    return Array.from(byId.values());
  }, [activeBoardId, activeWorkspaceId, draft, readCapability, records, remoteRecords]);

  const invalidRecordIds = React.useMemo(() => sourceRecords
    .filter(record => parseMeetingTaskQuickNotesMetadata(record.metadata).status === 'invalid')
    .map(record => record.id), [sourceRecords]);

  const entries = React.useMemo<MeetingTaskQuickNoteProjection[]>(() => (
    readCapability.status === 'supported' && node?.id
      ? projectMeetingTaskQuickNotes(sourceRecords, node.id)
      : []
  ), [node?.id, readCapability.status, sourceRecords]);

  const activeDraftInvalid = draft?.type === 'meeting'
    && readCapability.status === 'supported'
    && activeWorkspaceId === readCapability.workspaceId
    && activeBoardId === readCapability.boardId
    && parseMeetingTaskQuickNotesMetadata(draft.metadata).status === 'invalid';
  const activeSourceInvalid = sourceRecords.some(record => (
    record.status !== 'archived' && parseMeetingTaskQuickNotesMetadata(record.metadata).status === 'invalid'
  ));

  return {
    entries,
    loading,
    error: loadError
      ? '會議紀錄載入失敗'
      : (activeDraftInvalid ? '目前草稿的會議補記資料無法辨識，請先復原或重新開啟。' : null)
        ?? (invalidRecordIds.length > 0 ? '部分會議紀錄的補記資料無法辨識，已隔離未顯示。' : null),
    availabilityMessage: taskMeetingRecordAvailabilityMessage(appendCapability),
    composerAvailable: appendCapability.status === 'supported',
    composerBlocked: appendCapability.status !== 'supported' || activeDraftInvalid || activeSourceInvalid,
    invalidRecordIds,
    refresh,
  };
};
