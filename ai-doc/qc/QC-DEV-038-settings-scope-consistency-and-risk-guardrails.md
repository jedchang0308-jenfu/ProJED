# QC-DEV-038: 設定中心作用範圍一致性與高風險防呆

關聯 DEV：DEV-038
關聯 SPEC：`ai-doc/specs/SPEC-038-settings-scope-consistency-and-risk-guardrails.md`
關聯 QA：`ai-doc/qa/QA-DEV-038-settings-scope-consistency-and-risk-guardrails.md`
狀態：Local Automated QC Passed / DB unchanged / Production Not Deployed
QC 日期：2026-07-06

## Scope Verified

本輪 QC 驗證 DEV-038 已完成下列交付邊界：

- 設定中心頁首改為中性 `設定中心`，不再以全頁 `目前看板` framing 統包所有設定。
- `備份與資料` 拆分 `匯出全域快照` 與 `匯入至目前看板`。
- 匯入選檔後需先確認目標 Workspace / Board、檔名與資料影響，取消不會呼叫 `importData`。
- `目前看板回收桶` 顯示目標 Workspace / Board，清空確認包含 board title 與 archived item count。
- `看板權限`、`行事曆訂閱`、`快速開啟` 顯示各自作用範圍。
- 390px mobile 設定頁切換未出現水平 overflow。

## Automated Evidence

| Command | Result | Notes |
|---|---|---|
| `npm.cmd run verify:dev-038-settings-scope-consistency` | Pass | 19/19 checks |
| `npm.cmd run verify:dev-038-settings-scope-consistency-browser` | Pass | Desktop + 390px mobile browser flow |
| `npm.cmd run verify:settings-project-context` | Pass | 6/6 checks |
| `npm.cmd run verify:settings-project-context-browser` | Pass | Existing Settings return/sidebar context browser smoke |
| `npm.cmd run verify:dev-036-trello-like-workspace-governance` | Pass | 26/26 checks |
| `npm.cmd run verify:dev-035-workspace-delete-persistence-fix` | Pass | 22/22 checks |
| `npm.cmd run verify:dev-026-trello-like-board-share-ui` | Pass | 15/15 checks |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript clean |
| `npm.cmd run build:test` | Pass | Vite test build completed |

Browser screenshots:

- `output/playwright/dev-038-settings-scope-desktop.png`
- `output/playwright/dev-038-settings-scope-mobile.png`

## Deferred / Not Executed

- `verify:dev-037-calendar-subscription-source-scope` was not executed. DEV-038 did not modify `CalendarSubscriptionsView` source-scope data contract, DB validation, Edge Function, `scope_type`, or `project_ids`; those remain DEV-037 scope.
- Production deployment was not executed.
- Supabase schema, RLS, migration, and production data were not changed.

## QC Verdict

DEV-038 passes local automated QC for Settings IA scope clarity and high-risk guardrails. Remaining work is DEV-037 source-scope implementation and any future production release gate if the user authorizes deployment.
