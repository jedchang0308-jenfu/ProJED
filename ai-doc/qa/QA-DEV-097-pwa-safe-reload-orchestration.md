# QA-DEV-097：PWA 安全重新載入協調驗證計畫

狀態：`QA Executed / Local Automated QA PASS / Independent QC PASS / Physical Device Supplemental Not Verified / Not Released`
關聯 DEV：DEV-097 / DEV-096 / DEV-041 / DEV-034 / DEV-083
關聯 SPEC：`ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md`
關聯 ADR：`ai-doc/decisions/ADR-047-pwa-per-client-reload-isolation.md`
DEV-097 Contract Addendum
風險等級：Medium（使用者可見更新時機、跨分頁 reload、未儲存工作安全）
建立日期：2026-08-31

## QA 目標與 Evidence Boundary

驗證 normal update 不再要求使用者同意「取得新版」，而是依 reload-safety state 決定是否
需要協調時機。safe client 只在 natural boundary 靜默收斂；dirty／unsafe client 顯示最小
prompt，且任何分頁、Service Worker event或fallback navigation都不得造成未durable工作遺失。
ADR-047的application-owned Workbox registration、non-claiming activation、release cache isolation、
activation transaction／per-client convergence split與DEV-096 current===target truth都必須成立。

Evidence 分層：

- Static／pure evidence：證明 safety classification、state transition、forbidden trigger 與
  completed suppression；不證明真實 Service Worker 或 rendered UI。
- Browser integration：證明 owner registration、flush、view intent、dirty prompt、RWD、
  accessibility 與 visible-error 行為；不單獨證明 worker activation。
- Versioned real-SW integration：以immutable N／N+1／N+2 artifacts證明waiting、activation、
  controller不claim、舊cache／lazy asset retention、per-client reload與post-reload version readback。
- Build／TypeScript／lint／既有 regression 只支持編譯與相容性，不能取代 UI／SW evidence。
- Production 不屬本計畫執行邊界；release evidence 必須另走 deployment-release-gate。

## 2026-08-31 QA Execution Record

結論：`PASS（local automated QA）`。本次在 branch `持續優化3` 的未提交 frozen candidate 上執行；
測試環境為 Windows 10、HeadlessChrome 151.0.0.0、Playwright CLI 1.62.1、
`http://localhost:4000/`。QA 未 commit、push、deploy 或改寫正式環境。

核心證據：

- Static：DEV-097 `23/23`；readiness最後一個 producer 會立即重新分類，anonymous shell與登入後
  九個 mandatory owners均可收斂，revision倒退仍fail closed。
- Browser：1440×900、390×844、320×844 prompt契約通過；登入後真實九-owner matrix、
  dual-tab dirty isolation、record flush／cancel／failed prepare／readback、calendar／backup／invite／
  inline edit／task details／task drag取消全部通過；`visibleErrors=[]`、`networkFailures=[]`、
  `diagnostics=[]`。
- Real SW：DEV-096與DEV-097皆以immutable A→B→C、兩分頁完成；每release只有一個transaction、
  每分頁每release只navigation一次、prompt count為0，local／session／Cache Storage／IndexedDB資料保留，
  release-scoped A／B／C caches可讀；temporary runtime ports 61753與60591均`portReleased=true`。
- Adjacent regression：DEV-028、034、041、045、047、054、069、092、095、RAG static／browser gate
  依風險重跑通過。DEV-047 V3 backup browser含390／320 overflow與clipped-label檢查；DEV-054在
  保留8px產品門檻下修正CDP注入競態後連續兩輪`15/15`。
- Engineering gate：TypeScript PASS；32個變更程式檔ESLint為0 errors／9既有warnings；
  `build:test` PASS；`git diff --check` PASS。bundle size與Browserslist age只產生既有非阻擋warning。

首次失敗與RD回送均保留：登入後readiness曾停在`SAFETY_NOT_READY`、DEV-047由桌面縮到390px時
未收側欄造成標籤裁切、DEV-054完整批次曾因CDP事件抵達競態出現9px案例false failure；前兩項修正
產品根因，後一項不改產品threshold、只把同一9px事件提早注入並以兩次fresh rerun確認穩定。

Evidence：`output/qa/dev-097/static-result.json`、`output/playwright/dev-097/ui-result.json`、
`output/playwright/dev-097/sw-integration-result.json`、同目錄四張screenshots，以及DEV-096／相鄰DEV
各自既有output路徑；獨立QC事實報告為`ai-doc/qc/QC-DEV-097-pwa-safe-reload-orchestration.md`。
production smoke／deploy與DEV-054 iOS／Android實機補充未執行；不得由本次PASS外推為production
release PASS。

### Shared-scope Service Worker platform boundary

本 ADR 的「隔離」定義是 application navigation／reload、資料遺失與 release cache retention；同一
scope 的 waiting worker 執行 `skipWaiting` 後，瀏覽器可能對既有 controlled documents 發出
`controllerchange`，即使 `clientsClaim:false`。因此 QA 必須記錄 controllerchange，但驗收重點是
dirty tab 不被 application 自動導航、業務資料不變、舊 release asset／API 相容性可 readback；若產品
要求 controller identity 本身永不變，需另立 architecture decision，不可由 DEV-097 local gate 假設成立。

## UI Entry Contract

- Actor：任一 ProJED web／PWA 使用者，登入狀態與業務角色不影響更新能力。
- Fresh／uncontrolled 起點：開啟目前 app shell；預期無更新提示。
- Controlled-safe 起點：N document已偵測N+1且自己的readiness／owners safe；預期無提示，在自己的
  app open、foreground resume或operation-complete view transition收斂；repo沒有React Router。
- Controlled-dirty 起點：N client 已偵測 N+1，至少一個 owner unsafe；預期只顯示
  「新版已就緒」、「重新載入」、「稍後」。
- Dirty normal UI 不顯示 close、icon、說明段落、版本 badge 或成功宣告；recovery／failed
  可保留最短原因與恢復動作。
- Required viewports：1440×900、390×844、320×844；需要 keyboard、focus、ARIA 與
  safe-area evidence。
- 失敗條件：safe path 出現一般提示、dirty path 無入口或多餘元素、未 durable 工作遺失、
  另一分頁迫使 dirty tab reload，或任何非預期 visible error／白畫面／空 root。

## Fixture Contract

### F1：Reload-safety owner matrix

fixture 必須逐一走下列真實 owner，不得只用 generic mock owner 取代：

| Fixture owner | 正常 delivery path／readback |
|---|---|
| record／meeting draft | `RecordSidebar` signature、`saveDraft`、`saveMeetingDraftSnapshot`＋load readback |
| task details | title／notes local state、pending／failed persist counter與 node readback |
| calendar subscription | builder payload／name／saving；不完整 form action-required |
| backup import | inspection／plan／execute與既有 `beforeunload` guard |
| RAG／invite／input dialog | unsent text、client-only job、pending write、semantic action-required |
| inline editors | Sidebar／TagPicker／MindMap title與 relationship label commit readback |
| task drag | Board／WBS list／Shared sidebar／Gantt／MindMap／mobile task-drag cancel readback |

另建 durable server job、read-only modal、filter／popover negative controls；它們不得阻擋。Fixture
只建立前置 state；save／flush／cancel 成功、失敗與結果 readback 必須由正常產品 delivery path
產生。generic mock owner只可測 parser／registry failure，不能支持 owner matrix PASS。

### F2：Versioned real-SW artifacts

建立 immutable N／N+1／N+2 app artifacts；每版包含可 readback release identity、UI marker、
SW lifecycle trace 與 served-byte parity。測試可控制 waiting worker、controllerchange、stale
document 與 retarget，但不得用 synthetic update event 單獨支持 lifecycle PASS。

### F3：Multi-tab controller／cache isolation matrix

同origin至少兩個controlled documents，可分別設定safe／dirty、visible／hidden、owner crash與view
intent。需要記錄每頁release ID、controller script URL／state、local safety、transaction ID、owner
fence、activation count、navigation count與current／target readback。

N+1 activation前後須保留N／N+1各自release-scoped cache inventory與served-byte parity。Tab A safe可
activation／reload至N+1；Tab B dirty必須 navigation=0、原資料不變，並能在activation後載入一個
先前未載入的N lazy asset；controllerchange若發生必須被記錄且不得觸發application navigation。B只在自己的boundary使用
`projed.pwa-reload.reserved-target.v1` reload；不得有heartbeat／TTL或remote record expiry參與安全判斷。

### F4：Readiness／owner manifest

fixture須分別控制`version-shell`、`auth-shell`、`active-view` readiness epoch及typed owner manifest。
AuthGate loading、AppContent lazy／Suspense、active surface未註冊、duplicate owner與revision變動都必須
fail closed。animation frame只可測debounce，不得被當成readiness PASS。

### F5：Implementation／artifact identity

- Static runner：`scripts/verify-dev-097-pwa-safe-reload.ts` →
  `output/qa/dev-097/static-result.json`。
- Browser runner：`scripts/verify-dev-097-pwa-safe-reload-browser.pw.js` →
  `output/playwright/dev-097/ui-result.json` 與 viewport screenshots。
- Real-SW runner：`scripts/verify-dev-097-pwa-safe-reload-sw.mjs` →
  `output/playwright/dev-097/sw-integration-result.json`。
- 每個 runner 必須把 source revision、command、startedAt／finishedAt、fixture identity、assertions、
  first failure與 cleanup寫進 JSON；browser／SW runner 若啟動 temporary runtime，需記 PID tree、port、
  cleanup condition與 `portReleased=true`。

## FMEA

| 失效模式 | 使用者影響 | 偵測方式 | 優先級 | 對應案例 |
|---|---|---|---:|---|
| safe 判斷漏掉未儲存 owner | 內容遺失 | owner matrix＋reload 後資料 readback | P0 | DS-01、FL-02 |
| `virtual:pwa-register`／第二reload handler仍存在 | safety gate被繞過 | import／listener source assertion＋event trace | P0 | CT-05、MT-01 |
| 另一safe tab activation使dirty tab被claim／reload | 跨分頁資料遺失 | two-tab controller／navigation trace | P0 | MT-01、MT-07 |
| N+1 activation刪除N cache／lazy assets | 舊dirty tab故障 | cache inventory＋N lazy import | P0 | CA-01、CA-02 |
| durable background job 被誤判 dirty | 版本長期不收斂 | stable job ID reload／resume | P1 | DS-02 |
| arbitrary idle／pagehide 仍自動 apply | 使用者無法預期中斷 | forbidden-trigger trace | P0 | NB-04 |
| view transition 更新後遺失目的地 | 導航中斷 | intended／actual view readback | P1 | NB-03 |
| 「稍後」變成永久 pin 或反覆提示 | 版本碎片／干擾 | session＋dirty→safe sequence | P1 | UI-03、TX-02 |
| flush 失敗仍 reload | 未儲存資料遺失 | injected save failure＋navigation count | P0 | FL-02 |
| 舊 N UI 被當成 N+1 UI 缺陷 | 錯誤判定 release | real N→N+1 artifact provenance | P1 | BC-01 |
| compact prompt 仍溢出或無法操作 | 手機無法更新 | viewport screenshot＋bounding boxes | P1 | UI-04 |
| current≠target 卻 completed | 重複提示或版本錯置 | transaction／release ID readback | P0 | TX-03 |
| stale client看到 global completed後永久留在 N | 同 origin版本分裂 | resume client current／latest／completed readback | P0 | TX-04 |
| all-client convergence仍綁五分鐘transaction | 合法dirty延後被判failed | activation／local obligation timeline | P0 | CT-09、TX-03 |
| one-frame readiness早於AuthGate／lazy owner | 未保存內容漏判 | readiness epoch＋manifest缺漏 | P0 | CT-08、NB-07 |

## Test Cases

### A. Contract／Static

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| CT-01 | 檢查 safety classifier | 1A owner matrix逐項分類；unknown／fault fail closed | pure result |
| CT-02 | 搜尋 update effects | idle、hidden、`pagehide` 無 apply／navigation owner | source assertion |
| CT-03 | 檢查 prompt visible set | safe 無 normal UI；dirty exact set 無 close／icon／說明 | source assertion |
| CT-04 | 檢查 DEV-096 compatibility | target identity、single owner／apply、completion truth 保留 | contract result |
| CT-05 | 搜尋registration／reload ownership | 無`virtual:pwa-register`；`workbox-window`為直接依賴；只有PWA service可navigation | source＋package assertion |
| CT-06 | duplicate owner、owner throw、revision倒退、prepare超時 | 對應 signal／prepare failure code；navigation=0 | pure result |
| CT-07 | 檢查PWA config／effect imports | `injectRegister=false`、`clientsClaim=false`、`skipWaiting=false`、no normal cache cleanup、release cacheId；owner／hook／Bridge無worker/navigation | source assertion |
| CT-08 | typed manifest與explicit readiness | 每個mandatory owner有repo adapter／case；version／auth／active-view缺一即blocked；frame不可單獨ready | manifest＋pure result |
| CT-09 | 檢查transaction split | V1五分鐘stale只約束activation；completed不等all clients；local old client不被completed suppress | contract＋state-machine result |
| CT-10 | 檢查`package.json`與runner output | 三個DEV-097 commands存在；三個固定result JSON含revision／assertions／cleanup | package＋result schema |

### B. Dirty-State Matrix／Flush

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| DS-01 | 逐一啟用 F1 全部 mandatory真實 owners | 每項都阻止 apply並顯示 dirty prompt；owner ID／reason正確 | state trace＋DOM＋owner readback |
| DS-02 | 啟用 durable server job 或 read-only modal | 不阻止；reload 後可由 stable ID 恢復 job／view | API/UI readback |
| FL-01 | dirty prompt 點「重新載入」，所有 owners flush 成功 | 全部 durable 後只執行一次 apply／reload | save trace＋SW trace |
| FL-02 | 任一 owner save 失敗或 timeout | navigation=0；原內容保留，顯示最短可恢復錯誤 | data readback＋screenshot |
| FL-03 | 六類 task-drag surfaces逐一點「重新載入」 | 走既有 cancel／clear；Gantt preview不 commit；overlay／simulation全清 | task position＋DOM／store readback |
| FL-04 | calendar／backup plan／RAG input／invite／input dialog未提交 | 不替使用者送出 semantic action；action-required且原值仍在 | DOM＋network absence |
| FL-05 | meeting draft cloud save不可用、本機 snapshot可用 | 只在 snapshot `saved／degraded`且可 load readback後允許；兩者皆失敗則不 reload | IDB／session readback |

### C. Natural Boundary

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| NB-01 | fresh／uncontrolled 開啟 N+1 | 直接載入 N+1，normal prompt absent | release ID＋screenshot |
| NB-02 | controlled N 已有 N+1、safe；切背景再 foreground | foreground safe boundary 一次收斂 N+1 | lifecycle trace |
| NB-03 | controlled N safe；完成操作後切到 view R | `projed-last-view` readback後一次收斂，reload後 `currentView===R` | view storage＋navigation trace |
| NB-04 | controlled N safe；只觸發 idle、hidden、`pagehide` | 不 apply、不 navigation；待下一 natural boundary | negative trace |
| NB-05 | dirty 清除但沒有 natural boundary | 不立即在原畫面 reload；下個 boundary 才收斂 | timing／DOM trace |
| NB-06 | view storage write／readback故障 | `VIEW_INTENT_NOT_DURABLE`，保持目前 view且 navigation=0 | injected storage failure＋DOM |
| NB-07 | AuthGate loading、AppContent lazy或active-view owner未ready | booting不閃prompt、不apply；三個readiness scope＋manifest對帳後才分類 | epoch／manifest／state trace |

### D. Prompt／Accessibility／Viewport

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| UI-01 | controlled-safe 偵測 N+1 | 無更新 banner／toast／prompt 或 aria-live announcement | DOM＋a11y tree |
| UI-02 | controlled-dirty 偵測 N+1 | 只見「新版已就緒／重新載入／稍後」 | DOM＋screenshot |
| UI-03 | 點「稍後」，維持 dirty，再轉 safe | 本 session 不重複提示；next boundary 靜默收斂 | DOM＋state trace |
| UI-04 | 三個 required viewports | 無 overflow／重疊／裁切；主動作可點、safe area 正確 | screenshots＋bounds |
| UI-05 | keyboard／screen reader flow | focus visible、順序合理、狀態不重複播報 | a11y snapshot |
| UI-06 | prepare／activation／isolation／recovery failure | 最短原因與恢復action可見，無額外教學或框中框 | screenshot＋DOM |

### E. Multi-Tab／Transaction

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| MT-01 | Tab A safe、Tab B dirty；A進boundary並activation N+1 | A可reload；B navigation=0、資料不變、仍由N controller服務 | two-tab controller／navigation＋data readback |
| MT-02 | A／B都safe；A先boundary，B尚未boundary | 單activation transaction；A到N+1，B留N，B自己的boundary才reload一次 | IDs＋controller／navigation counters |
| MT-03 | B dirty點reload，local prepare失敗 | B不navigation且原值保留；A狀態不影響B local gate | DOM＋data／state trace |
| MT-04 | B hidden／dirty跨過五分鐘後resume | 不因時間或absence被視為safe；仍為N且顯示local dirty prompt | timeline＋release IDs |
| MT-05 | activation owner crash／lease takeover | 單一新fence接手activation；B controller／navigation不變 | owner＋controller trace |
| MT-06 | A完成global transaction，B仍dirty於N | transaction可completed；B不被suppression視為latest，local pending target保留 | transaction＋local state trace |
| MT-07 | A local gate通過後、activation前B轉dirty | A可activation；B不被claim／reload且資料不變，不需要remote preflight gate | two-tab race＋controller trace |
| TX-01 | N→N+1 完成後重複 check／visibility | 同 target 無 prompt、transaction 或 reload | absence＋counter |
| TX-02 | dirty prompt later，多次 check，server retarget N+2 | 保留單一 active transaction 並採最新穩定 target，不反覆打擾 | transaction trace |
| TX-03 | activation transaction超過5分鐘／owner current mismatch | activation未完成才failed；另一client長期dirty本身不觸發TRANSACTION_STALE | release IDs＋timeline |
| TX-04 | A完成N+1並寫global completed；expired／resumed B仍為N | B不能被completed suppress；自己的下一 boundary只reload一次並ack N+1 | current／latest／completed＋reservation |
| TX-05 | worker已由A activation，B下一boundary仍為舊document | B直接reload，不再送`messageSkipWaiting()`／不建立第二transaction | SW calls＋transaction count |
| TX-06 | reload呼叫被攔截，3秒內沒有`pagehide` | 回navigation-not-started、清本次reservation、原頁可重試；不得形成loop | timer＋sessionStorage＋navigation count |
| TX-07 | reload後current仍不等於reserved target | 不清reservation、不再normal reload；只進bounded recovery／failed | reservation＋recovery trace |

### F. Controller／Cache Isolation

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| CA-01 | N Tab B dirty；Tab A activation N+1 | B navigation=0、資料不變；controllerchange若發生不得觸發application reload | controller／event／navigation trace |
| CA-02 | N+1 activation後，B首次載入N lazy chunk | 從N release cache成功取得且served bytes與N artifact一致 | cache inventory＋request SHA |
| CA-03 | normal N→N+1／N+2 activation | 不執行cleanupOutdatedCaches／Cache.delete；各release namespace可辨識 | cache diff＋source assertion |
| CA-04 | Workbox waiting／activated／redundant events | event只改state；除PWA service boundary外navigation count=0 | listener＋navigation trace |

### G. Backward Compatibility／Regression

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| BC-01 | 真實 N old bundle 偵測 N+1 | 更新前只要求 N UI 契約；完成後才驗 N+1 UI | artifact provenance＋screens |
| REG-01 | 執行 DEV-096 transaction regressions | identity、single apply、retarget、storage safety 仍通過 | regression result |
| REG-02 | 執行 DEV-041／DEV-034 regressions | recovery、install guidance、AuthGate 外入口無破壞 | regression result |
| REG-03 | DEV-069／092／045／047／RAG regressions | draft、calendar、backup與client job既有save／recovery未破壞 | regression results |
| REG-04 | DEV-028／054／095 regressions | desktop／mobile／tracking task surfaces drag與interaction未破壞 | regression results |
| REG-05 | visible-error sweep | 無非預期 alert、HTTP 4xx／5xx、console／pageerror、白畫面 | sweep JSON |

## QC Evidence Contract

QC 依 frozen candidate 執行且不修改產品。最少需留下：

- source revision、dirty worktree boundary、artifact paths／SHA／bytes 與 served-byte parity。
- exact browser version、URL、view、actor、viewports、fixture state 與操作步驟。
- `output/qa/dev-097/static-result.json`、owner matrix、save／flush／cancel readback、view-intent trace。
- real-SW N／N+1／N+2 lifecycle、Workbox registration owner、waiting／activated states、transaction IDs、
  owner fences、activation／per-client navigation counts、session reservations與current／target／completed identity；固定結果
  `output/playwright/dev-097/sw-integration-result.json`。
- multi-tab controller script URLs、release cache inventories、local safety／readiness、N lazy asset SHA、
  資料前後readback與dirty-isolation evidence。
- `output/playwright/dev-097/ui-result.json`、1440／390／320 screenshots、DOM／accessibility snapshot、
  visible-error sweep。
- task-owned runtime 的 PID／port／purpose／cleanup condition 與 `portReleased=true`。
- 首次失敗證據與 RD 修正後 fresh rerun；不得用 build 成功抹除原始可見失敗。

## Stop Conditions

任一項成立即退回 RD，不得標 DEV-097 implemented／QA PASS／QC PASS：

- 未 durable 工作、登入或業務資料遺失，或 save 失敗後仍 navigation。
- 任一safe tab／worker event／fallback可迫使dirty tab application reload，或造成資料／舊版本資產遺失。
- idle、hidden、`pagehide` 或 normal 固定期限觸發 apply／reload。
- safe path 顯示一般提示；dirty path 缺 exact CTA 或出現 close／icon／說明／版本 badge。
- view transition 後目的地遺失；durable job reload 後無法恢復。
- 同 target 多 transaction／owner／apply／normal reload，或 completed 後再提示。
- current≠target卻completed、另一dirty client使activation transaction錯誤stale、stale client被global
  completed永久suppress、無界recovery、normal path清SW／Cache或改business storage。
- 任一 mandatory owner／drag surface未註冊，或 generic mock被用來取代真實 delivery-path evidence。
- 仍import`virtual:pwa-register`、`workbox-window`不是直接依賴，或存在第二個reload listener。
- `clientsClaim`不是false、不同release共用precache namespace、activation清舊release cache，N lazy
  asset在N+1 activation後不可用，或 controllerchange 直接導致 application navigation。
- version／auth／active-view readiness或typed manifest未完成即safe；animation frame被當成唯一ready gate。
- 任一非預期 visible error、HTTP 4xx／5xx、console error、pageerror、白畫面或空 root。
- 缺真實 SW、multi-tab、dirty readback、viewport 或 provenance evidence卻宣稱 PASS。
- task-owned runtime 未清理或 port 未釋放。

## Execution Contract 與 Boundary

RD 完成 WP-097-A～E 後，以下是交 QA 前固定 local gate：

```powershell
npm.cmd run verify:dev-097-pwa-safe-reload
npm.cmd run verify:dev-097-pwa-safe-reload-browser
npm.cmd run verify:dev-097-pwa-safe-reload-sw
npm.cmd run verify:dev-096-pwa-update-transaction-convergence
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-browser
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-sw
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser
npm.cmd run verify:dev-034-pwa-install-guidance
npm.cmd run verify:dev-034-pwa-install-guidance-browser
npm.cmd run verify:dev-069-meeting-draft-recovery
npm.cmd run verify:dev-092-record-sidebar-quietness
npm.cmd run verify:dev-045-calendar-subscription-builder-preview
npm.cmd run verify:dev-047-backup-package-contract
npm.cmd run verify:p9-rag-local
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-054-mobile-task-drag-precision
npm.cmd run verify:dev-095-task-tracking-interaction-parity
npm.cmd exec tsc -- --noEmit
$dev097LintFiles = @(
  'vite.config.js', 'src/App.tsx', 'src/components/AuthGate.tsx',
  'src/services/pwaUpdateService.ts', 'src/services/pwaUpdateTransaction.ts',
  'src/services/pwaReloadSafety.ts', 'src/services/pwaReloadOwnerManifest.ts',
  'src/hooks/usePwaReloadSafetyOwner.ts', 'src/components/PwaReloadSafetyBridge.tsx',
  'src/components/AppUpdatePrompt.tsx', 'src/components/Records/RecordSidebar.tsx',
  'src/hooks/useMeetingDraftRecovery.ts', 'src/store/useRecordStore.ts',
  'src/components/TaskDetailsModal.tsx', 'src/components/CalendarSubscriptionsView.tsx',
  'src/components/BackupSettings.tsx', 'src/components/Rag/RagSidebar.tsx',
  'src/store/useRagStore.ts', 'src/components/BoardMembersPanel.tsx',
  'src/components/GlobalDialog.tsx', 'src/components/Sidebar.tsx',
  'src/components/Tags/TagPicker.tsx', 'src/components/MindMap/MindMapNode.tsx',
  'src/components/MindMap/MindMapView.tsx', 'src/components/BoardView.tsx',
  'src/components/Wbs/WbsListView.tsx', 'src/components/SharedTaskSidebar.tsx',
  'src/components/Gantt/GanttTaskBar.tsx',
  'src/components/Wbs/taskDrag/useTaskDragSession.ts'
)
npm.cmd exec eslint -- $dev097LintFiles
npm.cmd run build:test
git diff --check
```

QA 已在修正後 frozen candidate 重新執行三個 DEV-097 verifier：static `23/23 PASS`、local browser
九-owner／雙分頁／flush-cancel-failure readback PASS、real-SW A→B→C two-tab convergence PASS；固定結果位於
`output/qa/dev-097/static-result.json`、`output/playwright/dev-097/ui-result.json`、
`output/playwright/dev-097/sw-integration-result.json`。本機自動化QA與independent QC已PASS；
physical device supplemental、production deploy、remote smoke、release與mandatory update policy
不在本次執行範圍，仍需另行授權。
