# QA-DEV-126：OKR 表格橫向追視

- 狀態：`Targeted UI Smoke PASS / NOT RELEASED`。
- 對應 DEV：[DEV-126](../dev_task.md#dev-126okr-表格橫向追視)。
- 對應規格：[SPEC-121 DEV-126 amendment](../specs/SPEC-121-goal-hierarchy-comparison-grid.md#dev-126-表格橫向追視-amendment)。
- 驗證角色：RD 完成最小實作；本輪以 QC 方式重讀 localhost:4000 的實際畫面與 computed style；不修改產品程式。

## 驗證範圍

只驗證 Goal 表格列面，不驗證資料寫入、hierarchy projector、rowSpan 計算、planning mutation、DnD 或正式 release。

## 驗收案例

| ID | 案例 | 通過標準 |
|---|---|---|
| V01 | visible row parity | 目前可見 `tbody > tr[data-goal-task-row]` 依 DOM 順序交錯 `rgb(255, 255, 255)`／`rgb(243, 246, 250)`。 |
| V02 | fixed／scroll continuity | 同一列的 task cell、planning cell 與 collapsed track computed background 相同；水平捲動後仍維持同一列面。 |
| V03 | rowSpan ownership surface | `td[data-goal-group-span="true"]` 使用起始所屬任務列的 row surface，整個合併區塊不在內部切換奇偶色；左側分隔線沿用 native table divider，額外粗線由 DEV-128 移除。 |
| V04 | hierarchy interaction preservation | `data-goal-hierarchy-scope` active 狀態仍使用既有 parent／descendant tint；不新增泛用 `tr:hover`。 |
| V05 | visual smoke | localhost:4000 目標 viewport 可見斑馬紋，沒有 visible error、水平溢出以外的新重疊、欄位順序改變或 sticky header 破版。 |
| V06 | engineering gates | `npm run build:test` 與 `git diff --check` 通過。 |

## 實測證據（2026-09-18）

- `npm run build:test`：PASS；Vite 2,105 modules build completed。
- `git diff --check`：PASS；無 whitespace error。
- localhost:4000 desktop viewport 1280×800：Goal 表格呈現 108 列；前 40 列的固定任務欄與非 rowSpan 欄位符合 `rgb(255, 255, 255)`／`rgb(243, 246, 250)` 交替，rowSpan owner 則與起始所屬任務列面一致，無 mismatch。
- localhost:4000 desktop viewport 900×800：`data-goal-view="true"` 為 `overflow-x: auto`，`scrollWidth=1104`、`clientWidth=890`；任務名稱欄 computed `position: sticky; left: 0; z-index: 2`。
- rowSpan：3 個 `td[data-goal-group-span="true"]` 均與其起始任務列 computed background 相同；額外 `inset` rail 後續由 DEV-128 移除；無 visible alert。
- 928×698 follow-up visual smoke：`任務目的：local-col-todo` 整個 owner 區塊維持白色；`會議紀錄：qc-card-1` 整個 owner 區塊維持 `#F3F6FA`，未在 covered rows 內切換底色。
- CSS probe：沒有新增 `[data-goal-view="true"] tbody > tr:hover` 泛用規則；本 fixture 沒有 active `data-goal-hierarchy-scope` row，因此既有 hierarchy tint selector 僅做靜態保留檢查。
- 代表畫面：1280×800 screenshot 顯示固定欄、任務目的／會議紀錄合併欄與狀態／日期／工期欄的列面節奏一致。

## 證據邊界

本 QA 證明 local source 與 localhost:4000 的 Goal visual layer；不代表 production、正式 release、真機或跨瀏覽器完整 QC。
