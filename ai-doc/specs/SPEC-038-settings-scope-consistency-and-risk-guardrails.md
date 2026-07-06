# SPEC-038: 設定中心作用範圍一致性與高風險防呆

關聯 DEV：DEV-038
關聯開發點：DEV-037 行事曆訂閱來源範圍清晰化
父交付點：DEV-036 Trello-like Workspace Governance
任務類型：Settings IA / Scope taxonomy / Risk guardrails
狀態：Production Release Deployed / Local + Production Smoke Passed / DB unchanged
優先級：P0 backup/import/trash risk, P1 settings IA consistency
建立日期：2026-06-29
實作日期：2026-07-06

## Implementation Status - 2026-07-06

DEV-038 已完成本機 RD、自動化 QC 與 2026-07-06 Firebase Hosting production release。實作範圍限制在 Settings / Backup / RecycleBin / BoardMembersPanel / AppInstallAssistant 與 verifier，未修改 `exportData` / `importData` 資料格式，未新增 DB schema、RLS 或 migration。

主要交付：

- `SettingsView` 頁首改為中性的 `設定中心`，不再以全頁 `目前看板` framing 統包所有設定。
- `備份與資料` 拆成 `匯出全域快照` 與 `匯入至目前看板`，匯入選檔後需確認目標 Workspace / Board 與檔名，取消不會進入 `importData`。
- `RecycleBinView` 改為 `目前看板回收桶`，顯示目標 Workspace / Board，清空確認包含 board title 與 archived item count。
- `看板權限`、`行事曆訂閱`、`快速開啟` 均顯示各自作用範圍摘要。
- 新增 `verify:dev-038-settings-scope-consistency` 與 `verify:dev-038-settings-scope-consistency-browser`。

## 背景

使用者在檢視行事曆訂閱後追問：依相同邏輯，設定裡其他頁面是否也有邏輯不一致。經程式檢查，目前 `SettingsView` 內的功能混合了不同作用範圍：

- `備份與資料`：匯出是全域快照，匯入卻套用到目前看板。
- `資源回收桶`：從備份頁進入，但實際只顯示目前看板的封存任務。
- `權限設定`：內容是看板權限，但設定中心頁首仍以「系統設定與管理 / 目前看板」統包。
- `行事曆訂閱`：已由 DEV-037 拆出來源範圍與資料契約。
- `快速開啟`：屬於此裝置 / 目前帳號，不應被「目前看板」框住。

真正問題不是單一文案，而是設定中心缺少一致的 `設定範圍` 規則。使用者需要在執行任何設定動作前知道：這個設定作用於系統、工作區、看板、外部連結，還是此裝置/帳號。

## HCS 引導補足

本輪依 HCS 引導模式補齊高影響決策；因這些決策可逆且能降低誤操作風險，採建議預設寫入規格，不阻塞 RD。

### 1. 設定中心架構

- A. 保留單一設定中心，但每個頁籤明確標示 `設定範圍`
- B. 立即拆成系統設定、看板設定、帳號設定三個入口
- C. 只修目前被指出的行事曆訂閱頁

採用：A。理由：目前程式已有單一 SettingsView，先用 scope taxonomy 修正語意與高風險防呆，成本低且不破壞導航。

### 2. 備份頁匯出/匯入語意

- A. 明確分成 `匯出全域快照` 與 `匯入至目前看板`
- B. 將匯入改成完整還原 Workspace / Board 快照
- C. 暫時隱藏匯入，只保留匯出

採用：A。理由：現有 `exportData` 已是全域快照，`importData` 已是目前看板目標；先把真實行為講清楚並補確認，比改資料還原模型安全。

### 3. 回收桶作用範圍

- A. 改為 `目前看板回收桶`，清空前顯示看板名稱與任務數量
- B. 改成全工作區回收桶
- C. 改成全系統回收桶

採用：A。理由：現有 `RecycleBinView` 只依 `activeBoardId` 篩選，先對齊真實資料範圍；全工作區或全系統回收桶需要另設資料與權限規格。

### 4. 行事曆訂閱

- A. 續接 DEV-037，不在本 DEV 重複實作資料契約
- B. 把行事曆訂閱一起塞入本 DEV
- C. 暫時移除行事曆訂閱入口

採用：A。理由：DEV-037 已處理 `目前看板 / 工作區全部看板 / 自訂範圍` 與 Edge Function 契約；本 DEV 只要求設定中心共同 scope 規則與入口一致。

## 設定範圍分類

每個設定頁籤與高風險動作必須對應一個 `設定範圍`：

| Scope | 中文顯示 | 例子 | 規則 |
|---|---|---|---|
| `board` | 目前看板 | 看板權限、匯入至目前看板、目前看板回收桶 | 必須顯示 Workspace / Board path；沒有 active board 時不可執行寫入或刪除 |
| `workspace` | 目前工作區 | 未來 Workspace settings | 必須顯示 Workspace name；不得暗示影響所有 Workspace |
| `global_snapshot` | 全域快照 | 匯出備份 | 必須說明包含多 Workspace / Board / 任務 / 標籤快照 |
| `external_link` | 外部連結 | 行事曆訂閱 | 必須顯示資料來源與條件；續接 DEV-037 |
| `device_account` | 此裝置 / 目前帳號 | 快速開啟、加入主畫面提示 | 不得被目前看板語境限制 |

## UX 規格

### 設定中心頁首

現況：

- `系統設定與管理`
- `目前看板：{workspace}/{board}`

目標：

- 頁首標題改為 `設定中心`。
- 頁首短句只說明「依功能管理 ProJED 的看板、資料、外部連結與裝置設定」。
- 不在全頁首固定顯示 `目前看板`，避免快速開啟、全域匯出、外部訂閱被錯誤框住。
- active workspace / board 改由 board-scoped section 自己顯示。

### 頁籤命名與描述

- `備份與資料`：描述改為 `匯出全域快照、匯入至目前看板與開啟目前看板回收桶。`
- `權限設定` 改為 `看板權限`：描述改為 `管理目前看板的成員角色與權限矩陣。`
- `行事曆訂閱`：描述改為 `建立外部行事曆可讀取的任務訂閱連結。`
- `快速開啟`：描述保留裝置語意，避免暗示作用於看板。

### 備份與資料

必須拆成兩個清楚區塊：

1. `匯出全域快照`
   - Scope chip：`全域快照`
   - 文案：`會下載目前 ProJED 的工作區、看板、任務、依賴與標籤快照。`
   - CTA：`匯出全域快照`

2. `匯入至目前看板`
   - Scope chip：`目前看板`
   - 目標摘要：`目標：{workspaceTitle} / {boardTitle}`
   - 文案：`會把備份中的任務資料套用到目前看板；不會還原 Workspace 結構。`
   - 沒有 active board 或沒有 `edit_board_settings` 權限時 disabled，並顯示原因。
   - 選檔後、真正呼叫 `importData` 前必須有確認摘要：目標看板、資料來源檔名、可能覆寫/新增任務、不可在匯入中關閉頁面。

本 DEV 不要求改 `importData` 的資料映射模型，但 UI 不得暗示它能完整還原全域快照。

### 目前看板回收桶

- `開啟資源回收桶` 改為 `開啟目前看板回收桶`。
- `RecycleBinView` 標題改為 `目前看板回收桶`。
- 標題旁顯示 `目標：{workspaceTitle} / {boardTitle}`。
- 空狀態文案改為 `目前看板沒有已刪除任務。`
- `清空回收桶` 確認文案必須包含 Board title 與待永久刪除數量。
- 永久刪除單筆任務仍保留任務名稱確認。

### 看板權限

- 頁籤與 section 統一稱 `看板權限`。
- section header 顯示 `設定範圍：目前看板` 與 `目標：{workspaceTitle} / {boardTitle}`。
- `分享邀請已移到看板右上角` 可保留，但需降層為說明，不得讓使用者以為此處也能建立邀請。
- 沒有 active board 時仍顯示選擇看板的空狀態。

### 行事曆訂閱

- 此頁面共同規則由 DEV-038 要求：必須有 `設定範圍：外部連結` 或等效來源摘要。
- 來源與資料契約由 DEV-037 執行，不在本 DEV 重複定義。

### 快速開啟

- section header 顯示 `設定範圍：此裝置 / 目前帳號`。
- `提示狀態` 保留。
- 不顯示 active workspace / board，避免誤解加入主畫面只對某個看板生效。

## RD 執行範圍

- 更新 `SettingsView.tsx` 頁首、頁籤文案與每個 section 的 scope summary。
- 更新 `BackupSettings`，拆分全域匯出與目前看板匯入，並在匯入前新增確認摘要。
- 更新 `RecycleBinView` 文案與清空確認，明確標示 active board 範圍。
- 更新 `BoardMembersPanel` embedded mode 的 section 文案與 target summary。
- 更新 `AppInstallAssistant` settings mode 的 scope summary。
- 補 static verifier 與 browser verifier。

## Out of Scope

- 不改 `exportData` / `importData` 的資料格式。
- 不做完整全域還原、Workspace 還原或 Board 還原 wizard。
- 不新增全工作區或全系統回收桶。
- 不修改 Supabase schema、RLS、migration。
- 不取代 DEV-037 的行事曆訂閱資料契約。
- 不改主導航或 Sidebar 結構。

## Acceptance Criteria

- 設定中心頁首不再用 `目前看板` 框住所有頁籤。
- 每個設定 section 都能看出作用範圍。
- 備份頁清楚區分全域匯出與目前看板匯入。
- 匯入備份前有目標看板確認，不會直接選檔後立即匯入。
- 回收桶明確是目前看板回收桶，清空前顯示目標看板與永久刪除數量。
- 看板權限頁顯示目前看板目標，不再與分享邀請主流程混淆。
- 快速開啟頁顯示此裝置 / 目前帳號範圍，不受 active board 語境影響。
- 390px mobile viewport 不出現文字重疊、按鈕裁切或水平 overflow。

## Stop Conditions

- 如果 RD 發現匯入實際會覆寫目前看板任務但無法在 UI 前置確認，停止，不得宣告完成。
- 如果清空回收桶確認無法取得正確 active board 與刪除數量，停止，不得改成更模糊的全域文案。
- 如果要改 import/export 資料格式或新增還原 wizard，另開 DEV，不納入本 DEV。
- 如果要改 DB schema、RLS 或 production release，必須走對應 Supabase / deployment-release-gate。
