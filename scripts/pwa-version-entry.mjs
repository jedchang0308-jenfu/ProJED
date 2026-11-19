/* global window, document, location, HTMLScriptElement, HTMLLinkElement, DOMParser */
import fs from 'node:fs';
import path from 'node:path';

// Serialized into the stable HTML; deliberately independent of application chunks/SW.
export async function bootPinnedVersion(latestVersion, entryPath) {
  const tabKey = 'projed:pwa:tab-version:v1';
  const adoptedKey = 'projed:pwa:adopted-version:v1';
  const navigationKey = 'projed:pwa:version-navigation:v1';
  const valid = value => typeof value === 'string' && /^(release|build):[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value);
  let version;
  let mayAdopt = false;
  let storageError = false;
  try {
    const tab = sessionStorage.getItem(tabKey);
    const adopted = localStorage.getItem(adoptedKey);
    const requested = new URL(location.href).searchParams.get('projed_update_latest');
    let reservation;
    try { reservation = JSON.parse(sessionStorage.getItem(navigationKey) || 'null'); } catch { /* Ignore malformed reservations. */ }
    sessionStorage.removeItem(navigationKey);
    const reserved = valid(requested) && reservation?.version === requested
      && Number.isFinite(reservation.createdAt) && Date.now() - reservation.createdAt >= 0
      && Date.now() - reservation.createdAt < 120000;
    // Invalid existing records must never turn into implicit consent to update.
    if (!reserved && !tab && !adopted) {
      try {
        const response = await fetch('/app-shell-meta.json?initial=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        const current = response.ok ? (await response.json()).version : null;
        if (valid(current)) latestVersion = current;
      } catch { /* Offline first use may use the available worker's shell. */ }
    }
    version = reserved ? requested : (tab || adopted || latestVersion);
    mayAdopt = reserved || (!tab && !adopted);
    if (!valid(version)) throw new Error('version-record-invalid');
  } catch { storageError = true; }

  const showRecovery = (message) => {
    if (document.getElementById('projed-entry-recovery')) return;
    const panel = document.createElement('section');
    panel.id = 'projed-entry-recovery';
    panel.setAttribute('role', 'alert');
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f8fafc;color:#0f172a;padding:10vh 8vw;font:16px/1.7 system-ui;overflow:auto';
    const heading = document.createElement('h1'); heading.textContent = 'ProJED 載入未完成';
    const detail = document.createElement('p'); detail.textContent = message;
    const retry = document.createElement('button'); retry.textContent = '重試原版本';
    retry.onclick = () => {
      if (mayAdopt && valid(version)) {
        try { sessionStorage.setItem(navigationKey, JSON.stringify({ version, createdAt: Date.now() })); } catch { return; }
        const url = new URL(location.href); url.searchParams.set('projed_update_latest', version);
        location.replace(url.href);
      } else location.reload();
    };
    const update = document.createElement('button'); update.textContent = '檢查並更新';
    update.style.marginLeft = '16px';
    update.onclick = async () => {
      update.disabled = true;
      try {
        const response = await fetch('/app-shell-meta.json?manual=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('metadata-unavailable');
        let latest = (await response.json()).version;
        if (!valid(latest)) throw new Error('metadata-invalid');
        // A changed target is shown for an explicit second click, never silently applied.
        detail.textContent = '可更新至 ' + latest + '。登入與本機資料會保留。';
        update.textContent = '更新至此版本';
        update.onclick = async () => {
          update.disabled = true;
          try {
            const readback = await fetch('/app-shell-meta.json?confirm=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!readback.ok) throw new Error('metadata-unavailable');
            const current = (await readback.json()).version;
            if (!valid(current)) throw new Error('metadata-invalid');
            if (current !== latest) {
              latest = current;
              detail.textContent = '可用版本已變更為 ' + latest + '，請再次按更新確認。';
              return;
            }
            sessionStorage.setItem(navigationKey, JSON.stringify({ version: latest, createdAt: Date.now() }));
            const url = new URL(location.href); url.searchParams.set('projed_update_latest', latest);
            location.replace(url.href);
          } catch { detail.textContent = '無法確認或保存版本選擇，請確認連線與瀏覽器儲存設定後重試。'; }
          finally { update.disabled = false; }
        };
      } catch { detail.textContent = '目前無法取得新版，請確認連線後重試。原有資料未清除。'; }
      update.disabled = false;
    };
    panel.append(heading, detail, retry, update);
    (document.body || document.documentElement).append(panel);
  };
  if (storageError) {
    showRecovery('無法讀取已採用版本，請確認瀏覽器儲存設定。您也可以手動選擇更新。');
    return;
  }
  const boot = { version, mayAdopt, confirmed: false };
  window.__PROJED_VERSION_BOOT__ = boot;
  const fail = () => { if (!boot.confirmed) showRecovery('原版本的檔案未能載入，可能暫時離線或已停止提供。請重試，或手動檢查更新。'); };
  const onError = event => {
    const target = event.target;
    const source = target instanceof HTMLScriptElement ? target.src : target instanceof HTMLLinkElement ? target.href : '';
    if (source) {
      const url = new URL(source, location.href);
      // Optional Google scripts/fonts are not evidence that application chunks failed.
      if (url.origin === location.origin && /^\/(app-releases|assets)\//.test(url.pathname)) fail();
    }
  };
  boot.timer = window.setTimeout(fail, 30000);
  fetch('/app-releases/' + version.replace(':', '-') + '/' + entryPath, { cache: 'no-cache' })
    .then(async response => {
      if (!response.ok) throw new Error('version-unavailable');
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      if (parsed.querySelector('meta[name="projed-shell-version"]')?.getAttribute('content') !== version) {
        throw new Error('version-mismatch');
      }
      // Original location, OAuth query/hash, history and PWA scope stay unchanged.
      document.open(); document.write(html); document.close();
      // document.open clears Window listeners, so install recovery after replacement.
      window.addEventListener('error', onError, true);
      window.addEventListener('unhandledrejection', fail);
    }).catch(fail);
}

export function createPinnedEntryHtml(version, entryPath) {
  return '<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>ProJED</title>'
    + '<link rel="manifest" href="' + (entryPath.startsWith('quick-task/') ? '/quick-task/manifest.webmanifest' : '/manifest.webmanifest') + '"></head><body><p role="status">正在載入 ProJED…</p><noscript>請啟用 JavaScript 以載入您已採用的版本。</noscript><script>('
    + bootPinnedVersion.toString() + ')(' + JSON.stringify(version) + ',' + JSON.stringify(entryPath) + ');</script></body></html>\n';
}

export function pinnedVersionEntryPlugin(version) {
  if (!/^(release|build):[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(version)) throw new Error('DEV-141 invalid release identity');
  let publicDir;
  return {
    name: 'projed-pinned-version-entry',
    enforce: 'post',
    apply: 'build',
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle: {
      // Vite's own build-import-analysis runs after user plugins by plugin order.
      // Rollup hook ordering is needed to snapshot its finalized preload code.
      order: 'post',
      handler(_options, bundle) {
      const prefix = 'app-releases/' + version.replace(':', '-') + '/';
      // Snapshot every application bundle and public resource, not just initial chunks.
      const originals = Object.values(bundle);
      for (const item of originals) {
        const source = item.type === 'chunk' ? item.code : item.source;
        if (item.fileName.endsWith('.html')) continue;
        this.emitFile({ type: 'asset', fileName: prefix + item.fileName, source });
      }
      const copyPublic = (dir, relative = '') => {
        if (!dir || !fs.existsSync(dir)) return;
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const name = relative + item.name;
          if (item.isDirectory()) copyPublic(path.join(dir, item.name), name + '/');
          else if (item.isFile()) this.emitFile({ type: 'asset', fileName: prefix + name, source: fs.readFileSync(path.join(dir, item.name)) });
        }
      };
      copyPublic(publicDir);
      for (const entryPath of ['index.html', 'quick-task/index.html']) {
        const entry = bundle[entryPath];
        if (!entry || entry.type !== 'asset') throw new Error('DEV-141 application entry missing: ' + entryPath);
        const html = String(entry.source).replace(/((?:src|href)=["'])\/(assets|icons)\//g, '$1/' + prefix + '$2/');
        this.emitFile({ type: 'asset', fileName: prefix + entryPath, source: html });
        entry.source = createPinnedEntryHtml(version, entryPath);
      }
      },
    },
  };
}
