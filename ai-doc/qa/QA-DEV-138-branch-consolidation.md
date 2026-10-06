# QA-DEV-138：有效修正恢復與分支整合

日期：2026-10-06。類型：DEV-133 的開發點，不增加產品交付數。

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
| Sealed build／protected release／production feature | 未執行／待完成；容量准入尚未通過，需以當次預檢決定是否可建置；BLOCKED 需當次明確風險接受，EMERGENCY 不可覆寫 |

Boundary 收據：`output/qa/dev-133/independent-auth/boundaries/1791256368502/result.json`。源碼 snapshot digest `d606a9f6aa4a8df78582e70e5aab8bee24031964b981e123db4c87a448c20bd2`。

最新 UI 收據：`output/qa/dev-138/ui/1791257570707/evidence/result.json`，27/27 SIMULATION PASS，baseProductCommit `8b57568d8f4b9c4ff229c1287978bbfbf5d955b6`；產品 snapshot digest 與 boundary 收據相同，逐檔 hashes 可與整合提交核對。先前 25/25 收據 `output/qa/dev-138/ui/1791256714527/evidence/result.json` 保留。未將模擬帳號／RPC 結果稱為 HTTPS hosted integration PASS。

正式只讀 readiness 收據：`output/qa/dev-138/production-auth-readiness.json`（17/17），`output/qa/dev-138/credential-readiness.json`（9/9）。

首輪 Python driver 選錯未安裝 Playwright 的 runtime、boundary 的 batch peer 計數失敗，以及 UI 的外層容器隱藏預期失敗都保留；修正的是本機 runner／測試假設，沒有把未執行檢查補登 PASS。恢復 UI 判斷只改為內層 details 隱藏，同時要求登入區可見，保留全部 owner／receipt／同 ID assertions。舊 recovery driver 對新版介面的 2/18 FAIL 收據保留於 `output/qa/dev-138/ui/1791256877630/evidence/result.json`；R26／R27 已移入現行 frozen UI driver 實際重跑通過，不將舊 driver 補登 PASS。

## 封存與發布界線

本地 bundle `output/archive/dev-138/20261006/projed-pre-consolidation.bundle` 已 `git bundle verify` PASS，完整歷史 31 refs；SHA-256 `842623c501c84bf2550c656fa9d77e73be0f191daee02a0cc3150edc6ec01807`。九個分支 exact tips 以 `archive/projed-20261006/...` tags 及 refs.json 保存。raw QA、browser profiles、ignored env 原地保留，不壓縮、不上傳。stash 與 Codex snapshot refs 不清除。

現行正式 release `20261005231837-de651b`／source `fd0c2256212169326c8bd6a932327854edabd0ef` 作 recovery anchor，immutable manifest／original direct receipt 均保留。本輪尚未改線上版本，不能將舊 receipt 的 feature-pending 改為本次新版完成。

本機 runtime 的 ProJED／目的／port／PID／native start token／executable／cleanup condition 記錄於 `output/qa/dev-138/owned/*/runtime.json`，Governor 的 register/release receipts 同目錄。各已完成測試的 task-owned Node／Chrome 已停止，4183 與各 BrowserServer ports 已釋放；使用者原有 4000 runtime 與視窗未操作。

## 容量阻擋紀錄

2026-10-06 03:43:43 UTC 的 Governor 盤點收據 `output/qa/dev-138/capacity-emergency.json`：C 槽實體可用 16,365,629,440 bytes（約 15.2 GiB），保護門檻 25,534,503,118 bytes（約 23.8 GiB），另有 active leases 10 GiB，本建置要求預留 25 GiB，狀態為 `EMERGENCY`。未查證其他 lease 的任務歸屬與實體容量變動原因，未停止或釋放它們。套用當次 lease／policy 後完整准入需要約 58.8 GiB，缺口約 43.5 GiB；此數字須在重試前重新計算。

原約 31.1 GiB 的 `BLOCKED` 請求與其待回覆風險接受選項已不適用；EMERGENCY 不得風險覆寫。限定盤點只有 report-only npm cache／Docker cache／受保護的主工作樹，無可執行候選；proposal 因 `no_candidates` 自動取消，source maintenance operation 已關閉。未執行任何容量清理或建置。釋出容量後重新檢查，才決定是否可繼續原發布流程。

後續重查的 `output/qa/dev-138/capacity-blocked-audit.json`：實體可用約 29.1 GiB、active leases 0、狀態 `BLOCKED`，完整准入仍需約 48.8 GiB，無可執行清理候選。已另提出以此最新容量請求為範圍的一次性風險決策，尚未收到人類答案。此後容量與其他 lease 仍可能變動；以建置前機器結果為準，不把歷史 EMERGENCY／BLOCKED 寫成持續不變的狀態。

## 待完成

整合 merge commit `8b57568d8f4b9c4ff229c1287978bbfbf5d955b6` 與只改驗證／文件的 follow-up `2c119a4` 已推送，PR [#7](https://github.com/jedchang0308-jenfu/ProJED/pull/7) 已建立。有效舊分支 tips 均為整合來源的祖先；舊 icon-auto-migration 除外，其歷史按已核准計畫封存、方案不回放。相較當次正式 source，產品 diff 仍只有 4 個 quick-task 檔案。已通過本機驗證的來源可先經 PR 合併；容量 gate 只阻擋未獲准的建置，來源合併不代表已發布。下一步為 PR 合併至 main → 容量預檢 → clean main source 的剩餘發布前驗證 → protected release 與正式版本／行為驗證 → 文件收斂及冗餘分支清理；合併／發布的精確 source 以當次 clean commit 重新綁定，HTTPS Level 3 收據須符合當次來源。正式驗證完成前保留所有舊分支；本 QA 不宣告 DEV-138 結案。
