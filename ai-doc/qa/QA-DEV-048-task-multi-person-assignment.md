# QA-DEV-048: 多人主責與協作指派驗證計畫

關聯 DEV: DEV-048
關聯 SPEC: `ai-doc/specs/SPEC-048-task-multi-person-assignment.md`
狀態: DEV-048 QA-QC Executed / TEST + Production Release Gate Passed / Supabase Alias Governance Residual Accepted / 2026-07-16 Active Primary Guard Removed
風險等級: P1 任務當責、資料相容、UI 防呆與 migration contract
建立日期: 2026-07-15
最近更新: 2026-07-16

使用思考習慣: #可驗證性、#批判思考、#極限情境

## 驗證目標

證明多人主責不是只改 UI，而是資料契約、互斥規則、報表篩選、活動紀錄、備份與 Supabase schema 一致:
- 多主責與多協作可被設定、保存與顯示。
- 主責 / 協作角色互斥。
- 任務可被刻意清成未指派；active 狀態不再阻擋清空主責。
- legacy `assigneeId` 仍可服務舊程式，且等於第一位主責。
- 多主責不造成任務篩選與報表重複計算。

## Test Layers

| Layer | Purpose | Required evidence |
|---|---|---|
| Static contract | types、normalizer、store、filter、backup、migration、Edge formatter | verifier output |
| Model/helper | 去重、互斥、alias、清空主責同步 | deterministic assertions |
| Type/build | TypeScript contract and Vite bundle | `tsc --noEmit`, `build:test` |
| Lint | changed TS/TSX hygiene | targeted ESLint |
| Browser UI | picker、checkbox、互斥、guard、visible error sweep | Playwright snapshot/screenshot |
| Supabase static | migration alias/static governance | `verify:supabase:static`, `verify:supabase:migration-aliases` |

## Zero-Tolerance Failures

| ID | Failure condition |
|---|---|
| ZT-048-001 | UI 仍只能設定一位主責 |
| ZT-048-002 | 同一人可同時存在於主責與協作 |
| ZT-048-003 | active task 清空最後一位主責時仍被 toast 或 store guard 阻擋 |
| ZT-048-004 | `assigneeId` 未同步到第一位主責 |
| ZT-048-005 | DB trigger 依 UUID 排序打亂使用者選取順序 |
| ZT-048-006 | 篩選只看 legacy `assigneeId`，漏掉第二位之後主責 |
| ZT-048-007 | 報表因多主責把同一任務計算多次 |
| ZT-048-008 | migration 允許主責與協作重疊 |
| ZT-048-009 | UI checkbox 被自訂視覺層遮住，使用者或自動化無法點選 |
| ZT-048-010 | visible console/page error、HTTP error banner 或 modal overflow |

## Test Cases

| ID | Scenario | Expected |
|---|---|---|
| MOD-048-001 | primary `[A, A, B]`, collaborator `[B, C]` | primary `[A, B]`, collaborator `[C]` |
| MOD-048-002 | update primary `[A, B]` | `assigneeId === A` |
| MOD-048-003 | active task clear all primary | accepted; alias cleared |
| MOD-048-004 | TODO task clear all primary | accepted |
| MOD-048-005 | completed / group / archived clear all primary | accepted |
| UI-048-001 | open task detail assignment picker | shows primary and collaborator checkbox sections |
| UI-048-002 | select two primary members | summary and checkbox state reflect both |
| UI-048-003 | select collaborator then select same person as primary | person removed from collaborator |
| UI-048-004 | uncheck the final primary on an active task | task becomes `未指派`, no blocking toast |
| UI-048-005 | select more than three primary members | warning visible, save not blocked |
| FILTER-048-001 | task has primary `[A, B]`, filter by B | task included once |
| BACKUP-048-001 | local package exports/imports task with `[A, B]` | both primary IDs preserved locally |
| DB-048-001 | migration trigger receives duplicate IDs | order-preserving dedupe |
| DB-048-002 | primary/collaborator overlap | overlap removed or check blocks invalid state |

## Required Commands

```powershell
npm.cmd run verify:dev-048-task-multi-person-assignment
npm.cmd exec tsc -- --noEmit
npm.cmd exec eslint -- src/components/TaskAssignmentPicker.tsx src/components/TaskDetailsModal.tsx src/components/Wbs/WbsNodeItem.tsx src/components/GlobalContextMenu.tsx src/store/useWbsStore.ts src/store/useRecordStore.ts src/utils/taskAssignments.ts src/features/taskFilters/assigneeOptions.ts src/features/taskFilters/predicates.ts src/features/taskFilters/types.ts src/features/backup/package.ts src/features/backup/types.ts src/services/backup/localTestBackupService.ts src/services/supabase/projedService.ts supabase/functions/match_project_knowledge/index.ts scripts/verify-dev-048-task-multi-person-assignment.ts
npm.cmd run verify:supabase:static
npm.cmd run verify:supabase:migration-aliases
npm.cmd run build:test
```

`verify:supabase:migration-aliases` 若失敗於未修改的舊 production source hash baseline，判定為 release governance residual；不得在 DEV-048 功能提交中直接重寫 baseline，除非另有 release/provenance 決策。

Browser QC must use real rendered UI at `http://127.0.0.1:4173/` and collect:
- visible error sweep: console errors = 0, no visible error banner.
- screenshot of picker after multi-primary interaction.
- evidence that test fixture is restored to seed state after mutation smoke.

## Release Gate Addendum

Release execution on 2026-07-15:
- ProJED-TEST migration applied; schema, trigger, function, disjoint check, GIN index and actual UUID-array trigger probe passed. TEST baseline had 158 rows, 0 legacy assignee rows, 0 overlap rows.
- Authenticated Level 3 preview passed: signed-in board loaded 158 tasks, task drawer opened, primary/collaborator multi-checkbox sections were visible, two primary members could be selected, and the fixture was restored to `未指派`. No final-owner control exists.
- Production migration applied and verified: 461 rows retained, 53 `assignee_ids` rows backfilled from `assignee_id`, alias mismatches 0, overlap rows 0; rollback-only trigger probe passed.
- Firebase production deploy and Level 4 smoke passed at `https://projed-cc78d.web.app`; root, hashed JS/CSS, service worker and critical error/request sweep passed.
- The five existing migration source hash mismatches remain an explicit release governance residual; this release did not rewrite those baselines. DEV-047 remote backup RPC full multi-primary persistence remains frozen/out of this release.
- Rollback evidence and exact rollback SQL are recorded in `ai-doc/release/PREPRODUCTION-DEV-048-20260715.md` and the ignored `output/release/` evidence files.
