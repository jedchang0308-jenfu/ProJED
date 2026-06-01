# ProJED Dev Task

---

## 進度總覽

- [x] DEV-001: 四模式一致化緊湊 UI 系統

## DEV-001: 四模式一致化緊湊 UI 系統

狀態：Done  
優先級：P1  
負責角色：RD 開發，QA 驗證計畫，QC 事實驗證  
建立日期：2026-06-01  
規格文件：`ai-doc/specs/SPEC-001-unified-compact-ui-system.md`

## 任務背景

清單、看板、甘特圖、月曆四個模式目前承載相同任務資料，但相同定義的文字大小、字體、間距、控制項尺寸、任務資訊密度與底層 UI 模組不一致。使用者切換模式時會感受到視覺跳動與操作節奏不連續。

本任務要建立一套以看板緊湊度為基準的 Compact UI Design System，讓四個模式共用同一套 design token 與共用元件。

## 使用者故事

作為 ProJED 使用者，我希望在清單、看板、甘特圖、月曆間切換時，相同功能與相同資訊看起來一致，讓我能快速掃描任務，不需要重新適應每個模式的 UI 規則。

## 開發範圍

- [x] 建立 compact UI token，涵蓋字體、字級、字重、行高、間距、高度、radius、border、shadow。
- [x] 建立或整理共用 UI 元件：`ModeSwitcher`、`CompactTextButton`、`CompactIconButton`、`TaskMetaBadge`。
- [x] 統一 `ViewToolbar` 與四模式右側控制項。
- [x] 統一主導覽模式切換按鈕樣式。
- [x] 統一清單、看板、甘特圖、月曆中相同語意任務資訊的字級與間距。
- [x] 統一 `SharedTaskSidebar` 的 row height、indent、icon、hover、active 狀態。
- [x] 讓甘特圖 row height、bar height 與側邊清單對齊。
- [x] 讓月曆 weekday header、week row、task lane 與 compact token 對齊。
- [x] 保留看板目前緊湊密度，不讓可見資訊量退化。

## 不在本任務處理

- [ ] 不重構任務資料模型。
- [ ] 不改變拖曳排序、日期推算、依賴關係演算法。
- [ ] 不處理日曆訂閱、權限管理、備份功能。
- [ ] 不修復既有亂碼文案，除非該文案阻塞 build 或畫面驗證。
- [ ] 不建立全新設計框架或導入新 UI 套件。

## RD 執行步驟

### 1. UI 差距盤點

- [x] 搜尋四模式中重複的 toolbar、button、badge、task row、task card、task bar class。
- [x] 列出相同語意元件目前使用的 font-size、font-weight、padding、gap、height。
- [x] 確認哪些樣式可抽為 token，哪些必須保留模式差異。

### 2. 建立 token 與共用元件

- [x] 建立 compact token 來源，建議檔案為 `src/components/ui/compactTokens.ts` 或 CSS variables。
- [x] 建立 `ModeSwitcher`，取代 `MainLayout` 中手寫的四個模式按鈕。
- [x] 建立 `CompactTextButton`，統一「今天」、「跳轉至今天」、「新增任務」等小型文字按鈕。
- [x] 建立 `CompactIconButton`，統一側欄開關、上一月、下一月、undo、redo。
- [x] 建立 `TaskMetaBadge`，統一日期、進度、子任務數與狀態 badge。

### 3. 套用到四個模式

- [x] 清單模式：套用外層 padding、表頭高度、row padding、任務 meta token。
- [x] 看板模式：保留 10px 外距與 4px 任務間距，將任務 meta/badge 改接共用 token。
- [x] 甘特圖模式：統一 toolbar controls、側邊 row height、時間軸 row height、bar height。
- [x] 月曆模式：統一 toolbar controls、weekday header、week row、task lane、側邊 row height。
- [x] 共用側邊任務清單：確認甘特圖與月曆使用同一 row height 與 spacing。

### 4. 移除重複樣式

- [ ] 移除四模式中重複的 toolbar 容器。
- [ ] 移除四模式中重複的 icon button padding。
- [ ] 移除四模式中重複的 text button padding。
- [ ] 避免同一語意在不同檔案繼續使用不同 Tailwind class。

## QA 驗證計畫

### 驗證範圍

- [ ] 清單模式
- [ ] 看板模式
- [ ] 甘特圖模式
- [ ] 月曆模式
- [ ] 主導覽模式切換按鈕
- [ ] `ViewToolbar`
- [ ] `SharedTaskSidebar`
- [ ] 任務 title/meta/badge 顯示

### 使用者關鍵流程

- [ ] 使用者從看板切換到清單，toolbar 與模式切換按鈕不跳動。
- [ ] 使用者從清單切換到甘特圖，任務列與側邊清單視覺密度一致。
- [ ] 使用者從甘特圖切換到月曆，側邊任務清單 row height 不變。
- [ ] 使用者在看板展開子任務，任務 meta 與 badge 與其他模式一致。
- [ ] 使用者在四模式中掃描同一任務，任務標題字級與狀態資訊層級一致。

### FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| toolbar 切換時高度跳動 | 模式仍各自實作 toolbar | 視覺焦點漂移 | DOM 量測 toolbar height | 高 | 強制共用 `ViewToolbar` |
| 任務字級不一致 | 各模式手寫 text class | 使用者重新判讀資訊層級 | 截圖與 computed style 比對 | 高 | token 化 task title/meta |
| 甘特圖 row 與側邊任務列錯位 | row height 常數不同 | 時間軸難以閱讀 | DOM 量測 row/bar top | 高 | 共用 row height token |
| 月曆壓縮後任務條難點擊 | lane height 過小 | 操作性下降 | 手動點擊與 hit area 檢查 | 中 | 保留最小 lane height |
| 看板可見資訊量退化 | token 套用回推放大 spacing | 使用者看到更少任務 | DOM 量測 card height/gap | 高 | 看板密度作為上限基準 |
| Tailwind class 再次分歧 | 沒有共用元件 | 後續維護成本升高 | `rg` 搜尋重複 class | 中 | 建立共用元件並替換 |

### 測試案例

- [x] TC-001：四模式 `ViewToolbar` 高度皆為 48px。
- [x] TC-002：主導覽四個模式按鈕高度、字級、selected 狀態一致。
- [x] TC-003：清單任務列 title 與看板任務 title 使用相同語意字級。
- [x] TC-004：看板任務 meta、清單任務 meta、甘特任務 label、月曆任務 label 使用統一 token 或明確映射。
- [x] TC-005：甘特圖側邊 row height 與時間軸 row height 對齊。
- [x] TC-006：月曆側邊 row height 與甘特圖側邊 row height 一致。
- [x] TC-007：看板畫布左距仍為 10px，欄距仍為 10px。
- [x] TC-008：四模式切換 10 次後，toolbar、mode switcher、主要內容頂部不出現可見跳動。
- [ ] TC-009：桌面 viewport 與窄 viewport 下，按鈕文字不溢出、不重疊。
- [x] TC-010：`npm.cmd run lint -- --quiet` 通過。
- [x] TC-011：`npm.cmd run build` 通過。

### 通過標準

- [x] 四模式相同語意元件使用同一 token 或共用元件。
- [x] DOM 實測符合 spec 中列出的高度與 spacing。
- [x] 四模式切換時，主工具列與模式切換區不跳動。
- [x] 沒有新增 TypeScript、lint、build error。
- [x] 沒有引入無關資料邏輯變更。

### 證據收集方式

- [ ] 截圖：四模式 toolbar 與主要內容頂部。
- [x] DOM 量測：toolbar height、mode button height、task row height、card gap、gantt bar height、calendar week row height。
- [x] 指令輸出：lint、build。
- [x] `git diff --stat`：確認改動集中在 UI token、共用元件與四模式 view。

## QC 驗證項目

- [ ] 讀取 spec 與實作 diff，確認 RD 沒有超出範圍。
- [ ] 操作瀏覽器，逐一切換清單、看板、甘特圖、月曆。
- [ ] 量測四模式 toolbar 高度。
- [ ] 量測模式切換按鈕高度與 selected 樣式。
- [ ] 量測看板畫布 left padding 與欄距。
- [ ] 量測甘特圖 row height、bar height、側邊 row height。
- [ ] 量測月曆 week row height、task lane height、側邊 row height。
- [ ] 量測清單 row height 與 row padding。
- [ ] 執行 lint 與 build。
- [ ] 產出 QC fact report，列出通過、不通過與證據。

## 實作注意事項

- [ ] 保護既有使用者變更，不回復非本任務造成的修改。
- [ ] 不以全域 CSS 暴力覆蓋所有 button，避免破壞 modal、sidebar、dialog。
- [ ] 優先抽共用元件，避免繼續複製 Tailwind class。
- [ ] 保留手機觸控可用性，若桌面緊湊與手機 hit area 衝突，需用 media query 分流。
- [ ] 不修復非本任務文案亂碼，除非造成 build fail。

## 相關規格

- SPEC-001: `ai-doc/specs/SPEC-001-unified-compact-ui-system.md`

## 相關檔案

- `src/components/MainLayout.tsx`
- `src/components/ui/ViewToolbar.tsx`
- `src/components/ui/Button.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/StatusFilterBar.tsx`
- `src/components/BoardView.tsx`
- `src/components/CalendarView.tsx`
- `src/components/GanttView.tsx`
- `src/components/SharedTaskSidebar.tsx`
- `src/components/Wbs/WbsListView.tsx`
- `src/components/Wbs/WbsNodeItem.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/Gantt/GanttHeader.tsx`
- `src/components/Gantt/GanttTaskBar.tsx`
- `src/components/Gantt/utils.ts`

## 進度紀錄

- 2026-06-01：建立 spec 與 dev task，定義四模式一致化緊湊 UI 系統。
- 2026-06-01：完成 DEV-001 開發，新增 compact UI token、共用控制元件與 ModeSwitcher，統一清單、看板、甘特圖、月曆的 toolbar、主要控制項、任務 row/bar/lane 與畫布留白；lint、build 與 in-app browser 四模式切換驗證通過。
- 2026-06-01：依使用者回饋「字體還是長得不一樣」補強美學一致性：全域 UI 字體改為中英混排 system stack，button/input/select/textarea 強制繼承字體，四模式相關 `font-black`、`uppercase`、`tracking-*` 收斂為一致的 `font-semibold` 視覺語氣；lint、build 與四模式 computed font-family 驗證通過。
