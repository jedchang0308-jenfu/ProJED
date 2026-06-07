# PM-DEV-007：會議中原生看板編輯與任務變更紀錄實作報告

狀態：Done
日期：2026-06-06
關聯：DEV-007、SPEC-007、QA-DEV-007

## 交付內容

- 會議模式不再讓 Kanban card / checklist item 點擊直接插入紀錄。
- 明確任務選取模式仍可用於「插入任務」。
- 新增 meeting activity buffer，會議中任務變更會暫存於 record store。
- `useWbsStore` 在 task created / status changed / moved / dates changed / assignee / tags / archive 等更新時通知 meeting activity collector。
- `saveDraft` 前會將尚未附加的 activity 轉成「會議中任務變更」段落並 append 到會議內容。
- activity 使用 `@[title](task:id)` token，因此 `record_task_links` 仍由既有內容同步機制維持。

## 驗證結果

- PASS：`npm.cmd run lint -- --quiet`
- PASS：`npm.cmd run verify:dev-002-records`
- PASS：`npm.cmd run verify:dev-003-record-tags`
- PASS：`npm.cmd run verify:dev-006-gmail-editor`
- PASS：`npm.cmd run verify:dev-007-meeting-activity`
- PASS：`npm.cmd run build`

## Browser 檢查

- PASS：開啟會議後，狀態列顯示「看板維持一般編輯；任務變更會納入紀錄」。
- PASS：舊文案「點議題會插入紀錄」未出現。
- PASS：右側速記欄顯示「本次會議變更」。
- PASS：會議中點擊任務後未插入 task tag，已連結任務仍為 0。

## 殘留風險

- 本次未做完整 browser DnD 自動化；拖曳保留主要由 static verifier、移除 meeting capture disabled 條件與 build/lint 證明。
- 任務變更摘要目前為 MVP 文字摘要，尚未提供逐筆刪除或編輯 activity 的 UI。
- `npm.cmd run build` 仍有既有 large chunk / dynamic import 警告，非本次新增阻塞。
