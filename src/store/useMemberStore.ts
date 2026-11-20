import { create } from 'zustand';
import { createDefaultBoardRolePermissionMatrix, type BoardMember, type BoardRolePermissionMatrix, type CollaborationMemberProfile, type CurrentBoardAccess, type WorkspaceMember } from '../types';
import { isHttpBackend, memberService } from '../services/dataBackend';
import useAuthStore from './useAuthStore';
import useBoardStore from './useBoardStore';

interface MemberState {
  workspaceMembers: WorkspaceMember[];
  boardMembers: BoardMember[];
  boardRolePermissions: BoardRolePermissionMatrix;
  currentBoardAccess: CurrentBoardAccess | null;
  loading: boolean;
  error: string | null;
  loadedWorkspaceId: string | null;
  loadedBoardId: string | null;
}

interface MemberActions {
  clearMembers: () => void;
  updateMemberProfile: (userId: string, profile: Partial<CollaborationMemberProfile>) => void;
  loadMembers: (workspaceId: string | null | undefined, boardId: string | null | undefined) => Promise<void>;
  inviteBoardMember: (workspaceId: string, boardId: string, userId: string, role: BoardMember['role']) => Promise<void>;
  removeBoardMember: (workspaceId: string, boardId: string, userId: string) => Promise<void>;
  updateBoardRolePermissions: (workspaceId: string, boardId: string, permissions: BoardRolePermissionMatrix) => Promise<void>;
}

type MemberStore = MemberState & MemberActions;
let memberLoadGeneration = 0;

export const useMemberStore = create<MemberStore>((set, get) => ({
  workspaceMembers: [],
  boardMembers: [],
  boardRolePermissions: createDefaultBoardRolePermissionMatrix(),
  currentBoardAccess: null,
  loading: false,
  error: null,
  loadedWorkspaceId: null,
  loadedBoardId: null,

  clearMembers: () => {
    memberLoadGeneration++;
    set({
      workspaceMembers: [],
      boardMembers: [],
      boardRolePermissions: createDefaultBoardRolePermissionMatrix(),
      currentBoardAccess: null,
      loading: false,
      error: null,
      loadedWorkspaceId: null,
      loadedBoardId: null,
    });
  },

  updateMemberProfile: (userId, profile) => set(state => {
    const mergeProfile = (member: WorkspaceMember | BoardMember) => {
      if (member.userId !== userId) return member;
      return {
        ...member,
        profile: {
          id: userId,
          email: member.profile?.email ?? null,
          displayName: member.profile?.displayName ?? null,
          ...member.profile,
          ...profile,
        },
      };
    };

    return {
      workspaceMembers: state.workspaceMembers.map(mergeProfile) as WorkspaceMember[],
      boardMembers: state.boardMembers.map(mergeProfile) as BoardMember[],
    };
  }),

  loadMembers: async (workspaceId, boardId) => {
    const generation = ++memberLoadGeneration;
    if (!workspaceId) {
      set({
        workspaceMembers: [],
        boardMembers: [],
        boardRolePermissions: createDefaultBoardRolePermissionMatrix(),
        currentBoardAccess: null,
        loading: false,
        error: null,
        loadedWorkspaceId: null,
        loadedBoardId: null,
      });
      return;
    }

    set({ loading: true, error: null, currentBoardAccess: null, loadedWorkspaceId: null, loadedBoardId: null });
    try {
      const currentUserId = useAuthStore.getState().user?.uid;
      const currentBoardAccess = boardId && currentUserId
        ? await memberService.getCurrentBoardAccess(workspaceId, boardId, currentUserId)
        : null;
      const workspaceAccess = currentBoardAccess?.capabilities ??
        useBoardStore.getState().workspaces.find(workspace => workspace.id === workspaceId)?.sessionCapabilities;
      const workspaceMembers = !isHttpBackend || workspaceAccess?.includes('manage_workspace_members')
        ? await memberService.listWorkspaceMembers(workspaceId) : [];
      const boardMembers = boardId
        ? await memberService.listBoardMembers(workspaceId, boardId)
        : [];
      const boardRolePermissions = boardId
        ? await memberService.getBoardRolePermissions(workspaceId, boardId)
        : createDefaultBoardRolePermissionMatrix();
      if (generation !== memberLoadGeneration || currentUserId !== useAuthStore.getState().user?.uid) return;
      set({
        workspaceMembers,
        boardMembers,
        boardRolePermissions,
        currentBoardAccess,
        loading: false,
        error: null,
        loadedWorkspaceId: workspaceId,
        loadedBoardId: boardId || null,
      });
    } catch (error) {
      if (generation !== memberLoadGeneration) return;
      console.error('[useMemberStore] loadMembers failed:', error);
      set({
        workspaceMembers: [],
        boardMembers: [],
        boardRolePermissions: createDefaultBoardRolePermissionMatrix(),
        currentBoardAccess: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        loadedWorkspaceId: null,
        loadedBoardId: null,
      });
    }
  },

  inviteBoardMember: async (workspaceId, boardId, userId, role) => {
    set({ loading: true, error: null });
    try {
      await memberService.upsertBoardMember(workspaceId, boardId, userId, role);
      await get().loadMembers(workspaceId, boardId);
    } catch (error) {
      console.error('[useMemberStore] inviteBoardMember failed:', error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  removeBoardMember: async (workspaceId, boardId, userId) => {
    set({ loading: true, error: null });
    try {
      await memberService.removeBoardMember(workspaceId, boardId, userId);
      await get().loadMembers(workspaceId, boardId);
    } catch (error) {
      console.error('[useMemberStore] removeBoardMember failed:', error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  updateBoardRolePermissions: async (workspaceId, boardId, permissions) => {
    set({ loading: true, error: null });
    try {
      await memberService.updateBoardRolePermissions(workspaceId, boardId, permissions);
      await get().loadMembers(workspaceId, boardId);
    } catch (error) {
      console.error('[useMemberStore] updateBoardRolePermissions failed:', error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
}));
