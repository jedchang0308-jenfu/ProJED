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

## 2026-09-03 共用看板視覺增補 QC

### 結論

`PASS（Local UI / Not Released）`。心智圖已直接使用看板 `TaskDateBadge checklist` 與共用 `taskStatusTitleClass`；一般／逾期／完成日期和待辦／進行中／完成標題呈現符合 SPEC-062，既有開始日期開關與 filter 契約未變。

### 執行證據

| Gate | Command / Evidence | Status | Notes |
|---|---|---|---|
| Static contract | `npm.cmd run verify:dev-027d-mindmap-date-display-filter` | Pass | 11/11；共用元件、狀態 class、metadata、依賴鎖定 wiring 與 768px verifier coverage 通過 |
| Mind Map browser | `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser` | Pass | 共用 badge、逾期／完成語意、三種標題狀態、開始日期開關、due/status/assignee filter、badge containment 與 visible-error sweep 通過 |
| Rendered visual | `output/playwright/dev-027D-mindmap-date-filter-1440.png`、`output/playwright/dev-027D-mindmap-date-filter-768.png` | Pass | 1440×900、768×844；日期不外溢、無 document overflow，灰／橘與標題狀態色可辨識 |
| Kanban regression | `npm.cmd run verify:dev-060-kanban-due-date-browser` | Pass | QA-060-001～004；1440／1024／390 看板日期單值、無箭頭、對齊、overflow 與 browser error 通過 |
| Status regression | `npm.cmd run verify:dev-062-simplified-task-status` | Pass | 人工狀態與衍生逾期規則通過 |
| Mind Map performance contract | `npm.cmd run verify:dev-075-mindmap-keyboard-performance` | Pass | 13 cases；pure kernel + static authority 通過 |
| TypeScript | `npm.cmd exec tsc -- --noEmit --pretty false` | Pass | 0 errors |
| Targeted ESLint | `npm.cmd exec eslint -- ... --quiet` | Pass | 0 errors |
| Build | `npm.cmd run build:test` | Pass | test build 完成；只有既存 chunk-size 與 Browserslist freshness 提示 |

### Fail-seeking 與修正紀錄

- 390px 心智圖量測首次逾時：查明 `MainLayout` 現行契約在小於 768px 將 mindmap 切回 board 並隱藏 mode switcher；未修改產品政策，改以最窄支援寬度 768px 驗證心智圖，390px 保留看板回歸。
- DEV-060 初次回歸因全域 `[data-task-date-badge]` selector 收到非看板共用 badge 而在 QA-060-004 產生 `other/null` 假失敗；驗證器改限定 board surface 後，原有 L2／L3+ 斷言 4/4 通過，未放寬允許值。
- 最新心智圖 browser console log 只有 React DevTools／診斷 info 與既存 password-form verbose 訊息，無 console error 或 page error。

### Runtime 與邊界

- 驗證重用同一 canonical repo 已存在的 `http://localhost:4000/` local-test runtime：Vite listener PID 22676，可追溯到本專案 `npm run dev:test` 程序樹。
- 該 runtime 不是本次啟動，故未停止或接管；browser verifier 自有 Playwright 程序已正常結束。
- 未執行 commit、push、deploy、production mutation 或 release。
