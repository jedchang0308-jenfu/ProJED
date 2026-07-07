# QC-DEV-045: 行事曆訂閱篩選器建構器與即時預覽

關聯 DEV：DEV-045
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
關聯 QA：`ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md`
狀態：Phase 3 Remote Gate Authorized / Local DB Smoke Passed / Remote DB-Edge-Live Gate Pending
日期：2026-07-07

## QC 結論

DEV-045 Phase 1 local Builder slice 已完成本機實作與 static/build QC。DEV-045 Phase 2 local source 已補上 v2 filters_json validation migration source、client normalizer、Edge Function v2 feed matcher 與 static verifier。

2026-07-07 補齊 Phase 1 browser QC：新增 local-test-only Builder 預覽路徑與 `verify:dev-045-calendar-subscription-builder-preview-browser`，以同一個 `CalendarSubscriptionBuilderPreview` 元件覆蓋 desktop / mobile / empty preview / board exclude / board custom override / horizontal overflow。這不建立 `.ics` 訂閱連結，也不套用 remote DB / Edge 變更。

2026-07-07 Phase 3 read-only preflight 已執行。使用者已授權剩餘任務開發，但正式 remote migration / Edge deploy 仍未執行。`ProJED_TEST` Supabase project 目前 inactive，不能作為 staging；production 仍缺 DEV-037 / DEV-045 migrations，且 deployed `calendar-feed` version 3 仍未包含 v2 matcher。

2026-07-07 續接 read-only discovery 補強：Supabase MCP `list_projects` 顯示 production `ProJED` / `knodlkxqpcqyrtgwpdst` 為 `ACTIVE_HEALTHY`、Postgres `17.6.1.121`，`ProJED_TEST` / `fhisnnufoeulxqrchldf` 為 `INACTIVE`。production migration history 尚未包含本地 DEV-037 `20260706091804_calendar_subscription_source_scope.sql` 與 DEV-045 `20260706162052_calendar_subscription_v2_filters.sql`；deployed `calendar-feed` 仍是 version 3，source 仍使用 v1 `getAllowedTenantIds` / workspace-only feed flow，未包含 v2 `matchesV2TaskFilters`、tag join 或 `project_ids` filter。production aggregate count 為 total subscriptions 2、active 2、v2 0。Supabase branch listing MCP call 回 `Project reference is missing when validating permissions`；建立 branch 另需 Supabase cost confirmation，未建立 branch。

2026-07-07 補上 `verify:dev-045-calendar-subscription-remote-readiness`，把 Phase 3 進入遠端 gate 前的本機 artifacts 檢查自動化。此 verifier 只確認 DEV-037 / DEV-045 migration 順序、DEV-045 validation grants、client v2 normalizer、local Edge v2 matcher、package script 防呆、文件 stop condition 與 read-only discovery 邊界；不連線 Supabase、不套 migration、不部署 Edge，也不代表 remote gate 完成。

2026-07-07 補上並通過 `verify:dev-045-calendar-subscription-local-db-smoke`。預設 self-check 不連 DB；actual mode `node scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs --run-local-db` 連本機 Docker Supabase DB `supabase_db_ProJED`，以 transaction-scoped SQL 套 DEV-037 / DEV-045 validators、建立最小 workspace / board / member fixture、驗證 10 個 v2 allow/deny/grant 行為並 `ROLLBACK`。此 gate 是 local DB smoke，不代表 remote migration apply、Edge deploy 或 live `.ics` preview/feed parity 完成。

已完成：
- 新增 `CalendarSubscriptionBuilderPreview`，提供全域條件、看板沿用 / 自訂 / 排除、本地任務預覽、輸出摘要與外部連結風險提示。
- `CalendarSubscriptionsView` 已掛載 Builder，並保留 DEV-037 v1 source-scope 相容 UI 與既有訂閱列表。
- `CalendarSubscriptionFilters` 已新增 v2 local contract 欄位，但未變更 DEV-037 v1 `scope_type` contract。
- 新增 `verify:dev-045-calendar-subscription-builder-preview` static gate。
- 新增 `verify:dev-045-calendar-subscription-builder-preview-browser` browser gate，產生 desktop、empty、exclude、mobile 截圖。
- 新增 `verify:dev-045-calendar-subscription-v2-feed` static gate，覆蓋 v2 DB validation、service normalizer、submit wiring、Edge matcher 與 tag join。
- 新增 `verify:dev-045-calendar-subscription-remote-readiness` static gate，覆蓋 remote gate 前置 artifacts 與 stop condition。
- 新增 `verify:dev-045-calendar-subscription-local-db-smoke` guarded local DB gate；actual mode 以 transaction + rollback 驗證 DEV-045 v2 validation functions、snapshot project scope、board override negative case 與 authenticated/anon execute grants。
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
- Supabase local DB lint；本輪以 transaction-scoped local DB smoke 取代 lint，尚未執行 `supabase db lint --local`。

## 驗證命令

| Gate | 結果 | 證據 |
|---|---|---|
| `npm.cmd run verify:dev-045-calendar-subscription-builder-preview` | Pass | 16 pass / 0 fail |
| `npm.cmd run verify:dev-045-calendar-subscription-builder-preview-browser` | Pass | `dev-045-calendar-builder-desktop.png`、`dev-045-calendar-builder-empty.png`、`dev-045-calendar-builder-exclude.png`、`dev-045-calendar-builder-mobile.png` |
| `npm.cmd run verify:dev-045-calendar-subscription-v2-feed` | Pass | 18 pass / 0 fail |
| `npm.cmd run verify:dev-045-calendar-subscription-remote-readiness` | Pass | 21 pass / 0 fail；local-only preflight, no Supabase apply/deploy |
| `npm.cmd run verify:dev-045-calendar-subscription-local-db-smoke` | Pass | Self-check 9 pass / 0 fail；actual DB smoke skipped by default |
| `node scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs --run-local-db` | Pass | Local Docker DB `supabase_db_ProJED`；12 pass / 0 fail；10 SQL behavior checks passed；transaction rolled back |
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
- Phase 3 目前是 authorized but still gated；local DB smoke 已通過，但缺 remote Edge deploy / live `.ics` preview-feed parity / rollback evidence 時，不得宣告 remote DB / Edge / production release safe。
- Production currently remains on the old calendar subscription feed contract；remote apply/deploy is not a no-op and must keep rollback evidence for `calendar-feed` version 3 and DB validation function state.
- Edge Function 尚未做 Deno type check；進入 Supabase/Edge deploy gate 前需補 Deno 或 Supabase functions verification。
- Browser QC 已補 desktop / mobile / empty preview / override / exclude；尚未覆蓋 Supabase live partial/error state，需 remote/staging 或 mocked board-load failure fixture。
- 既有工作樹中存在 `.firebase/hosting.ZGlzdA.cache` 與 `.codex-remote-attachments/`，未納入本 QC 範圍。

## 下一步

- DEV-045 Phase 3：local DB smoke 已補；下一步需進 deployment-release-gate / Supabase gate，執行 remote migration apply、`calendar-feed` Edge deploy、live `.ics` preview/feed identity smoke 與 rollback evidence。
- DEV-045 live browser verifier：在 remote/staging path 可用後補 Supabase live preview/feed identity 與 partial/error state。
