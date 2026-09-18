# QA-DEV-128：OKR rowSpan 左側分隔線降噪

- 狀態：`Targeted UI Smoke PASS / NOT RELEASED`
- 範圍：Goal／OKR 表格任務目的與會議紀錄 rowSpan owner cell 的左側邊框權重。
- 不在範圍：rowSpan 計算、資料、列面、欄位順序、sticky header、state／store／persistence、planning、DnD、release。
- 驗證環境：`http://localhost:4000/`，Chromium in-app browser，Goal 模式，viewport `719×698`。

## 驗收案例

| ID | 驗收內容 | 結果 | 證據 |
|---|---|---|---|
| V01 | rowSpan owner cell 不再有額外加粗左側線 | PASS | 3 個 `td[data-goal-group-span="true"]` computed `boxShadow: none`；`border-left` 維持 `0px`，native `border-right` 維持 `0.8px` |
| V02 | 斑馬列面與 rowSpan owner surface 不變 | PASS | 任務目的／會議紀錄 owner 仍繼承起始任務列 surface，內容區塊未在 covered rows 內切換色階 |
| V03 | 表格結構與捲動未被破壞 | PASS | 719×698 screenshot 顯示 sticky dark header、固定任務名稱欄與既有單一水平捲軸；未新增第二捲軸或欄位變形 |
| V04 | 可見錯誤與重疊掃描 | PASS | 可見 `role=alert`／`.inline-error` 數量 `0`；畫面無新增重疊或文字截斷 |
| V05 | 建置與變更格式檢查 | PASS | `npm run build:test`、`git diff --check` |

## 結論

本次僅移除 Goal rowSpan owner cell 的額外 2px inset 左側線，沿用 native table divider；Targeted UI smoke 通過，未執行 release／deploy，維持 `NOT RELEASED`。
