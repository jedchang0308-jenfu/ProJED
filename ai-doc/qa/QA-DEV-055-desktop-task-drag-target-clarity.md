# QA-DEV-055 電腦版任務拖拉落點清晰化與跨階層定位升級

狀態：Executed / Automated + T01-T08 User Desktop Acceptance + Production Level 4 Passed
關聯 DEV：DEV-055、DEV-053、DEV-054、DEV-046、DEV-051
權威規格：`ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md`
風險等級：Medium-to-High
測試目標：證明桌機拖拉的 live target indicator 單一、穩定、可預期，且 displayed before / after / append 與實際 commit parent / order 一致；同時保留使用者已滿意的桌機拖拉手感。

## 1. 驗證範圍

包含：

- 桌機 `1440x900` 與 `1024x768` viewport。
- 看板 card、checklist row、column header、column/dropzone、checklist/dropzone。
- 同欄排序、跨欄移動、card / checklist 跨階層移動、append child、root column/header 類目標。
- Workbench unplaced row placement 與 placed row no-drag。
- click、right-click、微小移動、blank canvas mouse pan、undo。
- DEV-046 / DEV-053 / DEV-054 指定回歸。

不包含：

- 手機新功能設計。
- production deploy / release smoke。
- DB schema / migration / backend 權限驗證。

## 2. Stop Ship 條件

任一項發生即 DEV-055 不得完成：

- visible live target indicator 超過一個。
- source placeholder 使用者可誤認為 live drop target。
- displayed target / position 與 commit parent / order 不一致。
- checklist row hover 被 parent card 或 expanded card outer rect 搶走。
- 同一格內定位線肉眼可見漂移，或同一 canonical target 微移時 indicator rect 不穩定。
- 定位線或 checklist append dropzone 推開 L3+ sibling row。
- invalid target fallback 到 ancestor，造成任務落到不相干位置。
- 桌機 overlay、起手門檻、click/right-click、blank canvas pan、undo 任一回歸。
- Workbench placed row 可拖。
- DEV-054 手機原成功路徑回歸。

## 3. Static Verification

RD 需新增並執行：

`npm.cmd run verify:dev-055-desktop-task-drag-target-clarity`

Static verifier 至少檢查：

| ID | 檢查點 | Pass 條件 |
|---|---|---|
| S01 | SPEC / QA linkage | `SPEC-055`、`QA-DEV-055`、`dev_task.md`、`documentation_map.md` 互相引用 |
| S02 | Desktop indicator data attrs | 程式包含 `data-desktop-drop-indicator`、`data-desktop-drop-target`、`data-desktop-drop-position` |
| S03 | Canonical resolver reuse | desktop preview / commit helper 皆呼叫 `resolveTaskDropIntent()`，不得複製 before / after / append 規則 |
| S04 | Source placeholder separation | desktop source placeholder 不渲染 `data-desktop-drop-indicator`，且不使用 live target wrapper |
| S05 | Generic primary geometry | card primary geometry 有 `data-task-card-primary="true"`，既有 `data-mobile-task-card-primary="true"` 保留 |
| S06 | Invalid ancestor blocking | helper 對 invalid innermost target 回傳 null，不 fallback ancestor |
| S07 | Desktop baseline protected | `BoardView.tsx` 仍保留 `<DragOverlay dropAnimation={null}>` 與 `data-kanban-drag-overlay="true"` |
| S08 | Workbench placed row no-drag | `workbench-placed-row-is-not-a-source` guard 或等效 no-op 仍存在 |
| S09 | Mobile rail not ported | 桌機 indicator 不引用 `data-mobile-task-action-rail` 或 mobile action items |
| S10 | package scripts | `package.json` 包含 DEV-055 static 與 browser verifier script |
| S11 | Display/commit revalidation | drop 前 displayed preview 與 latest current preview 不一致時 no-op |
| S12 | Overlay-only indicator | desktop indicator 是 fixed overlay；card 內不渲染 inline `KanbanInsertionMarker` 或 `h-6` 撐版面 marker |
| S13 | No sortable displacement | 桌機 task drag 期間 card/checklist sortable transform 凍結，且同 target rect 有微小 retain |

## 4. Browser Automated Verification

RD 需新增並執行：

`npm.cmd run verify:dev-055-desktop-task-drag-target-clarity-browser`

Browser verifier 需用真實 mouse drag 操作，不得只觸發 store function。

| ID | Viewport | 操作 | Pass 條件 | Evidence |
|---|---|---|---|---|
| B01 | 1440x900 | 同欄 card A 拖到 card B 前 / 後 | 畫面只有一條 desktop indicator；indicator position 等於 drop 後 order | screenshot + localStorage trace |
| B02 | 1440x900 | card 跨欄拖到另一 column card 前 / 後 | target column / parent / order 正確；來源 column order 正規化 | screenshot + store snapshot |
| B03 | 1440x900 | card 拖到 column header / column drop append | append 顯示與 commit parent 一致；不誤 reorder root column | trace |
| B04 | 1440x900 | checklist row 同父層排序 | indicator 對齊 checklist title；commit 只改同父層 order | screenshot + store snapshot |
| B05 | 1440x900 | checklist row 拖到另一 card/checklist parent | targetSurfaceKind 正確；parentId 等於預期 target parent；不落到 ancestor card | trace |
| B06 | 1440x900 | card 拖到 checklist drop / empty child lane | append indicator 出現在可接收區；commit 新 parent 正確 | screenshot |
| B07 | 1440x900 | expanded card 中，pointer 穿過 parent body、child row、child row 間隙 | child row 命中時 parent card 不搶 target；invalid child 不 fallback parent | trace |
| B08 | 1024x768 | 同欄與跨欄拖曳各一次 | indicator 不被 viewport 裁切；overlay 手感與 baseline 等價 | screenshot |
| B09 | 1024x768 | 微小 mouse movement 後放開 | 不啟動 drag / 不提交 move；click 行為維持 | trace |
| B10 | 1440x900 | right-click card / checklist / column header | 只開桌機 context menu，不啟動 drag indicator | screenshot |
| B11 | 1440x900 | blank canvas mouse pan | 只平移看板，不顯示 task indicator | trace |
| B12 | 1440x900 | Workbench unplaced row 拖到 board，再嘗試拖 placed row | unplaced placement 成功；placed row no-op | trace |
| B13 | 1440x900 | 完成一次跨階層 move 後按 undo | 一次 undo 還原 parent/order；無拆分殘留 | store snapshot |
| B14 | 1440x900 | 連續 10 次 card/checklist 混合拖放 | wrong commit = 0；visible error = 0；console error = 0 | aggregated trace |
| B15 | 1440x900 | checklist source 拖到另一張卡的 L3+ row，於同一格內三次微移 | indicator descriptor 不變、rect delta <= 1；target card L3+ row top/bottom delta = 0；parentTransform = `none` | screenshot + row geometry trace |
| B16 | 1440x900 | visible / console / network error sweep | visible error = 0；console error = 0；network error = 0 | trace |

## 5. Regression Gates

DEV-055 完成前必跑：

| Command | 目的 |
|---|---|
| `npm.cmd run verify:dev-046-universal-task-surface-drag` | 全任務 surface drag 靜態回歸 |
| `npm.cmd run verify:dev-046-universal-task-surface-drag-browser` | 桌機/手機 surface drag browser 回歸 |
| `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency` | 肌肉記憶一致化靜態回歸 |
| `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser` | 桌機 baseline、placed row no-drag、真實流程回歸 |
| `npm.cmd run verify:dev-054-mobile-task-drag-precision` | 手機定位成功方案靜態回歸 |
| `npm.cmd run verify:dev-054-mobile-task-drag-precision-browser` | 手機 R01-R10 與原成功路徑回歸 |
| `npm.cmd run build` | Vite build gate |

## 6. QA 真實操作驗證

自動化通過後，QA 或使用者需做一次真實桌機操作驗證。這是 DEV-055 完成標準之一。

| ID | 操作 | 次數 | Pass 條件 |
|---|---|---:|---|
| T01 | 同欄 card 上下排序 | 5 | 每次落點線與結果一致，無 double-submit |
| T02 | card 跨欄移動 | 5 | target column 正確，order 正確 |
| T03 | checklist row 同父層排序 | 5 | 不需精瞄即可判斷 before / after；同一格內定位線不飄 |
| T04 | checklist row 跨 parent 移動 | 5 | parent 正確，不被外層 card 搶走；L3+ sibling 不被推開 |
| T05 | card 拖到 checklist / child append 區 | 5 | append 意圖清楚，commit parent 正確；append hit area 不撐開內容 |
| T06 | expanded card 內穿越多個 child row | 5 | indicator 不亂跳到不相干 parent；hover 同一 row 不漂移 |
| T07 | 微小移動、click、right-click 混合操作 | 5 | 詳情、右鍵、拖曳互不誤觸 |
| T08 | undo 回復剛剛的 move | 3 | 一次 undo 還原該次 move |

通過標準：

- 38 次以上真實操作全數 pass。
- wrong commit = 0。
- 使用者主觀確認：桌機跨階層落點比 DEV-053 baseline 更清楚，且桌機手感沒有被重做。

未通過標準：

- 任一 wrong commit。
- 任一 target 指示與結果不一致。
- 任一同格定位線漂移或 L3+ 任務被定位線推開。
- 使用者覺得手感比原桌機差，即使自動化通過也不得完成。

## 7. Evidence Package

完成 DEV-055 時需在回報中列出：

- static verifier output。
- browser verifier output 與截圖路徑。
- regression commands output。
- 真實操作 T01-T08 結果表。
- 至少三張代表截圖：
  - 同欄 card before / after indicator。
  - checklist cross-parent indicator。
  - expanded card child ownership indicator。
- 若任一測試 skipped，需列原因、風險與是否阻塞完成。

## 8. 2026-07-17 執行紀錄

- 使用者 T01-T08 Attempt 1：未通過。問題為定位線在同一格會飄，以及定位線 / L3+ drop feedback 會推開 L3+ 任務。
- RD Rework 1：改為 fixed overlay-only indicator、card checklist append overlay hit area、桌機 task drag sortable displacement freeze、同 canonical target rect micro-retain。
- DEV-055 static：27/27 Pass。
- DEV-055 browser：B01-B16，16/16 Pass；B15 驗證 L3+ row top/bottom delta = 0、parentTransform = `none`、同格 indicator rect delta = 0；wrong commit = 0，console/network error = 0。
- Regression：DEV-046 static 29/29 與 browser Pass；DEV-053 static 30/30 與 browser 10/10 Pass；DEV-054 static 34/34 與 browser R01-R10 10/10 Pass。
- Engineering gates：`npx.cmd tsc --noEmit` Pass；`npm.cmd run build` Pass，1970 modules transformed。
- Current-state revalidation：2026-07-17 重新於目前 worktree 執行上述 DEV-055 / DEV-046 / DEV-053 / DEV-054 static 與 browser gates、TypeScript、production build，均 Pass。
- Evidence base：`output/playwright/dev-055-desktop-drag-1784299443605-*`。
- Latest current-state revalidation：2026-07-17 於 T01-T08 使用者驗收失敗回送 RD 後再跑 DEV-055 static 27/27、DEV-055 browser B01-B16 16/16、DEV-046 static/browser、DEV-053 static/browser、DEV-054 static/browser、`npx.cmd tsc --noEmit`、`npm.cmd run build`，均 Pass；最新 DEV-055 evidence base：`output/playwright/dev-055-desktop-drag-1784301885366-*`。
- User revalidation：2026-07-17 使用者回報 RD Rework 1 後 T01-T08 測試通過，確認同格不飄、L3+ 不被定位線推開、桌機手感沒有被重做。
- Release gate：2026-07-17 使用者要求部署正式環境；release branch `codex/dev055-production-release-20260717-234436`、artifact commit `e07ba4b`。Level 2 local production artifact smoke Pass；Level 3 Firebase preview `https://projed-cc78d--level3-smoke-o1na5wft.web.app` Pass；Level 4 production `https://projed-cc78d.web.app` Pass。正式站載入 `assets/index-DpRjvQu-.js` / `assets/index-B8eLAVHK.css`，線上 hash 與本機 artifact 一致。
- QC report：`ai-doc/qc/QC-DEV-055-desktop-task-drag-target-clarity.md`。
- Completion gate：RD Rework 1 後的 T01-T08 共 38 次使用者真實桌機操作與新版桌機手感主觀確認已通過；本 QA 宣告 DEV-055 completion gate 通過。

## 9. 變更紀錄

- 2026-07-17：完成 Firebase Hosting production deployment 與 Level 4 smoke；authenticated production drag smoke 未由 Codex 自動登入執行，需使用者登入正式站後補人工操作證據。
- 2026-07-17：使用者 T01-T08 Attempt 1 未通過後完成 RD Rework 1，補 B15 鎖定「同格不飄、L3+ 不被推開」；使用者重跑 T01-T08 回報測試通過，最後完成門檻已通過。
- 2026-07-17：建立 QA plan，將 DEV-055 的自動化、回歸與真實操作驗證納入完成標準。
