# ADR-053：ProJED-快速建任務與主程式的同帳號銜接

狀態：**Accepted（架構已定案；B0 是實作 Gate）**；2026-09-30。ADR 的定案本身不代表遠端設定或正式發布已授權；本輪 ProJED_TEST 暫時 OAuth 設定與桌面 B0 測試另依使用者授權執行，測後已復原並確認。正式環境未觸及；Slice A 本機可靠性獨立於本 ADR。

關聯：[DEV-133](../dev_task.md#dev-133-快速建任務同帳號與自動同步---2026-09-30)、[SPEC-133](../specs/SPEC-133-quick-task-shared-identity-sync.md)、[SPEC-122](../specs/SPEC-122-mobile-zero-data-quick-task.md)、[ADR-050](ADR-050-mobile-quick-task-entry-and-outbox.md)。

## 背景與不可變條件

DEV-131 保留兩個可獨立安裝的 PWA：主程式 `https://projed-cc78d.web.app/` 與快速入口 `https://projed-cc78d.firebaseapp.com/quick-task/`。不同 origin 的瀏覽器 session、IndexedDB 彼此隔離；共用 Supabase 專案不等於共用 session。使用者選擇 `1A、2A、3B`，並要求本機資料定期自動清理：快速入口即使離線或未登入仍能先記；兩 App 要能銜接同一帳號；未同步內容不可因自動清理遺失。現行程式採 7 日後清除已同步副本，這是工程保留契約，並非使用者另選的 `4A`。

不可改變：PWA origin／manifest identity、不跨 origin 複製 token／IndexedDB／未同步任務、任務 owner 必須由已核實身分決定、遠端成功必須有同 owner receipt、未同步資料不自動刪除、App 關閉後不保證背景同步。

## 決策

1. **身份銜接採 OAuth 2.1 Authorization Code + PKCE public client。** 主程式 origin 是 Supabase OAuth authorization/consent UI；獨立 quick origin 是專屬 public client，持有自己 origin 的 OAuth session。主程式已有有效登入時目標為免再次輸入 Google 密碼；首次使用可要求授權同意。不得直接共享或搬移 session/token。
2. **帳號狀態分 origin 顯示。** 兩邊各有登入入口並顯示各自最近一次經 Auth 核實的帳號。OAuth 銜接代表取得相同 user identity，不代表瀏覽器即時同步 session。從主程式 signOut 不保證立刻撤銷 quick session；quick 下次驗證仍顯示自己的實際狀態，切帳號時不可將舊 owner 任務送給新帳號。即時跨 App 登出不在本期。
3. **同步採 local-first。** 每筆先以 IndexedDB transaction 寫入並 same-key readback；已綁定且 Auth 核實的同 owner 項目可自動重試；未綁定資料必須由使用者明確 claim。`online`、重開、回前景只是重試提示，不代表登入或服務已恢復。
4. **OAuth public client 必須有 client-level 最小權限。** Supabase access token 含 `client_id`；OAuth scope 只控制 OIDC 身分資訊，不能代替資料庫權限。B1 以受控 RPC 作唯一資料操作入口：private allowlist 驗證專屬 quick client ID；function 驗證 `auth.uid()` 和輸入契約，只建立一筆 unplaced task 並寫 immutable receipt；OAuth token 對 ProJED Data API 的直接資料讀寫 fail closed。主程式的一般 session（無 OAuth `client_id`）維持現有權限行為。安全 function 採固定空 `search_path`、完整 schema qualification、無動態 SQL、撤銷 `PUBLIC/anon` execute，並限制至 `authenticated`。必須逐行安全審查與負向測試；若無法證明權限收斂，B1 停止。
5. **本機清理只移除已同步副本。** 採目前程式的 7 日工程基線，只刪有有效遠端 receipt 且已 `synced` 滿 7 日的本機副本；pending、unbound、failed 項目不設自動到期。改變保留週期需另行明確決策。

## 考慮過的方案

| 方案 | 決定 | 理由 |
|---|---|---|
| 保留兩邊各自 Google 登入 | 不採 | 使用者可能選到不同帳號，無法達成同一身分銜接。 |
| 跨 origin 傳 token、localStorage 或 IndexedDB | 禁止 | 繞過 origin 隔離並增加 token 外洩、任務錯綁風險。 |
| 合併 origin 或要求重裝 | 不採 | 破壞 DEV-131 的雙 PWA identity 與既有安裝。 |
| 自製 token broker／第二次 Google 登入 | 不採 | 增加自有憑證服務或重複登入，沒有必要且偏離免重輸帳密目標。 |
| Supabase OAuth 2.1 public client + PKCE | **採用** | 官方支援 public client 與 PKCE；符合兩個獨立 origin，並可用簽章 token 的 `client_id` 建立 server-side 權限界線。 |

## 實作邊界與驗證 Gate

Supabase OAuth 2.1 Server 目前為 public beta，官方文件列為各方案可用，但必須由專案管理者在 Dashboard 的 Authentication > OAuth Server 啟用後才會提供 OAuth endpoints。啟用以外，還須設定 Site URL 與 Authorization Path，並登記 public OAuth client 和精確 callback URI；主程式需實作承接 `authorization_id` 的 consent UI。Supabase OAuth client 的 code exchange／refresh 需自行實作，不能把 `supabase-js` 當成完整 OAuth client。這些是實作風險，不是尚未選擇的架構。[官方 Getting Started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)。

**B0（實作前可行性 Gate）**：只在授權的 ProJED 隔離 TEST 資源讀回並驗證 OAuth。初始 readback 顯示 `oauth_server_enabled=false`、Site URL 指向隔離 Level 3 smoke 網址、allowlist 缺少 canonical quick callback；依使用者授權，本輪暫時啟用 TEST OAuth Server、設定 localhost consent/callback URL 與 public client，完成桌面真實首次 consent、PKCE callback、同一 TEST user 核身及 refresh rotation。重複授權回到同一 callback／user，但 consent UI 是否略過無法確證；live denial 因既有 grant 未抵達拒絕 consent 畫面。測後 TEST Auth config 回復測前值、臨時 client 已移除並 readback 確認，正式環境未觸及。ADB／Android 裝置不可用，兩個真實安裝 PWA 的首次／再次使用、取消、回跳、主程式 signOut／切帳與 owner 保護仍未驗；故 B0 完整 Gate 尚未 PASS，B1 未執行。B1 已取得條件授權，但僅在 B0 完整通過後才開始。若平台設定不可用、callback 不能回原 PWA 或同帳號不能成立，停止資料權限 migration 並重新審查 ADR；不改用 token 複製或第二次 Google 登入。

**B1（TEST 資料權限 migration 與矩陣）**：B0 consent entry、quick OAuth token lifecycle 與 Android identity round-trip 已通過後，且取得 migration 範圍授權，才實作 allowlisted client ID 與受控 RPC／RLS migration；用真 OAuth token 驗正確 quick client 可建立且 receipt owner 相符，錯 client／匿名／錯 owner／直接 Data API 讀寫全部拒絕，主程式一般 session 回歸通過。B1 通過前不宣稱雙 App 同帳號與自動同步完整交付。正式設定、資料或發布另受明確環境授權與 release gate 管制。

## 重新審查條件

- OAuth callback 無法回到原 Android PWA，或 AuthGate 無法安全保留同一 `authorization_id`。
- 無法把 quick OAuth token 權限限制在受控 quick-create RPC，或 function 的 SECURITY DEFINER 邊界不能經 code review／negative tests 證明安全。
- 同一 user identity、refresh／切帳號 fail-closed、receipt owner 等核心條件不成立。
- 需要改變 origin／manifest identity、增加通用 broker、擴大資料權限或承諾即時跨 App 登出。

## 架構審查紀錄

2026-09-30 已檢視 quick capture auth／outbox／sync、主程式 AuthGate 與 Google redirect、兩份 manifest、DEV-122 migration、DEV-131 雙網址基線及既有 QA。架構固定 protocol、session 所有權、資料流、最小權限、本機清理、恢復、修改面與 B0/B1 停止條件。B0 source/mock 10/10 `SIMULATION PASS`；另在使用者授權的 ProJED_TEST 完成桌面真實首次 consent／callback／same-user／refresh rotation 部分驗證。由於已保存 grant，重複 consent UI 是否略過及 live denial 未確證；Android 雙 PWA Gate 未驗。測後 TEST Auth config 已復原 baseline、測試 public client 已刪除並 readback 確認；B1 migration／真 token 權限矩陣未執行。這是定案架構及部分本機／桌面證據，不代表完整雙 App 交付或正式環境設定。

官方依據（2026-09-30 查閱）：[OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server/)、[OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)、[Token security & RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)、[同源政策](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)。
