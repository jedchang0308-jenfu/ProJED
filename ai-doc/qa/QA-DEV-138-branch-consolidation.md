# QA-DEV-138：有效修正恢復與分支整合

日期：2026-10-06。類型：DEV-133 的開發點，不增加產品交付數。

## 現行結果：發布與限定驗收完成

[PR #7](https://github.com/jedchang0308-jenfu/ProJED/pull/7) 已於 2026-10-06 04:00:44 UTC 合併，clean main source `aefb93384c72f2b4c04dbb526fa01a30848cbcc6` 的 sealed artifact `20261006063124-2c064e` 已完成 prepare／candidate／activate。正式 live version `206d252a093527aa`，兩個 canonical origins 讀回同 release／source，82/82 asset provenance、browser shell、OAuth cancel PASS；tree SHA-256 `3e1594285ded72ffd1558a0f35ecdd05986ad2fcec1738628d032372e980c067`。本次只恢復四個 quick-task 產品來源，不使產品退回舊版；後續結案文件提交不重建或改寫已凍結的產品來源。

驗收收斂入口：`output/qa/dev-138/production-acceptance.json`。以下範圍為本輪實際證據，不宣告 DEV-133 全帳號切換／錯誤注入矩陣已重新正式測試。

## 來源與範圍

- canonical repository：`C:\VIBE CODING\ProJED\ProJED`；整合分支：`codex/projed-branch-consolidation`。
- 起點 `bc58584a87b15fcc1136d1630a3f07f2046a6882`，合併 `origin/codex/dev133-production-baseline` 的 `9577183a1902c7c3c6a30b503e1a2a234c7a0cdd`。
- 只恢復 `8a0e738` 的 Auth／offline ownership guard、`673aeee` 的 typed RPC／原 capture recovery、`9e67d5d` 的晚到 recovery feedback 保護。產品改動限於 auth.ts、outbox.ts、quickTask/main.ts、quickTaskCaptureService.ts。
- 主程式 PWA、安裝選單、會議與 DEV-137 AI 整理來源保留；已取代的舊圖示自動遷移不重新引入。無 schema、Auth 設定、IAM、Secret 或業務資料變更。
- DEV-133 Rev12 的正式結果是歷史證據，不改稱本輪實測。DEV-137 正式會議 UI／草稿生命週期的使用者回報 PASS 保留。

## 本輪驗證

| 檢查 | 結果與限制 |
|---|---|
| TypeScript `tsc --noEmit` | PASS |
| 4 個產品修改來源 ESLint | PASS |
| DEV-133 independent Auth contract | PASS |
| DEV-136 meeting draft continuation | 14/14 PASS |
| DEV-137 meeting synthesis | 18/18 PASS |
| DEV-122 quick/PWA static contract | 26/26 PASS；S16 原檢查仍依賴已取代的 lifecycle 字串，對齊現行 readiness guard 後重跑；未改產品 PWA 實作 |
| DEV-034 install guidance | 23/23 PASS |
| Auth／IDB／RPC boundary browser | 84/84 SIMULATION PASS；真瀏覽器／IDB，Auth／RPC stub，未聯絡遠端帳號或資料 API |
| Frozen recovery UI | 27/27 SIMULATION PASS；page/console errors、HTTP/request failures 與外部請求均 0 |
| 320／390 視覺檢視 | PASS；登入區與 task details 可辨、按鈕未被遮蔽、清單與文字無水平溢出。真機未重測 |
| Typed RPC／legacy P0001 recovery | R26／R27 SIMULATION PASS；原 capture ID、owner、title 與 receipt 一致；其他帳號不可查看原 title 或重試 |
| Production readiness | 17/17 PASS；只讀核對正式 Auth Site URL 與 canonical production root 一致，未改 Auth 設定 |
| Credential readiness | 9/9 PASS；只讀驗證現有憑證與退役策略，未輪替或變更 Secret |
| Tracked public payload | PASS；1261 paths，無私密 env、raw QA/profile 輸出。既有 localhost Supabase-demo JWT 已人工辨識為 fixture，不是正式憑證 |
| HTTPS TEST scoped smoke | 8 項 PASS、59/59 remote hashes；main／quick compiled UI、real anonymous offline IDB、同 capture reload、unbound 不呼叫 RPC、public Auth settings GET 200、390／726 overflow。未寫 TEST cloud 資料，未宣告 authenticated TEST Auth/RPC PASS |
| Sealed build／protected release | PASS；clean source `aefb933`，artifact `20261006063124-2c064e`；prepare／candidate／activate 同產物，candidate 確認 live 不變，activation 82/82 assets、browser／OAuth PASS |
| 正式正常 QA 登入／owner barrier | 5 項 readonly UI PASS；real Auth GET 200、exact release、offline owner-bound local capture、foreign-owner title hidden／no RPC、390／726 overflow。所有 business API writes 在該唯讀測試被攔截，實際攔截數 0，page errors 0 |
| 正式 online／offline 原兩筆 QA 任務 | 本人另行明確授權建立及透過不可回收的 UI 封存清除後執行；兩筆原 capture 均有 matching owner／title hash committed receipt，正常主 App 的遠端列表讀到同 ID；兩次 UI DELETE 204，reload 後不存在；三筆 task-owned local capture 清除、其他本機草稿計數不變 |
| 清理與生命周期 | 6 個本地／5 個遠端舊分支、3 個 task-created preview channels、8 個暫時 QA 副本／Chrome cache 清理 PASS；134,618,319 bytes（128.4 MiB）。原 bundle／tags／receipts／profiles／release dist 保留，所有本次 runtimes／UI、容量 lease／Governor session 已結束 |

Boundary 收據：`output/qa/dev-133/independent-auth/boundaries/1791256368502/result.json`。源碼 snapshot digest `d606a9f6aa4a8df78582e70e5aab8bee24031964b981e123db4c87a448c20bd2`。

最新 UI 收據：`output/qa/dev-138/ui/1791257570707/evidence/result.json`，27/27 SIMULATION PASS，baseProductCommit `8b57568d8f4b9c4ff229c1287978bbfbf5d955b6`；產品 snapshot digest 與 boundary 收據相同，逐檔 hashes 可與整合提交核對。先前 25/25 收據 `output/qa/dev-138/ui/1791256714527/evidence/result.json` 保留。未將模擬帳號／RPC 結果稱為 HTTPS hosted integration PASS。

正式只讀 readiness 收據：`output/qa/dev-138/production-auth-readiness.json`（17/17），`output/qa/dev-138/credential-readiness.json`（9/9）。

首輪 Python driver 選錯未安裝 Playwright 的 runtime、boundary 的 batch peer 計數失敗，以及 UI 的外層容器隱藏預期失敗都保留；修正的是本機 runner／測試假設，沒有把未執行檢查補登 PASS。恢復 UI 判斷只改為內層 details 隱藏，同時要求登入區可見，保留全部 owner／receipt／同 ID assertions。舊 recovery driver 對新版介面的 2/18 FAIL 收據保留於 `output/qa/dev-138/ui/1791256877630/evidence/result.json`；R26／R27 已移入現行 frozen UI driver 實際重跑通過，不將舊 driver 補登 PASS。

## 封存與發布界線

本地 bundle `output/archive/dev-138/20261006/projed-pre-consolidation.bundle` 已 `git bundle verify` PASS，完整歷史 31 refs；SHA-256 `842623c501c84bf2550c656fa9d77e73be0f191daee02a0cc3150edc6ec01807`。九個分支 exact tips 以 `archive/projed-20261006/...` tags 及 refs.json 保存。raw QA、browser profiles、ignored env 原地保留，不壓縮、不上傳。stash 與 Codex snapshot refs 不清除。

前版正式 release `20261005231837-de651b`／source `fd0c2256212169326c8bd6a932327854edabd0ef` 作 recovery anchor，immutable manifest／original direct receipt／dist 均保留。本輪已發布 `20261006063124-2c064e`，但不把前版 receipt 的 feature-pending 欄位改成本次結果。

本機 runtime 的 ProJED／目的／port／PID／native start token／executable／cleanup condition 記錄於 `output/qa/dev-138/owned/*/runtime.json`，Governor 的 register/release receipts 同目錄。各已完成測試的 task-owned Node／Chrome 已停止，4183 與各 BrowserServer ports 已釋放；使用者原有 4000 runtime 與視窗未操作。

## 容量阻擋紀錄（歷史；本次限定請求已獲准）

2026-10-06 03:43:43 UTC 的 Governor 盤點收據 `output/qa/dev-138/capacity-emergency.json`：C 槽實體可用 16,365,629,440 bytes（約 15.2 GiB），保護門檻 25,534,503,118 bytes（約 23.8 GiB），另有 active leases 10 GiB，本建置要求預留 25 GiB，狀態為 `EMERGENCY`。未查證其他 lease 的任務歸屬與實體容量變動原因，未停止或釋放它們。套用當次 lease／policy 後完整准入需要約 58.8 GiB，缺口約 43.5 GiB；此數字須在重試前重新計算。

原約 31.1 GiB 的 `BLOCKED` 請求與其待回覆風險接受選項已不適用；EMERGENCY 不得風險覆寫。限定盤點只有 report-only npm cache／Docker cache／受保護的主工作樹，無可執行候選；proposal 因 `no_candidates` 自動取消，source maintenance operation 已關閉。未執行任何容量清理或建置。釋出容量後重新檢查，才決定是否可繼續原發布流程。

後續重查的 `output/qa/dev-138/capacity-blocked-audit.json`：實體可用約 29.1 GiB、active leases 0、狀態 `BLOCKED`，完整准入仍需約 48.8 GiB，無可執行清理候選。已另提出以此最新容量請求為範圍的一次性風險決策，尚未收到人類答案。此後容量與其他 lease 仍可能變動；以建置前機器結果為準，不把歷史 EMERGENCY／BLOCKED 寫成持續不變的狀態。

## 本次發布、正式驗收與清理收據

- 使用者接受當次容量風險後，06:06:09 UTC 回 `HUMAN_RISK_ACCEPTED`；session `20b5948e-2816-438b-a97d-225f1cbca1d4`／operation `dev138-protected-build`／effective reservation 25 GiB／原 policy hash 與 filesystem identity 未改。`capacity-accepted.json`、`capacity-release.json` 保存限定請求與完成後釋放；EMERGENCY 原紀錄未覆寫，沒有更改 Governor 政策或清理其他專案。
- HTTPS Level 3：`output/qa/dev-138/level3-aefb933-1791267046389/level3-evidence.json`。首輪把 optional receipt 的 undefined 誤當 null 而失敗，原收據 `scoped-ui-failure-receipt-undefined.json` 保留；只修測試判斷，8 項重跑 PASS。QA candidate／dist 已刪除，build hashes、remote checks、evidence／screenshots、candidate source-manifest 留在該結果目錄。
- 封存產物：`output/release/dev-083/20261006063124-2c064e/manifest.json` 與同目錄 prepare／candidate／activation evidence。首輪 prepare 的 Chrome 查找路徑錯誤，建置已完成；指定現有 Chrome 後重用同一 artifact 完成 Layer2，沒有為 runner 問題重建。前版 assets 保留於本次產物，便於舊頁面仍可取得原 chunks。
- 正式 readonly：`output/qa/dev-138/production-readonly/result.json`。自動核准審查拒絕瀏覽器 Token 複製／匯出 helper，命令未執行、未生成 private-sessions.json，該 helper 已移除；驗證改用正常既有 QA profile UI，不讀取或複製 session credentials。
- 原兩筆正式 QA 任務：`output/qa/dev-138/production-ui/1791268964406/recovery-result.json` 與 `local-cleanup.json`。使用者另行明確授權後才建立。最初 create/sync runner 已走到清理，因 response 監聽 timeout 未完成 PASS JSON，原 stderr 保留於 `owned/`；recovery 的 mobile-width 右鍵選單失敗收據亦保留為 `recovery-mobile-menu-failure.json`。改桌面尺寸及限定目標任務選單後，讀回原兩筆 committed receipts、UI DELETE 204／reload absence PASS，不增加其他任務。原 create RPC 的逐筆 HTTP status 未持久化，因此不補造其 HTTP 計數。
- 清理：`cleanup-branches.json` 保留 exact SHA、祖先／archive 驗證及遠端 lease；PowerShell 本地 ref 交易曾因 CRLF 在 commit 前失敗，沒有部分刪除，改 UTF-8 LF 交易完成。`cleanup-space.json` 保存 128.4 MiB logical removed bytes 與 +133.3 MiB 當次 physical delta，當時 C 槽約 30.6 GiB；兩者分開記錄。`cleanup-channels.json` 與 channels before／after readback 證明本次 3 channels 已刪除、live `206d252a093527aa` 保持不變，未改 Auth 設定。
- 原 QA profiles／私密 env／Git bundle 不上傳；stash／Codex snapshot refs 與所有 archive tags 保留。`workspace-cleanup.json` 記錄臨時 CLI config 移除與原 Git exclude 逐位元還原。4174／4183／4195 最後無 listener；4000 最後亦未見 listener，原因未查明，本任務未對原 primary runtime 發出停止指令。`session-end.json` 確認本次 Governor session 已結束。

DEV-138 的限定整合、發布與清理已完成，不新增產品交付數；DEV-133 Rev12、DEV-137 使用者「測過OK」及各原始失敗 receipt 保持歷史證據範圍。最終 main／origin refs 與乾淨工作樹讀回見 `output/qa/dev-138/final-audit.json`。
