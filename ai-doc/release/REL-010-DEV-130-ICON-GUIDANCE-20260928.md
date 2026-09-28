# REL-010：DEV-130 Android 圖示提示補正

- 日期：2026-09-28
- 目標：Firebase Hosting 專案／site `projed-cc78d`，正式網址 <https://projed-cc78d.web.app/>
- 結果：已發布、正式站驗證 PASS；既有 Android WebAPK 圖示更換仍 FAIL
- Sealed artifact release ID：`20260928034535-d4c2ec`
- 發布來源：`codex/android-icon-honest-update` commit `baeb2390cce3e1b0d854dd067528b01523800307`（clean）
- Artifact tree SHA-256：`4c9f0e9d04a760e4ea3fb71208ea15df137cc6b157f56864ae872061c52aae33`
- 回復基準：前一個 Hosting version `projects/projed-cc78d/sites/projed-cc78d/versions/48d63b9552518166`；需要回復時依 Firebase Hosting release history 恢復該 version，然後重新驗證 canonical origin。

## 交付範圍

正式網站停止顯示無法可靠完成的「更新桌面圖示」引導；舊 `pwa-update-bridge.html` 轉回主站，不再帶入舊提示 query。主程式與快速建立入口的 favicon、touch icon、manifest 統一引用定版青綠色圖示，manifest `id`、`start_url`、`scope` 不變。一般 Service Worker 網站版本更新與快取復原提示維持原有功能。未更動後端資料、認證或生產流量設定。

## 驗證與邊界

- 本機：TypeScript、DEV-122/041/096 與 DEV-083 release gate、`build:test`、390×844 主／快速入口瀏覽器檢查 PASS。
- 正式站：50/50 artifact provenance、通用 app shell 瀏覽器檢查、390×844 圖示專項檢查 PASS；release receipt `output/release/dev-083/20260928034535-d4c2ec/direct-evidence.json` 記錄 `published=true`、`complete=true`、`verification=passed`。
- 通用 smoke 原以 `networkidle` 等待持續有網路活動的頁面而超時；commit `a18f133` 改以已渲染畫面為就緒條件。專項 smoke 原重複下載大圖檔偶發超時；artifact provenance 已逐檔驗證圖檔，commit `e066edd` 移除冗餘下載。修正後以 `--verify-only` 對同一已發布 artifact 重驗，沒有第二次部署。
- Android 使用者實機證據：`chrome://webapks` 更新狀態 `Succeeded`，但「應用程式資訊」仍顯示舊 J。網站發布與 WebAPK 更新狀態都不能證明已安裝套件圖示更換；該驗收保持 FAIL。使用者不接受以重新安裝作為既有使用者操作流程，原生 App／受管理捷徑目前不在本次範圍。

詳細案例與截圖索引見 [QA-DEV-130](../qa/QA-DEV-130-pwa-identity-update-handoff.md)。
