# REL-014：DEV-133 各自登入與依帳號同步

狀態：**Rev9正式發布與功能驗收PASS；Rev10部署前驗證PASS，正式程式尚未activate。** 原 `20261001061118-144be8` 核心包排除後續UI，UI另以 `20261001074739-df101c` 發布；sealed包身份及其驗收保持原source邊界。Git PR #5已建立，修正product `8a0e738`已推送；最新protected候選與正式設定修正見下一段。

2026-10-01部署前續驗發現stale Session／null／401及延遲logout barrier可跨較新epoch；Auth、outbox與quick UI已補guard。新版frozen source digest `3acceffc38997505d7d877fdbace868509b658ae426501cf449d999dc0ab99a9` 的82/82 SIMULATION、built真SW離線與browser restart10/10、真TEST A Auth／RPC12/12、同提交HTTPS TEST17/17及53/53遠端hash PASS，詳細收據見[QA最新部署前驗證](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#2026-10-01-rev-10-auth-競態修正的部署前驗證)。Protected release `20261001130712-4982b5`／source `8a0e738fcb68896a937f650666e53f2289729953`，54 entries、tree `202dba19b6aece56041e9f2e925bf61538612d9390c6b13afa4ccfbb11a03d84`；prepare／candidate、遠端54/54、官方browser與safe-cancel、三項strict readiness均PASS。`dev133-cohort.json`綁定manifest、TEST與NO_OP收據。本輪正式Site URL由localhost修至`https://projed-cc78d.web.app/`，先TEST驗證／完整還原，正式其餘設定不變，預設／main／quick取消回呼3項及新增readiness17 checks PASS。無schema／RPC／RLS／IAM變更。兩個preview已清理，live仍為Rev9 `b88f428e0efa541e`，作DB v2相容復原錨點；未activate、未執行新版正式功能驗收，舊40/40不推定涵蓋新修正。PR review／merge仍待完成。

- 主程式：[ProJED](https://projed-cc78d.web.app/)。獨立快速入口：[ProJED-快速建任務](https://projed-cc78d.firebaseapp.com/quick-task/?install=1)。
- 資源：Firebase project/site `projed-cc78d`；TEST Supabase `fhisnnufoeulxqrchldf`；PROD `knodlkxqpcqyrtgwpdst`。
- Product source：`8376086144b31155a94477e6bea1f929ded475be`，clean branch `codex/dev133-independent-auth-release`；以原正式 `afa758c35e907569f88e241e1fe72a231001e7bc` 為基準隔離 DEV-133。
- Release：`20261001061118-144be8`；tree SHA-256 `945f9a7a26f9c2ad7a9c416b819b3e921230eff47ad086dbf8783dc9120303cb`；54 個 manifest entries。
- Live release：`projects/projed-cc78d/sites/projed-cc78d/channels/live/releases/1790835561633000`；version `0aae27354f796317`；發布時間 2026-10-01 06:19:21.633 UTC。
- Recovery anchor：前一 live version `f20836f5018bfe35`／release `1790661471061000`，保留既有 Firebase Hosting recovery 路徑；未執行 rollback。

## 行為與來源邊界

兩個 App 共用 Supabase 帳號系統，各自以普通 Google Auth 登入及保存 Session。每筆先原子保存本機，再以同 owner／captureId 的 canonical RPC 同步；只有合法 receipt 才標完成。離線保留歸屬，回網自動核身及補送；切帳、登出 barrier、晚到回應或錯 receipt 不可把 A 任務送到 B。未綁定記錄需明確認領；只定期清理已嚴格核實 receipt 且 synced 滿七日的本機副本。

11 個 Auth／IDB／同步核心來源與最後 frozen TEST `1790830360462-b8d304f5` normalized parity PASS。DEV-132 通知、未發布的安裝／設定變動及後續收合／最近同步 UI 排除；canonical dirty changes 未還原、未混入。Android 實機已取消；真麥克風／辨識服務不在本次 Auth／同步驗收 PASS 宣稱內。

## Gate 與正式結果

TEST 29/29 跨帳整合、B0/core27、正常 Google picker Back 取消 21/21、correction readback 及 post-correction 7/7 PASS。TEST additive correction remote version `20261001045945` 在 B0 完整通過後執行；invoker／空 search_path／原 ACL/RLS 保持，無既有資料改寫。故障注入、SQL／IDB 邊界與真 hosted 行為分層詳見 [QA-DEV-133](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#2026-10-01-正式同步核心驗收rel-014)。

PROD 既有 canonical RPC prosrc MD5 `3ef7e8731dd6893594e0d66918ddfe16`，invoker／空 search_path／原 ACL/RLS 符合；與本地 correction 的七行差異僅註解，選擇 **NO_OP**，綁入 cohort／manifest hash。未套 retired OAuth v2、未套正式 correction、未輪替憑證、未改 IAM／Secret。

同 product commit 的 HTTPS TEST 53/53 hash、22/22 普通 Google／RPC／工作台功能及官方啟動 PASS。Protected prepare／candidate 與三項正式唯讀 P8／current-credential readiness PASS，candidate 未改 live。正式 activation 已發布，首次即時 `app-shell-meta.json` hash 不一致保留 FAIL；同一發布包後續只核對、不重部署，兩 origin 各 54/54 PASS。官方 canonical browser release／main bundle 身分、零 pageerror／critical failure 及 ordinary Google safe-cancel callback PASS；匿名 shell smoke 的 SW ready timeout 不升格為 SW ready PASS。

正式功能 **40/40 PASS**：真普通 Google callback、同 owner 不同 Session、UI 新建→receipt→工作台同 ID 唯一、reload 保留 Session／row、390／726 無溢出、page-scoped offline 綁原 owner、本機保存→回網自動補送、quick local logout 不登出 main。兩筆受控 task 都已同步，既有 raw capture baseline 0、final 2、pending 0；保留供唯讀回查，不改既有業務 task。

主程式隔離舊 profile 一度載入 prior release cached document、waiting SW。正常「清除快取後重整」人工 fallback 成功，僅清該 origin Cache Storage／SW，不清 IDB／登入；新 product script、原 Session 與 canonical capture IDs 已讀回。未宣稱自動 PWA 更新 PASS；未發現指向本次 DEV-133 source 回歸的證據。原三次失敗與同 primary captureID 重試歷史保留，未生成重複 primary。

## 收據、Git 與 cleanup

完整 package／activation resume 收據位於 release worktree `C:\Users\user\.codex\worktrees\dev133-independent-auth-release\ProJED\output\release\dev-083\20261001061118-144be8\` 的 `manifest.json`、`dev133-cohort.json`、`activation-resume-evidence.json`。canonical sanitized terminal：`output/qa/dev-133/independent-auth/production/terminal-evidence.json`；feature 與 source runner 的 SHA 綁定收據，原 FAIL 未覆寫。

Git 交付更新（2026-10-01）：使用者已授權提交公開 payload review 清單內的所有程式碼及開發文件。隔離 baseline `afa758c35e907569f88e241e1fe72a231001e7bc` 推送為 `codex/dev133-production-baseline`；PR 建立時的初始 head `0f3ad1a75825733aab539324217ae2302bef79d4` 推送為 `codex/dev133-independent-auth-release`。其後 QA／文件收斂與部署前測試穩定修正也已推送，分支包含驗證提交 `9a02030350a90c5126a27ac832d057efbe1a39c2`；該 SHA 是其中一個後續提交，不代表目前 head。遠端 refs 已讀回，並建立 [PR #5](https://github.com/jedchang0308-jenfu/ProJED/pull/5)，base／head 符合預期。PR 最近讀回為 Open、merge state CLEAN；當時無 status checks、尚未 review／merge。未改 `main` 或既有共享分支。先前自動審查曾在取得明確目的地授權前阻擋推送；授權後依核定清單正常推送，沒有繞過審查。後續 evidence-only commits 不改 product source，不能被誤當 sealed artifact 的 source commit。

task-owned Chrome PID 37180 已關閉，CDP4195與 TEST4173/4174/4175釋放；profile與兩筆同步 fixture保留。精確 TEST callback 還原且 Site URL／原 allowlist不變。本次 level3／production-candidate channels已移除，cleanup前後 live release不變；正式入口不受影響。使用者瀏覽器、localhost4000與較早含未同步資料的failed profiles保留。release worktree暫留供Git review／證據交付，DEV-133 root負責之後歸檔；歸檔前須保存 ignored收據。

## 後續統一 UI 正式發布：20261001074739-df101c

**Rev 9 統一 UI 已正式發布並通過相稱驗收。** UI source `9b5f73a1b32bdd8dc984c3017dceaf7225967d40`／release `20261001074739-df101c`；雙正式 origin 各54/54及正式匿名 UI10/10 PASS。本機 UI25/25（真browser／IDB＋Auth/RPC SIMULATION）、型別及 targeted lint PASS，source/UI digest `29cff0bb616834eceb36af1a06e1102092eb5db3fd2cb24edcb2aff6998ffd0f`。原 `8376086` 普通 Auth／同步40/40僅作未變核心的重用證據，不改稱本次實測。首兩輪 harness FAIL 與空值型別 FAIL 保留，沒有覆寫成 PASS。新收據 `output/qa/dev-133/independent-auth/production/unified-ui-release/terminal-evidence.json`，本機收據 `output/qa/dev-133/independent-auth/unified-status/1790840255628-29cff0bb/local-evidence.json`；無正式任務寫入、migration或遠端Auth設定變動，task-owned browser／ports已清理。

- 後續 UI recovery：`0aae27354f796317`／release `1790835561633000`（原同步核心），已相容 DB v2；未執行 rollback。
- 後續 UI tree：`6cebfe289b7ad63ea67db549f3cddb525cb469a7d18fe59404ddc9e0a2bc67fd`；live release `1790840941997000`／version `b88f428e0efa541e`。
- 未動使用者 browser／localhost4000；本次精確CLI sessions與4196等暫時埠已確認無程序／listener。release worktree保留供Git交付，DEV-133 root負責後續歸檔並先保存ignored證據。
