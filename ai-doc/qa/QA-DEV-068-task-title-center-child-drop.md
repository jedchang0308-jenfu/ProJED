# QA-DEV-068：任務標題中央停留移入子任務

狀態：Plan Ready / AI True Operation Required / Not Executed

對應規格：`ai-doc/specs/SPEC-068-task-title-center-child-drop.md`

驗證角色：QA 制定；後續 QC 只依計畫操作與蒐證，不修改產品程式。

## 1. 驗證目標

驗證使用者在桌機與手機把來源拖到任一階層任務標題中央後，只有連續停留滿 1 秒才出現明確 child placement preview，且只有放開才把來源移為 exact target 的直接子任務。同時證明此新入口不破壞同階排序、L1 升階、mobile pan/action rail、click/right-click、cycle guard、undo、source subtree 與 viewport。

本計畫的通過條件不是「程式有 target attribute」，而是 AI 在真實渲染頁面完成實際 mouse／touch 操作，畫面預覽、timing trace 與 release 後資料三者一致。

## 2. AI 真實操作定義

必要操作證據：

- 使用真實啟動的 ProJED rendered route；優先使用受保護的 `http://127.0.0.1:4173/`，不得為驗證任意停止或重啟其 process。
- Desktop 使用真實 mouse down/move/hold/up 路徑；Mobile 使用瀏覽器 touch/pointer input 路徑並實際觸發 long-press drag-action，不得直接呼叫 commit function。
- 可以用 fixture/reset 入口建立測試資料，也可以在操作前後唯讀讀取 store snapshot；不得直接呼叫 `updateNode`／`batchUpdateNodes` 代替拖曳。
- 每個主要案例保存 route、viewport、輸入模式、source/target id、pointer/touch coordinates、進入 target 時間、armed 時間、release 時間、before/after node snapshot、DOM state、screenshot 或 video、console/network/visible-error sweep。
- 只有 static/unit/lint/TypeScript/build 通過，或只有 DOM attribute 存在，判定為 `未充分驗證`。

若需要另開暫時驗證 runtime，必須使用非 4173 的已記錄 port，完成後只清理該 task-owned process tree，並確認 4173 仍可連線。

## 3. 測試環境與 Viewport

| 類型 | Viewport | 輸入 | 必要性 |
|---|---:|---|---|
| Desktop | 1440x900 | mouse | 必測 |
| Laptop | 1024x768 | mouse | 必測 |
| Mobile portrait | 390x844 | touch/long-press | 必測 |
| Large mobile | 430x932 | touch/long-press | 必測 |
| Narrow mobile | 320x844 | touch/long-press | 視覺與 overflow 必測 |
| Physical iPhone Safari | 實機 | touch | 完整 mobile sign-off gate；無 AI 可控裝置時標記未充分驗證 |
| Physical Android Chrome | 實機 | touch | 完整 mobile sign-off gate；無 AI 可控裝置時標記未充分驗證 |

本機 browser synthetic touch 可完成產品功能與 geometry gate，但不得取代既有 DEV-054 的 physical-device precision gate。缺 iOS／Android 實機時，DEV-068 可標 `AI Browser QA/QC Passed`，不得標記完整 mobile sign-off 或 release ready。

## 4. Fixture 與資料需求

每次 suite 使用可重設且不影響正式資料的看板 fixture：

- L1-A、L1-B、L1-C：至少三個 root group，可測 reorder、promotion 與 exact parent。
- L2-A-leaf：無 child；L2-A-parent：已有 2 個 child；L2-A-collapsed：已有 child 且收合。
- L3-A-leaf、L3-A-parent、L4-A-child：可測深層中央 child drop 與 cycle guard。
- Source-leaf：無後代；Source-tree：至少 2 層、3 個非封存後代，可測 subtree preserve。
- 同名任務、長中文、長英文不換行、空標題 fallback、日期／標籤／依賴控制存在的任務。
- completed target、archived/missing target、filter-hidden sibling、permission viewer 與拖曳中撤權 fixture。
- Workbench unplaced/placed row fixture，確認 DEV-039/053 邊界。

每個資料案例先保存 canonical `id/parentId/order/nodeType/status/children` snapshot；操作後以 id 比對，不以畫面文字作唯一識別。

## 5. FMEA 風險表

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 使用者仍不知道中央可停留 | candidate 無立即回饋或被 DragOverlay 遮住 | 新功能仍不可發現 | 中央進入後 screenshot/DOM/5秒理解檢查 | P1 | UX-001、VIS-001 |
| 未滿 1 秒即命中或提交 | timer 起算過早、long-press 時間被計入 | 意外改階層 | 900ms real operation＋999ms fake clock | P0 | TIM-001、MOB-003 |
| 滿 1 秒仍無 preview | timer stale、render frame 未更新 | 使用者無法確認落點 | 1,100ms hold＋armed trace | P0 | TIM-002、DESK-002、MOB-004 |
| Hover/dwell 自動寫入 | armed callback直接 commit | 尚未放開資料已改 | armed 前後 store snapshot | P0 | TIM-003 |
| Release before dwell 被當同階排序 | collision fallback 到 card/checklist | 想停留卻誤排序 | center 900ms release snapshot | P0 | TIM-001、CON-001 |
| 離開 target 後舊 timer armed | timeout 未清除或 session key 不完整 | 落到錯誤 parent | enter A→leave→wait→release | P0 | TIM-004 |
| 快速跨越 A/B 鎖到 A | timer 未包含 target id | preview與落點錯誤 | rapid target switch trace | P0 | TIM-005 |
| Auto-scroll 後提交 scroll 前 target | geometry/observation 未重算 | 手機放錯任務 | edge scroll＋release snapshot | P0 | MOB-009 |
| 一般同階排序被中央 dwell 吃掉 | zone ownership不清 | 既有肌肉記憶回歸 | 中央外 before/after cases | P0 | CON-001～003 |
| L1 header 中央仍升為 L1 | DEV-067 target優先於 child armed | 想放入列表卻升階 | L1 center vs non-center pair | P0 | DESK-004、MOB-006 |
| L3+ 無法成為 parent | checklist row缺 title target metadata | 階層仍不一致 | L3→L4 true operation | P0 | DESK-006、MOB-007 |
| 舊卡片底部透明區仍可 child commit | legacy dropzone 未退役 | 存在兩套不可見操作 | bottom release negative case | P1 | CON-004 |
| Preview 與 commit parent不一致 | presenter/commit 使用不同 resolver | 任務落錯位置 | preview descriptor vs snapshot | P0 | DATA-001～004 |
| Preview 只是一條藍線 | 沿用 insertion marker 未表達 child | 使用者仍誤認同階 | screenshot + semantic DOM | P1 | UX-002 |
| Preview 推開任務或改變 scroll | inline ghost/height transition | 看板跳動、定位漂移 | before/armed rect與scroll量測 | P1 | VIS-002 |
| Preview/marker/origin同時存在 | presentation priority不唯一 | 使用者無法判斷結果 | DOM visible count | P0 | UX-003 |
| 手指遮住 target/preview | preview使用pointer中心 | 手機看不到 parent/child | screenshot與finger geometry | P1 | MOB-005、VIS-004 |
| Action rail與child同時提交 | target priority或terminal guard失效 | 建立/刪除同時移動 | action rail drop before/after | P0 | MOB-010 |
| Quick tap或short pan誤入拖曳 | long-press arbitration回歸 | 手機操作卡住 | actual tap/pan input | P0 | MOB-001、002 |
| Touchcancel/背景切換殘留 timer | cleanup path分散 | 下次手勢錯亂 | cancel→new session | P0 | MOB-011、REC-003 |
| Self/descendant造成 cycle | armed前未驗證或release未重驗 | 任務樹損壞 | invalid target matrix | P0 | SAFE-001～003 |
| 拖曳中撤權或target消失仍提交 | 只信 hover snapshot | 越權或寫入 stale parent | mutate external state後 release | P0 | SAFE-004～006 |
| Source subtree遺失或nodeType錯 | normalize只更新單節點 | 資料階層／看板投影損壞 | descendant id與nodeType snapshot | P0 | DATA-003、004 |
| Pointerup/touchend/dnd-end重複寫入 | 多 terminal event競爭 | order漂移、undo拆分 | command count/undo history | P0 | DATA-005 |
| Long/empty title中心不穩 | hit zone綁 glyph或truncate寬度 | 特定任務不能使用 | long/empty title matrix | P1 | GEO-003～005 |
| Interactive controls被中央區攔截 | safe zone覆蓋按鈕 | 日期、標籤、展開操作失效 | click/control drag tests | P1 | CON-005 |
| 手機/桌機 viewport裁切或overflow | ghost/action rail/z-index錯誤 | 無法操作或閱讀 | 五 viewport screenshots | P1 | VIS-003～006 |
| 顏色成為唯一訊號 | 缺縮排、icon、label、aria | 色覺/輔助科技無法理解 | DOM/a11y tree與目視 | P1 | A11Y-001～003 |
| Runtime visible error | timer/state exception或API失敗 | 主流程中斷 | visible error/console/network sweep | P0 | ERR-001 |

## 6. 測試案例

### 6.1 Geometry、可發現性與預覽

| ID | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| GEO-001 | Desktop 將來源移入 L2 title 幾何中心 | 進入 `child-candidate`，中心點被安全區包含 | coordinates、DOM state、screenshot |
| GEO-002 | Desktop 將來源移到 title 左／右外圍與任務上／下排序區 | 不進 child candidate；維持一般有效落點 | coordinates、indicator descriptor |
| GEO-003 | 依序測長中文、長英文 truncate、未命名 fallback | 每個 title center 都可穩定 candidate/armed | rect、screenshots |
| GEO-004 | L1、L2、L3+ 不同縮排 title center | safe zone對齊 exact innermost title，不落到 ancestor | target id、rect、screenshot |
| GEO-005 | Mobile 390/430 在 title center 觸控停留 | hit target 至少44x44且不超出 task primary surface | computed rect、touch point |
| UX-001 | Drag 進中心後立即觀察、尚未滿1秒 | 有低干擾 candidate 回饋，能辨識目前 target；無 child ghost | screenshot、visible DOM count |
| UX-002 | 持續至 armed | 顯示 exact parent＋縮排 ghost child＋非純色 child 語意；不是一般線 | screenshot、a11y/DOM text |
| UX-003 | 往返 origin、一般位置、candidate、armed | 任一時刻只有一種主要 feedback，visible count = 1 | DOM count、video |

### 6.2 Timing 與 session lifecycle

| ID | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| TIM-001 | Center 停留約900ms後放開 | no-op；parent/order/nodeType不變；無undo command | timestamps、before/after、undo count |
| TIM-002 | Center 停留約1,100ms | armed preview出現；尚未放開時store不變 | timestamps、screenshot、snapshot |
| TIM-003 | Armed後再停留2秒不放開 | 不自動commit、不重複armed、不累積timer | snapshot、event trace |
| TIM-004 | 進A 500ms→離開→等待800ms→放開 | A不armed，zero-write | video、timer trace、snapshot |
| TIM-005 | A 700ms→B 700ms→A 400ms | 全部不armed；每次target切換重算 | target sequence、DOM |
| TIM-006 | A armed→離開到一般排序區→放開 | armed立即清除，依當下有效一般落點或no-op；不得child A | video、preview/commit descriptor |
| TIM-007 | fake clock 999ms／1000ms 邊界 | 999ms不armed；1000ms進armed | deterministic test log |
| TIM-008 | 連續20次 center enter/leave/cancel | 無stale preview、timer leak、下一次session可立即啟動 | event/timer count、console |

### 6.3 Desktop mouse flow

| ID | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| DESK-001 | L2 leaf → L2 leaf center 900ms release | zero-write | mouse trace、snapshot |
| DESK-002 | L2 leaf → L2 leaf center 1100ms release | source成為target直接L3 child，append最後 | armed screenshot、snapshot |
| DESK-003 | L2 source tree → L2 parent center | source與完整subtree移入，target既有children順序保留 | before/after tree、undo |
| DESK-004 | L2/L3+ → L1 header：center armed 與非center各做一次 | center結果為該L1的L2；非center維持DEV-067 L1 promotion/reorder | pair screenshots、snapshot |
| DESK-005 | L1 group → L2 center armed | parent為L2 target、nodeType正規化為task、subtree保留 | snapshot |
| DESK-006 | L2／L3 leaf → L3 parent center | source成為exact L3的直接下一階child | target id、tree snapshot |
| DESK-007 | target已有children且收合 | armed preview可辨識；commit後target展開且新child暫時高亮 | video、screenshot |
| DESK-008 | Escape、blur、pagehide/visibility、pointercancel | preview/timer/overlay清除，zero-write，可立即重新拖曳 | DOM、snapshot、second-session proof |
| DESK-009 | 8px以下mouse move、click、right-click、blank pan | 不啟動child session；既有操作正常 | modal/menu/scroll evidence |
| DESK-010 | 一次commit後Undo/Redo | 一次Undo完整還原；Redo重現相同parent/order/type | undo history、snapshots |

### 6.4 Mobile touch flow

| ID | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| MOB-001 | quick tap L1/L2/L3+ title | 開exact task詳情，不進action rail/candidate | touch trace、modal id |
| MOB-002 | title上短水平／垂直pan | board/column實際捲動，不進drag/candidate、不click-through | scroll before/after、DOM |
| MOB-003 | long-press啟動後進center 900ms release | no-op；long-press啟動時間不得灌入dwell | timestamps、snapshot |
| MOB-004 | long-press後center 1100ms | 唯一armed child preview；store尚未變 | screenshot、snapshot |
| MOB-005 | armed preview於390/430/320 | finger不遮住parent與ghost；action rail不遮擋；無overflow | screenshots、geometry |
| MOB-006 | L2/L3+ → L1 center與non-center各做一次 | center為L2 child；non-center維持L1 promotion/reorder | pair screenshots、snapshot |
| MOB-007 | L2 → L3+ center armed release | source成為exact L3+直接child | before/after tree |
| MOB-008 | armed後raw finger微移仍在安全區 | target穩定；超出安全區立即解除，不做nearest magnet | point/target trace |
| MOB-009 | 靠近board/column邊緣auto-scroll後停在新target | 重新計時與hit-test，只能提交scroll後exact target | scroll/target/timing trace |
| MOB-010 | candidate/armed期間拖進完成、新增同階、新增子任務、刪除action | action rail優先；每次只執行一個action；child move count=0 | action result、command count |
| MOB-011 | touchcancel、pointercancel、contextmenu合成、背景/旋轉 | session完整清理，沒有完整桌機選單，下一次可操作 | DOM、video、second session |
| MOB-012 | 連續10次long-press child move與10次取消 | wrong parent=0、double commit=0、卡死=0 | trial sheet、snapshots |

### 6.5 Data、權限與安全

| ID | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| DATA-001 | L1/L2/L3+ valid child commit | preview target id = final parentId；order為canonical末尾 | descriptor、snapshot |
| DATA-002 | target有hidden/filtered children | append到完整canonical children末尾，不插入hidden中間 | full tree snapshot |
| DATA-003 | Source-tree move | 所有非封存descendant id/parent關係保持；只有source parent改變 | tree diff |
| DATA-004 | L1 group source移入child | nodeType、parent、ancestor rollup與跨視圖投影一致 | store/cross-view evidence |
| DATA-005 | 同時產生pointerup/touchend/dnd-end terminal事件 | batch/undo command恰好1次 | command instrumentation |
| SAFE-001 | source拖到自己center | 不candidate、不armed、zero-write | DOM、snapshot |
| SAFE-002 | source拖到direct child/descendant center | 不fallback ancestor、不armed、zero-write | target trace、snapshot |
| SAFE-003 | cycle fixture或重複DOM id異常 | resolver拒絕，UI清理，console無崩潰 | log、snapshot |
| SAFE-004 | viewer/no-move permission | 無drag source或無armed；零寫入 | role evidence、snapshot |
| SAFE-005 | armed後撤銷move permission再release | release revalidation no-op，preview清除 | permission before/after、snapshot |
| SAFE-006 | armed後archive/delete/filter-out target再release | zero-write，不提交stale parent | DOM/store mutation trace、snapshot |
| SAFE-007 | cross-board或Workbench placed row嘗試 | 遵守既有邊界，不以title center繞過限制 | snapshot、DOM |

### 6.6 衝突與回歸

| ID | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| CON-001 | L2同欄before/after、跨欄排序 | 非中央區立即排序，不等待1秒 | timing、snapshot |
| CON-002 | L3+同父層排序 | checklist before/after不回歸 | snapshot |
| CON-003 | L1 header reorder/promotion與root-drop | 非中央與root-drop維持DEV-067 | screenshot、snapshot |
| CON-004 | 拖到舊L2卡片底部透明區後放開 | 不以舊child append語意commit；不得出現第二child target | DOM、snapshot |
| CON-005 | 點擊展開、日期、標籤、依賴、完成等controls | interactive controls不啟動drag或candidate，功能正常 | control result |
| CON-006 | origin→general position→candidate→armed→origin | source field、marker、child preview priority正確且零殘留 | video、visible count |
| CON-007 | Workbench unplaced→placed與placed row | unplaced placement保持；placed row仍不可拖 | existing flow evidence |
| CON-008 | filter、collapsed、large fixture drag | exact target與canonical order正確，沒有明顯延遲/掉幀造成wrong commit | timing、snapshot |

### 6.7 視覺、可及性與可見錯誤

| ID | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| VIS-001 | 五viewport截取candidate/armed/committed | target、ghost、child語意清楚，沒有常駐教學噪音 | screenshots |
| VIS-002 | 量測drag前/candidate/armed的task rect、column width、scrollWidth | delta=0（容許瀏覽器小數rounding≤1px）；無normal-flow位移 | geometry log |
| VIS-003 | 長標題、深縮排、靠viewport邊緣target | preview不裁切、不遮住主要控制、不產生水平overflow | screenshots |
| VIS-004 | Mobile action rail＋finger preview＋child preview | z-index清楚，沒有互相覆蓋造成不可讀/不可放 | screenshot、rect |
| VIS-005 | Commit後展開與短暫highlight | 新位置可找到，不建立常駐badge/CTA或重複文案 | video、DOM cleanup |
| A11Y-001 | 檢查candidate/armed accessibility tree | 具有可辨識target/child語意，不只依顏色 | role/name evidence |
| A11Y-002 | 使用高對比/色彩非唯一目視檢查 | 縮排、形狀、短標籤或icon仍能辨識child | screenshot |
| A11Y-003 | Commit/cancel announcement | 成功只announce一次；cancel/no-op不誤報成功 | live-region log |
| ERR-001 | 每個關鍵viewport完成visible error sweep | 無`.inline-error`、非預期`[role=alert]`、HTTP 4xx/5xx、Not Found、Internal Server Error、可見API route error；console/network無非預期失敗 | sweep log、screenshot |

## 7. 執行順序與 Stop-Ship Gate

1. Static/pure：state machine、1,000ms fake clock、zone ownership、resolver、cycle/permission、single terminal。
2. Desktop true operation：1440與1024，先 timing/center，再L1/L2/L3+，最後同階與controls回歸。
3. Mobile true operation：390與430，quick tap/pan/long-press、timing、all hierarchy、action rail、auto-scroll/cancel。
4. Visual edge：320與長文字／深縮排／viewport edge。
5. Data/undo/cross-view、visible-error、console/network sweep。
6. Physical iOS/Android：若有AI可控裝置，執行每平台至少30次target-switch與20次cancel；無裝置則標記未充分驗證，不以synthetic touch取代。

遇到下列任一項立即停止該輪、保存證據並回送 RD，不以其他 pass 抵銷：

- wrong parent/order/nodeType、cycle、subtree遺失。
- early child commit、hover/dwell寫入、stale target、double commit。
- preview descriptor與final snapshot不一致。
- mobile quick tap/pan/action rail、desktop click/right-click或non-center reorder回歸。
- 主要viewport不可操作、可見runtime error、preview/marker重疊或normal-flow位移。

## 8. 通過標準

- 所有 P0 案例 100% 通過；wrong parent、early commit、stale commit、double commit、cycle、subtree loss、permission bypass、visible runtime error皆為0。
- 所有列為必測的 Desktop/Mobile true-operation、三個主要viewport與320 edge viewport都有操作、截圖/錄影、timing及before-after snapshot。
- Fake-clock 999/1000ms boundary與real-operation 900/1100ms boundary皆通過。
- Armed preview只在滿1秒後出現，且在release前資料零變更；release後exact parent一次提交並可一次undo。
- 非中央同階排序、L1 promotion、column/root lane、origin no-op、action rail、Workbench、click/right-click/pan回歸全部通過。
- Physical iOS/Android缺失時，結論上限為`AI Browser QA/QC Passed / Physical Mobile 未充分驗證`；不得宣稱完整mobile sign-off或release ready。

## 9. 失敗證據格式

每個失敗至少保存：

- Case ID、route、viewport、input mode、fixture版本、時間戳。
- source/target id、title rect、center zone rect、pointer/touch point與target sequence。
- drag start、candidate start、armed、release的monotonic timestamps。
- Preview DOM/descriptor、visible feedback count、before/after nodes、undo command count。
- 失敗前後 screenshot；timing、target-switch、auto-scroll、mobile conflict需保存video或完整event trace。
- console error、network failure、visible error text；說明預期、實際、使用者影響與最小重現步驟。

## 10. QC 預定指令與證據入口

RD Implementation Ready 階段應建立並登錄以下等效指令；實際名稱可依 repo 慣例調整，但不得省略 true-operation browser suite：

- `npm run verify:dev-068-task-title-center-child-drop`
- `npm run verify:dev-068-task-title-center-child-drop-browser`
- `npm run verify:dev-055-desktop-task-drag-target-clarity-browser`
- `npm run verify:dev-054-mobile-task-drag-precision-browser`
- `npm run verify:dev-067-kanban-l1-drag-browser`
- `npm run verify:dev-053-task-drag-muscle-memory-consistency-browser`
- `npx tsc --noEmit`
- targeted ESLint
- `npm run build:test`

Browser evidence 需集中於 `output/playwright/dev-068-*` 或 repo 既有等效 artifact root；QC 報告需記錄每個必要 case 的 screenshot/video/trace 路徑，且完成後不得留下額外暫時 runtime。

## 11. QA 狀態邊界

本文件目前僅為驗證計畫，尚未執行任何案例。RD 自述、程式碼完成、static verifier或build通過都不能把本文件改為PASS；只有QC依上述真實操作與證據門檻完成後，才能更新結果。

