# QC-DEV-089 全域工作台權威任務搬移交易

日期：2026-08-25  
結論：Local QC PASS／TEST DB01-DB02 PASS／DB03 Partial／Level 3 Pending／未 Release  
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
| TEST project health／backup preflight | PASS | TEST `ACTIVE_HEALTHY`；physical backup unavailable (`pitr_enabled=false`、`backups=[]`)，已改以 custom-format logical dump 建立 restore evidence |
| TEST migration／RLS／grant readback | PASS | migration version `20260825125421`；table/RPC/RLS/3 policies 存在；table ACL 僅 postgres／service_role／authenticated，`anon` REST 401；advisor 僅既有 baseline WARN |
| TEST RPC round-trip／replay | PASS | 三層 subtree 兩方向 committed；exactly-one-source、activity 6、同 operation replay 無新增 mutation；fixture 已清理 |
| Supabase local/TEST DB execution | PASS（TEST）／N/A（local） | TEST 已透過官方 Management API 套用 migration；本機 Docker daemon 未運行且 PostgreSQL 18 未碰既有 DB |
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
- DB01／DB02 已有 TEST 實際 apply、backup、success／round-trip／replay／RLS／grant readback；DB03 的 authenticated outsider、partial subtree、linked/dependency reject 與完整 Level 3 smoke 仍未完成，不能升級為整體 DB QC 完成。

## QC 判定

本地 CAPA implementation、TEST backup、DB01／DB02 與 failure containment 為 PASS；DB03 尚部分待驗，Level 3、production migration/deploy 與 Level 4 仍未完成，沒有將其冒稱為 release。任一 exactly-one-source 不變量失敗即 stop-ship。
