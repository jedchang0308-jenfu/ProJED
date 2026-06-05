# PM Report：DEV-003 紀錄內容內嵌任務標籤

日期：2026-06-04
狀態：Done
任務類型：Product UX refinement
主要規格：`ai-doc/specs/SPEC-004-record-content-inline-task-tags.md`
父交付點：DEV-002 會議紀錄與個人工作紀錄 MVP

## 交付範圍

DEV-003 修改「關聯任務」工作流：使用者在紀錄 `內容` 中撰寫文字後，從既有看板模式直接點選任務，任務會插入目前內容游標位置，並以 Codex-like inline chip 呈現。

## 已完成

- 新增 `src/utils/recordContentMentions.ts`：
  - parse `@[Task title](task:nodeId)` token。
  - serialize task mention。
  - 在指定 content offset 插入 task mention。
  - 從內容推導唯一 task links。
  - 將 record content 轉為純文字 preview。
- 新增 `src/components/Records/RecordContentEditor.tsx`：
  - 以 `contentEditable` 支援純文字與 task chip 混排。
  - chip 使用 `data-record-task-mention` 保存 node id/title。
  - 儲存 source of truth 仍是 serialized string。
  - 支援貼上純文字與游標 offset 回報。
  - 2026-06-04 audit 修正：改為 imperative DOM sync，避免 React-controlled contentEditable 在快速輸入時產生遞增殘影文字。
- 更新 `src/store/useRecordStore.ts`：
  - 新增 content cursor offset。
  - 新增 `insertTaskMentionAtCursor`。
  - content 變更時同步 `taskLinks`。
  - `taskLinks` 改為每個 task node 唯一。
  - 保留 legacy task link 保護，避免舊紀錄開啟後被誤刪。
- 更新 `src/components/Records/RecordSidebar.tsx`：
  - 將原 textarea 替換為 `RecordContentEditor`。
  - 點擊 `從看板選取` 前保留目前內容游標。
- 更新 `src/components/Wbs/KanbanCard.tsx` 與 `src/components/Wbs/KanbanChecklist.tsx`：
  - 選取模式點任務改為插入內容 tag。
  - 勾選狀態仍代表該任務已存在唯一 structured link。
- 更新 `src/components/Records/RecordsView.tsx` 與 `src/components/Records/TaskRecordTimeline.tsx`：
  - preview 顯示任務標題純文字，不直接露出 raw token。
- 更新 `scripts/verify-dev-002-records.mjs`：
  - 驗證 DEV-002 + DEV-003 的紀錄工作流契約。

## 驗證結果

- PASS：`npx.cmd tsc --noEmit`
- PASS：`npm.cmd run lint -- --quiet`
- PASS：`npm.cmd run verify:dev-002-records`
- PASS：`npm.cmd run verify:dev-003-record-tags`
- PASS：`npm.cmd run build`
- PASS：HTTP smoke：`http://127.0.0.1:4174/` 回應 200。
- PASS：Playwright smoke：開啟 TEST 看板與右側紀錄欄。
- PASS：Playwright smoke：新增會議紀錄後，內容 editor 可輸入文字。
- PASS：Playwright smoke：進入 `從看板選取` 後仍停留在既有看板模式，右側欄自動收合。
- PASS：Playwright smoke：點選 `資料庫改SQL` 後，完成選取會回到紀錄欄，內容中出現 inline task chip。
- PASS：Playwright DOM check：同一任務插入兩次後，`[data-record-task-mention]` 數量為 2。
- PASS：Playwright DOM check：同一任務插入兩次後，摘要 role select 數量仍為 1。
- PASS：DEV-003 helper verifier：覆蓋游標位置插入、重複 tag 去重、刪除後 taskLinks 同步、legacy structured link 保留、plain text preview 去 raw token。
- PASS：2026-06-04 audit Playwright smoke：contentEditable 輸入 `今天討論 release ` 後不再產生重複殘影文字；插入同一任務兩次後 chip=2、摘要 role select=1。

## 殘留風險

- 本階段未引入完整 rich text editor framework；`contentEditable` 行為已覆蓋主要 smoke flow，但長篇複雜編輯仍需要後續 QC 擴充測試。
- 未做自動化瀏覽器測試檔；目前以 Playwright CLI smoke evidence 驗證。
- 未改 DB schema；此 DEV 依設計沿用 `KnowledgeRecord.content` 字串與 `record_task_links`。
