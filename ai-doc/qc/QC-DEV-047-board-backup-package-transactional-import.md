# QC-DEV-047: 看板備份套件 V2 與交易式匯入事實驗證

關聯 DEV: DEV-047
關聯 SPEC: `ai-doc/specs/SPEC-047-board-backup-package-transactional-import.md`
關聯 QA: `ai-doc/qa/QA-DEV-047-board-backup-package-transactional-import.md`
關聯 ADR: `ai-doc/decisions/ADR-041-board-backup-package-v2-transactional-import.md`
狀態: Local Automated QC Passed / Isolated Supabase Transaction Passed / Level 3 Not Executed / Production Not Deployed
風險等級: P0 資料完整性、破壞性匯入、權限與 partial-write
驗證日期: 2026-07-14

## 驗證結論

- 判定：DEV-047 Phase 1 本機開發與自動化 QC 通過；本輪未發現未關閉的 P0/P1 功能驗收缺陷。
- 已證明：單看板 V2 package、全部看板批次下載多個單看板檔案、strict inspection、copy 預設、同源 replace 防呆、atomic transaction、權限與 reference gate、semantic readback、四種 viewport UI 均符合 SPEC。
- 未證明：Supabase TEST 遠端套版、Firebase preview、正式環境 migration/deploy、production smoke 與 rollback drill；因此不得宣稱已部署或 production ready。

## RD 實作事實

- `src/features/backup` 擁有 V2 schema、canonical serializer/checksum、strict validator、legacy adapter、planner、application orchestration 與 semantic verification。
- `BackupSettings` 以 backend canonical read 建立單看板備份；「全部看板」只逐張建立多個單看板 V2 package，不建立混合多看板 package；選檔後只 inspect/plan，不直接修改 Zustand 或 backend。
- `copy_to_new_board` 是預設模式；`replace_current_board` 僅允許同源 package，需輸入目標看板名稱並在 mutation 前自動下載前置備份。
- Supabase 以 `import_board_backup_v2` 單一 `SECURITY DEFINER` import RPC 執行 transaction，固定空 `search_path`、使用 fully-qualified relation、撤銷 PUBLIC/anon 並只授權 authenticated。
- RPC 檢查 auth、tenant/board role、source/target identity、expected fingerprint、execution ID、out-of-package record link 與跨租戶 ID collision；任一例外由 PostgreSQL transaction rollback。
- local-test adapter 實作相同 all-or-nothing、role、idempotency、reference 與 fingerprint 契約，且 copy 不提升建立者既有角色。
- Firebase backend 無等價交易能力時只允許 inspect，不開放執行匯入。

## 執行證據

| Gate | Result | Evidence |
|---|---|---|
| `npm.cmd run verify:dev-047-backup-package-contract` | Pass, `30/30` | domain/UI/backend/migration/type/verifier static contract |
| `npm.cmd run verify:dev-047-backup-package-model` | Pass, `10/10` scenario groups | canonical checksum、strict metadata、tamper、tree/stage/dependency/tag integrity、exact limits、legacy、semantic readback |
| `npm.cmd run verify:dev-047-backup-transaction-local-db` | Pass, `9/9` | copy isolation、idempotency、role matrix、reference/fingerprint blockers、failure rollback、replace preservation |
| `npm.cmd run verify:dev-047-backup-local-supabase` | Pass | isolated temporary DB migration + RPC matrix committed inside outer rollback；temporary DB removed |
| `npm.cmd run verify:dev-047-backup-package-browser` | Pass | real single-board download、all-board multi-download、upload、inspect no mutation、copy/replace/readback、tamper/legacy blockers、RWD、0 console/page errors |
| `npm.cmd run verify:dev-038-settings-scope-consistency` | Pass, `20/20` | Settings IA regression |
| `npm.cmd run verify:dev-038-settings-scope-consistency-browser` | Pass | Settings browser regression |
| `npm.cmd run verify:settings-project-context` | Pass, `6/6` | current board/workspace context regression |
| targeted ESLint + `npm.cmd exec tsc -- --noEmit` | Pass | changed TypeScript/TSX files and type contracts |
| `npm.cmd run build:test` + `npm.cmd run build` | Pass | test and production Vite builds；Browserslist data warning only |

## Requirement Verification Matrix

| Requirement | Result | QC fact |
|---|---|---|
| Canonical board-only export | Pass | package scope and manifest originate from backend board snapshot, not loaded Zustand subset |
| Package integrity and limits | Pass | SHA-256 canonical payload、10 MiB、10,000 tasks、30,000 dependencies；tamper/oversize blocked before executor |
| Strict relationships | Pass | duplicate/dangling IDs、parent cycle、kanban stage、dependency endpoint、tag reference and collaborator reference are rejected |
| Legacy safety | Pass | supported single-board WBS formats adapt through inspection；ambiguous multi-board files cannot execute |
| Copy isolation | Pass | new board/task/dependency IDs；source fingerprint unchanged；no cross-board task ID intersection |
| Replace guardrails | Pass | same-origin only、typed board name、pre-replacement backup、expected fingerprint and record-link blocker |
| Atomicity and idempotency | Pass | injected failure leaves pre-state fingerprint/counts unchanged；duplicate execution returns one result |
| Permission and tenancy | Pass | owner/admin/PM allowed；member/viewer/signed-out denied；no membership or role elevation；foreign task collision cannot move/delete data |
| Tag behavior | Pass | same normalized name reuses target tag；different color retains target color and reports warning |
| Semantic readback | Pass | content/tree/kanban/tags/dependencies/people and post-write fingerprint are verified after backend reload |
| UI communication and RWD | Pass | source/version/include/exclude/target/mode/counts/report/error visible；320/390/1024/1440 no horizontal overflow or clipped CTA |
| All-board batch export | Pass | two-board local fixture produced two distinct `.backup.json` downloads；each package retained `scope.type === 'board'` and covered one board ID |

## Browser Evidence

- `output/playwright/dev-047-backup-package/1440-all-board-batch.png`
- `output/playwright/dev-047-backup-package/1440-inspection.png`
- `output/playwright/dev-047-backup-package/1024-copy-plan.png`
- `output/playwright/dev-047-backup-package/390-copy-success.png`
- `output/playwright/dev-047-backup-package/1440-replace-plan.png`
- `output/playwright/dev-047-backup-package/1440-replace-success.png`
- `output/playwright/dev-047-backup-package/390-cross-origin-inspection.png`
- `output/playwright/dev-047-backup-package/320-tampered-error.png`

## Supabase QC Boundary

- 本輪使用 isolated temporary database 驗證 migration/RPC，不寫入持久 local fixture、TEST 或 production。
- 測試矩陣涵蓋 owner/admin/PM/member/viewer/signed-out、copy/replace、idempotency、stale fingerprint、record-link blocker、rollback、audit、tag color warning、legacy kanban ID map 與 cross-tenant collision。
- 既有持久 local migration history 未作 repair；測試 wrapper 只在 temporary DB 補入 DEV-047 所需的 `record_task_links` prerequisite。進入 Level 3 前必須核對 TEST/production 的 migration prerequisite 與 source provenance，不能以本機 wrapper 取代遠端 migration gate。

## Release Residual Risks

- Level 3 必須在固定 ProJED-TEST 執行 schema backup、migration/RPC/RLS matrix、authenticated Firebase preview、failure rollback 與 cleanup；通過後才能建立 release artifact。
- Production release 仍需 exact-commit provenance、正式 schema backup、migration dry-run、post-deploy authenticated smoke、rollback target 與 cleanup 證據。
- `npm audit --omit=dev` 顯示 8 筆既有 production dependency findings（1 critical、4 high、2 moderate、1 low），主要來自既有 Firebase/Firestore 與 Vite toolchain；DEV-047 新增的 `tsx@4.23.1` 使用 nested `esbuild@0.28.1`，未引入該 low advisory。供應鏈 remediation 應作為共用 release gate 專項處理，避免在 DEV-047 功能提交中混入未驗證的大範圍 dependency update。
- Browserslist/caniuse-lite 資料約 6 個月未更新；目前為 non-blocking build warning，release 前可獨立更新並重跑 browser/build gates。

## Release Decision

- DEV-047 Phase 1 local implementation：通過，可結案。
- DEV-047 remote Level 3 / production release：未執行，不可放行。
- Phase 2 workspace restore、Phase 3 account/environment recovery：未授權，需 Human Re-entry。
