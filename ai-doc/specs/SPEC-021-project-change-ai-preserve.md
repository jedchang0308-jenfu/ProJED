# SPEC-021: 專案變化匯入後 AI整理保留機制

對應 DEV: DEV-021
父交付點: DEV-020 / DEV-011 / DEV-012
狀態: Implemented
日期: 2026-06-15

## 背景

DEV-020 已建立「先匯入專案變化，再撰寫紀錄或 AI整理」的流程，但原文件未定義 AI整理對既有匯入內容的保留規則。現況風險是專案變化已插入 `draft.content` 後，`synthesizeMeetingDraft` 可能用 AI 回傳的 `result.content` 直接覆寫內容，造成使用者已確認匯入的專案變化被丟失。

此交付點是 DEV-020 的 bug-fix follow-up。目標不是新增另一個 UI 流程，而是補上資料保護不變式與 deterministic merge guard，讓「匯入 -> AI整理 -> 存草稿/發布」成為可重複驗證的安全路徑。

## 目標

- 已匯入專案變化必須被視為受保護內容。
- AI整理可以重寫與統整會議正文，但不得丟失已匯入專案變化。
- 保留行為必須由 deterministic merge guard 保證，不可只靠 prompt 要求模型保留。
- 保留後的內容必須重新同步 `taskLinks`，避免匯入內容中的任務連結被 AI 結果覆蓋。
- 重複執行 AI整理必須 idempotent，不得重複堆疊同一份匯入區塊。

## 不變式

1. 使用者一旦確認插入專案變化，該匯入內容即成為目前 draft 的受保護來源。
2. AI整理輸出若未包含既有匯入區塊，系統必須在回寫 draft 前自動補回。
3. 同一份匯入區塊在同一份 draft 中最多保留一次。
4. 存草稿與發布保存的必須是 merged content，不得保存裸 `result.content`。
5. `taskLinks` 必須依 merged content 重新同步，不得只依 AI 回傳的 `linkedTaskIds`。
6. Prompt 可提醒 AI 保留脈絡，但 prompt 不是保留機制本身。

## 演算法要求: deterministic merge guard

建議實作順序如下：

1. 專案變化插入 draft 時，將預覽內容包成可辨識的穩定區塊，例如：
   - 標題：`## 專案變化匯入`
   - Metadata：匯入範圍、匯入時間、事件數、來源任務數
   - Body：使用者確認插入的 preview content
2. 呼叫 AI整理前保存 `preservedDraft.content`。
3. 從 `preservedDraft.content` 擷取既有專案變化匯入區塊。
4. 取得 AI 回傳 `result.content` 後，不可直接覆寫 draft。
5. 以 deterministic merge guard 建立 `mergedContent`：
   - 若 `result.content` 已包含 normalized import block，保留 AI 結果，不重複追加。
   - 若 `result.content` 未包含 import block，將受保護區塊補回固定位置。
   - 固定位置建議為 AI整理正文後方的 `## 專案變化匯入` 區段。
   - 合併後需整理多餘空白行，但不得改寫受保護區塊語意。
6. 以 `mergedContent` 呼叫內容任務連結同步邏輯。
7. `contentCursorOffset` 必須使用 `mergedContent.length`。
8. 存草稿與發布都必須使用 `mergedContent`。

## Task Link 規則

- AI 回傳的 `linkedTaskIds` 只代表模型整理結果，不代表最終內容完整連結集合。
- 若受保護匯入區塊包含任務提及或 task node，合併後必須重新掃描並同步。
- 合併後的 `taskLinks` 至少要包含：
  - AI 回傳連結。
  - 受保護匯入區塊中的任務連結。
  - 原 draft 中仍存在於 merged content 的合法任務連結。

## 介面與資料影響

- 不需要新增資料表。
- 不需要變更 `KnowledgeRecord` schema。
- 不需要變更 `MeetingSynthesisInput` 的外部契約。
- 可新增內部 helper，例如 `src/utils/projectChangeImport.ts` 或獨立的 record content preservation utility。
- UI 可維持 DEV-020 既有操作入口，但 AI整理完成後的 editor 必須顯示保留後的 merged content。

## 驗收標準

- 匯入專案變化後執行 AI整理，已匯入內容仍存在。
- 同一份 draft 重複執行 AI整理，不會重複追加同一份匯入內容。
- 存草稿後重新開啟，匯入內容仍存在。
- 發布後的紀錄內容包含匯入內容。
- `record_task_links` 或等效狀態包含匯入內容中的任務連結。
- 只修改 AI prompt 而沒有 deterministic merge guard，不可視為完成。
- DEV-011 / DEV-012 既有 AI整理品質與紀錄發布流程不得退化。

## 實作證據

實作日期: 2026-06-15

- `src/utils/projectChangeImport.ts` 新增受保護匯入區塊 wrapper、extractor 與 `mergeProjectChangeImportBlocks`。
- `src/components/Records/RecordSidebar.tsx` 在插入專案變化時改用受保護區塊，不再直接插入 raw preview。
- `src/store/useRecordStore.ts` 在 AI整理回寫前先合併 `result.content` 與 `preservedDraft.content` 中的匯入區塊，並以 merged content 重新同步 taskLinks。
- `scripts/verify-dev-021-project-change-ai-preserve.mjs` 驗證 preserve、idempotent、taskLinks、store writeback 與文件 gate。

已通過 gate：
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

## 明確不做

- 不把 AI整理改成發布前必經流程。
- 不自動修改任務狀態。
- 不新增 project event schema 或 migration。
- 不以 prompt-only 修補此問題。
- 不把使用者手寫內容視為可任意覆蓋的 AI 暫存內容。
