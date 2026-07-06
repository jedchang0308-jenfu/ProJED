# QC-DEV-027: Xmind-like 心智圖模式

日期：2026-06-18
狀態：Browser QC Passed
對應 DEV：DEV-027
規格：`ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md`
QA：`ai-doc/qa/QA-DEV-027-xmind-like-mind-map-mode.md`
UI reopen：`ai-doc/qc/QC-DEV-027A-xmind-connector-drag-ui.md`

> 2026-07-06 verification maintenance：DEV-028 detail-only title edit 已覆寫舊外層 rename 行為；`verify-dev-027-xmind-like-mind-map-mode` 與 legacy browser smoke 已改為檢查 `TaskDetailsModal` title input，並確認沒有 `data-mindmap-title-input`。

## QC 結論

DEV-027 驗證通過。心智圖模式已可在 ProJED 以 active board 作為中心主題，將既有 WBS 任務呈現為分支，並支援核心 Xmind-like 操作：新增根分支、`Tab` 新增子分支、滑鼠拖曳調整父子階層、cycle guard 防止拖到自己的子孫節點底下、mobile viewport 可用，以及 viewer 唯讀權限防呆。

原先 QC 限制項已補齊：
- 拖曳階層不再只靠 static verifier，已由 `verify:dev-027-xmind-like-mind-map-browser` 使用實際 Playwright mouse drag 驗證。
- viewer 權限不再只靠 source guard，已由 browser run 切換 `local-test-viewer` 驗證按鈕 disabled、節點不可拖曳、`Enter` 不會新增分支。
- DEV-027A UI reopen 已補齊 connector continuity、拖曳即時 preview、同側 root placement 與 side persistence browser verifier。

## 驗證命令

```powershell
npm.cmd run verify:dev-027-xmind-like-mind-map-browser
npm.cmd run verify:dev-027-xmind-connector-lines-browser
npm.cmd run verify:dev-027-xmind-drag-preview-browser
npm.cmd run verify:dev-027-xmind-like-mind-map-mode
npm.cmd exec tsc -- --noEmit
npm.cmd run lint -- --quiet
npm.cmd run build:test
npm.cmd run verify:core-regression-static
```

本輪已執行：
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`：Pass
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`：Pass
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`：Pass
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`：Pass，43 checks
- `npm.cmd exec tsc -- --noEmit`：Pass
- `npm.cmd run lint -- --quiet`：Pass
- `npm.cmd run build:test`：Pass；僅既有 Vite dynamic import / chunk size warning
- `npm.cmd run verify:core-regression-static`：Pass，10 checks

## Browser QC Evidence

環境：
- URL：`http://127.0.0.1:4173/`
- 測試帳號：`local-test-user` owner、`local-test-viewer` viewer
- Desktop viewport：`1440x900`
- Mobile viewport：`390x844`

Browser script：
- `scripts/verify-dev-027-xmind-like-mind-map-browser.pw.js`

截圖：
- `output/playwright/dev-027-mindmap-desktop.png`
- `output/playwright/dev-027-mindmap-mobile.png`
- `output/playwright/dev-027A-connector-desktop.png`
- `output/playwright/dev-027A-connector-laptop.png`
- `output/playwright/dev-027A-connector-mobile.png`
- `output/playwright/dev-027A-drag-preview-sequence/`

驗證項：
- `心智圖` mode switcher 可進入 `data-mindmap-view`。
- 中心主題顯示 active board title。
- 既有 WBS 任務以 `data-mindmap-node` branch 顯示。
- 新增 root 分支後可立即改名。
- 對選取 branch 按 `Tab` 會建立 level 2 子分支。
- 將 root A 拖到 root B 中央會變成 root B 的子分支。
- 將 root B 拖到 root A 底下會被 cycle guard 拒絕，root B 維持 level 1。
- 將 root A 拖回中心主題會恢復為 root level。
- mobile 收合 sidebar 後，心智圖工作區維持可視且可橫向捲動。
- viewer 看到 `唯讀模式`，新增 root disabled，branch `draggable=false`，按 `Enter` 不會新增 sibling。
- visible error sweep 未發現 `Internal Server Error`、`HTTP 4xx/5xx`、`Not Found`、`TypeError`、`ReferenceError`。

## Gate Result

| Gate | Result | Evidence |
|---|---|---|
| Static DEV-027 verifier | Pass after QC doc update | `verify:dev-027-xmind-like-mind-map-mode` |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Browser UI QC | Pass | `verify:dev-027-xmind-like-mind-map-browser` |
| Connector continuity | Pass | `verify:dev-027-xmind-connector-lines-browser` |
| Drag preview / same-side placement | Pass | `verify:dev-027-xmind-drag-preview-browser` |
| Drag hierarchy | Pass | Playwright mouse drag root A -> root B |
| Cycle guard | Pass | Playwright mouse drag parent -> descendant rejected |
| Viewer read-only | Pass | Browser role switch to `local-test-viewer` |
| Mobile UI | Pass | `390x844`, sidebar collapsed, canvas visible and scrollable |

## QC 決策

DEV-027 可交付。本輪 QC 未留下阻塞缺口；後續若使用者需要更接近 Xmind 的進階體驗，應另開後續 DEV，例如自由縮放、框選、多選、relationship 線、summary boundary、marker/icon、style panel、匯入/匯出，而不是塞回 DEV-027 MVP。
