# SPEC-110 未歸位任務會議紀錄邊界修正

- 狀態：`RD Implementation In Progress / Local Static+Browser Candidate PASS / QA-QC NOT RUN / NOT RELEASED`
- 日期：2026-09-08
- 對應 DEV：DEV-110
- 來源：`CAPA-DRAFT-20260908-unplaced-task-meeting-record-boundary`
- 父交付點：DEV-108；相容 DEV-009、DEV-039、DEV-095
- 風險：Medium（使用者可見錯誤、跨 task ownership／record provider／資料完整性）
- Spec Impact：`Intentional narrow exception + corrective amendment`。本規格只取代 SPEC-108 的
  task-scoped loader scope、record feature capability 與 unresolved task-link 成功語意；DEV-108 的補記
  provenance、latest-3、archive、recovery 與版面契約維持。對 SPEC-039「未歸位與已歸位功能等價」建立
  current-phase 例外：project-scoped 會議紀錄必須等任務進入目標看板後才可使用。

## 1. 問題、決策與完成定義

Production 畫面已出現：

```text
Supabase WBS item not found for legacy node id: task_workbench_unplaced_...
```

`TaskDetailsModal` 可開啟板內 canonical task、tracking reference 對應的 canonical task，以及 account-owned
unplaced task；現行 hook 卻一律以 `activeWorkspaceId + activeBoardId + taskId` 查詢板內
`record_task_links / wbs_items`。未歸位任務不在 `wbs_items`，跨板 tracking reference 的 canonical task 也不
屬於 target board，因此裸 `taskId` 不足以表達合法的 record operation。

本期採最低風險且可回復的產品規則：

1. account-unplaced task 在歸位前不支援 project-scoped 會議紀錄讀取或新增；不得發出必敗 query。
2. tracking reference 的歷史讀取使用 canonical task 的 source workspace／board／task identity；不得使用
   placement ID 或 target board 冒充 record ownership。
3. 只有目前 meeting draft 的 board 與 canonical task source board 相同時才可新增補記。跨板 reference
   可讀 source history，但不可把 source task link 寫入 target-board record。
4. Supabase save 必須在任何 record/link mutation 前解析全部 requested task links；任一無法解析即拒絕，
   不得保存 record 主體後再 silently skip link。
5. 使用者畫面只顯示產品語意；table name、provider name、legacy ID、SQL/RLS 訊息不得直接出現。

完成定義：B01～B07、Supabase TEST T01～T06、指定回歸與 visible-error gate 全數通過，且正常板內
DEV-108 行為不退化。文件 ready、local implementation、release 與 CAPA effectiveness 是四個不同狀態。

## 2. 現有資料邊界與不變量

| Identity／資料 | 權威來源 | Record 能力 |
|---|---|---|
| 板內 primary task | `wbs_items`；`TaskNode.boardId` 為 source board | 可讀；同 board meeting 可新增 |
| tracking reference | canonical task 在 `wbs_items`；placement 另有 identity | 以 canonical source board 讀；target board meeting 不可新增 |
| account-unplaced task | `task_workbench_unplaced_items`；`boardId=__task_workbench_unplaced__` | 本期不讀、不新增；先歸位 |

必須維持：

- `record_task_links.item_id` 永遠指向與 record 相同 tenant／project 的 `wbs_items`。
- task capability 以 canonical node 的 `boardId` 判定；`task_workbench_unplaced_*` ID prefix 只可作診斷，
  不可作能力判定。未歸位任務歸位後可能保留 legacy ID，若依 prefix 判斷會永久誤擋。
- tracking `placementId` 不得寫入 `record_task_links`、quick-note metadata 或 task mention。
- unsupported 是合法產品狀態，不是 load error；不得提供無效 retry。
- supported provider failure 才是 error；retry 只重跑同一 frozen canonical scope。

## 3. Capability contract

新增純函式 `src/utils/taskMeetingRecordCapability.ts`：

```ts
type TaskMeetingRecordUnsupportedReason =
  | 'account-unplaced'
  | 'meeting-board-mismatch'
  | 'identity-incomplete';

type TaskMeetingRecordReadCapability =
  | {
      status: 'supported';
      workspaceId: string;
      boardId: string;       // canonical source board
      taskId: string;        // canonical TaskNode.id
    }
  | { status: 'unsupported'; reason: 'account-unplaced' | 'identity-incomplete' };

type TaskMeetingRecordAppendCapability =
  | { status: 'supported' }
  | { status: 'unsupported'; reason: TaskMeetingRecordUnsupportedReason };

type TaskMeetingRecordCapability = {
  read: TaskMeetingRecordReadCapability;
  append: TaskMeetingRecordAppendCapability;
};

resolveTaskMeetingRecordCapability(
  node: Pick<TaskNode, 'id' | 'workspaceId' | 'boardId'> | null | undefined,
  activeMeetingBoardId: string | null | undefined,
): TaskMeetingRecordCapability;
```

決策表：

| Node state | Read | Append in meeting | Query scope |
|---|---|---|---|
| canonical board task，active board = source board | supported | supported | `node.workspaceId/node.boardId/node.id` |
| canonical task opened through same-board reference | supported | supported | canonical source identity |
| canonical task opened through cross-board reference | supported | unsupported: `meeting-board-mismatch` | canonical source identity |
| account-unplaced | unsupported: `account-unplaced` | unsupported: `account-unplaced` | 無 query |
| node identity 不完整 | unsupported: `identity-incomplete` | unsupported | 無 query |

`isTaskWorkbenchUnplacedTask(node)`／`TASK_WORKBENCH_UNPLACED_BOARD_ID` 是 unplaced 判定來源。不得把
provider probe、error message 或 ID prefix 當 capability discovery。

## 4. Read、hook 與 stale response contract

`useTaskMeetingQuickNotes` 改收 canonical node，不再只收 `taskId`。hook 先解析 capability，再決定是否呼叫
`recordService.listByNode`：

```ts
useTaskMeetingQuickNotes(node, activeMeetingBoardId): {
  entries: MeetingTaskQuickNoteProjection[];
  availability: 'supported' | 'unsupported-unplaced' | 'unsupported-identity';
  appendAvailability: 'supported' | 'unsupported-unplaced' | 'unsupported-board';
  loading: boolean;
  loadError: 'load-failed' | null;
  composerBlocked: boolean;
  invalidRecordIds: string[];
  refresh(): Promise<void>;
}
```

- `unsupported-*`：同步清空 `remoteRecords`、`loading`、`loadError`，增加 request generation 使舊 response
  失效，不呼叫 provider。`refresh()` 為 no-op，不製造 loading flash。
- `supported`：以 capability frozen 的 canonical workspace／board／task 呼叫
  `listByNode(..., { includeArchived: true })`。
- 每次 scope 改變先增加 generation；resolve/reject 只有在 generation 與 scope key 仍相同時可更新 state。
  A → unplaced → B 快速切換時，A 的慢 response 不得污染 unplaced 或 B。
- provider exception 只保存 `loadError='load-failed'`；原 exception 可留在 diagnostic logging，但不得放入
  JSX、toast、aria-live 或可複製的使用者文字。
- active draft 只在其 record board 與 read scope 相同時合併。unsupported unplaced 不建立 remote history
  投影，也不刪除或改寫既有 draft。
- tracking reference 的 `trackingReferenceId` 只供 placement UI；hook 永遠使用 `node.id/node.boardId`。

## 5. Append 與 save integrity contract

### 5.1 UI／store defense in depth

`TaskDetailsModal` 以 append capability 控制 composer。`appendTaskDiscussionToMeetingDraft` input 增加
`taskBoardId`，store 再以目前 active meeting board 驗證：

```ts
type AppendMeetingTaskQuickNoteResult =
  | { status: 'appended'; entryId: string }
  | { status: 'noop'; entryId: string }
  | {
      status: 'denied';
      reason:
        | 'not-meeting'
        | 'invalid-input'
        | 'invalid-metadata'
        | 'invalid-task'
        | 'unsupported-task-owner'
        | 'meeting-board-mismatch';
    };
```

- account-unplaced 或 board mismatch 時不得 append content、metadata、taskLinks、cursor 或 synthesis state。
- denied 保留 textarea；正常 UI 原則上不顯示 composer，因此 direct store test 是必要防線。
- board task 的既有 submission ID／occurredAt／noop／recovery 契約不變。

### 5.2 Supabase link preflight

新增 `src/services/recordTaskLinkContract.ts`，集中 typed error 與 exact-set comparison：

```ts
class RecordTaskLinkResolutionError extends Error {
  readonly code = 'RECORD_TASK_LINK_UNRESOLVED';
  constructor(readonly nodeIds: readonly string[]);
}
```

`supabaseRecordService.upsert` 的固定順序：

1. 解析 tenant/project，對 input links 依 `(nodeId, role)` 去重。
2. 在 `knowledge_records.upsert`、舊 links delete 或任何 mutation 前，解析全部 `item_id`。
3. 任一結果為 null 或 exception：彙整 unresolved nodeIds，throw typed error；record 主體與舊 links 必須保持
   pre-call 狀態。不得 catch 後 `console.warn + return null`。
4. 全部解析後才建立 record payload並執行既有 save/link replace/RAG 流程。
5. reload 後以 canonical `(nodeId, role)` exact set 比對 requested links；少一筆、多一筆或 role 不同都不得
   回傳 success，必須 throw 並讓既有 `saveDraft` 保留 draft／顯示 save failure。

這個 current-phase contract 消除已知 unresolved-link silent success，但不宣稱跨
`knowledge_records + record_task_links + documents` 已具有 DB transaction。若 failure injection 在 preflight
通過後證實 insert/delete 中斷可造成不可補償的 partial state，停止 release並啟動第 10 節 RPC capsule；不得用
文件或 UI 訊息掩蓋。

Firestore/local-test 不具相同 FK resolver，但仍必須回傳與 requested `(nodeId, role)` exact set 相同的
`saved.taskLinks`；shared assertion 不得因 provider 不同而跳過。

## 6. UI state matrix

| 狀態 | 列表 | Composer | 訊息／動作 |
|---|---|---|---|
| 非 meeting、supported、無資料 | 不 render section | 無 | 無 |
| meeting、supported | 依 DEV-108 顯示 | 顯示 | 正常加入 |
| supported、loading | 保留 active draft entries | 依權限顯示 | 標題旁最短「載入中」 |
| supported、load failed | 保留已知 entries | 依既有 safety | `會議紀錄載入失敗`＋`重試` |
| 非 meeting、account-unplaced | 不 render section | 無 | 無 |
| meeting、account-unplaced | 無 remote list | 無 | `請先將任務放入目前會議的看板，再新增會議紀錄。`；無 retry |
| meeting、cross-board reference | 顯示 source history（若可讀） | 無 | `此任務屬於其他看板；請在原看板的會議中新增紀錄。` |
| identity incomplete | 不製造假空白 | 無 | 最短不可用訊息；無 provider details |

- unsupported 提示是 inline text，不加卡片、icon、badge、toast、第二個 helper 或額外 Modal。
- 同區同時最多一個主要狀態訊號。unsupported 不得同時顯示 retry／textarea。
- `identity-incomplete`固定顯示「目前任務無法載入會議紀錄。」狀態優先序為read unsupported → load
  failure → append board mismatch → loading/normal；cross-board read失敗時先顯示generic load failure＋retry，
  成功後才顯示board mismatch提示，避免同區雙重告警。
- 1440×900、1024×768、390×844 不得 overflow、遮擋或產生雙重捲動；390 維持既有 mobile meeting
  composer unavailable。
- retry、展開、textarea 與加入的 keyboard／ARIA 契約沿用 DEV-108；unsupported 純文字不偽裝成 control。

## 7. RD 工作包與檔案責任

### WP-110-A：Pure capability／store guard（已完成）

- `src/utils/taskMeetingRecordCapability.ts`（new）：決策表與 scope key；無 React/provider side effect。
- `src/store/useRecordStore.ts`：append input／denied reason 與 active meeting board 防線。
- deterministic tests：unplaced、歸位後保留 legacy prefix、same/cross-board tracking reference、identity incomplete。

### WP-110-B：Read/UI correction（已完成）

- `src/hooks/useTaskMeetingQuickNotes.ts`：canonical scope、unsupported outcome、generation guard、generic error。
- `src/components/TaskDetailsModal.tsx`：傳 node／active meeting board、append capability、錯誤 mapping；task change
  時清除只屬前一 task 的 meetingDiscussion/error。
- `src/components/TaskNotes/TaskMeetingQuickNoteSection.tsx`：UI matrix與 stable data attributes；不接 raw exception。

### WP-110-C：Provider integrity（已完成）

- `src/services/recordTaskLinkContract.ts`（new）：typed unresolved error與 exact-set assertion。
- `src/services/supabase/projedService.ts`：resolve-all preflight移至任何 mutation 前，移除 silent skip，reload
  exact-set gate。
- `src/services/dataBackend.ts`、`src/services/firestoreService.ts`、`src/services/localTestService.ts`：維持
  adapter shape並套用 shared success invariant；不得放寬 workspace／board／RLS。

### WP-110-D：Verification assets（local static／browser candidate 已完成；Supabase TEST 待QA）

- 新增 `scripts/verify-dev-110-unplaced-task-meeting-record-boundary.ts`，18/18 assertions PASS。
- 新增 `scripts/verify-dev-110-unplaced-task-meeting-record-boundary-browser.pw.js`。
- 受控 localhost browser candidate B01～B04 PASS；artifact為
  `output/playwright/dev-110-unplaced-task-meeting-record-boundary/result.json`，包含B02桌面與B03手機截圖。
- 新增隔離 Supabase TEST runner 或沿用既有受控 harness；登錄 package scripts。
- 執行 `QA-DEV-110`、指定 DEV-039／095／108 regressions、TypeScript、targeted ESLint、build:test與
  `git diff --check`。

依賴：A → B；A 與 C 可平行，D fixture可先建，但 browser/provider PASS 依賴 A～C。每批完成後只更新
DEV-110／SPEC-110／QA-DEV-110；不得改寫 DEV-108 歷史 PASS。

## 8. Failure、recovery 與停止條件

- unsupported：無 network、無 retry、無 draft mutation；任務歸位並重開後重新解析 capability。
- load failure：保留 active draft／input；retry 使用同一 canonical scope，scope 已變則丟棄結果。
- unresolved preflight：零 mutation、draft與既有 links保留、save 不得標成功；UI使用既有 generic save error。
- reload exact-set mismatch：回傳失敗，禁止更新 local baseline為成功；保存 actual/requested fingerprints供 evidence，
  不向使用者顯示 task IDs。
- permission/RLS：維持 provider拒絕，映射 generic load/save failure；不得改成 unsupported或空集合。

立即停止並回 PM 的條件：

- 需求改為讓 account-unplaced 直接擁有永久 meeting records。
- 需要跨 project record-task link、複製 canonical task 或放寬 RLS。
- 需要 production data mutation、relink、delete或 migration apply。
- preflight後 failure injection出現無法補償的 partial state，需 transactional RPC。
- 實作必須變更 DEV-095 canonical/placement identity 或 DEV-106 recovery schema。

## 9. Acceptance criteria

- [ ] 開啟 account-unplaced 詳情不呼叫 `recordService.listByNode`，且不出現原 Supabase error或 retry。
- [ ] meeting mode 的 account-unplaced 只顯示單一可採取提示；composer不存在，direct store append也被拒絕。
- [ ] 同一任務正式歸位後，即使 ID 仍以 `task_workbench_unplaced_` 開頭，也依新 `node.boardId` 恢復能力。
- [ ] primary／same-board tracking reference 以 canonical source identity正常讀寫；cross-board reference只讀
  source history，不可寫入 target-board meeting record。
- [ ] A → unplaced → B 快速切換沒有 stale entries、error或loading殘留。
- [ ] provider load failure顯示 generic Traditional Chinese訊息與有效 retry；任何可見面不含 Supabase/table/legacy ID/SQL/RLS。
- [ ] Supabase部分或全部requested links unresolved皆在mutation前rejected，existing record/body/links
  fingerprint不變；0% unresolved可進入save並須通過reload exact-set。
- [ ] resolved save只有在 reloaded task-link exact set等於 requested set時成功；不再存在 silent partial success。
- [ ] DEV-108 board task latest-3、archive、active draft、append、retry、a11y與viewport回歸全數PASS。
- [ ] Supabase TEST fixture與task-owned runtime cleanup residual=0；無 production mutation。

## 10. Deferred scope audit

### Future Phase Capsule：Transactional record aggregate RPC

- 目的：若實證顯示 preflight 後的 network／RLS／insert failure會留下不可接受的跨表 partial state，以單一
  transaction提交 record、task links與必要 RAG status。
- 邊界：不讓 account-unplaced 成為 project record owner；不自動跨 project relink。
- 依賴：failure injection evidence、RPC I/O／idempotency／permission決策、migration與rollback gate。
- Re-entry：DEV-110 T06 fault injection出現partial readback，或production telemetry證明exact-set mismatch。
- 驗收方向：同 operation只有完整 commit或完整 rollback；retry idempotent；RLS與audit readback一致。

### 其他 out of scope

- account-unplaced 專屬知識庫／會議紀錄 schema與跨裝置內容模型。
- production impact audit、資料修復、CAPA正式編號、commit/push/deploy/release。
- 全域 TaskDetailsModal capability framework重構；只建立 meeting-record最小 adapter。

高影響 deferred scope已由 capsule承接；目前沒有阻止 RD 開始的 P0/P1 open question。

## 11. Release／effectiveness boundary

本文件把下一執行lane限定為local implementation與隔離QA candidate，不代表本輪已開始實作。若進release，
需另走deployment gate，確認exact source
commit／bundle hash、authenticated Supabase TEST、production-bound inactive candidate、canonical post-deploy
unplaced/board/reference smoke與 DEV terminal state回寫。Production唯讀impact audit與任何資料修復仍需獨立授權。

CAPA effectiveness至少還需：T+0 smoke、T+7同型錯誤為0、requested unresolved links成功事件為0，以及
release artifact／文件狀態一致；DEV-110 local PASS不能關閉CAPA。

## 12. Readiness conclusion

- P0/P1 engineering blockers：無。
- ADR：不需要。此為既有 ownership、record FK與canonical placement契約上的局部可逆 adapter／guard；若
  Future Phase RPC啟動，再依跨模組transaction決策判斷ADR。
- RD local candidate：WP-110-A～C已完成，WP-110-D static verifier、browser candidate B01～B04、TypeScript、lint、
  build:test與diff check已PASS；下一步交 QA 執行Supabase TEST、B05～B07與指定回歸。
- 未授權：正式CAPA登錄、production query/mutation、migration apply、deploy或release。

使用思考習慣：#第一性原理、#效用理論、#多層次分析、#可驗證性
