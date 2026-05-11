import { create } from 'zustand';
import useBoardStore from './useBoardStore';
import { toast } from './useToastStore';

export type AiMessageRole = 'user' | 'assistant' | 'system';
export type AiModel = 'gemini-3.1-flash-lite' | 'gemini-3.1-flash';

export interface AiMessage {
  id: string;
  role: AiMessageRole;
  content: string;
  timestamp: number;
}

interface AiStore {
  isOpen: boolean;
  isLoading: boolean;
  isRateLimited: boolean;
  selectedModel: AiModel;
  messages: AiMessage[];
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  clearMessages: () => void;
  setModel: (model: string) => void;
  sendMessage: (text: string) => Promise<void>;
  appendSystemMessage: (content: string) => void;
}

const DEFAULT_ENDPOINT = '/api/chat';
const DEFAULT_MODEL: AiModel = 'gemini-3.1-flash-lite';
const AVAILABLE_MODELS: AiModel[] = ['gemini-3.1-flash-lite', 'gemini-3.1-flash'];
const RATE_LIMIT_MESSAGE = '已達使用上限，請稍後再試';

const createMessage = (role: AiMessageRole, content: string): AiMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  timestamp: Date.now(),
});

const createInitialMessages = (): AiMessage[] => [
  createMessage('assistant', '請輸入自然語言需求，例如「整理本週延遲任務」。'),
  createMessage('system', 'AI 助理已就緒。對話記錄由 Zustand SSoT 保存。'),
];

const formatErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return '未知錯誤';
};

const useAiStore = create<AiStore>((set, get) => ({
  isOpen: false,
  isLoading: false,
  isRateLimited: false,
  selectedModel: DEFAULT_MODEL,
  messages: createInitialMessages(),

  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false }),
  toggleDrawer: () => set((state) => ({ isOpen: !state.isOpen })),

  clearMessages: () => set({ messages: createInitialMessages() }),

  setModel: (model: string) => {
    if (!AVAILABLE_MODELS.includes(model as AiModel)) return;
    set({ selectedModel: model as AiModel });
  },

  appendSystemMessage: (content: string) => {
    set((state) => ({
      messages: [...state.messages, createMessage('system', content)],
    }));
  },

  sendMessage: async (text: string) => {
    const prompt = text.trim();
    const { isLoading, isRateLimited, selectedModel } = get();

    if (!prompt || isLoading) return;

    if (isRateLimited) {
      toast.error(RATE_LIMIT_MESSAGE);
      return;
    }

    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    const currentSystemTime = new Date().toISOString();
    const userMessage = createMessage('user', prompt);

    set((state) => ({
      isLoading: true,
      messages: [...state.messages, userMessage],
    }));

    try {
      const response = await fetch(DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: prompt,
          workspaceId: activeWorkspaceId,
          boardId: activeBoardId,
          currentSystemTime,
          model: selectedModel,
        }),
      });

      if (response.status === 429) {
        toast.error(RATE_LIMIT_MESSAGE);
        set((state) => ({
          isLoading: false,
          isRateLimited: true,
          messages: [...state.messages, createMessage('system', RATE_LIMIT_MESSAGE)],
        }));
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const replyText =
        payload?.message ||
        payload?.plan?.report ||
        '後端已收到請求，但尚未回傳可顯示的內容。';

      set((state) => ({
        isLoading: false,
        messages: [...state.messages, createMessage('assistant', replyText)],
      }));
    } catch (error) {
      const message = `AI 助理暫時無法連線：${formatErrorMessage(error)}`;
      toast.error(message);
      set((state) => ({
        isLoading: false,
        messages: [...state.messages, createMessage('system', message)],
      }));
    }
  },
}));

export default useAiStore;
