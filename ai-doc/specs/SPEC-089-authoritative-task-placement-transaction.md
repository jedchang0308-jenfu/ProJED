# SPEC-089 全域工作台權威任務搬移交易

建立：2026-08-25
重啟修訂：2026-08-26
狀態：Authoritative／Rework 1 RD Implemented／Local Verification PASS／TEST／Production Release Gates Pending／P0 Stop-Ship
關聯：DEV-089、DEV-086、DEV-039、CAPA-20260825-01

## 1. 重啟原因與事實基線

正式環境實際執行「未歸位 → 看板」時，畫面顯示 `歸位失敗，任務已保留在未歸位。`；瀏覽器錯誤為：

```text
[taskDrag] Failed to place task subtree at the requested position.
Error: Task placement transaction must cross the unplaced ownership boundary.
```

唯讀查核同時證明：

- 來源任務仍存在帳號級 `task_workbench_unplaced_items`，沒有資料遺失。
- 目的看板為 canonical 看板，不是暫存 ID 或手機專用投影。
- operation ledger 沒有本次 begin 紀錄，代表錯誤發生在 RPC 前的 client validation。
- 桌機與手機共用相同 commit path；本缺陷是資料 scope 漏洩，不是 touch sensor 或 RWD 特例。

直接根因是 `buildTaskParentIndex` 只以 `parentId || 'root'` 分組，`normalizeTaskMoveUpdates` 因而把不同 workspace／board 的 root tasks 視為同一 sibling set。未歸位 root 歸位到既有看板任務旁時，送入交易的更新集合混入其他看板 root siblings；交易邊界檢查看到 before／after 都是混合 ownership，遂在 RPC 前拒絕。

先前 Local／TEST／Level 3 PASS 僅為歷史基線，不能覆蓋本次 production 反例。DEV-089、QA、QC 與 CAPA 均依此重啟。

## 2. 目標與非目標

### 2.1 目標

建立單一、scope-safe、server-authoritative 的完整子樹搬移命令，讓桌機與手機雙向搬移都只描述「來源、目的與定位意圖」，由資料庫在同一交易內決定 exact subtree、目的 sibling order、activity 與 idempotent result。

成功後每個 task ID 必須只存在一個 canonical ownership surface；失敗時完整來源子樹原位保留。

### 2.2 非目標

- 不改雙向拖曳、500ms 手機長按、定位線、階層段落、已歸位唯讀或既有視覺語言。
- 不讓 client 以搬移 RPC 修改 title、notes、assignment、tags、dates 或其他內容欄位。
- 不以放寬 ownership boundary、手機專用 fallback、兩段 create/delete 或僅加 `boardId` filter 作為完成方案。
- 本文件不授權 production migration、deploy、資料修補或 release。

## 3. Spec Impact

`Compatible corrective amendment` to SPEC-089，並對其既有 generic placement payload 做 `Intentional replacement`：

- 保留 `await-before-local-commit`、exactly-one-source、complete-subtree、idempotency、pending-source-stable、success-effects-only 與 security invariants。
- 跨 ownership 搬移不再呼叫 generic `BatchNodeUpdates`，也不再由 client 傳目的 sibling nodes 或完整 node body。
- 既有 `move_task_workbench_subtree(..., p_nodes jsonb)` 視為 v1；新 client 只能呼叫 v2 command RPC。v1 不得被新 UI path fallback 使用。
- 同看板的一般排序仍可沿用既有流程，但 sibling index 必須以 ownership＋parent 建 scope；舊的 parent-only index 不得再用於 placement／reorder。
- 不另開 DEV-090；本修訂是 DEV-089 同一 P0 ownership contract 的 Rework 1。

Spec governance：無 `Unresolved conflict`，P0/P1 readiness gap 為 0。此決策是既有 SPEC-089 ownership transaction 的 corrective amendment，影響與替代方案已完整收斂於本權威 SPEC，因此不另立 ADR；若未來要讓相同 command protocol 擴及一般同看板 reorder，再另立跨領域 ADR。

## 4. 權威領域模型

```ts
type TaskOwnershipRef =
  | {
      kind: 'board';
      workspaceId: string;
      boardId: string;
    }
  | {
      kind: 'account_unplaced';
    };

type PlacementScope = {
  ownership: TaskOwnershipRef;
  parentId: string | null;
};

type MoveTaskSubtreeCommand = {
  commandVersion: 2;
  operationId: string;
  rootTaskId: string;
  expectedSubtreeIds: string[];
  source: TaskOwnershipRef;
  destination: PlacementScope & {
    anchorTaskId: string | null;
    position: 'before' | 'after' | 'append';
  };
  clientPlatform: 'desktop' | 'mobile';
};

type MoveTaskSubtreeResult = {
  operationId: string;
  status: 'committed';
  direction: 'to_board' | 'to_unplaced';
  movedTaskIds: string[];
  canonicalNodes: TaskPlacementCanonicalNode[];
  affectedScopes: PlacementScope[];
};
```

`account_unplaced` 是帳號級全域 ownership；server 以 `auth.uid()` 推導 owner，client 不得傳 account ID。現有 `__task_workbench_unplaced__` 只保留為前端相容 sentinel，不是實體看板，也不能讓未歸位 sibling order 被 task 的 provenance `workspaceId` 切開。未歸位 task 可直接歸位到另一 workspace 的合法看板；server 成功時把完整 subtree 的 workspace／board ownership 收斂到目的看板。

## 5. 共用操作流程

```text
desktop pointer / mobile long-press
  → shared DropIntent
  → buildMoveTaskSubtreeCommand
  → TaskPlacementPort.execute(command)
  → move_task_workbench_subtree_v2
  → canonical result
  → local state / undo / activity UI 收斂
```

1. 手機與桌機只負責把 gesture 轉成同一個 `DropIntent`。
2. `buildMoveTaskSubtreeCommand` 只讀 dragged root、exact subtree IDs、source scope 與目的 anchor，不產生目的 sibling patches。
3. pending 期間來源子樹留在原位、整棵不可再次拖曳；realtime merge 以 pending source 為準。
4. server 成功後，client 以 `canonicalNodes` 收斂 local state，才建立 undo、成功 activity view 與 ancestor roll-up。
5. server rejection／network confirmed failure 時清除 pending 並保留來源；outcome unknown 時禁止新 operation ID，要求 refresh/readback。

### 5.1 DropIntent 對 command 的唯一映射

| UI 意圖 | `destination.parentId` | `anchorTaskId` | `position` |
|---|---|---|---|
| 放到同層目標前 | 目標的 parent | 目標 ID | `before` |
| 放到同層目標後 | 目標的 parent | 目標 ID | `after` |
| 放入目標成為子任務 | 目標 ID | `null` | `append` |
| 放入空看板／root lane | `null` | `null` | `append` |
| 放入未歸位 | `null` | `null` | `append` |

`before`／`after` 必須有 anchor；`append` 必須沒有 anchor。anchor 必須存在於目的 `PlacementScope`，否則整筆拒絕。

## 6. Server transaction contract

新增 forward-only migration：

`supabase/migrations/20260826083940_dev_089_scope_safe_task_placement_command.sql`

不得修改已套用的 `20260825093621_dev_089_transactional_task_workbench_placement.sql`。

新增 public RPC：

```sql
public.move_task_workbench_subtree_v2(
  p_operation_id text,
  p_root_task_id text,
  p_expected_subtree_ids jsonb,
  p_source_kind text,
  p_source_workspace_id text,
  p_source_board_id text,
  p_target_kind text,
  p_target_workspace_id text,
  p_target_board_id text,
  p_target_parent_task_id text,
  p_anchor_task_id text,
  p_position text,
  p_client_platform text
) returns jsonb
```

`kind='board'` 時對應 workspace／board IDs 必須皆為 non-null；`kind='account_unplaced'` 時兩者必須為 null，帳號由 `auth.uid()` 決定。source 與 target kind 必須一邊是 board、一邊是 account_unplaced；不接受同 ownership reorder 偽裝成跨 boundary RPC。

同一 PostgreSQL transaction 依序完成：

1. 以 `(owner_id, operation_id)` 鎖定／建立 ledger，驗證 immutable v2 payload。
2. 驗證 `auth.uid()`、source／destination `move_task` capability 與跨 ownership boundary。
3. 從 canonical source 以 recursive query 鎖定 subtree，驗證 `expectedSubtreeIds` 完全相等，並由 root canonical row 推導 source `PlacementScope`。
4. 以穩定排序鎖定 source 與 destination `PlacementScope` 的所有直接 siblings，避免 cross-scope concurrent move deadlock；anchor 必須屬於 destination 集合。
5. 由 server 計算移除與插入 index，將 source／destination direct siblings dense reindex 為 `0..n`；只有搬移 root 改變 parent／ownership，descendants 保留相對 hierarchy/order。
6. 寫入目的、刪除來源並驗證 exact row count；同 transaction 寫 activity 與 committed canonical result。
7. 任一步失敗全部 rollback；failure 不可產生目的副本、成功 activity 或 committed ledger。

### 6.1 Ledger schema amendment

在既有 operation table forward-add：`command_version`、`source_kind`、`target_kind`、`target_parent_task_id`、`anchor_task_id`、`position`。v2 immutable comparison 必須包含新欄位及 source／target／root／expected IDs；歷史 v1 row 保持可讀，不回填虛構 kind／anchor。

### 6.2 Ordering invariant

- board sibling identity 由 `board ownership(workspaceId, boardId) + parentId` 界定；全域未歸位 sibling identity 由 `auth.uid() + account_unplaced + parentId` 界定，不能只用 `parentId`，也不能以 provenance workspace 切割未歸位 lane。
- transaction 只可修改 source subtree 及 source／destination direct siblings；其他 scope 的 node content、parent、board、workspace、order 必須 bit-for-bit 不變。
- concurrent placement 以 canonical scope key 排序後取得 source／destination sibling locks；相同 operation replay 回同一 canonical result，不重排第二次。

### 6.3 Security／failure invariant

- public RPC 為 `SECURITY INVOKER`；private implementation 為 `SECURITY DEFINER SET search_path=''`，精確 revoke/grant。
- client 不傳 task content；server 從 locked canonical source 重建內容。
- record link、quick memo promotion link、dependency、目的缺 tag／member、permission不足、partial subtree、identity collision、錯 scope anchor 或 delete count 不符時 fail-safe rollback。
- response ambiguity 只以同 operation ID retry 一次，再透過 ledger readback判定 committed／failed／unknown。

## 7. Repo／模組影響與 RD work packages

| WP | 檔案／模組 | 必要變更 | 完成條件 |
|---|---|---|---|
| WP1 Scope model | `src/components/Wbs/taskDrag/taskDropIntent.ts`、`taskDragCommit.ts` | 導入 discriminated `TaskOwnershipRef`／`PlacementScope`；移除 parent-only root bucket；未歸位使用 account-global scope | 隨機多 workspace／board fixture 無跨 scope mutation，未歸位仍為單一全域 lane |
| WP2 Shared command | 新增 `src/features/taskWorkbench/taskPlacementCommand.ts`；調整 `placementTransaction.ts` | 實作 intent→command 唯一 adapter、runtime validation 與 `TaskPlacementPort` | mobile／desktop 共用同 function；cross-boundary 不產生 `BatchNodeUpdates` |
| WP3 Store owner | `src/store/useWbsStore.ts` | cross-boundary durable action 只送 command，成功才套 canonical result；pending／undo／roll-up 遵循 invariant | RPC 前 local ownership 不變；failure source 原位 |
| WP4 Provider | `src/services/supabase/taskWorkbenchUnplacedService.ts`、`database.types.ts` | 新增 v2 RPC adapter與 types；v1 不得 fallback | request 無 node body／sibling patches；immutable retry |
| WP5 Database | 新 migration `20260826083940...sql` | ledger amendment、v2 RPC、source/destination locks、exact scope reorder、security | DB transaction／RLS／replay／concurrency matrix PASS |
| WP6 Verification | `scripts/verify-dev-089-*`、`package.json`、QA/QC evidence | property、static、DB、browser、Level 3/4 雙向 gates | 任何一方向缺證據皆不得 release |

### 7.1 RD implementation evidence（2026-08-26）

| 範圍 | 結果 | 證據／邊界 |
|---|---|---|
| WP1-WP4 | PASS | `PlacementScope` index、shared v2 command、store canonical owner、Supabase adapter/types 已實作；TypeScript、ESLint 0 error。 |
| WP5 local SQL | PASS | migration 在可丟棄 PostgreSQL 18 instance 完整編譯；雙向、nested source subtree、dense order、same-operation replay、immutable mismatch、exactly-one-source與 canonical postcondition 均通過。這不是 Supabase TEST migration/RLS evidence。 |
| WP6 property/source | PASS | 1,000 組 seeded multi-workspace／board fixtures 雙向通過；非 affected scope deep equal；帳號級未歸位未按 provenance workspace 分裂。 |
| WP6 rendered UI | PASS（Local） | desktop、390×844、320×844 真實拖曳通過；390×844 完成看板→未歸位→跨工作區另一看板，failure injection 保留完整來源。 |
| Release evidence | NOT RUN | Supabase TEST backup/migration、DB concurrency/RLS、Level 3、production migration/deploy、Level 4 仍需獨立授權與 release gate。 |

## 8. UI Entry Contract

| 項目 | 契約 |
|---|---|
| Actor | 已登入且對來源與目的具有 `move_task` 的成員 |
| Start state | 全域工作台已開啟；未歸位列可拖、已歸位列唯讀；目的看板已載入 |
| Desktop entry | pointer drag 未歸位任務或看板 task root |
| Mobile entry | 500ms long-press 同一 drag owner；不另寫 mobile commit path |
| Normal | 定位線對應 before／after／append；成功後 task 只在目的 canonical surface |
| Pending | 來源留在原位；完整 subtree disabled；共用 11px indicator；禁止重複 drop |
| Failure | `搬移失敗，任務已保留在原位置。` 或 `歸位失敗，任務已保留在未歸位。` |
| Unknown | `搬移結果尚未確認，請重新整理後再操作。`；不產生新 operation |
| Permission denied | 原位保留、無 activity／undo；顯示可理解的權限錯誤 |
| Narrow viewport | 390×844 無水平 overflow；定位線、toast、來源 task 都可見 |

## 9. Acceptance Criteria

- AC-089-RW-001：桌機與手機、兩個方向都呼叫同一 command builder、store durable owner 與 v2 RPC。
- AC-089-RW-002：cross-boundary request 不含目的 sibling nodes、node content 或 generic `BatchNodeUpdates`。
- AC-089-RW-003：任何 ordering collection 都以完整 `PlacementScope` 分組；多 workspace／board root 不互相 reindex，帳號級未歸位不因 provenance workspace 被切割。
- AC-089-RW-004：server 只修改 exact source subtree及 source／destination direct siblings；其他 scope bit-for-bit 不變。
- AC-089-RW-005：空 lane、before、after、append child、跨 workspace、跨看板皆回 canonical dense order。
- AC-089-RW-006：partial subtree、wrong-scope anchor、permission、linked/dependency、collision、delete mismatch 全部 rollback。
- AC-089-RW-007：同 operation retry／concurrent placements 不重複 mutation，不產生 duplicate order 或 lost task。
- AC-089-RW-008：pending／failure／unknown UI 遵守來源穩定與 success-effects-only。
- AC-089-RW-009：桌機與 390×844 真實 UI 皆完成「看板→未歸位→同看板」及「未歸位→另一看板」，刷新後 readback 正確。
- AC-089-RW-010：Level 3 與 Level 4 必須以同 release candidate 驗證雙向，不可只以看板→未歸位宣告通過。
- AC-089-RW-011：production migration history 與 repo migration 一致；任何 missing／unexpected version 在 deployment前 stop-ship。
- AC-089-RW-012：TypeScript、build、targeted lint、diff、source contract、property、DB01-DB04、visible-error sweep 全部 PASS。

## 10. Verification Integrity Matrix

| Claim | 真實入口 | 允許操作 | 必要 readback | 禁止 shortcut |
|---|---|---|---|---|
| 手機可歸位 | 390×844 rendered UI | long-press＋pointer move＋drop | DOM、canonical source/target、ledger、reload | direct store/API mutation、synthetic success state |
| 桌機可雙向 | rendered board＋workbench | pointer drag | DOM、canonical rows、ledger、reload | 只呼叫 command function |
| scope 隔離 | property＋DB fixture | command/RPC | 所有非 affected scope before/after deep equality | 只驗 dragged root |
| 原子性 | Supabase TEST transaction | failure injection／constraint rejection | source、target、activity、ledger | localStorage fixture 替代 DB |
| idempotency／併發 | TEST same operation＋two operations | replay／parallel request | canonical result、dense order、ledger count | sequential-only happy path |
| production ready | production Level 4 | 同 artifact 雙向 UI | migration history、ledger、canonical reload、console/network | preview單向 smoke 替代 production |

## 11. QA／QC stop conditions

下列任一成立，RD 不得交 QA、QA/QC 不得判定 PASS、release gate 不得前進：

- cross-boundary path 仍呼叫 v1 RPC、generic `BatchNodeUpdates` 或傳 destination sibling patches。
- placement/reorder 還存在只以 `parentId` 分組的 index。
- 非 affected `PlacementScope` 有任何 order／parent／ownership mutation。
- UI 只驗一個方向、只驗桌機或只驗 test-mode synthetic state。
- operation ledger、canonical source/target、reload 任一缺少 readback。
- migration history 有 repo/remote mismatch，或 frontend 先於 v2 RPC migration 上線。
- console page error、unhandled rejection、兩邊皆有、兩邊皆無、partial subtree 或假成功任一出現。

## 12. Release／rollback boundary

本修訂已完成 local implementation、source/property、可丟棄 PostgreSQL transaction harness與 rendered UI evidence，但不是 release approval。下一階段仍必須依序執行 Supabase TEST backup/migration → DB01-DB04 → Level 3 雙向 → production backup/migration → frontend deploy → Level 4 雙向。

production migration history 必須先與 repo reconciled；本項不是本次 client root cause，但屬獨立 stop-ship hygiene。rollback 採 frontend 回退到前一相容 artifact；v2 function／nullable ledger欄位可保留，舊 client 不會呼叫。禁止回退到會 optimistic 假成功的舊跨 ownership path。
