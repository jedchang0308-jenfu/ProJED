# SPEC-058 跨裝置拖曳原地文字欄位藍色回饋

狀態：RD Rework 2 Complete / Local Automated + Visual Verification Passed / User Revalidation Pending / Not Deployed
關聯 DEV：DEV-058、DEV-055、DEV-054、DEV-053、DEV-046
QA 計畫：`ai-doc/qa/QA-DEV-058-desktop-drag-origin-insertion-feedback.md`
風險等級：Medium（核心拖曳視覺狀態；資料行為不得變更）
來源：2026-08-03 使用者指出桌面拖曳停留原地時沒有插入線，希望補足 `#非語言溝通`。Attempt 1 使用較粗插入線雖通過自動化，但使用者實際操作後認為不夠直覺看出「原地」，要求改為原地文字欄位塗藍色；桌面版本通過本機驗證後，使用者再要求同樣設計套用手機模式。

## 1. 問題與目標

DEV-055 會在游標回到來源任務範圍時以 `collision:source-block` 回傳無落點，避免來源或 descendant 無效目標 fallback 到上一層卡片。這個資料與安全行為正確，但因 live target preview 為 `null`，畫面沒有任何原地回饋。

DEV-058 的目標是在桌面滑鼠與手機長按拖曳的來源範圍，把原始任務標題欄位填成藍底白字，讓使用者不需額外文案即可理解「放開後留在原位」。

## 2. Spec Impact

分類：對 DEV-055、DEV-054 為 `Compatible exception`；對 DEV-058 Attempt 1 粗插入線視覺及 Rework 1 的 mobile exclusion 為 `Intentional replacement`。

- 保留 DEV-055 任一時間只有一條 fixed overlay marker。
- 保留 `collision:source-block` 與 `over === null` 的 no-op 行為。
- 保留既有 before / after / append resolver、commit revalidation、undo 與正常插入線樣式。
- 原地藍色文字欄位是 no-op feedback，不是 source placeholder 內的 live target，也不會進入 normal flow。
- 手機只增加來源範圍的 origin/no-op 視覺；DEV-054 的 raw finger、innermost ownership、target stability、release freshness、action rail priority 與 zero-write 契約不得變更。

## 3. UX Contract

1. 桌面滑鼠拖曳或手機長按拖曳啟動且 pointer 仍在來源任務範圍時，在原始標題位置顯示同標題的藍底白字欄位。
2. 原地欄位沿用既有 `bg-blue-500`、`text-white`、`task-title-text` 與小圓角語言；不新增說明文字、圖示或新的色彩系統。
3. 桌面原地欄位保留 `data-desktop-origin-field="true"`、`data-desktop-drop-origin="true"`、`data-desktop-drop-noop="true"`、`data-desktop-drop-position="origin"`；手機使用對應的 `data-mobile-origin-field="true"`、`data-mobile-drop-origin="true"`、`data-mobile-drop-noop="true"`。
4. 游標移到有效新落點時，原地藍色欄位消失並由既有一般插入線取代；畫面不得同時出現兩種回饋。
5. 游標回到來源範圍時，一般落點線清除並恢復原地藍色標題欄位。
6. 來源放開、取消或拖曳結束後，overlay 立即清除。
7. 手機 action rail 命中優先於 origin field；進入 action rail、其他有效 task target 或無效區時，來源藍色欄位必須清除。

## 4. Implementation Contract

- 共用既有 `.task-title-text` primary geometry 與 `taskDragSourceKindToSurfaceKind()` 計算原始標題欄位位置；若 source placeholder 已隱藏 title DOM，只能使用各既有 task surface 的 title padding 作 bounded fallback。
- `BoardView.tsx` 保存滑鼠 activator 座標與來源 rect，以 `onDragMove` 的 delta 判斷目前是否在來源範圍。
- `desktopDropPreview` 優先於 origin indicator；render 仍只有一個 `data-desktop-drop-indicator="true"` wrapper。
- wrapper 繼續使用 `fixed z-[86]`；一般插入線保留 `-translate-y-1/2`，原地欄位依 title rect 直接定位，不得插入 card / checklist normal flow，也不得使 sibling 位移。
- `KanbanInsertionMarker` 恢復既有單一樣式，只用於正常新落點；原地狀態不得再渲染 insertion marker。
- 手機 `resolveTaskDragObservation()` 在 action rail / add-task guard 後，使用目前 source placeholder rect 判斷 origin；回傳仍為 `targetKind: none`，不得進入 task commit。
- `TaskDragPresenter` 只在 `phase: dragging` 且 observation 帶有 origin field rect 時渲染同款 fixed overlay title field；手機一般 target 仍使用既有 `KanbanInsertionMarker`。
- keyboard drag、Workbench unplaced source 與不支援 canonical task surface 的來源不顯示 origin title field。

## 5. Acceptance Criteria

- 來源範圍內恰有一個 origin/no-op fixed overlay title field，文字等於來源任務標題。
- origin field 使用既有 `bg-blue-500`、`text-white` token，computed background 不透明且文字為白色；可見 insertion marker 數為 0。
- 移往其他有效落點後只顯示既有一般 marker，origin field 數為 0。
- 回到來源放開後 nodes snapshot 完全不變，origin field 清除。
- source placeholder 內可見 marker / origin field 數均為 0，任務與 sibling geometry 不因 overlay 改變。
- 8px mouse threshold、click、right-click、blank canvas pan、commit / undo 與手機拖曳無回歸。
- 手機 checklist、card、column 三種來源在 origin 範圍只顯示一個藍色 title field、無 insertion marker；原地 release nodes snapshot 零變更。
- 手機離開來源到正常 target 時只顯示既有 insertion marker，返回來源時恢復藍色 title field；preview 仍維持既有 finger anchor 與各 source 幾何，action rail 仍有最高優先權。

## 6. Out of Scope

- 不把來源位置改成可提交 target。
- 不新增「原地」提示文案、動畫、聲音或新的設計語言。
- 不調整拖曳 preview 偏移、正常落點 resolver、target stability、task data model、DB/schema/Auth。
- 不進行正式環境部署；部署需另走 release gate。

## 7. Verification History

- Attempt 1：粗插入線版本 DEV-055 browser B01-B16 16/16 與工程 gates 通過，但使用者於 2026-08-03 實際操作後判定不夠直覺；該視覺證據只保留為被取代歷史，不得作為 Rework 1 完成證據。
- RD Rework 1：原地文字欄位改為完整可用寬度的 `bg-blue-500` 藍底白字欄位；checklist、card、column 三種來源均在原始標題位置顯示，且原地放開維持 zero-write。
- RD Rework 2：桌面與手機共用 `TaskOriginTitleField` 與 title geometry；手機 checklist、card、column 來源在 origin 範圍回傳 `targetKind: none` 並顯示單一 fixed-overlay 藍底白字欄位，未改 canonical commit path。
- Static：DEV-058 26/26、DEV-055 27/27、DEV-046 31/31、DEV-053 30/30、DEV-054 37/37 全數通過；ESLint quiet 與 TypeScript `--noEmit` 通過。
- Browser：DEV-054 R01-R11 11/11、DEV-055 B01-B16 16/16、DEV-053 10/10 與 DEV-046 全表面回歸通過；origin、正常 target、返回 origin、action rail priority、release zero-write、cleanup 及 console/network error sweep 均通過。
- Viewport / Visual：320x844、390x844、430x932 無水平 overflow；最新手機證據為 `output/playwright/dev-054-mobile-drag-1785738932208-B10-no-parent-fallthrough.png`、`output/playwright/dev-054-mobile-drag-1785738932208-B11-card-origin-blue-title-field.png`、`output/playwright/dev-054-mobile-drag-1785738932208-B11-column-origin-blue-title-field.png`，桌面證據為 `output/playwright/dev-055-desktop-drag-1785738565773-B07-origin-blue-title-field.png`。人工截圖檢查未見欄位裁切、normal-flow 位移或意外重疊。
- Build：production Vite build 至全新 `output/build-dev058-mobile-origin-20260803` 通過；目前仍待使用者在 `4173` 實際操作確認，未執行 production deploy。
