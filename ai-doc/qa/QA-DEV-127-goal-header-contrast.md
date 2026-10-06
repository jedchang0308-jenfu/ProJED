# QA-DEV-127：OKR 表格頂部欄深色對比

- 狀態：`Targeted UI Smoke PASS / Production Verified`
- 範圍：Goal／OKR 表格 sticky column header 的深色 surface、白色文字與欄位收合控制可見性。
- 不在範圍：資料、欄位順序、rowSpan、state／store／persistence、planning、DnD、release。
- 驗證環境：`http://localhost:4000/`，Chromium in-app browser，Goal 模式，viewport `928×698`。

## 驗收案例

| ID | 驗收內容 | 結果 | 證據 |
|---|---|---|---|
| V01 | 所有可見 `thead[data-goal-sticky-header] > th` 使用深色 `#0F172A` 背景與白色 `#FFFFFF` 文字 | PASS | 7 個 header computed style：`rgba(15, 23, 42, 0.96)`／`rgba(255, 255, 255, 0.96)` |
| V02 | 欄位收合 glyph 在深色背景上維持可辨識 | PASS | 6 個 glyph：白色系文字、`rgba(255, 255, 255, 0.12)` surface、`rgba(203, 213, 225, 0.58)` border |
| V03 | sticky header、單一 X-scroll 與欄位結構未被破壞 | PASS | header `position: sticky`；scroll owner `overflow-x: auto`，`scrollWidth=1104`、`clientWidth=918`；欄位數維持 7 |
| V04 | 928×698 代表畫面無明顯重疊或錯位 | PASS | localhost Goal screenshot：深色頂部欄、白字與既有斑馬列面正常呈現 |
| V05 | 可見錯誤掃描 | PASS | `role=alert`／`.inline-error` 可見訊息數量 `0` |
| V06 | 建置與變更格式檢查 | PASS | `npm run build:test`、`git diff --check` |

## 結論

本次僅以 Goal-scoped CSS 改善表格欄位標題對比，未改動資料或互動模型。Targeted UI smoke 與 REL-005 canonical release gate 通過。
