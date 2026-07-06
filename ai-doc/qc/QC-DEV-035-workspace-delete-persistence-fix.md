# QC-DEV-035: 工作區刪除持久化修正

日期：2026-06-29；更新：2026-07-06
狀態：Local Automated QC Passed / Supabase DB Role QC Passed / Production Not Deployed
關聯 DEV：DEV-035
關聯規格：`ai-doc/specs/SPEC-035-workspace-delete-persistence-fix.md`
關聯 QA：`ai-doc/qa/QA-DEV-035-workspace-delete-persistence-fix.md`

## 驗證範圍

- Supabase migration 檔定義 owner-only `public.delete_workspace(target_tenant_id uuid)` RPC。
- 前端 Supabase service 改用 RPC，不再直接對 `tenants` delete。
- `removeWorkspace` 改為 async，後端成功後才更新 Zustand state 與 localStorage。
- 右鍵工作區刪除流程 await 結果，成功/失敗皆提供 toast。
- local-test browser 覆蓋取消確認、刪除後 reload 不復活、刪除 active workspace 後不殘留 active board、mobile reload smoke。
- context menu / sidebar rename 既有契約回歸。

## 驗證結果

| Gate | Result | Evidence |
|---|---|---|
| DEV-035 static contract | Pass | `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`，22/22 |
| DEV-035 browser smoke | Pass | `npm.cmd run verify:dev-035-workspace-delete-browser` |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Production build | Pass | `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build` |
| Core regression static | Pass | `npm.cmd run verify:core-regression-static`，10/10 |
| DEV-030 context menu static | Pass | `npm.cmd run verify:dev-030-sidebar-rename-contract`，9/9 |
| DEV-030 context menu browser | Pass | `npm.cmd run verify:dev-030-sidebar-rename-contract-browser` |
| Supabase function definition | Pass | MCP `_execute_sql` on production Supabase target confirmed `public.delete_workspace(uuid)` exists, is `SECURITY DEFINER`, uses `search_path = public`, checks active `tenant_members.role = 'owner'`, deletes `public.tenants`, and errors when target is missing. |
| Supabase execute grants | Pass | MCP `_execute_sql` confirmed `authenticated` and `service_role` have EXECUTE; `anon` / public do not. |
| Supabase DB role matrix | Pass | Rollback-only MCP `_execute_sql` transaction seeded a temporary workspace with project/task/tag/meeting record, simulated authenticated owner/admin/member/viewer/outsider via `request.jwt.claim.sub`, then rolled back. Admin/member/viewer/outsider were denied and workspace remained; owner delete succeeded. |
| Supabase tenant-scoped cascade / list reload | Pass | Same rollback-only transaction confirmed projects, tenant_members, project_members, wbs_items, task_tags, and knowledge_records for the deleted workspace were 0 after owner delete; owner workspace list returned 0 rows for the deleted workspace. |
| Diff whitespace check | Pass | `git diff --check`，僅 CRLF warning |

## Browser Evidence

- `output/playwright/dev-035-mobile-after-active-delete.png`

## QC 判定

Local automated QC pass. Supabase DB role QC pass for the target production Supabase database.

DEV-035 的本輪 repo/local-test 範圍已可驗證：

- 刪除成功定義已改為後端持久化成功。
- local-test 刪除後重新整理不會復活。
- 取消刪除不會移除 workspace 或 local-test persistence。
- 刪除 active workspace 後，active workspace / board 不再指向已刪資料。
- `GlobalContextMenu` 既有改名入口與側欄操作契約未回歸。
- 目標 Supabase DB 的 `delete_workspace` RPC 權限矩陣通過：owner 可刪；admin/member/viewer/outsider 不可刪。
- owner 刪除後，workspace list 不再回傳該 workspace，且 tenant-scoped project/task/tag/record 測試資料依 FK cascade 移除。

## 殘留風險與範圍外

- 本輪未部署 production front-end。
- 遠端 migration history 未列出本地檔名 `20260629113000_workspace_delete_rpc.sql`；但目標 DB 目前已存在等效且較嚴格的 function 定義（含 null guard），因此本輪未覆寫 DB function 或新增歷史對齊 migration。
- 本輪 DB QC 使用 rollback-only transaction，不保留測試 workspace / membership / board / task / tag / record。
- DEV-035 若要讓正式前端使用此 RPC，仍需另行 production release gate。
