# QC-DEV-089 全域工作台權威任務搬移交易

建立：2026-08-25
重啟：2026-08-26
目前判定：RD Local Rework PASS／Production Known FAIL／Supabase TEST／Level 3 NOT RUN／P0 Stop-Ship
規格：SPEC-089 Rework 1
CAPA：CAPA-20260825-01

## 1. QC 判定原則

production 真實入口的反例權重高於 local、TEST 與單向 preview smoke。2026-08-25 的 PASS 保留為歷史 evidence，不刪除也不改寫；但它不能繼續支持「功能已完成」或「CAPA 有效」。

## 2. 2026-08-26 production 事實驗證

| Evidence | 觀察事實 | 可排除／證明 |
|---|---|---|
| 手機／窄版 rendered UI | 未歸位 task 拖入看板後顯示 `歸位失敗，任務已保留在未歸位。` | 反向 flow 未通過；不是畫面靜默消失 |
| Browser runtime log | `[taskDrag] Failed to place task subtree... Task placement transaction must cross the unplaced ownership boundary.` | client placement validation 主動拒絕 |
| operation ledger readback | 本次操作紀錄數為 0 | error 發生在 RPC begin 前，不是 DB rollback／permission／network timeout |
| canonical source readback | 來源 task 仍在 `task_workbench_unplaced_items` | 無資料遺失；failure containment 有效 |
| target board readback | 目的為 canonical board，不是暫存或手機專用 ID | 排除錯誤 target identity 為主要根因 |
| code trace | `buildTaskParentIndex` 以 parent-only `root` 分組；`normalizeTaskMoveUpdates` 對混合 root bucket reindex | 根因為 cross-board/workspace scope leakage |
| shared path trace | desktop／mobile 共用 commit／transaction owner | 缺陷非 mobile-only；兩平台皆須重驗 |

## 3. 多層次因果判定

| 層次 | QC 結論 |
|---|---|
| Gesture/UI | mobile 已送出有效 drop 並進入共用 commit；不是 500ms sensor 未觸發。 |
| Intent | target intent 存在，但後續 normalization 擴張了 mutation scope。 |
| State/ordering | parent-only root bucket 把不同 board/workspace nodes 當 siblings，是直接 defect。 |
| Transaction boundary | guard 正確阻擋混合 ownership batch，因而避免錯誤 mutation；不能透過放寬 guard 修復。 |
| Database | RPC 尚未被呼叫；既有 v1 DB transaction 不是這次直接故障點。 |
| Verification | Level 3 只驗看板→未歸位，缺反向真實 UI，造成錯誤 PASS。 |
| Governance | CAPA effectiveness criteria 雖寫雙向 transaction，但 release evidence 沒有 enforce 雙向 UI completeness。 |

## 4. Historical evidence register

| Evidence | 歷史結果 | 現行判讀 |
|---|---:|---|
| `verify:dev-089-task-placement-transaction` | PASS | v1 await／pending／SQL source baseline；不證明 scope-safe command |
| 390×844 failure injection | PASS | 證明來源保留；不證明 successful unplaced→board |
| DEV-086 subtree verifier | PASS | local fixture baseline；未覆蓋多 board root collision |
| TEST DB01-DB03 | PASS | v1 transaction/RLS/rejection baseline |
| Level 3 commit `60907d3` | PASS | 只證明看板→未歸位＋reload；coverage incomplete |
| 2026-08-26 production reverse flow | FAIL | 現行產品反例；觸發 CAPA reopen |

## 5. 不接受的修復方式

- 只在 `normalizeTaskMoveUpdates` 加單點 `boardId` filter 後宣告完成。
- 放寬 `must cross the unplaced ownership boundary` invariant。
- mobile 另寫特殊 commit/fallback 或失敗後直接本機搬移。
- client 繼續傳完整 node body／destination siblings，讓 server信任 stale order patches。
- 只重跑原單向 Level 3、只驗 toast 或只驗 localStorage。

這些作法可能移除目前 error，卻未消除 scope leakage、race 與跨層責任錯置。

## 6. RD return contract

QC 只在以下事實可重現後接受重新送驗：

1. cross-boundary UI 產生 `MoveTaskSubtreeCommand v2`，不產生 generic sibling patches。
2. ordering scope 固定為 ownership＋parent：看板 ownership 使用 workspace＋board，未歸位使用 server-derived account owner，不按 provenance workspace 分裂。
3. server 依穩定 scope 順序鎖定 source／destination siblings、決定 canonical order 並回傳 canonical result。
4. property case 證明所有非 affected scope deep equal。
5. DB rejection／idempotency／concurrency matrix PASS。
6. 桌機與 390×844 手機以真實 drag 完成雙向＋跨板＋reload。
7. Level 3 同 release candidate 雙向 PASS，migration history一致。

### 6.1 2026-08-26 RD local return evidence

| Evidence | 結果 | QC 判讀 |
|---|---:|---|
| `verify:dev-089-task-placement-transaction` | PASS | v2 command、shared owner、no client sibling patch、security、exactly-one-source postcondition與文件追溯通過。 |
| `verify:dev-089-placement-scope-isolation` | PASS／1,000 fixtures | 多 workspace／board root collision、兩方向、帳號級未歸位、非 affected scope deep equal。 |
| Disposable PostgreSQL 18 harness | PASS | migration compile、root/nested subtree雙向、dense order、replay、payload mismatch、來源零殘留、canonical moved IDs完整。非 Supabase TEST/RLS/concurrency證據。 |
| DEV-086 rendered browser regression | PASS | desktop、390×844、320×844 真實拖曳；desktop/mobile皆完成看板→未歸位，並跨工作區歸位完整三層子樹。 |
| DEV-089 390×844 failure injection | PASS | pending來源可見；失敗後source=3、destination=0、parent chain preserved、success-only roll-up=0、transient=0、pageerror=0。 |
| TypeScript／ESLint | PASS | `tsc --noEmit` PASS；ESLint 0 error（53 existing warnings）。 |

RD return contract 1-4 已有 local evidence；第 5 點 concurrency/security 尚需 Supabase TEST；第 6 點 local bidirectional 已通過但 reload/ledger 仍需 Level 3；第 7 點未執行。因此可接受 RD 本機實作送交下一階段，仍不可解除 release stop-ship。

## 7. QC stop conditions

以下任一出現即維持 FAIL：v1 fallback、parent-only index、跨 scope mutation、單向 evidence、missing ledger/canonical/reload readback、migration mismatch、console error、partial subtree、duplicate、lost task、optimistic 假成功。

## 8. QC 結論

目前 QC 判定為：`DEV-089 Rework 1 local implementation／property／transaction harness／rendered UI PASS；production現況仍為已知 FAIL；Supabase TEST、Level 3、migration history與Level 4尚未通過；禁止 release`。

SPEC-089 已達 RD Implemented 並有新 local evidence；不得沿用 2026-08-25 單向 PASS，也不得把 local harness 誤標為 Supabase TEST／production effectiveness PASS。
