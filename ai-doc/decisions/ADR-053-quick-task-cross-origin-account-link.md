# ADR-053：ProJED 雙 App 共用帳號、各自登入與依帳號同步

狀態：**Accepted — Rev 3（2026-10-01；產品方向已採用，工程架構已定案）**。本版取代 2026-09-30 的跨 App OAuth Server／public client 銜接決策；此處記錄決策當時的狀態。現行實作、TEST、正式發布與 PR 交付進度見本 ADR 後續 execution update 及 REL-014。

關聯：[DEV-133](../dev_task.md#dev-133-快速建任務同帳號與自動同步---2026-09-30)、[SPEC-133](../specs/SPEC-133-quick-task-shared-identity-sync.md)、[QA-DEV-133](../qa/QA-DEV-133-quick-task-shared-identity-sync.md)、[SPEC-122](../specs/SPEC-122-mobile-zero-data-quick-task.md)、[ADR-050](ADR-050-mobile-quick-task-entry-and-outbox.md)。沿用既有文件路徑與 DEV ID，避免續接引用失效。

## 背景與決策來源

真正目標是立即記下任務，並可靠地送到本人 ProJED「全域任務工作台」。兩個 App 都是 ProJED 第一方產品，使用同一 Supabase 專案及帳號系統；為「免再次登入」另外建立身分提供者、consent、public client 與自製 token lifecycle，增加設定、權限及驗收成本。

使用者於 2026-10-01 明確採用「共用帳號、各自登入、各自保存 Session、離線任務依帳號同步」，並要求修改開發文件。這是 **Intentional replacement**：覆蓋早先 `3B` 被解讀為跨 App 自動銜接／免再次輸入帳密的契約；`1A／2A` 的本機先存、未綁定資料明確認領及定期清理保護繼續保留。

DEV-131 的雙 PWA origin／manifest identity 保留。不同 origin 的 Session 與 IndexedDB 各自管理；共用帳號資料庫不等於共享登入狀態。同 origin 的 `/quick-task/` 相容入口可沿用該 origin 的 Session，不為模擬隔離另造一套儲存。

## 決策

1. **共用帳號系統，各自登入。** 兩個 App 沿用同一環境 Supabase Auth 與既有 Google provider；各自在自己的 origin 完成標準登入、保存及更新 Session。兩邊選擇同一 provider identity／Supabase user ID 時任務屬於同一使用者；不以 email 字串代替 user ID。允許兩邊選擇不同帳號，不自動對齊、切換或合併帳號。
2. **登入狀態只代表本 App。** 兩邊各有登入入口與目前帳號顯示。一般登出明確使用本 Session 的 `scope:'local'`，不依賴 SDK 預設 global；同 origin 共用該 Session 的視窗可一起收到登出事件。既有明示「所有裝置登出」或管理撤銷仍可使其他 Session 失效，但不承諾跨 origin 即時更新畫面，也不新增全域登出功能。
3. **同步仍採 local-first。** 每筆先完成 IndexedDB transaction 與 same-key readback。建立時已有本 App 已核實且未登出／切帳的 A 身分，任務綁 A；暫時離線不能把 A 記錄改成未綁定或改綁 B。無已知身分時保存 unbound，須在登入後由使用者明確確認「同步到〈帳號〉」才認領。
4. **恢復連線與恢復登入分開處理。** 啟動、回前景、`online`、退避到期只觸發重試。送出前核實本 App 的 user ID，凍結 owner／token／epoch；只有與記錄 owner 相符才送出。登入過期要求重新登入原帳號，保留待送資料；網路中斷不反覆跳登入。App 關閉不保證背景同步。
5. **採第一方使用者權限，取消 App 專屬憑證隔離。** 快速 App 正常程式只呼叫既有 quick-create RPC，不載入業務清單；一般 Session 在伺服器端仍沿用本人既有 RLS／workspace membership 權限。本版不再承諾「快速 App 的憑證只能新增任務」。這不授權新增 grants、放寬 RLS、使用管理金鑰或跨帳號存取。RPC 仍以 `auth.uid()` 決定 owner，驗證 workspace 與冪等 receipt。
6. **本機清理只移除已同步副本。** 延續 7 日工程基線，只刪已取得有效遠端 receipt 且 `synced` 滿 7 日的本機副本。unbound、pending、syncing、failed 不自動到期，也不因登出、切帳或改版被清除。

## 方案取捨

| 方案 | 決定 | 效果與代價 |
|---|---|---|
| 同一 Supabase 帳號系統，兩邊標準 Google 登入 | **採用** | 重用既有 Auth，省去跨 App OAuth Server；使用者須自行選同帳號，Session 分開管理。 |
| ProJED 作 OAuth Server，快速 App 為 public client | 已取代 | 可銜接登入身分及另做 client-level 權限，但不再是本期需求，取消 B0／B1 OAuth Gates。 |
| 複製跨 origin token／IndexedDB 或自製 broker | 禁止 | 不需要此能力，且會增加憑證洩漏與任務錯綁風險。 |
| 合併 origin 或要求使用者重裝 | 不採 | 不為登入簡化改變既有獨立 PWA 身分。 |

## 相容性與既有實作處置

- 「移除跨 App OAuth」不等於移除 Google OAuth 登入。保留 provider callback／取消登入／SDK Session 更新及原有 claim nonce 防護；取消的是 ProJED 作為 OAuth Server 的那一層。
- `oauthClient.ts`、consent entry、自製 OAuth token store 及 `VITE_QUICK_TASK_OAUTH_*` 分支已在 HEAD `e868611` 移除；舊版只保留為歷史證據，不讀取、轉換或搬移舊 OAuth token。改版後需普通登入，原 IDB owner／captureId 保留，A 記錄只有 A 可續送。
- TEST 曾套用 DEV-122 quick RPC 與 `20260930155041_dev_133_quick_oauth_client_boundary_v2.sql`，後者把 RPC 改為 `SECURITY DEFINER`。不得刪除／改寫已套用 migration 歷史。目標恢復 DEV-122 的 `SECURITY INVOKER`／原有 owner RLS；必要修正使用新 forward-only migration，不改 task／receipt 資料、不新增權限。既有 OAuth restrictive policies 與未使用的 private allowlist 可保留為停用歷史設施，不為清理而解除保護或刪表。
- 2026-10-01 metadata／TEST＋PROD preflight update：TEST correction source `20261001090000_dev_133_quick_rpc_security_invoker.sql` 對應 remote version `20261001045945`；function readback 為 `SECURITY INVOKER`／empty search_path，body MD5 `d80a1ea6932806c0cfa82fce1b73a842`，task／receipt ACL、receipt RLS 及既有資料不變。E24 真 TEST RPC 保留 U+200B 並讀回同 ID receipt。PROD `ordinary-session-readiness/auth-result.json` 的 `/auth/v1/user`=200 且三項 actor match；`database-before.json` 記錄 canonical DEV-122 invoker prosrc MD5 `3ef7e8731dd6893594e0d66918ddfe16`。與 correction 的差異僅註解，故目前 PROD correction 為條件 no-op；package 須綁定該 readback 與 no-op 決策。正式不得單獨補套 retired v2。REL-014 已完成 sealed package／NO_OP綁定、正式核心40/40及後續Rev9 UI发布驗收；分層範圍見 QA 正式結果，PR #5 已建立且 OPEN／CLEAN，review／merge 待完成。
- 舊 B0／B1 證據保留於 [QA 歷史紀錄](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#dev-133-legacy-oauth-evidence)及 [2026-09-30 補充](../qa/DEV-133-execution-boundary-addendum-20260930.md)。它們不代表新登入流程已驗收。正式 OAuth Client 註冊不再是 DEV-133 上線前置。

## 工程定案與責任邊界（2026-10-01）

本版工程細節定案於 [SPEC-133 §3～§10](../specs/SPEC-133-quick-task-shared-identity-sync.md#3-最小資料流與登入契約)，不再保留平行登入方案。SDK 是唯一 token／Session 來源；本 origin 的 IDB auth context 只保存已核實帳號的本機歸屬提示與登出 barrier，不授予雲端權限。DB version 2 增加 context store，capture schemaVersion 1及既有 owner／ID 保留；本機建立、認領、租約完成及清理用交易／CAS 防止切帳競態。

unbound 在登入後另行明確確認目的帳號，標準 callback 不自動認領；同步固定 owner／Bearer／epoch，嚴格核對並保存 receipt／title hash。晚到 A 回應最多完成 A 的原記錄，不能更新 B UI。只清理滿七日且有有效 receipt 的 synced 副本；legacy 缺回執先以同 owner／同 ID 重放核實，不猜測成功、不清除未同步資料。

quick 不另做 profile／workspace 開通；缺依賴導回主程式設定，同帳號人工重試。普通 Session 沿用既有 RLS，沒有 client-level create-only 保證。因 DB 升版，回復 client 必須能讀 v2；不得以刪 DB／清未同步任務解決相容性。

Architecture Closure Review 已完成 source／build env／RPC／RLS／migration／既有測試比對，文件為 **RD Implementation Ready；架構定案：已定案**。TEST29/29、正常Google cancel21/21、correction讀回及post-correction7/7已PASS；[REL-014](../release/REL-014-DEV-133-INDEPENDENT-AUTH-20261001.md)記錄正式同步核心40/40、後續UI本機25/25／正式匿名10/10及兩origin各54/54。PR #5 已交付且 OPEN／CLEAN；review／merge 尚待完成。各case的hosted／injected層與殘餘以QA最新正式結果為準，不以metadata或assertion總數替代功能證據；不宣稱自動PWA更新、真麥克風或取消的Android實機PASS。舊driver失敗保留。實作只允許SPEC既定責任面，owner／API／權限／origin變更或新增認證服務須回技術審查。

## 成功判定與重新審查條件

成功需證明：兩邊各自登入／重開保留狀態；同帳號 quick UI 建立後在主程式工作台唯一讀回；不同帳號及切帳競態不錯送；離線回網且登入有效後同 ID 補送；登入失效保留資料；未綁定資料不自動認領；七日清理不刪未同步記錄。實體 Android 驗收沿用使用者取消的決定，窄版瀏覽器證據不得冒稱 Android PWA 實機證據。

若日後重新要求跨 App 自動登入／帳號強制對齊、即時全域登出，或快速 App 憑證只能新增任務，須重新審查登入或權限架構；不在本版偷偷加回 broker／OAuth Server。既有 owner、RLS、receipt 或更新相容性不能成立時，停止受影響實作並回技術審查，不以搬移任務或放寬權限補救。

技術依據（2026-10-01 查閱）：[標準 provider 登入](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)、[Session 儲存](https://supabase.com/docs/reference/javascript/initializing)、[登出 scope](https://supabase.com/docs/reference/javascript/auth-signout)、[登入 redirect allowlist](https://supabase.com/docs/guides/auth/redirect-urls)、[OAuth client 與資料權限的區別](https://supabase.com/docs/guides/auth/oauth-server/token-security)。
