# QA-DEV-010 會議紀錄操作按鈕狀態溝通 UX 驗證計畫

狀態：Implemented / QC Covered
對應 DEV：DEV-010  
關聯規格：`ai-doc/specs/SPEC-010-meeting-record-action-feedback.md`  
建立日期：2026-06-07

## 驗證目標

以 UX 為主要驗證需求，確認使用者在會議模式看到 `存草稿`、`發布`、`離開會議模式` 時，能理解：

- 每個按鈕的功能差別。
- 目前不能操作的原因。
- 下一步要做什麼才能解除阻塞。
- 離開會議模式不等於發布或保存。

## 非驗證範圍

- 手機版會議紀錄工作流不作為 DEV-010 release gate。
- 不驗證 AI 摘要、RAG embedding 或跨 board 會議管理。
- 不驗證資料庫 migration，因 DEV-010 不應新增 migration。

## UX FMEA

| 風險 | 可能原因 | 使用者影響 | 偵測方式 | 嚴重度 | 預防要求 |
|---|---|---|---|---|---|
| 按鈕灰掉但不知道原因 | 只用 disabled 樣式 | 使用者卡住或亂按離開 | 空白 draft smoke | 高 | 狀態列與 tooltip 同時說明 |
| `存草稿` 被誤解成需要完整內容 | 與 `發布` 同條件 | 使用者無法保存未完成會議 | 空內容存草稿測試 | 高 | draft 與 published 條件分離 |
| `結束會議` 被誤認為已保存 | 文案不清 | 會議紀錄遺失或誤判完成 | 離開前確認測試 | 高 | 改成 `離開會議模式` 並提示未儲存 |
| BoardView 與 RecordSidebar 規則不一致 | 兩處各自判斷 | 使用者不信任系統 | 雙入口對照 | 中 | 共用 action state helper |
| tooltip 只能滑鼠看到 | 缺少 focus / aria | 鍵盤使用者不知道原因 | keyboard Tab 測試 | 中 | hover 與 focus 都能揭露 |
| 長提示破版 | 狀態列空間不足 | 主要按鈕被擠壓 | 1024x768 viewport | 中 | 文案可換行或 truncate，按鈕不裁切 |

## 自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-009-task-detail-quick-note
npm.cmd run verify:dev-010-action-feedback
npm.cmd run build
```

`verify:dev-010-action-feedback` 至少需靜態檢查：

- `BoardView` 不再以單一 `canSaveMeetingRecord` 同時控制 `存草稿` 與 `發布`。
- `RecordSidebar` 與 `BoardView` 使用同一個 action state helper。
- 空白 meeting draft 下，`存草稿` 不因內容空白而被鎖住。
- 存草稿與發布具有不同原因文案。
- 不可發布原因可透過 tooltip / aria / status message 被讀到。
- `結束會議` 文案已改為 `離開會議模式`，或具備明確 tooltip 說明。

## 實際 UX 測試

### TC-001 空白會議 draft

步驟：

1. 開啟 app，進入 active board。
2. 點 `會議紀錄` 進入 meeting mode。
3. 不輸入任何內容。

預期：

- `存草稿` 可操作。
- `發布` 不可操作。
- 狀態列顯示「尚未有會議內容，輸入內容或記錄任務變更後即可發布」或等價文案。
- 使用者不需要猜 disabled 原因。

### TC-002 不可發布原因揭露

步驟：

1. 延續 TC-001。
2. hover `發布`。
3. 用 keyboard Tab focus 到 `發布`。

預期：

- hover 與 focus 都能看到不能發布的原因。
- tooltip / popover 不遮住主要按鈕。
- 螢幕閱讀器可透過 `aria-describedby` 或等價機制取得原因。

### TC-003 輸入內容後解除阻塞

步驟：

1. 在會議速記欄輸入 `今天確認登入流程需補 QA case`。
2. 觀察狀態列與按鈕。

預期：

- `發布` 變為可操作。
- 原本的阻塞訊息消失。
- `存草稿` 仍可操作。

### TC-004 只有任務變更時的發布狀態

步驟：

1. 開啟 meeting mode。
2. 不輸入文字。
3. 在看板上修改一張任務狀態或移動任務，觸發 DEV-007 meeting activity。
4. 觀察狀態列與 `發布`。

預期：

- 系統清楚顯示已有任務變更可納入會議紀錄。
- `發布` 不應因 editor 文字空白而靜默鎖住。
- 發布後會議紀錄含任務變更摘要與 task tag。

### TC-005 離開會議模式保護

步驟：

1. 輸入一段會議內容但不存草稿。
2. 點 `離開會議模式`。

預期：

- 顯示確認選項：`存草稿後離開`、`直接離開`、`取消`。
- 使用者能理解直接離開不代表發布。
- 選 `取消` 後仍停留 meeting mode，內容不消失。

### TC-006 存草稿後離開

步驟：

1. 延續 TC-005。
2. 選 `存草稿後離開`。

預期：

- draft 被保存。
- 離開 meeting mode。
- 重新開啟會議草稿時內容仍存在。

### TC-007 BoardView / RecordSidebar 一致性

步驟：

1. 在 BoardView 狀態列觀察三個按鈕狀態。
2. 展開 RecordSidebar 底部操作區。
3. 對照 `存草稿` 與 `發布` 狀態與原因。

預期：

- 兩處按鈕狀態一致。
- 兩處不能操作原因一致。
- 不出現一處可發布、另一處不可發布。

### TC-008 桌機與筆電 viewport

Viewport：

| viewport | 驗證重點 |
|---|---|
| 1440x950 desktop | 狀態列、tooltip、按鈕排列不重疊 |
| 1024x768 laptop | 長提示不擠壓按鈕，無水平 overflow |

預期：

- 主要議題看板仍可讀。
- 會議狀態列不遮住 Kanban card。
- tooltip / popover 不超出 viewport。
- 無文字裁切、按鈕重疊或水平捲動。

## 通過標準

- 使用者可在 3 秒內理解 `發布` 不能按的原因。
- `存草稿` 與 `發布` 有不同啟用條件。
- 離開會議模式前的未儲存狀態有保護。
- 桌機與筆電 viewport UX smoke 通過。
- 自動驗證命令全部通過。

## 證據要求

- 指令輸出：lint、DEV-007、DEV-008、DEV-009、DEV-010 verifier、build。
- Playwright 截圖或錄影：空白 draft、tooltip/focus、輸入後解除阻塞、離開確認。
- QC 報告需記錄實際 URL、viewport、操作步驟與結果。
