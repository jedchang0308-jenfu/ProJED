# RD 技術主管審查：CAPA-001

- 審查日期：2026-09-03
- 審查範圍：`CAPA-001`、`SPEC-099`、`QA-DEV-099`、`QC-DEV-099`、candidate implementation `codex/capa-001-dev099@e00d9ac`、clean integrated `codex/capa-001-dev099-integrated`（behavior `@105fdbc`／verifier metadata `@88a550a`／current HEAD `@60405c4`）、verifier `@7ef9953` 與 browser extensions `@6eabc3f`／`@d2df71e`／`@6c9710d`
- 審查角色：RD Technical Lead

## 結論

**有條件通過（candidate／clean integration）**。候選修正對準已確認的控制缺陷：Store dispatch 具 typed accepted／not-accepted 結果，Modal 只在 accepted operation 登記 pending，並以 operation identity、exactly-once settlement、deadline、canonical readback、unknown state與stale canonical title overlay收斂 UI。隔離 Supabase TEST T00～T09、clean candidate UI U01～U03、production-base clean integrated behavior `@105fdbc` UI U01～U04、canonical root local B01～B11＋390／320 13/13及root integration U01～U04均已通過；但尚未證明本次 production incident 的 exact runtime trigger，也尚未完成 owner sign-off、Firebase Level 3、release 或 production effectiveness，因此不得標示 CAPA closed 或 production fixed。

## 核心原因與因果鏈

已確認的控制鏈為：`TaskDetailsModal` 先登記 pending → production `useWbsStore.updateNode` 在 missing／collection-pending／no-op 可 callbackless return → caller 沒有 terminal settlement → UI 可能永久 saving。Production API 的 204 與 DB readback 只能證明 canonical write，不足以證明該次 UI operation 已完成；歷史 operation ID 缺口使 incident linkage 仍未知。

第二筆「大陸PCT」是使用者在狀態不明下的合理重試產物 :codex-annotation{index="1"}；這是結果放大器，不是根因。`sort_order=8.5`／`bigint` 是獨立已確認缺陷，保留 DEV-101，不納入本 candidate。

## 阻擋項目

1. R01～R06 尚未以歷史 operation correlation 證明 exact incident trigger；source reproduction 不能冒充 production RCA。
2. Supabase TEST authenticated T00～T09 已完成（10/10 PASS），clean candidate UI U01～U03 PASS；clean integrated behavior `@105fdbc` U01～U04與canonical root integration U01～U04亦 PASS。integrated branch目前 HEAD `@60405c4`；後續提交為 release adapter／Release Capsule／hosted Level 3 workflow與env authority修正，current-head deterministic/property/typecheck/build/lint與release adapter self-check均 PASS，但既有 UI evidence仍 pin behavior artifact，尚未形成 current-head production artifact。仍需 current-head same-artifact Release Capsule、DEV-098 owner sign-off與其他 release gates才能接受為 release artifact。
3. local UI adversarial matrix（task switch、unmount、retry、close／back）已在 canonical root 13/13 PASS；仍缺 Firebase Level 3與完整 navigation owner sign-off。
4. Candidate 尚未產生 release capsule、activation decision、production smoke 或 T+7／T+30 effectiveness evidence。

## 最小修正與驗證

- 保留 `UpdateNodeDispatchResult` 與 `taskPersistenceConvergence` helper；不要擴張成全站 Store 重構，也不要把 DEV-100／DEV-101 混入。
- QA-DEV-099 已補 local-test B01–B11 provider fault／deadline／unknown readback／Retry、same-value／rapid-save、delayed stale completion、task owner cleanup、close-pending recovery與PWA reload-safety boundary；clean integrated behavior `@105fdbc`（current HEAD `@bcc5485`）已重跑隔離 Supabase TEST UI U01～U04，canonical root亦重跑 local 13/13與U01～U04；current-head deterministic/property/typecheck/build/lint與release adapter self-check亦 PASS；仍需以 current HEAD pin Release Capsule、owner sign-off、hosted Level 3與每個 accepted operation只能有一個 terminal observation之正式 release acceptance。
- 若根因 correlation 最終否證 callbackless path，先回修 CAPA／SPEC 的 RCA，再決定是否保留候選；不得以局部測試 PASS 取代根因 Gate。
- 只有在上述 evidence scope 一致、Release Capsule 與 rollback target 完整且另行取得授權後，才可進入 activation／production。

## 已檢查證據

- `scripts/verify-dev-099-task-persistence-convergence.ts`：11/11 source／deterministic cases PASS。
- `scripts/verify-dev-099-task-persistence-property.ts`：P01–P12 12/12 PASS，1,000/1,000 deterministic seeded schedules PASS；此為 pure state-machine evidence，不取代 provider／browser matrix。
- `output/playwright/dev-099/result-b11-stale.json`：candidate `@6c9710d` 的 local-test B01～B11、B12-390、B12-320 共 13/13 PASS；B07 以 delayed provider response 驗證 stale completion 不回退 canonical 最新值或 saving/error 狀態，B02 的注入 rejection與deadline warnings為預期診斷，未形成 pageerror或永久 saving。
- 最新 fresh rerun `output/playwright/dev-099/result-b07-stale.json`：同一 candidate `@6c9710d`、sourceRevision 含 production base 完整 commit，B01～B11、B12-390、B12-320 共 13/13 PASS（generated `2026-09-02T14:13:09Z`）；4011 task-owned runtime 已停止且 port released。
- `output/qa/dev-099/root-cause-result.json`：PARTIAL，明列 incident exact trigger pending。
- `output/qa/dev-099/contract-result.json`：local candidate partial。
- `output/playwright/dev-099/result.json`：local-test title save、close-pending recovery、1440×900／390×844／320×844，0 visible error、0 horizontal overflow。
- `output/qa/dev-099/runtime-cleanup-execution-b11-stale-fix-20260902.json`：B07 stale-completion follow-up task-owned runtime cleanup；owned port 4010 released、candidate processes=0；primary port 4000未由本輪停止。
- `output/qa/dev-099/production-incident-correlation-rerun-20260902.json`：incident window 的 activity／task temporal correlation 補強 duplicate creation 與第一筆 09:13:43 update 對上既有 API 204；仍無 operation ID、update audit或 exact UI trigger。
- `output/qa/dev-099/production-incident-correlation-live-20260903.json`：以 production ref `knodlkxqpcqyrtgwpdst` 重新查詢事故窗，`activity_events=7`、`audit_logs=0`，兩筆「大陸PCT」同 parent／order、建立相隔 48.566321 秒；仍無 operation ID，R01～R06 exact trigger 維持 `NOT_PROVEN`。
- `output/qa/dev-099/supabase-test-result.json`：隔離 TEST authenticated T00～T09 10/10 PASS；T09 `delete_workspace` permission denied後以 service-role fallback 清理，residual=0。
- `output/playwright/dev-099/result-supabase-test-ui.json`：同候選 TEST UI U01～U03 PASS、U04 NOT RUN；無 pageerror／request failure，2 筆 task-filter preference HTTP 400 為非阻塞診斷。
- `output/playwright/dev-099/result-supabase-test-ui-integrated.json`：root DEV-098 integration supplemental U01～U04 PASS；U04 peer → Back 返回原 task且維持單一 modal，無 pageerror／request failure；400／404為環境／相鄰 scope warning。
- `output/playwright/dev-099/result-root-local-final.json`、`output/playwright/dev-099/result-root-supabase-ui-final.json`、`output/qc/dev-099/root-integration-result.json`：canonical root 同一工作樹重新驗證 local 13/13與Supabase TEST UI U01～U04 PASS；此為 integration evidence，不是 clean release artifact。
- `output/playwright/dev-099/result-clean-integrated-final-20260903.json`、`output/qc/dev-099/clean-integrated-result.json`：production-base clean integrated behavior `@105fdbc`（branch verifier metadata `@88a550a`）同一 artifact 驗證 Supabase TEST UI U01～U04 PASS；fixture residual=0、4014 released。current branch HEAD為 `@60405c4`，後續只含 release adapter／Release Capsule／hosted Level 3 workflow與env authority修正；current-head deterministic/property、TypeScript、build:test、targeted lint與release adapter self-check PASS，詳見 `output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`。既有 UI artifact仍未 pin current-head production artifact，仍待 Release Capsule、owner sign-off與release gate。
- `output/playwright/dev-098/result-clean-integrated-final-20260903.json`、`output/qa/dev-099/clean-integrated-dev098-qc-20260903.json`：同一 clean integrated `@60405c4` worktree 重跑 DEV-098 B01～B16 16/16（diagnostics=0），static 22/22、pure 10/10、independent QC 10/10；DEV-046／053／055／095 affected regression PASS且未使用 waiver，4015已釋放。此補強整合回歸證據，不改變 incident linkage／release conclusion。
- `output/qa/dev-099/supabase-ui-cleanup-20260902.json`：4012 candidate runtime released、delete 204、residual=0。
- `ai-doc/qc/QC-DEV-099-task-persistence-convergence.md`、`output/qc/dev-099/candidate-qc-result.json`：獨立 candidate QC 已執行；source/property/browser/preflight/cleanup scope 核對通過，但結論仍為 conditional PASS，未解除 release／effectiveness blockers。
- `output/playwright/dev-099/task-details-saved-*.png`：三個 viewport 截圖。
- TypeScript、targeted ESLint（0 errors；既存 store warnings）、`vite build --mode test`：candidate source boundary。

## Evidence addendum（2026-09-02）

新增 B06～B11 browser verifier 與 property evidence不改變本審查的 conditional conclusion；`@6c9710d` 另以 delayed response 補上 B07 stale completion local evidence。這些 local evidence仍無法證明 production incident 的 exact runtime trigger，也不等同 back／navigation全矩陣或 release approval；隔離 Supabase TEST與UI U01～U03的後續結果另見本文件 Latest candidate note。

Fresh rerun note：同一 clean candidate `@6c9710d` 於 `2026-09-02T14:27:57Z` 重新通過 deterministic root-cause 11/11 與 property P01～P12、1,000/1,000 seeded schedules；此僅刷新 local candidate evidence，不改變上述 conditional conclusion。

Latest candidate note：`@e00d9ac45ca2096da4f73dbf6c45ef15a7f69211` 修正 canonical／realtime stale snapshot 暫時覆寫 accepted title 的 convergence race；TEST T00～T09及UI U01～U03通過，U04因候選不含DEV-098 Back/navigation surface維持 NOT RUN。結論仍為 `Conditional PASS / Candidate only / Release Blocked`。

Integration addendum：root DEV-098 supplemental 在 4013 以同一 TEST fixture 補驗 U04 Back/navigation PASS；cleanup residual=0、port released。此證據仍不改變 clean candidate source boundary，也不解除 exact incident linkage、same-artifact release與effectiveness gates。

Canonical integration addendum（2026-09-03）：DEV-099 operation outcome／deadline-readback／unknown／stale-title convergence 已接回目前 root 的 DEV-098 surface；local B01～B11＋390／320 13/13、Supabase TEST UI U01～U04與DEV-098 QC均PASS。這解除「整合尚未重跑」的問題，但 root 仍是 dirty working tree；clean hotfix artifact、exact incident linkage、Firebase Level 3與release/effectiveness gate仍未解除。

Clean integrated addendum（2026-09-03）：以 production-base `13888b2` 建立 `codex/capa-001-dev099-integrated`，將 DEV-098 surface與DEV-099 convergence固定於同一 branch；TypeScript／build:test PASS，隔離 Supabase TEST UI U01～U04 PASS，fixture residual=0、port 4014 released。後續 `@105fdbc` 修正 checklist placeholder 的 render-time ref access，`@88a550a` 固定 verifier metadata，`@c3af71c`／`@c904435` 僅處理整合 verifier／QA-SPEC evidence與預期診斷過濾；`@5bd5200`～`@60405c4`補上 release adapter、Release Capsule、hosted Level 3 workflow與env authority修正，未改動 DEV-099 runtime source。current-head deterministic/property、TypeScript、build:test、targeted lint與release adapter self-check均PASS，見 `output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`。既有 UI artifact仍 pin behavior `@105fdbc`，需 current-head Release Capsule；此解除 clean candidate U04 的 source-gap，但 exact incident linkage、owner sign-off、hosted Level 3與release/effectiveness gate仍未解除。

Clean integrated adjacent regression addendum（2026-09-03）：同一 `@60405c4` worktree 以 task-owned runtime 4015 完成 DEV-098 B01～B16 16/16、diagnostics=0、static 22/22、pure 10/10與independent QC 10/10；DEV-046／053／055／095 affected regression PASS且未使用 waiver。4015已停止並釋放；此證據解除整合回歸未重跑疑慮，不把 dirty root或clean integration提升為 production release。

Production correlation live addendum（2026-09-03）：重新以 production ref `knodlkxqpcqyrtgwpdst` 唯讀查詢事故窗，`activity_events=7`、`audit_logs=0`，兩筆「大陸PCT」同 parent／order且建立相隔 48.566321 秒，但 payload 無 operation ID；R01～R06 exact trigger 維持 `NOT_PROVEN`，不得以 temporal correlation 取代歷史 operation linkage。
