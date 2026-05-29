# 自訂行事曆訂閱 QA 驗證計畫

建立日期：2026-05-26  
驗證對象：自訂行事曆訂閱功能  
驗證範圍：Supabase migration、前端訂閱管理 UI、iCal feed Edge Function、Google / Outlook 外部訂閱、權限與極限操作。

## 1. QA 目標

確認此功能可安全、正確、穩定地讓使用者建立只讀 iCal 訂閱連結，並依以下條件輸出任務行事曆：

| 條件 | 範圍 | 完成確認 |
|---|---|---|
| 負責人 | 我 / 指定某人 | [ ] |
| 工作區 | 單一工作區 / 多工作區 | [ ] |
| 日期類型 | 開始日 / 到期日 / 兩者 | [ ] |
| 外部行事曆 | Google Calendar / Outlook Calendar / Apple Calendar | [ ] |
| 安全 | token、RLS、權限變更、停用、重生 | [ ] |
| 極限操作 | 大量資料、快速連點、錯誤 token、權限異動、外部拉取延遲 | [ ] |

## 2. 測試前置條件

| 項目 | 檢查內容 | 完成確認 |
|---|---|---|
| Migration 已套用 | `calendar_subscriptions` 表存在 | [ ] |
| Edge Function 已部署 | `calendar-feed` 可被公開 GET | [ ] |
| Function JWT 設定 | `calendar-feed` 的 `verify_jwt = false` | [ ] |
| Supabase secrets | `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 存在 | [ ] |
| 前端環境 | `VITE_DATA_BACKEND=supabase` | [ ] |
| Feed base URL | 未設定時可用 `VITE_SUPABASE_URL/functions/v1/calendar-feed` | [ ] |
| App URL | Edge Function 若要產生任務連結，需設定 `PROJED_APP_URL` | [ ] |
| 測試帳號 | 至少 3 個使用者：Owner、Member、Viewer | [ ] |
| 測試工作區 | 至少 2 個工作區：A 工作區、B 工作區 | [ ] |

## 3. 測試資料設計

### 3.1 使用者與角色

| 使用者 | A 工作區角色 | B 工作區角色 | 用途 | 完成確認 |
|---|---|---|---|---|
| User A | owner | admin | 測管理者建立自己與他人訂閱 | [ ] |
| User B | member | member | 測一般成員只能訂閱自己 | [ ] |
| User C | viewer | 不在工作區 | 測低權限與非成員隔離 | [ ] |

### 3.2 任務資料

| 任務 | 工作區 | 負責人 | 開始日 | 到期日 | 預期用途 | 完成確認 |
|---|---|---|---|---|---|---|
| Task A1 | A | User A | 有 | 有 | 測我的任務、雙日期 | [ ] |
| Task A2 | A | User B | 有 | 無 | 測只有開始日 | [ ] |
| Task A3 | A | User B | 無 | 有 | 測只有到期日 | [ ] |
| Task A4 | A | 無負責人 | 有 | 有 | 測不應出現在負責人訂閱 | [ ] |
| Task B1 | B | User A | 有 | 有 | 測多工作區 | [ ] |
| Task B2 | B | User B | 有 | 有 | 測指定某人跨工作區 | [ ] |
| Task C1 | 非成員工作區 | User A | 有 | 有 | 測權限隔離，不可出現 | [ ] |

## 4. 基礎功能驗證

| 編號 | 測試項目 | 操作步驟 | 預期結果 | 完成確認 |
|---|---|---|---|---|
| F-01 | 進入頁面 | 點擊側邊欄「行事曆訂閱」 | 顯示自訂行事曆訂閱頁 | [ ] |
| F-02 | 建立：我的任務 | 選 A 工作區、負責人「我」、日期「到期日」 | 建立成功並自動複製 URL | [ ] |
| F-03 | 建立：開始日 | 選 A 工作區、負責人「我」、日期「開始日」 | feed 只輸出開始日事件 | [ ] |
| F-04 | 建立：開始日 + 到期日 | 同時勾選開始日與到期日 | 同一任務最多產生 2 個事件 | [ ] |
| F-05 | 建立：多工作區 | 選 A + B 工作區 | feed 同時包含 A、B 有權限任務 | [ ] |
| F-06 | 修改訂閱 | 修改名稱、工作區、日期類型 | 下一次 feed 讀取反映新條件 | [ ] |
| F-07 | 停用訂閱 | 點擊停用 | feed 回傳 disabled 狀態或不再輸出事件 | [ ] |
| F-08 | 啟用訂閱 | 停用後再啟用 | feed 恢復可讀取 | [ ] |
| F-09 | 重生連結 | 點擊重生連結 | 新連結可用，舊連結失效 | [ ] |
| F-10 | 最後同步時間 | 用 feed URL 讀取一次 | UI `last_accessed_at` 更新 | [ ] |

## 5. iCal 格式驗證

| 編號 | 測試項目 | 檢查內容 | 預期結果 | 完成確認 |
|---|---|---|---|---|
| ICS-01 | Content-Type | 讀取 feed response header | `text/calendar; charset=utf-8` | [ ] |
| ICS-02 | 基礎格式 | 檢查檔案內容 | 包含 `BEGIN:VCALENDAR`、`END:VCALENDAR` | [ ] |
| ICS-03 | 事件格式 | 任務事件 | 每筆事件有 `BEGIN:VEVENT`、`END:VEVENT` | [ ] |
| ICS-04 | UID 穩定 | 重複讀取同一 feed | 同一任務同一日期類型 UID 不變 | [ ] |
| ICS-05 | All-day event | 日期型事件 | 使用 `DTSTART;VALUE=DATE` 與 `DTEND;VALUE=DATE` | [ ] |
| ICS-06 | DTEND 規則 | 任務日期 2026-06-01 | `DTEND` 應為 2026-06-02 | [ ] |
| ICS-07 | 中文內容 | 任務標題含中文 | Google / Outlook 顯示不亂碼 | [ ] |
| ICS-08 | 特殊字元 | 標題含逗號、分號、換行、反斜線 | ICS escape 正確，不破檔 | [ ] |
| ICS-09 | URL 欄位 | 有設定 `PROJED_APP_URL` | 事件 URL 可回到 ProJED 任務 | [ ] |
| ICS-10 | 空結果 | 條件下無任務 | 回傳合法空 VCALENDAR，不報錯 | [ ] |

## 6. 權限與安全驗證

| 編號 | 測試項目 | 操作步驟 | 預期結果 | 完成確認 |
|---|---|---|---|---|
| S-01 | 使用者只能看自己的訂閱 | User B 查 User A 訂閱清單 | 看不到 User A 訂閱 | [ ] |
| S-02 | 一般成員指定某人 | User B 嘗試指定 User A | 前端不可選，後端也拒絕 | [ ] |
| S-03 | 管理者指定某人 | User A 指定 User B | 可建立訂閱 | [ ] |
| S-04 | 指定某人但對 B 工作區無管理權 | User A 若不是 B 管理者仍指定 B 的 User B | B 工作區資料不可出現或建立失敗 | [ ] |
| S-05 | 被移出工作區 | 建立後將 owner 移出 A 工作區 | 下一次 feed 不含 A 工作區資料 | [ ] |
| S-06 | 指定人被移出工作區 | 指定 User B 後將 User B 移出 A | feed 不含 A 工作區 User B 任務 | [ ] |
| S-07 | 停用 token | 停用訂閱後讀取舊 URL | 回傳 410 或不可用內容 | [ ] |
| S-08 | 重生 token | 重生後讀舊 URL | 舊 URL 404，新 URL 可用 | [ ] |
| S-09 | token 不可猜測 | 隨機改 token 字元 | 回傳 404，不洩漏錯誤細節 | [ ] |
| S-10 | DB 不存明文 token | 查 `calendar_subscriptions` | 只有 `token_hash`，沒有明文 token | [ ] |
| S-11 | 非登入外部讀取 | Google / Outlook 不帶登入狀態讀取 | 可用 token 讀取，無 token 不可讀 | [ ] |
| S-12 | RLS 防護 | authenticated role 直接查表 | 只能查自己的訂閱 | [ ] |

## 7. 外部行事曆驗證

| 編號 | 平台 | 操作 | 預期結果 | 完成確認 |
|---|---|---|---|---|
| EXT-01 | Google Calendar | 從 URL 新增行事曆 | 可成功訂閱 | [ ] |
| EXT-02 | Google Calendar | 檢查中文標題與描述 | 顯示正常 | [ ] |
| EXT-03 | Google Calendar | 修改 ProJED 任務日期後等待同步 | 外部行事曆後續更新，允許延遲 | [ ] |
| EXT-04 | Outlook Calendar | Subscribe from web | 可成功訂閱 | [ ] |
| EXT-05 | Outlook Calendar | 檢查開始日、到期日事件 | 日期正確 | [ ] |
| EXT-06 | Apple Calendar | Add subscribed calendar | 可成功訂閱 | [ ] |
| EXT-07 | 外部延遲說明 | 建立或修改後立即看不到更新 | UI 或說明文件有提示外部同步非即時 | [ ] |

## 8. 極限操作測試

### 8.1 大量資料

| 編號 | 極限情境 | 操作 | 預期結果 | 完成確認 |
|---|---|---|---|---|
| L-01 | 1 個工作區 1,000 個任務 | 訂閱「我 + 到期日」 | feed 5 秒內回應，不 500 | [ ] |
| L-02 | 2 個工作區各 1,000 個任務 | 訂閱 A+B | feed 不超時，事件數合理 | [ ] |
| L-03 | 同任務雙日期 | 1,000 個任務皆有開始日與到期日 | 產生最多 2,000 個事件 | [ ] |
| L-04 | 事件數上限 | 超過 1,500 個任務 | 系統不崩潰，若有限制需明確定義 | [ ] |
| L-05 | 長文字 | 任務標題 300 字、描述 5,000 字 | ICS line folding 不破檔 | [ ] |

### 8.2 快速操作與併發

| 編號 | 極限情境 | 操作 | 預期結果 | 完成確認 |
|---|---|---|---|---|
| L-06 | 快速連點建立 | 連續點擊建立按鈕 10 次 | 不應建立重複異常資料，UI disabled 生效 | [ ] |
| L-07 | 快速重生 token | 連續重生 10 次 | 最後一條新 URL 可用，舊 URL 失效 | [ ] |
| L-08 | 建立中切換頁面 | 建立請求未完成時切換頁面 | 無 crash，完成後狀態一致 | [ ] |
| L-09 | 多裝置同帳號 | A 裝置停用，B 裝置讀取 | B 裝置重新整理後狀態一致 | [ ] |
| L-10 | 外部服務高頻拉取 | 同一 feed 1 分鐘內讀取 100 次 | 不產生資料錯亂，`last_accessed_at` 正常 | [ ] |

### 8.3 邊界輸入

| 編號 | 極限情境 | 操作 | 預期結果 | 完成確認 |
|---|---|---|---|---|
| L-11 | 未選工作區 | 直接建立 | 前端阻擋，後端也拒絕 | [ ] |
| L-12 | 未選日期類型 | 取消所有日期後建立 | 前端阻擋，後端也拒絕 | [ ] |
| L-13 | 空白名稱 | 名稱只輸入空格 | 前端阻擋，DB check 也拒絕 | [ ] |
| L-14 | 非 UUID workspace | 直接打 API 傳錯誤 workspace id | 後端拒絕或無資料，不 500 | [ ] |
| L-15 | filters_json 被竄改 | 傳入非法 date type | RLS function 拒絕 | [ ] |
| L-16 | token 含 `.ics`、URL encoded 字元 | 讀取 feed | 正確解析 token | [ ] |
| L-17 | 任務日期為 null | 任務無開始日或到期日 | 不產生該日期類型事件 | [ ] |
| L-18 | 開始日等於到期日 | 同時訂閱兩種日期 | 產生 `[開始]` 與 `[到期]` 兩事件 | [ ] |

### 8.4 權限異動壓力

| 編號 | 極限情境 | 操作 | 預期結果 | 完成確認 |
|---|---|---|---|---|
| L-19 | feed 讀取同時移除成員 | 讀取期間移除 owner | 下一次讀取必定不含該工作區 | [ ] |
| L-20 | 降權 | owner 降為 member 後指定某人訂閱 | 下一次 feed 不再允許看他人任務 | [ ] |
| L-21 | 任務轉移負責人 | User A 任務改給 User B | User A feed 移除，User B feed 新增 | [ ] |
| L-22 | 刪除工作區 | 訂閱含 A 工作區，然後刪除 A | feed 不 500，忽略已刪工作區 | [ ] |
| L-23 | 刪除任務 | 訂閱後刪除任務 | feed 下一次不含該事件 | [ ] |

## 9. 回歸測試

| 編號 | 測試項目 | 預期結果 | 完成確認 |
|---|---|---|---|
| R-01 | 原本 WBS 清單 | 可正常新增、修改、刪除任務 | [ ] |
| R-02 | 看板模式 | 任務拖曳與狀態更新正常 | [ ] |
| R-03 | 甘特圖 | 開始日、到期日顯示正常 | [ ] |
| R-04 | 月曆 | 原本月曆視圖正常 | [ ] |
| R-05 | Google Calendar 舊同步功能 | 若仍保留，功能不受影響 | [ ] |
| R-06 | 登入登出 | Supabase auth 正常 | [ ] |
| R-07 | Firebase / local-test backend | 顯示 Supabase 後端提示，不 crash | [ ] |

## 10. 自動化檢查

| 指令 | 目的 | 預期結果 | 完成確認 |
|---|---|---|---|
| `npx.cmd tsc --noEmit` | TypeScript 型別檢查 | 0 error | [ ] |
| `npm.cmd run lint` | ESLint | 0 error，既有 warning 需記錄 | [ ] |
| `npm.cmd run build` | 前端建置 | 成功 build | [ ] |
| `npm.cmd run verify:supabase:static` | Supabase 靜態檢查 | 通過 | [ ] |
| `supabase db push` | 套用 migration | 成功 | [ ] |
| `supabase functions serve calendar-feed --no-verify-jwt` | 本地測 Edge Function | feed 可讀 | [ ] |
| `supabase functions deploy calendar-feed --no-verify-jwt` | 部署 Edge Function | 部署成功 | [ ] |

## 11. 手動驗收流程

| 步驟 | 操作 | 通過標準 | 完成確認 |
|---|---|---|---|
| 1 | User A 登入 | 可進入系統 | [ ] |
| 2 | 建立 A+B、負責人「我」、開始日+到期日訂閱 | 產生 URL | [ ] |
| 3 | 用瀏覽器直接打開 URL | 下載或顯示合法 ICS | [ ] |
| 4 | 匯入 Google Calendar | 顯示正確事件 | [ ] |
| 5 | 修改一個任務到期日 | feed 內容更新 | [ ] |
| 6 | 停用訂閱 | URL 不再可用 | [ ] |
| 7 | 重生訂閱 | 新 URL 可用、舊 URL 失效 | [ ] |
| 8 | User B 登入嘗試指定 User A | 不允許 | [ ] |
| 9 | 將 User A 從 A 工作區移除 | User A feed 不再含 A 工作區 | [ ] |
| 10 | 執行 regression checklist | 既有功能正常 | [ ] |

## 12. 出貨門檻

此功能可出貨需全部符合：

| 門檻 | 完成確認 |
|---|---|
| 所有 P0 / P1 bug 已修復 | [ ] |
| 建立、修改、停用、啟用、重生功能通過 | [ ] |
| 權限測試 S-01 到 S-12 通過 | [ ] |
| 至少 Google Calendar 實測通過 | [ ] |
| Outlook Calendar 實測通過或明確列為已知限制 | [ ] |
| 大量資料測試 L-01 到 L-05 無 500 error | [ ] |
| TypeScript、build、Supabase static check 通過 | [ ] |
| 使用者文件有說明外部行事曆同步非即時 | [ ] |

## 13. 缺陷分級

| 等級 | 定義 | 例子 |
|---|---|---|
| P0 | 資安或資料外洩 | 非成員可看到工作區任務、舊 token 重生後仍可用 |
| P1 | 核心功能不可用 | Google Calendar 無法訂閱、建立訂閱失敗 |
| P2 | 功能錯誤但有替代方式 | 最後同步時間不更新、描述欄少部分資訊 |
| P3 | 體驗或文案問題 | 按鈕文字不清楚、提示不足 |

