# QA-DEV-066：任務備註語意富文字與 AI 可讀內容驗證計畫

- 關聯 DEV：DEV-066
- 規格：SPEC-066、ADR-042
- QA 狀態：Rework 4 Executed / Local Simulated PASS / Physical Device Pending
- 歷史證據：Rework 1～3 Executed / PASS；見 QC-DEV-066

## 風險優先順序（FMEA）

| 失效模式 | 影響 | 風險 | 控制 / 證據 |
|---|---|---:|---|
| 手機仍進入唯讀＋append-only 分支 | 新需求未落實、操作模型不一致 | 高 | 390px DOM 斷言有共用 editor／format toggle，且 append selectors 為 0 |
| RD 另建手機 editor 或第二套儲存流程 | 行為漂移、雙倍維護與資料風險 | 高 | source boundary 斷言所有 viewport 共用同一 editor component／canonical update path |
| 手機編輯以 plain text 覆寫 rich state | 格式與內容不可逆遺失 | 高 | 手機編輯前後 serialized subtree／format bits／safe links round-trip comparison |
| 觸控格式按鈕使 selection 遺失 | 格式套錯位置或無作用 | 高 | iOS／Android 實機選字後套用粗體、清單、連結並保存重開 |
| 軟鍵盤遮住 editor／toolbar／儲存路徑 | 無法完成或保存編輯 | 高 | visual viewport、scroll owner、focused editor 與 action 可達證據 |
| 只有格式改變未保存 | 重開後格式消失 | 高 | rich state comparison + 保存／重開 round-trip |
| RAG 同時輸出 description 與第一備註 | AI 重複加權 | 高 | adapter fixture 驗證唯一出現與 metadata |
| raw HTML／危險 URL 進 renderer 或 AI | XSS／不安全索引 | 高 | URL allowlist、未知 node fallback、source scan 無 `dangerouslySetInnerHTML` |
| header-inline toolbar 推動 modal、編輯時自動收起或 Escape 關閉整個詳情 | UI 回歸／編輯中斷 | 中 | 開關前後 bounding box、持續輸入、outside click、Escape 與 toggle-only close interaction |
| 多備註共用 selection／toolbar | 格式套到錯誤 note | 中 | 建立第二 note，各自切換與內容斷言 |
| legacy plain note 顯示空白 | 舊資料不可用 | 高 | legacy fixture 在 desktop/mobile/AI 三路驗證 |

## Automated Cases

| Case | 驗證 |
|---|---|
| QA-066-001 | plain legacy state 轉 plain/AI projection 不丟字，空白不建立假內容 |
| QA-066-002 | heading、粗／斜／刪除線、清單、安全連結輸出受控 Markdown；危險 URL 退化文字 |
| QA-066-003 | 390px 直接編輯 rich state 後，原有 heading/list/link/format bits 與新文字均正確 round-trip；不經 plain-text append merge |
| QA-066-004 | WBS RAG 有 detail notes 時不重複 description，metadata 含 task/note id/title；無 notes 時保留 legacy fallback |
| QA-066-005 | TypeScript 與 production/test build 可解析新增 Lexical nodes 與 optional schema |
| QA-066-006 | static/source gate 證明移除 `useDesktopNoteEditor`／`TaskDetailNoteMobile`／append selectors，且沒有新增手機 editor module或裝置別 write path |

## Rendered QC Cases

| Case | Viewport | 步驟 / Expected |
|---|---:|---|
| QA-066-007 | 1440x1000 | 每則 note 有格式按鈕，toolbar 預設不存在；開啟後顯示於原按鈕左側且與 header actions 同列，card/modal bounding box 不變 |
| QA-066-008 | 1440x1000 | 工具列開啟後，點進 editor、持續輸入、點外部與 Escape 均保持顯示；再次點原格式按鈕才關閉；格式操作與 Ctrl+S 保存仍有效 |
| QA-066-009 | 1024x768 | toolbar 不被 modal／viewport 裁切、無非預期水平捲動，長標題／長連結仍可操作 |
| QA-066-010 | 390x844 | 每則可編輯 note 顯示同一 Lexical `contenteditable` 與格式 toggle；零 append label／textarea／button，格式內容可直接修改且無水平 overflow |
| QA-066-011 | 390x844 | 觸控選字後可套用粗體／斜體／底線／刪除線／標題／清單／連結／清除格式，undo／redo、中文 IME、貼上、儲存與重開一致 |
| QA-066-012 | 1440/390 | 第二則備註具有獨立 editor／toolbar；新增、刪除、readonly／disabled 與權限控制跨 viewport 一致 |
| QA-066-013 | all | 掃描 role alert、inline error、visible error text 與 console page errors，無產品可見錯誤 |
| QA-066-014 | 320x568 / 390x844 / 844x390 | toolbar、editor、modal 與軟鍵盤情境無裁切、遮蔽、雙捲動、scroll chaining 或 viewport overflow |
| QA-066-015 | iOS Safari / Android Chrome | 實機完成觸控選字、格式化、中文輸入、鍵盤收合、儲存、關閉、重開；若缺實機證據，mobile touch gate 標記 `未充分驗證` |

## Regression Boundary

- 任務詳情標題、日期、狀態、指派、標籤、儲存、X 關閉前寫入與任務知識抽屜不得退步。
- `RecordContentEditor` 不在本 DEV 修改範圍；DEV-006 行為維持。
- 不新增手機 editor module、不改 schema/API/permission/format allowlist，也不以 plain text 全文覆寫 canonical rich state。
- 不執行 production migration、部署或 release smoke。

## 歷史 Execution Result 與 Rework 4 證據邊界

- Rework 1～3：2026-08-12 的 QA-066-001～013 舊版案例 PASS；詳細數據、screenshots 與非阻塞 findings 見 `ai-doc/qc/QC-DEV-066-task-note-semantic-rich-text.md`。
- Rework 4：2026-08-28 已實作並執行 local simulated scope。QA-066-001～010、012～013 與 QA-066-014 的 viewport／overflow 部分通過；QA-066-011 的直接編輯、格式套用、保存重開通過，但真實 touch selection、中文 IME、貼上與 soft keyboard 未由桌機模擬證明。
- QA-066-015 與 QA-066-014 的 soft-keyboard 部分仍待 iOS Safari／Android Chrome 實機；缺實機 evidence 時，QC 不得宣稱 mobile fully verified。舊 mobile zero-editor／append preservation PASS 僅是歷史事實，不能作為目前統一 editor 契約的通過證據。

## Evidence Required

- targeted verifier 輸出與 TypeScript/build 結果。
- 1440、1024、390、320／landscape screenshots 與 toolbar/editor/modal geometry。
- browser verifier 的單一 editor module boundary、editor/format-toggle counts、append selector absence、rich state round-trip、overflow 與 visible-error scan。
- iOS Safari／Android Chrome 的觸控 selection、中文 IME、soft keyboard、save/reopen 手動或裝置自動化證據。
- 更新 `ai-doc/qc/QC-DEV-066-task-note-semantic-rich-text.md` 記錄 Rework 4 實測結果與殘餘限制；未執行前不得覆寫歷史 PASS 事實。
