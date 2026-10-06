# QA-DEV-124：共用桌面任務拖拉核心驗證計畫

- 版本：R14，2026-09-17；armed child持續父任務定位
- 狀態：`Executed / RD Implementation Complete / 架構已定案 / R14 Targeted QA PASS / QC Pending / NOT RELEASED`
- 對應：[DEV-124](../dev_task.md#dev-124okr-共用看板任務拖拉核心)
- 規格：[SPEC-124](../specs/SPEC-124-shared-desktop-task-drag-host.md)
- 決策：[ADR-052](../decisions/ADR-052-shared-desktop-task-drag-surface-adapters.md)
- 風險：Medium（使用者可見互動、多檔共用元件與Board／Goal回歸；無schema／permission／production變更）
- Gate：R13 evidence保留為baseline；R14須先重現armed後父任務定位消失，再證明candidate→armed仍恰一列父任務target projection、子孫為0且child feedback維持。

## 1. 驗證目標

證明 Board 與 Goal 由同一 desktop drag lifecycle／feedback／canonical primary commit 驅動，同時保留各自 layout；
使用者在 Goal 放開前看見的 before／after／root／child intent 等於最後 parent／order／nodeType，成功 move 恰為一次
local batch／structural Undo，所有dispatch前invalid／cancel／stale／permission negative都是零寫入。另需證明native table、`rowSpan`、
252px frozen task-name lane、single X-scroll、controls 與 Board approved behavior 無回歸。

## 2. Candidate freeze 與環境

執行者必須在同一 candidate 保存：

- branch、HEAD、`git status --short`、受影響檔 SHA-256、Node／npm／Playwright 版本。
- runtime URL／port／PID tree／啟動命令／用途／cleanup condition。
- browser、viewport、device scale、locale、timezone。
- static／browser 結果 JSON、console、failed requests／responses、screenshots 與 geometry snapshot。

local runtime 是 task-owned temporary runtime。開始前記錄 owner；結束時只停止該 process tree，確認 port released。
可安全重用已確認相符runtime，但不得停止別的task／使用者所持有的runtime；只開task-owned browser tab。
browser QA 必須走正常入口，不可用 direct store switch 取代 UI 操作。

規劃基準為 branch `持續優化3`、HEAD `7b16ddf6e3af1d3bf26e3267c19de33fe343ecd4`；開工時若 source drift，
先做 Architecture Drift Audit。規劃時工作樹已有 Goal 與文件修改，不得 reset 或覆蓋。

### 2.1 R2 歷史基線（不得當作 R3 完成證據）

- PASS：`npm run verify:dev-124-shared-desktop-task-drag-host`（19/19）；`npm run verify:dev-124-shared-desktop-task-drag-host-browser`（B01～B04，browser／HTTP error=0）；DEV-116 static 30/30、browser 42/42；DEV-119 browser 17/17；DEV-120 browser 19/19；DEV-121 static 24/24、browser 34/34（含 B14 全欄位收合與 B15 account-scoped reload）；所有上述 Goal browser 均無 browser／HTTP／visible error。
- PASS：既有相容集合 `DEV-053` static 31/31、browser；`DEV-054` static 49/49、browser 15/15；`DEV-055` static 34/34、browser 18/18；`DEV-058` static 26/26；`DEV-084` static 7/7、browser；`DEV-086` static／browser；`DEV-089` static randomized／failure browser；`DEV-095` static 4/4、browser 8/8；`DEV-039` static／browser；`DEV-044` static 27/27、browser。`npx tsc --noEmit`、targeted ESLint（0 error；Board既有2 warnings）、`npm run build:test`、`git diff --check` 均通過。
- PASS：`DEV-068` static 101、browser 完整矩陣 40/40（來源 placeholder、expanded L2 standard boundary、invalid cycle、desktop cancel matrix、mobile trials／viewport；console／HTTP／visible error=0）。本輪修正 shared Host visibilityState cancel、TaskPlacementTree wrapper selectors 與 column-tail geometry，未放寬產品行為。
- DEV-124 artifact：`output/qa/dev-124-shared-desktop-task-drag-host/static-result.json`、`output/playwright/dev-124-shared-desktop-task-drag-host/result.json`、`output/playwright/dev-124-shared-desktop-task-drag-host/B05-dev124-goal-drag-host.png`。

上述證據在其source state與案例範圍內仍有效，但未驗證Goal共用`KanbanInsertionMarker`、dot／bar visual、
visible subtree bottom、next-depth child anchor或exact midpoint；這些缺口已由R3 B30～B35補驗。

### 2.2 R3 fail-first 與 candidate gate（已執行）

- fail-first必須在未修正working tree證明至少一項真實行為失敗：Goal找不到shared marker DOM、after line落在row bottom而非
  visible subtree bottom、armed child X未移至next depth，或exact midpoint未歸after；不得以新component尚不存在作唯一證據。
- candidate freeze已在WP-124-F完成後重新記錄source hashes、browser、viewport、fixture與artifact；R2 screenshot未代替。
- 正向案例需同時保存marker DOM／rect、feedback descriptor與放開後canonical nodes；只看到線或只看到資料移動都不足。

R3 fail-first確認原始working-tree曾有Goal專用2px marker、單列bottom／全lane rect、child只改data attribute與`>` midpoint；
修正後candidate通過static S01～S23與browser B30～B36；其中S20～S23分別鎖定shared presenter、無Goal專用線、
midpoint與Goal anchor／subtree geometry。R3 artifact：
`output/qa/dev-124-shared-desktop-task-drag-host/static-result.json`（23/23）、
`output/playwright/dev-124-shared-desktop-task-drag-host/result.json`（B01～B04、B30～B36），
Chromium 1440×900、browser／HTTP error=0。
Candidate source SHA-256：`GoalView.tsx` `578358A1…5C413`、`BoardView.tsx` `5B1D2B40…9BB3D2`、
`DesktopTaskDragLayer.tsx` `688442D6…7B27CD`、`goalDesktopTaskDragAdapter.ts` `E2409FED…1685BFD`、
`TaskChildDropPreview.tsx` `E620DE1F…31257DA`；static verifier `9B389E67…741C7BD`、browser verifier
`A547CFAA…F1086F`。candidate browser／viewport固定為Chromium／1440×900；runtime使用既有已確認的localhost:4000 test server。
相容回歸已同步通過：DEV-068 static 101/101／browser 40/40（完整 log=`output/dev068-full-latest.log`）、
DEV-116 static 30/30／browser 42/42、DEV-121 static 25/25／browser 34/34；上述皆為同一candidate的local evidence。

### 2.3 R4 shared dwell authority 與reset gate（已執行）

- fail-first：新增S24～S27後，未修正candidate只有S26失敗，原因是Goal仍持有本地`1000ms` timer／candidate refs；
  S24精確999／1000ms與S25換target／離區已證明共用狀態機本身正確。
- 修正：Goal改接`advanceTaskChildIntent`／`getTaskChildIntentRemainingMs`；Board與Goal都由shared host的scroll事件
  清除pending intent、marker與幾何cache。重新命中才從0計時。
- static artifact：S01～S27，27/27 PASS；browser artifact：B01～B04、B30～B41，共16/16 PASS；
  Chromium 1440×900、browser error=0、HTTP error=0。
- R4新增browser證據：B37 Goal dwell前仍standard、B38換target與離區reset、B39 Goal scroll reset、
  B40 Board candidate→armed與shared presenter、B41 Board scroll reset。
- 精確999／1000ms只由注入clock的S24判定；browser以candidate／armed DOM phase與足量margin驗證，不以999ms sleep冒充精準計時。

### 2.4 R5 tree connector re-entry gate（已執行）

- Spec Impact=`Compatible exception / additive re-entry`；不改canonical intent、commit、Board geometry或shared marker。
- fail-first新增S28／S29，至少證明R4 adapter沒有connector geometry、Goal沒有armed-only presenter；不能只用新檔不存在當唯一證據。
- browser新增B42／B43：candidate零connector；armed stem／branch連到shared marker圓點；switch／scroll／cancel同步清除。
- connector是同一child feedback內的`aria-hidden`輔助視覺，不增加feedback cardinality或可聚焦元素。
- fail-first結果：R4 candidate的S28／S29如預期失敗，其餘27項維持PASS；修正後29/29。
- browser結果：18/18 PASS，browser／HTTP error=0；B42幾何與代表截圖人工複查PASS，B43 reset／cancel PASS。
- candidate SHA-256：`GoalView.tsx` `15958332…4A44A9`、adapter `9001EB3F…B6BD9`、presenter
  `1D6A0BB3…8A269`、CSS `E5E4B400…145DD1`、static verifier `6CDC4CB3…75BCFB`、browser verifier `4A888350…F7DC91`。
- source SHA-256：`GoalView.tsx` `378EF465…34F06C5`、`BoardView.tsx` `3E7B3ACD…607EA5C6`、
  `taskChildDropTarget.ts` `31A52D92…6E5D545`、static verifier `707D1FF1…A307007`、browser verifier
  `392446E1…318894F`。

### 2.5 R6 all-placement tree connector gate（已執行）

- Spec Impact=`Intentional replacement`：只取代R5 candidate零connector條件；canonical intent／commit、Board geometry、
  shared marker、dwell、parent／order、Undo與permission均不變。
- fail-first新增S30／S31：root與nested standard必須有geometry；presenter必須支援branch-only與向上／向下stem；
  Goal必須在valid standard frame選擇standard geometry，armed時只選child geometry。
- browser新增B44／B45：root standard branch-only；深層nested before／after使用parent rail、row center、semantic boundary與marker dot center。
- origin／invalid保持0 connector；standard→armed、scroll、cancel與terminal不得留下雙線或stale geometry。
- R6通過門檻：static 31/31、browser 20/20、browser／HTTP error=0，並完成DEV-068／116／121 protected regressions與代表截圖人工複查。
- 執行結果：fail-first只有S30／S31失敗、既有29項維持PASS；修正後static 31/31、Chromium 20/20、browser／HTTP error=0。
  B44 root branch-only與B45 depth-2 before／after geometry均PASS，B45代表截圖人工複查PASS。
- protected regressions：DEV-068 101/101＋40/40、DEV-116 30/30＋42/42、DEV-121 25/25＋34/34；
  TypeScript、targeted ESLint、`build:test`、`git diff --check` PASS。
- R6 candidate SHA-256：`GoalView.tsx` `46BE0FC…6B344C`、adapter `C8CA958…EA95AA`、presenter
  `FEA6DE8…9FA72C`、static verifier `13A301D…7BE64`、browser verifier `509DC37…FDA16`。

### 2.6 R7 visual exclusivity gate（已執行）

- Spec Impact=`Implementation needs correction`：R6已固定每個frame只准一組connector；本輪只排除拖曳時一般hover／focus active guide。
- fail-first新增S32與B46：修正前拖曳時`data-goal-hierarchy-guide-active`非0；不得只以新識別字不存在作為唯一失敗證據。
- candidate gate：拖曳前hover active guide > 0；拖曳定位時placement preview=1、active guide=0、active content scope=0；
  Escape後placement preview=0，再hover時active guide > 0。中性guide可存在且不計入active基數。
- Board DOM／shared host／geometry／commit不得修改；代表截圖需人工複查只有目前定位connector為紫色active線。
- 執行結果：fail-first S32失敗；B46未修正時drag前／drag中active guide皆為3。修正後static 32/32、browser 21/21，
  B46為placement preview=1、active guide=0、active content=0、中性guide=11、取消後preview=0、再hover active guide=3；
  browser／HTTP error=0，代表截圖人工複查PASS。
- protected regressions：DEV-068 101/101＋40/40、DEV-116 30/30＋42/42、DEV-121 25/25＋34/34；
  TypeScript、targeted ESLint、`build:test`、`git diff --check` PASS。
- R7 candidate SHA-256：`GoalView.tsx` `061393B1…FA1BA97`、static verifier `AE193680…6371F4E`、browser verifier
  `D6F794DD…A7999C5`。

### 2.7 R8 preview-result parity與single-renderer gate（已執行）

- Spec Impact=`Intentional replacement`：Goal不再顯示Kanban dot／bar；shared presenter保留semantic anchor，Board marker不變。
- fail-first S33／B47：舊preview branch=`370.39→388.78px`，result=`370.39→384.78px`，Goal dot／bar各1。
- candidate：Goal presenter=`surface-preview`、branch endpoint=semantic rect left；preview與result branch left／right差≤1px，dot／bar=0。
- architecture gate S34：`GoalView`不得引用`GoalTaskTreeInsertionPreview`；row／preview都使用`GoalHierarchyGuides`，且由同一
  `GoalHierarchyGuideSegment`輸出kind class、active stroke與owner metadata。
- B46的active-guide互斥限定row layer；preview layer仍由同一renderer以active style顯示，drag期間row active=0、preview=1。
- 執行結果：static 34/34、Chromium browser 22/22、browser／HTTP error=0；B47 preview／result X皆為
  `370.39→384.78px`，canonical parent=`dev124-child-a`、level=2，前後截圖人工複查PASS。
- R8 candidate SHA-256：`GoalView.tsx` `A1894E2A…B42BCA5C`、`GoalHierarchyGuides.tsx` `84FE45B4…409059B6`、
  `DesktopTaskDragLayer.tsx` `FE70172C…A4E8C5D0`、adapter `0229002B…3BC5F4FA`、CSS `A76D60D4…26B8D970`、
  static verifier `C12C0152…467DD041`、browser verifier `0A521C68…153FF34`。

### 2.8 R9 restored insertion marker gate（已執行）

- Spec Impact=`Intentional replacement`：只取代R8的Goal marker suppression；單一hierarchy renderer與title-edge endpoint不變。
- fail-first：更新S33要求Goal使用`kanban-marker`後，R8 candidate因仍為`surface-preview`而失敗。
- candidate：Goal standard／armed-child各有一個8×8px dot與6px bar；樹線preview仍恰一組且branch止於marker wrapper left。
- browser：B30驗證standard dot／bar，B42驗證armed-child樹線＋marker，B47驗證preview／result branch parity及dot／bar各1。
- 執行結果：static 34/34、Chromium 22/22、browser／HTTP error=0；B47 preview／result皆為
  `370.39→384.78px`，canonical parent=`dev124-child-a`、level=2，代表截圖人工複查PASS。
- protected static regressions：DEV-068 101/101、DEV-116 30/30、DEV-121 25/25；TypeScript、targeted ESLint與
  `build:test` PASS。build僅有既有chunk-size與Browserslist資料提示，無編譯失敗。
- R9 candidate SHA-256：`GoalView.tsx` `3C74C65D…C76CA77`、static verifier `2AE120A9…2D7351D`、
  browser verifier `D0F61D78…49885F5`。

### 2.9 R10 Goal floating card half-size gate（已執行）

- Spec Impact=`Implementation needs correction`：SPEC既有scale 0.5契約不變；產品仍為`scale-[1.02]`。
- fail-first：新增S35後舊實作如預期失敗；只修正Goal浮卡class，不改shared marker、tree renderer、adapter或commit。
- B48由正常Goal入口真實拖曳，讀回computed scale `0.5`、來源ID `dev124-root-b`、文字與`pointer-events:none`。
- fixture layout為128×38px，rendered rect為64.36×20.11px；高度差異來自保留的1°旋轉外接矩形，computed scale為判定權威。
- 執行結果：static 35/35、Chromium 23/23、browser／HTTP error=0；B30／B42／B47維持PASS，代表截圖人工複查PASS。
- TypeScript與targeted ESLint PASS；未重跑build:test與protected suites，因本輪只改單一scale class且DEV-124完整browser矩陣已覆蓋受影響互動。
- R10 candidate SHA-256：`GoalView.tsx` `B6173C72…A9B50E8`、static verifier `3D0C3E27…5ED19C`、
  browser verifier `5D8C0373…3E661`。

### 2.10 R11 equivalent sibling boundary gate（已執行）

- Spec Impact=`Intentional replacement`：只統一等價可見邊界的presentation anchor；semantic target／orderingPosition與commit不變。
- S36：相鄰同parent rows的after-previous與before-next需輸出相同boundary／branch，before-next的stem start改用previous row center；
  target仍為next、position仍為before。source／source descendant不得被選為presentation anchor。
- B49：正常Goal入口建立相鄰同parent fixture，分別命中上一筆下半部與下一筆上半部；量測marker／stem／branch rect、owner metadata、
  feedback cardinality與放開後canonical parent／order，保存兩態對照截圖。
- Fail：同一boundary仍出現next-before向上stem、marker或tree preview>1、target被改寫為previous-after、或canonical結果不同。
- Fail-first：S36在修正前重現after-previous與before-next的stem方向／anchor不同；其餘35項維持PASS。
- 執行結果：修正後static 36/36、Chromium 24/24、browser／HTTP error=0；TypeScript與targeted ESLint PASS。
- B49量測：兩態stem皆為`29.890625,157→31.890625,173`、branch皆為`30.390625,172.5→44.78125,174.5`、
  marker皆為`44.796875,165→247.5,181`；preview anchor皆為`dev124-grandchild-a`。
- Semantic／commit readback：before-next仍回報target=`dev124-grandchild-a2`、position=`before`；放開後moved parent為
  `dev124-child-a`，previous／moved／next order為0／1／2，證明顯示正規化未改寫canonical placement。
- R11 candidate SHA-256：`GoalView.tsx` `73958AABA66ECBC84F6D5BFFCC62062A02C73248DDD36BB1632BFAB7F20987A9`、
  adapter `059049532176EC132D6261D628A6939C3328E2DDFA659E47A316399ADB82596E`、static verifier
  `DA22781E11E0DF5E647A51FDFEFBA6033A490AC6EE5C155C329A0343A352BB3D`、browser verifier
  `2B2BDDA54130BED2530BC46A3D6C478E247F7CDB2E31F3201D4858DA05F2CEC6`。

### 2.11 R12 top-down-only nested standard stem gate（已執行）

- S37：`before first child`必須保留child＋before semantic target，但presentation anchor改為可見parent；
  stem沿candidate parent rail且`stemStartY <= stemEndY === boundaryY`。
- B50：正常Goal入口將Root B拖到Grandchild A上半部；量測parent row center、stem／branch／marker、preview anchor與target metadata。
- 回歸：B49等價兄弟雙態geometry、B42 armed child、B44 root branch-only、B45 nested before／after與canonical commit均須維持。
- Fail：任一nested standard stem出現`stemStartY > boundaryY`、使用目標列下方反向連線、feedback重複或semantic target被改寫。
- Fail-first：修正前S30與S37失敗；第一個子項目的before仍以目標中心作anchor，stem=`48→32`，確認為反向。
- 執行結果：修正後static 37/37、Chromium 25/25、browser／HTTP error=0；B50從正常Goal入口PASS並完成截圖人工複查。
- B50 readback：target=`dev124-grandchild-a`、position=`before`、preview anchor=`dev124-child-a`；parent center=`125px`、
  boundary=`141px`、stem rect top／bottom=`125／141px`，marker／preview count=`1／1`，證明只有top-down單一回饋。
- 回歸結果：B49兩種等價boundary仍完全同形；B42 child stem、B44 root branch-only、B45 nested before／after、B47 preview-result、
  B46互斥與Board B36／B40／B41均PASS。TypeScript、targeted ESLint與diff check PASS。
- R12 candidate SHA-256：`GoalView.tsx` `73958AABA66ECBC84F6D5BFFCC62062A02C73248DDD36BB1632BFAB7F20987A9`、
  adapter `2C7CE7DBB9113449CB2615840C2E319DD0CF2B0E21F7C086717F73B4C6AE0A0A`、static verifier
  `8C3182235DEEC52F71521437C270C201E97E0A76A13641C84AFF85A8F1E0889A`、browser verifier
  `F71AF0422AAC2199197A3208B2BE87778659826C0ACCC5E9E0DFBA517DB21DDB`。

### 2.12 R13 Goal child-entry window與candidate定位 gate（已執行）

- S38：100×40px rect必須收斂為中心70×28px（left／right=`25／95`、top／bottom=`26／54`），比例常數只能由Goal adapter持有。
- S39：candidate phase只把target ID投影為row data state，沿用既有location tint；不得恢復一般drag hover scope或建立第二個preview元件。
- B51：正常Goal入口先把pointer放在原primary rect內、縮小window外並停滿1000ms，candidate count須為0且marker仍為standard；移到中心後第一個可觀察frame須恰有一個target row tint、descendant為0且marker仍為standard；再滿1000ms後tint為0、marker轉child。
- Fail-first：S38／S39先失敗；B51讀回outer edge candidate=0、中心candidate=0但1000ms後child成立，證明缺口是起算期間沒有目標定位。
- 執行結果：修正後static 39/39、Chromium 26/26、browser／HTTP error=0；B51讀回candidate target=`dev124-root-a`、background=`rgba(224, 231, 255, 0.72)`、descendant candidate=`null`，armed後candidate count=0／feedback=`child`。
- 代表截圖：`output/playwright/dev-124-shared-desktop-task-drag-host/B51-dev124-goal-child-candidate-location.png`，人工複查PASS。
- TypeScript、targeted ESLint、`build:test`與diff check PASS；Board B36／B40／B41、R12 B50、R11 B49與既有Goal tree／marker cases均PASS。
- R13 candidate SHA-256：`GoalView.tsx` `CC760959178D4B10DD11DB12019C9CF10989C736079881BB3AB76B2EF0581EC2`、adapter
  `4893A5A65ED48F0076FBF433FA88D2B7235C045C9CBDD633ABB672F9D83EC357`、CSS `3D17FF66C7F70406CA7B2A59A234351126805A9687AD5257AAF9F0BF32192209`、
  static verifier `F6DECE42EF77FEC6CB364C2FD3750558F563EBA41D7992DE5521E617C6FB26AE`、browser verifier `7328BC9162EB9D2045C90E41E1F591BF5B8654756D0EF412E611A9CBCE614735`。

### 2.13 R14 armed child持續父任務定位 gate（已執行）

- S40：`goalChildTargetId`在candidate／armed皆需有值，Goal row必須投影唯一`data-goal-child-drop-target="true"`；armed時candidate專用屬性可清除。
- B52：正常Goal入口進入child candidate並滿1000ms後，armed階段`targetCount=1`、`targetId=dev124-root-a`、`descendantTarget=null`，
  `markerFeedback=child`；離開／terminal cleanup仍須歸零。
- Fail-first：修正前S40失敗；B52讀回`targetCount=0`、`targetId=null`，證明armed切換會錯誤移除父任務定位。
- 執行結果：修正後static 40/40、Chromium 27/27、browser／HTTP error=0；B51與B52均讀回armed target parent恰1、子孫0，
  代表截圖`B52-dev124-goal-armed-parent-location.png`人工複查PASS。
- TypeScript、targeted ESLint、`build:test`與diff check PASS；Board B36／B40／B41、R13 B51、R12 B50、R11 B49與既有Goal tree／marker cases均PASS。
- R14 source SHA-256：`GoalView.tsx` `6CD3A4E17D6AD0B5426263B12524C9923AB165BF620893BC55610A1B0BA16545`、adapter
  `4893A5A65ED48F0076FBF433FA88D2B7235C045C9CBDD633ABB672F9D83EC357`、CSS `87BA9DC9324B25D31F6D5607AB5DC3AD82C676346098C4F71EEBD722FF8F5CF9`、
  static verifier `A8E6BC26BE8D1699DBFEDCCA7BDF0395EFD2C4A18E2136397969551900AC57B0`、browser verifier `7800DF700511057C2C327CB3CA4813CD9972FE2BC2B841EF1758C3A904D1CBC3`。

## 3. 正常入口與 controlled fixture

### 3.1 UI entry

1. 以 editor 身分進入產品正常首頁。
2. 選擇具 fixture 的專案／看板。
3. 使用 View selector 切至 OKR／Goal。
4. 在 task-name primary surface 以主滑鼠拖拉；不用隱藏 debug command 直接觸發 DnD。
5. Board regression 同樣由 View selector 回到 Board 並以真實 pointer 執行。

### 3.2 Fixture

- Root A：A1、A2；A1 下有 A1.1、A1.2；A1.1 下有 A1.1.1。
- Root B：B1、B2；B1 下有 B1.1；Root C 為無子 leaf。
- 至少一個空白 title 任務、一個 archived task（不顯示／不可 target）。
- A1 展開、B1 可切換收合；filtered view 隱藏 A1.1 或 A2，用來驗證 hidden sibling order。
- 任務目的與會議紀錄需同時涵蓋 owner row、covered descendant row 與相鄰 root boundary 的 `rowSpan`。
- planning cells 包含 status、assignee、dates、duration；至少一個 content editor 可進入編輯。
- editor、viewer 兩種帳號／權限；另有 drag start 後 release 前撤回 permission 的可控 case。
- store mutation／batch／Undo counter；可讀回完整 canonical nodes，而非只依 DOM 排序。
- order變體：連續整數、`[0,0.1,0.2,0.3]`、重複order；另備未修改的完整snapshot比對子樹連結。
- rollup變體：source／destination父層含不同completed／todo組合，保存baseline與candidate的ancestor狀態。

每個 case 前回復同一 fixture snapshot；禁止依前一 case 的殘留 order／collapse／filter state。
fixture boot／permission revoke可用現有test harness注入；拖拉、切view、Undo／Redo必須走可見UI。
每次檢查fixture task數、canonical IDs與rowSpan owner非空，資料載入失敗不可當作0-write PASS。

證據適用範圍：本機test backend只證明local structural mutation與UI；不能證明production persistence。
SPEC-124 TD-124-01／02為已揭露的繼承限制，需單列baseline差異；不能因此忽略新增的錯誤或假造durable PASS。

## 4. FMEA 與 coverage

| ID | 失效模式 | 影響 | 優先級 | 控制／證據 |
|---|---|---|---|---|
| F01 | marker 顯示 before，但 commit 成 after／child | 使用者誤放 | P0 | displayed semantic descriptor 與 release revalidation／canonical readback 一致 |
| F02 | release／cancel race 造成重複 batch／Undo | 資料損壞 | P0 | session terminal guard；mutation、batch、Undo counters |
| F03 | `rowSpan` covered cell 命中錯 task | 錯 parent/order | P0 | pointer Y 對 visible task rows；owner／covered geometry cases |
| F04 | filtered hidden siblings 被重排或遺失 | 隱性資料順序錯誤 | P0 | full canonical sibling readback before／after |
| F05 | self／descendant／stale target 繞過 cycle guard | cycle／孤兒 | P0 | pure intent＋browser negative；0 write |
| F06 | 拖拉 transform 改變 table row／rowSpan 幾何 | 對照錯列 | P1 | before／during geometry diff；0 normal-flow displacement |
| F07 | shared extraction 改變 Board approved behavior | 成熟功能回歸 | P0 | DEV-053／055／058／068 browser regressions |
| F08 | planning／editor／toggle／menu 啟動拖拉 | 誤操作 | P1 | control matrix＋8px／click／keyboard cases |
| F09 | Escape／blur／hidden／resize 後殘留 overlay／timer | ghost UI／誤 commit | P1 | cleanup matrix、DOM／body／timer readback |
| F10 | 收合 target child append 後來源消失 | 無法理解結果 | P1 | collapsed-with-hidden-child 禁止 armed；展開後 positive |
| F11 | permission start/release 不一致仍提交 | 未授權修改 | P0 | viewer／mid-drag revoke；0 write |
| F12 | visible／console／HTTP error 被忽略 | 偽 PASS | P1 |每 case error sweep；任一 error fail |
| F13 | origin、standard、child 同時出現 | 意圖衝突 | P1 | feedback cardinality ≤ 1 assertion |
| F14 | Undo漏還原受影響sibling order／source nodeType | 結構無法復原 | P0 | before／move／undo／redo的結構快照；ancestor狀態另列TD-124-02 |
| F15 | ±0.5跨過密集／重複order anchor | 落點與排序不符 | P0 | exact sibling ID序列；整數／小數／tie三組 |
| F16 | 不可見frame／scroll舊rect／延遲timer擁有release | 未顯示即提交 | P0 | presented frame序號、scroll offsets、timer／release交錯 |
| F17 | local-applied被當成遠端成功 | 偽儲存保證 | P1 | 拒絕遠端success assertion；同步throw與special async failure分開記錄 |
| F18 | 共用host全域禁用Board keyboard／touch | 相容性退化 | P1 | Board keyboard baseline與既有mobile suite；Goal維持mouse-only |
| F19 | Goal仍使用專用2px線或缺少dot／bar | 跨模式心智模型不一致、落點不易辨識 | P1 | shared presenter component identity＋computed style＋screenshot |
| F20 | after線落在父列bottom而非visible subtree bottom | 插入父任務子樹中間 | P0 | row／subtree rect量測＋canonical readback |
| F21 | armed child線未移至next depth或standard／child雙顯 | 誤判父子層級 | P0 | 999／1000ms rect與cardinality assertion |
| F22 | full-lane、viewport外或midpoint邊界仍可提交 | 錯位／看不見仍寫入 | P0 | title／cell／clip rect、midpoint、0-write cases |

P0／P1 failure 未清零不得進 QC Ready。

## 5. Static／pure contract cases

| ID | Case | Expected |
|---|---|---|
| S01 | 共用責任與呼叫路徑 | Board／Goal共用host／layer；type-only檔可合併，不測固定檔數 |
| S02 | 掃描 `GoalView` | 無 Goal-owned `DndContext`、`DragOverlay`、swap／`over.order + 0.5` commit |
| S03 | adapter／root分支邊界 | adapters無commit callback；Board root也走primary commit，special仍用facade |
| S04 | shared layer | 重用 origin／marker／child primitives；不插入 table row |
| S05 | source kinds／semantic descriptors | Goal row 不偽裝成 Kanban DOM；root／non-root／child mapping 正確 |
| P01 | 同父層 before／after | 完整 sibling normalization，無兩筆 swap |
| P02 | 跨父層 before／after | parent、order、nodeType 正確 |
| P03 | root promotion／demotion | root→root保留nodeType；非root→root為group；root→child為task |
| P04 | child dwell 999／1000ms | 999 candidate、1000 armed |
| P05 | self／descendant／missing／archived | invalid／0 update |
| P06 | origin | no-op／0 update |
| P07 | visible anchor＋hidden siblings | hidden relative order保留 |
| P08 | collapsed target含 hidden children | child append 不可 armed |
| P09 | leaf／expanded target child append | append order 使用所有 canonical children |
| P10 | latest-store target移除／source變更 | release invalid／0 update |
| P11 | permission撤回 | failed closed／0 update |
| P12 | terminal 重入 | end／cancel／blur 任意順序最多一個 terminal result |
| P13 | local-applied commit | 1 batch／1 Undo；root reorder 0次rollup、其他normal move沿現況1次；不等同1 HTTP |
| P14 | feedback reducer | origin／standard／child 任一時刻最多一個 |
| P15 | cleanup events | 所有 transient state、timer、body state 清空且 idempotent |
| P16 | dense／duplicate order與hidden sibling | exact anchor splice，不因±0.5跨過鄰居 |
| P17 | source／target不同board／workspace或access loading | normal primary 0 dispatch；不降級special |
| P18 | end／cancel／舊timer／special Promise交錯 | terminal／dispatch最多一次；舊session不清新UI；送出後不宣稱cancelled |
| P19 | 根列label／非root nodeType | 檢查canonical move plan與Board root baseline皆一致 |
| P20 | local batch同步throw／special async reject | failed且UI清理；dispatch後不斷言零寫入或自動rollback |
| P21 | 無關title改變／相關sibling改變 | 前者可提交；後者plan不一致0 dispatch |
| P22 | shared insertion presenter | Board／Goal standard與armed child皆使用同一presenter→`KanbanInsertionMarker`；無Goal-only 2px線 |
| P23 | Goal standard geometry | before=row top、after=visible subtree bottom、left=title anchor、right=cell right−4、width≥24 |
| P24 | Goal child geometry | candidate維持standard；1000ms armed後Y=subtree bottom、left=next-depth anchor、cardinality=1 |
| P25 | exact midpoint | `pointerY === midpoint`穩定解析為after，preview與release descriptor一致 |
| P26 | marker visual clipping | 8px視覺範圍不完整落在lane∩viewport時不呈現、不提交；捲動重測後才可用 |
| P27 | cross-mode dwell authority | Board／Goal都呼叫同一phase transition與remaining-time helper；Goal無本地1000ms timer |
| P28 | leave／switch／scroll reset | 換target從0計時；離區／scroll清除pending與marker；重新命中前不可armed／commit |
| P29 | Goal armed tree connector geometry | rail＝target own tree rail；stem start＝clipped row center；boundary＝child semantic Y；branch end＝resulting title edge |
| P30 | Goal presenter ownership | candidate／origin／invalid無connector；armed target-match才render；Board不import Goal presenter；presenter無state／timer／commit |

Static verifier 不得只比對文字 token；至少 import pure resolver／adapter helper，對 fixture 驗證結果。
fail-first以現行三兄弟插入或table geometry的實際失敗為證，不能用「新module不存在」代替。
既有source-location檢查若因抽取失效，可遷移到新owner並附等價行為case；不得刪除行為oracle讓測試變綠。

## 6. Goal normal-entry browser cases

| ID | 操作 | Expected／Evidence |
|---|---|---|
| B01 | A2 拖到 A1 前 | marker before；canonical order 一致；1 batch／1 Undo |
| B02 | A1 拖到 A2 後 | after 使用 A2 visible subtree bottom；整個 A1 subtree 保持連續 |
| B03 | A2 拖到 B1 前 | parent 改為 Root B；nodeType／order 正確 |
| B04 | A1.2 拖到 Root C 前／後 | root placement 正確；不需額外 drop row |
| B05 | A2進入A1 primary scope，在candidate frame release | 不child append；結果等於最後已呈現standard／origin |
| B06 | 同位置等待armed frame出現再release | 唯一child marker；成A1最後canonical child |
| B07 | 拖回原位 | origin feedback；0 write／0 Undo |
| B08 | A1.1拖到A1.1.1；自身primary另見B07 | descendant invalid無marker；自身origin；兩者0 write／0 Undo |
| B09 | Escape／pointercancel | overlay／marker／timer 全清；0 write |
| B10 | window blur／pagehide／hidden | 同 B09；回到頁面無 ghost feedback |
| B11 | resize／orientation change／unmount view | cancel且清理；不可用舊 geometry commit |
| B12 | 點擊／拖動 status、date、assignee、duration、content editor | 原控制正常；drag session=0 |
| B13 | node toggle、details、右鍵、`Shift+F10`、Enter／Space | 原行為正常；不新增 keyboard drag |
| B14 | viewer 嘗試拖拉 | session不可啟動或 release fail closed；0 write |
| B15 | editor drag開始後撤回permission／access loading | release 0 dispatch並清feedback；不要求另加錯誤toast |
| B16 | target 在 drag 中被刪除／收合／filter 隱藏 | release重驗失敗；0 write |
| B17 | filtered hidden sibling fixture before／after | visible結果合理；unfilter後 hidden relative order不變 |
| B18 | 收合 B1（有 hidden child）停留中央 | 不 armed child；只允許 before／after |
| B19 | 展開 B1 重做 | 1000ms 後可 child append |
| B20 | rowSpan owner／covered descendant／root boundary 各拖一次 | target identity、marker與 canonical readback皆正確 |
| B21 | blank title task | overlay／anchor不崩潰；commit規則相同 |
| B22 | move後Undo／Redo；同task再做第二次move | 結構欄位完整還原／重做，兩次drag分成兩步Undo；ancestor差異另列TD-124-02 |
| B23 | 快速 end＋blur／cancel race | 恰一 terminal、最多1 batch／Undo |
| B24 | 水平捲動後拖拉 | frozen lane left與marker alignment正確；single X-scroll owner |
| B25 | 指標移至comparison cells、sticky header、表外 | target／dwell立即清除、0 dispatch |
| B26 | 垂直scroll後分別於重繪前／後release | 前者no-op；後者僅能提交已重新呈現的plan |
| B27 | filter後非root出現在首列／最淺visible depth | 仍依canonical parent解析，不能誤升root |
| B28 | insertion在viewport外／剛好midpoint／超長subtree收合後重排 | 看不到marker不可提交；midpoint歸after；既有toggle收合後after落點可用 |
| B29 | mount／unmount再開始新drag，注入舊timer結果 | 舊session不改新feedback或dispatch |
| B30 | Root B拖至Root A下半部 | Goal marker含shared `data-kanban-insertion-marker`、8px dot／6px bar；無專用2px sibling marker |
| B31 | 同一動作檢查after Y | line Y＝Root A visible subtree bottom±1px；不得切入Root A可見子樹 |
| B32 | 同一動作檢查X／width | standard left＝Root A title anchor±2px，且右緣不越task-name lane inset |
| B33 | pointer精確落在row midpoint | 顯示after；不得因active rect fallback變成before |
| B34 | 在A1 primary停留至armed | 唯一child line移到next-depth left與A1 subtree bottom |
| B35 | 同一standard marker檢查完整bounds | wrapper完整落在task lane與Goal viewport交集內 |
| B36 | 回到Board檢查card standard marker | 使用相同presenter與shared overlay layer |
| B37 | Goal進入A1 primary、未達dwell | 維持standard marker，不提前顯示child |
| B38 | Goal在dwell中由A1換到A1.1，再離開task lane | 新target重新計時；達1000ms後才child；離區後舊timer不得復活marker |
| B39 | Goal candidate期間觸發scroll | pending intent與marker立即清除；舊累積時間不得armed |
| B40 | Board進入card primary並停留 | candidate→armed使用相同1000ms狀態機；armed line為shared presenter |
| B41 | Board candidate期間觸發scroll | child preview與standard marker清除；舊累積時間不得armed |
| B42 | Goal在A1 primary停留至armed並保存screenshot | 唯一shared Kanban marker＋一組直系stem／branch；branch接resulting title edge，stem由A1 own rail／row center延至semantic Y；dot／bar各1 |
| B43 | Goal candidate→armed後換target、scroll與cancel | R6 candidate有一組standard connector、armed替換為child connector；任何reset／terminal後connector與marker同時為0，舊geometry不復活 |
| B44 | Goal root standard before／after | 唯一root branch-only由root rail接到resulting title edge，另有一組shared Kanban marker；不渲染虛構vertical stem |
| B45 | Goal深層nested standard before／after並保存screenshot | 唯一sibling connector使用target parent rail；stem連row center與semantic boundary，branch接resulting title edge；after仍落visible subtree bottom |
| B47 | Goal深層before preview後放開 | shared presenter存在且presentation=`kanban-marker`；preview／result branch X差≤1px、Goal dot／bar各1、canonical parent／level正確 |
| B46 | 先hover具下層任務的Goal row，再拖曳另一任務至該row，保存screenshot並Escape | 拖曳前一般active guide存在；拖曳中placement preview恰1、active guide與content tint皆0；中性底線保留；取消後preview為0且hover highlight可恢復 |
| B48 | Goal正常入口拖曳Root B並量測浮卡 | computed scale=`0.5`；來源ID／文字／pointer中心與pointer-events維持，保存代表截圖 |
| B49 | 同parent相鄰兄弟的after-previous與before-next | 兩態都呈現previous-after樹線幾何；semantic target仍是next-before，放開結果正確且marker／preview各1 |

所有正向 case 都需保存「放開前 feedback descriptor／rect」與「放開後 canonical nodes」，而非只看畫面排序。
999／1000ms精準邊界由S24／P04注入clock驗證；browser以candidate／armed DOM狀態判斷，不能靠sleep 999ms碰運氣。

## 7. Board regression cases

- R01：task/card before／after 與 origin no-op。
- R02：水平 L1 root reorder、midpoint hysteresis與 rail geometry。
- R03：1,000ms title-center child append、source subtree placeholder與 child feedback。
- R04：跨 parent nodeType promotion／demotion、cycle guard、Undo。
- R05：Workbench placed／unplaced 與 tracking reference 既有特殊分支。
- R06：Escape／pointercancel／blur／hidden／resize cleanup。
- R07：240／270×40 fixed overlay、0px pointer gap、0.5 scale與 viewport clamp。
- R08：interactive control suppression、mouse 8px threshold、既有 mobile task drag suite。
- R09：Board既有keyboard drag可達路徑與Goal Enter／Space details分開驗證；root reorder實際經primary commit。

R01～R09的已核准行為不得回歸；若現況在密集order已有錯位，保存首個失敗並按SPEC-124 anchor契約修正，
不得把既有bug凍結成新oracle。一般實作錯誤回RD修正；只有越過SPEC stop conditions才回架構決策。

## 8. Visual／geometry／a11y gate

### 8.1 Viewports

- 1440×900
- 1024×768
- 814×698

每個 viewport 至少保存 idle、standard before／after、origin、child armed、horizontal-scrolled、cancel-cleaned 畫面。

### 8.2 Geometry assertions

- 相同scroll offsets下source row與visible subtree的top／bottom差值≤0.5px；scroll時改比client Y＋scrollTop，
  不把自然捲動當layout shift。child marker在viewport外時必須不顯示且不能提交。
- native `rowSpan`、table width、scrollWidth、task-name lane left／width 在 drag 中不變；容許 browser subpixel ≤ 0.5px。
- marker 完全位於 task-name lane；不覆蓋 comparison cells，不產生第二 X-scroll owner。
- Goal standard marker左端＝target title anchor；child marker左端＝next-depth anchor；右端＝task cell right−4px，
  width≥24px。before Y＝row top；after／child Y＝visible subtree bottom；各座標誤差≤0.5px。
- Goal與Board皆由`DesktopTaskInsertionIndicator`持有semantic anchor並使用`kanban-marker`，維持8×8px dot、6px bar與primary shadow；
  Goal另外由`GoalHierarchyGuides`呈現唯一樹狀預覽。
- marker以semantic Y置中；完整8px visual bounds需位於task lane與scroll viewport交集，否則不得顯示／提交。
- Board task overlay CSS240×40、scale0.5，所以visual rect為120×20；Board column CSS270×40→visual135×20。
  Goal浮卡維持content-driven layout與max-width 252px，以computed scale 0.5驗收；旋轉後外接rect不要求兩軸比例皆恰為0.5。
  pointer gap0，邊緣clamp依既有utility計算，不能要求clamp後仍恰好0px gap。
- visible feedback owner（origin／standard／armed-child）cardinality≤1；terminal後為0。
  overlay、source placeholder、child wrapper內的marker及sr-only status不重複計數，避免把同一回饋的DOM子節點算成兩個落點。
- Goal preview沿用正式active hierarchy stroke，branch Y＝semantic top、右端＝resulting title edge（semantic wrapper left），誤差≤1px。
  root standard只畫root rail至title edge的branch；nested standard的stem center X＝target parent rail並由安全的上方presentation anchor連至boundary；
  任一nested standard stem均須滿足top≤bottom，不得以目標列中心反向上連；
  armed child的stem center X＝target own rail並連row center與child boundary。connector在marker後方、不遮comparison cells、不改row geometry。

### 8.3 Accessibility／error sweep

- native table role／headers／scope／rowSpan 不變；feedback layer `aria-hidden` 或使用既有 live announcement，不製造重複可聚焦項。
- Goal keyboard tab／Enter／Space／`Shift+F10` contract保留；focus不因 drag cancel丟失到 body。
- 每個case收集page error、console error、failed HTTP、可見錯誤banner／toast。非預期項目任一>0即FAIL；
  failure injection需在case先列expectedErrors與恢復條件，不能全域忽略console／HTTP錯誤。

## 9. Commands 與最小執行順序

DEV-124兩個scripts已擴充至40個static assertions與27個browser cases（R14新增S40／B52）並全數PASS；
R13 39/39與26/26、R12 37/37與25/25保留為re-entry baseline，不取代R14證據。

```powershell
npm run verify:dev-124-shared-desktop-task-drag-host
npm run verify:dev-124-shared-desktop-task-drag-host-browser
npm run verify:dev-053-task-drag-muscle-memory-consistency
npm run verify:dev-053-task-drag-muscle-memory-consistency-browser
npm run verify:dev-055-desktop-task-drag-target-clarity
npm run verify:dev-055-desktop-task-drag-target-clarity-browser
npm run verify:dev-058-desktop-drag-origin-insertion-feedback
npm run verify:dev-068-task-title-center-child-drop
npm run verify:dev-068-task-title-center-child-drop-browser
npm run verify:dev-116-goal-mode
npm run verify:dev-116-goal-mode-browser
npm run verify:dev-119-goal-cell-actions
npm run verify:dev-119-goal-cell-actions-browser
npm run verify:dev-120-goal-planning-minimal-density
npm run verify:dev-120-goal-planning-minimal-density-browser
npm run verify:dev-121-goal-hierarchy-comparison
npm run verify:dev-121-goal-hierarchy-comparison-browser
npx tsc --noEmit
npx eslint src/components/BoardView.tsx src/components/GoalView.tsx src/components/Wbs/taskDrag
npm run build:test
git diff --check
```

`npm run build`目前會進入production artifact sealing，本案使用`build:test`。targeted ESLint需納入實際修改的TS verifier；
若舊檔已有lint failure，保存baseline並判斷delta，不自行放寬規則或宣稱全repo全綠。

Board adapter／commit共用面的必要相容檢查如下；若既有suite無法在目前fixture獨立跑，將同等case收進DEV-124
並記錄原案例ID與覆蓋證據，不能只寫「已涵蓋」。不需為此進行正式DB操作。

| 受影響面 | 既有package命令／案例 |
|---|---|
| mobile presenter／session | `verify:dev-054-mobile-task-drag-precision`及`-browser` |
| Workbench lanes／transfer | `verify:dev-039-task-workbench-placement-lanes`及`-browser`、`verify:dev-086-task-workbench-subtree-transfer`及`-browser` |
| special placement failure | `verify:dev-089-task-placement-transaction`、`verify:dev-089-task-placement-failure-browser` |
| tracking | `verify:dev-095-task-tracking-interaction-parity`及`-browser` |
| Undo／primary pointer | `verify:dev-044-undo-coverage`及`-browser`、`verify:dev-084-primary-pointer-isolation`及`-browser` |

## 9.1 AC → 證據對照

| Acceptance | 必要案例 |
|---|---|
| AC01 共用ownership | S01～S05、P18、R09 |
| AC02／03 排序／層級 | P01～P03、P07／P09／P16／P19、B01～B06／B17／B27 |
| AC04 零寫入 | P05／P06／P10～P12／P17／P21、B07～B11／B14～B16／B23／B25／B29 |
| AC05 結構Undo | P13、B22、R04；TD-124-02獨立快照 |
| AC06／08 child／filter | P04／P08／P14／P27／P28、B05／B06／B18／B19／B37～B41 |
| AC07／11 幾何／viewport | B20／B21／B24／B26／B28、§8三viewport |
| AC09／10 相容 | B12／B13、R01～R09、§9相容命令矩陣 |
| AC12 錯誤與證據 | P20、所有browser案例error sweep、candidate manifest |
| AC13 共用presenter／surface presentation | P22、B30、B34、B36、B40、B47、R01～R03 |
| AC14 定位幾何 | P23／P24、B31／B32／B34、§8.2量測 |
| AC15 midpoint／clipping／互斥 | P14／P25／P26、B33／B35、B25／B26／B28 |
| AC16 dwell／reset parity | S24～S27、P27／P28、B37～B41 |
| AC17 armed tree connector | S28／S29、P29／P30、B42／B43、§8.2量測與代表截圖 |
| AC18 all-placement tree connector | S30／S31、B44／B45、B42／B43、§8.2量測與代表截圖 |
| AC19 drag preview visual exclusivity | S32、B46、代表截圖與terminal cleanup |
| AC20 single renderer／preview-result parity | S33／S34、B47、preview／result截圖與geometry readback |
| AC22 Goal浮卡0.5倍 | S35、B48、computed scale／rect readback與代表截圖 |
| AC23 等價兄弟邊界單一樣式 | S36、B49、雙態geometry／semantic descriptor／canonical result readback |
| AC24 nested standard top-down-only | S30、S37、B45、B50、parent anchor／stem方向／feedback cardinality readback與代表截圖 |
| AC25 Goal child-entry窗口與起算定位 | S38／S39、B51、70% rect／target-only tint／1000ms phase readback與代表截圖 |
| AC26 armed child父任務定位持續 | S40、B52、armed target parent cardinality／descendant exclusion／child feedback與代表截圖 |

## 10. Evidence artifact

```text
output/qa/dev-124-shared-desktop-task-drag-host/static-result.json
output/playwright/dev-124-shared-desktop-task-drag-host/result.json
output/playwright/dev-124-shared-desktop-task-drag-host/B48-dev124-goal-half-size-floating-card.png
output/playwright/dev-124-shared-desktop-task-drag-host/B49-dev124-equivalent-boundary-after-previous.png
output/playwright/dev-124-shared-desktop-task-drag-host/B49-dev124-equivalent-boundary-before-next.png
output/playwright/dev-124-shared-desktop-task-drag-host/B50-dev124-goal-before-first-child-top-down-preview.png
output/playwright/dev-124-shared-desktop-task-drag-host/B51-dev124-goal-child-candidate-location.png
output/playwright/dev-124-shared-desktop-task-drag-host/B52-dev124-goal-armed-parent-location.png
output/playwright/dev-124-shared-desktop-task-drag-host/geometry.json
output/playwright/dev-124-shared-desktop-task-drag-host/console.json
output/playwright/dev-124-shared-desktop-task-drag-host/network.json
output/playwright/dev-124-shared-desktop-task-drag-host/screenshots/
output/dev068-full-latest.log
```

`result.json` 每case至少包含caseId／status／evidenceLevel、candidate hash、viewport、fixture id、session ID、
presented frame sequence、displayed／release plan、rect／scroll offsets、canonical before／after／undo／redo、
local batch／Undo counts、terminal state、feedback cardinality、expected／unexpected errors及 screenshot path。
pure case沒有screenshot時填not-applicable與原因；`local-applied`不能改寫為`durable-committed`。

## 11. Pass／Fail／Stop

- PASS：所有 P0／P1、S／P／B／R／visual／geometry／a11y／error sweep 在同一 frozen candidate 全綠。
- FAIL：任何 displayed≠committed、錯 parent／order、cycle、duplicate write／Undo、table geometry shift、Board drift、
  permission bypass或非預期 visible／console／HTTP error。
- STOP：觸及 SPEC-124 stop conditions、需更新 approved Board oracle、需改 schema／permission／hierarchy／rowSpan／
  mobile scope，或不能證明 runtime ownership／cleanup。
- QC handoff：附frozen hashes、commands、artifact links、first-failure與未執行項；單列TD-124-01／02及證據範圍。
  inherited ancestor差異只可如實記錄，新增結構／rollup回歸仍為FAIL。RD self-test不等於獨立QC。

R14已保存DEV-124 static 40/40、Chromium 27/27、browser／HTTP error=0；B51證明candidate target-only與1000ms切換，B52證明armed後父任務
仍恰一列定位、子孫為0且child feedback維持；代表截圖已人工複查。R13 B51、R12 B50、R11 B49與R10 B48亦維持PASS。
TypeScript、targeted ESLint、`build:test`與diff check PASS；R9的DEV-068／116／121保留為基線，本輪未重跑且不誤標為R14新證據。
task-owned browser皆關閉，既有localhost:4000未停止。`git diff --check`已於文件收尾後PASS。
目前標示`RD Implementation Complete / R14 Targeted QA PASS / QC Pending / NOT RELEASED`；RD self-test不等於獨立QC。

使用思考習慣：#可驗證性、#風險導向、#多視角思考
