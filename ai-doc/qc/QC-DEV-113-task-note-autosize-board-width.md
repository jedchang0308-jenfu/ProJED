# QC-DEV-113：任務說明尺寸行為事實報告

## 結果

`Local targeted QC PASS / NOT RELEASED`

## 實際證據

- 來源畫面：`http://localhost:4000/`、local-test / Chromium；重用既有 localhost listener，測試瀏覽器由 runner 在驗證後關閉。
- 空白任務說明：外框 `36px` 高、`resize: none`、寬度 `1089px` 並貼齊容器。
- 實際輸入三行內容後：外框由 `36px` 增至 `84px`，`scrollHeight=84`，寬度保持不變。
- 清空測試內容後：外框回復 `36px`，測試資料已還原。
- 六行內容自然高度 `156px`；從整條底邊向上拖曳後外框為 `60px`、`clientHeight=58px`、`scrollHeight=156px`、`overflow-y=auto`，並套用專案既有 6px 低干擾縱向捲軸。
- 中央底邊拖曳：高度 `36→120px`；左端與右端再分別拖曳後為 `144px`、`168px`，全程寬度 `1089px`。
- 2026-09-10 scope 修訂：任務 A／`note_default` 經底邊與鍵盤調整後為 `204px`，寫入 `local-test-user:dev113-task:note_default`；重開同一備註欄仍為 `204px`。
- 同任務的第二個備註欄維持 `36px`；同帳號、同看板的任務 B 亦維持 `36px`，未沿用任務 A 的高度。
- 808×698：編輯器與底邊命中區同寬 `725.52px`，document width `808px`，無水平 overflow。
- 頁面畫面未出現新增 console／visible error；既有 modal、toolbar、子任務區仍可見。

## 自動化／工程結果

- DEV-113 static：`15/15 PASS`
- DEV-113 browser：`15/15 PASS`
- DEV-028 interaction regression：static `48/48 PASS`、browser `PASS`。
- targeted TypeScript：`PASS`
- targeted ESLint：`PASS`
- test build：`PASS`（保留既有 bundle-size 與 browserslist freshness warning）。

## 風險與 release 邊界

- 高度偏好目前是 browser localStorage 的 `accountId + taskId + noteId` scoped UI preference，不是後端跨裝置同步資料；舊 v1 看板共用值不遷移也不再讀取。
- 本輪未 commit、push、deploy 或 release。
