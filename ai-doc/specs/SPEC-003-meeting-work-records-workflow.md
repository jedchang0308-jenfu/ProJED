# SPEC-003: 會議紀錄與個人工作紀錄工作流設計

狀態：Implemented / DEV-002 Done Source Spec
文件角色：PM project spec  
建立日期：2026-06-04  
需求來源：使用者提出 ProJED 需要加入「會議紀錄」與「個人工作紀錄」，並透過任務 node 連結資訊，供 AI 做全域分析。

治理註記：DEV-002 已於 2026-06-04 交付並由 `ai-doc/reports/PM-DEV-002-meeting-work-records-implementation.md` 記錄驗證證據；本文件保留為 DEV-002 主要需求來源與後續 DEV-003/005/006/007/008/009/010/011/012/018/019/020 refinements 的 historical source spec，不代表仍有未授權 RD 範圍。

---

## 1. 目的

公司成員目前需要額外花心力撰寫個人工作紀錄、專案會議紀錄與部門會議紀錄。這些紀錄常常都在討論專案與任務，但沒有連回專案管理系統，形成資訊孤島。

本功能的目的不是新增一個普通筆記工具，而是在 ProJED 建立一層「專案知識紀錄層」：

- 讓會議討論、個人工作投入、任務狀態與決策脈絡能被同一套任務圖譜串起來。
- 讓使用者在寫紀錄時能用最少操作快速連結任務。
- 讓 AI 能以 task node 為樞紐，分析跨紀錄、跨任務、跨專案的風險、進度、阻塞與決策。

## 2. 設計原則

1. 紀錄輸入必須比現在更省力  
   使用者打開功能後，系統應自動帶入目前 workspace、board、登入者、目前時間等資訊；使用者只需要補內容與任務關聯。

2. 任務關聯必須符合使用者腦中的看板脈絡  
   使用者不是靠任務 ID 記任務，而是靠任務在看板中的位置、狀態、欄位、父子層級與標題記憶任務。因此任務選取應以看板式 task picker 為主。

3. 紀錄本身是第一級資料，不塞進任務描述  
   會議紀錄可能同時講多個任務；個人工作紀錄也可能跨多個任務。若塞進單一 `TaskNode.detailNotes`，會失去會議本身的時間、人員與跨任務上下文。

4. 任務 node 是關聯樞紐，不是唯一容器  
   任務詳情頁應能看到相關紀錄，但紀錄仍應保有自己的列表、搜尋、權限與 AI indexing lifecycle。

5. AI 分析要 permission-aware  
   個人工作紀錄可能有私密性。AI 全域分析只能讀取目前使用者有權限讀取的紀錄與任務。

## 3. 目標使用者與主要情境

### 3.1 會議紀錄者

情境：

- 專案會議中快速記下討論、決議、阻塞、待辦。
- 會議內容同時牽涉多個任務。
- 會後希望從每個任務都能回看相關會議脈絡。

最順工作流：

1. 在目前 board 點「新增紀錄」。
2. 預設類型為「會議紀錄」或使用者上次使用的類型。
3. 系統自動帶入目前 workspace、board、目前時間。
4. 使用者輸入參與人員文字與紀錄內容。
5. 點「選取任務」開啟看板式任務選取器。
6. 在看板中勾選本次會議談到的任務。
7. 儲存後，紀錄進入紀錄列表、任務詳情頁時間軸與 AI 知識索引。

### 3.2 個人工作紀錄者

情境：

- 每日或每週記錄自己做了哪些任務。
- 不想重複輸入自己是誰。
- 想快速把工作投入連到任務，讓後續能分析投入與進度是否一致。

最順工作流：

1. 在目前 board 或全域紀錄中心點「新增工作紀錄」。
2. 系統自動帶入記錄人員為目前登入者，欄位不可手動更改。
3. 系統預設時間區間的結束為今天，開始為一週前。
4. 使用者輸入工作內容。
5. 使用看板式任務選取器勾選相關任務。
6. 儲存後，可在個人紀錄列表、任務詳情頁與 AI 分析中被引用。

### 3.3 專案管理者

情境：

- 想知道某任務為何延期。
- 想知道某週大家實際投入在哪些任務。
- 想找出會議決議是否有轉成任務。
- 想讓 AI 做專案健康檢查。

最順工作流：

1. 在任務詳情頁打開「相關紀錄」分頁。
2. 依時間、紀錄類型、記錄人員、關聯角色篩選。
3. 點 AI 分析快捷操作，例如「分析此任務阻塞原因」。
4. AI 使用任務本身、依賴關係、會議紀錄、工作紀錄共同產生分析。
5. AI 回答必須附 citation，可點回原紀錄與任務。

## 4. 產品工作流

### 4.1 全域入口

建議新增兩種入口：

- Sidebar / toolbar：`紀錄`
- 任務詳情 modal：`相關紀錄`

`紀錄`頁面包含：

- 全部紀錄
- 會議紀錄
- 個人工作紀錄
- 依任務瀏覽

`任務詳情 modal` 中新增：

- 相關會議
- 相關工作紀錄
- AI 摘要此任務脈絡

紀錄填寫頁布局：

- 採可收疊的右側欄呈現，讓使用者在看板、列表或任務詳情脈絡中直接填寫，不需要離開主要工作畫面。
- 右側欄展開時顯示完整紀錄表單；收起時保留窄版入口，顯示目前 draft 類型與未儲存狀態。
- 右側欄必須維持 draft state，使用者收起、展開或切換任務選取模式時不得遺失已輸入內容。
- 使用者進入看板式任務選取模式時，系統自動收起右側欄，釋放主畫面空間給看板選取。
- 使用者完成選取或取消選取模式後，右側欄恢復到進入選取模式前的狀態；若進入前是展開，則回到展開，若進入前已收起，則保持收起。

### 4.2 新增會議紀錄

欄位：

- 紀錄類型：會議紀錄
- 標題：可空白，空白時系統用「YYYY-MM-DD 會議紀錄」
- 紀錄時間：datetime
- 參與人員：textarea 或單行文字，MVP 不做 member mapping
- 內容：textarea，支援 markdown-style 純文字
- 關聯任務：task chips
- 可見範圍：project / tenant，預設 project

儲存行為：

1. 使用者輸入內容時自動儲存 draft。
2. 點「儲存」後建立正式紀錄。
3. 系統在背景更新 RAG document 與 embedding。
4. 任務詳情頁立即可看到該紀錄。

### 4.3 新增個人工作紀錄

欄位：

- 紀錄類型：個人工作紀錄
- 記錄人員：目前登入者，只讀
- 開始時間：datetime
- 結束時間：datetime
- 內容：textarea
- 關聯任務：task chips
- 可見範圍：private / project，預設 project，可依公司制度改為 private

資料規則：

- 新增個人工作紀錄時，`ended_at` 預設為今天，`started_at` 預設為一週前。
- `started_at <= ended_at`
- 若使用者未填時間，系統允許暫存 draft，但正式儲存前必須補齊。
- `recorded_by` 必須等於目前登入者。

### 4.4 看板式任務選取器

目的：讓使用者用最短時間把紀錄連到正確 task node。

啟動方式：

- 在紀錄表單點「選取任務」
- 在任務詳情頁點「新增相關紀錄」時，自動預選目前任務

UI 行為：

- 顯示目前 active board 的簡化看板。
- 看板卡片改為選取模式，顯示 checkbox。
- 禁用拖曳、改名、改狀態等任務編輯行為。
- 支援搜尋任務標題。
- 支援切換 board，處理部門會議跨專案情境。
- 已選任務顯示在右側或底部 selected task tray。
- 進入選取模式時，紀錄填寫右側欄自動收起；選取完成或取消後，右側欄恢復進入前狀態。

選取後的 task chip 顯示：

- 任務標題
- 狀態
- board 名稱
- 可選關聯角色：主要討論 / 相關 / 決議 / 阻塞 / 待辦

### 4.5 任務詳情頁的紀錄時間軸

每個 task node 應能回看所有關聯紀錄。

顯示內容：

- 紀錄類型 icon
- 紀錄時間或工作時間區間
- 標題
- 記錄人員或參與人員
- 內容摘要
- 關聯角色

操作：

- 點紀錄開啟完整紀錄。
- 點「新增會議紀錄」時自動預選目前任務。
- 點「新增工作紀錄」時自動預選目前任務與目前使用者。

## 5. 建議資料模型

### 5.1 `knowledge_records`

第一級業務資料表。

建議欄位：

```sql
id uuid primary key
tenant_id uuid not null
project_id uuid null
record_type text not null -- meeting | work_log
title text not null
content text not null
occurred_at timestamptz null
started_at timestamptz null
ended_at timestamptz null
participants_text text null
recorded_by uuid null
visibility text not null -- private | project | tenant
status text not null -- draft | published | archived
metadata jsonb not null default '{}'
created_by uuid null
updated_by uuid null
created_at timestamptz not null
updated_at timestamptz not null
```

### 5.2 `record_task_links`

紀錄與 task node 的多對多關聯。

```sql
record_id uuid not null references knowledge_records(id)
task_node_id uuid not null references wbs_items(id)
tenant_id uuid not null
project_id uuid null
link_role text not null -- main | related | decision | blocker | follow_up
sort_order integer not null default 0
created_at timestamptz not null
primary key (record_id, task_node_id, link_role)
```

### 5.3 RAG mirror

每筆 published record 都同步成一筆 `documents`：

```text
source_type = meeting_note | work_log
source_table = knowledge_records
source_id = knowledge_records.id
visibility = knowledge_records.visibility
metadata = {
  recordType,
  linkedTaskIds,
  linkedTaskTitles,
  occurredAt,
  startedAt,
  endedAt,
  recordedBy,
  participantsText
}
```

目前資料庫 enum 已有 `meeting_note`，但沒有 `work_log`。建議新增 enum value `work_log`。若短期不想動 enum，可暫用 `project_note` 搭配 `metadata.recordType = work_log`，但長期可讀性較差。

## 6. AI 分析演算法

### 6.1 儲存與 indexing

```text
saveRecord(input):
  validate record type and time fields
  resolve selected task node ids
  upsert knowledge_records
  replace record_task_links
  canonicalText = buildCanonicalRecordText(record, linkedTasks)
  contentHash = hash(canonicalText)
  upsert documents(source_table, source_id, contentHash)
  create document version when contentHash changes
  chunk canonicalText
  enqueue embedding sync job
```

canonical text 必須包含：

- 紀錄類型
- 時間資訊
- 記錄人員或參與人員
- 關聯任務標題、狀態、日期、負責人
- 原始內容

### 6.2 查詢與 graph expansion

AI 查詢不應只做 vector search。建議流程：

```text
answerProjectQuestion(query, scope):
  seedChunks = vectorSearch(query, scope, permission)
  seedSources = extract citations from seedChunks
  linkedTasks = find tasks linked to seed record sources
  relatedRecords = find records linked to seed tasks
  taskContext = load task status, dates, dependencies, tags
  finalContext = rank(seedChunks + relatedRecords + taskContext)
  generate answer with citations
```

分析類型：

- 任務風險分析
- 延期原因分析
- 會議決議追蹤
- 個人投入與任務進度對照
- 跨任務阻塞分析
- 跨部門重複討論偵測

## 7. 權限與隱私規則

會議紀錄建議：

- 專案會議：預設 project 可見
- 部門會議：預設 tenant 可見

個人工作紀錄建議：

- 工作追蹤用途：預設 project 可見
- 個人草稿或敏感紀錄：允許 private

RLS 原則：

- `private`：只有 created_by / recorded_by 可讀
- `project`：project member 可讀
- `tenant`：tenant member 可讀
- AI retrieval 必須套用同一套可讀規則

注意：若 `documents` 與 `document_chunks` 的 RLS 只檢查 tenant membership，private 紀錄會有外洩風險。實作前必須同步修正 retrieval SQL 與 RLS。

## 8. MVP 範圍

### 8.1 MVP 必做

- 新增 `knowledge_records`
- 新增 `record_task_links`
- 新增會議紀錄表單
- 新增個人工作紀錄表單
- 可收疊右側紀錄填寫欄
- 看板式任務選取器
- 紀錄列表
- 任務詳情頁相關紀錄時間軸
- published record 同步進 RAG documents
- AI citation 可點回紀錄

### 8.2 MVP 不做

- 自動語音轉逐字稿
- 參與人員 member mapping
- AI 自動修改任務
- 跨公司或外部協作者權限
- 複雜審批流程

### 8.3 第二階段

- 從會議紀錄抽取決議、阻塞、待辦
- AI 建議新增或更新任務，但必須由使用者確認
- 會議紀錄模板
- 個人週報自動產生
- 部門級跨 project 全域分析

## 9. 驗收標準

- 使用者可以在 active board 中建立會議紀錄，填寫紀錄時間、參與人員與內容。
- 使用者可以在 active board 中建立個人工作紀錄，記錄人員固定為目前登入者，時間區間預設為一週前到今天，並可手動調整。
- 紀錄填寫頁以可收疊右側欄呈現；進入任務選取模式時會自動收起，完成或取消選取後會恢復進入前狀態。
- 兩種紀錄都能透過看板式任務選取器連結一個或多個 task node。
- 被連結的 task node 詳情頁可看到相關紀錄。
- 編輯紀錄後，任務關聯與 RAG document 會同步更新。
- AI 回答中引用會議紀錄或工作紀錄時，citation 能回到原始紀錄。
- private 工作紀錄不會被沒有權限的使用者或 AI retrieval 讀取。

## 10. PM 建議交付切分

候選交付點：

- 會議紀錄與個人工作紀錄 MVP：完成資料模型、表單、看板任務選取、紀錄列表與任務時間軸。
- 紀錄 RAG 整合：完成 documents mirror、chunking、embedding job 與 citation 開啟紀錄。
- AI 全域分析：完成 graph expansion retrieval 與專案/任務分析快捷操作。

候選開發點：

- RLS 與 visibility 修正。
- `work_log` source type migration。
- 看板式 task picker 抽象元件。
- 任務詳情頁紀錄時間軸。
- record indexing adapter。

PM 建議先將第一個交付點定義為「紀錄 MVP」，避免一開始就把 AI 自動摘要、語音、任務自動更新一起塞入範圍。

## 11. 開放決策

以下為後續實作前需要確認的產品規則；若使用者未另行指定，PM 建議採用預設值。

1. 個人工作紀錄預設可見性  
   建議：project。原因是此功能目標包含專案分析；若預設 private，AI 全域分析價值會降低。

2. 部門會議是否可跨 board 連結任務  
   建議：可以，但 MVP UI 先從 active board 開始，再提供切換 board。資料模型應先支援跨 project。

3. AI 是否可以直接修改任務  
   建議：不可以。AI 只能提出建議，使用者確認後才新增或更新任務。
