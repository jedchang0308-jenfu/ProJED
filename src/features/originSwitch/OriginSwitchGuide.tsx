import { useState, useSyncExternalStore } from 'react';
import type { PwaInstallPlatform } from '../../services/pwaInstallService';
import { OriginSwitchGuide, type GuideIssue } from './guide';
import './originSwitch.css';
import { entryInstallInstructions } from './installGuidance';

const issues: Record<Exclude<GuideIssue, null>, string> = {
  drafts: '還有內容只存於本機或等待同步。請先回原入口完成儲存，再檢查一次。',
  unknown: '有一筆同步結果尚未確認。請先查回原提交結果，不要重新建立。',
  conflict: '有內容與雲端版本衝突。請先保留草稿並處理差異。',
  unbound: '有尚未確認所屬帳號的記事。請先在原入口確認同步帳號。',
  editing: '您還在編輯。請先保留輸入，完成儲存後再繼續。',
  offline: '目前無法連線。內容保留在原裝置，連線恢復後再繼續。',
  unavailable: '目前無法完成檢查。請稍後重試，仍可回原入口繼續使用。',
  login: '尚未確認新站登入。請用原帳號登入後，再檢查一次。',
  account: '新站登入的不是原帳號。請改用原帳號；不會交接這份草稿。',
  access: '尚未核對原工作區與權限。請回原入口繼續使用，稍後再試。',
  expired: '新站登入確認已逾時。請重新確認登入，草稿仍保留。',
  storage: '無法保存引導進度。請保留此頁並稍後重試，原資料不會被清除。',
};


export function OriginSwitchGuideView({ guide, accountLabel, platform, targetLabel, onReturn }: {
  guide: OriginSwitchGuide;
  accountLabel: string;
  platform: PwaInstallPlatform;
  targetLabel: string;
  onReturn(): void;
}) {
  const state = useSyncExternalStore(guide.subscribe, guide.getSnapshot);
  const [entryKind, setEntryKind] = useState<'bookmark' | 'pwa'>('pwa');
  const [openedForVerification, setOpenedForVerification] = useState<number | null>(null);
  const opened = openedForVerification === state.verification;
  const step = state.stage === 'drafts' ? 0 : state.stage === 'account' ? 1 : 2;
  const label = guide.scope.entry === 'main' ? 'ProJED 主程式' : 'ProJED 建待辦';
  const goBack = () => { guide.defer(); onReturn(); };
  return <section className="origin-guide" aria-label={`${label}新入口引導`} data-origin-guide-stage={state.stage}>
    <div className="og-product"><span className="og-mark" aria-hidden="true">P</span><span>{label}</span></div>
    {state.stage === 'intro' ? <>
      <h1>改用新的 ProJED 入口</h1>
      <p className="og-lead">先確認這台裝置的草稿，再登入新站、更新日常入口。</p>
      <div className="og-actions">
        <button className="og-primary" onClick={() => void guide.start()} disabled={state.busy}>
          {state.deferred ? '繼續上次切換' : '開始切換'}<span aria-hidden="true"> →</span>
        </button>
        <button className="og-text" onClick={goBack}>稍後，繼續用舊入口</button>
      </div>
    </> : state.stage === 'complete' ? <>
      <div className="og-done-mark" aria-hidden="true">✓</div>
      <h1>這個入口已確認完成</h1>
      <p className="og-lead">已核對原帳號、資料與新入口。其他 App 或裝置可各自稍後切換。</p>
      <p className="og-note">確認新入口日常使用正常後，再自行移除舊圖示；舊裝置的本機資料仍保留。</p>
      <button className="og-primary" onClick={onReturn}>返回</button>
    </> : <>
      <ol className="og-steps" aria-label="切換步驟">
        {['確認保存', '原帳號登入', '更新入口'].map((title, index) => <li key={title}
          className={index === step ? 'is-current' : index < step ? 'is-done' : ''}
          aria-current={index === step ? 'step' : undefined}>
          <span aria-hidden="true">{index < step ? '✓' : index + 1}</span>{title}
        </li>)}
      </ol>
      {state.stage === 'drafts' && <>
        <h1>{state.busy ? '正在檢查保存狀態' : '先把這台裝置的內容留好'}</h1>
        {state.drafts && <dl className="og-counts" aria-label="本機保存狀態">
          <div><dt>待同步</dt><dd>{state.drafts.pending}</dd></div>
          <div><dt>結果未確認</dt><dd>{state.drafts.unknown}</dd></div>
          <div><dt>需處理差異</dt><dd>{state.drafts.conflicts + state.drafts.unbound}</dd></div>
        </dl>}
        <p className="og-note">「已存本機」不代表已同步；未確認前不會跳過這一步。</p>
      </>}
      {state.stage === 'account' && <>
        <h1>用原來的帳號登入新站</h1>
        <div className="og-account"><span className="og-avatar" aria-hidden="true">J</span>
          <div><span className="og-caption">這個入口目前的帳號</span><strong>{accountLabel}</strong></div>
        </div>
        <div className="og-destination"><span className="og-caption">前往</span><strong>{targetLabel}</strong></div>
        <p className="og-note">新站會建立自己的登入狀態，並核對原工作區與權限。</p>
      </>}
      {state.stage === 'entry' && <>
        <h1>更新您每天開啟的入口</h1>
        <p className="og-lead">原帳號與資料已核對。這個步驟只處理 {label}。</p>
        <fieldset className="og-entry-choice"><legend>慣用入口</legend>
          <label><input type="radio" name="entry-kind" checked={entryKind === 'pwa'}
            onChange={() => { setEntryKind('pwa'); setOpenedForVerification(null); }} />桌面／主畫面圖示</label>
          <label><input type="radio" name="entry-kind" checked={entryKind === 'bookmark'}
            onChange={() => { setEntryKind('bookmark'); setOpenedForVerification(null); }} />瀏覽器書籤</label>
        </fieldset>
        {entryKind === 'pwa' ? <>
          <ol className="og-instructions">{entryInstallInstructions(platform).map(text => <li key={text}>{text}</li>)}</ol>
          <button className="og-secondary" disabled={state.busy} onClick={() => void guide.install()}>安裝新入口</button>
          {state.install !== 'idle' && <p className="og-note" role="status">
            {state.install === 'accepted' ? '已送出安裝要求，尚未確認完成。請從新圖示開啟並核對資料。'
              : state.install === 'dismissed' ? '已取消安裝，仍可稍後再做或改用書籤。'
                : '請依上方瀏覽器步驟安裝；這裡不會自動移除舊圖示。'}
          </p>}
        </> : <p className="og-note">在新站重新加入書籤，再從這個新書籤開啟；原本的書籤不會自動改網址。</p>}
        <label className="og-confirm"><input type="checkbox" checked={opened} onChange={event => setOpenedForVerification(event.target.checked ? state.verification : null)} />
          我已從新{entryKind === 'pwa' ? '圖示' : '書籤'}開啟，並確認帳號與資料正確
        </label>
      </>}
      {state.issue && <p className="og-issue" role="alert">{issues[state.issue]}</p>}
      <div className="og-actions">
        {state.stage === 'drafts' && <button className="og-primary" disabled={state.busy} onClick={() => void guide.start()}>重新檢查保存狀態</button>}
        {state.stage === 'account' && <>
          <button className="og-primary" disabled={state.busy} onClick={() => void guide.openDestination()}>前往新站登入 <span aria-hidden="true">↗</span></button>
          <button className="og-secondary" disabled={state.busy} onClick={() => void guide.verifyAccount()}>我已登入，重新檢查</button>
        </>}
        {state.stage === 'entry' && <button className="og-primary" disabled={state.busy || !opened}
          onClick={() => void guide.confirmEntry(opened)}>確認完成</button>}
        <button className="og-text" onClick={goBack}>稍後，回舊入口</button>
      </div>
    </>}
    {state.busy && <span role="status" className="og-busy">檢查中…</span>}
  </section>;
}
