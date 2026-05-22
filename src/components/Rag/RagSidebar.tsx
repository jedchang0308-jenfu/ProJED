import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, MessageSquare } from 'lucide-react';
import useRagStore from '../../store/useRagStore';
import useBoardStore from '../../store/useBoardStore';
import CitationCard from './CitationCard';

const RagSidebar: React.FC = () => {
  const { isOpen, setIsOpen, chatHistory, isLoading, submitQuery, error, clearHistory, generationModel, setGenerationModel } = useRagStore();
  const { getActiveBoard, getActiveWorkspace } = useBoardStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  const activeWorkspace = getActiveWorkspace();
  const activeBoard = getActiveBoard();

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || !activeWorkspace) return;

    submitQuery(input.trim(), activeWorkspace.id, activeBoard?.id || null);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
          <h2 className="text-sm font-bold text-slate-700">專案 AI 助手</h2>
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
            ⚡ 快速 (3.1 Lite)
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
            🧠 深度 (3.5 Flash)
          </button>
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
          AI 回答可能不完整，請以引用來源與專案資料為準。
        </div>
      </div>
    </div>
  );
};

export default RagSidebar;
