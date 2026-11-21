import { create } from 'zustand';
import type { RagCitation, RagRetrievalRequest, RagRetrievalResponse } from '../services/rag/ragContract';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ chunkId: string; citation: RagCitation }>;
}

export interface RagConversationScope {
  accountId: string;
  contextId: string | null;
  workspaceId: string;
  boardId: string | null;
}

interface Conversation {
  error: string | null;
  queryDraft: string;
  chatHistory: ChatMessage[];
}

interface RagState extends Conversation {
  isOpen: boolean;
  isLoading: boolean;
  generationModel: string;
  syncScope: () => void;
  togglePanel: () => void;
  setIsOpen: (isOpen: boolean) => void;
  setQueryDraft: (query: string) => void;
  setGenerationModel: (model: string) => void;
  clearHistory: () => void;
  submitQuery: (query: string, tenantId: string, projectId: string | null) => Promise<void>;
}

const emptyConversation = (): Conversation => ({ error: null, queryDraft: '', chatHistory: [] });
const scopeKey = (scope: RagConversationScope | null) => scope === null ? null
  : JSON.stringify([scope.accountId, scope.contextId, scope.workspaceId, scope.boardId]);

function failureMessage(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? error.code : null;
  const status = error instanceof Error && 'status' in error ? error.status : null;
  if (code === 'RAG_PROVIDER_UNAVAILABLE' || code === 'RAG_MODEL_UNAVAILABLE') {
    return '智慧助理目前尚未開放查詢，問題已保留。';
  }
  if (status === 429) return 'AI 查詢額度已達上限，問題已保留。';
  if (status === 401 || status === 403 || status === 404) return '目前無法查詢這個專案，請確認登入狀態與存取權限。';
  if (status === 504 || code === 'RAG_TIMEOUT') return '知識檢索逾時，問題已保留，請稍後重試或縮小查詢範圍。';
  return '知識檢索暫時無法完成，問題已保留。';
}

/** Each conversation belongs to an exact Session/workspace/board. Nothing is
 * persisted and only an explicit submitQuery can dispatch a provider request. */
export function createRagConversationStore(dependencies: {
  readScope: () => RagConversationScope | null;
  query: (request: RagRetrievalRequest, signal?: AbortSignal) => Promise<RagRetrievalResponse>;
}) {
  let currentKey = scopeKey(dependencies.readScope());
  let currentAccount = dependencies.readScope()?.accountId ?? null;
  let requestGeneration = 0;
  let controller: AbortController | null = null;
  let nextMessageId = 0;
  const conversations = new Map<string, Conversation>();
  return create<RagState>((set, get) => ({
    ...emptyConversation(), isOpen: false, isLoading: false, generationModel: 'gemini-3.1-flash-lite',
    syncScope: () => {
      const scope = dependencies.readScope();
      const nextKey = scopeKey(scope);
      if (nextKey === currentKey) return;
      // Keep the question/draft for its exact scope, without publishing late
      // answers into another scope (including A -> B -> A).
      if (currentKey !== null) {
        const { error, queryDraft, chatHistory } = get();
        conversations.set(currentKey, { error, queryDraft, chatHistory });
      }
      requestGeneration++;
      controller?.abort();
      controller = null;
      const accountChanged = currentAccount !== (scope?.accountId ?? null);
      currentAccount = scope?.accountId ?? null;
      currentKey = nextKey;
      set({ ...(nextKey === null ? emptyConversation() : conversations.get(nextKey) ?? emptyConversation()),
        isLoading: false, ...(accountChanged ? { isOpen: false } : {}) });
    },
    togglePanel: () => { get().syncScope(); set({ isOpen: !get().isOpen }); },
    setIsOpen: isOpen => { get().syncScope(); set({ isOpen }); },
    setQueryDraft: queryDraft => { get().syncScope(); set({ queryDraft }); },
    setGenerationModel: generationModel => set({ generationModel }),
    clearHistory: () => {
      requestGeneration++;
      controller?.abort();
      controller = null;
      set({ chatHistory: [], error: null, isLoading: false });
    },
    submitQuery: async (query, tenantId, projectId) => {
      get().syncScope();
      const scope = dependencies.readScope();
      if (!query.trim() || get().isLoading || scope === null
          || scope.workspaceId !== tenantId || scope.boardId !== projectId) return;
      const key = currentKey;
      const generation = ++requestGeneration;
      const requestController = new AbortController();
      controller = requestController;
      const isCurrent = () => generation === requestGeneration && key === scopeKey(dependencies.readScope());
      set(state => ({ chatHistory: [...state.chatHistory, { id: String(++nextMessageId), role: 'user', content: query }],
        queryDraft: '', isLoading: true, error: null }));
      try {
        const response = await dependencies.query({ tenantId, projectId, query,
          generationModel: get().generationModel, matchThreshold: 0.35, matchCount: 10 }, requestController.signal);
        if (!isCurrent()) return;
        const citations = response.chunks.map(chunk => ({ chunkId: chunk.chunkId, citation: chunk.citation }));
        set(state => ({ chatHistory: [...state.chatHistory, { id: String(++nextMessageId), role: 'assistant',
          content: response.answer, ...(citations.length ? { citations } : {}) }], isLoading: false }));
      } catch (error) {
        if (!isCurrent()) return;
        set(state => ({ error: failureMessage(error), isLoading: false, queryDraft: state.queryDraft || query }));
      } finally {
        if (generation === requestGeneration) controller = null;
      }
    },
  }));
}
