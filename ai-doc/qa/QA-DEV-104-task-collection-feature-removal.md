# QA-DEV-104：完整移除收藏任務功能

- 狀態：Executed / PASS_LOCAL
- 對應規格：`SPEC-104-task-collection-feature-removal.md`
- 日期：2026-09-04

## 驗證矩陣

| ID | 驗證項目 | 方法 | 狀態 |
|---|---|---|---|
| QA-104-01 | 專屬檔案、identifier、permission、action、package command皆不存在 | `rg` static scan | PASS（0 matches） |
| QA-104-02 | TypeScript契約完整 | `npx tsc --noEmit` | PASS |
| QA-104-03 | test bundle可建置 | `npm run build:test` | PASS |
| QA-104-04 | DEV-095追蹤副本回歸 | `npm run verify:dev-095-task-tracking-references-cross-mode` | PASS（12/12） |
| QA-104-05 | DEV-099 persistence convergence回歸 | convergence + property verifiers | PASS（10/10；11 cases + 1000 seeded schedules） |
| QA-104-06 | 側欄、紀錄庫、任務明細與任務選單無收藏入口 | real browser / local-test | PASS |
| QA-104-07 | 一般看板與meeting／work_log入口仍可用 | real browser + DEV-002／016／094 | PASS |

## 執行證據

- `npm run verify:dev-002-records`：PASS，16 file groups；靜態契約已跟隨共用 `TaskChecklistTree` 架構更新。
- `npm run verify:dev-016-records-list-view`：PASS。
- `npm run verify:dev-094-meeting-direct-note`：PASS，13 contract checks。
- Targeted ESLint：0 errors；既有非阻斷 warnings 另行保留，不屬於收藏功能退場缺陷。
- `git diff --check`：PASS。
- 桌面任務右鍵選單：`output/playwright/dev-104/desktop-task-context-menu.png`。
- 390 x 844 工作區側欄：`output/playwright/dev-104/mobile-workspace-sidebar.png`。
- 390 x 844 紀錄庫：`output/playwright/dev-104/mobile-records.png`。
- 控制重跑後 browser console：僅 React DevTools 與 Supabase diagnostics info，0 error。
- Playwright session `dev104-removal` 已關閉；task-owned port 4000 runtime 已停止且確認 port released。

## 執行備註

第一次 browser 驗證時，非持久型 server process 隨 command lifecycle 結束，造成一次動態 import connection error。改以有明確 owner 的 foreground runtime 重跑後，所有 delivery-path 驗證與 console 檢查通過；該錯誤判定為測試 runtime lifecycle，不是產品缺陷。

## Stop Conditions

- 仍有可達收藏入口或collection provider寫入路徑。
- 既有任務／紀錄主流程失效。
- 驗證需要修改共享／遠端資料庫或放寬既有有效斷言。
