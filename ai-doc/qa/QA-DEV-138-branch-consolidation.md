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
| Frozen recovery UI | 25/25 SIMULATION PASS；page/console errors、HTTP/request failures 與外部請求均 0 |
| 320／390 視覺檢視 | PASS；登入區與 task details 可辨、按鈕未被遮蔽、清單與文字無水平溢出。真機未重測 |
| Typed RPC／legacy P0001 recovery | 進行中；未標 PASS |
| Tracked public payload | PASS；1260 paths，無私密 env、raw QA/profile 輸出。既有 localhost Supabase-demo JWT 已人工辨識為 fixture，不是正式憑證 |
| Sealed build／protected release／production feature | 未執行／待完成；build 的容量風險決策仍待人類回覆 |

Boundary 收據：`output/qa/dev-133/independent-auth/boundaries/1791256368502/result.json`。源碼 snapshot digest `d606a9f6aa4a8df78582e70e5aab8bee24031964b981e123db4c87a448c20bd2`。

UI 收據：`output/qa/dev-138/ui/1791256714527/evidence/result.json`。兩者的 source manifest／hashes 可逐檔與整合提交核對；起點 HEAD 不是產品改動完成後的 commit，不能僅以起點 SHA 當新 release identity。

首輪 Python driver 選錯未安裝 Playwright 的 runtime、boundary 的 batch peer 計數失敗，以及 UI 的外層容器隱藏預期失敗都保留；修正的是本機 runner／測試假設，沒有把未執行檢查補登 PASS。恢復 UI 判斷只改為內層 details 隱藏，同時要求登入區可見，保留全部 owner／receipt／同 ID assertions。

## 封存與發布界線

本地 bundle `output/archive/dev-138/20261006/projed-pre-consolidation.bundle` 已 `git bundle verify` PASS，完整歷史 31 refs；SHA-256 `842623c501c84bf2550c656fa9d77e73be0f191daee02a0cc3150edc6ec01807`。九個分支 exact tips 以 `archive/projed-20261006/...` tags 及 refs.json 保存。raw QA、browser profiles、ignored env 原地保留，不壓縮、不上傳。stash 與 Codex snapshot refs 不清除。

現行正式 release `20261005231837-de651b`／source `fd0c2256212169326c8bd6a932327854edabd0ef` 作 recovery anchor，immutable manifest／original direct receipt 均保留。本輪尚未改線上版本，不能將舊 receipt 的 feature-pending 改為本次新版完成。

本機 runtime 的 ProJED／目的／port／PID／native start token／executable／cleanup condition 記錄於 `output/qa/dev-138/owned/*/runtime.json`，Governor 的 register/release receipts 同目錄。各已完成測試的 task-owned Node／Chrome 已停止，4183 與各 BrowserServer ports 已釋放；使用者原有 4000 runtime 與視窗未操作。

## 待完成

原任務重試驗證 → 合併提交與 PR → 容量 gate → 保護發布及正式版本／行為驗證 → 文件收斂與冗餘分支清理。正式驗證完成前保留所有舊分支；本 QA 不宣告 DEV-138 結案。
