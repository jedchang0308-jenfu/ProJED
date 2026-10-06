# REL-011：DEV-130 Android 圖示自願重新安裝引導

- 目標：Firebase Hosting `projed-cc78d` 正式站 <https://projed-cc78d.web.app/>
- 結果：網站引導已發布並驗證；使用者實際重裝後的 Android 系統圖示仍待實機確認
- Release ID：`20260928064049-735933`
- Clean source：`持續優化3` commit `7029f303da1d14de0879847ab1ba44d90e6fcf7a`
- Artifact tree SHA-256：`ed1f8d83417705750b6277f18295b71b2c507d8a0fb3d7ec0a89612df805f03d`
- 回復基準：前一個 Hosting version `projects/projed-cc78d/sites/projed-cc78d/versions/789f58ba2756512c`

## 發布內容

Android 主程式的設定中心增加收合式「自行更新桌面圖示（選用）」，可分別選主程式或快速建待辦。已安裝快速入口在輸入頁下方提供小型「安裝與圖示」連結。引導檢查本機未同步快速待辦、提醒保存其他草稿、提供保存安裝連結與手動重裝步驟；不自動解除安裝或強迫更新。一般 Chrome 分頁不再因舊 `appinstalled` 本機紀錄誤判為已安裝。

## 證據與限制

- 本機：TypeScript、targeted ESLint（0 errors）、`build:test`、DEV-122／034／041／096 靜態回歸、390×844 主／快速入口操作與 1 筆未同步待辦警示 PASS。
- 正式站：50/50 artifact SHA-256 一致性、通用瀏覽器 smoke、390×844 快速入口選用引導 smoke PASS；release receipt `output/release/dev-083/20260928064049-735933/direct-evidence.json` 記錄 `published=true`、`complete=true`、`verification=passed`。
- 正式站主程式設定頁需登入，本次以本機 Android 尺寸瀏覽器實測及正式 artifact 一致性驗證；未在正式帳號登入後直接點選該頁。Android 實機解除安裝／重新安裝及桌面、App 資訊顯示新圖示尚未驗證，不以網站 smoke 冒充成功。
