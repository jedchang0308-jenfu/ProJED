import { useEffect, useMemo } from 'react';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import { useMemberStore } from '../store/useMemberStore';
import { dataBackend } from '../services/dataBackend';
import { isSupabaseConfigured, supabase } from '../services/supabase/client';
import { PROFILE_UPDATED_EVENT, type ProfileUpdatedDetail } from '../utils/profileEvents';

export function useMemberSync() {
  const userId = useAuthStore(state => state.user?.uid);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const workspaces = useBoardStore(state => state.workspaces);
  const loadMembers = useMemberStore(state => state.loadMembers);
  const updateMemberProfile = useMemberStore(state => state.updateMemberProfile);
  const clearMembers = useMemberStore(state => state.clearMembers);

  const workspaceMemberKey = useMemo(
    () => workspaces
      .map(workspace => [
        workspace.id,
        workspace.ownerId || '',
        (workspace.members || []).join('|'),
        workspace.boards.map(board => board.id).join('|'),
      ].join(':'))
      .join(','),
    [workspaces]
  );

  useEffect(() => {
    if (!userId || !activeWorkspaceId) {
      clearMembers();
      return;
    }

    void loadMembers(activeWorkspaceId, activeBoardId);
  }, [userId, activeWorkspaceId, activeBoardId, workspaceMemberKey, clearMembers, loadMembers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail;
      if (!detail?.uid) return;
      updateMemberProfile(detail.uid, {
        email: detail.email,
        displayName: detail.displayName,
      });
    };

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
  }, [updateMemberProfile]);

  useEffect(() => {
    if (dataBackend !== 'supabase' || !isSupabaseConfigured || !userId || !activeWorkspaceId) return;

    const reload = () => {
      void loadMembers(activeWorkspaceId, activeBoardId);
    };

    const channel = supabase
      .channel(`projed-members-${activeWorkspaceId}-${activeBoardId || 'workspace'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_members' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_role_permissions' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, reload)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, activeWorkspaceId, activeBoardId, loadMembers]);
}
