# REL-012：DEV-130 Android 安裝圖示尺寸修復

- 目標：Firebase Hosting `projed-cc78d` 正式站 <https://projed-cc78d.web.app/>
- Source commit：`3e979358ceaf036bd629f5e16a1ecbae23eb9599`（`持續優化3` clean source）
- Release ID：`20260928161446-318ce1`
- Artifact tree SHA-256：`26b7549e7dc684e4fd43d36b9f6e0469faa8521dfbb90e6cc5df29fecd08aa27`
- 前一版 Firebase Hosting version：`projects/projed-cc78d/sites/projed-cc78d/versions/a3313822a598d9bf`
- Receipt：`output/release/dev-083/20260928161446-318ce1/direct-evidence.json`，`published=true`、`complete=true`、`verification=passed`

## 發布與驗證

修正主程式與快速入口兩份 manifest 缺少 192×192、512×512 圖示的相容性缺口，同步更新 shortcut、favicon、Apple touch icon、登入畫面品牌圖與執行時圖示引用。App 的 `id`、`start_url`、`scope` 不變；沒有資料庫、認證或服務端更動。

本機 TypeScript、`build:test`、DEV-130 圖片／manifest 檢查、DEV-122 靜態與 Service Worker、DEV-034／041／096 靜態回歸均 PASS。桌面 Chrome 的 manifest 與 installability 診斷無錯誤，兩個入口的 192／512 PNG、尺寸及 favicon 在本機瀏覽器 PASS。

Firebase 已發布新版。首次即時 artifact 核對回報 `app-shell-meta.json` 雜湊不一致；讀回顯示新版 release metadata，沿用同一發布包 `--verify-only` 重試，54/54 遠端檔案雜湊、通用 browser 與 DEV-130 圖示專項 browser 全部 PASS，沒有再部署。正式站直接讀回兩份 manifest 的 `id` 與 192／512 圖示條目符合預期。

網站發布完成；使用者同一 Android 手機重新點「安裝」及系統圖示是否更新仍待實機結果。不能以桌面 Chrome installability 或「建立捷徑」替代 Android WebAPK 安裝 PASS。
