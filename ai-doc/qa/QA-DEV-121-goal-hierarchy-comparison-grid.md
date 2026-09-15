# QA-DEV-121：OKR 父子任務樹狀對照與群組範圍

- 狀態：`R13 Executed / Targeted QA PASS / QC Ready / NOT RELEASED`。
- 對應 SPEC：[SPEC-121](../specs/SPEC-121-goal-hierarchy-comparison-grid.md)。
- 對應 DEV：[DEV-121](../dev_task.md#dev-121okr-父子任務樹狀對照與群組範圍)。
- 驗證角色：RD 先做同一 candidate self-test；QA 依本文件重跑；QC 只採信可追溯 artifact 與事實結果。
- 測試層級：pure/static contract、真實 Chromium browser、computed geometry、keyboard／pointer、viewer、
  visual evidence、DEV-116／119／120 regression。

## 1. 驗證目標

證明 DEV-121 增加的是 Goal-only 階層閱讀層：使用者能辨識父子路徑、root group 終點與同列 planning
資訊；同時保留 native `rowSpan` 群組脈絡、fixed task-name first column、single X-scroll、內容 cell
生命週期、planning mutation、DnD、menu 與 native table semantics。

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
| S09 | 重用既有 row／level／planning／cell-kind／span hooks；新增 hooks 只含 task-cell、group-span、guides／last-sibling、descendant-count。guides `aria-hidden`、`pointer-events:none`；`+N` 具 accessible label。 |
| S10 | reading selector 只含 task／planning hooks，明確排除 group content；禁止泛用 `tr:hover > *`。 |
| S11 | 沒有 card、split table、second X-scroll、persistent hierarchy store、selection state、重複 root metadata 或 content clone。 |
| S12 | package scripts、SPEC／QA／dev_task／documentation map 互鏈，狀態一致。 |

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
| B07 | task details、task-name right-click／Shift+F10、disclosure 與 DnD 仍可操作；guide 不截取事件。 |
| B08 | planning owner／status／dates／duration 的合法修改可由 canonical List readback；locked／viewer 無非法 mutation。 |
| B09 | description F2／雙擊、保存／失敗恢復、expand／collapse、meeting Y-scroll 與 content menu 通過 DEV-119 契約。 |
| B10 | 垂直與水平捲動後 sticky header／task column、portal、focus target 與唯一 scroll owner 保持正確。 |
| B11 | 游標移入任務目的或會議紀錄的實際 owner cell 時，反向定位到該 `ownerTaskId` 任務；description／meeting 兩欄結果一致。 |
| B12 | 游標移入任務名稱、負責人、狀態、開始日期、結束日期或工期欄位時，active scope 都解析到該列所屬任務。 |

## 6. Rendered Visual／Geometry Cases

| ID | 驗證 |
|---|---|
| V01 | 1440×900 screenshot 可辨識兩個 root anchors、L1～L4+ parent paths、last sibling 與 group ends。 |
| V02 | incoming／continuation／child-stem computed width 1px；無 endpoint；Goal depth=8px、branch=12px；branch-to-title distance ≤0.5px；guide 位於 frozen task `th`，不影響 title／focus ring。 |
| V03 | 第二個及後續 root 只有一條 2px 上邊界；第一 root 無頂線，最後 group 不重複 end line，且沒有 spacer row／card／stripe／badge。 |
| V04 | `rowSpan > 1` owner 有 group surface／2px scope rail；`rowSpan = 1` 無；selected／editing outline 優先可見。 |
| V05 | connector reading guide 僅覆蓋 task＋planning cells；active descendant 不染 ancestor `rowSpan` owner，正常、hover、focus、open、locked、validation、due 狀態不互相吞沒。 |
| V06 | 1298×698 的 252px task、content min width、112／64／96／96／60 planning tracks 仍各 ±1px。 |
| V07 | 814×698 X-scroll ≥160px 後 task header／body left delta ≤1px；其他欄位位移與 scroll delta 相差 ≤1px；X-scroll owner=1。 |
| V08 | 814×698＋2x CSS zoom proxy 無必要文字／control／guide 裁切、重疊或第二水平 scrollbar。 |
| V09 | 同一 `ownerTaskId`／lane 的垂直線段 gap ≤1.1px；左側 disclosure 右端不得超過最左 connector，且箭頭不與線重疊。 |
| V10 | task rows 的 computed `border-bottom` 全部為 0；root group boundary 仍為 2px，確認任務間沒有橫向格線。 |
| V11 | 每列 branch 的 Y 中心對準任務列中心 ±1px；最後 sibling 的 incoming vertical 在中心終止，非最後 sibling 延伸至列底；root 無 incoming line。 |
| V12 | hover／focus A1 時，只啟用 A1 所擁有的 child stem、後代 incoming／continuation，加上 A1 自己的 parent-owned incoming relation；Root A 的 continuation 與其他 sibling 擁有的線維持中性。 |
| V13 | normal connector 使用低對比色、active connector 保持可辨識 indigo，所有線段有圓角端點；不得新增 endpoint 或改變幾何。 |
| V14 | hover／focus A1 時，A1 自己的 parent-owned `incoming-vertical`／`incoming-branch` 必須同步 active 且 stroke ≥2px；root task 無 parent relation 時不新增線段。 |
| V15 | hover／focus A1 時，目前任務與 planning cells 使用明顯 active tint，但涵蓋 A1 的 ancestor `rowSpan` owner content 保持 group surface；`owner`／`covered` 結構與內容值不變。 |
| V16 | hover／focus Root A（實際 description owner）時，該 owner cell 使用明顯 active tint；證明染色只落在資料真正所屬的任務。 |
| V17 | 從任務目的／會議紀錄 owner cell 反向定位後，樹線 active scope 的 task id 仍等於該 owner；不把 covered descendant 當成內容所有者。 |

視覺比較至少保存 normal、hover、keyboard focus、collapsed、X-scrolled、rowSpan editing／expanded、viewer、2x zoom
截圖；每張標記 viewport、actor、case 與 source hash。

## 7. Accessibility 與 Error Gate

| ID | 驗證 |
|---|---|
| A01 | native table、headers、scope=row、rowSpan、DOM focus order 與 control accessible names 不變。 |
| A02 | guides 不在 accessibility tree／tab order；collapsed count 讀為「已收合 N 個下層任務」。 |
| A03 | 移除顏色或 forced-colors 下仍能靠縮排、rail、elbow、root boundary 與文字辨識階層。 |
| G01 | unexpected role=alert、inline error、load failed、page/console error、HTTP 4xx/5xx 或 critical fixture=0 皆 Fail。 |
| G02 | 測試過程沒有殘留 task-owned runtime、browser tab、terminal 或 output writer；無法確認 owner 時不得清理他人資源。 |

## 8. FMEA

| Failure mode | Effect | Detection | Gate |
|---|---|---|---|
| decoration 自建 hierarchy truth | filter／collapse 後線與 rows 分歧 | S01～S06、B02～B04 | Stop/Fail |
| decoration 保留可由 row 直接取得的欄位 | metadata drift、測試與 DOM 膨脹 | S02、S09、source review | Fail |
| `tr:hover` 誤含 rowSpan cell | 子任務資料與父 content 混淆 | S10、B06、V05 | Fail |
| guides 擋 hitbox | 無法展開、拖曳、開詳情或選單 | S09、B07 | Fail |
| group surface 改 owner／rowSpan | 內容歸屬或編輯 session 錯誤 | B05、B09、DEV-119 regression | Stop/Fail |
| content owner hover 未反向定位 | 使用者從目的／會議紀錄無法回看所屬任務 | B11、V17、S12 | Fail |
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

## 10. Pass／Fail／Stop

- PASS：S01～S16、B01～B12、V01～V17、A01～A03、G01～G02 及 DEV-116／119／120 required
  regressions 在同一 frozen candidate 全部通過，且 evidence 可追溯。
- Fail：任一 requirement 不符、evidence 缺失、visible error、actor／fixture 不可信、existing oracle 被放寬或資源未清理。
- Not verified：只有 source inspection、build、單張 screenshot 或主觀目視，不能宣稱 browser／visual／interaction PASS。
- Stop and return to planning：需要改 SPEC-121 禁止區、共享 hierarchy default、content ownership/session、
  rowSpan 模型或 scroll architecture。
- QA／QC 完成後仍是 local candidate；commit、push、deploy、production、原生 browser UI zoom 與正式資料驗證
  由獨立 release gate 承接。

使用思考習慣：#可驗證性、#系統描繪、#限制條件、#差距分析
