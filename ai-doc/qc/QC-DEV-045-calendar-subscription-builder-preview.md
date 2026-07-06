# QC-DEV-045: 行事曆訂閱篩選器建構器與即時預覽

關聯 DEV：DEV-045
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
關聯 QA：`ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md`
狀態：Phase 2 Local Source Implemented / Remote DB-Edge-Production Not Executed
日期：2026-07-07

## QC 結論

DEV-045 Phase 1 local Builder slice 已完成本機實作與 static/build QC。DEV-045 Phase 2 local source 已補上 v2 filters_json validation migration source、client normalizer、Edge Function v2 feed matcher 與 static verifier。

已完成：
- 新增 `CalendarSubscriptionBuilderPreview`，提供全域條件、看板沿用 / 自訂 / 排除、本地任務預覽、輸出摘要與外部連結風險提示。
- `CalendarSubscriptionsView` 已掛載 Builder，並保留 DEV-037 v1 source-scope 相容 UI 與既有訂閱列表。
- `CalendarSubscriptionFilters` 已新增 v2 local contract 欄位，但未變更 DEV-037 v1 `scope_type` contract。
- 新增 `verify:dev-045-calendar-subscription-builder-preview` static gate。
- 新增 `verify:dev-045-calendar-subscription-v2-feed` static gate，覆蓋 v2 DB validation、service normalizer、submit wiring、Edge matcher 與 tag join。

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
| `npm.cmd run verify:dev-039-task-filter-core` | Pass | 61 pass / 0 fail |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript noEmit passed |
| `npm.cmd run verify:settings-project-context` | Pass | 6 checks passed |
| `npx --yes esbuild supabase/functions/calendar-feed/index.ts --bundle --platform=neutral --format=esm --external:https://esm.sh/*` | Pass | Edge Function source bundled to temp output |
| `npm.cmd run build` | Pass | Vite production build passed |
| `npx --yes supabase db lint --local --fail-on error` | Not executed | Local Postgres connection failed |

## 殘留風險

- Phase 2 目前是 local source slice；產生 `.ics` 連結需套用 Supabase migration 與部署 Edge Function 後，才能宣告 production preview/feed 一致。
- Edge Function 尚未做 Deno type check；進入 Supabase/Edge deploy gate 前需補 Deno 或 Supabase functions verification。
- Browser visual QC 尚未補，需後續建立或執行 DEV-045 browser verifier，覆蓋 desktop / mobile / empty preview / override / exclude。
- 既有工作樹中存在 DEV-041 / PWA 相關未提交修改與 `.firebase/hosting.ZGlzdA.cache`，未納入本 QC 範圍。

## 下一步

- DEV-045 Phase 3：套用 Supabase migration、部署 Edge Function、執行 live `.ics` preview/feed identity smoke。
- DEV-045 browser verifier：補 desktop/mobile Builder 截圖與基本互動證據。
