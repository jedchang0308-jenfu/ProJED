# RD 技術主管審查：DEV-102 心智圖圈選、多選與剪貼操作

- 日期：2026-09-03
- 審查對象：`SPEC-102`、`QA-DEV-102`、`ai-doc/dev_task.md`、`ai-doc/documentation_map.md`
- 盤點基線：branch `持續優化3`、HEAD `13888b27221b`、dirty working tree
- 結論：`有條件通過；文件修正後條件已解除，可維持 RD Implementation Ready`
- 執行邊界：文件審查與優化；產品程式、verifier、runtime、QA/QC與release均`NOT RUN`

## 1. 真正問題與核心原因

真正需求不是「加一個圈選框」，而是讓同一個心智圖interaction owner安全地承接：

1. visual placement多選；
2. canonical task批次mutation；
3. 同看板forest copy／move；
4. 能說明為何某些action在多選時被鎖定。

最短可驗證因果鏈：

`single selectedNodeId + single-node global context state + immediate duplicate + void batch persistence`
→ 無法表示multi-selection、exact paste anchor與可信的批次結果
→ 若只在UI加if／迴圈，會產生identity混用、action外洩、複製規則分叉與partial mutation
→ 必須以placement-typed private selection、local mindmap menu、shared clone plan與awaitable typed batch outcome修正。

使用思考習慣：#問對問題、#系統描繪、#複雜因果關係

## 2. 五項關鍵發現與最小修正

### F1 — Placement 與 canonical identity 混用（原阻擋，已修正）

事實：

- 現行MindMap tracking projection以visual placement ID render，mutation則必須回到`canonicalTaskId`。
- 原SPEC寫`primaryNodeId／anchorNodeId`，同時又宣告集合是placement IDs，名稱與型別語意衝突。

風險：projection被圈選或右鍵時，實作者可能把placement ID直接傳給WBS mutation，造成找不到task或錯改來源task。

最小修正：

- 改為`primaryPlacementId／anchorPlacementId`。
- 新增`MindMapSelectionTarget { placementId, taskId, placementKind, parentPlacementId }` resolver contract。
- resolver缺任一identity context時fail closed，不靠字串相同猜測。
- 現行placement context沒有canonical來源看板assign capability，因此v1多選只要含tracking projection，copy／cut／paste／assignment／archive全部locked；不以目前看板permission推論來源task權限。

驗證：QA L01、F01、AUTH05，以及artifact同時保存selected placement與resolved canonical IDs。

使用思考習慣：#變數控制、#可驗證性

### F2 — Clipboard actions 會洩漏所有模式，且menu row可能再分叉（原阻擋，已修正）

事實：

- 現行`getTaskMenuActionIds`會預設收錄catalog中所有有section的action。
- `TaskActionMenu`已維護label／icon row；若MindMapContextMenu另寫一份，會形成第二套presentation metadata。
- `GlobalContextMenu`目前先filter disabled actions，不能直接承接「可見但上鎖」。

風險：直接新增`task.copy／cut／paste-after`會出現在Board／List／Gantt／Calendar；另寫menu rows則日後文案、icon與guard漂移。

最小修正：

- 新actions採`defaultMenu:false`或等價explicit opt-in，只由mindmap profile include。
- MindMap使用local menu shell，不把multi state塞進`BoardContextMenuState`。
- 擴充共用`TaskActionMenu` row contract支援locked reason與`aria-disabled`；global menu既有filter行為不變。

驗證：QA L04～L07、C15及全部cross-mode menu regressions。

使用思考習慣：#限制條件、#最小必要複雜度

### F3 — Copy projection 會形成第二套規則，且現行duplicate含fractional order（原阻擋，已修正）

事實：

- 現行`duplicateNodeTree`以spread、note ID remap與internal dependency remap建立副本。
- 其root order使用相鄰order平均值，可能產生fractional value，與已知DEV-101 bigint邊界衝突。

風險：MindMap若重寫clipboard snapshot／paste mapping，兩個複製入口會逐步漂移；若直接重用現行order算法，paste可能在provider失敗。

最小修正：

- 從現行duplicate抽出唯一pure`buildTaskTreeClonePlan`，既有immediate duplicate與mindmap paste共用。
- plan以injected ID／time建立資料，root integer order由caller提供；pure clone plan不得平均order。
- QA新增DEV-013 regression與shared-plan parity。

驗證：QA CP02～CP06、PASTE14、`verify:dev-013-task-duplicate`。

使用思考習慣：#根本原因、#技術債

### F4 — 原文件把void optimistic batch寫成all-or-none（原阻擋，已修正）

事實：

- 現行`batchUpdateNodes`回傳`void`；parallel更新透過`updateNode`立即改local state，ordered persistence也是background async。
- grouped undo存在，但不等於provider batch commit成功。

風險：UI對N筆update的成功認知可能早於provider；第N筆失敗時會留下partial remote state、錯誤undo與假成功toast。

最小修正：

- 先建立shared awaitable`commitNodeBatch`或等價primitive，回`committed／rejected／compensated／indeterminate`。
- 只有committed後push grouped undo；indeterminate鎖住相同targets並做canonical readback／reload recovery。
- 規格把all-or-none改稱「已確認結果下的application convergence」，不冒充DB ACID。

驗證：QA L09、X01～X09、artifact outcome／target lock／compensation trace。

使用思考習慣：#證據品質、#反事實檢查

### F5 — Cut stale條件與元件切分過早固定（維護性風險，已修正）

事實：

- 原`sourceRevision`未定義title、assignment等內容變更是否讓cut失效。
- 原patch intent強制新增獨立overlay component，但overlay只是單一transient rectangle，尚無獨立責任證據。

風險：任何內容編輯都可能不必要地取消cut；反之結構改變未被偵測會導致錯誤forest。過早抽component增加檔案與state owner，沒有降低目前風險。

最小修正：

- 改為`sourceStructureFingerprint`，只包含ownership／placement kind與subtree的id、parent、order、archive、membership；內容變更允許paste最新live data。
- clipboard生命週期縮到MindMapView session；mode exit／board switch／reload清除。
- overlay預設留在MindMapView的ref／leaf state；只有出現獨立測試或重用責任才抽component。

驗證：QA CT01～CT07、B09-MODE與gesture／performance cases。

使用思考習慣：#最小架構、#邊界條件

## 3. 已知技術債

provider沒有同看板forest／multi-node ACID transaction。即使加入awaitable batch與補償，網路分割仍可能讓remote結果一度無法確認。

- 影響：operation可能進入`indeterminate`，不能保證瞬間remote atomicity。
- 隔離：只由DEV-102 shared batch／forest command管理，使用operation ID、target lock、before plan、compensation log與canonical readback。
- 移除觸發：provider提供atomic batch API，或production evidence顯示indeterminate頻率／恢復時間超過owner門檻。
- release gate：X01～X09與reload recovery未完成，不得release。

這是已揭露、可驗證且有移除條件的債務；不阻止local implementation，但阻止無failure evidence的release。

## 4. 審查結論

原文件方向正確，但在identity、catalog opt-in、clone authority與persistence outcome四處仍可能讓RD做出表面可用、資料邊界不可信的實作，因此初判為有條件通過。

上述必要修正已同步寫回SPEC-102、QA-DEV-102、dev_task與documentation map；目前沒有剩餘文件級阻擋項目。DEV-102可依WP-102-A→E進入RD，但第一個identity混用、action leakage、clone分叉、fractional order或indeterminate未鎖target即退回本Gate。

ADR仍不需要：awaitable batch是store內加法API，既有call sites不改；provider transaction取捨、債務與移除條件已由SPEC-102 §9.4完整治理。若後續改為新增RPC／DB transaction或跨模式共用clipboard，再重開ADR判定。

本結論不代表implementation、QA、QC或release通過。
