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
import type { Dependency } from '../types';

const ACTIVE_POLL_INTERVAL_MS = 5_000;

type BoardSnapshots = Map<string, { workspaceId: string; dependencies: Dependency[] }>;

function getBoardSnapshot(snapshots: BoardSnapshots, workspaceId: string | null, boardId: string | null) {
  if (!boardId || !useWbsStore.getState().loadedBoardIds.includes(boardId)) return undefined;
  const snapshot = snapshots.get(boardId);
  return snapshot?.workspaceId === workspaceId ? snapshot : undefined;
}

function discardBoardSnapshots(snapshots: BoardSnapshots, boardIds: Set<string>) {
  if (boardIds.size === 0) return;
  for (const boardId of boardIds) snapshots.delete(boardId);
  const wbs = useWbsStore.getState();
  wbs.setNodes(Object.values(wbs.nodes).filter(node => !boardIds.has(node.boardId)), {
    scopeBoardIds: wbs.loadedBoardIds.filter(boardId => !boardIds.has(boardId)),
  });
}

function handleReadError(error: unknown, snapshots: BoardSnapshots, boardRead: boolean) {
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
  const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
  const denied = error instanceof HttpApiError && (error.status === 401 || error.status === 403 || error.status === 404
    || (error.status === 409 && error.code === 'ACTOR_CHANGED'));
  if (denied) {
    discardBoardSnapshots(snapshots, boardRead && activeBoardId ? new Set([activeBoardId]) : new Set(snapshots.keys()));
    useWbsStore.setState({ dependencies: [] });
    useMemberStore.getState().clearMembers();
    useRecordStore.getState().resetRecordList();
  } else if (getBoardSnapshot(snapshots, activeWorkspaceId, activeBoardId)) {
    return;
  }
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

async function refreshWorkspaceIndex(isCurrent: () => boolean, snapshots: BoardSnapshots) {
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
  const removedBoardIds = new Set<string>();
  for (const [boardId, { workspaceId }] of snapshots) {
    if (!workspaces.some(workspace => workspace.id === workspaceId && workspace.boards.some(board => board.id === boardId))) {
      removedBoardIds.add(boardId);
    }
  }
  discardBoardSnapshots(snapshots, removedBoardIds);
  useBoardStore.setState({ workspaces, activeWorkspaceId, activeBoardId });
}

async function refreshActiveScope(isCurrent: () => boolean, snapshots: BoardSnapshots, selectingBoard = false) {
  if (!isCurrent()) return false;
  const { activeWorkspaceId, activeBoardId, workspaces } = useBoardStore.getState();
  if (!activeWorkspaceId) {
    snapshots.clear();
    useWbsStore.getState().setNodes([]);
    useWbsStore.setState({ dependencies: [], loading: false, error: null });
    useMemberStore.getState().clearMembers();
    useTagStore.getState().setTags([], null);
    useRecordStore.getState().resetRecordList();
    return true;
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
  const snapshot = boardExists ? getBoardSnapshot(snapshots, activeWorkspaceId, boardId) : undefined;
  if (selectingBoard) {
    useWbsStore.setState({ dependencies: snapshot?.dependencies ?? [], loading: Boolean(boardId && !snapshot), error: null });
  } else if (boardExists && !snapshot) {
    useWbsStore.setState({ loading: true, error: null });
  }

  const tasksAndDependencies = boardExists ? Promise.all([
    httpDomainReadService.listTasks(activeWorkspaceId, boardId),
    httpDomainReadService.listDependencies(activeWorkspaceId, boardId),
  ]) : null;
  // These stores own their loading/error states. A missed auxiliary read must
  // not prevent an authorized task snapshot from rendering.
  void Promise.all([
    useMemberStore.getState().loadMembers(activeWorkspaceId, boardId, { background: Boolean(snapshot) }),
    useTagStore.getState().loadTags(activeWorkspaceId),
    boardExists ? useRecordStore.getState().loadRecords(activeWorkspaceId, boardId, { background: Boolean(snapshot) }) : Promise.resolve(),
  ]).catch(error => console.error('[useHttpSync] Failed to refresh supporting data:', error));
  if (!boardId || !tasksAndDependencies) {
    if (!boardId) {
      snapshots.clear();
      useWbsStore.getState().setNodes([]);
      useWbsStore.setState({ dependencies: [], loading: false, error: null });
      useRecordStore.getState().resetRecordList();
    }
    return true;
  }
  try {
    const [nodes, dependencies] = await tasksAndDependencies;
    if (!sameScope()) return false;
    snapshots.set(boardId, { workspaceId: activeWorkspaceId, dependencies });
    useWbsStore.getState().setNodes(nodes, { scopeBoardIds: [boardId], preserveOutOfScope: true });
    useWbsStore.setState({ dependencies, loading: false, error: null });
    return true;
  } catch (error) {
    if (!sameScope()) return false;
    handleReadError(error, snapshots, true);
    return false;
  }
}

export function useHttpSync(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const identity = useAuthStore(state => filterReadIdentity(state.user));
  const readEpoch = useRef(0);
  const selectionEpoch = useRef(0);
  // The WBS store keeps scoped tasks. Remember which board reads also loaded
  // dependencies so a return visit never reuses another board's dependencies.
  const boardSnapshots = useRef<BoardSnapshots>(new Map());
  const retrySelection = useRef(false);
  const previousUserId = useRef<string | null>(null);
  const initialized = useRef(false);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const recordListLoad = useRecordStore(state => state.recordListLoad);
  const currentBoardAccess = useMemberStore(state => state.currentBoardAccess);

  useLayoutEffect(() => {
    if (!enabled) return;
    const snapshots = boardSnapshots.current;
    readEpoch.current += 1;
    const userId = useAuthStore.getState().user?.uid ?? null;
    if (userId && !useAuthStore.getState().loading) cancelRecordSessionLogout(userId);
    // Preserve a same-account reload location, never another account's data.
    clearPublishedReads(Boolean(userId && (!initialized.current || previousUserId.current === userId)));
    initialized.current = true;
    previousUserId.current = userId;
    return () => {
      readEpoch.current += 1;
      snapshots.clear();
      retrySelection.current = false;
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
      if (!decision.changed && !retrySelection.current) return;
      if (decision.refreshWorkspaces) await refreshWorkspaceIndex(isCurrent, boardSnapshots.current);
      if (!isCurrent()) return;
      if (decision.refreshActiveScope || retrySelection.current) {
        const selection = selectionEpoch.current;
        const isSameSelection = () => isCurrent() && selection === selectionEpoch.current;
        const refreshed = await refreshActiveScope(isSameSelection, boardSnapshots.current);
        if (!refreshed || !isSameSelection()) return;
        retrySelection.current = false;
      }
      if (!isCurrent()) return;
      // A failed reload leaves the previous revision in place so the next poll
      // retries even when nobody has edited the board again.
      revisionSnapshot = nextSnapshot;
    }, {
      onError: error => {
        if (isCurrent()) handleReadError(error, boardSnapshots.current, false);
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

  useLayoutEffect(() => {
    if (!enabled || !identity) return;
    const selection = ++selectionEpoch.current;
    retrySelection.current = false;
    const epoch = readEpoch.current;
    const isCurrent = () => selection === selectionEpoch.current && epoch === readEpoch.current
      && filterReadIdentity(useAuthStore.getState().user) === identity;
    void refreshActiveScope(isCurrent, boardSnapshots.current, true).then(refreshed => {
      if (isCurrent() && !refreshed) retrySelection.current = true;
    });
    return () => { selectionEpoch.current += 1; };
  }, [enabled, identity, activeWorkspaceId, activeBoardId]);
}
