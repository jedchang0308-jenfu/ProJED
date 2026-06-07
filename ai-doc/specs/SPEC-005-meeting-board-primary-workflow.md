# SPEC-005：會議看板主畫面紀錄工作流

狀態：Implemented
Owner：PM
建立日期：2026-06-05
關聯：DEV-005、DEV-002、DEV-003

---

## 1. 背景

DEV-002 已建立會議紀錄與個人工作紀錄基礎，DEV-003 進一步讓紀錄內容可以用 inline task tag 連到任務。

目前痛點是：開會時所有人需要共同看所有議題與任務全貌，但現有入口容易把畫面重心放在「會議紀錄」表單或「紀錄庫」頁。這會讓會議進行時的主視角偏離議題本身，記錄者也需要在紀錄與看板之間切換，工作流不夠順。

本規格修正產品方向：會議進行中的主畫面應是議題看板；會議紀錄只是輔助速記、決議留存與任務連結。

## 2. 目標

- 開會時主畫面固定在目前 active board 的 `board` view。
- 右側紀錄欄只做速記、任務連結與發布，不搶走議題主視角。
- 使用者點看板任務或 checklist item 時，可直接把 task tag 插入會議紀錄內容。
- 紀錄庫頁維持為會後查閱與整理，不作為會議中的主要操作畫面。

## 3. MVP 範圍

### 3.1 會議入口

- 上方工具列的「寫紀錄」入口改成會議導向入口，例如「會議紀錄」或「開會」。
- 點擊後：
  - 建立或開啟一筆 meeting draft。
  - 自動切到 `board` view。
  - 開啟右側紀錄欄。
  - 進入會議模式，但不改變資料模型。

### 3.2 會議狀態列

在 `BoardView` 顯示會議狀態列，位置在既有 toolbar 下方。

狀態列至少包含：

- 會議 draft 標題。
- 已連結任務數。
- 速記欄展開 / 收合控制。
- 點議題插入 task tag 的模式提示。
- 儲存草稿。
- 發布紀錄。
- 結束會議。

### 3.3 速記欄精簡

`RecordSidebar` 在 meeting mode 下應優先服務會議進行中速記：

- 內容編輯器優先顯示。
- 標題、紀錄時間、參與人員、visibility 壓縮呈現。
- 關聯任務摘要保留。
- 最近紀錄列表隱藏、下移或降級，避免干擾開會。
- 收合狀態需保留未儲存狀態與已連結任務數提示。

### 3.4 點議題插入 task tag

在會議模式下：

- 點 Kanban card 可插入 `@[title](task:id)` 到目前會議紀錄游標位置。
- 點 checklist item 可插入 `@[title](task:id)` 到目前會議紀錄游標位置。
- 插入後 `record_task_links` 仍由內容 token 同步推導。
- 不新增新的 task picker page，也不要求先進紀錄庫頁。

### 3.5 紀錄庫定位調整

`RecordsView` 維持為「紀錄庫」：

- 可查閱會議與工作紀錄。
- 可開啟既有紀錄。
- 可新增紀錄，但不是開會中的主要入口。
- 文案需避免讓使用者以為開會時應留在紀錄庫頁。

## 4. 非範圍

- 不做完整會議管理系統。
- 不做會議議程主持、逐項時間控管或投票。
- 不做 AI 決議抽取或自動建立任務。
- 不做跨 board 會議。
- 不做多記錄者即時協作。
- 不新增資料庫 migration。
- 不改 `KnowledgeRecord`、`record_task_links`、RAG token 格式。

## 5. 實作邊界

建議新增 UI-only 狀態：

- `isMeetingMode`
- `meetingTaskCaptureEnabled`

建議新增 actions：

- `startMeetingRecord()`
- `exitMeetingMode()`
- `toggleMeetingTaskCapture()`

可調整既有 `enterTaskSelectionMode`，讓它支援 options，例如：

```ts
enterTaskSelectionMode({
  collapsePanel: false,
  returnToPreviousView: false,
});
```

此 options 僅用於會議模式保留看板與速記欄，不改既有紀錄內容與任務關聯資料格式。

## 6. 驗收標準

- 使用者從上方會議入口啟動後，主畫面停留在 `board` view。
- 使用者可在會議模式中看完整議題看板，同時用右側速記欄記錄。
- 使用者點 Kanban card / checklist item 後，task tag 插入到目前紀錄內容游標位置。
- 速記欄收合與展開不會遺失 draft、游標或已連結任務。
- 發布後紀錄會出現在紀錄庫與任務詳情頁相關紀錄時間軸。
- 既有 DEV-002、DEV-003 的紀錄建立、inline tag、RAG-ready content 行為不退化。

## 7. 驗證命令

RD 完成後至少執行：

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-002-records
npm.cmd run verify:dev-003-record-tags
npm.cmd run build
```

## 8. UI QC 重點

- Desktop：看板、會議狀態列、右側速記欄不可互相遮蔽。
- Mobile：若右側欄無法並排，需改成底部或覆蓋式速記欄，且不可阻擋主要議題瀏覽。
- 點議題插入模式要有清楚狀態提示，避免使用者以為點任務是在編輯任務。
- 收合欄需顯示足夠資訊：是否有 draft、是否未儲存、已連結任務數。

## 9. 假設

- 「所有議題」先定義為目前 active board 的 Kanban 議題。
- 本版由單一記錄者操作共享畫面，其他與會者主要閱讀與討論。
- 會議紀錄仍是 `KnowledgeRecordType = meeting`。
- 本版是 DEV-002 / DEV-003 之上的 UX refinement，不取代既有紀錄庫。
