# PM Report：DEV-005 會議看板主畫面紀錄工作流

日期：2026-06-05
狀態：Done
任務類型：Product UX refinement
主要規格：`ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md`
父交付點：DEV-002 / DEV-003 follow-up

## 交付範圍

DEV-005 將會議紀錄工作流從「紀錄庫/紀錄表單主導」改為「議題看板主導、紀錄輔助」。使用者從上方會議入口啟動後，系統維持在 active board 的 `board` view，右側紀錄欄作為會議速記與任務連結輔助，不新增資料模型、不新增 migration，也不改 `KnowledgeRecord`、`record_task_links` 或 `@[title](task:id)` token 格式。

## 已完成

- 更新 `src/store/useRecordStore.ts`：
  - 新增 UI-only meeting mode 狀態：`isMeetingMode`、`meetingTaskCaptureEnabled`。
  - 新增 `startMeetingRecord()`、`exitMeetingMode()`、`toggleMeetingTaskCapture()`。
  - `startMeetingRecord()` 會建立或沿用 meeting draft、切到 `board` view、打開紀錄欄並啟用任務插入。
  - `enterTaskSelectionMode()` 增加可選設定，讓會議模式可維持速記欄開啟且不離開看板主畫面。
- 更新 `src/components/MainLayout.tsx`：
  - 上方紀錄入口改為會議導向入口。
  - 會議模式中切換為「結束會議」操作，保留目前 draft。
  - 手機版會議速記開啟時，主內容預留底部空間，避免底部速記面板擠壓或遮住看板。
- 更新 `src/components/BoardView.tsx`：
  - 新增會議狀態列，顯示會議標題、已連結任務數、任務插入狀態、速記欄展開/收合、存草稿、發布與結束會議。
  - 狀態列操作直接寫回既有 record draft，不改資料模型。
- 更新 `src/components/Wbs/KanbanCard.tsx` 與 `src/components/Wbs/KanbanChecklist.tsx`：
  - 會議模式且任務插入啟用時，點 card / checklist item 直接插入 inline task tag。
  - 沿用 DEV-003 的內容插入與 task link 同步行為。
- 更新 `src/components/Records/RecordSidebar.tsx`：
  - meeting mode 下優先顯示內容編輯器與關聯任務。
  - 隱藏最近紀錄列表，讓速記欄專注於會議中記錄。
  - 手機版改為底部 fixed panel，不再在 flex layout 中把看板擠成 0 寬。
- 更新 `src/components/Records/RecordContentEditor.tsx`：
  - 增加 `editorClassName`，讓會議速記模式可給內容區更高的最小高度。
- 更新 `src/components/Records/RecordsView.tsx`：
  - 文案定位改為「紀錄庫」，作為會後查閱與整理，不再暗示它是會議中的主工作畫面。
- 更新 `scripts/verify-dev-002-records.mjs`：
  - 配合 `enterTaskSelectionMode()` 可選設定，調整靜態 verifier 預期。

## 驗證結果

- PASS：`npm.cmd run lint -- --quiet`
- PASS：`npm.cmd run verify:dev-002-records`
- PASS：`npm.cmd run verify:dev-003-record-tags`
- PASS：`npm.cmd run build`
- PASS：in-app browser smoke：
  - 使用固定測試環境登入後，點「會議紀錄」仍停留在 `board` view。
  - 會議狀態列顯示「會議中」、會議標題、已連結任務數、速記欄操作與發布操作。
  - 右側顯示「會議速記」，最近紀錄列表在 meeting mode 下不顯示。
  - 點 Kanban card 後，內容 editor 出現 task tag，狀態列從 `已連結 0 任務` 更新為 `已連結 1 任務`。
  - 收合與展開速記欄後，已連結任務與 draft 仍保留。
  - 發布後，會議紀錄出現在紀錄庫，狀態為已發布，並保留 1 個任務連結。
- PASS：UI layout DOM bounding check：
  - 桌機 1280x720：會議狀態列、看板、右側速記欄皆可視，狀態列未覆蓋看板或速記欄。
  - 手機 390x844：速記欄改為底部 panel；會議狀態列、看板、速記欄皆可視，速記欄在 viewport 內。

補充決策（2026-06-07）：手機版不列入後續會議記錄工作流驗收；上述手機 smoke 僅保留為歷史實作證據，不作為 release gate。

## 殘留風險

- in-app browser 截圖 API 在本次執行時發生 CDP screenshot timeout，因此 UI QC 使用 DOM snapshot 與 bounding box 證據；仍建議後續 QC 若需要視覺截圖，改用穩定的截圖工具補證據。
- 任務詳情頁相關紀錄時間軸未在本次 browser smoke 中手動打開完整詳情視圖；目前由既有 `verify:dev-002-records` 覆蓋靜態契約，後續 QC 可補實際點開任務詳情的操作證據。
- 本次刻意不處理完整會議管理、AI 決議抽取、跨 board 會議、多記錄者即時協作與資料模型變更。
