# DEV-134 PWA 恢復本地驗證

日期：2026-10-01 起，2026-10-02 更新。原始記錄是部署前本地驗證快照；本文件末尾的 2026-10-02 發布後補記提供後續 release 與 live evidence。正式網站 smoke PASS；使用者手機既有安裝尚未實機驗證。

## 範圍與來源

歷史快照（2026-10-01）：人類指令為本 chat「請依此修復」「繼續」，當時執行本地程式／設定／文件／驗證，沒有正式部署授權。2026-10-02 後續收到 live 部署明確授權，部署證據記於本文件發布後補記及 [REL-015](../release/REL-015-DEV-134-QUICK-TASK-PWA-20261002.md)。

Canonical repo `C:\VIBE CODING\ProJED\ProJED`，branch `持續優化3`，起始 HEAD `57f8c8d3a751c8698a0e28539a9187868aff1873`。本輪 PWA／release target 起始為 clean；其他 DEV-133／122／034／038 等既有 dirty 修改保留，未 stage／commit／還原。QA frozen R01～R10 位於 [SPEC-041 DEV-134 addendum](../specs/SPEC-041-pwa-update-notification-cache-recovery.md#dev-134-pwa-失敗恢復-corrective-addendum2026-10-01)，發布封裝補正見 [SPEC-083 §18](../specs/SPEC-083-production-release-environment-integrity.md#18-dev-134-前版資產相容補正2026-10-01)。RD 自驗與本地 QA 蒐證由同一 Agent 分階段執行，不宣稱獨立 QC。

已確認的故障鏈：舊 chunk URL 在 Hosting 回 HTML 200；舊頁面可能仍受舊 Service Worker 控制；failed transaction 被持續重用、原因遭後續檢查清空；背景 registration/update 失敗也被誤歸類為畫面載入失敗。[REL-014](../release/REL-014-DEV-133-INDEPENDENT-AUTH-20261001.md) 的舊 profile／waiting SW／人工清快取歷史保留，未被本地 PASS 改判為自動更新成功。

## 修復與證據

- Failed transaction 保留錯誤碼與原因；舊 schema v1 可讀。背景檢查不重新啟動 failed activation，不能掩蓋本分頁真實 load/cache failure。
- 明確「重試」取得最新 target，以新 transaction ID／lease／fence 重試；保留跨分頁鎖。已在目前版本的殘留 update failure 退場；真正 load/cache failure 必須安全導覽才恢復。
- Retry、load recovery 與人工 cache recovery 都先檢查本分頁 readiness／dirty owner；互斥操作、保留業務儲存。恢復 URL 由真正網路取得 HTML，Workbox NavigationRoute 排除該 query。
- UI 分開顯示更新未完成、畫面載入失敗、快取恢復未完成；手機按鈕可換行，鍵盤有焦點提示。
- 新發布封裝保留前版自身 immutable assets 與 hashed Workbox runtime，驗證原 tree／每檔 hash／路徑／碰撞，排除更早繼承資產。部署前比對當前正式 release binding。Hosting 缺 assets 回 404。

| 驗收 | 本地證據 | 結果與界線 |
|---|---|---|
| R01 | Adapter 舊 v1／三次 replay；真 SW 重整及三次 metadata check | 原因保留、無背景重啟或循環導覽 PASS |
| R02 | 真實 UI「重試」→新 tx-retry→A/B 雙分頁 | 單次 SKIP_WAITING；unsafe 舊分頁等 readiness 後才重載；兩分頁讀到 B PASS |
| R03 | Adapter 與真 browser current=latest／殘留 failed | PWA failure 退場、無導覽、draft sentinel 保留 PASS |
| R04 | Register/update/metadata fault injection；真 browser offline | 現有 app 無假載入失敗提示；waiting/activated 不掩蓋真錯誤 PASS |
| R05 | Booting／dirty／unknown gate；真 load error＋跨 tab storage event | 不導覽、不清儲存；本分頁 load reason 保留 PASS |
| R06 | 真 controlled A worker 以 recovery query 導覽到 B | 伺服器收到 nonce GET，B HTML／身分讀回 PASS |
| R07 | 封裝 fixture 的 hash、tamper、collision、路徑、目錄 junction、共有資產及 generation | 範圍內拷貝、前版 generation bounded、非法情況拒絕 PASS |
| R08 | Firebase Superstatic matcher／實際 loopback HTTP | assets 404、SPA MAIN、quick-task QUICK PASS；Windows legacy URL slash 在隔離驗證程序採 Hosting POSIX 正規化，未改 dependency；正式 readback 待發布 |
| R09 | 實際 React prompt 的 320／390／1440、三種 failure、normal／blocked、鍵盤 | 15 張截圖、viewport／overflow／focus 量測 PASS；獨立 UI context 停用 background producer，生命週期另以真 SW 驗證 |
| R10 | 真 A→B／雙 tab／reload 的 localStorage、cookie、IDB、Cache Storage sentinel | Sentinel 保留且舊 release cache 未回收 PASS；僅為隔離儲存證據，不宣稱測試正式登入 Session 或使用者原 profile |

`output/qa/dev-134/recovery-result.json`：16/16；`browser-result.json`：9/9，source digest 在 browser run 前後一致。Browser requests 含兩分頁自己的 recovery GET 與舊 controller 的 network bypass GET。`output/playwright/dev-134/` 保存代表截圖；已目視檢查 320 更新失敗與 390 載入失敗畫面。

## 2026-10-02 Quick Task 更新生命週期補正

使用者回報正式站手機 App 仍呈現舊版。遠端 fresh-browser readback 在兩個 Firebase origin 都是同一 current release；source review 找到 quick MPA 雖註冊共用 root worker，卻未啟動 `pwaUpdateService`。從 quick shortcut 開啟不會執行 main SPA lifecycle，這使 waiting worker 缺少 quick client 的版本檢查與安全套用入口。

修正位於 `src/quickTask/main.ts`：先完成 quick reload-safety owner 註冊，再延遲匯入共用更新器。`vite build --mode test` isolated build PASS；quick bundle `quickTask-*.js` 33.14 kB（gzip 11.63 kB），`pwaUpdateService-*.js` 另成延遲 chunk 34.44 kB（gzip 10.70 kB），確認不會進入首屏 quick graph。沒有新增 worker、遠端資料寫入或使用者資料清除。

| 驗收 | 證據 | 結果／限制 |
|---|---|---|
| Q01 | `scripts/verify-dev-122-mobile-zero-data-quick-task.ts`，指定隔離 build 輸出 | 26/26 static assertions PASS；含 safety-ready 後才載入共用 updater、不靜態引入 updater |
| Q02 | `scripts/verify-dev-134-pwa-recovery.mjs` | 17/17 PASS；R11 quick-shell lifecycle source contract PASS |
| Q03 | `scripts/verify-dev-134-pwa-recovery-browser.mjs` 的真生成 Workbox A→B | 10/10 PASS；A controlled quick page讀到延遲 updater，觸發更新後以 B release marker 重載，title control enabled 並留在 `/quick-task/`；R01～R10 同輪 PASS |
| Q04 | TypeScript、變更檔 ESLint、isolated production-mode test build | 均 PASS；建置輸出獨立留在 `output/qa/dev-134/2026-10-02-quick-update/build-test/` |

瀏覽器證據位於 `output/qa/dev-134/2026-10-02-quick-update/browser-final/`；R11 截圖與測試 runtime 在 `output/playwright/dev-134/2026-10-02-quick-update-final/` 及同層 runtime 收據。測試 browserClosed／portReleased 均為 true。首次 R11 因本機 fixture 未將 `/quick-task/` 正規化成 `quick-task/index.html` 而 timeout；修正 fixture 後全套重跑 PASS，初次失敗證據保留於 `browser-retry/`。這是隔離 Chromium／本機雙 build 驗證，不代表使用者 Android／iPhone 實機驗收。

初次 browser R02 的 evaluate promise 被成功導覽中斷，及混用 lifecycle／synthetic UI 的 timer 競爭保留於初次收據／本輪工作紀錄；改以 loaded target readback 及獨立 UI context 驗證，未取消行為 oracle。正式最初截圖／REL-014 failure 保留。

## 命令與清理

- `node scripts/verify-dev-134-pwa-recovery.mjs`：16/16 PASS。
- 已安裝 Playwright CLI 的 `PLAYWRIGHT_CLI_PATH` 綁定後，`node scripts/verify-dev-134-pwa-recovery-browser.mjs`：兩個小型 adapter Vite build，`PROD=true`／mode=qa，實際 service／prompt／Vite Workbox 設定，9/9 PASS。未安裝依賴，未連遠端 backend。
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`：PASS。
- Targeted ESLint：PWA service／transaction／prompt、三個 release scripts、DEV-134 adapter/browser runner、DEV-097 verifier PASS。
- DEV-096 transaction 26/26、DEV-097 safety 23/23、DEV-083 production release gate mock regression PASS。既有 source-shape assertion 只放寬新增 retry reservation 的位置，原 completed-version 行為 oracle 保留。

HTTP routing fixture 與 browser fixture 均在啟動前記錄 project／PID／port／purpose／cleanup condition。最新 browser session `dev134-e7f8f12d`／PID `32884`／port `53930` 已關閉、確認連線拒絕；routing runtime 也已關閉。明確 session close 後不存在 task `.session` 檔；未操作使用者 browser 或 localhost4000。清理收據：`routing-runtime.json`、`browser-runtime.json`。

部署前快照（2026-10-01）：當時尚未生成 sealed package、未提交／部署、未驗證正式既有 profile。此狀態已由 2026-10-02 發布後流程更新；當時敘述保留作為稽核時間脈絡，不代表目前 live 狀態。

## 2026-10-02 發布後 live 驗證補記

產品程式 commit `e9317e66e3cbe5c9163a27a2bf045611ea0760cf` 已推送至 `origin/持續優化3`，live release `20261002034352-6ee8fb` 已部署至 Firebase Hosting site `projed-cc78d`。部署前 DEV-122 static 26/26、DEV-134 static 17/17、Workbox A→B browser 10/10（含 R11）、TypeScript、targeted ESLint、staging artifact secret scan 及 DEV-083 release readiness/candidate gates 均 PASS。該驗證由同一 Agent 分階段執行，不宣稱獨立 QC。

| 驗收 | 證據 | 結果／限制 |
|---|---|---|
| Level 3 preview | `output/release/dev-083/level3-evidence-e9317e6.json`；短期 URL `https://projed-cc78d--level3-smoke-lvbe8d9u.web.app` | Quick Task 390×844 read-only smoke PASS；無 page error／failed request；沒有 TEST data writes。預覽通道按設定於 2026-10-03 到期。 |
| Production candidate | `output/release/dev-083/20261002034352-6ee8fb/candidate-evidence.json` | readiness、production-bound readiness、credential gate、75/75 artifact provenance、browser smoke、OAuth safe-cancel PASS；live before／after 相同。短期 URL `https://projed-cc78d--production-candidate-lpejam4w.web.app`，按設定於 2026-10-03 到期。 |
| Live activation | `output/release/dev-083/20261002034352-6ee8fb/activation-evidence.json` | activation PASS；sealed tree SHA-256 `7d7683fea31d3845af09afdd017ac604d1bb8cfc8ec41ee8c4e0285b4c5dd7bb`，75/75 entries provenance PASS，正式 root browser smoke 與 OAuth safe-cancel 302 PASS。 |
| Dual-origin readback | `output/qa/dev-134/2026-10-02-quick-update/live-readback.json` | `https://projed-cc78d.web.app` 與 `https://projed-cc78d.firebaseapp.com` 的 `/quick-task/` 均為 HTTP 200；release/source commit 一致；sealed Quick Task HTML、`assets/quickTask-BPLQbL9L.js` 與 `assets/pwaUpdateService-Di102aP1.js` SHA-256 全相符。 |
| Live Quick Task browser smoke | release 驗證收據及部署後 canonical 390×844 smoke | title／submit controls enabled、延遲 updater 已載入、root `/sw.js` active、無 page errors／failed requests。這是 fresh browser 網站驗證，不代表使用者既有手機 profile 或 Android／iPhone 實機驗證。 |

沒有執行 live database／business data writes、Auth／IAM 變更或使用者資料清除。部署不能改寫已在使用者手機執行中的舊 JavaScript；手機既有安裝須完整關閉 app 後重新開啟一次以載入新版 shell，屆時仍要由使用者確認結果。不得要求清除資料或解除安裝，以免影響尚未同步任務。
