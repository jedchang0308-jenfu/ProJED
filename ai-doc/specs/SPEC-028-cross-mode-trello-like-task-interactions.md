# SPEC-028: 四模式一致的 Trello-like 任務操作契約

狀態: Implemented / Browser Smoke Passed (2026-06-26)
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
- 2C: 新增任務命名採桌機/手機分流；桌機四模式新增後只選取新任務，直接打字才開始改名；手機新增後自動開啟命名鍵盤。
- 3A: 右鍵/長按在四模式都開任務操作選單；心智圖關聯線建立改由 toolbar、快捷鍵或明確 selected-node action 進入。
- 4A: 單擊既有任務 = 選取 + 開詳情；關閉詳情後保留該任務選取狀態。
- 5A: 第一版詳情容器保留既有 `TaskDetailsModal`，不改成抽屜或新 Card back 容器。
- 6A: 選取視覺採最小化 selected highlight / ring，不在本 DEV 擴成完整四模式鍵盤導航專案。
- 不把 Level 3+ 下層任務預設收進 Card back。
- 不做看板卡片正面資訊降噪；卡片正面仍保留目前資訊密度。
- 桌機拖曳可往 Trello 手感靠攏，手機要避免與捲動衝突。
- 清單、心智圖、看板、甘特四個模式必須高度一致。

## HCS 思考習慣

- `#受眾`: 主要受眾是熟悉 Trello / Xmind / 甘特工具的專案使用者，需要低摩擦切換模式。
- `#類比`: Trello card back 作為任務詳情模型；Xmind 的 selection-first 鍵盤操作保留為心智圖專用能力。
- `#差距分析`: 現況各模式點擊、改名、拖曳與詳情入口不一致，造成閱讀與編輯意圖混淆。
- `#系統描繪`: 四模式共享 WBS 任務資料，但 UI entrypoints 分散在 WbsNodeItem、MindMapNode、KanbanCard、KanbanChecklist、GanttTaskBar、SharedTaskSidebar。
- `#可驗證性`: 用四模式 browser flow、DOM selector、keyboard trace、viewport screenshot 驗證同一操作在不同模式下結果一致。

## Cross-Mode 操作契約

| 使用者意圖 | 清單 | 心智圖 | 看板 | 甘特 |
|---|---|---|---|---|
| 閱讀任務詳情 | 單擊任務列或標題 = 選取 + 開詳情 | 單擊節點 = 選取 + 開詳情 | 單擊卡片或下層任務 = 選取 + 開詳情 | 單擊任務條或左側任務列 = 選取 + 開詳情 |
| 改任務名稱 | 鉛筆、右鍵重新命名、`t`、F2；桌機新增後可直接打字 | 鉛筆、右鍵重新命名、`t`、F2、直接打字 | 鉛筆、右鍵重新命名、`t`、F2；桌機新增後可直接打字 | 鉛筆、右鍵重新命名、`t`、F2；桌機新增後可直接打字 |
| 展開/收合 | 展開箭頭 | 展開箭頭 | 展開箭頭 | 左側任務樹展開箭頭 |
| 任務移動/排序 | 拖曳把手 | 拖曳節點 | 桌機卡片可拖；手機用把手/長按 | 不用一般拖曳排序；任務條拖曳代表排程 |
| 更多操作 | 右鍵或長按開任務操作選單 | 右鍵或長按開任務操作選單；關聯線改走 toolbar / shortcut / selected-node action | 右鍵或長按開任務操作選單 | 右鍵或長按開任務操作選單 |
| 日期/依賴 | 點日期/依賴控制，不開詳情 | 詳情或專用關聯/依賴模式，不被單擊詳情攔截 | 點日期/依賴控制，不開詳情 | 拖曳/拉伸任務條調整日期，不開詳情 |
| 快捷鍵 | `Enter` 開詳情、`t`/F2 改名 | `Enter` 新增同階、`Tab` 新增子階、方向鍵導航、直接打字改名 | `Enter` 開詳情、`t`/F2 改名 | `Enter` 開詳情、`t`/F2 改名 |

## 目標互動

### 1. 任務詳情入口

- 新增共用 `openTaskDetails(taskId)` 或等效 store action，四模式只透過共用入口開啟任務詳情。
- `TaskDetailsModal` 作為第一版 Trello Card back，不另建資料模型。
- 單擊既有任務時，必須先更新全域或模式內 selected task，再開啟 `TaskDetailsModal`；關閉詳情後保留該 selection。
- `GlobalContextMenu` 或全域 UI 容器必須能在沒有右鍵選單開啟時接收開詳情事件。
- 單擊互動元件本身不得開詳情，例如狀態 select、負責人 select、日期 input、依賴按鈕、展開箭頭、拖曳把手、inline edit input。
- 甘特與月曆既有「點任務切回清單」行為不得延續到四模式契約；甘特任務點擊應就地開詳情。

### 2. 改名入口

- 任務名稱不再以單擊標題進入改名。
- 四模式統一提供明確改名入口: 鉛筆 icon、右鍵選單重新命名、`t`、F2。
- 心智圖保留 SPEC-027B 的直接打字改名能力，但此能力只在詳情未開啟、節點已選取、且沒有 input/textarea/select 聚焦時生效。
- 新增任務後的命名流程採 2C:
  - 桌機四模式新增任務後只選取新任務並顯示最小 selected highlight / ring；直接輸入可列印字元時，才進入 rename 並保留第一個字元。
  - 手機四模式新增任務後自動進入命名輸入並開啟鍵盤，避免觸控環境缺少「直接打字」入口。
  - 直接打字改名不得在 `TaskDetailsModal` 開啟、輸入框聚焦、IME composition 中、拖曳中、關聯線模式或會議任務選取模式中觸發。

### 3. 心智圖一致性邊界

- 心智圖單擊節點必須符合四模式契約: 開啟詳情。
- 開啟詳情前仍要更新 selected node；關閉詳情後，selection 應保持在剛剛開啟的節點。
- 心智圖的 `Enter`、`Tab`、方向鍵、Delete、拖曳、縮放、關聯線模式依 SPEC-027B / SPEC-027E 保留。
- 心智圖右鍵/長按改為任務操作選單；關聯線建立不得再佔用一般右鍵，需改由 toolbar、快捷鍵或 selected-node action 觸發。
- 關聯線建立模式、拖曳中、inline label edit、relationship endpoint/control-point 操作時，節點點擊不得誤開任務詳情。

### 4. 看板一致性邊界

- 看板卡片正面資訊不降噪，Level 3+ 下層任務繼續顯示在卡片內。
- 單擊卡片與卡片內下層任務開詳情；點鉛筆才改名。
- 桌機卡片拖曳可擴大到整卡或主要卡面，但必須排除互動元件。
- 手機維持拖曳把手/長按策略，避免上下捲動時誤拖。
- 會議紀錄任務選取模式優先於開詳情，維持點卡片插入 task mention。

### 5. 甘特一致性邊界

- 單擊任務條開詳情。
- 任務條拖曳或左右拉伸仍代表修改排程，不改成排序。
- 拖曳結束如果實際移動過，不得再觸發開詳情。
- 左側 SharedTaskSidebar 點任務也應開詳情，不應把使用者切回清單。

## 開發範圍

- 新增或整理共用任務詳情入口與互動 target guard。
- 改清單、心智圖、看板、甘特的任務點擊行為，使單擊任務一致開詳情。
- 改任務標題 inline edit 觸發方式，使改名入口變成明確操作。
- 增加四模式快捷鍵契約，但以模式語意優先:
  - 清單、看板、甘特: `Enter` 開詳情，`t` / F2 改名。
  - 心智圖: `Enter` 新增同階，`Tab` 新增子階，方向鍵導航，直接打字改名。
  - 共用候選鍵如 `c` 封存、`z` / `Shift+z` undo/redo 需先確認不與現有輸入、瀏覽器或模式快捷鍵衝突。
- 補四模式互動驗證腳本或 browser smoke，確認 muscle-memory contract。

## Implementation Touchpoints

RD 實作前需優先檢查下列觸點；若實際程式結構已有更集中入口，應以既有共用入口為準，避免平行新增第二套互動狀態。

| 類別 | 預期觸點 | 需確認或修改的責任 |
|---|---|---|
| 共用任務詳情入口 | `GlobalContextMenu`、`TaskDetailsModal`、任務詳情 open event/store | 建立常駐詳情入口；不依賴右鍵選單開啟狀態；確保四模式開同一個 `TaskDetailsModal`。 |
| 全域或模式選取狀態 | WBS store / view state、mind map selected node state | 支援單擊前選取、詳情關閉後保留選取、桌機新增後直接打字改名。 |
| 清單模式 | `WbsNodeItem`、清單 row/title/action controls | 將 row/title click 改為選取 + 開詳情；鉛筆、右鍵、`t`、F2 才改名；互動 controls 不誤開詳情。 |
| 看板模式 | `KanbanCard`、`KanbanColumn`、`KanbanChecklist`、`TaskDragHandle` | 卡片與下層任務 click 開詳情；保留 Level 3+ 與卡片正面資訊；桌機拖曳與手機長按/把手不得和詳情 click 衝突。 |
| 心智圖模式 | `MindMapView`、`MindMapNode`、`mindMapKeyboard`、relationship toolbar / controls | 單擊節點選取 + 開詳情；`Enter`/`Tab`/方向鍵與直接打字改名保留；右鍵/長按改任務選單；關聯線入口移出一般右鍵。 |
| 甘特模式 | `GanttTaskBar`、`SharedTaskSidebar` | 任務條與左側任務列 click 開詳情；drag/resize 排程後不觸發詳情；不再以點任務切回清單作為主要行為。 |
| 觸控與拖曳基礎 | `useDragSensors`、`useLongPress` | 維持手機上下捲動安全；長按只開任務操作選單或拖曳流程，不造成 click-through 開詳情。 |
| 自動化驗證 | `scripts/verify-dev-028-*`、`package.json` scripts | 新增 static 與 browser verifier，覆蓋 click-to-details、explicit rename、selection retention、mobile naming、right-click/long-press 與 drag/click collision。 |

實作注意:

- 若某個元件名稱已移動或合併，RD 應在實作報告中記錄實際觸點，不需要為了符合本表而保留舊檔案結構。
- `selectedTaskId` 或等效狀態需避免和心智圖既有 `selectedNodeId` 互相覆蓋；可以採共用 task selection + 模式內 projection，但不得讓模式切換後 selection 指向不存在或已封存任務。
- 任何 target guard 都必須以語意判斷互動元件，不得只靠 CSS class name；至少涵蓋 input、textarea、select、button、drag handle、date/dependency controls、relationship controls、meeting mention picker。
- Mobile naming 若無法可靠驗證實體鍵盤彈出，至少需有 focus 到命名 input、可輸入文字、無 viewport overflow 的 browser evidence。

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
- 建立或統一足以支援四模式的 selected task state，至少支援單擊開詳情前選取、詳情關閉後保留選取、桌機新增後直接打字改名。
- 讓全域詳情監聽常駐，不依賴右鍵選單是否開啟。
- 補互動 target guard，避免 status / assignee / date / dependency controls、inputs、drag handles、expand buttons、relationship controls、meeting mention pickers 誤開詳情。

### Slice 2: 清單 / 看板點擊與改名分離

- 清單任務列與看板卡片單擊開詳情。
- 標題單擊不再直接改名。
- 鉛筆與右鍵重新命名進入 inline edit。
- 桌機新增任務後只選取新任務，直接打字才進入 rename；手機新增任務後自動開命名鍵盤。
- 新增任務與既有任務 selection 使用最小 selected highlight / ring。
- 保留看板 Level 3+ 正面顯示。

### Slice 3: 心智圖契約對齊

- 心智圖節點單擊開詳情並保存 selected node。
- 詳情關閉後恢復 selection-first keyboard flow。
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
- 新增 DEV-028 browser verifier，覆蓋四模式 click-to-details、rename explicitness、drag/no-click collision、mobile viewport。
- 跑既有 DEV-027B / DEV-027E 心智圖回歸，避免破壞 Xmind-like 操作。

## 驗收標準

- [ ] 清單、心智圖、看板、甘特四模式中，單擊既有任務都先選取該任務，再開啟同一個 `TaskDetailsModal`。
- [ ] 關閉 `TaskDetailsModal` 後，剛剛開啟的任務仍保持選取，並有最小 selected highlight / ring。
- [ ] 四模式中，單擊任務名稱不會直接進入改名。
- [ ] 四模式中，鉛筆、右鍵重新命名、`t`、F2 可進入改名；input 聚焦時快捷鍵不攔截文字輸入。
- [ ] 桌機四模式新增任務後只選取新任務，直接打字才進入 rename，且第一個輸入字元不遺失。
- [ ] 手機四模式新增任務後自動開啟命名輸入與鍵盤。
- [ ] 看板 Level 3+ 下層任務仍顯示在卡片正面。
- [ ] 看板卡片正面既有日期、依賴、標籤、進度等資訊不因本規格被移除。
- [ ] 心智圖關閉任務詳情後，原節點仍保持選取，方向鍵、Enter/Tab 新增、直接打字改名回歸可用。
- [ ] 心智圖 `Enter` 保留新增同階；清單、看板、甘特 `Enter` 開詳情。
- [ ] 甘特任務條拖曳或拉伸排程後不會再打開詳情。
- [ ] 右鍵/長按在四模式都開任務操作選單；心智圖關聯線建立改由 toolbar、快捷鍵或 selected-node action 觸發。
- [ ] 會議紀錄任務選取模式、依賴選取模式、心智圖關聯線模式優先於一般開詳情行為。
- [ ] Desktop 與 390x844 mobile viewport 下沒有任務詳情、鉛筆、長按選單、拖曳控制重疊或裁切。

## QA / QC 驗證計畫

- Static gate:
  - 檢查四模式任務 click handler 都走共用詳情入口。
  - 檢查標題 click 不再直接呼叫 title edit。
  - 檢查 `GlobalContextMenu` 詳情入口不依賴 context menu open state。
  - 檢查 `TaskDetailsModal` 仍是第一版唯一詳情容器。
- Browser gate:
  - 在清單、心智圖、看板、甘特各點一個任務，確認同一個 `TaskDetailsModal` 開啟。
  - 關閉詳情後確認剛點擊任務仍被選取，且 selected highlight / ring 在桌機與手機不造成遮擋。
  - 桌機新增任務後直接輸入文字，確認進入 rename 並保留第一個字元；手機新增任務後確認鍵盤命名入口開啟。
  - 點狀態、負責人、日期、依賴、展開箭頭、拖曳把手，不開詳情。
  - 看板 Level 3+ 正面可見，點下層任務開詳情。
  - 心智圖開詳情、關閉、方向鍵導航、Enter/Tab 新增、直接打字改名仍可用；右鍵開任務操作選單。
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
