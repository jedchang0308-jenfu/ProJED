# SPEC-125：任務目的欄位統整

## 文件狀態

- `RD Implementation Complete / Architecture Confirmed / Targeted QA PASS / NOT RELEASED`
- 來源：`USER-20260918-TASK-PURPOSE-CONSOLIDATION`
- 影響範圍：Goal 看板任務目的欄、任務明細備註編輯器、既有 `detailNotes`／`description` 相容投影

## 問題與目標

歷史資料可能把同一個任務目的拆成「說明」與「達到目標」兩個備註。這會讓正式 Goal 看板的任務目的只顯示其中一段，也讓任務明細出現兩個應屬同一語意的欄位。

本期將兩個 legacy fragment 合併為唯一的「任務目的」內容；「歷程紀錄」與其他非目的備註仍是獨立欄位。合併內容依原備註順序，以空白行分隔，完全相同的重複片段只保留一次。

## 架構與資料邊界

1. `src/utils/taskNoteRichContent.ts` 是唯一的目的解析與正規化入口。
2. `getTaskPurposeNote` 與 `getTaskPurposeText` 在讀取時產生純投影，不寫入資料庫。
3. `TaskDetailsModal` 使用 `getTaskDetailNotesWithCanonicalPurpose` 顯示單一「任務目的」與其餘備註。
4. `GoalView` 的任務目的欄使用同一個解析器，不另建 Goal 專用內容來源。
5. 使用者編輯／儲存時，`buildTaskPurposeUpdates` 將目的寫成第一個 `note_default`，同步更新 legacy `description`，並移除已合併的 legacy purpose notes；非目的備註原順序保留。
6. 不新增資料表、欄位、migration、RPC、權限或後端 API；不在開啟畫面時執行 bulk mutation。

## 驗收條件

- AC-125-01：含「說明」與「達到目標」的任務，在 Goal 看板只顯示一個「任務目的」，內容包含兩段且順序一致。
- AC-125-02：開啟任務明細時只出現一個「任務目的」欄；「歷程紀錄」等非目的備註仍各自存在且順序不變。
- AC-125-03：完全相同的目的片段不重複顯示。
- AC-125-04：修改並儲存後，`detailNotes[0]` 為 `note_default`／`任務目的`，`description` 與目的純文字一致，legacy「說明／達到目標」不再分裂保存。
- AC-125-05：未編輯只讀取 legacy 資料時不得自動寫入雲端。
- AC-125-06：既有單一富文字目的保留其 rich content；多段合併時以合併後純文字建立相容 rich projection。

## 非目標

- 不執行指定看板或全域任務的一次性遠端 bulk migration。
- 不改變「歷程紀錄」的內容、排序或編輯權限。
- 不改變任務權限、同帳號、Goal rowSpan、會議紀錄或 quick task 入口。

## 受影響檔案

- `src/utils/taskNoteRichContent.ts`
- `src/components/TaskDetailsModal.tsx`
- `src/components/GoalView.tsx`
- `scripts/verify-dev-125-task-purpose-merge.ts`

