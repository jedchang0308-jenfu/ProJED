# SPEC-001: 四模式一致化緊湊 UI 系統

## 背景

ProJED 目前有四個主要工作模式：清單、看板、甘特圖、月曆。這四個模式承載相同的任務資料與相同的專案管理語意，但 UI 的文字大小、字重、間距、控制元件尺寸、任務呈現密度與底層元件來源不一致。

使用者在模式切換時會感受到視覺節奏跳動，包含工具列高度、模式切換按鈕、任務列高度、任務卡密度、側邊任務清單與日期/狀態/進度資訊的呈現不一致。此問題會增加認知負荷，使使用者需要重新適應每個模式的資訊層級。

## 目標

- 建立一套「緊湊模式」UI design token，作為四個模式的共同基準。
- 統一相同語意元件的字體、字級、字重、line-height、padding、gap、radius、border、shadow 與互動狀態。
- 抽出共用底層元件，避免四個模式各自維護重複樣式。
- 保留四個模式各自的資訊結構差異，但讓切換時的視覺密度與操作節奏一致。
- 不降低目前看板模式的資訊密度。

## 非目標

- 不重新設計產品資訊架構。
- 不改變任務資料模型、排序、拖曳規則或日期計算規則。
- 不新增大型 UI framework。
- 不用大幅放大字體或降低資訊密度。
- 不處理與本任務無關的亂碼文字、資料同步、權限或日曆訂閱邏輯。

## 使用者故事

身為 ProJED 使用者，我希望在清單、看板、甘特圖、月曆之間切換時，相同功能看起來與操作起來一致，讓我不需要重新判讀每個模式的 UI 規則，並能在同一個畫面看到盡可能多的任務資訊。

## 設計原則

1. 相同語意必須相同樣式  
   例如模式切換按鈕、工具列按鈕、任務標題、任務 meta、狀態 badge、日期 badge、進度資訊，在四個模式中應共用同一套 token。

2. 模式差異只存在於資料視覺化方式  
   清單是樹狀表格，看板是欄位卡片，甘特圖是時間軸，月曆是週列排程。差異應只在主視覺結構，不應在 toolbar、控制項、文字層級與 spacing 規則上擴散。

3. 以看板緊湊度為密度基準  
   目前看板的基準為外層水平 10px、垂直 6px、任務卡內層 8px/2px、任務間距 4px。其他模式需轉譯為同等資訊密度。

4. 先 token 化，再套用  
   不再讓各模式直接手寫分散的 Tailwind spacing class。優先建立可重用常數與共用元件。

5. 文字大小不因模式切換而改變  
   相同語意文字在四模式中使用同一 font-size、font-weight、line-height。

## Design Token

### 字體

| Token | 值 | 用途 |
|---|---:|---|
| `font.family.app` | `system-ui`, `Segoe UI`, `Microsoft JhengHei`, `PingFang TC`, `Noto Sans TC`, Arial, sans-serif | 全站中英混排 UI 字體 |
| `font.inherit.controls` | `button`, `input`, `select`, `textarea` inherit | 控制項不得使用瀏覽器預設字體 |
| `font.weight.control` | 600 | toolbar、模式切換、filter、compact button |
| `font.weight.task.title` | 600 | 清單、看板、甘特圖、月曆任務主標題 |
| `font.letter.spacing` | 0 | 四模式任務與控制項不使用 tracking/uppercase 製造字型差異 |
| `font.size.mode` | 12px | 模式切換按鈕文字 |
| `font.size.toolbar` | 12px | 工具列控制文字 |
| `font.size.task.title` | 14px | 任務主標題 |
| `font.size.task.meta` | 10px | 任務日期、進度、子任務數 |
| `font.size.sidebar.item.level0` | 13px | 側邊任務清單第一層 |
| `font.size.sidebar.item.level1` | 11px | 側邊任務清單第二層 |
| `font.size.sidebar.item.level2` | 10px | 側邊任務清單第三層以上 |

### 間距

| Token | 值 | 用途 |
|---|---:|---|
| `space.shell.x` | 10px | 模式內容區左右外距 |
| `space.shell.y` | 6px | 模式內容區上下外距 |
| `space.section.gap` | 10px | 同層容器間距 |
| `space.control.gap` | 4px | 控制項內 icon/text 間距 |
| `space.control.group` | 8px | 控制項群組內距 |
| `space.task.gap` | 4px | 任務卡、任務列、任務條間距 |
| `space.task.padding.x` | 8px | 任務內容水平內距 |
| `space.task.padding.y` | 2px | 任務內容垂直內距 |

### 尺寸

| Token | 值 | 用途 |
|---|---:|---|
| `size.toolbar.height` | 48px | 四模式 ViewToolbar |
| `size.control.sm.height` | 30px | 工具列文字按鈕 |
| `size.iconButton.sm` | 30px | 工具列 icon button |
| `size.task.row.compact` | 24px | 側邊任務列、甘特 row 基準 |
| `size.gantt.bar.height` | 20px | 甘特任務條 |
| `size.calendar.week.minHeight` | 74px | 月曆週列最小高度 |
| `size.calendar.lane.height` | 18px | 月曆任務 lane |

### 外觀

| Token | 值 | 用途 |
|---|---:|---|
| `radius.control` | 8px | button、filter、segmented control |
| `radius.task` | 8px | 任務卡、任務列 hover surface |
| `border.default` | `border-slate-200` | 一般邊框 |
| `shadow.active` | `shadow-sm` | selected / active 控制項 |

## 共用元件規格

### `ViewToolbar`

用途：四個模式共用的工具列容器。

需求：
- 高度固定 `size.toolbar.height`。
- 左側永遠放 `StatusFilterBar`。
- 右側接收 `rightControls`。
- 水平 padding 使用 `space.shell.x` 或既有設計等效值。
- 不允許各模式重新實作 toolbar 容器。

### `ModeSwitcher`

用途：主導覽列的清單、看板、甘特圖、月曆切換。

需求：
- 四個按鈕使用相同高度、font token、icon size、gap、selected 狀態。
- selected 狀態只使用一套 active style。
- 禁止各按鈕個別調整 padding。

### `CompactTextButton`

用途：今天、跳轉至今天、新增任務等小型工具列按鈕。

需求：
- 高度 `size.control.sm.height`。
- padding `10px 5px` 或 token 等效值。
- icon/text gap `space.control.gap`。

### `CompactIconButton`

用途：上一月、下一月、側欄開關、任務清單開關、undo、redo。

需求：
- 尺寸 `size.iconButton.sm`。
- icon size 14px 或 16px，依語意等級統一。
- hover / active / disabled 狀態一致。

### `TaskMetaBadge`

用途：日期、進度、子任務數、狀態、鎖定提示。

需求：
- 字級 `font.size.task.meta`。
- padding 與 height 固定。
- 同一狀態在四模式中顏色與 border 一致。

### `SharedTaskSidebar`

用途：甘特圖、月曆共用側邊任務列表，也作為其他模式可重用參考。

需求：
- 預設 row height 使用 `size.task.row.compact`。
- row padding、indent、icon size 由 token 控制。
- 不因甘特圖/月曆模式而出現不同 row density。

## 四模式套用規格

### 清單模式

- 外層內容 padding 使用 `space.shell.x` / `space.shell.y`。
- 表頭高度與月曆 weekday header 接近，避免切換時高度跳動。
- 任務列使用 `font.size.task.title`，row padding 使用 `2px 10px`。
- 任務列內 icon、日期、工期、鎖定按鈕使用共用 token。

### 看板模式

- 保留目前緊湊基準。
- 欄位間距與畫布左右 padding 維持 10px。
- 任務卡內距維持 8px / 2px。
- 卡片內 meta、badge、子任務列需改用共用 token。

### 甘特圖模式

- 側邊任務清單 row height 與 `SharedTaskSidebar` 一致。
- 時間軸 row height 與側邊任務列對齊。
- 任務條高度使用 `size.gantt.bar.height`。
- 時間軸 header 高度納入 token，不得與其他 toolbar 重疊或跳動。

### 月曆模式

- 使用共用 `ViewToolbar`。
- 週標頭、週列最小高度、任務 lane 高度由 token 控制。
- 月曆任務條字級與甘特任務條一致。
- 側邊任務清單 row height 與甘特圖一致。

## 驗收標準

- 清單、看板、甘特圖、月曆的工具列高度一致。
- 模式切換按鈕在所有狀態下尺寸與字級一致。
- 四模式中相同語意文字的 font-size、font-weight、line-height 一致。
- 四模式中相同語意 badge 的高度、padding、radius、border style 一致。
- 甘特圖側邊任務列與時間軸任務列垂直對齊。
- 月曆側邊任務列與月曆週列切換時不造成 toolbar 位置跳動。
- 看板緊湊度不退化，畫布左距仍為 10px，欄距仍為 10px。
- 以瀏覽器實測 DOM 量測至少包含：toolbar height、mode button height、task row height、calendar week row height、gantt bar height。
- `npm.cmd run lint -- --quiet` 通過。
- `npm.cmd run build` 通過。

## 風險與對策

| 風險 | 影響 | 對策 |
|---|---|---|
| 直接改 class，未 token 化 | 後續仍會再次分歧 | 先抽共用元件與 token，再套用 |
| 壓縮過度 | 可讀性或可點擊性下降 | 文字大小不變，互動 hit area 不低於目前可用水準 |
| 甘特圖與月曆計算高度受常數影響 | 任務條錯位 | 修改 row/lane 常數後以 DOM 與截圖驗證 |
| 既有亂碼文字干擾 diff | 審查困難 | 不在此任務處理文字修復，只改 UI token 與元件 |
| Tailwind class 分散 | 無法保證一致 | 建立共用元件並移除模式內重複 toolbar/control 實作 |

## 相關檔案

- `src/components/MainLayout.tsx`
- `src/components/ui/ViewToolbar.tsx`
- `src/components/ui/StatusFilterBar.tsx`
- `src/components/ui/Button.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/BoardView.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/WbsListView.tsx`
- `src/components/Wbs/WbsNodeItem.tsx`
- `src/components/GanttView.tsx`
- `src/components/Gantt/GanttHeader.tsx`
- `src/components/Gantt/GanttTaskBar.tsx`
- `src/components/Gantt/utils.ts`
- `src/components/CalendarView.tsx`
- `src/components/SharedTaskSidebar.tsx`

## 開放問題

- 是否要把 token 放在 `src/components/ui/compactTokens.ts`，或放入 Tailwind theme/CSS variables。
- 手機觸控 hit area 是否需要與桌面緊湊模式分流。
- 是否要順手修復既有亂碼文案。此項建議獨立成另一個任務。
