# QA-DEV-012 AI 會議紀錄自然語言品質提升驗證計畫

狀態：Reopened / Contract v2 Local QA + Browser QC Passed / Production v2 Effectiveness Pending
關聯 DEV：DEV-012  
關聯規格：`ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md`  
建立日期：2026-06-07

## 驗證重點

以 UX 與內容品質為主要需求：AI 草稿需像人類整理的任務紀要，而不是固定欄位填空。驗證必須同時確認可讀性與系統契約：task tag 保留、任務片段可查、AI 不改任務、失敗不覆蓋原稿。AI 不能用專案既有狀態補內容，也不能自行推論下一步。

## 自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-011-012-production-ui-smoke-readiness
npm.cmd run verify:dev-011-012-production-ui-smoke
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft-browser
npx.cmd tsc --noEmit
npm.cmd run build
```

## 2026-08-07 重開原因

使用者已確實執行 AI整理；問題不是操作遺漏，而是既有成功判定只檢查「有非空文字」，無法證明：

- 正式 Edge Function 與前端使用同一份輸出契約。
- 本次成功確實來自 Gemini，而不是 deterministic timeout fallback。
- 輸出沒有空父節點、孤立 task heading、空正文、重複敘述或缺少 task link。
- 執行結果可由 run ID、模型、函式版本與品質報告追溯。

2026-06/07 的 production pass 保留為歷史 v1 證據，不得用來代表 `meeting-synthesis-v2` 已在正式環境改善。

## Contract v2 QA Matrix

| ID | 層級 | 測試輸入／故障注入 | 預期結果 | 自動化證據 |
|---|---|---|---|---|
| V2-001 | API contract | response 缺少或回傳錯誤 `contractVersion` | `CONTRACT_VERSION_MISMATCH`；原稿不覆蓋 | `verify:dev-012-meeting-record-quality` source/contract gate |
| V2-002 | Trace | 缺 run ID、function version、provider、generatedAt 或 normalization | `SYNTHESIS_TRACE_MISSING`；原稿不覆蓋 | `verify:dev-012-meeting-record-quality` |
| V2-003 | Output gate | 空父節點或空 task body | `STRUCTURAL_ONLY_TASK_HEADING` / `EMPTY_TASK_BODY` | `verify:dev-012-meeting-record-quality` negative fixture |
| V2-004 | Output gate | task tag 存在但 `linkedTaskIds` 缺漏 | `LINKED_TASK_IDS_INCOMPLETE` | `verify:dev-012-meeting-record-quality` negative fixture |
| V2-005 | Output gate | 低價值位置操作或重複敘述 | `LOW_VALUE_ACTIVITY_IN_CONTENT` / `DUPLICATE_NARRATIVE` | `verify:dev-012-meeting-record-quality` negative fixture |
| V2-006 | Merge gate | 合併後主章節數量異常、task mention 遺失或有孤立 `2.x` | fail-closed；保留整理前草稿 | `getMeetingSynthesisMergeViolations` + browser ROT |
| V2-007 | Repeat/idempotency | 專案變化匯入 + 手寫補充，連續整理兩次 | 只有一組 1/2/3 主章節；task token、補充、狀態敘述各保留一次 | `verify:dev-024-ai-synthesis-preserve-human-draft-browser` ROT-003-004 |
| V2-008 | UX truthfulness | local/test 或 timeout deterministic fallback | 顯示「規則整理完成」，不得顯示為 AI 完成 | browser ROT status card |
| V2-009 | Persistence | 整理後存草稿／發布 | `metadata.meetingSynthesis` 保存 v2、run ID、provider、quality | browser ROT localStorage proof；production DB proof 待執行 |
| V2-010 | Production | 正式前端 + Edge 同 commit | `provider=gemini`、v2、model/run ID/function version 齊全、quality=passed | guarded production fixture，尚未執行 |

## 風險導向驗證

| Failure mode | 影響 | 嚴重度 | 目前控制 | Release 判定 |
|---|---|---:|---|---|
| 舊 Edge 仍回舊格式，但 UI 顯示成功 | 使用者誤以為改善已上線 | P1 | v2 handshake，前端 fail-closed | Stop-ship |
| Gemini 品質不合格仍覆蓋原稿 | 會議證據損失／污染 | P1 | Edge + client 雙重品質閘門 | Stop-ship |
| fallback 冒充 AI | 根因判斷錯誤、驗證失真 | P1 | provider-specific UI 文案與 trace | Stop-ship |
| 重複整理造成章節膨脹或 token 遺失 | 同類問題重現 | P1 | source snapshot + merge integrity gate + browser ROT | Stop-ship |
| trace 未持久化 | 無法追查單次執行 | P2 | 既有 metadata jsonb / local storage persistence | 不得結案 |

## 本機執行結果（2026-08-07）

- `npm.cmd run verify:dev-011-ai-meeting-synthesis`：Pass。
- `npm.cmd run verify:dev-012-meeting-record-quality`：Pass；含 v2 握手、trace、fail-closed negative fixtures。
- `npx.cmd tsc --noEmit`：Pass。
- `npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft-browser`：Pass，5/5；實際瀏覽器驗證規則整理標示、DOM trace、metadata persistence、重複整理 idempotency 與發布路徑。
- `verify:dev-015`、`verify:dev-021`、`verify:dev-022`、`verify:dev-023`、`verify:dev-024` 關聯回歸：Pass。
- `verify:dev-011-012-production-ui-smoke-readiness` 與 production executor self-check：Pass，皆為 `mutates_database=false`；未執行 production fixture。
- `npm.cmd run lint -- --quiet`：Pass。
- `npm.cmd run build`：Pass，產生本機候選 artifact；未部署。
- 視覺 QC：1440×768 截圖確認 task chips、單一任務章節與自然語言狀態敘述可見，無空父節點與孤立 task heading。

## Production v2 Stop-Ship Gate

以下全部通過前，DEV-012 維持 Reopened，不得標示「正式環境已改善」：

1. 部署同一 commit 的 `synthesize_meeting_record` 與 frontend artifact。
2. production UI smoke 讀到 `data-meeting-synthesis-provider=gemini`、`contract=meeting-synthesis-v2`、`quality=passed`，且 model、run ID、function version 非空。
3. DB 查證新紀錄 `metadata.meetingSynthesis` 與 UI trace 的 run ID 一致。
4. 重跑使用者同型案例：完整任務路徑、父節點無獨立空段、無重複／no-op／空第三章，連續整理兩次不退化。
5. fixture cleanup 成功，且無 critical console/page/network error。

## Golden Samples

### GS-001 雙任務交錯討論

輸入：
- 任務 A 討論設計方向與資料流。
- 任務 B 討論 QA 實際輸入測試。
- raw content 中 A/B 交錯出現。

通過：
- A/B 各自有連續編號與 task tag；完整任務路徑整合在同一行，例如 `2.1 @[parent](task:id)／@[title](task:id)`，不得另出現「所屬：」行。
- 只有階層用途的父節點不建立空標題；子任務標題仍保留完整路徑供查找。
- 每個任務為自然語言段落。
- A 片段不含 B 的 QA 結論，B 片段不含 A 的設計結論。
- 不出現 `目前任務狀態為`、`任務背景是`、`既有備註指出` 等專案靜態資料。

### GS-002 多次任務狀態變更

輸入：
- 同一任務有重複狀態變更與排程變更 activity。

通過：
- 不出現逐筆 timestamp。
- 重複 activity 被合併。
- 前後值相同的 activity 不建立任務段落。
- 狀態脈絡以自然語言描述，例如「會中已將任務推進到進行中，並同步調整排程」。
- 不寫「本次沒有狀態變更」這類專案已知或無資訊填充句。

### GS-003 資訊不足

輸入：
- 任務只有 tag 或 activity，沒有明確決議。

通過：
- 任務段落不硬寫假決議。
- 不自動寫「下一步」。
- 沒有實質其他內容時不輸出第三章或固定校稿提示。

### GS-004 下一步只整理人類明確內容

輸入：
- 任務 A 速記：`QA 要補實際輸入測試，明天回報結果。`
- 任務 B 速記：`設計方向確認。`

通過：
- 任務 A 可出現 `下一步`，內容來自原始句子。
- 任務 B 不出現 `下一步`，因為沒有明確後續行動。

### GS-005 低價值位置活動不進入正文

輸入：
- 任務 E 只有 `task_moved`，摘要為「位置已調整」。
- 任務 A 同時有狀態變更與一筆純位置活動。
- 人工速記另有「為了避開交期風險，團隊決定把任務移到下一階段」等實質內容。

通過：
- `task_moved` 與純「位置已調整／順序已調整／已移動／已重新排列／區塊已更新」不出現在正文或專案變化補充。
- 任務 E 不建立任務段落，也不列入 `linkedTaskIds`。
- 任務 A 的狀態變更仍保留，且不因同時存在純位置活動而被排除。
- 含原因、決議、風險或下一步的人工速記仍保留，不得被純摘要規則誤刪。
- 前端 meeting activity buffer、deterministic fallback、project change import 與 Edge Function 使用相同語意邊界。

## 手動 QA 情境

1. 開啟 meeting mode。
2. 在速記欄輸入口語內容：未完成句、簡短詞、任務 A/B 交錯討論。
3. 在任務詳情補記任務討論。
4. 會中移動任務或改狀態。
5. 點 `AI整理`。

通過：
- 草稿讀起來像人類會後紀要。
- 不出現五欄固定模板。
- `下一步` 只整理人類明確講過的行動。
- 不出現 AI 工作說明、專案目前狀態或由 AI 推論出的行動。
- 純拖曳／排序操作不出現在正文；同時發生的狀態、日期、負責人等有語意變更仍會被整理。
- 日期取消、日期設定以自然語言呈現，不出現 `未設定 至 未設定`。
- 發布後任務詳情的「任務知識」可查到自然語言片段。

## Edge / Failure QA（2026-06/07 v1 歷史證據）

- 未設定 `GEMINI_MEETING_SYNTHESIS_MODEL` 時，正式環境首選模型為 `gemini-3.5-flash`。
- 未設定 env override 且首選模型 unavailable / not found 時，可受控 fallback 到 `gemini-3.1-flash-lite`；response 必須回傳 warning 與實際使用的 `model`，不可 silent fallback。
- 明確設定 `GEMINI_MEETING_SYNTHESIS_MODEL` 且模型 unavailable / not found 時，不自動 fallback；原草稿不被覆蓋，UI 顯示 AI 統整失敗。
- 確認錯誤訊息能指出模型設定問題，並保留 DEV-011 的重試 AI 統整行為。
- 正式環境 backend smoke 已通過：`synthesize_meeting_record` 使用授權 user JWT 呼叫回 `200`，實際模型為 `gemini-3.5-flash`。
- Production UI smoke readiness gate 已補：`verify:dev-011-012-production-ui-smoke-readiness` 預設只讀、`mutates_database=false`，確認 session injection + cleanup pattern 與 local AI整理 browser ROT 已可串成正式站 UI smoke runner。
- Production UI smoke guarded executor 已補：`verify:dev-011-012-production-ui-smoke` 預設只跑 self-check，不登入、不建立資料、不呼叫 AI；完整 fixture path 需同時傳入 `--run-production-fixture` 並設定 `DEV011012_ALLOW_PRODUCTION_FIXTURE=1`。
- 2026-07-09 使用者已明確允許 production fixture path。第一次實跑揭露 production `rag_sync_jobs` RLS 對 first-publish ordering 的要求；同日以 hotfix branch `codex/dev011012-rag-order-hotfix` commit `7704e2f` 走 release gate 上線，正式站載入 `assets/index-BkwGqGCZ.js` / `assets/index-BrAYM5iH.css`，post-deploy browser smoke 通過。
- 修正上線後已重跑 `DEV011012_ALLOW_PRODUCTION_FIXTURE=1 npm.cmd run verify:dev-011-012-production-ui-smoke -- --run-production-fixture` 並通過：production fixture 建立與 cleanup 通過，正式前端完成 AI整理、校稿發布、紀錄庫與任務知識 UI；DB 查證 `published_record_found=true`、`record_task_links=2`、`rag_enabled=true`、`source_document_present=true`。DEV-012 production UI smoke 已通過。

## UI QC

桌機與筆電 viewport：

| Viewport | 驗證重點 |
|---|---|
| 1440x950 | 自然語言草稿、AI 狀態、發布按鈕不遮住看板 |
| 1024x768 | 長段落不造成右側欄水平 overflow 或主要按鈕裁切 |

手機版會議紀錄工作流不列入 release gate。
