# QC-DEV-039: 任務過濾器核心與全域任務平台兩欄篩選重構

關聯 DEV：DEV-039
關聯 SPEC：`ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
關聯 QA：`ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md`
狀態：Phase 1/1A + Phase 1B + Phase 1C Local Automated QC Passed / Phase 2 Cross-Board Source Slice Local Automated QC Passed / Phase 2A Drag Trigger Parity Local Automated QC Passed / DB unchanged / Production Release Not Deployed + Requires Explicit Authorization
執行日期：2026-07-02；Phase 2A evidence added 2026-07-07

> Current Supersession Note - 2026-07-17：使用者確認 Workbench `placed row` 不能拖。
> 本 QC 中 Phase 1B / Phase 2A 對 placed row draggable parity 與 placed -> unplaced
> drag 的通過證據保留為歷史事實，不再作為目前產品契約；最新契約見 `SPEC-053`。

## QC 結論

本文件取代早先的「全域任務平台設定檔」QC 結論。依使用者最新決策，全域任務平台不再提供設定檔、儲存、另存、複製、全域 profile 或看板專屬 profile。

本輪修正後的目標：

- 全域任務平台維持 BoardView 左側跨看板拖拉中繼站。
- 工作台主畫面只保留一顆 `過濾器` 按鈕；看板選擇移入過濾器 popover，和同看板過濾條件一起操作。
- 過濾器條件與看板內任務過濾器共用同一套核心語意。
- 未歸類任務加回全域任務平台，提供新增與顯示，且不屬於過濾器。
- 使用者看板一個一個設定，不需要跳到其他看板，也不需要保存設定檔。
- 看板階層式篩選與全域任務平台扁平篩選共用 canonical `matchedTaskIds`，看板祖先容器只作 context。
- Phase 1 資料來源仍是目前已載入任務集合，UI 必須誠實標示；真正全部可見任務留 Phase 2。
- 下方顯示區已改為 `所有任務排序`，合併符合 filter 的已歸位任務與未歸位任務，並依到期日由早到晚排序；未設到期日者排最後。

2026-07-02 使用者再次修正後，新增 Phase 1B 範圍：

- `未歸位` 與 `已歸位看板` 是全域任務平台 placement lanes，不是過濾器或任務狀態。
- 任務必須能藉由拖移在兩個 lane 間移動。
- 未歸位任務功能必須與已歸位任務相同，僅位置不同。
- Phase 1B 已實作並通過 placement lane gates；本 QC 不代表 production release 已完成。

2026-07-02 使用者指出新問題後，新增並完成 Phase 1C 範圍：

- 全域任務平台篩選器與看板內篩選器在相同條件下篩出不同結果。
- 事實判斷：predicate 語意共用，但看板是階層式投影、工作台是扁平式投影，且負責人選項來源不同。
- Phase 1C 的產品真相已改為 canonical `matchedTaskIds`；看板可顯示 context-only ancestor，但工作台不得把 ancestor 當成符合結果。
- 本輪已完成 Phase 1C RD，並通過本機 static/browser/regression/TypeScript/build QC。

2026-07-04 使用者授權執行 Phase 2 cross-board source / deletion effective visibility slice：

- `所有任務排序` 不再只依賴 active board sync；工作台會依所有可見 `boardOptions` 載入任務。
- `setNodes()` 新增 board-scoped merge boundary，active board snapshot 不會清掉其他 board 的工作台來源。
- Filter projection 新增 `isTaskEffectivelyVisible()`，排除 archived task 與 archived ancestor descendant。
- Follow-up hardening：`所有任務排序` 預設只接受 task-like 節點；使用者可在工作台 popover 以 `列表 / 群組` 顯示設定切換有效容器顯示；missing-parent orphan task 視為不可見，避免刪除父層後殘留。
- UI density follow-up：`未歸位` 與 `所有任務排序` 改為 dense text rows，移除獨立拖曳把手、大卡片陰影與日期 chip；整列仍可拖移與點選開啟詳情。
- Hierarchy follow-up：`所有任務排序` 保留扁平到期日排序，但每列以 parent chain depth 產生縮排與文字權重差異，讓不同 level 可被快速掃描。
- Sticky title follow-up：`未歸位` 與 `所有任務排序` 改為 sticky section headers，和任務列視覺分離；browser verifier 需覆蓋實際捲動後 header 仍停在容器頂端。
- Chevron collapse follow-up：工作台收合 rail 改為 24px 精簡 chevron affordance，展開狀態收合按鈕改用 `ChevronLeft`；browser verifier 覆蓋 rail、toggle、count badge 寬度與 expanded collapse icon。
- 本輪沒有新增 Supabase RPC/RLS/migration，沒有正式資料修復/刪除，也沒有 production deploy。
- Visible partial/error summary UI 尚未交付；source 層會保留 failed board 既有快取並 warn，不得宣稱 partial/error UX 完成。

2026-07-07 使用者要求完成 Phase 2A drag trigger parity：

- `未歸位任務` 與 `所有任務排序` row 已共用 row-root drag surface，避免已歸位 row 只在內層 title/date 區域可拖。
- 工作台 row root 同時承接 left click details、right click `GlobalContextMenu`、desktop draggable bindings 與 mobile touch handlers。
- Browser QC 以 15% / 50% / 85% 三點 hit-test 驗證兩種 row 的可拖 surface 命中同一 root，並以真實雙向 placement drag 驗證拖曳流程。
- 本輪沒有修改 dnd sensor threshold，沒有新增 drag handle、工作台專用 menu、資料模型、DB/RLS/migration、production deploy 或手機新手勢。

## 驗證結果

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-039 filter result parity static | Pass | `npm.cmd run verify:dev-039-filter-result-parity`，26/26 |
| DEV-039 filter result parity browser | Pass | `npm.cmd run verify:dev-039-filter-result-parity-browser` |
| DEV-039 cross-board source static | Pass | `npm.cmd run verify:dev-039-task-workbench-cross-board-source`，23/23 |
| DEV-039 cross-board source browser | Pass | `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser`；覆蓋 cross-board、刪除 reload、group/list 容器預設不顯示與手動切換顯示、missing-parent orphan 不顯示、hierarchy indentation、sticky section headers |
| DEV-039 placement static | Pass | `npm.cmd run verify:dev-039-task-workbench-placement-lanes`，30/30，包含 sticky section header、compact collapsed rail、right-click shared menu 與 Phase 2A row-root drag surface static gate |
| DEV-039 placement browser | Pass | `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser`；覆蓋 dense text rows、無獨立 drag handle、row-root hit-test、右鍵 shared menu、雙向拖移、mobile viewport、24px collapsed rail、expanded `ChevronLeft` collapse button |
| DEV-039 static | Pass | `npm.cmd run verify:dev-039-task-filter-core`，61/61 |
| DEV-039 browser | Pass | `npm.cmd run verify:dev-039-task-filter-core-browser` |
| DEV-027D static | Pass | `npm.cmd run verify:dev-027d-mindmap-date-display-filter`，11/11 |
| DEV-027D browser | Pass | `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser` |
| DEV-028 static | Pass | `npm.cmd run verify:dev-028-cross-mode-task-interactions`，37/37 |
| DEV-028 browser | Pass | `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser` |
| DEV-034 static | Pass | `npm.cmd run verify:dev-034-pwa-install-guidance`，24/24 |
| DEV-034 browser | Pass | `npm.cmd run verify:dev-034-pwa-install-guidance-browser` |
| DEV-029 static | Pass | `npm.cmd run verify:dev-029-mobile-pan-first-interactions`，32/32 |
| DEV-029 browser | Pass | `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Build | Pass | `npm.cmd run build`; Phase 2 slice also ran `npm.cmd run build:test` |

## Browser 覆蓋要求（Phase 1/1A historical）

- `mindmap` 模式可看到同一顆任務過濾器入口。
- 顯示設定切換不增加 active task filter count。
- 全域任務平台來源 summary 顯示目前已載入任務集合。
- Phase 1/1A historical：全域任務平台面板內看不到 `目前工作區`、`目前看板` 來源 filter，也沒有把 `待歸位`、`已歸位` 做成 filter；Phase 1B 已以 placement lanes 補回 `未歸位`、`已歸位看板`。
- 全域任務平台面板內看不到 `設定檔`、`儲存`、`另存`、`複製到`、`全域`、`看板專屬`。
- 開啟過濾器 popover 後，看板 selector 預設目前 active board。
- 在 popover 內切換看板 selector 後，只切換正在編輯的看板 filter state；已歸位任務清單仍跨看板顯示。
- 在某看板關閉某任務狀態後，該看板任務即時被過濾；重設後恢復。
- Phase 1A historical：未歸類任務可新增與顯示；切換看板、套用過濾器與 reload 後仍保持。Phase 1B 已升級為未歸位任務與已歸位任務功能等價。
- 桌面全域任務平台位於 BoardView 左側，工作台卡片保留拖拉定位。
- 390px mobile viewport 預設 rail 不擠出看板卡片；點開 overlay 後無 document-level horizontal overflow。

## Phase 1B QC Gate（Passed）

Phase 1B 已完成本機自動化 QC。DEV-039 仍未部署正式環境；若要發布，需另取得使用者明確部署授權並執行 `deployment-release-gate`。

Executed evidence：

```powershell
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-039-task-filter-core
npm.cmd run verify:dev-039-task-filter-core-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Phase 1B QC 結果：

- 工作台左側同時存在 `未歸位` 與 `已歸位看板` placement lanes。
- 未歸位任務卡與已歸位任務卡使用同一套 task card interaction contract。
- `未歸位 -> 已歸位看板` 拖移成功，且未歸位 lane 不留重複。
- `已歸位看板 -> 未歸位` 拖移成功，且已歸位看板 lane 不留重複。
- 拖移後任務 identity、title、status、date、assignee、tags 與詳情入口保留。
- 看板 selector / 過濾器只影響已歸位看板 lane，不把 placement lane 語意變成 filter。
- 390px mobile viewport 先呈現左側 rail，點開 overlay 後可看到兩個 lane，且無 document-level horizontal overflow。

## Phase 1C QC Gate（Passed）

Phase 1C 已完成本機自動化 QC。DEV-039 仍未部署正式環境；若要發布，需另取得使用者明確部署授權並執行 `deployment-release-gate`。

Executed evidence：

```powershell
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-039-filter-result-parity-browser
npm.cmd run verify:dev-039-task-filter-core
npm.cmd run verify:dev-039-task-filter-core-browser
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Phase 1C QC 結果：

- 同一 selected board、同一組 status / due / assignee / tag / keyword filter 下，看板與全域任務平台的 `matchedTaskIds` 使用同一 projection contract。
- 看板可顯示 non-matching ancestor 作為 context，但該 ancestor 不被工作台列為 matched result。
- 全域任務平台只列出 canonical matched tasks，不列 context-only ancestor。
- 父層不符合但子任務符合時，看板仍保留 ancestor context 並顯示符合子任務。
- 看板 filter 與全域任務平台 filter 的負責人選項來源對齊到同一 selected board context。
- Phase 1/1B 的 two-column workbench、placement lanes、drag parity、no profile/save/copy、mobile viewport gates 沒有回歸。

Current QC finding：

- Phase 1C local automated QC is closed.
- Production release remains not executed and must still go through explicit deployment authorization plus `deployment-release-gate`.

## Phase 2 Cross-Board Source Slice QC Gate（Passed）

Phase 2 本輪只驗證 cross-board source 與 deletion/effective visibility slice。DEV-039 仍未部署正式環境；若要發布，需另取得使用者明確部署授權並執行 `deployment-release-gate`。

Executed evidence：

```powershell
npm.cmd run verify:dev-039-task-workbench-cross-board-source
npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

Phase 2 slice QC 結果：

- Active board A 時，`所有任務排序` 同時顯示 Board A / Board B 任務。
- 切換 active board B 後，`所有任務排序` 不收縮成 B-only。
- 到期日排序跨看板生效，早到期任務排在較晚到期任務之前。
- Archived task 不出現在 `所有任務排序`。
- Archived parent 的 descendant 即使本身未 archived，也不出現在 `所有任務排序`。
- 任務被標記 archived 後，reload 不會在排序清單復活。
- 未歸位任務仍透過 localStorage merge，未納入跨裝置同步宣稱。

Not covered / residual：

- Visible partial/error summary UI 未實作；不得宣稱部分 board 讀取失敗時已有完整 UX。
- Supabase RPC/RLS/migration、DB role matrix、正式資料修復/刪除未執行。
- Production smoke 未執行。

## Phase 2A Drag Trigger Parity QC Gate（Passed）

Phase 2A 已完成本機自動化 QC。DEV-039 仍未部署正式環境；若要發布，需另取得使用者明確部署授權並執行 `deployment-release-gate`。

Executed evidence：

```powershell
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-039-task-workbench-cross-board-source
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

Phase 2A QC 結果：

- 未歸位 row 與所有任務排序 row 都使用同一層 row root 掛 `setNodeRef`、`draggableBindings`、touch handlers、left click details 與 `onContextMenu`。
- Browser gate 驗證兩種 row 的 15% / 50% / 85% horizontal sample points 都命中同一 row-root surface，且 row 內沒有新增獨立 drag handle。
- 未歸位 row 仍可左鍵開啟 `TaskDetailsModal`；右鍵未歸位 / 已歸位 row 都開同一套 task `GlobalContextMenu`，`Escape` 可關閉，且不出現已取消的 `重新命名任務`。
- 真實拖曳流程仍可完成未歸位 -> 已歸位、已歸位 -> 未歸位雙向 placement，且不誤開詳情。
- 所有任務排序 row 保留 hierarchy indentation、文字層級與 `TaskDateBadge`。
- DEV-028 desktop/cross-mode interactions 與 DEV-029 mobile pan-first / compact action rail regression 通過。

## DB / Production 邊界

- 不需要 Supabase DB QC：Phase 1、Phase 2 slice 與 Phase 2A 沒有新增 migration、RLS、membership、profile backend schema 或 RPC；Phase 2 只接既有 `supabaseNodeService.listByProject()`，Phase 2A 只改前端 row interaction surface。
- 未改 `CalendarSubscriptionsView` / DEV-037 行事曆訂閱程式碼；DEV-037 conditional gate 可標示為 not touched。
- 未部署 production；Phase 1C 本機前置 QC 已完成。若要部署，仍需取得使用者明確授權並另走 `deployment-release-gate`。

## 殘餘風險

- 全域任務平台 Phase 2 cross-board source slice 與 Phase 2A drag trigger parity 已完成，但 visible partial/error summary UI 與 DB/RLS/RPC 權限矩陣仍需另行授權。
- 工作台每看板篩選 state 是當次 UI state，沒有跨重新整理保存；這是使用者最新要求，不是 bug。
- Phase 1B placement lanes、Phase 1C result parity 與 Phase 2A drag trigger parity 已實作並通過本機自動化 QC；目前正式環境發布仍需額外部署授權與 production smoke。
- Phase 1C 未涵蓋 production smoke；正式環境資料、瀏覽器登入狀態與遠端部署結果仍需 deployment gate 驗證。
- 若未來重新要求設定檔、跨裝置同步或團隊預設，需新增 DEV，不能回填到 DEV-039。
