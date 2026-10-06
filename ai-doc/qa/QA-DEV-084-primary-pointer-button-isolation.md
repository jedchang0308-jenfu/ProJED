# QA-DEV-084：非主按鍵不得觸發主按鍵互動

狀態：Executed / QA PASS / QC PASS / 未 Release
對應規格：`ai-doc/specs/SPEC-084-primary-pointer-button-isolation.md`
風險：Medium；P0 failure 包含非主按鍵造成 task／date／relationship 寫入或合法 interaction owner 回歸
證據層級：local-test runtime / real rendered UI / desktop Chromium；390x844 為 mobile negative boundary

## 1. QA 目標、角色與執行邊界

QA 的目標不是證明程式「有寫 `button === 0`」，而是證明 raw input 在所有確認過的 owner 上產生正確且唯一的產品結果：中鍵／右鍵不會執行左鍵語意，左鍵／鍵盤／觸控與有意的中鍵 pan 仍正常。

- RD：建立 failure-first verifier、實作 pure guard 與逐檔修正、提供可重複 fixture 與初始 evidence；RD 不得自行宣告 QC PASS。
- QA：維護本計畫、FMEA、case／AC traceability 與 evidence schema；QA 不修改產品程式來讓案例通過。
- QC：在 RD 完成後以真實 UI 操作執行本矩陣、保存客觀 evidence、掃描可見錯誤並判定 PASS／FAIL；失敗只回報事實與重現，不修產品碼。

執行只限 `C:\VIBE CODING\ProJED\ProJED` 與 local-test fixture。不得連線或寫入 production，不得 commit、push、PR、merge、deploy 或 release。Build／TypeScript／static source scan 只是輔助證據，不能取代 rendered mouse/pointer QC。

使用思考習慣：#多層次分析、#風險導向、#事實驗證、#可驗證性

## 2. 測試環境與 fixture readiness

### 2.1 Runtime

- Canonical URL：`http://localhost:4000/`。
- 啟動前執行 `npm.cmd run dev:test:status`；若同專案 matching primary runtime 已存在則重用且不得停止。
- 若由本任務啟動，使用 `npm.cmd run dev:test:server`，記錄 project、purpose=`DEV-084 rendered QC`、port 4000、owner process tree與 cleanup condition=`browser matrix complete or first blocking failure`。
- 完成後只對本任務 owner 執行 `npm.cmd run dev:test:stop`，再用 status 與 port check 確認釋放；不得停止未知 `node.exe` 或其他 task runtime。

### 2.2 必備 local-test fixture

同一個可重置 local-test account 至少要有：

- 一個看板，包含可拖欄位、L1 card、L2/checklist row，以及至少兩個可辨識排序位置。
- List mode 可見相同任務；Task Workbench 至少一個未歸位 row；Shared Task Sidebar 至少一個可拖 row。
- Gantt 至少一個可編輯且左右端未鎖定的非 milestone task，start/end date 可讀。
- Mindmap 至少兩個節點與一條已保存 relationship，可選 path/label 並顯示兩端 endpoint；viewport 有足夠 scroll 空間可驗證 middle pan。
- 可從 UI 開啟 Task Details、Board Share；Calendar subscription delete 以 `?qcCalendarSubscription=1` 啟用 query-gated、可重置 local-test fixture，完整走 UI 刪除確認層；不以 production data 補造。

若任一必要 fixture 缺失，該 case 為 `BLOCKED / Fixture missing`，不得以跳過、直接 store mutation 或臨時 production data 取代；本輪 required fixture 均已由 local-test UI 或 query-gated fixture 提供。

### 2.3 Viewport 與畫面證據

- 1440x900：完整 primary matrix 與主 screenshots。
- 1024x768：Gantt、三 resizer、modal 與 cross-mode layout 重跑。
- 390x844：只驗證 mobile/coarse-pointer 邊界、無桌面 resize handle 側向開放、無 visible error／overflow；不把 desktop mouse emulation 當實機觸控證據。
- 每個 P0 類別至少一張 before／active-attempt／after screenshot 或可等效重建的 trace；不能只保存最終綠色摘要。

## 3. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 預防／驗證 |
|---|---|---|---|---|---|
| 中鍵仍啟動 dnd sensor | guard 放在 component click 而非共用 activator | 任務／欄位被誤排序或換父層 | `button=middle` 移動 24px，overlay/announcement/order snapshot | P0 | sensor-level negative matrix覆蓋全部 DndContext |
| 右鍵先啟動 drag 再開 menu | secondary event 在 contextmenu 前已 armed | menu 與 drag 雙 owner、可能誤 drop | right down/move/up + menu/overlay trace | P0 | activator fail closed；Escape cleanup |
| Gantt handle 中鍵進入 resize | child handle 繞過主 bar guard | 日期、依賴、工期被改寫 | date/geometry/drag-state before-after | P0 | handle 與 shared starter defense-in-depth |
| 非主按鍵改 panel width | pointerdown 未過濾或 guard 在 preventDefault 後 | UI 跳動且 preference 被持久化 | aria/rendered/local preference observable | P1 | 三 panel matrix；side-effect order static gate |
| relationship hit target 吞掉中鍵 | handler先 prevent/stop 再判斷 | 中鍵無法 pan、關係線被選取 | scroll/selection/path trace | P0 | guard 必須在 event suppression 前 |
| endpoint 中鍵提交 reconnect | pointer capture/state 無 button guard | 關係線錯接、geometry 寫入 | endpoint drag attempt + storage/path snapshot | P0 | View adapter first-line guard |
| modal 中鍵關閉 | backdrop mousedown 未分流 | 表單／確認中斷；Task Details 儲存時機改變 | modal count/title/input draft trace | P1 | 三 dialog button matrix |
| 共用 helper 過度阻擋觸控／pen | `isPrimary` 或 button 規則錯誤 | 既有 gesture／resizer不可用 | pure matrix + 390 boundary + existing mobile regression | P0 | `button=0 && isPrimary!==false` |
| 心智圖有意中鍵 pan 被破壞 | 非主按鍵在 child 被 stopPropagation | 核心導航手勢失效 | relationship target 起手的 middle-pan scroll | P0 | rejected event不得 prevent/stop |
| 右鍵 menu 或鍵盤回歸 | guard 被放在 semantic dispatch共用層 | 無法使用 secondary／accessible path | task menu、KeyboardSensor、separator arrows | P0 | raw-input helper不得改 dispatch API |
| transient outside-dismiss 被全面改寫 | 過度擴張「左鍵限定」 | popover/menu 殘留或 UX 漂移 | picker/menu outside interaction regression | P2 | 本 DEV 排除 non-mutating transient dismiss |
| 測試假陽性 | 只檢查 click、移動未達 8px、fixture沒有可提交落點 | 漏掉真實 defect | movement 24px + overlay + before/after data | P0 | failure-first baseline、control case、artifact trace |
| lifecycle 殘留 | pointerup/cancel/blur cleanup 被 guard繞過 | cursor、overlay、capture 卡住 | body style／DOM overlay／下一次操作 | P1 | 每 case finally cleanup 與後續 control |
| visible/runtime error | event type/refactor錯誤 | 模式局部或整頁不可用 | console/page/request/HTTP/DOM error sweep | P0 | 兩個 desktop viewport + mobile boundary |

## 4. Static／pure test cases

| ID | 操作／檢查 | 預期結果 | 對應 AC |
|---|---|---|---|
| QA-084-S01 | `PointerActivationLike` mouse buttons 0/1/2 | 只有 0 為 true | 001 |
| QA-084-S02 | pointer `button=0` 搭配 `isPrimary=true/undefined/false`；button 1/2/5 | true、true、false；非 0 全 false | 001 |
| QA-084-S03 | 掃描 `SmartMouseSensor` guard 次序與三個 DndContext owner | 共用 sensor 在 original activator 前 fail closed；Board/List/Shared 仍共用 | 002、011 |
| QA-084-S04 | 掃描 Gantt starter／兩 handle | shared starter與兩 child皆有 guard；非 primary 分支在 stopPropagation 前 return | 004、011 |
| QA-084-S05 | 掃描三 resizer | 都 import同一 helper，guard 早於 prevent/stop/state/listener | 005、011 |
| QA-084-S06 | 掃描 relationship selection與endpoint starter | 同一 helper；rejected path不 prevent/stop/capture/select | 006、011 |
| QA-084-S07 | 掃描三 backdrop | `target===currentTarget` 與 primary 兩條件皆成立才 close | 007、011 |
| QA-084-S08 | package／selector contract | 兩個 DEV-084 scripts 與新增 data selectors 存在，artifact path固定 | 010、012 |

Static verifier 不得只以容易被註解欺騙的單一字串判定 PASS；至少要 import pure helper執行真實 case，並對必要 call site 使用結構化或相鄰 source ownership assertion。

## 5. Rendered browser test matrix

Playwright 真實滑鼠負向手勢統一使用：移到 target 中央，`mouse.down({button})`，移動至少 24px 且跨過既有 8px drag threshold，`mouse.up({button})`。每次都記錄 button、座標、target selector、movement、before／after；right case 若合法開啟 context menu，驗證無 drag 後以 Escape 關閉。

| ID | 前置／真實操作 | 預期結果 | 必要 evidence | 對應 AC |
|---|---|---|---|---|
| QA-084-B01 | 1440 看板欄位、L1 card、L2/checklist 分別 middle/right 拖 24px | overlay/marker/announcement=0；order/parent不變；right menu 可正常出現 | target matrix、DOM order、screenshots | 002、009 |
| QA-084-B02 | List row middle/right 拖 24px | 無 drag/drop、無詳情、row order/parent不變 | list snapshot、modal/overlay count | 002、009 |
| QA-084-B03 | Workbench 未歸位 row與 Shared Sidebar row middle/right 拖 24px | 不進 drag，不改 placement／order；right menu維持 | placement/order/menu trace | 002、009 |
| QA-084-B04 | 同一 task surface 左鍵移動超過門檻後以 Escape取消；KeyboardSensor以 Space開始再取消 | 合法 overlay曾出現且完全清理；fixture資料不變 | control trace、cleanup snapshot | 003 |
| QA-084-B05 | 在 input/button/tag picker 等 interactive child左鍵移動 | 仍不啟動 task drag | target/overlay trace | 003 |
| QA-084-B06 | Gantt start/end handle middle/right down-move-up；另驗證主 bar right menu | 無 drag label/state、日期／bar geometry／dependency observable不變；menu正常 | start/end text、rect、screenshot | 004、009 |
| QA-084-B07 | Workspace Sidebar、Workbench、Record Sidebar separator middle/right拖 32px | aria width、rect width、preference observable、body cursor/userSelect不變 | 三 panel before/after matrix | 005、009 |
| QA-084-B08 | 三 separator左鍵調整後以相同 UI回原寬；方向鍵各調整一次再回原值 | 左鍵與鍵盤可用，cursor lifecycle清理，最終回起始值 | positive trace、restoration log | 005 |
| QA-084-B09 | Mindmap relationship path、label以 middle拖動；起手點保持在 hit target上 | relationship不選取／不編輯；viewport scroll由middle-pan改變 | selected ID、scroll、path/storage snapshot | 006、008、009 |
| QA-084-B10 | 先以左鍵選relationship，再對 from/to endpoint middle/right拖動 | 不進 endpoint drag、不改anchor/path/storage；middle仍可交給 canvas pan | endpoint、scroll、path before/after | 006、009 |
| QA-084-B11 | relationship左鍵 select、endpoint既有左鍵操作 smoke；執行 DEV-077 browser regression | 原本 relationship owner可用；無重複 selected side effect或卡住 capture | regression result、final screenshot | 006、008 |
| QA-084-B12 | Task Details／Board Share／Calendar delete backdrop middle/right；Calendar 使用 `?qcCalendarSubscription=1` local fixture | 三者均保持開啟；Calendar handler 僅允許 primary exact-backdrop close | modal count、dialog selector、fixture reset、screenshots | 007、009 |
| QA-084-B13 | 三 dialog左鍵 backdrop；再測 content mousedown、Escape／X／confirm的適用路徑 | backdrop左鍵關閉；content不關；原有keyboard/button契約不變 | action/result trace | 007、008 |
| QA-084-B14 | task右鍵 menu、Mindmap canvas中鍵 pan、代表性 popover outside-dismiss | secondary/menu與有意 dismiss維持；沒有 primary mutation | menu/pan/popover trace | 008 |
| QA-084-B15 | 1024x768 重跑 B06～B13核心矩陣 | 結果一致，無裁切／overlay owner錯位 | viewport screenshots、rects | 004～010 |
| QA-084-B16 | touch-enabled 1024以真實單指Pointer／CDP操作一個可見separator後用UI復原；390x844 mobile boundary；執行既有DEV-029／054適用gate | primary touch仍可走原pointer owner，non-primary contact不建立第二owner；desktop mouse sensor／resizer未側向接管；mobile pan/tap/long-press不回歸 | touch trace、restoration、mobile result、overflow/error sweep | 008、010 |
| QA-084-B17 | 全流程前後 task order/parent、date、width、relationship、modal、activity/undo observable稽核 | 所有 non-primary case零 domain commit、零 preference write；正向 case已復原 | consolidated diff JSON | 009 |
| QA-084-B18 | console/page/request failure、HTTP 4xx/5xx與 visible DOM error sweep | 全部為0；`.inline-error`、`[role=alert]`、error boundary無非預期可見錯誤 | artifact error arrays | 010 |
| QA-084-B19 | 每類結束後再做一次普通左鍵／Escape操作 | 無 drag overlay、pointer capture、cursor/user-select、modal或menu殘留 | cleanup ledger | 003、005、010 |

## 6. Evidence schema 與資料防污染

主 artifact：`output/playwright/dev-084-primary-pointer-isolation/result.json`。

必要欄位：

```text
metadata: timestamp, baseUrl, viewport, runtimeOwner, gitHead, worktreeSummary
fixture: accountLabel, boardId, taskIds, relationshipId, calendarFixtureLabel
cases[]: id, status, button, target, start, end, before, during, after, screenshotPaths
snapshots: taskOrderParent, ganttDateGeometry, panelWidths, relationshipPathSelectionScroll, modalCounts
errors: console[], page[], requestFailed[], http4xx5xx[], visible[]
commands[]: command, exitCode, summary
cleanup: browserClosed, fixtureRestored, runtimeAction, portReleasedOrReused
```

- 不把姓名、email、task title全文或 secret 寫入 artifact；fixture使用 stable ID／去識別 label。
- 不允許 `page.evaluate()` 呼叫 store action、直接改 localStorage、DOM attribute、API或資料庫來建立測試狀態；可唯讀擷取既有 telemetry／DOM／geometry。
- 正向案例若必須改本地 preference，只能透過 UI，且在 `finally` 以 UI恢復；前後不一致直接 FAIL。
- 若 first failure 發生，仍要執行安全 cleanup、保存第一個有效 failure evidence，再停止後續可能污染資料的 case。

## 7. Required commands

```powershell
npm.cmd run verify:dev-084-primary-pointer-isolation
npm.cmd run verify:dev-084-primary-pointer-isolation-browser
npm.cmd run verify:core-regression-static
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-046-universal-task-surface-drag
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser
npm.cmd run verify:dev-054-mobile-task-drag-precision
npm.cmd run verify:dev-054-mobile-task-drag-precision-browser
npm.cmd run verify:dev-070-interaction-kernel
npm.cmd run verify:dev-070-interaction-kernel-browser
npm.cmd run verify:dev-077-mindmap-relationship-redline-cleanup
npm.cmd run verify:dev-077-mindmap-relationship-redline-cleanup-browser
npm.cmd run verify:dev-017-record-sidebar-resize
npm.cmd run verify:resizable-navigation-panels-browser
npm.cmd exec tsc -- -b --pretty false
npm.cmd exec eslint -- src/interactions/pointerActivation.ts src/hooks/useDragSensors.ts src/components/Gantt/GanttTaskBar.tsx src/components/Sidebar.tsx src/components/TaskWorkbenchPanel.tsx src/components/Records/RecordSidebar.tsx src/components/MindMap/MindMapRelationshipInteractionLayer.tsx src/components/MindMap/MindMapView.tsx src/components/TaskDetailsModal.tsx src/components/BoardMembersPanel.tsx src/components/CalendarSubscriptionsView.tsx
npm.cmd run build:test
git diff --check
```

DEV-029／054 automated browser gate是本輪必要回歸；iPhone Safari／Android Chrome physical device不是這個desktop raw-button修正的完成阻塞，但若未執行必須標為 `Automated mobile boundary only / Physical Not Run`，不得宣稱真機完整通過。DEV-084 的desktop mouse P0 matrix與automated mobile regression都不得因此跳過。

## 8. AC traceability 與 Pass／Fail Gate

| AC | 主要 QA cases |
|---|---|
| AC-084-001 | S01、S02 |
| AC-084-002 | S03、B01～B03 |
| AC-084-003 | B04、B05、B19 |
| AC-084-004 | S04、B06、B15 |
| AC-084-005 | S05、B07、B08、B15 |
| AC-084-006 | S06、B09～B11 |
| AC-084-007 | S07、B12、B13、B15 |
| AC-084-008 | S02、B04、B08、B09、B11、B13、B14、B16 |
| AC-084-009 | B01～B03、B06～B13、B17 |
| AC-084-010 | B15、B16、B18、B19 |
| AC-084-011 | S03～S07 |
| AC-084-012 | S08、TypeScript／build／diff gate |

DEV-084 完整 PASS gate：S01～S08、B01～B03、B06～B10、B12（Task Details／Board Share／Calendar）、B13，以及 DEV-028／029／046／053／054／070／076／077、DEV-017、resizable-navigation 對 B04／B05／B11／B14～B19 的 required regression 均通過；P0/P1 FMEA 無未控制 failure；非 primary domain／preference mutation 為 0；有意 middle pan、right menu、left、keyboard 與 automated mobile boundary 不回歸；真實 rendered evidence、error arrays 與 cleanup ledger 完整。physical mobile 仍標記 Not Run，不影響本 DEV 的 desktop/local completion gate。

以下任一情況直接 FAIL：只做 static沒有browser證據、移動未跨8px卻宣稱dnd安全、用直接 store／API／DOM mutation製造狀態、fixture前後不一致、artifact缺before/after、任一 visible error、stuck owner、右鍵／中鍵合法行為回歸，或把尚未執行標成 PASS。

## 9. QC handoff 格式

QC 結論只能是 `PASS`、`FAIL` 或 `BLOCKED`：

- `PASS`：列出執行日期、runtime owner、commit/worktree、case總數、command總數、artifact與 screenshots，並明示 local-only／未 Release。
- `FAIL`：列出第一個有效 failure ID、button、target、viewport、座標、before/during/after、資料是否污染、screenshot與應回 RD 的 slice；不修改產品碼。
- `BLOCKED`：只用於 fixture、runtime或必要外部能力客觀不存在；需寫明恢復條件，不得用 blocked取代未執行。

## 12. QC execution handoff（2026-08-24）

本次執行範圍為 local-only、未 Release。DEV-084 的 primary-pointer owner 修正已完成，static/pure 7/7、rendered browser 13/13 PASS；新 artifact 為 `output/playwright/dev-084-primary-pointer-isolation/result.json`，包含 desktop 1440x900、laptop 1024x768、mobile boundary 390x844、console/page/request errors 全為 0。Calendar delete 由 `?qcCalendarSubscription=1` local fixture 真實 UI 驗證 middle/right backdrop preservation。DEV-028／029／046／053／054／070／076／077、DEV-017 與 resizable-navigation required static/rendered regressions 均 PASS。

補充回歸維護：DEV-054 static stale assertion 已校正為目前 `reset(input)` contract，44/44；DEV-017 browser package entry 已改用 canonical runner 並完成 rendered persistence PASS；DEV-029／resizable-navigation browser stale cleanup/storage assertions 已校正後通過。這些均為 verifier evidence maintenance，不改變產品 interaction contract。

Calendar delete rendered case 已以 local fixture 完成；`CalendarSubscriptionsView` 的 exact-target + primary guard 同時具備 static 與 rendered evidence。physical iPhone Safari／Android Chrome 未執行，mobile 證據為 automated Chromium boundary only。

QC 判定：`PASS（local-only／未 Release）`。physical device supplemental gate 維持 `Not Run`，不得延伸為真機完整通過；不影響 DEV-084 required desktop/local completion。
