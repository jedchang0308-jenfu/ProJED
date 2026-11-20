import useAuthStore from '../../store/useAuthStore';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore, { createRecordScopeKey } from '../../store/useRecordStore';
import useUndoStore from '../../store/useUndoStore';
import { useMemberStore } from '../../store/useMemberStore';
import { filterReadIdentity } from '../../features/taskFilters/optionSource';
import { getRecordDraftSignature } from '../../utils/meetingRecordWorkflow';
import { checkpointRecordSession, isRecordSessionLogout } from '../recordSessionProtection';
import type { MeetingDraftRecoverySnapshot } from '../../types';

type RecordState = ReturnType<typeof useRecordStore.getState>;
type ParkedEditor = {
  accountId: string;
  draft: RecordState['draft'];
  baseline: string | null;
  contentCursorOffset: number | null;
  wasSaved: boolean;
  snapshot: MeetingDraftRecoverySnapshot | null;
};
// A passive loss of Session must not turn an unsaved work log into another
// account's editor. This memory lasts only in this tab, not across reloads.
const parkedEditors = new Map<string, ParkedEditor>();
const key = (accountId: string, workspaceId: string, boardId: string) => JSON.stringify([accountId, workspaceId, boardId]);

export function protectRecordEditorOnIdentityChange(accountId: string | null, identity: string | null): boolean {
  const explicitLogout = Boolean(accountId && isRecordSessionLogout(accountId));
  // AuthGate unmounts on logout's loading=true, before user becomes null.
  if (!explicitLogout && filterReadIdentity(useAuthStore.getState().user) === identity) return false;
  const state = useRecordStore.getState();
  const { activeWorkspaceId: workspaceId, activeBoardId: boardId } = useBoardStore.getState();
  if (accountId && explicitLogout) {
    for (const [scope, editor] of parkedEditors) if (editor.accountId === accountId) parkedEditors.delete(scope);
  } else if (accountId && identity && workspaceId && boardId) {
    const dirty = state.draft && (getRecordDraftSignature(state.draft) !== state.draftBaselineSignature || state.saving || state.meetingActivities.length > 0);
    const protection = dirty ? checkpointRecordSession({ accountId, identity, workspaceId, boardId }) : null;
    const pending = state.meetingDraftRecovery.pendingSnapshot;
    const snapshot = protection?.snapshot ?? (pending?.ownerUserId === accountId && pending.workspaceId === workspaceId && pending.boardId === boardId ? pending : null);
    if (dirty || snapshot) parkedEditors.set(key(accountId, workspaceId, boardId), {
      accountId,
      draft: dirty ? structuredClone(state.draft) : null,
      baseline: state.draftBaselineSignature,
      contentCursorOffset: state.contentCursorOffset,
      wasSaved: Boolean(state.draft?.id && state.records.some(record => record.id === state.draft?.id)),
      snapshot: snapshot ? structuredClone(snapshot) : null,
    });
  }
  // Invalidate requests before removing every published editor/recovery field.
  state.resetRecordList();
  useRecordStore.setState({ ...useRecordStore.getInitialState(),
    draftEditorSession: state.draftEditorSession + 1,
    meetingProjectImportRequestId: state.meetingProjectImportRequestId + 1,
    meetingDraftRecoveryClearToken: state.meetingDraftRecoveryClearToken,
  }, true);
  useUndoStore.getState().clear();
  return true;
}

/** Restore only after fresh, scoped server reads confirm this owner's access. */
export function restoreParkedRecordEditor(): boolean {
  const accountId = useAuthStore.getState().user?.uid;
  const { activeWorkspaceId: workspaceId, activeBoardId: boardId } = useBoardStore.getState();
  if (!accountId || !workspaceId || !boardId || isRecordSessionLogout(accountId)) return false;
  const state = useRecordStore.getState();
  const access = useMemberStore.getState().currentBoardAccess;
  if (state.draft || state.recordListLoad.status !== 'ready' || state.recordListLoad.scopeKey !== createRecordScopeKey(workspaceId, boardId)
      || access?.workspaceId !== workspaceId || access.boardId !== boardId || !access.capabilities.includes('read_board')) return false;
  const scope = key(accountId, workspaceId, boardId);
  const editor = parkedEditors.get(scope);
  if (!editor || (editor.wasSaved && !state.records.some(record => record.id === editor.draft?.id))) return false;
  if (editor.snapshot) {
    state.setMeetingDraftRecovery({ pendingSnapshot: editor.snapshot });
  } else if (editor.draft) {
    useRecordStore.setState({ draft: structuredClone(editor.draft), draftBaselineSignature: editor.baseline,
      contentCursorOffset: editor.contentCursorOffset, draftEditorSession: state.draftEditorSession + 1,
      isPanelOpen: true, isPanelCollapsed: false, isMeetingMode: false, meetingTaskCaptureEnabled: false });
  }
  parkedEditors.delete(scope);
  return true;
}
