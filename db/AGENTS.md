# DEV-139 ProJED 資料庫邊界

這個目錄只放 ProJED DEV-139 的 Cloud SQL／PostgreSQL app-owned schema 與 forward-only migration。它不是現有 `supabase/migrations/` 的別名，也不能把 Supabase policy、`auth.uid()`、RPC 或歷史 migration 原封搬入。

## 所有權與執行責任

- `projed_owner_disposable` 擁有本 app 的 schema、table、function 與 policy；runtime 不可成為 owner、BYPASSRLS 或取得 owner membership。
- `projed_migrator_disposable` 只在已核實的 disposable binding 內執行本目錄的有序 migration；不建立 managed database、foundation role、Secret 或其他 app 的物件。
- `projed_runtime_disposable` 只取得 profile／guard 的精確查詢與受限欄位更新權；不執行 DDL、插入／刪除 profile、修改 guard／ledger／metadata 或跨 app 查詢。
- migration 必須可重複核對 checksum；相同版本及 bytes 只能 no-op，版本／checksum 漂移、缺號或未知檔案必須拒絕。禁止 down migration 與修改既有 SQL。

## SQL 邊界

- 物件只能落在 `projed_core`／`projed_contract`，且需符合本次 source-controlled DEV-139 profile 的 allowlist。
- 所有 helper 必須是 `SECURITY INVOKER`、固定 `search_path` 並使用完整 schema 名稱；不得讀 `auth.users`、`auth.uid()` 或客戶端可傳入的 actor 參數。
- 新物件需明確撤銷 PUBLIC 權限；含使用者／資源資料的 table 須啟用並 FORCE RLS。不得建立跨 core FK、extension、任意 dynamic SQL 或 `SECURITY DEFINER`。
- 變更採 forward-only；runtime 啟動不自動 migrate、不修 grants、不以 checker 通過為由修改既有 shared foundation ACL。

靜態 checker 只檢查 source／SQL 形狀，不能取代 disposable PostgreSQL catalog、RLS、pool cleanup 或 HTTP verifier。
