# QA-DEV-018：會議紀錄防呆 UX/UI 流程驗證計畫

狀態：Ready for QC
對應 DEV：DEV-018
建立日期：2026-06-10

## 驗證目標

確認會議紀錄側欄已從單純操作列改為可防呆的工作流介面，使用者能理解目前狀態、下一步、儲存狀態、AI整理狀態，以及直接發布的後果。

## 驗證範圍

- 四階段 Stepper。
- 側欄狀態卡。
- AI整理與發布分離。
- 未儲存離開三選一 action dialog。
- 會議模式狀態 select 隱藏或鎖定。
- 1024x768 與 1440x950 viewport。

## 測試案例

### TC-001：空白會議 draft

步驟：

1. 進入會議模式。
2. 不輸入任何編輯器內容。
3. 檢查側欄 action 狀態。

預期：

- 可存草稿。
- 不可發布空內容。
- 狀態卡說明缺少可發布內容。
- Stepper 停留在「速記」或合理的初始階段。

### TC-002：輸入內容後直接發布

步驟：

1. 進入會議模式。
2. 在編輯器輸入會議內容。
3. 按「發布」。

預期：

- 發布成功。
- 不自動執行 AI整理。
- 保存內容為目前編輯器內容。
- 狀態進入「發布」。

### TC-003：AI整理

步驟：

1. 進入會議模式。
2. 輸入會議內容或建立任務變更來源。
3. 按「AI整理」。

預期：

- AI 成功後更新編輯器內容。
- 進入「校稿」階段。
- 尚未自動保存為 published。
- 使用者仍需存草稿或發布。

### TC-004：AI失敗

步驟：

1. 讓 AI整理流程回傳錯誤。
2. 檢查編輯器與 action 狀態。

預期：

- 原始內容保留。
- 錯誤訊息可見。
- 可重試 AI整理。
- 仍可直接發布目前編輯器內容。

### TC-005：未儲存離開

步驟：

1. 進入會議模式。
2. 建立未儲存變更。
3. 點「離開會議模式」或主入口「離開會議」。

預期：

- 顯示三選一 action dialog。
- 「存草稿後離開」會先保存再退出。
- 「直接離開」不保存新變更但不刪除既有草稿。
- 「取消」維持會議模式與目前內容。

### TC-006：已儲存後離開

步驟：

1. 進入會議模式。
2. 輸入內容並存草稿。
3. 不再修改內容，點「離開會議模式」。

預期：

- 可直接離開。
- UI 不暗示草稿已發布。

### TC-007：任務變更來源

步驟：

1. 進入會議模式。
2. 在任務卡或任務詳情建立會議活動。
3. 檢查側欄狀態卡與直接發布說明。

預期：

- 狀態卡說明任務變更需 AI整理或手動寫入。
- 直接發布只保存編輯器內容。

### TC-008：viewport

步驟：

1. 在 1440x950 開啟會議模式側欄。
2. 在 1024x768 開啟會議模式側欄。
3. 檢查 stepper、狀態卡、action button、dialog。

預期：

- 無按鈕重疊。
- 無文字裁切。
- 無水平 overflow。
- action dialog 三個選項均可見且可操作。

## QC 命令

```powershell
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-009-task-detail-quick-note
npm.cmd run verify:dev-010-action-feedback
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run build
```
