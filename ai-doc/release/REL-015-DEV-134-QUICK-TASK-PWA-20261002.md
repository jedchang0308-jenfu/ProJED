# REL-015 — DEV-134 Quick Task PWA live update lifecycle

日期：2026-10-02 起，2026-10-04 更新
最新 corrective release：`20261004001409-64b197`／source `349c552cebb2c092e413897cb1c6d0963dcd0044`；詳見下方更新操作補記。以下較早bindings保留作歷史紀錄。
狀態：Live deployed；雙origin、root及正式Quick功能PASS。手機Quick選單／最新版呈現已確認；Main真登入手機版本確認失敗，新worker身分查證補正本地通過，待artifact與live續接，DEV尚未結案。
專案／環境：ProJED／Firebase Hosting production live (`projed-cc78d`)
來源任務：DEV-134；release pipeline：DEV-083；規格：SPEC-041

## 2026-10-04 更新操作第一批與註冊等待補正

第一批1～3提供兩個App的三點更新入口、檢查去重／期限與Quick返回提示恢復，含既有提示規則去重維護。首份release `20261003153455-01f632`部署後，正式Quick人工檢查在native registration未完成時立即回CHECK_UNAVAILABLE；檔案符合manifest及root啟動通過仍不足以判定功能通過。原失敗收據保留。

補正保留同一Workbox registration promise，人工flight沿既有deadline等待；不新增worker、registration或reload writer。4項反例原source0/4、補正4/4，受影響回歸45/45及TypeScript／targeted ESLint通過。來源與驗證限制見[QA補正](../qa/QA-DEV-134-pwa-recovery-local-verification.md#2026-10-04-正式功能驗證與註冊等待補正)。

| Binding | 值 |
|---|---|
| Source／branch | `349c552cebb2c092e413897cb1c6d0963dcd0044`／`持續優化3`；已推送origin，打包時clean |
| Live release／target | `20261004001409-64b197`／Firebase Hosting `projed-cc78d` live |
| Sealed artifact | 78檔，11,386,441 bytes；tree SHA-256 `59994ae99688ebfce8f7daa4d8c7f7449cf5789cd5e05f71079cfb351041ac40` |
| 前版相容來源 | `20261003153455-01f632`；保留一代資產，不累積多代 |
| 回復錨點 | 發布前live version `5fe02d5d1ffef761`／release `1791071621256000`；更早已知可用version `fa941980dd574ddd`，未執行回復 |
| Direct receipt | `output/release/dev-083/20261004001409-64b197/direct-evidence.json`；published=true、complete=true、verification=passed |
| 正式功能驗證器 | `scripts/verify-dev-134-update-menu-hosted.pw.js`；SHA-256 `7ac5ebbf02afe82ed0cf65c32b41fec8f6c3fa42de57c05b97cfc6c3e5fb36a1` |

canonical `https://projed-cc78d.web.app`及獨立安裝origin `https://projed-cc78d.firebaseapp.com`各78/78檔案符合sealed manifest。canonical root及匿名Quick真選單的最新版／離線／恢復連線重試通過，320／390／1440排版、安裝入口、Escape關閉與焦點返回、release／prompt binding、runtime錯誤及零業務寫入檢查通過。第二origin收據位於 `output/qa/dev-134/2026-10-03-update-operations/completion-audit/firebaseapp-provenance-corrective.json`。

此direct receipt的complete只涵蓋已執行的root／Quick正式功能。Main真登入與使用者手機既有profile尚無實機結果；不以匿名瀏覽器、平台模擬或CLI登入成功替代。未修改Auth／資料／IAM。task-owned程序已退出及測試埠60163已釋放，使用者localhost4000及原瀏覽器／登入終端未操作。文件狀態續接不改已封存artifact，不需再次建置／部署。

## 發布內容

手機使用者回報安裝的 Quick Task App 仍呈現舊版。正式兩個 Firebase origin 原先提供相同網站 release；根因在 Quick Task MPA 只註冊共用 root service worker，沒有啟動共用 PWA updater，因此 standalone Quick Task client 缺少檢查新版本及安全套用 waiting worker 的 lifecycle。

產品修正先註冊 Quick Task reload-safety owner，再延遲載入共用 `setupPwaLifecycle()`。這保留編輯、語音、認領與本機保存中的 safety gate；更新器留在 deferred chunk，不增加第二個 worker，也不清除本機任務或帳號資料。

| Binding | 值 |
|---|---|
| Product source commit | `e9317e66e3cbe5c9163a27a2bf045611ea0760cf` (`fix: update quick task standalone app lifecycle`) |
| Git branch | `持續優化3`；commit 已推送至 `origin/持續優化3` |
| Firebase live release | `20261002034352-6ee8fb` |
| Firebase site | `projed-cc78d` |
| Previous live version before activation | `f30bf34775780e15`；release `1790905375640000` |
| Sealed artifact tree SHA-256 | `7d7683fea31d3845af09afdd017ac604d1bb8cfc8ec41ee8c4e0285b4c5dd7bb` |

## 驗證結果

- 本地及部署前：DEV-122 static 26/26、DEV-134 static 17/17、生成 Workbox build A→B browser 10/10（R01～R11）、TypeScript、targeted ESLint、isolated staging build 與 artifact secret scan PASS。
- Level 3 preview：`output/release/dev-083/level3-evidence-e9317e6.json`；Quick Task 390×844 read-only smoke PASS，無 page errors／failed requests，無 TEST data writes。Preview channel 預定 2026-10-03 到期。
- Production candidate：`output/release/dev-083/20261002034352-6ee8fb/candidate-evidence.json`；strict readiness、production-bound readiness、credential gate、75/75 artifact provenance、browser smoke、OAuth safe-cancel PASS；live before／after 相同。Candidate channel 預定 2026-10-03 到期。
- Activation：`output/release/dev-083/20261002034352-6ee8fb/activation-evidence.json`；activation、75/75 canonical provenance、正式 root browser smoke、OAuth safe-cancel 302 PASS。
- Canonical live dual-origin readback：`output/qa/dev-134/2026-10-02-quick-update/live-readback.json`。`https://projed-cc78d.web.app` 與 `https://projed-cc78d.firebaseapp.com` 皆為同一 release／source commit；`/quick-task/` 回 HTTP 200，HTML、`assets/quickTask-BPLQbL9L.js`、`assets/pwaUpdateService-Di102aP1.js` SHA-256 與 sealed artifact 一致。
- 正式 Quick Task 390×844 browser smoke PASS：title／submit controls enabled、deferred updater loaded、root `/sw.js` active、無 page errors／failed requests。

驗證由同一 Agent 分階段執行，不宣稱獨立 QC。網站 fresh-browser smoke 不代表使用者既有手機 profile 或 Android／iPhone 實機驗收。

## 影響與後續確認

未執行 live database／business data writes，未變更 Auth／IAM，未清除使用者資料。更正先前「只完整關閉舊 app 後重新開啟即可」的指引：同 origin 的瀏覽器分頁仍可能維持舊 worker，需連同相關 ProJED 分頁關閉；詳見下方舊安裝 bootstrap 補記。手機端結果待使用者確認。不得要求清除資料或解除安裝，以免影響尚未同步任務。

Level 3 與 candidate 是短期驗證 channel，均預定於 2026-10-03 到期。正式 live 保留前一版 release 作回復錨點；未執行回復。

## 2026-10-02 手機安裝模式 UI corrective release

手機新截圖的三點選單與登入提示差異可由目前 source 重現：installed mode 的預設 URL 改用 footer entry，零 pending 任務又隱藏整個 auth wrapper。此次補正統一標頭入口與帳號狀態顯示，並讓已存在任務清單在初始化後預設展開；Auth／Session／owner／claim／RPC／outbox 資料契約不變。

- Product source：`e69ac3f452adf1b534fba458b2c30170f647b10c`，branch `持續優化3`，已推送 origin。
- Live release：`20261002054439-a538f0`；tree SHA-256 `033d170215227c4a9a2d0c081df458d2c79c7dc7a46de7d3c10aff71fb55f57b`。
- Fast direct release：此變更為可回復的 UI 呈現／入口修正，不改登入或資料邊界；沿 SPEC-083 direct executor，沒有建立新的 TEST preview／candidate 或執行遠端資料 migration。
- Recovery anchor：發布前 live version `24124903d23529bc`，release `1790913104924000`，product release `20261002034352-6ee8fb`；未執行 rollback。
- TypeScript／targeted ESLint、sealed artifact 本機平台 UI 38/38 PASS；正式 canonical provenance 79/79、root browser smoke、兩 origin 平台 UI 71/71 PASS，page errors 0。
- `output/release/dev-083/20261002054439-a538f0/direct-evidence.json`：published=true、complete=true、verification=passed；feature runner SHA-256 `44661b8cacc98c28f1e24c48a16a07d0f5fe515dca790fe4b30c3996cdcf8c80`。
- `output/qa/dev-133/platform-ui/live-readback.json`：兩 origin `/quick-task/` HTTP 200，同一 source/release；HTML、`assets/quickTask-CXIjE4Y2.js`、`assets/quickTask-B3NsuS91.css` 與其餘 entry assets SHA-256 符合 sealed manifest。
- UI fixture 只存於匿名 disposable browser contexts 的本機 IDB，remote RPC writes=0；各 contexts／task-owned sessions 已關閉，task-owned preview 4175 已釋放。沒有更動使用者裝置資料或既有 browser 分頁。

Android／iPhone UA 與 installed display-mode 使用桌面 Chromium 模擬；真手機重新開啟確認仍待使用者回報。不同裝置的未綁定本機任務數量可不同，不能以 localhost 的一筆記錄推論手機也必須存在一筆。首輪正式及本機失敗紀錄保留於 [QA-DEV-133](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#2026-10-02-手機-installed-ui-一致性補正)，不以新 PASS 覆寫。

## 2026-10-02 舊安裝 bootstrap 與操作指引更正

使用者再次回報手機沒有變更。以保存的真 sealed artifact `20261002013716-5cf1b1` 舊 Quick Task／Workbox，切換伺服器至目前 live artifact `20261002054439-a538f0` 重現：保留另一個同 origin 舊分頁時，普通重新載入仍提供舊 HTML。帶 `projed_update_latest` 的導覽取得新版 HTML 與三點選單，但目前版本等於 metadata 時不會主動套用 waiting worker，因此直接回原 shortcut 又回到舊版。這是既有安裝 bootstrap 缺口；fresh browser UI PASS 不能證明它已完成。

已驗證的保留資料步驟：先保存正在輸入的任務；在手機原瀏覽器開啟同 origin `/quick-task/?install=1&projed_update_latest=20261002054439-a538f0`，讓新版 worker 下載；關閉該 origin 的所有 ProJED 瀏覽器分頁及已安裝 App，再由原圖示開啟。所有舊 clients 結束後 worker 正常啟用，普通 shortcut 讀回新版、三點選單存在，已建立的本機任務與 localStorage sentinel 保留。不需要清資料或重新安裝。獨立 Quick Task 安裝 origin 為 `https://projed-cc78d.firebaseapp.com`；不得改 origin 後把不同儲存誤算資料遺失。

證據：`output/qa/dev-134/legacy-bootstrap/result.json` 的版本／選單／IDB 任務讀回 PASS、page errors=0；兩正式 origin 的更新連結 200、release/source/HTML hash 一致，見 `live-readback.json`。初次 harness 的選單 selector 未對齊而量到 0，保留 `result-initial.json`；更正後重跑。task-owned browserClosed／portReleased=true，沒有遠端寫入或使用者 profile 操作。此輪未變更產品程式、未重建或重部署；手機自身 worker/client 狀態及實機結果仍未取得，不能把隔離重現當成其確定根因。

## 2026-10-02 Quick Task 更新提示與主程式一致

依使用者「希望跟主程式一樣的行為」，Quick Task 現在接入主程式同一個 updater state／actions 及安全 reload gate：safe 狀態沿用靜默自動更新；dirty／blocked 顯示「新版已就緒」、「重新載入」、「稍後」；recoverable failure 提供共用重試與快取恢復。

- 本地驗證：R12 static 19/19、Quick Task prompt browser 9/9（含 320×844 無溢出）、TypeScript、targeted ESLint、diff check PASS；圖 `output/playwright/dev134-quick-task-prompt-320x844.png`。
- Product source：`23a566bf49ae2e2cdf5e7b5bc6bad48cc174a18b`，branch `持續優化3`，已推送 origin。
- Live release：`20261002091531-2a1246`；sealed tree SHA-256 `6cbdd571fac9a175a11b1af005f29c4bad5da34c49c57469a455477a7cd8784c`；Firebase site `projed-cc78d`。
- Recovery anchor：發布前 version `7d5d6e292b059fc0`／release `1790920074933000`；沒有執行 rollback。
- `output/release/dev-083/20261002091531-2a1246/direct-evidence.json`：published=true、complete=true、verification=passed；canonical provenance 78/78、root app-shell smoke PASS、`verify-dev-134-quick-task-update-prompt-hosted.pw.js` 正式 Quick Task 320×844 read-only smoke PASS。
- 兩個正式 origin `projed-cc78d.web.app` 與 `projed-cc78d.firebaseapp.com` 均回傳同 release／source commit；release meta、Quick Task HTML、entry JS/CSS、prompt chunk、updater chunk 共 6 個 path 的 hash 均符合 sealed manifest。
- 未改 DB/Auth/IAM，未清除使用者資料。正式 browser 使用匿名 disposable context；手機原有 PWA client 是否已重啟載入新版仍待實機確認。
