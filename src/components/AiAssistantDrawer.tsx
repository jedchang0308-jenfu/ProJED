import React, { useMemo, useState } from 'react';
import { Bot, ChevronRight, Clock3, MessageSquareText, PanelRightClose, Send, Sparkles, User } from 'lucide-react';
import useAiStore, { type AiMessage } from '../store/useAiStore';
import useDialogStore from '../store/useDialogStore';
import { Button } from './ui/Button';

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));

const taskLinkPattern = /^task:([^/]+)$/;

function renderInlineMarkdown(text: string, onTaskClick: (taskId: string) => void) {
  const parts: React.ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const label = match[1];
    const href = match[2];
    const taskMatch = href.match(taskLinkPattern);

    if (taskMatch) {
      const taskId = taskMatch[1];
      parts.push(
        <a
          key={`${href}-${match.index}`}
          href={href}
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onTaskClick(taskId);
          }}
        >
          {label}
        </a>
      );
    } else {
      parts.push(
        <a
          key={`${href}-${match.index}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {label}
        </a>
      );
    }

    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderMarkdown(text: string, onTaskClick: (taskId: string) => void) {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 12)}`} className={index === 0 ? '' : 'mt-2'}>
      {renderInlineMarkdown(paragraph, onTaskClick)}
    </p>
  ));
}

const roleConfig: Record<AiMessage['role'], { bubble: string; time: string; icon: React.ReactNode }> = {
  user: {
    bubble: 'bg-primary text-white border-primary',
    time: 'text-white/80',
    icon: <User size={15} />,
  },
  assistant: {
    bubble: 'bg-white text-slate-700 border-slate-200',
    time: 'text-slate-400',
    icon: <Bot size={15} />,
  },
  system: {
    bubble: 'bg-slate-100 text-slate-600 border-slate-200',
    time: 'text-slate-400',
    icon: <Sparkles size={15} />,
  },
};

const AiAssistantDrawer: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const isOpen = useAiStore((state) => state.isOpen);
  const isLoading = useAiStore((state) => state.isLoading);
  const isRateLimited = useAiStore((state) => state.isRateLimited);
  const selectedModel = useAiStore((state) => state.selectedModel);
  const messages = useAiStore((state) => state.messages);
  const closeDrawer = useAiStore((state) => state.closeDrawer);
  const setModel = useAiStore((state) => state.setModel);
  const sendMessage = useAiStore((state) => state.sendMessage);

  const quickPrompts = useMemo(
    () => ['整理本週延遲任務', '列出高風險項目與原因', '彙總指定日期區間的進度'],
    []
  );

  const isLocked = isRateLimited || isLoading;
  const textareaPlaceholder = isRateLimited ? '已達使用上限，請稍後再試' : '輸入自然語言指令...';

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLocked) return;
    setInputValue('');
    await sendMessage(trimmed);
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-slate-900/25 transition-opacity duration-200 z-40 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 right-0 z-50 h-screen w-full max-w-[420px] bg-white border-l border-slate-200 shadow-2xl transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="AI 自然語言專案助理"
      >
        <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">AI 自然語言專案助理</div>
              <div className="text-[11px] text-slate-500 truncate">自然語言 -&gt; 條件化查詢 -&gt; 精簡資料 -&gt; 報告</div>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={closeDrawer} aria-label="關閉 AI 助理">
            <PanelRightClose size={16} />
          </Button>
        </div>

        <div className="h-[calc(100vh-14.5rem)] overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/60">
          {messages.map((message) => {
            const config = roleConfig[message.role];
            return (
              <div
                key={message.id}
                className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role !== 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-primary flex items-center justify-center shrink-0">
                    {config.icon}
                  </div>
                )}

                <div className={`max-w-[78%] rounded-xl border px-3 py-2 text-sm shadow-sm ${config.bubble}`}>
                  <div className="whitespace-pre-wrap leading-5">
                    {message.role === 'user'
                      ? message.content
                      : renderMarkdown(message.content, (taskId) => {
                          useDialogStore.getState().openTask(taskId);
                          closeDrawer();
                        })}
                  </div>
                  <div className={`mt-1 text-[10px] flex items-center gap-1 ${config.time}`}>
                    <Clock3 size={10} />
                    <span>{formatTime(message.timestamp)}</span>
                  </div>
                </div>

                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                    {config.icon}
                  </div>
                )}
              </div>
            );
          })}

          <section className="pt-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
              <MessageSquareText size={14} />
              <span>快速範例</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isLocked}
                  onClick={() => handleSend(prompt)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="h-[10.5rem] border-t border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-xs font-medium text-slate-500" htmlFor="ai-model-select">
              模型
            </label>
            <select
              id="ai-model-select"
              value={selectedModel}
              disabled={isLocked}
              onChange={(event) => setModel(event.target.value)}
              className="h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (預設)</option>
              <option value="gemini-3.1-flash">Gemini 3.1 Flash</option>
            </select>
          </div>

          {isRateLimited && (
            <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              已達使用上限，請稍後再試
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              value={inputValue}
              disabled={isLocked}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={textareaPlaceholder}
              className={`flex-1 min-h-[72px] resize-none rounded-xl border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed ${
                isRateLimited
                  ? 'border-red-300 bg-red-50 text-red-600 placeholder:text-red-500'
                  : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-primary focus:bg-white'
              }`}
            />
            <Button
              onClick={() => void handleSend(inputValue)}
              isLoading={isLoading}
              disabled={isLocked}
              className="self-end"
            >
              <Send size={14} className="mr-2" />
              送出
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default AiAssistantDrawer;
