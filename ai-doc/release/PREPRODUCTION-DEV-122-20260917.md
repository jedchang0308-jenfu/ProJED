# DEV-122 Level 3 Preview 證據（2026-09-17）

- 狀態：`LEVEL 3 PASS / PRODUCTION CANDIDATE PASS / LIVE ACTIVATED / CANONICAL VERIFIED WITH ACCEPTED EXCEPTIONS`
- 範圍：DEV-122 R12的Level 3、inactive production candidate與REL-002 live activation完整證據；未執行migration。
- Source commit：`5ee11786da4db07b9f125b0e315873dda479d1c9`
- Branch：`持續優化3`
- Build：`npx vite build --mode staging`
- Build id：`build:1789633911661-dvbj8ij0`
- Staging backend：Supabase `ProJED-TEST` ref `fhisnnufoeulxqrchldf`；production ref `knodlkxqpcqyrtgwpdst` 未被使用。

## Firebase candidate

- Project／site：`projed-cc78d / projed-cc78d`
- Channel：`level3-smoke`
- URL：<https://projed-cc78d--level3-smoke-ua5z9m3e.web.app>
- Quick route：<https://projed-cc78d--level3-smoke-ua5z9m3e.web.app/quick-task/>
- Install guidance：<https://projed-cc78d--level3-smoke-ua5z9m3e.web.app/quick-task/?install=1>
- Firebase release：`1789633982758000`
- Firebase version：`f9dc1b54dc9eda25`
- Release time：`2026-09-17T08:33:02.758Z`
- Expire time：`2026-09-18T08:32:57.824Z`（Asia/Taipei 2026-09-18 16:32）
- Version：46 files／1,650,315 bytes

## Exact artifact and hosted smoke

本地 staging `dist` 與線上 candidate 逐檔比對結果：

| 資產 | SHA-256（local = hosted） |
|---|---|
| `quick-task/index.html` | `83810D583A5AEC8498847EA883C87EA2FBF6F3A2313824A05D484CB1DC7713D7` |
| `assets/quickTask-UTwriYyX.js` | `C73354AE4E63760252883CAC7D4D4D3DAC7F150020E33245D4A1D47729951E6C` |
| `assets/quickTask-ljCA9-lh.css` | `7969F6AEB5759968424FEDBFB6EA82C52321B5D7F27BD1D6A93B67814794D142` |
| `quick-task/manifest.webmanifest` | `AB8FA8F746915980CD7E850CA8AEEFE3BAF02917309E8D4EDCEDDB22863FFA67` |
| `manifest.webmanifest` | `BCFFCA69C7D10D1C363768AA1194D25ADFB80B0D1343B02B14BE414E02D09D7A` |
| `sw.js` | `4E1B9699049F42619093D16B45602807F59E9CDDA06B9CE0AFA8F90502F2E143` |

自動驗證：

- `scripts/verify-level3-firebase-preview.ps1`：HTTPS root browser smoke PASS；root shell、main bundle/style、page error 與 critical request failure 均為 0。
- `output/playwright/dev-122-mobile-zero-data-quick-task/level3-result.json`：390×844 quick route PASS；`window.isSecureContext=true`、title 欄自動聚焦、語音按鈕 78×56 px、`/quick-task/` manifest identity、root shortcut `/quick-task/`、`sw.js` precache、`?install=1` 引導均通過；console/page error、failed request、業務 API request 均為 0。
- 直接 HTTPS probe：`/quick-task/`、`/quick-task/?install=1`、兩份 manifest、`sw.js` 均 HTTP 200；rewrite 與 content type 正確。

## Production-sealed inactive candidate（2026-09-17）

- Immutable release：`20260917080116-1a5f27`；source commit `5ee11786da4db07b9f125b0e315873dda479d1c9`、artifact tree SHA-256 `47442a73f5a5f75f31b4d204cde368a92cd24470d39bd5a0ad6fa809c4ccf383`、45 entries，manifest為`output/release/dev-083/20260917080116-1a5f27/manifest.json`。
- Firebase inactive channel：`production-candidate`；URL <https://projed-cc78d--production-candidate-tsxgwy67.web.app>，成功驗證輪次的Firebase release `1789647388181000`、version `ad1cbf5d599ad671`。candidate建立前後，live均為release `1789443231001000`／version `3bd57d3bc4a345a9`，未切換正式流量。
- `candidate-evidence.json`：production readiness、credential policy、OAuth safe cancel、browser smoke及45/45逐檔size／SHA-256 provenance全部PASS。Firebase channel第一次部署後的固定URL曾被Node fetch命中舊404負快取；release verifier已改用release ID query cache key並保留bounded retry，21項release-gate self-check PASS。
- 390×844 quick smoke：`output/playwright/dev-122-mobile-zero-data-quick-task/production-candidate-result.json`為PASS；名稱欄空白且自動聚焦、語音按鈕56px且accessible name正確、quick manifest 200、root App marker為0、首次render業務request為0，console／page／same-origin HTTP錯誤皆為0。
- Production-safe same-account smoke：`output/qa/dev-122/production-candidate-same-account-result.json`為PASS。一次性帳號在quick頁建立唯一合成title，送出前業務request=0、`create_quick_unplaced_task_v1`=1、IDB狀態=`synced`；quick與root工作台讀到相同actor，工作台exact match=1，authenticated canonical DB readback row=1／title=1／owner與capture均一致。
- Cleanup：task、tenant、profile、Auth user均已刪除，residual task/profile/tenant count皆為0；task-owned Playwright session與暫存script已關閉／刪除。失敗診斷輪次亦每次先完成相同cleanup，未留下正式資料fixture。
- 可重跑guarded executor：`npm run verify:dev-122-production-same-account -- --target-url <allowlisted-origin> --release-id <id> --artifact <path> --allow-production-fixture`；另須同時設定`DEV122_ALLOW_PRODUCTION_FIXTURE=1`，缺任一明確opt-in即拒絕正式fixture。

## 本輪相容回歸執行（2026-09-17）

- DEV-122 local targeted：static 25 assertions、quick SM01～SM15、root R01～R03／B22～B24、service-worker、isolated PostgreSQL與concurrent transport PASS。
- 受影響回歸：DEV-034 static／browser PASS；DEV-041 static 22/22／browser PASS；DEV-096 static 26/26／browser PASS；DEV-097 static 23/23／browser／real-SW PASS；DEV-115 static 21/21／browser B01～B09 PASS。quick／root／compatibility browser均重用既有 `localhost:4000`，未停止 pre-existing PID 25128。
- DEV-096 real-SW 本輪連續兩次重跑均在 B→C controller convergence 失敗：`release:dev096-A` 未進入 `release:dev096-C`，transaction phase=`awaiting-controller`；最新 fail artifact 為 `output/playwright/dev-096/sw-integration-result.json`，兩次 task-owned temporary runtime 均已釋放。這是目前 verifier timing regression，保留 fail artifact，不把歷史 PASS 重用為本輪 PASS，也沒有修改產品或 oracle。
- 這些 local／compatibility 證據不把device、DEV-096 real-SW或完整B/W/P缺口改寫為PASS；使用者已接受它們作為本次release殘餘風險。在production gate完成前DEV-122仍維持未完成，其後已由REL-002完成替代結案條件。

## 本次豁免邊界

依本次使用者決策，本 release 不執行以下 Android／iPhone 實機驗證：

- 安裝／更新後的 shortcut 呈現與 shortcut launch（D08／D10）。
- 真實 microphone permission、鍵盤聽寫與 voice fallback（D06 的 voice 部分）。
- 建立後返回同帳號工作台及跨帳號邊界（D09）。

此 waiver 只是不執行上述實機案例，不把它們改寫成 PASS。使用者其後另行接受其他未完成的 D01～D07、D08～D10 子案例、DEV-096 real-SW最新FAIL、完整 B/W/P、效能、正式 Supabase full matrix與獨立 QA/QC缺口作為本次release殘餘風險；原始case與artifact狀態不變。

## Release-owner exception decision

- 決策日期：2026-09-17。
- 類型：`Intentional release exception`。
- Accepted residual risks：Android／iPhone實機shortcut／voice／同帳號返回未執行；DEV-096 real-SW B→C controller convergence最新兩次FAIL；完整B01～B24、W01～W07、P01～P14、效能、正式Supabase full matrix及獨立QA/QC未執行。
- 這不是被豁免案例的測試PASS，也不授權live activation、migration或push。其後使用者已另行授權正式環境測試與exact release activation；本文件上節記錄的production-sealed inactive candidate與production-safe同帳號fixture只代表當時的非live gate，live啟用事實以本文件REL-002段落及terminal release record為準。
- 當時已完成production sealed artifact與source provenance、inactive production candidate、candidate root／quick browser smoke、production-safe同帳號唯一單筆建立readback與cleanup；其後REL-002另取得exact release核准，並完成canonical root／`/quick-task/`／兩份manifest／`sw.js` smoke、canonical同帳號單筆建立readback與cleanup，以及terminal release record。
- REL-002啟用前確認的rollback anchor：Firebase version `3bd57d3bc4a345a9`，release `1789443231001000`（2026-09-15T03:33:51Z）。若REL-002需回復，依release gate使用此已確認anchor。
- Production gate已全數完成，DEV-122終態為`Production Verified with Accepted Exceptions`。

## REL-002 Production Activation（2026-09-17）

- 使用者核准release `20260917080116-1a5f27`啟用至`projed-cc78d` live channel；Firebase live release=`1789648827546000`、version=`59da8efd9cc1e02c`、release time=`2026-09-17T12:40:27.546Z`。
- Activation evidence：45/45 canonical artifact provenance、production readiness、credential policy、root browser與OAuth safe-cancel均PASS。
- Canonical HTTP：`/`、`/quick-task/`、`/quick-task/?install=1`、兩份manifest、`sw.js`與release metadata均200。
- Canonical quick 390×844：title空白自動聚焦、語音入口56px、accessible name正確、root marker=0、初始業務request=0，browser／HTTP error=0。
- Canonical same-account：quick RPC=1、IDB=`synced`、quick與root actor一致、工作台exactly one、authenticated DB exactly one；task／tenant／profile／Auth user cleanup完成，residual counts=0。
- Terminal record：[REL-002](REL-002-DEV-122-20260917.md)。DEV-122終態=`Production Verified with Accepted Exceptions`；accepted residual risks仍保持原始FAIL／Not verified／Waived事實。

## 回復與清理

- 此 channel 以 `--expires 1d` 建立，會自動到期；若需提前清除，使用 `firebase hosting:channel:delete level3-smoke --project projed-cc78d`。
- 本次已依使用者核准修改Firebase live channel；未修改Supabase schema或migration。production-safe合成fixture已建立、驗證並完整清除，residual count為0。
- 本次 task-owned Playwright browser 與臨時 smoke script 已關閉／刪除；既有 localhost:4000 test server 未觸碰。
