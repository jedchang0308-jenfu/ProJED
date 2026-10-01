import React, { useEffect, useState } from 'react';
import { countAllPendingQuickCaptures } from '../features/quickTaskCapture/outbox';
import { getMainInstallUrl, getQuickInstallUrl } from '../features/quickTaskCapture/origins';
import { Button } from './ui/Button';

type IconTarget = 'main' | 'quick';
type PendingCheck = { status: 'checking' | 'ready' | 'unavailable'; count: number };
type LinkStatus = { target: IconTarget; message: string } | null;

export const OptionalIconReinstallDetails: React.FC = () => {
  const [pending, setPending] = useState<PendingCheck>({ status: 'checking', count: 0 });
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(null);

  useEffect(() => {
    let cancelled = false;
    void countAllPendingQuickCaptures()
      .then(count => {
        if (!cancelled) setPending({ status: 'ready', count });
      })
      .catch(() => {
        if (!cancelled) setPending({ status: 'unavailable', count: 0 });
      });
    return () => { cancelled = true; };
  }, []);

  const apps = [
    {
      id: 'main' as const,
      appName: 'ProJED 主程式',
      linkLabel: '保存主程式連結',
      oldIcon: '/icons/icon-vibrant-02-aqua-lime.png',
      newIcon: '/icons/projed-main-icon-brand-20260929-192.png',
      installUrl: new URL(getMainInstallUrl(window.location.origin), window.location.origin).toString(),
    },
    {
      id: 'quick' as const,
      appName: 'ProJED-快速建任務',
      linkLabel: '保存 ProJED-快速建任務連結',
      oldIcon: '/icons/projed-quick-task-icon-legacy-red.png',
      newIcon: '/icons/projed-quick-task-icon-brand-20260929-192.png',
      installUrl: new URL(getQuickInstallUrl(window.location.origin), window.location.origin).toString(),
    },
  ];
  const saveLink = async (target: IconTarget, installUrl: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: target === 'main' ? '安裝 ProJED' : '安裝 ProJED-快速建任務', url: installUrl });
        setLinkStatus({ target, message: '已分享連結；請確認儲存在重裝後仍找得到的位置。' });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(installUrl);
        setLinkStatus({ target, message: '已複製連結；移除 App 前請貼到記事或傳給自己。' });
      } else {
        setLinkStatus({ target, message: '無法自動保存；請先記下此網址。' });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLinkStatus({ target, message: '未保存連結；可改用此網址。' });
    }
  };

  return (
    <div className="space-y-4" data-icon-reinstall-details="true">
                <p className="font-semibold text-slate-900">兩個 App 的圖示對照</p>
                <table className="w-full max-w-sm table-fixed text-left text-xs" aria-label="兩個 App 的新舊圖示">
                  <colgroup><col className="w-[44%]" /><col className="w-[28%]" /><col className="w-[28%]" /></colgroup>
                  <thead><tr className="text-slate-500"><th scope="col" className="pb-1 font-normal">App</th><th scope="col" className="pb-1 font-normal">舊圖示</th><th scope="col" className="pb-1 font-normal">新圖示</th></tr></thead>
                  <tbody>
                    {apps.map(app => (
                      <tr key={app.id} className="border-t border-slate-100" data-icon-reinstall-app={app.id}>
                        <th scope="row" className="py-2 pr-2 font-medium text-slate-700">{app.appName}</th>
                        <td className="py-2"><img src={app.oldIcon} alt={`${app.appName}舊版圖示`} className="h-12 w-12 rounded-xl border border-slate-200 bg-white object-contain" /></td>
                        <td className="py-2"><img src={app.newIcon} alt={`${app.appName}新版圖示`} className="h-12 w-12 rounded-xl border border-slate-200 bg-white object-contain" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ol className="list-decimal space-y-4 pl-5">
                  <li>
                    <span className="font-semibold text-slate-900">確認內容已保存並同步</span>
                    <p className="text-xs leading-5 text-slate-600">移除前，只需確認要更換的那個 App：</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong className="font-medium">主程式：</strong><span data-icon-reinstall-pending={pending.status}>
                      {pending.status === 'checking' && '正在檢查本機快速待辦…'}
                      {pending.status === 'ready' && pending.count === 0 && '未發現未同步的快速待辦；其他未儲存草稿仍請先保存。'}
                      {pending.status === 'ready' && pending.count > 0 && `有 ${pending.count} 筆快速待辦尚未同步，請先完成同步，暫勿移除 App。`}
                      {pending.status === 'unavailable' && '無法檢查本機待辦；請先確認同步狀態，暫勿直接移除。'}
                    </span></p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><strong className="font-medium">ProJED-快速建任務：</strong><span data-icon-reinstall-pending="check-in-app">請先在該 App 確認全部已同步；此處無法查看該 App 的本機待辦。</span></p>
                  </li>
                  <li>
                    <span className="font-semibold text-slate-900">保存要更換 App 的安裝連結</span>
                    <p className="text-slate-600">移除前，先把對應連結存到自己找得到的地方。</p>
                    <div className="mt-2 space-y-2">
                      {apps.map(app => (
                        <div key={app.id} data-icon-reinstall-link={app.id}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" size="sm" variant="secondary" onClick={() => { void saveLink(app.id, app.installUrl); }} data-icon-reinstall-save-link={app.id}>{app.linkLabel}</Button>
                            <span className="break-all text-xs text-slate-500">{app.installUrl}</span>
                          </div>
                          {linkStatus?.target === app.id && <p className="mt-1 text-xs text-slate-600" role="status">{linkStatus.message}</p>}
                        </div>
                      ))}
                    </div>
                  </li>
                  <li>
                    <span className="font-semibold text-slate-900">移除並重新安裝</span>
                    <ol className="mt-2 list-decimal space-y-3 pl-5 text-slate-600">
                      <li>
                        <span className="font-medium text-slate-800">只移除要更換的 App</span>
                        <p>打開 Android「設定 → 應用程式」（部分手機會寫「應用程式管理」），搜尋要更換的 App，點「解除安裝」。主程式可能顯示為「ProJED」；快速入口顯示為「ProJED-快速建任務」。只移除選中的那一個，另一個保留。若清單找不到要更換的 App，請保留另一個並直接進行下一步。</p>
                      </li>
                      <li>
                        <span className="font-medium text-slate-800">用 Chrome 開啟對應連結</span>
                        <p>開啟 Chrome 新分頁，貼上前一步保存的連結。主程式與快速入口使用不同連結，請選擇要重裝的那一個。</p>
                      </li>
                      <li>
                        <span className="font-medium text-slate-800">選擇安裝應用程式</span>
                        <p>Chrome 顯示安裝提示時，點「安裝應用程式」或「安裝」。若沒有提示，點右上角「⋮」並選「安裝應用程式」。「建立捷徑」只會新增網頁捷徑，不會安裝或更新 App 圖示；若只看到這個選項，請先確認已在 Chrome 開啟正確的保存連結。</p>
                      </li>
                      <li>
                        <span className="font-medium text-slate-800">確認新圖示與帳號</span>
                        <p>安裝完成後，從手機 App 清單開啟剛安裝的 App，使用原本的 Google 帳號登入，再確認新圖示與工作內容。</p>
                      </li>
                    </ol>
                  </li>
                </ol>
    </div>
  );
};
