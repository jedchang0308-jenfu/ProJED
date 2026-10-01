# SPEC-133：快速建任務共用帳號、各自登入與自動同步

**最新執行狀態（2026-10-02 Rev12 直接 corrective release 發布前 READY；非契約修訂，SPEC contract revision 仍為 Rev10；PROD 仍為 Rev11）。** 最終 360-file candidate digest `ce3bb938cbe5fdae1b4d27de3679a4d0056f40f07839573cd5b024030ae12b3d` 已通過 UI／真 IDB simulation 25/25 與普通 TEST N06 11/11。修改只在 `src/quickTask/main.ts`，Auth、RPC、DB、SW、schema及 voice範圍未變；舊 `673aeee` baseline 的 R24 false warning 24/25 FAIL也已保留作為可重現對照。Source SHA與release ID尚未讀回；正式發布後的 production UI／功能驗收、PR #5 review／merge及 4195 cleanup仍待。細節、receipt及層級限制見[QA Rev12](../qa/QA-DEV-133-quick-task-shared-identity-sync.md)。

**Rev11 正式執行證據快照（2026-10-02；非契約修訂）。** Product source `673aeee9c10f01936a8aa4a0f2ca16ab7606a5ea` 已推入 PR #5，direct release `20261001160355-057ccc`；雙正式 origin 54/54，provider live version readback 為 `c01b9588565a9025`。正式普通 Google／Session、真 owner RPC／receipt、工作台及 page-scoped offline 續送的指定矩陣 46/46 PASS，並有獨立人工 speech evidence。Rev11 390px 畫面曾見原帳號登出提示；前一 Rev12 TEST 迭代對該提示取得指定結果，但最新安全修正仍待重驗；證據與正式 UI audit 邊界見上方及[QA Rev12](../qa/QA-DEV-133-quick-task-shared-identity-sync.md)。

下列 Rev10 發布狀態為 2026-10-01 快照，由上述 Rev11 執行狀態取代；既有 Rev10／TEST source-boundary 證據仍保留其原範圍。

修訂：**2026-10-01 Rev10；Human Confirmed；RD Implementation Ready；架構定案：已定案。** **2026-10-01 Rev10已正式啟用；改動功能的正式驗收續跑，Google獨立登入核身待完成。** Product source `8a0e738fcb68896a937f650666e53f2289729953`、同一protected release `20261001130712-4982b5` 已正式activate，live version `ae38a453a07ec4f3`；雙正式origin各54/54檔案hash、官方啟動與ordinary Google safe-cancel、三項strict readiness PASS。前一Rev9 `b88f428e0efa541e`保留為DB v2相容復原錨點。正式主程式既有Session透過普通SDK refresh後getUser200、指定actor與owner吻合；quick獨立Google登入因provider密碼／MFA尚待人類核身，不能把7/7前置檢查或舊40/40當作新版正式同步驗收。未執行正式migration／修改業務資料／擴張IAM或Secret。PR #5 head `144ea331448cd449dafca1bc7e284c67bf4e2f6d`已推送，合併前只讀審查進行中。 部署前82/82 SIMULATION、built離線／restart10/10、真TEST A12/12、同提交HTTPS TEST17/17的分層證據仍有效；舊版正式40/40保留原source邊界。最新收據見QA與REL-014。

權威：[DEV-133](../dev_task.md#dev-133-快速建任務同帳號與自動同步---2026-09-30)、[ADR-053 Rev 3](../decisions/ADR-053-quick-task-cross-origin-account-link.md)、[QA-DEV-133](../qa/QA-DEV-133-quick-task-shared-identity-sync.md)。沿用原 DEV ID／文件路徑；[SPEC-122](SPEC-122-mobile-zero-data-quick-task.md) 的輸入、本機保存、RPC、工作台、manifest／SW 契約繼續適用，登入與認領交界以本版為準。

## 1. 目標、決策及執行邊界

目標是立即記下任務，可靠地同步到本人 ProJED「全域任務工作台」。使用者 2026-10-01 採用「共用帳號、各自登入、各自保存 Session、離線任務依帳號同步」，覆蓋早先 `3B` 的跨 App 自動登入；`1A／2A` 的本機先存、未綁定資料明確認領及清理保護保留。取消 ProJED OAuth Server／public client／consent 作必要依賴，保留普通 Google OAuth 登入。

本輪文件以已完成的本機第一輪實作為基準，補齊責任面、驗證順序與交接條件；Git／TEST／正式操作仍須依原授權及各自 gate 執行，不因文件定案直接宣稱通過。保留其他 dirty changes。使用者已取消實體 Android 驗收，瀏覽器手機模擬不得冒稱 Android PWA 實機 PASS。

範圍外：跨 origin token／IDB 複製、自製認證服務、強制帳號對齊、App 關閉後背景同步保證、修改已安裝 PWA identity、放寬 RLS／IAM／Secret 權限、管理金鑰進前端、業務資料改寫、清除未同步任務。快速 App 為第一方入口，普通 Session 沿用本人既有權限；不再承諾憑證本身只能新增任務，程式仍只呼叫 quick RPC，不載入業務清單。

## 2. Architecture Closure Review：實際基準與缺口定位

基準 repo `C:/VIBE CODING/ProJED/ProJED`，branch `持續優化3`；source implementation baseline `e868611`（`feat(quick-task): adopt independent Supabase auth sessions`），documentation evidence commits from `a1d12a9` onward，2026-10-01 working tree。相關安裝／DEV-132 修改已存在且須保留；其餘 dirty changes 不屬本 DEV，不能納入本版證據。

| 查證面 | 已觀察事實 | 本版固定處置 |
|---|---|---|
| Auth／SDK | 舊基準同時走 SDK 及自製 OAuth，且 quick callback detection 曾被條件關閉；主程式登出未固定 scope。現行 HEAD 已移除自製 OAuth／consent 路徑。 | 單一 SDK Session 路徑，開啟 SDK callback detection；一般登出明示 local。保留主程式 Firebase／local-test 分支。 |
| 本機／並行 | 舊 captures schema v1 沒有持久化已核實帳號或 receipt；epoch 只在記憶體。現行 HEAD 已升 DB v2。 | `auth_context` 與 capture 寫入共用交易，owner／context revision 使用 CAS，保存有效 receipt。詳見 §4。 |
| 認領／晚到回應 | 舊 `finishClaimFromUrl` 核身後即 bind，回應路徑未完整隔離新帳號 UI。現行 HEAD 已改為明確認領。 | 認領前明確確認目的帳號；晚到回應只完成原記錄，不能更新新帳號 UI。 |
| TEST `fhisnnufoeulxqrchldf` | DEV-122 alias `20260930154758`、retired v2 `20260930155041` 保留歷史；forward-only correction source `20261001090000_dev_133_quick_rpc_security_invoker.sql` 對應 remote version `20261001045945`，RPC 已讀回為 invoker、空 search_path。 | correction body 收斂 canonical DEV-122；task／receipt ACL、receipt RLS 與既有資料未改；舊 migration、政策及未使用 allowlist保留。 |
| 正式 `knodlkxqpcqyrtgwpdst` | DEV-122 `20260914120000` 已套用，v2 未套用；RPC 為 invoker，空 search_path；相同 execute ACL，task／receipt 有 owner RLS。PROD preflight 另讀回 prosrc MD5 `3ef7e8731dd6893594e0d66918ddfe16`。 | 正式不用啟用 OAuth Server／註冊 client。當次 preflight 顯示 function body 已是 canonical DEV-122；correction 為條件 no-op，正式 package 記錄此選擇與 hash，不單獨補套已退役 v2。 |
| RPC 文字正規化 | TEST body 額外 trim `chr(8203)`；正式與 local DEV-122 不移除 U+200B。 | canonical body 以 local DEV-122 為準，前後端外圍空白規則一致；不改既有 task／receipt hash。 |
| 首次使用依賴 | 兩環境的 auth.users 都沒有非內建 trigger；profiles／tenant_members／tenants 既有 RLS。主程式登入負責既有 profile 設定。 | quick 不另建 profile／membership／workspace；缺可用工作台時保留任務並導往主程式完成設定，再人工重試。 |
| 測試／build | 舊基準含 consent entry、三個 QUICK_TASK_OAUTH keys 及舊 mock runners；現行 HEAD 已移除產品舊路徑並新增 independent-auth contract check。 | typecheck／targeted lint／test build／contract check 已通過；最新 TEST 固定候選 29/29、B0/correction/readback 及 post-correction 7/7 已 PASS。N01～N10 僅能依 QA 逐項證據判定，不能以 assertion 總數替代。 |

本表較早的 RPC definition MD5：TEST `139a666b466ba55b9ee00aad52ce7b10`、正式 `ffc0eb5fdd4d284a113817d46eb53cfa`，是 TEST correction 前 snapshot，不能代替目前 body hash 或行為驗證。最新 TEST correction body MD5、ACL／RLS readback 與真實登入證據見 [QA 最新 TEST 跨帳與 correction 證據](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#2026-10-01-最新-test-跨帳與-correction-證據)。該 TEST callback 可完成普通 Google 登入；production origin 的 ordinary Google callback／release 驗收已於 REL-014 通過，最終範圍及後續 UI 結果見 QA 正式驗收節。

## 3. 最小資料流與登入契約

```mermaid
flowchart LR
  M["主程式：本 origin SDK Session"] --> A["同環境 Supabase Auth"]
  Q["快速 App：本 origin SDK Session"] --> A
  I["輸入／建立"] --> L["本 origin IDB：capture + owner"]
  Q --> V["getUser 核身／固定 token + epoch"]
  L --> S["同 owner outbox"]
  V --> S
  S --> R["quick RPC：auth.uid + owner RLS"]
  R --> D["交易內 task + immutable receipt"]
  D --> W["主程式以自身帳號讀工作台"]
```

正式主程式 origin 保持 `https://projed-cc78d.web.app`，獨立 quick 保持 `https://projed-cc78d.firebaseapp.com/quick-task/`；同 origin `/quick-task/` 相容入口重用該 origin Session。不同 origin 各自登入及保存，不複製 token、cookie 或 IDB。兩邊以 Supabase user ID 判同一人，不以 email 合併帳號。

- `persistSession:true / autoRefreshToken:true / detectSessionInUrl:true`；沿用現有 SDK provider flow，不另換 PKCE／自行交換 Google code。quick 使用 `signInWithOAuth({provider:'google', options:{redirectTo, queryParams:{prompt:'select_account'}}})`。
- 新登入 redirectTo 固定為發起 origin 的 `/quick-task/`，不接收任意 return URL，不帶 token／owner／title。主程式保留既有 redirect。claim 不再依賴登入回跳自動認領；舊 `capture / claim` URL 只可帶到本機確認畫面。
- TEST 只允許本輪核對的隔離測試 origin；正式 callback 必須允許上述 quick 的精確路徑及既有同 origin 相容路徑，保留既有合法設定，不新增任意 host wildcard。SDK 初始化／callback 完成後才處理 claim、移除 SDK 已處理的敏感 URL 內容；錯誤、取消、缺本機資料均不能 claim。
- `getSession()` 是本機候選身分；送出前必須 `getUser(accessToken)` 確認 user ID，再讀最新 Session，確認 owner／token／epoch 未變。token 刷新或 owner 變更使舊核身 snapshot 失效；Auth listener 只更新 snapshot／排程，不在 SDK callback 中 await 另一 Auth 呼叫。[官方 getUser](https://supabase.com/docs/reference/javascript/auth-getuser)、[Auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- 每批最多一個核身與 flush；同 owner TOKEN_REFRESHED 取消尚未 dispatch 的舊批，核身新 token 後續送。在途 A 已被 server commit 的有效回應可完成 A 的記錄，不綁新 token 或顯示 B 成功。
- 網路／Auth 服務不可達：狀態為離線或「登入待確認」，保持最後核實的本機 owner，RPC=0，不自動跳登入。明確 token 失效／SIGNED_OUT：停止送出，提示重新登入；既有 A 記錄保持 A，SDK 身分消失後新記錄不得猜 A。
- 一般登出先取消本頁調度、bump epoch，提交 §4 的持久化登出 barrier，再 `signOut({scope:'local'})`；同 origin 共用 Session 的 tabs 一起停送。barrier IDB 提交失敗時先停本頁調度，提示「無法保存登出狀態，請重試」，不回報已登出或承諾跨 reload 停送；barrier 已提交但 SDK 登出失敗時顯示「已停止同步，登出尚未完成」及重試，不宣稱 server 已撤銷。已提交 barrier 跨 reload 保留，殘存 SDK Session 不得自動啟動。使用者主動重新登入且 SDK callback／核身成功才解除。已有明示全域撤銷保留平台語意，不承諾立即撤銷未到期 access token。[官方 signOut](https://supabase.com/docs/reference/javascript/auth-signout)


本機型別契約：候選 `QuickAuthSnapshot` 固定 readonly accountId／accessToken／authEpoch；經核身的 `VerifiedQuickAuthSnapshot` 必須另含 email／contextRevision／contextProjectRef，移除 clientId。核身結果使用 `verified / unauthenticated / unreachable / stale` 判別式：分別為符合 snapshot 的真 user、缺 Session／明確失效、網路／429／5xx／逾時、epoch/token/revision 已變；不可再用同一個 null 混淆離線與登出。三次 SDK／網路檢查共用 15 秒 deadline，晚到結果不寫 context／觸發 flush。getSession refresh 失效、Session 消失、getUser 401 及最後 Session 重查失效，均立即停止 binding／bump epoch 並保留 captures；服務暫時不可達不當作已登出。context revision 與 binding barrier 必須在 lease transaction 及每次 dispatch 前檢查，同 origin 的另一 tab 即使未收到 SDK 事件也不能繼續派送。

local logout 的殘留 SDK Session 不能清除持久化 barrier。`auth_context` 可加非秘密 `sessionId` 作同一次 SDK Session 辨識；sessionStorage 的 `projed-quick-sdk-login-intent` 只記 15 分鐘內明確登入的時間，不是核身證據。登入發起時另以 `projed-quick-sdk-login-prior-session` 保存非秘密 `none`／`id:<session UUID>`／`unknown` 提示，防止舊 v2 context 缺 sessionId 時把殘留 Session 誤認為新登入；unknown 不得解除 barrier，成功核身／登出／登入錯誤清除提示。恢復 binding 必須同時具備 barrier 後的明確登入、不同於登出與登入前殘留值的新 SDK session identity、普通 Auth 的網路 getUser 核實及 context CAS。舊 v2 context 缺此可選欄位仍可讀，不複製 token、不把舊自製 OAuth cache 換成新 Session。

Rev 10 非同步規則：每次 Session 載入固定 load revision 與 auth epoch，各 await 後及 IDB 實際 put 前核對，舊 A／null／401 回應不能覆蓋較新的 B。初始化 checking／明確 unauthenticated 不能猜用舊 context；只有 SDK 明確暫時不可達、同環境且沒有 barrier 才可保留最後核實的本機 owner。binding helper 收到明確失效或無 Session 時須持久停止 binding，後續503不可復活舊owner。SIGNED_OUT 延遲 barrier 不得覆蓋新登入，已收到登出即使 unsubscribe 仍須保存。UI 使用單一 binding context 決定 capture owner，交易內再核對 epoch／revision；已提交但 readback 失敗的重試保留同 captureId／title／owner，不因切帳改綁。

兩邊均顯示本 App 帳號；quick 的 `#quick-task-auth-status` 在同一表單容器上方提供未登入 CTA，已核實時提供帳號與「登出」操作，待確認時標明離線／重新登入。主程式重用既有登入頁及 Sidebar 帳號入口；不另造帳號管理模組。切 B 立即清除 A 最近任務的可見狀態並收起同步容器；A 的未同步記錄保留，不提供改綁 B 操作。

## 4. 本機模型、原子寫入及更新相容性

固定延用 DB `projed-quick-task-v1`／store `captures`／key `captureId`。**DB version 升至 2，capture schemaVersion 仍為 1**；在 `model.ts` 分開 DB version 與 record version，避免將資料庫升版當作重建。只加 `auth_context` store（keyPath `key`）及 capture 可選 `receipt`，不改原 owner／captureId／title／時間。

| 資料 | 固定欄位與用途 |
|---|---|
| Auth context 唯一 key `current` | `projectRef, accountId:string|null, displayLabel:string|null, verifiedAt:number|null, bindingAllowed:boolean, revision:number, barrierAt:number|null, sessionId?:string|null`。只存本機歸屬及 Session 辨識提示，無 token／refresh token／provider secret；遠端授權仍只靠有效 SDK token。 |
| Capture 原欄位 | `schemaVersion:1,captureId,accountId,title,workspaceHint,clientCreatedAt,updatedAt,state,attemptCount,nextAttemptAt,lastErrorCode,leaseId,leaseExpiresAt,claimIntent`。owner 一旦非 null 不可變。 |
| 新增可選 receipt | `{status:'committed',captureId,ownerId,titleHash,created,committedAt}`，完全符合 §6 才保存並轉 synced。 |
| claimIntent 保留 | `{captureId,nonceHash,expiresAt}`，15 分鐘、一次性 CAS；raw nonce 不寫 log、report 或跨 origin。 |

Auth context 只在核身成功後啟用 binding；owner 改變或明確登出／SIGNED_OUT 時 revision 增加並停用舊 binding。context.projectRef 與 build 不同時是環境 drift：整個 origin 暫停同步及 binding，不覆寫 context 來重綁舊任務；須恢復原環境，UI 顯示同步設定異常／資料仍保留。登出 context 清除 accountId／displayLabel／verifiedAt 並保留 bindingAllowed=false barrier及新 revision；舊 A 的 owner 仍在 captures。普通網路錯誤不清已核實 owner；離線重開只能用同環境、未被登出 barrier 撤銷的 context 作本機歸屬，顯示「離線待確認」。context 缺失／損壞時安全降為 unbound；唯讀不到 context 不能推定已登出，該次本機寫入仍須確認 DB transaction 可用，若 storage／交易失敗保留輸入，不回報保存。不能把 SDK cache、URL owner 或舊自製 token 當已核實身分。新 SDK 候選為 B 而 context 是 A，先停用 A binding，核實 B 後才啟用 B。

建立使用同一 `readwrite` transaction 跨 captures + auth_context：以送入的 expected context revision 做 CAS，確認本機 owner 未變，再 `add` capture；交易完成後 same-key readback 核對 captureId／owner／title。與登出／切帳的 context transaction 序列化，CAS 不符保留輸入並請使用者在新狀態重新建立，不悄悄把這次輸入轉綁 B。首次啟動 Auth 尚未初始化不阻塞輸入，建立可保存 unbound。

Auth context 首次寫入以 `expectedRevision=null` 表示預期不存在，兩個 tab 初始化只能一方取得 CAS。保存缺失／損壞 verifiedAt 或跨 project context 不啟用 binding。同 key 重試只可讀回相同 owner／title；IDB readback 失敗保留原 record／captureId 再確認，不能新建第二個 ID。CSPRNG 不可用時保留輸入、復原控制項並回報未保存，不用弱亂數替代。

captureId 必須是 `task_workbench_unplaced_<UUID>`；無 randomUUID 時用 getRandomValues 生成合法 UUID，不用目前的 Date／Math.random 字串。名稱只 trim JavaScript 空白、保留內部空白及 U+200B，1～500 Unicode code points；HTML maxlength 不得以 UTF-16 截斷合法輸入，沿用 IME／語音控制。IDB readback 失敗重試原 captureId；若原 key 已提交，先讀回比對，不能換 ID 宣稱第二筆已記下。

Lease 取得、claim、人工 retry、finish、cleanup 均在各自 readwrite transaction 內重讀及 CAS。禁止先 readonly 判斷 owner／lease 再無條件 put。finish 須匹配 captureId、原 owner、leaseId，且已 synced 不倒退；原記錄不可被跨帳 retry／晚到 callback 改綁。

升級只在 onupgradeneeded 加 store／必要 index；versionchange 關閉舊 connection，blocked／abort 顯示可重試保存錯誤，不能 deleteDatabase、清 store 或強制 reload 未存草稿。舊 synced 缺 receipt 者不自動刪：同 owner 核身後在 CAS 交易將缺回執的 legacy synced 轉 pending，以原 ID／title 重放取得回執，再依 §6／§7 清理；失敗保留，不在 list 階段用七日 filter 隱藏此類記錄。舊版曾 trim U+200B 的 TEST receipt 發生 conflict 時保留資料並報錯，不改 server hash。DB v2 後不能回退到只會 open(version=1) 的 client；回復候選必須會讀 v2，這是 release 相容條件。

## 5. 認領與前往工作台

- **2026-10-01 使用者核准的恢復入口精簡。** 空白輸入狀態只為未綁定任務、登入失效、永久失敗及其他帳號待辦顯示單一文字入口；同帳號正常 pending／syncing／failed_retryable 不顯示手動操作或常駐說明。未綁定以「本機待同步任務 N 筆」提示；失敗以「同步異常 N 筆」、其他帳號以不含內容的「原帳號待辦 N 筆」提示；混合時合併為「需處理 N 筆」。展開後列出當前範圍內未綁定任務名稱，並沿用逐筆目的帳號確認或失敗處理流程；最近任務摘要已呈現的項目不重複列出，其他帳號任務不顯示名稱。已登入且核身成功時直接確認，不再次啟動登入。登入本身仍不認領；確認前重新核對 owner／Auth epoch／context revision，切帳或重開須重新確認。輸入新任務期間收起入口；稍後／返回仍保留資料及可再開啟的入口，不設一般狀態的「處理／稍後處理」雙按鈕。
- **2026-10-01 後續呈現調整。** 未綁定任務使用「本機待同步任務」作為可展開／收合容器的標題；首次出現時預設展開，使用者仍可收合。收合不刪除任務、不代表確認認領；未完成的確認收合後，下次展開須重新核身及確認。
- **2026-10-01 最近狀態與恢復入口整併。** 最近一次保存／同步狀態與任務名稱放在同一容器摘要；需要介入的待辦數量在同一摘要提示，展開後顯示認領或失敗處理。最近任務若仍未同步，只在摘要代表一次，不再重複計入其他待處理數；若最近任務本身需介入，摘要提示確認帳號、重新登入或同步異常。同帳號正常自動 pending／syncing／failed_retryable 維持自動同步，不列為人工恢復項目。切帳、稍後處理、明確認領與 owner 邊界不變。
- **2026-10-01 收合入口視覺降噪。** 收合時使用透明背景與無外框的低對比摘要，標籤及筆數同行顯示並縮短高度；仍保留至少 44px 的操作高度。展開後保留淡色容器及既有操作提示。
- **2026-10-01 預設展開入口。** 待同步／最近狀態容器首次顯示時自動展開；使用者手動收合後，背景同步或一般狀態刷新保留其收合狀態。確認綁定仍須明確操作。
- **2026-10-01 未登入狀態色彩。** 「此快速 App 尚未登入」以紅字呈現，其他登入、網路及驗證狀態沿用一般提示色。
- **2026-10-01 未登入保存說明與任務清單。** 未登入狀態明示任務會先保存在本機，登入 ProJED 帳號後才同步雲端；展開入口列出可認領的本機未綁定任務名稱。只顯示 accountId 為 null 的記錄，隱藏其他帳號任務標題；最近任務摘要已顯示者不重複列入清單。
- 無已知帳號可線上／離線保存 unbound；登入事件本身不認領。登入 CTA 只處理登入，回來後從「待處理」逐筆選擇記錄。
- 核實 A 後顯示「同步到〈目前帳號〉」和該筆名稱，提供「確認同步」／「稍後處理」。建立並凍結 captureId、目的 accountId、authEpoch/context revision、15 分鐘 nonce；確認時再檢查最新身分及 IDB CAS；confirmation 畫面 reload／重開後必須重新顯示目的帳號及生成 nonce，不沿用記憶體已遺失的確認。B 取代 A、nonce 過期或 login callback 舊 claim 皆回確認畫面，必須重新確認 B。
- CAS 只可將 accountId=null 且 nonce／expiry 符合的記錄轉 A-bound pending，並清 claimIntent；兩 tabs 確認只能一個成功。取消／錯 nonce／過期／衝突不刪記錄，稍後處理只收起提醒、不移除或改綁。
- A-bound pending／failed 只有再次核實 A 才可處理；B UI 不顯示 A title，也不把 A 記錄加入可認領清單。裝置另有資料只提供不含內容的提醒及重新登入原帳號入口。
- 「前往工作台」沿用 `origins.ts/getWorkbenchUrl` 到主程式，由主程式自己的登入／帳號讀資料；main 未登入自行登入，main B 不自動切成 quick A、不以 query 傳 user/token。沒有 active membership 或既有 profile 初始化未完成時提示「先到主程式完成帳號與工作台設定」，任務留本機，回來同帳號人工重試。quick 不呼叫 profile upsert／membership 建立 API。

## 6. RPC、回執與權限不變條件

保留 `POST /rest/v1/rpc/create_quick_unplaced_task_v1`，參數只有 `p_capture_id:text,p_title:text,p_workspace_hint:text|null`。使用 public anon key + 固定的本次 user Bearer，`credentials:'omit',cache:'no-store',redirect:'error'`，15 秒 timeout。clientId 欄位、OAuth RPC gate 及專屬 credential 刪除。

owner 永遠由 `auth.uid()` 決定。workspace hint 只作提示；先找本人 active membership 中符合 hint 的 workspace，無效 hint 回落本人最新 active membership（updated_at desc／tenant_id tie-break）；完全無可用 membership 才 `QT_NO_AVAILABLE_WORKSPACE`。新 quick 記錄 workspaceHint 固定 null，避免沿用未帶 owner 的 `projed-last-ws`；舊記錄 hint 保留但由 server 驗證，不能藉 B 傳 A hint 選中 A workspace。

Server 固定 canonical DEV-122 行為：空 search_path、SECURITY INVOKER、既有 owner RLS；同 owner unplaced root advisory lock 兼容 placement writers；同一 transaction 寫 task + receipt；task 主鍵 `(owner_id,id)`、receipt 主鍵 `(owner_id,capture_id)`、SHA-256 title_hash 32 bytes、owner FK 至 profiles（既有 ON DELETE CASCADE）、authenticated receipt 不可更新／刪除。相同 owner／ID／title replay 回 created=false；title 不同為 conflict。後來移動／刪除 task 仍可由 receipt 回 replay 成功，不能因 task 已移動／刪除而重建。

Client receipt 必須 status=committed、captureId／ownerId 與 leased request 相符、created 為 boolean、titleHash 為 64 hex 且等於本次 normalized title 的 UTF-8 SHA-256、committedAt 為有限且安全的正整數毫秒。HTTP 成功、toast、空 JSON 都不能代替 receipt；不符為 `QT_INVALID_RECEIPT`，保留資料、停止該筆自動重試，不顯示 synced。有效 receipt 與 state=synced 在同一交易提交；即使 UI owner/epoch 已變，最多完成原 A 的 record，不向 B progress。

現行 ACL 保持：RPC execute 不含 PUBLIC／anon，既有 authenticated／service_role 不擴張；client 不使用 service_role。receipt 僅既有 SELECT／INSERT 及 owner policy，無 UPDATE／DELETE；private schema 不新增 Data API exposure。task、profiles、tenant_members、tenants 的既有政策與 grants 不變。普通使用者合法工作台存取必須回歸，不能拿「quick 程式不查清單」宣稱其 JWT 無其他權限。

## 7. 同步狀態、重試及清理

| 事件 | 狀態轉移／操作 |
|---|---|
| 本機提交 | 有允許 binding 的 context → pending；否則 awaiting_auth；只顯示「已記下／待同步」。 |
| 明確認領 | awaiting_auth → pending，同交易凍結 owner；accountId 此後不可改。 |
| 同 owner 核身且可調度 | pending／到期 failed_retryable／過期 syncing lease → syncing；lease 30 秒，每次實際 RPC dispatch 計 attempt。 |
| 有效 receipt | syncing → synced，原 lease CAS 同時保存 receipt；UI 另檢查 current owner/epoch。 |
| HTTP 401／明確 Auth 失效／QT_AUTH_REQUIRED | failed_auth，停止該 owner 批次並提示重登；重新核實同 A 後只把 A 的 failed_auth 轉 pending，保留 ID／內容，不影響 permanent。 |
| 網路／15 秒 timeout／HTTP 408、429、5xx | failed_retryable，同 ID 退避；5 秒 × 2^(attempt-1)，上限 15 分鐘，尊重但 cap Retry-After 為 15 分鐘。 |
| QT_INVALID_CAPTURE_ID／QT_INVALID_TITLE／QT_IDEMPOTENCY_CONFLICT／QT_EXISTING_ROW_INVALID／QT_ORDER_EXHAUSTED／QT_NO_AVAILABLE_WORKSPACE／42501／23503／QT_INVALID_RECEIPT／其餘非重試型 HTTP 4xx | failed_permanent；清楚提示，原記錄保留，不盲目重登或改 title/owner/ID。只有 workspace/profile 依賴恢復、AUTO_RETRY_EXHAUSTED 或下列 legacy P0001 人工重新確認流程允許同帳號動作；已知衝突／無效回執須查證。 |
| RPC 回應 SQLSTATE `P0001` 且 message 為完整 `QT_*` domain code | 將完整 domain code 持久化為 `lastErrorCode`，供既有狀態分類及恢復入口使用；不得只留下通用 `P0001`。 |
| Legacy `lastErrorCode=P0001` | 保留原 capture、owner 與 title，維持 permanent；不得自動重試或建立新 ID。只有原帳號經 `getUser` 核實後，使用者明確選「重新確認」才以同一 captureId 重送 RPC，取得明確錯誤或有效 receipt。已知 title／idempotency conflict 或無效 receipt 仍須查證，不得以此流程盲目重試。 |
| 自動 RPC 達 8 次仍失敗 | failed_permanent + AUTO_RETRY_EXHAUSTED；人工重試原 ID 後可重設該輪 attempts，不能再自動啟動無限循環。 |
| 登出／切帳／取消／pagehide | 取消新 dispatch／timer；已發出 RPC 不保證 server rollback。中止 request 保留原 ID，lease 自然過期後同 A replay；不把主動 cancel 當永久錯誤。 |

Auth 核身尚未成功前不加 capture attempt、不取 RPC lease；網路核身重試同樣以 5 秒起退避、15 分鐘 cap、每次啟動／online／回前景事件週期最多 8 次，耗盡等下一次事件或人工處理，沒有自動登入跳轉。重登恢復 failed_auth 只重新開一輪同 owner 記錄，不能自動重設耗盡／永久失敗記錄。

啟動、online、pageshow／可見前景、到期 timer 觸發核身及同 owner flush；navigator.onLine 只是提示，不是可用性判定。events 合併為 single-flight，空 outbox 不輪詢業務資料；Auth 失敗不阻塞輸入。pagehide 停調度，bfcache pageshow 需重新啟用恰好一份訂閱／timer，不能沿用目前一次 pagehide 便永久解除重試的生命週期。

清理啟動、回前景及開啟期間每日執行，直接 raw-store readwrite cursor 重查 record；只刪有效 receipt 且 synced、updatedAt 滿 7 日、非未來／損壞時間的本機副本。未同步、legacy 缺回執、租約未完成、交易 abort 一律保留；server task／receipt 不刪。關閉期間不保證準點，下次開啟補清。

## 8. 實作責任面與順序

依賴方向固定：main.ts 負責 UI／觸發；auth.ts 管 SDK／核身／epoch；outbox.ts 管 IDB transaction；sync.ts 管核身結果的同 owner 調度／lease；quickTaskCaptureService.ts 只管固定 Bearer RPC／嚴格回執解析。Auth context 寫入重用 outbox，不新增第二套 token store、通用 queue 或帳號 broker。

| 順序 | 實際檔案責任面 | 固定輸出與驗證 |
|---|---|---|
| 1 本機契約 | `src/features/quickTaskCapture/model.ts,outbox.ts` | DB v2／auth_context／receipt，原子 owner CAS、claim／retry／finish 保護、合法 UUID／code points、升級與 raw cleanup；N03／N06／N09／N10。 |
| 2 單一路徑 Auth | `src/features/quickTaskCapture/auth.ts`、`src/services/supabase/client.ts`、`src/services/authService.ts`（僅 Supabase signOut） | 普通 SDK callback／核身、分類網路與失效、本 origin 登入／local signOut／barrier；N01／N05／N07。 |
| 3 同步／UI | `src/features/quickTaskCapture/sync.ts`、`src/services/supabase/quickTaskCaptureService.ts`、`src/quickTask/main.ts,quick-task.css`、`quick-task/index.html` | 同 owner single-flight、固定 Bearer、receipt hash／CAS、post-login 確認／恢復操作／帳號可見；N02～N08／N10。main 的既有 `src/store/useAuthStore.ts / src/components/Sidebar.tsx / src/components/AuthGate.tsx` 僅核對入口，若現有入口足夠不修改。 |
| 4 退役清單 | `src/features/quickTaskCapture/oauthClient.ts`、`oauth-consent.html`、`src/quickTask/oauthConsent.ts,oauth-consent.css`、`vite.config.js`、`src/vite-env.d.ts`、`scripts/release/production-contract.mjs,env-boundary.mjs` | 移除自製 OAuth／consent entry／三個 QUICK_TASK_OAUTH keys及專用 redirect helper；舊 env 鍵拒絕作輸入，掃描 source 與 build 不再有可啟用分支。普通 Google、主程式 env 邊界、DEV-123 等旗標保留。 |
| 5 向前 schema 修正 | `supabase/migrations/20261001090000_dev_133_quick_rpc_security_invoker.sql`（保留可審查的明確 migration；不改歷史） | TEST remote version `20261001045945` 已讀回；function body 收斂 local DEV-122、invoker／empty search_path，task／receipt ACL、receipt RLS 與資料不變。行為案例見 QA；N08／N10 的正式 package／smoke 仍待。 |
| 6 驗證接手 | `scripts/run-dev-133-local-browser-check.cjs,verify-dev-133-quick-task-local-browser.pw.js`；新增 `scripts/verify-dev-133-independent-auth-contract.ts` | 擴充 existing runner 為新契約的 IDB／Auth 故障案例；新增 meaningful model／receipt／分類／退役契約測試。移除 `run-dev-133-oauth-mock-check.cjs,verify-dev-133-oauth-client-browser.pw.js` 的現行測試入口，歷史 artifacts 保留。 |

舊 `projed.quick-task.oauth-session.v1 / oauth-transaction.v1` 不能讀取、搬移或轉成普通 Session，新版不依賴其存在。其資料可留為不執行的歷史殘留，本期不做 credential 清理；IDB 原 A 記錄須普通登入 A 才續送。已套用 TEST v2 的 policies／allowlist／trigger 保留，不為清理刪表或解除限制。

禁止改 origin／manifest identity、已套用 migration、主程式業務工作台／帳號開通／membership 管理、無關 DEV-132 安裝 UI。可自行決定局部函式名稱、樣式及測試寫法；不得變更上述狀態來源、API／資料／權限／認領語意。發現未記錄的架構 drift、需新增 API／schema owner／放寬權限或既定驗收不可實作，停止該面並回送技術審查；既定工程修正不重新詢問人類。

## 9. 驗證命令、驗收與停止條件

風險 lane：High（帳號／RLS、任務歸屬及清理），以 QA 失效案例與 targeted QC 控制；同一 executor 分別執行 RD 修復、QA 計畫及固定候選 QC，不宣稱獨立人員審查。2026-10-01 latest TEST runner 使用既有 Python Playwright＋真 Chrome，B0 gate、TEST correction 與 post-correction 核心案例已通過；本節 runner 的固定 source／layer 標示及其餘缺口以 QA 最新審核表為準。

`run-dev-133-boundary-check.mjs` 保存固定 source／測試 hash，跑真 IDB 及另標注入的 Auth/RPC；`build-dev-133-test-candidate.mjs` 驗建置後真 SW 斷網重載；`run-dev-133-live-auth-boundaries.mjs` 用既有普通 TEST A 補真 refresh rejection、已提交但回應遺失、logout 晚到回應及清理後 server task／receipt 保留；完整 A/B 流程由 `verify:dev-133-test-actor-readiness -- --browser --integration` 執行。詳細結果、首輪失敗及仍缺項目以 QA 續驗表為準，不用 isolated SQL claims 代替 live RLS。

| 層 | 命令／入口 | 證據邊界 |
|---|---|---|
| 型別／lint／build | `npx tsc --noEmit`；對 §8 修改的 TS/JS 執行 targeted ESLint；`npm run build:test` | 配置、移除 consent entry／OAuth env 與一般登入 bundle 不破壞；不是功能驗收。 |
| 契約／本機 | `npx tsx scripts/verify-dev-133-independent-auth-contract.ts`；`node scripts/run-dev-133-boundary-check.mjs`（既有 Python Playwright／Chrome） | DB v1→v2、context/logout CAS、nonce、receipt hash、401 status 分類、late response、cleanup／bfcache；注入另標 SIMULATION。舊 Node browser runner 不作本輪執行入口，不為它另裝依賴。 |
| 原功能回歸 | `npm run verify:dev-122-mobile-zero-data-quick-task`、`npm run verify:dev-122-mobile-zero-data-quick-task-sw` | 保留 zero-business-read、輸入／語音／SW／identity；只修與新契約衝突的預期，不抹掉其他 dirty 改動。 |
| 本機 DB | `npm run verify:dev-122-mobile-zero-data-quick-task-db-isolated`、`npm run verify:dev-122-mobile-zero-data-quick-task-db-concurrent`；`npm run verify:supabase:migration-aliases` | isolated DB runner 需加 v2→新 correction 升級路徑，再跑既有冪等／RLS／mixed writer 矩陣；fresh baseline 與 upgraded baseline 都驗。SQL claims 模擬不是真 JWT。 |
| 真實 TEST | [QA N01～N10](../qa/QA-DEV-133-quick-task-shared-identity-sync.md) 的正常 Google 登入／quick UI／主程式工作台路徑 | 核對 TEST provider／固定 callback allowlist、受控 A/B profile+membership 與 build backend。真 ordinary Session、非空 fixture、相同 ID 唯一讀回、一般登出隔離。不能用舊 OAuth mock／SQL claims 替代。 |
| 固定 bundle／更新相容 | `node scripts/build-dev-133-test-candidate.mjs`；`node scripts/run-dev-133-built-update-compatibility.mjs` | safe public-only TEST config的實際Vite build／SW離線；A→B→A worker lifecycle、v2相容回復、原owner／captureId保留。原DEV-122 static／SW命令用 `DEV133_BUILD_OUTDIR` 綁定這份候選，不讀其他任務的舊dist；`DEV133_REPORT_DIR` 隔離報表。Source `8a0e738` 的歷史 N10 10/10 保持原邊界；最新未提交 candidate digest `092f1fa088efb4d15567ae6cc1cdb48f45d051913aa6a9d74556fb8fbc54d2ab` 的 fixed bundle offline 10/10 與 built-SW A→B→A 10/10 另見[QA最新 N10](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#2026-10-01-rev10-fixed-test-built-sw-a-to-b-to-a-compatibility)。此為本機 TEST 相容證據，不是正式已安裝 client、Android、真實 Google、speech 或完整 PWA 自動更新驗收，也不新增 production installed-client gate。 |

驗證 runner 若啟動 temporary Vite／DB／browser，先記 owner、用途、port、PID tree、cleanup 條件；本機 runner 使用既有 4173，不搶佔 user-owned 4000。TEST 雙 origin 選受控不同 port／origin並核對 allowlist，只改 TEST 暫時 URI；完後還原本輪設定，關閉 task-owned UI／process tree、確認 port 釋放。

QA 每例記錄 sourceRevision／dirty boundary、環境及兩個 origin、build artifact、actor alias、fixture、request owner／captureId／receipt 摘要、正常 UI 操作及結果。320×844、390×844、726×668、鍵盤：登入、帳號、認領／稍後、錯誤恢復可操作，不遮擋名稱／語音／建立，不新增重複容器；可見錯誤不能以 API PASS 抵消。詳情統一在 QA 文件，本 spec 不複製整套矩陣。

停止條件：A→B 錯綁／錯送、B 看見 A title、未有效 receipt 卻 synced、IDB 未 commit 卻保存成功、未同步資料消失、callback 回錯 origin、ordinary Session 合法權限退化、需要管理金鑰／新 grants／放寬 RLS。測試失败不得把預期改成寬鬆通過；測試輸出不得包含 token／code／個資原文。

## 10. 向前修正與 Release Impact Note

新增 migration 固定重建 canonical DEV-122 function body並顯式 SECURITY INVOKER／empty search_path，保留既有 execute ACL，不重建 receipt／task 表、不改 owner／workspace／既有 hash。TEST 已套用 source `20261001090000_dev_133_quick_rpc_security_invoker.sql`、remote version `20261001045945`；readback 為 invoker、空 search_path，body MD5 `d80a1ea6932806c0cfa82fce1b73a842`，task／receipt ACL 與 receipt RLS 不變且沒有業務資料改寫。TEST 行為與 readback 報告見 QA 最新證據節；已套用 migration 歷史保留，不重套 DEV-122。

正式 v2 未套用，release migration selection 必須排除單獨補套已退役 v2，不使用未審視的全量 db push。最新 PROD preflight 確認 canonical DEV-122 body 已存在，DEV-133 correction 在正式為條件 no-op；將選擇與 `database-before.json` 中 prosrc hash 綁入當次 package，避免不必要重套。若當次 readback 發生差異，依既有 correction／原子收斂規則審查，不能留下可被呼叫的中間 definer 狀態。本期不新增 PostgREST hook／OAuth client／Auth Server 設定。

Release impact 為 SDK callback bundle／env keys 退役、DB v2 相容、TEST forward correction 與 ordinary Session 權限回歸。TEST gate、正式 readonly preflight、隔離 sealed package 與兩次正式發布已依 [REL-014](../release/REL-014-DEV-133-INDEPENDENT-AUTH-20261001.md) 完成。原核心 product `8376086` 的正式普通 Google／RPC／工作台／離線補送／local logout 40/40 PASS；後續 UI product `9b5f73a` 的本機 UI／IDB SIMULATION 25/25、正式匿名 UI 10/10及兩 origin各54/54 PASS。PROD correction NO_OP／metadata hash 已綁定原核心包，後續 UI 不改 DB／Auth 設定。PR #5 已提交，review／merge 尚待完成；部署前回歸及測試腳本修正見 QA 最新驗證節。不將各層 assertion 相加或把原核心重用證據改稱新 UI 實測。舊 OAuth Gates 不補登 PASS，Android 實機沿用使用者取消的決定。本文件不另建發布操作表。

## 11. 定案結論與交接條件

Rev10最新交接：架構方向維持，Auth／IDB／UI競態修正product `8a0e738`已正式啟用，production仍為此source；live version `ae38a453a07ec4f3`及Rev9 recovery anchor不變。其後三項產品修正仍未commit／部署。未提交 TEST candidate digest `092f1fa088efb4d15567ae6cc1cdb48f45d051913aa6a9d74556fb8fbc54d2ab`：fixed bundle offline 10/10、A→B→A built-SW／DB v2 10/10；N08 hosted ordinary-session recovery指定 scenario 18/18，首輪真產品FAIL與中間 harness timeout均保留，詳見[QA最新續驗](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#2026-10-01-rev10-fixed-test-built-sw-a-to-b-to-a-compatibility)。這些是 TEST 相容及 hosted scenario 證據，不代表正式已安裝 client、Android、Google、speech或完整 PWA 更新驗收。main既有Session已正常SDK refresh／getUser200；新版 quick Google核身與PROD功能續驗、N03 actual speech、PR #5 review／merge、4195專屬視窗 cleanup仍 required，DEV-133維持執行中。Site URL必須為`https://projed-cc78d.web.app/`，readiness以固定正式project的Auth config GET檢查，不僅憑client env推定。下列Rev9紀錄保留原source歷史，不包含Rev10修正。

2026-10-01 Architecture Closure Review：登入來源／origin／callback、context／capture 交易、owner／claim、RPC／receipt／RLS、retry／cleanup／upgrade、退役責任面及測試路徑均已鎖定，**沒有待選的 P0/P1 架構決策**。TEST 29/29 integration、B0/core27、Google cancel21/21、correction readback及post-correction7/7已完成；REL-014 的正式核心與 Rev9 UI 也已發布及驗收，source／artifact／復原版本與分層證據見 QA 最新正式結果。Git 分支與 PR #5 已交付，目前 OPEN／CLEAN，仍待 review／merge；DEV-133 在合併完成前維持執行中。

新版 N01～N10 以 [QA 正式契約矩陣](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#2026-10-01-正式同步核心驗收rel-014) 為判定依據：普通 TEST A/B、正式同帳號獨立 Session、正常 UI／RPC／工作台及離線補送有真實服務證據；401／nonce／CAS／lease／清理及升級邊界依明示的 browser／IDB／SQL／故障注入層。七日閾值由6／8／40日fixture驗證，不宣稱觀察真實七日排程。N10 最新未提交 TEST candidate 的 built offline 與 A→B→A built-SW／DB v2 子項各 10/10 PASS；舊 source `8a0e738` 的 N10 收據保持其原 source 邊界。以上僅證明固定 TEST 相容層，不宣稱正式已安裝 client、Android、真實 Google、speech 或完整 PWA 自動更新，也不新增原 SPEC 未要求的 production installed-client gate。N08 hosted ordinary-session recovery 指定 scenario 18/18 PASS：缺 profile／membership 拒絕且無 task、原帳號人工重確認 legacy P0001、主程式正常設定後同 ID 建立唯一 task／receipt及 replay、C 不能讀 A；原始產品 FAIL及 harness timeout 收據保留，這不等於整份 DEV-133 完成。三項 source 修正未 commit／部署，PROD仍為 Rev10 `8a0e738`。N03 actual speech、PROD quick Google／新版功能驗收、PR review／merge及4195專屬視窗 cleanup均仍 required；Android實機依既有決定取消。sealed package、正式callback／origin／Session與scope smoke已完成，不能保留為未發布狀態。PROD canonical prosrc與NO_OP已讀回綁定；既有 ProJED 授權延續。未來跨 App 自動登入、強制同帳號、即時全域登出或 create-only credential 只有使用者重新要求時才回 ADR 審查。

歷史證據保留於 [QA 歷史區](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#dev-133-legacy-oauth-evidence)及 [2026-09-30 執行補充](../qa/DEV-133-execution-boundary-addendum-20260930.md)；舊本機／桌面／synthetic 結果只支持當時的實際案例。
