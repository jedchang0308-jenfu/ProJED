# SPEC-066：任務備註語意富文字與 AI 可讀內容

- 關聯 DEV：DEV-066
- 成熟度：Implemented / QC PASS / 未 Release
- 風險：Medium
- 使用者決策：`1A／2A／3A`

## 目標

任務詳情的每一則備註在桌機／筆電可沿用 Gmail、Word、Excel 的基本肌肉記憶編輯語意格式；格式工具平時不占版位，只由按鈕叫出。手機完全不載入富文字編輯器，只安全閱讀格式化內容並追加純文字。AI 取得可搜尋、去重、無 raw HTML 的語意投影。

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
- 舊資料沒有 `richContent` 時直接讀取 `content`，首度編輯或手機追加才 lazy upgrade。
- 現有 `detail_notes` 是 JSONB，新增 optional nested field 不需要 schema migration；service 仍傳輸完整陣列。
- canonical payload 只接受已知 Lexical root/paragraph/heading/list/listitem/link/text/linebreak 結構。未知節點於安全投影與 renderer 中保留可讀文字 children，不執行其 payload。

## 桌機／筆電互動

- `min-width: 768px` 才掛載 Lexical editor。
- 每一則備註各有一個具 accessible name 的「文字格式」切換按鈕；預設關閉。
- toolbar anchored 於該則備註 header，顯示在格式切換按鈕左側並與 header actions 同列；使用 absolute overlay，不改變 note card 或 modal 高度。
- 工具列開啟後保持顯示；編輯內容、點擊工具列外部或按 `Escape` 均不收起，只有再次按同一則備註的格式切換按鈕才關閉。
- 工具按鈕 `pointerdown` 保留 editor selection；pressed、focus-visible、disabled 狀態可辨識。
- V1 allowlist：本文、小標題、粗體、斜體、底線、刪除線、項目清單、編號清單、連結、清除格式；另提供 undo／redo。
- editor focus 內支援 `Ctrl/Cmd+B/I/U/K/Z/Y`；`Ctrl/Cmd+S` 阻止瀏覽器另存並觸發現有任務儲存。
- 貼上只由已註冊的 allowlist nodes 匯入；不註冊 table/image/embed/code nodes。連結只接受 `http:`、`https:`、`mailto:`、`tel:`。

## 手機互動

- 390px 等手機 viewport 不 render 格式按鈕、LexicalComposer、toolbar 或任何 `contenteditable`。
- renderer 直接由受控 serialized nodes 產生 React element，不使用 `dangerouslySetInnerHTML`。
- 每一則備註有獨立純文字追加欄與明確追加按鈕；空白內容不得提交。
- 成功追加會在 root 尾端增加一個或多個純文字 paragraph，原節點、格式 bits、連結與順序保持不變。
- 只有外層保存成功後才清空 append draft；同步或保存失敗時保留 draft 並顯示可重試錯誤。
- readonly／disabled 狀態仍可閱讀，但不顯示可提交控制。

## AI 投影契約

- `taskNoteToAiMarkdown` 由 canonical state 生成受控 Markdown：heading、段落、bulleted/numbered list、粗體、斜體、刪除線與安全連結；底線退化為同一文字語意，不輸出任意 HTML。
- WBS RAG content 以 `## 備註：{noteTitle}` 分段並帶備註 ID；document metadata 至少保留 task id 與 note id/title 清單。
- 任務具有非空 `detailNotes` 時，RAG 不再另輸出 `description`；只有沒有 detail notes 時才使用 legacy description fallback。
- 空白、無效或未知 rich payload 必須 fallback 到 `content`，不得造成 AI 文件空白或 indexing 例外。

## 相容與失敗恢復

- 現有純文字備註不需 migration 即可桌機編輯、手機閱讀／追加、AI 搜尋。
- editor JSON parse 失敗時顯示 `content`，下一次有效編輯才建立新 canonical state；不得靜默顯示空白。
- modal 自動儲存與明確儲存沿用現有 `updateNode`；比較邏輯須包含 `richContent`，避免只變格式時未被保存。
- 所有 note 更新必須同步更新 `content` plain projection；第一則另同步 `description`。

## Repo / File Impact

- `src/types/index.ts`
- `src/utils/taskNoteRichContent.ts`
- `src/components/TaskNotes/TaskDetailNoteField.tsx`
- `src/components/TaskDetailsModal.tsx`
- `src/services/rag/wbsRagAdapter.ts`
- `package.json`、`package-lock.json`
- `scripts/verify-dev-066-task-note-rich-text.mjs`
- `scripts/verify-dev-066-task-note-rich-text-browser.mjs`
- 受影響的既有任務備註 browser verifier

## Out of Scope / Stop Conditions

- 手機富文字編輯或全文覆寫。
- 字型、任意字級、顏色、對齊、表格、圖片、附件、embed、code block。
- 會議紀錄 `RecordContentEditor` 行為變更或抽換其 serializer。
- 多人即時協作、衝突解決 UI、revision history。
- Supabase migration、production 操作、部署與 release。
- 若必須突破以上任一邊界才能完成，停止實作並回到 Human Decision。

## Acceptance Gate

- `QA-DEV-066` 全數通過。
- TypeScript、targeted verifier 與受影響回歸通過。
- 真實 rendered 1440／1024／390 viewport 證明：header-inline toolbar 無 layout shift、開啟後可持續編輯且只由原切換鈕關閉、每則 note 獨立、手機零 editor、append 不破壞格式、無水平 overflow、無可見錯誤。
