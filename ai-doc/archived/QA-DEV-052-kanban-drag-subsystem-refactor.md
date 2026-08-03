# QA-DEV-052：看板拖拉子系統重構真實操作驗證計畫

關聯 DEV：DEV-052
關聯 SPEC：`ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md`
狀態：Archived / Historical / Do Not Execute / Not Executed
風險等級：Medium；P0 資料／手勢／重複提交缺陷為 Stop Ship
建立日期：2026-07-16
最近更新：2026-07-17

使用思考習慣：#可驗證性、#批判、#證據基礎

> 2026-07-16 回復註記：DEV-052 已延後；本計畫只保留為未來驗證設計參考，目前不得據此
> 啟動重構或宣稱 QA ready。
>
> 2026-07-17 封存註記：本文件已移至 `ai-doc/archived/`，不得作為 active QA plan、
> RD gate 或目前可執行驗證入口。

## 1. QA 任務與結論邊界

本計畫驗證 DEV-052 只改內部架構，不改變 DEV-051 已確認的使用者行為；同時針對近期反覆出現的拖拉問題建立可重現、可量測、可回放的真實操作 gate。

完成判定不能只依靠 static、TypeScript、build 或 RD 自述。必須同時取得：

1. pure／static／browser automation 證據。
2. desktop 實際滑鼠操作與口述理解證據。
3. 實體 iOS Safari 與 Android Chrome 觸控操作證據。
4. drop 前後資料、undo／redo 與 visible error sweep。

若缺 physical phone、真人操作、viewport、錄影／截圖或資料 snapshot，只能判定 `未充分驗證`，不得標示 DEV-052 QA Passed。

DEV-051 的 physical phone supplemental 邊界不被回溯改寫；本計畫只因 DEV-052 是整個拖拉子系統重構，且使用者要求「真實操作」，把 physical iOS／Android 設為 DEV-052 完成 gate。

## 2. 驗證角色與可執行範圍

| 驗證層 | 執行者 | 可驗證內容 | 是否為完成必要條件 |
|---|---|---|---|
| A — AI／自動化真實瀏覽器 | Codex／Playwright | pointer 軌跡、DOM state、幾何、資料 snapshot、回歸、截圖、visible error | 是 |
| B — 真人 desktop | QA 操作者，實際滑鼠與 touchpad | 手感、5 秒理解、快速換 target、自然抖動、真實 scroll | 是 |
| C — 真人 physical touch | 實體 iOS Safari、Android Chrome | pan／tap／long-press、手指遮擋、20px tolerance、edge auto-scroll、touchcancel | 是 |
| D — 第二觀察者 | 未參與實作的人員 | 不看說明，只靠框與線判斷父層和落點 | 指定理解案例必要 |

AI 可完成 Level A 與部分幾何操作，但不能替代真人的主觀理解、實際滑鼠慣性與實體觸控事件。

## 3. 測試環境與資料

### 3.1 Fixture

使用 disposable local board，固定至少包含：

- Root-A、Root-B、Root-C。
- 每個 root 至少 4 個同層任務；A2／B2 各有至少 3 個 child。
- 兩條深層 branch，延伸到 L5，且 L3／L4 有可互換父層。
- Empty-B：無 child。
- Collapsed-B：有 child 但收合。
- Filter-P：canonical 順序 `V1, H1, V2, H2, V3`，filter 後只顯示 V。
- 長標題、窄卡、超長 column、可觸發水平／垂直 auto-scroll 的資料。
- owner/editor 與 viewer 角色。
- cycle target：source 本身與 source descendant。

每一個 write case 執行前保存：

- 全部 node `id／parentId／nodeType／order／status／boardId` snapshot。
- source／destination sibling canonical order。
- undo stack 長度或可辨識的 command count。
- 目標卡片與相鄰卡片 bounding rect。

### 3.2 Viewport／Browser／Input

| 類型 | 最小覆蓋 |
|---|---|
| Desktop mouse | Chrome／Edge，1440x900、1024x768 |
| Desktop touchpad | 1440x900 或 1024x768，至少重跑 scroll／快速換 target／cancel |
| Browser automation | Chromium，1440x900、1024x768、390x844、320x844 |
| Physical iOS | 支援版本的 iPhone Safari，portrait；若產品支援 landscape，另重跑 viewport safety |
| Physical Android | 支援版本的 Android Chrome，portrait |
| 網路／資料 | local disposable fixture；不得對 production board 寫入 |

### 3.3 Baseline Gate

重構第一行產品程式前，必須在同一 branch／同一 fixture 保存：

- `verify:dev-051-kanban-cross-parent-drag-lock` 33/33 pass。
- DEV-051 browser command pass 與 D00／D01／D02／D03／D07／M05／M09 截圖或 trace。
- R02、R03、R04、R05、R06、R10、R12、R17 的 before-refactor 操作錄影。
- dirty worktree 的檔案邊界與基準 SHA；不得用後續成功覆蓋 baseline 失敗。

若 baseline 本身有 P0／P1 缺陷，先記錄為 characterization expected failure；不得在無紀錄下把修 bug 混稱為純重構。

## 4. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| preview、線與 commit 指向不同 target | collision、point hit-test、release fallback 分裂 | 任務落到非預期位置 | R03、R07、R13；geometry＋after snapshot | P0 | 同一 observation 驅動三者 |
| 同一 drag 提交兩次 | touchend／dnd end／stale callback 重入 | duplicate、order drift、兩筆 undo | A06、R14、R21 | P0 | session terminal guard、batch count=1 |
| cancel 後 timer 或 target 殘留 | cleanup 分散 | 下一次拖曳沿用舊父層 | A05、R12、R23 | P0 | 所有 exit path 走同一 cleanup |
| source 與 preview 同時顯示任務名稱 | presentation state 不一致 | 使用者不知哪一張會移動 | R04、R19 | P1 | source hidden；visible moving title ≤1 |
| 多條插入線或非目標 spacing 跳動 | 每個 lane 都 reserve space | 看板干擾、難定位 | R03、R08、R16 | P1 | visible line ≤1；overlay geometry |
| preview 未跟 pointer／finger | dnd delta、舊 pointer 或 preview 擋 hit-test | 使用者抓不住任務 | A03、R02、R18 | P1 | center-distance gate |
| 跨父層鎖定過早／過晚 | timer race、candidate 未重設 | 誤改階層或操作遲滯 | A02、R06、R20 | P0 | fake clock＋真人感知雙驗證 |
| 快速換 target 仍提交舊 target | stale observation／collision | 任務放錯群組 | A04、R07、R22 | P0 | sequence/session id 淘汰舊 observation |
| filter 下 hidden siblings 被重排 | 使用 visible list normalize | 清除 filter 後順序錯亂 | A08、R09 | P1 | canonical snapshot 比對 |
| mobile action 與位置 move 同時執行 | target priority 分流 | 完成／刪除時任務又被移動 | A10、R21 | P0 | action rail priority、batch/action count |
| source／destination ancestor 或 undo 不完整 | commit 被拆成多步 | 狀態與階層失真 | A09、R13 | P0 | single batch snapshot／undo／redo |
| UI 有 visible runtime error／overflow | refactor 破壞 render 或 cleanup | 操作中斷 | R01、R16、R24 | P1 | 每 viewport visible-error sweep |

## 5. Automated Characterization 與 Architecture Cases

| ID | 驗證 | 方法 | 通過標準 |
|---|---|---|---|
| QA-052-A01 | ownership boundary | static import／token scan | BoardView 無 timer ref、Kanban point hit-test、preview state、move builder |
| QA-052-A02 | pure timing | fake clock 699／750／800ms、199／201ms | 與 SPEC-051 完全一致，無 real sleep 依賴 |
| QA-052-A03 | pointer geometry | browser 指定 20 組 x/y | desktop preview center error ≤8px；mobile ≤12px |
| QA-052-A04 | target sequence | 同 frame／連續 frame 快速切 A→B→none→C | 只接受最新 observation；舊 target 不得 commit |
| QA-052-A05 | cleanup matrix | Escape、blur、pagehide、visibility、pointercancel、touchcancel、unmount | timer／RAF／preview／line／frame／session 全清，0 write |
| QA-052-A06 | at-most-once | 重複 end、end 後 timer、touchend＋pointerup | 同一 session batch count ≤1 |
| QA-052-A07 | presentation exclusivity | pointer／placement／none 狀態轉換 | pointer 與 placement 不共存；visible title ≤1；line count ≤1 |
| QA-052-A08 | canonical filter | visible before／after、filtered-empty append | hidden sibling 相對順序不變、無 duplicate／missing |
| QA-052-A09 | commit／undo／redo | 同父層與跨父層 | 一次 batch；parent／type／order／ancestors 完整還原與重現 |
| QA-052-A10 | mobile arbitration | pan、tap、long press、action rail、position drop | action 與 move 互斥；tap／pan 不誤拖 |
| QA-052-A11 | geometry source | line、preview、target data attributes | 同 session id、同 parent／position、rect 關係符合 SPEC |
| QA-052-A12 | legacy path removal | static／runtime instrumentation | 同一事件只進入新 session controller；無舊 handler commit |
| QA-052-A13 | render stability | 連續 hover 100 次、30 次 mixed drag | 無 overlay 殘留、timer 成長、console error、layout drift |

## 6. Desktop 真人實際操作案例

每個案例由真人以實際滑鼠完成；R03、R06、R10、R16 另由未參與實作的第二觀察者執行 5 秒理解檢查。

| ID | 真實操作 | 通過標準 | 必留證據 |
|---|---|---|---|
| QA-052-R01 畫面與資料 sanity | hard reload 看板，確認 fixture；檢查 console／network／畫面 | 資料非 0；無 `.inline-error`、`[role=alert]` failure、4xx/5xx、Not Found、`/api/` error；知道目前看板與可拖任務 | route、viewport、screenshot、visible-error sweep、node count |
| QA-052-R02 無落點 pointer preview | 抓起 L2、L3、L5 任務，移到看板空白／側欄／無效區 | 只有一張 moving preview；原位置無任務名稱／輪廓／空位；preview 精準跟著游標；無 insertion line／lock frame | 錄影、pointer/preview center measurement、DOM count |
| QA-052-R03 單一落點與幾何同步 | 移到同父層任務上／下半部並停住 | 全畫面只有一條藍線；pointer preview 消失；desktop placement preview 與線 left／width 差 ≤2px，預設下方 gap 4±2px；第二觀察者能指出落點 | line＋preview screenshot、computed rect／color、口述紀錄 |
| QA-052-R04 source 直接移除 | 由 L1、L2、L3、L5 各拖一次，不放開 | source DOM 為 hidden／不可見；沒有 placeholder、淡色來源或第二份名稱；取消後原卡完整恢復 | 各 level before／during／cancel screenshots、visible-title count |
| QA-052-R05 同父層預設排序 | L1、L2、L3、L5 分別做 before／after | 不等待、不進 arming；線立即定位；放開順序與線一致；parent 不變；一次 undo | 操作錄影、phase trace、before/after/undo snapshot |
| QA-052-R06 跨父層停留鎖定 | L2、L3、L5 各移到另一 parent；先快速放開，再停留鎖定 | 快速放開 no-op；約 750ms 後框住完整 parent group；只有框與線、無文字；第二觀察者 5 秒內說對 parent 與位置 | timestamp trace、locked screenshot、口述、snapshot |
| QA-052-R07 快速換 target／離開 | 在 A、B、C group 間快速移動，再移出看板，最後回 C | 線／框只跟最新 target；離開後回 pointer preview；放開只可能 C 或 no-op，不得提交 A／B | 連續錄影、observation sequence、final snapshot |
| QA-052-R08 empty／collapsed／append | 拖到 Empty-B、Collapsed-B child lane 與 locked group blank | 只有實際 target line；其他 lane 無線且不改間距；結果 append 到正確 canonical parent | 三種 screenshot、line count、hierarchy snapshot |
| QA-052-R09 filter | 啟用 V/H filter，分別放 V2 前／後及 filtered-empty lane，清除 filter | line 與 visible anchor 一致；H1/H2 相對順序不變；無 duplicate／missing；append 到 canonical 末端 | filter on/off screenshots、full order snapshot |
| QA-052-R10 無效落點／中央區域 | 拖到 self、descendant、task center、無權限 target、側欄 | 不出現鎖定文字；invalid 不提交；task center 不形成隱性 child 分類；第二觀察者知道未出現有效線時不可預期提交 | 錄影、invalid state、0-write／0-undo evidence |
| QA-052-R11 scroll／auto-scroll | 拖曳中水平捲看板、垂直捲長 group，靠近 edge | preview、line、frame 與 pointer 同步；scroll 後 target 重新解析；無 body 誤捲或舊線殘留 | scrollTop/Left trace、錄影、post-scroll rects |
| QA-052-R12 取消／中斷 | 在 pointer、arming、locked、placement 四狀態分別 Escape、blur、切頁、pointercancel | source 恢復；所有 preview／線／框清除；0 write／0 undo；下一次拖曳不沿用舊 target | 每種 before/after screenshot、session id、store trace |
| QA-052-R13 commit／undo／redo | 同父層與跨父層各做一次 move，再 undo／redo | 每次 move 一筆 command；資料與最後線一致；undo 完整、redo 重現；兩側 ancestor 正確 | command count、four-state snapshots、錄影 |
| QA-052-R14 重複操作耐久 | 同一 session 內完成 30 次混合拖曳，包含 10 次 cancel、10 次同層、10 次跨層 | 無 double commit、殘留 overlay、越來越慢、console error、timer／RAF 成長；每次 visible line ≤1 | 全程錄影、session/commit counts、console、DOM leak count |
| QA-052-R15 權限與控制項 | viewer 嘗試拖曳；owner 從 checkbox、menu、input 起手 | viewer 0 write；控制項正常、不被 drag 攔截；menu／details 不誤開或 click-through | role、event trace、screenshots、network/store evidence |
| QA-052-R16 layout／viewport／顏色 | 在 1440x900、1024x768 重跑 pointer、same-parent、locked、empty lane，並把落點移到 viewport 底部 | 非 target 任務 rect 變化 ≤2px；除 source 自然收合外間距穩定；線與 locked frame 的 normalized RGB token 相同（alpha 可不同）；底部空間不足時 preview flip 到線上方 4±2px；無裁切、重疊、overflow | viewport screenshots、rect diff、computed color、placement side、口述理解 |

## 7. Mobile／Physical Touch 真實操作案例

R17～R23 需在 iOS Safari 與 Android Chrome 各執行一次；mobile emulation 可先行除錯，但不能替代 physical pass。

| ID | 真實操作 | 通過標準 | 必留證據 |
|---|---|---|---|
| QA-052-R17 tap／pan／long-press | quick tap、短滑、長按後 lift | tap 開 details；短滑只 pan；只有長按進 drag；無 click-through | device/OS/browser、錄影、scroll position、details screenshot |
| QA-052-R18 手指 preview 定位 | lift 後移到無有效 target 的區域與多個座標 | source 原位置消失；只有一份名稱；preview center 與 touch point 誤差 ≤12px；不擋 hit-test | touch trace、preview rect、錄影 |
| QA-052-R19 有效落點 presentation | 移到同父層、跨父層、empty lane | pointer preview 隱藏；只有一條 line／必要 lock frame；無第二份任務名稱、鎖定文字或 floating status | DOM count、screenshot、touch video |
| QA-052-R20 750ms／20px tolerance | 跨父層停留，手指在 20px 內自然抖動；再換 parent | 微移不重設同 parent timer；換 parent 才重設；快速放開 no-op；locked 後結果正確 | timestamp、touch path、phase trace、snapshot |
| QA-052-R21 action rail priority | 分別操作完成、新增同層、新增下層、刪除，再做 position drop | 每次只執行一個 action；刪除只開確認；action 不同時 move；position drop 不誤觸 action | 每 action before/after、command count、confirmation screenshot |
| QA-052-R22 edge auto-scroll | 長按拖曳靠近上下／左右 edge 並跨 group | 正常 scroll；line／frame 跟最新 target；無舊 target commit、無 rail/preview 重疊 | scroll trace、錄影、final observation／snapshot |
| QA-052-R23 touchcancel／中斷 | 來電／App 切換等可重現替代事件、touchcancel、visibility hidden、旋轉或返回 | session 清除、source 恢復、0 write；回來可立即重新操作，不卡在 drag mode | lifecycle trace、before/after screenshots、store/undo evidence |
| QA-052-R24 physical viewport sweep | 390x844 等效實體 portrait；支援 landscape 時另測 | action rail、line、frame、preview 均在 viewport；無水平 overflow、裁切、重疊、safe-area 問題、visible error | 每裝置 screenshot、viewport、visible-error sweep |

## 8. 5 秒理解檢查

第二觀察者不先閱讀規格，在 R03、R06、R10、R16 及 mobile R19 各回答：

1. 現在被鎖定的是哪一個父層？
2. 放開後會插在前、後，還是末端？
3. 現在若沒有線，放開是否應預期會移動？
4. 畫面上哪一個任務名稱代表正在移動的任務？

通過標準：每題 5 秒內回答正確；不得依賴鎖定文字提示。若框或線本身不足以理解，即使資料結果正確也判定 UX 未通過。

## 9. Visible Error 與 Layout Sweep

每個 viewport／device 的首個案例與最後案例都記錄：

- URL／route、日期時間、branch／SHA、viewport、pointer type。
- `.inline-error`、`[role=alert]` failure、Not Found、Internal Server Error、可見 HTTP 4xx/5xx、`/api/` error text。
- console error 與 failed network request；預期測試錯誤需另列原因。
- `document.body.scrollWidth <= window.innerWidth`。
- visible insertion line、pointer preview、placement preview、source-hidden、lock frame count。
- 非目標 card rect diff、line／frame computed color、preview／line geometry。

任一 operator 可見 runtime error 為立即 Fail；fresh reload 或 API 成功不能抹除原失敗，需保留並重驗原 surface。

## 10. Required Commands

RD 需新增並通過：

```powershell
npm.cmd run verify:dev-052-kanban-drag-subsystem-refactor
npm.cmd run verify:dev-052-kanban-drag-subsystem-refactor-browser
```

必跑既有 gate：

```powershell
npm.cmd run verify:dev-051-kanban-cross-parent-drag-lock
npm.cmd run verify:dev-051-kanban-cross-parent-drag-lock-browser
npm.cmd run verify:dev-046-universal-task-surface-drag
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-039-filter-result-parity-browser
npm.cmd run verify:dev-044-undo-coverage
npm.cmd run verify:dev-044-undo-coverage-browser
npm.cmd run verify:dev-048-task-multi-person-assignment
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

若既有 command 更名，證據中需列實際替代 command、原因與覆蓋對照；不得靜默略過。

## 11. Slice Exit Gate

| Slice | QA 最小 gate | 可否進下一 slice |
|---|---|---|
| A Characterization | baseline commands＋指定 before recording | 全通過或 expected failure 已明確記錄 |
| B Engine／session | A01、A02、A05、A06、DEV-051 static | 無 P0/P1 才可進 |
| C Target adapter | A03、A04、A10、R02、R05、R07 | desktop／mobile target 一致才可進 |
| D Presenter | A07、A11、R03、R04、R08、R16、R18、R19 | line／preview／source／spacing 全通過 |
| E Commit／legacy removal | A06、A08、A09、A12、R12～R15、R21、R23 | single commit、undo、cleanup、permission 全通過 |
| F Final QA/QC | 全 commands、R01～R24、5 秒理解 | 才可標示 QA Passed 並交 QC |

## 12. Evidence Record

每案例至少保存：

- case ID、tester、observer、日期時間。
- branch、SHA、dirty state 與 build identifier。
- route、viewport、browser／device／OS、pointer type。
- fixture source／destination ids、before／after canonical snapshot。
- session id、observation sequence、phase timestamp、commit／undo count。
- pointer／touch point、target／indicator／preview rect 與 computed color。
- screenshot 或連續錄影路徑。
- visible error／console／network sweep。
- Pass／Fail／未充分驗證、實際結果與重現步驟。

大型錄影放 `output/` 或受控 evidence storage，不直接假設應提交 Git。

## 13. Pass／Fail／Stop Ship

### Pass

- SPEC-052 architecture 與 product acceptance 全部有 traceable evidence。
- DEV-052、DEV-051 與相鄰 regression commands 全通過。
- R01～R24 全部通過；含真人 desktop、physical iOS、physical Android 與第二觀察者理解檢查。
- 30 次 mixed drag 無 stale target、double commit、overlay／timer leak 或 console error。
- 無資料遺失、重複、order drift、ancestor drift、visible error、overflow、重疊或不可操作狀態。

### Fail／Stop Ship

任一項成立即 Fail：

- preview／line／commit 不同 target。
- 同 session batch count >1，或 cancel／invalid 產生 write／undo。
- `<700ms` 跨父層提交、cycle 成立、action 與 move 雙重執行。
- source 與 preview 同時顯示、moving title >1、visible line >1、非目標 spacing 跳動或 preview 與 line超出幾何容差。
- mobile tap／pan／long-press／touchcancel／action rail regression。
- undo／redo、filter hidden order、ancestor rollup 不完整。
- 任一 critical surface 有 visible runtime error。

### 未充分驗證

- 缺 physical iOS 或 Android、真人 desktop、第二觀察者、錄影／截圖、viewport、資料 snapshot 或 visible-error sweep。
- 只有 build／lint／unit／static 通過。
- browser emulation 被誤當 physical touch。

## 14. QC Handoff 指令

QC 接手後：

1. 只讀 SPEC-052、QA-DEV-052、DEV-051 authoritative behavior 與本次 evidence index。
2. 先核對 branch／SHA／dirty boundary，再依 Slice F 重跑 commands。
3. 抽查 R02、R03、R06、R07、R12、R13、R14、R19、R21、R23、R24；不得只看 RD 錄影。
4. 在實際頁面做 visible error、viewport、DOM count、geometry 與資料 snapshot。
5. QC 不修改產品程式；失敗需回報重現、實際／預期、影響與證據，再回送 RD。
