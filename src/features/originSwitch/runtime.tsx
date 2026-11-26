import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { httpApiClient } from '../../services/httpApi/backend';
import { getPwaInstallContext, promptPwaInstall, setupPwaInstallPromptListener } from '../../services/pwaInstallService';
import { OriginSwitchGuide, type GuideEntry } from './guide';
import { OriginSwitchGuideView } from './OriginSwitchGuide';
import { createHttpGuideDraftInspector } from './httpDraftInspector';
import { confirmOriginSwitchDestination, createHttpOriginSwitchAdapter, createSourceOriginSwitchConnection,
  type OriginSwitchConfig } from './httpOriginSwitch';
import { locatorStorageKey, readOriginSwitchLocator } from './locator';
import type { LocalInventoryPorts } from './localDraftInventory';
import { entryInstallInstructions } from './installGuidance';

interface EntryOptions {
  entry: GuideEntry;
  accountId: string;
  accountLabel: string;
  current(): boolean;
  activity: LocalInventoryPorts['activity'];
}

function Source({ guide, label }: { guide: OriginSwitchGuide; label: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return <>
    <button type="button" className="origin-switch-offer" onClick={() => setOpen(true)}>更換網址</button>
    <dialog ref={dialog} className="origin-switch-dialog" onCancel={() => { guide.defer(); setOpen(false); }}>
      <OriginSwitchGuideView guide={guide} accountLabel={label} platform={getPwaInstallContext().platform}
        targetLabel={guide.scope.targetOrigin} sourceGuide onReturn={() => setOpen(false)}
        onComplete={() => void guide.useDestination()} />
    </dialog>
  </>;
}

function Destination({ id, config, options }: { id: string; config: OriginSwitchConfig; options: EntryOptions }) {
  const [state, setState] = useState<'idle' | 'busy' | 'verified' | 'failed'>('idle');
  const [source, setSource] = useState<string | null>(null);
  const [install, setInstall] = useState('');
  const verify = async () => {
    if (!options.current() || state === 'busy') return;
    setState('busy');
    try {
      const receipt = await confirmOriginSwitchDestination(id, config, options.entry, httpApiClient, window.location.origin, sessionStorage);
      if (!options.current()) return;
      sessionStorage.removeItem(locatorStorageKey(options.entry));
      setSource(new URL(options.entry === 'quick' ? '/quick-task/' : '/', receipt.sourceOrigin).href);
      setState('verified');
    } catch { if (options.current()) setState('failed'); }
  };
  return <section className="origin-switch-target" aria-label="確認新網址">
    <p>{state === 'verified' ? '新網址的帳號與權限已確認，請回原網址完成記事檢查。'
      : state === 'failed' ? '目前無法確認，請確認使用原來的帳號後再試。'
        : '已登入新網址，請確認原來的帳號與權限。'}</p>
    <div className="og-actions">
      <button type="button" disabled={state === 'busy'} onClick={() => void verify()}>
        {state === 'busy' ? '正在確認…' : state === 'verified' ? '重新確認' : '確認帳號與權限'}
      </button>
      {state === 'verified' && <>
        <button type="button" onClick={() => {
          if (!options.current()) return;
          void promptPwaInstall().then(choice => {
            if (options.current()) setInstall(choice ? (choice.outcome === 'accepted' ? '已接受安裝。' : '已取消安裝。')
              : '請從瀏覽器選單將新網址加到主畫面或安裝程式。');
          }).catch(() => { if (options.current()) setInstall('目前無法安裝，請稍後再試。'); });
        }}>安裝新程式</button>
        {source && <a href={source} onClick={() => { sessionStorage.removeItem(locatorStorageKey(options.entry)); }}>回原網址繼續</a>}
      </>}
    </div>
    {state === 'verified' && <>
      <ol className="og-instructions">{entryInstallInstructions(getPwaInstallContext().platform).map(text => <li key={text}>{text}</li>)}</ol>
      <p>安裝後，請從新圖示開啟，確認原本的帳號與資料都正確，再回原網址完成最後確認。原圖示與記事先保留。</p>
    </>}
    {install && <p role="status">{install}</p>}
  </section>;
}

/** Called only after normal auth has bound an actor. Config lookup and the
 * React island never delay the cached editor or replace its DOM/lifecycle. */
export async function installOriginSwitchEntry(options: EntryOptions): Promise<() => void> {
  const adapter = createHttpOriginSwitchAdapter(httpApiClient);
  if (adapter.actor.accountId !== options.accountId || !options.current()) return () => undefined;
  const current = () => {
    try {
      const actor = httpApiClient.snapshotExpectedActor();
      return options.current() && actor.accountId === adapter.actor.accountId && actor.contextId === adapter.actor.contextId;
    } catch { return false; }
  };
  const config = await adapter.config();
  if (!config || !current()) return () => undefined;
  const scoped = { ...options, current };
  const locator = readOriginSwitchLocator(options.entry, sessionStorage);
  const targets = config.routes.filter(route => route.entry === options.entry && route.targetOrigin === window.location.origin);
  const sources = config.routes.filter(route => route.entry === options.entry && route.sourceOrigin === window.location.origin);
  let guide: OriginSwitchGuide | undefined;
  if (!(locator && targets.length) && sources.length !== 1) return () => undefined;
  const host = document.createElement('div');
  host.dataset.originSwitchEntry = options.entry;
  document.body.append(host);
  const root = createRoot(host);
  if (locator && targets.length) {
    setupPwaInstallPromptListener();
    root.render(<Destination id={locator} config={config} options={scoped} />);
  } else {
    const route = sources[0];
    const scope = { ...route, campaign: config.campaign, accountId: options.accountId };
    const connection = createSourceOriginSwitchConnection(scope, httpApiClient, sessionStorage, url => {
      if (!current()) throw new Error('ORIGIN_SWITCH_ACTOR_CHANGED');
      window.location.assign(url);
    });
    const inspectDrafts = createHttpGuideDraftInspector(scope, route.sourceSessionEntry, httpApiClient,
      () => ({ ...options.activity(), current: current() && options.activity().current }));
    guide = new OriginSwitchGuide(scope, [route.targetOrigin], { ...connection, inspectDrafts }, sessionStorage);
    root.render(<Source guide={guide} label={options.accountLabel} />);
  }
  let disposed = false;
  const onPageHide = () => { guide?.defer(); };
  window.addEventListener('pagehide', onPageHide);
  const dispose = () => {
    if (disposed) return;
    disposed = true; unsubscribe(); window.removeEventListener('pagehide', onPageHide); guide?.dispose(); root.unmount(); host.remove();
  };
  const unsubscribe = httpApiClient.subscribeExpectedActor(() => { if (!current()) dispose(); });
  return dispose;
}
