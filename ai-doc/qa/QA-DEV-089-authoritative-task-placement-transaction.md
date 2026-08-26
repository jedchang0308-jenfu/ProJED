# QA-DEV-089 全域工作台權威任務搬移交易

建立：2026-08-25
重啟：2026-08-26
狀態：Reopened／Rework Local QA Executed／Source-Property-Rendered UI PASS／Supabase TEST／Level 3 NOT RUN／P0 Stop-Ship
規格：SPEC-089 Rework 1
CAPA：CAPA-20260825-01

## 1. 驗證狀態說明

2026-08-25 的 Local／TEST DB01-DB03／Level 3 PASS 保留為歷史基線，但該 Level 3 只完成「看板 → 未歸位＋reload」，沒有以相同 artifact 驗證反向「未歸位 → 看板」。2026-08-26 production 反向操作出現 client-side scope boundary rejection，因此先前結果不得作為現行版本完成或 CAPA 有效的證據。

本計畫針對 SPEC-089 Rework 1 的 scope-safe command architecture 重新驗證。2026-08-26 已完成 source/property、可丟棄 PostgreSQL transaction harness與 local rendered UI；Supabase TEST、RLS/concurrency、Level 3 與 production Level 4 仍為 `NOT RUN`，不得由 local evidence 替代。

## 2. Risk lane 與驗證策略

Risk lane：`P0 / High`。理由是跨 ownership、完整子樹、server transaction、RLS、ordering 與 production migration 同時受影響。

驗證分六層：

1. source contract：client 不再產生跨 scope generic patches。
2. property：隨機多 workspace／board／parent 生成圖，驗證 scope 隔離。
3. DB transaction：exact subtree、anchor、ordering、idempotency、concurrency、security、rollback。
4. rendered UI：桌機與 390×844 手機以真實 drag 操作雙向流程。
5. Level 3：同 release candidate、Supabase TEST、雙向＋reload。
6. Level 4：production 同 artifact、雙向＋canonical/ledger readback。

localStorage／直接 store/API mutation 只能作 unit support，不得替代 DB、UI 或 release evidence。

## 3. Rework FMEA

| 失效模式 | 影響 | 預防／偵測 | Gate |
|---|---|---|---|
| parent-only `root` bucket 混入其他看板 tasks | 正常歸位被 boundary guard 拒絕 | `PlacementScope` key＋randomized isolation property | P0 |
| client 把目的 siblings 當 subtree patches 傳送 | 跨看板重排／資料竄改面擴大 | command request schema 禁止 node body/sibling patches | P0 |
| 只加 board filter，排序仍由 client 計算 | race／stale order／多端不同結果 | server 依穩定順序 locks source/destination siblings and reindexes | P0 |
| 把帳號級未歸位按 provenance workspace 分組 | 「全域」lane 被切割、跨工作區 order 不一致 | discriminated ownership；unplaced owner由 `auth.uid()` 推導 | P0 |
| anchor 不屬於目的 scope | 插錯層或越權定位 | server exact-scope anchor validation | P0 |
| two concurrent placements 讀到相同 order | duplicate order／不穩定排序 | row locks＋dense canonical order＋parallel DB case | P0 |
| same operation retry 再次重排 | idempotency 失效 | immutable command v2 ledger＋result replay | P0 |
| 手機與桌機使用不同 commit path | 單平台復發 | shared command builder static＋兩 viewport UI | P0 |
| 只驗看板→未歸位 | 反向 production 缺陷漏網 | Level 3/4 bidirectional completeness gate | P0 |
| frontend 上線早於 v2 RPC | 所有搬移立即失敗 | migration history＋RPC existence predeploy gate | P0 |
| repo／remote migration history mismatch | 無法證明 artifact/schema 一致 | linked history reconciliation stop condition | P0 |
| failure 仍寫 activity／undo／roll-up | 稽核與狀態失真 | success-effects-only readback | P1 |
| transport unknown 被當失敗重做 | duplicate mutation | same operation retry＋ledger readback＋unknown UI | P0 |

## 4. Rework test data

固定 fixture 必須至少包含：

- Workspace A：Board A1 有兩個 root siblings，其中一個有 child＋grandchild；Board A2 有至少兩個 root siblings。
- Workspace B：Board B1 有 root siblings。
- 帳號級未歸位：一棵三層 subtree 及一筆獨立 root。
- 相同 `parentId=null`／legacy `root` 語意同時出現在所有 boards，刻意重現舊缺陷條件。
- permission-denied account、wrong-scope anchor、record-linked、dependency、missing-tag/member fixtures。

每案都要保存 before snapshot；成功案只允許 source subtree 及 source／destination direct sibling scopes 改變，其他 scope 使用 deep equality 比對。

## 5. Source／property cases

| ID | 驗證 | 預期 | 狀態 |
|---|---|---|---|
| RW-S01 | cross-boundary path 搜尋 `normalizeTaskMoveUpdates`／`BatchNodeUpdates` | 不被呼叫；request 無 sibling patches | PASS（static） |
| RW-S02 | mobile／desktop commit owner | 都呼叫同一 `buildMoveTaskSubtreeCommand` 與 store action | PASS（static＋rendered UI） |
| RW-S03 | v1 RPC usage audit | 新 UI path 不可呼叫或 fallback 至 v1 | PASS（service request contract） |
| RW-S04 | placement scope index | board key含workspaceId、boardId、parentId；unplaced key含account owner、parentId且不含provenance workspace | PASS（static＋property） |
| RW-S05 | 1,000 組 randomized placement graphs | 非 affected scope 100% deep equal | PASS（seed `0x5908926`） |
| RW-S06 | intent mapping table | before／after／append 對 parent/anchor 唯一映射 | PASS（property） |
| RW-S07 | task content boundary | command／RPC args 不含 title、notes、assignment、tags、dates | PASS（static） |
| RW-S08 | pending／success effects source contract | RPC 成功前 ownership 不變；failure 無 undo/activity/roll-up | PASS（390×844 fault injection） |

## 6. DB01-DB04 matrix

| ID | 驗證 | 預期 | 狀態 |
|---|---|---|---|
| RW-DB01-A | TEST backup、forward migration、history、RPC／columns／RLS／grants readback | schema 與 repo一致；v2 可呼叫，anon/public denied | LOCAL SQL compile PASS；Supabase TEST NOT RUN |
| RW-DB01-B | security advisor／schema lint | 無新 ERROR；新 function search_path/revoke 正確 | Static PASS；Supabase advisor NOT RUN |
| RW-DB02-A | unplaced→empty board root | exactly-one-source；dense canonical order | LOCAL property PASS；TEST NOT RUN |
| RW-DB02-B | unplaced→before／after existing root | anchor placement 正確；其他 boards unchanged | LOCAL property／PostgreSQL harness PASS；TEST NOT RUN |
| RW-DB02-C | unplaced→append child | 只有 moved root 取得 target parent；descendant links preserved | LOCAL property PASS；TEST NOT RUN |
| RW-DB02-D | board→unplaced | root parent=null；subtree完整；來源 board siblings dense | LOCAL property／PostgreSQL harness PASS；TEST NOT RUN |
| RW-DB02-E | cross-workspace unplaced→board | 權限／tag/member 合法時成功；所有非目的 workspace scope unchanged | LOCAL property／rendered UI PASS；TEST NOT RUN |
| RW-DB03-A | partial subtree | rollback；source unchanged；no committed result | Client/property guard PASS；TEST RPC NOT RUN |
| RW-DB03-B | wrong-scope／missing anchor | rollback with stable error code | Client/property guard PASS；TEST RPC NOT RUN |
| RW-DB03-C | outsider／source or destination permission denied | `42501`；no mutation | NOT RUN |
| RW-DB03-D | linked／dependency／missing tag/member／collision | fail-safe rejection；no mutation | NOT RUN |
| RW-DB03-E | exact delete mismatch／injected exception | destination/activity/result 全 rollback | Local server postcondition harness PASS；TEST NOT RUN |
| RW-DB04-A | same operation replay | 同 canonical result；mutation/activity count不增加 | Local PostgreSQL harness PASS；TEST NOT RUN |
| RW-DB04-B | two concurrent appends to same scope | serialized；unique dense order；無 lost task | NOT RUN |
| RW-DB04-C | response lost then ledger readback | committed／failed／unknown 三種分支正確 | Source contract PASS；TEST transport NOT RUN |
| RW-DB04-D | immutable payload changed under same operation | reject；原 result 不變 | Local PostgreSQL harness PASS；TEST NOT RUN |

## 7. Rendered browser cases

每案以產品真實入口操作；禁止 direct store/API mutation、DOM patch、`dispatchEvent` 製造完成狀態或只驗 function return。

| ID | Viewport／入口 | 操作與 readback | 狀態 |
|---|---|---|---|
| RW-B01 | desktop | 看板→未歸位→原看板；每步 DOM、canonical、ledger、reload | LOCAL雙向 DOM／persistence PASS；ledger/reload待Level 3 |
| RW-B02 | desktop | 未歸位→Board A1，切換 Board A2，再移到 A2；reload | LOCAL跨工作區 Board B PASS；reload待Level 3 |
| RW-B03 | 390×844 mobile | 500ms long-press 未歸位→before existing card；定位線與成功 readback | LOCAL long-press／定位線／selected board歸位 PASS；before-card待Level 3 |
| RW-B04 | 390×844 mobile | 看板→未歸位→另一看板；切板後 canonical only one source | LOCAL PASS（完整三層 subtree） |
| RW-B05 | desktop＋mobile | pending delay；來源整棵原位、spinner、不可二次拖 | MOBILE PASS；desktop pending待Level 3 |
| RW-B06 | desktop＋mobile | provider failure；正確 toast、來源保留、success effects=0 | MOBILE PASS；desktop failure待Level 3 |
| RW-B07 | desktop＋mobile | permission denied／wrong anchor | 原位保留、無假成功、可見錯誤 | NOT RUN |
| RW-B08 | 390×844 | 窄版無水平 overflow；定位線、toast、task均可見 | LOCAL PASS（另含320×844） |
| RW-B09 | all | console／pageerror／requestfailed／unhandled rejection sweep | 0 unexpected error | LOCAL PASS（fault注入的預期console error除外） |

## 8. Level 3／Level 4 gate

| Gate | 環境 | 必要流程 | 判定 |
|---|---|---|---|
| RW-L3 | Firebase preview＋Supabase TEST，同 release candidate | 桌機與手機各完成看板→未歸位→同看板；再完成未歸位→另一看板；reload＋ledger＋canonical readback | NOT RUN；少一方向即 FAIL |
| RW-L4 | production，同一 deployed artifact | 精確建立可刪 fixture，雙向操作、跨板操作、reload、visible error sweep、ledger/readback、精確 cleanup | NOT RUN；任何假成功／scope leak 即 P0 FAIL |

## 9. Historical baseline（不得作現行 PASS）

| 舊證據 | 歷史結果 | 現行用途 |
|---|---|---|
| 2026-08-25 Local static／390×844 failure injection | PASS | 證明 failure containment 舊基線 |
| Supabase TEST DB01-DB03 | PASS | 證明 v1 transaction/security 舊基線 |
| Level 3 commit `60907d3` 看板→未歸位＋reload | PASS | 單向 baseline；不證明反向 placement |
| 2026-08-26 production 未歸位→看板 | FAIL | 目前最高權重反例；CAPA ineffective |

## 10. QA exit criteria

只有下列全部成立才能將 QA 改為 PASS：

- SPEC-089 Rework 1 無 P0/P1 readiness gap，WP1-WP6 全部完成。
- RW-S01-S08、RW-DB01-DB04、RW-B01-B09 全部 PASS，evidence 可追溯。
- Level 3 同 artifact 雙向 PASS，且 production migration history 已 reconciled。
- QA handoff 包含 commit SHA、migration version、TEST backup、fixture cleanup、DOM/DB/ledger/reload readback 與 visible-error sweep。

目前結論：`Local source/property/rendered UI QA PASS；可丟棄 PostgreSQL harness PASS；Supabase TEST DB/RLS/concurrency、Level 3、production Level 4 NOT RUN；Production known FAIL；Stop-Ship`。
