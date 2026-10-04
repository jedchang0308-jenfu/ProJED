# DEV-134 PWA 恢復本地驗證

日期：2026-10-01 起，2026-10-04 更新。第一批1～3及註冊等待／worker身分補正已完成、部署live並驗收。雙origin、正式Quick選單及Main updater通過；手機Quick確認選單／最新版，Main親自按更新後回覆「已是最新版」，第一批實機流程收斂。後續4～5未要求，不計入本批。

## 2026-10-04 主程式三點按鈕正式部署與驗證

主程式 `AppMoreMenu` 排版調整已部署至 Firebase live。產品修改 commit `403e5fd`，部署綁定乾淨來源 commit `291f397fa35463a7ccdb4ba4d94b103eda92ff8f`，release `20261004082518-04e5e7`。收據 `output/release/dev-083/20261004082518-04e5e7/direct-evidence.json` 記錄 `published=true`、`complete=true`、`verification=passed`；canonical tree SHA-256 `8698e9de936f2ac4d3964acf60ce74384c25a212c66af6877e2bb198bd8e1cbd`，81/81 entries provenance通過，root browser及`verify-dev-134-update-menu-hosted.pw.js` hosted feature smoke通過。前一live version為 `projects/projed-cc78d/sites/projed-cc78d/versions/124914080a04b358`，本次未執行rollback。

驗收邊界：hosted smoke是匿名瀏覽器檢查，涵蓋網站發布身份與更新功能，沒有登入主程式 MainLayout，故未直接量測登入後頂列的手機視覺或該按鈕的真機幾何；DEV-134早期 updater 測試不算本次排版的視覺驗收。使用者接受本次建置容量風險，建置後容量預留已釋放、Governor session已結束。AppMoreMenu僅變更控制項呈現，不涉及使用者資料或存取控制。手機已安裝主程式可走「⋮ → 檢查更新」取得新 shell，不需重新安裝；這次視覺在手機端的結果仍未知。

## 2026-10-04 Main 手機版本確認失敗與 worker 身分補正

- 使用者兩張原始手機畫面：Main 真登入後的三點選單顯示「無法確認版本，請重試」；Quick Task 已登入且顯示「已是最新版」。這支持實機選單與呈現，沒有顯示 origin、精確 release 或 IDB 保存，不將它擴算為所有手機升級驗收。原圖位於本 repo `.codex-remote-attachments/01a0f4f1-b448-7db3-8326-9e7dfa4d7a2d/6ba68116-48e3-4d94-b4b5-6f9c2dbb58c9/`，保留未修改。
- 真 sealed Main artifact A（`20261003153455-01f632`）保留舊 client；切換 B（`20261004001409-64b197`），新 Main document 與 fresh metadata 同為 B，generated Workbox B 仍 waiting。實際共用 API 回 CHECK_VERSION_UNKNOWN，與手機結果相符。新 document 的 WeakMap 沒有 worker 身分，不能據此斷言 waiting 已是新版；目前是可重現的充分條件，手機自身 worker profile 仍未知。
- 修正於同一 generated Workbox 加入 build-bound readonly message receiver；沿人工 flight 原 deadline 等待 installing 狀態落定並詢問精確 waiting 物件。type/schema/requestId/version、原 registration、waiting 物件與 flight 都一致才確認。不同版本、錯誤、替換、逾時、離頁仍拒絕最新版；legacy worker 沒有 handler 時逾時。未新增 worker／registration、SKIP_WAITING、reload writer 或業務資料操作。契約位於 SPEC-041 U03補充。
- fail-first 原 source 0/1；修正後新增8/8、完整受影響回歸53/53、TypeScript及targeted ESLint／Vite syntax通過。Luna僅只讀審查 source diff，未發現需修正路徑，不宣稱獨立QC。收據 `output/qa/dev-134/2026-10-04-main-version-check/qa-02/identity-{fail-first,fixed,regression}/recovery-result.json`，真失敗重現見 `baseline-result.json`。
- 補正產品與文件 commit `fcb84ad74237d6f0a30170d782f425ce71789138` 已推送，clean source只建置一次 `20261004031015-7a155c`：79檔／11,388,502 bytes，tree `12644eb6298e36461c60abe59993661cdba170d1ef2a6b4466599b18d11c3801`。前版相容來源為 `20261004001409-64b197`，一代有界保留。新 generated worker 的importScripts精確指向同 release身分的內容hash資產，manifest／secret檢查通過。測量建置估算採256 MiB保守輸出預算，free 39,191,678,976 bytes；未重用風險override或宣稱Governor容量admission。
- 真 sealed A → 新補正artifact、保留舊Main client的同條件重演回 up-to-date，24ms完成（current、network與waiting同版）；worker仍waiting、原holder shell／controller／timeOrigin不變，本頁document未重載，task-owned localStorage sentinel保留並清除，pageErrors及遠端業務寫入為0。收據 `fixed-01-result.json`、`generated-worker-binding.json`；root及測試埠64029已退出／釋放。這是generated worker真行為，沒有以模擬reply代替；不是手機帳號或真任務保存證據。
- corrective live已發布；canonical與獨立安裝origin各79/79檔案符合sealed manifest。初次canonical核對卡住超過5分鐘，核對原生PID／start token後停止task-owned樹，保存 `direct-network-wait.json`；未重複部署。第一次verify-only已有79/79及root啟動PASS，但Quick冷profile在20秒內未達stable worker，完整功能未通過（`feature-initialization-failure-01.json`）。另一輪完整檔案重驗遇網路逾時（`transport-timeout-02.json`），不將失敗改判PASS。
- 最後只補缺少的changed feature：fresh release-meta重新核對同release／source，沿用未改包的79/79與root PASS，收據明列reusedFrom。冷worker fixture增加有界60秒狀態觀測，要求active.state===activated，人工check期限及功能斷言不變；實際4,714ms從installing到activated。Quick真選單最新版／離線／online retry、320／390／1440、44px操作區、安裝入口、Escape焦點返回通過；Main從當次HTML及entry bundle解析真updater，其最新版／離線／重試通過。pageErrors、critical request／console errors及業務寫入均0。
- 發布收據 `output/release/dev-083/20261004031015-7a155c/direct-evidence.json` 為 published=true／complete=true／verification=passed；feature verifier SHA-256 `0f21e7c050855ac3b6d508144f2e1266185132bba91d59365dfad31ae765d7fc`，細節 `feature-browser-result.json`，第二origin `readback-status.json`。complete僅指root／Quick UI及匿名Main updater，不替代手機套用。原WinPS CLI輸出中文字有編碼損失，text leaf不當精確字形證據；字串相等assertion在真browser內執行且PASS，ASCII phase／version／binding及runtime結果完整。
- 人類發布後依序回覆Main手機「發現新版」→「有更新按鈕，尚未按」→按更新後再檢查「已是最新版」：真登入Main選單偵測、更新入口、實際套用及再次檢查流程確認。原Quick手機選單／最新版呈現證據保留；第一批1～3完成。這是人類實機回覆，沒有精確origin／release／IDB readback，不擴算那些屬性或獨立QC。後續4～5未要求。回復錨點是發布前live version `d3b83250e608bf2a`，未執行回復。只部署一次，後續同manifest驗證及文件／verifier修訂無需重建。
- task-owned 10個root、4個已識別browser PID及4個測試埠均無殘留；精確CLI session名查無daemon，Governor session已結束。收據 `cleanup-final.json`、`governor-session-ended.json`。使用者localhost4000、原browser／登入終端未操作；早先queued auth／terminal未證實開啟且無surface identity，不宣稱已關閉，若後續可辨識由root續接清理。

## 2026-10-04 正式功能驗證與註冊等待補正

- 人類完成Firebase CLI重新登入後，live channel讀取恢復；`20261003153455-01f632`／source `a12e387` 已發布，canonical與獨立安裝origin各84/84檔案符合manifest，正式root shell smoke通過。首輪Quick正常檢查及online retry回CHECK_UNAVAILABLE，故changed-feature驗證失敗，不宣稱完整發版或DEV結案。原失敗收據保留於 `completion-audit/direct-evidence-failure-01.json`。
- 真正式頁面診斷觀察到同一Workbox的native registration promise仍pending，選單及API卻立即回unavailable。補正只在既有service保存同一registration promise，人工flight沿原deadline等待；reject回unavailable、deadline回timeout、pagehide取消flight，late registration本身仍保留。未新增registration、worker、reload writer或資料操作。
- Hosted verifier原先使用async predicate的waitForFunction，沒有可靠地輪詢native SW狀態；改為page.evaluate內有20秒上限的明確輪詢，保留「已是最新版」／離線／重試及runtime assertions。這是前置條件的修正，不將原失敗改判PASS。
- 先增加4項U05註冊案例：原產品0/4（pending、reject時間、timeout、pagehide皆失敗）；修正後4/4。受影響完整service／artifact／routing adapter回歸45/45，routing server實際埠60163已關閉並確認拒絕連線；TypeScript及targeted ESLint通過。收據 `completion-audit/registration-fail-first/`、`registration-fixed/`、`registration-regression/`。這些是本地adapter證據，不是正式手機或獨立QC。
- 原本71筆binding只沿用未變動輸入；本次service及verifier已改，須以新source／artifact及正式功能smoke補證。Rev4期限與單一owner契約保持一致；Main真登入及既有手機仍需分開驗收，後續4～5未要求。
- 補正採已量測的小型Vite打包：首份manifest輸出11,614,491 bytes，既有builder僅寫新releaseDir及有界前版資產，沿用依賴且不安裝套件。本次不重用上次單次容量風險override；保存實際輸出及空間估算，沿既有已授權corrective release流程重新綁定候選。
- 補正產品 commit `349c552cebb2c092e413897cb1c6d0963dcd0044` 已推送 `origin/持續優化3`；以 clean source 建置並發布 `20261004001409-64b197`。sealed manifest 為78檔／11,386,441 bytes，tree SHA-256 `59994ae99688ebfce8f7daa4d8c7f7449cf5789cd5e05f71079cfb351041ac40`。前版相容來源為首份 release，仍只保留一代資產。
- 正式 canonical `https://projed-cc78d.web.app` 與獨立安裝 origin `https://projed-cc78d.firebaseapp.com` 各78/78檔案核對通過；canonical root shell及匿名 Quick Task 三點選單檢查／離線／恢復連線重試通過，320／390／1440排版、44px操作區、安裝入口、Escape焦點返回、release binding及錯誤／業務寫入檢查均通過。正式驗證器 SHA-256 `7ac5ebbf02afe82ed0cf65c32b41fec8f6c3fa42de57c05b97cfc6c3e5fb36a1`。
- 發布收據 `output/release/dev-083/20261004001409-64b197/direct-evidence.json` 為 published=true、complete=true、verification=passed；第二origin readback見 `completion-audit/firebaseapp-provenance-corrective.json`。此 complete 僅指本次 direct release 的 canonical root／Quick feature，不代表 Main 真登入、手機既有 profile 或整個 DEV 已驗收。回復錨點為首份live version `5fe02d5d1ffef761`，未執行回復；更早已知可用版本另保留 `fa941980dd574ddd`。
- 最新狀態：第一批產品及正式 Quick 功能驗證完成，Main 真登入及既有手機確認待使用者回報；後續4～5未要求。task-owned部署／測試程序已退出，60163無listener；既有localhost4000與使用者瀏覽器／登入終端未操作。先前queued終端／auth頁未取得surface ID且未確認開啟，無法當成已清理畫面；若後續可辨識，由本task續接清理。
- 現行收斂收據 `completion-audit/live-convergence-corrective.json` 綁定source／驗證器hash、雙origin及發布結果，goalComplete=false；`cleanup-corrective.json`確認本次已識別程序與埠均退出，`governor-session-ended.json`確認session已結束。較早convergence與binding是歷史快照，不當成補正source的全量驗收。

## 2026-10-03 完成度稽核與發版續接

- 完整DEV-134尚未結案：第一批1～3本地開發／驗收通過；提交、遠端分支讀回及正式artifact建置已完成，本批live功能證據與手機既有安裝確認仍未取得。後續4～5仍未要求，不補算交付。
- 本批產品及驗證腳本／開發文件共23檔已提交至 `458b9a418509dbb391b38c80702d793aced60022`，`origin/持續優化3` 的 `git ls-remote` 讀回相同commit；提交後工作樹clean。本文後續狀態修訂為文件續接，不改已驗收產品。
- Spec Drift／Convergence Check：依Rev4工程契約逐項核對U01～U10與各層收據；下方對照及 `completion-audit/convergence.json` 支持第一批本地契約收斂。產品／verifier既有71筆hash仍吻合；歷史文件readback僅適用其原hash，本輪另記4份文件hash。這是root事實核對加Luna只讀審查，不是獨立QC執行或手機驗收。
- 新增 `scripts/verify-dev-134-update-menu-hosted.pw.js` 為後續正式Quick Task功能smoke：真選單檢查、離線／重試、320／390／1440、鍵盤及零遠端業務寫入。Node syntax通過，但尚未執行；它不在舊binding中，也不以舊27／27替代正式功能驗證。Main真登入及手機實機仍分開記錄。
- 原live部署授權延續於同一ProJED／Firebase `projed-cc78d` Hosting範圍。雙origin只讀查證目前仍為 `20261002091531-2a1246`／source `23a566bf…`；78檔前版sealed manifest核對通過，作資產相容與回復依據。
- 建置前 `ai-dev-resource-governor` 回傳BLOCKED：2026-10-03T15:20Z附近free約49.51 GB（46.11 GiB），本次有效reservation25 GiB＋protected floor約23.78 GiB，需約48.78 GiB。盤點無可執行清理候選；人類明確接受本次容量風險後，同一操作重新查證為HUMAN_RISK_ACCEPTED並完成一次建置，未清理資源。這是容量規則的確認，不是重新要求live部署授權。
- Sealed artifact：`output/release/dev-083/20261003153455-01f632/manifest.json`，source `a12e387edc1b3cfbb8438798e279c35e2a63f258`（含產品commit `458b9a4`及文件續接），84檔，tree SHA-256 `45f9d7d8298cd9dd4b038bceeba515bcb51a00ef2db85a029a253643882d01f1`；manifest／secret／前版資產相容檢查通過。後續文件狀態修訂不改這份發布包。
- Direct executor於部署前讀取Firebase live channel時失敗；Google token refresh回HTTP 400，`hosting:channel:list`及`projects:list`均失敗。尚未寫入direct-evidence或發布；雙origin仍為前版。保留建置包，正在完成Firebase CLI重新登入；恢復憑證後沿用manifest續接，不重建或重跑未失效本地驗收。

## 2026-10-03 更新操作優化驗收計畫與結果

狀態：**第一批1～3本地驗收通過且已提交推送；未發布，手機實機未確認**。
現行計畫：Rev 4，依 RD 技術主管續接審查修訂；case ID及第一批範圍保持一致。
依人類「補到架構定案」固定第一批 1～3，最新文件審查補足同步通知重入、真返回次數與可見錯誤 gate。
既有 RD／adapter 執行收據與文件審查分開記錄，不把單一 adapter assertion 補算整個 U 案例 PASS。
需求入口為 [DEV-134 架構定案](../dev_task.md#更新操作優化提案架構定案2026-10-03)，
工程權威為 [SPEC-041 本批契約](../specs/SPEC-041-pwa-update-notification-cache-recovery.md#dev-134-更新操作架構定案2026-10-03)。
2026-10-01／02 release 與下方兩輪提示維護的 PASS 是各自歷史證據，不抵本批 U 案例。

### 正常交付路徑、fixture 與驗收案例

正常路徑：實際 MainLayout／Quick Task 標頭 → ⋮ →「檢查更新」→ 共用 service 網路檢查 →
就地結果／既有 prompt → 明確重新載入或真正自然邊界 → local safety → 原 transaction →
新 document current===target。主程式從 AuthGate 正常進入工作介面；Quick Task 使用真正路由與標頭。
Fixtures 可建立隔離帳號／角色、前版 artifact、草稿／任務、metadata／SW 及網路故障；
不得直接寫 expected check phase、目標 completed、reload success 或正常入口 DOM 再當完整流程 PASS。
外部 Auth／RPC 的替身只建立前置登入與資料環境，需在收據標 SIMULATION，不宣稱正式帳號同步。

#### 本批風險與案例對應

| 失效模式 | 原因／條件 | 使用者影響 | 偵測方式 | 優先級 | 對策／案例 |
|---|---|---|---|---|---|
| 短caller等待取消共用flight | API晚就緒後把較早deadline寫到共用flight | 其他檢查被中斷／反覆重試 | 分開核對UI等待與flight截止、abort及通知 | P1 | caller只停止自己的等待；U04／U05 |
| 共享phase變成本頁busy | foreign transaction／activated投影到status | 入口與恢復永久禁用 | 保留foreign phase，核對localUpdateBusy及真按鈕 | P1 | 本頁effect promise／準備狀態為權威；U03／U07／U08 |
| 已知版本改變仍顯示舊成功 | 局部result一直保留到收合 | 假最新版／過期CTA | success結果後改metadata，再正常操作menu | P1 | clearResult永久丟棄舊成功；U03／U08 |
| R03相容性被一般保留條文覆蓋 | 未區分failure retirement與target completed | 無義務仍提示失敗，或掩蓋真load failure | 原R03、current=target及load/cache同版三組對照 | P1 | 僅可信fresh結果退場update failure；U03／U10 |
| 真bfcache始終不命中 | runner預設停用bfcache／fixture仍攔截返回主請求 | 無法證明返回提示恢復 | 記launch config／argv、persisted及document身分 | P1 | U06專用配置與真server；不以mock補算PASS |
| 同步通知重入 | cancelled／busy 通知先於本地 effect guard | 同一頁重複 gate、apply 或 cache recovery | subscriber 同步再呼叫 action，核對 effect 次數及共享 promise | P1 | 先 guard 再通知；terminal flight 先退場；U04／U08 |

| ID | 前置／操作（由正常入口產生結果） | 必要 assertions 與最低證據層級 |
|---|---|---|
| U01 主程式入口 | 已登入管理者／一般角色／無看板角色；從首頁及設定操作 MainLayout 右側唯一 ⋮；登入前查看既有 prompt。 | 所有已登入角色可達「檢查更新」，不依 board 權限；登入頁不新增 menu，updater 仍在 AuthGate 外。320／390／1440px 無溢出／裁切，觸控 hit area ≥44px，Tab／Enter／Space／Escape、composition、outside close 符合契約。實際 MainLayout browser 操作／截圖＋幾何量測；孤立元件不能替代入口證據。 |
| U02 Quick Task 入口 | 真 `/quick-task/`、`?install=1`；登入／未登入、零／有待同步任務；browser、Android／iOS installed 模擬。人工檢查中及結果後觸發 install event、RWD render。 | 只有一個 ⋮；檢查在安裝項目前；summary／panel DOM 身分、焦點及本次結果保留；安裝動作仍可達，沒有更新列遺失。主程式連結／表單位置保留。真路由 DOM／UI＋平台模擬，標示 display-mode／UA 是模擬。 |
| U03 結果可信度 | 真service fixture控制metadata、fallback、同／異／未知版本、離線、HTTP／parse／SPA 200、installing／waiting及worker refresh拒絕。另先取得人工成功，再讓有效背景檢查發現別的latest。 | 必要refresh成功＋可信當次比較才報成功；refresh失敗即使metadata異版仍error。global phase不是local busy；未知／逾時不清failed原因。背景版本改變使成功文案／CTA失效，後來回到相同identity也不復活舊結果。原R03退場update failure與loaded target completed、load/cache保留分別驗證。adapter全分支＋真menu成功／離線／失敗／結果失效。 |
| U04 去重與需求提升 | 同 document 同時人工、15分鐘 metadata、1小時 worker、visible／pageshow、waiting 事件；再於 metadata-only flight fetch 已開始時人工加入。 | 一個 detection flight／requestId；worker native update 同時最多一個；無需求提升時每階段一個 primary fetch（fallback 按契約）；提升只容許 worker refresh 後一次順序 metadata 重讀。新 caller 不能縮短、重設或延長 flight deadline。完成／失敗後可新檢查，跨 document 不強加新共識。adapter 可控順序／請求計數＋真 browser endpoint log。 |
| U05 逾時與遲到 | API readiness接近10秒才完成／拒絕；fetch body／fallback及native update掛起。短caller加入仍有效flight；caller先到期後讓flight成功。另讓flight本身到期／pagehide／本頁apply、retry或cache recovery後釋放舊response。 | UI從點擊10秒結束等待，不改共用flight deadline／abort／snapshot；有效flight後來可更新背景，但不寫回已逾時UI／焦點。flight本身逾時才abort，共用期限不延長，遲到結果不改target／binding／check。native guard直到settle，新caller有限等待且不疊加update；caller到期不清仍載入的API promise。fake clock／deferred精確assert＋真server延遲與UI再試。 |
| U06 返回恢復 | 專用launch config啟用bfcache；Quick真server導航至同源簡單頁再正常Back，收集persisted與document身分。五次真返回至少覆蓋 normal 2次、recovery 2次、safe 1次；另測API載入或人工等待途中離開。 | 五次各自 pageshow.persisted=true 且 heap／root 身分讀回一致，read最新快照且動作可用，無重複DOM／subscription／handler。普通重載、未命中或合成事件不計五次；只有一例命中不得補算全部PASS。過期人工操作不回寫／搶焦點，setup／mount各至多一次；false pagehide／dispose清理冪等。未命中保存not-restored理由；launch與fixture路徑見下方U06執行條件。 |
| U07 effect owner | 在 app-open 已結束的 safe 頁面單獨人工／timer／worker 檢查；另測真正初次3秒 app-open continuation、foreground、view-transition；途中 hidden／pagehide、其他 client 完成。 | 單純 detection 不 reload／SKIP_WAITING；真邊界以有效 token、visible、fresh safety 套用，人工加入不偽造邊界。離開使 token 失效。view-transition 不新增逐 route metadata。另一 client completed 不代表本頁完成；保留 lock／fence及唯一 reload writer。service trace＋真 SW A→B browser，記錄 effect 的來源 boundary。 |
| U08 prompt 與資料安全 | UI正常建立草稿／任務、composition／語音／commit pending；dirty／blocked／booting及failed時由menu／prompt操作。保留foreign active phase及stale own reservation，再與真正local operation pending對照。 | prompt為唯一主動作且recovery優先；只在本次menu仍開著才移交焦點；invalid result無CTA／handoff。foreign phase／stale reservation不使按鈕永久busy，真local操作首個await前互斥、finally解鎖；retry內部apply不self-await。gate保護資料與pending任務，sentinel保留。真DOM互動＋gate／SW／隔離儲存，不宣稱正式Session。 |
| U09 舊安裝升級 | 使用實際前版 sealed release `20261002091531-2a1246` 或已記錄、含現有 updater 的等價前版 A；候選 B 使用真正 production Workbox。同 profile 模擬 installed，先由正常表單建立本機任務，再發布 B，保留另一 unsafe A client並正常重開／返回。 | A 真載入，正常既有更新路徑升 B 後新 ⋮／檢查可操作，own current／controller／target 身分可核對，另一 unsafe client 草稿保留且不被 claim／reload。不得用 fresh profile、clear storage、unregister、直接寫 completed 或 mock SW 算升級 PASS。更早缺 updater artifact 的首次 bootstrap另記已知限制及沿用歷史補驗，不宣稱本批可在未載入 B 時提供新 menu。真 artifact＋SW＋profile；手機實機仍另列。 |
| U10 回歸與交接 | 凍結candidate跑R01～R12、DEV-041／096／097、型別／lint及兩個renderer輸出；核對本批U證據。 | 原R03仍PASS；保留原因／retry fence／local safety／精確normal文案／七值去重／前版cache／安裝功能。renderer只容許明列的foreign phase≠local busy差異，保留真local busy禁用，不刪安全assertion。無新增週期polling／依賴／reload writer。case逐項綁source及fixture，不以mock代真UI／SW；未測明列。 |

U04 必含 terminal 通知中同步發起新檢查：新 requestId／flight 成立，舊 finally 不清新 flight。
U08 必含 cancelled／busy 通知中同步發起 apply、retry、cache recovery：guard 已可見，只有一個本頁
operation／gate／effect，所有 caller 得到同一結果；正常 finally 後可再次操作。只證明 await 後重複點擊
被擋，不足以通過同步重入案例。

U07 的延遲反例須覆蓋已取得 available 後等待 safety gate，途中 hidden／pagehide，及
stable-target／activation 等待期間資格失效：晚到成功不能啟用或 reload，pending target 仍可於下次
安全操作處理。U08 焦點移交須在實際 DOM commit 後再次驗證成功結果身分、local busy與prompt優先權；
等待焦點期間版本改變或使用者收合不能搶焦點。測試須等待 terminal，不能把「檢查中」當成結果。

#### 可見錯誤與資料檢查

U01／U02／U06／U09 每個正常 browser subcase 在開始、操作後及返回／重載後記錄以下結果：

- 可見 `.inline-error`、`[role=alert]` failure、載入失敗、HTTP 4xx／5xx、Not Found、Internal Server Error
  或 `/api/...` 錯誤文字，均使該正常案例 FAIL；另存畫面及原因。故障注入案例只豁免本例預期且已列明的錯誤，
  仍須檢查無關錯誤，不能全部忽略 console／alert。
- 每例先記 expected 任務數／名稱或 sentinel。明訂零資料的空白狀態可 PASS；有資料 fixture 卻呈現全零／
  空清單時 FAIL。資料由正常表單操作建立的案例，不能以測試直接填入預期完成結果。
- 容量、窄版幾何及 UI 文字檢查外，目視代表截圖核對正常入口與主動作。新的 browser／API／build PASS
  不能覆寫使用者已回報的舊版畫面；手機既有 profile 仍另列未確認。

U09 沿用 ADR-047：驗的是 unsafe client 無非自主 navigation、草稿保留與舊資產可用。
既有 controlled document 可收到 controllerchange；不把 controller 永遠不變寫成接受條件，
也不以 controllerchange 直接算 loaded current 已更新。

### RD／QA 執行命令與證據保存

先擴充以下既有 harness／fixture；不建新的測試框架或第二 PWA runtime。MainLayout 真入口與 Quick真路由
可在 existing browser harness 加 bounded scenario；只測 prompt 的 fixture 仍僅是 renderer adapter。

| 執行順序 | 現有命令／修改位置 | 用途與限制 |
|---|---|---|
| 1 | `node scripts/verify-dev-134-pwa-recovery.mjs` | 增加 U03～U05／U07～U08 的 service、pure presentation、lifecycle adapter assertions；fixtures 補 required check／localUpdateBusy 初始值，Quick prompt 補 read action。用可控 time／promise，保留失敗首跑證據。 |
| 2 | `node node_modules/typescript/bin/tsc --noEmit --pretty false`；`node node_modules/eslint/bin/eslint.js <本批變更的來源及 verifier 檔案>` | 接手後以實際 allowlist填 lint檔案；不是掃整站／安裝依賴。未建立的 AppMoreMenu／fixture先實作再驗。 |
| 3 | `npm run verify:dev-041-pwa-update-notification-cache-recovery`；`npm run verify:dev-096-pwa-update-transaction-convergence`；`npm run verify:dev-097-pwa-safe-reload` | 既有行為回歸；source structure變動時只改 assertion定位，不能刪 safety／transaction要求來取得 PASS。 |
| 4 | `node scripts/verify-dev-134-quick-task-update-prompt.mjs` | 既有fixture補check／localUpdateBusy／read wiring；runner改用同一PLAYWRIGHT_CLI_PATH及DEV134_REPORT_DIR，避免硬編碼cache／固定output覆寫。此條只證明prompt局部UI。 |
| 5 | `node scripts/verify-dev-134-pwa-recovery-browser.mjs` | 擴充為真 MainLayout／Quick entry、endpoint faults、真 bfcache、前版 A→候選 B場景。runner本機隔離 production Vite／Workbox及兩版artifact，沿用環境輸出變數；不以 build:test替代真 SW。 |

PowerShell在同一執行 session 設 `$env:DEV134_REPORT_DIR` 指向 `output/qa/dev-134/<run-id>/`；
browser另設 `$env:DEV134_VISUALS_DIR` 至同 run的圖像目錄，`$env:PLAYWRIGHT_CLI_PATH` 指向已安裝 CLI。
既有quick prompt runner的固定CLI路徑在本機仍可讀，但不能作為可攜契約；先完成上述env修正。缺工具時回報環境缺口，不默默安裝或改用
另一專案 runtime。使用者原有 localhost4000／browser不作為 fault fixture，也不得清除它們的儲存。

#### U06執行條件

Playwright官方Chromium defaults含停用bfcache的參數；先前只要求Back，不足以保證runner能驗本案例。
這是規劃時識別的工具能力缺口；`entry-browser/attempt-02/browser-result.json` 已保存實際 Chromium
argv，確認該輪沒有停用 bfcache 的旗標。該輪在 Back 前因前置條件失敗停止，尚不能判斷返回是否命中，
也不能將這項工具條件寫成產品根因。後續結果統一記於下方 Rev 4 現行驗證摘要。
([Playwright defaults](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromiumSwitches.ts))
既有browser runner為U06產生run-owned CLI JSON，僅此session使用：

```json
{ "browser": { "launchOptions": { "ignoreDefaultArgs": ["--disable-back-forward-cache"] } } }
```

透過已安裝CLI的 `--config <run-owned-json>` 啟動獨立session；先只讀其版本／help核對配置能力，
記CLI／browser版本、配置hash及實際argv，不設ignoreDefaultArgs=true，也不改全域CLI config。
配置欄位見[官方CLI schema](https://github.com/microsoft/playwright-cli#configuration-file)、
精確過濾規則見[launch API](https://playwright.dev/docs/api/class-browsertype#browser-type-launch)。
`entry-browser/attempt-03` 首次完成一組真 Back，沒有 persisted；navigation讀回
`response-cache-control-no-store`／`response-cache-control-no-store-with-js-network-request`。
後續U06專用HTML query `dev134Bfcache=1` 由隔離server送 `Cache-Control: no-cache`，只建立document可進入
bfcache的delivery前置條件，request receipt明記SIMULATION。HTML／JS仍為相同candidate bytes，
不合成persisted、不停用updater、不改正式Hosting設定；即使後續命中，也只證明此條件下的真document恢復，
不宣稱正式no-store delivery或使用者手機已命中bfcache。該首跑與production delivery限制均保留。
使用既有loopback server實際回應導航與metadata，不在此context啟用整頁route interception或offline fault；
其他故障case使用原獨立context。頁面不得加unload listener，離開前依原owner責任完成或關閉妨礙freeze的連線；
不可為了命中而停用產品updater或fake persisted。若仍未命中，保存not-restored診斷後回送fixture／架構，
保持U06未驗，其他slice可繼續；不需要新增依賴、全域旗標或使用者原profile。

Frozen candidate：記 branch／HEAD與 dirty diff清單，至少保存 spec、QA及所有修改的 service／presentation／
兩 renderer／MainLayout／AppMoreMenu／Quick install／main／CSS／verifier SHA-256，保留前版與候選 artifact manifest。
測試前後比對；source／fixture／assertion有變就更新 binding並重跑受影響案例，不能沿用舊 PASS。
每筆 run包含 case ID、命令、時間、origin／route、artifact版本／hash、browser版本、角色、viewport、
fixture／SIMULATION標記、實際請求計數、caller／flight各自deadline與結果、localUpdateBusy／clearResult、
reload／controller／target、可見畫面、首跑失敗與cleanup。U大項所含分支各列subcase結果，不能以單一成功分支補算整列PASS。
U06需五次原始 persisted事件及各次 document／heap／root identity；U09需同 profile A→B及資料讀回，兩者不是一張新版截圖即可證明。

MainLayout fixture 若使用 Auth／migration／資料依賴替身，收據列每個 alias／transform 的路徑、目的及hash，
標為 SIMULATION；入口仍走真 AuthGate／MainLayout，正常menu及service結果不可替身。隔離build的
served hash只證明該fixture artifact，不能宣稱原production byte-identical。U09前版須由sealed manifest
核對實際A的served bytes；候選B另存自己的manifest，不用當前source重建「模擬舊版」替代A。

執行前記錄臨時 runtime的 project／purpose／port／PID tree／cleanup條件與新開 browser surface ID；
結束只關該 run-owned process／tab／session並驗證 port釋放，記 runtime receipt。不得終止未知 node或4000 server。
文件審查本身不建立暫時 runtime或UI；既有 RD verifier 的臨時 routing server 收據獨立保存，
不得將其 cleanup 與文件作業混寫。

### QA／QC gate、停止與 release re-entry

RD按 SPEC-041限制實作後完成自驗；QA保存 U01～U10真實結果，QC以凍結候選的正常 UI入口及獨立重放
核對 UI／fault／SW證據。若同一 Agent分階段執行，明記非獨立QC；需要獨立QC時另派工且取得適用授權。
不因規劃工作宣稱已建立第二執行者、已執行QA或已取得手機實機結果。

出現假最新版、越過gate的 reload、任務遺失、遲到結果改新target、第二reload writer、重複listener／請求、
正常入口不可達或 true bfcache無法蒐證時不得通過對應case；保留來源／可重現序列並修復。
契約內程式錯誤由RD修正再跑；需要超出文件的 API／schema／owner／禁止區域，或驗收路徑與架構不符，
立即回送架構規劃，不以改 expected result或縮減案例消除失敗。

本批產品Done需 U01～U10相應證據及Spec Drift／Convergence Check；Release Ready另由既有 release gate判斷。
現有正式Web與使用者既有手機安裝是不同環境：正式 readback與 smoke只可在後續同批 release工作中取得，
手機既有 installed profile沒有實測就保持未確認；文件不提供可執行live指令或聲稱需要重新安裝。

上一輪2026-10-03架構定案文件readback（非本次Rev 2結果、非產品驗證）：DEV／SPEC／QA／documentation map的成熟度、第一批範圍、
下一步及本批待執行狀態一致；本批文件互連的檔案／heading anchor已核對，canonical index位於dev_task前段。
`git diff --check`通過；22個相關source／config／verifier的SHA-256與本輪開始時相同，既有dirty成果保留。
本輪沒有啟動runtime／browser或執行產品tests／build；上述文件核對不計入U01～U10的PASS。

**歷史：2026-10-03 Rev 2／RD 技術主管文件審查收據。** 修正 caller／flight 截止耦合、共享 phase 假 busy、
過期成功結果、R03 退場例外與 bfcache runner 五項契約缺口；SPEC／DEV／QA／documentation map 同步。
靜態核對：13 個本批本地文件連結及 heading anchor 有效，U01～U10 無缺號，四份文件均標 Rev 2；
U06 CLI JSON 可解析，僅過濾指定 bfcache 參數；舊「10 秒共用總期限」摘要已移除。
22 個相關 source／config／verifier 的 SHA-256 與本次審查起點相同，branch／HEAD 未變，
`git diff --check` 通過。結論為修訂後文件審查通過／RD Implementation Ready，沒有產品測試、建置、
runtime、提交或部署；本批 U01～U10 仍待實作／待執行，這份收據不作為產品 PASS 或獨立 QC。

### Rev 3 審查與實作續接紀錄（2026-10-03）

- 文件結論：第一批 1～3 保持 RD Implementation Ready／架構定案。SPEC 補狀態權威及同步重入順序；
  QA 補五次真 bfcache、可見錯誤／資料檢查及 fixture artifact 證據界線；DEV／map同步為實作中、未驗收。
- 實作差距：source先看到 apply／retry／local recovery 先 cancelDetection、後設promise guard；
  新反例在 service adapter 的 attempt-03 重現 **32 PASS／3 FAIL**，三筆同步通知重入各產生2個
  gate／read，預期1個。標為 Implementation needs correction（U08，兼U05取消情境），由原service責任面修復。
  證據：`service-adapter/attempt-03/recovery-result.json`；同層routing-runtime記PID34908／port57401、closed=true。
  這是adapter反例，未宣稱已重現真瀏覽器或使用者手機根因；terminal通知新flight反例已通過，不能掩蓋三筆FAIL。
- RD 首跑：`output/qa/dev-134/2026-10-03-update-operations/before/recovery-result.json` 保存原service
  缺 `checkPwaUpdate` 的 U03反例；`ok=false`，其餘既有assertions通過。這證明新增契約起初不存在，
  不證明候選已通過；後續adapter重跑另存attempt，完成本批仍需U01～U10各必要subcase。
- Git基準仍為branch `持續優化3`／HEAD `9924eaa945305b8f8df5f2df0cf3c6f829d84618`，工作樹dirty。
  文件審查只修改本四份受控文件；既有 RD subagents 的source／verifier變更保留各自ownership，
  不宣稱本輪所有source hash未變。文件before／after與靜態收據存於
  `output/qa/dev-134/2026-10-03-update-operations/document-review-rev3/`。
- 本批未完整驗收、未發布；歷史release及手機實機未確認狀態保留。後續4～5仍為
  Future Phase Captured / Not Requested；沒有另建ADR、DEV或release package。
- 文件靜態收據：四份文件版本／實作中狀態一致，13個本地連結及heading anchor有效，U01～U10無缺號，
  五次真返回與錯誤／資料gate文字已核對，adapter 32／3與routing cleanup收據讀回相符；
  四份文件的`git diff --check`通過。這12項靜態檢查只證明文件收斂，不計產品PASS或獨立QC。

### Rev 3 RD 修復續接（2026-10-03；完整 browser 驗收中）

- service 的 apply／retry／local recovery 改為先設本頁 promise guard，再取消 detection及同步通知。
  `service-adapter/attempt-04/recovery-result.json` 為 **35 PASS／0 FAIL**，三筆同步重入反例均通過；
  attempt-03 的 32／3 保留為修復前證據。attempt-04 routing-runtime 為 PID40072／port60598，closed=true。
- `regression-01/`：DEV-041 23／23、DEV-096 26／26、DEV-097 23／23；targeted ESLint exit0、1 warning。
  該輪 TypeScript exit2，六筆錯誤位於 install cleanup closure 的 nullable section。
  修正為 early return 後綁定非 nullable section；`regression-02/` 的 TypeScript exit0、targeted ESLint exit0、
  0 errors／1 warning（MainLayout.tsx 的 react-hooks/set-state-in-effect）。兩輪命令及來源 hash分別保存。
- prompt 局部 UI fixture `prompt-browser/attempt-01/` 在取得 Vite served bytes 階段逾時，checks=0，browser尚未開啟；
  保留 failed result，serverClosed／portReleased／cleanupComplete=true。這是 runner 初始化失敗，
  未判為產品 UI 故障，也不補算任何 U 案例 PASS。後續修 fixture的錯誤定位及隨機埠後重跑。
- 以上是 RD 自驗與平行回歸收據，不是獨立 QC；U01～U10的正常入口、真 bfcache與 sealed A→B證據尚需完整收斂。
  本批產品維持實作中／未驗收，未提交、部署或建立新 release package。

### Rev 4 現行驗證摘要（2026-10-03；本地驗收通過）

所有路徑相對於 `output/qa/dev-134/2026-10-03-update-operations/`；下表只陳述實際證據層級，
不將部分 assertion 補算為 U01～U10 完成。歷史首跑 FAIL 與修復後收據均保留；
歷史列的待辦描述只適用當輪，現行結論由下方U01～U10證據對照及最終binding決定。

| 責任面／證據 | 實際結果與限制 | 下一個必要動作 |
|---|---|---|
| service adapter `service-adapter/attempt-05/` → `attempt-06/` | 37 PASS／1 FAIL：自然邊界取得 available 後等待 gate，轉 hidden 再放行仍 reload 一次。修復跨 await 資格重驗後 38／38 PASS；原三筆同步重入也維持通過。這是 service adapter，非手機重現。 | 補真 UI／SW 證據；後續 async 階段見下一列。 |
| service adapter `service-adapter/attempt-07/` → `attempt-08/` | 新增 stable-target 的 pagehide／hidden 與 deferred activation 後 hidden 三組反例。首跑40 PASS／1 FAIL為 host／VM物件prototype比較差異；保持同一SKIP_WAITING payload要求，正規化wire資料後41／41 PASS。三組均走實際claim／release流程，確認無無效navigation、pending target保留及finally解鎖。fixture的IDB／Workbox為最小primitive替身，產品source未因這次assertion修正而改動。 | 凍結候選後保存最終binding，並完成正常入口／SW及資料保護案例；不抵整個U07／U08。 |
| `regression-03/` | DEV-041 23／23、DEV-096 26／26、DEV-097 23／23；TypeScript exit0，targeted ESLint exit0、0 errors／1 既有 warning。 | 候選 source 若再改，重跑受影響檢查並刷新 hash。 |
| renderer `prompt-browser/attempt-04/` → `attempt-05/` → `attempt-06/` | 前兩輪均16 PASS／3 FAIL（19 項）；diagnostic讀回reload.hidden=true、computed display=flex、locator仍可見，確認CSS規則覆蓋隱藏狀態。將同scope的hidden規則移到display規則後，原assertions不變，attempt-06 19／19 PASS、sourceUnchanged=true。10秒readiness、provider重用、遲到隔離與成功結果永久清除均有局部DOM證據。 | 真API／正常入口與焦點情境仍補驗；API為SIMULATION，不抵真入口／U06。 |
| 真 Workbox／入口 `entry-browser/attempt-02/` | 原 10 個 R 瀏覽器回歸通過；sourceUnchanged=true。U01 子頁前置、U02 terminal 等待及 U06 prompt 前置均 FAIL；U06 尚未進行 Back，persisted=0。不得解讀為已量測 bfcache 失敗。 | 修正 harness 前置／定位後重跑；補完整登入分支、五次真返回及 sealed A→B。 |
| 真 Workbox／入口 `entry-browser/attempt-03/` → `attempt-04/` | 前版首跑12 PASS／8 FAIL；第二輪18 PASS／2 FAIL，sourceUnchanged=true。U01角色／正常子頁／鍵盤與U02登入零／一筆任務矩陣、真endpoint去重／10秒逾時重試已通過。U08結果清除案例通過；waiting B使回讀A為VERSION_UNKNOWN，不能代表真Main完整同身分返回。 | 保留原失敗；凍結修復後candidate，補焦點延遲及下一列解鎖。 |
| U08 `entry-browser/attempt-04/` | 真Main關閉選單後service finally已解鎖，menu卻仍禁用並顯示「正在更新」。根因為重複isApplying狀態受選單sequence限制，關閉使finally無法清除；localUpdateBusy=false仍被舊flag覆蓋。 | RD移除選單apply busy副本，直接讀service；原同一反例重跑，不改PASS條件。 |
| U06 `entry-browser/attempt-04/` | 5次核心＋1次等待途中真正pageshow.persisted=true，heap／document／root／menu身分與資料保留；setup=1、listener=2，過期結果／焦點無回寫。原attempt-03 no-store未命中仍保留。 | 只證明隔離no-cache HTML delivery；不推導正式no-store或手機實機。candidate改動後重綁受影響source。 |
| U09 `entry-browser/attempt-04/` | sealed L 78檔驗證通過，真L任務及unsafe草稿保留；發布B後waiting成立，但45秒未載入B。原runner只有bringToFront，尚未驗同profile正常重開。診斷另對無release-meta的candidate fixture發出404，屬runner讀回錯誤。 | 保留失敗；正常reload重開同profile，candidate核對實有app-shell metadata；不修改sealed L、不偽造正式release receipt。 |
| 真入口 `entry-browser/attempt-05/` | 21 PASS／1 FAIL，sourceUnchanged=true；移除menu isApplying副本後，原關閉套用反例PASS。兩個延遲frame案例以真Main callback／service結果驗證local busy與重開menu使焦點失效；只有frame delivery為SIMULATION。U09已同profile載入B並保留unsafe L草稿及本機任務，但收據仍因診斷讀回release-meta 404而FAIL。 | 改為只在發布前讀sealed L release-meta，發布後讀candidate實有metadata；保留404原失敗，不改HTTP gate。補真menu offline／HTTP錯誤與再試。 |
| 最終真入口 `entry-browser/attempt-06/` | 27／27 PASS，47個source檔before／after一致；包含原10個R、正常Main／Quick入口、離線與HTTP503重試、真去重／10秒等待、finally解鎖、延遲焦點、Quick composition／voice／真IDB commit pending保護、sealed L同profile重開至B、6次真返回。visible-error與task／sentinel gates通過。 | 只適用隔離候選及明列SIMULATION；不推導production byte identity、真麥克風、OAuth或手機實機。 |
| 最終補充 `service-adapter/attempt-09/`、`regression-05/` | adapter 41／41 PASS；同一來源before／after相同。DEV-041 23／23、DEV-096 26／26、DEV-097 23／23、tsc exit0；ESLint exit0、0 errors／1既有MainLayout warning。regression-04 wrapper在讀hash清單時失敗，尚未執行產品測試，原錯誤保留。prompt-browser/attempt-06 的19／19以8檔hash一致重用。 | hash／receipt適用範圍見final-evidence-binding.json；不把mock SW與真SW混算。 |

上列已執行 runner 的自有 browser／server 均已關閉且 portReleased=true；原 localhost4000／使用者分頁
未被操作。receipt 中的 branch／HEAD、before／after hashes、SIMULATION與cleanup是證據 binding，
不能推導正常 production bytes 或手機既有 profile 通過。此摘要取代 DEV／map 的即時計數副本；
SPEC 只維護契約。Rev 4文件審查通過；本地驗收當時未提交／推送／部署，後續提交及發版狀態見本文完成度稽核。
文件靜態核對歷史收據：`document-review-rev4/static-readback.json`，8項／23個本地連結與heading anchor通過；
僅適用當時文件hash。現行文件binding另存`document-review-rev4/static-readback-02.json`，保留舊版；
只核對文件，不計產品PASS。

#### 第一批本地驗收結論與證據對照

本地結論由同一Agent完成RD修正，再依凍結候選做QA／事實核對；**非獨立QC**。
U01～U10分母保持不變；下表明列各層證據，未以單一adapter assertion代替正常UI／SW路徑。

| 案例 | 支持本地通過的證據與適用界線 |
|---|---|
| U01 | entry-06真AuthGate／MainLayout／Home／Settings；admin／一般／無看板、登入前prompt、320／390／1440、44px及鍵盤／outside／composition Escape、有效prompt handoff。Auth與migration只為SIMULATION前置。 |
| U02 | entry-06真Quick路由；登入／未登入×零／一筆正常表單任務、DOM身分／install event／RWD；Android／iOS UA及display-mode為SIMULATION。實有資料與account binding、安裝動作保留。 |
| U03 | adapter-09可信比較／fallback／錯誤／R03例外及pure presentation；entry-06真menu成功、BrowserContext離線、隔離server primary與fallback HTTP503後重試。HTTP故障只豁免本例預期503；不清應用failure或產生假最新版。 |
| U04 | adapter-09同步terminal重入、需求提升、caller與flight期限及native guard；entry-06真metadata endpoint同requestId、提升至多一次順序重讀、native update maxActive=1。 |
| U05 | adapter-09 deferred body／fallback／native／caller與flight各自逾時、pagehide及本頁effect取消；prompt-06真10秒readiness DOM與provider重用；entry-06真12秒網路延遲、10秒UI terminal、遲到隔離及再試。 |
| U06 | entry-06原始5核心＋1等待途中persisted事件；同heap／document／root／menu、最新快照、過期結果及焦點失效、資料保留，setup=1／listener=2。adapter補false pagehide與冪等dispose。HTML no-cache為delivery前置SIMULATION，正式no-store與手機不在此結論。 |
| U07 | adapter-09涵蓋單純detection無effect、真正app-open／foreground／view-transition資格與gate／stable-target／activation途中失效；entry-06真Workbox safe app-open更新、雙client隔離及nonce導覽。保留唯一writer／lease／fence。 |
| U08 | adapter-09同步action重入、foreign phase與reservation≠local busy；entry-06真Main finally／延遲焦點及真Quick IME、voice、IDB保存待完成的gate／pending target／資料保護。frame delivery、SpeechRecognition engine及IME事件是明列SIMULATION；保存鎖與capture寫入為真IDB。成功身分永久清除由pure adapter及Quick renderer覆蓋，Main真回讀A遇waiting B為UNKNOWN，沒有假同版成功。 |
| U09 | entry-06驗sealed L 78檔manifest後同profile真root SW升候選B；只正常reload重開，不清資料、不unregister、不直接寫completed。真表單建立的一筆任務／sentinel保留，另一unsafe L文檔timeOrigin／draft／scripts不變；B的新menu可檢查同版，無非預期HTTP／可見錯誤。Android installed為SIMULATION，真手機仍未確認。 |
| U10 | adapter-09 41項、prompt-06 19項（8檔hash重用）、regression-05及entry-06原10個R；正常精確文案／七值去重、資料／cache／安裝與原R03維持。代表320px Main／Quick截圖已目視；其他viewport有截圖及幾何。無新增依賴／schema／週期polling／reload writer。 |

最終binding：`final-evidence-binding.json`將各run的hash與目前產品／verifier逐檔對照，
文件後補不回寫原凍結收據。歷史失敗保留；runtime／session／port皆完成自有清理。
未驗事項：production release artifact與live讀回、使用者手機真installed profile、真OAuth／麥克風及
正式no-store delivery的bfcache可用性。本批驗收不要求重新安裝，不修改正式資源，後續4～5未實作。

## 2026-10-03 更新提示規則去重

- 模式／範圍：使用者明確指定 `optimization-system-health`「執行優化」，本輪採直接低風險修改。Canonical repo `C:\VIBE CODING\ProJED\ProJED`、branch `持續優化3`、起始 HEAD `9924eaa945305b8f8df5f2df0cf3c6f829d84618`，工作樹原為 clean；沿用 DEV-134 的提示維護範圍。
- 問題證據：`AppUpdatePrompt.tsx` 與 Quick Task `pwaUpdatePrompt.ts` 各自持有相同的顯示條件、失敗分類、標題與 fallback 訊息。相同產品契約分成兩處維護 → 調整時需同步修改 → 有漏改其中一處而出現行為分歧的風險；此處是維護風險，未宣稱已造成線上故障。
- 修改：合併至 `src/services/pwaUpdatePresentation.ts` 的純函式，兩個 renderer 使用同一份結果。該模組只以 type import 參考 state，執行時無 React／Workbox／DOM 依賴。主程式測試 override、兩個 renderer 的操作中狀態、按鈕、樣式、reload safety、更新服務與資料存取不變。
- 次要問題：以起始 HEAD 全部原始檔執行 DEV-041，重現 21/22、唯一失敗為「global prompt remains mounted outside AuthGate」。原檢查依賴已不在 `App.tsx` 的 `<AppInstallAssistant />`，實際 prompt 仍在 `</AuthGate>` 後。改為直接檢查 prompt 位於 AuthGate 結束後、PwaReloadSafetyBridge 結束前；保留相同的隔離要求。原失敗證據保存在 `baseline-041.json`。

收益／風險／驗證成本排序：優先合併同義規則（維護來源 2 → 1，renderer 行為風險低，可用原版本逐項比對）；其次修正過時驗證（去除已重現的誤報，產品 runtime 不受影響）。未量測效能，不宣稱速度或 bundle 大小改善。

本輪證據目錄：`output/qa/dev-134/2026-10-03-prompt-health/`。

| 驗證 | 命令／證據 | 結果 |
|---|---|---|
| 修改前後 characterization | `node output/qa/dev-134/2026-10-03-prompt-health/characterize.mjs`；`before.json`、`after.json` | 以起始 HEAD 為 immutable baseline，執行兩個實際 renderer 的 VM adapter。主程式 21,120、Quick Task 2,640 組狀態輸出逐項相同；apply／retry／recover／dismiss 四個操作及 pending／settled 狀態相同。 |
| Shared presentation／既有恢復契約 | `DEV134_REPORT_DIR=output/qa/dev-134/2026-10-03-prompt-health node scripts/verify-dev-134-pwa-recovery.mjs`（PowerShell 以 `$env:DEV134_REPORT_DIR` 設定）；`recovery-result.json` | 20/20 PASS；新增 recovery 優先於 blocked、dismiss 不隱藏失敗、空訊息 fallback、原始錯誤保留及精確文案驗證。 |
| 既有 DEV-041／096／097 | `node scripts/verify-dev-041-pwa-update-notification-cache-recovery.mjs`；`node node_modules/tsx/dist/cli.mjs scripts/verify-dev-096-pwa-update-transaction-convergence.ts`；同方式執行 `verify-dev-097-pwa-safe-reload.ts`；`checks.json` | 23/23、26/26、23/23 PASS。只將文案來源檢查移至共用模組，原行為 assertions 保留。 |
| 型別與 lint | `node node_modules/typescript/bin/tsc --noEmit --pretty false`；targeted ESLint（7 個變更來源檔，清單見 `checks.json`） | PASS。 |

Characterization 比對的是 renderer 產生的結構／文字／屬性與按鈕呼叫，不是真實瀏覽器、Service Worker 或手機實機。初次 runner 僅因 Windows 路徑空白的 URL 解碼問題無法寫收據，修正 runner 後完成 before／after；沒有產品修正因此被掩蓋。既有完整瀏覽器／live 證據仍屬 2026-10-02 發布，不當成本輪驗收。

DEV-134 routing fixture 依既有 harness 記錄 PID `38356`／port `50733`，結束時關閉並確認 port 不可連線，`routing-runtime.json` 的 `closed=true`。本輪沒有開啟 browser／UI；使用者 localhost4000 維持原狀。未執行 production build、Git 提交、部署或遠端資料操作；未做全系統效能審計。下一步為同批程式發布時納入正式驗證；手機實機待辦仍保留。

## 2026-10-03 第二輪：略過相同提示重繪

使用者「繼續優化」延續本地低風險範圍；branch／HEAD 仍為 `持續優化3`／`9924eaa945305b8f8df5f2df0cf3c6f829d84618`，保留第一輪未提交變更。起始三個 renderer／presentation 檔另存 immutable `baseline-*.ts`，其 hash 與第一輪完成證據一致。

問題鏈：`pwaUpdateService.setUpdateState` 在版本檢查更新 `lastCheckedAt`、`latestVersion` 或刷新 safety metadata 時通知 subscribers → Quick Task 每次呼叫 render → 即使呈現不變，仍設定 14 個 DOM 的文字／hidden／disabled 屬性。以真實 renderer 搭配 setter adapter 重現；不是以字串搜尋推定執行次數。

修改限定 `pwaUpdatePrompt.ts`：比較上一個可見結果的七個值（顯示、recovery、標題、細節、updating、applying、recovering），相同時略過 DOM 寫入。新通知仍更新 currentState，首次呈現、真正狀態變化和動作完成仍照原流程更新。這是一個本地 guard，沒有新增訂閱、計時器或共用 state cache；不改更新服務／資料／網路。收益為消除已量測的重複寫入；風險在漏列呈現依賴，使用完整 renderer 比對與操作中／完成後契約保護。

證據根目錄：`output/qa/dev-134/2026-10-03-prompt-render/`。

| 驗證 | 結果／證據 |
|---|---|
| DOM 寫入量（每種狀態各 100 次只變背景 metadata 的通知） | safe、dirty、blocked、recovery 均由 **1,400 → 0**；`before/prompt-render-measurements.json`、`after/prompt-render-measurements.json`。修改前新增檢查如預期失敗，保留在 `before/recovery-result.json`。 |
| Renderer 輸出相容 | `node output/qa/dev-134/2026-10-03-prompt-render/characterize.mjs`；主程式 21,120、Quick Task 2,640 組狀態與 4 個操作逐項相同，`characterization.json`。baseline 為本輪開始時已含上一輪優化的檔案快照。 |
| 受影響回歸 | 將 `DEV134_REPORT_DIR` 設為上述 `after` 子目錄後執行 `node scripts/verify-dev-134-pwa-recovery.mjs`：21/21 PASS；涵蓋 no-op 通知、顯示／dismiss、錯誤原因變更、apply／retry／recover pending 與完成狀態、重複點擊防護、清理冪等。 |
| 型別／lint | `node node_modules/typescript/bin/tsc --noEmit --pretty false`、`node node_modules/eslint/bin/eslint.js src/features/quickTaskCapture/pwaUpdatePrompt.ts scripts/verify-dev-134-pwa-recovery.mjs` PASS。第一輪其他三個 verifier 對應來源未再改動，沿用已保存結果。 |

首次修改後回歸的 adapter 過早讀取跨 VM Promise 的完成狀態，造成按鈕仍為「準備重新載入」的測試失敗；只將測試等待調整為下一個 event-loop turn，產品程式未再修改。該次結果保存在 `after/first-attempt-result.json`。完整 renderer 比對亦等待動作完成。

測量層級是 DOM 屬性 setter 呼叫數，未量測瀏覽器實際 layout、FPS、耗電或手機效能，不能把此數字宣稱為整體加速比例。本輪未開啟 UI／瀏覽器，DEV-134 的暫時 routing fixture 已由 harness 關閉並確認 port 釋放（before／after 各有 `routing-runtime.json`）。沒有提交、部署或遠端操作；下一步為將兩輪維護變更一併納入後續發布前驗證。

## 2026-10-02 舊安裝 bootstrap 重現

使用實際 sealed 舊版 `20261002013716-5cf1b1` 與 current `20261002054439-a538f0`，隔離 Chromium 模擬 Android installed；封鎖所有非 fixture origin 的請求。保留另一舊 client 時，普通 shortcut 仍讀舊版；network-bypass URL 可讀新版但 waiting worker 未自動啟用，回 shortcut 又退回舊版。關閉全部 fixture origin clients 再開原 shortcut 後，新版 marker／三點選單／本機已建立任務／localStorage sentinel 均讀回，task details 展開，page errors=0。

結果 `output/qa/dev-134/legacy-bootstrap/result.json`／代表圖 `output/playwright/dev134-legacy-network-bootstrap.png`；初次 harness selector 量測錯誤保留為 `result-initial.json`／`run-initial.log`，不能當 UI failure。兩正式更新連結仍回相同 live release/source/hash；runtime.json 的 browserClosed／portReleased=true。沒有產品 source 改動、沒有遠端 RPC 或使用者 browser／手機操作。這證明一條保留資料的人工 bootstrap 流程，沒有證明舊安裝已自動升級或使用者手機一定存在其他 client。操作指引及既有說法更正見 [REL-015 bootstrap 補記](../release/REL-015-DEV-134-QUICK-TASK-PWA-20261002.md#2026-10-02-舊安裝-bootstrap-與操作指引更正)。

## 範圍與來源

歷史快照（2026-10-01）：人類指令為本 chat「請依此修復」「繼續」，當時執行本地程式／設定／文件／驗證，沒有正式部署授權。2026-10-02 後續收到 live 部署明確授權，部署證據記於本文件發布後補記及 [REL-015](../release/REL-015-DEV-134-QUICK-TASK-PWA-20261002.md)。

Canonical repo `C:\VIBE CODING\ProJED\ProJED`，branch `持續優化3`，起始 HEAD `57f8c8d3a751c8698a0e28539a9187868aff1873`。本輪 PWA／release target 起始為 clean；其他 DEV-133／122／034／038 等既有 dirty 修改保留，未 stage／commit／還原。QA frozen R01～R10 位於 [SPEC-041 DEV-134 addendum](../specs/SPEC-041-pwa-update-notification-cache-recovery.md#dev-134-pwa-失敗恢復-corrective-addendum2026-10-01)，發布封裝補正見 [SPEC-083 §18](../specs/SPEC-083-production-release-environment-integrity.md#18-dev-134-前版資產相容補正2026-10-01)。RD 自驗與本地 QA 蒐證由同一 Agent 分階段執行，不宣稱獨立 QC。

已確認的故障鏈：舊 chunk URL 在 Hosting 回 HTML 200；舊頁面可能仍受舊 Service Worker 控制；failed transaction 被持續重用、原因遭後續檢查清空；背景 registration/update 失敗也被誤歸類為畫面載入失敗。[REL-014](../release/REL-014-DEV-133-INDEPENDENT-AUTH-20261001.md) 的舊 profile／waiting SW／人工清快取歷史保留，未被本地 PASS 改判為自動更新成功。

## 修復與證據

- Failed transaction 保留錯誤碼與原因；舊 schema v1 可讀。背景檢查不重新啟動 failed activation，不能掩蓋本分頁真實 load/cache failure。
- 明確「重試」取得最新 target，以新 transaction ID／lease／fence 重試；保留跨分頁鎖。已在目前版本的殘留 update failure 退場；真正 load/cache failure 必須安全導覽才恢復。
- Retry、load recovery 與人工 cache recovery 都先檢查本分頁 readiness／dirty owner；互斥操作、保留業務儲存。恢復 URL 由真正網路取得 HTML，Workbox NavigationRoute 排除該 query。
- UI 分開顯示更新未完成、畫面載入失敗、快取恢復未完成；手機按鈕可換行，鍵盤有焦點提示。
- 新發布封裝保留前版自身 immutable assets 與 hashed Workbox runtime，驗證原 tree／每檔 hash／路徑／碰撞，排除更早繼承資產。部署前比對當前正式 release binding。Hosting 缺 assets 回 404。

| 驗收 | 本地證據 | 結果與界線 |
|---|---|---|
| R01 | Adapter 舊 v1／三次 replay；真 SW 重整及三次 metadata check | 原因保留、無背景重啟或循環導覽 PASS |
| R02 | 真實 UI「重試」→新 tx-retry→A/B 雙分頁 | 單次 SKIP_WAITING；unsafe 舊分頁等 readiness 後才重載；兩分頁讀到 B PASS |
| R03 | Adapter 與真 browser current=latest／殘留 failed | PWA failure 退場、無導覽、draft sentinel 保留 PASS |
| R04 | Register/update/metadata fault injection；真 browser offline | 現有 app 無假載入失敗提示；waiting/activated 不掩蓋真錯誤 PASS |
| R05 | Booting／dirty／unknown gate；真 load error＋跨 tab storage event | 不導覽、不清儲存；本分頁 load reason 保留 PASS |
| R06 | 真 controlled A worker 以 recovery query 導覽到 B | 伺服器收到 nonce GET，B HTML／身分讀回 PASS |
| R07 | 封裝 fixture 的 hash、tamper、collision、路徑、目錄 junction、共有資產及 generation | 範圍內拷貝、前版 generation bounded、非法情況拒絕 PASS |
| R08 | Firebase Superstatic matcher／實際 loopback HTTP | assets 404、SPA MAIN、quick-task QUICK PASS；Windows legacy URL slash 在隔離驗證程序採 Hosting POSIX 正規化，未改 dependency；正式 readback 待發布 |
| R09 | 實際 React prompt 的 320／390／1440、三種 failure、normal／blocked、鍵盤 | 15 張截圖、viewport／overflow／focus 量測 PASS；獨立 UI context 停用 background producer，生命週期另以真 SW 驗證 |
| R10 | 真 A→B／雙 tab／reload 的 localStorage、cookie、IDB、Cache Storage sentinel | Sentinel 保留且舊 release cache 未回收 PASS；僅為隔離儲存證據，不宣稱測試正式登入 Session 或使用者原 profile |

`output/qa/dev-134/recovery-result.json`：16/16；`browser-result.json`：9/9，source digest 在 browser run 前後一致。Browser requests 含兩分頁自己的 recovery GET 與舊 controller 的 network bypass GET。`output/playwright/dev-134/` 保存代表截圖；已目視檢查 320 更新失敗與 390 載入失敗畫面。

## 2026-10-02 Quick Task 更新生命週期補正

使用者回報正式站手機 App 仍呈現舊版。遠端 fresh-browser readback 在兩個 Firebase origin 都是同一 current release；source review 找到 quick MPA 雖註冊共用 root worker，卻未啟動 `pwaUpdateService`。從 quick shortcut 開啟不會執行 main SPA lifecycle，這使 waiting worker 缺少 quick client 的版本檢查與安全套用入口。

修正位於 `src/quickTask/main.ts`：先完成 quick reload-safety owner 註冊，再延遲匯入共用更新器。`vite build --mode test` isolated build PASS；quick bundle `quickTask-*.js` 33.14 kB（gzip 11.63 kB），`pwaUpdateService-*.js` 另成延遲 chunk 34.44 kB（gzip 10.70 kB），確認不會進入首屏 quick graph。沒有新增 worker、遠端資料寫入或使用者資料清除。

| 驗收 | 證據 | 結果／限制 |
|---|---|---|
| Q01 | `scripts/verify-dev-122-mobile-zero-data-quick-task.ts`，指定隔離 build 輸出 | 26/26 static assertions PASS；含 safety-ready 後才載入共用 updater、不靜態引入 updater |
| Q02 | `scripts/verify-dev-134-pwa-recovery.mjs` | 17/17 PASS；R11 quick-shell lifecycle source contract PASS |
| Q03 | `scripts/verify-dev-134-pwa-recovery-browser.mjs` 的真生成 Workbox A→B | 10/10 PASS；A controlled quick page讀到延遲 updater，觸發更新後以 B release marker 重載，title control enabled 並留在 `/quick-task/`；R01～R10 同輪 PASS |
| Q04 | TypeScript、變更檔 ESLint、isolated production-mode test build | 均 PASS；建置輸出獨立留在 `output/qa/dev-134/2026-10-02-quick-update/build-test/` |

瀏覽器證據位於 `output/qa/dev-134/2026-10-02-quick-update/browser-final/`；R11 截圖與測試 runtime 在 `output/playwright/dev-134/2026-10-02-quick-update-final/` 及同層 runtime 收據。測試 browserClosed／portReleased 均為 true。首次 R11 因本機 fixture 未將 `/quick-task/` 正規化成 `quick-task/index.html` 而 timeout；修正 fixture 後全套重跑 PASS，初次失敗證據保留於 `browser-retry/`。這是隔離 Chromium／本機雙 build 驗證，不代表使用者 Android／iPhone 實機驗收。

初次 browser R02 的 evaluate promise 被成功導覽中斷，及混用 lifecycle／synthetic UI 的 timer 競爭保留於初次收據／本輪工作紀錄；改以 loaded target readback 及獨立 UI context 驗證，未取消行為 oracle。正式最初截圖／REL-014 failure 保留。

## 命令與清理

- `node scripts/verify-dev-134-pwa-recovery.mjs`：16/16 PASS。
- 已安裝 Playwright CLI 的 `PLAYWRIGHT_CLI_PATH` 綁定後，`node scripts/verify-dev-134-pwa-recovery-browser.mjs`：兩個小型 adapter Vite build，`PROD=true`／mode=qa，實際 service／prompt／Vite Workbox 設定，9/9 PASS。未安裝依賴，未連遠端 backend。
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`：PASS。
- Targeted ESLint：PWA service／transaction／prompt、三個 release scripts、DEV-134 adapter/browser runner、DEV-097 verifier PASS。
- DEV-096 transaction 26/26、DEV-097 safety 23/23、DEV-083 production release gate mock regression PASS。既有 source-shape assertion 只放寬新增 retry reservation 的位置，原 completed-version 行為 oracle 保留。

HTTP routing fixture 與 browser fixture 均在啟動前記錄 project／PID／port／purpose／cleanup condition。最新 browser session `dev134-e7f8f12d`／PID `32884`／port `53930` 已關閉、確認連線拒絕；routing runtime 也已關閉。明確 session close 後不存在 task `.session` 檔；未操作使用者 browser 或 localhost4000。清理收據：`routing-runtime.json`、`browser-runtime.json`。

部署前快照（2026-10-01）：當時尚未生成 sealed package、未提交／部署、未驗證正式既有 profile。此狀態已由 2026-10-02 發布後流程更新；當時敘述保留作為稽核時間脈絡，不代表目前 live 狀態。

## 2026-10-02 發布後 live 驗證補記

產品程式 commit `e9317e66e3cbe5c9163a27a2bf045611ea0760cf` 已推送至 `origin/持續優化3`，live release `20261002034352-6ee8fb` 已部署至 Firebase Hosting site `projed-cc78d`。部署前 DEV-122 static 26/26、DEV-134 static 17/17、Workbox A→B browser 10/10（含 R11）、TypeScript、targeted ESLint、staging artifact secret scan 及 DEV-083 release readiness/candidate gates 均 PASS。該驗證由同一 Agent 分階段執行，不宣稱獨立 QC。

| 驗收 | 證據 | 結果／限制 |
|---|---|---|
| Level 3 preview | `output/release/dev-083/level3-evidence-e9317e6.json`；短期 URL `https://projed-cc78d--level3-smoke-lvbe8d9u.web.app` | Quick Task 390×844 read-only smoke PASS；無 page error／failed request；沒有 TEST data writes。預覽通道按設定於 2026-10-03 到期。 |
| Production candidate | `output/release/dev-083/20261002034352-6ee8fb/candidate-evidence.json` | readiness、production-bound readiness、credential gate、75/75 artifact provenance、browser smoke、OAuth safe-cancel PASS；live before／after 相同。短期 URL `https://projed-cc78d--production-candidate-lpejam4w.web.app`，按設定於 2026-10-03 到期。 |
| Live activation | `output/release/dev-083/20261002034352-6ee8fb/activation-evidence.json` | activation PASS；sealed tree SHA-256 `7d7683fea31d3845af09afdd017ac604d1bb8cfc8ec41ee8c4e0285b4c5dd7bb`，75/75 entries provenance PASS，正式 root browser smoke 與 OAuth safe-cancel 302 PASS。 |
| Dual-origin readback | `output/qa/dev-134/2026-10-02-quick-update/live-readback.json` | `https://projed-cc78d.web.app` 與 `https://projed-cc78d.firebaseapp.com` 的 `/quick-task/` 均為 HTTP 200；release/source commit 一致；sealed Quick Task HTML、`assets/quickTask-BPLQbL9L.js` 與 `assets/pwaUpdateService-Di102aP1.js` SHA-256 全相符。 |
| Live Quick Task browser smoke | release 驗證收據及部署後 canonical 390×844 smoke | title／submit controls enabled、延遲 updater 已載入、root `/sw.js` active、無 page errors／failed requests。這是 fresh browser 網站驗證，不代表使用者既有手機 profile 或 Android／iPhone 實機驗證。 |

沒有執行 live database／business data writes、Auth／IAM 變更或使用者資料清除。部署不能改寫已在使用者手機執行中的舊 JavaScript；手機既有安裝須完整關閉 app 後重新開啟一次以載入新版 shell，屆時仍要由使用者確認結果。不得要求清除資料或解除安裝，以免影響尚未同步任務。

## 2026-10-02 Quick Task 更新提示與主程式一致

Quick Task 在原有安全生命週期上接入相同的可見更新提示。safe 狀態仍依共用 updater 自動套用並保持安靜；dirty／blocked 狀態顯示「新版已就緒」，由「重新載入」呼叫同一 safety gate、或選「稍後」記住 dismiss；recoverable load／update failure 顯示既有錯誤文案及「重試／清除快取後重整」。沒有新增 worker、資料清除路徑或同步協定。

| 驗收 | 證據 | 結果／限制 |
|---|---|---|
| Q05 | `node scripts/verify-dev-134-pwa-recovery.mjs` | 19/19 PASS；新增 R12 source wiring、safe 靜默、dirty／blocked prompt、recovery states 與 dismiss contract。 |
| Q06 | `node scripts/verify-dev-134-quick-task-update-prompt.mjs` | 9/9 PASS；safe 隱藏、dirty 提示與兩個 CTA、共享 dismiss/apply、recovery retry/cache actions、320×844 無水平溢出。 |
| Q07 | TypeScript、變更來源 ESLint、`git diff --check` | 均 PASS。 |

代表畫面：`output/playwright/dev134-quick-task-prompt-320x844.png`。驗證 harness 使用 task-owned Vite／Playwright runtime，結束時 browserClosed=true、portReleased=true。這是隔離瀏覽器行為驗證，部署後的手機舊 client／實機是否已套用仍須實機回報；部署本身不會替手機執行中的舊 JavaScript 熱換程式。

本地 PASS 後的一次重跑在 UI 測試開始前被 Playwright CLI 擋下（`EPERM`，無法開啟已安裝 Chromium 目錄）；harness 已關閉該次 browser session 並釋放 port。先前保存的 9/9 行為驗證結果未被覆寫；同輪 R12 static、型別及 lint 仍 PASS。這是執行環境啟動錯誤，沒有形成產品行為的反證。

## 2026-10-02 Quick Task 更新提示正式部署驗證

Live release `20261002091531-2a1246`，source commit `23a566bf49ae2e2cdf5e7b5bc6bad48cc174a18b`。`output/release/dev-083/20261002091531-2a1246/direct-evidence.json` 記錄 `published=true`、`complete=true`、`verification=passed`：canonical origin sealed artifact provenance 78/78、app-shell browser smoke PASS、read-only Quick Task hosted feature smoke PASS（預期 release ID 相符、提示元件已掛載但 safe 狀態隱藏、320px 無水平溢出、page/runtime errors=0、remote RPC writes=0）。

另對 `https://projed-cc78d.web.app` 及 `https://projed-cc78d.firebaseapp.com` 讀回 `release-meta.json`、`quick-task/index.html`、Quick Task entry JS/CSS、PWA prompt chunk、PWA update service chunk；各 6 個路徑皆為 HTTP 200，release/source identity 與 sealed artifact SHA-256 完全一致。這驗證兩個網站 origin 提供新版；不代表手機原有 service worker client 已重啟，真機畫面仍待使用者確認。此輪未變更 DB、Auth、IAM 或使用者資料。
