# 未編號 CAPA 草稿：未歸位任務誤用板內會議紀錄查詢

- 建立日期：2026-09-08
- 狀態：`RD Implementation In Progress / Not Registered / Local Static+Browser Candidate PASS / QA-QC-Effectiveness Not Run`
- 問題類型：系統性功能邊界缺口／資料追溯風險／驗證逃逸
- 建議嚴重度：P1（畫面錯誤本身為局部功能失效，但另有 task link 靜默略過路徑）
- 事件環境：Production 使用者畫面 `https://projed-cc78d.web.app`
- 主要關聯：DEV-110、SPEC-110、QA-DEV-110、DEV-108、SPEC-108、DEV-039、DEV-095
- CAPA ID：未編號。本輪只要求制定措施，未授權正式登錄或占用編號。
- Register evidence：`ai-doc/reports/CAPA-Register.md` 於 2026-09-08 顯示下一個可核發號碼為
  `CAPA-002`；本草稿未寫入 Register，因此 `CAPA-002` 尚未分配給本案。
- 執行邊界：使用者於2026-09-08授權把CAPA文件升級到RD可實作並登錄DEV-110；本輪完成 local working-tree
  candidate implementation、deterministic/static gate與受控 localhost browser candidate smoke，但不執行 Supabase TEST、正式資料查詢／修復、
  migration apply、commit、push、deploy、activation或release。

## 0. RD Implementation Update（2026-09-08）

- 使用者決策來源：`USER-20260908-CAPA-RD-IMPLEMENTATION-READY`。
- 已登錄corrective開發點：DEV-110（不計入產品交付完成）。
- Authoritative implementation contract：`ai-doc/specs/SPEC-110-unplaced-task-meeting-record-boundary.md`。
- QA authority：`ai-doc/qa/QA-DEV-110-unplaced-task-meeting-record-boundary.md`。
- Current-phase產品邊界：account-unplaced task先進入目前會議的看板，才能使用project-scoped meeting record；
  tracking reference讀取使用canonical source board，跨板meeting不可append。
- Current-phase資料完整性：Supabase先解析全部requested task links，再開始任何mutation；任一unresolved即
  typed reject，並以reload exact-set決定success。不得silent skip。
- Spec governance：對SPEC-039為`Intentional narrow exception`，對SPEC-108為`Corrective amendment`，與
  SPEC-095 canonical task／placement identity一致；無unresolved conflict。
- ADR：不需要。現階段只使用既有ownership/FK事實建立局部可逆guard與adapter；若failure injection觸發
  transactional RPC capsule，再重新進行ADR判斷。
- Readiness gate：P0/P1 engineering blockers=0；WP-110-A～C已完成 local candidate，WP-110-D deterministic/static
  verifier通過18項assertions，受控 localhost browser candidate B01～B04 PASS；TypeScript、lint、build:test與diff check通過。
- 尚未執行：Supabase TEST、完整QA/QC、production impact audit、資料修復與release；CAPA仍未正式編號。

## 1. 一般使用者版

### 發生什麼事

開啟一筆「未歸位」任務的明細時，會議紀錄區顯示：

```text
Supabase WBS item not found for legacy node id: task_workbench_unplaced_...
```

系統把仍在全域工作台的未歸位任務，當成已存在於看板 `wbs_items` 的任務查詢。由於兩者實際位於
不同資料邊界，查詢必然找不到。這不是使用者輸入錯誤，也不是按「重試」即可恢復的暫時連線問題。

### 為什麼

DEV-108 新增的 task-scoped meeting record loader 假設所有 `TaskNode` 都是板內 WBS task，但共用
`TaskDetailsModal` 同時會開啟板內任務與未歸位任務。程式沒有先判斷 task ownership，就呼叫只支援
`wbs_items` 的 Supabase query。QA fixture 只覆蓋正常看板 Task A／B，因此此 ownership 組合沒有被測到。

更重要的是，record save path 遇到無法解析的 task link 時會以 warning 略過，仍可能把 record 主體保存為
成功。這會形成「紀錄存在，但沒有正確掛回任務」的靜默追溯缺口。

### 現在怎麼修

1. 未歸位任務在放入正式看板前，不發出板內會議紀錄查詢，也不允許建立會被靜默略過的 task link。
2. UI 不顯示 Supabase 內部英文與 legacy ID；以明確產品語意顯示「請先將任務放入看板」。
3. record save 不得在 requested task link 無法解析時假裝完整成功；需回傳可判定結果並保留草稿。
4. 以唯讀方式盤點正式環境是否已有 unplaced quick-note metadata／正文 token，但缺少 `record_task_links` 的紀錄。

### 如何防止再發

1. 建立 task ownership／feature capability 契約，區分板內 WBS、帳號未歸位與 tracking reference。
2. 所有共用任務明細功能都要跑 ownership × provider 測試矩陣，不再只測一般看板 task。
3. Supabase TEST 與 production-bound candidate smoke 必測此案例；local-test PASS 不得取代真實 FK／RLS 邊界。
4. 對齊 DEV 文件狀態、release artifact 與 production 功能，避免 `NOT RELEASED` 文件對不上正式站。

## 2. 不符合事實、證據與未知項

### 2.1 已確認事實

| ID | 事實 | 證據 | 判定 |
|---|---|---|---|
| F-01 | Production 畫面在任務明細「會議紀錄」區顯示 `Supabase WBS item not found...` | 使用者提供的 `projed-cc78d.web.app` 截圖 | Confirmed |
| F-02 | 錯誤 ID 以 `task_workbench_unplaced_` 開頭，該前綴由未歸位任務 ID factory 固定產生 | `src/features/taskWorkbench/placement.ts:13-19` | Confirmed |
| F-03 | 未歸位任務保存於 `task_workbench_unplaced_items`，其 `boardId` 為 `__task_workbench_unplaced__`，不是 `wbs_items` 板內資料 | `src/services/supabase/taskWorkbenchUnplacedService.ts`、`supabase/migrations/20260810093403_task_workbench_unplaced_items.sql` | Confirmed |
| F-04 | Task detail hook 只檢查 active workspace／board／taskId 是否存在，之後無條件呼叫 `recordService.listByNode(activeWorkspaceId, activeBoardId, taskId)` | `src/hooks/useTaskMeetingQuickNotes.ts:28-48` | Confirmed |
| F-05 | Supabase `listByNode` 先以 active project 在 `wbs_items` 解析 node；沒有符合 row 時直接 throw 截圖中的錯誤 | `src/services/supabase/projedService.ts:435-453`、`:1750-1775` | Confirmed |
| F-06 | `TaskMeetingQuickNoteSection` 直接把 loader error render 成 visible alert，因此內部資料表／legacy ID 洩漏到使用者畫面 | `src/components/TaskNotes/TaskMeetingQuickNoteSection.tsx:72-77` | Confirmed |
| F-07 | record upsert 對無法解析的 task link 只寫 console warning 並 `return null`，後續仍可保存 record 主體 | `src/services/supabase/projedService.ts:1797-1830` | Confirmed control defect |
| F-08 | DEV-108 QA fixture 明定 Task A／B 都從正常看板開啟；static gate 只檢查 `includeArchived:true` 存在，沒有 unplaced ownership case | `ai-doc/qa/QA-DEV-108-task-detail-meeting-note-persistent-list.md`、`scripts/verify-dev-108-task-meeting-note-persistent-list.ts:61` | Confirmed escape cause |
| F-09 | SPEC／QA／QC-DEV-108 仍標示 `Local-only / NOT RELEASED`，但 production 截圖出現 DEV-108 的會議紀錄區與 loader 錯誤 | DEV-108 文件＋使用者截圖 | Confirmed inconsistency；artifact identity 待查 |

### 2.2 未知與待補證據

| ID | 未知項 | 必要證據 | 未取得前限制 |
|---|---|---|---|
| U-01 | 正式環境有多少 record 曾以未歸位 taskId 寫入 metadata／正文，但缺少 task link | Production 唯讀 query／export，比對 `knowledge_records.metadata`、content token 與 `record_task_links` | 不宣稱已發生資料遺失，也不做資料修復 |
| U-02 | Production 目前載入的 source commit／artifact，以及 DEV-108 何時進入正式站 | Firebase release ID、entry bundle hash、release capsule／commit mapping | 不判定是文件落後或未追蹤部署 |
| U-03 | 受影響 record 是否可在 task 歸位後由既有 metadata／正文唯一重建 link | 每筆 record 的 taskId、目標 project、現存 WBS readback 與 collision report | 不自動 relink、不直接 SQL insert |
| U-04 | 錯誤是否只發生於 canonical unplaced task，或 tracking reference／跨板 task 也有相同 identity mismatch | ownership × provider deterministic／browser matrix | CAPA 關閉前不得限縮成單一 ID 個案 |

## 3. 影響與範圍

### 3.1 已確認影響

- 未歸位任務的歷史會議補記載入失敗，且重試會重走相同必敗查詢。
- 使用者看到內部英文、資料來源名稱與 legacy ID，無法理解可採取的動作。
- `listByNode` 的 domain precondition 沒有在 UI／service type 中表達，錯誤只能在 runtime 發現。
- requested task link 可被靜默略過，造成 record save 與關聯完整性分離。

### 3.2 可能影響（待 U-01 證實）

- 使用者可能已建立會議紀錄或補記，但 task-scoped history 無法由該任務找回。
- 若任務日後歸位，過去被略過的 task link 不會自動補建。
- 文件所記錄的 release 狀態可能與正式環境 artifact 不一致。

### 3.3 本 CAPA 不包含

- 不在本草稿內新增讓未歸位 task 永久支援 project-scoped meeting record 的 schema。
- 不直接修復 production record links、刪除 record 或搬移使用者任務。
- 不把所有 TaskDetailsModal 功能一次重構；只建立可擴充 capability 契約並修正 record boundary。
- 不把文件完成或 local test PASS 誤算為產品修復或 CAPA 關閉。

## 4. Immediate Containment／Correction

| ID | 立即措施 | 控制目的 | Owner | 完成證據 |
|---|---|---|---|---|
| CT-01 | 使用者在修正上線前，先將要使用會議紀錄的未歸位任務放入目標看板，再重開任務明細 | 避免必敗查詢與新 task-link 追溯缺口 | User／Support | 任務歸位後 `wbs_items.legacy_node_id` readback＋會議區無原錯誤 |
| CT-02 | 對此錯誤停止反覆按「重試」；重試只適用於 transient load failure，不適用 unsupported ownership | 避免無效操作與錯誤訊息噪音 | Product／Support | 使用者指引或暫時性已知問題紀錄 |
| CT-03 | 保留現有 record、draft 與 task；未完成 U-01～U-03 前不刪除、不重建、不直接補 SQL link | 保留可追溯證據，避免錯配 project／task | Data owner | 零 production mutation audit |
| CT-04 | 將 DEV-108／本已知 regression 列為下一次 release 的 feature stop condition | 防止再用既有 local PASS 宣稱修復 | PM／Release owner | Release capsule 明列 regression 與 required smoke |

使用思考習慣：#多層次分析、#目的、#可驗證性

## 5. Root Cause Analysis

### 5.1 因果鏈

```text
共用 TaskDetailsModal 可開啟多種 ownership 的 TaskNode
  → DEV-108 loader 未辨識 ownership／feature capability
  → 把 task_workbench_unplaced_* 與目前 activeBoardId 一起送入板內 listByNode
  → Supabase 只在該 project 的 wbs_items 查 legacy_node_id
  → 未歸位 task 實際存在另一張 account-scoped table，查詢必然找不到
  → service throw 內部錯誤字串
  → UI 原樣顯示錯誤與無效「重試」

同一缺口的寫入風險：
未歸位 task 被加入 record.taskLinks
  → Supabase 無法解析 item_id
  → upsert 靜默略過 link，但 record 主體仍可繼續保存
  → 使用者得到部分成功，task-scoped traceability 不完整
```

### 5.2 多層次根因

| ID | 層次 | 根因／控制缺陷 | 證據狀態 | 反事實檢查 |
|---|---|---|---|---|
| RC-01 | UI／Hook | DEV-108 loader 沒有 ownership guard，將任何 TaskNode 都視為可做 project-scoped record query | Confirmed | 若在呼叫前辨識 unplaced 並回傳 supported outcome，原錯誤不會發生 |
| RC-02 | Domain contract | `TaskNode.id` 同時代表板內 canonical／legacy、account unplaced 與 tracking reference；record feature 沒有明確 capability 契約 | Confirmed systemic root | 若 ownership 成為 service input／capability，錯誤會在編譯或明確分支被處理，不會落到 DB not-found |
| RC-03 | Service／Data integrity | record read 對 unresolved node 採 throw；record write 卻對 unresolved task link 採 silent skip，讀寫失敗語意不一致 | Confirmed control defect | 若 write fail-closed 或回傳 partial outcome，使用者不會把缺 link 的保存當完整成功 |
| RC-04 | UI error policy | provider 內部錯誤未轉成產品語意；unsupported、not-found、forbidden、transient 共用字串 error channel | Confirmed contributing cause | 若錯誤為 typed outcome，UI 不會顯示資料表與 legacy ID，也不會對永久不支援情況提供 retry |
| RC-05 | QA／Provider coverage | DEV-108 fixture 只測正常板內 task；local/static gate 未覆蓋 Supabase 真實 ownership／FK 邊界 | Confirmed escape cause | 若加入 unplaced × Supabase TEST case，release 前即可重現並阻擋 PASS |
| RC-06 | Release governance | DEV 文件狀態與 production 可見功能不一致，artifact provenance 未回寫或文件可能落後 | Confirmed inconsistency；哪一側錯仍待 U-02 | 若 release capsule、artifact 與 DEV terminal state綁定，不能同時存在 `NOT RELEASED` 與 production 可見功能 |

### 5.3 系統性根因結論

主要系統性根因是：`共用任務表面沒有以 ownership/capability 作為一級領域契約，導致板內資料功能對所有
TaskNode 被默認開放；read、write、UI 與 QA 各自用不同方式處理不支援身份。`

RC-01 是直接觸發點；RC-02／RC-03 是造成錯誤與靜默資料追溯風險的系統根因；RC-05／RC-06 解釋為何
問題通過驗證並出現在正式站。

### 5.4 五個為什麼

1. 為什麼畫面顯示 Supabase WBS item not found？因未歸位 taskId 被送入只查 `wbs_items` 的 API。
2. 為什麼未歸位 task 會呼叫該 API？因 DEV-108 hook 只檢查 ID／active board 存在，沒有 ownership 判斷。
3. 為什麼沒有 ownership 判斷？因 record service contract 以裸 `nodeId` 表達能力，默認所有 TaskNode 等價。
4. 為什麼還有靜默 link 缺口？因 read 採 throw、write 採 skip，沒有共同的 typed terminal contract。
5. 為什麼 QA 沒發現？因 fixture 只含板內 Task A／B，static gate 驗證「有呼叫」而非各 ownership 的合法結果，且正式 provider／release artifact gate 未完成或未回寫。

## 6. 矯正措施（CA）

| ID | 對應根因 | 措施 | Owner | 驗證證據 | Stop condition |
|---|---|---|---|---|---|
| CA-01 | RC-01、RC-02 | 在 task detail record loader 取得 node ownership；對 account-unplaced 回傳 `unsupported`，不得呼叫板內 `listByNode`。active remote records/error 必須隨 task identity 正確清除 | RD | unit/static＋browser network capture 證明 unplaced 開啟時無 `record_task_links`／WBS query，切回 board task 可正常載入 | 若仍只能靠 ID 字串猜 ownership且無 node context，停止並先補 capability adapter |
| CA-02 | RC-02、RC-04 | 定義最小產品規則：未歸位任務在歸位前不支援 project-scoped 會議紀錄；非 meeting mode 且無資料時不 render 區段，meeting mode 則顯示最短「請先將任務放入看板」且不提供無效 retry／append | Product／RD | 1440、1024、390 viewport semantic／screenshot；無 raw backend text | 若產品要讓未歸位任務直接擁有會議紀錄，必須另案決定 tenant/project 歸屬與 schema，不在本 hotfix 擴張 |
| CA-03 | RC-03 | 移除 record upsert 的 unresolved-link silent success：任何mutation前resolve全部requested links；任一失敗即typed reject並保留record／舊links；resolved save須以reload exact-set判定success | RD | provider contract tests：0 unresolved happy path、部分／全部 unresolved reject、existing record overwrite、retry與requested/persisted fingerprint；preflight失敗mutation=0 | 若preflight後fault injection出現不可補償partial state，停止release並啟動transactional RPC capsule，不以console warning當控制 |
| CA-04 | RC-03 | 執行正式環境唯讀 impact audit，找出 metadata／正文含 unplaced taskId、但 link 缺失的 records；輸出 collision／可修復／不可唯一判定清單 | QC／Data owner | timestamped read-only artifact、query identity、0 mutation、record/task/project counts | 沒有唯一 task/project 對應時不得自動修復 |
| CA-05 | RC-03 | 只有在 CA-04 證明存在受影響資料、task 已歸位且 data owner 核准後，另立資料修復方案；逐筆建立 link、readback、audit與 rollback | Data owner／RD／QC | before/after export、transaction result、record_task_links readback、residual mismatch=0 | 本 CAPA 草稿不授權；任何 ambiguity、跨 project 或 missing task 立即停止 |
| CA-06 | RC-06 | 唯讀核對 production Firebase release／bundle 與 source commit，判定 DEV-108 是已發布但文件未回寫，或 production artifact scope 未受控 | Release owner／QC | release ID、bundle hash、commit mapping、DEV terminal state reconciliation | provenance 不一致時禁止把下一版標為 release-ready |

使用思考習慣：#效用理論、#限制條件、#可驗證性

## 7. 預防措施（PA）

| ID | 對應根因 | 系統控制點 | PA | 目標層／Owner | 驗證與再觸發 |
|---|---|---|---|---|---|
| PA-01 | RC-02 | Domain／feature boundary | 建立 `TaskOwnershipKind`／record capability adapter，至少明確區分 `board-canonical`、`account-unplaced`、`tracking-reference`；共用 modal 功能不得只看裸 ID | Project SOP＋產品碼／RD | type tests＋capability matrix；任何共用 task surface 新增 provider 功能時重跑 |
| PA-02 | RC-03、RC-04 | Provider terminal contract | task-scoped read/write 使用 structured outcome，區分 `unsupported`、`not_found`、`forbidden`、`transient_failure`、`resolved`；UI 不解析英文錯誤字串 | dev_task／RD | provider contract＋UI mapping tests；新增 provider 或 error code 時重跑 |
| PA-03 | RC-05 | QA plan | DEV-108 補 ownership × provider matrix：板內 canonical、legacy ID、未歸位、tracking reference、跨板 task；Supabase／local-test至少覆蓋各自真實邊界 | QA plan／QA | static assertions 不能只檢查 source 字串，必須驗證 outcome與 network absence/presence |
| PA-04 | RC-05 | QC／release gate | known regression smoke 固定為 authenticated Supabase TEST＋production-bound inactive candidate；local-test只算 Layer 1，不得關閉 production-only風險 | Release gate／QC、Release owner | exact artifact、RLS/FK、unplaced detail、normal board regression、cleanup=0；每次 record/provider改動重跑 |
| PA-05 | RC-03 | Data integrity gate | 加入 `requested taskLinks === persisted resolved links` 或明確 rejected outcome 的 invariant；禁止 silent partial save | Checklist／QA | deterministic＋DB readback；任何 record upsert改動重跑 |
| PA-06 | RC-06 | Release traceability | DEV terminal state、Release Capsule included scope、artifact commit與 canonical production smoke完成後一次性回寫；`NOT RELEASED` 功能不得在 production artifact 出現而無例外紀錄 | Release gate／PM、Release owner | source/artifact/production identity一致；每次 routine release檢查 |
| PA-07 | RC-04 | User-facing error gate | visible-error sweep 禁止 Supabase table name、legacy ID、SQL/RLS內部訊息直接顯示；同時確認不是把真正錯誤吞成空白 | QA checklist／QA | visible alerts＋console/pageerror/network evidence；任何 provider error UI改動重跑 |

使用思考習慣：#效用理論、#多層次分析、#使用者視角

## 8. CA／PA 追溯矩陣

| 根因 | CA | PA | 效用判斷 | 驗證證據 | 建議流向 |
|---|---|---|---|---|---|
| RC-01 ownership guard缺失 | CA-01、CA-02 | PA-01、PA-03 | 高效益、低風險；直接阻止必敗 query，且不需 schema | network capture＋browser matrix | `dev_task`＋`QA plan` |
| RC-02 capability契約缺失 | CA-01、CA-02 | PA-01、PA-02 | 中等成本、高再發預防；避免同類缺陷擴散到其他共用功能 | type／contract matrix | `dev_task`＋Project SOP |
| RC-03 silent partial save | CA-03～CA-05 | PA-02、PA-05 | 高效益但資料修復高風險；先修新寫入，再唯讀盤點，修復需另授權 | Supabase TEST readback＋production audit | `dev_task`＋`QC report`；資料修復另走高風險 gate |
| RC-04 raw error policy | CA-02、CA-03 | PA-02、PA-07 | 低成本、中效益；改善可操作性但不能單獨當根因修復 | visible-error sweep | `QA plan`／checklist |
| RC-05 coverage逃逸 | CA-04 | PA-03、PA-04、PA-05 | 中成本、高漏檢降低；真實 provider 是必要變數 | TEST／candidate artifacts | `QA plan`＋`release gate` |
| RC-06 release狀態失真 | CA-06 | PA-06 | 低到中成本、高治理效益；防止錯誤 evidence scope | artifact provenance＋terminal writeback | `QC report`＋`release gate` |

## 9. 建議驗證計畫與成效門檻

### 9.1 Layer 1：Source／deterministic

- 未歸位 task 開啟明細時 loader outcome=`unsupported`，不得呼叫 `recordService.listByNode`。
- 正常板內 legacy／UUID task 仍呼叫 `listByNode(..., includeArchived:true)`。
- task A → unplaced task → task B 快速切換時，舊 request 不得覆蓋新 task，error／remote records 不殘留。
- requested link解析0% unresolved時完整成功；部分或100% unresolved時明確失敗；禁止silent partial save。
- tracking reference 以 canonicalTaskId 或明確 unsupported outcome處理，不可拿 placement ID查 WBS。

### 9.2 Layer 1 Browser

| Case | 操作 | 通過條件 |
|---|---|---|
| B01 | 非 meeting mode 開啟未歸位 task | 無會議空區、無 error、無 retry、無 task-scoped network query |
| B02 | meeting mode 開啟未歸位 task | 顯示可採取的歸位提示；不可 append、不可清空輸入造成假成功 |
| B03 | 將同 task 歸位後重開 | legacy identity 可解析，會議 loader 正常，原錯誤消失 |
| B04 | 正常板內 task 有 active／archived records | DEV-108既有 latest-3、archive、reload行為不退化 |
| B05 | 注入 transient provider failure | 顯示「載入失敗／重試」，重試成功後移除；不誤標 unsupported |
| B06 | 注入 unresolved requested link save | draft與既有 links保留，畫面不宣稱保存完成 |

### 9.3 Supabase TEST／Integration

- 使用 authenticated actor 建立 account-unplaced task 與正常 board task，驗證 RLS／FK／query邊界。
- 對正常 task 建立、更新、archive record並readback links；對未歸位 task驗證無錯誤 query與無partial write。
- 將未歸位 task經正式 placement transaction放入 board後，驗證 `legacy_node_id` continuity與 meeting read成功。
- fixture cleanup residual=0，所有 task-owned runtime與port釋放。

### 9.4 Production artifact／production-bound／post-deploy

- Lane：Medium。變更涉及遠端 query與record link contract，需 Layers 1-2、targeted Layer 3、production-bound
  inactive candidate、獨立 activation決策與 canonical post-deploy feature smoke。
- exact artifact必須綁定source commit／bundle hash；production不得載入不同bundle。
- candidate smoke使用可清理fixture：unplaced task開明細零raw error、正常task歷史正常、unresolved link不partial save。
- activation後只跑canonical smoke與readback，不在serving production做探索性資料修復。

### 9.5 Effectiveness threshold

CAPA 只有在以下全部成立後才可建議關閉：

1. B01～B06、Supabase TEST與required regressions全數PASS。
2. 新寫入中 `requested unresolved taskLinks > 0` 且保存成功的事件為0。
3. production可見 `Supabase WBS item not found for legacy node id` 為0；raw provider error sweep為0。
4. CA-04 impact audit完成；受影響資料由data owner決定「無需修復／已修復／不可唯一修復並有例外紀錄」。
5. release artifact、DEV terminal state與production canonical identity一致。
6. post-deploy T+0 smoke PASS；T+7抽查無同類錯誤或partial-link evidence。

任一新 record 在 requested task link 被略過後仍回傳成功、未歸位 task 再次觸發WBS not-found、或production
artifact與宣告commit不一致，立即判定 ineffective並重啟CAPA。

## 10. Routing Recommendation

- Suggested route：`dev_task`（CA-01～CA-03）＋`QA plan`（PA-03／PA-05／PA-07）＋`QC report`
  （CA-04／CA-06）＋`release gate`（PA-04／PA-06）。
- Reason：同時涉及產品邏輯、task-link資料完整性、真實Supabase邊界與正式artifact追溯，不能只修顯示文字。
- Required owner：PM、RD、QA、QC、Release owner、Data owner。
- Required evidence：source contract、browser network evidence、Supabase TEST readback、production唯讀impact audit、
  exact-artifact provenance、canonical post-deploy smoke。
- Human decision needed：只剩正式CAPA登錄、production唯讀impact audit／資料修復與release activation。
  Current-phase產品邊界已在本次RD-ready升級中固定，不再阻塞local implementation。

### DEV-110 registration（已登錄／本機實作完成／待QA）

- DEV ID：`DEV-110`；已寫入`ai-doc/dev_task.md`，為不計入交付完成的corrective開發點。
- Type：Bug fix／data-integrity guard／production regression prevention。
- Parent：DEV-108 follow-up；對DEV-039為narrow exception，與DEV-095 canonical identity相容。
- Scope：ownership-aware loader、source-board tracking read、same-board append、generic UI error、unresolved-link
  preflight／exact-set gate與targeted tests。
- Acceptance：以`SPEC-110`與`QA-DEV-110`為準；B01～B07＋T01～T06全部PASS，正常board task無回歸，
  無silent partial-link success。
- Stop conditions：需要schema支援unplaced record、production mutation、跨project自動relink，或preflight後
  fault injection證實不可補償partial state時停止並回PM。
- Local evidence：`scripts/verify-dev-110-unplaced-task-meeting-record-boundary.ts` 18/18、DEV-108 static 14/14、
  browser candidate B01～B04 PASS（`output/playwright/dev-110-unplaced-task-meeting-record-boundary/result.json`）、
  TypeScript、lint、build:test、`git diff --check`。
- Remaining evidence：Supabase TEST before/after readback、B05～B07、DEV-039／095／108完整回歸、runtime cleanup；
  artifact provenance屬後續release gate。
- Owner：PM→RD→QA→QC；release另交Release owner。

使用思考習慣：#效用理論、#當責、#可驗證性

## 11. 待人類決策

1. 是否將本草稿正式登錄為下一個CAPA；未決前不得引用 `CAPA-002` 指稱本案。
2. 是否授權production唯讀impact audit；目前local RD/QA不依賴此項。
3. 是否在impact audit證明需要且可唯一對應後，另行核准production資料修復；預設不修改正式資料。
4. 是否啟動release；local QA/QC PASS仍不等於deploy授權。

## 12. 結論

本案不是單純錯誤訊息美化。直接缺陷是未歸位task誤入板內會議紀錄查詢；更深層問題是task ownership
沒有成為record功能的明確capability契約，加上record write會靜默略過unresolved link。DEV-110／SPEC-110／
QA-DEV-110已把不需schema的fail-closed邊界、檔案責任、工作包、failure recovery、驗收與證據固定到
RD；本機候選實作已完成並通過 source/static gate。完成 local implementation 不代表 QA/QC、正式CAPA
effectiveness、production audit／資料修復與release完成；上述仍需各自授權與證據。
