# ProJED Backlog

## Backlog Update - 2026-06-10

### DEV-018：會議紀錄防呆 UX/UI 流程重設計

| DEV | 狀態 | 類型 | 優先度 | 摘要 | 文件 |
|---|---|---|---|---|---|
| DEV-018 | In Verification | 交付點 | P1 | 重設會議紀錄側欄為四階段防呆工作流，將 AI整理改為建議性動作，新增未儲存離開三選一防呆。 | `ai-doc/specs/SPEC-018-meeting-record-guardrail-workflow-redesign.md` |

範圍邊界：

- 不新增資料表或 migration。
- 不改 `KnowledgeRecord`、`record_task_links`、RAG token 格式。
- 不新增 BoardView 上方會議操作列。
- 不把 AI整理改成自動任務修改。
- 手機版會議紀錄工作流不列入 release gate。

更新日期：2026-06-09

## Backlog 管理原則

- 產品完成率只計入 `交付點` DEV。
- 支援交付、補測、RLS 修正、adapter 抽象等工作列為 `開發點`，必須掛在父交付點下。
- PM evidence 文件不計入產品完成率。
- 新增交付點或擴大交付範圍前，需先取得使用者確認。

## Active 交付點

| DEV | 狀態 | 節點類型 | 優先級 | 主題 | 文件 |
|---|---|---|---|---|---|
| DEV-002 | Done | 交付點 | P1 | 會議紀錄與個人工作紀錄 MVP | `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md` |
| DEV-005 | Done | 交付點 | P1 | 會議看板主畫面紀錄工作流 | `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` |
| DEV-006 | Done | 交付點 | P1 | Gmail-like 會議紀錄輸入器穩定化 | `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` |
| DEV-007 | Done | 交付點 | P1 | 會議中原生看板編輯與任務變更紀錄 | `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` |
| DEV-008 | Done | 交付點 | P1 | 任務會議細節快速查找 | `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` |
| DEV-009 | Done | 交付點 | P1 | 會議模式任務詳情內快速補記 | `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` |
| DEV-010 | Done | 交付點 | P1 | 會議紀錄操作按鈕狀態溝通設計 | `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` |
| DEV-011 | In Verification | 交付點 | P1 | AI 任務導向會議紀錄統整工作流 | `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` |
| DEV-012 | In Verification | 交付點 | P1 | AI 會議紀錄自然語言品質提升 | `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` |
| DEV-013 | Done | 交付點 | P1 | 右鍵清單任務複製，包含子任務與子樹內部依賴 | `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` |

## DEV-002 範圍摘要

目標：在 ProJED 中建立「會議紀錄」與「個人工作紀錄」功能，透過 task node 連結紀錄與任務，並為後續 AI 全域分析建立可索引的知識資料基礎。

MVP 必須包含：

- 會議紀錄表單：紀錄時間、參與人員文字輸入、內容、關聯任務。
- 個人工作紀錄表單：記錄人員固定為目前登入者、時間區間預設一週前到今天、內容、關聯任務。
- 可收疊右側紀錄填寫欄。
- 進入任務選取模式時，自動收起右側欄。
- 看板式任務選取器。
- 紀錄列表。
- 任務詳情頁相關紀錄時間軸。
- published record 同步進 RAG documents。
- AI citation 可回到原始紀錄。

MVP 不包含：

- 語音逐字稿。
- 參與人員 member mapping。
- AI 自動修改任務。
- 複雜審批流程。

## DEV-005 範圍摘要

目標：將會議紀錄工作流從「紀錄頁主導」調整為「議題看板主導、紀錄輔助」，讓開會時所有人以 active board 的 Kanban 議題作為共同畫面，記錄者用右側速記欄同步記錄與連結任務。

MVP 必須包含：

- 上方會議入口：啟動後建立或開啟 meeting draft，切到 `board` view。
- `BoardView` 會議狀態列：會議標題、已連結任務數、速記欄展開/收合、儲存草稿、發布、結束會議。
- 會議模式下點 Kanban card / checklist item 可直接插入 `@[title](task:id)`。
- `RecordSidebar` 在 meeting mode 下優先顯示內容編輯器，最近紀錄列表降級。
- `RecordsView` 保留為會後查閱與整理的紀錄庫，不作為會議主畫面。

MVP 不包含：

- 完整會議管理。
- AI 決議抽取或自動建立任務。
- 跨 board 會議。
- 多記錄者即時協作。
- 新增 migration 或修改 `KnowledgeRecord` / `record_task_links` 資料格式。

## DEV-006 範圍摘要

目標：將會議紀錄內容輸入器改為 Gmail-like 基本撰寫體驗，修正目前自製 `contentEditable` 的選取、換行、貼上、undo/redo 與 IME 問題，並讓已關聯任務 chip 可複製、剪下、貼上與移動。

MVP 必須包含：

- 導入成熟 editor engine，取代手寫 DOM serialize / replaceChildren 同步。
- 保留既有 `@[title](task:id)` token 與 `record_task_links` 資料契約。
- 支援 `Ctrl+A`、`Ctrl+Z`、`Ctrl+Y`、Enter、貼上多行、中文 IME。
- 支援 task chip copy / cut / paste / move / Backspace / Delete。
- 新增自動 verifier 與實際輸入測試證據。

MVP 不包含：

- Gmail 富文字工具列。
- bold / italic / link / list 儲存。
- 新增 migration 或 editor JSON 後端格式。

## DEV-007 範圍摘要

目標：會議中看板仍維持一般編輯模式，不劫持卡片點擊；任務狀態、移動與關鍵變更在背景收集，儲存或發布會議紀錄時自動附加到內容。

MVP 必須包含：

- 會議模式不改變 Kanban card / checklist item 的主要點擊、拖曳與編輯行為。
- 任務變更自動收集為 meeting activity。
- 儲存/發布時將尚未附加的 activity 以 `@[title](task:id)` token 形式加入紀錄內容。
- 不新增 migration，不改 `KnowledgeRecord` / `record_task_links`。

## DEV-008 範圍摘要

目標：未來專案成員可從任務詳情快速查找該任務在會議或工作紀錄中被討論過的細節，不需要進入紀錄庫翻整篇紀錄。

MVP 必須包含：

- 任務詳情頁將「關聯紀錄」升級為「任務知識」區塊。
- 已關聯紀錄優先顯示包含目前任務 inline tag 的段落片段。
- 沒有 inline tag 但有 `record_task_links` 的紀錄仍顯示整篇關聯 fallback。
- 提供目前任務範圍內的搜尋，涵蓋任務備註、會議片段、工作紀錄片段與 DEV-007 任務變更片段。
- 點擊片段可開啟原始紀錄。

MVP 不包含：

- AI 問答或語意搜尋。
- AI 自動摘要、決議抽取或自動標記任務。
- 新增 migration、meeting event table 或修改紀錄資料格式。

## DEV-009 範圍摘要

目標：會議模式下，使用者可在任務詳情內直接補記目前任務的討論內容，系統自動把補記 append 到目前 meeting draft 並連到該任務。

MVP 必須包含：

- `TaskDetailsModal` 在 meeting mode 顯示「本次會議」快速補記。
- 補記內容 append 到目前 meeting draft，不寫入任務備註。
- 系統自動加入目前任務 inline tag，並同步 `record_task_links`。
- 支援「加入紀錄」與 `Ctrl+Enter`。
- 發布後可由 DEV-008 任務知識查到。

MVP 不包含：

- 在任務詳情內編輯整篇會議紀錄。
- AI 摘要、決議抽取或任務自動更新。
- 新增資料模型或多人即時協作。

## DEV-010 範圍摘要

目標：修正會議模式中 `存草稿`、`發布`、`結束會議` 按鈕狀態不透明的 UX 問題。當按鈕不可操作時，系統需說明原因與下一步；`存草稿` 與 `發布` 需拆成不同條件；`結束會議` 需改成更清楚的 `離開會議模式` 語意，並保護未儲存內容。

MVP 必須包含：

- 會議狀態列顯示目前 draft 狀態、阻塞原因與下一步。
- `存草稿` 在 meeting draft 存在且有 workspace / board 時可用，不因內容空白被靜默鎖住。
- `發布` 只有在內容、任務補記或 pending meeting activity 足夠時可用。
- disabled / aria-disabled 按鈕需有 hover、focus 與狀態列提示。
- `結束會議` 改為 `離開會議模式` 或提供等價說明；有未儲存內容時需確認。
- `BoardView` 與 `RecordSidebar` 共用同一套 action state 判斷。

MVP 不包含：

- 手機版會議紀錄工作流。
- 新增 migration 或調整 `KnowledgeRecord` / `record_task_links`。
- AI 摘要、會議管理、跨 board 會議。

## DEV-011 範圍摘要

目標：將會議紀錄從逐筆 append 流水帳改為 AI 發布前統整草稿。AI 讀取速記、任務補記、meeting activity 與任務脈絡，產出任務導向草稿；人類校稿後才發布。

MVP 必須包含：

- 發布前先由後端 AI 統整 meeting draft。
- AI 只更新 draft content，不修改任務。
- 原始 activity 不逐筆進入 published 正文。
- 保留 task tag，支援 DEV-008 任務知識查找。
- AI 失敗時保留原草稿。

MVP 不包含：

- 即時 AI 統整。
- 新增 migration 或修改紀錄資料格式。
- AI 自動建立、修改、移動任務。

## DEV-012 範圍摘要

目標：提升 DEV-011 AI 草稿品質，讓會議紀錄更像人類整理出的任務紀要，而不是死板欄位填空。保留三個大章節與 task tag，但任務內容只整理會中實際變更、速記與任務詳情補記，不用專案既有狀態補內容，也不自行推論下一步。

MVP 必須包含：

- 任務段落以階層編號與 task tag 呈現，例如 `2.1 @[列表](task:id)`、`2.1.1 @[卡片](task:id)`、`2.1.1.1 @[子任務](task:id)`。
- 任務內容使用自然語言摘要，不使用五欄固定模板。
- 每個任務保留 1 段紀要；只有人類明確講到時才列下一步。
- 不輸出目前任務狀態、任務背景、既有備註或沒有會議資訊的填充句。
- Edge Function 預設首選模型為 `gemini-3.5-flash`，並保留 env override；未設定 env override 且首選模型 unavailable 時，可受控 fallback 到 `gemini-3.1-flash-lite`，但 response 必須揭露 `warnings` 與實際 `model`。
- Golden samples verifier 檢查自然語言品質與 DEV-008 片段抽取相容性。

MVP 不包含：

- 新增 migration。
- AI 自動修改任務。
- 即時 AI 統整。
- 手機版會議紀錄工作流。

## 後續候選交付

| 候選項目 | 狀態 | 說明 |
|---|---|---|
| 紀錄 RAG 整合強化 | Backlog | 若 DEV-002 只完成基本 documents mirror，後續可獨立強化 chunking、embedding job、citation 開啟紀錄與 indexing retry。 |
| AI 全域分析 | Backlog | 加入 graph expansion retrieval，支援專案健康、延期原因、會議決議、個人投入與任務進度分析。 |
| 會議紀錄模板與決議抽取 | Backlog | 從會議紀錄抽取決議、阻塞、待辦，但 AI 只能建議，不能直接修改任務。 |

## 開放決策

| 決策 | PM 建議 | 影響 |
|---|---|---|
| 個人工作紀錄預設可見性 | `project` | 可保留 AI 專案分析價值；若改為 `private`，全域分析資料量會降低。 |
| 部門會議跨 board 連結 | 支援 | MVP UI 先從 active board 開始，再提供 board 切換。 |
| AI 是否可直接修改任務 | 不可 | AI 只提出建議，使用者確認後才新增或更新任務。 |

## 目前阻塞 / 待人工驗證

- Firebase Hosting 已部署到 `https://projed-cc78d.web.app`。
- DEV-011 / DEV-012 production backend AI smoke 已通過：正式 Edge Function 以授權 user JWT 呼叫回 `200`，實際模型為 `gemini-3.5-flash`。
- DEV-011 / DEV-012 尚待 production UI smoke：正式前端使用 Google OAuth，需互動式登入後驗證 meeting mode、AI整理、校稿發布、紀錄庫與任務知識查找。
- DEV-013 已完成 QC fact report。

---

## PM Backlog Update - 2026-06-04

| DEV | 狀態 | 類型 | 優先級 | 標題 | 規格 |
|---|---|---|---|---|---|
| DEV-003 | Done | Product UX refinement | P1 | 紀錄內容內嵌任務標籤 | `ai-doc/specs/SPEC-004-record-content-inline-task-tags.md` |
| DEV-005 | Done | Product UX refinement | P1 | 會議看板主畫面紀錄工作流 | `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` |
| DEV-006 | Done | Product UX refinement | P1 | Gmail-like 會議紀錄輸入器穩定化 | `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` |
| DEV-008 | Done | Product UX refinement | P1 | 任務會議細節快速查找 | `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` |
| DEV-009 | Done | Product UX refinement | P1 | 會議模式任務詳情內快速補記 | `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` |
| DEV-010 | Done | Product UX refinement | P1 | 會議紀錄操作按鈕狀態溝通設計 | `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` |
| DEV-011 | In Verification | Product UX refinement | P1 | AI 任務導向會議紀錄統整工作流 | `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` |
| DEV-012 | In Verification | Product UX refinement | P1 | AI 會議紀錄自然語言品質提升 | `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` |
| DEV-013 | Done | Product UX refinement | P1 | 右鍵清單任務複製，包含子任務與子樹內部依賴 | `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` |

### DEV-003 摘要

修改紀錄與任務的關聯流程：使用者從看板點選任務後，任務需以 Codex-like inline tag 直接插入紀錄 `內容` 編輯器目前游標位置。

### 驗收重點

- 使用者可把游標放在紀錄內容中，並將看板任務插入該位置。
- 插入任務需顯示為 visual chip/tag，不只是下方關聯任務列。
- 同一任務可在內容中被引用多次。
- 結構化 `record_task_links` 保持唯一，權限與 RAG 行為不變。
- 沿用既有看板選取模式，不開啟另一個 task picker page。

### DEV-005 摘要

改善會議進行中的紀錄 UX：主畫面固定為議題看板，右側紀錄欄只作為速記與任務連結輔助。此項承接 DEV-002 的紀錄基礎與 DEV-003 的 inline task tag，不改資料模型。

### DEV-005 驗收方向

- 開會入口啟動後停留在 `board` view。
- 會議狀態列清楚顯示 draft、已連結任務數與儲存/發布操作。
- 點 Kanban card / checklist item 可插入 task tag。
- 速記欄收合/展開不遺失 draft。
- 紀錄庫只作為會後查閱與整理。

---

## Future Upgrade Tracking - SPEC-002 全人個人與團隊待辦平台

來源規格：`ai-doc/specs/SPEC-002-whole-person-todo-platform.md`

治理原則：

- 未來升級不得只停留在對話或口頭共識中。
- 狀態使用 `future`、`planned`、`in_progress`、`done`、`dropped`。
- 升級進入 `planned` 時，需建立或更新對應 spec、dev task 與驗證計畫。
- 涉及資料模型、後端同步、權限或 AI 自動化時，需明確記錄風險與驗證方式。

| 升級項目 | 狀態 | 觸發條件 | 主要風險 | 驗證方式 |
|---|---|---|---|---|
| Supabase / Firebase 雙後端一致性 | future | DEV-004 MVP 在 Firebase/local backend 穩定後 | schema drift、RLS、adapter 行為不一致 | Firebase/Supabase 雙後端 CRUD smoke、RLS smoke、build/typecheck |
| 完整同步佇列 UI | future | pending 離線項目量增加或使用者需要手動重試 | 重複建立、同步順序錯誤、使用者誤判狀態 | 離線/恢復連線流程測試、重試與失敗狀態測試 |
| AI 分類、日期、看板與任務位置建議 | future | 手動整理流程穩定且資料足夠後 | AI 誤判造成錯誤分類或錯誤承諾 | 建議只預填不寫入、人工確認率與更正率追蹤 |
| 團隊承諾功能 | future | 輕量共享與正式任務轉換使用穩定後 | 責任流過重、通知噪音、權限不清 | QA FMEA、週回顧流程測試、通知壓力檢查 |
| browser notification / email / calendar 外部提醒 | future | 站內提醒中心可信且使用者仍漏看時 | 通知轟炸、外部同步錯誤、時區問題 | 通知頻率測試、取消/退訂流程、calendar/email smoke |
| 拖曳式看板定位 | future | 點選插入線互動穩定後 | 拖曳碰撞判定、觸控與捲動衝突 | 桌面/手機拖曳 smoke、插入順序與 rollback 測試 |
| 通知稍後提醒 | future | 已讀/未讀通知不足以支援使用者節奏時 | reminder 模型擴張、重複提醒噪音 | snooze 邏輯測試、badge/通知狀態一致性測試 |
| 進階歷史搜尋與日期篩選 | future | 歷史資料量增加導致文字搜尋不足 | 搜尋效能、篩選條件混淆 | 歷史搜尋效能測試、日期/類型篩選測試 |

## Planned 交付候選 - DEV-004 全人個人與團隊待辦平台 MVP

DEV-004 為 umbrella PM delivery program；實際 RD/QA/QC 追蹤以 DEV-004A 到 DEV-004D 四個獨立交付點執行。四個交付點都完成後，DEV-004 才視為 MVP 交付完成。

| DEV | 狀態 | 節點類型 | 父交付點 | 優先級 | 標題 | 規格 |
|---|---|---|---|---|---|---|
| DEV-004A | Planned | 交付點 | DEV-004 | P1 | 資料模型與 service/store | `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` |
| DEV-004B | Planned | 交付點 | DEV-004 | P1 | 全域收件匣與頂部快速捕捉 | `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` |
| DEV-004C | Planned | 交付點 | DEV-004 | P1 | 右側抽屜、我的今日、通知與歷史 | `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` |
| DEV-004D | Planned | 交付點 | DEV-004 | P1 | 看板定位 overlay 與正式任務轉換 | `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` |
