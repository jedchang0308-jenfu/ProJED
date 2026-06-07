# SPEC-006：Gmail-like 會議紀錄輸入器

狀態：Implemented
Owner：PM
建立日期：2026-06-06
關聯：DEV-006、DEV-003、DEV-005

---

## 1. 背景

DEV-003 已建立紀錄內容內嵌任務標籤，DEV-005 已將會議紀錄調整為看板主畫面、速記欄輔助。但目前 `RecordContentEditor` 仍是自製 `contentEditable`，以 DOM serialize / replaceChildren 同步內容，實際輸入時已出現破壞肌肉記憶的問題：

- `Ctrl+A` 後直接打字沒有替換全文，而是接到原內容後面。
- `Ctrl+Z` 沒有回復剛輸入的文字。
- 多行貼上會產生混合 text/div DOM，序列化後容易遺失換行語意。

本規格目標是讓會議紀錄內容輸入接近 Gmail 撰寫區的基本肌肉記憶，並讓已關聯的 task chip 可被複製、剪下、貼上與移動。

## 2. 目標

- 建立穩定的 Gmail-like 基本輸入體驗：輸入、換行、選取、貼上、undo/redo、IME、游標。
- 保留 DEV-003 的 inline task chip 與 token 格式。
- 已關聯任務 chip 必須可像一般內容一樣被選取、複製、剪下、貼上與移動。
- 不改後端資料格式，不新增 migration。

## 3. MVP 範圍

- 以成熟 editor engine 取代手寫 DOM 同步流程。
- `RecordContentEditor` 對外 props 盡量維持不變，降低對 `RecordSidebar` 與 `useRecordStore` 的影響。
- 內容儲存仍為純字串，task chip 仍序列化為 `@[title](task:id)`。
- `record_task_links` 仍是唯一結構化任務關聯。
- task chip 支援：
  - 滑鼠或鍵盤選取。
  - `Ctrl+C` 複製。
  - `Ctrl+X` 剪下。
  - `Ctrl+V` 貼上。
  - 與文字一起複製/剪下/貼上。
  - 以剪下貼上方式移動位置。
  - Backspace/Delete 一次刪除整顆 chip。
- 輸入器支援：
  - `Enter` / `Shift+Enter` 可保存換行，輸出統一為 `\n`。
  - `Ctrl+A` 在 editor focus 時選取 editor 內容，打字後替換內容。
  - `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` 使用 editor history，不被全域 undo 攔截。
  - 中文 IME composition 不吃字、不重字、不提前觸發快捷鍵。
  - 貼上 HTML 時只保留安全文字、換行與 task chip。

## 4. 非範圍

- Gmail 富文字工具列。
- bold / italic / link / ordered list / unordered list 的儲存。
- 新後端 schema 或 editor JSON 儲存格式。
- 多人即時協作游標。
- 自訂 drag handle。若 editor 原生 selection drag 穩定可保留，但 release gate 以剪下貼上移動為準。

## 5. 工程方向

- 導入 Lexical 作為 editor engine，接管 selection、history、clipboard、IME 與 node model。
- 新增 `TaskMentionNode` 作為 inline token node。
- 新增 content adapter：
  - string content -> Lexical editor state。
  - Lexical editor state -> string content。
  - HTML/plain text paste -> Lexical editor state。
  - Lexical copy/cut -> plain text token + HTML metadata。
- 保留 `recordContentMentions` 的 token parser/serializer 作為資料契約中心。

## 6. 驗收標準

- 使用者可以連續打字、換行、選取、貼上、undo/redo，行為符合 Gmail 基本撰寫區直覺。
- 使用者可用中文 IME 輸入會議內容，不漏字、不重字。
- 使用者可將已關聯 task chip 複製到同一紀錄其他位置，貼上後仍是 chip。
- 使用者可剪下 task chip，原位置移除且任務關聯同步；貼到新位置後關聯恢復。
- 使用者可複製/剪下/貼上「文字 + chip + 文字」混合內容，順序與換行不變。
- 發布後重新開啟紀錄，文字、換行、task chip 與 `record_task_links` 一致。
- DEV-002、DEV-003、DEV-005 既有流程不退化。
