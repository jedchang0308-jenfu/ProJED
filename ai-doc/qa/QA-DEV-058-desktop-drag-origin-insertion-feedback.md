# QA-DEV-058 桌面拖曳原地文字欄位藍色回饋

狀態：RD Rework 1 Executed / Local Automated Verification Passed / User Revalidation Pending / Not Deployed
關聯 DEV：DEV-058、DEV-055
權威規格：`ai-doc/specs/SPEC-058-desktop-drag-origin-insertion-feedback.md`
風險等級：Medium

## 1. Stop Ship 條件

- 來源範圍同時顯示 origin 與一般 target 兩條 marker。
- origin title field 出現在 source placeholder 或 normal flow，造成任務位移。
- 來源放開後任一 node 的 parent / order / updatedAt 改變。
- origin 狀態仍顯示 insertion marker、標題不正確，或不是明確的藍底白字欄位。
- 無效來源 fallback 到上一層卡片、正常 target commit 不再對應顯示位置。
- click、right-click、8px 起手門檻、手機拖曳任一回歸。

## 2. Static Gate

執行：

`npm.cmd run verify:dev-058-desktop-drag-origin-insertion-feedback`

至少驗證：文件互連、來源 title geometry、mouse-only source rect gate、single fixed overlay、origin/no-op attrs、藍底白字 title field、正常 marker 不變、source collision no-op、cancel/end cleanup、Workbench/mobile 邊界與 browser contract。

## 3. Browser Gate

沿用並更新 DEV-055 `QA-055-B07`，以真實 mouse drag 驗證：

| ID | 操作 | Pass 條件 |
|---|---|---|
| B07-1 | checklist source 拖到另一卡片 primary，再進 child row | child row 取代 parent ownership，正常 marker 為 standard |
| B07-2 | 游標移回來源 row | 恰一個 `origin + noop` title field，target id 等於 source id，surface kind 為 checklist-row |
| B07-3 | 檢查原地視覺 | title field 使用 `bg-blue-500`、`text-white`，背景不透明且文字等於來源標題；可見 insertion marker = 0 |
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

- Attempt 1 粗插入線的自動化雖通過，但使用者判定 UX 不夠直覺，已由 Rework 1 明確取代。
- Rework 1 static：DEV-058 19/19、DEV-055 27/27、DEV-046 31/31、DEV-053 30/30、DEV-054 34/34 全數通過。
- Rework 1 browser：DEV-055 B01-B16 16/16 通過；B07 的 checklist、card、column origin field 均為 `bg-blue-500` / `text-white`、標題正確、可見 insertion marker = 0，且 origin release nodes snapshot 零變更。
- Geometry：B07 三種來源欄位寬度分別為 222px、228px、262px；B15 L3+ task top/bottom delta = 0、parent transform = `none`，證明 fixed overlay 未推動 normal flow。
- 工程 gate：ESLint quiet、TypeScript `--noEmit`、全新 outDir production Vite build 均通過；build 僅有既有 Browserslist data age warning。
- 視覺證據：`output/playwright/dev-055-desktop-drag-1785735793491-B07-origin-blue-title-field.png`；未見欄位裁切、task/sibling 位移或非預期重疊。
- 使用者實際操作確認仍待執行，因此本紀錄不標示 user acceptance。
- 本 QA 不授權 production deploy；正式部署仍需另走 release gate。
