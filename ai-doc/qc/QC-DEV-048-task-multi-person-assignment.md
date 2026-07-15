# QC-DEV-048: 多人主責與協作指派事實驗證

關聯 DEV: DEV-048
關聯 SPEC: `ai-doc/specs/SPEC-048-task-multi-person-assignment.md`
關聯 QA: `ai-doc/qa/QA-DEV-048-task-multi-person-assignment.md`
狀態: DEV-048 QC Passed / TEST + Production Release Gate Passed / Existing Supabase Alias Gate Residual
風險等級: P1 任務當責、資料相容、UI 防呆與 migration contract
驗證日期: 2026-07-15

## 驗證結論

- 判定：DEV-048 本機 RD implementation、targeted QC、TEST authenticated Level 3、production migration 與 Firebase Level 4 通過；一項共用 Supabase alias governance gate 因既有舊 migration hash mismatch 失敗，非本輪檔案 diff，已保留為 release residual。
- 已證明：多位主責、多位協作、互斥、active task last-primary guard、legacy alias、filter/report local contract、local backup contract、Supabase migration static contract與瀏覽器 UI smoke。
- 已補證明：ProJED-TEST migration、實際 UUID-array trigger probe、authenticated preview Level 3、production migration、production REST schema probe 與 Firebase production Level 4。

## RD 實作事實

- `TaskNode` 新增 canonical `assigneeIds`，保留 `assigneeId` legacy alias。
- `taskAssignments` helper 統一處理去重、互斥、alias 與 active task guard。
- `TaskAssignmentPicker` 以 native checkbox 實作主責與協作複選，避免自訂視覺層攔截點擊。
- `useWbsStore` 在 set/add/update 套用 normalization，並阻擋 active task 清空最後主責。
- `projedService` 讀寫 `assignee_ids` 與 legacy `assignee_id`。
- migration `20260715143000_task_multi_person_assignment.sql` 增加 `assignee_ids`、order-preserving trigger、互斥 check 與 GIN index。
- filters、activity formatter、local backup package、local test backup adapter 與 Edge knowledge formatter 均支援多主責。

## 執行證據

| Gate | Result | Evidence |
|---|---|---|
| `npm.cmd run verify:dev-048-task-multi-person-assignment` | Pass | helper normalization、active guard、migration static、picker/static filter contract |
| `npx tsc --noEmit` | Pass | TypeScript contract |
| targeted ESLint | Pass with existing warnings only | `_options`、`_legacyTaskLinkNodeIds`、`_source`、`lists`、`dependencies` 既有 unused warnings |
| `npm.cmd run verify:supabase:static` | Pass | 26 required migration snippets found |
| `npm.cmd run verify:supabase:migration-aliases` | Fail, existing residual | 5 unmodified old production source hash mismatches: `20260630060610`, `20260630060727`, `20260701005406`, `20260701010144`, `20260702094146` |
| `npm.cmd run build:test` | Pass | Vite test build generated PWA assets; Browserslist data warning only |
| Browser UI smoke | Pass | multi primary + collaborator checkbox、互斥、last-primary guard、0 console errors |
| Screenshot | Captured | `output/playwright/dev048-assignment-picker.png` |
| Test fixture cleanup | Pass | `qc-card-1` restored to seed `未指派`; undo/redo disabled after reload |
| TEST remote migration | Pass | 158 rows; schema/trigger/function/check/index present; alias mismatch 0; overlap 0; rollback-only UUID-array probe passed |
| TEST authenticated Level 3 preview | Pass | signed-in board 158 tasks; task drawer + two multi-select sections; two primary selection and restoration to `未指派` |
| Production remote migration | Pass | 461 rows; 53 `assignee_ids` backfilled; alias mismatch 0; overlap 0; rollback-only UUID-array probe passed |
| Production Level 4 | Pass | `https://projed-cc78d.web.app`; hashed JS/CSS, service worker, critical console/page/request sweep passed |

## Browser Facts

Environment:
- URL: `http://127.0.0.1:4173/`
- Session: `dev048-assignment`
- Account: `test@projed.local`
- Board: `ProJED 品質驗證測試看板`

Observed:
- `主責／協作` picker displays `主責成員（可複選）` and `協作成員（可複選）`.
- Selecting two primary members updates the selected state.
- Selecting a collaborator, then selecting the same person as primary, removes that person from collaborators.
- Attempting to uncheck the last primary on an active delayed task is blocked; checkbox remains checked.
- Console errors remained 0 during the flow; only existing warnings were present.
- After QC, local test fixture `qc-card-1` was restored to `未指派`.

## Requirement Verification Matrix

| Requirement | Result | QC fact |
|---|---|---|
| Multi primary | Pass | UI and helper accept multiple primary IDs |
| Multi collaborator | Pass | UI and helper accept multiple collaborator IDs |
| Mutual exclusion | Pass | helper and UI remove collaborator overlap when promoted to primary |
| Active task primary guard | Pass | store/picker blocks clearing final primary for active statuses |
| Legacy compatibility | Pass | `assigneeId` mirrors first primary |
| Order preservation | Pass | helper preserves input order; migration uses `with ordinality` |
| Filter/report dedupe | Pass | filter predicate checks `assigneeIds.some(...)` and task remains one record |
| Local backup | Pass | portable task supports `assigneeIds`; local adapter preserves known users |
| Supabase schema source | Pass | migration includes column, trigger, disjoint check and GIN index |
| Final responsible out of scope | Pass | no final owner / accountable owner field added |

## Residual Risks

- `verify:supabase:migration-aliases` has an existing 5-file production source hash mismatch outside the DEV-048 diff; release gate must resolve or explicitly accept that governance state before deployment.
- Existing remote DEV-047 backup RPC source may still be first-primary compatible only until a new RPC migration/release updates its package contract.
- Production release artifact and rollback evidence are recorded in `ai-doc/release/PREPRODUCTION-DEV-048-20260715.md`; the ignored `output/release/` files contain the environment baselines.
- Browser smoke covered desktop current viewport; additional mobile viewport can be added at release gate if this picker becomes a mobile-critical workflow.

## Release Decision

- DEV-048 local implementation: pass.
- TEST migration + authenticated Level 3: pass.
- Production migration + Firebase deploy + Level 4: pass.
- Release residual: five existing migration source hash mismatches remain unchanged; DEV-047 remote backup RPC full multi-primary persistence remains outside this release.
