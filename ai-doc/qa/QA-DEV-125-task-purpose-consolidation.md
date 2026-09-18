# QA-DEV-125：任務目的欄位統整

## 狀態

`Targeted QA PASS / QC Pending / NOT RELEASED`

## 驗證範圍

驗證 legacy「說明／達到目標／來源 WBS」合併、來源 WBS 與任務標題相同時刪除、非目的備註保留、重複片段去除、編輯後 canonical write-back 與富文字 fallback。測試不會連線或寫入正式資料。

## 執行結果

| Case | 方法 | 結果 |
|---|---|---|
| Q01 legacy split purpose | `npm run verify:dev-125-task-purpose-merge` | PASS |
| Q02 preserve history note | same verifier | PASS |
| Q03 de-duplicate exact fragments | same verifier | PASS |
| Q04 canonical write-back (`detailNotes` + `description`) | same verifier | PASS |
| Q05 rich content projection | same verifier | PASS |
| Q06 source WBS equals title is dropped | same verifier | PASS |
| Q07 source WBS differs from title becomes purpose | same verifier | PASS |
| Q08 type safety | `npx tsc --noEmit` | PASS |
| Q09 targeted lint | `npx eslint src/utils/taskNoteRichContent.ts src/components/TaskDetailsModal.tsx src/components/GoalView.tsx` | PASS |
| Q10 test build | `npm run build:test` | PASS |
| Q11 whitespace | `git diff --check` | PASS |

## Release boundary

本文件只證明本機 candidate 的純函式與編譯／建置契約。正式環境 activation 仍需依 deployment-release-gate 產生 immutable artifact、完成 production smoke，並另行記錄 release evidence。既有資料的一次性整理不屬於本 QA scope。
