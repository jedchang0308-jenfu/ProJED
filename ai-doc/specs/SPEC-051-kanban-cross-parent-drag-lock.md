# SPEC-051: 看板跨父層拖拉停留鎖定與落點定位

狀態: Implemented / Local Automated QA Passed / Browser UI QC Passed / Production Not Deployed / Physical Phone Supplemental Not Executed
對應 DEV: DEV-051
節點類型: 交付點
風險等級: Medium（主要看板操作、桌機與手機手勢、排序與父層資料一致性）
是否計入產品交付完成: 是
建立日期: 2026-07-16
最近更新: 2026-07-16

使用思考習慣: #批判思考、#設計思考、#可驗證性

## 1. Human Decision Brief

### 1.1 使用者已確認

- 預設只做同父層排序；跨父層不得因碰到不同階層任務便立即提交。
- 跨父層需在目標父層停留 750ms 才鎖定；可接受完成窗口為 700–800ms。
- 取消「卡片中央＝成為該任務下層」的隱性落點分類；移到哪一個父層，就在該父層內選擇插入位置。
- 鎖定只以整個目標父層／同層任務群組的框線呈現；單獨框住一張卡不算完成。
- `1A`：空父層、可見子任務為空或收合父層，在拖曳期間顯示可命中的細插入線；停留 750ms 後可鎖定該父層。
- `2A`：鎖定後父層保持鎖定，指標可在該父層內選擇目標任務前／後；移到群組空白處則追加到末尾。
- `3A`：有篩選時以可見任務為插入錨點，未顯示的同層任務保留既有相對順序。
- 離開鎖定父層超過 200ms 才解除鎖定；手機停留與鎖定判定提供約 20px 移動容錯。
- 2026-07-16 最新決策：刪除所有可見鎖定文字、breadcrumb／Level、浮動狀態、倒數文案與進度條；畫面只保留插入線及父層鎖定框。

### 1.2 AI 工程決策

- 桌機 dnd-kit 與手機 long-press drag-action 共用同一個 pure drop-intent resolver 與父層鎖定狀態機；UI adapter 可不同，不得複製產品規則。
- hover／停留期間只更新 transient UI state，不寫入 Zustand、DB 或 undo stack；只有有效 drop 才以一次 `batchUpdateNodes` 提交。
- 鎖定 identity 使用實際 `parentId`，不是 Level 數字。同深度但不同父任務仍需重新停留鎖定。
- 空／收合父層的插入線是拖曳期間出現的專用 lane，不是卡片中央熱區；其結果是將拖曳任務追加為該任務的直接子任務。
- 有篩選且目的父層沒有可見子任務時，empty lane 追加到完整 canonical sibling list 末尾，不可插入隱藏 sibling 中間。
- 本變更不需要 ADR：互動邏輯局部、可逆，且不改資料模型、API 或權限。

## 2. 問題與目標

目前看板的 `wbs-card-drop`／`wbs-checklist-drop` 可在放開時直接推導新父層，使用者拖曳途中卻無法穩定辨識「目前父層」與「最終順序」。跨階層與同階排序共享相似熱區，也容易把短暫經過誤判成改父層。

本 DEV 的成功條件是：

1. 高頻同父層排序保持即時。
2. 跨父層必須先形成可見、可取消的鎖定意圖。
3. 鎖定父層與精確插入位置分開呈現，但使用者只需一次連續拖曳。
4. 空、收合與篩選情境都存在明確且唯一的落點語意。
5. 放開結果、畫面預覽、資料順序與一次 undo 完全一致。

## 3. Spec Governance

分類: `Intentional replacement`

- `SPEC-046` 的 whole-task surface drag 觸發方式繼續有效。
- 本規格取代 `SPEC-046` 在「看板跨父層 drop-intent」的既有隱性中央／下層 drop 語意。
- `SPEC-029` 的 mobile pan-first、quick tap、long-press drag-action、compact action rail、edge auto-scroll 與 cancel safety 繼續有效；本規格只接管進入 drag-action 後的看板任務位置解析。
- `SPEC-052` 是 `Compatible exception`：只取代本文件第 5、11、13 節的 internal implementation architecture；第 1～10、12、14 節產品行為與驗收仍由本文件管理。DEV-052 未完成前，本文件記錄的現行 runtime 繼續有效。
- DEV-051 已完成本機 runtime 實作與自動化 QA/QC；production runtime 未部署，physical phone supplemental 未執行。

## 4. Scope

### 4.1 Current Scope

- `BoardView` 看板模式的 `KanbanColumn`、`KanbanCard`、`KanbanChecklist`。
- 桌機拖曳與手機 long-press 後的 task-position drop。
- 同父層 before／after 即時排序。
- 跨父層 750ms arming、locked group frame、before／after／append 插入線。
- 空父層、收合父層、篩選後可見子任務為空的 text-free empty lane 插入線。
- cycle、自己、自己子樹、無權限與不相容目標防呆。
- source 與 destination ancestor 狀態重算、單一 undo command。
- 穩定 DOM selector、pure deterministic verification、browser interaction verification。

### 4.2 Out of Scope

- 不修改 list、mind map、Gantt、calendar、records 或全域任務平台的模式專屬 drop-intent。
- 不恢復卡片中央隱性「成為下層」熱區。
- 不修改任務詳情、桌機右鍵選單、手機 compact action rail action set。
- 不變更 `TaskNode` schema、DB、migration、RLS、RPC、API 或同步協定。
- 不執行 production deployment、remote mutation 或 release；本機 QC 事實另記於 `QC-DEV-051`。

## 5. Implementation Architecture Facts

| 區域 | DEV-051 實作結果 | 驗證重點 |
|---|---|---|
| `src/components/BoardView.tsx` | 桌機與手機共用 pure resolver、750ms arming／locked、200ms grace 與 release revalidation | 同父層立即提交；跨父層未 locked 不提交；action rail 優先 |
| `kanbanDropIntent.ts` | 集中 constants、state transitions、cycle guard、canonical ordering 與雙 ancestor rollup；舊 breadcrumb／Level transient fields 已移除 | deterministic verifier 28/28 passed |
| `KanbanDropFeedback.tsx` | 群組框、before／after／append 插入線與 text-free child empty lane；鎖定文字與 floating status 已退役 | 桌面／手機截圖與 stable selectors passed |
| `KanbanCard.tsx` / `KanbanChecklist.tsx` / `KanbanColumn.tsx` | 退役舊隱性中央 child drop；提供 task anchor、parent group 與明確 empty lane | DEV-051 browser 7-case matrix、DEV-046 browser passed |
| `src/store/useWbsStore.ts` | 純結構排序 patch 不再誤觸 smart-status／主責 guard；有效 move 使用單次 batch undo | DEV-029、DEV-044、DEV-048 regression passed |
| `resultProjection.ts` | visible task 作 anchor，完整 sibling set 作 normalize 真相 | DEV-039 parity static/browser passed |

## 6. Interaction State Machine

### 6.1 狀態

| State | 進入條件 | 可見回饋 | Release 結果 |
|---|---|---|---|
| `idle` | 未拖曳或已清理 | 無 | 無 |
| `same-parent` | target parent 等於 source parent | 立即顯示 before／after 插入線 | 提交同父層排序 |
| `arming` | target parent 不同、有效且尚未達 750ms | 目標父層框；不顯示文字或進度條 | 取消，不改 `parentId`／`order` |
| `locked` | 同一 candidate parent 連續停留達 750ms | 完整群組框與插入線；不顯示文字 | 提交新父層與順序 |
| `invalid` | cycle、self、descendant、無權限或不相容 | 無效框／線；不顯示文字 | 取消，不提交 |

### 6.2 Timing Contract

- `KANBAN_PARENT_LOCK_DELAY_MS = 750`。
- 測試允許鎖定發生在 700–800ms；`<700ms` 不得 locked，`>800ms` 未 locked 為失敗。
- `KANBAN_PARENT_UNLOCK_GRACE_MS = 200`。離開 locked parent 後，在 grace 內回來仍保持鎖定；超過門檻解除。
- `KANBAN_MOBILE_LOCK_TOLERANCE_PX = 20`。手機 auto-scroll 或手指微幅移動不應重設同一 candidate／locked parent。
- candidate parent identity 改變、進入 invalid target 或明確取消時，arming 計時立即歸零。
- 使用 fake clock／pure elapsed-time reducer 驗證門檻，不以不穩定的實際 sleep 當唯一證據。

### 6.3 State Shape（建議契約）

```ts
type KanbanDropPhase = 'idle' | 'same-parent' | 'arming' | 'locked' | 'invalid';
type KanbanDropPosition = 'before' | 'after' | 'append';

interface KanbanDropIntentState {
  phase: KanbanDropPhase;
  sourceNodeId: string | null;
  sourceParentId: string | null;
  candidateParentId: string | null;
  lockedParentId: string | null;
  anchorNodeId: string | null;
  position: KanbanDropPosition | null;
  startedAt: number | null;
  progress: number;
  invalidReason: string | null;
}
```

實際命名可依 repository 慣例調整，但狀態語意、門檻與 selector contract 不可省略。

## 7. Drop Target Contract

| Target | target parent | Position | 規則 |
|---|---|---|---|
| 同父層可見 task 上半部 | task.`parentId` | `before` | 不計時，立即預覽 |
| 同父層可見 task 下半部 | task.`parentId` | `after` | 不計時，立即預覽 |
| 不同父層可見 task | task.`parentId` | 鎖定後 `before`／`after` | task 是 sibling anchor，不代表成為 task 的 child |
| locked group 空白區 | locked parent id | `append` | 追加至完整 canonical siblings 末尾 |
| text-free empty lane 插入線 | lane.`targetParentId` | `append` | 將 dragged task 追加為該 parent 的直接 child；需先完成 750ms lock |
| root／column group blank | 對應 root parent id | `append` | 依 root node type 既有規則提交，不得用 Level 猜測 |
| action rail target（手機） | 不適用 | action | action rail 優先；不得同時 task move |

### 7.1 Empty lane 插入線顯示條件

- 只在 active task drag 時出現。
- 目的任務沒有可見 child，或其 child group 目前收合時顯示。
- 只顯示細插入線，不顯示「放入／停留／已鎖定」或任務名稱文字。
- lane 是專用 droppable，例如 `type: 'wbs-child-empty-lane'`、`targetParentId`、`position: 'append'`。
- 未鎖定前維持可命中的插入線；鎖定後由 parent group frame 與插入線共同表示落點。
- 若 parent 無效或無權限，lane 不啟動計時且不得提交。

### 7.2 篩選與 canonical ordering

- 3A 是 authoritative：可見 task 只負責提供 before／after anchor。
- order 計算與 sibling normalize 必須使用完整 parent index，不能只用 visible list。
- 隱藏 siblings 在移動前後保留彼此相對順序。
- 目的父層無可見 child 時，empty lane／blank append 一律加到完整 canonical sibling list 末尾。
- 清除篩選後，實際順序必須與 drop 預覽語意一致，且沒有重複、遺失或非預期重排。

## 8. Visual、Accessibility 與 Stable Selectors

### 8.1 必要視覺

- `arming`：父層群組框，不顯示文字或進度條。
- `locked`：完整父層群組框，不顯示 breadcrumb、Level 或浮動狀態。
- exact position：before／after 插入線；group blank／empty lane 顯示末尾落點。
- `invalid`：保留無效框／線與 no-commit 行為，不顯示文字提示。
- 拖曳來源原位置直接移除；無有效 insertion target 時只顯示跟隨 pointer／finger 的 preview，有有效 target 時由 insertion line／placement feedback 表示落點，不得同時留下第二份任務名稱。

### 8.2 DOM Contract

RD 可補充值，但下列 attributes 不得刪除或改為只靠 CSS class：

- `data-kanban-parent-lock-state="idle|same-parent|arming|locked|invalid"`
- `data-kanban-parent-lock-progress="0..1"`
- `data-kanban-drop-parent-id="..."`
- `data-kanban-drop-indicator="true"`
- `data-kanban-drop-position="before|after|append"`
- `data-kanban-child-empty-lane="true"`
- `data-kanban-drop-invalid-reason="..."`

可見 runtime 不得渲染鎖定狀態文字或 floating status；群組框與插入線不可遮擋任務操作控制。狀態仍以 `data-*` 供自動化驗證。

## 9. Data、Permission 與 Commit Contract

- 沿用 `canMoveTask`；沒有移動權限時不得進入 arming 或 locked。
- cycle guard 必須拒絕拖入自己或自己 descendant。
- before／after 採 target 的 `parentId`；child empty lane 採 lane 的 `targetParentId`。
- 跨父層提交更新 `parentId`、相容的 `nodeType` 與 `order`；root／task type 規則應集中於 resolver，不得散落於桌機／手機 handler。
- 用 `batchUpdateNodes(updates, { label: '移動任務位置', mergeKey: 'move:<id>' })` 或等價單次 command 提交。
- 成功跨父層後，source 與 destination ancestor chain 都要重算。若現有 `recalculateAncestorStatus` 無法覆蓋舊父層，RD 應增加可測試的雙路徑 helper；不得改 schema。
- 一次 undo 必須同時還原 parent、type、order、受 normalize 影響的 sibling order 與 ancestor 派生狀態。
- hover、arming、locked、cancel 不得產生持久化 write 或 undo entry。

## 10. Cancellation、Recovery 與 Concurrency

- release before lock、Escape、drag cancel、pointercancel、touchcancel、window blur、pagehide、visibility hidden、unmount：清除 timer、overlay、candidate、lock 與 indicator。
- locked parent 外移超過 200ms 後先解除，再允許新 parent 進入 arming；不可把舊 lock 套到新 parent。
- 手機進入 compact action rail target 時，action target 優先並清除／暫停 task-position candidate；成功 action 不得同時移動任務。
- edge auto-scroll 後重新 hit-test，但相同 candidate／locked parent 且在 20px tolerance 內不得重設計時。
- store persistence failure 沿用既有錯誤處理；transient drag UI 必須清除。本 DEV 不新增遠端補償協定。
- drag 過程若資料刪除、權限改變或 target 消失，release 時重新驗證；失效即 no-op 並顯示可理解原因。

## 11. RD File Contract

預期變更：

- 新增 `src/components/Wbs/kanbanDropIntent.ts`：constants、types、pure state transition、target resolver 與 canonical order helper；不保留文字提示專用 breadcrumb／Level helper。
- `src/components/BoardView.tsx`：擁有共用 lock state；desktop dnd 與 mobile flow 接同一 resolver；所有 exit path 清理；單次 commit。
- `src/components/Wbs/KanbanColumn.tsx`：parent/root group blank target、群組 lock frame、empty lane 容器。
- `src/components/Wbs/KanbanCard.tsx`：退役舊隱性中央 child drop，提供 group metadata、visual state 與 empty lane。
- `src/components/Wbs/KanbanChecklist.tsx`：deep hierarchy anchor/group metadata 與插入線。
- 必要時新增小型 `KanbanDropIntentContext`／hook 供視覺元件讀 transient state；不得放入 persisted store。
- 必要時調整 `src/store/useWbsStore.ts`，只限 source／destination ancestor rollup helper 與 undo 一致性。
- 新增 `scripts/verify-dev-051-kanban-cross-parent-drag-lock.mjs`。
- 新增 `scripts/verify-dev-051-kanban-cross-parent-drag-lock-browser.pw.js`。
- `package.json` 新增 `verify:dev-051-kanban-cross-parent-drag-lock` 與 browser command。

如果實際架構需要不同檔名，RD 可調整；但 pure resolver、共享規則、stable selectors 與 QA command 必須保留。

## 12. Acceptance Criteria

1. 同 `parentId` 拖曳立即 before／after，不顯示 750ms 倒數。
2. 不同 `parentId` 在 `<700ms` 不得 locked；750ms 正常 locked；`>800ms` 未 locked 為失敗。
3. arming 階段 release 不改任何 `parentId`、`nodeType` 或 `order`，也不建立 undo。
4. 同深度、不同父任務仍需重新停留；比較 Level 數字不得繞過 lock。
5. locked 後可在該父層內選 before／after；群組空白處為 append，結果與 indicator 一致。
6. 空、收合或篩選後可見子任務為空時，明確 child empty lane 可完成 750ms lock 與 append，不使用卡片中央隱性語意。
7. 有篩選時 visible task 是 anchor；hidden siblings 彼此相對順序不變，清除篩選後無意外重排。
8. locked group frame 與 exact insertion indicator 同時可見；鎖定、arming、empty lane 與 invalid 的可見文字提示皆不存在。
9. 離框不超過 200ms 保持 lock，超過後解除；切換 candidate 會重設計時。
10. 手機 20px 內微移與 edge auto-scroll 不會反覆重設同一 lock；短滑仍 pan，quick tap 仍開詳情。
11. action rail target 優先，執行 action 時不得同時 task move。
12. cycle、self、descendant、無權限、target 消失都不提交。
13. 成功 move 是單一 undo command；一次 undo 完整還原 source／destination 與 sibling order。
14. 所有 cancel／blur／visibility／unmount 路徑不留 timer、overlay 或 locked frame。
15. TypeScript、build、DEV-029／039／044／046 regression 與 DEV-051 static/browser verification 全部通過。

## 13. RD Implementation Slices

### Slice A — Pure model and target contract

- 建立 pure state machine、target metadata、validity、canonical ordering、timing tests。
- 完成後不得先接持久化；先以 deterministic verifier 覆蓋狀態轉移。

### Slice B — Desktop adapter and visual contract

- 接入 dnd-kit lifecycle、group frame、indicator、text-free empty lane、cancel cleanup。
- 保留 whole-task drag、click guard、interactive controls 與 keyboard/accessibility。

### Slice C — Mobile adapter

- long-press drag-action 後接同一 resolver。
- 保留 pan-first、quick tap、action rail priority、edge auto-scroll、20px tolerance 與 cancel safety。

### Slice D — Commit、undo、regression and documentation

- 單次 batch commit、雙 ancestor rollup、filter ordering、undo。
- 執行 QA-DEV-051 與既有回歸；只在證據完成後更新 implementation status／QC。

## 14. QA、QC 與停止條件

- QA 執行來源：`ai-doc/qa/QA-DEV-051-kanban-cross-parent-drag-lock.md`。
- RD 完成程式但未跑 QA 時，只能標示 `Implemented / QA Not Executed`。
- browser automation 不能證明真實 touch 手感；physical phone 可列 supplemental，不阻擋本機 RD，但 release 前由 release gate 決定是否要求。
- 發現 parent/order 遺失、cycle 可成立、undo 不完整、pan-first regression、action 與 move 雙重提交、計時器殘留或 filter hidden order 破壞，必須停止交付並修正。
- 本文件不授權 commit、push、PR、deploy 或 production mutation；收到對應指令後才進入 Git/release gate。

## 15. Related Documents

- `ai-doc/backlog.md#dev-051-看板跨父層拖拉停留鎖定與落點定位`
- `ai-doc/qa/QA-DEV-051-kanban-cross-parent-drag-lock.md`
- `ai-doc/qc/QC-DEV-051-kanban-cross-parent-drag-lock.md`
- `ai-doc/specs/SPEC-052-kanban-drag-subsystem-refactor.md`
- `ai-doc/qa/QA-DEV-052-kanban-drag-subsystem-refactor.md`
- `ai-doc/specs/SPEC-046-universal-task-surface-drag.md`
- `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md`
- `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md`
- `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md`
- `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
- `ai-doc/specs/SPEC-044-undo-recovery-scope-expansion.md`

## 16. Implementation and Verification Evidence

- `npm.cmd run verify:dev-051-kanban-cross-parent-drag-lock`：33/33 passed。
- `npm.cmd run verify:dev-051-kanban-cross-parent-drag-lock-browser`：7-case matrix passed；涵蓋 pointer preview、同父層立即排序、跨父層提前放開 no-op、750ms lock、empty lane、手機跨層與 action rail priority。
- DEV-029／039／044／046 static 與 browser regressions 全部 passed；DEV-048 多人主責 static regression passed。
- `npm.cmd exec tsc -- --noEmit` 與 `npm.cmd run build:test` passed。
- 桌面 1440x900 與手機 390x844 截圖已人工檢視；locked group、exact insertion line、text-free empty lane、mobile rail、viewport overflow 與 visible error sweep passed；舊鎖定文字與 floating status 不存在。
- 本輪無 DB/schema/API/migration/RLS 變更，未 commit、push、PR 或 deploy；production 與 physical phone supplemental 均未執行。
