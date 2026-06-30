# SPEC-037: 行事曆訂閱來源範圍清晰化

關聯 DEV：DEV-037
父交付點：DEV-036 Trello-like Workspace Governance
任務類型：Settings UX / Calendar subscription / Authorization contract
狀態：Ready for RD
優先級：P1 settings IA and data-scope clarity
建立日期：2026-06-29

## 背景

使用者指出設定頁的「行事曆訂閱」把工作區與看板混在一起，無法看出自己到底在訂閱哪一個範圍。截圖中的主要困惑來自：

- 頁首顯示「目前看板：我的工作區 / JED專案」，但建立訂閱的表單只讓使用者選「工作區」。
- 右側「我的訂閱」只用訂閱名稱與一串條件描述來源，沒有明確標出「來源類型」。
- Sidebar 同時出現 Workspace 與 Board，設定頁又稱「工作區」，使用者容易誤解訂閱的是看板、整個工作區，或多個工作區。

DEV-036 已確認 ProJED 採 Trello-like 模型：Workspace 是多 Board 治理容器，Board 是具體專案工作面。本 DEV 延伸該模型到行事曆訂閱：訂閱必須先說清楚資料來源範圍，再說負責人與日期條件。

## HCS 引導補齊

### 問對問題

- 使用者在這個頁面真正要回答的是「我要把哪個任務範圍同步到外部行事曆？」
- 來源範圍應該由訂閱名稱推測，還是由系統明確標示？
- 當使用者從某一張看板進入設定，預設訂閱範圍應該是目前看板，還是整個工作區？

### 差距分析

現況可用但語意不足：

- `CalendarSubscriptionFilters` 目前只有 `workspace_ids`、`assignee`、`date_types`，無法明確表達單一 Board / Project scope。
- Supabase Edge Function 目前以 `tenant_id` 篩選任務，未支援 `project_id` 範圍。
- `calendar_subscription_filter_allowed` 目前只驗證 `workspace_ids`、負責人與日期類型，未驗證 Board scope。
- UI 表單的 `工作區` label 過粗，沒有說明是「工作區內全部看板」。
- 訂閱列表沒有 canonical source summary，使用者只能從訂閱名稱與條件推測。

### 設計思考

第一版應讓使用者自然完成最常見動作：從目前看板設定頁建立「目前看板」的只讀訂閱。進階使用者仍可改成「工作區全部看板」或自訂範圍，但不能讓進階範圍成為預設，否則會再次造成「我到底訂閱哪一個」的困惑。

### 溝通設計

UI 必須把資訊拆成兩層：

- 來源：看板 / 工作區全部看板 / 自訂範圍。
- 條件：負責人、日期類型、啟用狀態、最後同步。

訂閱名稱只是使用者自訂標籤，不再承擔來源說明。

## 核心決策

- 預設來源範圍：若存在 active board，新增訂閱預設為 `目前看板`。
- 若沒有 active board，新增訂閱預設為目前 Workspace 的 `工作區全部看板`。
- UI 顯示詞採 `訂閱範圍`、`來源`、`條件`，不再用孤立的 `工作區` 作為表單區塊標題。
- 新訂閱資料契約需支援 Board scope；前端文案稱 Board / 看板，資料層對應 `projects.id`。
- 既有訂閱若沒有 scope 欄位，一律視為 legacy `workspace` scope，並在 UI 標示 `來源：工作區全部看板`。
- 重新產生連結只更新 token，不改變來源範圍或條件。

## 資料契約

延伸 `CalendarSubscriptionFilters`，保留舊欄位以維持相容：

```ts
type CalendarSubscriptionScopeType = 'board' | 'workspace' | 'custom';

type CalendarSubscriptionFilters = {
  workspace_ids: string[];
  project_ids?: string[];
  scope_type?: CalendarSubscriptionScopeType;
  assignee: CalendarSubscriptionAssigneeFilter;
  date_types: CalendarSubscriptionDateType[];
};
```

語意規則：

- `scope_type` 缺省：legacy `workspace`。
- `scope_type = 'board'`：`project_ids` 必須剛好一筆，`workspace_ids` 必須包含該 project 所屬 workspace。
- `scope_type = 'workspace'`：`project_ids` 不應存在；代表所選 workspace 內使用者有權讀取的全部看板。
- `scope_type = 'custom'`：允許多 workspace / 多 board，但 UI 必須顯示完整 summary，不得只顯示 `自訂`。
- `workspace_ids` 仍是 permission resolution 的起點；`project_ids` 是縮小範圍，不得擴張權限。

## Supabase / Edge Function 契約

### 前端 service

- `calendarSubscriptionService.normalizeFilters` 需保留 `scope_type` 與 `project_ids`。
- 需新增 Board / Project id resolution，確保 legacy board id 可解析為 Supabase `projects.id`。
- 新增 `listBoardRefs` 或等效查詢，供 UI 顯示 Board name、Workspace path 與建立自訂範圍。
- Existing subscriptions 讀取時要將 legacy filters 正規化為 display model，但不得修改資料庫，除非使用者儲存變更。

### Database validation

需要更新 `public.calendar_subscription_filter_allowed(filters jsonb)`：

- 接受並驗證 `scope_type`。
- 若 `project_ids` 存在，必須是非空 UUID array。
- 每個 `project_id` 必須屬於 `workspace_ids` 內的 workspace。
- 建立或更新訂閱的使用者必須對每個 project 具備讀取權限。
- 仍保留現有負責人規則：訂閱未指派或他人任務需具備 owner/admin/project_manager。

若 RD 判斷現有 RLS 仍只有 workspace-level read，至少必須在本 DEV 的 Edge Function 中額外做 project membership / workspace admin 檢查；不可因 service-role 讀取而繞過 Board scope。

### Calendar feed

`supabase/functions/calendar-feed/index.ts` 需：

- 在 `normalizeFilters` 解析 `scope_type` 與 `project_ids`。
- 在每次 feed request 重新計算 allowed tenants 與 allowed projects，避免成員資格被移除後舊 token 仍讀到資料。
- `board` scope 只回傳指定 project 的任務。
- `workspace` scope 回傳該 workspace 內使用者仍有權讀取的 boards。
- `custom` scope 依明確選取的 workspace/project 集合縮小查詢。
- ICS event description 保留既有 `看板: {projectName}` 與 `負責人`，不得因範圍調整退化。

## UX 規格

### 頁首

設定頁仍可顯示目前 context，但文案需避免暗示所有設定都只作用於目前看板：

- `目前位置：我的工作區 / JED專案`
- 行事曆訂閱區塊中另顯示 `新增訂閱預設來源：目前看板`

### 建立訂閱

表單第一段改為 `訂閱範圍`：

- Segmented control：`目前看板`、`工作區全部看板`、`自訂範圍`。
- `目前看板`：顯示 `我的工作區 / JED專案`，active board 存在時為預設。
- `工作區全部看板`：選擇一個或多個 workspace，文案必須寫清楚「包含所選工作區內可讀取的全部看板」。
- `自訂範圍`：可選指定看板；若 Phase 1 不實作，需 disabled 並顯示未開放，不得出現半成品。

表單需有即時預覽：

- `這個訂閱會包含：JED專案中，負責人為我，且有到期日的任務。`
- 若是 workspace scope：`這個訂閱會包含：我的工作區內所有可讀取看板中，符合條件的任務。`

### 我的訂閱

每筆訂閱卡片必須拆成：

- 名稱：使用者自訂名稱。
- 來源：`看板｜我的工作區 / JED專案` 或 `工作區全部看板｜我的工作區`。
- 條件：`負責人：我｜日期：到期日`。
- 狀態：啟用 / 停用。
- 最後同步：時間或尚未讀取。
- 連結狀態：新產生連結只在本次可複製；重新產生連結要明確提示舊連結失效。

不可只顯示：

- `我的工作行事曆`
- `我的工作區｜負責人：...`

## Scope

### Phase 1 RD 範圍

- 延伸 filters type 與 service normalizer，支援 `scope_type` / `project_ids`。
- 更新 database validation function；若需要 migration，建立 migration。
- 更新 Edge Function feed filtering。
- 改造 `CalendarSubscriptionsView` 的來源範圍 UI、預覽與訂閱列表 summary。
- 補 static verifier 與 browser verifier。
- 補 ICS verifier，驗證 board scope 不會輸出其他 board 任務。

### Out of Scope

- 不改外部行事曆 provider 的同步週期。
- 不做 Google Calendar write API 雙向同步。
- 不新增 billing、seat、quota。
- 不重做整個 Settings IA。
- 不變更 DEV-036 的 Workspace / Board 核心模型。
- 不在本 DEV 解決所有 workspace-level RLS 政策；但 calendar feed 不得因本 DEV 擴大資料可見性。

## 成本與效能評估

- `filters_json` 是既有欄位，新增 `scope_type` / `project_ids` 不需要新增資料列或長期背景工作。
- Board scope 會縮小查詢範圍，通常比 workspace scope 更省。
- 現有 `wbs_items_project_parent_idx (tenant_id, project_id, parent_id, sort_order)` 對 tenant/project 範圍有幫助；若 feed 查詢因 `updated_at desc` 排序變慢，再以 EXPLAIN 判斷是否新增 partial index。
- 不得為了 UI 顯示來源而建立額外輪詢或 realtime subscription。

## Acceptance Criteria

- 使用者在建立訂閱前能清楚知道來源是目前看板、工作區全部看板，或自訂範圍。
- 從 active board 進入設定時，新增訂閱預設為目前看板。
- Board scope 的 `.ics` feed 不包含其他看板任務。
- Workspace scope 的 `.ics` feed 只包含使用者仍有權讀取的看板任務。
- 既有 legacy 訂閱仍可讀取、修改、停用、重新產生連結，且 UI 顯示為 `工作區全部看板`。
- 訂閱列表每筆都有 `來源` 與 `條件`，不需要使用者從名稱猜測。
- Mobile viewport 不得因新增來源摘要造成文字重疊、按鈕裁切或水平 overflow。

## Stop Conditions

- 如果無法在 Edge Function 中可靠限制 `project_id`，停止，不得宣告 Board scope 完成。
- 如果 `calendar_subscription_filter_allowed` 無法驗證 `project_ids`，停止，先補 migration / DB QC。
- 如果 UI 只能改文案但資料仍只能表達 workspace scope，不得把選項命名為 `目前看板`。
- 如果需要部署 Edge Function 或套 migration，必須走 deployment-release-gate。
