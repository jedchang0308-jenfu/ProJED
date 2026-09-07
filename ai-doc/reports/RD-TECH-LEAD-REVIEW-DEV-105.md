# RD 技術主管審查：DEV-105 會議任務討論時間預約數字

- 日期：2026-09-04
- 審查對象：`ai-doc/dev_task.md`、`SPEC-105-meeting-task-reservation-number.md`、`QA-DEV-105-meeting-task-reservation-number.md` 與現行相關程式邊界
- 初判：`有條件通過`
- 修正後結論：`通過，可進入 RD 實作（Human 已確認完整 L1／L2／L3+）`
- 實作／驗證狀態：`IMPLEMENTED / QA PASS / QC PASS`
- Release：未授權

## 1. 核心判斷

DEV-105 的真正問題是：主持人在會議前無法把議題的預約數字放在任務本身，因而必須依賴外部訊息或口頭協調。最短可用解不是議程或排程子系統，而是：

```text
任一會議看板任務右鍵 → 主持人輸入單一數字 → meeting draft metadata → 各階任務有值才顯示
```

現有meeting draft metadata、record recovery與task action menu已涵蓋所需的狀態與入口。Human後續確認完整L1／L2／L3+後，最單純的規則是「meeting Board task surface一律支援」，不再以階層分支eligibility；呈現則由三個既有renderer共用單一selector與mark component，Task Details仍由host adapter邊界排除。

## 2. 關鍵發現與必要修正

| ID | 優先級 | 發現 | 風險 | 最小修正 | 狀態 |
|---|---:|---|---|---|---|
| F1 | P1 | 初審把surface收斂至L2，但Human後續確認要完整階層 | 若仍維持L2-only，主持人需記住階層例外且同一功能邏輯不完整 | 三個Board task surface使用同一eligibility；只保留Details／其他mode negative | 已由Human決策取代 |
| F2 | P1 | 為單一menu action設計`App → Scope → Binding` workflow context | 長期interaction kernel承擔暫時workflow state，形成不必要耦合 | 以`GlobalContextMenu`解析當下的opt-in profile overlay；Guard與store提交時重查 | 已修正 |
| F3 | P2 | 三個renderer若各自輸出mark會複製copy／style／aria／empty邏輯 | 後續各階外觀與空值行為漂移 | pure helper放`src/utils`；恢復單一shared mark component供L1／L2／L3+使用 | 已修正 |
| F4 | P2 | QA規劃16個automated＋8個rendered case | 同一風險重複驗證，提高維護成本與假精確度 | 合併為10個automated＋5個rendered case，保留所有P0因果鏈 | 已修正 |
| F5 | P1 | 「主持人限定」可能被誤讀為server ACL | QA可能過度宣稱安全性，留下共享metadata可被自製client修改的缺口 | 明列為隔離技術債，只宣稱官方產品路徑host-only並定義移除觸發 | 已修正／接受技術債 |

修正後沒有阻擋 RD 開工的 P0／P1 文件缺口。

## 3. 最小架構

```text
board.column-header／board.card／board.checklist-row 真實右鍵
  → resolveTaskMenu(context, MEETING_TASK_MENU_PROFILE overlay)
  → host／meeting／canonical target Guard
  → TaskActionMenu inline numeric editor
  → useRecordStore 再驗證並更新 draft.metadata
  → meetingRecordWorkflow signature／既有 recovery
  → normalized reservation map
  → KanbanColumn／KanbanCard／KanbanChecklist adapters
  → 三個renderer共用MeetingTaskReservationMark顯示無框亮黃底黑字的純數字 token
```

架構邊界：

- 不修改 TaskNode，不建立第二份 task reservation source。
- 不把 meeting workflow state 加進全域 interaction context。
- 不讓 presenter 直接 mutation，也不讓 record store 反向 import WBS store。
- 不新增 provider schema／service branch；沿用 record metadata passthrough。
- 三個Board surface共用同一menu profile與metadata selector，不依node level複製business rule。
- L3+ reservation map只由`KanbanChecklist` host adapter注入；Task Details共用tree不注入。
- `titleTrailing`保留暫時控制，L2新增`rowTrailing`承接toggle，確保date → mark → toggle。

## 4. 事實、決策與推論界線

### 現行程式事實

- `createDefaultDraft()`已建立stable draft ID；meeting metadata有既有local／cloud recovery路徑。
- `TaskActionMenu`、action catalog／profile／resolver／Guard可承接右鍵行為。
- 現行surface ID已區分`board.column-header`、`board.card`與`board.checklist-row`。
- `KanbanColumnPresentation`、`KanbanCardPresentation`與`TaskChecklistTree`各自擁有該階title／date layout；後者同時被Task Details重用並已有host adapter邊界。
- Local、Firebase與Supabase record流程會傳遞metadata；現行共享record write policy不是欄位級host ACL。
- SPEC-069已把390×844定義為meeting mode不存在的boundary。

### Human 決策

- 單一主持人設定、單一數字、右鍵直接輸入、有值才顯示。
- 可見格式只有`15`，順序為`API 權限整理   09/12 15 ▸`，不顯示`[]`或單位。
- 完整L1／L2／L3+都支援，以統一使用與實作邏輯。

### 主管推論

- 完整階層雖增加renderer接線，但消除hierarchy eligibility分支；以共用selector、mark與Board host adapter後，總體規則比L2-only更直接。
- profile overlay比App-level workflow context更貼近變更原因，且不污染其他mode的共享interaction authority。
- 欄位級server ACL不屬於本次已確認的產品需求，但必須留下可觸發、可移除的技術債紀錄。

## 5. 技術債處置

接受一項技術債：provider目前只提供record-level write policy，官方產品路徑以action visibility、execution Guard與store owner recheck落實host-only。

- 影響：具共享record寫入能力的自製client理論上可改reservation metadata。
- 隔離：不新增其他mutation入口，所有正式UI提交均需三層檢查。
- 驗證限制：QC不得將產品路徑測試外推為server field security。
- 移除觸發：Realtime共編、shared active meeting、server-authoritative host、外部API mutation或security audit任一納入範圍。

## 6. Gate 結論

- P0 blocker：0
- P1 blocker：0（F1已由Human決策取代；F2、F3、F5已在文件修正／隔離）
- ADR：不需要；未改變既有長期架構方向。
- Migration：不需要；使用optional metadata namespace。
- 下一步：RD依WP-105-A→E順序實作，完成後交QA執行TC-105-01～10與ROT-105-01～05，再由獨立QC核對。
- Stop condition：若實作必須觸及TaskNode、provider schema、App-level workflow context、Task Details／非Board presenter、Realtime或server ACL，停止並回PM／Human重開範圍。

結論：文件經必要修正後通過技術主管審查；實作後回讀與本機 QA／QC 已通過，但不代表正式 provider 安全驗證或可發版。

### 實作後回讀（2026-09-04）

- WP-105-A～E 已完成；10 個 deterministic contract cases 與 5 個 rendered operation cases 全數通過。
- DEV-002／007／028／029／069／070／095 targeted regressions、TypeScript、test build與diff check均通過；DEV-007／029只同步過時的驗證器 source contract，未改變產品語意。
- QC 已核對 `output/qa/dev-105/result.json`、`output/playwright/dev-105/result.json`、三張viewport screenshots與DEV-070 after interaction matrix；本機 handoff可接受。
- Release、production mutation、正式provider L3與欄位級server ACL仍不在本輪授權範圍。

使用思考習慣：#問對問題、#多層次分析、#可驗證性
