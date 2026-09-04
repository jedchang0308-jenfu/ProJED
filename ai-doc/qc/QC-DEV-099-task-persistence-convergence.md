# QC-DEV-099：任務儲存狀態收斂候選事實驗證

- CAPA：`CAPA-001`
- QC 日期：2026-09-03
- QC 範圍：production-base `13888b2` 建立之候選分支 `codex/capa-001-dev099@e00d9ac`、clean integrated `codex/capa-001-dev099-integrated@60405c4`（behavior `@105fdbc`；verifier／QA metadata `@c3af71c`～`@c904435`），以及最終 release source `0743ef1`／release `20260902193607-61ff71` 的同一 artifact、activation與production-bound evidence
- 文件狀態：`QC Executed / Candidate Local + Supabase TEST Provider PASS / Clean Integrated PASS / Canonical Root Integration PASS / Same-Artifact Sign-off PASS / T+0 Production Released / Incident Trigger Linkage NOT_PROVEN / Effectiveness Pending`
- 證據總表：`output/qc/dev-099/candidate-qc-result.json`

## 1. QC 原則與邊界

本 QC 只核對可重跑的候選證據、source boundary、artifact scope、測試總數、failed case 與 runtime cleanup；不把 source assertion、HTTP 204、staging preflight 或 local fault injection 推升為正式環境根因或 release PASS。

本次已執行隔離 Supabase TEST authenticated mutation/readback，並核對 canonical root dirty DEV-098 integration 的 local／TEST UI supplemental evidence；其後以明確 release approval 執行 production candidate、activation與production smoke，未執行schema／migration或非必要 production data mutation。候選分支與目前 root dirty worktree 分離，canonical root結果不冒充 clean candidate或release artifact。

### 1.1 T+0 release fact

release `20260902193607-61ff71`（source `0743ef1`）已通過 hosted Level 3 run `33674154248`、candidate acceptance、production-bound fixture smoke與Firebase live activation。activation evidence確認 artifact provenance 35/35、canonical browser smoke PASS、OAuth safe-cancel `302`、credential rotation PASS；fixture cleanup residual=0。Evidence：`output/release/dev-099/20260902193607-61ff71/activation-evidence.json`、`feature-evidence.json`、`candidate-acceptance.json`。

Naming release overlay：release `20260903035254-d4cf46`（source `7e4aba8`）已通過 Hosted Level 3 run `33712826895`、candidate acceptance、production-bound smoke與Firebase live activation；canonical artifact回讀35/35，舊詞 0／新詞 26，fixture cleanup residual=0。Evidence：`output/release/dev-099/20260903035254-d4cf46/activation-evidence.json`、`feature-evidence.json`、`candidate-acceptance.json`。

## 2. 事實驗證結果

| 檢查項目 | 結果 | 證據 |
|---|---|---|
| Candidate source／branch | PASS | `codex/capa-001-dev099@e00d9ac`（B07 verifier／local-test delay fault＋title canonical refresh）；worktree clean |
| Browser verifier syntax | PASS | `node --check scripts/verify-dev-099-task-persistence-convergence-browser.pw.js` |
| Root-cause harness | PARTIAL | `output/qa/dev-099/root-cause-result.json`；callbackless control path reproduced，R01～R06 exact incident trigger未證實 |
| Contract candidate | PARTIAL | `output/qa/dev-099/contract-result.json`；candidate scope，不是正式 provider evidence |
| Property state machine | PASS | `output/qa/dev-099/property-result.json`；P01～P12 12/12、1,000/1,000 seeded schedules |
| Fresh source／property rerun | PASS | candidate-local `C:\VIBE CODING\ProJED\.worktrees\ProJED\capa-001-dev099\output\capa-001\dev-099-root-cause-verification.json`（11/11）與 `C:\VIBE CODING\ProJED\.worktrees\ProJED\capa-001-dev099\output\qa\dev-099\property-result.json`（P01～P12、1,000/1,000）；latest source fix `@e00d9ac`，candidate worktree clean |
| Clean integrated source／property rerun | PASS（current-head revalidation） | `output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`（deterministic 11/11、property P01～P12、1,000/1,000、TypeScript、build:test、targeted lint、release adapter self-check 22 checks）；branch `codex/capa-001-dev099-integrated@60405c4`，behavior `@105fdbc`／verifier／QA metadata `@c3af71c`～`@c904435`；既有 Supabase UI artifact仍 pin behavior `@105fdbc`，正式 release須重建／核准 current-HEAD Release Capsule |
| Local browser | PASS | `output/playwright/dev-099/result-b07-stale.json`（generated `2026-09-02T14:13:09.349Z`）；B01～B11、B12-390、B12-320 共 13/13，B07 delayed stale completion，failed case IDs 為空 |
| Staging preflight | PASS（read-only） | `output/qa/dev-099/supabase-test-preflight-rerun-20260902.json`；fresh 8/8，非 production ref。 |
| Supabase project status | PASS（read-only） | `output/qa/dev-099/supabase-project-status-readonly-20260902.json`；ProJED_TEST／ProJED 均 `ACTIVE_HEALTHY`，僅證明 project 可達且健康，不包含 authenticated mutation/readback。 |
| Supabase schema preflight | PASS（read-only） | `output/qa/dev-099/supabase-schema-preflight-readonly-20260902.json`；TEST／production 均有 `wbs_items`／placements、RLS enabled、`bigint sort_order`；schema inspection 不替代 authenticated mutation/readback。 |
| Supabase policy preflight | PASS（read-only） | `output/qa/dev-099/supabase-policy-preflight-readonly-20260902.json`；兩環境 task-table policy parity，authenticated UPDATE 同具 `USING`／`WITH CHECK`。 |
| Runtime cleanup | PASS | `output/qa/dev-099/runtime-cleanup-execution-b11-stale-fix-20260902.json`；4010 task-owned tree stopped、port released；未停止 primary 4000 |
| Production duplicate observation | PASS（read-only） | `output/qa/dev-099/production-duplicate-observation-20260902.json`；同名任務為兩個不同 node ID、同一 parent/order；未執行 production mutation；不證明 exact persistence trigger |
| Production log correlation | PASS（read-only） | `output/qa/dev-099/production-log-correlation-rerun-20260902.json`；API 回傳 rows 未觀察到 `wbs_items` task mutation 或 operation ID，Postgres 僅見 `8.5` bigint error；不證明 exact persistence trigger |
| Production incident correlation | PASS（read-only） | `output/qa/dev-099/production-incident-correlation-rerun-20260902.json`；incident window 內 duplicate `task_created` 與第一筆 09:13:43 update 可與既有 204 做時間關聯，但無 operation ID／audit update，仍不證明 exact trigger |
| Production incident correlation live rerun | PASS（read-only） | `output/qa/dev-099/production-incident-correlation-live-20260903.json`；production ref `knodlkxqpcqyrtgwpdst` 事故窗 `activity_events=7`、`audit_logs=0`，兩筆「大陸PCT」同 parent／order、建立相隔 48.566321 秒，但無 operation ID，R01～R06 exact trigger 維持 `NOT_PROVEN` |
| Supabase TEST authenticated provider | PASS | `output/qa/dev-099/supabase-test-result.json`；TEST ref `fhisnnufoeulxqrchldf`，T00～T09 10/10，含 204、拒絕、stale、abort、response-lost、併發、reload與0 residual；`delete_workspace` permission denied由service-role fallback清理。 |
| Supabase TEST UI provider | PARTIAL PASS | `output/playwright/dev-099/result-supabase-test-ui.json`；U01～U03 authenticated edit／PATCH 204／reload canonical render PASS；U04 Back/navigation NOT RUN，因候選 production-base 不含 DEV-098 子任務導覽。 |
| Supabase TEST UI integration supplemental | PASS（supplemental） | `output/playwright/dev-099/result-supabase-test-ui-integrated.json`；root DEV-098 integration runtime 4013 重跑 U01～U04，Back 返回原 task、單一 modal、無 saving 污染；無 pageerror／request failure；task-filter preference 400與未部署 staging-reference RPC 404列為環境／相鄰 scope warning。 |
| Canonical root integration local browser | PASS（integration evidence） | `output/playwright/dev-099/result-root-local-final.json`；DEV-098＋DEV-099 同一 dirty working tree 執行 B01～B11、B12-390、B12-320 13/13，failedCaseIds 為空。 |
| Clean integrated Supabase TEST UI | PASS（same-artifact candidate） | `output/playwright/dev-099/result-clean-integrated-final-20260903.json`；production-base integrated behavior `@105fdbc`（初始 branch `@d650098`，current HEAD `@bcc5485`）同一 TEST fixture U01～U04 PASS，包含 authenticated PATCH 204、reload canonical title與single-modal Back；fixture cleanup residual=0、4014 released。 |
| Clean integrated DEV-098 adjacent regression | PASS | `output/playwright/dev-098/result-clean-integrated-final-20260903.json`、`output/qa/dev-099/clean-integrated-dev098-qc-20260903.json`；同一 `@bcc5485` worktree static 22/22、pure 10/10、browser B01～B16 16/16、diagnostics=0、independent QC 10/10；DEV-046／053／055／095 affected regression PASS，未使用 waiver；4015 released。 |
| Canonical root integration Supabase TEST UI | PASS（integration evidence） | `output/playwright/dev-099/result-root-supabase-ui-final.json`；同一 TEST fixture U01～U04 PASS，包含 authenticated PATCH 204、reload canonical title 與 single-modal Back；fixture cleanup residual=0。 |
| Runtime cleanup | PASS | `output/qa/dev-099/runtime-cleanup-supabase-provider-20260902.json`；4012 candidate與4013 supplemental runtime均停止、port released；TEST residual=0。 |

## 3. Candidate 行為判定

- CA-01：在候選 local contract 中，accepted／not-accepted dispatch、terminal outcome、exactly-once settlement 與 owner cleanup 有 evidence 支持；正式 incident linkage 仍 pending。
- CA-02：deadline、canonical readback、failed／unknown、Retry、close-pending 與 PWA reload-safety owner boundary 已由 B01～B11 local candidate evidence 支持；隔離 Supabase TEST T00～T09與UI U01～U03 provider/readback已通過，但 production provider、Back整合與完整 navigation仍 pending。
- PA-01／PA-02：local property與 fault-injection matrix在宣告範圍內通過；Supabase TEST T00～T09 已覆蓋 204、拒絕、stale guard、abort、response-lost、併發、reload與cleanup；U04 Back/navigation仍未在此候選執行。
- Clean integrated candidate：production-base `codex/capa-001-dev099-integrated@60405c4` 已將 DEV-098 surface與DEV-099 convergence固定於同一 branch，Supabase TEST UI U01～U04 PASS；current-head deterministic/property/typecheck/build/lint/release-adapter self-check亦 PASS（`output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`）。既有 UI artifact仍 pin behavior `@105fdbc`，須先完成 current-head same-artifact capsule／owner sign-off；尚未 activation或release。
- Clean integrated adjacent regression：同一 `@60405c4` worktree 的 DEV-098 static 22/22、pure 10/10、browser B01～B16 16/16、diagnostics 0與independent QC 10/10均 PASS；DEV-046／053／055／095 affected regression亦 PASS且未使用 waiver。此解除整合回歸未重跑疑慮，不解除 exact incident linkage、owner sign-off或release gate。
- Canonical root integration：在 DEV-098 surface 與 DEV-099 convergence 同一工作樹的 supplemental evidence 中，local browser 13/13 與 Supabase TEST UI U01～U04 均 PASS；這解除整合行為的「未重跑」疑慮，但不把 dirty working tree 當成 release artifact。

## 4. Findings 與阻擋

1. P0/P1 finding：在本次 local candidate scope 內為 0；這不是正式環境零缺陷聲明。
2. R01～R06 historical operation correlation 缺失，無法證明 production 事故實際命中 callbackless、stalled provider 或其他分支。
3. 已完成隔離 authenticated Supabase TEST mutation/readback；TEST `delete_workspace` RPC grant不足，已由 service-role fallback 清理且 residual=0，列為測試環境權限改善項，不能誤解為 production defect。
4. Original clean candidate source 不含 DEV-098 Back/navigation surface；U04在該候選仍為 NOT RUN，但 clean integrated behavior與canonical root均已補跑 U01～U04 PASS。T+0 Firebase Level 3、Release Capsule、activation與production smoke已完成；R01～R06 historical trigger linkage仍為 NOT_PROVEN，T+7/T+30 effectiveness尚未完成。

## 5. QC 結論

**Conditional PASS／T+0 Production Released。** CA-01／CA-02 已由 current release artifact、production-bound fixture與activation evidence支持；不得將 CAPA-001 標示為 closed，也不把歷史 correlation升格為 exact incident trigger。CAPA-001 維持 `Open / Incident Trigger Linkage NOT_PROVEN / Effectiveness Pending`，後續由 RD／QA／QC／Release owner追蹤R01～R06與T+7/T+30。

## 6. 變更紀錄

- 2026-09-02（初始 QC snapshot）：建立獨立 QC 事實報告，核對 d2df71e candidate、B01～B11 13/13、P01～P12、1,000/1,000、staging preflight與task-owned cleanup；當時 Supabase TEST、incident linkage與release gate為 NOT RUN／BLOCKED，後續 TEST evidence見下列更新。
- 2026-09-02：核對候選 `6c9710d` 的 B07 delayed stale-completion follow-up；`result-b11-stale.json` 13/13 PASS、4010 task-owned runtime 已停止且 port released。結論仍為 `Conditional PASS / Candidate only`，back、真實 provider readback、release與effectiveness gates 未解除。
- 2026-09-02：再核對候選 `6c9710d` 的 fresh B07 stale-completion rerun；`output/playwright/dev-099/result-b07-stale.json` 13/13 PASS（generated `2026-09-02T14:13:09`），4011 task-owned runtime 已停止且 port released。此為較新 local evidence；結論仍為 `Conditional PASS / Candidate only`，back、真實 provider readback、release與effectiveness gates 未解除。
- 2026-09-02：重新執行同一 clean candidate `@6c9710d` 的 deterministic root-cause 與 property verifier；source 11/11、P01～P12 12/12、1,000/1,000 seeded schedules 均 PASS，`output/qa/dev-099/property-result.json` generated `2026-09-02T14:27:57.034Z`。此為 local evidence refresh，不改變 Conditional PASS、Supabase TEST、back/navigation、release或effectiveness gate結論。
- 2026-09-02：核對 candidate `@e00d9ac` 的隔離 Supabase TEST T00～T09（10/10 PASS）與同候選 UI U01～U03（PASS）；U04 Back/navigation 因 candidate 不含 DEV-098 元件維持 NOT RUN；runtime 4012／4013停止且port released。QC 結論維持 `Conditional PASS / Candidate only / Release Blocked`。
- 2026-09-02：確認 `@e00d9ac` 的 stale canonical title overlay 修正已納入 source boundary；TEST UI diagnostics 僅 2 筆 task-filter preference HTTP 400 warnings，無 pageerror／request failure；cleanup artifact `supabase-ui-cleanup-20260902.json` 確認 4012 released、residual=0。此不解除 exact incident linkage、DEV-098 Back/navigation、Firebase Level 3、activation、release與effectiveness gates。
- 2026-09-02：root DEV-098 integration supplemental runtime 4013 重跑 U01～U04，四案 PASS，U04 證明 peer → Back 返回原 task且維持單一 modal；cleanup `supabase-ui-integrated-cleanup-20260902.json` 確認 port released、residual=0。此為 supplemental，不將 clean candidate 的 U04 NOT_RUN 改寫為 candidate evidence。
- 2026-09-02：收尾 fresh rerun 於 candidate `@e00d9ac` 完成 WP-099-A source/deterministic 11/11 與 WP-099-C property P01～P12、1,000/1,000 seeded schedules（artifacts generated `2026-09-02T15:46:16Z`）；root-cause source pin仍為 production base，exact incident trigger維持 PARTIAL。
- 2026-09-03：canonical root integration 接入 DEV-099 operation outcome／deadline-readback／unknown／stale-title convergence後，重跑 local browser 13/13 與同一 Supabase TEST UI U01～U04；`root-integration-result.json` 記錄 source boundary、diagnostics與 cleanup。此為 dirty integration evidence，RD Implementation Ready、exact incident linkage與 release gates仍未解除。
- 2026-09-03：由 production-base `13888b2` 建立 clean integrated branch（初始 `@d650098`，behavior `@105fdbc`／verifier metadata `@88a550a`），接入 DEV-098 surface與DEV-099 convergence；TypeScript／build:test PASS，隔離 Supabase TEST UI U01～U04 PASS，fixture residual=0、4014 released；`clean-integrated-result.json`記錄同一整合證據。branch目前 HEAD `@60405c4`且worktree clean；current-head deterministic/property、typecheck、build:test、targeted lint與release adapter self-check亦PASS，既有 artifact仍未 pin current-head production artifact；exact incident linkage、owner sign-off、hosted Level 3與release仍 pending。
- 2026-09-03：clean integrated branch 後續 `@c3af71c`／`@c904435` 僅調整 checklist/verifier／QA-SPEC evidence與預期診斷過濾，targeted lint 0 errors；UI artifact 的 behavior source pin 為`@105fdbc`，正式 release仍需 current-HEAD Release Capsule，release gate仍 pending。
- 2026-09-03：clean integrated `@c904435` 以 task-owned runtime 4015 重跑相鄰 DEV-098 B01～B16，16/16 PASS、diagnostics=0；static 22/22、pure 10/10與獨立 QC 10/10亦 PASS，DEV-046／053／055／095 affected regression PASS且未使用 waiver；4015已釋放。此補強 DEV-099 clean integration evidence，不解除 R01～R06、owner sign-off、Firebase Level 3、activation或release gate。
- 2026-09-03：重新以 production Supabase ref `knodlkxqpcqyrtgwpdst` 做事故窗唯讀 correlation；`activity_events=7`、`audit_logs=0`，兩筆「大陸PCT」同 parent／order且建立相隔 48.566321 秒，但 activity payload 無 operation ID，R01～R06 exact trigger 仍為 `NOT_PROVEN`。artifact=`output/qa/dev-099/production-incident-correlation-live-20260903.json`；未執行 production mutation、migration或release。
