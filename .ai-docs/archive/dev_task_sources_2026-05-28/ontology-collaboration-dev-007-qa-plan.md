# DEV-007 QA 驗證計畫：協作權限 QC 腳本與測試資料

Last updated: 2026-05-27

## 驗證目標

確認協作權限可用固定腳本與測試資料重複驗證，涵蓋 RLS、UI guard、assignment persistence、activity/audit event。

## 驗證範圍

### 包含

- `scripts/ontology-collaboration-qc.mjs`。
- `npm run verify:ontology-collaboration`。
- `npm run verify:ontology-collaboration:db`。
- owner、admin、project_manager、member、viewer、nonmember 測試角色。
- 自動 seed 與 cleanup 策略。
- local-test viewer runtime UI 檢查。

### 不包含

- 完整 Playwright E2E suite。
- production DB smoke。

## 使用者角度驗證

- [x] QC 可直接跑靜態 UI guard 檢查。
- [x] QC 可用 `--db` 在測試專案跑 service-role DB smoke。
- [x] 測試資料有唯一 suffix，避免污染既有資料。
- [x] finally cleanup 會刪除 tenant 與 auth users。
- [x] 文件明確標註 DB smoke 不可指向 production。

## RD FMEA

| 風險 | 可能原因 | 影響 | 驗證方式 |
| --- | --- | --- | --- |
| DB smoke 誤打 production | `.env.local` 指向正式專案 | 污染正式資料 | 文件標註只在 `ProJED_TEST` 執行 |
| static QC 漏 UI surface | 檢查清單不完整 | viewer mutation 回歸 | checks 納入 Sidebar、RecycleBin、GanttTaskBar |
| seed 無法 cleanup | 例外中斷 | 測試垃圾資料殘留 | finally delete tenant/auth users |
| DB smoke 缺 role 覆蓋 | fixture 不完整 | 權限漏洞漏驗 | owner/admin/project_manager/member/viewer/nonmember 全覆蓋 |

## QC 檢查項

- [x] `npm.cmd run verify:ontology-collaboration` 通過：11 static pass，1 pending DB smoke。
- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 通過，0 error。
- [x] `npm.cmd run verify:supabase:static` 通過。
- [x] `npm.cmd run build:test` 通過。
- [x] Playwright viewer runtime UI 檢查通過。
- [x] `ProJED_TEST` DB smoke 通過 RLS read/write、assignment、activity/audit、service_role cases。

## `ProJED_TEST` DB Smoke 結果

- [x] `rls_read_owner/admin/project_manager/member/viewer`
- [x] `rls_read_nonmember_denied`
- [x] `rls_write_task_owner/admin/project_manager/member`
- [x] `rls_write_task_viewer_denied`
- [x] `rls_write_task_nonmember_denied`
- [x] `rls_project_manager_manages_members`
- [x] `assignment_update_member`
- [x] `assignment_load_pm`
- [x] `activity_write_member`
- [x] `activity_read_viewer`
- [x] `activity_write_viewer_denied`
- [x] `audit_write_pm`
- [x] `audit_read_owner`
- [x] `audit_read_member_denied`
- [x] `audit_write_member_denied`
- [x] `service_role_maintenance_read`

## 執行紀錄

- 2026-05-27：建立 ontology collaboration QC 腳本與 npm scripts。
- 2026-05-27：擴充 static checks 至 11 個 UI guard surface。
- 2026-05-27：因本機 `.env.local` 指向 production `ProJED`，DB smoke 改由 Supabase MCP 在 `ProJED_TEST` 執行。
- 2026-05-27：DB smoke 全數通過。

## 結論

通過。DEV-007 可標記完成。

## 2026-05-28 本輪 QA/QC 更新

- QA 計畫：檢查 invite created/revoked/accepted audit hook、role changed/member removed audit hook、task assignment activity event、log failure best-effort。
- QC 已執行：`npx.cmd tsc --noEmit`、`npm.cmd run build:test`、`npm.cmd run lint`、`npm.cmd run verify:ontology-collaboration`、`npx.cmd supabase migration list --local`。
- QC 結果：typecheck/build/lint/static QC 通過；lint 為 0 error、72 warnings；local Supabase 連線 `127.0.0.1:54322` 被拒，DB smoke 未執行。
- 阻塞：Owner invite log、viewer denied no-log、role before/after、remove target 仍需 DB smoke 驗證後才能勾選。
