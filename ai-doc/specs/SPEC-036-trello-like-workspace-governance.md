# SPEC-036: Trello-like Workspace Governance

關聯 DEV：DEV-036
關聯 ADR：`ai-doc/decisions/ADR-036-trello-like-workspace-governance.md`
任務類型：Workspace UX / Authorization model / Long-term architecture
狀態：Implemented / Local Automated QC Passed / DB unchanged
優先級：P1
建立日期：2026-06-29

## 背景

使用者決定 ProJED 工作區模型改為更接近 Trello：Workspace 是看板的容器，可代表 group、company、department、team 或大型協作範圍；Board 是實際專案與任務執行單位。

本 SPEC 取代先前「只顯示我的工作區 / 共用工作區兩項」的方向。新的產品原則是：

> Workspace 可新增、可管理、可承載多張 Board；「我的 / 共用」只作為輔助篩選或資訊分層，不是固定資料容器。

2026-06-29 HCS 引導決策已採用：

- `1A`：新增 Workspace 入口放在 Sidebar 的「工作區選單」標題列右側，以 `+` icon button 呈現，tooltip 為 `新增工作區`。
- `2A`：新增 Workspace 採 backend-success-first；後端成功前不可把 Workspace 寫入前端 store 或 localStorage。
- `3A`：第一次登入只自動建立一個 `我的工作區` 作為起點，但使用者後續可建立多個 Workspace。

## 問題定義

目前 ProJED 已有 Workspace / Board 兩層資料模型，但 UI 缺少完整的 Workspace 建立與治理入口。若只保留固定兩個 Workspace，短期會降低使用者理解成本，但長期會讓公司、部門、外部協作、ISO/PDM、客戶專案與稽核邊界混在同一層。

真正要解決的是：

- 使用者能直覺建立與切換多個 Workspace。
- 使用者理解 Workspace 是多張 Board 的治理容器，而 Board 是具體專案工作面。
- Board 分享仍保持 Trello-like，不要求使用者進入複雜 Workspace 權限矩陣。
- 跨 Workspace 移動 Board 維持 DEV-025 受控搬移，不變成自由拖拉。

## End-State Architecture

### 資料模型

- `tenants` 保持作為 Workspace。
- `projects` 保持作為 Board。
- `tenant_members` 作為 Workspace member / admin / owner 邊界。
- `project_members` 作為 Board visibility and write boundary。
- Board 必須屬於單一 Workspace。
- 一般使用者可建立 Workspace；Workspace owner/admin 可管理 Workspace 名稱、成員、刪除與 Board 收納。

### UX 模型

- Sidebar 以 Workspace 為一級容器，Workspace 下列出 Boards。
- Workspace header 提供：
  - 新增 Workspace：Sidebar 工作區選單標題列右側 `+` icon button，tooltip `新增工作區`
  - Workspace menu
  - Rename Workspace
  - Delete Workspace
  - Workspace settings
- Board row / card 提供：
  - 開啟 Board
  - 分享 Board
  - Rename Board
  - Move to Workspace
- Home / Workspace overview 顯示多個 Workspace 與其 Boards，而不是把全部 Board 攤平成單一「我的工作區」頁。

### 權限模型

- Workspace owner/admin 具備 Workspace 管理權。
- Workspace owner/admin 可繼承 Board 管理能力。
- Board owner/admin/project_manager 可管理 Board 層級分享與成員，但不等於可管理整個 Workspace。
- Board guest-like access 以 `project_members` 控制 Board 可見性；現有 schema 仍需要 `tenant_members` 作為 tenant identity anchor，但不得因此讓該使用者自動看到 Workspace 內所有 Boards。

### 不可妥協規則

- 不把 Workspace 壓扁成只有兩筆固定資料。
- 不把 Board sharing 等同於 Board moving。
- 不把 Workspace delete 做成無提示高風險操作；沿用 DEV-035 後端成功後才 UI 成功。
- 不讓非管理者任意移動 Board 到其他 Workspace。
- 不讓 Board 移動造成 project_id 變更、RAG 權限外洩或 audit 斷鏈。

## Phase Roadmap

### Phase 0：PM / Architecture Alignment

狀態：本文件建立即完成。

輸出：
- ADR-036
- SPEC-036
- QA-DEV-036
- dev_task / documentation_map 更新

不做：
- 不改 UI
- 不改資料庫
- 不改 production

### Phase 1：Workspace Create / Navigation MVP

狀態：已實作並通過本機自動化 QC（2026-06-29）。

目標：讓使用者可建立多個 Workspace，並在 Sidebar / Home 中清楚切換。

範圍：
- Sidebar 工作區選單標題列右側新增 `+` icon button，tooltip `新增工作區`。
- 點擊後開啟新增 Workspace dialog；dialog 至少包含 `工作區名稱` input、`建立` primary action、`取消` secondary action。
- `工作區名稱` trim 後不可為空；空白時 `建立` disabled，或送出時以 inline error 阻擋。
- 新增 Workspace 採 backend-success-first：後端建立成功並回傳 workspace id 後，才更新 Zustand store、切換 active workspace、寫入 localStorage。
- 建立中需避免 double submit；失敗時顯示 toast / visible error，且不得新增 local-only Workspace。
- 建立成功後切換到新 Workspace，並顯示該 Workspace 的空狀態與 `建立看板` CTA。
- Home 顯示 Workspace 分組，每個 Workspace 區塊列出其 Boards；不再只是一張全域 Board grid。
- First-run 僅在使用者沒有任何 Workspace 時自動建立 `我的工作區`；此建立流程也必須走 backend-success-first。
- 一般 authenticated user 可建立 Workspace；建立者成為該 Workspace owner。

不做：
- 不重做 Workspace member settings。
- 不改 Board share modal。
- 不改跨 Workspace move RPC。
- 不做跨 Workspace table/calendar overview。
- 不新增 Workspace billing、seat、quota 或付費邏輯。
- 不新增 Supabase migration；沿用既有 `create_tenant_with_owner` / local-test create path。

#### Phase 1 實作契約

入口與導覽：

- Sidebar 的 Workspace 區塊標題列必須同時承載目前「工作區選單」語意與新增入口。
- `+` icon button 必須有 accessible label / title / tooltip：`新增工作區`。
- 建立成功後 active workspace 改為新建 Workspace；active board 清空，除非 RD 明確實作「建立後自動建立第一張 Board」，但本 Phase 不要求自動建立 Board。
- 空 Workspace 狀態的主要 CTA 是 `建立看板`，不是再次建立 Workspace。

狀態與持久化：

- `addWorkspace` 或等效 store action 應回傳 Promise，讓 UI 可 await 成功/失敗。
- 不採 optimistic Workspace create；不得先塞入 temp workspace 再等待後端替換。
- 後端失敗、網路失敗、RLS 失敗或 service exception 時，前端不得留下 ghost workspace。
- localStorage 的 active workspace id 只能在後端成功後寫入。
- reload 後 Workspace 清單以 backend / sync result 為準；localStorage 只保存 active selection，不作為 Workspace 資料來源。

權限最小契約：

- Phase 1 先允許所有 authenticated user 建立 Workspace。
- 建立者 role 為 owner。
- Rename / delete 若在 Phase 1 觸及，仍沿用 owner/admin 管理邊界；不得讓 member/viewer 管理 Workspace。
- Board 分享仍是 Board 層級行為；分享 Board 不會自動搬移 Workspace。

首次登入：

- 若 sync 後沒有任何 Workspace，系統建立 `我的工作區`。
- 若建立 `我的工作區` 失敗，顯示可重試狀態，不建立本機假資料。
- First-run 的 `我的工作區` 只是預設起點，不代表系統限制為個人工作區 / 共同工作區兩類。

### Phase 2：Workspace Settings / Member Governance

目標：補齊 Workspace 層級治理。

範圍：
- Workspace settings view。
- Workspace members list。
- Workspace role labels：owner/admin/project_manager/member/viewer。
- Workspace owner/admin 才能改名、刪除、管理成員。
- 區分 Workspace member 與 Board member。
- 顯示 Board guest-like 成員不等於整個 Workspace 可見。

不做：
- 不新增付費 seat / billing 模型。
- 不做外部組織 directory。

### Phase 3：Board Placement / Move UX Polish

目標：把 DEV-025 受控搬移整合進 Trello-like Workspace 管理流程。

範圍：
- Board context menu / settings 的 `移動到工作區` 入口保留。
- 搬移前 preview 顯示來源/目標 Workspace、成員移除、標籤 remap、RAG 重同步、audit 影響。
- 搬移成功後 Board 出現在目標 Workspace，原 project_id 不變。

不做：
- 不支援自由拖拉跨 Workspace。
- 不支援複製式搬移。

### Phase 4：Workspace Overview

目標：提供 Trello-like 的 Workspace 層級總覽能力。

範圍：
- Workspace board list / cards。
- 跨 Board 到期項目、Calendar / Table overview 的規劃。
- Workspace-scoped activity / records / RAG scope 的長期規劃。

不做：
- 本階段前不承諾 ERP / PLM 整合。
- 不把所有 Workspace 的全部資料預載到前端。

## Fixed Decisions

- 採 Trello-like Workspace 模型。
- 使用者可建立多個 Workspace。
- 不限制為「我的工作區 / 共用工作區」兩筆固定資料。
- Board sharing 不會自動搬移 Workspace。
- 跨 Workspace move 沿用受控搬移。
- Sidebar 工作區選單標題列右側放 `新增工作區` icon button。
- Workspace create 採 backend-success-first，不採 optimistic UI。
- First-run 預設 Workspace 名稱固定為 `我的工作區`。
- Authenticated user 可建立 Workspace，建立者為 owner。
- Home 以 Workspace 分組呈現 Boards。

## Deferred Decisions

- 是否保留「我的 / 共用」作為 Sidebar filter。
- Workspace guest-like access 是否需新增更明確的資料標記。
- Workspace overview 的 table/calendar scope。
- 是否需要 Workspace archive / recycle bin。

## RD 驗收標準

Phase 1 完成時：

- 使用者可從 Sidebar 建立 Workspace。
- Sidebar `新增工作區` 入口位於工作區選單標題列右側，具備 tooltip / accessible label。
- 建立 Workspace 失敗時不會留下 local-only ghost workspace。
- 新 Workspace reload 後仍存在。
- 使用者可在 Workspace 下建立 Board。
- 第一次登入只自動建立 `我的工作區`，且後續仍可建立第二個以上 Workspace。
- Home 以 Workspace 分組呈現 Board；空 Workspace 顯示 `建立看板` CTA。
- Sidebar / Home 不再暗示系統只有兩個 Workspace。
- 既有 Board share、Workspace delete、Board move 不回歸。
- TypeScript、build、static verifier、browser verifier 通過。

## Phase 1 實作結果

- Sidebar「工作區選單」標題列右側新增 `+` icon button，具備 `新增工作區` title / accessible label。
- 新增 Workspace dialog 支援名稱輸入、空白 disabled、建立中 disabled、成功 toast、失敗 inline error / toast。
- `addWorkspace` 改為 Promise contract，採 backend-success-first；後端成功後才更新 Zustand store、active workspace、active board 與 localStorage。
- First-run 自動建立 `我的工作區` 走相同 Promise flow；失敗會 toast，不建立本機假 workspace。
- Home 改為 Workspace 分組呈現 Boards，空 Workspace 顯示 `建立看板` CTA。
- local-test seed 已修正為可恢復 `home` view 且尊重空 active board，避免新增空 Workspace 後 reload 被帶回基準 board。
- 本 Phase 未變更 Supabase schema / RLS / migration / billing。

## 驗證計畫

主要驗證計畫在 `ai-doc/qa/QA-DEV-036-trello-like-workspace-governance.md`。

Phase 1 RD exit gate 建議：

```powershell
npm.cmd run verify:dev-036-trello-like-workspace-governance
npm.cmd run verify:dev-036-trello-like-workspace-governance-browser
npm.cmd run verify:dev-035-workspace-delete-persistence-fix
npm.cmd run verify:dev-035-workspace-delete-browser
npm.cmd run verify:dev-030-sidebar-rename-contract
npm.cmd run verify:dev-030-sidebar-rename-contract-browser
npm.cmd run verify:dev-025-project-workspace-transfer
npm.cmd run verify:dev-026-trello-like-board-share-ui
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```
