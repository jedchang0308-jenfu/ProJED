# SPEC-098：任務明細子任務管理區

- 關聯 DEV：DEV-098
- 文件成熟度：`RD Implementation Ready / Human Confirmed / Tech Lead Reviewed → RD Implemented`
- 實作狀態：`Implemented / DEV-098 Core Local Automated QA PASS / Independent QC PASS / Adjacent Regression Audit PASS / Persistence Release Blocked by DEV-099 / Not Released`
- 風險等級：Medium
- Spec Impact：`Compatible extension / persistence guard intentionally replaced by SPEC-099`
- 日期：2026-09-01

## 1. 目標與成功定義

在既有 `TaskDetailsModal` 主內容底部加入預設展開、可收合的「子任務」區，使使用者不離開
目前父任務脈絡，就能看見與操作該 placement 的直屬子任務及更深層子樹。

成功不只等於「把看板的 JSX 顯示在 modal」。成功結果必須同時成立：

- 看板 L3+ 與任務明細使用同一個 checklist row、recursive placement tree、interaction binding
  與 authoritative placement commit，不存在第二套 task content／menu／gesture／transaction。
- 任務明細有自己的局部 drag host；拖曳只命中 modal 內的可見子樹與目前任務根 drop target，
  不命中遮罩後方的看板、工作台或其他檢視。
- 點開子任務仍使用同一個 `TaskDetailsModal`，不疊第二個 modal；目前任務草稿 durable save
  成功後才允許切換。
- pointer、keyboard、context menu、touch scroll、long-press drag、權限、tracking placement、
  pending、failure 與 focus restore 的可見結果可由 QA／QC 重現。

## 2. 規格權威與相容性 preflight

| 既有權威 | DEV-098 的處理 |
|---|---|
| `SPEC-028` | 保留唯一 `TaskDetailsModal`、detail-only title edit、open／close selection lifecycle。本次以新 DEV 合法重新進入舊版 out-of-scope 的明細內部資訊架構。 |
| `SPEC-046`、`SPEC-053`、`SPEC-054`、`SPEC-055` | 保留整列拖曳、click/drag 互斥、desktop marker、手機 short-pan 優先與 long-press 行為。 |
| `SPEC-070` | 子任務列仍走同一 task interaction kernel；新增 surface ID，不直接呼叫 legacy details helper。 |
| `SPEC-089` | primary placement durable move 仍由 authoritative placement transaction 收斂；不得 optimistic 假成功或另寫 local reorder。 |
| `SPEC-095` | 保留 `taskId + placementId + placementKind`、primary／tracking shared surface、explicit tracking subtree、permission-preserving action parity。 |
| `SPEC-041` DEV-097 addendum／`ADR-047` | `TaskDetailsModal` 的 dirty／safe owner 與 reload safety 不得因節點切換失真。 |
| `SPEC-099`／`CAPA-001` | 2026-09-02 production事件後，persistence dispatch、terminal outcome、bounded unknown與canonical readback改由 SPEC-099管轄；本SPEC保留navigation owner與draft safety，不再禁止unknown/readback。 |

原DEV-098實作preflight為 `Compatible extension / prior out-of-scope re-entry`。2026-09-02事件形成一個
明示的 `Intentional replacement`：只取代本SPEC的callback-only persistence convergence約束；其餘surface、
drag、navigation、permission與overlay契約不變。DEV-099根因尚未確認，因此DEV-098不得獨立進release。
`SPEC-098` 只成為「任務明細內子任務 surface、局部 drag host、同 modal 導覽與 overlay ownership」
的權威；其餘 identity、permission、transaction、gesture 與 lifecycle 仍由上表既有規格管轄。

本決策不建立 ADR。理由是局部 drag host 與 host adapter 是可逆、限於本交付點的 UI 架構選擇，
且 domain transaction／shared placement architecture 已由 `SPEC-089`、`SPEC-095` 決定；本 SPEC
保留完整 decision record 即足夠。若日後要把全站 drag host 或 overlay manager 全域重構，才另開 ADR。

## 3. Human Confirmed 決策

- 任務明細底部設置子任務區，預設展開並可收合。
- 子任務 UI 與看板 L3+ 相同，且必須直接共用元件與功能來源。
- 明細也在拖曳範圍內；此處的精確定義是「modal 內可見 placement subtree 加上目前任務根
  drop target」，不是把被遮住的整張看板也納入命中範圍。
- 「明細在範圍內」只指 modal 內的子任務 drag host；modal 外框、標題／日期／備註等 metadata、
  遮罩後方 Board／Workbench 與其他 view 都不是 drop target。共用的是 neutral row／tree 與既有
  placement contract，DnD host 仍由各 surface 各自持有。
- 看板與明細各自持有 `DndContext`／mobile drag session；兩者共用 sensors policy、target adapter、
  intent、preview、placement controller、commit 與 recovery contract。
- 子任務點擊、右鍵「開啟明細」與新增後命名，都在同一 modal navigation stack 內切換。
- save pending／failure、placement pending 或 target permission revoked 時 fail closed。

## 4. Current Scope

- 明細主內容底部的 section header、直屬 placement count、展開／收合、空白與唯讀狀態。
- 看板 `KanbanChecklist` 與明細共用 neutral checklist tree／row；看板專屬 dependency selection、
  record capture 與 filter projection 改由 board host adapter 注入。
- 明細局部 desktop mouse／keyboard DnD 與 mobile long-press session。
- 同層 before／after、append-child、拖回目前任務直屬層、primary／tracking placement route。
- 同 modal push／back／close navigation、draft flush gate、stale navigation guard 與 focus restore。
- 共用右鍵 action catalog、modal 上層 menu、outside click、Escape ownership 與 drag cancel。
- 1440×900、1024×768、390×844、320×844 的單一主捲動 owner、無水平 overflow。
- planned static／pure／browser verifier 與 QA／QC evidence contract。

## 5. Out of Scope

- 全域提升看板 `DndContext`，或把 L1、欄位、工作台、cross-view collision 規則搬進 modal。
- 從 modal 拖到遮罩後方的看板、工作台、其他 view 或另一個 Board。
- 新 route／drawer、多層 task detail modal、row 行內改名、完整明細 IA 重設。
- 新增 tracking child composite transaction；tracking root 仍只投影既有 explicit tracking children。
- 強化既有 task create 的 durable／rollback 語意；DEV-098 只共用現行 create-child command契約。
- 修改 task／placement schema、API、provider contract、migration、RLS、角色 capability 或 backup 格式。
- commit、merge、push、deploy、production smoke 或 release。

## 6. 現況與根因

目前 `KanbanChecklist.tsx` 雖已使用 `TaskSurfaceFrame`、`TaskPlacementTree` 與
`useTaskPlacementController`，但實際 task row 與 recursive renderer 仍是檔案內 private component，
且直接讀取 `KanbanDependencyContext` 與 record capture store。直接在明細引用會把看板狀態耦合進 modal。

`TaskDetailsModal.tsx` 已有 title／notes autosave、pending count、failed update retry 與關閉前保存，
但 node ID 改變時會清 timer／重設 local state，沒有一個可等待的「離開目前 task」gate。直接修改
`nodeId` 可能取消尚未排程的 notes save，或讓舊 callback 在新 task 畫面 settle。

`GlobalContextMenu.tsx` 目前只保存一組 `detailsNodeId`／`trackingReferenceId`，沒有 navigation stack；
全域 task menu z-index 9999 低於 modal z-index 10000，且 modal Escape nested-overlay selector 未包含
global task menu。`TaskDragPresenter` 預設 z-index 80～95，也會被 modal 遮住。

因此根因是 host responsibility 尚未分層，不是缺一個簡單 render slot。

### 6.1 RD 技術主管 Gate

- 結論：`通過（文件修正後）`。方案直接處理 renderer、drag host、details host 三個責任混雜的根因，
  沒有建立第二套 placement transaction，也不需要 schema／provider 改造。
- 最短因果鏈：private Board row 直接讀 Board context → modal 無法安全重用 → 必須先抽 neutral row，
  再由 Board／Details host 注入差異；Details 位於 Board `DndContext` 外 → 共用元件不等於共用 runtime
  drag context → Details 必須擁有局部 drag host；目前 details 只有單一 ID 且 close-save 只支援 close →
  同 modal 導覽必須把既有 save continuation泛化，而不是直接替換 `nodeId`。
- 拒絕的過度設計：全域提升 Board `DndContext`、通用 overlay registry、多 modal／breadcrumb framework、
  另一套 navigation service，以及沒有 provider readback依據的「10秒儲存結果未知」狀態。
- 有界技術債：`GlobalContextMenu` 本 DEV 仍是 details host；只抽一個聚焦 stack／transition ownership 的
  `useTaskDetailsNavigation` hook，不順帶重構整份 action menu。若未來出現第二個非 menu details host，
  再另立 DEV／ADR 拆成獨立 details provider；不得在 DEV-098 預作全域框架。

## 7. 目標架構

```text
GlobalContextMenu（唯一 details host／navigation owner）
├─ useTaskDetailsNavigation（stack／單一 transition ownership）
└─ TaskDetailsModal（單一 modal、draft leave guard、單一 scroll owner）
   └─ TaskDetailsSubtaskSection（collapse／count／empty／root drop entry）
      └─ TaskDetailsSubtaskDragHost（local DndContext＋mobile session）
         └─ TaskChecklistTree（與 KanbanChecklist 共用）
            ├─ TaskSurfaceFrame
            ├─ useTaskPlacementController
            ├─ TaskPlacementTree
            └─ shared task content／actions／gesture
```

```text
Board host adapter ─────┐
                       ├─ TaskChecklistTree／row
Task Details adapter ───┘
                       ├─ shared target adapter／drop intent／preview
                       └─ SPEC-089／095 authoritative commit
```

### 7.1 Shared checklist component contract

從 `KanbanChecklist.tsx` 抽出 neutral `TaskChecklistTree` 與 row。共用 component 至少接受：

```ts
type TaskChecklistHostAdapter = {
  surfaceId: 'board.checklist-row' | 'task-details.subtask-row';
  commandDependencies?: TaskCommandDependencies;
  interactionMode: 'default' | 'dependency-selection' | 'record-capture';
  onRecordCapture?: (taskId: string, title: string) => void;
  filterProjection?: TaskFilterResultProjection | null;
};
```

- neutral row 不得 import `BoardView` 或自行推測目前是不是 modal。
- `sortableType='wbs-checklist'` 與 `sourceKind='checklist-row'` 是 shared row invariant，不開放 host變體。
- Board adapter 提供 dependency／record／filter 行為；Details adapter 固定 `interactionMode='default'`。
- task title、status、date、tag、selected／focus、primary／tracking frame、pointer／keyboard／touch binding
  只能存在一份。
- `useTaskPlacementController` 新增可選 `origin` 與 `commandDependencies` 轉送至
  `useTaskInteractionBinding`；Details 使用它覆寫 details navigation，其他 surface 預設行為不變。
- `TaskInteractionSurfaceId` 新增 `task-details.subtask-row`；host mode 仍保留使用者進入明細前的
  list／mindmap／board／gantt／calendar，surface ID 負責辨識 modal 內來源。

### 7.2 Placement projection algorithm

根 placement 定義：

```text
primary details root  = primary:<taskId>
tracking details root = trackingReferenceId
directCount           = active visible placements whose parentPlacementId == rootPlacementId
visibleSubtree        = stable recurse(children(parentPlacementId), order, placementId)
```

- primary root 顯示 canonical primary children，以及明確掛在該 primary placement 下的 tracking children。
- tracking root 只顯示該 reference 下的 explicit tracking children；不得自動物化 canonical descendants。
- active、archived、cycle、visibility 與 stable ordering 沿用 `TaskPlacementTree`／`SPEC-095`。
- section count 只計直屬可見 placements，不計所有 descendants；create／move／remove 成功後即時更新。
- 收合只停止 render subtree，不改 placement、filter、selection 或 persisted preference。

### 7.3 Local drag host 與作用域

明細 host 建立獨立 `DndContext`、`MobileTaskActionContext` 與 `useTaskDragSession`。不得巢狀使用或
提升 Board host；`GlobalContextMenu` 位於 Board host 外也不再是限制。

允許目標：

- visible row 的 before／after。
- visible row title child zone 的 append-child。
- section root drop zone：normalize 成對目前 root placement 的 append-child，用既有
  `wbs-task-title-child` commit 語意，不新增第二套 domain command。

拒絕目標：

- source 自己、source descendant、archived／missing／stale placement。
- root task 本身作為 drag source。
- modal DOM scope 之外的 board、workbench、other view target。
- primary-under-reference、跨 Workspace、無 `canDragPlacement`／`canManageTaskReference` 的目標。

`useTaskDragSession` 的 `boardSurfaceRef` 改為 generic `dragSurfaceRef`／`scrollSurfaceRef`，並接受
`targetScopeRef`。Board caller 傳既有 board surface，Details caller 傳 modal body／subtask host；
target adapter 只允許 `targetScopeRef.contains(target)`，唯一例外是同一 session 的 mobile action rail。

desktop 與 mobile 都沿用 `desktopTaskDropPreview`、`taskChildDropTarget`、`taskDragTargetAdapter`、
`commitDesktopTaskDrag`／`commitTaskDragObservation`。Details host 只能做 scope filtering、root target
normalization、transient presentation 與呼叫 shared commit，不得自行修改 `parentId`／`order`。

### 7.4 Mobile／keyboard drag contract

- 短 tap：開啟該子任務明細。
- 短滑：主內容捲動優先；不得開明細、menu、preview 或 action rail。
- 長按：進入同一 mobile drag session；preview、indicator、child dwell、cancel 與 action rail 沿用既有政策。
- local session auto-scroll 只能捲動 `TaskDetailsModal` 主內容；不得捲動背景 Board。
- `TaskDragPresenter` 接受 overlay layer／z-index prop；Details 使用 modal 上層值，Board 保持預設值。
- KeyboardSensor 沿用 `useDragSensors`：Space 啟動／提交、方向鍵選擇可見目標、Escape 只取消 drag。
- 收合、back、navigate、close、context menu open 或 target scope unmount 前，必須先 cancel local drag
  並清除 preview、indicator、body flag、timer 與 live-region transient。

### 7.5 Details navigation state owner

`GlobalContextMenu` 由單一 ID 改為 `TaskDetailsNavigationEntry[]` stack：

```ts
type TaskDetailsNavigationEntry = {
  taskId: string;
  trackingReferenceId?: string;
  placementId: string;
  returnFocusPlacementId?: string;
  focusIntent?: 'default' | 'title';
};
```

- 從外部 surface 開啟：建立 root entry，維持既有 global return-focus helper。
- 從明細子任務 pointer／Enter／menu「開啟明細」：通過 leave guard 後 push entry。
- `task.open-details-for-naming`：通過 guard 後 push entry，切換後 focus title input。
- Back：通過 guard 後 pop；render 完成後優先 focus 先前觸發 row，找不到時 focus 子任務 heading。
- Close：通過既有 close save gate 後清空 stack、selection 與 local drag，再回外部 origin。
- stack entry target missing／archived／permission revoked 時不切換，保留目前 entry並顯示可恢復錯誤。
- 一次只允許一個 pending transition；pending期間其他 push／back／create請求 no-op，避免建立競速仲裁器。
- Back時用 `returnFocusPlacementId` 查找目前已 render的 row，不把可能 detached 的 `HTMLElement` 存入 state。

Header 在 stack depth 大於 1 時顯示單一緊湊「返回上一層任務」控制；不得堆 breadcrumb card 或第二個 modal。
現有 canonical ancestor path 保留為位置資訊，不冒充 navigation stack。

### 7.6 Draft leave guard

在 `TaskDetailsModal` 現有 persistence state 上，將 `closeRequestedRef` 泛化為單一
`pendingTransitionRef`，供 close／push／back／create-and-navigate共用：

```text
cancel title/notes debounce
→ collect current title + notes draft + failed updates
→ queue missing durable writes
→ keep exactly one typed transition for current task/version
→ SPEC-099 persistence primitive settles accepted operations
→ if persisted AND source task/version still current, execute transition once
```

- 2026-09-02以前的 callback-only流程是DEV-098歷史實作baseline，不再是release authority；現行persistence authority為SPEC-099。
- durable success只能來自provider terminal completion或SPEC-099定義的authoritative canonical readback；不得把optimistic store value當成功。
- save failure停留目前 task、保留 draft與 Retry、清除該次 transition；使用者重試成功後重新發出導航。
- accepted operation在provider deadline前維持saving／dirty與disabled transition；到期後依SPEC-099進入
  `unknown`與canonical readback，仍不得推導成功。這是對原「不新增timeout／unknown／readback」條款的
  明示 `Intentional replacement`，不是對DEV-098其他行為的全面改寫。
- navigation guard 與 close guard共用同一 persistence primitive，不得形成兩套 pending／failed refs。
- `taskDetailsHasLocalChanges` 必須在 transition pending／saving／failed時維持 dirty，符合 DEV-097
  在 `SPEC-041` addendum／`ADR-047` 固定的 safety owner。
- `taskDetailsHasLocalChanges` 在unknown時亦須維持dirty；DEV-099未通過前，不得把既有callback-only流程視為release-ready。
- placement transaction pending 時也禁止切換，避免 source row unmount 使使用者誤認已成功。

### 7.7 Overlay、Escape 與 focus ownership

沿用 modal既有 layer，並由現有 host／presenter的 details variant固定相對順序：

```text
TaskDetails modal                 10000
TaskDetails drag preview/rail     10020
Global task menu backdrop/menu    10030 / 10031（details 開啟時）
Nested confirm/dialog             existing topmost contract
```

- details 關閉時 global task menu 保持既有 9998／9999，避免不必要的全站層級改變。
- 不新增通用 overlay manager或僅包三個數值的 module；相對順序由 source contract與 browser疊層案例共同保護。
- Details 由 prop/state 得知 global task menu 是否開啟，不靠不完整 DOM selector猜測。
- Escape ownership：drag → menu／popover／nested dialog → modal；一次 keydown 只關一層。
- menu outside click 只關 menu，保留 details selection；modal backdrop primary click 才走 save-and-close。
- menu action完成後 focus 回原 row；若 row 因 move/archive消失，focus 到 section heading，不落到 body。

## 8. UI Entry Contract

位置固定在 `TaskDetailsModal` 主內容中，緊接 notes section，位於歷史資訊 trigger 之前；與現有主內容
共用唯一 `overflow-auto` owner。

可見結構：

- 一列扁平 section header：chevron、文字「子任務」、直屬數量、可用時的「新增子任務」。
- header 本身是可聚焦 button 或具有等價 button semantics，`aria-expanded` 與 `aria-controls` 完整。
- 展開後直接顯示共用 checklist tree；不新增 card shell、說明卡、重複標題列或內層捲軸。
- 空白 primary placement：顯示「尚無子任務」與唯一 CTA；無 create permission 時只顯示中性空白文字。
- tracking placement：文案為「此處尚無追蹤子任務」，不提供會暗示 atomic tracking-child 建立的空白 CTA；
  既有 task action catalog 仍按 placement capability 顯示合法 action。
- loading／pending 只在 section 行內顯示最小狀態；不得用全 modal spinner 擋住已載入的父任務內容。
- 320px 下 title、count與 CTA 可換行或縮寫，但不得水平捲動或遮住 touch target。

Collapse lifecycle 固定為 component-local state，entry 首次 mount 為 `true`；同 entry 操作可收合，
切到另一 task、Back 回來或關閉後重開都重新預設展開，不寫 localStorage／provider。

## 9. 功能與權限契約

| 行為 | Primary placement | Tracking placement | 失敗策略 |
|---|---|---|---|
| 讀取／展開 | canonical primary children＋explicit tracking children | explicit tracking children only | missing／forbidden row不 render並留 visible error evidence |
| 點開明細 | same modal push | same modal push，保留 reference context | draft／permission／target missing時不切換 |
| 編輯／狀態／指派 | 既有 canonical capability | 依 source canonical capability | guard拒絕且不 optimistic |
| 右鍵／Shift+F10 | 同一 action catalog | 同一 catalog＋placement guard | menu在 modal 上層，無越權項目 |
| Drag | `canDragPlacement` | `canManageTaskReference` 且 identity完整 | invalid／cycle／scope／permission fail closed |
| 空白 CTA create child | `canCreateTask` 時可用 | 本 DEV 不提供 | create前先過 leave guard；失敗不新增／不導航 |

新增子任務不得複製 `GlobalContextMenu.handleAddChild`。RD 應抽出或透過同一 command handler執行
`task.create-child`，由 context 提供 parent identity；在 Details 來源中先通過 leave guard，再依現行
create-child command建立，最後以 `focusIntent='title'` push新 task。task create的 optimistic／provider
failure語意維持既有 baseline，不在 DEV-098 假裝升級為 durable create；若 local command未產生 target
則不 push，若 target後續不可讀則保留既有 task identity與可恢復錯誤，不自行發明回滾。

## 10. Failure／recovery matrix

| Code／情境 | 可見結果 | 資料 postcondition | Recovery |
|---|---|---|---|
| `DETAILS_SAVE_FAILED` | 留在目前 task、save error＋Retry | draft保留，stack不變 | 同一 draft重試 |
| `DETAILS_TRANSITION_BUSY` | pending期間的新請求不執行 | 目前typed transition與stack不變 | 等目前save settle後重試 |
| `DETAILS_TARGET_MISSING`／`FORBIDDEN` | section近端錯誤，不空白跳頁 | current entry、selection不變 | refresh／回上一層 |
| `DETAILS_PLACEMENT_PENDING` | navigation controls暫停 | source subtree仍可讀 | 等 commit settle／取消 |
| `DETAILS_DROP_SCOPE_REJECTED` | indicator清除，live region宣告不可放置 | parent/order不變 | 選 modal 內合法目標 |
| placement permission／cycle／stale | no-op，不顯示成功 | 無 duplicate、loss、cycle | refresh或重新拖曳 |
| placement persistence failed | toast／近端錯誤，source回原位 | authoritative source不變 | Retry；outcome unknown先 readback |
| context menu action failure | menu關閉或保留依 action既有契約，details不關 | selection與合法資料不變 | 同 action重試 |

## 11. Data、API、migration、permission 與 release 影響

- Schema：無。
- Migration：無。
- Provider／API：DEV-098原實作無新contract，只重用既有node create、placement commit、tracking move與callbacks；
  persistence convergence整合後改依SPEC-099 accepted／terminal／unknown-readback契約，此項仍為NOT IMPLEMENTED。
- RLS／角色 capability：無新增；沿用 `useTaskPlacementPermissions`、source canonical capability與
  `canManageTaskReference`。
- Backup／Realtime：無格式變更；成功後由既有 store／provider readback收斂。
- Deployment／environment：無 build、hosting、secret 或 runtime拓撲變更，因此不另寫 release feasibility note。
- Release：不在 DEV-098 文件升級範圍；實作與 QA／QC 通過後仍需另走 release gate。

## 12. Repo／module／file impact

### 12.1 Implemented new files

| 檔案 | 責任 |
|---|---|
| `src/components/Wbs/TaskChecklistTree.tsx` | 從 `KanbanChecklist` 抽出的 neutral row＋recursive tree；task content只此一份。 |
| `src/components/Wbs/TaskPlacementTree.tsx` | placement row 建構統一排除 archived／missing 與 duplicate placement，保持 stable order。 |
| `src/components/Wbs/taskDrag/taskMoveUpdateNormalization.ts` | 將 local-test move update normalization 抽成 pure helper；durable commit authority不變。 |
| `src/components/TaskDetailsSubtaskSection.tsx` | section header、count、collapse、empty、local drag host與root drop UI。 |
| `src/components/taskDetailsNavigation.ts` | details stack與單一 typed transition ownership；不建立通用 modal framework。 |
| `scripts/verify-dev-098-task-detail-subtasks.mjs` | static／source contract verifier。 |
| `scripts/verify-dev-098-task-detail-subtasks-browser.pw.js` | normal UI browser、gesture、permission、failure與viewport verifier。 |

### 12.2 Implemented modified files

| 檔案 | 固定變更 |
|---|---|
| `src/components/Wbs/KanbanChecklist.tsx` | 瘦身為 Board adapter；移除 private duplicate row／tree。 |
| `src/components/Wbs/useTaskPlacementController.ts` | 接受 origin／command dependencies，維持其他 callers預設值。 |
| `src/components/Wbs/taskDrag/useTaskDragSession.ts` | generic drag／scroll／target scope refs與detail-safe cancel。 |
| `src/components/Wbs/taskDrag/taskDragTargetAdapter.ts` | optional scope containment；action rail是唯一 scope外例外。 |
| `src/components/Wbs/taskDrag/TaskDragPresenter.tsx` | 可注入 overlay layer；Board default不變。 |
| `src/components/TaskDetailsModal.tsx` | 插入 section、leave guard、back control、navigation／overlay／focus contract。 |
| `src/components/GlobalContextMenu.tsx` | details stack owner、guarded menu navigation、details-open menu layer、共用 create child route。 |
| `src/interactions/task/types.ts` | 新增 `task-details.subtask-row` surface ID。 |
| `src/interactions/task/resolveTaskInteraction.ts` | Details child row補 `task.open-details` menu action；其他 surface catalog不變。 |
| `package.json` | 新增 static、pure/component、browser、independent QC 四個 DEV-098 verifier scripts。 |
| `ai-doc/dev_task.md`、`ai-doc/documentation_map.md` | DEV 狀態、traceability與 evidence map。 |

若 RD 發現必須修改上表以外的 schema、provider、RLS、global action semantics 或多於一個新 transaction，
即視為 scope expansion，必須先回 PM／技術主管更新本 SPEC，不得邊做邊擴張。

## 13. RD work packages

| WP | 實作內容 | 完成 gate |
|---|---|---|
| WP-098-A Shared surface | 抽出 `TaskChecklistTree`／row、Board adapter、controller command deps；先保持 Board DOM／action／gesture baseline | source duplication gate＋DEV-095 parity regression |
| WP-098-B Navigation／save | focused navigation hook、單一 pending transition、push／back／close、create-and-navigate、focus | pure state cases＋save failure browser |
| WP-098-C Details surface | local DnD、root target、scope filter、desktop／keyboard／mobile、section UI、overlay／Escape、RWD | background rejection＋4 viewports＋gesture evidence |
| WP-098-D Evidence | verifiers、targeted regressions、artifacts、QA handoff | S01～S08、P01～P10、B01～B16且 no P0/P1 open |

順序固定 A → B → C → D。A 未證明 Board baseline 不變前，不得同時在 Board 與 Details
保留兩份 row JSX；B 未完成前不得啟用 child navigation；C scope gate未通過前不得開啟 drag。

## 14. Acceptance criteria

- `AC-098-001`：任何合法 task details 都在 notes 下、history 前顯示「子任務」區；entry 首次 mount
  預設展開，pointer／Enter／Space可收合，直屬 count正確且收合不改資料。
- `AC-098-002`：Board L3+ 與 Details primary／tracking row共用同一 task content component、
  `TaskPlacementTree`、`useTaskPlacementController` 與 action binding；source gate找不到 duplicate renderer／commit。
- `AC-098-003`：Details desktop、keyboard、390／320 touch可在可見子樹 before／after、append-child、
  root append；背景 Board／Workbench 永遠不是 target。
- `AC-098-004`：self、descendant、primary-under-reference、missing、archived、scope外與 permission-denied
  drop fail closed，無 duplicate、loss、cycle、假成功或殘留 indicator。
- `AC-098-005`：child pointer／Enter／menu open-details使用同一 modal push；Back回上一 entry，Close清空 stack；
  任一時刻 DOM 中 `TaskDetailsModal` 數量恆為 1。
- `AC-098-006`：title／notes dirty、save pending、save failure與 placement pending時不切換；
  success後才更換 task identity，舊 callback不得污染新 entry；persistence terminal／unknown語意須另通過
  `SPEC-099／QA-DEV-099`，既有DEV-098 PASS不覆蓋該新增Gate。
- `AC-098-007`：context menu完整顯示在 modal之上；Escape依 drag → menu／nested overlay → modal一次關一層，
  outside click與focus restore不遺留 selection／body focus。
- `AC-098-008`：primary、tracking、owner/editor/viewer及 capability revoke皆由既有 permission guard決定；
  tracking subtree只顯示 explicit placements，不洩漏 canonical descendants。
- `AC-098-009`：空白 primary有且只有一個合法 create CTA；readonly無 mutation CTA；tracking空白不暗示
  本 DEV 不存在的 atomic tracking-child建立。
- `AC-098-010`：placement durable failure／unknown沿用 `SPEC-089` 保留 source subtree；成功後 count、order、
  parent與所有同 task surfaces依既有 readback收斂。
- `AC-098-011`：1440×900、1024×768、390×844、320×844只有一個主縱向 scroll owner，無水平 overflow、
  nested card shell、menu／preview裁切、short-scroll誤 drag。
- `AC-098-012`：從 List、Board、Gantt、Calendar、Mind Map既有入口開啟時功能一致；正常 fixture
  visible error與console error為 0，DEV-028／046／053／054／055／070／089／095／097 regression須
  通過或由 owner 留下正式 waiver。本輪 DEV-098 核心證據通過，但 DEV-046／053／055 fresh audit
  仍有 open findings，故本 AC 尚不可宣稱整體完成。

## 15. 驗證、證據與 traceability

QA 計畫：`ai-doc/qa/QA-DEV-098-task-detail-subtask-management.md`。
QC 報告：`ai-doc/qc/QC-DEV-098-task-detail-subtask-management.md`。

Executed／remaining commands（未執行項目不得填 PASS）：

```text
npm run verify:dev-098-task-detail-subtasks
npm run verify:dev-098-task-detail-subtasks-pure
npm run verify:dev-098-task-detail-subtasks-browser
npm run verify:dev-098-task-detail-subtasks-qc
npx tsc --noEmit
npm run build:test
```

Artifacts：

- `output/qa/dev-098/result.json`
- `output/playwright/dev-098/result.json`
- `output/playwright/dev-098/screenshots/`
- `output/qc/dev-098/task-detail-subtasks-qc-result.json`

每份 browser evidence 必填 source revision、fixture、actor／capability、entry mode、task／placement identity、
viewport、input modality、before／after parent+order、save／commit outcome、screenshot、console與 visible-error sweep。

本輪已取得的直接證據：

- `npm run verify:dev-098-task-detail-subtasks`：S00～S08 source gate 22/22 PASS。
- `npm run verify:dev-098-task-detail-subtasks-pure`：P01～P10 pure/component 10/10 PASS；
  `output/qa/dev-098/pure-result.json` 保存 projection、drop intent、failure retention、navigation、save gate與 capability evidence。
- `npm run verify:dev-098-task-detail-subtasks-browser`：B01～B16 16/16 PASS，diagnostics 0；
  `output/playwright/dev-098/result.json` 保存 machine-readable 結果，`B16-layout-error-sweep.png` 為代表畫面。
- `npx tsc --noEmit`、`npm run build:test`、DEV-046／053／055／095 targeted regression 均 PASS；
  DEV-046 static/browser 32/32、5/5 operation cases，DEV-053 static/browser 31/31、10/10，
  DEV-055 static/browser 34/34、18/18，diagnostics/network 0。
- 乾淨 baseline HEAD `13888b2` 的隔離重跑可重現 DEV-046-D02、DEV-053-B14與 DEV-055 所列失敗，
  證明這些不是 DEV-098 未提交變更單獨造成；DEV-053-B13在基線輪次未重現，仍列為 current-run
  instability。摘要與 runner isolation note 見 `output/qa/dev-098/baseline-audit.json`。
- `output/qa/dev-098/runtime-cleanup.json` 保留既有 baseline runtime ownership；本輪另使用 task-owned Vite
  `127.0.0.1:4011`，完成後僅停止該 process tree 並確認 port 釋放。
- `output/qa/dev-098/runtime-cleanup-final-20260902.json` 保存本輪 shell／Vite／esbuild process tree、停止時間與
  `portReleased=true`；既有 primary `localhost:4000` 未停止。
- `output/qa/dev-098/adjacent-audit-final-20260902.json` 記錄修正後以 task-owned Vite `127.0.0.1:4011`
  重跑的 DEV-046／053／055／095 結果；全數 PASS，未使用 waiver。
- `output/qa/dev-098/adjacent-audit-followup-20260902.json` 保留歷史 follow-up；最新 disposition 以
  `adjacent-audit-final-20260902.json` 為準。
- `npm run verify:dev-098-task-detail-subtasks-qc`：QC-098-01～10 10/10 PASS；直接 readback 核心
  artifacts、source files、drag scope、navigation／save、overlay、failure recovery與 clean-baseline disposition，
  結果保存於 `output/qc/dev-098/task-detail-subtasks-qc-result.json`。

上述證據代表本地 implementation slice、完整 B01～B16 automated QA、獨立 QC 10/10與指定相鄰
regression audit均 PASS；仍不能把 local evidence 擴大宣稱為 remote／實機或 release readiness。實機與
release gate 仍依 QA-DEV-098 handoff 執行。

2026-09-02 CAPA amendment：上述DEV-098 evidence是子任務surface與歷史callback-only navigation baseline，
不證明SPEC-099的root-cause、terminal、deadline／unknown或canonical readback契約。DEV-098預定整合任何
persistence修正時，必須依QA-DEV-099重跑相容案例，未通過前維持 `Persistence Release Blocked`。

## 16. Stop conditions

下列任一成立，RD 不得宣稱 DEV-098 implementation complete 或交 QC：

- Details 複製 task title／date／tag／action JSX，或存在 details-only placement commit。
- Board 與 Details 共用同一個全域 `DndContext`，或 modal可命中背景 Board／Workbench。
- `taskId`、`placementId`、`trackingReferenceId` 任一在 tree／DnD／navigation混用。
- dirty／pending／failed／unknown狀態仍可切換 node ID，或舊 task callback可更新新 task畫面。
- context menu／drag preview被 modal遮住，Escape一次關閉超過一層，或 focus落到 body。
- viewer／derived-only actor看見或執行越權 mutation；tracking detail洩漏未明確追蹤的 descendants。
- placement failure後 source消失、順序改變、出現 ghost／duplicate／cycle或成功 toast。
- 任一必要 viewport有水平 overflow、雙層縱向 scrollbar或 short pan誤 drag。
- planned verifier尚不存在、只做 source assertion／build、沒有 normal UI rendered evidence，卻宣稱 PASS。
- 有 P0／P1 未關閉，或受影響 regression未重跑。
- DEV-099根因未確認、QA-DEV-099未通過，卻準備將DEV-098整合候選標為release-ready。

## 17. Rollback boundary

本 DEV 沒有 schema／migration。安全 rollback 順序為：關閉 `TaskDetailsSubtaskSection` entry → 移除 details
navigation stack adapter → 保留已抽出的 neutral shared row給 Board使用。不得回滾 `SPEC-089` placement transaction、
`SPEC-095` identity／tracking model，亦不得用恢復 duplicate `KanbanChecklist` renderer作長期 rollback。

## 18. 變更紀錄

- 2026-09-01：由 `Brief Ready / Human Confirmed` 升級為 `RD Implementation Ready`。固定 shared row／tree、
  independent local drag host、scope filtering、details stack owner、draft leave guard、overlay／Escape、permission、
  tracking projection、逐檔 work package、AC、failure recovery、QA evidence與 stop conditions；產品尚未實作。
- 2026-09-01：RD 技術主管審視後通過修正版。移除無契約支撐的 10 秒 save unknown狀態與獨立 layer module，
  以單一 typed save continuation收斂 close／push／back／create；navigation保存 placement ID而非 DOM element，
  WP縮為 A～D，QA gate縮為 S01～S08、P01～P10、B01～B16並保留核心高風險案例。
- 2026-09-01：依 WP-098-A～D 完成 local implementation；抽出 Board／Details 共用 checklist tree，接入 Details
  local drag scope、single-modal navigation stack、typed save continuation、overlay ownership 與 verifiers。
  Source gate 22/22、pure P01～P10 10/10、browser B01～B16 16/16、diagnostics 0；文件狀態更新為
  `RD Implemented / Local Automated QA PASS`，獨立 QC、實機與 release 仍保留為後續 gate。
- 2026-09-01：依 RD 技術主管 fresh regression audit 補跑 DEV-028／046／053／054／055／070／089／095／097。
  DEV-098 核心 S／P／B 仍全數通過；DEV-046-D02、DEV-053-B13/B14與 DEV-055 多個既有 desktop
  placement／menu／indicator案例失敗，故現行狀態加註 `Adjacent Regression Audit Blocked`，不把未歸因
  的相鄰失敗誤寫成 DEV-098 或 release PASS。
- 2026-09-01：補明 drag scope 語意：明細範圍僅涵蓋 modal 內子任務 drag host 與 root drop zone；modal
  外框、metadata及遮罩後方 surface不是 drop target，共用仍限於 neutral row／tree與既有 placement contract。
- 2026-09-01：執行獨立 read-only QC；QC-098-01～10 10/10 PASS，確認核心 evidence envelope、shared
  renderer、local drag scope、navigation／save、overlay、mobile／permission、failure retention與 baseline
  disposition。實作狀態補為 `Independent QC PASS`，相鄰 regression blocker與未 Release 邊界維持不變。
- 2026-09-02：以全新 dependency-optimized task-owned runtime 重跑 DEV-046／053／055；排除 504 blank-page
  runtime 假象後，D02、B13/B14與 DEV-055 原列 failures仍重現，維持相鄰 regression blocker。
- 2026-09-02：以同一 fresh dependency-optimized task-owned runtime 重跑 DEV-098 核心 browser，B01～B16
  16/16、diagnostics 0；同步重跑 source gate 22/22、pure P01～P10 10/10、`npx tsc --noEmit`與獨立
  QC-098-01～10 10/10。針對 DEV-046-D02 做最小資料集歸因檢查未取得穩定可歸屬修正，未虛構 waiver，
  相鄰 owner disposition 仍是整體 regression gate 的必要前置。
- 2026-09-02：針對 DEV-055 B10 的相鄰 owner finding，將 tracking-reference action 排到 assignment
  之後並重跑受影響案例；B10 在 1440x900／1024x768 PASS，DEV-095 parity B17～B24 8/8 PASS，且
  DEV-055 static verifier 改讀 `TaskChecklistTree` shared renderer 後 34/34 PASS。剩餘 placement／indicator／
  fixture-gap findings 仍開放，未使用 waiver，不改變未 Release 邊界。
- 2026-09-02：依正式環境永久saving事件與CAPA技術主管審查，將persistence convergence權威移至
  SPEC-099。此為對§7.6 callback-only／禁止unknown-readback條款的明示 `Intentional replacement`；
  DEV-098既有surface／navigation證據保留為歷史baseline，但增加 `Persistence Release Blocked by DEV-099`。
- 2026-09-02：完成相鄰 affected-case 修正與 fresh rerun：DEV-046 32/32＋5/5、DEV-053 31/31＋10/10、
  DEV-055 34/34＋18/18、DEV-095 4/4 均 PASS；pointer-derived edge、surface ownership、mixed-drag
  commit revalidation與 transient indicator settle納入實作與證據。相鄰 regression改標 PASS，未使用 waiver；
  DEV-099 persistence、實機 supplemental與 release仍維持未執行／Not Released。
