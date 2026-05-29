# Ontology/Trello Collaboration Spec

Last updated: 2026-05-28

## 文件目的

本文件定義 ProJED 第一版多人協作、工作指派與權限設定規格。產品體驗參考 Trello 的 Board/Card 協作模型，底層架構採 Supabase-first、Board-level RLS、action log，形成可查詢、可稽核、可供 AI/RAG 使用的 Ontology core。

## 核心決策

- 協作可見性粒度固定為 Board-level。
- `project_members` 是 Board 可見性與寫入權限邊界。
- `tenant_members` 是 Workspace 身分與上層管理權限來源。
- `assigneeId` 與 `collaboratorIds` 只代表責任與參與，不代表可見權限。
- UI guard 用於體驗一致性，真正安全性由 Supabase RLS/RPC 保護。
- 一般協作操作寫 `activity_events`，敏感權限操作寫 `audit_logs`。
- Email invite 是 Board-first action，不在 UI 暴露 Workspace 邀請；接受邀請時才自動補齊最低必要 Workspace member。
- Invite token 只保存 hash，`default_role` 第一版固定為 `member`。
- 第一版不實作 Task-level private permission。

## Object Model

| Object | Supabase table | Frontend type | 語意 |
| --- | --- | --- | --- |
| User/Profile | `profiles` | `CollaborationMemberProfile` | 使用者身分與顯示資料 |
| Workspace/Tenant | `tenants` | `Workspace` | 組織、租戶、最高資料邊界 |
| Workspace Membership | `tenant_members` | `WorkspaceMember` | 使用者在 Workspace 的角色與狀態 |
| Board/Project | `projects` | `Board` | 協作看板與主要權限邊界 |
| Board Membership | `project_members` | `BoardMember` | 使用者在 Board 的角色 |
| Board Invite | `board_invites` | `BoardInvite` | Board-first email invite 與接受狀態 |
| WBS Item/Task | `wbs_items` | `TaskNode` | 任務、群組、里程碑 |
| Dependency | `wbs_dependencies` | `Dependency` | 任務排程依賴 |
| Task Label | `task_tags`、`wbs_item_tags` | `TaskTag`、`TaskNode.tagIds` | Workspace 共用標籤與任務標籤關聯 |
| Activity Event | `activity_events` | `ActivityEvent` | 一般協作操作紀錄 |
| Audit Log | `audit_logs` | `AuditLogEntry` | 敏感權限與刪除操作稽核 |

## Link Model

| Link | Source | Target | 儲存方式 | 權限語意 |
| --- | --- | --- | --- | --- |
| Workspace has members | `tenants` | `profiles` | `tenant_members` | Workspace 身分、上層管理 |
| Board has members | `projects` | `profiles` | `project_members` | Board read/write/manage |
| Board invites email | `projects` | email address | `board_invites` | Pending invite，不授權、不進指派名單 |
| Task belongs to Board | `wbs_items` | `projects` | `wbs_items.project_id` | 受 Board-level RLS 控制 |
| Task assigned to user | `wbs_items` | `profiles` | `wbs_items.assignee_id` | 責任標記，不授權 |
| Task has collaborators | `wbs_items` | `profiles` | `wbs_items.collaborator_ids` | 參與標記，不授權 |
| Task depends on task | `wbs_items` | `wbs_items` | `wbs_dependencies` | 排程關係，受 Board-level RLS 控制 |
| Task has labels | `wbs_items` | `task_tags` | `wbs_item_tags` | 分類關係，受 Workspace/Board 權限控制 |

## Action Model

| Action | Event/Audit | 資料操作 | 權限要求 |
| --- | --- | --- | --- |
| Create task | `activity_events.task_created` | insert `wbs_items` | Board writer |
| Assign task | `activity_events.task_assigned` | update `wbs_items.assignee_id` | Board writer |
| Change collaborators | `activity_events.task_collaborators_changed` | update `wbs_items.collaborator_ids` | Board writer |
| Change status | `activity_events.task_status_changed` | update `wbs_items.status` | Board writer |
| Move task | `activity_events.task_moved` | update `parent_id`、`sort_order`、`kanban_stage_id` | Board writer |
| Change dates | `activity_events.task_dates_changed` | update `start_date`、`end_date`、duration lock | Board writer |
| Create dependency | `activity_events.dependency_created` | upsert `wbs_dependencies` | Board writer |
| Update dependency | `activity_events.dependency_updated` | update `wbs_dependencies` | Board writer |
| Delete dependency | `activity_events.dependency_deleted` | delete `wbs_dependencies` | Board manager |
| Create Board email invite | `audit_logs.invite_created` | insert `board_invites` | Board manager |
| Revoke Board email invite | `audit_logs.invite_revoked` | update `board_invites.status` | Board manager |
| Accept Board email invite | `audit_logs.invite_accepted` | update `board_invites` and upsert `tenant_members`/`project_members` | Auth email must match invite |
| Change/remove Board member | `audit_logs.member_role_changed/member_removed` | upsert/delete `project_members` | Board manager |
| Delete Board | `audit_logs.board_deleted` | delete `projects` | Board manager |
| Delete Workspace | `audit_logs.workspace_deleted` | delete `tenants` | Workspace owner/admin |

## Role Model

| Role | Workspace capability | Board capability |
| --- | --- | --- |
| `owner` | 管理 Workspace、成員、所有 Board、audit | 繼承完整 Board 管理能力 |
| `admin` | 管理 Workspace、成員、Board、audit | 繼承完整 Board 管理能力 |
| `project_manager` | 可建立/管理被授權的專案工作 | 可管理該 Board、成員、任務、dependency |
| `member` | 一般 Workspace 成員 | 可讀、新增、編輯、移動、指派任務 |
| `viewer` | 唯讀參與者 | 可讀不可寫 |

程式基準位於 `src/types/index.ts`：

- `CollaborationRole`
- `PermissionCapability`
- `WORKSPACE_ROLE_CAPABILITIES`
- `BOARD_ROLE_CAPABILITIES`
- `CurrentBoardAccess`

## RLS/RPC Model

資料庫安全模型由兩個 migration 建立：

- `supabase/migrations/20260528092643_board_level_collaboration_rls.sql`
- `supabase/migrations/20260528092711_activity_audit_logging.sql`
- `supabase/migrations/20260528092834_board_invites.sql`

Board-level helper：

- `private.current_user_can_read_project`
- `private.current_user_can_write_project`
- `private.current_user_can_manage_project`

Logging RPC：

- `public.log_activity_event`
- `public.log_audit_event`

Invite RPC：

- `public.accept_board_invite`

RLS 原則：

- `projects`、`project_members`、`wbs_items`、`wbs_dependencies`、`wbs_item_tags` 以 `project_members` 判斷 Board read/write/manage。
- viewer 可讀不可寫。
- 非 Board 成員不可讀 Board scoped data。
- activity event 可由 Board writer 寫入，Board reader 可讀。
- audit log 只允許 owner/admin 讀取；寫入走 service role 或 `log_audit_event` RPC 的 manage/admin 檢查。
- `board_invites` 只允許 Board manager 讀取、建立、撤回；同一 Board + email 同時間只能有一筆 pending invite。
- `accept_board_invite` 使用 token hash 查找 invite，要求 auth email 與 invite email 一致，接受後補齊 `tenant_members` 與 `project_members`。
- RLS 不使用 `assignee_id` 或 `collaborator_ids` 判斷任何 read/write 權限。

## UI Guard Model

UI guard 由 `src/hooks/useBoardPermissions.ts` 提供 capability helper：

- `canReadBoard`
- `canCreateTask`
- `canEditTask`
- `canMoveTask`
- `canDeleteTask`
- `canAssignTask`
- `canCreateDependency`
- `canDeleteDependency`
- `canManageBoardMembers`
- `canEditBoardSettings`

主要入口：

- Board/Kanban drag/drop
- WBS list inline edit
- WBS node assignee/status/date/duration
- TaskDetailsModal status/date/tag/note
- BoardMembersPanel email invite、pending invite、role management
- GlobalContextMenu 新增、刪除、移動、dependency
- SharedTaskSidebar 新增與拖曳

UI guard 原則：

- role loading 時保守為 readonly。
- viewer/observer 不顯示或禁用所有 mutation。
- member 可操作任務，但不可管理成員或 Board 設定。
- project_manager/admin 可管理 Board members。
- Email invite UI 不提供 role selector；角色調整集中在 Board members role management。
- RLS 錯誤仍需由 service/UI 顯示可理解的錯誤或復原狀態。

## Activity/Audit Model

一般協作紀錄寫 `activity_events`：

- 任務建立、指派、協作者變更、狀態、移動、日期、封存、復原、標籤。
- dependency 建立、修改、刪除。
- payload 必須包含 before/after 或足夠還原語意的 diff。
- 前端採 best-effort 寫入，失敗只警告，不阻斷主操作。
- 長期若要避免漏記，應將關鍵 mutation 收斂到 RPC/Edge Function/trigger。

敏感稽核寫 `audit_logs`：

- member invited。
- invite created。
- invite revoked。
- invite accepted。
- member removed。
- member role changed。
- board deleted。
- workspace deleted。
- audit 讀取只給 owner/admin 或 service role。
- audit 寫入不開放一般 direct insert，優先走 RPC 或 service role path。

## Trello 對照

| Trello 概念 | ProJED 對應 | 差異 |
| --- | --- | --- |
| Workspace | `tenants` | ProJED 使用 Supabase tenant 與 RLS 作資料邊界 |
| Board member | `project_members` | ProJED Board role 同時控制 DB read/write |
| Board invite | `board_invites` | ProJED 以 Board-first email invite 補齊 Workspace member，UI 不暴露 Workspace 邀請 |
| Card member | `assignee_id`、`collaborator_ids` | ProJED 明確定義為責任/參與，不授權 |
| Card movement | `wbs_items.parent_id/sort_order/kanban_stage_id` | ProJED 同時支援 WBS tree 與 Kanban 呈現 |
| Activity | `activity_events` | ProJED event payload 面向稽核、AI/RAG 查詢 |
| Admin actions | `audit_logs` | ProJED 將敏感權限操作與一般 activity 分流 |
| Private card | 不支援 | 第一版不做 Task-level private permission |

## 為何不做 Task-level Private Permission

第一版不做 Task-level private permission，原因如下：

- Trello-style 看板的主要協作單位是 Board，不是單一任務。
- Task-level private permission 會讓 RLS、UI guard、realtime、calendar、RAG、activity log 都需要額外條件，風險與成本高。
- 指派是責任，不是權限；若讓 assignee 控制可見性，會造成使用者誤以為被指派才看得到任務。
- Board-level permission 足以覆蓋第一版 owner/admin/project_manager/member/viewer 協作情境。
- 未來若需要 private task，必須新增獨立 permission link，例如 `task_members` 或 `task_visibility_rules`，不得重用 assignee/collaborator。

## V1 不支援項目

- Guest。
- Comment thread。
- Notification center。
- Watch/subscription。
- Task-level private permission。
- Firebase backend 的完整權限相容。
- 完整 activity feed UI。
- 進階 member management UI，例如 guest、watcher、跨 tenant invite、task-level private access。

## QA/QC 判斷基準

QA 制定驗證計畫時需檢查：

- 功能是否符合 Board-level permission。
- 是否誤用 assignee/collaborator 當權限。
- viewer 是否 read-only。
- 非 Board 成員是否不可讀。
- Pending invite 是否不授權、不進指派名單。
- Accept invite 是否只接受相同 auth email，並自動補齊最低必要 Workspace/Board membership。
- 敏感操作是否寫 audit。
- 一般協作操作是否寫 activity。

QC 執行驗證時需使用：

- `npm run verify:ontology-collaboration`
- `npm run verify:ontology-collaboration:db`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run verify:supabase:static`

實際 DB 驗證必須使用測試 Supabase project 或 local Supabase，並顯式啟用 DB smoke，避免誤用 production service role。

## 版本紀錄

- 2026-05-27：建立 V1 規格，對齊 DEV-001 至 DEV-007。
- 2026-05-28：補齊 Board-first email invite、Invisible Workspace 自動補齊、`board_invites`/`accept_board_invite`、invite audit 分流。
