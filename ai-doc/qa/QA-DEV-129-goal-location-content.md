# QA-DEV-129：OKR 定位時任務目的與會議紀錄渲染恢復

- 狀態：`Targeted UI Smoke PASS / Production Verified`
- 範圍：Goal／OKR 表格在 parent location scope 下的任務目的與會議紀錄 owner cell，以及可見子任務／後代內容 cell。
- 不在範圍：projection、rowSpan 計算、資料、state／store／persistence、欄位順序、planning、DnD、release。
- 驗證環境：`http://localhost:4000/`，Chromium local Goal mode；另以使用者附圖的 719×698 標註場景作需求對照。

## 驗收案例

| ID | 驗收內容 | 結果 | 證據 |
|---|---|---|---|
| V01 | 定位含任務目的的 owner cell，文字仍完整可見 | PASS | `qc-card-2-child-2` active description text 保留 7 行內容，`visibility: visible`，背景為 `rgba(199, 210, 254, 0.94)` |
| V02 | 定位含會議紀錄的 rowSpan owner，quick-note 仍可見 | PASS | `qc-card-3` active meeting owner 保留 2 筆 quick-note，兩筆 `visibility: visible`、`data-goal-content-row-clipped="false"`，背景為 `rgba(199, 210, 254, 0.94)` |
| V03 | rowSpan surface 不覆蓋 active content tint | PASS | `td[data-goal-content-scope="active"]` computed background 讀回 parent tint；selector 明確匹配 `td`，未改 rowSpan 或內容 owner |
| V04 | covered rows 不產生錯誤的目的／會議內容 | PASS | covered cell 維持無獨立 content DOM；owner task id 與 active scope 讀回一致 |
| V05 | 可見錯誤與結構回歸 | PASS | browser readback 無 visible `role=alert`／文字重疊；sticky header、固定任務名稱欄、single X-scroll 未新增第二 scroll owner |
| V06 | 建置與變更格式檢查 | PASS | `npm run build:test`、`git diff --check` |

## Follow-up：可見子任務內容定位渲染（2026-09-21）

本 follow-up 延伸 DEV-129 的定位可見性：父任務定位時，空白子任務的「任務目的／會議紀錄」仍需存在並取得 descendant scope；子任務若有自身目的或 quick-note，文字仍需可見。rowSpan covered cell 仍不得新增 DOM 或複製內容。本機 targeted browser 證據由 `npm run verify:goal-empty-location-browser` 產生，未宣稱重新 production release。

| ID | 驗收內容 | 結果 | 證據 |
|---|---|---|---|
| F01 | 父任務空白目的／會議欄位取得 `active` parent scope | PASS | Chromium 754×698：兩欄 `kind=empty`、scope=`active`、背景 `rgba(199, 210, 254, 0.94)` |
| F02 | 空白子任務目的／會議欄位取得 `descendant` scope | PASS | Chromium 754×698：兩欄 scope=`descendant`、背景回到交錯 row surface（`rgb(255, 255, 255)`／`rgb(243, 246, 250)`）、文字為空 |
| F03 | 有自身內容的子任務保留目的與會議文字 | PASS | Chromium 754×698：目的文字「子任務目的內容。」、會議 quick-note「子任務會議欄位」仍可見 |
| F04 | 不新增 content scroll owner 或 visible error | PASS | target 空白列 content scroll owner=`0`、visible alerts=`0`、page／console／HTTP error=`0` |

## 結論

原 DEV-129 提高 Goal active content selector 的 CSS specificity，恢復定位時任務目的與會議紀錄 owner cell 的可見渲染；本次 follow-up 再補上可見子任務／後代列的 descendant content scope。REL-005 的既有 canonical CSS readback 與 browser／OAuth release gates 保持歷史證據，本 follow-up 僅完成 local targeted validation，未宣稱重新 production release。
