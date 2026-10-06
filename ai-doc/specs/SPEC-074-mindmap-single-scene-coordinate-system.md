# SPEC-074：心智圖單一 Scene 座標系重構

- 狀態：`RD Implementation Ready / 可執行 / Prepared / Not Implemented`
- 關聯 DEV：DEV-074
- 父交付點：DEV-027
- 決策：ADR-044
- QA：QA-DEV-074
- 原始需求：`USER-20260819-MINDMAP-SINGLE-SCENE-TRANSFORM`
- 風險：Medium
- Spec Impact：`Intentional replacement / No product contract drift`

## 1. 契約目的

心智圖縮放時，HTML 節點會因 CSS `zoom` 重新排版，而 SVG connector、note relationship、label、control point、hit target 與 drag preview 仍使用先前量測後快取的 path geometry。縮放期間又會暫停 geometry recompute，ResizeObserver 事件可能在暫停期間被丟棄，造成節點與線條落在不同座標狀態。

本契約把所有地圖幾何收斂到同一個 world coordinate scene。Zoom／pan 只改變 scene 到 viewport 的投影；只有真正改變 world layout 的事件才能重算節點與 path geometry。

使用者可觀察的成功結果：在縮放、平移、符合內容、展開收合、拖放、快速命名與關聯線編輯期間，節點、線條、標籤、控制點及點擊區持續對齊，且既有操作方式不變。

## 2. 權威性與相容邊界

- 本規格是 DEV-074 座標架構、縮放投影與 geometry evidence 的 authoritative source。
- SPEC-027／027B／027E／070／073 仍分別治理心智圖產品能力、鍵盤／拖放、note relationship、interaction ownership 與快速命名。
- 本規格有意取代 SPEC-027B「zoom 後必須重算 connector geometry」的技術策略：目標架構中，純 zoom／pan 不得改寫 world path；可觀察的 connector 對齊要求維持且加嚴。
- 在 DEV-074 尚未實作前，現行 runtime 仍是產品事實；本契約不把文件 ready 誤算成產品已修正。
- 不修改 SPEC-029 的 mobile mode 邊界；390x844 只驗證既有受限入口與其他已開放模式不回歸。

## 3. UX Intent 與既有行為契約

- 使用者與情境：使用者在大型心智圖中以滾輪、工具列或「符合內容」查看不同層級，並持續操作節點、關係線與拖放。
- 主要任務：縮放與移動畫布後，仍能準確辨識拓撲並點選、拖曳及編輯正確物件。
- 成功結果：縮放只改變觀看比例，不改變節點間的 world geometry 或互動語意。
- 不能發生：線段離開節點、控制點／hit target 與可見線分離、縮放後點到錯誤物件、scroll range 消失、畫面突然跳到非預期位置或出現可見 runtime error。
- `Ctrl`／`Meta` + wheel：保留指標位置作為縮放錨點。
- 工具列 `+`／`-`／`100%`：維持現行 behavior-compatible 基線，提交後置中可見內容。
- 「符合內容」：依可見 world bounds 計算倍率並置中；保留現行 0.86 安全係數與 25%～400% 範圍。
- 中鍵 velocity pan 保留；已撤回 DEV-076 的 fine-pointer 左鍵 direct pan，不納入現行心智圖互動契約。一般 scroll、選取、relationship mode、drag、quick-title、鍵盤與 context menu 其餘語意不變。

使用思考習慣：#設計思考、#可驗證性

## 4. Current Architecture Impact

受影響面是心智圖 viewport、content shell、座標轉換、DOM geometry、SVG path、relationship interaction、drag preview 與 fit／center 計算。任務資料、relationship 資料語意、permission、interaction profile、後端與其他模式不受影響。

現況的耦合點：

1. content layer 以 CSS `zoom` 同時縮放並觸發 layout reflow。
2. `getElementLocalRect()` 混用 `offsetLeft`、`getBoundingClientRect()` 與除以 zoom。
3. connector／relationship path 存在 React state，取決於特定 ResizeObserver／render 時序。
4. pointer、endpoint、control point、drag preview 分別在 map-local 與 screen coordinate 間手工轉換。
5. viewport scroll extent 依賴被 zoom 的大型 flex content，無單獨的 stage bounds authority。

### 4.1 實作基線與 Git 邊界（2026-08-19）

- Active repo：`C:\VIBE CODING\ProJED\ProJED`；盤點時 branch：`持續優化3`；HEAD：`df27be9`。
- 工作樹不是乾淨狀態。`MindMapView.tsx`、`MindMapNode.tsx`、`MindMapRelationshipStyleDrawer.tsx`、`mindMapExpansion.ts`、`mindMapKeyboard.ts`、`mindMapTree.ts`、既有 027E／027F／027G／070／073 verifier 與 `package.json` 都已有使用者修改。
- DEV-074 RD 必須以「實作開始當下的 working tree」為 baseline；禁止從 HEAD 重建上述檔案、禁止 `git checkout --`、`git reset --hard` 或以整檔覆寫消除既有 quick-title、Delete、expansion、interaction ownership 與 verifier 變更。
- S0 先執行 `npm.cmd run verify:dev-074-mindmap-single-scene -- --capture-baseline`；verifier 以 Node API 保存 HEAD、`git status --short` 與 DEV-074 touched-path diff 到 `output/playwright/dev-074-single-scene/baseline/`。後續只接受可逐檔說明的增量 diff，且不得覆寫 baseline。
- 本 DEV 不要求先清理或提交其他 dirty changes，也不授權建立 branch、commit、push、PR、deploy 或 release。

## 5. End-State Architecture

```text
MindMapView
├─ toolbar／screen HUD（不屬於 world geometry）
└─ viewport（唯一 scroll／clip／wheel／pan owner）
   └─ stageSizer（只提供縮放後 scroll extent）
      └─ scene（唯一 world-to-stage matrix；transform-origin: 0 0）
         ├─ hierarchy connector SVG
         ├─ note relationship SVG／label／control handles
         ├─ relationship hit targets／inline label editor
         ├─ drag connector／insertion preview
         └─ center topic／HTML task nodes／collapse controls
```

架構規則：

- `viewport` 是唯一 scroll owner；不得在 scene 內新增第二個可滾動容器。
- `stageSizer` 不承載地圖互動，只以縮放後 bounds 產生可捲動範圍。
- `scene` 內所有幾何元素共用同一個 CSS matrix；不得只縮放 nodes 或只縮放 SVG。
- toolbar、固定式 relationship style drawer 與跟隨指標的 drag badge 可留在 screen HUD；它們不得成為 world geometry authority。
- 若 HUD 需要指向 scene 物件，只能透過本規格的 coordinate mapper 投影，不得自行除以 zoom。

### 5.1 固定 DOM 與 layout owner

`MindMapCanvasShell` 實作後必須形成以下實際階層；命名可等價，但 data marker 與責任不可省略：

```tsx
<div ref={viewportRef} data-mindmap-viewport data-mindmap-scroll-owner="true">
  <div ref={stageRef} data-mindmap-stage-sizer style={stageStyle}>
    <div
      ref={sceneRef}
      role="tree"
      data-mindmap-scene
      data-mindmap-coordinate-space="world"
      style={sceneStyle}
    >
      {mapLocalOverlaysAndNodes}
    </div>
  </div>
</div>
```

- viewport 保留 `overflow-auto`；stageSizer 與 scene 都必須是 `overflow: visible` 且不得成為 scroll owner。
- scene 保留現行 `min-w-[260vw]`、`min-h-[220vh]`、`px-[55vw]`、`py-[45vh]` 與 layout tokens，避免在本 DEV 同時改排版手感。
- scene 必須以 `position: absolute; left: 0; top: 0; transform-origin: 0 0` 放在 `position: relative` 的 stageSizer 內。
- `sceneWidth／sceneHeight` 由未受 transform 影響的 `offsetWidth／offsetHeight`（必要時取 `scrollWidth／scrollHeight` 較大值）量測，不得用 transformed DOMRect 當 intrinsic size。
- stage 與置中 translation 的唯一公式如下：

```text
scaledWidth  = sceneWidth  * scale
scaledHeight = sceneHeight * scale
stageWidth   = max(viewportWidth * 2, scaledWidth)
stageHeight  = max(viewportHeight * 2, scaledHeight)
translateX   = (stageWidth  - scaledWidth)  / 2
translateY   = (stageHeight - scaledHeight) / 2
```

scene 使用 `matrix(scale, 0, 0, scale, translateX, translateY)`。stageSizer 以至少兩個 viewport 的 world scroll extent 保留四邊可達空間；這是唯一 stage padding，不另加第二份 screen-space transform。

## 6. Coordinate Contract

### 6.1 權威型別與方向

RD 可調整實際命名，但必須保留等價且單一的 typed boundary：

```ts
type MindMapWorldPoint = { x: number; y: number };
type MindMapClientPoint = { x: number; y: number };
type MindMapWorldRect = {
  left: number; top: number; right: number; bottom: number;
  width: number; height: number;
};
type MindMapViewportTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

interface MindMapCoordinateMapper {
  worldToClient(point: MindMapWorldPoint): MindMapClientPoint;
  clientToWorld(point: MindMapClientPoint): MindMapWorldPoint;
  elementToWorldRect(element: HTMLElement): MindMapWorldRect;
}
```

實際 module 固定新增 `src/components/MindMap/mindMapCoordinateSystem.ts`，至少 export：

```ts
export type MindMapWorldPoint = { x: number; y: number };
export type MindMapClientPoint = { x: number; y: number };
export type MindMapWorldRect = {
  left: number; top: number; right: number; bottom: number;
  width: number; height: number;
};
export type MindMapSceneSize = { width: number; height: number };
export type MindMapViewportSize = { width: number; height: number };
export type MindMapSceneLayout = {
  scale: number;
  translateX: number;
  translateY: number;
  sceneWidth: number;
  sceneHeight: number;
  stageWidth: number;
  stageHeight: number;
};
export type MindMapViewportSnapshot = {
  left: number; top: number; scrollLeft: number; scrollTop: number;
  clientWidth: number; clientHeight: number;
};

export function deriveMindMapSceneLayout(
  scene: MindMapSceneSize,
  viewport: MindMapViewportSize,
  scale: number,
): MindMapSceneLayout;

export function worldToClient(
  point: MindMapWorldPoint,
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSnapshot,
): MindMapClientPoint;

export function clientToWorld(
  point: MindMapClientPoint,
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSnapshot,
): MindMapWorldPoint;

export function getAnchoredMindMapScroll(
  worldAnchor: MindMapWorldPoint,
  clientAnchor: MindMapClientPoint,
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSnapshot,
): { left: number; top: number };

export function clampMindMapScroll(
  scroll: { left: number; top: number },
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSize,
): { left: number; top: number };
```

- 上述 pure functions 不得讀 DOM 或 React state，S1 可直接 unit test。
- `mindMapDomGeometry.ts` 負責 DOM adapter：`getMindMapViewportSnapshot(viewport)`、`getMindMapSceneSize(scene)`、`getElementWorldRect(element, scene, mapper)`。不屬於 scene 的 element 必須 fail fast，不得用猜測倍率補償。
- `mindMapGeometry.ts` 的 `MindMapLayoutRect`／`MindMapRelationshipPoint` 必須改為 import／alias 上述 world types，避免維持等形但不同語意的第二套型別。

- World origin 固定為現行心智圖 content 在 100% 時的左上原點；scene 包裝不得平移既有 relationship control point 的語意。
- node rect、connector path、relationship path、label anchor、control point 與 insertion preview 一律使用 world units。
- `MindMapNoteRelationship.geometry.controlPoints` 延續為 world units；縮放不得回寫或遷移資料。
- CSS scene matrix 使用 `matrix(scale, 0, 0, scale, translateX, translateY)` 或數學等價形式。

投影公式：

```text
stageX  = worldX * scale + translateX
stageY  = worldY * scale + translateY
clientX = viewportRect.left + stageX - viewport.scrollLeft
clientY = viewportRect.top  + stageY - viewport.scrollTop

worldX = (clientX - viewportRect.left + viewport.scrollLeft - translateX) / scale
worldY = (clientY - viewportRect.top  + viewport.scrollTop  - translateY) / scale
```

正反轉換 round-trip 誤差在支援倍率內必須 `<= 0.01 world px`。

### 6.2 DOM 量測

- scene-local 元素優先以不受 transform 影響的 layout geometry 量測。
- 若使用 `getBoundingClientRect()`，必須透過唯一 mapper 的 inverse matrix 轉回 world rect；禁止在 feature code 手工 `/ zoom`。
- mapper 以 scene／viewport ref、scroll 與 matrix 為唯一輸入；不得從散落的 data attribute 猜測倍率。
- world geometry 不得包含 viewport client offset、scrollLeft／scrollTop 或 device pixel ratio。

### 6.3 Stage bounds 與 scroll

- stageSizer 至少涵蓋可見 world bounds、兩側 pan padding 與 viewport 最小尺寸。
- `translateX／translateY` 只負責把 world bounds 放入 stage 與保留 padding；使用者 pan 仍由 viewport scroll 表達。
- 變更 zoom 或 world bounds 後必須 clamp scroll，且不得產生負 stage size、NaN、Infinity 或失去可達內容。
- 純 scroll 不得觸發 connector path recompute。

## 7. Geometry Lifecycle Contract

可以標記 geometry dirty 的事件：

- 節點新增、刪除、改名造成尺寸改變或字型載入完成。
- 展開／收合、filter、日期顯示、root side、排序、parent 或可見 layout 改變。
- viewport 本身尺寸改變並造成 scene layout 改變。
- drag／drop commit 或 relationship endpoint／control point 編輯。

不得標記 geometry dirty 的事件：

- 純 zoom、scroll、middle-mouse pan、pointer anchored preview 或 toolbar zoom commit。
- 只改 hover、focus、selected ring、線條顏色或不影響 bounds 的狀態。

Scheduler 契約：

- 多個 dirty reason 在同一 animation frame 合併，最多執行一次 layout measurement 與 path build。
- dirty request 不得因 suppress flag 被永久丟棄；若有暫停區間，dirty latch 必須保留到下一次合法 flush。
- connector 與 relationship paths 必須由同一批 world rect snapshot 產生，避免兩套量測時序。

實際 dirty boundary 固定為：

```ts
export type MindMapGeometryDirtyReason =
  | 'initial'
  | 'node-set'
  | 'node-resize'
  | 'font-load'
  | 'expansion'
  | 'filter'
  | 'date-visibility'
  | 'root-side'
  | 'drop-commit'
  | 'relationship-edit'
  | 'viewport-layout';
```

- `MindMapView` 持有 `Set<MindMapGeometryDirtyReason>` latch 與一個 geometry rAF handle；`markGeometryDirty(reason)` 先加入 Set，再以 `scheduleCoalescedAnimationFrame` 排程。
- flush 一開始複製並清空當批 reasons，再對所有可見 node 建立一份 `Map<nodeId, MindMapWorldRect>` snapshot；hierarchy 與 relationship paths 都只讀該 snapshot。flush 執行期間新增的 reason 留給下一 frame，不得被本批 clear 掉。
- ResizeObserver 只呼叫 `markGeometryDirty`；observer 需涵蓋 scene 及 `MINDMAP_CONTENT_BOUNDS_SELECTOR` 的可見元素，node set 改變後重綁。`document.fonts.ready`／`loadingdone` 可用時標記 `font-load`。
- 現行 `suppressZoomScrollRecomputeRef`、zoom suppress token/timer 與「observer callback 直接 return」全部移除；不得用新的 boolean suppress 取代。
- `data-mindmap-recompute-count` 保留為 browser evidence；新增 `data-mindmap-last-geometry-reasons`（排序後逗號字串）供測試判讀。純 zoom／scroll／pan 時兩者不得改變。

## 8. Interaction 與 Accessibility Contract

- relationship path、label、endpoint、control point 與 hit target 的中心座標必須經同一 matrix 投影。
- relationship curve 的有效 screen-space hit thickness 不得小於 12px。
- endpoint／control point 的有效 screen-space pointer target 不得小於 24x24px；視覺 handle 可較小，但 focus ring 必須可見。
- 若採 inverse-scale 維持控制項尺寸，只能抵銷尺寸，不得另算位置。
- label inline editor 的定位與焦點生命週期保持 SPEC-027E；quick-title 保持 SPEC-073。
- 拖曳 badge 可維持 screen-space fixed；connector 與 insertion preview 必須是 scene world geometry。
- relationship、drag、quick-title 或 keyboard 的 exclusive owner 不得因容器重構而重複 dispatch。

實作鎖定：

- `MindMapRelationshipOverlay.tsx` 是 visual-only SVG owner；移除 selected endpoint/control point 的 SVG pointer callbacks 與 `pointerEvents: all`。不得同時保留 SVG 與 HTML 的可點 owner。
- `MindMapRelationshipInteractionLayer.tsx` 是 relationship path、label、endpoint、control point 的唯一 pointer／keyboard owner，新增 `zoomLevel` prop。
- screen target 以 `screenPx / zoomLevel` 轉成 world width／height，scene matrix 投影後達到固定 screen 尺寸：curve thickness `>= 12px`，endpoint/control wrapper `>= 24x24px`。wrapper 負責事件與 focus ring，內層 visual handle 可較小。
- `MindMapDragPreviewBadge.tsx` 保持 client/screen coordinates；`MindMapDragPreviewLayer.tsx`、drag connector 與 insertion rect 一律 world coordinates。
- 刪除 `createScreenDragConnectorPath`。window dragover 取得的 `clientX／clientY` 必須先經 mapper `clientToWorld`，再建立 scene connector；不得把 client path 放進 scene SVG。

## 9. Data／API／Permission／State Impact

- TaskNode、board、workspace、relationship schema 與持久化格式：無變更。
- `MindMapNoteRelationship.geometry`：不改欄位、不批次回寫；既有 anchor ratio 與 control points 保持相容。
- Backend API、provider、migration、URL 與 environment variable：無變更。
- `read_board`、`create_task`、`edit_task`、`move_task` 與既有 relationship permission：無變更。
- zoom、scroll、matrix、geometry dirty state 仍為前端 ephemeral state，不寫入資料庫或 localStorage。
- 若實作證明必須改寫已保存 control points 或更改 world origin，立即停止並回到 PM／ADR，不得靜默 migration。

## 10. Current Phase Scope

- 建立 viewport／stageSizer／scene 與單一 coordinate mapper contract。
- 將 hierarchy connector、note relationship、label、handles、hit targets、inline editor、drag connector 與 insertion preview 收斂到 scene world coordinates。
- 將 zoom／fit／center／pan 改為 matrix + stage bounds，移除 content CSS `zoom`；現行滑鼠平移仍由既有中鍵 viewport scroll 表達。
- 將 geometry lifecycle 改為 dirty-latch + coalesced frame，純 zoom／pan 不重算 path。
- 保留現有 toolbar、wheel、middle pan、interaction、permission 與資料行為。
- 建立 unit、static 與 rendered browser geometry evidence。

## 11. Out of Scope

- 不修改任務或 relationship 資料模型、API、權限、資料同步或 undo 語意。
- 不重設心智圖排版、節點視覺、relationship style、快捷鍵、快速命名或拖放結果。
- 不新增 minimap、自由旋轉、動畫時間軸、Canvas/WebGL renderer 或手機心智圖。
- 不把立即 dirty-latch 止血修正與本重構視為同一交付。
- 不包含 merge、PR、deploy、production smoke 或 release artifact。

## 12. RD Migration Slices

| Slice | Execution boundary | 主要輸出 | Gate | 回復邊界 |
|---|---|---|---|---|
| S0 Baseline | RD | 100% 與縮放失效 fixture、screen geometry、Git diff、現有 regression | baseline 可重現；測試資料可清理；artifact manifest 完整 | 只移除 DEV-074 新 fixture／artifact；不碰使用者 dirty files |
| S1 Coordinate kernel | RD | 新 pure module、typed world aliases、static/unit verifier、package wiring | round-trip／bounds／anchor／clamp unit 全綠；runtime 尚未接管 | 移除新 module/import/verifier；runtime 回到 S0 |
| S2 Scene scaffold @ 100% | RD | CanvasShell 三層 DOM、scene/stage measurement、scale=1 matrix | 100% screenshot、path/world geometry、scroll 與 interaction 等價 | 回復 shell/scaffold wiring；保留 S1 pure module |
| S3 Zoom authority | RD | scene matrix、rAF zoom intent、anchor／fit／center、dirty latch | 25%～400% 對齊、anchor、extent、no-recompute PASS | 回到 S2；舊 zoom adapter 只可在整個 slice 回復時恢復 |
| S4 Interaction overlays | RD | relationship single owner、inverse-size targets、drag world preview | endpoint/control/label/drag/quick-title/permission PASS | 逐 overlay 回到 S3 owner；不得雙 render／雙 dispatch |
| S5 Legacy cleanup | RD→QA | 移除 CSS zoom、preview timer、suppress、手工 `/ zoom`、舊 source assertions | DEV-074 全 gate + required regression + visible error sweep PASS | 第一個失敗即回到 S4；不刪已通過的 S1 kernel |

- 使用者已要求升級至 `RD Implementation Ready`；S0～S5 已具本地 RD 執行條件，但仍須依序 gate，不得平行接管多個 authority。
- 每個 slice 的 RD self-check PASS 才能進下一 slice；S5 後由 QA 執行計畫、QC 執行 rendered 事實驗證。QA／QC 不以同一份主觀目視取代獨立證據。
- 本授權只含 local code、test 與 evidence；不含 commit、push、PR、merge、deploy、production data 或 release。

## 13. Acceptance Criteria

- `AC-074-001`：scene 內 nodes、hierarchy SVG、relationship SVG、interaction targets 與 drag local preview 共用同一 matrix；不得存在 nodes-only 或 SVG-only zoom。
- `AC-074-002`：25%、50%、75%、100%、200%、400% 逐級放大、縮小及往返後，所有 connector／relationship 端點到對應節點邊緣的 screen-space 距離 `<= 3px`。
- `AC-074-003`：純 zoom／pan 前後，相同 world geometry 的 connector／relationship `d` 與 control points 不變；recompute count 不增加。
- `AC-074-004`：wheel anchor 在 zoom commit 前後的 screen drift `<= 2px`；工具列 zoom／reset 與 fit 維持相容的 content-center 行為。
- `AC-074-005`：stageSizer 在所有倍率提供完整可達 scroll extent；沒有內容被永久裁切、雙 scroll owner、NaN 或非預期 overflow。
- `AC-074-006`：relationship label、endpoint、control point、curve hit target 與 inline editor 對齊可見 path；screen target 尺寸符合第 8 節。
- `AC-074-007`：drag connector、insertion preview、drop metadata 與實際 drop 結果一致；screen badge 跟隨 pointer 且不污染 world geometry。
- `AC-074-008`：layout mutation 在單一 coalesced frame 更新 paths；dirty event 不因暫停或 observer 時序遺失。
- `AC-074-009`：既有 relationship persisted geometry 在縮放、重載及模式切換後不被 zoom 改寫，資料 shape 不變。
- `AC-074-010`：SPEC-027B／027E／070／073 的鍵盤、relationship、drag、selection、quick-title 與非心智圖負向邊界通過。
- `AC-074-011`：1440x900 與 1024x768 的真實 rendered surface 無重疊、裁切、斷裂、不可操作、可見 runtime error 或 scroll owner 混亂。
- `AC-074-012`：390x844 維持現行 mobile mode boundary；不得側向開放心智圖或破壞已開放主流程。

## 14. QA／QC Evidence Required

- 新增 pure transform／bounds／round-trip unit evidence。
- 新增 static verifier，確認 scene authority、禁止 CSS `zoom`、禁止 feature code 手工 `/ zoom` 與舊 suppress telemetry。
- 新增 browser verifier，以 SVG `getScreenCTM()`／DOMRect 計算 screen-space endpoint、anchor、hit target 與 scroll extent。
- 使用固定 fixture：左右 root、parent + 5 children、collapse control、長中文標題、date/filter、至少一條自訂 control points relationship 與 drag target。
- 執行 QA-DEV-074 矩陣與既有 DEV-027B／027E／027G／028／070／071／073 受影響 regression。
- TypeScript、targeted ESLint、`build:test` 只作輔助證據；真實 rendered viewport 與 visible-error sweep 為必要 gate。

固定新增 wiring：

```json
{
  "verify:dev-074-mindmap-single-scene": "tsx scripts/verify-dev-074-mindmap-single-scene.ts",
  "verify:dev-074-mindmap-single-scene-browser": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev074-single-scene -Filename scripts/verify-dev-074-mindmap-single-scene-browser.pw.js -OutputDirectory output/playwright/dev-074-single-scene -BaseUrl http://127.0.0.1:4000/?dev074Phase=after -ArtifactWindowKey __DEV074_ARTIFACT -ArtifactPath output/playwright/dev-074-single-scene/geometry-evidence.json"
}
```

新增檔案：

- `scripts/verify-dev-074-mindmap-single-scene.ts`：pure coordinate unit cases + source authority assertions + artifact schema check。
- `scripts/verify-dev-074-mindmap-single-scene-browser.pw.js`：fixture 建立、rendered geometry matrix、interaction、mobile boundary、visible-error sweep，將完整結果設為 `window.__DEV074_ARTIFACT` 並輸出 screenshots。
- `scripts/run-playwright-code.ps1`：backward-compatible 新增 optional `BaseUrl`、`ArtifactWindowKey`／`ArtifactPath`；`BaseUrl` 未提供時仍沿用現行 env/default；run-code PASS 後、session close 前以 `eval` 取得 window JSON並寫檔。artifact 兩參數未提供時維持現行行為；key 不符 `^[A-Za-z_][A-Za-z0-9_]*$`、artifact 為 null／非 object 或寫檔失敗皆 exit 1。

執行順序固定為：

```powershell
npm.cmd run verify:dev-074-mindmap-single-scene
npm.cmd run verify:dev-074-mindmap-single-scene-browser
npm.cmd run verify:dev-074-mindmap-single-scene
npm.cmd run verify:dev-027b-xmind-interaction-polish
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity
npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser
npm.cmd run verify:dev-027g-mindmap-expansion
npm.cmd run verify:dev-027g-mindmap-system-health
npm.cmd run verify:dev-027g-mindmap-bundle-health
npm.cmd run verify:dev-027g-mindmap-system-health-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd exec tsx -- scripts/verify-dev-071-mindmap-selection-details.ts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev071-selection-details -Filename scripts/verify-dev-071-mindmap-selection-details-browser.pw.js -OutputDirectory output/playwright/dev-071-selection-details
npm.cmd run verify:dev-070-interaction-kernel
npm.cmd run verify:dev-073-task-title-edit-defaults
npm.cmd run verify:dev-073-task-title-edit-defaults-browser
npm.cmd exec tsc -- --noEmit
npm.cmd exec eslint -- src/components/MindMap scripts/verify-dev-074-mindmap-single-scene.ts
npm.cmd run build:test
```

- `verify:dev-070-interaction-kernel-browser` 會產生獨立 phase artifact 且成本較高；若 DEV-074 browser + DEV-028/071/073 browser 已證明 mindmap binding 無差異，可在 local RD gate 省略，但 QA 最終 gate 仍須執行或記錄由同一 commit 的既有有效證據覆蓋。不得只跑 DEV-070 static。
- browser gate 如啟動 local runtime，須遵守工作區 `AGENTS.md`：先記錄 project／purpose／port／process tree／cleanup condition，結束後只停止本任務擁有的 process tree 並確認 port 釋放。

## 15. Stop Conditions 與 Failure Recovery

任一條成立即停止當前 slice，不得靠擴大範圍掩蓋：

- 任一 endpoint／control／hit target screen drift 超過 acceptance。
- 純 zoom／pan 改寫 world path、relationship persisted geometry 或觸發 layout recompute storm。
- 需要改資料 schema、world origin 或已保存 control points 才能繼續。
- viewport 無法到達全部內容、出現第二 scroll owner或 anchor 明顯跳動。
- relationship／drag／quick-title 重複 dispatch、focus 遺失或權限邊界改變。
- 非心智圖模式、mobile boundary 或既有主要 regression 出現第一個差異。
- 真實畫面出現可見 runtime error、重疊、裁切或不可操作物件。

回復策略以 slice 為單位切回上一個通過的 authority；禁止同一 overlay 同時由 legacy 與 scene path 雙重渲染或雙重處理事件。

## 16. 依賴、未阻塞工程決策與 Release Boundary

- 依賴：DEV-027B／027E／027G geometry baseline、DEV-070 interaction ownership、DEV-073 quick-title baseline、瀏覽器 DOMMatrix／ResizeObserver 能力。
- 不新增第三方 renderer 或外部服務。
- exact module/file split、typed API、fixture、artifact schema、commands 與 owner 已在本版固定；RD 可直接開始 S0，不需再做架構規劃。
- ADR-044 已鎖定 end-state；沒有剩餘 P0/P1 產品決策。
- 本變更不影響 build runtime、環境變數、migration、hosting 或 backend；不需要 Release Feasibility Note。
- 完成 RD／QA／QC 後若使用者提出 release，再進入 release gate；本規格不預寫 release artifact。

## 17. 逐檔 Patch Intent（Authoritative）

| 檔案 | Slice | 必要變更 | 禁止事項／保護邊界 |
|---|---|---|---|
| `src/components/MindMap/mindMapCoordinateSystem.ts`（新增） | S1 | 實作第 6 節 pure types、layout、正反投影、anchor scroll、clamp | 不讀 DOM／React；不保存 state；不引用 feature modules |
| `src/components/MindMap/mindMapGeometry.ts` | S1 | 將 layout rect／relationship point 收斂為 world type alias/import；path builders 保持 world 純函式 | 不改 relationship storage shape、anchor ratio 或 control point 語意 |
| `src/components/MindMap/mindMapDomGeometry.ts` | S1/S4 | 以 scene+mapper 提供 scene size、viewport snapshot、element world rect、client-to-world adapter；保留 screen DOM hit test/anchor ratio | 移除 feature-facing zoom 參數與 `/ zoom`；HUD 不得傳入 elementToWorldRect |
| `src/components/MindMap/mindMapFrameScheduler.ts` | S1/S3 | 保留 generic coalesced rAF；新增 typed dirty latch helper或由 View 以相同契約組裝 | 不得新增會 drop reason 的 suppress flag |
| `src/components/MindMap/mindMapLayoutStyle.ts` | S2/S3 | 將 layout token 與 scene transform style 分離；刪除 CSS `zoom` | 不改 node density/layout tokens |
| `src/components/MindMap/MindMapCanvasShell.tsx` | S2 | props 改為 `viewportRef/stageRef/sceneRef/stageStyle/sceneStyle`；建立三層 DOM/data markers | 不新增第二 scroll owner；空狀態仍在 viewport contract 內 |
| `src/components/MindMap/MindMapView.tsx` | S2-S4 | 建立 refs/size/layout/mapper；替換 preview+commit timer；以 rAF zoom intent + layout effect 套 anchor scroll；dirty latch 單批 paths；傳遞 mapper/scale | 保留目前 quick-title、Delete、expansion、selection、permission 與 dirty working-tree edits；不得整檔重寫 |
| `src/components/MindMap/mindMapZoom.ts` | S3 | 保留 min/max/step/format/delta；定義 zoom intent/telemetry；anchor 交由 coordinate kernel | 刪除 150ms preview、preview scale、preview telemetry、舊 scroll delta；不得再直接改 scene style |
| `src/components/MindMap/mindMapViewport.ts` | S3 | bounds 改讀 world rect snapshot；fit 直接用 `min(viewport/bounds)*0.86`；center 經 scene layout 投影+clamp | 不乘 current zoom；不讀 transformed bounds |
| `src/components/MindMap/mindMapOverlayPaths.ts` | S3 | `surface/getLocalRect` 改為 `scene/worldRectSnapshot`；hierarchy + relationship 共用同批 snapshot | 不自行讀 scale/client rect |
| `src/components/MindMap/mindMapDrag.ts` | S4 | preview/insertion 接 mapper/world rect；刪 screen path builder | badge client座標可保留；scene preview 禁止 client座標 |
| `src/components/MindMap/MindMapRelationshipOverlay.tsx` | S4 | SVG 限 visual path/label/draft；selected handle 改為 pointer-events none 或移至 interaction layer | 不保留第二套 pointer owner |
| `src/components/MindMap/MindMapRelationshipInteractionLayer.tsx` | S4 | 新增 scale；以 inverse-size world wrappers 維持 curve/handle screen target；唯一處理 pointer/focus | 不另算位置 transform；不得改 permission/label lifecycle |
| `src/components/MindMap/MindMapDragPreviewLayer.tsx` | S4 | 明確標示/渲染 world connector 與 insertion rect | `MindMapDragPreviewBadge.tsx` 不搬入 scene |
| `package.json` | S0/S1 | 在目前 dirty 版本增量加入兩個 DEV-074 scripts | 不排序/重寫整個 scripts 區塊；保留 `verify:dev-027g-mindmap-expansion` 等既有新增 |
| `scripts/verify-dev-074-mindmap-single-scene.ts`（新增） | S0/S1 | `--capture-baseline` 以 Node child_process/fs 保存 HEAD/status/diff且 existing baseline fail-closed；另含 pure unit、static authority、artifact schema、PASS/FAIL summary | 不以 source string 取代 rendered geometry；非明示不得覆寫 baseline |
| `scripts/verify-dev-074-mindmap-single-scene-browser.pw.js`（新增） | S0-S5 | 真實 fixture、倍率矩陣、幾何/互動/visible-error、JSON/screenshots | 不連 production；不更新 expected 掩蓋 drift |
| `scripts/run-playwright-code.ps1` | S0 | 加入 optional BaseUrl 與 window artifact capture/write 參數；保持未傳參、env fallback 與 DEV-070 舊 capture 相容 | 不硬編 DEV-074 schema；不在 run-code失敗時合成 PASS artifact |
| 既有 027B/027E/027F/027G/070/071/073 verifier | S5 | 只更新被新 architecture 有意取代的 source marker/telemetry assertions | 產品 expected、quick-title、interaction owner、expansion expected 不得放寬 |

預期不需修改 `MindMapNode.tsx`、`mindMapExpansion.ts`、`mindMapKeyboard.ts`、`mindMapTree.ts`、`MindMapRelationshipStyleDrawer.tsx` 與 storage／commands。若座標接管迫使這些檔案發生非 prop/type 的行為變更，停止並檢查是否越界。

## 18. Zoom／Geometry 執行時序

### 18.1 Wheel zoom

1. `Ctrl/Meta + wheel` 阻止預設頁面縮放，以當前 mapper 把 pointer client point 轉成 world anchor。
2. 同一 animation frame 內只更新 `pendingZoomIntentRef` 的 target scale 與最後有效 client anchor；一個 rAF 最多提交一次 `setZoomLevel`。
3. render 以新 scale 衍生 stage/scene layout；`useLayoutEffect` 在 paint 前依 world+client anchor 計算並 clamp viewport scroll。
4. 更新 zoom label/data telemetry；不得 schedule connector recompute、不得建立 150ms preview timer。

### 18.2 Toolbar／fit

- `+／-／100%` 記錄目前可見 content bounds center 為 world anchor，使用 viewport center 作 client anchor，再走同一 zoom intent。
- fit 直接以未縮放 world bounds 計算 `clamp(min(viewportWidth/bounds.width, viewportHeight/bounds.height) * 0.86)`，再以 bounds center 置中。
- middle pan 與 scroll 只改 viewport scroll；不改 scene transform state，不 dirty geometry。

### 18.3 Layout mutation

1. React state／ResizeObserver／font event 呼叫 `markGeometryDirty(reason)`。
2. 下一個 coalesced frame 建立唯一 world rect snapshot。
3. `buildMindMapOverlayPaths` 同步產生 hierarchy 與 relationship paths，單次 state commit。
4. 寫入 recompute count 與 reasons telemetry；若 flush 中又變更 layout，再排下一 frame。

## 19. Browser Fixture 與 Artifact Schema

- Fixture ID 固定為 `dev-074-v1`；沿用本地 QA board reset pattern，建立 center、左右 root、parent+5 children、長中文標題、date/filter、預設 relationship、自訂 anchor/control relationship 與 drag target。
- 倍率序列固定 `1 → 0.25 → 0.5 → 0.75 → 1 → 2 → 4 → 1`；以現有 toolbar／wheel UI 操作，不直接寫 React state。
- Browser script 讀取 URL query `dev074Phase=baseline|after`，預設 `after`。baseline phase 只要求 100% 基線成立且 25% 現行 drift 可重現，輸出 `baseline/geometry-before.json`；after phase 才套用全部 acceptance thresholds。
- endpoint screen point 由 path world endpoint 經該 SVG `getScreenCTM()` 投影；與對應 node DOMRect 邊界計算最短距離。hierarchy 與 relationship 都要量測，記錄每倍率 max。
- artifact：`output/playwright/dev-074-single-scene/geometry-evidence.json`，至少包含：

```ts
type Dev074GeometryEvidence = {
  fixtureId: 'dev-074-v1';
  baselineRef: 'baseline/git-head.txt';
  viewports: Array<{
    name: 'desktop' | 'laptop' | 'mobile';
    width: number;
    height: number;
    zoomCases: Array<{
      scale: number;
      maxHierarchyEndpointDriftPx: number;
      maxRelationshipEndpointDriftPx: number;
      anchorDriftPx: number | null;
      recomputeDelta: number;
      scrollReachable: boolean;
      minCurveHitThicknessPx: number | null;
      minHandleWidthPx: number | null;
      minHandleHeightPx: number | null;
      screenshot: string;
    }>;
    consoleErrors: string[];
    pageErrors: string[];
    visibleErrors: string[];
  }>;
  persistedGeometryEqual: boolean;
  regressionCommands: Array<{ command: string; exitCode: number }>;
};
```

- static verifier 在 browser run 前允許 artifact 不存在；browser run 後第二次 static verifier 必須驗 schema、viewports、倍率、threshold 與 error arrays。
- S0 的 `--capture-baseline` 以 Node child_process/fs 保存 provenance；browser artifact 以 `baselineRef` 指向 `baseline/git-head.txt`，避免由瀏覽器偽造 Git state或使用 shell redirect。

## 20. Failure Recovery Wiring

- 每個 slice 開始前保存該 slice touched-file diff；失敗只逆轉當 slice 的 DEV-074 增量，不得還原使用者在同檔的既有修改。
- S2/S3/S4 是 authority switch，不允許以 runtime feature flag 長期並存；短暫 local debug flag 不得提交，S5 static verifier 必須確認不存在。
- 第一個有效失敗需保存：slice、command、viewport、scale、fixture、dirty reasons、recompute delta、最大 drift、console/page/visible error 與 screenshot。
- 若純 kernel 錯誤：修正 S1 pure module並重跑 S1；若 100% 不等價：回 S2 shell；若縮放/anchor/extent 失敗：回 S3；若 relationship/drag owner 失敗：回 S4。不可跨 slice 同時修補。
- 若需要 schema migration、改 world origin、重寫 persisted control points、改 permission 或改 quick-title/expansion產品 expected，DEV-074 立即 `Blocked / Human Decision Required`，回 PM 更新 SPEC/ADR。
- rollback 在本文件只指 local implementation slice recovery；不代表 release rollback，因本 DEV 尚未進入 release。

## 21. RD Start／Done Gate

RD 可開始條件（本版已滿足）：

- end-state、typed API、逐檔 patch、fixture、commands、owner、failure recovery、data/permission/release boundary 已固定。
- 沒有 P0/P1 未決產品或架構問題；dirty worktree 的保護邊界已明示。

RD 完成條件：

- S0～S5 逐一 PASS，所有 AC-074-001～012 有 artifact／command／rendered evidence。
- 新增與既有 regression 全綠；TypeScript、targeted ESLint、`build:test` 全綠。
- QA-DEV-074 更新為 `QA Executed`，QC 完成 1440x900、1024x768、390x844 事實驗證；缺任一項不得標記 DEV-074 完成。
- 產品完成後才把 SPEC-027B superseded technical rule 從「待實作」改成 runtime fact；本版仍是 `Prepared / Not Implemented`。
- release remains not requested；不自動建立 commit、push、PR、deploy 或 production smoke。
