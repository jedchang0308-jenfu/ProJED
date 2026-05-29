import { create } from 'zustand';
import type { BoardMember, CurrentBoardAccess, WorkspaceMember } from '../types';
import { memberService } from '../services/dataBackend';
import useAuthStore from './useAuthStore';

interface MemberState {
  workspaceMembers: WorkspaceMember[];
  boardMembers: BoardMember[];
  currentBoardAccess: CurrentBoardAccess | null;
  loading: boolean;
  error: string | null;
}

interface MemberActions {
  clearMembers: () => void;
  loadMembers: (workspaceId: string | null | undefined, boardId: string | null | undefined) => Promise<void>;
  inviteBoardMember: (workspaceId: string, boardId: string, userId: string, role: BoardMember['role']) => Promise<void>;
  removeBoardMember: (workspaceId: string, boardId: string, userId: string) => Promise<void>;
}

type MemberStore = MemberState & MemberActions;

export const useMemberStore = create<MemberStore>((set, get) => ({
  workspaceMembers: [],
  boardMembers: [],
  currentBoardAccess: null,
  loading: false,
  error: null,

  clearMembers: () => set({
    workspaceMembers: [],
    boardMembers: [],
    currentBoardAccess: null,
    loading: false,
    error: null,
  }),

  loadMembers: async (workspaceId, boardId) => {
    if (!workspaceId) {
      set({
        workspaceMembers: [],
        boardMembers: [],
        currentBoardAccess: null,
        loading: false,
        error: null,
      });
      return;
    }

    set({ loading: true, error: null });
    try {
      const workspaceMembers = await memberService.listWorkspaceMembers(workspaceId);
      const boardMembers = boardId
        ? await memberService.listBoardMembers(workspaceId, boardId)
        : [];
      const currentUserId = useAuthStore.getState().user?.uid;
      const currentBoardAccess = boardId && currentUserId
        ? await memberService.getCurrentBoardAccess(workspaceId, boardId, currentUserId)
        : null;

      set({
        workspaceMembers,
        boardMembers,
        currentBoardAccess,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('[useMemberStore] loadMembers failed:', error);
      set({
        workspaceMembers: [],
        boardMembers: [],
        currentBoardAccess: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
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
}));
