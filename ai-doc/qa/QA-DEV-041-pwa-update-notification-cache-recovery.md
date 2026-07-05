# QA-DEV-041: PWA 更新通知與快取恢復驗證計畫

狀態: Local + Production QC Passed / Production Release Deployed
關聯 DEV: DEV-041
關聯 SPEC: `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md`
建立日期: 2026-07-05

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
- Expected: 按鈕文字可辨識，不是單純「確定」。

B03. 更新提示可 dismiss / later。
- Expected: 本 session 不反覆彈出；service 仍保留已知更新 callback。

B04. `onOfflineReady` 狀態不與 `update-available` 混淆。
- Expected: offline-ready 可以低干擾呈現或被記錄，不蓋掉更新提示。

### C. Apply Update Flow

C01. 點擊更新按鈕。
- Expected: 進入 `applying` state，按鈕 disabled 或顯示處理中。

C02. 連點更新按鈕。
- Expected: 不會重複呼叫多次 `updateSW(true)` 或造成多次 reload。

C03. update callback 成功。
- Expected: 觸發一次可驗收 reload / navigation。

C04. update callback 失敗。
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
- 更新按鈕點擊後的 state / callback / reload evidence。
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
