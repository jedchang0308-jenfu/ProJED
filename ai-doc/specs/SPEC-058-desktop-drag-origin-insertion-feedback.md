# SPEC-058 桌面拖曳原地文字欄位藍色回饋

狀態：RD Rework 1 Complete / Local Automated Verification Passed / User Revalidation Pending / Not Deployed
關聯 DEV：DEV-058、DEV-055、DEV-053、DEV-046
QA 計畫：`ai-doc/qa/QA-DEV-058-desktop-drag-origin-insertion-feedback.md`
風險等級：Medium（核心拖曳視覺狀態；資料行為不得變更）
來源：2026-08-03 使用者指出桌面拖曳停留原地時沒有插入線，希望補足 `#非語言溝通`。Attempt 1 使用較粗插入線雖通過自動化，但使用者實際操作後認為不夠直覺看出「原地」，要求改為原地文字欄位塗藍色。

## 1. 問題與目標

DEV-055 會在游標回到來源任務範圍時以 `collision:source-block` 回傳無落點，避免來源或 descendant 無效目標 fallback 到上一層卡片。這個資料與安全行為正確，但因 live target preview 為 `null`，畫面沒有任何原地回饋。

DEV-058 的目標是在桌面滑鼠拖曳的來源範圍，把原始任務標題欄位填成藍底白字，讓使用者不需額外文案即可理解「放開後留在原位」。

## 2. Spec Impact

分類：對 DEV-055 為 `Compatible exception`；對 DEV-058 Attempt 1 粗插入線視覺為 `Intentional replacement`。

- 保留 DEV-055 任一時間只有一條 fixed overlay marker。
- 保留 `collision:source-block` 與 `over === null` 的 no-op 行為。
- 保留既有 before / after / append resolver、commit revalidation、undo 與正常插入線樣式。
- 原地藍色文字欄位是 no-op feedback，不是 source placeholder 內的 live target，也不會進入 normal flow。
- 不變更 DEV-054 手機 drag session、touch lifecycle 或 action rail。

## 3. UX Contract

1. 桌面滑鼠拖曳啟動且游標仍在來源任務範圍時，在原始標題位置顯示同標題的藍底白字欄位。
2. 原地欄位沿用既有 `bg-blue-500`、`text-white`、`task-title-text` 與小圓角語言；不新增說明文字、圖示或新的色彩系統。
3. 原地欄位必須有可測試語意：`data-desktop-origin-field="true"`、`data-desktop-drop-origin="true"`、`data-desktop-drop-noop="true"`、`data-desktop-drop-position="origin"`。
4. 游標移到有效新落點時，原地藍色欄位消失並由既有一般插入線取代；畫面不得同時出現兩種回饋。
5. 游標回到來源範圍時，一般落點線清除並恢復原地藍色標題欄位。
6. 來源放開、取消或拖曳結束後，overlay 立即清除。

## 4. Implementation Contract

- `desktopTaskDropPreview.ts` 以既有 `.task-title-text` primary geometry 與 `taskDragSourceKindToSurfaceKind()` 計算原始標題欄位位置；若 source placeholder 已隱藏 title DOM，只能使用各既有 task surface 的 title padding 作 bounded fallback。
- `BoardView.tsx` 保存滑鼠 activator 座標與來源 rect，以 `onDragMove` 的 delta 判斷目前是否在來源範圍。
- `desktopDropPreview` 優先於 origin indicator；render 仍只有一個 `data-desktop-drop-indicator="true"` wrapper。
- wrapper 繼續使用 `fixed z-[86]`；一般插入線保留 `-translate-y-1/2`，原地欄位依 title rect 直接定位，不得插入 card / checklist normal flow，也不得使 sibling 位移。
- `KanbanInsertionMarker` 恢復既有單一樣式，只用於正常新落點；原地狀態不得再渲染 insertion marker。
- keyboard drag、Workbench unplaced source 與 mobile drag 不顯示本次 origin title field。

## 5. Acceptance Criteria

- 來源範圍內恰有一個 origin/no-op fixed overlay title field，文字等於來源任務標題。
- origin field 使用既有 `bg-blue-500`、`text-white` token，computed background 不透明且文字為白色；可見 insertion marker 數為 0。
- 移往其他有效落點後只顯示既有一般 marker，origin field 數為 0。
- 回到來源放開後 nodes snapshot 完全不變，origin field 清除。
- source placeholder 內可見 marker / origin field 數均為 0，任務與 sibling geometry 不因 overlay 改變。
- 8px mouse threshold、click、right-click、blank canvas pan、commit / undo 與手機拖曳無回歸。

## 6. Out of Scope

- 不把來源位置改成可提交 target。
- 不新增「原地」提示文案、動畫、聲音或新的設計語言。
- 不調整拖曳 overlay 偏移、碰撞 resolver、task data model、DB/schema/Auth。
- 不進行正式環境部署；部署需另走 release gate。

## 7. Verification History

- Attempt 1：粗插入線版本 DEV-055 browser B01-B16 16/16 與工程 gates 通過，但使用者於 2026-08-03 實際操作後判定不夠直覺；該視覺證據只保留為被取代歷史，不得作為 Rework 1 完成證據。
- RD Rework 1：原地文字欄位改為完整可用寬度的 `bg-blue-500` 藍底白字欄位；checklist、card、column 三種來源均在原始標題位置顯示，且原地放開維持 zero-write。
- Static：DEV-058 19/19、DEV-055 27/27、DEV-046 31/31、DEV-053 30/30、DEV-054 34/34 全數通過；ESLint quiet 與 TypeScript `--noEmit` 通過。
- Browser：DEV-055 B01-B16 16/16 通過；B07 驗證三種來源只顯示一個 fixed-overlay origin field、無 insertion marker、標題正確、背景不透明、白字與原地 release zero-write；B15 驗證 L3+ top/bottom delta = 0、parent transform = `none`。
- Visual：`output/playwright/dev-055-desktop-drag-1785735793491-B07-origin-blue-title-field.png`；人工截圖檢查未見欄位裁切、normal-flow 位移或意外重疊。
- Build：production Vite build 至全新 `output/build-dev058-origin-field-20260803` 通過；目前仍待使用者在 `4173` 實際操作確認，未執行 production deploy。
