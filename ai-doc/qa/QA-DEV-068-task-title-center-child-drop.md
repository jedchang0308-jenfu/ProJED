# QA-DEV-068：任務完整預選範圍停留移入子任務

狀態：Executed / AI Browser QA-QC Passed / Physical Mobile 未充分驗證

日期：2026-08-15

對應規格：`ai-doc/specs/SPEC-068-task-title-center-child-drop.md`

## 1. 驗證目標

用 AI 在真實渲染頁面操作滑鼠與 synthetic touch，證明 L1/L2/L3+ 的子任務命中區等於 DEV-065 完整藍框，而非標題文字；前 1 秒保留原排序／lane/promotion，滿 1 秒後才由 child intent 接管，放開只提交一次到 exact target。

驗證採 Failure-first → RD → QA → QC：先保留失敗證據，再修產品，不以放寬斷言掩蓋真缺陷。

## 2. 風險模型

| 風險 | Gate |
|---|---|
| 實際仍只命中文字或標題尾端 | 比對 target scope、primary、subtree 與 preview hit-scope rect |
| 父框搶走內層子任務 | L1/L2/L3+ exact innermost target id |
| 展開鍵／輸入控制誤命中 | 在控制項中心停留 >1 秒，preview count 必須為 0 |
| 任務主表面 `role="button"` 被當控制項排除 | 主表面中心、底部空白、title tail 均須 candidate/armed |
| Candidate 搶走既有排序 | `<1s` 同時有 child candidate 與 standard indicator；release 不得成為 child |
| Armed 同時做兩種動作 | armed 時 standard indicator=0；release 一次 child commit |
| stale timer／快速切 target | A→B→A、leave/re-enter、auto-scroll 全部重算 dwell |
| source preview 遮住 parent／child insertion marker | desktop/mobile rect intersection=0；viewport clamp |
| 插入線仍像父層或兄弟層 | L2／L3／L4+ marker 起點相對欄位左側必須單調右移，並位於 exact target 子樹末端 |
| cycle／權限／目標失效 | self、descendant、viewer、revoked、filtered、archived、removed 均不得 child write |
| mobile action rail 雙重 terminal | action rail 進入即清 child；每次手勢 terminal=1 |
| 取消後卡住 | Escape、pointer/touch cancel、blur、pagehide、visibility、resize/orientation 後可立即重試 |
| 子樹或 undo 損壞 | parent/order/nodeType、descendant ownership、Undo/Redo 完整驗證 |

## 3. 核心真實操作矩陣

`verify:dev-068-task-title-center-child-drop-browser` 共 27 案：

- Desktop：pre-dwell standard release、armed exact child、L1、L3+、L2／L3／L4+ insertion-start depth matrix、target switch、主表面空白、lifecycle/a11y、armed leave、subtree/Undo、L1 source normalization、invalids、cancel matrix、stale target、scope/title variants/control exclusion。
- Mobile：pre-dwell standard release、armed exact child、L1、touchcancel、cancel matrix、L3+、leave/re-enter/edge scroll、action rail matrix、10 次 commit＋10 次 cancel。
- Viewports/error：1440x900、1024x768、390x844、430x932、320x844、console/network/visible error sweep。

關鍵斷言：

1. `data-task-child-drop-target="true"` 與 `data-desktop-task-hover-scope="true"` 在同一 L1/L2/L3+ scope。
2. title `SPAN` 不再持有 exclusive child-target marker。
3. hit-scope rect 包住 primary source 與 visible subtree；candidate/armed 使用 DEV-065 primary-500/primary-400。
4. Candidate：child insertion marker=0，standard insertion indicator=1；release 後 `parentId !== child target id`。
5. Armed：child insertion marker=1，standard insertion indicator=0；marker 起點依下一階層縮排，release 後 `parentId === exact target id`。
6. 控制項的實際矩形排除；task-source 主表面即使 `role="button"` 仍可命中。

## 4. Deterministic / Static Gate

`verify:dev-068-task-title-center-child-drop`：61/61，覆蓋：

- 999ms candidate / 1000ms armed。
- target switch/reset。
- canonical child append、L1 source normalization、cycle/self/archive/missing/cross-board。
- L1/L2/L3+ 完整 hover-scope marker 與 title marker 退役。
- source/subtree frame 樣式、fixed preview、pointer/finger upper-right 16px 與 edge fallback。
- 控制項幾何排除但 task-source 主表面保留。
- Desktop/mobile candidate 保留 direct/standard target，armed 才接管。
- Workbench來源明確排除child intent，保留未歸位任務原歸位流程。
- L1／L2／L3+ child insertion marker deterministic geometry、48px 最小寬度與 viewport clamp。

## 5. 相鄰回歸

必跑：

- DEV-065 static/browser：原 hover 藍框、primary/subtree 樣式、innermost handoff。
- DEV-053：mouse/touch session、click/right-click、cancel、Workbench boundary。
- DEV-054：mobile pan/long-press/raw finger/target stability/action rail。
- DEV-055：desktop before/after/column/drop indicator/origin/no-op。
- DEV-058 static：origin/insertion feedback。
- DEV-067：L1 promotion、column/root drop；pre-dwell 必須仍可提交，armed 才 child。

## 6. Failure-first 與修正紀錄

| 輪次 | QA 事實 | RD 修正 |
|---|---|---|
| 1 | 舊契約 target 是 shrink-wrapped title span | target 改掛 DEV-065 完整 hover scope；preview 加 primary/subtree frame |
| 2 | 離開 child scope 後 standard drop 仍可能移動，舊 zero-write 斷言過度 | 改驗證不得提交 stale child parent，允許當下 standard intent |
| 3 | 控制鍵案例抓到子樹內錯誤按鈕 | verifier 改抓 exact target primary control |
| 4 | fixed drag layer 讓 `elementFromPoint` 看不到底層按鈕 | 改以目標 scope 內控制項實際矩形排除 |
| 5 | `[role="button"]` 把整張 task source 排除 | 明確保留 `[data-task-surface-source="true"]` |
| 6 | Candidate 立即搶走同階排序，DEV-055/067 回歸 | 改為 candidate 共存 standard indicator，armed 才獨占 |
| 7 | 完整L1 scope誤攔Workbench未歸位任務 | 依`source="task-workbench"`排除child intent，恢復column append歸位 |
| 8 | L1慢速14段移入在高負載下已超過1秒 | pre-dwell案例改為單步進入立即release；armed案例獨立驗證滿1秒 |
| 9 | 使用者指出「移入子任務」文字 ghost 與其他階層拖曳語言不一致 | 退役可見文字 ghost；armed 改用既有圓點＋插入線，並以起點縮排表示下一階層 |

## 7. 已執行結果

- DEV-068 static/deterministic：61/61 PASS。
- DEV-068 rendered mouse/touch：27/27 PASS；candidate coexist、完整scope、Workbench與child insertion depth修正後由最終QC重跑確認。
- 核心最新 screenshot prefix：`output/playwright/dev-068-title-child-drop-1786808137276-*`。
- 相鄰browser：DEV-065 13/13、DEV-053 10/10、DEV-054 15/15、DEV-055 16/16、DEV-067 8/8，共62/62 PASS。
- Browser console error：0；network error：0；visible HTTP/UI error：0。
- 相鄰回歸與工程 gate 的最終數字以 `QC-DEV-068` 為準。

## 8. Physical Mobile Gate

本機 synthetic touch 可驗產品邏輯與 geometry，但不可取代：

- iPhone Safari 實機。
- Android Chrome 實機。
- 每平台至少 30 次 target-switch、20 次 cancel，記錄 wrong parent、stale target、double commit、卡死、手指遮擋、rotation/background 與 release freshness。

未完成前只可標 `AI Browser QA/QC Passed / Physical Mobile 未充分驗證`，不得標記完整 mobile sign-off 或 release ready。

## 9. Release Boundary

本輪未授權 push、deploy 或 release；沒有 schema、migration 或 production data 操作。
