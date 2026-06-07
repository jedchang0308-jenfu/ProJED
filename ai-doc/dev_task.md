# ProJED Dev Task

---

## 進度總覽

- [x] DEV-001: 四模式一致化緊湊 UI 系統

## DEV-001: 四模式一致化緊湊 UI 系統

狀態：Done  
優先級：P1  
負責角色：RD 開發，QA 驗證計畫，QC 事實驗證  
建立日期：2026-06-01  
規格文件：`ai-doc/specs/SPEC-001-unified-compact-ui-system.md`

## 任務背景

清單、看板、甘特圖、月曆四個模式目前承載相同任務資料，但相同定義的文字大小、字體、間距、控制項尺寸、任務資訊密度與底層 UI 模組不一致。使用者切換模式時會感受到視覺跳動與操作節奏不連續。

本任務要建立一套以看板緊湊度為基準的 Compact UI Design System，讓四個模式共用同一套 design token 與共用元件。

## 使用者故事

作為 ProJED 使用者，我希望在清單、看板、甘特圖、月曆間切換時，相同功能與相同資訊看起來一致，讓我能快速掃描任務，不需要重新適應每個模式的 UI 規則。

## 開發範圍

- [x] 建立 compact UI token，涵蓋字體、字級、字重、行高、間距、高度、radius、border、shadow。
- [x] 建立或整理共用 UI 元件：`ModeSwitcher`、`CompactTextButton`、`CompactIconButton`、`TaskMetaBadge`。
- [x] 統一 `ViewToolbar` 與四模式右側控制項。
- [x] 統一主導覽模式切換按鈕樣式。
- [x] 統一清單、看板、甘特圖、月曆中相同語意任務資訊的字級與間距。
- [x] 統一 `SharedTaskSidebar` 的 row height、indent、icon、hover、active 狀態。
- [x] 讓甘特圖 row height、bar height 與側邊清單對齊。
- [x] 讓月曆 weekday header、week row、task lane 與 compact token 對齊。
- [x] 保留看板目前緊湊密度，不讓可見資訊量退化。

## 不在本任務處理

- [ ] 不重構任務資料模型。
- [ ] 不改變拖曳排序、日期推算、依賴關係演算法。
- [ ] 不處理日曆訂閱、權限管理、備份功能。
- [ ] 不修復既有亂碼文案，除非該文案阻塞 build 或畫面驗證。
- [ ] 不建立全新設計框架或導入新 UI 套件。

## RD 執行步驟

### 1. UI 差距盤點

- [x] 搜尋四模式中重複的 toolbar、button、badge、task row、task card、task bar class。
- [x] 列出相同語意元件目前使用的 font-size、font-weight、padding、gap、height。
- [x] 確認哪些樣式可抽為 token，哪些必須保留模式差異。

### 2. 建立 token 與共用元件

- [x] 建立 compact token 來源，建議檔案為 `src/components/ui/compactTokens.ts` 或 CSS variables。
- [x] 建立 `ModeSwitcher`，取代 `MainLayout` 中手寫的四個模式按鈕。
- [x] 建立 `CompactTextButton`，統一「今天」、「跳轉至今天」、「新增任務」等小型文字按鈕。
- [x] 建立 `CompactIconButton`，統一側欄開關、上一月、下一月、undo、redo。
- [x] 建立 `TaskMetaBadge`，統一日期、進度、子任務數與狀態 badge。

### 3. 套用到四個模式

- [x] 清單模式：套用外層 padding、表頭高度、row padding、任務 meta token。
- [x] 看板模式：保留 10px 外距與 4px 任務間距，將任務 meta/badge 改接共用 token。
- [x] 甘特圖模式：統一 toolbar controls、側邊 row height、時間軸 row height、bar height。
- [x] 月曆模式：統一 toolbar controls、weekday header、week row、task lane、側邊 row height。
- [x] 共用側邊任務清單：確認甘特圖與月曆使用同一 row height 與 spacing。

### 4. 移除重複樣式

- [ ] 移除四模式中重複的 toolbar 容器。
- [ ] 移除四模式中重複的 icon button padding。
- [ ] 移除四模式中重複的 text button padding。
- [ ] 避免同一語意在不同檔案繼續使用不同 Tailwind class。

## QA 驗證計畫

### 驗證範圍

- [ ] 清單模式
- [ ] 看板模式
- [ ] 甘特圖模式
- [ ] 月曆模式
- [ ] 主導覽模式切換按鈕
- [ ] `ViewToolbar`
- [ ] `SharedTaskSidebar`
- [ ] 任務 title/meta/badge 顯示

### 使用者關鍵流程

- [ ] 使用者從看板切換到清單，toolbar 與模式切換按鈕不跳動。
- [ ] 使用者從清單切換到甘特圖，任務列與側邊清單視覺密度一致。
- [ ] 使用者從甘特圖切換到月曆，側邊任務清單 row height 不變。
- [ ] 使用者在看板展開子任務，任務 meta 與 badge 與其他模式一致。
- [ ] 使用者在四模式中掃描同一任務，任務標題字級與狀態資訊層級一致。

### FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| toolbar 切換時高度跳動 | 模式仍各自實作 toolbar | 視覺焦點漂移 | DOM 量測 toolbar height | 高 | 強制共用 `ViewToolbar` |
| 任務字級不一致 | 各模式手寫 text class | 使用者重新判讀資訊層級 | 截圖與 computed style 比對 | 高 | token 化 task title/meta |
| 甘特圖 row 與側邊任務列錯位 | row height 常數不同 | 時間軸難以閱讀 | DOM 量測 row/bar top | 高 | 共用 row height token |
| 月曆壓縮後任務條難點擊 | lane height 過小 | 操作性下降 | 手動點擊與 hit area 檢查 | 中 | 保留最小 lane height |
| 看板可見資訊量退化 | token 套用回推放大 spacing | 使用者看到更少任務 | DOM 量測 card height/gap | 高 | 看板密度作為上限基準 |
| Tailwind class 再次分歧 | 沒有共用元件 | 後續維護成本升高 | `rg` 搜尋重複 class | 中 | 建立共用元件並替換 |

### 測試案例

- [x] TC-001：四模式 `ViewToolbar` 高度皆為 48px。
- [x] TC-002：主導覽四個模式按鈕高度、字級、selected 狀態一致。
- [x] TC-003：清單任務列 title 與看板任務 title 使用相同語意字級。
- [x] TC-004：看板任務 meta、清單任務 meta、甘特任務 label、月曆任務 label 使用統一 token 或明確映射。
- [x] TC-005：甘特圖側邊 row height 與時間軸 row height 對齊。
- [x] TC-006：月曆側邊 row height 與甘特圖側邊 row height 一致。
- [x] TC-007：看板畫布左距仍為 10px，欄距仍為 10px。
- [x] TC-008：四模式切換 10 次後，toolbar、mode switcher、主要內容頂部不出現可見跳動。
- [ ] TC-009：桌面 viewport 與窄 viewport 下，按鈕文字不溢出、不重疊。
- [x] TC-010：`npm.cmd run lint -- --quiet` 通過。
- [x] TC-011：`npm.cmd run build` 通過。

### 通過標準

- [x] 四模式相同語意元件使用同一 token 或共用元件。
- [x] DOM 實測符合 spec 中列出的高度與 spacing。
- [x] 四模式切換時，主工具列與模式切換區不跳動。
- [x] 沒有新增 TypeScript、lint、build error。
- [x] 沒有引入無關資料邏輯變更。

### 證據收集方式

- [ ] 截圖：四模式 toolbar 與主要內容頂部。
- [x] DOM 量測：toolbar height、mode button height、task row height、card gap、gantt bar height、calendar week row height。
- [x] 指令輸出：lint、build。
- [x] `git diff --stat`：確認改動集中在 UI token、共用元件與四模式 view。

## QC 驗證項目

- [ ] 讀取 spec 與實作 diff，確認 RD 沒有超出範圍。
- [ ] 操作瀏覽器，逐一切換清單、看板、甘特圖、月曆。
- [ ] 量測四模式 toolbar 高度。
- [ ] 量測模式切換按鈕高度與 selected 樣式。
- [ ] 量測看板畫布 left padding 與欄距。
- [ ] 量測甘特圖 row height、bar height、側邊 row height。
- [ ] 量測月曆 week row height、task lane height、側邊 row height。
- [ ] 量測清單 row height 與 row padding。
- [ ] 執行 lint 與 build。
- [ ] 產出 QC fact report，列出通過、不通過與證據。

## 實作注意事項

- [ ] 保護既有使用者變更，不回復非本任務造成的修改。
- [ ] 不以全域 CSS 暴力覆蓋所有 button，避免破壞 modal、sidebar、dialog。
- [ ] 優先抽共用元件，避免繼續複製 Tailwind class。
- [ ] 保留手機觸控可用性，若桌面緊湊與手機 hit area 衝突，需用 media query 分流。
- [ ] 不修復非本任務文案亂碼，除非造成 build fail。

## 相關規格

- SPEC-001: `ai-doc/specs/SPEC-001-unified-compact-ui-system.md`

## 相關檔案

- `src/components/MainLayout.tsx`
- `src/components/ui/ViewToolbar.tsx`
- `src/components/ui/Button.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/StatusFilterBar.tsx`
- `src/components/BoardView.tsx`
- `src/components/CalendarView.tsx`
- `src/components/GanttView.tsx`
- `src/components/SharedTaskSidebar.tsx`
- `src/components/Wbs/WbsListView.tsx`
- `src/components/Wbs/WbsNodeItem.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/Gantt/GanttHeader.tsx`
- `src/components/Gantt/GanttTaskBar.tsx`
- `src/components/Gantt/utils.ts`

## 進度紀錄

- 2026-06-01：建立 spec 與 dev task，定義四模式一致化緊湊 UI 系統。
- 2026-06-01：完成 DEV-001 開發，新增 compact UI token、共用控制元件與 ModeSwitcher，統一清單、看板、甘特圖、月曆的 toolbar、主要控制項、任務 row/bar/lane 與畫布留白；lint、build 與 in-app browser 四模式切換驗證通過。
- 2026-06-01：依使用者回饋「字體還是長得不一樣」補強美學一致性：全域 UI 字體改為中英混排 system stack，button/input/select/textarea 強制繼承字體，四模式相關 `font-black`、`uppercase`、`tracking-*` 收斂為一致的 `font-semibold` 視覺語氣；lint、build 與四模式 computed font-family 驗證通過。

---

## PM Active Progress Update - 2026-06-04

- [x] DEV-001 [交付點] 統一 compact UI 系統
- [ ] DEV-002 [交付點] 會議紀錄與個人工作紀錄 MVP
- [x] DEV-005 [交付點] 會議看板主畫面紀錄工作流
- [ ] DEV-006 [交付點] Gmail-like 會議紀錄輸入器穩定化
- [ ] DEV-007 [交付點] 會議中原生看板編輯與任務變更紀錄
- [x] DEV-008 [交付點] 任務會議細節快速查找
- [x] DEV-009 [交付點] 會議模式任務詳情內快速補記
- [ ] DEV-010 [交付點] 會議紀錄操作按鈕狀態溝通設計

## DEV-002：會議紀錄與個人工作紀錄 MVP

狀態：Done
節點類型：交付點
父交付點：無
是否計入產品交付完成：是
優先級：P1
原始需求邊界：使用者要求在 ProJED 加入「會議紀錄」與「個人工作紀錄」，可從看板快速選取相關任務，透過 task node 連結紀錄資訊，讓 AI 可做全域分析。
主要規格：`ai-doc/specs/SPEC-003-meeting-work-records-workflow.md`

## 任務目標

在 ProJED 中建立「專案知識紀錄層」的 MVP，讓使用者可以快速建立會議紀錄與個人工作紀錄，並把紀錄連到一個或多個 task node。完成後，任務詳情頁可回看相關紀錄，紀錄可進入 RAG documents，作為後續 AI 全域分析基礎。

## 開發範圍

- [ ] 建立紀錄資料模型：`knowledge_records`、`record_task_links`。
- [ ] 建立會議紀錄表單：紀錄時間、參與人員文字輸入、內容、關聯任務。
- [ ] 建立個人工作紀錄表單：記錄人員固定目前登入者、時間區間預設一週前到今天、內容、關聯任務。
- [ ] 建立可收疊右側紀錄填寫欄。
- [ ] 進入看板式任務選取模式時，自動收起右側欄；完成或取消後恢復進入前狀態。
- [ ] 建立看板式任務選取器，支援多選 task node。
- [ ] 建立紀錄列表。
- [ ] 在任務詳情頁新增相關紀錄時間軸。
- [ ] 將 published record 同步成 RAG documents。
- [ ] AI citation 可回到原始紀錄。

## 不在本交付點範圍

- 語音逐字稿。
- 參與人員 member mapping。
- AI 自動修改任務。
- 複雜審批流程。
- 完整部門級 BI 報表。

## 驗收標準

- [ ] 使用者可以在 active board 建立會議紀錄，填寫紀錄時間、參與人員與內容。
- [ ] 使用者可以建立個人工作紀錄，記錄人員固定為目前登入者。
- [ ] 個人工作紀錄時間區間預設為一週前到今天，且可手動調整。
- [ ] 紀錄填寫頁以可收疊右側欄呈現。
- [ ] 進入任務選取模式時右側欄自動收起；完成或取消後恢復進入前狀態。
- [ ] 兩種紀錄都能透過看板式任務選取器連結一個或多個 task node。
- [ ] 被連結的 task node 詳情頁可看到相關紀錄。
- [ ] 編輯紀錄後，任務關聯與 RAG document 會同步更新。
- [ ] AI 回答引用會議紀錄或工作紀錄時，citation 能回到原始紀錄。
- [ ] private 工作紀錄不會被沒有權限的使用者或 AI retrieval 讀取。

## RD 執行計畫

- [ ] 盤點現有 `TaskNode`、`wbs_items`、RAG documents、citation contract 與權限模型。
- [ ] 補 Supabase migration 與 TypeScript database types。
- [ ] 實作 record service / store。
- [ ] 實作右側紀錄填寫欄與 draft state。
- [ ] 抽出看板式 task picker 選取模式。
- [ ] 實作紀錄列表與任務詳情頁紀錄時間軸。
- [ ] 實作 record to RAG document indexing adapter。
- [ ] 補必要的 lint/build/type verification。

## QA 驗證計畫

- [ ] 使用者流程：會議紀錄新增、編輯、連結任務、回到任務查看。
- [ ] 使用者流程：個人工作紀錄新增、預設一週時間區間、連結任務、回到任務查看。
- [ ] UI 流程：右側欄展開、收起、進入選取模式自動收起、選取完成恢復狀態。
- [ ] 邊界情境：未選任務、跨 board 任務、空內容 draft、時間區間不合法。
- [ ] 權限情境：private / project / tenant visibility 與 RAG retrieval 一致。
- [ ] FMEA：RAG citation 指錯來源、private 紀錄外洩、task link orphan、draft 遺失、選取模式與 drag-and-drop 衝突。

## QC 驗證結果

- [ ] 尚未執行；等待 RD 實作完成後依 QA 計畫驗證。

## 相關文件

- SPEC：`ai-doc/specs/SPEC-003-meeting-work-records-workflow.md`
- Backlog：`ai-doc/backlog.md`
- Documentation map：`ai-doc/documentation_map.md`

## 變更紀錄

- 2026-06-04：建立 DEV-002 PM 專案文件與交付邊界。

---

## PM DEV-003：紀錄內容內嵌任務標籤

日期：2026-06-04
狀態：Ready
任務類型：Product UX refinement
優先級：P1
主要規格：`ai-doc/specs/SPEC-004-record-content-inline-task-tags.md`
父交付點：DEV-002 會議紀錄與個人工作紀錄 MVP

### 任務目標

修改紀錄與任務的關聯 UX，讓使用者可在撰寫內容時直接引用任務。看板任務選取仍是入口，但點選任務後，任務需插入 `內容` 編輯器目前游標位置，並以類似 Codex tag skill 的視覺 chip 呈現。

### 使用者流程

- 使用者開啟可收疊右側紀錄欄，並把游標放在 `內容` 欄。
- 使用者點擊 `從看板選取`。
- 右側欄自動收起，ProJED 切換到既有看板模式。
- 使用者直接點選看板任務卡或 checklist 任務。
- ProJED 恢復紀錄欄，並把任務 tag 插入原本內容游標位置。
- 下方仍可保留關聯任務摘要，但主要任務引用要出現在內容本文中。

### 功能需求

- 內容編輯器需支援純文字與任務 tag 混排。
- 任務 tag 視覺需接近 Codex mention chip：精簡、可讀、鍵盤友善，且和一般文字有明確區別。
- 儲存內容維持字串格式，token 語法為：`@[Task title](task:nodeId)`。
- 重新開啟紀錄時，需把既有 token parse 回 visual tag。
- 儲存與發布時需保留 token 語法，供 AI/RAG 分析。
- `record_task_links` 仍是權限、任務時間軸與 retrieval 使用的唯一結構化 graph edge。
- 同一任務可在內容中出現多次，但 `record_task_links` 每個 record/task/role 僅保留唯一關聯。
- 看板選取不得開啟另一個 task picker page。

### RD 開發檢查點

- 新增可重用 `RecordContentEditor`，支援內容文字與任務 tag chip。
- 新增 mention parse/serialize helper，建議路徑：`src/utils/recordContentMentions.ts`。
- 擴充 `useRecordStore`，在進入看板選取前記住 content cursor/selection。
- `completeTaskSelection` 收到選取任務後，需把 task mention token 插入記憶的游標位置。
- 保留既有 linked-task role data：`primary`、`related`、`follow_up`，並在插入內容時同步更新。
- 保持鍵盤編輯行為：輸入、刪除、複製貼上、多行內容、游標移動。
- 本 DEV 預期不需要 database migration。

### QA 驗證計畫

- 正式 UX 驗證文件：`ai-doc/qa/QA-DEV-003-record-content-inline-task-tags-ux-validation.md`。
- 狀態：Ready for QC；QC 執行時以該文件的 UX-001 到 UX-020 作為主要操作腳本。
- 建立會議紀錄，輸入文字，把游標放在中間，從看板選任務，確認 tag 插在該游標位置。
- 建立個人工作紀錄，確認同樣支援 inline task tag。
- 驗證進入看板選取時右側欄自動收起，完成或取消後恢復。
- 驗證儲存草稿與發布紀錄後，重新開啟仍能 render 任務 tag。
- 驗證同一任務可在內容中插入多次。
- 驗證 `record_task_links` 維持唯一，任務詳情時間軸仍可看到紀錄。
- 驗證 plain text search / RAG-ready content 保留足夠任務標題語境。

### QC 證據需求

- 進入看板選取前的瀏覽器截圖或 snapshot，需看得到內容游標位置。
- 選取任務後的瀏覽器截圖或 snapshot，需看得到 `內容` 內的 inline task tag。
- 儲存後 record payload 或 local state 證據，需看得到 token 語法。
- 若有實作測試，收集 lint/build 或 targeted test 輸出。

### 不在範圍

- 任務 tag 以外的 rich text formatting。
- member/user mention chip。
- 新 database schema。
- RAG embedding pipeline 行為變更。

### 交付結果

- [x] 已新增 `RecordContentEditor`，支援 contentEditable 內容與 inline task chip。
- [x] 已新增 `recordContentMentions` helper，統一 parse、serialize、insert、extract/sync task links。
- [x] 從看板點選任務會插入 `@[Task title](task:nodeId)` token，並在 editor 中顯示為 chip。
- [x] 同一任務可在內容中插入多次。
- [x] 關聯任務摘要仍維持唯一任務，並保留 role dropdown。
- [x] 看板選取仍使用原看板模式，進入選取時右側欄自動收合。
- [x] 2026-06-04 audit 修正 `RecordContentEditor`：改為 imperative DOM sync，避免 contentEditable 快速輸入產生重複殘影文字。

### 驗證結果

- [x] `npx.cmd tsc --noEmit`
- [x] `npm.cmd run lint -- --quiet`
- [x] `npm.cmd run verify:dev-002-records`
- [x] `npm.cmd run build`
- [x] Playwright smoke：會議紀錄內容可輸入文字。
- [x] Playwright smoke：從看板選取任務後，右側欄恢復且內容內出現 task chip。
- [x] Playwright smoke：同一任務插入兩次時，內容有 2 個 chip，摘要仍只有 1 筆唯一任務。
- [x] `npm.cmd run verify:dev-003-record-tags`：驗證游標位置插入、重複 tag、刪除同步、legacy link 保留、plain text preview 去除 raw token。
- [x] 2026-06-04 audit Playwright smoke：輸入 `今天討論 release ` 後文字無重複殘影；重複選 `資料庫改SQL` 後 chip=2、摘要 role select=1。

### PM 文件更新

- [x] 已建立 DEV-003 使用者視角 UX 驗證計畫：`ai-doc/qa/QA-DEV-003-record-content-inline-task-tags-ux-validation.md`。
- [x] 驗證計畫已納入文件地圖：`ai-doc/documentation_map.md`。

---

## PM DEV-004：全人個人與團隊待辦平台 MVP

日期：2026-06-04
狀態：Planned
任務類型：Product MVP
優先級：P1
主要規格：`ai-doc/specs/SPEC-002-whole-person-todo-platform.md`
Backlog：`ai-doc/backlog.md`
交付規劃：DEV-004 為 umbrella PM delivery program；RD/QA/QC 實作追蹤以 DEV-004A 到 DEV-004D 四個獨立交付點為準。

### 任務目標

建立 ProJED 的全人待辦 MVP，讓使用者能以低摩擦方式捕捉個人事項，透過右側收件匣整理，並在需要時以看板優先的定位流程轉成正式 `TaskNode`。MVP 同時提供「我的今日」、站內通知、輕量共享、歷史歸檔與最小既有 `TaskNode` 相容。

### 已確認產品決策

- 個人 `InboxItem` 不屬於 workspace；只有轉正式任務時才進入 board/workspace。
- 首頁維持最近使用 board；「我的今日」放在 board 上方並保留右側抽屜入口。
- 全域收件匣採右側抽屜，分頁順序為 `今日 / 未整理 / 通知 / 完成 / 歷史`。
- 頂部列常駐快速輸入框，支援 `/` 聚焦，送出成功後清空並保留焦點。
- 第一版 `InboxItem.itemType` 支援 `todo / someday / note`。
- 日期解析只支援簡單關鍵字與日期格式，結果先作為 `suggestedDueDate`。
- 看板定位採大型 overlay，以看板預覽與點選插入線決定 board、欄位與任務間插入位置。
- 輕量共享可通知被指派者，但不可再改派第三人，只能退回建立者。
- 完成區保留 30 天後歸檔；歷史入口支援文字搜尋。
- 通知支援已讀/未讀；已讀 30 天後歸檔，未讀永久保留。
- MVP 接現有 Firebase/local backend；Supabase、雙後端與同步佇列列為 future upgrade。

### 不在本交付點範圍

- 團隊承諾功能、check-in date、reviewer、blocked reason、團隊週回顧。
- 完整 AI 自動分類、自動排程、自動轉任務。
- browser notification、email、calendar 外部提醒。
- 拖曳式看板定位。
- 完整同步佇列 UI。
- Supabase / Firebase 雙後端一致性改造。
- 完整歷史頁與進階日期篩選。

### RD 交付點拆分

| DEV | 狀態 | 節點類型 | 父交付點 | 交付完成判定 |
|---|---|---|---|---|
| DEV-004A | Planned | 交付點 | DEV-004 | 資料模型、service/store、local/test backend、Firebase backend 與既有 `TaskNode` 相容查詢可被 QA/QC 驗證。 |
| DEV-004B | Planned | 交付點 | DEV-004 | 頂部快速捕捉與私人收件匣建立流程可用，包含 `/` 聚焦、日期建議與 pending 離線狀態。 |
| DEV-004C | Planned | 交付點 | DEV-004 | 右側抽屜、我的今日、通知、完成與歷史分頁完成最小可用流程。 |
| DEV-004D | Planned | 交付點 | DEV-004 | 使用者能從 inbox item 以看板定位 overlay 建立正式 `TaskNode`，並回填來源狀態。 |

#### DEV-004A：資料模型與 service/store

- [ ] 定義 `InboxItem`、`InboxNotification` TypeScript 型別。
- [ ] 建立 `InboxItem` 狀態：`itemType`、`captureStatus`、`syncStatus`、`pinnedAt`、`completedAt`、`archivedAt`、`returnedAt`、`returnReason`。
- [ ] 建立 local/test backend 行為。
- [ ] 建立 Firebase service 行為。
- [ ] 建立最小既有 `TaskNode` 相容查詢：指派給我、今天、逾期。
- [ ] 確認不改寫既有 `TaskNode` 資料。

#### DEV-004B：全域收件匣與頂部快速捕捉

- [ ] 在頂部列加入常駐快速輸入框。
- [ ] 支援 `/` 聚焦且不干擾其他文字輸入。
- [ ] 送出後建立私人 `InboxItem`，清空並保留焦點。
- [ ] 支援簡單日期解析：今天、明天、下週、`YYYY-MM-DD`、`MM/DD`。
- [ ] 顯示日期建議確認/清除提示。
- [ ] 支援 pending 離線暫存，可改文字與日期，不可指派或轉任務。

#### DEV-004C：右側抽屜、我的今日、通知與歷史

- [ ] 建立右側抽屜與分頁：`今日 / 未整理 / 通知 / 完成 / 歷史`。
- [ ] 抽屜預設分頁：有今日項目開今日，否則開未整理。
- [ ] 今日分頁分區：`InboxItem`、`我的正式任務`、`逾期任務`。
- [ ] 每區最多 5 筆，可展開更多。
- [ ] 逾期任務 1-3 筆展開，超過 3 筆收合。
- [ ] 未整理分頁支援釘選，釘選排最上方。
- [ ] 完成分頁只允許單筆恢復。
- [ ] 歷史分頁支援文字搜尋。
- [ ] 通知分頁支援已讀/未讀、通知歷史與 badge。
- [ ] 支援基本快捷鍵：Enter、Esc、ArrowUp、ArrowDown。

#### DEV-004D：看板定位 overlay 與正式任務轉換

- [ ] 從右側抽屜或我的今日啟動轉任務。
- [ ] 開啟大型看板定位 overlay。
- [ ] 支援選 board、欄位、任務前/後、欄位頂部/底部插入線。
- [ ] overlay 可修改 title、owner、due date。
- [ ] 由 board 反推 workspace。
- [ ] 建立正式 `TaskNode` 後回填 `promotedTaskNodeId`。
- [ ] 成功後回到原處，顯示「查看任務」。
- [ ] pending 離線項目同步成功前不可轉正式任務。

### QA 驗證方向

QA 應以 DEV-004A 到 DEV-004D 分別制定驗證計畫；可在共通回歸項目共用證據，但每個交付點都需有獨立通過標準。

- 快速捕捉：連續輸入多筆、日期解析、失敗暫存、恢復連線同步。
- 收件匣：未整理排序、釘選、分類、完成、恢復、歷史搜尋。
- 我的今日：分區顯示、每區 5 筆、逾期區展開規則、正式 `TaskNode` 只查看。
- 輕量共享：指派、通知、已讀/未讀、退回、不可再改派第三人。
- 看板定位：overlay 空間、插入線、order、parentId、建立成功回填。
- 權限與可見性：私人 inbox、輕量共享、正式 TaskNode 進 board/workspace。
- 回歸：既有看板拖曳、任務詳情、清單/甘特/月曆顯示不受破壞。

### QC 驗證需求

- 逐一判定 DEV-004A、DEV-004B、DEV-004C、DEV-004D 是否達成交付完成判定，不用單一 DEV-004 大結論取代。
- 驗證 RD 實作未超出 SPEC-002 MVP 範圍。
- 驗證未做團隊承諾、外部提醒、拖曳定位、雙後端改造。
- 收集 lint/build/typecheck 輸出。
- 使用瀏覽器操作快速捕捉、右側抽屜、今日分頁、通知、轉任務 overlay。
- 對 pending 離線、歷史歸檔、通知已讀/未讀做狀態證據截圖或 local state 證據。

### 未來升級治理

- 未來升級追蹤位於 `ai-doc/backlog.md` 的 `Future Upgrade Tracking - SPEC-002`。
- 升級項目進入 `planned` 前，需補 spec、dev task、QA 驗證計畫。
- 不得只把未來升級保留在對話中。

### 狀態

- [x] 已建立 SPEC-002。
- [x] 已建立 backlog future upgrade tracking。
- [x] 已建立 DEV-004 umbrella 與 DEV-004A-D dev task 條目。
- [ ] 尚未執行 RD 開發。
- [x] 已新增 DEV-003 專用 verifier：`scripts/verify-dev-003-record-content-tags.mjs`，並掛載為 `npm.cmd run verify:dev-003-record-tags`。

---

## PM DEV-005：會議看板主畫面紀錄工作流

日期：2026-06-05
狀態：Done
節點類型：交付點
任務類型：Product UX refinement
父交付點：DEV-002 / DEV-003 follow-up
是否計入產品交付完成：是
優先級：P1
主要規格：`ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md`

### 任務目標

修正會議紀錄工作流的主視角：開會時所有人共同看的畫面應是 active board 的議題看板，而不是紀錄庫或紀錄表單。DEV-005 要讓「會議紀錄」變成會議中的輔助速記與任務連結工具，並保留 DEV-002 / DEV-003 已完成的紀錄資料模型、inline task tag 與 RAG-ready content 行為。

### 開發範圍

- [x] 上方「寫紀錄」入口改成會議導向入口，啟動後建立或開啟 meeting draft。
- [x] 啟動會議後自動切到 `board` view，並保持議題看板為主畫面。
- [x] 在 `BoardView` 增加會議狀態列，顯示會議標題、已連結任務數、速記欄展開/收合、儲存草稿、發布與結束會議。
- [x] 在會議模式下點 Kanban card 可插入 `@[title](task:id)` 到目前紀錄內容游標位置。
- [x] 在會議模式下點 checklist item 可插入 `@[title](task:id)` 到目前紀錄內容游標位置。
- [x] `RecordSidebar` 在 meeting mode 下優先顯示內容編輯器，壓縮標題、時間、參與人員與 visibility。
- [x] `RecordSidebar` 最近紀錄列表在 meeting mode 下隱藏、下移或降級。
- [x] `RecordsView` 文案與定位調整為會後查閱與整理的紀錄庫。

### 不在本交付點範圍

- 完整會議管理系統。
- AI 決議抽取、自動建立任務或自動修改任務。
- 跨 board 會議。
- 多記錄者即時協作。
- 新增資料庫 migration。
- 修改 `KnowledgeRecord`、`record_task_links` 或 RAG token 格式。

### 驗收標準

- [x] 使用者從上方會議入口啟動後，主畫面停留在 `board` view。
- [x] 使用者可在會議模式中看完整議題看板，同時用右側速記欄記錄。
- [x] 點 Kanban card / checklist item 後，task tag 插入到目前紀錄內容游標位置。
- [x] 速記欄收合與展開不遺失 draft、游標或已連結任務。
- [x] 發布後紀錄會出現在紀錄庫；任務詳情頁相關紀錄時間軸由 DEV-002 verifier 覆蓋。
- [x] 既有 DEV-002、DEV-003 的紀錄建立、inline tag、RAG-ready content 行為不退化。

### RD handoff

- [x] 先閱讀 `SPEC-005`，並確認不新增資料模型與 migration。
- [x] 檢查 `useRecordStore` 是否適合新增 UI-only meeting mode 狀態。
- [x] 檢查 `MainLayout` 上方入口、`BoardView` 狀態列、`RecordSidebar` meeting mode 版面與 `RecordsView` 文案。
- [x] 優先沿用 DEV-003 的 `insertTaskMentionAtCursor` 與 `recordContentMentions` helper。
- [x] 完成後執行 lint、DEV-002/003 verifier 與 build。

### QA 驗證計畫重點

- [ ] 使用者流程：從上方入口開始會議、觀看議題、速記、點任務插入 tag、發布紀錄。
- [ ] 邊界情境：沒有 active board、沒有 draft、速記欄收合、重複點同一任務、從紀錄庫開啟既有紀錄。
- [ ] FMEA：會議模式誤改任務、點任務行為不清楚、draft 遺失、`record_task_links` 不同步、筆電 viewport 遮蔽議題。
- [ ] 回歸：DEV-002 紀錄 CRUD、DEV-003 inline tag、任務詳情相關紀錄、RAG-ready content。

### QC 驗證需求

- [ ] 依 QA 計畫做事實驗證，不修改程式碼。
- [ ] 收集自動驗證輸出。
- [ ] 使用桌機與筆電 viewport 檢查狀態列、看板、速記欄是否重疊或遮蔽；手機版不列入會議記錄驗收。
- [ ] 驗證啟動會議後仍停留在 `board` view。
- [ ] 驗證 task tag 插入位置、已連結任務數與發布後紀錄可回看。

### 驗證命令

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-002-records
npm.cmd run verify:dev-003-record-tags
npm.cmd run build
```

### 相關文件

- SPEC：`ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md`
- Backlog：`ai-doc/backlog.md`
- Documentation map：`ai-doc/documentation_map.md`

### 狀態

- [x] 已建立 SPEC-005。
- [x] 已更新 backlog。
- [x] 已建立 DEV-005 dev task 條目。
- [x] RD 開發已完成。
- [x] 已新增交付報告：`ai-doc/reports/PM-DEV-005-meeting-board-primary-workflow-implementation.md`。

---

## PM DEV-006：Gmail-like 會議紀錄輸入器穩定化

日期：2026-06-06
狀態：Done
節點類型：交付點
任務類型：Product UX refinement
父交付點：DEV-003 / DEV-005 follow-up
是否計入產品交付完成：是
優先級：P1
主要規格：`ai-doc/specs/SPEC-006-gmail-like-record-editor.md`
QA 計畫：`ai-doc/qa/QA-DEV-006-gmail-like-record-editor.md`

### 任務目標

修正會議紀錄內容輸入器的核心輸入 bug，讓它具備 Gmail 撰寫區的基本肌肉記憶，並讓已關聯任務 chip 可以被複製、剪下、貼上與移動。此 DEV 不改資料模型，繼續使用 `@[title](task:id)` 與 `record_task_links`。

### 開發範圍

- [x] 導入成熟 editor engine，取代目前自製 `contentEditable` DOM 同步。
- [x] 保留 `RecordContentEditor` 對外 props，降低對 sidebar/store 的影響。
- [x] 建立 task chip node，支援 parse、render、serialize、copy、cut、paste。
- [x] 修正 `Ctrl+A`、Enter、貼上多行、undo/redo、中文 IME。
- [x] task chip 支援 copy / cut / paste / move / Backspace / Delete。
- [x] 新增 `verify:dev-006-gmail-editor` 自動驗證。
- [x] 使用 browser 執行實際輸入測試。

### 不在本交付點範圍

- Gmail 富文字工具列。
- bold / italic / link / list 儲存。
- 新增 migration。
- 改用 editor JSON 作為後端儲存格式。
- 多人即時協作。

### 驗收標準

- [x] `Ctrl+A` 後輸入文字會替換 editor 全文。
- [x] `Ctrl+Z` / `Ctrl+Y` 可復原與重做 editor 內文字。
- [x] Enter 與貼上多行文字會保存可讀換行，儲存字串使用 `\n`。
- [ ] 中文 IME 輸入不漏字、不重字。
- [x] task chip 可複製、剪下、貼上與移動，貼上後仍是 chip。
- [ ] 剪下或刪除 chip 後 `record_task_links` 同步更新。
- [ ] 發布後重開紀錄，文字、換行、task chip 與關聯任務一致。
- [x] DEV-002、DEV-003、DEV-005 回歸通過。

### RD handoff

- [x] 先閱讀 `SPEC-006` 與 `QA-DEV-006`。
- [x] 導入 editor dependency 前確認 package lock 會更新。
- [x] 保護 DEV-005 未提交變更，不回復既有 meeting mode。
- [x] 完成後執行 lint、DEV-002/003/006 verifier 與 build。
- [x] 補 browser 實際輸入測試證據。

### QA / QC 重點

- [ ] 以 `QA-DEV-006` 的 13 個實際輸入案例為主。
- [ ] 必須包含 task chip copy / cut / paste / move 實測。
- [ ] 必須包含中文 IME 輸入實測。
- [ ] 必須檢查 1024x768 筆電 viewport；手機版不列入會議記錄驗收。

### 驗證命令

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-002-records
npm.cmd run verify:dev-003-record-tags
npm.cmd run verify:dev-006-gmail-editor
npm.cmd run verify:dev-006-browser-input
npm.cmd run build
```

### 狀態

- [x] 已建立 SPEC-006。
- [x] 已建立 QA-DEV-006 驗證計畫。
- [x] 已建立 DEV-006 dev task 條目。
- [x] RD 開發完成。
- [x] 實際 browser input verifier 通過，截圖：`output/playwright/dev-006-gmail-editor.png`。

---

## PM DEV-007：會議中原生看板編輯與任務變更紀錄

日期：2026-06-06
狀態：Done
節點類型：交付點
任務類型：Product UX refinement
父交付點：DEV-005 / DEV-006 follow-up
是否計入產品交付完成：是
優先級：P1
主要規格：`ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md`
QA 計畫：`ai-doc/qa/QA-DEV-007-meeting-activity-capture.md`

### 任務目標

會議中看板必須維持一般編輯體驗；任務狀態與移動等變更由背景收集，儲存/發布會議紀錄時自動附加為「會議中任務變更」。

### 開發範圍

- [x] 移除 meeting mode 對 Kanban card / checklist item click 的劫持。
- [x] 會議模式中保留卡片拖曳、標題編輯、context menu 與 checklist 操作。
- [x] 新增 meeting activity buffer 與 append 去重機制。
- [x] `useWbsStore.updateNode` 在任務變更時通知 record store。
- [x] `saveDraft` 前自動將 pending meeting activity append 到 content。
- [x] 新增 DEV-007 verifier。

### 驗收標準

- [x] 開始會議後看板操作與一般看板一致。
- [x] 任務狀態變更會進入會議紀錄內容。
- [x] 任務移動會進入會議紀錄內容。
- [x] activity 使用 task inline token 並同步 task links。
- [x] 多次儲存不重複 append 同一 activity。
- [x] DEV-002、DEV-003、DEV-006 回歸通過。

### 驗證命令

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-002-records
npm.cmd run verify:dev-003-record-tags
npm.cmd run verify:dev-006-gmail-editor
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run build
```

### 狀態

- [x] 已建立 SPEC-007。
- [x] 已建立 QA-DEV-007 驗證計畫。
- [x] 已建立 DEV-007 dev task 條目。
- [x] RD 開發完成。
- [x] in-app browser 檢查：會議狀態列顯示「看板維持一般編輯」，舊文案「點議題會插入紀錄」未出現。
- [x] in-app browser 檢查：會議中點任務未插入 tag，已連結任務仍為 0。

---

## PM DEV-008：任務會議細節快速查找

日期：2026-06-06
狀態：Done
節點類型：交付點
任務類型：Product UX refinement
父交付點：DEV-002 / DEV-007 follow-up
是否計入產品交付完成：是
優先級：P1
主要規格：`ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md`
QA 計畫：`ai-doc/qa/QA-DEV-008-task-meeting-detail-lookup.md`

### 任務目標

讓未來專案成員可從任務詳情快速查找此任務在會議或工作紀錄中被討論過的細節，不必先進紀錄庫翻整篇紀錄。

### 開發範圍

- [x] 任務詳情頁將「關聯紀錄」升級為「任務知識」區塊。
- [x] 關聯紀錄優先顯示包含目前任務 inline tag 的片段。
- [x] 沒有 inline task tag 的 legacy 關聯紀錄顯示整篇關聯 fallback。
- [x] 任務知識搜尋範圍限定在目前任務的備註與關聯紀錄片段。
- [x] DEV-007 寫入的任務變更片段可在任務知識中顯示。
- [x] 點擊片段可開啟原始紀錄。

### 不在本交付點範圍

- AI 問答或語意搜尋。
- AI 自動摘要、決議抽取或自動標記任務。
- 新增 migration、meeting event table 或修改 `KnowledgeRecord` / `record_task_links`。

### 驗收標準

- [x] 同一篇會議紀錄同時提到任務 A 與任務 B 時，任務 A 只顯示任務 A 片段，任務 B 只顯示任務 B 片段。
- [x] 任務內搜尋可命中目前任務的會議細節、工作紀錄與備註。
- [x] 搜尋任務 B 專屬關鍵字不會在任務 A 詳情中命中。
- [x] 只有 `record_task_links` 的 legacy 關聯紀錄仍可被看到。
- [x] 會議中任務狀態變更可從該任務詳情查到。
- [x] 不新增資料模型或 migration。

### RD handoff

- [x] 先閱讀 `SPEC-008` 與既有 `TaskRecordTimeline`。
- [x] 新增純函式片段抽取工具，避免把邏輯寫死在 React component。
- [x] 延伸 `TaskRecordTimeline`，保留原 `nodeId` 呼叫介面。
- [x] 新增 `verify:dev-008-task-knowledge`。
- [x] 完成後執行 lint、DEV-002、DEV-006、DEV-007、DEV-008 verifier 與 build。

### QA / QC 重點

- [x] 依 `QA-DEV-008` 驗證雙任務片段隔離、fallback、搜尋與原始紀錄開啟。
- [x] 檢查桌機與筆電 viewport 下任務詳情搜尋框與片段清單不重疊；手機版不列入會議記錄驗收。
- [x] 確認本 DEV 不改 schema、不擴張到 AI 問答。

### 驗證命令

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-002-records
npm.cmd run verify:dev-006-gmail-editor
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run build
```

### 狀態

- [x] 已建立 SPEC-008。
- [x] 已建立 QA-DEV-008 驗證計畫。
- [x] 已建立 DEV-008 dev task 條目。
- [x] RD 開發完成。
- [x] `npm.cmd run lint -- --quiet`
- [x] `npm.cmd run verify:dev-002-records`
- [x] `npm.cmd run verify:dev-006-gmail-editor`
- [x] `npm.cmd run verify:dev-007-meeting-activity`
- [x] `npm.cmd run verify:dev-008-task-knowledge`
- [x] `npm.cmd run build`
- [x] Playwright UI smoke：固定測試環境登入後，任務詳情顯示「任務知識」、搜尋框、空狀態，console 0 errors。
- [x] 補充決策：手機版不列入會議記錄驗收；既有 mobile smoke 僅作為參考，不作為 release gate。

---

## PM DEV-009：會議模式任務詳情內快速補記

日期：2026-06-07
狀態：Done
節點類型：交付點
任務類型：Product UX refinement
父交付點：DEV-005 / DEV-007 / DEV-008 follow-up
是否計入產品交付完成：是
優先級：P1
主要規格：`ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md`
QA 計畫：`ai-doc/qa/QA-DEV-009-meeting-task-detail-quick-note.md`

### 任務目標

會議模式下，使用者可在任務詳情內直接補記目前任務的討論內容；系統自動 append 到目前 meeting draft，並用 inline task tag 連到該任務。

### 開發範圍

- [x] `TaskDetailsModal` 在 meeting mode 顯示「本次會議」快速補記。
- [x] 補記內容寫入目前 meeting draft，不寫入 `TaskNode.detailNotes`。
- [x] 補記內容自動包含目前任務 inline tag。
- [x] append 後同步 `record_task_links`。
- [x] 支援「加入紀錄」與 `Ctrl+Enter`。
- [x] 空白內容不可加入紀錄。

### 不在本交付點範圍

- 任務詳情內完整會議紀錄編輯器。
- AI 摘要、決議抽取或任務自動更新。
- 新增 migration、meeting event table 或多人即時協作。

### 驗收標準

- [x] 非 meeting mode 不顯示快速補記區。
- [x] meeting mode 任務詳情顯示快速補記區。
- [x] 補記後 meeting draft content 包含 `## 任務討論`、時間、目前任務 tag 與輸入文字。
- [x] 補記後 task links 包含目前任務。
- [x] 補記不修改任務備註。
- [x] 發布後可由 DEV-008 任務知識查到。

### RD handoff

- [x] 先閱讀 `SPEC-009`、`TaskDetailsModal` 與 `useRecordStore`。
- [x] 新增 store action append 任務討論到 meeting draft。
- [x] 任務詳情只呼叫 store action，不直接管理 record draft 格式。
- [x] 新增 DEV-009 verifier。
- [x] 完成後執行 lint、DEV-007、DEV-008、DEV-009 verifier 與 build。

### QA / QC 重點

- [x] 驗證 UI 只在 meeting mode 出現。
- [x] 驗證 append 進 meeting draft 而不是任務備註。
- [x] 驗證 inline task tag 與 taskLinks 同步。
- [x] 驗證 `Ctrl+Enter` 行為。
- [x] 桌機與筆電 viewport smoke；手機版不列入會議記錄工作流驗收。

### 驗證命令

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-009-task-detail-quick-note
npm.cmd run build
```

### 狀態

- [x] 已建立 SPEC-009。
- [x] 已建立 QA-DEV-009 驗證計畫。
- [x] 已建立 DEV-009 dev task 條目。
- [x] RD 開發完成。
- [x] `npm.cmd run lint -- --quiet`
- [x] `npm.cmd run verify:dev-007-meeting-activity`
- [x] `npm.cmd run verify:dev-008-task-knowledge`
- [x] `npm.cmd run verify:dev-009-task-detail-quick-note`
- [x] `npm.cmd run build`
- [x] Playwright UI smoke：固定測試環境開始會議後，任務詳情顯示「本次會議」快速補記；輸入後加入 meeting draft 並清空輸入框。
- [x] 補充決策：手機版不列入會議記錄工作流驗收；既有 mobile smoke 僅作為參考，不作為 release gate。
- [x] QC UX 驗證通過：桌機 1440x950 與筆電 1024x768 smoke 均通過，見 `ai-doc/qc/QC-DEV-009-meeting-task-detail-quick-note-ux.md`。

---

## PM DEV-010：會議紀錄操作按鈕狀態溝通設計

日期：2026-06-07
狀態：Ready
節點類型：交付點
任務類型：Product UX refinement
父交付點：DEV-005 / DEV-006 / DEV-007 / DEV-009 follow-up
是否計入產品交付完成：是
優先級：P1
主要規格：`ai-doc/specs/SPEC-010-meeting-record-action-feedback.md`
QA 計畫：`ai-doc/qa/QA-DEV-010-meeting-record-action-feedback.md`

### 任務目標

修正會議模式操作按鈕的溝通問題。使用者看到 `存草稿`、`發布`、`結束會議` 或 `離開會議模式` 時，需能理解每個按鈕差別、目前不能按的原因，以及下一步如何解除阻塞。

### 開發範圍

- [ ] 拆分 `存草稿` 與 `發布` 的啟用條件。
- [ ] meeting draft 存在且有 workspace / board 時，`存草稿` 不因內容空白被靜默鎖住。
- [ ] `發布` 需檢查內容、任務補記或 DEV-007 pending meeting activity。
- [ ] 會議狀態列顯示目前 draft 狀態、阻塞原因與下一步。
- [ ] 不可操作按鈕需有 hover / focus 原因提示。
- [ ] `結束會議` 改為 `離開會議模式` 或加上等價說明。
- [ ] 有未儲存內容時離開 meeting mode 需確認保存選項。
- [ ] `BoardView` 與 `RecordSidebar` 共用同一套 action state helper。

### 不在本交付點範圍

- 手機版會議紀錄工作流。
- 新增 migration 或調整 `KnowledgeRecord` / `record_task_links`。
- AI 摘要、會議管理、跨 board 會議。
- 重做整個紀錄側欄視覺設計。

### 驗收標準

- [ ] 空白 meeting draft 下，使用者知道為何不能發布。
- [ ] 空白 meeting draft 下，`存草稿` 不因內容空白被鎖住。
- [ ] 有內容、任務補記或 pending task activity 後，`發布` 變可用。
- [ ] 不可操作按鈕 hover / keyboard focus 皆可看到原因。
- [ ] `離開會議模式` 不會讓使用者誤以為已保存或已發布。
- [ ] 有未儲存變更時離開會議模式會提示保存選項。
- [ ] `BoardView` 與 `RecordSidebar` 操作規則一致。
- [ ] 桌機與筆電 viewport 無遮擋、裁切、重疊或水平 overflow。

### RD handoff

- [ ] 先閱讀 `SPEC-010`、`BoardView`、`RecordSidebar` 與 `useRecordStore.saveDraft`。
- [ ] 新增純函式 action state helper，集中判斷 `canSaveDraft`、`canPublish`、阻塞原因與 status message。
- [ ] 修改 `saveDraft` 使 meeting draft 的草稿保存與發布驗證分離。
- [ ] 修改會議狀態列與側欄底部按鈕，導入一致的原因提示。
- [ ] 新增 `verify:dev-010-action-feedback` verifier。
- [ ] 完成後執行 lint、DEV-007、DEV-008、DEV-009、DEV-010 verifier 與 build。

### QA / QC 重點

- [ ] 以使用者視角驗證 disabled / aria-disabled 按鈕是否可理解。
- [ ] 驗證空白 draft、輸入內容、只有 task activity 三種狀態。
- [ ] 驗證 hover、keyboard focus、狀態列三種原因揭露。
- [ ] 驗證離開 meeting mode 的未儲存保護。
- [ ] 桌機 1440x950 與筆電 1024x768 viewport smoke；手機版不列入會議記錄工作流驗收。

### 驗證命令

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-009-task-detail-quick-note
npm.cmd run verify:dev-010-action-feedback
npm.cmd run build
```

### 狀態

- [x] 已建立 SPEC-010。
- [x] 已建立 QA-DEV-010 驗證計畫。
- [x] 已建立 DEV-010 dev task 條目。
- [ ] RD 開發。
- [ ] QA 驗證。
- [ ] QC 事實驗證。
