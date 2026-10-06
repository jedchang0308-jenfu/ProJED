# SPEC-109 會議期間看板變更即時記錄與 AI 整理修復

## DEV-117 Same-board View Segment Continuity Amendment（2026-09-10）

- 同一 active workspace／board 的 Board／List／Mindmap／Gantt／Calendar view switch 不 close、recreate
  或 rebase live capture segment；draft ID、segment ID、startedAt 與 aggregates 持續。
- §4.2 中「切換 view／board」一併 close segment 的舊敘述，由 `SPEC-117`／`ADR-049` 意圖性取代為：
  continuity view switch 不是 lifecycle transition；真正 exit、record replacement、board／workspace switch
  才依 DEV-106 關閉 segment。
- capture allowlist、persistence-confirmed truth、exactly-once、data minimization、AI source authority 與 mobile boundary 不變。

- 狀態：`Target Authority / Implemented Candidate / QA Pending / NOT RELEASED`
- 日期：2026-09-08
- 對應 DEV：DEV-109
- 父交付點：DEV-007
- 相容：DEV-011、DEV-012、DEV-020、DEV-021、DEV-022、DEV-024、DEV-066、DEV-094、DEV-106、DEV-108
- 風險：Medium
- Spec Impact：`Intentional targeted replacement`。本規格取代 SPEC-007 的「只存 memory buffer、到儲存時再逐筆附加」內容契約；
  保留會議模式的原生看板操作與有語意變更捕捉。歷史 `匯入專案變化`、AI contract v2、人工內容保護、
  本機 recovery 與 provider 權限仍由原規格管理。

## 1. 問題、目標與成功結果

現行 live meeting 已有 `meetingActivities`，但任務名稱、任務說明與備註沒有完整事件來源，已捕捉的事件也只留在
記憶體。使用者在會議中完成看板修改後，右側內容仍可能是空白；若再遇到 AI quality gate 失敗，正確的
fail-closed 行為會保留一份沒有變更證據的空稿。

DEV-109 的成功結果是：

1. 開啟會議功能時建立 capture segment；只有這個時間點之後、且已確認保存成功的有意義任務變更可被接受。
2. 變更不必等待 AI，立即以緊湊純文字進入目前 meeting draft 的內容 editor。
3. 同一 segment、同一任務、同一欄位只呈現 segment 起始值到最新確認值；中間值不形成流水帳。
4. 離開會議即關閉 segment；會外變更不捕捉、不補抓。重開同一草稿保留舊內容，但建立新 segment 與新基準。
5. `AI整理` 只整理目前草稿內的人工內容、明確匯入內容與已投影 live evidence；不呼叫專案歷史查詢，也不暗中執行 `匯入專案變化`。

## 2. 已確認產品契約

### 2.1 Capture allowlist

| 使用者語意 | Live field key | 來源 | 可見標籤 |
|---|---|---|---|
| 任務建立 | `created` | `addNode`／forest create 的 persistence-confirmed result | `新增任務` |
| 任務名稱 | `title` | `TaskNode.title` | `名稱` |
| 任務說明 | `description` 或 `detailNote:note_default` | legacy description 或預設任務說明 note | `任務說明` |
| 其他備註 | `detailNote:{noteId}` | `TaskNode.detailNotes`，以 note id 比對 | `備註「{title}」` |
| 狀態 | `status` | `TaskNode.status` | `狀態` |
| 日期 | `dates` | `startDate`、`endDate`、`isDurationLocked` | `日期` |
| 主責 | `assignees` | canonical `assigneeIds`；`assigneeId` 只作相容 alias | `主責` |
| 協作 | `collaborators` | `collaboratorIds` | `協作` |
| 標籤 | `tags` | `tagIds` | `標籤` |
| 封存／還原 | `archived` | `isArchived` | `封存狀態` |

- 只有 provider/local-test persistence 已成功，或既有 canonical readback 已明確證明相同 mutation 落盤，才能 commit capture ticket。
- 輸入、composition、debounce、blur、取消編輯與 optimistic state 都不是 capture event。
- `parentId`、`order`、`kanbanStageId`、純排序、純拖曳、位置與 layout 不在 allowlist。
- 同一更新同時寫 `detailNotes` 與 compatibility `description` 時，以 `detailNotes` 為準，不得產生兩條相同內容。
- `detailNotes` 以 note id 比對；單純陣列重排是 no-op。新增、刪除、標題或內容改變才建立該 note field 的 ticket。
- restore 是 `archived` 的反向值；同 segment 封存後還原至起始值時，依 net no-op 規則移除。

### 2.2 Save-level truth

`useWbsStore` 必須在 optimistic mutation 前建立 immutable capture ticket，但 ticket 只有在 persistence-confirmed 後才能
送進 record store。Provider audit/activity log 可維持自己的獨立 best-effort 契約；`useWbsStore` 對本 allowlist mutation
不得再呼叫 record store 的 legacy `recordMeetingTaskActivity` 形成雙寫。Live meeting capture 也不得與任何 activity log 共用「先記再存」時點。

```ts
type MeetingLiveCaptureTicket = {
  mutationId: string;          // 首次 dispatch 建立；retry/readback 沿用
  segmentId: string;
  draftId: string;
  boardId: string;
  nodeId: string;
  taskTitle: string;
  fieldKey: MeetingLiveFieldKey;
  dispatchSequence: number;
  dispatchedAt: number;
  change: MeetingLiveTicketChange;
};

type MeetingLiveTicketChange =
  | { kind: 'scalar'; before: string | boolean | null; after: string | boolean | null }
  | { kind: 'id_list'; before: string[]; after: string[] }
  | { kind: 'dates'; before: MeetingLiveDates; after: MeetingLiveDates }
  | { kind: 'created'; after: MeetingLiveCreatedValue }
  | { kind: 'content'; beforeText: string; afterText: string }; // transient only；terminal 後立即釋放

type MeetingLiveCaptureCommit = {
  mutationId: string;
  segmentId: string;
  confirmedAt: number;
  confirmation: 'provider_ack' | 'canonical_readback';
};
```

- `mutationId` 是 exactly-once 的 application identity；同一 ticket 因 promise completion、timeout readback 或 retry 多次提交時只套用一次。
- content ticket 可在 promise／readback／retry 等待期間暫存 before／after plain text，但只限目前 tab 的 volatile memory；
  不得放入 Zustand 可序列化 state、recovery、metadata、activity log、console 或 error。Terminal success／failure／close 後立即釋放。
- Task details 的失敗重試必須保存原 ticket／原 before，不可用 optimistic node 重新建立基準。`skipActivity` 只可抑制舊 activity log，
  不得讓已確認的 live capture 永久漏失。
- `addNode` 只能在 `nodeService.create` 成功後 commit；建立失敗不顯示 `新增任務`。
- batch／forest／placement 中若同時存在 allowlist field delta，只能在既有 `finalizeCommitted` 後 commit；純 placement／drag
  仍為 0 ticket。Dependency schedule 必須等待對應 `batchUpdate` 成功，不能先記錄日期／狀態。
- completion 到達時若 segment 已關閉、active draft／board 不符或 ticket 不屬目前 segment，丟棄 capture；不得跨會議補寫。

## 3. Runtime data contract

### 3.1 Segment 與 aggregate

新增集中型別，禁止 store、WBS、recovery 與 synthesis 各自定義不同資料：

```ts
type MeetingLiveFieldKey =
  | 'created'
  | 'title'
  | 'description'
  | `detailNote:${string}`
  | 'status'
  | 'dates'
  | 'assignees'
  | 'collaborators'
  | 'tags'
  | 'archived';

type MeetingLiveCaptureSegment = {
  id: string;
  draftId: string;
  boardId: string;
  startedAt: number;
  closedAt: number | null;
  nextDispatchSequence: number;
};

type MeetingLiveDates = {
  startDate: string | null;
  endDate: string | null;
  isDurationLocked: boolean;
};

type MeetingLiveCreatedValue = {
  title: string;
  status: string;
  dates: MeetingLiveDates;
  assigneeIds: string[];
  collaboratorIds: string[];
  tagIds: string[];
  isArchived: boolean;
};

type MeetingLiveAggregateValue =
  | { kind: 'scalar'; baseline: string | boolean | null; latest: string | boolean | null }
  | { kind: 'id_list'; baseline: string[]; latest: string[] }
  | { kind: 'dates'; baseline: MeetingLiveDates; latest: MeetingLiveDates }
  | { kind: 'created'; latest: MeetingLiveCreatedValue }
  | MeetingLiveContentValue;

type MeetingLiveFieldAggregate = {
  key: string;                 // `${segmentId}:${nodeId}:${fieldKey}`
  segmentId: string;
  nodeId: string;
  fieldKey: MeetingLiveFieldKey;
  taskTitle: string;
  value: MeetingLiveAggregateValue; // scalar/list/dates 的 baseline+latest，或 content delta
  firstConfirmedAt: number;
  lastConfirmedAt: number;
  lastCommitSequence: number;
  appliedMutationIds: string[];
  projection: MeetingLiveProjectionAnchor | null;
};

type MeetingLiveCaptureRuntime = {
  segment: MeetingLiveCaptureSegment;
  aggregates: Map<string, MeetingLiveFieldAggregate>;
  plaintextBaselines: Map<string, string>; // content field only；never serialized
  appliedMutationIds: Set<string>;
  nextCommitSequence: number;
};
```

- aggregate key 固定為 `draftId + segmentId + nodeId + fieldKey`；scalar/list/dates 的 baseline 及 content 的
  `baselineHash` 在該欄位第一張 ticket 建立時固定，之後不可改寫。
- 同一欄位多個 persistence completion 以 `confirmedAt` 後配置的 monotonic commit sequence 決定 latest；不得用 promise 建立順序猜測 provider 最終值。
- latest 與 baseline canonical equality 相同時刪除 aggregate、可見 line 與 DEV-109 synthesis source；只保留 mutation id
  tombstone 到 segment 關閉，防止 late duplicate 重建。
- `draft.content` 內的可見 projection line 是唯一可持久化 live evidence；runtime aggregate 只負責目前 segment 的更新／移除。
- DEV-109 confirmed capture 不再另寫 `meetingActivities`，避免 content + aggregate activity 雙重 AI source。既有
  `meetingActivities`／`appendedMeetingActivityIds` 只保留 legacy snapshot／舊流程相容，不是 DEV-109 權威。

### 3.2 Scalar/list canonicalization

- title：換行轉空格、trim；正文保存完整 before／after。
- status／archived：使用 domain value，不用 UI label 判等；render 時再映射繁中 label。
- dates：以 `{startDate|null,endDate|null,isDurationLocked:boolean}` 判等；不得用顯示字串判等。
- assignees／collaborators／tags：id 去重後以 ordinal sort 判等；顯示名稱只作 presentation，名稱查不到時使用 id 的安全縮寫，
  不可改變 canonical equality。
- created：baseline 為 `null`；latest 只含 title、status、date、assignee/collaborator/tag ids 與 archive flag，不含完整 description／notes。
  若建立時已有 description／notes，同一 persistence success 另產生對應 data-minimized content ticket。
- title commit 後，該 node 其他 active aggregates 的 task mention 顯示名稱一起更新；這只是 presentation re-render，
  不改其他欄位 baseline、latest 或 mutation identity。

### 3.3 說明／備註資料最小化

任務全文原本就存在 WBS node 與 task persistence call stack。為精確維持「segment 起始值 → 最新值」，目前 active segment
可額外保留每個已變更 content field 的一份 volatile plaintext baseline；這是必要的暫態計算狀態，不是 meeting evidence。
它不得序列化、記錄或跨 reload 保存，並在 segment close／draft 切換／logout 時清除。

```ts
type MeetingLiveContentValue = {
  kind: 'content_delta';
  baselineHash: `sha256:${string}`;
  latestHash: `sha256:${string}`;
  addedFragments: MeetingLiveTextFragment[];
  removedFragments: MeetingLiveTextFragment[];
};

type MeetingLiveTextFragment = {
  text: string;                // bounded normalized excerpt
  originalLength: number;
  truncated: boolean;
  fingerprint: `sha256:${string}`;
};
```

正規化固定為：CRLF／CR 轉 LF、NBSP 轉一般空格、移除每行尾端空白、連續三個以上空行縮成兩個、整體 trim。
不得做 Unicode NFKC 或改寫標點。Rich note 必須先用 `taskNoteToPlainText` 取得 plain-text projection；每個 note
以 id 獨立比較，note order 不參與差異。

- hash：Web Crypto `SHA-256`，輸出小寫 hex 並加 `sha256:` 前綴；hash 不顯示於 UI。
- diff：每次 confirmed content mutation 都直接以 volatile segment baseline 與最新 after text 重算；只保留不相等片段，
  片段順序與輸出必須 deterministic。演算法是 pure helper 的可替換內部細節，不在 contract 綁定自訂 Myers／symbolic rope；
  golden vectors固定使用者可見結果、bounds與 hash。
- fragment 上限：added／removed 各最多 3 段，每段最多 120 Unicode code points；超過即設 `truncated=true` 並保留
  `originalLength`／fingerprint。不得把多段重新串成完整舊稿。
- changed fragment 可以完整保留短小的實際改動，但不得另存整份 before document；長內容依上限截斷。
- 若 `latestHash === baselineHash`，視為 net no-op，刪除 aggregate。
- hash 或 diff 計算失敗：該 mutation 不進 capture；任務本身已保存的事實不回滾，於內容 editor 附近顯示可重試的最短錯誤，
  ticket 只在目前 tab 保留到重試／離開；不得寫入 recovery 或 provider。

## 4. Capture lifecycle

### 4.1 Start

- 每次使用者由既有入口執行 `startMeetingRecord`，必須建立新的 segment id 與 `startedAt`。
- 沿用相同 draft 只保留既有 `draft.content`、metadata 與 task links；不得沿用前一個 closed segment 的 baseline／aggregate。
- 不在開始時掃描或複製整個看板。各欄位 baseline 由該 segment 第一張 mutation ticket 的 before value lazy 建立。
- 開啟既有 meeting record 而未進入 live meeting 時，不建立 segment、不接受 capture。

### 4.2 Close／re-entry

- `exitMeetingMode`、`儲存並離開`、切換 view／board 或其他經 DEV-106 guard 核准的 meeting exit，在真正離開前將 segment
  `closedAt` 固定並停止接收 ticket completion。
- 現有可見文字保留在 draft；active aggregate／dedupe tombstone 只在 DEV-106 force-flush 已包含最新內容後釋放。
- 會議關閉期間不建立 ticket；重新開啟同一 draft 時建立新 segment，之前的文字不可被新 segment reconcile 覆寫。
- crash／F5 從 valid local recovery 恢復時只恢復已投影的 `draft.content`，並建立新 segment；未確認或只存在 volatile
  baseline／ticket 的資料不補抓。這符合「重開建立新 boundary」，也避免把完整舊稿寫進 recovery。

### 4.3 Recovery 不變契約

- `MeetingDraftRecoverySnapshotV2`、IndexedDB database version／store／scope／TTL、session emergency copy 與 signature 結構全部不變。
- Live projection 已直接寫入 `draft.content`，自然由既有 DEV-106 snapshot 保護；不序列化 segment、baseline、aggregate、ticket、
  mutation id 或 projection anchor。
- restore 後 `meetingActivities` 只依既有 legacy contract 處理；先清空 reload 前 DEV-109 runtime，再因既有 live meeting mode
  建立全新 segment，不由 visible line 反向推導 aggregate。
- Provider recovery request 維持 0；不得為續接 capture 引入 remote checkpoint、history readback 或 schema extension。

## 5. 可見 working content 與 UI

### 5.1 最小投影

不新增卡片、面板、badge、事件數、時間軸、成功 toast 或第二個 editor。內容直接進既有會議紀錄 editor，每個 active
aggregate 一行：

```text
- 會中變更｜@[API 權限整理](task:task-15)：名稱「API 權限」→「API 權限整理」
- 會中變更｜@[API 權限整理](task:task-15)：狀態「待辦」→「進行中」
- 會中變更｜@[API 權限整理](task:task-15)：任務說明新增「補上權限矩陣」；移除「先確認範圍」
```

- 沒有變更時不顯示 heading、空狀態或 placeholder。
- 一行只呈現一個 task／field aggregate；同 segment 更新時原地 replace，不 append 中間值。
- task mention 使用既有 `@[title](task:id)`；每次投影後走 `syncTaskLinksFromRecordContent`。
- fragment 被截斷時以單一 `…` 表示；hash、segment id、mutation id、技術錯誤與 event type 不顯示。
- 只依必要內容自然換行；不得造成水平 overflow。現有 editor focus、undo、keyboard 與 1440／1024 layout 不變。

### 5.2 Projection anchor 與人工所有權

`MeetingLiveProjectionAnchor` 至少保存 `lineIndex + exactText + fingerprint + generation`，只存在目前 runtime；不得進 recovery。

1. 系統更新前先驗證原 lineIndex 的 exact text；成立才 replace/remove。
2. 行號因其他內容插入而位移時，只接受全稿唯一 exact candidate。
3. 零候選、多候選或文字被人工修改／刪除時，不猜測、不覆寫、不刪除人工內容；舊 line 標為 detached。
4. detached line 從此視為 human-owned。下一次 confirmed mutation 以該 mutation before 作新 projection generation 的 lazy baseline，
   在 editor 尾端新增新的系統 line；同 generation 內仍遵守 net aggregate。
5. reconcile 失敗不得回滾已保存的 task mutation，也不得破壞 draft；只在 editor 附近顯示最短 `會中變更暫時無法更新` 與重試。

上述人工修改是明示例外：使用者自己改過的文字不再由系統保證「同一 segment 一欄一行」，因為保留人工內容優先於
自動去重。系統管理的 active projection 仍必須維持唯一。

## 6. AI 整理契約

### 6.1 Source authority

`synthesizeMeetingDraft` 的來源固定為目前 meeting draft content：人工速記、DEV-009／108 人工補記、明確匯入的
DEV-020／094 protected evidence，以及 DEV-109 已投影的 `會中變更` 純文字。可見 content 是唯一 live source，
不再把同一 DEV-109 aggregate 另送成 `meetingActivities`。

- 不得呼叫 activity log／project change query／provider history／cutoff service。
- 不得自動觸發 `importMeetingProjectChanges`，也不得改變 import metadata、日期或 publish cutoff。
- 不新增 live-only Edge event type，也不得把 DEV-109 加入 `PROJECT_CHANGE_EVENT_TYPES`。Legacy `meetingActivities`
  可依既有 SPEC-011／012 相容處理，但不得與 DEV-109 projection 表示同一次 mutation。

### 6.2 Success／retry／failure

- AI／deterministic result 必須通過 DEV-012 contract v2 quality gate、DEV-024 human preserve、DEV-021／022 import preserve，
  再通過 live projection reconcile，才可 atomically 寫回。
- 每個仍由 runtime 管理的 `會中變更` line 在 merge 後必須 exact 出現一次；Edge prompt、deterministic fallback 與
  `mergeHumanDraftWithAiSynthesis` 共同負責把 line 放入任務段落，避免遺失或形成第二個語意副本。缺少或多筆即 fail closed。
- 系統後續 replace／remove projection 時，若 `metadata.meetingSynthesis.sourceContent`／`outputContent` 仍與目前 trace 對應，
  必須以同一 anchor transaction 同步 rebase，讓下一次 AI 仍從人類來源基線開始；不可把前一次 AI output 當新人類輸入。
- trace 無法唯一 rebase（例如使用者已手動改稿）時，保留目前內容、清除 stale synthesis trace，再依 human-owned 規則
  detach／新增 projection；不得覆寫人工內容或沿用錯誤 source snapshot。
- 若 AI 後又有人修改 AI output，該修改視為 human-owned；下一次整理先保留人工內容，再加入目前 aggregate。
- `QUALITY_GATE_FAILED`、timeout、contract mismatch、merge／anchor ambiguity 或 provider error：整份 `draft.content`、metadata、
  task links、aggregate 與 projection byte-for-byte 保留；顯示既有可重試錯誤。
- AI 成功不建立、修改、封存任務，也不關閉 meeting segment。

## 7. Failure、concurrency 與 idempotency matrix

| 情境 | 必要行為 | 禁止行為 |
|---|---|---|
| task persistence reject | ticket 不 commit；draft 不新增 live line | optimistic update 當已保存證據 |
| timeout + readback match | 同 mutationId commit 一次 | promise 晚到再新增一次 |
| timeout + readback mismatch／unavailable | 暫不 commit，保留 retry context | 猜測成功或補抓 history |
| retry success | 沿用原 mutationId、segment、baseline；commit 一次 | 以 optimistic node 重建 before |
| 同欄多筆 in-flight | 依 confirmed commit sequence 更新 latest | 依 dispatch/promise array order 猜測 |
| late success after close | 丟棄 capture | 寫進下一 segment 或會後補寫 |
| net no-op | 移除系統 line與不再需要的 link；同步 rebase valid synthesis trace | 保留中間值或空摘要 |
| projection 被人工改寫 | preserve + detach；下一次另開 generation | 覆寫／刪除人工文字 |
| F5／crash restore | 保留 draft content並建立新 segment | 序列化 plaintext baseline或 history hydrate |
| AI fail／quality fail | 原稿與 live evidence byte-for-byte 保留 | 清空 editor、標成功或自動匯入 |

Task link 移除必須走既有 content sync：只有當正文無其他 mention、legacy/manual link、quick note、import evidence 或其他 active
aggregate 需要該 task 時才可移除。不得因單一 net no-op 刪掉仍由其他內容使用的 link。

## 8. 模組責任與實作檔案

| 檔案 | 變更責任 | 禁止事項 |
|---|---|---|
| `src/types/index.ts` | live segment／ticket／runtime aggregate／content delta 型別 | 不新增 recovery/provider schema 或 global history payload |
| `src/utils/meetingLiveTaskChanges.ts`（new） | normalization、SHA-256、bounded diff、allowlist、aggregate、projection與 anchor reconcile | 不存取 provider、DOM、Zustand或 recovery storage |
| `src/utils/taskNoteRichContent.ts` | 只重用 `taskNoteToPlainText` | 不另建第二套 rich-text parser |
| `src/store/useWbsStore.ts` | mutation 前建 ticket；persistence/readback-confirmed 後 commit；create/batch/dependency 與含 allowlist delta 的複合路徑接線；停止對同 mutation 雙寫 legacy meeting activity | 不把 activity-log success 當 task persistence success，也不讓 `recordMeetingTaskActivity` 與 projection 並存；純 placement/drag 為 0 |
| `src/components/TaskDetailsModal.tsx` | retry 保存並回傳原 capture ticket identity；既有 save feedback 不變 | 不直接寫 meeting draft 或自行產生 activity |
| `src/store/useRecordStore.ts` | transient segment lifecycle、confirmed commit reducer、draft projection、task-link sync、synthesis trace rebase | 不查 provider history、不序列化 live runtime、不直接解析 rich note |
| `src/hooks/useMeetingDraftRecovery.ts`、`src/services/meetingDraftRecoveryService.ts` | 預期零產品修改；只作 DEV-106 regression authority | 不改 snapshot schema、signature、IDB 或 remote policy |
| `src/utils/meetingRecordSynthesis.ts` | 保留 legacy activities；確認 DEV-109 只由 raw content 進 AI | 不新增 live event或 project-change query |
| `src/utils/humanDraftSynthesisMerge.ts` | exact-once保留 active live lines並與 projection reconcile compose | 不放寬 DEV-024 human preserve |
| `supabase/functions/synthesize_meeting_record/index.ts` | prompt要求現有 `會中變更` line exact-once整合，保持 contract v2 gate | 不新增 live event、不讀 history、不改任務 |
| `scripts/verify-dev-109-meeting-live-task-change-capture.ts`（new） | pure/store/persistence/recovery/synthesis deterministic gate | source scan 不可單獨算 PASS |
| `scripts/verify-dev-109-meeting-live-task-change-capture-browser.pw.js`（new） | 正常入口、真實保存、re-entry、AI fail、viewports與 error sweep | 不用 direct store mutation 代替主流程 |
| `package.json` | 登錄 DEV-109 static／browser scripts | 不重排或刪除其他 verifier |

## 9. Work packages 與固定順序

1. **WP-109-A — Pure contract**：新增型別與 `meetingLiveTaskChanges`；先以 golden vectors 證明 normalization、hash、
   volatile baseline→latest bounded diff、net no-op與 projection reconcile。
2. **WP-109-B — Persistence truth**：WBS 建立 ticket，將 `updateNode`、create、batch／forest、placement、dependency schedule
   全部改為 confirmed commit；補 TaskDetails stable retry identity。
3. **WP-109-C — Draft projection／lifecycle**：record store 接 transient segment、aggregate、editor line、task links；
   完成 off-meeting／re-entry／F5-new-segment／late completion 隔離，DEV-106 schema 維持不變。
4. **WP-109-D — AI source／preserve**：以 raw content 作唯一 live source，完成 line exact-once、synthesis trace rebase、
   repeat synthesis、human edit 與 failure byte-preserve；不新增 live Edge event。
5. **WP-109-E — Candidate verification**：static、browser、targeted regression、type/lint/build、diff 與 evidence freeze；
   RD 不得自行宣告 production release。

施工順序固定 A → B → C → D → E。B 不得在 A 的 data-minimization vectors 未通過時保存 content delta；C 不得在 B
尚未證明 persistence truth 時顯示 live success；D 不得在 preserve gates 未通過時覆蓋草稿。

## 10. Acceptance Criteria

- [ ] 每個 allowlist 欄位都能由正常 UI 保存路徑即時產生一條 editor 純文字；無需先按 AI。
- [ ] title 完整 before／after；description／每個 note aggregate 只有 bounded changed fragments 與 SHA-256；完整 plaintext
  baseline 只在 active tab volatile memory，從不進 recovery／metadata／log，close 後釋放。
- [ ] 每個 persistence-confirmed mutation 恰好一次；reject、unknown、cancel、keystroke、純 drag／sort 為零次。
- [ ] 本 allowlist 的同一 mutation 只更新 DEV-109 aggregate／`draft.content`，`meetingActivities` delta 為 0；provider audit log 是否寫入不影響 capture 成功。
- [ ] 同 segment 同 task／field A→B→C 只顯示 A→C；A→B→A 移除 line、aggregate 與不再需要的 task link，且不產生 DEV-109 `meetingActivities`。
- [ ] note order 變更不捕捉；description compatibility alias 不造成雙份事件。
- [ ] 離開後的變更為零 capture；重開相同 draft 保留舊內容、新建 segment，第一張 mutation 使用新 before。
- [ ] F5 recovery 保留已投影內容並建立新 segment；snapshot v1/v2 schema/signature 不變，不推測或補抓舊 live state。
- [ ] late success、readback、retry、雙擊與 out-of-order completion 不跨 segment、不重複、不倒退 latest。
- [ ] 人工修改／刪除 projection line 時原文字保留，後續系統不覆寫；新變更另開 generation。
- [ ] AI source 只使用目前 raw content／legacy activities，不重複送 DEV-109 aggregate；不發出 project history request、不呼叫 import action。
- [ ] 第一次與重複 AI 整理維持一份主結構；同欄中間值不回流，人工／quick-note／import evidence 與 links 不遺失。
- [ ] AI quality、timeout、provider、merge 或 reconcile 失敗時原稿與 live evidence byte-for-byte 不變。
- [ ] 沒有新增 UI 容器、事件計數、時間軸、技術 ID 或常駐成功訊息；1440×900、1024×768、200% zoom 無 overflow／重疊。
- [ ] 390×844 既有 meeting unavailable 邊界不變；非 live existing meeting 不啟動 capture。
- [ ] DEV-007、011、012、020、021、022、024、066、094、106、108 targeted regression 通過。

## 11. ADR、migration、權限與 release boundary

- ADR：不需要。這是既有 live capture 的定向修正，使用現有 task mutation、meeting draft、local recovery 與 synthesis
  邊界；沒有新的 system of record、外部 API、跨服務一致性或組織治理決策。
- Migration：無。不得新增 table／column／RLS／Firestore rules／provider metadata namespace；舊 record 不回填。
- 權限：只有既有 task mutation 已獲准且保存成功時才可 capture；record draft 編輯與保存沿用現有權限。Capture 不新增
  capability，也不能記錄使用者無權保存的變更。
- Retention：segment、plaintext baseline、tickets、aggregates、mutation ids 與 anchors 只存在目前 tab runtime；DEV-106 recovery
  只保存既有 draft（已含可見 line）。Closed/reloaded segment 只留下可見 meeting content，不新增 audit archive。
- Release：本文件只授權 RD 實作與 local QA/QC；不授權 commit、push、PR、deploy、正式資料修補或 production release。

## 12. Stop Conditions 與受控技術債

命中任一條即停止施工並回 PM／技術主管：

- 需要把完整舊 description／note 寫入 recovery／provider／log，或需要用 provider history 才能完成 net aggregation。
- 需要修改 database schema、RLS、Firestore rules、remote recovery 或跨裝置 merge。
- 無法讓 task persistence truth 與 activity-log best effort 解耦，或 retry 無法保留原 mutation identity／baseline。
- 無法在不覆寫人工內容的前提下唯一 reconcile projection。
- Edge／deterministic synthesis 必須讀取過去專案變更，或必須自動觸發 `匯入專案變化`。
- 既有 DEV-106 recovery、DEV-024 human preserve 或 project-change protected evidence 需要被放寬才能通過。

受控技術債：可見 projection 以 `lineIndex + exactText` 在純文字 editor 中定位，人工修改後只能 detach，無法像 structured
editor node 永遠維持 stable identity。隔離點固定在 `meetingLiveTaskChanges.ts`；若未來 editor 支援 stable structured live-change
node，另案遷移並移除此 anchor。任何錯配或覆寫人工文字都比 detach 嚴重，直接判 Fail。

## 13. RD 技術主管審查決議（2026-09-08）

- 結論：`有條件通過`；文件層 P0／P1 阻擋已消除，可依 WP-109-A→E 進入實作。條件是施工與 QA 必須證明
  persistence-confirmed、volatile-data privacy、reload 新 segment、system-line exact-once 與 AI failure preserve，不能以 source scan 代替行為證據。
- 已移除：custom symbolic／Myers composition、DEV-109 `meetingActivities` 第二份 truth、recovery nested schema／signature 擴張、
  live-only Edge event type與 reload 續接舊 segment。
- 最小架構：唯一可持久化 live evidence 是既有 `draft.content`；唯一計算狀態是目前分頁的 volatile runtime，離開／reload／logout 即釋放。
- 詳細發現、最短根因鏈、修正理由與驗證條件見 `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-109.md`。

使用思考習慣：#問對問題、#系統描繪、#可驗證性、#當責
