# QC-DEV-066：任務備註語意富文字與 AI 可讀內容

- 關聯：DEV-066、SPEC-066、ADR-042、QA-DEV-066
- 執行日期：2026-08-12
- 結論：PASS
- Release：未執行；本輪沒有部署授權

## 交付結果

- Desktop／laptop：每則備註獨立 Lexical editor 與 Gmail-like 底線 A 格式按鈕；工具列預設不 render，開啟後顯示在 header actions 同列、A 按鈕左側，並保持顯示直到再次點 A。
- Mobile：390px 分支零格式按鈕、零 toolbar、零 Lexical editor、零 contenteditable；只顯示安全格式 renderer 與每則備註的純文字追加欄。
- Data：task-note.lexical-v1 Lexical JSON 為 canonical，content 與第一則 description 為 plain compatibility alias；legacy note lazy upgrade，Supabase JSONB 無 migration。
- AI：由受控 nodes 產生 Markdown，保留 heading、paragraph、list、emphasis、safe link 與 note metadata；有 detail notes 時不再重複輸出 description。

## Automated Evidence

| Gate | 結果 | 摘要 |
|---|---|---|
| Targeted ESLint | PASS | DEV-066 components、utility、modal、RAG adapter 與 verifier 無 error/warning |
| tsc --noEmit | PASS | optional rich schema、Lexical nodes、mobile/desktop props 均通過 |
| verify:dev-066-task-note-rich-text | PASS | semantic projection、unsafe URL、legacy、append-only merge、RAG 去重／metadata、mobile code boundary |
| p9-rag-local-smoke.ts | PASS | 2 documents、2 versions、2 chunks、2 embedding inputs、2 sync jobs |
| build:test | PASS | Vite 7.3.6，1993 modules；desktop note editor 產生獨立 lazy chunk |
| DEV-006 Gmail editor | PASS | 既有會議編輯器 round trip／task chip 未退步 |
| DEV-008 task knowledge | PASS | task-scoped snippets、fallback、search 未退步 |
| DEV-033 browser | PASS | 明確儲存、X 關閉前寫入、重開內容一致 |
| DEV-050 static/browser | PASS | 每則備註刪除與最後一則 blank fallback 未退步 |

## Rendered QC

| Case | 結果 | 證據 |
|---|---|---|
| QA-066-007 1440 desktop | PASS | 2 notes／2 editors／2 format toggles；toolbar 位於 A 左側且與 header actions 垂直對齊，開啟前後 modal 與 note card geometry 差異 ≤ 0.5px |
| QA-066-008 desktop semantics | PASS | editor 輸入、outside click 與 Escape 後 toolbar 仍顯示，只有再次點 A 關閉；粗體、小標題、項目清單、link、清除格式與 Ctrl+B、Ctrl+S 實際操作並保存 |
| QA-066-009 1024 laptop | PASS | toolbar x ≥ 0 且 right ≤ viewport；document scrollWidth ≤ viewport |
| QA-066-010 390 mobile | PASS | 0 editor、0 format toggle、0 toolbar、0 contenteditable；heading、list、bold renderer 可見 |
| QA-066-011 mobile append | PASS | original serialized children byte-for-byte 保留，只新增一個 paragraph；plain alias 與 UI 同步 |
| QA-066-012 multi-note | PASS | desktop 每則獨立 toggle；mobile 每則獨立 append；DEV-050 delete regression PASS |
| QA-066-013 error sweep | PASS | product console/page error 0、visible alerts 0、desktop/laptop/mobile 無水平 overflow |

## Screenshot Evidence

- output/playwright/dev-066-task-note-desktop-1440.png
- output/playwright/dev-066-task-note-laptop-1024.png
- output/playwright/dev-066-task-note-mobile-390.png

## Rework 1：格式工具辨識性（2026-08-12）

- 使用者依實際畫面指出 `¶`、`H3` 與刪除線圖示不夠直覺；同組文字格式控制一併改為完整中文標籤：`本文`、`小標題`、`粗體`、`斜體`、`底線`、`刪除線`。
- 復原／重做、項目清單、編號清單、連結與清除格式保留既有熟悉圖示；toolbar 仍由格式按鈕按需叫出，不常駐占用備註版位。
- Targeted ESLint、`tsc --noEmit`、static verifier 與 1440／1024／390 browser suite 均 PASS；1024 toolbar 完整位於 viewport 內，沒有水平 overflow，console/page error 為 0。
- 此變更只改善桌面／筆電控制名稱的辨識性，不變更格式 allowlist、canonical 資料、AI 投影、手機零編輯器邊界或儲存流程，無 SPEC／ADR contract drift。

## Rework 2：恢復熟悉格式圖示（2026-08-12）

- 依使用者標註，粗體、斜體、底線恢復熟悉的 B／I／U 圖示；`aria-label` 與 tooltip 仍使用完整中文名稱。
- 刪除線恢復圖示控制，但不使用辨識度不足的 S；改為 Aa 字樣加水平刪除線的組合圖示，直接呈現「文字被劃除」。
- `本文` 與 `小標題` 保留 Rework 1 的完整中文標籤；手機仍完全不顯示編輯器或格式工具。
- Targeted ESLint、`tsc --noEmit`、static verifier 與 1440／1024／390 browser suite 均 PASS；1024 toolbar 沒有裁切或水平 overflow，console/page error 為 0。
- 此 rework 只調整 icon rendering，不變更行為、資料、AI 投影或驗收契約，無 SPEC／ADR contract drift。

## Rework 3：header-inline 常駐工具列（2026-08-12）

- 依使用者圖片，工具列由 A 按鈕下方移至同一 header row、A 按鈕左側；以 absolute overlay 保持 note card 與 modal 幾何不變。
- 移除 outside pointerdown 與 Escape 自動關閉；工具列開啟後，點進 editor、持續輸入、點其他位置與按 Escape 均保持顯示，只有再次點同一則備註的 A 按鈕才關閉。
- Browser suite 實際輸入「持續編輯」並驗證工具列仍可見；1440／1024 placement、toggle-only close、無水平 overflow、console/page error 0 與 390 mobile zero-editor 均 PASS。
- 此 rework 是使用者明示的 interaction contract `Intentional replacement`；`SPEC-066`、`QA-DEV-066`、DEV-066 與 documentation map 已同步，資料、AI 投影、手機與 release boundary 未變更。

## Non-blocking Existing Findings

- verify:dev-047-backup-package-model 的既有 MOD-047-013 於本工作樹仍回報 matching.valid === false；前 12 cases 通過。DEV-066 未修改 src/features/backup/* 或該 verifier，新增 optional nested note field 仍由既有淺拷貝 package path 保留，因此此項未歸因為 DEV-066 regression。
- npm audit --omit=dev --audit-level=high 回報既有 postcss@8.5.25 -> nanoid@3.3.16 advisory；新增 Lexical direct dependencies 不在該 dependency chain。本輪未執行跨範圍 npm audit fix，release 前可另立 dependency maintenance。
- Browserslist 資料提示已 7 個月未更新；不影響本輪 test build，未於本 DEV 擴張更新。

## Scope Confirmation

- 未改會議 RecordContentEditor 行為。
- 未新增 Supabase migration，亦未讀寫 production 資料。
- 未部署、未發佈、未建立 release artifact。
