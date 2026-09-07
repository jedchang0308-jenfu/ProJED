# QA-DEV-107：會議草稿側欄模式與排版收斂

- 關聯 DEV：DEV-107、DEV-020、DEV-092
- 相容 DEV：DEV-019、DEV-094、DEV-106
- 規格：`SPEC-020` DEV-107 Corrective Contract Amendment
- 文件狀態：`QA Executed / Targeted PASS / NOT RELEASED`
- 風險：Medium；修正使用者可見 composer 分流、主要操作與 drawer／editor scroll responsibility
- Evidence 限制：DEV-092 歷史 PASS 未覆蓋 existing meeting record 的 non-live 路徑，不可代替本計畫

## 驗證目的與邊界

確認已登入桌機／筆電使用者由正常紀錄入口開啟既有 meeting draft 時，不再看到
「會議紀錄 + 個人流程」混合畫面，且 editor、placeholder、actions 與最近紀錄不重疊。驗證同時保護
live meeting、work-log、存草稿／發布、DEV-106 local recovery與手機 meeting-negative契約。

本計畫只驗證 local candidate 的 UI、狀態分流與相鄰功能回歸；不驗證 production、remote provider、
正式資料、跨裝置、Phase 1 needs_review、deploy 或 release。

## Defect Intake Evidence

- 來源：使用者於 2026-09-07 提供的實際 localhost 畫面。
- 完整畫面：`codex-clipboard-31048244-3f10-4e36-ac06-7b71ac7eb55d.png`，`1902x960`。
- 局部畫面：`codex-clipboard-1dd3d9aa-1028-49a1-ba06-0b345a54462e.png`，`841x472`。
- 可見事實：sidebar header 為 `會議紀錄`，workflow 卻是 `個人流程／個人紀錄`；`內容`、placeholder、
  `最近紀錄`與 record cards 共用垂直區域；第二筆卡片右下出現上層 editor 的 resize handle。
- 判定：這是修復前 Fail evidence；candidate 不能以另一條新建會議路徑的成功畫面覆蓋此失敗，必須
  重驗相同 normal entry與資料狀態。

## UI Entry Contract

- Target actor：可使用紀錄功能的已登入桌機／筆電使用者；local-test角色可作本機 fixture actor。
- 正常起始畫面：看板／紀錄庫的既有可見入口，不以 direct URL 或直接呼叫 store action代替入口驗收。
- Exact fail-seeking入口：進入紀錄庫 → 在左側會議紀錄清單點擊既有草稿 → 右側 RecordSidebar
  顯示該筆草稿。
- 目標結果：sidebar variant為 `meeting-record`；header、metadata、editor與actions一致；不顯示
  work-log workflow或最近紀錄 sibling。
- 權限／資料：沿用既有可讀寫紀錄權限；本 DEV 不新增角色或權限分支。權限拒絕只作相鄰回歸，
  不修改 fixture來繞過權限。
- Evidence layer：正常導航、實際browser操作、computed style／geometry、viewport screenshot、鍵盤與
  visible／console／page error；source／build只能補充，不能代替rendered evidence。

## 代表資料與 Fixture

同一 workspace／board 至少具備：

1. 空白或短內容 meeting draft 一筆。
2. 長內容 meeting draft 一筆，內容須超過 1024x768 單一 viewport 高度。
3. published meeting record 一筆。
4. work-log draft 一筆。
5. 最近紀錄總數至少四筆，使舊重疊條件可被重現。

Fixture 只建立案例開始前資料；案例中的開啟、輸入、存草稿、發布、關閉與重新開啟結果必須由正常
UI delivery path產生。不得直接把 store改成預期完成狀態來宣告案例通過。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| existing meeting仍顯示個人流程 | workflow繼續只看`isMeetingMode` | 誤判紀錄類型與可用流程 | Exact正常入口、variant／workflow selector與截圖 | P1 | TC-107-001；meeting record不得有work-log workflow |
| 為修UI把existing record設為live meeting | store quick-fix混淆session context | 誤啟task capture／recovery／離開語意 | store state、meeting-only control與side-effect spy | P1 | TC-107-002、ROT-107-003 |
| editor仍覆蓋actions或歷史卡片 | flex item shrink、inner min-height overflow | 無法輸入或點擊錯誤物件 | rect intersection、hit target與scroll owner | P1 | TC-107-001／005／006 |
| 使用overflow hidden或z-index掩蓋 | 只處理表象 | 內容被截斷、鍵盤不可達 | 長內容、selection、scrollHeight與screenshot | P1 | TC-107-005、source negative assertion |
| 原生resize仍可把editor拉出容器 | `resize-y`無max／containment | 版面再次變成非決定性 | computed `resize`、pointer／screenshot | P1 | TC-107-006 |
| draft與recent list仍同時存在 | visibility只用CSS隱藏 | 雙主焦點、hit target衝突 | DOM count、pointer-events與a11y tree | P1 | TC-107-001／004 |
| work-log或live meeting被誤刪功能 | variant重構範圍過大 | 既有流程中斷 | 成對模式矩陣與targeted regression | P1 | TC-107-002／003、ROT-107-001／002 |
| 儲存／離開保護退步 | layout改動誤觸handler／mount lifecycle | 內容遺失 | save、close、F5、force-flush failure | P0 | TC-107-007、ROT-107-003 |
| 窄版或縮放產生雙捲動／水平溢出 | drawer與editor都成scroll owner | CTA不可達、內容遮蔽 | 1024、1440、1902、zoom與scroll metrics | P1 | TC-107-005／008 |
| build通過但畫面仍破版 | evidence layer不相符 | false PASS | final frozen-candidate browser gate | P1 | 所有required UI case；無截圖／geometry即不充分驗證 |

## 測試案例

### TC-107-001：既有會議草稿 exact regression

- 前置：`isMeetingMode=false`，紀錄庫至少四筆紀錄，其中一筆meeting draft。
- 操作：由紀錄庫可見列表點擊meeting draft。
- 預期：sidebar header為會議紀錄；composer variant=`meeting-record`；不存在`個人流程`、`個人紀錄`
  與`data-record-workflow-kind=work-log`；recent section不在DOM。
- 幾何：內容label、placeholder、editor與actions不相交；editor bottom不超過following action top + 1px。
- Evidence：1902x960 screenshot、DOM counts、rect JSON、computed style與normal-entry trace。

### TC-107-002：live meeting對照

- 前置：由既有新增／開始會議入口建立meeting draft。
- 操作：輸入短內容、操作速記焦點、查看meeting workflow與save／share controls。
- 預期：variant=`live-meeting`；既有 meeting workflow與DEV-094 focus保留；不顯示work-log workflow或
  recent section；`isMeetingMode=true`。
- Evidence：1440x900 screenshot、workflow stage／focus／store state。

### TC-107-003：work-log對照

- 前置：`isMeetingMode=false`，由既有個人工作紀錄入口建立work-log draft。
- 操作：輸入內容、存草稿、重新開啟。
- 預期：variant=`work-log`；既有個人流程、task links、save／publish契約不變；meeting-only controls不存在；
  有draft時recent section不存在。
- Evidence：1440x900 screenshot、workflow kind、保存readback。

### TC-107-004：empty與recent list

- 前置：RecordSidebar開啟且`draft=null`、`isMeetingMode=false`。
- 操作：以pointer與鍵盤選取一筆最近紀錄。
- 預期：variant=`empty`；recent section只出現一次；record item可被開啟；開啟後recent section從DOM移除，
  不以opacity／pointer-events藏匿。
- Evidence：DOM count、keyboard focus、before／after screenshot。

### TC-107-005：長內容與唯一scroll owner

- 前置：meeting draft內容超過viewport高度。
- 操作：在1902x960、1440x900、1024x768捲到內容末端及actions，再回到頂端。
- 預期：drawer body是唯一垂直scroll owner；editor內容不被截斷、沒有巢狀滾動陷阱；actions可達；
  document與drawer無水平overflow。
- Evidence：scrollHeight／clientHeight／overflow style、rect、三viewport screenshot。

### TC-107-006：editor containment與resize負向

- 前置：meeting-record與work-log各一筆。
- 操作：檢查computed style與右下角，嘗試由原resize handle位置拖曳。
- 預期：computed `resize=none`，不存在原生resize affordance；meeting editor min-height >=220px，work-log
  >=150px；拖曳不改變editor外框高度或覆蓋兄弟區塊。
- Evidence：computed style、before／after rect與screenshot。

### TC-107-007：保存、發布與失敗恢復

- 前置：existing meeting draft已輸入未保存內容。
- 操作：存草稿、發布；另注入save failure、force-flush failure／timeout，再執行關閉；取消discard。
- 預期：成功結果與DEV-094／106一致；失敗時留在原畫面並保留content、cursor／selection與task links；
  不因layout remount清除recovery或baseline。
- Evidence：UI狀態、store／service spy、readback、failure trace與screenshot。

### TC-107-008：viewport、zoom與鍵盤

- Viewport：1902x960、1440x900、1024x768；另以200% zoom或等效CSS pixel條件檢查桌面窄化。
- 操作：Tab／Shift+Tab巡覽header、metadata、editor與actions；按Escape依既有guard返回。
- 預期：焦點順序與視覺順序一致、focus ring可見、控制具accessible name；無重疊、裁切、水平overflow、
  被固定區吃掉的CTA或鍵盤焦點陷阱。
- Evidence：focus sequence、accessibility snapshot／names、screenshot與scroll metrics。

### TC-107-009：390 mobile-negative

- 前置：390x844。
- 操作：由既有可見導航檢查會議紀錄入口／surface。
- 預期：依SPEC-069／DEV-106維持meeting UI不存在；本DEV不得為修桌面版面而解禁手機meeting。
- Evidence：negative DOM count、screenshot、document overflow與error sweep。

### TC-107-010：visible error與資料健全性

- 前置：使用代表fixture；預期至少四筆紀錄。
- 操作：每個required viewport hard reload後執行主要案例。
- 預期：非預期`.inline-error`、`[role=alert]`、load failed、HTTP 4xx/5xx、console error、page error均為0；
  紀錄數與fixture一致，不得以全零或空清單冒充排版通過。
- Evidence：network／console／page error log與data count。

## Targeted Regression

- `ROT-107-001`：DEV-092 header、metadata同列、compact controls與quietness維持。
- `ROT-107-002`：DEV-094 live meeting autofocus、existing／recovery不搶焦點、import control與publish-only
  cutoff維持。
- `ROT-107-003`：DEV-106開新／開舊、一般離開force-flush、F5 recovery、discard取消／失敗與0 remote
  recovery request維持。
- `ROT-107-004`：DEV-020 work-log workflow、task links、save／publish與project-change import維持。

## Source／Static Contract

新增`verify:dev-107-record-sidebar-layout`至少檢查：

- 存在單一composer variant resolver／derived authority及`data-record-composer-variant`。
- live meeting、meeting record、work-log、empty的render條件不各自重做衝突判斷。
- `WorkLogWorkflowCard`只可出現在work-log variant。
- recent section只可出現在empty variant，且具穩定`data-record-recent-records` selector。
- `RecordContentEditor`不存在`resize-y`，meeting min-height依record type決定。
- 禁止以`overflow-hidden`、absolute overlay或新增z-index修補editor／recent section交界。

Static verifier只能證明source contract，不可單獨判定UI通過。

## QC 執行順序與命令

1. RD完成WP-107-A～D及targeted自我驗證後freeze candidate。
2. QA確認fixture、source revision、dirty boundary與required case無漂移。
3. QC不修改產品，執行DEV-107 cases與相鄰regression，最後一次收集rendered evidence。

```powershell
npm.cmd run verify:dev-107-record-sidebar-layout
npm.cmd run verify:dev-107-record-sidebar-layout-browser
npm.cmd run verify:dev-092-record-sidebar-quietness
npm.cmd run verify:dev-094-meeting-direct-note
npm.cmd run verify:dev-094-meeting-direct-note-pure
npm.cmd run verify:dev-106-meeting-local-safety
npm exec tsc -- --noEmit
npm.cmd run build:test
```

另執行targeted ESLint與`git diff --check`。Browser verifier輸出至少包含：source revision／dirty boundary、
browser版本、base URL、role、fixture count、variant matrix、rect／scroll metrics、focus sequence、error counts、
各viewport screenshot path與總結JSON。

若需啟動臨時runtime，先記錄project、purpose、port、owning process tree與cleanup condition；優先安全重用
同專案既有localhost:4000。任務完成前只停止本任務建立的process tree並確認port釋放，不得終止未知runtime。

## Pass／Fail／Stop

- Pass：TC-107-001～010與ROT-107-001～004在同一frozen candidate均通過，且rendered evidence支持
  無混合流程、無重疊、單一scroll owner與保存／恢復不回歸。
- Fail：任一必要案例仍有混合標籤、DOM雙表面、rect相交、resize handle、不可達CTA、visible error、
  資料異常、save／recovery退步或證據互相矛盾。
- 未充分驗證：缺exact normal-entry、viewport、geometry、keyboard、representative data或final screenshot。
- Stop並回PM：需要改store schema／provider／remote data；需把existing record設成live meeting；需以裁切、
  z-index或固定超大高度掩蓋；或無法維持DEV-094／106 invariant。

## 變更紀錄

- 2026-09-07：依使用者實際破版畫面建立QA計畫；補足DEV-092未涵蓋的existing meeting non-live路徑，
  狀態為`QA Plan Ready / NOT RUN`，未預填任何PASS或QC結論。
- 2026-09-07：DEV-107 local corrective slice完成；source 20/20、browser 5/5及DEV-020／092／094／106
  targeted regression均通過，更新為`QA Executed / Targeted PASS / NOT RELEASED`。完整release matrix仍須
  於frozen candidate依release gate重跑。
