# QA-DEV-136：既有會議草稿續接 AI 整理流程

- 對應 DEV：DEV-136；相容 DEV：DEV-019、DEV-020、DEV-107、DEV-117
- 規格：SPEC-019「DEV-136 架構定案」
- 驗收範圍：本機 candidate 驗收，加上本次 Firebase Hosting 發布身份、artifact provenance 與匿名 shell smoke；不含登入後正式功能、正式資料或 Supabase 驗證。
- 結果：本機 DEV-107／DEV-135 targeted browser UI PASS（隔離外部服務）；Firebase Hosting 已發布，83/83 provenance 與 shell smoke PASS；authenticated feature smoke pending。詳見[正式 Hosting 發布補記](#2026-10-05-正式-hosting-發布補記)。

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
