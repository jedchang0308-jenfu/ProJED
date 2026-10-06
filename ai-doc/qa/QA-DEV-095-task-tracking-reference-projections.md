# QA-DEV-095 任務追蹤副本與跨看板多重投影驗證計畫

狀態：Local Automated QA PASS／RD Implementation Ready／S07～S10 4/4 PASS／B17～B24 8/8 PASS／L2.5 DB Baseline PASS／L3 Supabase TEST Not Run／未 Release

日期：2026-08-29

對應：DEV-095、SPEC-095、ADR-046

## 1. 驗證目標與宣告邊界

驗證單一 canonical task在同 Workspace多個 Board／parent placements中仍保持：唯一內容、唯一 primary roll-up、atomic reference mutation、動態read grant/revoke、mutation不擴權、跨模式一致與失敗可恢復。

本文件同時保存計畫與本地執行事實，不是 release PASS 證據。既有L1 model、B01～B16、isolated PostgreSQL、backup與I01～I12繼續支持identity／placement／DB baseline；最新frozen candidate已移除duplicate reference renderer，完成S07～S10 4/4、B17～B24 8/8與獨立QC-IP01～08 8/8。新browser evidence直接覆蓋同一details/action binding、三種gesture、390／320 short-tap／scroll negative與long-press commit、List／Kanban／Checklist visual parity、兩層tracking subtree、capability revoke、stale revision與provider failure。Supabase TEST、L3 remote QC與release gate仍為`NOT RUN`。

使用思考習慣：#風險 #反向思考 #多層次分析。先找「看得到卻不該改、移除後仍看得到、拖曳只成功一半、統計被放大」等反例。

## 2. Test levels 與必要環境

| Level | 環境 | 必驗內容 | 可否取代下一層 |
|---|---|---|---|
| L1 Source／pure model | Node／TypeScript | identity、projection、roll-up、filter、cycle、error mapping | 否 |
| L2 local-test browser | task-owned local runtime | 正常UI、桌機／手機、DnD、undo、failure shell、provider gate | 否 |
| L2.5 isolated PostgreSQL | task-owned disposable DB | migration、constraints、RPC、RLS、concurrency、EXPLAIN | 否 |
| L3 Supabase TEST | authenticated two-user | 真實RLS、PostgREST、Realtime、reload、future member、provider readiness | 否 |
| L4 release gate | production artifact／approved environment | migration history、backup、same artifact、smoke、rollback readiness | 不在本文件授權範圍 |

任何 temporary app／DB／browser runtime必須記錄project、purpose、port、process tree與cleanup condition；完成本輪後只停止task-owned runtime並確認port釋放。

## 3. Fixtures

### 3.1 Workspace／Board／role

- Workspace W1：Board A（研發）、Board B（主管）、Board C（相關任務）。
- Workspace W2：Board X，供cross-workspace拒絕。
- U1：W1 admin；A/B/C owner或admin，具有manage/edit。
- U2：A member、B viewer；用來驗證source可edit、target只read的交叉組合。
- U3：只屬B viewer，reference建立前不可讀Task A；建立後可讀但不可edit。
- U4：reference建立後才加入B的future member/viewer。
- U5：只屬C member，供其他reference/direct path保留。
- U6：W2 member，供tenant isolation。

### 3.2 Task tree

```text
Board A primary tree
P0 primary group
├─ T1 primary task（todo，notes/tags/assignees/dates）
│  └─ T2 primary task（in_progress）
└─ T3 primary task（completed）

Board B
M0 primary group

Board C
R0 primary group
```

Dependencies：T1 → T3；另建立U3不可讀的hidden H1，edge T1 → H1。Records：T1連一筆project record與一筆private record。T1有可辨識detail note、tag與assignee。建立前保存 task/dependency/record hashes與各 Board roll-up/count baseline。

## 4. FMEA／風險優先序

| ID | Failure mode | 影響 | Gate |
|---|---|---|---|
| F1 | taskId當placementId，第二投影覆寫第一投影 | 資料／畫面消失 | P0 |
| F2 | derived reader可UPDATE canonical task | 權限提升 | P0 |
| F3 | last reference移除後仍可讀 | 持續資料外洩 | P0 |
| F4 | move一半成功或source先刪 | reference消失／重複 | P0 |
| F5 | tracking edge參與roll-up／count | 管理數據失真 | P0 |
| F6 | reference建立dependency | 排程語意污染 | P0 |
| F7 | migration orphan／cycle／非一task一primary | 全域拓樸破壞 | P0 |
| F8 | hidden linked task／record／audit被reference洩漏 | 關聯資料外洩 | P0 |
| F9 | Realtime漏task delete/archive | stale ghost copy | P1 |
| F10 | concurrent duplicate/move產生兩個active scope | 拓樸歧義 | P1 |
| F11 | old client或feature-off無法操作primary | rollout回歸 | P1 |
| F12 | Firebase寫client-only ghost | provider資料分裂 | P1 |
| F13 | Gantt/Calendar重複事件 | 時間視圖失真 | P1 |
| F14 | mobile/keyboard無法移除或取消drag | 可用性／A11y | P1 |
| F15 | RLS helper無index／逐列auth helper | 大Board效能退化 | P1 |
| F16 | reference複製primary JSX，欄位或樣式後續漂移 | 雙邊維護／顯示不一致 | P1 |
| F17 | reference繞過interaction binding，只支援部分click/context行為 | 使用者操作不一致／模式失效 | P0 |
| F18 | primary/reference使用不同DnD sensors、collision或focus recovery | 桌機可拖但鍵盤／手機失敗 | P0 |
| F19 | reference使用獨立child renderer或只顯示平面項目 | 子任務不能展開、拖曳或原子移動 | P0 |

## 5. L1 source／model cases

### 5.1 Static contract

- S01：`TaskPlacementId`／`TaskId`型別、`TaskProjectionNode`與stable error union存在。
- S02：catalog含`task.create-tracking-reference`與`task.remove-tracking-reference`；label固定。
- S03：reference drag payload含taskId、placementId、placementKind；primary/reference command path為discriminated union。
- S04：Board tree key／parent／drop anchor使用placementId；dependency／record link／details使用taskId。
- S05：Firebase adapter explicit unsupported，UI guard不落local ghost。
- S06：任何新增visible copy皆無tracking status／manager status／reference-local task content欄位。
- S07：List／Kanban／Checklist的primary與tracking引用同一pure surface view；source scan不得存在`TrackingReferenceListContent`／`TrackingReferenceCardContent`或等價duplicate task-content renderer。
- S08：primary／tracking都建立`TaskPlacementInteractionContext`並呼叫同一interaction binding／action catalog；reference component不得直接呼叫details utility。
- S09：primary／tracking共用gesture controller、pointer／keyboard／mobile sensors、collision與insertion marker；placement kind只在commit command分流。
- S10：primary／tracking共用recursive `TaskPlacementTree`／child surface；reference adapter不得自行維護child JSX、SortableContext或remove-only action layer。

### 5.2 Property／algorithm

- M01：隨機1,000組task＋placements，projection join不丟task、不覆寫placements。
- M02：隨機references數量／父層，primary roll-up與reference-free baseline bit-for-bit相同。
- M03：Board count對taskId distinct；同task同Board多parent仍只計一次。
- M04：filter每task只evaluate一次，所有placements同match；context ancestor不進matched count。
- M05：placement cycle、self-task ancestor、primary-under-reference全部拒絕。
- M06：archive canonical ancestor後所有descendant references effective hidden；restore恢復原placement。
- M07：Gantt／Calendar collapse具決定性：primary優先，否則最小order＋placementId。
- M08：reference create/move/remove前後dependency canonical serialization hash相同。

預計指令：

```text
npm run verify:dev-095-static
npm run verify:dev-095-placement-model
npm run verify:dev-095-projection-property
```

scripts不存在前不得填PASS。

## 6. L2.5 migration／DB／RLS cases

### 6.1 Migration／schema

- DB01：fresh reset可依timestamp完整apply；table、FK、check、partial unique、FK-supporting indexes、grants、RLS、publication存在。
- DB02：existing fixture backfill後，每個`wbs_items`含archived恰一active primary；task/project/parent/order/stage readback相等。
- DB03：orphan、cross-board parent、cycle或zero UUID反例使migration整筆rollback，無半套table/data。
- DB04：old-client insert/update合法primary後compatibility trigger同步；tracking row不回寫`wbs_items` mirror。
- DB05：feature-off query只見primary且現有node CRUD regression通過。

### 6.2 RPC／idempotency／concurrency

- DB06：create同operation同payload replay結果相同；row count不增加。
- DB07：同operation不同payload回`OPERATION_ID_CONFLICT`。
- DB08：第二個新operation嘗試同task/board/parent回`REFERENCE_SCOPE_DUPLICATE`。
- DB09：cross-board move成功後source active=0、target active=1、primary不變、dependency hash不變。
- DB10：permission／stale revision／invalid anchor／self ancestor／cross-workspace任一失敗，source canonical snapshot bit-for-bit不變。
- DB11：兩交易相反方向cross-board move無deadlock；只一個合法canonical result，replay穩定。
- DB12：concurrent create同scope最多一active reference；loser取得stable conflict，不是unique SQL洩漏。
- DB13：remove reference subtree只soft-removetracking rows；canonical tasks、primary rows與dependencies不變。
- DB14：restore使用原IDs；parent missing／scope occupied／permission revoked時fail closed。
- DB15：有active reference時primary→account-unplaced拒絕；移除最後reference後SPEC-089 path成功。

### 6.3 RLS matrix

- DB16：U3建立前SELECT T1=0；reference建立後=1，且完整task fields可讀。
- DB17：U3 direct UPDATE/DELETE/placement INSERT/UPDATE/DELETE皆拒絕；UI hidden不能替代此證據。
- DB18：U2若source A具有`edit_task`可從B reference編輯；移除source capability後相同request拒絕。
- DB19：U4在reference建立後才加入B，加入後可讀；離開B後立即不可讀。
- DB20：B最後reference移除後U3不可讀；若C仍有reference或U3另有source direct access，對應path仍可讀。
- DB21：U6／W2永遠不可讀、create、move；tenant IDs不能由client偽造。
- DB22：U3看不到H1完整dependency endpoint、private record、source activity/audit與private memo；可見tag/assignee不越出W1。
- DB23：private helper不可經PostgREST直接呼叫；public RPC只grant authenticated、固定search_path、無anon execution。
- DB24：自訂role matrix只有含`move_task`者backfill`manage_task_reference`；其他capabilities bit-for-bit保留。

### 6.4 Performance

- DB25：對10k tasks／25k placements／project_members fixture執行`EXPLAIN (ANALYZE, BUFFERS)`；Board projection、task visibility、last-reference revoke命中預期indexes，無placement全表掃描或policy recursion。
- DB26：RLS policy中的Supabase auth helper固定使用`(select auth.uid())`；Supabase Database Advisor相關lint無新增WARN，若有須附plan與理由。
- DB27：create/move/remove transaction短，未在lock內做network／external call；相同scope lock順序穩定。

已產出 artifact：`output/qa/dev-095/db-isolated-result.json`（15 checks、PASS、runtime cleanup；含 tenant isolation、future viewer read/revoke、custom capability 與 private helper grant boundary）；`output/qa/dev-095/db-performance.txt` 保存 10k tasks／25k placements 的四組 EXPLAIN（placement projection、RPC projection、visibility、last-reference revoke），未出現目標 placement／canonical task Seq Scan。另已以 linked Supabase read-only 執行 `npx supabase db lint --linked --fail-on error`，結果無 error、僅一筆既有且與 DEV-095 無關的 warning，artifact 為 `output/qa/dev-095/supabase-db-lint.json`；schema snapshot、role matrix、完整 Supabase Advisor 與雙使用者 transcript仍屬 L3／release 前證據。不得把SQLite／mock宣稱為PostgreSQL RLS evidence。

## 7. L2 local-test browser cases

### 7.1 Desktop 1440×900

- B01：primary右鍵／action menu可見文字「建立追蹤副本」；viewer、reference與Firebase fixture不顯示。
- B02：click後同父相鄰只出現一個虛線reference，focus移入、screen-reader name含「追蹤副本」。
- B03：同Board before／after／append-child拖曳marker與結果正確；primary位置不變。
- B04：工作台選B，從A把reference拖入「已歸位」lane；直接commit到B root，不進未歸位、不新增status。
- B05：切B後把reference拖到M0下；reload仍在同位置。
- B06：reference menu顯示「移除此處追蹤」；單筆移除不影響T1 primary。
- B07：reference subtree >1時confirmation說追蹤位置，不說刪除任務；undo/redo整批且一個stack item。
- B08：server failure fixture下create無ghost、move source原位、remove仍可見，錯誤訊息可恢復且無SQL/internal ID。
- B10：reference-only target Board 在 List／Mind Map 保留每個 placement；Gantt 僅保留一個 canonical time object，Calendar 可產生多個時間 segment但 task identity 必須相同，四種模式均以虛線與 accessible name 區分。

### 7.2 Mobile 390×844／320×844

- B09：long-press reference後可同Board drop；short scroll/tap不誤drag。
- B11：reference可開details／remove；沒有水平overflow、action裁切、虛線消失或雙rail回歸。

### 7.3 Keyboard／A11y

- B12：Tab可到action與reference；Space start/drop、arrow target、Escape cancel，focus不丟失。
- B13：reference 必須沿用 primary 的任務內容結構與標題文字；預設可見文字不得出現額外「追蹤副本」badge／「同步自主要任務」說明，只能以 computed border style solid/dashed 區分，且 accessible name仍正確。
- B14：pending、success、failure live message不重複轟炸；focus-visible存在。
- B16（historical baseline）：舊版驗證tracking reference固定只顯示「開啟明細」且details唯讀；本案例保留作回歸來源，不再是最新action parity acceptance，不得單獨支持PASS。

### 7.4 Interaction parity rework（B17～B24，已執行）

- B17 click parity：在primary與tracking各執行single click、double-click、Enter／Space activation，必須經同一interaction binding、開啟同一Task Details destination、保留各自placement context並正確focus return；不得由reference直接呼叫details utility。
- B18 context／action parity：以source editor、derived-only viewer、target reference manager三種角色比對primary／tracking action IDs。相同canonical capability下共同action一致；差異只能來自duplicate guard、placement-specific「移除此處追蹤」與明示capability guard，不能由component type硬編碼固定唯讀menu。
- B19 desktop pointer DnD parity：primary／tracking使用相同drag threshold、overlay、collision與before／after／append-child marker；commit後primary走canonical move、tracking只改placement，失敗皆保留source與focus。
- B20 keyboard／mobile DnD parity：Space／arrow／Escape與390／320 long-press在兩種placement使用同一sensor/session；short tap／scroll不誤drag，reference無額外gesture dead zone。
- B21 shared surface parity：List row、Kanban card、checklist row逐surface比對visible slots、DOM semantics、selected／focus／pending／error狀態與computed style；唯一常駐視覺差異為outer solid／dashed border，不能只比`data-*` marker。
- B22 recursive child parity：primary與tracking均能由同一child surface展開／收合至少兩層；nested reference click／details／focus、drag target與accessible name可用，且create parent reference不自動產生未指定canonical descendants。
- B23 subtree transaction：拖曳tracking parent會原子移動其全部tracking descendants；cycle／cross-workspace／primary-under-reference反例fail closed，remove／undo／redo只影響該tracking subtree且primary roll-up不變。
- B24 capability／visible-error：derived-only actor使用同一details component但無mutation controls；source editor可從reference完成一次canonical更新且所有placements收斂。provider failure、permission revoke與stale revision顯示可恢復就地錯誤，無`.inline-error`／unexpected alert／HTTP 4xx/5xx殘留；1440×900、390×844、320×844皆需截圖與overflow量測。

執行結果：B17～B24 `PASS=8／FAIL=0／NOT_RUN=0／BLOCKED=0`。B20在390與320各完成short tap／scroll不誤drag、long-press cancel與真實placement commit；B21比對Board card、List row、checklist row的computed style與slot parity；B24以非Workspace-owner帳號驗證source owner→viewer撤權、revision conflict與provider fault均保留source並顯示可恢復訊息。artifact：`output/playwright/dev-095/interaction-parity-result.json`。

## 8. Cross-mode／integration cases

- I01 Board／List／Mind Map：同一Board不同parent的references各自出現，均使用placement hierarchy；canonical task filter count不因多位置增加。
- I02 Gantt／Calendar：同Board同task只一個時間物件；reference-only時為dashed visual且click開同task details。
- I03 Workbench：跨可見Boards同task只列一次；source不可讀時由 derived-read hydration 取得 canonical payload、保留 canonical source board identity、以 visible reference placement 顯示，不能把 target Board 當 source 或洩漏 hidden Board title。
- I04 task details／interaction：所有投影title/status/notes/assignees/dates相同且使用同一details component；無source edit權reference由capability guard唯讀，有source edit權者可從reference更新canonical task並使所有投影收斂。click／context action不得由reference renderer另行實作。
- I05 complete/status edit一次後所有投影收斂；reference本身沒有local status。
- I06 archive T1後references全隱藏；archive P0後T1/T2 external references亦隱藏；restore位置恢復。
- I07 permanent delete archived P0 subtree後所有task placements消失；task-collection asset依SPEC-093既有契約保留。
- I08 dependency／record link IDs與before hash一致；把T1 reference放在T3下不新增dependency。
- I09 filter同一Board各模式matchedTaskIds一致；多placement不增加totalTaskCount。
- I10 backup v3 export/readback保留合法references；v2 import只產primary；missing external task有明確report且不clone。
- I11 SPEC-089無reference task雙向unplaced不回歸；有reference時stable blocked error。
- I12 recycle bin不列「removed reference」為task；archive/recycle仍以canonical task處理。

## 9. L3 Supabase TEST two-user cases

- T01 U1建立B reference，已開啟B的U3在Realtime後看到；不reload。
- T02 U1改T1 title/status/note，U3的B projection收斂；payload不包含private linked data。
- T03 U1移除B最後reference，U3 projection消失、已開detail關閉或轉permission state，direct read=0。
- T04 U4在reference建立後加入B即可讀；移除membership後read=0。
- T05 U1跨A→B→C move，兩個observer只在合法Board看到；channel重連／visibilitychange後無ghost。
- T06 concurrent devices move同reference，兩端reload後exactly one active location。
- T07 hard delete／archive／restore與unfiltered DELETE/focus recovery收斂。
- T08 readiness probe若migration/RPC缺失，feature disabled且primary-only仍可用。
- T09 authenticated anon/public function/grant scan與Database Advisor結果符合DB23/DB26。

L3 evidence必須記錄project ref（可安全識別形式）、artifact SHA、migration versions、users/roles、timestamps、raw RPC/RLS readback與cleanup；不得把local-test截圖替代。

## 10. Regression gates

至少執行（實際 script 以 repo 現況為準）：

```text
npm run verify:dev-039-task-filter-core
npm run verify:dev-044-undo-coverage
npx tsx scripts/verify-dev-082-board-realtime-sync.ts
npm run verify:dev-086-task-workbench-subtree-transfer
npm run verify:dev-088-task-lifecycle
npm run verify:dev-089-task-placement-transaction
npm run verify:dev-047-backup-transaction-local-db
npm run verify:dev-095-task-tracking-references-backup
npm run verify:dev-095-task-tracking-references-qc
npm run verify:dev-095-task-tracking-interaction-parity
npm run verify:dev-095-task-tracking-interaction-parity-browser
npm run verify:dev-095-task-tracking-interaction-parity-qc
npx tsc --noEmit
npm run lint
npm run build:test
git diff --check
```

實際script名稱若repo不同，QA以`package.json`現行名稱為準並在evidence記錄；不得杜撰不存在指令為PASS。

Historical regression readback：`verify:dev-039-task-filter-core`、`verify:dev-039-filter-result-parity`、`verify:dev-039-task-workbench-cross-board-source`、`verify:dev-039-task-workbench-cross-device`、`verify:dev-086-task-workbench-subtree-transfer`、`verify:dev-088-task-lifecycle`、`verify:dev-089-task-placement-transaction`、`verify:dev-089-placement-scope-isolation`、`verify:dev-047-backup-transaction-local-db`、`verify:dev-047-backup-package-contract`、DEV-047 backup model、`npx tsx scripts/verify-dev-082-board-realtime-sync.ts` 均 PASS；DEV-095 B01～B16 16/16與backup 4/4亦為rework前baseline。RD完成interaction refactor後必須重跑受影響regressions，不得因歷史PASS省略。`verify:dev-039-task-workbench-placement-lanes`與`verify:dev-044-undo-coverage`的既有static failures仍由各自DEV處理。

DEV-095 touched-file targeted ESLint 為 0 errors（僅既有未使用變數、hook dependency 與 prefer-const warnings）；完整 `npm run lint` 本輪未宣告 PASS，因工作樹另有未追蹤的 `scripts/verify-dev-093-debug-overflow.pw.js` 觸發 1 個 lint error，該檔案不屬 DEV-095 且未被修改。

Fresh interaction evidence：`verify:dev-095-task-tracking-interaction-parity` 4/4、browser B17～B24 8/8、independent QC-IP01～08 8/8、cross-mode I01～I12 12/12、backup 4/4、`npx tsc --noEmit`、targeted ESLint 0 error與`npm run build:test`均PASS。完整lint仍依上一段誠實保留未宣告；Supabase TEST與release未執行。

## 11. AC traceability

| AC | Cases |
|---|---|
| AC-095-001～003 | S01～S06、DB06～08、B01～02 |
| AC-095-004～005 | M01/M05、DB09～15、B03～05 |
| AC-095-006 | M02～04、I09 |
| AC-095-007～009 | DB16～24、I03～04、T01～04、B18、B24 |
| AC-095-010～012 | M06/M08、DB13～15、I05～08、T07 |
| AC-095-013～015 | I01～04、B09～16、provider/static regressions |
| AC-095-016 | I10、backup regression |
| AC-095-017 | B13 historical visual baseline、B21、B24 visible-error sweep |
| AC-095-018 | DB01～05、release rollback rehearsal |
| AC-095-019 | S07、B21、source duplication scan |
| AC-095-020 | S08、B17～18、B24 |
| AC-095-021 | S09、B19～20、B24 |
| AC-095-022 | S10、B22～23、M02/M05/M08 |
| AC-095-023 | DB17～18、B18、B24、I04、T02～03 |
| AC-095-024 | B17～24、frozen candidate provenance、visible-error sweep |

## 12. QA exit／QC handoff

本次interaction rework已達`Local Automated QA Passed`：S07～S10與B17～B24全部PASS、0個本地P0/P1 open，frozen candidate artifacts存在且可重跑；既有B01～B16／QC01～QC07僅作baseline，未被拿來替代新證據。這仍不代表Supabase TEST、production或release ready。

獨立QC已以`verify:dev-095-task-tracking-interaction-parity-qc`完成QC-IP01～08 8/8 readback，直接核對source duplication、click/action、三種gesture、recursive child tree、capability、stale/fault recovery與desktop/mobile rendered evidence。要宣告`TEST QA Passed`，仍需T01～T09與same-artifact two-user證據。

2026-08-29 evidence classification：browser B01～B16 16/16、isolated PostgreSQL 15/15與舊QC01～07 7/7為historical baseline；S07～S10 4/4、B17～B24 8/8及QC-IP01～08 8/8為current interaction candidate evidence；backup 4/4與cross-mode I01～I12 12/12已fresh rerun。L3 Supabase TEST仍因remote schema／migration history readiness未滿足而未執行。

以下不得降級為備註：derived edit、last-reference revoke、partial move、roll-up inflation、cross-tenant leak、migration invariant或provider ghost；任一失敗皆為stop-ship。

## 13. Planned artifact map

- `output/qa/dev-095/static-result.json`
- `output/qa/dev-095/model-result.json`
- `output/qa/dev-095/db-isolated-result.json`
- `output/qa/dev-095/db-performance.txt`
- `output/qa/dev-095/backup-result.json`
- `output/playwright/dev-095/result.json`
- `output/qa/dev-095/interaction-parity-source-result.json`
- `output/playwright/dev-095/interaction-parity-result.json`（B17～B24 current PASS）
- `output/qc/dev-095/interaction-parity-qc-result.json`
- `output/qa/dev-095/cross-mode-result.json`
- `output/qa/dev-095/supabase-test-preflight.json`
- `output/qa/dev-095/supabase-db-lint.json`
- `output/qa/dev-095/supabase-test-result.json`
- `output/playwright/dev-095/interaction-parity-1440x900.png`
- `output/playwright/dev-095/interaction-parity-390x844.png`
- `output/playwright/dev-095/interaction-parity-320x844.png`
- `ai-doc/qc/QC-DEV-095-task-tracking-reference-projections.md`

目前current artifacts已包含source S07～S10、browser B17～B24、三張viewport PNG與獨立QC-IP01～08；model／cross-mode／DB／backup與browser B01～B16保留各自適用的baseline或fresh regression證據。Supabase TEST preflight與migration history阻塞維持原紀錄，未執行remote mutation、deploy或release。
