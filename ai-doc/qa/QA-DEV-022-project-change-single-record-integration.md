# QA-DEV-022: 專案變化匯入後單一會議紀錄驗證計畫

對應 DEV: DEV-022
狀態: Passed
日期: 2026-06-15

## 驗證目標

驗證「匯入專案變化 -> AI整理」後，專案變化會被當 evidence 統整進同一份會議紀錄，不會在正文後面保留第二份完整會議紀錄。

## 測試案例

### TC-001: rendered meeting record 匯入後不得形成第二份會議內容

步驟：
1. 建立一段完整 project change rendered meeting record，含 `1. 本次會議總結`、`2. 任務討論與結論`、`3. 待校稿項目`。
2. 用 `wrapProjectChangeImportContent` 包裝後放入 preserved draft。
3. 用另一段 AI meeting record 呼叫 `mergeProjectChangeImportBlocks`。

預期：
- 最終內容只有一組 `1. 本次會議總結`。
- 最終內容只有一組 `2. 任務討論與結論`。
- 最終內容只有一組 `3. 待校稿項目`。
- 最終內容不包含 import start/end marker。

### TC-002: task mentions 不得遺失

預期：
- AI 主紀錄中的 task mention 保留。
- 匯入專案變化 evidence 中的 task mention 保留。
- `syncTaskLinksFromRecordContent` 會同步兩邊 task links。

### TC-003: fallback 只能補 evidence note

預期：
- 若 AI 輸出缺少匯入 evidence，系統補 `2.x 專案變化補充`。
- 不得補第二組 `1/2/3` 結構。
- 不得補 `[專案變化匯入開始]` marker block。

### TC-004: idempotent

預期：
- 對 merged content 重複執行 `mergeProjectChangeImportBlocks`，結果不變。

## 驗證結果

已通過：
- `npm.cmd run verify:dev-022-project-change-single-record`
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`
