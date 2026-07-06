# QA-DEV-025: 受控跨工作區移動專案驗證計畫

關聯 DEV: DEV-025
關聯 SPEC: `ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md`
狀態: Static QA Done / DB QC Pending
建立日期: 2026-06-18

## 驗證目標

確認專案跨工作區移動能在不造成權限外洩、資料遺失、稽核斷鏈或半搬移狀態的前提下完成。

## 測試資料

建立三個工作區：

- Workspace A：來源工作區。
- Workspace B：目標工作區，操作者為 owner/admin。
- Workspace C：非授權目標工作區，操作者不是 admin。

建立一個來源專案：

- 至少 5 個任務，含父子階層。
- 至少 2 條依賴。
- 至少 2 個 workspace tags 並套用到任務。
- 至少 2 筆 meeting/work records。
- 至少 1 筆 record task link。
- 至少 1 筆 RAG document / sync job。
- 至少 1 個 pending board invite。
- 至少 3 個 board members，其中 1 人不是 Workspace B 成員。

## 權限驗證

| 案例 | 條件 | 預期 |
|---|---|---|
| 來源 board manager + 目標 workspace admin | 合法 | 可看到 preview 並可搬移 |
| 來源 member + 目標 workspace admin | 非法 | 不可搬移 |
| 來源 board manager + 目標 workspace member | 非法 | 不可搬移 |
| 來源 viewer | 非法 | 不顯示搬移入口或 preview 回權限不足 |
| 專案 transferLocked | 非法 | 顯示鎖定原因，不可搬移 |

## Preflight 驗證

- 顯示來源與目標工作區。
- 顯示專案名稱。
- 顯示任務、依賴、紀錄、文件、標籤關聯、pending invite 數量。
- 顯示會保留的成員。
- 顯示會移除的成員。
- 顯示標籤會重用或複製。
- 顯示 RAG 需要重新同步。
- 未輸入專案名稱時不可執行搬移。

## 搬移成功驗證

- `projects.id` 不變。
- `projects.tenant_id` 變成目標工作區。
- 專案從來源工作區 sidebar 消失。
- 專案出現在目標工作區 sidebar。
- 搬移完成後自動切換到目標工作區與同一專案。
- 任務樹完整，父子關係未斷裂。
- 依賴線仍正確。
- 任務標籤仍顯示，且 tag ids 屬於目標工作區。
- 工作紀錄仍可讀取。
- record task links 仍能定位任務。
- RAG document tenant/project scope 正確。
- pending invites 失效，不可再接受。
- 來源與目標 audit logs 都有搬移事件。

## 原子性驗證

模擬搬移中途失敗：

- 在 RPC 中造成標籤 remap 失敗。
- 在 RPC 中造成 project_members 更新失敗。
- 在 RPC 中造成 RAG sync job 更新失敗。

每種失敗都必須驗證：

- 專案仍留在來源工作區。
- 子資料表沒有部分變更為目標工作區。
- 前端顯示失敗，不顯示成功。
- 重新載入後資料狀態一致。

## RLS 驗證

搬移後：

- Source-only member 不可讀取該專案。
- Target workspace admin 可讀取該專案。
- Target board member 可依角色讀取或操作。
- 非目標工作區成員不可透過舊 deep link 讀取。
- 舊 pending invite token 不可讓使用者進入專案。

## UI / UX 驗證

- 右鍵選單入口只在可管理專案時顯示。
- 設定頁入口只在可管理專案時顯示。
- preview modal 在 440px、768px、1024px viewport 不重疊、不截斷主要資訊。
- 成員移除風險不以灰字隱藏，必須能被明確看見。
- 確認按鈕在 loading 時不可重複點擊。
- 成功 toast 與錯誤 toast 文案清楚。

## Regression Gate

```powershell
npm.cmd exec tsc -- --noEmit
npm.cmd run build
npm.cmd run verify:settings-project-context
npm.cmd run verify:core-regression-static
```

新增 DEV-025 verifier 後補跑：

```powershell
npm.cmd run verify:dev-025-project-workspace-transfer
```

## QC 事實驗證重點

- 實際查詢 Supabase，確認所有 project-scoped rows 的 `tenant_id` 一致。
- 實際使用來源成員、目標成員、非成員三種帳號驗證 RLS。
- 實際接受舊 invite token，確認已失效。
- 實際檢查 audit log，確認 source/target 皆有紀錄且沒有敏感資料暴露給不相關工作區。
- 實際檢查 RAG query，不可從來源工作區檢索到已搬移專案內容。
