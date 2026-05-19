import { useEffect, useMemo } from 'react';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { isSupabaseConfigured, supabase } from '../services/supabase/client';
import {
  supabaseDependencyService,
  supabaseNodeService,
  supabaseWorkspaceService,
} from '../services/supabase/projedService';

export function useSupabaseSync(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const user = useAuthStore(s => s.user);
  const userId = user?.uid;
  const activeBoardId = useBoardStore(s => s.activeBoardId);
  const workspaces = useBoardStore(s => s.workspaces);

  const workspaceIds = useMemo(
    () => workspaces.map(ws => ws.id).join(','),
    [workspaces]
  );
const activeWorkspace = useMemo(
    () => workspaces.find(ws => ws.boards.some(board => board.id === activeBoardId)),
    [workspaces, activeBoardId]
  );
  const activeWorkspaceId = activeWorkspace?.id;

  const syncActiveSelection = (nextWorkspaces: typeof workspaces) => {
    const boardStore = useBoardStore.getState();
    const hasActiveWorkspace = nextWorkspaces.some(ws => ws.id === boardStore.activeWorkspaceId);
    const nextActiveWorkspaceId = hasActiveWorkspace
      ? boardStore.activeWorkspaceId
      : nextWorkspaces[0]?.id ?? null;

    const hasActiveBoard = nextWorkspaces.some(ws =>
      ws.boards.some(board => board.id === boardStore.activeBoardId)
    );
    const nextActiveBoardId = hasActiveBoard ? boardStore.activeBoardId : null;

    useBoardStore.setState({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextActiveWorkspaceId,
      activeBoardId: nextActiveBoardId,
    });
  };

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
      try {
        const nextWorkspaces = await supabaseWorkspaceService.list();
        if (!cancelled) syncActiveSelection(nextWorkspaces);
      } catch (error) {
        console.error('[useSupabaseSync] Workspace load error:', error);
      }
    };

    void loadWorkspaces();

    const channel = supabase
      .channel('projed-workspaces-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants' }, () => void loadWorkspaces())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => void loadWorkspaces())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !userId || !activeBoardId) return;
    if (!activeWorkspaceId) return;

    let cancelled = false;
    const loadBoardData = async () => {
      try {
        const [nodes, dependencies] = await Promise.all([
          supabaseNodeService.listByProject(activeWorkspaceId, activeBoardId),
          supabaseDependencyService.listByProject(activeWorkspaceId, activeBoardId),
        ]);
        if (cancelled) return;
        useWbsStore.getState().setNodes(nodes);
        useWbsStore.setState({ dependencies });
      } catch (error) {
        console.error('[useSupabaseSync] Board load error:', error);
      }
    };

    void loadBoardData();

    const channel = supabase
      .channel(`projed-board-${activeBoardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wbs_items',
          filter: `project_id=eq.${activeBoardId}`,
        },
        () => void loadBoardData()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wbs_dependencies',
          filter: `project_id=eq.${activeBoardId}`,
        },
        () => void loadBoardData()
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, activeBoardId, activeWorkspaceId, workspaceIds]);
}
