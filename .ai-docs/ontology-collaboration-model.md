# Ontology Collaboration Model

Last updated: 2026-05-28

## 目的

本文件是 ProJED Trello-style 協作功能的 DEV-001 資料模型基準。第一版採 `Supabase-first`，以 Board-level permission 作為可見性邊界，並以 Ontology-style object/link/action 建立後續可查詢、可稽核、可供 AI/RAG 使用的協作核心。

完整產品/架構規格見 `.ai-docs/ontology-trello-collaboration-spec.md`。

## Object Model

| Object | Supabase source | Frontend type | 語意 |
|---|---|---|---|
| User/Profile | `profiles` | `CollaborationMemberProfile` | 使用者身分與顯示資料 |
| Workspace/Tenant | `tenants` | `Workspace` | 工作區與租戶邊界 |
| Workspace Membership | `tenant_members` | `WorkspaceMember` | 使用者在 Workspace 的角色與狀態 |
| Board/Project | `projects` | `Board` | 第一版主要協作與可見性邊界 |
| Board Membership | `project_members` | `BoardMember` | 使用者在 Board 的角色 |
| Board Invite | `board_invites` | `BoardInvite` | Board-first email invite，不是 Workspace invite |
| WBS Item/Task | `wbs_items` | `TaskNode` | 任務、群組、里程碑 |
| Assignment | `wbs_items.assignee_id` | `TaskNode.assigneeId` | 單一主要負責人，不是授權 |
| Collaboration | `wbs_items.collaborator_ids` | `TaskNode.collaboratorIds` | 任務協作者，不是授權 |

## Permission Model

第一版權限粒度固定為 Board-level：

- 能否看到 Board：由 Workspace owner/admin 繼承權限，或由 `project_members` 判斷。
- 能否修改任務：由 Board role capability 判斷，最終必須由 Supabase RLS 保護。
- 能否管理成員：Workspace owner/admin 或 Board project_manager。
- Email invite 只從 Board 發起；接受成功後才自動補齊最低必要 `tenant_members` 與 `project_members`。
- `assigneeId` 與 `collaboratorIds` 只表示責任與參與關係，不得作為 read/write 授權條件。

Role 與 capability 的程式基準定義在 `src/types/index.ts`：

- `CollaborationRole`
- `PermissionCapability`
- `WORKSPACE_ROLE_CAPABILITIES`
- `BOARD_ROLE_CAPABILITIES`
- `WorkspaceMember`
- `BoardMember`
- `CurrentBoardAccess`

## Role Baseline

| Role | Workspace 語意 | Board 語意 |
|---|---|---|
| `owner` | 租戶擁有者，可管理 Workspace 與所有 Board | 繼承完整 Board 管理能力 |
| `admin` | Workspace 管理者，可管理成員與 Board | 繼承完整 Board 管理能力 |
| `project_manager` | 可建立/管理被授權的 project 工作 | Board admin，可管理該 Board 與成員 |
| `member` | 一般 Workspace 成員 | Board editor，可新增、修改、移動任務 |
| `viewer` | Workspace 唯讀參與者 | Board observer，可讀不可寫 |

## Board-first Invite Model

- `board_invites` 保存 `tenant_id`、`project_id`、`email`、`invited_by`、`status`、`default_role`、`token_hash`、`expires_at`、`accepted_at`、`revoked_at`。
- `status` 只能是 `pending`、`accepted`、`revoked`、`expired`。
- 同一 `project_id + lower(email)` 同時間只能有一筆 pending invite。
- `default_role` 第一版固定為 `member`，不可在 invite UI 選 role。
- 原始 token 不寫入資料庫，只保存 hash。
- `accept_board_invite` 只能由相同 auth email 的使用者接受；成功後 upsert profile、tenant member、project member，並將 invite 改為 accepted。
- Pending invite 不代表權限，不可出現在 assignee/collaborator 選項。

## Out Of Scope For V1

- Task-level private permission。
- 使用 assignee/collaborator 限制任務可見性。
- Workspace-first invite UI。
- Guest。
- Comment thread。
- Notification center。
- Watch/subscription。
- Firebase backend 的完整權限相容。

## RD/QA/QC 規則

- RD 實作後續協作功能時，需優先引用本模型與 `src/types/index.ts` 的 role/capability 定義。
- QA 制定驗證計畫時，需確認每個功能沒有把 assignment 誤當 permission。
- QA 制定 invite 驗證時，需同時覆蓋 pending、accepted、revoked、expired、wrong email、duplicate pending。
- QC 驗證時，需用 RLS 或資料層證據確認 Board-level permission，而不是只看 UI。
- 若 DB smoke 無法執行，文件只能標示 static/local-test 通過，不可宣稱 RLS 已完整驗證。
