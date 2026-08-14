# QA-DEV-066：任務備註語意富文字與 AI 可讀內容驗證計畫

- 關聯 DEV：DEV-066
- 規格：SPEC-066、ADR-042
- QA 狀態：Executed / PASS
- QC 狀態：PASS（見 QC-DEV-066）

## 風險優先順序（FMEA）

| 失效模式 | 影響 | 風險 | 控制 / 證據 |
|---|---|---:|---|
| 手機載入 Lexical 或顯示格式按鈕 | 違反 1A、效能與誤編輯 | 高 | 390px DOM 斷言零 `contenteditable`／零格式按鈕 |
| 手機追加覆寫 rich state | 格式與內容不可逆遺失 | 高 | append 前後 serialized nodes deep comparison，僅尾端 paragraph 增加 |
| 只有格式改變未保存 | 重開後格式消失 | 高 | rich state comparison + 保存／重開 round-trip |
| RAG 同時輸出 description 與第一備註 | AI 重複加權 | 高 | adapter fixture 驗證唯一出現與 metadata |
| raw HTML／危險 URL 進 renderer 或 AI | XSS／不安全索引 | 高 | URL allowlist、未知 node fallback、source scan 無 `dangerouslySetInnerHTML` |
| header-inline toolbar 推動 modal、編輯時自動收起或 Escape 關閉整個詳情 | UI 回歸／編輯中斷 | 中 | 開關前後 bounding box、持續輸入、outside click、Escape 與 toggle-only close interaction |
| 多備註共用 selection／toolbar | 格式套到錯誤 note | 中 | 建立第二 note，各自切換與內容斷言 |
| legacy plain note 顯示空白 | 舊資料不可用 | 高 | legacy fixture desktop/mobile/AI 三路驗證 |

## Automated Cases

| Case | 驗證 |
|---|---|
| QA-066-001 | plain legacy state 轉 plain/AI projection 不丟字，空白不建立假內容 |
| QA-066-002 | heading、粗／斜／刪除線、清單、安全連結輸出受控 Markdown；危險 URL 退化文字 |
| QA-066-003 | mobile append 保留原 serialized subtree 與 format bits，只新增尾端 paragraph |
| QA-066-004 | WBS RAG 有 detail notes 時不重複 description，metadata 含 task/note id/title；無 notes 時保留 legacy fallback |
| QA-066-005 | TypeScript 與 production/test build 可解析新增 Lexical nodes 與 optional schema |
| QA-066-006 | 既有受影響任務備註 browser verifier 改用跨 textarea/contenteditable selector 後仍通過 |

## Rendered QC Cases

| Case | Viewport | 步驟 / Expected |
|---|---:|---|
| QA-066-007 | 1440x1000 | 每則 note 有格式按鈕，toolbar 預設不存在；開啟後顯示於原按鈕左側且與 header actions 同列，card/modal bounding box 不變 |
| QA-066-008 | 1440x1000 | 工具列開啟後，點進 editor、持續輸入、點外部與 Escape 均保持顯示；再次點原格式按鈕才關閉；格式操作與 Ctrl+S 保存仍有效 |
| QA-066-009 | 1024x768 | toolbar 不被 modal／viewport 裁切、無非預期水平捲動，長標題／長連結仍可操作 |
| QA-066-010 | 390x844 | 不顯示格式按鈕、Lexical、toolbar、contenteditable；格式內容可讀且頁面無水平 overflow |
| QA-066-011 | 390x844 | 純文字追加成功後舊格式不變、新段落可見；空白不得提交，失敗 draft 不清空 |
| QA-066-012 | 1440/390 | 第二則備註具有獨立 desktop toolbar 與 mobile append；刪除／readonly 控制遵循權限 |
| QA-066-013 | all | 掃描 role alert、inline error、visible error text 與 console page errors，無產品可見錯誤 |

## Regression Boundary

- 任務詳情標題、日期、狀態、指派、標籤、儲存、X 關閉前寫入與任務知識抽屜不得退步。
- `RecordContentEditor` 不在本 DEV 修改範圍；DEV-006 行為維持。
- 不執行 production migration、部署或 release smoke。

## Execution Result

- QA-066-001～006：PASS；targeted contract suite、TypeScript、RAG smoke、test build 與受影響 static/browser regressions 通過。
- QA-066-007～013：PASS；1440／1024／390 真實畫面、toolbar semantics、geometry、mobile zero-editor、append preservation、overflow 與 visible-error sweep 通過。
- 詳細數據、screenshots 與非阻塞既有 findings：ai-doc/qc/QC-DEV-066-task-note-semantic-rich-text.md。

## Evidence Required

- targeted verifier 輸出與 TypeScript/build 結果。
- 1440、1024、390 screenshots。
- browser verifier 的 bounding boxes、editor/format-toggle counts、rich state before/after mobile append、overflow 與 visible-error scan。
- `ai-doc/qc/QC-DEV-066-task-note-semantic-rich-text.md` 記錄實測結果與殘餘限制。
