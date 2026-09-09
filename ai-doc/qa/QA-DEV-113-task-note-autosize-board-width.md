# QA-DEV-113：任務說明尺寸行為驗證計畫

## 驗證目標

確認任務詳情中的任務說明編輯器在空白、內容增加與使用者調整寬度時，符合 SPEC-113 且不破壞既有 Lexical 編輯流程。

## 驗收矩陣

| Case | 驗證 | 通過條件 |
|---|---|---|
| B01 | 空白初始高度 | 編輯器外框高度為一行級距，不再是固定 96px。 |
| B02 | 多行內容 | 輸入多行後高度依內容增加，`scrollHeight` 與外框高度一致，無垂直截斷。 |
| B03 | 還原內容 | 清空內容後高度回到最小一行級距。 |
| B04 | 水平 resize | 原生 resize 把手可改變寬度，且有最小／最大界線。 |
| B05 | board scope | 同一 `boardId` 讀回寬度；換看板不誤用其他看板偏好。 |
| B06 | 優先序 | 內容變更重新計算高度，不清除使用者選定寬度。 |
| B07 | 錯誤回退 | localStorage 不可用時仍可編輯，使用容器寬度。 |
| B08 | 回歸 | 任務標題、toolbar、儲存、權限與既有 DEV-028 互動不變。 |

## 工程 gate

- `npm run verify:dev-113-task-note-autosize-board-width`
- `npx.cmd tsc --noEmit`
- targeted ESLint：TaskDetailNoteEditor、TaskDetailNoteField、TaskDetailsModal
- `npm run build:test`
- in-app browser rendered geometry 與 visible error sweep

## 邊界

本輪為 local-only 驗證，未做正式環境 mutation、未新增 schema／migration，也未執行 physical mobile device supplemental。
