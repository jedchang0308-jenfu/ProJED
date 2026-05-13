import { create } from 'zustand';
import { auth } from '../services/firebase';
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
  createMessage('assistant', '我可以協助你整理任務、查詢進度與彙整風險。'),
  createMessage('system', 'AI 助理狀態由 Zustand SSoT 管理。'),
];

const formatErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return '未知錯誤';
};

const getErrorDetail = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string') return payload.detail;
    if (typeof payload?.message === 'string') return payload.message;
  } catch {
    // Ignore invalid error payloads and fall back to status text.
  }
  return response.statusText || `HTTP ${response.status}`;
};

const getFirebaseIdToken = async (): Promise<string> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('請先登入後再使用 AI 助理');
  }
  return user.getIdToken();
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
    if (!activeWorkspaceId) {
      const message = '請先選擇工作區後再使用 AI 助理';
      toast.error(message);
      set((state) => ({
        messages: [...state.messages, createMessage('system', message)],
      }));
      return;
    }

    const currentSystemTime = new Date().toISOString();
    const userMessage = createMessage('user', prompt);

    set((state) => ({
      isLoading: true,
      messages: [...state.messages, userMessage],
    }));

    try {
      const idToken = await getFirebaseIdToken();
      const response = await fetch(DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
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
        throw new Error(await getErrorDetail(response));
      }

      const payload = await response.json();
      const replyText =
        payload?.message ||
        payload?.plan?.report ||
        '已收到回應，但目前無法顯示完整內容。';

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
