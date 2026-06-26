# SPEC-034: 手機看板全區拖移改善

狀態：Implemented / Browser QC Passed
節點類型：交付點
關聯 DEV：DEV-029 / DEV-031 / DEV-028
建立日期：2026-06-26

## Problem

手機目前維持只開放看板模式，但使用者在看板模式下實測發現「點住移動」可用範圍太小。既有 DEV-029 已建立 mobile pan-first 基礎契約，能驗證滑動卡片後不誤開任務詳情；但它沒有驗證「從卡片、下層任務、欄位內容、欄位空白處與看板空白處拖移時，畫面真的會跟著移動」。

真正問題不是開放更多手機模式，而是看板同時存在外層水平捲動與欄位內垂直捲動，且卡片、下層任務、長按選單、點擊開詳情與輸入欄位都在競爭同一組 touch gesture。

## Scope

- 手機 / coarse pointer 下的看板模式。
- 看板主要內容區的單指拖移：
  - 看板空白處水平拖移。
  - 欄位空白處垂直拖移。
  - 任務卡片表面水平拖移。
  - 下層任務列水平 / 垂直拖移。
- 保留手機只顯示看板模式，不開放清單、心智圖、甘特、日曆或紀錄庫。
- 升級既有 DEV-029 static / browser verifier，使其驗證實際 scroll displacement，不只驗證「不誤開詳情」。

## Out of Scope

- 不改資料 schema、store、權限、後端 API 或 migration。
- 不改任務拖曳排序 / 跨欄移動語意。
- 不把 top nav、分享按鈕、filter、modal、popover、日期 / 依賴控制、任務拖曳把手變成拖移熱區；欄位底部新增任務 input / button 是例外，短點仍 focus / submit，拖移超過門檻時可捲動畫面。
- 不處理非看板模式的手機操作。
- 不調整 DEV-031 mobile density 版面密度，除非驗證指出新 pan 行為造成 viewport 缺陷。

## UX Intent

- 使用者：手機上查看與整理看板任務的 ProJED 使用者。
- 使用情境：手機窄 viewport 下，要快速左右查看欄位、上下查看欄位內卡片，不想精準找小型空白區才能拖動畫面。
- 使用者心智模型：看板內容像一張可移動的大畫布，手指按住內容拖動時畫面應跟著移動；短點任務才是開詳情。
- 主要任務：在手機看板中以自然拖移方式瀏覽任務。
- 成功狀態：使用者從卡片、下層任務或欄位空白處拖移，畫面會移動；短點擊仍開任務詳情；控制項仍可操作。
- 最可能誤解點：拖移後誤開詳情、想輸入新增任務卻被拖移攔截、想拖曳任務把手卻變成捲動畫面。
- 不能發生的誤操作：pan gesture 觸發任務詳情、輸入框失焦、拖曳把手失效、依賴日期控制被攔截。

## Implementation Contract

RD 應新增看板專用 mobile drag-scroll hook，掛在 `BoardView` 的外層 `[data-mobile-pan-surface="board"]`。建議檔案為 `src/hooks/useMobileBoardDragScroll.ts`，但可依現有專案慣例調整。

手勢規則：

- 僅在 coarse pointer 或 640px 以下 viewport 啟用。
- 使用 native `touchstart` / `touchmove` / `touchend` / `touchcancel` capture listener，確保即使子任務列呼叫 `stopPropagation()`，外層仍能判斷 pan。
- 只處理單指 touch；多指或 target 不在 board surface 內時忽略。
- 移動超過門檻後才啟動 pan，建議沿用既有 tap guard 的 10px 門檻。
- 啟動後：
  - `board.scrollLeft -= deltaX`。
  - 若 touch target 位於 `[data-mobile-pan-surface="kanban-column"]`，則 `column.scrollTop -= deltaY`。
  - 若欄位沒有可捲動空間，垂直位移不應造成 body 或外層誤捲。
  - active pan 期間呼叫 `preventDefault()`，避免瀏覽器原生 scroll / click 競爭；不要阻斷必要的 child move event，讓既有 long-press guard 可取消長按。
- pan 結束後，抑制下一次 compatibility click，避免滑動後誤開 `TaskDetailsModal`。

排除 target：

- `input`, `textarea`, `select`, `button`, `[contenteditable="true"]`
- `[data-task-drag-handle="true"]`
- `[data-task-interaction-control="true"]`
- `[data-board-share-dialog]`, `[data-task-details-modal="true"]`
- 任何已標示為 modal / popover / dialog 的互動容器。

例外 target：

- 欄位底部新增任務 input / button 可用 `data-mobile-board-pan-allow="true"` 明確放行。短點仍保留 focus / submit；只有移動超過 pan threshold 後才接管為 column scroll 並 suppress compatibility click。

Telemetry：

- 在 board surface 上提供最小 `data-*` 狀態供 verifier 讀取，例如：
  - `data-mobile-board-pan-active`
  - `data-mobile-board-pan-last-target`
  - `data-mobile-board-pan-suppressed-click`
- Telemetry 只用於測試與除錯，不作為使用者可見 UI。

## Acceptance Criteria

- AC-034-001：手機 / coarse pointer 下，ModeSwitcher 仍只顯示看板模式。
- AC-034-002：從任務卡片拖移時，外層 board `scrollLeft` 有可量測變化，且不開任務詳情。
- AC-034-003：從下層任務列拖移時，外層 board 或所在 column `scrollLeft` / `scrollTop` 有可量測變化，且不開任務詳情。
- AC-034-004：從欄位空白處垂直拖移時，該 kanban column `scrollTop` 有可量測變化。
- AC-034-005：從看板空白處水平拖移時，外層 board `scrollLeft` 有可量測變化。
- AC-034-006：短點擊任務卡片與下層任務仍開啟對應 `TaskDetailsModal`。
- AC-034-007：新增任務 input 可 focus / 輸入，不被 pan hook 攔截。
- AC-034-008：從新增任務 input 與新增任務按鈕拖移時，所在 column `scrollTop` 有可量測變化，且短點 input / button 仍保留原互動。
- AC-034-009：拖曳把手仍保留任務移動用途，不被全區 pan 接管。
- AC-034-010：390x844 viewport 無 visible runtime error、重疊、裁切、不可操作或非預期 overflow。

## RD Readiness

- 不需要 ADR：此變更是局部 UI gesture handling，不改資料模型、權限、狀態機、release gate 或跨模組資料契約。
- RD 可直接實作；需先閱讀：
  - `src/components/BoardView.tsx`
  - `src/components/Wbs/KanbanColumn.tsx`
  - `src/components/Wbs/KanbanCard.tsx`
  - `src/components/Wbs/KanbanChecklist.tsx`
  - `src/hooks/useTouchTapGuard.ts`
  - `scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js`
- RD 不得移除既有 `useTouchTapGuard`、`useLongPress` 與 `TaskDragHandle` 的保護語意；新 hook 應與它們共存。

## QA / QC Gates

- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`
- `npm.cmd run verify:dev-031-mobile-density`
- `npm.cmd run verify:dev-031-mobile-density-browser`
- 視影響範圍重跑：
  - `npm.cmd run verify:dev-032-kanban-all-level-task-details-browser`
  - `npm.cmd run verify:dev-033-task-details-title-edit-browser`

## Governance Notes

- Cross-spec check：DEV-034 是 DEV-029 mobile pan-first 契約的補強，與 DEV-031 mobile density 相容；不覆寫 DEV-028 的 click-to-details / explicit rename / drag-handle 契約。
- Authoritative boundary：手機仍只有看板模式，以 `MainLayout` 既有 mobile board-only routing 為準。
- Blockers：無。
- Deferred：非看板模式的手機 pan UX 仍不納入本 DEV。

## Implementation Evidence - 2026-06-26

- RD 已新增 `src/hooks/useMobileBoardDragScroll.ts` 並接入 `src/components/BoardView.tsx`。
- DEV-029 browser verifier 已升級為實際 scroll displacement 驗證，覆蓋卡片、下層任務、欄位空白、看板空白、新增任務 input 與新增任務按鈕。
- QC evidence：`ai-doc/qc/QC-DEV-034-mobile-board-full-surface-pan.md`。
- 已通過：
  - `npm.cmd run verify:dev-029-mobile-pan-first-interactions`
  - `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`
  - `npm.cmd run verify:dev-031-mobile-density-browser`
  - `npm.cmd run build`
