import { useEffect, useLayoutEffect, useRef } from 'react';

import { httpApiClient, httpCollaborationService, httpDomainReadService } from '../services/httpApi/backend';
import { HttpApiError } from '../services/httpApi/httpApiClient';
import {
  createRevisionSnapshot,
  decideRevisionRefresh,
  type RevisionSnapshot,
} from '../services/httpApi/revisionSync';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import { useMemberStore } from '../store/useMemberStore';
import useRecordStore from '../store/useRecordStore';
import { useTagStore } from '../store/useTagStore';
import { useWbsStore } from '../store/useWbsStore';
import { createCoalescedAsyncRefresh } from '../utils/coalescedAsyncRefresh';
import { filterReadIdentity } from '../features/taskFilters/optionSource';
import { protectRecordEditorOnIdentityChange, restoreParkedRecordEditor } from '../services/httpApi/recordSessionBoundary';
import { cancelRecordSessionLogout } from '../services/recordSessionProtection';

const ACTIVE_POLL_INTERVAL_MS = 5_000;

function handleReadError(error: unknown) {
  const user = useAuthStore.getState().user;
  if (error instanceof HttpApiError && user && 'authContextId' in user && typeof user.authContextId === 'string'
    && ((error.status === 401 && error.code === 'ACTOR_INVALID')
      || (error.status === 409 && error.code === 'ACTOR_CHANGED' && error.requestId !== null))) {
    // A local rejection of a late request has no server request ID.
    if (httpApiClient.clearExpectedActor({ accountId: user.uid, contextId: user.authContextId })) {
      useAuthStore.setState({ user: null, loading: false, error: null });
    }
    return;
  }
  console.error('[useHttpSync] Failed to refresh current scope:', error);
  const message = error instanceof HttpApiError && error.status === 429
    ? '請求暫時過多，請重新載入看板。'
    : error instanceof Error ? error.message : 'HTTP 同步失敗';
  useWbsStore.setState({ loading: false, error: message });
}

function clearPublishedReads(preserveSelection: boolean) {
  useBoardStore.setState({ workspaces: [], selectedTaskId: null,
    ...(!preserveSelection && { activeWorkspaceId: null, activeBoardId: null }) });
  useWbsStore.setState({ nodes: {}, dependencies: [], boardNodesIndex: {}, parentNodesIndex: {}, loadedBoardIds: [],
    trackingReferences: [], stagedTrackingReferences: [], kanbanConfigs: {}, pendingPlacementNodeIds: {}, loading: false, error: null });
  useMemberStore.getState().clearMembers();
  useTagStore.getState().setTags([], null);
  useRecordStore.getState().resetRecordList();
}

async function refreshWorkspaceIndex(isCurrent: () => boolean) {
  const workspaces = await httpDomainReadService.listWorkspaces();
  if (!isCurrent()) return;
  const current = useBoardStore.getState();
  const activeWorkspaceId = workspaces.some(workspace => workspace.id === current.activeWorkspaceId)
    ? current.activeWorkspaceId
    : workspaces[0]?.id ?? null;
  const activeBoardId = workspaces.find(workspace => workspace.id === activeWorkspaceId)
    ?.boards.some(board => board.id === current.activeBoardId)
    ? current.activeBoardId
    : null;
  useBoardStore.setState({ workspaces, activeWorkspaceId, activeBoardId });
}

async function refreshActiveScope(isCurrent: () => boolean) {
  if (!isCurrent()) return;
  const { activeWorkspaceId, activeBoardId, workspaces } = useBoardStore.getState();
  if (!activeWorkspaceId) {
    useWbsStore.getState().setNodes([]);
    useWbsStore.setState({ dependencies: [], loading: false, error: null });
    useMemberStore.getState().clearMembers();
    useTagStore.getState().setTags([], null);
    useRecordStore.getState().resetRecordList();
    return;
  }
  const boardId = activeBoardId;

  const containsBoard = (index: typeof workspaces) =>
    index.some(workspace => workspace.id === activeWorkspaceId
      && workspace.boards.some(board => board.id === boardId));
  const boardExists = boardId !== null && containsBoard(workspaces);
  const sameScope = () => {
    const current = useBoardStore.getState();
    // On startup the saved IDs can precede the workspace index. A read begun
    // against that empty index must not clear a newer, populated board.
    return isCurrent() && current.activeWorkspaceId === activeWorkspaceId && current.activeBoardId === boardId
      && containsBoard(current.workspaces) === boardExists;
  };
  const tasksAndDependencies = boardExists
    ? Promise.all([
      httpDomainReadService.listTasks(activeWorkspaceId, boardId),
      httpDomainReadService.listDependencies(activeWorkspaceId, boardId),
    ])
    : Promise.resolve(null);

  if (boardExists) useWbsStore.setState({ loading: true, error: null });
  // These stores own their loading/error states. A missed auxiliary read must
  // not prevent an authorized task snapshot from rendering.
  void Promise.all([
    useMemberStore.getState().loadMembers(activeWorkspaceId, boardId),
    useTagStore.getState().loadTags(activeWorkspaceId),
    boardExists ? useRecordStore.getState().loadRecords(activeWorkspaceId, boardId) : Promise.resolve(),
  ]).catch(error => console.error('[useHttpSync] Failed to refresh supporting data:', error));
  const boardData = await tasksAndDependencies.catch(error => {
    if (sameScope()) throw error;
    return null;
  });
  if (!sameScope()) return;
  if (!boardExists || !boardId || !boardData) {
    if (!boardExists) {
      useWbsStore.getState().setNodes([]);
      useWbsStore.setState({ dependencies: [], loading: false, error: null });
      useRecordStore.getState().resetRecordList();
    }
    return;
  }
  const [nodes, dependencies] = boardData;
  useWbsStore.getState().setNodes(nodes, { scopeBoardIds: [boardId], preserveOutOfScope: true });
  useWbsStore.setState({ dependencies, loading: false, error: null });
}

export function useHttpSync(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const identity = useAuthStore(state => filterReadIdentity(state.user));
  const readEpoch = useRef(0);
  const previousUserId = useRef<string | null>(null);
  const initialized = useRef(false);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const recordListLoad = useRecordStore(state => state.recordListLoad);
  const currentBoardAccess = useMemberStore(state => state.currentBoardAccess);

  useLayoutEffect(() => {
    if (!enabled) return;
    readEpoch.current += 1;
    const userId = useAuthStore.getState().user?.uid ?? null;
    if (userId && !useAuthStore.getState().loading) cancelRecordSessionLogout(userId);
    // Preserve a same-account reload location, never another account's data.
    clearPublishedReads(Boolean(userId && (!initialized.current || previousUserId.current === userId)));
    initialized.current = true;
    previousUserId.current = userId;
    return () => {
      readEpoch.current += 1;
      protectRecordEditorOnIdentityChange(userId, identity);
      clearPublishedReads(useAuthStore.getState().user?.uid === userId);
    };
  }, [enabled, identity]);

  useLayoutEffect(() => {
    if (enabled && identity && filterReadIdentity(useAuthStore.getState().user) === identity) restoreParkedRecordEditor();
  }, [enabled, identity, activeWorkspaceId, activeBoardId, recordListLoad, currentBoardAccess]);

  useEffect(() => {
    if (!enabled) return;
    if (!identity) return;

    let revisionSnapshot: RevisionSnapshot | null = null;
    let cancelled = false;
    const epoch = readEpoch.current;
    const isCurrent = () => !cancelled && epoch === readEpoch.current
      && filterReadIdentity(useAuthStore.getState().user) === identity;
    const poll = createCoalescedAsyncRefresh(async () => {
      const revisions = await httpCollaborationService.listResourceRevisions();
      if (!isCurrent()) return;
      const nextSnapshot = createRevisionSnapshot(revisions);
      const context = useBoardStore.getState();
      const decision = decideRevisionRefresh(
        revisionSnapshot,
        nextSnapshot,
        context.activeWorkspaceId,
        context.activeBoardId,
      );
      if (!decision.changed) return;
      if (decision.refreshWorkspaces) await refreshWorkspaceIndex(isCurrent);
      if (!isCurrent()) return;
      if (decision.refreshActiveScope) await refreshActiveScope(isCurrent);
      if (!isCurrent()) return;
      // A failed reload leaves the previous revision in place so the next poll
      // retries even when nobody has edited the board again.
      revisionSnapshot = nextSnapshot;
    }, {
      onError: error => {
        if (isCurrent()) handleReadError(error);
      },
    });

    const pollIfVisible = () => {
      if (document.visibilityState === 'visible') poll.request({ immediate: true });
    };
    poll.request({ immediate: true });
    const timer = window.setInterval(pollIfVisible, ACTIVE_POLL_INTERVAL_MS);
    window.addEventListener('focus', pollIfVisible);
    window.addEventListener('online', pollIfVisible);
    document.addEventListener('visibilitychange', pollIfVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      poll.cancel();
      window.removeEventListener('focus', pollIfVisible);
      window.removeEventListener('online', pollIfVisible);
      document.removeEventListener('visibilitychange', pollIfVisible);
    };
  }, [enabled, identity]);

  useEffect(() => {
    if (!enabled || !identity) return;
    let cancelled = false;
    const epoch = readEpoch.current;
    const isCurrent = () => !cancelled && epoch === readEpoch.current
      && filterReadIdentity(useAuthStore.getState().user) === identity;
    refreshActiveScope(isCurrent).catch(error => {
      if (isCurrent()) handleReadError(error);
    });
    return () => { cancelled = true; };
  }, [enabled, identity, activeWorkspaceId, activeBoardId]);
}
