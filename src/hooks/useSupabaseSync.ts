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
      try {
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
      } catch (error) {
        console.error('[useSupabaseSync] Workspace load error:', error);
      }
    };

    void loadWorkspaces();

    const channel = supabase
      .channel('projed-workspaces-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants' }, () => void loadWorkspaces())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => void loadWorkspaces())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_members' }, () => void loadWorkspaces())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => void loadWorkspaces())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);

  // ── Effect 2: Load board data (nodes + dependencies) ───────────────
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !userId || !activeBoardId) return;
    if (workspaces.length === 0 || !activeBoardExists) return;
    if (!resolvedActiveWorkspaceId) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const loadBoardData = async () => {
      try {
        const [nodes, dependencies] = await Promise.all([
          supabaseNodeService.listByProject(resolvedActiveWorkspaceId, activeBoardId),
          supabaseDependencyService.listByProject(resolvedActiveWorkspaceId, activeBoardId),
        ]);
        if (cancelled) return;
        useWbsStore.getState().setNodes(nodes, {
          scopeBoardIds: [activeBoardId],
          preserveOutOfScope: true,
        });
        useWbsStore.setState({ dependencies });
      } catch (error) {
        console.error('[useSupabaseSync] Board load error:', error);
      }
    };

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
            () => void loadBoardData()
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'wbs_dependencies',
              filter: `project_id=eq.${projectId}`,
            },
            () => void loadBoardData()
          )
          .subscribe();
      } catch (error) {
        console.error('[useSupabaseSync] Board subscription error:', error);
      }
    };

    void loadBoardData();
    void subscribeBoardChanges();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, userId, activeBoardId, activeBoardExists, resolvedActiveWorkspaceId, workspaceIds, workspaces.length]);
}
