# [CAPA-001] 正式環境任務永久儲存中與重試重複

CAPA ID：`CAPA-001`  
顯示名稱：`[CAPA-001] 正式環境任務永久儲存中與重試重複`  
Register evidence：`ai-doc/reports/CAPA-Register.md`（新編號序列第一筆；依使用者 2026-09-02 明確授權）  
事件／檔案 legacy key：`CAPA-20260902-01`（僅保留作日期型檔名與歷史追溯，不是現行正式 CAPA ID）  
建立：2026-09-02  
事件日期：2026-09-02  
環境：Production（Firebase Hosting `projed-cc78d.web.app`／Supabase `knodlkxqpcqyrtgwpdst`）  
Production release：`20260831123008-3b5ed2`／commit `13888b27221b4bf9214a5f78e00651a38f32c83f`  
嚴重度：P1  
狀態：Open／Incident Trigger Linkage Pending／Containment Defined／CA-01～CA-02 Candidate Implemented／Effectiveness Pending
關聯任務：DEV-099（儲存狀態收斂）、DEV-100（建立重試冪等）、DEV-101（排序整數契約）

## 1. 不符合、事實與影響

### 1.1 使用者可見不符合

正式環境中，任務「大陸PCT」修改後持續顯示「儲存中」超過 5 分鐘，使用者無法判斷資料是否已保存，也無法正常結束編輯流程。因系統沒有給出成功、失敗或未知狀態，使用者合理地重試；第二筆同名任務已由使用者確認是該次重試建立。

### 1.2 已確認事實

| ID | 事實 | 證據 | 判定 |
|---|---|---|---|
| F-01 | 畫面在 5 分鐘後仍顯示「儲存中」 | 使用者 production 畫面 | Confirmed |
| F-02 | 2026-09-02 09:13:40、09:13:43（Asia/Taipei）後端收到同一任務的 PATCH，均回應 HTTP 204 | Supabase production API log | Confirmed |
| F-03 | 09:22 readback 時，資料庫中的所選任務內容與畫面可見欄位一致，但前端仍為 saving／dirty | Production DB readback＋畫面狀態 | Confirmed |
| F-04 | 同一 parent/order 下存在兩筆「大陸PCT」，建立時間為 09:10:38 與 09:11:27 | Production DB readback | Confirmed |
| F-05 | 第二筆為使用者在狀態不明下進行的重試 | 使用者明確確認 | Confirmed |
| F-06 | 09:11:13 PostgreSQL 記錄 `invalid input syntax for type bigint: "8.5"` | Supabase production Postgres log | Confirmed |
| F-07 | Production artifact 與本機 release manifest 雜湊一致，並非「本機已改但正式環境未部署」 | Hosting release identity＋artifact hash | Confirmed |
| F-08 | 本次診斷期間未看到對應 API 失敗；這不等於所有歷史請求均成功 | 有限時窗 production log | Confirmed within observed window |
| F-09 | Production commit 的 Modal 在呼叫 `updateNode` 前先增加 pending；Store 在 missing node、collection pending、no-op 分支可直接 return 而不回 terminal callback | commit `13888b2`：`TaskDetailsModal.tsx:259-287`、`useWbsStore.ts:1155-1175` | Confirmed control defect |
| F-10 | `persistTaskUpdates` 會補入新的 `updatedAt`，因此從此 Modal 進入 Store 的一般保存通常不會命中 no-op；現有 evidence 也沒有 operation ID 可判定事故實際命中 missing、collection pending、stalled promise 或其他路徑 | Production commit source＋缺少 request correlation | Incident trigger not confirmed |
| F-11 | 以 production-base `13888b27221b4bf9214a5f78e00651a38f32c83f` 建立隔離分支，implementation commit `0de585e` 至 `e00d9ac` 形成 typed dispatch／exactly-once settlement／bounded readback與stale canonical title convergence candidate；verifier commit `7ef9953`、`6eabc3f`、`d2df71e`、`6c9710d` 分別補 race／close／PWA／delayed stale completion；source reproduction 11/11、P01–P12 12/12、1,000/1,000 seeded schedules、local-test B01–B11與390／320 viewport共13/13通過 | `codex/capa-001-dev099@e00d9ac`、`output/qa/dev-099/root-cause-result.json`、`output/qa/dev-099/contract-result.json`、`output/qa/dev-099/property-result.json`、`output/playwright/dev-099/result-b07-stale.json`、screenshots | Candidate evidence confirmed；Supabase TEST與UI provider已補 PASS，release／incident linkage pending |
| F-12 | 唯讀執行 `npm run verify:staging-env` 通過：staging backend 為 Supabase、ref `fhisnnufoeulxqrchldf` 且非 production、public key、OAuth與auto-login policy均符合 | `output/qa/dev-099/supabase-test-preflight-rerun-20260902.json`、`output/qa/dev-099/supabase-project-status-readonly-20260902.json` | Staging preflight fresh 8/8 PASS；authenticated TEST另由F-16／F-17記錄 |
| F-13 | 目前 production 頁面唯讀觀察到兩筆同名「大陸PCT」，為不同 node ID，但共用 parent `card_card-1` 與 order `9` | `output/qa/dev-099/production-duplicate-observation-20260902.json`（2026-09-02T14:22:39.942Z；未執行 production mutation） | Duplicate persisted identities confirmed；使用者已確認第二筆為重試產物；exact persistence trigger仍未證實 |
| F-14 | 最新 production API／Postgres log 唯讀查詢仍無法提供 task persistence operation correlation；API 回傳 sample 未觀察到 `wbs_items` mutation，且未包含 09:13 Asia/Taipei incident window；Postgres 僅見 `8.5` bigint error | `output/qa/dev-099/production-log-correlation-rerun-20260902.json`（2026-09-02T22:35:05.8491981+08:00；未執行 production mutation） | R01～R06 correlation 仍缺失；`8.5` 維持 DEV-101 獨立證據 |
| F-15 | `activity_events` 在 09:00–09:30 Asia/Taipei 記錄多筆 `task_created`；兩筆「大陸PCT」建立相隔 48.566321 秒、同 parent `card_card-1`／order `9`，第一筆 `updated_at=09:13:43.906523` 對上既有 API 204 時間；目前 event type 分布沒有 title／description generic update，且沒有 operation ID 或 audit row | `output/qa/dev-099/production-incident-correlation-rerun-20260902.json`（2026-09-02T22:44:12+08:00；未執行 production mutation） | Duplicate／時間關聯與 observability gap 補強；UI permanent-saving exact trigger 仍未證實 |
| F-16 | 在隔離 Supabase TEST project `fhisnnufoeulxqrchldf` 以專用 authenticated actor 執行 T00～T09：204、型別拒絕、匿名拒絕、stale guard、abort、commit後response-lost、併發、重新登入 readback與清理均通過；`delete_workspace` RPC 權限不足時由 TEST service-role fallback 清理，殘留為 0 | `output/qa/dev-099/supabase-test-result.json`（source `candidate=...@e00d9ac45ca2096da4f73dbf6c45ef15a7f69211`；PASS 10、FAIL 0、BLOCKED 0、NOT_RUN 0） | Supabase TEST authenticated provider evidence PASS；不代表 production release |
| F-17 | 同一候選在真實 Supabase TEST provider 以 UI 進行 authenticated title edit、PATCH 204、關閉後 reload canonical render；U01～U03 PASS。候選 production-base 不含 DEV-098 子任務導覽／Back 元件，U04 保持 NOT_RUN；不得把 root dirty integration code 混入候選結果 | `output/playwright/dev-099/result-supabase-test-ui.json`（source `@e00d9ac`；U01～U03 PASS、U04 NOT_RUN） | Provider save/readback PASS；Back/navigation gate仍未解除 |
| F-18 | TEST UI disposable fixture 已使用 service-role fallback 清理，residual tenant=0；4012 candidate runtime、4013 supplemental runtime與 browser daemon均停止並確認 port released | `output/qa/dev-099/supabase-test-residual-cleanup.json`、`output/qa/dev-099/supabase-ui-fixture.json`、`output/qa/dev-099/supabase-ui-cleanup-20260902.json`、`output/qa/dev-099/runtime-cleanup-supabase-provider-20260902.json` | Cleanup PASS；TEST 管理 RPC `delete_workspace` 仍有 permission denied 證據，列為測試環境權限改善項，不影響本次 fallback cleanup |
| F-19 | root DEV-098 integration supplemental 在同一隔離 TEST fixture 重跑 U01～U04；modal peer → Back 返回原 task、維持單一 modal且無 saving 污染，U04 PASS | `output/playwright/dev-099/result-supabase-test-ui-integrated.json`、`output/qa/dev-099/supabase-ui-integrated-cleanup-20260902.json` | Back/navigation integration supplemental PASS；無 pageerror／request failure，但有 task-filter preference 400與未部署 staging-reference RPC 的404 diagnostics，列為環境／相鄰 scope warning；不改寫 clean DEV-099 candidate 的 U04 NOT_RUN，也不解除 release gate |

| F-20 | canonical root dirty integration 接入 DEV-099 convergence implementation 後，fresh local B01～B11＋390／320 viewport 13/13 與同一 TEST UI U01～U04 均 PASS；DEV-098 QC 與 DEV-046／053／055／095 affected regression 亦 PASS | `output/playwright/dev-099/result-root-local-final.json`、`output/playwright/dev-099/result-root-supabase-ui-final.json`、`output/qc/dev-099/root-integration-result.json` | 同一工作樹整合 evidence PASS；不等同 clean hotfix、Firebase Level 3、production activation 或 release |
| F-21 | 由 production-base `13888b2` 建立 clean integrated branch `codex/capa-001-dev099-integrated`；behavior tree `@105fdbc` 修正 checklist placeholder ref access，`@88a550a`固定 verifier metadata；後續 `@c3af71c`／`@c904435` 僅調整 DEV-098 verifier／QA-SPEC evidence與預期診斷過濾；接入 DEV-098 task-details surface與DEV-099 persistence convergence；TypeScript／build:test與targeted lint PASS，隔離 TEST UI U01～U04 PASS，fixture residual=0、port 4014 released | `output/playwright/dev-099/result-clean-integrated-final-20260903.json`、`output/qc/dev-099/clean-integrated-result.json`、`output/qa/dev-099/supabase-ui-clean-integrated-final-20260903.json` | same-artifact integration candidate evidence PASS；branch current HEAD為 `@60405c4`，後續 `@5bd5200`～`@60405c4`為 release adapter／Release Capsule／hosted Level 3 workflow與env authority修正且未改動 DEV-099 runtime source；current-head revalidation見 `output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`。既有 UI artifact仍 pin behavior `@105fdbc`；正式 release 仍需 current-head Release Capsule／owner sign-off與release gate；hosted Level 3、activation與release仍 pending |
| F-22 | 2026-09-03 continuation readiness 重新核對 source identity、TEST/UI evidence、fixture cleanup與 task-owned port release；未執行新 production mutation或deploy | `output/qa/dev-099/capa-001-continuation-readiness-20260903.json` | Reusable evidence retained；CAPA 仍受 exact trigger、owner sign-off、clean release boundary與effectiveness gates阻擋 |
| F-23 | 2026-09-03 重新以 production Supabase ref `knodlkxqpcqyrtgwpdst` 查詢事故窗；`activity_events=7`、`audit_logs=0`，兩筆「大陸PCT」同 parent／order、建立相隔 48.566321 秒，但 activity payload 無 operation ID | `output/qa/dev-099/production-incident-correlation-live-20260903.json`（唯讀） | Temporal／duplicate correlation refreshed；R01～R06 exact trigger 仍 `NOT_PROVEN`，不得宣稱 production fixed |

### 1.3 影響與邊界

- 目前所選任務的可見欄位已在 production DB readback 中確認保存，沒有證據顯示該筆資料遺失。
- 系統顯示與後端實際狀態分歧，形成「假性未完成」；使用者只能靠重試猜測，導致資料重複。
- 非整數排序值可使寫入在 DB 邊界失敗，影響新增、拖放、插入及其他共用排序路徑。
- 缺乏 request correlation ID，現有 API log 無法把每一筆 204 精確對回單一 UI persistence token；這是可觀測性缺口，不影響「UI 已永久不收斂」與「DB 已保存」的事實。
- 09:11:13 的 `8.5` bigint error 與本事件時間接近，但目前沒有 operation correlation 可證明它造成 09:13 的保存 spinner；先列為已確認的獨立系統缺陷，不併入主要事故根因。
- 本文件不授權刪除 production 重複資料、修改 schema、部署或執行 production mutation。

## 2. Immediate containment／Correction

| ID | 立即措施 | 執行條件／邊界 | Owner | 狀態與證據 |
|---|---|---|---|---|
| CT-01 | 對本事件停止反覆按儲存或再新增同名任務；先以 canonical readback 判斷結果 | 避免未知狀態放大為更多重複資料 | Support／User | 已通知原則；是否已停止待確認 |
| CT-02 | 對目前卡住頁面，在已確認 DB readback 一致後重新整理，使前端重新 hydrate canonical state | 僅處理前端卡住；不宣稱修正根因 | User／Support | 建議執行，未由本 CAPA 代操作 |
| CT-03 | 保留 09:10:38 與 09:11:27 兩筆資料，不先刪除或合併 | 需使用者先指定 canonical row，並保留 audit evidence | Data owner | Active containment |
| CT-04 | 受影響 persistence flow 在修正與驗證完成前列為 P1 release stop condition | 不以清除 spinner、放寬錯誤或手動改 DB 作為 hotfix；application-only 與 database change 分開定義 release profile | PM／Release owner | 待納入 release gate |
| CT-05 | 保存 release ID、API/Postgres 時戳、row readback 與畫面證據 | 不保存敏感 payload 或憑證 | QA／QC | 診斷證據已取得；正式 evidence pack 待建 |

針對重複資料的 correction：由使用者確認哪一筆是 canonical，之後才可透過既有 archive／recycle-bin 流程處理重試筆；若產品沒有可追溯的 archive 路徑，需先導出該 row 的必要 audit evidence。禁止以未核准 SQL 直接刪除。

## 3. Root Cause Analysis（多層次）

### 3.1 暫定因果鏈（待 DEV-099 重現／關聯）

```text
TaskDetailsModal 將一次嘗試登記為 pending
  → Store 可能在未找到 node／collection pending時直接 return，或 persistence promise／callback 未結案
  → 該次嘗試沒有 success 或 error terminal callback
  → pending count 永遠無法歸零，UI 永久顯示「儲存中」
  → 使用者在結果不明下重試
  → 一般任務 create 沒有冪等 operation key／唯一防線
  → 第二筆同名任務被建立

獨立的共用資料契約缺口（尚未證實位於上述事故鏈）：
前端部分排序路徑產生 8.5 等小數
  → wbs_items.sort_order 為 bigint
  → production DB 拒絕寫入
  → 造成另一類可重現的寫入失敗
```

### 3.2 控制缺陷、暫定根因與獨立缺陷

| ID | 層次 | 分類／狀態 | 機制與來源 |
|---|---|---|---|
| RC-01 Persistence terminal contract 不完整 | Component／Store | Confirmed control defect；incident linkage pending | Production commit `TaskDetailsModal.tsx:259-287` 先設 saving 並增加 `pendingPersistCountRef`；`useWbsStore.ts:1155-1175` 在 missing node、collection pending、no-op 可直接 return，沒有 terminal callback。控制上每次 increment 並不保證 settle exactly once；但本事件實際命中分支仍待 DEV-099 證明。 |
| RC-02 沒有 bounded unknown／readback recovery | UI state machine | Confirmed contributing control gap | Modal 以 scalar pending count 等 callback，沒有 request deadline、unknown 狀態或 canonical readback 收斂；不論底層 trigger 為何，該缺口允許 UI 在 DB 已保存後仍永久卡住。 |
| RC-03 排序資料契約不一致 | Domain／DB | Confirmed independent defect；incident linkage unconfirmed | `wbs_items.sort_order` 為 bigint，但多個前端排序路徑可產生小數；Production 已實際出現 `8.5` bigint error。由 DEV-101 獨立處理，不作為主要 CAPA 關閉條件。 |
| RC-04 一般任務建立缺乏冪等保護 | Service／DB | Confirmed control gap；retry outcome confirmed | 一般任務 create 直接 insert，沒有一般 create operation key/read-before-replay。第二筆已由使用者確認是重試產物；重試的產品語意與 key lifetime 仍須由 DEV-100 固定。 |
| RC-05 驗證與 release gate 未覆蓋真實 persistence convergence | QA／Release | Confirmed escape cause | 現行證據沒有 authenticated task edit→terminal UI→reload readback→single-row 的同 artifact production-bound gate，因而未阻擋永久 saving 與重試重複。 |

### 3.3 根因確認缺口與必要證據

DEV-099 在進入 implementation 前必須以 production commit 或忠實 fixture 完成至少一項可重現證據：

1. 證明 missing node、collection pending、stalled provider promise／callback 或其他分支中的哪一條會留下未結案 pending。
2. 記錄同一次 operation 的 caller accepted、Store branch、provider request、terminal result與 UI owner；不得只靠時間接近推定。
3. 驗證 no-op 是否實際可由任務明細路徑觸發；因 `updatedAt` 會更新，未證明前不得把 no-op 寫成事故原因。
4. 若上述假設均無法重現，停止實作既定修法，回到 runtime trace／provider lifecycle 重新做 RCA。

### 3.4 不是根因的項目

- 使用者重試不是根因；在 UI 無限顯示「儲存中」且沒有可判定狀態時，重試是合理行為。
- 瀏覽器 Console 沒有 error 不代表保存成功或失敗；此事件中的缺口發生在狀態契約與可觀測性。
- 單純延長等待時間不能修正沒有 terminal signal 的 ghost request。
- 單純將 spinner 隱藏會製造假成功，不能作為 CA。

### 3.5 暫定五個為什麼

1. 為什麼畫面一直儲存中？高信心推定至少一筆前端 pending persistence 沒有被 settle；仍待 operation trace 證實。
2. 為什麼可能沒有 settle？已知 Store 有 callbackless early return，provider lifecycle 也沒有 bounded terminal guard；實際命中路徑未知。
3. 為什麼這些路徑可留下未結案狀態？因 `updateNode` 是 callback＋`void` 契約，沒有強制所有接受／拒絕分支回傳可判定 outcome。
4. 為什麼使用者重試後會多一筆？因一般任務 create 不具同 operation replay 的冪等保護，UI 也沒有提供可恢復的 unknown/readback 狀態。
5. 為什麼 production 前沒發現？因測試與 release gate 沒驗證 persistence exactly-once settlement、bigint 排序契約及「重試仍只產生一筆」的 production-bound flow。

主要系統性控制缺口：`mutation 的接收、持久化與 UI 完成狀態沒有共同的 operation identity 與 exactly-once terminal contract。` 排序型別不一致是另一個已確認缺陷，獨立追蹤。

### 3.6 反事實檢查

- 若每次被 Modal 登記的 persistence 都必定回傳 `persisted | noop | blocked | missing | failed | unknown`，本次 pending 不會永久懸空。
- 若一般任務 create 以穩定 operation key 冪等處理，使用者重試仍只會得到原 row，不會產生第二筆。
- 若 persistence boundary 強制 `Number.isSafeInteger(order)` 或 server 以 canonical integer rank 計算順序，`8.5` 不會抵達 bigint 欄位。
- 若 release gate 包含 authenticated edit／rapid blur／reload／single-row readback，本缺陷應在 production 發布前被阻擋。

## 4. Corrective Actions（CA）

| ID | 對應根因 | Corrective Action | 驗收證據 | Owner | 狀態 |
|---|---|---|---|---|---|
| CA-01 | RC-01 | 在 DEV-099 先確認實際 trigger，再固定 persistence boundary 的 discriminated terminal outcome。所有接受／拒絕分支必須 exactly once 收斂為 `persisted／noop／blocked／missing／failed／unknown` 等可判定結果；caller 只追蹤已接受的 operation，cleanup 必須由 finally／等價不可漏路徑保證。禁止 callbackless early return。 | 根因重現＋contract test 覆蓋 success、failure、missing、pending、no-op；每個 accepted operation 恰有一個 terminal result | RD | Candidate implemented；local與隔離 Supabase TEST T00～T09 PASS；incident linkage仍 pending |
| CA-02 | RC-01、RC-02 | 在 SPEC-099 明示取代 SPEC-098「不得 timeout／unknown／readback」舊約束後，加入有界限的 unknown 與 canonical readback。資料結構採最小可證明方案，不預先限定 Set／Map；task switch/unmount 只取消 UI ownership，不推導 mutation 成敗。 | fake clock＋race test；在 provider contract 定義的 deadline 內進入 saved／failed／unknown，且無 leaked owner／false success | RD | Candidate implemented；local與隔離 Supabase TEST T00～T09 PASS；UI U01～U03及root DEV-098 supplemental U04 PASS；clean candidate U04仍不在其 source scope，release仍 pending |
| CA-03 | RC-04 | 由 DEV-100 先固定「同一次建立操作」的 identity 與 lifetime，再以 client operation key＋DB unique/RPC 等權威機制實作 idempotent replay；response 回傳 canonical row ID，UI retry 沿用同一未決 key。 | 同 key sequential／parallel／response-lost retry 只有一 row；不同 operation 可建立不同任務 | RD／DB | Future Phase Captured |
| CA-04 | RC-03 | 由 DEV-101 建立單一 Task Order Contract。建議採 bigint-compatible integer canonical order；在 persistence boundary 拒絕非 safe integer。此為獨立缺陷，不與 DEV-099 hotfix 同批膨脹。 | 全寫入路徑 contract/property test；DB roundtrip 無 decimal order | RD／DB | Independent／Decision Pending |

CA-04 需要架構決策：

- 建議方案：維持 DB `bigint`，統一改為 integer gap／server canonical reindex。效用較高，因目前多個 migration、索引、RPC 已依賴整數排序，避免 live type migration。
- 替代方案：將 schema 改為 `numeric`。只有在產品明確需要長期 fractional ranking、完成 migration 影響盤點與效能驗證後才可採用。
- 在決策完成前，最小安全行為是 fail-closed：非整數 order 不送 DB，顯示可恢復錯誤；不得用 `Math.round` 靜默改變相對順序。

## 5. Preventive Actions（PA）

| ID | 對應根因 | Preventive Action | Gate／證據 | Owner | 狀態 |
|---|---|---|---|---|---|
| PA-01 | RC-01、RC-02 | 建立有限 adversarial persistence matrix：autosave timer、blur、explicit save、same-value no-op、realtime refresh、task switch、unmount、response lost、close while pending、PWA reload safety；若導入 property test，再跑總計至少 1,000 個固定 seed schedules | 所有列舉案例 PASS；可選 seeded run總計 1,000，不是每種交錯各 1,000；0 leaked operation、0 永久 saving、pending close不丟稿、unsafe state 不得 reload | QA | Local property P01～P12 12/12、1,000/1,000 schedules；local UI B01～B11＋390／320 viewport共 13/13 PASS；B07 delayed stale completion已覆蓋；Supabase TEST T00～T09、候選U01～U03及root整合U04 PASS，clean candidate U04 source boundary仍明示 NOT RUN |
| PA-02 | RC-01、RC-02 | Provider contract failure injection：204、400、401、403、409、timeout、offline、response lost、readback stale/newer | 每案在 deadline 內呈現真實 terminal/unknown；不得 false success | QA | Local-test B01–B11 executed（含 B07 delayed stale completion）；隔離 Supabase TEST T00～T09 authenticated matrix PASS；U04 Back未在DEV-099候選執行，完整 release fault gate仍非 PASS |
| PA-03 | RC-03 | Schema/source static gate：所有寫入 `wbs_items.sort_order` 的路徑只接受 safe integer；property test 產生拖放／插入／mind-map 組合 | 非整數在 client boundary 被拒；TEST DB 0 bigint syntax error | QA／DB | Proposed |
| PA-04 | RC-04 | Idempotency gate：single click、double click、5 秒後 retry、兩分頁 concurrent retry、response lost 後 retry | 同 operation key 最終 exactly one row；readback ID 一致 | QA／DB | Proposed |
| PA-05 | RC-05 | Layer 3 與未啟用的 production-bound candidate 加入 authenticated disposable task flow；啟用後另做 canonical production smoke | 同 artifact、同 release capsule、分離 activation decision，evidence 完整才可 activate/close | QA／QC／Release owner | Proposed |
| PA-06 | RC-05 | 建立 production 指標與警示：saving 超過 provider deadline、unknown readback、duplicate replay、order contract rejection | T+7／T+30 review；不含任務正文／個資 | Ops／PM | Proposed |
| PA-07 | RC-01、RC-04、RC-05 | 建立可關聯的最小 mutation telemetry：operation ID、flow、accepted/terminal result、duration、release ID；不記錄任務正文 | 單次 fixture 可由 UI trace 關聯到 API／DB terminal result | RD／Ops | Candidate local provider-attempt trace executed；production telemetry／release ID correlation pending |

## 6. CA／PA 可追溯矩陣與效用判斷

效用評分採「風險降低／實作成本／副作用」判斷；不是以改動行數或測試數量代表價值。

| Root Cause | CA | PA | 主要完成證據 | 效用判斷 | 建議流向 |
|---|---|---|---|---|---|
| RC-01 terminal contract 缺口 | CA-01、CA-02 | PA-01、PA-02、PA-07 | 根因重現、exactly-once outcome、race/failure matrix | 最高：先證實 trigger，再以最小 contract 修正永久 saving與假成功 | DEV-099＋QA/QC |
| RC-02 無 bounded recovery | CA-02 | PA-01、PA-02、PA-06、PA-07 | deadline→unknown→readback 閉環、telemetry | 高：把不可判定狀態轉為可恢復狀態；不得用 timeout 掩蓋慢請求 | DEV-099＋observability gate |
| RC-03 order 型別不一致 | CA-04 | PA-03、PA-05、PA-06 | integer contract、TEST/production-bound roundtrip | 高但獨立：已造成 production DB error，與 hotfix 分離避免錯誤歸因與範圍膨脹 | DEV-101／future phase capsule |
| RC-04 create 無冪等 | CA-03 | PA-04、PA-05、PA-07 | same-key sequential/parallel exactly one row | 最高：直接阻止合理重試製造重複資料 | DEV-100／Lane 3 |
| RC-05 release coverage 缺口 | — | PA-05、PA-06、PA-07 | authenticated same-artifact evidence pack | 高：防止同類缺陷再次進 production；不以大量 source test 取代關鍵 flow | deployment release gate＋QA/QC checklist |

## 7. 開發與文件流向（已登錄，candidate 已實作／正式釋出未授權）

RD 技術主管審查：`ai-doc/reports/RD-TECH-LEAD-REVIEW-CAPA-001.md`；結論為「有條件通過（candidate／clean integration only）」：CA-01／CA-02 候選可進入局部驗證；clean integrated與canonical root Back整合已補驗，但 exact incident linkage、owner sign-off、完整 QA/QC、release 與 effectiveness 仍是阻擋項目。

### 7.1 DEV-099：P1 Application Persistence Convergence

- 成熟度：`RD Contract Ready / Candidate + Clean Integration Implemented / Incident Trigger Linkage Pending`；尚未取得正式 `RD Implementation Ready`／release approval。
- Risk：Application/API client contract，預設 Lane 2；若根因要求 schema、權限或正式資料 mutation，立即停止並改走 Lane 3 review。
- Scope：根因重現、CA-01、CA-02 與最小 PA-07 correlation；候選已在乾淨 production-base worktree 實作，仍不得順手重構其他 task detail UI，也不得建立 production unique constraint。
- Acceptance：每個 accepted persistence operation exactly once 結案；deadline 後只能顯示 failed／unknown並 canonical readback，不得 false success。
- Source boundary：hotfix 必須由 production base `13888b27221b4bf9214a5f78e00651a38f32c83f` 的乾淨 worktree／等價隔離分支建立；目前 dirty branch 中 DEV-098 等未提交變更不得默認混入。已建立 `codex/capa-001-dev099-integrated`（behavior `@105fdbc`、verifier metadata `@88a550a`，目前 HEAD `@60405c4`）並完成同一 artifact U01～U04；`@c3af71c`／`@c904435`屬 verifier／QA-SPEC／預期診斷過濾的 test-only overlay，`@5bd5200`～`@60405c4`屬 release adapter／Release Capsule／hosted Level 3 workflow與env authority修正，未改動 DEV-099 runtime source。canonical root integration仍僅作 supplemental，不能取代 owner sign-off或 release gate；正式 release 仍須以 current HEAD pin Release Capsule並完成 owner sign-off。
- Candidate evidence：`codex/capa-001-dev099` @ latest `e00d9ac`（保留 implementation `0de585e`、verifier `7ef9953`、browser `6eabc3f`／`d2df71e`／`6c9710d`）；`codex/capa-001-dev099-integrated@60405c4`固定DEV-098 surface＋DEV-099 convergence；`scripts/verify-dev-099-task-persistence-convergence.ts` 11/11、`scripts/verify-dev-099-task-persistence-property.ts` P01–P12 12/12＋1,000/1,000 seeded schedules；local-test browser B01–B11（含 same-value／rapid-save／delayed stale completion／task-switch／unmount／close-pending／PWA reload-safety recovery）與390／320 viewport共13/13通過；隔離 Supabase TEST T00～T09 10/10、clean candidate UI U01～U03 PASS、clean integrated UI U01～U04 PASS；current-head TypeScript、targeted ESLint、test build、release adapter self-check與runtime cleanup evidence已建立（`output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`）。真實 production provider readback、hosted Level 3 artifact、release與production smoke仍 NOT RUN；既有 UI artifact pin 在 behavior `@105fdbc`，正式 release前須重建／核准 current-head Release Capsule。
- Stop condition：事故 trigger 未重現、false success、資料遺失、未授權 schema mutation、無法 canonical readback，或 source boundary 不可證明；在此之前不得宣稱 CAPA closed。

### 7.2 DEV-100：Task Create Retry Idempotency

- 成熟度：`Future Phase Captured / Lane 3 / Not Requested`。
- Scope：先固定「同一次建立操作」的 identity、key lifetime與跨分頁／response-lost語意，再評估 unique constraint或 authoritative RPC；不得以 title／parent／短時間窗猜測重複。
- Acceptance：同 operation key sequential、parallel、response-lost retry exactly one row；不同 operation 可建立兩筆同名任務。
- 關閉關係：這是重試重複結果的主要 CA track，需完成才能關閉 CAPA 的 duplicate effectiveness；不阻塞 DEV-099 的儲存收斂實作。

### 7.3 DEV-101：Task Order Integer Contract

- 成熟度：`Future Phase Captured / Lane 3 / Independent Closure`。
- Scope：盤點所有 canonical order writers，決定 bigint-compatible integer rank 或經核准的 numeric migration；目前建議維持 integer canonical order。
- Acceptance：拖放、插入、Mind Map、context menu、tracking/primary placement 與 backup roundtrip 都不讓非 safe integer 抵達 bigint boundary。
- 關閉關係：此為已確認但事故連結未證實的獨立缺陷；保持 P1 追蹤，但不作為主要 CAPA closure blocker。

### 7.4 文件流向

- CAPA：本文件，保留 root cause、CA/PA、effectiveness 與 reopen 規則。
- `dev_task`：已依使用者「修改相關文件」授權登錄 DEV-099～101；DEV-099 已形成 clean-branch candidate、local evidence與隔離 Supabase TEST provider evidence，但尚未計入正式產品交付；DEV-100／101 仍為 future capsule，不表示已授權實作。
- Spec：`SPEC-099` 是 persistence convergence 的新權威，並對 `SPEC-098` draft guard 形成明示 `Intentional replacement`；order／idempotency僅保留 future capsule，待重啟才展開新 SPEC／ADR。
- QA：`QA-DEV-099` 固定根因證據與有限 adversarial matrix；DEV-100／101 尚未展開 QA，不得預填 PASS。
- QC：以同一 commit／artifact 執行事實驗證，獨立判定 PASS/FAIL；本輪候選 QC 紀錄為 `ai-doc/qc/QC-DEV-099-task-persistence-convergence.md`，結論僅為 candidate conditional PASS，未解除 CAPA closure gates。
- Release gate：納入 authenticated persistence/readback/idempotent cleanup；本輪已完成 TEST provider與fixture cleanup，仍不得以首頁 smoke 或 bundle identity 取代 Back整合、Layer 3／Layer 4、activation與post-deploy evidence。
- SOP/checklist：僅加入本專案的 mutation terminal/idempotency/order/release checklist；目前無需改跨專案 skill。

### 7.5 Release profile 與 activation boundary

- DEV-099 若只改 application/client contract，採 Lane 2：Layer 1 targeted tests、Layer 2 exact artifact、Layer 3 affected integration、適用時的 Layer 4 inactive production-bound candidate、一次明確 activation decision、canonical post-deploy smoke。
- DEV-100／101 若含 schema／unique constraint／RPC／正式資料修正，採 Lane 3：除所有適用層外，必須有 migration artifact fingerprint、TEST rehearsal、idempotence/readback、backup/rollback readiness 及正式資料操作的明確授權。
- 使用同一 Release Capsule 綁定 source SHA、application artifact、migration digest、candidate、previous production target 與 evidence。相同 release ID 的重試只能續跑，不得重建第二個 candidate。
- Production 正在服務流量的站點不是測試環境；Layer 4 僅能由未啟用、零一般流量的 production-bound candidate 或文件化的 provider-native equivalent 滿足。若 Firebase／Supabase 架構沒有可證明的 Layer 4 機制，必須 fail closed 並補 Project Release Adapter，不得用 staging 冒充。

## 8. Effectiveness Verification Plan

| Level／時點 | 驗證 | 通過條件 | 目前狀態 |
|---|---|---|---|
| Root-cause verification | production commit／忠實 fixture重現與 operation trace | 可指出留下 pending 的確切分支；若假設不成立則回到 RCA | PARTIAL：source callbackless path reproduced；incident exact trigger pending |
| Source/Contract | DEV-099 update terminal boundary；DEV-100/101 分案追蹤 | 無 callbackless accepted operation；idempotency／order不混入 hotfix | Candidate PASS 11/11；clean branch only |
| Local deterministic | P01–P12 state-machine cases＋總計 1,000 個 seeded schedules | 0 leaked operation、0 permanent saving、0 false success | PASS：P01–P12 12/12、1,000/1,000 schedules；local-test B01～B11＋390／320 viewport 13/13 PASS |
| Supabase TEST | DEV-099：204/4xx/409/timeout/response-lost；DEV-100/101 各自啟動後另驗 | UI terminal 正確；其他分案不得以 DEV-099 evidence 冒充 | PASS：`supabase-test-result.json` T00～T09 10/10；UI U01～U03 PASS，U04 因候選不含DEV-098維持 NOT RUN |
| Level 3 browser | desktop＋390×844；edit/rapid blur/reload/task switch/unmount/close-pending/PWA reload safety | 在 provider deadline 內收斂或進入可恢復 unknown；內容 readback 一致；unsafe state 不得 reload | PARTIAL：canonical root local B01～B11＋390／320 viewport 13/13，Supabase TEST UI U01～U04 PASS；Firebase Level 3與clean hotfix artifact仍 NOT RUN |
| Predeploy | 同一 commit frontend＋DB contract＋migration history＋cleanup plan＋Release Capsule | 所有 evidence scope 一致，無未套用必要 migration，rollback target 已知 | NOT RUN |
| Layer 4 candidate | 未啟用的 production-bound candidate，執行 production-only auth/env/data compatibility 與受影響 authenticated smoke | candidate 保持零一般流量；artifact/migration digest 一致；fixture cleanup=0 residual | MECHANISM TO CONFIRM／NOT RUN |
| Activation | 獨立 go/no-go，固定 candidate 與 previous production target | evidence 未失效、rollback ready、不得重建 artifact/candidate | NOT AUTHORIZED／NOT RUN |
| Canonical post-deploy T+0 | production canonical entrypoint 與最小 feature smoke | 正確 release identity、無 critical runtime error、saved/unknown recovery 正確、reload 一致 | NOT AUTHORIZED／NOT RUN |
| T+7／T+30 | telemetry review＋受影響 flow 抽查 | saving 超過 deadline=0、same-key duplicate=0；order 指標由 DEV-101 獨立追蹤 | NOT RUN |

### Closure Rule

CAPA 的主要「永久 saving＋重試重複」範圍只能在以下條件全數成立後關閉：

1. DEV-099 已確認實際 incident trigger；CA-01、CA-02 及其 PA-01、PA-02、PA-05～07 有可重現證據，且不是以猜測性修法通過。
2. DEV-100 已固定 retry operation 語意，CA-03／PA-04 的同 key sequential、parallel、response-lost exactly-one-row evidence 通過。
3. 各分案適用的 Supabase TEST、Layer 3、同 artifact predeploy、inactive Layer 4 candidate、activation gate 與 canonical post-deploy smoke 均 PASS；不可用的 Layer 4 機制須由核准的 Project Release Adapter 說明，不得以 staging 替代。
4. 原事件的重試 row 已由資料 owner決定保留或以可追溯方式 archive；不能以直接刪除當成技術成效證據。
5. T+7 與 T+30 effectiveness threshold 通過。

DEV-101／RC-03 維持獨立 P1 closure；它不阻塞上述主要 CAPA 關閉，但在自己的驗證與 release gate 完成前不得標示 order defect 已關閉。

主要CAPA在以下任一發生時判定ineffective並reopen：任何永久saving、同operation key產生多row、DB已成功但UI顯示失敗且無readback recovery，或production-bound smoke無法完成cleanup。非整數order抵達DB則reopen DEV-101獨立track。

## 9. 人工決策與授權邊界

| Decision | 建議 | 決策者 | 未決前限制 |
|---|---|---|---|
| D-01 哪一筆「大陸PCT」為 canonical | 由使用者依內容／時間確認；預設不刪任何一筆 | User／Data owner | 不做 production archive/delete |
| D-02 order 採 bigint integer rank 或 numeric | 建議 bigint-compatible integer canonical order | RD lead／DB owner | 只可 fail-closed，不可 silent round／live migration |
| D-03 是否登錄分案與明示取代 SPEC-098 persistence 約束 | 已由使用者本輪「修改相關文件」授權：登錄 DEV-099～101；SPEC-099 對 SPEC-098 persistence guard 為 `Intentional replacement`；後續使用者明確要求「完成 CAPA-001 措施」後，另授權在 production-base clean worktree 形成 non-production candidate並做局部驗證 | User／PM | 候選不得整合目前 dirty root、不得改 DB／正式資料、不得 deploy／activate／release |
| D-04 是否建立 candidate、啟用與執行 production smoke | TEST＋Layer 3 PASS、Release Capsule／rollback ready、Layer 4 mechanism 確認後再分階段核准 | Release owner／User | 不部署、不啟用、不做 production mutation |

## 10. 結論

本事件不是使用者操作問題。已確認的是 UI／Store 存在可漏結案的 terminal contract、UI 無 bounded recovery、一般 create 無冪等防線，以及 release gate 未驗真實保存閉環；第二筆確由使用者在未知狀態下重試建立。永久 saving 的確切 runtime trigger 尚未由 operation evidence 證實，因此 DEV-099 必須先做根因驗證。`8.5`／bigint 則是已確認但事故連結未證實的獨立缺陷，由 DEV-101 追蹤。

本 CAPA 已完成控制缺陷、暫定因果、矯正／預防措施、分案、驗證門檻與授權邊界；CA-01／CA-02 已在 production-base 隔離分支形成候選實作，並完成 local source／deterministic／browser、隔離 Supabase TEST authenticated provider evidence（T00～T09 10/10）與 canonical root integration U01～U04 PASS。但歷史事故的 exact runtime trigger、DEV-100 retry idempotency、clean hotfix artifact／required regression、Firebase Level 3／production-bound inactive candidate、activation、canonical post-deploy smoke與T+7/T+30 effectiveness尚未完成，因此維持 Open，不宣稱正式環境已修復。

## 11. 執行更新紀錄

- 2026-09-02：依使用者授權完成隔離 Supabase TEST authenticated matrix T00～T09（10/10 PASS）與同一 candidate 的 UI U01～U03 provider smoke；U04 Back/navigation因candidate不含DEV-098 surface維持 NOT RUN。TEST fixture residual=0；4012 candidate、4013 supplemental與browser daemon均已停止並確認port released。`delete_workspace` TEST grant不足由service-role fallback清理，列為測試環境權限改善項。
- 2026-09-02：同步更新 CAPA、SPEC、QA、QC、dev_task與documentation map 的 evidence ledger；CAPA維持 `Open / Incident Trigger Linkage Pending / Effectiveness Pending`，未執行 production mutation、deploy、activation或post-deploy smoke。
- 2026-09-03：canonical root dirty integration 接回 DEV-099 convergence implementation，fresh local B01～B11＋390／320 viewport 13/13與 Supabase TEST UI U01～U04均PASS；`output/qc/dev-099/root-integration-result.json`記錄同一工作樹 evidence與cleanup。此不取代 clean hotfix、exact trigger、Firebase Level 3或release gate。
- 2026-09-03：由 production-base `13888b2` 建立 clean integrated branch `codex/capa-001-dev099-integrated@d650098`，接入 DEV-098＋DEV-099並完成 TypeScript／build:test、Supabase TEST UI U01～U04 PASS；fixture residual=0、4014 released；`output/qc/dev-099/clean-integrated-result.json`記錄 same-artifact evidence。此不解除 exact trigger、owner sign-off、Firebase Level 3或release gate。
- 2026-09-03：production-bound readiness strict read-only probes PASS（production public contract、server keys／target、canonical redirect、credential rotation marker、REST/admin/management reachability）；artifact=`output/qa/dev-099/production-bound-readiness-20260903.json`。此僅證明設定與唯讀可達性，不是 Layer 4 candidate validation、production smoke或release approval；未執行 production mutation、deploy或activation。
- 2026-09-03：clean integrated branch目前 HEAD為 `@60405c4`；`@5bd5200`～`@60405c4`完成 release adapter、Release Capsule、hosted Level 3 workflow與env authority修正邊界，未改動 DEV-099 runtime source；current-head deterministic/property、TypeScript、build:test、targeted lint與release adapter self-check PASS，見 `output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`。既有 U01～U04 artifact仍 pin behavior `@105fdbc`，正式 release前須以 current HEAD建立並核准 Release Capsule並取得 hosted Level 3 artifact，CAPA維持 Open。

### Gate capability assessment（2026-09-03）

| Gate | 本輪能否執行 | 已執行／目前結果 | 尚缺條件 |
|---|---|---|---|
| R01～R06 incident correlation | 可做唯讀查詢與證據整理 | 已查 production log／`activity_events`／`wbs_items`；無 operation ID 或 update audit，exact trigger 維持 `NOT_PROVEN` | 正式環境需補 operation telemetry 或可重建的 request correlation |
| Current-HEAD Release Capsule | 可準備，但不可虛構 artifact | integrated `@60405c4` clean，既有 UI artifact仍 pin behavior `@105fdbc`；hosted Level 3 workflow已入版但尚未執行，未建立 current-HEAD production artifact | 由 release owner 提供／配置 clean branch 的 production public env authority，重新 build、Layer 2、artifact digest與capsule pin |
| Firebase Layer 3／Layer 4 | 工具可執行 preview／inactive candidate，但本輪不安全直接執行 | 現有 adapter 仍綁 DEV-083；production-bound readiness 僅唯讀 PASS | DEV-099 current-HEAD candidate、feature-level authenticated smoke、production-bound disposable fixture／cleanup與rollback target |
| Owner sign-off／activation | 只能產出決策包，不能代替責任人核准 | 尚未核准 | DEV-098 owner與release owner明確 go／no-go decision |
| Canonical post-deploy smoke | 必須在 activation 後執行 | 未執行，因尚未 activation | 合法 activation、expected release provenance與正式 URL |
| T+7／T+30 effectiveness | 時間條件未到，不能提前宣稱 | `NOT_RUN_UNTIL_T0_RELEASE` | T0 release後的監測窗口與 evidence owner |
- 2026-09-03：同一 clean integrated `@60405c4` worktree 以 task-owned runtime 4015 完成 DEV-098 adjacent regression：static 22/22、pure 10/10、browser B01～B16 16/16（diagnostics 0）、independent QC 10/10；DEV-046／053／055／095 affected cases PASS且未使用 waiver，runtime／port 4015已釋放。此補強整合證據，不解除 R01～R06、owner sign-off、hosted Level 3、activation或release/effectiveness gates。
- 2026-09-03：重新以 production Supabase ref `knodlkxqpcqyrtgwpdst` 做事故窗唯讀 correlation；`activity_events=7`、`audit_logs=0`，兩筆「大陸PCT」同 parent／order且建立相隔 48.566321 秒，但 activity payload 無 operation ID，R01～R06 exact trigger 仍為 `NOT_PROVEN`。artifact=`output/qa/dev-099/production-incident-correlation-live-20260903.json`；未執行 production mutation、migration或release。
