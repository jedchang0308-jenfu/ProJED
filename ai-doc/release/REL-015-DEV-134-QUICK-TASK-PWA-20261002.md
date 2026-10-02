# REL-015 — DEV-134 Quick Task PWA live update lifecycle

日期：2026-10-02
最新 corrective release：`20261002054439-a538f0`／product source `e69ac3f`；詳見本文末尾手機安裝模式 UI 補記。以下原始 binding 保留為第一次 lifecycle 發布的歷史紀錄。
狀態：Live deployed；dual-origin readback 與正式網站 browser smoke PASS。手機既有安裝仍待使用者實機確認。
專案／環境：ProJED／Firebase Hosting production live (`projed-cc78d`)
來源任務：DEV-134；release pipeline：DEV-083；規格：SPEC-041

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

未執行 live database／business data writes，未變更 Auth／IAM，未清除使用者資料。既有手機安裝需要完整關閉舊 app 後重新開啟一次以載入新版 shell；手機端結果待使用者確認。不得要求清除資料或解除安裝，以免影響尚未同步任務。

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
