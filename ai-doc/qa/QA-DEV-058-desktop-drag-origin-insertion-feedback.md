# QA-DEV-058 桌面拖曳原地粗插入線回饋

狀態：Executed / Local Automated Verification Passed / Not Deployed
關聯 DEV：DEV-058、DEV-055
權威規格：`ai-doc/specs/SPEC-058-desktop-drag-origin-insertion-feedback.md`
風險等級：Medium

## 1. Stop Ship 條件

- 來源範圍同時顯示 origin 與一般 target 兩條 marker。
- origin marker 出現在 source placeholder 或 normal flow，造成任務位移。
- 來源放開後任一 node 的 parent / order / updatedAt 改變。
- origin marker 與既有 marker 使用不同顏色，或粗細沒有可辨識差異。
- 無效來源 fallback 到上一層卡片、正常 target commit 不再對應顯示位置。
- click、right-click、8px 起手門檻、手機拖曳任一回歸。

## 2. Static Gate

執行：

`npm.cmd run verify:dev-058-desktop-drag-origin-insertion-feedback`

至少驗證：文件互連、來源共用幾何、mouse-only source rect gate、single fixed overlay、origin/no-op attrs、emphasized existing marker、source collision no-op、cancel/end cleanup、Workbench/mobile 邊界與 browser contract。

## 3. Browser Gate

沿用並更新 DEV-055 `QA-055-B07`，以真實 mouse drag 驗證：

| ID | 操作 | Pass 條件 |
|---|---|---|
| B07-1 | checklist source 拖到另一卡片 primary，再進 child row | child row 取代 parent ownership，正常 marker 為 standard |
| B07-2 | 游標移回來源 row | 恰一條 `origin + noop` marker，target id 等於 source id，surface kind 為 checklist-row |
| B07-3 | 比較正常與原地 marker | origin bar height 大於 normal bar height，computed background color 相同 |
| B07-4 | 來源放開 | nodes JSON 前後完全一致，marker 清除 |
| B07-5 | 截圖檢視 | marker 不重疊 overlay/title、不超出欄位、不推動 sibling |

## 4. Regression Gates

- `npm.cmd run verify:dev-055-desktop-task-drag-target-clarity`
- DEV-055 browser B01-B16（至少 B07 必跑；完整 suite 作提交 gate）
- `npm.cmd run verify:dev-046-universal-task-surface-drag`
- `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency`
- `npm.cmd run verify:dev-054-mobile-task-drag-precision`
- `npx.cmd tsc --noEmit`
- production build 至全新 outDir

## 5. Evidence Record

- DEV-058 static：19/19 Pass。
- DEV-055 / DEV-046 / DEV-053 / DEV-054 static：27/27、31/31、30/30、34/34 Pass。
- DEV-055 browser：B01-B16 16/16 Pass；route `http://127.0.0.1:4174/?qcReset=1&qcSize=72`，console / network error = 0。
- B07 normal marker：6px、standard、`rgb(99, 102, 241)`。
- B07 checklist/card/column origin marker：8px、strong、同色、`origin=true`、`noop=true`，release zero-write。
- B15 layout：所有 L3+ row top/bottom delta = 0，parent transform = `none`。
- TypeScript、全專案 ESLint、Vite production build（1970 modules）Pass。
- 視覺證據：`output/playwright/dev-055-desktop-drag-1785730332191-B07-origin-noop-marker.png`，人工檢視無重疊、裁切或 sibling 位移。
- 本 QA 不授權 production deploy；正式部署仍需另走 release gate。
