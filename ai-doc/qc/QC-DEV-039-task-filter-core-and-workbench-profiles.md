# QC-DEV-039: 任務過濾器核心與全域任務平台兩欄篩選重構

關聯 DEV：DEV-039
關聯 SPEC：`ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
關聯 QA：`ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md`
狀態：Phase 1/1A + Phase 1B + Phase 1C Local Automated QC Passed / DB unchanged / Production Release Not Deployed + Requires Explicit Authorization / Phase 2 Requires Separate Authorization
執行日期：2026-07-02

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

## 驗證結果

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-039 filter result parity static | Pass | `npm.cmd run verify:dev-039-filter-result-parity`，26/26 |
| DEV-039 filter result parity browser | Pass | `npm.cmd run verify:dev-039-filter-result-parity-browser` |
| DEV-039 placement static | Pass | `npm.cmd run verify:dev-039-task-workbench-placement-lanes`，19/19 |
| DEV-039 placement browser | Pass | `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` |
| DEV-039 static | Pass | `npm.cmd run verify:dev-039-task-filter-core`，61/61 |
| DEV-039 browser | Pass | `npm.cmd run verify:dev-039-task-filter-core-browser` |
| DEV-027D static | Pass | `npm.cmd run verify:dev-027d-mindmap-date-display-filter`，11/11 |
| DEV-027D browser | Pass | `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser` |
| DEV-028 static | Pass | `npm.cmd run verify:dev-028-cross-mode-task-interactions`，35/35 |
| DEV-028 browser | Pass | `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser` |
| DEV-034 static | Pass | `npm.cmd run verify:dev-034-pwa-install-guidance`，24/24 |
| DEV-034 browser | Pass | `npm.cmd run verify:dev-034-pwa-install-guidance-browser` |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Build | Pass | `npm.cmd run build` |

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

## DB / Production 邊界

- 不需要 Supabase DB QC：Phase 1 沒有新增 migration、RLS、membership、profile backend schema 或 RPC。
- 未改 `CalendarSubscriptionsView` / DEV-037 行事曆訂閱程式碼；DEV-037 conditional gate 可標示為 not touched。
- 未部署 production；Phase 1C 本機前置 QC 已完成。若要部署，仍需取得使用者明確授權並另走 `deployment-release-gate`。

## 殘餘風險

- 全域任務平台 Phase 1 只能處理目前已載入任務集合；Phase 2 需要另行授權補真正全部可見任務資料來源與權限證明。
- 工作台每看板篩選 state 是當次 UI state，沒有跨重新整理保存；這是使用者最新要求，不是 bug。
- Phase 1B placement lanes 與 Phase 1C result parity 已實作並通過本機自動化 QC；目前正式環境發布仍需額外部署授權與 production smoke。
- Phase 1C 未涵蓋 production smoke；正式環境資料、瀏覽器登入狀態與遠端部署結果仍需 deployment gate 驗證。
- 若未來重新要求設定檔、跨裝置同步或團隊預設，需新增 DEV，不能回填到 DEV-039。
