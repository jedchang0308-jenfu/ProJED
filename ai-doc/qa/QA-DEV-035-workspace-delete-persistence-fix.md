# QA-DEV-035: 工作區刪除持久化修正驗證計畫

關聯 DEV: DEV-035
關聯 SPEC: `ai-doc/specs/SPEC-035-workspace-delete-persistence-fix.md`
狀態: Local Automated QC Passed / Supabase DB QC Pending
建立日期: 2026-06-29

## 驗證目標

確認工作區刪除只有在後端持久化成功後才被 UI 視為成功；重新整理後不得復活；刪除失敗需可見；Supabase 權限邊界維持 owner-only。

## 測試資料

local-test / browser smoke：

- Account A：`local-test-user`，workspace owner。
- 至少兩個 workspace：一個保留、一個用於刪除。
- 被刪 workspace 內至少一個 board，用於驗證 active board cleanup。

Supabase DB QC：

- Workspace A：owner 為 User Owner。
- Workspace A 內至少一個 project、task、tag、record 或 document。
- User Admin：Workspace A admin。
- User Member：Workspace A member。
- User Viewer：Workspace A viewer 或 board viewer。
- User Outsider：非 Workspace A member。

## Zero-Tolerance Failures

- 使用者看到刪除成功或工作區從 UI 消失，但重新整理後又出現。
- Supabase RPC 允許非 owner 刪除 workspace。
- 刪除失敗只出現在 console，UI 沒有任何錯誤回饋。
- 刪除 active workspace 後仍保留不存在的 `activeWorkspaceId` 或 `activeBoardId`。
- 新增直接 `tenants delete` RLS policy 讓 client 可繞過 RPC。

## Static Verification

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-035-S01 | Migration 定義 `public.delete_workspace(target_tenant_id uuid)` | 存在，且為 `security definer` |
| QA-035-S02 | RPC 權限檢查 | 僅 active owner 可通過 |
| QA-035-S03 | RPC execute 權限 | revoke public/anon，grant authenticated/service_role |
| QA-035-S04 | Supabase service | `supabaseWorkspaceService.delete` 呼叫 `rpc('delete_workspace')` |
| QA-035-S05 | Store contract | `removeWorkspace` 回傳 Promise，且 await backend success 後才 mutate state |
| QA-035-S06 | Active cleanup | 刪 active workspace 時清除 active workspace、active board、modal/localStorage |
| QA-035-S07 | UI feedback | `GlobalContextMenu` await delete，成功/失敗皆 toast |
| QA-035-S08 | Package script | 註冊 `verify:dev-035-workspace-delete-persistence-fix` |

Static gate：

```powershell
npm.cmd run verify:dev-035-workspace-delete-persistence-fix
```

## Browser Verification

| Case | 操作 | 預期 |
|---|---|---|
| QA-035-B01 | local-test 登入 owner，建立或定位刪除用 workspace | Sidebar 顯示該 workspace |
| QA-035-B02 | 右鍵 workspace，確認刪除 | workspace 從 sidebar 消失，顯示成功回饋 |
| QA-035-B03 | 重新整理頁面 | 被刪 workspace 不再出現 |
| QA-035-B04 | 刪除目前 active workspace | 回到 `home` 或安全空狀態，不殘留不存在 board |
| QA-035-B05 | 取消 confirm | workspace 保留，沒有後端刪除 |
| QA-035-B06 | 390px mobile viewport smoke | sidebar/confirm/toast 不重疊、不截斷主要操作 |

Browser gate：

```powershell
npm.cmd run verify:dev-035-workspace-delete-browser
```

## Supabase DB QC

Migration 套用後執行。

| Case | 操作者 | 操作 | 預期 |
|---|---|---|---|
| QA-035-D01 | Owner | 呼叫 `delete_workspace(workspace_id)` | 成功，`tenants` 不再有該 id |
| QA-035-D02 | Owner | 刪除後呼叫 workspace list | 不再回傳該 workspace |
| QA-035-D03 | Admin | 呼叫 `delete_workspace(workspace_id)` | 失敗，workspace 保留 |
| QA-035-D04 | Member | 呼叫 `delete_workspace(workspace_id)` | 失敗，workspace 保留 |
| QA-035-D05 | Viewer | 呼叫 `delete_workspace(workspace_id)` | 失敗，workspace 保留 |
| QA-035-D06 | Outsider | 呼叫 `delete_workspace(workspace_id)` | 失敗或不可見 |
| QA-035-D07 | Owner | 刪除含 projects/tasks/tags/records/documents 的 workspace | tenant-scoped rows 依 FK cascade 移除，普通 authenticated user 不可讀 |

## Failure-Mode Tests

| Case | 情境 | 預期 |
|---|---|---|
| QA-035-F01 | RPC 回權限錯誤 | UI 不移除 workspace，顯示失敗 toast |
| QA-035-F02 | Supabase network error | UI 不移除 workspace，顯示失敗 toast |
| QA-035-F03 | target workspace id 不存在 | RPC 失敗，UI 不宣告成功 |
| QA-035-F04 | 刪除過程後即刻收到 realtime reload | 最終 state 與後端 list 一致，不復活已成功刪除資料 |

## Regression Gate

```powershell
npm.cmd exec tsc -- --noEmit
npm.cmd run build
npm.cmd run verify:core-regression-static
```

若實作觸及 context menu、sidebar 或 workspace sync，建議加跑：

```powershell
npm.cmd run verify:dev-030-sidebar-rename-contract
npm.cmd run verify:dev-030-sidebar-rename-contract-browser
```

## QC Handoff Evidence

QC 回報至少包含：

- Static verifier 結果。
- Browser verifier 結果。
- TypeScript/build 結果。
- Supabase DB QC 若未執行，需明確標示為環境阻塞，不得宣稱正式資料庫驗證完成。
- 若有截圖，放在 `output/playwright/` 並在 QC 報告引用。

本輪 QC 證據已建立：`ai-doc/qc/QC-DEV-035-workspace-delete-persistence-fix.md`。
