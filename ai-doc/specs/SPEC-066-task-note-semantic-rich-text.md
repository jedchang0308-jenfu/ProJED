# SPEC-066：任務備註語意富文字與 AI 可讀內容

- 關聯 DEV：DEV-066
- 成熟度：Rework 4 Implemented / Local Simulated QC PASS / Physical Device Pending；Rework 1～3 Historical QC PASS / 未 Release
- 風險：Medium
- 使用者決策：`2A／3A／4A`；舊 `1A` 已由 2026-08-20 `4A` 取代
- Spec Impact：`Intentional replacement`（只取代手機 zero-editor／append-only 行為）

## 目標

任務詳情的每一則備註在所有 viewport 共用同一個 Lexical 語意富文字編輯器、格式 allowlist、儲存流程與資料來源；手機不再切換成唯讀 renderer＋純文字追加欄，也不新增手機專用 editor 模組。裝置差異只限 responsive layout、觸控尺寸、selection 與軟鍵盤適配。AI 繼續取得可搜尋、去重、無 raw HTML 的語意投影。

## 資料契約

```ts
interface TaskDetailNoteRichContent {
  schema: 'task-note.lexical-v1';
  editorState: SerializedEditorState;
}

interface TaskDetailNote {
  id: string;
  title: string;
  content: string; // 由 richContent 衍生的 plain-text compatibility alias
  richContent?: TaskDetailNoteRichContent;
}
```

- `richContent` 一旦存在即為唯一可編輯正文；`content` 不得反向覆寫它。
- `description` 保留既有「第一則備註 plain text」相容別名，不是第二份 canonical 正文。
- 舊資料沒有 `richContent` 時直接讀取 `content`，任一 viewport 首度實際編輯時才 lazy upgrade。
- 現有 `detail_notes` 是 JSONB，新增 optional nested field 不需要 schema migration；service 仍傳輸完整陣列。
- canonical payload 只接受已知 Lexical root/paragraph/heading/list/listitem/link/text/linebreak 結構。未知節點於安全投影與 renderer 中保留可讀文字 children，不執行其 payload。

## 共用編輯器互動

- 所有可編輯 viewport 都掛載同一個 Lexical editor；不得以 `min-width: 768px` 或裝置判斷切換成另一套寫入流程。
- 每一則備註各有一個具 accessible name 的「文字格式」切換按鈕；預設關閉。
- desktop／laptop toolbar anchored 於該則備註 header，顯示在格式切換按鈕左側並與 header actions 同列；使用 absolute overlay，不改變 note card 或 modal 高度。手機使用同一組 toolbar commands，只允許 responsive placement／overflow 差異。
- 工具列開啟後保持顯示；編輯內容、點擊工具列外部或按 `Escape` 均不收起，只有再次按同一則備註的格式切換按鈕才關閉。
- 工具按鈕 `pointerdown` 保留 editor selection；pressed、focus-visible、disabled 狀態可辨識。
- V1 allowlist：本文、小標題、粗體、斜體、底線、刪除線、項目清單、編號清單、連結、清除格式；另提供 undo／redo。
- editor focus 內支援 `Ctrl/Cmd+B/I/U/K/Z/Y`；`Ctrl/Cmd+S` 阻止瀏覽器另存並觸發現有任務儲存。
- 貼上只由已註冊的 allowlist nodes 匯入；不註冊 table/image/embed/code nodes。連結只接受 `http:`、`https:`、`mailto:`、`tel:`。

## 手機 responsive 契約

- 390px 等手機 viewport 直接顯示同一 Lexical `contenteditable`、格式切換與 V1 allowlist；不得 render 舊「追加文字」label、textarea、按鈕或 append-only error surface。
- 手機可直接修改既有格式化本文；每次 editor change 都由 canonical rich state 單向產生 `content` plain projection，不得以 plain text 全文覆寫 rich state。
- 觸控選字後操作格式按鈕必須保留原 selection；中文 IME、剪貼簿、undo／redo、連結、清單、明確儲存與關閉前寫入不得因裝置退步。
- 軟鍵盤開啟時目前 editor、toolbar 與儲存／關閉路徑保持可達；不得造成 modal 雙捲動、內容遮蔽、水平 overflow 或 viewport 外浮層。
- readonly／disabled 權限狀態仍可安全閱讀，但不顯示格式或寫入控制；這是共用權限行為，不是手機專用模式。

## AI 投影契約

- `taskNoteToAiMarkdown` 由 canonical state 生成受控 Markdown：heading、段落、bulleted/numbered list、粗體、斜體、刪除線與安全連結；底線退化為同一文字語意，不輸出任意 HTML。
- WBS RAG content 以 `## 備註：{noteTitle}` 分段並帶備註 ID；document metadata 至少保留 task id 與 note id/title 清單。
- 任務具有非空 `detailNotes` 時，RAG 不再另輸出 `description`；只有沒有 detail notes 時才使用 legacy description fallback。
- 空白、無效或未知 rich payload 必須 fallback 到 `content`，不得造成 AI 文件空白或 indexing 例外。

## 相容與失敗恢復

- 現有純文字備註不需 migration，即可在所有 viewport 編輯並被 AI 搜尋。
- editor JSON parse 失敗時顯示 `content`，下一次有效編輯才建立新 canonical state；不得靜默顯示空白。
- modal 自動儲存與明確儲存沿用現有 `updateNode`；比較邏輯須包含 `richContent`，避免只變格式時未被保存。
- 所有 note 更新必須同步更新 `content` plain projection；第一則另同步 `description`。

## Repo / File Impact

- `src/types/index.ts`
- `src/utils/taskNoteRichContent.ts`
- `src/components/TaskNotes/TaskDetailNoteField.tsx`
- `src/components/TaskNotes/TaskDetailNoteEditor.tsx`（由原 desktop editor 泛化／重新命名；不得新增手機 editor）
- `src/components/TaskDetailsModal.tsx`
- `src/services/rag/wbsRagAdapter.ts`
- `package.json`、`package-lock.json`
- `scripts/verify-dev-066-task-note-rich-text.mjs`
- `scripts/verify-dev-066-task-note-rich-text-browser.pw.js`
- 受影響的既有任務備註 browser verifier

## Out of Scope / Stop Conditions

- 新增手機專用 editor engine、第二套儲存流程或裝置別格式 allowlist。
- 字型、任意字級、顏色、對齊、表格、圖片、附件、embed、code block。
- 會議紀錄 `RecordContentEditor` 行為變更或抽換其 serializer。
- 多人即時協作、衝突解決 UI、revision history。
- Supabase migration、production 操作、部署與 release。
- 若必須新增第二套 editor、改資料／API／權限／格式 allowlist／會議紀錄 editor，或以 plain text 覆寫 canonical rich state才能完成，停止實作並回到 PM／Human Decision。

## Acceptance Gate

- 更新後的 `QA-DEV-066` 全數通過；2026-08-12 mobile zero-editor／append PASS 只屬歷史證據，不得替代 Rework 4 驗證。
- TypeScript、targeted verifier 與受影響回歸通過。
- 真實 rendered 1440／1024／390 viewport 證明：所有可編輯 viewport 共用同一 editor 與格式能力、desktop header-inline toolbar 無 layout shift、手機無 append UI、觸控 selection／軟鍵盤可操作、每則 note 獨立、無水平 overflow與無可見錯誤。
- Mobile touch acceptance 需包含 iOS Safari 與 Android Chrome 實機證據；只有 simulated viewport 時標記 `未充分驗證`。
