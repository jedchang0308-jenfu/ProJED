# QA-DEV-099：任務儲存狀態收斂驗證計畫

- 關聯 DEV：DEV-099
- 依據：`SPEC-099-task-persistence-convergence.md`、`CAPA-001`
- 文件狀態：`QA Executed / Candidate Local + Supabase TEST Provider PASS / Clean Integrated U01–U04 PASS / DEV-098 Adjacent Clean Integration B01–B16 + QC PASS / Hosted Level 3 PASS / Production Candidate + Activation PASS / T+0 Released / Incident Trigger Linkage NOT_PROVEN / Effectiveness Follow-up Pending`
- 風險等級：P1
- 日期：2026-09-03

## 1. 驗證目標與宣告邊界

本計畫先證明永久 saving 的 exact trigger，再驗證「只有 accepted operation進入 saving、每個 accepted operation恰好一次結案、unknown可安全讀回」的契約。任何 plan、source review、舊 DEV-098 PASS或 production 204 log都不能預填本計畫 PASS。

本輪已在 `codex/capa-001-dev099`（production-base `13888b27221b4bf9214a5f78e00651a38f32c83f`）執行 source/deterministic harness、local-test browser candidate smoke與隔離 Supabase TEST authenticated provider matrix；另在 canonical root dirty DEV-098 integration工作樹補跑 local browser 13/13與同一 TEST fixture UI U01～U04。其後以 production-base 建立 `codex/capa-001-dev099-integrated`，在同一 clean worktree完成 DEV-098 static 22/22、pure 10/10、browser B01～B16 16/16（diagnostics 0）與獨立 QC 10/10，並重跑 DEV-099 U01～U04；current-head deterministic/property、TypeScript、build:test、targeted lint與release adapter self-check亦已重跑 PASS。T+0 release overlay 已另以 clean release worktree 封存並完成 Firebase candidate、acceptance與live activation；正式 artifact、production-bound fixture readback、canonical URL browser smoke與OAuth safe-cancel均 PASS。R01～R06 的歷史 incident correlation仍未完整，故不得把 production release當成 CAPA closure。

### 1.1 T+0 production release evidence

- release：`20260902193607-61ff71`；source commit：`0743ef1dd8f09beffbd58db3b930d8b1197fab52`；Firebase Hosting：`https://projed-cc78d.web.app`。
- hosted Level 3：run `33674154248` PASS；candidate acceptance PASS；production-bound feature smoke 的 save／canonical readback／close-reopen／reload persistence PASS；fixture cleanup `residualRows=0`。
- activation：artifact provenance 35/35、browser smoke PASS、OAuth safe-cancel `302`、credential rotation PASS；live `release-meta.json` 已回讀同一 release/source。完整 evidence 位於 `output/release/dev-099/20260902193607-61ff71/`。
- naming release overlay：source `7e4aba851529f74790da20c1dc02cc1cbe9fd2d3`、release `20260903035254-d4cf46`、Hosted Level 3 run `33712826895` PASS；candidate／activation與canonical smoke PASS，線上 bundle舊詞 0、新詞 26，完整 evidence 位於 `output/release/dev-099/20260903035254-d4cf46/`。

## 2. Exit Gate

DEV-099 進入 `RD Implementation Ready` 前，R01～R06 必須完成，並能穩定指出 exact trigger。實作後的 local QA exit要求 S01～S08、P01～P12、B01～B12 全部 PASS；若 provider path涉及 Supabase，T00～T09也必須在隔離 TEST PASS。U04 Back/navigation 是 DEV-098 整合邊界案例，候選未含該 surface 時必須明示 `NOT_RUN`，不得虛報 PASS。

Release readiness另需 exact artifact、適用的 inactive production-bound candidate、activation decision與 canonical production smoke；local PASS不等於 release PASS。

## 3. Root Cause Verification（先執行）

| ID | 方法 | 必要結果 |
|---|---|---|
| R01 | 在 production commit `13888b2`／忠實 fixture記錄 Modal dispatch、pending owner與 Store branch | 每次 attempt可對回 accepted／not-accepted與 source task/version |
| R02 | node missing與 collection pending各觸發一次 | 證明是否留下 pending；保留 trace，不用 source推測替代 |
| R03 | same-value save由 TaskDetailsModal真實路徑觸發 | 判定 `updatedAt` 下 no-op是否可達；不可預設為事故分支 |
| R04 | provider success、reject、promise不結案、response-lost各注入一次 | 分辨 Store early return與 provider lifecycle缺口 |
| R05 | saving期間 task switch、unmount、stale callback | 判定 owner cleanup與污染路徑 |
| R06 | 選定可穩定重現永久 saving的最小序列，至少連續重跑3次 | 3/3同一 exact trigger；若無法重現，RCA退回而非進 implementation |

每筆 R evidence至少含 source revision、fixture、operation ID／測試 correlation、時間線、Store branch、provider結果、UI狀態與 cleanup結果。不得記錄任務正文或憑證。

### 3.1 已執行的候選證據（不替代 R01～R06）

- `scripts/verify-dev-099-task-persistence-convergence.ts`：production-base source callbackless early-return path＋dispatch/readback helper，11/11 PASS；`output/qa/dev-099/root-cause-result.json`。
- `scripts/verify-dev-099-task-persistence-property.ts`：P01–P12 12/12 PASS，1,000/1,000 deterministic seeded schedules PASS；`output/qa/dev-099/property-result.json`。此為 pure state-machine evidence，不替代 provider／browser fault matrix。
- local-test browser verifier：B01–B05 success、reject＋Retry、timeout no-commit＋Retry、response-lost canonical readback、unknown readback＋Retry，以及 B12-390/B12-320 均 PASS；provider attempts B02=1、B03=1→2、B04=1、B05=1→2；`output/playwright/dev-099/result.json`。B02 的 console error 是預期注入 rejection，無 pageerror、無永久 saving；仍不替代 Supabase TEST。
- local-test browser candidate：title save 由 saving 收斂到 saved；1440×900、390×844、320×844 無 horizontal overflow，0 visible error；`output/qa/dev-099/contract-result.json`、`output/playwright/dev-099/result.json` 與 `output/playwright/dev-099/candidate-task-details-saved-*.png`。
- 2026-09-02 fresh rerun：在 `codex/capa-001-dev099` 以 `VITE_DATA_BACKEND=local-test` task-owned runtime 重跑 B01～B05、B12-390、B12-320，7/7 PASS；artifact generated `2026-09-02T12:30:04.159Z`，diagnostics 僅含預期 reject／deadline warnings，無 pageerror 或永久 saving。
- 2026-09-02 extended rerun：同一 candidate 補跑 B06 same-value no-op、B07 rapid-save newest-wins、B08 task-switch owner cleanup、B09 unmount owner cleanup，連同 B01～B05、B12-390、B12-320 共 11/11 PASS；artifact generated `2026-09-02T13:00:34.265Z`，B06 provider attempts=0、B07=2、B08=1，diagnostics 僅含預期 reject／deadline warnings，無 pageerror 或永久 saving；`output/playwright/dev-099/result.json`。
- 2026-09-02 B10 rerun：在 close pending 時保留 modal／draft，failure 後 Retry 成功才允許關閉；B01～B10、B12-390、B12-320 共 12/12 PASS，provider attempts B10=1→2，artifact `output/playwright/dev-099/result-b10.json` generated `2026-09-02T13:24:42.555Z`，runtime cleanup 已停止且 port 4010 released。
- 2026-09-02 B11 rerun：補上 DEV-097 PWA reload-safety owner boundary；saving／failed／unknown 均維持 unsafe，只有 persisted 才恢復 safe，並驗證 Retry 後 canonical readback；B01～B11、B12-390、B12-320 共 13/13 PASS，provider attempts B11=1、unknown-before-retry=1、unknown-after-retry=2，artifact `output/playwright/dev-099/result-b11.json` generated `2026-09-02T13:34:18.937Z`，diagnostics 僅含預期 rejection／deadline warnings，無 pageerror、無永久 saving；runtime cleanup `output/qa/dev-099/runtime-cleanup-execution-b11-20260902.json` 已停止且 `portReleased=true`。
- 2026-09-02 B07 stale-completion follow-up：候選 verifier `@6c9710d` 新增 `delay-response-once`，讓第一筆 provider response 在 canonical commit 後延遲返回，驗證舊 completion 不回退最新值或 UI 狀態；B01～B11、B12-390、B12-320 共 13/13 PASS，B07 provider attempts=2，artifact `output/playwright/dev-099/result-b11-stale.json` generated `2026-09-02T14:03:36.459Z`，無 pageerror、無永久 saving；runtime cleanup `output/qa/dev-099/runtime-cleanup-execution-b11-stale-fix-20260902.json` 已停止且 `portReleased=true`。
- 2026-09-02 B07 stale-completion fresh rerun：在同一候選 `@6c9710d` 重新啟動 task-owned runtime 並重跑完整 browser matrix；B01～B11、B12-390、B12-320 共 13/13 PASS，最新 artifact `output/playwright/dev-099/result-b07-stale.json` generated `2026-09-02T14:13:09`，sourceRevision 已標示 production base 與候選完整 commit，無 pageerror、無永久 saving；4011 task-owned runtime 已停止且 port released。
- 候選品質檢查：`npx tsc --noEmit` PASS；`npx vite build --mode test` PASS；extended browser verifier targeted ESLint 0 errors。`npm run build` 仍由正式 artifact guard 因候選 worktree 缺少 `.env.production` 停止，故不視為 production release evidence。
- 唯讀 staging preflight：`npm run verify:staging-env` fresh rerun PASS（8/8），確認 backend/ref `fhisnnufoeulxqrchldf`、非 production、public key、OAuth、redirect 與 auto-login policy；artifact `output/qa/dev-099/supabase-test-preflight-rerun-20260902.json`。其後已使用隔離 authenticated TEST actor 執行 T00～T09，結果 10/10 PASS；不得將此結果推升為 production evidence。
- 上述證據只證明候選行為與局部控制契約；沒有 operation correlation，不能把 callbackless source path宣稱為本次 production incident 的 exact trigger。
- Production read-only observation：目前正式環境頁面可見兩筆同名「大陸PCT」，不同 node ID 但同一 parent/order；`output/qa/dev-099/production-duplicate-observation-20260902.json`。此支持 duplicate persisted identities 與使用者重試敘述，不提供 exact persistence trigger，也未執行 production mutation。
- 2026-09-02 latest static/property rerun：候選 `@6c9710d` 重新執行 root-cause／source 11/11 PASS 與 P01–P12、1,000/1,000 seeded schedules PASS；candidate-local artifacts `C:\VIBE CODING\ProJED\.worktrees\ProJED\capa-001-dev099\output\capa-001\dev-099-root-cause-verification.json`（generated `2026-09-02T14:26:38.775Z`）與 `C:\VIBE CODING\ProJED\.worktrees\ProJED\capa-001-dev099\output\qa\dev-099\property-result.json`（generated `2026-09-02T14:26:39.085Z`，sourceRevision `6c9710d50590e6df63f54eb55b0c076541013518`）。
- 2026-09-02 Supabase TEST authenticated matrix：在獨立 project ref `fhisnnufoeulxqrchldf` 執行 T00～T09；204、型別／權限拒絕、stale guard、abort、commit後 response-lost、併發、重新登入 canonical readback與cleanup均 PASS（10/10；0 residual）。`delete_workspace` RPC 的 TEST 權限不足由 service-role fallback 清理並另列 finding；未接觸 production。證據：`output/qa/dev-099/supabase-test-result.json`。
- 2026-09-02 Supabase TEST UI provider smoke：同一候選與 TEST project 以 authenticated UI 執行 title edit→PATCH 204→saved→close/reload canonical render，U01～U03 PASS；U04 Back/navigation 在此候選為 `NOT_RUN`，因 production-base 不含 DEV-098 子任務導覽元件，未將其升格為 PASS。證據：`output/playwright/dev-099/result-supabase-test-ui.json`；診斷僅有 2 筆 task-filter preference HTTP 400 console warnings，無 pageerror／request failure，列為 out-of-scope。
- 2026-09-02 DEV-098 integration supplemental：以 root dirty integration runtime 4013（同一 TEST fixture、未接觸 production）重跑完整 U01～U04，authenticated edit、canonical reload與 modal Back/navigation 均 PASS；U04 確認 peer → Back 回到原 task、維持單一 modal且無 saving 污染。證據：`output/playwright/dev-099/result-supabase-test-ui-integrated.json`；無 pageerror／request failure，400／404 console diagnostics列為既有 integration out-of-scope；fixture cleanup residual=0、4013已釋放。
- 2026-09-03 canonical root integration rerun：在同一 dirty root 同時載入 DEV-098 surface 與 DEV-099 convergence implementation，local-test browser B01～B11、B12-390、B12-320 共 13/13 PASS；隔離 Supabase TEST UI U01～U04 亦 PASS（含 PATCH 204、canonical reload、single-modal Back），無 pageerror／request failure。此證據代表目前整合工作樹的行為，不代表 clean hotfix branch、production activation 或 release 已核准。證據：`output/playwright/dev-099/result-root-local-final.json`、`output/playwright/dev-099/result-root-supabase-ui-final.json`、`output/qc/dev-099/root-integration-result.json`；TEST fixture residual=0、4010／4013已釋放。
- 2026-09-03 clean integrated adjacent rerun：在 `codex/capa-001-dev099-integrated@c904435` 以 `VITE_DATA_BACKEND=local-test` task-owned runtime 4015 重跑 DEV-098 B01～B16，16/16 PASS、diagnostics=0；static 22/22、pure 10/10與獨立 QC 10/10亦 PASS，DEV-046／053／055／095 affected regression維持 PASS且未使用 waiver。runtime cleanup後 port 4015 released。證據：`output/playwright/dev-098/result-clean-integrated-final-20260903.json`、`output/qa/dev-099/clean-integrated-dev098-static-20260903.json`、`output/qa/dev-099/clean-integrated-dev098-pure-20260903.json`、`output/qa/dev-099/clean-integrated-dev098-qc-20260903.json`。這是 clean integration evidence，不解除 R01～R06、owner sign-off、Firebase Level 3或release gate。
- 2026-09-03 clean integrated current-HEAD rerun：同一 `@60405c4` worktree fresh 執行 WP-099-A deterministic 11/11與WP-099-C property P01～P12、1,000/1,000，並通過 TypeScript、build:test、targeted lint（0 errors／3既存warnings）與 release adapter self-check（22 checks）；證據：`output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`。root-cause harness仍只重現 callbackless control path，不等同歷史 incident exact trigger；既有 UI evidence仍 pin behavior `@105fdbc`，未轉為 current-head release proof。

## 4. L0 Static／Contract Cases

| ID | Assertion |
|---|---|
| S01 | dispatch結果可區分 accepted與not-accepted；not-accepted不增加 pending owner。 |
| S02 | missing、collection pending、no-op、forbidden無 callbackless silent return。 |
| S03 | accepted operation具有穩定 identity、source task/version與 exactly-one completion。 |
| S04 | success、failure、exception、deadline都經同一不可漏 cleanup。 |
| S05 | close／push／back／create-and-navigate共用同一 persistence primitive。 |
| S06 | unknown/readback只依權威 evidence轉 persisted；optimistic store／HTTP 204不足以單獨判成功。 |
| S07 | DEV-099未引入 create idempotency、order schema／migration、全站 Store重構或新 UI container。 |
| S08 | hotfix source可追溯至 production base；dirty DEV-098等變更未被默認混入。 |

## 5. L1 Pure／State-machine Cases

| ID | Case／Postcondition |
|---|---|
| P01 | not-accepted noop | terminal=noop、pending=0、無 provider request |
| P02 | not-accepted missing | terminal=missing、pending=0、draft保留 |
| P03 | not-accepted collection pending | terminal=blocked、pending=0、提供可重試狀態 |
| P04 | accepted success | persisted一次、pending歸零、短暫成功一次 |
| P05 | accepted failure／throw | failed一次、pending歸零、draft與Retry保留 |
| P06 | deadline | unknown一次、pending owner釋放、不得顯示成功 |
| P07 | unknown readback matches authoritative intent | 僅在版本／operation證據充分時轉 persisted |
| P08 | unknown readback stale／different／unavailable | 保持unknown或failed，不覆寫draft、不假成功 |
| P09 | duplicate／late completion | 首次terminal有效；後續不二次結案、不污染畫面 |
| P10 | rapid title＋notes／double save | 每個accepted operation獨立結案，最終值遵守版本順序 |
| P11 | task switch／unmount | 舊owner cleanup；已送mutation不被假裝取消；新task狀態乾淨 |
| P12 | pending transition＋Retry | dirty／unknown時不導航；成功後合法transition只執行一次 |

另執行有限 adversarial matrix：autosave timer×blur、explicit save×same-value、realtime refresh×response-lost、task switch×late callback、unmount×deadline。若提供 deterministic property runner，固定 seed總計至少1,000 schedules；不是每種交錯各跑1,000。所有結果必須為0 leaked operation、0 permanent saving、0 false success。

## 6. L2 Normal UI Browser Cases

| ID | Scenario | 必要結果 |
|---|---|---|
| B01 | 修改title，provider成功 | 顯示saving；成功後收斂；reload readback一致 |
| B02 | 修改notes，provider reject | 顯示failed＋Retry；draft保留；不得導航或成功 |
| B03 | provider不結案至deadline | 顯示「儲存狀態未確認」；spinner不永久；不得成功 |
| B04 | response已寫入但client response lost | unknown→canonical readback；具權威證據才成功 |
| B05 | readback unavailable（local-test fault）；stale／較新版本另列待測 | 先呈現unknown，不假成功；Retry後狀態與draft可恢復；舊版本不得覆寫較新值 |
| B06 | same-value save（missing fixture／collection pending由P02／P03 pure/static覆蓋） | 不留下saving；近端結果可判定 |
| B07 | title rapid save／double Enter，含延遲 stale completion（notes／blur另待） | 最終canonical值正確；舊 completion 不回退值、不污染 saving／error，無leak |
| B08 | saving時 task identity switch owner cleanup（Back另待） | 新entry不繼承舊saving／error／unknown |
| B09 | saving時切換／reload卸載，再收到late callback | 新task無舊saving／success／error污染 |
| B10 | saving未結案時按 Close，failure 後 Retry 再關閉 | pending／failed時保留 modal 與 draft；Retry成功後才允許關閉；不得重複送出 |
| B11 | DEV-097 reload-safety readback／PWA owner boundary | saving／failed／unknown均保持unsafe；persisted後才safe |
| B12 | 1440×900、390×844、320×844 | 狀態與單一行動可見；無overflow、重疊、新card或全modal spinner |

每個 browser case記錄 fixture、viewport、source task/version、operation trace、visible state、readback、console/pageerror、screenshot／trace與 runtime cleanup。

## 7. Supabase TEST Cases

| ID | Fault／Flow | 必要結果 |
|---|---|---|
| T00 | authenticated TEST actor／project isolation | actor authenticated；project ref≠production；不使用 production credentials |
| T01 | PATCH 204 success | persisted與canonical readback一致 |
| T02 | 400／validation | failed、draft保留、無false success |
| T03 | 401／403 | failed且不洩漏資料；重新授權後才可Retry |
| T04 | 409／stale version | 不覆寫較新值；顯示可恢復衝突／失敗 |
| T05 | offline／network abort | failed或unknown依provider證據；不永久saving |
| T06 | server commit＋response lost | unknown/readback收斂；不重送無界操作 |
| T07 | concurrent writes／current wins | accepted writes各自結案；canonical readback為目前提交值之一，不回退舊值 |
| T08 | authenticated edit→terminal→reload | 同一task內容一致、operation完整結案 |
| T09 | disposable fixture cleanup | cleanup後 residual=0；若管理RPC權限不足，須以核准fallback清理並留證 |

只使用隔離 TEST actor與 disposable fixture。不得連 production 執行故障注入；cleanup需readback為0 residual。若測試需要 schema／RPC變更，立即停止並升 Lane 3 review。

## 8. Targeted Regression

- DEV-028：任務明細title／notes與關閉流程。
- DEV-097：task-details dirty owner與safe reload。
- DEV-098：S06、P08～P09、B04～B06相容性重跑；舊22/22、10/10、16/16只作歷史baseline，不是本 DEV evidence。
- Task details正常入口：List、Board、Gantt、Calendar、Mind Map至少各一個 smoke。
- TypeScript、targeted lint與 exact build artifact。

若 hotfix source不包含DEV-098，回歸應在production-base hotfix與預定integration target各跑一次，避免clean hotfix通過但整合後失效。
本輪已完成 root DEV-098 integration supplemental U01～U04；clean hotfix candidate仍保留 U04 `NOT_RUN`，需由 DEV-098 owner確認同一 release artifact 的整合回歸後才可解除此 Gate。

## 9. Evidence Paths

已建立的候選證據與仍待執行的完整 evidence 分開管理；建立前不得宣稱 PASS：

- `output/qa/dev-099/root-cause-result.json`（已建立：PARTIAL，不是 R01～R06 exit）
- `output/qa/dev-099/contract-result.json`（已建立：local candidate partial）
- `output/qa/dev-099/property-result.json`（已建立：P01–P12 12/12、1,000/1,000 seeded schedules）
- `output/playwright/dev-099/result.json`（已建立：local-test B01～B11＋B12 viewport 13/13；仍非 Supabase TEST／完整 QA exit）
- `output/playwright/dev-099/result-b10.json`（B10 close-pending recovery；B01～B10＋B12 viewport 12/12 PASS）
- `output/playwright/dev-099/result-b11.json`（B11 PWA reload-safety owner boundary；B01～B11＋B12 viewport 13/13 PASS；仍非 Supabase TEST／完整 QA exit）
- `output/playwright/dev-099/result-b11-stale.json`（`@6c9710d` 延遲 stale completion follow-up；B01～B11＋B12 viewport 13/13 PASS；local-test candidate evidence）
- `output/playwright/dev-099/result-b07-stale.json`（歷史 `@6c9710d` fresh delayed stale-completion rerun；B01～B11＋B12 viewport 13/13 PASS；local-test candidate evidence）
- `output/playwright/dev-099/result-extended.json`（歷史 extended artifact；最新同範圍結果以 `result.json` 為準，B01～B09、B12-390、B12-320 11/11 PASS；local-test candidate，不是 Supabase TEST）
- `output/playwright/dev-099/task-details-saved-*.png`（已建立）
- `output/qa/dev-099/supabase-test-preflight.json`（已建立：staging ref／auth policy read-only preflight PASS；TEST mutation NOT RUN）
- `output/qa/dev-099/supabase-test-preflight-rerun-20260902.json`（最新 read-only preflight 8/8 PASS）
- `output/qa/dev-099/supabase-project-status-readonly-20260902.json`（TEST／production project status 均 `ACTIVE_HEALTHY`；僅確認可達性，不替代 authenticated mutation/readback）
- `output/qa/dev-099/supabase-schema-preflight-readonly-20260902.json`（TEST／production public schema read-only；`wbs_items`／placements RLS＋`bigint sort_order` 均存在；不替代 authenticated mutation/readback）
- `output/qa/dev-099/supabase-policy-preflight-readonly-20260902.json`（TEST／production task-table RLS policy parity；authenticated UPDATE 同時具 `USING`／`WITH CHECK`）
- `output/qa/dev-099/production-log-correlation-rerun-20260902.json`（production API/Postgres log read-only query；未觀察到 task mutation／operation ID correlation；`8.5` bigint error 保留為 DEV-101 獨立證據）
- `output/qa/dev-099/production-incident-correlation-rerun-20260902.json`（incident window 的 `activity_events`／`wbs_items` temporal correlation；duplicate creation 與第一筆 09:13:43 update 對上既有 204，但仍無 operation ID／audit update）
- `output/qa/dev-099/production-incident-correlation-live-20260903.json`（production ref `knodlkxqpcqyrtgwpdst` 事故窗唯讀重查；`activity_events=7`、`audit_logs=0`、兩筆同 parent／order「大陸PCT」相隔 48.566321 秒，但無 operation ID；R01～R06 exact trigger `NOT_PROVEN`）
- `output/qa/dev-099/supabase-test-result.json`（隔離 TEST authenticated T00～T09；10/10 PASS；0 residual；source `@e00d9ac`）
- `output/playwright/dev-099/result-supabase-test-ui.json`（同一候選 TEST provider UI；U01～U03 PASS；U04 Back/navigation NOT RUN；2 筆非阻塞 task-filter preference 400 warnings）
- `output/playwright/dev-099/result-supabase-test-ui-integrated.json`（root DEV-098 integration supplemental；U01～U04 PASS，含 modal Back/navigation 單一 modal／原 task 回復）
- `output/playwright/dev-099/result-root-local-final.json`（canonical root integration local-test；B01～B11＋B12-390／B12-320 13/13 PASS）
- `output/playwright/dev-099/result-root-supabase-ui-final.json`（canonical root integration Supabase TEST UI；U01～U04 PASS）
- `output/playwright/dev-099/result-clean-integrated-final-20260903.json`（production-base clean integrated branch；behavior `@105fdbc`／verifier metadata `@88a550a`；U01～U04 PASS）
- `output/qa/dev-099/clean-integrated-deterministic-20260903.json`（同一 branch；source/deterministic 11/11 PASS）
- `output/qa/dev-099/clean-integrated-property-20260903.json`（同一 branch；P01～P12 12/12、1,000/1,000 seeded schedules PASS）
- `output/qa/dev-099/clean-integrated-current-head-bcc5485-20260903.json`（current HEAD `@bcc5485` clean integration deterministic 11/11、property P01～P12／1,000/1,000、TypeScript、build:test、targeted lint與release adapter self-check PASS；root-cause source pin仍為 production base）
- `output/playwright/dev-098/result-clean-integrated-final-20260903.json`、`output/qa/dev-099/clean-integrated-dev098-qc-20260903.json`（同一 clean integration 的 DEV-098 B01～B16 16/16、diagnostics=0與independent QC 10/10）
- `output/qc/dev-099/root-integration-result.json`（canonical root integration evidence envelope；cleanup與未放行邊界）
- `output/qc/dev-099/clean-integrated-result.json`（clean integrated branch／same-artifact evidence envelope；owner sign-off與release仍 pending）
- `output/qa/dev-099/supabase-ui-cleanup-20260902.json`（TEST UI fixture service-role fallback cleanup；delete 204、residual 0、4012 released）
- `output/qa/dev-099/supabase-ui-integrated-cleanup-20260902.json`（root integration runtime 4013 stopped／released；delete 204、residual 0）
- `output/qa/dev-099/supabase-test-residual-cleanup.json`（TEST residual tenant=0）
- `output/qa/dev-099/runtime-cleanup-supabase-provider-20260902.json`（4012 candidate與4013 supplemental runtime均停止、port released）
- `output/qa/dev-099/runtime-cleanup.json`
- `output/qa/dev-099/runtime-cleanup-execution-20260902.json`（本輪 4010 task-owned process tree，已 stopped、`portReleased=true`）
- `output/qa/dev-099/runtime-cleanup-execution-extended-20260902.json`（extended 4010 task-owned process tree，已 stopped、`portReleased=true`）
- `output/qa/dev-099/runtime-cleanup-execution-b11-stale-fix-20260902.json`（B07 stale-completion follow-up 的 4010 task-owned process tree，已 stopped、`portReleased=true`）
- `output/qa/dev-099/runtime-cleanup-final-20260902.json`（latest candidate browser run；4000 task-owned process tree，已 stopped、`portReleased=true`）
- `output/qa/dev-099/runtime-cleanup-b10-20260902.json`（B10 extension run；owned port 4000／candidate process tree已 stopped；4010為 cleanup snapshot時另行處理的早期 candidate tree，後續獨立 runtime不屬於本輪）
- `output/qa/dev-099/runtime-cleanup-execution-b11-20260902.json`（B11 extension run；owned port 4010 process tree已 stopped、`portReleased=true`；primary port 4000未由本輪停止）
- `output/qc/dev-099/candidate-qc-result.json`（獨立 candidate QC：conditional PASS；無 remote mutation）
- `ai-doc/qc/QC-DEV-099-task-persistence-convergence.md`（獨立 QC 報告；CAPA closure 仍 blocked）

### Fresh rerun note（2026-09-02）

- 同一 clean candidate `codex/capa-001-dev099@6c9710d` 已重新執行 WP-099-A deterministic root-cause 11/11 與 WP-099-C property P01～P12、1,000/1,000 seeded schedules；`output/qa/dev-099/property-result.json` generated `2026-09-02T14:27:57.034Z`，failed case IDs 為空。
- 這是候選 local evidence refresh，不取代 R01～R06 incident correlation、Supabase TEST authenticated mutation／readback、back/navigation matrix或 release/effectiveness gate。
- 最新 candidate source fix `@e00d9ac45ca2096da4f73dbf6c45ef15a7f69211` 修正 canonical／realtime stale snapshot 暫時覆寫已接受 title 的 UI convergence；同一 revision 的 Supabase TEST T00～T09 10/10 PASS、UI U01～U03 PASS，U04 因候選不含 DEV-098 navigation surface 保持 `NOT_RUN`。
- 收尾 fresh rerun（candidate `@e00d9ac`）：WP-099-A source/deterministic 11/11、WP-099-C property P01～P12 與 1,000/1,000 seeded schedules 均 PASS，artifacts generated `2026-09-02T15:46:16Z`；root-cause artifact 的 source pin 仍為 production base，未被誤當 incident exact trigger。
- supplemental root integration 在相同 TEST fixture 補驗 U04 Back/navigation PASS；此結果不能覆蓋 clean candidate 的 source boundary，也不能取代 DEV-098 required regression、Firebase Level 3或release gate。
- canonical root integration 已將 DEV-099 convergence implementation 與 DEV-098 navigation surface 放在同一 dirty working tree 重跑；local 13/13 與 TEST UI U01～U04 PASS，但仍需建立 clean hotfix artifact、完成 exact incident linkage／owner sign-off、Firebase Level 3與 release/effectiveness gates。

所有 JSON 必含 source revision、runner version、case totals、failed case IDs與實際執行時間；不得只有手寫摘要。

## 10. QA Stop Conditions

- R01～R06無法確認 exact trigger，卻準備測「修正後」版本。
- source-only assertion、舊DEV-098 evidence或production 204被當成本計畫PASS。
- false success、draft loss、permanent saving、double settlement、stale callback污染或cleanup失敗。
- 用固定sleep取代可控制clock／provider signal，或用hide spinner滿足案例。
- dirty source邊界不明、必要migration未準備、測試連到production或留下remote fixture。
- 任一必要case為NOT_RUN／BLOCKED卻完成QA exit。

## 11. Release／Effectiveness Handoff

Local與Supabase TEST通過後，仍需另行授權：

1. exact source/artifact與Release Capsule；
2. 適用的inactive production-bound candidate；
3. 獨立activation go/no-go與rollback target；
4. canonical production T+0 smoke；
5. T+7／T+30 saving-over-deadline、unknown/readback與terminal correlation review。

任何步驟未執行均標 `NOT RUN`，不得以本QA計畫取代。

## 12. 變更紀錄

- 2026-09-02：依RD技術主管CAPA審查建立；將根因驗證設為implementation前置Gate，補執行P01–P12、1,000/1,000 seeded local property schedules與local-test B01–B05 fault/retry/readback；provider／完整 UI race matrix、Supabase TEST與release仍不預填PASS。
- 2026-09-02：在 clean candidate 重新執行 local-test browser B01～B05、B12-390、B12-320（7/7 PASS），完成 task-owned port 4010 cleanup；R01～R06 incident correlation、Supabase TEST、完整 UI race matrix與 release 仍為 `NOT RUN`，不改變 conditional candidate 結論。
- 2026-09-02：補跑 local-test B06～B09 race／owner-cleanup，連同既有案例共 11/11 PASS；本輪使用 candidate task-owned runtime 並於驗證後停止、確認 port released。此仍是 candidate provider fault-injection evidence，不替代 R01～R06 incident correlation、Supabase TEST、真實 provider readback 或 release gate。
- 2026-09-02：candidate browser extension `@6eabc3f` 補跑 B10 close-pending recovery；未結案時 Close 保留 modal／draft，bounded failure 後 Retry 成功才允許關閉；B01～B10、B12-390、B12-320 共 12/12 PASS，runtime cleanup與port release證據為 `runtime-cleanup-b10-20260902.json`。此仍是 candidate provider fault-injection evidence，不替代 R01～R06 incident correlation、Supabase TEST、真實 provider readback 或 release gate。
- 2026-09-02：candidate browser extension `@d2df71e` 補跑 B11 DEV-097 PWA reload-safety owner boundary；saving／failed／unknown均 unsafe，persisted後才 safe；B01～B11、B12-390、B12-320 共 13/13 PASS，artifact=`output/playwright/dev-099/result-b11.json`、cleanup=`runtime-cleanup-execution-b11-20260902.json`。此仍是 candidate provider fault-injection evidence，不替代 R01～R06 incident correlation、Supabase TEST、真實 provider readback 或 release gate。
- 2026-09-02：完成隔離 Supabase TEST authenticated T00～T09（10/10 PASS）與同候選 UI U01～U03；候選不含 DEV-098 Back/navigation，U04維持 NOT RUN；runtime 4012／4013停止並確認 port released。此解除「Supabase TEST未執行」阻擋，但不解除 incident linkage、DEV-100、Back/navigation、release或effectiveness gate。
- 2026-09-02：candidate `@e00d9ac` 修正 accepted title 在 canonical／realtime stale snapshot 下被暫時回寫的 convergence race；重新執行隔離 Supabase TEST T00～T09 10/10 PASS，並以真實 TEST UI 驗證 U01～U03 PASS。U04 Back/navigation 因 clean candidate 不含 DEV-098 surface 為 `NOT_RUN`；fixture cleanup residual=0、4012／4013 runtimes 均停止並釋放 port。incident linkage、DEV-098 integration、release與effectiveness gates仍未完成。
- 2026-09-02：以 root DEV-098 integration supplemental runtime 4013 重跑同一 TEST fixture 的 U01～U04，含 modal Back/navigation 全部 PASS；artifact=`output/playwright/dev-099/result-supabase-test-ui-integrated.json`，cleanup=`supabase-ui-integrated-cleanup-20260902.json`。此僅補 integration evidence，不改變 clean candidate U04 NOT_RUN、incident linkage、Firebase Level 3、release與effectiveness gate。
- 2026-09-03：canonical root dirty integration 接回 DEV-099 convergence implementation 後，fresh local B01～B11＋B12-390／B12-320 共 13/13 PASS，並以同一隔離 TEST fixture 重跑 U01～U04 PASS；artifacts=`output/playwright/dev-099/result-root-local-final.json`、`output/playwright/dev-099/result-root-supabase-ui-final.json`、`output/qc/dev-099/root-integration-result.json`。此為整合 evidence，不取代 clean hotfix、exact incident linkage、Firebase Level 3或 release gate。
- 2026-09-03：由 production-base `13888b2` 建立 clean integrated branch（初始 `@d650098`），以同一隔離 TEST fixture 完成 authenticated U01～U04 PASS；artifact=`output/playwright/dev-099/result-clean-integrated-final-20260903.json`、`output/qc/dev-099/clean-integrated-result.json`，fixture residual=0、4014 released。此仍不解除 exact incident linkage、owner sign-off、Firebase Level 3或 release gate。
- 2026-09-03：clean integrated behavior 以 `@105fdbc` 修正 checklist placeholder 的 render-time ref access，並以 `@88a550a` 固定 verifier metadata；後續 `@c3af71c`／`@c904435` 僅調整整合 verifier／QA-SPEC evidence與預期診斷過濾，`@5bd5200`～`@bcc5485`補上 release adapter、Release Capsule與hosted Level 3 workflow，未改動 DEV-099 runtime source；current-head targeted lint 0 errors／3既存warnings，並通過 deterministic/property、TypeScript、build:test與release adapter self-check。既有 U01～U04 artifact仍 pin behavior `@105fdbc`，正式 release須以 current HEAD建立 same-artifact capsule。
- 2026-09-03：同一 clean integrated HEAD `@bcc5485` 完成 current-head deterministic 11/11、property P01～P12／1,000/1,000與 DEV-098 adjacent browser B01～B16 16/16、static 22/22、pure 10/10、independent QC 10/10；current-head TypeScript、build:test、targeted lint與release adapter self-check亦 PASS；4015已停止並釋放。這些證據仍屬 non-production integration，R01～R06、hosted Firebase Level 3 artifact與release gate維持 pending。
- 2026-09-03：重新以 production Supabase ref `knodlkxqpcqyrtgwpdst` 做事故窗唯讀 correlation；`activity_events=7`、`audit_logs=0`，兩筆「大陸PCT」同 parent／order且建立相隔 48.566321 秒，但 activity payload 無 operation ID，R01～R06 exact trigger 仍為 `NOT_PROVEN`。artifact=`output/qa/dev-099/production-incident-correlation-live-20260903.json`；未執行 production mutation、migration或release。
