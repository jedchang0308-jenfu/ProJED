# QC-DEV-027D: Mind Map Date Display and Filter Integration

日期：2026-06-19
狀態：Browser QC Passed
關聯 QA：`ai-doc/qa/QA-DEV-027D-mindmap-date-display-filter.md`

## QC 範圍

本輪 QC 針對心智圖日期顯示與既有 filter 串接：

- 日期 badge metadata 與顯示文字
- `showStartDate` 開關
- `dueWithinDays` 到期篩選
- status filter
- assignee filter
- tag filter wiring
- root / child traversal 同步 filter
- DEV-027B / DEV-027C 心智圖互動回歸

## 自動化證據

| Gate | Command | Status | Notes |
|---|---|---|---|
| Static | `npm.cmd run verify:dev-027d-mindmap-date-display-filter` | Pass | 10 checks passed；source wiring 與 verifier coverage 通過 |
| Browser UI | `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser` | Pass | 日期 badge、`showStartDate`、due/status/assignee filter 與 badge geometry 通過；截圖 `output/playwright/dev-027D-mindmap-date-filter.png` |
| TypeScript | `npm.cmd exec tsc -- --noEmit` | Pass | 型別門檻通過 |
| Lint | `npm.cmd run lint -- --quiet` | Pass | 靜態品質門檻通過 |
| Build | `npm.cmd run build:test` | Pass | test mode build 通過；保留既有 Vite chunk-size / dynamic import warning |
| Regression | `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser` | Pass | keyboard / zoom / connector / drag preview 回歸通過 |
| Regression | `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser` | Pass | note relationship line 回歸通過 |

## UI Fail Criteria

本輪未觸發下列 Fail 條件：

- 日期 badge 超出 node card。
- `showStartDate=false` 仍顯示開始日期。
- filter 後 hidden node 仍出現在 DOM。
- 父任務被 filter 隱藏時子任務仍孤立顯示。
- connector line 因日期 badge 產生明顯斷裂或偏移。
- browser body 出現 visible runtime error。

## QC 結論

Browser QC Passed。心智圖日期顯示已接上既有 filter 規則，並通過本輪 UI 與回歸驗證。
