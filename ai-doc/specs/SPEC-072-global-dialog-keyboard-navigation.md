# SPEC-072：共用彈窗按鈕鍵盤導航

- 狀態：Implemented / Local QA-QC PASS / 未 Release
- 開發點：DEV-072
- 原始需求：`USER-20260818-GLOBAL-DIALOG-KEYBOARD-NAVIGATION`
- 產品決策：套用所有模式的共用預設值，不建立各模式重複設定。
- 影響範圍：`src/components/GlobalDialog.tsx` 及其驗證文件；不改任務模式 Profile。

## 1. 目的與非目標

全域彈窗是所有模式共用的阻塞式決策入口。使用者希望在出現「取消／確認」或多選操作彈窗時，以鍵盤完成按鈕選擇與執行，且不因目前位於看板、清單、甘特、心智圖或其他模式而產生不同的預設鍵位。

本規格只定義 `GlobalDialog` 的共用互動預設，不改變各模式任務點擊、右鍵選單、Enter／Tab 建立任務、資料模型、API、權限與既有 dialog result 值。

## 2. 互動契約

### 2.1 開啟時焦點

| 彈窗類型 | 預設焦點 | 執行結果 |
|---|---|---|
| `confirm` | `確認`（按鈕索引 1） | `true` |
| `prompt` | 輸入框，並選取現有文字 | 輸入框 Enter 回傳目前字串；按鈕仍為取消／確認 |
| `action` | 第一個 action（按鈕索引 0） | 回傳該 action 的 `id` |

### 2.2 左右鍵選擇

- `ArrowLeft` 選擇上一個決策按鈕。
- `ArrowRight` 選擇下一個決策按鈕。
- 按鈕清單採循環導航：第一個往左到最後一個，最後一個往右回第一個。
- 導航時必須 `preventDefault` 並停止事件傳遞，避免底層模式同步移動選取或觸發快捷鍵。
- 關閉 X 不屬於決策按鈕群組；聚焦 X 時左右鍵不執行決策循環。

### 2.3 Enter 與既有鍵位

- `Enter` 執行目前聚焦的決策按鈕，結果值完全沿用既有 `closeDialog` 契約。
- `Escape` 與 X 關閉行為維持既有語意：`confirm` 回傳 `false`、`prompt`／`action` 回傳 `null`。
- `prompt` 輸入框中的 `ArrowLeft`／`ArrowRight` 必須保留瀏覽器原生游標移動；輸入框的 `Enter` 僅提交 prompt，不先切換按鈕。

## 3. 實作邊界

- 所有模式只掛載同一個 `GlobalDialog`，按鈕 focus group、循環索引與 keydown capture 僅實作一次。
- 不在 `MindMapView`、`BoardView`、`ListView`、`GanttView` 或各 task interaction profile 複製彈窗鍵盤邏輯。
- `GlobalDialog` 提供穩定 DOM marker：`data-global-dialog`、`data-global-dialog-decision`、`data-global-dialog-decision-index`，供 QA 與 accessibility smoke 使用。
- 不變更 `useDialogStore` 的公開方法與 Promise result 型別。

## 4. 驗收條件

- AC-072-001：confirm／prompt 開啟後預設聚焦 `確認`（prompt 例外為輸入框）。
- AC-072-002：action 開啟後預設聚焦第一個 action。
- AC-072-003：左右鍵可在決策按鈕間循環移動，且不穿透到底層模式。
- AC-072-004：Enter 執行目前聚焦按鈕，取消不會誤執行確認動作。
- AC-072-005：prompt 輸入框左右鍵仍可移動游標。
- AC-072-006：所有模式使用同一套預設；不需新增 mode-specific 設定。
- AC-072-007：Escape／X 的既有關閉與回傳值不回歸。

## 5. 變更與回復

本次為共用 UI component 的向後相容增強。若驗證發現按鍵穿透、預設焦點錯誤或 prompt 游標被攔截，回復範圍限於 `GlobalDialog.tsx` 的鍵盤 handler／focus effect；不得以各模式自行攔截作為補丁。
