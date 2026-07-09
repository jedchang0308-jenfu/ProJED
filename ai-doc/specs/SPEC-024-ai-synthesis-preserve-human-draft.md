# SPEC-024: AI整理保留手寫內容與章節結構

對應 DEV: DEV-024  
父交付點: DEV-011 / DEV-012 / DEV-020  
關聯回歸: DEV-021 / DEV-022  
節點類型: 開發點  
狀態: Implemented / Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed
優先級: P1  
是否計入產品交付完成: 否

## 背景

使用者在會議紀錄內容中先手動填寫紀錄，再點擊 `AI整理` 後，原本手寫內容會被 AI 統整結果覆蓋，且手動章節結構也可能被改掉。現有 DEV-021 / DEV-022 已保護 `專案變化匯入` evidence，避免 AI整理後遺失或形成第二份完整會議紀錄；但尚未把使用者手寫內容列為受保護來源。

目前回寫差距：

- `synthesizeMeetingDraft` 會以 AI 產生的 `result.content` 作為主結果。
- 現有 deterministic guard 只透過 `mergeProjectChangeImportBlocks(result.content, preservedDraft.content)` 保留專案變化 evidence。
- 使用者手寫段落、手動章節、人工補充、風險與決議若未被 AI 重新引用，仍可能消失。

DEV-024 目標是把 `AI整理` 從「覆蓋目前內容」改成「以目前內容為受保護來源，產生可校稿的同一份整理草稿」。

## 問題定義

真正問題不是 prompt 不夠強，而是 AI整理回寫缺少 deterministic human-draft merge guard。Prompt 只能提高 AI 引用機率，不能保證手寫內容、章節語意與 task mentions 不被丟失。

## 限制條件

- 不改資料庫 schema。
- 不改 `KnowledgeRecord.content` persistence 格式。
- 不新增第二份會議紀錄。
- 不把手寫原文整段 append 到文末作為第二份草稿。
- 不只靠 prompt 或模型指令修補。
- 必須維持 DEV-021 project change preserve guard。
- 必須維持 DEV-022 single-record integration guard。
- 重複按 `AI整理` 必須 idempotent，不得重複堆疊同一段手寫內容。

## 目標行為

- 使用者手寫內容是受保護來源，AI整理不得丟失其語意。
- AI 可改寫、合併、移動手寫內容，但 deterministic guard 必須檢查未被 AI 納入的段落。
- 使用者手動章節內容不得被清空；若 AI 改用標準章節，原章節內容必須被映射進新章節。
- 手寫 task mention 或 task-linked paragraph 必須保留 task link。
- 專案變化匯入、手寫補充、任務活動與 AI整理結果最後只能形成一份會議紀錄。

## 演算法規格

新增 helper 建議命名：

```ts
mergeHumanDraftWithAiSynthesis(aiContent, preservedDraftContent, options)
```

演算法步驟：

1. Parse preserved draft
   - 抽取使用者手寫段落。
   - 抽取既有章節標題與章節內容。
   - 抽取 task mentions。
   - 抽取 project change protected evidence。
   - 排除空白、placeholder、重複分隔線與已知 AI boilerplate。

2. Normalize AI result
   - 移除 AI 產生的重複 project change marker。
   - 確保只有一組主會議紀錄結構。
   - 保留 AI 統整後的標準章節順序。

3. Fingerprint comparison
   - 對 preserved hand-written paragraphs 建立 normalized fingerprint。
   - 對 AI result 建立 normalized fingerprint。
   - 若手寫段落語意已出現在 AI result，視為 preserved。
   - 若未出現，列為 missing human evidence。

4. Deterministic fallback placement
   - 含 task mention 或任務名稱的手寫內容：補入 `2. 任務討論與結論`。
   - 風險、阻塞、決議、待辦：補入對應標準章節或 `3. 其他`。
   - 原本自訂章節存在且 AI 未保留內容：以 `其他補充` 或原章節名補回。
   - fallback 不得新增第二組 `1. 本次會議總結 / 2. 任務討論與結論 / 3. ...`。

5. Idempotent cleanup
   - 同一段 missing human evidence 重複 AI整理不得再次追加。
   - 同一 task mention 不得因 fallback 重複建立 task link。
   - 與 DEV-021 / DEV-022 的 project change evidence normalization 共用 fingerprint 規則或相容規則。

## 最佳化準則

- 優先讓 AI 統整結果成為主要可讀草稿，不把原文大段附在最後。
- fallback 補回只處理 AI 未涵蓋的最小必要段落。
- 保留語意優先於保留逐字原文；但決議、數字、日期、人名、風險與 task mention 不可被改錯。
- 若無法安全判斷段落分類，放入 `其他`，不要丟棄。
- 章節名稱可標準化，但章節內容不得因標準化而消失。

## UI / Copy

`AI整理` tooltip 應改為：

```text
AI整理會保留目前手寫內容，並將任務變更與手動紀錄統整成同一份草稿。
```

AI整理完成後可補短訊號：

- `已保留手寫內容`
- 若 deterministic fallback 補回內容：`已補回未被 AI 納入的手寫段落`

此訊號不得擴大成大型卡片，避免增加紀錄流程資訊密度。

## Acceptance Criteria

- 手寫一段純文字後按 `AI整理`，該段語意不得消失。
- 手寫自訂章節後按 `AI整理`，章節內容不得被清空。
- 手寫含 task mention 的段落後按 `AI整理`，task link 仍保留。
- 先匯入專案變化，再手寫補充，再按 `AI整理`，最後仍只有一份會議紀錄。
- 重複按 `AI整理`，不得重複補同一段手寫內容。
- DEV-021 / DEV-022 verifier 必須仍通過。
- 不改資料庫 schema，不改 record content persistence 格式。

## Regression Gate

RD 完成後至少需通過：

```powershell
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft-browser
npm.cmd run verify:dev-021-project-change-ai-preserve
npm.cmd run verify:dev-022-project-change-single-record
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

## Implementation Evidence - 2026-07-06

- `src/utils/humanDraftSynthesisMerge.ts` 新增 deterministic human-draft merge guard，先套用 DEV-021 / DEV-022 project change merge，再抽取 preserved draft 的手寫段落、自訂章節與 task mention evidence。
- `src/store/useRecordStore.ts` 的 `AI整理` 回寫改用 `mergeHumanDraftWithAiSynthesis(result.content, preservedDraft.content)`，並以 merged content 重新同步 taskLinks。
- `src/components/Records/RecordSidebar.tsx` 的 `AI整理` tooltip 已改為說明會保留目前手寫內容並統整成同一份草稿。
- `scripts/verify-dev-024-ai-synthesis-preserve-human-draft.mjs` 已從文件檢查升級為 deterministic verifier，覆蓋手寫純文字、自訂章節、task mention、project change + human draft、single-record heading count、idempotency、store integration 與 docs references。
- `scripts/verify-dev-024-ai-synthesis-preserve-human-draft-browser.pw.js` 新增 local-test browser ROT verifier，覆蓋會議紀錄 composer 內手寫純文字、自訂章節、專案變化匯入 + 手寫補充、再次 `AI整理` 不重複與存草稿內容驗證。
- 本輪不改 DB schema、不改 `KnowledgeRecord.content` persistence 格式、不新增遠端 history / version table。

## QC Evidence - 2026-07-06

Passed:

```powershell
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft-browser
npm.cmd run verify:dev-021-project-change-ai-preserve
npm.cmd run verify:dev-022-project-change-single-record
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Browser ROT evidence:

- ROT-001 screenshot: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-001.png`
- ROT-002 screenshot: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-002.png`
- ROT-003/004 screenshot: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-003-004.png`

Production UI Smoke Evidence - 2026-07-09:

- 使用者已授權 production fixture path，執行 `DEV024_ALLOW_PRODUCTION_FIXTURE=1 npm.cmd run verify:dev-024-production-ui-smoke -- --run-production-fixture` 通過。
- 正式站：`https://projed-cc78d.web.app/`；本輪未重新部署，因目前 production artifact 已含 DEV-024 human-draft merge guard。
- UI evidence：正式前端完成專案變化匯入、手寫純文字、自訂章節、task mention、手寫補充、連續兩次 `AI整理`、校稿發布流程；第二次 `AI整理` 後 `humanSupplementCount=1`。
- DB evidence：`published_record_found=true`、`rag_enabled=true`、`source_document_present=true`、手寫任務 `record_task_links` 保留，匯入任務以 published content evidence 查證保留。
- Cleanup evidence：`tenantDeleted=true`、`userDeleted=true`。
- Residue audit：production Supabase 只讀查詢確認 DEV-024 fixture `tenants`、`profiles`、`knowledge_records` 與 Auth user 均無殘留。
- Residual observation：第二次正式 AI 輸出可見少量章節 label 文字殘留，屬模型輸出自然度/格式 polish，不阻擋 DEV-024 preserve/idempotent smoke；Playwright network log 有一次非阻斷 `net::ERR_ABORTED` Edge request，但 UI、發布與 DB proof 均通過。
