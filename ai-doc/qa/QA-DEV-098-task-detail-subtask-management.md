# QA-DEV-098：任務明細子任務管理區驗證計畫

- 關聯 DEV：DEV-098
- 依據 SPEC：`ai-doc/specs/SPEC-098-task-detail-subtask-management.md`
- 文件狀態：`QA Executed / DEV-098 Core PASS / Independent QC PASS / Adjacent Regression Audit PASS / Persistence Release Regression Pending DEV-099`
- 風險等級：Medium
- 日期：2026-09-01

## 1. 驗證目標與宣告邊界

驗證任務明細內的子任務區確實共用看板 L3+ 任務列、互動命令與 authoritative placement
transaction；同時證明 Details 擁有獨立 drag scope、同 modal 導覽不遺失草稿、overlay／Escape／focus
不互相踩踏，且 primary／tracking／角色權限語意不被改寫。

Drag scope 定義：明細內子任務 row／recursive tree 與目前任務直屬 root drop zone 在 scope 內；modal
外框、metadata、遮罩後方 Board／Workbench 與其他 view 均不得命中。這個邊界不妨礙 row／tree 共用，
因為共用的是 neutral renderer 與既有 placement contract，DnD host 仍由各 surface 各自持有。

本計畫定義完整驗證與交付邊界；本輪已執行 S／P／B 全矩陣 local automated evidence。
Local automated QA PASS 不等於 QC、實機或 Release PASS。
實機 touch／IME 若由 release owner 判定為必要，依第 13 節另開 supplemental evidence，不阻塞本地
`RD Implementation Ready` 或 local automated QA。

## 2. 驗證分層與成功門檻

| 層級 | 案例 | 目的 | 必要證據 |
|---|---:|---|---|
| L0 Static／source | S01～S08 | 防 duplicate renderer／commit、錯誤 host ownership與規格擴張 | assertion結果＋命中檔案 |
| L1 Pure／component | P01～P10 | projection、navigation、save continuation、permission與 failure postcondition | before／after structured result |
| L2 Normal UI browser | B01～B16 | 真實 render、pointer／keyboard／touch、overlay、RWD與 visible errors | result JSON＋代表截圖／trace |
| Regression | 指定既有 gates | 保護既有跨模式、drag、interaction、transaction與 dirty owner | fresh command result |

DEV-098 核心 QA exit 必須是 S01～S08、P01～P10、B01～B16 全部 PASS；指定 regression 另採
獨立 fresh audit，任何 `NOT_RUN`、`BLOCKED`、人工推測或 source-only assertion不得計入 PASS 分母。

## 3. Fixtures

### 3.1 Actor／placement

- Owner：可讀、編輯、建立、拖曳 primary／tracking placement。
- Editor：可編輯與拖曳，但不擁有 owner-only action。
- Viewer：唯讀，不顯示 mutation CTA或可執行 drag source。
- Revoked：畫面開啟後撤回 target capability，用於驗證 fail closed。
- Primary root `P0`：直屬 `P1`、`P2`、`P3`；`P1` 下有 `P1A`。
- Tracking root `T0`：explicit child references `T1`、`T2`；canonical descendant未建立 reference，必須不可見。
- Faults：save reject、placement reject、stale／missing target、permission revoke。

### 3.2 Entry／viewport／input

- Entry：List、Board、Gantt、Calendar、Mind Map 的既有 details入口。
- Viewport：1440×900、1024×768、390×844、320×844。
- Input：desktop pointer、keyboard、synthetic touch。
- 每次 drag 記錄 source／target `taskId + placementId + placementKind`、before／after parent與order、
  commit outcome、console／pageerror／visible error。

## 4. 主要風險與失敗優先序

| 風險 | 最可能原因 | Gate | 等級 |
|---|---|---|---|
| Board／Details 形成兩套 row或 commit | 直接複製 private `ChecklistItem` | S01～S03、B01 | P0 Stop |
| modal drag命中背景看板 | scope containment缺失／Dnd host提升錯誤 | S03～S04、P04～P06、B09～B11 | P0 Stop |
| 導航遺失父任務草稿 | 直接替換 node ID／兩套 save refs | S05～S06、P07～P09、B03～B06 | P0 Stop |
| tracking洩漏或越權 mutation | task／placement identity混用 | P01、P10、B15 | P0 Stop |
| placement failure假成功／丟 subtree | Details另寫 optimistic reorder | S03、P06、B11 | P0 Stop |
| menu／preview被 modal遮住或 Escape關兩層 | layer與 owner不明 | S07、B07～B08 | P1 Stop |
| 手機短滑誤開／誤拖 | 未保留 pan-first guard | B13～B14 | P1 Stop |
| 雙層捲軸／320px overflow | section另建 scroll shell | B16 | P1 Stop |

## 5. L0 Static／source contract cases

| ID | Assertion |
|---|---|
| S01 | Board與Details都 import同一 `TaskChecklistTree`／row；repo只有一份 title／date／tag／action row renderer。 |
| S02 | neutral row不 import `BoardView`／`KanbanDependencyContext`／record store；Board adapter注入 dependency、record與filter差異。 |
| S03 | Details沒有 `parentId`／`order` direct mutation或第二個 commit；desktop／mobile都到既有 `taskDragCommit` authority。 |
| S04 | Details擁有local `DndContext`／mobile session；generic scope ref拒絕 modal外 target，Board caller保留原 scope。 |
| S05 | `useTaskDetailsNavigation`只有一個 stack owner；DOM中只 render一個 `TaskDetailsModal`，entry不保存 `HTMLElement`。 |
| S06 | close／push／back／create共用同一 pending transition與 persistence primitive；歷史DEV-098 verifier只證明callback-only baseline。整合DEV-099後，必須改驗accepted／not-accepted terminal settlement與unknown owner，且不可存在callbackless accepted path。 |
| S07 | details-open menu與drag presenter高於 modal；Escape／outside-click owner是明確 state，不以不完整 DOM selector猜測。 |
| S08 | 無 schema／migration／provider／RLS改動；DEV-098 verifier與 package scripts存在，planned file impact未越界。 |

## 6. L1 Pure／component cases

| ID | Case／postcondition |
|---|---|
| P01 | primary投影 canonical children＋explicit tracking children；tracking root只投影 explicit references，直屬 count正確。 |
| P02 | cycle、archived、missing與重複 placement被排除；排序以既有 stable order／placementId決定。 |
| P03 | collapse只改 local render state；navigate／back／reopen重新預設展開，不寫 store／provider。 |
| P04 | visible before／after、append-child、root append normalize成既有 intent，identity完整。 |
| P05 | self、descendant、primary-under-reference、scope外、missing與permission-denied回傳 reject且零寫入。 |
| P06 | placement reject／unknown沿用 SPEC-089：source parent／order／subtree不變、無 duplicate／cycle／success。 |
| P07 | root open、child push、back pop、close clear stack；同時只能有一個 typed pending transition。 |
| P08 | dirty draft先 queue；pending未歸零不 transition；成功且 source task/version仍一致才執行一次。 |
| P09 | save reject保留 draft、current entry與Retry並清該次 transition；舊 callback不得污染新 task。 |
| P10 | owner／editor／viewer／revoked與 primary／tracking action matrix完全由既有 capability guard決定。 |

## 7. L2 Normal UI browser cases

| ID | Scenario | 必要結果 |
|---|---|---|
| B01 | Board與Details開同一 L3+ fixture | row文字、date／tag、右鍵 action、primary／tracking frame一致；source evidence指向同一 component。 |
| B02 | P0、empty primary、empty tracking、viewer | section位於notes後／history前、首次展開、count正確；primary只有一個合法CTA，tracking／viewer無誤導mutation。 |
| B03 | child pointer／Enter開啟，再Back／Close | 同一 modal push／pop；Back回觸發 row，Close回外部 origin；modal數量恆為1。 |
| B04 | 修改title／notes後立即開child，save success延遲 | 保存完成前不切換；成功後切換一次，父任務重開值正確。 |
| B05 | 修改後開child，save reject | 停留父任務、draft仍在、顯示Retry；不得切換、清空或宣稱成功。 |
| B06 | save pending期間快速要求P1／P2／Back | 只保留第一個合法 pending transition，其餘no-op；無 stale entry或callback污染。 |
| B07 | child右鍵／Shift+F10與各合法action | 使用同一catalog與guard；menu完整顯示在modal上方，action後modal依既有契約保留。 |
| B08 | active drag→menu→modal依序按Escape／outside click | 一次只關一層；preview、selection、focus與body flag清乾淨。 |
| B09 | desktop pointer同層排序、append-child、root append | indicator與commit正確；before／after parent+order符合readback。 |
| B10 | 拖向self／descendant／背景Board／Workbench | 全部reject、背景零命中、零寫入、無殘留indicator或success。 |
| B11 | placement provider reject／outcome unknown | source subtree仍在原位；近端錯誤可恢復；details navigation不掩蓋pending transaction。 |
| B12 | KeyboardSensor Space／方向鍵／Escape／提交 | 只走可見合法target；live-region有結果；Escape只取消drag。 |
| B13 | 390px短tap、短滑、長按、edge auto-scroll | tap開details、短滑只捲modal、長按才drag；背景Board不捲動。 |
| B14 | 320px long-press、cancel／touchcancel、collapse／Back中止 | preview／rail不裁切；所有transient、timer與body flag清除。 |
| B15 | tracking actor matrix＋開啟後revoke capability | explicit children可見、canonical-only descendant不可見；越權CTA／drag／menu action為0。 |
| B16 | 4 viewports＋5種entry的layout／error sweep | 單一主縱向scroll、水平overflow=0、無nested card shell；正常fixture console／pageerror／visible error=0。 |

## 8. Targeted regression gates

只重跑被 DEV-098 實際碰到的契約；不要求全庫測試取代針對性證據：

```text
npm run verify:dev-028-cross-mode-task-interactions-browser
npm run verify:dev-046-universal-task-surface-drag-browser
npm run verify:dev-053-task-drag-muscle-memory-consistency-browser
npm run verify:dev-054-mobile-task-drag-precision-browser
npm run verify:dev-055-desktop-task-drag-target-clarity-browser
npm run verify:dev-070-interaction-kernel
npm run verify:dev-089-task-placement-transaction
npm run verify:dev-089-task-placement-failure-browser
npm run verify:dev-095-task-tracking-interaction-parity
npm run verify:dev-095-task-tracking-interaction-parity-browser
npm run verify:dev-097-pwa-safe-reload-browser
npx tsc --noEmit
npm run build:test
```

若變更未觸及某既有 verifier的適用面，QA可在 result JSON以 reason標為 `NOT_APPLICABLE`；它不算 PASS，
也不影響 DEV-098 自身 S／P／B 分母。

### 8.1 DEV-099 persistence compatibility gate（新增／尚未執行）

2026-09-02 production事件後，DEV-098既有S／P／B結果只保留為子任務surface與callback-only navigation
歷史baseline；不得用來宣稱SPEC-099 persistence contract已通過。任何DEV-099整合候選必須另外執行：

- QA-DEV-099 R01～R06 root-cause gate；
- accepted／not-accepted terminal contract與deadline／unknown／readback cases；
- 本文件P08～P09、B04～B06在同一候選上的相容性重跑；
- DEV-097 task-details dirty／reload-safety regression。

上述新增Gate不回頭改寫歷史22/22、10/10、16/16分母，也不預填PASS；目前狀態為 `NOT RUN`。

### 8.2 Fresh regression audit（Tech Lead review）

本輪已依 affected cases 完成修正後重跑；相鄰 regression 現在全數通過，未使用 waiver：

| Gate | Fresh result | Evidence |
|---|---|---|
| DEV-046 static／browser | PASS（32/32；5/5 operation cases） | shared `TaskChecklistTree` contract、desktop/mobile surface、cross-column move |
| DEV-053 static／browser | PASS（31/31；10/10，diagnostics/network 0） | shared gesture policy、placed-row guard、viewport/cancel matrix |
| DEV-055 static／browser | PASS（34/34；18/18） | cross-column、mixed ten-drag、L3+ stability、tail-gap、expanded-card boundary |
| DEV-095 interaction parity | PASS（4/4） | shared placement/tree/controller contract |

DEV-046／053 靜態 verifier 已由舊 private-row 命名對齊目前 `TaskPlacementTree`／`TaskChecklistTree` 架構；
這是 verifier contract maintenance，不是降低測試要求。DEV-055 的產品修正包含 pointer-derived edge
在 commit 端重驗證、expanded-card title 的近端 boundary、column/card surface ownership 與 transient
indicator settle。完整摘要見 `output/qa/dev-098/adjacent-audit-final-20260902.json`。

歷史 clean baseline 仍保留於 `output/qa/dev-098/baseline-audit.json`，只用來說明原始 finding 的
pre-existing disposition，不覆寫本輪修正後 PASS。DEV-099 persistence compatibility、實機 supplemental、
deployment 與 release 仍未執行，故本 DEV 維持 Not Released。

## 9. Executed commands與 artifacts

以下為本輪已執行的 DEV-098 核心命令；未出現在結果中的案例不得宣稱 PASS：

```text
npm run verify:dev-098-task-detail-subtasks
npm run verify:dev-098-task-detail-subtasks-pure
npm run verify:dev-098-task-detail-subtasks-browser
```

| Artifact | 必填內容 |
|---|---|
| `output/qa/dev-098/result.json` | revision、S01～S08、pass/fail、assertion details。 |
| `output/qa/dev-098/pure-result.json` | revision、P01～P10、pass/fail/not-run、pure/component assertion details。 |
| `output/playwright/dev-098/result.json` | B01～B16、actor、entry、viewport、input、identity、save／commit result、errors。 |
| `output/playwright/dev-098/screenshots/` | B02、B05、B07、B09、B10、B13、B15、B16代表畫面。 |
| `output/qa/dev-098/runtime-cleanup.json` | project、purpose、port、owning process tree、cleanup condition、port released。 |
| `output/qa/dev-098/runtime-cleanup-final-20260902.json` | 本輪 task-owned Vite 4011 的 process tree、停止時間與 portReleased=true。 |
| `output/qc/dev-098/task-detail-subtasks-qc-result.json` | QC-098-01～10、source／artifact SHA-256、working-tree boundary與remote／regression disposition。 |
| `output/qa/dev-098/adjacent-audit-20260902.json` | 原始 fresh dependency-optimized runtime 與 historical findings。 |
| `output/qa/dev-098/adjacent-audit-followup-20260902.json` | 歷史 follow-up 與 DEV-055 B10／DEV-095 evidence。 |
| `output/qa/dev-098/adjacent-audit-final-20260902.json` | 修正後 DEV-046／053／055／095 的 fresh regression 結果與 waiver disposition。 |

本輪已執行證據：`verify-dev-098-task-detail-subtasks` S00～S08 22/22 PASS；`verify-dev-098-task-detail-subtasks-pure`
P01～P10 10/10 PASS；browser B01～B16 16/16 PASS、diagnostics 0，結果位於
`output/playwright/dev-098/result.json`，並保存 `B16-layout-error-sweep.png`。另有
`npx tsc --noEmit`、`npm run build:test`、DEV-046／053／055／095 static與 browser regression PASS。
DEV-098 核心 local automated QA 已完成；獨立 read-only QC 已以 QC-098-01～10 全數通過確認。
相鄰 regression audit 已以 final artifact 完成；不能把 local evidence 擴大宣稱為 release。

Runtime 證據：`output/qa/dev-098/runtime-cleanup-final-20260902.json` 記錄本輪 task-owned Vite
`127.0.0.1:4011` 的 shell／Vite／esbuild process tree；完成 browser verification 後僅停止該 tree，
並確認 port 4011 已釋放。既有 primary `localhost:4000` 未停止、未受本輪影響。

暫時 runtime開始前先記錄 ownership；完成前只停止本任務確認過的 process tree並確認port釋放，
不得停止其他任務或所有 `node.exe`。

## 10. AC traceability

| AC | Cases |
|---|---|
| AC-098-001 | P01、P03、B02、B16 |
| AC-098-002 | S01～S03、B01、DEV-095 regression |
| AC-098-003 | S04、P04～P05、B09～B14 |
| AC-098-004 | P05～P06、B10～B11、B15 |
| AC-098-005 | S05、P07、B03、B06 |
| AC-098-006 | S06、P08～P09、B04～B06、DEV-097 regression |
| AC-098-007 | S07、B07～B08、B14 |
| AC-098-008 | P01、P10、B02、B15 |
| AC-098-009 | P03、P10、B02 |
| AC-098-010 | S03、P04～P06、B09～B11、DEV-089 regression |
| AC-098-011 | B13～B16 |
| AC-098-012 | B01、B16、全部 targeted regressions |

## 11. QA exit／QC handoff

- S01～S08、P01～P10、B01～B16有 fresh machine-readable結果；mandatory regression 亦已重跑並全數 PASS。
- DEV-098 scope內 P0／P1 open finding為0；任何資料遺失、越權、背景命中、duplicate renderer／commit、假成功直接Fail。
  相鄰 regression 的 PASS 亦不代表 remote 或 release gate 已執行。
- 正常fixture console error、pageerror、visible product error為0；預期 fault必須由case ID與error code區分。
- QA exit：`DEV-098 Core Local Automated QA PASS / Independent QC PASS / Adjacent Regression Audit PASS`。
  獨立 QC 已 read back core artifacts、source boundary、runtime cleanup 與 final adjacent disposition；無 waiver。
- Persistence release gate：`Pending DEV-099 / NOT RUN`；既有QA/QC不證明永久saving根因或新terminal契約。
- commit、merge、push、deploy與release不在本計畫授權內。

## 12. Stop conditions

- Details存在duplicate row／action／commit，或為共用而提升global Board `DndContext`。
- dirty／saving／failed仍可切換 task，或舊callback可更新新 entry。
- unknown仍可切換task、accepted operation可無terminal結案，或DEV-099 compatibility gate未跑卻宣稱release ready。
- background surface可命中、placement failure後source消失或出現duplicate／cycle／success。
- tracking descendants、menu action或drag capability越權。
- overlay被裁切、Escape一次關兩層、focus落body、touchcancel留下transient。
- 任何必要viewport有水平overflow、雙層scroll或short pan誤drag。
- verifier只看source／build而沒有normal UI evidence，或把plan／NOT_RUN寫成PASS。

## 13. Future Release Supplement Capsule

若 release owner要求實機補充，只新增小型 release addendum：iOS Safari與Android Chrome各驗證一次
短滑scroll、長按drag、native context menu抑制、safe area、touchcancel與soft-keyboard後的focus／overflow。
裝置、OS、browser、錄影與結果必須明列；未執行時標 `Not Verified`，不得回頭膨脹本地 DEV-098
自動化分母或阻塞目前文件派工。

## 14. 變更紀錄

- 2026-09-01：建立 RD Implementation Ready QA plan，尚未執行。
- 2026-09-01：依 RD 技術主管 review瘦身。移除沒有 save provider契約支撐的 timeout／unknown案例，
  將原11／15／32案例與完整實機試驗矩陣收斂為8／10／16案例及 future release capsule；保留
  duplicate renderer、background target、save failure、permission、mobile gesture、overlay與placement failure硬Gate。
- 2026-09-01：DEV-098 local implementation 完成；S00～S08 22/22、P01～P10 10/10、B01～B16 16/16、
  diagnostics 0，並通過 TypeScript、build:test、DEV-002、DEV-028與 core regression static。狀態改為
  `Local Automated QA PASS / Independent QC Pending`；獨立 QC、實機與 release 仍為後續 gate。
- 2026-09-01：依 RD 技術主管 fresh regression audit 重跑 DEV-028／046／053／054／055／070／089／095／097。
  DEV-098 核心 S／P／B 仍為 22/22、10/10、16/16；DEV-046-D02、DEV-053-B13/B14與 DEV-055 多個
  desktop placement／menu／indicator案例失敗，文件改標 `Adjacent Regression Audit Blocked`，保留原始輸出，
  不將未歸因的相鄰失敗誤算為 DEV-098 PASS。
- 2026-09-01：補明 drag scope與共用邊界：只有 modal 內子任務 host／root drop zone可命中；modal 外框、
  metadata與背景 view拒絕，row／tree仍由 shared neutral renderer提供。
- 2026-09-01：以乾淨 baseline HEAD `13888b2` 隔離重跑相鄰失敗；DEV-046-D02、DEV-053-B14與 DEV-055
  失敗可重現，DEV-053-B13未重現但仍保留 current-run instability。新增 `baseline-audit.json`，將
  pre-existing evidence與 DEV-098 本身結果分開，避免錯誤歸因或假性 regression PASS。
- 2026-09-01：DEV-095 source contract verifier 改為直接檢查 `TaskChecklistTree` 的 shared row／tree，
  移除 `KanbanChecklist` 的舊文字相容標記，避免以註解維持靜態 gate 假象。
- 2026-09-01：執行 `verify:dev-098-task-detail-subtasks-qc`；QC-098-01～10 10/10 PASS，
  直接 readback 核心 artifacts、source、scope、navigation、failure recovery與 baseline disposition。
  文件狀態補為 `Independent QC PASS`，相鄰 regression blocker與未 Release 邊界維持不變。
- 2026-09-02：以全新 task-owned Vite `127.0.0.1:4011` 強制重新 optimize dependencies 後，
  fresh rerun重現 DEV-046-D02、DEV-053-B13/B14與 DEV-055 原列失敗；排除既有 504 blank-page runtime
  假象，新增 `output/qa/dev-098/adjacent-audit-20260902.json`，並確認 port 4011 已釋放。
- 2026-09-02：同一 fresh task-owned runtime 重跑 DEV-098 core browser B01～B16 16/16、diagnostics 0，
  source gate 22/22、pure P01～P10 10/10、TypeScript與獨立 QC-098-01～10 10/10 均通過；DEV-046-D02
  的最小資料集歸因檢查未形成穩定產品修正，故不以猜測性變更或未授權 waiver 清除相鄰 blocker。
- 2026-09-02：修正相鄰 DEV-095／共用 `TaskActionMenu` 的 B10 menu-order regression，並重跑
  QA-055-B10（PASS）、DEV-095 B17～B24（8/8 PASS）與 DEV-055 static（34/34 PASS）；完整 DEV-055
  browser 仍為 9/18 PASS、9/18 FAIL，剩餘 placement／indicator／fixture-gap findings 仍待相鄰 owner
  修正或正式 waiver，不改變 DEV-098 未 Release 邊界。
- 2026-09-02：依CAPA技術主管審查加入DEV-099 persistence compatibility gate；S06不再以「沒有timeout／unknown」
  作現行release acceptance。歷史DEV-098核心PASS保留，但SPEC-099 root-cause／terminal／readback與P08～P09、
  B04～B06整合重跑均為NOT RUN，故加註 `Persistence Release Regression Pending DEV-099`。
- 2026-09-02：完成相鄰 affected-case 修正與 fresh rerun：DEV-046 static/browser 32/32＋5/5、DEV-053
  31/31＋10/10、DEV-055 34/34＋18/18、DEV-095 4/4 均 PASS；未使用 waiver。TypeScript、build:test、
  DEV-098 QC-098-01～10（10/10）亦通過；task-owned port 4011 已停止並確認釋放。
