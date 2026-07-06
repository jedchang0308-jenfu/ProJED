# QC-DEV-045: 行事曆訂閱篩選器建構器與即時預覽

關聯 DEV：DEV-045
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
關聯 QA：`ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md`
狀態：Phase 1 Local RD Implemented / Static QC Passed / DB-Edge-Production Not Executed
日期：2026-07-07

## QC 結論

DEV-045 Phase 1 local Builder slice 已完成本機實作與 static/build QC。

已完成：
- 新增 `CalendarSubscriptionBuilderPreview`，提供全域條件、看板沿用 / 自訂 / 排除、本地任務預覽、輸出摘要與外部連結風險提示。
- `CalendarSubscriptionsView` 已掛載 Builder，並保留 DEV-037 v1 source-scope 相容 UI 與既有訂閱列表。
- `CalendarSubscriptionFilters` 已新增 v2 local contract 欄位，但未變更 DEV-037 v1 `scope_type` contract。
- 新增 `verify:dev-045-calendar-subscription-builder-preview` static gate。

未執行：
- Supabase migration / DB validation function。
- `calendar-feed` Edge Function v2 feed。
- preview/feed identity parity live verification。
- Firebase Hosting production deploy。
- 手機/桌機 Playwright 截圖式 browser QC。

## 驗證命令

| Gate | 結果 | 證據 |
|---|---|---|
| `npm.cmd run verify:dev-045-calendar-subscription-builder-preview` | Pass | 16 pass / 0 fail |
| `npm.cmd run verify:dev-037-calendar-subscription-source-scope` | Pass | 20 pass / 0 fail |
| `npm.cmd run verify:dev-039-task-filter-core` | Pass | 61 pass / 0 fail |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript noEmit passed |
| `npm.cmd run verify:settings-project-context` | Pass | 6 checks passed |
| `npm.cmd run build` | Pass | Vite production build passed |

## 殘留風險

- Phase 1 Builder 目前是 local preview slice；產生 `.ics` 連結仍需 Phase 2 接 Supabase validation / Edge Function v2 feed，否則 preview 與實際 feed 尚未宣告一致。
- Browser visual QC 尚未補，需後續建立或執行 DEV-045 browser verifier，覆蓋 desktop / mobile / empty preview / override / exclude。
- 既有工作樹中存在 DEV-041 / PWA 相關未提交修改與 `.firebase/hosting.ZGlzdA.cache`，未納入本 QC 範圍。

## 下一步

- DEV-045 Phase 2：實作 Supabase validation / Edge Function v2 feed / preview-feed parity verifier。
- DEV-045 browser verifier：補 desktop/mobile Builder 截圖與基本互動證據。
