# SPEC-120：OKR 規劃欄極簡高密度介面

- 狀態：`Target Authority / Tech Lead R2 / Implemented / Targeted QA-QC PASS / NOT RELEASED`
- 日期：2026-09-14
- 對應 DEV：DEV-120
- 父交付基線：DEV-116
- 相容開發點：DEV-119
- QA authority：`ai-doc/qa/QA-DEV-120-goal-planning-minimal-density.md`
- 決策來源：`USER-20260914-OKR-PLANNING-COLUMNS-MINIMAL-DENSITY`、
  `USER-20260914-GOAL-TABLE-FROZEN-TASK-NAME-COLUMN`
- 風險：Medium（改變使用者可見表格密度、planning controls 呈現與既有 visual contract）
- 文件成熟度：`Implemented / Targeted QA-QC PASS`
- 架構定案：`已定案`

## DEV-121 階層閱讀 compatible amendment（2026-09-14；架構已定案／未實作）

[SPEC-121](SPEC-121-goal-hierarchy-comparison-grid.md) 在同一 native table 增加 root-group boundary 與
task＋planning row reading guide。它保留 252px frozen task-name first column、single X-scroll owner、
112／64／96／96／60px planning tracks、mounted quiet controls 與 28～30px 一般列密度。
reading guide 不得進入 description／meeting `rowSpan` group cell，也不得遮蔽 focus、validation、locked、
dependency 或 due-today 必要訊號。

## 1. 問題與成功結果

目前 OKR 模式的負責人、狀態、開始日期、結束日期與工期，在每一列都以完整輸入框、膠囊、圖示、
邊框與背景呈現。使用者在閱讀大量任務時，先看到控制項而不是資料；五個規劃欄目前設定寬度合計
580px，並由最高 32px 的常駐控制項決定列高，造成任務名稱、目的與會議紀錄可用空間不足。

成功結果是將 OKR 主畫面改為安靜表格：既有控制持續掛載並直接操作，正常狀態只呈現值，hover／focus／open
時才顯示必要 affordance。五個規劃欄的目標基準寬度由 580px 降為 428px，減少 152px（26.2%）；完整八欄
min-width 基準由 1272px 降為 1120px，減少 12.0%。釋出的寬度由任務目的與會議紀錄承接；兩欄都不存在時由任務名稱承接。

本 DEV 只改 OKR 模式的 presentation 與 interaction trigger，不改 canonical task、權限、日期驗證、
duration semantics、projection、rowSpan、meeting aggregate、DnD、task menu、filter、PWA 或 persistence。

使用者所稱「任務名稱固定成左側欄」專指 OKR 資料表格內的 frozen first column：任務名稱固定在表格
左邊，其他欄位由同一個表格 X 軸捲軸移動檢視；不是 app sidebar、viewport-fixed panel 或第二張同步表格。

## 2. UX Intent

- 任務／結果：熟悉 ProJED 的桌機使用者可在同一畫面快速掃描更多 OKR 任務，仍可直接修改負責人、
  狀態、日期與工期。
- 主物件／主焦點：任務列與任務內容是唯一主焦點；planning controls 是按需操作層。
- 預設刪除：常駐 input border／fill、狀態 pill、未鎖定圖示、每格日曆 icon、planning 欄內垂直格線、
  table 外框、深色高對比 header、重複的單位與提示文字。
- 保留舉證：欄名、值、row separator、sticky header、實際 lock／dependency、權限拒絕與 focus ring；移除後會
  分別造成欄位誤判、跨列誤讀、鎖定原因不明、越權嘗試或鍵盤焦點遺失。
- 非語言修復：以固定 column track、對齊、留白、單一水平分隔線、hover／focus／open state 與必要 icon
  表達結構與可操作性。
- 風險與驗證：正常、空值、locked、read-only、due-today、validation failure、814px 桌機窄版、鍵盤、
  screen-reader name、200% zoom、長名稱與 portal clipping 均須有實際 browser evidence。

使用思考習慣：#真正問題、#使用者視角、#限制條件

## 3. Spec Impact 與權威

### 3.1 Intentional replacement

本規格有意取代 SPEC-116 下列局部 target；DEV-116 的歷史 QA/QC PASS 仍是當時 candidate 事實，不得回寫：

1. `GoalView Render Contract` 的完整 table/cell 外框與所有欄間格線。
2. 所有表頭使用深色不透明底與白字。
3. 負責人 150px、狀態 90px、日期各 130px、工期 80px 的欄寬基準。
4. 負責人、狀態、日期與工期以常駐框體表達可編輯性。
5. DEV-116 verifier 的 V10／V12／V23 中「完整垂直格線、深色表頭」既有 oracle。

### 3.2 Preserved authority

- SPEC-116：OKR 入口、active board scope、canonical primary hierarchy、optional content columns、native table、
  sticky task column/header、rowSpan、records、planning mutation、DnD 與 task menu。
- SPEC-119：description／meeting owner cell、cell editor、expanded keys、GoalCellSessionProvider、failure recovery、
  PWA reload safety 與全系統 scrollbar foundation。
- `useWbsStore` 與既有 handlers：assignee/status/date/duration canonical mutation、Undo、persistence 與 meeting capture。
- `TaskAssignmentPicker`：primary/collaborator selection、portal、permission 與 accessible listbox；本 DEV 只新增 Goal
  使用的 quiet trigger variant，default variant 必須保持等價。

### 3.3 ADR decision

不新增 ADR。這是單一 surface、可逆的呈現與互動契約，沒有改變跨模組資料所有權、公開 API、schema、
權限或狀態機；長期決策由本規格與 SPEC-116 scoped amendment 足以承接。

## 4. Frozen UI Contract

### 4.1 Table skeleton

欄順序保持：`任務名稱`、`任務目的?`、`會議紀錄?`、`負責人`、`狀態`、`開始`、`結束`、`工期/天`。
內容欄是否存在仍由 SPEC-116 projection 決定，不 render 空 header 或空 track。

| 區域 | 寬度基準 | 行為 |
|---|---:|---|
| 任務名稱 | 252px minimum | sticky left；保留階層、標籤、拖曳與 task primary action |
| 任務目的 | 220px minimum，elastic | 存在時優先承接剩餘寬度；SPEC-119 owner cell 不變 |
| 會議紀錄 | 220px minimum，elastic | 存在時優先承接剩餘寬度；meeting aggregate 唯讀 |
| 負責人 | 112px | quiet picker trigger |
| 狀態 | 64px | quiet native select |
| 開始 | 96px | 常駐 native date input；chrome 按狀態顯示 |
| 結束 | 96px | 常駐 native date input；chrome 按狀態顯示 |
| 工期/天 | 60px | 常駐既有 lock button／number input；chrome 按狀態顯示 |

五欄都顯示時 planning tracks 固定合計 428px；沿用 SPEC-116 的 optional start-date 規則時，
`visiblePlanningWidth = 112 + 64 + (showStartDate ? 96 : 0) + 96 + 60`。`table-fixed` 的 `colgroup` 必須只對 task／planning tracks 指定像素寬度；
可見的任務目的與會議紀錄 `<col>` 不指定 width，平均承接 table 剩餘寬度。table `minWidth` 為
`252 + 220 × visibleContentColumnCount + visiblePlanningWidth`；因此每個可見 content track 最少 220px。沒有 optional content
column 時，任務名稱 `<col>` 改為未指定 width，承接扣除 planning tracks 後的全部剩餘寬度，minimum 仍為 252px。
不得以量測後 setState、ResizeObserver、CSS grid 或第二張 table 修正寬度。

### 4.2 Frozen task-name column and X-scroll

- 表格只有一個水平 scroll owner。任務名稱 header/body cells 在該 scroll container 內使用 `position: sticky; left: 0`；
  其他欄位仍屬同一 native table，隨 `scrollLeft` 水平移動。
- 任務名稱不是頁面左側欄、app sidebar、`position: fixed` panel，也不得用兩張 table／同步 scroll／複製 rows 實作。
- 左上任務名稱 header 同時 sticky top/left，z-index 高於其他 sticky headers 與 task-name body cells；task-name
  body cells 高於右側捲動 cells，但低於左上交會 header。
- sticky task-name cells 必須依現有 L0／L1／L2+ row surface 使用不透明背景，避免右側欄位文字從下方穿透。
  右側只保留一條低對比 boundary；不得以常駐 shadow、雙線或厚底色製造第二面板。
- 252px 是 frozen task-name track 的 minimum 及 reference width。長標題維持單行省略與既有完整 task action；
  不因 frozen column 增加第二列、tooltip 教學或獨立詳情入口。
- 水平捲動時，任務名稱欄 left 位置變化不超過 1px；其餘欄位位移必須等於實際 scroll delta（±1px），
  且可完全移到 frozen column 下方，不留下重複文字或 hit target。
- 表格 X 軸 scrollbar 沿用 DEV-119 全系統 3px 基底；不得新增內層 scrollbar 或改成甘特圖 12px 例外。

### 4.3 Density and surfaces

- desktop data row target：28px；header target：30px；必要內容 cell 的 rowSpan／expanded 高度由 SPEC-116／119 控制，
  不強制壓為 28px。
- 字級不得低於 12px；主要任務名稱維持現行 14px。數字使用 tabular figures。
- table 外框移除；資料列保留一條低對比 bottom divider。planning cluster 內不顯示常駐 vertical border；
  任務名稱 sticky boundary 與 content/planning 群組邊界可保留一條低對比分隔。
- header 保持 sticky、不透明、與 body 使用同一 native table tracks；改為淺中性 surface、次要文字與一條 bottom
  divider，不建立 header pill、inner flex container、shadow 或第二層 header。
- L0／L1／L2+ 階層背景與 task title status class 仍由 SPEC-116 現行規則決定；planning control 自身不得再疊加
  常駐白底、灰底或陰影。
- hover 只高亮目前 row 或 control hit area 的其中一層；focus／open 使用單一清楚 outline，不疊加 border＋ring＋shadow。
- touch 不在本 DEV entry scope；390px 仍不得出現 OKR 模式。不得為 touch 擴張 desktop row height。

### 4.4 Value formatting

- 負責人：顯示現有 assignment summary；空值顯示 `未指派` 且降低對比。協作人數仍可顯示，但必須與主摘要
  同行，不新增第二列常駐 icon＋文字。
- 狀態：只顯示 `待辦`、`進行中`、`暫緩`、`完成`。狀態文字是主要訊號；`進行中`可使用既有 accent，
  其他狀態使用中性層級，不使用 filled pill、border 或 shadow。
- 日期：保留 native date control 與既有 ISO `YYYY-MM-DD` value，不另做短年份 formatter。正常狀態隱藏 input
  外框與 calendar indicator；空值以同 cell 的 `—` overlay 顯示，focus 時 overlay 隱藏並顯示原生編輯表面。
  非空值沿用瀏覽器完整日期呈現，避免 `YY/MM/DD` 年份誤判與 display/input 雙格式。
- 工期：欄名承擔單位，每列只顯示整數或 `—`；不得重複 `天`。只有 `isDurationLocked=true` 才顯示 lock；
  unlocked 不顯示 unlock icon。dependency lock 顯示既有 Link 語意，不以 dashed input border 重複表示。
- due-today：移除整格橘色 fill，以日期文字或單一最小 indicator 表達；不得同時使用色塊、icon、文字 badge。

### 4.5 Column interaction

| 欄位 | 常駐控制與正常狀態 | hover／focus／open | mutation |
|---|---|---|---|
| 負責人 | 既有 `TaskAssignmentPicker` button；無框、無 Users icon、協作數同行 | 顯示單一 trigger outline；open 使用既有 portal | 沿用 picker immediate update |
| 狀態 | 既有 native select；只見狀態文字，無 pill／shadow | 顯示單一 focus outline | 沿用現行 `onChange` |
| 開始／結束 | 既有 native date input 始終在 DOM；無框、無常駐 calendar indicator；空值 overlay `—` | indicator／outline 只在 hover 或 focus 顯示 | 沿用現行 date handlers |
| 工期 | 既有 lock button 與 number input 始終在 DOM；unlocked icon 視覺隱藏但 hit target 保留，locked 顯示單一 lock | unlock icon 於 cell hover／button focus 顯示；number input 依既有 lock 規則啟用 | 沿用現行 lock／duration handlers |

本 DEV 不新增 active cell、draft、display/editor mode 或 row-disappearance recovery state。控制項的 focus、Escape、blur、
picker open/close 與 native value 全部沿用現有元件／瀏覽器生命週期；視覺切換只由 CSS pseudo-class、現有 `isOpen`
與 canonical value 決定。這可避免與 SPEC-119 `GoalCellSessionProvider` 形成第二個 cell-session owner。

row primary action／DnD 必須繼續排除 planning button、input、select 與 picker panel。雙擊 planning cell 不得觸發
SPEC-119 content expand/edit，也不得開 Task Details；不得新增全域 recovery notice。

### 4.6 Permission, validation and failure

- `canAssignTask=false`：負責人顯示 read-only value，不 render 假按鈕或可開 portal。
- `canEditTask=false`：status/date/duration 顯示 read-only value；仍保留可存取文字，不只靠 disabled 灰色。
- start/end dependency lock 與 duration lock 仍使用現行 `getNodeLockStatus`、`isEndDateEffectivelyLocked`；不得由
  presentation state 推導第二份 lock truth。
- date hierarchy boundary、start ≤ end、duration requires start、locked duration 推算 end 等規則完整沿用現行 handlers。
- validation failure 不得清掉最後有效值、留下空白假成功或關閉後失去原因；現行 alert 可在本 DEV 保留。
  若 RD 改為就地錯誤，必須只顯示最短原因、focus 回受影響欄位，且不得改變驗證規則或新增全域 error panel。
- persistence／meeting capture failure 由既有 store／notification owner 處理；本 DEV 不建立第二套 saving/error state。

## 5. Architecture and Data Flow

```text
useWbsStore canonical TaskNode + permissions + dependencies
                         |
                         v
                 GoalView / GoalRow
        +----------------+----------------+
        |                                 |
  content cells              mounted planning controls
  SPEC-116/119              Goal-only quiet CSS/variant
        |                                 |
        +----------------+----------------+
                         |
       existing picker / select / date / duration handlers
                         |
                         v
             useWbsStore.updateNode (unchanged)
```

責任方向固定為 canonical store／permissions／dependencies → Goal presenter → existing mutation handlers。不得增加
planning store、context、task command、provider query、schema、migration、localStorage 或跨 view draft owner。

### 5.1 Tech Lead R2 decision

| 決策點 | 定案 | 原因 |
|---|---|---|
| 安靜控制 | 常駐既有 controls，以 CSS／quiet variant 降低 normal-state chrome | 真正問題是視覺權重；新增 display/editor state 不會改善資料能力，反而增加 focus、draft 與 recovery 分支 |
| frozen column | 同一 native table 的 sticky first column | 保留 row／header semantics 與既有事件；split table 會新增 row height、scroll 與 hit-target 同步 |
| 欄寬 | planning fixed；content auto；無 content 時 task auto | 直接使用 `table-fixed` 分配規則，不需要 runtime measurement 或第二份 layout state |
| 日期寬度 | 96px，保留完整 native date | 76px 需要短年份 formatter／editor swap；96px 可維持單一 value 表面並降低年份誤讀 |
| shared component | picker 新增 default-preserving quiet variant；status 保持 Goal-local class | 只在確有共用元件責任時增加 variant，避免 WBS／Details 未授權 visual drift |

Goal-only planning class、width constants 與空日期 overlay 留在 `GoalView.tsx`；不得為這次視覺調整新增 presenter、
hook、context、formatter module 或通用 table framework。

`TaskAssignmentPicker` 可新增 backward-compatible `triggerVariant?: 'default' | 'quiet'`；default 是所有既有 consumer
的現行行為，Goal 明確傳 `quiet` 並沿用現有 `fullSummary` 讓協作數同行。quiet 只改 trigger surface／尺寸／icon
可見性，不改 picker state、portal、selection 或 focus contract。

狀態樣式不得改寫現有 `getTaskStatusSelectClass()` 的全域輸出；Goal 使用獨立 Goal-only quiet class／variant。

## 6. Repo Surface and No-change Zones

| 檔案 | 允許變更／責任 |
|---|---|
| `src/components/GoalView.tsx` | table width allocation、frozen column、header/table chrome、常駐 control quiet styles、空日期 overlay；canonical handlers 不變 |
| `src/components/TaskAssignmentPicker.tsx` | 僅新增 default-preserving quiet trigger variant；Goal 以既有 `fullSummary` 同行呈現協作數；portal/listbox contract 不變 |
| `src/components/ui/taskStatusStyles.ts` | 不改；Goal 組合既有 `taskStatusTitleClass` 與 Goal-only native select base class |
| `scripts/verify-dev-120-goal-planning-minimal-density.ts` | 新 static contract；不得把 source substring 存在當 visual PASS |
| `scripts/verify-dev-120-goal-planning-minimal-density-browser.pw.js` | 正常入口、互動、幾何、visual/a11y、canonical readback 與 visible-error evidence |
| `scripts/verify-dev-116-goal-mode.ts`、`scripts/verify-dev-116-goal-mode-browser.pw.js` | 只更新被本規格明確取代的 V10／V12／V23 oracle；歷史 artifacts 不回填 |
| `package.json` | 只登錄 DEV-120 static/browser commands |

禁止修改：`src/features/goalMode/projection.ts`、GoalCellSessionProvider、TaskDetailNoteEditor、TaskNoteContentSurface、
useWbsStore mutation/persistence、record stores/services、schema/migration、permissions、interaction kernel、DnD placement、
task action catalog／commands、PWA reload owner。若實作被迫觸及任一禁止區，立即停止回送規劃模型。

## 7. Work Packages

| WP | 順序與退出條件 |
|---|---|
| WP-120-A | 凍結 current dirty baseline；新增 DEV-120 failing static/browser contract，確認舊 candidate 因 boxed controls／grid/header oracle 而 Fail |
| WP-120-B | 完成單一 X-scroll owner、frozen task-name column、明確 elastic `<col>`、table/header chrome、fixed planning tracks 與 28px normal row；不得改 canonical handler |
| WP-120-C | 實作 owner quiet variant、status quiet control、mounted date/duration quiet styles、空日期 overlay與 event isolation；不得新增 planning edit state |
| WP-120-D | 更新 DEV-116 被 intentional replacement 的 assertions；執行 DEV-119 content editing、List/WBS picker/status 与 canonical readback regression |
| WP-120-E | freeze candidate；QA 依正常 topbar 入口執行 targeted browser QC、visual comparison、visible-error sweep 與 cleanup evidence |

WP 必須依序執行。WP-120-A 尚未產生真正 failing contract 前不得開始 B；第一個文件／程式 drift、禁止區需求、
驗收不可達、critical fixture=0 或 visible error 立即停止。

## 8. Acceptance Criteria

- AC-120-01：正常狀態 planning cells 不顯示常駐 input border/fill、status pill、unlock icon 或 calendar icon；值仍可讀。
- AC-120-02：五欄基準 tracks 為 112／64／96／96／60px，合計 428px；1298px reference viewport 下，
  可見 content `<col>` 承接多餘寬度，planning tracks 各自誤差不超過 1px。
- AC-120-03：一般單行 task row 高度目標 28px、允許 computed 28～30px；content owner rowSpan／expanded row 不套此上限。
- AC-120-04：header sticky、opaque、淺中性、無 inner container；table/header/body tracks 左右差不超過 1px。
- AC-120-05：table 外框與 planning internal vertical gridlines 為 0；每列 bottom divider 可辨識；task sticky boundary、
  content/planning boundary 與 rowSpan owner boundary 沒有視覺錯配。
- AC-120-06：date input 始終掛載且保有既有 ISO value／handler；空值正常狀態顯示 `—`，focus 後顯示原生編輯表面；不新增短年份 formatter。
- AC-120-07：owner/status/start/end/duration 可由 pointer 與鍵盤直接操作；Goal 沒有新增 planning edit/draft/session state，focus／Escape／blur／portal close 維持既有行為。
- AC-120-08：Goal 修改五種 planning values 後，List 讀到同一 canonical task；no-op、read-only 或 validation failure 不寫入。
- AC-120-09：lock/dependency/due-today 使用單一最小訊號，且去除顏色後仍可由值、icon 或 accessible name 辨識。
- AC-120-10：row click、DnD、右鍵 menu、DEV-119 description edit／expand、meeting scroll、tags與sticky task column 不回歸。
- AC-120-11：814×698、1298×698、1440×900 與 200% zoom 無重疊、浮層裁切、雙重捲動或不可抵達 control；
  390px 維持沒有 OKR entry。
- AC-120-12：browser evidence 無 unexpected role=alert、inline error、HTTP 4xx/5xx、console/page error，critical fixture 非 0。
- AC-120-13：X-scroll 只移動任務名稱以外的欄位；任務名稱 header/body 在表格左邊保持 frozen（left delta ≤1px），
  右側欄位位移等於 scroll delta（±1px），且沒有第二 table、第二水平 scroll owner、背景穿透或錯誤 hit target。

## 9. QA/QC and Evidence Contract

QA cases、FMEA、fixtures、oracles、commands與 evidence provenance 以 QA-DEV-120 為準。必要證據層：

1. static：file surface、default-preserving variants、禁止區與被取代 DEV-116 oracle 已收斂。
2. browser behavior：正常 topbar `視角 → OKR模式` 入口、frozen task-name/X-scroll、五欄 keyboard/pointer interaction、canonical List readback。
3. rendered visual：reference/compact desktop、200% zoom、normal/open/locked/read-only/error states 的 screenshot 與 computed geometry。
4. regressions：DEV-116、DEV-119，以及 TaskAssignmentPicker／status default consumers 的 targeted tests。
5. build quality：TypeScript、targeted ESLint、test build、diff check。

執行命令與結果：

```text
npm run verify:dev-120-goal-planning-minimal-density
npm run verify:dev-120-goal-planning-minimal-density-browser
npm run verify:dev-116-goal-mode
npm run verify:dev-116-goal-mode-browser
npm run verify:dev-119-goal-cell-actions
npm run verify:dev-119-goal-cell-actions-browser
npx tsc --noEmit
npx eslint <DEV-120 changed TS/TSX files>
npm run build:test
git diff --check -- <DEV-120 owned files>
```

本輪已在同一 frozen working-tree candidate 執行：DEV-120 static 13/13、browser 19/19（含 owner／viewer、validation 保值、
empty-date focus、lock／due signal、portal viewport 與 2x 視覺 zoom 壓力（CSS zoom proxy））；DEV-116 static 30/30 與 browser 全案例；
DEV-119 static 18/18 與 browser 全案例；DEV-048 multi-person static 與 clear-primary browser；
`npx tsc --noEmit`、targeted ESLint、`npm run build:test` 均通過。DEV-120 browser evidence 位於
`output/playwright/dev-120-goal-planning-minimal-density/result.json`，含 1440／1298／814 viewport、8 筆 fixture、
planning tracks、quiet chrome、native control、portal、frozen task-name/X-scroll、row density 與 visible-error sweep。
本輪重用既有 `localhost:4000` local-test runtime，未啟動新 server；runtime 未由本 DEV 擁有，依工作區規則不停止。

歷史 DEV-116／119 PASS 只能作 baseline；任何 source hash、fixture、route、viewport 或 interaction oracle 改變後，
必須在 frozen DEV-120 candidate 重跑受影響 evidence，不能引用舊 screenshot 宣稱新 visual PASS。

## 10. Architecture Closure Review

Review baseline：branch `持續優化3`、HEAD `e335eaa07c14313afb5a27607a2c009ace3bcbc3`、working tree。

| 檔案 | Review SHA-256 |
|---|---|
| `src/components/GoalView.tsx` | `056AC9BAAC9D68F5A13298D62E361A1836CA11F878B9437DAAF05E7281A407DB` |
| `src/components/TaskAssignmentPicker.tsx` | `8C6D2C1BA2D4E74B4FC62B3A2C74040B1D45187F835222083588331CD83A8B43` |
| `src/components/ui/taskStatusStyles.ts` | `9B2F63B7BFCF7CF21349B0BFDBD1B9A4DED7844B1CA294BE5FD67FAF3C21B80A` |
| `src/components/Wbs/TaskHierarchyIndentedRow.tsx` | `781CF5087213DEA82265F2FF38408775B2D434EF59246B6336BF2A5DB2931E8D` |
| `scripts/verify-dev-116-goal-mode.ts` | `AD992A20423B107C8738685F7026567ADC1DC4D91C15B89361047DFB9314D9B0` |
| `scripts/verify-dev-116-goal-mode-browser.pw.js` | `FAB91FC1B84715C42A0FDA29D4D9A544865C72B1FC66AB973CDCB3E48D064067` |

Architecture Closure findings：

- current GoalView 已以 native table／colgroup 呈現，planning controls 與 canonical handlers 位於 GoalRow；不需要改 projection。
- current owner picker 已有 `fullSummary` 同行摘要，status/date/duration controls 也已常駐掛載；所需增量只有
  default-preserving picker quiet trigger、Goal-local control classes、空日期 overlay 與 colgroup 分配，不需要新的 presenter/state。
- current GoalView 已有 task-name `sticky left-0` 基礎；本 DEV 鎖定其為 table frozen first column，並要求以實際
  `scrollLeft` 幾何證明只有其餘欄位移動，不另建 split table 或 scroll sync。
- `getTaskStatusSelectClass` 同時供 Goal 與 WBS 使用，直接改 global style 會造成跨模式未授權 visual drift。
- `TaskAssignmentPicker` 同時供 Goal、WBS、Task Details、GlobalContextMenu 使用，因此 quiet variant 必須 default-preserving。
- SPEC-116 的完整格線／深色 header 與本需求衝突，已分類為 `Intentional replacement` 並指定只更新受影響 verifier。
- SPEC-119 的 cell editor/session 與本需求相鄰但責任不同；本 DEV 不建立 planning session，也不進入 GoalCellSessionProvider。
- 資料、API、權限、狀態機、migration、transaction、idempotency、provider 與 release mechanism 均不受影響。
- source tree 有 user-owned／DEV-119 dirty changes；RD 必須逐檔小 patch，禁止 reset、checkout、整檔覆寫或把無關 diff 納入。

P0/P1 architecture blockers：0。Current execution boundary 為 WP-120-A→E 本機實作與 targeted QA/QC；commit、push、
deploy、release、手機 OKR、全域 table design system 與其他模式同步改版均不在本文件執行邊界。

### 10.1 Implementation model discretion

實作模型可自行決定：Goal-local width／class constant 命名、Tailwind class 排列、空日期 overlay 的同 cell DOM 次序，
以及不改契約的測試 fixture 細節。

實作模型不得改變：單一 native table／X-scroll owner、frozen task-name column、欄順序、tracks、mounted native controls、不得新增 planning edit state、canonical mutation、
permission/lock truth、SPEC-119 session、projection/rowSpan、其他模式 default style、驗收閾值與禁止修改區。

遇到下列任一情況立即停止回送規劃模型：需要新增或修改 schema/API/permission/state machine/store/context；
需要改 GoalCellSessionProvider、projection、persistence、meeting capture、global interaction kernel；無法保持 default consumer 等價；
native table 無法達到 track／sticky／a11y contract；或實際 repo 與 review hashes 衝突且差異無法由既有 DEV-119 說明。

## 11. Deferred Scope and Release Boundary

- Future Phase Captured / Not Requested：手機 OKR 的 touch density。只有使用者要求手機 OKR entry，且先定義 card/list/table
  取捨與 44px target 後，才重新進入規劃；不得用本 DEV 的 28px desktop row 推定手機方案。
- Out of scope：把 quiet controls 推廣到 List、WBS、Task Details、GlobalContextMenu 或全域 design system；若未來有
  跨模式一致化需求，另以獨立交付點評估，不由 DEV-120 擴張。
- Release：本規格不改 build/runtime/env/schema/hosting/deploy mechanism，因此不建立 Release Impact Note。
  完成本機 QA/QC 後仍須由獨立 release 指令進入 deployment/release gate。

## 12. Change Log

- 2026-09-14 R2 Tech Lead：以「純 presentation 問題不新增 interaction state」收斂架構；刪除 planning transient
  editor、短年份 formatter、display/input mode 與 recovery contract。日期 tracks 調整為 96px，五欄合計 428px；
  明定 `table-fixed` 的 fixed／elastic `<col>` 分配，保留單一 native table、表格左側 frozen task-name column 與唯一 X-scroll owner。
- 2026-09-14：依使用者附圖與極簡／降噪／版面利用率要求建立 DEV-120；完成 actual repo Architecture Closure
  Review、SPEC-116 intentional replacement、Goal-only presentation architecture、QA/QC contract 與 execution boundary。
  文件達 `Implemented / Targeted QA-QC PASS / 架構定案：已定案 / NOT RELEASED`。
- 2026-09-14：依 WP-120-A→E 完成 GoalView-local `<col>`／sticky first column、單一 X-scroll owner 與
  mounted quiet controls；更新 DEV-116 被 intentional replacement 的 visual oracle，並完成 DEV-120 browser 19/19、
  DEV-116／119／048 回歸、TypeScript、ESLint、test build。完整 persistence／dependency failure injection、原生瀏覽器
  UI zoom parity 與正式環境 gate 保留未驗證。
