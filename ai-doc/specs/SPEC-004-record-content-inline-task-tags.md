# SPEC-004：紀錄內容內嵌任務標籤

狀態：Implemented
Owner：PM
建立日期：2026-06-04
關聯：`SPEC-003-meeting-work-records-workflow.md`、DEV-002

## 1. 背景

DEV-002 已在 ProJED 加入「會議紀錄」與「個人工作紀錄」，並透過 `record_task_links` 建立紀錄與 task node 的結構化關聯。

瀏覽器檢視後，使用者回饋目前「關聯任務」仍像一般表單區塊：使用者在內容欄外選任務，再於下方看到關聯任務清單。目標工作流應更接近 Codex 的輸入框：使用者在撰寫內容時，把游標放在正在討論任務的位置，從看板點選任務後，直接在內容中插入可辨識的任務 tag。

## 2. 產品目標

讓任務關聯成為撰寫紀錄的一部分，而不是額外填表動作。

當使用者在紀錄內容中選取看板任務時：

- 任務會插入到 `內容` 編輯器目前游標位置。
- 插入內容會以 tag/chip 樣式標示，類似 Codex 中 tag skill 的體驗。
- 系統仍維持結構化 task link，供權限、任務時間軸與 AI graph 分析使用。
- 同一任務可在內容中被引用多次，但結構化 `taskLinks` 僅保留唯一關聯。

## 3. 使用者工作流

1. 使用者開啟會議紀錄或個人工作紀錄。
2. 使用者在 `內容` 編輯器中撰寫文字，並把游標放在想引用任務的位置。
3. 使用者點擊 `從看板選取`。
4. 右側紀錄欄自動收起，ProJED 進入既有看板模式。
5. 使用者直接點選看板上的任務卡或 checklist 任務。
6. 被點選的任務插入到先前游標位置，呈現為內容中的任務 tag。
7. 使用者點擊 `完成`。
8. 右側紀錄欄恢復，內容顯示內嵌任務 tag，下方關聯任務摘要顯示唯一任務與角色設定。

## 4. UX 需求

### 4.1 內容編輯器

- 以小型 rich text editor 取代純 textarea。
- 編輯器需把任務引用視覺化為 inline chip。
- chip 風格需接近 Codex mention/tag：
  - 淺藍背景。
  - 任務或文件 icon。
  - 任務標題。
  - 輕量 border。
  - 可作為單一單位刪除。
- chip 前後文字仍可正常編輯。
- 游標移動到 chip 前後時要自然。
- 貼上內容時需清理為純文字，避免帶入不可控 HTML。

### 4.2 任務 tag 序列化

本階段維持 `KnowledgeRecord.content` 為字串，不新增 rich content 欄位。

使用以下 token 格式儲存：

```text
@[Task title](task:nodeId)
```

範例：

```text
今天決議先處理 @[品質驗證測試任務 1](task:node_abc123)，再進入 release。
```

顯示層將 token render 成 chip。Storage、RAG、Firestore、Supabase、local-test backend 仍儲存一般字串內容。

### 4.3 結構化 task link

- `record_task_links` 仍是結構化 graph link 的來源。
- 內容 tag 與 `taskLinks` 必須同步。
- 同一任務可在內容中出現多次。
- `taskLinks` 每個任務只保留一筆。
- 預設角色：
  - 第一個被連結任務：`main`。
  - 後續新連結任務：`related`。
- 內容編輯器下方仍保留關聯任務摘要，讓使用者調整角色。

### 4.4 重複選取規則

採用「允許多次引用」。

- 再次點擊同一任務時，在目前或記憶的游標位置插入另一個 tag。
- 不移除既有 tag。
- 不建立重複 `taskLinks`。
- 若某任務在內容中的所有 tag 都被刪除，應從由內容推導出的 task link 移除；舊紀錄若有 legacy structured link，需可安全開啟並保留。

### 4.5 看板選取模式

- 不開啟另一個任務選取頁。
- 沿用既有看板模式。
- 進入選取時右側紀錄欄自動收起。
- 看板 header 顯示選取狀態：
  - 「選取紀錄關聯任務」。
  - 已選唯一任務數。
  - `完成`、`取消` 控制。
- Kanban card 與 checklist item 在此模式下可點選。
- 此模式下停用拖曳與標題編輯，避免誤操作。
- 點選任務的主要效果是插入內容 tag，而不是只新增下方關聯列。

## 5. 資料與解析規則

### 5.1 Mention token parser

支援 token：

```regex
/@\[([^\]]+)\]\(task:([^)]+)\)/g
```

不支援：

```text
@[`title`](task:id)
```

解析後建議型別：

```ts
type RecordContentSegment =
  | { type: 'text'; text: string }
  | { type: 'task'; nodeId: string; title: string; raw: string };
```

### 5.2 序列化

- 編輯器將 chip 存回 `@[title](task:nodeId)`。
- 任務日後改名時，MVP 不自動改寫舊紀錄內容。
- Render 時若找得到目前 `TaskNode.title`，優先顯示目前任務標題；否則 fallback token 內的標題。
- 找不到 task id 時，顯示 muted chip 與 token 內標題。

### 5.3 同步規則

內容變更時：

1. 從 content parse task token。
2. 依第一次出現順序建立唯一 task id 清單。
3. 既有 linked task 保留原本角色。
4. 新發現 task id 給預設角色。
5. 不在內容中的 taskLink 可移除；legacy link 需有保護策略，避免舊資料開啟後被誤刪。

從看板插入任務時：

1. 在記憶的 content cursor offset 插入 token。
2. 游標移到新插入 token 後方。
3. 新增或保留唯一 taskLink。
4. 看板選取模式維持到使用者點擊 `完成`。

## 6. 實作建議

- 新增 `RecordContentEditor`：建議放在 `src/components/Records/`。
- 保持元件自包含，不引入大型 editor framework。
- 可用 `contentEditable` 實作 chip 與純文字混排。
- serialized string 仍由 `draft.content` 作為 source of truth。
- 游標保存為 serialized-content offset，不保存 DOM node reference。
- 新增工具函式：建議 `src/utils/recordContentMentions.ts`。
  - `parseRecordContentMentions`
  - `serializeTaskMention`
  - `extractTaskLinksFromRecordContent`
  - `insertTaskMention`
- 擴充 `useRecordStore`：
  - `contentCursorOffset`
  - `setContentCursorOffset(offset)`
  - `insertTaskMentionAtCursor(nodeId, title)`
  - `syncTaskLinksFromContent(content)`

## 7. 驗收標準

- 使用者可把游標放在內容欄任意位置，並將看板任務插入該位置。
- 插入任務顯示為 visual chip，不只是純文字。
- 儲存後的 record content 仍是字串，且包含可解析 task token。
- 同一任務可在內容中插入多次。
- 關聯任務摘要中同一任務只出現一次。
- 角色 dropdown 仍可透過 `record_task_links` 持久化。
- 沒有 task token 的舊紀錄可安全開啟。
- 任務選取仍在熟悉的 Kanban view 中完成。
- AI/RAG 可從紀錄內容取得任務標題語境，也可透過 task id 建立 graph link。

## 8. 驗證計畫

靜態驗證：

- `npm.cmd run verify:dev-002-records`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run lint`

瀏覽器驗證：

- 在內容開頭、中間、結尾插入任務 tag。
- 同一任務插入兩次，確認摘要只保留一筆。
- 刪除其中一個重複 chip，確認摘要仍保留任務。
- 刪除某任務所有 chip，確認摘要同步更新。
- 儲存草稿、重新開啟，確認 token 能 render 回 chip。
- 確認看板選取沒有開啟另一個任務選取頁。

## 9. 不在範圍

- 不新增 DB schema。
- 不做 collaborative rich text editing。
- 不自動批次遷移舊紀錄中的任務標題。
- 不加入 member/person mention chips。
- 不做 slash command 或完整 command palette。
