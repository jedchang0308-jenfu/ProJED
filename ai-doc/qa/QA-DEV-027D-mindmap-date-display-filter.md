# QA-DEV-027D: Mind Map Date Display and Filter Integration

日期：2026-06-19
狀態：Browser QC Passed
關聯規格：`ai-doc/specs/SPEC-027D-mindmap-date-display-filter.md`

## QA 目標

驗證心智圖日期顯示確實沿用 ProJED 既有 WBS filter，而不是另做一套與 List/Kanban 不一致的篩選邏輯。

## 驗證矩陣

| ID | 驗證項目 | 方法 | 通過標準 |
|---|---|---|---|
| QA-027D-001 | 日期 badge 顯示 | Browser DOM + visual bounds | 節點有 `data-mindmap-node-dates`，且 badge 不超出 node bbox |
| QA-027D-002 | 開始日期開關 | Browser filter reload | `showStartDate=false` 時 `data-start-date=""`，畫面只顯示結束日期 |
| QA-027D-003 | 到期篩選 | Browser filter reload | `dueWithinDays=7` 保留 7 天內結束日，隱藏遠期結束日 |
| QA-027D-004 | 狀態篩選 | Browser filter reload | 關閉 todo 後 todo root 不顯示，completed root 仍顯示 |
| QA-027D-005 | 負責人篩選 | Browser filter reload | 選 local-test-user 後，其他 assignee 任務不顯示 |
| QA-027D-006 | 標籤篩選 wiring | Static verifier | `MindMapView` 使用 `selectedTagIds` 與 `matchesTagFilters` |
| QA-027D-007 | 父子 filter 規則 | Code review + static verifier | `rootNodes` 與 `getChildren` 同時套用 `matchesMindMapFilters` |
| QA-027D-008 | 既有心智圖回歸 | Regression browser gates | DEV-027B / DEV-027C browser verifier must still pass |

## UI 驗證要求

- 必須用真實瀏覽器檢查，不接受只看靜態程式碼。
- 日期 badge 不得造成：
  - node 文字裁切
  - connector endpoint 明顯偏移
  - branch spacing 崩壞
  - mobile / desktop visible error
- Browser verifier 應檢查 badge geometry 是否在 node card 內。

## 自動化命令

- `npm.cmd run verify:dev-027d-mindmap-date-display-filter`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`

## QC Evidence

QC 已記錄於 `ai-doc/qc/QC-DEV-027D-mindmap-date-display-filter.md`，包含 static、browser、type、lint、build 與 DEV-027B / DEV-027C regression gates。
