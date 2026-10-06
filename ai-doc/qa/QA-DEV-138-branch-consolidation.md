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
| Sealed build／protected release／production feature | 未執行／待完成；build 的容量風險決策仍待人類回覆 |

Boundary 收據：`output/qa/dev-133/independent-auth/boundaries/1791256368502/result.json`。源碼 snapshot digest `d606a9f6aa4a8df78582e70e5aab8bee24031964b981e123db4c87a448c20bd2`。

最新 UI 收據：`output/qa/dev-138/ui/1791257570707/evidence/result.json`，27/27 SIMULATION PASS，baseProductCommit `8b57568d8f4b9c4ff229c1287978bbfbf5d955b6`；產品 snapshot digest 與 boundary 收據相同，逐檔 hashes 可與整合提交核對。先前 25/25 收據 `output/qa/dev-138/ui/1791256714527/evidence/result.json` 保留。未將模擬帳號／RPC 結果稱為 HTTPS hosted integration PASS。

正式只讀 readiness 收據：`output/qa/dev-138/production-auth-readiness.json`（17/17），`output/qa/dev-138/credential-readiness.json`（9/9）。

首輪 Python driver 選錯未安裝 Playwright 的 runtime、boundary 的 batch peer 計數失敗，以及 UI 的外層容器隱藏預期失敗都保留；修正的是本機 runner／測試假設，沒有把未執行檢查補登 PASS。恢復 UI 判斷只改為內層 details 隱藏，同時要求登入區可見，保留全部 owner／receipt／同 ID assertions。舊 recovery driver 對新版介面的 2/18 FAIL 收據保留於 `output/qa/dev-138/ui/1791256877630/evidence/result.json`；R26／R27 已移入現行 frozen UI driver 實際重跑通過，不將舊 driver 補登 PASS。

## 封存與發布界線

本地 bundle `output/archive/dev-138/20261006/projed-pre-consolidation.bundle` 已 `git bundle verify` PASS，完整歷史 31 refs；SHA-256 `842623c501c84bf2550c656fa9d77e73be0f191daee02a0cc3150edc6ec01807`。九個分支 exact tips 以 `archive/projed-20261006/...` tags 及 refs.json 保存。raw QA、browser profiles、ignored env 原地保留，不壓縮、不上傳。stash 與 Codex snapshot refs 不清除。

現行正式 release `20261005231837-de651b`／source `fd0c2256212169326c8bd6a932327854edabd0ef` 作 recovery anchor，immutable manifest／original direct receipt 均保留。本輪尚未改線上版本，不能將舊 receipt 的 feature-pending 改為本次新版完成。

本機 runtime 的 ProJED／目的／port／PID／native start token／executable／cleanup condition 記錄於 `output/qa/dev-138/owned/*/runtime.json`，Governor 的 register/release receipts 同目錄。各已完成測試的 task-owned Node／Chrome 已停止，4183 與各 BrowserServer ports 已釋放；使用者原有 4000 runtime 與視窗未操作。

## 待完成

整合 merge commit `8b57568d8f4b9c4ff229c1287978bbfbf5d955b6` 已推送，Draft PR [#7](https://github.com/jedchang0308-jenfu/ProJED/pull/7) 已建立。下一步為容量 gate → 剩餘發布前驗證 → PR 合併至 main → protected release 與正式版本／行為驗證 → 文件收斂及冗餘分支清理；合併／發布的精確 source 以當次 clean commit 重新綁定，HTTPS Level 3 收據須符合當次來源。正式驗證完成前保留所有舊分支；本 QA 不宣告 DEV-138 結案。
