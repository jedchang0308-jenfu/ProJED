import React, { useEffect, useState } from 'react';
import { countAllPendingQuickCaptures } from '../features/quickTaskCapture/outbox';
import { getMainInstallUrl, getQuickInstallUrl } from '../features/quickTaskCapture/origins';
import { Button } from './ui/Button';

type IconTarget = 'main' | 'quick';
type PendingCheck = { status: 'checking' | 'ready' | 'unavailable'; count: number };

export const OptionalIconReinstallGuide: React.FC<{ initiallyExpanded?: boolean }> = ({ initiallyExpanded = false }) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [target, setTarget] = useState<IconTarget>('main');
  const [pending, setPending] = useState<PendingCheck>({ status: 'checking', count: 0 });
  const [linkStatus, setLinkStatus] = useState('');

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    void countAllPendingQuickCaptures()
      .then(count => {
        if (!cancelled) setPending({ status: 'ready', count });
      })
      .catch(() => {
        if (!cancelled) setPending({ status: 'unavailable', count: 0 });
      });
    return () => { cancelled = true; };
  }, [expanded]);

  const installUrl = new URL(
    target === 'main' ? getMainInstallUrl(window.location.origin) : getQuickInstallUrl(window.location.origin),
    window.location.origin,
  ).toString();
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
          <p>想換圖示時，一次重裝一個 App；保留舊圖示也能繼續使用。</p>
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
            <li>保留所選 App 的安裝連結，移除後才能找回。</li>
            <li>到 Android「設定 → 應用程式」只移除所選 App；另一個入口無須移除。接著在 Chrome 開啟保存的連結並選「安裝應用程式」，用原本的 Google 帳號登入。</li>
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
