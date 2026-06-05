# ProJED Backlog

更新日期：2026-06-04

## Backlog 管理原則

- 產品完成率只計入 `交付點` DEV。
- 支援交付、補測、RLS 修正、adapter 抽象等工作列為 `開發點`，必須掛在父交付點下。
- PM evidence 文件不計入產品完成率。
- 新增交付點或擴大交付範圍前，需先取得使用者確認。

## Active 交付點

| DEV | 狀態 | 節點類型 | 優先級 | 主題 | 文件 |
|---|---|---|---|---|---|
| DEV-002 | Ready | 交付點 | P1 | 會議紀錄與個人工作紀錄 MVP | `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md` |

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

## 目前阻塞

- 尚未進入 RD 實作。
- 實作前需確認 private / project / tenant visibility 的 RLS 與 RAG retrieval 權限模型。

---

## PM Backlog Update - 2026-06-04

| DEV | 狀態 | 類型 | 優先級 | 標題 | 規格 |
|---|---|---|---|---|---|
| DEV-003 | Done | Product UX refinement | P1 | 紀錄內容內嵌任務標籤 | `ai-doc/specs/SPEC-004-record-content-inline-task-tags.md` |

### DEV-003 摘要

修改紀錄與任務的關聯流程：使用者從看板點選任務後，任務需以 Codex-like inline tag 直接插入紀錄 `內容` 編輯器目前游標位置。

### 驗收重點

- 使用者可把游標放在紀錄內容中，並將看板任務插入該位置。
- 插入任務需顯示為 visual chip/tag，不只是下方關聯任務列。
- 同一任務可在內容中被引用多次。
- 結構化 `record_task_links` 保持唯一，權限與 RAG 行為不變。
- 沿用既有看板選取模式，不開啟另一個 task picker page。

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
