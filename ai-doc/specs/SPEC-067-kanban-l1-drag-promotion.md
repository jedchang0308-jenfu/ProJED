# SPEC-067：看板任務拖曳升級為 L1 列表

狀態：Implemented / QC PASS / 未 Release

優先級：P1

風險：Medium（核心拖曳 parent/order/nodeType 與桌機／手機共用落點）

父任務：DEV-053、DEV-054、DEV-055、DEV-058

來源 ID：`USER-20260814-KANBAN-L1-DRAG-PROMOTION`

## 1. 問題與目標

目前 L2／L3+ 任務拖到列表標頭或列表內容區，都會成為該列表下的 L2 卡片；使用者無法由看板直接把既有任務升級為 L1 列表。

本 DEV 讓階層落點符合一致心智模型：拖到任務本體代表與目標同階定位，拖到內容／追加區代表成為目標的子項。完成後，L2／L3+ 任務拖到 L1 列表標頭會升級為 L1，並顯示既有單一定位條；拖到列表內容區仍進入該列表。

## 2. Spec Impact

- 對 DEV-054／055「`column-header` 對非 L1 來源仍追加為列表子項」與桌機 commit frozen baseline，分類為 `Intentional replacement`；本輪使用者明示需求是新決策來源。
- 對 DEV-053 的 canonical resolver、at-most-once commit、cycle guard、Workbench placed-row no-drag，分類為 `Compatible exception`，其餘契約不變。
- 對 DEV-058 的來源原地 zero-write、單一 fixed overlay marker 與正常 `KanbanInsertionMarker` 樣式，分類為 `No conflict`。
- 不恢復 DEV-051 parent-lock，不執行 archived DEV-052。

## 3. UX 與行為契約

### 3.1 L1 定位

- L2／L3+ 任務拖到任一 L1 列表標頭：成為該列表的 L1 同階項，插入目標列表之前。
- 任務拖到看板尾端「新增列表」區：成為最後一個 L1 列表。
- 已是 L1 的列表仍可沿用既有列表排序，並可拖到尾端追加區。
- 成為 L1 時 `parentId = null`、`nodeType = 'group'`；來源完整非封存子樹隨來源一起移動。

### 3.2 保留 L2／L3 行為

- 拖到列表內容區 `column-drop`：仍成為該列表的 L2 卡片。
- 拖到卡片本體、卡片子任務追加區或 checklist row：沿用既有 before／after／append 契約。
- 拖回來源範圍放開仍為 zero-write no-op；self、descendant、archived、permission denied 仍不可提交。

### 3.3 定位回饋

- 桌機與手機都重用既有 `KanbanInsertionMarker`，畫面任一時刻最多一個 live target marker。
- 列表標頭與尾端 L1 追加區都必須輸出明確 surface kind，preview 與 commit 共用 `resolveTaskDropIntent()`。
- 定位條只以 fixed overlay 呈現，不得插入 normal flow、推開列表／任務或造成 board width 跳動。
- 不新增常駐教學文字、拖曳把手或第二種定位視覺。

## 4. Implementation Contract

- `TaskDropSurfaceKind` 新增 `root-drop`；desktop dnd type 使用 `wbs-root-drop`。
- `resolveTaskDropIntent()` 對 `column-header` 統一產生與 target 同父層的 reorder intent；非 column source 轉為 `group`。
- `root-drop` 以目前最後一個 L1 作 anchor，產生 `parentId: null`、append order、`displayPosition: append`；若 source 不是 L1，`nodeType` 轉為 `group`。
- 看板尾端新增 child droppable component，包住既有「新增列表」按鈕；沒有 active drag 時 UI、tap 與 pan-pass-through 不變。
- 桌機 `desktopTargetTypeToSurfaceKind()`、collision preference、preview geometry 與 commit revalidation需識別 `wbs-root-drop`。
- 手機 exact innermost hit-test 由尾端 surface 的 `data-mobile-drop-target`／`data-task-id`／`data-task-drop-surface-kind="root-drop"` 進入同一 resolver；raw finger、retain、release freshness 與 action rail priority 不變。

## 5. Scope

### In Scope

- 看板模式 L2／L3+ 升級為 L1。
- 桌機滑鼠與手機長按拖曳的同源語意。
- 既有 L1 排序與尾端追加。
- 靜態、canonical intent、desktop/mobile browser 與三 viewport QC。

### Out of Scope

- WBS 清單、甘特圖、心智圖的全新根層 drop zone。
- DEV-051 停留鎖定、DEV-052 子系統重構。
- 新 schema、migration、production deploy、drag handle 或教學 UI。
- Workbench placed row 拖曳能力。

## 6. Acceptance Criteria

- L2 卡片拖到另一 L1 標頭後：`parentId === null`、`nodeType === 'group'`，且排序位於 target 前。
- L3+ 任務拖到 L1 標頭後得到相同根層結果，完整子樹不遺失。
- 任務拖到尾端 L1 追加區後成為 active board 最後一個 root。
- 任務拖到列表內容區仍是該列表的 L2 子項，不被誤升到 L1。
- indicator 的 `target / position / surfaceKind` 與 release 後 parent/order/nodeType 一致；畫面最多一條 marker。
- 原地 release、invalid descendant、permission denied 與 stale preview 都是 zero-write no-op。
- 桌機 click／right-click／8px threshold、手機 pan-first／action rail／raw finger、Workbench placed-row no-drag 與 undo 無回歸。
- `1440x900`、`1024x768`、`390x844` 無重疊、裁切、非預期 overflow 或 runtime-visible error。

## 7. Stop Conditions

- 需要改變資料 schema、遠端資料、production 或權限模型。
- 必須恢復 DEV-051／052 才能完成。
- 定位條與實際提交結果不一致，或同時出現兩個 live marker。
- 既有列表內容區無法繼續作為 L2 drop target。

## 8. Release Boundary

本輪只授權本機 RD、QA 與 QC；不包含部署、release、遠端資料或正式環境操作。
