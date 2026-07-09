# QA-DEV-039: 任務過濾器核心與全域任務平台兩欄篩選驗證計畫

關聯 DEV：DEV-039
關聯 SPEC：`ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
狀態：Phase 1/1A QA Passed / Phase 1B QA Passed / Phase 1C QA Passed / Phase 2 Cross-Board Source Slice QA Passed / Phase 2A Drag Trigger Parity QA Passed / Local Automated QC Passed / Production Release Not Deployed + Requires Explicit Authorization / All-Phase Coverage Complete
建立日期：2026-07-02
最新修正：
- 2026-07-03，新增一顆按鈕契約驗證：全域任務平台主畫面不得常駐顯示看板 select；看板選擇必須在 `過濾器` popover 內，並與同看板任務過濾條件一起操作。後續 UI 契約：下方顯示區改名 `所有任務排序`，需包含未歸位任務，並依到期日由早到晚排序，未設到期日者排最後。
- 2026-07-04，Phase 2 QA contract 補入 cross-board source truth 與 deletion effective-visibility：active board A 時 `所有任務排序` 仍需顯示所有可見 board 任務；任務或父層刪除後，不得在 `所有任務排序` 殘留。
- 2026-07-04，Phase 2 cross-board source / deletion effective visibility slice 已完成本機 static + browser QC；visible partial/error summary UI、RPC/RLS/migration、DB role matrix 與 production smoke 未納入本輪。
- 2026-07-04 follow-up，補強使用者截圖殘留情境：`所有任務排序` 預設不得列出 `group/list` 容器；使用者可用 `列表 / 群組` 顯示設定切換容器顯示；missing-parent orphan task 不得因扁平投影留在清單。
- 2026-07-04 UI follow-up，任務台清單改為密集文字列：不顯示獨立拖曳把手、大卡片、陰影或日期 chip；點選詳情與整列拖移仍需保留。
- 2026-07-04 hierarchy follow-up，`所有任務排序` 需用縮排與字重/灰階呈現 hierarchy depth；不得因扁平排序讓所有 level 看起來完全相同。
- 2026-07-04 sticky title follow-up，`未歸位` 與 `所有任務排序` 是 section title，不得呈現得像一般任務列；兩者需為 sticky header，捲動各自區塊時仍可見。
- 2026-07-04 chevron collapse follow-up，工作台收合狀態需使用精簡 chevron 符號，collapsed rail 寬度由 48px 減半到約 24px；展開狀態的收合按鈕需用 `ChevronLeft`，不得回到 Notebook 或 panel 類圖示卡片。
- 2026-07-05 DEV-042 compatibility follow-up，手機版工作台收合狀態不得再顯示 in-flow collapsed rail；工作台需透過 Sidebar / top-nav 入口開啟 overlay。桌機仍保留約 24px compact rail。
- 2026-07-07 drag trigger parity addendum，使用者要求 `已歸位任務` 與 `未歸位任務` 的拖曳觸發窗口一致，並以未歸位任務的整列 root 觸發方式為主；QA 新增 Phase 2A 真實操作驗證計畫，覆蓋 row root hit area、left click details、right click menu、mobile long press 與回歸 gate。

## 驗證目標

確認任務過濾器重構後，任務視圖共用同一個過濾語意，顯示設定不被誤算為過濾條件，全域任務平台維持 BoardView 左側跨看板拖拉定位，且工作台主畫面只保留一顆 `過濾器` 按鈕；點開後才在 popover 內選看板並調同看板任務過濾條件。

未歸位與已歸位看板是工作台固定位置區，不是過濾器，也不是看板 selector 的選項。未歸位任務與已歸位任務必須有相同核心任務操作能力。Phase 1C 需確認同一 selected board 與同一組任務 filter 條件下，看板與工作台以相同 `matchedTaskIds` 作為結果真相；看板可額外顯示 context-only ancestor，但不得把它算成符合結果。Phase 2 需確認 `所有任務排序` 的來源已從目前已載入任務升級為全部可見看板任務，且刪除 / archived ancestor / 無權 board 不會透過扁平投影殘留。

Phase 2A 需確認同一個工作台內的任務列拖曳 hit area 一致：未歸位任務與所有任務排序中的已歸位任務都以同一層 row root 承接拖曳，不因已歸位列的內層 flex、日期徽章或 hierarchy padding 造成可拖區不同。

## Zero-Tolerance Failures

- 全域任務平台被實作成獨立整頁 route。
- 全域任務平台不在 BoardView 左側，導致跨看板拖拉定位消失。
- 全域任務平台出現 `設定檔`、`儲存`、`另存`、`複製到`、`全域`、`看板專屬` 等 profile/save/copy UI。
- 全域任務平台程式出現 `TaskWorkbenchFilterProfile`、`readTaskWorkbenchProfiles`、`writeTaskWorkbenchProfiles` 或 workbench profile localStorage key。
- 全域任務平台仍把 `目前工作區` 或 `目前看板` 當成來源範圍 filter。
- 全域任務平台仍把 `待歸位 / 已歸位` 當成任務狀態 filter、來源範圍 filter 或預設排除條件。
- 全域任務平台切換看板 selector 時，把已歸位任務清單限縮成單一看板來源，而不是跨看板顯示。
- 全域任務平台主畫面常駐顯示看板 select，或把過濾器呈現成第二個 select/dropdown，而不是單一按鈕 + overlay。
- 全域任務平台缺少 `未歸位` 與 `已歸位看板` 兩個 placement lanes。
- 全域任務平台下方顯示區仍命名為 `已歸位任務`，或沒有顯示未歸位任務。
- `所有任務排序` 未依到期日由早到晚排序，或把未設到期日任務排在有到期日任務前面。
- 未歸位任務卡比已歸位任務卡少任何核心任務操作能力。
- 任務無法藉由拖移在未歸位與已歸位看板間雙向移動。
- 拖移後任務 title、status、date、assignee、tags、notes 或詳情資料遺失。
- 拖移後同一任務同時存在於未歸位與已歸位 lane。
- 未歸類任務被放進看板 selector、過濾器 panel，或被看板任務 filter 隱藏。
- 正式環境發布或 production smoke 被安排在 Phase 1C QC passed 之前。
- 清單、看板、甘特、日曆、心智圖對同一組 filter 結果不一致。
- 同看板同條件下，看板與全域任務平台的 `matchedTaskIds` 不一致。
- 看板因父層欄位 / 卡片不符合 filter 而藏掉符合條件的子任務。
- 全域任務平台把 context-only ancestor 列為符合結果。
- 看板與全域任務平台的負責人 filter option source 不同，造成同 label/id 條件篩出不同任務。
- active filter count 把 `showDependencies`、`showStartDate`、`showTags` 算成過濾條件。
- Mobile viewport 出現過濾 panel 重疊、主要 CTA 裁切或水平 overflow。
- Phase 2 宣稱 `全部可見任務`，但資料層只能列出目前已載入任務。
- Phase 2 仍只讀 active board nodes，導致 `所有任務排序` 只剩目前看板。
- 看板刪除任務後，該 task id 仍留在 `所有任務排序`。
- 刪除父層/list/card 後，descendant 因本身未 archived 而殘留在 `所有任務排序`。
- `所有任務排序` 在 `列表 / 群組` 顯示設定關閉時，把 `nodeType: group` 的列表/群組容器當成任務列出。
- `列表 / 群組` 顯示設定開啟後，missing-parent orphan task 被一起放行。
- `parentId` 指向不存在父節點的 orphan task 仍出現在看板投影或 `所有任務排序`。
- 任務台清單回復成大卡片、獨立拖曳把手、日期 chip 或高間距卡片堆疊。
- 移除拖曳把手後，整列拖移或點選開啟詳情失效。
- 未歸位任務與所有任務排序中的已歸位任務只有其中一種 row 可由整列 root 啟動拖曳。
- 已歸位任務只能從 title text 或內層 flex 啟動拖曳，無法從 row 左側縮排區、右側空白或日期附近啟動拖曳。
- 為了收斂拖曳窗口而修改 `useDragSensors` 的 distance / delay，或新增工作台專用拖曳把手。
- 拖曳已歸位或未歸位 row 後誤開任務詳情，或右鍵選單、`Escape` 關閉、手機長按 action rail 任一回歸。
- `所有任務排序` 中父層與子層沒有任何縮排或文字權重差異。
- 階層提示改變原本的到期日排序真相，或把清單改成不可跨看板比較的樹狀分組。
- `未歸位` 或 `所有任務排序` 標題在區塊捲動後消失、被任務列蓋住、或缺少明確 section header UI。
- 桌機工作台 collapsed rail 使用 Notebook/clipboard 類大圖示、展開狀態收合按鈕使用 PanelLeftClose 類圖示、寬度回到 48px、或數字 badge 撐出水平 overflow；手機版仍顯示任何 in-flow collapsed rail。
- 使用者無權 board/task 出現在 task source、store、UI 或測試輸出。

## Phase 1 Static Verification

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-039-S01 | 文件登錄 | `dev_task.md`、`documentation_map.md`、`backlog.md` 均包含 DEV-039 與兩欄篩選決策 |
| QA-039-S02 | 共用核心 | 存在 `src/features/taskFilters`，且包含 types/defaults/predicates/describe/storage 或等效模組 |
| QA-039-S03 | Predicate 收斂 | 任務視圖透過共用 `matchesTaskFilters` 或等效核心入口判斷狀態、到期日、負責人、標籤、關鍵字 |
| QA-039-S04 | 顯示設定分離 | `showDependencies`、`showStartDate`、`showTags` 不在 active filter count 中 |
| QA-039-S05 | 標籤一致性 | 甘特與日曆不再漏接 tag filter |
| QA-039-S06 | 心智圖入口 | `mindmap` 模式可操作同一組任務視圖過濾器 |
| QA-039-S07 | Workbench source | `src` 內存在全域任務平台元件與 BoardView 左側嵌入點，不是獨立整頁 route |
| QA-039-S08 | Workbench one-button filter control | 主畫面存在 filter toggle；board select 只存在 filter popover / filter panel 內；不存在 filter summary、selected board path selectors |
| QA-039-S09 | No profile storage | 不存在 workbench profile type、default、read/write profile storage helper |
| QA-039-S10 | No forbidden source/placement filter | 不存在 `目前工作區`、`目前看板` 作為 source filter；`待歸位 / 已歸位` 不得出現在 filter panel 或 `placementFilter` |
| QA-039-S11 | Removed info guard | 工作台元件不含資料來源摘要、設定看板路徑、全部看板摘要、`拖到所選看板` 等已取消文案 |
| QA-039-S12 | Unclassified inbox section | 工作台存在未歸類任務 section/input/add/list/item selectors，並使用 `useQuickCaptureStore` 的 `untriaged` items |
| QA-039-S13 | Placement lane selectors | 工作台存在 `data-task-workbench-unplaced-lane`、`data-task-workbench-placed-board-lane`、`data-task-workbench-lane-drop-target` |
| QA-039-S14 | Task card parity contract | 未歸位與已歸位任務卡共用同一個 task card 元件或等效 interaction contract，不存在功能降級分支 |
| QA-039-S15 | Release ordering guard | PM 文件明確標示 production release gate 必須排在 Phase 1C QC passed 之後 |

Gate：

```powershell
npm.cmd run verify:dev-039-task-filter-core
```

## Phase 1 Browser Verification

| Case | 操作 | 預期 |
|---|---|---|
| QA-039-B01 | 在心智圖模式開啟任務過濾器 | 可看到同一顆任務過濾入口，active count 從 0 開始 |
| QA-039-B02 | 切換顯示設定中的標籤顯示 | 畫面呈現改變，但 active filter count 不增加 |
| QA-039-B03 | 開啟全域任務平台 | 工作台在 BoardView 左側；主畫面只看到一顆過濾器按鈕，不顯示常駐看板 select |
| QA-039-B04 | 檢查工作台面板文字 | 看不到 `設定檔`、`儲存`、`另存`、`複製到`、`全域`、`看板專屬` |
| QA-039-B05 | 開啟過濾器 popover | Popover 內看板欄預設為目前 active board；任務清單跨看板顯示目前已載入任務 |
| QA-039-B06 | 在 popover 內切換看板欄 | 只切換正在編輯的看板 filter state；任務清單仍保留其他看板任務 |
| QA-039-B07 | 開啟工作台過濾器並關閉某狀態 | 只影響目前選擇看板的任務在跨看板清單中的顯示 |
| QA-039-B08 | 點擊重設 | 目前看板過濾器回到預設，不需要儲存或 profile |
| QA-039-B09 | 新增未歸位任務 | 新增後立即以完整任務卡顯示在未歸位 lane，且 reload 後仍可見 |
| QA-039-B10 | 切換看板與套用過濾器 | 未歸位 lane 不受看板 selector 或過濾器隱藏；過濾器只作用於已歸位看板 lane |
| QA-039-B11 | 390px mobile viewport | 工作台 closed state 不顯示 in-flow rail；透過 Sidebar / top-nav 入口開啟 overlay 後不水平 overflow |

## Phase 1B Placement Lane Verification

Phase 1B 已通過本機自動化 QC。Production release 仍需等 Phase 1C QC passed 後，再取得使用者明確 deployment authorization。

Static gate：

```powershell
npm.cmd run verify:dev-039-task-workbench-placement-lanes
```

Browser gate：

```powershell
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
```

| Case | 操作 | 預期 |
|---|---|---|
| QA-039-P1B-B01 | 開啟 BoardView 左側全域任務平台 | 可看到 `未歸位` 與 `已歸位看板` 兩個位置區；工作台仍不是獨立整頁 |
| QA-039-P1B-B02 | 新增未歸位任務 | 卡片具備與已歸位任務相同的點擊詳情、拖拉、狀態/日期/負責人/標籤呈現能力 |
| QA-039-P1B-B03 | 拖移未歸位任務到已歸位看板 lane | 任務出現在目前選擇看板 lane，內容與 identity 保留，未歸位 lane 不留重複 |
| QA-039-P1B-B04 | 拖移已歸位看板任務到未歸位 lane | 任務從該看板 lane 移除並出現在未歸位 lane，內容與 identity 保留 |
| QA-039-P1B-B05 | 對已歸位看板 lane 套用過濾器 | 已歸位看板 lane 依 filter 更新；未歸位 lane 不被 filter 隱藏或改變 |
| QA-039-P1B-B06 | 切換看板 selector | 已歸位任務 lane 仍跨看板顯示；未歸位 lane 保持獨立位置區 |
| QA-039-P1B-B07 | 點擊未歸位與已歸位任務卡 | 兩者開啟同一套任務詳情 UI 或等價操作入口 |
| QA-039-P1B-B08 | 390px mobile viewport 拖拉/展開工作台 | closed state 無 in-flow rail；透過 Sidebar / top-nav 入口開啟 overlay 後兩個 lane 可理解且不造成主要 CTA 裁切或水平 overflow |

Phase 1B regression gate：

```powershell
npm.cmd run verify:dev-039-task-filter-core
npm.cmd run verify:dev-039-task-filter-core-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Gate：

```powershell
npm.cmd run verify:dev-039-task-filter-core-browser
```

## Phase 1C Filter Result Parity Verification

Phase 1C 已完成本機自動化 QC。此節是已執行的 QA contract；production release 不得因本機 QC passed 自動執行，仍需另行明確部署授權與 deployment-release-gate。

Static gate：

```powershell
npm.cmd run verify:dev-039-filter-result-parity
```

Browser gate：

```powershell
npm.cmd run verify:dev-039-filter-result-parity-browser
```

Static cases：

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-039-P1C-S01 | Result projection helper | 存在 task filter result projection helper 或等效模組，可產出 `matchedTaskIds`、`visibleContainerIds`、`contextOnlyContainerIds` |
| QA-039-P1C-S02 | Board renderer wiring | BoardView / KanbanColumn / KanbanChecklist 或等效階層 renderer 使用 projection，不再只用父層單點 filter 決定整段是否顯示 |
| QA-039-P1C-S03 | Workbench wiring | 全域任務平台已歸位任務 lane 依各任務所屬看板使用該看板 `matchedTaskIds`，不自行另外 flat filter 出不同結果 |
| QA-039-P1C-S04 | Assignee option source | 看板 filter 與工作台 filter 對 selected board 使用同一負責人選項來源 contract |
| QA-039-P1C-S05 | No scope creep | 不新增 profile/storage/sync/schema/RLS/migration/production deploy |
| QA-039-P1C-S06 | Regression protection | two-column workbench、placement lanes、no profile/save/copy、active count 分離仍被 verifier 保護 |

Browser cases：

| Case | 操作 | 預期 |
|---|---|---|
| QA-039-P1C-B01 | 建立父層不符合、子任務符合 status filter 的看板資料，套用同一 filter | 看板顯示父層 context 與符合子任務；工作台列出同一子任務 id |
| QA-039-P1C-B02 | 同一資料下檢查 non-matching sibling | sibling 不出現在看板結果或工作台結果 |
| QA-039-P1C-B03 | 套用負責人 filter | 看板與工作台使用同一 assignee id，`matchedTaskIds` 一致 |
| QA-039-P1C-B04 | 套用標籤 / 到期日 / 關鍵字 filter | 兩側 `matchedTaskIds` 一致；看板 context-only ancestor 不被計入結果 |
| QA-039-P1C-B05 | 切換看板 selector 後套用相同條件 | 每個 selected board 都只比較該看板的 `matchedTaskIds`，不混入其他看板 |
| QA-039-P1C-B06 | 390px mobile viewport 開啟工作台與過濾器 | parity 修正不造成 filter panel 重疊、CTA 裁切或水平 overflow |

Phase 1C regression gate：

```powershell
npm.cmd run verify:dev-039-task-filter-core
npm.cmd run verify:dev-039-task-filter-core-browser
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Phase 1C QC evidence（2026-07-02）：

- `npm.cmd run verify:dev-039-filter-result-parity`，25/25 passed。
- `npm.cmd run verify:dev-039-filter-result-parity-browser` passed。
- `npm.cmd run verify:dev-039-task-filter-core`，60/60 passed。
- `npm.cmd run verify:dev-039-task-filter-core-browser` passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`，19/19 passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` passed。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`，35/35 passed。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser` passed。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build` passed。

## Phase 1 Regression Gate

```powershell
npm.cmd run verify:dev-027d-mindmap-date-display-filter
npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

DEV-028 browser verifier 必須 scope 回目前模式的任務卡，避免左側工作台與看板卡片共用 `data-task-id` 時誤點工作台卡片。

## Phase 2 Verification Contract

Phase 2 cross-board source / deletion effective visibility slice 已由使用者最新 `執行開發` 指令授權並完成本機 QC。Visible partial/error summary UI、Supabase RPC/RLS/migration、DB role matrix、production smoke 與正式資料修復仍需另行授權。

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-039-P2-S01 | Task source contract | 存在 `TaskWorkbenchTaskSource` 或等效 service，輸出 workspace/board path 與 visibility summary |
| QA-039-P2-S02 | Permission boundary | 查詢 contract 以 membership/RLS 為邊界，不只靠前端 filter |
| QA-039-P2-S03 | Data shape | 每筆任務包含 task id、workspace/board id、status、dates、assignee、tags、updatedAt |
| QA-039-P2-S04 | Partial state | UI 支援 partial result、loading、retry、error summary |
| QA-039-P2-S05 | Summary truth | UI 只有在資料層完成時才能宣稱全部可見任務 |
| QA-039-P2-S06 | Active board independence | Fixture 建立 Board A / Board B，active board 停在 A 時，source result 與 `所有任務排序` 同時包含 A/B 可見任務 |
| QA-039-P2-S07 | Active board switch stability | 從 A 切到 B 後，`所有任務排序` 不得收縮成 B-only，也不得遺失 A 的可見任務 |
| QA-039-P2-S08 | Filter selected board semantics | Popover 內切換 selected board 只改該 board filter state，不改 task source scope |
| QA-039-P2-S09 | Deleted task removal | 在看板刪除單一任務後，該 task id 立即從 `所有任務排序` 消失，reload / resubscribe 後不得復活 |
| QA-039-P2-S10 | Archived ancestor removal | 刪除父層/list/card 後，descendant 即使本身 `isArchived=false`，也不得留在 `所有任務排序` |
| QA-039-P2-S11 | Restore behavior | Undo/restore 父層或任務後，符合權限與 filter 的任務可重新出現在工作台，且不重複 |
| QA-039-P2-S12 | Orphan handling | parent chain 斷裂或 board metadata 缺失時，任務不得靜默列入完整結果；UI 需呈現 partial/error summary |
| QA-039-P2-S13 | Unplaced merge identity | 未歸位任務與已歸位任務合併後不重複；同 task id 不得同時以兩種 placement 出現在 `所有任務排序` |
| QA-039-P2-S14 | No source overwrite | active board snapshot / `setNodes(activeBoardNodes)` 或等效同步不會覆蓋 cross-board workbench source |

建議 gate：

```powershell
npm.cmd run verify:dev-039-task-workbench-cross-board-source
npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-039-task-workbench-placement-lanes
```

若導入 Supabase RPC / RLS / migration，再加跑：

```powershell
npm.cmd run verify:supabase:static
```

Browser cases：

| Case | 操作 | 預期 |
|---|---|---|
| QA-039-P2-B01 | 建立 A/B 兩看板，各有不同到期日任務；active board 停在 A | `所有任務排序` 顯示 A/B 任務，排序依到期日而非 active board |
| QA-039-P2-B02 | 在 popover 選 B 並關閉某 status filter | 只有 B 中該 status 任務從排序清單移除；A 任務來源不受影響 |
| QA-039-P2-B03 | 在 A 看板刪除 A 任務 | A 任務從看板與 `所有任務排序` 同步消失；B 任務仍存在 |
| QA-039-P2-B04 | 刪除包含子任務的父層/card | 父層與 descendant 均不出現在 `所有任務排序`；看板與工作台結果一致 |
| QA-039-P2-B05 | 復原剛刪除的父層/card | 符合 filter 的父層/descendant 依規則恢復，且不產生重複卡片 |
| QA-039-P2-B06 | 模擬某 board 查詢失敗 | UI 顯示 partial/error summary 與 retry；不得宣稱清單完整 |
| QA-039-P2-B07 | 390px mobile viewport | cross-board source / partial summary 不造成水平 overflow、按鈕文字裁切或面板重疊 |

Phase 2 slice QC evidence（2026-07-04）：

- `npm.cmd run verify:dev-039-task-workbench-cross-board-source`，22/22 passed。
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` passed，覆蓋 QA-039-P2-S06/S07/S09/S10/S13/S14 與 QA-039-P2-B01/B03/B04 的核心行為。
- `npm.cmd run verify:dev-039-filter-result-parity`，26/26 passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`，19/19 passed。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build:test` passed。

Not covered by this slice：

- QA-039-P2-S04/S05/S12 與 QA-039-P2-B06/B07 的 visible partial/error summary UX。
- Supabase RPC/RLS/migration 與 DB role matrix；本輪只接既有 `supabaseNodeService.listByProject()`。
- Production smoke / deployment-release-gate。

## Phase 2A Drag Trigger Surface Parity Verification

Phase 2A 已完成 RD implementation 與本機自動化 QC。QC 證據包含 static row-root contract、browser row-root hit-test、真實雙向拖曳、左鍵詳情、右鍵選單、mobile long press 與 DEV-028/029/039 regression；production release 仍未授權。

Static gate：

```powershell
npm.cmd run verify:dev-039-task-workbench-placement-lanes
```

Static cases：

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-039-P2A-S01 | Shared draggable root | `WorkbenchDragCard` 中未歸位 row 與所有任務排序 row 都在同一層 root 掛 `ref={setNodeRef}`、`draggableBindings`、touch handlers、left click details 與 `onContextMenu` |
| QA-039-P2A-S02 | No sensor workaround | `src/hooks/useDragSensors.ts` 不因本 addendum 修改 `MouseSensor.distance`、`TouchSensor.delay` 或 `tolerance` |
| QA-039-P2A-S03 | No drag handle regression | `TaskWorkbenchPanel` 不新增工作台專用 `data-task-drag-handle`、拖曳 icon、大卡片或獨立 handle UI |
| QA-039-P2A-S04 | Context menu preserved | 未歸位 row 與所有任務排序 row 都保留 `onContextMenu` 並呼叫既有 `setContextMenuState({ kind: 'task' ... })` |
| QA-039-P2A-S05 | Hierarchy/date preserved | 所有任務排序 row 仍保留 `hierarchyDepth` / indentation / hierarchy text class 與 `TaskDateBadge` |

Browser gate：

```powershell
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
```

Browser cases：

| Case | 操作 | 預期 |
|---|---|---|
| QA-039-P2A-B01 | Desktop viewport 開啟工作台，對未歸位 row 左側 15%、title 中段 50%、右側 85% 三個水平點做 row-root hit-test，並在同一流程執行未歸位 -> 已歸位真實拖曳 | 三個 sample points 都命中同一 row root；placement behavior 可用；drag end 後不誤開詳情 |
| QA-039-P2A-B02 | 對所有任務排序中的已歸位 row 左側縮排區、title 中段、右側日期附近做 row-root hit-test，並在同一流程執行已歸位 -> 未歸位真實拖曳 | 三個 sample points 都命中同一 row root；不因內層 flex 或日期 badge 造成 dead zone；drag end 後不誤開詳情 |
| QA-039-P2A-B03 | 分別左鍵點擊未歸位 row 與已歸位 row，且不拖曳 | 兩者都開啟 `TaskDetailsModal`；不受 row shell 收斂影響 |
| QA-039-P2A-B04 | 分別右鍵未歸位 row 與已歸位 row | 兩者都開啟同一套任務 `GlobalContextMenu`；出現 `更多詳情選項`；不得出現已取消的 `重新命名任務`；`Escape` 可關閉 |
| QA-039-P2A-B05 | 驗證所有任務排序 row 視覺 | hierarchy indentation、字重/灰階與日期 badge 仍存在；row shell 收斂不破壞 dense text row |
| QA-039-P2A-B06 | 390px mobile viewport 長按工作台任務 | 仍進入既有 compact action rail；mobile drag bindings 沒有取代長按模式；無水平 overflow 或 overlay 裁切 |

Regression gate：

```powershell
npm.cmd run verify:dev-039-task-workbench-cross-board-source
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

FMEA：

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 已歸位 row 只有 title 可拖 | draggable bindings 實際落在內層 flex 或樣式 dead zone | 使用者拖曳同一任務列時手感不一致 | QA-039-P2A-B02 多點 hit-test + 雙向拖曳 | P0 | 將 bindings 收斂到 row root，並以三點 hit-test 與真實雙向拖曳驗證 |
| 未歸位 row 與已歸位 row root 結構再次 drift | 兩個 JSX 分支各自維護 className / event props | 後續改一邊漏一邊，互動又分裂 | QA-039-P2A-S01 | P1 | 抽 shared row shell 或 props helper |
| 拖曳後誤開詳情 | click / drag arbitration 回歸 | 任務被移動後 modal 突然打開，操作中斷 | QA-039-P2A-B01/B02 | P0 | 維持 `isDragging` 與 touch tap guard 判斷 |
| 右鍵選單退化 | row shell 重構漏掛 `onContextMenu` | 使用者無法從工作台做任務操作 | QA-039-P2A-B04 | P0 | static + browser 同時驗證 context menu |
| 手機長按被桌機拖曳邏輯吃掉 | mobileActionMode 判斷或 touch handlers drift | 手機 compact action rail 失效 | QA-039-P2A-B06 + DEV-029 regression | P0 | 不改 sensor，保留 mobileActionMode 停用 draggable bindings |
| hierarchy/date 視覺遺失 | 為了共用 row shell 過度簡化已歸位 row | 所有任務排序失去層級與日期掃描價值 | QA-039-P2A-S05/B05 | P1 | row shell 只共用 interaction surface，內容 slot 保留 |

## Manual UX Review

- 5 秒內能看懂工作台只需要先選看板，再調過濾器。
- 長 Workspace / Board 名稱不會破壞兩欄版面。
- 使用者不會以為有設定檔、另存、複製或同步能力。
- 使用者能分辨未歸位 / 已歸位看板是位置區，不是過濾器條件。
- 使用者能從任務卡能力判斷未歸位任務與已歸位任務是同一種任務，只是位置不同。
- 工作台仍像側邊工具，不像獨立功能頁。
- 任務卡仍可拖拉到目前看板定位，且主內容點擊可開任務詳情。
- 使用者拖曳未歸位任務與所有任務排序任務時，感覺都是「整列可拖」，不需要找 title、日期或特定小區塊。

## QC Handoff Evidence

QC 回報至少包含：

- DEV-039 static verifier 結果。
- DEV-039 browser verifier 結果與 mobile 截圖。
- DEV-027D / DEV-028 regression 結果。
- TypeScript 與 build 結果。
- 工作台無 profile/save/copy UI 的證據。
- 看板 A / 看板 B 切換與各自過濾器作用證據。
- Phase 1A 歷史證據：未歸類任務新增、顯示、reload persistence、且不受過濾器影響。
- Phase 1B 新增證據：未歸位 / 已歸位看板雙 lane 截圖、雙向拖移證據、任務資料不遺失證據、未歸位與已歸位卡片功能等價證據。
- Phase 1C 新增證據：同看板同條件下 board/workbench `matchedTaskIds` 比對、context-only ancestor 不列入工作台、負責人選項來源一致證據。
- Phase 2A 新增證據：未歸位 row 與所有任務排序 row 的三點 row-root hit-test、真實雙向拖曳、drag end 不誤開詳情、右鍵選單與 `Escape` 關閉、mobile long press action rail 證據。
- Production release ordering evidence：任何正式環境發布文件或 gate 均排在 Phase 1C QC passed 之後。

## All-Phase QA Coverage Matrix

| Phase | QA status | Primary risk | Required verification | Stop / fail condition | Evidence owner |
|---|---|---|---|---|---|
| Phase 0 | Done | 後續 RD 誤解共用範圍 | 文件索引、HCS/第一性原理決策 | 把所有 filter state 合成同一份 global state | PM |
| Phase 1 | QA Passed / Historical | 五視圖 filter 不一致、工作台 profile UI 回流 | Static verifier、browser verifier、mobile viewport、DEV-027D/DEV-028 regression、TS/build | `src` 無 Workbench source、未共用 predicate、仍保留 profile/save/copy | QC + RD |
| Phase 1B | QA Passed / Local Automated QC Passed | 工作台失去跨看板定位本質、未歸位任務功能降級 | Placement lane static/browser、drag proof、task parity proof、DEV-028 regression、TS/build | 無雙 lane、不能雙向拖移、未歸位卡片功能少於已歸位卡片、發布早於 QC | QA + QC + RD |
| Phase 1C | QA Passed / Local Automated QC Passed | 看板階層式篩選與工作台扁平篩選結果不一致 | Result parity static/browser、matchedTaskIds comparison、assignee option source proof、Phase 1/1B regression、TS/build | `matchedTaskIds` 不一致、符合子任務被父層藏掉、context-only ancestor 被列為結果、發布早於 QC | QA + QC + RD |
| Phase 2 | Cross-Board Source Slice QA Passed / Follow-up Not Authorized | `全部可見任務` 文案與資料層不一致、權限外洩、刪除後扁平清單殘留 | Task source service/static verifier、browser cross-board/deletion proof、effectiveVisibility proof、DB role matrix if needed | query 只能列 active/local/assigned tasks、無權任務洩漏、archived ancestor descendant 殘留、visible partial/error summary 未覆蓋卻宣稱完成 | QA + QC |
| Phase 2A | QA Passed / Local Automated QC Passed | 未歸位與已歸位任務列拖曳 hit area 不一致、row shell 重構造成 click/right-click/mobile 回歸 | Shared root static gate、desktop row multi-point hit-test + true bidirectional drag browser gate、right-click/details/mobile long-press regression、DEV-028/029/039 gates、TS/build | 任一 row 只能局部拖曳、靠 sensor workaround、拖曳誤開詳情、右鍵或手機長按失效、hierarchy/date 遺失 | QA + QC + RD |
| Phase 3 | Deferred / Not Authorized | UI section 元件化造成行為漂移 | Regression verifier、viewport review | 元件化後 filter 結果或 summary 改變 | RD + QC |
| Phase 4 | Deferred / Not Authorized | 舊 profile 概念回流 | Static guard、docs audit | profile type/storage/UI 重新出現在 DEV-039 | PM + QC |

## Deferred Verification Scope Audit

| Deferred verification | Classification | Covered by | Notes |
|---|---|---|---|
| Cross-board all-visible task DB proof | Same Spec Phase | Phase 2 | 前端 / local-test / existing service adapter slice 已驗證；若需要 DB/RLS/RPC proof 另行授權 |
| Deletion effective visibility / archived ancestor proof | Same Spec Phase | Phase 2 | static + browser fixture 已驗證 task 與 archived parent；若涉及正式資料修復則另走 human re-entry |
| Workbench placement lanes and bidirectional drag | Same Spec Phase | Phase 1B | 已通過本機自動化 QC；production release 後續仍需獨立 deployment gate |
| Workbench drag trigger surface parity | Same Spec Phase | Phase 2A | 已通過 static/browser 真實操作 gate；production release 仍需另行授權 |
| Board/workbench filter result parity | Same Spec Phase | Phase 1C | 已通過本機自動化 QC；已比對 canonical matched task IDs 與 context-only ancestors |
| Filter UI section componentization | Same Spec Phase | Phase 3 | 不改產品語意，不新增儲存 |
| Profile backend sync, migration, conflict handling | Cancelled for DEV-039 | No active QA target | 使用者已取消儲存/profile 類功能 |
| Calendar subscription source scope | New DEV | DEV-037 | 只在觸及 CalendarSubscriptions 程式碼時做 conditional regression |
| Production smoke, remote migration, data repair/delete | Blocked Human Re-entry | deployment-release-gate / Supabase gate | 不可由 DEV-039 local QC 自動涵蓋；且不得早於 Phase 1C QC passed |

## Phase Exit Decision Rules

- Phase 1 可以在所有 Phase 1 gates passed 後標為 `Implemented / QC Passed`，但不得因此標示 Phase 2 done。
- Phase 1B 是 Phase 1/1A 後的產品修正 gate；已通過本機自動化 QC，但不得因此視為 production release 已完成。
- Phase 1B 必須同時通過 task parity、雙向拖移與資料不重複/不遺失證據；只有看到兩個 lane 不足以通過。
- Phase 1C 需同時通過 static/browser parity gate、`matchedTaskIds` 比對、context-only ancestor 檢查與 Phase 1/1B regression；只證明共用 predicate 不足以通過。
- Phase 2 cross-board/deletion slice 已有 static + browser evidence；visible partial/error summary、DB role matrix、production smoke 仍不得被宣稱完成。
- Phase 3 只允許元件化，不得順手新增儲存、profile 或同步。
- Phase 4 只處理遺留清理與防回流 gate，不得變成 profile governance。
- 任一 phase 若出現 profile/save/copy UI，直接退回設計決策，不得用「進階功能」名義保留。
