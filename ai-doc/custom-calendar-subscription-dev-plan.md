# 自訂行事曆訂閱開發計畫

建立日期：2026-05-26  
目標功能：建立 Trello 類型的 iCal 訂閱功能，支援使用者依「負責人、工作區、日期類型」產生自訂行事曆訂閱連結。  
適用範圍：ProJED 工作區、WBS 任務、開始日、到期日。

## 0. 目前執行狀態

更新日期：2026-05-26

| 項目 | 狀態 | 說明 |
|---|---|---|
| Supabase migration | [x] | 已新增 `calendar_subscriptions`、RLS、token hash、篩選條件驗證、索引 |
| iCal feed Edge Function | [x] | 已新增 `calendar-feed`，輸出 `text/calendar`，並每次讀取重新檢查權限 |
| 前端訂閱管理 UI | [x] | 已新增「行事曆訂閱」入口，可建立、修改、停用、啟用、重生與複製連結 |
| 負責人：我 | [x] | 已支援 |
| 負責人：指定某人 | [x] | 已支援，限 owner / admin / project_manager |
| 多工作區 | [x] | 已支援多選工作區 |
| 日期類型：開始日 / 到期日 | [x] | 已支援單選或複選 |
| Google Calendar 實測 | [ ] | 已取得 staging `.ics` URL，需由使用者登入 Google Calendar 後訂閱 |
| Outlook Calendar 實測 | [ ] | 已取得 staging `.ics` URL，需由使用者登入 Outlook Calendar 後訂閱 |
| Supabase migration 實際套用 | [x] | 已透過 Supabase MCP 套用到 `ProJED_TEST` staging；production 尚未套用 |
| iCal UTF-8 line folding | [x] | 已改用 UTF-8 byte 數折行，降低中文長文字相容性風險 |
| feed 上限標記 | [x] | 已建立 `FEED_TASK_LIMIT` 並在達上限時輸出 `X-PROJED-WARNING` |
| iCal helper 自動化驗證 | [x] | 已新增 `verify:calendar-feed-ics`，並納入 `verify:source` |
| 完整 VCALENDAR 產生器驗證 | [x] | 已將 feed 組裝邏輯抽成純函式，驗證 SUMMARY、DESCRIPTION、URL、DTSTART、DTEND、UID 與 warning |
| Edge Function staging 部署 | [x] | 已部署 `calendar-feed` 到 `ProJED_TEST`，`verify_jwt=false` |
| 公開 `.ics` runtime 驗證 | [x] | staging feed 回 `200 OK` 與 `text/calendar`；無效 token 回 `404`，停用 token 回 `410` |

## 1. 功能定位

本功能不是 Google Calendar / Outlook 的雙向整合，而是「只讀 iCal feed」。

使用者在 ProJED 建立一條訂閱連結後，可以將該連結貼到 Google Calendar、Outlook、Apple Calendar 等外部行事曆。外部行事曆會定期讀取 ProJED 輸出的 `.ics` 內容。

### MVP 篩選條件

| 條件 | 第一版支援內容 | 完成確認 |
|---|---|---|
| 負責人 | 我 | [x] |
| 負責人 | 指定某人 | [x] |
| 工作區 | 可選 A 工作區、B 工作區，支援多選 | [x] |
| 日期類型 | 開始日 | [x] |
| 日期類型 | 到期日 | [x] |
| 日期類型 | 開始日 + 到期日同時訂閱 | [x] |

## 2. 目前系統基礎判讀

依目前專案結構判斷：

| 項目 | 目前狀態 | 對本功能的影響 | 完成確認 |
|---|---|---|---|
| 前端技術 | React + Vite + TypeScript | 可新增訂閱管理 UI | [ ] |
| 資料層 | Supabase 已存在 migrations | 可用 migration 新增訂閱資料表 | [ ] |
| 工作區資料 | Supabase schema 中以 `tenants` 表示工作區 | 訂閱條件中的 workspace 對應 tenant | [ ] |
| 任務資料 | `wbs_items` 已有 `assignee_id`、`start_date`、`end_date` | 可直接產生開始日與到期日事件 | [ ] |
| 日期欄位 | 到期日目前對應 `end_date` | UI 可顯示「到期日」，資料層讀 `end_date` | [ ] |

## 3. 建議資料模型

新增資料表：`calendar_subscriptions`

用途：儲存每位使用者建立的自訂行事曆訂閱條件與安全 token。

```sql
create table public.calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  filters_json jsonb not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### filters_json 格式

訂閱「我的工作」：

```json
{
  "workspace_ids": ["workspace_a", "workspace_b"],
  "assignee": {
    "type": "me"
  },
  "date_types": ["due_date"]
}
```

訂閱「指定某人」：

```json
{
  "workspace_ids": ["workspace_a"],
  "assignee": {
    "type": "user",
    "user_id": "user_123"
  },
  "date_types": ["start_date", "due_date"]
}
```

### 資料表開發任務

| 任務 | 說明 | 驗收標準 | 完成確認 |
|---|---|---|---|
| 建立 migration | 新增 `calendar_subscriptions` 表 | migration 可套用且不影響既有表 | [ ] |
| token 儲存設計 | DB 只存 `token_hash`，不存明文 token | 資料庫外洩時無法直接取得訂閱網址 | [ ] |
| RLS policy | 使用者只能管理自己的訂閱 | 一般使用者不能讀寫他人的訂閱設定 | [ ] |
| service role feed 查詢 | `.ics` feed 可由後端安全查詢 | feed 端點能依 token 找到訂閱設定 | [ ] |
| 索引 | 建立 `token_hash`、`owner_user_id` 索引 | 查詢訂閱不需全表掃描 | [ ] |

## 4. URL 與 API 設計

建議 URL：

```text
/calendar/feed/{token}.ics
```

不建議：

```text
/workspaces/{workspaceId}/calendar/{token}.ics
```

原因：本功能要支援多工作區，token 已代表訂閱條件，不應把單一 workspace 放進 URL 結構。

### API 任務

| API | 用途 | 驗收標準 | 完成確認 |
|---|---|---|---|
| `POST /calendar/subscriptions` | 建立訂閱 | 可儲存名稱、工作區、負責人、日期類型 | [ ] |
| `GET /calendar/subscriptions` | 取得我的訂閱清單 | 只回傳目前登入者自己的訂閱 | [ ] |
| `PATCH /calendar/subscriptions/:id` | 修改訂閱名稱或條件 | 修改後下一次 `.ics` 讀取會反映新條件 | [ ] |
| `POST /calendar/subscriptions/:id/regenerate-token` | 重新產生訂閱連結 | 舊連結立即失效 | [ ] |
| `POST /calendar/subscriptions/:id/disable` | 停用訂閱 | 外部行事曆再讀取時不再取得事件 | [ ] |
| `GET /calendar/feed/:token.ics` | 輸出 iCal feed | Google / Outlook 可訂閱 | [ ] |

## 5. iCal 事件產生規則

### 日期類型對應

| 使用者看到的名稱 | 系統欄位 | 事件標題前綴 | 完成確認 |
|---|---|---|---|
| 開始日 | `wbs_items.start_date` | `[開始]` | [ ] |
| 到期日 | `wbs_items.end_date` | `[到期]` | [ ] |

### 事件內容格式

| 欄位 | 建議內容 | 完成確認 |
|---|---|---|
| `SUMMARY` | `[開始] 工作區名稱 - 任務名稱` 或 `[到期] 工作區名稱 - 任務名稱` | [ ] |
| `DESCRIPTION` | 任務描述、負責人、狀態、所屬看板、ProJED 任務連結 | [ ] |
| `DTSTART` | 開始日或到期日 | [ ] |
| `DTEND` | 日期型事件建議為隔日，符合 iCal all-day event 規則 | [ ] |
| `UID` | 使用任務 id + 日期類型 + 訂閱 id 組成穩定 UID | [ ] |
| `URL` | 回到 ProJED 任務頁 | [ ] |

### 同一任務產生多事件規則

若使用者同時選擇「開始日」與「到期日」：

| 情境 | 系統行為 | 完成確認 |
|---|---|---|
| 任務只有開始日 | 只產生開始事件 | [ ] |
| 任務只有到期日 | 只產生到期事件 | [ ] |
| 任務同時有開始日與到期日 | 產生兩個事件 | [ ] |
| 開始日等於到期日 | 仍產生兩個事件，標題用 `[開始]`、`[到期]` 區分 | [ ] |

## 6. 權限與安全規則

iCal 訂閱 URL 本質上是「知道網址就可讀取」的只讀連結，所以安全設計要放在第一版。

| 安全規則 | 說明 | 驗收標準 | 完成確認 |
|---|---|---|---|
| token 高強度隨機 | token 至少 32 bytes random | 無法猜測 URL | [ ] |
| DB 只存 hash | 明文 token 只在建立或重生時顯示一次 | DB 中看不到可直接使用的 token | [ ] |
| 可停用 | 使用者可停用任何自己的訂閱 | 停用後 feed 回傳空或 404/410 | [ ] |
| 可重生 | 使用者可重新產生 URL | 舊 token 失效，新 token 可用 | [ ] |
| 每次讀取重新驗權 | feed 被讀取時重新檢查 owner 是否仍有工作區權限 | 被移出工作區後不再看到該工作區事件 | [ ] |
| 指定某人權限 | 一般成員不可任意訂閱他人任務，管理者才可指定某人 | 權限不足時前端不可選，後端也拒絕 | [ ] |
| 最後讀取時間 | feed 讀取後更新 `last_accessed_at` | UI 可顯示最後同步時間 | [ ] |

## 7. 前端 UI 計畫

建議新增頁面或設定區塊：`自訂行事曆訂閱`

### UI 元件

| 元件 | 功能 | 完成確認 |
|---|---|---|
| 訂閱清單 | 顯示使用者已建立的訂閱 | [ ] |
| 建立訂閱按鈕 | 開啟建立訂閱表單 | [ ] |
| 訂閱名稱輸入 | 例如「我的兩家公司任務」 | [ ] |
| 工作區多選 | 可選 A 工作區、B 工作區 | [ ] |
| 負責人選擇 | `我` / `指定某人` | [ ] |
| 指定人員選擇器 | 僅管理者可使用 | [ ] |
| 日期類型 checkbox | 開始日、到期日，可複選 | [ ] |
| 複製連結 | 一鍵複製 `.ics` URL | [ ] |
| 停用訂閱 | 停用目前連結 | [ ] |
| 重新產生連結 | 舊連結失效並產生新連結 | [ ] |
| 最後同步時間 | 顯示 `last_accessed_at` | [ ] |

### 前端驗收

| 驗收項目 | 標準 | 完成確認 |
|---|---|---|
| 無工作區時 | 顯示空狀態，不產生無效訂閱 | [ ] |
| 未選日期類型 | 禁止送出 | [ ] |
| 未選工作區 | 禁止送出 | [ ] |
| 選指定某人但無權限 | 前端隱藏或 disabled，後端仍需拒絕 | [ ] |
| 手機版 | 表單不重疊、按鈕文字不溢出 | [ ] |

## 8. 後端查詢邏輯

feed 讀取時建議流程：

```text
1. 接收 token
2. hash token
3. 查 calendar_subscriptions
4. 檢查 is_active / expires_at
5. 讀取 filters_json
6. 重新檢查 owner_user_id 對 workspace_ids 的權限
7. 依 assignee 條件查 wbs_items
8. 依 date_types 產生 iCal events
9. 回傳 text/calendar
10. 更新 last_accessed_at
```

### 查詢任務

| 任務 | 說明 | 完成確認 |
|---|---|---|
| token 驗證 | 無效 token 不回傳資料 | [ ] |
| active 檢查 | 停用訂閱不回傳資料 | [ ] |
| workspace 權限檢查 | 只查使用者仍有權限的工作區 | [ ] |
| assignee = me | 使用 owner_user_id 查任務 | [ ] |
| assignee = user | 使用指定 user_id 查任務，且檢查 owner 權限 | [ ] |
| start_date 查詢 | 只產生有開始日的事件 | [ ] |
| due_date 查詢 | 只產生有到期日的事件 | [ ] |
| 已完成任務策略 | 第一版建議仍顯示，第二版再加狀態篩選 | [ ] |

## 9. 測試計畫

| 測試類型 | 測試內容 | 完成確認 |
|---|---|---|
| 單元測試 | filters_json 驗證 | [ ] |
| 單元測試 | iCal 字串產生器 | [x] |
| 單元測試 | 日期轉 all-day event | [x] |
| 單元測試 | 完整 VCALENDAR feed 產生 | [x] |
| 權限測試 | A 使用者不可讀 B 使用者訂閱設定 | [ ] |
| 權限測試 | 被移出工作區後 feed 不再包含該工作區任務 | [ ] |
| API 測試 | 建立 / 修改 / 停用 / 重生 token | [ ] |
| feed 測試 | Google Calendar 可成功訂閱 | [ ] |
| feed 測試 | Outlook Calendar 可成功訂閱 | [ ] |
| 回歸測試 | 既有 WBS / Calendar / Gantt 不受影響 | [ ] |
| 建置檢查 | `npm run verify:source` 通過 | [x] |

## 10. 分階段開發排程

### Phase 1：資料表與安全基礎

| 任務 | 產出 | 完成確認 |
|---|---|---|
| 新增 `calendar_subscriptions` migration | SQL migration | [ ] |
| 設計 RLS policy | 使用者只能管理自己的訂閱 | [ ] |
| 設計 token hash 工具 | 明文 token 不落 DB | [ ] |
| 建立 filters_json 型別 | TypeScript 型別 | [ ] |

### Phase 2：iCal feed 端點

| 任務 | 產出 | 完成確認 |
|---|---|---|
| 建立 `.ics` feed API | `text/calendar` 回應 | [x] |
| 實作 iCal event 產生器 | 穩定 UID、SUMMARY、DTSTART、DTEND | [x] |
| 實作權限重檢 | 讀取時重新檢查工作區權限 | [x] |
| 更新 `last_accessed_at` | UI 可看到最後同步時間 | [x] |

### Phase 3：訂閱管理 API

| 任務 | 產出 | 完成確認 |
|---|---|---|
| 建立訂閱 | POST API | [x] |
| 取得訂閱清單 | GET API | [x] |
| 修改訂閱 | PATCH API | [x] |
| 停用訂閱 | disable API | [x] |
| 重新產生 token | regenerate API | [x] |

### Phase 4：前端設定頁

| 任務 | 產出 | 完成確認 |
|---|---|---|
| 訂閱清單 UI | 顯示名稱、條件、狀態、最後同步 | [x] |
| 建立訂閱表單 | 工作區、負責人、日期類型 | [x] |
| 複製連結功能 | 一鍵複製 URL | [x] |
| 停用與重生操作 | 有確認流程 | [x] |
| 權限對應 UI | 非管理者不可指定他人 | [x] |

### Phase 5：驗收與文件

| 任務 | 產出 | 完成確認 |
|---|---|---|
| Google Calendar 實測 | 可訂閱並顯示事件 | [ ] |
| Outlook 實測 | 可訂閱並顯示事件 | [ ] |
| 使用者操作說明 | 簡短教學文件 | [ ] |
| QA 測試紀錄 | 測試結果與問題清單 | [ ] |
| 上線檢查 | 安全、權限、回歸測試完成 | [ ] |

## 11. 風險與處理方式

| 風險 | 可能後果 | 建議處理 | 完成確認 |
|---|---|---|---|
| Google Calendar 更新延遲 | 使用者以為系統沒有更新 | UI 說明外部行事曆非即時同步 | [ ] |
| token 外洩 | 非預期的人看到事件 | 提供停用與重新產生連結 | [ ] |
| 權限變更後仍看得到舊資料 | 資安問題 | feed 每次讀取都重新檢查權限 | [ ] |
| 指定某人功能濫用 | 一般成員看到他人任務 | 限管理者使用，後端強制檢查 | [ ] |
| iCal 格式不標準 | Google / Outlook 無法讀取 | 使用標準 iCalendar 格式與實測 | [ ] |
| 多工作區查詢變慢 | feed 回應慢 | 建立索引並限制第一版查詢欄位 | [ ] |

## 12. 第一版不做項目

以下先不放入 MVP，避免範圍過大：

| 項目 | 原因 | 完成確認 |
|---|---|---|
| 雙向同步 | 需串 Google Calendar API / Microsoft Graph，複雜度高 | [ ] |
| 狀態篩選 | 第一版先聚焦負責人、工作區、日期 | [ ] |
| 標籤篩選 | 後續可擴充 filters_json | [ ] |
| 優先級篩選 | 後續可擴充 filters_json | [ ] |
| 部門行事曆 | 需要角色與部門模型更完整 | [ ] |
| 外部行事曆即時推播 | iCal 訂閱本質上由外部服務定期拉取 | [ ] |

## 13. 最終完成定義

本功能視為完成，需同時滿足：

| 完成條件 | 完成確認 |
|---|---|
| 使用者可建立自訂行事曆訂閱 | [x] |
| 可選多個工作區 | [x] |
| 可選負責人：我 | [x] |
| 管理者可選負責人：指定某人 | [x] |
| 可選開始日、到期日或兩者 | [x] |
| 可複製 `.ics` 訂閱 URL | [x] |
| Google Calendar 可成功訂閱 | [ ] |
| Outlook Calendar 可成功訂閱 | [ ] |
| 停用與重生連結功能正常 | [x] |
| 權限異動後 feed 內容會正確縮減 | [ ] |
| `npm run verify:source` 通過 | [x] |
