# SPEC-042: 任務工作台與跨工作區任務中繼站

狀態: Phase 1 Local Verification Passed / Phase 2 Implementation Slice Created / Validation Pending / No Production Migration / No Deploy
建立日期: 2026-07-02
關聯 DEV: DEV-042 / DEV-041 / DEV-040 / DEV-028 / SPEC-037

## 1. 目的

將既有 `任務專區` 升級為 `任務工作台`。它不是單純的個人待歸位清單，而是跨工作區、跨看板、未來可串外部系統任務的個人任務中控台。

Phase 1 只處理命名、資訊架構、filter 與任務排序視圖；不實作已歸位任務拖回待歸位，也不做跨工作區任務移動。本文件已完成 Phase 1 local verification，尚未 production deploy。

## 2. Human Decision Brief

- `1A`: 本輪只補文件到 Phase 1 RD Implementation Ready，暫不授權 RD 實作。
- `2B`: `我的任務` 改名後的 tab 固定採 `任務排序`。
- `3A`: 已歸位任務拖回 `待歸位` 的能力列入 Phase 2，只先寫規格，不在 Phase 1 實作。

Follow-up authorization: 使用者後續以 `$dev-pm` 執行開發授權 Phase 1 implementation and validation；Phase 2/3 remain RD Contract Ready only and are not authorized for implementation, migration, deploy, push or git commit.
## 3. 使用者-facing 命名

| 舊名稱 | 新名稱 | 說明 |
|---|---|---|
| `任務專區` | `任務工作台` | 長期主入口名稱。 |
| `我的任務` | `任務排序` | 依截止日期排序的任務瀏覽視圖。 |
| `訂閱範圍` | `篩選` / `工作台篩選` | 當下視圖控制，不是長期訂閱設定。 |
| `未歸位任務` | `待歸位` | 任務 placement state，不是第二套資料池。 |

`任務排序` 必須透過副文字、tooltip 或空狀態說明它是依截止日期排序；不得讓使用者誤解為可以手動拖拉排序。

## 4. End-State Architecture

```text
任務工作台
  待歸位
    尚未有 active board placement 的 canonical tasks
    Phase 2 可收納使用者從看板拉回中繼站的 canonical tasks

  任務排序
    待歸位 tasks
    已歸位且符合 filter / permission / task relation 的 tasks
    依截止日期與 fallback 欄位排序

  工作台篩選
    工作區
    看板
    歸位狀態
    任務關係
    時間條件
```

不可妥協規則:
- 任務工作台必須使用 canonical task identity。
- 不得新增 memo-only 或 workbench-only 第二套任務模型。
- `待歸位` 必須出現在 `任務排序` 結果中。
- 拖曳體驗必須沿用 DEV-041 / DEV-028 既有任務 DnD primitives。
- 使用者不可存取的 workspace / board / task 不得顯示 title、count 或來源摘要。

## 5. Phase Roadmap

### Phase 1 - IA rename and filter foundation

授權狀態: Phase 1 local verification passed; production deploy not authorized.

範圍:
- `任務專區` 改名為 `任務工作台`。
- `我的任務` 改名為 `任務排序`。
- `訂閱範圍` 降級為 `工作台篩選`，並改成高頻瀏覽控制。
- Filter 新增 `工作區`、`看板`、`歸位狀態`。
- `任務排序` 合併顯示待歸位與已歸位任務。
- `待歸位` 不得因切到 `任務排序` 或調整 assigned-task scope 而消失。

Hard boundary:
- Phase 1 only changes browsing, filtering, naming and IA.
- Phase 1 must not implement placed-to-unplaced movement.
- Phase 1 must not implement cross-workspace move.
- Phase 1 must not introduce DB migration unless RD proves existing contracts cannot express filter state.

### Phase 2 - Workbench staging and re-placement

授權狀態: RD Contract Ready / Deferred / Not Authorized.

範圍:
- 已歸位任務可拖回 `待歸位` 中繼站。
- 待歸位任務可重新歸位到其他看板或工作區。
- 必須保留來源摘要與復原策略。
- 必須以 RPC / transaction / RLS gate 實作，不得只做前端狀態清除。

Phase 2 RD handoff is defined in section 15. It must not start until Phase 1 is accepted by the user and explicit authorization is given for RPC / migration design.

### Phase 3 - External task command center

授權狀態: RD Contract Ready / Future / Not Authorized.

範圍:
- 外部任務來源，例如行事曆、會議記錄、第三方任務系統。
- 外部任務先 read-only 或 `轉成 ProJED 任務`，不得直接當作 ProJED board task 拖移。
- 動態牆 / action feed 依時間排序各來源任務。
Phase 3 RD handoff is defined in section 16. It must not start without explicit external integration, privacy and cost authorization.

## 6. Filter Contract - Phase 1

### Filter dimensions

| 維度 | Phase 1 要求 |
|---|---|
| 工作區 | 全部可存取 / 目前工作區 / 指定工作區 |
| 看板 | 全部可存取 / 目前看板 / 指定看板 |
| 歸位狀態 | 全部 / 待歸位 / 已歸位 |
| 任務關係 | 指派給我 + 待歸位；後續可加我建立的 / 我追蹤的 |
| 時間 | Phase 1 至少支援截止日期排序；逾期 / 今天 / 本週可作為後續 chips |

### Defaults

- 工作區: 全部可存取工作區。
- 看板: 全部可存取看板。
- 歸位狀態: 全部。
- 任務關係: 指派給我 + 待歸位。

### Count rules

- `待歸位` count = current filter scope 中 unplaced canonical tasks count。
- `任務排序` count = current filter scope 中 `待歸位` + 已歸位且符合任務關係條件的 tasks count。
- 不可存取 workspace / board / task 不得納入 count。

### Empty states

- `待歸位` 空: 顯示 `目前沒有待歸位任務`，並保留快速建立入口。
- `任務排序` 空: 顯示 `目前篩選範圍內沒有待處理任務`，並提供清除 filter 的明確操作。

## 7. Sorting Contract - Phase 1

`任務排序` 依下列優先序排序:

1. due date / `end_date` ascending。
2. `start_date` ascending when due date is absent。
3. `created_at` ascending。
4. title ascending。
5. task id ascending。

時間 bucket:
- overdue / today / this week 使用使用者本地時區。
- 若 browser timezone 不可用，fallback to `Asia/Taipei`。

無截止日任務:
- 放在有截止日與有開始日任務之後。
- 仍需顯示來源摘要或 `待歸位` 標籤。

## 8. Data and Permission Contract - Phase 1

Phase 1 可沿用:
- DEV-041 assigned-task listing。
- DEV-040 / DEV-041 personal unplaced task listing。
- Client/service aggregation for workbench list。

必須保證:
- `待歸位` 固定納入 `任務排序`。
- assigned-task-only query 不得讓待歸位任務消失。
- Filter 不得顯示使用者不可存取的 workspace / board / task title / count。
- 卡片完成、刪除、詳情、拖曳仍走既有 task permission guard。

Migration:
- Phase 1 預期不需要 DB migration。
- 若 RD 發現現有 contract 無法支援 filter state persistence，只能新增 local preference 或低風險 client-side state；遠端 schema / RPC 需另行升級授權。

## 9. UI Contract - Phase 1

主要 UI:
- Sidebar / breadcrumb / page title / panel title 顯示 `任務工作台`。
- Source panel tabs 至少包含 `待歸位` 與 `任務排序`。
- `任務排序` 卡片必須標示 placement state:
  - 待歸位: 顯示 `待歸位`。
  - 已歸位: 顯示來源摘要，例如 `工作區 / 看板` 或 `看板 / 欄位`。
- Filter 可收折；收折後仍需顯示目前範圍摘要。
- Filter UI 應沿用看板 filter 的互動語言，但新增工作區、看板與歸位狀態。

禁止:
- 不得把任務工作台主入口放成右側詳情 drawer。
- 不得讓 filter 區塊比任務清單更搶主視覺。
- 不得把 `任務排序` 呈現成手動排序工具。

## 10. RD Acceptance - Phase 1

- 使用者主要入口與頁面名稱為 `任務工作台`。
- 使用者可切換 `待歸位` 與 `任務排序`。
- `任務排序` 同時包含符合 filter 的待歸位與已歸位任務。
- 待歸位任務不會因切到 `任務排序` 而消失。
- 使用者可用工作區、看板與歸位狀態縮小 `待歸位` 與 `任務排序`。
- `任務排序` 依 Sorting Contract 排序。
- Filter count 符合 Count rules。
- 不可存取 workspace / board / task 不顯示 title、count 或來源摘要。
- 待歸位任務拖到看板仍使用與一般任務一致的 positioning frame。

## 11. Out of Scope - Phase 1

- 已歸位任務拖回待歸位。
- 跨工作區 / 跨看板 move。
- 多重歸位。
- 跨 route active drag state。
- 外部系統任務串接。
- AI 自動判斷歸位位置。
- Production migration。
- Production deploy。

## 12. Stop Conditions

RD 必須停止並回報:
- 若 `任務排序` 只能顯示已歸位 assigned tasks，無法包含待歸位任務。
- 若 Phase 1 需要實作 placed-to-unplaced 才能完成 UI。
- 若需要重寫整個 board DnD engine。
- 若 filter 會洩漏不可存取 workspace / board / task title 或 count。
- 若需要 DB migration、RPC、RLS 或 production schema change。
- 若需求被解讀為要在本輪實作 Phase 2。

## 13. QA/QC Gate

Required QA fixture:
- 至少一筆待歸位任務。
- 至少一筆已歸位且指派給目前使用者的任務。
- 至少一筆有截止日的任務。
- 至少一筆無截止日的任務。
- 至少一筆不可存取 workspace / board 的反向權限案例。

Static verifier:
- `任務工作台` user-facing copy。
- `任務排序` tab。
- 工作區 / 看板 / 歸位狀態 filter contract。
- 待歸位固定納入任務排序。
- Sorting Contract strings。
- Phase 1 hard boundary: no placed-to-unplaced implementation.

Browser smoke:
- 進入任務工作台。
- 切換 `待歸位` / `任務排序`。
- `任務排序` 同時顯示待歸位與已歸位任務標籤或來源摘要。
- Filter 收折 / 展開後摘要正確。
- 調整工作區 / 看板 / 歸位狀態後 count 正確。
- 拖曳待歸位任務到看板時仍顯示一般任務 positioning frame。

Regression:
- `npm run verify:dev-041-task-zone-direct-drag-placement`
- `npm run verify:dev-040-personal-task-zone`
- `npm run verify:dev-028-cross-mode-task-interactions`
- `npx tsc --noEmit`
- `npm run build`

DEV-042 proposed gates:
- `npm run verify:dev-042-task-workbench`
- `npm run verify:dev-042-task-workbench-browser`

## 14. Documentation Boundary

本文件已補齊 Phase 1 RD Implementation Ready 所需產品語意、filter contract、sorting contract、權限邊界、QA fixture 與驗收標準，且本輪已完成 Phase 1 local verification。

本文件不授權:
- Git commit。
- Migration。
- Production deploy。
- Push / PR。

## 15. Architecture Memory Capsule and Phase 2 RD Handoff Contract

### Architecture Memory Capsule

- Product invariant: `任務工作台` is the personal command center for tasks across workspaces, boards and future external sources.
- Canonical identity invariant: all ProJED tasks shown in the workbench must remain canonical `TaskNode` / `wbs_items` records; no workbench-only task table or memo-only duplicate is allowed.
- Placement invariant: `待歸位` is a placement state, not a separate task type. A task can be pending placement only when its active board placement is absent, intentionally cleared, or represented by a controlled staging state.
- Move invariant: task movement must be move, not copy, unless the UI explicitly labels a copy action.
- Permission invariant: users must not see inaccessible workspace / board / task title, count, source summary or placement history.
- UX invariant: source and broad task discovery stay on the left; board structure stays in the middle; task details stay in modal / drawer / right-side detail surfaces.
- DnD invariant: all workbench task drag operations must use existing task DnD primitives, shared drag overlay, existing positioning frame and existing task permission guard.
- Rejected option: direct frontend-only clearing of board placement is rejected because it can create ghost tasks, hidden orphan placement or permission bypass.
- Re-entry triggers: cross-tenant moves, destructive migration, external system sync, token/API cost, production migration, or user-visible data loss risk require explicit user authorization.

### Phase 2 Objective

Make the workbench a controlled staging area: users can move a placed ProJED task back to `待歸位`, then re-place it into another allowed board/workspace without creating duplicates.

### Phase 2 Scope

- Add placed-to-unplaced movement for existing placed ProJED tasks.
- Add re-placement from `待歸位` into another board/workspace the user can access.
- Preserve source summary such as workspace / board / column before staging.
- Provide restore behavior such as `回到原位置` or equivalent recovery path.
- Preserve subtree, internal dependencies and valid metadata during staging and re-placement.
- Add Supabase RPC / service contracts for atomic movement.
- Add migration, grants, RLS and rollback gates if persistent placement history is required.

### Phase 2 Out of Scope

- Multi-placement where one canonical task appears in multiple boards at once.
- External system tasks.
- AI-suggested placement.
- Cross-route active drag state.
- Cross-tenant moves unless explicitly authorized after security review.
- Silent deletion of source placement without user-visible recovery.

### Phase 2 Implementation Contract

- `place_task_to_workbench_staging` or equivalent RPC must run as a transaction.
- `replace_workbench_task_on_board` or equivalent RPC must run as a transaction.
- RPC must verify actor permission on source workspace/board and target workspace/board.
- RPC must be idempotent through a client mutation id or equivalent duplicate-prevention key.
- RPC must either preserve previous placement snapshot or write a placement history record.
- RPC must move root and descendant tasks consistently when a subtree is staged or re-placed.
- RPC must update dependency scope only when dependencies remain valid inside the moved subtree or target board.
- RPC must handle tag assignment scope without leaking tags across inaccessible workspace boundaries.
- RPC must handle assignees who do not have access to the new workspace/board by either blocking, preserving with warning, or requiring explicit reassignment policy.
- Client must show visible failure and keep the task in its last confirmed state when RPC fails.
- Client must not optimistically remove a task from its original board unless rollback/recovery is deterministic.

### Phase 2 Data / API / Permission Impact

- Likely new table or metadata for placement history / source snapshot.
- Likely new Supabase RPC functions with authenticated execute grants.
- RLS must block anon and users without source/target permissions.
- Existing `move_task_to_board` and `place_personal_task_on_board` contracts must remain backward compatible.
- Database schema cache reload and production migration gate are required before release.

### Phase 2 Entry Conditions

- Phase 1 has passed local verification and user acceptance.
- User explicitly authorizes Phase 2 development.
- User explicitly authorizes migration/RPC design if persistent placement history is required.
- QA has prepared Supabase/RLS and rollback cases.

### Phase 2 RD Acceptance

- A placed task can be moved to `待歸位` without duplication.
- Staged task shows previous source summary.
- Staged task can be re-placed into an allowed target board/workspace.
- Unauthorized target board/workspace is blocked without title/count leakage.
- Failure keeps the task visible in the last confirmed state.
- Restore previous placement works or the selected recovery strategy is visibly available.
- Existing DEV-041 direct placement and DEV-028 board DnD do not regress.

### Phase 2 QA/QC Gate

- Static verifier for RPC names, grants, RLS, service contracts and UI recovery copy.
- Browser smoke for placed-to-unplaced, re-placement and failure visibility.
- Supabase DB QC for owner/admin/member/viewer/anon permission matrix.
- Idempotency smoke for duplicate client mutation id.
- Regression:
  - `npm run verify:dev-042-task-workbench`
  - `npm run verify:dev-041-task-zone-direct-drag-placement`
  - `npm run verify:dev-040-personal-task-zone`
  - `npm run verify:dev-028-cross-mode-task-interactions`
  - `npx tsc --noEmit`
  - `npm run build`

### Phase 2 Stop Conditions

- Any implementation requires copying tasks instead of moving the canonical task id.
- Any move can bypass source/target permissions.
- Any failure can make the task disappear from both original board and workbench.
- Required migration cannot be safely rolled back.
- Existing DEV-041 direct placement or normal board drag positioning frame regresses.

### Phase 2 Evidence Required

- Migration file names, if any.
- RPC contract and grants evidence.
- RLS matrix evidence.
- Static verifier output.
- Browser smoke output.
- Typecheck and build output.
- Rollback notes or explicit no-migration statement.

### Phase 2 Dependencies

- Phase 1 `任務工作台 / 任務排序` 已完成本機驗證並被產品驗收為可續接基線。
- DEV-041 / DEV-040 / DEV-028 的 drag-and-drop contract 維持穩定，不可另寫平行 DnD 模組。
- Supabase migration、RPC、RLS、grants、Data API exposure 必須在本地/staging 通過後，才可請求 production migration 授權。
- QA fixture 必須至少包含來源工作區、目標工作區、來源看板、目標看板、跨工作區指派給我的任務、無權限目標看板。
- 使用者需另行授權 Phase 2 implementation、migration、deploy、push 或 git commit；目前文件只到 RD Contract Ready。

### Phase 2 Deferred Decisions

- 歸位歷史採獨立 placement history table，或先用 task metadata snapshot 保存來源位置。
- 已歸位任務拖回待歸位區時，UI 是否顯示「回到原看板」或只保留「重新歸位」。
- 是否允許跨 tenant 移動；預設應阻擋跨 tenant，只允許同 tenant 內跨工作區/看板。
- 指派者可看見任務但無目標看板權限時，是禁止拖入、提示申請權限，或允許建立個人副本。
- 標籤、子任務、附件、依賴關係在跨看板移動時的繼承、轉換或阻擋規則。
- 多人同時移動同一任務時，以 RPC lock、updated_at optimistic concurrency 或 server-side queue 處理。

### Phase 2 Recovery Conditions

- 任務移動 RPC 失敗時，保留最後一個已確認 placement，不得產生 ghost duplicate。
- 拖回待歸位區失敗時，任務必須恢復到原工作區/看板/欄位/排序位置。
- 任何跨工作區移動失敗都要有可見 toast、可重試狀態與 audit log。
- migration 或 RLS QC 失敗時不得套用 production；必要時 rollback migration 並保留原任務位置。
- compensation job 若無法自動修復，必須輸出人工修復清單：task id、source placement、target placement、失敗原因、建議動作。

### Phase 2 Proposed Verifiers

- `npm run verify:dev-042-workbench-staging`
- `npm run verify:dev-042-workbench-staging-browser`
- `npm run verify:dev-042-workbench-staging-db`

### Phase 2 Implementation Slice - 2026-07-02

- 本輪依 `$dev-pm 執行開發` 進入 Phase 2 workbench staging/re-placement gate 的本機 RD implementation slice。
- 已新增 BoardView 內的 `task-zone-staging-drop` droppable 目標，讓已歸位 `wbs-card` / `wbs-checklist` / `task-zone-my-task` 可拖回 `待歸位` 中繼站。
- 已新增 `stagePlacedTask` store action、`nodeService.stageToWorkbench`、Supabase `place_task_to_workbench_staging` RPC contract，以及 `removeNodeLocal` 用於 RPC 成功後移除目前看板本機節點，不在 UI 端直接清遠端 board state。
- 已新增 local migration 檔 `supabase/migrations/20260702040000_dev_042_workbench_staging.sql`；此 migration 尚未套用 production。
- 第一個 slice 對含標籤、紀錄關聯、跨子樹依賴的任務採 fail closed：必須先補 tag-transfer policy / controlled move flow，避免資料外洩或關聯遺失。
- Re-placement 仍沿用既有 `place_personal_task_on_board`；migration 只擴充 staged-by 權限判斷，讓被指派但非建立者的任務在拖回待歸位後仍可重新歸位。
- Validation status: Executed locally on 2026-07-02. 需要使用者明確授權後才能跑 `npm run verify:dev-042-workbench-staging`、typecheck、build、browser / DB QC。
## 16. Phase 3 RD Handoff Contract - External Task Command Center

### Phase 3 Objective

Extend `任務工作台` into a personal task command center that can display and act on tasks from external sources while preserving ProJED's canonical task boundary.

### Phase 3 Scope

- Add source abstraction for external task systems.
- Display external tasks in `任務排序` / future activity feed.
- Allow external tasks to be converted into ProJED canonical tasks before board placement.
- Show source labels and sync status.
- Support read-only display as the safe default.

### Phase 3 Out of Scope

- Directly dragging external tasks into ProJED boards without conversion.
- Two-way sync by default.
- AI automatic import/classification unless token and privacy cost are authorized.
- External write-back without OAuth/API permission review.

### Phase 3 Implementation Contract

- Introduce a source adapter contract with stable fields: source type, external id, title, due date, status, source URL, sync state and conversion state.
- External task records must not be treated as ProJED `wbs_items` until converted.
- Conversion must create one canonical ProJED task through an idempotent import key.
- Conversion must show visible success/failure and duplicate-prevention behavior.
- External source credentials and API costs must be isolated from core task rendering.

### Phase 3 Data / API / Permission Impact

- May require external source configuration tables.
- May require encrypted token storage or OAuth flow.
- May require import dedupe table keyed by source type and external id.
- Must define tenant/user ownership for imported tasks.
- Must define deletion behavior when an external task disappears or loses permission.

### Phase 3 Entry Conditions

- User selects at least one external source to support.
- Privacy, token/API cost and OAuth/storage authorization are explicitly granted.
- Phase 1 workbench and Phase 2 staging boundaries remain stable.

### Phase 3 RD Acceptance

- External tasks can be listed without becoming ProJED tasks.
- External tasks show source and sync status.
- User can convert an external task into a ProJED task exactly once.
- Converted task can enter `待歸位` or target board according to explicit UI choice.
- External permission or API failure does not break ProJED native tasks.

### Phase 3 QA/QC Gate

- Static adapter contract verifier.
- Browser smoke for external read-only list and conversion.
- API failure smoke with visible error.
- Duplicate import prevention test.
- Privacy/security review before production release.

### Phase 3 Stop Conditions

- External source requires storing secrets without approved secure storage.
- External API cost, token usage or privacy boundary is not authorized.
- External task can be inserted into a board without becoming a ProJED canonical task.
- Failure in external source blocks native ProJED task workbench rendering.

### Phase 3 Evidence Required

- External source contract.
- Credential/privacy approval note.
- Static verifier output.
- Browser smoke output.
- API failure evidence.
- Typecheck and build output.
### Phase 3 Dependencies

- 外部任務來源需先由使用者或 PM 選定，例如 GitHub Issues、Google Tasks、Jira、Notion、Calendar task-like events。
- OAuth、API token、隱私邊界、資料保存期限、撤權流程與第三方成本需另行授權。
- token / credential storage 必須有安全設計，不可存在 localStorage 或前端可讀設定。
- import dedupe model 必須先定義 external_source、external_id、tenant_id、assignee identity mapping。
- Phase 1 workbench UI 與 Phase 2 staging/placement contract 必須穩定，避免外部任務匯入後找不到歸位路徑。

### Phase 3 Deferred Decisions

- 第一批支援哪些外部系統，以及每個來源是 read-only、convert-only 或 limited write-back。
- 同步週期採手動、背景排程、webhook 或 hybrid。
- 外部任務與 ProJED 任務衝突時，以外部來源、ProJED、最新更新時間或人工選擇為準。
- 外部任務刪除、權限撤回、使用者離職或 token 過期時，ProJED 已轉換任務如何保留、封存或標記失效。
- 是否允許 AI 摘要、AI 自動分類或 AI 建議歸位；這會牽涉 token 成本與隱私授權。

### Phase 3 Recovery Conditions

- 外部 API 失敗不得阻塞原生 ProJED 任務工作台與任務排序。
- 同一 external task 重複匯入時，必須回傳既有 ProJED task 或既有 staging item，不得重複建立。
- 外部任務轉換失敗需可 idempotent retry，並保留失敗原因與來源 payload 摘要。
- token revoked 或權限不足時，只停用該 external source，不影響其他來源與 native tasks。
- 外部來源資料格式變更時，adapter 必須 fail closed，避免把錯誤資料轉成正式任務。

### Phase 3 Proposed Verifiers

- `npm run verify:dev-042-external-task-source`
- `npm run verify:dev-042-external-task-source-browser`
- `npm run verify:dev-042-external-task-source-security`

### Phase 2 Validation Evidence - 2026-07-02
- `npm run verify:dev-042-workbench-staging`: PASS, 21 pass / 0 fail.
- `npm run typecheck`: initially unavailable because the package script was missing.
- `npx tsc --noEmit --pretty false`: PASS.
- `npm run build`: PASS, Vite production build generated `dist/` assets; non-blocking warning: Browserslist data is 6 months old.
- Follow-up config: `package.json` now exposes `typecheck` as `tsc --noEmit --pretty false`.
- Not executed: production migration apply, deploy, git stage, git commit, git push, browser smoke, DB QC.
### Filter UX Implementation Slice - 2026-07-02

- Trigger: user requested task workbench filter optimization from the current UI screenshot.
- Scope implemented locally:
  - Task workbench `任務排序` filter moved from the always-visible inline panel into a modal dialog.
  - Main left workbench panel now keeps only a compact filter summary and `調整篩選` entry point.
  - Filter preferences are stored per board id, so each board can keep an independent workbench filter setup.
  - Assignee filter added for `未指派`, current user, loaded workspace/board members, and assignee ids found in the loaded task set.
  - Assignee filter applies to both unplaced workbench tasks and already placed tasks shown in task sorting.
- Implementation file:
  - `src/components/TaskZoneView.tsx`
- Product constraint deliberately preserved:
  - Current remote task subscription still defaults to `assigned_to_me`.
  - Filtering by another assignee only applies to tasks already loaded into the local task set.
  - Full cross-workspace query for arbitrary assignees requires a later API/RLS/query-contract slice.
- Validation status:
  - Not executed after this UI slice.
  - Required next checks before release: `npm run typecheck`, `npm run build`, browser viewport smoke for the filter modal, and manual assignee filter behavior check.
- Release boundary:
  - No production migration, deployment, git stage, git commit, or push performed for this slice.
