# ProJED Documentation Map

更新日期：2026-06-04

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

## 目前交付邊界

目前 active 產品交付點：

- DEV-002：會議紀錄與個人工作紀錄 MVP。

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

### Current Product Direction

- DEV-002 已交付會議/工作紀錄基礎設施與看板式任務選取。
- 下一個 UX refinement 是讓任務關聯成為撰寫流程的一部分。
- 從看板選取的任務要插入 `Content` 編輯器目前游標位置，並顯示為 inline task chip。
- `record_task_links` 仍作為 AI 分析使用的結構化 graph link；內容 tag 是使用者撰寫時的前景介面。

### Delivery Reports

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/reports/PM-DEV-003-record-content-inline-task-tags-implementation.md` | Done | DEV-003 | DEV-003 交付範圍、驗證結果與殘留風險。 |

### QA Validation Plans

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/qa/QA-DEV-003-record-content-inline-task-tags-ux-validation.md` | Ready for QC | DEV-003 | 使用者視角 UX 驗證計畫，聚焦看板直接選任務、內容游標 inline tag、右側欄收合、重複 tag 與唯一關聯摘要。 |
