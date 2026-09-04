# SPEC-099：任務儲存狀態收斂

- 關聯 DEV：DEV-099
- 來源 CAPA：`CAPA-001`
- 文件成熟度：`RD Contract Ready / Candidate + Clean Integration Implemented / Adjacent DEV-098 QC PASS / Incident Trigger Linkage NOT_PROVEN / Production Released / Effectiveness Follow-up Pending`
- 實作狀態：`Production release 20260902193607-61ff71 / source 0743ef1 / hosted Level 3 run 33674154248 PASS / candidate acceptance PASS / production-bound feature smoke PASS / activation provenance 35/35 + browser smoke PASS + OAuth 302 / current-head deterministic/property/typecheck/build/lint/release-adapter self-check PASS / T+7/T+30 Pending`
- 最新 naming release：`20260903035254-d4cf46 / source 7e4aba851529f74790da20c1dc02cc1cbe9fd2d3 / hosted Level 3 run 33712826895 PASS / canonical artifact old-term 0 + new-term 26 / production smoke PASS`
- 風險等級：P1／Application Persistence
- Spec Impact：`Intentional replacement`（只取代 SPEC-098 draft leave guard 的 callback-only／無 unknown-readback約束）
- 日期：2026-09-03

## 1. 目標與成功定義

修正正式環境任務內容已寫入資料庫、但任務明細永久停在「儲存中」的狀態分歧。成功必須同時成立：

- 只有 persistence boundary 已接受的操作可被 UI 計為 saving。
- 每個已接受操作恰好一次進入可判定 terminal outcome，不因 early return、task switch、unmount或 stale callback 永久懸空。
- provider 未在契約期限內提供可證明結果時，UI 顯示「狀態未確認」並走 canonical readback；不得隱藏 spinner冒充成功。
- draft、目前 task identity及 DEV-097 reload-safety owner 在 failed／unknown期間保持安全。
- 以最小狀態與既有任務明細位置呈現，不新增 panel、巢狀 card或全畫面 spinner。

本 SPEC 不宣稱已找出本次事故的確切 runtime trigger；production-base source callbackless path 已由 WP-099-A harness 重現，但歷史 operation correlation 不足，incident linkage仍是 CAPA closure Gate。前述 `codex/capa-001-dev099` @ `e00d9ac`、U04 `NOT_RUN` 與 candidate-only evidence為歷史候選基線；其後已由 clean release source `0743ef1`完成 T+0 production release，正式狀態與 evidence見下段及 release addendum。

目前已由 production-base clean integrated branch固定 DEV-098 navigation surface 與 DEV-099 convergence，並另以 current release commit `0743ef1` 建立 production artifact；隔離 Supabase TEST UI U01～U04、DEV-098 adjacent regressions與 hosted Level 3均通過。Firebase candidate／acceptance／activation與正式 URL smoke已完成；R01～R06 exact incident trigger仍因歷史缺少 operation ID 維持 `NOT_PROVEN`，不影響已授權的 T+0 safety release，但仍阻止 CAPA closure。完整 release evidence位於 `output/release/dev-099/20260902193607-61ff71/`。

## 2. 事實、假設與規格治理

### 2.1 已確認事實

- Production commit `13888b27221b4bf9214a5f78e00651a38f32c83f` 中，`TaskDetailsModal` 在呼叫 Store 前增加 pending。
- 同一 commit 的 `useWbsStore.updateNode` 在 missing node、collection pending、no-op 分支可直接 return，不回 terminal callback。
- 本次後端 PATCH 204 與 DB readback 已成功，但 UI 仍在 saving／dirty。
- `persistTaskUpdates` 會加入新 `updatedAt`，所以一般任務明細保存通常不會命中 Store no-op。
- 現有 log 沒有 operation ID，無法證明事故實際命中哪個 early return或 provider lifecycle 路徑。
- Incident-window read-only correlation 已確認兩筆同名 task 的建立順序，且第一筆 `updated_at=09:13:43.906523` 對上既有 API 204 時間；但 `activity_events`／`audit_logs` 仍沒有 operation ID 或 update audit，因此只補強時間關聯，不解除 exact-trigger Gate。

### 2.2 待證假設

高信心假設為「至少一個 caller 已登記的 persistence 沒有 terminal settlement」。DEV-099 必須重現並區分：

1. node missing；
2. task collection pending；
3. true no-op；
4. provider promise／callback不結案；
5. task switch／unmount／stale callback ownership；
6. 其他可留下 pending 的分支。

如果忠實 fixture 無法重現，RD 必須停止既定修法並更新 CAPA／本 SPEC，不得以 source smell冒充事故根因。

### 2.3 Cross-spec 決議

- `SPEC-098` 的子任務 surface、local drag、navigation stack、overlay與permission契約保留。
- 本 SPEC 明示取代 `SPEC-098 §7.6` 中「callback 未 settle時無限等待、不得進入 unknown或 canonical readback」的 persistence部分。
- `SPEC-041` DEV-097／`ADR-047` 的 dirty owner與 reload safety保留；failed／unknown不得被視為 safe-to-reload。
- `SPEC-089` placement transaction的 failure／unknown保留，不由本 SPEC 改寫。
- 一般任務 create idempotency與 task order契約分別由 DEV-100、DEV-101處理，不得膨脹進 DEV-099 hotfix。

## 3. Scope

- Production-commit-pinned root-cause reproduction與最小 correlation trace。
- 任務明細 title／notes persistence dispatch、accepted ownership、terminal settlement與 cleanup。
- close／push／back／create-and-navigate共用同一 persistence primitive。
- bounded unknown、canonical readback、Retry與 stale-owner隔離。
- 受影響 source、pure、browser、Supabase TEST及 release evidence契約。

## 4. Out of Scope

- 一般任務 create operation key、DB unique constraint或 idempotent RPC（DEV-100）。
- `wbs_items.sort_order` schema／rank演算法或 migration（DEV-101）。
- 刪除／合併 production 重複資料。
- 重做 `TaskDetailsModal` 資訊架構、子任務 UI、drag、overlay或全站 Store框架。
- commit、merge、push、deploy、activation、production mutation或 production smoke。

## 5. Persistence Contract

### 5.1 Dispatch 與 terminal outcome

Persistence boundary 必須回傳可區分的 dispatch結果；名稱可依實作調整，但語意不可省略：

```text
not accepted → noop | blocked | missing | forbidden
accepted     → operationId + exactly-one completion
completion   → persisted | failed | unknown
```

- `not accepted` 不得增加 pending owner；它本身就是同步可判定結果。
- `accepted` 才能進入 saving，且必須持有穩定 operation identity與 source task/version。
- completion 無論 success、failure、deadline、unmount或 exception，都必須走不可漏的 cleanup。
- 同一 operation 的重複／stale completion可被忽略為畫面更新，但不得再次結案或污染新 task。
- 不要求特定 Set／Map／counter資料結構；RD 必須選擇最小、可由 contract test證明 exactly-once 的方案。

### 5.2 Deadline、unknown 與 canonical readback

- Deadline 由 provider contract定義並可用 fake clock測試；初始數值必須在 root-cause evidence中記錄，不在本 SPEC 武斷固定 10 秒。
- Deadline 到期只代表結果不可判定，不代表 provider失敗或成功；UI 進入 `unknown`。
- `unknown` 必須觸發或提供 canonical readback。只有具權威版本／operation evidence，或可證明 canonical值包含本次 intent且不被較新寫入覆蓋時，才能轉為 `persisted`。
- 無法證明時保持 unknown並提供 Retry；不得以 optimistic store、HTTP request已送出或 spinner逾時推導成功。
- Retry 必須保留 draft與 source identity；它不得清除仍可能完成的原 operation，且需防 stale completion覆蓋較新結果。

### 5.3 Navigation／unmount ownership

- close、push、back、create-and-navigate共用同一 persistence owner與 transition queue。
- saving、failed、unknown或 placement pending時不得切換 task identity。
- task switch／unmount 可釋放該 component 的 UI owner，但不得宣稱取消已送出的 canonical mutation。
- 新 entry不得繼承舊 entry的 saving／error；舊 operation完成也不得更新新 entry。
- `taskDetailsHasLocalChanges` 在 saving、failed、unknown及 pending transition時維持 dirty。

## 6. UI Entry Contract

- 沿用任務明細標題列既有保存狀態位置；不新增對話框、卡片、toast堆疊或第二個狀態區。
- `saving`：顯示既有精簡「儲存中」。
- `persisted`：沿用短暫成功回饋，且只在具權威成功證據時顯示。
- `failed`：顯示精簡失敗＋Retry，保留 draft。
- `unknown`：顯示「儲存狀態未確認」＋Retry／重新讀取的單一主行動；不得同時顯示成功。
- 狀態文案不可暴露 operation ID、任務正文、provider stack或敏感 payload。
- 320px 仍不得水平溢位；狀態與既有 overflow menu／close control不重疊。

## 7. Root Cause Verification Gate

本輪依使用者「完成 CAPA-001 措施」要求，先在 production-base clean worktree 形成 application candidate 供驗證；已完成隔離 Supabase TEST T00～T09 與 UI U01～U03，但這不等同於將文件成熟度提升為 `RD Implementation Ready`，也不解除 incident linkage、U04 Back/navigation、release或production activation gate。

後續已在 canonical root dirty integration 補跑同一套 DEV-098＋DEV-099 U01～U04 與 local B01～B11/viewport；另在 clean integrated behavior `@105fdbc` 重跑 U01～U04。該結果可以作為整合行為 evidence，但不能消除 exact trigger、owner sign-off與release gate。

進入 `RD Implementation Ready` 前必須留下：

- production commit／忠實 fixture與 source revision；
- 每次 operation 的 accepted與否、Store branch、provider request開始／結束、terminal outcome、owner cleanup；
- 至少一條能穩定重現永久 saving的 exact path；
- no-op 可達性結論；
- 根因與修正點的一對一對應，或假設遭否證後的更新版 RCA。

未滿足上述 Gate時，不得部署、啟用或宣稱根因已修正；本輪僅依使用者明確「完成 CAPA-001 措施」要求，在 production-base clean worktree 保留 non-production application candidate 供驗證，仍不得視為正式 hotfix。

## 8. Source 與 Release Boundary

- Hotfix來源必須從 production base `13888b27221b4bf9214a5f78e00651a38f32c83f` 建立乾淨 worktree／等價隔離分支。
- 目前 dirty branch 的 DEV-098、drag或其他未提交變更不得默認進入 hotfix artifact。
- 若選擇整合 dirty work，需先列出完整 source delta、依賴理由與新增 regression gate，並由技術主管重新核准。
- Application-only預設 Lane 2；一旦需要 schema、RLS、RPC、正式資料處理或 migration，立即停止並改走 Lane 3。
- 文件核准不等於 deploy／release授權。

## 9. Work Packages

| WP | 內容 | Exit Gate |
|---|---|---|
| WP-099-A | Production-pinned reproduction與 correlation harness | 確認 exact trigger，或正式否證並更新 RCA |
| WP-099-B | Dispatch／terminal contract與最小 owner cleanup | 所有分支 exactly once；無 callbackless accepted operation |
| WP-099-C | unknown／readback、navigation與 minimal UI | failure/race matrix；無 false success／draft loss |
| WP-099-D | Supabase TEST、真實 browser、regression與 evidence | QA-DEV-099 必要案例全 PASS，P0/P1 finding=0 |
| WP-099-E | Release capsule與 production effectiveness | T+0 production release PASS；T+7、T+30 effectiveness follow-up pending |

順序固定 A → 技術主管根因確認 → B → C → D；未重新核准不得跳過 A 直接進 B／C。

## 10. Acceptance Criteria

- `AC-099-001`：可重現並指出本次永久 saving 的 exact trigger；若原假設錯誤，CAPA與SPEC已先修正。
- `AC-099-002`：missing、collection pending、no-op、forbidden均同步回傳 not-accepted terminal結果，pending不增加。
- `AC-099-003`：每個 accepted operation在 success、failure、exception與deadline下恰好一次結案與 cleanup。
- `AC-099-004`：success、4xx／409、offline、timeout、response lost都在 contract期限內顯示真實 persisted／failed／unknown，無 false success。
- `AC-099-005`：unknown readback不覆寫較新 task/version；無權威證據時不轉成 persisted。
- `AC-099-006`：double save、rapid blur、same-value、task switch、unmount與 stale completion不留下 saving、不污染新 entry。
- `AC-099-007`：close／push／back／create-and-navigate共用 persistence primitive；dirty／failed／unknown時不切換。
- `AC-099-008`：draft在 failed／unknown與 Retry過程保持；成功 readback與 reload後 canonical值一致。
- `AC-099-009`：1440×900、390×844、320×844狀態可見且無 overflow、重疊或新容器膨脹。
- `AC-099-010`：exact hotfix source、artifact、TEST、candidate、activation與 production smoke可追溯；未授權階段保持 NOT RUN。

## 11. Stop Conditions

- 無法重現 exact trigger卻準備宣稱根因修正。
- 以隱藏 spinner、無限延長等待、optimistic store或 HTTP 204 單獨當成功證據。
- accepted operation仍存在 callbackless／promise-less return。
- Retry清除 draft、產生 false success或 stale completion污染新 task。
- 為 DEV-099 引入 create idempotency／order migration／全站 Store重構。
- 從無法證明的 dirty source建立 production hotfix。
- 任何必要 evidence為 NOT_RUN／BLOCKED卻標 PASS，或未授權 deploy／production mutation。

## 12. 下一步

目前已完成 WP-099-A source/deterministic harness、WP-099-B/C application candidate、隔離 Supabase TEST provider T00～T09、clean integrated U01～U04與 DEV-098 adjacent QA/QC evidence；仍未取得 incident exact trigger linkage、owner sign-off、current-HEAD Release Capsule或 release approval。下一步是補齊 R01～R06 correlation／必要 integration matrix，若證據否證原假設則先回修 CAPA／SPEC；在此之前不部署、不改 DB、不做 production mutation。

## 13. 變更紀錄

- 2026-09-02：依 `CAPA-001` 與 RD 技術主管審查建立；固定 root-cause-first、typed terminal語意、bounded unknown/readback、minimal UI、clean hotfix source與分案邊界。後續在乾淨 production-base 分支形成 candidate，source/deterministic、P01–P12、1,000 seeded local property、local-test B01–B05 fault／retry／readback與local-browser evidence通過；並修正 Enter＋blur autosave race；狀態為 `Candidate Implemented / Incident Trigger Linkage Pending`，未釋出。
- 2026-09-02：在 clean candidate 以 `VITE_DATA_BACKEND=local-test` fresh rerun B01～B05、B12-390、B12-320，7/7 PASS；`runtime-cleanup-execution-20260902.json` 記錄 4010 process tree 已停止且 `portReleased=true`。R01～R06 exact incident correlation、Supabase TEST、完整 QA/QC 與 release 仍未完成。
- 2026-09-02：candidate extended browser rerun 補齊 B06 same-value no-op、B07 rapid-save、B08 task-switch、B09 unmount；B01～B09、B12-390、B12-320 共 11/11 PASS，artifact=`output/playwright/dev-099/result.json`（generated `2026-09-02T13:00:34.265Z`）。本地 fault injection 不改變 R01～R06、Supabase TEST、完整 QA/QC 與 release gate。
- 2026-09-02：candidate browser extension `@6eabc3f` 補 B10 close-pending recovery；未結案時關閉保留 modal／draft，bounded failure 後 Retry 成功才允許關閉；B01～B10、B12-390、B12-320 共 12/12 PASS，artifact `output/playwright/dev-099/result-b10.json` generated `2026-09-02T13:24:42.555Z`。back、stale completion、Supabase TEST與release gate仍未完成。
- 2026-09-02：candidate browser extension `@d2df71e` 補 B11 DEV-097 PWA reload-safety owner boundary；saving／failed／unknown 均保持 unsafe，Retry 後 canonical readback persisted 才恢復 safe；B01～B11、B12-390、B12-320 共 13/13 PASS，artifact `output/playwright/dev-099/result-b11.json` generated `2026-09-02T13:34:18.937Z`，runtime cleanup `runtime-cleanup-execution-b11-20260902.json` 已停止且 portReleased=true。back、stale completion、Supabase TEST與release gate仍未完成。
- 2026-09-02：獨立 `QC-DEV-099-task-persistence-convergence.md` 核對 candidate source／property／browser／preflight／cleanup evidence，結論為 `Conditional PASS / Candidate only`；TEST provider已補齊，但不解除 incident linkage、U04 Back/navigation、activation、release與effectiveness gates。
- 2026-09-02：同一 clean candidate `@6c9710d` fresh rerun WP-099-A deterministic root-cause 11/11 與 WP-099-C property P01～P12、1,000/1,000 seeded schedules；`output/qa/dev-099/property-result.json` generated `2026-09-02T14:27:57.034Z`。此只刷新候選 evidence，SPEC 狀態仍為 `RD Contract Ready / Candidate Implemented / Incident Trigger Linkage Pending`。
- 2026-09-02：candidate extension `@6c9710d` 新增 `delay-response-once`，使第一筆 mutation 在 canonical commit 後延遲回應，補驗 B07 delayed stale completion 不回退最新值或 saving/error 狀態；`output/playwright/dev-099/result-b11-stale.json` B01～B11、B12-390、B12-320 共 13/13 PASS，generated `2026-09-02T14:03:36.459Z`，runtime cleanup `runtime-cleanup-execution-b11-stale-fix-20260902.json` 已停止且 portReleased=true。back、真實 provider readback、Supabase TEST與release gate仍未完成。
- 2026-09-02：同一 `@6c9710d` 再完成 fresh B07 stale-completion browser rerun；`output/playwright/dev-099/result-b07-stale.json` B01～B11、B12-390、B12-320 共 13/13 PASS，generated `2026-09-02T14:13:09Z`，4011 task-owned runtime已停止且 portReleased。back、真實 provider readback、Supabase TEST與release gate仍未完成。
- 2026-09-02：candidate 更新至 `@e00d9ac` 後完成隔離 Supabase TEST T00～T09（10/10 PASS）及同候選 UI U01～U03 authenticated provider smoke；U04 Back/navigation 因 production-base 不含 DEV-098 元件維持 `NOT_RUN`。`output/qa/dev-099/supabase-test-result.json`、`output/playwright/dev-099/result-supabase-test-ui.json`與runtime cleanup evidence已建立；不解除 incident linkage、integration Back、release或effectiveness gate。
- 2026-09-02：root DEV-098 integration supplemental 以同一 TEST fixture 重跑 U01～U04，含 modal Back/navigation 全部 PASS；artifact=`output/playwright/dev-099/result-supabase-test-ui-integrated.json`。此為整合補充證據，不改寫 clean candidate U04 `NOT_RUN`，也不解除 Firebase Level 3、incident linkage或release gate。
- 2026-09-03：canonical root dirty integration 接入 convergence implementation 後，fresh local browser B01～B11、B12-390、B12-320 13/13 PASS，並以同一 TEST fixture 執行 U01～U04 PASS；artifacts=`output/playwright/dev-099/result-root-local-final.json`、`output/playwright/dev-099/result-root-supabase-ui-final.json`、`output/qc/dev-099/root-integration-result.json`。此不代表 clean hotfix、RD Implementation Ready或 release 已核准。
- 2026-09-03：由 production-base `13888b2` 建立 clean integrated branch（初始 `@d650098`，behavior `@105fdbc`／verifier `@88a550a`，目前 HEAD `@60405c4`），接入 DEV-098 surface與DEV-099 convergence；TypeScript／build:test PASS，隔離 Supabase TEST UI U01～U04 PASS，fixture residual=0、port 4014 released；artifact=`output/qc/dev-099/clean-integrated-result.json`。後續 release adapter／Release Capsule／hosted Level 3 workflow／env authority commits未改動 DEV-099 runtime source，current-head deterministic/property/typecheck/build/lint與release adapter self-check亦 PASS；既有 artifact仍待 current-head pin；exact incident trigger、owner sign-off、hosted Level 3與release仍 pending。
- 2026-09-03：clean integrated 後續 `@c3af71c`／`@c904435` 僅調整 checklist/verifier／QA-SPEC evidence與預期診斷過濾；`@5bd5200`～`@60405c4`補上 release adapter、Release Capsule、hosted Level 3 workflow與env authority修正，targeted lint 0 errors／3既存warnings，不改變 exact incident trigger與release gate。
- 2026-09-03：同一 clean integrated HEAD `@60405c4` fresh 重跑 WP-099-A deterministic 11/11與 WP-099-C property P01～P12、1,000/1,000；並完成 DEV-098 adjacent B01～B16 16/16、static 22/22、pure 10/10與independent QC 10/10，diagnostics=0、4015 released；current-head TypeScript、build:test、targeted lint與release adapter self-check亦 PASS。此補強 integration evidence，不解除 R01～R06 exact trigger、owner sign-off、hosted Level 3或 release gate。
- 2026-09-03：重新以 production Supabase ref `knodlkxqpcqyrtgwpdst` 做事故窗唯讀 correlation；`activity_events=7`、`audit_logs=0`，兩筆「大陸PCT」同 parent／order且建立相隔 48.566321 秒，但 activity payload 無 operation ID，R01～R06 exact trigger 仍為 `NOT_PROVEN`。artifact=`output/qa/dev-099/production-incident-correlation-live-20260903.json`；未執行 production mutation、migration或release。
