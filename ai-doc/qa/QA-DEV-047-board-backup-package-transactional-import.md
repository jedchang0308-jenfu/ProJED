# QA-DEV-047: 看板備份套件 V2 與交易式匯入驗證計畫

關聯 DEV: DEV-047
關聯 SPEC: `ai-doc/specs/SPEC-047-board-backup-package-transactional-import.md`
關聯 ADR: `ai-doc/decisions/ADR-041-board-backup-package-v2-transactional-import.md`
狀態: Local QA-QC Executed and Passed / Level 3 Not Executed / Release Gate Required
風險等級: P0 資料完整性、破壞性匯入、權限與 partial-write
建立日期: 2026-07-14
最近更新: 2026-07-14

使用思考習慣: #可驗證性、#證據基礎、#極限情境、#失敗導向

## 驗證目標

證明 DEV-047 不是只有 UI 對稱，而是具備下列可觀察事實:
- V2 備份來自 backend canonical board data，範圍與 manifest 一致。
- copy mode 可建立資料等價但 ID 隔離的新看板，且不修改來源。
- same-origin replace 是 all-or-nothing；任何失敗、權限不足、並行修改或不相容都在 mutation 前停止或完整 rollback。
- 使用者在按下最終 CTA 前能理解來源、版本、包含/排除、目標、模式與 create/update/delete/keep 數量。
- legacy global/ambiguous 檔案不再直接攤平成目前看板。

## Test Layers

| Layer | Purpose | Required evidence |
|---|---|---|
| Static contract | module ownership、禁用 legacy direct path、RPC/migration security contract | verifier output + source references |
| Model/unit | schema、canonicalization、checksum、legacy adapter、ID map、planner | deterministic fixtures |
| Local DB transaction | atomicity、idempotency、fingerprint、role/reference checks | before/after counts + hashes + injected failures |
| Browser | inspect-first、copy default、advanced replace、error/report、viewport | Playwright trace/screenshots/DOM metrics |
| Regression | DEV-038 settings、board/task/tag/dependency behavior | existing + DEV-047 gates |
| Level 3/release | Supabase TEST migration/RPC/RLS + Firebase preview | only after explicit release command |

## Fixtures

至少準備:
- Source board A：active/archived task、Level 1-4 tree、detail notes、dates/status、kanban stage、assignee/collaborator、3 tags、valid dependencies。
- Target workspace B：同名同色 tag、同名不同色 tag、缺少 source member、同名 board。
- Same-origin target A：備份後新增/修改/刪除 tasks，用於 replace diff。
- Record-linked target：package 不含的 target task 仍有 `record_task_links`。
- Legacy fixtures：`wbs-1.0/1.1/1.2/2.0/unversioned`，包含可抽出單看板與多看板 ambiguous 兩類。
- Invalid fixtures：non-JSON、unsupported version、missing fields、dangling parent、cycle、dangling dependency、duplicate ID、checksum tampered、oversize。
- Roles：owner/admin/member/viewer/outsider 或專案既有等價角色矩陣。

每個 mutating DB test 必須使用標記清楚、可 cleanup 的 TEST/local fixture；不得對 production 真實使用者看板執行。

## Zero-Tolerance Failures

| ID | Failure condition |
|---|---|
| ZT-047-001 | UI 選檔後尚未 inspect/plan 就開始 mutation |
| ZT-047-002 | export 仍把 Zustand 已載入資料宣稱為完整/全域備份 |
| ZT-047-003 | copy mode 修改來源看板或重用造成跨看板 collision 的 task ID |
| ZT-047-004 | cross-origin/ambiguous legacy 可執行 replace current board |
| ZT-047-005 | injected row failure 後 target count/fingerprint 與執行前不同 |
| ZT-047-006 | client 在 RPC 成功前改動 canonical nodes/store |
| ZT-047-007 | viewer/outsider 可 export 不可讀 board、建立 board 或 replace data |
| ZT-047-008 | 匯入建立 membership、提高 role、還原 token/secret |
| ZT-047-009 | target fingerprint 已變更仍執行舊 plan |
| ZT-047-010 | out-of-package record link 會被移除但 replace 仍可繼續 |
| ZT-047-011 | checksum mismatch 可被忽略或仍顯示執行 CTA |
| ZT-047-012 | verification mismatch 仍顯示「匯入成功」 |
| ZT-047-013 | duplicate submit 建立兩張看板或重複資料 |
| ZT-047-014 | 320/390px 危險 CTA 被裁切、誤設 primary、或未顯示目標/刪除量 |

## Static Contract Gate

建議命令:

```powershell
npm.cmd run verify:dev-047-backup-package-contract
```

Required checks:
- 存在獨立 `src/features/backup` domain module，不把 validator/planner 寫在 `SettingsView.tsx`。
- V2 UI 不直接呼叫 `useWbsStore.exportData/importData`。
- V2 export adapter 使用 backend canonical read。
- Package type 固定 `format: 'projed-backup'`、`schemaVersion: 2`、manifest/checksum/exclusions。
- Legacy parser 只由 `LegacyBackupAdapter` 暴露，不能直接呼叫 executor。
- copy 是 UI 預設，replace 有 advanced/danger styling、same-origin gate 與 typed confirmation。
- Supabase function migration 固定 `search_path`、revoke public、grant authenticated、檢查 `auth.uid()` 與 tenant membership。
- RPC contract 含 execution ID、expected fingerprint、result counts/post fingerprint。
- production code 不以 `.catch(console.error)` 吞掉 import row failure。
- package scripts 註冊 DEV-047 contract/model/local DB/browser gates。

## Model And Package Tests

建議命令:

```powershell
npm.cmd run verify:dev-047-backup-package-model
```

| ID | Scenario | Expected |
|---|---|---|
| MOD-047-001 | 同一 payload 不同 object key/order | canonical payload 與 SHA-256 相同 |
| MOD-047-002 | 改一個 task title 後沿用舊 checksum | `CHECKSUM_MISMATCH`，0 mutation |
| MOD-047-003 | active + archived + detail notes + dependencies + tags | manifest counts 與 payload 完全一致 |
| MOD-047-004 | secret/token/storageId/signed URL 欄位注入 | validator/serializer 移除或拒絕，輸出不可含敏感欄位 |
| MOD-047-005 | dangling parent / cycle / duplicate task ID | inspection blocked |
| MOD-047-006 | dangling dependency endpoint | inspection blocked，不靜默丟棄 |
| MOD-047-007 | 10 MiB 邊界、10,000 tasks、30,000 dependencies | 等於上限按規格處理；超過立即阻擋 |
| MOD-047-008 | copy ID map with Level 4 tree/dependencies | 所有 ID 新建；parent/endpoints 映射正確 |
| MOD-047-009 | target 同名 tag / 同名異色 / missing tag | reuse/reuse-with-warning/create 結果 deterministic |
| MOD-047-010 | target 缺 source assignee/collaborator | 引用清除並列入 report，不新增 member |
| MOD-047-011 | legacy 可辨識單看板 | 先轉 V2 inspection，再允許 copy plan |
| MOD-047-012 | legacy 多看板/無可靠 scope | `LEGACY_SCOPE_AMBIGUOUS`，executor 不可達 |
| MOD-047-013 | unsupported schema version | 顯示 unsupported，不猜測解析 |
| MOD-047-014 | manifest count 與 payload 不一致 | inspection blocked |

## Local DB Transaction Matrix

建議命令:

```powershell
npm.cmd run verify:dev-047-backup-transaction-local-db
```

### Copy mode

| ID | Scenario | Expected evidence |
|---|---|---|
| DB-047-C01 | owner copy A to workspace B | 新 board 建立；normalized content equality passed |
| DB-047-C02 | duplicate execution ID retry | 回傳同一 result；不新增第二 board/rows |
| DB-047-C03 | failure after board insert | transaction rollback；target 無殘留 board/tasks/tags |
| DB-047-C04 | failure during deep task insert | transaction rollback；source/target counts unchanged |
| DB-047-C05 | failure during dependency/tag assignment | transaction rollback；無 partial rows |
| DB-047-C06 | viewer/outsider target | permission denied；0 mutation；不洩漏 target details |
| DB-047-C07 | source deleted after inspect | execute conflict/not found；0 mutation |

### Replace mode

| ID | Scenario | Expected evidence |
|---|---|---|
| DB-047-R01 | same-origin valid replace | target board identity/title/member/calendar unchanged；tasks/deps/tag assignments 等於 package |
| DB-047-R02 | package source != target | preflight blocked；0 mutation |
| DB-047-R03 | target changed after plan | `TARGET_CHANGED`；fingerprint/counts unchanged |
| DB-047-R04 | record-linked task would be removed | `OUT_OF_PACKAGE_REFERENCE`；0 mutation |
| DB-047-R05 | retained task has record link | task upsert preserves ID；record link remains |
| DB-047-R06 | failure during update/delete/insert/dependency | full rollback；pre/post fingerprint identical |
| DB-047-R07 | pre-replacement export fails | RPC not called；target unchanged |
| DB-047-R08 | viewer/member without destructive role | permission denied；0 mutation |
| DB-047-R09 | two replace requests race | one valid outcome；other target changed/idempotent；no mixed state |
| DB-047-R10 | verification count/hash mismatch injection | result not marked success；correlation ID recorded |

### Permission/security matrix

| Role | Read/export | Copy to allowed workspace | Replace same-origin | Expected |
|---|---:|---:|---:|---|
| Owner/admin | allowed | allowed | allowed | server-confirmed |
| Editable member | per existing capability | per create capability | denied unless explicit destructive capability | no UI-only trust |
| Viewer | read only if allowed | denied | denied | 0 mutation |
| Outsider | denied | denied | denied | no existence leakage |
| Signed out | denied | denied | denied | auth required |

## Browser Workflow Matrix

建議命令:

```powershell
npm.cmd run verify:dev-047-backup-package-browser
```

Viewports: 1440x900、1024x768、390x844、320x844。

| ID | Operation | Expected |
|---|---|---|
| UI-047-001 | 開啟備份頁 | 頁籤為「備份、還原與資料移轉」；建立/匯入兩個清楚 section |
| UI-047-002 | 選擇來源看板 | counts 載入前 download disabled；完成後顯示 includes/excludes |
| UI-047-003 | 下載 V2 | filename/scope/version 正確；不顯示全域/完整帳號備份字樣 |
| UI-047-003A | 選擇全部看板並下載 | 逐張看板建立狀態可見；CTA 觸發每張看板各一個單看板 `.backup.json`；部分失敗不得誤稱全數完成 |
| UI-047-004 | 選擇 valid V2 file | 只做 inspect；顯示 source/time/version/checksum/counts/exclusions |
| UI-047-005 | inspect 後進入 plan | 預設 `複製成新看板`；target workspace/title 可確認 |
| UI-047-006 | valid copy execute | 防重送；完成後顯示 target link、created counts、warnings |
| UI-047-007 | same-origin replace | advanced action；顯示 update/delete/keep、pre-backup、typed board title confirmation |
| UI-047-008 | cross-origin replace | 不顯示可執行 CTA；提供 copy path |
| UI-047-009 | tampered/invalid/oversize | blocking error；無 execute CTA；目前資料不變 |
| UI-047-010 | target changed | plan 失效，要求重新整理，不自動重試 mutation |
| UI-047-011 | execution rollback | 明示未變更/已 rollback、correlation ID；不顯示 success |
| UI-047-012 | legacy ambiguous | 顯示舊版檔與 scope 限制，不提供目前看板覆寫 |
| UI-047-013 | unresolved member/tag warning | 顯示確切數量與處理規則，不以 generic warning 取代 |
| UI-047-014 | refresh/back during execute | 不重送；回到頁面可取得 execution result 或安全重查 |
| UI-047-015 | 320/390 responsive | 無水平 overflow、nested cards、文字/CTA 裁切；danger action 非 primary |

Visible error sweep:
- `[role=alert]` 僅在預期錯誤出現。
- 無 runtime error、Unhandled Promise、Not Found、Internal Server Error。
- `document.documentElement.scrollWidth <= clientWidth`。
- modal/drawer/popover 不超出 viewport；focus 可返回觸發元件。

## Round-Trip Acceptance

Normalized comparison 不比較 execution-generated IDs/timestamps，但必須比較:
- board title in copy mode。
- task tree shape、order、type、title、description/detail notes、status、dates、archive、kanban stage。
- tag semantic mapping 與每個 task 的 tag set。
- dependency graph endpoints/sides/offset。
- valid assignee/collaborator references，及 unresolved report。

Copy acceptance:
- source before hash === source after hash。
- target normalized payload === package normalized payload。
- source IDs 與 target IDs 交集為 0，workspace-level reused tag IDs 除外。

Replace acceptance:
- target board identity/title/membership unchanged。
- target package-governed normalized payload === backup payload。
- retained source task IDs preserved。
- removed target-only tasks/dependencies count === plan。

## Regression Gate

Required after implementation:

```powershell
npm.cmd run verify:dev-047-backup-package-contract
npm.cmd run verify:dev-047-backup-package-model
npm.cmd run verify:dev-047-backup-transaction-local-db
npm.cmd run verify:dev-047-backup-local-supabase
npm.cmd run verify:dev-047-backup-package-browser
npm.cmd run verify:dev-038-settings-scope-consistency
npm.cmd run verify:dev-038-settings-scope-consistency-browser
npm.cmd run verify:settings-project-context
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
npm.cmd run build
```

## Local Execution Result - 2026-07-14

| Gate | Result | Evidence |
|---|---|---|
| Static contract | Passed `30/30` | Domain/UI/backend/migration/type/verifier contracts；含 File 讀取前 size gate |
| Package model | Passed `10/10` scenario groups | canonical checksum、strict metadata、tamper、tree/stage/dependency/tag integrity、exact limits、legacy、semantic readback |
| Local transaction | Passed `9/9` | copy isolation、idempotency、role matrix、reference/fingerprint blockers、injected rollback、replace preservation |
| Isolated Supabase | Passed | migration/RPC security contract與 transaction matrix；含 role retention、tag color warning、legacy stage map、cross-tenant collision、audit；transaction rollback + temp DB cleanup |
| DEV-047 browser | Passed | 真實單看板下載、全部看板多檔下載、上傳/inspect/copy/replace/pre-backup/readback；tamper/cross-origin/ambiguous legacy；1440/1024/390/320 |
| DEV-038 regression | Static `20/20` + browser passed | 新 round-trip IA 未破壞 permissions/calendar/app/recycle-bin scope workflow |
| Settings context | Passed `6/6` | active workspace/board context |
| Source/build | Passed | targeted ESLint、`tsc --noEmit`、`build:test`、`build` |

Browser evidence:
- `output/playwright/dev-047-backup-package/1440-all-board-batch.png`
- `output/playwright/dev-047-backup-package/1440-inspection.png`
- `output/playwright/dev-047-backup-package/1024-copy-plan.png`
- `output/playwright/dev-047-backup-package/390-copy-success.png`
- `output/playwright/dev-047-backup-package/1440-replace-plan.png`
- `output/playwright/dev-047-backup-package/1440-replace-success.png`
- `output/playwright/dev-047-backup-package/390-cross-origin-inspection.png`
- `output/playwright/dev-047-backup-package/320-tampered-error.png`

完整事實與殘留 release 邊界記錄於 `ai-doc/qc/QC-DEV-047-board-backup-package-transactional-import.md`。

Conditional:
- Run DEV-035/036 role/workspace gates if RD changes membership/board service policy paths。
- Run DEV-037/045 calendar subscription gates if replace behavior touches board identity or calendar subscription rows。
- Run DEV-040 bounded-failure gate if shared backend error handling changes。
- Run record/RAG regression if preflight reads or migration touches `record_task_links`/records policies。

## Level 3 And Production Gate

DEV-047 changes Supabase migration/RPC/RLS/data mutation semantics, therefore release classification is `Level 3 Required`.

執行狀態: `Not Executed`。原因是本輪是 DEV 開發與本機 QA/QC，不包含 remote TEST、preview 或 production release 授權；這不阻擋 Phase 1 開發結案，但會阻擋任何 production deploy 宣稱。

Before production deployment:
- Use `ProJED-TEST` backup and controlled fixture。
- Apply migration and verify migration history/provenance。
- Execute owner/admin/member/viewer/outsider matrix against remote RLS/RPC。
- Execute copy, same-origin replace, failure injection/rollback, idempotency, concurrency and cleanup。
- Build staging artifact against TEST, deploy Firebase `level3-smoke` preview, execute authenticated browser flow。
- Record exact commit/artifact/migration/RPC provenance and rollback readiness。

Production deployment, production mutation and Level 4 smoke are not authorized by this QA plan; they require an explicit release instruction and `deployment-release-gate`.

## QC Evidence Required

- Static/model/local DB/browser command outputs with pass counts。
- V2 sample manifest with sensitive values redacted。
- Before/after DB counts and fingerprints for copy/replace/rollback/idempotency/concurrency。
- Role matrix results and RLS/RPC contract query。
- Screenshots for 1440/1024/390/320 inspect/plan/success/error states。
- Evidence that legacy ambiguous and tampered packages cannot reach executor。
- Source-unchanged proof for copy and target-unchanged proof for every blocked/failed replace。
- Cleanup evidence with fixture residual count 0。
- Skipped cases explicitly marked `Not Executed` with reason；不得留白或推測通過。

## Stop Conditions

- 任一 zero-tolerance case 失敗。
- Transaction failure injection 無法證明 fingerprint/counts 完全回復。
- 進入 release 時，remote role/RLS matrix 未通過。
- Browser 只能測 DOM，沒有真實匯出、inspect、plan、execute、reload、verify 操作。
- Legacy ambiguous、cross-origin replace 或 checksum mismatch 仍能呼叫 mutation endpoint。
- TEST fixture 無備份/cleanup path，或 production artifact provenance 不明。
- 未取得 production deploy 明確授權。
