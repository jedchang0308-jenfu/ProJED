# SPEC-065：任務子樹 hover 與拖曳影響範圍預覽

日期：2026-08-05  
狀態：RD Rework 13 Implemented / Card + List Two-Layer QC Passed  
關聯 DEV：DEV-065、DEV-057、DEV-055、DEV-046、DEV-028  
QA 計畫：`ai-doc/qa/QA-DEV-065-task-subtree-hover-preview.md`

## 1. 問題與目的

目前桌面游標預選框依 DOM 容器大小呈現：L2 卡片會連同下層任務一起被框，L1 與
L3+ 則只框來源列。相同的「拖曳任務」語意因此呈現不同影響範圍，使用者無法在起手前
穩定判斷哪些後代任務會跟著移動。

本 DEV 將 hover 預覽改為拖曳影響範圍預告：來源任務仍是唯一強調焦點，但同一任務的
完整可見子樹使用一個群組範圍框；真正開始拖曳後，再以 canonical 後代數量揭露包含
收合或篩選隱藏的任務。

## 2. Spec Impact

分類：`Intentional replacement`。

- 取代 DEV-057「exact innermost task 只顯示單一任務藍框、父層不得同時亮起」的 hover
  視覺契約。
- 保留 exact innermost **來源 ownership**：游標移到子任務後，來源必須切換為該子任務，
  不得同時把祖先視為來源。
- 群組範圍框只代表「會被連帶移動的後代」，不是多選，也不改變單擊只開來源任務詳情。
- DEV-055 的 drop target、origin no-op、8px threshold、commit／undo 與 cycle guard 不變。

## 3. UX Contract

1. 桌面 fine pointer hover L1、L2、L3+ 任務時，預覽必須涵蓋來源任務及其所有目前可見後代。
2. 來源任務維持 `2px inset` 品牌藍強框；有後代時，群組範圍以較清楚的 `primary-400` 完整 `1px inset` 內框呈現。L2 卡片由最外層卡片 surface 承接來源強框，標題列不另加框；子任務區保留第二層完整群組框，內層 `data-task-card-primary` 僅保留拖放 hit-area。不得對整個子樹或每個子任務加大片底色、巢狀圓角框或第三層 ring。
3. 葉節點只顯示來源強框，不建立空的第二層群組框。
4. 游標由父任務移入子任務時，來源與群組範圍立即切換成該子任務的子樹；祖先與兄弟不得保留來源強框。
5. hover 預覽不得改變列表／卡片標題文字顏色、字重或 cursor；只增加框線與必要的群組範圍訊號。
6. 拖曳開始後停用普通 hover 預覽；DragOverlay 顯示來源名稱，若有後代則同時顯示「含 N 個子任務」。
7. `N` 由 canonical `parentNodesIndex` 計算所有非封存後代，包含畫面因收合或篩選未顯示者。
8. 預覽不得新增常駐數量徽章、改變任務列高度、推動兄弟任務、造成裁切或水平 overflow。
9. 手機 long-press、點擊詳情、右鍵選單、依賴選取、紀錄選取、實際拖曳 commit 與資料模型均不變。

## 4. Implementation Contract

- 建立 cycle-safe canonical descendant collector，供 DragOverlay 與驗證共用。
- L1 column root 與 L3+ recursive wrapper 明確標記 hover scope；L1 的卡片內容區使用 `data-kanban-column-subtree-scope` 承接完整群組框。L2 卡片根容器作為來源 surface，`data-kanban-card-subtree-scope` 承接子任務群組框，`data-task-card-primary` 保留拖放 geometry。
- CSS 只在 `hover:hover`、`pointer:fine` 且沒有 `data-kanban-drag-overlay` 時生效。
- 來源強框與群組內框使用既有 primary brand tokens，不建立新色票；群組不新增 normal-flow 或巢狀 fill/ring。
- 不新增 schema、API、remote write、migration 或 production 操作。

## 5. Acceptance Criteria

- [x] L1 hover：欄位標頭是唯一來源強框，欄位既有外框以 `primary-400` 標示，卡片內容區再以單一完整 `primary-400` 群組框標示所有可見卡片；不對每張卡片追加來源框。
- [x] L2 hover：卡片最外層是唯一品牌藍來源強框，標題列不再有獨立內框；有後代時子任務區同步顯示唯一 `primary-400` 群組框，內層拖放 surface 不繪製 hover 框，子任務 hover 後 L2 兩層訊號均清除。
- [x] L3+ 父任務 hover：來源列為品牌藍強框，完整可見子樹以 `primary-400` `1px inset` 內框標示；後代維持原本背景與圓角，葉節點只有來源強框。
- [x] DragOverlay 的 canonical 後代數量正確，收合後仍不遺漏；leaf 不顯示空數量提示。
- [x] hover／drag 不造成 layout shift、兄弟列位移、裁切、重疊或 document 水平 overflow。
- [x] click、right-click、來源放回 zero-write 與 visible-error regression 通過；commit／undo／mobile 實作路徑未修改，相關 static 契約通過。
- [x] 1440x900 與 1024x768 有實際瀏覽器截圖及 DOM／computed-style 證據。

## 6. Out of Scope

- 不新增多選、框選、批次拖曳或 subtree 展開控制。
- 不變更實際移動資料、跨看板規則、drop target indicator 或手機 action rail。
- 不部署正式環境；release 需另走 release gate。

## 7. Implementation / QC Evidence

- `collectTaskDragDescendantIds()` 以 canonical `parentNodesIndex` cycle-safe 計算所有非封存後代。
- L1／L2／L3+ 都提供明確 hover scope；CSS 使用來源 inset ring、既有 border 與 checklist 完整 inset frame，未加入 normal-flow 幾何或子樹 fill。
- DEV-065 static 27/27、browser QA-065-001～013 13/13、TypeScript、test build 與 targeted ESLint 0 errors 通過。
- DEV-028 45/45、DEV-046 31/31、DEV-055 static 27/27 通過。
- 既有 DEV-055 browser B06 在本工作樹仍有獨立的 checklist drop hit-cache 回歸；移除 DEV-065 容器幾何樣式後可重現，未由本 DEV 擴張修改，詳見 QA 文件。
- 2026-08-05 Annotation 1：使用者回報 card／list 層視覺訊號不夠明顯，故重開 visual QC；原本 `primary-300` source、`primary-200` 1px group 與 `primary-50/30` descendant tint 不再視為足夠。
- 2026-08-05 RD Rework 1：source 升為 `primary-500 / 2px` 與 `primary-100/70`，group 升為 `primary-300 / 2px` 與 `primary-50/80`，descendant 升為 `primary-100/60`；全部維持 inset／background、無 normal-flow 幾何。新 browser 截圖與 computed-style gate 7/7 通過。
- 2026-08-05 使用者續回饋：L2 卡片層沒有獨立框選來源任務。根因為 source preview 與 subtree scope 同在 card root；重開 Rework 2，改為 title primary source＋card root group 的雙層 ownership。
- 2026-08-05 RD Rework 2：`data-desktop-task-hover-preview` 從 card root 移至 `data-task-card-primary`，card root 只保留 subtree scope。QA-065-008 證明 title source primary-500、card group primary-300 同時可見，移入 child 後 L2 兩框清除並正確 handoff；browser 8/8 通過。
- 2026-08-05 使用者續回饋：子任務大片藍底、巢狀圓角框與額外群組 ring 過於複雜；採用方案 A，收斂為「來源深藍框＋既有結構線弱化」，讓拖動影響範圍可辨識但不製造視覺噪音。
- 2026-08-05 RD Rework 3（Scheme A）：來源維持 `primary-500` `2px inset`；column/card 群組只使用既有 border 的 `primary-300`，checklist 只使用 `inset 2px` 左側結構線；移除 descendant fill 與額外 group ring，browser 9/9、static 17/17 通過。
- 2026-08-05 使用者回饋：L3+ 只顯示左側線條，與 L1／L2 的完整拖動範圍語意不一致；重開 Rework 4，改為 checklist 群組完整 `inset 1px` 內框。
- 2026-08-05 RD Rework 4：L3+ checklist 群組改為 `box-shadow: inset 0 0 0 1px var(--color-primary-300)`，保留 source `primary-500` `2px inset`、不改變 normal-flow 幾何；browser 9/9、static 17/17 通過。
- 2026-08-05 使用者續回饋：所有子任務框線仍偏淡；重開 Rework 5，將群組框線從 `primary-300` 提升至 `primary-400`，來源仍保留 `primary-500` 以維持層級差。
- 2026-08-05 RD Rework 5：column/card 群組改用 `border-color: var(--color-primary-400)`，checklist 群組改用 `inset 0 0 0 1px var(--color-primary-400)`；browser 9/9、static 17/17 通過。
- 2026-08-05 使用者回饋：列表 hover 時 UI 不應改變 cursor 或標題文字；移除 column title 的 `hover:text-primary`，並讓 hover preview cursor 維持原值。
- 2026-08-05 RD Rework 6：列表／卡片標題文字顏色與 cursor 加入 computed-style gate；browser 10/10、static 18/18 通過。
- 2026-08-05 使用者回饋：第二張圖出現瀏覽器原生黑色 title tooltip，與其他任務 hover UI 不一致；重開 Rework 7。
- 2026-08-05 RD Rework 7：移除 Kanban card、checklist、column 與 WBS list task title 的原生 `title`，以 `aria-label` 保留可及性名稱；browser 11/11、static 22/22 通過。
- 2026-08-05 使用者回饋：卡片任務名稱不應像獨立列表一樣再套一層內框，應直接連著卡片最外層；重開 Rework 8。
- 2026-08-05 RD Rework 8：L2 將 `data-desktop-task-hover-preview` 移至卡片根 surface，移除標題 primary 內層 hover 框；`data-task-card-primary` 保留拖放 hit-area，子任務 exact ownership、文字／cursor、L3+ 完整群組框與資料互動不變。
- 2026-08-05 使用者修正需求：卡片仍需同時呈現「來源任務層＋子任務層」兩層語意；來源層比照列表直接放在最外層，重開 Rework 9。
- 2026-08-05 RD Rework 9：卡片來源維持最外層 `primary-500` 強框，新增 `data-kanban-card-subtree-scope` 以 `primary-400` `1px inset` 呈現子任務層；來源移入子任務時兩層正確交接，無第三層 nested ring 或大片填色。
- 2026-08-05 RD Rework 10：列表來源 hover 新增 `data-kanban-column-subtree-scope` overlay，讓 L1 欄位在來源標頭強框之外，完整包住所有可見卡片；overlay 不占版面、不改文字／cursor、不改拖曳資料契約。
- 2026-08-05 RD Rework 11：使用者指出卡片來源框仍不夠明顯；L2 exact source card 的最外層 border 明確切換為 `primary-500`，與列表來源同色，保留 outer source + inner descendant group，不新增 title inner frame。
- 2026-08-06 RD Rework 12：使用者提供目標示意，確認來源層應只框卡片標題列；移除卡片根來源 marker，改由 `.kanban-task-title-row` 顯示 `primary-500` source frame，子任務區維持單一 `primary-400` group frame，卡片外殼不再被整張強框。
- 2026-08-06 RD Rework 13：使用者再次確認正確示意為「卡片最外層來源框＋子任務內層框」；撤回 Rework 12 的 title-only marker，來源 marker 放回卡片根容器，標題列不另加框，卡片根 border 與 source ring 使用 `primary-500`，子任務區維持 `primary-400` group frame。
