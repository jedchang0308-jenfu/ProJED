# ADR-037: Fixed Test Environment and Level 3 Release Gate

日期：2026-07-09
狀態：Accepted
關聯 DEV：Release governance / Supabase / Firebase Hosting

## 決策

ProJED 採用固定測試環境治理：

- `ProJED` 是 production Supabase project，只承載正式使用與正式發布後 smoke。
- `ProJED-TEST` 是固定 staging / test / controlled blast-zone Supabase project。
- Firebase Hosting `level3-smoke` preview channel 是正式部署前的固定 Level 3 production-like smoke hosting path。
- Supabase Branch 預設不使用；只有 `ProJED-TEST` 無法安全隔離風險時，才在使用者明確批准成本、用途與刪除條件後使用。

## HCS 引導決策

使用者於 2026-07-09 採用：

- `1B`：將規則寫成 `ADR + Level 3 runbook + documentation_map/dev_task index`。
- `2B`：`ProJED-TEST` 可作固定測試環境與受控試爆場；schema/migration/Edge Function/bulk data/destructive 測試前必須備份，測後 cleanup/reset。
- `3B`：預設不用 Supabase Branch；只有 `ProJED-TEST` 無法安全隔離高風險 migration、需要乾淨 DB、或會污染固定測試環境時，才經使用者明確批准後使用。

## AI 自動判斷規則

AI 後續遇到 release、deploy、production smoke、正式部署前檢查，或任何可能影響 production runtime 的任務時，必須自動判斷是否需要 Level 3。

Level 3 預設為必須，若命中任一條件：

- 即將 production deploy、正式發布、hotfix、或要求判定 production-ready。
- 變更 Supabase Auth、RLS、schema、migration、RPC、Edge Function、Storage、Realtime、Cron、Queues 或 public env contract。
- 變更登入、資料建立/更新/刪除、workspace/board/task/record/calendar subscription 等正式資料路徑。
- 變更 Firebase Hosting、service worker、PWA cache、build output、routing rewrite、public runtime config 或 production-only regression guard。
- 已知問題曾經出現「本機正常、production/staging 失敗」。

Level 3 可以標為不需要，但必須記錄理由，若變更僅屬於：

- 文件、註解、非 runtime 的 PM/QA/QC 紀錄。
- 純本機 verifier、腳本 self-check，且不改 production artifact 或 remote behavior。
- 尚未授權 release 的開發中 local-only slice。

AI 可以自動完成判斷、補文件、跑本機 Level 0/1/2 gate、準備 Level 3 runbook 與 smoke 指令。AI 不得因為這個 ADR 而自動執行下列行為：

- production deploy。
- 對 `ProJED` 套 migration、deploy Edge Function、刪改正式資料或建立 production fixture。
- 開 Supabase Branch、接受 Branch 成本、或延長 Branch 存活。
- 在 `ProJED-TEST` 執行破壞性/大量資料/不可逆測試但沒有備份與 cleanup plan。

## 固定 Level 3 路徑

正式部署前，預設路徑是：

1. 使用 staging env 建置 production artifact，Supabase 指向 `ProJED-TEST`。
2. 部署 `dist/` 到 Firebase Hosting preview channel `level3-smoke`，預設 `--expires 1d`。
3. 以 Firebase preview HTTPS URL 執行 browser smoke。
4. 使用 staging/test account 在 `ProJED-TEST` 建立小型 `LEVEL3-SMOKE-*` 資料。
5. 驗證 auth、read/write、reload persistence、cleanup/delete。
6. 記錄 branch、commit、build bundle、preview URL、smoke 結果與 cleanup 結果。

固定操作文件：`ai-doc/release/LEVEL3-firebase-preview-supabase-test-runbook.md`。

## ProJED-TEST 試爆場規則

`ProJED-TEST` 可以承接比一般 staging 更高風險的測試，但必須受控：

- 不得存放真實 production customer data，除非資料已脫敏且使用者明確同意。
- 測試資料必須使用可辨識 prefix，例如 `TEST-`、`LEVEL3-SMOKE-`、`QC-DEV-*`、`DEV-*`。
- read-only smoke、少量 staging fixture、登入流程、RLS/permission matrix 可以在 `ProJED-TEST` 執行。
- schema/migration/Edge Function/bulk update/delete/destructive recovery 測試前，必須先記錄備份方式、時間、範圍與還原/重置路徑。
- 若測試碰到 Supabase Storage object，DB backup 不足以覆蓋 Storage，需另列 Storage 備份或確認不觸及 Storage。
- 測後必須 cleanup/reset；若 `ProJED-TEST` 被污染，優先 restore/reset，而不是在污染狀態上繼續累積 workaround。
- `ProJED-TEST` inactive、Auth redirect 未設定、env 不完整、或測試帳號不可用時，Level 3 gate 必須標為 blocked，不得偷換成 local-only pass。

## Supabase Branch 例外

Supabase Branch 是例外路徑，不是預設 staging。

只有在下列任一條件成立時才考慮 Branch：

- migration/Edge/schema 測試可能污染 `ProJED-TEST` 且 restore/reset 成本高。
- 需要乾淨 DB 或獨立資料狀態才能判斷。
- 測試需要與固定 staging 平行執行，且互相干擾風險不可接受。

使用 Branch 前必須先取得使用者明確批准：

- Branch 用途。
- 預估成本與計費單位。
- 預計存活時間。
- 刪除條件。
- rollback / cleanup plan。

## 明確不採用

- 不採用「每次高風險變更一律開 Supabase Branch」作為預設。
- 不採用「只有本機 preview / build pass 就可視為正式部署前完成」。
- 不採用「把 `ProJED-TEST` 當 production 備份或正式資料副本」。
- 不採用「AI 在沒有授權時自行 production deploy 或自行承擔雲端成本」。

## HCS 思考習慣

- `#批判`：避免把 Branch 當成看似專業但對新手更高風險的預設。
- `#效用理論`：以固定 `ProJED-TEST` 換取較低操作成本、較高可重複性與較少權限失誤。
- `#風險控管`：用備份、prefix、cleanup、blocked condition 控制試爆場的破壞範圍。
- `#可驗證性`：正式部署前必須留下 Firebase preview URL、Supabase TEST read/write 與 cleanup evidence。
- `#當責`：AI 可自動判斷 gate，但成本、production、Branch 與破壞性測試仍需要人類授權。
