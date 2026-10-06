# SPEC-105：會議任務討論時間預約數字

- 狀態：`Implemented / QA PASS / QC PASS / Release Not Requested`
- 日期：2026-09-04
- 關聯：DEV-105、DEV-005、DEV-007、DEV-069、DEV-070、QA-DEV-105、QC-DEV-105
- 節點類型：交付點
- 風險：Medium（會議草稿 metadata、主持人 workflow 權限、右鍵 inline editor、L1／L2／L3+ 一致呈現與 recovery）
- Spec Impact：`Intentional scope extension + Human-approved surface replacement`。只解除SPEC-005「不做逐項時間控管」中與單一預約數字衝突的局部非範圍，並以完整L1／L2／L3+取代前一版L2-only；不建立多人預約、計時器、總額或完整議程。

## 1. 真正需求與成功畫面

真正問題不是缺少一套排程系統，而是主持人在會議前無法把議題的預約數字就地標示在任務上，造成會議協調必須依賴外部訊息或口頭確認。

第一版只解決最短因果鏈：

```text
主持人右鍵設定單一數字 → 數字跟隨目前 meeting draft 保存 → 會議看板各階任務有值才顯示
```

成功畫面順序固定為：

```text
API 權限整理   09/12 15 ▸
```

可見字串只有 `15`；以單一時間膠囊 token 顯示數字，不渲染圖示，不顯示 `[]`、「分」、分鐘、預約者、未預約提示或總額。

## 2. Human Decision 與主管收斂

### 2.1 Human Decision（RD 不得自行變更）

- 第一版不開放多人預約；每個「meeting draft × canonical task」只有一個值。
- 統一由該 meeting draft 的主持人新增、修改或清除。
- 入口只在會議看板 L1／L2／L3+ 任務的右鍵選單，動作名稱為「預約時間」。
- 點擊後在同一選單內直接聚焦數字輸入，不開 Modal、Drawer 或第二層頁面。
- 有值才顯示；無值時完全不顯示。
- 各階任務的共通順序為「任務名稱 → 截止日 → 數字 → 既有尾端控制」；L2 的既有尾端控制為展開按鈕。
- 單位由使用者自行理解，產品不顯示也不推論單位。

### 2.2 Tech Lead scope simplification

- 首版支援會議看板完整任務階層：`board.column-header`、`board.card`、`board.checklist-row`。不依 L1／L2／L3+ 分支判斷 eligibility。
- 同一 canonical task 的 primary 與 tracking projection 讀取同一值；不得為 tracking reference 建第二份資料。
- 不把 meeting 狀態一路加入 `App → TaskInteractionScope → useTaskInteractionBinding`。由 `GlobalContextMenu` 在解析當下依 active meeting 提供 menu profile overlay，執行時再由 Guard 與 store 重查。
- 純資料 helper 放在既有 `src/utils`；三個 renderer 共用單一 `MeetingTaskReservationMark`，集中可見字串、樣式、accessibility 與空值DOM規則。
- `TaskChecklistTree`仍為Board／Task Details共用renderer；reservation values只能由`KanbanChecklist`的Board host adapter注入，Task Details不提供，避免功能洩漏。

這次完整階層是 Human 明確確認的 `Intentional replacement`，取代前一版僅L2的審查收斂；其他模式與Task Details仍不在範圍。

## 3. Identity、權限與 surface 契約

### 3.1 Meeting identity

- active meeting identity 固定使用 `useRecordStore.draft.id`。
- `createDefaultDraft()` 在第一次遠端保存前已產生 stable ID，不另建 session ID、TaskNode 欄位或 localStorage identity。
- 只有 `isMeetingMode === true`、`draft.type === 'meeting'`、`draft.status === 'draft'` 時可進入預約流程。

### 3.2 Host identity

- 主持人權威為 `draft.recordedBy`。
- 允許條件：`currentUserId` 非空，且 `draft.recordedBy === currentUserId`。
- `recordedBy` 缺失、登入者不符、草稿已發布／封存或 meeting 不可用時一律 fail closed：action 不進 DOM，直接呼叫 mutation 也回 `denied`／`false`。
- 不得 fallback 到 board edit role，也不得以 UI 隱藏取代 execution guard。

### 3.3 Task identity 與 surface

- key 一律使用 canonical `TaskNode.id`，不得使用 tracking reference ID、placement ID 或 DOM ID。
- task 必須存在、未封存，且 `task.boardId === activeBoardId` 才能寫入；不存在、已封存或跨 board target 必須拒絕。
- action allowlist：meeting mode 的 `board.column-header`、`board.card`、`board.checklist-row`。
- 顯示 allowlist：meeting mode 的 L1／L2／L3+ primary 與 tracking projection。
- 明確 negative：Task Details、List、Mindmap、Gantt、Calendar、Workbench、非 meeting，以及 SPEC-069 的 390×844 mobile meeting-negative boundary。

## 4. 資料與持久化契約

### 4.1 Canonical shape

資料放在 `KnowledgeRecordInput.metadata` 的 namespaced 欄位，不修改 `TaskNode`：

```ts
type MeetingTaskReservationsV1 = {
  schemaVersion: 1;
  values: Record<string, number>; // canonical taskId -> integer 1..999
};

type MeetingRecordMetadata = Record<string, unknown> & {
  meetingTaskReservations?: MeetingTaskReservationsV1;
};
```

範例：

```json
{
  "meetingTaskReservations": {
    "schemaVersion": 1,
    "values": {
      "task-abc": 15
    }
  }
}
```

### 4.2 Parse、normalize、set、clear

- editor 使用字串 draft；只接受 ASCII 十進位正整數 `1..999`。
- 空字串代表 clear。
- `0`、負數、小數、科學記號、前置 `+`、超過 999、全形數字、字母、`NaN`、`Infinity` 一律拒絕；不得依賴 `Number()` 的寬鬆轉換。
- set／clear 必須保留 metadata 其他 namespace；清除最後一筆時移除整個 `meetingTaskReservations` namespace。
- unknown `schemaVersion` fail closed，不覆寫未知資料。
- 相同值是 noop，不建立新 state reference、不新增 activity、不顯示成功訊息。

### 4.3 Dirty、recovery 與 provider

- `getRecordDraftSignature()` 必須納入 normalize 後的 reservation projection，並按 canonical task ID 穩定排序。
- 沿用既有約 500 ms local recovery 與約 20 s idle cloud checkpoint；mark 表示目前 draft state，不宣稱已同步雲端。
- Local Test、Firebase、Supabase 沿用既有 record metadata passthrough，不新增 table、column、RPC、migration 或 provider branch。
- save draft／publish 後 readback 必須保留 namespace；既有 recovery error UI 是唯一保存失敗回饋。

## 5. 最小互動契約

### 5.1 Menu action 與解析

- 新增 action id：`task.edit-meeting-reservation`；catalog 中 `defaultMenu: false`。
- `profiles.ts` 匯出 `MEETING_TASK_MENU_PROFILE`，為三個 Board task surface 使用同一 overlay action；不得依 node level 建三份 profile。
- `resolveTaskMenu(context, overlays = [])` 只增加 menu profile overlay 能力；不得把 meeting state 變成全域 task interaction context 欄位。
- `GlobalContextMenu` 以事件 snapshot 的 Board task surface、target 與當下 meeting/host 狀態供應 overlay。
- `taskActionGuards.ts` 負責 action visibility／execution permission；`useRecordStore` mutation 再重查 meeting、host、task 與 value，形成 defense in depth。

### 5.2 Inline editor

- 點「預約時間」後，同一選單同一 action row 轉為單一 input，立即 focus；既有值全選。
- 使用 `type="text"`、`inputMode="numeric"`、`pattern="[0-9]*"`、`maxLength={3}`，避免 number input spinner 與寬鬆格式。
- `Enter`：composition 結束後才驗證並提交一次；成功後關閉 menu。
- IME composing Enter：不提交。
- `Escape`、outside click、scroll、context target 切換：取消且不 mutation。
- invalid：menu 保持開啟，顯示唯一 inline error `請輸入 1–999 的整數`，focus 留在 input。
- mutation denied／exception：draft 不變、editor 保留，不顯示 false success；只使用既有 error channel。
- 不新增 clear button、helper、toast、spinner、modal、drawer 或 loading badge。
- editor 展開後必須觸發既有 menu positioning 重新量測，避免超出 viewport。

## 6. 顯示與版面契約

- 新增共用 `MeetingTaskReservationMark`；唯一輸入為`value?: number | null`，合法值輸出`[${value}]`，空值直接return null。
- 樣式：數字顯示在單一無框 `rounded-full` token；token 使用亮黃色背景 `#f6cd03`、黑色 12px semibold tabular numerals；不渲染圖示、不加 tooltip 或第二層容器。accessibility 可提供 `aria-label="預約數字 15"`；可見文字仍只能是 `15`。
- L1：`KanbanColumnPresentation`接收`meetingReservationValue`，在`TaskDateBadge`後渲染mark；順序為title → date → mark。
- L2：`KanbanCardPresentation`接收`meetingReservationValue`與`rowTrailing`；保留`titleTrailing`給pending／record capture，把checklist toggle移到`rowTrailing`；順序為title group → date → mark → toggle。
- L3+：`TaskChecklistHostAdapter`新增optional `meetingReservationValues`；只有`KanbanChecklist`注入normalized map，`TaskChecklistTree`在date後渲染mark；Task Details adapter不注入，維持DOM=0。
- L1／L2容器與L3+ Board adapter都只讀同一份normalized map；canonical task ID是唯一lookup key。
- 無值時mark DOM必須為0，且不得留下gap、placeholder或增加row／card／header高度。
- 長標題仍由既有truncation吸收；1440×900與1024×768各階都不換行、不遮住日期、mark或既有尾端控制。

## 7. Mutation 與失敗邊界

store action 建議契約：

```ts
setMeetingTaskReservation(input: {
  taskId: string;
  value: number | null;
  currentUserId: string;
  activeBoardId: string;
}): { status: 'updated' | 'cleared' | 'noop' | 'denied' };
```

- action 只改 record draft metadata，不改 TaskNode，不寫 meeting activity，不直接呼叫 provider。
- task existence／archived／board 檢查應由 execution adapter 傳入已解析的 canonical target，或由 Guard 在呼叫 store 前完成；避免 record store 反向 import WBS store。
- store 仍須獨立重查 meeting 狀態、owner、taskId 非空與 value 範圍。
- stale menu、會議切換、target 切換或權限變更後提交都必須拒絕。

## 8. Repo impact map

### 新增

- `src/utils/meetingTaskReservation.ts`：shape、parse、read、normalize、set／clear pure helpers。
- `src/components/Wbs/MeetingTaskReservationMark.tsx`：L1／L2／L3+共用的最小顯示元件。
- `scripts/verify-dev-105-meeting-task-reservation-number.ts`：deterministic contract verifier。
- `scripts/verify-dev-105-meeting-task-reservation-number-browser.pw.js`：rendered operation verifier。

### 修改

- `src/store/useRecordStore.ts`
- `src/utils/meetingRecordWorkflow.ts`
- `src/interactions/task/types.ts`
- `src/interactions/task/taskActionCatalog.ts`
- `src/interactions/task/profiles.ts`
- `src/interactions/task/resolveTaskInteraction.ts`
- `src/interactions/task/taskActionGuards.ts`
- `src/interactions/task/TaskActionMenu.tsx`
- `src/components/GlobalContextMenu.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/Wbs/KanbanColumnPresentation.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanCardPresentation.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/TaskChecklistTree.tsx`
- `package.json`
- DEV／SPEC／QA／QC 文件與 evidence artifacts

### 明確不修改

- `App.tsx`、`TaskInteractionScope.tsx`、`useTaskInteractionBinding.ts`
- Task Details adapter與其他 mode presenter
- `TaskNode` schema、record provider service、Supabase／Firebase schema 或 migration

## 9. Work packages

| WP | 內容 | 完成條件 |
|---|---|---|
| WP-105-A | pure metadata model與signature | parser、unknown schema、stable order、set／clear／noop測試通過 |
| WP-105-B | host-guarded draft mutation | host成功；non-host／stale／invalid／cross-board全部無 mutation |
| WP-105-C | task action overlay與inline editor | 三個Board task surface共用同一action；鍵盤、取消、error與reposition契約通過 |
| WP-105-D | L1／L2／L3+ render與tracking projection | 共用mark、各階exact order、無值DOM=0、Details negative、長標題與viewport證據通過 |
| WP-105-E | recovery/provider regression與文件收斂 | local/cloud/save/publish readback、targeted regressions、QA/QC evidence完成 |

順序：A → B → C → D → E。A/B未通過不得進UI整合；E未通過不得宣稱交付。

## 10. Acceptance criteria

- AC-105-01：只有active meeting host在L1／L2／L3+ Board task右鍵看到「預約時間」。
- AC-105-02：點擊後同 menu 直接輸入；Enter commit，Escape／outside／scroll／target switch cancel。
- AC-105-03：只接受 `1..999` ASCII整數；empty clear；invalid不 mutation。
- AC-105-04：資料只寫入 active meeting draft metadata，正本與tracking projection共用canonical task ID。
- AC-105-05：L1／L2／L3+有值時都在due date後呈現`number`；L2精確為`title → due date → number → toggle`；無值DOM=0。
- AC-105-06：單一時間膠囊 token 只顯示預約數字；畫面不出現圖示、單位、預約者、總額、placeholder、額外按鈕或第二層容器。
- AC-105-07：dirty signature、local recovery、cloud checkpoint、save／publish readback保留值且不顯示假同步成功。
- AC-105-08：L1／L2／L3+ primary與tracking顯示一致；Details、其他模式與390 mobile meeting-negative皆無入口與mark。
- AC-105-09：既有card click、right-click、drag、record capture、date、tags、toggle與task menu回歸通過。
- AC-105-10：QA／QC evidence具命令、exit code、assertion與真實畫面；未執行不得標 PASS。

## 11. 技術債、ADR、migration 與 stop conditions

### 11.1 已接受的隔離技術債

目前 provider 對共享 meeting record 是 record-level write policy，沒有 `meetingTaskReservations` 欄位級 host-only ACL。因此「只有主持人可設定」在本版是產品工作流權限，不是抵抗惡意 client 的伺服器安全邊界。

- 影響：具 project record write 能力的自製 client 理論上可改 metadata。
- 隔離：action visibility、execution Guard、store owner recheck 三層限制官方產品路徑；沒有新增其他 mutation 入口。
- 驗證：只能宣稱官方產品路徑 host-only，不得宣稱 RLS／Firestore 已提供欄位級保護。
- 移除觸發：Realtime 共編、shared active meeting、server-authoritative host、外部 API mutation 或 security audit 任一進入範圍時，另案建立 server-enforced mutation boundary。

### 11.2 ADR／migration

- ADR：不需要。沿用現有 record metadata、task action kernel、draft recovery 與 card presenter，沒有新的長期架構方向。
- Migration：不需要。此欄位是 optional metadata namespace，舊紀錄無值即視為未設定。

### 11.3 Stop conditions

若實作發現需要修改 TaskNode、provider schema、App-level workflow context、Task Details／非 Board presenter、Realtime 或 server ACL，立即停止並回 PM／Human；不得以「順便支援」擴大首版。

## 12. Governance 與交付邊界

- `RD Implementation Ready` 只代表契約可開發，不代表已實作、QA PASS、QC PASS 或 Release Ready。
- 本文件禁止以人工改 metadata、直接 store 呼叫或截圖假資料替代真實右鍵操作證據。
- QA 依 `ai-doc/qa/QA-DEV-105-meeting-task-reservation-number.md`；QC 必須獨立核對 source、machine-readable result 與 rendered evidence。
- 未授權 commit、push、PR、deploy、shared migration、production mutation 或 release。

使用思考習慣：#問對問題、#多層次分析、#可驗證性

## 13. Change log

- 2026-09-04：依 Human feedback 建立單一主持人、右鍵直接輸入、有值才顯示與 `title → date → number → toggle` 契約。
- 2026-09-04：RD 技術主管審查後，首版由 L1／L2／L3+ 收斂為 L2 card；移除 App-level workflow context 與一次性 component；把 server field ACL 明列為隔離技術債，QA 收斂為風險導向最小集合。
- 2026-09-04：Human後續確認改回完整L1／L2／L3+以統一邏輯，取代前述L2-only範圍；三個Board surface共用同一eligibility、metadata selector與mark component，Task Details仍維持negative。
- 2026-09-04：依瀏覽器回饋將 Clock3 與數字整合為單一時間膠囊 token，並移除數字兩側的 `[]`；保留 `1..999` 範圍，避免使用僅支援到⑳的 Unicode 圓圈數字。
- 2026-09-07：依瀏覽器回饋移除 token 內的 Clock3 圖示，改為僅顯示純數字。

## 14. Implementation evidence

- WP-105-A～E 已完成；實作維持本規格的 metadata、host guard、Board overlay、inline editor、L1／L2／L3+ shared mark 與 recovery signature 邊界。
- QA：`npm run verify:dev-105-meeting-task-reservation-number` 10/10 PASS；`npm run verify:dev-105-meeting-task-reservation-number-browser` ROT-105-01～05 5/5 PASS。
- Targeted regression：DEV-002 16/16、DEV-007 5/5、DEV-028 48/48、DEV-029 42/42、DEV-069 PASS、DEV-070 58/58、DEV-095 4/4；`npx tsc --noEmit`、`npm run build:test`、`git diff --check` PASS。
- Evidence：`output/qa/dev-105/result.json`、`output/playwright/dev-105/result.json` 與三張 viewport screenshots；provider 欄位級 ACL 仍是已揭露的隔離技術債，未作 server-security 外推。
- 未執行 deploy、production mutation、正式 provider L3 readback 或 release；因此本規格狀態為實作與本機 QA/QC 通過，但 Release Not Requested。
