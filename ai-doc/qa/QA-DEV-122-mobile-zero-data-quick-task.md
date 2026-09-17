# QA-DEV-122：ProJED 手機零資料載入快速建待辦

- 狀態：`QA Plan Ready / Architecture Frozen R12 / DEV Reopened / WP-122-0B Not Yet Executed`。
- 修訂：Tech Lead R12補齊root manifest唯一來源／build輸出、真實icon metadata、既有安裝更新、同帳號安全證明與平台矩陣；新增W07／D10並強化S15／D09。R10以前的static／browser／DB／HTTPS evidence只作回歸基線，不包含R12。
- 對應 SPEC：[SPEC-122](../specs/SPEC-122-mobile-zero-data-quick-task.md)。
- 對應 DEV：[DEV-122](../dev_task.md#dev-122projed-手機零資料載入快速建待辦)。
- Architecture Memory：[ADR-050](../decisions/ADR-050-mobile-quick-task-entry-and-outbox.md)。
- Risk lane：Medium；新增mobile／desktop install launch surface，且既有交付跨PWA identity、voice permission、local transaction、auth claim及UI/API/DB delivery path。
- 驗證角色：RD 先在同一 candidate執行 self-test；QA 依本文件重跑；QC凍結 source/artifact後只觀察事實，不修改產品。

## 1. 驗證目標與正常 delivery path

證明使用者從ProJED主程式的app shortcut或選用的第二個手機桌面圖示進入`/quick-task/`後，原生HTML任務名稱欄位立即可編輯，旁邊直接可見「語音」；一般點擊ProJED仍開`/`。兩種quick入口維持同源Auth與相同建立路徑，先由IndexedDB transaction/readback形成durable local fact，再以同一capture id經Supabase RPC成為登入帳號全域任務工作台的canonical未歸位任務。

正常 delivery path 固定為：

```text
已安裝ProJED → 支援平台app shortcut「快速建待辦」
  或：手機桌面選用的「ProJED快速建待辦」圖示
→ /quick-task/ raw form
→ 打字或點「語音」更新同一 title input
→ 使用者點「建立」／鍵盤 done
→ IDB add + complete + readback
→ 成功畫面「已記下…」
→ session claim + owner/token snapshot + leased single-item RPC
→ task + immutable receipt 同一 DB transaction → receipt validation
→ 成功畫面「已建立」
→ 使用者點「前往工作台」
→ /?quick_workbench=1 → root登入恢復 → 既有open command → 單一工作台面板未歸位lane
```

DB fixture只能建立帳號、workspace/member、目標 board等前置條件；本案例預期的未歸位 task必須由 quick UI／RPC delivery path產生，不得由 seed直接插入後冒充 E2E PASS。

## 2. Candidate Freeze、環境與資源

每輪執行前記錄：

```text
date/timezone + branch + HEAD + git status --short
changed-source hashes + verifier hashes + migration hash
build id / artifact tree hash / app-shell-meta version
base URL + route + backend + Supabase project ref
browser exact version + OS + viewport + deviceScaleFactor
real device model / OS / browser / installed app identity
actor A / actor B + fixture namespace + workspace/board IDs
runtime project / purpose / port / process tree / cleanup condition
```

若使用現有 `localhost:4000`，先確認是相同 project、test mode及 candidate；不得停止其他任務擁有的 runtime。新開的 Vite、Hosting preview、PostgreSQL、browser session或裝置測試 surface都須先記 owner，結束前只清除本任務建立的資源並確認 port／session釋放。正式 production、真實使用者資料與未經核准的遠端 mutation不在本 QA。

## 3. Controlled Fixtures

### 3.1 Browser fixture `DEV122-QUICK-V1`

- actor A：已登入 local-test／Supabase TEST session；有兩個 active workspace，`projed-last-ws` 指向第二個。
- actor B：另一帳號；至少一個 active workspace；不得看見 A 的 local/remote title。
- 未登入 context：建立一筆含中文、英文與標點的 title；產生可驗證 claim nonce/hash，沒有個資。
- voice fake：supported final、interim+final、duplicate final、denied、no-speech、network error、unsupported。
- storage fake：success、transaction abort、quota error、stale lease、two-tab lease contention。
- race fixture：可在snapshot／getUser回覆／fetch dispatch／RPC response前暫停並切換A→B；只能記actor alias，不將JWT寫入trace。
- navigation fixture：root面板關閉／已開、settings／home／無active board、root需登入、storage不可用；驗證實際panel而非只驗URL。
- 所有 title 使用 `DEV122-QA-*` 合成資料，不含真實工作內容。

### 3.2 Isolated DB fixture `DEV122-DB-V1`

- PostgreSQL loopback isolated runtime；bootstrap最小 `auth.users`、profiles、tenants、tenant_members、unplaced table、RLS helper與 touch trigger。
- actor A有 workspace A1/A2；A2 hint合法。actor B有 B1。actor C沒有 active membership。
- 加入 private receipt table／RLS／grants；pre-existing fixture 區分已成功 receipt、hash mismatch、無 receipt 的 id collision、malformed row 與 near-order-limit，不能用 live title 當去重基準。
- N=20 concurrent captures用於 advisory lock與 unique append order；另以 N=40 mixed-writer-compatible captures（20 Quick RPC＋20 test-only existing append fixture）驗證共用 lock domain 的 40 個連續唯一 order；不連 production Supabase。

Fixture sanity不符 actor、membership、session、route、manifest identity或 clean expected result時整輪 Fail／Blocked，不能用空畫面或預置完成資料通過。

## 4. WP-122-0 Target-device Feasibility Gate

以同一個 approved non-production HTTPS candidate各執行 iPhone Safari與 Android Chrome：

| ID | 操作與通過條件 |
|---|---|
| D01 | 原 ProJED已安裝／未安裝各一次；從設定 CTA進 quick install mode，能辨識「ProJED快速建待辦」名稱及不同 icon。 |
| D02 | iOS Safari分享→加入主畫面後，兩個 icon同時存在；quick icon點開首個 document pathname為 `/quick-task/`。 |
| D03 | Android Chrome native prompt或明確 browser menu流程後，兩個 icon同時存在；quick icon不啟動 root App。 |
| D04 | 用非敏感 IDB sentinel 分別寫入 root／quick context、關閉重開，記錄共用或隔離；無需 OAuth／outbox，測後移除 sentinel。 |
| D05 | WP-122-1／5：已快取後離線重開 quick icon及install query得到 quick form；不被root fallback接管。 |
| D06 | WP-122-2／5：真實 microphone accepted／denied、keyboard dictation fallback、visibility hidden與late final在兩平台有可用路徑。 |
| D07 | WP-122-4／5：在同一 installed quick context 完成 OAuth、關閉重開及相同 capture 補送；隔離 storage 時不可假借 root session。provider cancel／callback error／expired nonce可恢復，query清理不破壞SDK。 |
| D08 | WP-122-0B：全新安裝root ProJED；一般點擊仍開`/`。在實作manifest shortcuts的平台，由系統提供的長按／右鍵入口選「快速建待辦」後，首個document pathname為`/quick-task/`、title可立即輸入且business list request為0；記錄裝置／OS／browser與可見入口。 |
| D09 | WP-122-0B：TEST actor A登入root後由root shortcut進quick，建立合成待辦；request使用凍結的A snapshot／Bearer token，server receipt `ownerId`等於A且root工作台以A看見該筆。切到B、過期或無session時不得把A草稿送成B；只維持本機未綁定／待登入。OAuth claim另驗`getUser(snapshot.accessToken)`，但直接同步不得只靠UI帳號文字判定。選用獨立quick圖示若平台隔離session，重新登入是正確結果。 |
| D10 | WP-122-0B：先安裝不含shortcut的build A，再以同一root `id/start_url/scope`更新到build B；記錄manifest版本、service worker control、瀏覽器／OS更新狀態與shortcut實際呈現。Chromium QC可使用`chrome://web-app-internals`，Android WebAPK可使用`about://webapks`輔助診斷；等待／重新啟動步驟依平台官方流程，不宣稱立即更新。未提供shortcut UI的平台記N/A並驗設定頁CTA／獨立quick fallback，不能以direct URL冒充。 |

D01～D04是WP-122-0必要案例；D08～D10是WP-122-0B必要案例。D02只適用iOS第二圖示，D03只適用Android第二圖示；D08／D10只有平台實際提供manifest shortcut UI時才要求shortcut操作，未實作的平台記N/A並驗fallback，不可記shortcut PASS。D05～D07於後續指定WP／最終真機驗收通過。缺裝置或新的R12 HTTPS candidate為Not verified。root shortcut不能代替第二App gate，第二icon也不能代替主程式bundled shortcut宣告；implementation bug先回RD修正。

平台適用性：Android Chrome/WebAPK與Chromium桌面是D08／D10主要required platforms；macOS Safari 17.4+在可用裝置上作supplemental；iOS/iPadOS不要求manifest shortcut UI，必須驗證一般root launch、設定頁CTA與選用加入主畫面流程。平台N/A只豁免OS捷徑呈現，不豁免S15、B22～B24、W07或fallback。

## 5. Static／Pure Cases

| ID | 驗證 |
|---|---|
| S01 | Vite two HTML inputs產出 `/index.html`與`/quick-task/index.html`；quick HTML直接含 form、title input、語音與建立 control。 |
| S02 | quick initial import graph無 React、`App`、Zustand store、`dataBackend`、`authService`、Firebase、Supabase、Workbox及各業務 service。 |
| S03 | root manifest `id='/'`；quick manifest `id/start_url/scope='/quick-task/'`、name正確，manifest與apple-touch icon資產皆存在且PNG header尺寸與各自metadata一致；quick raw HTML含manifest、apple touch icon、standalone capable、app title與theme color標記。 |
| S04 | 只產生／註冊 root `/sw.js`；precache含quick assets/app-shell-meta；quick denylist＋directoryIndex＋指定query allowlist齊全，update nonce不得被ignore。 |
| S05 | main與quick embedded version等於同一 `app-shell-meta`；sealed production rule維持 release id，test build使用單一 unique build id。 |
| S06 | `insertFinalTranscript`通過 start/middle/end、selection replace、null selection、中文、空白邊界與 duplicate-final cases。 |
| S07 | IME Enter/done不submit；title為1–500 code points，JS／SQL trim集合一致；含NBSP、全形空白、emoji邊界及UTF-16 selection案例，內部空白／大小寫／標點保留。 |
| S08 | outbox DB/store/version/index、record schema、transition table、claim hash/expiry、lease CAS、backoff與7日清除符合SPEC；hash/network不在IDB transaction內await，暫停的nextAttemptAt=null不視為立即到期。 |
| S09 | 小型voice為static import且tap前無await；auth/outbox/PWA於controller-ready後載入，sync支援open恢復；title不等這些module。 |
| S10 | RPC signature、security invoker、empty search_path、穩定錯誤與private receipt schema/grants/RLS皆存在；先receipt replay再context驗證，禁止stored task snapshot與receipt TTL。client固定JWT的POST只有既定三參數、無ambient .rpc／第二client，headers/body/timeout及strict parser符合SPEC。 |
| S11 | SQL blank payload與`createBlankTaskNode` fixture同值；兩筆 detail notes、description absent、同一server ms timestamp。 |
| S12 | TaskWorkbench hydration先讀remote unplaced；只有legacy Inbox promotion受fallbackWorkspaceId限制，placement RPC不變；root intent僅保存expiry，消費後open而非toggle，panel hosts互斥，無setView或root outbox import。 |
| S13 | reload profiles保留main required readiness/owners，quick只需version+quick readiness與quick owner；DEV-097 fail-closed gates未放寬。 |
| S14 | package scripts、SPEC／ADR／QA／DEV／map互鏈且狀態一致；沒有預填產品或QA/QC PASS。 |
| S15 | `vite.config.js`維持`VitePWA({manifest:false})`，`public/manifest.webmanifest`為唯一root來源、root HTML只有一個manifest link；source與`dist/manifest.webmanifest`皆可parse且`id/start_url/scope='/'`，第一筆且唯一的本功能shortcut精確符合名稱／描述／`/quick-task/`／`1024x1024 image/png`。verifier讀取PNG header證明資產實際1024×1024；quick manifest仍為`id/start_url/scope='/quick-task/'`且同資產metadata誠實。root worker precache包含dist manifest，不得另有第二份Vite root manifest。 |

Performance static budget：`quick-task/index.html`及首次render必需的quick JS/CSS合計 gzip ≤35 KiB，不計按需載入、manifest、icons、service worker；超標即 Fail並檢查依賴洩漏，不以移除accessibility/error state換取通過。

此預算必須包含讓建立／語音可操作的 controller/model/voice，不能把必要操作移到延遲 chunk 逃避計算。兩台記錄型號的目標裝置各做20次已快取啟動及本機保存：`responseEnd → controller-ready` p95 ≤300 ms、`submit → IDB readback success` p95 ≤500 ms；包含第一次開DB，排除OAuth與遠端同步。另記 icon tap→input 可見與首次未快取載入時間／傳輸 bytes，不能把網路、SW install或鍵盤未彈出時間從使用者總耗時中隱藏。數字為工程目標，尚未實測。

## 6. Browser Functional／Visual Cases

| ID | 驗證 |
|---|---|
| B01 | 320×844與390×844 direct launch首個可操作control為title input；無full-page loading，input可立即打字。 |
| B02 | 從root設定頁正常CTA可發現quick入口；browser／Android standalone／iOS standalone依SPEC顯示正確handoff guidance。 |
| B03 | 320／390下「語音」始終緊鄰名稱、≥48×48 CSS px、icon+文字可見，accessible name為「使用語音輸入任務名稱」。 |
| B04 | supported voice一tap進requesting/listening；final只插入一次且保留未選取文字；stop回idle，可繼續編輯。 |
| B05 | unsupported／denied／no-speech／offline service均回fallback、focus input並顯示「請點鍵盤麥克風」；原文字不丟失。 |
| B06 | 空白、composition與快速雙擊不建立；有效submit只產生一個capture id及一個local commit in-flight。 |
| B07 | IDB complete前沒有「已記下」；readback後進成功畫面。abort／quota時留在editing、原文保留、顯示「尚未記下，請重試」。 |
| B08 | 未登入submit先durable success；登入CTA才生成/commit intent並離開。callback只移除claim，保留SDK所需hash/query；初始化與同一snapshot token的getUser成功後才CAS bind，結束再清除credentials。 |
| B09 | 無claim、錯nonce、過期nonce、已綁account或account switch皆不顯示／不認領他人title；顯示generic recovery。 |
| B10 | 不再submit也能於reopen/online/foreground續送；含expiry syncing、8次自動失敗後轉 `failed_permanent/AUTO_RETRY_EXHAUSTED`、foreground 不再 lease、明確 manual retry。雙tab當下只有一lease owner，過期在途request可重疊但DB只建立一次，stale completion不能覆寫。 |
| B11 | remote未確認顯示「已記下，待同步」；strict committed response後才顯示「已建立」。invalid response保留local record。 |
| B12 | 再記一筆不取消前筆sync；前往工作台flush最多300ms後導向`/?quick_workbench=1`且不含title/token/owner/captureId；pending提示重開quick續傳，不宣稱root接管或關閉後保證背景同步。 |
| B13 | 從quick成功畫面正常點前往工作台，實際開啟panel並讀到quick-created task一次；title、detail notes、description absent；可用既有placement移到board。不得手動開panel或注入偏好冒充到達PASS。 |
| B14 | 200% text zoom、軟鍵盤展開、safe-area inset、portrait rotate下無水平overflow、control遮擋或不可達。 |
| B15 | visible error sweep：unexpected role=alert、inline bootstrap error、console/page error、business HTTP list request或failed critical asset皆Fail。 |
| B16 | 封鎖／延遲初始JS時可輸入，建立／語音未啟用；Enter不導覽、不洩漏title到URL。初始module恢復後保留已輸入文字。 |
| B17 | voice期間手動輸入、composition、換capture、account switch與hide後late final不覆寫；cold tap無dynamic-import等待，fallback鍵盤需額外tap時有真實提示。 |
| B18 | commit已完成但第一次readback失敗，retry仍用原ID恢復；auth switch不顯示舊帳號成功摘要；受控private-mode／storage failure保留可複製原文。 |
| B19 | 在owner guard後、getUser回覆前、request在途及response前切A→B：A capture不能帶B JWT；尚未dispatch則取消，已送A token可在A commit但不顯示到B。捕捉request時以memory比對actor、artifact只留alias；DB readback證明B沒有A title，claim CAS亦不綁錯帳號。含401後原帳號重驗與stale completion。 |
| B20 | 從quick正常action到root：panel已關／已開、settings、home、無active board、先登入各情境都只開一份panel；不切view、不清草稿。intent consume後不重播、過期丟棄；臨時host關閉／帳號切換會清除。storage不可用驗URL保留及明示手動入口的fallback；URL清理保留其他OAuth/invite參數。 |
| B21 | 從待處理N筆入口逐筆看到本人失敗record、可略過／返回／同ID重試；有目前輸入或不明commit時不被恢復覆蓋。8次自動失敗後為 `failed_permanent/AUTO_RETRY_EXHAUSTED`，online／foreground不解鎖，明確retry才重置；workspace修復後同ID恢復，conflict只複製／確認，unbound需明確claim，無跨帳號title或remote list。 |
| B22 | root `/manifest.webmanifest`實際response含S15 shortcut，root HTML仍連root manifest；一般開啟`/`不redirect到quick。從`/quick-task/`啟動仍載入quick HTML／quick manifest，DOM沒有root App marker。 |
| B23 | 以可重現的installed-app launch URL或等價browser harness開啟shortcut目標`/quick-task/`，首個可操作control為title、initial graph與network oracle維持零業務list request；不因launch來源載入React／完整App。harness只能證明route／render，不能冒充OS長按UI，後者由D08證明。 |
| B24 | root設定頁在390×844與桌面viewport都只出現一個「快速建待辦」區塊與一個CTA；文案語意為「安裝ProJED後，支援的平台可從ProJED圖示選快速建待辦；需要桌面單鍵入口可安裝獨立圖示」，CTA仍到`/quick-task/?install=1`。不出現自動產生兩圖示、iOS必定有長按捷徑或捷徑會立即更新的承諾，無水平overflow。 |

Network oracle從document request開始記錄；允許quick資產、SW、app-shell-meta、auth refresh/callback驗證，以及「既有outbox」的bounded create RPC，該RPC需能對應舊captureId。所有業務list request為0；目前輸入未submit不得產生其RPC。worker precache與document module流量分列，quick document不得import／execute full App，不能把worker下載量算成0；只排除runner自身流量。

## 7. Real Service Worker／Update Cases

| ID | 驗證 |
|---|---|
| W01 | build A安装/載入main+quick，build B形成單一waiting root worker；兩shell觀察同一target version。 |
| W02 | quick非空editing title、composition、requesting/listening、local transaction及claim nonce移入memory至CAS完成／error期間不得reload；snapshot回傳對應dirty reason，lifecycle啟動前已登記。 |
| W03 | local IDB readback後且無claim／其他dirty reason時，remote pending可在safe boundary更新；reopen仍能讀取並補送capture，local readback不可清掉仍在進行的claim reason。 |
| W04 | main App DEV-097 existing owner/readiness、view-intent及per-client isolation regression全部通過。 |
| W05 | offline `/quick-task/`、`/quick-task/index.html`、install／claim／OAuth error query命中quick precache，URL query留給page處理；update nonce走網路不回舊meta。DOM無root marker；未知query不被全域ignore。 |
| W06 | controllerchange/reload reservation、recoverable asset error與cache recovery不清除`projed-quick-task-v1` outbox。 |
| W07 | build A的root manifest無shortcut，build B以相同root identity加入R12 shortcut；B worker安裝／啟用後，受控app fetch `/manifest.webmanifest`取得B內容，cache keys與precache revision不再回A manifest。source、dist、network／cache readback與worker target version一致；不新增第二worker、強制reload或shortcut-detection polling。此case只證明Web資產更新，不冒充OS已刷新捷徑，後者由D10記錄。 |

## 8. Isolated PostgreSQL／RPC Cases

| ID | 驗證 |
|---|---|
| P01 | anon/public無execute；authenticated/service_role有execute；function為security invoker且空search_path。 |
| P02 | null auth、invalid id、blank/501-char title回固定code；無row寫入。 |
| P03 | valid A2 hint被採用；foreign/invalid hint退回A最新active membership；C回`QT_NO_AVAILABLE_WORKSPACE`。 |
| P04 | client不能傳owner/order/task JSON；owner固定auth.uid，workspace id為legacy-or-UUID canonical app id。 |
| P05 | first create task/receipt同commit且created=true；same-id/hash回相同committedAt與created=false；different hash conflict、不update。 |
| P06 | 無receipt的既有id碰撞回`QT_EXISTING_ROW_INVALID`；near int32 limit回`QT_ORDER_EXHAUSTED`，不wrap/reorder。 |
| P07 | N=20 concurrent quick RPC於固定無外部writer fixture為unique append order；另以40-client mixed-writer-compatible fixture（20 Quick RPC＋20 test-only existing append function）驗證共用`account:<owner>:unplaced:parent:root` lock下40個連續唯一 order；這是相容性證據，不替代真實placement writer。 |
| P08 | A不能read/update/delete B row；以B JWT重放A capture id只在B owner namespace建立或依fixture拒絕，不碰A row。此case只證明DB隔離，無法辨識A文字誤帶B token；B19另證明request不會送錯身分。 |
| P09 | row/task canonical readback完全符合SPEC-115；`createdAt===updatedAt`、detailNotes兩筆、own description absent。 |
| P10 | RPC-created unplaced task可由existing `move_task_workbench_subtree_v2`移到合法board；target capability仍執行。 |
| P11 | owner/order index支援max-order read；以EXPLAIN及N fixture確認無跨owner全表排序退化，並review security/performance advisors。 |
| P12 | 三組由quick RPC首次建立，丟棄HTTP response後分別用正常流程改名／歸位／刪除，再重播原ID/title；皆receipt replay、不重建、不恢復舊title；另驗membership失效仍可replay自己receipt。 |
| P13 | private receipt API不暴露；SQL角色A只能SELECT/INSERT自身receipt，不能UPDATE/DELETE或讀B；task刪除不cascade receipt，profile刪除才cascade。摘要無title/task JSON；grants/readback與server config都驗證。 |
| P14 | 注入receipt insert失敗不得留下task；task insert失敗不得留下receipt。rollback後同ID成功retry一次，驗證無半完成receipt。 |

## 9. FMEA／Fail-seeking

| Failure mode | Effect | Detection | Gate |
|---|---|---|---|
| root SPA fallback吞quick navigation | 離線開成完整App | S04、W05、D05 | Stop/Fail |
| quick initial graph匯入React/full App | 首屏慢且偷載資料 | S02、B01、network trace | Stop/Fail |
| root shortcut誤改一般start URL | 每次開ProJED都進quick，完整App入口消失 | S15、B22、D08 | Stop/Fail |
| 把shortcut宣稱成自動第二圖示 | 使用者預期錯誤、iOS現場找不到入口 | B24、D09、文案review | Fail |
| shortcut啟動載入完整App | 綁定後反而失去零資料載入價值 | B23、D08、network oracle | Stop/Fail |
| shortcut／quick入口解析為不同actor | 待辦建立到錯誤帳號 | B19、D09、provider readback | Stop/Fail |
| manifest有兩個source或dist／precache仍供應舊版 | 新安裝或更新後捷徑內容漂移 | S15、W07、artifact hash | Stop/Fail |
| 產品承諾既有安裝立即出現捷徑 | 平台延遲被誤判為產品故障 | B24、D10、文案review | Fail |
| 以同源推論獨立quick圖示必然共享session | storage隔離時可能誤送或誤顯示帳號 | D04、D07、D09 | Stop/Fail |
| main/quick用不同update target | shared worker交易競爭 | S05、W01、DEV-096/097 | Stop/Fail |
| local success早於readback | 使用者以為已保存但資料遺失 | B07、transaction fault injection | Stop/Fail |
| OAuth callback認領任意unbound draft | 跨帳號title洩漏 | B08/B09、two-account fixture | Stop/Fail |
| account guard後SDK取到B token | A title誤建立到B，RLS仍合法 | B19、request actor＋DB readback | Stop/Fail |
| lease expiry與在途RPC重疊 | 重複create或stale state覆蓋 | B10、P05/P07/P12 | Fail |
| live task被改名／刪除後重播 | conflict誤報或任務復活 | P12、immutable receipt | Stop/Fail |
| callback先清空OAuth參數 | 登入成功但無法取session | B08、D07 | Fail |
| 延遲voice import失去user activation | 按了無麥克風／鍵盤入口 | B17、D06 | Fail |
| SQL blank defaults漂移 | 工作台內容污染 | S11、P09、DEV-115 | Stop/Fail |
| Workbench等待workspace才hydrate | quick task看不到 | S12、B13 | Fail |
| 只導向root／toggle關掉既有panel | 使用者找不到已建立待辦 | B12/B13/B20、實際panel計數 | Fail |
| 失敗record只有數量沒有恢復入口 | title保留但使用者無法取回 | B21、受控錯誤恢復 | Fail |
| claim尚在驗證卻因local readback解鎖更新 | raw nonce遺失、認領中斷 | W02/W03 | Fail |
| voice final重送／IME Enter | 文字重複或誤建立 | S06/S07、B04/B06 | Fail |
| verifier直接seed完成task | false E2E PASS | fixture provenance review | Fail |

## 10. Commands 與 Artifact

```text
npm run verify:dev-122-mobile-zero-data-quick-task
npm run verify:dev-122-mobile-zero-data-quick-task-browser
npm run verify:dev-122-mobile-zero-data-quick-task-root-browser
npm run verify:dev-122-mobile-zero-data-quick-task-sw
npm run verify:dev-034-pwa-install-guidance
npm run verify:dev-034-pwa-install-guidance-browser
npm run verify:dev-122-mobile-zero-data-quick-task-db-isolated
npm run verify:dev-122-mobile-zero-data-quick-task-db-concurrent
npm run verify:dev-096-pwa-update-transaction-convergence
npm run verify:dev-096-pwa-update-transaction-convergence-browser
npm run verify:dev-096-pwa-update-transaction-convergence-sw
npm run verify:dev-097-pwa-safe-reload
npm run verify:dev-097-pwa-safe-reload-browser
npm run verify:dev-097-pwa-safe-reload-sw
npm run verify:dev-115-blank-task-creation
npm run verify:dev-115-blank-task-creation-browser
npx tsc --noEmit
npx eslint <DEV-122 changed source and verifier files>
npm run build:test
git diff --check -- <DEV-122 owned files>
```

- Browser/SW root：`output/playwright/dev-122-mobile-zero-data-quick-task/`；至少包含 `result.json`、`sw-result.json`、network trace、request classification、IDB sanitized readback、computed geometry、console/HTTP sweep及case screenshots。
- DB root：`output/qa/dev-122/`；至少包含 isolated matrix JSON、EXPLAIN、migration hash、runtime cleanup與port release。
- Device root：`output/qa/dev-122/devices/`；每平台保存metadata、installed identity、launch URL、offline/voice/auth結果與必要畫面，不能保存真實title/token/email。
- Artifact每一case要有source revision、build id、actor alias、route、viewport/platform、fixture version、expected/actual/status；source或artifact改變後舊evidence不得重用。

### 10.1 Local candidate execution record（2026-09-15）

- Runtime：既有 `localhost:4000` test-mode process（owner PID 28532）重用，沒有停止或清理其他任務的 runtime。
- PASS：`npm run verify:test-env`、`npm run verify:staging-env`（環境解析唯讀，無遠端 mutation）、targeted ESLint（0 error）、`npm run build:test`、static/pure（22 assertions：含 retryable `Retry-After` 不得解除 `failed_permanent` 的 guard、已登入帳號可看到未綁定 recovery record 的 guard、quick install marker與quick／existing placement共用account-unplaced advisory lock guard）、quick Chromium local smoke（15 assertions：initial/edit/save、fallback後重試、IME、voice insertion、geometry、zero business request、delayed module、lease／claim、8次重試封頂後阻擋與人工重試重置、`install=1`引導與`beforeinstallprompt`呼叫、iOS加入主畫面指引）、root intent Chromium browser（R01～R03）、DEV-096 static 26/26 + browser + real-SW、DEV-097 static 23/23 + browser + real-SW、DEV-115 static 21/21 + browser B01～B09、service-worker verification、isolated PostgreSQL core matrix（22 checks）、task-owned pgbench concurrent transport（20 clients／20 rows／0 failed）與 mixed-writer-compatible transport（40 clients／20 Quick RPC＋20 test-only existing append fixture／40 unique orders／0 failed）。`npx tsc --noEmit` PASS。
- Case mapping：quick browser artifact 使用 `caseSet=local-smoke-v2`、`SM01`～`SM15`；reused Vite test server shell version 為 `build:1789392291929-8mqkr19f`；這15個smoke case是R10以前的本地切片，不直接宣稱B01～B24或R12完成。SM05證明unsupported fallback後可重試，SM14／SM15證明既有quick安裝引導分支；均不能替代D01～D10。
- Artifacts：`output/playwright/dev-122-mobile-zero-data-quick-task/{result.json,root-result.json,static-result.json,sw-result.json,*.png}`、`output/playwright/dev-097/ui-result.json`、`output/playwright/dev-115-blank-task-creation/result.json`、`output/qa/dev-122/{db-isolated-result.json,db-matrix.txt,db-concurrent-pgbench.txt,db-concurrent-check.txt,db-concurrent-mixed-pgbench.txt,db-concurrent-mixed-check.txt,dev-097-compatibility-diagnostic.json}`；`db-isolated-result.json` 另含 migration／matrix／concurrent fixture `sourceHashes`、mixed-writer-compatible result 與 runtime cleanup。
- Scope：quick chunk gzip 約 7.75 KiB；兩個 HTML 含同一 `projed-shell-version`（`build:1789406871768-qay417qi`，本輪最新 dist build），`dist/app-shell-meta.json` 已產生並進入單一 root worker precache；Workbox 有限 query normalization 已由 static／build／SW verification 覆蓋；quick browser network/console sweep沒有業務HTTP失敗。
- Not verified：iOS／Android安裝與真機語音、OAuth callback與正式Supabase；本機 readiness 檢查仍顯示 ADB 與 Xcode simulator 不可用。P07 混入真實既有外部 writer／placement 的完整 transport 競態、P10 placement、P11 advisor review、P12/P13 完整 API／cascade matrix、P14 完整 fault injection、B01～B24 完整 QA case、W01～W07 與獨立 QA/QC 也仍待執行。quick／existing placement lock key alignment 已由 S11-lock-scope PASS 證明，40-client mixed-writer-compatible fixture 已取得 40 unique orders；fixture 使用 test-only existing append function，仍不等同 P07 真實 mixed-writer placement transport PASS。`local-smoke-v2` 僅覆蓋輸入／保存／fallback／IME／voice insertion／零業務 request／延遲 module／outbox lease／claim slice，不能替代完整 auth／transport／recovery／裝置 case。P07 固定 fixture pgbench transport、P11 owner/order index 與 max-order EXPLAIN、P13 profile cascade已有 core evidence，但不代表完整 advisor、API 或角色矩陣。isolated PostgreSQL與pgbench均使用task-owned loopback runtime；既有 Docker Supabase runtime只做唯讀 schema presence check，因此不能當作 DEV-122 P10 或正式 OAuth 證據。DEV-097 browser 診斷與 PASS artifact 見 `output/qa/dev-122/dev-097-compatibility-diagnostic.json` 與 `output/playwright/dev-097/ui-result.json`；這不改 DEV-122 quick path 架構，也不放寬 fail-closed oracle。

### 10.1.1 Approved HTTPS candidate（2026-09-16）

- 原先檢查的 `https://projed-test.web.app/quick-task/` 仍是 404，原因是它不是本 repo `.firebaserc` 與既有 Level 3 runbook 指定的 Hosting site。依既有安全路徑，從乾淨 detached `HEAD 7b16ddf6e3af1d3bf26e3267c19de33fe343ecd4` 以 staging mode 建置，部署到 `projed-cc78d` 的非 live `level3-smoke` preview channel；未切換 production traffic。
- Approved candidate：`https://projed-cc78d--level3-smoke-ua5z9m3e.web.app/quick-task/`；Firebase release `1789531899366000`、version `91e85ef60f5223c9`，到期 `2026-09-17T04:11:34.070987288Z`（台北時間 2026-09-17 12:11）。staging env 指向固定 ProJED-TEST，且與 production ref 隔離；automatic test login關閉，artifact secret scan PASS。
- Artifact provenance：build id `build:1789531768480-4g274ymv`；`quick-task/index.html` SHA-256 `EA746B9AB5BC9EE610AA89CB800021F8AF7E255AA4942CC8C504F904C2C59549`、`quickTask-UTwriYyX.js` SHA-256 `C73354AE4E63760252883CAC7D4D4D3DAC7F150020E33245D4A1D47729951E6C`、`sw.js` SHA-256 `E69D616E97250EBF3C27311814BD05AC6818ED8F88EAB098A2FF4D6B54BAFF69`；三者線上與本機完全一致。
- HTTPS browser smoke 在 390×844 PASS：`/quick-task/`、`?install=1`、manifest、quick JS/CSS與service worker皆200；名稱欄可見、空白且自動聚焦，語音按鈕可見且 accessible name為「使用語音輸入任務名稱」，`window.isSecureContext=true`；critical console、page error、同源 request failure與同源 4xx/5xx均為0。證據：`output/playwright/dev-122-mobile-zero-data-quick-task/https-candidate-result.json`、`https-candidate-390x844.png`。
- 這一節只解除R10 candidate的「沒有approved HTTPS candidate／路由404」阻塞。R12修改source後此candidate立即失去同版證據資格；必須重建preview並重新綁定root manifest、root／quick assets與D01～D10證據。

### 10.1.2 R12 evidence reset（2026-09-16）

- `public/manifest.webmanifest`目前尚無`shortcuts`，所以S15、B22～B24、W07、D08～D10狀態固定為Not executed／Not verified。
- R10以前的quick、DB、voice、outbox、RPC與Workbench evidence可作回歸基線；凡涉及root manifest、設定頁新文案、installed root shortcut或新artifact的結論不得重用。
- RD完成WP-122-0B後需記錄root／quick manifest與AppInstallAssistant source hash、icon header、build id、dist manifest hash、precache revision、browser artifacts與新的HTTPS candidate；QA再依本文件執行，QC不得在驗證中修改產品檔。

### 10.2 DEV-097 相容回歸裁定（Tech Lead R7）

- 保留 `OWNER_PREPARE_FAILED`、空標題原文與目前文件的 fail-closed readback；這些是必要安全 oracle，不得為了讓 verifier 通過而放寬。
- 修正後的 DEV-097 browser verifier 必須先點擊 `[data-main-sidebar-toggle="true"]`（若側欄收合），再操作設定入口；這是既有 UI 前置條件。
- recovery 後需再次執行明確的 user-confirmed canonical boundary，或先提出產品 navigation／owner oracle 的 ADR amendment；`forceFlushMeetingDraft` 的 local IDB 成功不可單獨當作 canonical owner safe。
- 修正後 verifier 已重新執行並產生 `output/playwright/dev-097/ui-result.json` PASS artifact；W04 的 browser 子 gate解除，但 DEV-122 的真機、完整 B/W/P 與正式 QA/QC gate仍維持 `Not verified`。此裁定不新增 quick worker、client、RPC、state authority 或資料邊界。
- 本次 verifier source SHA-256：`B80B3B8EF8A89C3EC9F0B7FFA513A08097E8B6947DFA86C63C11F729128F1DDE`；artifact 與 source 必須成對保存，後續任何修改都要重新執行完整 browser gate。

### 10.3 快速安裝引導（Tech Lead R8）

- `install=1` 顯示 quick install guide，名稱欄仍可直接輸入；Chromium mock `beforeinstallprompt` 會在明確點擊後呼叫原生 prompt，並保留接受／取消訊息；iOS UA 分支顯示 Safari 加入主畫面步驟。
- SM14／SM15 與 `quick-task-install-390x844.png`、`quick-task-install-ios-guidance-390x844.png` 已取得 PASS；這兩個 case 僅是本機 UI／事件 smoke，不代表 D01～D04 的實機第二 icon 或 install promotion。


### 10.3.1 混合 writer lock 契約（Tech Lead R9）

- quick create RPC 與既有 `move_task_workbench_subtree_v2` 都使用 `account:<owner>:unplaced:parent:root` transaction advisory scope，將 account-unplaced root 的排序／placement mutation 對齊到同一把鎖。
- static S11-lock-scope guard 與 isolated PostgreSQL／固定 fixture pgbench 已 PASS；40-client mixed-writer-compatible fixture（20 Quick RPC＋20 test-only existing append fixture）產生 40 個連續唯一 order。這是 lock domain 相容性證據；runner 對 marker／order／row-count fail-closed，失敗會寫 FAIL artifact 並清理 task-owned runtime；它不是完整 P07 mixed-writer placement transport，也不能取代 P10 placement 或正式 full-schema gate。

### 10.3.2 語音 fallback 重試契約（Tech Lead R10）

- fallback 狀態回報後必須清除 controller 的舊 recognition session；否則下一次 tap 可能只停止失效 session，無法重新進入語音。
- `SM05` 已以 unsupported fallback→再次點擊語音→新 recognition final transcript 的順序 PASS，artifact `result.json` 內 `retryValue=再試語音重試`；修正不新增 service、權限、state authority 或資料流。
- 真機權限拒絕、無聲音與系統鍵盤聽寫仍由 D06／D07 target-device gate 驗證。

### 10.4 External gate handoff（待環境提供後執行）

- 真機最小組合：一台iPhone（Safari，記錄iOS版本）與一台Android（Chrome，記錄OS／Chrome版本）；另以Android Chrome/WebAPK與Chromium桌面執行D08／D10，macOS Safari 17.4+可用時補充。全部使用同一frozen candidate的HTTPS URL。沒有對應裝置時，D01～D10、permission、storage與install promotion維持Not verified或依平台矩陣記N/A。
- 測試資料：兩個互不相同的 TEST 帳號 A／B、可清理的 TEST workspace／board、可核對的 capture fixture；不得使用 production 帳號、production workspace 或真實 title。
- 裝置操作：D01～D04先確認選用第二icon、quick launch pathname與storage sentinel；D08～D10確認root一般launch、全新／既有安裝的shortcut或fallback與同帳號；D05～D07再依offline、microphone permission、OAuth callback／cancel／expired nonce、關閉重開與同一capture replay順序執行。
- 資料層：P07 mixed-writer、P10 placement、P11 advisor、P12～P14 full matrix 必須在 task-owned isolated PostgreSQL 或明確的 Supabase TEST project 執行；不得把既有 local Docker runtime 或 production schema 當作證據。
- 證據封存：每一 case 保存 sourceRevision、buildId、actorAlias、route、viewport/platform、fixtureVersion、expected／actual／status、console／HTTP 摘要與 cleanup 結果；title、token、email、JWT 與 OAuth query 不得進 artifact。
- 完成判定：只有D01～D10、S01～S15、B01～B24、W01～W07、P01～P14、效能目標與獨立QA/QC全部在同一frozen candidate通過，才可把DEV-122改為PASS；local smoke、單張screenshot、UA mock或單一DB matrix只能作補充證據。
## 11. Pass／Fail／Stop

- `WP-122-0 PASS`：D01～D04依平台適用性在同一candidate通過，資源清理可追溯；只解除後續實作gate。
- `WP-122-0B PASS`：S15、B22～B24、W07、D08～D10依平台適用性在同一candidate通過；root一般launch、全新／既有安裝的shortcut或fallback、同帳號與zero-data quick path均有對應evidence。
- `DEV-122 PASS`：S01～S15、B01～B24、W01～W07、P01～P14、效能目標、既有DEV-034／096／097／115受影響regressions及D01～D10依平台適用性在同一收斂candidate全通過。
- `Fail`：任一required case不符、evidence缺provenance、正常入口不可發現、可見錯誤、業務list request非零、fixture直接建立結果、敏感資料進artifact或task-owned資源未清理。
- `Not verified`：只有source review、build、direct URL、單張screenshot、模擬voice或單帳號DB，不能宣稱browser／device／permission／RLS／E2E PASS。
- `Stop and return to planning`：命中SPEC第9/18節架構限制、需要第二worker／origin、超出已定API/schema/RLS/state/ownership、改root／quick identity、放寬existing oracle，或平台確實不能形成選用第二App。平台不實作manifest shortcuts本身不是drift，必須走D09 fallback。
- 通過仍是local／approved test candidate；commit、push、deploy、production migration、production smoke與正式資料由後續release gate承接。

使用思考習慣：#可驗證性、#系統描繪、#限制條件、#差距分析、#隱私



