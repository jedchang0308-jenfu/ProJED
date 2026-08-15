# SPEC-068：任務完整預選範圍停留移入子任務

狀態：Implemented / AI Browser QA-QC Passed / Physical Mobile 未充分驗證 / 未 Release

日期：2026-08-15

優先級：P1

風險：Medium-to-High（階層 parent/order、桌機與手機手勢、既有同階排序相容性）

父任務：DEV-053、DEV-054、DEV-055、DEV-058、DEV-065、DEV-067

來源 ID：`USER-20260815-TASK-TITLE-CENTER-CHILD-DROP`

QA：`ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md`

QC：`ai-doc/qc/QC-DEV-068-task-title-center-child-drop.md`

## 1. 最終使用者決策

子任務定位範圍不是標題文字寬度，也不是標題尾端或舊卡片底部透明追加區。L1、L2、L3+ 一律重用 DEV-065 的完整任務滑鼠預選範圍：主任務表面加目前可見的子樹範圍，也就是使用者畫面中的完整藍框。

本節是 `Intentional replacement`，取代本文件先前的 shrink-wrapped title `SPAN`、title center、44px title halo、標題尾端空白負向等契約。檔名保留 legacy 名稱以維持既有連結，內容以本版為準。

操作結果：

- 來源進入有效目標的完整預選範圍即成為 `child-candidate`。
- 同一來源、同一目標連續停留滿 1,000ms 才成為 `child-armed`。
- `child-armed` 顯示父任務框、可見子樹框及「下一子階」插入線；插入線起點依實際階層右移，只有放開才移入。
- 滑到內層任務時，最深、面積較小的 innermost scope 接管；父框不得搶走子框。
- 展開鍵、連結、輸入框、文字區域、選單與其他內部控制項不建立 child intent；任務主表面即使為了可及性帶 `role="button"`，仍是有效藍框範圍。
- 拖曳中的來源任務固定在 pointer／finger 上方，優先右側 16px，空間不足時左側或 viewport clamp，不得遮住 parent frame 或 child insertion marker。

## 2. 與既有排序的相容規則

整個藍框同時也是既有 sortable/lane surface，因此採「候選共存、鎖定接管」：

| 階段 | 子任務回饋 | 既有排序回饋 | 放開結果 |
|---|---|---|---|
| `<1,000ms` candidate | DEV-065 同款藍框；無 child insertion marker | 保留既有 standard insertion marker | 執行當下既有同階／lane／promotion 動作，不得改成 child |
| `>=1,000ms` armed | parent source frame、subtree frame、下一子階 insertion marker | standard insertion marker 清除 | `parentId = exact target.id`，一次提交 |
| 離開／切換目標 | 舊 candidate/armed 立即清除並重算 | 依目前落點恢復 | 不得提交 stale child target |
| 無效 self／descendant／archived／missing target | 不得 armed | 同一危險點不得被重新解讀為繞過 cycle guard 的排序 | zero-write |

此相容規則保留 DEV-053／054／055／067 的同階排序、L1 promotion、column/root drop 與 action rail 肌肉記憶；只有完成 1 秒鎖定後才由 DEV-068 獨占 release。

## 3. 命中幾何

### 3.1 L1

- 命中 scope：`data-desktop-task-hover-scope="true"` 的完整 column scope。
- primary frame：column header。
- subtree frame：column 內目前可見卡片群組。
- armed 時可額外顯示完整 column 外框，以對齊 DEV-065 的 column 視覺語意。

### 3.2 L2

- 命中 scope：卡片最外層 task scope，包含 primary card 與目前可見 checklist subtree。
- primary frame：DEV-065 `primary-500` 2px inset source frame。
- subtree frame：DEV-065 `primary-400` 1px inset group frame。

### 3.3 L3+

- 命中 scope：recursive checklist task scope，包含該列與目前可見 descendants。
- 指標落在 descendant scope 時，依 DOM depth 優先選最內層；同 depth 才以面積與距離決勝。

### 3.4 控制項排除

- 排除：`button`、`a`、`input`、`textarea`、`select`、非 task-source 的 `[role="button"]`、`[data-task-primary-action="true"]`。
- 判斷以控制項實際 `getBoundingClientRect()` 為準，避免 fixed drag overlay 蓋住底層控制時 `elementFromPoint()` 誤判。
- `[data-task-surface-source="true"]` 是完整任務主表面，不因 `role="button"` 被排除。

## 4. 狀態與提交

| 狀態 | 條件 | Store 寫入 |
|---|---|---|
| `dragging` | 桌機超過既有 8px threshold；手機完成 long-press drag-action | 無 |
| `child-candidate` | 進入有效完整 hover scope，未滿 1,000ms | 無 child write；標準 drop 仍可 release |
| `child-armed` | exact target 連續滿 1,000ms | 無，僅預覽 |
| `committed` | armed 畫面已呈現且 release revalidation 通過 | 一次 child move，可 undo/redo |
| `cancelled` | Escape、pointer/touch cancel、blur、pagehide、visibility hidden、resize/orientation、失效目標 | 無 |

- dwell 不含 mouse drag threshold 或 mobile long-press 啟動時間。
- target 改變、離開所有 task scopes、auto-scroll/reflow 後 target 改變，timer 立即重設。
- release 必須重讀 permission、source/target existence、archived、board/workspace、cycle、最新 geometry 與 canonical append order。
- L1/group source 移入非 root target 時正規化為 `nodeType: task`，完整非封存子樹隨來源移動。
- 成功只建立一次 batch/undo command；不得同一 release 同時執行 standard drop 與 child move。

## 5. 預覽契約

- Candidate 與 armed 的 target frame 沿用 DEV-065 視覺語言，不新增另一套顏色：
  - primary source：`ring-2 ring-inset ring-primary-500 bg-primary-50/60`
  - visible subtree：`ring-1 ring-inset ring-primary-400`
- Candidate 可與既有 insertion marker 共存，用來表達「現在放開走原操作，繼續停留可進子階」。
- Armed 必須清除原 standard insertion marker，改在 exact target 子樹末端顯示唯一 child insertion marker；沿用 `KanbanInsertionMarker` 的圓點＋線條，起點與下一層任務內容對齊，L2／L3／L4+ 必須逐層右移。
- Armed 不顯示常駐「移入…的子任務」文字框；視覺以框形、圓點、線條與縮排位置表意，輔助科技仍由 `aria-live` 宣告 exact parent，避免只靠顏色。
- 全部 child preview 為 fixed overlay，不得改 normal-flow geometry、column width、scrollHeight 或 board scrollWidth。
- 同一時間只允許一個 exact child target；離開後立即清除，不得 stale re-arm。
- `aria-live` candidate/armed 與成功 announcement 必須能辨識 exact target。

## 6. Desktop / Mobile

### Desktop

- 保留 click-to-details、right-click、8px threshold、origin field、blank-canvas pan、依賴／紀錄選取抑制。
- Candidate 前 1 秒保留 dnd-kit standard indicator；armed 後 child preview 接管。
- pointer source overlay 優先右上 16px，右側不足時左上，8px viewport clamp。

### Mobile

- quick tap 開詳情、short pan 捲動畫面、long-press 才開始拖曳。
- raw finger 決定 exact innermost task scope；不再建立 title-only 44px halo。
- Candidate 前 1 秒保留原 mobile position target；armed 後才使用 `task-title-child`。
- action rail 永遠高於 child candidate/armed；進入 rail 立即清 child timer。
- edge auto-scroll、rotation、resize、background、touchcancel 後不得保留舊 target 或卡住下一次手勢。

## 7. 退役與保留

- 退役 L2 卡片底部透明 `wbs-checklist-drop` child append 入口。
- 保留 `column-drop`、`root-drop` 與一般 before/after；candidate 未 armed 時可正常提交。
- 不恢復 DEV-051 750ms parent-lock 或 DEV-052 架構。
- 不修改 schema、RLS、API、permission model 或 production data。

## 8. 驗收

- L1/L2/L3+ marker 均掛在 DEV-065 完整 hover scope，而非 title span。
- hit-scope rect 包住 primary 與可見 subtree；長中文、長英文、未命名、標題尾端空白與主表面其他空白都可候選。
- exact innermost ownership、控制項排除、999/1000ms、target switch、armed leave、cancel/stale target、cycle、permission、undo/redo 全部通過。
- Candidate 保留一個 standard indicator、child insertion marker 為 0；armed 時 standard indicator 為 0、child insertion marker 恰為 1。
- L1→L2、L2→L3、L3+→下一層的 child insertion 起點必須單調右移，且線條落在 exact target 子樹末端，不得顯示在父層或兄弟層起點。
- DEV-065 的 primary-500／primary-400 樣式與 hover 行為不回歸。
- 五個 viewport：1440x900、1024x768、390x844、430x932、320x844 無 overflow 或不可讀遮擋。
- Physical iPhone Safari 與 Android Chrome 仍是完整 mobile sign-off 的必要 gate；synthetic touch 不取代實機。

## 9. 實作與證據

主要檔案：

- `src/components/BoardView.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/taskDrag/taskChildDropTarget.ts`
- `src/components/Wbs/taskDrag/TaskChildDropPreview.tsx`
- `src/components/Wbs/taskDrag/taskDragTargetAdapter.ts`
- `src/components/Wbs/taskDrag/useTaskDragSession.ts`

已執行核心證據：

- `verify:dev-068-task-title-center-child-drop`：61/61。
- `verify:dev-068-task-title-center-child-drop-browser`：27/27 rendered mouse/touch；新增 L2／L3／L4+ insertion-start 單調右移 gate。
- 最新核心 screenshot prefix：`output/playwright/dev-068-title-child-drop-1786808137276-*`。
- QA 曾先後攔下 title-only scope、控制項候選殘留、task-source `role="button"` 過度排除、candidate 搶走 standard drop及Workbench來源誤入child intent；均回送 RD 修正後才採信最終結果。
- Physical iPhone／Android：未執行。
- 本輪未 push、deploy 或 release。
