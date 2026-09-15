# ADR-050：手機快速建待辦的獨立入口與單筆 outbox 架構

狀態：`Accepted / Architecture Confirmed / RD Implementation Candidate / Local Candidate Implemented / QA-QC and Target-device Gates Pending`
日期：2026-09-15
修訂：Tech Lead R10；保留R4去重／載入架構、R5 raw form／IME修正、R6自動重試封頂、R7 DEV-097相容回歸裁定、R8 `install=1`快速安裝引導與R9 account-unplaced advisory scope對齊，補上 voice fallback 後清除失效 session 的重試契約，明確分離本機 recovery safe 與 canonical owner safe。
關聯：[DEV-122](../dev_task.md#dev-122projed-手機零資料載入快速建待辦)、[SPEC-122](../specs/SPEC-122-mobile-zero-data-quick-task.md)、[QA-DEV-122](../qa/QA-DEV-122-mobile-zero-data-quick-task.md)、SPEC-034、SPEC-039、SPEC-115、ADR-047、ADR-048

## Context

使用者要求在手機建立第二個 App 入口「ProJED快速建待辦」，點開後立即編輯任務名稱，可直接打字或使用名稱旁的語音按鈕，而且名稱可操作前不等待完整 ProJED 資料。

現行 root entry 靜態匯入完整 App，登入後會啟動 `useDataSync()`；現行未歸位建立流程又依賴已載入的 workspace、client-calculated order 與完整 task store。把 quick route 放進現有 App、或直接重用未歸位 `list + upsert`，都無法形成可證明的零業務讀取邊界。

第二個 PWA 若改用獨立 origin，能得到最清楚的 install／storage／permission isolation，但會同時增加 subdomain hosting、OAuth redirect、CORS、session bootstrap 與 release topology。現有 deployment 只有一個 Firebase Hosting origin；current phase 先以同源 nested path 驗證使用者要的第二圖示。

## Decision

採用「同源獨立 multi-page PWA entry + 單一 root service worker + account-bound IndexedDB outbox + server-owned single-item create RPC」。

1. root ProJED 保留 `/`；quick entry 使用實體 `/quick-task/` page。其 semantic form直接存在HTML，使用小型TypeScript progressive enhancement，不掛載React或完整App。
2. root manifest 固定 `id='/'`；quick manifest 使用獨立 `id/start_url/scope='/quick-task/'`。scope 不擴到 `/`；「前往工作台」是刻意跨出 quick app 的導覽。
3. 兩個 entry 共用現有 root `/sw.js` 與安全更新 transaction，不註冊第二個 service worker。Workbox root SPA fallback明確deny `/quick-task/`，並在唯一 build 邊界忽略有限的 `install/capture/claim` OAuth callback query，兩個shell以同一build-wide version參與交易；quick shell另提供自己的readiness與reload-safety owner。
4. 名稱 critical path 不載入React、業務store、Google scripts、Workbox或Supabase；小型voice adapter隨controller載入，以同一tap同步focus/start。auth/outbox/PWA在controller-ready後非阻塞載入，恢復舊pending不等待下一次submit。原始form帶無JS `onsubmit="return false"` guard並先停用submit，避免JS未就緒時Enter導覽或文字進URL；controller submit另檢查IME composition。
5. 使用者確認後，先把 immutable capture 寫入 account-bound IndexedDB outbox並做same-key readback；未登入也先停在durable success畫面，由使用者點「登入以同步」。remote未確認時只顯示「已記下，待同步／登入後同步」。
6. quick client只呼叫 `create_quick_unplaced_task_v1(capture_id,title,workspace_hint)`；server同一transaction建立task與 `private.quick_task_capture_receipts`。回傳compact receipt、不複製task snapshot；replay先查immutable receipt，任務改名／歸位／刪除後仍不重建。owner/context/order/defaults由server決定；排序lock只保護quick RPC，不外推到既有direct writers。
7. local session只作account hint。RPC以JWT／`auth.uid()`與RLS定權；每request固定同一owner/token快照，不能在account guard後由ambient RPC換讀另一帳號token。claim在登入CTA時建立；callback只先移除claim，保留OAuth參數給既有client auto-detect，以同一token做getUser、核對account epoch後CAS認領，處理結束才清理credentials。禁止自動認領任意unbound draft。
8. WP-122-0只驗iOS／Android第二icon、launch、install與storage sentinel；真實OAuth、voice與offline功能驗證由其實作WP及最終真機gate承接。平台確實不能形成第二App才回ADR評估獨立origin；缺裝置或implementation bug不直接推翻架構。
9. 「前往工作台」帶不含任務資料的一次性root intent，登入後呼叫既有open command；沿用單一panel，沒有既有host時才由MainLayout暫時掛載，不切換view或干擾草稿。remote未確認仍不承諾pending task已可見。
10. backlog只增加本機逐筆恢復：本人可同ID重試或複製名稱／前往工作台確認；不新增remote list／CRUD、第二Inbox或通用queue framework。完整狀態與UI契約由SPEC第7節維護。

R4 complexity boundary：raw HTML、quick controller、IDB outbox、fixed JWT adapter、single RPC、root intent 是六個且僅六個必要責任點；每個狀態只由一個 authority 持有。任何新增 wrapper、第二 worker/client、remote inbox、平行 draft store 或通用 queue 都視為架構漂移，除非先以獨立生命週期／安全邊界與驗證案例提出 amendment。

## Consequences

### Positive

- raw HTML讓title在initial module、React、auth或PWA service尚未完成前即可編輯；quick首屏與完整App的code/data dependency可被import graph、network trace與build artifact直接驗證。
- local durable commit 與 remote canonical commit 分開，離線、auth refresh、重開與 retry 都不需要冒充成功。
- server-owned context/order消除「為建立一筆任務先下載整份清單」；合作的quick RPC之間序列化append。
- capture id同時是local primary key與receipt key；任務生命週期不改變首次create結果，可涵蓋timeout後先歸位／刪除再retry。
- 固定JWT的薄fetch adapter補上RLS無法辨識的「A文字誤帶B token」競態；root到達與失敗恢復都有可重現的使用者入口。
- 保留 SPEC-039 account-unplaced placement 與 SPEC-115 blank content，不建立第二套 Inbox domain。

### Cost／risk

- 同源且 nested scope 的多 PWA 可能被瀏覽器視為同一 app 範圍，尤其已安裝 outer app 時，inner app 的 install promotion 可能被抑制；必須以實機 gate 決定能否交付。
- 同源 storage 在部分平台共用，在部分 Home Screen context 可能隔離；quick app 需要能承受首次獨立登入，不能假設 root app session 一定存在。
- Vite build、manifest identity、root Workbox precache、common `app-shell-meta.json`與update service需要支援兩個shell，增加release artifact verification。
- 現有 unplaced table 仍允許完整工作台 direct CRUD；新 RPC 只保證 quick create path 的最小輸入與冪等，不是全表 API 收斂。
- 每capture保留一筆無title／task snapshot的compact receipt，task刪除不cascade；帳號刪除才cascade。這是避免長期離線retry重建task的必要成本；不能用local synced 7日清除規則刪server receipt。
- IDB不是雲端備份；頁面被關閉後不保證背景同步，root App本期不接管outbox。storage被清除／evict仍可失去未同步資料；UI只宣稱已記在本機，並提示重開quick續傳。
- quick request adapter需自行解析既定RPC錯誤／receipt及timeout，但只處理此單筆endpoint；薄fetch保留Retry-After headers並避免dispatch再等ambient session，auth仍重用既有client。root intent限同一瀏覽context，不假定兩個PWA共享sessionStorage。

## Alternatives rejected

### A. 在 root App 內新增 `/quick-task` route

拒絕。`src/main.tsx` 與 `AppContent` 仍會掛載完整 App／同步，route 只改畫面，不能證明零業務載入與 bundle isolation。

### B. 恢復 SPEC-034 `QuickCaptureShell`

拒絕。它需要先進完整 App，且已由全域任務工作台未歸位 lane 取代；恢復會同時增加重複入口與舊 Inbox domain。

### C. quick client 讀取 workspace／unplaced list 後 direct upsert

拒絕。這會把啟動摩擦帶回 quick path，並使 client order 在並發下碰撞；owner、context、order 與 idempotency 也無法由單一 transaction 驗證。

### D. 立即使用獨立 subdomain／origin

不採用於 current phase。隔離較強，但需要新的 hosting、OAuth redirect、CORS、session 與 release boundary。若 WP-122-0 證明同源第二 App 不可靠，本方案成為下一個正式選項，不可由 RD 靜默切換。

### E. 只依賴手機鍵盤內建麥克風

拒絕作為唯一入口。網頁不能跨平台代按鍵盤聽寫鍵；current phase 使用可見語音按鈕，在支援的瀏覽器直接啟動 SpeechRecognition，其他情況引導鍵盤麥克風。

## Compatibility and migration

- SPEC-034：`Compatible extension`；原 App install flow 保留，QuickCaptureShell 維持退役，設定頁只增加 quick install CTA。
- SPEC-039：`Compatible extension`；remote destination 仍是 account-owned unplaced item，工作台 IA 與 placement lane 不變。
- SPEC-115／ADR-048：`Compatible extension`；SQL create path 必須以 parity fixture 證明 blank task defaults 一致、description absent。
- ADR-047：`Compatible extension`；同一 root worker 保留 safe activation，quick shell 新增自己的 reload owner/profile。
- Database：unplaced既有PK／RLS及placement不改；新增private receipt table／owner RLS／SELECT+INSERT grants與RPC，同一additive migration，private不暴露Data API。quick create 與既有 placement 共用 `account:<owner>:unplaced:parent:root` advisory scope；security invoker保留，不建立privileged proxy。實際migration檔名由CLI生成；receipt／outbox的完整最小schema以SPEC-122 §7.3～§7.4為準。

## Governance

- SPEC-122 是 current implementation authority；DEV-122 是狀態、派工與 evidence 索引。
- WP-122-0 是架構 feasibility gate。通過前可做 spike／prototype，不得宣稱第二 App 已可交付；失敗時不得用 browser bookmark、單一 icon 或 root route 冒充 PASS。
- 本 ADR 不授權 production migration、deploy、push 或 release。
- Supabase Auth/RLS 與 PWA platform 行為以實作時的官方文件與 target-device evidence 為準；文件變更若影響本決策，先 amendment 再繼續。

## Architecture Closure（2026-09-14）

Architecture Closure Review已對照branch `持續優化3`、HEAD `e335eaa07c14313afb5a27607a2c009ace3bcbc3`的實際Vite 7.3.6、vite-plugin-pwa 1.2.0、Workbox 7.4.1、Supabase JS 2.105.4、Firebase Hosting設定、PWA reload交易、account-unplaced schema/service、blank-task factory及Workbench hydration。

以下屬本ADR已決策且實作模型不得替換的architecture：

- raw HTML + React-free quick critical graph；MPA route與Firebase quick rewrite均為 `/quick-task/`。
- nested identity + one root worker；denylist配合directoryIndex及有限query忽略規則，才提供quick離線HTML；main/quick共用artifact version，update nonce不可被cache正規化。
- `quick-task-capture`是唯一quick reload owner；無其他dirty reason時local readback後remote pending可reload，readback前及輸入／語音／claim callback中不可reload。
- IndexedDB `projed-quick-task-v1/captures`是local durability authority；claim以短期nonce hash綁定，sync以30秒lease CAS。
- RPC arguments／security invoker／server context／SPEC-115 payload保留；idempotency改用private immutable receipt，response精簡為建立收據。既有unplaced PK/RLS與placement不改。
- quick create 與 `move_task_workbench_subtree_v2` 共用 account-unplaced root advisory key，讓排序與 ownership boundary mutation 維持同一 transaction lock domain；這是 R9 的相容鎖契約。
- request與claim固定owner/token/epoch快照；單筆RPC採明確Authorization的fetch，不另建Supabase client。
- Workbench使用一次性root intent與既有open command，互斥panel host可處理沒有active board的情境；remote hydration先於workspace gate，不新增sentinel workspace或第二個task model。
- 本機待處理入口涵蓋逐筆recovery與8次失敗暫停；保留目前輸入／帳號隔離，不引入remote任務管理。

R4在R3基礎上修正callback cache query未集中配置，以及既有capture id碰撞／int32 order邊界未明確收斂的缺口；R3的固定身分快照、root intent與逐筆恢復保留。R5修正raw form／IME submit邊界與驗證器fixture；R6修正自動重試耗盡後仍可被前景 lease 取得的狀態漏洞：第8次自動失敗即轉為`failed_permanent/AUTO_RETRY_EXHAUSTED`，只有明確人工retry可重置。R7補充DEV-097相容回歸裁定：既有驗證器需先展開預設收合的側欄；失敗 prepare 後，會議模式的本機 `forceFlushMeetingDraft` 只保存IDB recovery snapshot，不等同 canonical record owner 已 safe，故驗證器改為 recovery 後明確執行 user-confirmed canonical boundary，並於 2026-09-14 取得 browser PASS。R5～R10均不改責任、資料或安全邊界；R10 只在 voice fallback 出口清除失效 controller session，讓下一次 tap 可重新建立 recognition。local candidate已落實quick MPA、共用shell metadata、IDB lease/claim、固定JWT adapter、有限Workbox query normalization、root intent、Workbench hydration與quick reload owner。SPEC工程契約為 `Intentional replacement`；產品決策與其他DEV權限契約為 `Compatible extension`。P0／P1未決工程問題=0；真機、isolated DB與完整產品測試仍未完成，不能從文件推定PASS。

## Decision outcome

`Accepted / Architecture Confirmed / RD Implementation Candidate / Local Candidate Implemented`。repo candidate的static/pure、quick browser local smoke（15 assertions：initial/edit/save、fallback後重試、IME、voice insertion、geometry、zero business request、delayed module、lease／claim、8次重試封頂後阻擋與人工重試重置、`install=1`引導與原生`beforeinstallprompt`呼叫、iOS加入主畫面指引）、root intent browser、build、`npx tsc --noEmit`、service-worker、isolated PostgreSQL core matrix（22 checks）、固定 fixture pgbench concurrent transport（20 clients／20 rows／0 failed）與 40-client mixed-writer-compatible transport（20 Quick RPC＋20 test-only existing append fixture／40 unique orders／0 failed）已通過；R9 static lock-scope guard 亦證明 quick create 與既有 placement source 共用 account-unplaced advisory key，R10 的 SM05 亦證明 fallback 後可重新建立 voice session；D01～D07、P01～P14、完整QA/QC與release gates仍由QA／QC及target device承接。current phase沒有待使用者或實作模型補決策的P0／P1 blocker。

### Tech Lead R7 Compatibility Gate Note

DEV-097 browser 的診斷與修正 artifact 為 `output/qa/dev-122/dev-097-compatibility-diagnostic.json`、`output/playwright/dev-097/ui-result.json`；這是既有 regression verifier 的入口與 owner oracle 落差，不構成 quick 架構漂移。修正保留空標題 prepare 的 fail-closed readback，並以完整 browser verifier PASS 解除 DEV-122 的 DEV-097 browser 相容 gate；真機、完整 QA/QC 與 release gate 仍未解除。

### Tech Lead R9 Mixed-Writer Lock Note

quick create RPC 已改用既有 placement RPC 的 `account:<owner>:unplaced:parent:root` advisory scope，避免 quick 專用 lock 與 placement lock 分裂。這是同一 account-unplaced root 的 ordering contract 修正，不新增 worker、client、state authority、資料表或 API；static lock-scope guard 與 40-client mixed-writer-compatible fixture 已通過，但 fixture 使用 test-only existing append function，不能代替真實 P07 mixed-writer placement transport 或 P10 placement full gate。

### Tech Lead R10 Voice Fallback Note

voice adapter 回報 `fallback` 時，quick controller 現在立即清除舊 recognition session，再顯示系統鍵盤聽寫引導；因此使用者可在同一頁再次點擊語音，重新建立 recognition。`SM05` 已驗證 unsupported fallback 後 retry final transcript `再試語音重試`。此為既有 quick controller 的生命週期修正，不新增 worker、client、state authority、permission boundary 或資料表；真機 permission denial／無聲音仍由 target-device gate 承接。

### Tech Lead R8 Install Entry Note

`/quick-task/?install=1` 由 quick 自有輕量 install guide 處理：Android／桌面在 `beforeinstallprompt` 可用時才顯示明確安裝按鈕，iOS 顯示 Safari 加入主畫面步驟，內嵌瀏覽器提示改用系統瀏覽器；所有情境保留同一 title input 與 quick capture path。此修正不引入第二 worker、client、state authority 或資料邊界；SM14／SM15 與安裝模式 screenshot 已 PASS，但不取代 target-device feasibility gate。

使用思考習慣：#設計思考、#問對問題、#第一性原理、#系統描繪、#限制條件、#可驗證性、#隱私

