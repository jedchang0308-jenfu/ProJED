# QC-DEV-029: 手機 Pan-First 觸控手勢事實驗證

關聯 DEV: DEV-029
關聯 SPEC: `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md`
關聯 QA: `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md`
狀態: Local Automated Browser QC Passed / Physical Phone Supplemental Not Executed
建立日期: 2026-07-04

## 驗證結論

- 判定：通過，本機 automated + real browser gesture matrix 通過。
- 範圍：DEV-029 Phase 1 + Phase 1B BoardView / KanbanCard / KanbanChecklist / TaskWorkbench mobile overlay pan-first 觸控仲裁、compact action rail、手機拖曳把手 pass-through、長按卡死復原與 drag-action edge auto-scroll。
- 限制：H01-H04 physical-phone 補充案例未在本機環境執行；不得宣稱 iOS Safari / Android Chrome 真機手感已完成簽核。

## RD 修正事實

- 2026-07-04 真機回饋後修正：手機 pan-first 不應取消任務詳情入口；無位移 tap 需開 `TaskDetailsModal`，短滑 pan 才 suppress click-through。
- `src/components/Wbs/KanbanCard.tsx` 與 `src/components/Wbs/KanbanChecklist.tsx` 保留一般 `selectAndOpenTaskDetails()` click-to-details；pan suppression 由 `useTouchTapGuard()` 負責。
- `src/hooks/useMobilePanBroker.ts` 掛在 BoardView scroll surface，手機從 L2+ checklist row 起手可推動 column `scrollTop` 或 board `scrollLeft`。
- `src/components/Wbs/KanbanCard.tsx` 對 checklist row touch event 早退，避免父卡片與子列搶同一手勢。
- `src/components/Wbs/KanbanChecklist.tsx` 移除 touch handler 內的 `stopPropagation()`，讓手勢可抵達捲動 surface。
- 看板卡片與 checklist 的隱藏 rename pencil 改為不可見時 `pointer-events: none`，只在 hover / focus-visible 時可操作，避免不可見控制項攔截手機 pan。
- `src/components/TaskWorkbenchPanel.tsx` 對 `未歸位` 與 `所有任務排序` row 套用 `useTouchTapGuard()`，短滑後 suppress compatibility click，避免 row pan 後誤開詳情。
- 2026-07-05 Phase 1B hotfix：手機 `TaskDragHandle` 保留可見把手但停用 dnd-kit touch listener，改為 pan pass-through；把手短滑可移動畫面，把手長按也進入同一個 mobile drag-action mode。
- 2026-07-05 Phase 1B hotfix：`touchcancel` 改為純取消不提交，並補 `pointercancel`、visibility、blur、pagehide、`Escape` 與 timeout hard-cancel，避免真機長按模式卡住。
- 2026-07-05 Phase 1B hotfix：mobile drag-action mode 補 edge auto-scroll；拖曳靠近 board 右邊緣會自動增加 `scrollLeft`，靠近 column 底部會自動增加 `scrollTop`。
- `scripts/verify-dev-029-mobile-pan-first-interactions.mjs` 補強 static gate，檢查 mobile tap-to-details、pan suppression、task workbench row touch tap guard、compact action rail、手機把手 pass-through 與 hard-cancel 退出路徑。

## 執行項目

| Gate | Result | Evidence |
|---|---|---|
| `npm.cmd run verify:dev-029-mobile-pan-first-interactions` | Pass, 32/32 | static gate 覆蓋 touch tap guard、mobile tap-to-details、L2+ pan broker、hidden control hit-test、workbench row guard、compact action rail、手機把手 pass-through、hard-cancel 退出路徑 |
| `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` | Pass | wrapper exit code 0 |
| Fixed-session browser matrix | Pass | 新增覆蓋手機拖曳把手短滑 pan、父/子任務把手長按、drag-action 右邊緣 / 底部邊緣 auto-scroll、`touchcancel` 退出不卡死 |
| `npm.cmd run verify:dev-028-cross-mode-task-interactions` | Pass, 35/35 | desktop/cross-mode contract static regression |
| `npm.cmd run verify:dev-039-task-workbench-placement-lanes` | Pass, 22/22 | task workbench placement/static regression |
| `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` | Pass | task workbench browser regression |
| `npm.cmd exec tsc -- --noEmit` | Pass | no TypeScript output, exit code 0 |
| `npm.cmd run build:test` | Pass | Vite test build completed |
| `git diff --check` | Pass with CRLF warnings only | no whitespace error |

## Browser Matrix Evidence

固定 session: `dev029-l2-scroll-clean`

Summary:
- `ok`: `true`
- `pass`: `25`
- `fail`: `0`

Key cases:
- `QA-029-B07`: L2+ checklist row vertical pan moved column `scrollTop` from 0 to 38。
- `QA-029-B08`: L2+ checklist row horizontal pan moved board `scrollLeft` from 0 to 120。
- `QA-029-D01`: mobile quick tap opens the tapped task's `TaskDetailsModal`。
- `QA-029-E05`: hidden rename pencil `opacity=0`、`pointer-events=none`，且 hit-test 不落在控制項。
- `QA-029-B06`: workbench row pan suppresses task actions，Pass。
- `QA-029-D03`: desktop mouse click still opens `TaskDetailsModal`，clicked `qc-card-1` and modal `data-task-id=qc-card-1`。
- `QA-029-C01` / `QA-029-C02`: card / checklist row long press opens top text compact action rail。
- `QA-029-B09`: mobile drag handle short pan moves board `scrollLeft`。
- `QA-029-C09` / `QA-029-C10`: parent / checklist drag handle long press uses mobile action mode。
- `QA-029-C11`: `touchcancel` exits mobile drag-action mode and removes rail / preview。
- `QA-029-C12`: drag-action near right viewport edge auto-scrolls board horizontally。
- `QA-029-C13`: drag-action near bottom column edge auto-scrolls column vertically。
- `QA-029-F02`: card main surface and mobile drag handle `touch-action=pan-x pan-y`；drag handle has `data-mobile-pan-pass-through="true"` and `data-mobile-drag-disabled="true"`。

Screenshots:
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783180293462-A01-loaded.png`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783180293462-C01-long-press-card.png`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783180293462-C02-long-press-child.png`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783180293462-D03-desktop-details.png`

Visible Error Sweep:
- `.inline-error` / `[role=alert]`: none.
- Visible HTTP 4xx/5xx / Not Found / Internal Server Error / `/api/`: none.
- Console errors: 0.
- Console warnings: calendar fallback warnings only, unrelated to DEV-029.

## 殘留風險

- H01-H04 真機 iOS Safari / Android Chrome 手指慣性、速度變化、長按手感、軟鍵盤影響尚未執行；若要宣告完整 physical-phone UX，需要真機錄影或等效裝置證據。
- Production deploy 未執行，也未授權。
- 手機非 board modes Phase 2 未授權。
- Mobile tap-to-details 恢復仍是 Blocked Human Re-entry。
