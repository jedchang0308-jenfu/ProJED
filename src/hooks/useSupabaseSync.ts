import { useEffect, useMemo } from 'react';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { isSupabaseConfigured, supabase } from '../services/supabase/client';
import {
  resolveProjectId,
  resolveWorkspaceId,
  supabaseDependencyService,
  supabaseNodeService,
  supabaseWorkspaceService,
} from '../services/supabase/projedService';
import { createCoalescedAsyncRefresh } from '../utils/coalescedAsyncRefresh';

const isRealtimeFailure = (status: string) =>
  status === 'CHANNEL_ERROR' || status === 'TIMED_OUT';

export function useSupabaseSync(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const user = useAuthStore(s => s.user);
  const userId = user?.uid;
  const activeBoardId = useBoardStore(s => s.activeBoardId);
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  const workspaces = useBoardStore(s => s.workspaces);

  const workspaceIds = useMemo(
    () => workspaces.map(ws => ws.id).join(','),
    [workspaces]
  );

  const activeWorkspace = useMemo(
    () => workspaces.find(ws => ws.boards.some(board => board.id === activeBoardId)),
    [workspaces, activeBoardId]
  );
  const resolvedActiveWorkspaceId = activeWorkspace?.id ?? activeWorkspaceId;
  const activeBoardExists = useMemo(
    () => workspaces.some(ws => ws.boards.some(board => board.id === activeBoardId)),
    [workspaces, activeBoardId]
  );

  // ── Effect 1: Load workspaces ──────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    if (!isSupabaseConfigured) {
      console.warn('[useSupabaseSync] Supabase backend selected but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.');
      useBoardStore.setState({ workspaces: [] });
      return;
    }

    if (!userId) {
      useBoardStore.setState({ workspaces: [] });
      useWbsStore.setState({ nodes: {}, dependencies: [] });
      return;
    }

    let cancelled = false;
    const loadWorkspaces = async () => {
      const nextWorkspaces = await supabaseWorkspaceService.list();
      if (cancelled) return;

      const boardStore = useBoardStore.getState();
      const storedWsId = boardStore.activeWorkspaceId;
      const storedBoardId = boardStore.activeBoardId;

      // Preserve the stored active workspace if it still exists
      const matchedWorkspace = nextWorkspaces.find(ws => ws.id === storedWsId);
      const nextActiveWorkspaceId = matchedWorkspace
        ? storedWsId
        : nextWorkspaces[0]?.id ?? null;

      // Preserve the stored active board if it still exists in any workspace
      const boardExists = nextWorkspaces.some(ws =>
        ws.boards.some(board => board.id === storedBoardId)
      );
      const nextActiveBoardId = boardExists ? storedBoardId : null;

      useBoardStore.setState({
        workspaces: nextWorkspaces,
        activeWorkspaceId: nextActiveWorkspaceId,
        activeBoardId: nextActiveBoardId,
      });
    };

    const workspaceRefresh = createCoalescedAsyncRefresh(loadWorkspaces, {
      onError: error => console.error('[useSupabaseSync] Workspace load error:', error),
    });
    workspaceRefresh.request({ immediate: true });

    const channel = supabase
      .channel('projed-workspaces-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants' }, () => workspaceRefresh.request())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => workspaceRefresh.request())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_members' }, () => workspaceRefresh.request())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => workspaceRefresh.request())
      .subscribe((status, error) => {
        // A read after SUBSCRIBED closes the initial load/subscription race window.
        if (status === 'SUBSCRIBED') workspaceRefresh.request({ immediate: true });
        if (isRealtimeFailure(status)) {
          console.error('[useSupabaseSync] Workspace realtime channel error:', error ?? status);
        }
      });

    const refreshVisibleWorkspaces = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        workspaceRefresh.request({ immediate: true });
      }
    };
    window.addEventListener('online', refreshVisibleWorkspaces);
    document.addEventListener('visibilitychange', refreshVisibleWorkspaces);

    return () => {
      cancelled = true;
      workspaceRefresh.cancel();
      window.removeEventListener('online', refreshVisibleWorkspaces);
      document.removeEventListener('visibilitychange', refreshVisibleWorkspaces);
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);

  // ── Effect 2: Load board data (nodes + dependencies) ───────────────
  useEffect(() => {
    if (!enabled) return;
    if (!isSupabaseConfigured || !userId || !activeBoardId) {
      useWbsStore.setState({ loading: false, error: null });
      return;
    }
    if (workspaces.length === 0 || !activeBoardExists) return;
    if (!resolvedActiveWorkspaceId) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    useWbsStore.setState({ loading: true, error: null });
    const loadBoardData = async () => {
      const [nodes, dependencies] = await Promise.all([
        supabaseNodeService.listByProject(resolvedActiveWorkspaceId, activeBoardId),
        supabaseDependencyService.listByProject(resolvedActiveWorkspaceId, activeBoardId),
      ]);
      if (cancelled) return;
      useWbsStore.getState().setNodes(nodes, {
        scopeBoardIds: [activeBoardId],
        preserveOutOfScope: true,
      });
      useWbsStore.setState({ dependencies, loading: false, error: null });
    };

    const boardRefresh = createCoalescedAsyncRefresh(loadBoardData, {
      onError: error => {
        console.error('[useSupabaseSync] Board load error:', error);
        if (!cancelled && useBoardStore.getState().activeBoardId === activeBoardId) {
          useWbsStore.setState({
            loading: false,
            error: error instanceof Error ? error.message : '任務載入失敗',
          });
        }
      },
    });

    const subscribeBoardChanges = async () => {
      try {
        const tenantId = await resolveWorkspaceId(resolvedActiveWorkspaceId);
        const projectId = await resolveProjectId(tenantId, activeBoardId);
        if (cancelled) return;

        channel = supabase
          .channel(`projed-board-${projectId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'wbs_items',
              filter: `project_id=eq.${projectId}`,
            },
            () => boardRefresh.request()
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'wbs_dependencies',
              filter: `project_id=eq.${projectId}`,
            },
            () => boardRefresh.request()
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'wbs_item_tags',
              filter: `project_id=eq.${projectId}`,
            },
            () => boardRefresh.request()
          )
          // Postgres Changes cannot reliably filter DELETE payloads. Rare hard
          // deletes therefore trigger one bounded active-board consistency read.
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'wbs_items' }, () => boardRefresh.request())
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'wbs_dependencies' }, () => boardRefresh.request())
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'wbs_item_tags' }, () => boardRefresh.request())
          .subscribe((status, error) => {
            // Refreshing only after the channel is live prevents a change made
            // between the initial REST read and subscription from being missed.
            if (status === 'SUBSCRIBED') boardRefresh.request({ immediate: true });
            if (isRealtimeFailure(status)) {
              console.error('[useSupabaseSync] Board realtime channel error:', error ?? status);
            }
          });
      } catch (error) {
        console.error('[useSupabaseSync] Board subscription error:', error);
      }
    };

    boardRefresh.request({ immediate: true });
    void subscribeBoardChanges();

    const refreshVisibleBoard = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        boardRefresh.request({ immediate: true });
      }
    };
    window.addEventListener('online', refreshVisibleBoard);
    document.addEventListener('visibilitychange', refreshVisibleBoard);

    return () => {
      cancelled = true;
      boardRefresh.cancel();
      window.removeEventListener('online', refreshVisibleBoard);
      document.removeEventListener('visibilitychange', refreshVisibleBoard);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, userId, activeBoardId, activeBoardExists, resolvedActiveWorkspaceId, workspaceIds, workspaces.length]);
}
