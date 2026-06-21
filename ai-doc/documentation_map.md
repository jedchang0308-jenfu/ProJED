# ProJED Documentation Map

## Documentation Map Update - 2026-06-19

### DEV-027F: Mind map UI polish after relationship-line QC

| Document | Status | DEV | Purpose |
|---|---|---|---|
| `ai-doc/qc/QC-DEV-027F-mindmap-ui-polish.md` | Browser QC Passed | DEV-027F | Records UI failures, fixes, screenshot evidence, and browser gate for viewport-safe relationship-line UI polish. |

### DEV-027E: Xmind-like note relationship line UX parity

2026-06-19 completion map:

| Document | Status | DEV | Purpose |
|---|---|---|---|
| `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md` | Implemented | DEV-027E | Defines Xmind-like note relationship line parity scope and non-goals. |
| `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Executed | DEV-027E | Defines strict UI verification matrix for inline edit, endpoints, control points, style, shortcut, right-click, and zoom. |
| `ai-doc/qc/QC-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Browser QC Passed | DEV-027E | Records static/browser/type/lint/build/regression evidence. |

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md` | Ready | DEV-027E | 定義 ProJED 筆記型關聯線與 Xmind Relationship 的 UI/UX 差異、分階段開發範圍、資料延伸與 RD exit gate |
| `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Ready | DEV-027E | 驗證關聯線本體選取、inline label edit、endpoint/control point 拖曳、樣式控制、快捷鍵與 zoom 穩定性 |

### DEV-027D: Mind map date display and existing filter integration

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027D-mindmap-date-display-filter.md` | Implemented / QC Pending | DEV-027D | 心智圖日期顯示與既有 WBS filter 串接規格，定義 `showStartDate`、date badge metadata、root/child visibility 規則 |
| `ai-doc/qa/QA-DEV-027D-mindmap-date-display-filter.md` | Ready for QC | DEV-027D | QA 驗證矩陣，包含 UI bounds、開始日期開關、到期篩選、狀態篩選、負責人篩選與標籤 wiring |
| `ai-doc/qc/QC-DEV-027D-mindmap-date-display-filter.md` | In Progress | DEV-027D | QC 執行證據入口，記錄 static/browser/type/lint/build/regression gates |

### DEV-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview polish

最新文件修訂（2026-06-19）：
- `SPEC-027B`、`QA-DEV-027B`、`QC-DEV-027B` 已改以 selection-first keyboard UX 為準。
- 新增任務後只選取，不立即進入編輯；直接打字才改名。
- 自動化驗證需覆蓋方向鍵選取、連續 `Enter` / `Tab` 新增、zoom、tidy connector 與 drag insertion preview。

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md` | Implemented / Browser QC Passed | DEV-027B | 定義心智圖模式下一輪 Xmind-like polish：`Enter` 在目前任務下方新增同階任務、可縮放高解析畫布、shared trunk / bracket 整齊 connector、拖曳中明確 insertion placeholder / connector preview / ghost node。 |
| `ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md` | Browser QC Passed | DEV-027B | 定義 DEV-027B 嚴格 UI 驗證計畫，包含 keyboard insertion order、zoom clarity / hit-test、tidy connector topology、drag insertion preview fidelity、desktop/laptop/mobile 截圖與 DEV-027A regression gates。 |
| `ai-doc/qc/QC-DEV-027B-xmind-interaction-polish.md` | Browser QC Passed | DEV-027B | 記錄 DEV-027B 事實驗證：Enter insert-after-selected、zoom controls / endpoint alignment、parent + 5 children tidy bracket、drag insertion preview fidelity、mobile zoom 與 DEV-027A regression gates。 |

DEV-027B 是 DEV-027 的支援開發點，承接使用者 2026-06-19 補充截圖與需求；不新增資料模型、不做 Xmind 匯入/匯出、不做 style panel。已落地 `Enter` insert-after-selected、zoom state / controls、parent-group bracket connector renderer 與 drag insertion preview，並補 `verify:dev-027b-xmind-interaction-polish`、`verify:dev-027b-xmind-interaction-polish-browser`。

## Documentation Map Update - 2026-06-18

### DEV-027: Xmind-like 心智圖模式

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md` | Implemented / Browser QC Passed | DEV-027 | 定義 ProJED 新增 `心智圖` 模式：active board title 作為中心主題、WBS 任務作為分支、節點只顯示任務名稱、核心 Xmind-like 鍵盤與拖曳操作、直接共用既有 WBS 任務資料；RD 已落地 view mode、topbar 入口、心智圖節點與互動。 |
| `ai-doc/qa/QA-DEV-027-xmind-like-mind-map-mode.md` | Browser QC Passed / UI Reopen Addendum | DEV-027 | 定義並記錄心智圖入口、中心主題、分支顯示、Enter/Tab/Delete、改名、展開/收合、拖曳階層、權限、跨視圖同步與 viewport 驗證；已加註 connector line 與 drag interaction UI reopen。 |
| `ai-doc/qc/QC-DEV-027-xmind-like-mind-map-mode.md` | Browser QC Passed | DEV-027 | 記錄 DEV-027 static gates、Playwright browser QC、drag hierarchy、cycle guard、viewer read-only、desktop/mobile viewport 與 visible error sweep。 |
| `ai-doc/qa/QA-DEV-027A-xmind-connector-line-visual-validation.md` | Browser QC Passed | DEV-027A | 針對使用者截圖揭露的 branch connector line 斷裂問題，以及新增的 Xmind-like 拖曳即時預覽動畫與同側拖放需求，定義 Xmind UI 參考、失效判定、acceptance criteria、manual UI matrix、自動化 geometry / drag verifier 要求與 QC handoff gate。 |
| `ai-doc/qc/QC-DEV-027A-xmind-connector-drag-ui.md` | Browser QC Passed | DEV-027A | 記錄 connector endpoint 幾何驗證、orphan segment 檢查、node overlap 檢查、drag preview movement、same-side root drop、side persistence、desktop/laptop/mobile screenshot 與 final regression gates。 |

DEV-027 的核心決策來自 HCS 引導模式 `1A 2B 3A`：第一版做核心心智圖 MVP；視覺布局與互動高度接近 Xmind 類產品，但避免一比一複製品牌細節；心智圖模式完全共用現有 WBS 任務資料，所有新增、改名、刪除與拖曳階層都直接更新任務。已補 `verify:dev-027-xmind-like-mind-map-mode`、`verify:dev-027-xmind-like-mind-map-browser`、`verify:dev-027-xmind-connector-lines-browser` 與 `verify:dev-027-xmind-drag-preview-browser`，並完成 owner drag/cycle/mobile smoke、viewer read-only browser QC、connector geometry QC、drag preview / same-side persistence QC。

### DEV-026: Trello-like 看板分享體驗

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md` | Implemented / Browser Smoke Passed | DEV-026 | 定義看板右上角 `分享` 入口、Trello-like `分享看板` modal、email invite、複製連結、pending invite、看板成員與設定頁權限矩陣降層；RD 已落地 topbar 入口、modal 與 settings split。 |
| `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md` | Static + Browser Smoke Passed / DB Smoke Pending | DEV-026 | 定義並記錄 DEV-026 browser flow、權限不足、pending invite、設定頁保留與 viewport 驗證；desktop 與 390x844 mobile smoke 已通過，service-role DB smoke 未啟用。 |

DEV-026 的核心決策是保留既有 `board_invites` 與 RLS/audit 資料層，把重點放在 Trello 使用者熟悉的主畫面分享入口與單一任務 modal；role permission matrix 留在設定頁。已補 `verify:dev-026-trello-like-board-share-ui`，並修正 mobile topbar 中 filter control 覆蓋分享按鈕的 hit-target 問題。

### DEV-025: 受控跨工作區移動專案

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md` | Implemented / QC Pending | DEV-025 | 定義專案/看板跨工作區受控搬移方案，包含效用理論決策、權限條件、preflight preview、Supabase RPC、資料表搬移範圍、audit/RAG 風險控制與驗收條件。RD 已落地 migration、service/store 與 UI 入口。 |
| `ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md` | Static QA Done / DB QC Pending | DEV-025 | 定義 DEV-025 QA 驗證矩陣，包含權限、preflight、成功搬移、交易原子性、RLS、UI/UX 與 QC 事實驗證。靜態 verifier、TypeScript 與 build 已通過；資料庫 QC 待目標 Supabase 套 migration 後執行。 |

DEV-025 的核心決策是採用「受控搬移」，不採用自由拖拉或複製。已新增 `preview_project_workspace_transfer` / `move_project_to_workspace` RPC、前端 preview/confirm flow、local-test fallback 與 `verify:dev-025-project-workspace-transfer`。

## Documentation Map Update - 2026-06-15

### DEV-024: AI整理保留手寫內容與章節結構

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md` | Ready | DEV-024 / DEV-011 / DEV-012 / DEV-020 | 定義 `AI整理` 必須保留使用者手寫內容、自訂章節、task mention 與 project change evidence；補上 deterministic human-draft merge guard，不得只靠 prompt。 |
| `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md` | Ready | DEV-024 / DEV-021 / DEV-022 | 驗證手寫段落、自訂章節、任務 mention、專案變化匯入、idempotent、fallback placement 與真實操作測試。 |

DEV-024 將 DEV-021 / DEV-022 的保護範圍，從 project change evidence 延伸到使用者已輸入的 human draft content；此開發點不新增資料庫 schema，也不改 record content persistence 格式。

### DEV-023: 專案變化匯入整併為紀錄流程第一步

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md` | Ready | DEV-023 / DEV-020 | 定義將 `先匯入專案變化` 整併為會議與個人紀錄流程第一步，預設收合，點擊 `匯入` 後才展開設定。 |
| `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md` | Ready | DEV-023 / DEV-020 | 驗證會議與個人流程都有 `匯入` 第一格、獨立大型匯入卡片移除、展開面板、插入/跳過/empty/error 與 viewport。 |
| `ai-doc/reports/PDCA-DEV-020-record-ui-simplification.md` | Superseded risk by DEV-023 | DEV-020 / DEV-023 | DEV-023 supersedes PDCA-DEV-020 中「專案變化匯入仍在流程上方」的殘留 UI 風險。 |

### DEV-022: 專案變化匯入後 AI整理同整成單一會議紀錄

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-022-project-change-single-record-integration.md` | Implemented | DEV-022 | 定義 project change evidence normalization、single-record merge guard 與 fallback evidence note。 |
| `ai-doc/qa/QA-DEV-022-project-change-single-record-integration.md` | Passed | DEV-022 | 驗證最終內容只有一組 `1/2/3` 主結構、marker 移除、taskLinks preserve 與 idempotent。 |
| `ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md` | Closed | DEV-022 / DEV-021 | 分析 DEV-021 preserve append 導致兩份會議內容的根因，已由 DEV-022 integrated synthesis guard 關閉。 |

### DEV-021: 專案變化匯入後 AI整理保留機制

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-021-project-change-ai-preserve.md` | Implemented | DEV-021 | 定義已匯入專案變化為受保護內容，AI整理不得丟失；已落實 deterministic merge guard 與 taskLinks 依 merged content 同步。 |
| `ai-doc/qa/QA-DEV-021-project-change-ai-preserve.md` | Passed | DEV-021 | 定義並通過匯入後 AI整理、存草稿/發布保存、preserve/idempotent、taskLinks 與 prompt-only regression 驗證。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Risk closed by DEV-021 | DEV-020 | DEV-020 未涵蓋 AI整理後保留匯入內容的缺口，已由 DEV-021 補齊。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Risk closed by DEV-021 | DEV-020 | DEV-020 QA 未涵蓋「匯入 -> AI整理 -> 存草稿/發布」保留驗證，已由 DEV-021 補齊。 |

## PDCA Update - 2026-06-15

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/reports/PDCA-DEV-020-record-ui-simplification.md` | Done | DEV-020 / DEV-019 / DEV-010 | 紀錄 UI 精簡 PDCA：統一 topbar `紀錄中`、將重複摘要 chip 改為 `sr-only` marker、更新靜態與 browser smoke 驗證。 |

## Documentation Map Update - 2026-06-11

### DEV-018 文件索引

| 文件 | 狀態 | 對應 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-018-meeting-record-guardrail-workflow-redesign.md` | Implemented | DEV-018 | 會議紀錄側欄四階段防呆工作流、AI整理動作化、直接發布語意與未儲存離開保護。 |
| `ai-doc/qa/QA-DEV-018-meeting-record-guardrail-workflow.md` | Ready for QC | DEV-018 | 驗證空白草稿、直接發布、AI整理、AI 失敗、未儲存離開、已儲存離開、任務變更來源與 viewport。 |
| `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 補足紀錄類型與會議流程分層，避免 `會議紀錄 / 個人工作紀錄` 被誤解成流程步驟。 |
| `ai-doc/qa/QA-DEV-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 驗證一般紀錄模式、會議模式、個人工作紀錄狀態、離開與收合分離、viewport。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Implemented | DEV-020 | 重構紀錄功能為先選類型、匯入專案變化、撰寫、儲存或發布的完整工作流。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Passed | DEV-020 | 驗證看板主入口、專案變化匯入、未儲存防呆、功能說明與 viewport。 |

產品方向補充：

- DEV-018 supersedes DEV-010 的舊會議操作列期待；會議防呆入口以 `RecordSidebar` workflow 為主。
- DEV-018 supersedes DEV-011 / DEV-012 的「發布前必須 AI整理」假設；AI整理是建議動作，直接發布只保存目前編輯器內容。
- DEV-018 不變更資料模型與 RAG token，只重設會議紀錄 UX/UI workflow。
- DEV-019 clarifies DEV-018：`會議紀錄 / 個人工作紀錄` 是紀錄類型，`速記 / AI整理 / 校稿 / 發布` 才是會議模式流程。
- DEV-020 supersedes DEV-019 的局部補強：紀錄類型必須在開始撰寫前決定，並把專案變化匯入、功能說明與未儲存保護納入完整紀錄工作流。

更新日期：2026-06-11

## Active PM 文件

| 文件 | 狀態 | 用途 |
|---|---|---|
| `ai-doc/backlog.md` | Active | PM backlog、交付點與後續候選範圍。 |
| `ai-doc/dev_task.md` | Active | DEV 任務主控板，只保留狀態、下一步、阻塞與驗證證據索引。 |
| `ai-doc/documentation_map.md` | Active | 文件索引與目前交付邊界。 |

## Archived PM 文件

| 文件 | 狀態 | 用途 |
|---|---|---|
| `ai-doc/archived/dev_task_2026-06-09_before_restructure.md` | Archived | 2026-06-09 重整前的完整 dev_task 長版內容；保留歷史細節與舊 RD/QA/QC 紀錄。 |

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
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Implemented | DEV-010 | 會議紀錄操作按鈕狀態溝通設計；承接 DEV-005 / DEV-006 / DEV-007 / DEV-009 的 meeting workflow UX refinement。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | In Verification | DEV-011 | AI 任務導向會議紀錄統整工作流；承接 DEV-007 / DEV-008 / DEV-009 / DEV-010 的 meeting record synthesis refinement。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | In Verification | DEV-012 | AI 會議紀錄自然語言品質提升；承接 DEV-011 / DEV-008 的 meeting record synthesis quality refinement。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` | Implemented | DEV-013 | 定義右鍵清單任務複製，包含子任務欄位與子樹內部依賴複製。 |
| `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 定義紀錄類型層、會議流程層與個人工作紀錄簡單狀態。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Implemented | DEV-020 | 定義紀錄功能重構、專案變化匯入、功能說明、dirty guard 與 RD/QA/QC 邊界。 |
| `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md` | Ready | DEV-023 | 定義專案變化匯入整併為會議與個人紀錄流程第一步；父交付點 DEV-020。 |
| `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md` | Ready | DEV-024 | 定義 AI整理保留手寫內容與章節結構；父交付點 DEV-011 / DEV-012 / DEV-020。 |
| `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md` | Implemented / Browser Smoke Passed | DEV-026 | 定義 Trello-like 看板分享入口、分享 modal 與邀請流程 UI/UX。 |
| `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md` | Implemented / Static + Browser Smoke Passed | DEV-027 | 定義 Xmind-like 心智圖模式，讓 WBS 任務以心智圖分支呈現並可直接用鍵盤與拖曳編輯。 |

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
- DEV-020：紀錄功能重構與專案變化匯入流程。
- DEV-026：Trello-like 看板分享體驗。
- DEV-027：Xmind-like 心智圖模式。

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
- 保留三個大章節；任務段落以階層編號與 task tag 呈現，例如 `2.1 @[列表](task:id)`、`2.1.1 @[卡片](task:id)`、`2.1.1.1 @[子任務](task:id)`。
- 任務段落改成自然語言任務紀要，不使用五欄固定模板。
- 會議紀錄只整理 rawContent 與 meeting activity，不使用專案既有狀態補內容。
- `下一步` 只在會議速記或任務補記中明確出現行動時輸出。
- Edge Function 預設首選模型為 `gemini-3.5-flash`，並保留 env override；未設定 env override 且首選模型 unavailable 時，可受控 fallback 到 `gemini-3.1-flash-lite`，但 response 必須揭露 `warnings` 與實際 `model`。
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
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Implemented | DEV-010 / DEV-005 follow-up / DEV-009 follow-up | 定義會議紀錄操作按鈕狀態、阻塞原因提示、草稿/發布條件拆分與離開保護。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | In Verification | DEV-011 / DEV-007 follow-up / DEV-008 follow-up / DEV-009 follow-up | 定義 AI 任務導向會議紀錄統整、發布前校稿流程、後端模型執行與不改任務邊界。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | In Verification | DEV-012 / DEV-011 follow-up / DEV-008 follow-up | 定義 AI 會議紀錄自然語言品質、任務紀要格式、模型預設與 golden samples 驗證。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` | Implemented | DEV-013 | 定義右鍵清單任務複製、任務子樹欄位保留、內部依賴 remap 與驗證邊界。 |

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
| `ai-doc/qa/QA-DEV-010-meeting-record-action-feedback.md` | Implemented | DEV-010 | 會議紀錄操作按鈕狀態溝通 UX 驗證計畫，包含 disabled reason、tooltip/focus、離開保護與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-011-ai-meeting-record-synthesis.md` | In Verification | DEV-011 | AI 任務導向會議紀錄統整 UX 驗證計畫，包含實際輸入、AI 失敗保留草稿、校稿發布與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-012-ai-meeting-record-natural-language-quality.md` | In Verification | DEV-012 | AI 會議紀錄自然語言品質驗證計畫，包含 golden samples、實際輸入、模型不可用與任務知識查找相容性。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Passed | DEV-020 | 紀錄功能重構驗證計畫，包含看板主入口、專案變化匯入、未儲存防呆、功能說明與 viewport。 |
| `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md` | Ready | DEV-023 | 驗證專案變化匯入作為紀錄流程第一步、預設收合、展開面板、插入/跳過與 DEV-021/022 回歸。 |
| `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md` | Ready | DEV-024 | 驗證 AI整理不得覆蓋使用者手寫內容、章節結構、task mention 與 project change evidence，並包含真實操作測試。 |
| `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md` | Static + Browser Smoke Passed / DB Smoke Pending | DEV-026 | 驗證 Trello-like 分享入口、modal 邀請、複製連結、pending invite、成員 tab、權限不足與 viewport。 |

### QC Fact Reports

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/qc/QC-DEV-009-meeting-task-detail-quick-note-ux.md` | Pass | DEV-009 | DEV-009 UX 驗證事實報告，確認桌機與筆電會議補記工作流通過。 |
| `ai-doc/qc/QC-DEV-011-012-production-ai-smoke.md` | Backend Pass / UI Pending | DEV-011 / DEV-012 | 正式 Hosting 部署與 Edge Function AI smoke 事實報告；後端正式 AI 統整通過，互動式前端 UI smoke 待 Google OAuth session。 |
| `ai-doc/qc/QC-DEV-013-task-tree-duplicate-context-menu.md` | Pass | DEV-013 | DEV-013 右鍵任務複製事實驗證報告，確認子樹複製、內部依賴 remap、undo/redo 與 release gate 回歸通過。 |
