# QA-DEV-113：任務說明尺寸行為驗證計畫

## 驗證目標

確認任務詳情中的任務說明編輯器在空白、內容增加與使用者從整條底邊調整高度時，符合 SPEC-113 且不破壞既有 Lexical 編輯流程。

## 驗收矩陣

| Case | 驗證 | 通過條件 |
|---|---|---|
| B01 | 空白初始高度 | 編輯器外框高度為一行級距，不再是固定 96px。 |
| B02 | 多行內容／未手動調整 | 輸入多行後高度依內容增加，`scrollHeight` 與外框高度一致。 |
| B03 | 還原內容 | 清空內容後高度回到最小一行級距。 |
| B04 | 底邊縱向 resize | 原生 resize 為 none；中央、左端、右端拖曳底邊都只改高度，寬度不變；可縮至內容高度以下並出現縱向捲軸。 |
| B05 | board scope | 同一 `boardId` 讀回高度；換看板不誤用其他看板偏好。 |
| B06 | 優先序 | 未手動設定時內容自動增高；手動設定後保留選定高度，由捲軸承接超出內容。 |
| B07 | Viewport／鍵盤 | 808×698 無水平 overflow；底邊可 focus 並用方向鍵調整。 |
| B08 | 回歸 | 任務標題、toolbar、儲存、權限與既有 DEV-028 互動不變。 |

## 工程 gate

- `npm run verify:dev-113-task-note-autosize-board-width`
- `npx.cmd tsc --noEmit`
- targeted ESLint：TaskDetailNoteEditor、TaskDetailNoteField、TaskDetailsModal
- `npm run build:test`
- Playwright rendered geometry、底邊三點拖曳、808×698 畫面與 visible／console error sweep

## 邊界

本輪為 local-only 驗證，未做正式環境 mutation、未新增 schema／migration，也未執行 physical mobile device supplemental。
