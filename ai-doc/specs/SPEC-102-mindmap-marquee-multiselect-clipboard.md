# SPEC-102：心智圖矩形圈選、多選右鍵與剪貼操作

- 狀態：`Implemented / Local Automated QA-QC Passed / Tech Lead Reviewed R3 + UI Follow-up / Human Confirmed / 未 Release`
- 日期：2026-09-04
- 關聯 DEV：DEV-102
- 父交付點：DEV-027、DEV-028、DEV-070
- 相容規格：SPEC-013、SPEC-027E、SPEC-048、SPEC-074、SPEC-075、SPEC-079、SPEC-084、SPEC-088、SPEC-095
- QA：QA-DEV-102
- RD 技術主管審查：R1 `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102.md`；R2 `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102-R2.md`；R3 `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102-R3.md`
- 原始需求：`USER-20260903-MINDMAP-MARQUEE-MULTISELECT-CLIPBOARD`
- 風險：Medium-High（selection authority、批次 mutation、階層搬移、持久化失敗補償與鍵盤／指標 owner）
- Spec Impact：`Intentional replacement + compatible extension`
- Implementation／QA：`Local implementation complete；static／pure／browser／rendered／regression gates PASS`

## 1. 產品決策與交付目標

心智圖模式新增 XMind 類型的桌機矩形圈選。圈選後可保留多個任務 selection，並以心智圖專屬右鍵清單執行可安全批次化的動作；不具多選語意、權限不足或風險過高的動作在呈現層直接隱藏，避免低對比 disabled row 造成誤判。command 執行層仍保留 guard，防止開單後狀態競速或繞過 UI 的 mutation。

心智圖中的「複製」改為剪貼簿語意：`複製`與`剪下`都只準備來源，使用者再於任一有效任務按右鍵，選擇`貼在此任務之後`。複製在貼上前不得立即建立副本；此語意只適用心智圖，其他模式既有 `task.duplicate` 立即複製行為不變。

成功結果：

- 空白畫布左鍵拖曳可框出矩形並選取其中任務。
- 多選右鍵清單只顯示當下可執行的複製、剪下、指派與封存；不可用動作直接隱藏，不以低對比 disabled row 佔據清單。
- 父子任務同時被選取時，copy／cut／archive 先正規化為不重疊 forest roots，不重複處理同一子樹。
- 複製或剪下後，可在同看板任何有效任務後方貼上，並保留子樹、順序與一次 undo。
- 所有批次動作先完整驗證再寫入；失敗不得留下半套 UI 成功狀態或靜默跳過部分任務。

使用思考習慣：#第一性原理、#系統描繪、#拆解問題、#可驗證性

## 2. Authority 與規格影響

### 2.1 Intentional replacement

- 本規格只取代 SPEC-075 的「`selectedNodeId` 單一 cardinality」；仍保留其 private selection store、keyed subscription、latest-only focus、不得讓 `MindMapView` 訂閱整體 selection、不得觸發 geometry recompute 等效能權威。
- selection authority 擴充為 `selectedPlacementIds + primaryPlacementId`；名稱必須反映 visual placement identity，不得與 canonical task ID 混用，也不得新增第二套 React state、DOM imperative selection 或全域 board selection owner。
- 心智圖中的`複製`不再呼叫 `task.duplicate`／`duplicateNodeTree`立即建立資料；改由 `task.copy`寫入剪貼簿，只有 `task.paste-after` 才建立新任務。

### 2.2 Compatible extension

- SPEC-027／027E：保留既有 mind map tree、node drag、quick-title 與關係線操作；多選時建立關係線上鎖。
- SPEC-028：沿用 task interaction catalog、permission guard 與 command ownership；只新增心智圖 presenter 與 cardinality policy。
- SPEC-013：貼上複製的欄位與子樹 projection 以既有 subtree duplicate 規則為基準，但建立時點改為 paste。
- SPEC-048：沿用主責／協作者 mutually-exclusive normalization；本規格只增加 aggregate tri-state。
- SPEC-070：沿用 pointer／keyboard exclusive owner 與 focus boundary。
- SPEC-074：維持單一 Scene、world transform 與 connector geometry authority；圈選是 client-space transient overlay。
- SPEC-079：建立關係線仍為單一來源任務動作；多選時不在心智圖選單呈現。
- SPEC-084：中鍵平移與 primary button isolation 保持；本規格不恢復左鍵抓圖平移。
- SPEC-088：批次動作是`封存`，不是永久刪除；仍可 undo。
- SPEC-095：selection使用visual placement ID，mutation前解析canonical task ID；v1多選clipboard／assignment／archive不接受tracking projection，避免以目前看板permission修改canonical來源。

### 2.3 已放棄功能邊界

DEV-076 的「心智圖空白畫布左鍵抓取平移」已由使用者放棄並回復。DEV-102 將空白畫布左鍵拖曳明確分配給矩形圈選；畫布平移只保留現行中鍵或既有非衝突入口，不得藉本 DEV 恢復左鍵平移。

### 2.4 ADR 判定

ADR not needed。此變更不改schema、provider API、角色來源或跨模式資料authority；新增awaitable batch primitive是store內加法API，DEV-102以外既有call sites與行為保持不變。架構仍由SPEC-070／074／075的interaction、scene與private selection authority承接，新增模組可依WP-102-A～D分片回復；provider無ACID batch的取捨與移除條件已在§9.3明示。

## 3. Current State 與根因

現況盤點：

- Active repo：`C:\VIBE CODING\ProJED\ProJED`；盤點 branch：`持續優化3`；HEAD：`13888b27221b`。2026-09-03 工作樹已有大量未提交產品、verifier與文件變更，包含MindMap／DEV-076／084等重疊面；RD必須以實作開始當下working tree為baseline，逐檔確認owner並做增量patch，禁止`git reset --hard`、`git checkout --`或整檔覆寫。
- `mindMapSelectionStore.ts` 只持有單一 `selectedNodeId`。
- `MindMapView.tsx` 已有 `nodeElementRegistryRef`，可在圈選開始時一次擷取 node client-space center，不需每個 pointermove 查詢 DOM。
- `GlobalContextMenu.tsx` 以 `filter(enabled)` 移除 disabled actions，無法呈現「可見但上鎖」的多選清單。
- `TaskActionMenu`已有共用label／icon row renderer，但目前native disabled row不保留鎖定原因；心智圖應擴充共用row contract，不應再複製一份label／icon map。
- 現行 action catalog 會把所有有section的action預設加入各模式menu；若直接加入clipboard actions會洩漏到Board／List／Gantt／Calendar，必須提供明確的`defaultMenu:false`或等價opt-in。
- `duplicateNodeTree`只支援單一 root、立即建立副本，且用相鄰order平均值，現況可產生fractional order；DEV-102不可直接重用該排序分支。
- `useWbsStore.batchUpdateNodes`雖有grouped undo，但多筆持久化仍可能parallel或fire-and-forget，沒有可等待的整批outcome；DEV-102不可把現行void API當成atomic commit。
- 現有跨 ownership placement command 拒絕 source／destination ownership 相同，不能拿來實作同看板 paste-after。

因此本需求不是在既有 context menu 多塞幾個 if；需要一個心智圖專屬 presenter、一個擴充後仍唯一的 selection store，以及一個同看板 forest paste planner／command。domain permission、action metadata、assignment normalization、archive lifecycle 與持久化 service 仍共用，禁止 fork。

## 4. Scope 與 Out of Scope

### 4.1 Current Scope

- Desktop mind map 空白畫布左鍵矩形圈選與即時命中預覽。
- 多選 selection lifecycle、primary node、visual placement 到 canonical task 去重。
- 心智圖專屬右鍵 presenter、可執行 action matrix、compact visual hierarchy與 execution-time guard。
- 單一 in-app clipboard slot：copy snapshot、cut live roots、paste-after exact anchor。
- 多任務主責／協作 aggregate tri-state 與批次封存。
- 一次 command／一次 undo、preflight、失敗補償、stale cut detection。
- 指定效能、鍵盤、accessibility、viewport、visible-error 與回歸證據。

### 4.2 Out of Scope

- 自由曲線 lasso、Shift additive、Ctrl toggle、edge auto-scroll。
- group drag、觸控／手機圈選、跨看板／跨 workspace／OS clipboard。
- 新增menu roving focus、Arrow／Home／End導覽或Shift+F10入口；本版沿用既有button Tab順序。
- 多選建立關係線、升降階、tracking reference 批次操作。
- 複製自訂心智圖關係線、外部 dependency、tracking reference。
- 永久刪除、schema／migration／RLS／provider API 變更。
- commit、push、PR、merge、deploy、production mutation 或 release。

## 5. UI Entry 與 Normal Delivery Path

- Actor：目前看板具有讀取權限的登入使用者；mutation 另由既有 action capability 判定。
- Entry：從既有 Board mode switch 進入`心智圖`，不得建立 DEV-only route 或平行產品入口。
- Target surface：desktop 1440×900 與 laptop 1024×768；390×844／320×568只驗現有 fallback 與 menu 無回歸，不開放 touch marquee。
- Fixture：至少包含左右根節點、多層父子、同名任務、tracking projection、跨父節點 roots、dependency、不同權限與 200／500 visible nodes。
- Normal flow：圈選 → 在選取任務上右鍵 → 執行批次動作；或複製／剪下 → 在任一有效任務右鍵 → 貼在此任務之後。
- Blank canvas 不顯示 task context menu；沒有 selection 時 task keyboard action不執行。

## 6. Selection 與 Marquee 契約

### 6.1 State authority

```ts
type MindMapSelectionSnapshot = Readonly<{
  selectedPlacementIds: ReadonlySet<string>;
  primaryPlacementId: string | null;
  previewPlacementIds: ReadonlySet<string> | null;
}>;

type MindMapSelectionTarget = Readonly<{
  placementId: string;
  taskId: string;
  placementKind: 'primary' | 'tracking_reference';
  parentPlacementId: string | null;
}>;
```

- `selectedPlacementIds`是畫面 placement ID；`primaryPlacementId`必須是目前 selection 中的一個 placement，selection 空時為 null。canonical mutation target只能經 placement resolver取得，禁止把 placement ID直接傳入 WBS mutation。
- placement resolver以目前`projectionNodes`／`TaskPlacementInteractionContext`建立`MindMapSelectionTarget`；缺placement、canonical task或parent context時fail closed，不以相同字串猜測identity。
- node 單擊：selection 只保留該 placement，primary 為該 placement。
- plain marquee：取代原 selection。命中集合包含原 primary 時保留 primary；否則以 navigation index 第一個命中 placement 作 primary。
- 在已選取節點上按右鍵：保持整個 selection，將該節點設為 primary，並另以該節點作 menu `anchorPlacementId`。
- 在未選取節點上按右鍵：先收斂為單選，再開單選 menu；clipboard 不受影響。
- 空白 click 清除 selection；Escape 依第 11 節優先序取消 cut 或清除 selection。
- 離開mindmap mode或切換board清除selection與clipboard；reload自然清除。selection、clipboard不持久化、不跨tab／device同步。

### 6.2 Marquee gesture

- 只有 primary pointer、左鍵、blank canvas、沒有 modal／quick-title／relationship／drag owner 時可成為 marquee candidate。
- pointerdown 後移動距離達 6 CSS px 才進入 marquee；未達門檻的 pointerup 視為 blank click。
- rectangle 使用 client-space 座標；zoom／scroll 已反映在 node `getBoundingClientRect()`，不得再重複套 world transform。
- 命中規則：node client rect 的中心點位於 marquee inclusive bounds 內即命中；connection、中央 board title、relationship handle、collapsed 未 render node 不命中。
- 達門檻時由 `nodeElementRegistryRef`一次擷取可見 node center snapshot；pointermove 只做 pure hit test，經單一 rAF 更新 overlay 與 preview，不得每次 `querySelectorAll`或讀寫 layout交錯。
- 拖曳中顯示一個半透明矩形及命中 node ring；`previewPlacementIds`只通知前後集合的 symmetric difference。
- pointerup 將 preview 一次 commit；pointercancel、lost capture、視窗 resize 或 mode unmount 清除 preview並回復 drag 前 committed selection。
- marquee active時若發生wheel／縮放按鈕／scene transform或任何會改變node client rect的操作，先取消marquee並回復drag前selection，再套用transform；不得用舊center snapshot繼續命中。
- node drag成立時，無論拖曳node原本是否位於multi-selection，都先把selection收斂為該placement，再沿用既有single-node drag；不得暗示或執行group drag。contextmenu不得啟動drag。
- marquee開始、node drag開始、selection／anchor失效、mode或board切換時關閉local menu；開啟menu時取消尚未commit的marquee。selection-changing command完成後關menu，clipboard本身依第8節生命週期處理。
- marquee 期間不平移、不自動捲動、不建立任務、不移動 node、不改 geometry。

### 6.3 Canonical resolution

批次 command 執行前，selection 必須解析為：

- `flatCanonicalTaskIds`：每個 selected placement 的 canonical task ID 去重；供 assignment 使用。祖先與後代若都被明確選取，兩者都保留。
- `forestRootTaskIds`：先解析 canonical，再移除「其祖先已在 selection 中」的 descendant root；供 copy、cut、archive 使用，避免父子範圍重疊。
- `affectedSubtreeTaskIds`：由 forest roots cycle-safe 展開並去重；只用於影響數量、permission preflight 與命令 plan。

tracking projection 可以出現在selection，但v1只要多選集合命中projection，copy、cut、paste、assignment與archive均不可執行，相關action在心智圖選單隱藏。原因是現行placement context沒有可證明的canonical來源看板assign capability；不得用目前顯示看板的permission推論來源task可指派。command guard仍需 fail closed；單一projection既有行為不由本DEV擴張。

## 7. 心智圖專屬右鍵清單

### 7.1 Presentation ownership

- 新增 `MindMapContextMenu`作為心智圖專屬shell，只負責selection summary、`anchorPlacementId`、focus、position與assignment submenu；menu state由`MindMapView`私有持有，不寫入只容納單一canonical node的`BoardContextMenuState`。
- 心智圖開menu前關閉既有global context menu；MindMap node不再呼叫`setContextMenuState`開task menu。`GlobalContextMenu`與其他模式維持原行為。
- action ID、label、icon、capability與row renderer仍由interaction layer共用。擴充`TaskActionMenu`接受`hideDisabled`與`compact`模式；心智圖隱藏`enabled=false`的列，其他模式維持既有disabled呈現與`aria-disabled`契約；不得在`MindMapContextMenu`再維護第二份label／icon map。
- 新`task.copy`、`task.cut`、`task.paste-after`在catalog標記`defaultMenu:false`（或等價explicit opt-in），只有mindmap profile明確include；心智圖 profile同時exclude`task.duplicate`。不得靠逐一修改所有其他host profile的exclude清單防漏。
- 心智圖對`enabled=false`的action不 mount、不顯示lock icon、不建立不可點擊列；清單只留下可執行按鈕，鍵盤 focus 只在可見按鈕間移動。執行入口仍需重新跑當下guard，不能只信menu開啟時結果；GlobalContextMenu的既有disabled／`aria-disabled`行為不變。

### 7.2 Action matrix

| 動作 | 單選 | 多選 | 顯示條件 |
|---|---|---|---|
| 開啟任務明細 | Enabled | Hidden | 多選無唯一 details target |
| 新增並列／子任務 | Enabled | Hidden | 多選無唯一 parent／anchor |
| 複製 | Enabled | Enabled | 只寫 clipboard；projection／read guard失敗則 Hidden |
| 剪下 | Enabled | Enabled | 需全部可移動／編輯；projection則 Hidden |
| 貼在此任務之後 | Conditional | Conditional | clipboard 非空、exact anchor有效且 preflight可判定時 enabled |
| 主責／協作 | Enabled | Enabled | 全部 canonical target 需通過 assign guard；多選含projection則 Hidden |
| 建立關係線 | Enabled | Hidden | 多選沒有唯一 relationship source |
| 升階／降階 | Enabled | Hidden | 多選結構語意不在本版 |
| 封存任務 | Enabled | Enabled | forest roots 全部需通過 archive guard |
| Tracking reference | 依既有規格 | Hidden | 多選不建立 reference |

多選 menu header 顯示`已選取 N 個任務`；N 為 selected visual placements 數量。動作確認與結果訊息使用 canonical／affected 數量，避免 projection 去重後誤報。

## 8. Clipboard 與 Paste-after 契約

### 8.1 Clipboard model

```ts
type MindMapClipboard =
  | Readonly<{
      mode: 'copy';
      boardId: string;
      roots: readonly ClipboardTreeSnapshot[];
      createdAt: number;
    }>
  | Readonly<{
      mode: 'cut';
      boardId: string;
      rootIds: readonly string[];
      sourceStructureFingerprint: string;
      createdAt: number;
    }>;
```

- 一個`MindMapView` session只有一個private clipboard slot；新copy／cut取代舊內容。離開mindmap mode、切換board或reload都清除，避免為只在心智圖使用的功能新增全域singleton。
- copy 於 action 執行時建立 immutable forest snapshot，來源畫面不改、只顯示短暫成功 toast。clipboard 在成功 paste 後保留，可重複貼上。
- cut 只記錄 live forest root IDs 與 deterministic `sourceStructureFingerprint`；在 paste 前不移動、不封存、不刪除，root subtree 顯示單一低彩度／opacity cut signal。成功 paste 後清除 clipboard。
- `sourceStructureFingerprint`只涵蓋會影響安全搬移的結構欄位：board／placement kind、forest root IDs，以及affected subtree每個canonical task的`id／parentId／order／isArchived`與membership。title、notes、assignment、date等內容變更不使cut失效；paste搬移最新live內容。
- 跨 board clipboard 視為 invalid，不提供黏貼。mode exit／board switch cleanup後仍保留cross-board execution guard，防止stale callback穿透。
- Escape 若有 active cut，優先取消 cut clipboard與視覺 signal；copy clipboard不因 Escape 清除。

### 8.2 Copy snapshot

先從現有`duplicateNodeTree`抽出唯一的pure`buildTaskTreeClonePlan`（名稱可等價），由既有立即複製與DEV-102 clipboard paste共同呼叫。不得在mindmap command重寫第二份欄位白名單、ID remap或dependency projection。

每次 paste 由共用clone plan產生全新 task／note IDs。每個 selected forest root title 加`（副本）`，descendant title不加；保留既有 subtree duplicate 所允許的 notes、tags、assignment、date、status與其他 task fields。共用plan接受injected ID／time與外部提供的integer root order，pure層不得自行以相鄰order平均值排序。

- 只有兩端都位於 snapshot forest 的 dependency 才複製並改接新 IDs。
- 指向 forest 外部的 dependency、自訂 mind-map relationship line、tracking reference 不複製。
- snapshot 不保存 selection、cut visual、DOM geometry、permission result、provider handle。
- copy source 在 snapshot 後被修改，不影響 clipboard；paste 時仍重新檢查 target create permission。
- 既有`duplicateNodeTree`仍維持其他模式立即建立語意，但改走同一clone plan；DEV-013與現有duplicate regression必須證明欄位／dependency parity沒有漂移。

### 8.3 Paste target 與 placement

- paste anchor 是開啟 menu 的 exact `anchorPlacementId`；執行時再解析其 canonical task與placement kind，不使用最早 selection、root或模糊 current node。
- source roots 成為 anchor 的連續 next siblings，保持 clipboard root order與各自子樹順序。
- anchor 為 top-level root 時，新／移動 roots 使用相同 mind-map side；anchor 為 child 時由相同 parent／ancestor side自然決定。root side不是`TaskNode`欄位，而是`mindMapSideStorage`的board-local presentation state，必須納入同一plan、compensation與undo，不可只更新node資料。
- cut 可將不同 parent 的 roots 一次搬到同一 destination parent；planner 先從所有原 sibling lists 移除 source roots，再於 anchor 後插入。
- copy 可貼在原 source root 後方；cut 不可貼在任一 source root或其 descendant 之後。
- 貼上完成後 selection 只包含新建／搬移 roots，primary 為第一個貼上 root，並使 exact primary 可見；不得自動開明細或 quick-title。
- sibling order 必須以 integer-safe complete order plan 寫入，禁止用 fractional order。planner必須列出每個source／destination sibling scope的完整before／after序列及`reindexedTaskIds`；同一scope只normalize一次，所有order被改寫的既有siblings即使未被選取也屬於affected targets。若現有共用排序 primitive 無法表達，RD 必須停止並回報 DEV-101 dependency，不得在本 DEV 靜默產生 decimal 或改 schema。

```ts
type MindMapForestPastePlan = Readonly<{
  operationId: string;
  sourceRootTaskIds: readonly string[];
  destinationParentTaskId: string | null;
  anchorTaskId: string;
  nodePatches: Readonly<Record<string, Readonly<{ before: Partial<TaskNode>; after: Partial<TaskNode> }>>>;
  reindexedTaskIds: readonly string[];
  createdTaskIds: readonly string[];
  sideOverrideBefore: Readonly<Record<string, MindMapDirection | null>>;
  sideOverrideAfter: Readonly<Record<string, MindMapDirection | null>>;
  affectedTaskIds: readonly string[];
}>;
```

- `affectedTaskIds`至少是created/moved subtree、所有`nodePatches` keys、每個`reindexedTaskIds`與destination anchor的union；permission、pending lock、recovery descriptor、readback與evidence皆使用此完整集合。
- top-level貼上把每個new/moved root寫成anchor side；root移成child時移除其stale side override；child移成root時寫入決定後side。undo／redo需精確回放`sideOverrideBefore／After`，不能靠目前版面重新推導。
- side override的localStorage寫入必須由command boundary可等待、write-readback並回報失敗；local side commit失敗時不得顯示成功或留下「資料已搬移但左右側錯誤」畫面，須補償node／side後回`compensated`，無法確認則回`indeterminate`。

### 8.4 Validation 與失敗

下列任一條件使整批 paste 失敗且零部分成功：

- clipboard board 與目前 board 不同。
- anchor 不存在、已封存、不是可寫 placement、或是 tracking projection。
- cut source 不存在、已封存、source structure fingerprint不一致，或 source／anchor造成 cycle。
- 使用者缺少任一source move／target create／node update permission；permission preflight涵蓋所有會被持久化改寫的existing `affectedTaskIds`，包含因integer normalization而改order的未選取siblings。copy snapshot含internal dependencies時還需既有dependency create capability，否則整批locked。
- cut anchor 位於任一搬移 forest root 或 descendant 中。
- copy snapshot 不完整、ID plan衝突或 internal dependency plan無法解析。

copy stale／invalid target 保留 clipboard供改選 target；cut source stale／removed 時清除 cut clipboard與視覺 signal並顯示`剪下來源已變更，請重新剪下`。權限或 target invalid 但 source仍有效時保留 cut clipboard。

## 9. Batch Command、Idempotency 與 Persistence

### 9.1 Command boundary

新增同看板`planMindMapForestPaste`／`commitMindMapForestPaste`；不得誤用要求source／destination ownership不同的跨ownership placement command。assignment／archive不另造專屬persistence engine，而是先把現有void`batchUpdateNodes`補成可等待、回傳typed outcome的shared`commitNodeBatch`（名稱可等價），再由mindmap adapter提供selection與permission plan。

```ts
type MindMapBatchCommandOutcome =
  | Readonly<{ status: 'committed'; operationId: string }>
  | Readonly<{ status: 'rejected'; reason: string }>
  | Readonly<{ status: 'compensated'; operationId: string; reason: string }>
  | Readonly<{ status: 'indeterminate'; operationId: string; reason: string }>;
```

所有 batch mutation 固定順序：

1. 從最新 store snapshot解析 visual／canonical／forest集合。
2. 完整建立 deterministic plan、所有persisted/local presentation before／after、完整affected set、permission與cycle／stale validation。
3. plan成立後先寫入並readback第9.3節recovery descriptor；成功才開始第一筆provider／side mutation。同一invocation持有operation ID，pending registry拒絕重入／double click。
4. shared primitive依plan持久化、補償並決定typed outcome；不得透過`updateNode`逐筆觸發樂觀state、activity、calendar與undo副作用。
5. 只有`committed`才一次套用canonical local state與side overrides、emit一次成功effects、push一筆undo、更新selection／clipboard並顯示一個結果；其他outcome只顯示對應失敗／未確認狀態。

不得從UI component對N個task直接呼叫N次`updateNode`後宣稱成功；批次command必須擁有before/after、completion、compensation、presentation state與undo。現行`updateNode`會立即更新local state、寫activity、處理calendar、dependency schedule並push undo，因此`commitNodeBatch`必須提供不觸發這些副作用的internal apply/persist path，不能只是包一層loop。

- success effects只能在整批`committed`後emit一次語意事件；不得依N個task產生N個toast或讓補償寫入生成反向activity。archive的calendar cleanup只能在confirmed commit後依final affected nodes執行。
- undo entry只能在`committed`後push；`rejected／compensated／indeterminate`都不得留下可執行的成功undo。
- undo／redo callback必須等待inverse／forward command到`committed`才resolve；任何其他outcome都reject/throw，使現行`useUndoStore`保留原stack位置。補償、readback與失敗重試不得重複success activity。

### 9.2 Atomicity

- copy paste：root-first建立task rows，notes／internal dependencies在IDs可解析後建立；任一provider failure以dependency／note-first、node leaves-first逆向補償已建立資料。
- cut paste／assignment／archive：先保存完整node、order與side before patches；shared batch primitive等待所有provider與local presentation completion後才結案。任一失敗依已成功項目執行反向補償並回復local state。
- 補償結果不確定時回`indeterminate`，顯示`操作結果未確認`，依完整`affectedTaskIds`做readback並鎖住相同targets，直到readback分類為before／after／conflict；不得顯示成功、push undo、清clipboard或把reload當成解鎖手段。
- undo 是一筆 user-visible command：copy undo移除本次新 forest及side overrides；cut undo回復全部 parent／side／order與被reindex siblings；assignment／archive回復全部 before values。
- redo 重新走 permission／stale guard；失敗不改目前狀態。
- 本規格的all-or-none是「已確認結果下的application convergence contract」，不是資料庫ACID保證。網路中斷使補償與readback都無法確認時，唯一合法結果是`indeterminate`；不授權以此需求新增DB transaction、RPC或migration。

### 9.3 Reload-safe operation recovery

```ts
type MindMapOperationRecoveryV1 = Readonly<{
  version: 1;
  operationId: string;
  boardId: string;
  kind: 'copy-paste' | 'cut-paste' | 'assign' | 'archive' | 'undo' | 'redo';
  targetIds: readonly string[];
  expectedBeforeFingerprint: string;
  expectedAfterFingerprint: string;
  phase: 'persisting' | 'compensating' | 'indeterminate';
}>;
```

- recovery descriptor與clipboard分離，以固定board-scoped `sessionStorage` key `projed.mindmap.batch-recovery.v1.${boardId}`保存；只存operation identity、完整target IDs與fingerprints，不存task內容、clipboard snapshot或permission結果。
- 第一筆mutation前必須set、parse/readback並驗證descriptor。`sessionStorage` unavailable、quota／write／readback失敗時fail closed且零provider writes；corrupt／unknown-version descriptor不得忽略，須以key可識別的board為範圍鎖住全部DEV-102 mutations並顯示recovery-required。
- 每次phase轉換先更新descriptor；只有`committed`、完整`compensated`或canonical readback已明確分類並完成local convergence後才能清除。
- MindMap mount／board hydration發現同board descriptor時，在提供mutation入口前先鎖住`targetIds`並執行canonical readback；hard reload不得因memory pending registry消失而靜默解鎖。其他board descriptor不阻塞目前board，但不得被誤刪。
- corrupt descriptor因缺少可信targets/fingerprints不可自動重播或判成功；只有完整provider board hydration成功且hierarchy／integer-order invariants通過後，才能清除該local descriptor並解除board級鎖，否則維持visible recovery-required。
- 此descriptor只保證同一tab的reload recovery；關閉tab後sessionStorage消失，下次browser session以provider canonical hydration為準，不做自動重播，也不宣稱跨tab／跨session exactly-once。

### 9.4 已知且隔離的技術債

provider目前沒有同看板forest／multi-node ACID transaction，因此application saga仍可能在網路分割時進入`indeterminate`。此債務不得隱藏：

- 影響：短時間內remote rows可能部分完成，但UI不得宣稱成功或允許相同targets再次mutation。
- 隔離：只存在DEV-102 shared batch／forest command；以operation ID、完整target lock、before plan、compensation log、same-tab recovery descriptor與canonical readback控制。
- 保證邊界：無跨tab／tab-close後exactly-once；不自動重播未知operation。fresh session只接受provider canonical state。
- 移除觸發：provider提供經核准的atomic batch API，或production evidence顯示indeterminate頻率／恢復時間超出owner門檻。
- 驗證：QA X01～X15必須涵蓋中途失敗、補償失敗、descriptor故障、readback成功／失敗與hard-reload recovery；缺此證據不得release。

## 10. 多任務指派與封存

### 10.1 Aggregate assignment

`MindMapBatchAssignmentPicker`以 `flatCanonicalTaskIds`計算每位成員：

- all：所有 target 都具該 role，顯示 checked。
- some：只有部分 target 具該 role，顯示 mixed／`aria-checked="mixed"`。
- none：所有 target 都不具該 role，顯示 unchecked。

點擊 some／none：把該成員加入所有 target 的目前 role。點擊 all：從所有 target 的該 role移除。主責與協作者在每個 task 上互斥；加入一側時只從該 task另一側移除同一成員，其他未觸碰成員與角色保持不變。

所有 target 都需在 execution-time 通過 shared assign guard；任一失敗則零更新。一次 interaction只產生一筆 undo與一個結果訊息，不得逐任務 toast。

### 10.2 Batch archive

- 以 `forestRootTaskIds`建立 archive plan，以 union subtree計算確認數量。
- 確認文案顯示`將封存 N 個任務`；N 是實際受影響 canonical task 數。
- 任一 projection、permission denial、stale node 或 invalid hierarchy使整批 locked／fail closed。
- 成功後 selection 清除，沿用 SPEC-088 archive lifecycle與一筆 undo；不提供永久刪除。

## 11. Keyboard、Focus 與 Accessibility

- Escape owner priority：modal／editor／relationship owner先處理；否則 active cut先取消且保留 selection；再次 Escape 或無 cut時清 selection並關 menu。
- 多選時 Arrow key：先收斂到 primary並 focus，不在同一 key event再導航。
- 多選時 Enter／Tab：只收斂到 primary，不在同一 event開明細或建立任務。
- 多選時 Delete／Backspace：走同一 batch archive確認；不得只封存 primary。
- menu 開啟時沿用既有native button Tab／Shift+Tab順序、Escape與outside click；popup以summary命名並把可執行actions呈現為緊湊按鈕清單，不可用action不 mount。現行shared menu沒有roving focus，除非另案完整實作ARIA menu pattern，DEV-102不得套`role="menu"`後缺少其鍵盤契約，也不得把Arrow／Home／End或Shift+F10寫成既有能力或驗收前提。
- menu關閉後focus回有效的exact `anchorPlacementId`；anchor已失效時回primary，兩者都不存在才回mindmap view owner，不得落到`body`。
- marquee overlay使用 `pointer-events:none`；不得擋住 node focus／contextmenu。
- selected ring、preview ring與 cut signal不可只靠顏色區分；cut node提供可存取狀態文字但避免對每個 descendant重複播報。
- batch selection／clipboard結果以單一 polite live region播報；permission／persistence failure使用 visible alert。
- 尊重 `prefers-reduced-motion`；本 DEV 不加入拖尾或過場動畫。

## 12. Performance 與 Scene 邊界

- `MindMapView`不得訂閱完整 selection snapshot；Node 以 placement ID keyed subscription取得 effective selected／preview／cut flags。
- store commit只通知 previous effective set與next effective set的 symmetric difference；primary 改變但 membership不變時最多通知舊／新 primary。
- marquee rAF最多一個 pending frame；pointermove不得建立 React state queue。
- 200 visible nodes marquee preview p95 <=32ms；500 nodes p95 <=50ms；量測窗 Long Task >50ms 數量為0。
- 500 nodes pointerup到 final `aria-selected`／live summary p95 <=100ms。
- marquee、selection、menu、clipboard與assignment preview的 DEV-074 geometry recompute delta必須為0；connector／relationship path data不變。
- selected／cut styling不得改 node DOMRect超過0.5px，不得使用會放大 layout／paint 的 `transition-all`。

## 13. Typed Module Contract 與逐檔 Patch Intent

| 檔案 | 變更 | 保護邊界 |
|---|---|---|
| `src/components/MindMap/mindMapSelectionStore.ts` | 擴充 set＋primary＋preview＋keyed diagnostics | 維持唯一 private owner；不持久化 |
| `src/components/MindMap/mindMapMarquee.ts`（新增） | threshold、rect normalize、center hit test、gesture reducer | pure；不讀 React/store/provider |
| `src/components/MindMap/MindMapContextMenu.tsx`（新增） | 心智圖local menu shell、selection summary、anchor、compact density、focus | 不使用BoardContextMenuState；row renderer共用 |
| `src/components/MindMap/MindMapBatchAssignmentPicker.tsx`（新增） | aggregate tri-state adapter | 角色 normalization走 shared helper |
| `src/components/MindMap/mindMapClipboardStore.ts`（新增） | view-session one-slot copy/cut state、structure fingerprint、cut subscriptions | memory-only；mode／board cleanup |
| `src/components/MindMap/mindMapBatchCommands.ts`（新增） | placement resolver、canonical/forest normalization、paste／assign／archive plans、完整affected/reindex/side patches與recovery descriptor | persistence委派shared primitive；不自造第二引擎 |
| `src/utils/taskTreeClonePlan.ts`（新增） | 從duplicateNodeTree抽出唯一pure clone／ID／dependency projection | existing duplicate與clipboard共用；order由caller注入 |
| `src/components/MindMap/mindMapSideStorage.ts` | 增加可等待write-readback與before/after snapshot套用 | side屬local presentation transaction；失敗不得靜默吞掉 |
| `src/components/MindMap/MindMapView.tsx` | gesture owner、registry centers、local menu／clipboard/recovery owner、keyboard與command wiring；overlay預設在此以ref／leaf state渲染 | 不重寫scene／drag／relationship；只有確有獨立測試責任才抽Overlay component |
| `src/components/MindMap/MindMapNode.tsx` | keyed multi／preview／cut visual與a11y | 不改 bounds、quick-title、drag |
| `src/interactions/task/types.ts` | 新action IDs、`defaultMenu` metadata與cardinality context型別 | placement／task ID分型；不改其他mode語意 |
| `src/interactions/task/taskActionCatalog.ts` | copy／cut／paste-after opt-in metadata | `defaultMenu:false`；`task.duplicate`保留給其他模式 |
| `src/interactions/task/taskActionGuards.ts` | 共用 current-state permission result與reason | cardinality policy由mindmap profile提供 |
| `src/interactions/task/profiles.ts` | mindmap single/multi action profile | 不改 board/list/calendar profiles |
| `src/interactions/task/TaskActionMenu.tsx` | 共用row支援`hideDisabled`／`compact`與既有aria-disabled執行阻擋 | 只由MindMapContextMenu啟用hide；GlobalContextMenu現有行為不變；不複製label／icon |
| `src/store/useWbsStore.ts` | 新增awaitable shared `commitNodeBatch` outcome、無副作用persist/apply path、target pending、commit後effects與grouped undo；duplicate改走clone plan | 不改schema；不得fire-and-forget、逐筆activity或假成功 |
| `scripts/verify-dev-102-mindmap-marquee-multiselect-clipboard.ts`（新增） | source／pure／contract verifier | static不取代browser |
| `scripts/verify-dev-102-mindmap-marquee-multiselect-clipboard-browser.pw.js`（新增） | fixture、UI、perf、permission、failure、evidence | local-test only |
| `package.json` | 新增兩個 DEV-102 verify scripts | 增量修改；不重排dirty scripts |
| `ai-doc/dev_task.md`、`documentation_map.md`、`SPEC-102`、`QA-DEV-102` | 實際 evidence與狀態收斂 | 未執行不得填PASS |

若實作發現 assignment normalization只能存在於現行 picker component，允許抽出 shared pure helper；禁止為了重用 UI 而使其他模式承擔 mindmap multi-selection state。

## 14. Work Packages 與 Gate

| WP | 輸出 | Exit Gate | 回復邊界 |
|---|---|---|---|
| WP-102-A | placement-typed selection store、pure marquee、overlay、gesture arbitration | selection／preview／cancel、transform-cancel、single-node drag collapse與browser PASS；無雙owner或identity混用 | 回復到DEV-075單選store |
| WP-102-B | local mindmap menu、opt-in action/profile、hide-unavailable compact row、native Tab/focus | 單／多選矩陣、不可用action隱藏、action不外洩、permission、a11y PASS；不引入虛構roving行為，其他mode不變 | 移除mindmap shell/profile增量 |
| WP-102-C | shared clone plan、awaitable node batch outcome、integer sibling/side plan、success-effect isolation、same-tab recovery descriptor | existing duplicate parity、完整affected permission、provider/side completion、effects、undo failure、reload recovery與integer order PASS | primitive未被D使用前可整片回復 |
| WP-102-D | aggregate assignment／archive、clipboard copy/cut、forest paste orchestration | tri-state、repeat copy、cut move、side reload、cycle/stale/failure/undo/order PASS | 保留A-C，移除DEV-102 actions／clipboard |
| WP-102-E | QA/QC、回歸、文件收斂 | QA-DEV-102全部P0/P1與DEV-013／027B／028／048／070／074／075／079／084／088／095回歸 PASS | 第一個Fail回對應WP；不得放寬expected |

RD 必須依 A→B→C→D→E 執行。可在 A/B、C、D 各自形成可回復 slice；不得同時保留 legacy單選state與新multi store，或 legacy immediate duplicate與mindmap clipboard copy雙重入口。

## 15. Acceptance Criteria

- AC-102-001：blank left drag達6px後出現一個矩形；node center命中、zoom 50／100／200%與scroll後結果正確。
- AC-102-002：plain marquee取代 selection；preview／commit／cancel、blank click、board switch、Escape與scene-transform cancel lifecycle符合第6、11節。
- AC-102-003：selection store仍是唯一 authority；symmetric-difference keyed notify成立，MindMapView render與geometry recompute delta為0。
- AC-102-004：右鍵 selected node保持多選並以該node為anchor；右鍵 unselected node收斂單選；blank不開 task menu。
- AC-102-005：menu顯示`已選取 N 個任務`；`enabled=false`的action不出現在心智圖DOM，清單只保留可執行action且文字、對比、列高符合compact UI gate；execution-time guard仍阻止狀態競速下的mutation。
- AC-102-006：mindmap`複製`只寫clipboard、不立即新增；clipboard actions以opt-in只出現在mindmap，其他模式不外洩且`複製任務`仍立即duplicate。
- AC-102-007：父與後代同時選取時，copy／cut／archive只處理top-most forest root一次；assignment仍作用於每個明確選取 canonical task。
- AC-102-008：existing immediate duplicate與copy paste共用唯一clone plan；copy可重複執行，每次新IDs、roots連續插在exact anchor後、子樹／允許欄位／internal dependencies正確；top-level side與reload後版面一致。
- AC-102-009：cut在paste前不改資料且有單一視覺signal；成功paste後搬移完整forest、正確寫入／移除root side override、清clipboard並可一次undo／redo回放node、reindex siblings與side。
- AC-102-010：cross-board、projection、stale、archived、permission、cycle、cut-into-self／descendant全部fail closed且零部分寫入；任一被reindex的未選取existing sibling缺權限也整批拒絕。
- AC-102-011：copy／cut／assign／archive／undo／redo persistence中途失敗只可回`compensated`或`indeterminate＋canonical readback`；same-tab hard reload依descriptor維持target lock，不得顯示假成功、移動undo stack或解鎖重入。
- AC-102-012：貼上 order全部為integer-safe，plan列出完整reindexed IDs與source/destination scope；不得讓decimal抵達`bigint` provider boundary。
- AC-102-013：multi assignment all／some／none、mixed click、role mutual exclusion、untouched member preservation與one undo正確。
- AC-102-014：batch archive顯示實際union subtree數量，成功後一筆undo；tracking projection整批鎖定。
- AC-102-015：multi Arrow／Enter／Tab只先收斂primary；Delete／Backspace走batch archive；menu使用native Tab／Shift+Tab、Escape／outside click與focus return，focus只落在可見可執行button；不驗收Arrow／Home／End menu roving或Shift+F10。
- AC-102-016：中鍵平移、單node drag、relationship、quick-title、details、filter、zoom、undo與tracking projection既有流程無回歸；從multi中的任一node開始drag必先收斂single且不群組移動。
- AC-102-017：1440×900、1024×768 menu／overlay無裁切、重疊或水平overflow；390／320既有fallback無回歸。
- AC-102-018：200／500 nodes達第12節perf gate；node bounds drift <=0.5px，connector／relationship path不變。
- AC-102-019：console errors、page errors、unexpected failed requests與visible errors為0；failure injection必須顯示預期訊息。
- AC-102-020：TypeScript、targeted ESLint、`build:test`、DEV-013／027B／028／048／070／074／075／079／084／088／095回歸通過。

## 16. Stop Conditions 與非授權邊界

任一條件發生時停止該WP並回 PM／RD，不得自行擴張：

- 需要 schema、migration、RLS、RPC、provider transaction或production資料修改。
- 無法在單一 selection authority 下完成多選，或需讓整棵 tree訂閱 global set。
- 同看板 paste只能靠 fractional order或與DEV-101衝突的全域排序重構。
- paste plan無法列出全部reindexed siblings／side before-after，或side storage無法write-readback與補償。
- shared permission／assignment／archive規則不足，必須改角色模型或跨模式產品語意。
- clipboard action無法以explicit opt-in隔離而會外洩其他mode，或clone projection必須維護第二份欄位規則。
- provider失敗無法判定或補償，卻沒有 canonical readback路徑。
- 第一筆mutation前無法保存recovery descriptor，或hard reload後無法在readback前恢復相同target lock。
- working tree重疊變更無法以增量patch保留，或 verifier只能以移除既有expected通過。
- 任一 P0 negative case出現partial mutation、假成功、cycle、資料遺失或undo不完整。

## 17. 文件成熟度與執行邊界

本文件已完成三輪RD技術主管審查。R1修正placement identity、action leakage、clone rule、void batch atomicity與cut fingerprint；R2補齊root side transaction、完整reindex affected set、same-tab reload recovery、success-effect／undo failure邊界與真實keyboard baseline；R3以產品source、failure injection、browser artifact與rendered evidence完成implementation review，並修正Strict Mode selection replay、relationship pointer ownership、stacking hit target與placement focus recovery等整合問題。WP-102-A～E已完成，本機 static／pure／browser／performance／fault／viewport／regression gates通過。未執行commit／push／PR／deploy、production mutation、正式provider或production smoke，release仍未授權。

## 18. Changelog

- 2026-09-03：依使用者確認建立 DEV-102；採矩形圈選、心智圖專屬右鍵 presenter、多選 action visibility、copy／cut共用clipboard與paste-after exact anchor。
- 2026-09-03：明定父子重疊以forest-root normalization解決，不把copy上鎖；指派採all／some／none atomic batch語意。
- 2026-09-03：明定DEV-076左鍵抓圖平移維持放棄，不藉本需求恢復。
- 2026-09-03：RD技術主管審查後改用`primaryPlacementId／anchorPlacementId`、clipboard action explicit opt-in、共用clone plan、awaitable typed batch outcome與structure-only cut fingerprint；移除強制獨立overlay component，揭露application saga的indeterminate技術債。
- 2026-09-03：RD技術主管第二輪補入side override transaction、完整reindex/permission集合、sessionStorage reload recovery descriptor、commit後單次effects與undo reject contract；移除不存在的menu roving baseline，補明multi node drag與scene-transform cancel。
- 2026-09-03：完成WP-102-A～E、local automated QA／QC與RD技術主管R3；補入真實UI fault seams、same-tab recovery、四方向200／500-node performance、390／320邊界及受影響回歸，狀態更新為Implemented／未Release。
- 2026-09-04：依使用者回饋修正心智圖右鍵清單視覺契約：不可用action直接隱藏；移除常駐鎖定說明；心智圖專屬選單採252px、13px文字與32px列高，補入對比／密度／DOM visibility browser gate；其他模式不變。
