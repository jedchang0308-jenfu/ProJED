# SPEC-035: 工作區刪除持久化修正

關聯 DEV: DEV-035
任務類型: Bug fix / Supabase permission / UI state consistency
狀態: Implemented / Local Automated QC Passed / Supabase DB QC Pending
優先級: P0
建立日期: 2026-06-29

## 背景

使用者回報：工作區明明已刪除，但重新整理後又出現在工作區清單。截圖顯示刪除動作從工作區右鍵選單觸發，畫面當下會消失，但正式站重新整理後資料重新載回。

目前正式環境使用 Supabase backend。現有刪除路徑存在三層不一致：

- UI/store：`useBoardStore.removeWorkspace` 先從 `workspaces` state 移除，再呼叫 `workspaceService.delete(wsId).catch(console.error)`。
- Service：Supabase backend 目前直接對 `public.tenants` 執行 delete。
- Database：現有 migrations 只有 `tenants` select/update policy，沒有安全可用的 tenant delete path；delete 失敗後 UI 不回滾、不提示，重新整理時 `useSupabaseSync` 從後端重新載入同一筆 workspace。

## 問題定義

真正問題不是「重新整理把舊資料快取回來」，而是「前端宣告刪除成功早於後端持久化成功」。重新整理只是揭露後端其實沒有刪除。

必須同時修正：

- 後端需要有受控、可驗證、符合 RLS 邊界的 workspace delete path。
- 前端必須等後端刪除成功後才移除 UI。
- 刪除失敗必須可見，不得只寫入 console。
- 刪除目前 active workspace 後，本機 active workspace / board / modal 狀態不得殘留到不存在的資料。

## 範圍

本輪包含：

- 新增 Supabase RPC：`public.delete_workspace(target_tenant_id uuid)`。
- `supabaseWorkspaceService.delete` 改呼叫 RPC，不再直接刪 `tenants`。
- `BoardActions.removeWorkspace` 改為 async，後端成功後才更新 Zustand state。
- `GlobalContextMenu` 刪除工作區流程等待結果，成功/失敗皆明確 toast。
- 刪除 active workspace 時清除 active workspace、active board、modal 與對應 localStorage key，並回到 `home`。
- 補 static verifier、browser verifier 與 package scripts。
- 補 Supabase function typing。

本輪不包含：

- 工作區回收桶、undo 或 soft delete。
- 「我的工作區 / 共用工作區」分組 UI 重構。
- 批次刪除、多選刪除。
- 正式環境 migration 套用與 production deploy；release 另走 deployment gate。

## 權限與資料規則

Workspace 刪除維持 owner-only：

- `tenant_members.role = 'owner'`
- `tenant_members.status = 'active'`
- `tenant_members.user_id = auth.uid()`

Admin、project_manager、member、viewer 不得刪除整個 workspace。這符合目前產品能力設計：`delete_workspace` capability 只屬於 workspace owner。

不新增寬鬆的 `tenants delete` RLS policy。使用 RPC 是為了集中檢查角色、搜尋路徑與授權邊界，避免一般 client 直接對 `tenants` 做任意 delete。

## 後端契約

新增 migration，例如：

```sql
create or replace function public.delete_workspace(target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role = 'owner'
  ) then
    raise exception 'Only workspace owners can delete workspaces.';
  end if;

  delete from public.tenants
  where id = target_tenant_id;
end;
$$;
```

Migration 必須：

- revoke `public` / `anon` execute。
- grant `authenticated` / `service_role` execute。
- 依既有 FK cascade 刪除 projects、members、tasks、tags、records、documents、RAG rows 等 tenant-scoped data。
- 若目標 tenant 不存在或操作者無權，RPC 必須失敗，不得回傳成功。

## 前端契約

`removeWorkspace(wsId)` 必須改為 `Promise<void>`。

成功路徑：

- await `workspaceService.delete(wsId)` 成功。
- 從 `workspaces` state 移除 workspace。
- 如果刪除的是 active workspace，清除 `activeWorkspaceId`、`activeBoardId`、`editingItem` 並設 view 為 `home`。
- 清除 `projed-last-ws`、`projed-last-board`、`projed-last-modal` 中已刪 workspace/board 的殘留。
- 顯示成功 toast。

失敗路徑：

- 不從 UI 移除 workspace。
- 顯示失敗 toast，內容需能讓使用者知道刪除未完成。
- 錯誤仍可寫 console，但 console 不能是唯一回饋。

## 驗收標準

- Owner 刪除 workspace 後，重新整理仍不再出現該 workspace。
- Supabase delete 失敗時，工作區仍留在 sidebar，使用者看得到失敗訊息。
- 非 owner 不可透過 RPC 刪除 workspace。
- 刪除 active workspace 後，不殘留 active board，不進入空白或不存在看板。
- local-test / Firestore backend 既有刪除能力不退化。
- TypeScript、build、static verifier、browser verifier 均通過。

## RD 執行計畫

- 新增 Supabase migration：`delete_workspace` RPC 與 revoke/grant。
- 更新 `src/services/supabase/database.types.ts` function typing。
- 更新 `src/services/supabase/projedService.ts` 的 `supabaseWorkspaceService.delete`。
- 更新 `src/types/index.ts` 的 `BoardActions.removeWorkspace` 型別。
- 更新 `src/store/useBoardStore.ts`：移除假成功 optimistic delete，加入 active/localStorage cleanup。
- 更新 `src/components/GlobalContextMenu.tsx`：await delete、toast success/error、只在成功後收斂狀態。
- 新增 static verifier 與 browser verifier，並在 `package.json` 註冊 scripts。

## 驗證計畫

主要驗證計畫在 `ai-doc/qa/QA-DEV-035-workspace-delete-persistence-fix.md`。

RD exit gate：

```powershell
npm.cmd run verify:dev-035-workspace-delete-persistence-fix
npm.cmd run verify:dev-035-workspace-delete-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

本輪 local automated QC 已通過；QC 證據記錄於 `ai-doc/qc/QC-DEV-035-workspace-delete-persistence-fix.md`。

Supabase QC 需在 migration 套用到目標資料庫後執行：

- owner 呼叫 RPC 成功，重新 list 不再回傳 workspace。
- admin/member/viewer 呼叫 RPC 失敗。
- 刪除後相關 tenant-scoped data 不再可被一般 authenticated user 讀取。

## ADR 判斷

不另建 ADR。理由：

- 此變更修復既有 UI 已宣告支援的 owner-only workspace delete，沒有新增新的 workspace lifecycle 或角色政策。
- 權限規則沿用既有 capability：只有 owner 具備 `delete_workspace`。
- schema 變更是局部 RPC adapter，不改主資料 identity、狀態機或完成率基準。

若後續要新增 workspace recycle bin、soft delete、復原或 admin 可刪除策略，需另開 ADR。
