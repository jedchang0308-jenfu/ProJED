# [CAPA-002] 空白新增任務誤填說明與建立契約分歧

- CAPA ID：`CAPA-002`
- 顯示名稱：`[CAPA-002] 空白新增任務誤填說明與建立契約分歧`
- 建立日期：2026-09-09
- 狀態：`Open / Root Cause Confirmed / CA-01～02 + PA-01～03 Implemented / DEV-115 QA-QC Targeted PASS / Effectiveness Pending`
- CAPA 成熟度：`CA/PA Implemented；CA-03 historical dry-run pending`
- 建議嚴重度：P1（持久內容語意污染；未觀察到資料遺失或權限外洩）
- 事件環境：localhost 使用者畫面與目前工作樹 source audit
- 主要關聯：DEV-115、SPEC-115、QA-DEV-115、DEV-039、DEV-070、DEV-111、DEV-114、ADR-043、ADR-046、ADR-048
- Register authority：`ai-doc/reports/CAPA-Register.md`
- 本輪執行邊界：依 SPEC-115 完成 DEV-115 local implementation、targeted QA/QC 與文件回寫；不清理既有任務、不執行
  production data mutation，也不 commit、push、deploy 或 release。

## 0. 一般使用者版

### 發生什麼事

從「全域任務工作台 → 未歸位任務」新增空白任務時，系統除了把任務名稱預設為「新任務」，還把相同文字
寫進任務說明。任務詳情只是忠實顯示已儲存的 `description`，不是詳情編輯器自己產生文字。

### 為什麼只有這個入口出錯

各入口雖然最後都呼叫同一個 `addNode()`，並多半共用 `prepareNewTaskNaming()` 與任務詳情視窗，
但在呼叫 `addNode()` 之前，各自建立 `TaskNode` payload。工作台的專用建立函式多寫了一行
`description: trimmedTitle`；其他空白建立入口沒有這一行，因此只有此入口會污染任務說明。

### 長期怎麼修

不把所有新增按鈕做成一個大型 React 元件。各閱讀模式仍自行決定父層、排序、節點類型與畫面互動；
所有「空白新增任務」改走一個純函式 `createBlankTaskNode()`，統一名稱、狀態、時間與「不得預填說明」契約。
快速收件、複製與匯入有真實來源內容，維持各自的 source-specific factory，不混入空白建立契約。

## 1. 正式登錄證據

1. 使用者於 2026-09-09 明確要求 `[$dev-pm] 制定CAPA`，構成正式 CAPA 登錄授權。
2. 發號前已讀取 `ai-doc/reports/CAPA-Register.md`，確認已核發最大編號為 `CAPA-001`。
3. 已以專案全文與 Git 歷史查核 `CAPA-002`、`CAPA Register` 與日期型 legacy records；
   `CAPA-DRAFT-20260908-unplaced-task-meeting-record-boundary.md` 明確為未登錄草稿，不占用編號。
4. 依 Register 規則先新增 `CAPA-002` 列，再建立本主文件；下一可核發號碼已推進為 `CAPA-003`。

## 2. 不符合事實、影響與未知項

### 2.1 已確認事實

| ID | 已確認事實 | 證據 |
|---|---|---|
| F-01 | 工作台「新增未歸位任務」呼叫 `createNewUnplacedTaskNode('', ...)` | `src/components/TaskWorkbenchPanel.tsx:1079-1084` |
| F-02 | 該函式把空白名稱正規化為 `新任務` | `src/features/taskWorkbench/placement.ts:186-193` |
| F-03 | 同一函式把正規化後名稱寫入 `description` | `src/features/taskWorkbench/placement.ts:193-205` |
| F-04 | `TaskNode.description` 是 optional；空白任務不需要建立此欄位 | `src/types/index.ts:483-494` |
| F-05 | 其餘已盤點空白建立點沒有寫入 `description` | 7 個 source files、11 個直接建立點的 source audit |
| F-06 | 各入口共用的是後段 `addNode`／naming／detail flow，不是前段建立 payload | 各建立點與 `prepareNewTaskNaming()` call site |
| F-07 | 說明 hover 直接讀目前 store 的 `node.description`；它會放大但不製造污染 | `src/components/TaskDescriptionHoverCard.tsx:48-61` |
| F-08 | 快速收件轉任務有獨立語意：`item.note || item.title || ''` 是來源內容 | `src/features/taskWorkbench/placement.ts:167-184` |
| F-09 | 互動 kernel 已有 `task.post-create`，但目前 `mobile-post-create` 仍為 `shadow-resolve` | `src/interactions/task/migrationManifest.ts` |
| F-10 | 未知 view 目前會 fallback 成 `list`，與 SPEC-070 fail-closed 方向存在技術債 | `src/interactions/task/TaskInteractionScope.tsx`、`SPEC-070` |

### 2.2 建立點盤點

下表是 source construction points，不把共用元件在 Gantt／Calendar 的重複呈現另算成新的 constructor。

| # | 建立點 | 目前 description | CAPA 處置 |
|---|---|---|---|
| 1 | `TaskWorkbenchPanel` → `createNewUnplacedTaskNode` | 錯誤寫入名稱 | CA-01 立即移除；PA-01 遷移 factory |
| 2 | `BoardView` root | 未寫入 | PA-01 遷移 factory |
| 3 | `WbsListView` root | 未寫入 | PA-01 遷移 factory |
| 4 | `SharedTaskSidebar` root | 未寫入 | PA-01 遷移 factory |
| 5 | `SharedTaskSidebar` child | 未寫入 | PA-01 遷移 factory |
| 6 | `GlobalContextMenu` child | 未寫入 | PA-01 遷移 factory |
| 7 | `GlobalContextMenu` sibling | 未寫入 | PA-01 遷移 factory |
| 8 | `GlobalContextMenu` details child | 未寫入 | PA-01 遷移 factory |
| 9 | `taskDragCommit` sibling | 未寫入 | PA-01 遷移 factory |
| 10 | `taskDragCommit` child | 未寫入 | PA-01 遷移 factory |
| 11 | `MindMap` command | 未寫入 | PA-01 遷移 factory |

### 2.3 已確認影響

- 受影響入口建立的新任務會持久化不必要的任務說明，使用者開啟詳情時看到「新任務」。
- DEV-111／114 的任務說明 indicator 與 hover 會把污染值視為真實非空說明，造成額外提示與懸浮內容。
- 任務說明也是備份、會議變更與可能的搜尋／AI 投影資料，錯誤值可能向下游擴散。
- 沒有證據顯示其他十個空白 constructor 目前會寫入相同污染值。

### 2.4 未知與限制

| ID | 未知項 | 未取得證據前的限制 |
|---|---|---|
| U-01 | 歷史上有多少任務由受影響入口建立後仍保留 `description === '新任務'` | 不宣稱污染筆數，不做批次修改 |
| U-02 | 某筆 `description === title === '新任務'` 是否曾被使用者有意輸入 | 不以字串相等作為自動刪除依據 |
| U-03 | 目前正式環境是否已包含此工作樹缺陷 | 未核對 release artifact 前，不宣稱 production 已受影響或已修復 |

## 3. 問題定義與因果鏈

真正問題不是 modal placeholder，也不是 hover card 顯示錯字，而是「空白建立」沒有共同的內容不變量：
閱讀模式可自行組裝 canonical task content，導致某入口把 display default 誤當 authored description 持久化。

```text
多個閱讀模式各自組裝 TaskNode
  → 共用流程從 addNode() 之後才開始
  → 工作台專用 factory 同時設定 title 與 description
  → description 被當成使用者內容保存
  → TaskDetails、hover、backup／projection 正常讀出污染值
  → 使用者只在此入口看到「任務說明＝新任務」
```

## 4. 多層次根因分析

| ID | 層次 | 根因／控制缺陷 | 證據狀態 | 反事實檢查 |
|---|---|---|---|---|
| RC-01 | 直接程式原因 | `createNewUnplacedTaskNode()` 執行 `description: trimmedTitle` | Confirmed | 移除此 assignment，新建未歸位任務不再帶入說明 |
| RC-02 | 元件／資料流 | 「相同新增元件」只存在於後段 naming/detail 行為；前段 payload construction 並未共用 | Confirmed | 若所有入口先取得同一 blank payload，再進 `addNode()`，單點漂移消失 |
| RC-03 | Domain contract | 沒有 blank/capture/clone/import 的明確 creation kind 與 description invariant | Confirmed systemic root | 若 blank factory 不接受 description，編譯／測試會阻擋同型錯誤 |
| RC-04 | 驗證逃逸 | 現有測試重點在建立、定位、命名與詳情開啟，未把「description 為空且 reload 後仍空」列為跨入口契約 | Confirmed escape cause | 若 11 點 matrix 驗證 store＋reload＋hover，問題會在 release 前被攔下 |
| RC-05 | 未來模式風險 | 新閱讀模式可新增 constructor；互動 scope 尚有 unknown→list fallback，模式註冊不是 fail-closed | Confirmed adjacent debt | 新模式 registration gate 可避免默默繼承錯誤預設；但不作為本事件直接根因 |

### 根因結論

主要系統性根因是：`canonical task 的空白建立內容沒有單一 domain factory 與可執行不變量，模式層因此能把
顯示預設值誤存成使用者說明。` RC-01 是直接觸發，RC-02／RC-03 是系統根因，RC-04 是驗證逃逸；
RC-05 是未來閱讀模式擴張時的相鄰風險，不拿來誇大本事件範圍。

使用思考習慣：#多層次分析、#變數控制、#系統描繪

## 5. Immediate Containment

| ID | 措施 | Owner | 證據／完成條件 |
|---|---|---|---|
| CT-01 | 在修正完成前，把工作台空白新增列為已知缺陷；需要時由使用者逐筆清空不正確說明 | PM／Support | 已知問題與操作指引；不得批次刪除 |
| CT-02 | 凍結「只改 modal placeholder／只隱藏 hover」方案，因為它不會修正已儲存資料 | PM／RD | DEV-115 與本 CAPA 明列 source-of-truth 修正 |
| CT-03 | 保留既有資料；U-01／U-02 未釐清前不做 production mutation | Data owner／QC | 0 mutation evidence |

## 6. 矯正措施（CA）

| ID | 對應根因 | 措施 | Owner | 驗證證據 | Stop condition |
|---|---|---|---|---|---|
| CA-01 | RC-01 | `[完成]` 在 `createNewUnplacedTaskNode()` 移除 `description` 欄位，不以 `''` 建立第二種空值表示 | RD | static 17/17；browser B01 store／reload／detail blank | 若 normalize 或 persistence 會自動回填，停止並追到真正寫入點 |
| CA-02 | RC-04 | `[完成]` 補受影響入口 browser regression：新增、開詳情、關閉重開／reload、改名與 hover | QA／QC | browser B01～B09 PASS；detail editor 空白；rename 不同步；1000ms hover 不出現 | 任一層只驗 DOM placeholder、不驗 store/readback 時不得 PASS |
| CA-03 | U-01、U-02 | 先做唯讀 dry-run 盤點；只列候選、來源可追溯性與 ambiguity，不自動清理 | QC／Data owner | timestamped report、query/source identity、0 mutation、候選分類 | 缺少可靠 creation provenance 或使用者內容可能性時，不得自動修復 |

使用思考習慣：#效用理論、#限制條件、#可驗證性

## 7. 預防措施（PA）

| ID | 對應根因 | 系統控制點 | 措施 | Owner | 驗證／再觸發 |
|---|---|---|---|---|---|
| PA-01 | RC-02、RC-03 | Domain creation | `[完成]` 建立純函式 `createBlankTaskNode()`；caller 傳 identity／workspace／board／parent／order／nodeType，factory 統一 title/status/time，型別不接受 description | RD | 11 個 constructor 全數遷移；direct-constructor guard=0 bypass；static 17/17 |
| PA-02 | RC-03 | Creation-kind boundary | `[完成]` `capture`、`clone`、`import` 維持獨立 factory；只有它們可依來源明確寫入 description | RD／QA | quick-capture note 保留；clone/import/backup regression PASS |
| PA-03 | RC-04 | QA contract | `[完成]` 以 pure factory、11-point known manifest、adapter mapping 與風險導向 browser readback 分層驗證，不只驗按鈕有建立 task | QA／QC | DEV-115 static 17/17；browser B01～B09 PASS；相容 regression PASS |
| PA-04 | RC-05 | New-mode registration | 新閱讀模式必須明確登錄 task creation adapter 與 post-create profile；不得以 unknown→list 當完成狀態 | PM／RD Tech Lead | 新模式設計審查 checklist；若要移除 fallback，另依 DEV-070 做相容遷移 |

### 架構決策（ADR-048 Accepted）

- Architecture Memory Source：`ai-doc/decisions/ADR-048-blank-task-creation-contract.md`。
- Implementation authority：`ai-doc/specs/SPEC-115-blank-task-creation-contract.md`。
- QA authority：`ai-doc/qa/QA-DEV-115-blank-task-creation-contract.md`。
- 共用的是 domain creation contract，不是整個新增任務 UI；不建立跨模式 mega component。
- `createBlankTaskNode()` 不接受 `description`，也不推斷 placement、permission、UI focus 或 navigation。
- 模式／surface 仍擁有 parent、order、nodeType、特殊 ID 與「建立後做什麼」；factory 只擁有 canonical blank content defaults。
- 現有 `addNode()` 保留 persistence／undo／activity 邊界；現有 `task.post-create` kernel 保留互動策略邊界。
- 工作台專用 normalization、unplaced ID 與遠端同步仍由 taskWorkbench 模組負責。
- 快速收件、複製、匯入不可為了共用率被塞進 blank factory。
- `TaskInteractionScope` fail-closed 是 DEV-070 相鄰技術債；本 CAPA 只建立 new-mode registration gate，
  不在修 description 時順手改互動 kernel。

### Architecture Closure Update（2026-09-09）

- 已對 branch `持續優化3`、HEAD `1b6450355ed81180c5abd419ac756564cff1b3c0` 與 dirty working-tree
  file hashes 完成 source baseline；既有未提交變更是 user-owned boundary。
- 已固定 `src/features/taskCreation/createBlankTaskNode.ts` 的 API、7 檔 11 點遷移矩陣、creation kinds、
  protected no-change zones、failure/recovery、work packages、驗收命令與 evidence provenance。
- 已建立 Medium lane QA 計畫與 targeted independent QC contract；本輪已完成 DEV-115 targeted QA/QC，未完成 release gate 另行保留。
- P0／P1 unresolved architecture blocker = 0；DEV-115 已依 SPEC-115 完成本機實作，未完成 release gate 另行保留。
- source ownership、constructor count、schema／permission／provider／interaction 或 source-derived content 若漂移，
  必須停止並重進 Architecture Closure Review。

使用思考習慣：#效用理論、#模組化、#限制條件

## 8. CA／PA 追溯矩陣

| 根因／風險 | CA | PA | 開發承接 | 驗證證據 | CAPA 結案條件 |
|---|---|---|---|---|---|
| RC-01 錯誤 assignment | CA-01 | PA-01 | DEV-115 WP-115-1／2 | pure＋工作台 store/reload | 工作台新任務 description absent |
| RC-02 payload 分散 | CA-01 | PA-01 | DEV-115 WP-115-2 | 11-point known manifest＋repo heuristic | 11/11 已知點走 shared factory；無未分類候選 |
| RC-03 creation kind 未分流 | CA-01 | PA-01、PA-02 | DEV-115 WP-115-1／2 | type/static＋source-derived regression | blank 不寫說明；有來源流程不遺失內容 |
| RC-04 驗證逃逸 | CA-02 | PA-03 | DEV-115 WP-115-3 | layered QA＋targeted browser／QC | 原始缺陷完整 readback；代表入口相容 PASS |
| 歷史污染未知 | CA-03 | PA-03 | CAPA-002 historical-data capsule | dry-run、0 mutation | 已完成分類；任何修復另經授權 |
| RC-05 新模式相鄰風險 | 無立即產品 CA | PA-04 | DEV-070 相容 gate／project checklist | new-mode review evidence | 不阻擋本 CAPA；下個新模式必套 gate |

## 9. DEV-115 實作工作包

1. `WP-115-1 Guard + factory`：分類 source drift，建立 known manifest／repo heuristic、failing guard 與純 factory。
2. `WP-115-2 Atomic migration`：同一 candidate 遷移 7 檔 11 點；保留 caller-owned ID、placement、permission、
   nodeType 與 post-create，capture/clone/import/restore 維持分流。
3. `WP-115-3 Verification + convergence`：凍結 candidate，執行 QA-DEV-115 layered QA、targeted independent QC
   與文件回寫；未經 release gate 不上線。

不得只完成工作台 hotfix 就宣稱 PA-01 或 DEV-115 完成。CA-03 歷史 dry-run 是 CAPA-002 獨立資料工作，
不綁在 DEV-115 產品 implementation；缺可靠 provenance 時只保留 ambiguity report，不阻擋停止新污染。

## 9.1 DEV-115 實作與驗證回寫（2026-09-10）

- `WP-115-1`：`createBlankTaskNode()` 已建立；pure／type／source guard PASS 17/17。
- `WP-115-2`：7 檔 11 個 blank construction points 已遷移；caller-owned identity、placement、permission、nodeType、
  order 與 post-create 行為保留；capture／clone／import／restore 未接入 blank factory。
- `WP-115-3`：browser artifact `output/playwright/dev-115-blank-task-creation/result.json` PASS（B01～B09；1440×900；
  owner actor；0 browser/page/HTTP failure）；TypeScript、targeted ESLint、build 與相容 regression PASS。
- Targeted QC 已核對 B01 persisted readback、S01 manifest、非工作台 adapter、source-content mapping 與 artifact identity；
  結果見 `ai-doc/qc/QC-DEV-115-blank-task-creation-contract.md`。
- 本次沒有修改 schema、provider、RLS、migration、permission、production data；CAPA-002 仍不得視為已結案。

## 10. 驗收與 effectiveness

### 10.1 Implementation acceptance

- [x] 工作台新增空白任務：title 為「新任務」，`description` absent；詳情任務說明空白。
- [x] 關閉詳情、重新開啟與 reload 後仍空白。
- [x] 將名稱改為其他文字，不會同步寫入 description。
- [x] 空白說明不顯示 indicator，fine pointer 停留 1000ms 不開說明 hover。
- [x] 11 個已知 blank construction points 全數使用 shared factory；repo heuristic 沒有未分類候選。
- [x] 快速收件有 note 時仍把 note 帶入；沒有 note 時依既有 capture 契約處理，不受 blank factory 誤傷。
- [x] clone／import／backup round-trip 與既有 task placement、permission、undo、activity、post-create 行為無回歸（targeted regression）。
- [ ] 1440×900、390×844：本次完成 1440×900；390×844／permission-denied 保留 release/QC gate；本期沒有 layout/CSS 變更。
- [x] TypeScript、targeted lint、test build、DEV-111／114 與 DEV-039 targeted regression PASS。

### 10.2 Effectiveness checks

| Gate | 時點 | 指標 | PASS 門檻 | Owner |
|---|---|---|---|---|
| E-01 | candidate | blank factory、11 點 known manifest、原始入口 persisted readback | factory absent；11/11 已知點接 factory；工作台 reload 與 source-derived regression PASS | QA |
| E-02 | release 後 | 正式環境工作台＋代表性跨模式 authenticated smoke | 新任務 detail/reload 空白；無 hover；visible/console error=0 | QC／Release owner |
| E-03 | release 後 7 日 | 新增資料的唯讀 exact-sentinel audit | 系統性自動回填 0；非零候選逐筆分類，不自動刪除 | Data owner／QC |
| E-04 | 下一個閱讀模式變更 | creation adapter／post-create profile registration | 設計與 QA checklist 有明確 evidence；無 silent fallback | PM／RD Tech Lead |

### 10.3 結案條件

CAPA-002 只有在 CA-01～03、PA-01～03、E-01～03 都有可重現證據，且獨立 QC 判定 PASS 後才可關閉。
PA-04 是下一個閱讀模式的再觸發控制；若尚未發生新模式，不阻擋結案，但須保留在 project checklist。

## 11. 排除範圍與變更管制

- 不自動刪除所有 `description === '新任務'`；字串相等不是可靠 provenance。
- 不把 modal、hover 或 indicator 改成忽略「新任務」字串；那會隱藏真實使用者內容。
- 不改 schema、migration、RLS、provider、權限或正式資料。
- 不把所有新增按鈕、mode layout、placement/order 邏輯合併成單一 UI 元件。
- 不在本 CAPA 直接移除 `TaskInteractionScope` fallback 或一次完成 DEV-070 migration。
- 若 CA-03 證明需要歷史資料修復，須另立 data-repair capsule，包含 dry-run、核准、逐筆 readback 與 rollback。

## 12. 責任與交付邊界

| 角色 | 當責 |
|---|---|
| PM | 維護 CAPA-002、DEV-115、scope、狀態與 closure gate；不得把文件完成算成產品修復 |
| RD | 實作 CA-01、PA-01／02；保留資料與互動邊界 |
| QA | 以 pure／manifest／adapter／browser 分層驗證；11 點 source 全覆蓋、UI 聚焦原始缺陷與高風險代表入口 |
| QC | 獨立核對 source、store、reload、hover、正式 smoke 與 dry-run evidence |
| Data owner | 核准任何歷史資料查詢或修復；本文件不構成 production mutation 授權 |
| Release owner | 只有在 QA/QC 與 release gate 通過後才可部署，並回寫 artifact identity |

## 13. 目前判定

- Root cause：`Confirmed`
- CA／PA 設計：`CA-01～02、PA-01～03 Implemented；CA-03 historical dry-run pending`
- DEV-115 開發文件：`Implemented / QA PASS / Targeted QC PASS / NOT RELEASED`
- 產品修正：`Implemented locally；未部署`
- 歷史資料影響：`Unknown / No mutation authorized`
- QA／QC：`DEV-115 targeted QA PASS / Targeted QC PASS；permission-denied／390×844 pending`
- Release：`Not Authorized / Not Released`
- Effectiveness：`Pending`
- CAPA status：`Open`

## 14. 變更紀錄

- 2026-09-09：依使用者正式 CAPA 指令核發 CAPA-002；完成 facts、11-point inventory、五層根因、
  CA／PA、ADR-048 架構決策、traceability、DEV-115 工作包、effectiveness 與 closure gate。產品程式未修改。
- 2026-09-09：完成 SPEC-115、QA-DEV-115、source/hash baseline 與 Architecture Closure Review；DEV-115 升級為
  `RD Implementation Ready / 架構已定案`。產品程式、QA/QC、歷史資料與 release 仍未執行。
- 2026-09-09：RD Tech Lead 優化執行契約：五個工作包收斂為三個原子工作包；11 點以 known manifest／
  adapter gate 全覆蓋，browser 改為風險導向；歷史 dry-run 移回 CAPA-002 獨立控制面。CAPA scope 與狀態不變。
- 2026-09-10：DEV-115 完成 local correction：CA-01～02、PA-01～03 實作，7 檔 11 點接入 blank factory；static 17/17、
  browser B01～B09、相容 regression、TypeScript、lint、build 與 diff gate PASS。CAPA 維持 Open，CA-03 歷史 dry-run、
  permission-denied／390×844、正式 release 與 E-02／E-03 effectiveness 尚待各自授權與驗證。
