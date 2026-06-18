# SPEC-025: 受控跨工作區移動專案

關聯 DEV: DEV-025
任務類型: 功能開發 / 權限與資料一致性
狀態: Ready
優先級: P1
建立日期: 2026-06-18

## 背景

使用者希望專案可以在不同工作區之間移動。以目前 ProJED 資料模型來看，工作區對應 Supabase `tenants`，專案/看板對應 `projects`。專案資料不只存在於 `projects.tenant_id`，還包含任務、依賴、成員、權限、標籤、工作紀錄、RAG 文件、活動紀錄與 audit log。

因此這個功能不能設計成一般拖拉或單純更新 `projects.tenant_id`。正確方案是「受控搬移」：先做風險預覽，再由後端交易一次完成搬移，並保留完整稽核紀錄。

## 效用理論決策

決策目標不是最大化「移動方便」，而是最大化：

`總效用 = 整理工作區效率 + 專案資料連續性 + 使用者信任 - 權限外洩風險 - 稽核斷鏈風險 - 資料遺失風險 - 維護成本`

| 方案 | 效用 | 風險 | 決策 |
|---|---:|---:|---|
| 不允許移動 | 低 | 低 | 安全但長期效率差，放錯工作區只能重建或複製 |
| 只允許複製 | 中 | 中 | 會產生主版本不清、任務狀態分裂與紀錄重複 |
| 受控搬移 | 高 | 可控 | 建議方案，保留專案連續性並用權限、預覽、稽核降低風險 |
| 任意拖拉搬移 | 高 | 高 | 不採用，容易造成權限外洩與稽核斷鏈 |

## 產品原則

- 入口放在專案/看板設定或專案右鍵選單，不支援 sidebar 任意拖拉搬移。
- 使用者必須先看到影響預覽，確認後才執行。
- 搬移必須由後端 RPC 以單一交易完成；前端不得自行串多個 update。
- 搬移不是複製。原 `project_id` 必須保留，任務、紀錄與引用關係要跟著原專案移動。
- 特殊專案可鎖定不可移動，例如品質驗證、稽核樣板、系統固定看板。

## 權限規則

允許搬移的最低條件：

- 使用者對來源專案具備 board manager 等級權限：workspace owner/admin 或 board owner/admin/project_manager。
- 使用者對目標工作區具備 workspace owner/admin 權限。
- 來源專案未被 `metadata.transferLocked = true` 或等效策略鎖定。
- 目標工作區必須存在且使用者為 active member。

建議新增 capability：

- `move_board_between_workspaces`

若第一版不新增 capability，則以「來源可管理專案 + 目標可管理工作區」作為硬條件，但不得只用 `edit_board_settings` 代表搬移權限。

## 搬移前預覽

前端呼叫後端 preflight RPC：

```ts
previewProjectWorkspaceTransfer(sourceWorkspaceId, boardId, targetWorkspaceId)
```

預覽至少顯示：

- 來源工作區與目標工作區名稱。
- 專案名稱與目前成員數。
- 將保留的看板成員：同時存在於目標工作區的 active members。
- 將移除的看板成員：不屬於目標工作區者，不得自動加入目標工作區。
- 待處理或將撤銷的邀請。
- 任務數、依賴數、紀錄數、文件數、標籤關聯數。
- 是否需要複製標籤到目標工作區。
- 是否會重新排入 RAG 同步工作。
- 是否有 transfer lock 或權限不足阻擋搬移。

確認文案必須要求輸入專案名稱或明確按下危險操作確認。不能只用一般 confirm。

## 後端設計

新增 Supabase RPC：

```sql
public.preview_project_workspace_transfer(
  source_tenant_id uuid,
  project_id uuid,
  target_tenant_id uuid
)

public.move_project_to_workspace(
  source_tenant_id uuid,
  project_id uuid,
  target_tenant_id uuid,
  expected_project_name text
)
```

`move_project_to_workspace` 必須在交易中完成：

1. 鎖定 `projects` 目標列，避免同時搬移或更新。
2. 驗證來源專案仍屬於 `source_tenant_id`。
3. 驗證使用者具備來源管理權與目標工作區管理權。
4. 驗證專案未被鎖定。
5. 建立 pre-move snapshot summary，包含成員、權限、標籤、資料列統計。
6. 更新 `projects.tenant_id` 與排序資訊。
7. 更新所有 project-scoped 表的 `tenant_id`。
8. 重新建立或修正 `project_members`，只保留目標工作區 active members。
9. 更新 `board_role_permissions` 的 `tenant_id`。
10. 撤銷 pending `board_invites`，避免舊工作區邀請連結跨界生效。
11. 處理 workspace-scoped tags：目標工作區已有同名同色標籤則重用，否則複製新標籤，並 remap `wbs_item_tags.tag_id`。
12. 將 RAG 相關資料標記需要重新同步，避免外部索引仍以舊工作區權限提供檢索。
13. 寫入 source tenant 與 target tenant 各一筆 audit log。
14. 寫入 project activity event：`project_workspace_transferred`。

必須更新或處理的表：

- `projects`
- `project_members`
- `board_role_permissions`
- `board_invites`
- `wbs_items`
- `wbs_dependencies`
- `wbs_item_tags`
- `knowledge_records`
- `record_task_links`
- `documents`
- `document_versions`
- `document_chunks`
- `document_embeddings`
- `rag_sync_jobs`
- `external_rag_objects`
- `activity_events`
- `llm_access_logs`

若某些表不存在於目前環境，RPC 應在 migration 階段固定 schema 依賴，不得靜默略過 production 表。

## 前端設計

新增入口：

- 專案/看板右鍵選單：`移動到工作區`
- 設定頁專案區塊：`移動專案`

流程：

1. 使用者點選移動。
2. 彈出 modal，選擇目標工作區。
3. 系統呼叫 preview RPC。
4. modal 顯示權限變更、成員變更、資料統計與阻擋原因。
5. 使用者輸入專案名稱確認。
6. 系統呼叫 move RPC。
7. 成功後重新載入工作區與專案列表，切換到目標工作區中的原專案。
8. 顯示成功 toast，包含「已移至 {targetWorkspaceName}」。

錯誤狀態：

- 權限不足：顯示「需要來源專案管理權與目標工作區管理權」。
- 專案被鎖定：顯示鎖定原因。
- 成員移除風險：仍可繼續，但必須在確認區清楚列出。
- 交易失敗：前端不得做 optimistic success，必須重新載入來源狀態。

## 風險控制

- 禁止一般 member/viewer 移動專案。
- 禁止搬移到使用者非管理員的工作區。
- 禁止自動把來源成員加入目標工作區。
- 禁止保留來源工作區 pending invite。
- 禁止只更新 `projects.tenant_id`。
- 搬移後來源工作區不再顯示該專案，但 source audit log 仍可被來源 workspace admins 查到。
- 搬移後目標工作區成員依 target tenant 與 project membership 取得存取權。

## 特殊專案鎖定

支援專案 metadata：

```json
{
  "transferLocked": true,
  "transferLockReason": "品質驗證專案需保留原工作區稽核鏈"
}
```

被鎖定專案不可移動。UI 顯示原因，但不提供覆蓋操作。若未來需要 super-admin override，必須另開 DEV，不納入本版。

## 驗收條件

- 使用者可從專案/看板入口啟動受控搬移流程。
- 搬移前會顯示成員保留、成員移除、資料列數與 RAG 重同步影響。
- 權限不足時不可搬移。
- 被鎖定專案不可搬移。
- 搬移成功後，原 `project_id` 不變，專案出現在目標工作區。
- 搬移成功後，任務、依賴、紀錄、文件、標籤關聯仍可正常讀取。
- 不屬於目標工作區的來源成員不會被自動加入目標工作區。
- 舊 pending invites 會被撤銷或失效。
- source tenant 與 target tenant 都能看到對應 audit log。
- RAG 文件與同步工作不會保留錯誤工作區權限。
- 交易中任一步失敗時，專案仍留在來源工作區，沒有半搬移狀態。

## Regression Gate

RD 完成後至少執行：

```powershell
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

新增 verifier 後補上：

```powershell
npm.cmd run verify:dev-025-project-workspace-transfer
npm.cmd run verify:settings-project-context
npm.cmd run verify:core-regression-static
```

## QA / QC Handoff

- QA 依 `ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md` 建立驗證矩陣。
- QC 必須以實際 Supabase 測試資料驗證交易原子性、RLS 邊界、audit log 與 RAG visibility。
- 若只完成文件與設計，狀態維持 Ready，不得標示 Done。
