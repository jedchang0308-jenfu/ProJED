# ProJED Dev Task

Last updated: 2026-05-29

## 總進度

- [x] DEV-BASE-001：Supabase-first ontology collaboration 基礎任務完成
- [x] DEV-INV-001：調整看板團隊 UI 模組命名與資訊架構
- [x] DEV-INV-002：建立 Board-first email invite 資料模型
- [x] DEV-INV-003：實作任意 email 加入看板流程
- [x] DEV-INV-004：建立邀請接受與 Invisible Workspace 自動補齊流程
- [x] DEV-INV-005：實作看板角色獨立分配
- [x] DEV-INV-006：讓指派人名單只連動已加入看板成員
- [x] DEV-INV-007：補齊邀請、撤回、角色變更 audit/activity logging
- [x] DEV-INV-008：建立 QC 驗證腳本與手動驗證清單
- [x] DEV-INV-009：文件化 Invisible Workspace 協作規格
- [ ] DEV-CAL-001：自訂行事曆訂閱外部行事曆與權限異動補驗
- [x] DEV-CAL-002：行事曆訂閱負責人選項對齊任務篩選器
- [x] DEV-UI-001：全系統 UI 繁體中文化盤點與修正
- [x] DEV-UI-002：過濾器新增負責人分類
- [x] DEV-INV-010：看板邀請連結流程提示修正
- [ ] DEV-INV-011：正式站台受邀者端到端邀請驗證
- [x] DEV-HIST-001：既有封存任務風險追蹤

## 目前未通過與阻塞

- [x] `npm.cmd run verify:ontology-collaboration:db` 連到 `ProJED` 時未通過：`rls_write_task:viewer_denied` 預期拒絕或 0 rows，實際 got 1。2026-05-28 已套用 RLS migration 並重跑通過。
- [x] `ProJED` production-like DB 目前只列出 initial、workspace_tags、calendar_subscriptions migration；尚未確認 board-level collaboration RLS、activity/audit logging、board_invites 已套用。2026-05-28 已套用至 `ProJED`。
- [x] `npx.cmd supabase migration list --linked` 因缺少 `SUPABASE_ACCESS_TOKEN` 無法作為 CLI 驗證依據。2026-05-28 已載入本機 token 並成功列出 linked migration history。
- [x] `npx.cmd supabase migration list --linked` 可執行後顯示 Local/Remote migration version 有歷史差異；2026-05-28 已改以補齊本地檔名對齊遠端 migration history，重跑 CLI 顯示 Local/Remote 全數一致。
- [x] `DEV-INV-002/004/005/006/007/008` 的 DB/RLS smoke 與 audit log 驗證仍需可寫入的測試 Supabase project service role。2026-05-28 已以現有 service role 跑嚴格 DB smoke：47 pass、0 pending、0 fail。
- [ ] Outlook Calendar 外部訂閱尚未收到使用者帳號實測回報；Google Calendar / 外部真實帳號訂閱已由使用者於 2026-05-29 回報成功。內部 source gate、DB strict smoke 與 Supabase static check 已重跑通過。
- [ ] `DEV-INV-011` 正式站台受邀者 E2E 尚缺正式站台畫面與真實受邀/非受邀帳號證據；本機程式防呆、邀請 URL base 設定與 source gate 已通過。

## 來源盤點

已統整來源：

- `.ai-docs/invisible-workspace-email-invite-dev-tasks.md`
- `.ai-docs/ontology-collaboration-dev-tasks.md`
- `.ai-docs/ontology-collaboration-dev-001-qa-plan.md`
- `.ai-docs/ontology-collaboration-dev-002-qa-plan.md`
- `.ai-docs/ontology-collaboration-dev-003-qa-plan.md`
- `.ai-docs/ontology-collaboration-dev-004-qa-plan.md`
- `.ai-docs/ontology-collaboration-dev-005-qa-plan.md`
- `.ai-docs/ontology-collaboration-dev-006-qa-plan.md`
- `.ai-docs/ontology-collaboration-dev-007-qa-plan.md`
- `.ai-docs/ontology-collaboration-dev-008-qa-plan.md`
- `.ai-docs/ontology-collaboration-dev-009-qa-plan.md`
- `ai-doc/custom-calendar-subscription-dev-plan.md`
- `ai-doc/custom-calendar-subscription-qa-plan.md`
- `ai-doc/custom-calendar-subscription-qc-result-20260526.md`

既有封存來源納入風險追蹤：

- `.ai-docs/archive/11_SUPABASE_GEMINI_MIGRATION_TASK.md`
- `.ai-docs/archive/03_VALIDATION_PLAN.md`

## DEV-BASE-001：Supabase-first ontology collaboration 基礎任務完成

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 任務清單

- [x] DEV-001：建立 Supabase-first 協作資料模型基準
- [x] DEV-002：建立 member service 與 member store
- [x] DEV-003：補齊任務指派持久化
- [x] DEV-004：實作 Board-level RLS 與 role write policy
- [x] DEV-005：實作 Role-aware UI Guard
- [x] DEV-006：建立 Activity / Audit event logging
- [x] DEV-007：建立協作權限 QC 驗證腳本與測試資料
- [x] DEV-008：文件化 Ontology/Trello 協作規格

## 驗證紀錄

- [x] `ProJED_TEST` DB smoke 曾通過 RLS read/write、assignment、activity/audit、service_role cases。
- [x] DEV-001 至 DEV-008 QA plan 均已有通過紀錄。
- [x] production-like `ProJED` 仍需重新套用或確認同等 migration，避免 `ProJED_TEST` 通過但 `ProJED` RLS 落後。

## DEV-INV-001：調整看板團隊 UI 模組命名與資訊架構

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] 看板團隊面板只出現 `加入看板`、`看板角色`、`角色權限說明` 三個模組。
- [x] 使用者不會在主要流程看到「先加入 Workspace」的操作要求。
- [x] `角色權限說明` 明確呈現為說明用途，不像可編輯設定頁。
- [x] viewer 無法操作加入與角色調整，但仍可查看權限說明。

## DEV-INV-002：建立 Board-first email invite 資料模型

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] Supabase migration 可重複套用於測試環境。
- [x] Owner/admin/project_manager 可建立 board invite。
- [x] Viewer/member 不可建立 board invite。
- [x] 同一看板同一 email 不會產生多筆 pending invite。
- [x] `default_role` 預設為 `member`。

## QC 檢查項

- [x] migration SQL 通過靜態檢查。
- [x] RLS smoke 覆蓋 owner/admin/project_manager/member/viewer/非成員。
- [x] revoked invite 不可被接受。
- [x] expired invite 不可被接受。
- [x] service role 可執行必要管理操作。

## DEV-INV-003：實作任意 email 加入看板流程

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] Owner/admin/project_manager 可輸入任意 email 建立 pending invite。
- [x] Viewer/member 無法建立 pending invite。
- [x] 邀請時沒有 role selector。
- [x] pending invite 顯示在 `加入看板` 模組。
- [x] revoke 後邀請狀態改為 `revoked`，不可再接受。
- [x] pending email 不會出現在右鍵指派人二層選單。

## DEV-INV-004：建立邀請接受與 Invisible Workspace 自動補齊流程

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] 已存在帳號接受邀請後可進入看板。
- [x] 不存在帳號完成註冊/登入後可進入看板。
- [x] 系統自動建立或補齊 `tenant_members`。
- [x] 系統自動建立 `project_members`。
- [x] 預設 Board role 為 `member`。
- [x] accepted invite 不可再次接受。

## QC 檢查項

- [x] existing user invite acceptance。
- [x] new user invite acceptance。
- [x] revoked invite acceptance 被拒絕。
- [x] expired invite acceptance 被拒絕。
- [x] accepted user 出現在看板成員與指派人名單。
- [x] 非受邀 email 不可接受該 invite。

## DEV-INV-005：實作看板角色獨立分配

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] 邀請流程不需要選角色。
- [x] 角色只能在 `看板角色` 模組調整。
- [x] 角色調整後 UI guard 立即依新角色生效。
- [x] Viewer/member 不可調整看板角色。
- [x] 不可移除或降級最後一位 owner。

## QC 檢查項

- [x] Owner 可調整 member 至 viewer。
- [x] Project manager 可依 policy 管理允許範圍內的成員。
- [x] Viewer 無法調整任何 role。
- [x] 角色變更後重新整理仍保留。
- [x] 角色變更寫入 audit log。

## DEV-INV-006：讓指派人名單只連動已加入看板成員

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] accepted board member 會出現在右鍵指派名單。
- [x] pending invite 不會出現在右鍵指派名單。
- [x] Workspace-only member 不會出現在右鍵指派名單。
- [x] 被移出看板後不再可被新指派。
- [x] 已離開但曾被指派者有一致顯示策略，不造成空白或 crash。

## QC 檢查項

- [x] 邀請 accepted 前後指派名單變化正確。
- [x] revoke invite 不影響既有 accepted members。
- [x] remove board member 後指派名單更新。
- [x] 重整頁面後指派名單仍正確。
- [x] Supabase realtime 或資料 reload 後狀態一致。

## DEV-INV-007：補齊邀請、撤回、角色變更 audit/activity logging

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] 邀請建立會寫入 audit log。
- [x] 邀請撤回會寫入 audit log。
- [x] 邀請接受會寫入 audit log。
- [x] 角色變更會寫入 audit log。
- [x] 任務指派會寫入 activity event。
- [x] log 失敗不應中斷主要操作，但需要可觀測錯誤。

## QC 檢查項

- [x] Owner invite log 正確。
- [x] Viewer invite 被拒絕且不可寫入成功 log。
- [x] Role change before/after 正確。
- [x] Remove member target 正確。
- [x] Activity event 與 audit log 分流正確。

## DEV-INV-008：建立 QC 驗證腳本與手動驗證清單

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] QC 可重複驗證 owner/admin/project_manager/member/viewer/非成員。
- [x] QC 可驗證 pending invite 不進指派名單。
- [x] QC 可驗證 accepted invite 進指派名單。
- [x] QC 可驗證 viewer UI disabled 且後端拒絕。
- [x] QC 可驗證 audit/activity log。

## QC 檢查項

- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 無 error。
- [x] `npm.cmd run build:test` 通過。
- [x] `npm.cmd run verify:ontology-collaboration` 通過。
- [x] Supabase DB smoke 在有 service role key 時通過。
- [x] Browser owner flow 通過。
- [x] Browser viewer flow 通過。

## DEV-INV-009：文件化 Invisible Workspace 協作規格

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 驗收條件

- [x] RD 可依文件判斷 invite/member/role/assignee 邊界。
- [x] QA 可依文件制定驗證計畫。
- [x] QC 可依文件判定功能是否符合 Board-first 原則。
- [x] 文件明確寫出 Workspace 是 invisible data boundary，不是主要 UI 概念。

## DEV-CAL-001：自訂行事曆訂閱外部行事曆與權限異動補驗

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [ ] 完成

## 已完成項目

- [x] Supabase migration 已新增 `calendar_subscriptions`、RLS、token hash、篩選條件驗證、索引。
- [x] iCal feed Edge Function 已新增 `calendar-feed`，輸出 `text/calendar`。
- [x] 前端訂閱管理 UI 已支援建立、修改、停用、啟用、重生與複製連結。
- [x] 負責人「我」與「指定某人」已支援，指定某人限 owner/admin/project_manager。
- [x] 多工作區、開始日、到期日與完整 VCALENDAR 產生器自動化驗證已完成。
- [x] Edge Function 已部署至 `ProJED_TEST` staging，公開 `.ics` runtime 驗證曾回 `200 OK` / 無效 token `404` / 停用 token `410`。
- [x] `calendar-feed` runtime 已修正 UUID `UID` 折行與大量資料上限警告，`ProJED_TEST` 已部署 version 2。
- [x] `src/components/CalendarSubscriptionsView.tsx` 已補充外部行事曆會依各自週期抓取，更新不會即時出現。
- [x] 快速建立、快速重生、多分頁訂閱狀態一致性與建立中切換頁面已用 staging UI smoke 驗證。
- [x] 已建立外部手動驗證用 staging `.ics` URL，內容含 2 個 `VEVENT`，可用於 Google Calendar / Outlook Calendar 訂閱實測。

## 外部手動驗證入口

- 測試 URL：https://fhisnnufoeulxqrchldf.supabase.co/functions/v1/calendar-feed/qc-ext-cal-2026-05-28-siWoLzxlO4-QfPcUl4QOdCyk.ics
- 預期行事曆名稱：`QC external calendar manual test 2026-05-28`
- 預期事件：
  - `2026-06-01`：`[開始] 我的工作區 - QC 外部行事曆驗證事件 2026-05-28`
  - `2026-06-03`：`[到期] 我的工作區 - QC 外部行事曆驗證事件 2026-05-28`
- QC 已用 HTTP 驗證：`200 OK`、`Content-Type: text/calendar; charset=utf-8`、`BEGIN:VCALENDAR`、2 個 `BEGIN:VEVENT`。
- 2026-05-29 QC 複查：`calendar_subscriptions.last_accessed_at` 仍停在 2026-05-28 QC HTTP 驗證時間；Edge Function 近 24 小時 logs 未見該手動驗證 URL 的新外部讀取紀錄。
- 2026-05-29 QC 第 2 輪複查：測試訂閱仍 active，`last_accessed_at` 仍為 2026-05-28 10:52:52 UTC；Edge Function logs 中該手動驗證 URL 最新紀錄仍停在 2026-05-28 QC 讀取。
- 2026-05-29 QC 第 3 輪複查：測試訂閱仍 active，`last_accessed_at` 仍為 2026-05-28 10:52:52 UTC；Edge Function logs 仍無該手動驗證 URL 的新增讀取。已達 resumed blocker audit 第 3 輪。
- 2026-05-29 使用者回報 Google Calendar 初測：行事曆清單已出現訂閱行事曆，但任務 `新型是否領證確認-DL 6/17` 未出現在 Google Calendar。QC 查正式 `ProJED`：該任務 `end_date=2026-05-29`、`assignee_id=null`；目前 active 訂閱 `JED個人工作區` 的 `filters_json.assignee.type=me`、`date_types=[due_date]`。依 QA 文件「無負責人任務不應出現在負責人訂閱」，此筆未出現是篩選條件不符合，不是 Google Calendar 或 ICS 格式錯誤。
- 2026-05-29 使用者回報「外部行事曆真實帳號訂閱實測」成功；此回報補足 Google Calendar / 外部真實帳號訂閱證據。未明確回報 Outlook Calendar，故 Outlook 項目維持待補驗。
- 2026-05-29 QC 第 4 輪複查：staging `.ics` URL 仍可公開讀取，HTTP `200`、`Content-Type: text/calendar; charset=utf-8`、`BEGIN:VEVENT` 數量為 2；以 Outlook 風格 User-Agent 讀取同 URL 亦回 `200`，且包含行事曆名稱、`DTSTART;VALUE=DATE:20260601` 與 `DTSTART;VALUE=DATE:20260603`。此證據可證明 feed 對 Outlook 類客戶端可讀，但不可取代 Outlook 真實帳號訂閱畫面驗證，因此 Outlook Calendar 實測仍未勾。
- 2026-05-29 completion audit：目前未勾項僅剩 Outlook Calendar 真實帳號訂閱畫面驗證與其出貨門檻。可自動驗證範圍已覆蓋 HTTP `200`、`text/calendar`、2 個 `VEVENT`、Outlook 風格 User-Agent 可讀、`verify:source` 通過與本機測試頁持久執行；仍缺外部 Outlook 帳號實際訂閱畫面證據，無法由本機程式替代。
- 2026-05-29 QC 第 5 輪複查：以 Outlook 風格 User-Agent 讀取 staging `.ics` URL 回 `200`、`Content-Type: text/calendar; charset=utf-8`、`VEVENT=2`，且包含行事曆名稱與 `2026-06-01` / `2026-06-03` 日期；此仍只能證明 feed 可讀，不能取代 Outlook 真實帳號訂閱畫面驗證。

## 待補驗項目

- [x] Google Calendar 實測：使用 staging `.ics` URL 訂閱並確認事件顯示。2026-05-29 使用者回報外部行事曆真實帳號訂閱實測成功。
- [ ] Outlook Calendar 實測：使用 staging `.ics` URL 訂閱並確認事件顯示。
- [x] 權限異動後 feed 內容會正確縮減。
- [x] 大量資料極限測試：至少覆蓋大量任務、line folding、事件數上限與不 500。
- [x] 快速操作與併發測試：快速建立、快速重生、建立中切換頁面、多裝置狀態一致。
- [x] 邊界輸入測試：未選工作區、未選日期、空白名稱、非法 workspace id、非法 filters_json、特殊 token。
- [x] 權限異動壓力測試：讀取同時移除成員、降權、任務轉移負責人、刪除工作區、刪除任務。
- [x] 回歸測試：WBS、看板、甘特圖、月曆、登入登出、local-test fallback 不受影響。
- [ ] 出貨門檻：內部 gate 已通過（所有已知 P0/P1 bug 修復、權限 smoke 47 pass、TypeScript/build/Supabase static check 通過）；Google Calendar / 外部真實帳號訂閱已由使用者回報成功，仍等待 Outlook Calendar 實測或明確列為已知限制。
- [x] 使用者文件補充外部行事曆同步非即時。

## Outlook Calendar 待使用者補驗步驟

測試 URL：

```text
https://fhisnnufoeulxqrchldf.supabase.co/functions/v1/calendar-feed/qc-ext-cal-2026-05-28-siWoLzxlO4-QfPcUl4QOdCyk.ics
```

1. 開啟 Outlook 網頁版行事曆。
2. 點選「新增行事曆」。
3. 選擇「從網際網路訂閱」或「從 Web 訂閱」。
4. 貼上上方 `.ics` 測試 URL。
5. 行事曆名稱建議填入：`QC external calendar manual test 2026-05-28`。
6. 儲存訂閱後，切到 2026-06-01 至 2026-06-03。
7. 驗證是否出現下列事件：
   - `2026-06-01`：`[開始] 我的工作區 - QC 外部行事曆驗證事件 2026-05-28`
   - `2026-06-03`：`[到期] 我的工作區 - QC 外部行事曆驗證事件 2026-05-28`
8. 若沒有立即出現，等待 Outlook 外部訂閱同步週期後再重新整理；外部行事曆同步不是即時。
9. 回報結果時請提供：
   - Outlook 是否成功新增訂閱行事曆。
   - 2026-06-01 與 2026-06-03 是否看到預期事件。
   - 若失敗，提供 Outlook 顯示的錯誤訊息或截圖。

判定規則：

- 兩個預期事件皆出現：可勾選 Outlook Calendar 實測與 DEV-CAL 出貨門檻。
- 可新增訂閱但事件尚未出現：先列為外部同步延遲，等待同步週期後複查。
- 無法新增訂閱或格式錯誤：回到 RD 修正 calendar-feed 相容性。

## DEV-CAL-002：行事曆訂閱負責人選項對齊任務篩選器

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## RD 執行項目

- [x] 將行事曆訂閱設定的「負責人」由「我 / 指定某人」改為與任務篩選器一致的「未指派 + 成員」chip 選項。
- [x] 保留舊訂閱 `{ type: 'me' }` / `{ type: 'user' }` 相容讀取，新增 `{ type: 'selected', user_ids, include_unassigned }` 儲存格式。
- [x] 更新 Supabase RLS filter validator，允許管理角色訂閱未指派或多位負責人，非管理角色仍只能訂閱自己的任務。
- [x] 更新 `calendar-feed` Edge Function，支援多負責人與未指派任務查詢，並在 ICS description 顯示每筆任務實際負責人。
- [x] 補強 ICS 驗證腳本，覆蓋未指派任務輸出 `負責人: 未指派`。

## QA 驗證計畫

- [x] 驗證行事曆訂閱表單不再出現舊的 radio/select 負責人 UI。
- [x] 驗證可選項包含「未指派」與所選工作區共同成員。
- [x] 驗證非管理角色不能訂閱未指派或他人任務，管理角色可訂閱未指派與多位負責人。
- [x] 驗證舊訂閱格式仍可描述、編輯與輸出，不造成既有訂閱失效。
- [x] 驗證 ICS 產生器可正確輸出未指派任務負責人標籤。
- [x] 驗證 build/source gate 不被破壞。

## QC 驗證結果

- [x] `rg` 靜態檢查通過：行事曆訂閱表單已無 `指定某人` / `type="radio"`，並存在 `未指派`、`user_ids`、`include_unassigned`。
- [x] `cmd /c npm run build` 通過，僅保留既有 chunk size / dynamic import 警告。
- [x] `cmd /c npm run verify:calendar-feed-ics` 通過。
- [x] `cmd /c npm run verify:source` 通過：lint 0 errors / 70 warnings、typecheck、build、Supabase static、calendar ICS、core regression static、P9 edge static 皆通過。
- [x] 本機測試伺服器狀態確認為 `RUNNING http://127.0.0.1:4173/`。

## DEV-UI-001：全系統 UI 繁體中文化盤點與修正

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## RD 執行項目

- [x] 將 HTML 語系改為 `zh-Hant`。
- [x] 登入頁、內建瀏覽器提示、測試帳號面板、資料升級提示改為繁體中文。
- [x] 看板成員邀請面板將 `Email` UI 文案改為「電子郵件」，並保留不誤導寄信狀態的邀請連結提示。
- [x] 行事曆訂閱頁將 `iCal`、`Edge Function`、角色代碼提示改成繁體中文說明。
- [x] 頂部工具列與 RAG 側欄將 `AI 助手` 改為「智慧助理」。
- [x] 匯入匯出、里程碑標籤、篩選列、遷移預設名稱與錯誤提示改為繁體中文。
- [x] 本機測試資料的欄位名稱與測試任務標題改為繁體中文。
- [x] 保留必要品牌、技術名詞與格式識別：`ProJED`、`Google`、`Supabase`、`Gemini`、`.ics`、`wbs-1.0`。

## QA 驗證計畫

- [x] 靜態掃描 UI 可見字串，確認英文殘留僅為品牌、技術識別、CSS class、變數名、註解或非畫面文字。
- [x] 建置驗證：確認繁體中文化不破壞前端 build。
- [x] 行事曆訂閱、成員面板、登入頁、智慧助理與任務清單文案列為高風險畫面，需優先檢查。
- [x] 不將資料欄位、權限代碼、API 名稱、環境變數與資料庫 schema 改名，避免破壞相容性。

## QC 驗證結果

- [x] `cmd /c npm run build` 通過。
- [x] `cmd /c npm run verify:source` 通過：lint 0 errors / 70 warnings、typecheck、build、Supabase static、calendar ICS、core regression static、P9 edge static 皆通過。
- [x] UI 字串抽取掃描完成；剩餘英文皆屬保留項或非 UI 顯示內容。
- [x] 測試伺服器狀態已確認：`http://127.0.0.1:4173/` 為 RUNNING，且 Windows Startup 持久啟動腳本已安裝。
- [x] 未新增 P0/P1 問題；建置僅保留既有 chunk size / dynamic import 警告。

## DEV-INV-010：看板邀請連結流程提示修正

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## RD 執行項目

- [x] 將看板權限面板第一個分頁從「電子郵件邀請」改為「邀請連結」，避免誤認系統會自動寄信。
- [x] 建立邀請後的成功訊息改為提醒使用者複製連結後自行傳給對方。
- [x] 待處理邀請補上接受入口提示：新建立邀請可點右側連結圖示複製；若連結已無法查回，需撤回後重新建立。
- [x] 接受邀請時若登入帳號 email 不符，錯誤訊息改為引導登出、改用受邀信箱登入並重新開啟邀請連結。
- [x] 本機測試環境開啟邀請連結時，登入頁提示此畫面只適合測試帳號驗證，真實受邀者應使用正式站台連結。

## QA 驗證計畫

- [x] 檢查邀請建立流程不宣稱已寄出電子郵件。
- [x] 檢查有暫存邀請連結時，待處理邀請列可複製連結。
- [x] 檢查重新整理或非本機建立的 pending invite 不會誤顯可複製，並提示撤回後重新建立。
- [x] 檢查 email 不符的接受邀請錯誤，需明確告知改用受邀信箱登入。
- [x] 檢查 `127.0.0.1` invite token 登入頁不會讓使用者誤判為正式受邀流程。
- [x] 建置驗證：確認 UI 文案修正不破壞前端 build。

## QC 驗證結果

- [x] `cmd /c npm run build` 通過。
- [x] 原始碼檢查確認目前邀請流程只建立 pending invite 與一次性 URL token，沒有串接自動寄信服務。
- [x] 原始碼檢查確認 Supabase RPC 與 local-test service 皆會拒絕非受邀 email，App 端已轉成可執行的繁體中文提示。
- [x] 原始碼檢查確認本機測試 invite token 登入頁會顯示「本機測試邀請連結」警示。

## DEV-UI-002：過濾器新增負責人分類

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## RD 執行項目

- [x] 在全域過濾器狀態新增 `selectedAssigneeIds`，並保存到既有 `projed-filters` localStorage。
- [x] 在過濾器面板新增「負責人」分類，支援多選看板成員與「未指派」。
- [x] 負責人過濾套用到清單、看板、甘特圖、月曆與子任務遞迴。
- [x] 過濾器面板新增最大高度與捲動，避免新增分類後在小視窗溢出。

## QA 驗證計畫

- [x] 驗證未選負責人時顯示全部任務。
- [x] 驗證選擇單一負責人時，只顯示該負責人的任務。
- [x] 驗證選擇「未指派」時，只顯示沒有 `assigneeId` 的任務。
- [x] 驗證多選負責人時，符合任一選項的任務都顯示。
- [x] 驗證清單、看板、甘特圖、月曆使用一致的負責人過濾邏輯。
- [x] 驗證 build/source gate 不被破壞。

## QC 驗證結果

- [x] `rg` 靜態檢查通過：`selectedAssigneeIds`、`matchesAssigneeFilter`、`UNASSIGNED_ASSIGNEE_FILTER`、負責人 UI 與各視圖過濾點皆存在。
- [x] `cmd /c npm run build` 通過。
- [x] `cmd /c npm run verify:source` 通過：lint 0 errors / 70 warnings、typecheck、build、Supabase static、calendar ICS、core regression static、P9 edge static 皆通過。
- [x] 瀏覽器自動化工具目前無法在 workspace 直接載入 Playwright；本輪以靜態命中與 source gate 作為 QC 證據，未宣稱已做視覺點擊驗證。

## DEV-INV-011：正式站台受邀者端到端邀請驗證

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [ ] 完成

## 任務說明

驗證正式站台的 Board-first invite 流程，確認真實受邀者不會看到 `127.0.0.1` 本機測試入口或測試角色帳號，且只有受邀 email 可接受邀請並進入指定看板。

## RD 執行項目

- [x] 若邀請連結可能從本機環境產生，需修正 URL 產生來源與部署環境設定，避免誤傳 `127.0.0.1` 給真實受邀者。
- [x] 若本機 invite token 登入頁顯示測試角色帳號，需補上測試環境警示，避免誤認為正式受邀流程。
- [x] 確認本任務不串接 email provider；若產品要求「真的寄信」，需另開 RD 任務。

## QA 驗證計畫

- [x] QA-INV-011-00：靜態驗證邀請連結可用 `VITE_PROJED_APP_URL` 指定正式站台 base URL；未設定時本機連結需顯示本機測試警示。
- [ ] QA-INV-011-01：管理者在正式站台建立邀請，確認 UI 顯示「邀請連結」且不宣稱已自動寄信。
- [ ] QA-INV-011-02：複製正式站台邀請連結，確認 URL domain 不是 `127.0.0.1`、`localhost` 或本機測試網址，且 query 含 `boardInviteToken`。
- [ ] QA-INV-011-03：受邀者未登入時開啟正式邀請連結，確認登入頁不出現「測試角色帳號」。
- [ ] QA-INV-011-04：受邀者使用受邀 email 登入後，確認系統自動接受邀請並進入指定看板。
- [ ] QA-INV-011-05：使用非受邀 email 開啟同一連結，確認系統拒絕並提示登出後改用受邀信箱登入。
- [ ] QA-INV-011-06：邀請人撤回邀請後，受邀者開啟舊連結應無法加入看板。
- [ ] QA-INV-011-07：邀請已接受後再次開啟同一連結，應不可重複接受或產生重複成員。
- [x] QA-INV-011-08：若使用 `127.0.0.1` invite token 測試，登入頁必須顯示「本機測試邀請連結」警示。

## FMEA 風險

| 風險 | 可能原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| 真實受邀者拿到本機連結 | 邀請人在本機環境複製連結 | 對方無法接受邀請 | 檢查邀請 URL domain | 高 | 正式驗證必須使用正式站台連結 |
| 正式站台顯示測試帳號 | 部署環境仍啟用 local test mode | 使用者選錯帳號 | 截圖登入頁 | 高 | 修正環境變數或顯示條件 |
| email 不符被拒絕但看不懂 | 錯誤訊息太技術性 | 使用者無法完成加入 | 用非受邀帳號開連結 | 高 | 錯誤提示需指示登出並改用受邀信箱 |
| 邀請狀態重複使用 | accepted/revoked 判斷失效 | 成員與權限重複或錯亂 | 重開舊連結 | 高 | 驗證狀態機與成員唯一性 |

## 通過標準

- [ ] 正式受邀者不會看到測試角色帳號。
- [ ] 正式邀請連結不包含 `127.0.0.1` 或 `localhost`。
- [ ] 正確受邀 email 可接受邀請並進入看板。
- [ ] 非受邀 email、已撤回、已接受邀請都不可加入看板。
- [ ] 失敗提示能明確指引下一步。

## 證據收集方式

- [ ] 截圖：正式邀請連結登入頁、接受成功畫面、錯誤提示、看板成員清單。
- [ ] 記錄：邀請 URL domain、受邀 email、實際登入 email、邀請狀態。
- [ ] 如有錯誤：收集 console error、network response、Supabase RPC error message。
- [x] 程式證據：`VITE_PROJED_APP_URL`、`isLocalBoardInviteUrl`、本機測試警示與 build/source gate 結果。

## QC 驗證結果

- [x] `rg` 靜態檢查通過：`VITE_PROJED_APP_URL`、`isLocalBoardInviteUrl`、本機測試 invite token 警示與「請勿傳給真實受邀者」提示皆存在。
- [x] `cmd /c npm run build` 通過。
- [x] `cmd /c npm run verify:source` 通過：lint 0 errors / 70 warnings、typecheck、build、Supabase static、calendar ICS、core regression static、P9 edge static 皆通過。
- [ ] 待 QC 執行正式站台 invite E2E。
- [ ] 待 QC 補上實測截圖與判定。

## DEV-HIST-001：既有封存任務風險追蹤

## 進度

- [x] 待辦
- [x] 進行中
- [x] 待驗證
- [x] 完成

## 追蹤項目

- [x] `.ai-docs/archive/11_SUPABASE_GEMINI_MIGRATION_TASK.md` 風險：P8 cannot be signed off without real Supabase runtime credentials。
- [x] `.ai-docs/archive/11_SUPABASE_GEMINI_MIGRATION_TASK.md` 風險：Browser OAuth smoke must be performed in a real browser。
- [x] `.ai-docs/archive/11_SUPABASE_GEMINI_MIGRATION_TASK.md` 風險：Credential rotation evidence is weaker if old credentials are unavailable and only manual confirmation is used。
- [x] `.ai-docs/archive/11_SUPABASE_GEMINI_MIGRATION_TASK.md` 風險：RAG APIs must not expose raw cross-tenant table access。
- [x] `.ai-docs/archive/11_SUPABASE_GEMINI_MIGRATION_TASK.md` 風險：Embedding writes must remain service-role-only or otherwise tightly controlled。
- [x] `.ai-docs/archive/11_SUPABASE_GEMINI_MIGRATION_TASK.md` 風險：Gemini integration must preserve citation traceability back to ProJED records。
- [x] `.ai-docs/archive/03_VALIDATION_PLAN.md` 舊核心驗證清單：拖曳防護、資料連動、UI/UX 穩定性仍作為回歸風險參考。

## 封存規則

- 原任務檔與 QA/QC 計畫檔只封存，不刪除。
- 若封存來源內仍有未勾選項，後續 RD/QA/QC 必須先判定是否仍有效；未確認前不可移除。
- 本檔為唯一 active dev task 入口；封存檔僅作追溯與原文保留。

## 變更紀錄

- 2026-05-28：盤點 `.ai-docs` 與 `ai-doc` 任務/QA/QC 檔，統整 active 任務至 `.ai-docs/dev_task.md`。
- 2026-05-28：RD 套用 `ProJED` migrations：`board_level_collaboration_rls`、`activity_audit_logging`、`board_invites`、`board_invite_security_advisor_fixes`。QA 驗證計畫：migration history、policy/function/grant 狀態、嚴格 DB smoke、Supabase advisors、static/type/build/lint/source gate。QC 結果：`verify:ontology-collaboration:db` 47 pass / 0 pending / 0 fail；`verify:source` 通過；`lint` 0 error / 72 existing warnings；DEV-INV-002/004/005/006/007/008 完成。
- 2026-05-28：RD 修正 `calendar-feed` UUID `UID` 折行與大量資料上限警告，補 `verify:calendar-feed-ics` 覆蓋 UUID/1000 筆 limit feed，並於 `ProJED_TEST` 部署 Edge Function version 2。QC 結果：staging `.ics` main/other/special/disabled/expired/large/invalid token 覆蓋，large feed 1000 events + warning、全行 <= 75 octets；權限移除、降權、任務轉移、刪除任務、刪除工作區皆使 feed 縮減且不 500；UI smoke 確認非即時同步提示可見且無 console error；`verify:source` 通過。
- 2026-05-28：QC 補測 calendar boundary 與快速操作：DB `calendar_subscription_filter_allowed` 驗證 valid=true，empty workspace/date types、invalid workspace/date type、non-object filters=false；table constraints 確認空白名稱與 filters_json object；特殊 token runtime 回 404；staging UI 建立訂閱、重生連結、第二分頁讀取一致通過並清理 QC 訂閱。
- 2026-05-28：QC 以本機 `SUPABASE_ACCESS_TOKEN` 成功執行 `npx.cmd supabase migration list --linked`；確認原「缺 token」阻塞解除，但 CLI 顯示 Local/Remote migration version 仍有歷史差異，暫列待判定風險。
- 2026-05-28：QC 執行 `npm.cmd run verify:supabase:p8-production-readiness` 通過：P8 preflight、P7 release gate strict、credential rotation strict、browser smoke residual check 皆 pass；`npm.cmd run verify:p9-rag-local` 通過，並結合 linked RLS/RAG smoke、`verify:p9-edge-function` static check 確認 RAG cross-tenant、service-role embedding write 與 citation traceability 風險已處理。
- 2026-05-28：QC 反查 `ProJED` 遠端 RPC 發現 `match_project_knowledge` 仍缺 `source_table/source_id/source_type`；RD 套用 `p9_match_project_knowledge_v2` 並補 revoke `public/anon` execute。QC 驗證遠端函式回傳型別已含 citation 欄位，routine privileges 僅 `authenticated/postgres/service_role` 可 execute，security advisor 不再列出 `match_project_knowledge` anon executable warning。
- 2026-05-28：RD 依舊核心驗證清單修正觸控拖曳門檻為 250ms/8px、IME 組字期間 Enter/Escape 不提交、手機 coarse pointer 禁用甘特拖曳、SharedTaskSidebar level 缺值不再產生 `paddingLeft: NaN`；新增 `verify:core-regression-static` 並納入 `verify:source`。QC 結果：`verify:source` 通過、core static 10 checks pass、local-test browser smoke 覆蓋登入/登出、WBS/看板/甘特圖/月曆切換且 console 0 errors。
- 2026-05-28：QC 補測 DEV-CAL 快速操作缺口：在 `ProJED_TEST` Supabase UI 建立 `QC switch create 1779964750416` 後立即切換看板再返回訂閱頁，訂閱仍可見、console 0 errors；DB 查得 filters_json 為 object 且包含 workspace/date_types/assignee，測後已刪除 QC 訂閱。
- 2026-05-28：RD 將本地 Supabase migration 檔名對齊 `ProJED` 遠端 migration history，補 `20260528102209_p9_match_project_knowledge_revoke_anon_execute.sql`；QC 重跑 `npx.cmd supabase migration list --linked`，Local/Remote 版本全數一致，migration drift 阻塞解除。
- 2026-05-28：QC 重跑 `npm.cmd run verify:source` 通過（lint 0 errors / 72 existing warnings、typecheck、build、Supabase static、calendar ICS、core regression、P9 edge static）；重跑 `npm.cmd run verify:ontology-collaboration:db` 通過 47 pass / 0 pending / 0 fail。依封存 QA 出貨門檻，Google Calendar / Outlook Calendar 外部帳號實測仍未完成，故 DEV-CAL 與出貨門檻維持未勾。
- 2026-05-28：RD 在 `ProJED_TEST` 建立外部手動驗證用測試任務與 calendar subscription；QC 直接讀取 staging `.ics` URL 通過，回 `200 OK`、`text/calendar` 且含 2 個事件。剩餘缺口仍為使用者登入 Google Calendar / Outlook Calendar 後訂閱該 URL 並回報事件是否顯示。
- 2026-05-29：QC 查 `ProJED_TEST` 測試訂閱與 Edge Function logs；測試訂閱仍 active，`last_accessed_at` 未晚於 2026-05-28 QC HTTP 驗證時間，logs 未見該手動驗證 URL 的新外部讀取紀錄。Google Calendar / Outlook Calendar 外部實測維持未完成。
- 2026-05-29：QC 第 2 輪複查 `ProJED_TEST` 測試訂閱與 Edge Function logs；外部手動驗證 URL 無新增讀取證據，Google Calendar / Outlook Calendar 實測仍無法勾選。
- 2026-05-29：QC 第 3 輪複查 `ProJED_TEST` 測試訂閱與 Edge Function logs；同一外部實測阻塞已連續三輪重現，需使用者或外部帳號完成 Google Calendar / Outlook Calendar 訂閱後回報結果。
- 2026-05-29：使用者提供 Google Calendar 初測截圖，確認訂閱行事曆已出現在清單；目標任務 `新型是否領證確認-DL 6/17` 未顯示。QC 查正式 `ProJED` 任務與訂閱資料，確認該任務未指派負責人，而訂閱條件為「負責人：我」；直接讀取正式 calendar-feed URL 回 `200 text/calendar` 但 `VEVENT=0`。判定：目前 Google 訂閱可讀取，但該任務不符合訂閱篩選條件。若要讓此任務進入目前訂閱，需將任務負責人指派給訂閱 owner，或新增支援「全部任務 / 未指派任務」的產品需求。
- 2026-05-29：使用者回報「外部行事曆真實帳號訂閱實測」成功。QA/QC 進度更新：Google Calendar / 外部真實帳號訂閱項目打勾；Outlook Calendar 因未被明確回報，維持待補驗。
- 2026-05-29：RD 盤點並修正全系統 UI 英文文案，完成登入頁、成員邀請、行事曆訂閱、頂部工具列、智慧助理、任務匯入匯出、里程碑標籤、測試資料與錯誤提示繁體中文化。QA 以 UI 字串抽取掃描與保留詞規則制定驗證計畫；QC 執行 `cmd /c npm run build` 與 `cmd /c npm run verify:source` 通過，測試伺服器 `http://127.0.0.1:4173/` RUNNING。
- 2026-05-29：QC 第 4 輪複查 DEV-CAL Outlook 缺口：staging `.ics` URL 一般 HTTP 與 Outlook User-Agent 皆回 `200 text/calendar` 且含 2 個事件、行事曆名稱與 2026-06-01 / 2026-06-03 日期；此為 feed 相容性佐證，但仍不能證明 Outlook 真實帳號 UI 訂閱成功，DEV-CAL 與出貨門檻維持未勾。
- 2026-05-29：completion audit 確認全檔唯一未完成項仍是 Outlook Calendar 真實帳號訂閱畫面驗證。此阻塞需外部 Outlook 帳號操作或使用者回報；本機與公開 feed 層面的可驗證項目已完成。
- 2026-05-29：RD 修正看板邀請 UI 誤導點：目前系統不會自動寄信，因此分頁改為「邀請連結」，建立後提示複製連結並自行傳給對方，pending invite 也補上可複製或需撤回重建的操作說明。QC 執行 `cmd /c npm run build` 通過。
- 2026-05-29：RD 補強接受邀請 email 不符錯誤處理，將 local-test「此邀請屬於其他電子郵件地址」與 Supabase `board invite email does not match authenticated user` 轉成登出、改用受邀信箱登入、重新開啟邀請連結的操作提示。QC 執行 `cmd /c npm run build` 通過。
- 2026-05-29：合理性評估：真實受邀者看到 `127.0.0.1` 與測試角色帳號不合理；此畫面只適合本機 QA。RD 在登入頁補上本機測試 invite token 警示，避免將測試帳號流程誤認為正式邀請流程。QC 執行 `cmd /c npm run build` 通過。
- 2026-05-29：QA 依正式受邀者流程加入 `DEV-INV-011` 未完成任務，覆蓋正式站台 invite URL、登入頁是否誤顯測試帳號、正確/錯誤 email 接受結果、撤回與重複接受狀態機、證據收集方式。
- 2026-05-29：RD 為邀請連結新增 `VITE_PROJED_APP_URL` 正式站台 base URL 設定，並在本機邀請連結建立、複製、列表提示中標示「請勿傳給真實受邀者」。QA/QC 驗證靜態檢查、`build` 與 `verify:source` 通過；正式站台真人 E2E 仍待外部畫面證據。
- 2026-05-29：RD 新增過濾器「負責人」分類，支援多選看板成員與未指派任務，並套用於清單、看板、甘特圖、月曆與子任務遞迴。QA/QC 驗證靜態檢查、`build` 與 `verify:source` 通過。
- 2026-05-29：RD 將行事曆訂閱設定「負責人」對齊任務篩選器，支援「未指派 + 成員」chip 選項、多負責人與未指派 ICS 輸出；QA/QC 驗證 `rg` 靜態檢查、`build`、`verify:calendar-feed-ics` 與 `verify:source` 通過。
