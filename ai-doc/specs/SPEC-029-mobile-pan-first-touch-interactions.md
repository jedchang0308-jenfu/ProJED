# SPEC-029: 手機 Pan-First 觸控手勢仲裁

狀態: Phase 1 + Phase 1B Implemented / Local Automated QA Passed / Production Not Deployed
對應 DEV: DEV-029
節點類型: 交付點
是否計入產品交付完成: 是，限手機看板主要操作可用性
建立日期: 2026-07-04

## DEV-051 Compatibility Addendum（2026-07-16）

- `SPEC-051` 只接管手機任務完成 long-press lift、進入 drag-action 後的看板 task-position 解析。
- 本 SPEC 的 short pan、quick tap details、450–550ms long-press entry、compact action rail、edge auto-scroll 與 cancel／blur／visibility／Escape safety 全部保留。
- 跨父層的 750ms 計時只能在 lift 後 hover 不同 parent 時開始；不得與 long-press entry 計時合併。
- Action rail target 優先於 task-position target；執行 action 時不得同時提交任務移動。
- DEV-051 已完成本機實作與 QA/QC；本 SPEC 的 pan-first、quick tap、long-press entry、action rail 與 cancel safety browser regression passed，production／physical phone supplemental 未執行。

## Human Decision Brief

來源:
- 使用者指出手機模式下移動畫面只能按任務卡縫隙，不好用。
- 使用者提出方向：「短按所有畫面都可以移動，長按才觸發其他功能」。
- HCS `#批判 #演算法 #最佳化` 判斷：方向正確，但需精準化為「短滑 / 移動優先」而不是「短按即移動」。
- 2026-07-05 使用者要求：手機版右鍵清單刪除多數桌機功能，只保留精簡；長按任務時同時出現操作清單與任務拖曳模式，任務可拖曳排序，也可拖到操作選項選擇功能。
- 2026-07-05 HCS 引導決策採 `1B 2B 3A`：手機長按清單保留「標示完成 / 取消完成、新增同階任務、新增下層任務、刪除任務」；長按後任務浮起並顯示精簡操作區；低風險功能可 drop 觸發，刪除必須二次確認。

已確認決策:
- 手機主要手勢改為 pan-first：使用者在任務卡、欄位、清單列、空白處短滑時，優先移動畫面。
- 手機無位移 tap 仍開啟對應任務詳情；pan-first 只攔截發生位移的 click-through。
- 長按才觸發任務功能：長按任務卡 / 任務列才允許任務操作選單、拖曳或其他 secondary action。
- 表單、按鈕、輸入框、popover、modal、日期/依賴/負責人等互動控制為例外，不得被 pan-first 攔截。
- DEV-028 的「右鍵 / 長按開任務操作選單」仍有效；本 DEV 只改手機短滑與 tap/click-through 仲裁。
- 2026-07-05 addendum：本次只改手機模式，電腦版右鍵選單、桌機 click-to-details、桌機拖曳與桌機快捷鍵完全不改。
- 手機長按任務不再顯示完整桌機型右鍵清單，改為 compact action rail / compact action sheet。
- 手機 compact action rail 放在 viewport 上方，且以文字標籤呈現 action；只保留：標示完成 / 取消完成、新增同階任務、新增下層任務、刪除任務。
- 手機 compact action rail 移除：更多詳細選項、重新命名、指派人、複製任務、設定依賴關係、往上一階、往下一階，以及其他桌機低頻或高風險項。
- 長按任務 450-550ms 且位移低於 tolerance 後，進入 mobile drag-action mode：任務浮起，可拖曳到其他任務位置排序，同時顯示 compact action rail。
- 拖到任務位置時顯示插入線，放開後執行排序 / 移動。
- 拖到「標示完成 / 取消完成」、「新增同階任務」、「新增下層任務」可直接執行。
- 拖到「刪除任務」只能開刪除確認，不得直接刪除。

AI assumptions:
- 目前手機導覽只 exposes board mode；Phase 1 聚焦 BoardView / KanbanCard / KanbanChecklist / task workbench 相關可見面。
- 若未來重新開放手機 list / mindmap / gantt / calendar 模式，需套用同一手勢仲裁，不得回到 click-first。
- `touchmove` 位移超過 8-10px 即視為 pan；長按門檻採 450-550ms，實作可依既有 `useLongPress` / dnd-kit TouchSensor 調整，但不可造成短滑誤開詳情。
- Compact action rail 的按鈕可保留點擊操作作為無障礙與低精度拖曳 fallback；但主要新增語意是「長按後拖到任務位置排序，或拖到安全操作選項執行」。
- 「新增同階 / 新增下層」的 drop 結果需沿用既有任務建立流程；若需要立即命名，需遵守 DEV-028 2026-07-05 addendum，導向任務詳情頁 title edit，不得開外層 rename input。

Rejected options:
- 不採「短按一下就移動畫面」：沒有方向與距離，會造成使用者困惑。
- 不採「任務卡維持 click-first、只在卡片縫隙 pan」：這正是目前痛點。
- 不採「完全取消長按任務功能」：會破壞 DEV-028 的右鍵 / 長按任務選單契約。
- 不採「手機完整沿用桌機右鍵清單」：手機螢幕空間與手指精度不足，會造成誤觸與長清單遮擋。
- 不採「所有操作選項都可 drop 直接執行」：刪除、指派、依賴、複製、改名、升降階風險或語意複雜度過高。
- 不採「拖到刪除就直接刪」：刪除需二次確認，避免長按拖曳誤刪。

Re-entry triggers:
- 要取消或重新定義手機單 tap 開詳情，需重新確認，因為真機回饋已明確要求保留任務詳情入口。
- 要讓手機拖曳排序取代 pan-first，需重新確認；Phase 1B 只能在「長按後」進入拖曳排序，短滑仍由 pan-first 優先。
- 要讓手機 compact action rail 加回改名、指派、依賴、複製、升降階或更多詳細選項，需重新確認，因為使用者已指定手機版保留精簡。
- 要讓刪除可由 drop 直接刪除而不確認，需重新確認。
- 要修改電腦版右鍵清單或桌機任務操作，需重新確認；本 addendum 明確只改手機模式。
- 要恢復手機非 board modes，需確認各模式是否同樣採用本手勢仲裁。

## UX Intent

手機上第一任務是瀏覽與定位。使用者不應為了移動畫面而找卡片縫隙，也不應因短滑任務卡而誤開詳情或拖曳。無位移 tap 仍是開啟任務詳情的主要入口；長按則進入任務操作選單，讓 pan 成為手機的安全預設。

成功狀態:
- 在 390x844 手機 viewport，使用者可從任務卡、子任務列、欄位與空白處直接拖動畫面。
- 短滑後不得開 `TaskDetailsModal`、context menu、rename input 或 drag preview。
- 無位移 tap task card / checklist row 仍開啟對應 `TaskDetailsModal`。
- 靜止長按任務進入 mobile drag-action mode：任務浮起、compact action rail 顯示、可拖曳排序或拖到安全操作選項。
- 手機 compact action rail 只顯示完成/取消完成、新增同階、新增下層、刪除；不顯示桌機完整右鍵選單。
- 拖到刪除只開確認，不直接刪除。
- 點擊按鈕、輸入框、日期、依賴、負責人、filter popover 等互動控制仍能正常操作。

## Scope

Phase 1 scope:
- BoardView mobile pan-first 手勢仲裁。
- KanbanCard、KanbanChecklist、column surface、board scroll surface、task workbench mobile overlay 的 pan-safe 行為。
- 統一或擴充 `useTouchTapGuard` / `useLongPress` / CSS `touch-action` 合約。
- 更新 DEV-029 static/browser verifier，覆蓋「任務卡上短滑可 pan 且不開詳情」。
- 更新 DEV-028 相容註記，保留長按任務操作選單。

Phase 1B scope:
- 僅手機 / coarse pointer board mode 與 mobile task workbench task rows。
- 手機任務長按清單改為 compact action rail，刪除桌機型低頻或高風險功能。
- 長按任務後進入單一 mobile drag-action mode：任務浮起、顯示 compact action rail、可拖曳到任務位置排序。
- Compact action rail drop targets:
  - 標示完成 / 取消完成：可 drop 直接切換。
  - 新增同階任務：可 drop 直接建立同階任務。
  - 新增下層任務：可 drop 直接建立子任務。
  - 刪除任務：drop 後開刪除確認，不直接刪除。
- 更新 DEV-029 static/browser verifier 與 QA matrix，覆蓋 compact action rail、drag-action mode、drop target 與桌機不變 regression。

Out of scope:
- 不改桌機 click-to-details 契約。
- 不改桌機右鍵選單、桌機拖曳排序、桌機快捷鍵或桌機 task context menu。
- 不取消 DEV-028 的右鍵 / 長按任務操作選單。
- 不在本輪重開手機 list / mindmap / gantt / calendar 模式。
- 不新增資料庫 schema、migration、RLS、RPC 或 production deploy。
- 不重做 TaskDetailsModal、看板卡片資訊架構或任務拖曳資料模型。
- 不把手機 compact action rail 擴回完整桌機選單。
- 不讓 drop 到刪除直接刪除。
- 不在手機長按清單保留改名、指派人、複製任務、依賴、升階或降階。

## Current Architecture

既有可用基礎:
- `src/hooks/useTouchTapGuard.ts`：已能在 touchmove 超過 threshold 後 suppress compatibility click。
- `src/hooks/useLongPress.ts`：已用 long press delay / tolerance 判斷長按。
- `src/index.css`：已有 `.mobile-pan-surface`、`.mobile-pan-item`、`.mobile-pan-rail`、`.task-drag-hitbox` 與 `touch-action` 規則。
- `scripts/verify-dev-029-mobile-pan-first-interactions.mjs`：已有 DEV-029 static gate，檢查 pan utilities、tap guard 與 board-only mobile contract。
- `scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js`：已有 coarse pointer mobile smoke，確認 pan 後不開詳情、tap 仍開詳情。

原始現況缺口:
- 使用者實際回報手機仍需找任務卡縫隙才能移動畫面，表示目前 pan-first contract 沒有覆蓋所有可見 task/card surface，或 dnd/click handler 仍在卡片主要區域攔截 pan。
- 舊 browser verifier 只驗證「短滑不開詳情」，未驗證 L2+ 子任務列起手後實際 `scrollTop` / `scrollLeft` 位移。
- 2026-07-05 使用者截圖顯示手機長按清單仍像桌機右鍵選單，功能過多，包含更多詳細選項、重新命名、指派、複製、依賴、升降階等；手機需要改為 compact action rail。
- 既有長按流程若只開 context menu、不進入 drag-action mode，無法達成「長按任務同時可拖曳排序與拖到操作選項」的 Trello-like 手感。

2026-07-04 Phase 1 implementation result:
- 2026-07-04 真機回饋後修正：手機 pan-first 不等於取消任務詳情入口；無位移 tap 需開 `TaskDetailsModal`，短滑 pan 才 suppress click-through。
- `TaskWorkbenchPanel` task rows 套用 `useTouchTapGuard()`，短滑後 suppress compatibility click，修正 row pan 後誤開詳情。
- `BoardView` 掛載 `useMobilePanBroker()`，讓手機從 L2+ checklist row 起手時可直接推動 column `scrollTop` 或 board `scrollLeft`。
- `KanbanCard` 父卡片忽略來自 checklist row 的 touch handlers，避免父子任務搶同一手勢。
- `KanbanChecklist` 不再用 touch `stopPropagation()` 阻斷捲動鏈路。
- DEV-028 detail-only title edit addendum 後，外層 rename control 已移除；手機 hit-test 驗證改為確認無外層 rename control/input/menu，且 tap title 仍開任務詳情。
- DEV-029 static/browser verifiers 已補上 mobile tap-to-details、pan suppression、L2+ scroll displacement 與 workbench row pan case。

## Gesture Algorithm

手機 / coarse pointer 下，觸控事件需依序判斷:

1. `touchstart` / `pointerdown`
   - 記錄起點、時間、target 與是否為 interactive target。
   - interactive target 包含 `input`、`textarea`、`select`、`button`、`a`、`[role=button]`、日期/依賴/負責人控制、popover/modal 內控制、drag explicit handle。

2. `touchmove` / `pointermove`
   - 若位移超過 8-10px，立即判定為 pan。
   - pan 狀態必須 suppress click、context menu、long press timer、drag activation 與 details open。
   - pan 應由最近的 scrollable/pan surface 接管，不要求使用者按空白縫隙。

3. `long press`
   - 若 450-550ms 內位移仍小於 tolerance，且 target 是 task-like surface，才觸發 long press action。
   - Phase 1 行為：long press 可開任務操作選單或既有 long press action。
   - Phase 1B 行為：手機 task-like surface long press 進入單一 mobile drag-action mode，任務浮起並顯示 compact action rail；這不是桌機完整 context menu，也不是和 drag 競爭的第二套 handler。
   - 進入 drag-action mode 後，若移動到任務列表位置，顯示插入線；若移動到 compact action rail option，顯示 option hover/active target。

4. `touchend` / compatibility click
   - 若本輪曾 pan，必須阻止後續 click-through。
   - 若本輪沒有 pan 且沒有 long press，手機 task card 普通 tap 應開啟對應 `TaskDetailsModal`，保留任務的主要入口。
   - 若本輪處於 drag-action mode，touchend/drop 應根據目前 hover target 決定：
     - 任務位置：commit reorder / move。
     - 完成 / 取消完成：commit status toggle。
     - 新增同階：commit create sibling task。
     - 新增下層：commit create child task。
     - 刪除：開 delete confirmation；不得直接刪除。
     - 無有效 hover target：取消 drag-action mode，不開詳情、不開桌機完整 menu。
   - interactive target 例外，仍執行原本 click/tap 行為。

## Implementation Contract

RD 應優先採用集中式手勢仲裁，而不是在每個卡片上堆疊例外:

- 擴充 `useTouchTapGuard` 或新增 `useMobilePanFirstGesture`，輸出:
  - `handlers`
  - `isPanning`
  - `shouldSuppressTap`
  - `isLongPressEligible`
  - `markInteractiveTarget`
- 將 pan-first guard 套到:
  - `KanbanCard`
  - `KanbanChecklist`
  - `KanbanColumn`
  - BoardView mobile scroll surface
  - TaskWorkbenchPanel mobile overlay 中的 task rows
- 保留 explicit interactive controls:
  - `TaskDragHandle` / `.task-drag-hitbox`
  - buttons / inputs / selects
  - filter popover controls
  - task details modal controls
  - date / dependency / assignee / tag controls
- CSS:
  - task/card mobile main surface 應允許 `touch-action: pan-x pan-y` 或等效。
  - explicit drag handle 才使用 `touch-action: none`。
- dnd-kit:
  - mobile drag activation 不得比 pan 判定更早搶走主卡面。
  - Phase 1B 的長按拖曳與 compact action rail 必須由同一個 mobile drag-action state machine 管理；不得同時啟動桌機 context menu handler 與獨立 dnd handler 造成兩套 overlay 競爭。
  - 長按前的短滑仍必須先由 pan-first 判定；不得為了拖曳排序而讓主卡面短滑變成 drag。
  - Drop target hit testing 需區分 task insertion target 與 action rail target；delete target 只進 confirmation。

## RD Handoff Contract

### Phase 1: Board Mobile Pan-First

Document status: Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed

Scope:
- 手機 BoardView 所有可見任務卡、子任務列、欄位與空白處短滑可移動畫面。
- 長按任務卡 / 任務列觸發任務操作選單或既有 long press flow。
- 普通短滑不得開任務詳情、rename、context menu 或 drag。
- interactive controls 不被攔截。

Implementation touchpoints:
- `src/hooks/useTouchTapGuard.ts`
- `src/hooks/useLongPress.ts`
- `src/hooks/useDragSensors.ts`
- `src/components/BoardView.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/TaskWorkbenchPanel.tsx`
- `src/index.css`
- `scripts/verify-dev-029-mobile-pan-first-interactions.mjs`
- `scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js`

Acceptance:
- 在 task card body 上 dispatch touchstart/touchmove/touchend 後，`TaskDetailsModal` 不出現。
- 在 checklist task row 上 dispatch pan gesture 後，`TaskDetailsModal` 不出現。
- 在 L2+ checklist row 上垂直 pan 後，column `scrollTop` 有可觀察變化。
- 在 L2+ checklist row 上水平 pan 後，board `scrollLeft` 有可觀察變化。
- 長按 task card 觸發任務操作選單或既有 long press action。
- 點擊 filter button、input、add task、date/dependency/assignee controls 不被 pan guard 阻擋。
- 手機 viewport 無水平 overflow、modal/tooltip/popover 不被誤觸發。

QA/QC gate:
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`

QC evidence（2026-07-04）:
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions` passed，27/27。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` passed。
- Fixed Playwright session `dev029-l2-scroll-clean` browser matrix passed，25/25；`QA-029-B07` L2+ vertical pan `scrollTop: 0 -> 38`，`QA-029-B08` L2+ horizontal pan `scrollLeft: 0 -> 120`，`QA-029-D01` mobile quick tap 開啟正確 `TaskDetailsModal`，`QA-029-B06` workbench row pan 不誤開詳情，`QA-029-D03` desktop click-to-details 保留。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions` passed，35/35。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes` passed，22/22。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` passed。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build:test` passed。
- QC report: `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md`。

Stop conditions:
- 短滑任務卡仍會開詳情。
- 只有卡片縫隙可 pan，任務卡主體不可 pan。
- 長按任務功能消失，破壞 DEV-028。
- interactive controls 被 pan guard 擋住。
- dnd-kit 在短滑時先搶走 touch，導致畫面不能移動。

### Phase 1B: Mobile Compact Action Rail + Long-Press Drag-Action Mode

Document status: Implemented / Local Automated QA Passed / Production Not Deployed

Scope:
- 僅手機 / coarse pointer 下的 BoardView、KanbanCard、KanbanChecklist 與 TaskWorkbenchPanel mobile task rows。
- 長按任務後進入 mobile drag-action mode：任務浮起、compact action rail 顯示、可拖曳排序。
- Compact action rail 只保留四種功能：
  - 標示完成 / 取消完成。
  - 新增同階任務。
  - 新增下層任務。
  - 刪除任務。
- Drag target 行為：
  - 任務位置 target：顯示插入線，drop 後排序 / 移動。
  - 完成 / 取消完成 target：drop 後切換狀態。
  - 新增同階 target：drop 後建立同階任務。
  - 新增下層 target：drop 後建立子任務。
  - 刪除 target：drop 後開刪除確認，不直接刪除。
- Compact action rail options 可保留 tap fallback；tap delete 也必須開確認。
- 電腦版完全不改。

Out of scope:
- 不改桌機右鍵清單、桌機 context menu、桌機快捷鍵、桌機拖曳排序或桌機 click-to-details。
- 不在手機 compact action rail 保留更多詳細選項、重新命名、指派人、複製任務、依賴、升降階。
- 不讓刪除任務由 drop 或 tap 直接刪除。
- 不改任務資料模型、WBS move schema、權限、RLS、migration、RPC 或 production deploy。
- 不重做 `TaskDetailsModal` 或改名流程；改名仍依 DEV-028 addendum 走詳情頁 title edit。
- 不重開手機 list / mindmap / gantt / calendar。

Implementation touchpoints:
- `src/hooks/useTouchTapGuard.ts`
- `src/hooks/useLongPress.ts`
- `src/hooks/useDragSensors.ts`
- `src/components/BoardView.tsx`
- `src/components/Wbs/mobileTaskActionContext.ts`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/TaskWorkbenchPanel.tsx`
- `src/components/GlobalContextMenu.tsx` or equivalent context menu routing
- New or existing mobile-only component: `MobileTaskActionRail` / equivalent
- `src/index.css`
- DEV-029 static/browser verifiers

Implementation contract:
- Use one mobile drag-action state machine for long-press lift, compact action rail, insertion preview and drop target resolution.
- Keep pan-first priority before long-press activation: movement > 8-10px before 450-550ms cancels long-press and allows pan.
- Keep quick tap semantics: no movement + no long press opens `TaskDetailsModal`.
- Do not render desktop context menu on mobile long press for task-like surfaces after Phase 1B.
- Render compact action rail at the top of the mobile viewport in a viewport-safe position; each action must have visible text, not icon-only controls.
- Use stable data attributes for verifier:
  - `data-mobile-task-action-rail`
  - `data-mobile-task-action="toggle-complete"`
  - `data-mobile-task-action="add-sibling"`
  - `data-mobile-task-action="add-child"`
  - `data-mobile-task-action="delete"`
  - `data-mobile-drag-preview`
  - `data-mobile-drop-target`
- Drop target resolution priority: action rail target wins only when pointer is inside action option bounds; otherwise task insertion target wins.
- Status toggle must be idempotent for current task status.
- Add sibling / add child must avoid duplicate creation on repeated `touchend` / pointerup.
- Delete target must open existing delete confirmation or equivalent modal; actual deletion only after confirmation.
- If drop target action fails, show visible error and keep original task order / status unchanged.

Acceptance:
- 390x844 mobile long press on parent card shows top compact action rail with readable text labels, exactly the four allowed actions and no removed actions.
- 390x844 mobile long press on L2+ checklist row shows the same compact action rail.
- Long press causes the task to visually lift / enter drag-action mode.
- Dragging lifted task to another task position shows insertion line and drop commits reorder / move.
- Dragging lifted task to complete target toggles completion.
- Dragging lifted task to add sibling target creates a sibling task.
- Dragging lifted task to add child target creates a child task.
- Dragging lifted task to delete target opens confirmation and does not delete before confirmation.
- Short pan on task card / checklist row still pans and does not show action rail or drag preview.
- Short pan starting on the visible task drag handle still pans the board/column in mobile mode and must not start dnd-kit TouchSensor drag.
- While mobile drag-action mode is active, dragging the lifted task near the board left/right viewport edge must auto-scroll the board horizontally; dragging near the active column top/bottom edge must auto-scroll the column vertically.
- `touchcancel`, `pointercancel`, window blur/pagehide, hidden tab, `Escape`, or fail-safe timeout exits mobile drag-action mode without committing a drop/action.
- Quick tap task still opens `TaskDetailsModal`.
- Desktop 1440x900 right-click / context menu remains unchanged.
- Mobile viewport has no horizontal overflow, clipped action rail, invisible drop targets or visible runtime error.

QA/QC gate:
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`

2026-07-05 implementation result:
- 新增 `MobileTaskActionContext` 與 mobile-only action mode gate：僅 768px 以下且 coarse/touch pointer 啟用。
- `BoardView` 實作單一 mobile drag-action state：長按浮起、頂部文字 compact action rail、drop indicator、task-position reorder / move、完成狀態切換、新增同階、新增下層、刪除確認。
- `KanbanCard`、`KanbanChecklist`、`TaskWorkbenchPanel` 手機長按改走 compact action rail；桌機 `onContextMenu` 保留原路徑。
- 手機 task workbench rows 在 mobile action mode 下停用整列 dnd-kit listener，避免 250ms TouchSensor 搶走 500ms 長按。
- 手機 `TaskDragHandle` 保留可見把手，但停用 dnd-kit listener、改為 mobile pan pass-through；把手長按也走同一個 mobile drag-action state machine。
- `BoardView` mobile drag-action state machine 補 edge auto-scroll loop：pointer 靠近 board 左右邊緣時水平捲動，靠近 column 上下邊緣時垂直捲動，捲動後重新 resolve hover / drop indicator。
- Drag-action mode 使用常駐 non-passive window touch listener；只有 active action mode 才 `preventDefault`，短滑 pan-first 不被改動。
- Drop 結束若 `touchend` 座標不可靠，沿用最後有效 hover target，避免真機 / Playwright 在 action rail 或 insertion target 上放開時丟失 target；`touchcancel` 只取消不提交。
- 新增 `pointercancel`、visibility、blur、pagehide、`Escape` 與 timeout hard-cancel，避免真機長按模式卡住。
- 新增 test-mode diagnostic `window.__projedMobileTaskActionDebug`，僅 `import.meta.env.MODE === 'test'` 下存在，供 verifier 失敗時輸出 action/drop 內部原因。
- 新增 test-mode diagnostic `window.__projedMobilePanDebug`，僅 `import.meta.env.MODE === 'test'` 下存在，供 verifier 失敗時輸出 pan broker 內部原因。

2026-07-05 automated evidence:
- `npx tsc --noEmit` passed。
- `npm run verify:dev-029-mobile-pan-first-interactions` passed，32/32。
- `npm run verify:dev-029-mobile-pan-first-interactions-browser` passed；覆蓋 mobile pan-first、父卡/子任務/工作台長按頂部文字 action rail、compact 4 actions、手機拖曳把手短滑 pan、拖曳把手長按進入 mobile action mode、drag-action right-edge horizontal auto-scroll、bottom-edge vertical auto-scroll、`touchcancel` 退出不卡死、任務位置 drop reorder、delete confirmation、add child opens new task details、complete toggle、quick tap details、desktop click regression。
- `npm run build:test` passed；PWA test artifact generated。
- Physical-phone supplemental H01-H04 未執行；不得宣稱真機手感最終簽核。

Evidence required:
- Static verifier evidence that mobile compact action rail excludes removed actions and desktop context menu code path remains intact.
- Browser evidence for mobile long press parent card and checklist row.
- Browser evidence for reorder insertion preview and at least one successful reorder / move.
- Browser evidence for toggle complete, add sibling, add child, delete confirmation.
- Negative evidence that short pan does not open action rail or drag preview.
- Desktop screenshot / trace proving desktop context menu is unchanged.
- 390x844 screenshot proving action rail viewport safety.

Stop conditions:
- Any desktop behavior changes.
- Mobile long press still opens full desktop context menu.
- Mobile compact action rail includes removed actions.
- Short pan triggers drag-action mode or action rail.
- Dragging to delete deletes without confirmation.
- Drop action causes duplicate task creation, wrong task update, lost order, or hidden failure.
- Implementation requires schema / migration / production deploy.

### Phase 2: Future Mobile Non-Board Modes

Document status: RD Contract Ready / Not Authorized

Scope:
- 若未來手機重新開放 list / mindmap / gantt / calendar，套用同一 pan-first 手勢仲裁。
- 各模式需保留自己的長按 / drag / zoom / schedule semantics，但短滑任務 surface 不得誤開詳情。

Out of scope:
- 本輪不重新開放非 board mobile modes。
- 不重寫 mindmap zoom/pan 或 gantt schedule drag。

Entry condition:
- 產品重新開放手機非 board mode，或使用者明確要求 mobile list/mindmap/gantt/calendar 可操作。

Acceptance:
- 每個手機模式都有 pan-first browser verifier。
- 模式專屬操作與 pan 不互相誤觸。
- 不破壞 DEV-027/028 已有模式契約。

Evidence:
- Mode-specific mobile screenshots。
- Browser gesture traces for pan, long press, explicit controls。
- DEV-027 / DEV-028 regression gates。

## Deferred Scope Audit

| Deferred / Out-of-scope item | Classification | Tracking target | Resume condition |
|---|---|---|---|
| 手機非 board modes pan-first | Same Spec Phase | Phase 2 | 重新開放 mobile list / mindmap / gantt / calendar |
| Mobile tap-to-details 恢復 | No Tracking | DEV-029 Phase 1 | 已依 2026-07-04 真機回饋恢復；後續若要再次取消或重定義，需重新授權 |
| 手機任務長按拖曳排序與 compact action rail | Same Spec Phase | Phase 1B | 2026-07-05 已授權並完成本機自動化驗證；production / physical-phone supplemental 仍需另行 gate |
| 手機完整桌機型右鍵清單 | No Tracking | None | 已被 2026-07-05 決策拒絕，手機只保留 compact action rail |
| 手機 drop 到刪除直接刪除 | No Tracking | None | 已被 2026-07-05 決策拒絕，刪除需二次確認 |
| 手機加回改名 / 指派 / 複製 / 依賴 / 升降階 | Blocked Human Re-entry | Separate decision | 使用者明確要求重新擴充手機操作清單 |
| Production deploy | Blocked Human Re-entry | deployment-release-gate | 使用者明確授權部署 |
| DB / schema / RLS / migration | No Tracking | None | 本需求為前端手勢，不涉及資料層 |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| DEV-029 Phase 1 | Authorized by user 2026-07-04 | Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed | Board mobile pan-first gesture arbitration | Non-board mobile modes, production deploy, DB changes | 使用者確認 pan-first 方向並要求 Dev PM 指揮 RD 修正到 QA 通過 | 任務卡/子任務/欄位/空白短滑可 pan；長按才任務功能；interactive controls 可用 | DEV-029 static/browser, DEV-028 regression, DEV-039 workbench mobile regression, TS, build:test, QC-DEV-029 |
| DEV-029 Phase 1B | Authorized / Complete | Implemented / Local Automated QA Passed / Production Not Deployed | Mobile compact action rail and long-press drag-action mode for board/task workbench task surfaces | Desktop behavior, full mobile desktop-style menu, direct-delete drop, DB changes, production deploy | 使用者以 HCS `1B 2B 3A` 確認並授權 RD 開發 | 手機長按任務浮起並顯示四項 compact action rail；可拖曳排序；低風險 drop target 可執行；刪除只開確認；短滑與 quick tap 不破壞 | DEV-029 static/browser passed, TS, build:test, mobile screenshots |
| DEV-029 Phase 2 | Not Authorized | RD Contract Ready / Not Authorized | Future mobile non-board modes pan-first normalization | Reopen non-board modes in this phase | 手機非 board mode 重新開放 | 各模式 pan-first 且不破壞模式專屬操作 | mode-specific browser verifiers, DEV-027/028 regression |
| Production Release Gate | Not Authorized | Blocked Human Re-entry | 正式環境發布與 smoke | 未授權部署 | 使用者明確部署授權 | production smoke + rollback readiness | deployment-release-gate |

## Cross-Spec Consistency

Authoritative rule:
- DEV-028 仍治理 cross-mode 任務操作契約。
- DEV-029 治理手機 coarse pointer 手勢仲裁。
- 若兩者衝突，手機短滑 / pan 安全由 DEV-029 優先；長按任務操作選單仍由 DEV-028 保留。

Compatible exception:
- DEV-028 的「單擊任務開詳情」在手機無位移 tap 下仍保留；只有發生 pan movement 時才由 DEV-029 suppress click-through，避免滑動誤開詳情。

ADR decision:
- 不建 ADR。此決策是局部、可逆的前端手勢仲裁，不改資料模型、權限、狀態機或 release gate。
