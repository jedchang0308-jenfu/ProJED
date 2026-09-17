# ADR-052：共用桌面任務拖拉 Host 與模式表面介面

- 狀態：Accepted；`R9 Architecture Confirmed / RD Implementation Complete / Targeted QA PASS / QC Pending / NOT RELEASED`
- 日期：2026-09-17
- 修訂：R9／保留單一Goal hierarchy renderer並恢復共用Kanban定位線；R7互斥、R6 geometry、R4 dwell維持。
- 對應：DEV-124、SPEC-124、QA-DEV-124
- 相容：DEV-053、DEV-055、DEV-058、DEV-068、DEV-116、DEV-119、DEV-120、DEV-121
- 決策來源：`USER-20260916-OKR-SHARED-KANBAN-TASK-DRAG`、`USER-20260916-ARCHITECTURE-FREEZE`、
  `USER-20260916-GOAL-INSERTION-LINE-REENTRY`、`USER-20260917-CROSS-MODE-DRAG-BEHAVIOR-PARITY`、
  `USER-20260917-GOAL-DRAG-TREE-PREVIEW`、`USER-20260917-GOAL-ALL-PLACEMENT-TREE-PREVIEW`、
  `USER-20260917-GOAL-DRAG-TREE-PREVIEW-EXCLUSIVITY`、`USER-20260917-GOAL-DRAG-PREVIEW-COMMITTED-TREE-PARITY`、
  `USER-20260917-GOAL-RESTORE-INSERTION-MARKER`

## Context

看板桌機拖拉已建立完整的 session、fixed overlay、origin／standard／child feedback、canonical intent、
latest-store revalidation、batch update 與 Undo；但 controller／幾何 orchestration 仍集中在 `BoardView`。
OKR 則在 `GoalView` 自有 `DndContext`、整列 sortable transform、overlay 與簡化 `handleDragEnd`，形成第二套
拖拉語意與寫入權威。兩者資料模型相同，layout 卻不同：看板 L1 水平、卡片／checklist 巢狀；OKR 是縱向
native table、固定任務欄與跨列 `rowSpan`。

使用者要的是跨模式一致的拖拉心智模型。直接重用 Kanban DOM 會破壞 OKR 表格；只換 overlay 則不會解決
parent／order、cycle、displayed-versus-committed 與 Undo 分歧。

R3 working-tree readback另確認一個implementation drift：Board standard feedback已使用`KanbanInsertionMarker`，
Goal卻仍以專用2px div畫線，且其rect取整個task lane與單列bottom；armed child沒有next-depth／subtree定位，
exact midpoint規則也與SPEC不一致。這會使「看見的位置＝放開後插入位置」失去可辨識證據，因此重開DEV-124。

R4 readback再確認：Goal雖已使用共用marker，child armed仍由Goal-local `1000ms` timer與candidate ref決定，
Board則由`taskChildDropTarget.ts`共用狀態機決定。外觀看似一致不等於行為權威一致；只要邊界時間、換target或scroll交錯，
兩套實作就可能分歧，因此必須收斂到單一phase transition truth。

R5使用者要求child落點同時預覽樹狀關係。既有marker已表達落點，但未把marker與target父節點的Goal tree rail連接；
這是Goal layout presentation缺口，不是shared lifecycle、intent或commit缺口。

R6使用者確認其他階任務定位也必須渲染樹線。root與nested standard before／after同樣需要用Goal樹狀語言說明
預計插入的階層；因此R5 armed-only條件被有意取代，但connector仍只是既有marker的輔助視覺。

R7使用者提供畫面證據：placement connector與一般hover／focus active hierarchy guide同時變紫，視覺上等同多組定位線。
這是R6「每次只准一組」的實作偏差；修正點在Goal可見狀態投影，不是geometry、CSS primitive或drag lifecycle。

R8使用者再指出預覽長bar／dot與放開後短樹分支不一致，並質疑不應另建preview component。量測證實舊preview endpoint
比result多4px，原因是connector接到marker dot中心；此外row與preview確實使用兩套renderer。這是presentation source-of-truth問題，
需由架構收斂而非再補CSS。

R9使用者要求在R8架構上恢復原本定位插入線。這不需要復活獨立preview renderer：共用presenter直接恢復
`KanbanInsertionMarker`，Goal樹線仍由單一`GoalHierarchyGuides`呈現並在marker wrapper left／title edge結束。

## Decision

採用「單一 shared desktop drag host／feedback layer／canonical primary commit＋模式表面 adapters」：

1. `DesktopTaskDragHost` 唯一持有 DnD lifecycle、session／terminal guard、raw pointer、全域取消、release orchestration。
2. `DesktopTaskDragLayer` 唯一組合 fixed overlay、origin field、standard marker 與 child preview，且回饋互斥。
3. Board／Goal geometry adapter只提供source capture與同步measure；不持有timer、session、commit或cleanup callback。
   host的move／release重用同一measure，並以唯一已呈現frame檢查提交意圖。
4. `taskDropIntent.ts` 保持 parent／order／nodeType／cycle 唯一權威；`taskDragCommit.ts` 抽出 layout-neutral
   primary commit；normal Board（含目前直寫的root reorder）與Goal共用latest-state、anchor plan、normalization、
   one local batch／one structural Undo。密集或重複order以完整sibling ID清單splice，不能只靠±0.5。
5. Board 先完成零行為變更抽取，再接 Goal；任何 approved Board drift 都是 stop condition。
6. Goal 保留 native table、`rowSpan`、252px frozen task-name lane、single X-scroll 與 mode-owned row geometry；
   移除自己的 DnD lifecycle、overlay、sortable row displacement 與 commit。
7. mobile Goal、tracking、Workbench／跨看板 placement 不進第一階段。
8. Board-special沿既有commit facade／placement authority，normal primary commit嚴格限制同board／workspace。
9. 固定stateful host、stateless layer、mode geometry三項責任；type-only檔可合併，不把固定檔案數當作架構品質。
10. 在既有`DesktopTaskDragLayer.tsx`輸出無狀態`DesktopTaskInsertionIndicator`，統一fixed rect、axis、semantic attributes與presentation。
    Board與Goal都用`kanban-marker`重用`KanbanInsertionMarker`；Goal另以同一descriptor驅動hierarchy preview。
11. 共用presenter不計算geometry。Board保留既有L1／card geometry；Goal adapter固定輸出row top、visible subtree bottom、
    title anchor、next-depth child anchor、task-cell right與viewport clipping。midpoint相等時歸after。
12. `taskChildDropTarget.ts`是Board／Goal child dwell的唯一phase transition authority；兩個surface只送入target ID並依共用
    remaining time排程，不得各自硬編1000ms或另寫candidate→armed規則。shared host的scroll invalidation清除兩模式的
    pending intent、marker與geometry cache；重新命中後從0計時。
13. 跨模式一致定義為semantic parity，不是pixel identity：standard從target title anchor開始、after落在visible subtree bottom、
    child從next-depth anchor開始；Board卡片與Goal table仍由各自adapter產生合法rect。
14. Goal tree connector在每個有效Goal placement frame呈現且每次只准一組：root standard是root rail至resulting title edge的branch-only；
    nested standard使用target parent rail，由row center至semantic boundary的stem再接branch；armed child使用target own rail至child boundary。
    shared semantic anchor仍是release metadata owner並render一組Kanban marker；hierarchy renderer同時呈現一組樹狀預覽。
    standard轉armed時原子替換geometry；origin／invalid與所有R4 reset／terminal事件清除connector，Board不接此presenter。
15. active Goal drag期間，一般hierarchy hover／focus scope的可見投影為null，guide active attribute與content-owner tint不得出現；
    中性結構線保留，placement connector仍由R6 presenter唯一呈現。原始互動scope不成為drag authority，terminal後可恢復正常highlight。
16. `GoalHierarchyGuides`與內部segment primitive是Goal正式row及fixed preview的唯一樹線renderer；兩者只差coordinate input與layer metadata，
    必須共用kind class、active stroke、端點與owner attributes。禁止恢復`GoalTaskTreeInsertionPreview`或另一套preview style token。

## Rationale

此決策把必須一致的產品語意集中，把不可一致的 layout 幾何隔離：

- 一個 lifecycle／primary commit集中終止、stale target與本機結構Undo；release前後的取消由明確committing邊界分隔。
- semantic descriptor 讓 root／sibling／child placement 可共用，不要求 DOM 結構相同。
- mode adapter 讓 Goal 用 visible DFS row rect／subtree bottom，Board 保留水平欄與卡片 hit-test。
- shared insertion presenter讓兩模式使用同一語意anchor、metadata contract與approved Kanban marker；Goal hierarchy renderer仍獨立負責table樹線。
- R9恢復的Kanban marker只負責明確插入boundary；Goal樹線仍負責階層關係，兩者共用同一descriptor且不分裂提交權威。
- shared dwell state machine讓999／1000ms、target switch、leave與scroll reset只有一份可測規則；surface timer只負責喚醒。
- 單一Goal hierarchy renderer讓root、sibling與child預覽直接沿用正式樹線，不再維護會漂移的第二套stroke／endpoint規則。
- fixed feedback layer 不修改正常流，能同時保護 Kanban 卡片與 native table／`rowSpan` 幾何。
- 先以 Board characterization 鎖現況，降低「為了共用而改壞成熟模式」的風險。

## Rejected alternatives

### A. 直接把 KanbanCard／KanbanColumn DOM 搬進 OKR

Rejected。會失去表格欄位比較、native `rowSpan`、sticky first column 與 single X-scroll，且把 layout 差異誤當成共用。

### B. 只替換 OKR overlay／CSS

Rejected。畫面相似但仍由 Goal 的 swap／`over.order + 0.5` commit 決定結果，無法保證 displayed＝committed、
latest-store、full sibling normalization 或一次 Undo。

### C. 保留兩套 dwell controller，只共用 marker 元件

Rejected。會繼續維護兩套dwell phase、target switch與stale timer規則，差距只是被藏在同一視覺元件後。
Board／Goal可以各有React wake-up effect，但effect只能呼叫共用狀態機，不得成為第二份規則。

### D. 建立泛用 plugin／event bus／跨 surface drag framework

Rejected。現階段只有 Board／Goal 兩個已知 layout，事件匯流排不提供更強 invariant，反而增加觀察順序、ownership
與除錯成本。Future scope 需要時以新決策 re-entry。

### E. 把 Board 行為改成 Goal 的整列交換模型

Rejected。與 DEV-053／055／058／068 的 approved behavior、child intent、origin、stable insertion 與 Undo 契約衝突。

### F. Goal 保留專用 2px 線，只調 CSS 或 data attribute

Rejected。它沒有共用看板marker的圓點／主線視覺，也無法補上subtree bottom、next-depth child、viewport clipping與
displayed-versus-committed契約；只換顏色或厚度會留下第二套presentation truth。

R8補充：拒絕的是獨立Goal insertion renderer；接受的是既有`GoalHierarchyGuides`本身支援fixed preview座標，因其與正式row共用
同一segment primitive，且仍由shared presenter／adapter提供semantic anchor與geometry。

## Consequences

### Positive

- Board／Goal 使用相同啟動、回饋、intent、release revalidation與 commit 心智模型。
- Goal 不再有第二套 parent／order 寫入權威。
- 新 surface 若未來加入，可先證明 geometry adapter，而不複製 session／commit。
- mode-specific layout 仍可獨立演進，且不污染 canonical data semantics。

### Cost

- 需先 characterization 並從大型 `BoardView` 抽取 controller，工作量高於直接 patch Goal。
- adapter contract 必須明確處理 filtered／collapsed view 與 canonical siblings 的差異。
- browser QA 必須同時覆蓋 Board regression 與 Goal table geometry，不能只做 pure tests。

### Risks and controls

- 抽取造成 Board drift：WP-B gate 必須先通過所有 Board targeted regressions。
- adapter 變成第二 truth：adapter 不得直接寫 normal move，只輸出 descriptor／geometry。
- 顯示與提交漂移：release同步重讀latest nodes、同scope member capabilities與geometry，比對已呈現plan後才dispatch。
- Goal rowSpan 命中錯列：row identity 由 visible task row rect 決定，不由 covered cell 的 element hit 決定。
- Goal定位線錯位：adapter回傳完整row／anchor geometry；shared presenter只render已計算rect，browser以≤0.5px量測。
- 共用造成Board drift：`KanbanInsertionMarker` approved樣式不修改；Goal直接重用既有primitive，tree renderer不修改marker尺寸或樣式。
- 收合後任務消失：collapsed target 含 hidden children 時禁止 child append。
- 誤宣稱交易成功：`batchUpdateNodes`回傳void，`committed`只證明local-applied，不證明遠端持久化。
- inherited debt：SPEC-124 §6.1固定TD-124-01遠端原子性缺口與TD-124-02 ancestor rollup不在structural Undo內；
  保留baseline行為、獨立保存證據與移除觸發條件。本次不擴張至store／history／recovery重構。

## Compatibility and migration

- 無資料 migration、schema、API 或 stored-state format 變更。
- R2只補強desktop primary plan；原resolver／normalization舊呼叫介面相容，mobile與Board-special行為需回歸。
- 不改 task identity、canonical hierarchy、filter semantics、permission model或 mobile task session。
- Goal 舊 DnD path 在新 path browser evidence 通過後一次移除；不得長期雙跑或設 feature flag 維持兩套 commit。
- Goal專用`h-0.5` marker在R3 shared presenter通過後移除；不得保留fallback雙線或以mode flag維護兩套視覺。
- Goal-local child timer／candidate refs在R4移除；既有Board／Goal都以共用state machine判定phase。
- R6 connector為ephemeral UI，沒有migration／stored state／feature flag，也不建立第二marker或commit path；
  它只取代R5 armed-only的顯示條件。
- R8移除獨立preview元件並抽出既有row renderer；沒有schema／stored state／feature flag變更，Goal semantic anchor DOM仍保留測試與release revalidation metadata。
- R9只把Goal presenter切回`kanban-marker`，不恢復Goal-only marker、不新增schema／stored state／feature flag或第二commit path。
- 如需短暫開發期對照，只能是 test-only characterization，不得進 production runtime。

## Architecture closure

- 共享／模式責任：已固定。
- primary commit ownership：已固定。
- filtered／collapsed ordering policy：已固定。
- UI geometry／a11y／mobile boundary：已固定。
- work package 與 stop conditions：由 SPEC-124 唯一管理。
- R9未決架構選擇：`0`；shared presenter、Board／Goal marker、Goal單一hierarchy renderer、root／sibling／child geometry、drag期間active-guide遮罩、
  dwell authority、scroll reset、viewport clipping與Board保護條件均由SPEC-124固定。
- R2 static／browser與相容回歸保留為pre-reentry baseline；它們沒有覆蓋使用者指出的定位線缺口，不能作為R3完成證據。

本 ADR 接受R9架構；R3～R8證據保留為baseline。R9 fail-first S33證實Goal仍抑制原定位線；
修正後static 34/34、Chromium 22/22，preview／result branch X一致且Goal dot／bar各1；
獨立QC、真機與release仍未執行。
這些證據不替代獨立QC、真機、正式持久化或release gate。

使用思考習慣：#第一性原理、#系統描繪、#限制條件
