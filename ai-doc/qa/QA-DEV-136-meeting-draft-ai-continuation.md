# QA-DEV-136：既有會議草稿續接 AI 整理流程

- 對應 DEV：DEV-136；相容 DEV：DEV-019、DEV-020、DEV-107、DEV-117
- 規格：SPEC-019「DEV-136 架構定案」
- 驗收範圍：ProJED 本機 candidate；不含正式環境、正式資料或部署。
- 結果：局部本機驗證通過；瀏覽器互動 Not verified；未發布

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

- PASS：DEV-136 純狀態 verifier 14/14；涵蓋 trace 恢復／失效、AI 重跑資格、選用 AI 後直接存草稿、發布鎖定。
- PASS：DEV-092 靜態契約 55 checks；DEV-020 workflow 靜態回歸 13 file groups；TypeScript、DEV-136 touched-files ESLint、`git diff --check`。
- PASS：受影響程式與驗證器 ESLint 無 error（`MainLayout.tsx:242` 有一項 effect warning）。完整 `npm run lint` 未通過：未修改的 `scripts/verify-dev-134-quick-task-update-prompt.mjs:378` 有一個 `no-unused-vars` error，另有 64 warnings；因此標準 `verify:source` gate 會在 lint 階段停止，未以此結果宣稱完整 gate 通過。
- Not verified：`verify-dev-107-record-sidebar-layout-browser.pw.js` 已加入從紀錄庫重開、恢復 synthesis、重跑 AI、存校稿案例，但 Playwright CLI 在開啟頁面前無法下載：npm registry 回 `EACCES`，請求 `https://registry.npmjs.org/@playwright%2fcli`。另一個瀏覽器控制介面初始化以 Windows error 5 結束；未操作使用者既有瀏覽器頁籤。
- 因瀏覽器沒有啟動，本紀錄不宣稱 N01～N09 的畫面／互動／幾何驗收通過；未啟動或停止 localhost:4000 服務，未部署正式環境。
