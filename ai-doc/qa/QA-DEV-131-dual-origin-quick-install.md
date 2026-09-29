# QA-DEV-131：雙網址獨立快速入口

- 對應：[DEV-131](../dev_task.md#dev-131-android-獨立快速入口雙網址修復---2026-09-29)、[SPEC-122 DEV-131 修訂](../specs/SPEC-122-mobile-zero-data-quick-task.md#dev-131-雙網址獨立安裝修訂2026-09-29)。
- 風險：中高。涉及 OAuth 回呼與 origin 隔離，但不改資料庫、RLS 或既有主程式安裝身分。

## 可自動驗證

1. 主程式 manifest `id/start_url/scope='/'` 不變；quick manifest `id/start_url/scope='/quick-task/'` 不變，且在 `firebaseapp.com` 以該 origin 讀取。
2. 正式 `web.app` 和 `firebaseapp.com` 讀回同一 release；quick 首屏名稱欄自動聚焦、語音按鈕可見，未載入 root React 工作台。
3. `web.app/quick-task/?install=1` 引導至 `firebaseapp.com/quick-task/?install=1`，原 quick 記錄頁及主程式 shortcut 保留。
4. Supabase `knodlkxqpcqyrtgwpdst` 回呼白名單只追加 quick path 項目；舊項目不刪除，Site URL 不變。測試 OAuth 起點可導向 Google；不得把起點 302 冒充完整登入成功。
5. 新 origin 的工作台連結回 `web.app`；local、preview 不連到正式站。既有 title、voice、outbox、RPC 靜態及必要 browser 回歸通過。

## Android 實機驗收

1. 不移除既有主程式，在 Chrome 開新 quick origin 安裝；`chrome://webapks/` 同時列出主程式與「快速建待辦」，Android「設定 → 應用程式」也有兩筆，桌面 quick 圖示能以獨立 App 視窗開啟。若僅有 Chrome 徽章捷徑，不算 PASS。
2. 首次以主程式相同 Google 帳號登入 quick；建立一筆可刪除的測試待辦，確認主程式同帳號工作台唯一讀回，再清理測試資料。不同帳號不得被誤認為主程式帳號。
3. 原 `web.app` quick 若有未同步資料，先在原 origin 完成同步；新 origin 不宣稱自動帶入。未登入、取消登入、離線時仍保留本機待辦且不建立到錯誤 owner。

Android 實機案例只能由裝置證據結案；桌面 Chromium、HTTP 200、OAuth 302 或 in-page `display-mode` 不得替代。

## 2026-09-29 執行紀錄

- 本機 TypeScript、DEV-131 origin 路由、DEV-122 static 25 assertions、DEV-034 static 23/23、DEV-034 手機／桌機 browser、DEV-122 quick browser SM01～SM15、DEV-122 root browser R01～R03／B22～B24均 PASS。兩個舊 browser verifier 曾因 DEV-130 圖示尺寸與本次文案不合而 FAIL；更新該驗收後重跑通過，未修改產品行為來迎合舊測試。
- 正式 Firebase `web.app/quick-task/` 與 `firebaseapp.com/quick-task/` 均 HTTP 200。Supabase Auth readback 確認 `knodlkxqpcqyrtgwpdst` 的原有三筆 redirect URL 全保留，新增唯一 `https://projed-cc78d.firebaseapp.com/quick-task/*`；Site URL 未改。OAuth 授權起點可導向 Google，但沒有完成真實帳號回呼，因此不列同帳號 PASS。
- 正式 release `20260929055645-fad159` 由 source `afa758c35e907569f88e241e1fe72a231001e7bc` 發布。首次遠端即時驗證在 `app-shell-meta.json` 暫時出現雜湊不一致；直接讀回與不可變產物之位元組長度及 SHA-256 後相同，`--verify-only` 沿用原產物重試成功，未再次部署。54/54 遠端檔案 provenance、主程式 browser smoke、雙網址同版／manifest／舊頁連結／390×844 quick 首屏 feature smoke 均 PASS。發布證據見 [REL-013](../release/REL-013-DEV-131-DUAL-ORIGIN-20260929.md)。
- Android 獨立 WebAPK 兩筆、完整 Google OAuth 回呼與同帳號待辦唯一讀回仍 Pending，不能以正式網站 smoke 或 OAuth 起點 302 代替。
- 2026-09-29 使用者回報新雙網址快速入口安裝成功；仍需區分此口頭實機結果與 `chrome://webapks/` 兩筆、同帳號建立及唯一讀回的完整驗收證據。
