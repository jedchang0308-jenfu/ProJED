import { queryProjectKnowledge } from '../services/rag/ragRetrievalService';
import useAuthStore from './useAuthStore';
import useBoardStore from './useBoardStore';
import { createRagConversationStore } from './ragConversationStore';

export type { ChatMessage } from './ragConversationStore';

const useRagStore = createRagConversationStore({
  readScope: () => {
    const { user } = useAuthStore.getState();
    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    if (!user || !activeWorkspaceId) return null;
    const contextId = 'authContextId' in user && typeof user.authContextId === 'string' ? user.authContextId : null;
    return { accountId: user.uid, contextId, workspaceId: activeWorkspaceId, boardId: activeBoardId };
  },
  query: queryProjectKnowledge,
});

// Invalidate synchronously before another account/scope can render old content.
useAuthStore.subscribe(() => useRagStore.getState().syncScope());
useBoardStore.subscribe(() => useRagStore.getState().syncScope());

export default useRagStore;
