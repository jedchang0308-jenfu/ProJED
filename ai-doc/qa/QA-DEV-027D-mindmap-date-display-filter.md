# QA-DEV-027D: Mind Map Date Display and Filter Integration

日期：2026-06-19
狀態：Shared Kanban Visual Addendum Browser QC Passed
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
| QA-027D-009 | 日期元件共用 | Static + Browser DOM | `MindMapNode` 使用 `TaskDateBadge checklist`；節點內存在 `data-task-date-badge="true"` 與 `data-task-date-visual="borderless"`，不保留自有 amber badge class |
| QA-027D-010 | 日期與標題狀態色 | Browser DOM + rendered visual | 待辦／進行中／完成標題沿用共用 class；未完成逾期日期為橘色，完成任務過期日期維持非逾期中性色 |
| QA-027D-011 | 支援 viewport | Browser geometry + screenshots | 1440×900 與最窄支援寬度 768×844 的 badge 留在 node bbox 內、無 document overflow、無 visible error |
| QA-027D-012 | 看板反向回歸 | DEV-060 browser | 看板 L2／L3+ 截止日單值、無箭頭、三 viewport 對齊與可見錯誤檢查維持通過；驗證 selector 必須限定 board surface |

## UI 驗證要求

- 必須用真實瀏覽器檢查，不接受只看靜態程式碼。
- 日期 badge 不得造成：
  - node 文字裁切
  - connector endpoint 明顯偏移
  - branch spacing 崩壞
  - mobile / desktop visible error
- Browser verifier 應檢查 badge geometry 是否在 node card 內。
- 小於 768px 的心智圖由現行 mobile board-only 契約阻擋；390px 驗證看板回歸，不把不可進入的心智圖冒稱為 mobile visual pass。

## 2026-09-03 最小 FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 心智圖仍全部同色 | 殘留自有 amber badge | 無法辨認一般／逾期 | DOM class + screenshot | P1 | 強制使用 `TaskDateBadge checklist`，驗證 `data-task-overdue` |
| 完成任務仍顯示逾期 | 未傳入 status | 誤判時程風險 | completed past-due fixture | P1 | 驗證 `data-task-overdue="false"` 且無 orange class |
| 任務狀態色不一致 | 心智圖未使用共用 title class | 跨模式語意分裂 | todo／in_progress／completed fixture | P1 | 驗證共用 class 與完成刪除線 |
| badge 擠出節點 | 共用元件尺寸未適配 | 文字／connector 重疊 | 1440／768 bbox | P1 | 保留 mindmap size variables，只覆寫尺寸不覆寫語意色 |
| 看板 verifier 誤抓其他模式 badge | selector 未限制 surface | 假回歸失敗 | DEV-060 browser | P2 | selector 限定 `[data-mobile-pan-surface="board"]` |

## 自動化命令

- `npm.cmd run verify:dev-027d-mindmap-date-display-filter`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`
- `npm.cmd run verify:dev-062-simplified-task-status`
- `npm.cmd run verify:dev-075-mindmap-keyboard-performance`
- `npm.cmd run verify:dev-060-kanban-due-date-browser`

## QC Evidence

QC 已記錄於 `ai-doc/qc/QC-DEV-027D-mindmap-date-display-filter.md`，包含 static、browser、type、lint、build 與 DEV-027B / DEV-027C regression gates。
