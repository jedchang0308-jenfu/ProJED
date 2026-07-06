# QC-DEV-045: 行事曆訂閱篩選器建構器與即時預覽

關聯 DEV：DEV-045
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
關聯 QA：`ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md`
狀態：Phase 3 Remote Gate Authorized / Preflight Blocked by Missing Level 3
日期：2026-07-07

## QC 結論

DEV-045 Phase 1 local Builder slice 已完成本機實作與 static/build QC。DEV-045 Phase 2 local source 已補上 v2 filters_json validation migration source、client normalizer、Edge Function v2 feed matcher 與 static verifier。

2026-07-07 Phase 3 read-only preflight 已執行。使用者已授權剩餘任務開發，但正式 remote migration / Edge deploy 仍未執行，原因是 deployment-release-gate 缺少 Level 3 production-like pre-deploy smoke 環境。`ProJED_TEST` Supabase project 目前 inactive，不能作為 staging；本地 Supabase Postgres 未啟動，無法執行 local DB lint；Supabase CLI remote token 未提供，CLI path 無法列 remote migration。

已完成：
- 新增 `CalendarSubscriptionBuilderPreview`，提供全域條件、看板沿用 / 自訂 / 排除、本地任務預覽、輸出摘要與外部連結風險提示。
- `CalendarSubscriptionsView` 已掛載 Builder，並保留 DEV-037 v1 source-scope 相容 UI 與既有訂閱列表。
- `CalendarSubscriptionFilters` 已新增 v2 local contract 欄位，但未變更 DEV-037 v1 `scope_type` contract。
- 新增 `verify:dev-045-calendar-subscription-builder-preview` static gate。
- 新增 `verify:dev-045-calendar-subscription-v2-feed` static gate，覆蓋 v2 DB validation、service normalizer、submit wiring、Edge matcher 與 tag join。
- Phase 3 read-only preflight：production project `knodlkxqpcqyrtgwpdst` healthy / Postgres 17，`calendar-feed` current version 3 active，`verify_jwt=false`，rollback source 已可由 Supabase MCP 讀取。
- Phase 3 DB preflight：正式 DB 目前仍是 v1 validation function；`calendar_subscription_task_filter_allowed(jsonb)` 不存在，`calendar_subscription_filter_allowed(jsonb)` 不含 `project_ids` / `v2_scope_type`；正式訂閱 2 筆、active 2 筆、v2 0 筆。
- Migration hardening：DEV-045 migration 已明確 revoke `PUBLIC` / `anon` 對 validation functions 的 execute，再 grant `authenticated`。

未執行：
- Supabase remote migration apply。
- `calendar-feed` Edge Function deploy。
- preview/feed identity parity live verification。
- Firebase Hosting production deploy。
- 手機/桌機 Playwright 截圖式 browser QC。
- Deno Edge Function type check；本機未安裝 `deno`，目前以 static verifier 覆蓋 source contract。
- Supabase local DB lint；`npx --yes supabase db lint --local --fail-on error` 因本地 Postgres 未啟動而無法連線。

## 驗證命令

| Gate | 結果 | 證據 |
|---|---|---|
| `npm.cmd run verify:dev-045-calendar-subscription-builder-preview` | Pass | 16 pass / 0 fail |
| `npm.cmd run verify:dev-045-calendar-subscription-v2-feed` | Pass | 18 pass / 0 fail |
| `npm.cmd run verify:dev-037-calendar-subscription-source-scope` | Pass | 20 pass / 0 fail |
| Supabase MCP read-only preflight | Pass / blocked for deploy | Production project healthy；current `calendar-feed` version 3 active；DB v2 functions not applied；staging unavailable |
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
- Edge Function 尚未做 Deno type check；進入 Supabase/Edge deploy gate 前需補 Deno 或 Supabase functions verification。
- Browser visual QC 尚未補，需後續建立或執行 DEV-045 browser verifier，覆蓋 desktop / mobile / empty preview / override / exclude。
- 既有工作樹中存在 DEV-041 / PWA 相關未提交修改與 `.firebase/hosting.ZGlzdA.cache`，未納入本 QC 範圍。

## 下一步

- DEV-045 Phase 3：先提供 staging / active Supabase branch / local Supabase DB 或明確接受無 Level 3 release risk，才能套用 Supabase migration、部署 Edge Function、執行 live `.ics` preview/feed identity smoke。
- DEV-045 browser verifier：補 desktop/mobile Builder 截圖與基本互動證據。
