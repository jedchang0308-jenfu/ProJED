# ADR-038: 行事曆訂閱採逐看板獨立篩選快照

狀態：Accepted / Human Confirmed / Phase 1-2 Local Implemented / Release Gate Required
日期：2026-07-12
關聯：DEV-045、DEV-037、DEV-039、SPEC-045

## Context

DEV-045 原 v2 使用 `global_filter + board_overrides`，讓每張看板可沿用、改用自訂條件或排除。雖然能減少重複設定，但使用者必須理解全域、繼承與 override，與全域任務工作台「選看板後直接設定」的操作邏輯不同，也增加外部 `.ics` 連結輸出範圍的預測成本。

原 v2 Builder、client normalizer、migration source、Edge matcher與本機 QC 已完成，但 production 尚未套 DEV-037 / DEV-045 migrations，deployed `calendar-feed` 仍是舊 v1 source，read-only evidence 顯示 production v2 rows為 0。因此可在 remote release 前修正產品與資料契約，避免部署即將被取代的模型。

## Options

### A. 逐看板獨立快照，與工作台共用 UI / 語意但隔離 state

- 優點：肌肉記憶一致、沒有隱含繼承、每張看板輸出可直接預測、外部連結較容易稽核。
- 缺點：多看板可能重複設定，需要明確的批次複製工具。

### B. 建立時匯入工作台條件，之後獨立

- 優點：首次設定較快。
- 缺點：使用者可能誤以為兩邊持續同步；工作台 transient state不一定適合作為外部連結預設。

### C. 保留全域 filter與看板 overrides

- 優點：大量看板可藉由 inheritance快速維護。
- 缺點：保留使用者已指出的多層心智負擔，且與工作台操作不一致。

## Decision

採用 Option A。

- Calendar 與 Workbench 共用 `TaskConditionFilterControls` 或等效純條件元件、`TaskFilterState` 語意、predicate與操作順序。
- Calendar / Workbench active state、storage與 persistence完全獨立。
- 每條訂閱保存建立 / 儲存當下的 workspace / board snapshot；每個 board ID持有一份完整、獨立的 filter state與 included狀態。
- 不提供 global fallback、沿用、override或隱藏 inheritance。
- 提供一次性「複製目前看板條件到其他看板」，先顯示目標與覆寫影響；複製後不連動。
- 每張看板的事件日期類型與任務條件一起保存；A 看板可只輸出開始日，B 看板可只輸出到期日。
- 訂閱名稱、整體預覽、外部連結風險與 explicit save仍是 subscription-level。

2026-07-12 批判修訂：原先把日期類型視為整條 `.ics` 的輸出格式，但其實它直接改變單張看板哪些任務與日期會成為事件，屬於 board filter projection。若維持頂層欄位，使用者仍需離開目前看板去理解另一層設定，違反本 ADR 消除繼承與建立肌肉記憶的目的，因此改為逐看板條件。

HCS 決策來源：使用者啟動 `#引導模式` 後以「繼續」採建議 `1A / 2A / 3A`。

## Data and API Consequences

- 新 canonical payload使用 `version: 3`、`v3_scope_type: per_board_filter_snapshot`與 `board_filters`。
- `project_ids`保存完整 snapshot，`board_filters` key set必須完全相同；每個 snapshot保存自己的 `date_types`，且至少一張 board included。
- v3 matching不使用 top-level assignee、`global_filter`或 `board_overrides`；每張 `TaskFilterState.selectedAssigneeIds` 是 canonical assignee condition。
- Preview、service normalizer、DB validator與 Edge matcher都必須依 task `project_id`取得唯一 board filter。
- 現有 `calendar_subscriptions` table與 JSONB column可沿用；不因本決策新增 table或預設 GIN index。

## Permission Consequences

- create / update仍受 subscription owner RLS與當下 board readability限制。
- 選擇他人、未指派或不限 assignee時，逐 board驗證管理能力；權限不能跨 board借用。
- 匿名 token不授予 workspace / board權限；Edge每次 feed request重新依 owner membership限縮。

## Compatibility and Migration

- v1 row維持 read / feed / enable / disable / regenerate token契約。
- v1編輯時依原 scope materialize v3 draft；原頂層 date types複製到每張 board，並保留原 assignee與 status output，不可靜默縮小。
- defensive v2 parser依每張 board materialize effective global / override filter，並把舊頂層 date types複製到各 snapshot；儲存 v3後不保留 inheritance。
- 不做 background row rewrite；只有使用者編輯、預覽並儲存時升級單列。
- 舊 v2 migration / Edge source與 QC保留歷史，但 remote gate frozen；不得部署舊契約。

## Superseded / Amended Documents

- `SPEC-045`：原 v2 global / override內容被 2026-07-12 v3修訂取代。
- `QA-DEV-045`：舊 v2 cases保留為歷史回歸來源，current acceptance改為 v3。
- `QC-DEV-045`：只證明舊 v2 local / preflight事實，不證明 v3。
- `dev_task.md`、`documentation_map.md`：current execution boundary改為 Phase 1/2 local RD；舊 Phase 3 remote path frozen。
- DEV-037：v1 source-scope / permission / feed safety仍有效，並作為 v3 compatibility baseline。
- DEV-039：task filter core與使用者操作語法仍有效，但不共享 active state。

## Consequences

正向：

- 使用者只需理解「選看板、改條件、看預覽」。
- 工作台與 Calendar建立一致肌肉記憶。
- 外部連結的每張看板條件可直接檢查，無 inheritance drift。
- 新看板不會自動擴大既有外部連結。

負向：

- 需重做尚未上線的 v2 Builder與 data / Edge source。
- 舊 v2 automated evidence不能直接計入 v3完成度。
- 多看板維護需 batch copy；複製與 included state必須有明確防呆。

## Release Boundary

本 ADR不授權 migration apply、Edge deploy、Firebase deploy、production smoke、資料修復、merge或 PR。Phase 1/2本機 RD / QA / QC完成後，新的 remote/release流程仍需 `deployment-release-gate`、Level 3 readiness與新的 release型指令。
