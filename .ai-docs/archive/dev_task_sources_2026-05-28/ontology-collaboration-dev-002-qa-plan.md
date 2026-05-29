# DEV-002 QA 驗證計畫

Last updated: 2026-05-27

## 驗證目標

確認 DEV-002 已建立 member service 與 member store，active workspace/board 可載入真實或測試成員，且任務指派 UI 不再依賴硬編碼人員。

## 驗證範圍

### 包含

- `dataBackend.memberService` 提供 workspace members、board members、current board access。
- Supabase backend 從 `tenant_members`、`project_members`、`profiles` 讀取成員。
- local-test backend 提供固定假資料，可供 RD/QC 重複驗證。
- Firebase backend 只提供 legacy fallback，不承接完整新權限。
- `useMemberStore` 可保存 workspace members、board members、current board access、loading、error。
- `useMemberSync` 會依 active workspace/board/auth session 載入或清空 members。
- `WbsNodeItem` assignee options 來自 board members，不再硬編碼 `user_jed`、`user_pm`。

### 不包含

- 不驗證新增/移除成員 UI。
- 不驗證 email invite。
- 不驗證 Board-level RLS。
- 不驗證 assignee persistence；此項屬 DEV-003。

## QC 驗證步驟

1. 搜尋確認硬編碼 assignee 已移除：
   - `rg -n "user_jed|user_pm|Jed \\(CTO\\)|PM_A" src`
2. 搜尋確認 member service/store/hook 已接上：
   - `rg -n "memberService|useMemberStore|useMemberSync|listWorkspaceMembers|listBoardMembers|getCurrentBoardAccess" src`
3. 執行靜態檢查：
   - `npx.cmd tsc --noEmit`
   - `npm.cmd run lint`
4. 檢查 `WbsNodeItem` 中 assignee select 是否使用 `boardMembers` 產生 options。
5. 檢查 local-test member fake data 至少包含 owner、project_manager、viewer。

## 通過標準

- TypeScript 通過。
- Lint 為 0 errors。
- `src/components/Wbs/WbsNodeItem.tsx` 不再含硬編碼 assignee options。
- `src/store/useMemberStore.ts` 與 `src/hooks/useMemberSync.ts` 存在並被 `useDataSync` 呼叫。
- Supabase member service 明確查詢 `tenant_members`、`project_members`、`profiles`。
- local-test backend 可提供可指派成員。

## QC 結果

- 狀態：通過
- 驗證日期：2026-05-27
- 驗證人：QC
- 未通過項目：無
- 驗證證據：
  - `rg -n "user_jed|user_pm|Jed \\(CTO\\)|PM_A" src` 無結果，確認硬編碼 assignee options 已移除。
  - `rg` 已確認 `memberService`、`useMemberStore`、`useMemberSync`、`listWorkspaceMembers`、`listBoardMembers`、`getCurrentBoardAccess` 已接上。
  - `src/components/Wbs/WbsNodeItem.tsx` 使用 `useMemberStore` 的 `boardMembers` 產生 assignee options。
  - `src/services/localTestService.ts` 提供 owner、project_manager、viewer 固定測試成員。
  - `npx.cmd tsc --noEmit` 通過。
  - `npm.cmd run lint` 通過，結果為 0 errors、75 warnings；warnings 為既有專案警告，非 DEV-002 新增錯誤。
