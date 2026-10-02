# SPEC-041: PWA 更新通知與快取恢復

狀態: DEV-041 Historical Production Release Deployed / DEV-096 Implemented Local Baseline / DEV-097 RD Implemented / Local Automated QA PASS / Independent QC PASS / Physical Device Supplemental Not Verified / Not Released
關聯 DEV: DEV-041 / DEV-096 / DEV-097
關聯 ADR: ADR-047 PWA每分頁重新載入隔離與Workbox effect ownership
節點類型: 交付點
父交付點: Production release readiness / PWA lifecycle reliability
是否計入產品交付完成: 是，限正式部署前的使用者更新可見性、快取恢復與版本切換可靠性
建立日期: 2026-07-05

## Human Decision Brief

Authority note：本節保留 DEV-041 原始決策的歷史背景；normal update 的現行產品契約以
本文後段 `DEV-097 Contract Addendum` 為準。DEV-096 保留已實作 baseline 與 local evidence，
但其「一般更新一律等待點擊」語意已由使用者 2026-08-31 的 `1A／2A／3A` 決策取代。

原始需求:
- 使用者想把新版本部署到正式環境，但觀察到使用者常常不知道有更新，或快取未清造成異常。
- 使用者詢問是否可像市面 APP 一樣提供「更新通知」與「更新按鈕」。
- PM/HCS 判斷：可以，且應在正式部署前先完成；正常更新不宜強制即時刷新，需提供可見提示與手動更新入口，異常快取才走較強恢復。

已確認決策:
- 正式環境更新需有使用者可見的更新狀態，不再只靠 service worker 背景更新。
- 需要提供「更新」按鈕，讓使用者主動套用新版本。
- 正常更新以 prompt / banner / toast 等非破壞式 UI 呈現，不在使用者操作中突然重整。
- cache / chunk-load 類異常需提供恢復路徑，避免使用者卡在舊 bundle 或白畫面。

AI 補充假設:
- Phase 1 不新增後端 schema、Supabase migration、release API、push notification 或原生 app store 流程。
- Phase 1 沿用現有 Vite PWA 架構：`vite-plugin-pwa`、`registerType: 'prompt'`、`skipWaiting: false`。
- 更新 UI 採全域掛載，不綁定特定看板或頁面。
- 使用者按下更新後可 reload；未按更新前不得中斷正在編輯或拖曳中的工作。
- 嚴重 cache recovery 可比正常更新更積極，但必須有 reload loop guard。

需要人類重新授權的決策:
- 目前 DEV-041 production release 已於 2026-07-05 授權並完成；後續版本或再次部署仍需重新授權並走 release gate。
- 是否要做強制更新 / mandatory update policy。
- 是否要新增遠端 release notes、版本 API、analytics、通知推播或管理員發布儀表板。
- 是否允許清除使用者本地資料以外的 cache / storage 範圍。

## Current Architecture

目前 repo 已有 PWA 基礎，但缺少可見更新 UI:
- `vite.config.js` 使用 `VitePWA({ registerType: 'prompt', injectRegister: false })`。
- `vite.config.js` 已設定 `workbox.cleanupOutdatedCaches: true`、`clientsClaim: true`、`skipWaiting: false`。
- `src/main.tsx` 呼叫 `setupPwaLifecycle()` 與 `setupPwaInstallPromptListener()`。
- `src/services/pwaUpdateService.ts` 透過 `registerSW()` 接收 `onNeedRefresh`、`onOfflineReady`、`onRegisteredSW`、`onRegisterError`。
- `src/services/pwaUpdateService.ts` 目前在 `onNeedRefresh()` 中 queue `updateSW(true)`，並嘗試背景套用；尚未對 UI 發出明確「可更新」狀態。
- `src/main.tsx` 已有 dynamic import / chunk load error 的全域 reload handler。
- `src/components/GlobalErrorBoundary.tsx` 已有錯誤恢復與 reload 入口，但尚未形成 PWA update / cache recovery 的統一 UX。
- `firebase.json` 已對 `**`、`/index.html`、`/assets/**`、`/sw.js`、`/sw-kill.js` 設定 no-cache / no-store 類 headers。

現況問題:
- 使用者可能長時間留在已開啟分頁，不知道已有新版本。
- `onNeedRefresh` 沒有可見 UI，更新狀態對使用者與 QA 都不可觀測。
- chunk-load 失敗雖可能 reload，但缺少明確使用者說明與 loop guard evidence。
- cache 相關異常與一般 React ErrorBoundary 的恢復入口尚未整合成可驗收行為。
- production deploy 前沒有「版本更新提示是否可用」的 release gate evidence。

## End-State Architecture

```mermaid
flowchart TD
  subgraph Build["Build / Hosting"]
    A["Vite build assets"]
    B["Service worker manifest"]
    C["Firebase hosting headers"]
  end

  subgraph PWA["PWA lifecycle service"]
    D["registerSW()"]
    E["onNeedRefresh"]
    F["onOfflineReady"]
    G["checkForUpdate()"]
    H["applyUpdate()"]
    I["cacheRecovery()"]
  end

  subgraph State["Client update state"]
    J["idle / checking"]
    K["update-available"]
    L["applying"]
    M["offline-ready"]
    N["recoverable-cache-error"]
    O["failed"]
  end

  subgraph UI["Global UI"]
    P["AppUpdatePrompt"]
    Q["Update button"]
    R["Dismiss later"]
    S["Cache recovery action"]
  end

  subgraph Errors["Runtime recovery"]
    T["chunk-load handler"]
    U["GlobalErrorBoundary"]
  end

  A --> B
  B --> D
  C --> D
  D --> E
  D --> F
  D --> G
  E --> K
  F --> M
  G --> J
  K --> P
  M --> P
  P --> Q
  P --> R
  Q --> H
  T --> N
  U --> N
  N --> P
  P --> S
  S --> I
```

目標架構:
- `pwaUpdateService` 成為 PWA lifecycle 的單一資料源，負責更新檢查、更新可用、套用更新、離線可用、cache recovery 與錯誤狀態。
- 全域 UI 透過 subscription、custom event 或 store 取得 update state，顯示 `AppUpdatePrompt`。
- `AppUpdatePrompt` 提供更新按鈕、稍後再說與 cache recovery 行動。
- chunk-load error 與 ErrorBoundary 不各自散落 reload 邏輯；應協調到同一套 recovery guard。
- production release gate 要能驗證「新版本可提示、可套用、異常可恢復、沒有 reload loop」。

## Phase 1 Scope

Phase 1 名稱: Visible PWA Update Prompt & Cache Recovery

包含:
- 新增或擴充 `pwaUpdateService` 的 update state model。
- `onNeedRefresh` 不只 queue `updateSW(true)`，還必須對 UI 發出 `update-available`。
- 新增全域 `AppUpdatePrompt` 或等效元件。
- 更新按鈕執行 `updateSW(true)` 或 service 封裝的 `applyUpdate()`，並進入 `applying` 狀態。
- 提供 session-level dismiss / later，避免提示頻繁打斷，但不能丟失已知更新狀態。
- chunk-load / stale asset failure 需顯示或觸發可驗收的 recovery path。
- 加入 reload loop guard，例如以 sessionStorage 記錄 recovery attempt timestamp / count。
- `GlobalErrorBoundary` 的 reload / cache clear 行為與 PWA recovery 文案及流程一致。
- 補 static verifier、browser verifier 與 QA 文件 evidence 要求。

不包含:
- 正式環境部署。
- Firebase Hosting deploy 或 production smoke。
- Supabase schema、RLS、RPC、migration。
- 強制更新政策。
- release notes 後端、遠端版本 API、admin release dashboard。
- push notification、email notification、App Store / Play Store 更新流程。
- analytics / telemetry。

## RD Handoff Contract

主要 touchpoints:
- `src/services/pwaUpdateService.ts`
- `src/main.tsx`
- `src/App.tsx` 或全域 layout 掛載點
- `src/components/AppUpdatePrompt.tsx` 或等效新元件
- `src/components/GlobalErrorBoundary.tsx`
- `vite.config.js` 僅在必要時調整，不得無故改成強制更新
- `scripts/verify-dev-041-pwa-update-notification-cache-recovery.mjs`
- `scripts/verify-dev-041-pwa-update-notification-cache-recovery-browser.pw.js`

資料與狀態契約:
- PWA service 必須暴露目前 update state。
- 最低必要 state:
  - `idle`
  - `checking`
  - `update-available`
  - `applying`
  - `offline-ready`
  - `recoverable-cache-error`
  - `failed`
- UI 不得直接散落呼叫 `registerSW()`；service 是單一入口。
- `update-available` 必須保留已知更新狀態；若有 service worker update callback，dismiss 不得清掉它。使用者主動套用時，可捨棄可能 stale 的 queued callback，改走最新 app shell reload path。
- `dismiss` 不得把 service worker 已知更新清掉；只能隱藏本 session 或降低提示頻率。
- `applyUpdate()` 必須具備 applying state、error state 與 reload guard。

UI 契約:
- 更新提示需在 desktop 與 mobile viewport 可見，不被既有 panel、modal、toast 或 safe area 裁切。
- 文案須短而具體，例如「有新版本可用」與「一鍵更新到最新版」。
- 按鈕名稱不可使用含糊詞，例如只寫「確定」。
- 更新按鈕需有 disabled / applying state，避免連點造成多次 reload。
- cache recovery 狀態需明確區分一般更新，不得讓使用者以為資料被刪除。
- 若提供「清除快取並重新整理」，應只清除 Cache Storage / service worker registration；不得清除業務資料 storage，除非另有授權。

錯誤恢復契約:
- stale chunk / dynamic import failure 不得無限 reload。
- 若已在短時間內嘗試過 reload，第二次應顯示 recovery UI 或 ErrorBoundary，讓使用者手動執行清除快取。
- `GlobalErrorBoundary` 可以提供「重新整理」與「清除快取後重新整理」，但清除快取必須有明確作用範圍。
- SW unregister / caches.delete 不得自動執行；但 2026-07-07 起，使用者主動按下「一鍵更新到最新版」時，可清除 Cache Storage / service worker registration 後 reload 最新 app shell，以避免 stale queued worker callback。此流程不得清除 `localStorage` / `sessionStorage` / IndexedDB 業務資料。

相容性契約:
- 不得破壞 DEV-034 PWA install guidance。
- 不得破壞目前登入、看板、任務台與手機 pan-first 操作。
- 不得在使用者拖曳、輸入、modal 編輯中強制刷新。
- 不得把 production deploy 包進本 DEV-041 Phase 1 implementation。

## Acceptance Criteria

功能驗收:
- 當 `onNeedRefresh` 觸發時，畫面出現可見更新提示。
- 更新提示包含明確「更新」按鈕。
- 按下更新後只執行一次套用流程，並可 reload 到新版本。
- 使用者按稍後或關閉提示後，本 session 不被反覆打擾，但已知更新狀態不被錯誤遺失。
- `onOfflineReady` 可顯示低干擾訊息或被 service 狀態記錄，不與更新提示混淆。
- chunk-load / stale asset failure 有可驗收 recovery path。
- reload / recovery 具備 loop guard。
- ErrorBoundary 中的恢復入口與 PWA recovery 行為一致。

UI / RWD 驗收:
- 390x844 mobile viewport 下提示可見、按鈕可點、文字不溢出、不擋住關鍵操作超過必要範圍。
- 1440x900 desktop viewport 下提示位置合理，不遮蔽主要工作流。
- 更新提示不使用過大 hero、卡片堆疊或裝飾性元素。
- keyboard focus、ARIA label / role、button disabled state 可驗證。

回歸驗收:
- DEV-034 PWA install guidance 仍可正常運作。
- `npm.cmd exec tsc -- --noEmit` 通過。
- `npm.cmd run build:test` 通過。
- 現有 task workbench / board interaction verifier 不因全域提示掛載而失敗。

不准宣稱:
- Phase 1 local gate 完成前，不准宣稱 production deploy 完成。
- 2026-07-05 production release 完成後，只能依 `ai-doc/qc/QC-DEV-041-pwa-update-notification-cache-recovery.md` 宣稱該 release 的 production smoke 通過。
- 不准宣稱所有使用者快取問題永久消失。
- 不准宣稱後續版本正式站已驗證，除非另走 deployment-release-gate 並留下 evidence。

## RD Implementation Summary

2026-07-05 Phase 1 已完成前端實作:
- `src/services/pwaUpdateService.ts` 擴充為 PWA lifecycle 單一資料源，提供 update state、subscription、`projed:pwa-update-state` event、`applyPwaUpdate()`、`dismissPwaUpdatePrompt()`、`clearPwaApplicationCacheAndReload()` 與 `handleRecoverableAppLoadError()`。
- `onNeedRefresh` 會保留 queued update callback 並發出 `update-available`，不再只有背景套用。
- 新增 `src/components/AppUpdatePrompt.tsx`，全域顯示「有新版本可用」與「一鍵更新到最新版」按鈕，支援稍後、applying disabled state、recoverable load failure 與 cache recovery action。
- `src/main.tsx` 的 chunk-load / dynamic import failure 改走 PWA recovery handler，具備 session-level reload loop guard。
- `src/components/GlobalErrorBoundary.tsx` 的清除入口改為只清除應用程式快取與 service worker registration，不再清除 `localStorage` / `sessionStorage` 業務資料。
- 新增 DEV-041 static/browser verifiers，並把 script 掛進 `package.json`。
- 2026-07-05 mobile update visibility hotfix：新增 app shell bundle hash 記錄與 no-store `index.html` 比對；若已載入新版，顯示 `updated` state 與「已更新到新版 / 目前已是最新版本」提示，避免使用者以為沒有更新。
- 2026-07-07 one-click latest hotfix：更新按鈕不再執行可能 stale 的 queued service worker callback；會重新檢查 app shell、清除 app Cache Storage / service worker registration，並以 `projed_update_latest` cache-busting query reload 最新 app shell。本 hotfix 已完成 local static/browser QC，尚未執行 production deploy。

Production release note:
- 2026-07-05 已完成 local QC、production artifact smoke、Firebase Hosting deploy、post-deploy browser smoke 與 authenticated production UI smoke。
- 2026-07-05 hotfix 後正式站載入 `assets/index-BXtRfIba.js`，手機更新可見性補強已通過 local/browser/production smoke。
- QC report: `ai-doc/qc/QC-DEV-041-pwa-update-notification-cache-recovery.md`

## QA / QC Gate

Phase 1 RD 完成後至少需要:
- `npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery`
- `npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser`
- `npm.cmd run verify:dev-034-pwa-install-guidance`
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`

建議 regression smoke:
- 任務台主要操作 smoke。
- Board mobile pan-first smoke。
- Login/authenticated route smoke。
- ErrorBoundary recovery smoke。

Production deploy gate:
- 本 DEV 文件與 local QC 完成後，仍不得直接宣稱可部署。
- 若使用者授權正式部署，必須改走 `deployment-release-gate`：
  - 確認 git branch / dirty worktree / release scope。
  - 建置 production artifact。
  - production-like smoke。
  - Firebase Hosting deploy evidence。
  - post-deploy smoke。
  - rollback readiness。
  - 新版本提示與 cache recovery 的 production smoke。

## Deferred Scope Audit

| 範圍 | 狀態 | 原因 / 下次入口 |
|---|---|---|
| DEV-041 Phase 1 Visible PWA Update Prompt & Cache Recovery | Local + Browser QC Passed / Authorized / Complete | 2026-07-05 已完成 RD、local static/browser QC、DEV-034 regression、TypeScript 與 build gate；2026-07-07 one-click latest hotfix 已完成 local static/browser QC，production deploy 未執行。 |
| DEV-041 Phase 2 Production Release Gate | Production Release Deployed / Post-Deploy Smoke Passed / Authorized / Complete | 2026-07-05 已完成 Firebase Hosting deploy、post-deploy HTTP/browser smoke 與 authenticated production UI smoke；證據在 `ai-doc/qc/QC-DEV-041-pwa-update-notification-cache-recovery.md`。 |
| Mandatory update / forced refresh policy | RD Contract Ready / Not Authorized | 牽涉使用者工作中斷風險，需另行決策。 |
| Remote release notes / version API | Deferred / New DEV Candidate | 需要後端或 release metadata 來源，目前不是必要 MVP。 |
| Update adoption analytics | Deferred / New DEV Candidate | 需要 analytics policy 與隱私邊界。 |
| Push notification / email notification | Deferred / No Tracking Until Requested | 超出 PWA in-app update prompt 範圍。 |
| DB schema / Supabase migration / RLS | Not In Scope | Phase 1 不需要資料庫變更。 |
| Future production deploy / Firebase Hosting release | Blocked Human Re-entry | 目前 DEV-041 release 已完成；後續任一新版本部署仍需使用者另行授權並走 release gate。 |

## DEV-096 Corrective Addendum（2026-08-30）

### Authority 與更正範圍

本附錄為 DEV-096 的現行 RD 實作權威，保留 DEV-041 已發布的歷史事實，但取代下列現行產品語意：

- 一般更新 CTA 由「一鍵更新到最新版」改為「一鍵更新」。
- 一般更新提示刪除左側圖示、說明段落、版本 badge 與其所占空間；只保留標題、關閉、「一鍵更新」與「稍後」。
- 取代 2026-07-07 one-click latest hotfix 的 normal-path unregister／Cache Storage delete。正常 apply 必須走 waiting worker／`updateSW()`／controlling reload；清 SW／Cache 只保留為使用者主動的失敗恢復。
- 移除 background、hidden、`pagehide` 自動 apply。visibility 只允許執行 update check，不得在使用者未確認時接管或 reload。
- callback resolve 或 state 回到 `idle` 不再代表成功；唯一成功條件是 reload 後 `currentVersion === targetVersion`。

DEV-041 歷史 QC 與 production release note 不回填為 DEV-096 PASS。舊 QA B02 的 exact CTA、C01～C04 的 normal cache-purge 路徑為 historical baseline；DEV-096 以 `ai-doc/qa/QA-DEV-096-pwa-update-transaction-convergence.md` 為現行驗證權威。

### Version Identity Contract

- Production canonical identity 固定為 `release:<releaseId>`。`scripts/release/build-production-artifact.mjs` 已將 `PROJED_RELEASE_ID` 傳入 sealed build；`vite.config.js` 必須將其 define 為 `import.meta.env.VITE_PROJED_RELEASE_ID`，並在 `src/vite-env.d.ts` 宣告。
- Current identity 來自 bundle 內注入值；latest identity 來自 `cache: 'no-store'` 的 `/release-meta.json?projed_update_check=<nonce>`，只接受 `schemaVersion: 1` 與非空 `releaseId`。
- Local／test 沒有 release metadata 時才可用 `bundle:<entryHash>` fallback。不同 namespace 不相等；production 空值、malformed metadata 或 namespace mismatch 必須 fail closed，不得顯示假成功。
- `scripts/release/verify-production-artifact.mjs` 驗證 injected release ID、`release-meta.json.releaseId`、manifest `releaseId` 三者相同；任一不一致為 P0 artifact failure。

### Persisted Transaction Contract

新增 `src/services/pwaUpdateTransaction.ts` 作為 pure state authority：

```ts
type PwaUpdatePhase =
  | 'available'
  | 'applying'
  | 'awaiting-controller'
  | 'verifying'
  | 'recovering'
  | 'failed'

interface PwaUpdateTransactionV1 {
  schemaVersion: 1
  transactionId: string
  sourceVersion: string
  targetVersion: string
  phase: PwaUpdatePhase
  ownerTabId: string
  ownerFence: number
  normalReloadReserved: boolean
  recoveryAttemptCount: 0 | 1
  createdAt: number
  updatedAt: number
  leaseExpiresAt: number
  errorCode?: string
}
```

Storage ownership：

- localStorage：`projed.pwa-update.transaction.v1`、`projed.pwa-update.completed-version.v1`。
- sessionStorage：`projed.pwa-update.tab-id.v1`、`projed.pwa-update.dismissed-target.v1`、`projed.pwa-update.recovery.v1`。
- IndexedDB fallback：獨立 PWA DB `projed-pwa-update-v1` 的 `locks` store，只用於不支援 Web Locks 時的原子 owner lease；不得與業務 IndexedDB 共用 store 或清除業務資料。
- Broadcast channel：`projed.pwa-update.v1`；不支援 BroadcastChannel 時使用 localStorage `storage` event。
- channel 訊息只能當 change signal；接收端必須重讀 persisted transaction 並通過 strict parser。未知 schema、非法 phase、空 version、非有限 timestamp、target downgrade 或非法 transition 一律 fail closed。
- 上列以外的 localStorage／sessionStorage、IndexedDB、auth token 與業務資料不屬 PWA transaction，任何路徑不得清除或改寫。

Ownership：同一 target 只能有一個 active transaction／owner。優先以 `navigator.locks.request('projed.pwa-update.apply.v1', { mode: 'exclusive', ifAvailable: true })` 取得互斥；不支援 Web Locks 時，以獨立 PWA IndexedDB 單一 readwrite transaction 原子 acquire／renew／takeover，不得只靠 localStorage read-then-write。lease 固定 30 秒、owner 每 10 秒續租，每次 acquire／takeover 遞增正整數 `ownerFence`。所有 effect／commit 前必須 reread-and-confirm transactionId／ownerTabId／ownerFence／lease；舊 fence、非 owner 與同分頁重入不得呼叫 `updateSW`、navigation 或 recovery。

### State Machine 與 Effect Ownership

1. Detection：`onNeedRefresh` 或 foreground check 取得可信 latest。若 latest 與 current、completed target、session dismissed target 都不同，persist `available`；`onNeedRefresh` 只保存最新 queued update callback。
2. User apply：點「一鍵更新」後取得 owner lease並進 `applying`。CTA disabled；later／close 隱藏或 disabled。apply promise 在單一分頁內必須 singleton。
3. Stable-target preflight：owner 呼叫 `registration.update()`，最多等待 waiting worker 15 秒，再重讀 no-store latest。target 若改變只允許重做一次；兩輪仍變動則 `failed/TARGET_UNSTABLE`，不得 reload。
4. Standard activation：target 穩定後先 persist `awaiting-controller` 與 `normalReloadReserved=true`，再呼叫 queued `updateSW()`；並以目前 registration 的 waiting worker 直接送 `SKIP_WAITING` 作為 callback race fallback。controllerchange 先 quiesce 舊頁面 writer，再由套件 controlling handler 或 coordinator 的短延遲 fallback 完成唯一有效的 normal reload；不得讓舊 async check 在事件後回寫 transaction。
5. Startup verification：新頁面 hydrate active transaction，進 `verifying` 並解析 current identity。只有 `current === target` 才能寫 completed、移除 active transaction並廣播完成；同 target 的後續 callback／check 必須被抑制。
6. Bounded automatic recovery：normal reload 後 mismatch 且 attempt=0 時，寫 `recovering/1`，只允許一次 nonce cache-busting navigation，不 unregister／delete cache。再次 mismatch 或 15 秒內無可信 current 時進 `failed`，停止自動 reload。
7. Manual recovery：failed UI 可讓使用者重試檢查，或主動選「清除應用程式快取後重整」。只有後者可處理同 origin SW registrations／Cache Storage；必須 readback 每個 unregister／delete 結果，失敗時維持可見 error。

active transaction 超過 5 分鐘仍未完成，轉為 `failed/TRANSACTION_STALE`，不得靜默刪除再顯示同一 normal CTA。只有有效 owner 在 `applying` 的 stable-target preflight 可於同一 transaction retarget 一次；進入 `awaiting-controller` 後 target immutable。完成舊 target 後再偵測到更高版本，才建立新 transaction。

### UI Entry Contract

- Actor／entry：所有 web／PWA 使用者；`AppUpdatePrompt` 維持 `src/App.tsx` 全域且在 AuthGate 外的掛載位置。
- Trigger：可信 target 可用且非 completed／session dismissed，或 transaction 為 recovering／failed。Dismiss 只作用於當前 target／session；更高 target 可再次提示。
- Normal exact visible set：標題「有新版本可用」、close、「一鍵更新」、「稍後」。不得存在 Refresh icon、一般說明段落、版本 badge、「到最新版」或刪除元素留下的空白欄。
- Applying／awaiting：primary 為「更新中」且 disabled；close／later 隱藏或 disabled。Recovery／failed 必須保留最小原因與 action，可使用識別 icon。
- Layout：一層扁平 surface，壓縮 padding、段距與 action gap；1440×900、390×844、320×844 無 overflow、重疊、截字、safe-area 遮擋或關鍵操作不可達。
- Accessibility：role／aria-live 不重複播報，close 有 label，keyboard focus 不進 hidden／disabled control，apply 前後焦點與可見狀態一致。
- Exit：成功只由 startup version verification 結束；callback resolve、dismiss 或 cache API boolean 未確認都不得標 completed。

### Repo Impact 與 RD Work Packages

| WP | 檔案 | Required change |
|---|---|---|
| WP-096-A | `src/services/pwaUpdateTransaction.ts`（新增） | schema、strict parse、legal transitions、lease／takeover、completed suppression 與 pure tests。 |
| WP-096-B | `vite.config.js`、`src/vite-env.d.ts`、`scripts/release/verify-production-artifact.mjs` | release ID 注入、型別與 artifact parity gate。 |
| WP-096-C | `src/services/pwaUpdateService.ts` | 重構 `fetchLatestAppShellVersion`、`recordLoadedAppVersion`、`runQueuedUpdate`、`applyPwaUpdate`、`setupPwaLifecycle`；加入 transaction、stable-target preflight、standard activation、startup verify、cross-tab lock／sync、bounded recovery；刪除 `applyUpdateWhenBackgrounded` 與 normal cache purge。 |
| WP-096-D | `src/components/AppUpdatePrompt.tsx` | 重構 `AppUpdatePrompt` 的 exact visible set、compact layout、applying／recovery／failed、RWD／accessibility。 |
| WP-096-E | DEV-041 verifiers、`package.json`、新增 DEV-096 static／browser／real-SW verifiers | 更新舊 assertions；建立 pure、synthetic UI、真實 A→B→C、多分頁、post-reload 與 storage safety evidence。 |
| WP-096-F | DEV／SPEC／QA 與後續 QC | 回填實作事實；QA 執行 frozen acceptance，QC 獨立重跑，不修改產品。 |

`src/main.tsx`、`src/App.tsx`、`src/components/GlobalErrorBoundary.tsx` 與 DEV-034 install guidance 原則上只做 regression；本次僅補回 DEV-034 設定頁契約說明文字。real-SW 驗證證實 installed `vite-plugin-pwa` 在後續 update 的 controlling reload listener 可能缺席，因此現行 coordinator 保留短延遲 fallback，且以 quiesce guard 避免第二次有效 navigation／舊 writer 回寫；不得增加無界的第二套 reload 流程。

### Acceptance、Evidence 與 Stop Conditions

- 同 target 在連點、hide/show、`pagehide`、reload、多分頁與 owner crash 下，只有一筆 transaction、一個有效 owner fence、一次 `updateSW`；每個受 controller 接管影響的 client 最多一次 normal reload。
- 真實 SW A→B、B→C、B waiting 時發布 C 均收斂最新穩定 target；`current===target` 後同版本 normal prompt 不再出現。
- malformed／stale transaction、waiting timeout、target unstable、controller failure 與 post-reload mismatch 均進有界限 failure，不形成 loop。
- 正常 flow 不 unregister／delete cache、不動 business storage；manual recovery 範圍與 readback 可驗證。
- Normal UI 在三個 required viewport 符合 exact visible set、focus／ARIA、compact layout；visible error、console error、pageerror、HTTP 4xx／5xx、白畫面為 0。
- DEV-041、DEV-034 regression、TypeScript、`build:test` 通過；真實 SW lifecycle／多分頁／storage diff evidence 齊全，synthetic event 不得單獨支持 PASS。

QA authority：`ai-doc/qa/QA-DEV-096-pwa-update-transaction-convergence.md`。本次 required commands 為：

```text
npm.cmd run verify:dev-096-pwa-update-transaction-convergence
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-browser
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-sw
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser
npm.cmd run verify:dev-034-pwa-install-guidance
npm.cmd run verify:dev-034-pwa-install-guidance-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

DEV-096 三個 verifier 已建立並執行；static 25/25、test-mode browser、real-SW A→B／B→C／B waiting→C retarget＋雙分頁 evidence 均已留下。任一 current≠target 卻 completed、同 target 雙 owner／雙 reload、未點擊自動 apply、production 空 ID 被接受、正常路徑清 cache、業務資料異動、同版本 CTA 再出現、visible error 或缺真實 SW／多分頁 evidence，皆為 P0 Stop-Ship。

### Execution／Release Boundary 與 Readiness Audit

- 本附錄已完成本地 RD implementation、test assets、文件回填與 QA／QC；不含 commit、merge、push、deploy 或 release。
- Production A→B smoke 需 RD、QA、QC 全部通過後，由使用者重新授權並走 deployment-release-gate；DEV-041 歷史部署不代表 DEV-096 已上線。
- DB／migration：無；release feasibility 依既有 DEV-083 sealed artifact pipeline，WP-096-B parity gate 已完成，不新增 backend service。
- P0／P1 readiness gap：0。文件狀態為 `Implemented / Local QA-QC PASS / Not Released`；production deploy／remote smoke 仍需另行授權與 release gate。

## DEV-097 Contract Addendum（2026-08-31）

### Authority 與 Human Confirmed Decisions

本附錄是DEV-097的`RD Implementation Ready`產品與實作權威，保留DEV-096已完成的release identity、
單一activation transaction、owner fence、post-reload verification、bounded recovery與storage safety；
ADR-047並有意取代DEV-096的virtual registration、`clientsClaim:true`、controlling reload fallback與
下列normal update語意：

- `1A`：只有可能遺失或中斷工作的 client state 阻止 reload。未儲存文字／表單、active
  drag、尚未 durable 的 import／publish、pending write 與 dirty modal 為 unsafe。
- 可由 stable ID 在 reload 後取回的 background AI／server job，以及唯讀 modal，不阻止；
  只存在 client memory 或 reload 後無法恢復者仍為 unsafe。
- `2A`：normal update 只在 app open、foreground resume 且 safe，或目前操作完成後的 route
  transition 套用；不採任意 idle timeout。
- `3A`：dirty 期間不以時間強制 reload。dirty 清除後於下一個 natural boundary 收斂；
  超出支援期限時另走 critical policy。

因此，DEV-096「未點擊不得接管或reload」、「可信target一律顯示normal prompt」與
「未點擊自動apply一律P0 failure」只保留為DEV-096歷史baseline。DEV-097允許目前document經
explicit readiness與local safety gate證明safe後，在自己的natural boundary靜默activation／reload；
仍禁止hidden、`pagehide`、任意idle timer或無safety readback的自動reload。另一document的dirty
保護由non-claiming controller與release cache isolation提供，不建立origin-wide all-safe consensus。

### Reload-Safety Terms

- `durable`：資料或 job 已有 reload 後可重新讀取的 stable identity，且不依賴目前頁面的
  client-only memory 才能完成或顯示結果。
- `dirty／unsafe`：至少一個 reload-safety owner 有未 durable 工作、active transient action、
  pending mutation、dirty modal，或 signal 無法可信讀取。
- `safe`：目前document在version／auth／active-view readiness完整後，所有manifest-required local
  owners都明確回報無資料遺失或不可恢復中斷風險；不代表其他documents也safe。
- `natural boundary`：app open、foreground resume 且 safe，或目前操作完成後的 route
  transition；不得擴張為一般 idle、hidden 或 `pagehide`。
- `critical update`：由未來獨立 policy 判定的 mandatory path；不屬本 normal contract。

### Behavior 與 Effect Ownership Contract

1. Detection／registration：`pwaUpdateService`以直接`workbox-window` registration偵測waiting target；
   不使用`virtual:pwa-register`，Workbox event不得自行reload。
2. Local signal：編輯、拖曳、匯入／發布、pending write、modal與background job owners提供目前
   document的reload-safety狀態。readiness、manifest、owner讀取或prepare未知時fail closed。
3. Activation isolation：safe document在自己的natural boundary取得DEV-096 owner／fence後，可送
   `messageSkipWaiting()`。`clientsClaim:false`與release-scoped old cache retention要求 activation
   不得觸發其他既有documents的application navigation／reload，也不得移除其所需資產；同一 scope
   的既有 controlled document 仍可能收到 `controllerchange`，不把 controller identity 永不變列為 invariant。
4. Safe path：目前document safe且進入natural boundary時，一個DEV-096 owner執行activation／reload；
   一般提示不存在，view destination reload後保留。
5. Dirty path：只在目前dirty／unsafe document顯示最小prompt。點「重新載入」先請所有local
   owners flush、commit或安全取消transient action；全部成功後才activation或local reload。
6. Cross-tab isolation：另一document dirty不阻止safe document activation，也不參與all-live gate；
   dirty document的application navigation count必須維持0、原資料與舊版本資產可 readback，直到自己的boundary。
7. Later：點「稍後」只隱藏目前document／target prompt。dirty→safe後不再次要求同意，而是在
   自己的下一個natural boundary收斂；同target不得永久pin。
8. Completion split：DEV-096 transaction只追蹤target activation與有效owner document驗證；
   `current===target`即可completed並維持五分鐘stale policy。其他documents的延後收斂是local
   obligation，不使global transaction維持`verifying`，也不重開activation transaction。
9. Recovery：prepare、activation、navigation或verification失敗保留頁面並進有界限
   recovery／failed；只有使用者主動的人工recovery可處理PWA cache範圍。

ADR-047固定registration ownership、application navigation/cache retention isolation與transaction split。RD必須維持
single activation、per-client dirty protection、explicit readiness與bounded recovery，不得以heartbeat
TTL、all-live consensus、router、backend coordination或第二套global state framework替代。

### UI Entry Contract

- Actor／entry：所有 web／PWA 使用者；更新能力位於 AuthGate 外，不依賴登入或業務角色。
- Fresh／uncontrolled：直接取得目前 app shell，無提示；這不是「已取得更新同意」。
- Controlled-safe：偵測 target 後無 normal UI；只在 natural boundary 進入 apply／reload。
- Controlled-dirty exact visible set：「新版已就緒」、「重新載入」、「稍後」。不得有 close、
  Refresh icon、一般說明、版本 badge、成功宣告或刪除元素留下的空白欄。
- Preparing：primary 顯示「準備重新載入」或等效最短狀態並 disabled；稍後不可重入。
- Prepare／cross-tab failure：保留最短原因與恢復動作；不得 navigation 或清除 business data。
- Recovery／failed：保留必要原因、重試與人工 cache recovery，不受 normal exact set 限制。
- Layout／a11y：1440×900、390×844、320×844 無 overflow、重疊、裁切、safe-area 遮擋、
  焦點遺失或重複 ARIA live announcement；normal UI 維持單一主動作與一層扁平 surface。

### Data、API、Permission 與 Compatibility

- Backend／DB／schema／RLS／RPC／業務 API：不變。若實作必須增加，視為 scope expansion，
  停止並回到 contract review。
- Client storage：沿用 DEV-096 PWA-owned transaction metadata；不得讀寫 auth token、業務
  IndexedDB 或其他 owner storage。owner 只回報 safety 或呼叫既有 save／flush 能力。
- Permission：所有角色使用相同契約，不新增 admin override 或 per-user version pinning。
- Backward compatibility：N client 在更新前只能顯示 N bundle 內建 UI；N+1 UI 的 acceptance
  必須用真實 N→N+1 fixture，不能用 fresh N+1 畫面代替。
- Migration：無backend／business data migration。新增`workbox-window`直接依賴與release-scoped
  precache namespace；normal path不自動清歷史precache，也不建立heartbeat／TTL client schema。
  DEV-096 completed suppression須加local current readback。

### Implementation Authority

#### Module／effect boundary

- `package.json`把`workbox-window`列為direct dependency；`vite-plugin-pwa`只產生manifest／worker，
  `injectRegister:false`維持。
- `vite.config.js`固定`clientsClaim:false`、`skipWaiting:false`、
  `cleanupOutdatedCaches:false`與release-scoped `cacheId`。production release ID缺失沿DEV-083
  build gate fail closed。
- `src/services/pwaUpdateService.ts`移除`virtual:pwa-register`，自行建立Workbox instance並成為唯一
  detection／activation／reload／verify effect owner；`controllerchange`／waiting／activated listener
  只更新狀態，不直接navigation。`AppUpdatePrompt.tsx`只render state與送user intent。
- `src/services/pwaReloadSafety.ts`（new）是local pure domain owner：owner registry、explicit readiness、
  prepare aggregation、boundary與session reservation；不含heartbeat、TTL或remote client gate。
- `src/services/pwaReloadOwnerManifest.ts`（new）固定typed owner ID、repo authority、適用surface與
  readiness scope；expected owner未註冊即`OWNER_MANIFEST_INCOMPLETE`。
- `src/hooks/usePwaReloadSafetyOwner.ts`（new）只做React registration；不得觸發worker、transaction、
  navigation或recovery。
- `src/components/PwaReloadSafetyBridge.tsx`（new）在AuthGate外只送app-open、hidden→visible與
  `currentView` intent。`AuthGate`／`AppContent`內部分別回報`auth-shell`／`active-view` readiness；
  animation frame只可debounce，不是readiness authority。
- `PwaUpdateTransactionV1`維持schema 1與五分鐘stale，只追蹤activation；不加入client ack array。

#### Controller／cache isolation

- waiting worker由唯一owner送`messageSkipWaiting()`；因`clientsClaim:false`，activation不得改變其他
  既有documents的controller或觸發其reload。
- 每個release使用獨立precache namespace，activation不清舊release cache。N dirty document在N+1
  activation後仍須由N controller載入N navigation與lazy assets。
- normal path不做自動舊cache reclamation。可靠client census與cache GC由ADR-047 future capsule管理；
  heartbeat、TTL、record absence或固定release數量不得作為刪除依據。
- normal release須在per-client convergence期間維持backend／API／資料格式相容；無法相容者必須
  停止normal rollout並進critical／mandatory update contract。

#### Activation transaction 與 per-client convergence

- local owner safe且進入natural boundary後，尚有waiting worker的client可取得DEV-096 owner／fence
  並activation；另一document dirty不阻止activation，也不得被迫reload。
- activation transaction在有效owner document `current===target`後completed；其他舊documents不讓
  transaction維持`verifying`，所以合法dirty延後不受五分鐘stale影響。
- `completedVersion===latestVersion`不能單獨suppress；目前document也必須
  `currentVersion===latestVersion`。舊／恢復document看到completed target後建立local pending target，
  於自己的boundary使用一次session reservation reload，不再送`messageSkipWaiting()`或建立transaction。
- reload前view boundary必須readback`projed-last-view`；不符回`VIEW_INTENT_NOT_DURABLE`。hidden、
  `pagehide`、idle timer皆無apply effect。
- session reservation先write/readback再reload；新document只在current等於reserved target時清除。
  mismatch保留reservation並進DEV-096 bounded recovery；呼叫reload後3秒未見`pagehide`則清本次
  reservation、回`RELOAD_NAVIGATION_NOT_STARTED`並留在原頁。retarget後才可換成新target。

#### Mandatory V1 owners

| Owner | Repo authority | Dirty／prepare contract |
|---|---|---|
| Record draft／meeting job | `RecordSidebar.tsx`、`useMeetingDraftRecovery.ts`、`useRecordStore.ts` | signature、saving、synthesis／project import；save draft或 meeting snapshot `saved／degraded`＋load readback |
| Task details | `TaskDetailsModal.tsx` | title／notes local draft、pending／failed writes、collection pending；save／retry後 pending=0、failed=0 |
| Calendar subscription | `CalendarSubscriptionsView.tsx` | local builder／saving；未提交 form 回 action-required，不替使用者建立訂閱 |
| Backup import | `BackupSettings.tsx` | inspection／plan／execute；draft action-required，execute 等 settled，不 cancel transaction |
| RAG query | `RagSidebar.tsx`、`useRagStore.ts` | unsent input／client-only query；現行無 stable job ID，等待完成或 timeout |
| Invite／input dialog | `BoardMembersPanel.tsx`、`GlobalDialog.tsx` | unsent semantic input action-required；pending invite 等 readback；read-only confirm 不 dirty |
| Inline editors | `Sidebar.tsx`、`TagPicker.tsx`、`MindMapNode.tsx`、`MindMapView.tsx` | commit workspace／board／tag／title／relationship label並做 store readback；invalid draft action-required |
| All task drag surfaces | `BoardView.tsx`、`WbsListView.tsx`、`SharedTaskSidebar.tsx`、`GanttTaskBar.tsx`、`MindMapView.tsx`、`useTaskDragSession.ts` | active drag unsafe；prepare走既有 cancel／clear，Gantt不 commit preview，驗 overlay／simulation全清 |

唯讀 modal、filter、popover、pan／resize 與可用 stable ID reload recovery 的 server job不註冊。
任何新增 local editor、client-only job 或 pending write 必須同 PR 註冊 owner並加 verifier。

#### Failure／UI mapping

- `SAFETY_NOT_READY／OWNER_SIGNAL_FAULT／OWNER_MANIFEST_INCOMPLETE`：
  「目前無法確認內容是否已保存。」
- `OWNER_ACTION_REQUIRED`：「請先儲存或取消目前編輯。」
- `OWNER_PREPARE_FAILED／OWNER_PREPARE_TIMEOUT／LOCAL_READBACK_DIRTY`：
  「內容尚未保存，請完成後再試。」
- `VIEW_INTENT_NOT_DURABLE／RELOAD_RESERVATION_FAILED／RELOAD_NAVIGATION_NOT_STARTED`：
  保留頁面與retry；navigation未開始時清本次reservation。
- `WORKER_ACTIVATION_FAILED`：保留頁面並進DEV-096 bounded recovery。
- `OLD_RELEASE_ISOLATION_FAILED`：P0 Stop-Ship；不宣稱normal安全更新成立。
  DEV-096 transaction failure codes仍由既有 recovery／failed UI處理。
- normal dirty UI exact set仍是「新版已就緒／重新載入／稍後」；preparing primary固定
  「準備重新載入」且兩按鈕 disabled。safe／booting不 render normal prompt。

#### Work packages／verifier artifacts

- WP-097-A：Workbox registration／controller-cache isolation；WP-097-B：local safety、typed manifest與
  explicit readiness；WP-097-C：全部owner adapters；WP-097-D：activation transaction／per-client
  convergence與prompt；WP-097-E：三層verifier／package scripts；WP-097-F：QA／QC handoff。
  逐檔exit contract以`ai-doc/dev_task.md` DEV-097為準，順序固定A→B→C→D→E→F。
- future commands固定為 `verify:dev-097-pwa-safe-reload`、
  `verify:dev-097-pwa-safe-reload-browser`、`verify:dev-097-pwa-safe-reload-sw`；再跑 DEV-096、
  DEV-041、DEV-034、DEV-069、DEV-092、DEV-045、DEV-047、RAG、DEV-028、DEV-054、DEV-095
  targeted regressions、TypeScript、全部touched owner files ESLint、`build:test`、`git diff --check`。
- artifacts固定為 `output/qa/dev-097/static-result.json`、
  `output/playwright/dev-097/ui-result.json`、
  `output/playwright/dev-097/sw-integration-result.json` 與三個 required viewport screenshots。
  RD scripts／results 已建立並完成 targeted execution；固定 artifacts 為
  `output/qa/dev-097/static-result.json`、`output/playwright/dev-097/ui-result.json`、
  `output/playwright/dev-097/sw-integration-result.json`。這些結果只代表 local targeted evidence，
  不取代完整 owner matrix／multi-tab／viewport／獨立 QA-QC。

### Acceptance、Evidence 與 Stop Conditions

- Fresh／uncontrolled 直接載入 current，沒有 normal prompt。
- controlled-safe 只在 natural boundary 靜默收斂，操作中途、idle、hidden、`pagehide` 不 reload。
- controlled-dirty 只顯示 exact visible set；flush 成功後一次 apply，flush 失敗保持原頁與資料。
- Tab A safe可由單一owner activation；Tab B dirty保持 navigation count=0、原資料與舊 release
  asset可用，直到B自己的natural boundary才reload。shared-scope `controllerchange`若發生只可作
  lifecycle state，不得觸發 application navigation；controller identity 永不變不是本設計可保證的 invariant。
- activation transaction在有效owner document `current===target`後completed；其他dirty／hidden
  documents不延長五分鐘transaction，也不能被global completed誤判為local已收斂。
- 「稍後」不重複打擾、不丟 target、不永久 pin；dirty 清除後於 natural boundary 收斂。
- 桌機／手機由 lifecycle＋safety state 決定相同行為；三個 required viewports UI 可見可操作。
- 同 target 在連點、visibility、route、reload、多分頁、owner crash 與 retarget 下不重複提示、
  transaction 或 apply；current≠target 不得 completed。
- Evidence必須包含source／artifact identity、直接Workbox owner、真實SW N→N+1 trace、N／N+1
  controller與cache namespace、dirty owner fixture、multi-tab isolation、view intent、viewport screenshot、
  visible-error sweep與runtime cleanup。

任一dirty data loss、跨分頁強制reload、normal time-force、idle／pagehide apply、safe path顯示
一般提示、dirty exact set錯誤、同target多activation／多reload、current≠target completed、仍使用
`virtual:pwa-register` internal reload、`clientsClaim:true`、activation刪除舊release資產、manifest／
readiness缺漏、登入或business storage異動、visible error／白畫面，或缺真實SW／多分頁／UI evidence
卻宣稱PASS，皆為P0 Stop-Ship。QA authority為
`ai-doc/qa/QA-DEV-097-pwa-safe-reload-orchestration.md`。

### Readiness、Governance 與 Execution Boundary

- 成熟度：`RD Implementation Ready / Human Confirmed / Tech Lead Review Remediated`；產品與工程
  P0／P1 readiness gap皆為0。
- 實作狀態：RD已完成DEV-097 WP-097-A～F，並通過local automated QA與independent QC；physical device supplemental尚未驗證。
  DEV-096 code／QA／QC只作相容回歸與歷史baseline，不可單獨宣稱DEV-097 PASS。
- ADR：`ADR-047` Accepted，固定application-owned Workbox registration、non-claiming activation、
  release-scoped cache retention、activation transaction／per-client convergence split與explicit readiness。
- Tech Lead Review Remediation：已移除hidden reload effect、all-live completion／五分鐘stale矛盾、
  heartbeat TTL safety oracle與one-frame readiness，並把全部owner adapters納入QA／lint／regression。
- Release feasibility：沿用DEV-083 sealed artifact與DEV-096 release identity，但artifact必須產生
  release-scoped cacheId，且normal rollout期間維持舊client API相容；實作、QA／QC未完成前不得進
  DEV-097 release gate。
- Execution boundary：本輪已修改DEV-097 scope內產品、verifier、build config、package lock與文件，
  未修改migration、deploy或release artifact。`Local Automated QA PASS`與`Independent QC PASS`均不代表
  production release PASS；iOS／Android實機補充仍為`Not Verified`，release另依gate執行。

## All-Phase Coverage Matrix

| Phase | 名稱 | 文件狀態 | 授權狀態 | Exit Evidence |
|---|---|---|---|---|
| 0 | PM/RD Contract | Complete | Authorized for documentation only | SPEC/QA/dev_task/documentation_map/backlog updated |
| 1 | Visible PWA Update Prompt & Cache Recovery | Local + Browser QC Passed | Authorized / Complete | local static/browser verifier、TypeScript、build:test、DEV-034 regression |
| 1A | DEV-096 Update Transaction Convergence | Implemented / Local QA-QC PASS | Authorized / Complete | static 25/25、UI、real-SW A→B／B→C／retarget／multi-tab／storage safety、QC-DEV-096 |
| 1B | DEV-097 Safe Reload Orchestration | RD Implemented / Local Automated QA PASS / Independent QC PASS / Physical Device Supplemental Not Verified | Local implementation and automated QC complete / Not Released | DEV-097 static 23/23、九-owner／dual-tab browser、A→B→C real-SW、TypeScript、changed-file lint、build:test、相鄰regressions；physical device supplemental not verified |
| 2 | Production Release Gate | Production Release Deployed / Post-Deploy Smoke Passed | Authorized / Complete | deployment-release-gate evidence、post-deploy smoke、rollback readiness |
| 3 | Mandatory Policy / Verified Old-Cache Reclamation | Future Phase Captured / Not Requested | Not Requested | human re-entry、ADR-047 future capsule、separate contract or new DEV |

## Historical RD Start Checklist

此清單為 2026-07-05 RD 開工前 gate，已由 RD/QC 與 production release evidence 覆蓋；後續再開 DEV-041 類似修改時需重新套用:
- 使用者明確授權 DEV-041 Phase 1 implementation。
- 不把 production deploy 混進本地 implementation；部署需另走 release gate。
- 若 worktree 有其他未提交變更，需先標示哪些是本 DEV 會觸碰的檔案。
- 先讀 DEV-034 PWA install guidance，避免更新提示破壞安裝提示。
- 先建立可測試的 update state injection 或 mock path，讓 browser verifier 能穩定觸發 `update-available`。

## DEV-130 PWA 圖示更新 Chrome 交接 Addendum（2026-09-21）

### 問題與決策

Android Chrome 安裝版以 standalone 視窗開啟，不顯示網址列；要求使用者自行回到瀏覽器、重新輸入網址再找「檢閱應用程式更新」，會使圖示更新流程失敗。Chrome 仍要求使用者在瀏覽器介面核准 App identity 變更，網站不得代按，因此 DEV-130 將既有更新提示作為交接入口，不宣稱一鍵完成圖示變更。

### 固定契約

- 舊 Android Chrome standalone 於品牌圖示 revision `brand-20260921` 尚未完成時，顯示「更新桌面圖示／在 Chrome 繼續／稍後」。
- 「在 Chrome 繼續」必須由使用者點擊直接啟動 `com.android.chrome`，開啟 canonical origin root，並帶 release-scoped query marker；Intent 必須包含同 URL 的 browser fallback。
- Chrome 落地頁顯示「點右上角 ⋮，選『檢閱應用程式更新』，再點『更新』」與「完成」。完成是使用者自述，只負責停止此 revision 的提醒，不冒充瀏覽器核准回執。
- `稍後`只在目前 session 隱藏；`完成`以 PWA-owned localStorage revision 隱藏。不得讀寫登入 token、業務資料或其他 owner storage。
- 使用既有安裝紀錄的 `lastPromptedAt` 抑制圖示發布後的新安裝；缺少舊紀錄的 standalone 視為可能的 legacy install，允許顯示一次。
- 一般 app-shell update、dirty reload、recovery exact visible set與優先序不變；當一般 update／recovery 可見時，它優先於 identity reminder。
- 本 addendum 只允許 Android Chrome-specific transport detection，不延伸為 shortcut availability、pending identity update或實際核准狀態的推測。
- 不改 manifest identity、icon URL、Service Worker lifecycle、資料庫、RLS、RPC、登入或帳號 storage。

### 驗收與證據

- Pure matrix：legacy standalone、非 standalone、非 Android Chrome、新安裝、已完成、同 session 稍後與 browser query landing。
- Browser：390×844 standalone fixture 顯示單一交接主動作、Intent package／fallback／revision 正確且無 X overflow；browser landing guidance可完成並移除 query。
- Regression：DEV-041／096 normal update與recovery prompt維持；TypeScript、targeted ESLint、production build及release gate通過。
- Android 實際 Chrome 選單名稱與 identity approval仍屬 browser-owned UI；網站證據只驗證可到達 Chrome 與指引，不把瀏覽器外部核准記為自動 PASS。

## DEV-130 Android standalone 選單可達性 Corrective Addendum（2026-09-22）

### 正式缺陷與根因

Android實機證明 `intent:` 即使指定 `com.android.chrome`，同網域URL仍可能留在目前WebAPK／standalone視窗；原流程因此顯示browser guidance，卻沒有Chrome工具列與三點選單。REL-006的browser fixture只驗證Intent字串與落地頁，未能證明Android Activity實際切換，原本的transport契約失效。

### 修正契約

- 主App與快速建立入口的manifest `display`改為`minimal-ui`，由瀏覽器提供固定title/origin bar與選單；`id`、`start_url`、`scope`、icon URL與帳號邊界不變。
- 移除「在 Chrome 繼續」與self-targeted Chrome Intent，不再承諾網站能把同scope WebAPK強制搬到一般Chrome tab。
- legacy standalone提示改為：若上方尚未出現選單，完全關閉後重開ProJED，再點上方選單 →「檢閱應用程式更新」→「更新」。
- browser guidance只有在recognized revision query且目前不是standalone時成立；query仍落在standalone時必須回到installed-app guidance，不得冒充已進入browser。
- guidance revision提升為`brand-20260921-menu-20260922`，讓曾完成或略過REL-006錯誤流程的舊安裝重新收到一次正確指引；新圖示發布後的新安裝仍以原發布時間抑制。
- 一般app-shell update、recovery優先序、storage owner、登入、資料、Service Worker transaction皆不變。

### 修正驗收

- Pure：主／快速入口manifest皆為`minimal-ui`；standalone query不切成browser guidance；新版與REL-006 legacy query在非standalone皆可顯示browser guidance。
- Browser 390×844：installed guidance含重開、上方選單與Chrome-owned action名稱；不存在「在 Chrome 繼續」；按鈕可操作、無X overflow；一般update／recovery優先序不變。
- Production：canonical manifests readback為`minimal-ui`、source／artifact provenance一致、query landing與更新提示無critical error。
- Android實機仍需確認WebAPK完成manifest refresh後出現minimal-ui選單；此項在使用者選擇直接正式測試時列為production observation，不以桌面fixture冒充。

## DEV-130 Android WebAPK 更新提示矯正 Addendum（2026-09-24）

### 實機反證與權威行為

使用者已在Android Chrome一般分頁打開正式站，選單中有「開啟 ProJED 3.0｜專案管理系統」，卻沒有「檢閱應用程式更新」。前述將Chrome桌面版已安裝Web App的三點選單流程套用到Android，屬平台判斷錯誤；REL-007／008的頁面與瀏覽器fixture PASS不能證明該選項存在於Android。

Chromium的[Android WebApkUpdateManager](https://chromium.googlesource.com/chromium/src/+/main/chrome/android/java/src/org/chromium/chrome/browser/webapps/WebApkUpdateManager.java)在WebAPK啟動後按其排程檢查manifest，遇到需使用者核准的圖示／名稱差異時顯示原生更新對話框；[桌面版manifest update流程](https://chromium.googlesource.com/experimental/chromium/src/+/refs/heads/main/chrome/browser/web_applications/docs/manifest_update_process.md)才在獨立App視窗顯示「Review App Update」選單，普通分頁不顯示。

### 取代契約

- Android installed-app提示改為說明Chrome定期在開啟App時檢查圖示；只有Chrome實際顯示更新確認時，才指示點「更新」。不再出現「開啟 Chrome 更新」或「檢閱應用程式更新」。
- 舊bridge query仍可到達browser-guidance，但文案指出目前分頁沒有圖示更新選項，並引導使用者點Chrome選單中實際可見的「開啟 ProJED 3.0」返回App。bridge靜態URL保留給已部署舊版本的既有連結，不再作為新版主動作。
- installed-app與browser-guidance只提供「知道了」確認；installed-app另保留「稍後」。確認只停止本站提醒，不代表WebAPK圖示已更新。
- guidance revision提升，讓曾確認REL-008錯誤指引的舊安裝收到一次修正；manifest identity、icon URL、更新排程、登入、資料與既有PWA app-shell update／recovery流程不變。
- Android是否跳出原生更新對話框取決於Chrome自身檢查、安裝狀態與圖示差異；網頁不得宣稱可直接呼叫或強制核准。

### 驗收

- Pure與390×844 browser fixture須確認新版沒有虛構選單／browser handoff、舊query可得到正確指引、提示可確認／稍後、無水平溢出、一般app-shell update／recovery優先序不變。
- 正式站驗證必須證明新bundle文案／revision及既有bridge URL相容；Android原生對話框仍需實機證據，不得由HTTP 200或桌面browser fixture推定PASS。

## DEV-130 既有 Android WebAPK 圖示實機失敗補正（2026-09-28）

使用者在 `chrome://webapks` 看到更新 `Succeeded` 後，Android「應用程式資訊」仍顯示舊 J 圖示。此證據推翻「完成 Chrome 更新流程即可換圖」的交付假設；上方 2026-09-21～24 圖示提醒與操作指引契約僅作歷史紀錄，不再作為現行產品行為。

- 現行 UI 只保留一般 Service Worker 網站版本更新／快取復原提示；不顯示「更新桌面圖示」提醒，不把按「知道了」、重新載入、等待或 Chrome `Succeeded` 當成 Android App 圖示已更新。
- 主／快速入口固定採已發布的品牌 PNG 與版本化圖示 URL；manifest `id`、`start_url`、`scope` 維持。`minimal-ui` 與目前正式版對齊。舊 bridge URL 保留跳回 ProJED，但不再導入圖示更新 query 或指引。
- 驗收分層：網站資產／新安裝提供新版圖示可由 manifest、HTTP 與新裝置驗證；**既有 WebAPK 套件換圖**只能由同一 Android 裝置的 App 資訊及桌面圖示判定。使用者不接受要求重新安裝、暫不採原生 App／受管理捷徑；在 Chrome 未提供可用機制之前，後者保持 FAIL／阻塞。

## DEV-130 自願重新安裝圖示契約（2026-09-28）

使用者已修正決策：允許把重新安裝當作**可自由選擇**的換圖方式。上一節的拒絕重新安裝是當時歷史判斷，不再限制此選用入口。網站不得自動卸載、導向或聲稱一鍵換掉 Android WebAPK 圖示；不選擇的人可繼續使用舊圖示與原有功能。

- 主程式只在 Android 設定中心的「App 安裝與快速開啟」顯示收合式「自行更新桌面圖示（選用）」；已安裝的快速入口在輸入表單下方提供小型「安裝與圖示」連結，進入 `?install=1` 說明頁才顯示自身收合式選項。任何頁面初次開啟均不自動展開或跳出阻擋式提示。
- 引導前先讀本裝置所有帳號／未綁定的快速待辦 outbox，凡未標為 `synced` 均計入警示；讀取失敗時保守提醒暫勿移除。其他未儲存草稿由使用者確認，網站不推定其已同步。
- 使用者先以系統分享或複製保存當前入口安裝連結，再**自行**到 Android 設定解除安裝要換圖示的 App。主程式與快速入口分開選擇；僅換其中一個時不要求移除另一個。從保留的連結以 Chrome 重新安裝，登入原 ProJED 帳號。
- `appinstalled` 留下的 localStorage `installed=true` 僅是歷史訊號。當前 `standalone`／`minimal-ui`／`fullscreen` 顯示模式才可判定已在 App；解除安裝後的普通 Android Chrome 分頁應重新顯示安裝指引。
- 不新增 server API、資料 migration、Service Worker 更新控制或圖示版本；既有主／快速入口 manifest 與圖示保持不變。網站可驗證引導與資產，實際新 WebAPK 圖示仍以同一 Android 裝置的 App 資訊及桌面結果驗收。

## DEV-130 Android 重新安裝失敗修復（2026-09-29）

使用者移除舊主程式後，Android Chrome 的原生安裝畫面仍顯示「無法安裝這個應用程式」。2026-09-28 的「保持圖示不變」限制被本次同任務修復取代；品牌圖案與自願重裝原則保持不變。網站只能修正自己的 manifest 與圖片，不能保證 Chrome／Google WebAPK 服務一定完成原生安裝。

- 主程式與快速入口的 manifest 各列 192×192、512×512 PNG `any`，並保留 512×512 `maskable`；PNG 實際像素與宣告相同。主程式 shortcut 也列兩個尺寸。HTML favicon、Apple touch icon、登入畫面品牌圖與執行時 icon 指向同版 512 圖示。
- 保持兩個 manifest 的 `id`、`start_url`、`scope`、`display`，避免把安裝問題變成新身份或路由。網站安裝引導仍由使用者選擇；不自動解除安裝。
- 本機驗證 manifest、圖片與建置輸出；瀏覽器診斷確認本機 installability 無錯誤；正式站確認 HTTPS manifest／圖片可下載且像素正確。Android 需在同一手機實際點「安裝」，再由「應用程式資訊」及桌面確認新版圖示，才可將實機案例改為 PASS。若仍失敗，收集 Chrome 版本、手機型號、安裝畫面與 WebAPK 診斷，續查裝置／Chrome 服務，而非改判「建立捷徑」為安裝成功。

## DEV-134 PWA 失敗恢復 Corrective Addendum（2026-10-01）

成熟度：本地實作／受影響回歸完成；風險 Medium；狀態：本地 PASS，未部署。結果見 [QA-DEV-134](../qa/QA-DEV-134-pwa-recovery-local-verification.md)；不宣稱獨立 QC 或正式驗收。
人類來源：正式站反覆出現「載入新版時發生問題」→多層次分析→四項根本方案→「請依此修復」。
Spec Impact：Intentional replacement。取代 failed 只能清快取的實際行為與未受 safety gate 保護的恢復導覽；沿用 ADR-047 架構及其他既有 safety／資料／owner contract。

### 本輪契約與邊界

- 失敗診斷：v1 transaction 相容新增 optional errorMessage（最多 1024 字元）；hydrate／同 target 檢查保留 errorCode／原因。舊 v1 無原因時由 errorCode 提供最短可行說明。
- failed 對背景檢查仍為 terminal；明確「重試」先重新取得 latest，已載入最新才解除已解決的 failed metadata。仍需切版時在本分頁 safety gate 及 Web Locks／PWA-owned IDB lease 內建立新 attempt／transaction ID，舊 owner 不可 commit；每個 attempt 仍只容許一次正常導覽與一次 bounded recovery。
- 背景 registration／update／metadata 檢查失敗只記診斷，不把可用畫面升格為 load failure，不顯示假新版。metadata 成功後可收斂已解決狀態。
- 錯誤 UI：update failure 顯示「重新載入未完成」、load failure 顯示「畫面載入失敗」、人工 cache recovery failure 顯示「快取恢復未完成」。primary「重試」使用同一安全流程；secondary 保留人工快取恢復，business/auth/IDB 不新增清除操作。320／390／1440 viewport 不溢出，keyboard CTA 可達。
- 導覽：projed_update_latest recovery query 不可被 Workbox NavigationRoute 的 cached index fallback 攔截；自己的正常／恢復導覽仍由 pwaUpdateService 唯一 writer 控制。loaded releaseId === targetVersion 才 completed，HTTP 200 不是成功證據。
- Shipping compatibility：sealed build 接受 machine binding --previous-manifest／PROJED_PREVIOUS_RELEASE_MANIFEST，驗證同 project／PROD、前版 tree／每檔 hash／canonical path，保留前版自身 assets（不遞迴携帶更早的 retention）。不能覆寫同 URL 不同 bytes、不能攜入前版 HTML／metadata／sw.js。保留項目納入新 manifest tree、scan 及 remote provenance。release executor 對缺前版 binding／retention 的新發布包 fail closed；binding 不構成新增人類批准。
- Hosting /assets 缺漏不再 rewrite 到 index.html；quick-task 入口及正常 SPA 導覽保持原 route contract。
- 不含 production deploy、遠端變更、強制更新、舊 cache 回收、schema／Auth／業務資料變更。現有其他 dirty changes 不 stage／還原；本地完整 app build 不代表可直接發布該 dirty 工作樹。

### 2026-10-02 Quick Task 共用更新生命週期補正

Quick Task 是獨立 MPA document，但與主程式共用同源 `/sw.js`。舊實作只用原生 `navigator.serviceWorker.register()` 註冊 worker，沒有在 quick shell 啟動 `pwaUpdateService`；從主程式捷徑或快速 App 圖示開啟時，更新 worker 可能停在 waiting，quick HTML 仍由舊 precache 回應。

快速頁現在先註冊自己的 reload-safety owner，再以延遲匯入載入共用 `setupPwaLifecycle()`。空白且安全的頁面會沿既有 latest-version／waiting-worker／安全重載流程收斂新版；草稿、語音、認領或本機保存進行中仍由同一 safety gate 阻擋切換。更新器不加入 quick 首屏 graph、不新增第二 worker、不清除任何帳號、outbox 或其他儲存。驗收契約為 R11；本機產生的 Workbox build A→B 實測見 [QA-DEV-134](../qa/QA-DEV-134-pwa-recovery-local-verification.md#2026-10-02-quick-task-更新生命週期補正)。

### QA frozen acceptance

| ID | 前置／操作 | 預期／證據 |
|---|---|---|
| R01 | 保存 failed 同 target，連續檢查／reload | 原因與錯誤碼保留，背景不重開 activation、不循環導覽；adapter＋browser |
| R02 | failed 之後明確點重試 | 新 fenced attempt，可收斂；雙分頁只一 activation，loaded target 才結案；真 SW |
| R03 | current=latest 且殘留 failed | 解除已解決 PWA 狀態，不動業務資料；adapter＋browser |
| R04 | update／register／metadata 網路失敗，回網 | 現有可用 app 沒有載入失敗橫幅；真 browser＋fault injection |
| R05 | dirty／booting／unknown owner 時 retry 或 load recovery | 無強制導覽；safe 後走本分頁安全流程；adapter＋browser |
| R06 | controlled client 從舊版本以 recovery query 導覽 | GET 真網路 HTML，載入 target；原 SW/cache 保留；真 SW trace |
| R07 | 前版 asset 不在新 build／同路徑不同 bytes／tamper／traversal | 前版自己的資產保留且 hash 正確；無限累積／tamper／collision／越界均拒絕；封裝 fixture |
| R08 | 缺 /assets 檔案、quick-task、SPA route | assets 404；其他 route contract 正常；Firebase matcher＋local delivery；正式 readback 待發版 |
| R09 | update/load/cache failure、normal dirty prompt，三 viewport／鍵盤 | 文案／原因／CTA 正確，無 overflow；UI screenshot／量測 |
| R10 | A→B、背景往返、重整、多分頁與錯誤重試前後 sentinel | Session／草稿／localStorage／業務 IDB／舊 release cache 保留；真 browser |
| R11 | 以受控 build A 開啟 `/quick-task/`，切換候選至 B 並觸發 worker update | quick shell 延遲載入共用 updater，在安全邊界由 A 收斂至 B；title control 可用、仍留在 quick route、單一共用 root worker；真 Workbox browser |

QC 在候選 source freeze 後執行；最初正式截圖 failure 保留。fixture 只支持實際層級，不將新 profile／匿名 smoke 代替使用者既有 profile 或正式 lifecycle。結果與精確命令由 DEV-134 記錄。
