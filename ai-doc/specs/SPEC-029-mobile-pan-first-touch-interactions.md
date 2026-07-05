# SPEC-029: 手機 Pan-First 觸控手勢仲裁

狀態: Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed
對應 DEV: DEV-029
節點類型: 交付點
是否計入產品交付完成: 是，限手機看板主要操作可用性
建立日期: 2026-07-04

## Human Decision Brief

來源:
- 使用者指出手機模式下移動畫面只能按任務卡縫隙，不好用。
- 使用者提出方向：「短按所有畫面都可以移動，長按才觸發其他功能」。
- HCS `#批判 #演算法 #最佳化` 判斷：方向正確，但需精準化為「短滑 / 移動優先」而不是「短按即移動」。

已確認決策:
- 手機主要手勢改為 pan-first：使用者在任務卡、欄位、清單列、空白處短滑時，優先移動畫面。
- 手機無位移 tap 仍開啟對應任務詳情；pan-first 只攔截發生位移的 click-through。
- 長按才觸發任務功能：長按任務卡 / 任務列才允許任務操作選單、拖曳或其他 secondary action。
- 表單、按鈕、輸入框、popover、modal、日期/依賴/負責人等互動控制為例外，不得被 pan-first 攔截。
- DEV-028 的「右鍵 / 長按開任務操作選單」仍有效；本 DEV 只改手機短滑與 tap/click-through 仲裁。

AI assumptions:
- 目前手機導覽只 exposes board mode；Phase 1 聚焦 BoardView / KanbanCard / KanbanChecklist / task workbench 相關可見面。
- 若未來重新開放手機 list / mindmap / gantt / calendar 模式，需套用同一手勢仲裁，不得回到 click-first。
- `touchmove` 位移超過 8-10px 即視為 pan；長按門檻採 450-550ms，實作可依既有 `useLongPress` / dnd-kit TouchSensor 調整，但不可造成短滑誤開詳情。

Rejected options:
- 不採「短按一下就移動畫面」：沒有方向與距離，會造成使用者困惑。
- 不採「任務卡維持 click-first、只在卡片縫隙 pan」：這正是目前痛點。
- 不採「完全取消長按任務功能」：會破壞 DEV-028 的右鍵 / 長按任務選單契約。

Re-entry triggers:
- 要取消或重新定義手機單 tap 開詳情，需重新確認，因為真機回饋已明確要求保留任務詳情入口。
- 要讓手機支援拖曳排序取代 pan-first，需重新確認，因為會增加誤拖風險。
- 要恢復手機非 board modes，需確認各模式是否同樣採用本手勢仲裁。

## UX Intent

手機上第一任務是瀏覽與定位。使用者不應為了移動畫面而找卡片縫隙，也不應因短滑任務卡而誤開詳情或拖曳。無位移 tap 仍是開啟任務詳情的主要入口；長按則進入任務操作選單，讓 pan 成為手機的安全預設。

成功狀態:
- 在 390x844 手機 viewport，使用者可從任務卡、子任務列、欄位與空白處直接拖動畫面。
- 短滑後不得開 `TaskDetailsModal`、context menu、rename input 或 drag preview。
- 無位移 tap task card / checklist row 仍開啟對應 `TaskDetailsModal`。
- 靜止長按任務可開任務操作選單或既有長按任務功能。
- 點擊按鈕、輸入框、日期、依賴、負責人、filter popover 等互動控制仍能正常操作。

## Scope

Phase 1 scope:
- BoardView mobile pan-first 手勢仲裁。
- KanbanCard、KanbanChecklist、column surface、board scroll surface、task workbench mobile overlay 的 pan-safe 行為。
- 統一或擴充 `useTouchTapGuard` / `useLongPress` / CSS `touch-action` 合約。
- 更新 DEV-029 static/browser verifier，覆蓋「任務卡上短滑可 pan 且不開詳情」。
- 更新 DEV-028 相容註記，保留長按任務操作選單。

Out of scope:
- 不改桌機 click-to-details 契約。
- 不取消 DEV-028 的右鍵 / 長按任務操作選單。
- 不在本輪重開手機 list / mindmap / gantt / calendar 模式。
- 不新增資料庫 schema、migration、RLS、RPC 或 production deploy。
- 不重做 TaskDetailsModal、看板卡片資訊架構或任務拖曳資料模型。

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

2026-07-04 Phase 1 implementation result:
- 2026-07-04 真機回饋後修正：手機 pan-first 不等於取消任務詳情入口；無位移 tap 需開 `TaskDetailsModal`，短滑 pan 才 suppress click-through。
- `TaskWorkbenchPanel` task rows 套用 `useTouchTapGuard()`，短滑後 suppress compatibility click，修正 row pan 後誤開詳情。
- `BoardView` 掛載 `useMobilePanBroker()`，讓手機從 L2+ checklist row 起手時可直接推動 column `scrollTop` 或 board `scrollLeft`。
- `KanbanCard` 父卡片忽略來自 checklist row 的 touch handlers，避免父子任務搶同一手勢。
- `KanbanChecklist` 不再用 touch `stopPropagation()` 阻斷捲動鏈路。
- 隱藏 rename pencil 改為不可見時 `pointer-events: none`，且只在 hover / focus-visible 時恢復可操作，避免不可見控制項吃掉手機 pan。
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
   - long press 可開任務操作選單；若某模式有明確拖曳把手，拖曳仍限 explicit handle 或既有安全流程。

4. `touchend` / compatibility click
   - 若本輪曾 pan，必須阻止後續 click-through。
   - 若本輪沒有 pan 且沒有 long press，手機 task card 普通 tap 應開啟對應 `TaskDetailsModal`，保留任務的主要入口。
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
  - 若拖曳仍需要長按，必須和 context menu 長按互斥，不能同一長按同時開 menu 與開始 drag。

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
| 手機任務拖曳排序全面重設計 | New DEV | Backlog after DEV-029 Phase 1 | 使用者要求手機拖曳排序優先於 pan |
| Production deploy | Blocked Human Re-entry | deployment-release-gate | 使用者明確授權部署 |
| DB / schema / RLS / migration | No Tracking | None | 本需求為前端手勢，不涉及資料層 |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| DEV-029 Phase 1 | Authorized by user 2026-07-04 | Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed | Board mobile pan-first gesture arbitration | Non-board mobile modes, production deploy, DB changes | 使用者確認 pan-first 方向並要求 Dev PM 指揮 RD 修正到 QA 通過 | 任務卡/子任務/欄位/空白短滑可 pan；長按才任務功能；interactive controls 可用 | DEV-029 static/browser, DEV-028 regression, DEV-039 workbench mobile regression, TS, build:test, QC-DEV-029 |
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
