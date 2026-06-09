# QC-DEV-011-012 正式環境 AI 會議紀錄 smoke 驗證報告

日期：2026-06-09
狀態：Backend Pass / UI Pending
對應 DEV：DEV-011、DEV-012
正式前端：`https://projed-cc78d.web.app`
正式 Supabase project：`knodlkxqpcqyrtgwpdst`

## 驗證結論

Firebase Hosting 已完成正式部署，Supabase Edge Function `synthesize_meeting_record` 已更新到 version 2 並維持 `verify_jwt=true`。正式 Edge Function 使用一次性 Supabase Auth smoke user 取得 user JWT 後呼叫成功，回傳 `200`，實際模型為 `gemini-3.5-flash`，輸出保留 task tag、使用 numbered heading、沒有 Markdown heading 或「會中變更」等系統語。

完整前端 UI smoke 尚未完成，原因是 production build 使用 Supabase + Google OAuth，未啟用非互動 password login；CLI 無法自動完成「登入正式前端 → 建立會議 → AI整理 → 校稿發布」流程。該項需使用已登入 Google 的互動式 browser QC。

## 執行項目

```powershell
npm.cmd run build
node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive
npm.cmd run verify:dev-011-ai-meeting-synthesis
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

## 待完成

- 使用互動式 Google OAuth browser session 執行完整前端 UI smoke：
  1. 登入正式前端。
  2. 建立或開啟看板。
  3. 開啟 meeting mode。
  4. 輸入會議速記與插入 task tag。
  5. 點 `AI整理`。
  6. 確認右側欄出現 AI 草稿、狀態提示清楚且不遮住看板。
  7. 校稿後發布，確認紀錄庫與任務知識可查到片段。

手機版會議紀錄工作流依使用者決策不列入 release gate。
