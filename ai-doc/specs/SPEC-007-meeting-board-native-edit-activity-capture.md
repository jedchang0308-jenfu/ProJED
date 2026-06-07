# SPEC-007：會議中保留原生看板編輯與任務變更紀錄

狀態：Implemented
Owner：PM
建立日期：2026-06-06
關聯：DEV-007、DEV-005、DEV-006

---

## 1. 背景

DEV-005 將會議主畫面調整為看板，DEV-006 修正會議紀錄輸入器。但會議過程中使用者仍需要正常編輯任務，例如改狀態、拖曳卡片、編輯標題、勾選 checklist。若會議模式改變看板點擊行為，會破壞平常操作的肌肉記憶。

本規格目標是讓會議中的看板「看起來與用起來都和一般看板一樣」，同時把會議期間任務狀態與關鍵任務變更自動納入會議紀錄。

## 2. 目標

- 會議模式不得劫持 Kanban card / checklist item 的主要點擊行為。
- 會議中仍可完整使用看板編輯能力：點擊、改標題、拖曳、改狀態、勾選 checklist、右鍵選單。
- 會議期間任務狀態變更與移動自動收集為 meeting activity。
- 儲存或發布會議紀錄時，將 meeting activity 以文字摘要附加到紀錄內容。
- 不新增 migration，不改 `KnowledgeRecord`、`record_task_links`、RAG token 格式。

## 3. MVP 範圍

- 移除「會議模式下點卡片直接插入 task tag」的預設行為。
- 保留既有「任務選取模式」作為明確插入任務 tag 的動作。
- 新增 meeting activity buffer，只存在前端 record store draft 期間。
- `useWbsStore.updateNode` 發生任務狀態、移動、日期、指派、標籤、封存等變更時，若正在會議模式，將摘要送入 record store。
- `saveDraft` 前將尚未寫入內容的 meeting activity append 到 `draft.content`。
- activity 摘要使用既有 `@[title](task:id)` token，確保 `record_task_links` 可同步。

## 4. 非範圍

- 不新增正式 audit/event table。
- 不建立多人即時協作 meeting event stream。
- 不做 AI 決議抽取。
- 不做完整活動篩選器或複雜活動分類 UI。
- 不改既有 activity log service。

## 5. 內容格式

發布或儲存時自動附加：

```md
## 會議中任務變更

- 14:32 @[品質驗證測試任務 1](task:qc-card-1)：狀態 todo -> in_progress
- 14:35 @[品質驗證測試任務 1.1](task:qc-card-1-1)：移動到另一個位置
```

同一筆 activity 只附加一次；後續再修改任務會新增新 activity。

## 6. 驗收標準

- 開始會議後，看板卡片點擊不再插入紀錄，而是維持原本編輯行為。
- 會議中拖曳、改狀態、改標題、checklist 編輯仍可操作。
- 任務狀態變更會出現在會議紀錄的「會議中任務變更」段落。
- activity 文字含 task inline token，儲存後 `record_task_links` 會包含該任務。
- 多次儲存不重複附加已寫入的 activity。
- DEV-002、DEV-003、DEV-006 回歸通過。
