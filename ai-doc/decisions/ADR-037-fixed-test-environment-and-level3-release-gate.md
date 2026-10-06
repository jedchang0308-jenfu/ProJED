# ADR-037: Fixed Test Environment and Level 3 Release Gate

日期：2026-07-09
狀態：Accepted
關聯 DEV：Release governance / Supabase / Firebase Hosting

## 決策

ProJED 採用固定測試環境治理：

- `ProJED` 是 production Supabase project，只承載正式使用與正式發布後 smoke。
- `ProJED-TEST` 是固定 staging / test / controlled blast-zone Supabase project。
- Firebase Hosting `level3-smoke` preview channel 是保護發布需要 Level 3 時的固定 production-like smoke hosting path；快速發布依下方 2026-09-21 修訂。
- Supabase Branch 預設不使用；只有 `ProJED-TEST` 無法安全隔離風險時，才在使用者明確批准成本、用途與刪除條件後使用。

## HCS 引導決策

使用者於 2026-07-09 採用：

- `1B`：將規則寫成 `ADR + Level 3 runbook + documentation_map/dev_task index`。
- `2B`：`ProJED-TEST` 可作固定測試環境與受控試爆場；schema/migration/Edge Function/bulk data/destructive 測試前必須備份，測後 cleanup/reset。
- `3B`：預設不用 Supabase Branch；只有 `ProJED-TEST` 無法安全隔離高風險 migration、需要乾淨 DB、或會污染固定測試環境時，才經使用者明確批准後使用。

## AI 自動判斷規則

2026-09-21 修訂（DEV-083）：使用者在評估換 logo 的驗證成本後要求「請執行修改」，核准依實際風險分為快速／保護發布，取代「正式部署一律 Level 3」的決策。此授權只修改規則與本機工具，不啟動正式部署。

AI 先檢查完整發布差異的後果、可逆性、恢復方式與授權。不可只因檔案位於 Auth/PWA、含 API/query 或將要正式發布而升級；例如 AuthGate 的圖片路徑變更不等於登入行為變更。

| 路徑 | 適用條件 | 必要流程 |
|---|---|---|
| 快速發布（符合條件時預設） | 影響有限、短暫異常可接受、有已知快速恢復方式，且無重大資料、安全或不可逆副作用風險 | 相關檢查 → 一次 sealed production build → `release:production --phase direct` → canonical 與改動功能驗證；Level 3、local artifact server、candidate 不適用 |
| 保護發布 | 破壞性或難還原資料變更、登入/授權/安全邊界改變、不可逆外部副作用、難恢復基礎設施或無法容忍預期中斷 | 保留 `prepare → candidate → activate`；Level 3 驗證本次風險所需的 TEST/HTTPS 行為，另做必要的資料、權限或恢復保護 |

快速發布仍必須檢查正確 production env/target、secret 與 artifact 完整性、記錄前一 live 版本及恢復方法。發布者在現有 release receipt 記錄分級理由；不新增豁免表單、不以空白或虛構 Level 3 JSON 滿足腳本。`direct` 是執行者的低風險判斷，不是依副檔名自動認證；風險或完整來源不明時先查明。

文件、本機工具或未要求發布的開發工作，不因修改本 ADR 而啟動 release。既有有效證據按受影響輸入重用；commit 因無關文件而改變，不自動重跑全部檢查。已知 production-only 回歸需在能重現原因的邊界驗證，但不自動要求所有環境。

AI 可以自動完成判斷、補文件、跑本機 Level 0/1/2 gate、準備 Level 3 runbook 與 smoke 指令。AI 不得因為這個 ADR 而自動執行下列行為：

- production deploy。
- 對 `ProJED` 套 migration、deploy Edge Function、刪改正式資料或建立 production fixture。
- 開 Supabase Branch、接受 Branch 成本、或延長 Branch 存活。
- 在 `ProJED-TEST` 執行破壞性/大量資料/不可逆測試但沒有備份與 cleanup plan。

## 固定 Level 3 路徑

需要保護發布的 Level 3 時，使用既有路徑；快速發布不執行本節：

1. 使用 staging env 建置 production artifact，Supabase 指向 `ProJED-TEST`。
2. 部署 `dist/` 到 Firebase Hosting preview channel `level3-smoke`，預設 `--expires 1d`。
3. 以 Firebase preview HTTPS URL 執行 browser smoke。
4. 若本次風險需要 authenticated/data 證據，使用 staging/test account 建立小型 `LEVEL3-SMOKE-*` 資料。
5. 驗證受影響 auth/read/write/reload 行為；有 fixture 時驗證 cleanup/delete，不為未變動功能建立資料。
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
- 必要 Level 3 案例所依賴的 TEST、Auth redirect、env 或帳號不可用時，該案例標為 blocked，不得偷換成 local-only pass；不為 scoped 未登入資產檢查額外要求測試帳號。

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
- 不採用「只有 build/preview pass 就宣稱 release 完成」；快速路徑在部署後補 canonical 與改動驗證，保護路徑另有必要部署前證據。
- 不採用「把 `ProJED-TEST` 當 production 備份或正式資料副本」。
- 不採用「AI 在沒有授權時自行 production deploy 或自行承擔雲端成本」。

## Local browser canonical origin

為降低測試證據、Auth callback、Cookie／storage origin 與 browser verifier 的分歧，固定測試環境的瀏覽器入口採用：

- Canonical browser origin：`http://localhost:4000/`。
- Vite server 仍可綁定 loopback `127.0.0.1`，但啟動器、測試腳本、Auth redirect、QA/QC 新證據與使用者文件一律使用 canonical origin。
- `127.0.0.1:4000` 僅保留於 bind 設定、相容性 CORS allowlist 或歷史證據；不得作為新的瀏覽器開啟位置。
- `localhost:4000` 與 `127.0.0.1:4000` 視為不同 browser origin。切換後既有 localStorage、Cookie、IndexedDB 與 Service Worker 不視為自動共用；需要時先重建或匯出 local-test fixture。
- 固定入口驗證由 `npm run verify:local-origin` 守門；port 被其他程序占用時，啟動器必須先辨識程序歸屬，不得自動終止未驗證程序。

此段是既有固定測試環境決策的相容性補充，不改 production domain、Supabase API loopback、P9／preview port 或正式部署 gate。

## Docker-free daily development addendum（2026-09-15）

為降低 Windows 開發機的常駐記憶體、CPU 與 C 槽 VHDX 成本，本機完整 Supabase stack 不再屬於預設日常啟動或驗證路徑：

- 日常啟動固定使用 `npm run dev:local`，只啟動 local-test Vite server。
- 日常驗證固定使用 `npm run verify:daily`；`verify:daily:contract` 必須先確認命令相依圖未混入 Docker／本機 Supabase runtime，再執行 `verify:source`。
- 直接需要 Docker 的驗證，集中為 `verify:docker:dev-123-auth-storage`、`verify:docker:dev-123-control-api`、`verify:docker:dev-045-calendar-db`、`verify:docker:dev-047-backup` 四個明確按需入口。
- `verify:dev-123-local-preflight` 與 `verify:dev-047-backup-package` 會間接執行上述本機 stack 驗證，也視為 Docker 例外，不得加入日常命令相依圖。
- 執行例外必須由當次任務明確要求；一般開發、lint、typecheck、build 或 source verification 不構成啟動 Docker 的授權。
- 需要遠端 parity 或 release evidence 時，仍遵循本 ADR 的 `ProJED-TEST`、備份、fixture prefix、cleanup 與 Level 3 gate；不得把日常零 Docker 規則解讀成可直接測 production。

本補充不授權解除安裝 Docker Desktop、刪除 WSL distro／VHDX，或移除既有本機 Supabase 測試。只有在至少兩個完整 Level 3／release-candidate 週期均能由 `ProJED-TEST` 提供所需證據、沒有不可替代的本機 stack 測試，且已確認其他專案不依賴 Docker 後，才可另案評估移除。

## HCS 思考習慣

- `#批判`：避免把 Branch 當成看似專業但對新手更高風險的預設。
- `#效用理論`：以固定 `ProJED-TEST` 換取較低操作成本、較高可重複性與較少權限失誤。
- `#風險控管`：用備份、prefix、cleanup、blocked condition 控制試爆場的破壞範圍。
- `#可驗證性`：需要 Level 3 時留下 preview 與實際受測範圍證據；快速發布留下 canonical 版本與改動驗證。未執行的 TEST read/write 不標 PASS，有 fixture 時需 cleanup evidence。
- `#當責`：AI 可自動判斷 gate，但成本、production、Branch 與破壞性測試仍需要人類授權。
