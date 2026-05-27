# 自訂行事曆訂閱 QC 驗證結果

驗證日期：2026-05-26  
驗證角色：QA / QC  
驗證範圍：自訂行事曆訂閱第一版實作。

## 1. 總結

| 項目 | 結果 | 說明 |
|---|---|---|
| TypeScript 型別檢查 | PASS | `npx.cmd tsc --noEmit` 通過 |
| ESLint | PASS with warnings | `npm.cmd run lint` 0 error，75 warnings，皆非本次新增檔案造成 |
| 前端 build | PASS | `npm.cmd run build` 通過 |
| 完整 source verification | PASS | `npm.cmd run verify:source` 通過 |
| Supabase static check | PASS | `npm.cmd run verify:supabase:static` 通過 |
| 本機 UI smoke test | PASS | 入口可點、頁面可渲染、非 Supabase 後端提示正常 |
| Supabase CLI migration 實測 | BLOCKED | 本機無 `supabase` CLI |
| Deno / Edge Function compile | BLOCKED | 本機無 `deno` |
| Google Calendar 外部訂閱 | NOT RUN | 尚未部署 Edge Function，無公開 feed URL |
| Outlook Calendar 外部訂閱 | NOT RUN | 尚未部署 Edge Function，無公開 feed URL |

## 2. 已執行自動化檢查

| 指令 | 結果 | 備註 |
|---|---|---|
| `npx.cmd tsc --noEmit` | PASS | 無型別錯誤 |
| `npm.cmd run lint` | PASS with warnings | 0 error，75 warnings |
| `npm.cmd run build` | PASS | Vite build 成功 |
| `npm.cmd run verify:supabase:static` | PASS | Supabase 靜態檢查通過 |
| `npm.cmd run verify:source` | PASS | 全流程通過 |

## 3. Lint 警告判讀

| 分類 | 結果 | QC 判讀 |
|---|---|---|
| 新增檔案 lint error | 無 | 可接受 |
| 新增檔案 lint warning | 無 | 可接受 |
| 既有 warning | 75 個 | 多數為既有 hook dependency、unused import、React purity warning |
| 是否阻擋本功能出貨 | 否 | 但建議另開技術債處理 |

## 4. 本機 UI Smoke Test

測試 URL：`http://127.0.0.1:5173/`

| 測試項目 | 結果 | 說明 |
|---|---|---|
| App 可啟動 | PASS | Vite dev server 正常 |
| 側邊欄有「行事曆訂閱」入口 | PASS | 可見且可點 |
| 點擊後切換至自訂行事曆訂閱頁 | PASS | 標題顯示正常 |
| 非 Supabase 後端提示 | PASS | 顯示「需要 Supabase 後端」提示，不 crash |
| Browser console error | PASS | 未偵測到 console error |

## 5. Supabase / 安全靜態檢查

| 檢查項目 | 結果 | 說明 |
|---|---|---|
| 前端是否暴露 service role | PASS | `src` 無 `SUPABASE_SERVICE_ROLE_KEY` |
| service role 使用位置 | PASS | 只在 `supabase/functions/calendar-feed/index.ts` |
| feed function JWT 設定 | PASS | `supabase/config.toml` 有 `[functions.calendar-feed] verify_jwt = false` |
| token 明文儲存 | PASS | DB schema 只有 `token_hash` |
| RLS 啟用 | PASS | `calendar_subscriptions` 已 enable RLS |
| 使用者只能管理自己的訂閱 | PASS static | policy 限 `owner_user_id = auth.uid()` |
| 指定某人權限限制 | PASS static | 限 `owner/admin/project_manager` |
| 每次 feed 重新檢查權限 | PASS static | Edge Function 讀取時查 `tenant_members` |
| 停用與過期檢查 | PASS static | `is_active` 與 `expires_at` 都有檢查 |
| `last_accessed_at` 更新 | PASS static | feed 讀取後 update |

## 6. 尚未實測項目

| 項目 | 原因 | 出貨前要求 |
|---|---|---|
| `supabase db push` | 本機沒有 Supabase CLI | 必須在具備 CLI 的環境套用 migration |
| `supabase functions serve calendar-feed` | 本機沒有 Supabase CLI / Deno | 必須在 Supabase local 或 staging 測 |
| Edge Function compile | 本機沒有 Deno | 必須在部署前或 CI 補上 |
| Google Calendar 訂閱 | 尚未有公開 feed URL | staging 部署後實測 |
| Outlook Calendar 訂閱 | 尚未有公開 feed URL | staging 部署後實測 |
| 權限異動實測 | 需真實 Supabase 多帳號資料 | staging 補測 |
| 大量資料極限測試 | 需 seed 大量資料 | staging 或 local Supabase 補測 |

## 7. QC 發現與風險

### P1：尚未完成真實 Supabase 執行驗證

目前 migration、Edge Function 只完成靜態驗證。由於本機缺少 `supabase` CLI 與 `deno`，尚未確認：

- SQL migration 實際套用結果
- Edge Function 實際編譯結果
- Edge Function 在 Supabase runtime 的 response header 與 `.ics` 內容

出貨前必須在 Supabase local 或 staging 補測。

### P2：iCal line folding 目前以字元數處理，不是 octet byte 數

狀態：**已由 RD 修正，待 staging runtime 複測。**

Edge Function 已改為用 UTF-8 byte 數進行 line folding，避免中文長標題或長描述因字元數與 byte 數不同而破壞 iCalendar 格式。

建議在極限測試加入：

- 300 字中文標題
- 5,000 字中文描述
- 含逗號、分號、反斜線、換行的內容

### P2：feed 查詢目前限制最多 1,500 筆任務

狀態：**已加明確常數與 ICS warning 標記，產品策略仍需確認。**

Edge Function 有 `FEED_TASK_LIMIT = 1500`，可避免無限制輸出造成 timeout。若查詢達到上限，ICS 會輸出 `X-PROJED-WARNING`，方便 QC 與後續監控判讀。但若工作區任務量很大，較舊但仍有日期的任務可能不出現在 feed。

出貨前需決定產品規則：

- 接受第一版最多 1,500 筆
- 或改成依日期範圍查詢
- 或加入分頁 / 時間窗口策略

### P3：非 Supabase 後端只能顯示提示

目前 local-test / firebase backend 進入頁面會看到提示，不提供完整表單。這符合架構限制，因為 `.ics` feed 需要 Edge Function，但 QA 文件與使用者文件需說明。

## 8. 極限操作驗證狀態

| 類別 | 狀態 | 說明 |
|---|---|---|
| 大量資料 | NOT RUN | 需 Supabase seed 大量 WBS 任務 |
| 快速連點 | NOT RUN | 需 Supabase 後端可建立訂閱 |
| token 重生壓力 | NOT RUN | 需真實 DB |
| 權限異動 | NOT RUN | 需多帳號 / 多工作區 |
| 錯誤 token | NOT RUN | 需 Edge Function running |
| 外部高頻拉取 | NOT RUN | 需 Edge Function running |
| 特殊字元 ICS | NOT RUN | 需 Edge Function running |

## 9. QC 結論

目前狀態：**可進入 staging 驗證，不建議直接 production 出貨。**

原因：

- 前端與靜態檢查已通過
- 本機 UI smoke test 已通過
- 但 Supabase migration、Edge Function、Google / Outlook 訂閱尚未在真實 runtime 驗證

## 10. 出貨前必要補測

| 必要補測 | 完成確認 |
|---|---|
| 在 staging 執行 `supabase db push` | [ ] |
| 部署 `calendar-feed` Edge Function | [ ] |
| 用瀏覽器直接打開 `.ics` URL，確認 status 200 與 `text/calendar` | [ ] |
| Google Calendar 從 URL 訂閱成功 | [ ] |
| Outlook Calendar 從 URL 訂閱成功 | [ ] |
| 停用後舊 URL 回傳 410 | [ ] |
| 重生後舊 URL 回傳 404，新 URL 可用 | [ ] |
| 一般 member 無法指定某人 | [ ] |
| owner/admin/project_manager 可指定某人 | [ ] |
| 使用者被移出工作區後，feed 不再包含該工作區任務 | [ ] |
| 1,000 任務以上 feed 測試不 500 | [ ] |

## 11. QC 複驗紀錄

複驗日期：2026-05-26  
複驗原因：RD 修正 iCal UTF-8 line folding 與 feed 上限標記後，重新執行 QC。

| 項目 | 結果 | 說明 |
|---|---|---|
| TypeScript 型別檢查 | PASS | `npx.cmd tsc --noEmit` 通過 |
| ESLint | PASS with warnings | `npm.cmd run lint` 0 error，75 warnings，仍為既有 warning |
| 前端 build | PASS | `npm.cmd run build` 通過 |
| 完整 source verification | PASS | `npm.cmd run verify:source` 通過 |
| Supabase static check | PASS | `npm.cmd run verify:supabase:static` 通過 |
| UI smoke test | PASS | 行事曆訂閱入口與頁面渲染正常，無 console error |
| iCal UTF-8 folding 自動化檢查 | PASS | `verify:calendar-feed-ics` 已檢查 UTF-8 byte 折行、continuation line、特殊字元 escape 與 all-day 日期 |
| feed 上限標記靜態檢查 | PASS static | 已確認 `FEED_TASK_LIMIT` 與 `X-PROJED-WARNING` 存在 |
| Supabase CLI runtime 驗證 | BLOCKED | 本機仍無 `supabase` CLI |
| Deno compile 驗證 | BLOCKED | 本機仍無 `deno` |

### 複驗結論

RD 已修正 QC 提出的 P2 風險：

- iCal line folding 已改用 UTF-8 byte 數。
- feed 1,500 筆上限已抽成常數，且達上限時輸出 `X-PROJED-WARNING`。

目前 QC 結論維持：**可進 staging 驗證，不建議直接 production 出貨。**

原因是 Supabase migration、Edge Function runtime、Google / Outlook 實際訂閱仍需在 staging 或正式 Supabase 環境驗證。

## 12. RD 補強紀錄

補強日期：2026-05-26  
補強原因：將原本只能靠靜態搜尋判斷的 iCal folding 風險，改成可執行的自動化驗證。

| 項目 | 結果 | 說明 |
|---|---|---|
| iCal helper 拆分 | DONE | 已新增 `supabase/functions/calendar-feed/ics.mjs`，讓 Edge Function 與驗證腳本共用同一份 ICS 邏輯 |
| 自動化驗證腳本 | DONE | 已新增 `scripts/verify-calendar-feed-ics.mjs` |
| UTF-8 byte folding | PASS | 已驗證中文長標題折行後每一實體行不超過 75 octets |
| 特殊字元 escape | PASS | 已驗證 comma、semicolon、backslash、newline escape |
| all-day 日期工具 | PASS | 已驗證日期加一天與 `YYYYMMDD` 轉換 |
| source verification 串接 | PASS | `verify:calendar-feed-ics` 已納入 `npm.cmd run verify:source` |

## 14. RD 再補強紀錄

補強日期：2026-05-26  
補強原因：降低 Edge Function 只能在 Deno/Supabase 環境驗證的風險，先把完整 `.ics` feed 組裝邏輯抽成可本機執行的純函式。

| 項目 | 結果 | 說明 |
|---|---|---|
| 完整 VCALENDAR 組裝函式 | DONE | 已新增 `buildCalendarFeedIcs`，Edge Function 與驗證腳本共用同一份 feed 組裝邏輯 |
| feed 內容驗證 | PASS | 已驗證 `BEGIN:VCALENDAR`、VEVENT 數量、UID、SUMMARY、DESCRIPTION、URL、DTSTART、DTEND、DTSTAMP |
| 中文與特殊字元驗證 | PASS | 完整 feed 每一實體行仍符合 75 octets 限制 |
| feed 上限 warning | PASS | 已驗證達上限時輸出 `X-PROJED-WARNING` |
| 完整 source verification | PASS | `npm.cmd run verify:source` 通過，仍為 0 error / 75 existing warnings |

## 13. QC 再驗證紀錄

驗證日期：2026-05-26  
驗證角色：QC  
驗證原因：RD 補強 iCal helper 自動化驗證後，執行完整 QC 再驗證。

| 項目 | 結果 | 說明 |
|---|---|---|
| 完整 source verification | PASS | `npm.cmd run verify:source` 通過 |
| ESLint | PASS with warnings | 0 error，75 warnings，為既有 warning |
| TypeScript 型別檢查 | PASS | 已包含在 `verify:source` |
| 前端 build | PASS | 已包含在 `verify:source` |
| Supabase static check | PASS | 26 個 migration 必要片段檢查通過 |
| iCal helper 自動化驗證 | PASS | `verify:calendar-feed-ics` 通過 |
| P9 Edge Function 檢查 | PASS | `verify:p9-edge-function` 通過 |
| 本機 UI smoke | PASS | `http://127.0.0.1:5173/` 可開啟，「行事曆訂閱」入口存在，進入後無 console error |
| 非 Supabase fallback | PASS | 目前本機環境顯示「需要 Supabase 後端」，符合未連 Supabase runtime 的預期狀態 |
| Supabase CLI runtime 驗證 | BLOCKED | 本機仍無 `supabase` CLI |
| Deno compile 驗證 | BLOCKED | 本機仍無 `deno` |
| Google Calendar 實際訂閱 | NOT RUN | 需先部署可公開讀取的 `.ics` feed |
| Outlook Calendar 實際訂閱 | NOT RUN | 需先部署可公開讀取的 `.ics` feed |

### 再驗證結論

本輪 QC 判定：**本機可驗證項目通過，可進 staging；仍不建議直接 production 出貨。**

主要阻塞點未變：Supabase migration 實際套用、Edge Function runtime、Google / Outlook 外部訂閱，需要在 staging 或正式 Supabase 環境補測。

## 15. QC 再驗證紀錄：完整 VCALENDAR 產生器

驗證日期：2026-05-26  
驗證角色：QC  
驗證原因：RD 將完整 `.ics` feed 組裝邏輯抽成 `buildCalendarFeedIcs` 後，執行本機可驗證項目。

| 項目 | 結果 | 說明 |
|---|---|---|
| 完整 source verification | PASS | `npm.cmd run verify:source` 通過 |
| iCal / VCALENDAR 自動化驗證 | PASS | `npm.cmd run verify:calendar-feed-ics` 通過 |
| ESLint | PASS with warnings | 0 error，75 warnings，仍為既有 warning |
| TypeScript 型別檢查 | PASS | 已包含在 `verify:source` |
| 前端 build | PASS | 已包含在 `verify:source` |
| Supabase static check | PASS | migration 必要片段檢查通過 |
| P9 Edge Function 檢查 | PASS | `verify:p9-edge-function` 通過 |
| VCALENDAR 結構驗證 | PASS | 已驗證 `BEGIN:VCALENDAR`、`END:VCALENDAR`、VEVENT 數量 |
| VEVENT 欄位驗證 | PASS | 已驗證 `UID`、`SUMMARY`、`DESCRIPTION`、`URL`、`DTSTART`、`DTEND`、`DTSTAMP` |
| 中文與特殊字元驗證 | PASS | 已驗證 UTF-8 75 octets 折行與特殊字元 escape |
| feed 上限 warning | PASS | 已驗證 `X-PROJED-WARNING` |
| 本機 UI smoke | PASS partial | `http://127.0.0.1:5173/` 可開啟，目前 WBS 測試資料畫面可運作且無 console error；本次 DOM 未顯示「行事曆訂閱」側欄入口，需在完整導覽狀態補測 |
| Supabase CLI runtime 驗證 | BLOCKED | 本機仍無 `supabase` CLI |
| Deno compile 驗證 | BLOCKED | 本機仍無 `deno` |
| Google Calendar 實際訂閱 | NOT RUN | 需先部署可公開讀取的 `.ics` feed |
| Outlook Calendar 實際訂閱 | NOT RUN | 需先部署可公開讀取的 `.ics` feed |

### 再驗證結論

本輪 QC 判定：**RD 的完整 VCALENDAR 產生器補強通過本機可驗證項目，可進 staging。**

出貨限制仍未解除：Supabase migration 實際套用、Edge Function Deno runtime、Google / Outlook 外部訂閱仍需在 staging 或正式環境補測。

## 16. RD 阻塞點解除紀錄

執行日期：2026-05-26  
執行角色：RD  
目標：解除先前 QC 標記的 Supabase migration、Edge Function runtime、公開 `.ics` endpoint 阻塞。

| 阻塞點 | 結果 | 說明 |
|---|---|---|
| Supabase 專案選擇 | DONE | 發現 `ProJED` 與 `ProJED_TEST`，本輪只操作 `ProJED_TEST` staging，未動 production |
| Supabase migration 實際套用 | PASS | `calendar_subscriptions` 已套用到 `ProJED_TEST`，資料表、RLS policies、trigger、filter function 已確認存在 |
| 新增函式安全性 | PASS | `calendar_subscription_filter_allowed` 已確認不是 `security definer` |
| RLS init-plan 修正 | PASS | `calendar_subscriptions` policies 已改用 `(select auth.uid())`，重新跑 performance advisor 後不再出現該表的 RLS init-plan warning |
| Edge Function 部署 | PASS | `calendar-feed` 已部署到 `ProJED_TEST`，狀態 `ACTIVE`，`verify_jwt=false` |
| 無效 token runtime | PASS | `/functions/v1/calendar-feed/not-a-real-token.ics` 回 `404 Calendar feed not found` |
| 有效 token runtime | PASS | staging 測試 token 回 `200 OK`、`Content-Type: text/calendar; charset=utf-8`、合法 `BEGIN:VCALENDAR` |
| 停用 token runtime | PASS | `is_active=false` 時回 `410 Calendar feed is disabled`，測完已恢復 active |
| source verification | PASS | `npm.cmd run verify:source` 通過，仍為 0 error / 75 existing warnings |
| Supabase advisors | REVIEWED | 仍有既有 security/performance warnings；本輪新功能直接相關的 RLS init-plan warning 已處理。`calendar_subscriptions_owner_idx` 顯示 unused 屬新表初期正常現象，需有流量後再評估 |
| Google Calendar 實際訂閱 | PENDING USER | 需使用者登入 Google Calendar 後貼上 staging `.ics` URL |
| Outlook Calendar 實際訂閱 | PENDING USER | 需使用者登入 Outlook Calendar 後貼上 staging `.ics` URL |

### Staging 測試 URL

```text
https://fhisnnufoeulxqrchldf.supabase.co/functions/v1/calendar-feed/qc-staging-calendar-token-20260526.ics
```

目前 staging 測試資料庫沒有符合條件的 `wbs_items`，所以 feed 會是空行事曆，但已可驗證外部行事曆是否能成功訂閱 `.ics`。

### Google Calendar 手動驗證步驟

1. 打開 Google Calendar。
2. 左側找到「其他日曆」。
3. 點「+」。
4. 選「透過網址」。
5. 貼上 Staging 測試 URL。
6. 按「新增日曆」。
7. 預期結果：Google Calendar 成功新增一個空白訂閱行事曆，不應出現 URL 無效或無法擷取。

### Outlook Calendar 手動驗證步驟

1. 打開 Outlook Calendar 網頁版。
2. 選「新增行事曆」。
3. 選「從網際網路訂閱」或「Subscribe from web」。
4. 貼上 Staging 測試 URL。
5. 命名為 `ProJED QC staging calendar`。
6. 按「匯入」或「訂閱」。
7. 預期結果：Outlook 成功新增一個空白訂閱行事曆，不應出現 URL 無效或無法擷取。
