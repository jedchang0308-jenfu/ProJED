# QC-DEV-067：看板任務拖曳升級為 L1 列表

狀態：QC PASS / Local Only / 未 Release

日期：2026-08-14

對應規格：`ai-doc/specs/SPEC-067-kanban-l1-drag-promotion.md`

對應 QA：`ai-doc/qa/QA-DEV-067-kanban-l1-drag-promotion.md`

## 結論

DEV-067 已在本機完成 RD、QA 與 QC。L2／L3+ 任務可由桌機滑鼠或手機長按拖到 L1 列表標頭，升級為 `parentId: null`、`nodeType: group` 並定位於目標列表之前；拖到看板尾端「新增列表」區會成為最後一個 L1。拖到列表內容區仍維持 L2，未發現 marker／commit 不一致、雙 marker、子樹遺失、誤新增列表或 runtime-visible error。

## 事實證據

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-067 canonical resolver／source contract | PASS 13/13 | `npm run verify:dev-067-kanban-l1-drag` |
| DEV-067 rendered browser | PASS 8/8 | `npm run verify:dev-067-kanban-l1-drag-browser` |
| Desktop core drag regression | PASS 16/16 | `npm run verify:dev-055-desktop-task-drag-target-clarity-browser` |
| Mobile core drag regression | PASS 11/11 | `npm run verify:dev-054-mobile-task-drag-precision-browser` |
| DEV-053／054／055／058 static regression | PASS 30／37／27／26 | 各 DEV targeted verifier |
| TypeScript | PASS | `npx tsc --noEmit` |
| Targeted ESLint | PASS | 0 error；`BoardView.tsx` 2 個既存 warning |
| Test build | PASS | `npm run build:test`；1996 modules transformed |
| Runtime／network／visible error | PASS | console 0 error、無非預期 network failure、無可見 alert／HTTP error |
| Viewports | PASS | 1440x900、1024x768、390x844；另由 DEV-054 覆蓋 320／390／430 mobile rail |

## Rendered Evidence

- Desktop L2 → L1 header：`output/playwright/dev-067-kanban-l1-drag-1786715195381-desktop-card-to-l1-header.png`
- Desktop L3+ → L1 header：`output/playwright/dev-067-kanban-l1-drag-1786715195381-desktop-l3-to-l1-header.png`
- Desktop board-end root append：`output/playwright/dev-067-kanban-l1-drag-1786715195381-desktop-root-append.png`
- Desktop column body L2 regression：`output/playwright/dev-067-kanban-l1-drag-1786715195381-desktop-column-body-l2-regression.png`
- Mobile → L1 header：`output/playwright/dev-067-kanban-l1-drag-1786715195381-mobile-card-to-l1-header.png`
- Mobile board-end root append：`output/playwright/dev-067-kanban-l1-drag-1786715195381-mobile-root-append.png`

## QC Findings

- 新增的 L1 header 與 root append marker 都使用既有 `KanbanInsertionMarker`，拖曳中只有一個 fixed overlay marker，未推動 normal flow。
- L1 header 與列表內容有不同 surface kind；實際 store 的 parent／order／nodeType 與 marker descriptor 一致。
- root append drop 不會觸發被包覆的新增列表 CTA，root 數量只因來源升階改變，不會多出空列表。
- 既有 DEV-055 browser 兩案仍尋找已移除的欄內新增按鈕，已改為現行 `column-drop` surface；DEV-054 browser 的跨案例工作台狀態與 invalid zone 也已校正。校正後完整 regression 全數通過。

## Supplemental / Release Boundary

- Physical iOS／Android 手感未執行；390x844 synthetic touch 的長按、raw finger、marker、release revalidation 與 root append 已通過。
- 本輪沒有 migration、production 資料操作、部署或 release；正式交付仍須另走 release gate。
