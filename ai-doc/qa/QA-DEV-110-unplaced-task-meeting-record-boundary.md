# QA-DEV-110 未歸位任務會議紀錄邊界驗證計畫

- 狀態：`QA Plan Ready / Execution NOT STARTED / NOT RELEASED`
- 日期：2026-09-08
- 對應：DEV-110、SPEC-110、CAPA-DRAFT-20260908
- 風險：Medium
- Evidence rule：source/static只能證明結構；ownership、network absence、資料不變與使用者可見結果必須由
  deterministic、真實 browser及隔離 Supabase TEST各自舉證。任何舊 DEV-108 PASS不得預填本次結果。

## 1. 驗證目的與範圍

確認 task detail 在 canonical board task、tracking reference與account-unplaced三種 ownership 下，只執行
合法的會議紀錄讀寫；未歸位任務不再觸發板內查詢，跨板 reference不再誤用target board，Supabase record
save也不再 silently skip unresolved task links。

驗證包含：capability決策、stale response、UI狀態、store defense、provider preflight、exact-link readback、
正常 DEV-108回歸、三 viewport與visible-error。排除：production資料修復、未歸位專屬record schema、
transactional RPC、deployment與post-deploy effectiveness。

## 2. Fixture、角色與正常入口

### 2.1 固定 identities

- Workspace W1；Board A、Board B，兩者皆由測試owner可讀寫。
- Task A1：Board A primary，legacy ID `task-a1`。
- Task A2：Board A primary，但 ID 固定以 `task_workbench_unplaced_promoted_` 開頭，證明歸位後不能靠prefix誤擋。
- Reference R-A1-B：A1在Board B的tracking reference；placement ID與canonical task ID不同。
- Unplaced U1：`boardId=__task_workbench_unplaced__`，ID `task_workbench_unplaced_u1`。
- Task B1：Board B primary。
- Meeting MA：Board A active draft；含A1 quick note與archived record。
- Meeting MB：Board B active draft；初始links只有B1。
- Existing record E1：Board A，body/link fingerprints固定，用於preflight零mutation驗證。

所有ID、entry timestamp、record status與expected fingerprints寫入artifact；不得依執行當下資料猜測。

### 2.2 Target actor／UI entry

- Role：可讀寫Board A/B與meeting record的owner；另用無source-board read權限actor做RLS負向測試。
- 正常入口：登入 → Board／Task Workbench → 點任務名稱開 `TaskDetailsModal`；tracking reference從Board B
  的reference row進入；meeting mode由既有會議紀錄入口啟動。
- Desktop：1440×900；laptop：1024×768；mobile：390×844。Mobile只驗證既有允許的read-only/task-detail
  邊界，不把mobile meeting composer改成新能力。

## 3. FMEA／fail-seeking matrix

| ID | 失效模式 | 現有影響 | Required control | Evidence |
|---|---|---|---|---|
| F01 | U1送入Board A `listByNode` | raw Supabase not-found | capability在call前unsupported | spy＋network 0 call＋browser |
| F02 | A2因legacy prefix被誤擋 | 歸位後功能永久不可用 | 只用canonical `boardId`判定 | deterministic＋browser |
| F03 | R-A1-B以Board B查A1 | not-found或錯誤資料 | read固定source Board A | call args＋Supabase readback |
| F04 | R-A1-B append到Meeting MB | target record缺link或partial save | append board mismatch拒絕 | store＋browser＋DB 0 mutation |
| F05 | A慢response覆蓋U1/B1 | stale entries/error | generation＋scope key | deferred promise test |
| F06 | unresolved link被silent skip | record成功但追溯缺失 | resolve-all preflight | before/after fingerprints |
| F07 | load exception原樣顯示 | 內部資訊外洩、無法操作 | typed UI mapping | visible text/DOM sweep |
| F08 | preflight後link insert/delete失敗 | cross-table partial state | fail、不更新成功baseline；觸發stop/capsule | fault injection＋readback |

F01、F04、F06、F07是P0 test gate；F08若觀察到不可補償partial state，DEV-110不得進release candidate，
依SPEC-110 Future Phase RPC capsule回PM。

## 4. Deterministic／source gate

RD新增 `npm run verify:dev-110-unplaced-task-meeting-record-boundary`，至少驗證：

1. capability table五列全部exact match；unplaced以board sentinel判定，A2雖有prefix仍supported。
2. tracking reference輸入placement identity時，resolver輸出仍為canonical task ID/source board；placement ID不進
   record query、metadata、content token或taskLinks。
3. U1／identity incomplete執行refresh為no-op，remoteRecords/error/loading同步reset。
4. supported scope只呼叫一次`listByNode(sourceWorkspace, sourceBoard, canonicalTaskId,
   {includeArchived:true})`。
5. A1 pending → U1 → B1；依序resolve/reject舊promise，只有B1目前generation可更新畫面。
6. provider exception映射`load-failed`；raw message不出現在hook consumer props或rendered source。
7. append input在U1、Board A task＋Board B meeting時denied，content、metadata、taskLinks、cursor與synthesis
   signature逐欄不變；A1＋Meeting MA維持DEV-108 appended/noop。
8. Supabase 0% unresolved可進入既有mutation並通過exact-set readback；部分或100% unresolved必須在第一個
   mutation前throw `RECORD_TASK_LINK_UNRESOLVED`，mutation spy count=0；console warning不算通過。
9. resolved provider reload的 `(nodeId, role)` exact set：equal才成功；missing/extra/role mismatch皆fail。
10. Firestore/local-test upsert回傳的link exact set與requested一致；空links仍合法。
11. user-visible strings固定為SPEC-110文案，不含`Supabase`、`wbs_items`、`record_task_links`、
    `legacy node id`、SQL或RLS片段。
12. 原 DEV-108 projection、archive、active draft、latest-3與invalid metadata deterministic cases維持。

Static verifier不得只用`source.includes('includeArchived: true')`宣稱ownership通過；核心assertion須執行pure
resolver、deferred promise與provider mutation spy。

## 5. Browser scenarios

### B01 非meeting開啟未歸位任務

1. 從Task Workbench「未歸位」正常入口開U1。
2. 斷言會議紀錄section、loading、error、retry、composer均不存在。
3. 斷言本次操作沒有task-scoped record request、failed request、console error或page error。

### B02 meeting mode開啟未歸位任務

1. 在Board A開始Meeting MA，再從工作台開U1。
2. 只顯示「請先將任務放入目前會議的看板，再新增會議紀錄。」
3. textarea、「加入」與「重試」不存在；單一inline訊號，無卡片、icon、toast或technical ID。
4. 透過test seam直接呼叫append，仍為denied且MA draft fingerprint不變。

### B03 歸位後能力恢復

1. 以正式placement flow將U1放入Board A；不得直接patch fixture結果。
2. 重開同一task；即使ID prefix保留，也能load history並顯示composer。
3. 新增一筆，列表立即出現且draft task link為canonical U1；保存/readback exact set一致。

### B04 tracking reference source／target boundary

1. 從Board B的R-A1-B開A1，非meeting時載入Board A source history。
2. 啟動Meeting MB；source history可讀，但composer不存在，顯示「此任務屬於其他看板；請在原看板的
   會議中新增紀錄。」
3. direct append被store拒絕；MB body、metadata與links不變。
4. 回Board A的Meeting MA開A1，composer恢復且append成功。

### B05 stale response／task switch

- 人為延遲A1 read，依序開A1 → U1 → B1，再resolve A1。
- B1畫面不得出現A1 entries、U1提示殘留、錯誤或loading；U1階段network call為0。

### B06 transient／permission failure

- 對supported A1注入一次transient reject：顯示「會議紀錄載入失敗」與有效「重試」；第二次成功後移除。
- 以無source read權限actor從reference開A1：不得顯示資料或RLS details，不得誤標為unplaced。
- DOM、toast、console-to-UI bridge與screenshot OCR文字均不得含raw provider message。

### B07 DEV-108正常回歸

- Board A primary task覆蓋：0/1/3/4筆、latest-3、expand/collapse、archived、active draft、reload、append、
  `Ctrl/Cmd+Enter`、invalid metadata、load retry。
- 新修正不得改變日期、排序、section位置、quiet UI或mobile composer既有邊界。

## 6. Supabase TEST integration

使用隔離tenant/user/project fixture；不得以production row作測試資料。

| Case | 操作 | Required readback |
|---|---|---|
| T01 | 建U1並開detail | `wbs_items`/record task query call count=0；UI無錯 |
| T02 | 正式placement U1→Board A | `wbs_items.legacy_node_id=U1`；detail read成功 |
| T03 | A1 source history + Board B reference | query project=Board A；結果與source record一致 |
| T04 | 新record帶U1未歸位link | typed reject；knowledge record/link count與fingerprint皆不變 |
| T05 | existing E1帶一resolved＋一unresolved link更新 | preflight reject；E1 body/status/metadata/links逐欄不變 |
| T06 | resolved create/update/archive；另對隔離copy注入post-preflight link failure | happy path exact set相等且archive read正常；injected path不得回success，若readback為partial立即觸發stop/capsule |

每個case保存actor、tenant/project/task/record IDs、before/after count與fingerprint、query/mutation attempts、
expected/actual、cleanup結果。fixture cleanup residual必須為0。

## 7. UI／accessibility／viewport gate

| Viewport | Required evidence |
|---|---|
| 1440×900 | B01～B07主要流程、正常section順序、單一狀態訊號 |
| 1024×768 | modal scroll、長提示/長history、retry與expand無重疊／overflow |
| 390×844 | nonmeeting U1無空section；source history可讀；既有mobile composer不出現 |

- Tab順序與視覺順序一致；retry可鍵盤操作並有accessible name。
- unsupported文字不進tab order；不使用disabled button冒充說明。
- 200% zoom、長中文／英文、Windows scrollbar下無水平overflow或雙重scroll owner。
- unexpected `[role=alert]`、Not Found、raw technical字串、console error、pageerror或非預期4xx/5xx一律Fail。

## 8. Regression／command gate

候選凍結後至少執行：

```text
npm run verify:dev-110-unplaced-task-meeting-record-boundary
npm run verify:dev-110-unplaced-task-meeting-record-boundary-browser
npm run verify:dev-108-task-meeting-note-persistent-list
npm run verify:dev-108-task-meeting-note-persistent-list-browser
npm run verify:dev-039-task-filter-core
npm run verify:dev-095-task-tracking-reference-projections
npx tsc --noEmit
npm run build:test
git diff --check
```

若package script實際名稱不同，QA記錄resolved command；不得因名稱差異省略對應行為。Targeted ESLint涵蓋
DEV-110全部新增／修改TS/TSX。DEV-039只需unplaced/placement相關targeted cases；DEV-095只需canonical
identity/reference detail相關cases，避免無關大包測試阻塞。

## 9. Evidence package與判定

- Static：`output/qa/dev-110/static-result.json`
- Browser：`output/playwright/dev-110-unplaced-task-meeting-record-boundary/result.json`
- Supabase TEST：`output/qa/dev-110/supabase-test-result.json`
- Screenshots：B02 unplaced prompt、B03 placed recovery、B04 cross-board、B06 generic error，以及三viewport。
- QC：候選完成後另建 `ai-doc/qc/QC-DEV-110-unplaced-task-meeting-record-boundary.md`；本計畫不預建PASS。

每個artifact必含source revision/dirty boundary、environment/provider、actor/fixture、viewport/URL、steps、
expected/actual、console/page/network errors、before/after fingerprint、runtime PID/port/purpose/cleanup condition與
port released。Browser fixture結果必須由正常UI delivery path產生；後端seed只可建立前置資料。

全部P0/P1、T01～T06、指定回歸與cleanup通過，才可標`QA PASS`。以下任一立即Fail並回RD：

- unplaced仍發出task-scoped query或顯示retry/composer。
- legacy prefix導致已歸位task被誤擋。
- tracking placement/target board被當record canonical identity。
- raw provider error可見、load failure被吞成空白或retry無效。
- unresolved task link仍回傳成功、任何preflight失敗造成mutation，或requested/persisted links不等。
- stale response污染目前task、正常DEV-108行為退化、viewport/a11y gate失敗。

## 10. Execution boundary

QA可在RD frozen local candidate與隔離Supabase TEST執行；不得查改production、套用remote migration、commit、
push、deploy或release。若T06觀察到preflight後不可補償partial state，標Fail並以SPEC-110 RPC capsule
回PM；不得降低驗收或把問題改寫成warning。

使用思考習慣：#第一性原理、#效用理論、#多層次分析、#可驗證性
