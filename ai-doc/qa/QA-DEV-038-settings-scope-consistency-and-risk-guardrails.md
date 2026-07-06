# QA-DEV-038: 設定中心作用範圍一致性與高風險防呆驗證計畫

關聯 DEV：DEV-038
關聯 SPEC：`ai-doc/specs/SPEC-038-settings-scope-consistency-and-risk-guardrails.md`
狀態：QA Passed / Local Automated QC Passed / DB unchanged / Production Not Deployed
建立日期：2026-06-29
QC 日期：2026-07-06

## QC Evidence - 2026-07-06

本輪已完成 DEV-038 本機自動化驗證。結果：

| Gate | 結果 | 證據 |
|---|---|---|
| `npm.cmd run verify:dev-038-settings-scope-consistency` | Pass | 19/19 checks |
| `npm.cmd run verify:dev-038-settings-scope-consistency-browser` | Pass | 桌機與 390px mobile flow；截圖 `output/playwright/dev-038-settings-scope-desktop.png`、`output/playwright/dev-038-settings-scope-mobile.png` |
| `npm.cmd run verify:settings-project-context` | Pass | 6/6 checks |
| `npm.cmd run verify:settings-project-context-browser` | Pass | Settings return / sidebar context browser smoke |
| `npm.cmd run verify:dev-036-trello-like-workspace-governance` | Pass | 26/26 checks |
| `npm.cmd run verify:dev-035-workspace-delete-persistence-fix` | Pass | 22/22 checks |
| `npm.cmd run verify:dev-026-trello-like-board-share-ui` | Pass | 15/15 checks |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript clean |
| `npm.cmd run build:test` | Pass | Vite test build completed |

瀏覽器驗證覆蓋：

- 設定中心 header 不再顯示舊的 `系統設定與管理` 或全頁 `目前看板：...`。
- 備份頁能同時辨識 `匯出全域快照` 與 `匯入至目前看板`。
- 選擇 `scripts/fixtures/dev038-backup.json` 後會先出現確認摘要，包含目標 Workspace / Board、檔名與可能覆寫/新增任務；按 `取消匯入` 不會呼叫 `importData` alert path。
- 回收桶頁顯示 `目前看板回收桶` 與目標 Board，清空確認包含 board title 與 `1 筆已刪除任務`。
- 看板權限顯示 `設定範圍：目前看板`。
- 行事曆訂閱在 Settings 外層顯示 `外部連結` 範圍；未實作 DEV-037 Edge Function / DB source-scope contract。
- 快速開啟顯示 `設定範圍：此裝置 / 目前帳號`，沒有 board target wording。
- 390px mobile 逐頁切換未偵測到水平 overflow。

Deferred dependency：`verify:dev-037-calendar-subscription-source-scope` 尚未執行，因本輪未修改 `CalendarSubscriptionsView` 資料契約、未新增 `scope_type/project_ids`、未變更 Edge Function / DB validation；該 gate 保留給 DEV-037。

## 驗證目標

確認設定中心所有頁籤都清楚標示作用範圍，且高風險的匯入、永久刪除與外部連結操作都有可見防呆。此 DEV 的重點是資訊架構與風險語意，不是重新設計資料模型。

## Zero-Tolerance Failures

- 設定中心頁首仍暗示所有頁籤都作用於目前看板。
- 匯出與匯入仍共用模糊的 `備份` 語意，使用者無法分辨全域快照與目前看板匯入。
- 選擇匯入檔案後未確認目標看板就直接執行匯入。
- 回收桶清空確認未顯示目前看板與永久刪除數量。
- 快速開啟頁仍顯示目前看板，讓使用者誤解它是看板設定。
- Mobile viewport 出現主要 CTA 裁切、來源範圍裁切或水平 overflow。

## Static Verification

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-038-S01 | 文件 | SPEC / QA / dev_task / documentation_map / backlog 均包含 DEV-038 |
| QA-038-S02 | Settings header | `SettingsView` 頁首不再固定顯示 `目前看板：...` 作為全頁語境 |
| QA-038-S03 | Scope taxonomy | 設定 section 至少涵蓋 `目前看板`、`全域快照`、`外部連結`、`此裝置 / 目前帳號` 的可見標示 |
| QA-038-S04 | Backup copy | 匯出 CTA 明確是 `匯出全域快照`，匯入 CTA 明確是 `匯入至目前看板` |
| QA-038-S05 | Import confirmation | 匯入前存在確認流程，且確認摘要包含 active Workspace / Board |
| QA-038-S06 | Trash wording | `RecycleBinView` 標題或摘要明確為目前看板回收桶 |
| QA-038-S07 | Empty trash confirm | 清空回收桶確認包含 board title 與 archived item count |
| QA-038-S08 | Permission wording | 權限頁籤與 embedded panel 使用 `看板權限`，並顯示目前看板目標 |
| QA-038-S09 | App install scope | `AppInstallAssistant` settings mode 顯示此裝置 / 目前帳號範圍，不依賴 active board |

建議新增 static gate：

```powershell
npm.cmd run verify:dev-038-settings-scope-consistency
```

## Browser Verification

| Case | 操作 | 預期 |
|---|---|---|
| QA-038-B01 | 進入設定中心首頁 | 頁首為 `設定中心`，不再把全部頁籤統稱系統設定或固定顯示目前看板 |
| QA-038-B02 | 開啟備份與資料 | 首屏能分辨 `匯出全域快照` 與 `匯入至目前看板` |
| QA-038-B03 | 沒有 active board 時開啟備份與資料 | 匯入 disabled 並顯示原因；匯出仍可用 |
| QA-038-B04 | 有 active board 且有權限時選擇匯入檔案 | 出現確認摘要，包含目標 Workspace / Board 與檔名；取消不執行匯入 |
| QA-038-B05 | 從備份頁開啟回收桶 | 進入 `目前看板回收桶`，顯示目標看板 |
| QA-038-B06 | 清空回收桶 | 確認文案包含目標 Board title 與永久刪除任務數量 |
| QA-038-B07 | 開啟看板權限 | 顯示 `設定範圍：目前看板` 與目標 Workspace / Board |
| QA-038-B08 | 開啟快速開啟 | 顯示 `設定範圍：此裝置 / 目前帳號`，沒有看板目標文案 |
| QA-038-B09 | 390px mobile viewport 逐頁切換 | section header、scope summary、CTA 不重疊、不水平 overflow |

建議新增 browser gate：

```powershell
npm.cmd run verify:dev-038-settings-scope-consistency-browser
```

## Regression Gate

DEV-038 會觸及 Settings、Backup、RecycleBin、BoardMembersPanel、AppInstallAssistant，因此至少加跑：

```powershell
npm.cmd run verify:settings-project-context
npm.cmd run verify:settings-project-context-browser
npm.cmd run verify:dev-036-trello-like-workspace-governance
npm.cmd run verify:dev-035-workspace-delete-persistence-fix
npm.cmd run verify:dev-026-trello-like-board-share-ui
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Conditional gate：若本輪同步觸及 `CalendarSubscriptionsView` 或 DEV-037 已實作，需加跑：

```powershell
npm.cmd run verify:dev-037-calendar-subscription-source-scope
```

若 DEV-037 尚未實作，該 gate 可在 DEV-038 QC 中標示為 deferred dependency，但不能因此略過 Settings/Backup/RecycleBin 的 gate。

## Manual UX Review

- 5 秒內判斷每個頁籤的作用範圍。
- 人工確認匯出/匯入不會被理解為同一種全域還原。
- 人工確認清空回收桶前知道會永久刪除哪個看板的幾筆任務。
- 人工確認快速開啟是裝置/帳號設定，不是看板設定。
- 人工確認長 Workspace / Board 名稱不會破壞版面。

## QC Handoff Evidence

QC 回報至少包含：

- Static verifier 結果。
- Browser verifier 結果與桌機 / mobile 截圖。
- 匯入取消流程證據。
- 清空回收桶確認文案證據。
- Regression gates 結果。
- 若未執行 DEV-037 相關 gate，需明確標示依賴尚未實作。
