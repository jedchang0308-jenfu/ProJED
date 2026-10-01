# REL-013：DEV-131 雙網址獨立快速入口

- 目標：Firebase Hosting `projed-cc78d` 正式站。主程式 <https://projed-cc78d.web.app/>；獨立快速入口 <https://projed-cc78d.firebaseapp.com/quick-task/?install=1>。
- Source commit：`afa758c35e907569f88e241e1fe72a231001e7bc`（`持續優化3` clean source）。
- Release ID：`20260929055645-fad159`；artifact tree SHA-256：`08d1098883ed0218bf03aa7b9c3b4d6e37bd7c875479b25a841d3f0086a00b19`。
- 前一版 Firebase Hosting version：`projects/projed-cc78d/sites/projed-cc78d/versions/30286e27a1496724`。
- Receipt：`output/release/dev-083/20260929055645-fad159/direct-evidence.json`；`published=true`、`complete=true`、`verification=passed`。

## 發布與驗證

主程式仍由 `web.app` 提供；安裝獨立「快速建待辦」改至同站的 `firebaseapp.com/quick-task/`，避免與主程式 scope `/` 同源重疊。原 `web.app/quick-task/` 仍可開啟並引導至新安裝網址；主程式、快速入口後端仍指向同一 ProJED Supabase 專案。新 origin 首次必須以相同 Google 帳號登入，沒有跨 origin 複製 token 或未同步待辦。

Supabase Auth 專案 `knodlkxqpcqyrtgwpdst` 僅追加 `https://projed-cc78d.firebaseapp.com/quick-task/*` redirect allowlist。讀回確認既有三筆 URL 與 Site URL 保持原值；OAuth 授權起點可導向 Google，但未完成實際登入回呼，因此不列同帳號驗證 PASS。

本機 TypeScript、`build:test`、DEV-131 origin 靜態檢查、DEV-122／034 靜態與手機／桌機瀏覽器回歸 PASS。正式部署首次即時 artifact 核對在 `app-shell-meta.json` 暫時回報雜湊不一致；新版 release metadata 已讀回，後續本地／遠端該檔案位元組長度與 SHA-256 相同。沿用原發布包 `--verify-only` 重試，54/54 遠端檔案雜湊、通用 browser、雙網址 release／quick manifest／舊頁導引／390×844 quick 首屏專項 browser 全部 PASS；未重複部署。

Android `chrome://webapks/` 與系統應用程式清單是否同時出現兩筆獨立 App、完整 Google 回呼與同帳號工作台唯一讀回，仍待使用者在實機驗收。網頁的 App 視窗外觀與 Chrome 捷徑均不能替代 WebAPK 證據。
