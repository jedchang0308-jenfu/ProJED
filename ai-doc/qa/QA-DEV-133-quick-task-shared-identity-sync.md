# QA-DEV-133：雙 App 各自登入／依帳號同步／本機清理

修訂：**2026-10-01 Rev 4；本機實作已落地，N01～N10 真實整合仍未執行**。來源為使用者採用「共用帳號、各自登入、各自保存 Session、離線任務依帳號同步」。依 [SPEC-133](../specs/SPEC-133-quick-task-shared-identity-sync.md) 及 [ADR-053 Rev 3](../decisions/ADR-053-quick-task-cross-origin-account-link.md) 驗收；[DEV-133](../dev_task.md#dev-133-快速建任務同帳號與自動同步---2026-09-30) 維持執行中，文件與本機程式實作不算產品完成。

## 新版範圍與證據規則

- 正常登入採既有 Supabase／Google provider，驗證兩個 origin 各自 Session；不再要求 ProJED OAuth Server／public client／consent 或舊 B0／B1 Gates。Google OAuth 登入與 callback 安全仍須測，不因名稱含 OAuth 就刪掉。
- TEST 為既有授權的 `fhisnnufoeulxqrchldf`；正式資源範圍沿原授權，正式操作按實作及 release gate。本輪已完成本機 source／typecheck／lint／test build／獨立 auth contract；TEST migration 申請因 B0 完整驗收前置尚未成立而被安全審查拒絕，未執行遠端修改。RPC／RLS 讀回不算本矩陣 PASS。
- 使用者已取消實體 Android 驗收。窄版 Chrome／手機模擬可驗版面與操作，不能稱 Android PWA 實機 PASS；取消實機不等於省略真實登入／RPC／工作台與 owner 驗收。
- 舊 A 本機 evidence 只有在 source／fixture／case 路徑仍相符時才可重用；舊 OAuth mock、桌面 B0、synthetic JWT 不能替代新方案真實憑證。舊 v2 只保護 quick 表，並非整個 ProJED API 的隔離證明；空表 SELECT 回 0 也不能證明隔離。

## 新版 fixtures 與正常入口

受控 TEST 使用者 A／B，各有有效 workspace membership 與可操作的全域任務工作台。兩個隔離 browser origin/context 分別代表主程式及快速 App；同帳號測試也保留不同 Session。測試前用唯讀盤點確認 fixture；DB seed 只建立案例前置條件，目標任務必須由正常 quick UI 的「建立」產生。

IDB fixture：DB v1 原始 captures及 DB v2 auth_context；unbound、A-bound pending／failed_auth／failed_retryable／failed_permanent、B-bound pending、6／8 日 synced 與 40 日未同步資料；每筆有唯一 captureId；另有舊 synced 無 receipt、有效／錯 hash receipt、context 登出 barrier及 projectRef 不符樣本。網路、Auth 401、timeout／錯 receipt、lease、晚到回應可作隔離故障注入，需另標 SIMULATION，不替代真實服務結果。至少一例用真實普通 Session 及正常工作台操作證明端到端成功。

入口：既有安裝入口／root shortcut／quick 頁 → 名稱／內嵌語音 → 建立；獨立「登入」入口 → Google → 原 quick origin；待處理入口 → 明確目的帳號認領／稍後處理；「前往工作台」→ 主程式自己的登入及全域任務工作台。主程式登入 B 時不自動切到 quick A。

## 新版驗收案例

下列案例皆為 **NOT RUN（真實 Auth／RPC／工作台整合待執行）**；不能把舊 A/B 編號的 PASS 搬入本表。

| 編號 | 前置、操作與可觀察通過條件 | 必要證據層 |
|---|---|---|
| N01 | 主程式 A，quick 未登入：兩邊自身狀態正確、quick 可先記且無 RPC。quick 由登入 CTA 選 A、回原 origin，兩邊核實 user ID 相同但 Session 各自保存；重開仍可驗證，無跨 origin token 傳送或業務 list 載入。 | 真實 Auth + browser UI／request，兩個 origin 及重開紀錄。 |
| N02 | quick A 從名稱欄建立，再由正常 CTA 前往主程式 A 工作台：receipt owner=A、同 ID 只有一筆。改主程式登入 B、quick 仍 A：B 工作台無 A 任務，兩邊正確顯示帳號，不搬資料／不自動換帳。 | quick UI → 真 RPC／receipt → main 工作台 UI + 唯一性唯讀 DB。 |
| N03 | quick 已核實 A 後斷網，新建任務 raw IDB 為 A-bound；reload／回前景仍保留 A 歸屬及離線待確認。從未登入／明確登出後新建為 unbound。輸入、IME／語音及本機 readback 不等網路；DB v2 owner/context revision 交易與登出競態只能保留原 owner 或 CAS 失敗，不能靜默轉 B。合法 UUID、500 code points及 IDB 失敗／同 ID readback 重試均驗。 | 真 browser／raw IDB；實際語音與注入結果分開標記。 |
| N04 | A-bound 待送，回網且 A Session 有效後同 captureId 自動送出、receipt 正確、工作台唯一。另驗 online 但服務 timeout、退避到期、重開／回前景、8 次耗盡及稍後處理：保留原資料，不無限重登、不承諾 App 關閉後同步。 | 至少一例真 Auth／RPC；retry 邊界可另用注入、request 與 IDB 證據。 |
| N05 | local Session 有 A 但核身失敗／401／refresh 失效，不 RPC、不顯示剛驗證 A。重新登入 B 不送 A 記錄、不洩漏 A title；重新登入 A 才恢復同 ID。登入取消／callback error／claim 過期後原記錄仍在。 | 真登入取消／恢復 + 401 注入、request／owner／raw IDB。 |
| N06 | unbound 在 A 或 B 登入事件後仍未自動綁定；目的帳號顯示後明確確認才 CAS claim。先確認 A 卻回跳 B 時再次確認；nonce 缺失／過期／重播／競態或取消皆保留原資料，不任意改 accountId。 | 正常 UI 認領／取消、nonce/CAS、raw IDB 與 owner readback。 |
| N07 | 兩邊 A、不同 Session：在 quick 一般登出只結束 local Session，主程式仍可核身；主程式一般登出亦不誤用 global。quick 本地立即停止新調度／bump epoch，未同步資料保留；A 在途回應晚到或切 B 不能顯示 B 同步成功／以 B JWT 送 A。已有全域撤銷需另記實際平台時效，不把 access token 未到期當立即撤銷。 | browser UI + scope／Session／epoch；跨帳 request、late-response 與 receipt。 |
| N08 | RPC timeout 但已 commit、兩視窗同 ID 重送，只有一筆 task／receipt；相同 owner/title replay 成功，title conflict、錯 captureId／owner／titleHash／committedAt receipt 不轉 synced；有效 receipt 與 synced 原子保存。匿名／B 不可讀改 A receipt/task；B 帶 A workspace hint 只可回落 B 自身有效 membership，無 membership 為 QT_NO_AVAILABLE_WORKSPACE。缺 profile／workspace 保留任務、到主程式完成設定後同 ID 人工重試；普通工作台既有操作回歸。 | 真普通 Session Data API／RPC + 含 A/B 非空資料的 DB／RLS矩陣；SQL 模擬另列。 |
| N09 | raw-store 有效 receipt 的 synced 8 日刪、6 日保留；legacy 缺 receipt／未來或損壞時間不刪，同 owner replay 核實後才進清理；40 日 unbound／pending／failed 保留，fresh syncing→synced 並行不誤刪，交易中止可偵測，重開補清。server task／receipt 仍存在，登出／切帳不清未同步。 | browser／原始 IDB；清理前後 server 唯讀比對。 |
| N10 | DB v1→v2／blocked／abort／舊 connection 關閉／回復候選 v2 相容皆驗；舊新版更新後 origin／manifest／本機 owner/captureId 不變；舊自製 OAuth token 不被轉換／授權 flush，普通登入同 owner 才續送。TEST corrective schema 為 canonical DEV-122 invoker／原 owner RLS、U+200B 不 trim，無新 grants／資料重寫；正式 release selection 不單獨補套 retired v2。bfcache pageshow 恢復一份訂閱／timer；source/build 無 consent及 QUICK_TASK_OAUTH 可啟用路徑。320×844、390×844、726×668 與鍵盤：狀態／登入／恢復可辨識、無水平溢出或重疊、無 consent UI／OAuth gate 常駐提示。 | schema/ACL readback + frozen candidate 正常入口操作／viewport／截圖／可見錯誤掃描。 |

## 失效風險與 QC 判定

| 失效模式 | 使用者影響／偵測 | 必驗案例 |
|---|---|---|
| 兩個 App 帳號不同卻把任務送到主程式當前帳號 | 跨帳資料污染；以 A/B 非空工作台、Bearer owner 與 receipt 查證 | N02／N05／N07 |
| 把回網當登入恢復或因離線丟失已知 owner | 錯帳認領／無法自動恢復；raw IDB 及核身失敗時 RPC=0 | N03／N04／N05／N06 |
| 一般 signOut 省略 scope，SDK 採 global | 意外登出另一 App；兩邊真 Session 核身比對 | N07 |
| timeout 重建 ID／晚到回應套到新帳號 | 重複任務或假成功；captureId／唯一 row／epoch 比對 | N07／N08 |
| 清理／改版刪掉未同步任務 | 不可恢復資料遺失；raw store／server 前後比對 | N09／N10 |

任何錯 owner、可見非預期錯誤、假同步成功或未同步資料消失皆 FAIL。必要 UI 無入口、callback 回錯 origin、兩邊狀態誤導、窄版破版亦 FAIL。Build／lint／API 成功不能擦除 UI 失敗。未取得真實 Auth／工作台層的 evidence 只能 PARTIAL／未充分驗證，不標整體 DEV 完成。

QC 每例保存 sourceRevision／dirty boundary、build artifact、環境、actorAlias、route／origin、viewport／browser、fixture、正常操作、expected／actual／status及必要 screenshot／captureId/owner 匹配摘要。token、code、email、title 不寫報表／console；必要可見身份截圖使用受控測試帳號並遮蔽個資。測試後只清理已確認的 task-owned fixture／runtime／UI，不刪真實未同步資料、不停止 user-owned localhost:4000。

## 執行交接與本輪查證（2026-10-01）

現行工程契約已定案，執行順序與命令以 [SPEC-133 §8](../specs/SPEC-133-quick-task-shared-identity-sync.md#8-實作責任面與順序)／[§9](../specs/SPEC-133-quick-task-shared-identity-sync.md#9-驗證命令驗收與停止條件) 為準；QA 案例的 NOT RUN 不因本機實作或文件成熟度升級而變為 PASS。

| 執行路徑 | 固定前置與證據 |
|---|---|
| 本機故障與交易 | 已新增 `verify-dev-133-independent-auth-contract.ts`，以 source contract、receipt／錯誤分類及 migration boundary 驗證；`tsc`、targeted lint、test build 均通過。既有 local-browser runner 已切換 DB v2，但因環境沒有 Playwright package，本輪未產生新的 browser artifact；不得將此靜態／建置證據升格為 N01～N10。 |
| 真 TEST 同帳／異帳 | 核對受控 A／B 的 profile、active membership、非空工作台與普通 Google 登入。兩個 TEST origin 分別操作 main 登入 A、quick 登入 A／B，確認 user ID 與不同 Session 的去識別化識別；正常 quick「建立」→ receipt →正常 main 工作台唯一讀回。不得把已有管理 token、SQL role 或舊 OAuth token 填進 browser 取代登入。 |
| claim／logout | unbound 登入後仍未認領；顯示目的帳號、確認才 CAS。A→B 確認頁失效、兩 tabs 競態、登出時 storage／IDB 失敗與 SDK signOut 網路錯誤皆驗。barrier 提交失敗只可顯示未完成、停止本頁調度，不能宣稱跨 reload 已登出；提交成功後即使 SDK 網路錯誤，barrier 跨 reload 生效、殘存 Session 不會自動恢復 flush，成功主動重登才解除。 |
| migration／權限 | fresh DEV-122及 existing v2→new correction 各跑原 DB 矩陣；再用真普通 JWT 的 A／B／anon 作非空 Data API／RPC 驗收。metadata、SQL claims 模擬及真 JWT 結果分列；DB error 42501／23503、無 workspace及 replay receipt 都保留 ID。 |
| 更新／生命周期 | 預載 v1 A pending／B pending／unbound／legacy synced，再載新 candidate；驗 raw owner／ID／title 前後不變、context 失效／環境 mismatch 停送、cleanup CAS、bfcache 回前景自動恢復及零重複 listener。 |

真 TEST 前置不足時記 `NOT RUN / fixture or callback prerequisite unavailable`，只停止依賴該前置的 case，繼續本機／DB／型別驗證；不能重啟舊 OAuth Client／Android Gate。新 verifier 尚未實作，不能引用不存在的輸出作證據。新 evidence 統一放 `output/qa/dev-133/independent-auth/` 並記 source／artifact／route／actorAlias／實際操作；預期 TEST 任務名稱使用測試前綴，cleanup 僅限本輪已同步 fixture，不清任何未同步資料。

### 2026-10-01 RD ordinary-session probes（部分證據）

以下證據使用 TEST `fhisnnufoeulxqrchldf` 的既有測試帳號，所有 browser context 均為隔離 headless session；不輸出 token、email、title 或 user ID。readback／Session／offline probes 不建立 task；valid RPC 與 quick UI E2E 使用本輪建立並保留的 smoke fixture，replay／conflict probe 未新增 row。這些 probes 只補強真實 ordinary-session 邊界，不能升格為完整 N01～N10 或獨立 QC PASS。

| Probe | 結果 | 證據邊界 |
|---|---|---|
| `sign-in → getUser → signOut({scope:'local'})` | PASS | 真實 TEST Auth 核身與 local sign-out；未持久化 Session。 |
| invalid-title quick RPC | PASS | 真實已核身 Bearer 可達 RPC；伺服器以 `QT_INVALID_TITLE` fail-closed，未寫入 task／receipt。 |
| valid quick RPC → workbench row readback | PASS | 既有測試帳號有 2 筆 active membership；直接 authenticated SDK RPC 回傳合法 receipt，工作台 owner row 唯一讀回 1 筆。此為 direct API 證據，未替代正常 UI N02；唯一 smoke task 保留作 synced fixture。 |
| `quick_workbench=1` workbench UI readback | PASS | task-owned 4173 runtime 明確使用 Supabase TEST env；以同一 Session 從正常 workbench entry 顯示既有 smoke fixture。此為 UI readback，仍未證明同一輪 quick UI 建立→工作台往返。 |
| quick UI 建立→receipt→workbench UI 同帳號 E2E | PASS（N02 partial） | task-owned 4173 Supabase TEST runtime；正常 quick UI 建立後顯示已建立，按「前往工作台」後同一筆 title 在主程式 workbench UI 可見。第二帳號切換與跨帳隔離仍未驗。 |
| receipt replay + title conflict | PASS（N08 partial） | 沿用既有 quick UI E2E smoke fixture；同一 `captureId`／同一 title 重送回 `created=false`，同一 `captureId` 改 title 回 `QT_IDEMPOTENCY_CONFLICT`，且沒有新增工作台 row。這是 direct TEST RPC 證據，尚未覆蓋 B／anon、錯 owner／receipt 與並行 timeout 的完整 N08 矩陣。 |
| 主程式／quick UI Session | PASS | 同一 ordinary Session 注入兩個隔離本機 origin；兩頁均顯示已登入。 |
| quick local sign-out isolation | PASS | quick local sign-out 後主程式頁面 reload 仍 authenticated；未建立 task。 |
| authenticated offline owner binding | PASS | quick 離線建立後隔離 IDB record 綁定 TEST user owner、state=`pending`，business request 數為 0。 |

尚未補齊：第二帳號／非空 A/B fixture、真實登入取消與切帳、錯 owner／receipt／anon 負向矩陣、並行 timeout replay、TEST correction migration 及完整 N01～N10。上述 probes 不解除 B0 prerequisite，也不授權繞過 migration review。

本輪唯讀查證：
- TEST 已套用 DEV-122 alias `20260930154758` 及 v2 `20260930155041`，RPC definer，MD5 `139a666b466ba55b9ee00aad52ce7b10`；正式僅 DEV-122 `20260914120000`，RPC invoker，MD5 `ffc0eb5fdd4d284a113817d46eb53cfa`。本輪新增 correction migration 尚未套用：因 B1 必須等待 B0 完整通過，遠端 apply 被安全審查拒絕並停止，沒有 workaround。
- 兩邊 RPC execute ACL 都只有 postgres／authenticated／service_role，empty search_path；task／receipt owner RLS 存在。TEST 另有 OAuth restrictive policies、allowlist及 insert guard；本期保留，不宣稱其已全面隔離 ProJED API。
- auth.users 無非內建 trigger；profile／tenant membership／tenant RLS 沿用既有責任。新功能 N01～N10、TEST correction與真 JWT 權限矩陣均未執行；沒有部署或修改資料。

<a id="dev-133-legacy-oauth-evidence"></a>

## 歷史證據：2026-09-30（舊 OAuth 方案）

以下原 A／B 紀錄保留當時證據及未完成事項，**不作現行架構、Gate 或授權範圍**。較早快照中「B1 未執行」其後由 [執行補充](DEV-133-execution-boundary-addendum-20260930.md) 的 TEST v2 已套用紀錄更新；synthetic PASS 僅限實際案例，沒有真 token／非空 fixture 時不得推論整體權限 PASS。新版改由 N01～N10 驗收，Android 實機已取消。

> **2026-09-30 執行邊界更新：** 使用者已取消 Android 實機驗收並要求改以正式環境驗證；原先含全域 PostgREST hook 的 migration 被審查拒絕後，已改成 quick-task 資料表／RPC 窄化 boundary 並成功套用 TEST。B1 hosted synthetic matrix 已驗證 allowlisted client、unlisted client、first-party RPC 與 OAuth direct table read；真實 OAuth token、正式設定、部署與正式功能驗收仍未完成。OAuth RPC 由 `VITE_QUICK_TASK_OAUTH_RPC_ENABLED` 保持關閉；詳見 [execution-boundary addendum](DEV-133-execution-boundary-addendum-20260930.md)。

狀態：**執行中；Slice A 本機瀏覽器部分 PASS；Slice B0 source／mock PASS 且 TEST 桌面真實 OAuth 部分 PASS；Android 雙 PWA 與 live denial 未驗；B1 尚未執行。** 使用者授權只在 `ProJED_TEST / fhisnnufoeulxqrchldf` 設定 OAuth Server／Site URL／Authorization Path／public client／redirect allowlist 並執行必要測試；B1 additive migration 與矩陣僅在 B0 完整通過後於同一 TEST 專案執行；正式環境排除。桌面首次 consent、callback、same-user 與 refresh 輪替通過；重複 consent 行為無法確證，live denial 因既有 grant 未到達 consent 頁而未驗。測後 TEST Auth config 已還原原值、臨時 OAuth client 已移除，均以 readback 確認。ADB／Android 裝置不可用，故本結果是部分 B0 證據，不是雙 PWA Gate PASS。對應 [DEV-133](../dev_task.md#dev-133-快速建任務同帳號與自動同步---2026-09-30)、[SPEC-133](../specs/SPEC-133-quick-task-shared-identity-sync.md)、[ADR-053](../decisions/ADR-053-quick-task-cross-origin-account-link.md)。**本機與桌面 PASS 不等於 A 整體 PASS、B PASS 或 DEV-133 完成。** 執行基準 HEAD `127bc0dfecd65507879405210b18e9e178975f76`；工作樹有其他既存修改，未覆蓋或清除。

### 2026-09-30 本機執行紀錄

| 檢查 | 結果與證據 |
|---|---|
| TypeScript | `npx tsc --noEmit`：PASS，exit 0。 |
| Targeted ESLint | `auth.ts`、`oauthClient.ts`、`sync.ts`、`main.ts`、`oauthConsent.ts`、Supabase quick client/service、DEV-133 browser verifiers／runners：PASS，0 errors。 |
| Test bundle | `npx vite build --configLoader runner --mode test --outDir output/dev-133-oauth-b0-20260930`：PASS；輸出含 consent entry、quick OAuth client 和 consent bundles。大 chunk 與 Browserslist 資料過期為 warning，未阻止 build。 |
| B0 OAuth client／consent 模擬 | `scripts/run-dev-133-oauth-mock-check.cjs`：10/10 `SIMULATION PASS`，涵蓋 PKCE/state、callback 清理、單次與並行 refresh（並行時只發一次 request）、登入保留 authorization request、consent user/client/callback 驗證、拒絕未登記 callback，以及從 quick App 建立 transaction、進入 consent 後拒絕，再以原 state 回到 quick callback；拒絕不交換 token、不建立 OAuth session，頁面顯示拒絕提示。另驗證舊 quick origin 保留 Supabase session／標準 Google 登入導向。Supabase endpoint 由 browser route 攔截；data RPC 呼叫 0。這是程式路徑模擬，不是真實 OAuth Server 驗收。結果：`output/playwright/dev-133-quick-task-oauth-mock/result.json`。 |
| DEV-122 shared static checks | 目前 build 上 25/25 assertions PASS；S13 驗證 quick path 使用 Auth `getUser(accessToken)`，PWA manifest 身分檢查通過。結果：`output/playwright/dev-122-mobile-zero-data-quick-task/static-result.json`。 |
| DEV-122 core RPC／owner／receipt SQL supplementary rerun | 原隔離 PostgreSQL loopback runner 因 Windows restricted-token／`initdb` 啟動錯誤未能建立資料庫；runner 已刪除自身暫存 cluster 並確認 port 56489 釋放。其後以 PGlite in-memory PostgreSQL WASM 執行同一 bootstrap、DEV-122 migration 與 core matrix：22/22 PASS，涵蓋 privilege/RLS/security-invoker、owner 隔離、receipt replay/hash conflict、append order、索引與交易 rollback。結果：`output/qa/dev-133/dev122-core-matrix-rerun-20260930/pglite-dev122-core-matrix.json`；失敗與清理紀錄：同資料夾 `initdb-failure.txt`、`db-isolated-result.json`。此結果是隔離 SQL 核心補充證據，不是 Supabase hosted runtime、DEV-133 B1 client_id policy 或真實 Auth/RPC 驗收。 |
| DEV-133 browser A smoke | Chrome headless、mobile emulation：19 cases，12 本機 PASS、7 `SIMULATION PASS`（5 Auth/RPC 模擬＋SpeechRecognition 與 IDB readback failure 注入各 1）；含離線／線上未登入保存、語音插入選取文字、IME 組字時阻擋提交、IndexedDB 寫入中止保護、讀回失敗時不宣稱成功且提示先查待處理清單、七日清理邊界、清理／狀態轉換競態、清理交易中止、Retry-After／退避 lease 邏輯、`online` event 同 capture 重試、300ms future backoff fixture 到期後同 capture 重試、稍後處理、320／390px UI。讀回故障注入時確認同一筆本機記錄可能已存在（matchingRecords=1），頁面保留輸入並明確提示確認後再重試；計時器案例確認記錄由 `failed_retryable` 轉為 `synced`、attemptCount 由 1 到 2。Supabase 呼叫在頁面 fetch 層攔截，browser errors、HTTP failures、實際 business API requests 皆為 0。結果：`output/playwright/dev-133-quick-task-local-browser/result.json`；畫面：`quick-task-390x844.png`、`quick-task-320x844.png`。 |
| Temporary runtime cleanup | Earlier A／mock runners closed their own Chrome contexts and Vite processes (ports 4173／4174 released). This TEST desktop run closed its Playwright contexts and Vite processes; ports 4001／4002 are also confirmed released. |
| B0 TEST 設定 baseline／cleanup readback | GET `/v1/projects/fhisnnufoeulxqrchldf/config/auth` 初始 readback：HTTP 200，`oauth_server_enabled=false`，Site URL 指向隔離 Level 3 smoke 網址，allowlist 不含 canonical quick callback；Google provider enabled。依授權暫時啟用 OAuth Server、Site URL `http://localhost:4002`、Authorization Path `/oauth-consent.html`，並加上 localhost 4001/4002 URI 後執行桌面測試。結束後重新 GET 確認回到初始 Site URL、`oauth_server_enabled=false`、Authorization Path null、URI allowlist 與初始值相同；本輪 public client GET `/auth/v1/admin/oauth/clients/8b483b0a-fbc6-4162-ad16-ae131a537395` 回 404。Production 未觸及。 |
| B0 真實桌面 OAuth（TEST） | 真實瀏覽器首次授權顯示 TEST consent，核准後回到 `http://localhost:4001/quick-task/`；quick OAuth session 的 Auth user 與主程式登入的 TEST user ID 相同。refresh 成功輪替 access／refresh token，user identity 維持一致。再次授權回到同一 callback／user；由於已有 persisted grant，不能據此判定 consent UI 是否略過。live denial 未通過：既有 grant 讓操作未到達拒絕 consent 畫面；拒絕流程只有隔離 mock 10/10 `SIMULATION PASS`。本項只證明桌面 TEST OAuth 身份流程部分通過，不證明 Android PWA、RPC／receipt、權限矩陣或 B0 完整 Gate。去識別化摘要：[desktop-oauth-b0-20260930.json](../../output/qa/dev-133/desktop-oauth-b0-20260930.json)。 |

### B0：平台與真機路徑 Gate（不阻擋 A）

B0 TEST 設定與桌面身份流程已依授權完成。初始 config readback 顯示 `ProJED_TEST / ACTIVE_HEALTHY`、OAuth Server disabled、Site URL 為隔離 Level 3 smoke URL、redirect allowlist 缺 canonical quick callback；Google provider enabled。測試期間以 localhost OAuth/consent/callback 暫時設定及一個 public client 執行真實桌面授權。首次 consent 核准後 quick callback 回到原 quick 測試頁；Auth 驗證確認主程式與 quick session 是同一 TEST user，refresh 輪替後仍為同一 user。重複授權成功回同一 user callback，但 consent UI 是否自動略過無法確證。live denial 因既有 authorization grant 而未抵達拒絕畫面，視為未驗；mock denial 仍是 simulation。測試後以遠端 readback 確認 OAuth Server disabled、原 Site URL／URI allowlist 恢復、Authorization Path null；本輪 client 查詢回 404，port 4001／4002 已釋放。ADB／Android 裝置不可用，雙 PWA 真機登入／未登入往返、cancel、主程式 signOut／切帳與 owner 保護仍待測。B0 完整身份 Gate 未 PASS；B1 migration／矩陣因條件 Gate 未通過而未執行。桌面結果不替代 Android 證據，也沒有觸及正式環境。

### B1：OAuth client 權限矩陣

在 B1 的 TEST migration 後，以真實簽章 OAuth token 和正常主程式 session 測試。正向案例：allowlisted quick `client_id` + user A 可呼叫唯一 quick-create RPC，receipt owner 為 A，工作台讀回唯一一筆。負向案例：其他 OAuth client、匿名、錯誤／切換 owner、直接查詢或寫入公開資料 API、呼叫非 quick RPC 均 fail closed；不得從 response 洩漏 tenant/task/receipt 內容。一般主程式 session（無 OAuth `client_id`）既有權限與工作台流程不退化。若以 synthetic JWT 測 policy，僅算 SQL/政策單元證據；需再用實際 TEST OAuth token 從正常 quick UI 重演。SECURITY DEFINER RPC 必須檢查固定 `client_id` allowlist、`auth.uid()`、參數與冪等 receipt；code review、function ACL、`search_path=''`、RLS／direct API negative tests 全部通過才可 PASS。

### A／B1 fixtures 與案例

使用至少兩個受控 TEST 帳號 A/B，兩者有可讀「全域任務工作台」；每筆用唯一 `captureId`，清理測試資料須依測試環境規則。IDB fixture 包含：unbound、A-bound pending、A-bound retryable/permanent/failed_auth、A-bound synced `updatedAt` 為 6 日／8 日前、B-bound pending 40 日前。RPC timeout fixture 回傳已 commit 的同一 receipt，用於 replay。故障注入包括網路斷線、Auth 401、service timeout、錯誤 owner／captureId receipt、refresh token 輪替、兩個視窗並行 flush，以及 IDB transaction 失敗。

| 編號 | 操作與期待證據 | 本次狀態 |
|---|---|---|
| A01 | Auth JS／網路尚未就緒時首屏名稱欄可操作；打字、語音、IME 提交不被狀態檢查中斷；無業務 list request。 | PARTIAL：首屏登入狀態與輸入、IME 組字期間不提交及無 business request PASS；選取範圍插入語音辨識結果為 `SIMULATION PASS`。真實裝置語音／IME 尚未驗。 |
| A02 | 線上未登入／離線按建立都先 IDB transaction + same-key readback；成功只標待同步；IDB 寫入或讀回失敗不能顯示已記下。 | PARTIAL：Chrome 離線與線上未登入建立、IDB raw readback、`accountId=null`、`awaiting_auth` 與待同步 UI PASS；add transaction abort 確認不顯示成功、保留輸入且沒有記錄。IDB readback failure 注入為 `SIMULATION PASS`：讀回結果被遮蔽時，實際 record 仍可能已提交；頁面不顯示成功、保留輸入並提示先清空欄位查看待處理清單，以免直接重送造成重複。 |
| A03 | unbound 項目在 A 出現後仍不得自動 claim；使用者明確選 A 並核身後才綁；取消、nonce 過期、錯 account 保留原記錄。 | PARTIAL：本機 Auth 模擬登入後，原離線／線上 unbound 記錄仍為 `accountId=null` 且未送出；真實 Auth、明確 claim、取消與 nonce 案例未跑。 |
| A04 | A 已綁項目在**quick origin** 切 B、token 過期或缺網時不送到 B；`getSession()` 有 A 但 Auth `getUser(accessToken)` 失敗或回 B 時不自動送／不顯示已驗證 A，恢復 A 後同 ID 可送。Slice A UI 僅宣稱 quick origin 已核實的身分，不宣稱與主程式已共用 session。 | PARTIAL：本機 mock Auth/RPC 中 user A + 同 owner receipt 使測試項標為已同步；`getUser` 回傳 user B 時狀態待確認、任務留 unbound 且 RPC 次數為 0。這只驗證 client flow，沒有真實 access token／Auth 服務證據。 |
| A05 | `online`、重開、回前景及到期 backoff 觸發重試；服務仍不可達或身分無效時保留待送；App 關閉不聲稱背景完成；8 次耗盡留在人工重試。 | PARTIAL：browser IDB 案例驗證 `finishQuickCaptureLease` 合併延遲：1 秒 Retry-After 不縮短首輪 5 秒退避、90 秒值保留、第 8 次失敗保持 `failed_permanent` 且沒有下一次時間；模擬 Auth/RPC 瀏覽器案例確認 `online` event 以同 capture ID 重試，並以 `nextAttemptAt` 在約 300ms 後到期的 fixture 確認同 capture timer 重試，記錄由 `failed_retryable` 轉 `synced`、attemptCount 由 1 到 2。到期 timer 的離線／背景暫停、重開後重試與真實 Auth/RPC 尚未驗。 |
| A06 | timeout 後 receipt 已存在再送同 ID，工作台只有一筆；receipt owner／captureId 錯誤時不得標已同步；server title conflict 留錯誤而不複製。 | PARTIAL：本機 mock 的正確 owner/captureId receipt 通過 parser 並轉為 synced；重播冪等、錯 receipt 與 server workbench 唯一讀回未跑。 |
| A07 | `synced` 8 日前本機副本被清，6 日前仍在；unbound、待送、失敗 40 日前仍在；直接 raw-store 掃描可找到已被 list 隱藏的逾期 synced；清理與同步並行不誤刪；清理交易中止會回報失敗；關閉期間未準點清理，重開後補清。server receipt 不受本機清理影響。 | PARTIAL：隔離 IDB 真瀏覽器證明 8 日 synced 被刪、6 日 synced 與 40 日 pending/unbound 保留，reload 後補清。`A07-concurrent-cleanup-preserves-fresh-sync` 以實際清理函式與獨立 IDB 交易競態確認 fresh synced 保留；`A07-cleanup-transaction-abort-reports-failure` 以故障注入確認交易中止會拒絕，Chrome 回報 `IDB_CLEANUP_FAILED`。仍未驗真多視窗 Auth/RPC flush、正式 receipt 與清理後服務端資料。 |
| A08 | `web.app/quick-task/` 與獨立 quick 各依本 origin 既有 session 運作；兩個 manifest 身分／scope 不變，已安裝 App 無強制重裝。 | PARTIAL：build + 25 項靜態檢查確認 manifest 身分；兩個正式 origin session 與已安裝 PWA 更新未跑。 |
| A09 | 320／390px 真畫面：本 origin 帳號、待同步、需登入／待確認、失敗可辨識，無橫向溢出或冗餘常駐容器；可見錯誤與提示逐一核對，無誤導「已與主程式同帳號」。 | PARTIAL：Chrome 320／390 viewport、signed-out label、overflow 與錯誤掃描 PASS；Auth／sync failure 文案和 Android 真機未驗。 |
| A10 | recovery 有待辦時提供「處理／稍後處理」；選稍後後輸入仍可用，之後可再次回復。 | PASS：browser smoke 中稍後處理會收合 recovery，輸入仍 enabled。 |
| B01 | 舊獨立 quick session 未經 OAuth 同帳號核對前不能授權新路徑 flush；A/B 切帳、回前景與每批送出守住 owner/token/client_id；只有 allowlisted client 可呼叫受控 RPC。 | NOT RUN：桌面 B0 identity 部分通過，但 Android 完整 Gate 未通過；B1 migration／權限矩陣尚未執行。 |
| B02 | OAuth callback state／verifier 缺失、重播、逾期、redirect 不符、取消與 refresh failure 均 fail closed；URL／console 無 token、code 或 title 洩露；OAuth token 的 direct Data API 與非 quick RPC 存取拒絕。 | PARTIAL：10 個 browser `SIMULATION PASS` 覆蓋 client PKCE/state、單次及並行 refresh（同時呼叫只發一次 request）、callback、同意與拒絕；拒絕流程以實際生成 state 從 quick initiation 往返，`access_denied` 後 token exchange=0、無 OAuth session 並顯示錯誤提示。真實桌面 OAuth 部分通過，但 live denial／重複 consent UI 行為未確證。OAuth gate 關閉時 data RPC=0；client-level RLS／Data API 權限仍須 B1 真 token 驗證。 |
| B03 | 真 Android 雙 PWA 上兩邊入口及各自身分狀態可達；再次使用免重輸 Google 帳密；主程式 signOut／換帳後 quick 依自身實際 session 顯示，不把舊 owner 待辦送至新帳號。 | NOT RUN：桌面 TEST OAuth 已部分驗證；ADB／Android 裝置不可用，真 Android 雙 PWA 往返仍未測。 |

### 驗證命令與證據層

本地驗證命令（本次 DEV-133 執行紀錄）：

本次已完成 Slice A 本機驗證及 Slice B0 OAuth client／consent source implementation；A local browser 19 cases、B0 OAuth mock 10/10 `SIMULATION PASS`（含拒絕授權往返與並行 refresh 單一 request），DEV-122 static 25 assertions、typecheck／lint／test build 通過。依使用者授權，在 ProJED_TEST 暫時配置本機 OAuth consent/callback 並完成桌面首次 consent、quick callback、same-user 核身及 token refresh rotation；測後設定已還原並 readback、public client 已刪除並 readback 404，正式環境未觸及。桌面 repeat callback 成功但 consent UI 行為無法確證；live denial 因 persisted grant 未抵達拒絕畫面。ADB／Android 不可用，真雙 PWA Gate 尚未驗，故 B0 整體不 PASS；B1 已條件授權，須等 B0 完整通過後才執行 migration／權限矩陣。DEV-122／131 的舊 PASS 不延伸為 DEV-133 PASS。
