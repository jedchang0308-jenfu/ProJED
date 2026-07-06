# SPEC-045: 行事曆訂閱篩選器建構器與即時預覽

關聯 DEV：DEV-045
父交付點：DEV-037 行事曆訂閱來源範圍清晰化 / DEV-039 任務過濾器核心與全域任務平台
任務類型：Calendar subscription v2 / Cross-board filter builder / External link safety
狀態：RD Contract Ready / Not Authorized
建立日期：2026-07-06

## Problem

使用者希望行事曆訂閱設定不要像傳統表單先選單一來源，而是像全域任務平台的過濾器一樣直覺：

- 調整條件時，立即看到會被訂閱出去的任務。
- 預設涵蓋所有可訂閱的工作區與看板，而不是先問目前看板、工作區或自訂範圍。
- 可以為所有看板設定好各自的篩選條件。
- 最後一次產出一條訂閱連結。
- 每一條訂閱連結就是一個已保存的訂閱設定。

這個需求是 DEV-037 的 v2 UX 升級。DEV-037 解決「來源範圍要清楚」；DEV-045 改成「訂閱本身是一個可預覽、可保存、可對外輸出的跨看板查詢」。

## Human Decision Brief

Confirmed decisions:

- 使用者確認：訂閱範圍預設是所有工作區、所有看板。
- 使用者確認：使用者應像操作篩選器一樣調整條件，不需要先被迫選來源範圍。
- 使用者確認：調整時要立即看到篩選出的任務有哪些。
- 使用者確認：可以將所有看板的篩選條件都設定好，再一次產出一條訂閱連結。
- 使用者確認：每一個產出的訂閱連結就是一個訂閱設定。

Rejected options:

- 不採用 DEV-037 v1 的「先選目前看板 / 工作區全部看板 / 自訂範圍」作為主要建構流程。
- 不直接把 `TaskWorkbenchPanel` 的 filter popover 整包搬到行事曆訂閱，因為工作台 filter 是 UI 顯示條件，行事曆訂閱是外部長期連結。
- 不把全域任務平台的看板 selector 解讀成訂閱來源範圍；在 DEV-045 裡，看板設定是每張看板的條件 override。

AI assumptions:

- 預設輸出範圍是「目前使用者在建立當下可讀取的工作區 / 看板 snapshot」，未來新增的工作區或看板不自動加入既有訂閱，避免長期外部連結無預警擴大資料範圍。
- 預設條件採保守外流：我的任務、到期日、未完成狀態；使用者可手動放寬到他人、未指派、完成任務、開始日或更多條件。
- `filters_json` 可以向 v2 JSON contract 演進，不需要新增 subscription table；如需 query index 或 validation function migration，必須另走 Supabase gate。

Re-entry triggers:

- 使用者希望既有訂閱自動包含未來新增工作區 / 看板。
- 使用者希望 `.ics` 連結包含他人任務、未指派任務或完整任務描述作為預設。
- RD 發現即時預覽無法使用與 Edge Function feed 相同的權限 / filter 邏輯。
- 需要 production deploy、remote migration、Edge Function deploy、正式資料修復或資料刪除。

## End-State Architecture

DEV-045 的最終模型：

```text
Calendar Subscription Builder
  - subscription name
  - global subscription filter
  - per-board overrides
  - live preview result
  - output summary
  - create one ICS subscription link

Saved Calendar Subscription
  - one saved filters_json v2 object
  - one token / one feed URL
  - one immutable external feed identity until edited or token regenerated
```

核心規則：

- 使用者設定的是一條可保存的查詢，不是臨時 UI filter。
- 預覽結果與 `.ics` feed 結果必須使用同一個 subscription query contract。
- 預覽清單不是裝飾；它是產生外部連結前的安全確認。
- 每條訂閱連結保存自己的 filter snapshot；修改訂閱後才更新該連結輸出。
- Token regeneration 只換 token，不得改 filter。

## Architecture Memory Capsule

- DEV-037 已讓 `CalendarSubscriptionFilters` 支援 `scope_type` / `project_ids`，並保留 legacy `workspace_ids`。
- DEV-039 已建立 `TaskFilterState`、`matchesTaskFilters`、`projectTaskFilterResults` 與跨看板工作台 filter 心智模型。
- DEV-045 應共用任務條件語意，但不得讓工作台 placement lane、顯示設定、未歸位語意進入行事曆訂閱。
- 行事曆訂閱會產生外部 `.ics` URL，因此預設與確認流程必須比一般 UI filter 更保守。
- 即時預覽需支援 partial/error 狀態；若某些看板無法查詢，UI 不得假裝結果完整。
- 舊版 DEV-037 訂閱仍需可讀取、可修改、可停用、可重生 token。

## Data Contract

新增 v2 filters contract，建議保存在既有 `calendar_subscriptions.filters_json`：

```ts
type CalendarSubscriptionFilterVersion = 1 | 2;

type CalendarSubscriptionBoardFilterOverride = Partial<TaskFilterState> & {
  enabled?: boolean;
};

type CalendarSubscriptionV2Filters = {
  version: 2;
  scope_type: 'all_accessible_boards_snapshot';
  workspace_ids: string[];
  project_ids: string[];
  global_filter: TaskFilterState;
  board_overrides: Record<string, CalendarSubscriptionBoardFilterOverride>;
  date_types: CalendarSubscriptionDateType[];
};
```

Contract rules:

- `workspace_ids` / `project_ids` 是建立或儲存時解析出的可讀取 snapshot。
- `global_filter` 是所有看板的預設條件。
- `board_overrides` 只保存與 `global_filter` 不同的看板條件，避免資料膨脹。
- `board_overrides[projectId].enabled === false` 代表該看板不納入此訂閱。
- `date_types` 決定哪些日期會變成 calendar event；它不是普通 task display setting。
- v1 filters 仍支援：缺少 `version` 的訂閱依 DEV-037 contract 正規化顯示。

Backward compatibility:

- v1 `scope_type = board | workspace | custom` 不自動改寫成 v2，除非使用者按「修改」並儲存。
- v1 訂閱在列表中仍顯示來源 / 條件 summary。
- 使用者編輯 v1 訂閱時，RD 可選擇導入 v2 Builder，但必須先顯示舊來源對應的新 snapshot 與預覽。

## UX Contract

### Builder Layout

建議桌機 layout：

```text
訂閱名稱

[過濾器] [預覽任務數] [重設]
  popover / side panel:
    全域條件
    看板清單
    每張看板可套用全域條件、改用自訂條件、或排除

即時預覽
  grouped by workspace / board
  task title
  status
  assignee
  start date / due date
  reason included / excluded where useful

輸出摘要
  X 個工作區、Y 張看板、Z 個任務、日期類型、外部連結風險

[產生並複製訂閱連結]
```

Mobile:

- Builder 使用 single-column layout。
- Filter editor 使用 drawer 或 full-height sheet。
- Preview 在 filter 下方；不得與 filter drawer 同時造成雙重垂直 scroll confusion。
- 320px / 390px 不得 horizontal overflow。

### Required copy

- 主標題：`建立行事曆訂閱`
- 短說明：`像篩選任務一樣調整條件，預覽確認後產生一條只讀行事曆連結。`
- Summary：`這條連結會輸出 X 個工作區 / Y 張看板中的 Z 個任務。`
- Risk helper：`任何持有此連結的人都能讀取連結中的事件內容；請只輸出必要任務。`

### Default state

- Scope snapshot：所有目前可讀取的工作區 / 看板。
- Global filter：我的任務；狀態排除 completed；日期類型預設 due_date。
- Preview：立即顯示符合條件的前 N 筆，並顯示總數或 capped count。
- 若使用者沒有任何可讀取看板，顯示 empty state 與下一步，不可產生連結。

## Implementation Contract

### Frontend

- 建立 `CalendarSubscriptionBuilder` 或等效 component，取代目前 `CalendarSubscriptionsView` 的 v1 建立表單。
- 抽出共用 task condition UI，例如 `TaskConditionFilterControls`，供 Workbench 與 Calendar Builder 共用條件控件。
- Calendar Builder 外殼必須保留 calendar-specific controls：date types、external link risk summary、subscription name、create/copy action。
- 建立 preview state：
  - debounced filter evaluation。
  - loading / partial / error / empty / capped result states。
  - result grouped by workspace / board。
- Preview 與 create submit 必須使用同一份 normalized filter payload。
- 若 preview 查詢部分失敗，產生連結按鈕應 disabled 或要求使用者明確確認 partial risk；Phase 1 建議 disabled。

### Service / API

- 延伸 `CalendarSubscriptionFilters` type 支援 v2 contract。
- `calendarSubscriptionService.normalizeFilters` 需：
  - resolve all current accessible workspace/project refs into snapshot。
  - normalize `global_filter` via existing task filter normalizer。
  - remove board overrides identical to global filter。
  - reject project ids outside accessible snapshot。
- 建立 preview service：
  - local-test / browser verifier 可使用 deterministic fixture。
  - Supabase mode 可使用 project-by-project reads or RPC；若需要 RPC/RLS/migration，停下走 Supabase gate。
  - preview result 不得包含 archived task、archived ancestor descendant、missing-parent orphan 或無權 board。
- Edge Function `calendar-feed` 需支援 v2 filters：
  - apply snapshot project ids。
  - apply global filter and board overrides。
  - filter by status / due window / assignee / tag / keyword。
  - generate events only for selected `date_types`。

### Database / Permission

- `calendar_subscription_filter_allowed(filters_json)` 需支援 v2 shape。
- 權限檢查：
  - owner 必須仍對 snapshot workspaces/projects 具備讀取權限。
  - assignee filter 包含他人或未指派時，仍需 owner/admin/project_manager 權限。
  - Feed request 每次重新檢查 membership；被移除權限後，舊 token 不得繼續輸出該 board。
- 不新增背景工作、排程同步或 realtime subscription。
- 如 preview performance 需要 index，需以 EXPLAIN / static SQL review 決定，不得先猜測加 index。

## Phase Roadmap

| Phase | 狀態 | 目的 | 主要輸出 |
|---|---|---|---|
| 0 | Complete | PM/RD contract | SPEC / QA / dev_task / documentation_map |
| 1 | RD Contract Ready / Not Authorized | Builder UI + local preview contract | v2 Builder、global filter、board overrides、local-test preview、v1 compatibility UI |
| 2 | RD Contract Ready / Not Authorized | Supabase preview + feed v2 | filters_json v2 validation、Edge Function v2 query、ICS feed parity |
| 3 | RD Contract Ready / Not Authorized | Production release and live smoke | migration apply、Edge deploy、Firebase deploy、live `.ics` smoke |
| 4 | RD Contract Ready / Not Authorized | Advanced subscription governance | duplicate/copy subscription, audit/export, optional future dynamic scope |

## RD Handoff Contract

### Phase 1 - Builder UI + local preview

Scope:

- Implement v2 Builder UI in Settings > 行事曆訂閱。
- Default selected scope snapshot to all currently accessible boards.
- Add global filter controls and per-board override editor.
- Add live preview using local-test / existing in-memory data path.
- Preserve v1 subscriptions in list and edit flow.
- No remote migration, no Edge deploy, no production release.

Acceptance:

- User can open builder, adjust global filter, and immediately see preview result change.
- User can select a board and override its filter or exclude it.
- Preview summary shows workspace count, board count, task count and date types.
- Create action is disabled when preview is loading/error/partial or no date type selected.
- Existing v1 subscriptions remain readable and editable.

Evidence required:

- New static verifier for DEV-045 Builder contract.
- New browser verifier for desktop and mobile builder preview.
- TypeScript noEmit.
- Build/test build.
- DEV-037, DEV-039 and settings regressions.

### Phase 2 - Supabase preview + feed v2

Scope:

- Extend `CalendarSubscriptionFilters` and Supabase service normalizer.
- Extend DB validation migration for v2 shape.
- Extend `calendar-feed` Edge Function to apply global filter and board overrides.
- Add deterministic ICS fixture for v2 cross-board feed.
- Add permission and membership-removal tests where feasible.

Acceptance:

- Preview and generated `.ics` use the same included task identity set for test fixtures.
- Status/tag/keyword/assignee/date filters all affect feed output as expected.
- Board override can include/exclude per board without expanding permissions.
- Token regeneration does not change v2 filters.

Evidence required:

- Static verifier for type/service/migration/Edge Function.
- ICS verifier for v2 snapshot and overrides.
- Supabase static verification.
- DB role matrix if remote DB function/RLS is changed.

### Phase 3 - Production release and live smoke

Scope:

- Apply remote Supabase migration.
- Deploy calendar-feed Edge Function.
- Build and deploy Firebase Hosting if frontend changed.
- Execute production live `.ics` smoke with a temporary subscription.

Acceptance:

- Production builder creates a link.
- Production feed outputs only previewed allowed tasks.
- Membership removal or disabled subscription prevents future feed output.
- Rollback target is recorded.

Evidence required:

- deployment-release-gate.
- Supabase migration / function version evidence.
- Production HTTP/browser smoke.
- Live feed smoke with cleanup.

### Phase 4 - Advanced subscription governance

Scope:

- Optional duplicate subscription, audit detail, export/import subscription settings, or future dynamic all-accessible scope.
- Not part of first implementation.

Acceptance:

- No advanced governance feature may change feed output without visible summary and confirmation.

Evidence required:

- Separate SPEC/QA if activated.

## QA / QC Gate

RD must add package scripts for:

- DEV-045 static Builder contract verifier.
- DEV-045 browser Builder preview verifier.
- DEV-045 v2 ICS/feed verifier.

Regression gates:

- DEV-037 calendar source-scope gates.
- DEV-039 task filter core and workbench filter result gates.
- settings project context gates.
- TypeScript noEmit.
- build or build:test.
- Supabase static verification if migration or Edge Function changes.

## Stop Conditions

- Preview and `.ics` feed cannot be proven to use the same included task set.
- Preview silently ignores failed boards and still allows link generation.
- v2 filter JSON allows future workspaces/boards to auto-enter an existing subscription without explicit user action.
- User can subscribe to boards or assignees outside permission boundary.
- Existing v1 subscriptions break or lose their source/condition summary.
- Date type semantics become ordinary display settings instead of calendar event generation rules.
- Implementation requires production deploy, remote migration, Edge deploy or formal data repair without explicit authorization.

## Deferred Scope Audit

| Deferred / out-of-scope item | Classification | Tracking target | Resume condition |
|---|---|---|---|
| Product implementation | Same Spec Phase | Phase 1 | 使用者授權 DEV-045 RD |
| Supabase validation / Edge Function v2 | Same Spec Phase | Phase 2 | Phase 1 Builder stable and user authorizes DB/Edge work |
| Production release / live smoke | Same Spec Phase | Phase 3 | Phase 2 local/DB gates pass and user authorizes deployment-release-gate |
| Future dynamic all-accessible scope | Same Spec Phase | Phase 4 | 使用者明確接受 future workspace/board 自動加入既有外部連結 |
| Subscription duplicate / copy / audit governance | Same Spec Phase | Phase 4 | 使用者要求管理多條訂閱設定 |
| Google Calendar write API / two-way sync | No Tracking | None | 不是只讀 `.ics` 訂閱目標，若重啟需另開 DEV |
| Realtime/background sync | No Tracking | None | `.ics` 由外部行事曆週期抓取，不建立背景同步服務 |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 | Authorized | Complete | 開發文件、QA plan、dev_task、documentation_map | Product code, DB, deploy | 使用者要求寫成開發文件 | DEV-045 文件完整且可續接 | file diff |
| Phase 1 | Not Authorized | RD Contract Ready | Builder UI, global filter, board overrides, live local preview, v1 compatibility | Remote migration, Edge deploy, production | 使用者授權 RD | Builder preview 可操作且不破壞 v1 | DEV-045 static/browser, DEV-037/039/settings regression |
| Phase 2 | Not Authorized | RD Contract Ready | Supabase validation, Edge Function v2 feed, preview/feed parity | Production deploy, formal data repair | Phase 1 passed + DB/Edge authorization | `.ics` output equals preview allowed task set | ICS verifier, Supabase static, DB role matrix if needed |
| Phase 3 | Not Authorized | RD Contract Ready | Production migration/function/frontend deploy and live smoke | Unscoped feature additions | Phase 2 passed + deployment authorization | Production link outputs only allowed previewed tasks | deployment-release-gate, live feed smoke |
| Phase 4 | Not Authorized | RD Contract Ready | duplicate/copy/audit/future dynamic scope | Two-way calendar sync | User re-entry | Governance features have explicit summary and confirmation | future SPEC/QA |

