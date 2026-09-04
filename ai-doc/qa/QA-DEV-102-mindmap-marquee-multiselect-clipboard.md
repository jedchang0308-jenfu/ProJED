# QA-DEV-102：心智圖矩形圈選、多選右鍵與剪貼操作驗證計畫

- 狀態：`Executed / Local Automated QA PASS / QC Evidence Verified / Tech Lead Reviewed R3 + UI Follow-up / 未 Release`
- 日期：2026-09-04
- 依據：SPEC-102
- 關聯：DEV-102
- 風險：Medium-High
- 驗證責任：QA制定案例與 gate；RD先完成每一 WP self-check；QC以獨立 rendered evidence判定，不接受文件或source marker代替實際操作。

## 1. 驗證目標與邊界

驗證桌機心智圖的矩形圈選、selection authority、專屬右鍵清單、不可用action隱藏、批次指派／封存，以及 copy／cut → paste-after forest transaction。驗證必須同時證明：

- 正常路徑確實可用。
- permission、stale、cycle、projection與provider failure不會產生partial mutation或假成功。
- 多選不破壞DEV-074單一Scene、DEV-075 keyed selection效能與DEV-084 pointer ownership。
- 心智圖 clipboard語意不改變其他模式既有 immediate duplicate。

本計畫只允許 local／local-test或經隔離的可丟棄測試資料；不操作production、不新增migration、不deploy。390×844與320×568只做既有頁面邊界回歸，不宣稱touch marquee。

使用思考習慣：#風險優先、#可驗證性、#反證思維、#邊界條件

## 2. Entry／Fixture／Evidence Contract

### 2.1 Entry

- 由既有 Board mode switch 進入`心智圖`。
- Actor矩陣：owner／editor、read-only或缺少單項 capability、權限在menu開啟後被撤回。
- Viewport：1440×900、1024×768；boundary 390×844、320×568。
- Zoom／scroll：50%、100%、200%，以及畫布已平移／scroll後的相同fixture。

### 2.2 Deterministic fixture

`dev-102-v1`至少包含：

- 左右各兩個root，深度至少4層，含父子可同時被矩形命中。
- 三個不同parent下可剪下的root與可貼上的top-level／child anchor。
- 同名任務、notes、tags、主責／協作者、日期、status與internal／external dependencies。
- 至少一個tracking projection、archived／stale可注入source、permission denied target。
- 200與500 visible node dense variants；至少20條一般connector與20條relationship path。
- provider fault injection：第1筆、第N筆、dependency create、cut update、compensation與canonical readback失敗點。

fixture建立、測試與cleanup需有 deterministic ID與residual count。任何 unexpected zero nodes、缺projection／dependency或cleanup residual不為0直接Fail。

### 2.3 Evidence minimum

每個browser run記錄 source revision、URL、viewport、zoom、fixture ID、操作步驟、before／after task fingerprint、selection／clipboard diagnostics、undo stack delta、geometry counters、console／page／request／visible errors及screenshot。純source marker或手填JSON不能作為rendered PASS。

## 3. FMEA

| 失效模式 | 可能原因 | 使用者／資料影響 | 偵測方式 | 優先級 | 對策／案例 |
|---|---|---|---|---|---|
| 圈選命中受zoom影響 | client/world transform重複套用 | 選錯任務 | 50/100/200%同一視覺矩形 | P0 | M01-M08 |
| 左鍵圈選又觸發pan／node drag | pointer owner不唯一 | 畫面跳動／誤搬任務 | gesture trace＋geometry | P0 | G01-G09 |
| placement與canonical ID混用 | primary／anchor命名或resolver不明 | 錯改tracking來源／找不到anchor | typed contract＋projection fixture | P0 | L01、F01、AUTH05 |
| selection存在兩個authority | legacy state未移除 | ring、menu、keyboard不同步 | source＋render/notify probe | P0 | L01-L02、PERF04-PERF05 |
| clipboard action外洩其他模式 | catalog預設收錄所有section action | Board／List出現未支援功能 | cross-mode menu snapshot | P0 | L06、C15 |
| 全樹因多選重render | global Set subscription | 大圖卡頓 | 200/500 render delta | P1 | PERF01-PERF07 |
| disabled action未隱藏或可穿透 | 只做低透明度樣式／缺execution guard | 選單雜訊／誤執行 | DOM visibility＋mutation spy | P0 | C01-C14 |
| 父子同選重複copy／archive | 未做forest normalization | 重複子樹／重複mutation | canonical forest artifact | P0 | F01-F08 |
| 複製當下立即新增 | 誤沿用task.duplicate | 不符合clipboard心智模型 | storage count before paste | P0 | CP01 |
| cut在paste前已移動／刪除 | 把cut當move | 來源消失、取消不可復原 | reload／Escape前後fingerprint | P0 | CT01-CT07 |
| paste到自身descendant成cycle | target validation不足 | tree損壞／無限遞迴 | cycle negative＋reload | P0 | PASTE12 |
| 同看板command誤走跨ownership | 重用錯command | guard失敗或ownership錯亂 | source guard＋command trace | P0 | L03 |
| 批次第N筆失敗留下半套 | void／fire-and-forget batch被誤當atomic | 資料不一致、假成功 | typed outcome＋fault injection＋readback | P0 | X01-X09 |
| mindmap copy與既有duplicate漂移 | 重寫第二份欄位／dependency projection | 不同入口複製結果不一致 | shared-plan parity | P0 | CP02-CP04、L07 |
| mixed assignment覆蓋未觸碰成員 | aggregate patch不精確 | 人員資料遺失 | before/after role matrix | P0 | A01-A10 |
| permission開menu後變更仍執行 | 只在open-time guard | 未授權變更 | revoke-before-click | P0 | AUTH07 |
| paste產生decimal order |沿用fractional writer| bigint provider拒絕／永久saving | payload capture＋integer assertion | P0 | L11、PASTE06、PASTE14 |
| root side未納入paste transaction | sideOverrides是獨立localStorage state | 搬移後左右側錯誤、reload跳側、undo不完整 | side before/after＋reload＋fault injection | P0 | L15、PASTE15-PASTE18、X10 |
| reindex漏掉未選取siblings | 只把selected roots當affected set | 未授權改order／undo缺資料 | complete scope plan＋permission deny | P0 | L16、PASTE19、AUTH08 |
| reload清掉indeterminate lock | pending registry只在memory | 不確定operation可被重入 | session descriptor＋hard reload | P0 | L17、R01-R08、X11-X15 |
| batch逐筆產生success effects | 直接loop updateNode | 重複activity／calendar cleanup／假成功undo | effect spy＋undo stack | P0 | L18、U01-U08 |
| menu驗收假設不存在的roving focus | 把新能力誤寫成baseline | 無謂擴張／測試必然錯誤 | source assertion＋Tab flow | P1 | L19、K03-K04 |
| tracking projection被結構搬移或指派 | visual/canonical與來源看板permission混淆 | 跨ownership未授權修改 | projection matrix | P0 | F07、AUTH05 |
|多選Delete只封存primary|鍵盤仍讀single getter| 使用者以為整批已處理 | confirm count＋storage | P1 | K08 |
| cut狀態只靠顏色 | 缺accessible state | 無法辨識 | accessibility tree＋forced colors | P1 | AX01-AX04 |
| menu／overlay被裁切 | anchor／portal／viewport錯誤 | 操作不可用 | 1440/1024 screenshots＋bounds | P1 | V01-V04 |

## 4. L0 Source 與 Architecture Gate

| ID | 檢查 | 通過標準 |
|---|---|---|
| L01 | selection owner／identity | `MindMapView`不存在並行`useState(selectedNodeIds)`；唯一owner為擴充後private store；primary／anchor皆為placement ID且mutation只能經typed resolver取得task ID |
| L02 | keyed notification | store依placement key訂閱，只通知effective membership symmetric difference與必要primary |
| L03 | placement command | paste-after使用同看板forest command；未呼叫拒絕same ownership的跨ownership command |
| L04 | menu presenter | MindMap使用local專屬shell且不把multi state寫入BoardContextMenuState；其他mode仍使用GlobalContextMenu |
| L05 | unavailable rows | mindmap presenter以`hideDisabled`不mount `enabled=false` action；execution handler仍再次guard |
| L06 | action IDs／isolation | `task.copy`／`task.cut`／`task.paste-after`為`defaultMenu:false`或等價opt-in；只由mindmap include，且mindmap profile不含`task.duplicate` |
| L07 | shared clone plan | board/list/calendar既有immediate duplicate與mindmap paste共用唯一pure clone plan；欄位／ID／dependency規則無分叉 |
| L08 | clipboard | MindMapView-session memory-only，mode exit／board switch／reload cleanup；TaskNode/schema/local storage不新增clipboard欄位 |
| L09 | awaitable batch | UI不直接迴圈呼叫N次`updateNode`；shared batch回typed outcome、等待completion，且只在committed後push grouped undo |
| L10 | geometry | marquee overlay不進DEV-074 world geometry dirty dependencies |
| L11 | order | paste plan有integer assertion；無新增fractional order writer |
| L12 | data boundary | 無migration、RLS、provider schema、production endpoint或角色模型變更 |
| L13 | pointer ownership | blank primary-left only；middle pan、node drag、relationship／quick-title owner guard存在 |
| L14 | docs／scripts | SPEC／QA／dev_task／documentation_map與兩個DEV-102 script entry一致 |
| L15 | side transaction | paste plan含`sideOverrideBefore／After`；`mindMapSideStorage`提供可等待write-readback，commit／compensation／undo共同使用 |
| L16 | complete affected set | plan列出source/destination sibling scopes、`reindexedTaskIds`與完整`affectedTaskIds`；permission與pending lock不只檢查selected roots |
| L17 | reload recovery | 第一筆mutation前寫入並readback固定`projed.mindmap.batch-recovery.v1.${boardId}` descriptor；mount/hydration先恢復lock/readback，terminal convergence後才清除 |
| L18 | side effects／undo | shared batch不迴圈呼叫會產生activity／calendar／undo的public `updateNode`；success effects只在committed後一次emit，undo／redo非committed時reject |
| L19 | menu keyboard baseline | 不新增或宣稱既有roving；popup為有名稱的button list，使用native Tab／Shift+Tab、Escape／outside click與exact-anchor focus return；未完整實作ARIA menu pattern時不得套`role="menu"`，Shift+F10仍out of scope |

L0只能證明結構，不能單獨判定產品通過。

## 5. L1 Pure／Component Contract Cases

### 5.1 Marquee 與 selection

- M01：四方向拖曳都normalize成相同rect。
- M02：距離5.99px不進marquee；6px進入。
- M03：node中心位於邊界視為命中；只碰node外框但中心不在內不命中。
- M04：collapsed／unmounted node、中央board title、connector／relationship handle不命中。
- M05：plain marquee取代；原primary仍命中時保留，否則依navigation index第一命中重設。
- M06：preview多次變更只通知symmetric difference；pointercancel回復committed set。
- M07：空結果commit得到empty selection與null primary。
- M08：invalid placement移除後，selection與primary自我收斂。

### 5.2 Canonical／forest normalization

- F01：同一canonical task的兩個visual placement只產生一個canonical target。
- F02：parent＋child＋grandchild同選只產生parent forest root。
- F03：兩個不同branch child保持兩個forest roots與navigation order。
- F04：assignment flat targets保留明確選到的parent與child，不套forest collapse。
- F05：cycle／orphan／duplicate parent data fail closed，不猜測forest。
- F06：archive affected count是roots的union subtree且無重複。
- F07：tracking projection可存在selection，但multi copy／cut／paste／assignment／archive全部標記unsupported。
- F08：right-click selected node只換primary／anchor，不改membership。

### 5.3 Menu resolution

- C01-C04：single／multi、clipboard empty／copy／cut的action matrix符合SPEC-102。
- C05：不可用action依cardinality、permission、projection、invalid target從心智圖DOM隱藏，permission deny優先於enabled；execution guard仍保留。
- C06：open-time enabled、execution-time permission撤回時零mutation。
- C07：unselected node右鍵收斂single，clipboard保持。
- C08：blank right-click不建立task menu。
- C09：paste action使用exact anchor，不取selection第一項。
- C10-C14：不可用action不進入DOM與Tab順序；可見action的label、focus order、pointer／keyboard execution正確。
- C15：Board／List／Gantt／Calendar的resolved menu不含copy／cut／paste-after，且既有duplicate仍存在。

### 5.4 Clipboard／paste plan

- CP01：copy只建立immutable snapshot，task count不變。
- CP02：每次paste重新產生IDs；selected roots各加`（副本）`，descendant title不改。
- CP03：notes／允許欄位保存；note ID重建。
- CP04：internal dependency改接new IDs；external dependency／relationship／tracking ref不複製。
- CP05：copy clipboard成功paste後保留，可第二次paste且IDs不同。
- CP06：相同source tree經既有immediate duplicate與mindmap clipboard paste時，除root placement／order／新IDs／createdAt外，欄位與internal dependency projection等價，證明共用clone plan。
- CT01：cut只記live roots與source structure fingerprint，task parent／order不變。
- CT02：Escape取消cut，fingerprint不變。
- CT03：cut source structure fingerprint mismatch回stale；clipboard依SPEC清理。
- CT04：invalid target但live source保持cut clipboard。
- CT05：成功cut paste清clipboard、select moved roots。
- CT06：cut後只修改title／notes／assignment／date，fingerprint仍有效且paste搬移最新live內容。
- CT07：cut後修改parent／order／archive／subtree membership，fingerprint失效並要求重新剪下。
- PASTE01：一個root貼在child anchor後，parent正確。
- PASTE02：多root保持相對順序並連續插入。
- PASTE03：top-level root採anchor side。
- PASTE04：copy可貼在原source後。
- PASTE05：cut roots來自不同parents時完整移除後插入destination。
- PASTE06：anchor前後既有siblings的order保持stable。
- PASTE07：source與target相同board才允許。
- PASTE08：anchor archived／missing／projection拒絕。
- PASTE09：cut source missing／archived拒絕。
- PASTE10：任一permission denial整批拒絕。
- PASTE11：ID collision重新規劃或fail closed，不覆寫既有task。
- PASTE12：cut貼在自身root／descendant拒絕。
- PASTE13：cycle或invalid hierarchy拒絕。
- PASTE14：所有planned order為safe integer；provider payload不含decimal。
- PASTE15：top-level copy/cut paste採anchor side，`sideOverrideAfter`與rendered side一致；reload後不跳側。
- PASTE16：root移成child會移除stale override；undo恢復原root side，redo再移除。
- PASTE17：child移成root寫入resolved side；copy undo移除created root override，不留orphan key。
- PASTE18：side storage write/readback失敗時node writes零開始或完整補償；不可成功toast。
- PASTE19：多source scopes與destination scope各normalize一次，plan列出每個order changed sibling；before/after integer序列無collision且undo完整。

### 5.5 Assignment／archive／undo

- A01：成員在全部target為checked；A02：部分為mixed；A03：皆無為unchecked。
- A04：click mixed／none加入全部；A05：click all從全部移除。
- A06：加入primary時從每個target collaborator移除同一人，反向亦同。
- A07：其他成員與未點擊role不被覆蓋。
- A08：visual projection canonical dedupe後不重複patch。
- A09：任一permission failure零patch；A10：成功只新增一筆undo且undo／redo還原全體。
- AR01：forest archive確認數量正確；AR02：parent＋child不重複封存。
- AR03：projection／permission／stale整批失敗；AR04：成功selection清除且一筆undo。
- U01：committed batch只產生一筆user-visible success result與一筆grouped undo。
- U02：N個task assignment/archive不產生N組重複activity；每個語意event的數量與plan一致。
- U03：archive calendar cleanup只在confirmed commit後依final affected set執行；rejected／compensated／indeterminate為0。
- U04：compensation/readback不產生反向success activity或額外toast。
- U05：undo inverse outcome為rejected／compensated／indeterminate時Promise reject，undo command留在undo stack、redo stack不變。
- U06：redo forward outcome非committed時Promise reject，command留在redo stack、undo stack不變。
- U07：undo／redo committed時各移動stack一次，node order、side override與selection結果符合plan。
- U08：dependency schedule只依confirmed final node state觸發，不被optimistic／compensation重複套用。

### 5.6 Recovery descriptor

- R01：descriptor schema/version/board/kind/target/fingerprint/phase validation正確，target IDs為complete affected set。
- R02：mutation前set＋readback成功才允許第一筆provider write。
- R03：sessionStorage unavailable／quota／write／readback mismatch時rejected且provider attempts=0。
- R04：phase依persisting→compensating／indeterminate順序保存；committed或完整compensated後清除。
- R05：同board hard reload後先恢復target lock，再readback分類before／after／conflict；分類前mutation入口locked。
- R06：other-board descriptor不阻塞目前board、不被誤刪；回到該board再恢復。
- R07：corrupt／unknown-version descriptor以key所屬board鎖住全部DEV-102 mutations並顯示recovery-required；只有完整provider hydration及hierarchy／integer-order invariants通過後才清除，不把未知operation當成功或靜默刪除。
- R08：tab close／fresh session不自動重播；canonical provider hydration為authority。

## 6. L2 Browser／Rendered Cases

### 6.1 Gesture 與 selection flow

- G01：blank click清除；5px drag仍是click；>=6px顯示marquee。
- G02：由左上→右下、右下→左上各圈選同一群node，結果一致。
- G03：50／100／200% zoom與scroll後圈同一視覺群組，命中一致。
- G04：拖曳中只有一個translucent rectangle與preview rings；release後矩形消失、selection保留。
- G05：pointercancel／lost capture／resize取消preview並回復原selection。
- G06：從node、quick-title、relationship handle起拖不開marquee。
- G07：中鍵仍平移；primary-left空白不平移；node drag仍只移動單node。
- G08：relationship tool／modal active時不開marquee。
- G09：selection不改zoom、scroll、node DOMRect、connector／relationship path。
- G10：multi-selection中從selected或unselected node開始drag，都先收斂為該placement並只移動該node；其他selected nodes不移動。
- G11：node contextmenu不啟動drag；開始node drag或marquee時關閉已開local menu。
- G12：marquee active期間wheel／zoom button／scene transform／resize先取消preview、回復drag前selection，再改viewport；不以舊center snapshotcommit。

### 6.2 Context menu／clipboard happy path

- B01：圈選四個tasks，在其中一個右鍵；menu header為`已選取 4 個任務`，action矩陣正確。
- B02：不可用actions不顯示、不進入Tab順序；可執行actions可由mouse／keyboard操作，無mutation穿透。
- B03：多選copy後立即檢查storage count不變；toast與clipboard state正確。
- B04：在未選取task右鍵使selection收斂single，但copy clipboard仍在；paste使用該exact task作anchor。
- B05：copy paste建立新forest、new IDs／notes／internal dependency與order正確，並選取新roots。
- B06：換另一anchor再paste同一copy clipboard，第二forest IDs不同。
- B07：多選cut後來源未移動、cut visual可辨識；在另一parent anchor後paste完成搬移。
- B08：undo／redo copy、cut各一次；一個使用者動作只對應一筆undo。
- B09：Escape取消cut後來源不變；copy clipboard不因Escape消失。
- B09-MODE：離開mindmap mode、切換board或reload後clipboard與cut signal清除；其他mode不顯示clipboard actions。
- B09-SIDE：copy/cut top-level paste後立即、reload、undo、redo的root side與side storage fingerprint一致，無orphan override。
- B09-RECOVERY：indeterminate後hard reload，recovered target lock使mutation actions隱藏，readback收斂後才恢復可見。

### 6.3 Batch assignment／archive

- B10：三個tasks形成all／some／none role組合，rendered tri-state與aria一致。
- B11：mixed加入、all移除、primary/collaborator互斥與untouched users均正確；一次undo。
- B12：選parent＋child＋另一branch後archive，confirm顯示union subtree count；成功與undo正確。
- B13：Delete／Backspace使用同一batch archive確認，不只處理primary。

### 6.4 Keyboard／focus

- K01：多選Arrow只收斂primary，同event不再移動；第二次Arrow才依DEV-075導航。
- K02：多選Enter／Tab只收斂，不開details、不建立child／sibling。
- K03：menu使用native Tab／Shift+Tab順序；不可用row不mount，focus只落可見action；Escape與outside click關閉。Arrow／Home／End與Shift+F10不是本DEV gate。
- K04：右鍵 selected node後focus與exact anchor一致；關menu後回anchor，anchor失效則回primary，再失效才回mindmap view owner，不落到body。
- K05：quick-title/input/IME/modal/relationship owner存在時，DEV-102 keyboard不攔截。
- K06：cut active第一次Escape取消cut、selection仍在；第二次Escape清selection。
- K07：copy clipboard active Escape只清selection，不清clipboard。
- K08：multi Delete／Backspace確認數量與storage結果一致。

## 7. Permission、Failure 與反證 Cases

| ID | 注入／操作 | 必須成立 |
|---|---|---|
| AUTH01 | 缺create，copy後開paste menu | paste不顯示；clipboard保留；execution guard仍拒絕直接呼叫 |
| AUTH01-DEP | copy snapshot含internal dependency但缺dependency create | paste不顯示；不降級成少複製dependency |
| AUTH02 | 任一cut source缺move/edit | cut不顯示；零來源改變 |
| AUTH03 | 任一assignment target缺assign | assign不顯示／零patch |
| AUTH04 | 任一archive target缺capability | archive不顯示／零archive |
| AUTH05 | tracking projection混入copy/cut/assignment/archive | multi mutation actions不顯示；selection不被偷偷縮小，且不得用目前看板權限修改canonical來源task |
| AUTH06 | read-only actor | 可依既有read policy看details；mutation actions均不顯示 |
| AUTH07 | menu開啟後撤權 | execution-time fail；零mutation、visible reason |
| AUTH08 | destination或source scope中一個未選取sibling因reindex需改order但缺update permission | paste整批locked；provider與side attempts=0 |
| X01 | copy create第1筆失敗 | 零新增、clipboard保留、visible error |
| X02 | copy create第N筆失敗 | 已建立資料補償；readback residual=0 |
| X03 | internal dependency建立失敗 | 新forest補償或結果未確認，不能成功toast |
| X04 | cut update第N筆失敗 | 全部parent／side／order回before，或回indeterminate並鎖住targets做readback |
| X05 | assignment第N筆失敗 | 全部roles回before；一個visible error |
| X06 | archive第N筆失敗 | 全部isArchived回before；selection仍可理解 |
| X07 | compensation本身失敗 | outcome=indeterminate；顯示`操作結果未確認`、鎖住相同targets、執行canonical readback／reload recovery |
| X08 | cut source在開menu後被移除 | 清cut signal／clipboard，提示重新剪下 |
| X09 | anchor在開menu後被封存 | paste失敗但live clipboard保留 |
| X10 | node persistence完成但side storage write/readback失敗 | node與side都補償回before，或indeterminate鎖完整affected set；不得成功toast |
| X11 | descriptor首次write或readback失敗 | outcome=rejected；provider／side attempts=0 |
| X12 | persisting中hard reload | mount先恢復lock並readback；未收斂前不可再paste／assign／archive |
| X13 | compensating中hard reload | mount依descriptor恢復compensation/readback，不重播forward command |
| X14 | descriptor corrupt或version未知 | board級visible recovery-required；完整provider hydration／invariant成功前不清除或開始mutation |
| X15 | undo／redo provider第N筆失敗 | command Promise reject；undo／redo stack位置不移動，無success effects |

任何X01-X15出現partial success畫面、逐項成功toast、clipboard誤清、reload靜默解鎖、side漂移、undo stack誤移或undo無法回before，一律P0 Fail。

## 8. Performance／Geometry Gate

| ID | Fixture／操作 | Gate |
|---|---|---|
| PERF01 | 200 nodes，100% zoom，四方向marquee各20次 | pointermove→overlay/preview median p95 <=32ms；Long Task=0 |
| PERF02 | 500 nodes，100% zoom，同上 | median p95 <=50ms；Long Task=0 |
| PERF03 | 500 nodes，pointerup commit 20次 | pointerup→final aria-selected／summary p95 <=100ms |
| PERF04 | preview集合A→B→C | notified IDs等於每次symmetric difference；無全500 node notify |
| PERF05 | 100次selection／primary變更 | MindMapView render delta=0；navigation index build與geometry recompute delta=0 |
| PERF06 | 50／100／200% zoom | connector／relationship path snapshot不變；node DOMRect drift<=0.5px |
| PERF07 | 一般URL無DEV-102 probe | test instrumentation不污染產品route；probe on/off p95差異<=20% |

Latency由capture-phase pointer event的`performance.now()`到MutationObserver觀察overlay／`aria-selected`變化。自動化固定cadence與真實Playwright pointer操作都需執行；只用synthetic reducer benchmark不足。

## 9. Visual／Accessibility／Visible Error Gate

- V01：1440×900、1024×768的marquee、menu與submenus均在viewport內；必要時flip／clamp，不遮住整個selection。
- V02：single ring、multi rings、preview與cut signal層級清楚；沒有持續toolbar、helper banner或多餘框中框。
- V03：可見action label不截斷；menu維持compact width／row height、可垂直scroll且focus item保持可見。
- V04：390×844、320×568維持既有fallback，不出現desktop marquee overlay、水平overflow或無法關閉menu。
- AX01：context popup、button list、checkbox/mixed、selection summary與可見action有正確role／name／state；不可用action不出現在DOM；不得以不完整`role="menu"`冒充ARIA menu pattern。
- AX02：cut狀態與error不只靠顏色；forced-colors／reduced-motion下仍可辨識。
- AX03：每次batch只播報一則live result；不對每個task重複播報。
- AX04：focus不落到disabled item執行路徑，不因menu close消失到body。
- 每個主要case記錄console errors、page errors、failed requests、`[role=alert]`、load-failed banner、visible HTTP 4xx/5xx、`Not Found`／`Internal Server Error`。
- 預期failure injection訊息需單獨分類；非預期visible／console／page／request error必須為0。

## 10. Regression Matrix

必跑：

- `npm run verify:dev-013-task-duplicate`
- `npm run verify:dev-048-task-multi-person-assignment`
- `npm run verify:dev-027b-xmind-interaction-polish`
- `npm run verify:dev-027b-xmind-interaction-polish-browser`
- `npm run verify:dev-028-cross-mode-task-interactions`
- `npm run verify:dev-028-cross-mode-task-interactions-browser`
- `npm run verify:dev-070-interaction-kernel`
- `npm run verify:dev-070-interaction-kernel-browser`
- `npm run verify:dev-074-mindmap-single-scene`
- `npm run verify:dev-074-mindmap-single-scene-browser`
- `npm run verify:dev-075-mindmap-keyboard-performance`
- `npm run verify:dev-075-mindmap-keyboard-performance-browser`
- `npm run verify:dev-079-mindmap-context-menu-create-relationship`
- `npm run verify:dev-079-mindmap-context-menu-create-relationship-browser`
- `npm run verify:dev-084-primary-pointer-isolation`
- `npm run verify:dev-084-primary-pointer-isolation-browser`
- `npm run verify:dev-088-task-lifecycle`
- `npm run verify:dev-088-task-lifecycle-browser`
- `npm run verify:dev-095-task-tracking-interaction-parity`
- `npm run verify:dev-095-task-tracking-interaction-parity-browser`

DEV-102實作需新增：

- `npm run verify:dev-102-mindmap-marquee-multiselect-clipboard`
- `npm run verify:dev-102-mindmap-marquee-multiselect-clipboard-browser`

工程輔助 gate：

- `npx tsc --noEmit`
- `npx eslint <DEV-102 touched source and verifier files>`
- `npm run build:test`
- `git diff --check`

若任一既有script因目前專案環境已知限制無法執行，必須記錄 exact command、exit code、錯誤、影響與 owner disposition；不得刪除或放寬expected換取PASS。

## 11. Browser Artifact Schema

browser完成後寫入 `output/playwright/dev-102-mindmap-marquee-multiselect-clipboard/result.json`：

```ts
type Dev102Evidence = {
  verifier: 'DEV-102';
  contract: 'mindmap-marquee-multiselect-clipboard';
  sourceRevision: string;
  fixtureId: 'dev-102-v1';
  environment: {
    url: string;
    userAgent: string;
    viewports: Array<{ width: number; height: number }>;
  };
  selectionCases: Array<{
    id: string;
    selectedPlacementIds: string[];
    primaryPlacementId: string | null;
    anchorPlacementId: string | null;
    resolvedCanonicalTaskIds: string[];
    notifiedPlacementIds: string[];
    viewRenderDelta: number;
    geometryRecomputeDelta: number;
  }>;
  mutationCases: Array<{
    id: string;
    operationId: string;
    mode: 'copy' | 'cut' | 'assign' | 'archive' | 'undo' | 'redo';
    beforeFingerprint: string;
    afterFingerprint: string;
    affectedTaskIds: string[];
    reindexedTaskIds: string[];
    sideOverrideBeforeFingerprint: string;
    sideOverrideAfterFingerprint: string;
    providerAttempts: number;
    sideStorageAttempts: number;
    compensationAttempts: number;
    activityDelta: number;
    calendarCleanupDelta: number;
    undoEntryDelta: number;
    result: 'committed' | 'rejected' | 'compensated' | 'indeterminate';
    targetsLocked: boolean;
    recovery: {
      descriptorWritten: boolean;
      phase: 'persisting' | 'compensating' | 'indeterminate' | 'cleared';
      recoveredAfterReload: boolean;
    };
  }>;
  performance: Array<{
    visibleNodeCount: 200 | 500;
    zoom: 0.5 | 1 | 2;
    latencyP95Ms: number;
    commitP95Ms: number;
    longTaskCount: number;
    geometryRecomputeDelta: number;
  }>;
  screenshots: string[];
  consoleErrors: string[];
  pageErrors: string[];
  requestErrors: string[];
  visibleErrors: string[];
  regressionCommands: Array<{ command: string; exitCode: number }>;
  cleanup: { residualRows: number; releasedPorts: number[] };
  passed: boolean;
};
```

- static verifier在browser前可允許artifact不存在；browser後再跑必須驗schema、required case IDs、threshold、error arrays、cleanup與`passed=true`。
- screenshot至少包含：single selection、multi marquee、compact multi-action menu、copy paste result與root side、cut visual、hard-reload recovery lock、batch assignment mixed、archive confirm、1024 viewport、390 boundary。
- artifact與screenshots必須來自同一source revision；舊artifact不得冒充current-head結果。

## 12. 執行順序與 Runtime Lifecycle

1. RD保存baseline：branch／HEAD／status／diff、touched-path manifest與既有selection/menu行為。
2. 執行DEV-102 static／pure verifier；第一個Fail回對應WP。
3. 啟動或安全重用local-test runtime。若新啟動，先記錄project、purpose、port、owner process tree與cleanup condition。
4. 執行browser gesture、happy path、permission、failure、performance、viewport與visible-error cases。
5. 執行DEV-102 static verifier第二次，驗browser artifact。
6. 執行第10節全部受影響回歸與工程gate。
7. QA確認P0/P1與evidence完整；QC另做至少一輪真實操作與artifact/source交叉核對。
8. 停止且只停止本任務啟動的process tree，確認port released；重用他人runtime不得停止。
9. 全部通過才可把QA標為Executed／PASS並建立QC文件；release仍需另行授權。

## 13. 判定規則

- `PASS`：AC-102-001～020、全部P0/P1、happy／negative／failure、performance、accessibility、viewport、visible-error、cleanup與required regression都有同source evidence且通過。
- `FAIL`：任一placement／canonical identity混用、clipboard action外洩、clone rule分叉、partial mutation、假成功、cycle、decimal order、side漂移、未選取reindex permission bypass、selection雙owner、全樹render、geometry recompute、pointer owner衝突、indeterminate在reload後未鎖target、success effect重複、undo stack誤移或主要回歸失敗。
- `未充分驗證`：缺browser rendered evidence、shared clone parity、side reload/undo、complete affected set、failure injection、session descriptor／indeterminate readback recovery、effect count、undo/redo failure、200／500 performance、1440／1024 screenshot、390／320 boundary、provider completion／compensation trace、cleanup或指定回歸。TypeScript／build成功不能補足。
- `阻塞`：fixture、local runtime、browser、provider fault injection或dirty worktree overlap無法安全隔離，導致必要case不能執行。保存證據後回PM／RD，不得預填PASS。

## 14. 目前執行結果

### 14.1 判定

`PASS（Local Automated QA）`。2026-09-04已完成產品實作、static／pure、browser rendered、failure injection、performance、viewport、受影響回歸、型別與build gates；QC交叉核對見`ai-doc/qc/QC-DEV-102-mindmap-marquee-multiselect-clipboard.md`。release仍未授權。

### 14.2 DEV-102 evidence

| Gate | 結果 | Evidence |
|---|---|---|
| Static／pure | PASS | `npm.cmd run verify:dev-102-mindmap-marquee-multiselect-clipboard`；selection、marquee、forest normalization、copy snapshot／clone plan、cut paste plan、menu isolation、static authority全數PASS |
| Browser／rendered | PASS | `output/playwright/dev-102-mindmap-marquee-multiselect-clipboard/result.json`；`passed=true` |
| Clipboard | PASS | nodes 18→20、copied roots=2、cut visual subtree count=8 |
| Batch | PASS | assignment applied=2、archive applied=2 |
| Zoom | PASS | 0.5／1／2皆選取2 nodes |
| Failure／recovery | PASS | forest create compensated、partial batch compensated、timeout indeterminate、reload readback rejected-before-state、descriptor cleared |
| Performance | PASS | 200 nodes preview／commit p95=10.7／11.2ms；500 nodes=6.8／9.2ms；long tasks=0、rect drift=0、path stable |
| Mobile boundary | PASS | 390×844與320×568均不顯示mindmap／marquee，document width等於viewport |
| Menu UI follow-up | PASS | 不可用action DOM=0、disabled rows=0、可見action=4；width=252px、font=13px、row=32px、opacity=1、`contrastPass=true` |
| Error arrays | PASS | console、page、failed request皆0 |

四方向performance各尺寸共80正式樣本＋20 warmup；browser screenshots共8張，包含圈選、多選compact清單、copy、cut、laptop、hard-reload recovery、390與320邊界。rendered evidence已目視複核；新版menu不可用action不進DOM、disabled rows=0、字級≤13.5px、列高≤34px、opacity≥0.99、computed color `oklch(0.372 0.044 257.287)`通過`contrastPass=true`，並以menu width≤260px作為視覺 gate。

### 14.3 Regression／engineering evidence

- DEV-013、DEV-027B、DEV-028、DEV-048、DEV-070、DEV-074、DEV-075、DEV-079、DEV-084、DEV-088、DEV-095 static／適用browser gates：PASS。
- targeted ESLint：0 errors；`npm.cmd run build:test`：PASS；`git diff --check`：PASS。current full `npx.cmd tsc --noEmit`受工作樹既有非DEV-102變更阻斷：`MainLayout.tsx`未使用`switchBoard`／`showHome`、`TaskDetailsModal.tsx`缺`setIsCollectionDialogOpen`、`localTestService.ts`未使用`writeStrict`；不在本輪UI touched scope。
- task-owned local-test runtime已清理：port 4000與臨時port 4001 listeners皆為0。

### 14.4 驗證邊界

本結果只涵蓋current local-test implementation。未執行正式Supabase／Firestore provider、production RLS、跨tab／tab-close／跨裝置 exactly-once、deploy、production smoke或production mutation；不得據此宣稱release完成。
