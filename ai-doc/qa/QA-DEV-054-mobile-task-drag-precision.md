# QA-DEV-054：手機任務拖拉定位精準度驗證計畫

狀態：RD Development Complete / 2026-10-26 Local Static + Browser PASS / 自用裝置驗收待確認

2026-10-19：依使用者指示精簡。現行完成要求以 §2／§8–§11 為準，取代舊雙平台固定次數／成功率及逐筆工作簿。§12–§14 保留歷史執行紀錄；未測實機仍未驗證，不因本次改契約而變成 PASS。

關聯規格：`ai-doc/specs/SPEC-054-mobile-task-drag-precision.md`

一般調整由 RD 修改及 targeted 自查；既有 QC 紀錄保留，不強制另排角色簽核。本次測試治理不是產品發布。

## 1. 驗證目標

確認 DEV-054 不只可以完成拖拉，而是在真實手指、相鄰小型 target、nested checklist 與 edge auto-scroll 下，仍能穩定落到使用者放手前看見的目標。

本計畫同時保護：

- 使用者已核准的桌機拖拉 UI / 行為 baseline。
- 手機 quick tap / short pan / long press 分流。
- Mobile action rail 與 task position drop 的互斥提交。
- 手機頂部欄與一般按鈕在非拖拉狀態必須可用 native touch click 操作。
- Workbench placed row 不能拖。
- L1、L2、L3+ 與 Workbench unplaced 長按不得出現文字圈選、選取工具列或 iOS callout。
- 橫向手機、平板與寬觸控 viewport 的真實 touch 不得退回桌機 context menu；mouse/right-click baseline 不變。
- Cancel、cleanup、at-most-once、undo grouping 與 viewport safety。

## 2. 驗證分層

| 層級 | 目的 | 完成要求 |
|---|---|---|
| Static structural | source／module boundary 與安全 wiring；不冒稱已執行 pure 行為或實機 | 檢查器／相關 source 變更時執行 |
| Browser synthetic touch | jitter、handover、nested target、exactly-once、invalid zero-write 與畫面結果 | DEV-054 R01–R15；B 矩陣由下方現行案例覆蓋，不另做一套同義報告 |
| 相鄰安全／桌機 regression | cancel 零寫入、可重試、pan／edge-scroll、action／undo 與 desktop baseline | 按 §11 選測；可重用仍有效且相關輸入未變的證據 |
| 實際自用裝置 | 原失敗路徑、真實長按／定位及主要操作 | 常用裝置重點確認；不預設兩平台、固定次數或錄影工作簿 |
| 其他手機平台 | 只有實際使用需求時才納入 | 未測標示未驗證；不連帶阻塞 DEV-097 |

證據只支持實際覆蓋層級。自用裝置未確認時保留待確認；錯誤 parent／target／action、duplicate effect、cancel／invalid write 仍須修正，不能以主觀手感或文件完整抵銷。

## 3. 必要保護與回歸來源

| 保護 | 現行案例／來源 | 失敗判定 |
|---|---|---|
| 正確 target／parent／order 與 raw-finger preview | R03–R06、R10–R11、R15 | indicator 與實際 commit 不同、ancestor fall-through 或錯改歸屬 |
| Exactly-once、action／move 互斥、破壞性操作確認及 undo | R02／R15、DEV-029 C04／C07／C08、DEV-044 | duplicate effect、未確認 destructive action 或原復原路徑失效 |
| Invalid／stale／各取消事件零寫入且可立即重試 | R07／R10／R11、DEV-053 B07／B10 | 舊 target 被提交、取消後資料變動或 UI／RAF 殘留 |
| 正常 tap／pan、垂直與水平 edge-scroll | R01／R04／R13、DEV-029 C12／C13 | 一般按鈕不能操作、拖拉與 pan 搶事件、scroll 跳列 |
| Placed-row 唯讀與 unplaced 歸位 | R15、DEV-053 B13 | placed 可拖或 unplaced 未唯一歸位 |
| 長按選取／callout、寬觸控與畫面安全 | R08／R09／R12–R14＋自用確認 | 真實使用裝置不能完成原操作；未測平台不冒稱 PASS |

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
- Mobile / touch browser automation：`320x844`、`337x415`、`390x844`、`430x932`、使用者回報重現尺寸 `636x764`，另加寬觸控 `844x390` 與 `1024x768`。
- 實際自用裝置：使用平常操作 ProJED 的手機與瀏覽器，簡記裝置、系統、瀏覽器版本與結果。
- 其他 iOS／Android 平台：只有實際使用需求時才納入；未測標示未驗證，不形成雙平台硬門檻。

### 4.3 Evidence Instrumentation

下列 debug trace 只在自動化案例需要判定，或實際失敗需要診斷時擷取；正常自用確認不要求完整 trace：

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
| QA-054-S03 | 明確 boundary 與同一 resolver | before／after 沿 normalized surface／orderingPosition；不按舊 source 相對順序猜測，R03 fixture 驗 explicit before |
| QA-054-S04 | Cross-parent / append matrix | row / column / checklist 結果與桌機 characterization 完全相同 |
| QA-054-S05 | Invalid intent | self、descendant、archived、permission denied 回傳 null |
| QA-054-S06 | Stability retain | locked rect 外擴 12px 內維持 target |
| QA-054-S07 | Stability handover | retain 內只允許 proportional core 立即切換；離開 retain 後 direct candidate 當幀接管，不得保留遠距舊 indicator |
| QA-054-S08 | Release freshness | 超過 120ms、離開 retain region 或 target invalid 不可 commit |
| QA-054-S09 | Auto-scroll bound | 每 frame delta 絕對值 <= 3px，離開 edge 後為 0 |
| QA-054-S10 | Point ownership | action rail／target 都用 raw point；一般 preview clearance 12px、child candidate／armed 16px，50% 縮放／水平 gap=0，safe-area clamp 除外；不讀 indicator geometry |
| QA-054-S11 | Placed row source lock | placed row 無 TaskDragSource、long press、action rail、draggable attribute |
| QA-054-S12 | Terminal guard | 同 session action / move / duplicate end 最多一次 commit |
| QA-054-S13 | Pan ownership | body 存在 active task drag attribute 時，mobile pan broker preventDefault、reset 且不得寫入 scrollTop / scrollLeft |
| QA-054-S14 | Nested geometry ownership | exact innermost hit-test；invalid source / descendant 阻斷 ancestor fall-through；card target rect 使用 primary surface；不存在 nearest fallback |

## 6. Browser 行為覆蓋對應

| 舊需求 ID | 現行驗證來源 | 仍需保護的結果 |
|---|---|---|
| B01–B04 | R03–R06／R10–R11／R15＋DEV-053 共用 resolver regression | canonical target、handover、nested scope 與 commit 一致 |
| B05–B06 | DEV-029 C12／C13＋R04／R06 | horizontal／vertical edge-scroll、pan ownership；scroll constants／每 frame bound 由 static structural 保護，不能只用 screenshot 推定 |
| B07／B12 | R05／R08／R09／R10 | phase-aware preview／單一 indicator／viewport 與錯誤 sweep |
| B08／B10 | R07／R10／R11＋DEV-053 B07／B10 | invalid／stale／各取消事件零寫入、cleanup 及立即重試 |
| B09 | R02／R11＋DEV-029 C04／C07／C08、DEV-044 | action／move 互斥、確認及復原；未覆蓋的 action 分支仍需 focused 補驗，不能把部分 action 通過稱為全 action PASS |
| B11 | R15＋DEV-053 B13 | placed 不可拖且 tap 仍開正確明細 |

舊 B01–B12 作需求追溯，以上來源承接驗證，不再要求為相同輸入／oracle 另建 B report。無法對應的獨立資料安全案例維持待驗，不能藉合併消失；有效證據可重用，變更或新失敗才重跑受影響來源。

### 6.1 Reported Bug Focused Browser Regression

R01–R15 是現行 DEV-054 browser suite，與 §6 對應來源共同承接舊 B 需求；沒有額外同義矩陣完成門檻。舊 P01–P12 已由 §8 自用確認取代。

| ID | Viewport | 實際操作 | 通過標準 |
|---|---|---|---|
| QA-054-R01 | 390x844 | quick tap 工作區入口、正常關閉按鈕與 workbench topbar button | native touch click 可開關目標 UI，drag session 不壓制一般按鈕；不鎖定其他任務的 sidebar 版型 |
| QA-054-R02 | 390x844 | 任務 stationary long press 放手後點完成 action | 進入 armed rail、無 preview 殘留、第二次 native tap 完成 action exactly once |
| QA-054-R03 | 390x844 | 手指命中 fixture 同父層 target 的 explicit before boundary | indicator=`before`，commit 同 parent 且位於 target 前；此 fixture 的 child preview clearance 為 16px +/- 1px，不能套用舊 after／12px 預期 |
| QA-054-R04 | 390x844 | 手指置中命中 18px checklist row；在相鄰邊界往返 8 點，再移到第二列中心 | 不得命中 parent card；pan broker scrollTop 零變化；8 點全程同 target；第二列 core 100ms 內交接 |
| QA-054-R05 | 337x415 | 在使用者截圖同尺寸，從 checklist source 拖到相隔多列的 checklist target | source placeholder 0 marker；全畫面恰好 1 個 live marker；marker 貼齊 target；preview 跟手；commit 等於 indicator |
| QA-054-R06 | 390x844 | 先鎖上方 checklist，再單次快速移到 100px 外 tall-card primary edge | 舊 target 當幀失效；far target 接管；indicator 貼齊 bounded card primary boundary；preview 跟手；commit 等於 indicator |
| QA-054-R07 | 390x844 | 鎖定 target 後移到 invalid add-task control 放手 | zero write，不提交舊 target；rail、preview、indicator 全清 |
| QA-054-R08 | 320/390/430 | action rail + preview viewport sweep | rail / preview 不水平溢出；drag UI 不造成 viewport overflow |
| QA-054-R09 | 390x844 | console / network sweep | 無非預期 console error、pageerror、HTTP/network failure |
| QA-054-R10 | 636x764 | 長按 checklist source 後在同一 source row 內橫移超過 8px 並放手 | invalid innermost source 阻斷 parent card；無 parent indicator；preview 跟手；zero write |
| QA-054-R11 | 390x844 | card／column 回來源原位，並驗 action 優先 | 原位藍色 title field 與零寫入；action hover 清除 origin／一般 marker，單一回饋 |
| QA-054-R12 | 390x844 | 分別長按 L1、L2、L3+ 的可拖 task surface | computed `user-select` / `-webkit-user-select` 為 `none`；selection 為空；只進 mobile rail，不開桌機 menu |
| QA-054-R13 | 390x844 | 430ms 放手、7px 後跨 500ms、9px 後跨 500ms | 430ms 不啟動；7px 仍啟動；9px 取消，維持 500ms／8px 契約 |
| QA-054-R14 | 844x390、1024x768 touch | 長按 L2 task | 即使 width > 768 仍進 dedicated mobile session；無文字選取、無桌機 menu |
| QA-054-R15 | 390x844 shared inline Workbench | 新增 unplaced task，長按跨面板拖到右側可見看板卡片，再長按 placed row | 面板與看板不重疊且有可操作 drop area，不固定欄距；unplaced 防選取並保留 native pan，`boardId` 唯一歸位且 exactly-once；placed 無 ownership marker、無 rail |

## 7. Desktop Frozen Baseline Regression

| ID | Viewport | Case | 通過標準 |
|---|---|---|---|
| QA-054-D01 | 1440x900 | card same-column / cross-column drag | overlay、collision、parent/order 與 DEV-053 baseline 等價 |
| QA-054-D02 | 1440x900 | checklist reorder / cross-card move | whole-surface drag、target、order 等價 |
| QA-054-D03 | 1440x900 | column reorder、click、right-click、blank pan | 無 interaction 分流回歸 |
| QA-054-D04 | 1024x768 | screenshot / visible-error sweep | 不新增 mobile preview、intent marker、action rail 或其他桌機 UI |

桌機行為與最新已採用決策一致；overlay 的舊 frozen geometry 不覆蓋後續 50%／水平 gap=0 決策。資料結果或一般操作退化仍須修正，受影響情境由 DEV-053／055 既有案例承接，不要求每次重做全部 D report。

## 8. 自用裝置重點操作（取代舊 P01–P12）

在實際常用手機由正常任務畫面操作，重驗原長按／定位失敗，涵蓋平常會用的同欄／跨欄／checklist、edge-scroll、action、取消及復原。確認放手目標與結果一致、長按不被原生選取搶走、取消不寫入且可重試。其他手機平台只在確有使用需求時納入，不要求固定次數或統計成功率。

## 9. 通過／未通過／待確認

- RD 開發通過：受影響 static／browser 案例通過，無錯誤提交、重複效果、取消寫入或原復原路徑失效。
- 自用裝置驗收通過：在實際常用裝置完成原失敗／主要流程，且沒有上述安全失敗。
- 未通過：必要行為仍失效，或資料／scope／parent／action 不符合畫面及授權。保留首個有效失敗並修正，不靠刪測或重試掩蓋。
- 待確認：常用裝置尚未操作，或某個必要保護缺證據；只保留該層待驗，不把未使用平台缺席當成整體阻塞，不連帶卡 DEV-097。

## 10. 最小記錄

裝置／瀏覽器、版本、操作摘要及結果即可；失敗時按診斷需要補截圖／錄影／trace。舊 trial workbook 保留為歷史附件，不再要求逐筆 ID／order／timecode、公式統計或簽核。

## 11. 依影響選測

```powershell
npm.cmd run verify:dev-054-mobile-task-drag-precision
npm.cmd run verify:dev-054-mobile-task-drag-precision-browser
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-044-undo-coverage
```

本次檢查器／文件精簡使用上述來源驗證保護仍在；其他產品 source 未變的有效證據可重用。未來依 §3／§6 的受影響行為選測，不每輪固定跑所有相鄰套件。改 runtime 型別／bundle 才另跑 TypeScript／build；沒有執行的命令不列 PASS。DEV-097 只依自己的 PWA owner／cancel／flush／資料保留／恢復驗證，不等待本 DEV 自用手機確認。

相鄰 browser verifier 可由初始 URL 的 `qaCases` 指定現有 case ID；未指定時沿原完整套件，未知／未執行的選擇必須 FAIL。結果含 selectedCaseIds，不能把選測 PASS 稱為整套 PASS。本次選 DEV-053 B01／B07／B10／B13 及其錯誤 sweep，DEV-029 C04／C07／C08／C12／C13；保留正常 UI／fixture／資料讀回，不直接 seed 預期完成結果。

## 12. 歷史已執行證據（2026-07-17；當時門檻不再作現行阻塞）

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

當時尚未執行的 B01–B12 正式 QC report 與 iOS／Android 50-trial matrix、trial sheet、錄影及裝置資訊，保留為歷史事實。這些舊 package 要求已被 §2、§8–§11 取代，不再是 RD 開發完成條件；未執行項目不改寫成 PASS。

## 13. 歷史 QC Evidence Package 快照（已被現行 §10 取代）

- Git / working tree boundary 與測試環境 URL。
- Required command 結果與失敗 log。
- D01-D04 desktop baseline 前後截圖 / trace。
- B01-B12 mobile trace、viewport 與 geometry measurement。
- iOS / Android trial sheet、裝置資訊、操作錄影與統計。
- 每個 wrong / no-op trial 的 raw / intent / locked target trace。
- Visible error、console、network、horizontal overflow sweep。
- 最終結論：`通過`、`未通過` 或 `未充分驗證`。

上述是當時要求，已由 §8–§10 的自用確認與最小記錄取代；舊雙平台未執行仍為歷史事實，不再要求重新製作此 package。

## 13.1 DEV-068 Source Preview Revalidation（2026-08-15）

- 未進入child intent的一般same-level mobile drag繼續驗證12px finger clearance；進入DEV-065完整藍框的child candidate／armed改驗證finger upper-right 16px、8px viewport clamp及parent/ghost零交集。R05／R06實測phase=`candidate`且clearance=16px。
- 最新DEV-054 browser 15/15 PASS；physical iPhone／Android門檻仍未執行，狀態邊界不變。

## 14. 歷史 RD Rework 5 執行結果（2026-08-14）

Automated QA 判定：`PASS`。整體 DEV 判定：`未充分驗證`（僅因 required physical gate 尚未執行）。

| 驗證層 | 結果 | 主要覆蓋 |
|---|---|---|
| DEV-054 static | 45/45 passed | TouchEvent 不受 viewport gate、selection/callout ownership、Workbench native pan、unplaced direct board target、column blank target、placed no-drag、no TouchSensor |
| DEV-054 browser | 15/15 passed | native topbar touch、action rail exactly-once、同層／跨層落點、jitter、stale target、invalid zero-write、320/390/430、L1/L2/L3+ 零圈選、430ms/7px/9px、844x390/1024x768 touch、Workbench unplaced 跨 inline 分欄歸位 |
| Mobile pan regression | DEV-029 static 39/39；browser 41 cases passed | quick tap、horizontal/vertical pan、long press、cancel、edge scroll、CTA、互動控制、無 click-through |
| Shared drag regressions | DEV-046 static 31/31 + browser passed；DEV-053 static 30/30 + browser 10/10 | 全表面拖拉、click/right-click、invalid no-op、cancel recovery、placed row readonly |
| Desktop / L1 regressions | DEV-055 static 27/27 + browser 16/16；DEV-067 static 13/13 + browser 8/8 | 桌機 approved overlay、同欄／跨欄／復原、L1 promotion/reorder、錯誤提交為 0 |
| Workbench regression | DEV-039 static 31/31 + DEV-042 browser 8/8 | scoped v2 prefs、未歸位可拖、已歸位不可拖、mobile／desktop 共用 inline 元件、lane filtering |
| Engineering gates | TypeScript passed；targeted ESLint 0 error；`build:test` passed | 編譯、型別、規範、可建置性 |
| Runtime sweep | console errors 0；network failures 0；visible errors 0 | DEV-054、DEV-053 與相鄰 rendered suites |

零容忍項目結果：wrong target = 0、wrong parent = 0、duplicate commit = 0、stale indicator commit = 0、native text selection = 0、mobile desktop context-menu fallback = 0、placed-row drag = 0。

當時尚缺雙平台實機量化驗證；現行改為實際自用裝置重點確認，舊 P matrix／工作簿不再是完成或其他任務發布的前置。未執行部分不標 PASS。

## 15. 2026-10-19 精簡實作與 RD 自查

來源為 `codex/dev054-self-use-gates`，產品基線 `5c9c1a692366a7085802d1674b42d1c33bbeeef7`；本次只改直接文件、索引及 verifier，`src/`、package／lock、Vite config 與 PWA runtime 無差異。環境為 task-owned localhost:4000／Vite test，已從 served module 核對 backend=`local-test`；browser 使用獨立的合成帳號與資料，不操作正式 backend。結果是 RD 自查，不是新獨立 QC／實機／正式驗收。

首個有效 browser 失敗保留：R01 仍要求舊 sidebar 無遮罩版型；R15 把跨面板欄距鎖成 2px，而基線已是有間距的面板。修正檢查器為正常 touch 開關入口、面板不重疊且有可操作 drop area，仍完整執行歸位與 exactly-once readback；產品未改。原失敗畫面保留在 `output/playwright/dev-054-mobile-drag-1792388514866-QA-054-R01-FAIL.png` 與同前綴 `QA-054-R15-FAIL.png`。此前 sandbox socket／CIM 權限限制是執行器失敗，調整 task-owned runtime 後再驗，未記成產品 PASS。

| 本輪驗證 | 實際結果與範圍 |
|---|---|
| DEV-054 static | 46/46；只移除兩個文件存在檢查與固定實機數字的文字鎖定，保留 source／安全 wiring |
| DEV-054 browser | R01–R15 全部 15/15，console／network error=0；`output/qa/dev-054/20261019-self-use/browser-final-result.json` |
| DEV-053 選測 | B01／B07／B10／B13＋B15 error sweep，5/5；涵蓋五種取消事件零寫入／可重試及 placed-row 唯讀，未稱整套通過；`dev053-safety-result.json` 在上述同目錄 |
| DEV-029 選測 | C04／C07／C08／C12／C13，5/5；封存確認、action、水平／垂直 edge-scroll；`dev029-safety-result.json` 在上述同目錄 |
| 選測器負向 | DEV-053 B99／DEV-029 C99 均因 Unknown or unexecuted selection 回 exit=1，符合預期；未執行案例不能空跑綠燈 |
| 相鄰 structural／undo wiring | DEV-053 31/31、DEV-029 42/42、DEV-044 27/27；不外推為實機或完整 undo UI 驗收 |
| 腳本／文件 | 四個變更腳本 syntax、targeted ESLint、UTF8／whitespace 與 diff check 通過 |

所有 browser session 由 runner 的 finally 關閉，已確認已知 task browser PID 結束；Vite task-owned tree 已停止，4000 port 已釋放。首輪失敗與本輪新結果分開保存，不覆寫歷史收據。未重建未變產品、未執行 DEV-097 新一輪 real-SW／production，也沒有把既有 PWA 安全證據失效化。

剩餘僅為本 DEV 實際自用裝置重點操作確認；其他未測手機平台仍未驗證。DEV-097 的雙平台前置已解除，自己的 dirty owner／cancel／flush／資料保留／更新恢復與 release 邊界保留；解除連動不代表 DEV-097 已發布或增加完成率。

## 16. 2026-10-26 RD 開發完成重驗

受測來源為 `codex/projed-independent-dev@79500386e40a1572afd671f7b5e3e916dcfaaceb`。本輪在 task-owned `localhost:4000`／Vite test 執行，沒有連線正式 backend、修改 DB 或發布；結果仍屬 RD 自查。

| 驗證 | 結果 |
|---|---|
| DEV-054 static | 46/46 PASS；static verifier 改驗工程常數的安全界限，不再把可調參數鎖成整段 source 字串 |
| DEV-054 browser | R01–R15 15/15 PASS；console／network error 0；`physicalDevice=not-executed` |
| 關鍵資料安全 | invalid／screen-edge release 零寫入、action 與 Workbench 歸位 exactly-once、placed row 不可拖、取消／清理與重試契約通過 |
| 畫面證據 | `output/playwright/dev-054-mobile-drag-1793017005495-*`；含 R01、R05、R06、R08、R10–R12、R15 對應畫面 |

判定：DEV-054 的 RD 開發完成。實際常用手機的手感與平台事件仍是獨立的自用驗收待確認；本輪沒有把 synthetic touch 結果改稱實機 PASS 或正式發布。
