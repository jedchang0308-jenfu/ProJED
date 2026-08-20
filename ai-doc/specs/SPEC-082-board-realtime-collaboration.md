# SPEC-082：看板多人即時同步

- 狀態：Implemented / Local QA-QC PASS / Remote Gate Pending
- 關聯 DEV：DEV-082
- 風險：Medium（共享資料即時訂閱、資料庫 publication、跨使用者一致性）
- Spec Impact：Intentional extension；沿用既有 Supabase 資料模型、RLS 與 optimistic write，不改權限語意。
- Release boundary：本輪只建立本地程式、migration、測試與證據；不得直接套用 production migration、deploy 或 release。

## 真正需求

同一看板由不同已授權使用者編輯時，任務、階層、排序、依賴與標籤指派應在其他已開啟該看板的客戶端自動更新，不需要重新整理頁面。系統必須避免事件風暴造成重複讀取或較晚完成的舊請求覆蓋新狀態。

## 範圍

- Supabase `projects`、`wbs_items`、`wbs_dependencies`、`task_tags`、`wbs_item_tags` 與既有 workspace/member 可見資料的 Postgres Changes publication。
- active board 只建立一個 channel；切換看板、登出或元件卸載時移除該 channel 並取消待執行 refresh。
- 初始讀取與 channel 建立完成後各有一致性讀取，關閉「先讀、尚未訂閱」的遺漏事件窗口。
- 同一時刻最多一個 board refresh；短時間多事件合併，讀取期間的新事件只要求一次尾端 refresh。
- 網路恢復或頁面重新可見時立即補做一致性讀取。
- hard DELETE 採無 project filter 的稀有事件補抓；RLS 仍是可見資料邊界。
- 標籤與成員 channel 同樣在 `SUBSCRIBED`、網路恢復與頁面重新可見時補抓，避免看板內容已更新但名稱／成員顯示停留在舊狀態。

## 範圍外

- 不做游標、presence、正在編輯提示或逐字共編。
- 不導入 CRDT／OT、離線雙向 merge 或欄位鎖定。
- 同一欄位同時寫入維持資料庫最後提交者生效；不同欄位沿用既有 partial update。
- 不改 RLS、角色能力、activity log、資料表欄位或產品 UI。

## 實作契約

1. `supabase_realtime` publication 必須以可重複執行方式納入所有現行 client channel 使用的資料表；若 publication 已是 `FOR ALL TABLES` 則不重複加入。
2. client 在 `SUBSCRIBED` 後觸發一次立即 refresh；`CHANNEL_ERROR`／`TIMED_OUT` 必須留下可診斷錯誤。
3. realtime callback 不直接套用不完整 payload；使用現行 service 重新讀取 nodes + dependencies，確保 legacy ID、tag assignment、assignment normalization 與 RLS 行為一致。
4. refresh scheduler 預設 40ms 合併事件；禁止平行執行。執行中若再收到事件，完成後只追加一次讀取。
5. cleanup 後不得再更新 store；舊看板請求即使完成也不可污染新看板。
6. `wbs_item_tags` 的 INSERT／UPDATE／DELETE 必須觸發 board refresh；hard DELETE 不依賴 Supabase 不保證的 filtered delete payload。

## 驗收標準

- burst 三次 refresh request 只執行一次。
- refresh in-flight 期間再收到多個事件，總執行次數為兩次且最大 concurrency 為一。
- cleanup 能取消尚未開始的 refresh。
- hook 具有 `SUBSCRIBED` race closure、online／visibility recovery、tag assignment 與 DELETE coverage。
- migration 靜態驗證包含所有現行 realtime channel 資料表，並檢查 publication membership 後才加入。
- TypeScript、targeted ESLint、test build 與 `git diff --check` 通過。
- 實際 rendered app 無新增可見錯誤；若缺 authenticated two-user Supabase fixture，QC 只能宣告本地契約通過、two-user remote smoke 待 release gate。

## 停止條件

- 需要修改 production RLS、正式資料或直接套用遠端 migration。
- 需要新增第二套 realtime provider、CRDT 或全域輪詢才能達成。
- 現有其他開發中的 `App.tsx`／`BoardView.tsx` 變更必須被覆蓋或回退。

## 執行結果

- Pure/static verifier、TypeScript、targeted ESLint、test build、`git diff --check` 全部通過。
- Rendered regression 於 390x844、844x390、1024x768 共 9/9 PASS，console／page／network errors=0。
- 本輪未套用 remote migration；authenticated two-user Supabase smoke 待 release gate，因此不宣告 production ready。
