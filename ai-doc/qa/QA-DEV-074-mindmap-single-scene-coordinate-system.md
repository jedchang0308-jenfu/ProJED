# QA-DEV-074：心智圖單一 Scene 座標系重構驗證計畫

- 狀態：`QA Plan Ready / RD Implementation Ready / QA PASS / QC PASS`
- 關聯：DEV-074、SPEC-074、ADR-044
- 風險：Medium
- 執行邊界：S0 baseline、S1 pure/static、S2～S5 rendered/regression、TypeScript、targeted lint、bundle health 與 build 已執行；artifact 與命令結果為本次交付證據。
- Supplemental AI 真實操作計畫：`ai-doc/qa/QA-DEV-074-ai-real-operation-verification.md`（`Executed / AI Real-Operation PASS / QC PASS`；artifact 與案例明細維持於 supplemental 文件）。

## 1. QA 目標

證明 scene transform 只改變 world geometry 的螢幕投影，且 nodes、hierarchy connectors、note relationships、labels、handles、hit targets、inline editor 與 drag preview 在所有支援倍率下使用同一座標 authority。驗證不能只比較 path 字串或只跑 build，必須量測真實 rendered surface。

### 1.1 角色與判定權

| 角色 | 責任 | 不可替代事項 |
|---|---|---|
| RD | S0 baseline、S1～S5 實作、每 slice self-check、失敗證據與 local recovery | 不得自行把未執行 QC 標成 PASS |
| QA | 依本計畫執行 static/unit/browser/regression、確認 AC traceability 與 artifact 完整性 | 不以修改 expected 消除產品差異 |
| QC | 以真實 rendered surface 獨立核對 1440/1024/390、主要互動與 visible errors | 不以 build、source marker 或 RD 截圖取代事實驗證 |
| PM | 維護 DEV/SPEC 狀態、處理 stop condition 與 scope drift | 未經新要求不進 release gate |

## 2. Pre-Implementation FMEA

評分：Severity（S）、Occurrence（O）、Detection difficulty（D）各 1～5；`RPN = S × O × D`。RPN `>= 40` 或 S=5 視為 P1 gate，第一個有效失敗即停止。

| FMEA ID | Failure mode | Cause / effect | S | O | D | RPN | 預防控制 | 偵測證據／Fail threshold | Owner |
|---|---|---|---:|---:|---:|---:|---|---|---|
| FMEA-074-01 | nodes 與 SVG 分層縮放 | scene 階層或局部 transform 遺漏，重現漂移 | 5 | 3 | 3 | 45 | 三層 DOM + static scene inventory | 任一 map-local layer 不在 scene，或 endpoint `>3px` | RD/QA |
| FMEA-074-02 | 純 zoom 改 world path | transformed rect 被當 world rect／舊 recompute 殘留 | 5 | 3 | 3 | 45 | pure mapper + dirty reason allowlist | path/control snapshot 改變或 recompute delta `>0` | RD/QA |
| FMEA-074-03 | dirty event 遺失或重算風暴 | suppress return、clear 順序或 observer 自激 | 4 | 3 | 4 | 48 | Set latch + coalesced rAF + batch reasons | layout mutation未更新；同 frame flush `>1`；無界增長 | RD/QA |
| FMEA-074-04 | stage bounds 不足 | intrinsic size／translation／clamp 公式錯 | 5 | 3 | 3 | 45 | pure bounds unit + four-edge reach test | 內容永久不可達、NaN/Infinity、第二 scroll owner | RD/QC |
| FMEA-074-05 | wheel anchor 跳動 | 新 layout 套用後 scroll 時序或公式錯 | 4 | 3 | 3 | 36 | world+client anchor + layout effect | screen drift `>2px` | RD/QA |
| FMEA-074-06 | persisted geometry 被改寫 | zoom 座標誤當 storage 座標 | 5 | 2 | 4 | 40 | world origin/type lock；no migration | reload 前後 relationship geometry deep compare 不等 | RD/QA |
| FMEA-074-07 | handle/hit target 隨 zoom 縮小 | scene transform 同時縮小互動尺寸 | 4 | 4 | 3 | 48 | inverse-size wrapper | curve `<12px` 或 handle `<24x24px` screen | RD/QC |
| FMEA-074-08 | relationship 雙重 dispatch | SVG 與 HTML owner 同時保留 | 4 | 3 | 4 | 48 | SVG visual-only、HTML exclusive owner | 單次 pointer 造成多次 update、focus 競爭 | RD/QA |
| FMEA-074-09 | drag preview 與 drop 分離 | client path 被渲染於 world scene | 4 | 4 | 3 | 48 | clientToWorld 後才建 preview；badge 分離 | preview metadata、line、insertion、commit 不一致 | RD/QC |
| FMEA-074-10 | 既有 quick-title/expansion 被覆蓋 | dirty worktree 上整檔重寫 | 5 | 3 | 4 | 60 | current working tree baseline + incremental patch | DEV-027G/070/071/073 任一差異 | RD/QA |
| FMEA-074-11 | fit/center 逐次漂移 | 使用 transformed bounds 或乘 current zoom | 4 | 3 | 3 | 36 | unscaled world bounds 直接算 target | 往返後 center/fit 不一致或內容裁切 | RD/QA |
| FMEA-074-12 | mobile/其他模式回歸 | 共用 interaction 或 responsive boundary 被碰觸 | 4 | 2 | 4 | 32 | scope lock + 390 boundary + DEV-028/070 | mobile 側開 mindmap、主要模式 visible error | QA/QC |

剩餘風險：極大圖的 DOM measurement 成本與瀏覽器次像素取整可能造成低於 3px 的變動；本 DEV 以同 frame snapshot、量化 threshold 與 recompute count 管控，不擴張為 renderer 性能重寫。

## 3. 固定 Fixture

- 中心主題與左右兩側 root branches。
- 一個 parent + 5 children tidy bracket topology，包含展開／收合控制。
- 長中文／全形標題、日期顯示與 filter 前後 layout。
- 至少一條預設 relationship、一條含自訂 anchors／Bezier control points／label／style 的 relationship。
- 可執行 before／after／child／left／right drop 的 drag targets。
- quick-title、relationship inline edit、selected handles 與 relationship style drawer 狀態。
- fixture 僅使用測試 board／本地可清理資料，不得改正式資料。

### 3.1 Fixture ID 與資料要求

- Fixture ID：`dev-074-v1`；使用既有 local QA board reset/helper，不引入 production credentials 或 schema migration。
- roots：左、右各至少 1；其中一側有 parent + 5 children，另一側至少 2 層，確保 hierarchy connector 與 bracket topology 都出現。
- relationship A 使用預設 anchors；relationship B 固定自訂 from/to anchors、兩個 Bezier control points、label 與非預設 style，並保存 storage before snapshot。
- 至少一個可見長中文標題、一個日期 chip、一個 filter 會隱藏再恢復的 node、一個 collapse/expand parent。
- drag cases 至少 before、after、child 與跨 root side；每次保存 preview direction/mode/targetId 與 commit 後 parent/order/side。
- quick-title 需覆蓋 single-click、Enter、Tab、Escape、Delete 與 details 未誤開；relationship inline label edit 需覆蓋 focus/commit/cancel。
- S0 baseline 需在 100% 截圖與記錄；並保存 25% 現行失效證據作 problem reproduction，但不得把失效 expected 帶到 after gate。

S0 固定命令（只執行一次；existing baseline 時 fail-closed，不得覆寫）：

```powershell
npm.cmd run verify:dev-074-mindmap-single-scene -- --capture-baseline
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev074-single-scene-baseline -Filename scripts/verify-dev-074-mindmap-single-scene-browser.pw.js -OutputDirectory output/playwright/dev-074-single-scene/baseline -BaseUrl http://127.0.0.1:4000/?dev074Phase=baseline -ArtifactWindowKey __DEV074_ARTIFACT -ArtifactPath output/playwright/dev-074-single-scene/baseline/geometry-before.json
```

## 4. 自動化 Evidence Contract

實作階段固定新增：

- `npm.cmd run verify:dev-074-mindmap-single-scene`
- `npm.cmd run verify:dev-074-mindmap-single-scene-browser`
- pure transform／bounds unit tests
- `npm.cmd exec tsc -- --noEmit`
- targeted ESLint
- `npm.cmd run build:test`

Package wiring：

```json
"verify:dev-074-mindmap-single-scene": "tsx scripts/verify-dev-074-mindmap-single-scene.ts",
"verify:dev-074-mindmap-single-scene-browser": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev074-single-scene -Filename scripts/verify-dev-074-mindmap-single-scene-browser.pw.js -OutputDirectory output/playwright/dev-074-single-scene -BaseUrl http://127.0.0.1:4000/?dev074Phase=after -ArtifactWindowKey __DEV074_ARTIFACT -ArtifactPath output/playwright/dev-074-single-scene/geometry-evidence.json"
```

Static verifier 至少檢查：

- 存在唯一 scene authority 與 stageSizer。
- 心智圖 content 不使用 CSS `zoom`。
- feature code 不散落手工 `/ zoom`、nodes-only／SVG-only transform 或 zoom suppress drop path。
- coordinate mapper、geometry dirty reason 與 coalesced flush 有 typed／testable boundary。

Browser verifier 必須以 DOMRect、SVG `getScreenCTM()` 或數學等價方式量測實際 screen geometry。

### 4.1 Pure／Static cases

`scripts/verify-dev-074-mindmap-single-scene.ts` 至少包含：

- `--capture-baseline` 以 `node:child_process`／`node:fs` 寫入 `git-head.txt`、`git-status.txt`、`git-diff.patch` 與 touched-path manifest；目錄已有 baseline 時拒絕覆寫。
- scale `0.25, 0.5, 0.75, 1, 2, 4` 的 scene layout/stage size 精確案例。
- world→client→world 角點、負座標／padding、scroll 與 translation round-trip `<=0.01 world px`。
- anchor scroll 與 clamp 的左右上下邊界；fit 不乘 current zoom。
- source inventory：唯一 `data-mindmap-scene`、唯一 scroll owner、scene 包含 connector/relationship/interaction/drag/node layer。
- `mindMapLayoutStyle.ts` 不含 CSS `zoom`；feature code 不含 `ZOOM_PREVIEW_COMMIT_DELAY_MS`、`suppressZoomScrollRecomputeRef`、preview transform telemetry 或 `createScreenDragConnectorPath`。
- 除 coordinate kernel 公式外，MindMap feature code 不出現以 zoom 除座標的 pattern；不得僅以改寫字串繞過 verifier。
- browser artifact 存在時，驗證 schema、三 viewport、倍率集合、threshold、error arrays 為空與 persisted geometry equal。

### 4.2 Browser measurement algorithm

- zoom 序列：`1 → .25 → .5 → .75 → 1 → 2 → 4 → 1`，用 toolbar／wheel 實際操作並等待 `data-mindmap-zoom-level` 穩定。
- URL query `dev074Phase` 僅接受 `baseline|after`，預設 `after`；baseline 只驗 100% 正常且 25% drift 已重現，after 才要求全 threshold。未知值直接 Fail。
- path endpoint 以 SVG path model endpoint 經 `getScreenCTM()` 投影，對 node DOMRect 外框計算最短 screen distance；hierarchy 與 relationship 分別記 max，`<=3px`。
- pure zoom／scroll／middle pan 前後保存 hierarchy `d`、relationship `d`、control points、`data-mindmap-recompute-count`；要求 geometry byte/value equal 且 recompute delta=0。
- wheel 前以 mapper/可識別 node center 建立 anchor，zoom 後比對 screen point，drift `<=2px`。
- 每倍率把 viewport 捲到四邊，確認 world content bounds 的四角皆可進入 viewport 且 scrollWidth/Height 有限；只有 `[data-mindmap-scroll-owner="true"]` 可捲動。
- relationship curve/endpoint/control wrapper 以 DOMRect 量有效 screen target；同時驗可見 handle center 到 path model point `<=3px`、focus ring 存在。
- storage before/after 以 relationship geometry deep compare；切出/切回模式並 reload 後再比一次。
- 每 viewport 收集 `pageerror`、console error、failed requests、`.inline-error`、failure alert、Not Found、Internal Server Error 與可見 overflow/overlap 觀察。

### 4.3 Artifact

- Browser script 必須設定 `window.__DEV074_ARTIFACT`；共用 runner 以 optional `ArtifactWindowKey`／`ArtifactPath` 在關閉 session 前擷取並寫入 JSON。缺值、null、非 object 或寫檔失敗均為 browser gate Fail，不得合成 PASS artifact。
- JSON：`output/playwright/dev-074-single-scene/geometry-evidence.json`；schema 依 SPEC-074 §19。
- Screenshots：`desktop-{scale}.png`、`laptop-{scale}.png`；mobile 為 `mobile-boundary.png`。scale 小數以 `025/050/075/100/200/400` 命名。
- command log／Git baseline：`output/playwright/dev-074-single-scene/baseline/`；`git-head.txt` 保存實際 HEAD，artifact 用 `baselineRef` 指向它；失敗另存 `failures/<slice>-<case>/`。
- artifact 必須記錄 fixtureId、baselineRef、viewport、scale、max drift、anchor drift、recompute delta、scroll reachability、hit target minimum、errors 與 screenshot path。

## 5. QA Traceability Matrix

| ID | 對應 AC | 操作／輸入 | Auto evidence | Manual／QC evidence | 通過標準 |
|---|---|---|---|---|---|
| QA-074-001 | AC-074-001 | 檢查 scene DOM tree 與 transform | scene/layer inventory | 1440x900 layer screenshot | nodes 與所有 map-local overlays 共用唯一 matrix |
| QA-074-002 | AC-074-002 | 100→25→50→75→100→200→400→100% | endpoint distance matrix | 各倍率關鍵截圖 | 每個端點到節點邊緣 `<= 3px` |
| QA-074-003 | AC-074-003 | 只做 zoom、scroll、中鍵 pan | path/control snapshot + recompute counter | 無跳線目視 | world path 不變、recompute 不增加 |
| QA-074-004 | AC-074-004 | 指標錨點 wheel；toolbar +/-/100%/fit | anchor drift／center bounds | 操作走查 | wheel drift `<= 2px`；工具列行為相容 |
| QA-074-005 | AC-074-005 | 各倍率捲至四邊與 fit | scrollWidth/Height、reachable bounds | 1024x768 目視 | 全內容可達、唯一 scroll owner、無異常 overflow |
| QA-074-006 | AC-074-006 | 選取／拖曳 relationship handles、點 path/label | hit target rect／center distance | focus ring、inline edit 截圖 | 全部對齊；curve >=12px、handles >=24x24px screen target |
| QA-074-007 | AC-074-007 | before/after/child/root-side drag | preview metadata vs committed tree | drag 截圖 | connector/insertion/result 一致，badge 跟隨 pointer |
| QA-074-008 | AC-074-008 | 改名、展開收合、filter、date、resize | dirty reasons + flush count | 無暫態錯線目視 | 每 frame 最多一次，事件不遺失 |
| QA-074-009 | AC-074-009 | relationship 自訂 control，縮放、切模式、reload | storage before/after deep compare | 重載後曲線截圖 | persisted geometry 不被 zoom 改寫 |
| QA-074-010 | AC-074-010 | 跑相關既有 regression | command results | 主要互動走查 | 027B/027E/027G/028/070/071/073 通過 |
| QA-074-011 | AC-074-011 | 1440x900、1024x768 全流程 | visible error/overflow sweep | full-page screenshots | 無錯誤、重疊、裁切、斷裂或不可操作 |
| QA-074-012 | AC-074-012 | 390x844 進入現行 mobile flow | mode boundary assertion | screenshot | 不側向開放心智圖，既有主流程可用 |

## 6. Slice Gates

- S0：保存可重現 baseline、fixture、初始 path／node screen geometry 與 dirty worktree boundary。
- S1：matrix inverse、round-trip、bounds、anchor 與 clamp unit 全綠；不需 rendered PASS。
- S2：100% 的 node/path/scroll geometry 與 baseline 等價，無互動 owner 差異。
- S3：25%～400% zoom、anchor、fit、scroll extent 與 no-recompute gate 全綠。
- S4：relationship、handle、label、hit target、quick-title、drag preview 與 drop 結果全綠。
- S5：舊 CSS zoom／手工換算／suppress path 移除，全部 regression 與 visible error sweep 全綠。

任一 slice 第一個有效失敗即停止，不繼續累積未知差異。

### 6.1 Slice Exit Evidence

| Slice | 必存 evidence | 允許進下一 slice條件 |
|---|---|---|
| S0 | Git status/diff、fixture manifest、100% baseline、25% failure reproduction、現有 regression baseline | 資料可清理且問題可重現 |
| S1 | pure/static case summary | 所有 kernel threshold PASS；runtime diff 僅新增未接線 module/test |
| S2 | 100% geometry JSON/screenshot、interaction smoke | 100% 與 baseline endpoint/layout/scroll 差異在契約內 |
| S3 | 全倍率 geometry/anchor/scroll/recompute matrix | AC-002～005 全 PASS |
| S4 | relationship/drag/quick-title/permission evidence | AC-006～010 targeted PASS，single owner 已證明 |
| S5 | final artifact、full command log、visible-error sweep、FMEA residual review | 全 AC 有 evidence；QA 方可標記 executed |

## 7. Required Regression

- DEV-027B：keyboard、zoom、tidy connector、drag insertion preview。
- DEV-027E：relationship selection、label edit、endpoint、control point、style、zoom stability。
- DEV-027G：mindmap system／bundle health。
- DEV-028／070／071／073：selection、details、interaction ownership、quick-title 與非心智圖負向邊界。
- TypeScript、targeted lint 與 build:test。

既有 verifier 若只檢查舊 source marker，RD 可更新 source assertion，但不得放寬產品 expected。

### 7.1 固定命令

```powershell
npm.cmd run verify:dev-074-mindmap-single-scene
npm.cmd run verify:dev-074-mindmap-single-scene-browser
npm.cmd run verify:dev-074-mindmap-single-scene
npm.cmd run verify:dev-027b-xmind-interaction-polish
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity
npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser
npm.cmd run verify:dev-027g-mindmap-expansion
npm.cmd run verify:dev-027g-mindmap-system-health
npm.cmd run verify:dev-027g-mindmap-bundle-health
npm.cmd run verify:dev-027g-mindmap-system-health-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd exec tsx -- scripts/verify-dev-071-mindmap-selection-details.ts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev071-selection-details -Filename scripts/verify-dev-071-mindmap-selection-details-browser.pw.js -OutputDirectory output/playwright/dev-071-selection-details
npm.cmd run verify:dev-070-interaction-kernel
npm.cmd run verify:dev-070-interaction-kernel-browser
npm.cmd run verify:dev-073-task-title-edit-defaults
npm.cmd run verify:dev-073-task-title-edit-defaults-browser
npm.cmd exec tsc -- --noEmit
npm.cmd exec eslint -- src/components/MindMap scripts/verify-dev-074-mindmap-single-scene.ts
npm.cmd run build:test
```

- 第一輪可在 S0 只跑 static regressions，browser regressions集中於 S4/S5；最終清單不可缺項。
- `verify:dev-070-interaction-kernel-browser` 需要其既有 runner/artifact，QA 最終 gate 必跑；若 runtime成本或 fixture 衝突，記錄為 blocked，不得靜默略過。

## 8. QC Rendered Gate

- Desktop：1440x900。
- Laptop/tablet landscape：1024x768。
- Mobile boundary：390x844。
- 每個 in-scope viewport 記錄 route／mode、倍率、操作、可見錯誤、endpoint 最大距離、anchor drift、scroll reachability 與 screenshot path。
- `.inline-error`、`[role=alert]` failure、HTTP 4xx/5xx、Not Found、Internal Server Error、console error、重疊、裁切、斷裂或不可操作皆為 Fail。
- 缺真實畫面、主要互動、倍率、viewport 或人工目視證據時，只能判定 `未充分驗證`。

### 8.1 QC 檢查順序

1. 1440x900：全倍率、左右 topology、relationship selected/edit、drag、fit/reset、four-edge scroll。
2. 1024x768：全倍率、toolbar/drawer 不遮擋主要操作、scroll reachability、長中文/date/filter。
3. 390x844：只核現行 mobile boundary、主流程、無水平 overflow／可見錯誤；不要求開放 mindmap。
4. 每個 viewport 先看整體資訊架構，再核節點/線/handle 對齊、互動暗示、focus、最後掃 visible errors。

QC 不得只看靜態 screenshot；relationship handle 拖曳、label edit、quick-title、drag/drop、wheel anchor、fit/reset 至少各實際操作一次。

## 9. Stop／Fail Criteria

- 任一倍率 endpoint drift `> 3px` 或 wheel anchor drift `> 2px`。
- 純 zoom／pan 改寫 path/control data 或增加 connector recompute。
- relationship hit target 與 path 分離，或有效 target 小於契約。
- stage extent 使內容不可達、產生第二 scroll owner 或非預期 overflow。
- layout mutation 遺失、同一 frame 重算 storm、legacy 與 scene 雙重渲染／dispatch。
- persisted relationship geometry、權限、quick-title、drop 結果或其他模式行為改變。
- 任一 rendered visible error 或主要 regression 失敗。

失敗時保留第一個有效 error、倍率、viewport、fixture、最大 drift 與 screenshot，回送 RD 至上一個通過 slice；不得以更新 expected 掩蓋偏差。

## 10. Runtime Lifecycle／Cleanup

- browser 執行前先偵測是否已有同 project、port、purpose 的可重用 runtime；不得重複啟動。
- 若需啟動暫時 runtime，先在 command log 記錄：project、purpose=`DEV-074 QA`、port、PID/process tree、cleanup condition。
- 執行結束或 handoff 前只停止該次 DEV-074 擁有且已核對的 process tree；不得停止所有 `node.exe` 或清理未知 port。
- 清理後確認該 runtime port 已釋放；若 runtime 為其他 active task 所有，保留並明示 owner/cleanup obligation。
- fixture/test board 依既有 helper 清理；不得刪除 production/local user board 或以全域資料 reset 代替精準 cleanup。

## 11. QA Readiness 結論

- 文件狀態：`Executed / QA PASS / QC PASS`。
- P0/P1 測試設計缺口：無；12 個 AC、12 個 FMEA、S0～S5、artifact schema、命令與 role owner 已映射。
- DEV-074 artifact：`output/playwright/dev-074-single-scene/geometry-evidence.json`，fixture=`dev-074-v1`，baselineRef=`baseline/git-head.txt`；1440／1024 全倍率 endpoint drift 均 `<0.02px`、recompute delta=0、scrollReachable=true、persistedGeometryEqual=true，390 僅驗 mobile boundary。
- 已執行 rendered regression：027B、027E、027G、028、070、071、073；static／bundle／tsc／targeted lint／build:test gate 均有結果可追溯。
- Release、merge、deploy 與 production smoke 不在本 QA plan 的執行授權內。
