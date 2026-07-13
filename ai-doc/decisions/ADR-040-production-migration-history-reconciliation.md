# ADR-040: Production migration history reconciliation

狀態：Accepted / Source Reconciled / Production Mutation Pending
日期：2026-07-13
範圍：Supabase migration provenance、ProJED / ProJED-TEST release gate

## Context

Production migration history原有16個local-only與12個remote-only。`supabase migration fetch`已從production history table還原12份remote statements，確認remote-only不是未知變更：7份對應repo中不同timestamp的canonical migration，5份是production已套用但repo遺失的quick memo、personal task zone與workbench staging migration。

直接把7份remote SQL加入主migration序列會讓fresh database重複建立table、policy或function。因此沿用ADR-039的comment-only alias pattern；canonical migration仍是fresh database唯一DDL來源。5份production獨有migration則保留remote原始SQL與SHA-256，讓ProJED-TEST及fresh database可建立同等schema。

## Decision

### Production remote aliases

| Production history version | Canonical migration | Evidence |
|---|---|---|
| `20260529091003` | `20260529123000_calendar_subscription_selected_assignees.sql` | local variable rename + redundant semicolon |
| `20260530064014` | `20260530070000_backfill_board_workspace_admin_members.sql` | redundant semicolon only |
| `20260603093328` | `20260603090000_board_role_permissions.sql` | redundant semicolon only |
| `20260610053318` | `20260604100000_meeting_work_records.sql` | redundant semicolon only |
| `20260610053351` | `20260604103000_record_rag_visibility_guard.sql` | redundant semicolon only |
| `20260610053408` | `20260604104000_record_rag_sync_jobs.sql` | redundant semicolon only |
| `20260618093025` | `20260618120000_controlled_project_workspace_transfer.sql` | equivalent variable/array/conflict-target syntax |

Alias必須comment-only，並保存remote source SHA-256與canonical hash。`verify:supabase:migration-aliases`同時檢查11份TEST/production aliases與5份production source migration，防止來源漂移或alias誤含可執行SQL。

### Recovered production source migrations

- `20260630060610_cloud_quick_memo_inbox_items.sql`
- `20260630060727_harden_quick_memo_inbox_items_privileges.sql`
- `20260701005406_dev_040_personal_task_zone.sql`
- `20260701010144_fix_dev_040_personal_task_zone_conflict.sql`
- `20260702094146_dev_042_workbench_staging.sql`

這5份migration是production history的原始SQL，不是alias。2026-07-13已在新的TEST schema/data backup後套用到ProJED-TEST；TEST migration list目前38/38 local/remote一致。

## Production execution contract

Production mutation前必須再次取得獨立高風險確認。獲准後分兩段執行：

1. 只修復history，將下列11個已證明等價或comment-only的local version標記`applied`：`20260526070442`、`20260527102701`、`20260527102808`、`20260527102841`、`20260529123000`、`20260530070000`、`20260603090000`、`20260604100000`、`20260604103000`、`20260604104000`、`20260618120000`。
2. 重新執行`migration list`與`db push --dry-run`。唯一允許剩下的pending migrations是：`20260629113000`、`20260706091804`、`20260706162052`、`20260711171058`、`20260713033000`。

History repair前後production `public/private` schema SHA-256必須完全相同。若dry-run出現其他migration、schema hash改變、remote-only重現或migration順序不符，立即停止，不進入DB push。

## Edge provenance

2026-07-13下載比對顯示ProJED-TEST `calendar-feed/index.ts`與`ics.mjs`逐檔SHA-256完全等於repo；無需重部署TEST Edge。Production下載內容較舊，hash不同是尚未部署v3 matcher的預期release差異，不得用version number相同推論source相同。

## Recovery

- TEST migration前備份：`output/preproduction/20260713-150100/test-public-private-schema-before.sql`與`test-public-private-data-before.sql`。
- Production現有schema/data dump與Edge source是rollback baseline；production history repair、DB push、Edge deploy及Firebase live deploy維持獨立Gate。
- DB migration失敗時停止後續Edge/Hosting；優先依備份與forward-compatible migration處理，不猜測repair或直接刪除history。
