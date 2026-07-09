# SPEC-011 AI 任務導向會議紀錄統整工作流

狀態：Done / Production Release Deployed / Production UI Smoke Passed
關聯 DEV：DEV-011  
建立日期：2026-06-07  
承接：DEV-005 / DEV-007 / DEV-008 / DEV-009 / DEV-010

## 背景

目前會議草稿仍偏向「逐筆 append 的流水帳」。這讓會議後查找任務結論時，使用者需要從時間序列中自行整理結論、決議、待辦與阻塞。真正需求不是更快記逐字稿，而是把會議資料轉成可決策、可追蹤的任務紀錄。

## 目標

- 發布會議紀錄前，先由後端 AI 統整成任務導向草稿。
- 人類只做最後校稿與發布。
- AI 僅更新 meeting draft content，不自動建立、修改、移動或刪除任務。
- published 正文不附加原始 activity 流水帳。
- 保留 `@[title](task:id)` token，確保 `record_task_links` 與 DEV-008 任務知識查找仍可用。

## 使用者工作流

1. 使用者在會議模式維持一般看板編輯。
2. 使用者可在速記欄、任務詳情補記、看板任務變更中累積來源資料。
3. 使用者點 `AI整理` 或第一次 `發布`。
4. 前端將 meeting draft source package 傳給後端函式 `synthesize_meeting_record`。
5. AI 回傳任務導向 markdown 草稿，前端只寫回 `draft.content`，狀態仍是 `draft`。
6. 使用者校稿。
7. 使用者再次點 `發布`，才正式儲存為 `published`。
8. 若 AI 失敗，保留原草稿，不覆蓋內容，顯示錯誤並允許重試。

## Source Package

前端傳給後端函式：

- meeting title
- participants
- raw draft content
- task discussion notes
- meeting activities
- linked task ids / titles / status / description / detail notes / schedule metadata

## AI Output

後端函式回傳：

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
## 本次會議總結
- ...

## 任務討論與結論
### @[任務 A](task:id)
- 結論：
- 決議：
- 待辦：
- 阻塞：
- 狀態變更摘要：

### @[任務 B](task:id)
- 結論：
- 決議：
- 待辦：
- 阻塞：
- 狀態變更摘要：

## 待校稿項目
- AI 不確定或需要人確認的地方
```

## Implementation Scope

- 新增 `src/utils/meetingRecordSynthesis.ts`：可測試的統整資料結構與 deterministic fallback。
- 新增 `src/services/meetingSynthesisService.ts`：前端 service，只呼叫後端函式或測試 fallback，不保存模型 key。
- 新增 `supabase/functions/synthesize_meeting_record/index.ts`：後端模型呼叫，讀取 `GEMINI_API_KEY`。
- 更新 `useRecordStore`：
  - `meetingSynthesisStatus`
  - `meetingSynthesisError`
  - `meetingSynthesisWarnings`
  - `synthesizeMeetingDraft`
  - publish 前若尚未統整，先 AI 統整並保持 draft。
- 更新 `BoardView` / `RecordSidebar`：
  - 顯示 AI 統整中、錯誤、待校稿、可發布狀態。
  - `AI整理` 與 `發布` 階段分離。
  - 看板仍維持平常編輯模式。

## Non-Scope

- 不新增 migration。
- 不改 `KnowledgeRecord`、`record_task_links`、RAG token 格式。
- 不新增完整會議管理系統。
- 不做即時整理。
- 不讓 AI 自動修改任務。
- 手機版會議紀錄工作流不列入 release gate。

## Acceptance Criteria

- 多次任務狀態變更只形成一段「狀態變更摘要」。
- 任務 A / B 同時討論時，草稿依任務分段。
- AI 草稿保留 `@[title](task:id)` token。
- AI 不直接呼叫任務建立、修改、移動或刪除流程。
- AI 失敗時原始 draft content 不被覆蓋。
- 人類校稿後發布，DEV-008 任務知識仍可查到統整片段。

## Verification

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-009-task-detail-quick-note
npm.cmd run verify:dev-010-action-feedback
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run build
```
