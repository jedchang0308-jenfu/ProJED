# SPEC-062：任務狀態精簡與截止日衍生逾期

狀態：RD Implemented / Local Static + Browser QC Passed / Production Not Deployed

關聯 DEV：DEV-062、DEV-028、DEV-039、DEV-060

## 決策來源與目標

2026-08-04 使用者確認將任務狀態精簡為四種人工狀態，移除狀態圖示與彩色圓點，並將「逾期」改為截止日自動判斷。主要目標是降低 PM 狀態維護成本，避免流程狀態、資料缺口與時程警示混在同一欄位。

## 狀態契約

人工可設定的狀態固定為：

1. `todo`：待辦。
2. `in_progress`：進行中。
3. `onhold`：暫緩。
4. `completed`：完成。

`delayed` 與 `unsure` 是唯讀 legacy compatibility 值，不得再出現在任務狀態選單或狀態篩選器。前端載入舊資料時將兩者收斂為 `todo`，但本 DEV 不建立正式資料庫 migration，也不在載入時回寫遠端資料。

## 逾期衍生規則

`逾期 = 有效截止日早於今天 + 任務未完成 + 任務未封存`。

- 待辦、進行中與暫緩均可能逾期。
- 完成、封存、沒有截止日或截止日無效的任務不逾期。
- 截止日延後至今天或未來，逾期即自動解除。
- 任務完成，逾期即自動解除。
- 人員不得直接寫入「逾期」或利用「暫緩」隱藏逾期。
- 系統不得再因截止日已過而把 `status` 改寫成 `delayed`。

`逾期`可作為只讀篩選條件，歸屬「到期日」區，不列入人工狀態按鈕。

## 視覺契約

- 狀態控制使用純文字，不顯示狀態 icon、symbol、notch 或彩色圓點。
- 待辦使用深灰；進行中使用 ProJED 品牌藍；暫緩與完成共用淺灰。
- 逾期日期使用橘紅色文字／淡底，但日期摘要只顯示日期，不顯示「逾期」兩字；輔助科技仍可從 `aria-label` 取得逾期語意。
- 選取狀態仍需有 border／ring／背景差異，不能只靠文字顏色。
- 1440×900、1024×768、390×844 不得出現狀態按鈕重疊、裁切或頁面水平溢出。

## 實作邊界

- `src/utils/taskStatus.ts` 是人工狀態正規化與逾期判斷的共用入口。
- `src/store/useWbsStore.ts` 只正規化 legacy status，不再持久化自動 delayed。
- `TaskDetailsModal`、`WbsNodeItem` 與共用 filter controls 只暴露四種人工狀態。
- `TaskDateBadge` 以橘紅色日期樣式呈現衍生逾期，並保留可驗證的 `data-task-overdue`，不增加「逾期」可見文字。
- `TaskFilterState.overdueOnly` 為本機任務檢視／工作台篩選條件；行事曆訂閱 builder 暫不暴露此條件，避免在未部署 Edge contract 前產生不可兌現的遠端訂閱規則。
- Supabase `task_status` enum、既有備份格式、歷史活動紀錄與歷史報表文字保留 legacy read compatibility。

## Out of Scope

- 不執行正式資料庫 enum migration 或批次改寫既有 `delayed`／`unsure` 資料。
- 不部署 Supabase Edge Function、Firebase Hosting 或 production。
- 不改看板欄位／階段名稱；看板欄位不是任務狀態主資料。
- 不改歷史會議紀錄、audit log 或既有匯出檔案中的舊狀態文字。

## 驗收標準

- [x] 人工狀態選單與狀態篩選器只顯示待辦、進行中、暫緩、完成。
- [x] 狀態按鈕沒有圖示、符號、刻痕或彩色圓點。
- [x] 待辦為深灰、進行中為 ProJED 品牌藍、暫緩與完成為相同淺灰。
- [x] 截止日早於今天且未完成的待辦、進行中、暫緩任務自動顯示逾期。
- [x] 完成、無截止日、今日到期與未來到期不顯示逾期。
- [x] 修改截止日不會再改寫任務 status。
- [x] legacy `delayed`／`unsure` 可讀取並在前端收斂為待辦。
- [x] 逾期可作為只讀篩選條件，且不在人工狀態群組中。
- [x] 任務日期摘要不顯示「逾期」兩字，逾期篩選按鈕仍保留可辨識文字。
- [x] targeted static、TypeScript、既有 filter/calendar/cross-mode regression 與三 viewport browser QC 通過。

## 治理結論

Spec Impact：對 SPEC-028「保留狀態刻痕」與 SPEC-039 六狀態 filter UI 為使用者明確核准的 `Intentional replacement`；對 Supabase legacy enum、歷史資料與備份相容為 `Compatible exception`。ADR not needed：本輪保留資料庫 enum 並採可逆前端正規化，未形成新的外部 schema migration。
