# PM-DEV-006：Gmail-like 會議紀錄輸入器實作報告

狀態：Done
日期：2026-06-06
關聯：DEV-006、SPEC-006、QA-DEV-006

## 交付內容

- 將 `RecordContentEditor` 改為 Lexical editor，取代自製 `contentEditable` DOM 同步。
- 新增 `TaskMentionNode`，讓已關聯任務以 inline chip 呈現，並支援 copy / cut / paste / move / Backspace。
- 保留 `@[title](task:id)` 作為儲存格式，不新增 migration，不改 `KnowledgeRecord` 或 `record_task_links` schema。
- 新增 Gmail-like 快捷鍵 guard，修正 `Ctrl+A` 後輸入、`Ctrl+Z` / `Ctrl+Y` 取代復原。
- 新增 `verify:dev-006-gmail-editor` 與 `verify:dev-006-browser-input`。

## 驗證結果

- PASS：`npm.cmd run lint -- --quiet`
- PASS：`npm.cmd run verify:dev-002-records`
- PASS：`npm.cmd run verify:dev-003-record-tags`
- PASS：`npm.cmd run verify:dev-006-gmail-editor`
- PASS：`npm.cmd run verify:dev-006-browser-input`
- PASS：`npm.cmd run build`

## 實際輸入證據

- Browser input verifier 已覆蓋：輸入、Enter、`Ctrl+A` replace、`Ctrl+Z`、`Ctrl+Y`、多行貼上、點任務插入 chip、chip copy / cut / paste / move / Backspace。
- 截圖：`output/playwright/dev-006-gmail-editor.png`
- Clipboard token 證據：`@[品質驗證測試任務 1](task:qc-card-1)`。

## 殘留風險

- 中文 IME 與筆電 viewport 已納入 QA 計畫；手機版不列入會議記錄驗收。
- `npm install` 顯示既有 dependency audit 風險，本次未執行 `npm audit fix`，避免超出 DEV-006 範圍造成 dependency churn。
- `npm.cmd run build` 仍有既有 large chunk / dynamic import 警告，非本次新增阻塞。
