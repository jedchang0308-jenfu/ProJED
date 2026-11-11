import { useEffect } from 'react';

import { httpCollaborationService, httpDomainReadService } from '../services/httpApi/backend';
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

const ACTIVE_POLL_INTERVAL_MS = 5_000;

async function refreshWorkspaceIndex() {
  const workspaces = await httpDomainReadService.listWorkspaces();
  const current = useBoardStore.getState();
  const activeWorkspaceId = workspaces.some(workspace => workspace.id === current.activeWorkspaceId)
    ? current.activeWorkspaceId
    : workspaces[0]?.id ?? null;
  const activeBoardId = workspaces.some(workspace => workspace.boards.some(board => board.id === current.activeBoardId))
    ? current.activeBoardId
    : null;
  useBoardStore.setState({ workspaces, activeWorkspaceId, activeBoardId });
}

async function refreshActiveScope() {
  const { activeWorkspaceId, activeBoardId, workspaces } = useBoardStore.getState();
  if (!activeWorkspaceId) {
    useWbsStore.setState({ nodes: {}, dependencies: [], loading: false, error: null });
    useMemberStore.getState().clearMembers();
    useTagStore.getState().setTags([], null);
    useRecordStore.getState().resetRecordList();
    return;
  }
  const boardId = activeBoardId;

  const boardExists = boardId !== null
    && workspaces.some(workspace => workspace.id === activeWorkspaceId
      && workspace.boards.some(board => board.id === boardId));
  const tasksAndDependencies = boardExists
    ? Promise.all([
      httpDomainReadService.listTasks(activeWorkspaceId, boardId),
      httpDomainReadService.listDependencies(activeWorkspaceId, boardId),
    ])
    : Promise.resolve(null);

  if (boardExists) useWbsStore.setState({ loading: true, error: null });
  await Promise.all([
    useMemberStore.getState().loadMembers(activeWorkspaceId, boardId),
    useTagStore.getState().loadTags(activeWorkspaceId),
    boardExists ? useRecordStore.getState().loadRecords(activeWorkspaceId, boardId) : Promise.resolve(),
  ]);
  const boardData = await tasksAndDependencies;
  if (!boardExists || !boardId || !boardData || useBoardStore.getState().activeBoardId !== boardId) {
    if (!boardExists) {
      useWbsStore.setState({ nodes: {}, dependencies: [], loading: false, error: null });
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
  const userId = useAuthStore(state => state.user?.uid);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);

  useEffect(() => {
    if (!enabled) return;
    if (!userId) {
      useBoardStore.setState({ workspaces: [], activeWorkspaceId: null, activeBoardId: null });
      useWbsStore.setState({ nodes: {}, dependencies: [], loading: false, error: null });
      useMemberStore.getState().clearMembers();
      useTagStore.getState().setTags([], null);
      useRecordStore.getState().resetRecordList();
      return;
    }

    let revisionSnapshot: RevisionSnapshot | null = null;
    let cancelled = false;
    const poll = createCoalescedAsyncRefresh(async () => {
      const revisions = await httpCollaborationService.listResourceRevisions();
      if (cancelled) return;
      const nextSnapshot = createRevisionSnapshot(revisions);
      const context = useBoardStore.getState();
      const decision = decideRevisionRefresh(
        revisionSnapshot,
        nextSnapshot,
        context.activeWorkspaceId,
        context.activeBoardId,
      );
      revisionSnapshot = nextSnapshot;
      if (!decision.changed) return;
      if (decision.refreshWorkspaces) await refreshWorkspaceIndex();
      if (decision.refreshActiveScope) await refreshActiveScope();
    }, {
      onError: error => {
        console.error('[useHttpSync] Poll or canonical reload failed:', error);
        if (!cancelled) {
          useWbsStore.setState({
            loading: false,
            error: error instanceof Error ? error.message : 'HTTP 同步失敗',
          });
        }
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
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    refreshActiveScope().catch(error => {
      console.error('[useHttpSync] Active scope load failed:', error);
      if (!cancelled) useWbsStore.setState({
        loading: false,
        error: error instanceof Error ? error.message : 'HTTP 看板載入失敗',
      });
    });
    return () => { cancelled = true; };
  }, [enabled, userId, activeWorkspaceId, activeBoardId]);
}
