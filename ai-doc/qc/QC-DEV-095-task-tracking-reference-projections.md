# QC-DEV-095 任務追蹤副本與跨看板多重投影

- 結論：`LOCAL INTERACTION PARITY QC PASS / Existing DB Baseline PASS / Supabase TEST BLOCKED / 未 Deploy / 未 Release`
- Source：working-tree boundary，base HEAD `dd3245c3fb2625aa0ce8e7cb8273fe2f06e79ee4`；未宣稱 immutable commit
- 環境：Windows、local-test backend、task-owned disposable PostgreSQL 18、既有 `http://localhost:4000/`
- 角色：2026-08-29 current frozen local candidate的獨立artifact／source readback；未修改產品資料、remote schema或deployment設定

## 1. QC 方法與範圍

既有QC verifier `npx tsx scripts/verify-dev-095-task-tracking-references-qc.ts` 與B01～B16保留為identity／placement／DB historical baseline。current interaction candidate另以`npm run verify:dev-095-task-tracking-interaction-parity-qc`執行QC-IP01～08，直接讀取S07～S10 source artifact、B17～B24 browser postconditions、實際source files與三張PNG，不讀RD摘要作為判定。

本次QC有效範圍是local-test shared surface／interaction／gesture／recursive tree與現有local／isolated DB regression。QC不把local-test或loopback PostgreSQL當成Supabase TEST、production RLS、Realtime或release evidence。

## 2. Fresh fact 結果

| Gate | 實際結果 | 直接證據 |
|---|---|---|
| Shared source architecture | PASS，S07～S10 4/4；不存在`TrackingReferenceItem`，四種surface共用controller／frame，tree以placementId排序 | `output/qa/dev-095/interaction-parity-source-result.json` |
| Current interaction browser | PASS，B17～B24 8/8；click/action、pointer/keyboard、390/320 TouchEvent、三種surface、recursive subtree、capability revoke、stale/fault recovery | `output/playwright/dev-095/interaction-parity-result.json` |
| Independent interaction QC | PASS，QC-IP01～08 8/8；直接readback source、artifacts、PNG dimensions與remote claim boundary | `output/qc/dev-095/interaction-parity-qc-result.json` |
| Artifact envelope | PASS，QC01 | `output/qa/dev-095/qc-result.json` |
| Model／source contract | PASS，QC02；model 14 checks、source 21 checks，含 tracking projection readonly context | `output/qa/dev-095/model-result.json`、`output/qa/dev-095/static-result.json` |
| Local cross-mode contract | PASS，QC06；I01～I12 12/12 | `output/qa/dev-095/cross-mode-result.json` |
| Rendered browser historical baseline | PASS，QC03；B01～B16 16/16（不含新interaction parity） | `output/playwright/dev-095/result.json` |
| Backup compatibility | PASS，QC04；v3 fractional／nested、v2 primary-only、external fail-closed | `output/qa/dev-095/backup-result.json` |
| Isolated PostgreSQL／security／performance | PASS，QC05；15/15，含 tenant／grant boundary、10k tasks／25k placements、四組 EXPLAIN | `output/qa/dev-095/db-isolated-result.json`、`output/qa/dev-095/db-performance.txt` |
| Production claim boundary | PASS，QC07；provider 僅 local-test／loopback；Supabase TEST 僅完成 read-only preflight，確認 capability RPC／placement table／projection RPC 尚未存在；migration list／dry-run 另確認 local-only 5／remote-only 3 與 `LegacyDbPushMissingLocalError`，linked Database Lint 無 error（僅既有非 DEV-095 warning），未執行 mutation | `output/qa/dev-095/qc-result.json`、`output/qa/dev-095/supabase-test-preflight.json`、`output/qa/dev-095/supabase-migration-list.json`、`output/qa/dev-095/supabase-db-push-dry-run.json`、`output/qa/dev-095/supabase-db-lint.json` |

current interaction QC summary：`PASS=8 / FAIL=0 / NOT_RUN=0 / BLOCKED=0`。舊QC01～QC07的7/7另保留，不與current計數相加。QC runner首輪曾因自身source token斷言名稱不符而exit 1；只修正QC斷言後fresh rerun 8/8，產品碼未在QC期間變更。

### 2.1 Rendered UI spot-check（QC 人工抽查）

在 automated browser artifact 之外，QC 以實際 PNG 逐張檢視下列畫面：

| Viewport | 結果 | 抽查觀察 |
|---|---|---|
| Desktop 1440×900 | PASS | 正本與追蹤card／checklist內容結構一致；tracking placement只增加紫色虛線外框，兩層明確tracking children可見。 |
| Mobile 390×844 | PASS | 卡片、展開箭頭與nested rows無重疊；document／body width均等於390。 |
| Mobile 320×844 | PASS | 最窄viewport仍保留相同surface與虛線；過長文字走既有ellipsis，document／body width均等於320。 |

直接證據：`output/playwright/dev-095/interaction-parity-1440x900.png`、`interaction-parity-390x844.png`、`interaction-parity-320x844.png`。人工抽查為補充證據；PNG dimensions與overflow仍由QC-IP05自動readback。

## 3. 反向檢查結論

- `taskId` 與 `placementId` 分離；建立副本只增加 placement，不增加 canonical task。
- B03／B04 的 move readback 保留 canonical source Board；B07 remove undo／redo 只影響 projection。
- B08 provider fault 後 create 無 ghost、move 保留 source、remove 仍可見，錯誤訊息不洩漏 SQL 或 internal ID。
- B10／B13仍只作historical baseline；current S07～S10直接掃描source，B21則逐一比對Board card、List row、checklist row的visible slots與computed style，確認外框以外沒有tracking-only內容分支。
- B12 Space／arrow／Escape keyboard DnD 與 B14 focus-visible／單一 polite live region 通過；B15 nested reference remove／undo 不改 canonical。
- B16證明舊版tracking reference context menu僅保留`task.open-details`且details為唯讀；最新契約改為共用action catalog並依canonical capability guard，因此此案例是historical baseline而非現行PASS gate。
- DB matrix 另覆蓋 tenant isolation、future viewer read/revoke、custom capability boundary 與 private helper grant boundary；performance fixture 為 10,000 tasks／25,000 placements，placement projection、RPC projection、visibility、last-reference revoke 四組計畫存在，artifact 的 target placement／canonical task Seq Scan flags 均為 `false`；temporary runtime cleanup 為 `released=true`／`path_removed=true`。
- linked Supabase Database Lint 以 `--fail-on error` 完成且無 error；唯一 warning 為既有 `private.move_task_workbench_subtree_v2_impl` 未使用變數，已記錄於 `supabase-db-lint.json`，不宣稱 DEV-095 schema readiness。
- backup readback 證明 fractional order（例如 `0.0001`）與 nested parent metadata 不會在 round-trip 遺失；payload 外 canonical task 以 `OUT_OF_PACKAGE_REFERENCE` fail closed。
- B17證明primary／tracking的single/double click、Enter／Space均開啟同一Task Details並回復各自placement focus；B18 action差異只剩create/remove與capability guard。
- B20在390與320各自驗證short tap／42px scroll move不啟動drag、long-press cancel不mutation及long-press drop實際commit；B22／B23證明兩層tracking subtree共用recursive surface，move/remove/undo不改canonical graph。
- B24以非Workspace-owner同帳號驗證source owner可編輯、降為viewer後同component唯讀；revision conflict與injected provider fault均顯示可恢復訊息且source位置／revision不被錯誤commit。

## 4. Interaction parity gate 結果

- source readback：PASS。`TrackingReferenceItem.tsx`不存在；`TaskSurfaceFrame`是唯一虛線branch；List／Kanban／Checklist皆呼叫同一`useTaskPlacementController`；`TaskPlacementTree`以placementId供同一`SortableContext`。
- normal UI browser：PASS。B17～B24 8/8、diagnostics空陣列，涵蓋click/action、desktop pointer、KeyboardSensor、真實TouchEvent、recursive children、capability與失敗恢復。
- rendered evidence：PASS。1440×900、390×844、320×844三張capture皆存在且尺寸正確；document/body沒有viewport overflow。
- independent readback：PASS。QC-IP01～08自行驗證exact case IDs、postconditions、source patterns、PNG header與remote claim boundary，沒有以case名稱或RD摘要替代事實。

判定：本地interaction parity gate可接受，0個本地P0/P1 open。這只解除local rework reopen，不解除Supabase TEST／release stop conditions。

## 5. 未覆蓋與阻塞

- I01～I12 已以 local-test cross-mode contract 12/12 通過；完整跨模式 rendered 深度走查仍未完成，目前 browser 只對核心 delivery path 與四模式 marker 做 rendered evidence。
- Supabase TEST two-user RLS／PostgREST／Realtime、migration history reconciliation、remote readback、production deploy/release 尚未執行。
- 當次 migration history mismatch與未追蹤debug script屬歷史工作樹狀態；收藏功能已由DEV-104移除，不能把舊狀態當作目前的release evidence。

## 6. QC 判定

DEV-095最新interaction parity的local handoff可接受：shared surface/controller/tree、B17～B24與QC-IP01～08均已通過，且latest artifact包含補強後的short tap／scroll、checklist、capability revoke與stale revision證據。

文件成熟度維持`RD Implementation Ready`；產品狀態為`Local Interaction Parity QA-QC PASS／Supabase TEST BLOCKED／未 Deploy／未 Release`。remote migration history對齊、T01～T09兩使用者readback與release gate仍是必要下一關，不能由本地QC關閉。
