# Ontology Collaboration Dev Tasks

Last updated: 2026-05-27

## 總進度

- [x] DEV-001 建立 Supabase-first 協作資料模型基準
- [x] DEV-002 建立 member service 與 member store
- [x] DEV-003 補齊任務指派持久化
- [x] DEV-004 實作 Board-level RLS 與 role write policy
- [x] DEV-005 實作 Role-aware UI Guard
- [x] DEV-006 建立 Activity / Audit event logging
- [x] DEV-007 建立協作權限 QC 驗證腳本與測試資料
- [x] DEV-008 文件化 Ontology/Trello 協作規格

## 共用假設

- 第一版只做 Supabase-first，不補完整 Firebase 權限相容。
- 第一版權限粒度固定為 Board-level。
- 任務指派只代表責任，不代表可見權限。
- Guest、留言、通知、watch 先不放入本次主線 task。
- 完成 task 時只勾選 `[x] 完成`，不刪除任務歷史內容。

---

## DEV-001：建立 Supabase-first 協作資料模型基準

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [x] 完成

## 目標

定義 ProJED 協作核心語意，讓 RD 不需要再猜 Workspace role、Board role、member profile、assignee、collaborator 的責任邊界。

## 範圍

### 包含

- 定義 Workspace member、Board member、role、permission capability、member profile。
- 定義 `assigneeId` 與 `collaboratorIds` 只代表責任或參與，不代表可見權限。
- 定義 Workspace/Board role 到 capability 的 mapping。
- 定義 Supabase canonical data source：`profiles`、`tenant_members`、`project_members`、`wbs_items`。
- 將 Firebase backend 定位為 legacy/fallback，不作為第一版權限主線。

### 不包含

- RLS migration。
- UI guard。
- 邀請流程。
- Task-level private permission。

## 驗收條件

- [x] RD 可以從文件判斷 Workspace role、Board role、assignee、collaborator 的差異。
- [x] Board-level permission 是第一版唯一可見性粒度。
- [x] `assigneeId` 不會被誤用成資料可見權限。
- [x] Firebase fallback 不影響 Supabase-first 權限設計。

## QC 檢查項

- [x] `TaskNode`、`Workspace`、`Board` 型別可承載協作欄位。
- [x] role/capability mapping 覆蓋 owner、admin、project_manager、member、viewer。
- [x] 文件明確排除 Task-level private permission。
- [x] 指派欄位與權限欄位沒有語意混用。

## 相依任務

無。

## 風險與注意事項

- Firebase fallback 只能做舊資料支援，不能反向主導 Supabase 權限設計。

## 變更紀錄

- 2026-05-27：建立 task。
- 2026-05-27：RD 完成 collaboration core types、Supabase `project_members` type、DEV-001 基準文件。QA/QC 以 `npx.cmd tsc --noEmit`、`npm.cmd run lint` 驗證通過。

---

## DEV-002：建立 member service 與 member store

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [x] 完成

## 目標

建立 Supabase-first 成員讀取資料流，讓 UI 能取得真實 Workspace/Board 成員清單，不再依賴硬編碼人員。

## 範圍

### 包含

- 從 `tenant_members`、`project_members`、`profiles` 載入 Workspace/Board 成員。
- 建立 member store，保存 active workspace/board members、role、capability。
- 提供目前登入者的 active board role 與 capability。
- 支援 loading、error、empty state。
- local-test backend 提供固定角色 fixture 供 QC 驗證。

### 不包含

- 邀請 UI。
- email invite。
- RLS policy。

## 驗收條件

- [x] UI 可取得 active workspace members。
- [x] UI 可取得 active board members。
- [x] UI 可取得目前使用者 active board role。
- [x] 沒有成員資料時 UI 不依賴硬編碼人員。
- [x] assignee options 來自 board members。

## QC 檢查項

- [x] member service 資料來源為 Supabase schema。
- [x] local-test backend 有可重複驗證用的成員 fixture。
- [x] auth session 變更會觸發 member store 同步。
- [x] 切換 active board 後 members 不污染其他 board。

## 相依任務

DEV-001。

## 風險與注意事項

- `project_members` 若缺資料，UI 需呈現空狀態或 read-only，不可回退成全員可寫。

## 變更紀錄

- 2026-05-27：建立 task。
- 2026-05-27：RD 完成 member service/store/sync hook、Supabase 讀取 `tenant_members`、`project_members`、`profiles`、local-test fixture，WBS assignee 使用 board members。QA/QC 以 `npx.cmd tsc --noEmit`、`npm.cmd run lint` 與 assignment UI 檢查通過。

---

## DEV-003：補齊任務指派持久化

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [x] 完成

## 目標

讓 `assigneeId`、`collaboratorIds` 可 create/update/load，重整頁面後指派資訊仍存在，Supabase realtime 可同步。

## 範圍

### 包含

- Supabase task insert payload 寫入 `assignee_id` 與 `collaborator_ids`。
- Supabase task update payload 寫入 `assigneeId` 與 `collaboratorIds`。
- load mapping 還原 `TaskNode.assigneeId` 與 `TaskNode.collaboratorIds`。
- assignee picker 使用 DEV-002 的 board members。
- 可清除 assignee。

### 不包含

- assignee 通知。
- mention。
- collaborator 完整 UI，只保留資料流。

## 驗收條件

- [x] 新增任務可設定 assignee。
- [x] 更新任務可變更 assignee。
- [x] 重新載入後 assignee 不遺失。
- [x] Supabase realtime 可同步指派欄位。
- [x] assignee 選單來源限制為 board members。

## QC 檢查項

- [x] `wbs_items.assignee_id` 寫入 profile id。
- [x] `wbs_items.collaborator_ids` 寫入 uuid array，處理 undefined/null。
- [x] 清除 assignee 會寫入 null。
- [x] 非 board member 不出現在 assignee picker。
- [x] 不破壞 tags、status、date update。

## 相依任務

DEV-001、DEV-002。

## 風險與注意事項

- 指派欄位不得被當成 RLS 可見性條件。

## 變更紀錄

- 2026-05-27：建立 task。
- 2026-05-27：RD 完成 Supabase `assignee_id`、`collaborator_ids` create/update/load mapping，清除 assignee 寫入 null。QA/QC 以 `npx.cmd tsc --noEmit`、`npm.cmd run lint` 與 assignment 靜態檢查通過。

---

## DEV-004：實作 Board-level RLS 與 role write policy

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [x] 完成

## 目標

用 `project_members` 控制 Board 可見性與寫入權限，非 Board 成員不可讀，viewer 可讀不可寫。

## 範圍

### 包含

- 建立 RLS helper function，判斷使用者是否可 read/write/manage target project。
- 更新 `projects`、`project_members`、`wbs_items`、`wbs_dependencies`、`task_tags`、`wbs_item_tags` policy。
- Workspace owner/admin 可管理 tenant 下 Board。
- Board project_manager 可管理 Board 成員。
- Board member 可寫 Board 任務。
- Board viewer 可讀不可寫。
- 非 Board 成員不可讀 Board WBS。

### 不包含

- Guest。
- Task-level private permission。
- UI guard。

## 驗收條件

- [x] 非 Board 成員 select 不到 Board、project、wbs_items、dependencies。
- [x] viewer 可 select，但 insert/update/delete WBS 會被 RLS 擋下。
- [x] member 可 insert/update WBS。
- [x] project_manager 可管理 Board `project_members`。
- [x] tenant owner/admin 可管理 tenant 下 Board。

## QC 檢查項

- [x] 覆蓋 owner、admin、project_manager、member、viewer、非成員。
- [x] 驗證 UPDATE 不會因 SELECT policy 漏洞造成資料外洩。
- [x] 驗證 service_role 維運可讀寫，不被使用者 policy 阻斷。
- [x] 與既有 P8/P9 Supabase static checks 不衝突。

## 相依任務

DEV-001。

## 風險與注意事項

- RLS 是最後防線，即使 UI guard 失效，資料庫仍需拒絕未授權寫入。
- 本次 migration 已套用至 `ProJED_TEST` 專案驗證，未套用到 production `ProJED`。

## 變更紀錄

- 2026-05-27：建立 task。
- 2026-05-27：RD 建立 `supabase/migrations/202605270001_board_level_collaboration_rls.sql`。
- 2026-05-27：QA/QC 完成 `ProJED_TEST` DB smoke，RLS read/write/manage/service_role case 全數通過。

---

## DEV-005：實作 Role-aware UI Guard

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [x] 完成

## 目標

依 active board role/capability 控制 UI 互動，使 viewer/observer 禁用拖曳、編輯、刪除、改狀態、改日期，UI 行為與 RLS 權限一致。

## 範圍

### 包含

- 建立 `useBoardPermissions` capability helper。
- viewer/observer 禁用 task 新增、拖曳、編輯、刪除、改狀態、改日期、dependency 變更。
- BoardView、WBS list、Kanban、TaskDetailsModal、TagPicker、StatusFilterBar、SharedTaskSidebar、GlobalContextMenu 加入 guard。
- Sidebar 禁用 viewer 新增看板、刪除工作區、刪除看板、匯入 JSON。
- RecycleBin 禁用 viewer 還原、永久刪除、清空回收桶。
- GanttTaskBar 禁用 viewer 拖曳與調整日期。
- role loading 期間採保守 read-only。

### 不包含

- 用 UI guard 取代 RLS。
- 管理成員 UI。
- 留言、通知、watch。

## 驗收條件

- [x] viewer 無法透過 UI 修改任務。
- [x] member 可新增與更新任務，但不可管理成員。
- [x] project_manager 可執行管理能力。
- [x] role loading 期間不開放寫入。
- [x] UI 與 DEV-004 RLS 權限一致。

## QC 檢查項

- [x] BoardView drag/drop 對 viewer disabled。
- [x] WBS list inline edit 對 viewer disabled。
- [x] TaskDetailsModal 對 viewer readonly。
- [x] context menu 刪除、複製、dependency 依 capability 禁用。
- [x] Sidebar、RecycleBin、Gantt 變更入口已納入 guard。
- [x] 服務層仍由 RLS 防守，UI guard 不作為唯一安全機制。

## 相依任務

DEV-002、DEV-004。

## 風險與注意事項

- UI guard 只能降低誤操作，權限安全仍以 DEV-004 RLS 為準。
- local-test fixture 需維持 owner/admin/project_manager/member/viewer 角色，方便重複驗證。

## 變更紀錄

- 2026-05-27：建立 task。
- 2026-05-27：RD 建立 `useBoardPermissions` 並套用主要任務操作 UI guard。
- 2026-05-27：QC 以 Playwright viewer fixture 發現 Sidebar、RecycleBin、Gantt 仍有變更入口，RD 補齊 guard。
- 2026-05-27：QC 重新驗證 viewer 下新增看板、刪除工作區、刪除看板、清空回收桶、Kanban 新增/拖曳、Gantt 拖曳均 disabled 或 cursor-not-allowed。

---

## DEV-006：建立 Activity / Audit event logging

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [x] 完成

## 目標

建立 Palantir-style action log 基礎，使一般協作寫 `activity_events`，敏感權限操作寫 `audit_logs`。

## 範圍

### 包含

- 建立 activity/audit logging service。
- 建立 `activity_events` 與 `audit_logs` migration。
- 任務指派、collaborators、狀態、移動、日期、封存、tag、dependency 變更寫 activity event。
- Board/Workspace delete、Board member invite/remove/role change 寫 audit log。
- payload 包含 actor、tenant、project、entity、event type、before/after。

### 不包含

- activity feed UI。
- comment thread。
- watch。

## 驗收條件

- [x] 指派變更會寫 activity event。
- [x] 狀態變更會寫 activity event。
- [x] 任務移動或日期變更會寫 activity event。
- [x] 權限敏感操作會寫 audit log。
- [x] event payload 包含必要追蹤欄位。

## QC 檢查項

- [x] `activity_events` read 受 tenant/project membership 控制。
- [x] `audit_logs` read 限 owner/admin/project_manager 或 service_role。
- [x] activity logging 採 best-effort，不阻斷主要任務更新流程。
- [x] realtime reload 不會破壞事件讀取。

## 相依任務

DEV-001、DEV-003、DEV-004。

## 風險與注意事項

- event logging 失敗不可讓 task 更新失敗；但 audit path 需保留足夠錯誤訊息供後續追查。

## 變更紀錄

- 2026-05-27：建立 task。
- 2026-05-27：RD 建立 `202605270002_activity_audit_logging.sql`、`eventLogService`、`supabaseEventLogService`。
- 2026-05-27：QC 在 `ProJED_TEST` DB smoke 驗證 `log_activity_event`、`log_audit_event`、activity viewer read、viewer write denied、audit owner read、member read/write denied 全數通過。

---

## DEV-007：建立協作權限 QC 驗證腳本與測試資料

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [x] 完成

## 目標

建立可重複執行的 QC 驗證腳本與測試資料，覆蓋 owner/admin/project_manager/member/viewer/非成員，驗證 RLS、UI guard、指派同步、event log。

## 範圍

### 包含

- 建立 Supabase seed/test data 流程。
- 建立 RLS smoke script。
- 建立 assignment persistence smoke。
- 建立 activity/audit event smoke。
- 建立 manual/runtime UI guard checklist。
- 提供 `npm run verify:ontology-collaboration` 與 `npm run verify:ontology-collaboration:db`。

### 不包含

- 完整 E2E 測試框架。
- Guest/comment/notification/watch。

## 驗收條件

- [x] QC 可用同一腳本重複驗證協作權限。
- [x] 腳本驗證 viewer read-only、member write、非成員不可讀。
- [x] 腳本驗證 assignee/collaborator persistence。
- [x] 腳本驗證 activity/audit log 寫入。
- [x] 文件列出 UI guard runtime 檢查方式。

## QC 檢查項

- [x] 測試資料可識別且可 cleanup。
- [x] 測試資料未寫入 production 專案。
- [x] local/test/prod env 差異有風險標註。
- [x] `verify:source` 不被破壞，新增 ontology collaboration gate 可獨立執行。

## 相依任務

DEV-003、DEV-004、DEV-005、DEV-006。

## 風險與注意事項

- `verify:ontology-collaboration:db` 需要 service role key，只能指向測試專案執行。
- 本次 DB smoke 透過 Supabase MCP 在 `ProJED_TEST` 執行，未使用本機 `.env.local`，因 `.env.local` 指向 production `ProJED`。

## 變更紀錄

- 2026-05-27：建立 task。
- 2026-05-27：RD 建立 `scripts/ontology-collaboration-qc.mjs`、`verify:ontology-collaboration`、`verify:ontology-collaboration:db`。
- 2026-05-27：RD/QC 擴充靜態 UI guard checks，納入 Sidebar、RecycleBin、GanttTaskBar。
- 2026-05-27：QC 在 `ProJED_TEST` 完成 DB smoke，RLS、assignment、activity、audit、service_role cases 全數通過。

---

## DEV-008：文件化 Ontology/Trello 協作規格

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [x] 完成

## 目標

記錄 object/link/action 模型、權限邏輯與不做 Task-level private permission 的原因，讓後續 RD/QA/QC 可直接依文件判斷功能是否偏離架構。

## 範圍

### 包含

- 文件化 object types：User/Profile、Workspace/Tenant、Board/Project、WBS Item/Task、Dependency、Role Assignment、Activity Event。
- 文件化 link types：Workspace has members、Board has members、Task assigned to user、Task has collaborators、Task depends on task。
- 文件化 action types：Invite member、Change role、Assign task、Move task、Change status、Create dependency。
- 文件化 Board-level visibility、role-based write、assignment is responsibility。
- 文件化不做 Task-level private permission 的原因。
- 對齊 Trello 的協作邏輯，並補上 ProJED 的 Supabase/RLS/action log core。

### 不包含

- 產品操作手冊。
- 完整管理者 UI 設計。
- 留言、通知、watch。

## 驗收條件

- [x] 文件說明 ProJED 採 Supabase-first。
- [x] 文件說明 Board role 與 task assignment 的差異。
- [x] 文件說明 activity/audit log 與 Palantir-style action log 的關係。
- [x] 文件列出第一版不做 Guest、comment、notification、watch、Task-level private permission。
- [x] QA/QC 可依文件制定驗證計畫。

## QC 檢查項

- [x] 文件與 DEV-001 至 DEV-007 架構一致。
- [x] 文件未把 assignee 寫成權限條件。
- [x] 文件明確排除 scope 外項目。
- [x] 文件足以支援後續 RD/QA/QC 判斷。

## 相依任務

DEV-001 至 DEV-007。

## 風險與注意事項

- 後續若新增 Guest 或 Task-level permission，必須先更新本規格與 RLS 設計，不能只改 UI。

## 變更紀錄

- 2026-05-27：建立 task。
- 2026-05-27：RD 建立 `.ai-docs/ontology-collaboration-model.md` 與 `.ai-docs/ontology-trello-collaboration-spec.md`，QA/QC 以文件一致性、`npx.cmd tsc --noEmit`、`npm.cmd run lint` 驗證通過。
