# QA-DEV-096: PWA 更新交易收斂與提示精簡驗證計畫

狀態: `Local QA Executed / Core Acceptance PASS / DEV-096 Historical Baseline after DEV-097 / Production Not Authorized`
關聯 DEV: DEV-096 / DEV-097 / DEV-041 / DEV-034
關聯 SPEC: `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md` DEV-096 Corrective Addendum
風險等級: Medium（P0 更新失效模式）
建立日期: 2026-08-30

## QA 目標與證據邊界

Authority note：本計畫保留 DEV-096 已執行的 click-to-apply transaction evidence，不回寫歷史
PASS。DEV-097已取代normal update一律等待點擊的產品語意；safe／dirty、natural boundary、
flush-and-reload、application-owned Workbox與per-document controller／cache isolation以
`ai-doc/qa/QA-DEV-097-pwa-safe-reload-orchestration.md` 為新 QA authority。UI-01～UI-03、
「未點擊不得 apply」與每個 target 必須點擊一次，只能作 DEV-096 regression baseline，不能
支持 DEV-097 PASS。

驗證使用者對同一目標版本只需按一次「一鍵更新」，系統就能將 worker activation、controller 接管、reload 與 post-reload 版本對帳收斂成單一交易。更新完成後，同一 target 的「有新版本可用」不得再出現；失敗必須進入有界限恢復或可見錯誤，不把重複點擊當成正常恢復流程。

證據分層:

- Static / pure state-machine evidence 只證明契約、transition、持久化格式與 forbidden path。
- Test-mode browser evidence 證明 UI、同分頁防連點、accessibility 與可見狀態；不證明真實 service worker activation。
- Versioned service-worker integration evidence 使用三個 immutable app artifacts A／B／C 證明真實 waiting、controlling、reload、post-reload 對帳與多分頁收斂。
- Build、TypeScript 與既有 regression 只支持編譯／相容性，不可取代上述 UI 與 lifecycle evidence。
- Production 不屬本 QA 授權邊界；未另進 release gate 前只能宣稱 local artifact 通過。

## UI Entry Contract

- Target actor: 任一開啟 ProJED web app／已安裝 PWA 的使用者，不限登入後 route；提示位於 `AuthGate` 外的全域層。
- 正常起點: 使用者正在任一 app route，新 release 已被檢查為 `update-available`，且使用者未對該 target 選擇稍後。
- 入口: viewport 底部的全域提示，標題「有新版本可用」，唯一主要 CTA 「一鍵更新」，次要動作「稍後」與關閉控制。
- 正常操作: 點擊「一鍵更新」 → CTA 立即轉為「更新中」並 disabled → worker 接管 → 單次 reload → 新頁面對帳 target → 不再顯示同 target 的更新 CTA。
- 窄版: 390×844 與 320×844；桌面: 1440×900。提示不得被 safe area、Toast、Modal 或固定工具列裁切。
- 一般 update-available 狀態不顯示左側圖示、說明段落、「到最新版」字樣、版本 badge 或額外成功宣告。
- `recoverable-cache-error`／`failed` 不適用一般提示的刪文字規則；需保留最短原因、重試或「清除快取後重整」恢復動作。
- 失敗條件: 無入口、按一次後同 target 再顯示 update CTA、更新中可重入，或出現任一非 fixture 預期的 `.inline-error`／`[role=alert]`／HTTP 4xx／5xx／白畫面／空 root。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---:|---|
| 按一次後同 target 提示再出現 | target 未持久化或 post-reload 未對帳 | 需連續點擊、失去信任 | A→B 真實 SW 案例與 completed-target readback | P0 | SW-01、SW-03 |
| 單分頁重複 apply／reload | 連點、callback 與 controller 各自 reload | 工作中斷、reload loop | apply call count、navigation count、transaction trace | P0 | TX-02、SW-02 |
| 多分頁同時寫入 | 缺原子 owner lock／fence／同步 | 不同頁籤交錯更新 | 雙分頁近同時點擊，比對 transaction／fence | P0 | MT-01、MT-02 |
| B waiting 但發布已到 C | 點擊前未 fresh update／target 被過期 callback 凍結 | 套用過期 B，立即再提示 C | A／B／C 版本化伺服器 | P0 | SW-05 |
| controller 未接管 | waiting worker 消失、registration 競態或 timeout | 按鈕停在更新中 | fault injection，timeout與 visible error | P0 | TX-04 |
| reload 後仍是舊版 | stale document／edge 傳播 | 無限 reload 或反覆提示 | 強制 stale index fixture | P0 | SW-05 |
| 正常更新誤清業務資料 | 把 recovery 當正常路徑 | 登出、資料遺失 | storage snapshot before／after | P0 | SAFE-01 |
| 精簡後無法理解主動作 | 連 CTA 文字或焦點也刪除 | 無法開始更新 | keyboard／accessible name／真實畫面 | P1 | UI-01～UI-04 |
| 手機提示遮擋或溢出 | fixed bottom 與 safe area／按鈕並排衝突 | 主要 CTA 無法點擊 | 390／320 viewport 量測 | P1 | UI-02 |

## Fixture 與環境

### F1: Test-mode UI fixture

- 以現有 `window.__projedPwaUpdateTest` 擴充版本化交易測試 API，但不得直接把成功結果寫入 state 來取代 delivery path。
- 允許 fixture 模擬 registration waiting／controller signal，但 browser 結論只限 UI 與 transaction adapter 層。

### F2: Versioned real-SW fixture

- 建置三個 immutable artifacts：`dev096-A`、`dev096-B`、`dev096-C`；每個 artifact 的 injected release ID、`release-meta.json`、entry bundle 與 `sw.js` 必須一致。
- 使用 task-owned local HTTP server 以同一 origin 切換 active artifact，回傳 `index.html`、`release-meta.json`、`sw.js` 時使用 no-store；不使用 synthetic event 代替 worker lifecycle。
- 伺服器啟動前記錄 project／purpose／port／PID tree／cleanup condition；完成或失敗後停止該 task-owned process tree 並確認 port released。
- Browser evidence 需記錄 exact browser version、origin、viewport、artifact IDs，以及每次 navigation／controller／transaction trace。

## 測試案例

### A. Static / Pure Contract

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| CT-01 | 檢查 `PwaUpdateTransactionV1` parser／serializer／transition | invalid schema／phase／version／timestamp fail closed；valid round-trip byte-stable | pure result JSON |
| CT-02 | 檢查 production version identity | sealed build 將 `PROJED_RELEASE_ID` 注入 current client；`release-meta.json` latest ID 同 namespace 可對帳 | static + artifact verifier |
| CT-03 | 檢查 local／test fallback | 無 release ID 時使用 `bundle:<hash>`；不把 production 空 ID 當成有效版本 | pure result JSON |
| CT-04 | 搜尋正常 apply path | 不得呼叫 `clearPwaApplicationCacheAndReload()`，不得綁定 background／`pagehide` 自動 apply | static forbidden markers |
| CT-05 | 檢查 transaction ownership | Web Locks 或獨立 PWA IndexedDB 原子鎖；同 target 最多一個有效 owner fence，逾期可接管，舊 fence 不得 commit | pure concurrency + adapter cases |
| CT-06 | 檢查 completed target | `currentVersion === targetVersion` 才寫 completed／移除 active transaction；mismatch 不得清成功 | pure transition cases |

### B. UI / Accessibility

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| UI-01 | 觸發 `update-available` | 只顯示「有新版本可用」、「一鍵更新」、「稍後」與關閉；無左側圖示、說明段落、「到最新版」 | DOM + screenshot |
| UI-02 | 1440×900、390×844、320×844 | 主 CTA 可見可點；無水平溢出、重疊、裁切、按鈕擠壓或 safe-area 遮擋 | screenshot + bounding boxes |
| UI-03 | 點擊「一鍵更新」 | 立即顯示「更新中」；primary disabled，關閉與稍後隱藏或 disabled，無第二主動作 | DOM state + click count |
| UI-04 | 鍵盤 Tab／Enter／Space、focus return、ARIA live | 視覺與 DOM 順序一致，focus visible／不遺失，狀態可被輔助科技取得 | accessibility snapshot + screenshot |
| UI-05 | 觸發 recovery／failed | 保留最短原因與 recovery action；不套用一般提示的無說明規則 | DOM + screenshot |
| UI-06 | visible error sweep | 無非預期 alert、HTTP error、白畫面、空 root、console error 或 pageerror | sweep result JSON |

### C. Single-tab Transaction

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| TX-01 | A 檢查到 B，按一次 | 只建立一 transaction／owner／skip-waiting 請求，進入 awaiting-controller | state trace |
| TX-02 | 快速雙擊與 programmatic re-entry | apply 呼叫數與 normal reload reservation 都為 1 | counters + trace |
| TX-03 | 同 target transaction 尚在進行時 visibility／check／`onNeedRefresh` 再觸發 | 只同步原 transaction，不開新提示或 owner | state trace |
| TX-04 | 注入 waiting 消失／controller timeout | 無 reload loop；進入 `failed` 並顯示可恢復錯誤 | fault artifact + screenshot |
| TX-05 | target 在 prepare 期間變動超過允許輪數 | fail closed 為 `TARGET_UNSTABLE`，不套用已知過期 worker | pure/browser trace |

### D. Real Service Worker / Version Sequence

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| SW-01 | 開 A，server 切 B，檢查後點擊一次 | waiting B 接管，只一次 normal navigation，載入 B，transaction 清除，completed=B | lifecycle trace + screenshot |
| SW-02 | A→B 完成後重複 registration.update／visibility／reload | 同 B 不再顯示「有新版本可用」 | trace + absence assertion |
| SW-03 | A→B 完成，再切 C | B→C 是新 transaction；每個 target 各一次點擊／一次 normal navigation，最終 C | A/B/C trace |
| SW-04 | 從 A 安裝 B waiting，點擊前 server 改 C | 點擊 preflight 重跑 `registration.update()` 並採用 C；一次點擊後直接載入 C | waiting IDs + trace |
| SW-05 | controller 已變但第一次 document 故意回傳舊 A | 只保留一次 bounded recovery navigation；第二次仍 mismatch 轉 failed，不無限 reload | stale fixture + navigation count |

### E. Multi-tab / Crash Recovery

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| MT-01 | 同 origin 兩分頁同時看到 B，近同時點擊 | 共用同一 transaction ID，只一有效 fence 送出 apply；兩分頁各自最多 reload 一次並到 B | dual-page trace |
| MT-02 | owner 在 skip-waiting 前關閉 | lease 未過期前無第二 owner；過期後 fence 遞增並由另一頁接管同 target，舊 fence commit 被拒絕 | close/lease/fence trace |
| MT-03 | 分別停用 BroadcastChannel、Web Locks | `storage` event 可同步；獨立 PWA IndexedDB 可原子取得 owner；兩種 fallback 都無重複 apply | capability fallback trace |

### F. Safety / Recovery / Regression

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| SAFE-01 | 正常 A→B 前後 snapshot local/session storage、IndexedDB 主要 DB 與 auth markers | 除 PWA-owned transaction／version keys 外 byte-equivalent；不 unregister all SW／delete all caches | storage diff + API spies |
| SAFE-02 | 主動點擊「清除快取後重整」 | 只對同 origin SW registrations／Cache Storage 處理並 readback；不清業務 storage | recovery trace |
| REG-01 | DEV-041 static／browser regression | 舊 verifier 更新為 DEV-096 authority 後通過，不再斷言 normal cache purge 或舊 CTA | command output |
| REG-02 | DEV-034 install guidance static／browser | PWA 安裝提示與 update prompt 不衝突 | command output + browser evidence |
| REG-03 | TypeScript／build:test | 均 exit 0，build 產生 PWA assets | command output |
| REG-04 | 任務台／看板 basic smoke | 全域提示掛載不破壞主要操作；visible error sweep 為 0 | browser smoke |

## RD 建置的驗證入口

RD 必須建立並掛入 `package.json`:

```powershell
npm.cmd run verify:dev-096-pwa-update-transaction-convergence
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-browser
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-sw
```

完整 local gate:

```powershell
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

## QC Evidence Contract

QC 依凍結 candidate 執行，不修改產品檔案。最少需留下:

- `output/qa/dev-096/static-result.json`: source revision、dirty boundary、cases、summary，pure transition 與 forbidden path 結果。
- `output/playwright/dev-096/ui-result.json`: browser exact version、URL、viewport、操作、DOM 量測、visible-error sweep 與 1440／390／320 screenshots。
- `output/playwright/dev-096/sw-integration-result.json`: A／B／C artifact IDs、served parity、registration waiting／active／controller trace、transaction IDs，navigation count、多分頁 owner 與 cleanup result。
- 每個本機 harness 的 PID／port／purpose／cleanup condition 與 `port released=true`。
- TypeScript、build:test、DEV-041／034 regression 的 command、exit code 與適用層級。
- 驗證過程任一可見錯誤的首次證據、RD 修正後重跑結果；不得以後續 build 成功抹除原失敗。

## Stop Conditions

任一項成立即退回 RD，DEV 不得進入完成或 release gate:

- 同 target 需第二次點擊、出現超過一次 normal reload，或 bounded recovery 後仍繼續自動 reload。
- completed target 對帳失敗卻清除 transaction，或同版本 update CTA 再出現。
- 兩分頁可同時持有有效 owner fence、產生兩個 transaction IDs 或重複 skip-waiting。
- 正常更新仍 unregister 所有 SW／刪除 Cache Storage，或任何路徑清除未授權業務資料／登入狀態。
- 使用者未點擊時，background／`pagehide` 自動套用或重新載入。
- UI 仍有左側更新圖示、一般說明段落、「到最新版」，或桌面／手機有溢出、重疊、焦點遺失、按鈕擠壓。
- 任一非預期 visible error、console error、pageerror、HTTP 4xx／5xx、白畫面或空 root。
- 缺真實 SW lifecycle／A→B→C／多分頁／post-reload evidence，卻以 test-mode synthetic event 宣稱通過。
- task-owned runtime 未清理或 port 未釋放。

## Execution Record（2026-08-30）

本地 frozen working-tree candidate 已執行核心 acceptance。static/pure 25/25；test-mode browser 通過 390×844、320×844 compact UI、稍後保留 transaction、single-click completion、recovery prompt 與 visible-error sweep；real-SW fixture 通過 A→B、B→C、B waiting→C retarget，並以兩個同 origin page 近同時套用驗證共用 transaction ID／單一 owner fence／兩頁 post-reload 到 B。DEV-041 static/browser、DEV-034 static/browser、TypeScript、build:test、production artifact parity 與 touched-file ESLint 均 exit 0。

直接 evidence：`output/qa/dev-096/static-result.json`、`output/playwright/dev-096/ui-result.json`、`output/playwright/dev-096/sw-integration-result.json`、`output/playwright/dev-096/*.png`、`ai-doc/qc/QC-DEV-096-pwa-update-transaction-convergence.md`。real-SW task-owned fixture 最終 `portReleased=true`。

首輪失敗不抹除：real-SW 初始驗證曾抓到 waiting lifecycle 時序、Windows spawn／Response serialization 夾具問題，以及產品層 controllerchange reload owner、舊 async writer、retarget stale waiting worker 三個缺口；後續只在對應 harness／產品責任層修正，fresh rerun 已通過。未執行 production deploy、remote smoke 或 release。

## Release Boundary

本計畫不執行 production deploy。本機 QA／QC 通過後，若要正式交付，另由 deployment/release gate 使用 immutable release ID 與 candidate artifact 驗證 hosting 的 `release-meta.json`／`index.html`／`sw.js` 一致性、A→B 更新流程與 rollback readiness。未有該層 evidence 前一律標記 `Not Released`。
