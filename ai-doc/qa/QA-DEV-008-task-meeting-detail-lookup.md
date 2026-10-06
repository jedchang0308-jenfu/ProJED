# QA-DEV-008 任務會議細節快速查找驗證計畫

狀態：Retirement QA Executed / Targeted QC PASS / Local-only / NOT RELEASED
對應 DEV：DEV-008
建立日期：2026-06-06

2026-09-10 使用者決策：任務明細歷史資訊 UI 全部退場；下方原驗證範圍保留為歷史證據，
不再是現行正向驗收。

## 現行退場驗證

- 靜態：`TaskDetailsModal` 無 `TaskRecordTimeline`、`data-task-knowledge-*`、查看／收合歷史資訊文案。
- 程式邊界：`TaskRecordTimeline.tsx` 已移除；`KnowledgeRecord`、task link 與 `taskKnowledgeSnippets` 保留。
- 瀏覽器：任務明細在有會議補記及空白任務兩種狀態都不出現歷史資訊入口、搜尋、空狀態或新增紀錄動作。
- 回歸：DEV-108 會議補記列表、任務說明、子任務、關閉與窄版流程仍可用。
- 通過條件：目標元素數量為 0，無可見錯誤、console/page error、HTTP 4xx/5xx 或水平溢出。

2026-09-10 Targeted QC evidence：`npm run verify:dev-008-task-knowledge`、
`npm run verify:dev-020-record-workflow-redesign`、`npm run verify:dev-108-task-meeting-note-persistent-list-browser`
均 PASS；DEV-108 browser B04a 確認 retired selectors／文案數量為 0，並以 DEV-098 browser 16/16、
TypeScript、lint、`npm run verify:source`、sealed production artifact gate 完成相容回歸。此證據仍屬 local／pre-deploy，
不代表 Firebase Hosting 已部署。

風險等級：Medium（移除使用者入口與互動）。

## 歷史驗證範圍（已退場）

- 任務詳情頁的任務知識區塊。
- 會議紀錄與工作紀錄的任務片段抽取。
- 任務內搜尋。
- DEV-007 會議中任務變更的查找。
- 原始紀錄開啟與回歸驗證。

## 歷史使用者關鍵流程（已退場）

- 專案成員打開任務詳情，快速看到該任務的會議討論片段。
- 專案成員用關鍵字搜尋任務相關細節。
- 專案成員點擊片段回到原始紀錄確認上下文。
- 會議中修改任務狀態後，未來可從該任務詳情查到變更紀錄。

## 歷史 FMEA 風險表（已退場）

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| 顯示整篇紀錄而不是任務片段 | 只沿用原本 plain text preview | 使用者仍需翻整篇會議紀錄 | 建立含多任務 tag 的紀錄並分別查任務 | 高 | 以 task mention paragraph 作為主要片段 |
| 任務 A 看到任務 B 的細節 | 只看 record_task_links，未過濾內容段落 | 查找誤導 | 自動測試雙任務片段抽取 | 高 | 依 `nodeId` 抽取片段 |
| 沒 mention 的 legacy 關聯消失 | 只接受 inline tag | 舊紀錄不可查 | 建立只有 taskLinks 的紀錄 | 中 | fallback 顯示整篇關聯摘要 |
| 搜尋範圍過大 | 搜尋全紀錄庫 | 使用者看到不相關結果 | 搜尋另一任務專屬關鍵字 | 高 | 搜尋只套用目前任務知識 items |
| 任務變更不可查 | DEV-007 activity 格式未被片段抽取 | 會議決策脈絡斷裂 | 搜尋「狀態」或變更文字 | 高 | activity 內容含 task mention 時自然進入片段 |

## 歷史測試案例（已退場）

- TC-001：同一篇會議紀錄包含任務 A 與任務 B 的不同段落；任務 A 只顯示 A 片段，任務 B 只顯示 B 片段。
- TC-002：搜尋任務 A 片段中的關鍵字會命中；搜尋任務 B 專屬關鍵字不會在任務 A 命中。
- TC-003：只有 `record_task_links`、沒有 inline task tag 的紀錄仍顯示 fallback 摘要。
- TC-004：會議中任務狀態變更產生的 `## 會議中任務變更` 片段可被任務知識顯示。
- TC-005：點擊任務知識片段會開啟原始紀錄。
- TC-006：任務詳情備註內容可被同一搜尋框搜尋。
- TC-007：1024x768 筆電 viewport 下搜尋框、片段清單與 modal 不重疊。

## 歷史通過標準（已退場）

- 自動 verifier 通過任務片段抽取與搜尋核心規則。
- lint、DEV-002、DEV-006、DEV-007、build 通過。
- 手動檢查任務詳情的任務知識區塊可讀、可搜尋、可回原始紀錄。

## 歷史證據收集方式

- 指令輸出：`npm.cmd run verify:dev-008-task-knowledge`。
- 指令輸出：lint、DEV-002、DEV-006、DEV-007、build。
- UI 證據：任務詳情畫面包含任務知識、搜尋框、任務片段與 fallback 整篇關聯。
