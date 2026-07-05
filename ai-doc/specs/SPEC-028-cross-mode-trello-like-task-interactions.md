# SPEC-028: 四模式一致的 Trello-like 任務操作契約

狀態: Implemented / Browser Smoke Passed (2026-06-26) / 2026-07-05 Detail-Only Title Edit Addendum RD Contract Ready / Not Authorized
對應 DEV: DEV-028
節點類型: 交付點
是否計入產品交付完成: 是
建立日期: 2026-06-26

## 任務目標

將 ProJED 的清單、心智圖、看板、甘特四個主要模式統一成同一套任務操作邏輯，讓使用者在模式切換時維持一致的肌肉記憶。

成功狀態:

- 使用者在清單、心智圖、看板、甘特中單擊既有任務時，都先選取任務，再進入同一個任務詳情入口。
- 任務名稱不再因單擊任務或單擊標題而立即進入編輯。
- 改名、拖曳、展開、右鍵/長按、日期/依賴操作在四模式中的觸發語意一致。
- 保留四模式各自的專用能力，例如心智圖鍵盤導航、看板卡片階層顯示、甘特排程拖曳。

## 背景與問題

目前系統偏向「編輯優先」: 點擊任務標題常直接進入名稱編輯，導致使用者想閱讀或移動畫面時容易誤觸。使用者希望改成接近 Trello 的操作邏輯，降低 Trello 使用者跳槽到 ProJED 的摩擦力。

使用者已確認以下決策:

- 1A: 快捷鍵採模式優先；清單、看板、甘特的 `Enter` 開詳情，心智圖的 `Enter` 保留新增同階任務。
- 2C: 新增任務命名原採桌機/手機分流；此項已被 2026-07-05 title-edit decision 取代，新增任務若需命名，必須導向任務詳情頁 title edit，不再使用外層直接打字或外層命名鍵盤。
- 3A: 右鍵/長按在四模式都開任務操作選單；心智圖關聯線建立改由 toolbar、快捷鍵或明確 selected-node action 進入。
- 4A: 單擊既有任務 = 選取 + 開詳情；關閉詳情後保留該任務選取狀態。
- 5A: 第一版詳情容器保留既有 `TaskDetailsModal`，不改成抽屜或新 Card back 容器。
- 6A: 選取視覺採最小化 selected highlight / ring，不在本 DEV 擴成完整四模式鍵盤導航專案。
- 不把 Level 3+ 下層任務預設收進 Card back。
- 不做看板卡片正面資訊降噪；卡片正面仍保留目前資訊密度。
- 桌機拖曳可往 Trello 手感靠攏，手機要避免與捲動衝突。
- 清單、心智圖、看板、甘特四個模式必須高度一致。
- 2026-07-04 compatibility note: DEV-029 接管手機 coarse pointer 的 pan-first 手勢仲裁；手機任務卡 / 任務列短滑安全優先於 click-to-details，長按任務操作選單仍保留。
- 2026-07-05 title-edit decision: 任務名稱編輯入口改為「只能先進入任務詳情，再在詳情頁任務名稱區編輯」；看板卡片、L3 待辦列、工作台排序列、清單列、甘特列與心智圖節點不得再提供鉛筆、F2、`t`、右鍵重新命名、標題雙擊或直接打字 rename。

## HCS 思考習慣

- `#受眾`: 主要受眾是熟悉 Trello / Xmind / 甘特工具的專案使用者，需要低摩擦切換模式。
- `#類比`: Trello card back 作為任務詳情模型；Xmind 的 selection-first 鍵盤操作保留為心智圖專用能力。
- `#差距分析`: 現況各模式點擊、改名、拖曳與詳情入口不一致，造成閱讀與編輯意圖混淆。
- `#系統描繪`: 四模式共享 WBS 任務資料，但 UI entrypoints 分散在 WbsNodeItem、MindMapNode、KanbanCard、KanbanChecklist、GanttTaskBar、SharedTaskSidebar。
- `#可驗證性`: 用四模式 browser flow、DOM selector、keyboard trace、viewport screenshot 驗證同一操作在不同模式下結果一致。

## Cross-Mode 操作契約

| 使用者意圖 | 清單 | 心智圖 | 看板 | 甘特 |
|---|---|---|---|---|
| 閱讀任務詳情 | 單擊任務列或標題 = 選取 + 開詳情 | 單擊節點 = 選取 + 開詳情 | 單擊卡片或下層任務 = 選取 + 開詳情；手機短滑依 DEV-029 優先 pan，不誤開詳情 | 單擊任務條或左側任務列 = 選取 + 開詳情 |
| 改任務名稱 | 先開任務詳情，再點詳情頁任務名稱區編輯；列表列本身不提供 rename | 先開任務詳情，再點詳情頁任務名稱區編輯；節點本身不提供 rename | 先開任務詳情，再點詳情頁任務名稱區編輯；卡片、L3+ 待辦列與工作台任務列本身不提供 rename | 先開任務詳情，再點詳情頁任務名稱區編輯；甘特列/任務條本身不提供 rename |
| 展開/收合 | 展開箭頭 | 展開箭頭 | 展開箭頭 | 左側任務樹展開箭頭 |
| 任務移動/排序 | 拖曳把手 | 拖曳節點 | 桌機卡片可拖；手機用把手/長按 | 不用一般拖曳排序；任務條拖曳代表排程 |
| 更多操作 | 右鍵或長按開任務操作選單 | 右鍵或長按開任務操作選單；關聯線改走 toolbar / shortcut / selected-node action | 右鍵或長按開任務操作選單 | 右鍵或長按開任務操作選單 |
| 日期/依賴 | 點日期/依賴控制，不開詳情 | 詳情或專用關聯/依賴模式，不被單擊詳情攔截 | 點日期/依賴控制，不開詳情 | 拖曳/拉伸任務條調整日期，不開詳情 |
| 快捷鍵 | `Enter` 開詳情；不提供全域 rename 快捷鍵 | `Enter` 新增同階、`Tab` 新增子階、方向鍵導航；不提供節點外層直接打字 rename | `Enter` 開詳情；不提供全域 rename 快捷鍵 | `Enter` 開詳情；不提供全域 rename 快捷鍵 |

## 目標互動

### 1. 任務詳情入口

- 新增共用 `openTaskDetails(taskId)` 或等效 store action，四模式只透過共用入口開啟任務詳情。
- `TaskDetailsModal` 作為第一版 Trello Card back，不另建資料模型。
- 單擊既有任務時，必須先更新全域或模式內 selected task，再開啟 `TaskDetailsModal`；關閉詳情後保留該 selection。
- `GlobalContextMenu` 或全域 UI 容器必須能在沒有右鍵選單開啟時接收開詳情事件。
- 單擊互動元件本身不得開詳情，例如狀態 select、負責人 select、日期 input、依賴按鈕、展開箭頭、拖曳把手、inline edit input。
- 甘特與月曆既有「點任務切回清單」行為不得延續到四模式契約；甘特任務點擊應就地開詳情。

### 2. 改名入口

- 2026-07-05 起，本節取代舊版「鉛筆 / 右鍵重新命名 / `t` / F2 / 直接打字」rename contract。
- 任務名稱編輯唯一入口：先開啟 `TaskDetailsModal` 或等效任務詳情頁，再在詳情頁的任務名稱區進入編輯。
- 任務詳情頁的任務名稱 UI 不得像純靜態文字；需使用可編輯標題視覺，例如淡色底、細邊框、hover / focus outline、常駐或 hover 可見的小鉛筆 affordance，讓使用者理解「點這裡可編輯」。
- 看板卡片、L3+ 待辦列、工作台排序列、未歸位列、清單列、甘特列 / 任務條與心智圖節點不得提供外層 rename 入口：不得有可點鉛筆、F2、`t`、右鍵重新命名、雙擊標題或直接打字 rename。
- 右鍵 / 長按任務操作選單可保留其他任務操作，但不得提供「重新命名」；若需要改名，選單可提供「開啟詳情」或引導到詳情頁，不可直接叫出外層 inline input。
- 新增任務命名若目前仍依賴外層 inline rename，RD 必須改為建立後開啟任務詳情，或建立後以詳情頁標題輸入作為命名入口；不得保留卡片/列上的 rename input 作為新增後命名捷徑。

### 3. 心智圖一致性邊界

- 心智圖單擊節點必須符合四模式契約: 開啟詳情。
- 開啟詳情前仍要更新 selected node；關閉詳情後，selection 應保持在剛剛開啟的節點。
- 心智圖的 `Enter`、`Tab`、方向鍵、Delete、拖曳、縮放、關聯線模式依 SPEC-027B / SPEC-027E 保留。
- 心智圖右鍵/長按改為任務操作選單；關聯線建立不得再佔用一般右鍵，需改由 toolbar、快捷鍵或 selected-node action 觸發。
- 關聯線建立模式、拖曳中、inline label edit、relationship endpoint/control-point 操作時，節點點擊不得誤開任務詳情。

### 4. 看板一致性邊界

- 看板卡片正面資訊不降噪，Level 3+ 下層任務繼續顯示在卡片內。
- 單擊卡片與卡片內下層任務開詳情；任務名稱只能在任務詳情頁編輯。
- 桌機卡片拖曳可擴大到整卡或主要卡面，但必須排除互動元件。
- 手機 coarse pointer 依 DEV-029 採 pan-first：任務卡主體短滑優先移動畫面並 suppress click-through；長按 / explicit drag handle 才進入任務功能，避免上下捲動時誤拖或誤開詳情。
- 會議紀錄任務選取模式優先於開詳情，維持點卡片插入 task mention。

### 5. 甘特一致性邊界

- 單擊任務條開詳情。
- 任務條拖曳或左右拉伸仍代表修改排程，不改成排序。
- 拖曳結束如果實際移動過，不得再觸發開詳情。
- 左側 SharedTaskSidebar 點任務也應開詳情，不應把使用者切回清單。

## 開發範圍

- 新增或整理共用任務詳情入口與互動 target guard。
- 改清單、心智圖、看板、甘特的任務點擊行為，使單擊任務一致開詳情。
- 移除任務外層 surface 的 title inline edit 觸發方式，使改名只存在於任務詳情頁。
- 調整 `TaskDetailsModal` 任務名稱區，使其具備明確可編輯視覺與可點擊編輯狀態。
- 增加四模式快捷鍵契約，但以模式語意優先:
  - 清單、看板、甘特: `Enter` 開詳情；`t` / F2 不再作為外層 rename 快捷鍵。
  - 心智圖: `Enter` 新增同階，`Tab` 新增子階，方向鍵導航；直接打字不再作為外層 rename 快捷鍵。
  - 共用候選鍵如 `c` 封存、`z` / `Shift+z` undo/redo 需先確認不與現有輸入、瀏覽器或模式快捷鍵衝突。
- 補四模式互動驗證腳本或 browser smoke，確認 muscle-memory contract。

## Implementation Touchpoints

RD 實作前需優先檢查下列觸點；若實際程式結構已有更集中入口，應以既有共用入口為準，避免平行新增第二套互動狀態。

| 類別 | 預期觸點 | 需確認或修改的責任 |
|---|---|---|
| 共用任務詳情入口 | `GlobalContextMenu`、`TaskDetailsModal`、任務詳情 open event/store | 建立常駐詳情入口；不依賴右鍵選單開啟狀態；確保四模式開同一個 `TaskDetailsModal`。 |
| 全域或模式選取狀態 | WBS store / view state、mind map selected node state | 支援單擊前選取、詳情關閉後保留選取；不得依賴選取後外層直接打字改名。 |
| 任務詳情頁 | `TaskDetailsModal`、title field / title heading、save/cancel flow | 任務名稱區需有可編輯視覺；點擊後進入 title edit；儲存 / 取消 / 失焦策略需一致且可驗證。 |
| 清單模式 | `WbsNodeItem`、清單 row/title/action controls | row/title click 選取 + 開詳情；移除鉛筆、右鍵重新命名、`t`、F2、外層 title input；互動 controls 不誤開詳情。 |
| 看板模式 | `KanbanCard`、`KanbanColumn`、`KanbanChecklist`、`TaskDragHandle`、`TaskWorkbenchPanel` | 卡片、L3+ 待辦列、工作台任務列 click 開詳情；移除外層 rename 入口；保留 Level 3+ 與卡片正面資訊；桌機拖曳與詳情 click 互斥；手機短滑/pan 仲裁依 DEV-029。 |
| 心智圖模式 | `MindMapView`、`MindMapNode`、`mindMapKeyboard`、relationship toolbar / controls | 單擊節點選取 + 開詳情；`Enter`/`Tab`/方向鍵保留；移除節點外層直接打字改名、右鍵重新命名與 F2 rename；關聯線入口不受影響。 |
| 甘特模式 | `GanttTaskBar`、`SharedTaskSidebar` | 任務條與左側任務列 click 開詳情；drag/resize 排程後不觸發詳情；不再以點任務切回清單作為主要行為。 |
| 觸控與拖曳基礎 | `useDragSensors`、`useLongPress`、`useTouchTapGuard` | 維持手機上下捲動安全；DEV-029 要求手機短滑優先 pan 並 suppress click-through；長按只開任務操作選單或拖曳流程，不造成 click-through 開詳情。 |
| 自動化驗證 | `scripts/verify-dev-028-*`、`package.json` scripts | 新增 static 與 browser verifier，覆蓋 click-to-details、detail-only title edit、外層 rename 移除、selection retention、new-task title edit、right-click/long-press 與 drag/click collision。 |

實作注意:

- 若某個元件名稱已移動或合併，RD 應在實作報告中記錄實際觸點，不需要為了符合本表而保留舊檔案結構。
- `selectedTaskId` 或等效狀態需避免和心智圖既有 `selectedNodeId` 互相覆蓋；可以採共用 task selection + 模式內 projection，但不得讓模式切換後 selection 指向不存在或已封存任務。
- 任何 target guard 都必須以語意判斷互動元件，不得只靠 CSS class name；至少涵蓋 input、textarea、select、button、drag handle、date/dependency controls、relationship controls、meeting mention picker。
- New-task naming 若需要立即命名，至少需有詳情頁 title edit focus、可輸入文字、無 viewport overflow 的 browser evidence；不得以外層任務列 / 卡片 rename input 作為證據。

## 不在範圍

- 不降低看板卡片正面資訊密度。
- 不把 Level 3+ 下層任務預設收進 Card back。
- 不重做 `TaskDetailsModal` 內部資訊架構。
- 不把 `TaskDetailsModal` 在本 DEV 改成右側抽屜或新詳情容器。
- 不新增資料庫 schema、migration、RLS policy。
- 不重做日曆模式；日曆標示開發中，後續實作時必須沿用本規格操作契約。
- 不改會議紀錄資料模型或 task mention 格式。
- 不在本 DEV 擴充完整四模式鍵盤導航；只建立本規格列出的必要快捷鍵與 selected highlight。

## RD 執行切片

### Slice 1: 共用詳情入口與事件生命週期

- 建立共用 `openTaskDetails(taskId)` 或 store action。
- 建立或統一足以支援四模式的 selected task state，至少支援單擊開詳情前選取、詳情關閉後保留選取；不得把 selected task state 當成外層直接打字改名入口。
- 讓全域詳情監聽常駐，不依賴右鍵選單是否開啟。
- 補互動 target guard，避免 status / assignee / date / dependency controls、inputs、drag handles、expand buttons、relationship controls、meeting mention pickers 誤開詳情。

### Slice 2: 任務詳情頁 title edit 與外層 rename 移除

- `TaskDetailsModal` 任務名稱區改成可編輯標題視覺，支援點擊進入 title edit。
- 清單任務列、看板卡片、L3+ 待辦列、工作台任務列與甘特任務列單擊都只開詳情，不提供外層 rename。
- 移除或停用鉛筆、右鍵重新命名、`t`、F2、雙擊標題、外層直接打字 rename 與外層 inline title input。
- 新增任務後若需命名，必須導向任務詳情頁 title edit，不得在任務列或卡片上直接開 rename input。
- 新增任務與既有任務 selection 使用最小 selected highlight / ring。
- 保留看板 Level 3+ 正面顯示。

### Slice 3: 心智圖契約對齊

- 心智圖節點單擊開詳情並保存 selected node。
- 詳情關閉後恢復 selection-first keyboard flow，但直接打字不再進入節點外層 rename。
- 右鍵/長按改為任務操作選單。
- 關聯線建立入口移至 toolbar、快捷鍵或 selected-node action。
- 關聯模式、拖曳、inline relationship edit 不被開詳情攔截。

### Slice 4: 甘特契約對齊

- 甘特任務條與左側任務列單擊開詳情。
- 排程拖曳與 resize 後不得觸發詳情。
- 不再透過點任務切回清單。

### Slice 5: 快捷鍵與驗證

- 統一非輸入聚焦狀態下的快捷鍵契約。
- 明確寫入 1A 差異: 清單/看板/甘特 `Enter` 開詳情，心智圖 `Enter` 新增同階。
- 新增 DEV-028 browser verifier，覆蓋四模式 click-to-details、detail-only title edit、外層 rename 移除、drag/no-click collision、mobile viewport。
- 跑既有 DEV-027B / DEV-027E 心智圖回歸，避免破壞 Xmind-like 操作。

## 驗收標準

- [ ] 清單、心智圖、看板、甘特四模式中，單擊既有任務都先選取該任務，再開啟同一個 `TaskDetailsModal`。
- [ ] 關閉 `TaskDetailsModal` 後，剛剛開啟的任務仍保持選取，並有最小 selected highlight / ring。
- [ ] 四模式中，單擊任務名稱不會直接進入外層改名，而是開啟任務詳情。
- [ ] 任務名稱只能在 `TaskDetailsModal` / 任務詳情頁內編輯；詳情頁任務名稱區具備明確可編輯視覺。
- [ ] 鉛筆、右鍵重新命名、`t`、F2、雙擊標題、直接打字不得在任務卡、任務列、工作台列、甘特列或心智圖節點外層進入 rename。
- [ ] 桌機與手機新增任務後若需要命名，必須進入任務詳情頁 title edit，不得在外層任務列 / 卡片直接開 rename input。
- [ ] 看板 Level 3+ 下層任務仍顯示在卡片正面。
- [ ] 看板卡片正面既有日期、依賴、標籤、進度等資訊不因本規格被移除。
- [ ] 心智圖關閉任務詳情後，原節點仍保持選取，方向鍵、Enter/Tab 新增可用，但直接打字不得進入節點外層 rename。
- [ ] 心智圖 `Enter` 保留新增同階；清單、看板、甘特 `Enter` 開詳情。
- [ ] 甘特任務條拖曳或拉伸排程後不會再打開詳情。
- [ ] 右鍵/長按在四模式都開任務操作選單；心智圖關聯線建立改由 toolbar、快捷鍵或 selected-node action 觸發。
- [ ] 會議紀錄任務選取模式、依賴選取模式、心智圖關聯線模式優先於一般開詳情行為。
- [ ] Desktop 與 390x844 mobile viewport 下沒有任務詳情、標題編輯 affordance、長按選單、拖曳控制重疊或裁切。

## QA / QC 驗證計畫

- Static gate:
  - 檢查四模式任務 click handler 都走共用詳情入口。
  - 檢查標題 click 不再直接呼叫外層 title edit。
  - 檢查外層任務 surface 不再暴露 rename pencil、right-click rename、`t`、F2、direct typing rename。
  - 檢查 `TaskDetailsModal` 內任務名稱區存在可編輯 affordance 與 title edit path。
  - 檢查 `GlobalContextMenu` 詳情入口不依賴 context menu open state。
  - 檢查 `TaskDetailsModal` 仍是第一版唯一詳情容器。
- Browser gate:
  - 在清單、心智圖、看板、甘特各點一個任務，確認同一個 `TaskDetailsModal` 開啟。
  - 關閉詳情後確認剛點擊任務仍被選取，且 selected highlight / ring 在桌機與手機不造成遮擋。
  - 桌機與手機新增任務後確認命名入口落在任務詳情頁 title edit，不在外層任務列 / 卡片。
  - 點狀態、負責人、日期、依賴、展開箭頭、拖曳把手，不開詳情。
  - 看板 Level 3+ 正面可見，點下層任務開詳情。
  - 心智圖開詳情、關閉、方向鍵導航、Enter/Tab 新增仍可用；直接打字不進外層 rename；右鍵開任務操作選單但不含重新命名。
  - 心智圖關聯線建立入口改由 toolbar、快捷鍵或 selected-node action 觸發，不再佔用一般右鍵。
  - 甘特拖曳移動、左右拉伸與單擊開詳情互斥。
- Regression gate:
  - `npm.cmd run verify:dev-028-cross-mode-task-interactions`
  - `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`
  - `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
  - `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`
  - `npm.cmd exec tsc -- --noEmit`
  - `npm.cmd run lint -- --quiet`
  - `npm.cmd run build:test`

## 規格治理 Gate

已檢查文件:

- `ai-doc/specs/SPEC-001-unified-compact-ui-system.md`
- `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md`
- `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md`
- `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md`
- `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md`
- `ai-doc/dev_task.md`
- `ai-doc/documentation_map.md`
- `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md`

一致性判定:

- 與 SPEC-001 相容: SPEC-001 管視覺密度與共用 UI，本規格管跨模式操作契約。
- 與 SPEC-026 相容: 兩者都以降低 Trello 使用者轉換成本為目的，範圍不同。
- 與 SPEC-027B 有明確修訂邊界: 心智圖 selection-first 鍵盤流保留，但一般單擊節點改為同時選取並開詳情；關聯模式與鍵盤導航不受影響。
- 與 SPEC-027E 相容: relationship line 操作優先於任務詳情開啟，避免線條編輯被任務點擊攔截。

ADR 判定:

- 本規格不新增 ADR。理由: 變更限於 UI interaction contract，不改主資料、身份、狀態機、權限、資料庫 schema、API 或 release gate；若 RD 後續決定將詳情入口改成 store state 或 URL routing，才需要另補 ADR。

阻塞:

- 無 RD blocker。實作前需保留本規格列出的模式優先序，尤其是心智圖關聯模式、會議紀錄任務選取模式與甘特排程拖曳。

## 相關文件

- DEV 主控: `ai-doc/dev_task.md`
- QA 驗證計畫: `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md`
- 文件索引: `ai-doc/documentation_map.md`
- 視覺一致性基線: `ai-doc/specs/SPEC-001-unified-compact-ui-system.md`
- Trello-like 分享基線: `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md`
- 心智圖基線: `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md`
- 心智圖鍵盤/拖曳基線: `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md`
- 心智圖關聯線基線: `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md`
