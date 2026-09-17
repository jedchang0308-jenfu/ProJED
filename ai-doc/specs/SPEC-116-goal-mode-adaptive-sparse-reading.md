# SPEC-116：全層級目標模式與自適應留白閱讀

- 狀態：`Target Authority / Interaction parity implemented / Targeted QA-QC PASS / NOT RELEASED`
- 日期：2026-09-11
- 對應 DEV：DEV-116
- QA authority：`ai-doc/qa/QA-DEV-116-goal-mode-adaptive-sparse-reading.md`
- 相容決策：`ai-doc/decisions/ADR-049-meeting-session-view-independence.md`、
  `ai-doc/specs/SPEC-117-cross-mode-meeting-session-continuity.md`
- 決策來源：`USER-20260909-OKR-GOAL-MODE-ADAPTIVE-SPARSE-LAYOUT`、
  `USER-20260910-REMOVE-INLINE-ADD-DESCRIPTION-RECORD-ACTIONS`、
  `USER-20260910-DEV116-MOBILE-RECORD-LAYER-DECISIONS`、
  `USER-20260910-DEV116-RD-CONTRACT-UPGRADE`、
   `USER-20260910-DEV116-ARCHITECTURE-CONFIRMATION`、
   `USER-20260910-GOAL-MODE-MEETING-CONTINUITY`、
   `USER-20260910-GOAL-LIST-TASK-CAPABILITY-PARITY`、
   `USER-20260910-GOAL-BOARD-CONTEXT-MENU-PARITY`、
   `USER-20260910-GOAL-FLAT-HEADER-LABELS`、
   `USER-20260910-GOAL-TASK-COLUMN-30PCT`
- 風險：Medium（新 view、跨層級資料所有權、record scope、inline mutation、DnD、可存取性與 meeting 相容）
- 文件成熟度：`RD Implementation Ready / Implemented`
- 架構定案：`已定案`

## DEV-124 桌面拖拉 ownership intentional replacement（2026-09-16；架構已定案／未實作）

[SPEC-124](SPEC-124-shared-desktop-task-drag-host.md) 有意取代本文件中「Goal 自有 DnD lifecycle／layout commit handler」
的責任邊界：Board 與 Goal 將共用 desktop drag host、fixed feedback layer 與 canonical primary commit，
各模式只保留 geometry adapter。此 amendment 不取代 Goal native table、`rowSpan`、252px frozen task-name first column、
single X-scroll、content／planning ownership、menu、keyboard semantics 或 mobile blocked policy。
在 DEV-124 尚未完成實作與 QA 前，現行 Goal runtime 仍依本文件既有 implemented behavior 運作；不得把架構定案誤寫成已交付。

## DEV-121 階層對照 compatible amendment（2026-09-14；架構已定案／未實作）

[SPEC-121](SPEC-121-goal-hierarchy-comparison-grid.md) 在 Goal frozen task-name cell 增加 Goal-only tree rails、
root-group boundary 與 collapsed descendant count，並在 task＋planning cells 增加 row reading guide。
本修訂保留本文件的 active-board primary DFS、shared `buildHierarchicalTaskItems`、
`TaskHierarchyIndentedRow` 的 6px shared default、native table／`rowSpan`、DnD、menu、mobile negative 與 a11y authority。
SPEC-121 R8/R9 對 Goal surface 局部覆寫 8px depth step、移除 endpoint、柔和化 connector，並把 disclosure 移到樹線左側的 20px 操作槽；List 與其他模式仍使用 6px default。
SPEC-121 R15 後續只在 Goal surface 將該 disclosure 視覺整併為 own-lane node toggle；shared `TaskHierarchyIndentedRow` 的 button、`aria-expanded`、handler 與其他模式 chevron 均不變。
SPEC-121 R16 只調整 Goal active presentation：current task 的 parent-owned `incoming-vertical`／`incoming-branch` 維持中性，其 own／descendant lineage 仍強調；shared hierarchy 與其他模式完全不變。
SPEC-121 R17 只調整 Goal presentation token：樹狀線 X 軸間隔由 Goal 8px 基準調為 10.4px（+30%）；shared hierarchy default 與其他模式完全不變。
SPEC-121 R18／R19 只調整 Goal presentation surface：定位／focus scope 時 task-name frozen cell 不套 active tint，且 root／L1／L2+ 所有層級共用同一白色底色；planning／content owner tint 與樹線定位仍保留；shared hierarchy 與其他模式完全不變。
SPEC-121 的 decoration map 只消費 canonical builder 結果，不得決定 row order、visibility、parent、content owner 或 mutation。

## DEV-120 規劃欄極簡化局部 target replacement（2026-09-14；Implemented／Targeted QA-QC PASS）

[SPEC-120](SPEC-120-goal-planning-minimal-density.md) 有意取代本文件 §8 與 AC-116-22／25 的局部 visual
target：移除 table 外框、planning cluster 常駐垂直格線、深色白字 header、常駐 input/pill/icon chrome 與
150／90／130／130／80px planning widths，改為淺中性 sticky header、單一 row divider、mounted quiet
controls 及 112／64／96／96／60px tracks。controls 持續掛載並沿用既有 handlers，只由 normal／hover／focus／open
樣式降低 chrome，不新增 planning editor/session state。DEV-116 的既有 V10／V12／V23 QA/QC 結果保留為歷史 candidate
事實；DEV-120 實作時只更新被明確取代的 oracle，不回寫歷史 artifacts。
DEV-121 R14 是後續的 Goal-only 視覺修正：在保留任務名稱固定欄無資料列格線的前提下，恢復可捲動比較欄位的水平與垂直 cell grid；這不改寫 DEV-120 的歷史 candidate artifacts。

任務名稱仍是同一 native table 的第一欄，固定在資料表格左側：task-name th/td 使用 sticky left，其他
欄位由表格唯一 X 軸捲軸移動。這不是 app sidebar、viewport-fixed panel、split table 或第二個 scroll owner。
task-name header 同時 sticky top/left，body cells 具不透明階層背景與單一低對比右邊界，避免捲動內容穿透。

本文件其他 authority 維持：Goal entry、active-board primary hierarchy、projection／rowSpan、optional content
columns、records、canonical planning mutation、permission／dependency、DnD、task menu、meeting continuity、
mobile negative boundary與a11y table semantics均不變。SPEC-119 的 description/meeting edit session、expand/scroll、
PWA與全域3px scrollbar亦不變。現行產品仍是DEV-116／119 implemented candidate，直到DEV-120產品與QA/QC完成。

## DEV-119 局部 target 修訂（2026-09-14；Local Candidate Implemented，R10）

[SPEC-119](SPEC-119-goal-cell-direct-edit-and-content-fit.md) R2 定案、R3 candidate 已取代本文件兩個局部 target：
rendered description owner cell 可使用共用富文字 editor 就地編輯；內容 owner cell 預設仍為 bounded Y-scroll，
使用者動作 B 才暫時 auto-fit，再執行一次恢復捲動。未完成編輯的 projection anchor 僅依 SPEC-119 生命週期保留來源格。
covered cell／空欄規則、native rowSpan、meeting 唯讀、task-name 全域選單與其他權威不變。
收合內容仍保留必要 Y-scroll，並直接繼承 3px、透明軌道、低對比滑塊與無箭頭的全系統 CSS 捲軸基底；不再維護 Goal 專用 class，也不增加 wrapper。展開／收合邏輯與外層表格捲動邊界不變。
本文件過往「不提供 inline editor／固定 bounded」及相應驗證結果是 DEV-116 baseline，
不能解讀為禁止 DEV-119 的上述增量；DEV-119 candidate 已完成 targeted QA/QC，完整 failure injection 與正式 release gate 仍以 SPEC-119／QA-DEV-119 為準。

## 1. 成功結果

在桌機既有「視角」中加入使用者可見的「OKR模式」（internal value 維持 `goal`），以 active board 的 canonical primary task tree 為主畫面，讓 L1、
L2、L3+ 任務都可直接閱讀自己的任務說明與所有具 DEV-108 provenance 的人工會議補記。沒有內容的
欄位不以 placeholder、空框或固定高度競爭版面；父層內容可以在同一欄、同一 subtree 的連續空白可見列
使用 native row span，但只改 presentation，不形成資料繼承或編輯限制。

會議欄在 exact workspace × board scope 內列出同一任務的全部合格補記，超出跨列可視高度時才在欄內使用 Y 軸捲動；
所有其他 task-linked records 仍在既有紀錄庫按需查閱，本期不新增完整聚合畫面。手機不提供 goal；桌機 live meeting
把 goal 納入既有 continuity view，不建立另一套 meeting lifecycle。2026-09-10 使用者再明確要求 OKR 列具備清單既有的
拖曳、標籤與多欄編輯能力；進度條與百分比維持清單模式，OKR 不呈現進度指示。上述能力不要求抽成跨模式共用元件；兩模式只共用階層縮排與展開箭頭的
純顯示元件，避免把 recursive Grid 與 sparse semantic Table 強制耦合。OKR 任務名稱區的右鍵與 `Shift+F10`
則沿用看板同一個 `GlobalContextMenu`／`TaskActionMenu` presenter、同一份 action profile 及既有 permission guards，
不新增 mode-specific 選單或動作執行器。

使用思考習慣：#目的、#系統描繪、#效用理論

## 2. Human Decisions 與不可逆邊界

1. 每一層任務的欄位資格與編輯自由相同；層級只表示脈絡。
2. 不新增 Objective／KR schema、必填規則、分數或父子資料繼承。
3. description、meeting highlight 都可不存在；空白應讓出版面。
4. 不提供列內「＋說明／＋紀錄」；任務目的與會議紀錄仍走既有 Task Details／會議流程。負責人、狀態、日期與工期可在列內依權限編輯。
5. 第一版不開放手機 goal。
6. 主畫面顯示 exact workspace × board scope 內所有合格 DEV-108 人工補記；其他 task-linked records 留在既有紀錄庫的次要資訊層。
7. 第一版只投影 active-board canonical primary placements；tracking references 不進 goal。
8. 2026-09-10 最新使用者決策有意取代先前排除範圍：goal 加入 DEV-117 live meeting continuity；start／recovery
   保留 goal，live option set 可切入／切出 goal。
9. 2026-09-10 最新互動決策有意取代 details-only／zero task write／no-DnD 邊界：desktop goal 保留標籤，
   並開放既有 permission guard 下的負責人、狀態、開始日期、結束日期、工期編輯及 primary placement 拖曳；
   進度條與百分比只保留在 List。此決策不要求標籤或欄位編輯抽成共用元件。
10. 2026-09-10 最新右鍵決策再取代 goal context-menu disabled 邊界：desktop OKR 任務名稱區與看板共用同一
    `GlobalContextMenu`、`TaskActionMenu`、action profile、catalog／guard／command；權限允許時可執行看板既有任務動作。
    mobile goal 與 tracking placement 投影仍排除。
11. 2026-09-10 最新 UI 決策移除 OKR 負責人欄的裝飾性 `Users` trigger icon，以降低稀疏表格噪音；負責人文字、下拉觸發、
    鍵盤與 aria 語意不變，清單模式保留原 icon。由共用 `TaskAssignmentPicker` 提供 `showIcon` 顯示設定，並非另建模式專用 picker。
12. 2026-09-11 最新 UI 決策恢復任務目的／會議紀錄 owner cell 的最小內容容器；容器承擔固定跨列可視高度與
    `overflow-y:auto`，長內容在欄內捲動，不把下方任務往下推；語意 `td`、rowSpan、換行與格線保留。

上述任何一項改變都不是實作模型的局部決定，必須回 PM／規劃模型。

## 3. Scope

### 3.1 In Scope

- desktop topbar ModeSwitcher 的 goal option、view persistence與正常 restore。
- L1／L2／L3+ primary task DFS hierarchy、現行 task filter與本地 collapse。
- own description、all valid meeting quick notes、status、board assignee labels。
- 兩內容欄獨立 auto-collapse、own-content barrier、native table `rowSpan`與 a11y fallback。
- task details entry、看板共用右鍵／`Shift+F10` 任務選單、標籤呈現、List進度指示、editor inline planning controls 與
  desktop primary-placement DnD；viewer／editor與選單動作沿用既有 permission／capability guards。
- exact workspace×board records loaded truth、scope switch clear、stale response isolation、retry。
- mobile／tracking／unsupported record negative behavior，以及 desktop live meeting continuity。
- PWA durable view intent與owner manifest相容；task-drag owner納入 goal。

### 3.2 Out of Scope

- 結構化 OKR、目標評分、KR進度、對齊圖、必填或自動生成內容。
- 任務名稱／任務目的／會議紀錄 inline editor、列內 quick add、第二個 detail／menu surface。
- 手機 goal、mobile-specific layout。
- tracking references、source-board record read、跨 workspace／board資料。
- archived meeting highlight、active unsaved meeting draft、legacy正文、AI／RAG／activity／一般 task link projection。
- 新 provider query、endpoint、schema、migration、RLS／permission、metadata namespace。
- 新完整 task-linked records聚合畫面；仍由既有紀錄庫承接。
- commit、push、PR、deploy、production smoke或release。

## 4. Actual Repo Findings

| Evidence | 現況 | 架構結論 |
|---|---|---|
| `src/types/index.ts` | `ViewMode`沒有goal | 擴充同一 union，不建 route model |
| `src/App.tsx` | 五個 task views各由 `TaskInteractionScope`包裹；records於 board scope effect載入 | Goal同樣包scope；records仍一個 board-level load |
| `src/components/MainLayout.tsx` | view／filter／mobile lists與 option集中在 topbar | 加goal；mobile block；live option用record store匯出的predicate過濾 |
| `src/store/useBoardStore.ts` | view persistence與task host/surface fallback有硬編碼清單 | goal需明確登錄，不能 fallback成list |
| DEV-039 utilities | `projectTaskFilterResults`＋`buildHierarchicalTaskItems`可輸出 active-board DFS rows | 直接重用；不複製 filter／tree演算法 |
| DEV-070 kernel | typed host/profile/surface，Board使用集中式全域task menu | Goal與Board直接共用同一profile；任務名稱區只送出menu intent，presenter／catalog／guard／command不複製 |
| DEV-108 utility | per-task projector會逐task掃records，Task Details可include archived | 新增一次 batch index；不在 Goal per-row呼叫 |
| `useRecordStore.loadRecords` | 沒有 loaded scope／stale token；App `.finally()`把失敗也視為loaded | 補 exact-scope state與 request sequence，App移除local猜測 |
| DEV-117 working tree | continuity allowlist與meeting lifecycle都在record store；MainLayout已依賴同一store | 保留store ownership，只匯出pure predicate；不為consumer數量另建module |
| PWA／local test | durable view intent、owner surfaces、restore各有 allowlist | 所有 durable surfaces與task-drag owner surfaces加入goal |

## 5. Architecture and Authority

```text
View authority
  ModeSwitcher -> useBoardStore.currentView -> App -> GoalView

Task read model
  useWbsStore.nodes
    -> projectTaskFilterResults(active board)
    -> buildHierarchicalTaskItems(primary DFS + local collapse)

Record read model
  App -> useRecordStore.loadRecords(exact workspace/board)
      -> recordService.listByProject (existing API)
      -> RecordListLoadState / stale-token guard
      -> projectMeetingTaskQuickNotesByTask

Presentation
  task rows + byTaskId(all valid notes) -> buildGoalSparseProjection -> semantic table

Interaction
  goal.row -> DEV-070 binding
    -> primary／Enter／Space -> task.open-details -> existing Task Details
    -> secondary／Shift+F10 -> task.open-menu -> existing GlobalContextMenu
                              -> Board-shared profile／catalog／guard／command

Meeting compatibility
  useRecordStore.isMeetingContinuityView -> start fallback / recovery normalization / live options
```

Authority rules：

- `useBoardStore` owns current view only；GoalView不得建立第二個 navigation state。
- `useWbsStore.nodes` owns canonical task；GoalView不得 clone／patch task。
- `useRecordStore` owns board-level record loaded truth；component不得直接呼叫 provider。
- `meetingTaskQuickNotes.ts` owns quick-note parse／aggregate provenance。
- `goalMode/projection.ts` owns presentation span only；不得讀 store或寫 DOM。
- `useRecordStore`同時擁有 meeting lifecycle 與 continuity classification；readonly set保持private，只匯出
  `isMeetingContinuityView()`供MainLayout使用，不建立無獨立生命週期的新module。
- `TaskDetailsModal`、task action catalog／guards／commands仍擁有 edit／menu action authority；GoalView只負責投影、
  planning controls、DnD layout，以及從任務名稱區送出 details／menu intent。

## 6. Pure Projection Contracts

### 6.1 All Meeting Index

```ts
type GoalRecordScope = Readonly<{ workspaceId: string; boardId: string }>;

type MeetingTaskQuickNoteIndex = Readonly<{
  byTaskId: ReadonlyMap<string, readonly MeetingTaskQuickNoteProjection[]>;
  invalidRecordIds: readonly string[];
}>;

projectMeetingTaskQuickNotesByTask(
  records: readonly EditableKnowledgeRecord[],
  scope: GoalRecordScope,
): MeetingTaskQuickNoteIndex;
```

Algorithm：

1. 一次迭代records；只接受 `workspaceId/boardId` exact match、`type='meeting'`、有persisted ID、
   `status !== 'archived'`。
2. 每record最多一次parse namespace、一次parse正文 candidates；namespace empty直接略過。
3. metadata invalid或任一entry無法符合aggregate anchor invariant時，整個record不投影，record ID加入去重警告；
   其他valid records保持可見。
4. entry text必須用canonical candidate text，不信任游離metadata text。
5. 每task保留全部有效 entry，依 `(occurredAt, recordId, entryId)` total order升冪排列；不依陣列順序或updatedAt猜測。
6. 時間 O(records+entries+candidates)，空間 O(entries+invalid records)；不得對每task重掃records。

### 6.2 Sparse Row Projection

```ts
type GoalProjectionInputRow = Readonly<{
  taskId: string;
  level: number;
  description: string | null;
  meeting: string | null;
}>;

type GoalOwnedCell<T> = Readonly<{
  ownerTaskId: string;
  rowSpan: number;
  content: T;
}>;

type GoalProjectionRow = GoalProjectionInputRow & Readonly<{
  descriptionCell: GoalOwnedCell<string> | null | 'covered';
  meetingCell: GoalOwnedCell<string> | null | 'covered';
}>;

buildGoalSparseProjection(rows: readonly GoalProjectionInputRow[]): Readonly<{
  rows: readonly GoalProjectionRow[];
  hasDescriptionColumn: boolean;
  hasMeetingColumn: boolean;
}>;
```

Rules：

- description先trim；空字串為null。meeting只依index presence。
- own content row是唯一owner；owner cell從自身向後跨連續可見rows。
- 第一個 `next.level <= owner.level` 表示離開owner subtree，停止。
- 第一個next own content是barrier，停止且由next成為新owner。
- owner subtree內不同child branches若全為空可連續跨越；離開subtree不可跨。
- barrier後不複製、不重新開始舊owner content；無owner的blank row輸出null結構性空cell。
- `covered` row不render `<td>`；owner以native `rowSpan`只render一次。
- description／meeting獨立運算；不得互相決定span。
- 兩欄皆無own content時兩欄都不render；只有一欄時取得內容區全寬。
- pure、immutable、O(rows)；filter/collapse/update後以新input重算，不保存span。

## 7. Exact-scope Record Load Contract

Store以單一判別狀態取代現有泛用`loading`；既有`error`只保留editor／save／meeting action，不再承載list load：

```ts
type RecordListLoadState =
  | Readonly<{ status: 'idle'; scopeKey: null; error: null }>
  | Readonly<{ status: 'loading'; scopeKey: string; error: null }>
  | Readonly<{ status: 'ready'; scopeKey: string; error: null }>
  | Readonly<{ status: 'error'; scopeKey: string; error: string }>;

recordListLoad: RecordListLoadState;
createRecordScopeKey(workspaceId: string, boardId: string): string;
loadRecords(workspaceId: string, boardId: string): Promise<void>;
resetRecordList(): void;
```

Transition matrix：

| Event | records | `recordListLoad` |
|---|---|---|
| load(A) start | `[]` | `{ status:'loading', scopeKey:A, error:null }` |
| current A success | response A | `{ status:'ready', scopeKey:A, error:null }` |
| current A failure | `[]` | `{ status:'error', scopeKey:A, error:message }` |
| load(B) while A pending | `[]` | `{ status:'loading', scopeKey:B, error:null }` |
| stale A settle after B | unchanged B state | unchanged B state |
| reset/logout/no board | `[]` | `{ status:'idle', scopeKey:null, error:null }` |

`createRecordScopeKey`由store export並使用無歧義tuple encoding（例如`JSON.stringify([workspaceId, boardId])`）；
App、Goal與store不得各自拼接不同字串。Implementation以module-local monotonically increasing sequence或等價token淘汰stale settle；`resetRecordList()`亦使
pending token失效。`App.tsx`移除local `recordsLoadedScope`與`.finally()`成功推測；meeting recovery只在
`recordListLoad.status === 'ready'`且scope exact match時開始判斷。Goal、RecordsView與RecordSidebar的list loading／
error只讀`recordListLoad`；泛用`error`繼續只服務editor／save／meeting action，兩者不得互相覆寫。Provider、record
schema、snapshot不變。

## 8. GoalView Render Contract

### 8.1 Input and hierarchy

- 讀取active workspace／board、WBS nodes/loading/error、filter state、record exact-scope state、board members。
- `projectTaskFilterResults(nodes, filters, { boardId })`產生visible IDs。
- `buildHierarchicalTaskItems({ nodes, parentNodesIndex, activeBoardId: boardId, visibleTaskIds, collapsedIds })`
  產生primary DFS rows；`parentNodesIndex`直接取自`useWbsStore`，不在component另建第二份tree authority。
- 不注入tracking projection；task `boardId !== activeBoardId`不render。
- owner controls沿用`TaskAssignmentPicker`與現有board member mapping；editor依既有permission可指派，viewer為disabled；
  無owner時顯示既有「未指派」。OKR trigger隱藏裝飾性Users icon但保留文字、下拉、鍵盤與aria；List維持原icon。
  Table使用portal variant，避免跨列或後續row遮蔽浮層。
- status沿用`normalizeTaskStatus`／`TASK_STATUS_LABELS`，文字不可只靠顏色。

### 8.2 Semantic table

欄順序固定為：`任務名稱（以縮排與收合表達層級與已啟用標籤）`、`任務目的?`、`會議紀錄?`、`負責人`、
`狀態`、`開始日期?`、`結束日期`、`工期(天)`。內容欄依
projection／record state動態存在；不能render空header、空toolbar、教學卡或列內新增action。正常狀態不顯示
`L1`／`L2`／`L3+`文字標籤，避免額外一行佔用列高；task button以accessible name保留層級資訊。

Task identity每row都有自己的button與focus target；collapse是獨立button。rowSpan content cell不得覆蓋task
identity hit target、tab order或editable boundary。全文以保留換行、可換行／break-word方式顯示，不用hover藏資訊。
meeting顯示本地化 `MM/DD` 加原文，不稱作「決議」。

- table使用`width:100%`與fixed layout；任務名稱252px（相較原360px減少30%）、任務目的與會議紀錄各220px、負責人150px、狀態90px、
  日期各130px、工期80px；內容欄不存在時不保留寬度。814px桌機窄版以單一水平捲動保留可編輯欄位，任務欄sticky；
  description／meeting文字wrap，不以ellipsis隱藏內容。
- UI欄名將既有`TaskNode.description`投影為「任務目的」，全部合格人工補記投影為「會議紀錄」；資料欄位與編輯流程不變。
- 表頭、資料cell與每一列保留低對比完整格線（欄間、列間與外框）；格線只作欄位／rowSpan跨度的視覺定位，不新增欄位、
  文字或互動，且不得覆蓋task identity、keyboard或editable boundary。rowSpan 仍保有語意，列間線只補足閱讀定位。
- 各欄表頭文字直接作為`th`內容，不包覆額外的flex／裝飾性UI容器；sticky、深色底、白字、欄位ID與a11y語意仍由`th`本身承擔。
- 欄位表頭在主內容根節點垂直捲動時固定於`top:0`；每個`th`皆使用不透明深色底、白字與可辨識分隔線，避免資料內容
  穿透。任務名稱表頭同時固定`left:0`並使用高於其餘表頭／第一欄資料cell的交會層級，水平與垂直捲動均不得錯層。
- rowSpan owner cell 只包覆一層必要的內容容器（`data-goal-content-scroll="true"`）；目的／會議紀錄文字仍由語意
  `td` 擁有，容器以 `rowSpan × 32px` 為最大可視高度、`overflow-y:auto`、換行與斷字，長內容只在欄內捲動，
  不把下方任務往下推。空白／covered cell 不建立容器。
- 表頭與資料列必須落在同一個 native table grid；左右外框、第一／最後欄及欄間分隔線在桌機窄版仍共用同一組
  column tracks，不得因 sticky 表頭、水平捲動或 rowSpan 產生視覺錯位。
- 目標表格直接掛在目標模式主內容面，不再包覆卡片式 overflow／border／shadow 容器；主內容根節點承擔唯一捲動邊界。
  任務名稱採直接文字節點；目的／會議紀錄僅在 owner cell 內使用一層必要Y軸捲動容器，保留 task button、換行與可存取名稱。
- 目標模式不建立重複的頁內標題／說明 header；正常狀態由既有「視角」選擇與語意表頭辨識目前內容，表格直接銜接
  全域 topbar。`清除篩選`僅在篩選結果為零的空白狀態就地顯示，不得以常駐 header 保留空間。
- 每個task identity cell用`<th scope="row" id="goal-task-<safe-id>">`；column headers有固定ID。content owner cell的
  `headers`同時指向自己的column header與owner task row header，即使`rowSpan>1`也只宣告真實owner。
- raw task ID不得直接未escape拼入CSS selector；DOM id使用React `useId`前綴加安全mapping或等價唯一encoding，
  另以`data-goal-task-id`保存原identity供evidence。

若screen reader／keyboard驗證不能可靠辨識rowSpan owner，唯一fallback是相同資料、欄位自動隱藏、blank row
最小化，但 `rowSpan=1`；不得增加helper文字、複製父文或改資料模型。

### 8.3 State matrix

| State | Required | Forbidden |
|---|---|---|
| task loading | 一個主區skeleton | stale task tree、empty宣告 |
| task error | 一個可見可恢復error；不render stale tree | 以空看板代替 |
| true empty | 最短「目前沒有任務」狀態 | OKR教學卡、＋說明／＋紀錄 |
| filtered zero | 既有filter-zero與reset | 將filters清空或顯示true empty |
| records loading | meeting欄存在，一個欄級loading；task/description可讀 | 提前隱藏meeting欄 |
| records load error | meeting欄存在，一個error＋retry | 每列error、把error當absent |
| partial invalid | valid highlights照常，一個compact warning | 顯示invalid text或清空全部valid結果 |
| both content absent | 只留task與planning controls的compact table | 空內容欄、placeholder、固定高列 |
| one content column | 唯一內容欄吃滿內容寬度 | 保留另一空欄 |

Stable evidence attributes：

- `data-goal-view="true"`
- `data-goal-task-row="true"`、`data-goal-task-id`
- `data-goal-column="description|meeting"`
- `data-goal-description-owner`、`data-goal-meeting-owner`
- `data-goal-span`
- `data-goal-record-state="loading|error|partial|ready|empty"`

Attributes只供觀測，不得成為production資料或互動authority。

## 9. Interaction Contract

新增 `TaskHostMode='goal'`、`TaskInteractionSurfaceId='goal.row'`。goal host profile：

| Trigger | Binding |
|---|---|
| pointer.primary／pointer.double／gesture.tap | `task.open-details` |
| keyboard.enter／keyboard.space | `task.open-details` |
| pointer.secondary／keyboard.shift-f10 | `task.open-menu` |
| gesture.long-press | 不適用；第一版 mobile goal blocked |
| task.post-create | `disabled` |
| menu | 與 Board 使用完全相同的 profile、action catalog、permission／capability guards及 `GlobalContextMenu` presenter |

Goal row用 `useTaskPlacementController`與 `surfaceId='goal.row'` 取得 details binding、permission 與 sortable state；
不得自行繞過 interaction kernel 或 permission。primary／double／Enter／Space仍開同一 Task Details，關閉後焦點回原
task identity；右鍵與 `Shift+F10` 從任務名稱 identity surface 開啟既有全域 task menu，選單內容與可執行性由看板
共用 profile、catalog及guards決定。handler不得掛到planning form controls或rowSpan內容cell，避免攔截原生右鍵／表單操作。
桌機可由任務名稱 cell 啟動 primary placement DnD；表單控制必須由 Smart sensors 排除，避免編輯時誤拖。
Viewer只讀；editor依既有 `canEditTask`／`canAssignTask`／`canMoveTask` guard修改 canonical task。

### 9.1 Cross-mode component boundary

| 能力 | List | OKR | 共用邊界 |
|---|---|---|---|
| 階層縮排／展開箭頭 | recursive Grid row | flat DFS Table row | 共用 `TaskHierarchyIndentedRow` 與 `--task-hierarchy-indent` |
| 進度條／百分比 | List task cell | 不呈現 | 不進入共用 `TaskHierarchyIndentedRow`；由 List presenter 自有既有 store／selector |
| 標籤 | List task cell | OKR task cell | 不新增共用 wrapper；各 presenter組合既有 store／selectors |
| 負責人／狀態／日期／工期 | List grid controls（含負責人 icon） | OKR table cells（負責人不顯示裝飾 icon） | 可直接使用既有 picker／style utility；以 `showIcon` 控制裝飾訊號，不共用整列 layout |
| 拖曳 | recursive placement tree | visible primary DFS rows | 共用既有 permission／sortable primitives；各模式自行擁有 DnD layout與commit handler |
| 任務右鍵選單 | Board card identity | OKR task-name identity | 共用 `useTaskPlacementController`、相同 profile、`GlobalContextMenu`／`TaskActionMenu`、catalog／guards／commands |
| 會議補記列 | Task Details 歷程區 | OKR owner cell 內歷程 | 共用無狀態 `MeetingQuickNoteRows`（日期＋內容）；各 surface 自己決定 Y 軸邊界、展開與新增入口 |
| 內容表面 | Task Details 備註欄 | Task Details 會議歷程 | 共用 `TaskNoteContentSurface` 的邊框／圓角／內距／scrollbar 視覺基礎；編輯與唯讀語意分離 |

Goal 不嵌入 `WbsNodeItem`：該元件同時遞迴render children與List columns，會破壞 native `rowSpan`、table semantics
及單一 DFS row ownership。這是 layout boundary，不是產品能力差異。

## 10. Navigation／Mobile／Meeting／PWA

- desktop非meeting：ModeSwitcher顯示「OKR模式」與Target icon；internal value 仍為 `goal`，可正常進出且 active board/filter 不重建。
- ModeSwitcher 開啟後直接呈現模式選項，不顯示重複的「切換模式」標題列或關閉叉號；`role="menu"`保留非視覺名稱，
  並以再次點擊 trigger、外部點擊與 Escape 關閉。Escape 關閉後焦點回到 trigger。
- mobile/coarse pointer：goal加入blocked views；不顯示entry。若persisted view為goal，active board ready後正規化Board。
- live meeting：options由record store匯出的`isMeetingContinuityView`過濾，顯示六個continuity views並包含goal；goal沿用既有menuitemradio與切換行為。
- 從goal開始meeting：store-owned predicate保留current goal，再建立既有meeting session。
- recovery若current goal：store內以同一predicate保留goal並restore既有snapshot；draft ID／segment／snapshot schema不改。
- `MEETING_CONTINUITY_VIEWS`保持`useRecordStore.ts`私有；MainLayout只import predicate，不得另寫array。consumer數量本身不構成新module責任。
- PWA durable intent、APP_SURFACES與local-test restorable views加入goal；desktop Goal DnD啟用後，PWA `task-drag`
  owner surfaces亦加入goal。mobile Goal仍blocked，不新增touch action surface。

## 11. File Surface

### 11.1 Add

- `src/components/GoalView.tsx`
- `src/components/Wbs/TaskHierarchyIndentedRow.tsx`
- `src/features/goalMode/projection.ts`
- `src/components/TaskNotes/MeetingQuickNoteRows.tsx`
- `src/components/TaskNotes/TaskNoteContentSurface.tsx`
- `scripts/verify-dev-116-goal-mode.ts`
- `scripts/verify-dev-116-goal-mode-browser.pw.js`
- 本SPEC與QA-DEV-116

### 11.2 Modify

- `src/types/index.ts`
- `src/App.tsx`
- `src/components/MainLayout.tsx`
- `src/components/Wbs/WbsNodeItem.tsx`
- `src/components/Wbs/WbsListView.tsx`
- `src/components/ui/ModeSwitcher.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Records/RecordsView.tsx`
- `src/components/Records/RecordSidebar.tsx`
- `src/store/useBoardStore.ts`
- `src/store/useRecordStore.ts`
- `src/interactions/task/types.ts`
- `src/interactions/task/profiles.ts`
- `src/interactions/task/TaskInteractionScope.tsx`
- `src/interactions/task/resolveTaskInteraction.ts`
- `src/utils/meetingTaskQuickNotes.ts`
- `src/services/pwaReloadOwnerManifest.ts`
- `src/services/pwaUpdateService.ts`
- `src/utils/localTestEnvironment.ts`
- `src/components/TaskNotes/TaskDetailNoteEditor.tsx`
- `src/components/TaskNotes/TaskMeetingQuickNoteSection.tsx`
- `scripts/verify-dev-039-task-filter-core.mjs`
- `scripts/verify-dev-117-cross-mode-meeting-continuity.ts`
- `package.json`
- `ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、SPEC-117、ADR-049、QA-DEV-117

### 11.3 Inspect-only／Protected

- `src/components/TaskDetailsModal.tsx`與既有 TaskNotes editor 的資料、編輯、權限與高度語意；允許
  `TaskDetailNoteEditor` 引用共用 `TaskNoteContentSurface` 視覺基礎，`TaskMeetingQuickNoteSection` 以同一表面元件呈現唯讀歷程，
  不改新增／展開／封存語意
- `src/components/GlobalContextMenu.tsx`、task action catalog／executor
- taskTracking feature
- record provider adapters、schema／migration／RLS、recovery snapshot serializer
- DEV-109 capture utilities、DEV-105 reservation presenters
- `src/index.css`（預期無需全域override）

新增產品檔案或修改protected surface前必須停止回規劃；純import／type mechanical dependency也需先記錄到DEV。

## 12. Work Packages

1. **WP-116-A Failing contracts**：static/pure verifier先證明current code未滿足goal、scope loader、batch index、
   sparse、interaction、mobile／meeting／PWA contract。
2. **WP-116-B Read authorities**：single discriminated record-list state＋stale token＋reset、App recovery truth、
   existing record-list consumers、batch quick-note projector、store-owned exported meeting predicate。
3. **WP-116-C Projection/presenter**：sparse projector、goal profile/surface、GoalView table／state／a11y fallback。
4. **WP-116-D Navigation compatibility**：ViewMode、App、MainLayout、Sidebar、persistence、PWA、local-test、
   DEV-039／117 regressions與文件amendment。
5. **WP-116-E Candidate gate**：static、regressions、tsc、lint、build、diff/protected gate；freeze SHA／dirty boundary。
6. **WP-116-F Interaction parity amendment**：共用階層 display primitive；Goal 自有 tag／planning cells、
   desktop sortable rows與既有 permission guards；同步PWA task-drag surface。
7. **WP-116-G Targeted QA/QC**：正常入口、functional／mutation／DnD／failure／a11y／viewport／mobile／meeting證據。
8. **WP-116-H Context-menu parity amendment**：Goal task-name surface接入既有menu binding；Board／Goal共用同一profile與
   全域presenter，驗證右鍵、`Shift+F10`、Escape、action IDs、permission guards及0 unintended write。

Model discretion：局部component拆分、CSS utility、fixture／helper命名、internal compare helper與不改I/O的type alias。

Model禁止決定：產品scope、手機／tracking、完整records主畫面、eligibility／tie-break、schema/API/
permission、Task Details、barrier semantics、資料繼承、stale scope容忍或user-owned dirty change覆寫。

## 13. Acceptance Criteria

- AC-116-01：desktop正常topbar「視角」可發現／進入goal；mobile DOM中goal option=0；desktop live meeting仍可見goal option。
- AC-116-02：L1／L2／L3+欄位資格相同；own description／meeting各自正確，層級不限制details entry。
- AC-116-03：description+meeting、description-only、meeting-only、both-empty、parent-empty五矩陣符合契約。
- AC-116-04：owner span只跨連續可見descendant blanks；own-content與subtree boundary中斷；filter／collapse／
  live update重算，兩欄獨立且不複製owner text。
- AC-116-05：兩內容欄全空時DOM中兩欄／header=0；一欄存在時另一欄=0且剩餘欄取得內容寬度。
- AC-116-06：空白row無placeholder、空框、固定高列、可見L1／L2／L3+標籤或「＋說明／＋紀錄」，仍可點task
  identity開Details；階層由縮排、收合狀態與DOM語意保留。
- AC-116-07：每task顯示全部 persisted non-archived valid DEV-108 entries，依 `(occurredAt, recordId, entryId)` deterministic 排序；draft／archived／
  legacy／AI／activity／general task-link／RAG=0。
- AC-116-08：record request count不隨task rows增加；Goal的task write只可由本 amendment 的 editor／DnD或使用者明確
  執行的既有context-menu command產生；
  初始render與List進度／標籤讀取仍為0 write，record／task-link writes始終為0；Goal不因隱藏進度指示而新增任何讀取或寫入。
- AC-116-09：scope A→B快速切換不顯示A records；stale A settle不覆蓋B；load failure不被當loaded，retry可恢復。
- AC-116-10：單一invalid record只產生一個warning，valid records仍顯示；invalid text不進UI。
- AC-116-11：goal row pointer／Enter／Space開同一Task Details，關閉焦點返回；editor可操作負責人／狀態／日期／工期，
  且控制操作不誤開Details、menu或誤啟動拖曳；任務名稱右鍵／`Shift+F10`開既有全域task menu，Escape正常關閉，
  repeated description hover仍為0。
- AC-116-12：viewer readonly與editor existing guard正確；所有層級皆可日後在Details補寫own content。
- AC-116-13：tracking references在goal=0，既有views的tracking identity／permission／interaction不退化。
- AC-116-14：goal start meeting保留goal；live options包含goal且可切入／切出；persisted goal recovery保留goal，
  draft／segment／recovery identity不變。
- AC-116-15：PWA generic owners與task-drag owner皆涵蓋goal；durable view intent可解析goal。
- AC-116-16：1440×900、1024×768，以及先以1440×900建立desktop view後套200% zoom，均無overlap／不可讀／
  非預期水平overflow；390×844無goal entry。Zoom case不得因測試先用窄CSS viewport而誤測成mobile normalization。
- AC-116-17：keyboard focus order與DFS task order一致；screen reader能辨識content owner。無法證明時採no-rowspan fallback。
- AC-116-18：browser console／page／HTTP／visible-error arrays為0，critical fixture counts非0；runtime cleanup完成。
- AC-116-19：任務名稱欄與 List 共用階層縮排元件；List 保留 shared 6px depth step，Goal 依 SPEC-121 R17
  使用局部 10.4px（8px × 1.3）compact wired-tree step、無 endpoint、柔和 connector 與樹線左側 disclosure slot。List 保留進度條／百分比，Goal 不呈現進度指示但顯示啟用中的標籤，
  且不限制 L1／L2／L3+ 欄位資格。
- AC-116-20：editor可在Goal修改負責人、狀態、開始／結束日期與工期，並拖曳同層或跨層 primary placement；
  所有操作寫回canonical task後List可見同一結果。Viewer無上述mutation能力。
- AC-116-21：Board／Goal取得同一份host profile，Goal不建立第二套menu DOM／action resolver；右鍵與`Shift+F10`
  顯示Board同組task actions，permission／capability guards與command executor維持唯一authority，開關menu不產生write。
- AC-116-22：OKR每一欄表頭皆為固定頂部欄、深色不透明底與白字；垂直捲動時表頭位置維持不變而資料列正常移動，
  任務名稱左上交會格同時維持水平凍結，格線與既有欄位語意不退化。
- AC-116-23：OKR負責人欄不顯示裝飾性 `Users` trigger icon，但文字、下拉、鍵盤、aria與協作提示仍可用；清單模式
  保留負責人 trigger icon，兩模式使用同一 `TaskAssignmentPicker` contract。
- AC-116-24：任務目的／會議紀錄 owner cell 僅建立一層 `data-goal-content-scroll="true"` 內容容器，最大高度依
  `rowSpan × 32px`，超出時使用 `overflow-y:auto`；文字仍屬於語意 `td`，空白／covered cell不建立容器，並保留換行、
  斷字、rowSpan、格線與 keyboard／screen-reader table 語意。
- AC-116-25：在1298px參考桌機視窗，表頭第一／最後cell、第一資料列第一／最後cell與table左右外框的邊界差異皆不超過1px；
  水平／垂直捲動後欄線仍由同一個table grid對齊，不新增外層同步容器。

## 14. Verification and Evidence

Required commands：

```text
npm run verify:dev-116-goal-mode
npm run verify:dev-116-goal-mode-browser
npm run verify:dev-039-task-filter-core
npm run verify:dev-070-interaction-kernel
npm run verify:dev-097-pwa-safe-reload
npm run verify:dev-108-task-meeting-note-persistent-list
npm run verify:dev-114-task-description-global-surfaces
npm run verify:dev-115-blank-task-creation
npm run verify:dev-117-cross-mode-meeting-continuity
npm run verify:dev-117-cross-mode-meeting-continuity-browser
npx tsc --noEmit
npx eslint <DEV-116 changed TS/TSX files>
npm run build:test
git diff --check -- <DEV-116 owned files>
```

Artifacts：

- `output/playwright/dev-116-goal-mode/static-result.json`
- `output/playwright/dev-116-goal-mode/result.json`
- `output/playwright/dev-116-goal-mode/*.png`

Browser必須從topbar正常入口操作，不得用direct store mutation代替交付路徑；fixture可透過local-test owner建立。
每個case記錄source revision／dirty boundary、actor、route、fixture IDs、viewport、steps、request/mutation counts、
state probe、screenshots、error arrays、server PID／port／cleanup。QC在frozen candidate後唯讀執行。

## 15. Failure Recovery and Stop Conditions

- task load error不render stale tree；record load error保留meeting column error＋exact-scope retry。
- scope switch或logout立即`resetRecordList()`並invalidate pending request；不得fallback跨板cache。
- invalid metadata隔離record；不修復、不寫回、不從正文猜測或補造會議內容。
- save/archive/reload後只由canonical store reload/reprojection更新；Goal不做optimistic record patch。
- a11y rowSpan失敗採no-rowspan fallback；不複製父文或加helper補救。

命中任一項立即停止並回送PM／規劃模型：

1. 需要新schema、migration、provider query、RLS／permission、metadata或cross-board read。
2. 需要per-row `listByNode`、includeArchived board load或request count隨rows增加。
3. 需要資料繼承／copy才能完成merge視覺，或必須修改Task Details/editor/save。
4. 需要把goal加入mobile或tracking才能成立。
5. 需要修改全域選單presenter、public action semantics、recovery snapshot或capture aggregate；僅把Goal接入既有
   `GlobalContextMenu`與Board profile不視為修改protected implementation。
6. 無法淘汰stale records、無法區分error與empty，或invalid source會污染valid結果。
7. rowSpan遮蔽task identity／keyboard或screen reader ownership且fallback也不能通過。
8. user-owned dirty changes無法以小patch安全保留，或文件／程式出現未記錄架構衝突。
9. 必要browser path出現4xx／5xx、visible error、critical fixture count=0或無法清理task-owned runtime。

## 16. Architecture Closure Review

- Source revision：branch `持續優化3`，HEAD `a7510fcbb1f8793fe8ea3cb2a37a7b07f4371286`；review包含當前dirty tree。
- Dirty overlap：MainLayout、Sidebar、TaskDetails、RecordStore、package與DEV-117文件／verifier已有user-owned變更；
  實作前逐檔`git diff`，禁止整檔restore。
- Architecture decisions：authority、dependency direction、pure I/O、record race、view state、interaction、meeting
  compatibility、layout fallback、failure recovery、file surface、work order、acceptance、evidence、stop conditions已鎖定。
- Data／API／permission／schema／migration：不變。
- P0／P1 unresolved readiness blockers：0。
- 結論：架構定案且已完成 local implementation；DEV-116 static／browser targeted QA-QC PASS，保留未要求的
  production、remote provider、deploy、commit、push與release boundary。

### 16.1 RD Tech Lead R2 Optimization Findings

| Finding | 原風險 | 已定案的最小修正 |
|---|---|---|
| meeting policy另建module | 只因consumer變多就增加抽象與file surface | readonly set留在lifecycle owner；只匯出pure predicate |
| record load使用多個平行scalar | loaded／loading／error可形成不一致狀態，泛用error又混入editor failure | 單一discriminated `RecordListLoadState`，並遷移三個既有consumer |
| sparse input攜帶`parentId` | projector實際只用DFS `level`，多一份結構訊號易產生第二套tree判斷 | 移除`parentId`；hierarchy validity仍由既有builder擁有 |
| 相鄰browser suites全量重跑 | Medium UI變更的時間成本過高且與DEV-116 browser重複 | 保留直接受影響static gates與DEV-117 lifecycle browser；新UI由DEV-116 browser完整舉證 |

## 17. Change Log

- 2026-09-10：建立SPEC-116，依actual repo完成Architecture Closure Review與RD Tech Lead收斂。
- 2026-09-10：將record loaded truth修正、batch quick-note index、pure sparse I/O、當時的details-only goal profile、
  meeting policy、desktop/mobile matrix、file surface、WP與evidence定案；未修改產品程式。
- 2026-09-10：RD Tech Lead R2移除無獨立責任的meeting policy module、把三個record load scalars收斂成
  `RecordListLoadState`、移除sparse input冗餘`parentId`，並把回歸命令改成風險式最小集合；產品scope不變。
- 2026-09-10：完成 DEV-116 WP-116-A～F local implementation；新增 GoalView、O(rows) sparse projector、exact-scope
  record list state／batch meeting index與當時的details-only interaction，並完成 static P01～P25、browser B01～B11／V01～V18、
  targeted regressions、TypeScript、ESLint、build:test與diff check。表格補上完整低對比格線，供辨識欄位與rowSpan跨度；
  狀態更新為 `Implemented / Targeted QA-QC PASS / NOT RELEASED`。
- 2026-09-10（歷史基線，後由本日最新 UI 決策取代 Goal 進度呈現）：完成interaction parity amendment；List／Goal只共用layout-neutral `TaskHierarchyIndentedRow`，Goal自行
  組裝進度、標籤、負責人、狀態、日期、工期與desktop DnD。DEV-116 static 28/28、browser 37/37、DEV-039／046／
  053／070／097／117回歸、TypeScript、targeted ESLint與`build:test`皆PASS；狀態維持未Release。
- 2026-09-10：依最新使用者指示開放OKR任務名稱區right-click／`Shift+F10`，Board／Goal共用同一profile與既有
  `GlobalContextMenu`／`TaskActionMenu`、catalog／guards／commands；B05／B18／V22與0 unintended write通過。
- 2026-09-10：OKR欄位表頭改為固定頂部欄與深底白字；sticky責任落在每個`th`，左上任務名稱交會格同時固定top／left。
  Browser V23以47px實際捲動驗證表頭位移0.5px、資料列位移-47px，更新後browser 38/38 PASS。
- 2026-09-10：長目的／會議紀錄改由owner cell內的固定跨列高度內容層承擔Y軸捲動，避免長文字把下方任務往下推；V23
  以`scrollHeight=108`、`clientHeight=96`、`overflow-y:auto`及既有約32–33px列高完成驗證。
- 2026-09-10：最新使用者 UI 決策取代前一版 Goal 顯示進度邊界：進度條與百分比移出 Goal presenter，保留 List；
  `TaskHierarchyIndentedRow`維持layout-neutral，進度不進入共用階層元件。
- 2026-09-10：依最新使用者 UI 回饋移除表頭內層容器；所有欄名直接作為`th`文字，sticky／格線／a11y欄位語意不變。
- 2026-09-10：依最新使用者 UI 回饋將 OKR 任務名稱欄由360px縮為252px（減少30%），同步`colgroup`、表格最小寬度與drag overlay，其他欄位與階層互動不變；V24保存1298px參考視窗畫面。
- 2026-09-10：依最新使用者 UI 回饋移除 OKR 負責人欄的裝飾性 `Users` trigger icon；共用`TaskAssignmentPicker`新增
  `showIcon`可選顯示設定，List維持原icon，並以browser B12／B14驗證OKR隱藏、List保留與操作語意不變。
- 2026-09-10：依最新使用者 UI 回饋移除任務目的／會議紀錄 owner cell 的額外內容包裹層，文字直接由語意`td`承擔；
  保留 rowSpan／換行／格線與 table 語意，V23改驗證無巢狀內容容器。
- 2026-09-10：依最新使用者 UI 回饋補上表頭／資料列左右邊界對齊驗證；V24在1298px參考視窗量得表頭與第一資料列左右差異為0px、
  相對table外框僅0.5px的原生border-collapse抗鋸齒誤差，確認兩側共用同一組column tracks。
- 2026-09-11：依最新使用者 UI 回饋恢復任務目的／會議紀錄 owner cell 的最小內容容器與Y軸捲動；以 `rowSpan × 32px`
  限制可視高度，長內容 `scrollHeight=100`、`clientHeight=96` 時由欄內捲軸承接，避免下方任務被推開；更新V23驗證。
- 2026-09-11：依最新使用者差距分析，會議欄由每任務 latest-only 改為 exact scope 內全部有效補記；新增
  `projectMeetingTaskQuickNotesByTask` 批次索引與共用無狀態 `MeetingQuickNoteRows`，OKR owner cell 保留全部列並在超出
  `rowSpan × 32px` 時顯示欄內Y軸捲軸。DEV-116 browser fixture以兩筆會議紀錄、六筆補記驗證 40/40 PASS。
- 2026-09-11：依使用者 UI 回饋，Task Details 的會議歷程改用與備註欄相同的 `TaskNoteContentSurface`；編輯器與唯讀歷程共用視覺表面，
  仍各自保留編輯、格式化、展開與新增責任。
