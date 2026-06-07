# PM-DEV-009 會議模式任務詳情內快速補記交付報告

日期：2026-06-07
狀態：Done
節點類型：交付點
父交付點：DEV-005 / DEV-007 / DEV-008 follow-up

## 交付目標

會議中使用者可在任務詳情直接補記該任務討論，系統把內容加入目前 meeting draft 並自動連到該任務。

## RD 範圍

- 會議模式下在 `TaskDetailsModal` 顯示「本次會議」快速補記。
- 新增 record store action append 任務討論到 meeting draft。
- 自動插入目前任務 inline tag 並同步 `taskLinks`。
- 不改資料模型。

## QA / QC 證據

- QA 計畫：`ai-doc/qa/QA-DEV-009-meeting-task-detail-quick-note.md`
- 驗證結果：

```powershell
npm.cmd run lint -- --quiet                         # pass
npm.cmd run verify:dev-007-meeting-activity         # pass
npm.cmd run verify:dev-008-task-knowledge           # pass
npm.cmd run verify:dev-009-task-detail-quick-note   # pass
npm.cmd run build                                   # pass, existing chunk warnings only
```

- Playwright UI smoke：固定測試環境開始會議後，任務詳情顯示「本次會議」快速補記；輸入後加入 meeting draft 並清空輸入框。
- 補充決策：手機版不列入會議記錄工作流驗收；既有 mobile smoke 僅作為參考，不作為 release gate。
- QC UX 驗證：Pass，桌機 1440x950 與筆電 1024x768 smoke 均通過，詳見 `ai-doc/qc/QC-DEV-009-meeting-task-detail-quick-note-ux.md`。

## 殘留風險

- 第一版是單段文字快速補記，不提供完整會議紀錄編輯器。
- 目前不做 AI 決議抽取或自動分類。
