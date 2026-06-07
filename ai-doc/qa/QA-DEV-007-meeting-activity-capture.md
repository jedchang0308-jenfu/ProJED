# QA-DEV-007：會議中任務變更納入會議紀錄驗證計畫

狀態：Ready for QC
日期：2026-06-06
關聯：DEV-007、SPEC-007

## 驗證範圍

- 會議模式下的 Kanban card / checklist item 正常編輯行為。
- 任務狀態、移動、標題等變更被收集為 meeting activity。
- 儲存或發布會議紀錄時 activity append 到 `KnowledgeRecord.content`。
- `record_task_links` 仍由內容中的 task token 同步。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| 會議模式仍劫持卡片點擊 | card/checklist 仍使用 capture mode | 無法正常編輯任務 | browser 點擊測試 | P1 | 會議模式不啟用 click-to-insert |
| activity 未寫入紀錄 | updateNode 未通知 record store | 會議缺少任務變更脈絡 | static verifier + saveDraft 測試 | P1 | 由 updateNode 呼叫 record store collector |
| activity 重複附加 | 每次 save 都 append 全部 events | 會議紀錄污染 | 多次儲存測試 | P1 | 使用 appended activity id 去重 |
| task links 未同步 | activity 未使用 inline token | 任務相關紀錄缺漏 | token/link verifier | P1 | activity 摘要使用 `@[title](task:id)` |
| 看板拖曳被禁用 | meeting capture mode disabled drag handle | 會議中無法排任務 | browser DnD / static verifier | P1 | 移除 meeting mode 對 drag handle 的 disabled 條件 |

## 自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-002-records
npm.cmd run verify:dev-003-record-tags
npm.cmd run verify:dev-006-gmail-editor
npm.cmd run verify:dev-007-meeting-activity
npm.cmd run build
```

## 手動驗證

1. 開始會議後點 Kanban card 標題。
   - 通過：進入原本標題編輯或任務操作，不插入紀錄 tag。
2. 會議中改任務狀態。
   - 通過：會議紀錄儲存後出現「會議中任務變更」段落。
3. 會議中拖曳任務到另一欄或 checklist。
   - 通過：拖曳仍可用，儲存後有移動摘要。
4. 同一會議連續儲存兩次。
   - 通過：既有 activity 不重複 append。
5. 發布後重新開啟紀錄。
   - 通過：activity 文字與 task chip token 可讀，相關任務包含該紀錄。
