# PM-DEV-008 任務會議細節快速查找交付報告

日期：2026-06-06
狀態：Done
節點類型：交付點
父交付點：DEV-002 / DEV-007 follow-up

## 交付目標

讓未來專案成員可從任務詳情快速查找會議中討論過的任務細節，不需要進入紀錄庫翻整篇會議紀錄。

## RD 範圍

- 將任務詳情的關聯紀錄升級為任務知識區塊。
- 抽出指定任務的會議或工作紀錄片段。
- 新增任務內搜尋。
- 保留原始紀錄可追溯入口。
- 不改資料模型。

## QA / QC 證據

- QA 計畫：`ai-doc/qa/QA-DEV-008-task-meeting-detail-lookup.md`
- 驗證結果：

```powershell
npm.cmd run lint -- --quiet                 # pass
npm.cmd run verify:dev-002-records          # pass
npm.cmd run verify:dev-006-gmail-editor     # pass
npm.cmd run verify:dev-007-meeting-activity # pass
npm.cmd run verify:dev-008-task-knowledge   # pass
npm.cmd run build                           # pass, existing chunk warnings only
```

- Playwright UI smoke：固定測試環境登入後，任務詳情顯示「任務知識」、搜尋框、空狀態，console 0 errors。
- 補充決策：手機版不列入會議記錄驗收；既有 mobile smoke 僅作為參考，不作為 release gate。

## 殘留風險

- 第一版依賴使用者在會議紀錄中明確插入 task tag；未標記的討論只能靠整篇關聯 fallback。
- 尚未做 AI 問答與語意搜尋。
