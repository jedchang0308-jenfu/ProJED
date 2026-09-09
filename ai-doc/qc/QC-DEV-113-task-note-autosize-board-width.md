# QC-DEV-113：任務說明尺寸行為事實報告

## 結果

`Local targeted QC PASS / NOT RELEASED`

## 實際證據

- 來源畫面：`http://localhost:4000/` ProJED 品質驗證測試看板，任務詳情已開啟；重用既有 listener PID 22260。
- 空白任務說明：外框 `36px` 高、`resize: none`、寬度 `1089px` 並貼齊容器。
- 實際輸入三行內容後：外框由 `36px` 增至 `84px`，`scrollHeight=84`，寬度保持不變。
- 清空測試內容後：外框回復 `36px`，測試資料已還原。
- 六行內容自然高度 `156px`；從整條底邊向上拖曳後外框為 `60px`、`clientHeight=58px`、`scrollHeight=156px`、`overflow-y=auto`，並套用專案既有 6px 低干擾縱向捲軸。
- 中央底邊拖曳：高度 `36→120px`；左端與右端再分別拖曳後為 `144px`、`168px`，全程寬度 `1089px`。
- 鍵盤 ArrowDown：高度 `168→180px`；重開任務詳情讀回 `180px` board-scoped 偏好。
- 808×698：編輯器與底邊命中區同寬 `725.52px`，document width `808px`，無水平 overflow。
- 頁面畫面未出現新增 console／visible error；既有 modal、toolbar、子任務區仍可見。

## 自動化／工程結果

- DEV-113 static：`14/14 PASS`
- DEV-113 browser：`13/13 PASS`
- DEV-028 interaction regression：static `48/48 PASS`、browser `PASS`。
- targeted TypeScript：`PASS`
- targeted ESLint：`PASS`
- test build：`PASS`（保留既有 bundle-size 與 browserslist freshness warning）。

## 風險與 release 邊界

- 高度偏好目前是 browser localStorage 的 board-scoped UI preference，不是後端共享資料；若需求改為跨使用者同步，需另立資料契約與權限／migration 評估。
- 本輪未 commit、push、deploy 或 release。
