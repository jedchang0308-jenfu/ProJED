# QC-DEV-025: 受控跨工作區移動專案 DB Gate

關聯 DEV: DEV-025
關聯 SPEC: `ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md`
關聯 QA: `ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md`
狀態: DB Read-only Preflight Passed / Mutating Role-Data QC Pending
日期: 2026-07-07

## QC 結論

DEV-025 production Supabase read-only preflight 已通過。正式 DB 已存在 `preview_project_workspace_transfer` / `move_project_to_workspace` RPC、execute grants 與 composite FK constraints；因此下一步不是重複套 migration，而是建立安全測試資料與 rollback/cleanup 流程後，執行實際搬移 role matrix、RLS、audit log、資料一致性與 RAG visibility QC。

2026-07-07 已補 guarded fixture-readiness harness：`scripts/verify-dev-025-mutating-qc-fixture-readiness.mjs` / `npm.cmd run verify:dev-025-mutating-qc-fixture-readiness`。此 harness 預設只讀、`mutates_database=false`，要求 source workspace、target workspace、denied workspace 與 project 都有 `DEV-025` / `QC-DEV-025` 名稱或 metadata 標記，並檢查 QA 要求的最小 fixture shape；未提供安全 fixture IDs 時不得進入 mutating RPC QC。

本輪未執行任何 production DDL / DML。

## Supabase Read-only Evidence

Target project:
- Project: `ProJED`
- Project ref: `knodlkxqpcqyrtgwpdst`
- Status: `ACTIVE_HEALTHY`
- Postgres: 17

Remote migration history:
- Remote migration list 已含 `controlled_project_workspace_transfer`，版本為 `20260618093025`。
- Local source migration 檔名為 `supabase/migrations/20260618120000_controlled_project_workspace_transfer.sql`；版本號和 remote history 不同，但 remote function/constraint preflight 顯示 schema 已具備 DEV-025 所需結構。

Read-only DB checks:

| Check | Result |
|---|---|
| `public.preview_project_workspace_transfer(uuid, uuid, uuid)` exists | Pass |
| `public.move_project_to_workspace(uuid, uuid, uuid, text)` exists | Pass |
| `anon` execute preview/move | Pass, both false |
| `authenticated` execute preview/move | Pass, both true |
| `service_role` execute preview/move | Pass, both true |
| `board_invites_project_tenant_fk` exists | Pass |
| `board_role_permissions_tenant_id_project_id_fkey` exists | Pass |
| Preview function checks source manager | Pass |
| Preview function checks target workspace admin | Pass |
| Preview function checks transfer lock | Pass |
| Preview function counts pending invites | Pass |
| Move function checks source manager | Pass |
| Move function checks target workspace admin | Pass |
| Move function checks project-name confirmation | Pass |
| Move function writes project activity event | Pass |
| Move function writes source/target audit logs | Pass |
| Move function queues RAG sync job | Pass |
| Move function revokes pending invites | Pass |
| Move function remaps tags | Pass |

Local source gate:
- `npm.cmd run verify:dev-025-project-workspace-transfer`: Pass, 11 checks.
- `npm.cmd run verify:dev-025-mutating-qc-fixture-readiness -- --self-check`: Pass, harness contract self-check only；未連線 DB、未讀資料、未 mutation。

## Remaining DB QC

Not executed in this read-only pass:
- Create or identify a safe production/staging test dataset with source workspace, target workspace, target denied workspace, board members, tags, dependencies, records, documents/RAG rows and pending invite.
- Run `verify:dev-025-mutating-qc-fixture-readiness` with real safe fixture IDs.
- Execute `preview_project_workspace_transfer` as source board manager + target workspace admin.
- Verify denied cases for source member, target workspace member-only, viewer/outsider and transferLocked project.
- Execute `move_project_to_workspace` on safe test data and verify transaction result.
- Verify source-only member loses access and target admin/member access follows target workspace/project roles.
- Verify old pending invite token is revoked.
- Verify source and target audit logs.
- Verify RAG visibility no longer exposes moved project through the source workspace.
- Cleanup/rollback test artifacts or document retained fixture IDs.

## Resume Condition

Continue DEV-025 DB QC only after one of the following is available:

- Preferred: staging / Supabase branch / disposable workspace fixture where destructive move can be tested without production data risk.
- Production-safe path: explicit safe test workspace/board fixture and cleanup plan; no real customer board should be moved for QC.
- Risk-accepted path: user explicitly accepts production data mutation risk for the selected fixture and the QC report records rollback/cleanup evidence.
