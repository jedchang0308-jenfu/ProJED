# RD 技術主管第二輪審查：DEV-102 心智圖圈選、多選與剪貼操作

- 日期：2026-09-03
- 審查對象：`SPEC-102`、`QA-DEV-102`、`ai-doc/dev_task.md`、`ai-doc/documentation_map.md`
- 審查基線：現行`MindMapView`／`mindMapSideStorage`、task interaction menu、`useWbsStore`與`useUndoStore`
- 結論：`有條件通過；第二輪文件修正後條件已解除，可維持 RD Implementation Ready`
- 執行邊界：文件審查與優化；產品程式、verifier、runtime、QA/QC與release均`NOT RUN`

## 1. 結論與核心原因

R1已修正identity、action isolation、clone authority與awaitable batch方向；R2真正要解的是「計畫看似完整，但尚未涵蓋現行產品的所有state與副作用」。最短因果鏈如下：

`TaskNode patches不是完整心智圖狀態 + integer reindex會改到未選取siblings + pending lock只在memory + updateNode自帶副作用`
→ paste、補償、reload與undo可能各自得到不同結果
→ 即使畫面一度正確，仍可能reload跳側、越權改order、重複activity或在未知結果下重入
→ command plan必須涵蓋node／side／完整affected set，並補上same-tab recovery及commit-after-effects邊界。

使用思考習慣：#根本原因、#系統描繪、#複雜因果關係

## 2. 五項關鍵發現與最小修正

### F1 — Paste plan漏掉sideOverrides與連帶reindex targets（原阻擋，已修正）

事實：

- 根節點左右側不是`TaskNode`欄位，而是`mindMapSideStorage.ts`以board-scoped localStorage保存的`sideOverrides`。
- integer-safe插入若normalize source／destination sibling scopes，會改寫未選取siblings的`order`。

風險：只保存selected roots的parent／order會造成reload跳側、undo後side錯誤、orphan override，或在未檢查權限時改寫未選取sibling。

最小修正：

- `MindMapForestPastePlan`新增`nodePatches`、`reindexedTaskIds`、`sideOverrideBefore／After`與完整`affectedTaskIds`。
- root→child移除stale override，child→root及top-level paste寫入resolved side；commit、compensation、undo／redo都回放同一snapshot。
- permission、pending lock、readback與evidence涵蓋每個實際被寫入的existing sibling；side storage必須write-readback，失敗不得宣稱成功。

驗證：QA L15-L16、PASTE15-PASTE19、AUTH08、X10。

使用思考習慣：#資料流、#邊界條件、#可驗證性

### F2 — Indeterminate lock無法安全跨hard reload（原阻擋，已修正）

事實：R1只要求memory pending registry與canonical readback，卻把reload列為可解除路徑；hard reload會直接丟失memory lock。

風險：provider結果仍未知時，使用者reload後可對相同targets再做paste／assign／archive，放大partial state。

最小修正：

- 第一筆mutation前寫入並readback固定board-scoped`sessionStorage` recovery descriptor，保存operation ID、完整targets、before／after fingerprints與phase；corrupt journal以key所屬board fail closed，完整canonical hydration與invariants通過後才可清除。
- mount／board hydration先恢復target lock與readback，terminal convergence後才清除descriptor。
- descriptor不可用或寫入失敗時零provider writes；不自動重播，不宣稱跨tab／tab-close exactly-once。

驗證：QA L17、R01-R08、B09-RECOVERY、X11-X14。

使用思考習慣：#反事實檢查、#風險優先

### F3 — Public updateNode會讓批次副作用早於commit（原阻擋，已修正）

事實：

- 現行`updateNode`會立即改local state、寫activity、處理calendar／dependency schedule並push undo。
- `useUndoStore`只在command Promise resolve後移動stack；reject時才保留原位置。

風險：若`commitNodeBatch`只是loop`updateNode`，provider第N筆失敗前已產生成功activity、calendar deletion與錯誤undo；補償又可能生成第二輪副作用。

最小修正：

- shared batch分離pure plan、provider commit／compensation、canonical local apply、confirmed success effects與single undo五階段。
- `rejected／compensated／indeterminate`不產生success effects；archive calendar cleanup只在confirmed commit後執行。
- undo／redo callback只有inverse／forward`committed`才resolve；其他outcome reject，保留stack位置。

驗證：QA L18、U01-U08、X15及artifact activity／calendar／undo deltas。

使用思考習慣：#證據品質、#控制實驗

### F4 — 文件誤把roving focus寫成既有能力（過度設計風險，已修正）

事實：現行`GlobalContextMenu`／`TaskActionMenu`是button list，沒有Arrow／Home／End roving；interaction kernel的`keyboard.shift-f10`仍disabled。

風險：RD為滿足錯誤baseline被迫擴大鍵盤系統，或套用`role="menu"`卻未實作完整ARIA menu pattern。

最小修正：

- DEV-102沿用有名稱的context popup與native button Tab／Shift+Tab、Escape／outside click。
- locked row可focus並讀出原因，但Enter／Space fail closed。
- Arrow／Home／End menu navigation與Shift+F10明列out of scope；未完整實作ARIA menu pattern不得套`role="menu"`。

驗證：QA L19、C10-C14、K03-K04、AX01。

使用思考習慣：#最小必要複雜度、#限制條件

### F5 — Multi-selection與既有drag／transform lifecycle未閉合（維護性風險，已修正）

事實：需求排除group drag，但原規格只說「單node drag無回歸」；marquee center snapshot也未定義zoom／wheel／scene transform中途變更。

風險：拖曳selected node可能被誤解為搬移整組；transform後用舊snapshot commit會選錯task，menu與marquee owner也可能同時存在。

最小修正：

- node drag成立時先把selection收斂到dragged placement，再沿用既有single-node drag；right-click不啟動drag。
- marquee active遇到wheel／zoom／scene transform／resize時先cancel並回復drag前selection，再套用transform。
- marquee、drag、menu與selection invalidation新增明確互斥／關閉規則。

驗證：QA G10-G12、AC-102-002、AC-102-016。

使用思考習慣：#系統整合、#邊界條件

## 3. 已知技術債

provider仍沒有同看板forest／multi-node ACID transaction；application saga只能在已確認結果下提供convergence。

- same-tab hard reload：由session descriptor延續target lock與readback。
- 跨tab／tab close／fresh browser session：不保證exactly-once、不自動重播，以provider canonical hydration為authority。
- local side storage：屬presentation transaction，不能升級為跨device資料一致性保證。
- 移除觸發：provider提供核准的atomic batch，或indeterminate／recovery evidence超出owner門檻。
- release gate：QA X01-X15、R01-R08、U01-U08、side reload／undo與complete affected permission evidence未完成，不得release。

## 4. 審查結論

第二輪五項問題都會影響資料可信度或實作範圍，初判為有條件通過。必要修正已同步寫回SPEC-102、QA-DEV-102、dev_task與documentation map，目前沒有剩餘文件級阻擋項目。

DEV-102仍可依WP-102-A→E進入RD；若實作無法同時提交node／side plan、無法列出所有reindexed siblings、reload後無法維持unknown-operation lock，或只能逐筆呼叫public`updateNode`產生副作用，立即退回本Gate。

ADR仍不需要：本輪新增的是client command journal、local presentation snapshot與store內部side-effect boundary，不改schema／provider API。若改為DB RPC／transaction、跨tab durable journal、跨device side persistence或新ARIA menu system，重新開ADR判定。

本結論不代表implementation、QA、QC或release通過。
