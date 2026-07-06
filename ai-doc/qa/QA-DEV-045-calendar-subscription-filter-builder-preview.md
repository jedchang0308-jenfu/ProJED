# QA-DEV-045: 行事曆訂閱篩選器建構器與即時預覽驗證計畫

關聯 DEV：DEV-045
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
狀態：Phase 2 Static QC Passed / Phase 3 Authorized but Release-Gate Blocked
建立日期：2026-07-06

## 驗證目標

驗證行事曆訂閱 v2 Builder 能讓使用者像操作篩選器一樣建立一條外部 `.ics` 訂閱連結，且預覽結果、保存設定與實際 feed output 三者一致。

## Zero-Tolerance Failures

- 預覽看到的任務與 `.ics` 實際輸出的任務 identity 不一致。
- 預設「所有工作區所有看板」導致未來新增的工作區 / 看板自動進入既有外部連結，且使用者沒有明確同意。
- 部分看板查詢失敗時，UI 仍允許產生連結並假裝結果完整。
- 使用者可透過 board override 或手動 payload 訂閱無權看板。
- 使用者可在未具備 owner/admin/project_manager 權限時訂閱他人或未指派任務。
- 舊 v1 訂閱無法讀取、修改、停用或重新產生 token。
- 重新產生 token 意外修改 v2 filter。
- 手機 viewport 出現 filter drawer / preview / action bar 重疊、裁切或 horizontal overflow。

## QA Matrix

### Static / Source Contract

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-045-S01 | SPEC / QA / dev_task / documentation_map | DEV-045 文件完整且互相引用 |
| QA-045-S02 | Type contract | `CalendarSubscriptionFilters` 支援 v2 `version`, `global_filter`, `board_overrides` |
| QA-045-S03 | Normalizer | v2 filters normalize 全域條件、看板 override、snapshot workspace/project ids |
| QA-045-S04 | No direct Workbench reuse | Calendar Builder 不直接依賴 `TaskWorkbenchPanel` UI state 或 placement lane |
| QA-045-S05 | Shared condition controls | 共用條件 UI 不包含工作台專屬 `列表 / 群組` 顯示設定 |
| QA-045-S06 | Preview/feed parity helper | preview 與 feed 至少共享 normalized filter / included task identity projection contract |
| QA-045-S07 | Token regeneration | regenerate token 不修改 `filters_json` |

### Browser UX

| Case | Viewport | 操作 | 預期 |
|---|---|---|---|
| QA-045-B01 | 1440x900 | 進入 Settings > 行事曆訂閱 | 顯示 Builder，預設所有目前可讀取看板 snapshot，並有任務預覽 |
| QA-045-B02 | 1440x900 | 調整全域狀態 / 負責人 / 標籤 / 關鍵字 | 預覽 task count 與清單即時更新 |
| QA-045-B03 | 1440x900 | 選某一看板設定 override | 只有該看板結果改變，其他看板沿用全域條件 |
| QA-045-B04 | 1440x900 | 排除某一看板 | 該看板不出現在預覽 summary 與 output scope |
| QA-045-B05 | 1440x900 | 查詢某看板失敗 fixture | 顯示 partial/error state，產生連結 disabled |
| QA-045-B06 | 1440x900 | 沒有符合任務 | 顯示 empty state 與調整篩選器下一步，不產生誤導 |
| QA-045-B07 | 390x844 | 開啟 filter drawer 並調整條件 | drawer 可操作、可關閉，無 horizontal overflow |
| QA-045-B08 | 390x844 | 查看預覽與底部 action | preview、summary、產生按鈕不重疊、不遮蔽 |
| QA-045-B09 | 1440x900 | 編輯 v1 訂閱 | 可載入 v1 source/condition，儲存後有明確 v2 轉換或維持 v1 行為 |

### Feed / DB

| Case | Data | 預期 |
|---|---|---|
| QA-045-F01 | 2 workspaces / 3 boards；global filter 我的任務 | Preview 與 `.ics` 只含 owner assignee tasks |
| QA-045-F02 | Board B override 改為指定標籤 | Board B 只輸出該標籤任務；其他 boards 沿用 global filter |
| QA-045-F03 | Board C disabled | Board C 不出現在 preview、summary 或 feed |
| QA-045-F04 | selected assignees 包含他人 | 非管理角色 create/update 被拒絕；管理角色可通過 |
| QA-045-F05 | owner 被移出某 board | 下一次 feed request 不輸出該 board 任務 |
| QA-045-F06 | date_types = due_date only | 只產生到期日事件 |
| QA-045-F07 | date_types = start_date + due_date | 同一任務可依既有 UID 規則產生開始 / 到期事件 |
| QA-045-F08 | v1 legacy subscription | feed 行為維持 DEV-037 契約 |

## Regression Gates

RD 實作後需建立 DEV-045 專用 static/browser/feed verifier，並保留下列 regression：

- DEV-037 calendar source-scope static/browser/ICS gates。
- DEV-039 task filter core / result parity gates。
- settings project context static/browser gates。
- DEV-036 workspace governance gate。
- TypeScript noEmit。
- build 或 build:test。
- Supabase static verification if DB / Edge changes.

## Phase 1 QC Update - 2026-07-07

Phase 1 local Builder slice 已完成 static/build QC：

- `verify:dev-045-calendar-subscription-builder-preview`：Pass，16 pass / 0 fail。
- `verify:dev-037-calendar-subscription-source-scope`：Pass，20 pass / 0 fail。
- `verify:dev-039-task-filter-core`：Pass，61 pass / 0 fail。
- TypeScript noEmit：Pass。
- settings project context：Pass。
- production build：Pass。

仍待執行：

- DEV-045 browser verifier：desktop / mobile Builder、override、exclude、empty preview、visual overflow。
- DEV-045 feed verifier：Supabase validation、Edge Function v2、preview/feed identity parity。
- Production live `.ics` smoke。

## Phase 2 QC Update - 2026-07-07

Phase 2 local source slice 已完成 static/source QC：

- `verify:dev-045-calendar-subscription-v2-feed`：Pass，18 pass / 0 fail。
- `verify:dev-045-calendar-subscription-builder-preview`：Pass，16 pass / 0 fail。
- DEV-037 calendar subscription source-scope regression：Pass。
- DEV-039 task filter core regression：Pass。
- TypeScript noEmit：Pass。
- Edge Function esbuild bundling check：Pass。
- production build：Pass。

仍待執行：

- Supabase remote migration apply。
- Supabase Edge Function deploy。
- Live `.ics` preview/feed identity smoke。
- Desktop / mobile browser screenshot QC。

## Phase 3 Preflight Update - 2026-07-07

Phase 3 已被使用者授權，但目前只能完成 read-only preflight，不能宣告 remote release ready：

- Supabase production project `knodlkxqpcqyrtgwpdst` healthy，Postgres 17。
- `calendar-feed` production Edge Function current version 3 active，`verify_jwt=false`；rollback source/version 已可讀取。
- Production DB 尚未套用 DEV-045 v2 validation：`calendar_subscription_task_filter_allowed(jsonb)` 不存在，`calendar_subscription_filter_allowed(jsonb)` 不含 `project_ids` / `v2_scope_type`。
- `ProJED_TEST` Supabase project inactive；無可用 staging / Supabase branch 作為 Level 3 production-like pre-deploy smoke。
- DEV-045 migration 已補強 function execute grants：revoke `PUBLIC` / `anon`，grant `authenticated`。

Resume condition:

- Preferred：提供可用 staging / Supabase branch / local Supabase DB，先做 Level 3 pre-deploy smoke，再 apply production migration / deploy Edge。
- Risk-accepted path：使用者明確接受無 Level 3 的 production DB/Edge 變更風險後，才可直接用 Supabase MCP 對 production apply migration / deploy Edge，且必須立即做 live `.ics` smoke 與 rollback evidence。

## Manual UX Review

- 5 秒內能理解：這是在建立一條「只讀行事曆訂閱連結」。
- 使用者能在產生連結前回答：會輸出幾張看板、幾個任務、哪些日期類型。
- 使用者能看出某張看板是沿用全域條件、自訂條件或被排除。
- 使用者能看出外部連結風險：持有連結的人可讀取事件內容。
- 使用者能從已建立訂閱列表辨識每條連結的設定摘要。

## QC Handoff Evidence

QC 回報至少包含：

- DEV-045 static verifier result。
- DEV-045 browser verifier screenshots：desktop Builder、mobile drawer、preview empty、preview partial/error。
- Preview vs feed identity parity evidence。
- v1 legacy edit/read/regenerate evidence。
- Supabase migration / Edge Function deployment status。
- Production release status if executed。
- 未執行項目與殘留風險。

## Deferred Verification Scope Audit

| Deferred verification | Classification | Covered by | Resume condition |
|---|---|---|---|
| Product implementation verification | Same Spec Phase | DEV-045 Phase 1 | 使用者授權 RD |
| Supabase DB / Edge live verification | Same Spec Phase | DEV-045 Phase 2 / 3 | DB/Edge/deploy 授權 |
| Future dynamic all-accessible scope | Same Spec Phase | DEV-045 Phase 4 | 使用者明確要求未來新看板自動加入既有連結 |
| Google Calendar write API | No Tracking | None | 不屬只讀 ICS 訂閱 |
