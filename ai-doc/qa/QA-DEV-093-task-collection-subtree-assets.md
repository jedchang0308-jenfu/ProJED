# QA-DEV-093：收藏任務與子任務資產化驗證計畫

- 狀態：`In Progress / static 48＋TypeScript＋local 15＋pure 22＋negative compile 2＋journal 7＋build＋isolated DB 25-check PASS＋local Supabase DB 25-check PASS / browser B00-B19 21/21 PASS / required regressions PASS / targeted Local QC fact PASS / 真實 Supabase response-lost・Supabase TEST・remote readback・release pending / 未 Release`
- 日期：2026-08-28
- 最新 re-audit：2026-08-30T02:34:20+08:00（父 modal lifecycle 計數、5 節點內容 parity、desktop/mobile mutation-action readback verifier、source gate／exact artifact／production-bound rerun 與 linked migration read-only recheck；remote mismatch unchanged）
- 依據：`SPEC-093-task-collection-subtree-assets.md`
- 風險：High（immutable asset、authoritative transaction、RLS／custom capability、large snapshot、來源封存與跨 domain projection）
- 最新 browser parity rerun（2026-08-29T18:27:38.123Z）：B00～B19 21/21 PASS；B19 遍歷根、2 層子任務與深層子任務共 5 個快照節點，確認每一節點選取後都有內容區、共用備註 renderer、editable controls=0 與 `mutationActions=0`；根／`qc-card-1-child-1` 另驗證備註／日期／工期／狀態／主責／協作／標籤（含可見 fallback text），直接 readback `TaskDetailsModal` 計數 `0`，並在 390×844 驗證相同內容欄位可見與唯讀。瀏覽器 task-owned runner 已清理。
- 最新 static／TypeScript recheck（2026-08-29T18:32:54.354Z）：`npm run verify:dev-093-task-collection` 48/48 PASS；`npx tsc --noEmit` exit 0，未改變 remote／release boundary。
- Production-bound latest recheck（2026-08-30T02:33:00+08:00）：`npm run verify:production-bound-readiness -- --strict` 16/16 唯讀 checks PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation。
- Remote migration latest read-only recheck（2026-08-30T02:34:20+08:00）：linked list 仍為 local 51／remote 49，DEV-093 `20260828090000` local-only、remote-only 3 筆；`db push --linked --dry-run` exit 1／`LegacyDbPushMissingLocalError`。三份 evidence artifacts 已更新，未執行 repair／pull／push 或任何遠端 schema/data mutation。
- Local Supabase DB latest recheck（2026-08-30T01:40:37+08:00）：task-owned disposable DB matrix 25/25 PASS；database `dev093_local_47e4e9cd` dropped=true、drop_exit=0，primary `54322` runtime preserved。
- Parent modal／child parity latest recheck（2026-08-30T01:56:15+08:00）：B19 fresh 21/21 PASS；根與子任務皆完成內容 parity，`onViewCollection` 修正父 modal 遮罩攔截，未改變 remote／release boundary。
- Static verifier latest recheck（2026-08-30T01:58:37+08:00）：`npm run verify:dev-093-task-collection` 48/48 PASS（artifact `2026-08-29T17:58:37.200Z`）。
- All-node parity latest recheck（2026-08-30T02:03:37+08:00）：B19 nodeSelectionReadback 5/5；每個快照節點 selectedNode identity 一致、editable controls=0、sharedNoteRenderer=true。
- Source artifact latest recheck（2026-08-30T02:05:18+08:00）：`verify:source` fresh PASS；exact manifest `20260829180453-37385a` verifier `ok=true`，仍是 DEV-083 pipeline artifact，未視為 DEV-093 candidate。
- Lifecycle／mutation／mobile assertion／source artifact latest recheck（2026-08-30T02:28:20+08:00）：B19 `parentTaskModalCount=0`、5 節點與 390×844 `mutationActions=0` parity 讀回後 fresh `verify:source` PASS；exact manifest `20260829182820-a44fec` verifier `ok=true`，仍是 DEV-083 pipeline artifact，未視為 DEV-093 candidate。
- Production-bound latest recheck（2026-08-30T02:33:00+08:00）：`npm run verify:production-bound-readiness -- --strict` 16/16 唯讀 checks PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation。
- Remote latest read-only recheck（2026-08-30T00:43:24+08:00）：linked migration list 仍為 local 51／remote 49，local-only 5（含 DEV-093 `20260828090000`）、remote-only 3；`db push --linked --dry-run` exit 1／`LegacyDbPushMissingLocalError`。未執行 repair／pull／push 或任何遠端 schema/data mutation。
- Remote latest read-only recheck（2026-08-30T01:22:48+08:00）：linked migration list 仍為 local 51／remote 49，local-only 5（含 DEV-093 `20260828090000`）、remote-only 3；`db push --linked --dry-run` exit 1／`LegacyDbPushMissingLocalError`。三份 Supabase read-only artifacts 已更新，未執行 repair／pull／push 或任何遠端 schema/data mutation。
- Remote latest read-only recheck（2026-08-30T02:43:12+08:00）：linked migration list 仍為 local 51／remote 49，DEV-093 `20260828090000` local-only、3 筆 remote-only；dry-run exit 1／`LegacyDbPushMissingLocalError`。三份 evidence artifacts 已更新，未執行 repair／pull／push 或任何遠端 schema/data mutation。

## 1. 品質目標與驗證分層

驗證核心不是「按鈕有出現」，而是只有兩種 durable state：完全沒有新典藏且來源不變，或一筆可獨立閱讀的 immutable asset 與已封存 root 同時成立。local projection、toast、DOM 或 task link 都不能替代 authoritative readback。

分層固定如下：

1. source/type/static：第三型別、editable boundary、action capability、provider support與 selector contract。
2. pure contract：canonical tree、snapshot、privacy sanitizer、content/hash、limits與 error mapping。
3. local journal：逐 phase fault、reload recovery、same-operation與 projection recovery。
4. isolated PostgreSQL：fresh migration、constraint/index、RPC transaction、RLS/grants、concurrency與 query plan。
5. rendered browser：真實 menu/dialog/section/detail入口，desktop/mobile、keyboard、failure/reload與 visible error sweep。
6. targeted regression：meeting/work_log、activity、task history、mobile meeting restriction、archive/recycle-bin與 interaction kernel。

production migration、deploy、正式資料與 release smoke 不在本計畫的 local execution範圍；若授權上線，另建立 release gate。

## 2. FMEA 與優先級

| ID | 失效模式 | 使用者影響 | 預防／偵測 | Gate |
|---|---|---|---|---|
| F01 | asset 成功但 root 未封存，或反之 | 看板與資產互相矛盾 | 單一 RPC、fault rollback、DB count/readback | P0 |
| F02 | parent 典藏漏 child／收進跨板 child | 歷程資產不完整或資料越界 | stable subtree lock、scope/cycle fixture | P0 |
| F03 | same operation 產生重複版本 | 資產膨脹、版本失真 | unique operation、concurrent replay | P0 |
| F04 | 不同 operation 同時配置相同 version | unique failure或歷史錯序 | root lock、series concurrency | P0 |
| F05 | private／draft record 被嵌入 project asset | 隱私洩漏 | explicit predicate、attacker-title non-leak readback | P0 |
| F06 | generic editor/upsert/delete可改 collection | immutable asset 被覆寫 | TS boundary、RLS negative matrix、UI route | P0 |
| F07 | viewer／custom role繞過 collect_task | 未授權移出來源 | client＋SQL同 fixture、RPC direct call | P0 |
| F08 | timeout後用新 UUID重試 | 同一次操作建立 v2 | operation readback、same-token retry | P0 |
| F09 | preview後 source 改變仍 commit | 確認內容與實際資產不一致 | bound token、SOURCE_CHANGED | P0 |
| F10 | localStorage partial write在reload後殘留 | local-test出現半成功 | prepared/committed journal phase matrix | P0 |
| F11 | 第三型別被舊 classifier當 work_log | 錯誤 editor／工時欄位 | exhaustive classifier、editable-only list | P0 |
| F12 | mobile把 meeting與collection混合 | 資料分區失真 | 320/390 rendered section matrix | P1 |
| F13 | 大 snapshot被截斷仍顯示成功 | 資產偽完整 | code-point/UTF-8 exact boundary | P0 |
| F14 | search wildcard越權放大查詢／不命中index | 結果錯誤或效能退化 | `%/_/\\` literal cases、EXPLAIN JSON | P1 |
| F15 | source task hard delete讓asset崩潰 | 典藏失去資產價值 | delete＋reload＋detail snapshot readback | P0 |
| F16 | board/workspace刪除未揭露collection cascade | 使用者無意永久失去資產 | impact count、failure fail-closed | P0 |
| F17 | collection進RAG或source document | 非預期AI資料面 | DB shape、documents/rag job count=0 | P1 |
| F18 | compact rail新增第五項／窄版overflow | mobile操作退化 | static diff、390/320 geometry | P1 |
| F19 | SQL與TypeScript用不同JSON序列化 | preview誤判變更或hash無法驗證 | canonical byte golden、cross-provider hash parity | P0 |
| F20 | response lost readback查錯scope／回錯result | 假失敗、重複版本或跨板資料洩漏 | dedicated operation query、runtime shape與tenant/project isolation | P0 |
| F21 | committing／archive後focus遺失或錯誤無announcement | 鍵盤／輔助科技使用者無法判斷結果 | state-action-focus matrix、live region、reduced-motion | P1 |

## 3. 固定 fixture

fixture namespace 固定 `dev093-*`，不得依人工既有資料。至少建立：

- Workspace A／Board A1：`TC-ROOT` → `TC-CHILD-A` → `TC-GRANDCHILD` 三層，另有同層 `TC-CHILD-B`（預先 archived）；sort order含相同值以驗 storageId tie-break。
- Board A1 外部 active task `TC-EXTERNAL`；一條 internal dependency、一條 subtree→external boundary、一條 external→subtree boundary。
- task activities涵蓋 create、status、dates、assignment、collaborator、tag、move、archive/restore及 dependency create/update/delete；另放未知 payload key、email-like/token-like值驗 sanitizer。
- linked records：published project meeting、published tenant work_log、private record、project-visible draft、另一筆 task_collection；只有前兩筆可進 related-record snapshot。
- Board A2 有同 client-like title／parent語意的 tasks，證明不可跨 project；Workspace B作 tenant isolation。
- actors：owner、admin、project_manager、member、viewer；custom role rows包含「有 delete_task」「無 delete_task」「explicit collect_task」「viewer explicit collect_task」四組。
- limit fixtures：tasks 500/501、dependencies 1000/1001、activities 5000/5001、records 200/201、annotation 500/501 code points、content 512KiB±1、snapshot 2MiB±1；含 emoji/CJK驗 code-point與 UTF-8差異。
- malformed fixtures：cycle、cross-project parent、duplicate storage identity、missing root、already archived root、operation reused for different root。
- canonical byte fixture：固定object key亂序、nested array、`null`、空陣列、CJK、emoji、反斜線、換行與整數timestamp；SQL／TypeScript必須輸出逐byte相同的UTF-8與lowercase SHA-256。

每個 mutation case 保存 before fingerprint：task rows、dependencies、knowledge records、record links、activity events、documents/RAG jobs與 local journal。失敗案要求 relevant fingerprint deep equal。

## 4. Source／pure contract cases

| ID | 驗證 | 預期 | 狀態 |
|---|---|---|---|
| S01 | KnowledgeRecord discriminated union與 editable input compile negatives | collection不能進 upsert/checkpoint/delete/editor | PASS（negative compile fixture 2/2） |
| S02 | action catalog/guard | `task.collect`只用 collect capability；archive仍用 delete | PASS（local viewer permission denial＋browser fail-closed） |
| S03 | provider matrix | Supabase/local supported；Firebase hidden且 direct call typed unsupported | PARTIAL（local Supabase disposable 25/25 PASS＋local-test PASS；remote Supabase TEST未執行；Firebase unsupported） |
| S04 | generic provider list filters | meeting/work_log仍可編；collection不流入 useRecordStore | PASS（static＋browser Records） |
| S05 | compact rail source sweep | MobileTaskAction/presenter不含 collect | PASS（static＋B12） |
| P01 | leaf／三層／selected child traversal | exact same-board subtree，sibling order可重建 | PASS（static＋local＋isolated） |
| P02 | cycle/missing/cross-project/duplicate | fail closed `SOURCE_INVALID_TREE` | PASS（pure verifier已驗 missing／duplicate／cycle／cross-project scope；provider TEST仍待） |
| P03 | dependency classification | internal/boundary方向、外端ID/標題正確 | PASS（static＋isolated boundary） |
| P04 | activity sanitizer | allowlist保留；未知/敏感key 0 leak | PASS（pure allowlist＋before/after sanitizer） |
| P05 | related records | published nonprivate only；private/draft/nested collection 0 leak | PASS（pure published/private/draft/nested filter） |
| P06 | content projection/hash | 同 fixture deterministic；單一來源變更 hash/token改變 | PASS（canonical／source-changed static＋isolated） |
| P07 | limit exact boundaries | limit本身成功、limit+1整體拒絕且不截斷 | PASS（pure exact 500／501 service preview） |
| P08 | row mapping/null normalization | DB null、legacy local缺值、profile/tag/dependency mapping得到明確null/[]/default與固定排序 | PASS（pure null/default mapping） |
| P09 | Supabase/TS canonical golden parity | canonical bytes、counts/tree/content/source hash/token material/final hash完全一致 | PARTIAL（isolated＋local Supabase SQL↔TS 25/25；remote Supabase TEST未驗） |

狀態解讀：`PASS` 只代表欄位所列的 local／isolated／browser evidence 已覆蓋；`PARTIAL` 代表已有局部證據但仍缺指定分支或 Supabase TEST；`NOT RUN` 代表尚無可接受的 delivery-path evidence。未達 `PASS` 的 S/P case 不得用 static、build 或其他 case 代替，仍阻擋完整 QA exit。

## 5. Local journal／recovery matrix

| ID | 注入點／流程 | 預期 | 狀態 |
|---|---|---|---|
| L01 | normal commit＋reload | 一資產、一event、root archived、journal空 | PASS（local commit／journal；browser reload evidence） |
| L02 | `after_journal` | reload還原before；0 asset、root active | PASS（journal recovery verifier） |
| L03 | `after_asset` | reload還原before；0 partial record/link | PASS（journal recovery verifier） |
| L04 | `after_archive` | reload還原before；root active | PASS（journal recovery verifier） |
| L05 | `after_activity` | reload還原before；0 duplicate event | PASS（journal recovery verifier） |
| L06 | `after_commit_marker` | reload重播after；完整success且journal清除 | PASS（journal recovery verifier） |
| L07 | same operation 連續／平行retry | 同 record/version；count不增加 | PASS（local＋isolated＋B08） |
| L08 | restore＋new operation | 建立 v2；v1 hash/content不變 | PASS（local＋isolated＋B06） |
| L09 | projection apply throw | durable success保留；reload後UI收斂，不建第二筆 | PASS（injected localStorage partial-write rollback） |
| L10 | operation reused on other root | `OPERATION_CONFLICT`；兩來源不變 | PASS（isolated DB operation conflict） |
| L11 | response lost＋reload＋operation readback | dedicated query回同record/result；`sourceRootUpdatedAt=collectedAt`；0新operation | PARTIAL（local／browser response-lost operation readback＋reload PASS；Supabase TEST仍未驗） |

Local journal 的 `after_*` recovery 與 partial-write rollback 已由 `journal-result.json` fresh verifier 覆蓋；L11 的 local／browser response-lost operation readback＋reload 已完成，真實 Supabase response-lost／遠端 timeout 仍未完成，isolated transaction rollback 與 local-test evidence 不能取代該 remote case。

## 6. Isolated PostgreSQL matrix

| ID | 驗證 | 預期 | 狀態 |
|---|---|---|---|
| DB01 | fresh bootstrap＋實際 DEV-093 migration | SQL成功；舊 meeting/work_log rows不變 | PASS |
| DB02 | schema/constraint/index/function readback | 名稱、predicate、signature與 metadata shape完全符合SPEC（本次 isolated subset） | PASS |
| DB03 | grants/RLS | public/anon/private-helper denied；authenticated只可public RPC/authorized SELECT（本次 isolated subset） | PASS |
| DB04 | collect capability matrix | defaults/custom backfill/client-SQL fixture一致（本次 delete_task backfill＋owner/viewer） | PASS |
| DB05 | preview token／source mutation | unchanged commit成功；任一 material變更 `SOURCE_CHANGED` | PASS |
| DB06 | successful subtree transaction | asset/links/root archive/event同transaction；counts一致 | PASS |
| DB07 | injected insert/link/archive/event error | transaction rollback；before fingerprint相同 | PASS |
| DB08 | same operation concurrency | loser readback winner；一record、一event | PASS |
| DB09 | different operation concurrency same root | 一成功；另一 archived/busy fail；version無重複 | PASS（different operation archived-root denial） |
| DB10 | restore後new operation | server配置 v2；舊v1 immutable | PASS |
| DB11 | generic direct insert/update/delete/link mutation | collection shape/mutation denied；editable records仍可寫 | PASS |
| DB12 | private/draft related record attacker readback | title/count/excerpt均不洩漏 | PASS（private title non-leak） |
| DB13 | source task hard delete | links可cascade；asset metadata/content仍完整可讀 | PASS |
| DB14 | cursor/search | stable 50-page、無重複漏列、wildcards literal、GIN plan命中 | PASS（50-page／literal search；GIN plan readback留待完整 DB gate） |
| DB15 | task_collection RAG isolation | documents、chunks、jobs沒有新增collection來源 | PASS（rag_enabled／isolated fixture） |
| DB16 | board/workspace impact與cascade | count正確；授權不足/查詢失敗 fail closed | PASS |
| DB17 | canonical serializer golden | SQL helper與TypeScript輸出逐byte相同；hash為lowercase 64 hex | PASS |
| DB18 | wire／dedicated read paths | preview/collect snake_case shape正確；operation/detail/linked-summary依RLS、scope、hash fail closed | PASS（preview／collect snake_case；dedicated detail/link-summary remote readback留待 Supabase TEST） |

DB gate 只能使用 disposable PostgreSQL runtime。2026-08-29 已以 `npm run verify:dev-093-task-collection-db-isolated` 執行 fresh PostgreSQL 18 loopback matrix；script 輸出 project、purpose、dynamic port、owning pg tree、cleanup condition，並在 `finally` 停止該 data directory、確認 listener 釋放後移除 temp runtime。不得停止所有 postgres/node或清未知port。最新 artifact 為 25 個 PASS checks（generated `2026-08-29T15:55:43.9630649Z`、port `57751` released、temporary path removed）：含四階段 trigger fault rollback、dblink same-operation concurrency、board FK cascade／viewer denial與 SQL↔TypeScript canonical byte/hash parity；此證據不等於 Supabase TEST／production migration。

## 7. Rendered browser／accessibility matrix

所有 case 使用產品真實入口；禁止 direct store/API mutation、DOM patch或只驗函式回傳。local fixture bootstrap可建立資料，但 user action必須從 menu／dialog／Records UI執行。本輪 browser verifier 已完成 B00～B19 共 21/21 cases，並由實際 listener 收集 pageerror、requestfailed、4xx/5xx 與 role-alert sweep；B08 已驗 transient fault 同 operation retry，B09 已驗 permission/source/limit/provider fail-closed，B12 已驗 320×844 overflow/full-menu 與 compact rail 邊界，B19 已驗快照內容欄位 parity 與唯讀控制。證據為 `output/playwright/dev-093/result.json`；完整 QA／QC 仍未完成。

| ID | Viewport／流程 | Readback | 狀態 |
|---|---|---|---|
| B00 | 1440×900／390×844 Records entry＋section shell | 紀錄庫標題、分區控制、收藏任務切換與 horizontal overflow readback；desktop 三個同層分區、mobile 依既有會議限制顯示兩個 tab | PASS |
| B01 | 1440×900 task full menu → preview → cancel | counts正確；0 mutation；focus回原action | PASS |
| B02 | 1440×900 task detail overflow → collect | pending保留來源；success後active view移除；查看典藏開正確detail | PASS |
| B03 | 1024×768 Records cold entry | 三個互斥section；meeting default；無全部清單 | PASS |
| B04 | collection search/page/error/retry | state只影響collection section；stale response不覆寫 | PASS（搜尋命中／空結果恢復 smoke） |
| B05 | detail tree/dependency/history/related records | read-only、可收合、無editor/save/delete/RAG action | PASS |
| B06 | restore source＋recollect | v2顯示；v1不變；成功可選正確ID | PASS |
| B07 | permanent delete source＋reload | asset仍可讀；顯示來源不存在；0 crash | PASS |
| B08 | transient fault／timeout/response lost | 先readback；同operation retry；0 duplicate | PASS（local-test transient fault、response-lost operation readback／reload 後單一 asset／root archive；真實 Supabase response-lost 留 TEST） |
| B09 | permission revoked/source changed/limit/provider unsupported | 可見精確錯誤；來源保留；0假成功 | PASS（permission／source hash／501-node limit／unsupported action hidden） |
| B10 | board/workspace delete | 顯示collection count/cascade；impact fail時不可確認 | PASS（刪除確認／取消保留 smoke） |
| B11 | 390×844 cold/deep-link | 只顯示典藏/工作兩section；deep-link典藏；meeting不render | PASS（mobile section/deep-link；reload 後由 Records sidebar fallback 重建） |
| B12 | 320×844 task action | collect只在overflow/full menu，compact rail仍四項 | PASS（overflow item count=1；compact rail不新增 collect） |
| B13 | 320/390 geometry | 無document horizontal overflow、遮擋、icon-only主action | PASS（320／390 overflow readback） |
| B14 | keyboard/screen reader | menu/dialog/tabs/disclosure/Escape/cancel/focus return/names通過 | PASS（tab／tabpanel ARIA、focus／Escape、reduced-motion；實際 screen-reader tree／browser zoom 保留 supplemental） |
| B15 | visible error sweep | unexpected console/pageerror/requestfailed/4xx/5xx/role=alert為0 | PASS |
| B16 | dialog五狀態 | action／Escape／pending close規則正確；error保留annotation；archive卸載後focus不落body | PASS（state trace 覆蓋五態、live region、error annotation restore、Escape／focus） |
| B17 | quietness／a11y／reduced motion | 單一主焦點／主action、無重複helper/card shell；live region一次；200% zoom與reduced-motion可用 | PASS（單一紀錄庫／分區控制 smoke） |
| B18 | data sanity | fixture預期有4 tasks/2 allowed related records/activities時，counts、list、detail不得為0或空白假PASS | PASS（5 tasks／2 activities／2 related records 預覽、snapshot、詳情均非零） |
| B19 | archived task content parity | 含備註／日期／工期／狀態／主責／協作／標籤的快照，詳情以一般任務同等內容密度呈現；共用 renderer／component，內容區無可編輯 controls；從父詳情進入典藏後父 modal 必須關閉；390×844 亦須可見 | PASS（最新 artifact：5/5 snapshot nodes selected；desktop／mobile note/date/duration/status/assignment/tags 均可見；shared note renderer；input／textarea／select=0、mutation action=0；`parentTaskModalCount=0`） |

## 8. Required regression commands

```text
npm run verify:dev-093-task-collection
npm run verify:dev-093-task-collection-local
npm run verify:dev-093-task-collection-pure
npm run verify:dev-093-task-collection-journal
npm run verify:dev-093-task-collection-canonical
npm run verify:dev-093-task-collection-negative-compile
npm run verify:dev-093-task-collection-db
npm run verify:dev-093-task-collection-db-isolated
npm run verify:dev-093-task-collection-browser
npm run verify:dev-003-record-tags
npm run verify:dev-007-meeting-activity
npm run verify:dev-008-task-knowledge
npm run verify:dev-020-record-workflow-redesign
npm run verify:dev-069-meeting-draft-recovery
npm run verify:dev-088-task-lifecycle
npm run verify:dev-070-interaction-kernel
npx tsc --noEmit
npx eslint src/types/index.ts src/features/taskCollection src/services/dataBackend.ts src/services/localTestService.ts src/services/firestoreService.ts src/services/supabase/projedService.ts src/store/useTaskCollectionStore.ts src/store/useWbsStore.ts src/store/useRecordStore.ts src/interactions/task src/components/TaskCollectionDialog.tsx src/components/TaskDetailsModal.tsx src/components/GlobalContextMenu.tsx src/components/HomeView.tsx src/components/Records
npm run build:test
git diff --check
```

2026-08-28 最新回歸結果：DEV-003、DEV-007、DEV-008、DEV-020、DEV-069、DEV-070、DEV-088 全部 PASS；DEV-007 verifier 已改驗證現行 SPEC-020 meeting activity／synthesis contract，並禁止已移除的舊 source-marker。`npm run verify:dev-093-task-collection-db` 僅完成 migration preflight，Supabase local/TEST runtime 未啟動且未觸碰遠端資料。

未來新增 package scripts後，static verifier必須核對實際 migration filename與上述QA/SPEC，而不是接受任何包含 `DEV-093` 的檔案即通過。

## 9. RD slice gates 與 acceptance traceability

### 9.1 RD slice handoff gates

| Slice | 可開始下一slice前必須通過 | 失敗回送 |
|---|---|---|
| WP-093-A | S01、DB01～DB04、DB11、schema/type readback、`tsc` | migration/type/RLS owner；不得接active UI |
| WP-093-B | P01～P09、L01～L11、DB05～DB15、DB17～DB18 | snapshot/provider owner；不得宣稱atomic或parity |
| WP-093-C | S02～S05、B01、B02、B08、B09、B12、B14、B16 | command/store/action owner；來源保持active fixture |
| WP-093-D | DB16、B03～B07、B10、B11、B13、B17、B18 | Records/delete-impact owner；不得進整體QA exit |
| WP-093-E | 全案例、required regressions、artifact provenance與runtime cleanup | verifier/handoff owner；任何NOT RUN不得改寫為PASS |

slice gate只允許縮小失敗回送範圍，不降低最終QA exit；同一case若跨slice，最後修改者必須重跑。

### 9.2 Acceptance traceability

| Acceptance | 主要QA cases | 必要證據 |
|---|---|---|
| AC-093-001 | S02、B01、B02、B05、B12 | action/section/detail可見文字與DOM name |
| AC-093-002 | P01、P03、DB06、B01、B02、B18 | preview/result/snapshot counts與tree golden |
| AC-093-003 | L02～L05、DB06、DB07 | before/after fingerprints與transaction counts |
| AC-093-004 | L07、L08、L11、DB08～DB10、B06、B08 | record/version/event IDs與舊hash readback |
| AC-093-005 | DB13、B07 | delete/reload後content、metadata、detail screenshot |
| AC-093-006 | S02、DB03、DB04、B09 | actor/capability matrix與direct RPC denial |
| AC-093-007 | S01、S04、DB11、DB15、B05 | compile negatives、RLS denial、0 RAG rows |
| AC-093-008 | S05、B03、B11～B13 | section DOM、viewport screenshot與overflow量測 |
| AC-093-009 | DB14、DB18、B04、B05 | cursor IDs、query/network與per-section state |
| AC-093-010 | P02、P07、L10、DB05、DB07、DB09、B08、B09 | error code、0 mutation fingerprint、UI recovery |
| AC-093-011 | B01～B19＋required regressions | result JSON、screenshots、console/network/visible sweep |
| AC-093-012 | QA exit metadata | actual environment、NOT RUN external gates、0 production action |
| AC-093-013 | DB16、B10 | scalar counts、failed-impact blocked UI、awaited delete |
| AC-093-014 | P06、P08、P09、L11、DB17、DB18 | canonical bytes/hash golden與operation readback |
| AC-093-015 | B01、B14、B16、B17 | focus trace、accessibility tree、live region、reduced-motion/zoom |
| AC-093-016 | B19 | 任一快照節點的一般任務內容／備註（含富文字）、日期、工期、狀態、主責／協作、標籤可見；共用 renderer／元件，內容區無 input／textarea／select 或 mutation action |

任何AC若沒有上表指定delivery-path evidence只能標`未充分驗證`，不得用build、typecheck或另一case的截圖替代。

## 10. Evidence package

- static result：`output/qa/dev-093/static-result.json`（48 checks；latest generated `2026-08-29T17:00:08.588Z`）
- local result：`output/qa/dev-093/local-result.json`（15 checks；含 viewer permission denial、response-lost operation readback；generated `2026-08-29T16:42:29.411Z`）
- negative compile result：`output/qa/dev-093/negative-compile-result.json`（S01 2 checks；editable input／collection metadata compile negatives；generated `2026-08-29T16:42:34.053Z`）
- DB preflight result：`output/qa/dev-093/db-result.json`（Supabase CLI／remote gate 仍 NOT RUN）
- Supabase read-only preflight：`output/qa/dev-093/supabase-migration-list.json`（2026-08-29T14:18:58.3105104Z 由 `npm.cmd exec --yes supabase@latest -- migration list --linked --output-format json` 產生；local 51／remote 49，DEV-093 local `20260828090000` 尚未出現在 remote；未執行 repair／pull／push）
- Supabase migration history reconciliation：`output/qa/dev-093/supabase-migration-history-reconciliation.json`（local 51／remote 49；5 筆 local-only、3 筆 remote-only；未執行 repair／pull／push）
- Pure contract result：`output/qa/dev-093/pure-result.json`（22 checks；P02／P04／P05／P07／P08與 S03 unsupported contract 的 fresh source/pure evidence，含 cross-project scope fail-closed；generated `2026-08-29T16:42:31.052Z`）
- Journal result：`output/qa/dev-093/journal-result.json`（7 checks；L01～L06、L09 recovery／rollback evidence；generated `2026-08-29T16:42:31.787Z`）
- Supabase local schema preflight：`output/qa/dev-093/supabase-local-schema-preflight.json`（既有 local runtime 尚未初始化 project schema；未執行 reset／migration）
- Supabase migration dry-run：`output/qa/dev-093/supabase-db-push-dry-run.json`（2026-08-29T14:18:58.3105104Z fresh `npm.cmd exec --yes supabase@latest -- db push --linked --dry-run`，exit code 1、`LegacyDbPushMissingLocalError`；remote history 含 local 缺少的既有 migration；未執行 repair／pull／push）
- Supabase latest read-only recheck（2026-08-30T00:03:56+08:00）：linked migration list 仍為 local 51／remote 49，DEV-093 `20260828090000` local-only、3 筆 remote-only；`db push --linked --dry-run` exit code 1／`LegacyDbPushMissingLocalError`，本次未更新 artifact、未執行 repair／pull／push。
- Local Supabase read-only schema probe（2026-08-30）：runtime DB `127.0.0.1:54322` 可連線，但 `supabase_migrations.schema_migrations` 僅有 2 筆既有版本，未包含 DEV-093；未執行 local reset、migration 或資料變更，因此不能將 local runtime 誤標為 Supabase TEST PASS。
- Local Supabase disposable matrix：`output/qa/dev-093/db-local-result.json`（generated `2026-08-29T16:29:53.9109700Z`；25/25 PASS；provider `supabase-local`；random database dropped；port `54322` primary runtime preserved）；可由 `npm run verify:dev-093-task-collection-db-local` 重跑，且不取代 remote TEST。
- Static contract refresh：`npm run verify:dev-093-task-collection` latest 48/48 PASS（generated `2026-08-29T18:32:54.354Z`）；共用 DB matrix 可選 dblink connection 分支、local Supabase verifier／package command 均受 source contract guard。
- Full source gate refresh：`npm run verify:source` latest PASS（lint 0 errors／52 warnings、tsc、production build、auth mode、Supabase static／migration aliases、calendar ICS、core regression static、P9 edge function）；build output `20260829182820-a44fec` 為 DEV-083 pipeline artifact，不視為 DEV-093 release candidate。
- Exact artifact integrity refresh（2026-08-30T02:28:20+08:00）：`verify:production-artifact -- --manifest output/release/dev-083/20260829182820-a44fec/manifest.json` `ok=true`；origin／secret／tree integrity 通過，但仍不取代 DEV-093 remote TEST／release gate。
- Production-bound readiness refresh（2026-08-30T00:37:27+08:00）：`npm run verify:production-bound-readiness -- --strict` 16/16 唯讀 checks PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation。
- Production-bound readiness latest recheck（2026-08-30T01:07:54+08:00）：同一 strict command 16/16 唯讀 checks PASS；production target、server key shape、redirect、credential rotation、REST／admin／management probes 均 PASS，未執行 deploy、migration、activation 或任何遠端 schema/data mutation。
- Browser parity latest recheck（2026-08-30T01:30:40+08:00）：修正典藏工期日期差＋1 落差並補 B19 數值／可見主責與標籤 assertion 後，fresh B00～B19 21/21 PASS（artifact `2026-08-29T17:30:40.550Z`）；B19 `duration=true`、`assignmentText=true`、`tagText=true`、共用 renderer、內容區 editable controls=0；task-owned browser runner 已清理。
- Full source／artifact latest recheck（2026-08-30T01:19:13+08:00）：工期 parity 修正後 `npm run verify:source` fresh PASS（lint 0 errors／52 warnings、tsc、build、auth／Supabase／calendar／core／P9）；exact manifest `output/release/dev-083/20260829171847-c661e0/manifest.json` 驗證 `ok=true`，仍不取代 DEV-093 remote TEST／release gate。
- Production-bound latest recheck（2026-08-30T01:20:17+08:00）：同一工作樹執行 `npm run verify:production-bound-readiness -- --strict`，16/16 唯讀 checks PASS；未執行 remote migration、deploy、activation 或任何遠端 schema/data mutation。
- Migration reconciliation detail（read-only）：5 筆 local-only 為 DEV-089 v1／v2、DEV-090、DEV-093 `20260828090000` 與 DEV-095 `20260828100000`；3 筆 remote-only 為 `20260825151331`、`20260826143006`、`20260826143014`。未在未授權下採用 CLI repair／pull／push 建議。
- Supabase read-only shadow diff：`npx supabase db diff --linked --schema private --output-format json` exit 0，已成功套用 local migrations 至 `20260828100000` 並解除 DEV-093 `depth` ambiguity；輸出的 drop diff 仍代表 remote/local history 不一致，未套用任何 migration。
- Local QC fact report：`ai-doc/qc/QC-DEV-093-task-collection-subtree-assets.md`（fresh local static／DB／browser／regression evidence；Supabase TEST／release 明列 pending）
- isolated DB result：`output/qa/dev-093/db-isolated-result.json`（fresh generated `2026-08-29T15:55:43.9630649Z`；25/25 PASS；port `57751` released、temporary path removed）
- local Supabase DB result：`output/qa/dev-093/db-local-result.json`（fresh generated `2026-08-29T16:29:53.9109700Z`；25/25 PASS；random database dropped；primary port `54322` preserved）
- browser result：`output/playwright/dev-093/result.json`（fresh generated `2026-08-29T16:53:34.653Z`；B00～B19 21/21 PASS；B02 深連結焦點、B11/B14/B16/B18/B19 supplemental coverage 已補）
- browser result latest：`output/playwright/dev-093/result.json`（fresh generated `2026-08-29T18:27:38.123Z`；B00～B19 21/21 PASS；B19 遍歷 5 個快照節點，驗證根／子任務 parity、主責／標籤可見文字、共用 renderer、`parentTaskModalCount=0`、390×844 mobile parity 與內容區 editable controls／mutation actions=0）
- latest source artifact：`output/release/dev-083/20260829182820-a44fec/manifest.json`（exact integrity `ok=true`；DEV-083 pipeline artifact，不是 DEV-093 production candidate）
- screenshots：`desktop-sections.png`、`desktop-collection-detail.png`、`dialog-error-focus.png`、`dialog-success.png`、`mobile-sections.png`、`mobile-collection-overflow.png`、`board-delete-impact.png`
- DB output：migration object readback、actor matrix、transaction counts、negative/error cases、EXPLAIN JSON、temp runtime cleanup；由 `scripts/verify-dev-093-task-collection-db-isolated.ps1` 可重跑
- local Supabase DB output：migration／RPC／RLS matrix、canonical parity、random database cleanup；由 `scripts/verify-dev-093-task-collection-db-local.ps1` 可重跑
- source output：check name、expected/actual、seed/golden hash與失敗明細
- handoff metadata：commit SHA、working tree scope、實際 migration filename、provider/env、viewport、base URL、runtime ownership/cleanup、未執行 external gates

各 result JSON 共用最小envelope：`{ devId, sourceRevision, generatedAt, environment, provider, command, runtime, cases, summary }`。每個case固定 `{ id, status: 'PASS'|'FAIL'|'NOT_RUN'|'BLOCKED', expected, actual, evidence[] }`；`summary`逐status計數且必須與cases重算一致。browser另存viewport、route、actor、fixture namespace、console/pageerror/requestfailed/HTTP/role-alert/data-sanity counts；DB另存PostgreSQL version、migration filename、object/grant/RLS readback、query plans、owned process tree與port-release結果。`db-isolated-result.json` 是本次 loopback matrix 的精簡 gate envelope，本輪 DB01～DB18 與 browser B00～B19 均已產出；實際 screen-reader tree／browser chrome zoom 與真實 Supabase response-lost 等 supplemental coverage仍依對應 case與遠端 gate明列 pending。缺case、未知status、source revision不符或runtime cleanup缺證據時，aggregator必須non-zero exit。

只存 screenshot 不足以證明 atomicity；只存 DB row不證明使用者入口。B01-B19需 DOM／canonical／network／visible-error／focus與data-sanity證據互相對應。

## 11. Stop conditions／QA exit／QC handoff

任一 P0 失敗、private leak、半成功、duplicate version、generic mutation、viewer bypass、source-delete detail failure、mobile mixed section、unreleased migration先行依賴或temp runtime未清理，立即停止後續PASS標示並回送RD。

QA exit 必須同時成立：S01-S05、P01-P09、L01-L11、DB01-DB18、B01-B19與required regressions全部PASS；AC-093-001～016皆有對應delivery-path evidence；artifact可追溯；0個P0/P1 open；Supabase TEST／production未執行處明列 `NOT RUN`。QA通過後由獨立QC依同一commit重新執行事實驗證並建立 `ai-doc/qc/QC-DEV-093-task-collection-subtree-assets.md`，不得由本計畫預建PASS報告。

目前結論：`In Progress / targeted Local QC fact PASS`。static 48 checks、TypeScript、local 15 checks（含 viewer permission denial、response-lost operation readback）、pure 22 checks（含 cross-project scope fail-closed）、negative compile 2 checks、journal 7 checks、build:test、DEV-093 targeted ESLint 0 errors與local-test same-operation／archived descendant／boundary dependency／impact／v2／source-delete checks已通過；isolated PostgreSQL matrix 已通過 25 個 checks（DB01～DB18 全部案例均有 PASS，含 fault rollback、same-operation concurrency、board/workspace cascade與 SQL↔TypeScript canonical parity），另有 local Supabase disposable matrix 25/25 PASS，兩者 evidence 均已清理 runtime／database。browser B00～B19 共 21/21 cases 已通過，B08 transient retry、response-lost/reload、B09 fail-closed、B11 cold/deep-link、B12 窄版 overflow、B14 ARIA／reduced-motion、B16 五態 state trace、B18 非零歷程 counts與 B19 一般任務內容 parity／唯讀控制均有 readback，證據為 `output/playwright/dev-093/result.json`；journal 的 after_* recovery 與 injected partial-write rollback 已由 `output/qa/dev-093/journal-result.json` 覆蓋。2026-08-30T00:43:24+08:00 的 remote read-only gate 已重讀並確認 history mismatch 未變；仍未完成的是 L11 真實 Supabase response-lost／遠端 timeout、Supabase TEST／production、remote readback與 release，因此不得轉為完整 QA PASS。
