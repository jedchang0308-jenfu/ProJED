import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, MessageSquare, Activity, AlertTriangle, ClipboardList, ChevronDown, CalendarDays } from 'lucide-react';
import useRagStore from '../../store/useRagStore';
import useBoardStore from '../../store/useBoardStore';
import CitationCard from './CitationCard';

const PM_QUICK_ACTIONS = [
  {
    id: 'project-health-check',
    label: '專案健檢',
    icon: Activity,
    prompt:
      '請根據目前 ProJED 專案資料進行專案健檢。請分析工作分解結構階層、任務狀態、起訖日、依賴關係、逾期項目與可引用的專案知識。輸出格式請包含：1. 專案健康度總結 2. 目前最大風險 3. 已逾期或可能逾期的任務 4. 需要專案經理立刻處理的前三件事 5. 資料不足或需要補齊的欄位。請用繁體中文回答，並在可行時引用來源。',
  },
  {
    id: 'project-risk-scan',
    label: '找出專案風險',
    icon: AlertTriangle,
    prompt:
      '請從目前 ProJED 專案資料中找出專案風險。請檢查時程風險、依賴風險、任務描述不清、負責人或協作者缺失、驗收標準不足、狀態與日期不一致等問題。輸出格式請用表格：風險等級、風險項目、證據或原因、可能影響、建議處理方式。請用繁體中文回答，並在可行時引用來源。',
  },
  {
    id: 'weekly-progress-report',
    label: '每週進度報告',
    icon: ClipboardList,
    prompt:
      '請根據目前 ProJED 專案資料產生專案經理每週進度報告。請整理：1. 本週完成事項 2. 進行中事項 3. 延遲或卡住事項 4. 主要風險 5. 下週重點 6. 需要管理層或跨部門協助的事項。請用適合會議或管理層閱讀的繁體中文格式輸出，並在資料不足時明確標示假設與缺口。',
  },
  {
    id: 'upcoming-week-todos',
    label: '未來一周待辦',
    icon: CalendarDays,
    prompt:
      '請整理我未來一周要做的事情。請根據目前 ProJED 專案資料中的任務、狀態、負責人、起訖日、依賴關係與可引用的專案知識，找出未來 7 天內需要處理或接近到期的事項，並從最接近到期日到最晚到期日依序排序。輸出格式請包含：到期日、任務名稱、目前狀態、所屬工作分解結構或專案位置、為什麼需要處理、建議下一步。請排除已完成事項；若資料不足，請列出需要補齊的欄位。請用繁體中文回答，並在可行時引用來源。',
  },
];

const RagSidebar: React.FC = () => {
  const { isOpen, setIsOpen, chatHistory, isLoading, submitQuery, error, clearHistory, generationModel, setGenerationModel } = useRagStore();
  const { getActiveBoard, getActiveWorkspace } = useBoardStore();

  const [input, setInput] = useState('');
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  useEffect(() => {
    if (!isQuickMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!quickMenuRef.current?.contains(event.target as Node)) {
        setIsQuickMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsQuickMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isQuickMenuOpen]);

  const activeWorkspace = getActiveWorkspace();
  const activeBoard = getActiveBoard();

  const buildScopedPrompt = (prompt: string) => {
    const workspaceName = activeWorkspace?.title ? `工作區：${activeWorkspace.title}` : '工作區：未選取';
    const boardName = activeBoard?.title ? `專案看板：${activeBoard.title}` : '專案看板：未選取';

    return `${prompt}\n\n目前範圍：\n- ${workspaceName}\n- ${boardName}\n\n請優先根據目前範圍內的 ProJED 資料回答；如果找不到足夠資料，請不要猜測，改列出需要補齊的資料。`;
  };

  const handleQuickAction = (prompt: string) => {
    if (isLoading || !activeWorkspace) return;

    setIsQuickMenuOpen(false);
    submitQuery(buildScopedPrompt(prompt), activeWorkspace.id, activeBoard?.id || null);
    setInput('');
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || !activeWorkspace) return;

    submitQuery(input.trim(), activeWorkspace.id, activeBoard?.id || null);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col bg-white shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 md:relative md:inset-auto md:z-auto md:h-full md:w-96 md:flex-shrink-0 md:border-l md:border-slate-200">
      <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-slate-50/50 px-4">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-blue-100 p-1.5 text-blue-600">
            <Sparkles size={16} />
          </div>
          <h2 className="text-sm font-bold text-slate-700">專案智慧助理</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
            title="清除對話"
            type="button"
          >
            <MessageSquare size={16} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
            title="關閉"
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50 p-3">
        <div className="flex w-full items-center justify-between rounded-lg bg-slate-200/60 p-1">
          <button
            onClick={() => setGenerationModel('gemini-3.1-flash-lite')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
              generationModel === 'gemini-3.1-flash-lite'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            type="button"
          >
            快速模式（Gemini 3.1 輕量版）
          </button>
          <button
            onClick={() => setGenerationModel('gemini-3.5-flash')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
              generationModel === 'gemini-3.5-flash'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            type="button"
          >
            深度模式（Gemini 3.5）
          </button>
        </div>

        <div ref={quickMenuRef} className="relative mt-3">
          <button
            onClick={() => setIsQuickMenuOpen((open) => !open)}
            disabled={isLoading || !activeWorkspace}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            type="button"
            aria-expanded={isQuickMenuOpen}
            aria-haspopup="menu"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ClipboardList size={16} className="shrink-0 text-blue-500" />
              <span className="truncate">快捷問題</span>
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-slate-400 transition-transform ${isQuickMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isQuickMenuOpen && (
            <div
              className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
              role="menu"
            >
              {PM_QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;

                return (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action.prompt)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                    type="button"
                    role="menuitem"
                  >
                    <Icon size={16} className="shrink-0 text-blue-500" />
                    <span className="truncate">{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-slate-50/30 p-4">
        {chatHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400 opacity-70">
            <Bot size={48} className="text-slate-300" />
            <p className="px-4 text-center text-sm leading-6">
              目前沒有對話紀錄。
              <br />
              你可以詢問此專案的任務、風險、決策或進度。
              <br />
              回答會附上可追溯的引用來源。
            </p>
          </div>
        ) : (
          chatHistory.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`flex max-w-[85%] flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`whitespace-pre-wrap rounded-2xl p-3 text-sm shadow-sm ${
                  msg.role === 'user'
                    ? 'rounded-tr-none bg-indigo-600 text-white'
                    : 'rounded-tl-none border border-slate-100 bg-white text-slate-700'
                }`}>
                  {msg.content}
                </div>

                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-1 flex w-full flex-col gap-2">
                    <div className="pl-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      引用來源 ({msg.citations.length})
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {msg.citations.map((c, i) => (
                        <CitationCard key={`${c.chunkId}-${i}`} citation={c.citation} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex flex-row gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Bot size={16} />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-none border border-slate-100 bg-white p-3 text-sm text-slate-500 shadow-sm">
              <Loader2 size={16} className="animate-spin text-blue-500" />
              正在搜尋專案知識...
            </div>
          </div>
        )}

        {error && (
          <div className="mx-auto w-full rounded-lg border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        <form onSubmit={handleSubmit} className="relative flex items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeWorkspace ? '詢問這個專案...' : '請先選擇工作區'}
            disabled={isLoading || !activeWorkspace}
            className="max-h-32 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-10 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            rows={1}
            style={{ minHeight: '42px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !activeWorkspace}
            className="absolute bottom-1.5 right-1.5 rounded-lg bg-blue-600 p-1.5 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            title="送出"
          >
            <Send size={16} />
          </button>
        </form>
        <div className="mt-2 text-center text-[10px] text-slate-400">
          智慧助理回覆可能不完整，請以引用來源與專案資料為準。
        </div>
      </div>
    </div>
  );
};

export default RagSidebar;
