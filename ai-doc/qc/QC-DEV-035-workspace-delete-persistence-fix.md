# QC-DEV-035: 工作區刪除持久化修正

日期：2026-06-29
狀態：Local Automated QC Passed / Supabase DB QC Pending
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
| DEV-035 static contract | Pass | `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`，21/21 |
| DEV-035 browser smoke | Pass | `npm.cmd run verify:dev-035-workspace-delete-browser` |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Production build | Pass | `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build` |
| Core regression static | Pass | `npm.cmd run verify:core-regression-static`，10/10 |
| DEV-030 context menu static | Pass | `npm.cmd run verify:dev-030-sidebar-rename-contract`，9/9 |
| DEV-030 context menu browser | Pass | `npm.cmd run verify:dev-030-sidebar-rename-contract-browser` |
| Diff whitespace check | Pass | `git diff --check`，僅 CRLF warning |

## Browser Evidence

- `output/playwright/dev-035-mobile-after-active-delete.png`

## QC 判定

Local automated QC pass.

DEV-035 的本輪 repo/local-test 範圍已可驗證：

- 刪除成功定義已改為後端持久化成功。
- local-test 刪除後重新整理不會復活。
- 取消刪除不會移除 workspace 或 local-test persistence。
- 刪除 active workspace 後，active workspace / board 不再指向已刪資料。
- `GlobalContextMenu` 既有改名入口與側欄操作契約未回歸。

## 殘留風險與範圍外

- 本輪未套用 Supabase migration 到遠端資料庫。
- 本輪未部署 production。
- 本機未安裝 Supabase CLI，因此未執行 owner/admin/member/viewer 的真實 DB role QC。
- 遠端 DB QC 需在 migration 套用後補跑，且不得以本輪 local-test browser pass 代替正式資料庫權限驗證。
