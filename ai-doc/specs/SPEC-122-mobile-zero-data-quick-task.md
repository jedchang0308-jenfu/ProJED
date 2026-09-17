# SPEC-122：ProJED 手機零資料載入快速建待辦

狀態：`RD Implementation Complete / Architecture Confirmed R12 / REL-002 Production Verified with Accepted Exceptions`
文件角色：DEV-122 current-phase implementation authority
修訂：2026-09-16 Architecture Closure R12；在R11的root ProJED app shortcut決策上，補齊manifest唯一來源與build輸出、既有安裝更新、真實icon metadata、同帳號安全證明及平台適用性。R4～R10的quick MPA、零業務載入、voice、outbox、RPC／RLS、工作台到達、獨立quick identity與安裝引導契約全部保留。
架構決策：[ADR-050](../decisions/ADR-050-mobile-quick-task-entry-and-outbox.md)
QA authority：[QA-DEV-122](../qa/QA-DEV-122-mobile-zero-data-quick-task.md)
關聯：[DEV-122](../dev_task.md#dev-122projed-手機零資料載入快速建待辦)、[SPEC-034](SPEC-034-fast-start-pwa-install-guidance.md)、[SPEC-039](SPEC-039-task-filter-core-and-workbench-profiles.md)、[SPEC-115](SPEC-115-blank-task-creation-contract.md)、[ADR-047](../decisions/ADR-047-pwa-per-client-reload-isolation.md)、[ADR-048](../decisions/ADR-048-blank-task-creation-contract.md)

## 1. 真正問題、目標與限制

現場使用者收到新的待辦時，只需要先記住名稱。現行完整 App 會先掛載 `AuthGate → AppContent → MainLayout → useDataSync()`，可能在名稱可輸入前啟動 workspace、board、task、member、tag、record 與 calendar 讀取，與「先記一筆」的必要條件不相稱。

本期目標是讓手機使用者從 ProJED 主程式的app shortcut或選用的第二個桌面入口「ProJED快速建待辦」進入後，第一個可操作畫面就是任務名稱欄位，名稱旁固定有語音入口；輸入與本機保存不等待 ProJED 業務資料。使用者確認後先形成可讀回的本機事實，登入且連線可用時才同步到本人全域任務工作台的未歸位區，之後再整理。

不可改變的限制：

- quick critical path 必須是同源 nested `/quick-task/` MPA，不能偷偷變成 root route、bookmark 或完整 App route。
- initial graph 不得載入 React、完整 App、Zustand store、業務資料 service、Google scripts、Firebase、Supabase client 或 Workbox。
- 本期不新增第二 service worker、獨立 origin、native wrapper、自有轉錄、第二 Inbox、通用 queue framework 或遠端 list API。
- root manifest一般啟動必須維持 `/`；app shortcut只能增加指向 `/quick-task/` 的啟動面，不得宣稱一次安裝會自動建立兩個獨立OS圖示。
- owner、workspace、order、payload defaults、idempotency 與權限由 server／既有 authority 決定，client 不計算全域排序、不傳 owner 或 task JSON。
- 開發階段不執行遠端 migration、production data mutation、commit 或 push；Level 3 preview deploy 僅依明確授權的 release gate 執行，正式交付仍由完整 QA/QC 與後續 release gate 承接。

## 2. 已確認產品決策

| 題號 | 決策 | 明確不採用 |
|---|---|---|
| 1 | `1A`：語音只更新名稱；使用者按「建立」或鍵盤完成才保存。 | 語音結束立即建立、倒數自動建立。 |
| 2 | `2A`：語音 final 從目前游標加入；有選取時取代選取，保留其他文字。 | 取代整個名稱、只允許空欄。 |
| 3 | `3B`：本機保存後停在成功畫面，提供「再記一筆」與「前往工作台」。 | 自動清空、自動跳完整工作台。 |
| 4 | ProJED主程式manifest內建「快速建待辦」捷徑；獨立quick manifest保留為選用的第二圖示。 | 一次安裝自動建立兩個OS圖示、移除quick identity、把root一般啟動改到quick。 |

名稱旁的按鈕固定顯示麥克風圖示與「語音」，觸控目標至少 48×48 CSS px。支援 Web Speech 時在同一次使用者 tap 內 focus/start；不支援、拒絕、無聲音或離線時聚焦名稱欄並明示使用手機鍵盤麥克風，不能宣稱網頁能代按鍵盤聽寫。

## 3. 交付範圍與完成邊界

本期包含：

- quick raw HTML／PWA identity、progressive enhancement、mobile input／voice／success UI。
- root manifest app shortcut、手機／電腦設定頁的雙入口說明與未支援平台fallback。
- account-bound IndexedDB outbox、local commit/readback、claim、lease、retry 與逐筆 recovery。
- 固定 JWT snapshot 的單筆 RPC adapter、private immutable receipt、RLS/grants 與 server-owned context/order。
- root 一次性 intent、既有 TaskWorkbench panel host 與 unplaced hydration 相容。
- root／quick 共用 shell version、單一 Workbox worker、quick reload-safety owner、有限 callback query normalization。
- static/pure、browser、real-SW、isolated PostgreSQL、target-device 與相容回歸的 QA 契約。

不包含：一次PWA安裝自動建立兩個OS圖示、保證所有iOS／瀏覽器顯示app shortcut、選專案、指派、日期、附件、既有任務瀏覽、遠端清單、background sync保證、native App、自有語音轉錄、獨立origin、正式Supabase／OAuth credentials與release。

`WP-122-0` 是第二個 App 入口的外部 feasibility gate；`WP-122-0B` 是本輪重新開啟的root bundled shortcut slice。兩者本身都不等於DEV-122完整矩陣PASS。一般完成標準仍要求S01～S15、B01～B24、W01～W07、P01～P14、效能目標、相容回歸及D01～D10適用案例由同一收斂candidate證明；REL-002則依第17.1節獲release owner接受殘餘風險，完成替代production結案條件後以`Production Verified with Accepted Exceptions`結案，不把缺口改寫為PASS。

## 4. 使用者流程與成功事實

```text
安裝ProJED主程式
→ 支援平台：長按／右鍵ProJED圖示 →「快速建待辦」
  或：使用者另行安裝桌面「ProJED快速建待辦」
→ /quick-task/ raw form
→ 名稱輸入或點語音
→ 使用者按建立／鍵盤完成
→ IDB add + transaction complete + same-key readback
→ 「已記下，待同步／登入後同步」
→ 使用者登入 CTA 才建立 claim intent
→ 固定 owner/token/epoch snapshot + leased single-item RPC
→ task + private immutable receipt 同一 transaction
→ strict receipt validation 後顯示「已建立」
→ 使用者點前往工作台
→ /?quick_workbench=1 → root intent consume → 既有單一 panel → 未歸位 hydration
```

- `已記下` 只代表本機 transaction 與 readback 成功。
- `已建立` 只代表 server 回傳 strict committed receipt；remote pending 不可冒充工作台已可見。
- 目前未送出的名稱不產生 RPC；quick path 的業務 list request 必須為 0。
- remote task 被改名、歸位或刪除後，原 capture id 重播仍只回 receipt replay，不重建、不恢復舊 title。
- 一般點擊ProJED主程式仍開`/`；root shortcut與選用quick icon都只將使用者帶到同一`/quick-task/`。
- root shortcut不傳account、token或owner。同步以當次凍結的`ownerId + accessToken + authEpoch`送出，server以Bearer token的`auth.uid()`決定owner，client只在receipt owner與snapshot owner相等時宣告遠端成功；OAuth claim另以同一snapshot token呼叫`getUser()`。session缺失／過期時維持本機成功與登入後同步，不建立到推測帳號。

## 5. Target Architecture

```text
root /manifest.webmanifest
  ├─ start_url / → 完整ProJED
  └─ shortcut「快速建待辦」→ /quick-task/

/quick-task/ raw HTML form
  └─ src/quickTask/main.ts（DOM controller）
      ├─ model.ts（title／IME／success pure rules）
      ├─ voice.ts（tap 內 focus/start）
      ├─ outbox.ts（IndexedDB durability／claim／lease／retry）
      ├─ auth.ts（controller-ready 後取得 session snapshot）
      ├─ sync.ts → quickTaskCaptureService.ts（固定 JWT fetch）→ RPC
      └─ reloadSafety.ts（quick owner）

/?quick_workbench=1
  └─ taskWorkbench/entryIntent.ts → MainLayout → openTaskWorkbenchPanel
       └─ 單一 TaskWorkbenchPanel host → account-unplaced hydration
```

六個必要責任點且各自只有一個 authority：

| 責任點 | 唯一責任 | 不承接 |
|---|---|---|
| raw HTML | 首屏 semantic form、可見入口、無 JS fail-closed guard | auth、業務資料、React tree |
| quick controller | DOM event、voice result、submit／success state | workspace／board 讀取、通用 command bus |
| IDB outbox | local commit/readback、claim、lease、retry、recovery | remote task snapshot、跨帳號資料 |
| fixed JWT adapter | 單一 RPC request 與 strict receipt parser | ambient session、通用 HTTP abstraction |
| single RPC | owner／workspace／order／payload／receipt transaction | client order、廣義 unplaced CRUD |
| root intent | quick 到達既有 Workbench host | 第二 panel、root outbox worker、view replacement |

root manifest shortcut是靜態launch metadata，不是新的runtime authority；仍只有上述六個責任點。

不得新增 wrapper、第二 client/worker、remote inbox、平行 draft store 或通用 queue。新責任只有在具備獨立生命週期與安全邊界、且新增驗證案例證明必要時，才可用 ADR amendment 提出。

## 6. Entry、Build 與 PWA Contract

- root `/` 維持既有完整 App；quick 是實體 `quick-task/index.html`，不可只在 React router 新增 route。
- `vite.config.js`固定`VitePWA({manifest:false})`，所以`public/manifest.webmanifest`是root manifest唯一source of truth；`index.html`只保留一個`/manifest.webmanifest`link。`vite build`必須將同內容輸出為`dist/manifest.webmanifest`並由root worker precache；不得另在Vite設定內維護第二份root manifest物件。
- root manifest固定`id='/'`、`start_url='/'`、`scope='/'`，並有且僅有一筆本功能shortcut，且排在第一筆：`name='快速建待辦'`、`short_name='建待辦'`、`description='直接輸入一筆待辦'`、`url='/quick-task/'`、`icons=[{src:'/icons/icon-vibrant-03-mango-berry.png',sizes:'1024x1024',type:'image/png'}]`。shortcut URL必須保持在root scope內，不加追蹤query；verifier需讀PNG header證明資產實際為1024×1024，不可只相信manifest字串。
- quick manifest的`id/start_url/scope`固定為`/quick-task/`，繼續提供選用的第二install identity；不得因root shortcut移除、合併或改成`id='/'`。其引用同一1024×1024資產的既有錯誤`192x192`／`512x512`metadata應在WP-122-0B一併改為真實`1024x1024`，不新增重複icon檔。
- 一般點擊已安裝ProJED必須仍進入`/`；支援平台的app shortcut選擇才進入`/quick-task/`。平台忽略manifest shortcuts時不得顯示錯誤，也不得隱藏設定頁quick CTA或選用quick安裝流程。
- root與quick入口維持同origin與既有Auth provider。root shortcut在同一installed root app中啟動；它不傳遞或複製憑證。直接同步的身分保證來自固定JWT snapshot、Bearer token、server `auth.uid()`與strict receipt owner equality；OAuth claim才另外使用`getUser(snapshot.accessToken)`。選用的獨立quick安裝若被平台配置到隔離storage/session，必須顯示登入／待同步流程，不能承諾自動共用root session。不得新增token bridge、跨origin handoff或local owner override。
- `AppInstallAssistant`在mobile／desktop設定頁保留單一quick CTA，不增加第二組卡片或安裝按鈕。標題固定為「快速建待辦」；說明文字固定語意為：「安裝 ProJED 後，支援的平台可從 ProJED 圖示選『快速建待辦』；需要桌面單鍵入口，也可安裝獨立圖示。」CTA仍為「開啟快速建待辦」並指向`/quick-task/?install=1`；產品文案不使用manifest、scope或service worker等技術詞，也不承諾捷徑即時出現。
- 全新安裝candidate以D08驗證。既有安裝取得新版shortcut的時機由瀏覽器／OS管理，產品不能強制刷新、查詢OS捷徑是否已出現或自行輪詢；只維持既有安全SW更新交易，由W07／D10記錄manifest版本、worker控制狀態及平台更新結果。平台延遲不得偽裝成產品已即時完成，也不得為此新增UA猜測、shortcut-detection state或第二更新服務。
- 兩 entry 共用 `/sw.js`、update transaction 與 build-wide shell version；不註冊 quick worker。
- root Workbox SPA fallback 必須 deny `/quick-task/`；`directoryIndex`、precache 與有限 query ignore 由同一 VitePWA 設定管理。只忽略 `utm_*`、`fbclid`、`install`、`capture`、`claim`、OAuth code/error 參數；update nonce 不得被忽略。
- build plugin 先輸出 `app-shell-meta.json {schemaVersion:1, version}` 再讓 Workbox precache，並把同一 version 嵌入 root／quick HTML。
- `firebase.json` 的 `/quick-task{,/**}` rewrite 必須在 root catch-all 前。
- quick initial graph 不得 import `src/App.tsx`、`src/main.tsx` 的完整 bootstrap、React、任何 Zustand store、`dataBackend.ts`、`authService.ts`、Firebase、workspace／board／WBS／member／tag／record／calendar service。
- raw form 固定 `novalidate onsubmit="return false"`，在 JS module 延遲或失敗時 Enter 不導覽、不把 title 放入 URL；submit／voice 初始 disabled，controller ready 並確認非 IME composition 後才啟用。

## 7. Runtime、State 與 Data Contract

### 7.1 Quick phases

```ts
type QuickCapturePhase =
  | 'editing'
  | 'saving_local'
  | 'saved_pending_auth'
  | 'requesting'
  | 'listening'
  | 'syncing'
  | 'synced'
  | 'failed_retryable'
  | 'failed_auth'
  | 'failed_permanent'
  | 'recovery'
```

- `editing`：title 可編輯；未 submit 不產生 business request。
- `saving_local`：IDB transaction in flight；不可顯示已記下、不可 reload。
- `saved_pending_auth`：local readback 已成功；顯示待同步或登入 CTA。
- `requesting/listening`：語音中的 interim/final 狀態；手動輸入與 composition 受保護。
- `syncing`：取得 lease 後固定 token dispatch；lease expiry 後可有 bounded overlap，stale completion 不得覆寫新狀態。
- `synced`：strict receipt readback 成功；可再記一筆或前往工作台。
- failed states：保留原 title/capture；retryable 以 backoff；auth 需明確登入；permanent 顯示可複製／人工處理。

### 7.2 Title、voice 與 IME

- title trim 集合與 SQL 一致，接受 1～500 Unicode code points；內部空白、大小寫、標點與 emoji 保留。
- voice final 只寫回同一 input；以 selectionStart/selectionEnd 從游標插入，有選取即取代；同一 final event 不得重複。
- compositionstart 至 compositionend 期間，Enter／done 不 submit；controller submit 與 raw form guard 都必須成立。
- voice button accessible name 固定「使用語音輸入任務名稱」；unsupported／denied／no-speech／offline 均 focus input 並顯示鍵盤麥克風提示。

### 7.3 IndexedDB outbox

Database `projed-quick-task-v1`、store `captures`、schemaVersion 1。每筆至少包含：

```text
schemaVersion, captureId, accountId?, title, workspaceHint?,
clientCreatedAt, updatedAt, state, attemptCount, nextAttemptAt?,
lastErrorCode?, leaseId?, leaseExpiresAt?, claimIntent?
```

- `captureId` 格式 `task_workbench_unplaced_<uuid>`，同時是 local key 與 server receipt key。
- local commit 使用 transaction complete 後 same-key readback；hash/network 不在 IDB transaction 內 await。
- account filter 是必要的 local guard；A 的資料不可在切至 B 後被讀成 B 的成功摘要。
- claim 只在使用者明確點登入時產生 raw nonce；IDB 只存 nonce SHA-256、capture id 與 15 分鐘 expiry，nonce 移入 memory 後才清理 URL claim。
- lease 以 30 秒 expiry、compare-and-set、nonce/lease id 綁定；同一 capture 當下只能有一個 winner。自動 retry 最高 8 次並使用 backoff；第 8 次失敗後必須轉為 `failed_permanent`／`AUTO_RETRY_EXHAUSTED`，`nextAttemptAt=null` 且 foreground／online 不得再取得 lease，只有明確人工 retry 可重置為 pending。7 日 retention 只適用已同步或明確清理的 local record，不刪 remote receipt。
- local failure／storage unavailable 要保留可複製 title；有 backlog 才顯示逐筆 recovery。recovery 不得覆蓋目前輸入，conflict 只能複製／確認，unbound 需明確 claim。

### 7.4 Auth、固定 request 與 RPC

- local session 只作 hint；每次 sync 固定 `ownerId + accessToken + authEpoch` snapshot。不能在 account guard 後呼叫 ambient client 重新讀到 B token。
- `quickTaskCaptureService.ts` 只送 `create_quick_unplaced_task_v1(capture_id,title,workspace_hint)`，明確 `Authorization: Bearer <snapshot>`、`credentials:'omit'`、`cache:'no-store'`、bounded timeout；不得新增第二 Supabase client。
- SQL function `security invoker`, `set search_path=''`，先檢查 `auth.uid()`、capture id、title，再查 immutable receipt；receipt hash 不同時回 `QT_IDEMPOTENCY_CONFLICT`。
- owner 固定 `auth.uid()`；workspace hint 只作 server side active membership 選擇，無效 hint fallback 到本人最新 active membership；無 membership 回 `QT_NO_AVAILABLE_WORKSPACE`。
- order 由 server 在 owner namespace 內以既有 `account:<owner>:unplaced:parent:root` advisory transaction lock 與 owner/order index 決定；quick create 與既有 placement 必須共用此 scope，client 不傳 order。超過 int32 上限回 `QT_ORDER_EXHAUSTED`。
- receipt table `private.quick_task_capture_receipts` 只保存 owner、capture id、title hash、committed_at；task 與 receipt 同一 transaction。receipt 是 immutable replay proof，不保存 title 或 task JSON，不設 TTL。
- private schema 不暴露 Data API；authenticated 只可依 RLS SELECT/INSERT 自身 receipt，不能 UPDATE/DELETE 或讀其他 owner。profile delete cascade receipt；task delete 不 cascade receipt。
- stable errors 至少包含 `QT_AUTH_REQUIRED`、`QT_INVALID_CAPTURE_ID`、`QT_INVALID_TITLE`、`QT_NO_AVAILABLE_WORKSPACE`、`QT_IDEMPOTENCY_CONFLICT`、`QT_EXISTING_ROW_INVALID`、`QT_ORDER_EXHAUSTED`。

### 7.5 Root intent 與 Workbench

- 前往工作台只保存一次性 intent 與 expiry，不保存 title、token、owner 或 capture id。
- root consume intent 後呼叫既有 `openTaskWorkbenchPanel()`，不能用 URL 改變代替實際 panel 到達，也不能 toggle 已開 panel。
- existing host 優先沿用；無 host、settings/home、無 active board 或需登入時，MainLayout 暫時掛載同一 TaskWorkbenchPanel host，維持目前 view／草稿，不新增第二 panel。
- Workbench 先 hydrate account-unplaced；legacy Inbox promotion 才受 fallbackWorkspaceId 限制；quick-created row 的 placement／delete 仍由既有 authority 負責。
- intent consume、panel close、account switch 與 expiry cleanup 都是一次且可追溯；refresh 不得重播 intent。

### 7.6 Reload、offline 與 update boundary

- `PwaReloadSurface` 只允許 `auth-shell | {kind:'full-app', view:ViewMode} | quick-task`。
- quick owner reasons：`FORM_DRAFT_UNSAVED`（非空 title／IME）、`CLIENT_JOB_IN_FLIGHT`（requesting/listening/claim callback）、`PENDING_WRITE`（IDB transaction）。各 reason 獨立計算；local readback 不能解鎖尚在 claim 的 update。
- 動態 module 到位後先從 DOM／IME／voice／commit 狀態註冊 owner，再報 quick readiness；不能先報 ready 再補 owner。
- local readback 後、無其他 dirty reason 時，remote pending 可在安全邊界更新；offline quick HTML、`/quick-task/index.html`、install/capture/claim/OAuth error query 必須命中 quick precache。
- controllerchange、recoverable asset error、cache recovery 不得清除 `projed-quick-task-v1` outbox；關閉頁面不承諾背景上傳。

## 8. Work Packages 與 Phase Gates

| WP | 交付 | 出口 |
|---|---|---|
| WP-122-0 | 最小 MPA、manifest、icon、install CTA、quick rewrite | D01～D04 依平台證明第二 icon、launch、storage sentinel |
| WP-122-0B | root manifest bundled shortcut、設定頁雙入口說明、root／quick launch與既有安裝更新regression | S15、B22～B24、W07、D08～D10；一般root launch、zero-data quick launch、同帳號與manifest更新邊界成立 |
| WP-122-1 | progressive shell、build/version、SW query/cache、offline | S01～S05、B01/B16、W01/W05、D05能力 |
| WP-122-2 | input、voice、IME、success、install、accessibility | S06/S07/S09、B03～B06/B14/B17、D06能力 |
| WP-122-3 | RPC、private receipt、RLS、generated types、minimal adapter | S10/S11、P01～P14、isolated DB/advisor |
| WP-122-4 | outbox、auth claim、固定 JWT sync、recovery、safe reload | S08/S13、B07～B12/B18/B19/B21、W02～W04/W06、D07能力 |
| WP-122-5 | Workbench intent／host／hydration與完整交付驗證 | S12、B13/B20、全部適用案例、效能、相容回歸與 QA/QC |

本輪execution boundary只允許WP-122-0B；完成後回到既有WP-122-0與完整QA-QC gate。缺裝置或HTTPS candidate記為Not verified，不得偽造PASS；平台不支援manifest shortcuts時使用既定fallback，不視為第二App gate通過或失敗。平台確實無法形成選用第二App才回ADR-050 amendment。

## 9. 驗證契約與停止條件

完整、可執行案例以 [QA-DEV-122](../qa/QA-DEV-122-mobile-zero-data-quick-task.md) 為準：S01～S15、B01～B24、W01～W07、P01～P14、D01～D10。QA文件是案例細節唯一authority；本文件只固定不可降級的資料流、責任與狀態。

停止／回規劃條件：

- root fallback 吞掉 quick path、quick initial graph 載入完整 App 或出現業務 list request。
- root一般launch被改成quick、shortcut URL離開root scope、quick獨立identity被移除，或支援平台的shortcut啟動載入完整App。
- 第二 icon、nested scope、install promotion 或平台 storage sentinel 無法可靠成立。
- local readback 前顯示成功、receipt replay 重建 task、stale completion 覆寫狀態或跨帳號資料可見。
- 需要 client order、privileged proxy、第二 worker/client、remote inbox、破壞性 migration 或修改 protected schema／existing oracle。
- 任何 source／schema／API／RLS／ownership 語意與本 SPEC 不相容。一般 implementation bug 回 RD；平台限制回 ADR amendment。

`Not verified` 僅表示缺必要環境或完整證據，不等同 Fail。source review、build、direct URL、單張 screenshot、模擬 voice 或單帳號 DB 都不能宣稱 browser/device/permission/RLS/E2E PASS。

## 10. Evidence、環境與資源清理

每輪 candidate freeze 必須記錄 branch、HEAD、git status、changed-source／verifier／migration hashes、build id、base URL、browser／OS／viewport、actor alias、fixture version、runtime owner／port／process tree／cleanup condition。source 或 artifact 改變後不得重用舊 evidence。

- Browser/SW root：`output/playwright/dev-122-mobile-zero-data-quick-task/`，含 quick/root/static/SW JSON、screenshots、console／HTTP sweep、request classification、IDB sanitized readback 與 geometry。
- DB root：`output/qa/dev-122/`，含 `db-isolated-result.json`、`db-matrix.txt`、quick／mixed-writer-compatible pgbench output、EXPLAIN、migration hash、runtime cleanup 與 port release。
- Device root：`output/qa/dev-122/devices/`，每平台保存 installed identity、launch URL、offline／voice／auth 結果與必要畫面；不得保存 title、token、email。
- Artifact每case應帶`sourceRevision`、`buildId`、`actorAlias`、`route`、`viewport/platform`、`fixtureVersion`、`expected/actual/status`；R10 local browser smoke使用`caseSet=local-smoke-v2`、`SM01`～`SM15`，不可直接當成B01～B24或R12完成。

## 11. Required Cases 摘要

### 11.1 Static／Pure

S01 two HTML inputs／raw form；S02 initial graph isolation；S03 manifest identity；S04 single worker／precache／query allowlist；S05 common shell version；S06 voice selection insertion；S07 IME/title boundary；S08 IDB schema/lease/retry；S09 progressive module timing；S10 RPC/RLS/grants；S11 blank payload parity；S12 Workbench hydration／intent；S13 reload profile；S14 package/docs/evidence consistency；S15 root bundled shortcut與雙identity不變量。

### 11.2 Browser／SW／DB／Device

B01～B24、W01～W07、P01～P14與D01～D10的逐項條件、negative cases、兩帳號fixture、fault injection、target-device操作、advisors與cleanup均由QA authority維護。Local smoke只證明已實作切片，不提升完整case完成度。

## 12. Future Phase Capsule

若 D01～D04 證明同源 nested PWA 在目標平台不能可靠形成第二 App，才評估獨立 subdomain/origin；若 Web Speech 與鍵盤聽寫都不足，才評估 native wrapper、錄音保存或自有轉錄。兩者都需新的 hosting／auth／privacy／release ADR amendment，不可在 current phase 偷渡。

## 13. Compatibility、Migration 與禁止變更

- SPEC-034：`Compatible extension`；原 install/update flow 保留，退役 QuickCaptureShell 不恢復。
- SPEC-039：`Compatible extension`；account-owned unplaced lane 與 placement authority 不變。
- SPEC-115／ADR-048：`Compatible extension`；RPC blank defaults 必須 parity，description absent。
- ADR-047：`Compatible extension`；DEV-097 fail-closed reload transaction、main owners/readiness 保留。
- Database：既有 unplaced PK/RLS、placement RPC、TaskNode、factory 不改；receipt table、RPC、RLS/grants 為 additive migration，private receipt 不暴露 Data API。
- 不在 current write surface：`src/App.tsx`、`src/services/dataBackend.ts`、`src/services/authService.ts`、既有 placement RPC、`task_workbench_unplaced_items` schema／PK／RLS、`createBlankTaskNode.ts`、QuickCaptureShell 與 WBS store。被迫修改時先停止重審。

## 14. Local Candidate Source Hashes

以下為 2026-09-17 product／verifier candidate 的可重現 hash；產品與verifier內容已由外部流程納入HEAD `5ee11786da4db07b9f125b0e315873dda479d1c9`，本輪文件收斂仍在working tree。closure 前基線若需比對，另以commit／artifact provenance保存，不以本表取代git history。

| Candidate source | SHA-256 |
|---|---|
| `vite.config.js` | `43E3598D86B80BCA3D7D2E2BC9E98F95AB4A766882D35D8FFD772553825C6399` |
| `firebase.json` | `A3217800A892D5044BB695F880D67AAC8ABB44BA613975B1FD39FEA18DC56CE6` |
| `quick-task/index.html` | `41997C9824DB0A6C7133A9850E1A73F6EA88F253D4CA6C2BF20421AAF4F688A1` |
| `src/quickTask/main.ts` | `CF8DF3610D327D1865A94C49E215017DDEB6D6AF60F73D71FF2294E5B0800482` |
| `src/quickTask/quick-task.css` | `257428DC8DD0966624403853ED2CDB0284B9CAE432C32C61BC624444CE54580C` |
| `src/features/quickTaskCapture/install.ts` | `B5673FF1AD4DB021673E4FB4ED1591B46098CC47559F6B41BCBEBE40827EF495` |
| `src/features/quickTaskCapture/model.ts` | `EBE45EC7F13F6F674AADB8057520CA53C867D610E0B6F0CF28B55660CAB7B5F0` |
| `src/features/quickTaskCapture/voice.ts` | `EE5E925BB31470E72CA81E3493126E7FFF9557E7C1AE5D47046F77C2A3651D7C` |
| `src/features/quickTaskCapture/outbox.ts` | `BBC14DD96BC1E46B3B92470A059C7BB3BEC1FD46771768A760937FC2BA3D10B5` |
| `src/features/quickTaskCapture/auth.ts` | `8984558AD49711CA2C09C06B8A497E81A5313E2CF7CF552F903C81BC66BAE729` |
| `src/features/quickTaskCapture/sync.ts` | `EA836FD71180CCAFF230CDF4BBEC8F1C0AA65BCA41E64E347BDAA12664929B0B` |
| `src/features/quickTaskCapture/reloadSafety.ts` | `B47992CA67F86EDBABEA82C058AC349360129D647EDACAB040975E638CB6472B` |
| `src/services/supabase/quickTaskCaptureService.ts` | `A2ABD2B52F769C36342BB98E5EF75D8A57CD69C9942A593F53188B477941C01C` |
| `src/features/taskWorkbench/entryIntent.ts` | `52EADB503C5D3032F4B269ADD05FFF60BCC253CD7A09F2E06D7B95FBBBFA26B1` |
| `src/components/MainLayout.tsx` | `3541699C1CB8B15B44D123EBCBD9268B8B9C223AB1D002C4DD8A51D1B03D55F7` |
| `src/components/TaskWorkbenchPanel.tsx` | `3B6A0557DC92AD00F41D0A06E62650D799DE658877A6C4FF23D58E8B81000FAC` |
| `src/main.tsx` | `1BCC60EDF55DE6BFB95FEE644A6D5802C1450A6013C0C9E855AFC5347907173A` |
| `supabase/migrations/20260914120000_dev_122_quick_unplaced_task_rpc.sql` | `7966256E19F9CD15E3F8DDE608D4084AF8AFA2B83B274B5BE093D98733D0C3CC` |
| `supabase/migrations/20260826083940_dev_089_scope_safe_task_placement_command.sql` | `ABF53328ACFFD794A27321A216265AB17A5073D98488AEBF22C66E5AEC0C3A9E` |
| `public/manifest.webmanifest` | `BCFFCA69C7D10D1C363768AA1194D25ADFB80B0D1343B02B14BE414E02D09D7A` |
| `public/quick-task/manifest.webmanifest` | `AB8FA8F746915980CD7E850CA8AEEFE3BAF02917309E8D4EDCEDDB22863FFA67` |
| `src/components/AppInstallAssistant.tsx` | `B5CD8489F7C6C343A0C82CDDFD9DD7E8F2F67C095D0F2AD78D56A4AB5327869F` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task.ts` | `8C9785861321DBAAB70101581D4C5E6270C01309A345D6F37F7361F817F89EEC` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-browser.pw.js` | `6527BA7E59285E17D62633CC10E56CCCF7EE022CD7FCF1A5B970F35392DA36EE` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-root-browser.pw.js` | `A7539B356B930774864C855E0BA2FD3C9753E3BEA3B61CABBB6EEF3281010588` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-sw.mjs` | `99AFA9B4A244F5659EE5EDEC18294C1B381661C87500F4EC3DD56C2E1446BAE3` |
| `scripts/verify-dev-034-pwa-install-guidance.mjs` | `97EAF7584262FBC6FC5683B1755AFFDE3396ECE981510642B7D8B1A731B5037D` |
| `scripts/verify-dev-034-pwa-install-guidance-browser.pw.js` | `999DBA00928DA91E4DDAC64CCCD235DBD4EB9E37C04C05D8BADC2ECD7F9E4225` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-db-isolated.ps1` | `095189A669A5961E4D17352065CBDCA8F7F69F28E3F565016309B56BDC0BE282` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-db-matrix.sql` | `41397952F034E7CAAEBFA55C4312B616BB68ED9DE5610E044E943A77AA2954DE` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-db-concurrent-prelude.sql` | `624C76E43E47276C97F5C028048D97554378214DB0373C3828267A881DA38E3A` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-db-concurrent.pgbench.sql` | `7C8472357F815C74E8D807495DB0D1BAB774D8CBC2BD57C65E641043E9A18BE8` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-db-concurrent-check.sql` | `DD42FC3F85CDD52E14D2BFCA979849C2BCBD1EA51EEBB597F6DE34632E4D33E7` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-db-concurrent-mixed.pgbench.sql` | `75F1838E4C5BBD55C7FB3FCA84CA101DCF7E5AB58C0CF2F28A73B389508C7CA6` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-db-concurrent-mixed-check.sql` | `9F057E5137E1E567D9B37A78EA1327C70326A1CFB931C6926CDCCE0CD44BAC4C` |
| `scripts/verify-dev-122-mobile-zero-data-quick-task-db-concurrent.mjs` | `B3EE8686BD8FE2B8826C45D19BC03B69E4C546F65D7DC6185CEA10E0C56DC0AD` |
| compatibility verifier `scripts/verify-dev-097-pwa-safe-reload-browser.pw.js` | `B80B3B8EF8A89C3EC9F0B7FFA513A08097E8B6947DFA86C63C11F729128F1DDE` |

## 15. Target Architecture 與依賴方向

quick entry 只能依賴 quick feature、shared PWA service 與 minimal Supabase adapter；shared service 不得反向 import quick DOM/controller。`createBlankTaskNode.ts` 維持 TypeScript blank authority，SQL parity 由 P09 fixture 驗證，不讓 factory import database 或反向依賴 quick。

禁止 quick critical graph 觸碰：`src/App.tsx`、`src/main.tsx`、React、Zustand、`dataBackend.ts`、`authService.ts`、Firebase、Google Identity/GAPI、Workbox runtime、workspace／board／WBS／member／tag／record／calendar service。auth、outbox、reload safety 在 controller-ready 後非阻塞載入；恢復舊 pending 不阻塞下一次 title submit。

### 15.1 Fixed repo/module/file surface

| 動作 | 檔案 | 責任 |
|---|---|---|
| 修改 | `public/manifest.webmanifest` | 保持root identity／一般launch，新增`/quick-task/` app shortcut |
| 修改 | `vite.config.js` | two HTML inputs、manifest、denylist、shell version、precache |
| 修改 | `firebase.json` | quick rewrite before root catch-all |
| 新增 | `quick-task/index.html`、`src/quickTask/main.ts`、`src/quickTask/quick-task.css` | raw form、controller、mobile visual |
| 新增 | `public/quick-task/manifest.webmanifest` | 第二 install identity |
| 新增 | `src/features/quickTaskCapture/*` | pure、voice、IDB、auth、sync、reload owner |
| 修改 | `src/services/pwaUpdateService.ts`、`src/services/pwaReloadSafety.ts`、`src/services/pwaReloadOwnerManifest.ts`、`src/components/PwaReloadSafetyBridge.tsx` | shared shell／profile／owner compatibility |
| 新增／修改 | `src/services/supabase/quickTaskCaptureService.ts`、`database.types.ts` | fixed JWT adapter、strict parser、signature |
| 新增 | `supabase/migrations/20260914120000_dev_122_quick_unplaced_task_rpc.sql` | additive RPC、receipt、RLS/grants |
| 新增／修改 | `src/features/taskWorkbench/entryIntent.ts`、`src/components/MainLayout.tsx`、`src/components/TaskWorkbenchPanel.tsx` | intent、single host、hydration |
| 修改 | `src/components/AppInstallAssistant.tsx` | mobile／desktop settings說明主程式shortcut與選用quick icon；保留quick install CTA |
| 新增／修改 | `ai-doc/*122*`、`scripts/verify-dev-122-*`、`package.json` | QA authority、verifier、command entry |

### 15.2 R12／WP-122-0B current write surface

本輪只允許以下產品與驗證檔案；先前已完成的quick runtime、Auth、RPC、DB、Workbox設定與Firebase rewrite都不因本次捷徑需求重開：

| 動作 | 檔案 | R12責任 |
|---|---|---|
| 修改 | `public/manifest.webmanifest` | root唯一manifest來源；加入第一順位shortcut及真實1024×1024 icon metadata |
| 修改 | `public/quick-task/manifest.webmanifest` | 只校正同一icon資產的尺寸metadata，不改quick identity／scope／launch |
| 修改 | `src/components/AppInstallAssistant.tsx` | 一個設定區塊、一個CTA；說明root shortcut與選用獨立圖示，不承諾平台即時呈現 |
| 修改 | `scripts/verify-dev-122-mobile-zero-data-quick-task.ts` | S15 source／dist JSON、唯一來源、identity、shortcut、PNG header與quick metadata guard |
| 修改 | `scripts/verify-dev-122-mobile-zero-data-quick-task-root-browser.pw.js` | B22～B24 root／quick route、文案、responsive與零業務request guard |
| 修改 | `scripts/verify-dev-122-mobile-zero-data-quick-task-sw.mjs` | W07 build A→B manifest／precache／controller更新證據 |
| 視既有assert受影響修改 | `scripts/verify-dev-034-pwa-install-guidance.mjs`、`scripts/verify-dev-034-pwa-install-guidance-browser.pw.js` | 保持DEV-034設定入口與安裝引導回歸 |

預期不修改`vite.config.js`：目前的`manifest:false`、`.webmanifest` precache及單一root worker已滿足R12。只有verifier證明build未複製或未precache canonical manifest時才停止並回Tech Lead，不可先建立第二份manifest設定。

## 16. Fixed Interface 與 transaction contract

### 16.1 Pure／browser interface

`normalizeQuickTitle(value)`、`isQuickTitleValid(value)`、`insertFinalTranscript({value,selectionStart,selectionEnd,transcript})` 與 `classifyQuickSyncError(error)` 是跨 UI／SQL 的純規則。title 的成功條件、voice insertion、stable error classification 由 static verifier 與 SQL fixture 交叉證明。

### 16.2 Local transaction

`commitQuickCapture(record)` 必須在一個 IDB transaction 完成後再以同 key readback；`acquireQuickCaptureLease(captureId, accountId)` 使用 CAS；`finishQuickCaptureLease` 只有持有正確 lease id 才能寫入結果；stale completion 不能把新 state 改回 synced/failed。`bindQuickCaptureClaim(captureId, accountId, nonceHash)` 只允許尚未綁定且 hash/expiry 正確的 record。

### 16.3 RPC contract

```text
create_quick_unplaced_task_v1(
  p_capture_id text,
  p_title text,
  p_workspace_hint text default null
) returns jsonb
```

success response 只包含 `status='committed'`、`captureId`、`ownerId`、`titleHash`、`created`、`committedAt`。同 owner／capture／同 hash 是 immutable replay；不同 hash 回 conflict。task 內容以 existing unplaced schema 與 SPEC-115 parity 生成，RPC 不回 task JSON。

### 16.4 Root intent contract

intent key 只保存 `expiresAt` 與必要 non-sensitive marker，15 分鐘後丟棄；consume 後清除且只 dispatch 一次。不得把 title、token、owner、capture id、JWT 或完整 OAuth query 放進 root intent。

## 17. 執行順序、命令與 evidence

RD 一次只推進一個WP。本輪先完成WP-122-0B並跑static、root／quick browser、build、real-SW與DEV-034安裝引導regression；source freeze後才在新的approved HTTPS candidate執行D08～D10，再回既有device／DB gate。固定命令：

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
npm run verify:dev-097-pwa-safe-reload
npm run verify:dev-115-blank-task-creation
npx tsc --noEmit
npx eslint <DEV-122 changed source and verifier files>
npm run build:test
git diff --check -- <DEV-122 owned files>
```

Local candidate execution record（2026-09-15，test mode）：`npm run verify:test-env` 與 `npm run verify:staging-env` 皆 PASS（僅解析環境，不做遠端 mutation），targeted ESLint、`npm run build:test`、`npx tsc --noEmit`、static/pure（22 assertions：含 retryable `Retry-After` 永久暫停 guard、unbound recovery visibility guard、quick install marker 與 quick／existing placement 共用 account-unplaced advisory lock guard）、quick browser local smoke（`caseSet=local-smoke-v2`、SM01～SM15；SM14覆蓋`install=1`引導與`beforeinstallprompt`原生安裝呼叫，SM15覆蓋iOS加入主畫面指引與標題欄可用，SM05覆蓋fallback後再次點擊語音可重試；reused Vite test server shell `build:1789392291929-8mqkr19f`）、root intent browser（R01～R03）、service-worker verification、isolated PostgreSQL core matrix（22 checks）、task-owned pgbench concurrent transport（20 clients／20 rows／0 failed）與 mixed-writer-compatible transport（40 clients：20 Quick RPC＋20 test-only existing append fixture／40 unique orders／0 failed）均 PASS；相容 DEV-097 browser 及 DEV-115 browser B01～B09 亦 PASS。最新 build artifact 的 common shell version 為 `build:1789406871768-qay417qi`（dist build），quick chunk gzip 約 7.75 KiB；quick path 未載入 React／Supabase，business request sweep 為 0。既有 `localhost:4000` test-mode process owner PID 28532 重用並保留；task-owned PostgreSQL runtime 每次驗證後均確認 port released／temp path removed。

2026-09-16 已建立 approved non-production HTTPS candidate：`https://projed-cc78d--level3-smoke-ua5z9m3e.web.app/quick-task/`。來源是乾淨 detached `HEAD 7b16ddf6e3af1d3bf26e3267c19de33fe343ecd4` 的 staging build，Firebase release `1789531899366000`／version `91e85ef60f5223c9`，到期 `2026-09-17T04:11:34.070987288Z`；未切換 live traffic。`/quick-task/`、`?install=1`、manifest、quick JS/CSS與`sw.js`皆200；390×844 browser smoke證明secure context、空白名稱欄自動聚焦、語音按鈕可見，critical console／page error／同源失敗請求為0。線上HTML、quick JS與SW雜湊均與本機 build `build:1789531768480-4g274ymv`一致；證據見 `output/playwright/dev-122-mobile-zero-data-quick-task/https-candidate-result.json` 與 `https-candidate-390x844.png`。原先 `projed-test.web.app` 的404不再作候選依據；本repo的既有Level 3契約以`projed-cc78d` preview channel承載Supabase ProJED-TEST staging build。

這些結果已解除當時的「無 approved HTTPS candidate／route 404」阻塞，但不等於target-device PASS，且candidate不含R12 root shortcut契約並已到期。2026-09-17 的R12 working-tree candidate已通過S15、B22～B24、W07、DEV-034、DEV-096／097／115相容回歸、TypeScript、targeted ESLint、test build、isolated DB與concurrent DB；static artifact build id為`build:1789631490953-ncfnvfa7`，browser artifacts build id為`build:1789608384432-hayia8rv`。W07證明root identity不變、manifest由baseline revision `2d4615fe7f62a4c99a4b7105ca88a622`更新為`405db62f9b98b5b892623d04237bd828`且shortcut URL為`/quick-task/`。當時尚待新的approved HTTPS candidate與D08～D10／D01～D07；本機仍無ADB與Xcode simulator。完整B／W／P、P07真實mixed-writer placement transport、P10 placement、P11 advisor、P12-P14 full API/fault matrix與獨立QA/QC維持Not verified，並由後續release exception承接殘餘風險。

2026-09-17 已依使用者授權從 `5ee1178` staging build 部署新的 R12 candidate 至 Firebase `projed-cc78d / level3-smoke`；release／version、asset parity、HTTPS smoke與本次 scoped device waiver 集中於 [PREPRODUCTION-DEV-122-20260917](../release/PREPRODUCTION-DEV-122-20260917.md)。此 candidate 解除 hosted HTTPS／artifact gate；本次豁免安裝 shortcut、真實語音輸入與返回同帳號工作台的 Android／iPhone 實機驗證。使用者其後進一步接受DEV-096 real-SW最新FAIL及完整B／W／P、效能、正式Supabase full matrix與獨立QA/QC未執行的殘餘風險；原始驗收case與evidence狀態不變，由QA第10.4.3節定義本次release的替代結案條件。

### 17.1 Release Exception Closure（2026-09-17）

- 這是本次release的`Intentional release exception`，不修改本SPEC的產品、資料、安全、ownership或架構契約，也不把FAIL／Not verified改寫為PASS。
- 例外只解除已接受風險對本次release的阻擋；production sealed artifact、inactive production candidate、live activation授權、canonical production smoke、canonical同帳號唯一單筆建立readback與cleanup均已完成。
- `level3-smoke`使用staging backend，只能作Level 3證據，不得直接提升為production artifact。正式build與candidate必須使用production環境設定並保留source／artifact provenance與rollback anchor。
- 上述production gate已由REL-002全部完成；DEV-122以`Production Verified with Accepted Exceptions`結案，terminal release record已逐項揭露accepted residual risks。

## 18. 實作裁量、禁止變更與 drift gate

實作模型可自行決定局部 symbol 名稱、CSS token 等價值、module helper 拆分、assert library、fixture UUID 與不改契約的錯誤文案微調；需維持指定 accessible name、success facts 與 stable machine codes。

不得自行改變：root`id/start_url/scope='/'`、canonical root manifest來源、shortcut URL`/quick-task/`、quick獨立identity、raw HTML + progressive enhancement、React-free critical graph、same-origin nested identity、one root worker、common build version、surface readiness、IDB schema/state/lease、claim／固定身分 request規則、RPC signature/security/grants、private immutable receipt/replay、workspace resolution、SPEC-115 payload、Workbench一次性到達／hydration boundary、本機恢復邊界、WP順序、target devices、evidence layer與stop conditions。

第一個出現以下情況即停止受影響部分並回送規劃模型：需要新增API/schema/RLS/state/ownership、把root一般launch改為quick、把quick scope擴到`/`、移除獨立quick identity、新增第二worker/origin、建立manifest雙重來源、匯入完整App/store、讓client計算owner/order、略過local readback、修改protected file、放寬DEV-096／097／115 oracle，或新增UA猜測／OS捷徑偵測狀態、把app shortcut冒充自動第二圖示／全平台支援。局部命名、等價實作與一般bug修正不算drift。

## 19. Architecture Closure Review 結論

2026-09-14 Tech Lead R4 將 callback query normalization、capture id collision 與 int32 order boundary 收斂在唯一 Workbox／RPC 基礎設施；R5～R10依序完成raw form／IME、自動重試封頂、DEV-097相容、quick install引導、account-unplaced lock與voice fallback session修正。2026-09-16 R11依使用者決策重新開啟DEV-122：root manifest新增指向`/quick-task/`的app shortcut，設定頁說明主程式捷徑與選用第二圖示；root一般launch、quick獨立identity及既有六個runtime責任全部保留。R11不新增第二client、worker、queue、資料表、API、權限或任務domain。

R4 架構已定案：P0／P1 unresolved architecture blocker = 0。R5、R6、R7、R8、R9、R10 都是同一架構內的實作／相容驗證契約修正，不改 data／security／ownership boundary：R5 防止 raw form／IME 誤送出，R6 封頂 `attemptCount >= 8` 時把 `failed_retryable` 轉為 `failed_permanent/AUTO_RETRY_EXHAUSTED`，並只允許明確人工 retry 重置；R7 僅調整既有 DEV-097 verifier 的側欄前置與 recovery 後 canonical boundary 驗證；R8 僅新增 quick 自有的 install guide、原生 prompt 事件處理與平台指引；R9 將 quick create 與既有 placement 的 account-unplaced advisory scope 對齊，並由 static lock-scope guard 與 40-client mixed-writer-compatible fixture 證明共用 lock domain 的相容 transaction 行為；R10 在 voice fallback 出口清除失效 session，使下一次 tap 能重新建立 session，並由 SM05 驗證，不新增狀態來源。local candidate 已落實 quick MPA、共用 shell metadata、voice/input、IDB lease/claim、RPC adapter、root intent、Workbench hydration、有限 callback query normalization 與 `install=1` 引導；`npx tsc --noEmit`、static、build、local smoke、root、SW、22-check core matrix、固定 fixture pgbench transport、40-client mixed-writer-compatible transport 與 DEV-097 browser 均有 artifact。

DEV-122已由REL-002以`Production Verified with Accepted Exceptions`結案。WP-122-0B產品契約、production-sealed artifact、candidate與canonical 45檔provenance、quick zero-read smoke、production-safe同帳號唯一單筆建立readback／cleanup均PASS；未改變Auth、quick runtime、API、schema、RLS、worker、Vite或Firebase rewrite。實機、DEV-096 real-SW與完整B／W／P／獨立QA-QC缺口由使用者接受為REL-002殘餘風險，原始case狀態不變；未來release不自動沿用此例外。

R10以前的local／HTTPS evidence保留為回歸基線。R12的S15、B22～B24與W07已在2026-09-17 working-tree candidate PASS；D08～D10、D01～D07、真機voice／OAuth／offline、完整B/W/P與正式獨立QA/QC仍未完成且不得改記PASS，但本次不再阻擋release。REL-002 production gate與替代結案條件已完成，因此DEV-122終態為`Production Verified with Accepted Exceptions`。

### Architecture Closure R11：主程式綁定快速入口

- W3C Web App Manifest `shortcuts`允許已安裝App提供常用任務入口，shortcut URL必須位於該manifest scope內；root scope為`/`，所以`/quick-task/`符合契約。參考：<https://www.w3.org/TR/appmanifest/>。
- `shortcuts`是root install identity的啟動metadata，不是第二install identity。quick manifest保持`id='/quick-task/'`，因此使用者仍可選擇另行安裝第二圖示。
- Safari／作業系統的呈現能力不同；官方WebKit已記錄macOS Safari支援manifest shortcuts，但本規格不推論iOS一定呈現。參考：<https://webkit.org/blog/15063/webkit-features-in-safari-17-4/>。
- 不支援平台的產品fallback已定案為設定頁quick CTA與選用第二圖示；不得以UA猜測顯示「長按即可」的確定承諾。
- 同帳號不是由shortcut或UI label保證：manifest不攜帶帳號、token或owner；直接同步以固定JWT snapshot送出，由server `auth.uid()`定owner並由strict receipt owner equality驗證，OAuth claim才使用`getUser(snapshot.accessToken)`。獨立quick identity若沒有可用session則維持未綁定／待登入。

### Architecture Closure R12：manifest發佈、既有安裝與帳號證明

- `public/manifest.webmanifest`是唯一root manifest來源，因現行`VitePWA({manifest:false})`不產生另一份manifest；`index.html`單一link、`dist/manifest.webmanifest`及worker precache必須由S15／W07交叉驗證。
- shortcut icon使用現有實際1024×1024 PNG並宣告`1024x1024`；quick manifest同資產的舊尺寸metadata在本slice校正，避免瀏覽器依錯誤metadata選擇資產。
- 全新安裝以D08作主要gate。既有安裝的manifest刷新與OS捷徑呈現由平台排程，W07先證明新worker不再提供舊manifest，D10再記錄實際平台更新；產品不實作shortcut availability detection或強制更新流程。參考：<https://web.dev/articles/web-apps/shortcuts>、<https://web.dev/articles/manifest-updates>。
- 平台矩陣固定為Android Chrome/WebAPK與Chromium桌面主要驗證，macOS Safari 17.4+有裝置時補充；iOS/iPadOS不把manifest shortcut列為required，走設定頁CTA與選用加入主畫面流程。
- Tech Lead R12 review結論為`PASS`：P0／P1 unresolved architecture blocker = 0；WP-122-0B產品實作與local targeted gates已完成。D08～D10、完整QA/QC及release仍依本規格分開判定。

### Tech Lead R7 相容回歸裁定

- DEV-097 browser 原始 failure 分類為 `existing-regression-verifier-contract-mismatch`，已由 verifier 前置與 recovery flow 修正並於 2026-09-14 PASS；它不是 DEV-122 quick entry 的產品 FAIL，也不是可用 readiness timeout 描述取代的證據。
- `Sidebar` 初始 `isSidebarOpen=false` 是既有產品狀態；驗證器若要操作設定，必須先透過 `data-main-sidebar-toggle="true"` 展開側欄。這是 verifier 前置條件，不改手機 quick critical path。
- 空標題 prepare 失敗後，`record-draft` 保持 dirty／`OWNER_PREPARE_FAILED` 是正確 fail-closed readback。會議模式的 `forceFlushMeetingDraft` 只把 recovery snapshot 寫入 IDB；它不保存 canonical record，也不清除 PWA boundary state。故「local recovery safe」與「canonical owner safe」是兩個不同事實。
- DEV-097 closure 已採用可驗證路徑：驗證器在 recovery 後再次執行明確的 user-confirmed canonical boundary，保留失敗 prepare 的 readback。若未來要改產品 navigation／owner oracle，仍須另提 ADR amendment。DEV-122 不因這個診斷新增 worker、client、state authority、RPC 或資料邊界。
- QA／QC 應引用診斷 artifact 與 `output/playwright/dev-097/ui-result.json` 的 PASS；這只解除 DEV-097 browser 相容 gate，不解除 DEV-122 的真機、完整 B/W/P 或正式 QA/QC gate。

### Tech Lead R8 安裝入口修正

- 設定頁的 `/quick-task/?install=1` CTA 現在會在同一 quick MPA 顯示安裝引導；可用 `beforeinstallprompt` 時由使用者明確點擊「安裝快速建待辦」呼叫原生 prompt，iOS／內嵌瀏覽器則顯示平台適用的加入主畫面或改用系統瀏覽器指引。
- 引導區不等待業務資料、不改 title／voice／IDB／RPC 流程；名稱欄在引導顯示時仍可立即操作，沒有新增 worker、client、state authority 或 storage。
- SM14／SM15 已以 Chromium mock prompt、iOS UA 分支與 390×844 screenshot 通過；這只證明本機安裝模式與 prompt 呼叫，不能替代 D01～D04 的 iOS／Android install promotion。

### Tech Lead R9 混合寫入鎖契約修正

- quick create RPC 改用既有 placement RPC 相同的 `account:<owner>:unplaced:parent:root` advisory scope；未歸位 `max(sort_order)+1` 與 board↔unplaced placement 的 sibling/order mutation 現在由同一 transaction lock 序列化。
- 新增 static S11-lock-scope guard，並以 40-client mixed-writer-compatible fixture 重跑 isolated PostgreSQL／pgbench；結果為 20 個 Quick RPC＋20 個 test-only existing append fixture、40 個連續唯一 order。這證明 lock domain 的相容 transaction 行為；runner 以 marker／order／row-count fail-closed，失敗即寫入 FAIL artifact 並清理 task-owned runtime。P07 混入真實既有 writer 的 placement transport、P10 placement 與完整 P11～P14 matrix 仍須在 task-owned full schema／TEST project 執行。

### Tech Lead R10 語音 fallback 重試修正

- 根因是 voice adapter 回報 `fallback` 時 controller 保留舊 `voiceSession`；使用者依引導改用鍵盤聽寫或再次點擊語音時，下一次 tap 會先呼叫舊 session 的 `stop()`，無法重新建立 recognition。
- fallback 出口現在立即清除 session，再顯示「請點名稱欄，再點鍵盤麥克風。」；這只修正同一 quick controller 的生命週期，不新增 voice service、state authority、權限或資料流。
- quick browser `SM05` 已驗證 unsupported fallback 後再次 tap 可建立新 session，結果值為 `再試語音重試`；source 改變後已重跑 static、browser、build、TypeScript 與 targeted ESLint。

使用思考習慣：#第一性原理、#系統描繪、#限制條件、#可驗證性、#隱私






