# QA-DEV-121：OKR 父子任務樹狀對照與群組範圍

- 狀態：`R28 Executed / Targeted QA PASS / QC Ready / NOT RELEASED`；R22～R23 Executed、R24 Executed、R25 Executed、R26 Executed、R27 Executed baseline retained for regression traceability。
- 對應 SPEC：[SPEC-121](../specs/SPEC-121-goal-hierarchy-comparison-grid.md)。
- 對應 DEV：[DEV-121](../dev_task.md#dev-121okr-父子任務樹狀對照與群組範圍)。
- 驗證角色：RD 先做同一 candidate self-test；QA 依本文件重跑；QC 只採信可追溯 artifact 與事實結果。
- 測試層級：pure/static contract、真實 Chromium browser、computed geometry、keyboard／pointer、viewer、
  visual evidence、DEV-116／119／120 regression。

## 1. 驗證目標

證明 DEV-121 增加的是 Goal-only 階層閱讀層：使用者能辨識父子路徑、root group 終點與同列 planning
資訊；同時保留 native `rowSpan` 群組脈絡、fixed task-name first column、single X-scroll、內容 cell
生命週期、planning mutation、DnD、menu 與 native table semantics；除固定任務名稱欄外的所有可見欄位可收合，欄位狀態以帳號 uid
持久化並在重新載入後恢復。

本 QA 不以「畫面看起來有縮排」判定通過。每項結論要能追溯 source hash、fixture、actor、入口、
DOM／computed geometry、操作結果及 screenshot。

## 2. Candidate Freeze 與環境

執行前記錄：

```text
date/timezone
branch + HEAD + git status --short
GoalView / hierarchyPresentation / projection / taskHierarchy / index.css hashes
DEV-116 / DEV-119 / DEV-120 / DEV-121 verifier hashes
browser/version + viewport + deviceScaleFactor + base URL
actor + workspaceId + boardId + fixture version
runtime project/purpose/port/process tree/cleanup condition
```

若使用現有 `localhost:4000`，先確認它是相同 project／test mode candidate；非本任務 owner 的 runtime
不得停止。若另開 temporary runtime，結束前只停止已記錄的 task-owned process tree 並確認 port released。

## 3. Controlled Fixture

固定 `DEV121-HIERARCHY-V1`：

- 同一 workspace／active board 8 個 primary tasks、2 個 L0 roots（`DEV121-HIERARCHY-V1` candidate fixture）。
- Root A：L1 兄弟至少 3 個；其中一個有 L2，L2 再有 L3+；包含最後 sibling、長任務名。
- Root B：至少 2 層；用於 root group 起訖與跨群組誤讀。
- description／meeting 同時涵蓋：root-owned `rowSpan > 1`、child-owned own-content barrier、
  `rowSpan = 1`、空欄、長內容需要 Y-scroll。
- 一個可收合 root、一個可收合中層；filter 可排除部分後代，驗證 `+N` 只計 current eligible descendants。
- planning 含 editor、viewer、locked duration、dependency-locked date、due-today、empty date。
- 任務具可執行 details、context menu 與合法 primary-placement DnD 目標。

fixture sanity 若不符 task count、parent chain、content owner 或 actor capability，整輪 Fail，不得用空資料畫面通過。

## 4. Static／Pure Cases

| ID | 驗證 |
|---|---|
| S01 | 新 projector pure、無 React／DOM／store import，輸入輸出 readonly，沒有 mutation。 |
| S02 | projector 輸出 parent、visible-child、ancestor path、owned continuation、last sibling 與 descendant count；沒有 root start-end metadata。 |
| S03 | L1～L4+ 的 `ancestorContinuations` 同時具有正確 guide level 與 `ownerTaskId`；最後 sibling 終止，跨 root 不連線。 |
| S04 | fully-expanded DFS 的 descendant count 包含全部後代；current filter 被排除者不計。 |
| S05 | collapse 只改 rendered rows；同一 input identity 下 fully-expanded hierarchy 不依 `collapsedIds` 重算。 |
| S06 | 重複 id、level 跳級、rendered 非 fully-expanded 子序列或結構不一致時整批回空 map，且不重排／增刪 rendered items。 |
| S07 | GoalView 仍直接使用 shared builder、sparse projection、native `<table>`／`<td rowSpan>` 與一個 `data-goal-view` scroll owner。 |
| S08 | `taskHierarchy.ts`、`projection.ts`、`TaskHierarchyIndentedRow.tsx` shared behavior 無 DEV-121 drift。 |
| S09 | 重用既有 row／level／planning／cell-kind／span hooks；新增 hooks 只含 task-cell、group-span、guides／last-sibling、descendant-count、description column state／toggle。guides `aria-hidden`、`pointer-events:none`；`+N` 與欄位 toggle 具 accessible label。 |
| S10 | reading selector 只含 task／planning hooks，明確排除 group content；禁止泛用 `tr:hover > *`。 |
| S11 | 沒有 card、split table、second X-scroll、persistent hierarchy store、selection state、重複 root metadata 或 content clone。 |
| S12 | package scripts、SPEC／QA／dev_task／documentation map 互鏈，狀態一致。 |
| S13 | 任務名稱欄的列格線契約維持關閉，root group boundary 由可捲動欄位承擔。 |
| S14 | active connector、self incoming lineage、root isolation 與欄位 tint 契約未被格線修正破壞。 |
| S15 | Goal depth／branch／disclosure 幾何未因格線恢復而增加 gutter 或改變 title distance。 |
| S16 | active 線段仍為較粗圓角筆畫；定位 task-name 使用低飽和 tint，planning／content owner 仍保留既有對比。 |
| S17 | 可捲動 comparison cells 均有水平／垂直格線，任務名稱 cells 保持無資料列格線。 |
| S18 | Goal collapse control 保留 20×20px 原生 button 與 `aria-expanded`；可見 chevron 移除，expanded／collapsed node dot 與 own-lane geometry contract 存在。 |
| S19 | current task 的 self `incoming-vertical` 與 `incoming-branch` 都維持 inactive；不改 descendant lineage。 |
| S20 | Goal 樹狀線 X 軸間隔由 8px 基準增加 30% 為 10.4px；incoming branch 同步為 14.4px 以維持線端接到標題，且不改 shared 6px default。 |
| S21 | idle 時任務名稱固定欄維持原生底色；定位／focus scope 生效時套用低飽和 parent／descendant tint，planning 與真正 content owner cell 仍保留 active tint。 |
| S22 | idle 時 root、L1、L2+ 所有 Goal hierarchy levels 的 task-name cells 共用單一白色 surface，不因深度切換底色。 |
| S23 | 所有可收合 Goal 欄位共用 keyboard-accessible toggle；expanded button hit／focus target 為 24px、glyph frame 為 18px／5px radius，collapsed button 為 20px、glyph frame 為 16px／4px radius，支援 hover／focus／pressed／reduced-motion；一般欄位收合為 22.4px（computed 約 22px），固定任務名稱欄不提供欄位收合且維持 252px。 |
| S24 | 欄位收合 key 以帳號 uid 透過 `profiles.ui_preferences.layout.goalCollapsedColumns` 保存，並由既有 local／remote preference service hydration。 |
| S25 | 任務名稱表頭存在且沒有欄位收合 toggle；既有 `task` 偏好值不會讓固定欄縮成 compact track。 |
| S26 | 空白開始／結束日期不渲染額外 `—`；owner／status／start／end／duration 的基準寬度與完整表頭標籤契約存在。 |
| S27 | 工期鎖定仍提供結束日期唯讀約束與工期控制，但不在結束日期欄渲染重複 `L` 標記。 |
| S28 | 會議紀錄 owner cell 保留內部 Y 捲軸；collapsed viewport 以 20px 文字行高對齊，部分可視 quick-note row 以 `visibility:hidden` 暫隱藏，且不改 rowSpan／content ownership。 |

projector 測試另以 500 rows、至少 6 層 fixture 記錄時間；只作非退化觀察，硬性判定以單次 DFS／無每列全表掃描的
source 與 case 證據為準，避免用不穩定 wall-clock 門檻製造假失敗。

## 5. Browser Functional Cases

| ID | 驗證 |
|---|---|
| B01 | 由正常 topbar `視角 → OKR模式` 進入，active board、task order 與 filter 結果正確。 |
| B02 | 展開 fixture 中每列的 continuation／last-sibling decoration 正確；root boundary 由既有 row level＋index 正確推導。 |
| B03 | 收合 Root A，只有該 subtree rows 消失；`+N` 等於全部 eligible descendants；展開後消失並恢復同序。 |
| B04 | 收合中層及套用 filter，`+N` 跟 current eligible descendants 同步，不計被排除任務。 |
| B05 | description／meeting owner task id、rowSpan 值、covered cell absence 與內容在 collapse 前後符合 sparse projection。 |
| B06 | connector 只導引 task／planning；active descendant 不染 ancestor rowSpan owner，避免把父層內容誤認為目前任務內容。 |
| B07 | task details、task-name right-click／Shift+F10、node toggle 與 DnD 仍可操作；guide 不截取事件。 |
| B08 | planning owner／status／dates／duration 的合法修改可由 canonical List readback；locked／viewer 無非法 mutation。 |
| B09 | description F2／雙擊、保存／失敗恢復、expand／collapse、meeting Y-scroll 與 content menu 通過 DEV-119 契約。 |
| B10 | 垂直與水平捲動後 sticky header／task column、portal、focus target 與唯一 scroll owner 保持正確。 |
| B11 | 游標移入任務目的或會議紀錄的實際 owner cell 時，反向定位到該 `ownerTaskId` 任務；description／meeting 兩欄結果一致。 |
| B12 | 游標移入任務名稱、負責人、狀態、開始日期、結束日期或工期欄位時，active scope 都解析到該列所屬任務。 |
| B13 | 任務目的欄 toggle expanded 時 readback 24px button、18px glyph、5px radius；collapsed 時 readback 20px button、16px glyph、4px radius，並以柔和主色與反向箭頭顯示；內容與 owner cell 收起為 22.4px 控制軌（computed 約 22px），再次點擊恢復內容、rowSpan 與欄位順序。 |
| B14 | 逐一點擊所有可見的可收合欄位 toggle；每欄均進入 22.4px compact width（computed 約 22px）並可由同一按鈕恢復，固定任務名稱欄維持 252px，欄位順序與 single X-scroll 不變。 |
| B15 | 收合 description／status／duration 後讀回帳號 scoped local preference，重新載入仍恢復相同欄位狀態，再逐一還原。 |
| B16 | 以空白開始／結束日期 fixture 驗證日期儲存格不含 `—`；Chromium computed geometry 驗證 owner／status／start／end／duration 欄寬至少為 144／72／112／112／84px，且表頭標籤沒有 overflow。 |
| B17 | 以 `isDurationLocked=true` fixture 驗證結束日期仍為唯讀、工期鎖定控制仍存在，且結束日期欄不再渲染 `L` 標記。 |
| B18 | 以 10 筆長會議紀錄 fixture 驗證內部捲軸仍為 `overflow-y:auto`、`scrollHeight > clientHeight`、viewport 高度為 20px 行高倍數，且部分可視 quick-note row 整列隱藏而不露出裁切文字。 |

## 6. Rendered Visual／Geometry Cases

| ID | 驗證 |
|---|---|
| V01 | 1440×900 screenshot 可辨識兩個 root anchors、L1～L4+ parent paths、last sibling 與 group ends。 |
| V02 | incoming／continuation／child-stem computed width 1px；無 endpoint；Goal depth=10.4px（8px × 1.3）、incoming branch=14.4px（同步補足接點）；branch-to-title distance ≤0.5px；guide 位於 frozen task `th`，不影響 title／focus ring。 |
| V03 | 第二個及後續 root 只有一條 2px 上邊界；第一 root 無頂線，最後 group 不重複 end line，且沒有 spacer row／card／stripe／badge。 |
| V04 | `rowSpan > 1` owner 有 group surface／2px scope rail；`rowSpan = 1` 無；selected／editing outline 優先可見。 |
| V05 | connector reading guide 僅覆蓋 task＋planning cells；active descendant 不染 ancestor `rowSpan` owner，正常、hover、focus、open、locked、validation、due 狀態不互相吞沒。 |
| V06 | 1298×698 的 252px task、content min width、144／72／112／112／84 planning tracks 仍各 ±1px；表頭標題完整可見。 |
| V07 | 814×698 X-scroll ≥160px 後 task header／body left delta ≤1px；其他欄位位移與 scroll delta 相差 ≤1px；X-scroll owner=1。 |
| V08 | 814×698＋2x CSS zoom proxy 無必要文字／control／guide 裁切、重疊或第二水平 scrollbar。 |
| V09 | 同一 `ownerTaskId`／lane 的垂直線段 gap ≤1.1px；expanded node 為 6px 圓點、中心與 own rail 偏差 ≤0.5px、20×20px hit target 不越過 title，且 chevron SVG 不顯示。 |
| V10 | 任務名稱欄的 computed `border-bottom` 全部為 0；可捲動 comparison cells 均有 1px 水平／垂直格線，root group boundary 只在可捲動欄位為 2px。 |
| V11 | 每列 branch 的 Y 中心對準任務列中心 ±1px；最後 sibling 的 incoming vertical 在中心終止，非最後 sibling 延伸至列底；root 無 incoming line。 |
| V12 | hover／focus A1 時，只啟用 A1 所擁有的 child stem、後代 incoming／continuation；Root A 的 continuation、A1 當列的 parent-owned `incoming-vertical`／`incoming-branch` 與其他 sibling 擁有的線維持中性。 |
| V13 | normal connector 使用低對比色、active connector 保持可辨識 indigo，所有線段有圓角端點；不得新增 endpoint 或改變幾何。 |
| V14 | hover／focus A1 時，A1 當列 parent-owned `incoming-vertical`／`incoming-branch` 必須 `active=false`、1px 且維持 normal tone；後代 vertical 必須 `active=true`、stroke ≥2px。root task 無 parent relation 時不新增線段。 |
| V15 | hover／focus A1 時，任務名稱固定欄使用柔和 parent tint，planning cell 使用既有 active tint；涵蓋 A1 的 ancestor `rowSpan` owner content 保持 group surface；`owner`／`covered` 結構與內容值不變。 |
| V16 | hover／focus Root A（實際 description owner）時，該 owner cell 使用明顯 active tint；證明染色只落在資料真正所屬的任務。 |
| V17 | 從任務目的／會議紀錄 owner cell 反向定位後，樹線 active scope 的 task id 仍等於該 owner；不把 covered descendant 當成內容所有者。 |
| V18 | 格線範圍符合最新 UI 契約：任務名稱欄無資料格線，其餘可捲動欄位完整顯示 cell grid，且 X-scroll owner 仍為 1。 |
| V19 | idle 時所有 hierarchy levels 的 task-name cells computed background 只有一個值且為 `rgb(255, 255, 255)`；planning／content owner 定位色仍可見。 |
| V20 | 定位／focus scope 下 task-name parent／descendant computed background 分別為 `rgba(224, 231, 255, 0.72)`／`rgba(239, 246, 255, 0.76)`，保留層級差異但降低藍色重量。 |

視覺比較至少保存 normal、hover、keyboard focus、collapsed、X-scrolled、rowSpan editing／expanded、viewer、2x zoom
截圖；每張標記 viewport、actor、case 與 source hash。

## 7. Accessibility 與 Error Gate

| ID | 驗證 |
|---|---|
| A01 | native table、headers、scope=row、rowSpan、DOM focus order 與 control accessible names 不變。 |
| A02 | guides 不在 accessibility tree／tab order；collapsed count 讀為「已收合 N 個下層任務」。 |
| A03 | 移除顏色或 forced-colors 下仍能靠縮排、rail、elbow、root boundary 與文字辨識階層。 |
| A04 | node toggle 以鍵盤 Enter／Space 收合及展開；焦點保留、`aria-expanded` 更新，collapsed node 為 8px 空心圓且 root branch 不消失。 |
| G01 | unexpected role=alert、inline error、load failed、page/console error、HTTP 4xx/5xx 或 critical fixture=0 皆 Fail。 |
| G02 | 測試過程沒有殘留 task-owned runtime、browser tab、terminal 或 output writer；無法確認 owner 時不得清理他人資源。 |

## 8. FMEA

| Failure mode | Effect | Detection | Gate |
|---|---|---|---|
| decoration 自建 hierarchy truth | filter／collapse 後線與 rows 分歧 | S01～S06、B02～B04 | Stop/Fail |
| decoration 保留可由 row 直接取得的欄位 | metadata drift、測試與 DOM 膨脹 | S02、S09、source review | Fail |
| `tr:hover` 誤含 rowSpan cell | 子任務資料與父 content 混淆 | S10、B06、V05 | Fail |
| guides 擋 hitbox | 無法展開、拖曳、開詳情或選單 | S09、B07 | Fail |
| node toggle 未對準 own lane、覆蓋標題或只剩裝飾圓點 | 使用者誤判圓點所屬任務、無法可靠展開或失去鍵盤操作 | S18、B03、V09、A04 | Fail |
| current task 上游垂直／水平段也套 active 筆畫 | 形成沒有直接指向目標的藍色線段，定位焦點與父子方向混淆 | S19、V12、V14 | Fail |
| group surface 改 owner／rowSpan | 內容歸屬或編輯 session 錯誤 | B05、B09、DEV-119 regression | Stop/Fail |
| content owner hover 未反向定位 | 使用者從目的／會議紀錄無法回看所屬任務 | B11、V17、S12 | Fail |
| gridline scope 誤套到任務名稱欄或遺漏 comparison cells | 固定欄被切碎，或跨欄比對失去資料軌道 | S13～S17、V10、V18 | Fail |
| sticky／z-index 穿透 | X-scroll 後欄位蓋過任務樹 | B10、V07 | Fail |
| 深層 rail 過密 | 名稱、focus 或 disclosure 不可讀 | V01、V02、V08 | Fail；回規劃調整 token，不改 shared 6px |
| `+N` 計入被 filter 排除者 | 使用者誤判工作量 | S04、B04 | Fail |
| existing verifier 被放寬 | 以假綠掩蓋回歸 | source diff review＋required regressions | Fail |

## 9. Commands 與 Evidence

```text
npm run verify:dev-121-goal-hierarchy-comparison
npm run verify:dev-121-goal-hierarchy-comparison-browser
npm run verify:dev-116-goal-mode
npm run verify:dev-116-goal-mode-browser
npm run verify:dev-119-goal-cell-actions
npm run verify:dev-119-goal-cell-actions-browser
npm run verify:dev-120-goal-planning-minimal-density
npm run verify:dev-120-goal-planning-minimal-density-browser
npx tsc --noEmit
npx eslint src/components/GoalView.tsx src/features/goalMode/hierarchyPresentation.ts
npm run build:test
git diff --check -- ai-doc package.json scripts/verify-dev-121-goal-hierarchy-comparison.ts scripts/verify-dev-121-goal-hierarchy-comparison-browser.pw.js src/components/GoalView.tsx src/features/goalMode/hierarchyPresentation.ts src/index.css
```

預定 artifact root：`output/playwright/dev-121-goal-hierarchy-comparison/`。至少包含 `result.json`、
candidate metadata、case results、console／HTTP sweep 與命名 screenshots。artifact 不得寫入敏感資料或偽造未執行結果。

## 9.1 Historical Execution Record R6（2026-09-14）

- branch `持續優化3`；HEAD `e335eaa07c14313afb5a27607a2c009ace3bcbc3`；local-test Chromium；base URL `http://localhost:4000/`。
- Candidate hashes：`GoalView.tsx`=`E5DDAD392625EFF0F9D7B217600C331041F78B4B7DD600FA76A8466168E2A75E`、
  `hierarchyPresentation.ts`=`DCAC2D7D65403F7E4697F5CA34BADCE2D962066BF9B9D3F3C89B7E34E1081961`、
  `index.css`=`7CD097E3617D07EA28FB25EBC578716C675000F57F722D9AA58F24F8F6CB8127`、
  DEV-121 static=`D6D045FC708EE97F5D6307EB42CE2C2E76B61B244CF65DED23095B60878F9329`、
  browser=`499C562100754370C5BFB967D4501F9A7E1ADB168EA29A169D38948C3FAE6A29`。
- DEV-121 static：14/14；browser：17/17（B01～B07、V02～V04、V09～V11、A01、G01～G02）；fixture 8 tasks、owner／viewer、
  1440×900／1298×698／814×698 與 2× CSS zoom proxy 均執行。
- Compatible regressions：DEV-116 static 30/30＋browser PASS；DEV-119 static 18/18＋browser PASS；
  DEV-120 static 13/13＋browser PASS。
- DEV-121 R6 also updates the shared DEV-116 V12 visual oracle to require zero task-row bottom borders while retaining
  planning and table-frame checks.
- DEV-116 V12 依 DEV-121 R5 的 intentional visual replacement 改驗證 task rows `bottomBorders` 全為 0；
  planning internal gridlines、table frame 與其餘互動案例仍完整保留。
- Quality gates：`npx tsc --noEmit` PASS；targeted ESLint PASS；`npm run build:test` PASS；`git diff --check` PASS。
- Evidence：`output/playwright/dev-121-goal-hierarchy-comparison/static-result.json`、`result.json`、V01／V02／V03／V05 screenshots；
  regression artifacts remain in their respective `output/playwright/dev-116-goal-mode/`、`dev-119-goal-cell-actions/`、
  `dev-120-goal-planning-minimal-density/` directories。
- Resource boundary：重用相同 project 的既有 `localhost:4000`，未停止非本任務 runtime；Playwright task-owned browser surfaces
  已由 runner 清理。未執行 commit、push、deploy、production smoke、正式資料或原生 browser UI zoom。

## 9.2 R7 Execution Record（2026-09-14）

- branch `持續優化3`；HEAD `e335eaa07c14313afb5a27607a2c009ace3bcbc3`；working-tree candidate；local-test Chromium；
  base URL `http://localhost:4000/`；owner／viewer；1440×900、1298×698、814×698、2× CSS zoom proxy。
- DEV-121 static 15/15；browser 20/20；5 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- Owned geometry：deep row 有 2 條 owned continuation＋incoming vertical／branch＋endpoint；owner-lane 最大 gap `0px`；
  disclosure gap `145.5px`；vertical `1px`、branch `24px`、endpoint `4×4px`；root incoming count=0、ownerless guides=0。
- Endpoint 與列中心最大偏差 `0.5px`；最後 sibling 全在列中心終止，非最後 sibling 延伸至列底；task row bottom borders=[]、root boundary=2px。
- Hover A1 時 active segments=13、Root A-owned active continuation=0；A1 parent＋A1-A／A1-A-1／A1-B descendants scope 正確；
  keyboard focus 取得同一 scope。collapse count、native `rowSpan=5`、covered DOM absence、single X-scroll 與 viewer 全通過。
- DEV-116 static 30/30＋browser 42/42；DEV-119 static 18/18＋browser 17/17；DEV-120 static 13/13＋browser 19/19。
- TypeScript、targeted ESLint、test build、targeted diff check PASS。重用既有 port 4000 runtime；runner 自有 browser surfaces 已清理。
- Source hashes 與 evidence path 以 SPEC-121 R7 Implementation Closure 為準。未 commit／push／deploy／release。

## 9.3 R8 Execution Record（2026-09-14）

- DEV-121 static 15/15、browser 20/20；5 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- 幾何量測：Goal depth `8px`、lane start `20px`、incoming branch `12px`、root branch `4px`、endpoint count=0；
  owner-lane 最大 gap `0px`、disclosure-to-guide left gap `0px`、branch-to-title distance `0px`、branch 對列中心最大偏差 `1px`。
- 最後 sibling 終止、root incoming count=0、ownerless guides=0；hover A1 active segments=9，其他 owner 未誤亮。
  collapse count、native `rowSpan=5`、covered DOM absence、sticky task column、single X-scroll 與 viewer 全通過。
- DEV-116 static 30/30＋browser 42/42；DEV-119 static 18/18＋browser 17/17；DEV-120 static 13/13＋browser 19/19。
- `npx tsc --noEmit`、targeted ESLint、`npm run build:test`、targeted `git diff --check` PASS。
- Source hashes：`GoalView.tsx`=`65C91EDF2367ACBE9D5DF091250CC521F496F9EDE33F0E95BCC89F0F6610F74A`、
  `hierarchyPresentation.ts`=`6E20C92FC83DEF0F7063A9825BCA123364C3CA283DD3C88BE2804F650FAC6F4C`、
  `index.css`=`C22E2F638F003E7EF6F0F7E3B6ED1958DBC81CC5FDBC44C41548720A270CBA73`、
  `DEV-121 static`=`32B62E7ADEBEB8F3B5F7D632359ECC90A415AB0D08CD13FF5EE35D08530261B6`、
  `browser`=`AB3335514F7ECA7872717A862E4107CF01B450F47E5F247D5C1ED3BC1B910F31`。
- Evidence：`output/playwright/dev-121-goal-hierarchy-comparison/`。重用既有 port 4000 runtime；runner 自有 browser surfaces已清理。
  未 commit／push／deploy／release。

## 9.4 R9 Execution Record（2026-09-14）

- DEV-121 static 16/16、browser 21/21；5 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- V13 實測 normal connector `rgba(148, 163, 184, 0.42)`、`border-radius=999px`；active connector token 為 `rgb(99 102 241 / 76%)`。
- R8 的 depth `8px`、lane start `20px`、branch `12px`、endpoint count=0、disclosure-to-guide left gap `0px`、
  branch-to-title distance `0px` 全部維持；未新增 DOM、gutter 或第二 scroll owner。
- DEV-116 static 30/30＋browser 42/42；DEV-119 static 18/18＋browser 17/17；DEV-120 static 13/13＋browser 19/19。
- `npx tsc --noEmit`、targeted ESLint、`npm run build:test`、targeted `git diff --check` PASS。
- Source hashes：`GoalView.tsx`=`65C91EDF2367ACBE9D5DF091250CC521F496F9EDE33F0E95BCC89F0F6610F74A`、
  `hierarchyPresentation.ts`=`6E20C92FC83DEF0F7063A9825BCA123364C3CA283DD3C88BE2804F650FAC6F4C`、
  `index.css`=`6E85509CEE4F55EDB7BB860BFB608F79F99DEC148EF8DBF829172F906B3D3905`、
  `DEV-121 static`=`FDEE5D314096D74DC91B780FF05F9260E5D938764D76798819C499235E258E91`、
  `browser`=`B833028B01EE39A440617E70FFD02D952E16A4ADBC1A5B9543B52E7D53507A64`。
- Evidence：`output/playwright/dev-121-goal-hierarchy-comparison/`；local candidate 維持 QC Ready，未 commit／push／deploy／release。

## 9.5 R10 Execution Record（2026-09-14）

- DEV-121 static 16/16、browser 22/22；5 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- V14 實測 A1 自己的 parent-owned `incoming-vertical`／`incoming-branch` 均為 active；Root A continuation 與不相干 sibling 維持 inactive。
- R9 的 normal／active connector tone、rounded joins、depth `8px`、lane start `20px`、branch `12px`、endpoint count=0、
  disclosure-to-guide left gap `0px`、branch-to-title distance `0px` 全部維持；未新增 DOM、gutter 或第二 scroll owner。
- DEV-116／119／120 targeted regressions、`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、targeted `git diff --check` PASS。
- Source hashes：`GoalView.tsx`=`4DECDCC6BA8EC487401CEEBAABDE930A90C19795E69862F8CEC33FAF8BA33413`、
  `hierarchyPresentation.ts`=`6E20C92FC83DEF0F7063A9825BCA123364C3CA283DD3C88BE2804F650FAC6F4C`、
  `index.css`=`6E85509CEE4F55EDB7BB860BFB608F79F99DEC148EF8DBF829172F906B3D3905`、
  `DEV-121 static verifier`=`249EFA2A77CD1A1D33FB515C00223C6B91F436BF8BC8D248B4952DF5BAA5177E`、
  `DEV-121 browser verifier`=`BCC200468359C70762171E7913C6612ABAC669A717AD8A2EEB201F25295E5DF5`、
  `static result`=`8A5C88940291832478D1983523ECA906560ED2F3592F7D37FF62C24B78D61A17`、
  `browser result`=`816CA1C9E10012054E63594EF7DA59B1C13DFC09CEAD1912BB2445AC7F62CCBA`。
- Evidence：`output/playwright/dev-121-goal-hierarchy-comparison/`；local candidate 維持 QC Ready，未 commit／push／deploy／release。

## 9.6 R11 Execution Record（2026-09-14；已由 R12 修正 active rowSpan 邊界）

- DEV-121 static 16/16、browser 23/23；5 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- V14 實測 active vertical width `2px`、active branch height `2px`；V15 實測目前任務／planning／涵蓋 A1 的 rowSpan owner content tint 均為 `rgba(199, 210, 254, 0.94)`，`owner`／`covered` 結構與內容值維持不變。
- R10 的 self incoming lineage、root isolation、normal connector tone、rounded joins、8px depth、12px branch、endpoint count=0、
  disclosure-to-guide left gap `0px`、branch-to-title distance `0px` 全部維持；未新增 DOM、gutter 或第二 scroll owner。
- DEV-116／119／120 targeted regressions、`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、targeted `git diff --check` PASS。
- Source hashes：`GoalView.tsx`=`BFA6F1648D9AC48C87F12A5349044E6B5CD7CB3B454DCFDF60A7AAB15E3CD042`、
  `hierarchyPresentation.ts`=`6E20C92FC83DEF0F7063A9825BCA123364C3CA283DD3C88BE2804F650FAC6F4C`、
  `index.css`=`19268ABCA8E0DEFD1949DE18652A4E92F8877AD755D38CA173B0C24D0552A92F`、
  `DEV-121 static verifier`=`56C3E910A43DB43E179F8EA1AAAF09B5F36EC9A455DAA0E47A35369301835577`、
  `DEV-121 browser verifier`=`3504A1F3D4D24549AE05E6E26248F31BC9328003B7059C0DCAD7E4B5AEC6FFDA`、
  `static result`=`5CD7C9B6B692E107415151F7C81819BD73C8472FA79D99CE4D3F6D75A7C8D62F`、
  `browser result`=`7EB4B757B88FF9DC0E5080804C738A259A738548A35A2EAF5A216319655E8FD7`。
- Evidence：`output/playwright/dev-121-goal-hierarchy-comparison/`；local candidate 維持 QC Ready，未 commit／push／deploy／release。

## 9.7 R12 Execution Record（2026-09-15）

- DEV-121 static 16/16、browser 24/24；5 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- V15 實測 A1 active 時 task／planning 使用 `rgba(199, 210, 254, 0.94)`，涵蓋 A1 的 ancestor rowSpan owner 保持 group surface；
  V16 實測 Root A 自有 rowSpan owner 使用 `rgba(199, 210, 254, 0.94)`，`contentScope=active`。
- R11 的 active connector 2px、self incoming lineage、root isolation、8px depth、12px branch、endpoint count=0、
  disclosure-to-guide left gap `0px`、branch-to-title distance `0px` 全部維持；未新增 DOM、gutter 或第二 scroll owner。
- DEV-116／119／120 targeted regressions、`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、targeted `git diff --check` PASS。
- Source hashes：`GoalView.tsx`=`823E0F41DD0435521115585F005806D1C4B712DC4660EDF1FE89861D62BA9946`、
  `hierarchyPresentation.ts`=`6E20C92FC83DEF0F7063A9825BCA123364C3CA283DD3C88BE2804F650FAC6F4C`、
  `index.css`=`19268ABCA8E0DEFD1949DE18652A4E92F8877AD755D38CA173B0C24D0552A92F`、
  `DEV-121 static verifier`=`EC125B2A9610550493BD47ED8003437DCAF50510DAAE24BEA529AC8393B8DBF8`、
  `DEV-121 browser verifier`=`81D08D5DF38B638F8D853D7AE28DEDD0B781DE7E8035E169C5A35313D72A30B4`、
  `static result`=`9AF660606B9A3FE7A03A6239516EF99E98E6260CE2A530CA9FAD0993993EE646`、
  `browser result`=`F12A2B18D91250324AABFCC30603B893701C760A3A88132CC7E075D334B03094`。
- Evidence：`output/playwright/dev-121-goal-hierarchy-comparison/`。
- local candidate 維持 QC Ready，未 commit／push／deploy／release。

## 9.8 R13 Execution Record（2026-09-15）

- DEV-121 static 16/16、browser 27/27；5 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- B11 實測滑入 description 與 meeting 的 `rowSpan` owner cell，兩者都以 `ownerTaskId=dev121-root-a` 設定 active scope；
  V17 實測再回到 A1 任務列時，owner identity 仍為 Root A、active task 回到 `dev121-a1`，沒有新增 covered content owner。
- B12 逐一移入 task、assignee、status、start-date、end-date、duration 欄位，六個欄位都解析到
  `dev121-a1a1` 自身，證明所有一列一任務欄位共用同一個 row owner。
- R12 的 owner／covered tint 邊界、active connector 2px、self incoming lineage、root isolation、8px depth、12px branch、
  endpoint count=0、disclosure-to-guide left gap `0px`、branch-to-title distance `0px` 全部維持；未新增 DOM、gutter、
  selection、store、persistence 或第二 scroll owner。
- DEV-116／119／120 targeted regressions、`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、targeted `git diff --check` PASS。
- Source hashes：`GoalView.tsx`=`8B9243CE4EFBF03EF106E3697D5C3710AC09B706D48FF4090D783C9979DE7D9A`、
  `hierarchyPresentation.ts`=`6E20C92FC83DEF0F7063A9825BCA123364C3CA283DD3C88BE2804F650FAC6F4C`、
  `index.css`=`19268ABCA8E0DEFD1949DE18652A4E92F8877AD755D38CA173B0C24D0552A92F`、
  `DEV-121 static verifier`=`A0B2975ED5AE30122E79F7037BEEFDFF0E7265C79AD0C7452A122B7BD5202142`、
  `DEV-121 browser verifier`=`321D3DCF81E6BDBB344EA7B6D7673EAA00F19D57EC9CF98A977EAF19E6C910B5`、
  `static result`=`81E12A971B818B54E86EA1DA52AEDDDA9326786FF9F6DD78E1ED8D86C0B133E7`、
  `browser result`=`297FC0D4B472F983E6EDF5F6C46B696099B91399664311487FB682A53C212CE9`。
- Evidence：`output/playwright/dev-121-goal-hierarchy-comparison/`。
- local candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.9 R14 Execution Record（2026-09-15）

- DEV-121 static 17/17、browser 27/27；5 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- V10 實測 46 個可捲動 comparison cells 全部有 1px `border-bottom` 與 `border-right`；任務名稱欄 task cells
  `taskBottomBorders=[]`，root boundary 在可捲動欄位為 `2px`、任務名稱欄為 `0px`。
- R13 的 B11／B12 反向定位、V17 owner identity、active connector、rowSpan owner／covered tint 邊界、single X-scroll
  與 native table 全部維持通過；沒有新增 table、gutter、selection、store、persistence 或第二 scroll owner。
- DEV-116／119／120 targeted regressions、`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、targeted `git diff --check` PASS。
- R14 frozen-candidate SHA-256：`src/components/GoalView.tsx`=`299f2909c08243239b717520f168163e77a85bb0dee6f033b0799d3d3ee2678b`、
  `src/features/goalMode/hierarchyPresentation.ts`=`6e20c92fc83def0f7063a9825bca123364c3ca283dd3c88be2804f650fac6f4c`、
  `src/index.css`=`cb0f6881f36abf88ca1e9dde60adbe5f0ef624f255f9365b1c9157eca1a7710d`。
- Verification SHA-256：`scripts/verify-dev-121-goal-hierarchy-comparison.ts`=`ab9920a37e0e3241ac7a3e142a9d8fb1ccfbe48f0cd0a7bd47b1ecddb3091167`、
  `scripts/verify-dev-121-goal-hierarchy-comparison-browser.pw.js`=`a0bde2ae44152750940efbafb70c5a58e1a1f3e9307f96bb50fb6ee5d2c92b2d`、
  `output/playwright/dev-121-goal-hierarchy-comparison/static-result.json`=`79999a6400af99baa12e6598ea993eaf2e87969eae959440e044d4209721c53d`、
  `output/playwright/dev-121-goal-hierarchy-comparison/result.json`=`291e5926909f1e3a1020380d894d80fc80f3e12c5a68f2769bc5c679f6856b36`。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.10 R15 Execution Record（2026-09-15）

- DEV-121 static 18/18、browser 28/28；6 screenshots；browser errors=0、HTTP failures=0、visible errors=0。
- V09 實測 expanded node 6px、20×20px hit target、node center 對 own rail 偏差 ≤0.5px、hit target 不越過 title，
  chevron SVG computed `display:none`；owner rail gap 維持 ≤1.1px。
- B03 pointer toggle 維持 canonical collapse 結果；A04 以鍵盤 Enter 收合／展開，collapsed node 實測 8px 空心、
  2px border、焦點保留、`aria-expanded` 正確，且 collapsed root 的 4px root branch 仍存在並與 node 同心。
- R14 cell grid、R13 全欄位反向定位、R12 rowSpan ownership、active connector、single X-scroll、native table、
  DnD 與 menu 均維持通過；shared `TaskHierarchyIndentedRow` 未修改。
- DEV-116／119／120 targeted regressions、`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` PASS。
- R15 frozen-candidate SHA-256：`src/components/GoalView.tsx`=`0b43aaaabbb6ea1e73f4583fb6bcb13a6552ee68814f08217c4165007b9e69cf`、
  `src/features/goalMode/hierarchyPresentation.ts`=`6e20c92fc83def0f7063a9825bca123364c3ca283dd3c88be2804f650fac6f4c`、
  `src/index.css`=`e220763dcaada3e6102e46de6a2e6eda1765272645335dd89dc9dedbc872af9b`。
- Verification SHA-256：`scripts/verify-dev-121-goal-hierarchy-comparison.ts`=`91949d3068930687105a844ba095d5015ea6e132ca51b036bb0961f1fd1c2246`、
  `scripts/verify-dev-121-goal-hierarchy-comparison-browser.pw.js`=`8d7f3b999284984cd5a38e63222a076cfe4bcbc2f884389d5c255b13a34bbcb3`、
  `output/playwright/dev-121-goal-hierarchy-comparison/static-result.json`=`80b09a03be44e1581bac5f309929a1fdff905e70c281e2851211a01005a4716b`、
  `output/playwright/dev-121-goal-hierarchy-comparison/result.json`=`826adf86b1606c6a8f9805025c509ceb105da526c44c55bf3d99d0aba5896e08`。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.11 R16 Execution Record（2026-09-15）

- DEV-121 static 19/19、browser 28/28；V14 直接量測 current task self upstream vertical／branch 為 inactive 1px
  normal tone，descendant vertical 保持 active 2px；browser errors=0、HTTP failures=0、visible errors=0。
- hover screenshot 證明定位任務左側不再出現多餘的粗藍垂直段；連入短支線、own child stem 與後代 lineage
  仍可辨識，沒有退回無線樹狀表格。
- DEV-116／119／120 targeted regressions、`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、
  `git diff --check` PASS。
- R16 frozen-candidate SHA-256：`src/components/GoalView.tsx`=`86302230b4a8315078d63c6709b84d72a59fbee29f059eedd4ee55f29f07ad4a`、
  `src/features/goalMode/hierarchyPresentation.ts`=`6e20c92fc83def0f7063a9825bca123364c3ca283dd3c88be2804f650fac6f4c`、
  `src/index.css`=`e220763dcaada3e6102e46de6a2e6eda1765272645335dd89dc9dedbc872af9b`。
- Verification SHA-256：`scripts/verify-dev-121-goal-hierarchy-comparison.ts`=`3216ba7607744c9f332012a513b4a22cf13d2a9a88df78fa504232b1f06a4222`、
  `scripts/verify-dev-121-goal-hierarchy-comparison-browser.pw.js`=`9de6ce8b9f1dc92511c00ecae561e4a199e6a88558c534a3086e06a748d97c16`、
  `output/playwright/dev-121-goal-hierarchy-comparison/static-result.json`=`3b954375e24acd7c28051c5dab51d4b3bd2f7be24ace06968b61e6a4411cb46d`、
  `output/playwright/dev-121-goal-hierarchy-comparison/result.json`=`37d445feffe97e3eff0655526cbbd69a06f4e1ec6e8f1c3cd75cf1d19d8c15d5`。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.12 R17 Execution Record（2026-09-15）

- DEV-121 static 20/20、browser 維持 28/28；V02 實測 Goal depth step `10.4px`，相對 8px 基準為 1.30 倍，
  branch-to-title distance `0px`、incoming branch width `14.4px`、node geometry 與 endpoint count=0 均維持。
- R16 定位線降噪、active subtree、rowSpan owner、反向定位、格線、固定任務欄與 single X-scroll 維持通過；
  browser errors=0、HTTP failures=0、visible errors=0。
- DEV-116／119／120 targeted regressions、`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、
  `git diff --check` PASS。
- R17 frozen-candidate SHA-256：`src/components/GoalView.tsx`=`86302230b4a8315078d63c6709b84d72a59fbee29f059eedd4ee55f29f07ad4a`、
  `src/features/goalMode/hierarchyPresentation.ts`=`6e20c92fc83def0f7063a9825bca123364c3ca283dd3c88be2804f650fac6f4c`、
  `src/index.css`=`577fb4e54432fff1c80695f937d0e64b21e9b2ab1ed1fe06383e8b899f3403b5`。
- Verification SHA-256：`scripts/verify-dev-121-goal-hierarchy-comparison.ts`=`889020c0ddcc48d3aabb09bd403ba349a255519f813f70853e842c7fe928bb49`、
  `scripts/verify-dev-121-goal-hierarchy-comparison-browser.pw.js`=`36441d26035719a25e3e6cf799a8b9882471829aa3c6daf2807a03cb0e2e80e1`、
  `output/playwright/dev-121-goal-hierarchy-comparison/static-result.json`=`fa88e8ac7bd44c2261c0cd6f92760189945ab42470aeaa20b68fc7308354a303`、
  `output/playwright/dev-121-goal-hierarchy-comparison/result.json`=`1431cb0a50d92bfe15da4d9a52682fc95b3a60a9e81a5684e9e40889d08990a6`。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.13 R18 Execution Record（2026-09-15）

- DEV-121 static 21/21、browser 28/28；V15 實測 task-name cell 不含 `rgba(199, 210, 254, 0.94)` active tint，planning scope tint 保持，rowSpan owner／tree guides／reverse location 未改變。
- browser errors=0、HTTP failures=0、visible errors=0；DEV-116／119／120 targeted regressions、TypeScript、targeted ESLint、test build、diff check PASS。
- R18 frozen-candidate SHA-256：`src/index.css`=`fbe4d617ded6875a8087f02829a815d35c021cccbc353b8b4a6b4a546de52a0b`、
  `scripts/verify-dev-121-goal-hierarchy-comparison.ts`=`38a1fb45c2440748bad5133d7d34dbdeada373802d2182743af8f0afd04c2598`、
  `scripts/verify-dev-121-goal-hierarchy-comparison-browser.pw.js`=`95bea4a6da73971c781d2f08f080e1539e6c4002b8036076a1a2b54b89743e86`。
- R18 verification SHA-256：`output/playwright/dev-121-goal-hierarchy-comparison/static-result.json`=`f35f43ba69b78c152febdc167c0d3ba182f27fd658c58fc947062ee403487993`、
  `output/playwright/dev-121-goal-hierarchy-comparison/result.json`=`ab60b379aba2fa12187d656c02da2a6a5ed9fe1f18c5c79f4a19d77f177032d4`。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.14 R19 Execution Record（2026-09-15）

- DEV-121 static 22/22、browser 29/29；S22 與 V19 實測 8 個 task-name cells（root、L1、L2+）的 computed background 全部為 `rgb(255, 255, 255)`，unique background 只有 1 個值。
- R18 的 active scope 邊界維持：task-name fixed lane 不染 active／hover fill，planning 與真正 content owner cell 仍保留定位色；樹線、node toggle、rowSpan owner、reverse location、scrollable gridline 未改變。
- browser errors=0、HTTP failures=0、visible errors=0；DEV-116／119／120 targeted regressions、TypeScript、targeted ESLint、test build、diff check PASS。
- R19 frozen-candidate SHA-256：`src/components/GoalView.tsx`=`b319e7b21b5cc90a679010804ee171e2b51cbd2dc2b43a54eb19a54333e09200`、`src/index.css`=`29d19cb7374d595b81d8abf178a8b90330472f3ade83f903a45f7cba26f5e493`。
- R19 verification SHA-256：`scripts/verify-dev-121-goal-hierarchy-comparison.ts`=`ecbb985c66f6f5b2f06fd2a01413e87139b0d1ca92cf72cf0f3a180cef05cda4`、`scripts/verify-dev-121-goal-hierarchy-comparison-browser.pw.js`=`56cf60e0a56ccefaa6b7eb1b7d48e08a0a8f62d9d9a5ed8d6ad03bcabed9aca8`、`output/playwright/dev-121-goal-hierarchy-comparison/static-result.json`=`bbae6bc2dc274617033d0ad17b84ee7052826fdcdab1d34eb50246cda7dfa158`、`output/playwright/dev-121-goal-hierarchy-comparison/result.json`=`5dd74fe7e30259d654617f62af070df15ad19f62ea3fcf94915e29de96274259`。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.15 R20／R21 Execution Record（2026-09-16）

- DEV-121 static 23/23、browser 32/32；S23 讀回 `data-goal-description-column-toggle`、`aria-expanded`、collapsed state 與 32px placeholder contract；B13 完成 expanded → collapsed → expanded，V20 讀回柔和 task-name 定位色。
- 現有 `localhost:4000` browser tab 只做 read-only smoke：expanded → click collapse → state=`collapsed`、toggle `aria-expanded=false`、placeholder width=32px、owner content count=0 → click restore → state=`expanded`、owner content 恢復。
- V20 CSS rule readback：parent `rgba(224, 231, 255, 0.72)`、descendant `rgba(239, 246, 255, 0.76)`；idle task-name surface 仍為 `rgb(255, 255, 255)`。
- TypeScript、targeted ESLint、`npm run build:test`、`git diff --check` PASS；browser smoke 未產生 browser／HTTP／visible error。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.16 R22 Execution Record（2026-09-16）

- DEV-121 static 24/24；S23 讀回所有可見欄位 toggle、32px compact track、88px task hierarchy track 與 placeholder contract；S24 讀回 `goalCollapsedColumns` 帳號偏好服務。
- Chromium B14 逐一收合／還原所有可見欄位通過；B15 以 account-scoped local preference 保存 description／status／duration，重新載入後狀態與 placeholder 均恢復，再完成還原。
- browser 34/34、browser／HTTP／visible errors=0；`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` PASS。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release；remote persistence 由現有 `profiles.ui_preferences` 路徑使用 local-test／mocked backend smoke，未宣稱正式環境同步 gate。

## 9.17 R23 Execution Record（2026-09-16）

- DEV-121 static 25/25；S23～S24 維持可收合欄位的 32px 與帳號偏好契約，S25 確認 `goal-column-task` 表頭只顯示「任務名稱」且沒有欄位收合 toggle。
- Chromium B14 逐一收合／還原所有可見可收合欄位通過；固定任務名稱欄未出現在 toggle 集合且維持 252px，其他欄位均收合為 32px。B15 的 account-scoped preference reload／restore 維持通過。
- browser 34/34、browser／HTTP／visible errors=0；`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` PASS。
- 既有偏好若含 `task` key 由 Goal UI normalization 過濾，不改寫 schema 或新增 migration；本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.18 R24 Execution Record（2026-09-16）

- DEV-121 static 25/25；S23 讀回 compact toggle 的 24px button、18px glyph frame、5px radius、狀態 hook、focus ring 與 reduced-motion contract，S24～S25 的帳號偏好與 fixed task lane 契約維持。
- Chromium B13 實測 expanded／collapsed geometry 與色差：button `24×24px`、glyph `18×18px`、radius `5px`，collapsed 背景與 expanded 不同；內容仍正確收合為 32px 並可還原。B14～B15、V01～V20 維持通過。
- 保存 `B13-dev121-compact-column-toggle-collapsed-1440x900.png` 與 normal V01 畫面；表頭控制在正常狀態為低對比白底細框，collapsed 才使用 primary tint，未新增說明文字或額外表面。
- browser 34/34、browser／HTTP／visible errors=0；TypeScript、targeted ESLint、`npm run build:test`、`git diff --check` PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.19 R25 Execution Record（2026-09-16）

- DEV-121 static 25/25；S23 讀回 expanded 24px／18px 與 collapsed 20px／16px control geometry、5px／4px radius、狀態 hook、focus ring、reduced-motion 與 22.4px compact width contract，S24～S25 的帳號偏好與 fixed task lane 契約維持。
- Chromium B13 實測 collapsed description track computed width 約 `22px`（CSS token `22.4px`）、button `20×20px`、glyph `16×16px`、radius `4px`；B14 逐一收合／還原所有可見欄位，B15 reload／restore 與帳號 scoped preference 維持通過。
- B14 額外同時收合 7 個可見欄位後，逐欄 computed width 均為 `22px`，整張 table computed width `409px`（`252 + 7 × 22.4` 的取整結果），證明 table 不會因剩餘空間分配而放大 compact track。
- browser 34/34、browser／HTTP／visible errors=0；TypeScript、targeted ESLint、`npm run build:test`、`git diff --check` PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.20 R26 Execution Record（2026-09-17）

- DEV-121 static 26/26；S26 讀回空白日期不渲染額外 `—`、完整表頭標籤 hook 與 owner／status／start／end／duration 的內容適配寬度。
- Chromium B16 使用 `startDate=''`、`endDate=''` fixture，讀回兩個空日期 cell `textContent=''`；computed header widths 為 owner `144px`、status `72px`、start `112px`、end `112px`、duration `84px`，七個欄位標題均無 overflow。
- 既有 B13～B15、V01～V20、A01～A04、G01～G02 維持通過；browser 35/35、browser／HTTP／visible errors=0。
- `npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.21 R27 Execution Record（2026-09-17）

- DEV-121 static 27/27；S27 確認結束日期欄只保留必要的依賴關係 Link 提示，不再渲染工期鎖定的重複 `L` 標記。
- Chromium B17 使用 `isDurationLocked=true` fixture，讀回結束日期 input `readOnly=true`、工期鎖定控制存在，且 end-date cell `textContent` 不含 `L`；代表截圖為 `output/playwright/dev-121-goal-hierarchy-comparison/B17-dev121-duration-lock-no-inline-marker-1440x900.png`。
- 既有 B13～B16、V01～V20、A01～A04、G01～G02 維持通過；browser 36/36、browser／HTTP／visible errors=0。
- `npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 9.22 R28 Execution Record（2026-09-17）

- DEV-121 static 28/28；S28 讀回會議紀錄 line-aligned viewport、`data-goal-content-row-clipped` 與 CSS `visibility:hidden` 契約。
- Chromium B18 使用 10 筆長會議紀錄 fixture：`rowCount=10`、`overflowY=auto`、`scrollHeight=400 > clientHeight=180`、`clientHeight % 20 = 0`，部分可視列 `partialRowsHidden=true`；代表截圖為 `output/playwright/dev-121-goal-hierarchy-comparison/B18-dev121-meeting-history-no-clipping-1440x900.png`。
- 既有 B01～B17、V01～V20、A01～A04、G01～G02 維持通過；browser 37/37、browser／HTTP／visible errors=0。
- `npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

## 10. Pass／Fail／Stop

- PASS：S01～S28、B01～B18、V01～V20、A01～A04、G01～G02 及 DEV-116／119／120 required
  regressions 在同一 frozen candidate 全部通過，且 evidence 可追溯。
- Fail：任一 requirement 不符、evidence 缺失、visible error、actor／fixture 不可信、existing oracle 被放寬或資源未清理。
- Not verified：只有 source inspection、build、單張 screenshot 或主觀目視，不能宣稱 browser／visual／interaction PASS。
- Stop and return to planning：需要改 SPEC-121 禁止區、共享 hierarchy default、content ownership/session、
  rowSpan 模型或 scroll architecture。
- QA／QC 完成後仍是 local candidate；commit、push、deploy、production、原生 browser UI zoom 與正式資料驗證
  由獨立 release gate 承接。

使用思考習慣：#可驗證性、#系統描繪、#限制條件、#差距分析
