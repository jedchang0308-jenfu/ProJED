# SPEC-115：空白任務建立契約與跨模式 constructor 收斂

- 日期：2026-09-09
- 狀態：`Implemented / QA PASS / Targeted QC PASS / Tech Lead Optimized / NOT RELEASED`
- 對應 DEV：DEV-115
- 對應 CAPA：CAPA-002
- Architecture Memory Source：`ai-doc/decisions/ADR-048-blank-task-creation-contract.md`
- QA authority：`ai-doc/qa/QA-DEV-115-blank-task-creation-contract.md`
- 風險：Medium
- Architecture Closure Review：2026-09-09 完成；P0／P1 unresolved architecture blocker = 0

## 1. 目標與非目標

### 1.1 目標

1. 修正工作台空白新增把顯示預設名稱 `新任務` 寫入 `description` 的持久內容污染。
2. 讓 7 個 constructor 檔案中的 11 個 blank-create points 共用一個純 domain factory。
3. 將「空白說明不得被預填」固定為型別、runtime、source manifest 與 browser readback 都可驗證的不變量。
4. 保留各閱讀模式的 ID、scope、placement、permission、node type 與 post-create 行為，支援未來新增模式。

### 1.2 非目標

- 不建立跨模式 mega React component，也不統一各模式新增按鈕與版面。
- 不改 `TaskNode` schema、provider、RLS、API、migration 或 production data。
- 不把 capture、clone、import、restore 接到 blank factory，也不清空它們的來源內容。
- 不改 `addNode()` persistence／undo／activity ownership，亦不改 ADR-043／SPEC-070 interaction kernel。
- 不以 UI 隱藏 `新任務` 字串代替 source-of-truth 修正。
- 不自動清理歷史 `description === title === '新任務'` 候選。

## 2. Source revision 與 Architecture Closure Baseline

- Repository：`C:\VIBE CODING\ProJED\ProJED`
- Branch：`持續優化3`
- HEAD：`1b6450355ed81180c5abd419ac756564cff1b3c0`
- Baseline kind：`HEAD + dirty working-tree file SHA-256`
- 注意：工作樹含 DEV-098／111／113／114 等既有未提交變更；它們不是 DEV-115 可回復或覆寫的內容。

| Baseline file | SHA-256 |
|---|---|
| `src/features/taskWorkbench/placement.ts` | `5EB32BC164BE52D0A86C66975768DDA491A82810F1D28C47B87B7EB0F49CEE29` |
| `src/components/TaskWorkbenchPanel.tsx` | `DC90A691E561EF2567145CA53E5B581E81F446DEC483143DDE1A0DBB66938B57` |
| `src/components/BoardView.tsx` | `B45324732B0DEBFCDE34EC70AC142F36B8916C131917143B44383B4155F6394C` |
| `src/components/Wbs/WbsListView.tsx` | `5722364F02DB3DE9F80DA49B21BCCA587337FBBF45CD42C658DFB58AA68FD434` |
| `src/components/SharedTaskSidebar.tsx` | `090B3ED3F1E7FF8641F1279C33E0001EF63CB4F362BEFFC3C4A4B50456617435` |
| `src/components/GlobalContextMenu.tsx` | `8559C7FDEE101B6BB0A245438665CA3288700013A2B94FBCDD6E076DF202897E` |
| `src/components/Wbs/taskDrag/taskDragCommit.ts` | `9A2A03D6DA3EB3F467293F219A5D12A7DEDF2BA2CCE8C6AC35CE5B6C682FDE6F` |
| `src/components/MindMap/mindMapTaskCommands.ts` | `F7B7FEDDE2866B827094F7C4AF46EBA8154A29CA75CC34456B383CB9ABA5FED6` |
| `src/types/index.ts` | `F4EC8635A0937DC3FB509844E2D775E59F9E6D7ADC3A5CA6D2EFE6758C0DDB78` |
| `src/store/useWbsStore.ts` | `206C311946B6EA10644DEBD75EF761373859B4947FB284C772F3EC6BEC8649F2` |
| `src/interactions/task/TaskInteractionScope.tsx` | `74CCEABF68614350D6CCE4A1250B2C81AD2B18531BBC323EDFAF181F16586AEE` |
| `src/interactions/task/migrationManifest.ts` | `BEFFC556E6840C5BF645D47A1E36FB76D55AE37835769D378C2D6B4679DC1747` |

實作模型進場時重算上述 hashes，先把差異分類為 `unrelated drift` 或 `contract drift`。hash 不同本身不是 blocker；
若差異不影響本 SPEC 的 constructor count、creation kind、欄位 mapping 或 ownership，記錄後依目前 source 實作。
只有 `contract drift` 才停止並回送規劃模型。不得用舊行號硬套 patch，也不得為符合 hash 回復 user-owned 變更。

## 3. 現況事實與問題鏈

- `TaskNode.description` 是 optional，blank creation 不需要 own property。
- 工作台入口呼叫 `createNewUnplacedTaskNode('', ...)`；helper 把 title fallback 成 `新任務` 後，又執行
  `description: trimmedTitle`。
- `TaskDetailsModal` 的預設「任務說明」note 以 `node.description || ''` 顯示；它是 readback，不是污染來源。
- `TaskDescriptionHoverCard` 只讀非空 description；它會放大已儲存污染，但不是 writer。
- 其他十個 blank constructors 目前未寫 description，卻各自重複 title/status/time defaults，形成未來漂移面。
- `addNode()` 才開始共用 persistence、undo 與 activity；因此「同一新增元件」只成立於後段流程。

```text
Mode / surface adapter
  ├─ owns permission, id, scope, parent, order, nodeType
  └─ createBlankTaskNode(explicit input)
       └─ owns canonical blank content defaults; description is impossible
            └─ caller addNode()
                 └─ existing persistence / undo / activity
                      └─ existing mode-owned naming / navigation / focus
```

## 4. Creation-kind contract

| Kind | 是否使用 blank factory | description authority | 本期處置 |
|---|---|---|---|
| `blank` | 是，唯一合法入口 | 不得存在 own property | 11 點全數遷移 |
| `capture` | 否 | 明確來源 note／title 的既有 mapper | 保留 `createUnplacedTaskNodeFromInboxItem` 行為 |
| `clone` | 否 | source task copy contract | 只做相容 regression |
| `import` | 否 | import payload／backup contract | 只做相容 regression |
| `restore` | 否 | persisted archived task | 不重建內容，只做相容 regression |

「blank」指使用者從空白入口建立、沒有外部內容來源的任務。不得為提高共用率，將 source-derived kinds
包成 blank factory 的 optional description 參數。

## 5. 權威 factory API

### 5.1 檔案與 export

- 新增：`src/features/taskCreation/createBlankTaskNode.ts`
- Named export：`createBlankTaskNode`
- Named type export：`CreateBlankTaskNodeInput`
- 此檔不得 import React、store、provider、router、DOM 或閱讀模式元件。

```ts
import type { TaskNode } from '../../types';

export interface CreateBlankTaskNodeInput {
  id: string;
  workspaceId: string;
  boardId: string;
  parentId: string | null;
  order: number;
  nodeType: NonNullable<TaskNode['nodeType']>;
  title?: string;
  now?: number;
  description?: never;
}

export const createBlankTaskNode = (
  input: CreateBlankTaskNodeInput,
): TaskNode => {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    boardId: input.boardId,
    parentId: input.parentId,
    title: input.title?.trim() || '新任務',
    status: 'todo',
    nodeType: input.nodeType,
    order: input.order,
    createdAt: now,
    updatedAt: now,
  };
};
```

### 5.2 不變量

1. `Object.hasOwn(result, 'description') === false`；禁止以 `description: ''` 建立第二種空值表示。
2. `createdAt === updatedAt === (input.now ?? captured Date.now())`。
3. title trim 後為空才 fallback `新任務`；factory 不把 title 派生到其他 content field。
4. output 明確挑選欄位，不得 spread `input`、`any` 或任意 extension object。
5. factory 不做 permission check、ID generation、placement calculation、mutation、persistence 或 post-create effect。
6. `nodeType` 必須由 caller 明確提供；factory 不依 `parentId` 推斷 group/task。

## 6. 11 點遷移矩陣

| # | Adapter／目前位置 | Caller 保留的 input／行為 | 遷移要求 |
|---|---|---|---|
| 1 | `placement.ts:createNewUnplacedTaskNode` | unplaced ID、workspace、pseudo board、root、order、normalize | 保留 public signature 與 normalization；以 factory 取代 payload，移除錯誤 description |
| 2 | `BoardView:handleAddColumn` | local ID、active scope、root、next root order、`group`、naming | payload 改呼叫 factory；其餘不動 |
| 3 | `WbsListView:handleCreateRootNode` | local ID、active scope、root、root count、`group`、naming | payload 改呼叫 factory；其餘不動 |
| 4 | `SharedTaskSidebar:handleAddList` | local ID、active scope、root、flattened length、`group`、naming | payload 改呼叫 factory；Gantt／Calendar 共用呈現不另造 constructor |
| 5 | `SharedTaskSidebar:handleAddChild` | local ID、item parent、order 999、`task`、expand、naming | payload 改呼叫 factory；保留 collapse 行為 |
| 6 | `GlobalContextMenu:handleAddChild` | selected scope、child count、`task`、reopen、close、naming | payload 改呼叫 factory；保留 context ownership |
| 7 | `GlobalContextMenu:handleAddSibling` | sibling scope/order、root nodeType inheritance、reopen、close、naming | payload 改呼叫 factory；不得改 order 算法 |
| 8 | `GlobalContextMenu:onCreateChild`（details） | parent scope、child count、`task`、pending title、details navigation | payload 改呼叫 factory；不得改 return focus placement |
| 9 | `taskDragCommit:add-sibling` | dependency ID、fallback scope、sibling order、nodeType、permission、naming | payload 改呼叫 factory；保留 commit result |
| 10 | `taskDragCommit:add-child` | dependency ID、fallback scope、append order、`task`、permission、naming | payload 改呼叫 factory；保留 commit result |
| 11 | `createMindMapTaskNode` | MindMap ID、scope、parent、order、title/now override、public adapter | adapter 內呼叫 factory；保留 export、ID 與 `DEFAULT_MINDMAP_TASK_TITLE` |

`TaskWorkbenchPanel.tsx` 是 #1 的 UI caller，不是第 12 個 constructor；若 helper signature 不變，原則上不修改它。

## 7. 檔案責任與變更表面

### 7.1 必須新增／修改

| 檔案 | 動作 | 唯一責任 |
|---|---|---|
| `src/features/taskCreation/createBlankTaskNode.ts` | 新增 | blank payload authority |
| 上表 7 個 constructor 檔案 | 修改 | 將 11 點改接 shared factory，保留 caller-owned 行為 |
| `scripts/verify-dev-115-blank-task-creation.ts` | 新增 | pure、known-constructor manifest、repo heuristic 與 protected creation-kind gate |
| `scripts/verify-dev-115-blank-task-creation-browser.pw.js` | 新增 | 原始缺陷完整 readback＋代表性 mode adapter smoke |
| `package.json` | 修改 | 新增兩個 DEV-115 verifier scripts |
| DEV-115／SPEC／QA／CAPA 文件 | 回寫 | candidate、QA/QC、closure evidence；不得先填 PASS |

### 7.2 Protected no-change zones

- `src/types/index.ts`：`TaskNode` schema 不變。
- `src/store/useWbsStore.ts`：`addNode()` persistence／undo／activity contract 不變。
- `src/components/TaskDetailsModal.tsx`、`TaskDetailNoteEditor.tsx`：不以顯示層隱藏污染。
- `src/components/TaskDescriptionHoverCard.tsx` 與 DEV-111／114 trigger surfaces：hover 契約不變。
- `src/interactions/task/TaskInteractionScope.tsx`、`migrationManifest.ts`：不改 post-create kernel／fallback。
- provider、services、Supabase、schema、migration、RLS、hosting、release configuration：全部不變。

若 compiler 只需移除已無用的 `TaskNode` type import，可在 constructor 檔案內做最小 import cleanup；不得順手格式化
整檔或清理相鄰技術債。

## 8. Data、API、permission、state 與 failure contract

- Data shape：`TaskNode` 不變；blank output 省略 optional description，JSON／provider payload 因而不含該欄位。
- API／backend：不新增 endpoint、table、column、migration、RLS 或 provider method。
- Permission：各 caller 的既有 `canCreateTask` guard 必須在 factory／`addNode` 前保持原位置與語意。
- State：`status='todo'`、caller-defined parent/order/nodeType 不變；工作台 normalization 與 pseudo board 不變。
- Persistence：`addNode` 仍是 store、persistence、undo、activity 的 authority；DEV-115 不包裝或替換它。
- Failure：factory 為同步純函式，不新增 loading/error UI；`addNode` 後的 remote failure 保留既有處理。
- Recovery：第一個 compile/source/browser failure 即停止 done 宣告並 fix forward；只修改 DEV-115 擁有的 diff，
  不回復 user-owned working-tree 內容。若無法在既定 contract 內收斂，保留失敗 evidence 並回送架構重審。
- Historical data：只允許另行授權的唯讀 dry-run；任何 mutation 必須另立 data-repair capsule。

## 9. 實作順序與 work packages

1. `WP-115-1 Guard + factory`：重算／分類 source drift，建立 11-entry known manifest、repo heuristic 與會抓到
   目前 #1 問題的 failing guard，再新增權威 factory 與 pure cases。
2. `WP-115-2 Atomic migration`：在同一 candidate 內按 #1→#11 遷移；每點保留 ID、scope、order、nodeType、
   permission 與 post-create。不得留下「工作台已修、其他入口仍直建」的暫時完成狀態。
3. `WP-115-3 Verification + convergence`：凍結 candidate，依 QA-DEV-115 執行 layered QA、targeted QC 與文件回寫。

歷史資料 dry-run 留在 CAPA-002 的獨立資料控制面，不阻擋 DEV-115 產品修正；任何 mutation 仍須另行授權。

## 10. 驗收標準

- [x] factory 對 default、whitespace title、explicit title／now 都產生正確 payload，且 own description 永遠 absent。
- [x] input type 明列 `description?: never`；production call sites 通過 TypeScript；runtime test 防止 spread／`any` leak。
- [x] 11/11 known manifest entries 走 shared factory；repo heuristic 沒有未分類 blank-constructor candidate。
- [x] 工作台正常入口建立後，detail 的 `[data-task-detail-note-content-input="true"]` 空白；close/reopen/reload 仍空白。
- [x] rename title 不會改 description；blank task 沒有 indicator，fine pointer dwell 1000ms 不顯示 hover card。
- [x] 11 點由 source/adapter gate 證明 mapping 相容；Board、List、Shared sidebar、context menu、mobile rail、
  MindMap 依 QA-DEV-115 的代表性 browser matrix 通過，不重複完整生命週期。
- [ ] 代表性 desktop/mobile permission-denied path 不建立 task；本次未執行獨立 permission-denied browser fixture，保留為 release/QC gate。
- [x] capture note/title fallback、duplicate、import／backup、restore 的既有 description 語意不變（相容 regression）。
- [ ] 1440×900、390×844 通過；本次 DEV-115 browser 使用 1440×900；390×844 保留為未改 layout 的後續 release gate。
- [x] TypeScript、targeted ESLint、`build:test` 與 QA-DEV-115 指定回歸全部 PASS。

## 11. Verification commands 與 evidence

實作後 package scripts 必須固定為：

1. `npm run verify:dev-115-blank-task-creation`
2. `npm run verify:dev-115-blank-task-creation-browser`
3. `npm run verify:dev-039-task-workbench-placement-lanes`
4. `npm run verify:dev-111-task-description-hover-card`
5. `npm run verify:dev-114-task-description-global-surfaces`
6. `npm run verify:dev-028-cross-mode-task-interactions`
7. `npm run verify:dev-098-task-detail-subtasks-pure`
8. `npm run verify:dev-013-task-duplicate`
9. `npm run verify:dev-047-backup-package-contract`
10. `npx tsc --noEmit`
11. 對 7 個 constructor 檔案、新 factory 與 verifier 執行 targeted ESLint
12. `npm run build:test`
13. `git diff --check`

Browser artifact 固定於 `output/playwright/dev-115-blank-task-creation/result.json`，另存必要 screenshots；每一 case
記錄 route、actor、viewport、entry ID、created task ID、store description own-property、reload readback、可見錯誤、
console/page errors、unexpected HTTP failures 與 candidate hash。

實際 evidence（working-tree candidate，2026-09-09／10）：

- `npm run verify:dev-115-blank-task-creation`：PASS，17/17 assertions；7 檔 manifest 合計 11/11。
- `npm run verify:dev-115-blank-task-creation-browser`：PASS，B01（create/detail/reload/rename/hover negative）＋B02～B06
  代表性入口與 B07～B09 error sweep 全數 PASS；1440×900、owner actor、0 browser/page/HTTP failure；artifact 已落盤。
- 相容 static：DEV-039 33/33、DEV-111 38/38、DEV-114 27/27、DEV-028 48/48、DEV-098 10/10、DEV-013 PASS、
  DEV-047 30/30。
- Engineering gates：`npx tsc --noEmit`、受影響檔案 targeted ESLint（0 error；18 warnings，皆為既有 warning）、
  `npm run build:test`、`git diff --check` 均 PASS。
- Runtime：重用既有 matching `http://localhost:4000/`；listener PID `28532`、wrapper PID `3264`，未停止非本任務 runtime。
- Candidate factory SHA-256：`src/features/taskCreation/createBlankTaskNode.ts` =
  `8D81A098BF45C8C915277E69893119F591233F07926D5464BA5CCAB7E8A064A3`；其餘 7 個遷移檔 hash 以 QC report 記錄。

## 12. 實作模型裁量與禁止變更

### 12.1 可自行決定

- factory 測試 helper 的局部命名、assert library 與 manifest 資料結構。
- import 排序與移除已無用 `TaskNode` type import。
- browser fixture 的唯一字串與 artifact 內部欄位，只要保留 QA 所需 provenance。

### 12.2 不得自行改變

- factory path、export purpose、input responsibility、`description?: never` 與 output absent invariant。
- 11 點範圍、mode-owned ID／placement／permission／post-create 邊界。
- capture／clone／import／restore 分流與既有來源內容語意。
- `TaskNode`、`addNode`、interaction kernel、schema／provider／RLS／migration、歷史資料與 release 邊界。
- QA/QC 狀態；沒有實際證據不得把 checkbox 或 PASS 預填完成。

## 13. Stop、drift 與回送條件

任一成立，實作模型必須停止並回送規劃模型：

1. source 差異經分類後確認會改變 constructor count、blank/source-derived 分類或 protected ownership；單純 hash
   改變但 contract 未漂移不構成停止條件。
2. 需要讓 factory 讀 React state、DOM、store、permission、provider、router 或 current view 才能完成。
3. 需要更改 `TaskNode`、schema、migration、RLS、provider 或 interaction command。
4. 任一入口無法保留原 ID、parent、order、nodeType、permission 或 post-create 行為。
5. capture／clone／import／restore 出現內容遺失，或無法區分 blank 與 source-derived creation。
6. browser 只能驗 placeholder，無法取得 store／persisted readback；或 normal fixture 有未解釋錯誤。
7. 工作樹出現來源不明且與 DEV-115 變更表面重疊的修改；不得覆寫使用者既有內容。

## 14. Architecture Closure Review 結論

2026-09-09 已對 actual repo、constructor call sites、`TaskNode` schema、`addNode` persistence、TaskDetails readback、
DEV-111／114 hover 與 SPEC-070 interaction baseline 完成 closure review。權威 API、7 檔 11 點遷移、protected zones、
相容／failure recovery、layered evidence、實作裁量與 stop conditions 已固定；目前沒有需由實作模型自行判斷的
P0／P1 架構問題，因此 DEV-115 於當日達 `RD Implementation Ready + 架構已定案`；後續已依此契約完成 local implementation。

本 SPEC 已依上述 evidence 完成 local implementation 與 targeted QA/QC；不等於正式環境已驗證，亦不授權 production
data mutation、commit、push、deploy 或 release。permission-denied 與 390×844 gate 保留至相應 release/QC 階段。

## 15. 變更紀錄

- 2026-09-09：完成 Architecture Closure baseline 與初版 RD Implementation Ready contract。
- 2026-09-09：RD Tech Lead 優化：將五個工作包收斂為三個原子工作包；11 點全覆蓋改由 known manifest／
  adapter gate 證明，browser 聚焦原始缺陷與代表性高風險入口；hash drift 改採語意分類；歷史 dry-run 自
  DEV-115 移回 CAPA-002 獨立控制面。架構決策與產品 scope 不變。

- 2026-09-10：完成 WP-115-1～3：新增 blank-task domain factory、遷移 7 檔 11 點、補 static／browser verifier，
  通過 TypeScript、targeted ESLint、test build、相容 regression 與 DEV-115 browser readback；文件狀態更新為
  `Implemented / QA PASS / Targeted QC PASS / NOT RELEASED`。正式 release、permission-denied、390×844 與 CAPA effectiveness
  仍未完成。

使用思考習慣：#系統描繪、#限制條件、#可驗證性
