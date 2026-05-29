# DEV-009 QA 驗證計畫：Invisible Workspace 協作規格文件

Last updated: 2026-05-28

## 驗證目標

確認 `.ai-docs/ontology-trello-collaboration-spec.md` 與 `.ai-docs/ontology-collaboration-model.md` 已文件化 Board-first invite、Invisible Workspace、Board role、assignee/collaborator、RLS/RPC、audit/activity 的第一版邊界，且沒有宣稱尚未支援的 Guest、watch、Task-level private permission。

## QA 驗證項目

- 文件列出 `board_invites`、`tenant_members`、`project_members`、`wbs_items.assignee_id`、`activity_events`、`audit_logs` 的 object/link/action 語意。
- 文件明確定義 email invite 是 Board-first action，不是 Workspace-first invite。
- 文件明確定義接受 invite 後才補齊最低必要 Workspace member 與 Board member。
- 文件明確定義 pending invite 不授權、不進 assignee/collaborator 選項。
- 文件明確定義 `assigneeId` 與 `collaboratorIds` 是責任/參與，不是 read/write permission。
- 文件列出 `accept_board_invite`、`log_activity_event`、`log_audit_event` 與三個 Board-level helper。
- 文件列出 invite created/revoked/accepted、member role changed/removed 的 audit 分流。
- 文件列出 V1 不支援 Guest、comment、watch/subscription、Task-level private permission。

## RD FMEA

| 風險 | 失效模式 | 影響 | 驗證方法 |
| --- | --- | --- | --- |
| 文件漏寫 `board_invites` | RD 後續仍用 Workspace invite 思維 | 權限模型回退 | `rg` 檢查 spec/model 關鍵字 |
| assignee 被誤當權限 | 文件描述不清 | RLS 設計錯誤 | 檢查 assignee/collaborator 段落 |
| DB smoke 未完成被誤宣稱 | 文件寫成 production/RLS 已完整通過 | 風控失真 | 檢查 QA/QC 區塊保留 DB smoke 條件 |
| V1 排除項被混入需求 | Guest/watch/private task 未標示 out-of-scope | 任務範圍膨脹 | 檢查 V1 不支援項目 |

## QC 指令

```powershell
rg -n "board_invites|accept_board_invite|Invisible Workspace|Board-first|tenant_members|project_members|assignee|collaborator|audit_logs|activity_events|Task-level private|Guest|watch" .ai-docs/ontology-trello-collaboration-spec.md .ai-docs/ontology-collaboration-model.md
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run verify:ontology-collaboration
```

## 通過標準

- 文件關鍵字與語意完整命中。
- typecheck、lint、static QC 不因文件更新產生新錯誤。
- 若 local Supabase 仍無法連線，DB smoke 維持 pending，不列入 DEV-009 文件通過條件。

## QC 結果

- [x] `rg` 文件關鍵字檢查通過，命中 `board_invites`、`accept_board_invite`、Invisible Workspace、Board-first、membership、assignment、audit/activity、V1 排除項。
- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 通過，0 errors、72 warnings。
- [x] `npm.cmd run verify:ontology-collaboration` 通過，16 pass、1 pending DB smoke、0 fail。

## 結論

DEV-009 文件化通過。DB smoke pending 屬 DEV-002/004/007/008 的資料庫驗證阻塞，不影響本文件任務完成。
