# CAPA-20260825-01 手機跨看板搬移後任務看似消失

日期：2026-08-25  
關聯：DEV-089、DEV-086、DEV-039  
狀態：Correction + Corrective Action + Preventive Action 已完成本地實作與 QC／TEST DB01-DB02 PASS／Level 3 Remote Effectiveness Pending

## 不符合與影響

使用者將 `回覆聖島, 發明核准` 從全域工作台未歸位拖入看板後，桌機保留已歸位的 optimistic 畫面，但另一裝置依遠端 canonical readback 無法在目的看板取得同一 task。production read-only 診斷顯示該 task 仍只存在 `task_workbench_unplaced_items`，目的 `wbs_items` 沒有對應列。

風險為 P0：不是單純 RWD 隱藏，而是 client state 與 canonical ownership 分歧，會造成「看似消失」、重做搬移、duplicate、完成率與 activity log 失真。

## Containment

- 未對 production task 做刪除、複製或人工改表；canonical 未歸位來源仍存在，沒有資料遺失證據。
- release 前維持 stop-ship：不把既有 optimistic provider path 當成 production 修復。
- 故障時的新 client 行為固定保留來源並顯示可恢復訊息，避免使用者重複建立任務。

## Root Cause Analysis（多層次）

| 層次 | 根因 |
|---|---|
| UI | desktop 在 drop 後立即以 local Zustand 顯示目的 placement，造成成功錯覺；手機／重載則依 canonical data 呈現不同結果。 |
| State | `batchUpdateNodes` 是同步 optimistic action，呼叫端無法 await 跨 ownership persistence，也無法把 rejection 回傳 drag session。 |
| Provider | destination create 與 source delete 分散在多次非原子呼叫；舊 helper catch 後只 warning/local fallback，沒有 rollback-to-source 契約。 |
| Database | `wbs_items` 與 `task_workbench_unplaced_items` 之間沒有單一 transaction RPC、idempotency ledger 或 exactly-one-source constraint owner。 |
| Verification | DEV-086 主要使用 localStorage fixture 驗證成功路徑與 persistence order，沒有 Supabase failure injection、跨裝置 canonical readback 或「失敗不得 optimistic commit」release gate。 |
| Governance | SPEC-086 明列「失敗可由 undo 或重載恢復」，把資料 ownership failure 錯當一般 UI optimistic update，風險分級不足。 |

## Correction

- 建立 `commitNodePlacementBatch`：先標記 pending、await persistence，成功才修改 local placement；failure finally 清 pending，來源不動。
- desktop／mobile drag owner 都 await durable action並回傳 `failed` terminal result；failure 不執行 roll-up。
- pending subtree 在 realtime refresh 中保留來源投影，避免 RPC response 前被 destination event 提前替換。
- 共用 compact `TaskPlacementPendingIndicator` 套用看板 L1／L2／L3+ 與未歸位列；錯誤只說明任務保留位置。

## Corrective Action

- 新增 owner-scoped `task_workbench_placement_operations`，以 immutable operation ID 支援 replay/readback、elapsed/error code 與 client platform；authenticated client 只能建立 pending 或記錄 failed，不能偽造 committed/result。
- 新增單一 PostgreSQL RPC：server 從 root 重建 canonical subtree，驗證 exact set／hierarchy／來源或目的看板的 configurable `move_task` capability，於同 transaction 寫目的、刪來源、寫 activity、提交 operation result。
- operation conflict 採 ignore，committed replay 直接回原 result；transport ambiguity 只重送同一 ID 一次，第二次仍遺失時以 ledger row lock 序列化後 readback，不能確認時不冒稱來源已保留。
- exact delete row count 不符即 rollback；來源有 record link／quick memo promotion link／dependency，或目的缺 tag／assigned member 時 fail-safe reject。
- server 由 locked canonical source 重建 title／notes／assignment／tags／dates；client payload 只決定經驗證的 placement，避免只有 `move_task` 權限者趁搬移竄改內容。
- local／Firestore fallback 維持 await＋compensation，但 production acceptance 只以 Supabase transaction path 為 authoritative。

## Preventive Action

- 新增 `verify:dev-089-task-placement-transaction`，把 await order、pending stability、idempotency、exact subtree、`move_task` capability matrix、RLS/search_path/revoke、delete count、UI共用與文件邊界設為 source gate。
- 新增 390×844 mobile fault injection：持久化延遲後失敗，必須證明 persisted/runtime/DOM 來源保留、無 unplaced duplicate、parent chain 不變、success effect=0。
- SPEC-089 取代 SPEC-086 的 optimistic failure 契約；未來任何 ownership transfer 都必須有 exactly-one-source、idempotent operation 與 provider fault test。
- release gate 強制 Supabase TEST success／rollback／replay／partial subtree／outsider RLS／linked/dependency reject，再進 Level 3；production 後才做 Level 4。

## Effectiveness Check

| 時點 | 指標／抽樣 | 判定 |
|---|---|---|
| Local | fault injection 1 次、完整三層 subtree | PASS：來源 3／目的 0、parent chain preserved、page error 0 |
| Linked remote preflight | migration history、schema lint、security advisor（唯讀） | PASS WITH BASELINE WARN：新 migration remote 空白、production 未變更；既有 remote schema 無 error，既有 advisor warnings 留列，不得視為新 object 已通過 |
| Supabase TEST backup | custom-format dump + restore listing | PASS：712,269 bytes；`pg_restore --list` exit 0；SHA-256 `df4bf7008fdf46f2a36bf781fbb3592efa196398eb6369292f730386c1639b19` |
| Supabase TEST migration／RLS | migration、operation ledger、RPC、ACL、anonymous REST | PASS：migration version `20260825125421`；RLS/3 policies；`PUBLIC/anon` ACL revoked；anonymous REST 401；advisor 僅既有 baseline WARN |
| Supabase TEST transaction | 兩方向 success、exact subtree、activity、idempotent replay、cleanup | PASS：三層 parent chain；兩 operation committed；activity=6；replay 不新增 mutation；fixture 清理後 source/destination/ledger/activity counts=0 |
| Supabase TEST DB03 | authenticated outsider、partial subtree、linked/dependency | Pending；匿名 REST denied 已通過，完整 authenticated matrix 尚待 Level 3 fixture |
| Level 3 | Firebase preview + TEST，同帳號桌機／手機 round trip＋reload | Pending |
| Production T+0 | Level 4 authenticated smoke，readback operation/result/source/target | Pending |
| Production T+7／T+30 | 查 operation ledger；抽查 committed 與 failed | Pending；任何兩邊皆有／皆無／partial subtree=CAPA ineffective，立即 reopen |

建議 effectiveness threshold：每次 committed operation 的 task IDs 在 canonical readback 必須 100% exactly-one-source；任何單筆違反即 P0。`failed / total > 1%` 或相同 error code 連續 3 次觸發 RD review，但單純 permission／linked-data fail-safe 不計資料一致性失效。

## 結論與未完成邊界

本 CAPA 的本地 Correction、Corrective Action、Preventive Action、TEST backup 與 DB01／DB02 已完成。DB03 的完整權限／fail-safe matrix、Level 3、production migration/deploy 與 Level 4 仍未完成；本輪未執行 production migration、production deploy 或 production data mutation。
