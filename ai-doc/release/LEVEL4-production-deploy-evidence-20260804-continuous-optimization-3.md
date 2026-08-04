# LEVEL4 Production Deploy Evidence - 2026-08-04 Continuous Optimization 3

## 結論

`持續優化3` 已快轉合併到 `main`，Firebase Hosting production deploy 與 Level 4 正式站驗證均通過。正式站已載入本次 production artifact，未部署 Supabase migration、Edge Function 或資料變更。

## Release Scope

- Source branch: `持續優化3`
- Source branch final commit: `7235eea`
- Artifact commit on `main`: `339bf27482e2239d653b4f0e0511c86eca4fc4ee`
- Base / rollback reference: `64313a96859616981c780c758b02b4b269dc5525`
- Firebase project: `projed-cc78d`
- Production URL: `https://projed-cc78d.web.app`
- Risk lane: Lane 2，因累積變更包含 PWA/cache 設定與 production client 路徑

主要使用者可見範圍包含 DEV-058 跨裝置拖曳原地藍色文字欄位、DEV-059 階層統計徽章精簡、DEV-060 L2/L3+ 日期顯示一致化，以及既有任務儲存鈕與桌面普通游標預選框回歸。

## Verification

- `npm run verify:source`: passed
  - ESLint: 0 errors，55 個既有 warnings
  - TypeScript: passed
  - Production build: passed
  - Production auth mode: 5/5 passed
  - Supabase static: 26/26 passed
  - Migration aliases: 65/65 passed
  - Calendar feed ICS, core regression 與 P9 Edge Function gates: passed
- DEV-028 static: 38/38 passed
- DEV-054 static: 37/37 passed
- DEV-055 static: 27/27 passed
- Level 2 local production artifact smoke: passed
- Level 3 Firebase preview: passed
  - URL: `https://projed-cc78d--level3-smoke-lru8ezj1.web.app`
  - App shell、JS/CSS、Service Worker 與瀏覽器錯誤檢查通過
  - 線上三份關鍵資產 SHA-256 與本機 `dist` 一致
- Level 4 production smoke: passed
  - Root、JS、CSS、Service Worker 均為 HTTP 200
  - Critical console errors、page errors、critical failed requests: none

## Artifact Provenance

Production HTML loads:

- JS: `assets/index-DBeaHSM1.js`
  - SHA-256: `41DD5DF2798C11BA7A763DB9CE9813997779773EFE0E8279C72C2B67ABBF6556`
- CSS: `assets/index-Dm_q_Toq.css`
  - SHA-256: `A997A216B7A6BC65E8FDAD37D84DFC9F4F2400648F7E47FCB4F34548D7743D48`
- Service Worker: `sw.js`
  - SHA-256: `80BA46C001E6881B7239F9A7897B1884147CD3B41607AA715F1A6BA29DDCD1AC`

正式站下載後的 SHA-256 與發布前本機 production `dist` 逐檔一致。

## Authenticated Production Check

沿用 Chrome 既有登入狀態完成唯讀抽查：

- 套用正式站「一鍵更新到最新版」後，更新提示消失且登入狀態保留。
- L2 任務卡日期已使用與 L3+ 相同的 `→` 緊湊格式。
- 任務卡與下層任務列的重複數量徽章已移除。
- 開啟實際任務「小木屋木平台保養」，確認「儲存」與「關閉任務詳情」同時存在；未編輯或儲存資料。
- 游標移到該任務時，`data-desktop-task-hover-preview="true"` 生效，呈現淺藍底與 `2px inset` 藍框。
- 正式站 console error count: 0。

拖曳屬於可能改變正式資料的操作，本次 authenticated production check 未執行拖曳提交；其行為由本機 DEV-054 / DEV-055 browser gates 與使用者先前在 `4173` 的確認承接。

## Known Non-Blocking Risks

- `npm ci` reports 5 moderate inherited package vulnerabilities；本次未做 dependency mutation。
- ESLint 有 55 個既有 warnings，無 error。
- 未執行手機實機正式站拖曳提交，以避免改動正式資料。

## Rollback

若確認正式環境回歸，將 Firebase Hosting 回滾至 `64313a96859616981c780c758b02b4b269dc5525` 對應版本，並重跑 Level 4 app-shell、artifact hash 與登入後唯讀 UI smoke。

---

## DEV-061 Production Addendum - 2026-08-04

### 結論

DEV-061「Trello 式看板標籤收疊」已由 `持續優化3` commit `8713481521a7c18346685f1315521480764df838` 直接發布至 Firebase Hosting production。這是 Lane 1 純前端 UI／本機顯示偏好變更；未修改或部署 Supabase schema、RLS、migration、Edge Function、遠端資料或環境變數。

### Verification And Deployment

- DEV-061 static: 18/18 passed。
- DEV-028 regression static: 38/38 passed。
- Production auth mode: 5/5 passed。
- TypeScript、targeted ESLint、本機 browser QA-061-001～008: passed。
- 本機 browser 功能證據：桌面與 390x844、點擊、Enter／Space、重新整理持久化、tooltip／aria、modal negative assertion 均通過；圓點為 10x10，透明 button hit area 為 14x14。
- Production build：先將舊 `dist` 移出 worktree，再以 Vite 預設 production minifier 從空目錄產生 35 個檔案；PWA precache 40 entries。
- Level 2 local artifact smoke：app shell、production Google OAuth 入口、JS/CSS、Service Worker 通過；critical console errors、page errors、critical failed requests 均為 0。
- Level 3 Firebase preview：`https://projed-cc78d--dev061-tag-collapse-4to6go0n.web.app`，瀏覽器 smoke 通過；preview 35/35 檔案 SHA-256 與本機 `dist` 一致。
- Level 4 production：`https://projed-cc78d.web.app`，app shell、JS/CSS、Service Worker 通過；critical console errors、page errors、critical failed requests 均為 0；production 35/35 檔案 SHA-256 與本機 `dist` 一致。

### Artifact Provenance

- Source / artifact commit: `8713481521a7c18346685f1315521480764df838`
- JS: `assets/index-ujoYxB3D.js`
  - SHA-256: `1c759a1286c7aa01aedd6f749d84201222bd00b6b0767dd5dd06f4e5c0780021`
- CSS: `assets/index-BHWKS0qR.css`
  - SHA-256: `1d8f9f6359b50c8458c13a272a993a70945d96857d835a1a088e1375140129a6`
- Board chunk: `assets/BoardView-Cmayr-sN.js`
  - SHA-256: `219fa22db971b9792084a000ad6d9e7f710303e9b19a2a3c57ab95f32173afdc`
- Service Worker: `sw.js`
  - SHA-256: `2563c0c3ca674c303124d43db90ca8737dd8aa81c399ab98157340417285ff9e`

本機已登入 browser verifier 對 exact source snapshot 完成 8/8 功能互動；正式站公開入口 smoke 與逐檔雜湊證明相同 production artifact 已上線。Chrome 既有頁籤在補充互動檢查尾端位於 4173，因此未將該段過度宣稱為 authenticated production feature smoke。

### Known Non-Blocking Risks

- Vite 7.3.6 在此 Windows worktree 執行內建 `emptyOutDir` 時，於 1971 modules transformed 後無診斷退出；將既有 `dist` 可復原地移出 worktree，再以 `--emptyOutDir false` 從不存在的 `dist` 建置可產生乾淨、完整且預設壓縮的正式 artifact。此問題不影響來源驗證、artifact smoke 或線上 35/35 雜湊一致性。
- 未在 production 寫入、建立或刪除標籤；正式資料保持不變。

### Rollback

若 DEV-061 發生正式環境回歸，將 Firebase Hosting 回滾至本 addendum 前一個 production release（artifact commit `339bf27482e2239d653b4f0e0511c86eca4fc4ee`／release evidence commit `7ee352a`），再重跑 Level 4 app shell、35-file hash 與標籤收疊本機 browser gate。
