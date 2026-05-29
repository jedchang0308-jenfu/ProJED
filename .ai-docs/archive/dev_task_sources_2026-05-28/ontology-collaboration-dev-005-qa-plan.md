# DEV-005 QA 驗證計畫：Role-aware UI Guard

Last updated: 2026-05-27

## 驗證目標

確認 ProJED UI 依 active board capability 呈現 readonly 或 disabled 狀態，viewer 無法從 UI 觸發新增、拖曳、編輯、刪除、改狀態、改日期、dependency 變更。

## 驗證範圍

### 包含

- `useBoardPermissions` capability helper。
- BoardView、WBS list、Kanban、TaskDetailsModal、TagPicker、StatusFilterBar、SharedTaskSidebar、GlobalContextMenu。
- Sidebar 的新增看板、刪除工作區、刪除看板、匯入 JSON。
- RecycleBin 的還原、永久刪除、清空回收桶。
- GanttTaskBar 的拖曳與日期調整。

### 不包含

- RLS 安全驗證。該項由 DEV-004/DEV-007 驗證。
- 管理成員 UI。

## 使用者角度驗證

- [x] viewer 看得到 Board，但主要 mutation controls disabled。
- [x] viewer 在 Kanban 無法新增任務或拖曳任務。
- [x] viewer 在 Sidebar 無法新增/刪除 Board 或刪除 Workspace。
- [x] viewer 在 RecycleBin 無法清空回收桶。
- [x] viewer 在 Gantt bar 呈現 `cursor-not-allowed`，不能拖曳排程。
- [x] member/project_manager/admin 的 capability mapping 仍保留寫入能力。

## RD FMEA

| 風險 | 可能原因 | 影響 | 驗證方式 |
| --- | --- | --- | --- |
| viewer 仍可從側欄變更資料 | guard 只做 task surface | UI 與 RLS 不一致 | Playwright viewer snapshot 檢查 Sidebar disabled |
| viewer 可拖曳甘特圖 | GanttTaskBar 未接 capability | 排程可被 UI 變更 | 檢查 `[data-task-id]` class 含 `cursor-not-allowed` |
| viewer 可清空回收桶 | RecycleBin 未接 capability | 刪除流程被觸發 | Playwright snapshot 檢查清空按鈕 disabled |
| 靜態 QC 漏 surface | 腳本未列入所有 mutation UI | 回歸風險 | 擴充 `scripts/ontology-collaboration-qc.mjs` |

## QC 檢查項

- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 通過，0 error，既有 warning 保留。
- [x] `npm.cmd run verify:ontology-collaboration` 通過：11 static pass，DB smoke pending 由 DEV-007 補。
- [x] `npm.cmd run build:test` 通過。
- [x] Playwright viewer snapshot：Sidebar `新增看板`、`刪除工作區`、`刪除看板` disabled。
- [x] Playwright viewer snapshot：Kanban drag/add task controls disabled。
- [x] Playwright viewer snapshot：RecycleBin `清空回收桶` disabled。
- [x] Playwright viewer eval：Gantt `[data-task-id]` class 包含 `cursor-not-allowed`。

## 執行紀錄

- 2026-05-27：初次 QC 發現 Sidebar、RecycleBin、Gantt 未完整納入 guard。
- 2026-05-27：RD 補上 `canCreateBoard`、`canDeleteWorkspace`、`canEditBoardSettings`、RecycleBin guard、Gantt schedule guard。
- 2026-05-27：QC 重新以 local-test viewer fixture 驗證通過。

## 結論

通過。DEV-005 可標記完成。
