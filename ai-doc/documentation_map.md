# ProJED Documentation Map

更新日期：2026-06-06

## Active PM 文件

| 文件 | 狀態 | 用途 |
|---|---|---|
| `ai-doc/backlog.md` | Active | PM backlog、交付點與後續候選範圍。 |
| `ai-doc/dev_task.md` | Active | DEV 任務主控文件，追蹤 RD / QA / QC。 |
| `ai-doc/documentation_map.md` | Active | 文件索引與目前交付邊界。 |

## Active 規格文件

| 文件 | 狀態 | 對應 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-001-unified-compact-ui-system.md` | Done reference | DEV-001 | 統一 compact UI 系統規格。 |
| `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` | Draft | 未分配 | Whole-person todo / inbox 類功能草案；目前未列入 active 交付點。 |
| `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md` | Draft | DEV-002 | 會議紀錄與個人工作紀錄工作流設計。 |
| `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` | Implemented | DEV-005 | 會議看板主畫面紀錄工作流；承接 DEV-002 / DEV-003 的 UX refinement。 |
| `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` | Implemented | DEV-006 | Gmail-like 會議紀錄輸入器穩定化；承接 DEV-003 / DEV-005 的 editor UX refinement。 |
| `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` | Implemented | DEV-007 | 會議中保留原生看板編輯，並將任務變更納入會議紀錄。 |
| `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` | Implemented | DEV-008 | 任務詳情中的會議細節快速查找；承接 DEV-002 / DEV-007 的 task knowledge UX refinement。 |
| `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` | Implemented | DEV-009 | 會議模式下任務詳情內快速補記；承接 DEV-005 / DEV-007 / DEV-008 的 meeting workflow UX refinement。 |
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Ready | DEV-010 | 會議紀錄操作按鈕狀態溝通設計；承接 DEV-005 / DEV-006 / DEV-007 / DEV-009 的 meeting workflow UX refinement。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | Ready for QC | DEV-011 | AI 任務導向會議紀錄統整工作流；承接 DEV-007 / DEV-008 / DEV-009 / DEV-010 的 meeting record synthesis refinement。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | Ready for QC | DEV-012 | AI 會議紀錄自然語言品質提升；承接 DEV-011 / DEV-008 的 meeting record synthesis quality refinement。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` | Ready for QC | DEV-013 | 定義右鍵清單任務複製，包含子任務欄位與子樹內部依賴複製。 |

## 目前交付邊界

目前 active 產品交付點：

- DEV-002：會議紀錄與個人工作紀錄 MVP。
- DEV-005：會議看板主畫面紀錄工作流。
- DEV-006：Gmail-like 會議紀錄輸入器穩定化。
- DEV-007：會議中原生看板編輯與任務變更紀錄。
- DEV-008：任務會議細節快速查找。
- DEV-009：會議模式任務詳情內快速補記。
- DEV-010：會議紀錄操作按鈕狀態溝通設計。
- DEV-011：AI 任務導向會議紀錄統整工作流。
- DEV-012：AI 會議紀錄自然語言品質提升。
- DEV-013：右鍵清單任務複製，包含子任務與子樹內部依賴。

DEV-002 的產品邊界：

- 建立紀錄資料模型與任務關聯。
- 建立右側可收疊紀錄填寫欄。
- 建立看板式任務選取器。
- 建立紀錄列表與任務詳情頁紀錄時間軸。
- 建立紀錄到 RAG documents 的 indexing 基礎。

不包含：

- 語音逐字稿。
- AI 自動修改任務。
- 複雜審批。
- 完整部門級 BI 報表。

DEV-005 的產品邊界：

- 將會議中的主畫面固定為 active board 的 `board` view。
- 建立會議狀態列與會議導向入口。
- 讓右側紀錄欄成為速記與任務連結輔助。
- 會議模式下點 Kanban card / checklist item 可插入 inline task tag。
- 保留 `RecordsView` 作為會後查閱與整理的紀錄庫。

不包含：

- 完整會議管理。
- AI 決議抽取或自動建立任務。
- 跨 board 會議。
- 多記錄者即時協作。
- 新增 migration 或變更紀錄資料格式。

DEV-006 的產品邊界：

- 以成熟 editor engine 修正會議紀錄內容輸入。
- 保留 `@[title](task:id)` 與 `record_task_links` 資料契約。
- 支援 task chip copy / cut / paste / move。
- 支援 Gmail-like 基本輸入肌肉記憶。

不包含：

- Gmail 富文字工具列。
- 新增 migration 或 editor JSON 後端格式。
- 多人即時協作。

DEV-007 的產品邊界：

- 會議模式不劫持看板卡片或 checklist 的主要點擊行為。
- 會議中看板維持一般編輯、拖曳、context menu 行為。
- 任務狀態、移動與關鍵變更在背景收集為 meeting activity。
- 儲存或發布時將 activity append 到會議紀錄內容。

不包含：

- 新增 meeting event table。
- 多人即時協作 event stream。
- AI 決議抽取。

DEV-008 的產品邊界：

- 任務詳情頁提供任務知識入口。
- 已關聯紀錄優先顯示目前任務的會議或工作紀錄片段。
- 任務內搜尋涵蓋任務備註、關聯紀錄片段與會議中任務變更。
- 點擊片段可回到原始紀錄。

不包含：

- AI 問答、語意搜尋或自動摘要。
- 新增資料表或修改紀錄資料格式。

DEV-009 的產品邊界：

- 會議模式下任務詳情顯示「本次會議」快速補記。
- 補記內容 append 到目前 meeting draft 的任務討論區塊。
- 自動插入目前任務 inline tag 並同步 task link。
- 保留任務詳情一般任務編輯功能。

不包含：

- 任務詳情內完整會議紀錄編輯器。
- AI 摘要或決議抽取。
- 新增資料模型。

DEV-010 的產品邊界：

- 會議模式狀態列需說明 `存草稿`、`發布`、`離開會議模式` 的差異。
- 按鈕不可操作時需揭露原因與下一步，不可只灰掉。
- `存草稿` 與 `發布` 需使用不同啟用條件。
- `BoardView` 與 `RecordSidebar` 共用同一套 action state 判斷。
- 離開會議模式需避免使用者誤以為已保存或已發布。

不包含：

- 手機版會議紀錄工作流。
- 新增資料模型或 migration。
- AI 摘要、完整會議管理或跨 board 會議。

DEV-011 的產品邊界：

- 會議紀錄發布前先由後端 AI 統整成任務導向草稿。
- AI 只更新 meeting draft content，不建立、修改、移動或刪除任務。
- 原始 meeting activity 僅作為 AI input source，不逐筆進入 published 正文。
- 人類必須校稿後再次發布。
- published 正文保留 `@[title](task:id)`，讓 DEV-008 任務知識查找可用。

不包含：

- 即時 AI 統整。
- 手機版會議紀錄工作流。
- 新增資料模型或 migration。
- 完整會議管理、跨 board 會議或多記錄者即時協作。

DEV-012 的產品邊界：

- 保留 DEV-011 的發布前 AI 統整流程。
- 保留三個大章節與每任務 `### @[title](task:id)` heading。
- 任務段落改成自然語言任務紀要，不使用五欄固定模板。
- 會議紀錄只整理 rawContent 與 meeting activity，不使用專案既有狀態補內容。
- `下一步` 只在會議速記或任務補記中明確出現行動時輸出。
- Edge Function 預設模型為 `gemini-3.5-flash`，並保留 env override。
- Golden samples verifier 檢查自然語言品質與 DEV-008 任務片段抽取相容性。

不包含：

- 新增資料模型或 migration。
- AI 自動修改任務。
- 即時 AI 統整。
- 手機版會議紀錄工作流。

## 建議 QA / QC 文件位置

當 DEV-002 進入實作前，建議新增：

- `ai-doc/qa/QA-DEV-002-meeting-work-records.md`
- `ai-doc/qc/QC-DEV-002-meeting-work-records.md`

## 文件治理備註

- `SPEC-002` 目前為未追蹤新檔，且未綁定 active DEV；保留為草案，不納入 DEV-002 完成率。
- `SPEC-003` 是 DEV-002 的主要需求來源。
- 後續若要把 AI 全域分析做成獨立交付點，需先由使用者確認新增 DEV。

---

## PM Update - 2026-06-04

### Active Spec Addendum

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/specs/SPEC-004-record-content-inline-task-tags.md` | Implemented | DEV-003 / DEV-002 follow-up | 定義紀錄內容內嵌任務標籤 UX，讓看板選取的任務以 Codex-like tag 插入內容游標位置。 |
| `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` | Implemented | DEV-005 / DEV-002 follow-up / DEV-003 follow-up | 定義會議中以議題看板為主畫面、右側紀錄欄為輔助速記與任務連結的工作流。 |
| `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` | Implemented | DEV-006 / DEV-003 follow-up / DEV-005 follow-up | 定義 Gmail-like 會議紀錄輸入器與 task chip copy/cut/paste/move 行為。 |
| `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` | Implemented | DEV-007 / DEV-005 follow-up / DEV-006 follow-up | 定義會議中保留原生看板編輯，並把任務變更納入會議紀錄。 |
| `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` | Implemented | DEV-008 / DEV-002 follow-up / DEV-007 follow-up | 定義任務詳情中的任務知識查找、片段抽取與任務內搜尋。 |
| `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` | Implemented | DEV-009 / DEV-005 follow-up / DEV-008 follow-up | 定義會議模式任務詳情內快速補記與 meeting draft append 行為。 |
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Ready | DEV-010 / DEV-005 follow-up / DEV-009 follow-up | 定義會議紀錄操作按鈕狀態、阻塞原因提示、草稿/發布條件拆分與離開保護。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | Ready for QC | DEV-011 / DEV-007 follow-up / DEV-008 follow-up / DEV-009 follow-up | 定義 AI 任務導向會議紀錄統整、發布前校稿流程、後端模型執行與不改任務邊界。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | Ready for QC | DEV-012 / DEV-011 follow-up / DEV-008 follow-up | 定義 AI 會議紀錄自然語言品質、任務紀要格式、模型預設與 golden samples 驗證。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` | Ready for QC | DEV-013 | 定義右鍵清單任務複製、任務子樹欄位保留、內部依賴 remap 與驗證邊界。 |

### Current Product Direction

- DEV-002 已交付會議/工作紀錄基礎設施與看板式任務選取。
- 下一個 UX refinement 是讓任務關聯成為撰寫流程的一部分。
- 從看板選取的任務要插入 `Content` 編輯器目前游標位置，並顯示為 inline task chip。
- `record_task_links` 仍作為 AI 分析使用的結構化 graph link；內容 tag 是使用者撰寫時的前景介面。
- DEV-005 進一步調整會議中的主視角：開會時應停留在議題看板，紀錄欄只作為輔助速記，不再讓紀錄庫頁成為會議主畫面。
- DEV-007 修正會議看板互動：會議中仍使用一般看板編輯，任務變更由背景 meeting activity 納入紀錄。
- DEV-010 補齊會議狀態列的溝通設計：按鈕不可操作時必須顯示原因與下一步，避免使用者只看到灰色按鈕。
- DEV-012 提升 AI 會議紀錄品質：保留任務導向與 task tag，但輸出改為自然語言任務紀要，且 AI 不補寫人類沒講過或沒做過的事。

### Delivery Reports

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/reports/PM-DEV-003-record-content-inline-task-tags-implementation.md` | Done | DEV-003 | DEV-003 交付範圍、驗證結果與殘留風險。 |
| `ai-doc/reports/PM-DEV-005-meeting-board-primary-workflow-implementation.md` | Done | DEV-005 | DEV-005 交付範圍、驗證結果與殘留風險。 |
| `ai-doc/reports/PM-DEV-006-gmail-like-record-editor-implementation.md` | Done | DEV-006 | DEV-006 editor engine、task chip clipboard、實際輸入測試與殘留風險。 |
| `ai-doc/reports/PM-DEV-007-meeting-activity-capture-implementation.md` | Done | DEV-007 | DEV-007 原生看板編輯保留、meeting activity 收集與驗證結果。 |
| `ai-doc/reports/PM-DEV-008-task-meeting-detail-lookup-implementation.md` | Done | DEV-008 | DEV-008 任務知識查找、片段抽取與驗證結果。 |
| `ai-doc/reports/PM-DEV-009-meeting-task-detail-quick-note-implementation.md` | Done | DEV-009 | DEV-009 任務詳情內會議快速補記、append 行為與驗證結果。 |

### QA Validation Plans

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/qa/QA-DEV-003-record-content-inline-task-tags-ux-validation.md` | Ready for QC | DEV-003 | 使用者視角 UX 驗證計畫，聚焦看板直接選任務、內容游標 inline tag、右側欄收合、重複 tag 與唯一關聯摘要。 |
| `ai-doc/qa/QA-DEV-006-gmail-like-record-editor.md` | Ready for QC | DEV-006 | Gmail-like 實際輸入驗證計畫，包含多行、undo/redo、IME、task chip copy/cut/paste/move 與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-007-meeting-activity-capture.md` | Ready for QC | DEV-007 | 會議中看板原生編輯與任務變更自動納入紀錄的驗證計畫。 |
| `ai-doc/qa/QA-DEV-008-task-meeting-detail-lookup.md` | Ready for QC | DEV-008 | 任務會議細節快速查找驗證計畫，包含任務片段抽取、搜尋、fallback 與原始紀錄追溯。 |
| `ai-doc/qa/QA-DEV-009-meeting-task-detail-quick-note.md` | Passed by QC | DEV-009 | 會議模式任務詳情內快速補記驗證計畫，包含 meeting draft append、task tag 與資料邊界。 |
| `ai-doc/qa/QA-DEV-010-meeting-record-action-feedback.md` | Ready | DEV-010 | 會議紀錄操作按鈕狀態溝通 UX 驗證計畫，包含 disabled reason、tooltip/focus、離開保護與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-011-ai-meeting-record-synthesis.md` | Ready for QC | DEV-011 | AI 任務導向會議紀錄統整 UX 驗證計畫，包含實際輸入、AI 失敗保留草稿、校稿發布與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-012-ai-meeting-record-natural-language-quality.md` | Ready for QC | DEV-012 | AI 會議紀錄自然語言品質驗證計畫，包含 golden samples、實際輸入、模型不可用與任務知識查找相容性。 |

### QC Fact Reports

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/qc/QC-DEV-009-meeting-task-detail-quick-note-ux.md` | Pass | DEV-009 | DEV-009 UX 驗證事實報告，確認桌機與筆電會議補記工作流通過。 |
