# SPEC-009 會議模式任務詳情內快速補記

狀態：Implemented
對應 DEV：DEV-009
建立日期：2026-06-07
承接：DEV-005 / DEV-007 / DEV-008

## 背景

會議中主畫面已回到看板，任務詳情也保留一般編輯能力；但記錄某個任務的討論內容時，使用者仍需要回到右側會議紀錄欄或紀錄頁編輯。這會打斷「看任務、改任務、補討論」的會議節奏。

## 目標

- 會議模式下，任務詳情可直接補充目前任務的會議討論。
- 補記內容寫入目前 meeting draft，不寫入 `TaskNode.detailNotes`。
- 系統自動附上目前任務 inline tag，確保 DEV-008 任務知識可查到。
- 保留任務詳情既有狀態、日期、指派、標籤與備註功能。
- 不新增 migration，不改 `KnowledgeRecord` / `record_task_links`。

## MVP

- `TaskDetailsModal` 在 meeting mode 顯示「本次會議」快速補記區。
- 使用者可輸入一段任務討論，按「加入紀錄」或 `Ctrl+Enter`。
- 內容 append 到目前 meeting draft 的 `## 任務討論` 區塊。
- append 文字格式包含時間、目前任務 tag 與使用者輸入內容。
- append 後清空輸入框，meeting draft 的 `taskLinks` 自動包含目前任務。
- 發布後可透過 DEV-008 的任務知識看到該片段。

## 非範圍

- 不在任務詳情內編輯整篇會議紀錄。
- 不把會議討論寫入任務備註欄。
- 不做 AI 摘要、決議抽取或任務自動更新。
- 不新增會議事件資料表。
- 不做多人即時協作。
- 不要求手機版開放會議記錄工作流；本 DEV 驗收以桌機與筆電為準。

## 使用者流程

1. 使用者按「會議紀錄」進入 meeting mode。
2. 看板維持一般編輯。
3. 使用者打開某任務詳情。
4. 在「本次會議」輸入討論內容。
5. 按「加入紀錄」或 `Ctrl+Enter`。
6. 系統把內容加入目前 meeting draft，並自動帶入 `@[task](task:id)`。
7. 會議發布後，任務知識可查到該討論片段。

## 驗收標準

- 非 meeting mode 不顯示「本次會議」快速補記區。
- meeting mode 打開任務詳情時顯示快速補記區。
- 補記內容 append 到目前 meeting draft，而不是任務備註。
- append 後內容包含 `## 任務討論`、時間、目前任務 inline tag 與輸入文字。
- append 後 `record_task_links` 包含目前任務。
- 空白內容不能加入紀錄。
- 既有 DEV-007 任務變更收集與 DEV-008 任務知識查找不退化。
