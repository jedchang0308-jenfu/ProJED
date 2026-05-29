# DEV-001 QA 驗證計畫

Last updated: 2026-05-27

## 驗證目標

確認 DEV-001 已建立 Supabase-first 協作資料模型基準，且 RD 後續可依此實作 Workspace role、Board role、member profile、assignee、collaborator 與 permission capability。

## 驗證範圍

### 包含

- 前端型別存在且命名不衝突。
- Role/capability mapping 覆蓋 `owner`、`admin`、`project_manager`、`member`、`viewer`。
- Supabase generated/manual types 包含 `project_members`。
- 文件明確說明 Board-level permission 是第一版可見性邊界。
- 文件明確說明 `assigneeId`、`collaboratorIds` 是責任/參與關係，不是授權。
- 文件明確列出 Firebase backend 只作 legacy/fallback，不承接完整新權限模型。

### 不包含

- 不驗證 RLS policy 實際行為。
- 不驗證 UI role guard。
- 不驗證 member service。
- 不驗證 task assignment persistence。

## QC 驗證步驟

1. 檢查 `src/types/index.ts` 是否包含：
   - `CollaborationRole`
   - `MembershipStatus`
   - `PermissionCapability`
   - `WORKSPACE_ROLE_CAPABILITIES`
   - `BOARD_ROLE_CAPABILITIES`
   - `CollaborationMemberProfile`
   - `WorkspaceMember`
   - `BoardMember`
   - `CurrentBoardAccess`
2. 檢查 `src/services/supabase/database.types.ts` 是否包含：
   - `ProjectMemberRow`
   - `Database.public.Tables.project_members`
3. 檢查 `.ai-docs/ontology-collaboration-model.md` 是否明確描述：
   - Supabase canonical source
   - Board-level permission
   - assignment is not permission
   - V1 out-of-scope
4. 執行靜態檢查：
   - `npx tsc --noEmit`
   - `npm run lint`
5. 若有 TypeScript 或 lint failure，交回 RD 修正後重跑。

## 通過標準

- 所有 QC 驗證步驟均通過。
- 沒有新增 Task-level private permission 規格。
- 沒有把 `assigneeId` 或 `collaboratorIds` 放入授權條件。
- 既有型別使用者不需立即修改即可通過 TypeScript。

## QC 結果

- 狀態：通過
- 驗證日期：2026-05-27
- 驗證人：QC
- 未通過項目：無
- 驗證證據：
  - `rg` 已確認 `src/types/index.ts` 包含 DEV-001 要求的 collaboration role、membership、capability 與 member profile 型別。
  - `rg` 已確認 `src/services/supabase/database.types.ts` 包含 `ProjectMemberRow` 與 `project_members` table type。
  - `rg` 已確認 `.ai-docs/ontology-collaboration-model.md` 明確記錄 Board-level permission、assignment is not permission、Firebase legacy/fallback 與 V1 out-of-scope。
  - `npx.cmd tsc --noEmit` 通過。
  - `npm.cmd run lint` 通過，結果為 0 errors、75 warnings；warnings 為既有專案警告，非 DEV-001 新增錯誤。
