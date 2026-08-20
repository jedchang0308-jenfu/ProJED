# QA-DEV-074-AI：心智圖 AI 真實操作驗證計畫

- 狀態：`Executed / AI Real-Operation PASS / QC PASS`
- 關聯：`DEV-074`、`QA-DEV-074-mindmap-single-scene-coordinate-system.md`、`SPEC-027B`、`SPEC-027E`、`SPEC-027G`、`SPEC-070`、`SPEC-071`、`SPEC-073`
- 驗證角色：AI Browser Operator 執行；QC 依 artifact 做獨立事實判定；RD 不得修改 expected 來消除差異。
- 目標：用真實滑鼠、鍵盤、滾輪、拖曳與視窗操作，驗證使用者在心智圖中的主要工作流程，不以 source marker、store/API 直接寫入或單純 build 結果代替 UI 證據。
- 執行邊界：local runtime、fixture data、1440x900／1024x768／390x844；不含 production、deploy、release、正式資料或權限變更。

## 1. AI 執行原則

1. AI 必須先對目前 rendered page 做 hard-reload、snapshot 與 visible-error sweep，再開始任何操作。
2. 產品行為只能用真實 UI event 驗證：`click`、`dblclick`、`press`、`mouse.wheel`、middle-button pan、HTML drag/drop；不得用 `page.evaluate` 呼叫 store、React handler、localStorage 寫入來代替操作。
3. `page.evaluate` 僅允許兩個用途：case 開始前建立隔離 fixture、case 結束後讀取 DOMRect／SVG screen geometry／唯讀 storage 證據；所有寫入都必須在 fixture bootstrap log 明確記錄。
4. 每個 case 使用乾淨 fixture；操作失敗立即停止該 case，保存第一個有效錯誤、最後畫面與 DOM snapshot，不繼續累積未知狀態。
5. 每個主要操作後等待至少兩個 animation frame 加穩定等待，再量測；不得只用固定 sleep 判定完成。
6. 任何 `.inline-error`、`[role=alert]` 失敗訊息、HTTP 4xx/5xx、`Not Found`、`Internal Server Error`、console/page error、空資料或明顯破版都是 Fail；預期中的負向提示例外需在 case 明確標示。

## 2. 環境與 Fixture Contract

### 2.1 Runtime

- canonical repo：`C:\VIBE CODING\ProJED\ProJED`
- 預設 URL：`http://127.0.0.1:4000/?dev074Phase=after`
- 執行前先偵測相同 project／port／purpose 的既有 runtime；可重用則不得重啟。若由本輪啟動暫時 runtime，需記錄 PID／process tree／cleanup condition，結束只清理本輪擁有的 process tree。
- 建議 AI 操作入口：Codex Browser 或 Playwright CLI；`npx`、Node/npm 必須可用。

### 2.2 Fixture

每一個 case 開始前使用獨立 fixture，資料 bootstrap 不算產品操作證據：

| Fixture | 資料 | 用途 |
|---|---|---|
| `dev074-ai-navigation-v1` | `root-a`、`root-b`、各一個 child、無 relationship | selection、quick-title、expand、drag/drop |
| `dev074-ai-relationship-v1` | 同上，`root-a → root-b` 一條 relationship | label、style、handle、zoom stability |
| `dev074-ai-create-v1` | 同上，無 relationship、可 edit/create/move | 建立／取消 relationship、self-link negative |

所有 fixture 必須包含可辨識的標題、日期 badge、左右 root、至少一層 child；AI 需在 baseline snapshot 確認節點數、關係數與主要文字非空。

### 2.3 Stable Locator Contract

AI 優先使用下列 stable locator；找不到時才用可見文字，且需把 fallback selector 寫入 evidence：

| 目的 | Locator |
|---|---|
| 心智圖／viewport／scene | `[data-mindmap-view]`、`[data-mindmap-viewport="true"]`、`[data-mindmap-scene="true"]` |
| 節點 | `[data-mindmap-node="<id>"]` |
| 展開／收合 | `[data-mindmap-toggle-parent-id="<id>"]` |
| quick-title | `[data-mindmap-quick-title-input="true"]` |
| relationship tool | `[data-mindmap-note-relationship-tool]` |
| relationship click／label／handle | `[data-mindmap-note-relationship-click-target]`、`[data-mindmap-note-relationship-label-input]`、`[data-mindmap-note-relationship-endpoint]`、`[data-mindmap-note-relationship-control-point]` |
| relationship style | `[data-mindmap-note-relationship-style-drawer="true"]` |
| zoom／fit | `[data-mindmap-zoom-in]`、`[data-mindmap-zoom-out]`、`[data-mindmap-zoom-reset]`、`[data-mindmap-zoom-fit]` |
| drag preview | `[data-mindmap-drag-preview]`、`[data-mindmap-drop-preview]`、`[data-mindmap-insertion-preview]` |
| details／context menu | `[data-task-details-modal="true"]`、`[data-global-context-menu="true"]` |

## 3. AI 真實操作案例

每一列皆為獨立 case；`P0` 為必跑，`P1` 為完成前必跑，`P2` 為耐久補充。

| ID | 優先級 | 使用者情境 | AI 真實操作 | 通過標準 | 必存證據 |
|---|---:|---|---|---|---|
| AI-074-RO-01 | P0 | 進入心智圖並確認資料可用 | hard-reload → 選擇心智圖 → 等待 scene、節點、relationship render | 主要資料非空；只有一個 scroll owner；無 visible error／horizontal overflow | baseline screenshot、viewport／route、DOM counts、error arrays |
| AI-074-RO-02 | P0 | 選取任務與快速命名 | 單擊 `root-a`；輸入 quick-title；`Enter` 提交；重新單擊另一節點；以 `Tab` 建立一個 child | 單擊只選取且不開明細；Enter 不誤新增；Tab 只建立預期 child；focus 與 selected state 正確 | 操作前後 screenshot、title input、node count、`aria-selected`、parent/order |
| AI-074-RO-03 | P0 | 開啟任務明細與右鍵入口 | 快速雙擊節點；確認 details modal；Escape 關閉；右鍵節點；由 context menu 開啟明細；再次關閉 | double-click 開明細、single-click 不開明細；context menu 不被 scene transform 裁切 | modal／menu screenshot、焦點元素、visible error sweep |
| AI-074-RO-04 | P0 | 展開／收合大型分支 | 點擊 `data-mindmap-toggle-parent-id`；觀察 child、connector、scene bounds；再次收合 | child 與階層線同步出現／消失；沒有孤立線、重疊或遺失資料；layout mutation 只 coalesced recompute | before/after screenshot、node／connector counts、recompute delta、rect map |
| AI-074-RO-05 | P0 | 指標位置縮放與平移 | 將游標放在節點／relationship 附近；用 wheel 連續縮放至 25%／400%；middle-button pan；回到 100% | anchor screen drift `<=2px`；純 zoom/pan 的 world path 與 recompute count 不變；節點與線仍貼合 `<=3px` | 每倍率 screenshot、DOMRect／`getScreenCTM()`、path snapshot、scroll position |
| AI-074-RO-06 | P0 | Fit、reset 與四邊可達性 | 點 `符合內容`；點 `重設 100%`；以 wheel／scrollbar 真實捲至上、下、左、右邊界 | 內容完整可見或可達；只有 viewport scroll；fit/reset 不逐次漂移；toolbar 不遮蔽主要操作 | 四邊 screenshot、scrollWidth/Height、scrollLeft/Top、fit/reset 前後 bounds |
| AI-074-RO-07 | P1 | 建立關聯線 | 使用無 relationship fixture；點關聯線工具 → 點 source → 點 target → 在 label input 輸入文字 → Enter | 只建立一條預期 relationship；draft preview、實線、label 與 endpoints 一致；不誤觸節點 selection | 操作錄影或關鍵截圖、relationship count、label、endpoint rect、storage after |
| AI-074-RO-08 | P1 | 取消建立與禁止 self-link | 啟用關聯線工具；點 source；按 Escape 取消；重新啟用後點同一節點兩次 | Escape 清除 draft；self-link 不產生資料，且只顯示預期 warning；工具可恢復一般 selection | toolbar state、warning screenshot、relationship count before/after、error sweep |
| AI-074-RO-09 | P1 | 編輯關聯線 label／style | 點 relationship click target；用 Space 或可見入口編輯 label；修改顏色、線寬、dash、arrow；重新選取 | label 與 style 立即可見；selected／focus ring 正確；其他 relationship 不被改寫 | style drawer screenshot、SVG attributes、label、selected id、storage before/after |
| AI-074-RO-10 | P1 | 拖曳關聯線 endpoint／control point | 在 25%、100%、400% 各拖曳 endpoint 與 control point；拖曳過程移動游標再放開 | handle 螢幕尺寸至少 `24x24px`；path 跟隨 handle；drop 後 endpoint/control point 持久化；不觸發第二 owner | 每倍率拖曳前／中／後 screenshot、handle rect、path d、recompute reasons、storage diff |
| AI-074-RO-11 | P1 | 任務階層拖放 | 將 child 拖到 sibling before／after、另一節點 center（成為 child）、root side；另跑一次拖曳後移出放開取消 | insertion preview 與游標位置一致；commit 後 parent/order/root side 正確；cycle drop 被阻擋；取消不寫入 | drag preview screenshot、node parent/order、toast／warning、storage before/after |
| AI-074-RO-12 | P1 | 篩選／日期變更後維持座標與可操作性 | 使用現有 filter／date 控制隱藏部分節點；在過濾狀態縮放、展開、選取 relationship；清除 filter | filter 狀態與可見節點一致；無孤立 connector、錯誤 endpoint 或遺失 selection；清除後資料回復 | filter state、before/after screenshot、visible node／connector counts、error arrays |
| AI-074-RO-13 | P1 | Reload 與跨模式回復 | 完成一項 label、style 或 hierarchy mutation；reload；切至 Board 再回 Mindmap | persisted node／relationship geometry 與 reload 前 deep-equal；跨模式不新增錯誤、不重複 relationship；mindmap 可再次操作 | storage／DOM before/after、mode screenshots、relationship count、page errors |
| AI-074-RO-14 | P0 | Mobile boundary | 390x844 hard-reload；檢查目前產品規則的 mobile boundary；執行主模式可用性 smoke | 不側向強開 desktop mindmap；主流程可用；無 horizontal overflow、重疊、裁切或 visible error | mobile screenshot、viewport metrics、mode visibility、error arrays |
| AI-074-RO-15 | P2 | 混合耐久操作 | 連續 10 回合：select → zoom → pan → fit → expand/collapse → relationship hover；每回合換節點 | 無 drift 累積、無 recompute storm、無 focus 卡死、無 error 增長；最後回到 100% 與 baseline geometry | 每回合摘要、首／末 screenshot、drift trend、recompute trend、console/page errors |

### 3.1 極限／對抗操作案例

這些案例專門打破「單一、慢速、穩定操作」假設；AI 必須保留事件順序與時間間隔，不能自動 debounce 成單一動作。`EXT-01`～`EXT-08` 為 P1 必跑；`EXT-09`～`EXT-12` 為 P2 耐久補充。

| ID | 優先級 | 極限條件 | AI 真實操作 | 通過標準 | 必存證據 |
|---|---:|---|---|---|---|
| AI-074-EXT-01 | P1 | 高速反向縮放 | 游標停在 relationship label；300ms 內連續 wheel `+240/-240` 交替 20 次，再用 toolbar 連續點擊放大／縮小 | 最終倍率等於最後一個有效意圖；無跳回、NaN、path 改寫、雙重 recompute 或卡住的 pending state | 每事件 timestamp／delta、zoom timeline、path hash、recompute trend、末屏截圖 |
| AI-074-EXT-02 | P1 | 倍率邊界錘擊 | 連續 `25% ↔ 400%` 來回 20 回；每回再執行 fit → reset → fit | 所有倍率均被 clamp 在契約內；內容可達；anchor／endpoint threshold 不惡化；不累積 stage 尺寸 | 每 5 回 geometry summary、stage／scroll metrics、max drift、screenshots |
| AI-074-EXT-03 | P1 | Zoom、pan、scroll 競速 | 在 wheel 事件尚未 settled 時立即 middle-button pan，再以水平／垂直 wheel 同時推向角落 | 只存在一個 scroll owner；pointer 不被吞掉；最後 scene、scroll 與 toolbar state 一致；無殘留 draft／drag overlay | event timeline、scroll owner count、scene matrix、overlay count、末屏截圖 |
| AI-074-EXT-04 | P1 | Resize storm | 在 400% 與四邊捲動狀態下快速切換 viewport `1440x900 → 1024x768 → 1280x720 → 390x844 → 1440x900`，每次間隔 150ms | resize observer 不產生錯誤或無限 flush；回到 desktop 後節點／線可操作；mobile boundary 不被 desktop scene 汙染 | 每 viewport screenshot、client／scroll metrics、recompute count、visible errors |
| AI-074-EXT-05 | P1 | 拖曳中斷與焦點切換 | 開始 node drag 或 relationship handle drag；移出 scene／移到 toolbar；按 Escape、再 blur／切換 mode；不放下 | drag state、preview、selection、focus 全部清除；parent/order/relationship storage 不變；不留透明 hit layer | drag start／cancel screenshot、storage deep compare、active overlay count、focus target |
| AI-074-EXT-06 | P1 | 高密度拓撲 | 使用 64 nodes、16 relationships 的 dense fixture；快速展開所有 root、交錯選線、縮放至 25%／400% | render 最終穩定且無孤立線、重疊到不可操作、console/page error 或漏節點；local settle timeout 3s 僅作診斷門檻 | fixture manifest、node／connector／relationship counts、settle duration、full-page screenshots |
| AI-074-EXT-07 | P1 | 極長與異質文字 | 建立／命名 256 字中英混合、emoji、標點與連續無空白字串；在 label 與 node title 各執行一次 | 不水平溢出、不遮住 handle／toolbar、不截斷到無法辨識；zoom／drag 後文字與線仍對齊；Enter／Escape 語意不變 | title／label before-after、文字 bounding rect、overflow metrics、25%／400% screenshots |
| AI-074-EXT-08 | P1 | 快速鍵連發與取消 | 節點 focus 後快速連發 `Enter ×5`、`Tab ×5`、`Escape ×3`；在 quick-title、relationship label、details modal 各跑一次 | 不重複新增、不誤刪、不把 Escape 留在錯誤 modal；focus 回到合理 owner；資料數量與 parent/order 可解釋 | key event log、node count、modal／input visibility、focus path、storage diff |
| AI-074-EXT-09 | P2 | 邊界 overscroll | 在 scene 四角與 viewport 邊緣持續送出大型正／負 delta wheel、horizontal wheel 與 middle-pan | scroll 被 clamp；無負值／Infinity／空白死角；四邊內容仍可返回且不改寫 geometry | scroll samples、clamp values、四角 screenshots、path／storage hash |
| AI-074-EXT-10 | P2 | Reload during gesture | 在 zoom transition、node drag preview、relationship endpoint drag 各自觸發 hard reload | reload 後沒有殘留 overlay／draft／雙 owner；persisted data 只保留已提交狀態；頁面可再次操作 | reload point、before/after storage、overlay count、page errors、screenshot |
| AI-074-EXT-11 | P2 | Mutation burst | 2 秒內交替點擊 expand/collapse、filter、date visibility、relationship select 共 30 次，再停在固定狀態 | 最終 tree、filter、selection、connector counts 與最後意圖一致；沒有遺失 dirty reason 或 recompute storm | action timeline、last-geometry-reasons、flush count、final DOM／screenshot |
| AI-074-EXT-12 | P2 | 長時間混合耐久 | 5 分鐘循環 `zoom → pan → select → edit label → fit → filter → clear filter`，每 10 秒保存 checkpoint | error、drift、node／relationship count 不隨時間增長；停止後可 reload 並通過 RO-13 | checkpoint screenshots、memory／error trend（可得時）、geometry／storage hash、reload evidence |

## 4. 每一案例的 AI 執行迴圈

```text
1. 建立隔離 fixture，記錄 fixtureId、HEAD、runtime、viewport。
2. hard-reload，等待 [data-mindmap-scene="true"] 與節點可見。
3. 擷取 before：screenshot、DOM snapshot、scroll metrics、node/relationship geometry、visible errors。
4. 只用真實 UI event 執行本案例；每個 significant action 後重新 snapshot。
5. 等待兩個 animation frame + UI settled，擷取 after／checkpoint evidence。
6. 依 case acceptance 判定 PASS／FAIL／BLOCKED；任何 fail 立即停止該 case。
7. 將證據寫入 output/playwright/dev-074-ai-real-operation/<caseId>/。
8. 清理本 case fixture；確認沒有把測試資料寫入 production 或其他 local board。
```

### 4.1 Evidence schema

每一 case 的 `result.json` 至少包含：

```json
{
  "caseId": "AI-074-RO-05",
  "fixtureId": "dev074-ai-relationship-v1",
  "viewport": { "width": 1440, "height": 900 },
  "route": "http://127.0.0.1:4000/?dev074AI=after",
  "actions": [{ "type": "wheel", "target": "root-a", "deltaY": -640 }],
  "before": {},
  "checkpoints": [],
  "after": {},
  "visibleErrors": [],
  "consoleErrors": [],
  "pageErrors": [],
  "screenshots": [],
  "status": "PASS"
}
```

`status` 只能是 `PASS`、`FAIL` 或 `BLOCKED`；缺 screenshot、viewport、route、實際 actions、錯誤掃描或必要 DOM／geometry evidence 時只能判定 `未充分驗證`，不得補寫 PASS。

## 5. FMEA 與停止條件

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／案例 |
|---|---|---|---|---:|---|
| 單擊誤開明細／Enter 誤新增 | click、double-click、quick-title 仲裁失序 | 破壞快速整理心智圖的節奏 | modal、node count、focus、title snapshot | P0 | RO-02、RO-03 |
| zoom 後線與節點分離 | layer transform 或 world/client inverse 錯誤 | 關係判讀錯誤、無法選線 | DOMRect／`getScreenCTM()` endpoint distance | P0 | RO-05、RO-06 |
| handle 隨倍率縮小 | scene transform 未保留 screen hit target | 無法精準拖曳 | handle screen rect | P1 | RO-10 |
| relationship 雙重 owner | SVG 與 HTML 同時處理 pointer | 重複更新、focus 競爭 | selected id、recompute、path/storage diff | P1 | RO-07～RO-10 |
| drag preview 與 commit 不一致 | drop mode／座標空間混用 | 任務放錯階層或順序 | preview metadata 對比 parent/order/root side | P1 | RO-11 |
| mutation 後 dirty event 遺失 | filter、expand、date、resize 沒有 flush | 新資料不對齊或殘留舊線 | node/connector count、recompute reasons | P1 | RO-04、RO-12 |
| reload 改寫 world geometry | zoom 座標誤存入 persisted data | 使用者重開後關聯線變形 | storage deep compare | P1 | RO-09、RO-13 |
| mobile overflow／錯誤未顯示 | desktop profile 汙染 mobile boundary | 手機主流程不可用 | 390x844 screenshot、scrollWidth、visible errors | P0 | RO-14 |
| 高速事件造成遺失／重複狀態 | rAF、pointer capture、keyboard commit race | 最後意圖與畫面不一致 | event timeline、node count、focus、recompute trend | P1 | EXT-01、EXT-03、EXT-08、EXT-11 |
| resize／gesture 中斷後殘留 overlay | observer、blur、reload cleanup 不完整 | 透明 hit layer、卡死或誤寫入 | overlay count、storage deep compare、reload screenshot | P1 | EXT-04、EXT-05、EXT-10 |
| 高密度與長文字造成不可操作 | stage bounds、overflow、z-index、layout cost | 線／節點被遮蔽或無法選取 | settle timeout、overflow metrics、full-page screenshot | P1 | EXT-06、EXT-07、EXT-12 |
| 邊界 overscroll 破壞 clamp | scroll delta 未受限或 transform 累積 | 內容進入不可返回空白區 | scroll samples、四角 screenshot、finite-value assertion | P2 | EXT-02、EXT-09 |

任一以下條件立即 Fail 並停止後續同類操作：

- rendered surface 出現 visible error、錯誤 banner、空資料或非預期 4xx/5xx。
- endpoint drift `>3px`、wheel anchor drift `>2px`、handle 小於 `24x24px`。
- 純 zoom／pan 改變 world path、persisted geometry 或 recompute count。
- relationship／drag 一次操作產生雙重 dispatch、重複資料或錯誤 focus owner。
- drop 產生 cycle、錯誤 parent/order、錯誤 root side，或取消仍寫入。
- 任一 viewport 有水平溢出、重疊、裁切、toolbar 遮擋主要操作或無法恢復。
- 極限操作後出現 pending state、殘留 overlay、非 finite geometry、事件順序無法解釋，或在 3 秒 local settle timeout 內未回到可操作穩定狀態。

## 6. QC Handoff 與執行命令

QA 交付給 QC 的最小執行批次：

```powershell
# 先確認既有 local runtime；若無，再依 local-dev-entrypoint 啟動並記錄 process tree
npx playwright --version

# AI Browser Operator：依本文件逐案執行，保存到 output/playwright/dev-074-ai-real-operation/
npm.cmd run verify:dev-074-ai-real-operation-browser
# RO-12 以既有日期／篩選 browser verifier 執行，避免重複建立 filter harness
npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser
```

QC 必須回報：實際 command、runtime／port、fixture、viewport、case 結果、第一個失敗、screenshots、DOM／geometry evidence、visible／console／page errors、storage diff、cleanup 結果與 `PASS／FAIL／未充分驗證／BLOCKED` 判定。未實際操作 relationship handle、drag/drop、quick-title、wheel anchor、fit/reset 與 mobile boundary 時，不得宣稱本計畫完整通過。

## 7. QC Execution Record（2026-08-19）

- Runtime：沿用既有 `127.0.0.1:4000` local runtime；本輪未啟動、未停止其他 process。
- AI black-box command：`npm.cmd run verify:dev-074-ai-real-operation-browser`。
- Artifact：`output/playwright/dev-074-ai-real-operation/result.json`；`passed=true`、25/25 cases PASS、必跑 21/21、`requiredFailures=[]`、console/page errors 皆 0；65 張 before/after/failure screenshots。
- 必跑涵蓋：RO-01～RO-11、RO-13～RO-14、EXT-01～EXT-08；RO-12 由 `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser` 通過（dynamic near/future fixture、date badge、due/status/assignee filter），證據 `output/playwright/dev-027D-mindmap-date-filter.png`。
- P2 補充：EXT-09～EXT-12 全部 PASS；RO-15 未執行，依本計畫定義為 optional endurance，不阻塞 P0/P1 completion。
- 受影響回歸：DEV-074 static/browser、027B browser/static、027D browser、027E browser/static、027G browser/static/bundle/expansion、028 browser/static、070 static、071 static/browser、073 static/browser、TypeScript、targeted ESLint、`build:test` 全部 PASS；browser runtime console errors 均為 0。
- RD 修復：`MindMapView` 改用 non-passive wheel listener，並為 relationship pointer drag 增加 snapshot cancel/restore（Escape、blur、pointercancel）；QA runner fixture 修正為合法 64-node/16-relation topology 與 account-scoped filter storage。

## 8. 完成判定

- `PASS`：RO-01～RO-14 與 EXT-01～EXT-08 全部完成且 P0/P1 evidence schema 完整；RO-15 與 EXT-09～EXT-12 若執行則不得有 error trend 或 drift trend。
- `FAIL`：任一 P0/P1 case 觸發停止條件，保留第一個有效錯誤並回送 RD；不得只修改 expected。
- `未充分驗證`：缺少真實操作、viewport、screenshot、DOM／geometry、error sweep 或 storage evidence。
- `BLOCKED`：runtime、fixture、登入、權限或必要 UI 無法取得；需記錄 blocker，不可轉成 PASS。

本文件是 DEV-074 的 AI 真實操作 supplemental plan；本輪已完成 P0/P1 真實操作與 QC 證據，不改變既有產品 contract，也不取代 `QA-DEV-074` 的 automated geometry evidence。
