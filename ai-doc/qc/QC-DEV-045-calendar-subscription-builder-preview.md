# QC-DEV-045: 行事曆訂閱篩選器建構器與即時預覽

關聯 DEV：DEV-045
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
關聯 QA：`ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md`
狀態：Phase 3 Remote Gate Authorized / Preflight Blocked by Missing Level 3
日期：2026-07-07

## QC 結論

DEV-045 Phase 1 local Builder slice 已完成本機實作與 static/build QC。DEV-045 Phase 2 local source 已補上 v2 filters_json validation migration source、client normalizer、Edge Function v2 feed matcher 與 static verifier。

2026-07-07 補齊 Phase 1 browser QC：新增 local-test-only Builder 預覽路徑與 `verify:dev-045-calendar-subscription-builder-preview-browser`，以同一個 `CalendarSubscriptionBuilderPreview` 元件覆蓋 desktop / mobile / empty preview / board exclude / board custom override / horizontal overflow。這不建立 `.ics` 訂閱連結，也不套用 remote DB / Edge 變更。

2026-07-07 Phase 3 read-only preflight 已執行。使用者已授權剩餘任務開發，但正式 remote migration / Edge deploy 仍未執行，原因是 deployment-release-gate 缺少 Level 3 production-like pre-deploy smoke 環境。`ProJED_TEST` Supabase project 目前 inactive，不能作為 staging；本地 Supabase Postgres 未啟動，無法執行 local DB lint；本機未安裝 Supabase CLI，CLI path 無法列 remote migration 或啟動 local Supabase。

2026-07-07 續接 read-only discovery 補強：Supabase MCP `list_projects` 顯示 production `ProJED` / `knodlkxqpcqyrtgwpdst` 為 `ACTIVE_HEALTHY`、Postgres `17.6.1.121`，`ProJED_TEST` / `fhisnnufoeulxqrchldf` 為 `INACTIVE`。production migration history 尚未包含本地 DEV-037 `20260706091804_calendar_subscription_source_scope.sql` 與 DEV-045 `20260706162052_calendar_subscription_v2_filters.sql`；deployed `calendar-feed` 仍是 version 3，source 仍使用 v1 `getAllowedTenantIds` / workspace-only feed flow，未包含 v2 `matchesV2TaskFilters`、tag join 或 `project_ids` filter。production aggregate count 為 total subscriptions 2、active 2、v2 0。Supabase branch listing MCP call 回 `Project reference is missing when validating permissions`；建立 branch 另需 Supabase cost confirmation，未建立 branch。

已完成：
- 新增 `CalendarSubscriptionBuilderPreview`，提供全域條件、看板沿用 / 自訂 / 排除、本地任務預覽、輸出摘要與外部連結風險提示。
- `CalendarSubscriptionsView` 已掛載 Builder，並保留 DEV-037 v1 source-scope 相容 UI 與既有訂閱列表。
- `CalendarSubscriptionFilters` 已新增 v2 local contract 欄位，但未變更 DEV-037 v1 `scope_type` contract。
- 新增 `verify:dev-045-calendar-subscription-builder-preview` static gate。
- 新增 `verify:dev-045-calendar-subscription-builder-preview-browser` browser gate，產生 desktop、empty、exclude、mobile 截圖。
- 新增 `verify:dev-045-calendar-subscription-v2-feed` static gate，覆蓋 v2 DB validation、service normalizer、submit wiring、Edge matcher 與 tag join。
- Phase 3 read-only preflight：production project `knodlkxqpcqyrtgwpdst` healthy / Postgres 17，`calendar-feed` current version 3 active，`verify_jwt=false`，rollback source 已可由 Supabase MCP 讀取。
- Phase 3 DB preflight：正式 DB 目前仍是 v1 validation function；`calendar_subscription_task_filter_allowed(jsonb)` 不存在，`calendar_subscription_filter_allowed(jsonb)` 不含 `project_ids` / `v2_scope_type`；正式訂閱 2 筆、active 2 筆、v2 0 筆。
- Phase 3 migration history preflight：production 尚未列出 DEV-037 `20260706091804_calendar_subscription_source_scope` 或 DEV-045 `20260706162052_calendar_subscription_v2_filters` migration。
- Phase 3 Edge source preflight：production `calendar-feed` version 3 仍是 workspace-only source-scope，尚未部署本地 v2 preview/feed parity matcher。
- Migration hardening：DEV-045 migration 已明確 revoke `PUBLIC` / `anon` 對 validation functions 的 execute，再 grant `authenticated`。

未執行：
- Supabase remote migration apply。
- `calendar-feed` Edge Function deploy。
- preview/feed identity parity live verification。
- Firebase Hosting production deploy。
- Supabase live / production browser screenshot QC。
- Partial/error board-load fixture browser QC。
- Deno Edge Function type check；本機未安裝 `deno`，目前以 static verifier 覆蓋 source contract。
- Supabase local DB lint；`npx --yes supabase db lint --local --fail-on error` 因本地 Postgres 未啟動而無法連線。

## 驗證命令

| Gate | 結果 | 證據 |
|---|---|---|
| `npm.cmd run verify:dev-045-calendar-subscription-builder-preview` | Pass | 16 pass / 0 fail |
| `npm.cmd run verify:dev-045-calendar-subscription-builder-preview-browser` | Pass | `dev-045-calendar-builder-desktop.png`、`dev-045-calendar-builder-empty.png`、`dev-045-calendar-builder-exclude.png`、`dev-045-calendar-builder-mobile.png` |
| `npm.cmd run verify:dev-045-calendar-subscription-v2-feed` | Pass | 18 pass / 0 fail |
| `npm.cmd run verify:dev-037-calendar-subscription-source-scope` | Pass | 20 pass / 0 fail |
| `npm.cmd run verify:dev-037-calendar-subscription-source-scope-browser` | Pass | DEV-037 local-test fallback/browser regression passed |
| Supabase MCP read-only preflight | Pass / blocked for deploy | Production project healthy；current `calendar-feed` version 3 active；DB v2 functions not applied；staging unavailable |
| Supabase MCP migration history | Pass / confirms pending | Production migration list does not include DEV-037 `20260706091804` or DEV-045 `20260706162052` |
| Supabase MCP deployed Edge source read | Pass / confirms pending | Deployed `calendar-feed` version 3 lacks v2 matcher and project-id scoped feed flow |
| Supabase MCP subscription aggregate | Pass / read-only | total 2 / active 2 / v2 0, no row contents read |
| Supabase branch discovery | Blocked | `list_branches` returned project reference validation error；new branch creation would require cost confirmation and was not executed |
| Supabase security advisors | Warn / existing unrelated | Existing SECURITY DEFINER warnings unrelated to DEV-045 migration；no DEV-045 DDL applied |
| `npm.cmd run verify:dev-039-task-filter-core` | Pass | 61 pass / 0 fail |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript noEmit passed |
| `npm.cmd run verify:settings-project-context` | Pass | 6 checks passed |
| `npx --yes esbuild supabase/functions/calendar-feed/index.ts --bundle --platform=neutral --format=esm --external:https://esm.sh/*` | Pass | Edge Function source bundled to temp output |
| `npm.cmd run build` | Pass | Vite production build passed |
| `npx --yes supabase db lint --local --fail-on error` | Not executed | Local Postgres connection failed |

## 殘留風險

- Phase 2 目前是 local source slice；產生 `.ics` 連結需套用 Supabase migration 與部署 Edge Function 後，才能宣告 production preview/feed 一致。
- Phase 3 目前是 authorized but gated；缺 production-like Level 3 pre-deploy smoke 時，不得宣告 remote DB / Edge / production release safe。
- Production currently remains on the old calendar subscription feed contract；remote apply/deploy is not a no-op and must keep rollback evidence for `calendar-feed` version 3 and DB validation function state.
- Edge Function 尚未做 Deno type check；進入 Supabase/Edge deploy gate 前需補 Deno 或 Supabase functions verification。
- Browser QC 已補 desktop / mobile / empty preview / override / exclude；尚未覆蓋 Supabase live partial/error state，需 remote/staging 或 mocked board-load failure fixture。
- 既有工作樹中存在 DEV-041 / PWA 相關未提交修改與 `.firebase/hosting.ZGlzdA.cache`，未納入本 QC 範圍。

## 下一步

- DEV-045 Phase 3：先提供 staging / active Supabase branch / local Supabase DB 或明確接受無 Level 3 release risk，才能套用 Supabase migration、部署 Edge Function、執行 live `.ics` preview/feed identity smoke。
- DEV-045 live browser verifier：在 Level 3 path 可用後補 Supabase live preview/feed identity 與 partial/error state。
