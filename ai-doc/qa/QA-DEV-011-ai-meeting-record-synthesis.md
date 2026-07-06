# QA-DEV-011 AI 任務導向會議紀錄統整工作流驗證計畫

狀態：In Verification / Production UI Smoke Readiness Gate Added / Production UI Smoke Pending
關聯 DEV：DEV-011  
關聯規格：`ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md`  
建立日期：2026-06-07

## 驗證重點

以 UX 為主要需求：使用者在會議中仍使用完整看板，發布前由 AI 產生任務導向草稿，使用者校稿後才發布。驗證不只看按鈕可按，也要確認使用者知道現在是「AI 統整中」、「待校稿」、「可發布」或「AI 失敗可重試」。

## 自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-009-task-detail-quick-note
npm.cmd run verify:dev-010-action-feedback
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-011-012-production-ui-smoke-readiness
npm.cmd run build
```

## 測試情境

### TC-001 第一次發布先 AI 統整

步驟：
1. 開啟 meeting mode。
2. 在速記欄輸入會議內容。
3. 點任務 A 與任務 B 插入 inline task tag。
4. 點 `AI整理` 或第一次 `發布`。

通過：
- 不會直接產生 published record。
- draft content 被更新成任務導向草稿。
- UI 顯示「AI 已整理，請校稿後發布」。
- `draft.status` 仍是 `draft`。

### TC-002 多次任務變更合併摘要

步驟：
1. 會議中對同一任務多次改狀態或移動。
2. 執行 AI 統整。

通過：
- published 前草稿只出現一段「狀態變更摘要」。
- 不出現逐筆時間序列 activity 列表。
- 原始 activity 僅作為 AI input source。

### TC-003 任務 A / B 分段不混淆

步驟：
1. 任務 A 補記設計結論。
2. 任務 B 補記 QA 驗證。
3. 執行 AI 統整。

通過：
- `### @[任務 A](task:id)` 只包含任務 A 結論。
- `### @[任務 B](task:id)` 只包含任務 B 結論。
- 待辦、阻塞、狀態摘要不互相混用。

### TC-004 AI 草稿保留 task tag

通過：
- 草稿正文仍保留 `@[title](task:id)`。
- 儲存後 `record_task_links` 可對應到任務。
- DEV-008 任務知識查找能看到統整後片段。

### TC-005 AI 不能改任務

通過：
- AI 統整過程不呼叫 `useWbsStore.updateNode`、`addNode`、`deleteNode`、拖曳移動等任務修改流程。
- 任務標題、狀態、順序、父子層級不因 AI 統整而變更。

### TC-006 AI 失敗保留原草稿

步驟：
1. 模擬 Edge Function 回傳 500 或網路失敗。
2. 點 `AI整理`。

通過：
- 原始 draft content 不被覆蓋。
- UI 顯示錯誤與重試入口。
- 使用者可再次點 `重試 AI`。

### TC-007 人類校稿後發布

步驟：
1. AI 統整成功。
2. 人類修改草稿文字。
3. 點 `發布`。

通過：
- record 狀態變為 `published`。
- 內容是校稿後版本。
- 任務知識查找顯示校稿後片段。

## UX / UI QC

桌機與筆電 viewport：

| Viewport | 驗證重點 |
|---|---|
| 1440x950 | 看板、會議狀態列、右側速記欄不重疊 |
| 1024x768 | AI 狀態文字、按鈕、錯誤訊息不遮住 Kanban 主要議題 |

手機版會議紀錄工作流不列入 release gate。

## 風險

- AI 模型回傳格式不穩定：Edge Function 必須解析 JSON，失敗時回傳錯誤而不是覆蓋草稿。
- 使用者誤以為 AI 已發布：UI 必須明確顯示「請校稿後發布」。
- 活動流水帳回流正文：verifier 必須檢查 `saveDraft` 不再呼叫 raw activity append path。

## Production UI Smoke Readiness Gate

```powershell
npm.cmd run verify:dev-011-012-production-ui-smoke-readiness
```

此 gate 預設只讀、`mutates_database=false`。它不登入、不建立 production 資料、不呼叫 AI；只確認目前 repo 已有可重用的 authenticated session injection + cleanup pattern，以及 local browser ROT 已覆蓋 meeting composer、AI整理、校稿儲存、專案變化匯入與 record persistence。完整 production UI smoke 仍需其一：已登入 Google 的互動式 browser QC，或另行顯式允許建立/清理 production 臨時 user / tenant / board / record fixture。
