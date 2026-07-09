# QC-DEV-011-012 正式環境 AI 會議紀錄 smoke 驗證報告

日期：2026-06-09
狀態：Backend Pass / Production Release Deployed / Production UI Smoke Passed
對應 DEV：DEV-011、DEV-012
正式前端：`https://projed-cc78d.web.app`
正式 Supabase project：`knodlkxqpcqyrtgwpdst`

## 驗證結論

Firebase Hosting 已完成正式部署，Supabase Edge Function `synthesize_meeting_record` 已更新到 version 2 並維持 `verify_jwt=true`。正式 Edge Function 使用一次性 Supabase Auth smoke user 取得 user JWT 後呼叫成功，回傳 `200`，實際模型為 `gemini-3.5-flash`，輸出保留 task tag、使用 numbered heading、沒有 Markdown heading 或「會中變更」等系統語。

完整前端 UI smoke 已於 2026-07-09 依使用者授權改用 production fixture path 執行。第一次實跑揭露正式環境 first-publish 時 `rag_sync_jobs` RLS 要求 record -> document back-reference 先建立；已以 hotfix branch `codex/dev011012-rag-order-hotfix` commit `7704e2f` 修正 `syncRecordRagDocument` write ordering，並透過 deployment-release-gate 部署到 Firebase Hosting。

部署後正式站載入 `assets/index-BkwGqGCZ.js` / `assets/index-BrAYM5iH.css`，post-deploy browser smoke 通過。重跑 `DEV011012_ALLOW_PRODUCTION_FIXTURE=1 npm.cmd run verify:dev-011-012-production-ui-smoke -- --run-production-fixture` 已通過：正式前端完成 meeting mode、AI整理、校稿發布、紀錄庫與任務知識 UI；DB 查證 `published_record_found=true`、`record_task_links=2`、`rag_enabled=true`、`source_document_present=true`；fixture cleanup 回報 `tenantDeleted=true`、`userDeleted=true`。

## 執行項目

```powershell
npm.cmd run build
node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-011-012-production-ui-smoke-readiness
npm.cmd run verify:dev-011-012-production-ui-smoke
$env:DEV011012_ALLOW_PRODUCTION_FIXTURE='1'; npm.cmd run verify:dev-011-012-production-ui-smoke -- --run-production-fixture
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run lint -- --quiet
npx.cmd tsc --noEmit
```

## 實際結果

- Firebase deploy：Pass，Hosting URL `https://projed-cc78d.web.app`。
- Production page HTTP smoke：Pass，`https://projed-cc78d.web.app` 回 `200`。
- Anonymous Edge Function smoke：Pass，未帶 JWT 呼叫 `synthesize_meeting_record` 回 `401`，確認 endpoint 存在且仍要求授權。
- Authenticated Edge Function smoke：Pass，使用一次性 Supabase Auth user 呼叫成功，回 `200`。
- Smoke user cleanup：Pass，測試 user 已刪除。
- Hotfix release：Pass，branch `codex/dev011012-rag-order-hotfix` commit `7704e2f` 已 push 並部署；正式 artifact 為 `assets/index-BkwGqGCZ.js` / `assets/index-BrAYM5iH.css`。
- Post-deploy browser smoke：Pass，`https://projed-cc78d.web.app/` root non-empty、login page visible、無 critical console / pageerror / failed request。
- Production UI smoke readiness gate：Pass，read-only self-check；確認可重用的 authenticated session injection + cleanup pattern、local AI整理 browser ROT coverage，以及 production fixture executor 防呆。
- Production UI smoke guarded executor self-check：Pass，`mutates_database=false`；確認 executor 預設不登入、不建立 production 資料、不呼叫 AI，且完整 fixture path 必須同時使用 `--run-production-fixture` 與 `DEV011012_ALLOW_PRODUCTION_FIXTURE=1`，並包含 cleanup、紀錄庫、任務知識與 `knowledge_records` / `record_task_links` 查證。
- Production UI smoke guarded executor actual fixture：Pass。正式前端已完成 meeting mode、AI整理、校稿發布、紀錄庫與任務知識 UI。
- Production fixture cleanup：Pass。腳本 `finally` 回報 `tenantDeleted=true`、`userDeleted=true`。
- DB proof：Pass，`published_record_found=true`、`record_task_links=2`、`rag_enabled=true`、`source_document_present=true`。
- App-ordering fix：Deployed。`src/services/supabase/projedService.ts` 先回寫 `source_document_id`，再 insert `rag_sync_jobs`；正式站重跑 fixture smoke 已驗證。
- Actual model：`gemini-3.5-flash`。
- `linkedTaskIds`：包含 `list-weekly`、`card-rd`、`req-check`、`write-spec`。
- Content checks：Pass，包含 `1. 本次會議總結`、`2. 任務討論與結論`，保留 `@[週報功能開發](task:list-weekly)` 與 `@[需求確認](task:req-check)`，不含行首 `#`、不含「會中變更」、不含「目前任務狀態」。

## 模型 fallback 修正

首次 production smoke 曾回 `502 MODEL_UNAVAILABLE`，訊息指向 `gemini-3.5-flash`。已修正 Edge Function：

- 預設首選仍為 `gemini-3.5-flash`。
- 未設定 `GEMINI_MEETING_SYNTHESIS_MODEL` 且首選模型 unavailable 時，受控 fallback 到 `gemini-3.1-flash-lite`。
- fallback 會寫入 `warnings`，並回傳實際使用的 `model`，不做 silent fallback。
- 若使用者明確設定 `GEMINI_MEETING_SYNTHESIS_MODEL`，不自動 fallback，保留可理解錯誤讓前端保留原草稿。

本次修正後重跑 production smoke，實際仍使用 `gemini-3.5-flash` 並通過。

## 後續觀察

- 本輪沒有套用 DB policy migration；採用前端 write ordering hotfix 滿足既有 production RLS。
- Production fixture smoke output 曾記錄一筆非 critical `net::ERR_ABORTED` failed request，但 UI、DB proof 與 cleanup 均已通過；後續若重複出現再另開 network cleanup/timing 追蹤。

手機版會議紀錄工作流依使用者決策不列入 release gate。
