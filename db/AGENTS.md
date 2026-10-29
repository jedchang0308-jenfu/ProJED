# DEV-139 ProJED 資料庫邊界

這個目錄只放 ProJED DEV-139 的 Cloud SQL／PostgreSQL app-owned schema 與 forward-only migration。它不是現有 `supabase/migrations/` 的別名，也不能把 Supabase policy、`auth.uid()`、RPC 或歷史 migration 原封搬入。

## 所有權與執行責任

- `projed_owner_disposable` 擁有本 app 的 schema、table、function 與 policy；runtime 不可成為 owner、BYPASSRLS 或取得 owner membership。
- `projed_migrator_disposable` 只在已核實的 DEV-139 disposable 或 managed binding 內執行本目錄的有序 migration；不建立 database、foundation role、Secret 或其他 app 的物件。
- `projed_importer_disposable` 只在 runtime 尚未開放業務寫入的空白 candidate DB 執行一次性、單交易 full-snapshot import／reconciliation；不得執行 DDL、UPDATE、DELETE 或成為 owner／BYPASSRLS，正式 credential 由 foundation／release 邊界另行建立與撤銷。
- `0020` 允許上述受控 importer 一次匯入已有 source Google proof 的 active account guard（revision=1），須先在同一來源快照排除 Auth 已停用／刪除狀態；不擴張 runtime 的 guard 權限，也不按 email 猜配或啟用缺 proof 的帳號。
- `projed_runtime_disposable` 依 app source profile 取得自有 domain 的精確 grants／RLS；不執行 DDL、刪除 profile、修改 guard／ledger／metadata 或讀其他 app core。僅 `0022` 首次登入與 `0023` 已有 Google proof 的 email 同步可依下方條件插入／更新；缺 proof／guard 或 inactive 不自動補建／啟用。身分 current state 只可使用 owner 已授權且版本釘定的 `platform_contract.read_projed_principal_state_v1`；source adapter 不代表正式 grant 或已發布契約。
- `0022` 是 runtime profile／proof／guard INSERT 的窄例外，僅限首次登入建立全新 UUID，且必須在同一交易內綁定未過期、仍為 `processing` 的 login intent claim 與尚無既有 proof 的已驗證 Google subject。column grants 僅允許 profile `(id,email,display_name)`、proof `(google_subject,local_user_id)`、guard `(local_user_id,active,revision)`；RLS 限制 profile id／current actor／email、Google proof 與 active revision 1 guard。註冊 insert 不覆寫既有 profile、proof 或 guard；既有 profile 欄位更新授權維持原狀，且註冊路徑不提供刪除、rebind 或自動啟用既有 guard 的權限。`registration_scope_valid_v1()` 為無參數 `SECURITY INVOKER` helper，先驗證 GUC 文字形狀再於自身 login-token RLS scope 中查 processing intent；各 policy 的讀取方向不得形成 RLS 遞迴。
- `0023` 僅允許 runtime 在既有 email 確實變更時更新 `profiles.email`。同一交易必須綁定仍為 `processing` 且未過期的 login intent claim、已驗證 Google subject 與原 profile UUID，並證明該 Google proof 仍指向該 UUID；不更新 UUID、proof、guard 或其他 profile 欄位。既有 `display_name`／`ui_preferences`／`updated_at` 欄位更新權限維持原狀。`profile_verified_email_update_v1()` 為固定 `search_path` 的 `SECURITY INVOKER` trigger，NULL 或不相符狀態以 `42501` 拒絕；email 無實際變更時不要求註冊 scope。
- `0024` 只允許 server 在 exact `rag_record_id` 且 actor 可寫來源 record 的範圍內維護 `knowledge_records` 文件 mirror、append-only versions 與 chunks；record 的 RAG 啟用限定 published、non-private 且已有 source document。一般文件讀取仍由 `0017` source-record 權限與 pointer 決定。Index job INSERT/worker UPDATE 綁 exact document/job、Google provider、current version/hash 與有效 lease；embedding 寫入限目前 job claim、current chunk/version/hash 及 3072 維 Google model。job supersede 只允許可寫來源下的 pending/running job；`external_rag_objects` 不授 runtime DML。Project LLM access log 只允許有 `read_board` 的 actor 存取／寫入自己的 project row，不擴張 workspace-wide audit 權限。
- `0025` 以 exact `rag_document_id`、啟用文件及有效 actor context 提供 worker row-lock policy；`WITH CHECK (false)` 不新增 document UPDATE 路徑，也不放寬既有 SELECT。job guard 僅在 owner 執行的巢狀 FK trigger 且 row 僅有 tenant cascade 或 `document_version_id` 非空轉 NULL 時略過；runtime 仍無 tenant／provenance 欄位 UPDATE 權限。
- `0026` 保留原會議 capture／segment／pointer／run／transcript／review／projection 及 cleanup／budget／usage 的 11 類資料；僅授一次性 importer SELECT／INSERT，runtime 無直接讀寫。衍生 scope 綁定原 capture／record／Board，轉錄與 review 綁同 capture；清理義務在父項刪除後保留原 SET NULL，usage 保留原無 FK 的歷史 UUID。金額為原 bigint 微元，numeric／JSON／timestamp 精度不經 JS number 轉換；本 migration 不啟用錄音 worker 或付費 provider。
- migration 必須可重複核對 checksum；相同版本及 bytes 只能 no-op，版本／checksum 漂移、缺號或未知檔案必須拒絕。禁止 down migration 與修改既有 SQL。

既有 migration 已將四個專用角色 ID 固定為 `_disposable` 後綴。為維持 checksum 與 forward-only 原則，managed profile 仍沿用這些 app 專用角色 ID；後綴是歷史名稱，不代表可繞過 managed binding。若未來更名，須新增 migration 完成 ownership／grant／policy 轉移，不得改寫 `0001`～`0014`。

## SQL 邊界

- 物件只能落在 `projed_core`／`projed_contract`，且需符合本次 source-controlled DEV-139 profile 的 allowlist。
- 所有 helper 必須是 `SECURITY INVOKER`、固定 `search_path` 並使用完整 schema 名稱；不得讀 `auth.users`、`auth.uid()` 或客戶端可傳入的 actor 參數。
- 新物件需明確撤銷 PUBLIC 權限；含使用者／資源資料的 table 須啟用並 FORCE RLS。不得建立跨 core FK、extension、任意 dynamic SQL 或 `SECURITY DEFINER`。
- 變更採 forward-only；runtime 啟動不自動 migrate、不修 grants、不以 checker 通過為由修改既有 shared foundation ACL。

靜態 checker 只檢查 source／SQL 形狀，不能取代 disposable PostgreSQL catalog、RLS、pool cleanup 或 HTTP verifier。
