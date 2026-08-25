# QC-DEV-089 全域工作台權威任務搬移交易

日期：2026-08-25  
結論：Local QC PASS／TEST Read-only Preflight PASS／Remote Migration Pending／未 Release  
規格：SPEC-089  
CAPA：CAPA-20260825-01

## 事實驗證

| Evidence | 結果 | 可證明範圍 |
|---|---:|---|
| `verify:dev-089-task-placement-transaction` | PASS | authoritative await、pending、idempotency、SQL/RLS contract、文件追溯 |
| `verify:dev-089-task-placement-failure-browser` | PASS | 390×844 真實 touch fault injection；來源保留、無副本、UI cleanup |
| DEV-086 subtree verifier | PASS | 完整子樹與 parent link success baseline |
| DEV-039 placement/cross-device static | PASS | 既有工作台 lane 與帳號範圍 contract |
| TypeScript | PASS | compile contract |
| `build:test` | PASS | test-mode bundle |
| targeted ESLint／diff check | PASS | 新增來源無 lint error／whitespace error |
| linked migration history／db lint | PASS（唯讀 preflight） | `20260825093621` 僅 local、remote 空白；既有 remote schema `No schema errors found`，證實 production 未變更，不代表新 migration 已執行 |
| linked security advisor | PASS WITH BASELINE WARN | 既有 `touch_updated_at` search-path、既有 callable DEFINER functions、leaked-password protection 告警；新 migration 未 apply，故尚不能評價 DEV-089 deployed object |
| TEST project health／backup preflight | PASS／STOP | Management API 唯讀確認 TEST `ACTIVE_HEALTHY`；`pitr_enabled=false` 且 `backups=[]`，沒有可引用的 restore evidence，故 schema mutation 依 release runbook 停止 |
| TEST read-only schema query | PASS | `wbs_items` 存在；`task_workbench_placement_operations` 與 `move_task_workbench_subtree` 尚不存在；latest migration `20260809144420`；證實 DEV-089 尚未套用 |
| Supabase local/TEST DB execution | NOT RUN | Docker daemon 未運行；本機 PostgreSQL 18 需要未提供的受控密碼，未碰既有 DB；TEST 無可復原備份證據，未執行遠端 migration／RPC／RLS mutation |
| production migration／deploy／Level 4 | NOT RUN | 未執行 production migration；未 Release |

## Fault injection readback

- root／child／grandchild 的 persisted board ID 均維持 `dev089-board-a`。
- persisted parent chain 維持 `dev089-column → dev089-root → dev089-child`。
- runtime readback 與 persisted readback一致；未歸位 local cache／DOM 的該 root 數量皆為 0。
- pending 時來源 scope 留在原位並顯示共用 compact spinner；failure 後 pending、drop indicator、drag preview、action rail 全數為 0。
- durable placement action 呼叫 1 次；success-only ancestor recalculation 0 次；page error 0。
- 人工目視 screenshot：toast 可讀、任務仍在已歸位投影、未歸位為空，沒有新增容器或版面重排。

## SQL／security review boundary

- migration source 已覆蓋 owner RLS、pending→failed 欄位級 client grant（client 無法偽造 committed/result）、auth.uid、與 client 一致的 configurable `move_task` capability matrix、empty search_path、function revoke、row lock、exact full subtree、exact delete count、activity/result 同 transaction、record/dependency fail-safe。
- operation `begin` 使用 conflict ignore，不會把 committed 記錄重設成 pending；重送必須保持 direction/root/tasks/source/target 完全相同。
- 第二次 retry response 仍遺失時，client 以 pending→failed 條件更新和同列 readback辨識 server 是否已 committed；readback 本身不可得時回報 outcome unknown，不把未知狀態冒稱為「來源一定保留」。
- 以上是 source-level evidence；只有在 Supabase TEST 實際 apply 並完成 success／rollback／RLS／advisors matrix 後，才能升級為 DB QC PASS。

## QC 判定

本地 CAPA implementation 與 failure containment 為 PASS；TEST 唯讀健康與 schema preflight 已完成，但因無 backup／restore evidence，未執行 schema mutation。沒有把未執行的 remote DB、Level 3 或 production 驗證冒稱完成。正式 release 仍需取得 TEST 可復原備份（或受控 reset／restore 證據）後完成 SPEC-089 的 DB01～DB03、Level 3、production migration/deploy 與 Level 4；任一 exactly-one-source 不變量失敗即 stop-ship。
