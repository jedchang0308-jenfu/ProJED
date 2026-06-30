# QA-DEV-036: Trello-like Workspace Governance 驗證計畫

關聯 DEV：DEV-036
關聯 SPEC：`ai-doc/specs/SPEC-036-trello-like-workspace-governance.md`
關聯 ADR：`ai-doc/decisions/ADR-036-trello-like-workspace-governance.md`
狀態：Local Automated QC Passed
建立日期：2026-06-29

## 驗證目標

確認 ProJED Workspace 架構改為 Trello-like：Workspace 是可新增、可管理、多 Board 的治理容器；Board 是專案工作單位；產品不再限制為固定的「我的工作區 / 共用工作區」兩項。

## Zero-Tolerance Failures

- UI 或資料模型暗示使用者只能有兩個固定 Workspace。
- 新增 Workspace 後重新整理消失。
- Board 分享後被自動搬移 Workspace。
- Board move 變成自由拖拉或前端多步 update，而非 DEV-025 受控搬移。
- Workspace member 因 Board invite 被加入後，看得到不該看的其他 Boards。
- Workspace delete 回到 optimistic success，造成 reload 後復活。

## Static Verification

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-036-S01 | DEV-036 文件 | ADR / SPEC / QA / dev_task / documentation_map 均存在並互相引用 |
| QA-036-S02 | Sidebar entry | Sidebar 工作區選單標題列右側有 `+` icon button，具備 `新增工作區` tooltip / accessible label |
| QA-036-S03 | Store contract | `addWorkspace` 仍可建立多個 Workspace，未被限制成固定兩筆 |
| QA-036-S04 | Create persistence contract | Workspace create 採 backend-success-first，不先寫入 temp workspace 或 localStorage |
| QA-036-S05 | First-run contract | 使用者沒有任何 Workspace 時只自動建立 `我的工作區`，且同樣走 backend-success-first |
| QA-036-S06 | Home / Sidebar wording | 不再把 `我的工作區` 當成唯一容器；多 Workspace 文案清楚 |
| QA-036-S07 | Board share | `BoardShareDialog` 或既有分享流程仍以 Board 為主 |
| QA-036-S08 | Board move | 仍呼叫 `move_project_to_workspace` / preview flow，不做自由拖拉搬移 |
| QA-036-S09 | Workspace delete | 保留 DEV-035 async delete + visible feedback contract |

建議 static gate：

```powershell
npm.cmd run verify:dev-036-trello-like-workspace-governance
```

## Browser Verification

| Case | 操作 | 預期 |
|---|---|---|
| QA-036-B01 | 登入 local-test，點 Sidebar 工作區標題列右側 `+` | 出現新增 Workspace dialog，標題/label 清楚表示 `新增工作區` |
| QA-036-B02 | Workspace name 留空或只輸入空白 | `建立` disabled，或送出時被 inline error 阻擋；不送出 create request |
| QA-036-B03 | 建立 `研發部` Workspace | 後端成功後 Sidebar 顯示 `研發部`，並切換到該 Workspace |
| QA-036-B04 | 在 `研發部` 建立 Board | Board 出現在 `研發部` 下，不混入其他 Workspace |
| QA-036-B05 | 重新整理 | 新 Workspace 與 Board 仍存在 |
| QA-036-B06 | 建立第二個 Workspace `生產部` | Sidebar 可同時顯示多個 Workspace，不限制兩項 |
| QA-036-B07 | 分享 Board | Board 不因分享自動搬移 Workspace |
| QA-036-B08 | 右鍵 Board 移動到另一 Workspace | 仍走 preview / confirm flow |
| QA-036-B09 | Mobile viewport 390px | 新增 Workspace、切換 Workspace、Workspace menu 不重疊、不裁切主要操作 |

## Workspace Create Failure Modes

| Case | 操作 | 預期 |
|---|---|---|
| QA-036-F01 | 模擬 `workspaceService.create` rejected | 顯示 visible error / toast；Workspace 清單不新增任何 local-only 項目 |
| QA-036-F02 | create request 尚未完成時連點 `建立` | 只送出一次 create；按鈕 loading / disabled |
| QA-036-F03 | create 成功但回傳資料缺 workspace id | 視為失敗；不寫入 store / localStorage |
| QA-036-F04 | create 失敗後重新整理 | 失敗那筆 Workspace 不會出現 |
| QA-036-F05 | First-run 自動建立 `我的工作區` 失敗 | 顯示可重試狀態；不建立本機假 workspace |
| QA-036-F06 | First-run `我的工作區` 建立成功後重新整理 | `我的工作區` 仍存在，且使用者仍可新增第二個 Workspace |

建議 browser gate：

```powershell
npm.cmd run verify:dev-036-trello-like-workspace-governance-browser
```

## Regression Gate

DEV-036 會觸及 Sidebar、Home、Workspace CRUD、Board create/share/move，因此至少加跑：

```powershell
npm.cmd run verify:dev-035-workspace-delete-persistence-fix
npm.cmd run verify:dev-035-workspace-delete-browser
npm.cmd run verify:dev-030-sidebar-rename-contract
npm.cmd run verify:dev-030-sidebar-rename-contract-browser
npm.cmd run verify:dev-025-project-workspace-transfer
npm.cmd run verify:dev-026-trello-like-board-share-ui
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

## Supabase DB QC

若 Phase 1 僅改 UI / local-test，不必新增 migration。若 Phase 2+ 改 Workspace membership 或 guest-like access，需補真實 Supabase DB QC：

- Workspace owner/admin 可建立、改名、刪除 Workspace。
- Workspace member/viewer 不可刪除 Workspace。
- Board member 只看得到自己被授權的 Board。
- Board move 後 RLS、project_members、tenant_members、RAG scope 與 audit log 一致。

## QC Handoff Evidence

QC 回報至少包含：

- Static verifier 結果。
- Browser verifier 結果與截圖。
- Regression gates 結果。
- 若未執行 Supabase DB QC，需明確標示原因與適用 phase。

## 本輪 QC 結果（2026-06-29）

- Pass：`npm.cmd run verify:dev-036-trello-like-workspace-governance`，24/24。
- Pass：`npm.cmd run verify:dev-036-trello-like-workspace-governance-browser`。
- Pass：`npm.cmd run verify:dev-035-workspace-delete-persistence-fix`，22/22。
- Pass：`npm.cmd run verify:dev-035-workspace-delete-browser`。
- Pass：`npm.cmd run verify:dev-030-sidebar-rename-contract`，9/9。
- Pass：`npm.cmd run verify:dev-030-sidebar-rename-contract-browser`。
- Pass：`npm.cmd run verify:dev-025-project-workspace-transfer`。
- Pass：`npm.cmd run verify:dev-026-trello-like-board-share-ui`，15/15。
- Pass：`npm.cmd exec tsc -- --noEmit`。
- Pass：`$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build`。

Supabase DB QC：本 Phase 未新增 migration，也未修改 Workspace membership / guest-like access / RLS，因此不執行遠端 DB role QC。若 Phase 2 觸及 Workspace members 或 Board guest-like access，需另開 DB QC。
