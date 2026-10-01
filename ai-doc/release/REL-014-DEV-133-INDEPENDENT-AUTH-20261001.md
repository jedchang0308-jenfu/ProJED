# REL-014：DEV-133 各自登入與依帳號同步

## Rev12 恢復提示競態修正（2026-10-02；直接 corrective release 發布前 READY）

Rev11 release `20261001160355-057ccc`／live recovery version `c01b9588565a9025` 仍為 PROD。最終 Rev12 candidate frozen source 為 360 files、digest `ce3bb938cbe5fdae1b4d27de3679a4d0056f40f07839573cd5b024030ae12b3d`；UI／真 IDB simulation 25/25與 ordinary TEST N06 11/11 PASS，read-only review 無 P0/P1 阻礙，tsc／targeted ESLint exit 0。舊 `673aeee` baseline的 R24 原帳號 false warning 24/25 FAIL保留。Source SHA及新 release ID未知；Auth／RPC／DB／SW／schema／voice未變，82/12/18/N10及SQL證據只按未變 component scope重用。正式 corrective release尚未執行；發布後 production驗收、PR #5 review／merge和專屬4195 cleanup仍待，DEV-133未完成。詳細層級與 receipts見[QA Rev12](../qa/QA-DEV-133-quick-task-shared-identity-sync.md)。

## Rev11 正式發布與指定功能驗收快照（2026-10-02）

**Product commit `673aeee9c10f01936a8aa4a0f2ca16ab7606a5ea` 已推入 PR #5；direct release `20261001160355-057ccc` 已正式發布。** Release tree SHA-256 為 `2536ff413d26ab52f9a4234a9d2e7e05aa743f70f577f4ea70c894781baa79a0`，雙正式 origin 均核對 54/54 entries，official browser startup PASS；provider live readback 為 version `c01b9588565a9025`。Rev10 live version `ae38a453a07ec4f3` 是復原錨點。工作樹 mirror 收據：[正式 46-case 結果](../../output/qa/dev-133/independent-auth/production/rev11/result.json)、[兩 origin readback](../../output/qa/dev-133/independent-auth/production/rev11/serving-readback.json)、[manifest](../../output/qa/dev-133/independent-auth/production/rev11/manifest.json)、[provider live readback](../../output/qa/dev-133/independent-auth/production/rev11/provider-live-readback.json)。部署 direct evidence 綁定實際 post-deployment Python feature PASS（[direct evidence](../../output/release/dev-083/20261001160355-057ccc/direct-evidence.json)）；執行前 CLI feature 尚待執行的收據保留（[before-feature receipt](../../output/release/dev-083/20261001160355-057ccc/direct-execution-before-feature.json)）。

Production runner 的 46/46 PASS 僅涵蓋命名案例：普通真 Google SDK Auth／獨立 Session、同 owner、正常 UI 建立唯一 captureId、真 owner RPC／receipt／工作台、page-scoped offline 後回網補送，以及 quick local logout 不登出主程式 Session；Auth／RPC 未 stub。legacy `P0001` 狀態只由本機 fault fixture 注入。收據記錄 pageError 與 critical Auth/RPC failure 計數皆為 0；這不替代視覺 final audit。固定新版 source pin 下正常關閉／重開受控頁後，兩筆 raw capture、owner 與 Session／receipt readback維持不變（[worker reopen](../../output/qa/dev-133/independent-auth/production/rev11/normal-worker-reopen.json)）。原 worker timeout 與 replay harness 參數錯誤／404收據保留；修正工具後重用原 fixtures（[timeout](../../output/qa/dev-133/independent-auth/production/rev11/result-before-worker-reopen.json)、[replay failure](../../output/qa/dev-133/independent-auth/production/rev11/result-before-replay-argument-fix.json)、[correction](../../output/qa/dev-133/independent-auth/production/rev11/replay-argument-correction.json)）。

另有人工語音 known-phrase 驗收 PASS（[speech result](../../output/qa/dev-133/independent-auth/production/rev11/speech-human-result.json)、[畫面](../../output/qa/dev-133/independent-auth/production/rev11/speech-human.png)）；它沿用 source `8a0e738fcb68896a937f650666e53f2289729953` 未變更的 `voice.ts`／handlers 語音範圍，不代表 Rev11 修改或全量重驗語音程式。此前同 digest `092f1fa...` 的 82/82 SIMULATION、12/12 普通 TEST A、18/18 hosted recovery及 N10 固定候選相容證據維持各自層級與來源，不合併作正式 46-case 結果（[QA 分層記錄](../qa/QA-DEV-133-quick-task-shared-identity-sync.md)）。

Rev11 primary 390px 已同步畫面當時顯示要求先登出原帳號的提示（[人工檢視畫面](../../output/qa/dev-133/independent-auth/production/rev11/production-primary-synced-390.png)），同期 readback 沒有其他 pending capture且 owner 已同步。Rev12 final candidate 已在 local simulation 重現舊 baseline false warning並通過 delayed-IDB案例；這不代表PROD fault injection或新版正式 UI audit。Rev11畫面及其46/46範圍保留為歷史正式證據。Rev12尚未部署，正式 UI audit仍待新版正式驗收；不能據此宣稱UI clean或task done。PR #5 review／merge及專屬4195 runtime／UI cleanup由root續辦。此前 `144ea...` 是Rev10時的歷史 PR head；本輪文件更新尚未提交，更新後 PR head待root以實際 Git／PR readback記錄。

## Rev10 狀態快照（2026-10-01；由上方 Rev11 現況取代）

狀態：**2026-10-01 Rev10已正式啟用；改動功能的正式驗收續跑，Google獨立登入核身待完成。** Product source `8a0e738fcb68896a937f650666e53f2289729953`、同一protected release `20261001130712-4982b5` 已正式activate，live version `ae38a453a07ec4f3`；雙正式origin各54/54檔案hash、官方啟動與ordinary Google safe-cancel、三項strict readiness PASS。前一Rev9 `b88f428e0efa541e`保留為DB v2相容復原錨點。正式主程式既有Session透過普通SDK refresh後getUser200、指定actor與owner吻合；quick獨立Google登入因provider密碼／MFA尚待人類核身，不能把7/7前置檢查或舊40/40當作新版正式同步驗收。未執行正式migration／修改業務資料／擴張IAM或Secret。PR #5 head `144ea331448cd449dafca1bc7e284c67bf4e2f6d`已推送，合併前只讀審查進行中。

Activation收據：release worktree `output/release/dev-083/20261001130712-4982b5/activation-evidence.json`；正式雙origin及Session收據：canonical `output/qa/dev-133/independent-auth/production/rev10/serving-readback.json`、`session-refresh.json`、`result.json`。本輪專屬Chrome／CDP4195暫留給人類核身與連續驗收，cleanup owner為DEV-133 root；不關閉使用者原有瀏覽器、不刪任何未同步任務。release worktree及ignored收據暫留到Git review／merge，歸檔前先保存證據。

Latest TEST follow-up (uncommitted source digest `092f1fa088efb4d15567ae6cc1cdb48f45d051913aa6a9d74556fb8fbc54d2ab`, 360 source files)：fixed bundle offline 10/10 and N10 built-SW A→B→A／DB v2 10/10 PASS; 4193／4194 released and the synthetic profile retained. N08 hosted ordinary-session recovery scenario 18/18 PASS; original product FAIL and the intermediate rendered-SW pinning harness timeout remain preserved. Details and limits are in [QA latest follow-up](../qa/QA-DEV-133-quick-task-shared-identity-sync.md#2026-10-01-rev10-fixed-test-built-sw-a-to-b-to-a-compatibility). This is TEST-only local bundle/SW and hosted recovery evidence. The three product fixes are uncommitted and undeployed; PROD remains Rev10 source `8a0e738`. It is not production installed-client, Google, speech, or full PWA automatic-update acceptance. N03 actual speech, PROD quick Google/new-feature acceptance, PR #5 review/merge, and dedicated 4195 window cleanup remain required. N08 runtime 4196 was released with the fixture profile retained. The N10 browser assertion checks `pageerror` only; request detection covers REST, Realtime and Firestore paths, so it does not establish zero visible errors or zero Auth/network requests.

以下Rev10部署前與Rev9發布段落均為各自當時快照，不能覆蓋本段當前狀態。

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
