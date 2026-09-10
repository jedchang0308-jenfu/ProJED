# SPEC-116：全層級目標模式與自適應留白閱讀

- 狀態：`Target Authority / RD Tech Lead Review R2 PASS / RD Implementation Ready / Architecture Confirmed / NOT IMPLEMENTED / NOT RELEASED`
- 日期：2026-09-10
- 對應 DEV：DEV-116
- QA authority：`ai-doc/qa/QA-DEV-116-goal-mode-adaptive-sparse-reading.md`
- 相容決策：`ai-doc/decisions/ADR-049-meeting-session-view-independence.md`、
  `ai-doc/specs/SPEC-117-cross-mode-meeting-session-continuity.md`
- 決策來源：`USER-20260909-OKR-GOAL-MODE-ADAPTIVE-SPARSE-LAYOUT`、
  `USER-20260910-REMOVE-INLINE-ADD-DESCRIPTION-RECORD-ACTIONS`、
  `USER-20260910-DEV116-MOBILE-RECORD-LAYER-DECISIONS`、
  `USER-20260910-DEV116-RD-CONTRACT-UPGRADE`、
  `USER-20260910-DEV116-ARCHITECTURE-CONFIRMATION`
- 風險：Medium（新 view、跨層級資料所有權、record scope、可存取性與 meeting 相容）
- 文件成熟度：`RD Implementation Ready`
- 架構定案：`已定案`

## 1. 成功結果

在桌機既有「視角」中加入「目標模式」，以 active board 的 canonical primary task tree 為主畫面，讓 L1、
L2、L3+ 任務都可直接閱讀自己的任務說明與最新一筆具 DEV-108 provenance 的人工會議補記。沒有內容的
欄位不以 placeholder、空框或固定高度競爭版面；父層內容可以在同一欄、同一 subtree 的連續空白可見列
使用 native row span，但只改 presentation，不形成資料繼承或編輯限制。

所有 task-linked records 仍在既有紀錄庫按需查閱；本期不新增完整聚合畫面。手機不提供 goal，live meeting
不把 goal 列為 continuity view。

使用思考習慣：#目的、#系統描繪、#效用理論

## 2. Human Decisions 與不可逆邊界

1. 每一層任務的欄位資格與編輯自由相同；層級只表示脈絡。
2. 不新增 Objective／KR schema、必填規則、分數或父子資料繼承。
3. description、meeting highlight 都可不存在；空白應讓出版面。
4. 不提供列內「＋說明／＋紀錄」。編輯只走既有 Task Details。
5. 第一版不開放手機 goal。
6. 主畫面只顯示最新合格 DEV-108 人工補記；其他 task-linked records 留在既有紀錄庫的次要資訊層。
7. 第一版只投影 active-board canonical primary placements；tracking references 不進 goal。
8. goal 不加入 DEV-117 live meeting continuity；start／recovery fallback Board，live option set 不含 goal。

上述任何一項改變都不是實作模型的局部決定，必須回 PM／規劃模型。

## 3. Scope

### 3.1 In Scope

- desktop topbar ModeSwitcher 的 goal option、view persistence與正常 restore。
- L1／L2／L3+ primary task DFS hierarchy、現行 task filter與本地 collapse。
- own description、latest valid meeting quick note、status、board assignee labels。
- 兩內容欄獨立 auto-collapse、own-content barrier、native table `rowSpan`與 a11y fallback。
- details-only task interaction；viewer／editor沿用既有 Task Details permission。
- exact workspace×board records loaded truth、scope switch clear、stale response isolation、retry。
- mobile／live meeting／tracking／unsupported record negative behavior。
- PWA durable view intent與owner manifest相容；task-drag owner仍不含 goal。

### 3.2 Out of Scope

- 結構化 OKR、目標評分、KR進度、對齊圖、必填或自動生成內容。
- inline editor、create、DnD、context mutation、quick add、第二個 detail drawer。
- 手機 goal、mobile-specific layout、live meeting goal continuity。
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
| DEV-070 kernel | typed host/profile/surface，default menu為mutation-capable | 新增 details-only goal profile並明確關閉secondary/menu |
| DEV-108 utility | per-task projector會逐task掃records，Task Details可include archived | 新增一次 batch index；不在 Goal per-row呼叫 |
| `useRecordStore.loadRecords` | 沒有 loaded scope／stale token；App `.finally()`把失敗也視為loaded | 補 exact-scope state與 request sequence，App移除local猜測 |
| DEV-117 working tree | continuity allowlist與meeting lifecycle都在record store；MainLayout已依賴同一store | 保留store ownership，只匯出pure predicate；不為consumer數量另建module |
| PWA／local test | durable view intent、owner surfaces、restore各有 allowlist | 所有 durable surfaces加goal；task-drag清單不加 |

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
      -> projectLatestMeetingTaskQuickNotesByTask

Presentation
  task rows + latestByTaskId -> buildGoalSparseProjection -> semantic table

Interaction
  goal.row -> DEV-070 profile -> task.open-details -> existing Task Details

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
- `TaskDetailsModal`與既有 commands仍擁有 edit／permission；GoalView只讀。

## 6. Pure Projection Contracts

### 6.1 Latest Meeting Index

```ts
type GoalRecordScope = Readonly<{ workspaceId: string; boardId: string }>;

type LatestMeetingTaskQuickNoteIndex = Readonly<{
  latestByTaskId: ReadonlyMap<string, MeetingTaskQuickNoteProjection>;
  invalidRecordIds: readonly string[];
}>;

projectLatestMeetingTaskQuickNotesByTask(
  records: readonly EditableKnowledgeRecord[],
  scope: GoalRecordScope,
): LatestMeetingTaskQuickNoteIndex;
```

Algorithm：

1. 一次迭代records；只接受 `workspaceId/boardId` exact match、`type='meeting'`、有persisted ID、
   `status !== 'archived'`。
2. 每record最多一次parse namespace、一次parse正文 candidates；namespace empty直接略過。
3. metadata invalid或任一entry無法符合aggregate anchor invariant時，整個record不投影，record ID加入去重警告；
   其他valid records保持可見。
4. entry text必須用canonical candidate text，不信任游離metadata text。
5. 每task依 `(occurredAt, recordId, entryId)` total order取最大；不依陣列順序或updatedAt猜測。
6. 時間 O(records+entries+candidates)，空間 O(tasks+invalid records)；不得對每task重掃records。

### 6.2 Sparse Row Projection

```ts
type GoalProjectionInputRow = Readonly<{
  taskId: string;
  level: number;
  description: string | null;
  meeting: MeetingTaskQuickNoteProjection | null;
}>;

type GoalOwnedCell<T> = Readonly<{
  ownerTaskId: string;
  rowSpan: number;
  content: T;
}>;

type GoalProjectionRow = GoalProjectionInputRow & Readonly<{
  descriptionCell: GoalOwnedCell<string> | null | 'covered';
  meetingCell: GoalOwnedCell<MeetingTaskQuickNoteProjection> | null | 'covered';
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
- owner labels以`getTaskAssigneeIds`與現有board member display mapping，只讀顯示；無owner時顯示最短中性符號，
  不提供assign action。
- status沿用`normalizeTaskStatus`／`TASK_STATUS_LABELS`，文字不可只靠顏色。

### 8.2 Semantic table

欄順序固定為：`任務／層級`、`任務說明?`、`近期會議補記?`、`狀態`、`負責人`。內容欄依projection／
record state動態存在；不能render空header、空toolbar、教學卡或列內新增action。

Task identity每row都有自己的button與focus target；collapse是獨立button。rowSpan content cell不得覆蓋task
identity hit target、tab order或editable boundary。全文以保留換行、可換行／break-word方式顯示，不用hover藏資訊。
meeting顯示本地化 `MM/DD` 加原文，不稱作「決議」。

- table使用`width:100%`與fixed layout；task identity約28%且不得小於可辨識寬度，status約96px、owner約140px，
  剩餘寬度由存在的content columns均分；只有一欄時吃滿剩餘區。文字wrap，不能以ellipsis隱藏description／meeting。
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
| both content absent | 只留task/status/owner compact table | 空內容欄、placeholder、固定高列 |
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
| pointer.secondary／keyboard.shift-f10／gesture.long-press | `disabled` |
| task.post-create | `disabled` |
| menu | exclude all mutation actions；resolved menu count=0 |

Goal row用 `useTaskInteractionBinding`與 `surfaceId='goal.row'`，不得自行dispatch open-details event、不得掛
`data-task-surface-source="true"`、不得接DnD sensors或GlobalContextMenu。關閉Task Details後焦點回原task identity；
viewer可進readonly details，editor是否可改仍由既有guard決定。

## 10. Navigation／Mobile／Meeting／PWA

- desktop非meeting：ModeSwitcher顯示「目標模式」與Target icon，可正常進出，active board/filter不重建。
- mobile/coarse pointer：goal加入blocked views；不顯示entry。若persisted view為goal，active board ready後正規化Board。
- live meeting：options由record store匯出的`isMeetingContinuityView`過濾，只顯示五個continuity views；goal不是disabled item，DOM為0。
- 從goal開始meeting：store-owned predicate先`setView('board')`，再建立既有meeting session。
- recovery若current goal：store內以同一predicate正規化Board，再restore既有snapshot；draft ID／segment／snapshot schema不改。
- `MEETING_CONTINUITY_VIEWS`保持`useRecordStore.ts`私有；MainLayout只import predicate，不得另寫array。consumer數量本身不構成新module責任。
- PWA durable intent、APP_SURFACES與local-test restorable views加入goal；PWA task-drag surfaces不加入goal。

## 11. File Surface

### 11.1 Add

- `src/components/GoalView.tsx`
- `src/features/goalMode/projection.ts`
- `scripts/verify-dev-116-goal-mode.ts`
- `scripts/verify-dev-116-goal-mode-browser.pw.js`
- 本SPEC與QA-DEV-116

### 11.2 Modify

- `src/types/index.ts`
- `src/App.tsx`
- `src/components/MainLayout.tsx`
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
- `scripts/verify-dev-039-task-filter-core.mjs`
- `scripts/verify-dev-117-cross-mode-meeting-continuity.ts`
- `package.json`
- `ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、SPEC-117、ADR-049、QA-DEV-117

### 11.3 Inspect-only／Protected

- `src/components/ui/ModeSwitcher.tsx`
- `src/components/TaskDetailsModal.tsx`與TaskNotes
- `src/components/GlobalContextMenu.tsx`、task action catalog／executor
- `src/components/Wbs/WbsListView.tsx`、taskTracking feature
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
6. **WP-116-F Targeted QA/QC**：正常入口、functional／failure／performance／a11y／viewport／mobile／meeting證據。

Model discretion：局部component拆分、CSS utility、fixture／helper命名、internal compare helper與不改I/O的type alias。

Model禁止決定：產品scope、手機／tracking／live meeting、完整records主畫面、eligibility／tie-break、schema/API/
permission、Task Details與editor、barrier semantics、資料繼承、stale scope容忍或user-owned dirty change覆寫。

## 13. Acceptance Criteria

- AC-116-01：desktop正常topbar「視角」可發現／進入goal；mobile與live meeting DOM中goal option=0。
- AC-116-02：L1／L2／L3+欄位資格相同；own description／meeting各自正確，層級不限制details entry。
- AC-116-03：description+meeting、description-only、meeting-only、both-empty、parent-empty五矩陣符合契約。
- AC-116-04：owner span只跨連續可見descendant blanks；own-content與subtree boundary中斷；filter／collapse／
  live update重算，兩欄獨立且不複製owner text。
- AC-116-05：兩內容欄全空時DOM中兩欄／header=0；一欄存在時另一欄=0且剩餘欄取得內容寬度。
- AC-116-06：空白row無placeholder、空框、固定高列或「＋說明／＋紀錄」，仍可點task identity開Details。
- AC-116-07：每task只顯示latest persisted non-archived valid DEV-108 entry；tie-break deterministic；draft／archived／
  legacy／AI／activity／general task-link／RAG=0。
- AC-116-08：record request count不隨task rows增加；Goal為0 task／record／task-link writes。
- AC-116-09：scope A→B快速切換不顯示A records；stale A settle不覆蓋B；load failure不被當loaded，retry可恢復。
- AC-116-10：單一invalid record只產生一個warning，valid records仍顯示；invalid text不進UI。
- AC-116-11：goal row pointer／Enter／Space開同一Task Details，關閉焦點返回；secondary/menu/DnD/inline/create/
  repeated hover均為0。
- AC-116-12：viewer readonly與editor existing guard正確；所有層級皆可日後在Details補寫own content。
- AC-116-13：tracking references在goal=0，既有views的tracking identity／permission／interaction不退化。
- AC-116-14：goal start meeting先回Board；live options不含goal；persisted goal recovery正規化Board且draft／segment/
  recovery identity不變。
- AC-116-15：PWA generic owners涵蓋goal、task-drag owner不涵蓋goal；durable view intent可解析goal。
- AC-116-16：1440×900、1024×768，以及先以1440×900建立desktop view後套200% zoom，均無overlap／不可讀／
  非預期水平overflow；390×844無goal entry。Zoom case不得因測試先用窄CSS viewport而誤測成mobile normalization。
- AC-116-17：keyboard focus order與DFS task order一致；screen reader能辨識content owner。無法證明時採no-rowspan fallback。
- AC-116-18：browser console／page／HTTP／visible-error arrays為0，critical fixture counts非0；runtime cleanup完成。

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
- `output/playwright/dev-116-goal-mode/screenshots/*.png`

Browser必須從topbar正常入口操作，不得用direct store mutation代替交付路徑；fixture可透過local-test owner建立。
每個case記錄source revision／dirty boundary、actor、route、fixture IDs、viewport、steps、request/mutation counts、
state probe、screenshots、error arrays、server PID／port／cleanup。QC在frozen candidate後唯讀執行。

## 15. Failure Recovery and Stop Conditions

- task load error不render stale tree；record load error保留meeting column error＋exact-scope retry。
- scope switch或logout立即`resetRecordList()`並invalidate pending request；不得fallback跨板cache。
- invalid metadata隔離record；不修復、不寫回、不從正文猜最新摘要。
- save/archive/reload後只由canonical store reload/reprojection更新；Goal不做optimistic record patch。
- a11y rowSpan失敗採no-rowspan fallback；不複製父文或加helper補救。

命中任一項立即停止並回送PM／規劃模型：

1. 需要新schema、migration、provider query、RLS／permission、metadata或cross-board read。
2. 需要per-row `listByNode`、includeArchived board load或request count隨rows增加。
3. 需要資料繼承／copy才能完成merge視覺，或必須修改Task Details/editor/save。
4. 需要把goal加入live meeting continuity、mobile或tracking才能成立。
5. 需要修改protected files、public action semantics、recovery snapshot或capture aggregate（Board normalization除外）。
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
- 結論：`RD Implementation Ready + 架構定案：已定案 + RD Tech Lead Review R2 PASS`。產品、QA/QC、commit、deploy、release均未完成。

### 16.1 RD Tech Lead R2 Optimization Findings

| Finding | 原風險 | 已定案的最小修正 |
|---|---|---|
| meeting policy另建module | 只因consumer變多就增加抽象與file surface | readonly set留在lifecycle owner；只匯出pure predicate |
| record load使用多個平行scalar | loaded／loading／error可形成不一致狀態，泛用error又混入editor failure | 單一discriminated `RecordListLoadState`，並遷移三個既有consumer |
| sparse input攜帶`parentId` | projector實際只用DFS `level`，多一份結構訊號易產生第二套tree判斷 | 移除`parentId`；hierarchy validity仍由既有builder擁有 |
| 相鄰browser suites全量重跑 | Medium UI變更的時間成本過高且與DEV-116 browser重複 | 保留直接受影響static gates與DEV-117 lifecycle browser；新UI由DEV-116 browser完整舉證 |

## 17. Change Log

- 2026-09-10：建立SPEC-116，依actual repo完成Architecture Closure Review與RD Tech Lead收斂。
- 2026-09-10：將record loaded truth修正、batch quick-note index、pure sparse I/O、details-only goal profile、
  meeting policy、desktop/mobile matrix、file surface、WP與evidence定案；未修改產品程式。
- 2026-09-10：RD Tech Lead R2移除無獨立責任的meeting policy module、把三個record load scalars收斂成
  `RecordListLoadState`、移除sparse input冗餘`parentId`，並把回歸命令改成風險式最小集合；產品scope不變。
