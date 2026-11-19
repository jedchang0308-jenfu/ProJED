# QA-DEV-041: PWA 更新通知與快取恢復驗證計畫

狀態: Local + Production QC Passed / Production Release Deployed
關聯 DEV: DEV-041
關聯 SPEC: `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md`
建立日期: 2026-07-05

> 2026-11-19 現行契約：一般新版只在「⋯」提醒、使用者按「更新」後套用，依 [SPEC-041 DEV-141 的 A01–A08](../specs/SPEC-041-pwa-update-notification-cache-recovery.md#dev-141-manual-app-updates) 驗收。一般更新不得要求開發人員選項、ADB、清除資料或重裝；名稱／圖示／模式等安裝資訊變更另需原生遷移驗證。下方保留 DEV-041 歷史案例，不以早期自動套用或重載條款覆蓋現行契約。可重現入口：`npm run verify:dev-141-manual-update`。

> 2026-08-30 authority note：本文件保留 DEV-041 Phase 1 與既有 production release 的歷史驗證事實。DEV-096 已重新開啟「同版本提示重複出現」缺陷；B02 的舊 CTA「一鍵更新到最新版」與 C01～C04 的 normal cache-purge apply 語意，已由 SPEC-041 `DEV-096 Corrective Addendum` 及 `ai-doc/qa/QA-DEV-096-pwa-update-transaction-convergence.md` 取代。其他 DEV-041 cases 仍是 regression；不得以本文件歷史 PASS 宣稱 DEV-096 已通過。

<a id="dev-141-installed-phone-acceptance"></a>

## DEV-141 已安裝手機正常更新補驗（2026-11-19）

範圍：使用者既有 Android 已安裝「ProJED-建待辦」。方法為使用者協作的正常 App／Chrome 介面驗收，不使用開發人員選項、重新配對、重裝、清除資料或技術診斷頁；未宣稱獨立 QC。使用者核准先發布再測手機切換，正式站由 `20261119091203-538b7b` 更新至 `20261119123850-c35cf3`，來源為 `e59560cc121995442b24b7beabe09b991b0a5ece`。

| 操作 | 實機觀察／使用者回報 | 結果 |
| --- | --- | --- |
| 開啟「⋯」查看新版 | 使用者回傳 20:45 截圖：紅點 1、「新版已就緒」、「更新／稍後」；名稱為「ProJED-建待辦」。使用者確認截圖為按稍後前。 | 正常選單提醒通過；不將此截圖當成已更新完成。 |
| 按稍後，從最近使用的 App 關閉，再由桌面重開 | 使用者回覆「符合：紅點消失，仍可按更新」。 | 手機人工觀察通過，未自動切換成已更新狀態。 |
| 在已安裝 App 按一次更新 | 使用者依正常選單完成操作，回覆「App 更新完成」。 | 手機正常更新操作通過，未要求技術設定或額外安裝。 |
| 更新時保留同來源另一頁 | 先在手機 Chrome 的 `https://projed-cc78d.firebaseapp.com/quick-task/` 留下未送出的測試草稿，更新已安裝 App 後返回該原分頁；使用者回覆「另一頁草稿仍在且未見重載」。 | 手機人工觀察通過；未建立測試待辦。 |

證據邊界：手機結果來自使用者截圖與操作回報，未用 ADB 抽取手機數字版號或導覽次數。真實 A／B／C 建置的數字版號、單次導覽及其他分頁零新增導覽另由 DEV-141 本機自動化驗證支持。這次手機補驗不涵蓋其他裝置或所有舊更新器。

機器紀錄：[手機觀察](../../output/mobile-real-device/dev141-manual-update/observations.json)、[正式發布收據](../../outputs/projed-dev141-mobile-release-e59560c/output/release/dev-083/20261119123850-c35cf3/direct-evidence.json)（本機產物）。正式收據包含 271/271 檔案及正常選單檢查通過，保留首次新設定檔 worker 安裝期間的檢查逾時及後續複驗。原 manifest／圖示內容一致，前版入口仍保留。

### 主程式手機補驗的載入阻礙（2026-11-19）

使用者已確認主程式已安裝版可看到「新版已就緒／更新／稍後」，但另開正式站 Chrome 分頁時卡在深色登入「載入中」。這是本輪主程式手機驗收的原始失敗，後續修正與獨立的主程式實機操作結果如下，不沿用快速待辦的手機 PASS。

全新未登入的手機尺寸 Edge 在有／無 worker 下皆正常到登入頁。以合成既有 session、攔截所有後端請求後，個人資料請求不回應可重現相同載入畫面；釋放為失敗後即可開啟主畫面。這確認了可造成症狀的路徑，未宣稱已直接讀取手機內的失敗請求。

修正：個人資料同步共用 10 秒取消期限，失敗沿用原有 session-user fallback；未確認登入狀態仍不開放主畫面。登入等待超過 15 秒提供保留資料的手動「重試」，只重載本頁。未清除 session、放寬權限或加入自動重整。

隔離驗證：未登入、個人資料不回應、session refresh 不回應三項通過；手動重試保留 session，另一頁不新增導覽且測試草稿保留。入口：`node scripts/verify-auth-startup-recovery.mjs <dist>`，以 `PROJED_PLAYWRIGHT_MODULE` 指定現有 Playwright。證據：[失敗重播](../../output/mobile-real-device/dev141-auth-profile-pending.json)、[修正驗證](../../output/auth-startup-recovery/result.json)、[同一正式產物驗證](../../output/auth-startup-recovery/production-artifact/result.json)（本機產物）。全部 Supabase 流量均由測試攔截，不使用正式身分或寫入正式資料。

正式發布：[PR #31](https://github.com/jedchang0308-jenfu/ProJED/pull/31) 合併來源 `b6ca86239900c4d945b2060c42c1ae6e1d7d0206`，release `20261119132017-8675f2`。348/348 canonical 檔案及新匿名主程式啟動 smoke 通過，舊版資產保留。[發布收據](../../outputs/projed-auth-startup-release/output/release/dev-083/20261119132017-8675f2/direct-evidence.json)為本機產物。

主程式手機補驗通過：使用者從已安裝「ProJED 3.0」的正常選單檢查並更新後，回覆「更新完成，可進入主畫面」。保留原本失敗的 Chrome 頁面，再另開 `https://projed-cc78d.web.app/` 新分頁，使用者確認「符合：原頁未重整，新頁正常載入」。整個正常更新驗收未要求開發人員選項、重新配對、清除資料或重裝。這是使用者協作的可見畫面驗收；未聲稱手機導覽次數、數字版號或實際失敗請求已經工具讀回。未另測主程式手機的「稍後」重開，該項手機證據仍限快速待辦。

[主程式手機觀察紀錄](../../output/mobile-real-device/dev141-manual-update/main-observations.json)（本機產物）。本次結案文件不另發布 App。

下方為 DEV-041 的歷史計畫與證據；本節手機補驗依現行 DEV-141 判定。

## QA 目標

驗證新版本發布後，使用者能看見更新提示、主動按更新按鈕套用新版本，且 stale cache / chunk-load 類異常有可恢復流程。此 QA 不驗證正式部署本身；正式部署需另走 deployment-release-gate。

## 風險模型

| 風險 | 嚴重度 | 主要驗證 |
|---|---:|---|
| 有新版本但使用者完全不知道 | P0 | `onNeedRefresh` 觸發後 UI 必須顯示更新提示 |
| 更新按鈕點了無效或重複 reload | P0 | apply/update flow、disabled state、reload loop guard |
| 使用者正在操作時被強制刷新 | P0 | 正常 update 不得自動刷新；需使用者按更新 |
| 舊 chunk / cache 導致白畫面 | P0 | chunk-load recovery path、ErrorBoundary cache recovery |
| 清快取誤刪業務資料 | P0 | recovery scope 不得清除未授權 storage |
| 更新提示 mobile 被遮住或無法點 | P1 | mobile viewport screenshot / hit target |
| PWA install guidance 被破壞 | P1 | DEV-034 regression |
| production deploy 後缺 evidence | P1 | release gate 才能宣稱正式站通過 |

## 測試矩陣

### A. Static Contract

A01. `pwaUpdateService` 暴露 update state 與 apply/recovery API。
- Expected: 不由 UI 直接散落呼叫 `registerSW()`。

A02. 最低 state set 存在。
- Expected: `idle`、`checking`、`update-available`、`applying`、`offline-ready`、`recoverable-cache-error`、`failed` 可被驗證或映射。

A03. `onNeedRefresh` 不只背景 queue update，還會通知 UI。
- Expected: static verifier 可找到 state event/subscription/store update。

A04. `skipWaiting: false` 與 prompt update 模式未被無故改成強制立即接管。
- Expected: 正常更新仍由使用者按更新套用。

A05. cache recovery action 只處理 Service Worker / Cache Storage。
- Expected: 不清除 localStorage / IndexedDB 業務資料，除非另有明確授權。

### B. Update Available UI

B01. mock `onNeedRefresh` 或注入 update state。
- Expected: 畫面出現「有新版本」類提示。

B02. 更新提示包含明確更新按鈕。
- Expected: 按鈕文字為精簡且可辨識的「一鍵更新」，不使用已被 DEV-096 取代的「一鍵更新到最新版」。

B03. 更新提示可 dismiss / later。
- Expected: 本 session 不反覆彈出；service 仍保留已知更新狀態，且不因 dismiss 清掉 queued callback。

B04. `onOfflineReady` 狀態不與 `update-available` 混淆。
- Expected: offline-ready 可以低干擾呈現或被記錄，不蓋掉更新提示。

### C. Apply Update Flow

C01. 點擊更新按鈕。
- Expected: 進入 `checking` / `applying` state，按鈕 disabled 或顯示處理中；若存在已知更新，應走一鍵 reload 最新 app shell 流程。

C02. 連點更新按鈕。
- Expected: 不會重複呼叫多次 update / cache recovery 或造成多次 reload。

C03. latest app shell reload 成功。
- Expected: 不使用 stale queued callback，觸發一次可驗收 reload / navigation；不得清除 local/session 業務資料。

C04. latest app shell reload / app cache recovery 失敗。
- Expected: 進入 `failed` 或顯示可恢復訊息，不靜默失敗。

### D. Stale Chunk / Cache Recovery

D01. 模擬 dynamic import / chunk-load failure。
- Expected: 顯示 recovery path 或受控 reload，一次嘗試後有 loop guard。

D02. 短時間內第二次 chunk-load failure。
- Expected: 不無限 reload；轉為使用者可見 recovery UI 或 ErrorBoundary。

D03. 點擊「清除快取並重新整理」。
- Expected: unregister SW / delete Cache Storage 後 reload；不清除未授權業務資料。

D04. Cache API 不可用或刪除失敗。
- Expected: 顯示失敗狀態或 fallback reload，不卡死。

### E. ErrorBoundary Integration

E01. 觸發 React ErrorBoundary。
- Expected: 顯示 reload / recovery 操作，文案與 PWA recovery 一致。

E02. ErrorBoundary recovery button。
- Expected: 不直接清除業務資料；若執行 cache recovery，作用範圍清楚。

E03. ErrorBoundary 與 AppUpdatePrompt 同時存在。
- Expected: 不重疊到不可操作；錯誤恢復優先順序清楚。

### F. Responsive / Accessibility

F01. 390x844 mobile viewport。
- Expected: 更新提示可見、文字不溢出、更新按鈕可點、不被 safe area 裁切。

F02. 1440x900 desktop viewport。
- Expected: 提示不遮蔽主要任務操作，位置穩定。

F03. Keyboard flow。
- Expected: 可 tab 到更新按鈕與 dismiss；focus visible。

F04. Screen reader contract。
- Expected: 提示具有合理 role / aria-live 或等效語意；更新按鈕有清楚 accessible name。

### G. Regression

G01. DEV-034 PWA install guidance static verifier。
- Expected: pass。

G02. DEV-034 PWA install guidance browser verifier。
- Expected: pass。

G03. TypeScript。
- Expected: `npm.cmd exec tsc -- --noEmit` pass。

G04. Build。
- Expected: `npm.cmd run build:test` pass。

G05. Main board / task workbench smoke。
- Expected: 全域提示掛載不破壞看板與任務台基本操作。

## 建議自動化命令

RD 完成 Phase 1 後至少執行:

```powershell
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser
npm.cmd run verify:dev-034-pwa-install-guidance
npm.cmd run verify:dev-034-pwa-install-guidance-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

若正式部署另行授權，deployment-release-gate 需補:
- production build artifact evidence。
- pre-deploy production-like smoke。
- Firebase deploy evidence。
- post-deploy smoke。
- 新版本提示 / cache recovery production smoke。
- rollback readiness。

## QC Evidence 要求

QC 報告不得只寫「看起來可以」；至少需包含:
- static verifier pass/fail 與檢查項數。
- browser verifier pass/fail、viewport、截圖或 DOM evidence。
- mock `update-available` 的觸發方式。
- 更新按鈕點擊後的 state / latest reload evidence；若有 queued callback，需證明不會套用 stale callback。
- reload loop guard evidence。
- cache recovery 不清除未授權 storage 的 evidence。
- DEV-034 regression evidence。
- TypeScript 與 build evidence。
- production deploy 是否執行；若未執行需明確寫「Production Not Deployed」。

QC evidence report:
- `ai-doc/qc/QC-DEV-041-pwa-update-notification-cache-recovery.md`

## Stop Conditions

出現以下任一情況，QA 應退回 RD:
- 有新版本時 UI 沒有任何可見提示。
- 更新按鈕不會套用更新，或可能造成連續 reload。
- 正常更新在使用者未按更新時強制刷新。
- chunk-load failure 會進入無限 reload。
- cache recovery 會清除未授權的業務資料。
- mobile viewport 更新提示被遮住、無法點擊或文字溢出。
- DEV-034 PWA install guidance regression。
- 文件或回報宣稱 production deploy，但沒有 release gate evidence。
