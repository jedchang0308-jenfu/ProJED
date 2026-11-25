import { useState, useSyncExternalStore } from 'react';
import type { PwaInstallPlatform } from '../../services/pwaInstallService';
import { OriginSwitchGuide, type GuideIssue } from './guide';
import './originSwitch.css';
import { entryInstallInstructions } from './installGuidance';

const issues: Record<Exclude<GuideIssue, null>, string> = {
  drafts: '還有記事只留在這台手機或電腦上。請先把內容存到您的帳號裡，再繼續更換網址。',
  unknown: '還無法確認上次的記事是否存好了，請先不要再建一筆。',
  conflict: '這份記事有兩份不同的內容。請先保留想要的內容，處理好後再繼續。',
  unbound: '有記事還沒確認要存到哪個帳號。請先選好帳號，再繼續。',
  editing: '您還在寫記事。請先存好內容，再繼續。',
  offline: '目前沒有網路，記事仍留在這台手機或電腦上。連上網路後再繼續。',
  unavailable: '暫時無法確認資料，請稍後再試。您仍可使用舊網址。',
  login: '還沒確認您已登入新網址。請用原來的帳號登入後，再按一次「我已登入，繼續」。',
  account: '這不是您原本使用的帳號。請換回上方的帳號，再繼續。',
  access: '暫時無法開啟您原本的資料。請先用舊網址，稍後再試。',
  expired: '確認登入時等太久了，請再試一次；原本的記事仍會保留。',
  storage: '目前無法記住您做到哪一步。請先保留這個畫面，稍後再試。原本的記事不會被清除。',
};

export function OriginSwitchGuideView({ guide, accountLabel, platform, targetLabel, onReturn, onNextQuick }: {
  guide: OriginSwitchGuide;
  accountLabel: string;
  platform: PwaInstallPlatform;
  targetLabel: string;
  onReturn(): void;
  onNextQuick?(): void;
}) {
  const state = useSyncExternalStore(guide.subscribe, guide.getSnapshot);
  const [entryKind, setEntryKind] = useState<'bookmark' | 'pwa'>('pwa');
  const [openedForVerification, setOpenedForVerification] = useState<number | null>(null);
  const opened = openedForVerification === state.verification;
  const step = state.stage === 'drafts' ? 0 : state.stage === 'account' ? 1 : 2;
  const label = guide.scope.entry === 'main' ? 'ProJED 主程式' : 'ProJED 建待辦';
  const goBack = () => { guide.defer(); onReturn(); };
  return <section className="origin-guide" aria-label={`${label}更換網址與安裝說明`} data-origin-guide-stage={state.stage}>
    <div className="og-product"><span className="og-mark" aria-hidden="true">P</span><span>{label}</span></div>
    {state.stage === 'intro' ? <>
      <h1>{guide.scope.entry === 'main' ? 'ProJED' : 'ProJED 建待辦'} 要換新網址了</h1>
      <p className="og-lead">ProJED 已整合到新的服務平台，方便日後統一維護與更新，接下來也會改用新網址。</p>
      <p className="og-lead">您原本帳號裡的任務、筆記與使用權限會保留，仍可使用原來的帳號登入。</p>
      <p className="og-note">我們會先帶您確認還沒存好的內容，再登入新網址，最後把程式加到手機或電腦上。換好前，您仍可繼續使用舊網址。</p>
      <div className="og-actions">
        <button className="og-primary" onClick={() => void guide.start()} disabled={state.busy}>
          {state.deferred ? '繼續上次的步驟' : '開始更換'}<span aria-hidden="true"> →</span>
        </button>
        <button className="og-text" onClick={goBack}>稍後再做</button>
      </div>
    </> : state.stage === 'complete' ? <>
      <div className="og-done-mark" aria-hidden="true">✓</div>
      <h1>已經換好了！</h1>
      <p className="og-lead">之後請從新圖示或新網址開啟 {label}，照常記事、管理任務。</p>
      <p className="og-note">舊圖示先留著，等新程式用得順了再整理；還沒存好的記事不會被清除。</p>
      {guide.scope.entry === 'main' && onNextQuick && <p className="og-note">如果您也有使用「ProJED 建待辦」，可以接著更換它的圖示。</p>}
      <div className="og-actions">
        <button className="og-primary" onClick={onReturn}>開始使用 {guide.scope.entry === 'main' ? 'ProJED' : 'ProJED 建待辦'}</button>
        {guide.scope.entry === 'main' && onNextQuick && <button className="og-secondary" onClick={onNextQuick}>接著更換建待辦</button>}
      </div>
    </> : <>
      <ol className="og-steps" aria-label="更換步驟">
        {['確認資料', '原帳號登入', '安裝程式'].map((title, index) => <li key={title}
          className={index === step ? 'is-current' : index < step ? 'is-done' : ''}
          aria-current={index === step ? 'step' : undefined}>
          <span aria-hidden="true">{index < step ? '✓' : index + 1}</span>{title}
        </li>)}
      </ol>
      {state.stage === 'drafts' && <>
        <h1>{state.busy ? '正在確認記事是否存好' : '先確認記事都存好了'}</h1>
        <p className="og-note">內容存到您的帳號裡，換新網址後才能接著使用。</p>
      </>}
      {state.stage === 'account' && <>
        <h1>用原來的帳號登入</h1>
        <p className="og-note">內容已保存，可以繼續。請使用您平常登入這個程式的帳號，才能接著使用原本的任務與筆記。</p>
        <div className="og-account"><span className="og-avatar" aria-hidden="true">J</span>
          <div><span className="og-caption">目前使用的帳號</span><strong>{accountLabel}</strong></div>
        </div>
        <div className="og-destination"><span className="og-caption">前往</span><strong>{targetLabel}</strong></div>

      </>}
      {state.stage === 'entry' && <>
        <h1>把 {label} 加到手機或電腦上</h1>
        <p className="og-lead">網址換了，原來的桌面圖示不會自動更新。請安裝新程式，以後就能像現在一樣，點圖示開啟 {label}。</p>
        <fieldset className="og-entry-choice"><legend>您想怎麼開啟程式？</legend>
          <label><input type="radio" name="entry-kind" checked={entryKind === 'pwa'}
            onChange={() => { setEntryKind('pwa'); setOpenedForVerification(null); }} />安裝程式</label>
          <label><input type="radio" name="entry-kind" checked={entryKind === 'bookmark'}
            onChange={() => { setEntryKind('bookmark'); setOpenedForVerification(null); }} />先用瀏覽器</label>
        </fieldset>
        {entryKind === 'pwa' ? <>
          <ol className="og-instructions">{entryInstallInstructions(platform).map(text => <li key={text}>{text}</li>)}</ol>
          <button className="og-secondary" disabled={state.busy} onClick={() => void guide.install()}>安裝 {guide.scope.entry === 'main' ? 'ProJED' : 'ProJED 建待辦'}</button>
          {state.install !== 'idle' && <p className="og-note" role="status">
            {state.install === 'accepted' ? '安裝後，請從新圖示開啟程式，看看原本的任務與筆記是否都在。'
              : state.install === 'dismissed' ? '已取消安裝，您可以稍後再做，或先用瀏覽器。'
                : '請依上方步驟把程式加到手機或電腦上，舊圖示先留著。'}
          </p>}
        </> : <p className="og-note">請把新網址加到書籤，以後就從新書籤開啟。原本的書籤不會自動換網址。</p>}
        <label className="og-confirm"><input type="checkbox" checked={opened} onChange={event => setOpenedForVerification(event.target.checked ? state.verification : null)} />
          我已從新{entryKind === 'pwa' ? '圖示' : '書籤'}開啟，帳號與資料都正確
        </label>
      </>}
      {state.issue && <p className="og-issue" role="alert">{state.issue === 'drafts' && state.drafts?.pending
        ? `還有 ${state.drafts.pending} 筆記事只留在這台手機或電腦上。請先把內容存到您的帳號裡，再繼續更換網址。`
        : issues[state.issue]}</p>}
      <div className="og-actions">
        {state.stage === 'drafts' && <button className="og-primary" disabled={state.busy} onClick={() => void guide.start()}>再檢查一次</button>}
        {state.stage === 'account' && <>
          <button className="og-primary" disabled={state.busy} onClick={() => void guide.openDestination()}>前往新網址登入 <span aria-hidden="true">↗</span></button>
          <button className="og-secondary" disabled={state.busy} onClick={() => void guide.verifyAccount()}>我已登入，繼續</button>
        </>}
        {state.stage === 'entry' && <button className="og-primary" disabled={state.busy || !opened}
          onClick={() => void guide.confirmEntry(opened)}>完成更換</button>}
        <button className="og-text" onClick={goBack}>稍後再做</button>
      </div>
    </>}
    {state.busy && <span role="status" className="og-busy">正在確認…</span>}
  </section>;
}
