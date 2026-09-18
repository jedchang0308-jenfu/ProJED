# QA-DEV-125：任務目的欄位統整

## 狀態

`Targeted QA PASS / Production Smoke PASS / Production Verified`

## 驗證範圍

驗證 legacy「說明／達到目標／來源 WBS」合併、來源 WBS 與任務標題相同時刪除、非目的備註保留、重複片段去除、編輯後 canonical write-back 與富文字 fallback；並記錄正式 candidate／canonical release smoke。測試不執行既有正式資料的一次性整理。

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

### Production release checks

| Case | Evidence | 結果 |
|---|---|---|
| R01 sealed production candidate | `output/release/dev-083/20260918014117-658b30/candidate-evidence.json` | PASS |
| R02 canonical provenance | `output/release/dev-083/20260918014117-658b30/activation-evidence.json` | PASS，45/45 entries |
| R03 canonical browser smoke | same activation evidence | PASS |
| R04 OAuth safe-cancel | same activation evidence | PASS，302，canonical origin |

## Release boundary

本文件已補記正式 candidate／activation smoke；正式 release 詳見 [REL-004](../release/REL-004-DEV-125-20260918.md)。既有資料的一次性整理不屬於本 QA scope。
