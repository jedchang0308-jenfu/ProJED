import { create } from 'zustand';
import { queryProjectKnowledge, RagRetrievalError } from '../services/rag/ragRetrievalService';
import type { RagCitation } from '../services/rag/ragContract';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: {
    chunkId: string;
    citation: RagCitation;
  }[];
}

interface RagState {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  chatHistory: ChatMessage[];
  generationModel: string;

  togglePanel: () => void;
  setIsOpen: (isOpen: boolean) => void;
  setGenerationModel: (model: string) => void;
  clearHistory: () => void;
  submitQuery: (query: string, tenantId: string, projectId: string | null) => Promise<void>;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const useRagStore = create<RagState>((set, get) => ({
  isOpen: false,
  isLoading: false,
  error: null,
  chatHistory: [],
  generationModel: 'gemini-3.1-flash-lite',

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
  setIsOpen: (isOpen) => set({ isOpen }),
  setGenerationModel: (model) => set({ generationModel: model }),
  clearHistory: () => set({ chatHistory: [], error: null }),

  submitQuery: async (query: string, tenantId: string, projectId: string | null) => {
    if (!query.trim()) return;

    const userMsgId = generateId();
    const newChatHistory = [
      ...get().chatHistory,
      { id: userMsgId, role: 'user' as const, content: query }
    ];

    set({
      chatHistory: newChatHistory,
      isLoading: true,
      error: null
    });

    try {
      const { generationModel } = get();
      const response = await queryProjectKnowledge({
        tenantId,
        projectId,
        query,
        generationModel,
        matchThreshold: 0.35,
        matchCount: 10
      });

      const citations = response.chunks.map(c => ({
        chunkId: c.chunkId,
        citation: c.citation
      }));

      set((state) => ({
        chatHistory: [
          ...state.chatHistory,
          {
            id: generateId(),
            role: 'assistant',
            content: response.answer,
            citations: citations.length > 0 ? citations : undefined
          }
        ],
        isLoading: false
      }));
    } catch (err) {
      console.error('RAG Error:', err);
      let errorMessage = '知識檢索失敗，請稍後再試。';

      if (err instanceof RagRetrievalError) {
        if (err.status === 429) {
          errorMessage = 'AI 查詢額度已達上限，請稍後再試。';
        } else if (err.status === 401 || err.status === 403) {
          errorMessage = '你沒有權限查詢這個專案知識庫，請確認登入狀態。';
        } else {
          errorMessage = err.message || errorMessage;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      set({
        error: errorMessage,
        isLoading: false
      });
    }
  }
}));

export default useRagStore;
