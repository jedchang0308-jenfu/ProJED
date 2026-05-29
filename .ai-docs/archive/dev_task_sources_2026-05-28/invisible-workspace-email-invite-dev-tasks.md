# Invisible Workspace + Board-first Email Invite Dev Tasks

Last updated: 2026-05-28

## 總進度

- [x] DEV-INV-001：調整看板團隊 UI 模組命名與資訊架構
- [ ] DEV-INV-002：建立 Board-first email invite 資料模型
- [x] DEV-INV-003：實作任意 email 加入看板流程
- [ ] DEV-INV-004：建立邀請接受與 Invisible Workspace 自動補齊流程
- [ ] DEV-INV-005：實作看板角色獨立分配
- [ ] DEV-INV-006：讓指派人名單只連動已加入看板成員
- [ ] DEV-INV-007：補齊邀請、撤回、角色變更 audit/activity logging
- [ ] DEV-INV-008：建立 QC 驗證腳本與手動驗證清單
- [x] DEV-INV-009：文件化 Invisible Workspace 協作規格

## 方案原則

- 使用者體驗以 Board-first 為主：使用者只需要理解「加入看板、看板角色、指派人」。
- Workspace 在 UI 上隱藏，但資料層保留，作為 tenant、RLS、audit、未來多看板管理邊界。
- 加入看板時可輸入任意 email，不要求對方先是 Workspace member。
- 邀請時不選角色，預設角色固定為 `member`。
- 角色調整獨立在「看板角色」模組處理。
- 指派人只代表任務責任，不代表可見權限。
- 第一版不做 Guest、留言、通知、watch、自訂 role permission builder、Task-level private permission。

---

## DEV-INV-001：調整看板團隊 UI 模組命名與資訊架構

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 目標

將目前看板團隊面板調整成符合 Board-first 使用者心智模型的三個模組，避免使用者需要理解 Workspace。

## 範圍

### 包含

- 將 `邀請人` 改為 `加入看板`。
- 將 `角色分配` 改為 `看板角色`。
- 將 `角色權限設定` 改為 `角色權限說明`。
- `角色權限說明` 保持 read-only matrix，不提供自訂權限編輯。
- 面板文案改成以「看板成員」為主，不暴露 Workspace 操作概念。

### 不包含

- 不實作 email invite 後端資料表。
- 不改 RLS policy。
- 不改指派人資料來源。

## 驗收條件

- [x] 看板團隊面板只出現 `加入看板`、`看板角色`、`角色權限說明` 三個模組。
- [x] 使用者不會在主要流程看到「先加入 Workspace」的操作要求。
- [x] `角色權限說明` 明確呈現為說明用途，不像可編輯設定頁。
- [x] viewer 無法操作加入與角色調整，但仍可查看權限說明。

## QC 檢查項

- [x] Owner 開啟面板可看到三個新模組名稱。
- [x] Viewer 開啟面板時加入與角色調整操作為 disabled。
- [x] UI 文案未暗示「必須先成為 Workspace member」。
- [x] 權限矩陣仍能正確顯示 owner/admin/project_manager/member/viewer 能力。

## 相依任務

無

## 風險與注意事項

- 若只改名稱但流程仍要求選 Workspace member，使用者仍會感覺不直覺；此 task 只處理資訊架構，完整體驗需依賴 DEV-INV-003。

## 變更紀錄

- 2026-05-28：建立 task。

---

## DEV-INV-002：建立 Board-first email invite 資料模型

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [ ] 完成

## 目標

建立可支援任意 email 加入看板的邀請資料模型，讓 invite 成為 Board-level action，並保留 Workspace 自動補齊能力。

## 範圍

### 包含

- 新增 `board_invites` Supabase migration。
- 欄位至少包含：
  - `id`
  - `tenant_id`
  - `project_id`
  - `email`
  - `invited_by`
  - `status`
  - `default_role`
  - `token_hash`
  - `expires_at`
  - `accepted_at`
  - `revoked_at`
  - `created_at`
  - `updated_at`
- `status` 支援 `pending`、`accepted`、`revoked`、`expired`。
- `default_role` 第一版固定使用 `member`。
- 建立 RLS policy：只有可管理看板成員者可建立、撤回、查看邀請。
- 同一個 `project_id + email + pending` 不可重複建立有效邀請。

### 不包含

- 不串接實際 email provider。
- 不實作接受邀請頁。
- 不處理通知系統。

## 驗收條件

- [ ] Supabase migration 可重複套用於測試環境。
- [ ] Owner/admin/project_manager 可建立 board invite。
- [ ] Viewer/member 不可建立 board invite。
- [ ] 同一看板同一 email 不會產生多筆 pending invite。
- [x] `default_role` 預設為 `member`。

## QC 檢查項

- [x] migration SQL 通過靜態檢查。
- [ ] RLS smoke 覆蓋 owner/admin/project_manager/member/viewer/非成員。
- [ ] revoked invite 不可被接受。
- [ ] expired invite 不可被接受。
- [ ] service role 可執行必要管理操作。

## 相依任務

DEV-INV-001

## 風險與注意事項

- token 不可明文存入 DB，應存 hash。
- email normalization 需統一小寫與 trim，避免重複邀請。

## 變更紀錄

- 2026-05-28：建立 task。

---

## DEV-INV-003：實作任意 email 加入看板流程

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 目標

讓具備權限的使用者可在 `加入看板` 模組直接輸入任意 email 並建立 pending invite。

## 範圍

### 包含

- `加入看板` 模組改為 email input + invite button。
- 支援輸入不存在於 Workspace 的 email。
- 邀請送出後顯示 pending invite list。
- pending invite list 顯示 email、邀請者、建立時間、狀態。
- 支援 revoke invite。
- local-test backend 支援 pending invites，以利 QC 測試。
- 邀請成功後不立即出現在指派人名單，需 accepted 後才出現。

### 不包含

- 不實作真實 email 發送。
- 不實作接受邀請頁。
- 不在邀請時選角色。

## 驗收條件

- [x] Owner/admin/project_manager 可輸入任意 email 建立 pending invite。
- [x] Viewer/member 無法建立 pending invite。
- [x] 邀請時沒有 role selector。
- [x] pending invite 顯示在 `加入看板` 模組。
- [x] revoke 後邀請狀態改為 `revoked`，不可再接受。
- [x] pending email 不會出現在右鍵指派人二層選單。

## QC 檢查項

- [x] 邀請新 email 成功。
- [x] 邀請已存在帳號 email 成功。
- [x] 空 email、格式錯誤 email 會被阻擋。
- [x] 重複 pending invite 會被阻擋或回傳既有邀請。
- [x] Viewer 操作 UI disabled，後端也拒絕。

## 相依任務

DEV-INV-001、DEV-INV-002

## 風險與注意事項

- 若 pending invite 立刻成為 assignee option，會造成「還沒加入的人可被指派」的語意錯誤。

## 變更紀錄

- 2026-05-28：建立 task。
- 2026-05-28：RD 補 local-test board manage 後端守門；QC 以 Playwright 驗證 invalid email、duplicate pending、viewer disabled，並通過 typecheck/build/lint/static QC。

---

## DEV-INV-004：建立邀請接受與 Invisible Workspace 自動補齊流程

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [ ] 完成

## 目標

接受 board invite 後，自動補齊 Workspace member 與 Board member，讓使用者不需要手動操作 Workspace。

## 範圍

### 包含

- 建立接受 invite 的 service flow。
- invite email 對應既有 auth user 時，直接加入 Workspace 與 Board。
- invite email 尚無帳號時，註冊或登入後可完成接受流程。
- 若 user 尚不是 `tenant_members`，自動加入 tenant，角色使用最低必要 workspace role。
- 建立 `project_members`，role 使用 invite 的 `default_role`，第一版固定 `member`。
- invite accepted 後寫入 `accepted_at`，狀態改為 `accepted`。
- 接受後成員出現在 `看板角色` 與指派人名單。

### 不包含

- 不建立公開註冊產品流程以外的完整 onboarding。
- 不做 guest role。
- 不做跨 tenant invite。

## 驗收條件

- [x] 已存在帳號接受邀請後可進入看板。
- [ ] 不存在帳號完成註冊/登入後可進入看板。
- [ ] 系統自動建立或補齊 `tenant_members`。
- [x] 系統自動建立 `project_members`。
- [x] 預設 Board role 為 `member`。
- [x] accepted invite 不可再次接受。

## QC 檢查項

- [x] existing user invite acceptance。
- [ ] new user invite acceptance。
- [ ] revoked invite acceptance 被拒絕。
- [ ] expired invite acceptance 被拒絕。
- [x] accepted user 出現在看板成員與指派人名單。
- [ ] 非受邀 email 不可接受該 invite。

## 相依任務

DEV-INV-002、DEV-INV-003

## 風險與注意事項

- 若 workspace 自動補齊 role 過高，會擴大權限；第一版應使用最低可行 workspace role。
- 接受邀請需確認 auth email 與 invite email 一致。

## 變更紀錄

- 2026-05-28：建立 task。

---

## DEV-INV-005：實作看板角色獨立分配

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [ ] 完成

## 目標

讓角色調整從邀請流程中分離，集中在 `看板角色` 模組處理。

## 範圍

### 包含

- `看板角色` 顯示 accepted board members。
- 支援調整 `owner`、`admin`、`project_manager`、`member`、`viewer`。
- 支援從看板移除成員。
- owner 保護規則：不可移除最後一位 owner，不可由低權限角色降級 owner。
- 角色變更後同步更新 UI capability。
- local-test backend 支援角色變更與移除。

### 不包含

- 不支援自訂 role。
- 不支援 Task-level permission。
- 不支援 Workspace role 管理 UI。

## 驗收條件

- [x] 邀請流程不需要選角色。
- [x] 角色只能在 `看板角色` 模組調整。
- [x] 角色調整後 UI guard 立即依新角色生效。
- [x] Viewer/member 不可調整看板角色。
- [x] 不可移除或降級最後一位 owner。

## QC 檢查項

- [x] Owner 可調整 member 至 viewer。
- [ ] Project manager 可依 policy 管理允許範圍內的成員。
- [x] Viewer 無法調整任何 role。
- [x] 角色變更後重新整理仍保留。
- [ ] 角色變更寫入 audit log。

## 相依任務

DEV-INV-001、DEV-INV-004

## 風險與注意事項

- 角色 UI guard 只是體驗層，仍需 RLS policy 作為後端保護。

## 變更紀錄

- 2026-05-28：建立 task。

---

## DEV-INV-006：讓指派人名單只連動已加入看板成員

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [ ] 完成

## 目標

確保任務指派名單與看板 accepted members 完全連動，避免 pending invite、Workspace-only member、非看板成員被指派。

## 範圍

### 包含

- 指派人名單來源固定為 current board accepted `project_members`。
- 右鍵選單 `指派人` 二層名單使用同一資料來源。
- Task details modal assignee selector 使用同一資料來源。
- pending invite 不出現在指派名單。
- 被移出看板的成員不再出現在新指派選項。
- 已指派但後來被移出看板時，定義顯示策略：
  - 第一版建議顯示 `已離開成員`，保留歷史 assigneeId，不自動清空。

### 不包含

- 不做多 assignee。
- 不做 collaborator 完整 UI。
- 不做通知。

## 驗收條件

- [x] accepted board member 會出現在右鍵指派名單。
- [x] pending invite 不會出現在右鍵指派名單。
- [x] Workspace-only member 不會出現在右鍵指派名單。
- [x] 被移出看板後不再可被新指派。
- [x] 已離開但曾被指派者有一致顯示策略，不造成空白或 crash。

## QC 檢查項

- [x] 邀請 accepted 前後指派名單變化正確。
- [x] revoke invite 不影響既有 accepted members。
- [x] remove board member 後指派名單更新。
- [x] 重整頁面後指派名單仍正確。
- [ ] Supabase realtime 或資料 reload 後狀態一致。

## 相依任務

DEV-INV-004、DEV-INV-005

## 風險與注意事項

- 若移除成員時自動清空 assignee，可能破壞歷史責任紀錄；第一版建議保留並標示已離開。

## 變更紀錄

- 2026-05-28：建立 task。

---

## DEV-INV-007：補齊邀請、撤回、角色變更 audit/activity logging

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [ ] 完成

## 目標

讓看板成員與角色相關的重要操作可追蹤，支援效率優先下的最低風控。

## 範圍

### 包含

- 建立 invite created audit log。
- 建立 invite revoked audit log。
- 建立 invite accepted audit log。
- 建立 board member role changed audit log。
- 建立 board member removed audit log。
- 一般任務指派仍寫入 activity event。
- audit payload 包含 actor、tenant、project、target email/user、before/after、timestamp。

### 不包含

- 不建立完整 activity feed UI。
- 不建立通知。
- 不建立 comment log。

## 驗收條件

- [x] 邀請建立會寫入 audit log。
- [x] 邀請撤回會寫入 audit log。
- [x] 邀請接受會寫入 audit log。
- [x] 角色變更會寫入 audit log。
- [x] 任務指派會寫入 activity event。
- [x] log 失敗不應中斷主要操作，但需要可觀測錯誤。

## QC 檢查項

- [ ] Owner invite log 正確。
- [ ] Viewer invite 被拒絕且不可寫入成功 log。
- [ ] Role change before/after 正確。
- [ ] Remove member target 正確。
- [x] Activity event 與 audit log 分流正確。

## 相依任務

DEV-INV-002、DEV-INV-003、DEV-INV-005、DEV-INV-006

## 風險與注意事項

- 權限操作應進 audit log，不應只寫 activity event。

## 變更紀錄

- 2026-05-28：建立 task。
- 2026-05-28：RD 補 invite created/revoked/accepted audit hooks 與 activity/audit 分流；QA/QC 以 typecheck、build、lint、static QC 驗證，DB smoke 因 local Supabase 未啟動保留未完成。

---

## DEV-INV-008：建立 QC 驗證腳本與手動驗證清單

## 進度

- [ ] 待辦
- [ ] 進行中
- [ ] 待驗證
- [ ] 完成

## 目標

建立可重複驗證 Board-first invite、Invisible Workspace、角色、指派名單與 RLS 的 QC 方法。

## 範圍

### 包含

- 更新或新增 `verify:ontology-collaboration` 檢查項。
- 增加 local-test fixture：
  - owner
  - admin
  - project_manager
  - member
  - viewer
  - invited pending email
  - accepted invite user
  - workspace-only user
  - non-member user
- 增加 Supabase DB smoke 測試項。
- 增加 Browser 手動測試清單。
- 檢查 UI guard、RLS、指派同步、audit/activity logging。

### 不包含

- 不建立完整 CI E2E pipeline。
- 不建立 email provider integration test。

## 驗收條件

- [x] QC 可重複驗證 owner/admin/project_manager/member/viewer/非成員。
- [x] QC 可驗證 pending invite 不進指派名單。
- [x] QC 可驗證 accepted invite 進指派名單。
- [x] QC 可驗證 viewer UI disabled 且後端拒絕。
- [x] QC 可驗證 audit/activity log。

## QC 檢查項

- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 無 error。
- [x] `npm.cmd run build:test` 通過。
- [x] `npm.cmd run verify:ontology-collaboration` 通過。
- [ ] Supabase DB smoke 在有 service role key 時通過。
- [x] Browser owner flow 通過。
- [x] Browser viewer flow 通過。

## 相依任務

DEV-INV-001 至 DEV-INV-007

## 風險與注意事項

- 若沒有 Supabase service role key，DB smoke 只能列為 pending，不可宣稱 production RLS 已完整驗證。

## 變更紀錄

- 2026-05-28：建立 task。
- 2026-05-28：RD 擴充 `verify:ontology-collaboration` 靜態與 DB smoke 測項；QA/QC 通過 typecheck、build、lint、static QC、browser owner/viewer flow，Supabase DB smoke 因 local Supabase 未啟動保留 pending。

---

## DEV-INV-009：文件化 Invisible Workspace 協作規格

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 目標

文件化 ProJED 的 Board-first collaboration 規格，讓後續 RD/QA/QC 能判斷功能是否偏離架構。

## 範圍

### 包含

- 說明為何 UI 隱藏 Workspace 但資料層保留 Workspace。
- 說明 Board-first email invite 流程。
- 說明 invite、member、role、assignee 的語意邊界。
- 說明與 Trello 的相同與不同。
- 說明第一版不做 Guest、留言、通知、watch、Task-level private permission、自訂角色權限。
- 更新 `.ai-docs/ontology-trello-collaboration-spec.md` 或新增專門規格文件。

### 不包含

- 不撰寫一般使用者教學。
- 不撰寫完整 API reference。

## 驗收條件

- [x] RD 可依文件判斷 invite/member/role/assignee 邊界。
- [x] QA 可依文件制定驗證計畫。
- [x] QC 可依文件判定功能是否符合 Board-first 原則。
- [x] 文件明確寫出 Workspace 是 invisible data boundary，不是主要 UI 概念。

## QC 檢查項

- [x] 文件與實作 UI 名稱一致。
- [x] 文件與 RLS/資料表命名一致。
- [x] 文件與指派人名單規則一致。
- [x] 文件有列出明確不做項目。

## 相依任務

DEV-INV-001 至 DEV-INV-008

## 風險與注意事項

- 若文件仍使用「邀請 Workspace member 到 Board」作為主流程，會與新產品方向衝突。

## 變更紀錄

- 2026-05-28：建立 task。
- 2026-05-28：RD 更新 ontology collaboration/model 規格，補齊 Board-first invite、Invisible Workspace、`board_invites`/`accept_board_invite`、assignee 不授權、audit/activity 分流；QA/QC 以 rg、typecheck、lint、static QC 驗證通過。

---

## 目前阻塞

- 2026-05-28：Supabase DB/RLS smoke 無法執行。本機 `npx.cmd supabase migration list --local` 連線 `127.0.0.1:54322` 被拒，`npx.cmd supabase status` 與 `docker version` 均顯示 Docker Desktop Linux engine pipe 不存在。剩餘 DEV-002/004/005/006/007/008 未勾選項需 local Supabase 或明確測試 Supabase project service role 才能驗證。
