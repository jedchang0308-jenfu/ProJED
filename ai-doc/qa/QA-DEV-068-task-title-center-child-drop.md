# QA-DEV-068：任務完整預選範圍停留移入子任務

狀態：Executed / AI Browser QA-QC Passed / Physical Mobile 未充分驗證

日期：2026-08-16

對應規格：`ai-doc/specs/SPEC-068-task-title-center-child-drop.md`

## 1. 驗證目標

用 AI 在真實渲染頁面操作滑鼠與 synthetic touch，證明 L1/L2/L3+ 的子任務命中區等於 DEV-065 完整預選範圍，而非標題文字；前 1 秒不顯示子任務藍框並保留原排序／lane/promotion，滿 1 秒後只顯示下一子階插入線並由 child intent 接管，放開只提交一次到 exact target。任務離開來源位置後，原位置另須保留唯一、尺寸穩定的虛線框。

驗證採 Failure-first → RD → QA → QC：先保留失敗證據，再修產品，不以放寬斷言掩蓋真缺陷。

## 2. 風險模型

| 風險 | Gate |
|---|---|
| 實際仍只命中文字或標題尾端 | 比對 target scope、primary、subtree 與 preview hit-scope rect |
| 父框搶走內層子任務 | L1/L2/L3+ exact innermost target id |
| 展開鍵／輸入控制誤命中 | 在控制項中心停留 >1 秒，preview count 必須為 0 |
| 任務主表面 `role="button"` 被當控制項排除 | 主表面中心、底部空白、title tail 均須 candidate/armed |
| Candidate 搶走既有排序 | `<1s` 同時有 child candidate 與 standard indicator；release 不得成為 child |
| 子任務藍框讓人誤判定位範圍或增加視覺噪音 | candidate／armed 的 primary/subtree/scope frame 全為 0；只有 armed 顯示 child insertion marker |
| Armed 同時做兩種動作 | armed 時 standard indicator=0；release 一次 child commit |
| stale timer／快速切 target | A→B→A、leave/re-enter、auto-scroll 全部重算 dwell |
| source preview 遮住 parent／child insertion marker | desktop/mobile rect intersection=0；viewport clamp |
| 來源離開後看不出原位置，或虛線框造成版面位移 | desktop 與 mobile 的 L1/L2/L3+ 量測來源框 outline、left/top/width/height；差異≤1px，cancel 後清除 |
| 插入線仍像父層或兄弟層 | L2／L3／L4+ marker 起點相對欄位左側必須單調右移，並位於 exact target 子樹末端 |
| 回到原位仍顯示一般插入線或誤寫入 | armed 顯示來源任務名稱、一般 marker=0；release 前後完整 node snapshot 相同且無成功播報 |
| cycle／權限／目標失效 | self、descendant、viewer、revoked、filtered、archived、removed 均不得 child write |
| mobile action rail 雙重 terminal | action rail 進入即清 child；每次手勢 terminal=1 |
| 取消後卡住 | Escape、pointer/touch cancel、blur、pagehide、visibility、resize/orientation 後可立即重試 |
| 子樹或 undo 損壞 | parent/order/nodeType、descendant ownership、Undo/Redo 完整驗證 |

## 3. 核心真實操作矩陣

`verify:dev-068-task-title-center-child-drop-browser` 共 30 案：

- Desktop：L1/L2/L3+ 來源原位虛線框、pre-dwell standard release、armed exact child、child-origin 名稱預覽／zero-write、L1、L3+、L2／L3／L4+ insertion-start depth matrix、target switch、主表面空白、lifecycle/a11y、armed leave、subtree/Undo、L1 source normalization、invalids、包含 orientationchange／resize 的 cancel matrix、stale target、scope/title variants/control exclusion。
- Mobile：L1/L2/L3+ 來源原位虛線框、pre-dwell standard release、armed exact child、child-origin 名稱預覽／zero-write、L1、touchcancel、cancel matrix、L3+、leave/re-enter/edge scroll、action rail matrix、10 次 commit＋10 次 cancel。
- Viewports/error：1440x900、1024x768、390x844、430x932、320x844、console/network/visible error sweep。

關鍵斷言：

1. `data-task-child-drop-target="true"` 與 `data-desktop-task-hover-scope="true"` 在同一 L1/L2/L3+ scope。
2. title `SPAN` 不再持有 exclusive child-target marker。
3. hit-scope rect 包住 primary source 與 visible subtree；candidate 的 primary/subtree/scope frame 全為 0。
4. Candidate：child frame=0、child insertion marker=0、standard insertion indicator=1；release 後 `parentId !== child target id`。
5. Armed：primary/subtree/scope target frame 全為 0，只有 child insertion marker，standard insertion indicator=0；marker 起點依下一階層縮排，release 後 `parentId === exact target id`。
6. 控制項的實際矩形排除；task-source 主表面即使 `role="button"` 仍可命中。
7. Child append 若不改變原父層／型態／兄弟順序：定位預覽使用既有藍底白字來源名稱、一般 marker=0，release 完整 node snapshot 不變且無成功 announcement。
8. Source origin placeholder：2px `primary-400` dashed outline；desktop 與 mobile 的 L1/L2/L3+ left/top/width/height 均與拖曳前來源佔位差≤1px，取消後 count=0。

## 4. Deterministic / Static Gate

`verify:dev-068-task-title-center-child-drop`：73/73，覆蓋：

- 999ms candidate / 1000ms armed。
- target switch/reset。
- canonical child append、L1 source normalization、cycle/self/archive/missing/cross-board。
- L1/L2/L3+ 完整 hover-scope marker 與 title marker 退役。
- target frame 不渲染、fixed insertion preview、pointer/finger upper-right 16px 與 edge fallback。
- 控制項幾何排除但 task-source 主表面保留。
- Desktop/mobile candidate 保留 direct/standard target，armed 才接管。
- Workbench來源明確排除child intent，保留未歸位任務原歸位流程。
- L1／L2／L3+ child insertion marker deterministic geometry、48px 最小寬度與 viewport clamp。
- Desktop 與 mobile 均註冊 orientationchange／resize 終止清理，viewport geometry 改變後不得沿用 armed target。
- `TaskChildDropPreview` 只在 armed render child insertion marker；primary/subtree/scope target frame 永不渲染。
- Child append 的 origin 判定比較 canonical 父層、nodeType 與完整兄弟順序；最後一個子任務回到目前父層為 no-op，非末位子任務移到尾端仍為真實 reorder。
- L1／L2／L3+ 共用來源虛線框 class 與 2px dashed token；L1 不再縮放／旋轉，neutral placeholder 維持單列原高。

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
| 1 | 舊契約 target 是 shrink-wrapped title span | target 改掛 DEV-065 完整 hover scope；preview 改以插入線表達 exact child 層級 |
| 2 | 離開 child scope 後 standard drop 仍可能移動，舊 zero-write 斷言過度 | 改驗證不得提交 stale child parent，允許當下 standard intent |
| 3 | 控制鍵案例抓到子樹內錯誤按鈕 | verifier 改抓 exact target primary control |
| 4 | fixed drag layer 讓 `elementFromPoint` 看不到底層按鈕 | 改以目標 scope 內控制項實際矩形排除 |
| 5 | `[role="button"]` 把整張 task source 排除 | 明確保留 `[data-task-surface-source="true"]` |
| 6 | Candidate 立即搶走同階排序，DEV-055/067 回歸 | 改為 candidate 共存 standard indicator，armed 才獨占 |
| 7 | 完整L1 scope誤攔Workbench未歸位任務 | 依`source="task-workbench"`排除child intent，恢復column append歸位 |
| 8 | L1慢速14段移入在高負載下已超過1秒 | pre-dwell案例改為單步進入立即release；armed案例獨立驗證滿1秒 |
| 9 | 使用者指出「移入子任務」文字 ghost 與其他階層拖曳語言不一致 | 退役可見文字 ghost；armed 改用既有圓點＋插入線，並以起點縮排表示下一階層 |
| 10 | commit 後 RD 稽核新增 desktop viewport-change 案，真實操作發現 orientationchange 後仍提交 child | Desktop drag lifecycle 補 orientationchange／resize cancel 與 listener cleanup；同案改驗 7 種終止來源並回歸通過 |
| 11 | 使用者要求子任務定位藍框完全取消；failure-first 先保留原 armed 藍框證據 | 移除 child preview 的 primary/subtree/scope frame，只保留 armed child insertion marker，並補 desktop/mobile frame count=0 gate |
| 12 | 使用者要求 child insertion 回到原位時沿用其他階層的任務名稱顯示 | 先加入 origin 判定失敗 gate；再共用 `TaskOriginTitleField`，並將 child-origin release 改為完整 zero-write/no-announcement |
| 13 | 使用者要求拖離後在原位置留下虛線框；failure-first 先證明三階均無此樣式，首輪 rendered 又抓到 L1 縮放／旋轉且 36px 原位被撐到約 61px | 三階共用不改盒模型的 2px dashed outline；移除 L1 source transform 並恢復 36px 原高。後續兩輪分別校正 transition 完成後取樣及 L2 應比較完整來源 scope，最終桌機 L1/L2/L3+ 與 mobile geometry 全 PASS |
| 14 | 擴充 mobile L1/L2/L3+ 後，功能斷言全通過，但最終 error sweep 抓到瀏覽器送出的不可取消 `touchcancel` 仍呼叫 `preventDefault()` | cleanup 只在 `event.cancelable` 時取消預設行為，保留 stop propagation 與 session cleanup；再以 static guard 與完整 browser error sweep 複驗 |

## 7. 已執行結果

- DEV-068 static/deterministic：73/73 PASS。
- DEV-068 rendered mouse/touch：30/30 PASS；來源原位虛線框、candidate／armed frame=0、armed insertion、child-origin 名稱預覽／zero-write、完整scope、Workbench與child insertion depth均由真實操作確認。
- 核心最新 screenshot prefix：`output/playwright/dev-068-title-child-drop-1786851252620-*`。
- 相鄰browser：DEV-065 15/15、DEV-053 10/10、DEV-054 15/15、DEV-055 16/16、DEV-067 8/8，共64/64 PASS。
- Browser true-operation 合計：94/94 PASS（核心30＋相鄰64）；console error：0、network error：0、visible HTTP/UI error：0。
- 相鄰回歸與工程 gate 的最終數字以 `QC-DEV-068` 為準。

## 8. Physical Mobile Gate

本機 synthetic touch 可驗產品邏輯與 geometry，但不可取代：

- iPhone Safari 實機。
- Android Chrome 實機。
- 每平台至少 30 次 target-switch、20 次 cancel，記錄 wrong parent、stale target、double commit、卡死、手指遮擋、rotation/background 與 release freshness。

未完成前只可標 `AI Browser QA/QC Passed / Physical Mobile 未充分驗證`，不得標記完整 mobile sign-off 或 release ready。

## 9. Release Boundary

本輪未授權 push、deploy 或 release；沒有 schema、migration 或 production data 操作。
