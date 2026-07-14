# ADR-041: Board Backup Package V2 與交易式匯入

狀態: Accepted / Human Confirmed / Implemented Locally / Release Pending
日期: 2026-07-14
決策範圍: DEV-047、Settings backup/import、Supabase transaction boundary、legacy WBS compatibility
關聯文件: `ai-doc/specs/SPEC-047-board-backup-package-transactional-import.md`

## Context

DEV-038 已把現有 UI 的不對稱事實說清楚：匯出是前端 store 中的 `nodes/dependencies/tags/workspaces`，匯入卻把檔案內容改綁到目前 workspace/board。當時的授權邊界是文案與防呆，不改資料格式或 backend。

現況不能作為長期備份架構，原因如下:
- 前端已載入資料不等於全域 canonical data，檔案完整度會受到瀏覽狀態影響。
- legacy 檔案可能含多看板資料，但 importer 會攤平成目前看板。
- `replaceAllByProject()` 先刪除目標資料，再逐筆 best-effort upsert，無法保證全成或全敗。
- UI 沒有正式的 manifest、checksum、compatibility、diff/preflight、transaction report。
- ProJED 還有 records、attachments、permissions、calendar subscriptions 與 audit 等資料，現有檔案不能被稱為完整全域備份。

## Decision Drivers

- 使用者必須能在執行前理解備份範圍與匯入結果。
- 破壞性匯入失敗時，目標看板不得留下半套資料。
- 備份資料真相必須來自 backend canonical reads，而不是 UI cache。
- 預設流程要降低不可逆覆寫的機率。
- 舊檔案需要可解釋的相容路徑，但不能把危險行為永久保留下來。
- 第一階段需有可完成、可驗證的邊界，不能用「完整全域還原」無限擴張。

## Decision

### 1. Current delivery scope is board-only

建立 `projed-backup` schema version 2，第一階段只支援單看板 package。Package 以 manifest 明列包含與排除的資料域；不得稱為完整帳號、工作區或 ProJED 全域備份。

### 2. Canonical pipeline replaces direct store import/export

採用固定流程:

```text
scope -> export package -> inspect -> plan -> execute transaction -> verify
```

Settings UI 不再直接呼叫 Zustand legacy `exportData/importData`。`src/features/backup` 擁有 schema、serializer、validator、legacy adapter、planner 與 ID mapper；application service 負責 orchestration；backend adapter/RPC 負責資料真相與交易。

### 3. Copy is default; replace is constrained recovery

- 預設 `copy_to_new_board`：所有 board/task/dependency ID 重建，不修改來源看板。
- 進階 `replace_current_board`：只允許 package source board ID 等於 target board ID 的同源還原。
- 跨看板資料移轉使用 copy，不允許把另一張看板直接覆寫目前看板。
- replace 保留 target board identity/title/memberships/calendar subscriptions，只取代 package 所治理的 task/dependency/tag-assignment content。

### 4. Server transaction is mandatory

Supabase 以單一 RPC 或等價 transaction 執行 create/copy/replace。RPC 必須:
- server-side 驗證 `auth.uid()`、workspace/board membership 與 destructive restore 權限。
- 使用 execution ID 防止重送重複建立資料。
- replace 時 lock target 並比對 expected fingerprint，偵測 plan 後的並行修改。
- 任一寫入或 validation 失敗全部 rollback。
- 回傳結果 counts 與 post-write fingerprint，供 read-after-write verification。

Client-side delete/insert、best-effort row write 或 compensating cleanup 不能作為正式一致性機制。

### 5. Out-of-package references are protected

V2 不包含 Knowledge Records 等資料域。因此 replace preflight 必須檢查目標中將被刪除的 task 是否仍被 out-of-package record link 參照；存在時阻擋，不允許用警告繞過。Package 中保留的 task ID 以 upsert 更新，避免不必要 delete cascade。

### 6. Legacy files are inspect-first and non-destructive

`wbs-1.0/1.1/1.2/2.0/unversioned` 由 `LegacyBackupAdapter` 辨識。只有能可靠抽出一個 source board 時，才可轉成 V2 inspection 後走正常 plan；global/ambiguous 檔案不得直接進 executor。

### 7. DEV-038 remains valid during transition

DEV-038 的 production UI 與風險文案在 DEV-047 發布前保持 authoritative。DEV-047 是下一版資料架構，不回寫歷史宣稱 DEV-038 已提供真實還原能力。DEV-047 上線後才移除「全域快照 -> 目前看板」legacy 主流程。

## Alternatives Considered

### A. Only align the two UI cards

Rejected。視覺相同但 scope/data/action 不同，會讓使用者更確信它們可 round-trip，風險高於現況。

### B. Keep global export and add global restore

Rejected for Phase 1。現有 export 未涵蓋 records、attachments、permissions、calendar、audit，也不是 canonical all-workspace query；要稱 global restore 必須先解決跨域、容量、隱私與 operator 權限。

### C. Import every file into current board with ID remapping

Rejected。這會把多看板結構攤平、破壞來源邊界，且無法安全處理 record links、global ID collision 與 workspace-level tag/member semantics。

### D. Client-side sequential write with rollback attempts

Rejected。browser/network failure 可能中斷補償流程；無法提供可證明的 atomicity。

### E. Replace is removed entirely

Rejected。真正的同源備份仍需要還原用途；以 same-origin、pre-backup、fingerprint、reference blocker 與 transaction 約束，可把它保留為受控 advanced action。

## Consequences

Positive:
- 匯出與匯入共享同一 package contract，使用者不再自行推算 scope。
- 預設 copy 降低資料覆寫風險。
- Transaction + fingerprint + verification 可提供可稽核的 all-or-nothing 證據。
- Legacy 仍可辨識，但不再永久綁定危險的 flatten behavior。
- 未來 workspace/account backup 可沿用 package/inspect/plan 概念，不必沿用 board executor。

Costs:
- 需要新的 domain module、Supabase migration/RPC、local-test adapter 與多層 verifier。
- replace 的相容限制比現有 importer 嚴格；部分舊檔只能 inspect 或抽出單一看板。
- Records、attachments 等不在 V2，UI 必須持續清楚揭露 exclusions。
- Production release 屬 DB/RLS/RPC 高風險變更，必須走 TEST Level 3 與 deployment release gate。

## Invariants

- `format === 'projed-backup' && schemaVersion === 2` 才能直接進 V2 planner。
- checksum/schema/limits/permission/compatibility 任一不通過，mutation count 必須為 0。
- copy 不修改 source board。
- replace 只接受同源 board，且 out-of-package blocking reference count 必須為 0。
- execute 前後 target fingerprint 必須可比對；失敗 rollback 後 fingerprint 不變。
- server transaction 成功前不得修改 client canonical store。
- 匯入不建立 membership、不提升 role、不匯入 token/secret。
- verification 不通過時不得向使用者宣稱完成。

## Follow-Up

- RD 已依 SPEC-047 Phase 1 完成 `src/features/backup`、application service、Supabase RPC migration source、local-test adapter 與 Settings UI。
- QA/QC 已完成 package contract、transaction failure injection、role/security matrix、browser communication、readback 與 regression gates；詳見 `QC-DEV-047`。
- Workspace backup、account/environment recovery 只保留 future capsule，需人類重新確認範圍後另開交付點。
- Production migration/deploy 不在本文件授權內。
