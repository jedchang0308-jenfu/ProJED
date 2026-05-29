# DEV-004 QA 驗證計畫：Board-level RLS 與 role write policy

Last updated: 2026-05-27

## 驗證目標

確認 Supabase RLS 以 `project_members` 作為 Board-level 可見與可寫權限來源：非 Board 成員不可讀，viewer 可讀不可寫，member 以上依角色可寫或管理。

## 驗證範圍

### 包含

- `projects`、`project_members`、`wbs_items`、`wbs_dependencies`、`task_tags`、`wbs_item_tags` policy。
- owner、admin、project_manager、member、viewer、nonmember。
- service_role 維運讀寫。

### 不包含

- UI guard。該項由 DEV-005 驗證。
- Task-level private permission。

## 使用者角度驗證

- [x] owner/admin 可讀寫 Board 資料。
- [x] project_manager 可讀寫 Board 任務並管理 Board 成員。
- [x] member 可讀寫 Board 任務。
- [x] viewer 可讀 Board，但不能寫任務或事件。
- [x] nonmember 讀不到 Board 與 WBS 資料。

## RD FMEA

| 風險 | 可能原因 | 影響 | 驗證方式 |
| --- | --- | --- | --- |
| 非成員讀到 Board | SELECT policy 過寬 | 資料外洩 | nonmember select `projects`、`wbs_items` 為 0 rows |
| viewer 可寫 | write helper mapping 錯誤 | 權限繞過 | viewer update `wbs_items` 被拒 |
| project_manager 無法管理成員 | manage helper 漏角色 | PM workflow 中斷 | project_manager update/insert `project_members` |
| service_role 被 RLS 阻擋 | policy 未考量維運角色 | migration 或維運失敗 | service_role select/write smoke |

## QC 檢查項

- [x] `npm.cmd run verify:supabase:static` 通過。
- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 通過，0 error。
- [x] `ProJED_TEST` DB smoke：owner/admin/project_manager/member/viewer read pass。
- [x] `ProJED_TEST` DB smoke：nonmember read denied pass。
- [x] `ProJED_TEST` DB smoke：owner/admin/project_manager/member write task pass。
- [x] `ProJED_TEST` DB smoke：viewer/nonmember write task denied pass。
- [x] `ProJED_TEST` DB smoke：project_manager manages members pass。
- [x] `ProJED_TEST` DB smoke：service_role maintenance read pass。

## 執行紀錄

- 2026-05-27：先在 `ProJED_TEST` 套用 prerequisite `202605250001_workspace_tags`，再套用 `202605270001_board_level_collaboration_rls.sql`。
- 2026-05-27：透過 Supabase MCP SQL smoke 驗證通過；未套用到 production `ProJED`。

## 結論

通過。DEV-004 可標記完成。
