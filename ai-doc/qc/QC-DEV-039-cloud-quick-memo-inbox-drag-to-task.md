# QC-DEV-039: 雲端快速備忘與拖移轉任務事實驗證報告

日期：2026-06-30

## 驗證結論

狀態：Done / Production DB QC Passed / Local + Browser Gates Passed。

目前已完成前端、型別、靜態合約、瀏覽器冒煙、相關回歸驗證，以及 production Supabase migration/RLS/RPC 驗證。production DB migration 已套用到 `knodlkxqpcqyrtgwpdst`，並補上一個 hardening migration 撤銷 `public` / `anon` 表權限。另以 production persistent smoke 驗證同帳號跨 session 可見、其他帳號不可見，測試資料已清除。

## 已驗證項目

- `npm.cmd run verify:dev-039-cloud-quick-capture-inbox`：通過。
- `npm.cmd exec tsc -- --noEmit`：通過。
- `npm.cmd run build`：通過。
- `npm.cmd run dev:test:server`：成功啟動測試伺服器 `http://127.0.0.1:4173/`。
- `npm.cmd run verify:dev-039-cloud-quick-capture-inbox-browser`：通過。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`：通過。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`：通過。
- `npm.cmd run verify:dev-034-pwa-install-guidance`：通過。
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`：通過。
- `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`：通過。
- `npm.cmd run verify:dev-036-trello-like-workspace-governance`：通過。
- `npm.cmd run verify:supabase:static`：通過。

本輪 production hardening 後重新驗證：
- `npm.cmd run verify:dev-039-cloud-quick-capture-inbox`：通過。
- `npm.cmd run verify:supabase:static`：通過。
- `npm.cmd exec tsc -- --noEmit`：通過。
- `npm.cmd run build`：通過。
- `npm.cmd run verify:dev-039-cloud-quick-capture-inbox-browser`：通過。

## 驗證到的產品行為

- 快速捕捉功能的使用者可見名稱已由「收件夾」調整為「備忘錄」語意。
- 入口文案使用「快速備忘」「存入備忘錄」，避免讓使用者誤解為任務收件匣或郵件 inbox。
- 未登入時仍可先存本機，登入後提供匿名本機備忘匯入/認領流程。
- 已登入時備忘項目可同步至雲端資料表設計，並保留 local outbox fallback。
- 備忘資料模型支援雲端 ID、client mutation ID、同步狀態、匿名 owner key、認領需求、來源 workspace/board/node 與 promotion metadata。
- 看板內同一個 `QuickCaptureShell` 同時承載快速輸入與可拖移待整理備忘清單，備忘項目可用與一般任務拖移一致的 dnd-kit payload 進入任務清單或看板位置。
- 2026-06-30 UX correction：使用者實測後取消獨立備忘錄抽屜，避免「快速備忘」與「備忘錄」分裂成兩個浮窗。
- 2026-06-30 drag consistency correction：備忘與任務共用 `TaskDragHandle` 與 `TaskDragOverlayPreview`，不再維持另一套拖移外觀模組。
- 2026-06-30 drop target correction：`quick-capture-item` 已納入 Kanban column/card/checklist drop target highlight 條件，備忘拖移時會顯示同任務拖移的定位框。
- 備忘轉任務的後端設計使用 `promote_inbox_item_to_task` RPC，目標是單次交易完成任務建立與備忘狀態更新，避免前端雙寫不一致。

## 已完成的遠端 DB QC Gate

- Production migration `20260630060610 / cloud_quick_memo_inbox_items` 已套用。
- Production hardening migration `20260630060727 / harden_quick_memo_inbox_items_privileges` 已套用。
- `public.inbox_items` 已存在，RLS enabled。
- `public.promote_inbox_item_to_task(...)` 已存在。
- owner-only select/insert/update/delete policies 已存在。
- `authenticated` 具備 SELECT/INSERT/UPDATE/DELETE。
- `anon` 無 SELECT/INSERT；實測 `select public.inbox_items` 回 `permission denied for table inbox_items`。
- rollback transaction 驗證 owner 可 insert/select 自己的 memo。
- rollback transaction 驗證 non-owner 看不到其他人的 memo，update/delete count 均為 0。
- rollback transaction 驗證 promotion RPC 可建立 task、memo 轉 promoted、task metadata 連回 memo。
- rollback transaction 驗證同一 promotion key 重試不重複建立 task。
- rollback transaction 驗證 non-owner promote 失敗，錯誤為 `Memo item belongs to another user.`
- production persistent smoke 驗證同帳號新 session 可讀到剛建立的 memo，其他帳號讀不到。
- production cleanup 驗證 `qc_inbox_rows_persisted=false`、`qc_wbs_rows_persisted=false`。

## 補充說明

- 真實手機與電腦的人工實機點擊未執行；本輪以同帳號不同 DB session 驗證雲端資料可見性，並以 DEV-039 browser smoke、BoardView dnd-kit contract、promotion RPC rollback test 覆蓋第一版 release gate。

## 遠端 Supabase 唯讀 preflight - 2026-06-30

目標 production project ref：`knodlkxqpcqyrtgwpdst`。

已確認：
- Production 可透過 Supabase MCP 查詢。
- Production preflight 時 migrations 尚未包含 `20260630060610_cloud_quick_memo_inbox_items`。
- Production 尚未存在 `public.inbox_items`。
- Production 尚未存在 `public.promote_inbox_item_to_task(...)`。
- Production 已存在 migration 所需核心物件：`public.profiles`、`public.projects`、`public.tenants`、`public.wbs_items`。
- Production 已存在 `public.touch_updated_at()` trigger function。
- Production 已存在 `private.current_user_can_write_project(target_tenant_id uuid, target_project_id uuid)`。
- Production 既有 `profiles`、`projects`、`tenants`、`wbs_items` 均已啟用 RLS。

Development project ref：`fhisnnufoeulxqrchldf`。

結果：
- 兩次透過 Supabase MCP 查詢皆 connection timeout。
- 目前無法在 development project 完成 DB preflight 或套用驗證。

PM 判定：
- Migration 套用到 production 前的相容性 preflight 沒有發現明確 schema 缺口。
- 但套用 production migration 屬於高風險 DB schema 變更，需使用者明確確認目標環境與風險接受後才可執行。

## Release Gate 判定

判定：DEV-039 release gate passed。

原因：production DB gate 已通過，本輪新增 hardening migration 後也已重跑 DEV-039 static gate、Supabase static、TypeScript、build 與 browser smoke，repo 與 production migration history 已對齊。

## 需要補齊的輸入

- 遠端 Supabase project ref，或可用的資料庫連線資訊。
- 若要由 Codex 代為套用 migration，需要確認目標環境是 staging 還是 production。
- 若選擇先接受本機實作完成，需明確將「遠端 DB 套用與 RLS QC」拆成後續 release task。
