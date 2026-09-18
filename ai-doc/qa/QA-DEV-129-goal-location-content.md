# QA-DEV-129：OKR 定位時任務目的與會議紀錄渲染恢復

- 狀態：`Targeted UI Smoke PASS / Production Verified`
- 範圍：Goal／OKR 表格在 parent location scope 下的任務目的與會議紀錄 owner cell。
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

## 結論

本次僅提高 Goal active content selector 的 CSS specificity，恢復定位時任務目的與會議紀錄的可見渲染與 parent tint；REL-005 canonical CSS readback 與 browser／OAuth release gates 通過。
