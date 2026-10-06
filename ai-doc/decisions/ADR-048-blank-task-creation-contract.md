# ADR-048 空白任務建立契約與模式責任邊界

狀態：Accepted／Architecture Confirmed／Tech Lead Optimized／DEV-115 Implemented／NOT RELEASED

日期：2026-09-09

關聯：CAPA-002、DEV-115、SPEC-115、QA-DEV-115、DEV-039、DEV-070、DEV-111、DEV-114、ADR-043、ADR-046

## Context

ProJED 目前在 7 個檔案中有 11 個空白任務 construction points。它們最後多半共用 `addNode()`、
`prepareNewTaskNaming()` 與任務詳情，但在進入共同流程前，各自組裝 `TaskNode`。工作台專用
`createNewUnplacedTaskNode()` 因此能把預設 title 同時寫入 optional `description`，而其他入口不會。

系統未來會增加閱讀模式。若每個模式繼續擁有 canonical blank content defaults，同型問題會隨入口數量增加；
但各模式的 ID、workspace／board、parent、order、nodeType、permission 與 post-create interaction 確實不同，
不適合把完整新增流程收斂成單一 UI 元件。

快速收件、複製與匯入也可能合法攜帶任務說明。若把它們與 blank creation 混為一談，為了修正本缺陷而清空
所有 description，會造成真實使用者內容遺失。

使用思考習慣：#問對問題、#多層次分析、#系統描繪

## Decision

採用「shared blank-task domain factory + mode-owned placement／interaction + source-specific creation kinds」。

1. 建立唯一純函式 `createBlankTaskNode()`，作為所有空白新增的 canonical content authority。
2. factory input 由 caller 明確提供 `id`、`workspaceId`、`boardId`、`parentId`、`order` 與 `nodeType`；
   可接受 title／now 的受控 override，但不得接受或推導 `description`。
3. factory 以同一個 `now` 設定 `createdAt`／`updatedAt`，預設 title=`新任務`、status=`todo`；輸出不得
   擁有 own `description` property。實作不得直接 spread 未知 input 到 `TaskNode` output。
4. 各 mode／surface 繼續擁有特殊 ID、placement、排序、節點類型、權限檢查、`addNode()` 呼叫與
   post-create effect；factory 不讀 React state、DOM、current view、store、provider 或 navigation。
5. taskWorkbench 保留 unplaced ID、normalization、account-scoped persistence 與 placement transaction。
6. capture、clone、import、restore 分別保留 source-specific factory／mapper；只有明確來源契約可寫入
   description，禁止以 title 當不明來源 fallback。
7. 目前 11 個 blank construction points 以 manifest 驗證全數遷移。新增閱讀模式時，設計與 QA gate 必須
   登錄 blank creation adapter 與 post-create profile；不得新增未受控 direct constructor。
8. `addNode()` 與 ADR-043／SPEC-070 interaction kernel 不因本決策改寫；`TaskInteractionScope` 的
   unknown→list fail-closed migration仍由 DEV-070 相容範圍治理，不在 CAPA-002 correction 偷渡。

## Consequences

### Positive

- 「空白說明不得被預填」成為一個可由型別、pure test 與 source manifest 驗證的不變量。
- 新閱讀模式重用 domain contract，不需複製 canonical content defaults。
- 各模式仍可保留必要的 layout、placement、ID 與 post-create 差異，降低 mega component 耦合。
- source-derived creation 與 blank creation 分流，避免修正時誤刪 capture／clone／import 內容。
- DEV-111／114 hover 無需新增特殊字串排除；它只繼續顯示真實非空 description。

### Cost／risk

- 需要遷移 11 個 constructor，並建立 source manifest 防止新 bypass。
- factory input 若過寬，可能逐步吸收 permission／UI／provider；因此任何新增責任都須重進 ADR review。
- TypeScript excess-property check 不能攔住所有 spread／any；仍需 runtime output test 與 static source gate。
- 一次遷移可能改變特殊 ID、parent、order 或 nodeType；必須逐入口做相容 browser regression。

## Alternatives rejected

### A. 只刪除工作台的錯誤 assignment

拒絕作為完整 PA。它是必要且最小的 CA，但仍允許下一個模式重新複製 defaults 並發生同型漂移。

### B. 建立一個跨所有模式的「新增任務」React 元件

拒絕。各模式真正不同的是入口、placement、permission 與 post-create interaction；合併 UI 會把 domain
不變量與視圖差異綁在一起，未來新增模式反而更難維護。

### C. 在 TaskDetails／hover 層忽略字串「新任務」

拒絕。它只隱藏症狀，保留 persisted pollution，並會錯誤隱藏使用者有意輸入的合法內容。

### D. 所有建立來源都走同一 factory，description 一律空白

拒絕。快速收件、複製、匯入與 restore 有合法來源內容；一律清空會造成資料遺失與相容性破壞。

### E. 建立完整 command bus／schema discriminator 後再修正

拒絕作為目前 phase。現有 `TaskNode.description` optional contract 足以完成安全矯正；新增 schema 或大型
command framework 沒有對應的當前效用，且會延後停止新污染。

使用思考習慣：#效用理論、#限制條件、#模組化

## Compatibility and migration

- Current phase：修正工作台 assignment、建立 shared factory、遷移 11 點、補 QA/QC；不改 schema／API／權限。
- 現有 persisted tasks 不做自動 migration。先由 CAPA-002 CA-03 執行唯讀 dry-run；無可靠 provenance 的
  `description === title === '新任務'` 一律視為 ambiguous。
- SPEC-039：`Compatible correction`。未歸位任務建立／placement 功能不變，只補 blank content invariant。
- SPEC-070／ADR-043：`No conflict`。post-create policy 與 interaction ownership 不變。
- ADR-046：`No conflict`。canonical identity 與 placement projection boundary 不變。
- SPEC-111／114：`Compatible correction`。hover 仍只依真實非空 description 顯示，不新增字串例外。
- 若遷移必須更改 provider、schema、permission、TaskNode identity 或 interaction command，停止並重進架構審查。

## Governance

- 本 ADR 是 blank task creation responsibility 的 Architecture Memory Source。
- `ai-doc/specs/SPEC-115-blank-task-creation-contract.md` 是實作權威，固定 API、source baseline、11 點
  遷移矩陣、protected zones、驗收、drift 與 stop conditions。
- `ai-doc/qa/QA-DEV-115-blank-task-creation-contract.md` 是 QA authority；本輪 targeted QA 已執行，未完成 gate 仍不得宣稱 release PASS。
- CAPA-002 是根因、CA／PA、effectiveness 與 closure authority；DEV-115 是目前實作追蹤入口。
- 新增 blank constructor 必須更新 manifest、QA entry matrix 與直接入口 evidence。
- factory 可自行調整局部型別／命名，但不得接受 description、接管 mode state，或混入 source-derived creation。
- CAPA-002 關閉不代表 DEV-070 全部 migration 完成；new-mode registration gate 保留為下一模式再觸發控制。

## Architecture Closure Review

- Review date：2026-09-09。
- Source revision：branch `持續優化3`、HEAD `1b6450355ed81180c5abd419ac756564cff1b3c0`，另以
  SPEC-115 記錄 dirty working-tree file SHA-256；既有未提交變更屬 user-owned boundary。
- Reviewed：7 個 constructor files／11 點、`TaskNode` optional description、`addNode` persistence／undo／activity、
  TaskDetails readback、DEV-111／114 hover、SPEC-070／ADR-043 interaction 與 ADR-046 identity/placement。
- Fixed：factory path/API、creation-kind 分流、逐點責任、protected no-change zones、work package order、QA evidence、
  rollback/stop/drift 與實作模型裁量。
- Result：P0/P1 unresolved architecture blockers = 0；DEV-115 可進入本機 RD implementation。
- Drift rule：hash 差異先分為 unrelated／contract drift；不得為符合 baseline 回復 user-owned changes。只有差異
  改變 constructor count、creation-kind 或 ownership，或需更改 schema、permission、provider、interaction kernel
  與 source-derived content 時，才停止並重進 Architecture Closure Review。

## Tech Lead refinement（2026-09-09）

- 保留 shared factory 架構，不增加 registry、command bus、schema discriminator 或跨模式 UI component。
- 實作由五個串接工作包收斂為三個原子工作包：guard/factory、11 點 migration、verification/convergence。
- 11 點全覆蓋由 known manifest＋adapter mapping 證明；browser evidence 聚焦原始 persistence 缺陷與高風險代表入口，
  避免每個入口重複 reload/rename/hover 造成脆弱測試。
- 歷史資料 dry-run 留在 CAPA-002 獨立資料控制面，不作為 DEV-115 local implementation done 的 blocker。
- 此 refinement 降低流程與測試複雜度，未改變產品行為、factory responsibility 或 Architecture Closure 結論。

## Decision outcome

`Accepted / Architecture Confirmed / Tech Lead Optimized / DEV-115 Implemented / NOT RELEASED`。DEV-115 已依本 ADR
完成 shared blank-task factory 與 11 點遷移，並通過 static／browser targeted QA 與 QC；permission-denied、390×844、
正式 release、歷史 dry-run 與 CAPA effectiveness 仍由各自 gate 管理，未因本 ADR 自動放行。

## Implementation evidence（2026-09-10）

- `src/features/taskCreation/createBlankTaskNode.ts` 已成為唯一 blank content authority；input 以 `description?: never`
  阻擋誤帶說明，output 不建立 own `description`。
- 7 檔 11 個 blank construction points 已接入 factory；capture／clone／import／restore 分流維持不變。
- DEV-115 static 17/17、browser B01～B09 PASS；TypeScript、targeted ESLint、test build 與相容回歸均 PASS。
- 本次未修改 schema、provider、RLS、migration、permission、interaction kernel 或 production data；正式版本仍需另走 release gate。
