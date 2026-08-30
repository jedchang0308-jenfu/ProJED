# SPEC-093：典藏任務與子任務資產化

- 狀態：`RD Implementation In Progress / Human Confirmed / local static 48＋TypeScript＋build＋isolated DB 25-check PASS / browser B00-B19 21/21 PASS / required regressions PASS / 未 Release`
- 日期：2026-08-28
- 對應：DEV-093
- 父交付點：DEV-002、DEV-007、DEV-008、DEV-016、DEV-088
- 風險：High（forward-only schema、不可變資產、子樹快照、transaction RPC、RLS／role capability 與跨 domain local projection）
- Spec Impact：`Compatible record-family extension + DEV-016 Intentional extension`
- 來源：`USER-20260828-TASK-COLLECTION-WITH-SUBTREE`、`USER-20260828-RECORDS-SEPARATE-SECTIONS`

## 1. 交付結果與已確認決策

DEV-093 把仍在運作的任務子樹轉成可長期查閱的唯讀案例資產，並在資產保存成功後把來源根任務移出 active 看板。產品名稱、操作名稱與紀錄庫分區名稱均固定為「典藏任務」。

本規格固定以下單一路徑，RD 不需再做產品選型：

1. 新增第三種 `KnowledgeRecord` family：內部型別 `task_collection`，不偽裝成 `work_log`。
2. 一次典藏只建立一筆資產，收錄選定 root 與同看板完整 canonical descendant subtree；子任務不拆成多筆紀錄。
3. 典藏資產是 immutable snapshot。來源還原後再次典藏會建立 `v2`、`v3`；不得覆寫舊版本。
4. 同一 `operationId` 的網路重試只回傳既有結果，不建立新版本；新的使用者確認才建立新 operation／版本。
5. 新增 `collect_task` board capability。owner／admin／project_manager／member 預設可典藏，viewer 不可典藏但可依 `read_board` 閱讀 project-visible 典藏。
6. Supabase 以單一 authoritative transaction 完成「驗證來源 → 建立典藏 → 建立尚可成立的 links → 封存 root → 寫 activity」；任一步失敗都不建立資產且不移出來源。
7. 紀錄庫仍是單一頂層頁面，但資料固定分成 `典藏任務`、`會議紀錄`、`個人工作紀錄` 三個同層 section，不提供混合「全部」清單。
8. 本期資產仍屬 board scope；來源 task 永久刪除後可讀，但來源 board／workspace 刪除後不保證存續。
9. `task_collection` 第一階段不進入既有 record editor、草稿、undo 或 RAG mirror；只提供 section search 與唯讀詳情，`rag_enabled=false`、`source_document_id=null`。

## 2. 名詞與不變量

| 名詞 | 契約 |
|---|---|
| source root | 使用者發起典藏的 active task，可是 board root 或任一 child。 |
| canonical subtree | source root 加上依 `parentId`／`parent_id` 解析的同看板全部 descendants；包含已先行封存的 descendant，且以 cycle-safe traversal 去重。 |
| collection series | 同一 `tenant + project + source_root_item_id` 的所有成功典藏版本。 |
| collection operation | 一次使用者確認；以 client 先產生的 UUID `operationId` 識別並跨 retry 保持不變。 |
| collection asset | `record_type='task_collection'`、`status='published'`、`visibility='project'` 的不可變 KnowledgeRecord。 |
| preview token | provider 依 canonical subtree、相關資料版本與計數生成的 opaque token；commit 前必須重新驗證。 |

必守不變量：

- `asset exists` 與 `source root archived` 必須在同一 durable commit 同時成立；不得存在 Brief 階段所容許的「資產成功、來源仍 active」半成功狀態。
- `task_collection` 的人類可讀正文與 structured snapshot 不依賴 `record_task_links`。來源 task 永久刪除只可讓 links cascade 消失，不得破壞資產詳情。
- 典藏不是 task status，也不是 DEV-088 生命週期的第四個終點。來源仍沿用 `isArchived=true` 與回收桶還原／永久刪除。
- 來源 root 未封存前，前端不得先從 `useWbsStore` 移除或標成 archived；本地 projection 只能在 backend success result 後收斂。
- 典藏不建立一般 undo command。需要返回工作狀態時，使用者從回收桶還原來源；已建立資產保留。
- 私人會議／工作紀錄不得被複製進 project-visible 典藏正文或 metadata。

## 3. 使用者流程與狀態轉換

1. 具權限使用者從任務詳情 overflow 或支援完整 action catalog 的任務選單選擇「典藏任務」。mobile compact action rail 仍只保留 DEV-088 的四個常駐動作；典藏放在完整／overflow menu。
2. client 建立 `operationId`，呼叫 `taskCollectionService.preview()`。preview 回傳 root 名稱、總任務數、已封存 descendant 數、dependency／activity／related-record 計數、限制檢查與 `previewToken`。
3. 確認對話框顯示「典藏〈任務名稱〉與 N 個任務？」及「成功後來源會移出看板，可從回收桶還原」。可輸入最多 500 字的「典藏說明（選填）」，不得要求重填既有內容。
4. 確認後以同一 `operationId + previewToken` 呼叫 `collect()`。操作期間 action、重複確認與來源 drag/move/edit disabled，畫面保留來源並顯示局部 pending。
5. backend 成功後回傳 asset summary 與 archived root identity；store 才更新 root `isArchived=true`、刷新紀錄庫 summary，並顯示低干擾成功訊息與「查看典藏」。
6. 「查看典藏」切到紀錄庫 `典藏任務` section 並開啟剛建立的唯讀詳情；關閉詳情後仍留在同一 section。

以下狀態不得混用：

| 狀態 | 來源 task | 典藏 asset | UI 結果 |
|---|---|---|---|
| preview／confirm | 不變 | 無 | 只顯示計數與警示 |
| pending | 保持可見、不可再次 mutation | 尚未宣稱存在 | 局部進度，禁止假成功 |
| success | root `isArchived=true`；descendant 由 parent chain 離開 active projection | 新增 immutable version | 成功回饋＋查看典藏 |
| cancelled／failed | 完全不變 | 無新資產 | 對話框關閉或保留可重試錯誤 |
| retry after lost response | 依既有 operation result | 回傳同一筆 | 不增加版本、不重複封存 |
| restore then new collection | 再次 active | 建立下一版本 | 舊版本維持不變 |

## 4. Source selection 與 snapshot contract

### 4.1 Canonical source

- root 必須存在於要求的 workspace／board、`isArchived=false`，且不在 workbench placement pending／跨看板搬移 pending 狀態。
- traversal 只追同一 project 的 canonical `parent_id`。偵測 cycle、重複 storage identity、缺失 root、跨 project parent 或 commit 前 source version 改變時 fail closed。
- 已封存 descendant 仍納入 snapshot，並保存其原 `isArchived` 值；preview 必須另外揭露其數量。
- 典藏 selected child 時只收錄該 child 與 descendants，不向上收錄 ancestors。
- 依賴只分成 `internal`（兩端均在 subtree）與 `boundary`（恰一端在 subtree）。外部端點只保存 ID、當下標題與方向，不把外部任務納入 nodes。

### 4.2 `task-collection-v1`

`knowledge_records.metadata` 必須含以下版本化 JSON；欄位缺失或 schema 不支援時，viewer 顯示 typed incompatible state，不得猜測：

```ts
export type TaskCollectionHistoryCoverage =
  | 'available_events'
  | 'no_events'
  | 'retention_limited';

export interface TaskCollectionDetailNoteSnapshot {
  id: string;
  title: string;
  content: string;
  richContent: TaskDetailNote['richContent'] | null;
}

export interface TaskCollectionNodeSnapshot {
  id: string;
  storageId: string;
  parentId: string | null;
  parentStorageId: string | null;
  order: number;
  title: string;
  description: string | null;
  detailNotes: TaskCollectionDetailNoteSnapshot[];
  status: TaskNode['status'];
  isArchived: boolean;
  nodeType: NonNullable<TaskNode['nodeType']>;
  startDate: string | null;
  endDate: string | null;
  isDurationLocked: boolean;
  assignees: Array<{ userId: string; displayName: string | null }>;
  collaborators: Array<{ userId: string; displayName: string | null }>;
  tags: Array<{ id: string; name: string; color: string }>;
  createdAt: number;
  updatedAt: number;
}

export interface TaskCollectionDependencySnapshot {
  id: string;
  scope: 'internal' | 'boundary';
  from: { taskId: string; storageId: string | null; title: string; side: DependencySide };
  to: { taskId: string; storageId: string | null; title: string; side: DependencySide };
  offset: number;
}

export interface TaskCollectionActivitySnapshot {
  id: string;
  eventType: string;
  entityId: string;
  actor: { userId: string | null; displayName: string | null };
  occurredAt: number;
  payload: Record<string, unknown>;
}

export interface TaskCollectionRelatedRecordSnapshot {
  id: string;
  type: EditableKnowledgeRecordType;
  title: string;
  occurredAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  visibility: Exclude<KnowledgeRecordVisibility, 'private'>;
  linkRoles: RecordTaskLinkRole[];
  excerpt: string;
}

export interface TaskCollectionSnapshotV1 {
  schema: 'task-collection-v1';
  collectedAt: number;
  collectedBy: { userId: string; displayName: string | null };
  annotation: string | null;
  source: {
    workspaceId: string;
    workspaceTitle: string;
    boardId: string;
    boardTitle: string;
    rootTaskId: string;
    rootStorageId: string;
  };
  nodes: TaskCollectionNodeSnapshot[];
  dependencies: TaskCollectionDependencySnapshot[];
  history: {
    coverage: TaskCollectionHistoryCoverage;
    events: TaskCollectionActivitySnapshot[];
  };
  relatedRecords: {
    coverage: 'project_visible_only';
    records: TaskCollectionRelatedRecordSnapshot[];
  };
  counts: {
    tasks: number;
    archivedDescendants: number;
    dependencies: number;
    activities: number;
    relatedRecords: number;
  };
}
```

每個 node snapshot 至少保存：stable client/storage identity、parent identity、ordered sibling position、title、description、全部 detail notes canonical content、status、`isArchived`、node type、日期、duration lock、assignee／collaborator IDs 與當下顯示名稱、tag IDs／名稱／顏色、created／updated time。不得只保存目前畫面已渲染的欄位。

#### 4.2.1 Canonical row mapping 與 null normalization

snapshot 是 provider-neutral wire contract，不得把 JavaScript `undefined`、Supabase alias 或畫面 fallback 寫入 metadata。欄位 mapping 固定如下：

| Snapshot 欄位 | Supabase canonical source | local-test／normalization |
|---|---|---|
| `node.id`／`source.rootTaskId` | `wbs_items.legacy_node_id ?? wbs_items.id` | `TaskNode.id`；不得用陣列 index產生 |
| `node.storageId`／`source.rootStorageId` | `wbs_items.id` | `TaskNode.storageId ?? TaskNode.id`，同一 fixture內必須唯一且穩定 |
| `parentId`／`parentStorageId` | parent row 的 legacy-or-id／UUID | root 固定兩者皆 `null`；非 root 必須兩者同時可解析 |
| `description`／dates | nullable row columns | 缺值一律 JSON `null`，不得省略 key |
| `detailNotes` | `detail_notes` JSON array | 缺值為 `[]`；保留array order，逐筆驗`id/title/content`，缺`richContent`正規化為`null` |
| `nodeType` | `item_type` | 缺值只在 legacy local fixture正規化為 `'task'` |
| `isArchived`／`isDurationLocked` | non-null DB boolean | local缺值正規化為 `false` |
| `createdAt`／`updatedAt` | `created_at/updated_at` | UTC epoch milliseconds整數；缺失 legacy值固定 `0`，不得取 materialize當下時間 |
| assignees／collaborators | canonical UUID arrays＋profile display name | 去重後依 `userId ASC`；找不到 profile時 `displayName=null` |
| tags | `wbs_item_tags`＋`task_tags` | 依 `task_tags.sort_order ASC, id ASC`，顯示 identity採 legacy-or-id |
| dependency `id`／endpoints | dependency legacy-or-id；端點同時保存 task ID與storage ID | `offset`缺值為 `0`；internal兩端均有storage ID，boundary外部端`storageId=null` |
| activity time／actor | `created_at`、`actor_id`＋profile | epoch milliseconds；缺 actor/profile以 `null` 表示 |
| related record time | `occurred_at/started_at/ended_at` | 各自缺值為 `null`；不得用 `updated_at` 假補事件時間 |

`relatedRecords.linkRoles`去重後依enum字面值升冪；related records本身依record storage UUID升冪。所有時間轉換採 `floor(extract(epoch from value) * 1000)::bigint`／`Date.getTime()`；所有使用者字串保留原 Unicode內容，只在 `content` projection render時 escape。asset row本身固定：`title=root.title`、`occurred_at=collectedAt`、`recorded_by/created_by/updated_by=auth.uid()`、`participants_text=null`。root archive update使用同一 `collectedAt` 寫入 `updated_at`，因此 response lost後可由asset重建 `sourceRootUpdatedAt=collectedAt`。

#### 4.2.2 Provider-neutral canonical serialization

hash input 不直接使用未定義的 `JSON.stringify` 或 provider預設 JSON whitespace。`src/features/taskCollection/canonicalJson.ts` 與 SQL private helper共同實作 `canonicalJsonV1`：只接受 object、array、string、boolean、null與安全整數；object keys依 UTF-8 byte order升冪、array保留已固定順序、string使用 JSON escape、輸出無額外 whitespace，所有 optional欄位須先依4.2.1正規化成明確 `null`／`[]`／default。NaN、Infinity、fractional timestamp、duplicate identity或未知 object prototype一律 `SNAPSHOT_INVALID`。

`sourceMaterialV1`、preview token與final snapshot hash全部以 `canonicalJsonV1(...)` 的 UTF-8 bytes計算 SHA-256 lowercase hex。SQL與TypeScript verifier至少固定一份 CJK、emoji、反斜線、換行、null與空陣列 golden vector；任一 provider產生不同 bytes即不得進入 UI wiring。

每個 activity snapshot 保存 source event ID、event type、entity identity、actor ID／當下顯示名稱、timestamp 與經 allowlist 清理的 payload。Supabase 直接依 canonical storage IDs 讀取全部「目前資料庫中可取得」的 task activity，排序固定為 `created_at ASC, id ASC`；文件不得把 `available_events` 說成現實世界的完整稽核軌跡。零筆時顯示「無可用歷程」，不可補造。local-test 若偵測既有 1,000 筆 retention 上限已命中，標記 `retention_limited`。

related record 只收錄使用者本來可讀且 `visibility <> 'private'` 的 meeting／work_log；不遞迴嵌入其他 task_collection。每筆保存 ID、type、title、time、visibility、link role 與最多 2,000 字的 plain-text excerpt。任何 private record 直接排除，且不在 project-visible asset 洩漏其標題、數量或存在事實。

`content` 由同一 snapshot deterministic 產生可搜尋、可閱讀的純文字／Markdown-like projection，包含來源、版本、任務樹、歷程與關聯紀錄摘要；輸出需 escape 不可信文字，不允許 raw HTML。`TaskCollectionDetail` 讀 structured snapshot render，`content` 作 search、fallback 與未來 export，不進現有 Lexical record editor。

### 4.3 Hard limits

第一版固定以下 preflight hard limits；任一超限即整體失敗，來源不封存，也不以截斷內容冒充成功：

```ts
export const TASK_COLLECTION_LIMITS = {
  taskCount: 500,
  dependencyCount: 1_000,
  activityCount: 5_000,
  relatedRecordCount: 200,
  relatedRecordExcerptChars: 2_000,
  snapshotUtf8Bytes: 2 * 1024 * 1024,
  contentUtf8Bytes: 512 * 1024,
  annotationChars: 500,
} as const;
```

超限錯誤固定說明「此任務樹超過目前典藏上限，尚未移出看板」，並列出超限項目。第一版不提供只典藏部分 descendants 的繞過選項。

## 5. Typed domain 與 provider contract

### 5.1 Domain types

- `KnowledgeRecordType` 擴充為 `'meeting' | 'work_log' | 'task_collection'`。
- 新增 `EditableKnowledgeRecordType = 'meeting' | 'work_log'`；`KnowledgeRecordInput.type` 必須收斂到 editable type，避免 generic upsert 建立或覆寫 collection。
- `KnowledgeRecord` 改為可辨識 union，`TaskCollectionRecord` 必須帶 `collectionVersion`、`collectionOperationId`、`collectionSnapshotHash`、`sourceRootStorageId` 與 `TaskCollectionSnapshotV1`。
- `recordService.listByProject/listByNode/upsert/checkpointDraft/delete` 只處理 meeting／work_log。遇到 task_collection ID 必須回 typed immutable error，不得 route 到 editor 或 generic archive。
- `ActivityEventType` 新增 `task_collected`，payload 至少包含 `recordId`、`sourceRootTaskId`、`collectionVersion`、`taskCount`。

public discriminated shape 固定如下；共用 identity/audit欄可抽 `KnowledgeRecordBase`，但不得再以單一 interface讓 collection誤入 editable flow：

```ts
export type EditableKnowledgeRecordType = 'meeting' | 'work_log';
export type KnowledgeRecordType = EditableKnowledgeRecordType | 'task_collection';

export interface EditableKnowledgeRecord extends KnowledgeRecordBase {
  type: EditableKnowledgeRecordType;
  collectionVersion?: never;
  collectionOperationId?: never;
  collectionSnapshotHash?: never;
  sourceRootStorageId?: never;
  snapshot?: never;
}

export interface TaskCollectionRecord extends KnowledgeRecordBase {
  type: 'task_collection';
  status: 'published';
  visibility: 'project';
  ragEnabled: false;
  sourceDocumentId?: null;
  collectionVersion: number;
  collectionOperationId: string;
  collectionSnapshotHash: string;
  sourceRootStorageId: string;
  snapshot: TaskCollectionSnapshotV1;
}

export type KnowledgeRecord = EditableKnowledgeRecord | TaskCollectionRecord;
export type KnowledgeRecordInput = EditableKnowledgeRecordInput;
export type RecordsSection = 'task_collection' | 'meeting' | 'work_log';

export interface DeleteImpact {
  taskCollectionCount: number;
}
```

`openNewRecord` 參數、`RecordDraft.type`、`toRecordInput` 與 `recordService.upsert/checkpointDraft/delete` 全部使用 editable type。需要同時顯示兩 family的 consumer必須用 exhaustive `switch(record.type)`；default branch只能 `assertNever`／incompatible，不得用 `type === 'meeting' ? meeting : work_log`。

### 5.2 Service API

`src/services/dataBackend.ts` 新增獨立 service，不把 transactional collection 塞進 `recordService.upsert()`：

```ts
export interface TaskCollectionPreviewCommand {
  operationId: string;
  workspaceId: string;
  boardId: string;
  rootTaskId: string;
}

export interface TaskCollectionCommitCommand extends TaskCollectionPreviewCommand {
  previewToken: string;
  annotation?: string;
}

export interface TaskCollectionPreview {
  previewToken: string;
  rootTitle: string;
  sourceTaskIds: string[];
  counts: TaskCollectionSnapshotV1['counts'];
  withinLimits: boolean;
  violations: TaskCollectionLimitViolation[];
}

export interface TaskCollectionResult {
  recordId: string;
  operationId: string;
  sourceRootTaskId: string;
  collectionVersion: number;
  collectedAt: number;
  sourceRootUpdatedAt: number;
  taskCount: number;
  summary: TaskCollectionSummary;
}

export interface TaskCollectionListQuery {
  search?: string;
  cursor?: { occurredAt: number; id: string };
  limit?: number;
}

export interface TaskCollectionSummary {
  recordId: string;
  title: string;
  collectionVersion: number;
  occurredAt: number;
  sourceBoardTitle: string;
  taskCount: number;
  historyCoverage: TaskCollectionHistoryCoverage;
}

export interface TaskCollectionSummaryPage {
  items: TaskCollectionSummary[];
  nextCursor: TaskCollectionListQuery['cursor'] | null;
}

export interface TaskCollectionLimitViolation {
  field: keyof typeof TASK_COLLECTION_LIMITS;
  actual: number;
  limit: number;
}

export interface TaskCollectionService {
  supported: boolean;
  preview(command: TaskCollectionPreviewCommand): Promise<TaskCollectionPreview>;
  collect(command: TaskCollectionCommitCommand): Promise<TaskCollectionResult>;
  getOperationResult(workspaceId: string, boardId: string, operationId: string): Promise<TaskCollectionResult | null>;
  listSummaries(workspaceId: string, boardId: string, query: TaskCollectionListQuery): Promise<TaskCollectionSummaryPage>;
  listLinkedSummaries(workspaceId: string, boardId: string, taskId: string, limit?: number): Promise<TaskCollectionSummary[]>;
  getById(workspaceId: string, boardId: string, recordId: string): Promise<TaskCollectionRecord>;
}
```

collection summary query 使用 cursor pagination，預設／最大 `limit=50`，排序為 `occurred_at DESC, id DESC`；cursor 同時帶 time 與 id，不用 offset。public summary RPC 只回傳明列的 scalar summary，不把 `content`／完整 `metadata` 傳到 client；詳情才以 `getById()` 讀完整 snapshot。`listLinkedSummaries` 只供 `TaskRecordTimeline` 顯示仍有有效 link 的唯讀 row，固定最大 50 筆，不可取代紀錄庫分頁。

SQL JSON boundary使用 snake_case，只有 adapter轉為上列camelCase type；不得讓 component直接讀RPC raw JSON。preview response固定包含 `operation_id/preview_token/root_task_id/root_title/source_task_ids/counts/within_limits/violations`；collect response固定包含 `record_id/operation_id/source_root_task_id/collection_version/collected_at/source_root_updated_at/task_count/summary`。`counts`與`violations`的keys同 `TASK_COLLECTION_LIMITS` domain names；adapter先做runtime shape validation，缺欄、額外未知version或非安全整數皆映射 `SNAPSHOT_INVALID`。

`getOperationResult()` 不新增第四支mutation/definer RPC；dedicated Supabase adapter在目前 tenant/project RLS下以 `record_type='task_collection' and collection_operation_id=<operationId>` 直接選取單筆 collection columns、`title/occurred_at`與 `metadata.taskCollection`的必要summary欄。查無資料才回 `null`；多筆、hash不符或scope不符fail closed。`getById()`同樣由dedicated adapter依 `id + tenant + project + record_type`讀完整row並驗hash。`listLinkedSummaries()`以 `record_task_links.item_id` join published task_collection，只選scalar summary、依 `occurred_at DESC,id DESC`、limit 1～50；source link cascade後自然不再出現在timeline，但不影響紀錄庫detail。這三條read path不得經generic `recordService`或editable mapper。

`collect()` 在 preview 已成功而 RPC 或 detail read 發生未知／response-lost error 時，必須先呼叫同一 `operationId` 的 `getOperationResult()`；讀到既有 immutable row 即重建同一 `TaskCollectionResult` 回傳，只有查無 row 才保留原錯誤供 retry。這條 recovery 不得改用新的 operation id、不得建立第二版本，也不得以 UI toast 或 local projection 判定成功。

`knowledge_records.metadata` 的 wire shape 固定為 `{ "taskCollection": TaskCollectionSnapshotV1 }`，不得把 snapshot 欄位散落在 metadata root。`TaskCollectionRecord` mapper 必須同時驗證 `record_type`、collection columns、`metadata.taskCollection.schema` 與 snapshot hash；任一不符回 `SNAPSHOT_INVALID`／incompatible detail state，不把不可信 JSON cast 成有效資產。

`search` trim 後為 0 或 2～100 Unicode code points；1 字或超長 query 不送出。Supabase 以 escaped literal substring 查 `title + content`，不得讓 `%`／`_` 被當成未授權 wildcard。搜尋仍使用同一 section、RLS、cursor 與 50 筆 page，不能只搜尋目前已載入頁。

### 5.3 Provider support matrix

| Provider | 第一版契約 |
|---|---|
| Supabase | 必做；preview 與單一 transaction RPC，authoritative nodes／dependencies／activity／related records，完整 RLS／capability／idempotency。 |
| local-test | 必做；用與 Supabase 相同 pure snapshot builder／limits，透過 journaled command 或 before-state rollback 模擬 atomic commit，支援逐階段 fault injection 與 reload 驗證。 |
| Firebase／Firestore | 明確不支援；`supported=false`、不顯示 action，直接呼叫回 `BACKEND_UNSUPPORTED`。不得以空 activity 假裝成功，也不得沿用 generic record upsert。後續支援需另補 transaction、Rules、history source 與 document-size contract。 |

## 6. Supabase forward-only schema 與 transaction

RD 實作時必須以 `supabase migration new` 建立新的 forward-only migration；本 SPEC 不預造 migration timestamp 或修改既有 migration。

### 6.1 `knowledge_records`

1. 將 `record_type` check 擴充為 `meeting | work_log | task_collection`。
2. 新增 nullable columns：
   - `collection_operation_id uuid`
   - `collection_version integer`
   - `collection_schema_version smallint`
   - `collection_snapshot_hash text`
   - `source_root_item_id uuid`（刻意不設 FK，來源永久刪除後仍保留 identity）
3. 新增 shape constraint：task_collection 必須五欄皆非 null、`collection_version >= 1`、`collection_schema_version=1`、`status='published'`、`visibility='project'`、`occurred_at is not null`、`legacy_record_id/started_at/ended_at/participants_text/source_document_id is null`、`rag_enabled=false`、`metadata->'taskCollection'->>'schema'='task-collection-v1'`；非 task_collection 的五個 collection columns 必須全為 null。
4. 新增 byte-shape constraint：task_collection 的 `octet_length(content) <= 524288` 且 `octet_length(convert_to(metadata::text, 'UTF8')) <= 2097152`。migration 先對現存資料 preflight，再以 `NOT VALID` 加 constraint 並立即 `VALIDATE CONSTRAINT`；不得使用 PostgreSQL 不支援的 `ADD CONSTRAINT IF NOT EXISTS`。
5. 新增 partial unique indexes：
   - `(tenant_id, project_id, collection_operation_id)` where task_collection
   - `(tenant_id, project_id, source_root_item_id, collection_version)` where task_collection
6. 新增 summary cursor index `(tenant_id, project_id, occurred_at desc, id desc)`，partial predicate 固定 `record_type='task_collection' and status='published'`。
7. migration 以 `create extension if not exists pg_trgm with schema extensions` 啟用 extension；search index expression 固定 `lower(title || E'\n' || content) extensions.gin_trgm_ops`，partial predicate 同上。summary RPC 以相同 `lower(...) like <escaped literal pattern> escape '\'` 與 predicate 查詢；`%`、`_`、`\` 依序 escape。isolated PostgreSQL 以具選擇性的 fixture 與 `EXPLAIN (FORMAT JSON)` 證明命中該 GIN index，不接受無界全表掃描。
8. 為 activity snapshot 新增 `(tenant_id, project_id, entity_table, entity_id, created_at, id)` index；equality columns 在前、時間／id 在後。

migration 名稱固定以 `supabase migration new dev_093_task_collection_assets` 產生；RD 必須使用 CLI 回傳的實際 timestamp，並將該唯一新檔加入 verification script，不能手寫 timestamp 或改舊 migration。constraint／index 名稱固定使用 `knowledge_records_task_collection_*`／`activity_events_task_collection_lookup_idx` 前綴，避免日後 verifier 只能靠 SQL 片段猜測物件。

### 6.2 Permission migration

- `PermissionCapability` 與 board permission UI 新增 `collect_task`。
- default matrix：owner／admin／project_manager／member 加入，viewer 不加入。
- 現有 `board_role_permissions` rows 只在 capabilities 原本包含 `delete_task` 時 backfill `collect_task`；原本沒有 `delete_task` 的 custom role 不自動擴權。owner 仍由既有 normalization 保持完整能力。
- 建立 `private.current_user_can_collect_project_task(tenant, project)`，解析 active workspace membership、workspace owner/admin 與 board role，讀取 board-specific capabilities；無 row 時使用與 client 相同的 default。不得只檢查 `authenticated` 或 client boolean。

`collect_task` 包含為建立典藏所需的一次性 source task、task activity 與 project-visible linked-record materialization 權限，但不授予一般 audit log、private record 或跨 board 讀取權。

effective capability 算法固定如下：active tenant owner 永遠 allow；其餘使用者收集「active tenant admin role（若有）」與「同 tenant/project 的 project member role（若有）」兩組 role，任一 role 的 explicit row 含 `collect_task` 即 allow；沒有 explicit row 時才依 default matrix 判斷。沒有 active tenant membership、沒有可讀 project role或只有 viewer 且未被 explicit grant 時 deny。client `normalizeBoardRolePermissionMatrix` 與 SQL helper 必須共用同一 fixture matrix 驗證，禁止兩套 default 漂移。

### 6.3 RLS、grants 與 immutability

- generic knowledge record INSERT policy 增加 `record_type <> 'task_collection'`；generic UPDATE 的 `USING` 與 `WITH CHECK`、DELETE 的 `USING` 皆排除 task_collection。
- generic record_task_links INSERT／UPDATE／DELETE policies 排除其 parent record 為 task_collection；SELECT 維持由 parent record read policy 決定。
- task_collection 只能由 dedicated RPC 建立；沒有 client direct UPDATE／DELETE path，第一版也不提供刪除典藏 UI。
- public／anon 對新增 function 與 helper 一律 `REVOKE ALL`。只對 `authenticated` grant public RPC execute；private helper 不 grant authenticated。shared tables 只保留 meeting／work_log 現有必要 authenticated grants，真正 row authorization 仍由 RLS 與 dedicated RPC 雙層限制。
- RPC 若需 `SECURITY DEFINER` 才能原子跨表寫入，必須使用空／受控 search path、完整 schema qualification、第一行 auth check、明確 capability check、scope check、immutable shape check與 explicit revoke/grant；不得暴露 service-role key或信任 user metadata。

新增 function 的 privilege baseline 固定為：所有 private helpers `security definer set search_path=''`，只由 owner／public wrapper 呼叫，`public/anon/authenticated` 均無 execute；public preview／collect RPC 為 `security definer set search_path=''` 且只 grant `authenticated, service_role`；summary RPC 為 `security invoker set search_path=''`，依既有 SELECT RLS，只 grant `authenticated, service_role`。每支 function 都必須以完整 argument signature 執行 revoke/grant，不能只 revoke function name。

### 6.4 `collect_task_subtree` transaction

public RPC signature 固定，不得由 client 傳 collection version、snapshot、content、actor 或 task list：

```sql
public.preview_task_collection_subtree(
  p_operation_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_root_item_id uuid
) returns jsonb

public.collect_task_subtree(
  p_operation_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_root_item_id uuid,
  p_preview_token text,
  p_annotation text default null
) returns jsonb

public.list_task_collection_summaries(
  p_tenant_id uuid,
  p_project_id uuid,
  p_search text default null,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 50
) returns table (
  record_id uuid,
  title text,
  collection_version integer,
  occurred_at timestamptz,
  source_board_title text,
  task_count integer,
  history_coverage text
)
```

Supabase adapter 先沿用 `resolveWorkspaceId`、`resolveProjectId`、`requireNodeId` 把 legacy/client identity 解析為 UUID；RPC 不接受 text alias。`p_limit` 只接受 1～50；search 只接受 trim 後 0 或 2～100 Unicode code points，否則 `22023`。RPC domain error 統一 `raise exception using errcode='P0001', message='TASK_COLLECTION:<CODE>'`，可選 `detail` 放無敏感資訊的 JSON；adapter 只解析完整 prefix，其他 PostgreSQL／transport error 映射 `TRANSIENT` 或 `UNKNOWN`，禁止以英文 message 模糊比對。

preview 與 commit 共用 private materializer。materializer 先產生不含 `collectedAt/collectedBy/annotation/version` 的 `sourceMaterialV1`，其中 nodes 依 `storageId ASC`、dependencies 依 `id ASC`、activities 依 `created_at ASC, id ASC`、related records 依 `id ASC` 固定排序；UI 以 `parentStorageId + order + storageId` 重建人類可讀樹。`sourceHash = SHA-256(canonicalJsonV1(sourceMaterialV1) UTF-8)`；`previewToken = 'v1:' + SHA-256(canonicalJsonV1(['task-collection-preview-v1', operationId, auth.uid, tenant, project, root, sourceHash]) UTF-8)`。commit 重算 source material/token，完全相等才繼續。final snapshot 再加入 transaction timestamp、actor snapshot、annotation 與 server version；`collection_snapshot_hash = SHA-256(canonicalJsonV1({ snapshot, content }) UTF-8)`。SQL helper與TypeScript serializer必須通過4.2.2同一golden vectors，不能以`jsonb::text`與`JSON.stringify`碰巧相等作契約。

activity materialization 只納入 `entity_table='wbs_items' and entity_id in subtree`，以及 `entity_table='wbs_dependencies' and entity_id in captured dependency ids`。payload sanitizer 只保留 `taskId/taskTitle/dependencyId/fromId/fromSide/toId/toSide/offset/source/sourceTaskId/operationId/before/after`；`before/after` 再只保留 `status,parentId,order,kanbanStageId,startDate,endDate,isDurationLocked,isArchived,assigneeIds,assigneeId,assigneeNames,collaboratorIds,collaboratorNames,tagIds,tagNames,offset`。未知 key、email、token、free-form audit payload 一律捨棄。

related records 只納入 `record_type in ('meeting','work_log')`、`status='published'`、`visibility <> 'private'` 且透過任一 subtree link 命中的資料；同一 record 合併 link roles。excerpt 先把 task mention token轉為顯示標題、正規化換行／空白，再截成 2,000 Unicode code points。security-definer materializer 必須自行套此 predicate，不可假設 RLS 會保護 definer function。

單一 RPC 的順序固定如下：

1. 先以 `(tenant, project, operationId)` 查 idempotency；已有成功 row且 root identity 相同時直接回傳同一結果，不重跑封存或版本配置；operation 已被其他 root 使用時回 `OPERATION_CONFLICT`。
2. 驗證 auth、`collect_task`、tenant／project membership、root scope 與 `is_archived=false`。
3. 先鎖 root，再反覆「解析 subtree IDs → 依 UUID ASC `FOR UPDATE` 鎖定 → 重算 IDs」直到集合穩定；FK parent lock 防止鎖定後新增／移入 child。偵測 cycle、跨 project parent、duplicate storage identity 或集合不穩定即回 `SOURCE_INVALID_TREE`。相關資料與 hard limits 以同一 statement snapshot materialize，重算 preview token；與 request 不同時回 `SOURCE_CHANGED`，不寫入。function 設 `lock_timeout='3s'`、`statement_timeout='15s'`，lock timeout 映射 `SOURCE_BUSY`。
4. 以 locked `source_root_item_id` 序列化同一 series，取 `max(collection_version)+1`；unique index 是最後防線，不得由 client 計算版本。
5. 建立 deterministic snapshot／content／SHA-256 hash，insert task_collection row；建立 root=`main`、descendants=`related` 的 links。link 建立失敗不可被 best-effort 跳過。
6. 只更新 source root `is_archived=true`；不得逐一改 descendant，也不得刪 dependency。
7. 在同一 transaction 寫一筆 `task_collected` activity，然後回傳 result。任何 SQL／serialization／constraint error 使整筆 rollback。

同 operation 併發若在 unique index 競爭，loser 等 winner 完成後只可 readback 同一 row；若 payload/root 不同回 `OPERATION_CONFLICT`。同 source 的不同 operations 因 root row lock 序列化；第一筆成功後第二筆看到 archived root 必須失敗，不得同時配置 v1/v2。來源從回收桶還原後的新 operation 才能取得下一版本。

RPC 回傳後，client 以 result 收斂 local store；不得再呼叫現行 non-awaited `archiveNode()` 作第二次 persistence。

## 7. 紀錄庫與唯讀詳情 UI

### 7.1 Section contract

- 紀錄庫只有一個頁首與內容區；section control 使用 tab／等價 selection semantics，順序固定 `典藏任務`、`會議紀錄`、`個人工作紀錄`。
- 不提供跨 family 的「全部」清單。搜尋、排序、cursor、loading、empty、error、筆數與 retry 全都以目前 section 為 scope；切換時取消／忽略前一 section 的 stale response。
- 桌機／筆電 cold entry 預設 `會議紀錄`；符合 SPEC-069 的 coarse pointer 或 `<=640px` 環境不 render meeting rows／section，該環境只顯示 `典藏任務` 與 `個人工作紀錄`，cold default 為 `個人工作紀錄`。這是既有 mobile meeting restriction，不代表兩類資料混在一起。
- 從「查看典藏」進入時無論 viewport 都直接選 `典藏任務` 並開啟指定 ID；一般 cold default 不因這次 deep-link 永久改寫。
- 320／390px section control 不可 icon-only；可在控制列自身單向水平捲動，但不得造成頁面與內容列表雙重水平 overflow。

### 7.2 Collection list／detail

- summary row 顯示標題、`vN`、典藏時間、來源看板、收錄任務數與歷程 coverage；標題本身開啟詳情，不增加「查看」欄。
- section 內沒有新增按鈕；典藏只能從 task context 發起。空白狀態只陳述「尚無典藏任務」，不新增無法就地完成的 CTA。
- `TaskCollectionDetail` 是獨立 read-only renderer，不開 `RecordSidebar`、不建立 draft、不顯示儲存／發布／封存紀錄 action。
- detail 顯示來源／版本／典藏者／時間／說明、可收合任務樹、dependency、歷程與相關紀錄片段；選取任一快照節點後，必須以一般任務詳情同等資訊密度呈現標題、內容／備註、日期、工期、狀態、主責／協作與標籤，並沿用共用備註 renderer、狀態樣式、指派元件與 tag chip。內容只讀，不建立 draft、save、editor mutation或刪除 action。來源 task 尚存在時可「開啟來源任務」；來源已刪除時顯示中性「來源任務已不存在」，不得錯誤或隱藏資產。
- meeting／work_log 仍走既有 editor、draft guard 與 mobile availability；`formatRecordType`、icon、time selector 與 open handler 必須改成 exhaustive classifier，禁止「非 meeting 一律 work_log」。
- TaskRecordTimeline 在來源仍存在時可顯示 task_collection read-only row，但不得把它交給 editable record flow。

`useRecordStore` 只持有 `EditableKnowledgeRecord`；`loadRecords/openNewRecord/openExistingRecord/saveDraft/archiveRecord` 的 type boundary 全部收斂到 meeting／work_log。新增 `useTaskCollectionStore` 作唯一 command／query owner，state 固定包含：`activeSection`、`previewState`、`pendingByTaskId`、`list{scopeKey,query,items,nextCursor,requestId,loading,error}`、`detail{recordId,data,loading,error}` 與 `lastResult`。切 workspace／board 時以 scope key 丟棄舊 response；同 scope 新 query 以 requestId 防 stale overwrite。

confirm 後 `pendingByTaskId` 使用 preview 回傳的 `sourceTaskIds` 鎖住整棵子樹；task edit、drag、move、archive、duplicate 與再次 collect guard 都必須查此 map。backend success 前不改 `useWbsStore.nodes`；success 後只呼叫新增的 `applyCollectedTaskRoot({ taskId, updatedAt })`，以 `skip persistence / skip activity / no undo` 的 canonical projection 將 root 標為 archived並重建 indices。若 projection 失敗，清 pending後重新載入 nodes與collection summaries，不得補呼叫 `archiveNode()`。

`TaskCollectionDialog` 是獨立 controlled dialog，不擴充只支援單行 prompt 的 `GlobalDialog`。狀態依序為 preview loading → confirmation → committing → success／recoverable error；annotation 使用 textarea、500 字 visible counter。success state 提供「查看典藏」與「留在目前畫面」，前者設定 `activeSection='task_collection'`、指定 detail ID 再 `setView('records')`；若 dialog 由 `TaskDetailsModal` 開啟，必須透過 `onViewCollection` 同步關閉父 modal，避免父層遮罩攔截典藏任務樹操作。timeout 先 `getOperationResult`；有結果即收斂成功，無結果保留同一 operation/token 的 retry，絕不自動產生新 UUID。

dialog state／action／focus契約固定如下；任一非當前主要action不得與主要action同權重：

| State | 主要可見內容 | 允許動作 | Focus／announcement |
|---|---|---|---|
| `preview-loading` | root名稱＋局部loading | 取消 | focus trap；標題取得初始焦點；polite announce載入 |
| `confirmation` | counts、archived descendant、必要limit warning、annotation | 典藏／取消 | 初始焦點在標題；Tab依視覺順序；Enter不得在textarea誤提交 |
| `committing` | 原內容保留＋局部pending | 無提交／不可關閉 | `aria-busy=true`；不移焦、不顯示假成功 |
| `recoverable-error` | 最短error與恢復方式，annotation保留 | 重試／重新預覽／取消，依error code互斥 | error容器 `role=alert` 且取得焦點；重試沿用operation規則 |
| `success` | record標題／版本 | 查看典藏／留在目前畫面 | polite announce一次；查看典藏後focus進detail heading |

取消或未成功關閉時focus回原trigger；成功後若root trigger已因archive卸載，「留在目前畫面」把focus放到active view heading，不得落到`body`。Escape只在preview／confirmation／recoverable-error生效；committing不得關閉。focus trap、visible focus、accessible names、live region與`prefers-reduced-motion`不以額外常駐說明文字補救。

`TaskDetailsModal` header 在關閉按鈕前新增具文字 accessible name 的 overflow menu，內含 `task.collect`；完整 `TaskActionMenu` 同時在 lifecycle section 顯示該 action。`task.collect` capability 只能映射 `collect`／`collect_task`，不得重用 `delete` guard。Firebase `supported=false` 時 action 不 render；權限不足時完整 menu 可顯示 disabled reason，viewer 不可觸發 preview。compact mobile rail、`MobileTaskAction` union 與 drag action presenter不得新增 collect。

### 7.3 Board／workspace deletion disclosure

因本期 `knowledge_records.project_id on delete cascade` 不變，board 永久刪除確認若命中 task_collection，必須顯示典藏數量與「典藏任務也會永久刪除」。`boardService.previewDeleteImpact()` 在 `GlobalContextMenu` 與 `HomeView` 兩個入口確認前執行；impact 讀取失敗即 fail closed，不顯示可執行確認。`removeBoard` 改為 awaited backend-success-first，刪除失敗不得先從 sidebar/home 移除。

workspace delete 同樣會 cascade 其下所有 project collections；`workspaceService.previewDeleteImpact()` 回傳總典藏數，`GlobalContextMenu` 的 workspace 確認一併揭露。兩種 impact 都只傳 scalar count，不讀完整 snapshot。不得用「典藏」一詞暗示已跨 board／workspace 永久保存。

service signature固定為 `boardService.previewDeleteImpact(workspaceId, boardId): Promise<DeleteImpact>` 與 `workspaceService.previewDeleteImpact(workspaceId): Promise<DeleteImpact>`；Supabase以authorized count query、local-test以目前canonical records計數、Firebase因第一版不能建立collection而回0。`DeleteImpact`只含non-negative safe integer `taskCollectionCount`；缺欄、負數、timeout或permission error都當作impact unknown並阻擋刪除，不得coerce成0。兩個store deletion command都改回傳`Promise<void>`，caller必須await後才關閉menu、切view或顯示成功。

## 8. Error taxonomy 與 failure recovery

```ts
export type TaskCollectionErrorCode =
  | 'BACKEND_UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'OPERATION_CONFLICT'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_ARCHIVED'
  | 'SOURCE_BUSY'
  | 'SOURCE_INVALID_TREE'
  | 'SOURCE_CHANGED'
  | 'LIMIT_EXCEEDED'
  | 'SNAPSHOT_INVALID'
  | 'TRANSIENT'
  | 'UNKNOWN';
```

| Failure | Durable result | 使用者處理 |
|---|---|---|
| preview source invalid／limit | 無變更 | 顯示原因；不開可確認的 success action |
| cancel | 無變更 | 關閉對話框 |
| operationId 已被另一 root 使用 | 無變更 | `OPERATION_CONFLICT`；關閉舊流程後由新 user action產生UUID |
| permission changed before commit | 無變更 | 顯示權限不足，刷新 access |
| source changed after preview | 無變更 | 重新 preview 並再次確認，不沿用舊 token |
| subtree lock timeout／來源正被搬移 | 無變更 | `SOURCE_BUSY`；保留同 operation，稍後重新 preview |
| RPC／network 明確失敗 | transaction rollback | 保留來源；可用同 operationId retry |
| network timeout／response lost | 未知，先查 operationId | 若已成功回同一 asset；若無 row 才 retry，同 operationId 不得產生 v2 |
| local projection update failed after backend success | backend asset＋archive 已成立 | reload canonical nodes／collection summaries；不得補建第二筆或顯示 backend 失敗 |
| detail schema 不支援 | 資產保留 | 顯示 incompatible state 與基本 summary，不用 generic editor 改寫 |

成功 toast 不得在 durable result 前顯示。錯誤訊息靠近觸發 context／section，保留可重試入口；不使用全頁說明或假成功空白狀態。

## 9. RD patch packages

### WP-093-A：domain、migration、RLS

- `src/types/index.ts`：新增 `EditableKnowledgeRecordType`、discriminated `KnowledgeRecord`、`task_collected`、`collect_task` 與 default matrix；`KnowledgeRecordInput.type` 改為 editable-only。
- `src/features/taskCollection/types.ts`：集中 snapshot、command、result、summary、error與 limits，不讓 UI 自行重宣告。
- `src/services/supabase/database.types.ts`：同步五欄、三支 RPC、result rows；禁止長期保留 `(supabase as any).rpc`。
- `src/components/BoardMembersPanel.tsx`：新增「典藏任務」permission row，與「封存／永久刪除任務」分列。
- CLI 產生的 `supabase/migrations/<actual>_dev_093_task_collection_assets.sql`：record type/shape/index、permission backfill、helpers、RPC、RLS、grants、schema reload。

完成條件：fresh migration、既有 meeting/work_log data preservation、constraint negative cases、effective capability fixture、function signature/revoke readback與 TypeScript database contract同步。A 未通過前不得做 active UI wiring。

### WP-093-B：snapshot builder 與 providers

- `src/features/taskCollection/snapshot.ts`：pure canonical traversal、cycle/scope/identity validation、dependency boundary、activity sanitizer、related-record privacy與 byte limits。
- `src/features/taskCollection/canonicalJson.ts`：provider-neutral null normalization、canonical JSON serializer、SHA-256與cross-provider golden vectors。
- `src/features/taskCollection/contentProjection.ts`：deterministic plain text、task mention display-text轉換、untrusted text escape、UTF-8計數與 hash input。
- `src/features/taskCollection/errors.ts`：唯一 typed error class／Postgres prefix mapper／UI message map。
- `src/features/taskCollection/localJournal.ts`：strict localStorage journal、recovery與 test-only phase fault injection。
- `src/services/dataBackend.ts`：export `taskCollectionService` 與 unsupported adapter；generic `recordService` 保持 editable-only。
- `src/services/supabase/projedService.ts`：UUID resolution、preview/collect/list/readback/detail/link-summary adapters與 exhaustive row mapper。
- `src/services/localTestService.ts`：同 pure builder、operation replay/version、journal commit/recovery、summary cursor/search；既有 `writeJson` 吞錯誤行為不得用於此交易。
- `src/services/firestoreService.ts`：generic record list/upsert 明確只接受 editable type；task collection 仍由 shared unsupported adapter回 `BACKEND_UNSUPPORTED`。

local journal key 固定 `projed-local-test.taskCollectionJournal.v1`，phase 固定 `prepared/committed`。prepared 保存 before/after 的 nodes、knowledgeRecords、activityEvents；寫入順序為 journal → records → nodes → activities → committed marker → clear。啟動／任何 task collection call 前 recovery：prepared 還原 before、committed重播 after，再清 journal。test fault 名稱固定 `after_journal/after_asset/after_archive/after_activity/after_commit_marker`，只在 `import.meta.env.MODE==='test'` 生效。

完成條件：Supabase／local-test 對同 golden fixtures 產生一致 counts、tree、payload sanitizer、content與 hash；same-operation、unknown readback、new-operation v2、all-or-nothing與 Firebase unsupported 全部可重現。

### WP-093-C：action、store 與 local projection

- `src/hooks/useBoardPermissions.ts`：export `canCollectTask`，`isReadOnly` 同步納入。
- `src/interactions/task/types.ts`：新增 `task.collect` 與 capability `collect`。
- `src/interactions/task/taskActionCatalog.ts`、`taskActionGuards.ts`、`TaskActionMenu.tsx`：lifecycle action、guard input、ArchiveBox icon／label與 disabled reason。
- `src/store/useTaskCollectionStore.ts`（new）：唯一 preview/confirm/collect/readback/list/detail owner與 stale-request guard。
- `src/store/useWbsStore.ts`：新增 `applyCollectedTaskRoot` 及 pending-aware mutation guards；禁止從 task collection store呼叫現有 non-awaited `archiveNode`。
- `src/components/TaskCollectionDialog.tsx`（new）：textarea、counts／violations、pending、retry、success deep-link與 focus return。
- `src/components/GlobalContextMenu.tsx`：完整 menu command接到 shared `requestTaskCollection(rootId)`；不在此複製 provider流程。
- `src/components/TaskDetailsModal.tsx`：overflow entry接同一 request；autosave pending時先等已排程保存 settle，再 preview，保存失敗不得典藏 stale draft。

完成條件：`task.collect`、`canCollectTask`、preview confirmation、整棵 pending isolation、durable-success-only store mutation、unknown recovery與 deep-link；compact mobile rail檔案 static diff 證明沒有新增 collect。

### WP-093-D：Records sections 與 detail

- `src/components/Records/RecordsView.tsx`
- 新增 `src/components/Records/TaskCollectionDetail.tsx`
- `src/components/Records/TaskRecordTimeline.tsx`
- `src/store/useRecordStore.ts`：editable-only signatures與 runtime guards；載入不接收 task_collection。
- `src/components/Records/RecordSidebar.tsx`／record draft utilities：exhaustive boundary，收到 task collection 時 fail closed而非開 editor。
- `src/services/dataBackend.ts`、`localTestService.ts`、`firestoreService.ts`、`supabase/projedService.ts`：generic list明列 `meeting/work_log`，避免 DB 新 type 自動流入舊 editor。
- `src/components/GlobalContextMenu.tsx`、`src/components/HomeView.tsx`、`src/store/useBoardStore.ts` 與三 provider 的 board/workspace service：delete impact count、awaited delete與 cascade wording。
- relevant styles／selectors：不新增第二層 card shell；沿用紀錄庫單一內容面。

完成條件：三 family exhaustive classifier、desktop 三區／mobile supported sections、per-section state、summary pagination/search、read-only detail、source-deleted state、timeline read-only routing、no mixed list與 board/workspace delete disclosure。

### WP-093-E：executable verification 與 handoff

- `scripts/verify-dev-093-task-collection.ts`：types/catalog/provider/privacy/hash/journal/static contract。
- `scripts/verify-dev-093-task-collection-local.ts`：local-test immutable transaction、archived descendant、boundary dependency、same-operation readback與 detail survival。
- `scripts/verify-dev-093-task-collection-canonical.ts`：CJK／emoji／escape canonical bytes與 SHA-256 golden vector。
- `scripts/verify-dev-093-task-collection-pure.ts`：pure snapshot／sanitizer／related-record／null mapping／limit boundary與 provider source contract。
- `scripts/verify-dev-093-task-collection-negative-compile.mjs`、`scripts/fixtures/dev093-negative-compile.ts`：editable input／collection metadata 的 TypeScript negative compile。
- `scripts/verify-dev-093-task-collection-db.ps1`：Supabase/local runtime preflight（不自動觸碰遠端）。
- `scripts/verify-dev-093-task-collection-db-isolated.ps1`、`scripts/verify-dev-093-task-collection-db-bootstrap.sql`、`scripts/verify-dev-093-task-collection-db-matrix.sql`：task-owned PostgreSQL fresh migration、RLS/grants/transaction/negative cases/EXPLAIN；PowerShell 必須依 AGENTS.md 記錄 temp runtime、finally停止 task-owned pg tree並確認 port released。
- `scripts/verify-dev-093-task-collection-browser.pw.js`：真實入口、desktop/mobile、failure/readback/reload、source deletion、sections與 visible error sweep。
- `package.json`：新增九支命令：
  - `verify:dev-093-task-collection = tsx scripts/verify-dev-093-task-collection.ts`
  - `verify:dev-093-task-collection-local = tsx scripts/verify-dev-093-task-collection-local.ts`
  - `verify:dev-093-task-collection-canonical = tsx scripts/verify-dev-093-task-collection-canonical.ts`
  - `verify:dev-093-task-collection-pure = tsx scripts/verify-dev-093-task-collection-pure.ts`
  - `verify:dev-093-task-collection-journal = tsx scripts/verify-dev-093-task-collection-journal.ts`
  - `verify:dev-093-task-collection-negative-compile = node scripts/verify-dev-093-task-collection-negative-compile.mjs`
  - `verify:dev-093-task-collection-db = powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-dev-093-task-collection-db.ps1`
  - `verify:dev-093-task-collection-db-isolated = powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-dev-093-task-collection-db-isolated.ps1`
  - `verify:dev-093-task-collection-browser = powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev093-task-collection -Filename scripts/verify-dev-093-task-collection-browser.pw.js -OutputDirectory output/playwright/dev-093 -BaseUrl http://localhost:4000/ -ArtifactWindowKey __DEV093_ARTIFACT -ArtifactPath output/playwright/dev-093/result.json`

完成條件：QA-DEV-093 cases可由命令一對一追溯，artifact含 viewport、操作、DOM/readback、console/network/visible-alert與截圖；未執行不可預填 PASS。

### 9.1 固定實作順序與 handoff gate

順序固定 `A migration/domain → B provider parity → C command/UI → D records/delete impact → E QA evidence`。A 完成後先跑 DB fresh/reset與 privilege matrix；B 完成後跑 pure／negative compile／local journal；兩者 PASS 才可接 task action。C/D 完成後跑 TypeScript、targeted ESLint、build:test與 browser；最後才由 QA 更新計畫狀態、由獨立 QC 建立事實報告。

RD handoff 必須列：實際 migration filename、commit SHA／working tree boundary、static／pure／negative compile／local journal／local／isolated DB／browser／canonical verifier輸出、isolated PostgreSQL runtime cleanup證明、artifact path、未執行的 Supabase TEST／release gate。不得把文件 ready、static string check、localStorage mock或 local browser當成 production migration證據。

### 9.2 Implementation Ready gap audit

| Gate | 結論 |
|---|---|
| P0 product decision | 0 open；名稱、完整子樹、immutable、provider、section、board scope均已確認。 |
| Data/API/migration | 0 open；row normalization、canonical serializer、metadata envelope、wire/readback、hash/token、RPC signatures、constraints/indexes、permission/RLS/grants與 cursor固定。 |
| Concurrency/recovery | 0 open；stable subtree lock、operation conflict、same-op readback、source series serialization、local journal固定。 |
| UI/state ownership | 0 open；唯一 store owner、pending isolation、dialog focus state、detail overflow、section deep-link、delete impact固定。 |
| Verification/evidence | 0 open；QA-DEV-093、slice gates、AC traceability、future script names/commands、fixture/evidence與 stop conditions固定。 |

因此 DEV-093 在進入實作前可標示 `RD Implementation Ready`；該結論只表示 RD 不需再做 P0/P1 設計決策，不表示產品已實作、QA/QC 已通過或允許 release。本輪產品已進入 `RD Implementation In Progress`，完整 QA／QC 仍須依下列 gates 執行。

### 9.3 一般任務內容 parity 差距分析

| 內容面向 | 一般任務詳情 | 典藏詳情原差距 | DEV-093 收斂方式／邊界 |
|---|---|---|---|
| 節點與標題 | 由目前 task node 顯示標題 | 只有 collection 摘要與任務樹，無法逐節點查閱 | `TaskCollectionDetail` 以快照節點選取，使用同一資訊密度顯示標題；不回寫 source |
| 內容／備註 | 支援多欄備註與 rich content renderer | 僅顯示摘要／說明，富文字與備註欄位不可比對 | 共用 `TaskDetailNoteContent`，保留 `detailNotes` 與 description fallback；內容區唯讀 |
| 日期／工期 | 開始日、結束日、工期與鎖定狀態 | snapshot detail 未呈現排程欄位 | 以快照值顯示開始日、結束日、工期、鎖定標示；不提供 date／number input |
| 狀態 | 共用 status normalization 與欄位樣式 | 只在樹節點顯示簡化狀態 | 共用 `normalizeManualTaskStatus`、`TASK_STATUS_LABELS` 與 status style；狀態不可變更 |
| 主責／協作 | `TaskAssignmentPicker` 呈現成員摘要 | 無 assignment readback | 重用 disabled `TaskAssignmentPicker`，使用快照當時的 ID／名稱；不觸發 mutation |
| 標籤 | `TagPicker` 編輯、`TagChip` 呈現 | 無 tag detail | 重用 `TagChip` 呈現快照 ID／名稱／顏色；不提供 `TagPicker` |
| 資產邊界 | 可依權限編輯與儲存 | 若直接套 editor 會破壞 immutable asset | 典藏內容禁止 `input`／`textarea`／`select` 與 save／delete action；B19 實際驗證 editable controls=0 |

此差距分析只承諾「閱讀 parity」，不把典藏快照變回可編輯 task，也不複製一套獨立 renderer；典藏任務、會議紀錄、個人工作紀錄仍放在既有單一「紀錄庫」頁的同層分區，互不混排。

## 10. QA／QC verification contract

最低驗證層級為：static／type、pure contract、local-test fault matrix、isolated PostgreSQL migration＋RLS、真實 browser desktop/mobile 與既有 record/lifecycle regression。production migration／deploy 仍需另開 release gate。

authoritative QA plan：`ai-doc/qa/QA-DEV-093-task-collection-subtree-assets.md`。目前 QA 狀態為 `In Progress / static 48＋TypeScript＋local 15＋pure 22＋negative compile 2＋journal 7＋isolated DB 25-check PASS / browser B00-B19 21/21 PASS / required regressions PASS / targeted Local QC fact PASS`；本輪已建立並執行 static、TypeScript、local-test（含 viewer permission denial、response-lost operation readback）、pure contract（含 cross-project scope fail-closed）、negative compile、local journal、build、task-owned isolated PostgreSQL 25-check matrix（含 DB07／DB08／DB16／DB17）與 browser 21 cases 的 Records／collection delivery-path 證據，B08 已涵蓋 transient fault／same-operation retry、response-lost／reload 與單一資產 readback，B09（permission/source/limit/provider）與 B12（overflow/full-menu action）均已通過，B19 已驗證一般任務內容 parity／唯讀 controls；journal after_* recovery 與 injected partial-write rollback 亦已通過；真實 Supabase response-lost／遠端 timeout 仍待 TEST。DEV-007 verifier 已依現行 SPEC-020 meeting activity／synthesis contract 更新並保留舊 source-marker 禁止檢查；只讀 migration list 顯示 DEV-093 local `20260828090000` 尚未套用 remote，local schema preflight 亦確認既有 runtime 未初始化 project schema；`db push --dry-run --linked` 另因 `LegacyDbPushMissingLocalError` 被阻擋，未執行 repair／pull／push 或遠端 mutation。targeted Local QC fact report 為 `ai-doc/qc/QC-DEV-093-task-collection-subtree-assets.md`；cross-provider parity、Supabase TEST、remote readback與 release 仍未完成，RD 不得把本節或整體 DEV-093 勾成 PASS，QC 也不得沿用 DEV-088／089 的證據替代 DEV-093。

### 10.1 P0／P1 automated gates

- TypeScript exhaustive switch：meeting、work_log、task_collection；task_collection 無法傳入 generic upsert／checkpoint／delete。
- traversal fixtures：leaf、三層 ordered tree、selected child、cycle、missing parent、duplicate ID、archived descendant、internal／boundary dependency。
- snapshot golden：row null normalization、detail notes、assignees、tags、activity order、private record exclusion、canonical UTF-8 bytes、plain-text projection、SQL/TS一致SHA-256與byte limits。
- operation matrix：same operation retry、timeout readback、restore＋new operation v2、concurrent two operations serial version、source changed、limit exceeded、local projection reload。
- isolated PostgreSQL：fresh migration、constraint rejection、unique indexes、RPC atomic rollback、RLS read/write matrix、anon/public revoke、custom capability backfill、viewer read/no collect、private linked-record non-leak。
- local-test fault injection：asset insert、link、root archive、activity、local projection 各階段；durable state只能是全無或完整 success。

### 10.2 Browser／accessibility gates

- 1440×900、1024×768：三 section 分離、cold default、search/error/empty 隔離、preview、success deep-link、read-only detail、restore/recollect v2；快照節點內容欄位與一般任務詳情 parity 可讀。
- 390×844、320×844：meeting section 依 SPEC-069 不 render；典藏／個人工作分區可辨識，compact rail 仍四項，典藏只在 overflow，無 document horizontal overflow／遮擋／icon-only。
- keyboard／accessibility：menu、dialog五態、tabs、detail disclosure、Escape、cancel、focus trap/return、pending disabled、live region、200% zoom與reduced motion；screen reader name 不以 icon 代替「典藏任務」。
- data sanity／quietness：非空fixture的preview/list/detail counts不得全0或空白假PASS；單一主焦點／主action，無重複helper、成功面板或card shell。
- source task permanent delete 後 reload：asset content／tree／history 可讀，失效 links 不 crash。
- board delete confirmation：命中 collection 時顯示數量與 cascade 警示。

stable selectors 至少包含：`data-task-action-id="task.collect"`、`data-task-collection-dialog-state`、`data-task-collection-count`、`data-task-collection-annotation`、`data-records-section`、`data-records-active-section`、`data-task-collection-row-id`、`data-task-collection-detail-id`、`data-task-collection-source-state`、`data-delete-impact-task-collection-count`。selectors 只描述語意，不綁 Tailwind class或 DOM 深度。

### 10.3 Required regressions

- SPEC-003／006／019／020：meeting／work_log 建立、草稿、發布、刪除與 RAG 既有流程。
- SPEC-007／008：activity capture、TaskRecordTimeline、open-knowledge-record routing。
- SPEC-069：mobile meeting unavailability；非 meeting 功能不可被連帶關閉。
- SPEC-088：完成、封存、還原、永久刪除、dependency round trip、回收桶。
- Interaction Kernel／mobile rail：既有 `task.archive` 與 `task.toggle-complete` 不被 `task.collect` 取代。

RD local gate commands 固定如下；browser command 前若沒有可安全重用的 primary runtime，依 AGENTS.md 記錄並啟動 task-owned local-test runtime，完成後只停止該 process tree並確認 port 釋放：

```text
npm run verify:dev-093-task-collection
npm run verify:dev-093-task-collection-local
npm run verify:dev-093-task-collection-db
npm run verify:dev-093-task-collection-db-isolated
npm run verify:dev-093-task-collection-browser
npm run verify:dev-003-record-tags
npm run verify:dev-007-meeting-activity
npm run verify:dev-008-task-knowledge
npm run verify:dev-020-record-workflow-redesign
npm run verify:dev-069-meeting-draft-recovery
npm run verify:dev-088-task-lifecycle
npm run verify:dev-070-interaction-kernel
npx tsc --noEmit
npx eslint src/types/index.ts src/features/taskCollection src/services/dataBackend.ts src/services/localTestService.ts src/services/firestoreService.ts src/services/supabase/projedService.ts src/store/useTaskCollectionStore.ts src/store/useWbsStore.ts src/store/useRecordStore.ts src/interactions/task src/components/TaskCollectionDialog.tsx src/components/TaskDetailsModal.tsx src/components/GlobalContextMenu.tsx src/components/HomeView.tsx src/components/Records
npm run build:test
git diff --check
```

static／DB artifacts固定 `output/qa/dev-093/static-result.json`、`output/qa/dev-093/db-result.json`、`output/qa/dev-093/db-isolated-result.json`；browser artifact固定 `output/playwright/dev-093/result.json`。screenshots至少 `desktop-sections.png`、`desktop-collection-detail.png`、`dialog-error-focus.png`、`dialog-success.png`、`mobile-sections.png`、`mobile-collection-overflow.png`、`board-delete-impact.png`。isolated DB gate輸出必須包含 migration filename、constraint/index/function/grant readback、RLS actor matrix、same/different operation concurrency、canonical byte golden、rollback counts、EXPLAIN plan與 temp runtime cleanup；本次精簡 artifact 已涵蓋實際通過的 subset，未執行案例仍須保留 NOT RUN。

### 10.4 Stop conditions

遇到下列任一情況不得標示 RD／QA 完成：

- 需要先建立 asset 再以第二個非交易請求封存來源。
- task_collection 可由 generic upsert/editor/update/delete 改寫。
- client-only `canCollectTask` 被當成安全邊界，RPC 未查 effective capability。
- snapshot 只保存 task links 或目前 UI projection，來源刪除後不可獨立閱讀。
- private record 被嵌入 project-visible snapshot。
- 超限、source changed、timeout 或 provider unsupported 仍移出來源／顯示成功。
- meeting、work_log、task_collection 在 RecordsView 預設混合。
- Firebase 以空 history 或非原子 generic upsert 冒充支援。
- production migration、deploy 或 release 未經獨立 release gate 被執行。

## 11. Acceptance Criteria

- AC-093-001：所有入口、確認、成功回饋、紀錄庫 section 與詳情均使用「典藏任務」，且與「封存任務」語意分離。
- AC-093-002：leaf 建立一筆單節點 asset；選定 parent 建立一筆含完整 canonical descendant subtree 的 asset，preview／snapshot／UI 計數一致。
- AC-093-003：asset insert、links、root archive 與 `task_collected` event 為同一 transaction；任一步失敗皆無 asset 且來源保持 active。
- AC-093-004：same operation retry 回同一 record/version；來源還原後新的確認建立下一 immutable version，不覆寫舊 asset。
- AC-093-005：永久刪除來源後，asset 的正文、任務樹、依賴、可取得歷程與 project-visible related-record excerpts 仍可讀。
- AC-093-006：`collect_task` 由 backend effective capability 強制；owner/admin/PM/member default allow、viewer deny collect/read allow，custom matrix 依 delete_task 安全 backfill。
- AC-093-007：task_collection 不可經 generic record editor、upsert、checkpoint、archive/delete 或 RAG path mutation。
- AC-093-008：紀錄庫在支援 meeting 的 viewport 顯示三個互斥 section，不存在混合「全部」清單；mobile 依 SPEC-069 只隱藏 meeting，不影響典藏／work log。
- AC-093-009：典藏 list 只取 summary、使用 50 筆 cursor pagination；詳情按需取完整 snapshot，section search／loading／empty／error 不互相污染。
- AC-093-010：source changed、invalid tree、limit exceeded、timeout、permission change與 unsupported provider 都 fail closed，無假成功或重複 asset。
- AC-093-011：1440／1024／390／320 rendered UI、keyboard／screen reader、reload、source deletion、board deletion disclosure 與 required regressions 全部通過。
- AC-093-012：本期成果只可標示 local／TEST evidence；未經 deployment-release gate 不得套用 production migration、deploy 或 release。
- AC-093-013：board／workspace 刪除前能取得並顯示會 cascade 的典藏數；impact 讀取或 backend delete 失敗時，UI 不得先移除看板／工作區或顯示成功。
- AC-093-014：Supabase與local-test對同一正規化fixture產生相同canonical bytes、source hash、preview token material與snapshot hash；response lost可由operation readback重建同一result。
- AC-093-015：dialog在loading／confirmation／committing／error／success各狀態的可用動作、Escape、focus trap／return、live announcement與reduced-motion行為符合契約，且正常畫面沒有重複說明或第二主焦點。
- AC-093-016：典藏詳情選取任一快照節點時，需顯示一般任務同等的內容／備註（含富文字）、日期、工期、狀態、主責／協作與標籤；備註 renderer、狀態樣式、指派元件與 tag chip 優先共用既有元件，且典藏內容區不得出現可寫入的 input／textarea／select 或 mutation action。

## 12. Scope、Future Phase 與治理

In scope：Supabase＋local-test、task_collection schema／RPC／RLS、完整同看板子樹、版本／idempotency、Records sections、read-only detail、source task delete survival、board／workspace deletion disclosure與對應 QA/QC。

Out of scope：Firebase 支援、只典藏父任務但保留子任務、批次不相鄰 roots、編輯／刪除典藏、跨 board／workspace 搜尋、board deletion survival、AI 摘要／評分／推薦、RAG indexing、retention／export、production migration／deploy／release。

Future Phase re-entry：使用者要求來源 board 刪除後仍保存、跨看板案例庫或公司級 AI reuse 時，另立 workspace-level asset 規格與 ADR，重新評估 `project_id` ownership、on-delete、RLS、導覽、搜尋、retention、export 與 migration；不得預先在本期放寬 scope。

治理結論：

- SPEC-093 是 DEV-093 的唯一 authoritative implementation contract。
- 對 SPEC-088 為 compatible extension：典藏成功後仍以既有 archive lifecycle 移出來源，沒有第四終點。
- 對 SPEC-003／006 為 record-family extension：新增不可編輯 family，但保留 meeting／work_log editor contract。
- 對 DEV-016 為 intentional extension：保留條列可掃描性，改以互斥 sections 取代混合清單。
- 對 SPEC-069 為 compatible：mobile 仍不 render meeting，非 meeting collection 明確可用。
- ADR not needed：本期不改 board-scoped ownership authority；若進入 workspace-level Future Phase 才新增 ADR。

## 13. Migration／release feasibility 與參考基線

本地 migration 可行性判定：`READY FOR RD LOCAL IMPLEMENTATION`。現行 `record_type` 是 text check，不需 enum rewrite；五個新欄皆 nullable，既有 meeting／work_log 會通過 non-collection shape；新增資料前沒有 collection backfill。主要風險為 constraint replacement lock、function privilege、GIN build與舊 client 對第三型別的錯誤 fallback，已由 `NOT VALID + VALIDATE`、explicit grants、isolated EXPLAIN與 editable-only query防住。

release 相依順序固定為「TEST backup/readback → forward migration → RPC/RLS/grants smoke → 同 commit application artifact → authenticated browser smoke」。migration 可先於 UI artifact，因舊 client不會呼叫 collection RPC；但第一筆 task_collection 建立前，新 client與 editable-only filtering必須已部署。production migration、`supabase db push`、hosting deploy與 smoke不屬本 DEV 文件升級，本輪不得執行；需要上線時另走 deployment-release gate並以實際 migration history／artifact SHA為準。

2026-08-28 核對的官方基線：

- [Supabase Breaking-change Changelog](https://supabase.com/changelog?types=breaking-change)：本期不新增table、不依賴GraphQL introspection，且`CREATE EXTENSION`不指定version；Data API自動exposure與extension version pinning變更不改變本契約，existing `knowledge_records` exposure仍須由grants＋RLS保護。
- [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)：migration 由 CLI 建立並在 local reset／migration workflow驗證，不直接改 remote schema。
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)：優先 security invoker；security definer 必須固定 search path且 function execute privilege需明確 revoke/grant。
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：authenticated check、RLS policy與 `(select auth.uid())` 基線。
- [Supabase Postgres Extensions](https://supabase.com/docs/guides/database/extensions)：`pg_trgm` 為支援的 Postgres extension；migration 仍需在 isolated／TEST環境驗證實際 schema與 index plan。
- [Supabase Query Optimization](https://supabase.com/docs/guides/database/query-optimization)：summary/search與RLS查詢必須以實際fixture執行`EXPLAIN (FORMAT JSON)`；不能只因index存在就宣稱plan通過。

## 14. 變更紀錄

- 2026-08-28：依使用者決定建立「典藏任務」Brief，固定完整子樹與紀錄庫分區方向。
- 2026-08-28：升級 RD Contract；固定 `task_collection`、immutable version、operation idempotency、`collect_task`、Supabase atomic RPC、local-test adapter、Firebase explicit unsupported、mobile meeting compatibility、hard limits、RLS／grants、逐檔 patch 與 QA/QC gates。
- 2026-08-28：升級 `RD Implementation Ready`；補齊 metadata envelope、preview/token/hash、RPC signatures、operation conflict、stable subtree lock、activity allowlist、local journal、唯一 store owner、delete impact、逐檔 patch、QA-DEV-093、executable commands、evidence paths與 release feasibility。產品仍未實作／未驗證／未 Release。
- 2026-08-28：補齊 implementation handoff ambiguity；固定row null normalization、provider-neutral canonical JSON、SQL wire/readback/detail/timeline paths、delete-impact signatures、dialog state/focus contract，以及AC-093-014～015。成熟度不變，仍未實作／未驗證／未 Release。
- 2026-08-28：完成 DEV-093 本機產品 wiring與 forward-only migration；加入三分區 tab／editable與collection discriminated type boundary、local-test verifier、static 37 checks、local 7 checks、build證據。新增 task-owned PostgreSQL 18 isolated harness；fresh migration、RPC/RLS/grants、subtree／boundary、idempotency、negative cases、private non-leak與cleanup matrix通過，產出 `output/qa/dev-093/db-isolated-result.json`。同日以真實 Playwright 入口完成 B00～B02：desktop 1440×900 三個同層分區、mobile 390×844 依既有 meeting restriction 顯示典藏／工作兩個 tab、preview cancel 0 mutation、collect 後 root archive／典藏唯讀詳情（任務樹／相依／歷程／相關紀錄區塊／H1 focus），兩 viewport horizontal overflow 均為 0，產出 `output/playwright/dev-093/result.json`。目前 shared worktree 的 `npx tsc --noEmit` 被未納入 DEV-093 的 DEV-095 tracking files 既有型別錯誤阻擋；B03～B18、Supabase TEST與release仍維持 NOT RUN／未 Release。
- 2026-08-28：重新執行 shared worktree `npx tsc --noEmit` 與 `npm run build:test` 均 exit 0；前次 DEV-095 tracking files 型別阻塞已不再重現。DEV-093 仍維持 B03～B18、Supabase TEST與release `NOT RUN`，待完整 QA／QC。
- 2026-08-28：補齊 static／local／isolated DB verifier 的共同 evidence envelope與 per-case summary，並重新產生 `static-result.json`、`local-result.json`、`db-isolated-result.json`；目前三者均可由 `devId`、`sourceRevision`、`cases`、`summary`與 cleanup readback 追溯。
- 2026-08-28：isolated PostgreSQL matrix 擴充至 20 個通過 checks；覆蓋 snake_case wire、拒絕操作 rollback、different-operation archived-root、generic mutation denial、restore→v2 immutable、cursor／literal search、RAG isolation與 source hard-delete survival。DB07 injected fault、DB08 concurrency、DB16 delete-impact、DB17 SQL/TS canonical parity仍待執行。
- 2026-08-28：migration 新增受控 `private.canonical_json_v1` 與 CJK／emoji／escape golden vector；static verifier 收斂為 40 checks，isolated PostgreSQL matrix 收斂為 21 checks。此 helper 只建立 parity 基礎，DB17 完整 SQL/TS snapshot hash parity仍待跨 provider 驗證。
- 2026-08-28：補齊 isolated DB07／DB08／DB16／DB17：trigger fault guard 四階段 rollback、dblink 同 operation concurrency、board/workspace FK cascade／viewer denial與 SQL↔TypeScript canonical byte/hash parity 均 PASS；`output/qa/dev-093/db-isolated-result.json` 更新為 25/25 PASS。browser B03～B18、required regressions、Supabase TEST與 release 仍 NOT RUN。
- 2026-08-28：browser verifier 擴充並完成 B00～B07、B10～B11、B13～B18 共 17 cases PASS（含 1024／390／320 viewport、搜尋空結果恢復、restore→v2、source-delete、board-delete disclosure、Escape/focus、single Records section與實際 pageerror/requestfailed/HTTP/alert sweep）；B08、B09、B12、required regressions、Supabase TEST與 release 仍 NOT RUN。`output/playwright/dev-093/result.json` 為 17/17 PASS。
- 2026-08-28：補齊 B08 transient fault／same-operation retry、B09 permission／source hash／501-node limit／unsupported provider fail-closed，以及 B12 320×844 overflow/full-menu 與 compact rail 邊界；browser artifact 更新為 B00～B18 共 20/20 PASS。required regression 中 DEV-003／008／020／069／070／088 PASS；DEV-007 因既有 DEV-094 `RecordSidebar` 變更造成舊驗證器契約漂移而 FAIL，已記錄為跨任務 drift；Supabase TEST、獨立 QC與 release 仍待執行，維持未 Release。
- 2026-08-28：依現行 SPEC-020 addendum 更新 DEV-007 meeting activity verifier：驗證 meeting activity／synthesis contract 並禁止已移除的舊 source-marker；DEV-003／007／008／020／069／070／088 required regression 全部 PASS。DEV-093 browser 維持 B00～B18 20/20，Supabase TEST、獨立 QC與 release 仍待執行，維持未 Release。
- 2026-08-28：完成 Supabase 只讀 migration／local schema preflight；linked project 的 DEV-093 local `20260828090000` 尚未出現在 remote，remote history 另有本機缺少的既有 revisions（對照 artifact：local 51／remote 49、5 local-only、3 remote-only），既有 local runtime 未初始化 project schema，`db push --dry-run --linked` 因 `LegacyDbPushMissingLocalError` 無法產生安全計畫；未執行 repair／pull／push、migration 或資料變更，改列為 deployment/release gate 前置阻塞。
- 2026-08-28：fresh rerun `npm run verify:dev-093-task-collection-browser`；同一 working-tree boundary 的 B00～B18 20/20 PASS，artifact `output/playwright/dev-093/result.json` generated `2026-08-28T12:15:52.254Z`，runner exit 0 且 browser task-owned process 已清理；Supabase TEST／release gate 狀態不變。
- 2026-08-28：fresh rerun `npm run verify:dev-093-task-collection-db-isolated`；同一 working-tree boundary 的 task-owned PostgreSQL 18 matrix 25/25 PASS，artifact `output/qa/dev-093/db-isolated-result.json` generated `2026-08-28T12:17:05Z`，port `57355` released、temporary path removed；未觸碰 remote Supabase。
- 2026-08-28：新增並 fresh rerun `npm run verify:dev-093-task-collection-pure`；pure snapshot／sanitizer／related-record／null mapping／exact 500／501 limit 與 provider source contract 共 21/21 PASS，artifact `output/qa/dev-093/pure-result.json`；cross-project tree negative、negative compile、真實 response-lost、Supabase TEST與 release 仍未完成。
- 2026-08-28：新增並 fresh rerun `npm run verify:dev-093-task-collection-journal`；normal commit、五個 `after_*` recovery phase 與 injected localStorage partial-write rollback 共 7/7 PASS，artifact `output/qa/dev-093/journal-result.json`；L11 真實 response-lost＋reload、negative compile、Supabase TEST與 release 仍未完成。
- 2026-08-28：在 snapshot boundary 新增 workspace／board scope guard，fresh rerun `npm run verify:dev-093-task-collection-pure` 擴充為 22/22 PASS；cross-project tree negative 已由 `P02-cross-project-fail-closed` 覆蓋，並新增 negative compile 2/2 artifact `output/qa/dev-093/negative-compile-result.json`；L11 真實 response-lost＋reload、Supabase TEST與 release仍未完成。
- 2026-08-28：fresh rerun `npm run verify:dev-093-task-collection-local` 擴充為 14/14 PASS，新增 viewer permission denial readback；`npm run verify:dev-093-task-collection-negative-compile` 2/2 PASS，negative compile artifact 已納入 QA／QC handoff。L11 真實 response-lost＋reload、Supabase TEST、remote readback與 release仍未完成。
- 2026-08-28：補強 L11 response-lost recovery：Supabase adapter 的 `collect()` 會在 RPC／detail response 遺失時依 immutable `operationId` 讀回，local-test committed-response-lost fault injection 與 browser B08 response-lost／reload readback 均通過；local verifier 更新為 15/15，真實 Supabase TEST／remote readback／release仍未完成。
- 2026-08-28：依最新 working-tree boundary 重跑 browser／local delivery-path；browser artifact generated `2026-08-28T13:44:51.789Z` 為 B00～B18 20/20 PASS，local artifact generated `2026-08-28T13:41:50.746Z` 為 15/15 PASS，task-owned runner 已清理；僅更新 evidence provenance，不改變 Supabase TEST／remote readback／release gate。
- 2026-08-28：修正 snapshot CTE 的持久 `wbs_items.depth`／traversal `depth` 欄位衝突；read-only `supabase db diff --linked --schema private` exit 0 並成功套用 local migrations 至 `20260828100000`。`db push --dry-run --linked` 仍只因 remote/local history mismatch 被阻擋，未執行遠端變更。
- 2026-08-28：依 migration／isolated fixture 修正 fresh rerun task-owned PostgreSQL matrix；25/25 PASS，artifact generated `2026-08-28T14:03:19.4509657Z`，port `55484` released、temporary path removed。
- 2026-08-28：isolated bootstrap 對齊 DEV-048 的 legacy `wbs_items.assignee_id` compatibility column；未改變 production schema，matrix 維持 25/25 PASS。
- 2026-08-28：依 migration／fixture 修正後 fresh rerun local／browser delivery path；local 15/15（generated `2026-08-28T14:08:46.070Z`）與 browser B00～B18 20/20（generated `2026-08-28T14:12:03.727Z`）均 PASS，未改變 remote／release gate。
- 2026-08-28：同一 working-tree boundary fresh rerun pure 22/22（generated `2026-08-28T14:14:12.007Z`）、journal 7/7（generated `2026-08-28T14:14:11.606Z`）與 negative compile 2/2（generated `2026-08-28T14:14:17.155Z`）均 PASS，未改變 remote／release gate。
- 2026-08-28：補強 `RecordsView` 三區 tabpanel 的 `aria-labelledby` 關聯；fresh static verifier 45/45（generated `2026-08-28T15:00:59.515Z`）與 browser B00～B18 20/20（generated `2026-08-28T14:56:16.366Z`）均 PASS。B11 mobile deep-link／cold sidebar fallback、B14 tab／tabpanel ARIA＋reduced-motion、B16 preview-loading／confirmation／committing／recoverable-error／success 五態 state trace（含 live region與 error annotation restore）、B18 5 tasks／2 activities／2 related records 非零 readback 已收斂；實際 screen-reader tree／browser chrome 200% zoom仍屬 supplemental，Supabase TEST／remote readback／release boundary不變。
- 2026-08-28：fresh rerun DEV-093 local 15/15（`2026-08-28T15:13:52.671Z`）、pure 22/22（`2026-08-28T15:14:00.723Z`）、journal 7/7（`2026-08-28T15:14:07.467Z`）、negative compile 2/2（`2026-08-28T15:14:23.211Z`）、isolated PostgreSQL 25/25（`2026-08-28T15:14:47.7264271Z`，port 49794 released／path removed）與 browser B00～B18 20/20（`2026-08-28T15:18:00.292Z`）均 PASS；未改變 Supabase TEST／remote readback／release boundary。
- 2026-08-29：依使用者「繼續」fresh read-only linked migration gate（`2026-08-29T14:18:58.3105104Z`）仍讀回 local 51／remote 49、5 local-only／3 remote-only；DEV-093 `20260828090000` 仍未套用。`db push --linked --dry-run` exit 1／`LegacyDbPushMissingLocalError`，三份 Supabase evidence artifact 已更新；未執行 repair／pull／push、migration、reset 或資料變更，remote／release boundary 不變。
- 2026-08-29：依使用者要求完成「典藏詳情與一般任務內容 parity」差距修正：`TaskCollectionDetail` 新增快照節點選取與唯讀內容區，顯示內容／備註、日期、工期、狀態、主責／協作與標籤；共用 `TaskDetailNoteContent`、`TaskAssignmentPicker`、`TagChip` 與任務狀態樣式，新增 browser B19 驗證。B00～B19 21/21 PASS（artifact generated `2026-08-29T15:00:34.253Z`）；未改變 Supabase／release boundary。
- 2026-08-30：B02 deep-link heading focus race 以 `React.useLayoutEffect` 修正，fresh browser B00～B19 21/21 PASS（artifact `2026-08-29T16:53:34.653Z`）；新增 9.3「一般任務內容 parity 差距分析」逐欄固定共用元件與 immutable／唯讀邊界。strict production-bound read-only gate 16/16 PASS（2026-08-30T01:07:54+08:00），Supabase TEST／remote readback／release 仍待授權與執行。
- 2026-08-30：parity audit 發現典藏工期誤採日期差＋1；已修正為與 `TaskDetailsModal`／`WbsNodeItem` 相同的 `endDate.diff(startDate, 'day')` 語意，並將 B19 補上工期數值驗證。fresh browser B00～B19 21/21 PASS（artifact `2026-08-29T17:16:02.860Z`，B19 `duration=true`）；未改變 immutable snapshot 或 remote／release boundary。
- 2026-08-30：依工期 parity 修正後 fresh `npm run verify:source` 通過（lint 0 errors／52 warnings、tsc、build、auth／Supabase／calendar／core／P9 checks），產物 `20260829171847-c661e0` 以 exact manifest integrity／origin／secret scan `ok=true`；此仍為 DEV-083 pipeline artifact，未視為 DEV-093 candidate。
- 2026-08-30：工期 parity 修正後再次執行 strict production-bound read-only gate（2026-08-30T01:20:17+08:00），16/16 checks PASS；未執行 remote migration、deploy、activation或任何遠端 schema/data mutation。
- 2026-08-30：fresh linked Supabase read-only migration recheck（2026-08-30T01:22:48+08:00）仍為 local 51／remote 49；DEV-093 `20260828090000` local-only、3 筆 remote-only，dry-run `LegacyDbPushMissingLocalError`；未採用 repair／pull／push。
- 2026-08-30：工期 parity 修正後 fresh browser rerun（artifact `2026-08-29T17:30:40.550Z`）B00～B19 21/21 PASS；B19 另驗證 `4 天`、主責／標籤可見 fallback text、共用備註 renderer 與 editable controls=0，未改變 immutable snapshot 或 remote／release boundary。
- 2026-08-30：工期／可見 assignment-tag parity 後 fresh static `verify:dev-093-task-collection` 48/48 PASS（generated `2026-08-29T17:36:10.632Z`），`npx tsc --noEmit` exit 0；未改變 immutable snapshot 或 remote／release boundary。
- 2026-08-30：fresh strict production-bound read-only gate（2026-08-30T01:37:23+08:00）16/16 checks PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation。
- 2026-08-30：fresh linked Supabase migration read-only recheck（2026-08-30T01:39:06+08:00）仍為 local 51／remote 49，DEV-093 `20260828090000` local-only、3 筆 remote-only，dry-run `LegacyDbPushMissingLocalError`；未採用 repair／pull／push。
- 2026-08-30：fresh local Supabase disposable DB matrix 25/25 PASS（generated `2026-08-29T17:40:37.1028936Z`），database dropped=true／drop_exit=0，未觸碰 linked remote project。
- 2026-08-30：B19 覆蓋補強發現從 `TaskDetailsModal` 查看典藏後父 modal 未關閉，導致任務樹操作被遮罩攔截；新增 `TaskCollectionDialog.onViewCollection` 並由父 modal 關閉流程接手。fresh browser B00～B19 21/21 PASS（artifact `2026-08-29T17:54:35.670Z`），根任務與 `qc-card-1-child-1` 子任務均驗證內容／備註、日期、工期、狀態、主責／協作、標籤、共用 renderer 與 editable controls=0。
- 2026-08-30：上述父 modal 關閉修正後 fresh `npm run verify:source` PASS（lint 0 errors／52 warnings、tsc、build、auth／Supabase／calendar／core／P9）；exact artifact `20260829175530-335de3` integrity `ok=true`，仍為 DEV-083 pipeline artifact，未視為 DEV-093 candidate。
- 2026-08-30：B19 驗收再擴充為遍歷完整 5 節點快照（根、兩層子任務與深層子任務）；fresh browser B00～B19 21/21 PASS（artifact `2026-08-29T18:03:18.491Z`），每節點 selectedNode identity 一致、shared note renderer=true、editable controls=0。
- 2026-08-30：全 5 節點 verifier 修正後 fresh `verify:source` PASS；exact artifact `20260829180453-37385a` integrity `ok=true`，未改變 remote／release boundary。
- 2026-08-30：B19 lifecycle 證據再補強，`查看典藏` 後直接 readback 父 `TaskDetailsModal` 計數為 `0`；fresh browser B00～B19 21/21 PASS（artifact `2026-08-29T18:11:44.968Z`），完整 5 節點仍為 selectedNode identity 一致、shared note renderer=true、editable controls=0。未改變 immutable snapshot 或 remote／release boundary。
- 2026-08-30：上述 verifier lifecycle assertion 後 fresh `npm run verify:source` PASS（0 errors／52 warnings、tsc、build、required regressions）；exact artifact `20260829181249-e9b9a6` integrity `ok=true`，仍為 DEV-083 pipeline artifact，未 deploy／release。
- 2026-08-30：lifecycle assertion 後 fresh DEV-093 static verifier 48/48 PASS（artifact `2026-08-29T18:16:20.072Z`），未改變 immutable snapshot 或 remote／release boundary。
- 2026-08-30：B19 再補直接 mutation-action readback；5 個快照節點、根／子節點內容區皆 `mutationActions=0` 且 editable controls=0，fresh browser 21/21 PASS（artifact `2026-08-29T18:21:35.804Z`）。
- 2026-08-30：上述唯讀 verifier assertion 後 fresh `npm run verify:source` PASS；exact artifact `20260829182226-69a0ea` integrity `ok=true`，未 deploy／release。
- 2026-08-30：B19 補上 390×844 mobile content parity readback；手機內容區可見一般任務欄位，`editableControls=0`、`mutationActions=0`、shared note renderer=true；fresh browser B00～B19 21/21 PASS（artifact `2026-08-29T18:27:38.123Z`）。
- 2026-08-30：mobile parity verifier 後 fresh `npm run verify:source` PASS；exact artifact `20260829182820-a44fec` integrity `ok=true`，未 deploy／release。
- 2026-08-30：mobile parity verifier 後 fresh DEV-093 static verifier 48/48 PASS（artifact `2026-08-29T18:32:54.354Z`），未改變 immutable snapshot 或 remote／release boundary。
- 2026-08-30：fresh linked Supabase read-only recheck（2026-08-29T18:34:20.148Z）仍為 local 51／remote 49；DEV-093 `20260828090000` local-only、3 筆 remote-only，dry-run `LegacyDbPushMissingLocalError`；未採用 repair／pull／push。
- 2026-08-29：fresh browser rerun 以目前工作樹重驗 B00～B19 21/21 PASS（artifact generated `2026-08-29T15:48:38.491Z`）；同次確認 B19 內容 parity、共用備註 renderer與唯讀 controls=0，未改變 Supabase／release boundary。
