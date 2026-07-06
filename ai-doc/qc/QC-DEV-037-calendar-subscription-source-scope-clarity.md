# QC-DEV-037: 行事曆訂閱來源範圍清晰化

關聯 DEV：DEV-037
關聯 SPEC：`ai-doc/specs/SPEC-037-calendar-subscription-source-scope-clarity.md`
關聯 QA：`ai-doc/qa/QA-DEV-037-calendar-subscription-source-scope-clarity.md`
狀態：Local Automated QC Passed / Supabase DB Deploy Pending / Production Not Deployed
日期：2026-07-06

## QC 結論

DEV-037 已完成本機 RD 與自動化 QC。前端 filters、Supabase service、CalendarSubscriptionsView、Edge Function 原始碼與 migration 檔均已支援 `scope_type/project_ids`，且 Edge Function 查詢會同時套用 tenant 與 project 範圍，避免 Board scope 外溢。

本輪未執行遠端 Supabase migration apply、Edge Function deploy 或 production smoke；這些仍需 deployment-release-gate / Supabase gate 授權。

## 驗證結果

| Gate | Command | Result | Notes |
|---|---|---|---|
| DEV-037 static | `npm.cmd run verify:dev-037-calendar-subscription-source-scope` | Passed | 20/20 checks；涵蓋 type、service、UI、Edge Function、migration、文件索引。 |
| DEV-037 browser | `npm.cmd run verify:dev-037-calendar-subscription-source-scope-browser` | Passed | Local-test mode；確認 settings calendar scope wrapper、Supabase fallback、desktop/mobile no horizontal overflow。 |
| ICS | `npm.cmd run verify:calendar-feed-ics` | Passed | 補入 board-scope fixture，確認限縮 items 後不輸出其他 board 描述。 |
| Settings regression | `npm.cmd run verify:settings-project-context` | Passed | 6 checks。 |
| Settings browser regression | `npm.cmd run verify:settings-project-context-browser` | Passed | Exit 0。 |
| DEV-036 regression | `npm.cmd run verify:dev-036-trello-like-workspace-governance` | Passed | 26/26 checks。 |
| DEV-026 regression | `npm.cmd run verify:dev-026-trello-like-board-share-ui` | Passed | 15/15 checks。 |
| DEV-038 regression | `npm.cmd run verify:dev-038-settings-scope-consistency` | Passed | 19/19 checks。 |
| TypeScript | `npm.cmd exec tsc -- --noEmit` | Passed | No type errors. |
| Build | `npm.cmd run build:test` | Passed | Vite test build completed. |

## Evidence

- Desktop screenshot: `output/playwright/dev-037-calendar-source-scope-desktop.png`
- Mobile screenshot: `output/playwright/dev-037-calendar-source-scope-mobile.png`
- Migration file: `supabase/migrations/20260706091804_calendar_subscription_source_scope.sql`

## Limitations

- Browser gate ran against `VITE_DATA_BACKEND=local-test`, so the full Supabase subscription form was not connected to a live Supabase session in this QC run.
- DB validation was reviewed and statically verified in migration SQL, but not applied to remote Supabase.
- Edge Function source was updated and statically verified, but not deployed.
- Real `.ics` board-scope feed smoke with live Supabase data remains pending until migration + function deployment is authorized.

## Residual Risk

- If a production database has subscriptions with malformed `filters_json`, the new validation function will reject future updates but existing rows still need live feed behavior checked after deploy.
- True membership-removal behavior must be confirmed with remote role data because local-test cannot reproduce Supabase RLS/service-role behavior.
