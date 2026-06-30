# ADR-036: Trello-like Workspace Governance

日期：2026-06-29
狀態：Accepted
關聯 DEV：DEV-036

## 決策

ProJED 採用 Trello-like Workspace 模型：

- Workspace 是多張 Board 的治理容器，可代表公司、部門、團隊、外部協作範圍或大型工作群。
- Board 是實際專案與任務執行單位。
- 一張 Board 必須屬於一個 Workspace。
- 使用者可以建立多個 Workspace，不再限制為固定的「我的工作區」與「共用工作區」兩項。
- 「我的 / 共用」可以作為篩選或輔助分類，但不得取代 Workspace 資料模型。
- Board 分享與 Board 權限仍以看板層級為主；Workspace 則管理治理邊界、成員繼承、管理權與跨 Board 總覽。

2026-06-29 HCS 引導決策補充：

- 新增 Workspace 入口放在 Sidebar「工作區選單」標題列右側，以 `+` icon button 呈現。
- Workspace create 採 backend-success-first；後端成功前不得更新前端 Workspace 清單或 active workspace localStorage。
- First-run 僅自動建立 `我的工作區` 作為第一個 Workspace；此預設不限制使用者後續新增多個 Workspace。
- 一般 authenticated user 可建立 Workspace；建立者成為該 Workspace owner。

## 背景

先前討論曾考慮將使用者 UI 簡化為「我的工作區」與「共同工作區」兩區，並把細部權限集中到看板層。經回顧 ProJED 既有 schema 與 DEV-025/DEV-026 設計後，判斷此方向若落到資料模型，會削弱 Workspace 作為治理容器的能力。

現有資料模型已明確定義：

- `tenants` = Workspaces
- `projects` = Boards
- `tenant_members` = Workspace members
- `project_members` = Board members / Board authorization boundary

因此本決策保留兩層模型，並將產品 UX 對齊 Trello：Workspace 作為 group/company/team container，Board 作為 project/task execution surface。

## HCS 思考習慣

- `#rightproblem`：真正問題不是是否只保留兩個工作區，而是 Workspace 與 Board 各自承擔什麼責任。
- `#systemmapping`：拆分 tenant、project、tenant_members、project_members、RLS、RAG、audit 的責任鏈。
- `#levelsofanalysis`：個人、專案、部門、公司、外部協作是不同治理層級。
- `#systemdynamics`：短期為了簡化而砍掉 Workspace 擴充性，長期會在 ISO、PDM、ERP、外部協作與稽核時反彈成更高複雜度。
- `#constraints`：初期 UI 可以簡化，但資料與權限模型不能被鎖死。
- `#testability`：Workspace create 成功必須以後端持久化為準，reload 後仍存在才算成功。

## 採納理由

- 符合既有 ProJED schema 與 RLS：Workspace 保留 owner/admin 繼承，Board 以 `project_members` 作為可見與寫入邊界。
- 符合 DEV-025 受控跨工作區移動專案的既有設計，不推翻已建立的 preview / move RPC。
- 符合 DEV-026 Trello-like 看板分享體驗：分享入口在 Board；進階權限仍可放在設定頁。
- 長期可支撐公司、部門、ISO、PDM、外部協作、客戶專案與未來 ERP/PLM 整合。

## 明確不採用

- 不採用「資料庫永遠只有我的工作區與共同工作區兩個 Workspace」。
- 不採用「只靠 Board 權限取代 Workspace 成員與治理」。
- 不採用「Board 一被分享就自動搬到共同工作區」。
- 不採用「任意拖拉 Board 跨 Workspace」；跨 Workspace 仍走 DEV-025 受控搬移。

## 影響

- Sidebar / Home / Settings 需重新整理 Workspace 建立與瀏覽 UX。
- First-run onboarding 固定建立 `我的工作區` 作為起點，但不可阻止使用者後續新增 Workspace。
- 新增 Workspace 入口需放在 Sidebar 工作區選單標題列，並走 backend-success-first 狀態契約。
- 「我的 / 共用」若保留，只能是 filter / view，不是固定資料容器。
- QA 需覆蓋 Workspace create/rename/delete、create failure no-ghost、Board create/share/move、Workspace member inheritance、Board guest-like access、RLS 與 reload persistence。
