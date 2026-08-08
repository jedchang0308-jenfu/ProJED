# SPEC-012 AI 會議紀錄自然語言品質提升

狀態：Done / Production Release Deployed / Production UI Smoke Passed
關聯 DEV：DEV-012  
建立日期：2026-06-07  
承接：DEV-011 / DEV-008

## 背景

DEV-011 已將會議紀錄從逐筆 activity 流水帳改為 AI 發布前統整草稿，但目前輸出仍偏向固定欄位填空：`結論`、`決議`、`待辦`、`阻塞`、`狀態變更摘要`。這種格式可驗證，但不像人類整理的會議紀要，使用者讀起來仍像機械式摘要。

本交付點目標是保留任務導向查找能力，同時讓 AI 草稿更接近人類會後整理稿：自然語言、可讀、精煉、有上下文，而不是死板單詞或空欄位。AI 只能整理人類在會議中寫下或實際操作改變的內容，不能補寫專案既有狀態或自行推論下一步。

## 目標

- 保留 `1. 本次會議總結` 與有內容時的 `2. 任務討論與結論`；只有存在實質其他內容時才輸出第三章，不輸出空章節或固定校稿提示。
- 保留 `@[title](task:id)` token；任務標題以單行完整路徑呈現，使用「／」串接，例如 `2.1 @[列表](task:id)／@[卡片](task:id)／@[任務](task:id)`。不另立「所屬：」行；只有階層用途的父節點不建立獨立標題，完整 `linkedTaskIds` 仍須保留供 DEV-008 任務知識查找。
- 每個任務改為 1 段自然語言紀要；只有人類明確講到行動、負責人或期限時才輸出 `下一步`。
- 不再要求五欄固定模板，不輸出空泛欄位。
- 不把 task status、description、detail notes、目前排程等專案既有狀態寫入會議紀錄。
- 不把純位置、排序、拖曳、重新排列或區塊更新等低價值操作寫入會議紀錄。
- 不在會議紀錄開頭寫 AI 工作內容或整理說明。
- 正式環境 Edge Function 預設首選模型改為 `gemini-3.5-flash`，並保留 env override；若未設定 env override 且首選模型 unavailable，可受控 fallback 到 `gemini-3.1-flash-lite`，但必須在 response warnings 與 model 欄位揭露。

## AI Output Format

後端函式仍回傳：

```ts
{
  content: string;
  warnings: string[];
  linkedTaskIds: string[];
  provider: string;
  model?: string;
  contractVersion: 'meeting-synthesis-v2';
  functionVersion: string;
  runId: string;
  generatedAt: string;
  normalization: {
    receivedActivityCount: number;
    acceptedActivityCount: number;
    droppedActivityCount: number;
  };
  quality: {
    passed: boolean;
    checks: string[];
    violations: string[];
  };
}
```

前端呼叫必須帶 `requiredContractVersion: 'meeting-synthesis-v2'`。Edge Function 與前端各自執行一次品質檢查；合約版本不符、追溯欄位缺漏或品質不通過時，採 fail-closed：不得覆蓋原始草稿。

`content` 必須符合：

```md
1. 本次會議總結
- 只整理會議速記、任務補記與會中實際變更。

2. 任務討論與結論
2.1 @[列表](task:list-id)／@[任務 A](task:id)
本次討論聚焦在...。團隊決定...，目前還需要...。狀態變更可簡述為...

下一步：
- RD 在 ... 前完成 ...（只有人類明確講到時才列）

2.2 @[列表](task:list-id)／@[任務 B](task:id)
...

3. 其他
- 會議中另確認...
```

規則：

- 任務 heading 必須使用連續編號與單行完整任務路徑 task tags，例如 `2.1 @[列表](task:id)／@[卡片](task:id)`；不可拆成「任務標題」與「所屬」兩行。
- 不得輸出 Markdown heading，例如行首 `#`、`##`、`###`。
- 同一個任務段落不得混入其他任務的結論。
- 可使用 `下一步`、`待確認`、`風險` 等小標，但只整理人類明確講到的內容，不得回到固定五欄填空模板。
- 多次 activity 只能合併成一句自然語言脈絡，不列逐筆 timestamp。
- 同一任務的日期、狀態、主責或其他 activity 必須去除重複並合併；前後值相同、只有低價值位置操作或沒有實質變更時，不輸出。
- `task_moved` 與只有「位置已調整」「順序已調整」「已移動」「已重新排列」「區塊已更新」等制式摘要的 activity 必須在前端、fallback 與 Edge Function 邊界一致排除。
- 只具有低價值位置 activity 的任務，不得建立任務段落，也不得列入 `linkedTaskIds`。
- 人工速記若包含原因、決議、風險或下一步，即使提到移動／排序仍屬有效內容，不得套用純摘要過濾。
- 沒有會中補記或任務變更的任務，不要硬寫段落；只有階層用途的父節點不得單獨輸出。
- 資訊不足時不要假裝已決議或自行產生下一步；若確有人工補充，再放入第三章。

## Implementation Scope

- 更新 `supabase/functions/synthesize_meeting_record/index.ts`：
  - prompt 改成任務紀要型自然語言指令。
  - 預設首選模型改為 `gemini-3.5-flash`。
  - 未設定 `GEMINI_MEETING_SYNTHESIS_MODEL` 且首選模型 unavailable / not found 時，可受控 fallback 到 `gemini-3.1-flash-lite`，並回傳 warning 與實際使用模型。
  - 若使用者明確設定 `GEMINI_MEETING_SYNTHESIS_MODEL`，模型 unavailable / not found 時回傳可理解錯誤，前端沿用 DEV-011 保留原草稿行為。
- 更新 `src/utils/meetingRecordSynthesis.ts` deterministic fallback：
  - 改為自然語言段落與 `下一步` / `待確認` bullets。
  - 將完整任務路徑壓成單行，以「／」串接；不渲染只有階層用途的父節點。
  - 保留 duplicate activity collapse 與 task tag。
  - 對日期、狀態等前後值相同的 activity 做 no-op 過濾，並將單一日期變更改寫為人類可讀句子。
  - 不使用 task status、description、detail notes 或目前排程補內容。
- 更新 `supabase/functions/synthesize_meeting_record/index.ts`：
  - prompt 與 source package 共同採用單行完整路徑、無空父節點、無空第三章規則。
  - 輸入 activity 先做 no-op 與重複 fingerprint 過濾。
- 更新 `useRecordStore` synthesis source package：
  - tasks 僅提供 id/title 作為 task tag 與分段上下文。
  - 會議內容來源限於 `rawContent` 與 `activities`。
- 更新 synthesis response contract：
  - 前後端執行 `meeting-synthesis-v2` 版本握手。
  - 每次執行回傳 provider、model、function version、run ID、時間、輸入正規化統計與品質結果。
  - 合約不符、追溯缺漏、AI 輸出品質不合格或 merge 後主章節／task mention 遺失時，不得覆蓋草稿。
- 使用既有 `knowledge_records.metadata` 持久化 `meetingSynthesis` trace；不新增資料表或 migration。
- UI 必須區分 `gemini` 的「AI整理完成」與 deterministic fallback 的「規則整理完成」，技術追溯欄位以可測試 data attributes 提供 QA/QC，不增加一般使用者的可見噪音。
- 重複整理同一份未修改草稿時，沿用前一次保存的 source snapshot，避免把 AI 已生成章節再次當成人工輸入；merge 後仍須通過完整性閘門。
- 更新 DEV-011 verifier 以接受自然語言格式。
- 新增 `verify:dev-012-meeting-record-quality`：
  - golden samples 檢查自然語言品質、非五欄模板、非 timestamp 流水帳、任務片段可抽取。

## Non-Scope

- 不新增 migration；沿用既有 `knowledge_records.metadata jsonb`。
- 不改 `record_task_links`、RAG token 或 record content persistence 格式。
- 不新增 AI 自動修改任務能力。
- 不做即時 AI 統整。
- 不新增語意評分服務或人工標註平台。
- 手機版會議紀錄工作流不列入 release gate。

## Acceptance Criteria

- AI/fallback 草稿保留會議總結與有證據時的任務討論章節；有實質其他內容才輸出第三章與 task tag。
- 任務完整路徑與目前任務整合在同一個標題行，不出現獨立「所屬：」行。
- 沒有直接會議證據的父節點不建立獨立段落，但完整 `linkedTaskIds` 與任務知識查找仍保留。
- 任務段落是自然語言紀要，不再是五欄固定模板。
- 多次任務狀態變更只合併成自然語言狀態脈絡。
- 純位置／排序 activity 不出現在 summary、任務段落、專案變化補充或 `linkedTaskIds`。
- 不輸出「目前任務狀態為...」「任務背景是...」「既有備註指出...」等專案既有狀態。
- 不輸出「本次會議沒有留下完整討論內容」這類無會議資訊的填充句。
- `下一步` 只在 rawContent 中有人類明確寫出行動時出現。
- DEV-008 任務知識仍能抽到目前任務片段，且不混入其他任務。
- Edge Function source 預設首選模型為 `gemini-3.5-flash`，env override 仍有效；未設定 env override 時，fallback 必須透明揭露。
- AI 失敗或模型不可用時不覆蓋原草稿。
- 相同 activity 不會重複出現；前後值相同的 activity 不會建立任務段落。
- 日期取消或日期設定會以自然語言呈現，不輸出 `未設定 至 未設定` 等低可讀格式。
- 舊 Edge Function、缺少 v2 trace 或品質報告的 response 不得顯示成功，也不得覆蓋原稿。
- 空父節點、孤立 `2.x`、只有路徑分隔符的空正文、task tag 缺漏、低價值操作與重複敘述會被品質閘門拒絕。
- 本機 deterministic 整理不得顯示成 AI 完成；UI 必須顯示「規則整理完成」。
- 儲存後 `metadata.meetingSynthesis` 必須保有 run ID、contract/function version、provider/model、normalization 與 quality result。
- 相同草稿連續整理兩次維持 idempotent：只有一組主章節，匯入的 task token 與人工補充不遺失、不重複。

## Verification

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft-browser
npm.cmd run verify:dev-011-012-production-ui-smoke-readiness
npx.cmd tsc --noEmit
npm.cmd run build
```

## 2026-08-07 Contract v2 Release Gate

本機 QA/QC 通過不等於正式環境改善完成。DEV-012 只有在同一 commit 的前端與 Edge Function 部署後，production fixture smoke 證明 `provider=gemini`、`contract=meeting-synthesis-v2`、`quality=passed`、run ID／model／function version 齊全，且相同失敗案例前後對照通過，才可重新關閉。
