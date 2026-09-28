# QA-DEV-130：PWA 圖示更新 Chrome 交接

## 2026-09-28 實機反證與補正驗收

- 使用者提供的 Android Chrome `chrome://webapks` 畫面中，ProJED WebAPK 的更新狀態為 `Succeeded`；之後使用者確認 Android「應用程式資訊」最上方仍是舊 J 圖示。因此「已安裝 WebAPK 圖示換成新版」為 **FAIL**，而非先前的 `Physical Supplemental Not Verified`。Chrome 實際是否啟用 icon identity approval 功能仍未知。
- 補正預期：正式網站不再顯示「更新桌面圖示」或引導重複按更新／等待／重開機；一般 Service Worker 網站版本更新及錯誤復原仍獨立可用。既有 bridge 網址應回到 ProJED，而不再帶入圖示更新指引 query。
- 新版主／快速入口 manifest、瀏覽器 favicon、Apple touch icon 與對應 PNG 均引用相同的定版資產；`id`、`start_url`、`scope` 不變。這只能證明網站可提供新版圖示，不能證明既有 Android WebAPK 套件圖示已更換。
- 實機 FAIL 在 Chrome-owned 套件層；若未來再次宣稱既有使用者圖示已更新，必須以同一台 Android 的「應用程式資訊」新版圖示與桌面新版圖示作為證據。不得以 manifest、bundle、Chrome `Succeeded` 或瀏覽器截圖代替。
- 本機補正驗證：TypeScript、DEV-122/041/096 與 DEV-083 release gate 通過；`build:test` 通過。390×844 瀏覽器 smoke 驗證主／快速入口皆載入新版 icon、兩個 manifest 身分不變、舊 query 不再顯示圖示更新誤導、無水平溢出與 page error。畫面留存於 `output/playwright/dev083-direct-feature/`；此結果不等於 Android WebAPK 套件圖示已更新。
- 正式站補正結果（2026-09-28）：`https://projed-cc78d.web.app/` 已發布 release `20260928034535-d4c2ec`，source `baeb2390cce3e1b0d854dd067528b01523800307`。50/50 immutable artifact provenance、通用 app shell 瀏覽器 smoke、390×844 主／快速入口與舊 bridge 網址專項 smoke 均 PASS；無 page error 或水平溢出。第一次通用 smoke 的 `networkidle` 超時及第一次完整重驗的大圖檔重複下載超時屬驗證腳本穩定性問題，分別在 `a18f133`、`e066edd` 修正後，對同一已發布 artifact 執行 `--verify-only` 完成，未再次部署。發行 receipt：`output/release/dev-083/20260928034535-d4c2ec/direct-evidence.json`。網站補正 PASS；既有 Android WebAPK icon 仍 FAIL。

## 範圍

目前驗證既有 Android Chrome 安裝使用者看到正確的 WebAPK 圖示更新說明；舊 bridge 網址仍可落地，但不再指向 Android Chrome 中不存在的選單。網站無法主動觸發或代替 Chrome 核准 App identity 更新。以下 S／B 案例保留 REL-008 的歷史驗證脈絡；現行矯正以末段 A01～A05 為準。

## 驗收案例

| ID | 案例 | 預期 |
|---|---|---|
| S01 | legacy Android Chrome standalone | 顯示 `installed-app` |
| S02 | browser tab／非 Android Chrome | 不顯示 legacy 交接 |
| S03 | 新圖示發布後的新安裝 | 不顯示 |
| S04 | 已完成／同 session 稍後 | 不顯示 |
| S05 | revision query landing | 顯示 `browser-guidance` |
| S06 | Chrome Intent | package、HTTPS scheme、revision與fallback URL正確 |
| B01 | 390×844 standalone fixture | 「在 Chrome 繼續」可見可點、無 X overflow |
| B02 | Chrome landing | 三點選單指引可見；按「完成」後 query與提示移除 |
| R01 | 一般 PWA update／recovery | DEV-041／096既有 UI與優先序不變 |

## Evidence boundary

- Pure與browser evidence可證明 ProJED 內的入口、Intent與落地指引。
- Chrome 的「檢閱應用程式更新」及最後核准由瀏覽器持有；未取得 Android 實機操作證據時標示 `Not verified`，不可寫成自動 PASS。
- 正式部署後需驗證 canonical source／release、root shell、query landing與無 critical browser error。

## 本機執行結果（2026-09-21）

- `verify:dev-130-pwa-identity-update-handoff`：PASS。
- 390×844 browser：B01／B02／R01 PASS；Intent含 Chrome package、HTTPS fallback與revision；零X overflow、零critical console／page error。
- DEV-041 static 22/22、DEV-096 static 26/26、TypeScript、targeted ESLint、`build:test`與`git diff --check`：PASS。
- 畫面：`output/playwright/dev-130-pwa-identity-update/installed-app-handoff-390x844.png`、`browser-guidance-390x844.png`。
- Android實際外部 Intent與Chrome-owned核准仍是正式環境實機 supplemental，不以fixture冒充。

## 正式環境結果（2026-09-21）

- Level 3：staging ref隔離、artifact secret scan、HTTPS app shell與DEV-130 390×844 landing PASS；zero critical console／page／network error。
- Production candidate：release `20260921090231-6a5327` 的49/49 provenance、readiness、credential rotation、browser、OAuth與DEV-130 landing PASS；live channel未提前變更。
- Canonical：<https://projed-cc78d.web.app/> source `df2d6b3fe1ad259d20591531e5e75ec8516d783b`、49/49 provenance、browser、OAuth與DEV-130 query landing／完成後marker清理PASS，390px viewport無X overflow、零critical error。
- 結論：production web behavior PASS；Android裝置實際離開standalone、啟動Chrome及完成browser-owned identity approval仍為`Physical Supplemental Not Verified`。

## 正式缺陷與修正驗證（2026-09-22）

- 實機觀察：點「在 Chrome 繼續」後仍停留於standalone；頁面顯示「檢閱應用程式更新」指引，但沒有Chrome工具列／三點選單。REL-006的外部Intent假設判定失敗。
- 根因：指定Chrome package的同scope HTTPS navigation可由目前WebAPK容器自行承接；query marker又先於display-mode判斷，導致standalone被誤標成`browser-guidance`。
- 修正案例：
  - C01：主App與快速入口manifest `display=minimal-ui`。
  - C02：installed prompt不再含「在 Chrome 繼續」或self-targeted Intent，改列重開與上方選單精確步驟。
  - C03：recognized query只有在非standalone時回`browser-guidance`；standalone仍回`installed-app`。
  - C04：guidance revision更新後，舊acknowledgement不會永久隱藏修正提示；原圖示發布時間之後的新安裝仍不提示。
  - C05：390×844無X overflow、完成／稍後可操作，DEV-041／096優先序不變。
- 本機結果：C01～C05 PASS；DEV-130 pure verifier、TypeScript、targeted ESLint、DEV-041 22/22、DEV-096 26/26、`build:test`與390×844 browser均PASS，無X overflow、零critical error。
- 修正畫面：`output/playwright/dev-130-pwa-identity-update/installed-app-menu-guidance-390x844.png`、`browser-guidance-390x844.png`。
- 正式發布前狀態：`Corrective Local QA PASS / Production Pending`；REL-006維持歷史證據，不再作為Android handoff成功證據。

## 矯正正式環境結果（2026-09-22）

- Source commit：`fa46ba8d3703bb5ee1f5a1db186fd5645177066c`；release `20260922052910-469acb`；artifact tree `a50f91afed44675244d2095bbb78cd98f69bdd84f5fdaaa847b6809584e9327e`。
- Level 3：HTTPS app shell、兩份manifest `display=minimal-ui` readback與390×844 DEV-130 guidance PASS；零critical console／page error。
- Production candidate：readiness、credential rotation、49/49 provenance、browser、OAuth safe-cancel與DEV-130 guidance PASS；live未提前改變。
- Canonical：<https://projed-cc78d.web.app/> 49/49 provenance、browser、OAuth、兩份manifest readback與390×844 guidance／完成清理PASS；`scrollWidth/clientWidth=390/390`、零critical error。
- 舊版「在 Chrome 繼續」與self-targeted Intent已從正式bundle移除；既有安裝的提示改為完全關閉後重開，使用上方選單執行「檢閱應用程式更新」。
- 結論：corrective production web behavior PASS。Android Chrome何時刷新既有WebAPK shell，以及裝置上實際顯示新上方選單，仍為`Physical Supplemental Not Verified`；browser fixture與manifest readback不冒充該實機證據。

## 瀏覽器橋接矯正正式環境結果（REL-008，2026-09-22）

- Source commit：`59bce597ef6f34542962f3483da779638ea1ed85`；release `20260922064213-19a71b`；artifact tree `a7d686f18fbb543b6fc3ef682726b4f0f1295e58679f65ca98da69e62a7d92e1`。
- 使用流程：installed prompt 顯示「開啟 Chrome 更新」；點擊後開啟不含 manifest／service worker 的 `https://projed-cc78d.firebaseapp.com/pwa-update-bridge.html`，自動導回 `https://projed-cc78d.web.app/?projed_app_identity_update=brand-20260921-bridge-20260922`。不需複製網址，也不需解除安裝。
- Canonical readback：bridge HTTPS status 200、canonical redirect與revision存在；主App與快速入口manifest status 200且`display=minimal-ui`；canonical provenance 50/50、browser smoke、OAuth safe-cancel均PASS。
- 本機 390×844：browser bridge target／rel、提示文字、完成／稍後、無X overflow與既有 update／recovery priority均PASS；純 verifier、TypeScript、targeted ESLint、full source gate均PASS（64 existing warnings／0 errors）。
- Level 3：HTTPS app shell、service worker、generic browser smoke與artifact secret scan PASS；hosted custom DEV-130 test-only surface為`NOT VERIFIED`，因 staging build刻意不開啟測試surface。
- 證據邊界：Chrome仍擁有「檢閱應用程式更新」與最後核准；本次未取得Android實機重新點擊bridge、離開standalone或完成WebAPK identity approval的獨立證據，維持`Physical Supplemental Not Verified`。

## Android實機選單反證與待驗矯正（2026-09-24）

- 實機截圖：Android Chrome普通分頁選單顯示「開啟 ProJED 3.0｜專案管理系統」，未顯示「檢閱應用程式更新」。REL-008雖成功開啟Chrome分頁，但最後指引不可執行；該flow的實機驗收為FAIL。
- 根因：將Chrome桌面版Web App的「Review App Update」選單流程誤套至Android WebAPK。Android使用WebApkUpdateManager在更新檢查時顯示原生圖示／名稱確認對話框，普通Chrome分頁沒有相同選項。
- 待驗案例：A01 installed-app文字只描述Chrome定期檢查與原生確認；A02不存在「開啟 Chrome 更新」／「檢閱應用程式更新」；A03舊bridge query說明本分頁沒有更新選項並指出實際「開啟 ProJED 3.0」入口；A04 installed「知道了」／「稍後」及browser「知道了」可操作；A05 390×844無X overflow、一般update／recovery維持優先。
- 本機fixture只能驗證本站UI與已部署bridge相容；Android Chrome原生確認是否出現、何時檢查與實際圖示更換仍為`Physical Supplemental Not Verified`。

## 2026-09-24 矯正執行狀態

- Source commit `3ff85dae06d47357a04f7d0c595217b7462f9ec8`：DEV-130 pure verifier、TypeScript、targeted ESLint、test build、staging build、staging env／artifact secret scan、production auth mode及完整 `verify:source` 均 PASS；完整 ESLint 為既有 64 warnings、0 errors。
- 390×844 browser 與 release gate 的 browser runtime：容量 preflight 對同一 `browser_runtime` 10 GiB 預留回報 `BLOCKED`，尚未執行；不得以靜態檢查替代 A01～A05 的瀏覽器結果。
- `level3-smoke` 預覽部署嘗試失敗：Firebase CLI 回報登入憑證已失效，要求 `firebase login --reauth`；尚無本次修正版的 HTTPS 預覽或正式發布證據。
- 當時結論為 `Local static/build PASS / Browser、Level 3、Production Pending`。先前 REL-008 的 production verified 只代表歷史發布版本；後續結果見下段。

## REL-009 矯正正式環境結果（2026-09-24）

- 使用者明確接受本次 10 GiB browser runtime 容量風險後，本機 A01～A05、390×844 版面、舊 bridge query、acknowledgement、一般更新與 recovery priority 均 PASS；零 critical browser error。
- Firebase CLI 重新登入後，以 source commit `fb308a10f4177af78150eb1b1523a43047dfeb80` 重新建置並部署 `level3-smoke`。HTTPS 預覽首頁、主 JS/CSS、`sw.js`、兩份 manifest 共六檔 SHA-256 與本機 staging artifact 相同；generic browser smoke PASS、零 critical console/page/network error。`navigator.serviceWorker.ready` 在該 browser smoke 等候逾時，故不列為 PASS；`sw.js` HTTPS 200 與雜湊吻合。staging 不開放 test-only surface；auth/data write 沒有重跑，因本次只修改提示文字與修訂識別，未改登入／資料路徑。
- sealed production release `20260924083403-ebcc33`：prepare Layer 2 本機 50/50 provenance 與 browser PASS；candidate <https://projed-cc78d--production-candidate-kbhim8hv.web.app> 50/50 provenance、browser、OAuth safe-cancel PASS，live 在候選期間未變。canonical <https://projed-cc78d.web.app/> source/release readback 正確、50/50 provenance、browser、OAuth safe-cancel PASS；root、quick route、兩份 manifest、`sw.js`、舊 bridge 端點均 HTTP 200。
- canonical 390×844 舊 query 實測顯示「此分頁沒有圖示更新選項」與實機所見「開啟 ProJED 3.0」，沒有舊版錯誤選單文字，`scrollWidth/clientWidth=390/390`；「知道了」關閉提示並移除 query marker。正式 bundle 包含 installed-app 原生確認說明，不含「檢閱應用程式更新」。
- 結論：`Production Web Behavior Verified / Android Native Dialog Physical Supplemental Not Verified`。Chrome 實際檢查時間、是否跳出原生圖示更新確認與使用者桌面圖示變更，不以瀏覽器模擬或 HTTP 檢查冒充實機通過。
