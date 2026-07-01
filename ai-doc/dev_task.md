# ProJED Dev Task Control Board

## PM Update - 2026-06-30

### DEV-040: 任務專區與快速任務入口

狀態: Production Released / Production Smoke Passed
節點類型: 交付點
優先級: P0 task identity + high-frequency UX, P1 cross-workspace aggregation
父交付點: DEV-039 雲端快速備忘與拖移轉任務
關聯交付方向: SPEC-002 全人個人與團隊待辦平台, SPEC-028 四模式一致任務操作契約, SPEC-039 雲端快速備忘
是否計入產品交付完成: 是
建立日期: 2026-06-30

交付文件:
- `ai-doc/specs/SPEC-040-personal-task-zone-and-quick-task-entry.md`
- `ai-doc/qa/QA-DEV-040-personal-task-zone-and-quick-task-entry.md`

使用者已確認:
- `1B+C`: 此功能同時是個人任務控制中心，也是跨工作區 / 專案的任務入口。
- `2A`: 快速輸入應直接建立任務，不應先建立備忘再轉任務。
- `3A+C`: 系統需支援個人私有任務專區，並保留未來彙總所有可存取 workspace / project 任務的方向。
- 使用者認為目前分成兩個浮窗不直覺，並希望高使用率視窗移到更主視覺的位置。

PM 架構決策:
- 不把 `inbox_items` 擴張成第二套完整任務系統。
- 快速建立項目應使用 canonical task record：`TaskNode` / `wbs_items`。
- Phase 1 採私有 personal task zone + `待歸位` 任務 + 拖到看板定位。
- Phase 1 DB 落點鎖定：每位 authenticated user 建立或重用一個 hidden personal project；快速任務是該 project 底下的正常 `wbs_items`，不得讓 `wbs_items.project_id` nullable，也不得新增 global task table。
- 任務專區拖移必須共用既有任務拖移 primitives 與定位框視覺，不另寫 memo-only 拖移動畫。
- 跨工作區聚合屬 End-State / Phase 2；本輪先文件化，不納入第一個 RD pass，除非使用者另行授權。
- 舊 DEV-039 `inbox_items` 不在 Phase 1 自動 migration；若需呈現，只能整合在 `任務專區` legacy 區塊，不得恢復第二個主流程浮窗。

已授權 Phase 1 範圍:
- 新增主視覺入口 `任務專區`。
- 快速輸入直接建立 personal-zone task。
- 顯示 `待歸位` 個人任務。
- 個人任務支援核心任務操作：建立、標題編輯、完成 / 取消完成、刪除、雲端同步、拖移、歸位到看板。
- 若既有 task details 已支援 description、due date、checklist / subtasks 且不依賴 board-only context，personal-zone task 也必須支援；若無法支援需明確列為 defer 或 stop condition。
- 個人任務可拖到目前看板位置並使用正常任務 drop indicator。
- 個人任務需維持私有、雲端同步、跨裝置可見。
- 主視覺 IA 鎖定：Sidebar 一級入口 `任務專區` + `待歸位` badge；Home 或 board-adjacent primary area 提供快速建立或進入任務專區；底部浮窗只能降級為 shortcut。

不在第一個 RD pass:
- AI 解析 / token 消耗型整理。
- 團隊共用收件匣。
- 完整跨 workspace aggregated filters。
- 行事曆 / 通知 / reminder 引擎重構。
- 未經 release gate 的 production deploy。

RD stop conditions:
- 若無法保留同一 task id 完成 board placement。
- 若必須新增 global task table 或讓 `wbs_items.project_id` nullable。
- 若 RLS 會導致個人任務暴露給 workspace 成員。
- 若個人任務只能支援 memo-like 行為，無法達到 Phase 1 核心任務功能矩陣。
- 若 implementation 需要 production migration / deploy 但尚未再次取得授權。

交付證據要求:
- changed files list。
- migration names, if any。
- personal-zone task storage 說明。
- drag/drop reuse existing task primitives 說明。
- QA-DEV-040 result before release/deploy。

RD implementation update - 2026-06-30:
- 已新增 `TaskZoneView` 與 `useTaskZoneStore`，主視覺入口改為 `任務專區`，快速輸入走 personal task zone service，不再走 `inbox_items`。
- 已新增 `taskZoneService` dataBackend contract 與 Supabase implementation，包含 `ensureZone`、`listUnplacedTasks`、`createQuickTask`、`updateTask`、`archiveTask`、`placeTaskOnBoard`。
- 已新增 migration `20260630070000_dev_040_personal_task_zone.sql`，定義 hidden personal tenant/project、`ensure_personal_task_zone`、`create_personal_quick_task`、`place_personal_task_on_board` 與 function grants。
- 已將 Sidebar 加入一級 `任務專區` 入口與 `待歸位` badge；HomeView 加入主視覺快速建立任務入口。
- 已將 BoardView 中的主流程快速面板改為 `TaskZoneBoardPanel`，拖曳 source 使用 `personal-task-zone-item`，drop 後呼叫 personal task placement service 並沿用 `TaskDragOverlayPreview`。
- 已保留舊 `QuickCaptureShell` 作為 legacy 元件，但 App/Board 主流程不再掛載，避免新快速輸入繼續寫入 `inbox_items`。
- 已新增 static verifier `npm run verify:dev-040-personal-task-zone`，檢查 task-zone UI、App/Sidebar/Home routing、BoardView placement、dataBackend contract、Supabase RPC contract、migration 與 dev_task evidence。
- 已新增 browser smoke verifier `npm run verify:dev-040-personal-task-zone-browser`，檢查 Sidebar 一級入口、Home 主視覺卡、任務專區建立任務、BoardView 整合面板與共用 drag handle。
- 已補 `place_personal_task_on_board` 防呆：target project 不得是 personal task zone 本身，避免把待歸位任務「歸位」回隱藏個人 project。
- 已將任務專區 card 拆成 non-draggable 與 draggable wrapper；主頁 card 不需要 DnD context，看板內 card 才註冊 `personal-task-zone-item` drag source。
- 已補 placement order contract：前端把 drop intent order 傳入 task-zone placement input，fallback 與 Supabase placement 語意一致。
- 已補 RPC subtree move：personal task 歸位到看板時，連同 descendant tasks 一起移到 target tenant/project，避免根任務歸位後子任務留在 hidden personal project。
- 已補 DB-level idempotency guard：personal task zone 的 `client_mutation_id` 使用 unique expression index，避免重試或競態建立重複任務。
- 已補 RPC idempotency 競態處理：`create_personal_quick_task` 撞 unique violation 時回查並回傳既有 task，避免 concurrent retry 對前端變成建立失敗。
- 已補 personal zone root-task display：任務專區列表只顯示 root personal tasks；若 personal task 未來有子任務，子任務跟隨 root 歸位，不會在待歸位清單重複成獨立卡片。
- 已補開發文件 release handoff：SPEC-040 與 QA-DEV-040 明確列出 migration 套用順序、static/browser/TypeScript/build gate、Supabase/RLS evidence、rollback 條件與不得宣稱完成的 stop condition。
- 已補任務專區詳情面板：待歸位任務在尚未進看板前可編輯標題、狀態、開始/結束日期與多備註欄，並同步到 TaskNode 欄位；指派、tag、records、依賴等 board-context 功能保留到歸位後使用既有任務詳情。
- 已修正任務專區詳情面板備註儲存 guard：改為 dirty-based autosave，只有使用者編輯或新增備註欄才會寫回，避免切換任務或 props 同步時誤觸發儲存，也避免連續編輯被 skip flag 吃掉。
- 已確認並補 verifier 契約：Supabase `wbs_items` mapping / update payload 已涵蓋 `detail_notes`、`description`、`status`、`start_date`、`end_date`，任務專區詳情面板新增欄位可同步到 canonical TaskNode 資料層。
- 已補任務專區詳情面板 close-flush：若使用者編輯備註後立即關閉面板，會先同步最後一次 dirty notes，再關閉，避免 debounce timer cleanup 造成最後輸入遺失。
- Release gate 修正：已更新 DEV-039 static verifier，使其承認 DEV-040 已將 Board/App 主流程從 `QuickCaptureShell` supersede 為 `TaskZoneBoardPanel` / `task_zone`，DEV-039 只保留 cloud memo legacy infrastructure 與資料契約檢查。
- Release gate production QC 發現並修正 `ensure_personal_task_zone()` output-column ambiguity：`tenant_id/project_id` output 欄位與 `on conflict (tenant_id, user_id)` 在 PL/pgSQL 中衝突，已改用 `tenant_members_pkey` / `project_members_pkey` constraint name，並新增 hotfix migration `20260701010000_fix_dev_040_personal_task_zone_conflict.sql`。
- Release gate evidence - 2026-07-01:
  - `npm run verify:dev-039-cloud-quick-capture-inbox`: Passed.
  - `npm run verify:dev-040-personal-task-zone`: Passed.
  - `npx tsc --noEmit`: Passed.
  - `npm run build`: Passed; release bundles include `TaskZoneView-Db9aHybR.js`, `BoardView-WpxNL38B.js`, `index-C-FBBdhO.js`.
  - `npm run verify:dev-039-cloud-quick-capture-inbox-browser`: Passed after verifier was updated for DEV-040 superseded workflow.
  - `npm run verify:dev-040-personal-task-zone-browser`: Passed.
  - Supabase production migration applied: `20260701005406 dev_040_personal_task_zone`.
  - Supabase production hotfix migration applied: `fix_dev_040_personal_task_zone_conflict`.
  - Production DB QC passed: anon RPC rejected; functions/indexes/authenticated grants exist; DB-level authenticated flow verified personal zone idempotency, quick task idempotency, detail field persistence, placement to normal project, and QC task cleanup.
- 已補 task-zone load contract：`loadZoneTasks` 一次完成 zone bootstrap 與 task load，避免前端 load 重複呼叫 ensure zone。
- 已補 dependency scope move：personal task subtree 歸位時，子樹內部 `wbs_dependencies.tenant_id/project_id` 同步移到 target board。
- 已修正 tag assignment scope 策略：只保留 target tenant 已存在的 tag assignment 並同步 project scope；personal-zone-only tag assignment 會移除，避免把個人隱藏 tenant tag 錯掛到正式 workspace。
- Supabase CLI 在此環境不可用，migration 檔名採手動 timestamp 建立；尚未套用 local/production DB。
- TypeScript/build/browser/Supabase/RLS gate 已於 2026-07-01 release gate 執行並通過；production deploy 與 post-deploy smoke 尚待執行。

### DEV-039: 雲端快速備忘與拖移轉任務

狀態: Done / Production DB QC Passed / Local + Browser Gates Passed
節點類型: 交付點
優先級: P0 cross-device capture trust, P1 inbox-to-task workflow
父交付點: DEV-034 App 快速啟動與加入主畫面 UX
關聯交付方向: SPEC-002 全人個人與團隊待辦平台
是否計入產品交付完成: 是
建立日期: 2026-06-30

關聯需求:
- 使用者確認目前快速記錄本機保存會造成手機記錄電腦看不到，期望工作流更順。
- 使用者決策採 `1C`: 快記先進個人雲端收件匣，整理時再選 workspace / board。
- 使用者決策採 `2A`: 整理後主要轉成正式任務，不先做完整備忘功能。
- 使用者決策採 `3B`: 未登入或離線時先本機暫存，登入或恢復連線後同步。
- 使用者要求評估並採納「可直接拖移快記到清單或看板位置，體驗像平時拖移任務」。
- 使用者希望 `2C` 文字解析但不消耗 token，因此採 deterministic `2C-lite`：規則拆標題、內容與簡單日期，不呼叫 AI / LLM。
- RD 主管審查後補齊 HCS 引導決策：promotion 採單一 transaction/RPC、未登入/換帳號 local outbox 採帳號綁定與匿名認領、TaskNode body 使用邏輯 `description`、promotion 必須檢查 target board create permission。
- 使用者決定產品命名由「收件匣」改為「快速備忘 / 備忘錄」；UI 不得顯示 `收件匣` 或 `Inbox`。

核心問題:
- 現有 `QuickCaptureShell` 與 `useQuickCaptureStore` 只使用 `localStorage`，登入使用者仍無跨裝置同步。
- 目前功能只完成捕捉，沒有雲端備忘錄、整理入口、同步狀態、轉任務狀態機與失敗復原。
- 目前 `BoardView` 的 DnD context 在看板內；全域 QuickCaptureShell 在 App root，若要做到同手感拖移，需讓 board-aware inbox drawer 接入既有 dnd-kit context，而不是另寫拖移引擎。

交付文件:
- `ai-doc/specs/SPEC-039-cloud-quick-capture-inbox-drag-to-task.md`
- `ai-doc/qa/QA-DEV-039-cloud-quick-capture-inbox-drag-to-task.md`
- `ai-doc/qc/QC-DEV-039-cloud-quick-memo-inbox-drag-to-task.md`

RD 執行範圍:
- 新增 Supabase `public.inbox_items` schema、RLS、grants、indexes 與 schema cache reload。
- 新增 `promote_inbox_item_to_task` RPC 或等效單一 transaction contract，避免 ghost task 與重複轉任務。
- 更新 Supabase database types、dataBackend inbox service 與 QuickCapture store sync contract。
- 本機 outbox v2 支援 `pending / syncing / synced / failed`、`clientMutationId` 去重、`createdAuthUserId` 帳號歸屬、匿名 item 認領與 legacy localStorage migration。
- QuickCaptureShell 文案改為 truthful sync state：`已同步`、`待同步`、`同步失敗`。
- 新增整理備忘錄入口與 `MemoTriageDrawer`。
- 在 board view 內讓已同步 quick capture item 可拖移到欄位、卡片間或 checklist zone，drop 後透過 promotion RPC 建立正式 `TaskNode`。
- 轉任務成功後標記 `InboxItem.promoted`，回填 `promoted_task_node_id`，避免重複轉換。
- 權限不足或 viewer 不得 promote 到 target board；target parent / order 必須屬於目前 board。
- 使用 deterministic parser 拆 title/detail/date，不呼叫 AI token。

RD implementation update - 2026-06-30:
- 新增 Supabase migration `20260630060610_cloud_quick_memo_inbox_items.sql`，建立 `public.inbox_items`、owner-only RLS、grants、indexes、schema cache reload 與 `promote_inbox_item_to_task` transaction RPC。
- 新增 hardening migration `20260630060727_harden_quick_memo_inbox_items_privileges.sql`，撤銷 `public` / `anon` 表權限，只保留 `authenticated` CRUD。
- 升級 `useQuickCaptureStore` 為 local outbox v2，包含 deterministic parser、匿名備忘認領、帳號隔離、legacy migration、cloud sync、promotion API。
- 更新 `QuickCaptureShell` 使用 `快速備忘 / 備忘錄` 命名，移除使用者-facing `收件匣` 文案，加入雲端同步、本機待匯入與同步失敗狀態。
- 將備忘整理與輸入整合回同一個 `QuickCaptureShell`；看板畫面不再顯示第二個備忘錄浮窗。
- 更新 `BoardView`，在 DnD context 內渲染可拖移版 `QuickCaptureShell`，支援備忘拖到欄位、卡片、checklist drop zone 後呼叫 promotion，再將回傳 TaskNode 寫入本地 WBS store。
- 新增 `inboxService` dataBackend contract、Supabase implementation、fallback implementation、`database.types.ts` 型別與 DEV-039 verifier scripts。
- 已通過 static verifier、browser verifier、TypeScript、build、相關回歸 gate 與 production DB/RLS/RPC/cross-session cloud visibility QC；DEV-039 可宣告 Done。

QC update - 2026-06-30:
- 已通過 `verify:dev-039-cloud-quick-capture-inbox`、`tsc --noEmit`、`build`、`verify:dev-039-cloud-quick-capture-inbox-browser`、DEV-028 static/browser、DEV-034 static/browser、DEV-035 static、DEV-036 static 與 `verify:supabase:static`。
- 已新增 QC 證據報告 `ai-doc/qc/QC-DEV-039-cloud-quick-memo-inbox-drag-to-task.md`。
- 產品命名決策已固定：使用者-facing 名稱為 `備忘錄` / `快速備忘`，不是 `收件匣`；technical table/RPC 名稱可暫保留 `inbox_items` 作為 implementation detail。
- 剩餘 blocker：目前環境缺少遠端 Supabase project ref 或 DB connection，無法套用並驗證 migration、RLS、RPC transaction 與真實跨裝置雲端同步。

Remote DB preflight update - 2026-06-30:
- 已從 env 找到 production Supabase project ref `knodlkxqpcqyrtgwpdst` 與 development ref `fhisnnufoeulxqrchldf`。
- Production 唯讀檢查確認尚未套用 DEV-039 migration，且尚無 `public.inbox_items` 與 `public.promote_inbox_item_to_task(...)`。
- Production 唯讀檢查確認 migration prerequisites 存在：`profiles`、`projects`、`tenants`、`wbs_items`、`public.touch_updated_at()`、`private.current_user_can_write_project(...)`，既有核心表已啟用 RLS。
- Development ref 兩次 Supabase MCP 查詢皆 connection timeout，無法作為安全 staging 驗證目標。
- 下一步需使用者明確確認是否允許套用 production DB migration；未確認前不得執行 production schema change。

Production DB migration update - 2026-06-30:
- 使用者已明確允許套用 production migration。
- 已套用 production migration `20260630060610 / cloud_quick_memo_inbox_items`。
- 初次 grants 驗證發現 `anon` 仍有表層 privileges；已套用 `20260630060727 / harden_quick_memo_inbox_items_privileges` 修正。
- 已驗證 production migration history 包含 DEV-039 兩個 migration。
- 已驗證 `public.inbox_items` 存在、RLS enabled、四個 owner-only policies 存在。
- 已驗證 `anon` 無 SELECT/INSERT 權限，`authenticated` 只保留 SELECT/INSERT/UPDATE/DELETE。
- 已用 rollback transaction 驗證 authenticated owner 可 insert/select 自己的 memo，non-owner 看不到且 update/delete count 為 0。
- 已用 anon role 實測 `select public.inbox_items` 回 `permission denied for table inbox_items`。
- 已用 rollback transaction 驗證 `promote_inbox_item_to_task` 可建立 task、memo 轉 promoted、task metadata 連回 memo、同 promotion key 重試不重複建立 task。
- 已用 rollback transaction 驗證 non-owner promote 回 `Memo item belongs to another user.`
- 已用 production persistent smoke 驗證同帳號新 session 可讀到剛建立的 memo，其他帳號讀不到；測試資料已刪除且確認 `qc_inbox_rows_persisted=false`、`qc_wbs_rows_persisted=false`。
- 本輪 hardening 後已重跑並通過 `verify:dev-039-cloud-quick-capture-inbox`、`verify:supabase:static`、`tsc --noEmit`、`build`、`verify:dev-039-cloud-quick-capture-inbox-browser`。

UX correction - 2026-06-30:
- 使用者實測指出「快速備忘」與「備忘錄」分成兩個浮窗不直覺。
- 已改為看板畫面只顯示同一個底部 `QuickCaptureShell`：上方輸入新備忘，下方直接列出待整理備忘並提供拖曳把手。
- App root 的全域 `QuickCaptureShell` 在 `board` view 隱藏，避免與看板內可拖移版重複。
- 舊 `MemoTriageDrawer` 元件已移除，避免未來回歸成雙浮窗。

Drag consistency correction - 2026-06-30:
- 使用者指出備忘拖移動畫與任務拖移不一致。
- 確認 DnD engine 原本已共用 BoardView 的 `DndContext`，但備忘項目有自己的 drag handle 與 overlay preview。
- 已將備忘拖移把手改用既有 `TaskDragHandle`。
- 已新增 `TaskDragOverlayPreview`，任務與備忘的 `DragOverlay` 共用同一個預覽元件，避免兩套動畫外觀。
- 已將 `quick-capture-item` 納入 Kanban column/card/checklist drop target highlight 條件，讓備忘拖過去時顯示與任務拖移一致的定位框。

交付邊界:
- 不做完整筆記 / 知識庫型備忘系統。
- 不做 `note` / `someday` 的完整整理 UI。
- 不做 AI 分類、AI 看板建議或 AI 任務拆解。
- 不做我的今日、通知中心、browser notification、email、calendar reminder。
- 不做輕量共享、改派或團隊 inbox。
- 不做非 board view 的跨畫面拖移；第一版 drag-to-task 以 BoardView context 為準。

RD acceptance:
- 登入使用者新增快速備忘後，手機與電腦可看到同一筆雲端備忘 item。
- 未登入或離線時可先保存本機，恢復登入/連線後自動同步。
- 未登入建立的匿名 item 登入後需明確認領才同步；換帳號不得把 A 帳號 pending item 同步到 B 帳號。
- legacy localStorage item 可升級到 outbox v2，且不丟失原文字。
- UI 明確顯示 `已同步`、`待同步`、`同步失敗`，不得用模糊文案。
- pending / failed item 不可轉任務，且顯示 disabled reason。
- 整理備忘錄可由快速備忘入口進入。
- 在 board view 中，已同步快記可拖到欄位或看板位置並建立正式 `TaskNode`。
- 快記轉任務不得採前端兩段式 task insert + inbox update；必須以單一 transaction / RPC 或等效機制保證 atomicity。
- 同一 inbox item / promotion key 重試不得建立第二張任務。
- 無 target board create permission 者不得 promote。
- 拖移 preview、drop highlight 與 toast 體驗需接近既有任務拖移。
- 成功轉任務後 `InboxItem` 標記 promoted，且不可重複轉同一筆。
- deterministic parser 不呼叫 LLM，不消耗 token。
- 390px mobile viewport 不出現重疊、裁切、水平 overflow 或無法關閉 drawer。

RD exit gate:
- `npm.cmd run verify:dev-039-cloud-quick-capture-inbox`
- `npm.cmd run verify:dev-039-cloud-quick-capture-inbox-browser`
- `npm.cmd run verify:dev-034-pwa-install-guidance`
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`
- `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`
- `npm.cmd run verify:dev-036-trello-like-workspace-governance`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

Supabase / DB gate:
- 新增 migration 後必須驗證 owner 可 CRUD、其他 authenticated user 不可讀寫、anon 不可存取。
- 必須確認 Data API expose / grants / RLS policy 與 PostgREST schema cache reload。
- 如需套用遠端 migration 或 production release，必須走 Supabase skill 與 deployment-release-gate。

Stop conditions:
- 如果 `inbox_items` 沒有正確 RLS 與 owner-only policy，停止。
- 如果新表未能被 authenticated client 透過 Data API 存取，停止。
- 如果拖移需要另做一套與既有任務不同的 drag engine，停止並回報 PM。
- 如果 drop order 無法與既有任務排序一致，停止。
- 如果無法以單一 transaction / RPC 或等效機制保證 `TaskNode` 與 `InboxItem.promoted` 原子一致，停止。
- 如果匿名認領或換帳號規則無法避免 local item 同步到錯誤帳號，停止。
- 如果 legacy localStorage migration 可能清空使用者文字，停止。
- 如果要使用 AI / LLM token 做解析或分類，需先取得使用者授權。
- 如果需求擴張到正式備忘、通知中心、我的今日或輕量改派，另開 DEV。

## PM Update - 2026-06-29

### DEV-038: 設定中心作用範圍一致性與高風險防呆

狀態: Ready for RD / SPEC + QA Ready
節點類型: 交付點
優先級: P0 backup/import/trash risk, P1 settings IA consistency
父交付點: DEV-036 Trello-like Workspace Governance
關聯開發點: DEV-037 行事曆訂閱來源範圍清晰化
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者追問：依行事曆訂閱邏輯，設定裡其他頁面是否也有邏輯不一致。
- 已確認 `備份與資料`、`回收桶`、`權限設定`、`快速開啟` 存在不同作用範圍混用問題。
- 使用者要求由 Dev PM 寫成開發文件，不足處用 HCS `#引導模式` 補足。

HCS 引導決策（採建議預設）:
- `1A`: 保留單一設定中心，但每個頁籤明確標示 `設定範圍`；暫不拆成多個設定入口。
- `2A`: 備份頁明確分成 `匯出全域快照` 與 `匯入至目前看板`；不在本 DEV 做完整 Workspace/Board 還原。
- `3A`: 回收桶改為 `目前看板回收桶`，清空前顯示看板名稱與任務數量。
- `4A`: 行事曆訂閱續接 DEV-037，不在本 DEV 重複實作資料契約。

核心問題:
- `SettingsView` 頁首目前以 `系統設定與管理 / 目前看板` 統包所有設定，導致全域快照、看板匯入、外部連結、裝置設定混在同一語境。
- `exportData` 實際匯出全域 `nodes/dependencies/tags/workspaces` 快照；`importData` 卻要求 active workspace/board 並匯入至目前看板。
- `RecycleBinView` 實際只依 `activeBoardId` 顯示封存任務，但入口與標題未明確說是目前看板回收桶。

交付文件:
- `ai-doc/specs/SPEC-038-settings-scope-consistency-and-risk-guardrails.md`
- `ai-doc/qa/QA-DEV-038-settings-scope-consistency-and-risk-guardrails.md`

RD 執行範圍:
- 更新 `SettingsView.tsx` 頁首、頁籤文案與各 section scope summary。
- 更新 `BackupSettings`，拆分全域匯出與目前看板匯入，並在匯入前新增確認摘要。
- 更新 `RecycleBinView` 文案與清空確認，明確標示 active board 範圍。
- 更新 `BoardMembersPanel` embedded mode 的 `看板權限` 文案與 target summary。
- 更新 `AppInstallAssistant` settings mode 的 `此裝置 / 目前帳號` scope summary。
- 補 static verifier、browser verifier 與 package scripts。

交付邊界:
- 不改 `exportData` / `importData` 的資料格式。
- 不做完整全域還原、Workspace 還原或 Board 還原 wizard。
- 不新增全工作區或全系統回收桶。
- 不修改 Supabase schema、RLS、migration。
- 不取代 DEV-037 的行事曆訂閱資料契約。

RD acceptance:
- 設定中心頁首不再用 `目前看板` 框住所有頁籤。
- 每個設定 section 都能看出作用範圍。
- 備份頁清楚區分全域匯出與目前看板匯入。
- 匯入備份前有目標看板確認，不會直接選檔後立即匯入。
- 回收桶明確是目前看板回收桶，清空前顯示目標看板與永久刪除數量。
- 看板權限頁顯示目前看板目標，不再與分享邀請主流程混淆。
- 快速開啟頁顯示此裝置 / 目前帳號範圍，不受 active board 語境影響。
- 390px mobile viewport 不因 scope summary 出現文字重疊、裁切或水平 overflow。

RD exit gate:
- `npm.cmd run verify:dev-038-settings-scope-consistency`
- `npm.cmd run verify:dev-038-settings-scope-consistency-browser`
- `npm.cmd run verify:settings-project-context`
- `npm.cmd run verify:settings-project-context-browser`
- `npm.cmd run verify:dev-036-trello-like-workspace-governance`
- `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`
- `npm.cmd run verify:dev-026-trello-like-board-share-ui`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

Conditional gate:
- 若本輪同步觸及 `CalendarSubscriptionsView` 或 DEV-037 已實作，需加跑 `npm.cmd run verify:dev-037-calendar-subscription-source-scope`；若 DEV-037 尚未實作，QC 記錄為 deferred dependency，不阻塞 DEV-038 的 Settings/Backup/RecycleBin 交付。

Stop conditions:
- 如果 RD 發現匯入實際會覆寫目前看板任務但無法在 UI 前置確認，停止，不得宣告完成。
- 如果清空回收桶確認無法取得正確 active board 與刪除數量，停止，不得改成更模糊的全域文案。
- 如果要改 import/export 資料格式或新增還原 wizard，另開 DEV，不納入本 DEV。
- 如果要改 DB schema、RLS 或 production release，必須走對應 Supabase / deployment-release-gate。

### DEV-037: 行事曆訂閱來源範圍清晰化

狀態: Ready for RD / SPEC + QA Ready
節點類型: 交付點
優先級: P1 settings IA and data-scope clarity
父交付點: DEV-036 Trello-like Workspace Governance
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者指出設定頁「工作區」與「看板」邏輯混亂，看不出來自己在訂閱哪一個範圍。
- 需要用 HCS `#問對問題 #差距分析 #設計思考 #溝通設計` 提出優化方案，並由 Dev PM 寫成開發文件。
- DEV-036 已決定 Workspace 採 Trello-like 容器模型；行事曆訂閱必須延續該語意。

HCS 引導補齊:
- `#問對問題`：這個頁面真正要回答的是「我要把哪個任務範圍同步到外部行事曆？」
- `#差距分析`：現有 filters 只有 `workspace_ids / assignee / date_types`，不能明確表達單一 Board scope；UI 也沒有 canonical source summary。
- `#設計思考`：從 active board 進入設定時，使用者最常見期待是訂閱目前看板；進階的 workspace / custom scope 不能成為預設。
- `#溝通設計`：每筆訂閱必須拆成 `來源` 與 `條件`，訂閱名稱只作為使用者自訂標籤。

核心決策:
- 新增訂閱預設來源：有 active board 時為 `目前看板`；沒有 active board 時為目前 Workspace 的 `工作區全部看板`。
- UI 第一段改為 `訂閱範圍`，支援 `目前看板`、`工作區全部看板`、`自訂範圍` 的語意分層。
- 資料契約延伸 `CalendarSubscriptionFilters`，加入 `scope_type?: 'board' | 'workspace' | 'custom'` 與 `project_ids?: string[]`。
- 既有缺少 `scope_type` 的訂閱視為 legacy `workspace` scope，UI 顯示 `工作區全部看板`。
- Board scope 必須由 Edge Function 與 DB validation 共同保證，不可只有前端文案。

交付文件:
- `ai-doc/specs/SPEC-037-calendar-subscription-source-scope-clarity.md`
- `ai-doc/qa/QA-DEV-037-calendar-subscription-source-scope-clarity.md`

RD 執行範圍:
- 更新 `CalendarSubscriptionFilters` type、service normalizer 與 create/update payload。
- 新增或延伸 Board / Project ref 查詢，讓 UI 能顯示 Workspace / Board path。
- 更新 `public.calendar_subscription_filter_allowed(filters jsonb)`，驗證 `scope_type` / `project_ids` / project-to-workspace 關係與使用者權限。
- 更新 `supabase/functions/calendar-feed/index.ts`，feed request 每次依 membership 與 project scope 重新計算 allowed projects。
- 改造 `CalendarSubscriptionsView`：建立表單、即時預覽、訂閱列表 summary、edit flow 與 mobile layout。
- 補 static verifier、browser verifier 與 ICS feed verifier。

交付邊界:
- 不做 Google Calendar write API 或雙向同步。
- 不新增 billing、seat、quota 或 realtime subscription。
- 不重做整個 Settings IA。
- 不變更 DEV-036 Workspace / Board 核心模型。

RD acceptance:
- 使用者建立訂閱前能清楚知道來源是目前看板、工作區全部看板，或自訂範圍。
- Board scope 的 `.ics` feed 不包含其他看板任務。
- Workspace scope 的 `.ics` feed 只包含使用者仍有權讀取的看板任務。
- 既有 legacy 訂閱仍可讀取、修改、停用、重新產生連結，且 UI 顯示為 `工作區全部看板`。
- 訂閱列表每筆都有 `來源` 與 `條件`，不需要使用者從名稱猜測。
- Mobile viewport 不因來源摘要造成文字重疊、裁切或水平 overflow。

RD exit gate:
- `npm.cmd run verify:dev-037-calendar-subscription-source-scope`
- `npm.cmd run verify:dev-037-calendar-subscription-source-scope-browser`
- `npm.cmd run verify:calendar-feed-ics`
- `npm.cmd run verify:settings-project-context`
- `npm.cmd run verify:settings-project-context-browser`
- `npm.cmd run verify:dev-036-trello-like-workspace-governance`
- `npm.cmd run verify:dev-026-trello-like-board-share-ui`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

Stop conditions:
- 如果無法在 Edge Function 中可靠限制 `project_id`，停止，不得宣告 Board scope 完成。
- 如果 DB validation 無法驗證 `project_ids`，停止並先補 migration / DB QC。
- 如果 UI 只能改文案但資料仍只能表達 workspace scope，不得把選項命名為 `目前看板`。
- 如果需要部署 Edge Function 或套 migration，必須走 deployment-release-gate。

### DEV-036: Trello-like Workspace Governance

狀態: Implemented / Local Automated QC Passed / DB unchanged
節點類型: 交付點
優先級: P1 workspace governance / IA correction
父交付點: 無
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者決定 ProJED 改成與 Trello 類似的 Workspace 模型。
- 開發計畫不得再局限於固定「我的工作區」與「共用工作區」兩項。
- Workspace 應作為多張 Board 的治理容器；Board 作為具體專案與任務執行單位。

核心決策:
- 採 Trello-like Workspace 模型。
- 使用者可建立多個 Workspace。
- 不限制為「我的工作區 / 共用工作區」兩筆固定資料。
- 「我的 / 共用」若保留，只能作為輔助 filter / view，不是資料模型。
- Board sharing 不會自動搬移 Workspace。
- Board 跨 Workspace 移動仍沿用 DEV-025 受控搬移。

HCS 引導決策（2026-06-29）:
- `1A`: 新增 Workspace 入口放在 Sidebar「工作區選單」標題列右側，以 `+` icon button 呈現，tooltip / accessible label 為 `新增工作區`。
- `2A`: Workspace create 採 backend-success-first；後端成功前不得寫入前端 Workspace 清單、active workspace 或 localStorage。
- `3A`: First-run 只自動建立 `我的工作區`，但使用者後續可建立多個 Workspace；authenticated user 可建立 Workspace，建立者成為 owner。

交付文件:
- `ai-doc/decisions/ADR-036-trello-like-workspace-governance.md`
- `ai-doc/specs/SPEC-036-trello-like-workspace-governance.md`
- `ai-doc/qa/QA-DEV-036-trello-like-workspace-governance.md`
- `ai-doc/qc/QC-DEV-036-trello-like-workspace-governance.md`

End-State Architecture:
- `tenants` 保持作為 Workspace。
- `projects` 保持作為 Board。
- `tenant_members` 管 Workspace 成員與 owner/admin 繼承。
- `project_members` 管 Board 可見性與寫入權限。
- Workspace 可代表公司、部門、團隊、外部協作範圍或大型工作群。

Phase Roadmap:
- Phase 0：PM / Architecture Alignment，建立 ADR / SPEC / QA / 文件索引。本輪完成。
- Phase 1：Workspace Create / Navigation MVP，Sidebar 工作區選單標題列右側新增 `+` 入口、dialog 建立 Workspace、backend-success-first create、First-run 建立 `我的工作區`、Home/Sidebar 支援多 Workspace 分組瀏覽、空 Workspace 建立 Board CTA。
- Phase 2：Workspace Settings / Member Governance，補 Workspace members、roles、owner/admin 管理與 Board guest-like access 說明。
- Phase 3：Board Placement / Move UX Polish，整合 DEV-025 preview/confirm flow，維持受控搬移。
- Phase 4：Workspace Overview，規劃跨 Board table/calendar/activity overview。

本輪 RD 實作範圍:
- Sidebar「工作區選單」標題列右側新增 `新增工作區` `+` icon button。
- 新增 Workspace dialog 具備名稱輸入、空白阻擋、建立中防 double submit、成功/失敗可見回饋。
- `addWorkspace` 改為 Promise / awaitable contract，採 backend-success-first，後端成功後才更新 store 與 localStorage。
- First-run 自動建立 `我的工作區` 改走相同 Promise flow；失敗時 toast，不建立本機假 workspace。
- Home 改為 Workspace 分組呈現 Boards；空 Workspace 顯示 `建立看板` CTA。
- local-test seed 修正為可恢復 `home + no activeBoard` 狀態，避免新增空 Workspace 後 reload 被帶回基準看板。
- 補 DEV-036 static verifier、browser verifier、package scripts 與 QC 文件。

交付邊界:
- 未新增 Supabase migration。
- 未修改 RLS、Workspace member settings、Board guest-like access、billing、quota 或 production deployment。

Phase 1 RD acceptance:
- Sidebar 工作區選單標題列右側有 `新增工作區` `+` icon button。
- 新增 Workspace dialog 具備名稱輸入、空白阻擋、建立中防 double submit、成功/失敗可見回饋。
- `addWorkspace` 或等效 store action 採 Promise / awaitable contract，後端成功後才更新 store 與 localStorage。
- First-run 沒有任何 Workspace 時建立 `我的工作區`，且失敗時不建立本機假資料。
- Home 以 Workspace 分組呈現 Boards；空 Workspace 顯示 `建立看板` CTA。
- 建立第二個以上 Workspace 後 reload 仍存在，且 Board 不會混入其他 Workspace。

Phase 1 RD exit gate:
- `npm.cmd run verify:dev-036-trello-like-workspace-governance`
- `npm.cmd run verify:dev-036-trello-like-workspace-governance-browser`
- `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`
- `npm.cmd run verify:dev-035-workspace-delete-browser`
- `npm.cmd run verify:dev-030-sidebar-rename-contract`
- `npm.cmd run verify:dev-030-sidebar-rename-contract-browser`
- `npm.cmd run verify:dev-025-project-workspace-transfer`
- `npm.cmd run verify:dev-026-trello-like-board-share-ui`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

本輪驗證結果:
- Pass: `npm.cmd run verify:dev-036-trello-like-workspace-governance`，24/24。
- Pass: `npm.cmd run verify:dev-036-trello-like-workspace-governance-browser`。
- Pass: `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`，22/22。
- Pass: `npm.cmd run verify:dev-035-workspace-delete-browser`。
- Pass: `npm.cmd run verify:dev-030-sidebar-rename-contract`，9/9。
- Pass: `npm.cmd run verify:dev-030-sidebar-rename-contract-browser`。
- Pass: `npm.cmd run verify:dev-025-project-workspace-transfer`。
- Pass: `npm.cmd run verify:dev-026-trello-like-board-share-ui`，15/15。
- Pass: `npm.cmd exec tsc -- --noEmit`。
- Pass: `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build`。

Stop conditions:
- 若發現既有 schema / RLS 無法支援多 Workspace 建立與 Board visibility，需停止並補 Supabase design review。
- 若需要更改 `tenant_members` / `project_members` constraint 或 guest-like access，需另開 migration plan 與 DB QC。
- 若 Workspace create 無法做到 backend-success-first，需停止，不得改回 optimistic ghost workspace。
- 若要部署或套 migration，需走 deployment-release-gate。

### DEV-035: 工作區刪除持久化修正

狀態: Implemented / Local Automated QC Passed / Supabase DB QC Pending
節點類型: 交付點
優先級: P0 data consistency bug
父交付點: 無
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者回報工作區已刪除，但重新整理後又出現在工作區清單。
- 截圖顯示刪除入口來自工作區右鍵選單，正式站重新整理後後端資料重新載回。

任務目標:
- 工作區刪除必須以後端持久化成功為準，不得先讓 UI 假裝刪除成功。
- Supabase 正式環境需提供 owner-only workspace delete RPC，避免直接依賴缺少 RLS policy 的 `tenants.delete()`。
- 刪除失敗時必須顯示使用者可見錯誤，不可只 `console.error`。
- 刪除 active workspace 後必須清除 active workspace / board / modal 與 localStorage 殘留，避免重新整理後指向不存在資料。

目前根因判斷:
- `useBoardStore.removeWorkspace` 目前先 optimistic 移除 state，再呼叫 `workspaceService.delete(wsId).catch(console.error)`。
- `supabaseWorkspaceService.delete` 目前直接刪 `public.tenants`。
- 現有 Supabase migration 沒有 `tenants` delete policy 或受控 delete RPC；正式 backend delete 很可能失敗，reload 後 `useSupabaseSync` 重新載回同一筆 workspace。

交付文件:
- `ai-doc/specs/SPEC-035-workspace-delete-persistence-fix.md`
- `ai-doc/qa/QA-DEV-035-workspace-delete-persistence-fix.md`
- `ai-doc/qc/QC-DEV-035-workspace-delete-persistence-fix.md`

RD 執行範圍:
- 新增 Supabase `public.delete_workspace(target_tenant_id uuid)` RPC，限定 active owner 可執行，並設定 revoke/grant。
- `supabaseWorkspaceService.delete` 改呼叫 RPC。
- `removeWorkspace` 改為 async，後端成功後才更新 Zustand state。
- `GlobalContextMenu` await delete result，成功/失敗 toast 清楚回報。
- 補 static verifier、browser verifier 與 package scripts。

RD exit gate:
- `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`
- `npm.cmd run verify:dev-035-workspace-delete-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

本輪驗證結果:
- Pass: `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`，21/21。
- Pass: `npm.cmd run verify:dev-035-workspace-delete-browser`，涵蓋取消確認、刪除後 reload 不復活、active workspace cleanup、mobile reload smoke。
- Pass: `npm.cmd exec tsc -- --noEmit`。
- Pass: `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build`。
- Pass: `npm.cmd run verify:core-regression-static`，10/10。
- Pass: `npm.cmd run verify:dev-030-sidebar-rename-contract`，9/9。
- Pass: `npm.cmd run verify:dev-030-sidebar-rename-contract-browser`。

交付邊界:
- 已新增 Supabase migration 檔，但本輪未套用到遠端資料庫、未部署正式站。
- Supabase CLI 在本機不可用，因此 owner/admin/member/viewer DB role QC 需等 migration 套用到目標資料庫後執行。

QA 驗證計畫:
- Static：migration RPC、owner-only guard、revoke/grant、service RPC、store async contract、UI toast、package script。
- Browser：local-test 刪除 workspace 後 reload 不復活；刪 active workspace 不殘留 active board；取消 confirm 不刪除；mobile viewport 不重疊。
- Supabase DB QC：owner 成功、admin/member/viewer 失敗、cascade 後一般 authenticated user 不可讀 tenant-scoped data。

治理註記:
- 不另建 ADR；本輪是修復既有 owner-only delete 行為，未新增新的 workspace lifecycle、soft delete 或角色政策。
- 若後續要做 workspace recycle bin、復原或 admin 可刪除，需另開 ADR。

### DEV-034: App 快速啟動與加入主畫面 UX

狀態: Done / Browser QC Passed / Local-first scope
節點類型: 交付點
優先級: P0 mobile quick-capture readiness
父交付點: 無
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者指出 App 開啟等待時間對出差臨時記雜事不友善。
- 使用者要求快取與更新不需使用者另外操作，或最多第一次操作一次後永久設定。
- 使用者指出加入主畫面 UI 說明太複雜，使用者不知道怎麼用，需做到不再回頭問開發人員。

任務目標:
- App Shell 透過 PWA 快取與背景更新策略提升再次開啟速度，且更新不可被舊快取卡死。
- 加入主畫面引導需自動出現或在設定頁永久可查，不要求使用者理解技術名詞。
- 依平台分流：iOS Safari 顯示三步驟、Android/Desktop 可用原生安裝提示、內建瀏覽器先導到 Safari / Chrome。
- QuickCaptureShell 需讓使用者在完整資料載入前可先記文字。
- local-first pending queue 需將快記先保存為私人 `InboxItem`，避免等待 workspace / board / records / members 全部載入。

目前 RD 範圍:
- DEV-034A：PWA 更新基礎已先行完成，採 `vite-plugin-pwa`、背景檢查與下次開啟套用策略。
- DEV-034B：PWA 安裝助理已驗證，新增自動提示、設定頁快速開啟入口、安裝偏好記憶與平台分流文案。
- DEV-034C：QuickCaptureShell 已驗證，掛在 `AuthGate` 外，登入檢查/資料升級/主 App lazy loading 前可先輸入。
- DEV-034D：local-first pending queue 已驗證，以 localStorage 保存 `syncStatus=pending` 的私人 `InboxItem`；正式雲端 Inbox 與轉任務接 SPEC-002 後續。

交付文件:
- `ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md`
- `ai-doc/qc/QC-DEV-034-fast-start-pwa-install-guidance.md`

RD exit gate:
- `npm.cmd run verify:dev-034-pwa-install-guidance`
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build`
- Browser smoke：設定頁需可看到 `快速開啟` 與加入主畫面助理，不得出現水平溢位或對使用者暴露技術詞。
- Browser smoke：未登入手機畫面可先存一筆快記到本機收件匣，且不得遮擋後續設定入口。

Verified（2026-06-29）:
- `npm.cmd run verify:dev-034-pwa-install-guidance`: Pass，24/24。
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`: Pass，輸出 `output/playwright/dev-034-quick-capture-before-login-mobile.png`、`output/playwright/dev-034-pwa-install-guidance-desktop.png`、`output/playwright/dev-034-pwa-install-guidance-mobile.png`。
- `npm.cmd exec tsc -- --noEmit`: Pass。
- `npm.cmd run lint -- --quiet`: Pass。
- `npm.cmd run build`: Pass，產出 `dist/sw.js`、`dist/workbox-6c1be909.js`、`dist/manifest.webmanifest`。

殘留邊界:
- 本輪 local-first queue 不等於正式雲端 Inbox；跨裝置同步、今日區塊、指派/分享、轉正式任務仍屬 SPEC-002 後續交付。

## PM Update - 2026-06-19

### DEV-028: 四模式一致的 Trello-like 任務操作契約

狀態: Implemented / Browser Smoke Passed / Manual Click QC Pending (2026-06-26)
節點類型: 交付點
優先級: P0 UI/UX interaction consistency
父交付點: 無
是否計入產品交付完成: 是
建立日期: 2026-06-26

關聯需求:
- 使用者要求目前任務操作從「點擊即編輯」改為接近 Trello 的操作邏輯，降低 Trello 使用者跳槽摩擦。
- 使用者進一步指定清單、心智圖、看板、甘特四個模式必須高度一致，建立跨模式肌肉記憶。
- 使用者明確排除兩項: 不做看板卡片正面資訊降噪；不把 Level 3+ 下層任務預設收進 Card back。

任務目標:
- 四模式單擊既有任務都先選取該任務，再開啟同一個 `TaskDetailsModal`；關閉詳情後保留選取狀態。
- 四模式任務名稱不再因單擊任務或標題直接進入編輯。
- 改名改由明確入口觸發: 鉛筆、右鍵重新命名、`t`、F2；心智圖保留選取後直接打字改名。
- 新增任務命名採 2C: 桌機四模式新增後只選取新任務，直接打字才開始改名；手機新增後自動開命名鍵盤。
- 快捷鍵採 1A: 清單、看板、甘特 `Enter` 開詳情；心智圖 `Enter` 保留新增同階。
- 右鍵/長按採 3A: 四模式都開任務操作選單；心智圖關聯線建立改走 toolbar、快捷鍵或 selected-node action。
- 保留四模式專用能力: 心智圖鍵盤/關聯線、看板 Level 3+ 正面顯示、甘特排程拖曳、會議紀錄任務選取模式。
- 詳情容器採 5A: 保留既有 `TaskDetailsModal`；選取視覺採 6A: 最小 selected highlight / ring。

交付文件:
- `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md`
- `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md`

RD exit gate:
- Added DEV-028 static / browser verifiers covering list, mind map, board, and Gantt click-to-details, selected-state retention, explicit rename, new-task naming, task context menu, and drag/click collision.
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`: Pass, 29/29
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`: Pass
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`: Pass
- `npm.cmd exec tsc -- --noEmit`: Pass
- `npm.cmd run lint -- --quiet`: Pass
- `npm.cmd run build:test`: Pass
- QA manual click validation plan updated on 2026-06-26; DEV-028 still requires MAN-028-001 to MAN-028-027 human-operated click evidence before calling manual QC complete.

### DEV-027F: Mind map UI polish after relationship-line QC

Status: Implemented / Browser QC Passed (2026-06-19)

Scope:
- Fix visible UI errors found after DEV-027E relationship-line implementation.
- Align selected relationship editor/panel/hit targets with `ui-ux-design-principles` viewport and target-size expectations.
- Provide screenshot evidence.

Delivered:
- Relationship style panel and inline label editor moved to viewport-level overlays with clamp positioning.
- Relationship line/label hitboxes and endpoint/control handles moved to viewport-level overlays so they do not shrink under zoom.
- Relationship overlay coordinates recompute on canvas scroll.
- Existing relationship hitboxes are disabled during relationship creation mode to avoid blocking task selection.
- Arrow marker size no longer inflates when the selected line becomes thicker.
- Screenshot evidence: `output/playwright/dev-027F-mindmap-ui-desktop.png`, `output/playwright/dev-027F-mindmap-ui-mobile.png`.
- QC evidence: `ai-doc/qc/QC-DEV-027F-mindmap-ui-polish.md`.

Verified:
- `npm.cmd run verify:dev-027f-mindmap-ui-polish-browser`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`: Pass
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity`: Pass
- `npm.cmd exec tsc -- --noEmit`: Pass
- `npm.cmd run lint -- --quiet`: Pass
- `npm.cmd run build:test`: Pass, with existing Vite chunk-size/dynamic-import warnings

### DEV-027E: Xmind-like note relationship line UX parity

Status: Implemented / Browser QC Passed (2026-06-19)

Completion evidence:
- Implemented Xmind-like note relationship line object interactions in `src/components/MindMap/MindMapView.tsx` and `src/components/MindMap/MindMapNode.tsx`.
- Added inline label creation/editing, line/label selection, Space edit, Delete/Backspace delete, endpoint/control-point drag, endpoint reconnect, style popover, selected-node toolbar flow, `Ctrl+Shift+R`, and task right-click start flow.
- SVG overlay no longer blocks task nodes; relationship interaction is handled by HTML line hitboxes and handles.
- QC evidence added: `ai-doc/qc/QC-DEV-027E-xmind-note-relationship-line-ux-parity.md`.
- Added gates: `verify:dev-027e-xmind-note-relationship-line-ux-parity` and `verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`.

Verified:
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`: Pass
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines`: Pass
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`: Pass
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`: Pass
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`: Pass
- `npm.cmd exec tsc -- --noEmit`: Pass
- `npm.cmd run lint -- --quiet`: Pass
- `npm.cmd run build:test`: Pass, with existing Vite chunk-size/dynamic-import warnings

狀態：Ready
類型：後續開發點 / 心智圖 UI/UX parity
關聯：DEV-027C

需求摘要：
- DEV-027C 已完成筆記型關聯線 MVP，但目前仍不像 Xmind 的 Relationship 圖形物件。
- 本輪文件依 Xmind 官方 Relationship / Text / Mind Mapping 說明，整理 ProJED 差異與後續開發範圍。
- 關聯線仍維持筆記功能，不做任務依賴、不改排程、不做功能連動。

主要差距：
- ProJED 目前主要靠 toolbar 進入兩點建立；Xmind 支援選 topic、toolbar、Insert menu、兩 topic 建立、快捷鍵。
- ProJED label 使用 prompt；Xmind 可選線後 Space、雙擊、右鍵 Edit 直接編輯文字。
- ProJED 線條本體不可直接點選，主要靠 label hitbox；Xmind Relationship 是可選取圖形物件。
- ProJED endpoint 只是顯示，不可拖；Xmind 有 circular endpoints 與 square control points。
- ProJED 樣式固定；Xmind 可調線型、粗細、顏色、箭頭與文字樣式。

交付文件：
- `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md`
- `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md`

RD exit gate:
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity`
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`

### DEV-027D: Mind map date display and existing filter integration

狀態：Implemented / QC Pending
類型：功能補強 / 心智圖 UX parity
關聯：DEV-027 / DEV-027B / DEV-027C

需求摘要：
- 心智圖任務節點新增日期顯示，一個任務仍是一個 branch，日期作為節點內輔助 metadata。
- 日期顯示沿用既有規則：`showStartDate=true` 時顯示開始日；結束日存在時顯示結束日。
- 心智圖任務 visibility 沿用既有 WBS filter：狀態、到期日、負責人、標籤。
- filter 規則與現有 WBS 一致：父任務被 filter 隱藏時，子任務不孤立顯示。

交付文件：
- `ai-doc/specs/SPEC-027D-mindmap-date-display-filter.md`
- `ai-doc/qa/QA-DEV-027D-mindmap-date-display-filter.md`
- `ai-doc/qc/QC-DEV-027D-mindmap-date-display-filter.md`

RD exit gate:
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`

### DEV-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview polish

最新變更（2026-06-19）：
- 新增任務後只選取，不立即進入編輯。
- 可連續按 `Enter` / `Tab` 建立同階或子階任務；此流程不依賴 rename input。
- 方向鍵可移動選取任務。
- 選取任務後直接打字才進入 rename mode；rename input 內 `Enter` 只 commit 名稱。
- QC 已依最新 verifier 重新驗證並通過，狀態維持 Browser QC Passed。

狀態: Implemented / Browser QC Passed
節點類型: 開發點
優先級: P0 UI quality reopen
父交付點: DEV-027
是否計入產品交付完成: 是
關聯需求: 使用者補充心智圖模式仍缺少 Xmind-like 關鍵操作與視覺行為：按 `Enter` 要在選取任務下方新增同階任務；畫布要能縮放且解析度足夠；線條要像參考圖 1 一樣整齊，不能雜亂；任務拖動時的預覽動畫要像參考圖 2 一樣明確畫出預期插入位置。

任務目標:
- `Enter` keyboard insertion：選取任務後按 `Enter`，必須在該任務正下方建立同 parent、同 level、同 side、order 緊接其後的新任務；新任務建立後直接進入命名編輯。
- Zoomable canvas：心智圖工作區提供縮放能力，至少支援 zoom in、zoom out、reset / fit；縮放後節點文字、connector、drag preview 與 hit target 保持清晰、對齊且可操作。
- Tidy connector topology：同 parent 多子節點以 shared vertical trunk / rounded bracket 或等效整齊拓撲呈現，避免每個 child 各自拉雜亂曲線、交錯線、殘留短線或穿越節點。
- Drag insertion preview：拖曳任務時顯示明確 insertion placeholder / gap / connector preview / ghost node，能在 mouseup 前判斷會插入哪個 parent、哪個 sibling 前後、哪一側。
- 補自動化與 UI QC：新增 browser verifier 驗證 keyboard insertion order、zoom sharpness / geometry、tidy connector、drag preview position fidelity、desktop/laptop/mobile viewport、visible error sweep。
- 保留 DEV-027A 已通過能力：connector endpoint <= 6px、無 orphan segment、same-side root placement persistence、viewer read-only、cycle guard、baseline browser flow 不得退化。

交付文件:
- `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md`
- `ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md`
- `ai-doc/qc/QC-DEV-027B-xmind-interaction-polish.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| PM/RD 規格 | PM/RD | Done | SPEC-027B |
| QA 驗證計畫 | QA | Done | QA-DEV-027B |
| RD 實作 | RD | Done | Enter insertion + zoom canvas + tidy connector + drag insertion preview |
| QC 事實驗證 | QC | Browser QC Passed | browser screenshots + geometry / preview metadata evidence |

RD exit gate:
- `npm.cmd run verify:dev-027b-xmind-interaction-polish`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`
- `npm.cmd run verify:core-regression-static`

Implementation notes for RD:
- Enter 新增 sibling 時必須重算同 parent 兄弟 order，不能只 append 到 parent 最後或 root list 最後。
- Zoom 建議使用 vector-first rendering：HTML text 保持文字渲染，connector / preview 使用 SVG path，避免 bitmap scaling 模糊。
- Connector layout 必須按 parent group 計算 shared trunk / bracket，讓 child stack 先整列對齊再畫線，不得只用任意 Bezier pair 造成視覺雜亂。
- Drag preview 必須共用 final layout 的 positioning rule；preview 顯示的 parent / sibling / side 必須與 drop 後結果一致。

Implementation evidence:
- `Enter`：`createSibling` 使用 selected node 的 parent/order 插入，root sibling 會繼承 selected root side。
- Xmind-like selection-first insert：新增任務後只選取，不立即進入編輯；可連續按 `Enter` / `Tab` 新增同階或子階任務；方向鍵可移動選取；選取任務後直接打字才進入 rename mode。
- Zoom：心智圖 toolbar 新增 zoom in / zoom out / reset / fit controls，工作區提供 `data-mindmap-zoom-level`，connector 座標依 zoomLevel 校正。
- Tidy connector：parent-child connector 改為 bracket-shaped `H/V/H` path，同 parent children 共用 trunk x；children group 暴露 parent/direction metadata。
- Drag insertion preview：拖曳 hover node 時顯示 `data-mindmap-insertion-preview`、`data-mindmap-drop-preview`、`data-mindmap-drag-preview`，並提供 target parent、sibling before/after、drop position、direction metadata。

Verified:
- `npm.cmd run verify:dev-027b-xmind-interaction-polish`：Pass，16 checks。
- `npm.cmd exec tsc -- --noEmit`：Pass。
- `npm.cmd run lint -- --quiet`：Pass。
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`：Pass，31 checks。
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`：Pass。
- `npm.cmd run build:test`：Pass；僅既有 Vite dynamic import / chunk size warning。
- `npm.cmd run verify:core-regression-static`：Pass，10 checks。

## PM Update - 2026-06-18

### DEV-027A: Xmind-like connector line and drag interaction repair

狀態: Implemented / Browser QC Passed
節點類型: 開發點
優先級: P0 UI quality reopen
父交付點: DEV-027
是否計入產品交付完成: 是
關聯需求: 使用者截圖指出心智圖樹狀線條殘破，分支線只剩孤立短線，父子節點無法靠線條追蹤；本輪新增拖動任務需有 Xmind-like 即時預覽動畫，且任務可拖到同一側，不得被固定平均拆成左右兩側。

任務目標:
- 先依 Xmind 官方 Topic / Branch / Skeleton / Mind Mapping structure 文件建立視覺基準。
- 修復心智圖 connector line，使 center-to-main、parent-to-child、sibling trunk 都形成連續可讀拓撲。
- 拖動任務時，必須有任務位置與階層變化的即時預覽動畫；拖曳中不可只顯示瀏覽器原生 ghost 或靜態 drop target。
- 任務可拖動到同一側並保留同側布局意圖，不得像目前一樣由 root index 強制平均拆成左右兩側。
- 補 browser verifier，驗證 connector endpoint、orphan segment、collapse/expand、drag 後重算、desktop/laptop/mobile viewport。
- 補 browser verifier，驗證 drag preview animation、same-side drop、side persistence 與 side-aware connector recompute。
- 使用與使用者截圖同等複雜度的 fixture 驗證，不得只用簡單 3 節點 smoke。

交付文件:
- `ai-doc/qa/QA-DEV-027A-xmind-connector-line-visual-validation.md`
- `ai-doc/qc/QC-DEV-027A-xmind-connector-drag-ui.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| QA 驗證計畫 | QA | Done | QA-DEV-027A |
| RD 修復 | RD | Done | centralized SVG connector overlay + drag preview + same-side layout persistence + browser verifier |
| QC 事實驗證 | QC | Browser QC Passed | screenshot + geometry evidence + same-side persistence evidence |

RD exit gate:
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`

Implementation evidence:
- Connector rendering 改為整張 mind map 集中 SVG overlay，由實際 DOM bbox 計算 center-to-root 與 parent-to-child endpoint，避免每個 node 自畫短線造成斷裂。
- Drag interaction 新增 `data-mindmap-drag-preview` 與 `data-mindmap-drop-preview`，pointer move 時 preview node 與 connector path 會同步更新。
- Root branch side placement 改由使用者 drop 意圖保存，支援多個 root branches 留在同一側，並在 mode switch / hard reload 後保留。
- Browser verifier 已覆蓋 connector endpoint、orphan segment、node overlap、drag preview movement、same-side drop、side persistence 與 desktop/laptop/mobile screenshot。

Verified:
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`：Pass，31 checks。
- `npm.cmd exec tsc -- --noEmit`：Pass。
- `npm.cmd run lint -- --quiet`：Pass。
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`：Pass。
- `npm.cmd run build:test`：Pass；僅既有 Vite dynamic import / chunk size warning。
- `npm.cmd run verify:core-regression-static`：Pass，10 checks。

### DEV-027: Xmind-like 心智圖模式

狀態: Implemented / Browser QC Passed
節點類型: 交付點
優先級: P1 planning UX migration
父交付點: 無
是否計入產品交付完成: 是
關聯需求: 使用者常用 Xmind 心智圖規劃工作計畫，且 Xmind 樹狀分支邏輯與 ProJED WBS 階層相同；希望在 ProJED 新增心智圖模式，讓規劃可直接變成任務。

任務目標:
- 在現有模式切換列新增 `心智圖` 模式。
- Active board title 作為中心主題，既有 WBS 任務作為分支節點。
- 一個任務就是一個分支，第一版節點只顯示任務名稱。
- 視覺布局與互動高度接近 Xmind 類心智圖，但避免一比一複製品牌細節。
- 心智圖所有新增、改名、刪除、拖曳調整階層都直接更新既有 WBS 任務資料。
- 第一版支援核心 MVP：模式切換、分支顯示、展開/收合、拖曳階層、雙擊/鍵盤改名、`Enter` 新增同層、`Tab` 新增子層、`Delete` 刪除。

交付文件:
- `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md`
- `ai-doc/qa/QA-DEV-027-xmind-like-mind-map-mode.md`
- `ai-doc/qc/QC-DEV-027-xmind-like-mind-map-mode.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| PM/RD 規格 | PM/RD | Done | SPEC-027 |
| QA 驗證計畫 | QA | Done | QA-DEV-027 |
| RD 實作 | RD | Done | MindMap view mode + Xmind-like core interactions |
| QC 事實驗證 | QC | Browser QC Passed | keyboard flow + delete guard + drag hierarchy + cycle guard + viewer read-only + viewport smoke |

Regression gate:
- `npm.cmd run lint -- --quiet`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`
- `npm.cmd run verify:core-regression-static`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`

Decision evidence:
- HCS 引導決策：`1A 2B 3A`。
- 範圍：核心心智圖 MVP。
- 視覺策略：Xmind-like 視覺布局與互動，但不複製 Xmind 品牌細節。
- 資料策略：完全共用現有 WBS 任務資料，不做草稿區。

Implementation evidence:
- UI wiring: `ViewMode` 新增 `mindmap`，`MainLayout` topbar 新增 `心智圖`，`App.renderContent` 掛入 `MindMapView`。
- Components: `src/components/MindMap/MindMapView.tsx`、`src/components/MindMap/MindMapNode.tsx`。
- Data contract: 直接共用 `useWbsStore` 的 `nodes`、`parentNodesIndex`、`addNode`、`updateNode`、`removeNode`，不新增資料表或獨立草稿。
- Interaction: owner browser smoke 已驗證新增 root、`Tab` 子任務、`F2` 改名、含子任務 `Delete` 確認、清單跨視圖同步與 cleanup。
- Verified: `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`, `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`, `npm.cmd run verify:dev-027-xmind-connector-lines-browser`, `npm.cmd run verify:dev-027-xmind-drag-preview-browser`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run build:test`, `npm.cmd run verify:core-regression-static`。

### DEV-026: Trello-like 看板分享體驗

狀態: Implemented / Browser Smoke Passed
節點類型: 交付點
優先級: P1 UI/UX migration
父交付點: 無
是否計入產品交付完成: 是
關聯需求: 使用者希望邀請別人加入看板的 UI/UX 對齊 Trello，讓 Trello 使用者轉換過來時，邏輯與肌肉記憶可以無縫移轉。

任務目標:
- 將看板邀請入口移到 active board topbar 的 `分享` 按鈕。
- 以 `分享看板` modal 承載 email 邀請、角色選擇、複製連結、pending invite 與看板成員。
- 將 role permission matrix 保留在設定頁，避免干擾分享主流程。
- 保留既有 `board_invites`、accept/revoke、RLS、audit 與 OAuth invite token preserve 資料契約。
- 補齊 desktop/laptop/mobile viewport 與 visible error sweep 驗證。

交付文件:
- `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md`
- `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| PM/RD 規格 | PM/RD | Done | SPEC-026 |
| QA 驗證計畫 | QA | Done | QA-DEV-026 |
| RD 實作 | RD | Done | Trello-like share modal + topbar entry + settings split |
| QC 事實驗證 | QC | Browser Smoke Passed / DB Smoke Pending | desktop + 390x844 browser smoke, static gates, ontology static guard |

Regression gate:
- `npm.cmd run lint -- --quiet`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`
- `npm.cmd run verify:ontology-collaboration`
- `npm.cmd run verify:dev-026-trello-like-board-share-ui`

Implementation evidence:
- UI: `src/components/MainLayout.tsx` active board topbar `分享` button with member count badge and mobile-safe hit target.
- Modal: `src/components/BoardMembersPanel.tsx` exports `BoardShareDialog` for Trello-like invite flow and keeps `BoardMembersPanel` as settings role permission matrix.
- Guardrail: `src/components/Sidebar.tsx` now wires board permission capability checks; `src/components/GlobalContextMenu.tsx` dead hidden transfer code removed for lint gate.
- Verified: `npm.cmd run verify:dev-026-trello-like-board-share-ui`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run build:test`, `npm.cmd run verify:ontology-collaboration`.
- Browser smoke: `http://127.0.0.1:4173/` desktop modal visible; 390x844 mobile share button hit target fixed, modal width 366px with no left/right overflow.
- Pending: `verify:ontology-collaboration` service-role DB smoke remains pending unless run with `--db` or `ONTOLOGY_COLLABORATION_DB_QC=true`.

### DEV-025: 受控跨工作區移動專案

狀態: Implemented / QC Pending
任務類型: 功能開發 / 權限與資料一致性
優先級: P1
關聯需求: 使用者希望專案可在不同工作區之間移動，但擔心權限外洩、資料遺失與稽核斷鏈。

任務目標:
- 將「專案跨工作區移動」定義為受控搬移流程，而不是自由拖拉或複製。
- 搬移前必須提供影響預覽，包含成員保留/移除、資料列數、邀請、標籤與 RAG 影響。
- 搬移必須由後端 RPC 以交易方式完成，避免半搬移狀態。
- 搬移必須保留 `project_id`，並更新所有 project-scoped 與 workspace-scoped 關聯。
- 搬移必須留下 source tenant 與 target tenant audit log。

交付文件:
- `ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md`
- `ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| PM/RD 規格 | PM/RD | Ready | SPEC-025 |
| QA 驗證計畫 | QA | Ready | QA-DEV-025 |
| RD 實作 | RD | Done | Supabase RPC migration + frontend controlled transfer flow + local-test fallback |
| QA 靜態驗證 | QA | Done | `verify:dev-025-project-workspace-transfer`, TypeScript, production build |
| QC 事實驗證 | QC | Pending | Apply migration to Supabase target, then verify RLS, audit log, data consistency, RAG visibility evidence |

Regression gate:
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`
- `npm.cmd run verify:settings-project-context`
- `npm.cmd run verify:core-regression-static`
- `npm.cmd run verify:dev-025-project-workspace-transfer`

Implementation evidence:
- Migration: `supabase/migrations/20260618120000_controlled_project_workspace_transfer.sql`
- UI: board context menu controlled transfer dialog with preflight preview and project-name confirmation
- Service/store: Supabase RPC integration plus local-test transfer path
- Verified: `npm.cmd run verify:dev-025-project-workspace-transfer`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run build`

## PM Update - 2026-06-15

### DEV-024: AI整理保留手寫內容與章節結構

狀態: Implemented / Browser QC Passed / DB unchanged
節點類型: 開發點
優先級: P1 AI synthesis guard
父交付點: DEV-011 / DEV-012 / DEV-020
關聯回歸: DEV-021 / DEV-022
是否計入完成率: 否

交付原因：
- 使用者確認在手動填寫紀錄後執行 `AI整理`，既有內容會被覆蓋，且章節結構會被改寫。
- DEV-021 / DEV-022 已保護「專案變化匯入」 evidence 與單一紀錄整合，但尚未保護使用者手寫內容與自訂章節。
- 這不是 prompt wording 問題，必須新增 deterministic human-draft merge guard，避免 AI synthesis 結果直接取代 preserved draft。

交付目標：
- `AI整理` 只能整理、補強與統整既有草稿，不得刪除使用者已輸入的段落、章節、任務 mention 或任務連結。
- 若 AI 結果未包含手寫內容，系統必須用 deterministic fallback 將 missing human evidence 放回同一份紀錄。
- 保留 DEV-021 project change preserve guard 與 DEV-022 single-record integration guard。
- 不改資料庫 schema，不改 `KnowledgeRecord.content` persistence 格式。

主要文件：
- `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md`
- `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Ready | SPEC-024 |
| 驗證計畫 | QA | Ready | QA-DEV-024 |
| 實作 | RD | Pending | human-draft merge guard |
| 事實驗證 | QC/Verifier | Pending | DEV-024 preserve verifier + real operation tests |

驗證證據暫列：
- `SPEC-024`
- `QA-DEV-024`
- `verify:dev-024-ai-synthesis-preserve-human-draft`
- 待 RD 實作後重跑 DEV-011 / DEV-012 / DEV-021 / DEV-022 regression gates。

### DEV-023: 專案變化匯入整併為紀錄流程第一步

狀態: Ready
節點類型: 開發點
優先級: P1 UX refinement
父交付點: DEV-020
是否計入完成率: 否

交付原因：
- 使用者確認「先匯入專案變化」不應作為會議流程上方的獨立大型卡片。
- 匯入專案變化、速記、AI整理、校稿與發布本質上是同一段紀錄流程，應用同一個 workflow medium 表達。
- DEV-020 已完成功能主線，但 PDCA-DEV-020 仍留下「專案變化匯入在流程上方」的殘留 UX 風險。

交付目標：
- 會議紀錄流程改為 `匯入 -> 速記 -> AI整理 -> 校稿 -> 發布`。
- 個人工作紀錄流程改為 `匯入 -> 撰寫 -> 存草稿 -> 發布`。
- 預設只顯示精簡流程步驟；點擊 `匯入` 後才展開日期、範圍、預覽、插入與跳過。
- 保留 `wrapProjectChangeImportContent`、DEV-021 preserve guard 與 DEV-022 single-record integration guard。

主要文件：
- `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md`
- `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md`
- `ai-doc/qc/QC-DEV-023-record-project-change-import-workflow-step.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Implemented | SPEC-023 |
| 驗證計畫 | QA | Browser QC Passed | QA-DEV-023 |
| 實作 | RD | Implemented | workflow first-step integration |
| 事實驗證 | QC/Verifier | Browser QC Passed | DEV-023 workflow-step verifier |

驗證證據：
- Pass: `npm.cmd run verify:dev-023-record-project-change-import-workflow-step`，18 checks。
- Pass: `npm.cmd run verify:dev-020-record-workflow-redesign`。
- Pass: `npm.cmd run verify:dev-020-project-change-import-browser`，截圖 `output/playwright/dev-020-record-workflow-1440.png`、`output/playwright/dev-020-record-workflow-1024.png`。
- Pass: `npm.cmd run verify:dev-021-project-change-ai-preserve`。
- Pass: `npm.cmd run verify:dev-022-project-change-single-record`。
- Pass: `npm.cmd exec tsc -- --noEmit`。
- Pass: `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build`。

交付邊界：
- 不新增資料庫 schema、migration 或 record content persistence 格式。
- QA 文件要求的 ROT-001 至 ROT-007 人工真實點擊測試尚未人工簽核；本輪完成自動化 browser QC。

### DEV-022: 專案變化匯入後 AI整理同整成單一會議紀錄

狀態: Done
節點類型: 交付點
優先級: P1
父交付點: DEV-021
是否計入完成率: 是

CAPA 來源：
- 使用者實測發現「先匯入專案變化 -> AI整理」後，輸出同時出現 AI整理主紀錄與 `[專案變化匯入開始]` 內的第二份完整會議紀錄。
- 目前 DEV-021 的 deterministic merge guard 保證不丟失，但採 append preserve，未做到同整。

交付目標：
- 將「受保護內容」從 rendered meeting record 改為 project change evidence。
- AI整理結果最後只能有一份會議紀錄主結構。
- 匯入的任務變化必須統整進 `2. 任務討論與結論`，不得以第二份完整紀錄追加。
- fallback guard 若需要補漏，只能補 evidence note，不可補第二組 `1/2/3` 結構。

主要文件：
- `ai-doc/specs/SPEC-022-project-change-single-record-integration.md`
- `ai-doc/qa/QA-DEV-022-project-change-single-record-integration.md`
- `ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| CAPA | PM/RD | Done | CAPA-20260615 |
| 規格 | PM/RD | Done | SPEC-022 |
| 實作 | RD | Done | integrated synthesis guard |
| 驗證計畫 | QA | Done | QA-DEV-022 |
| 事實驗證 | QC/Verifier | Done | single-record verifier |

交付證據：
- `src/utils/projectChangeImport.ts`：project change evidence normalization、single-record merge guard。
- `scripts/verify-dev-022-project-change-single-record.mjs`：單一 `1/2/3` 主結構、marker 移除、taskLinks preserve、idempotent。
- `package.json`：`verify:dev-022-project-change-single-record`。

已通過驗證：
- `npm.cmd run verify:dev-022-project-change-single-record`
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

### DEV-021: 專案變化匯入後 AI整理保留機制

狀態: Done
節點類型: 交付點
優先級: P1
父交付點: DEV-020 / DEV-011 / DEV-012
是否計入完成率: 是

交付原因：
- 使用者在紀錄流程中先匯入專案變化後，再使用 AI整理時，先前匯入內容可能被 AI 結果覆蓋。
- 此問題不是文案或 prompt 問題，而是資料回寫缺少 deterministic merge guard。
- 在此交付點完成前，DEV-020 的「專案變化匯入 + AI整理」需視為有資料遺失風險。

主要文件：
- `ai-doc/specs/SPEC-021-project-change-ai-preserve.md`
- `ai-doc/qa/QA-DEV-021-project-change-ai-preserve.md`

範圍：
- SPEC 新增「已匯入專案變化是受保護內容，AI整理不得丟失」不變式。
- RD 實作 deterministic merge guard，不可只依賴 prompt。
- QA 新增「匯入 -> AI整理 -> 存草稿/發布」測試案例。
- Verifier 新增 preserve 與 idempotent 可重複測試。
- PM 將 DEV-020 標記為待 DEV-021 補齊的狀態風險。

完成條件：
- 匯入專案變化後 AI整理不會丟失已匯入內容。
- 重複 AI整理不會重複堆疊同一份匯入區塊。
- 存草稿與發布都保存 merged content。
- taskLinks 依 merged content 同步。
- prompt-only 修補不得通過 verifier。

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Done | SPEC-021 |
| 實作 | RD | Done | deterministic merge guard |
| 驗證計畫 | QA | Done | QA-DEV-021 |
| 事實驗證 | QC/Verifier | Done | preserve/idempotent verifier |

交付證據：
- `src/utils/projectChangeImport.ts`：受保護匯入區塊、extractor、merge guard。
- `src/components/Records/RecordSidebar.tsx`：匯入專案變化時改插入受保護區塊。
- `src/store/useRecordStore.ts`：AI整理回寫使用 merged content，taskLinks 依 merged content 同步。
- `scripts/verify-dev-021-project-change-ai-preserve.mjs`：preserve、idempotent、taskLinks、store writeback、docs gate。

已通過驗證：
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

## PM Update - 2026-06-11

### DEV-020：紀錄功能重構與專案變化匯入流程

狀態：Done
節點類型：交付點
父交付點：DEV-002 / DEV-005 / DEV-007 / DEV-011 / DEV-012 / DEV-018 / DEV-019
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md`
- `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md`

範圍：

- 將紀錄功能重構為「先選紀錄情境、再匯入專案變化、再撰寫與發布」的工作流。
- 看板主畫面提供 `開始會議速記` 與 `新增個人工作紀錄` 主要入口。
- 紀錄類型在開始撰寫前決定；建立草稿後不在同一筆草稿上切換類型。
- 新增專案變化匯入：指定時間範圍，預設一週前到今日；範圍只保留整個看板與整個工作區。
- 專案變化預覽依任務階層排版，需使用者確認後才插入紀錄內容。
- 補齊所有關閉、切換、新增、離開時的未儲存三選一防呆。
- 新增 `功能說明` button，內含流程圖、紀錄類型差異、專案變化匯入與保存/發布/離開說明。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-020 RD | Done | RD | 已實作 workflow helper、project change import、RecordComposer、dirty guard、help dialog 與 verifier。 |
| DEV-020 QA | Done | QA | `QA-DEV-020` 已涵蓋入口、匯入、防呆、功能說明與 viewport。 |
| DEV-020 QC | Done | QC | DEV-002/003/007/010/011/012/019 回歸、DEV-020 verifier、browser verifier 與 build 通過。 |

### DEV-018：會議紀錄防呆 UX/UI 流程重設計

狀態：In Verification
節點類型：交付點
父交付點：DEV-005 / DEV-010 / DEV-011 / DEV-012
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-018-meeting-record-guardrail-workflow-redesign.md`
- `ai-doc/qa/QA-DEV-018-meeting-record-guardrail-workflow.md`

範圍：

- 將會議速記側欄改為 `速記`、`AI整理`、`校稿`、`發布` 四階段工作流。
- AI整理改為建議性動作；發布時直接保存編輯器內容，不自動呼叫 AI。
- 新增側欄狀態卡，集中呈現目前階段、下一步、草稿同步狀態、AI 狀態與直接發布風險。
- 新增未儲存離開三選一防呆：`存草稿後離開`、`直接離開`、`取消`。
- 擴充 `GlobalDialog` / `DialogStore` 支援 2-3 個自訂 action button。
- 更新 DEV-010 驗證腳本，移除過時的 BoardView 會議操作列期待。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-018 RD | Done | RD | workflow helper、RecordSidebar、MainLayout、DialogStore、useRecordStore 已更新。 |
| DEV-018 QA | Ready | QA | 依 `QA-DEV-018` 執行案例驗證。 |
| DEV-018 QC | Done | QC | DEV-007 至 DEV-012 verifier、build、1440x950 / 1024x768 viewport smoke 已通過。 |

### DEV-019：紀錄類型與會議流程層級重整

狀態：Done
節點類型：開發點
父交付點：DEV-002 / DEV-005 / DEV-018
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md`
- `ai-doc/qa/QA-DEV-019-record-type-and-meeting-workflow-layering.md`

範圍：

- 釐清 `會議紀錄` 與 `個人工作紀錄` 是紀錄類型，不是會議流程步驟。
- Topbar 只表示全域會議模式：`開始會議速記` / `離開會議`。
- RecordSidebar 只在一般模式提供 `新增會議紀錄` / `新增個人工作紀錄`。
- 會議模式中鎖定為 `會議紀錄（會議模式）`，不顯示個人工作紀錄切換。
- 個人工作紀錄顯示簡單狀態，不套用 `AI整理 / 校稿`。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-019 RD | Done | RD | 更新 RecordSidebar、MainLayout、workflow helper 與 verifier。 |
| DEV-019 QA | Done | QA | 已建立 `QA-DEV-019`，涵蓋紀錄類型、會議模式、個人工作紀錄與 viewport。 |
| DEV-019 QC | Done | QC | `verify:dev-010-action-feedback`、`build`、`verify:dev-019-record-type-layering-browser` 通過。 |

更新日期：2026-06-09
文件用途：本檔只做 PM 主控、交付狀態、下一步與驗證證據索引。歷史長版內容已封存到 `ai-doc/archived/dev_task_2026-06-09_before_restructure.md`。

---

## 讀法

- 先看「目前 PM 結論」與「下一步」。
- 產品完成率只計入 `交付點`。
- `開發點` 只支援交付點，不單獨計入產品完成率。
- 詳細需求、驗證計畫與歷史紀錄請看對應 SPEC / QA / QC / verifier，不再塞回本檔。

## 狀態定義

| 狀態 | 意義 |
|---|---|
| Done | 已完成實作與可用驗證，或已被使用者接受。 |
| In Verification | 已實作，等待 QC / production smoke / 使用者驗收。 |
| Ready | 規格足夠，可排 RD / QA / QC。 |
| Deferred | 暫不做，需明確恢復條件。 |
| Blocked | 有外部條件阻擋，PM/RD 無法自行完成。 |

---

## 目前 PM 結論

- `main` 持續作為正式發布分支，部署與 production smoke 證據已回寫到 PM 文件。
- Firebase Hosting 已部署到正式環境：`https://projed-cc78d.web.app`。
- Supabase Edge Function `synthesize_meeting_record` 已部署到正式 Supabase version 2，狀態 `ACTIVE`，並維持 `verify_jwt=true`。
- 2026-06-09 production backend AI smoke 已通過：匿名請求回 `401`，一次性 Supabase Auth user 呼叫回 `200`，實際模型為 `gemini-3.5-flash`。
- 會議紀錄工作流目前是主要交付主線：DEV-005 到 DEV-017 已完成多輪 UX 與 AI 品質改善。
- DEV-011 / DEV-012 尚待互動式 production UI smoke，原因是正式前端使用 Google OAuth，CLI 無法非互動完成登入與發布流程。
- 手機版會議紀錄工作流不列入目前 release gate。

## 下一步

| 順序 | 任務 | 狀態 | 負責 | 完成條件 |
|---|---|---|---|---|
| 1 | DEV-011 / DEV-012 production UI smoke | In Verification | QC / 使用者 | 以已登入 Google 的正式前端完成：開會、AI整理、校稿發布、紀錄庫與任務知識查找。 |
| 2 | DEV-026 Trello-like 看板分享體驗 RD | Done | RD | 已完成 topbar 分享入口、分享 modal、設定頁權限矩陣降層與 DEV-026 verifier。 |
| 3 | DEV-011 / DEV-012 production backend AI smoke | Done | QC | 正式 Edge Function 以授權 user JWT 呼叫成功，回傳 AI 統整內容與實際模型。 |
| 4 | DEV-028 四模式一致的 Trello-like 任務操作契約 QC | Manual Click QC Pending | QC | 依 QA-DEV-028 補做 MAN-028-001 至 MAN-028-027 人工親自點擊驗證，附 viewport、截圖或錄影、visible error sweep。 |
| 5 | DEV-020 紀錄功能重構 RD | Done | RD | 已依 SPEC-020 重構紀錄入口、專案變化匯入、未儲存保護與功能說明。 |
| 6 | 文件同步清理 backlog / documentation map | Done | PM | backlog、dev_task、documentation map 與 QC evidence 狀態一致。 |

---

## 交付點總覽

| DEV | 類型 | 狀態 | 是否計入完成率 | 主題 | 主要證據 / 文件 | 下一步 |
|---|---|---|---|---|---|---|
| DEV-001 | 交付點 | Done | 是 | 四模式一致化緊湊 UI 系統 | `SPEC-001`、舊 dev_task archive | 無 |
| DEV-002 | 交付點 | Done | 是 | 會議紀錄與個人工作紀錄 MVP | `SPEC-003`、`verify:dev-002-records` | 後續只做 refinements |
| DEV-004 | 交付點 umbrella | Deferred | 否 | 全人個人與團隊待辦平台 MVP | `SPEC-002` | 等使用者重新啟動 |
| DEV-005 | 交付點 | Done | 是 | 會議看板主畫面紀錄工作流 | `SPEC-005`、PM report | 無 |
| DEV-006 | 交付點 | Done | 是 | Gmail-like 會議紀錄輸入器穩定化 | `SPEC-006`、`QA-DEV-006`、browser input verifier | 無 |
| DEV-007 | 交付點 | Done | 是 | 會議中保留看板完整編輯與任務變更紀錄 | `SPEC-007`、`verify:dev-007-meeting-activity` | 無 |
| DEV-008 | 交付點 | Done | 是 | 任務會議細節快速查找 | `SPEC-008`、`verify:dev-008-task-knowledge` | 無 |
| DEV-009 | 交付點 | Done | 是 | 任務詳情內會議快速補記 | `SPEC-009`、`QA/QC-DEV-009`、`verify:dev-009-task-detail-quick-note` | 無 |
| DEV-010 | 交付點 | Done | 是 | 會議紀錄操作按鈕狀態溝通 | `SPEC-010`、`QA-DEV-010`、`verify:dev-010-action-feedback` | 無 |
| DEV-011 | 交付點 | In Verification | 是 | AI 任務導向會議紀錄統整工作流 | `SPEC-011`、`QA-DEV-011`、`verify:dev-011-ai-meeting-synthesis`、`QC-DEV-011-012-production-ai-smoke` | production UI smoke |
| DEV-012 | 交付點 | In Verification | 是 | AI 會議紀錄自然語言品質提升 | `SPEC-012`、`QA-DEV-012`、`verify:dev-012-meeting-record-quality`、`QC-DEV-011-012-production-ai-smoke` | production UI smoke |
| DEV-013 | 交付點 | Done | 是 | 右鍵任務複製，含子任務與子樹內部依賴 | `SPEC-013`、`QC-DEV-013`、`verify:dev-013-task-duplicate` | 無 |
| DEV-020 | 交付點 | Done | 是 | 紀錄功能重構與專案變化匯入流程 | `SPEC-020`、`QA-DEV-020`、`verify:dev-020-record-workflow-redesign`、`verify:dev-020-project-change-import-browser` | 無 |
| DEV-026 | 交付點 | Implemented / Browser Smoke Passed | 是 | Trello-like 看板分享體驗 | `SPEC-026`、`QA-DEV-026`、`verify:dev-026-trello-like-board-share-ui`、browser smoke | DB smoke 視 release gate 需要再啟用 |
| DEV-027 | 交付點 | Implemented / Static + Browser Smoke Passed | 是 | Xmind-like 心智圖模式 | `SPEC-027`、`QA-DEV-027`、`QC-DEV-027` | 觀察實際使用回饋 |
| DEV-028 | 交付點 | Implemented / Browser Smoke Passed / Manual Click QC Pending | 是 | 四模式一致的 Trello-like 任務操作契約 | `SPEC-028`、`QA-DEV-028`、`verify:dev-028-cross-mode-task-interactions`、browser smoke | 依 QA-DEV-028 補人工親自點擊 QC |

### 交付點完成率

- Done：10 個交付點。
- In Verification：2 個交付點。
- Implemented / Browser Smoke Passed：1 個交付點。
- Implemented / Browser Smoke Passed / Manual Click QC Pending：1 個交付點。
- Ready：1 個交付點。
- Deferred：1 個 umbrella 交付點。
- 開發點不列入完成率。

---

## 支援開發點總覽

| DEV | 類型 | 父交付點 | 狀態 | 主題 | 驗證證據 |
|---|---|---|---|---|---|
| DEV-003 | 開發點 | DEV-002 | Done | 紀錄內容 inline task tag | `verify:dev-003-record-tags` |
| DEV-014 | 開發點 | DEV-011 / DEV-012 | Done | 會議紀錄階層編號取代任務分類詞 | 併入 `verify:dev-011`、`verify:dev-012` |
| DEV-015 | 開發點 | DEV-012 | Done | 會議紀錄主線摘要品質優化 | `verify:dev-015-meeting-summary-mainline` |
| DEV-016 | 開發點 | DEV-002 | Done | 紀錄庫改為條列式清單 | `verify:dev-016-records-list-view`、browser verifier |
| DEV-017 | 開發點 | DEV-005 / DEV-010 | Done | 會議紀錄右側欄可拖拉調整並記憶寬度 | `verify:dev-017-record-sidebar-resize`、browser verifier |
| DEV-019 | 開發點 | DEV-002 / DEV-005 / DEV-018 | Done | 紀錄類型與會議流程層級重整 | `SPEC-019`、`QA-DEV-019`、`verify:dev-010-action-feedback`、`verify:dev-019-record-type-layering-browser` |
| DEV-023 | 開發點 | DEV-020 | Implemented / Browser QC Passed / DB unchanged | 專案變化匯入整併為紀錄流程第一步 | `SPEC-023`、`QA-DEV-023`、`QC-DEV-023`、`verify:dev-023-record-project-change-import-workflow-step`、`verify:dev-020-project-change-import-browser` |
| DEV-024 | 開發點 | DEV-011 / DEV-012 / DEV-020 | Ready | AI整理保留手寫內容與章節結構 | `SPEC-024`、`QA-DEV-024`、`verify:dev-024-ai-synthesis-preserve-human-draft` |

---

## 目前阻塞 / 待人工驗證

| 項目 | 影響 | 解除方式 |
|---|---|---|
| DEV-011 / DEV-012 尚缺 production UI smoke | 後端 AI 統整已在正式環境通過，但完整前端流程尚未以 Google OAuth 登入帳號驗證 | 使用已登入 Google 的正式前端，建立或開啟看板後完成 meeting mode、AI整理、校稿發布、紀錄庫與任務知識查找。 |

---

## Release Gate 指令

### 常規自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run verify:dev-013-task-duplicate
npm.cmd run verify:dev-015-meeting-summary-mainline
npm.cmd run verify:dev-016-records-list-view
npm.cmd run verify:dev-017-record-sidebar-resize
```

### Browser / UX 驗證

```powershell
npm.cmd run verify:dev-006-browser-input
npm.cmd run verify:dev-016-records-list-browser
npm.cmd run verify:dev-017-record-sidebar-resize-browser
```

### 正式部署

```powershell
node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive
```

---

## 交付文件索引

| 類別 | 文件 |
|---|---|
| Backlog | `ai-doc/backlog.md` |
| Documentation map | `ai-doc/documentation_map.md` |
| 舊 dev_task 詳細版 | `ai-doc/archived/dev_task_2026-06-09_before_restructure.md` |
| 會議紀錄主線規格 | `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` 到 `SPEC-012` |
| 任務複製規格 | `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` |
| QA 文件 | `ai-doc/qa/` |
| QC 文件 | `ai-doc/qc/` |
| PM reports | `ai-doc/reports/` |

---

## PM 維護規則

- 本檔不再貼長篇需求背景；新增細節請寫到 SPEC / QA / QC / report。
- 新增交付點前，需使用者確認。
- PM 可新增支援開發點，但必須標明父交付點與驗證證據。
- 每次 release 前只更新：狀態、下一步、阻塞、驗證證據。
- 舊任務詳細歷程保留在 archive，不再回填到 active control board。
