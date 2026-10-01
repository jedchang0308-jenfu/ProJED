import React, { useEffect, useState } from 'react';
import { countAllPendingQuickCaptures } from '../features/quickTaskCapture/outbox';
import { Button } from './ui/Button';

type IconTarget = 'main' | 'quick';
type PendingCheck = { status: 'checking' | 'ready' | 'unavailable'; count: number };

const installPath = (target: IconTarget) => target === 'main' ? '/' : '/quick-task/?install=1';

export const OptionalIconReinstallGuide: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<IconTarget>('main');
  const [pending, setPending] = useState<PendingCheck>({ status: 'checking', count: 0 });
  const [linkStatus, setLinkStatus] = useState('');
  const isAndroid = typeof navigator !== 'undefined' && /Android/iu.test(navigator.userAgent || '');

  useEffect(() => {
    if (!expanded || !isAndroid) return;
    let cancelled = false;
    void countAllPendingQuickCaptures()
      .then(count => {
        if (!cancelled) setPending({ status: 'ready', count });
      })
      .catch(() => {
        if (!cancelled) setPending({ status: 'unavailable', count: 0 });
      });
    return () => { cancelled = true; };
  }, [expanded, isAndroid]);

  if (!isAndroid) return null;

  const installUrl = new URL(installPath(target), window.location.origin).toString();
  const saveLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: target === 'main' ? '安裝 ProJED' : '安裝 ProJED 快速建待辦', url: installUrl });
        setLinkStatus('已開啟分享選單；請將連結存到可在卸載後開啟的位置。');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(installUrl);
        setLinkStatus('安裝連結已複製，請先存到記事或訊息。');
      } else {
        setLinkStatus('無法自動保存；請先記下下方網址。');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLinkStatus('未保存連結；可改用下方網址。');
    }
  };

  return (
    <div className="border-t border-slate-200 pt-4" data-icon-reinstall-guide="true">
      <button
        type="button"
        className="text-left text-sm font-semibold text-teal-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-500"
        aria-expanded={expanded}
        onClick={() => {
          if (!expanded) setPending({ status: 'checking', count: 0 });
          setExpanded(!expanded);
        }}
      >
        自行更新桌面圖示（選用）
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
          <p>想立即換成新版圖示，可自行移除舊 App 再安裝；也可以保留目前圖示繼續使用。</p>
          <div className="flex flex-wrap gap-2" aria-label="選擇要更新的圖示">
            <Button type="button" size="sm" variant={target === 'main' ? 'primary' : 'secondary'} aria-pressed={target === 'main'} onClick={() => { setTarget('main'); setLinkStatus(''); }}>ProJED 主程式</Button>
            <Button type="button" size="sm" variant={target === 'quick' ? 'primary' : 'secondary'} aria-pressed={target === 'quick'} onClick={() => { setTarget('quick'); setLinkStatus(''); }}>快速建待辦</Button>
          </div>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              先確認工作內容已儲存並同步。
              <span className="block text-xs text-slate-600" data-icon-reinstall-pending={pending.status}>
                {pending.status === 'checking' && '正在檢查此裝置的快速待辦…'}
                {pending.status === 'ready' && pending.count === 0 && '目前未發現未同步的快速待辦；其他未儲存草稿仍請先保存。'}
                {pending.status === 'ready' && pending.count > 0 && `此裝置有 ${pending.count} 筆快速待辦尚未同步，請先完成同步，暫勿移除 App。`}
                {pending.status === 'unavailable' && '無法檢查本機快速待辦；請先到快速入口確認同步狀態，暫勿直接移除。'}
              </span>
            </li>
            <li>先保留安裝連結，確保移除舊 App 後找得回來。</li>
            <li>自行到 Android「設定 → 應用程式」解除安裝想換圖示的那一個 App；另一個入口無須移除。</li>
            <li>從保留的連結以 Chrome 開啟，選「安裝應用程式」或「安裝並建立捷徑」，完成後用原本的 ProJED 帳號登入。</li>
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => { void saveLink(); }} data-icon-reinstall-save-link>保留安裝連結</Button>
            <span className="break-all text-xs text-slate-500">{installUrl}</span>
          </div>
          {linkStatus && <p className="text-xs text-slate-600" role="status">{linkStatus}</p>}
        </div>
      )}
    </div>
  );
};
