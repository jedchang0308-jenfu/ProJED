# ADR-044：以 StageSizer 與單一 Scene Matrix 統一心智圖座標

- 狀態：Accepted / DEV-074 RD Implementation Contract Locked / Implemented / QA Evidence Ready
- 日期：2026-08-19
- 關聯：DEV-074、SPEC-074、SPEC-027B、SPEC-027E
- 決策來源：`USER-20260819-MINDMAP-SINGLE-SCENE-TRANSFORM`

## Context

心智圖同時使用 HTML 節點、SVG hierarchy connector、note relationship、HTML hit targets、inline editor 與 drag preview。現況 content 以 CSS `zoom` 縮放，DOM layout 會重排；paths 則由 DOM geometry 量測後存在 state。當 zoom commit 暫停 recompute、ResizeObserver 事件又在暫停期間被忽略時，節點與線條會持有不同時點的幾何。

短期可在暫停後用 dirty-latch 補算，但每增加一層 overlay、控制點、動畫或拖曳，都會增加時序與座標轉換組合。長期需要一個不以重算修補視覺投影的座標 authority。

## Decision

1. 心智圖採 `viewport → stageSizer → scene` 三層結構。
2. viewport 是唯一 scroll／clip／wheel／pan owner；stageSizer 只管理縮放後 scroll extent。
3. scene 以單一 `matrix(scale, 0, 0, scale, translateX, translateY)` 投影所有 map geometry。
4. HTML nodes、hierarchy／relationship SVG、labels、handles、hit targets、inline editor 與 map-local drag preview 全部使用同一 world coordinate。
5. toolbar、固定 drawer 與 pointer badge 可留在 screen HUD，但不得成為 world geometry authority；需要場景位置時必須使用同一 mapper。
6. zoom／pan 不改寫 world paths；只有 world layout mutation 可透過 dirty-latch、coalesced frame 重算 geometry。
7. world-to-client、client-to-world 與 element-to-world rect 由單一 typed coordinate mapper 提供，feature code 禁止手工 `/ zoom`。
8. 現有 relationship anchor ratio 與 control points 保持資料相容；world origin 維持現行 100% content origin，不做 schema migration。
9. 工具列、wheel、fit、middle pan 與 interaction 行為採 behavior-compatible migration，不藉架構重構改產品手感。
10. 遷移採 S0～S5 可回復 slices；新舊 authority 不得同時渲染或雙重 dispatch。

## Implementation Lock

- Pure coordinate kernel 固定新增於 `src/components/MindMap/mindMapCoordinateSystem.ts`；DOM adapter 留在 `mindMapDomGeometry.ts`，feature code 不自行投影。
- scene intrinsic size 以未 transform 的 layout size 為準；stage size 為 `max(viewport * 2, scene * scale)`，以 stage translation 置中並保留四邊可達的 world scroll extent。
- zoom state 是唯一有效 scale；wheel 以 rAF coalesce 後直接提交 scene matrix，不保留 150ms preview/commit 雙狀態。
- wheel 由 world anchor + client anchor 回算 scroll；toolbar/reset/fit 以 visible world bounds center + viewport center 走同一 anchor contract。
- hierarchy 與 relationship paths 由同一批 world rect snapshot 產生；dirty latch 只接受 world layout mutation，純 zoom／scroll／pan 不重算 path。
- relationship HTML interaction layer 是唯一事件 owner；SVG overlay visual-only。有效 screen target 採 inverse-size wrapper，不建立第二個位置 transform。
- drag badge 留在 screen HUD；drag connector/insertion preview 留在 scene world space；刪除 screen path 放入 scene 的相容路徑。
- persisted relationship geometry、world origin、資料 schema、API、permission 與其他模式行為零變更；需要任何一項改動即回 ADR，不得由 RD 自行擴張。
- 完整逐檔 patch intent、typed API、fixture、commands、artifact schema 與 recovery authority 以 SPEC-074 RD Implementation Ready 版為準。

## Considered Options

### A. CSS zoom + 每次補算 paths

優點是改動小，可作立即止血。缺點是 geometry 正確性繼續依賴 render、ResizeObserver、timer 與 suppress 順序；zoom 本身仍會改 layout，overlay 越多維護成本越高。因此不作 end-state。

### B. 只 transform HTML nodes，SVG 留在 screen space

可避免部分 reflow，但每個 SVG、label、hit target 與 drag preview 都必須獨立投影，仍存在多座標 authority；拒絕。

### C. StageSizer + 單一 Scene matrix

同時解決 scroll extent 與共同投影；world path 不因 zoom 改變，且 DOM/SVG 可保留 React 與 accessibility 能力。選用。

### D. 全面改為 Canvas／WebGL renderer

可統一繪圖，但會擴大文字編輯、DOM focus、accessibility、hit testing、現有元件重用與測試成本；目前問題不需要更換 renderer，拒絕。

## Consequences

- 優點：zoom／pan 成為純投影，節點與所有 map-local overlays 天然同步。
- 優點：geometry recompute 只處理 world layout mutation，時序與效能更可預測。
- 優點：可用單一 mapper測試 round-trip、anchor、endpoint、hit target 與 drag preview。
- 成本：必須明確管理 stage bounds、padding、scroll clamp 與 fit-to-content。
- 成本：現有 map-local／screen coordinate 混用要分片收斂，且需要完整 relationship／drag regression。
- 約束：不得用另一層 nodes-only transform、SVG-only compensation 或 scattered zoom division 修補。
- 約束：如果無法保留 world origin或既有 persisted control points，必須停止並重新決策 migration，不得靜默換座標語意。
- 相容性：TaskNode、relationship schema、API、permission、backend 與其他模式不變。

## Superseded Technical Rule

SPEC-027B 的可觀察對齊要求維持；其中「zoom 後重算 connector geometry」已由 DEV-074 的「zoom 不改 world path、scene 統一投影」取代。本 ADR 的 implementation lock 與 QA evidence 已落地；後續變更須依 Revisit Conditions 重新開 ADR。

## Revisit Conditions

只有下列任一條成立才重開本 ADR：

- 無法在不改 persisted control points／anchor ratio 的情況維持 100% world origin。
- stageSizer 無法同時提供 25%～400% 完整 scroll reachability 與 pointer anchor。
- browser platform 限制使單一 DOM/SVG scene matrix 無法維持可存取的 hit target／focus owner。
- 產品要求 mobile mindmap、旋轉、Canvas/WebGL renderer 或不同的 zoom interaction semantics。

一般實作命名、測試修正或局部效能調校不構成重開 ADR 的理由。
