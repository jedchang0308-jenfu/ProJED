# SPEC-012 AI 會議紀錄自然語言品質提升

狀態：Done / Production Release Deployed / Production UI Smoke Passed
關聯 DEV：DEV-012  
建立日期：2026-06-07  
承接：DEV-011 / DEV-008

## 背景

DEV-011 已將會議紀錄從逐筆 activity 流水帳改為 AI 發布前統整草稿，但目前輸出仍偏向固定欄位填空：`結論`、`決議`、`待辦`、`阻塞`、`狀態變更摘要`。這種格式可驗證，但不像人類整理的會議紀要，使用者讀起來仍像機械式摘要。

本交付點目標是保留任務導向查找能力，同時讓 AI 草稿更接近人類會後整理稿：自然語言、可讀、精煉、有上下文，而不是死板單詞或空欄位。AI 只能整理人類在會議中寫下或實際操作改變的內容，不能補寫專案既有狀態或自行推論下一步。

## 目標

- 保留 `1. 本次會議總結`、`2. 任務討論與結論`、`3. 待校稿項目` 三個大章節。
- 保留 `@[title](task:id)` token；任務段落以階層編號呈現，且每個子層 heading 必須顯示完整任務路徑 chips，例如 `2.1 @[列表](task:id)`、`2.1.1 @[列表](task:id) @[卡片](task:id)`、`2.1.1.1 @[列表](task:id) @[卡片](task:id) @[子任務](task:id)`，確保使用者不用回看父層也能理解上下文，且 DEV-008 任務知識片段抽取仍可用。
- 每個任務改為 1 段自然語言紀要；只有人類明確講到行動、負責人或期限時才輸出 `下一步`。
- 不再要求五欄固定模板，不輸出空泛欄位。
- 不把 task status、description、detail notes、目前排程等專案既有狀態寫入會議紀錄。
- 不在會議紀錄開頭寫 AI 工作內容或整理說明。
- 正式環境 Edge Function 預設首選模型改為 `gemini-3.5-flash`，並保留 env override；若未設定 env override 且首選模型 unavailable，可受控 fallback 到 `gemini-3.1-flash-lite`，但必須在 response warnings 與 model 欄位揭露。

## AI Output Format

後端函式仍回傳：

```ts
{
  content: string;
  warnings: string[];
  linkedTaskIds: string[];
  provider?: string;
}
```

`content` 必須符合：

```md
1. 本次會議總結
- 只整理會議速記、任務補記與會中實際變更。

2. 任務討論與結論
2.1 @[任務 A](task:id)
本次討論聚焦在...。團隊決定...，目前還需要...。狀態變更可簡述為...

下一步：
- RD 在 ... 前完成 ...（只有人類明確講到時才列）

2.2 @[任務 B](task:id)
...

3. 待校稿項目
- 請確認...
```

規則：

- 任務 heading 必須使用階層編號與完整任務路徑 task tags，例如 `2.1 @[列表](task:id)`、`2.1.1 @[列表](task:id) @[卡片](task:id)`。
- 不得輸出 Markdown heading，例如行首 `#`、`##`、`###`。
- 同一個任務段落不得混入其他任務的結論。
- 可使用 `下一步`、`待確認`、`風險` 等小標，但只整理人類明確講到的內容，不得回到固定五欄填空模板。
- 多次 activity 只能合併成一句自然語言脈絡，不列逐筆 timestamp。
- 沒有會中補記或任務變更的任務，不要硬寫段落。
- 資訊不足時寫入 `待校稿項目`，不要假裝已決議或自行產生下一步。

## Implementation Scope

- 更新 `supabase/functions/synthesize_meeting_record/index.ts`：
  - prompt 改成任務紀要型自然語言指令。
  - 預設首選模型改為 `gemini-3.5-flash`。
  - 未設定 `GEMINI_MEETING_SYNTHESIS_MODEL` 且首選模型 unavailable / not found 時，可受控 fallback 到 `gemini-3.1-flash-lite`，並回傳 warning 與實際使用模型。
  - 若使用者明確設定 `GEMINI_MEETING_SYNTHESIS_MODEL`，模型 unavailable / not found 時回傳可理解錯誤，前端沿用 DEV-011 保留原草稿行為。
- 更新 `src/utils/meetingRecordSynthesis.ts` deterministic fallback：
  - 改為自然語言段落與 `下一步` / `待確認` bullets。
  - 保留 duplicate activity collapse 與 task tag。
  - 不使用 task status、description、detail notes 或目前排程補內容。
- 更新 `useRecordStore` synthesis source package：
  - tasks 僅提供 id/title 作為 task tag 與分段上下文。
  - 會議內容來源限於 `rawContent` 與 `activities`。
- 更新 DEV-011 verifier 以接受自然語言格式。
- 新增 `verify:dev-012-meeting-record-quality`：
  - golden samples 檢查自然語言品質、非五欄模板、非 timestamp 流水帳、任務片段可抽取。

## Non-Scope

- 不新增 migration。
- 不改 `KnowledgeRecord`、`record_task_links`、RAG token 格式。
- 不新增 AI 自動修改任務能力。
- 不做即時 AI 統整。
- 不新增語意評分服務或人工標註平台。
- 手機版會議紀錄工作流不列入 release gate。

## Acceptance Criteria

- AI/fallback 草稿保留三個 numbered 大章節與 task tag。
- 任務段落是自然語言紀要，不再是五欄固定模板。
- 多次任務狀態變更只合併成自然語言狀態脈絡。
- 不輸出「目前任務狀態為...」「任務背景是...」「既有備註指出...」等專案既有狀態。
- 不輸出「本次會議沒有留下完整討論內容」這類無會議資訊的填充句。
- `下一步` 只在 rawContent 中有人類明確寫出行動時出現。
- DEV-008 任務知識仍能抽到目前任務片段，且不混入其他任務。
- Edge Function source 預設首選模型為 `gemini-3.5-flash`，env override 仍有效；未設定 env override 時，fallback 必須透明揭露。
- AI 失敗或模型不可用時不覆蓋原草稿。

## Verification

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run build
```
