# SPEC-010 會議紀錄操作按鈕狀態溝通設計

狀態：Ready  
對應 DEV：DEV-010  
建立日期：2026-06-07  
承接：DEV-005 / DEV-006 / DEV-007 / DEV-009

## 背景

會議模式已將主畫面調整為看板，並在狀態列提供 `存草稿`、`發布`、`結束會議` 三個操作。但目前按鈕被鎖住時只呈現灰色 disabled，使用者不知道差別與原因，會產生幾個問題：

- 使用者不知道 `存草稿`、`發布`、`結束會議` 的語意差異。
- `存草稿` 與 `發布` 使用同一組啟用條件，導致空白會議 draft 時兩者都被鎖住。
- 使用者只剩 `結束會議` 可按，容易誤以為離開會議模式會自動保存。
- 系統知道缺少內容、workspace、board 或正在儲存，但沒有把狀態翻譯成可行動的提示。

## 目標

- 讓會議狀態列清楚說明目前紀錄狀態、不能操作的原因與下一步。
- 將 `存草稿`、`發布`、`離開會議模式` 的語意拆開，不再讓使用者猜規則。
- `存草稿` 應低阻力；`發布` 才要求足夠內容。
- 按鈕不可操作時，需可被滑鼠、鍵盤與螢幕閱讀器理解。
- 不改資料模型，不新增 migration，不改 `KnowledgeRecord`、`record_task_links` 或 inline task token 格式。

## 非範圍

- 不開放手機版會議紀錄工作流；驗收以桌機與筆電 viewport 為準。
- 不做完整會議管理、會議排程或多記錄者即時協作。
- 不導入 AI 決議抽取或自動摘要。
- 不調整 RAG document schema。
- 不重做整個 `RecordSidebar` 視覺設計。

## MVP 行為

### 1. 操作語意

`存草稿`

- 目的：保存目前會議 draft，即使內容尚未完成。
- meeting mode 中只要有 active workspace、active board 與 meeting draft，即可按。
- 空白內容可存成 draft；不得因內容空白而靜默鎖住。
- 若因缺少 workspace / board 無法存，需顯示明確原因。

`發布`

- 目的：把會議紀錄正式送入紀錄庫與任務知識查找。
- 需具備可發布內容，至少符合其中一項：
  - 內容編輯器有非空文字。
  - 會議中任務補記已 append 到 draft。
  - DEV-007 meeting activity buffer 有尚未附加的任務變更。
- 不符合時不可發布，且要明確顯示原因。

`離開會議模式`

- 取代或補充現有 `結束會議` 文案，避免使用者誤以為會保存或發布。
- 永遠可按。
- 若有未儲存變更，需先提示：
  - `存草稿後離開`
  - `直接離開`
  - `取消`
- 直接離開不應刪除目前記憶體中的 draft，但要清楚標示「尚未保存到紀錄庫」。

### 2. 狀態列提示

會議狀態列需顯示一段短訊息，優先順序如下：

1. saving：`正在儲存會議草稿...`
2. save blocked：`無法儲存：尚未選擇工作區或看板`
3. publish blocked：`尚未有會議內容，輸入內容或記錄任務變更後即可發布`
4. dirty draft：`草稿尚未儲存`
5. saved draft：`草稿已儲存`
6. published：`會議紀錄已發布`

提示文案需放在狀態列中，不只依賴 tooltip。

### 3. 不可操作按鈕的原因揭露

按鈕不可操作時至少要有兩種揭露方式：

- 常駐狀態列文字說明目前主要阻塞原因。
- 對應按鈕 hover / focus 時顯示 tooltip 或 popover。

若採用 HTML `disabled` button，需用外層 wrapper 承接 tooltip。若採用 `aria-disabled`，需阻止 action 並維持鍵盤可聚焦。

### 4. 一致性

`BoardView` 會議狀態列與 `RecordSidebar` 底部操作區需共用同一套 action state helper，不可各自寫不同判斷。

建議新增純函式：

```ts
getMeetingRecordActionState({
  draft,
  activeWorkspaceId,
  activeBoardId,
  saving,
  meetingActivities,
  appendedMeetingActivityIds,
  hasUnsavedChanges,
})
```

輸出至少包含：

```ts
{
  canSaveDraft: boolean;
  canPublish: boolean;
  canExit: boolean;
  saveReason?: string;
  publishReason?: string;
  exitWarning?: string;
  statusMessage: string;
}
```

## RD Handoff

- 修改 `BoardView` 會議狀態列：
  - 將 `canSaveMeetingRecord` 拆成 `canSaveDraft` 與 `canPublish`。
  - 顯示 status message。
  - `發布` disabled 時可看見原因。
  - `結束會議` 改為 `離開會議模式` 或加 tooltip 說明不會發布。
- 修改 `RecordSidebar`：
  - 底部 `存草稿` / `發布` 使用同一套 action state。
  - 不得出現看板上可發布、側欄不可發布的矛盾。
- 修改 `useRecordStore.saveDraft`：
  - 讓 `status === 'draft'` 的 meeting draft 可保存空內容。
  - `status === 'published'` 仍需可發布內容。
  - 若有 DEV-007 pending activity，發布或存草稿前仍需 append。
- 新增或更新 verifier：
  - `scripts/verify-dev-010-meeting-action-feedback.mjs`
  - `package.json` script：`verify:dev-010-action-feedback`
- 不新增 migration。

## 驗收標準

- 空白 meeting draft 下，使用者知道為何不能發布。
- 空白 meeting draft 下，`存草稿` 不應因內容空白被鎖住。
- 有內容或 pending task activity 後，`發布` 狀態立即變為可用。
- 不可操作按鈕 hover / focus 有原因提示。
- `離開會議模式` 不會讓使用者誤以為已發布。
- 有未儲存變更時離開會議模式會提示保存選項。
- `BoardView` 與 `RecordSidebar` 操作規則一致。
- 桌機與筆電 viewport 無遮擋、重疊、文字裁切或水平 overflow。

## 驗證命令

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-009-task-detail-quick-note
npm.cmd run verify:dev-010-action-feedback
npm.cmd run build
```

## 手動驗證

- 進入會議模式，不輸入內容：
  - `存草稿` 可按。
  - `發布` 不可按，且看得到原因。
- hover / keyboard focus 到 `發布`：
  - 顯示「尚未有會議內容，輸入內容或記錄任務變更後即可發布」。
- 輸入一段會議內容：
  - `發布` 變可按，阻塞訊息消失。
- 只修改任務狀態、不輸入文字：
  - pending meeting activity 可讓 `存草稿` / `發布` 形成可理解狀態。
- 有未儲存內容時點 `離開會議模式`：
  - 出現保存確認，不可直接靜默離開。

