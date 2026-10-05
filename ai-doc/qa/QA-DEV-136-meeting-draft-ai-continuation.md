# QA-DEV-136：既有會議草稿續接 AI 整理流程

- 對應 DEV：DEV-136；相容 DEV：DEV-019、DEV-020、DEV-107、DEV-117
- 規格：SPEC-019「DEV-136 架構定案」
- 驗收範圍：本機 candidate 驗收、Firebase Hosting artifact provenance／匿名 shell smoke，以及一筆明確標記且完成清理的正式會議草稿生命週期 smoke。正式 smoke 僅驗證建立、保存、重新開啟、編輯、再次保存與讀回；不呼叫 AI、不錄音、不發布。
- 結果：本機 DEV-107／DEV-135 targeted browser UI PASS（隔離外部服務）；正式 Hosting 83/83 provenance 與匿名 shell smoke PASS；正式登入後草稿生命週期 smoke 的 N01／N05 子集合 PASS。完整 N01～N09／AI trace matrix 尚未完成；原始 release receipt 仍是 `feature-pending`，不以局部 smoke 改寫完整驗收狀態。

## 目標

由紀錄庫重新打開已保存的會議草稿後，使用者仍能編輯內容並繼續走完 `速記 → AI整理 → 校稿 → 發布`。AI 整理完成後不自動發布；草稿與即時會議模式保持分離。

## 驗收案例

| ID | 操作 | 預期結果 |
|---|---|---|
| N01 | 從紀錄庫開啟未發布的會議草稿 | composer 維持 `meeting-record`，顯示四個完整流程階段；標題、時間、參與人員、內容、任務連結可編輯。 |
| N02 | 開啟具有匹配 `meetingSynthesis.outputContent` trace 的草稿 | 恢復 AI 整理 `ready` 狀態、provider 與已保存警告，不把草稿轉成即時模式。 |
| N03 | 在已開啟的草稿重跑 AI 整理 | AI 按鈕可用，成功後仍停留於同一草稿；原手寫內容保留，顯示新的 synthesis trace。 |
| N04 | 編輯 AI 結果後按「校稿」 | 保存為 draft；不發布；保存完成後校稿階段呈完成狀態，內容與更新後的 trace 可讀回。 |
| N05 | 在沒有 AI 結果時編輯並按「校稿」 | 可直接存草稿；AI 是選用動作，校稿階段不要求先執行 AI。 |
| N06 | 編輯過 AI 結果後重開，或遇到輸出與內容不匹配的舊 trace | 不恢復過期 `ready`；AI 重跑以目前編輯器內容為來源。 |
| N07 | 檢查即時模式及個人工作紀錄 | 只有即時會議有錄音、事件 capture、recovery 與即時匯入；個人工作紀錄仍沒有會議流程。 |
| N08 | 開啟已發布會議紀錄 | 四階段不可操作，且不能再存草稿、重跑 AI 或發布。 |
| N09 | 1902×960、1440×900、1024×768 顯示 | 流程列、內容、任務連結與下方操作可達；無水平溢出、遮擋或 editor 與操作列重疊。 |

## 驗證方式與證據

- 純狀態 verifier 覆蓋草稿 trace 恢復、內容不匹配、選用 AI、校稿保存與已發布鎖定。
- 隔離 Playwright fixture 由正常紀錄列表開啟 meeting draft，檢查 DOM、狀態、三種桌面 viewport，並從 UI 重跑 AI、編輯標題及存回草稿。
- 執行相關 DEV-019／020／092／107 回歸、TypeScript、targeted ESLint 與 `git diff --check`。
- 只在確實讀回已保存資料與畫面狀態時記錄 PASS。瀏覽器工具不可用時，記為 Not verified 並附原始錯誤；不以型別或 source assertions 代替 UI 驗收。

## 範圍外

不修改正式環境、資料庫 schema、RLS、Edge Function、AI provider、會議錄音或即時任務擷取流程；不清除既有草稿或任務資料。

## 2026-10-05 本機驗收紀錄

- PASS：DEV-136 純狀態 verifier 14/14；涵蓋 synthesis trace 恢復／失效、AI 重跑資格、選用 AI 後直接存草稿、發布鎖定。
- PASS：DEV-092 靜態契約 55 checks；DEV-020 workflow 靜態回歸 13 file groups；TypeScript、受影響 ESLint、`git diff --check`。
- PASS：完整 `npm run lint` 無 error（64 warnings）；原有 DEV-134 驗證器未使用變數已修復，標準 source gate 不再被 ESLint 阻擋。
- PASS：DEV-107 rendered browser 6/6：1902×960、1440×900、1024×768 既有草稿版面，從已保存草稿重跑 AI 並校稿，live meeting regression，390×844 mobile-negative。截圖與結果在 `output/playwright/dev-107-record-sidebar-layout/repair-final/`；console/page error、HTTP 4xx/5xx、最後水平 overflow 均為 0。
- PASS：DEV-135 rendered browser 6/6：更新徽章顯示／清除、頂列動作移入更多選項、分享人數與對話框、個人紀錄停用狀態、會議啟動與進行中狀態。截圖與結果在 `output/playwright/dev-135-topbar-actions/repair-final/`；console/page error、HTTP failure 與 failed request 均為 0。
- PASS：完整 `npm run verify:source`；包含 ESLint、TypeScript、sealed production build、production auth mode 5 checks、Supabase static 26 snippets、migration aliases 65/65、calendar ICS、core regression 11 checks 與 P9 Edge Function。預提交工作樹產物 `20261005133528-ab6ad5` 的 `npm run verify:production-artifact` 與 `npm run verify:dev-083-production-release-gate` 均通過。
- Artifact provenance：上述預提交產物由含本次待提交檔案的 working tree 建置，manifest 標示 dirty；它只證明建置與 artifact scan 通過，不作部署候選。提交後另產生並驗證綁定乾淨 commit 的正式 artifact，及後續 Hosting 結果見下方補記。
- Browser 限制：isolated local-test browser 將 Google OAuth／Google API／Google Fonts 與 TaiwanCalendar 網路呼叫 stub；因此只驗證本機 UI 與功能流程，不涵蓋實際 OAuth、Google API 或權威行事曆資料。Playwright CLI/npm registry 的 `EACCES` 與 headed Edge 初始化錯誤曾阻止原驗證入口；改用已安裝的 Playwright 套件與 task-owned headless Chrome 後完成上述實際畫面／互動驗證，未操作使用者既有瀏覽器頁籤。
- 本段只記錄發布前的本機瀏覽器範圍：針對 DEV-136／相容 DEV-107、DEV-135 的 targeted regression，不等同完整 N01～N09 matrix、獨立 QC 或 production smoke。未修改 localhost:4000，使用隔離的本機測試服務；當時尚未部署正式環境。

## 2026-10-05 正式 Hosting 發布補記

- Source：乾淨 commit `42731b1e86883782069479655bfedaf2cd87ac77`，branch `持續優化3`。
- Firebase Hosting：project/site `projed-cc78d`；release `20261005141011-b3b16a`；canonical `https://projed-cc78d.web.app`；live release `1791209475419000`／version `ae0e7e4538ce30bd`。
- Sealed artifact：83 manifest entries，tree SHA-256 `42dac3b004032821993128bb7d5b9dbb0c2c00f580616a99d43894f6cfa60bd7`；與前版 release `20261004082518-04e5e7` 綁定保留資產。
- Hosted verification：canonical artifact provenance 83/83 與匿名 shell browser smoke PASS；release metadata 回讀相符 source/release。Direct receipt `published=true`、`complete=false`、`verification=feature-pending`：本次沒有執行登入後功能 smoke，未以本機 fixture 結果代替正式 authenticated feature 驗收。
- Recovery：前一 live Firebase Hosting version `projects/projed-cc78d/sites/projed-cc78d/versions/a02e19f14202f6eb`（release `1791102442256000`）；未 rollback。
- 範圍：只發布 Firebase Hosting 網站檔案；未使用正式 Google 登入、未讀寫 Supabase／正式業務資料、未修改 schema、migration、權限或其他雲端資源。Receipt：`output/release/dev-083/20261005141011-b3b16a/direct-evidence.json`。

## 2026-10-06 正式 Hosting 唯讀讀回

- Live `/release-meta.json` 回傳 release `20261005141011-b3b16a`，與預期相符；canonical root HTTP 200 且含 `#root`。
- 首頁引用的 12 個 JS/CSS assets 全數 HTTP 200；主 bundle 含會議流程文案。來源程式與此 release 綁定的已提交版本一致；無需重建或重發 Hosting。
- Playwright CLI 重跑在啟動前因 npm registry `EACCES` 失敗，因此本次沒有新的 browser-rendered evidence；測試工作階段已中止並清理。沿用 2026-10-05 已記錄的匿名 shell browser smoke PASS，不將本次 HTTP 讀回升格為瀏覽器驗收。
- 登入後會議草稿 feature smoke 仍 pending；本次未登入、未呼叫 Supabase／資料 API，也未讀寫正式資料。

## 2026-10-06 Playwright 正式站 smoke 補記

- PASS：使用快取中的 Playwright CLI 0.1.22，以獨立 task-owned browser session 開啟正式站。release metadata 與 `20261005141011-b3b16a` 相符，頁面掛載、JS/CSS 主資產正常，無 critical console error、page error 或 failed request。
- PASS：從登入頁按「使用 Google 帳號登入」後到達 Google OAuth 帳號頁；OAuth callback 指向正式 Supabase 專案 `knodlkxqpcqyrtgwpdst`，redirect 回 `https://projed-cc78d.web.app/`。未輸入帳密或完成登入。
- Feature smoke 仍 pending：正式版使用 Google OAuth，`.env.production` 未設定測試 email/password；DEV-133 測試 actor helper 固定指向測試專案 `fhisnnufoeulxqrchldf`，與正式專案不同。沒有可用的正式專用測試身分與可清理資料範圍，因此未以測試帳號登入正式環境，也未讀寫正式業務資料。
- Smoke 中 `navigator.serviceWorker.ready` 等待逾時，但不屬於既有 anonymous shell smoke 的通過條件；登入頁沒有 service worker controller。程式與正式 release 未變更，正式站仍提供同一 release，故未重複上傳相同 artifact。兩個 task-owned browser session 均已關閉，新增暫存快照與 console log 已清除。

## 2026-10-06 登入後正式 smoke 授權前資料範圍檢查

- PASS：使用者在 task-owned 瀏覽器以指定的專用 Google 測試帳號完成登入，正式站載入工作區總覽；沒有把帳號識別資料寫入驗收紀錄。
- PASS：看板選擇器沒有列出可用看板；工作區總覽顯示 `我的工作區` 為 0 個看板；紀錄庫顯示 0 筆會議紀錄。未開啟或讀取任何既有業務紀錄。
- Feature smoke blocked：保存草稿要求目前已選 `activeWorkspaceId` 與 `activeBoardId`；此帳號沒有可用看板，無法建立可跨頁讀回的草稿。未建立草稿或看板，未寫入正式資料。
- 原授權範圍為一筆可清理測試草稿；新增並刪除正式看板是額外資料異動，尚未取得授權。待使用者提供既有專用空白測試看板，或明確授權建立後清除一個臨時測試看板，才可繼續。
- task-owned 可見瀏覽器 `projed-prod-draft-smoke-20261006` 暫時保持登入並開在紀錄庫，看板選擇器已收合；保留供立即後續使用，不佔用服務埠。Smoke 結束或使用者取消時由 Codex 關閉。
- 本節是取得建立／清理臨時看板明確授權前的狀態快照；後續實測與清理結果見下節。

## 2026-10-06 登入後正式草稿生命週期 smoke

- Production binding：canonical `https://projed-cc78d.web.app` 仍提供 release `20261005141011-b3b16a`／source `42731b1e86883782069479655bfedaf2cd87ac77`。應用程式與 Hosting release 未變更，本次不需重新部署。
- PASS（N01／N05 子集合）：以指定的專用測試帳號在「我的工作區」建立唯一臨時看板 `DEV136-SMOKE-20261006`；從「開始會議模式」開啟會議紀錄，未按「開始收音」。填入明確標記的合成標題與內容，按「校稿」存草稿；紀錄庫讀回 1 筆且狀態為「草稿」，標題與內容吻合。
- PASS（保存／重開／編輯）：執行「儲存並離開」，由紀錄庫重開草稿，確認第一版文字仍在；修改成第二版後再次按「校稿」保存、離開並重新開啟，編輯器與紀錄庫均讀回第二版文字，狀態仍為「草稿」。
- 邊界：未執行 AI 整理、錄音、發布、分享或其他資料操作；未讀取既有業務紀錄。這是本次明確授權的草稿生命週期子集合，不代表 N02～N04、N06～N09 或完整 DEV-136 matrix 全部通過。
- Cleanup：使用產品「封存」動作後，紀錄庫顯示 0 筆會議紀錄；再刪除唯一臨時看板，工作區總覽顯示「我的工作區」0 個看板。正式版 service 將紀錄狀態標記為 `archived` 並關閉 RAG；部署 source 的 schema 對 `knowledge_records.project_id` 設有 `ON DELETE CASCADE`，臨時看板刪除後其關聯紀錄會隨之清除。正式 UI 最終回讀為 0 筆紀錄／0 個看板。
- Runtime observation：Playwright console 記錄 4 個 Supabase Realtime channel `socket closed: 1006` 錯誤（workspace、member、board、tag）。草稿保存、退出、重開、修改及清理流程均成功；本次沒有定位這些 channel 關閉的根因，故不將其歸因於草稿流程。
- Cleanup：task-owned browser session 已關閉；本次新增的 20 個 `.playwright-cli` 快照已移除。沒有修改產品程式碼、schema、migration 或設定；原 release receipt 維持 `verification=feature-pending`，直到其餘完整驗收案例完成。
