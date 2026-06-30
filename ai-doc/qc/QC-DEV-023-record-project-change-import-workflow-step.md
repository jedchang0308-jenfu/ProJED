# QC-DEV-023: 專案變化匯入整併為紀錄流程第一步

關聯 DEV：DEV-023
父交付點：DEV-020
關聯 SPEC：`ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md`
關聯 QA：`ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md`
狀態：Browser QC Passed / DB unchanged
執行日期：2026-06-29

## QC 結論

DEV-023 已通過本機自動化與 browser QC。會議紀錄與個人工作紀錄都已把 `匯入` 整併為 workflow 第一個 optional step，`data-project-change-import-panel` 預設收合，點擊 `匯入` 後在 workflow card 內展開。

本輪不新增資料庫 schema、migration、record content persistence 格式或 AI prompt policy。

## 驗證結果

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-023 static | Pass | `npm.cmd run verify:dev-023-record-project-change-import-workflow-step`，18 checks |
| DEV-020 workflow static | Pass | `npm.cmd run verify:dev-020-record-workflow-redesign` |
| DEV-020 browser | Pass | `npm.cmd run verify:dev-020-project-change-import-browser` |
| DEV-021 preserve guard | Pass | `npm.cmd run verify:dev-021-project-change-ai-preserve` |
| DEV-022 single-record guard | Pass | `npm.cmd run verify:dev-022-project-change-single-record` |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Build | Pass | `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build` |

## Browser 證據

- `output/playwright/dev-020-record-workflow-1440.png`
- `output/playwright/dev-020-record-workflow-1024.png`

Browser verifier 覆蓋：

- 個人工作紀錄顯示 `data-record-workflow-kind="work-log"`。
- 個人工作紀錄 workflow 有 4 個 step，包含 `data-work-log-workflow-step="project_import"`。
- 會議紀錄顯示 `data-record-workflow-kind="meeting"`。
- 會議紀錄 workflow 有 5 個 step，包含 `data-meeting-workflow-step="project_import"`。
- `data-project-change-import-panel` 預設不存在，點擊 `匯入` 後出現在 `data-record-composer-workflow` 內。
- Project change import 面板包含起訖日期、整個看板、整個工作區、整理專案變化與插入流程。
- 1024px 與 1440px viewport 無水平 overflow。

## 驗證基礎設施修正

DEV-020 browser verifier 原本假設 `選取任務` 按鈕位於 `data-record-composer-linked-tasks` 內。現行 UI 是先顯示 `關聯任務` toggle，展開後才在 `data-record-linked-tasks-list` 顯示 `選取任務`。本輪已修正 verifier，改為驗證 toggle 與展開後按鈕，未改產品行為。

另外，`verify:dev-020-project-change-import-browser` 已改用 `scripts/run-playwright-code.ps1` 的唯一 session wrapper，避免舊固定 Playwright session 偶發 daemon 啟動失敗。

## 殘餘風險

- QA 文件要求的 ROT-001 至 ROT-007 人工真實點擊測試尚未由人工 QC 完整簽核；本輪完成自動化 browser QC。
- 若未來改 AI整理或 record content merge，需重跑 DEV-021 / DEV-022 / DEV-023 gates。
