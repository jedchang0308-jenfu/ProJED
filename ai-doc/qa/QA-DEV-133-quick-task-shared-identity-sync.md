# QA-DEV-133：雙 App 各自登入／依帳號同步／本機清理

### 2026-10-01 正式同步核心驗收（REL-014）

**已發布且正式功能驗收 PASS；Git 遠端交付待目的地確認。** 本次只代表 clean release source `8376086144b31155a94477e6bea1f929ded475be`，不包含工作樹後續 `conditional-recovery-entry`／`unified-sync-status-panel`、視覺降噪 UI 或本機待同步任務名稱清單。UI 已另以後續 `20261001074739-df101c` 正式發布，下節為最新結果；未混入原核心包。發布、復原與完整來源見 [REL-014](../release/REL-014-DEV-133-INDEPENDENT-AUTH-20261001.md)。以下發布前完成審核表及 TEST／早期 OAuth 段落保留其當時事實，不覆蓋本節正式結果。

不可變 release `20261001061118-144be8` 的 54 個檔案，在正式 `web.app`／`firebaseapp.com` 各核對 54/54；tree SHA-256 `945f9a7a26f9c2ad7a9c416b819b3e921230eff47ad086dbf8783dc9120303cb`。11 個核心 source 與最後 frozen TEST 相符；同 commit 的 HTTPS TEST 22/22 功能、官方啟動及 53/53 package 核對 PASS。正式受控普通 Google Session 40/40 功能、官方 canonical 啟動及 safe-cancel callback PASS。PROD RPC 原已符合 canonical invoker／空 search_path／原 ACL/RLS，correction 選擇綁定為 NO_OP，沒有正式 DDL、IAM／Secret 擴權或業務資料改寫。

| 契約 | 最終覆蓋與證據層 |
|---|---|
| N01／N02 | 真 TEST A/B 普通 Session、正常 UI／RPC／唯一工作台及跨帳拒絕；正式同帳號兩 origin 不同 Session、quick Google callback、正常建立→工作台、同 ID 唯一 row、reload 後 Session／row 保留。 |
| N03／N04 | 真 TEST 與正式 page-scoped offline：本機保留原 owner／captureId，回網自動同 ID 同步且工作台唯一。IME、500 code points、IDB abort/readback/CAS、timeout／8次重試依原 browser／注入案例，不稱全部 hosted。真麥克風／辨識服務未驗，與本次 Auth／同步修改分開。 |
| N05／N06 | 普通 TEST Google picker Back 取消及重登、明確 claim／取消；401／refresh failure、nonce／CAS／切帳與 late response 的故障注入證據保留層級。正式官方 ordinary Google safe-cancel callback 回 canonical origin。 |
| N07 | TEST main local logout、雙 origin local logout；正式 quick 正常登出 CTA 清除自身 Session，main 原 Session 仍可 getUser=200。沒有宣稱全域撤銷即時連動。 |
| N08 | TEST 真 A/B JWT＋非空 task 的雙向 SELECT／UPDATE denial、同 ID replay/conflict、private receipt 不暴露、correction 後 7/7；缺依賴／foreign workspace 的 SQL 負例和 UI 注入依原層級。正式兩筆同 ID receipt／task 各唯一，不宣稱整個 ProJED API 或所有負例都做了 hosted 重演。 |
| N09 | 6／8／40日、legacy／corrupt receipt、交易中止及競態以隔離 browser/IDB 時間 fixture；真 TEST server task／receipt 留存。規格是閾值與交易保護，不需等待真實七日才證明閾值；不宣稱已觀察七日排程。 |
| N10 | 既有 v1→v2／rollback／SW update 相容案例；PROD NO_OP hash 與 sealed package 綁定、兩 origin script／release 身分、390／726 無溢出。主程式舊 cached document 透過既有「清除快取後重整」正常 UI 復原，新 release／原 Session／canonical capture IDs 保留；不稱自動 PWA 更新通過。Android 實機已由使用者取消。 |

終端收據：`output/qa/dev-133/independent-auth/production/terminal-evidence.json`；正式 feature：`production/feature-smoke/result.json` 40/40（pending=0）；工作樹 package：`output/release/dev-083/20261001061118-144be8/activation-resume-evidence.json`。首次 CDN metadata hash FAIL、三次舊 PWA／harness timing FAIL 保留原報告；沿用原包、同主 captureID 復測，未重部署或製造重複 primary。最終 result 仍有舊 retry 的 `failureFirstLine`，僅為歷史欄位；最終 status／errorKind／40 cases 及收據一致為 PASS，沒有改寫原報告。

cleanup：task-owned Chrome PID 37180 已退出，4195／4173／4174／4175 無 listener；兩筆正式受控任務均已同步、profile 保留。精確 TEST callback 已還原讀回；本次 level3／candidate preview channels 已移除，live version `0aae27354f796317` 未變。較早含未同步資料的失敗 profile 及使用者瀏覽器／4000 保留。release worktree 暫留供 Git review／證據交付，cleanup owner 為 DEV-133 root。


### 2026-10-01 最終統一同步狀態 UI 正式驗收

**Rev 9 統一 UI 已正式發布並通過相稱驗收。** UI source `9b5f73a1b32bdd8dc984c3017dceaf7225967d40`／release `20261001074739-df101c`；雙正式 origin 各54/54及正式匿名 UI10/10 PASS。本機 UI25/25（真browser／IDB＋Auth/RPC SIMULATION）、型別及 targeted lint PASS，source/UI digest `29cff0bb616834eceb36af1a06e1102092eb5db3fd2cb24edcb2aff6998ffd0f`。原 `8376086` 普通 Auth／同步40/40僅作未變核心的重用證據，不改稱本次實測。首兩輪 harness FAIL 與空值型別 FAIL 保留，沒有覆寫成 PASS。新收據 `output/qa/dev-133/independent-auth/production/unified-ui-release/terminal-evidence.json`，本機收據 `output/qa/dev-133/independent-auth/unified-status/1790840255628-29cff0bb/local-evidence.json`；無正式任務寫入、migration或遠端Auth設定變動，task-owned browser／ports已清理。

以下 UI「未驗收」段落保留當次歷史快照；最終候選及其後續正式 UI 發布以本節為準，REL-014 原正式包仍排除這些 UI 變動。

### 2026-10-01 最近狀態與恢復入口整併（未驗收）

最近任務狀態／名稱及待處理恢復摘要已收進同一可展開容器；最近任務從其他介入任務數排除，同帳號正常自動同步仍不列為人工恢復。這是新的工作樹 UI slice，尚未重跑 browser 或其他驗收；以下 PASS／FAIL 與執行結果保留原候選版本事實。

### 2026-10-01 收合入口視覺降噪（未驗收）

收合入口改為透明無框、低對比樣式，筆數與標籤同行顯示，並保留 44px 操作高度；最近任務狀態／名稱維持較高可讀性。本次未執行 browser 驗收，以下歷史結果不代表 Rev 6 UI scope PASS。

### 2026-10-01 預設展開（未驗收）

容器首次出現時預設展開；使用者手動收合後，狀態刷新會保留收合狀態。確認同步仍需明確操作。本次未執行 browser 驗收，Rev 7 UI scope 尚未驗收。

### 2026-10-01 未登入狀態提示色彩（未驗收）

「此快速 App 尚未登入」改為紅字，其他登入驗證及網路狀態提示維持一般提示色。本次未執行 browser 驗收，Rev 8 UI scope 尚未驗收。

修訂：**2026-10-01 Rev 9（REL-014 同步核心及後續統一 UI 已正式發布／驗收 PASS；Git 遠端交付待確認）**。來源為使用者採用「共用帳號、各自登入、各自保存 Session、離線任務依帳號同步」。依 [SPEC-133 Rev 9](../specs/SPEC-133-quick-task-shared-identity-sync.md) 及 [ADR-053 Rev 3](../decisions/ADR-053-quick-task-cross-origin-account-link.md) 驗收；[DEV-133](../dev_task.md#dev-133-快速建任務同帳號與自動同步---2026-09-30) 維持執行中，僅 Git 遠端交付待完成。各輪歷史與證據層級依上方最終結果判讀。

## 新版範圍與證據規則

- 正常登入採既有 Supabase／Google provider，驗證兩個 origin 各自 Session；不再要求 ProJED OAuth Server／public client／consent 或舊 B0／B1 Gates。Google OAuth 登入與 callback 安全仍須測，不因名稱含 OAuth 就刪掉。
- TEST 為既有授權的 `fhisnnufoeulxqrchldf`；正式資源範圍沿原授權，正式操作按實作及 release gate。最新固定候選已完成 B0 gate、TEST correction、ordinary A/B 及 post-correction 矩陣；RPC／RLS metadata readback 單獨不算行為 PASS，逐項範圍見本 QA 最新審核表及 `cross-account-integration/1790830360462-b8d304f5/` 去識別化報告。
- 使用者已取消實體 Android 驗收。窄版 Chrome／手機模擬可驗版面與操作，不能稱 Android PWA 實機 PASS；取消實機不等於省略真實登入／RPC／工作台與 owner 驗收。
- 舊 A 本機 evidence 只有在 source／fixture／case 路徑仍相符時才可重用；舊 OAuth mock、桌面 B0、synthetic JWT 不能替代新方案真實憑證。舊 v2 只保護 quick 表，並非整個 ProJED API 的隔離證明；空表 SELECT 回 0 也不能證明隔離。

## 新版 fixtures 與正常入口

受控 TEST 使用者 A／B，各有有效 workspace membership 與可操作的全域任務工作台。兩個隔離 browser origin/context 分別代表主程式及快速 App；同帳號測試也保留不同 Session。測試前用唯讀盤點確認 fixture；DB seed 只建立案例前置條件，目標任務必須由正常 quick UI 的「建立」產生。

IDB fixture：DB v1 原始 captures及 DB v2 auth_context；unbound、A-bound pending／failed_auth／failed_retryable／failed_permanent、B-bound pending、6／8 日 synced 與 40 日未同步資料；每筆有唯一 captureId；另有舊 synced 無 receipt、有效／錯 hash receipt、context 登出 barrier及 projectRef 不符樣本。網路、Auth 401、timeout／錯 receipt、lease、晚到回應可作隔離故障注入，需另標 SIMULATION，不替代真實服務結果。至少一例用真實普通 Session 及正常工作台操作證明端到端成功。

入口：既有安裝入口／root shortcut／quick 頁 → 名稱／內嵌語音 → 建立；獨立「登入」入口 → Google → 原 quick origin；待處理入口 → 明確目的帳號認領／稍後處理；「前往工作台」→ 主程式自己的登入及全域任務工作台。主程式登入 B 時不自動切到 quick A。

## 新版驗收案例

### 2026-10-01 恢復入口精簡的局部驗收

來源：使用者核准「只在需要介入時出現精簡入口，移除一般狀態說明與處理／稍後處理雙按鈕」。本 slice 為 Medium；相容 SPEC §5、§7 的 owner／明確認領／人工恢復，不改資料模型、RPC、清理及遠端設定。N01～N10 的真實整合狀態沿用原紀錄，本地注入不替代它們。

最小風險／驗收：正常待送被誤當人工操作 → pending／syncing／failed_retryable 無入口；未綁定任務無法找到 → 單一待確認入口可登入後確認；切帳／稍後／重開造成錯綁或消失 → A/B／nonce／raw IDB 查證；無效回執或衝突被盲目重試 → 無重試 CTA；其他帳號 title 洩漏 → 不含內容提醒；窄版／鍵盤不可操作 → 320×844、390×844、614×668、44px 目標、Enter 與可見錯誤掃描。

執行入口：`scripts/verify-dev-133-recovery-browser.cjs`；重用 user-owned `http://localhost:4000`，只啟動隔離 browser contexts及 task-owned BrowserServer。Auth／RPC 以 module route 注入，真 browser UI／IDB 的確認、重試結果由正常按鈕產生；不連 TEST／正式 Auth／RPC，也不讀寫使用者瀏覽器資料。runner 於 finally 關閉 contexts／BrowserServer，核對該 PID 退出與 socket port 釋放，保留 4000 及使用者分頁。結果與候選 source SHA、browser version、viewport、截圖、cleanup 存在 `output/playwright/dev-133-recovery-entry/result.json`。

本輪結果：**局部 UI／IDB 驗證 PASS；Auth／RPC 為 16/16 SIMULATION PASS**。`npx --no-install tsc --noEmit`、targeted ESLint PASS；normal UI 建立、一般自動同步無手動入口、4 筆 unbound 精簡入口／登入焦點／輸入收起、認領稍後／重新開啟／同 ID 確認、切帳重新確認、重開不認領、8 次耗盡人工重試、workspace／profile（23503）恢復、conflict 禁止重試、其他 owner 內容隱藏、重新登入、確認途中切帳及 nonce 過期及確認途中稍後處理均通過。614×668、390×844、320×844 的實際 screenshot／量測無水平溢出、入口最小 44px；614 的目的帳號確認畫面已目視檢查。browser errors／外部 requests／HTTP failures 均 0。

執行基準：branch `持續優化3`／HEAD `8d9aa1ad85adef40721df3ea38b00403ca6ddcb3` + 本輪未提交的 `main.ts`、`quick-task.css`、`outbox.ts` 及 verifier；各 source SHA、browser version及截圖細節見 result.json。只補齊 SPEC 既定的 profile 依賴恢復人工重試，不允許 conflict／invalid receipt 重試，不改 owner／captureId。測試 BrowserServer PID `26964`／port `57273` 已退出／釋放；重用的 user-owned 4000 保留。其他既存 dirty changes及前輪成功卡按鈕移除／安裝文字修改保留。

首個工具失敗保留：內建 browser kernel 啟動 Windows error 5；改用同 route 的隔離 Chrome。第一輪 12 案互動通過但整輪 FAIL，原因是 fixture init script 在 about:blank 初始化時觸發 IDB 拒絕；原始紀錄為 `result-first-harness-failure.json`，該 BrowserServer PID `4492`／port `54449` 已退出／釋放。修正 harness 僅在有效 origin 初始化後重跑最終候選，沒有忽略 browser errors。未讀取使用者截圖中 4 筆的實際資料，也沒有執行真實 Google／hosted RPC／工作台驗收；本結果不將 N01～N10 或整體 DEV-133 標為完成。

下列 N01～N10 為完整驗收集合；最新跨帳整合 29/29 assertions、B0 gate、TEST correction readback 與 post-correction 7/7 已通過，但未涵蓋項目及正式 release 尚未完成。以本文件最新審核表的逐項覆蓋／缺口為準，不把 assertion 總數直接搬成整組 PASS。

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

真 TEST 前置不足時記 `NOT RUN / fixture or callback prerequisite unavailable`，只停止依賴該前置的 case，繼續本機／DB／型別驗證；不能重啟舊 OAuth Client／Android Gate。actor-readiness verifier 已實作，但完整 N01～N10 runner 與證據仍須補齊。新 evidence 統一放 `output/qa/dev-133/independent-auth/` 並記 source／artifact／route／actorAlias／實際操作；預期 TEST 任務名稱使用測試前綴，cleanup 僅限本輪已同步 fixture，不清任何未同步資料。

`npm run verify:dev-133-test-actor-readiness` 是 actor 前置檢查。它只接受完整 HTTPS TEST hostname `fhisnnufoeulxqrchldf.supabase.co` 及 public key；只從 `.env.test.local`／`.env.local` 讀取 allowlisted TEST 參數，不使用 generic env loader、production service-role key 或管理 token 作 actor。預設模式使用兩個普通 password session；A 可沿用 `VITE_SUPABASE_TEST_EMAIL/PASSWORD`。Google B 改用 `DEV133_TEST_ACTOR_B_EMAIL` 加 `--browser`，由正常 quick 登入 CTA、Google callback及網路 `getUser` 核身，不要求或保存 Google 密碼。對 profile、active membership及非空 workbench 唯讀檢查，並確認兩個 user ID 不同與 readback 期間 Session 未變；token／email／user ID 不寫入報表。Google runner 的管理 token 只用於已授權 TEST 的精確臨時 callback，結束還原並 readback；不作業務 API 身分。`verify:dev-133-actor-readiness-contract` 驗 hostile URL、production/admin env 排除、privileged key拒絕、same-actor拒絕、切帳與資料查詢失敗，屬隔離回歸證據。

### 2026-10-01 跨帳整合執行計畫

執行 `node scripts/verify-dev-133-test-actor-readiness.mjs --browser --integration`；指定 B 的 email 由環境變數提供，不寫入 artifact。先核實 A/B 普通 Auth、profile、active membership 與非空工作台，再於同一 task-owned Chrome profile 連續跑案例，避免前置完成後清掉 Session 才要求重新登入。TEST origin 為 `127.0.0.1:4173`／`127.0.0.1:4174`，CDP 僅 loopback `4175`。精確臨時 callback 僅加入已授權 TEST，結束還原並讀回；不涉及正式設定或部署。

| 整合案例 | 對應與證據邊界 |
|---|---|
| E01～E07 | A/B 普通 Session、正常 quick UI 建立、owner receipt／唯一 row、互相 SELECT／UPDATE 拒絕、匿名拒絕、並行 replay／title conflict、正常工作台 CTA 及各自任務可見。補 N02／N08；本機 CTA 同 origin，不代替正式跨 origin redirect 驗收。 |
| E08～E09 | 真 browser 斷網後 B-bound 本機保存且 RPC=0；回網自動以同 ID 同步且工作台唯一。補 N03／N04。 |
| E10～E13 | RPC outage 注入保留 B 待送；登出新記錄 unbound、切 A 不送 B／不自動 claim；正常 UI 認領取消、重開、明確 A claim；B 重新普通 Google 登入才續送 B 原 ID。補 N05／N06；outage 是 simulation，其餘 Auth／RPC 為真 TEST。 |
| E14～E15 | 相同 B 在兩 origin 各自普通登入、Session fingerprint 不同；quick local logout 後另一 origin 仍可網路核身且 logout barrier 跨 reload 保留。補 N01／N07，不代替 SDK logout 失敗／晚到回應注入。 |
| E16～E18 | 320／390／726 viewport 溢出、截圖、可見錯誤及兩 origin captures 全 synced 後才清 profile。補 N10 的 UI 部分。 |

每次紀錄 HEAD、dirty boundary 與 source SHA256，執行前後比對；最後改從 repo 公開 source／config 的固定快照執行，避免其他開發的 HMR 混入。快照不含 .env、憑證、.git 或 node_modules，依既有依賴執行，不安裝新套件。測試失敗保留原 assertion 與去識別化錯誤位置。只有兩 origin raw IDB 全 synced 經讀回才可刪 task profile；未同步或不可確認時關閉 task runtime／UI、保留 profile 並記後續恢復責任。新 TEST task fixture 會保留以供唯讀回查，不修改既有業務資料。完整 N01～N10 仍需補 401／refresh、late response、timeout commit、錯 receipt、nonce／CAS、retention、DB upgrade、更新／bfcache、canonical schema 等邊界；此補充計畫通過不能直接宣告 B0／DEV-133 完成。

### 2026-10-01 跨帳整合結果

**固定快照的 E01～E18 整合套件 PASS：23 項 assertions**，含 E04 雙向 UPDATE、E16 三個 viewport 及 2 項先前 fixture 恢復檢查。A/B 以普通 Auth 網路核身並有非空工作台；正常 quick UI 建立各自任務，嚴格 owner receipt／唯一 row、互相讀不到及改不到對方 task、匿名拒絕、並行 replay／title conflict、正常工作台 CTA 各自可見且不顯示對方任務均 PASS。實際 browser 離線時保存 B owner／RPC=0、回網自動原 ID 同步 PASS。RPC outage 注入後，切 A 保留 B pending／不自動 claim unbound；正常確認取消、reload 後明確 A claim、普通 Google 重登 B 才恢復 B 原 ID，以及 B 兩 origin 不同 Session／local logout 不登出另一 origin均 PASS。沒有忽略非預期 quick pageerror。

執行基準 HEAD `8d9aa1ad85adef40721df3ea38b00403ca6ddcb3` 加上記錄的 dirty boundary；固定快照 362 files，digest `d0f0f2f978fdcef19379a788547d7b7f4e79e7671a426e0903fae9e297fcfafe`，前後 source hash 一致。Chrome `154.0.8037.58`；source 模式 Vite runtime，不是發布 bundle。A／B 身分、token、title 不寫進 artifact；去識別化結果見 [result.json](../../output/qa/dev-133/independent-auth/cross-account-integration/1790818543791-2a0bc7dd/result.json)／[browser-result.json](../../output/qa/dev-133/independent-auth/cross-account-integration/1790818543791-2a0bc7dd/browser-result.json)，source-manifest 與固定 candidate 同目錄。320×844、390×844、726×844 無水平溢出；320 截圖已目視檢查。登入狀態／任務欄已遮蔽，故截圖只作排版證據，不推論完整身分狀態可辨識或實機鍵盤 PASS。

清理：[runtime.json](../../output/qa/dev-133/independent-auth/cross-account-integration/1790818543791-2a0bc7dd/runtime.json) 記錄 TEST 精確 callback 還原並讀回、task Chrome／Python／Vite 結束；4173／4174／4175 確認釋放，PID 31308／32032／37088／41440 均已退出。兩 origin raw captures store 所有記錄 synced 後才移除 TEST profile；quick origin 12 筆已同步測試副本，另一 origin 自身已同步 fixture 亦讀回。前次 pending／unbound 經正常 UI 明確認領或原 owner 自動續送，保留原 ID；TEST server fixture 保留，不刪使用者未同步資料，也未操作 user-owned 4000 或正式站分頁。本輪沒有 TEST migration／正式設定／部署。

原始失敗保留且不計整體 PASS：首輪 harness 誤以無 accountId 的 owner-filtered list 作 raw readback，A server task／receipt 已存在，但本機同步狀態未建立證據；其 `allCapturesSynced` 結論無效，見 [first-attempt-assessment.json](../../output/qa/dev-133/independent-auth/cross-account-integration/first-attempt-assessment.json)。修正後第二輪因沿用已移除的中間恢復按鈕且 source 在 HMR 中改動，為 FAIL／來源未固定；後續快照首輪因未先恢復上次 unbound fixture、確認了較早一筆而 timeout，同樣保留 FAIL。另一次恢復卡在 Google email 子節點的 pointer overlay；改點指定帳號的實際選帳列，不繞過核身、不取得 Google 密碼。最終套件先恢復本輪舊 fixture，再執行新案例，沒有調弱 owner／唯一性／取消保留 assertion。

**覆蓋與剩餘：** N01／N02／N03／N04／N05／N06／N07／N08／N10 均為部分證據，N09 本輪未重跑。尚缺主程式正常 logout／正式跨 origin callback／取消、核身 401 與 refresh 失效、SDK logout 失敗 barrier、late response、已 commit timeout、錯 receipt、workspace hint／無 membership、nonce／CAS 競態、retention／DB upgrade／bfcache／更新與 TEST correction schema。其他恢復入口 slice 的隔離 SIMULATION 按原證據層獨立保留，不轉換為 live Auth PASS。**DEV-133 仍執行中；E 套件 PASS 不等於完整 B0／N01～N10、TEST correction gate 或 Release Ready。**

### 2026-10-01 邊界續驗與修復

使用者要求繼續完整 N01～N10，既有開發／TEST／Git／正式授權延續；沒有再次要求 migration 或部署授權。前次 E 套件後停止是執行未接續，不是上述邊界不能驗。此輪維持 TEST correction 必須在新 B0 完整通過後執行；同一 executor 先 RD 修復、再以固定 snapshot 作 QC，沒有宣稱獨立人員審查。

| 證據 | 結果與实际覆蓋 |
|---|---|
| [56 項 browser／IDB 邊界結果](../../output/qa/dev-133/independent-auth/boundaries/1790825198398/result.json) | PASS。真 Chrome／IDB，Auth／RPC／語音為注入：401、三個 SDK refresh／Session 消失路徑、15 秒 deadline、logout 失敗 barrier、跨 tab dispatch／首次 context CAS、nonce／claim／lease競態、嚴格 receipt／hash、8 次 retry耗盡／人工恢復、8 日／6 日／40 日清理與 abort、v1 blocked／abort／v2恢復、舊 OAuth cache及project drift拒絕、IME／500 emoji／同 ID readback／CSPRNG失敗、bfcache一份subscription及daily timer、320／390／726與可見錯誤。 |
| [建置後真 SW 離線及zero-read 9 項](../../output/qa/dev-133/independent-auth/bundle/1790827939524/result.json) | PASS。最終 CSPRNG catch／縮排修復後的 TEST public-only bundle，真 Service Worker控制後斷網建立、route重載／IDB保留、Tab順序及390×480鍵盤縮小viewport。初始冷啟動與unbound保存沒有business API request。固定source digest `afa3b29926515d5c8992891e7eb8dbc9911be19e2401cef58e6faf5f3faf71b7`、driver另凍結hash；profile保留synthetic unbound fixture，未刪待送。這是TEST bundle，不是正式發布包；先前7項PASS保留。 |
| [真 TEST A 補驗 12 項](../../output/qa/dev-133/independent-auth/live-auth-boundaries/1790824947886/result.json) | PASS。普通SDK登入及getUser、真離線回網原ID、真RPC已commit後中斷回應再created=false／唯一row、真local登出後delay回應僅完成原owner、重新普通登入、真Auth token endpoint拒絕故意無效refresh token且停止binding、原ID恢復，以及8日有效receipt本機清理後server task／immutable receipt仍可readback。傳輸中斷／delay／503另標注入，不冒稱B切帳或Googlecallback驗收。 |
| [正常主程式 local logout 4 項](../../output/qa/dev-133/independent-auth/live-auth-boundaries/1790826916948/result.json) | PASS。兩個 loopback origin 各自普通 TEST A SDK 登入、不同 Session ID，透過主程式正常 UI 展開側欄並按「登出」，主程式 SDK Session 清除，另一 origin 仍真 `getUser` 核身成功，無可見 browser error。不建立 task；兩 origin 使用同一帳號，不冒稱指定 Google B 或正式 HTTPS origin 驗收。helper 初始 `allCapturesSynced=false` 不代表有 pending；profile 刪除前以 raw store 空集合證明沒有 capture。 |
| [fresh canonical DB](../../output/qa/dev-133/independent-auth/database/fresh/db-isolated-result.json)／[retired boundary upgrade](../../output/qa/dev-133/independent-auth/database/upgraded/db-isolated-result.json) | 兩條PASS；各22項核心matrix＋U+200B／500codepoints／缺profile-membership／同ID恢復／foreign hint／receipt ACL補充；各20個並行quick writer及40個quick＋placement mixed writer，order唯一／無lost write。僅新建loopback PostgreSQL及SQL claims，不替代hosted ordinary JWT矩陣。 |
| [真SW更新／v2相容回復10項](../../output/qa/dev-133/independent-auth/built-update/1790828604132/result.json) | PASS。固定A／B bundle、各自SW／manifest／shell hash；同origin先存unbound及synthetic A/B pending，worker waiting時及A→B→A實際啟用後，raw owner／ID／title／state全部不變、DB維持v2。無business dispatch、無可見錯誤，root／quick manifest identity不變。兩包quick核心source相同，本例測shell／SW版本更新；DB v1→v2另由56項覆蓋，不冒稱真正Android、發布或其他舊版client相容。關閉全部task-owned App頁面、保留browser程序讓waiting worker正常啟用後再開頁。原三個FAIL `built-update/1790828360670`／`1790828425091`／`1790828505700`在立即終止Chrome程序後過早查驗版本，原結果保留；沒有改產品或調弱B版本斷言。所有profile及synthetic pending保留，4194已釋放。 |
| [DEV-122原功能回歸](../../output/qa/dev-133/independent-auth/regression/static-result.json)／[SW回歸](../../output/qa/dev-133/independent-auth/regression/sw-result.json) | 25項static及12項SW PASS，candidate outDir綁定最終修復bundle；migration aliases 65/0 PASS。初次static的S15為舊dist、S21為舊owner恢復函式寫法，FAIL另存`regression/initial-static-result.json`。改為指定bundle及既定context owner fallback，不放寬owner／synced保護；原有其他DEV修改保留。 |
| 型別／契約／lint／parse | TypeScript、targeted ESLint、independent-auth contract、16項actor-readiness isolation及Python AST通過。 |

主程式logout原始FAIL保留：`live-auth-boundaries/1790826131852`／`1790826375747` 的測試未先展開收合側欄；修正為正常UI展開，不繞過操作。`1790826780186`／`1790826853812` 在普通登入前被環境網路限制阻斷（token response無狀態，Node連線另回EACCES）；依原TEST授權在可連網執行環境重跑才取得4項PASS。未降低Session獨立性斷言，沒有因這些harness／環境失敗修改主程式。

真實發現與修復：殘留Session可清除logout barrier；refresh失效後仍可綁舊owner；claim／retry與context交易未完全CAS；同ID readback重試可能產生重複；lease finish未直接核對原title SHA-256；清理只看時間／state而忽略競態內容；blocked open不拒絕；500合法emoji被HTML UTF-16 maxlength截短；bfcache未恢復訂閱；Auth outage原本多一次自動check；CSPRNG失敗使表單鎖住。已按SPEC契約修復，保留原owner／未同步資料，不改server業務資料。

失敗保留、不折算PASS：`boundaries/1790821207988`初輪、`1790823566620`首次context／ACL分類、`1790823908278`第9次Authcheck、`1790824398337`三個refresh邊界、`1790825120692`CSPRNG／pageerror，均於相同父目錄保留原FAIL。較早layout/readback fixture及deadline加速器的harness失敗亦保留，修正的是測試前置而非降低產品斷言。`bundle/1790822873900`為Rollup輸入路徑FAIL；當時finally錯印PASS，現已修runner以實際build／driver exit判斷，該輪不得作PASS。`live-auth-boundaries/1790824849532`因新driver不在snapshot allowlist而未啟動，修正為獨立凍結driver＋hash後12項PASS。

56項來源：HEAD `57f8c8d`加完整dirty boundary，固定snapshot／cases hash見同目錄runtime及candidate/source-manifest；CSPRNG修復後只有縮排整理不改語意。320×844、390×844、726×668截圖已目視，無水平溢出，登入入口／任務欄／語音／建立可達。本輪temporary4183／4185／4193／4194及兩個PostgreSQLport已釋放、cluster刪除；A補驗所有raw captures已synced讀回才清profile，server fixtures保留。user-owned4000／正式站分頁不動。

**較早 live 嘗試失敗保留，不折算 PASS：** `1790829318100-8365543d` timeout；`1790829774308` readiness race（invalid context／probe 過早啟動）；`1790829840638` 與 `1790830079018` 晚到 `RouteAlreadyHandled`。harness 後續只修正啟動前 context/UI readiness 與完成等待順序，產品 source 及斷言未放寬。較早登入等待／resume 輪次仍按各自 artifacts 保留；最新成功證據另見下方 2026-10-01 最新 TEST integration，不能以舊失敗覆蓋新結果。

Git交付邊界：本輪不stage／commit其他人的UI／install／settings變更。DEV-133包含quick-task/index.html、quickTaskCapture的model/auth/outbox/sync、quickTaskCaptureService、main.ts的Auth／提交／生命週期修復、邊界／bundle／SQL／live驗收腳本及SPEC／QA／dev_task／documentation_map續驗段落。root shortcut 的 `name`／`short_name` 兩欄及 `AppInstallAssistant` 的 quick 名稱文案僅作既有名稱契約對齊；不包含 DEV-132 install／notice 行為、Settings UI 或安裝助理自動提示功能。main.ts／outbox.ts有原有recovery UI／retry變更，拆提交前須對照 `boundaries/1790821207988/candidate` 初始snapshot保留；其他既存dirty（DEV-034／038／130／132及無關App／Settings／install變更）排除本輪交付。HEAD仍為57f8c8d，index空；目前是記錄明確範圍的dirty worktree，尚無可發布的乾淨commit包。

使用者附圖的 `projed-cc78d--level3-smoke-p4rhm931.web.app` HTTP404／Site Not Found，Firebase channel list目前只有live；正式 `projed-cc78d.web.app` HTTP200。未重建消失的舊preview、未發布或清除已安裝App資料；不得把該預覽網址視為本輪TEST登入成功。

### 2026-10-01 完成審核：逐項證據與剩餘

此表對照本文件N01～N10原要求，不以assertion總數取代完成判定。TEST B0 與已列明的 TEST 行為證據通過；DEV-133 Gate 仍未通過，因正式 source scope／sealed package、部署及正式 smoke 尚未完成。

| 要求 | 現行可追溯證據 | 尚未證成的範圍／下一步 |
|---|---|---|
| N01 獨立登入／重開／狀態 | 最新 E01、E14～E15：TEST 普通 A/B Session、Google callback 及兩 origin 隔離；PROD preflight：owned Chrome 4195 普通 Google login，`/auth/v1/user`=200 且 actor／SDK user／Google identity 三項 match | production Google login 身分前置已 PASS；quick-task production callback／獨立 Session 持久化及 PWA 重開仍待正式 smoke。 |
| N02 UI建立→唯一工作台／不同帳號 | E02～E07、E10：正常 UI 建立／receipt／工作台、A/B 隔離及切回 owner 通過；post-correction A/B SELECT／UPDATE denial 另見 7/7 報告 | production origin 的完整 UI→工作台往返仍待正式 smoke；本輪只證明 TEST。 |
| N03 本機建立／owner／輸入 | E08～E09、E22、E24：owner／離線／同 ID 恢復、U+200B 真 TEST RPC 與 receipt；既有輸入及 IDB 邊界案例保留 | 語音為 SpeechRecognition 事件注入；真麥克風及辨識服務轉寫未驗。 |
| N04 回網／timeout／8次／稍後 | E08～E09、E23：B same-ID resume、真 commit 後 transport-loss replay 無重複；既有退避／8次注入仍屬本機案例 | 不承諾 App 關閉後背景同步；退避與耗盡情境未用實際長時間網路故障等待。 |
| N05 401／refresh／切帳保留 | E19（401 注入）、E20（普通 Google relogin）、E11（取消 claim 保留資料）；正常 Google picker 的 browser Back 取消登入 21/21 PASS | production callback／取消登入流程尚未部署驗；401 案明確為注入層。 |
| N06 明確認領／nonce／CAS | E11～E12：取消後保持 unbound、明確認領後 same-ID；nonce／CAS／雙 tab 邊界另有隔離案例 | nonce 過期／重播／競態仍是本機／注入證據；未以 TEST 外部真實競態驗證。 |
| N07 local logout／late response | E15、E21～E22：origin 登出隔離、B 晚到回應不變成 A 成功、延遲 capture 保持 owner | 不新增或宣稱跨 origin 即時撤銷 global logout。 |
| N08 receipt／ACL／無依賴／並行 | E03～E06、E23～E24；correction 後 7/7：A/B 非空 task 讀回、雙向 SELECT／UPDATE denial、private receipt schema 不暴露；TEST invoker／空 search_path、task／receipt ACL 與 receipt RLS 讀回未變；PROD prosrc MD5 `3ef7e8731dd6893594e0d66918ddfe16` 為 invoker 且 ACL 與 TEST 一致 | 尚未跑 foreign workspace hint／profile-missing recovery 完整 hosted 矩陣；此證據不代表整個 ProJED API 隔離。 |
| N09 七日清理／race／server保留 | E25 safe local cleanup；既有 server task／immutable receipt 留存與清理 race 案例 | 8／6／40 日與 legacy／corrupt aging 仍為本機時間／資料案例；未實際等待七日週期。 |
| N10 schema／更新／fallback／viewport | TEST correction readback、E24 U+200B、既有 v1→v2／SW 更新／viewport 證據；TEST correction body MD5 `d80a1ea6932806c0cfa82fce1b73a842`；PROD prosrc 與 local canonical DEV-122 原 migration 一致，PROD correction 為條件 no-op | 已有 preflight 證據可排除在 PROD 重套 correction；仍須把 no-op／hash 選擇綁定 sealed package，再完成 production deploy／smoke。Android 實機已由使用者取消。 |

其餘交付：最新 TEST suite 29/29、B0/core27+Google cancel gate、correction readback及 post-correction 7/7 均 PASS；source revision `57f8c8d3a751c8698a0e28539a9187868aff1873` 且 `sourceUnchanged=true`。早期 harness FAIL 仍保留，不折算 PASS。DEV-133 仍執行中；下一步是正式 DEV-133 scope 隔離、sealed package／canonical migration selection，再依既有授權及 gate 做正式 smoke。Android 實機已取消，正式環境尚未部署。

### 2026-10-01 最新 TEST 跨帳與 correction 證據

最新報告位於 `output/qa/dev-133/independent-auth/cross-account-integration/1790830360462-b8d304f5/`：`result.json` 的 29/29 integration cases PASS，固定 source revision 如上且 `sourceUnchanged=true`；B0/core27 及 normal Google cancel gate PASS。普通 A/B 新 Session、正常 Google callback、互相隔離與同 ID owner 保護均標為 TEST live；401、transport-loss／late-response等各例依報告標示注入層。E24 以真 TEST RPC 保留 U+200B 並讀回同 ID receipt。correction source `20261001090000_dev_133_quick_rpc_security_invoker.sql` 對應 TEST remote version `20261001045945`；`test-correction-readback.json` 記錄 `SECURITY INVOKER`、空 search_path、body MD5 `d80a1ea6932806c0cfa82fce1b73a842`，task／receipt ACL 及 receipt RLS 與修正前相同，沒有業務資料改寫。`post-correction-result.json` 7/7 PASS，涵蓋非空 A/B task、雙向 SELECT／UPDATE 拒絕、private receipt schema 不暴露及 origin 不傳憑證。

另有本輪 PROD auth／schema preflight，sanitized reports 為 `output/qa/dev-133/independent-auth/production/ordinary-session-readiness/auth-result.json` 與 `database-before.json`：owned Chrome 4195 的普通 Google 登入使 `/auth/v1/user` 回 200，`actorMatches`、`sdkUserMatches`、`googleIdentity` 均 true。PROD `create_quick_unplaced_task_v1` 為 `SECURITY INVOKER`、empty search_path，ACL 與 TEST 一致；prosrc MD5 `3ef7e8731dd6893594e0d66918ddfe16` 與 local canonical DEV-122 原 migration 相符。主代理比對 local correction 後確認兩者 7 行差異僅為註解刪除、行為相同；因此 PROD correction 是由 readback 支持的條件 no-op，不需重套。此為 PROD preflight，不是 quick-task 正式 smoke 或 release；沒有部署。

正常 Google 登入取消已有獨立真實證據：`google-cancel-final/google-cancel-result.json` 21/21 PASS，從 Google picker 使用瀏覽器 Back 返回 quick origin；保持登出、原 unbound capture 不變且未先呼叫 RPC，明確認領後才同步。最初該 driver 在 ordinary A 後等待逾時及同 ID recovery 均保留為失敗／恢復歷史，不折算 21/21。`runtime.json` 記錄 task runtime、browser、profile 與 callback cleanup 已完成，勿據此推測其他 profile。

目前尚未驗的是正式環境 source scope／不可變 sealed package、將 correction no-op 與 PROD prosrc hash 綁入 package、部署及 quick-task production-origin smoke；語音真麥克風／辨識服務、真實七日經過，以及 foreign workspace hint／profile-missing recovery 的 hosted 完整案例也未由這批報告證明。TEST pass 與 PROD auth/schema preflight 均不等於正式產品驗收。

### 2026-10-01 指定 Google B 的實際驗收

使用者指定並授權第二 TEST actor，且在 task-owned Chrome 視窗完成 Google 登入。TEST 唯讀盤點確認該帳號已有 profile、2 筆 active membership、1 筆 workbench row，provider為 Google；未建立／修改任何業務資料。正常 `/quick-task/` 登入 CTA 回到 `http://127.0.0.1:4173/quick-task/` 後，browser SDK `getUser` 比對指定帳號，profile／membership／workbench查詢及兩個 actor ID 不同檢查通過。A 以普通 password Auth核身通過；A/B各為2筆active membership與至少1筆workbench fixture。結果 **actor prerequisite PASS**，不是 N01～N10、跨帳 RLS矩陣或 B0完整 PASS。

結果：[result.json](../../output/qa/dev-133/independent-auth/google-actor-readiness/result.json)；生命周期：[runtime.json](../../output/qa/dev-133/independent-auth/google-actor-readiness/runtime.json)。task-owned browser tree已關閉、新建 Chrome profile已刪除、port4173確認釋放、精確 TEST callback已還原並readback；pre-existing正式站分頁及user-owned4000未改動。執行基準HEAD `d8280fc`＋本輪dirty auth／verifier；此為RD前置probe，不是frozen candidate完整QC。後續 hardening 的16項隔離回歸、typecheck、targeted lint通過；live登入本輪只執行一次，不把後續純靜態改善標為再次實機驗收。

TEST build亦PASS：`node node_modules/vite/bin/vite.js build --mode test --configLoader runner --outDir output/qa/dev-133/independent-auth/actor-readiness-build`，2109 modules、PWA service worker產生完成。一般sandbox build曾因`.vite-temp`／既有`dist/sw.js`寫入EPERM失敗；改用runner loader與本任務隔離outDir完成，未發布此artifact。build包含保留的既有dirty boundary，不能當clean release package。

### 2026-10-01 RD ordinary-session probes（部分證據）

以下證據使用 TEST `fhisnnufoeulxqrchldf` 的既有測試帳號，所有 browser context 均為隔離 headless session；不輸出 token、email、title 或 user ID。readback／Session／offline probes 不建立 task；valid RPC 與 quick UI E2E 使用本輪建立並保留的 smoke fixture，replay／conflict probe 未新增 row。這些 probes 只補強真實 ordinary-session 邊界，不能升格為完整 N01～N10 或獨立 QC PASS。

### 2026-10-01 TEST fixture readback（早期唯讀快照；現況見上方最新 TEST 證據）

> 本節是在取得第二個普通 Google Session及執行 TEST correction 之前的狀態快照；「只有一組登入憑證」「correction 未執行」等措辭只描述該快照，不是目前狀態。當前結果以 `1790830360462-b8d304f5` 下的 sanitized reports 為準。

以 Supabase TEST `fhisnnufoeulxqrchldf` 執行 aggregate-only SQL readback，未讀取或輸出任何 email、user ID、title 或 token：active auth users `5`、profiles `3`、active memberships `5`、active membership users `3`、workbench rows `3`，其中有 workbench row 的不同 owner `2`。這證明 TEST 資料面已有可作 A/B 的候選 fixture，但不證明兩個 actor 都能以普通登入取得 Session；目前只有一組登入憑證可操作，因此 N01／N02 的 A/B、切帳及負向權限矩陣仍為 NOT RUN。

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
