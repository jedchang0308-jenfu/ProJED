# SPEC-124：共用桌面任務拖拉核心與模式表面介面

- 文件版本：R14，2026-09-17；armed child持續父任務定位
- 成熟度：`RD Implementation Complete / 架構已定案 / R14 Targeted QA PASS / QC Pending / NOT RELEASED`
- 對應：DEV-124（P1 交付點）；父任務 DEV-116
- 架構決策：[ADR-052](../decisions/ADR-052-shared-desktop-task-drag-surface-adapters.md)
- 驗收權威：[QA-DEV-124](../qa/QA-DEV-124-shared-desktop-task-drag-host.md)
- 相容基準：SPEC-053、SPEC-055、SPEC-058、SPEC-068、SPEC-116、SPEC-119、SPEC-120、SPEC-121
- 需求來源：`USER-20260916-OKR-SHARED-KANBAN-TASK-DRAG`、`USER-20260916-ARCHITECTURE-FREEZE`、
  `USER-20260916-GOAL-INSERTION-LINE-REENTRY`、`USER-20260917-CROSS-MODE-DRAG-BEHAVIOR-PARITY`、
  `USER-20260917-GOAL-DRAG-TREE-PREVIEW`、`USER-20260917-GOAL-ALL-PLACEMENT-TREE-PREVIEW`、
  `USER-20260917-GOAL-DRAG-TREE-PREVIEW-EXCLUSIVITY`、`USER-20260917-GOAL-DRAG-PREVIEW-COMMITTED-TREE-PARITY`、
  `USER-20260917-GOAL-RESTORE-INSERTION-MARKER`、`USER-20260917-GOAL-DRAG-OVERLAY-HALF-SIZE`、
  `USER-20260917-GOAL-EQUIVALENT-BOUNDARY-RIGHT-STYLE`、`USER-20260917-GOAL-TREE-STEM-TOP-DOWN-ONLY`、
  `USER-20260917-GOAL-CHILD-ENTRY-WINDOW-70-CANDIDATE-LOCATION`、
  `USER-20260917-GOAL-ARMED-CHILD-PARENT-LOCATION-PERSIST`
- 風險：Medium；涉及共用互動與多檔回歸，但不改資料模型、權限、正式環境或release。
  核心風險為拖拉顯示與提交分歧、重複寫入、native table幾何位移及看板回歸。
- 規劃基準：branch `持續優化3`、HEAD `7b16ddf6e3af1d3bf26e3267c19de33fe343ecd4`；
  規劃時工作樹已有使用者修改，RD 已保留並以開工 readback 重驗；不得用本文件覆蓋其他 dirty boundary。

## 1. 成功結果與真正問題

使用者在 OKR 任務名稱主表面進行桌機拖拉時，應沿用看板已核准的啟動門檻、來源預覽、原地回饋、
before／after、root、停留後 child append、取消清理與 canonical move／Undo 心智模型；OKR 仍維持原生表格、
`rowSpan`、252px 固定任務欄與單一 X 軸捲動。

真正問題不是 OKR 缺少看板外觀，而是目前有第二套拖拉語意與寫入權威：`GoalView` 自有 `DndContext`、
整列 sortable transform、`closestCorners` 與 `handleDragEnd`，同父層交換兩筆 `order`，跨父層以
`over.order + 0.5` 寫入。它無法保證看板已建立的「畫面顯示意圖 = 放開後 canonical 結果」、at-most-once、
latest-store revalidation、完整 sibling normalization 與單一 Undo。這些是本案需驗證的目標；
R2 已確認 Board 仍有 root reorder 直寫分支，而現有 batch API 並不提供遠端交易完成保證。

因此本案共用的是拖拉生命週期、視覺回饋與提交權威，不是共用卡片或表格 DOM。模式只保留其必要差異：

- Board adapter：水平 L1、卡片／checklist、Workbench／tracking 等既有幾何；特殊提交仍由既有 facade 持有。
- Goal adapter：縱向 DFS table row、固定 task-name lane、visible subtree 與 `rowSpan` 安全 hit-test。
- Shared host：session、pointer、terminal guard、回饋互斥、取消與 release orchestration。
- Canonical intent／commit：同看板 primary move 的 parent、order、nodeType、cycle、latest-store、batch dispatch 與 Undo 入口。

R3 re-entry 的直接症狀是 Goal 拖拉缺少與看板一致、可辨識且精確對應 commit 的插入定位線。source readback 顯示：
`GoalView` 仍以專用 `h-0.5` `<div>` 畫線；`goalDesktopTaskDragAdapter` 以整個 task lane 與單列 bottom
產生 rect；armed child 只改 `data-goal-drag-position`，沒有把線移到下一層縮排與 visible subtree bottom；
exact midpoint 也仍以 `>` 判定 after。這與本規格既有的 shared marker、subtree bottom、next-depth 與 midpoint 契約不一致，
分類為 `Implementation needs correction`，不是新的產品架構。

R5 re-entry是在R4定位線與dwell parity上補強層級可讀性：armed child雖已把marker移至下一深度，尚未把「此落點隸屬哪個父節點」
以Goal既有樹狀語言連接起來。此差距分類為`Compatible exception / additive re-entry`；不改drop intent、commit或Board，
只在Goal adapter／presenter增加同一child feedback內的直系connector。

R6依使用者最新確認，R5「只有armed child顯示connector」不完整：root與任意深度的standard before／after同樣是階層定位，
也必須預覽放開後的樹狀連接。此變更分類為`Intentional replacement`，只取代R5的armed-only呈現條件；shared marker、
dwell、canonical hierarchy、commit、parent／order、Undo、permission與Board行為不變。

R7使用者提供可見失效證據：placement connector出現時，一般hover／focus的active hierarchy guide仍同步變紫，
視覺上形成多組定位線。此差距分類為`Implementation needs correction`；R6已要求每次只有一組connector，
本輪只修正Goal顯示優先權，不改幾何、drag lifecycle、commit或Board。

R8使用者再提供拖曳中／放開後畫面：預覽多出Kanban dot後方長bar，branch endpoint比正式樹線多4px；並明確要求
正式row與preview不要各自維護樹線元件。此變更分類為`Intentional replacement`：Goal仍共用drag presenter作semantic anchor，
但可見feedback改由同一`GoalHierarchyGuides`／segment renderer完整呈現；Board marker與共用互動／提交契約不變。

R9使用者要求在R8單一樹線renderer與title-edge parity基礎上，恢復原本定位插入線。此變更分類為
`Intentional replacement`：只取代R8的Goal marker suppression；Goal重新由shared presenter render `KanbanInsertionMarker`，
同時保留唯一一組`GoalHierarchyGuides`樹狀預覽，且branch endpoint仍為title edge／marker wrapper left。

R10使用者要求拖曳中的Goal浮卡縮小50%。此變更分類為`Implementation needs correction`：本規格既有desktop overlay
scale 0.5契約不變，修正`GoalView`仍使用1.02的實作漂移；不改定位線、樹狀預覽、child dwell、hit-test、pointer定位或commit。

R11使用者指出同一可見兄弟插入邊界會出現兩種樹線方向：命中下一筆上半部時顯示「下一筆之前」的向上stem，命中上一筆
下半部時顯示「上一筆之後」的向下stem。此變更分類為`Intentional replacement`：等價可見邊界一律沿用右圖的「上一筆之後」
預覽幾何；semantic target與orderingPosition不改，避免篩選或隱藏任務下改變canonical排序結果。

R13使用者要求縮小進入子任務的窗口，並在1000ms開始計時的第一個candidate frame就定位目標任務。此變更分類為
`Intentional replacement`：只取代R7「active drag期間完全不投影定位染色」在child candidate階段的部分；一般hover／focus仍抑制。
Goal的child-entry window改為primary task surface中心的寬、高各70%，四邊各留下15% ordering-only guard band；Board既有窗口不變。
candidate只沿用既有parent location色階渲染目標列，不渲染子孫；滿1000ms後移除candidate定位並切換為armed child線。

R14使用者指出進入子任務後父任務不應失去定位渲染。此變更分類為`Intentional replacement`：只取代R13「armed時定位染色清除」
的視覺規則。armed階段清除candidate專用狀態，但保留同一個child-drop target父任務定位投影；每個有效frame恰有一列父任務定位，
子孫、其他任務與一般hover／focus scope維持中性，離開／切換／scroll／cancel／drop／unmount仍清理。

## 2. Human Decision 與 UX Intent

1. `Human Confirmed`：更換 OKR 現行拖拉方式，採用共用看板任務拖拉核心。
2. `Architecture Confirmed`：採共用 host／layer＋mode surface adapters，不把 `KanbanCard`、
   `KanbanChecklist` 或 `KanbanColumn` DOM 搬進 OKR。
3. `Architecture Confirmed`：Goal 不得保留第二套 parent／order commit；兩模式同看板 primary move（含 Board root reorder）
   走共用 resolver／commit。Workbench／tracking／跨看板仍由既有 facade 分流。
4. `Architecture Confirmed`：第一階段只開放桌機 primary mouse；8px 啟動門檻保留。Goal 的 Enter／Space
   仍為 details／既有鍵盤互動，不新增 keyboard drag；coarse pointer／mobile Goal 仍 blocked。
5. `Architecture Confirmed`：拖拉回饋全在 fixed layer；不得插入 table row、移動正常流或讓來源列 sortable transform 位移。
6. `Architecture Confirmed`：同一時間只能顯示 origin、standard marker、child preview 其中一種有效落點訊號。
7. `Architecture Confirmed`：被收合且含隱藏子任務的目標不可 armed child append，避免成功移動後來源立即消失；
   使用者展開後才可 child append。
8. `Architecture Confirmed`：filtered hidden siblings 保留 canonical 相對順序；visible row 只是 anchor，不是完整 sibling truth。
9. `Human Confirmed / Architecture Confirmed`：重開 DEV-124 補齊 Goal 插入定位線；視覺 primitive 共用看板
   `KanbanInsertionMarker`，fixed positioning presenter 共用，Goal 只保留 table-specific geometry。不得以另一條 Goal-only CSS 線結案。
10. `Human Confirmed / Architecture Confirmed`：R6所有有效Goal定位皆顯示樹狀預覽：root與任意深度standard before／after、
    以及armed child。connector屬Goal mode-owned輔助視覺，既有shared marker仍是唯一落點節點與提交feedback；
    standard轉armed時必須以child geometry取代standard geometry，不得同時出現兩組connector。
11. `Human Confirmed / Architecture Confirmed`：R7拖曳定位時只顯示目前placement connector；一般hover／focus的active hierarchy
    guide與content tint暫不投影，中性樹狀底線保留，拖曳結束後一般互動高亮可恢復。
12. `Human Confirmed / Architecture Confirmed`：R8取代第9／10項中「Goal可見feedback必須包含Kanban dot／bar、connector只作輔助」的部分。
    `DesktopTaskInsertionIndicator`在Goal只保留semantic anchor／metadata，使用`surface-preview`不render marker；正式row與fixed preview
    必須共用`GoalHierarchyGuides`與同一segment renderer，branch右端等於放開後title edge。Board維持`kanban-marker` presentation。
13. `Human Confirmed / Architecture Confirmed`：R9有意取代第12項的Goal marker suppression。Goal standard／armed-child改回
    `kanban-marker`，在同一semantic boundary顯示8×8px dot與6px bar；`GoalHierarchyGuides`仍是唯一樹線renderer，branch右端不得改回dot中心。
14. `Human Confirmed / Architecture Confirmed`：R13的Goal child-entry hit rect為primary task surface中心70%寬×70%高；
    進入即開始共用1000ms dwell並只定位該target row。candidate保留standard marker／tree；armed時定位染色清除並由child marker／tree取代。
15. `Human Confirmed / Architecture Confirmed`：R14進入armed child後，candidate marker state可清除，但同一個落點父任務的
    location render必須持續存在；只允許一列target parent，子孫與其他列不得跟隨染色，且沿用既有location tint，不新增renderer或timer。

## 3. 範圍

### 3.1 本期包含

- 共用 desktop task drag host、fixed feedback layer 與 layout-neutral adapter contract。
- 從 `BoardView` 抽離桌機 session／cleanup／feedback orchestration，先保持看板行為零改變。
- Board adapter 封裝既有 approved geometry、特殊 placement 與 debug hooks。
- Goal adapter 解析縱向 visible DFS rows 的 before／after、root placement 與停留後 child append。
- Board／Goal 共用 fixed insertion presenter並以`kanban-marker`呈現既有`KanbanInsertionMarker`；Goal另由既有hierarchy renderer
  畫出階層feedback。Goal補齊title anchor、visible subtree bottom、
  next-depth child anchor、viewport clipping 與 exact-midpoint 規則。
- Goal所有有效定位在shared fixed layer中加上對應rail／stem／branch：root為branch-only；nested sibling與armed child為stem＋branch，
  branch終點皆等於resulting title edge；row與preview共用同一segment renderer。
- primary task move 的 canonical release commit；latest-store／permission／target／cycle 重驗、一次 batch 與一次 Undo。
- Goal 移除自有 `DndContext`／overlay／swap commit；保留 native table render、cell session、controls 與 menu。
- static／pure／browser／geometry／visual／a11y／regression evidence。

### 3.2 本期不包含

- mobile／coarse-pointer Goal drag、touch action rail、真機 Goal placement。
- Goal 的 tracking reference、Workbench placed／unplaced lane或跨看板搬移。
- 新 schema、API、permission model、TaskNode identity、filter semantics 或 persistence。
- 改動 Board 已核准的手感、overlay、8px threshold、1,000ms child dwell、水平 L1 或 mobile task session。
- commit、push、PR、deploy、migration、production smoke 或 release。

以上 future scope 狀態為 `Captured / Not Requested`；不得以預留擴充為由加入抽象事件匯流排、插件系統或新資料模型。

## 4. 現況 readback 與差距

| 面向 | 現況 | 本案固定結果 |
|---|---|---|
| Goal lifecycle | `GoalView` 自有 `DndContext`／`DragOverlay`／`handleDragEnd` | 由 shared `DesktopTaskDragHost` 唯一持有 |
| Goal layout | 整個 `<tr>` sortable transform，拖拉時列會位移 | 正常流完全不位移；只在 fixed layer 呈現 |
| Goal order | 同父層交換兩筆 order；跨父層 `over.order + 0.5` | canonical intent＋全 sibling normalization |
| Board lifecycle | start／move／over／end／cancel、pointer refs、cleanup 分散於 `BoardView` | 抽至 shared host，但 Board adapter 保留幾何結果 |
| Intent | `taskDropIntent.ts` 已是 parent／order／nodeType／cycle authority | 保留且成為兩模式唯一 intent authority |
| Commit | `taskDragCommit.ts` 已做 latest-store 與 normalization | 抽 primary move canonical path，Board normal path與Goal共用 |
| Feedback | 看板已有 origin／marker／child preview；Goal 只有專用 overlay | shared fixed layer；每次最多一種落點訊號 |
| Filter／collapse | Goal visible rows 與 canonical siblings 可不同 | adapter 找 visible anchor；commit 以完整 canonical siblings 計算 |

### R2 失效機制與來源

| 已讀取的程式事實 | R1 文件缺口與 R2 修正 |
|---|---|
| `BoardView.handleDragEnd` 的 column→column 分支直接 splice／batch，未呼叫 `commitDesktopTaskDrag` | 把根列表也列入 canonical primary path；保留水平落點與 nodeType |
| `taskDropIntent.getReorderIntent` 使用 target order ±0.5；normalization 再依數值排序 | 單靠數值不足以處理相同／密集小數 order；§5.5 固定以完整 sibling IDs＋anchor splice 決定順序 |
| `batchUpdateNodes` 回傳 void、先更新本機再發 persistence；`recalculateAncestorStatus` 在 batch 後直接 set | 「遠端原子成功／所有 ancestor Undo」不是現有保證；§6 明訂本機結構 Undo 與 inherited debt |
| permission hook 讀 `useMemberStore.currentBoardAccess`，包含載入中與 scope 欄位 | release 必須讀最新同 scope capability，不採 drag-start closure 的 boolean |
| `desktopTaskDropPreviewMatches` 比對語意但不比 rect；Goal tr 與 inner surface 同有 drag hook | 共用 host 只持有一份已呈現 frame；Goal 以唯一 row-id／task-cell hooks 測量，明訂 clip／scroll／origin |

以上為 source review，未執行 browser characterization；「現況一定全部 PASS」不是本輪結論。

規劃時 source baseline（SHA-256 縮寫）供 drift 檢查：`BoardView.tsx` `05E8B62…AD92`、
`GoalView.tsx` `B319E7B2…9200`、`useTaskPlacementController.ts` `7BA17F79…B872`、
`taskDropIntent.ts` `6A1C1246…A20D`、`taskDragCommit.ts` `E38B98D3…E018`、
`desktopTaskDropPreview.ts` `CCBF825B…1089`、`taskDragTypes.ts` `C93BEA06…1A0`。
`GoalView.tsx` 與相關 Goal 文件／verifier 在規劃時已有未提交修改；hash 是 readback，不是覆蓋授權。

### R3 插入定位線 re-entry readback

| Working-tree 事實 | 與架構契約的差距 | 固定修正 |
|---|---|---|
| `BoardView` 使用 `KanbanInsertionMarker`；`GoalView` 使用專用 `fixed h-0.5` div | 兩模式沒有共用同一視覺 primitive／presenter | 兩模式改由 shared `DesktopTaskInsertionIndicator` 呈現，內部重用 `KanbanInsertionMarker` |
| Goal rect 使用 lane left／right 與單列 top／bottom | after 可切進父任務可見子樹，X 軸也未表達層級 | Goal measurement 提供 title anchor、child anchor、visible subtree bottom 與 cell right |
| armed child 沿用 standard rect，只改 DOM data attribute | 顯示位置不能證明即將 append 到 target children | 1000ms armed 後改用 next-depth left＋target visible subtree bottom；candidate 仍顯示 standard 線 |
| `pointer.y > midpoint` 才 after | exact midpoint 與 §5.4、QA B28 不一致 | 固定 `pointer.y >= midpoint` 為 after |
| 既有 DEV-124 browser B01～B04 通過 | 未覆蓋 shared marker DOM、dot/bar 視覺、next-depth child 與 subtree line | 舊 evidence 保留為 baseline；R3 必須新增 fail-first 與 targeted browser／geometry evidence |

R3 re-entry source baseline（working-tree SHA-256）保留於本節作為 fail-first readback；實作後 candidate hash 已更新為：
`GoalView.tsx` `578358A1…5C413`、`BoardView.tsx` `5B1D2B40…9BB3D2`、`KanbanInsertionMarker.tsx` `437DC031…1454`、
`DesktopTaskDragLayer.tsx` `688442D6…7B27CD`、`goalDesktopTaskDragAdapter.ts` `E2409FED…1685BFD`、
`TaskChildDropPreview.tsx` `E620DE1F…31257DA`。驗證器 hash：static `9B389E67…741C7BD`、browser `A547CFAA…F1086F`。
branch／HEAD仍為`持續優化3`／`7b16ddf6e3af1d3bf26e3267c19de33fe343ecd4`；工作樹不乾淨，實作未覆蓋非DEV-124變更。

R3 candidate evidence：`npm run verify:dev-124-shared-desktop-task-drag-host` 23/23、
`npm run verify:dev-124-shared-desktop-task-drag-host-browser` B01～B04、B30～B36 全部 PASS；Chromium 1440×900，
browser／HTTP error=0，artifact為`output/qa/dev-124-shared-desktop-task-drag-host/static-result.json`與
`output/playwright/dev-124-shared-desktop-task-drag-host/result.json`。本證據是RD self-test與targeted QA，尚未替代獨立QC、真機或release gate。
相容回歸亦已在同一working-tree candidate完成：DEV-068 static 101/101／browser 40/40、DEV-116 static 30/30／browser 42/42、
DEV-121 static 25/25／browser 34/34；其中DEV-068完整browser log保存於`output/dev068-full-latest.log`。

### R4 跨模式 dwell／重置行為差距收斂

R4 readback確認：R3雖已共用定位線 presenter，但Goal仍以`GoalView`內獨立的`1000ms` timer／candidate ref判斷child armed；
Board則使用`taskChildDropTarget.ts`的`TASK_CHILD_DROP_DWELL_MS`、`advanceTaskChildIntent`與
`getTaskChildIntentRemainingMs`。兩邊在一般路徑看似相同，卻無法用同一權威證明999／1000ms邊界、換目標、離區與scroll reset，
分類為`Implementation needs correction`。

R4固定結果如下：

- Board／Goal的child intent都由`taskChildDropTarget.ts`同一狀態機與常數判定；Goal不得保留本地`1000`字面timer或第二份candidate state。
- surface只負責把目前pointer命中的target ID送進狀態機，並依共用remaining time排程下一次advance；timer不是新的語意權威。
- 同一target在999ms維持candidate，達1000ms才armed；換target由0重新計時；離開task primary scope立即回`none`。
- `DesktopTaskDragHost`的scroll invalidation同時清除Board／Goal的pending child、standard marker與幾何cache；下一次真實pointer move才重新命中並從0計時，重命中前release為no-op。
- 定位線採「語意一致、幾何由adapter轉譯」，不是像素完全相同：standard line從target title anchor開始；after位於visible subtree bottom；armed child從next-depth anchor開始。Board卡片與Goal table可有不同rect尺寸與座標來源。

R4 fail-first先證明S26只因Goal仍持有獨立timer而失敗；修正後static S01～S27為27/27，Chromium browser 16/16
（B01～B04、B30～B41）全綠，browser／HTTP error=0。candidate SHA-256：`GoalView.tsx`
`378EF465…34F06C5`、`BoardView.tsx` `3E7B3ACD…607EA5C6`、`taskChildDropTarget.ts`
`31A52D92…6E5D545`、static verifier `707D1FF1…A307007`、browser verifier `392446E1…318894F`。
artifact仍由`output/qa/dev-124-shared-desktop-task-drag-host/static-result.json`與
`output/playwright/dev-124-shared-desktop-task-drag-host/result.json`持有；R3證據保留為歷史baseline。

### R5 Goal armed-child 直系樹狀定位預覽

R5在既有ownership內完成compatible additive re-entry：Goal measurement增加target own rail，adapter輸出
`railCenterX／stemStartY／boundaryY／branchEndX`；`GoalTaskTreeInsertionPreview`只在armed target與geometry target一致時，
於shared fixed layer內、marker後方畫2px stem／branch。candidate仍只有standard marker，shared marker圓點仍是唯一落點節點。

fail-first S28／S29先在R4 candidate失敗；修正後static 29/29、Chromium 18/18（新增B42／B43）PASS，browser／HTTP error=0。
B42的實際幾何為parent rail X=360、row center Y=93、child boundary Y=141、branch right＝marker dot center 378.39px，
各斷言≤1px；代表截圖`output/playwright/dev-124-shared-desktop-task-drag-host/B42-dev124-goal-tree-preview.png`已人工複查。
B43證明armed後scroll／Escape同步清除connector與marker。

同candidate回歸：DEV-068 101/101＋40/40、DEV-116 30/30＋42/42、DEV-121 25/25＋34/34；
TypeScript、targeted ESLint、`build:test`、`git diff --check` PASS。candidate hashes見DEV-124／QA-DEV-124。

### R6 Goal 全定位階樹狀預覽

R6有意取代R5 armed-only的可見契約。每一個有效Goal positioning frame都必須有且只有一組connector geometry：

- root standard before／after：由root rail至marker圓點中心的短水平branch；沒有虛構父層，因此不畫vertical stem。
- nested standard before／after（不限深度）：使用target parent rail；vertical stem連接target row center與semantic boundary，
  horizontal branch由parent rail接至marker圓點中心。after boundary仍是visible subtree bottom。
- armed child：維持R5語意，使用target own rail，由target row center連至child boundary，再接marker圓點中心。
- origin／invalid／無target：不畫connector；candidate轉armed只替換geometry，任何frame不得同時存在standard與child兩組connector。

presenter允許branch-only與向上／向下stem，但不判斷意圖；adapter輸出`relationKind／railCenterX／stemStartY／stemEndY／boundaryY／branchEndX`。
shared marker仍是唯一落點節點；connector維持`aria-hidden`與`pointer-events:none`，不參與hit-test或commit。

R6 fail-first在R5 candidate只新增S30／S31時如預期失敗，其餘29項維持PASS；實作後static 31/31、
Chromium normal-entry browser 20/20（新增B44／B45）、browser／HTTP error=0。B44量測root branch-only，
B45量測depth-2 before／after parent rail、row center、semantic boundary與marker dot endpoint皆在1px容差內，代表截圖已人工複查。
protected regressions：DEV-068 static 101/101＋browser 40/40、DEV-116 static 30/30＋browser 42/42、
DEV-121 static 25/25＋browser 34/34；TypeScript、targeted ESLint、`build:test`與`git diff --check` PASS。

### R7 Goal 拖曳樹線視覺互斥

R7修正R6實作偏差，不取代其geometry契約。Goal既有hover／focus會把目前階層關係標成active purple guide；拖曳時pointer進入
target row仍會觸發此狀態，因而與`GoalTaskTreeInsertionPreview`同時出現。`activeDragNode != null`時，必須在Goal view projection
邊界把可見hierarchy scope導出為`null`，並同時供guide與content-owner tint使用。底層互動scope可保留，drag end／cancel後依當下
hover／focus恢復；不得靠移除CSS、拆掉一般hierarchy互動或改動shared host解決。

可見基數：拖曳中的`[data-goal-drag-tree-preview="true"]`恰為1；
`[data-goal-hierarchy-guide-active="true"]`與`[data-goal-content-scope="active"]`皆為0。中性的
`.goal-hierarchy-guide-segment`仍可存在，因其表達既有樹結構而非定位候選。origin／invalid仍為0個drag preview。

### R8 Goal 預覽／結果樹線同源

R8有意取代R3／R5／R6的Goal visible marker ownership，不改其hit-test、semantic boundary或commit語意：

- shared `DesktopTaskInsertionIndicator`仍輸出同一target／position／feedback／rect metadata；Board沿用預設
  `kanban-marker`，Goal改用`surface-preview`且不render`KanbanInsertionMarker` dot／bar。
- `GoalHierarchyGuides`是row與preview唯一renderer；內部`GoalHierarchyGuideSegment`持有kind class、active stroke、
  rounded style、owner metadata。preview只供應fixed geometry與`preview` layer，不複製視覺primitive。
- branch endpoint為`indicatorRect.left`／`childIndicatorRect.left`，等於resulting title edge；不得再加dot半徑4px。
- row layer與preview layer可使用不同coordinate space，但必須使用同一active rendering path；drag期間row-layer active guide=0，
  preview layer恰有一組，terminal後preview=0且row hover／focus可恢復。
- 禁止恢復`GoalTaskTreeInsertionPreview`、Goal專用bar／dot、獨立stroke token或第二可提交feedback。

fail-first B47在舊實作量得preview branch `370.39→388.78px`、result `370.39→384.78px`，且dot／bar各1；
R8 candidate兩者皆為`370.39→384.78px`、dot／bar=0。S34另鎖定row／preview共用單一segment renderer。

### R9 Goal 恢復共用定位插入線

R9有意取代R8的Goal marker suppression，但不取代R8的renderer與端點契約：

- Goal `DesktopTaskInsertionIndicator`使用`kanban-marker`，render既有`KanbanInsertionMarker`的8×8px dot與6px bar。
- 同一frame仍只有一個`data-goal-drag-marker`與一個`data-goal-drag-tree-preview`；兩者均`pointer-events:none`且共用同一descriptor。
- `GoalHierarchyGuides`仍是row／preview唯一樹線renderer；branch endpoint維持semantic wrapper left／resulting title edge，
  不因dot恢復而延伸到dot center。
- origin／invalid、scroll reset、cancel與terminal同時清除marker與tree preview；Board geometry／style不變。

### R10 Goal 浮卡 50% 視覺修正

- Goal浮卡沿用shared fixed layer、來源ID、pointer中心定位、1°旋轉、文字截斷、邊框／陰影與`pointer-events:none`。
- 浮卡computed `scale`固定為`0.5`；Goal內容寬度維持既有content-driven layout與`max-width:252px`，不得為了縮放改成固定寬度。
- 驗收以computed scale為主；1°旋轉會讓`getBoundingClientRect()`外接矩形高度略大於layout height的50%，不得誤判成縮放失敗。
- 此修正不建立新元件、state、timer、hit target或commit path；R9 marker與R8 hierarchy renderer契約完整保留。

### R11 等價兄弟邊界單一預覽樣式

- 若standard `before` target之前存在同parent的可見前一兄弟，且該兄弟的visible subtree bottom與target top為同一邊界，
  renderer一律以該前一兄弟的「after」row center／rail作為`standardTreePreview`幾何來源。
- `targetNodeId`與`orderingPosition='before'`保持不變；canonical commit仍以原semantic target執行，preview anchor不得成為第二提交權威。
- 前一兄弟是drag source／source descendant、parent不同、邊界不連續或不存在時，不正規化；維持原before target幾何。
- marker仍使用同一boundary Y、title anchor、8px dot與6px bar；只消除等價邊界的第二種樹線方向，不新增feedback。

### R12 所有巢狀standard樹幹只允許由上往下

- R11只涵蓋可找到前一個同parent可見兄弟的`before next`；第一個子項目的`before`仍會以目標列中心為起點向上連到boundary。
- 任一巢狀standard preview必須滿足`stemStartY <= boundaryY`；不得再由boundary下方的目標列中心向上繪製。
- `before first child`以可見parent row center作presentation anchor，沿candidate的parent rail向下連到boundary；semantic target仍是child＋before。
- 若parent row不在可見rows或受clip限制，stem最多退化為零高度，不得反向；root placement維持branch-only。
- after、armed child、marker、shared renderer、canonical commit、Board行為與R11等價兄弟正規化不變。

### R13 Goal child-entry 70%窗口與candidate目標定位

- Goal child-entry window由目標primary task surface的中心計算，寬、高皆為原rect的70%；左、右、上、下各15%只做standard ordering，不啟動或延續child dwell。
- 第一個進入window的frame即由shared state machine建立`candidateSince`並開始1000ms；同一frame只在target row呈現既有parent location tint，子孫、其他row與一般hover／focus scope不得染色。
- candidate期間standard marker與standard tree preview照常呈現；滿1000ms後phase轉`armed`，candidate tint必須清除，改由既有child marker與child tree preview呈現。
- 切換target、離開70% window、scroll／external invalidate、cancel、drop與session terminal都要清除candidate target；重新進入後重新起算1000ms。
- Board child-entry window與既有視覺不變；本修訂不新增timer、preview component、commit path、DOM hit target或資料欄位。

### R14 armed child持續父任務定位

- `goalChildTargetId`在`candidate`與`armed`兩個phase皆指向同一個target parent；`childDropCandidate`只在candidate phase存在，
  `childDropTarget`則在兩個phase皆存在，讓armed切換只替換marker／tree呈現，不撤掉父任務location render。
- Goal row以`data-goal-child-drop-target="true"`投影單一父任務，沿用既有planning／task-cell／title location tint selectors；
  descendant rows、其他 rows與一般hover／focus scope不得染色。
- armed child仍維持既有child marker、`GoalHierarchyGuides`與1000ms shared dwell；本修訂不新增timer、preview component、
  hit target、commit path、資料欄位或Board行為，所有terminal／reset路徑清除target projection。

## 5. 架構定案

```text
BoardView ── BoardDesktopTaskDragAdapter ─┐
                                          ├─ DesktopTaskDragHost
GoalView  ── GoalDesktopTaskDragAdapter ──┘     ├─ DesktopTaskDragLayer
                                                │    ├─ DesktopTaskInsertionIndicator
                                                │    │    ├─ Board: KanbanInsertionMarker
                                                │    │    └─ Goal: KanbanInsertionMarker + semantic anchor
                                                │    └─ GoalHierarchyGuides (row + fixed preview)
                                                ├─ taskDropIntent (唯一語意)
                                                └─ canonical primary commit
                                                     └─ latest store + one batch + one Undo
```

### 5.1 新增模組

| 檔案 | 唯一責任 | 禁止責任 |
|---|---|---|
| `src/components/Wbs/taskDrag/DesktopTaskDragHost.tsx` | `DndContext`、session id、raw pointer、terminal guard、start／move／over／end／cancel、全域 cleanup、release orchestration | Board／Goal DOM 查找細節、直接 store mutation、模式專用 layout |
| `src/components/Wbs/taskDrag/DesktopTaskDragLayer.tsx` | fixed overlay容器；同檔輸出無狀態 `DesktopTaskInsertionIndicator`，統一rect定位、axis、semantic data attributes及`kanban-marker／surface-preview` presentation | 解析 parent／order、讀DOM／store、插入正常流、持有模式資料 |
| `src/components/Wbs/taskDrag/desktopTaskDragAdapter.ts` | source、target、geometry 的最小介面 | session、提交 callback、store write |
| `src/components/Wbs/taskDrag/boardDesktopTaskDragAdapter.ts` | 現有 Board hit-test、水平 L1、卡片／checklist、Workbench／tracking target data | 提交、timer、terminal state、改變既有 Board 行為 |
| `src/components/Wbs/taskDrag/goalDesktopTaskDragAdapter.ts` | Goal row rect、visible subtree、lane geometry、semantic descriptor mapping | `rowSpan` ownership、task table render、獨立 commit |
| `src/components/Wbs/GoalHierarchyGuides.tsx` | Goal row與fixed preview共用的唯一hierarchy segment renderer；root／nested／child只接受既算好的relation／geometry | hit-test、dwell、commit、Board geometry、建立第二落點或另一套preview視覺 |

型別可以共置於 `taskDragTypes.ts`，不強制建立只有轉呼叫的 wrapper；獨立檔案是否存在不是驗收條件。
必要的三種責任是有狀態host、無狀態layer、模式幾何函式；adapter不得持有session／commit，dwell phase只能來自
`taskChildDropTarget.ts`共用狀態機。Board／Goal的React effect只排程remaining time，不擁有phase規則。
`DesktopTaskInsertionIndicator` 放在既有 layer 檔案，避免為單一 presenter 再新增一層檔案；它只接受已算好的
`rect／axis／targetNodeId／position／surfaceKind／feedbackKind`，不推導意圖。`TaskChildDropPreview` 可重用此 presenter，
但仍保有 safe scope與live status責任，兩者不得互相 import 形成循環。

### 5.2 Adapter 契約

R2 移除 R1 的 `revalidateRelease`、`commitRelease`、`cleanup` callbacks。release 和 move 使用同一個同步測量函式；
host管理session／terminal／external invalidation與cache清理並協調commit authority；dwell轉移由共用狀態機管理，
避免adapter或surface timer成為第二個controller。

```ts
type DesktopTaskDragSurfaceAdapter = {
  key: 'board' | 'goal';
  collisionDetection: CollisionDetection;
  captureSource(input: SourceInput): DesktopSource | null;
  measure(input: MeasureInput): SurfaceMeasurement;
};

type DesktopSource =
  | { kind: 'primary'; descriptor: TaskDropDescriptor; workspaceId: string; boardId: string }
  | { kind: 'board-special'; activeData: ExistingBoardDragData };
type MeasuredTarget =
  | { kind: 'primary'; descriptor: TaskDropDescriptor }
  | { kind: 'board-special'; overData: ExistingBoardDragData }
  | null;
```

上例是介面摘要，以下欄位語意不可留給實作模型猜測：

- `SourceInput`：activator、DnD active data、latest nodes、active workspace／board；source snapshot 只保存 ID、scope與來源幾何。
- `MeasureInput`：source、最新 raw pointer、latest nodes、目前 view root element、projection／collapse／filter版本、
  previous geometry cache。`ExistingBoardDragData` 是現行 Board payload 的局部型別化，不是新增 persisted model。
- `SurfaceMeasurement`：target、ordering rect／axis、origin rect、child candidate（target ID、可接受區域、child insertion rect）、
  clipped viewport、view revision及 scroll offsets。它不包含 outcome、dwell phase 或 commit result。
  Board可利用host傳入的previous geometry套既有L1 hysteresis、validRect與2px indicator retain；不在adapter另存session ref。
- host 呼叫既有 canonical resolver產生 outcome／move plan，持有唯一 `presentedFrame`：session ID、frame sequence、
  measurement、move plan與 `feedback: none | origin | standard | child`。React state與必要 event ref引用同一 snapshot；
  layer 完成 layout effect後才記為已呈現，不把排入 state但未 render 的結果當成可提交證據。
- layer 只接受 `presentedFrame`／overlay view model；不讀 store、不自行解 intent。
- Board normal與 root move、Goal move由 host呼叫 `commitPrimaryDesktopTaskDrag`；Board的source或target為special時交既有
  `commitDesktopTaskDrag`。dispatch由discriminated kind決定；Goal不能產生special kind，不以DOM class猜測。

### 5.2.1 Session 與 release 順序

`idle → dragging → committing → committed | no-op | failed`；dragging可走 `cancelled`。

1. 每次 start建立唯一 session ID；terminal／committing後的重複 end、cancel及舊 timer直接忽略。
2. move／over把surface命中的target ID送入共用child intent狀態機；Board／Goal只依共用remaining time排程下一次advance。
   host持有session與scroll invalidation，不另造第二套dwell判斷。
3. release先取得一次 commit claim與最後已呈現 frame，再同步重新 measure與讀最新資料／權限。
4. 比對 source／target ID、scope、parent、nodeType、position及完整相關 sibling序列；target、view revision、cycle或權限失效即 no-op。
   Goal幾何比對同一scroll frame內indicator rect差值≤0.5px；Board沿原2px retain、L1／gap validRect與
   已顯示target保留規則，不用Goal row規則覆寫。title／無關任務變更不應令合法move失效。
5. 正常 primary path在最後 permission／plan檢查與本機 batch dispatch之間不可 `await`；跨執行緒競態仍由既有後端授權處理。
6. release不允許新 arm child；只有最後已呈現的 armed frame可提交。先凍結 release資料，再清除視覺／timer，不能先清掉證據。
7. special分支的 Promise結果仍歸同一 session；提交已開始後 blur／unmount只清 UI，不宣稱取消已送出的寫入，
   不得讓舊 Promise清掉新 session的 UI。

Escape、pointercancel、window blur、pagehide、document hidden、resize、orientation、view／board／account切換、
source消失與 unmount在 dragging時 cancel；cleanup idempotent且只清本 session的 listener／timer／refs／body state。
scroll不是整個drag session的cancel，但會同步失效pending child、marker與surface geometry cache；下一次真實pointer move才重新命中並從0計時，
release早於重新呈現時no-op。無需新增全域revision store或observer service。

### 5.3 Shared host／layer invariant

- Goal primary mouse、8px activation constraint；沿用 `useDragSensors`，Goal移除 sortable keyboard listener的現況保留。
  Board仍接受既有 sensors／keyboard路徑，不能因抽出「desktop」host而全域禁用 keyboard；mobile session／presenter留在 Board原 owner。
- overlay 使用 fixed positioning，pointer gap `0px`、scale `0.5`。Board task寬`240px`、column寬`270px`、高`40px`，
  transform後畫面rect分別為120×20與135×20；Goal浮卡維持內容寬度與`max-width:252px`，以computed scale 0.5驗收。
- `DragOverlay` 本身不得承擔可見卡片；可見 preview 由 shared fixed layer 持有，避免 DnD portal layout 差異。
- source visible subtree 的正常流位置固定；來源回饋只在 task-name lane／既有 approved surface 呈現。
- origin、standard、child 三種 feedback 互斥；invalid target 不顯示可提交訊號。
- `DesktopTaskInsertionIndicator`是共同semantic anchor；Board與Goal standard／child皆使用`kanban-marker`並重用
  `KanbanInsertionMarker`。Goal同時顯示由`GoalHierarchyGuides`產生的唯一樹狀預覽；origin仍重用`TaskOriginTitleField`。
- Board marker維持既有compact 8×8px圓點、6px主線、primary色與shadow；Goal不得為了視覺一致修改此approved樣式。
- Goal樹狀feedback由`GoalHierarchyGuides`呈現，與正式row共用segment／active stroke；root element
  `aria-hidden`／`pointer-events:none`。Kanban marker與樹線共用同一placement descriptor，合計仍是一組不可互動定位回饋。
- child dwell 固定 `TASK_CHILD_DROP_DWELL_MS = 1000`；999ms 不可 armed，達 1000ms 才可顯示 child marker。
- Board／Goal都必須呼叫`advanceTaskChildIntent`與`getTaskChildIntentRemainingMs`；surface可各自持有React排程，
  但不得複製dwell常數、phase轉移或target-switch reset規則。
- source placement用 `useTaskPlacementController`原權限／interaction binding；Goal維持唯一 `<tr data-goal-task-row-id>`
  作為 sortable node，listeners留在 task-name primary surface，所有 row transform／transition在 drag中停用。
  source task-name文字與其可見 descendant title依既有 placeholder pattern暫隱藏，保留尺寸／樹線／controls與其他 cells。

### 5.4 Goal adapter 幾何與語意

1. 拖拉來源只接受 task-name primary surface；planning／content／status／date／assignee／duration、node toggle、menu、
   details 與 editor control 全部 suppress。
2. 先檢查 pointer在 frozen task-name lane與 scroll viewport交集內，排除 sticky header、表外、comparison cells與互動控制；
   區外立即清 target／dwell。再以 pointer Y對唯一 `data-goal-task-row-id` 的 row rect找列；不從 rowSpan cell推 task identity。
3. before／after以 row midpoint判定，`pointerY >= midpoint`歸 after；before在 row top，after在該 row visible subtree bottom。
   descendant row優先成為自己的 target，不因祖先 subtree rect覆蓋而被祖先攔截；root before／after因而不切斷子樹。
4. Goal measurement row至少包含`rowTop／rowBottom／visibleSubtreeBottom／titleAnchorLeft／childAnchorLeft／cellRight`。
   semantic anchor rect的standard left為target title anchor、child left為next-depth child anchor，右緣維持`cellRight - 4px`、
   width至少24px供clipping／release revalidation；Goal不把此rect畫成bar。preview branch右端取rect left。不得改table width、scroll width、row top／bottom或sticky left。
5. Goal child candidate區域為該 row的 task-name primary rect（排除controls並clip viewport），不包含 descendant列。
   同 target連續1000ms後child marker位於目標 visible subtree bottom，X對齊下一深度；離區／換列／scroll／view變更重置intent。
   candidate期間沿用當下standard／origin feedback，release按已呈現的standard意圖；armed後才替換為child feedback。
6. 被收合且存在 hidden children 的目標只允許 before／after，不允許 child append；無 children 的 leaf 可正常 dwell。
7. filtered view 的 before／after 使用 visible anchor 形成 descriptor，但 `normalizeTaskMoveUpdates` 必須讀完整 canonical siblings；
   hidden siblings 保持相對順序。child append 以所有 canonical children 的尾端 order 計算。
8. root placement 由 root row 的 before／after 表示，不新增空白 table row 或獨立 root dropzone。
9. semantic mapping：Goal root source／target 映射為 `column-header`；非 root row 映射為 `checklist-row`；
   armed child 映射為 `task-title-child`。這是 intent descriptor，不代表重用看板 DOM。
   root按 latest canonical `parentId`判定，不能因filter後visible depth=0把子任務誤認root。
10. 判定優先序：來源自己的primary rect → origin／零寫入；source descendant → invalid；其他有效target →
    child或standard；沒有target → none。self不得送入child resolver；重排後完整ID序列不變也為origin。
11. archived、missing、隱藏、stale、其他board／workspace target一律invalid且清除上一個marker。
    before／after或child插入線的完整8px視覺高度若落在task lane與scroll viewport交集外，該落點不能顯示／提交；
    亦即semantic Y至少距clip top／bottom各4px。捲至落點可見後重新測量。
    展開subtree長於viewport、無法同時看到target與after線時，可先用既有node toggle收合後重排；不新增自動收合或新dropzone。
12. 同一scroll offsets下drag不得移動rows；自然捲動時比較content座標（client Y＋scrollTop），不能把scroll位移當作layout shift。
13. R5 tree preview geometry至少包含`railCenterX／stemStartY／boundaryY／branchEndX`。`railCenterX`是target自身Goal tree rail；
    `stemStartY`是target row center經viewport clip後的位置；`boundaryY`等於已clip的child marker semantic Y；
    `branchEndX`等於child marker 8px圓點中心。只有`branchEndX > railCenterX`且armed target等於目前geometry target才render。
    candidate、origin、invalid、換target、離區、scroll、cancel、release與unmount皆不得殘留connector。

### 5.5 Canonical intent 與 commit

- `taskDropIntent.ts` 保留 parent／nodeType／cycle authority；在同檔新增 pure `resolvePrimaryTaskMovePlan`，
  供 desktop preview與primary commit共用。輸入 source／target descriptors與latest nodes；輸出 invalid、origin或
  move plan（intent、原／目的scope、完整before／after sibling IDs），不新增 persisted欄位。
- `resolveTaskDropOutcome`的invalid仍拒絕；origin需依新plan的完整ID序列＋parent／nodeType判斷，
  不以舊 ±0.5 排序推論。新plan只服務本案desktop primary路徑，既有mobile／special呼叫契約保留。
- 先依既有 `buildTaskParentIndex`讀完整、未archived、同ownership scope的有序siblings，再移除source、
  依target ID在before／after位置splice；child append放入完整children尾端。相同order沿用目前index穩定順序，
  不另改全域tie-break。`normalizeTaskMoveUpdates`增加可選plan參數，由plan輸出受影響siblings的連續整數order；
  舊3參數呼叫仍沿用原邏輯。intermediate `intent.order`不是最終排序權威。
- 例：完整 `[A,H,B,C]`、H被filter隱藏，C拖到B前應為 `[A,H,C,B]`；拖到A後應為 `[A,C,H,B]`。
  order為`[0,0.1,0.2,0.3]`或相同值也依同一anchor規則，不可用 ±0.5 跳過H。
- `taskDragCommit.ts`匯出 `commitPrimaryDesktopTaskDrag`；依據已呈現plan與最新plan一致才呼叫一次本機
  `batchUpdateNodes`，不在adapter中提交。normal Board facade委派到此函式；Board root reorder的直寫分支必須刪除。
- root→root保留source原nodeType；非root提升root依現有resolver成group；root移入非root成task。
  來源有後代時移動其root parent，後代ID／parent關係不變；禁止重建整個subtree。
- Board normal非root move保留現行一次 `recalculateAncestorStatus(sourceId)`；root reorder保留0次。
  Goal沿相同分流。這是相容呼叫規則，不是「兩側ancestor都已恢復」的保證，見§6。
- Board tracking／Workbench／跨board只走既有 `commitDesktopTaskDrag` special branches與placement authority；
  normal primary entry嚴格要求source與target等於active board／workspace，不能意外落入一般batch。

## 6. 資料、權限、錯誤與交易邊界

- 資料來源：既有 task store 的 latest nodes；visible projection 只供 hit-test，不是 commit truth。
- 權限：host／commit透過同一同步 `readCurrentAccess()`取得 `useMemberStore`的最新capabilities、loading、
  loadedWorkspaceId／loadedBoardId，並核對 `useBoardStore` active board與目前auth identity。normal primary只要求
  既有 `move_task`，不額外加 `edit_task`。loading、scope不符、viewer、permission撤回皆fail closed；
  不在每次pointer move發權限網路請求。Board-special保留原專用capability規則。
- 一次batch／Undo指一次local store command，不等於一次HTTP請求；成功時Undo stack新增一個command，
  Undo／Redo精確還原本次受影響siblings的order與source的parent／nodeType；後代連結不變。
- 同一任務連續兩次drag必須保有兩步Undo；現有`useUndoStore.pushUndo`不會依mergeKey合併，不需新增history系統。
- normal `batchUpdateNodes`是void、optimistic且不提供durable receipt；本案`committed`只表示local-applied。
  不得依此顯示「已儲存」或產生遠端PASS證據。同步dispatch例外清UI並回failed；dispatch後失敗不得宣稱零寫入或已rollback。
- 既有遠端錯誤仍走原persistence／error通道；Board-special沿既有可await placement結果。
  本期不把normal drag改接`commitNodeBatch`，避免引入新的pending／recovery產品流程。
- 效能：每animation frame至多一次Goal geometry read；同一nodes identity下重用parent index，pointer move不發網路寫入。
  scroll／projection變更失效快取；不新增全域geometryRevision、event bus或長期observer。

### 6.1 已知繼承限制（不冒充本案已解決）

`TD-124-01`：normal drag使用既有optimistic batch，無跨節點遠端原子成功／自動rollback保證。
隔離：本案只判local structural acceptance、不新增成功儲存提示；遠端持久化改造需另行scope。
移除條件：後續任務將此path接到具receipt／recovery的既有commit authority，並通過partial failure／reload readback。

`TD-124-02`：現有post-batch rollup只沿source的新parent鏈直接set，未包入batch的Undo，舊parent鏈也不一定重算。
R1對「受影響ancestor狀態完整Undo」的敘述缺乏程式依據，R2明確限縮為本機結構欄位Undo，並保留baseline rollup行為。
隔離：QA另保存舊／新ancestor status的before／move／undo／redo快照，不能把既有差異算成本案解決或全資料一致性PASS。
移除條件：後續明確修正rollup＋Undo共同ownership並驗證雙parent鏈；本案若新增結構或rollup回歸仍必須修復。

## 7. Repo surface

### 7.1 新增

- `src/components/Wbs/taskDrag/DesktopTaskDragHost.tsx`
- `src/components/Wbs/taskDrag/DesktopTaskDragLayer.tsx`
- `src/components/Wbs/taskDrag/desktopTaskDragAdapter.ts`（純型別可共置 `taskDragTypes.ts`）
- `src/components/Wbs/taskDrag/boardDesktopTaskDragAdapter.ts`
- `src/components/Wbs/taskDrag/goalDesktopTaskDragAdapter.ts`
- `src/components/Wbs/GoalHierarchyGuides.tsx`（R8取代並移除獨立`GoalTaskTreeInsertionPreview.tsx`）
- `scripts/verify-dev-124-shared-desktop-task-drag-host.ts`
- `scripts/verify-dev-124-shared-desktop-task-drag-host-browser.pw.js`

### 7.2 修改

- `src/components/BoardView.tsx`：改接 shared host＋Board adapter，移出 inline desktop orchestration。
- `src/components/GoalView.tsx`：改接 shared host＋Goal adapter，移除自有 DnD／overlay／commit；native table 不變。
- `src/components/Wbs/KanbanInsertionMarker.tsx`：既有視覺primitive直接重用；除非browser evidence證明必要，不改其approved樣式。
- `src/components/Wbs/taskDrag/TaskChildDropPreview.tsx`：armed child改用shared insertion presenter；safe scope與live status保留。
- `src/components/Wbs/taskDrag/desktopTaskDropPreview.ts`：讓 preview 保留 semantic descriptors 與可重驗 snapshot。
- `src/components/Wbs/taskDrag/taskDragCommit.ts`：抽 primary canonical commit，normal Board path 委派。
- `src/components/Wbs/taskDrag/taskDropIntent.ts`：增加共用desktop primary move plan，不改既有mobile／special resolver輸入。
- `src/components/Wbs/taskDrag/taskMoveUpdateNormalization.ts`：可選plan參數，完整anchor順序normalization；舊3參數相容。
- `src/components/Wbs/taskDrag/taskDragTypes.ts`：只在 shared observation／terminal contract 確有缺口時 additive 擴充。
- 既有drag／Goal verifiers：只可遷移因抽取失效的source-location assertions，須保留等價runtime／pure oracle與首個失敗。
- `package.json`、DEV／SPEC／QA／documentation map：命令與證據治理。

### 7.3 保護區

- `src/utils/taskHierarchy.ts` 的 canonical hierarchy／projection。
- Goal native table、`rowSpan` owner、252px sticky task-name first column、single X-scroll、cell editor/session。
- `TaskNode`、API、schema、permission model、filter semantics、meeting／record scope、store／Undo實作。
- mobile `useTaskDragSession` 與 Board 已核准的 desktop／mobile行為。
- 已核准的行為oracle不得放寬。純source位置因抽取移動時，記錄舊檢查→新owner→等價行為案例，
  可調整檔案定位，不以必須保留inline Board handler作為架構驗收。

## 8. 固定工作包與 gate

### WP-124-A：Characterization 與 fail-first

- 開工 readback branch／HEAD／dirty files／source hashes；建立受影響行為矩陣。
- 至少保存一個真正行為fail-first：Goal三兄弟穩定插入結果或拖拉期間table geometry；
  不把新增module不存在／import失敗當作行為缺口證據。source掃描只補充ownership檢查。
- 鎖定 Board overlay／origin／standard／child／cancel／Workbench／tracking characterization。
- Gate：fail-first evidence 可追溯，且未修改產品行為，才可進 WP-B。

### WP-124-B：抽 shared host／layer 與 Board adapter

- 從 Board 移出 lifecycle／layer，保留既有semantic result／geometry；root direct branch先收至既有commit facade，
  WP-C再併入primary path。這是分階段移動同一流程，不新增runtime雙跑／flag。
- Gate：DEV-053／055／058／068 與 Board characterization 全部 PASS；任一 Board drift 立即停止。

### WP-124-C：canonical primary commit 與 Goal adapter pure logic

- 抽primary commit並吸收root reorder；完成anchor plan、latest-access、Goal geometry與session race cases。
- Gate：intent、normalization、latest-store、permission、cycle、at-most-once、hidden sibling cases 全部 PASS。

### WP-124-D：Goal wiring

- Goal 接 shared host；刪除 Goal second DnD／overlay／commit，凍結正常流 transform。
- Gate：Goal browser／geometry／a11y 通過，且 DEV-116／119／120／121 targeted regressions PASS。

### WP-124-E：Frozen candidate 與 drift audit

- 凍結 source hash、commands、artifact、screenshots、console／HTTP／visible error sweep。
- 更新 DEV／SPEC／QA，但不宣告 release。
- Gate：同一 candidate 全綠且 P0／P1 failure=0，才可標 `RD Implementation Complete / QC Ready`。

### WP-124-F：Shared insertion marker rework（已完成）

- 先新增會對現況失敗的pure／browser cases：Goal standard不是shared marker、after未在visible subtree bottom、
  child未移至next depth、exact midpoint未歸after；fail-first不得只檢查字串。
- 在既有`DesktopTaskDragLayer.tsx`輸出無狀態`DesktopTaskInsertionIndicator`；Board standard、Goal standard與
  `TaskChildDropPreview` armed line共用，不另建第二套CSS線。
- GoalView只量測DOM並組成完整row geometry；`goalDesktopTaskDragAdapter`純計算before／after／child rect與clipping。
- Gate：已通過；Goal定位線幾何與displayed＝committed、Board marker visual／geometry零漂移均有static／browser evidence。

### WP-124-G：R3 frozen candidate 與 targeted QA（已完成）

- 凍結同一candidate的source hash、browser版本、三viewport、standard before／after、child candidate／armed、
  origin／invalid／cancel、horizontal／vertical scroll與visible error sweep。
- 重跑DEV-124、DEV-068、DEV-116、DEV-121及受影響Board marker regressions；舊R2 PASS只作baseline。
- Gate：R3新增B30～B36與既有DEV-124 P0／P1案例全綠；已標`RD Implementation Complete`，獨立QC、真機與release仍封鎖。

### WP-124-H：R4 child dwell authority closure（已完成）

- 建立S24～S27：精確999／1000ms、換target、離區、Goal共用狀態機與兩模式scroll invalidation。
- Goal移除本地timer／candidate refs，改用`taskChildDropTarget.ts`共用狀態機；Board補接shared host scroll invalidation。
- Gate：fail-first S26可重現，修正後static 27/27。

### WP-124-I：R4 cross-mode browser contract（已完成）

- B37～B41驗證Goal candidate→armed、換target／離區、Goal scroll reset、Board candidate→armed與Board scroll reset。
- 定位線仍依各surface adapter計算rect；browser只要求title／subtree／next-depth語意一致，不要求Board與Goal像素座標相同。
- Gate：DEV-124 browser 16/16且browser／HTTP error=0；DEV-068／116 protected regressions與build gate通過。

### WP-124-J：R5 armed-child tree preview（已完成）

- 先加入會對R4 candidate失敗的pure／source cases：adapter尚未輸出connector geometry、Goal尚未armed-only render presenter。
- adapter量測target tree rail並輸出stem／branch；無狀態Goal presenter在shared layer中、marker後方render。
- Gate：candidate無connector；armed有且stem／branch接到marker圓點中心；不改canonical result或Board source。

### WP-124-K：R5 targeted QA（已完成）

- browser新增armed connector geometry／screenshot與switch／scroll／cancel cleanup；error sweep維持0。
- 重跑DEV-124、DEV-068、DEV-116、DEV-121及build／typecheck／lint／diff gate；人工複查代表截圖。
- Gate：同一candidate全綠才回到`RD Implementation Complete / R5 Targeted QA PASS / QC Pending`。

### WP-124-L：R6 all-placement tree preview（已完成）

- 先加S30／S31 fail-first，證明R5尚未輸出root／nested standard geometry，且presenter拒絕branch-only／反向stem。
- adapter新增standard connector geometry；Goal在有效standard frame顯示standard connector，armed時原子替換為child connector。
- Gate：root、nested before／after、armed child各只有一組connector；origin／invalid為0；不改Board或canonical commit。

### WP-124-M：R6 targeted QA（已完成）

- browser新增B44 root branch-only與B45深層nested before／after幾何、代表截圖及error sweep。
- 重跑DEV-124、DEV-068、DEV-116、DEV-121、typecheck、targeted lint、build:test與diff gate。
- Gate：同一candidate static 31/31、browser 20/20與protected regressions全綠，才可標`R6 Targeted QA PASS`。

### WP-124-N：R7 visual exclusivity correction（已完成）

- 在Goal view projection邊界新增單一derived visible hierarchy scope；active drag期間只遮罩一般active guide與content tint。
- 保留一般scope state、中性結構線、shared marker、R6 connector presenter及所有drag／commit ownership。

### WP-124-O：R7 targeted QA（已完成）

- S32鎖定單一derived scope同時餵給guide與content-owner projection，不允許只靠CSS隱藏。
- B46從正常Goal入口先證明hover highlight存在，再拖曳並驗證active guide／content tint為0且placement preview為1；
  Escape後preview為0且hover highlight可再次出現。保存代表截圖並執行DEV-068／116／121 protected regressions。

### WP-124-P：R8 preview-result parity correction（已完成）

- S33／B47先量得dot／bar tail與4px endpoint drift，再把Goal presenter設為`surface-preview`、branch endpoint收至rect left。
- 保存同一nested insertion在拖曳中與放開後的branch rect、canonical parent／level、preview／result screenshots。

### WP-124-Q：R8 single hierarchy renderer closure（已完成）

- 移除`GoalTaskTreeInsertionPreview`，將既有row renderer抽為`GoalHierarchyGuides`，由同一segment primitive支援row／fixed-preview座標。
- S34鎖定renderer reuse；B47鎖定preview／result geometry parity，B46只計row-layer active guide以維持R7互斥語意。

### WP-124-R：R9 restore shared insertion marker（已完成）

- S33先要求Goal shared presenter使用`kanban-marker`，在R8 candidate重現失敗後切換既有presentation；不新增元件或狀態。
- B30／B42／B47鎖定standard與armed-child皆同時只有一組樹狀預覽及一組8px dot／6px bar定位線，branch endpoint仍與commit結果一致。

### WP-124-S：R10 Goal floating card half-size correction（已完成）

- S35先鎖定Goal浮卡computed scale 0.5與既有來源識別；修正`scale-[1.02]`為`scale-[0.5]`。
- 不改fixed layer、pointer座標、rotation、marker、hierarchy renderer、adapter或commit。

### WP-124-T：R10 targeted visual QA（已完成）

- B48從正常Goal入口真實拖曳，讀回layout／rendered rect、computed scale、source ID、文字與pointer-events並保存代表截圖。
- 重跑DEV-124完整browser矩陣，確認B30／B42／B47的定位線、樹狀預覽與preview-result parity維持。

### WP-124-U：R11 equivalent boundary preview normalization（已完成）

- 在Goal adapter的純幾何層解析等價可見邊界與presentation anchor；不改host、renderer、marker component或commit descriptor。
- S36 fail-first鎖定after-previous與before-next輸出相同boundary／branch及同方向stem，semantic target仍保留next-before。

### WP-124-V：R11 targeted visual QA（已完成）

- B49以相鄰同parent fixture分別命中上一筆下半部與下一筆上半部；兩者只保留右圖樣式，marker與tree preview各一組。
- 放開before-next後讀回canonical parent／order，並重跑DEV-124完整browser矩陣、TypeScript與targeted lint。
- 執行結果：static 36/36、Chromium 24/24、browser／HTTP error=0；雙態stem／branch／marker rect完全一致，
  before-next仍保留next target與before ordering，放開後previous／moved／next order為0／1／2。兩張代表截圖人工複查PASS。

### WP-124-W：R12 top-down-only standard stem correction（已完成）

- 新增`before first child` fail-first，要求presentation anchor為可見parent且`stemStartY <= boundaryY`。
- 只修改Goal adapter的純幾何選擇；不改shared renderer、marker、host、dwell或commit descriptor。

### WP-124-X：R12 targeted visual QA（已完成）

- 從正常Goal入口拖曳到第一個子項目前，量測parent center、stem、branch、marker與semantic target，保存代表截圖。
- 重跑DEV-124完整static／browser矩陣、TypeScript、targeted lint與diff check。

### WP-124-Y：R13 Goal child-entry window與candidate定位（已完成）

- 在Goal adapter加入純幾何70% centered window；`GoalView`只依縮小後rect啟動shared candidate，不改Board adapter或1000ms authority。
- candidate target以row data state沿用既有location tint；恰一列、無子孫擴散，armed／leave／switch／scroll／cancel同步清除。

### WP-124-Z：R13 fail-first與正常入口視覺證據（已完成）

- S38／S39與B51先重現缺少70%窗口及candidate定位，再驗證outer guard、center candidate、target-only tint與1000ms切換。
- 重跑DEV-124完整static／browser矩陣、TypeScript、targeted ESLint、`build:test`與diff check；人工複查B51代表截圖。
- 執行結果：static 37/37、Chromium 25/25、browser／HTTP error=0；B50量測parent center=`125px`、boundary=`141px`，
  stem=`125→141px`且preview anchor為parent，marker／preview各1。B49、B42、B44、B45與canonical commit回歸均PASS。

### WP-124-AA：R14 armed child parent location projection（已完成）

- 將Goal child target拆成candidate-only marker state與candidate／armed共用的parent location target state；沿用既有色階選擇器，
  不建立第二套樹線或定位元件。
- armed時`data-goal-child-drop-candidate`歸零，但`data-goal-child-drop-target`恆保留同一父任務；子孫定位數量固定為0。

### WP-124-AB：R14 fail-first與armed視覺證據（已完成）

- S40先鎖定armed必須保留target projection；B52先重現修正前armed `targetCount=0`，再驗證修正後target parent恰1、
  descendant target為0、child feedback仍在。
- 執行結果：static 40/40、Chromium 27/27、browser／HTTP error=0；人工複查B52 armed parent location截圖。

工作包順序固定；不得以直接在 Goal 複製 Board handler 跳過 WP-B／C。

## 9. Acceptance Criteria

- AC-124-01：Board／Goal同看板desktop primary drag（含Board root）共用host／layer／commit；adapter無commit callback。
- AC-124-02：Goal 同父層 before／after 為穩定插入，不再交換兩筆 order；顯示與 canonical 結果一致。
- AC-124-03：跨父層、root、nodeType promotion／demotion 與 child append 符合 `taskDropIntent`。
- AC-124-04：self／descendant／origin／missing／archived／stale／viewer／permission revoke 全部 0 write、0 Undo。
- AC-124-05：local-applied move恰為一個batch／一筆Undo；Undo／Redo還原§6的結構欄位，連續兩次drag保留兩步。
- AC-124-06：origin、standard、child feedback 互斥；999ms／1000ms child dwell boundary 正確。
- AC-124-07：相同scroll offsets下rows／rowSpan／table／scroll width／sticky lane不變；scroll後以content座標驗證。
- AC-124-08：filtered hidden siblings 相對順序保留；collapsed-with-hidden-children 不可 child append。
- AC-124-09：controls、editor、node toggle、menu、details、右鍵、`Shift+F10`、Enter／Space 與 X-scroll 不誤拖。
- AC-124-10：Board approved desktop與 mobile行為無回歸；Workbench／tracking 分支無回歸。
- AC-124-11：1440×900、1024×768、814×698 的 normal-entry 真實 browser evidence 無視覺／幾何錯誤。
- AC-124-12：非預期visible／console／HTTP errors為0；預期negative錯誤另列expectedErrors，不可無差別忽略。
- AC-124-13：Board／Goal standard與armed-child共用`DesktopTaskInsertionIndicator`並render同一
  `KanbanInsertionMarker`；Goal另由共用hierarchy renderer顯示恰一組樹狀預覽，兩者共用同一placement descriptor。
- AC-124-14：Goal before Y＝row top；after Y＝visible subtree bottom；child Y＝target visible subtree bottom且X＝next depth；
  standard X＝title anchor、right＝task cell right−4px、width≥24px，量測誤差≤0.5px。
- AC-124-15：exact midpoint歸after；完整marker超出clipped viewport時不顯示且release為no-op；任何frame有效回饋cardinality≤1。
- AC-124-16：Board／Goal child intent共用同一1000ms狀態機；999ms／1000ms、換target、離區與scroll reset結果一致，
  且定位線遵守相同語意錨點但不要求跨layout像素相同。
- AC-124-17：R6已取代candidate無connector條件；armed child恰有一組直系stem＋branch，stem從target rail／row center開始，
  branch在child semantic Y接到resulting title edge；所有reset／terminal路徑同步清除，Board不渲染此connector。
- AC-124-18：R6有意取代AC-124-17的candidate零connector條件；每個有效Goal standard frame皆恰有一組樹線預覽：
  root為root rail到resulting title edge的branch-only；任意深度nested before／after為parent rail上的stem＋branch；armed child為target own rail上的
  stem＋branch。standard→armed只替換一組geometry；origin／invalid為0，Board不渲染Goal connector。
- AC-124-19：Goal active drag期間只允許目前placement connector成為active紫色樹線；一般hover／focus的
  `data-goal-hierarchy-guide-active`與`data-goal-content-scope`投影為0，中性樹狀底線保留。drag end／cancel後
  placement preview歸0，正常hover／focus highlight可再次出現；Board、shared host與commit語意不變。
- AC-124-20：Goal row與fixed preview共用`GoalHierarchyGuides`／同一segment renderer；preview與放開後branch的left／right
  geometry差≤1px，branch右端為title edge／marker wrapper left；Goal semantic anchor內dot／bar各1，Board marker geometry不變。
- AC-124-21：Goal每個有效standard／armed-child frame只有一個`data-goal-drag-tree-preview`與一個
  `data-goal-drag-marker`；origin／invalid／reset／terminal後兩者同步歸0，不增加hit target、timer或commit path。
- AC-124-22：Goal拖曳浮卡computed scale恰為0.5，來源ID、文字、pointer中心定位與`pointer-events:none`維持；
  不改marker／tree preview數量、dwell、hit-test或canonical commit。
- AC-124-23：相鄰同parent的`after previous`與`before next`若映射同一可見boundary，兩者都呈現previous-after樹線幾何；
  marker／tree preview各恰一組，semantic target／orderingPosition與canonical commit維持原值。
- AC-124-24：所有nested standard stem皆滿足`stemStartY <= boundaryY`；`before first child`由可見parent row center沿parent rail
  向下連到boundary，無安全上方anchor時退化為零高度，絕不反向；semantic target／orderingPosition與commit不變。
- AC-124-25：Goal child-entry在candidate與armed各恰有一列`data-goal-child-drop-target="true"`父任務定位；armed時
  `data-goal-child-drop-candidate`可為0但target projection仍為1，descendant target與其他列定位為0；leave／switch／scroll／cancel／drop／unmount後兩者皆為0。

## 10. Stop／Re-entry Conditions

以下任一發生，RD 停止並回規劃模型，不得自行改架構：

- 需要改 schema、API、permission model、canonical hierarchy／filter 或 task identity。
- shared extraction 使 Board approved geometry、手感、mobile、Workbench／tracking 結果改變。
- 需要拆 table、模擬 `rowSpan`、新增第二 X-scroll owner、插入 normal-flow drop row 或解除 252px frozen lane。
- 無法以單一 canonical commit 同時滿足 displayed＝committed、latest-store 與一次 Undo。
- adapter 必須持有第二套 task truth，或 Goal 必須保留獨立 commit 才能完成。
- 需求擴大至 mobile Goal、tracking、Workbench、跨看板、release／production。
- 需要修改`KanbanInsertionMarker`的approved Board視覺／尺寸才能讓Goal成立，或共用presenter造成Board marker geometry drift。
- 開工 readback 發現規劃基準後已有重寫相關拖拉架構，導致 P0／P1 contract 不能套用。

## 11. Architecture Closure Review R14

- 核心邊界：已固定；shared lifecycle／presentation／commit，mode-owned geometry。
- 資料與權限：已固定；latest store、既有 permission、fail closed。
- 本機提交：已固定；root也進primary path、anchor plan、one local batch／structural Undo、at-most-once dispatch；
  遠端原子性與ancestor rollup Undo列為TD-124-01／02，未宣稱解決。
- Goal 幾何：已固定；row top／visible subtree bottom、title／next-depth anchors、4px右inset、24px最小寬、
  8px視覺clipping、midpoint歸after與collapsed child guard。
- Board 相容：已固定；先抽取零行為改變，再開 Goal。
- UI／a11y：已固定；無 normal-flow shift、無新教學 chrome、保留 native table／keyboard semantics。
- Child dwell／reset：已固定；單一shared state machine、999／1000ms、換target／離區／scroll reset與重新命中規則一致。
- 跨模式定位線：已固定為semantic parity；title／subtree／next-depth語意一致，surface adapter保留layout-specific rect。
- Goal tree preview：已固定為所有有效Goal placement各一組connector；root branch-only、nested sibling使用parent rail、child使用target own rail；
  adapter算幾何，row／preview由同一`GoalHierarchyGuides`／segment renderer呈現；shared presenter只保留semantic anchor。
- 拖曳視覺互斥：已固定；active drag期間一般hover／focus active guide與content tint不投影，中性結構線保留，terminal後正常互動恢復。
- 驗證：已固定；fail-first、pure/static、normal-entry browser、三 viewport、error sweep與既有回歸。
- Release：不在本案授權範圍。
- R8維持R7／R6／R4核心ownership，並有意取代Goal可見Kanban marker條款；Board marker、Goal measurement、
  child／midpoint／clipping、dwell／reset、semantic parity、單一hierarchy renderer與connector geometry均已決定，未決架構選擇：`0`。
- R9恢復Goal shared Kanban marker；R10只修正浮卡scale drift，未新增或改變任何架構owner，未決架構選擇仍為`0`。
- R11只在Goal adapter presentation geometry內正規化等價邊界；semantic target、shared renderer與commit ownership不變，
  未決架構選擇仍為`0`。
- R12把所有nested standard stem方向固定為top-down-only；只擴充presentation anchor fallback，不新增owner或元件，
  未決架構選擇仍為`0`。
- R13只新增Goal adapter的70%純幾何window與row-level candidate presentation state；1000ms仍由shared state machine持有，
  Board window、marker、tree renderer、canonical commit與資料契約不變，未決架構選擇仍為`0`。
- R14只新增Goal row-level `childDropTarget` projection，讓candidate→armed持續同一父任務location render；candidate marker、
  shared dwell、child marker／tree renderer、Board、canonical commit與資料契約不變，未決架構選擇仍為`0`。
- R2的local implementation與targeted evidence保留為歷史baseline；因使用者已指出新的可見失效，不能沿用為R3完成證據。
- RD 可自行決定：內部 hook 名稱、小型 helper 拆分、測試 fixture ID、type field 命名；不得改責任邊界、
  work package 順序、Goal collapse rule、canonical commit 或 protected surfaces。

結論：`R14 Implementation + Targeted QA PASS / RD Implementation Complete / 架構已定案 / QC Pending / NOT RELEASED`。
WP-124-F～AB已完成。R14不改Board window／marker、canonical commit或protected surfaces；獨立QC、真機與release仍未執行。
R14 source SHA-256：`GoalView.tsx` `6CD3A4E17D6AD0B5426263B12524C9923AB165BF620893BC55610A1B0BA16545`、
adapter `4893A5A65ED48F0076FBF433FA88D2B7235C045C9CBDD633ABB672F9D83EC357`、CSS
`87BA9DC9324B25D31F6D5607AB5DC3AD82C676346098C4F71EEBD722FF8F5CF9`、static verifier
`A8E6BC26BE8D1699DBFEDCCA7BDF0395EFD2C4A18E2136397969551900AC57B0`、browser verifier
`7800DF700511057C2C327CB3CA4813CD9972FE2BC2B841EF1758C3A904D1CBC3`。

使用思考習慣：#問對問題、#系統描繪、#可驗證性
