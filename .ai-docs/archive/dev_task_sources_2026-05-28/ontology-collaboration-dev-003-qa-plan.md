# DEV-003 QA 驗證計畫

Last updated: 2026-05-27

## 驗證目標

確認 `assigneeId` 與 `collaboratorIds` 已在 Supabase task create/update/load path 中完整持久化，且清除 assignee 時會寫入明確空值。

## 驗證範圍

### 包含

- `taskNodeToInsert` 寫入 `wbs_items.assignee_id`。
- `taskNodeToInsert` 寫入 `wbs_items.collaborator_ids`。
- `supabaseNodeService.update` 支援 `assigneeId`。
- `supabaseNodeService.update` 支援 `collaboratorIds`。
- `mapWbsItemToTaskNode` 已能讀回 `assignee_id` 與 `collaborator_ids`。
- 清除 assignee 會將 `assignee_id` 寫入 null。
- 非 UUID legacy/local assignee 不寫入 Supabase FK 欄位，避免破壞資料庫約束。

### 不包含

- 不驗證通知。
- 不驗證 mention。
- 不驗證 Board-level RLS。
- 不驗證 collaborator 多選 UI；本階段只驗證資料層支援。

## QC 驗證步驟

1. 搜尋確認 Supabase insert/update payload 包含 assignment 欄位：
   - `rg -n "assignee_id|collaborator_ids|assigneeId|collaboratorIds" src/services/supabase/projedService.ts`
2. 搜尋確認 `mapWbsItemToTaskNode` 仍 map 回 `TaskNode`：
   - `rg -n "assigneeId: item.assignee_id|collaboratorIds: item.collaborator_ids" src/services/supabase/projedService.ts`
3. 執行靜態檢查：
   - `npx.cmd tsc --noEmit`
   - `npm.cmd run lint`
4. 檢查 `WbsNodeItem` 清除 assignee 時送出 `undefined`，Supabase update path 需轉為 `null`。

## 通過標準

- TypeScript 通過。
- Lint 為 0 errors。
- Supabase create/update path 均處理 `assigneeId` 與 `collaboratorIds`。
- 清除 assignee 不會留下舊值。
- 非 UUID assignee/collaborators 不會寫入 FK/uuid array 欄位。

## QC 結果

- 狀態：通過
- 驗證日期：2026-05-27
- 驗證人：QC
- 未通過項目：無
- 驗證證據：
  - `rg` 已確認 `taskNodeToInsert` 寫入 `assignee_id` 與 `collaborator_ids`。
  - `rg` 已確認 `supabaseNodeService.update` 支援 `assigneeId` 與 `collaboratorIds`。
  - `rg` 已確認 `mapWbsItemToTaskNode` 讀回 `assignee_id` 與 `collaborator_ids`。
  - `src/components/Wbs/WbsNodeItem.tsx` 清除 assignee 時送出 `undefined`，Supabase update path 轉為 `null`。
  - `npx.cmd tsc --noEmit` 通過。
  - `npm.cmd run lint` 通過，結果為 0 errors、75 warnings；warnings 為既有專案警告，非 DEV-003 新增錯誤。
