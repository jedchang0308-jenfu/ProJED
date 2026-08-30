# QC-DEV-093：典藏任務與子任務資產化

- 結論：`Targeted Local QC PASS / isolated PostgreSQL＋local Supabase DB 25-check PASS / Full QA matrix、remote Supabase TEST、production 與 release gate pending`
- Source：working-tree boundary；initial QC base HEAD `dd3245c3fb2625aa0ce8e7cb8273fe2f06e79ee4`，本次 re-audit 仍保留既有工作樹變更，不宣稱 immutable commit
- 環境：Windows、local-test backend、task-owned disposable PostgreSQL 18、既有 `http://localhost:4000/`
- 角色：QC fresh fact execution；本次命令執行期間未修改檔案；產品／verifier 收斂記錄於下方 re-audit delta

## 執行事實

| Gate | 實際結果 | 證據 |
|---|---|---|
| Static contract | PASS，48/48 checks；含 Supabase／local response-lost operation readback、local verifier／dblink branch source guards | `output/qa/dev-093/static-result.json`（latest generated `2026-08-29T18:32:54.354Z`） |
| Local immutable transaction | PASS，15/15 checks；含 viewer permission denial、response-lost operation readback | `output/qa/dev-093/local-result.json`（generated `2026-08-29T16:42:29.411Z`） |
| Pure source／snapshot contracts | PASS，22/22 checks；missing／duplicate／cycle／cross-project scope、sanitizer、related-record filter、null normalization、exact 500／501 limit、hash determinism；generated `2026-08-29T16:42:31.052Z` | `output/qa/dev-093/pure-result.json` |
| Negative compile boundary | PASS，2/2 checks；`KnowledgeRecordInput` 排除 `task_collection`、editable record 的 collection metadata 為 `never`；generated `2026-08-29T16:42:34.053Z` | `output/qa/dev-093/negative-compile-result.json` |
| Local journal recovery | PASS，7/7 checks；normal commit、五個 journal phase recovery 與 injected partial-write rollback；generated `2026-08-29T16:42:31.787Z` | `output/qa/dev-093/journal-result.json` |
| Canonical parity | PASS；CJK／emoji／escape golden SHA-256 `7b3ff8686a4b496c4b16b9fc89d622381eac1884d4da3b9f7f1708fd669be8d9` | `npm run verify:dev-093-task-collection-canonical` |
| Isolated database | PASS，25/25；fresh migration／RLS／RPC／rollback／concurrency／cascade／canonical parity | `output/qa/dev-093/db-isolated-result.json`（generated `2026-08-29T15:55:43.9630649Z`；port `57751` released、path removed） |
| Local Supabase database | PASS，25/25；實際 Supabase local container disposable database／migration／RLS／RPC／rollback／concurrency／cascade／canonical parity | `output/qa/dev-093/db-local-result.json`（generated `2026-08-29T16:29:53.9109700Z`；random database dropped；primary port `54322` preserved） |
| Rendered browser | PASS，B00～B19 21/21；1440／1024／390／320 viewport、focus、overflow、error sweep、response-lost/reload；B02 深連結焦點、B11 cold/deep-link、B14 tab/tabpanel ARIA＋reduced-motion、B16 五態 state trace、B18 非零歷程／關聯紀錄 counts、B19 全 5 節點一般任務內容 parity／工期語意／主責與標籤可見文字／父 modal 關閉（`parentTaskModalCount=0`）／唯讀 controls／mutation actions=0／390×844 mobile parity | `output/playwright/dev-093/result.json`（latest generated `2026-08-29T18:27:38.123Z`） |
| Failure paths | PASS；B08 transient same-operation retry＋response-lost/reload readback、B09 permission/source/limit/provider fail-closed、B12 overflow/full-menu | browser artifact readback |
| Required regressions | PASS：DEV-003、DEV-007、DEV-008、DEV-020、DEV-069、DEV-070、DEV-088；本輪 fresh rerun 全部通過 | `npm run verify:dev-003-record-tags`、`verify:dev-007-meeting-activity`、`verify:dev-008-task-knowledge`、`verify:dev-020-record-workflow-redesign`、`verify:dev-069-meeting-draft-recovery`、`verify:dev-070-interaction-kernel`、`verify:dev-088-task-lifecycle` command outputs |
| TypeScript／build／lint | PASS；`npx tsc --noEmit` exit 0、`npm run build:test` exit 0、fresh `npm run verify:source` lint 0 errors／52 warnings、targeted ESLint 0 errors | command outputs |

## UI／資料事實

- Records 維持單一「紀錄庫」主頁；同層分區為「典藏任務／會議紀錄／個人工作紀錄」，mobile 依 meeting restriction 隱藏會議分區，不混合「全部」清單。
- B02 readback：典藏成功後 root archive、collection count=1，唯讀詳情包含任務樹／相依／歷程／相關紀錄。
- B07 readback：來源永久刪除並 reload 後，asset 仍可讀且顯示來源不存在。
- B15 readback：page error、request failure、HTTP 4xx/5xx、額外 role=alert 均為 0。
- B17 readback：`紀錄庫` 主標題只有一個、section control 只有一組。
- B11/B14/B16/B18/B19 readback：390×844 deep-link／cold sidebar fallback 可重建典藏分區；tab／tabpanel ARIA 與 reduced-motion preference 可讀；dialog state trace 覆蓋 preview-loading、confirmation、committing、recoverable-error、success 並保留 annotation；fixture 預覽／snapshot／詳情均讀回 5 tasks、2 activities、2 related records；B19 以含備註／日期／工期 `4 天`／狀態／主責／協作／標籤的 snapshot 驗證內容欄位均可見，且主責／標籤 fallback text 可見、共用備註 renderer，內容區 input／textarea／select=0。實際 screen-reader tree 與 browser chrome 200% zoom 仍屬 supplemental。

## Re-audit delta（2026-08-28）

- Snapshot boundary 新增 workspace／board scope guard；fresh `npm run verify:dev-093-task-collection-pure` 為 22/22 PASS，`P02-cross-project-fail-closed` 已覆蓋 cross-project tree negative。
- Local-test 新增 viewer permission denial 與 response-lost operation readback；fresh `npm run verify:dev-093-task-collection-local` 為 15/15 PASS。
- Supabase adapter 的 `collect()` 新增 operation readback recovery；browser B08 fresh rerun 已驗證 response-lost 後單一資產與 reload readback。
- Read-only `supabase db diff --linked --schema private --output-format json` 已 exit 0，shadow database 成功套用 DEV-093／DEV-095 local migrations；原 `depth` ambiguity 已修正，剩餘 drop diff 仍由 remote/local history mismatch 造成。
- Isolated bootstrap 已補齊 DEV-048 保留的 legacy `wbs_items.assignee_id` compatibility column；fresh PostgreSQL matrix 仍為 25/25 PASS，且 task-owned runtime cleanup 完成。
- 新增 TypeScript negative compile fixture／runner；fresh `npm run verify:dev-093-task-collection-negative-compile` 為 2/2 PASS。
- Rendered browser verifier 已補強 B11 cold/deep-link、B14 tab／tabpanel ARIA 與 reduced-motion、B16 五態 state trace／error annotation restore、B18 非零歷程與關聯紀錄 counts、B19 一般任務內容 parity／唯讀 controls；fresh rerun 為 B00～B19 21/21 PASS，artifact generated `2026-08-29T15:48:38.491Z`。
- 前一輪 re-audit 已確認 static 45/45（generated `2026-08-29T15:52:51.590Z`，含 Supabase／local response-lost source guards）、local 15/15、pure 22/22、negative compile 2/2、journal 7/7、canonical golden、`npx tsc --noEmit`、`npm run build:test`、fresh `npm run verify:source`與 targeted ESLint（0 errors）；本輪最新 48/48 與 source gate 結果見下方，命令執行期間未修改產品行為，產品／verifier 的必要收斂已另列於本節。
- 2026-08-29 產品 re-audit：`TaskCollectionDetail` 補上以快照節點選取的內容 parity renderer；B19 實際驗證備註／日期／狀態／主責／協作／標籤可見、共用備註 renderer 且無可編輯 controls，browser artifact 收斂為 B00～B19 21/21 PASS。此項屬 RD UI 變更，未改變 immutable snapshot、provider 或 remote gate。
- AC-093-016 traceability re-audit：QA acceptance table 已補 B19 對應，固定一般任務內容／富文字備註／日期／工期／狀態／主責／協作／標籤 parity、共用元件與唯讀 controls；證據仍為 browser artifact `2026-08-29T15:48:38.491Z`。

## 阻塞與適用範圍

- Supabase read-only reconciliation：local 51／remote 49；5 筆 local-only、3 筆 remote-only；DEV-093 local revision `20260828090000` 尚未出現在 remote。證據：`output/qa/dev-093/supabase-migration-history-reconciliation.json`。
- 2026-08-29T14:18:58.3105104Z fresh read-only gate：`migration list --linked --output-format json` 仍為 local 51／remote 49；同次 `db push --linked --dry-run` exit 1／`LegacyDbPushMissingLocalError`。三份 Supabase evidence artifact 已更新，未執行 repair／pull／push 或任何遠端 schema/data mutation。
- 2026-08-30T00:03:56+08:00 latest read-only recheck：linked `migration list` 仍為 local 51／remote 49；DEV-093 `20260828090000` local-only、3 筆 remote-only；`db push --linked --dry-run` 仍 exit 1／`LegacyDbPushMissingLocalError`。本次只讀，未執行 repair／pull／push 或任何遠端 schema/data mutation。
- Local Supabase schema probe：`127.0.0.1:54322` read-only 連線成功，但 migration table 僅 2 筆既有版本、未含 DEV-093；未執行 local reset／migration，維持 Supabase TEST NOT RUN。
- Local Supabase disposable matrix re-audit：使用 `verify:dev-093-task-collection-db-local` 建立隨機 database、套用 DEV-093 migration並執行 25/25 checks PASS；database 已 DROP、54322 primary runtime 保留，artifact `2026-08-29T16:29:53.9109700Z`。清理失敗現改為 fail-closed。此為 local supplemental evidence，不等同 remote Supabase TEST。
- Static contract re-audit：focus 修正後重新執行，並確認共用 DB matrix 的 dblink connection branch、local verifier／package command guards；`verify:dev-093-task-collection` 為 48/48 PASS（latest artifact `2026-08-29T17:00:08.588Z`）。
- Full source gate re-audit：`npm run verify:source` 0 errors／52 warnings，tsc、build、auth、Supabase static／aliases、calendar、core與P9均通過；新產物 `20260829165737-05da90` 為 DEV-083 pipeline artifact，未啟用 DEV-093 release。
- Production-bound readiness re-audit（2026-08-30T00:37:27+08:00）：`npm run verify:production-bound-readiness -- --strict` 16/16 唯讀 checks PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation。
- Browser parity re-audit（2026-08-30T00:53:48+08:00）：首次重跑發現 B02 標題 focus race，改用 `React.useLayoutEffect` 後 fresh B00～B19 21/21 PASS（artifact `2026-08-29T16:53:34.653Z`）；未改變 remote TEST／release boundary。
- Browser parity latest re-audit（2026-08-30T01:16:02+08:00）：發現典藏工期原為日期差＋1，修正為一般任務相同的日期差後補上 B19 duration assertion；fresh B00～B19 21/21 PASS（artifact `2026-08-29T17:16:02.860Z`），未改變 remote TEST／release boundary。
- Browser parity latest re-audit（2026-08-30T01:30:40+08:00）：B19 再補主責／標籤可見 fallback text assertion；fresh B00～B19 21/21 PASS（artifact `2026-08-29T17:30:40.550Z`），`duration=true`、`assignmentText=true`、`tagText=true`、shared renderer=true、editable controls=0；task-owned runner 已清理，未改變 remote TEST／release boundary。
- Static／TypeScript latest re-audit（2026-08-30T01:36:10+08:00）：`npm run verify:dev-093-task-collection` fresh 48/48 PASS，`npx tsc --noEmit` exit 0；未改變 remote TEST／release boundary。
- Production-bound latest re-audit（2026-08-30T01:37:23+08:00）：`npm run verify:production-bound-readiness -- --strict` 16/16 唯讀 checks PASS；未改變 remote TEST／release boundary。
- Remote migration latest re-audit（2026-08-30T01:39:06+08:00）：read-only linked list 仍為 local 51／remote 49，dry-run 仍回 `LegacyDbPushMissingLocalError`；三份 evidence artifacts 已更新，未執行任何 remote mutation。
- Remote migration latest re-audit（2026-08-30T02:34:20+08:00）：read-only linked list 仍為 local 51／remote 49，dry-run 仍回 `LegacyDbPushMissingLocalError`；三份 evidence artifacts 更新為 `2026-08-29T18:34:20.148Z`，未執行任何 remote mutation。
- Remote migration latest re-audit（2026-08-30T02:43:12+08:00）：read-only linked list 仍為 local 51／remote 49，dry-run 仍回 `LegacyDbPushMissingLocalError`；三份 evidence artifacts 更新為 `2026-08-29T18:43:12.864Z`，未執行任何 remote mutation。
- Local Supabase DB latest re-audit（2026-08-30T01:40:37+08:00）：fresh disposable migration／RLS／RPC／rollback／concurrency／cascade／canonical matrix 25/25 PASS；database dropped and primary `54322` listener preserved。
- Parent modal／child parity latest re-audit（2026-08-30T01:56:15+08:00）：B19 fresh 21/21 PASS；根／`qc-card-1-child-1` 均讀回內容 parity 與唯讀控制，`onViewCollection` 已避免父 modal 遮罩攔截。
- Static verifier latest re-audit（2026-08-30T01:58:37+08:00）：`npm run verify:dev-093-task-collection` 48/48 PASS（artifact `2026-08-29T17:58:37.200Z`）。
- All-node parity latest re-audit（2026-08-30T02:03:37+08:00）：B19 5/5 snapshot nodes selected successfully；每節點 editable controls=0、sharedNoteRenderer=true。
- Source artifact latest re-audit（2026-08-30T02:05:18+08:00）：fresh `npm run verify:source` 0 errors／52 warnings；manifest `20260829180453-37385a` exact integrity `ok=true`，仍不代表 DEV-093 release。
- Lifecycle assertion latest re-audit（2026-08-30T02:11:44+08:00）：fresh B00～B19 21/21 PASS；B19 直接 readback `parentTaskModalCount=0`，5/5 nodes parity、sharedNoteRenderer=true、editable controls=0。
- Source artifact latest re-audit（2026-08-30T02:12:49+08:00）：fresh `npm run verify:source` 0 errors／52 warnings；manifest `20260829181249-e9b9a6` exact integrity `ok=true`，仍不代表 DEV-093 release。
- Static latest re-audit（2026-08-30T02:16:20+08:00）：fresh `npm run verify:dev-093-task-collection` 48/48 PASS（artifact `2026-08-29T18:16:20.072Z`），未改變 remote／release boundary。
- Mobile parity latest re-audit（2026-08-30T02:27:38+08:00）：fresh B00～B19 21/21 PASS；B19 390×844 `visible=true`、欄位 parity=true、editable controls=0、mutation actions=0。
- Source artifact latest re-audit（2026-08-30T02:28:20+08:00）：fresh `npm run verify:source` 0 errors／52 warnings；manifest `20260829182820-a44fec` exact integrity `ok=true`，仍不代表 DEV-093 release。
- Static latest re-audit（2026-08-30T02:32:54+08:00）：fresh `npm run verify:dev-093-task-collection` 48/48 PASS（artifact `2026-08-29T18:32:54.354Z`），未改變 remote／release boundary。
- Production-bound latest re-audit（2026-08-30T02:33:00+08:00）：fresh strict read-only gate 16/16 PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation。
- Mutation-action／source artifact latest re-audit（2026-08-30T02:21:35+08:00）：fresh B00～B19 21/21 PASS；B19 5/5 nodes `mutationActions=0`、`parentTaskModalCount=0`。
- Source artifact latest re-audit（2026-08-30T02:22:26+08:00）：fresh `npm run verify:source` 0 errors／52 warnings；manifest `20260829182226-69a0ea` exact integrity `ok=true`，仍不代表 DEV-093 release。
- Full source／artifact latest re-audit（2026-08-30T01:19:13+08:00）：fresh `npm run verify:source` 0 errors／52 warnings 並通過 tsc、build、auth／Supabase／calendar／core／P9；exact manifest `20260829171847-c661e0` integrity／origin／secret scan `ok=true`，該產物仍屬 DEV-083 pipeline artifact。
- Production-bound latest re-audit（2026-08-30T01:20:17+08:00）：工期 parity 修正後再次執行 strict read-only gate，16/16 checks PASS；remote TEST／migration／deploy／activation boundary 不變。
- Exact artifact re-audit（2026-08-30T01:03:10+08:00）：`verify:production-artifact -- --manifest output/release/dev-083/20260829165737-05da90/manifest.json` 回報 `ok=true`，integrity／origin／secret scan 全部通過；該產物仍為 DEV-083 pipeline artifact。
- Production-bound readiness latest re-audit（2026-08-30T01:07:54+08:00）：`npm run verify:production-bound-readiness -- --strict` 16/16 唯讀 checks PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation，remote TEST／release boundary 不變。
- Migration reconciliation handoff re-audit（read-only）：local-only 檔案為 DEV-089 v1／v2、DEV-090、DEV-093 `20260828090000`、DEV-095 `20260828100000`；remote-only revision 為 `20260825151331`、`20260826143006`、`20260826143014`。此明細僅供授權後對齊，不代表已 repair／pull／push。
- Remote migration latest re-audit（2026-08-30T01:22:48+08:00）：read-only list 仍為 local 51／remote 49，dry-run 仍回 `LegacyDbPushMissingLocalError`；`supabase-migration-list.json`、`supabase-migration-history-reconciliation.json`、`supabase-db-push-dry-run.json` 已更新同一 UTC evidence，未執行 remote mutation。
- DEV-093 local suite re-audit（2026-08-30T00:42:43+08:00）：local 15/15、canonical golden、pure 22/22、journal 7/7、negative compile 2/2 全部 PASS；remote read-only recheck（2026-08-30T00:43:24+08:00）仍為 local 51／remote 49、`LegacyDbPushMissingLocalError`，未執行任何遠端 mutation。
- 本輪再執行 `npm.cmd exec --yes supabase@latest -- migration list --linked`，仍可連線並讀回相同 local／remote mismatch；未執行 migration、repair、pull、push 或任何 schema/data mutation。
- 本輪再執行 `npm.cmd exec --yes supabase@latest -- db push --linked --dry-run`，exit 1 並回報 `LegacyDbPushMissingLocalError`；CLI 建議的 repair／pull 均未採用，未執行任何 remote mutation。
- `db push --dry-run --linked` fresh rerun 仍以 `LegacyDbPushMissingLocalError` 阻擋（exit code 1）；未執行 repair、pull、push、migration、reset 或資料變更。證據：`output/qa/dev-093/supabase-db-push-dry-run.json`（generated `2026-08-28T14:01:01.3535613Z`）。
- 真實 Supabase response-lost／遠端 timeout、TEST RLS／authenticated readback、production migration、deploy 與 release 尚未驗證；本報告不可作為 production ready 或完整 DEV-093 release sign-off。

## QC 判定

本次 fresh targeted local QC 與 re-audit delta 支持 DEV-093 的產品 wiring、immutable snapshot、紀錄庫分區、錯誤回復、pure contract（含 cross-project scope fail-closed）、negative compile、viewer permission denial、response-lost operation readback、local journal recovery 與 isolated transaction 契約；未覆蓋的 L11 真實 Supabase response-lost、remote／release gates 維持 `NOT RUN` 或 `PARTIAL`，不得將本報告解讀為完整 QA PASS。下一步須依 deployment/release gate 先完成 migration history 對齊、backup/readback 與 Supabase TEST，再由 release owner 決定是否進入 production。
