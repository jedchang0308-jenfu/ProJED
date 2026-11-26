import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import { OriginSwitchGuide, type DestinationInspection, type DraftInspection, type GuideEntry } from '../../../src/features/originSwitch/guide';
import { OriginSwitchGuideView } from '../../../src/features/originSwitch/OriginSwitchGuide';
import { getPwaInstallContext, type PwaInstallPlatform } from '../../../src/services/pwaInstallService';

// A local review fixture, never imported by a production entry point.
// It does not navigate, authenticate, install, call APIs or read business stores.
const targetOrigin = 'https://projed-entry-preview.invalid';
const targetLabel = '新的 ProJED 網址（尚未啟用）';
const accounts = {
  original: { id: 'preview-original', label: 'jed@example.test' },
  other: { id: 'preview-other', label: 'collaborator@example.test' },
};
type DraftScenario = 'clean' | 'pending' | 'unknown' | 'conflict' | 'unbound' | 'offline' | 'editing' | 'unavailable';
type LoginScenario = 'none' | 'same' | 'wrong' | 'expired' | 'denied' | 'unavailable';

const scenarios: { draft: DraftScenario; login: LoginScenario; install: 'accepted' | 'dismissed' | 'unavailable' } = { draft: 'clean', login: 'none', install: 'accepted' };

export function OriginGuidePreview() {
  const [entry, setEntry] = useState<GuideEntry>('main');
  const [account, setAccount] = useState<keyof typeof accounts>('original');
  const [draft, setDraft] = useState<DraftScenario>('clean');
  const [login, setLogin] = useState<LoginScenario>('none');
  const [platform, setPlatform] = useState<PwaInstallPlatform>(() => getPwaInstallContext().platform);
  const [install, setInstall] = useState<'accepted' | 'dismissed' | 'unavailable'>('accepted');
  const [opened, setOpened] = useState(0);
  const [show, setShow] = useState(true);
  const [reset, setReset] = useState(0);
  const guide = useMemo(() => {
    const scope = { campaign: 'dev139-local-review-v1', entry, accountId: accounts[account].id,
      sourceOrigin: entry === 'main' ? 'https://projed-cc78d.web.app' : 'https://projed-cc78d.firebaseapp.com', targetOrigin };
    return new OriginSwitchGuide(scope, [targetOrigin], {
      async inspectDrafts(): Promise<DraftInspection> {
        const kind = scenarios.draft;
        if (kind === 'unavailable') throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE');
        return { complete: true, online: kind !== 'offline', editing: kind === 'editing',
          pending: kind === 'pending' ? 2 : 0, unknown: kind === 'unknown' ? 1 : 0,
          conflicts: kind === 'conflict' ? 1 : 0, unbound: kind === 'unbound' ? 1 : 0 };
      },
      async inspectDestination(): Promise<DestinationInspection | null> {
        const kind = scenarios.login;
        if (kind === 'unavailable') throw new Error('SYNTHETIC_DESTINATION_UNAVAILABLE');
        if (kind === 'none') return null;
        return { sourceOrigin: scope.sourceOrigin, targetOrigin, entry, accountId: kind === 'wrong' ? 'different-account' : scope.accountId,
          workspaceMatched: true, permissionsMatched: kind !== 'denied', expiresAt: Date.now() + (kind === 'expired' ? -1 : 300000) };
      },
      async prepareDestination() { return new URL(entry === 'quick' ? '/quick-task/' : '/', targetOrigin).href; },
      navigateDestination() { setOpened(count => count + 1); },
      async requestInstall() { return scenarios.install; },
    }, window.localStorage);
  // Reset reconstructs the external controller without changing the persisted account/entry key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, account, reset]);
  useEffect(() => () => guide.dispose(), [guide]);

  return <div className="preview-root">
    <header className="preview-header"><strong>ProJED</strong><span>新網址與安裝引導預覽</span></header>
    <p className="preview-boundary">僅使用測試資料；登入、開啟新網址與安裝都是模擬，不會切換正式網址或搬動資料。</p>
    <div className="preview-layout"><main>
      {show ? <OriginSwitchGuideView key={guide.key + reset} guide={guide} accountLabel={accounts[account].label}
        platform={platform} targetLabel={targetLabel} onReturn={() => setShow(false)} onNextQuick={() => { setEntry('quick'); setShow(true); }} />
        : <section className="preview-return"><h1>{guide.getSnapshot().stage === 'complete' ? '已完成更換' : '繼續使用舊網址'}</h1><p>{guide.getSnapshot().stage === 'complete' ? '之後請從新圖示或新網址開啟程式，照常記事、管理任務。' : '您可以繼續記事，稍後再回來接著做。'}</p>
          <button onClick={() => setShow(true)}>繼續更換網址</button></section>}
    </main><aside><details open={window.innerWidth > 900}>
      <summary>試看看不同情況</summary><div className="preview-controls">
        <label>要更換哪個程式<select aria-label="要更換哪個程式" value={entry} onChange={event => { setEntry(event.target.value as GuideEntry); setShow(true); }}>
          <option value="main">ProJED 主程式</option><option value="quick">ProJED 建待辦</option></select></label>
        <label>原本使用的帳號<select aria-label="原本使用的帳號" value={account} onChange={event => { setAccount(event.target.value as keyof typeof accounts); setShow(true); }}>
          <option value="original">jed@example.test</option><option value="other">collaborator@example.test</option></select></label>
        <label>記事保存情況<select aria-label="記事保存情況" value={draft} onChange={event => { scenarios.draft = event.target.value as DraftScenario; setDraft(scenarios.draft); }}>
          <option value="clean">已存到帳號裡</option><option value="pending">還有 2 筆沒存好</option><option value="unknown">還不知道是否存好</option>
          <option value="conflict">有兩份不同內容</option><option value="unbound">還沒選擇帳號</option><option value="offline">目前沒有網路</option>
          <option value="editing">正在寫記事</option><option value="unavailable">暫時無法確認</option></select></label>
        <label>模擬登入結果<select aria-label="模擬登入結果" value={login} onChange={event => { scenarios.login = event.target.value as LoginScenario; setLogin(scenarios.login); }}>
          <option value="none">還沒登入或取消登入</option><option value="same">原來的帳號，資料也正確</option>
          <option value="wrong">登入了其他帳號</option><option value="expired">確認時等太久</option>
          <option value="denied">還無法開啟原本的資料</option><option value="unavailable">新網址暫時打不開</option></select></label>
        <label>裝置<select aria-label="裝置" value={platform} onChange={event => setPlatform(event.target.value as PwaInstallPlatform)}>
          <option value="desktop-browser">電腦瀏覽器</option><option value="ios-safari">iPhone／iPad Safari</option>
          <option value="android-browser">Android Chrome</option><option value="standalone">目前從舊桌面圖示開啟</option>
          <option value="embedded">從 LINE 等程式裡開啟</option></select></label>
        <label>模擬安裝結果<select aria-label="模擬安裝結果" value={install} onChange={event => { scenarios.install = event.target.value as typeof install; setInstall(scenarios.install); }}>
          <option value="accepted">按下安裝</option><option value="dismissed">取消安裝</option><option value="unavailable">使用瀏覽器選單</option></select></label>
        <p className="preview-counter" data-preview-opened={opened}>模擬開啟新網址：{opened} 次</p>
        <button className="preview-reset" onClick={() => { localStorage.removeItem(guide.key); setReset(count => count + 1); setShow(true); }}>重新試一次（只重設這個程式與帳號）</button>
      </div></details></aside></div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<OriginGuidePreview />);
