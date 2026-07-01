# SPEC-039: 雲端快速備忘與拖移轉任務

狀態：Ready for RD / QA Ready / RD supervisor gap patch complete  
文件角色：PM / RD 開發規格  
建立日期：2026-06-30  
關聯 DEV：DEV-039  
需求來源：使用者要求讓快速記錄整個工作流更順，並確認手機記錄需能在電腦看到；後續決策採 `1C 2A 3B`，並要求評估「像平常拖移任務一樣，把快記拖到清單或看板位置後轉成任務」。使用者後續決策：使用者-facing 名稱由「收件匣」改為「快速備忘 / 備忘錄」。
RD 主管補齊日期：2026-06-30  

---

## 1. 問題定義

目前 `QuickCaptureShell` 已能快速捕捉文字，但只存在瀏覽器本機 `localStorage`。這讓使用者在手機備忘後，電腦看不到；也讓「已登入」的心理預期與實際行為不一致。

真正要解決的不是「多一個備忘功能」，而是：

> 使用者在任何裝置都能先快速備忘，之後在 ProJED 看板脈絡中，用近似拖移任務的體驗，把備忘放到正確位置並轉成正式任務。

---

## 2. 已確認決策

### 2.1 備忘錄歸屬

採 `1C`：先進個人雲端備忘錄，整理時再選 workspace / board。

規則：

- 快速捕捉時不要求選 workspace、board、owner、日期。
- 若捕捉時已有 active workspace / board，只記錄為 `sourceWorkspaceId` / `sourceBoardId` 建議，不代表該快記已公開到該工作區。
- 未轉成正式任務前，快記只屬於建立者個人。

### 2.2 整理後主要去向

採 `2A`：第一版主要轉成正式 `TaskNode`。

規則：

- 本 DEV 不做完整備忘系統。
- 快速記錄本身是「暫存型收件匣」，不是正式備忘資料庫。
- 若使用者輸入的是備忘文字，第一版仍先作為待整理快記保存；可完成、刪除或轉成任務。
- `note` / `someday` 可保留為資料模型相容欄位，但不作為 DEV-039 的主要 UI 交付。

### 2.3 離線與未登入

採 `3B`：未登入或離線時先本機暫存，登入或恢復連線後同步。

規則：

- 捕捉不可因網路或登入狀態失敗。
- 本機 pending item 必須可見，並顯示 `待同步`。
- 同步成功前不可轉成正式任務。
- 同步成功後，手機與電腦都能看到同一筆雲端收件匣項目。

### 2.4 文字拆解與 token

採 `2C-lite`：用 deterministic rule 拆解，不呼叫 AI，不消耗 LLM token。

規則：

- 第一行或第一句作為任務標題。
- 剩餘內容進入任務備註或 description。
- 簡單日期解析只支援明確規則，例如 `今天`、`明天`、`下週`、`YYYY-MM-DD`、`MM/DD`。
- 日期解析結果只作為 suggested due date；建立正式任務前需可修改或清除。
- 本 DEV 不做 AI 分類、AI 看板建議或 AI 任務拆解。

### 2.5 入口

採 `3A`：保留右下角浮動快速備忘，另加整理備忘錄入口。

規則：

- 右下角浮動入口負責快速捕捉。
- 整理備忘錄入口負責批次整理、同步狀態、拖移轉任務。
- 不把完整整理流程塞進小型快速記錄浮窗。

### 2.6 HCS 引導模式補齊決策

本段補齊 RD 主管 review 後的 P0/P1 缺口，採保守安全預設：

| 題號 | 決策 | 採用選項 | 理由 |
|---|---|---|---|
| 1 | 快記轉任務一致性 | A. 單一 DB transaction / RPC | 避免前端兩段式流程產生 ghost task、重複任務或 promoted 狀態不一致。 |
| 2 | 未登入 / 換帳號 local outbox 歸屬 | A. 帳號綁定 + 匿名需明確認領 | 避免共用裝置或換帳號時把私人快記同步到錯誤帳號。 |
| 3 | TaskNode 文字欄位 | A. `description` 為邏輯 canonical body field | 避免 RD 在 `description` / `detailNotes` 間自行猜測，造成 UI 與 QA 不一致。 |
| 4 | Board 權限 | A. Promotion gate 檢查 target board create permission | 快記私有權限與任務看板權限是兩條邊界，轉換時必須同時成立。 |

執行規則：

- `description` 是 DEV-039 的邏輯欄位名稱；若目前 DB / TypeScript schema 使用不同實體欄位，service layer 需明確 mapping，不得新增第二個使用者可見的備註欄位。
- 未登入建立的匿名快記，登入後不可靜默同步；需顯示「匯入到目前帳號」或等效明確認領動作。
- 已登入建立的本機 pending item，只能同步到建立當下的 `createdAuthUserId`；使用者換帳號後不得自動同步。

### 2.7 產品命名決策

使用者-facing 名稱採「快速備忘 / 備忘錄」，不再以「收件匣」對使用者呈現。

命名規則：

- 右下角浮動入口：`快速備忘`。
- 整理頁 / drawer：`備忘錄`。
- 項目名稱：`備忘` 或 `備忘項目`。
- 狀態分區：保留流程型文案，例如 `待整理`、`待同步`、`同步失敗`、`已轉任務`。
- 禁用 UI 文案：`收件匣`、`Inbox`、`已存入收件匣`。

技術命名規則：

- 既有開發文件內的 `InboxItem` / `inbox_items` 可作為內部資料契約暫時保留，避免為了命名導致 schema churn。
- 若 RD 尚未建立 migration，可評估改用 `memo_items` / `MemoItem`，但需同步更新 types、service、QA 與 migration；不得只改 UI 不改資料契約說明。
- 無論內部命名採 `inbox` 或 `memo`，產品語意都固定為「任務捕捉與整理用備忘錄」，不是完整筆記 / 知識庫系統。

---

## 3. 與既有文件的關係

### 3.1 接續 DEV-034

DEV-034 已完成 local-first `QuickCaptureShell` 與本機 pending queue。本 DEV 接續其 deferred scope：

- 正式雲端備忘錄。
- 跨裝置同步。
- 快記轉正式任務。
- 同步失敗與 retry 可見狀態。

### 3.2 修正 SPEC-002 的舊假設

`SPEC-002` 先前將第一版看板定位定為「大型 overlay + 點選插入線」，並把拖曳列為未來升級。使用者本輪已明確要求評估並偏好：

> 直接用拖移方式，放到清單或看板的位置，整個移動體驗與平時拖移任務一樣。

DEV-039 對此範圍採新的 authoritative rule：

- 第一版轉任務以 `drag-to-task` 作為目標互動。
- 若 RD 證明跨 context 拖移無法穩定達成，才降級為「大型 overlay + 點選插入線」，並必須回報 PM/使用者，不得靜默改設計。

---

## 4. End-State Architecture

```mermaid
flowchart LR
  A["QuickCaptureShell / 快速備忘"] --> B["Local Outbox"]
  A --> C["Cloud Memo"]
  B --> C
  C --> D["Memo Triage Drawer"]
  D --> E["Drag Candidate"]
  E --> F["Board DnD Surface"]
  F --> G["TaskNode"]
  G --> H["Memo item promoted"]
```

### 4.1 Domain Objects

`InboxItem` 是內部資料契約名稱；使用者-facing 名稱為「備忘項目」，不是正式任務。  
`TaskNode` 是正式專案任務，進入 workspace / board 權限與活動紀錄。

### 4.2 Visibility Boundary

- `InboxItem` 預設只對 `owner_id = auth.uid()` 可見。
- 轉成 `TaskNode` 後才依 workspace / board 權限公開。
- 不得把私人快記直接寫入團隊任務或活動紀錄。

### 4.3 Interaction Boundary

- 捕捉階段只要文字。
- 同步階段負責保護跨裝置一致性。
- 整理階段才選位置。
- 轉任務階段才建立 `TaskNode`。

---

## 5. 建議資料模型

新增 Supabase table：`public.inbox_items`。

命名備註：`inbox_items` 是內部資料表暫定名稱；UI 不得顯示「收件匣」。若 RD 在 migration 建立前決定改為 `memo_items`，需整體同步更新 schema、types、service、QA verifier 與文件引用。

最小欄位：

```sql
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_mutation_id text not null,
  title text not null,
  raw_text text not null,
  detail_text text,
  item_type text not null default 'todo',
  capture_status text not null default 'untriaged',
  source_workspace_id uuid references public.tenants(id) on delete set null,
  source_project_id uuid references public.projects(id) on delete set null,
  suggested_due_date date,
  confirmed_due_date date,
  promotion_client_mutation_id text,
  promoted_task_node_id uuid references public.wbs_items(id) on delete set null,
  promoted_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_mutation_id),
  unique (owner_id, promotion_client_mutation_id),
  check (item_type in ('todo', 'note', 'someday')),
  check (capture_status in ('untriaged', 'promoted', 'completed', 'archived')),
  check (
    (capture_status = 'promoted' and promoted_task_node_id is not null and promoted_at is not null)
    or capture_status <> 'promoted'
  )
);
```

最小狀態：

| 狀態 | 意義 |
|---|---|
| `untriaged` | 已同步但尚未整理 |
| `promoted` | 已轉成正式任務 |
| `completed` | 不轉任務，直接完成 |
| `archived` | 歸檔或刪除後不可見 |

RLS 原則：

- 啟用 RLS。
- `authenticated` 可 `select / insert / update / delete` 自己的 row。
- `with check` 必須限制 `owner_id = auth.uid()`。
- 不使用 `auth.role()`。
- 不把 `service_role` key 暴露到前端。

Data API 原則：

- 若 Supabase Data API 不再自動 expose 新表，migration 需明確 `grant select, insert, update, delete on public.inbox_items to authenticated;`。
- `anon` 不應有任何 `inbox_items` 存取權。
- migration 結尾需 `notify pgrst, 'reload schema';`，避免前端立即呼叫時 schema cache 找不到新表。

建議 indexes：

- `create index inbox_items_owner_status_created_idx on public.inbox_items(owner_id, capture_status, created_at desc);`
- `create index inbox_items_promoted_task_idx on public.inbox_items(promoted_task_node_id) where promoted_task_node_id is not null;`

### 5.1 Promotion Transaction Contract

快記轉正式任務不得由前端連續呼叫「建立 TaskNode」與「更新 InboxItem promoted」兩個獨立請求完成。RD 必須建立單一 promotion contract，建議為 Supabase RPC：

`public.promote_inbox_item_to_task(...)`

最小輸入：

- `p_inbox_item_id uuid`
- `p_target_project_id uuid`
- `p_target_parent_id uuid`
- `p_insert_before_id uuid default null`
- `p_insert_after_id uuid default null`
- `p_promotion_client_mutation_id text`
- `p_title text default null`
- `p_description text default null`
- `p_confirmed_due_date date default null`

最小輸出：

- `task_node_id`
- `inbox_item_id`
- `capture_status`
- `promoted_at`

Transaction 規則：

1. 以 `auth.uid()` 取得 caller，未登入直接拒絕。
2. `select ... for update` 鎖定 `inbox_items` row。
3. 驗證 `owner_id = auth.uid()`。
4. 驗證 `capture_status = 'untriaged'` 且 `promoted_task_node_id is null`。
5. 驗證 `p_promotion_client_mutation_id` 不為空。
6. 驗證 caller 對 target board / project 具備建立任務權限；viewer / 無權限者不得建立。
7. 驗證 target parent / before / after node 屬於同一 target project，避免跨 board 寫入。
8. 以既有排序規則計算或驗證 `order`，不得另創不相容排序。
9. 建立 `TaskNode`，`title` 使用 parser 結果或使用者覆寫，body 寫入邏輯 `description`。
10. 同一 transaction 更新 `InboxItem.capture_status = 'promoted'`、`promotion_client_mutation_id`、`promoted_task_node_id`、`promoted_at`。
11. transaction commit 後回傳 task 與 inbox 狀態。

Idempotency 規則：

- 同一 `p_inbox_item_id` 已 promoted，且 `promotion_client_mutation_id` 相同時，可回傳既有 `promoted_task_node_id`，不得再建第二張任務。
- 同一 `p_inbox_item_id` 已 promoted，但 `promotion_client_mutation_id` 不同時，回傳 conflict。
- transaction 失敗時不得留下 task-only 或 inbox-only 的半成功狀態。
- 若現有 `wbs_items` schema 無法承載 idempotency key，不得把 idempotency 硬塞進 task；以 `inbox_items.promotion_client_mutation_id` 作為 promotion 層級防重複依據。

RPC 權限：

- `anon` 不得 execute。
- `authenticated` 可 execute，但 function 內必須以 `auth.uid()` 與 board permission 明確檢查。
- 若使用 `security definer`，必須固定 `search_path`，並避免直接信任 client 傳入的 owner / workspace 欄位。
- 若使用 `security invoker`，仍須確認 RLS 與 table policy 足以阻擋越權。

---

## 6. Local Outbox 與同步規則

沿用目前 `projed.quickCapture.inboxItems` 本機 queue，但欄位需升級以支援雲端 sync、帳號歸屬與 legacy migration。

本機狀態：

| syncStatus | 意義 |
|---|---|
| `pending` | 尚未同步到雲端 |
| `syncing` | 正在送出 |
| `synced` | 已有雲端 row |
| `failed` | 最近一次同步失敗 |

同步規則：

- 新增快記時立即寫本機，產生 `clientMutationId`。
- 已登入且在線時背景 upsert 到 `inbox_items`。
- 雲端成功後保存 `cloudId`，並標記 `synced`。
- 重開 App 時先讀本機 pending，再載入雲端 inbox，依 `clientMutationId` 去重。
- pending / failed item 可編輯文字與日期建議，但不可轉任務。
- failed item 提供重試，不得要求使用者重打。

### 6.1 Local Outbox v2 欄位

本機 queue 需升級到 `schemaVersion = 2`。每筆 local item 最少包含：

- `localId`
- `cloudId`
- `clientMutationId`
- `rawText`
- `title`
- `detailText`
- `syncStatus`
- `createdAuthUserId`
- `anonymousOwnerKey`
- `requiresOwnershipConfirmation`
- `lastSyncError`
- `createdAt`
- `updatedAt`

帳號歸屬規則：

- 已登入建立：`createdAuthUserId = auth.uid()`，只能同步到同一 user。
- 未登入建立：`createdAuthUserId = null`，`anonymousOwnerKey` 綁定本裝置 local profile。
- 未登入 item 在使用者登入後，需顯示匯入提示；使用者確認後才設定 `createdAuthUserId = auth.uid()` 並同步。
- 使用者切換帳號時，只顯示目前帳號的 pending / failed item，以及尚未認領的匿名 item。
- 其他帳號建立但尚未同步的 item 不得自動上傳到目前帳號；可顯示「此裝置有其他帳號待同步項目，請切回原帳號處理」或直接隱藏。
- 登出不刪除 pending item，但必須停止背景同步。

### 6.2 Legacy LocalStorage Migration

讀取 `projed.quickCapture.inboxItems` 時需偵測 legacy item。

Migration 規則：

1. 若 item 無 `schemaVersion`，視為 v1。
2. 若 item 無 `clientMutationId`，產生新 id；不得用 raw text 當唯一 id。
3. 若目前有登入 user，legacy item 預設歸屬目前 user，但需標記 `migratedFromLocalOnly = true`。
4. 若目前未登入，legacy item 視為匿名 item，需登入後確認認領才同步。
5. migration 完成前不得刪除原始 local data；完成後保存 v2 backup timestamp。
6. dedupe 順序為 `cloudId`、`clientMutationId`、最後才用 raw text + createdAt 近似比對。
7. migration 失敗時保留原資料並顯示「本機快記升級失敗，可重試」，不得清空使用者文字。

---

## 7. Drag-to-Task UX

### 7.1 核心意圖

使用者拖移快記時，心智模型應接近：

> 這筆快記就是一張尚未正式化的任務卡，我把它拖到看板哪裡，它就變成那裡的任務。

### 7.2 技術可行性與限制

目前 `BoardView` 已使用 `dnd-kit`，欄、卡片、下層任務都有 droppable/sortable data：

- `wbs-column`
- `wbs-card`
- `wbs-card-drop`
- `wbs-checklist`
- `wbs-checklist-drop`

可行，但有一個重要限制：

- 現有 `DndContext` 在 `BoardView` 內。
- 目前 `QuickCaptureShell` 在 `App` root，位於 `AuthGate` 外。
- 若收件匣抽屜仍在 `BoardView` 外，不能自然共用同一套 DnD context。

RD 建議方案：

1. 保留 `QuickCaptureShell` 作為全域捕捉入口。
2. 新增 `MemoTriageDrawer`，在 `BoardView` route 中渲染為 board-aware drawer，接入 `BoardView` 的 `DndContext`。
3. 若需要跨 view 開啟備忘錄，非 board view 只允許整理與查看；拖移轉任務需切到 board view 或開啟 board-aware overlay。

不得採用的捷徑：

- 不用原生 HTML5 drag 另做一套拖移，避免手感與既有任務拖移不同。
- 不在 drop 前建立暫時 `TaskNode`，避免同步失敗時產生 ghost task。
- 不讓 local pending item 直接轉任務。

### 7.3 Drop 行為

| Drop target | 建立結果 |
|---|---|
| 欄位空白區 / 欄底 | 新 `TaskNode` 成為該欄位子任務，order append |
| 卡片之間 | 新 `TaskNode` 成為同欄卡片，order 插入 |
| 卡片 checklist drop zone | 新 `TaskNode` 成為該卡片下層任務 |
| 無效區域 | 不建立任務，快記保留在收件匣 |

建立欄位：

- `workspaceId` 由目標 board 反推。
- `boardId` 為目標 board。
- `parentId` 由 drop target 決定。
- `order` 由現有 DnD order normalization 算法決定。
- `title` 來自 deterministic parser。
- `description` 承接剩餘文字；若實體 schema 欄位名稱不同，由 service layer 做單一 canonical mapping。
- `endDate` 可由 confirmed / suggested due date 帶入，但使用者必須可清除。
- `status = 'todo'`。
- `nodeType = 'task'`。

建立流程：

- 前端只負責提供 drop target、parser 結果與 optional override。
- 前端不得直接先建 `TaskNode` 再 patch `InboxItem`。
- drop confirmed 後呼叫 promotion RPC。
- RPC 回傳成功後才更新 UI、移除未整理 item、顯示 toast。
- RPC 回傳 permission denied / conflict / invalid target 時，不建立任務，item 留在收件匣。

成功後：

- 建立正式 `TaskNode`。
- 更新 `InboxItem.capture_status = 'promoted'`。
- 回填 `promoted_task_node_id` 與 `promoted_at`。
- 顯示 toast：`已轉成任務`，含 `查看任務` action。
- 收件匣項目從未整理列表移除，保留在完成/已轉任務區。

失敗時：

- 不更新 `InboxItem` promoted 狀態。
- 不從收件匣移除。
- 若 `TaskNode` 建立成功但 `InboxItem` 更新失敗，需提供補償或 retry gate，不得讓同一快記可重複轉任務。

---

## 8. UI / IA 設計

### 8.1 快速捕捉

保留右下角浮動入口：

- 未輸入時顯示 `快速記錄`。
- 有 pending / failed / untriaged 數量時顯示 badge。
- 登入且在線：文案為 `已同步到雲端收件匣` 或 `儲存中`。
- 未登入或離線：文案為 `已存本機，待同步`。

### 8.2 整理備忘錄入口

新增入口建議：

- QuickCaptureShell 展開狀態提供 `整理備忘錄`。
- Board view toolbar 或右上角提供 Memo icon + badge。
- Sidebar 可顯示未整理數量 badge，但不取代 QuickCaptureShell。

### 8.3 MemoTriageDrawer

Drawer 內容：

- 分區：`待整理`、`待同步`、`同步失敗`、`已轉任務/完成`。
- 每筆 item 顯示 title、日期建議、來源建議、同步狀態。
- 已同步且在 board view 時顯示 drag handle。
- pending / failed item 的 drag handle disabled，並顯示原因。

---

## 9. RD 實作切片

### Phase 0：文件與任務登錄

狀態：本文件完成。

### Phase 1：Cloud Inbox schema / service / sync

範圍：

- 新增 Supabase migration：`public.inbox_items`、RLS、grants、indexes、schema cache reload。
- 新增 promotion transaction RPC 或等效單一 transaction contract。
- 更新 `database.types.ts`。
- 新增 `inboxService`，接入 `dataBackend.ts`。
- 升級 `useQuickCaptureStore`：local outbox v2 + account ownership + legacy migration + cloud sync + dedupe。
- 更新 QuickCapture 文案為 truthful sync state。

不做：

- drag-to-task。
- 今日分頁。
- 指派他人。
- AI 建議。

### Phase 2：MemoTriageDrawer

範圍：

- 新增整理備忘錄入口。
- 顯示雲端與本機 pending items。
- 支援完成、刪除/封存、重試同步。
- deterministic parser 顯示 title / detail / suggested date。

不做：

- 正式備忘系統。
- 通知中心。

### Phase 3：Board drag-to-task

範圍：

- 在 board view 內接入 `InboxTriageDrawer` 的 draggable item。
- 使用現有 `dnd-kit` DnD data contract，新增 `quick-capture-item` active type。
- Drop 到欄位、卡片間、checklist zone 時呼叫 promotion RPC 建立 `TaskNode` 並更新 `InboxItem`。
- viewer / 權限不足者不可 promote。
- 提供 undo / 查看任務。

不做：

- 非 board view 跨畫面拖移。
- AI 自動選 board。
- 離線轉任務。

### Phase 4：回歸與 polish

範圍：

- mobile viewport。
- touch / scroll / drag 衝突。
- duplicate prevention。
- visible error sweep。
- DEV-034 / DEV-028 / DEV-035 / DEV-036 regression。

---

## 10. RD Acceptance

- 登入使用者新增快記後，資料進入雲端 `inbox_items`，手機與電腦可看見同一筆。
- 未登入或離線時可先保存本機，恢復登入/連線後同步。
- 匿名 item 登入後需明確認領才同步；換帳號不得把前一帳號 pending item 同步到目前帳號。
- legacy localStorage item 可升級到 local outbox v2，不丟失文字。
- UI 明確顯示 `已同步`、`待同步`、`同步失敗`。
- pending / failed item 不可轉任務，且有 disabled reason。
- 整理備忘錄可從浮動快記入口進入。
- 在 board view 中，已同步快記可拖到欄位或看板位置並建立正式 `TaskNode`。
- 快記轉任務需透過單一 transaction / RPC；不得出現 task 建立成功但 inbox 未 promoted 的 ghost state。
- 權限不足者不得把私人快記 promote 到無權建立任務的 board。
- 拖移轉任務的 preview / drop highlight / toast 與既有任務拖移體驗一致。
- 轉任務成功後，`InboxItem` 標記為 `promoted`，不得重複轉同一筆。
- deterministic parser 不呼叫 LLM，不消耗 token。
- 390px mobile viewport 不出現文字重疊、水平 overflow 或無法關閉 drawer 的問題。

---

## 11. Stop Conditions

- 如果 `inbox_items` 沒有正確 RLS 與 owner-only policy，停止，不得進入 RD 完成宣告。
- 如果新表未能透過 Data API 被 authenticated user 存取，停止，不得只改前端文案。
- 如果拖移需要另做一套與現有任務不同的 drag engine，停止並回報 PM。
- 如果 drop order 無法與既有任務排序一致，停止，不得建立看似成功但位置錯誤的任務。
- 如果無法以單一 transaction / RPC 或等效機制保證 TaskNode 與 InboxItem promoted 原子一致，停止。
- 如果換帳號或匿名認領規則無法避免 local item 同步到錯誤帳號，停止。
- 如果 legacy localStorage migration 可能清空使用者文字，停止。
- 如果要使用 AI / LLM token 做解析或分類，需先取得使用者授權，不得偷偷加入。
- 如果要做正式備忘、通知中心、輕量指派或今日分頁，另開 DEV，不納入 DEV-039。
- 如果需要 production deploy、遠端 migration 或資料修復，走 deployment-release-gate。

---

## 12. QA / QC Alignment

QA 文件：`ai-doc/qa/QA-DEV-039-cloud-quick-capture-inbox-drag-to-task.md`

必要 gates：

- Static：schema、RLS、service、store sync、DnD type、parser no-token。
- DB：owner 可 CRUD，其他 user 不可讀寫，anon 不可存取，promotion RPC 原子一致與 idempotency 通過。
- Browser：手機新增、電腦讀取、離線 pending、同步後可拖、drop 建 task。
- UX：5 秒理解、disabled reason、錯誤復原、mobile viewport。
- Regression：DEV-034 local capture、DEV-028 task drag/click、DEV-035 workspace delete、DEV-036 workspace switching。

---

## 13. ADR 判斷

本 DEV 暫不新增獨立 ADR。

理由：

- 產品方向已由 `SPEC-002` 建立：私人 `InboxItem` 先行，使用者確認後才轉正式 `TaskNode`。
- DEV-039 是該方向的聚焦交付點，沒有取代 workspace / board / task 的主資料身份。
- 權限邊界在本 SPEC 內明確定義為 owner-only private inbox。

若後續加入以下能力，需另開 ADR 或 SPEC：

- 輕量指派他人。
- 團隊共享 inbox。
- 自動公開到 workspace。
- AI 自動建立正式任務。
- 完整備忘/知識庫。

---

## 14. Open Questions

- `查看任務` 是否需要自動切換到目標 board 並 highlight 新任務？建議做，但可作 Phase 3 polish。
- 備忘錄入口在 Sidebar 的確切位置是否要與 Workspace / Board 導覽合併？建議先用 floating + board toolbar，避免 sidebar 擁擠。

已固定決策：

- `TaskNode` 剩餘文字使用邏輯 `description`，不得在 DEV-039 內同時引入另一套任務備註欄位。

---

## 15. Deferred Scope

- 完整筆記 / 知識庫型備忘功能。
- `note` / `someday` 的正式整理 UI。
- AI parser / AI board recommendation。
- 我的今日。
- 站內通知。
- 輕量共享或改派。
- browser notification / email / calendar reminder。
- 非 board view 的跨畫面拖移。
