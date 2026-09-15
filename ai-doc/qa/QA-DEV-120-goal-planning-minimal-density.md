# QA-DEV-120：OKR 規劃欄極簡高密度介面

- 狀態：`Executed / QA-QC PASS / NOT RELEASED`
- 日期：2026-09-14
- 對應 DEV：DEV-120
- 規格權威：`ai-doc/specs/SPEC-120-goal-planning-minimal-density.md`
- 風險：Medium
- Evidence target：本機 frozen candidate；不代表 production／release

## 1. Scope, Fixture and Evidence

- 正常入口：desktop topbar `視角 → OKR模式`；不得直接改 store 取代使用者入口證據。
- Actor：active workspace／board owner；另以 read-only actor 驗證不可編輯呈現。
- Fixture：至少 8 個可見 tasks，涵蓋 assigned／unassigned、四種 manual status、empty／non-empty dates、
  unlocked／duration-locked／dependency-locked、due-today、長 task name、description rowSpan 與 meeting owner cell。
- Viewport：1440×900、1298×698、814×698、200% zoom；390×844 只做既有 mobile negative regression。
- Canonical oracle：在 Goal 修改 planning value 後切到 List，讀回同一 task 的 canonical value，再切回 Goal 比對。
- Evidence：source revision／dirty boundary、browser version、URL、actor、fixture count、viewport、操作、screenshot、
  computed geometry、console/page/HTTP/visible errors。temporary runtime 另記 PID／port／purpose／cleanup。

### 1.1 本輪執行結果

- DEV-120 static：13/13 PASS；browser：19/19 PASS。fixture 8 筆，actors `local-test-user`（owner）與
  `local-test-viewer`（viewer），viewport 1440×900、1298×698、814×698；單一 table／X-scroll、task-name frozen
  first column、112／64／96／96／60px tracks、quiet chrome、native date/status、validation 保值、empty-date focus、
  lock／due signal、picker portal、33px compact row、2x 視覺 zoom 壓力（CSS zoom proxy）與 visible-error／HTTP／console sweep 均通過。
- Required regression：DEV-116 static 30/30＋browser 全案例 PASS；DEV-119 static 18/18＋browser 全案例 PASS；
  DEV-048 multi-person static、clear-primary browser PASS。TypeScript、targeted ESLint、test build PASS。
- Evidence：`output/playwright/dev-120-goal-planning-minimal-density/static-result.json`、
  `output/playwright/dev-120-goal-planning-minimal-density/result.json`、
  `output/playwright/dev-119-goal-cell-actions/result.json`。browser 重用既有 `localhost:4000` local-test runtime，
  未啟動新 server，也未停止非本 DEV 所有的 runtime。
- Residual：完整 persistence／dependency failure injection、原生瀏覽器 UI 的 zoom parity 與正式環境 smoke 不在本機
  QA gate；不將此 local candidate 宣稱為 release ready。額外 DEV-048 collaborator-filter browser smoke 於 fixture
  boot wait timeout，未納入 DEV-120 PASS 判定；該案例需另案釐清 fixture／入口等待問題。

## 2. FMEA

| 失效模式 | 使用者影響 | 偵測方式 | 優先級 | 對策／案例 |
|---|---|---|---|---|
| 規劃欄仍被剩餘寬度拉大 | 內容空間沒有增加 | 1298px col geometry | P1 | S02／V02 |
| 任務名稱跟著 X-scroll 移動 | 失去逐列對照 | scroll 前後 rect delta | P1 | B06／V05 |
| frozen cell 透明或 hit target 穿透 | 文字重疊或點錯任務 | screenshot＋elementFromPoint | P1 | B06／V05 |
| 靜態控制 chrome 仍常駐 | 極簡降噪失敗 | normal-state screenshot／computed style | P1 | V01 |
| 隱藏 chrome 後控制不可發現或不可聚焦 | 無法修改 planning value | pointer＋keyboard flow | P1 | B02／A01 |
| 28px row 裁字或協作摘要換兩列 | 值不可讀、密度失效 | rect／overflow／screenshot | P1 | V03 |
| 新增 display/editor state 造成值或 focus 分裂 | validation 後資料錯誤 | source gate＋canonical readback | P1 | S03／B03 |
| shared picker／status 外觀被一併修改 | WBS／Details 未授權回歸 | default consumer smoke | P1 | S05／R01 |
| locked／read-only 訊號被過度刪除 | 使用者誤判可編輯性 | locked fixture＋aria | P1 | B04／A02 |
| planning click 觸發 row action／DnD | 誤開詳情或移動任務 | navigation／drag observation | P1 | B05 |
| visible error 被 build PASS 掩蓋 | 假通過 | visible-error sweep | P0 | G01 |

## 3. Static Contract

- S01：只有一個 native table 與一個 horizontal scroll owner；task-name `th/td` 使用 `sticky left-0`，
  未新增 split table、同步 scroll、viewport-fixed panel 或 inner X-scroll。
- S02：planning `<col>` 為 owner 112／status 64／optional start 96／end 96／duration 60px；start visible 時合計 428px，hidden 時合計 332px。
  有 content columns 時只有 content `<col>` 未指定 width，沒有 content column 時只有 task `<col>` 未指定 width；
  minWidth 使用 visible planning／content columns 計算。沒有 ResizeObserver 或量測後 setState。
- S03：未新增 planning active-cell、draft、display/editor mode、date formatter、context、store、localStorage 或 recovery owner。
- S04：date inputs、status select、duration controls 與既有 handlers 始終掛載；permission、dependency、lock 與 validation
  truth 未分叉，canonical update path 未改寫。
- S05：`TaskAssignmentPicker` quiet variant 保持 default variant 輸出與行為；Goal status 不改
  `getTaskStatusSelectClass()`，只組合既有 `taskStatusTitleClass` 與 Goal-local base class。
- S06：SPEC-116 verifier 只更新被 SPEC-120 明列取代的 grid／header／width／control chrome oracle；
  projection、rowSpan、entry、DnD、menu、records 與 mobile assertions 不放寬。
- S07：SPEC §6 禁止區 diff 為 0；命中即停止並回送規劃模型。

## 4. Browser Behavior

- B01：由正常入口進入 OKR；fixture count > 0，五個 planning columns 與值可見。
- B02：owner、status、start、end、duration 依序用 pointer、Tab、Shift+Tab、Enter／Space 操作；原生控制與 picker
  可聚焦、focus 可見、Escape／blur／portal close 沿用既有行為。
- B03：五種 valid change 後切到 List 讀回同一 canonical task，再切回 Goal 比對；沒有 display/input value drift。
- B04：start > end、child 超出 parent、duration 缺 start 不清掉最後有效值；dependency lock、duration lock、
  read-only actor 不產生非法 mutation，必要 lock reason 可取得。
- B05：操作 planning control 不開 Task Details、不啟動 drag、不展開 content cell；row click、task-name 右鍵與 DnD
  仍各走既有路徑。
- B06：814px viewport 將唯一 table X-scroll 至少移動 160px；task-name header/body left delta ≤1px，
  其他欄位 horizontal delta 與 scroll delta 相差 ≤1px；frozen column 下方沒有可點擊的右側 control。
- B07：description F2／double-click edit、expand/collapse、meeting Y-scroll 與 recovery marker 依 DEV-119 運作。
- B08：empty date 正常顯示 `—`；focus 後 overlay 隱藏、native date surface 可操作；blur 後依 value 回到安靜呈現。

## 5. Rendered Visual and Geometry

- V01：1440×900 normal state 沒有常駐 input border/fill、status pill、calendar/unlock icon、dark header 或 table outer frame；
  每個 planning cell 只保留值與必要 lock／dependency／due-today 單一訊號。
- V02：1298×698 且 start-date visible 的 fixture，planning tracks 為 112／64／96／96／60px（各 ±1px）；header/body 左右對齊 ±1px；
  可見 content tracks 平分剩餘空間且各自 ≥220px。
- V03：一般單行 task row computed 28～30px；文字無 vertical clipping，協作摘要不換列；
  rowSpan／expanded content rows 可高於此範圍。
- V04：垂直捲動後 header top delta ≤1px；header 為不透明淺中性 surface。planning internal vertical border 與
  table outer border computed 0px，row divider 與 task/content boundary 可辨識。
- V05：B06 的 X-scroll 截圖顯示 task-name 固定於資料表格左側、背景不透明、交會 z-index 正確，
  其他欄位可完整移到其下方，且 scrollbar owner 數量為 1。
- V06：814×698、200% zoom 的 normal／hover／focus／picker-open／locked states 無文字重疊、無必要 control 裁切、
  無第二水平 scrollbar；owner portal 未被 table overflow 裁切。

## 6. Accessibility and Visible-error Gate

- A01：native table semantics、header association、DOM focus order、visible focus 與 accessible names 完整；
  正常隱藏的 calendar／unlock chrome 不會移除 control 的 keyboard target。
- A02：移除顏色後 status label、locked／dependency reason、read-only value 與 due date 仍可理解。
- G01：required cases 期間出現 unexpected `[role=alert]`、`.inline-error`、load failed、HTTP 4xx/5xx、
  page/console error 或 critical fixture=0，即 Fail；預期 validation alert 只記入 B04。

## 7. Required Regression and Commands

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

- R01：若修改 `TaskAssignmentPicker`，加跑 DEV-048 assignment static／browser 與 WBS／Task Details／
  GlobalContextMenu smoke；default trigger、summary、keyboard、portal computed behavior 必須等價。
- R02：DEV-119 description edit、expand／scroll、session recovery 與 PWA owner 回歸通過。
- R03：DEV-116 entry、projection／rowSpan、tags、canonical planning readback、DnD、task menu、sticky header／task
  column 與 mobile negative 回歸通過；只依 SPEC-120 更新被取代的 visual oracle。

browser harness 必須遵守 task-owned runtime：啟動前記錄 project、purpose、port、process tree 與 cleanup condition；
結束前只停止 task-owned tree 並確認 port released。

## 8. Pass, Fail and Stop

- PASS：本輪已完成 S01～S07 static、DEV-120 browser 19/19（含 B04 validation、B05 planning isolation、B08
  empty-date focus、V06 portal／2x zoom、A02 read-only）、DEV-116／DEV-119／DEV-048 required regression 與 build
  quality；canonical List readback、DnD、meeting／session、mobile negative 由 DEV-116／DEV-119 browser regression
  同一 frozen candidate 覆蓋。evidence 可追溯 source、actor、fixture、route、viewport 與 runtime。
- Release residual：完整 persistence／dependency failure injection、原生瀏覽器 UI zoom parity、正式環境 smoke，
  以及獨立 DEV-048 collaborator-filter fixture timeout 調查仍不屬本機 QA-QC PASS。
- Fail：canonical readback 不一致、frozen/X-scroll geometry 不符、控制不可操作、locked/read-only 誤導、
  visual contract 未達、其他模式 drift、visible error 或 runtime cleanup 失敗。
- Not verified：缺 screenshot、computed geometry、actor／fixture provenance、keyboard 或 read-only evidence。
- Stop and return to planning：需修改 SPEC 禁止區、shared default 無法保持等價，或 native table 無法同時達成
  fixed planning tracks、elastic content、sticky task-name 與 a11y。

本文件記錄本機 QA/QC 結果；`QA-QC PASS` 不等於 production／release PASS。上述 release residual 仍須依獨立 gate
執行。
