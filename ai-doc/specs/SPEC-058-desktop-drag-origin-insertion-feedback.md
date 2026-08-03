# SPEC-058 桌面拖曳原地粗插入線回饋

狀態：RD Complete / Local Automated Verification Passed / Not Deployed
關聯 DEV：DEV-058、DEV-055、DEV-053、DEV-046
QA 計畫：`ai-doc/qa/QA-DEV-058-desktop-drag-origin-insertion-feedback.md`
風險等級：Medium（核心拖曳視覺狀態；資料行為不得變更）
來源：2026-08-03 使用者指出桌面拖曳停留原地時沒有插入線，希望以較粗插入線補足 `#非語言溝通`。

## 1. 問題與目標

DEV-055 會在游標回到來源任務範圍時以 `collision:source-block` 回傳無落點，避免來源或 descendant 無效目標 fallback 到上一層卡片。這個資料與安全行為正確，但因 live target preview 為 `null`，畫面沒有任何原地回饋。

DEV-058 的目標是在桌面滑鼠拖曳的來源範圍顯示一條明確但不會提交的原地插入線，讓使用者不需文字即可理解「放開後留在原位」。

## 2. Spec Impact

分類：`Compatible exception`。

- 保留 DEV-055 任一時間只有一條 fixed overlay marker。
- 保留 `collision:source-block` 與 `over === null` 的 no-op 行為。
- 保留既有 before / after / append resolver、commit revalidation、undo 與正常插入線樣式。
- 來源 marker 是 no-op feedback，不是 source placeholder 內的 live target，也不會進入 normal flow。
- 不變更 DEV-054 手機 drag session、touch lifecycle 或 action rail。

## 3. UX Contract

1. 桌面滑鼠拖曳啟動且游標仍在來源任務範圍時，顯示一條原地插入線。
2. 原地線沿用既有 `KanbanInsertionMarker`、`bg-primary`、圓點與陰影；只提高 bar / dot 厚度，不新增文字、圖示或新色彩。
3. 原地線必須有可測試語意：`data-desktop-drop-origin="true"`、`data-desktop-drop-noop="true"`、`data-desktop-drop-position="origin"`。
4. 游標移到有效新落點時，原地線消失並由既有一般插入線取代；畫面不得同時出現兩條線。
5. 游標回到來源範圍時，一般落點線清除並恢復原地粗線。
6. 來源放開、取消或拖曳結束後，overlay 立即清除。

## 4. Implementation Contract

- `desktopTaskDropPreview.ts` 以既有 `getIndicatorRect()` 與 `taskDragSourceKindToSurfaceKind()` 計算來源位置，不建立第二套幾何規則。
- `BoardView.tsx` 保存滑鼠 activator 座標與來源 rect，以 `onDragMove` 的 delta 判斷目前是否在來源範圍。
- `desktopDropPreview` 優先於 origin indicator；render 仍只有一個 `data-desktop-drop-indicator="true"` wrapper。
- wrapper 繼續使用 `fixed z-[86] -translate-y-1/2`，不得插入 card / checklist normal flow，也不得使 sibling 位移。
- `KanbanInsertionMarker` 可新增 `emphasized` variant；未啟用時 class 與既有一般 marker 必須不變。
- keyboard drag、Workbench unplaced source 與 mobile drag 不顯示本次 origin marker。

## 5. Acceptance Criteria

- 來源範圍內恰有一條 origin/no-op fixed overlay marker。
- origin bar 高度大於一般 target bar，且兩者 computed background color 相同。
- 移往其他有效落點後只顯示既有一般 marker。
- 回到來源放開後 nodes snapshot 完全不變，marker 清除。
- source placeholder 內可見 marker 數為 0，任務與 sibling geometry 不因 marker 改變。
- 8px mouse threshold、click、right-click、blank canvas pan、commit / undo 與手機拖曳無回歸。

## 6. Out of Scope

- 不把來源位置改成可提交 target。
- 不新增提示文案、動畫、聲音或新的設計語言。
- 不調整拖曳 overlay 偏移、碰撞 resolver、task data model、DB/schema/Auth。
- 不進行正式環境部署；部署需另走 release gate。

## 7. Local Verification Record

- DEV-058 static：19/19 Pass。
- DEV-055 static：27/27 Pass；DEV-046 / 053 / 054 static：31/31、30/30、34/34 Pass。
- DEV-055 browser：B01-B16 16/16 Pass，實際執行於 `http://127.0.0.1:4174`。
- B07：normal bar 6px、origin bar 8px；兩者 computed background color 均為 `rgb(99, 102, 241)`。
- B07：checklist row、card、column header 三種來源皆為 `origin + noop + strong`，來源放開 zero-write。
- B15：L3+ sibling top/bottom delta 皆為 0，sortable transform 為 `none`。
- TypeScript、ESLint 與 Vite production build（1970 modules）Pass。
- 截圖：`output/playwright/dev-055-desktop-drag-1785730332191-B07-origin-noop-marker.png`。
