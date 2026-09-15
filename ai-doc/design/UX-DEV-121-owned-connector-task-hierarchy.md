# UX-DEV-121｜OKR 可追溯有線任務階層設計稿

- 狀態：R3 Implemented / R11 Compact Geometry + Soft Connector Tone + Active Self Lineage + Active Contrast
- 日期：2026-09-14
- 範圍：OKR 模式固定任務名稱欄的父子階層，以及任務跨欄比對
- 視覺證據：`output/playwright/dev-121-goal-hierarchy-comparison/V01-dev121-tree-normal-1440x900.png`；
  舊 `wired-task-hierarchy.html` 為 R7 歷史設計稿，現行產品 render 由 R8 evidence 取代。

## 已確定且必須保留

- 使用有線樹狀表格表達父子關係。
- 任務名稱固定在資料表左側；其他欄位由同一 X 軸捲動容器移動。
- 任務間不顯示常駐橫向格線。
- 收合箭頭與父子關聯線使用不同位置，不互相重疊。
- 維持原生 table、rowSpan 與內容 owner／covered 語意。

## 差距分析

目前問題不在「有線」方向，而在線段缺少可驗證的任務所有權：長 rail 比任務名稱更醒目、局部線段沒有落在任務列中心、末端沒有清楚停止，使用者因而無法確認線段連到哪個任務。

## UX Intent

- 任務／結果：使用者可沿任一任務的 incoming branch 回溯到直接父任務，並能辨識同層分支何時結束。
- 主物件／主焦點：一列任務；任務名稱欄同時承擔階層辨識與收合入口。
- 預設刪除：沒有 parent、sibling 或 visible-child 所有權的裝飾線段。
- 保留舉證：parent stem、incoming branch 與 ancestor continuation；R8 移除不必要的 row endpoint，讓 branch 直接接文字。
- 非語言修復：列中心接點、固定深度軌道、最後子項終止規則、root 邊界與按需 subtree 高亮。
- 即時定位時，目前任務自己的 parent-owned incoming vertical／branch 與其子樹關係線同步高亮；root 沒有 parent relation 時不新增線段。
- active 線段使用 2px stroke；目前任務與 planning cells 使用明顯 tint，後代使用次級 tint；只有目前任務本身是 rowSpan owner 時 content 同步變色，
  covered descendant 不染 ancestor owner，保留原有 owner／covered 語意並避免任務目的誤歸屬。
- 風險與驗證：深度 0～4、第一／中間／最後 sibling、收合重算、root 邊界、長標題、1024px viewport、鍵盤與 rowSpan。

## 關係線語法

### 1. Parent stem

有可見子任務的父列，從自身列中心向下送出一段垂直線；它必須在父列與第一個可見子列的邊界無縫接合。

### 2. Incoming branch

每個非 root 任務在自身列中心顯示水平 branch，從父層軌道直接接到任務文字。branch 的 Y 座標必須與任務文字垂直中心一致。

### 3. Compact row anchor

不渲染圓點、badge 或額外圖示。每級只位移 `8px`，12px incoming branch 直接抵達文字起點，
以列中心與最後 sibling 終止規則指出歸屬。

### 4. Sibling continuation

- 後方仍有可見 sibling：垂直 rail 穿過本列並繼續向下。
- 本列是最後可見 sibling：垂直 rail 只到本列中心，禁止向下多出尾線。
- 後代列只在該 ancestor 後方仍有 sibling 時顯示 ancestor continuation。

### 5. Root boundary

不同 root 群組由第二個及後續 root 的 `2px` 上邊界分段，不插入 spacer row；任何 hierarchy rail 都不得跨過 root boundary。

### 6. Disclosure placement

收合箭頭固定在任務名稱 cell 左側、樹線之前的 `20px` 操作槽。箭頭只表示 expanded／collapsed；右側不再保留操作槽，connector canvas 只表示父子關係。

## 視覺與互動規格

- 任務列高：`32px`。
- 階層步距：`8px`；lane start `20px`；incoming branch `12px`；root branch `4px`；任務標題取消左側內距。
- 關聯線：`1px`；normal `rgb(148 163 184 / 42%)`、active `rgb(99 102 241 / 76%)`，所有線段使用柔和圓角。
- Row endpoint：不渲染。
- 父任務 hover／focus：只將該 parent 所有的 child stem 與後代 incoming／continuation 改為 indigo；同時對該 subtree 套用極淡底色。
- 任務選取：只對任務實際擁有的列單元格套用單一背景；rowSpan owner cell 維持父任務語意。
- 收合／展開後，所有 connector 必須依 visible projection 重新計算，不保留隱藏任務的 rail。

## 連線所有權

| 線段 | 唯一 owner | 顯示條件 | 終止條件 |
| --- | --- | --- | --- |
| Parent stem | 父任務 | 至少一個可見直接子任務 | 父列底部 |
| Incoming branch | 子任務與其 parent 關係 | 子任務可見 | 子任務文字起點 |
| Sibling continuation | 同一 parent 的 visible sibling group | 後方仍有可見 sibling | 最後可見 sibling 的列中心 |
| Ancestor continuation | ancestor 的 sibling group | ancestor 後方仍有可見 sibling | 該 sibling group 結束 |

## Acceptance Criteria

- [x] 每個非 root 任務都有一條落在本列中心、直接接到文字的 incoming branch，且 endpoint count=0。
- [x] 每個 expanded parent 的 child stem 從父列中心開始，與第一個可見子列無縫接合。
- [x] 每組 sibling 的最後一列下方不存在殘留 rail。
- [x] 任一 ancestor 後方沒有可見 sibling 時，其 continuation 不出現在後代列。
- [x] hierarchy rail 不跨 root boundary。
- [x] 收合任一 parent 後，visible descendants、rowSpan 與 connector 同步重算。
- [x] disclosure arrow 位於 cell 左側、樹線前的 `20px` 操作槽，右端與最左樹線相接但不重疊。
- [x] 父任務 hover／focus 只高亮它擁有的 subtree 關係，不高亮相鄰 sibling group。
- [x] 任務名稱欄固定，其他欄位只有一個 X 軸 scroll owner。
- [x] 814px、1298px 與 1440px viewport 均可辨識深度 0～4、長標題與 rowSpan ownership。
