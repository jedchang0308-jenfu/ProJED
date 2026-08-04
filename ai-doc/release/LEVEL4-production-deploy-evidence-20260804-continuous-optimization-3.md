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
