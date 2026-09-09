# QC-DEV-113：任務說明尺寸行為事實報告

## 結果

`Local targeted QC PASS / NOT RELEASED`

## 實際證據

- 來源畫面：`http://localhost:4000/` ProJED 品質驗證測試看板，任務詳情已開啟。
- 空白任務說明：外框 `36px` 高、`resize: horizontal`、最小寬度 `240px`、水平／垂直 overflow 隱藏。
- 實際輸入三行內容後：外框由 `36px` 增至 `84px`，`scrollHeight=84`，寬度保持不變。
- 清空測試內容後：外框回復 `36px`，測試資料已還原。
- 頁面畫面未出現新增 console／visible error；既有 modal、toolbar、子任務區仍可見。

## 自動化／工程結果

- DEV-113 static：`12/12 PASS`
- targeted TypeScript：`PASS`
- targeted ESLint：`PASS`
- 既有 DEV-028 regression 與 test build：於交付前執行並記錄於本輪 handoff。

## 風險與 release 邊界

- 寬度偏好目前是 browser localStorage 的 board-scoped UI preference，不是後端共享資料；若需求改為跨使用者同步，需另立資料契約與權限／migration 評估。
- 本輪未 commit、push、deploy 或 release。
