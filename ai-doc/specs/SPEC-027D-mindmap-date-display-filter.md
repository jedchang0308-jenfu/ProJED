# SPEC-027D: Mind Map Date Display and Filter Integration

日期：2026-06-19
狀態：Implemented / Shared Kanban Visual Addendum Browser QC Passed
關聯 DEV：DEV-027 / DEV-027B / DEV-027C
優先級：P1 planning UX parity

## 背景

使用者要求心智圖模式增加日期顯示，且必須可以被既有過濾器控制。此需求沿用 ProJED WBS 現有資料與篩選規則，不新增心智圖專用 filter state。

## 範圍

- 心智圖任務節點顯示日期 badge。
- 開始日期顯示受既有 `showStartDate` 控制。
- 結束日期只要存在即顯示。
- 日期格式沿用 compact current-year rule：
  - 同年：`MM/DD`
  - 不同年：`YY/MM/DD`
- 心智圖 root 與 child traversal 必須套用既有 filter：
  - `statusFilters`
  - `dueWithinDays`
  - `selectedAssigneeIds`
  - `selectedTagIds`
- Filter 行為與現有 WBS 一致：
  - 任務本身不符合 filter 即不顯示。
  - 父任務被 filter 隱藏時，其子任務也不顯示。

## 非範圍

- 不新增獨立的心智圖日期 filter。
- 不改變日期編輯方式。
- 不改變 note relationship line 行為；若 endpoint 被 filter 隱藏，只影響畫面顯示，不刪除資料。
- 不調整 `projed-last-view` 的 mindmap 還原清單。

## UI Contract

- 任務節點日期區必須有 `data-mindmap-node-dates`。
- 日期 metadata：
  - `data-start-date`
  - `data-end-date`
- 日期 badge 必須位於 node card 內，不得外溢、重疊 connector、造成 branch 高度異常。
- 左側 branch 日期內容右對齊，右側 branch 日期內容左對齊，以維持 Xmind-like 閱讀方向。

### 2026-09-03 共用看板視覺增補

- 心智圖日期不得維護獨立色票或自行複製日期格式；必須直接使用看板既有 `TaskDateBadge` 的 `checklist` surface。
- 日期視覺沿用共用規則：一般日期為中性灰；今日到期與衍生逾期為橘色警示；完成任務即使截止日已過也不得顯示逾期。
- 日期依賴鎖定與工期鎖定沿用 `TaskDateBadge` 的非顏色辨識方式；依賴鎖定狀態由既有 `getNodeLockStatus` 計算，不在 `TaskNode` 新增衍生欄位。
- 心智圖任務標題直接使用共用 `taskStatusTitleClass`：待辦深灰、進行中品牌藍、暫緩／完成淺灰，完成保留刪除線。
- 保留既有 `showStartDate`、`data-mindmap-node-dates`、`data-start-date` 與 `data-end-date` 契約；本增補不把看板的「只顯示截止日」規則套到心智圖。
- 心智圖現行只支援寬度至少 768px 的介面；小於 768px 由既有 mobile board-only 契約切回看板，不在本增補改變該政策。

## Implementation Notes

- `MindMapView` 使用 `useBoardStore` / `useTagStore` 讀取既有 filter state。
- `MindMapView` 使用既有 helper：
  - `matchesDueDateFilter`
  - `matchesAssigneeFilter`
  - `matchesTagFilters`
- `MindMapNode` 接收 `showStartDate`，只負責日期 display，不自行決定 filter visibility。

## Exit Gate

- `npm.cmd run verify:dev-027d-mindmap-date-display-filter`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`
- DEV-027B / DEV-027C browser regression gates

2026-09-03 增補另需：

- `npm.cmd run verify:dev-062-simplified-task-status`
- `npm.cmd run verify:dev-075-mindmap-keyboard-performance`
- `npm.cmd run verify:dev-060-kanban-due-date-browser`
- 1440×900 與 768×844 心智圖 rendered evidence，含 badge containment、頁面水平溢出與 visible-error sweep。

Spec Impact：相對原本心智圖自有琥珀色 badge 為使用者明確要求的 `Compatible exception`；資料、篩選、日期格式、互動與 mobile board-only 契約沒有漂移。
