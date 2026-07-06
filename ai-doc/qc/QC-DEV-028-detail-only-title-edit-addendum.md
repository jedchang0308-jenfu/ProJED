# QC-DEV-028: Detail-Only Title Edit Addendum

狀態: Local Automated QC Passed / Manual Click QC Readiness Gate Added / Manual Click QC Pending / Production Not Deployed
對應 DEV: DEV-028 / DEV-029
日期: 2026-07-06

## QC 結論

Pass with boundary. DEV-028 detail-only title edit addendum 已完成本機產品碼、static verifier、browser verifier 與 regression gate 驗證。任務外層 rename gesture 已移除，新增任務命名導向 `TaskDetailsModal` title input，詳情頁 title input 保留可辨識 editable affordance。

不得宣稱已完成人工親自點擊 QC；`QA-DEV-028` 的 MAN-028 matrix 仍待人工操作者補證據。Production deploy 未執行。

2026-07-07 已補 `verify:dev-028-manual-click-qc-readiness`。此 gate 預設只讀、`mutates_database=false`、`manual_qc_completed=false`，用來確認 MAN-028-001 至 MAN-028-028、證據欄位、viewport、visible error sweep 與「自動化不得取代人工」邊界仍完整；它不代表人工親自點擊 QC 已通過。

## 驗證命令

| Command | Result | Notes |
|---|---|---|
| `npm.cmd run verify:dev-028-cross-mode-task-interactions` | Pass | 35/35 |
| `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser` | Pass | 四模式 click-to-details、外層 rename removal、context menu 無 rename、mobile board visibility |
| `npm.cmd run verify:dev-028-manual-click-qc-readiness` | Pass | Read-only manual-QC readiness gate；不執行人工點擊、不宣稱 manual pass |
| `npm.cmd run verify:dev-027b-xmind-interaction-polish` | Pass | 32/32 |
| `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser` | Pass | 心智圖 Enter/Tab/方向鍵、zoom/pan regression；selected relationship style deep coverage 由 DEV-027E gate 承接 |
| `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser` | Pass | 心智圖關聯線選取/style/右鍵 task menu regression |
| `npm.cmd run verify:dev-029-mobile-pan-first-interactions` | Pass | 32/32；E05 已改為外層 rename control 不存在 |
| `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` | Pass | 手機 pan-first、compact action rail、tap-to-details regression |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript no emit |
| `npm.cmd run build:test` | Pass | Vite test build |
| `npm.cmd run lint -- --quiet` | Not passed | 既有 unrelated lint failures: `scripts/verify-dev-040-production-auth-ui-smoke.mjs`, `scripts/verify-dev-043-system-page-exit-browser.pw.js`, `src/components/BoardView.tsx` |

## QC 覆蓋

| Area | Result | Evidence |
|---|---|---|
| 外層 rename UI 移除 | Pass | WBS list、Kanban column/card/checklist、SharedTaskSidebar、MindMap node 不再有 outer title input / pencil / rename menu |
| 快捷鍵移除 | Pass | `F2`、`t`、direct typing 不再啟動任務外層 rename；清單/看板/甘特 `Enter` 保留開詳情，心智圖 `Enter` 保留新增同階 |
| 新增任務命名 | Pass | `prepareNewTaskNaming()` 設定 selected task、pending detail title edit，並開 `TaskDetailsModal` |
| 詳情頁 title edit | Pass | `data-task-details-title-input="true"` 為唯一 title edit locus，具有 border/background/focus affordance |
| Mobile DEV-029 compatibility | Pass | 手機短滑 pan-first、長按 compact action rail、tap-to-details regression 通過；E05 改驗外層 rename control absent |
| Mind map DEV-027 compatibility | Pass | DEV-027B/027E browser regression 通過 |

## 未執行 / 邊界

- MAN-028-001 至 MAN-028-028 人工親自點擊 QC 未執行。
- `verify:dev-028-manual-click-qc-readiness` 通過只代表 checklist 與 handoff 邊界完整，不代表人工操作完成。
- Production deploy / post-deploy smoke 未執行。
- DB schema、RLS、RPC、migration 未變更且不在本輪範圍。
- `TaskDetailsModal` 容器型態未重做；本輪只調整 title edit affordance 與互動入口。
