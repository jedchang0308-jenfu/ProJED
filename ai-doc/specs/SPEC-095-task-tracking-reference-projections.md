# SPEC-095 任務追蹤副本與跨看板多重投影

狀態：Authoritative／RD Implementation Ready／Human Confirmed／Local Interaction Parity Implemented／Local Automated QA-QC PASS／Supabase TEST NOT RUN／未 Release

關聯 DEV：DEV-095

來源：`USER-20260828-TASK-TRACKING-COPY-MULTI-BOARD-PROJECTION`、grill-me 三輪確認

架構決策：`ADR-046-task-identity-and-placement-projection.md`

驗證計畫：`QA-DEV-095-task-tracking-reference-projections.md`

風險：High。影響 task identity、placement identity、跨 Board RLS、provider capability、交易、Realtime、undo、backup、五種任務模式與既有 DEV-089 placement boundary。

證據邊界（2026-08-29）：既有 isolated PostgreSQL 15/15、I01～I12 local contract 12/12、backup 4/4 與 browser B01～B16 16/16 保留為 identity／placement／DB historical baseline；本次 interaction replacement 另由 S07～S10 4/4、browser B17～B24 8/8 與獨立 QC-IP01～08 8/8 證明 shared surface/controller/tree、click/action、pointer／keyboard／390／320 TouchEvent、recursive subtree、capability revoke、stale revision 與 visible-error postconditions。`TrackingReferenceItem.tsx` 已移除，虛線分支只留在 `TaskSurfaceFrame`。Supabase TEST read-only preflight 仍因 capability RPC、placement table 與 projection RPC 尚未存在而 BLOCKED，未執行 remote mutation、migration、deploy 或 release；local PASS 不得外推為 TEST／production PASS。

Spec Impact：`Compatible product extension + Intentional data-model expansion + Intentional interaction-contract replacement`。本規格保留 SPEC-089 的單一 canonical ownership，新增 non-owning tracking placements；若既有規格把 `TaskNode.id` 同時當 task、render node 與 drag identity，本規格在追蹤投影範圍內明確取代該假設。2026-08-29 使用者進一步要求追蹤任務與正本具有相同點擊、拖曳與子任務行為，因此本版取代「副本另做簡化 renderer／僅唯讀 action surface」的舊契約；權限與 canonical mutation 邊界不因此放寬。

## 1. 使用者決策與不可變產品原則

以下決策已由使用者確認，不再留給 RD 自行選擇：

1. 不新增主管狀態、關注狀態、依賴狀態或 placement-local workflow；追蹤副本是純投影。
2. 每個任務只有一個主要父任務負責工時、成本、進度與完成率彙總；其他位置不彙總。
3. 正常任務 action surface 新增可見文字按鈕「建立追蹤副本」。
4. 建立成功後，副本位於被操作 primary placement 的同一父層、相鄰後方，外框為虛線；使用者再自行拖曳。
5. 實線 primary 拖曳維持 canonical ownership 搬移；虛線 tracking reference 拖曳只搬移該 reference placement／reference subtree。
6. 有效 tracking reference 使目標 Board 的現有與未來成員可讀完整 canonical task；不自動取得 edit 權。
7. 只有本來就在 canonical source Board 具有 `edit_task` 的使用者，才可從副本編輯任務。
8. 「移除此處追蹤」只移除 reference placement；不封存、不刪除、不複製 task。
9. 完成、封存、還原、永久刪除由 canonical task 收斂所有投影。
10. 把副本放在相關任務下不會建立、修改或刪除 formal dependency。
11. primary 與 tracking reference 必須共用同一套 surface view、interaction controller、action catalog、drag sensors 與 recursive placement tree；不得以另一份近似 JSX 偽裝共用。
12. tracking reference 的單擊、雙擊、右鍵、鍵盤、手機 long-press、展開／收合與子任務操作入口，必須走與 primary 相同的 interaction kernel；差異只來自 placement kind、command route 與 capability guard。
13. 建立 tracking reference 預設只建立被選任務的一筆 placement，不自動複製整棵 canonical 子樹；要在該 reference 下追蹤其他子任務，需為各 canonical task 建立明確 tracking placement，並以 `parentPlacementId = reference placementId` 組成 tracking subtree。
14. 「互動一致」不等於「權限擴張」：derived-only actor 使用同一個詳情／action 元件但為唯讀；本來具有 canonical source capability 的 actor 才能從 reference 執行相同 canonical mutation。

使用思考習慣：#第一性原理。系統真正需要複數的是「出現位置」，不是「任務內容」或「任務狀態」。

## 2. Scope 與 release boundary

### 2.1 In scope

- 同一 Workspace／tenant 內的同 Board 與跨 Board tracking reference。
- Supabase production-shaped adapter 與 deterministic local-test adapter。
- primary／tracking placement normalization、建立、同板拖曳、跨板拖曳、移除、ordinary undo／redo。
- 動態衍生 read access、last-reference revoke、mutation 不擴權。
- task lifecycle、primary-only roll-up、task-id distinct counting、dependency no-op invariant。
- Board／List／Mind Map／Gantt／Calendar／全域工作台的 projection consumer contract。
- Board／List／Kanban card／checklist 的 shared task surface、placement-aware interaction kernel 與 recursive placement tree；primary／tracking 不得各自維護內容 JSX、gesture 或 child renderer。
- 追蹤副本的 click、double-click、context menu、pointer／keyboard／mobile DnD、focus、expand／collapse 與明細開啟 parity。
- Realtime refresh、reload／focus／online recovery、backup package compatibility。
- expand-first migration、old-client compatibility、feature gate 與 rollback plan。

### 2.2 Out of scope

- 跨 Workspace／tenant reference、公開分享連結或外部訪客 ACL。
- placement-local status、追蹤原因、追蹤者狀態、通知、訂閱、smart view 或自動投影。
- 多父層共同彙總、權重分攤或重複成本／工時計算。
- tracking reference 自動轉成 dependency。
- 建立一筆 parent reference 時自動複製或物化整棵 canonical 子樹；本期只建立明確指定的 tracking placements。
- 只因 target Board 可讀 reference 就授予 canonical edit／archive／delete；mutation 仍依 source capability。
- Firebase tracking-reference 寫入與資料模型；Firebase 只驗證既有 primary-only 功能不回歸。
- production migration、remote data repair、deploy、release 或正式環境 feature enable；須另走 deployment release gate。

### 2.3 Provider capability

```ts
type TaskTrackingReferenceCapability = {
  supported: boolean;
  reason?: 'backend_unsupported' | 'schema_not_ready';
};
```

| Backend | 第一版能力 | UI 行為 |
|---|---|---|
| Supabase | 完整 schema／RLS／RPC／Realtime | readiness probe 通過後顯示 action |
| local-test | 與 Supabase 等價的 domain invariant、idempotency 與 reload persistence | 顯示 action，供 browser／model gate |
| Firebase | explicit unsupported | 不顯示「建立追蹤副本」；不得寫 ghost local reference |

正式環境目前使用 Supabase。禁止因 `dataBackend.ts` 的 Firebase fallback 而把不安全的 client-only reference 當成相容實作。

## 3. Domain model

### 3.1 Identity

```ts
type TaskId = string;
type TaskPlacementId = string;

type TaskPlacementKind = 'primary' | 'tracking_reference';

interface TaskPlacement {
  id: TaskPlacementId;
  taskId: TaskId;
  workspaceId: string;
  boardId: string;
  parentPlacementId: TaskPlacementId | null;
  kind: TaskPlacementKind;
  order: number;
  kanbanStageId?: string;
  revision: number;
  removedAt?: number;
}

interface TaskProjectionNode {
  placementId: TaskPlacementId;
  taskId: TaskId;
  placementKind: TaskPlacementKind;
  workspaceId: string;
  boardId: string;
  parentPlacementId: TaskPlacementId | null;
  order: number;
  kanbanStageId?: string;
  task: TaskNode;
  access: {
    canRead: true;
    canEditCanonicalTask: boolean;
    canManageReferenceHere: boolean;
  };
}

interface TaskPlacementInteractionContext {
  taskId: TaskId;
  placementId: TaskPlacementId;
  placementKind: TaskPlacementKind;
  boardId: string;
  parentPlacementId: TaskPlacementId | null;
  canEditCanonicalTask: boolean;
  canManageReferenceHere: boolean;
}
```

`TaskNode.id` 繼續是 canonical `taskId`；不得把 `placementId` 寫進 dependency、record task link、task collection、calendar task identity 或 detail route。React key、tree parent、drag source、drop anchor 與 placement pending key 必須使用 `placementId`。需要展開多位置的 placement surface（Board／List／Mind Map）可使用 ephemeral `canonicalTaskId` 對應 placement-scoped render id；此欄位不得持久化，filter count／matched identity 仍以 canonical `taskId` 去重。Gantt／Calendar／Workbench 繼續使用 collapsed canonical projection。

`TaskPlacementInteractionContext` 是所有 task surface 的唯一互動輸入。primary／tracking reference 不得分別拼裝不同的 click handler、context menu payload、drag data 或 child identity。呈現層只讀取 canonical task 與此 context；寫入由 placement-aware controller 分流。

### 3.2 Invariants

- 每一筆 active `wbs_items` 恰有一個 active primary placement。
- 每個 task 可有零至多個 active tracking reference。
- 同一 task 在相同 `(boardId, parentPlacementId)` 最多一個 active tracking reference；primary 與 tracking 可暫時同父相鄰。
- primary placement 的 parent 只能是同 Board active primary placement。
- tracking placement 的 parent 可為同 Board active primary 或 tracking placement。
- tracking placement 的 parent chain 不得包含相同 `taskId`，也不得形成 placement cycle。
- tracking subtree 不得包含 primary placement；移除／跨板搬移 reference root 時，只處理 tracking placements。
- tracking placement 與 canonical primary 必須位於同一 Workspace；跨 Workspace 一律拒絕。
- canonical task fields：title、description、detail notes、status、assignee／collaborator、tags、dates、duration lock、node type、archive state。
- placement fields：Board、parent、order、Kanban stage、kind、technical revision／removed timestamp。

### 3.3 Canonical source compatibility

第一期保留 `public.wbs_items.project_id/parent_id/sort_order/kanban_stage_id` 作為 primary placement compatibility mirror，避免 expand migration 立即破壞舊 client、RAG、records 與既有服務。新 client 的 Board render 不再以這些欄位產生多投影；所有 placement mutation 走 placement command。

舊 client 看不到 tracking references，但仍能讀寫 primary task。compatibility trigger 必須讓舊 client 對 primary placement 欄位的合法更新同步到 primary placement；新 client 與 RPC 更新 placement 時，也必須回寫 mirror。禁止同時存在兩個可各自寫入且無同步約束的真相來源。

### 3.4 Account-unplaced boundary

本期不把 tracking reference 放進 `task_workbench_unplaced_items`，也不建立 reference staging status：

- reference 跨 Board drop 是 source Board → target Board 的單一交易；pending 時仍保留 source。
- 有 active tracking reference 的 canonical task／primary subtree，不得搬入 account-unplaced；回傳 `TRACKING_REFERENCE_BLOCKS_UNPLACED`。
- 使用者移除 references 後，既有 SPEC-089 board ↔ account-unplaced 流程恢復可用。
- unplaced task 沒有 primary Board action surface，因此不能建立 tracking reference。

此限制避免現行 account-owned JSONB 與 Board-derived RLS 產生兩個 canonical source。未來若要允許 tracked task 進入 unplaced，須另做 task entity 與 ownership surface 的 contract/expand migration。

## 4. PostgreSQL schema contract

### 4.1 `public.wbs_item_placements`

```sql
create table public.wbs_item_placements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  task_id uuid not null references public.wbs_items(id) on delete cascade,
  project_id uuid not null,
  parent_placement_id uuid,
  parent_scope_key uuid generated always as (
    coalesce(parent_placement_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) stored,
  placement_kind text not null check (placement_kind in ('primary','tracking_reference')),
  sort_order bigint not null,
  kanban_stage_id text,
  revision bigint not null default 1 check (revision > 0),
  removed_at timestamptz,
  created_by uuid references auth.users(id),
  removed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (placement_kind = 'primary' or created_by is not null),
  foreign key (tenant_id, project_id) references public.projects(tenant_id, id) on delete cascade,
  unique (tenant_id, project_id, id),
  foreign key (tenant_id, project_id, parent_placement_id)
    references public.wbs_item_placements(tenant_id, project_id, id)
);
```

Migration／RPC 必須拒絕 zero UUID placement ID，保留它作 root scope key。必要索引：

```sql
create unique index wbs_item_placements_one_active_primary
  on public.wbs_item_placements(task_id)
  where placement_kind = 'primary' and removed_at is null;

create unique index wbs_item_placements_one_reference_per_scope
  on public.wbs_item_placements(task_id, project_id, parent_scope_key)
  where placement_kind = 'tracking_reference' and removed_at is null;

create index wbs_item_placements_active_board_parent_order
  on public.wbs_item_placements(project_id, parent_placement_id, sort_order, id)
  where removed_at is null;

create index wbs_item_placements_active_task
  on public.wbs_item_placements(task_id, project_id)
  where removed_at is null;

create index wbs_item_placements_parent_fk
  on public.wbs_item_placements(tenant_id, project_id, parent_placement_id);
```

Complex invariants（active parent、primary parent kind、self-task ancestor、cycle）不得只靠 client；由 RPC 在鎖定 canonical rows 後驗證。

### 4.2 `public.task_tracking_reference_operations`

RPC 使用 private ledger 保證 idempotency：`(actor_id, operation_id)` primary key、`action`、immutable `request_hash`、`status`、`result jsonb`、timestamps。相同 actor／operation／payload replay 回傳相同 result；相同 operation 但 payload 不同回 `OPERATION_ID_CONFLICT`。authenticated 不得直接 select／insert／update／delete ledger。

### 4.3 Backfill 與 compatibility trigger

- 對 migration 當下全部 `wbs_items`（含 archived）各建立一筆 primary placement。
- parent placement 以 `wbs_items.parent_id` 對應的 primary placement ID 回填；root 為 null。
- `sort_order`、`kanban_stage_id` 與 source Board 逐筆 readback 相等。
- migration 在建立 unique constraint 前檢查 orphan、跨 Board parent、cycle 與 duplicate task ID；任一異常即 rollback，不做 best-effort 修補。
- 歷史 backfill primary 的 `created_by` 固定為 null，表示 migration provenance；新建 primary若有authenticated actor則記錄actor，新建tracking reference強制non-null。不得杜撰一般成員或system actor ID。
- legacy `wbs_items` primary placement 欄位與 primary placement 的雙向同步必須有 recursion guard，且 tracking rows永不回寫 mirror。

## 5. Permission、RLS 與資料外洩邊界

### 5.1 新 capability

新增單一 `manage_task_reference`，不是狀態：

- default owner／admin／project_manager／member 有；viewer 無。
- migration 對既有 custom `board_role_permissions`：只有該 role 目前包含 `move_task` 時才追加 `manage_task_reference`；不得覆蓋其他自訂 capability。
- 建立：需要 source primary Board 的 `manage_task_reference`。
- 同 Board move/remove/restore：需要該 reference Board 的 `manage_task_reference`。
- 跨 Board move：source 與 target Board 都需要 `manage_task_reference`。
- 所有操作仍要求 actor 可讀 canonical task；跨 Workspace 永遠拒絕。

DB capability判斷固定由`private.current_user_has_project_capability(target_tenant_id uuid, target_project_id uuid, target_capability text, target_user_id uuid)`負責：有custom `board_role_permissions` row時採該array；沒有row時採與`BOARD_ROLE_CAPABILITIES`相同的server default matrix；Workspace owner/admin inheritance仍依ADR-036。RPC不得只用coarse `current_user_can_write_project()`取代此helper。

### 5.2 Derived read

`private.current_user_can_read_task_via_placement(task_id, user_id)` 使用 `security definer`、`set search_path=''`，只查 active placement 與動態 `project_members`／Workspace admin inheritance。RLS 的 `auth.uid()` 使用 `(select auth.uid())` 形式，避免 per-row 重複求值。

`wbs_items SELECT` 條件為：

```text
can_read_canonical_source_board
OR exists active placement on a Board the caller can read
```

因此 reference 建立後，目標 Board 現有／未來成員自然取得 read；最後一個 reference 移除後，沒有 source／其他 direct path 的使用者在下一次 query 即被拒絕。不得另外寫一份永久 task ACL，避免 grant/revoke 漂移。

### 5.3 Mutation boundary

- reference-derived access 絕不參與 `wbs_items INSERT/UPDATE/DELETE` policy。
- canonical content edit 只依 source Board effective `edit_task` capability；reference UI access flag與server mutation policy都呼叫同一capability helper，避免client/DB matrix漂移。
- reference actor 不得透過修改 placement 欄位改寫 `wbs_items.project_id`、canonical primary parent 或 ownership。
- placement 表對 authenticated 只開 SELECT；INSERT／UPDATE／DELETE 只允許受控 RPC。
- helper／RPC 固定 search path、schema-qualified query、revoke PUBLIC，僅必要 public RPC grant authenticated；private helper 不暴露於 API schema。

### 5.4 Related data

- `wbs_item_tags`：derived reader 可讀 task 的 tag assignments；寫入仍依 canonical edit/assign capability。
- `wbs_dependencies`：dependency identity 維持 task ID；caller 只有在兩端 task 都可讀時才能看到完整 edge。不得因看到 A 的 reference 洩漏 hidden task B。
- `record_task_links`／knowledge record：遵循 record 自身 visibility；reference 不授權 meeting/work-log/task-collection 內容。
- activity／audit：reference 不自動授予 source Board activity 或 audit；操作事件依 involved Board 權限顯示。
- quick memo／calendar subscription／RAG：不因 reference 取得來源 Board 或帳號私有資料。

Supabase 依據：官方 RLS 指南要求 exposed table 啟用 RLS、用 policy 控制資料，並建議把 security-definer helper 放在非 exposed schema；RLS 中 auth helper 以 subselect 可降低逐列成本。官方 Postgres Changes 文件要求 publication、RLS 與 filter 契約明確。連結見本文末。

## 6. Server command contract

### 6.1 Read APIs

```ts
interface TaskPlacementRepository {
  getCapability(): Promise<TaskTrackingReferenceCapability>;
  listBoardProjection(workspaceId: string, boardId: string): Promise<TaskProjectionNode[]>;
  listCanonicalTasksByIds?(workspaceId: string, taskIds: readonly string[]): Promise<TaskNode[]>;
  createTrackingReference(command: CreateTrackingReferenceCommand): Promise<TaskPlacementCommandResult>;
  moveTrackingReference(command: MoveTrackingReferenceCommand): Promise<TaskPlacementCommandResult>;
  removeTrackingReference(command: RemoveTrackingReferenceCommand): Promise<TaskPlacementCommandResult>;
  restoreTrackingReference(command: RestoreTrackingReferenceCommand): Promise<TaskPlacementCommandResult>;
}
```

Supabase canonical Board read固定為 `public.get_board_task_projection_v1(p_project_id uuid)`；server驗證caller可讀target Board，回active placements、canonical task payload與`canEditCanonicalTask`，不得相信client傳入workspace ownership。Supabase adapter不得以多次client query取代此單一read boundary；local-test adapter回傳相同wire shape。

當 active Board projection 已先載入、但跨 Board reference 的 canonical task 不在目前 store scope 時，adapter 可透過 `listCanonicalTasksByIds` 以同一 derived-read/RLS boundary 補水 canonical payload；此補水不得把 source Board placement 或 workflow state 複製成第二份。Hydration 後的 canonical `boardId` 必須優先使用可讀 project 的 legacy board identity，其次使用 task metadata 的 legacy board identity，最後才使用資料庫 project UUID；不得把 target reference Board 當成 canonical source Board。

Provider readiness固定呼叫`public.get_task_tracking_reference_capability_v1()`，回`{ schemaVersion: 1, supported: true }`。函式不存在、version未知或call失敗都映射為`SCHEMA_NOT_READY`並隱藏feature；不得用「table query剛好成功」推測ready。

Supabase public function signatures固定如下，全部`returns jsonb`：

```sql
public.get_task_tracking_reference_capability_v1()
public.get_board_task_projection_v1(p_project_id uuid)
public.create_task_tracking_reference_v1(
  p_operation_id text,
  p_source_primary_placement_id uuid,
  p_expected_revision bigint,
  p_client_platform text
)
public.move_task_tracking_reference_v1(
  p_operation_id text,
  p_reference_root_placement_id uuid,
  p_expected_subtree_ids uuid[],
  p_expected_revision bigint,
  p_target_project_id uuid,
  p_target_parent_placement_id uuid,
  p_anchor_placement_id uuid,
  p_position text,
  p_client_platform text
)
public.remove_task_tracking_reference_v1(
  p_operation_id text,
  p_reference_root_placement_id uuid,
  p_expected_subtree_ids uuid[],
  p_expected_revision bigint,
  p_client_platform text
)
public.restore_task_tracking_reference_v1(
  p_operation_id text,
  p_reference_root_placement_id uuid,
  p_expected_subtree_ids uuid[],
  p_expected_revision bigint,
  p_client_platform text
)
```

nullable parent／anchor由SQL null表達；client不得傳空字串或sentinel UUID。所有mutation function從`auth.uid()`推導actor，client不傳user／tenant／source Board。

### 6.2 Create RPC

`create_task_tracking_reference_v1(operation_id, source_primary_placement_id, expected_revision, client_platform)`：

1. 鎖定 ledger、source placement、task 與 source sibling scope。
2. 驗證 source 是 active primary、actor 有 `manage_task_reference`、task 非 effectively archived。
3. 在相同 parent、緊接 source 後方建立一筆 tracking reference；server dense-normalize siblings。
4. exact scope 已有 reference 時回 `REFERENCE_SCOPE_DUPLICATE`，不建立第二筆。
5. 寫 activity/audit、ledger result；回 canonical affected placements。

### 6.3 Move RPC

`move_task_tracking_reference_v1(operation_id, reference_root_placement_id, expected_subtree_ids, expected_revision, target_project_id, target_parent_placement_id, anchor_placement_id, position, client_platform)`：

- source 必須是 active tracking reference；subtree 只能包含 active tracking references。
- `expected_subtree_ids` 必須和 server cycle-safe traversal 完全相等。
- target 必須同 tenant；target parent／anchor 必須 active 且在 target Board。
- 驗證 source／target capability、self-task ancestor、cycle、exact-scope duplicate。
- 依排序後的 scope key 鎖 source／target direct siblings，避免相反方向 concurrent move deadlock。
- 同 transaction 更新 subtree Board、parent、order、revision與 affected sibling order。
- 任一驗證／寫入／row-count 失敗，source subtree 原位保留。
- result 只包含 placements／affected Board scopes；不得改 canonical task、primary placement或 dependencies。

`position` 僅允許 `before | after | append-child | append-root`。before/after 必須有 anchor；append-root 不得有 parent；append-child 必須有 target parent。

### 6.4 Remove／restore

- `remove_task_tracking_reference_v1` soft-remove reference subtree，填 `removed_at/removed_by`；若 subtree > 1，UI confirmation 顯示「將移除此處的 N 個追蹤位置」，但不得說刪除 N 個任務。
- `restore_task_tracking_reference_v1` 用原 placement IDs、parent/order snapshot與新 operation ID 做 ordinary undo；若 parent 不存在、scope 已被占用或權限已失效，fail closed，不另建替代位置。
- primary placement 不接受 remove/restore reference RPC。

### 6.5 Result 與 error

```ts
type TaskPlacementCommandResult = {
  operationId: string;
  status: 'committed' | 'replayed';
  taskIds: string[];
  canonicalPlacements: TaskPlacement[];
  affectedBoardIds: string[];
};
```

穩定 error codes：`BACKEND_UNSUPPORTED`、`SCHEMA_NOT_READY`、`SOURCE_PLACEMENT_NOT_PRIMARY`、`REFERENCE_SCOPE_DUPLICATE`、`REFERENCE_NOT_FOUND`、`REFERENCE_PERMISSION_DENIED`、`TARGET_BOARD_FORBIDDEN`、`CROSS_WORKSPACE_REFERENCE_FORBIDDEN`、`PLACEMENT_CYCLE`、`TASK_SELF_ANCESTOR`、`STALE_PLACEMENT_REVISION`、`TRACKING_REFERENCE_BLOCKS_UNPLACED`、`OPERATION_ID_CONFLICT`、`PARENT_SCOPE_MISMATCH`、`SUBTREE_MISMATCH`。

UI 只把可恢復訊息映射為短句；不得顯示 SQL、policy 或內部 ID。

| Error code | 使用者訊息 |
|---|---|
| `BACKEND_UNSUPPORTED`／`SCHEMA_NOT_READY` | `此環境尚未支援追蹤副本。` |
| `REFERENCE_SCOPE_DUPLICATE` | `此位置已有這個任務的追蹤副本。` |
| `REFERENCE_PERMISSION_DENIED`／`TARGET_BOARD_FORBIDDEN` | `你沒有管理此處追蹤副本的權限。` |
| `CROSS_WORKSPACE_REFERENCE_FORBIDDEN` | `追蹤副本目前只能放在同一工作區。` |
| `PLACEMENT_CYCLE`／`TASK_SELF_ANCESTOR`／`PARENT_SCOPE_MISMATCH` | `無法放在這個位置，請選擇其他位置。` |
| `STALE_PLACEMENT_REVISION`／`SUBTREE_MISMATCH` | `位置已被更新，重新整理後再試一次。` |
| `TRACKING_REFERENCE_BLOCKS_UNPLACED` | `請先移除這個任務的追蹤副本，再移到未歸位。` |
| `OPERATION_ID_CONFLICT` | `這次操作已失效，請重新執行。` |
| `REFERENCE_NOT_FOUND` | `追蹤副本已不存在。` |

## 7. Client state 與演算法

### 7.1 Normalized store

`useWbsStore.nodes[id]` 不再作 board tree 的唯一來源。目標 state：

```ts
tasksById: Record<TaskId, TaskNode>;
placementsById: Record<TaskPlacementId, TaskPlacement>;
taskPlacementIds: Record<TaskId, TaskPlacementId[]>;
boardPlacementIds: Record<BoardId, TaskPlacementId[]>;
parentPlacementIds: Record<TaskPlacementId | 'root:<boardId>', TaskPlacementId[]>;
pendingPlacementOperations: Record<TaskPlacementId, string>;
```

Compatibility `nodes` 若暫時保留，只能由 `tasksById + primary placement` 單向產生，不得被 Board render／DnD 當作多投影真相，也不得形成第二個可寫 state。

### 7.2 Projection algorithm

```text
load active placements for board
→ load distinct canonical taskIds
→ evaluate task filter once per taskId
→ expand context ancestors by placement parent chain
→ join task + placement into TaskProjectionNode
→ stable sort by (parentPlacementId, order, placementId)
```

- task filter 的 `matchedTaskIds` 維持 canonical task identity；同 task 的可見 placements 全部採用同一 match 結果。
- context-only ancestor 是 placement context，不把 ancestor task誤算為 matched。
- Board／List／Mind Map 可顯示每個 placement。
- Gantt／Calendar 在同 Board 依 `taskId` collapse 成一個時間物件；有 primary 優先 primary，只有 references 時用最小 `(order, placementId)`；只由 reference 進入時以 dashed stroke/border 呈現。
- 全域工作台「已歸位／所有任務」仍以 distinct taskId 顯示一次，位置文字選 caller 可讀的 primary，否則選最小 visible reference。

### 7.3 Roll-up 與 count

```text
primaryChildren(taskId) = child tasks whose primary placement.parent is this task's primary placement
rollup(taskId) = aggregate(primaryChildren(taskId))
```

tracking edge 永遠不進 `primaryChildren`。Board／portfolio count 使用 `distinct taskId`；同 Board 多個 references 不得重複任務數、工時、成本或完成數。若某 Board 只透過 reference 看見 task，該 Board可顯示該 task 一次，但不可把 reference parent 當成進度父層。

### 7.4 Lifecycle effective visibility

active projection 需同時滿足：placement 未移除、task 未 archived、canonical primary ancestor chain 沒有 archived ancestor。這保留 SPEC-088「封存父層後後代不殘留」並讓其他 Board 的 descendant references 同步隱藏。還原後沿原 placement 恢復；永久刪除 task/subtree cascade placements。

### 7.5 Shared surface 與 interaction algorithm

本期不得建立一個含大量 `variant` 分支的巨型元件，也不得繼續讓 `TrackingReferenceItem` 複製 primary JSX。固定分層如下：

```text
TaskPlacementController
├─ TaskSurfaceFrame
├─ TaskListRowView | TaskKanbanCardView | TaskChecklistRowView
└─ TaskPlacementTree
```

- `TaskPlacementController`：解析 `taskId + placementId + placementKind`、capability、click／context／gesture、pending、error recovery 與 command route。
- `TaskSurfaceFrame`：只處理 surface 外框、selected／focus／pending 等共同 frame state；primary 與 tracking 的唯一常駐視覺差異為 solid／dashed outer border。
- 三個 surface view 是 pure view，正本與副本使用同一 component instance contract；不得內含 placement mutation。
- `TaskPlacementTree`：以 `parentPlacementId` 遞迴，正本與副本共用 expand／collapse、SortableContext、child slot 與 error boundary。
- `TrackingReferenceItem` 完成重構後應移除，或只保留不含 task content／action／gesture／child JSX 的薄 placement adapter。

Interaction dispatch：

```text
pointer／keyboard／mobile event
→ build TaskPlacementInteractionContext
→ shared task interaction catalog／gesture controller
→ capability guard
→ primary: existing canonical command
   tracking: placement command
→ canonical readback／realtime convergence
```

Subtree projection：

```text
children(parentPlacementId)
→ active placements in the same Board
→ join each placement with canonical task
→ stable sort(order, placementId)
→ recurse with the same TaskPlacementTree
```

primary child edge仍是唯一 roll-up graph；tracking child edge只決定當前投影樹的顯示與拖曳範圍。建立一筆 tracking parent 不隱式建立 canonical descendants 的 references；若使用者要追蹤某個 descendant，必須建立該 task 的明確 tracking placement。

## 8. UI／UX 與 DnD contract

### 8.1 Action surface

- `task.create-tracking-reference` 加入共用 task action catalog 的 create section，label 固定「建立追蹤副本」。
- 只在 primary placement、provider supported、task active、actor 有 source Board `manage_task_reference` 時顯示。
- primary／tracking reference 必須進入同一個 action catalog 與 guard pipeline；不得由 reference component 自行拼一套 menu／按鈕。
- `task.create-tracking-reference` 在目前 scope 已存在相同 task reference 時仍依 duplicate guard 隱藏或拒絕；tracking placement 另外提供「移除此處追蹤」。
- canonical edit／status／archive／delete 等 action 是否可見，只由 canonical source capability 決定；derived-only actor 從 reference 進入時仍使用同一元件，但 guard 後只保留合法 read／reference-management action。
- 不新增常駐說明卡、追蹤 badge、顏色狀態或第二套工具列。

### 8.2 Click／details parity

- 單擊、雙擊、Enter／Space activation、右鍵與 mobile long-press 必須透過既有 task interaction kernel，不得直接在 tracking component 呼叫 `selectAndOpenTaskDetails`。
- primary／tracking 皆開啟同一個 Task Details component，並攜帶 `TaskPlacementInteractionContext`；details 讀取與更新仍以 canonical `taskId` 為準。
- derived-only actor 進入同一 details component 時由 capability 切換唯讀；有 canonical source edit capability 的 actor 可從 reference 執行相同合法更新，所有 placements 以 canonical readback／Realtime 收斂。
- selected、focus return、context menu anchor、record／dependency selection mode 與 visible error 行為必須與 primary surface 相同；placement context 不得在 navigation 後遺失。

### 8.3 Visual／accessibility

- primary 使用現行實線；tracking reference 必須沿用同一 surface 的 primary task content／slot／layout，唯一常駐可見差異是外層虛線外框／stroke；不得再加「追蹤副本」badge 或「同步自主要任務」說明列。
- 移除追蹤操作仍保留在 placement 的 keyboard／screen-reader action layer；預設畫面不佔用正本內容位置，取得 keyboard focus 時才顯示 action focus treatment。
- accessible name 加入「追蹤副本」，例如 `A任務，追蹤副本`；不能只靠虛線。
- 建立成功後 focus 到新 placement；live region 簡短宣告「已建立追蹤副本，可拖曳調整位置」。
- pending 時只鎖 affected placement subtree；失敗移除 optimistic shell或維持 source，不留 ghost。
- 1440×900、390×844、320×844 不得增加水平 overflow、框中框或遮住 task title/action。

### 8.4 Drag semantics

- drag data 必帶 `taskId + placementId + placementKind`；只帶 taskId 的 reference drag 一律拒絕。
- primary drag 走既有 primary placement／SPEC-089 path；reference drag 走本規格 RPC。
- reference parent drag 移動整個 tracking-reference subtree。
- 同 Board 可 before／after／append-child；drop marker 沿用既有 insertion marker。
- 跨 Board：使用者先在全域工作台選擇 destination Board，再把虛線 reference 拖入「已歸位」lane，形成 atomic `append-root`；reference 不進未歸位 lane。切換到 destination Board 後可再拖到精確父層／順序。
- 工作台已歸位 rows 仍不是 drag source，維持 SPEC-086；destination lane 只是 reference cross-board drop target。
- KeyboardSensor：Space 啟動／提交、方向鍵移動 target、Escape 取消；手機沿用既有 long-press session與同一 command builder。
- primary／tracking 必須共用 collision detection、insertion marker、pointer sensor、KeyboardSensor、mobile long-press session、focus return 與 live region；只在 commit command 分流。
- reference 的直接 children 與 descendants 必須由同一 `TaskPlacementTree` 參與 SortableContext；reference root move 以 descendant closure 做單一原子 command，cycle target、跨 Workspace target 或 primary-under-reference 一律 fail closed。

## 9. Realtime、recovery 與 concurrency

- `wbs_item_placements` 納入 `supabase_realtime` publication（先檢查 publication 是否已 `FOR ALL TABLES`）。
- active Board channel 監聽該 Board placement INSERT／UPDATE；DELETE 走 SPEC-082 unfiltered rare-event refresh。
- canonical task content／status／archive 更新時，DB trigger 只 touch active placements 的 technical revision／updated_at，讓所有 target Board 收到 invalidation；不複製 task content。
- callback 不直接套不完整 row；重新呼叫 `listBoardProjection`，以 server/RLS canonical read收斂。
- pending command期間 source subtree 為準；success套 canonical result，failure保留 source。
- `SUBSCRIBED` 後補一次 bounded read；online、visibilitychange、channel error 後重新 read，涵蓋 DELETE/RLS event 遺漏。
- stale response 以 board scope token／request sequence 丟棄，不能把舊 reference 注入新 Board。

## 10. Undo、activity、dependency 與 lifecycle

- create undo = remove；move undo = inverse move；remove undo = restore。每個 user gesture 只推一個 async-aware command。
- undo/redo 使用新 operation ID與 expected revision；權限或 target 已變更時顯示失敗，不能 client-only 倒帶。
- permanent delete 不進 ordinary undo；archive／restore更新 task一次，投影由 read/realtime收斂。
- reference create/move/remove/restore 分別寫`task_reference_created`、`task_reference_moved`、`task_reference_removed`、`task_reference_restored`可稽核event，至少含actor、task IDs、source/target Board、placement IDs、operation ID；不得複製task note內容到activity。
- operation 前後 dependency set hash 必須相同；reference parent不得產生 dependency side或 offset。

## 11. Backup／import contract

SPEC-047 package 升級讀寫 `schemaVersion: 3`，parser 同時接受 v2：

- v3 的 `tasks` 仍只包含該 Board primary-owned canonical tasks。
- 新增 `trackingReferences[]`：placement ID、source task ID、parent placement mapping、order、stage；不內嵌另一 Board canonical task內容。
- same-board replace：reference 只有在 source task仍存在、caller可讀且同 Workspace時恢復；否則整筆 plan fail或由使用者選擇明示 skip，禁止靜默複製 task。
- copy-to-new-board：合法 external task恢復為 tracking reference；missing／forbidden列入 report。現行 board-scoped export 若 canonical task不在 payload，會以 `OUT_OF_PACKAGE_REFERENCE` fail closed，避免在未有明示 external-task report／restore contract 前製造第二份 task。
- v2 import 只建立 primary placements；不杜撰 references。
- checksum涵蓋 canonical-sorted placements。export 必須由 backend canonical query取得，不用 Zustand 當完整來源。

DEV-095 release gate 前必須同步更新 SPEC-047／backup verifier；若未完成，tracking feature不得 release。

## 12. Migration／rollout／rollback

### 12.1 Forward-only artifacts

1. `supabase/migrations/<timestamp>_dev_095_task_placement_expand.sql`：table、indexes、backfill、compatibility trigger、capability backfill、RLS/grants、publication。
2. `supabase/migrations/<timestamp>_dev_095_task_tracking_reference_commands.sql`：helpers、capability/read RPC、create/move/remove/restore RPC、activity allowlist、Realtime invalidation。

不得改寫已套用 migration。Supabase 官方 migration guide要求 remote schema變更經 migration files／`db push`，不得直接在 remote Dashboard 形成未追蹤漂移。

### 12.2 Rollout

1. isolated PostgreSQL reset／pgTAP 完整通過。
2. Supabase TEST backup、migration apply、backfill readback、RLS／RPC／concurrency。
3. 部署 feature-disabled client；readiness probe驗證 table/RPC版本。
4. Supabase TEST enable，完成 two-user desktop/mobile Level 3。
5. production backup與migration history gate通過後才可 apply；同 artifact deploy，先內部 enable再擴大。

### 12.3 Rollback

- application rollback／feature off：舊 client繼續讀 primary `wbs_items`；tracking rows保留但不顯示，不刪資料。
- migration已產生 references後不得 drop table作緊急回退。
- 錯誤 reference可用受控 remove RPC處理；production data repair需另有查詢、備份與 approval。

## 13. 逐檔 Implementation Map

| Work package | 檔案 | 固定變更 | 完成 gate |
|---|---|---|---|
| WP1 Domain | `src/types/index.ts`、`src/features/taskTracking/{types,model,errors,localService}.ts` | task／placement／projection types、invariants、distinct count與primary roll-up | pure/property tests |
| WP2 Provider | `src/services/dataBackend.ts`、`src/services/supabase/taskTrackingReferenceService.ts`、`src/services/supabase/projedService.ts`、`src/features/taskTracking/localService.ts` | capability probe、derived-read canonical hydration、repository、stable error mapping；Firebase unsupported | adapter contract parity |
| WP3 DB | `supabase/migrations/20260828100000_dev_095_task_tracking_references.sql`、`src/services/supabase/database.types.ts` | schema、backfill、RLS、RPC、indexes、realtime、types | isolated DB＋TEST DB |
| WP4 Store | `src/store/useWbsStore.ts`、`src/features/taskTracking/model.ts` | normalized indices、canonical result、pending、undo、lifecycle projection | model＋regression |
| WP5 Interaction | `src/interactions/task/types.ts`、catalog、guards、`useTaskInteractionBinding.ts`、`TaskActionMenu.tsx`、`GlobalContextMenu.tsx` | `TaskPlacementInteractionContext`、primary/reference 共用 click／context/action pipeline、capability guard與command routing | source contract＋click/action browser parity |
| WP6 Shared Surface | `src/components/Wbs/TaskSurfaceFrame.tsx`、`TaskListRowView.tsx`、`TaskKanbanCardView.tsx`、`TaskChecklistRowView.tsx`、`TaskPlacementTree.tsx`（檔名可依 repo 慣例微調，但責任不可合併回 duplicate renderer） | 抽取 pure surface views與單一 recursive placement tree；刪除 `TrackingReferenceListContent`／`TrackingReferenceCardContent`／reference-only child renderer | source duplication gate＋rendered visual/child parity |
| WP6A Render/DnD integration | `BoardView.tsx`、`WbsNodeItem.tsx`、`WbsListView.tsx`、`KanbanCard.tsx`、`KanbanColumn.tsx`、`KanbanChecklist.tsx`、`MindMap/MindMapView.tsx`、`GanttView.tsx`、`CalendarView.tsx` | primary/reference 都由 shared controller／views／tree 進入；placement keys／parents、dashed frame、collapse rules、shared pointer／keyboard／mobile commands | interaction-parity browser＋viewport＋gesture evidence |
| WP7 Workbench | `TaskWorkbenchPanel.tsx`、`src/features/taskTracking/model.ts`、`BoardView.tsx`、SPEC-039/086 consumers | taskId distinct projection（primary優先、source不可讀時保留visible reference）、cross-board reference root drop、不進 unplaced | two-board desktop/mobile |
| WP8 Integrations | filter projection、dependency、Realtime hook、Recycle Bin、Task Details、backup v3 | identity/visibility/lifecycle/backup收斂 | cross-spec regression |
| WP9 Evidence | `scripts/verify-dev-095-*`、`QA-DEV-095`、`QC-DEV-095` | static/model/DB/browser/evidence artifacts | no P0/P1 open |

## 14. Acceptance criteria

- AC-095-001：正常 primary task action可見「建立追蹤副本」；tracking reference與unsupported backend不顯示。
- AC-095-002：建立後只新增一個相鄰虛線 placement；task row、task ID與canonical content數量不變。
- AC-095-003：同 scope duplicate、same operation replay、different-payload replay符合 unique/idempotency contract。
- AC-095-004：reference 同板／跨板拖曳只改 tracking subtree；primary ownership與其他 placements不變，failure source原位。
- AC-095-005：primary、tracking、dependency、record link分別使用正確 taskId／placementId，無 identity collision。
- AC-095-006：primary-only roll-up與distinct task count不因 references放大。
- AC-095-007：目標 Board現有／未來成員可讀完整 task；沒有 source `edit_task` 就不能 mutation。
- AC-095-008：last reference removal後 derived-only user read被撤銷；其他 reference／source direct access仍有效。
- AC-095-009：related data不越權：hidden dependency endpoint、record、audit、private memo不因 reference洩漏。
- AC-095-010：complete／archive／restore／permanent delete在所有模式與投影一致；archived primary ancestor後 descendant references不殘留。
- AC-095-011：「移除此處追蹤」只移除 reference subtree，可ordinary undo；永久 task delete仍不可ordinary undo。
- AC-095-012：reference操作前後 formal dependency set完全相同。
- AC-095-013：Board／List／Mind Map placement-aware；Gantt／Calendar／Workbench按taskId collapse規則一致。
- AC-095-014：Supabase two-user Realtime與reload/focus recovery收斂，無ghost、duplicate、stale permission。
- AC-095-015：Firebase action隱藏且primary-only regression通過；local-test與Supabase domain contract一致。
- AC-095-016：backup v3保留合法 references，v2 import只建立primary；external missing/forbidden不靜默複製。
- AC-095-017：1440×900、390×844、320×844、keyboard、screen reader語意與visible-error sweep通過；visual case必須證明reference與primary具有相同可見內容／標題版面且只以外層虛線區分。本AC只證明視覺結果，component reuse另由AC-095-019驗證。
- AC-095-018：migration backfill一 task一 primary、零 orphan/cycle/duplicate，old-client primary read/write與feature-off rollback成立。
- AC-095-019：List row、Kanban card、checklist row 的 primary／tracking 必須由同一 pure surface view render；source gate 不得存在 reference-only task content／date／tag／assignment JSX，外框差異集中在 `TaskSurfaceFrame`。
- AC-095-020：primary／tracking 的 click、double-click、context menu、Enter／Space、mobile long-press 都經同一 interaction binding；相同 capability 下 action IDs、details destination、focus return與visible error一致。
- AC-095-021：primary／tracking 共用 pointer、keyboard與mobile DnD sensors、collision與insertion marker；commit只依 placement kind分流，tracking move不改 primary ownership，失敗保留source。
- AC-095-022：tracking placement可使用與primary相同的展開／收合與recursive child surface；nested reference click／drag／remove／undo使用同一 `TaskPlacementTree`，父reference移動整個tracking subtree且不進roll-up。
- AC-095-023：derived-only actor在reference中使用同一details/action元件但mutation controls受guard；具有canonical source capability的actor可從reference執行相同合法canonical更新，所有placements同步收斂。
- AC-095-024：既有B01～B16只能作historical baseline；必須新增並通過interaction parity cases，且evidence包含source revision、normal UI entry、desktop／390／320 viewport、pointer／keyboard／mobile操作、child expand/collapse與visible-error sweep，才能宣稱本次rework PASS。

## 15. Stop conditions

下列任一成立，RD 不得宣稱實作完成或交 release：

- taskId／placementId仍在任一 DnD／tree consumer混用。
- RLS只在 client隱藏 edit，DB仍可由derived-only user更新 canonical task。
- reference create/move/remove任一部分成功、權限部分授予或失敗後 source消失。
- migration無法證明一 task一 primary、parent mapping或old-client compatibility。
- reference導致dependency、roll-up、count、archive effective visibility或backup資料失真。
- Firebase默默落本機、Supabase schema未就緒卻顯示action。
- 缺少兩使用者 RLS／Realtime與真實桌機／手機 rendered evidence。
- `TrackingReferenceItem` 或其他 reference-only component 仍複製 primary title／tag／date／assignment／action／gesture／child JSX，卻只以相同 `data-*` marker 宣稱共用。
- tracking click繞過共用 interaction binding、context menu維持固定唯讀 action集合而不依canonical capability，或primary/reference使用不同sensor／collision／child renderer。
- 子任務只在primary可展開／拖曳，或reference subtree以另一套遞迴元件造成視覺、焦點、gesture、error recovery漂移。

## 16. Authoritative references

- `ADR-046-task-identity-and-placement-projection.md`
- `SPEC-089-authoritative-task-placement-transaction.md`
- `SPEC-088-task-lifecycle-complete-archive-delete.md`
- `SPEC-086-task-workbench-subtree-staging.md`
- `SPEC-082-board-realtime-collaboration.md`
- `SPEC-047-board-backup-package-transactional-import.md`
- `SPEC-044-undo-recovery-scope-expansion.md`
- `SPEC-039-task-filter-core-and-workbench-profiles.md`
- `ADR-036-trello-like-workspace-governance.md`
- Supabase RLS：https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Realtime Postgres Changes：https://supabase.com/docs/guides/realtime/postgres-changes
- Supabase Database Migrations：https://supabase.com/docs/guides/deployment/database-migrations

## 17. 變更紀錄

- 2026-08-28：由 Brief Ready 升級為 `RD Implementation Ready`；固定 identity／placement schema、provider gate、RLS、RPC、migration、normalized store、projection／roll-up算法、cross-board DnD、Realtime、undo、backup、逐檔 work package、AC 與 stop conditions。
- 2026-08-28：進入 `RD Implementation In Progress`；Supabase/local-test adapter、store／UI、forward-only migration 與 local model verifier 已落地；isolated PostgreSQL matrix、完整 cross-mode QA/QC、remote migration 與 release 分別按 gate 追蹤。
- 2026-08-28：完成 task-owned PostgreSQL 18 isolated migration/RLS/RPC/concurrency matrix，結果 PASS 並確認 temporary runtime cleanup；保留 `RD Implementation Ready` 作為文件成熟度，另以 `Implementation In Progress` 表示產品仍待完整 QA-QC gate，不宣稱完成或可 release。
- 2026-08-28：完成 local-test browser core B01～B07、B09～B11 共 10/10 PASS，涵蓋 desktop、390／320 mobile、cross-board workbench root drop、reload visibility、keyboard remove、reference ordinary undo/redo、320px no-overflow 與 List／Mind Map／Gantt／Calendar marker；artifact：`output/playwright/dev-095/result.json`。B08、B12～B14、完整 cross-mode QA/QC、Supabase TEST 與 release 仍待執行。
- 2026-08-28：補齊 Gantt／Calendar／共用側欄／Mind Map 的 placement-only dashed projection marker 與 placement-aware drag；跨板 reference 不再沿用 canonical child toggle，backup v3 對 payload 外 canonical task 以 `OUT_OF_PACKAGE_REFERENCE` fail closed。model／source contract artifacts 已產生並 PASS；完整 cross-mode、Supabase TEST、QC 與 release 仍待執行。
- 2026-08-28：重跑 browser B01～B07、B09～B11、B15 共 11/11 PASS，並補強 WbsList／Kanban／Board 根層與巢狀 reference subtree renderer、reference drop anchor、tracking subtree workspace refresh 與唯讀管理 guard；`npx tsc --noEmit`、targeted ESLint、`build:test`、model/source contract 與 isolated PostgreSQL matrix 均再次 PASS。完整 QA/QC、Supabase TEST、performance/EXPLAIN 與 release 仍 pending。
- 2026-08-28：完成 backup v3 fractional／nested reference read-after-write、v2 primary-only與external-reference fail-closed verifier（4/4）；補上 local-test provider failure injection與UI recoverable error path，browser B01～B15 15/15 PASS（含 B08、B12～B14）；isolated PostgreSQL 10k tasks／25k placements EXPLAIN 及索引命中檢查納入 11/11 artifact。文件維持 `RD Implementation Ready / Implementation In Progress / 未 Release`：Supabase TEST、獨立 QC、remote migration與release仍待授權與執行。
- 2026-08-28：新增 `verify-dev-095-task-tracking-references-qc.ts`，獨立交叉檢查 browser／backup／isolated DB artifact 的語意 postconditions，QC01～QC06 6/6 PASS；建立 `QC-DEV-095-task-tracking-reference-projections.md`。此為 targeted local QC，不取代 Supabase TEST、完整跨模式深度 QA 或 release gate。
- 2026-08-28：修正 Supabase derived-read hydration 的 canonical board identity 映射；不再將 source `project_id` UUID 直接冒充 `TaskNode.boardId`，改採可讀 legacy board identity、task metadata fallback、DB UUID 最後保底，並新增 source contract gate。
- 2026-08-28：補強 local-test placement resolver，使 primary anchor 與 tracking anchor 使用相同 placement contract，before／after 會驗證 target parent／anchor scope，append order 同時納入 primary／tracking siblings；model verifier 更新為 14 checks，cross-mode／browser／targeted QC 重跑通過。
- 2026-08-28：補上 tracking projection 的 interaction context 傳遞；工作台／Mind Map／清單開啟追蹤副本詳情時保留 reference identity，context menu 僅提供檢視，詳情 modal 以唯讀呈現，並由 browser B16 直接驗證，避免將投影誤當成可編輯 canonical task。
- 2026-08-28：擴充 task-owned PostgreSQL matrix 至 15/15，新增 tenant isolation、future viewer read/revoke、custom capability 與 private helper grant boundary；為 private schema helper 收斂 `PUBLIC`／`anon`／`authenticated`／`service_role` execute 權限，僅保留 RLS policy 所需 helper，並完成 Database Lint read-only preflight。
- 2026-08-29：fresh rerun browser B01～B16 16/16、backup 4/4、cross-mode I01～I12 12/12、isolated PostgreSQL 15/15 與 targeted QC 7/7；browser task-owned runtime 與 DB runtime 均確認清理，既有 Vite 4000 不屬本輪 runtime。
- 2026-08-29：依使用者 UI rework，清單／看板／下層任務 tracking reference 改沿用 primary task content／layout，移除常駐 badge／同步說明，只保留外層虛線；移除 action 改為 focus 時才顯示的 keyboard／screen-reader layer。B13 更新為 primary/reference visual parity assertion，browser B01～B16 重新驗證通過。
- 2026-08-29：使用者要求追蹤任務與正本具備相同點擊、拖曳與子任務行為，並追問是否真正共用元件。審查確認現行 `TrackingReferenceItem` 仍複製 list／card／checklist內容、直接處理details與使用獨立subtree renderer；將此需求列為 `Intentional interaction-contract replacement`。規格新增 shared surface/controller/tree 架構、permission-preserving action parity、AC-095-019～024與stop conditions；既有B01～B16／QC 只保留為historical baseline，新互動parity尚未實作或驗證。
- 2026-08-29：完成 interaction parity replacement：primary／tracking 共同使用 `TaskSurfaceFrame`、`useTaskPlacementController`、`TaskPlacementTree` 與既有 List／Kanban／Checklist renderer，移除 `TrackingReferenceItem`。S07～S10 4/4、B17～B24 8/8、QC-IP01～08 8/8、TypeScript、targeted ESLint 0 error、`build:test`、cross-mode 12/12 與 backup 4/4 均 PASS；B20 含 390／320 short-tap／scroll negative 與 long-press commit，B21 含三種 surface computed-style，B24 含 capability revoke、stale revision 與 provider fault。Supabase TEST、remote migration、deploy、release仍未執行。
