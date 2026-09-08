# SPEC-007：會議中保留原生看板編輯與任務變更紀錄

狀態：Implemented baseline / DEV-109 correction implemented candidate / QA-QC pending
Owner：PM
建立日期：2026-06-06
關聯：DEV-007、DEV-005、DEV-006、DEV-011、DEV-012、DEV-109

---

## DEV-109 Target Contract Amendment（2026-09-08）

- Spec Impact：`Intentional targeted replacement / Implemented Candidate / QA-QC Pending / NOT RELEASED`。
- `SPEC-109-meeting-live-task-change-capture.md` 是 live task change 的現行目標權威；本文件仍管理「會議模式保持原生看板操作」。
- 被取代：只把 activity 留在 memory buffer、到 `saveDraft` 才逐筆 append，以及純位置／拖曳可成為會議內容。
- 新契約：會議開啟後只接受 allowlist 中、已確認 task persistence 成功的語意變更，立即以同欄 net aggregate 投影到目前
  meeting draft；離開後停止，重入建立新 segment。
- DEV-109 aggregate 只存在目前分頁 runtime；唯一持久化 live evidence 是已投影的 `draft.content`，不另寫 `meetingActivities`。
- `AI整理` 只重整目前 raw content 與既有 legacy activities，不另送 DEV-109 aggregate、不讀 provider history；歷史匯入仍是 DEV-020／094 的獨立明確操作。
- DEV-109 已完成本機候選實作；在完整 QA/QC 與 release gate 通過前，不得宣告正式環境已具備即時投影、內容欄位捕捉或 save-level exactly-once。

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

## 7. 現行契約修訂（2026-08-03）

Spec Impact：`Intentional replacement`。

- 本規格保留「會議模式維持原生看板操作」與「捕捉有語意的任務變更」契約。
- DEV-011 已取代「`saveDraft` 前逐筆 append activity」：正式正文改由 AI / deterministic fallback 統整，不得回復原始 activity 流水帳。
- DEV-012 進一步排除不具會議決策價值的純位置事件。`task_moved`，以及只有「位置已調整」「順序已調整」「已移動」「已重新排列」「區塊已更新」等制式摘要的事件，不進入 meeting activity buffer、AI source package 或專案變化匯入證據。
- 只因低價值位置事件被提及的任務，不得因此產生會議紀錄段落或 `linkedTaskIds`。
- 狀態、日期、負責人、協作者、標籤、建立、封存與還原等有語意變更仍可作為統整來源。
- 過濾只針對純制式操作摘要；若人工速記包含實際原因、決議、風險或下一步，不得因文字提及移動或排序而整段刪除。
