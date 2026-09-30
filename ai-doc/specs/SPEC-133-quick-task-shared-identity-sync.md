# SPEC-133：ProJED-快速建任務同帳號與自動同步

## 2026-09-30 B1 執行更新

使用者取消 Android 實機驗收並核准在已知風險下繼續。TEST 已套用 DEV-122 quick RPC 與 DEV-133 窄化 boundary：OAuth client allowlist、quick RPC trigger、quick task／receipt direct API restrictive policies；未設定全域 PostgREST hook。Hosted synthetic matrix 已通過 allowlisted client RPC 交易回滾、unlisted client 拒絕、一般 first-party RPC 與 OAuth direct table read=0。尚無有效 OAuth client/token，因此正式 OAuth 設定、正式部署與真實 token 驗收仍未完成。

狀態（2026-09-30）：**Slice A（本機可靠性）`已實作／本機瀏覽器部分 PASS；真實 Auth／RPC 未驗`；Slice B（跨來源同帳號）`架構已定案；B0 source/mock 10/10 SIMULATION PASS；TEST 桌面首次 consent／callback／same-user／refresh 部分 PASS；Android 驗收依使用者最新決定取消`。** 使用者已授權 ProJED_TEST ref `fhisnnufoeulxqrchldf` 與正式 Firebase／Supabase 範圍，但自動審查仍把實體 Android B0 視為 B1 前置，故本輪未能執行遠端 B1 migration 或正式部署。桌面重複授權成功回同一 user callback，但 consent UI 是否略過未確證；live denial 因既有 grant 未實測成功。OAuth RPC 在程式端增加明確環境開關，未經 migration／權限矩陣不得啟用。B0 是已定案架構的執行 Gate，不是待選架構。[QA-DEV-133](../qa/QA-DEV-133-quick-task-shared-identity-sync.md) 保存證據；基準 HEAD `127bc0dfecd65507879405210b18e9e178975f76`，工作樹另有未提交修改。

權威：[DEV-133](../dev_task.md#dev-133-快速建任務同帳號與自動同步---2026-09-30)、[ADR-053](../decisions/ADR-053-quick-task-cross-origin-account-link.md)、[QA-DEV-133](../qa/QA-DEV-133-quick-task-shared-identity-sync.md)。Slice A 已在工作樹實作，補齊 [SPEC-122](SPEC-122-mobile-zero-data-quick-task.md) 的回網重試與本機清理；Slice B 依 ADR-053 採 Supabase OAuth 2.1 public client + PKCE，銜接同一身分但保留兩 origin 各自 session。共同不變條件：本機先存、未綁定資料明確 claim、account-bound outbox、固定 JWT RPC、server receipt、零業務資料首屏與雙 PWA 身分。使用者選擇 `1A、2A、3B` 並要求本機資料定期清理；七日且只清理已同步副本是現行工程基線，不歸因為額外人類選項。

## 0. 事實、假設與交付切片

| 分類 | 現況與可執行邊界 |
|---|---|
| 已知事實 | 目前工作樹的 `auth.ts` 會以 Auth `getUser(accessToken)` 核實帳號並重查 session／epoch；`main.ts` 在啟動、回網、回前景觸發驗證與同步；`outbox.ts` 以原始 store cursor 清理已同步副本。OAuth client／consent source path 已實作，browser mock 10/10 `SIMULATION PASS`，含 approve／deny（deny 帶回 `access_denied` 與 state、不交換 token）；真實 TEST 桌面 OAuth 首次 consent、callback、same-user 與 refresh rotation 部分通過；重複 consent UI 與 live denial 未確證。TEST OAuth config／public client 在桌面測試後已還原／刪除並 readback 確認；不能代表 Android／RPC／B1 驗收。兩正式 origin 的本機儲存與 session 隔離；既有 RPC 依 `auth.uid()` 決定 owner。 |
| Slice A：已實作 | 本機先存；網路恢復、重開或回前景只是重試提示，必須先經 Auth 核實同一 owner。七天是目前工程基線，只刪有有效遠端 receipt 的 `synced` 副本；未同步資料不設自動刪除期限。登入入口與狀態只代表該 origin 自己的 session。 |
| Slice B：架構已定案 | 採 Supabase OAuth 2.1 Authorization Code + PKCE public client；主程式 origin 承載授權／consent UI，獨立 quick origin 持有自己的 OAuth token/session，不複製跨 origin token。OAuth token 的 `client_id` 必須限制快速 App 權限；由單一窄化 RPC 建立任務，直接資料 API 對 OAuth client 拒絕存取。B0 驗證 beta 設定、AuthGate 與 Android PWA 回跳；B1 實作並驗證 client-level 資料權限。核心流程假設不成立才停止 B1 並回架構審查。 |
| 交付判定 | Slice A PASS 只代表本機可靠性完成；使用者要求的雙 App 同帳號需 Slice B 另行 PASS，DEV-133 才能整體完成。 |

## 1. 使用者流程與可見狀態

1. `web.app/quick-task/` 及獨立 `firebaseapp.com/quick-task/` 的任務名稱欄可立即打字或語音；Auth、網路與清理不阻塞首次輸入、IME 或本機提交。
2. 「建立」先完成 IndexedDB write transaction 與 same-key readback。只有成功才顯示「已記下，待同步」；IDB 失敗顯示未記下與重試，不能聲稱遠端成功。線上未登入與離線一樣可記，`accountId=null` 的記錄不因後來偵測到登入就自動改綁。
3. 快速頁與主程式各有登入入口，狀態顯示各自最近一次經 Auth 核實的帳號。B 上線後兩邊可銜接同一身分，但 session/token 仍各由自己的 origin 管理；不得宣稱即時同步登出。一般無待處理狀態不新增常駐說明或容器。未綁定記錄須由使用者明確選擇「同步到〈帳號〉」並核身後才 claim；取消保留本機資料。
4. B 上線後，獨立快速 App 首次銜接或 session 失效時，以主程式 origin 的 OAuth 授權／consent UI 取得自己的 public-client session。主程式已登入時目標為不需再次輸入 Google 帳密；首次授權可要求同意。主程式未登入時，登入完成須回到同一 `authorization_id` 請求。銜接中仍可本機建立；核實身份及 client 權限之前不啟動遠端批次。
5. 自動 RPC 只使用經 Auth 核實、與項目 owner 相符且 client ID 符合授權範圍的憑證。`online`、重開、回前景、授權成功與 backoff 到期只是重試提示；`navigator.onLine` 不是服務可達或登入有效證據。只有同 owner 的 strict committed receipt 才可顯示「已同步」；App 關閉時不承諾背景同步。
6. 7 天後只自動刪除已嚴格驗證遠端回執的本機 `synced` 副本。`awaiting_auth`、`pending`、`syncing`、`failed_auth`、`failed_retryable`、`failed_permanent` 均不定期自動刪除。關閉 App 時不保證準點清理，恢復開啟後執行。

## 2. 責任與資料流

| Authority / 模組 | 固定責任與影響 |
|---|---|
| `oauth-consent.html`、`src/quickTask/oauthConsent.ts`、`src/services/supabase/client.ts` | B0 consent entry 已在工作樹實作：承接並保留 `authorization_id`，驗證登入 user、client、scope、精確 callback，提供 approve／deny；TEST 桌面真實 OAuth 已完成首次 consent／callback／same-user／refresh 部分驗證。 |
| `src/features/quickTaskCapture/auth.ts`、`oauthClient.ts` | A 沿用本 origin session，以 Auth `getUser(accessToken)` 核實 accountId，固定 owner/token/epoch 快照。B0 quick origin OAuth public-client code exchange／refresh 已實作；token store 與原 Supabase JS session 隔離，不建立第二個業務資料 client。 |
| `src/quickTask/main.ts` 與 `quick-task/index.html`／`src/quickTask/quick-task.css` | 保持非阻塞表單、最小登入／連線／待同步狀態；OAuth callback 已接入。B1 gate 關閉時，不讓 OAuth token 進入 Data API／RPC flush。 |
| `model.ts`、`outbox.ts`、`sync.ts` | 保留 `captureId`、accountId、lease、8 次自動重試上限、15 分鐘 claim nonce 與 7 天 retention。同步前固定同一次驗證的 owner/token/epoch；任何 epoch 或 owner 變化都停止、釋放／標記失敗，不以另一帳號續送。清理以未過濾原始 store 在 readwrite transaction 中逐筆判定，不能先經 `listQuickCaptures()` 的期限過濾。 |
| `quickTaskCaptureService.ts` 與已存在 `create_quick_unplaced_task_v1` | 仍只送 `capture_id,title,workspace_hint`；明確 Bearer、`credentials:'omit'`、timeout，RPC 依 `auth.uid()` 決定 owner，在同一 transaction 寫 task + private immutable receipt。client 檢查 committed status、captureId、ownerId、titleHash 格式與 committedAt；server 以 title hash 判定同 ID replay／conflict。只有嚴格回執符合該次 owner 與 captureId 才宣稱遠端成功。 |

不改工作台 task schema、receipt 語意、owner／placement 規則、主／quick manifest identity 或 root service worker；不搬移跨 origin 資料、不新增通用 queue、遠端 list 或背景同步保證。Slice B **需要一份 additive DB migration**：註冊允許的 OAuth `client_id`；限制 OAuth client 對公開資料 API 的直接讀寫；將 quick create 收斂為窄化的 `create_quick_unplaced_task_v1` server boundary（固定 search_path、完整 schema qualification、`auth.uid()` 與 allowlisted `client_id` 檢查、既有輸入／owner／冪等驗證、僅建立一筆 unplaced task 與 receipt、撤銷 public／anon execute）。主程式的一般登入政策維持原行為。不得放寬 grants／RLS 以讓 OAuth token 遍歷 ProJED 使用者資料；若現有資料暴露面無法被 client_id 限縮，B 停止並回 ADR 審查。無資料回填或破壞性 migration。

## 3. Slice B 已定案契約：OAuth、最小權限與帳號切換

架構決策已鎖定；本節是 B0/B1 的實作契約。文件定案不代表 OAuth Server 已配置、雙 App 回跳可用或遠端操作已授權。使用者已取消 Android 實機驗收並要求改以正式環境驗證；遠端 B1 仍受自動審查的 B0 實體 Gate 限制，不能以文件假設補證據。

- 環境設定：Supabase OAuth Server 是 public beta。只在取得明確授權的 ProJED 隔離 TEST 資源設定／讀回；不改正式環境。主程式 origin 承載 authorization/consent UI；quick callback 精確固定為 `https://projed-cc78d.firebaseapp.com/quick-task/`，每環境註冊專屬 public client。依官方規格，自行實作 public-client code exchange／refresh；不得把 `supabase-js` 當完整 OAuth client。`email`／`openid` 僅按所需身分資訊決定。OAuth scopes 不限制資料庫權限；access token 含 `client_id`，資料存取必須由 RLS 與伺服器邊界約束。
- 最小權限：OAuth token 僅可呼叫受控 quick-create RPC，不可直接讀寫 ProJED 使用者資料 API。私有 allowlist 保存各環境允許的 quick OAuth `client_id`；RPC 驗證 `auth.uid()`、client_id 及 capture contract。RPC 以受控 `SECURITY DEFINER` 邊界執行必要的 workspace/task/receipt 查詢與寫入，固定空 `search_path`、全 schema qualification、撤銷 `PUBLIC/anon` execute、只授權 `authenticated`，不使用動態 SQL、不回傳 task/tenant 資料；所有 direct Data API access 對有 `client_id` 的 OAuth session fail closed。既有一般 session (`client_id` absent) 沿用既有政策。SECURITY DEFINER 必須逐行 review 及 negative-test，若無法證明限縮則停止，不退回廣權限 invoker token。
- 快速 App 產生高熵 `state` 與 PKCE S256 verifier/challenge，以本 origin 的短期儲存保留 verifier／原頁意圖；callback 校驗 state、期限、redirect origin、一次性與 token response，立即刪除 verifier。`code`、`state`、`authorization_id` 不寫入 analytics、console 或任務資料，也不把 access/refresh token 放 URL、跨 origin 訊息或 Service Worker cache。Web entry 只接受固定 allowlisted callback。
- 快速 App 的 OAuth token store 與原 quick Supabase JS session storage 必須隔離；refresh 輪替不得有並行重用。B1 上線新 OAuth 路徑前，不以舊 quick session 授權該路徑的自動 flush；每批先取得固定且已核實的 owner/token/client 快照。主程式 signOut 不承諾即時撤銷 quick origin session；quick status 只顯示自身 session，換帳號時阻止舊 owner 任務送到新帳號。若使用者要求兩 App 即時同步登出，屬額外 revocation 功能，需另立決策與 DEV。
- `web.app/quick-task/` 仍可讀同 origin session 與原有待送資料。**B1 啟用新 OAuth 路徑時**，獨立 quick 的舊 session 不可直接授權該新路徑的自動 flush；須先透過主程式 OAuth 銜接核對 `accountId` 相同。不同時保留各 account 的 IDB 記錄；A 記錄只能在 A 再登入時處理。舊 claim callback／15 分鐘 nonce 依原規則完成或過期，不遺失本機記錄。新流程不改現有已安裝 PWA origin、manifest identity 或強迫重裝。
- 在快速 App 仍前景期間主程式另一視窗更換帳號，兩個 origin 不存在可靠同步事件；UI 只能宣告「上次已驗證帳號」。下一次回前景、重新開啟或遠端批次開始必須重核；任何本地觀察到的 account 變更立刻 bump epoch。server 永遠依 Bearer owner 寫入，不能因 UI 舊文案把 A 記錄送成 B。若產品日後要求**即時**跨窗登出，須另立授權／撤銷機制，不在本期默默承諾。

## 4. Slice A 本機狀態、並行與恢復

- state machine 沿用 `awaiting_auth → pending → syncing → synced` 與 `failed_auth / failed_retryable / failed_permanent`。`online`、回前景與啟動只作**重試提示**：先非阻塞地取得本 origin session，經 Auth `getUser(accessToken)` 核實同一 accountId，再於 owner 相同且 backoff 到期時嘗試遠端送出；核實失敗維持待送／身分待確認。`navigator.onLine` 不能當服務可達或登入有效證據。`401`／refresh 失敗轉需登入；可重試錯誤遵守既有 backoff、`Retry-After` 與 8 次上限，耗盡轉人工重試，記錄不刪。沿用 30 秒 lease 防同 origin 並行 flush。暫時網路斷線不反覆自動跳登入。
- remote timeout 後 receipt 可能已寫入；重試同一 captureId 與同一 owner，server replay 回同一 receipt，不另建任務。不同 owner 或不同 title 的 replay 視為衝突，保留本機與可見錯誤，不複製成新 capture。
- `synced` 的 `updatedAt` 為 receipt 驗證後轉入 synced 的時間；只在 `now - updatedAt >= 7d` 且目前仍為 synced 時可刪。清理須直接掃未過濾的原始 store，於 readwrite transaction 中逐筆重查 state 與 updatedAt 後刪除；不能先用已隱藏逾期 synced 的 `listQuickCaptures()`。啟動、回前景與開啟期間每日一次觸發，錯誤下次再試。清理只刪本機副本，不碰 server receipt。
- 本機儲存遭瀏覽器清除或 eviction 時無法保證追回尚未同步資料；UI 僅在 same-key readback 後宣稱「本機已記下」。不提供虛假的跨裝置本機資料同步。

## 5. 執行順序與 Gate

**A：可獨立排 RD。** 只修改本地 retry 觸發、原始 IDB 清理與本 origin 可確認的精簡狀態，沿用現有登入／claim／RPC。A 的驗收必須覆蓋回網、回前景、錯 owner、清理邊界與 UI；A 完成只標 A PASS，不代表雙 App 同帳號已交付。

**B0：平台／使用者流程可行性（B1 資料權限 migration Gate，非架構決策）。** 架構已由 ADR-053 定案；B0 只核實已選方案能否落在目標環境。本輪在 localhost consent／quick callback 暫時設定下，真實桌面首次 consent、PKCE callback、同一 TEST user 核身與 token refresh rotation 通過；重複授權僅能確認回到同一 callback／user，是否略過 consent 不確定；live denial 因已有 persisted grant 未成功到達拒絕畫面。使用者最新決定取消 Android 實機驗收並改要求正式驗證；自動審查仍拒絕在缺少實體 Gate 的狀態下執行 B1，故 B1 與正式環境均暫停，不以桌面結果冒充完整 B0。

**B1：B0 Gate PASS 且取得 migration 範圍授權後執行。** 只新增專用 OAuth client 的最小權限 migration／受控 RPC，實作並驗證 client allowlist、資料 API fail-closed、refresh／帳號切換的 owner 邊界，再按 QA-DEV-133 驗證真 token 權限矩陣與一般主程式回歸。Consent entry、quick OAuth adapter 與 identity round-trip 屬 B0 前置程式，不得留待 migration 後才做。不得以 B0 結果擅自擴大既定資料權限。正式 OAuth 啟用、正式發布、migration 與正式資料操作分別遵循明確環境／資源授權及 release gate。B0 若失敗，不阻擋 A 的既定範圍；只有核心假設不成立時才重新審查 B 的 ADR，不得默默擴大 A。

RD 可決定局部函式／CSS 寫法；不可改 origin／manifest、account-bound claim、client allowlist、受控 RPC 的唯一入口、七日清理條件、錯帳 fail-closed 或零業務資料首屏。實作允許新增 ADR-053 明定的最小權限 migration／RPC；若需要擴大權限、新增 schema ownership、改變 callback／identity 架構或公開契約，須回規劃審查。

## 6. 驗收與架構審查記錄

完整案例與證據層在 [QA-DEV-133](../qa/QA-DEV-133-quick-task-shared-identity-sync.md)。A 成功須有本機 readback、同 owner receipt、工作台唯一讀回、錯帳隔離與七日清理讀回；本輪 B0 只保留桌面 TEST identity 證據，Android 實機驗收已由使用者取消。OAuth RPC 仍須等 B1 migration／權限矩陣後以環境開關啟用；HTTP 302、`getSession()` local user 或桌面模擬不能代替資料權限證據。可觀測狀態只記 captureId、狀態碼、owner 是否匹配與 retry 次數，不記 title、token、authorization code 或 email 到 console／報表。

Architecture Closure Review（2026-09-30）：已對照 `src/quickTask/main.ts`、quick auth/outbox/sync/OAuth client、Supabase services、consent entry、兩份 manifest、DEV-122 migration 與既有 QA。架構固定為雙 origin session 隔離、OAuth public client + PKCE、本機先存、owner 由 `auth.uid()` 決定、OAuth `client_id` 限權、唯一受控 RPC、七天只清已同步副本。Slice A 資料流已在工作樹實作；Slice B 責任、資料流、最小權限、恢復、驗收與停止條件已定案。B0 mock 10/10 PASS；本輪 ProJED_TEST 桌面真實 OAuth 首次 consent／callback／same-user／refresh 部分 PASS。測試後 TEST Auth config 已恢復 baseline、測試 public client 已刪除；重複 consent UI 與 live denial 未確證，Android 雙 PWA Gate 未驗，B1 migration／矩陣未執行。因此 B0 尚非完整 PASS，架構定案與桌面 identity 證據不代表交付完成。

Implementation update（2026-09-30）：Slice A 已在本地工作樹實作。`auth.ts` 對 access token 呼叫 Auth `getUser` 並重查 session／epoch；`main.ts` 在啟動／online／pageshow／visibilitychange 驗證與重試，並依 `failed_retryable.nextAttemptAt` 安排到期重試；`outbox.ts` 以 readwrite transaction 只清已同步滿七日副本。Chrome local browser 19 cases：12 本機 PASS、7 `SIMULATION PASS`；TypeScript、targeted ESLint、test build PASS。B0 OAuth／consent mock 10/10 `SIMULATION PASS`。另依授權完成 TEST 桌面真實首次 consent／PKCE callback／same-user verification／refresh rotation；repeat authorization 回到同一 user，但 consent UI 行為未確證；live denial 未成功驗證（已有 grant，沒有到拒絕畫面）。測後 TEST config／allowlist 已回復初始 readback，臨時 client 已刪除並確認，localhost ports 4001／4002 已釋放。Android 真機、真實 Auth/RPC owner／receipt、多視窗同步、B1 權限矩陣仍未驗；ADB／Android 裝置不可用是 B0／B1 當前 gate。

架構依據（2026-09-30 查閱）：[Supabase OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server/)、[OAuth authorization flow](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)、[OAuth token security／client_id RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)、[同源政策](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)。
