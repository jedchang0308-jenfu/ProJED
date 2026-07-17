# QA-DEV-054：手機任務拖拉定位精準度驗證計畫

狀態：RD Rework 4 Automated + User Revalidation Passed / Full Matrix + Physical iOS/Android Not Executed

關聯規格：`ai-doc/specs/SPEC-054-mobile-task-drag-precision.md`

完成角色：QA 設計；QC 執行事實驗證。QC 不修改產品程式。

## 1. 驗證目標

確認 DEV-054 不只可以完成拖拉，而是在真實手指、相鄰小型 target、nested checklist 與 edge auto-scroll 下，仍能穩定落到使用者放手前看見的目標。

本計畫同時保護：

- 使用者已核准的桌機拖拉 UI / 行為 baseline。
- 手機 quick tap / short pan / long press 分流。
- Mobile action rail 與 task position drop 的互斥提交。
- 手機頂部欄與一般按鈕在非拖拉狀態必須可用 native touch click 操作。
- Workbench placed row 不能拖。
- Cancel、cleanup、at-most-once、undo grouping 與 viewport safety。

## 2. 驗證分層

| 層級 | 目的 | 完成要求 |
|---|---|---|
| Static / pure | 證明單一 intent resolver、穩定器、常數與 module boundary | Required |
| Browser synthetic touch | 注入 jitter、handover、nested target、auto-scroll 與 release timing | Required |
| Desktop regression | 證明 approved desktop baseline 無改變 | Required |
| Physical iOS | 驗證真實手指接觸面、Safari touch lifecycle 與遮蔽 | Required |
| Physical Android | 驗證真實手指接觸面、Chrome pointer/touch lifecycle 與遮蔽 | Required |

任一 required 層級未執行，不得以其他層級代替。

## 3. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| Indicator 在同一 target 上下翻轉 | 仍使用 midpoint 或無 retain region | 放手結果不可預期 | B02、P01/P02 | P0 | 禁止 midpoint order；驗證 canonical intent |
| Target 黏住不切換 | retain / core 過大 | 明確拖到下一列仍落舊列 | B03、P06 | P0 | 進入新 target core 後 100ms 內交接 |
| Release 提交舊 target | stale fallback / freshness 未檢查 | 任務錯位 | B08、physical video | P0 | release current-point revalidation |
| Nested checklist 搶錯層級 | 只用 DOM closest/deepest | parent/order 錯誤 | B04 | P0 | normalized surface kind + compatibility |
| 固定 intent offset 命中上方任務 | task hit-test 使用 `rawY - 28` | 手指壓在 checklist row 中心卻選到 parent card | R03/R04、P01/P02 | P0 | task target 使用 raw point；preview clearance 不參與 hit-test |
| Pan broker 與 task drag 同時捲動 | long press 成立後 pan state 未 reset | DOM 在手指下方位移，indicator 亂跳 | R04、B05/B06、P05 | P0 | active task drag 為唯一 move owner；pan broker zero-scroll |
| Touch / pointer 重複事件累積 handover | 同一物理 move 被處理兩次 | 邊界候選被重複處理 | R04、trace | P0 | 相同座標去重；retain 內只接受 core handover |
| Auto-scroll 一幀跳列 | max step 過大 | target 在手指下跳動 | B05/B06、P05 | P0 | max 3px + post-layout resolve |
| Preview 被 target 拉離手指 | presenter 以 indicator 取代 raw point 作為 preview anchor | 拖曳物跳動，使用者失去手眼對應 | R03/R05/R06/R10、P10 | P0 | preview 永遠跟 raw finger；indicator 只呈現 target，不控制 preview |
| 來源原位殘留假 indicator | mobile source placeholder 也渲染 `KanbanInsertionMarker` | 同時看到兩條同樣藍線，無法判斷真實落點 | R05、P04/P10 | P0 | mobile placeholder 只保留高度；全畫面只允許一條 live target marker |
| 快速跨多列仍保留遠距舊線 | outside-retain dwell 在 pending target 每次換列時重置 | preview 已移動，indicator 留在百餘像素外 | R06、P04/P06 | P0 | 離開 12px retain 後 direct candidate 當幀接管；none 則立即清線 |
| Checklist source 誤命中 parent card | `elementsFromPoint()` 略過 invalid source 後繼續取 ancestor；expanded card outer rect 包含 descendants | 子任務被錯誤升階或藍線跑到整卡頂／底 | R04/R06/R10、P04 | P0 | innermost surface ownership + invalid ancestor blocking + bounded card primary rect |
| Action rail 與 move double-submit | raw / intent priority 混合 | 狀態與位置同時變更 | B09 | P0 | action 使用 raw point + terminal guard |
| 手機頂部欄按鈕不能按 | drag session 在非 dragging 狀態攔截 `touchend` 並 `preventDefault()` | hamburger、workbench、filter、modal 等正常操作失效 | R01、DEV-029 tap regression | P0 | 只有 `dragging` phase 可阻止 native click；topbar quick tap 必須保留 |
| Action rail 顯示 button 但點擊無效 | rail 缺 `onClick` command path，只能作為 drop target | 使用者長按放手後無法二次點選 action | R02、P07 | P0 | rail button 需直接呼叫 action executor，且維持 exactly-once |
| 桌機 baseline 漂移 | resolver extraction 改變既有結果 | 已滿意體驗回歸 | D01-D04 | P0 | extraction 前 characterization |
| Placed row 恢復可拖 | shared surface 誤掛 | 違反產品決策 | S11、B11、P09 | P0 | no source / no rail gate |
| Synthetic pass、實機失敗 | 缺手指面積、事件雜訊與遮蔽 | 假性完成 | Physical gate | P0 | iOS / Android 各 50 trials |

## 4. 測試資料與環境

### 4.1 Fixture

- 至少 2 個可水平捲動 column。
- 每欄至少 6 張 card，包含短卡與展開後高度不同的長卡。
- 至少 2 張 card 各含 4 個 checklist row；涵蓋 18px 最小列高。
- 至少 1 個 Workbench unplaced row 與 1 個 placed row。
- 任務 title、status、parentId、order 在測試前後可讀取並比對。
- 固定來源與 target task ID，避免以畫面文字猜測 target。

### 4.2 Viewport / Device

- Desktop browser：`1440x900`、`1024x768`。
- Mobile browser automation：`320x844`、`337x415`、`390x844`、`430x932`、使用者回報重現尺寸 `636x764`。
- Physical iOS：至少一台 iPhone Safari；記錄 device、iOS、Safari、viewport。
- Physical Android：至少一台 Android Chrome；記錄 device、Android、Chrome、viewport。

### 4.3 Evidence Instrumentation

Debug trace 至少記錄：

- raw point、intent point。
- candidate target、locked target、pending target。
- canonical display position / parentId / order。
- target switch reason：initial / retain / core / outside-retain-direct / invalid / stale。
- auto-scroll delta、scrollTop / scrollLeft、frame timestamp。
- release observation age、terminal result、commit count。

正式 UI 不得顯示 debug 文案；透過 test hook、data attribute 或 trace 收集。

## 5. Static / Pure Cases

| ID | 驗證 | 通過標準 |
|---|---|---|
| QA-054-S01 | Canonical resolver ownership | desktop/mobile 都呼叫同一 resolver；adapter / presenter 無自行 order 計算 |
| QA-054-S02 | Midpoint removal | mobile adapter 不存在 `rect.top + rect.height / 2` before/after 契約 |
| QA-054-S03 | Same-parent matrix | source 在 target 前回傳 after；在 target 後回傳 before，與 point Y 無關 |
| QA-054-S04 | Cross-parent / append matrix | row / column / checklist 結果與桌機 characterization 完全相同 |
| QA-054-S05 | Invalid intent | self、descendant、archived、permission denied 回傳 null |
| QA-054-S06 | Stability retain | locked rect 外擴 12px 內維持 target |
| QA-054-S07 | Stability handover | retain 內只允許 proportional core 立即切換；離開 retain 後 direct candidate 當幀接管，不得保留遠距舊 indicator |
| QA-054-S08 | Release freshness | 超過 120ms、離開 retain region 或 target invalid 不可 commit |
| QA-054-S09 | Auto-scroll bound | 每 frame delta 絕對值 <= 3px，離開 edge 後為 0 |
| QA-054-S10 | Point ownership | action rail 與 task target 都使用 raw point；preview 有無 target 都維持 12px finger clearance，不得讀 indicator geometry |
| QA-054-S11 | Placed row source lock | placed row 無 TaskDragSource、long press、action rail、draggable attribute |
| QA-054-S12 | Terminal guard | 同 session action / move / duplicate end 最多一次 commit |
| QA-054-S13 | Pan ownership | body 存在 active task drag attribute 時，mobile pan broker preventDefault、reset 且不得寫入 scrollTop / scrollLeft |
| QA-054-S14 | Nested geometry ownership | exact innermost hit-test；invalid source / descendant 阻斷 ancestor fall-through；card target rect 使用 primary surface；不存在 nearest fallback |

## 6. Browser Synthetic Touch Cases

| ID | Viewport | 實際操作 | 通過標準 |
|---|---|---|---|
| QA-054-B01 | 390x844 | 長按來源後移入 target | 下一 observation 鎖定正確 target；indicator 與 canonical intent 一致 |
| QA-054-B02 | 390x844 | 在舊 midpoint 上下各 10px 注入至少 20 個交錯 move points | target、position、indicator 不因 midpoint 抖動翻轉 |
| QA-054-B03 | 390x844 | 從 locked target 緩慢跨相鄰邊界，再移入新 target 中央 core | retain 內不切換；進入 core 後 100ms 內只切換一次 |
| QA-054-B04 | 390x844 | card / checklist / column source 移到 nested card + checklist | target surface、parentId、order 與 desktop matrix 一致 |
| QA-054-B05 | 390x844 | 手指固定 column bottom edge，啟動 vertical auto-scroll | pan broker 不寫入；edge auto-scroll 每 frame <= 3px；post-layout 更新；不跳完整 row |
| QA-054-B06 | 390x844 | 手指固定 board right edge，啟動 horizontal auto-scroll | scrollLeft 平滑增加；target 不跨 column 震盪 |
| QA-054-B07 | 320/337/390/430/636 | target、tall-card、edge、action rail 各狀態 | 有無 target 時 preview 都距 raw point 12px +/- 1px；target 變更不拉動 preview；全畫面只有一條 live marker；無 overflow |
| QA-054-B08 | 390x844 | 鎖定後移到無效區，等待 >120ms 放手 | no-op；不提交舊 target；cleanup 且可立即重試 |
| QA-054-B09 | 390x844 | 放到完成、新增同階、新增下階、刪除 | release raw point 仍命中；各只提交一次且不 move |
| QA-054-B10 | 390x844 | touchcancel、pointercancel、Escape、blur、hidden | 0 write；lock、pending、RAF、preview、indicator 全清 |
| QA-054-B11 | 390x844 | Placed row 長按 / 移動 / quick tap | 無 rail、preview、source、write；tap 開正確 details |
| QA-054-B12 | 320/390/430 | visible-error sweep | 無裁切、重疊、overflow、非預期 alert、HTTP / console error |

### 6.1 Reported Bug Focused Browser Regression

下列 R cases 是 2026-07-17 針對手機頂部欄、action rail 與使用者回報的錯位畫面新增的 targeted automation。R cases 不取代 B01-B12 完整矩陣與 P01-P10 實機 gate。

| ID | Viewport | 實際操作 | 通過標準 |
|---|---|---|---|
| QA-054-R01 | 390x844 | quick tap hamburger / workbench topbar buttons | native touch click 可開關目標 UI，drag session 不壓制一般按鈕 |
| QA-054-R02 | 390x844 | 任務 stationary long press 放手後點完成 action | 進入 armed rail、無 preview 殘留、第二次 native tap 完成 action exactly once |
| QA-054-R03 | 390x844 | 手指直接移到同父層較後方 target 中心 | raw finger point 命中該 target；mobile 使用 canonical desktop same-parent moving-down `after`；preview 仍跟手且 clearance 12px +/- 1px |
| QA-054-R04 | 390x844 | 手指置中命中 18px checklist row；在相鄰邊界往返 8 點，再移到第二列中心 | 不得命中 parent card；pan broker scrollTop 零變化；8 點全程同 target；第二列 core 100ms 內交接 |
| QA-054-R05 | 337x415 | 在使用者截圖同尺寸，從 checklist source 拖到相隔多列的 checklist target | source placeholder 0 marker；全畫面恰好 1 個 live marker；marker 貼齊 target；preview 跟手；commit 等於 indicator |
| QA-054-R06 | 390x844 | 先鎖上方 checklist，再單次快速移到 100px 外 tall-card primary edge | 舊 target 當幀失效；far target 接管；indicator 貼齊 bounded card primary boundary；preview 跟手；commit 等於 indicator |
| QA-054-R07 | 390x844 | 鎖定 target 後移到 invalid add-task control 放手 | zero write，不提交舊 target；rail、preview、indicator 全清 |
| QA-054-R08 | 320/390/430 | action rail + preview viewport sweep | rail / preview 不水平溢出；drag UI 不造成 viewport overflow |
| QA-054-R09 | 390x844 | console / network sweep | 無非預期 console error、pageerror、HTTP/network failure |
| QA-054-R10 | 636x764 | 長按 checklist source 後在同一 source row 內橫移超過 8px 並放手 | invalid innermost source 阻斷 parent card；無 parent indicator；preview 跟手；zero write |

## 7. Desktop Frozen Baseline Regression

| ID | Viewport | Case | 通過標準 |
|---|---|---|---|
| QA-054-D01 | 1440x900 | card same-column / cross-column drag | overlay、collision、parent/order 與 DEV-053 baseline 等價 |
| QA-054-D02 | 1440x900 | checklist reorder / cross-card move | whole-surface drag、target、order 等價 |
| QA-054-D03 | 1440x900 | column reorder、click、right-click、blank pan | 無 interaction 分流回歸 |
| QA-054-D04 | 1024x768 | screenshot / visible-error sweep | 不新增 mobile preview、intent marker、action rail 或其他桌機 UI |

任何 D01-D04 未授權差異均為 Stop Ship，不以「手機變好」抵銷。

## 8. Physical Device 50-Trial Matrix

每台 iOS 與 Android 裝置各自執行下列 50 次，不得合併計分：

| ID | 場景 | 次數 | 操作要求 | 每次通過標準 |
|---|---|---:|---|---|
| QA-054-P01 | 同欄向下排序 | 10 | 拖過至少 1 個相鄰 task | Indicator 與最終 after order 相同 |
| QA-054-P02 | 同欄向上排序 | 10 | 拖過至少 1 個相鄰 task | Indicator 與最終 before order 相同 |
| QA-054-P03 | 跨欄移動 | 10 | 移入另一 column 的指定 task | parentId 與 desktop canonical intent 相同 |
| QA-054-P04 | Checklist 小列定位 | 10 | 在相鄰 checklist rows 間移動 | 不誤落 parent card、相鄰 row 或錯誤階層 |
| QA-054-P05 | Edge auto-scroll 後放置 | 10 | Vertical 5 次、horizontal 5 次 | 捲動平滑；最後 target 正確；無 stale commit |

另外執行但不計入 50 次成功率：

| ID | 場景 | 通過標準 |
|---|---|---|
| QA-054-P06 | Target handover 慢速跨界 10 次 | retain 內穩定；明確跨界後只切換一次，不黏舊 target |
| QA-054-P07 | Action rail 四個 action 各 2 次 | wrong action / double-submit / move 均為 0 |
| QA-054-P08 | 無效區與 stale release 各 5 次 | 全部 no-op；下一次立即可操作 |
| QA-054-P09 | Placed row 長按 5 次 + tap 2 次 | 長按不進 drag；tap 開正確 details |
| QA-054-P10 | Preview / indicator 視覺檢查 | 只有一條 live insertion line；來源原位無假 marker；preview 全程跟手；tall-card indicator 不使用 expanded outer rect；無裁切 / overflow |

## 9. Quantitative Pass / Fail

每台裝置分別計算：

```text
first_release_correct_rate = correct_first_release / 50
```

`通過` 必須同時滿足：

- iOS first-release correct >= 48/50。
- Android first-release correct >= 48/50。
- 每台 no-op <= 2/50；no-op 不得寫入錯誤資料。
- Wrong target = 0、wrong parent = 0、wrong action = 0、duplicate commit = 0。
- P06-P10 全數 Pass。
- Static、browser、desktop regression、TypeScript、build 與指定回歸全部通過。
- Visible Error Hard Gate 為 0 finding。

`未通過`：任一 wrong commit、任一裝置低於 96%、placed row 可拖、桌機 baseline 改變、auto-scroll 跳列、target 明顯震盪或 visible error。

`未充分驗證`：缺 iOS / Android 任一裝置、缺完整 trial sheet、缺錄影／trace、缺前後 parent/order，或只用 synthetic touch / 主觀描述。

## 10. Trial Sheet 必填欄位

| 欄位 | 說明 |
|---|---|
| device / OS / browser | 完整裝置與版本 |
| trial ID / sequence | 例如 `IOS-P01-01` |
| sourceNodeId | 固定來源 ID |
| intendedTargetNodeId | 操作者預期 target |
| intended canonical position | before / after / append |
| indicator target / position | 放手前畫面結果 |
| committed parentId / order | 放手後實際資料 |
| result | correct / no-op / wrong-target / wrong-parent / wrong-action / duplicate |
| evidence timecode | 對應錄影或 trace 時間 |

## 11. Required Commands

```powershell
npm.cmd run verify:dev-054-mobile-task-drag-precision
npm.cmd run verify:dev-054-mobile-task-drag-precision-browser
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-046-universal-task-surface-drag
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-044-undo-coverage
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

## 12. 已執行證據（2026-07-17）

本輪已通過的 targeted automation 與回歸：

| 類別 | 命令 / 案例 | 結果 |
|---|---|---|
| 使用者驗證 | 電腦模擬手機拖拉與四張失敗截圖 | `未通過`：依序出現亂跳、preview/indicator 分列、遠距舊 indicator、preview 被拉離手指且 source 誤命中 parent；先前 pass 不得作完成證據 |
| 使用者重驗 | 原本失敗的電腦模擬手機操作路徑 | `通過`：2026-07-17 確認效果非常好，跨階層移動清楚，甚至優於電腦版 |
| DEV-054 static | `npm.cmd run verify:dev-054-mobile-task-drag-precision` | 34/34 passed |
| DEV-054 RD rework browser | `npm.cmd run verify:dev-054-mobile-task-drag-precision-browser` | QA-054-R01~R10 passed；R06 bounded card primary，R10 `636x764` ancestor blocking + finger coupling + zero write passed |
| R10 前後證據 | `output/playwright/dev-054-mobile-drag-1784278461661-QA-054-R10-FAIL.png` / `dev-054-mobile-drag-1784279585457-B10-no-parent-fallthrough.png` | 修正前 preview 跳到 parent card top；修正後 preview 跟手、無 parent indicator |
| DEV-053 desktop/mobile baseline | `verify:dev-053-task-drag-muscle-memory-consistency` + browser | static 30/30、browser 10/10 passed |
| DEV-029 mobile pan/action regression | `verify:dev-029-mobile-pan-first-interactions` + browser | static 37/37、browser passed |
| DEV-046 universal drag regression | `verify:dev-046-universal-task-surface-drag` + browser | static 29/29、browser passed |
| DEV-039 workbench placement regression | `verify:dev-039-task-workbench-placement-lanes` + browser | static 31/31、browser passed |
| DEV-044 undo regression | `verify:dev-044-undo-coverage` | static 26/26 passed |
| Type/build | `npm.cmd exec tsc -- --noEmit`、`npm.cmd run build:test` | passed |

尚未執行或尚未形成完整 QC package：

- QA-054-B01~B12 完整 browser trace matrix 尚未逐項以正式 QC report 收斂。
- QA-054-P01~P10 iOS / Android 實機 50-trial matrix、trial sheet、錄影與裝置資訊尚未執行。
- 因 physical iOS / Android gate 是本 DEV 完成標準，本輪 QA 判定仍為 `未充分驗證`，不得把 DEV-054 標記完成。

## 13. QC Evidence Package

- Git / working tree boundary 與測試環境 URL。
- Required command 結果與失敗 log。
- D01-D04 desktop baseline 前後截圖 / trace。
- B01-B12 mobile trace、viewport 與 geometry measurement。
- iOS / Android trial sheet、裝置資訊、操作錄影與統計。
- 每個 wrong / no-op trial 的 raw / intent / locked target trace。
- Visible error、console、network、horizontal overflow sweep。
- 最終結論：`通過`、`未通過` 或 `未充分驗證`。

DEV-054 只有在 QC 明確記錄兩台實機均通過後，才可在 `dev_task.md` 標記完成。
