# SPEC-075：心智圖方向鍵快速巡覽效能

- 狀態：`Implemented / Contract Verified / QA-QC PASS / 未 Release`
- 關聯 DEV：DEV-075
- 父交付點：DEV-027
- QA：QA-DEV-075
- 原始需求：`USER-20260820-MINDMAP-KEYBOARD-NAV-LAG`；行為修訂：`USER-20260820-MINDMAP-CENTER-BRIDGE`
- 風險：Medium
- Spec Impact：`Intentional replacement / horizontal navigation is side-aware and bridges the center`

## 1. 契約目的

使用者在心智圖快速連按或按住方向鍵時，選取與焦點嚴重落後。現況每個 `ArrowUp`／`ArrowDown` 都掃描全部可見 DOM、建立 ID 陣列並線性搜尋；selection 又位於 `MindMapView` React state，使一次移動重新執行遞迴 tree render，之後再查 DOM 聚焦。

本契約把 selection 熱路徑固定為：預先建立的 navigation index O(1) 查找、心智圖私有且按 node ID 精準通知的 selection store、node ref registry 與 latest-only focus rAF。完成後，一次 selection commit 不得因總節點數增加而擴大 React render 範圍，也不得觸發 DEV-074 world geometry recompute。

## 2. 權威性與相容邊界

- 本規格是 DEV-075 心智圖 selection runtime、navigation index、focus lifecycle 與 performance evidence 的 authoritative source。
- 本規格與SPEC-027B共同治理方向鍵產品語意；SPEC-070保持interaction ownership；DEV-071保持selection/details入口；SPEC-073保持quick-title；SPEC-074保持scene／geometry lifecycle。
- 2026-08-20使用者明確要求根任務可穿過中央看板名稱，故只取代舊「固定ArrowLeft=parent、ArrowRight=child、root停住」契約；上下順序、其他command與效能架構不變。
- ADR 不需要：此決策只影響心智圖內部、可依 S1～S3 分片回復，未改跨模式資料流、外部 API、持久化或難回復治理基準。替代方案與禁止事項已固定於第 6 節。

## 3. UX Intent 與行為契約

- 使用者與情境：使用者在大型心智圖中以鍵盤逐項檢視、快速跨任務定位，並接續新增、命名、關係線或明細操作。
- 成功結果：方向鍵輸入與 selection ring／焦點保持同步，不出現明顯堆積、停頓、漏步或跳錯任務。
- `ArrowUp`／`ArrowDown`：依目前 rendered DOM 等價的可見任務順序選取上一／下一項；到邊界維持原 selection並消耗既有事件。
- 水平鍵依分支畫面方向解析：按「朝中心」方向先選parent；已在root時跳過中央看板名稱，選取對側相對位置最接近的root。按「離開中心」方向時，有child便展開並選取第一個child。
- 中央看板名稱是非TaskNode的導航橋接點，不取得`aria-selected`、focus、quick-title、details或task command；對側沒有可見root時維持目前selection。
- 方向鍵不得建立任務、開明細、進入 quick-title、改 relationship、重設 zoom／scroll 或觸發 connector recompute。
- input／textarea／select／contenteditable／quick-title／modal／relationship exclusive owner 存在時，沿用既有 guard，不得攔截文字游標或上層 surface 鍵盤。
- board 切換先清 selection；初次進入有 root 的 board 仍選取第一個 root。relationship selection 清除 node selection；刪除後選取既有 delete plan 的 next node；外部 clear event 與空白／Escape 清除行為不變。
- selection focus 保留 `{ preventScroll: true }`；本 DEV 不新增自動平移或 scrollIntoView。

使用思考習慣：#系統描繪、#可驗證性、#拆解問題

## 4. Current Architecture Impact 與 Git 邊界

- `getVisibleMindMapNodeIds()` 在每次垂直 keydown 執行 `querySelectorAll`，再由 `indexOf` O(N) 尋找目前節點。
- `selectedNodeId` 在 `MindMapView`，並傳給所有遞迴 `MindMapNode`；selection 改變使 View/tree render、children 陣列取得與 hook execution 重跑。
- selection effect 以 rAF 再呼叫 `getMindMapNodeElement(...selectedNodeId)` 與 `focus()`。
- `MindMapNode` selection class 使用 `transition-all` 加 ring／shadow，會放大快速巡覽 paint；border width保持不變，選取不得改 bounds。
- 現行 `selectedNodeId` 不在 DEV-074 geometry dirty dependencies；此邊界必須維持。
- Active repo：`C:\VIBE CODING\ProJED\ProJED`；盤點 branch：`持續優化3`；HEAD：`df27be99711fe44462c96174c0e495d44d6a7209`。
- 工作樹已有 DEV-074、MindMap、verifier、package 與文件修改。RD 必須以實作開始當下 working tree 為 baseline，禁止從 HEAD 重建、整檔覆寫、`git reset --hard` 或 `git checkout --` 使用者變更。

## 5. End-State Architecture

```text
MindMapView
├─ navigationIndex（model-derived；含node side／root bridge metadata）
├─ selectionStore（private；single selectedNodeId authority）
├─ nodeElementRegistry（nodeId -> HTMLElement）
├─ latestFocusFrame（last selection wins；preventScroll）
└─ MindMapRootLayout
   └─ MindMapNode
      ├─ useMindMapNodeSelected(nodeId)（keyed subscription）
      ├─ aria-selected／selected ring
      └─ element registration／test-only render probe
```

架構硬規則：

- `MindMapView` 不得訂閱 selected ID 作為 React render state；keyboard／archive／relationship callbacks 每次從 selection store 同步讀 current ID。
- selection store 只通知 previous ID 與 next ID 的 listener；不得用一個全域 listener Set 讓所有 node 每次執行 snapshot。
- 一個時間只有 store 是 node selection authority；不得同時保留 `useState(selectedNodeId)`、DOM class imperative toggle 或第二個 context selection。
- navigation index 由 model tree 產生；keydown 不查 DOM、不排序、不走訪 tree、不配置完整 ID 陣列。
- selection commit 不 debounce、不跳過邏輯步數。只有 focus request 使用單一 rAF last-intent-wins；非 selection command 不需 flush 隱藏 queue，因本版不存在 selection queue。
- `React.memo` 不是主要修正；不得只加 memo 而保留完整 `selectedNodeId` prop或每鍵 DOM query。

## 6. Typed Implementation Contract

### 6.1 `mindMapNavigation.ts`（新增）

```ts
export type MindMapNavigationIndex = Readonly<{
  nodeIds: readonly string[];
  positionByNodeId: ReadonlyMap<string, number>;
  sideByNodeId: ReadonlyMap<string, MindMapDirection>;
  rootIdByNodeId: ReadonlyMap<string, string>;
  rootIdsBySide: Readonly<Record<MindMapDirection, readonly string[]>>;
  rootPositionById: ReadonlyMap<string, number>;
}>;

export function buildMindMapNavigationIndex(
  rootsBySide: Readonly<Record<MindMapDirection, readonly TaskNode[]>>,
  expandedNodeIds: ReadonlySet<string>,
  getChildren: (nodeId: string) => readonly TaskNode[],
): MindMapNavigationIndex;

export function getMindMapVerticalSelection(
  currentNodeId: string,
  index: MindMapNavigationIndex,
  direction: 'up' | 'down',
): string | null;

export function getMindMapHorizontalSelection(
  currentNodeId: string,
  index: MindMapNavigationIndex,
  direction: MindMapDirection,
  getParentId: (nodeId: string) => string | null,
  getChildren: (nodeId: string) => readonly TaskNode[],
): Readonly<{ nodeId: string; expandNodeId: string | null }> | null;
```

- traversal 固定為 `left roots depth-first → right roots depth-first`，每個 node 先自己再依已排序 children 遞迴；這與 `MindMapRootLayout`／`MindMapNode` 現行 DOM 順序相同。
- 只有 `expandedNodeIds.has(node.id)` 才走訪 children；以 `visited Set` 阻止壞資料 cycle／duplicate，保留第一次出現。
- `positionByNodeId` 建立一次；vertical lookup 只做 Map get、加減、clamp 與 array read。
- `sideByNodeId`、`rootIdByNodeId`與`rootPositionById`在同一次model traversal建立；horizontal lookup不得查DOM。跨中心以root在各自side的相對序位選對側root，避免中央標題成為第二種selection object。
- `MindMapView` 以 `useMemo([rootsBySide, expandedNodeIds, getChildren])` 建立 index。`getChildren` 已涵蓋 board、nodes、parent index與 filters；root side／order／filter／expand 變化會換依賴，selection 不會。
- `mindMapSelection.ts` 保留 delete／parent／first child pure helpers，移除 `mindMapDomSelectors` import、`getVisibleMindMapNodeIds()` 與舊 array/indexOf vertical helper。

### 6.2 `mindMapSelectionStore.ts`（新增）

```ts
export type MindMapSelectionChange = Readonly<{
  changed: boolean;
  previousNodeId: string | null;
  selectedNodeId: string | null;
  notifiedNodeCount: number;
}>;

export interface MindMapSelectionStore {
  getSelectedNodeId(): string | null;
  isNodeSelected(nodeId: string): boolean;
  setSelectedNodeId(nodeId: string | null): MindMapSelectionChange;
  subscribeNode(nodeId: string, listener: () => void): () => void;
  getDiagnostics(): Readonly<{ commitCount: number; notifiedNodeCount: number }>;
  dispose(): void;
}

export function createMindMapSelectionStore(): MindMapSelectionStore;
export function useMindMapNodeSelected(store: MindMapSelectionStore, nodeId: string): boolean;
```

- store 為前端 ephemeral object；`MindMapView` 每個 mount 建立一次，unmount `dispose()`。
- `setSelectedNodeId` 相同 ID 必須回傳 `changed:false`，不得增加 counter、通知或排 focus。
- 改變時先更新 current ID，再各通知 previous／next key 的 snapshot listener；相同 key 不重複通知，空 key不通知。通知前複製 listener 集合，unsubscribe during notify 不得破壞迭代。
- `useMindMapNodeSelected` 使用 `useSyncExternalStore`，subscribe 與 snapshot 都以該 `nodeId` 為鍵；server snapshot 與 client snapshot 同語意。
- 不加入 Zustand／Context global selected task，不改 `useBoardStore.selectedTaskId` 語意。

### 6.3 `MindMapView` authority switch

- 以 selection store 取代 `const [selectedNodeId, setSelectedNodeId]`；`selectNode(nodeId)` 保留既有 quick-title request取消、舊 editor cleanup、relationship selection cleanup，再呼叫 store。
- `selectRelationship()`、board reset、clear、invalid-node cleanup 改呼叫 store clear；initial root、delete-next、pointer、context menu、details、drag與 relationship draft仍走同一 `selectNode()` facade。
- `archiveNode()`、`toggleRelationshipTool()` 與 `handleKeyDown()` 在 callback 執行時讀 `selectionStore.getSelectedNodeId()`，不得以 stale closure 保存 selected ID。
- `handleKeyDown()` 垂直分支讀 memoized index；parent／child／create／delete使用同一次 current ID snapshot。callback dependency 不再包含 selected ID。
- `renderNode` 不傳 `selectedNodeId`；傳 stable `selectionStore` 與 `onNodeElementChange`。選取快速移動不得使 View render。

### 6.4 Node registry 與 focus

- `MindMapView` 持有 `Map<string, HTMLElement>`；`MindMapNode` ref mount/unmount 呼叫 `onNodeElementChange(node.id, element|null)`。
- `selectNode()` 只有在 store change 成立且 next ID 非空時排 focus。新 request 取消前一個 frame並覆寫 pending ID；frame 執行時再確認 registry element 存在、仍是目前 selection、不是 active element且不是同 ID quick-title editor，才 `focus({preventScroll:true})`。
- relationship selection、clear、board switch與 unmount必須取消 pending focus。移除舊 `[selectedNodeId]` focus effect與 selection 用 `getMindMapNodeElement` 查詢。
- root-side、relationship、drag 等其他 geometry DOM lookup不屬本任務，不得順手重構。

### 6.5 Paint 與 test-only probe

- `MindMapNode` 的 `transition-all` 改為 `transition-colors` 或明確等價的 color-only transition；selection ring立即顯示，border width、padding、transform與 DOMRect不得改變。
- query `dev075Phase=baseline|after` 才啟用 probe；一般產品路徑不得寫 performance data attribute或增加 render state。
- probe markers 位於 mindmap surface／node：`data-mindmap-view-render-count`、`data-mindmap-node-render-count`、`data-mindmap-selection-commit-count`、`data-mindmap-selection-notification-count`、`data-mindmap-navigation-index-build-count`。
- render count由 test-only layout effect更新 DOM attribute，不以 setState造成額外 render。單一步驟比對 changed node IDs；React StrictMode可增加次數，但不得讓第三個 node ID 的 render count變動。

## 7. State、Idempotency 與 Concurrency

| 事件 | 前狀態 | 後狀態 | 額外效果 |
|---|---|---|---|
| select node B | A／null | B | 通知 A、B；latest focus=B；relationship selection清除 |
| select same B | B | B | 完全 no-op；無通知／counter／focus |
| clear／board switch | A | null | 只通知 A；取消 focus；既有 editor／relationship cleanup |
| select relationship | A | null | node ring清除，relationship成為唯一 selected owner |
| delete A | A | plan.next／null | 沿用 delete plan；focus latest valid next |
| rapid A→B→C | A | C | store依事件順序提交；B與C邏輯步數保留，focus只落最新C |

- 所有動作發生在單一 browser main thread；不新增 async persistence、retry或 backend transaction。
- node 在 focus frame 前 unmount時安全 no-op；不得 fallback query DOM或聚焦舊節點。
- navigation index在 tree dependency變更時同步重建；index 中找不到 current ID時回傳 null並保持 selection，不猜測鄰近任務。

## 8. Data／API／Permission／Migration Impact

- TaskNode、parent index、workspace、board、relationship schema與 persisted geometry：無變更。
- Backend API、provider、Auth、permission、RLS、URL、environment variable與 migration：無變更。
- selection、navigation index、registry、focus frame與diagnostics皆不持久化、不跨 tab／device同步。
- 若實作需要改 board store selection、TaskNode shape、relationship storage或 permission，立即停止並回 PM；不得靜默擴張。

## 9. Current Scope／Out of Scope

Current Scope：

- O(1) model navigation index、private keyed selection store、node subscription、registry／focus、paint transition、probe、static/browser evidence與必要 verifier marker更新。
- 50／200／500 visible-node dense fixture；50%／100%／200% zoom；hierarchy connectors與至少20條 note relationships。
- initial、clear、board switch、delete、relationship、quick-title、collapsed/filter/order與viewport regression。

Out of Scope：

- 視覺 2D 最近節點導航、自動 scrollIntoView、PageUp／Home／End等新快捷鍵。
- subtree virtualization、Canvas／WebGL、新 renderer、整體 tree normalization或跨模式 selection architecture。
- DEV-074 scene／coordinate／path／dirty scheduler、drag、relationship style、資料／API／權限與 release。

## 10. RD Slices 與 Gate

| Slice | 主要輸出 | 必過 Gate | 回復邊界 |
|---|---|---|---|
| S0 Baseline | verifier wiring、HEAD/status/diff、before artifact、現行順序 | fixture可重現、before artifact完整、既有功能不改 | 移除本DEV新 verifier/artifact；不碰產品檔 |
| S1 Pure kernels | navigation/store typed API與unit/static | order／cycle／boundary／idempotence／keyed notify全綠；runtime未接管 | 移除新module/import；回S0 |
| S2 Selection authority | View store facade、Node keyed hook、legacy state/prop移除 | lifecycle與單步render isolation PASS；無雙owner | 整個slice回legacy owner；不得雙軌長存 |
| S3 Navigation/focus/paint | model index、hot-path replacement、registry/rAF、transition/probe | performance、focus、geometry、quick-title、zoom矩陣PASS | 回S2；不得恢復部分DOM query形成雙authority |
| S4 QA/QC convergence | artifact schema、screenshots、visible errors、受影響regression | 所有AC與QA cases PASS；TypeScript/lint/build輔助PASS | 第一個失敗回對應slice；不放寬expected |

每個 slice 完成 RD self-check 後才能進下一 slice。S4 由 QA 計畫驅動、QC 收集真實 rendered evidence；本地實作不包含 commit、push、PR、merge、deploy或production。

## 11. 逐檔 Patch Intent

| 檔案 | Slice | 必要變更 | 保護邊界 |
|---|---|---|---|
| `src/components/MindMap/mindMapNavigation.ts`（新增） | S1 | visible traversal、index與vertical O(1) lookup | pure；不讀DOM／React／store |
| `src/components/MindMap/mindMapSelectionStore.ts`（新增） | S1/S2 | keyed store、diagnostics、`useSyncExternalStore` hook | 不用全域store；不持久化；只通知old/new |
| `src/components/MindMap/mindMapSelection.ts` | S1/S3 | 保留delete/parent/child；移除DOM visible query與舊vertical array helper | 不改delete-next順序 |
| `src/components/MindMap/MindMapView.tsx` | S0-S3 | store owner、memo index、current snapshot、registry/focus、probe與cleanup | 不整檔重寫；不改DEV-074 geometry／quick-title／relationship／drag |
| `src/components/MindMap/MindMapNode.tsx` | S2/S3 | 移除selected ID prop、keyed hook、element registration、color transition、probe | selected bounds與a11y不變；不改quick-title/touch/drag |
| `scripts/verify-dev-075-mindmap-keyboard-performance.ts`（新增） | S0-S4 | baseline capture、pure/static、artifact schema | before artifact不可覆寫；static不取代browser |
| `scripts/verify-dev-075-mindmap-keyboard-performance-browser.pw.js`（新增） | S0-S4 | fixture、keyboard/perf/render/geometry/visible-error、JSON/screenshots | local-test only；不連production；不偽造PASS |
| `scripts/verify-dev-027b-xmind-interaction-polish.mjs` | S4 | focus source marker改驗registry/rAF contract | 不改鍵盤產品expected |
| `scripts/verify-dev-027g-mindmap-system-health.mjs` | S4 | selection authority與navigation isolation marker改為新module/store | 不移除relationship、delete、expansion、keyboard behavior checks |
| `package.json` | S0 | 增量加入兩個DEV-075 scripts | 不排序或覆寫既有dirty scripts |
| `ai-doc/dev_task.md`、`documentation_map.md`、`SPEC-075`、`QA-DEV-075` | S4 | 寫實際結果與收斂狀態 | QC未通過不得標Done |

原始效能slice預期不修改`mindMapKeyboard.ts`；2026-08-20使用者行為修訂已授權將其左右鍵action收斂為`select-horizontal`。`mindMapTree.ts`、DEV-074 coordinate／overlay modules、interaction profiles、store、schema與其他模式元件仍不修改。

## 12. Acceptance Criteria

- `AC-075-001`：`ArrowUp`／`ArrowDown`、side-aware parent／first child、左右root跨中心、邊界、collapsed/filter/order順序符合契約；中央看板名稱不被選取；100個輸入後final selection完全正確，漏步=0。
- `AC-075-002`：keydown hot path不含 `querySelectorAll`、visible tree traversal、sort、`indexOf`或完整ID array allocation；100次純selection的navigation index build delta=0。
- `AC-075-003`：selection single-step時`MindMapView` render delta=0，render-count有變化的node IDs最多2個；store notification delta最多2。
- `AC-075-004`：同ID selection為no-op；clear／relationship／board switch／delete-next只有唯一ring與正確focus，沒有stale frame或雙selection owner。
- `AC-075-005`：50與200 visible nodes在100% zoom的三次run median p95 `keydown→aria-selected paint <=32ms`；500 nodes median p95 `<=50ms`；量測窗內Long Task `>50ms`數量=0。
- `AC-075-006`：若baseline p95原先大於對應absolute gate，after除達absolute gate外還需至少改善30%；若baseline已達gate，after不得惡化超過20%。
- `AC-075-007`：50%／100%／200% zoom、20條relationship與快速100次方向鍵期間，geometry recompute delta=0、path data不變、selected前後node DOMRect差異`<=0.5px`。
- `AC-075-008`：quick-title/input/IME/modal/relationship/drag owner存在時不攔截方向鍵；一般node選取不開details、不進quick-title、不建立任務。
- `AC-075-009`：latest-only focus只落最終selected node、`preventScroll`維持、active element正確；focus ring可見且不造成layout shift。
- `AC-075-010`：1440x900、1024x768 rendered surface無重疊、裁切、斷裂、不可操作、非預期overflow或visible runtime error；390x844維持既有mobile boundary。
- `AC-075-011`：DEV-027B／027G／028／070／071／073／074受影響regression、TypeScript、targeted ESLint與`build:test`通過。

## 13. Fixture、Artifact 與 Commands

- Fixture ID：`dev-075-v1`；由local-test storage建立balanced tree，visible count固定50／200／500，左右roots、至少4層、長中文標題、collapsed branch、filter candidate、hierarchy connectors與20條note relationships。
- baseline在產品程式修改前產出；after使用相同browser、viewport、fixture、zoom、warm-up 20次、測量100次、16ms burst與33ms hold interval，各case跑3次並取median p95。
- latency由capture-phase keydown timestamp至MutationObserver觀察新node `aria-selected="true"`；Long Task使用PerformanceObserver。Playwright逐鍵操作另證明真實keyboard flow，不能只靠synthetic event。
- artifact：`output/playwright/dev-075-mindmap-keyboard-performance/result.json`；baseline：`.../baseline/keyboard-before.json`；screenshots同目錄依viewport／size／zoom命名。

固定新增package wiring：

```json
{
  "verify:dev-075-mindmap-keyboard-performance": "tsx scripts/verify-dev-075-mindmap-keyboard-performance.ts",
  "verify:dev-075-mindmap-keyboard-performance-browser": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev075-keyboard-performance -Filename scripts/verify-dev-075-mindmap-keyboard-performance-browser.pw.js -OutputDirectory output/playwright/dev-075-mindmap-keyboard-performance -BaseUrl http://127.0.0.1:4000/?dev075Phase=after -ArtifactWindowKey __DEV075_ARTIFACT -ArtifactPath output/playwright/dev-075-mindmap-keyboard-performance/result.json"
}
```

RD／QA執行順序：

```powershell
npm.cmd run verify:dev-075-mindmap-keyboard-performance -- --capture-baseline
# S0 使用同一 browser verifier 的 dev075Phase=baseline URL，輸出 baseline/keyboard-before.json
npm.cmd run verify:dev-075-mindmap-keyboard-performance
npm.cmd run verify:dev-075-mindmap-keyboard-performance-browser
npm.cmd run verify:dev-075-mindmap-keyboard-performance
npm.cmd run verify:dev-027b-xmind-interaction-polish
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
npm.cmd run verify:dev-027g-mindmap-expansion
npm.cmd run verify:dev-027g-mindmap-system-health
npm.cmd run verify:dev-027g-mindmap-system-health-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-070-interaction-kernel
npm.cmd exec tsx -- scripts/verify-dev-071-mindmap-selection-details.ts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev071-selection-details -Filename scripts/verify-dev-071-mindmap-selection-details-browser.pw.js -OutputDirectory output/playwright/dev-071-selection-details
npm.cmd run verify:dev-073-task-title-edit-defaults
npm.cmd run verify:dev-073-task-title-edit-defaults-browser
npm.cmd run verify:dev-074-mindmap-single-scene
npm.cmd run verify:dev-074-mindmap-single-scene-browser
npm.cmd exec tsc -- --noEmit
npm.cmd exec eslint -- src/components/MindMap scripts/verify-dev-075-mindmap-keyboard-performance.ts
npm.cmd run build:test
```

- browser gate若需啟動runtime，先重用安全且匹配的4000埠；否則依workspace lifecycle記錄project、purpose、port、process tree與cleanup condition。結束時只停止本任務啟動的process tree並確認port釋放。
- `run-playwright-code.ps1`現有generic artifact參數足夠；DEV-075不得為輸出標籤而順手重構wrapper。

## 14. Stop Conditions 與 Failure Recovery

任一成立即停止目前slice：

- navigation順序、邊界消耗、initial／clear／delete／relationship／quick-title語意與authority spec不同。
- legacy React state與store同時存在，或node收到全域selected ID／全域subscription。
- 單步造成View render、第三個node render、每鍵index rebuild、DOM query或geometry recompute。
- focus跳回舊node、搶走quick-title/input/modal focus、selected與active element不一致。
- absolute／relative performance gate、Long Task、geometry、viewport或visible-error gate失敗。
- 需要修改資料、API、permission、DEV-074 world geometry或新增renderer才能繼續。

Failure recovery：

- S1 pure module失敗只修／移除S1，不接runtime；S2 authority失敗整個回到legacy single owner，禁止雙軌補丁；S3失敗回S2且保留已通過store，不局部恢復keydown DOM query；S4失敗回對應slice，不改expected掩蓋。
- 每個slice保存本DEV touched-file diff；只回復DEV-075增量，不得回復使用者既有DEV-074或同檔其他修改。
- 第一個有效失敗保存fixture、size、zoom、event interval、expected/actual selection、p50/p95/max、long tasks、render/notification/index/geometry delta、focus、console/page/visible errors與screenshot。
- 此處只定義local implementation recovery，不是release rollback；本DEV尚未進入release。

## 15. Deferred Scope 與 RD Ready Gate

Future Phase Captured / Not Requested：

- 500+節點在本架構後仍未達gate時，才評估subtree virtualization／renderer分層；re-entry需先固定focus accessibility、connector anchor與搜尋／跳轉契約。
- 視覺2D最近節點導航是產品語意變更，需Human Re-entry與獨立contract，不與效能修正合併。

RD可開始條件已滿足：end-state、typed API、selection owner、navigation invalidation、file manifest、slices、fixture、artifact、commands、failure recovery、data／permission／release boundary已固定，無P0/P1未決問題。

RD完成條件：S0～S4逐一PASS，AC-075-001～011都有artifact／command／rendered evidence；QA-DEV-075更新為Executed且targeted QC通過。

## 16. Implementation Closure（2026-08-20）

- S0～S4均已完成；`mindMapNavigation.ts`、`mindMapSelectionStore.ts`、View／Node authority switch、ref registry、latest-only focus、color-only transition與test-only probe均依本契約落地。
- 50／200／500 nodes的baseline median p95為25.9／59.4／123.4ms，after為1.2／0.7／0.7ms；absolute與relative gate均PASS，Long Task與漏步均為0。
- `MindMapView` render delta、navigation index build delta與geometry recompute delta皆為0；selection render IDs限於前後兩node、single-step通知數為2，path與DOMRect穩定。
- 真實鍵盤、quick-title／IME／modal／relationship owner、focus lifecycle、50%～200% zoom、1440x900／1024x768／390x844 boundary與visible-error sweep均PASS。
- 第一次DEV-027B browser回歸揭露quick-title鍵盤完成後focus未回node；已以鍵盤限定的`restoreNodeFocus` intent修正，且全矩陣重跑PASS。
- Evidence：`output/playwright/dev-075-mindmap-keyboard-performance/result.json`、`baseline/keyboard-before.json`與同目錄screenshots；artifact含13個DEV-075 cases與14項exitCode=0 command results。
- QA-DEV-075=`Execution Complete / QA PASS / QC PASS`；本輪未commit、push、PR、merge、deploy或release。

### 16.1 中央看板名稱導航橋接修訂（2026-08-20）

- 根因：中央看板名稱不是TaskNode且不在navigation index；舊左右鍵固定parent／child，root往中心取得不到parent後停在原地，左側分支的水平語意亦與畫面方向相反。
- 修正：navigation index新增side／root metadata，`getMindMapHorizontalSelection`以model-only O(1) lookup解析向內／向外；root向內時直接橋接對側root，中央標題仍不成為selection owner。
- 真實Chromium evidence：`interactionEvidence.centerBridge`已驗證`dev075-node-0000`右root按Left選到`dev075-node-0001`左root，再按Right回到原root；centerSelected=false、focusMatchesSelection=true。
- 效能與幾何gate維持：最新13 cases全部missed steps=0、Long Task=0、View render delta=0、navigation rebuild delta=0、geometry recompute delta=0；console/page/network/visible errors=0。
