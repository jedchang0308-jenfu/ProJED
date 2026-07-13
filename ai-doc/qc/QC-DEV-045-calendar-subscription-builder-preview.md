# QC-DEV-045: 行事曆訂閱篩選器建構器與即時預覽

關聯 DEV：DEV-045
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
關聯 QA：`ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md`
狀態：Per-Board v3 Production Released / Level 4 QC Passed / Historical v2 Evidence Preserved
日期：2026-07-12

## Production release QC addendum - 2026-07-13

Release owner核准後，QC依Lane 3順序完成production DB migration history reconciliation、5筆migration、`calendar-feed` version 4與Firebase live部署。最終production migration為38/38，DB lint與validator / RLS / grant contract check通過；線上`index-DGur8aYq.js`、`index-CLsSmPB5.css`逐檔hash等於release artifact。

Authenticated Level 4 fixture `LEVEL4-DEV045-20260713-G4`在UI輸出4個到期事件，live ICS為HTTP 200、4個VEVENT，normalize顯示前綴後事件identity完全一致。停用410、重新啟用200、重生後舊token 404 / 新token 200、random token 404均通過且無secret leakage。Exact-one-row cleanup後DB residual為0，刪除後token為404，原有兩筆訂閱未變。Google Calendar post-deploy reload仍可見既有v1 `JED個人工作區`事件；production維持2筆active v1 row。完整release、rollback與hash evidence見`ai-doc/release/PREPRODUCTION-DEV-045-20260713.md`。

## Superseded Boundary - 2026-07-12

使用者已決定以「每張看板獨立設定」取代本報告驗證的 `global_filter + board_overrides` v2 模型。此報告保留 2026-07-07 本機實作、preflight、local DB smoke 與 branch blocker 的事實，不撤銷也不改寫當時證據；但下列邊界立即生效：

- 本報告不能作為新版逐看板 `board_filters`、共用條件 UI、state isolation、batch copy、v1/v2 materialization 或 v3 feed matcher 的通過證據。
- 原 v2 remote migration / Edge deploy / live `.ics` gate 已凍結；不得因本報告的 preflight 通過而繼續部署舊 v2 source。
- 新方向需依修訂後的 `SPEC-045` 與 `QA-DEV-045` 重新完成 Phase 1/2 本機 RD、QA、QC。
- remote migration、Edge deploy、production release 與 live smoke 等待新的 release 型指令與 release gate；先前針對舊 payload 的 remote intent 不自動沿用。

## Current v3 QC Addendum - 2026-07-12

DEV-045 Phase 1-2 已依逐看板 v3 契約完成本機 RD、QA 與 QC。Calendar 與全域任務工作台共用 `TaskConditionFilterControls` 的條件順序與互動語法，但 active state、draft 與 persistence 完全隔離。Calendar create/edit path只保留逐看板 selector、included toggle、目前看板 reset、一次性 batch copy 與 live preview；不再顯示 global / inheritance / override UI。

v3 canonical payload為 `version: 3`、`v3_scope_type: per_board_filter_snapshot`與完整 `board_filters` map；每張 snapshot同時保存自己的 `date_types`與 `TaskFilterState`，不再有頂層日期條件。client normalizer會解析 app/storage aliases並拒絕缺漏、額外 snapshot或已納入但無事件日期的看板；v1/v2只在使用者編輯時把舊頂層日期複製到各 board並 materialize成獨立 draft。新 migration source保留v1/v2 validator並新增v3 exact-key、逐看板 date、included board、active membership與 per-board manage permission檢查；Edge matcher逐 project套 task filter與 date types，assignee/tag query只作 coarse union，最終仍逐看板比對。

Browser QC以兩看板 deterministic local fixture實跑1440x900、1024x768、390x844、320x700，通過看板task/date draft isolation、切換保留、清空日期阻擋、排除/恢復、目前看板reset、batch copy條件與日期後不連動、mobile事件預覽與drawer、Escape focus restore及horizontal overflow檢查。截圖：`dev-045-calendar-v3-desktop.png`、`dev-045-calendar-v3-excluded.png`、`dev-045-calendar-v3-tablet.png`、`dev-045-calendar-v3-mobile-events.png`、`dev-045-calendar-v3-mobile.png`、`dev-045-calendar-v3-mobile-320-events.png`、`dev-045-calendar-v3-mobile-320.png`。

使用者於 2026-07-12 以實際畫面指出「設定完成後找不到訂閱按鈕」，因此重新開啟 UI QC。修正後 `訂閱名稱`與 `建立訂閱並複製連結` CTA在任務預覽前的同一列，送出列在捲動時固定於表單頂端；320px使用短版按鈕文字維持同列且不壓垮輸入框。本機模式使用相同位置但保持 disabled，並直接顯示「請到已連接 Supabase 的環境建立訂閱」；Supabase模式則依名稱、預覽完整性、included board與各看板日期決定是否啟用。逐看板事件日期位於過濾器內，不再占用訂閱層級表單。更新後browser gate重新通過，1440x900、1024x768、390x844與320x700均無重疊或水平溢出。

同日使用者再指出原預覽仍是任務卡清單，無法直接判斷外部行事曆實際訂閱內容。修正後預覽以 `task ID + date type`事件為單位：摘要顯示workspace、board、unique task、總事件及開始／到期數；一列只代表一個實際日期事件；預設依日期分組並可切換依看板；raw status改為繁中；缺少所選日期的候選列入可展開的「未產生事件」。預覽預設12列並以頁面捲動展開全部，移除原 `max-h-72 overflow-y-auto` nested scrollbar。Browser gate直接檢查每列task / board / date / date type屬性、逐看板date isolation、分組切換與computed overflow。

本機 DB smoke在 `supabase_db_ProJED` 以 transaction套 DEV-037、v2、v3 validator source後執行22個 allow/deny/grant檢查並 rollback。通過 member own-only、member broad deny、project manager managed-board broad allow、manage permission不得跨 board外溢、non-member assignee deny、exact snapshot key、至少一張included board、included board不可無事件日期與v3拒絕舊頂層 `date_types`。此證據未寫入remote DB。

Current v3 gates：

| Gate | 結果 | 證據 |
|---|---|---|
| `verify:dev-045-calendar-subscription-builder-preview` | Pass | 18 pass / 0 fail |
| `verify:dev-045-calendar-subscription-builder-preview-browser` | Pass | 7 viewport/state screenshots；逐事件identity、分組與nested-scroll檢查；無visible runtime error或overflow |
| `verify:dev-045-calendar-subscription-v3-model` | Pass | 14 pass / 0 fail；new/v1/v2/v3日期轉換、逐看板日期與獨立物件 fixture |
| `verify:dev-045-calendar-subscription-v3-feed` | Pass | 13 pass / 0 fail |
| local DB smoke `--run-local-db` | Pass | 13 gate checks；22 SQL behaviors；transaction rolled back |
| `npx supabase db lint --local --level warning` | Pass | No schema errors found |
| `npx --yes deno-bin check supabase/functions/calendar-feed/index.ts` | Pass | Edge TypeScript check passed |
| `npx tsc --noEmit` | Pass | 0 errors |
| `npm run build:test` | Pass | Vite test-mode production bundle passed |
| DEV-037 regression | Pass | static 20/20 + browser |
| DEV-039 regression | Pass | core 61/61 + browser；filter parity 26/26 + browser |

Current boundary：Phase 1-2 local development已完成；remote Supabase migration apply、Edge deploy、live `.ics` parity、Firebase production release與 rollback artifacts未執行，也未由本次「完成開發」指令授權。舊 v2 remote path維持 frozen；後續 release必須使用 v3 migration / Edge source重新進入 Level 3與 deployment-release-gate。

Residual evidence gap：local browser已實跑所有看板 excluded的恢復狀態，但未強制注入單一 `nodeService.listByProject` reject或 Supabase create/update failure；partial/error分支、save blocking與 draft-preservation wiring已有 static/source coverage，live failure behavior仍需 staging mock或 Phase 3 live gate補證，不計為 production readiness。

## Historical v2 QC 結論

DEV-045 Phase 1 local Builder slice 已完成本機實作與 static/build QC。DEV-045 Phase 2 local source 已補上 v2 filters_json validation migration source、client normalizer、Edge Function v2 feed matcher 與 static verifier。

2026-07-07 補齊 Phase 1 browser QC：新增 local-test-only Builder 預覽路徑與 `verify:dev-045-calendar-subscription-builder-preview-browser`，以同一個 `CalendarSubscriptionBuilderPreview` 元件覆蓋 desktop / mobile / empty preview / board exclude / board custom override / horizontal overflow。這不建立 `.ics` 訂閱連結，也不套用 remote DB / Edge 變更。

2026-07-07 Phase 3 read-only preflight 已執行。使用者已授權剩餘任務開發，但正式 remote migration / Edge deploy 仍未執行。`ProJED_TEST` Supabase project 目前 inactive，不能作為 staging；production 仍缺 DEV-037 / DEV-045 migrations，且 deployed `calendar-feed` version 3 仍未包含 v2 matcher。

2026-07-07 續接 read-only discovery 補強：Supabase MCP `list_projects` 顯示 production `ProJED` / `knodlkxqpcqyrtgwpdst` 為 `ACTIVE_HEALTHY`、Postgres `17.6.1.121`，`ProJED_TEST` / `fhisnnufoeulxqrchldf` 為 `INACTIVE`。production migration history 尚未包含本地 DEV-037 `20260706091804_calendar_subscription_source_scope.sql` 與 DEV-045 `20260706162052_calendar_subscription_v2_filters.sql`；deployed `calendar-feed` 仍是 version 3，source 仍使用 v1 `getAllowedTenantIds` / workspace-only feed flow，未包含 v2 `matchesV2TaskFilters`、tag join 或 `project_ids` filter。production aggregate count 為 total subscriptions 2、active 2、v2 0。Supabase branch listing MCP call 回 `Project reference is missing when validating permissions`；建立 branch 另需 Supabase cost confirmation，未建立 branch。

2026-07-07 補上 `verify:dev-045-calendar-subscription-remote-readiness`，把 Phase 3 進入遠端 gate 前的本機 artifacts 檢查自動化。此 verifier 只確認 DEV-037 / DEV-045 migration 順序、DEV-045 validation grants、client v2 normalizer、local Edge v2 matcher、package script 防呆、文件 stop condition 與 read-only discovery 邊界；不連線 Supabase、不套 migration、不部署 Edge，也不代表 remote gate 完成。

2026-07-07 補上並通過 `verify:dev-045-calendar-subscription-local-db-smoke`。預設 self-check 不連 DB；actual mode `node scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs --run-local-db` 連本機 Docker Supabase DB `supabase_db_ProJED`，以 transaction-scoped SQL 套 DEV-037 / DEV-045 validators、建立最小 workspace / board / member fixture、驗證 10 個 v2 allow/deny/grant 行為並 `ROLLBACK`。此 gate 是 local DB smoke，不代表 remote migration apply、Edge deploy 或 live `.ics` preview/feed parity 完成。

2026-07-07 release-gate preflight rerun 已完成，但仍停在正確 release blocker。通過項目包含 DEV-045 remote-readiness 21/21、v2 feed 18/18、Builder static 16/16、DEV-037 20/20、DEV-039 61/61、local DB smoke 12/12 rollback、TypeScript noEmit、settings gate、Edge bundle check、production build，以及 production artifact smoke。Artifact smoke 只驗證本機 `dist` build 載入 `assets/index-Gis551LA.js` / `assets/index-wbfiQlLo.css` 並通過 app shell / bundle load 檢查，不代表 Firebase Hosting 已部署。Supabase read-only discovery 再次確認 production 缺 DEV-037/045 migrations、`calendar-feed` version 3 是 rollback target、production active subscriptions 2 / v2 0。`ProJED_TEST` inactive 且 branch listing 仍失敗；Supabase branch creation 需使用者先完成 cost confirmation。因此依 deployment-release-gate，不得自行直接套 production DB/Edge，除非使用者明確選擇 branch/staging path 或 risk-accepted production path。

2026-07-07 branch/staging path follow-up：使用者選擇 Supabase branch/staging path，並由另一個 Codex session 查得 branch cost `amount=0.01344`、`recurrence=hourly`；Supabase MCP 未附幣別，本報告不自行補推。使用者要求繼續開發後，本 session 呼叫 `_confirm_cost` 成功，但未將 confirmation id 寫入文件。隨後呼叫 `_create_branch` 建立 `dev-045-calendar-subscription-v2-staging` 失敗，Supabase MCP 回 `You do not have permission to perform this action`。結果：branch 未建立、remote migration 未套用、`calendar-feed` 未部署、production 未變更。下一步需使用具 branch create 權限的 Supabase 帳號/OAuth，或由具權限者建立 branch 後提供 branch project ref。

已完成：
- 新增 `CalendarSubscriptionBuilderPreview`，提供全域條件、看板沿用 / 自訂 / 排除、本地任務預覽、輸出摘要與外部連結風險提示。
- `CalendarSubscriptionsView` 已掛載 Builder，並保留 DEV-037 v1 source-scope 相容 UI 與既有訂閱列表。
- `CalendarSubscriptionFilters` 已新增 v2 local contract 欄位，但未變更 DEV-037 v1 `scope_type` contract。
- 新增 `verify:dev-045-calendar-subscription-builder-preview` static gate。
- 新增 `verify:dev-045-calendar-subscription-builder-preview-browser` browser gate，產生 desktop、empty、exclude、mobile 截圖。
- 新增 `verify:dev-045-calendar-subscription-v2-feed` static gate，覆蓋 v2 DB validation、service normalizer、submit wiring、Edge matcher 與 tag join。
- 新增 `verify:dev-045-calendar-subscription-remote-readiness` static gate，覆蓋 remote gate 前置 artifacts 與 stop condition。
- 新增 `verify:dev-045-calendar-subscription-local-db-smoke` guarded local DB gate；actual mode 以 transaction + rollback 驗證 DEV-045 v2 validation functions、snapshot project scope、board override negative case 與 authenticated/anon execute grants。
- Phase 3 read-only preflight：production project `knodlkxqpcqyrtgwpdst` healthy / Postgres 17，`calendar-feed` current version 3 active，`verify_jwt=false`，rollback source 已可由 Supabase MCP 讀取。
- Phase 3 DB preflight：正式 DB 目前仍是 v1 validation function；`calendar_subscription_task_filter_allowed(jsonb)` 不存在，`calendar_subscription_filter_allowed(jsonb)` 不含 `project_ids` / `v2_scope_type`；正式訂閱 2 筆、active 2 筆、v2 0 筆。
- Phase 3 migration history preflight：production 尚未列出 DEV-037 `20260706091804_calendar_subscription_source_scope` 或 DEV-045 `20260706162052_calendar_subscription_v2_filters` migration。
- Phase 3 Edge source preflight：production `calendar-feed` version 3 仍是 workspace-only source-scope，尚未部署本地 v2 preview/feed parity matcher。
- Phase 3 release-gate preflight rerun：production artifact smoke 載入 `assets/index-Gis551LA.js` / `assets/index-wbfiQlLo.css` 通過；臨時 preview server 已清理；此項不代表 production deploy。
- Branch cost confirmation：branch cost `0.01344 / hourly` 已經 Supabase MCP confirmation flow 確認；工具未附幣別。
- Branch creation attempt：`dev-045-calendar-subscription-v2-staging` 建立失敗，Supabase MCP 回 branch create 權限不足；未建立 branch。
- Migration hardening：DEV-045 migration 已明確 revoke `PUBLIC` / `anon` 對 validation functions 的 execute，再 grant `authenticated`。

未執行：
- Supabase remote migration apply。
- `calendar-feed` Edge Function deploy。
- preview/feed identity parity live verification。
- Firebase Hosting production deploy。
- Supabase live / production browser screenshot QC。
- Partial/error board-load fixture browser QC。
- Deno Edge Function type check；本機未安裝 `deno`，目前以 static verifier 覆蓋 source contract。
- Supabase local DB lint；本輪以 transaction-scoped local DB smoke 取代 lint，尚未執行 `supabase db lint --local`。

## 驗證命令

| Gate | 結果 | 證據 |
|---|---|---|
| `npm.cmd run verify:dev-045-calendar-subscription-builder-preview` | Pass | 16 pass / 0 fail |
| `npm.cmd run verify:dev-045-calendar-subscription-builder-preview-browser` | Pass | `dev-045-calendar-builder-desktop.png`、`dev-045-calendar-builder-empty.png`、`dev-045-calendar-builder-exclude.png`、`dev-045-calendar-builder-mobile.png` |
| `npm.cmd run verify:dev-045-calendar-subscription-v2-feed` | Pass | 18 pass / 0 fail |
| `npm.cmd run verify:dev-045-calendar-subscription-remote-readiness` | Pass | 21 pass / 0 fail；local-only preflight, no Supabase apply/deploy |
| `npm.cmd run verify:dev-045-calendar-subscription-local-db-smoke` | Pass | Self-check 9 pass / 0 fail；actual DB smoke skipped by default |
| `node scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs --run-local-db` | Pass | Local Docker DB `supabase_db_ProJED`；12 pass / 0 fail；10 SQL behavior checks passed；transaction rolled back |
| `npm.cmd run verify:dev-037-calendar-subscription-source-scope` | Pass | 20 pass / 0 fail |
| `npm.cmd run verify:dev-037-calendar-subscription-source-scope-browser` | Pass | DEV-037 local-test fallback/browser regression passed |
| Supabase MCP read-only preflight | Pass / blocked for deploy | Production project healthy；current `calendar-feed` version 3 active；DB v2 functions not applied；staging unavailable |
| Supabase MCP migration history | Pass / confirms pending | Production migration list does not include DEV-037 `20260706091804` or DEV-045 `20260706162052` |
| Supabase MCP deployed Edge source read | Pass / confirms pending | Deployed `calendar-feed` version 3 lacks v2 matcher and project-id scoped feed flow |
| Supabase MCP subscription aggregate | Pass / read-only | total 2 / active 2 / v2 0, no row contents read |
| Supabase branch discovery | Blocked | `list_branches` returned project reference validation error；new branch creation would require cost confirmation and was not executed |
| Supabase branch cost confirmation | Pass / partial | Branch cost `0.01344 / hourly` confirmed through MCP；currency not provided by tool |
| Supabase branch creation | Blocked | `_create_branch` for `dev-045-calendar-subscription-v2-staging` failed with `You do not have permission to perform this action`; no branch created |
| DEV-045 release-gate preflight rerun | Pass / blocked before remote changes | Static/source gates、DEV-037/039 regression、local DB smoke rollback、TypeScript、settings gate、Edge bundle、production build 與 production artifact smoke passed；no remote apply/deploy |
| Supabase security advisors | Warn / existing unrelated | Existing SECURITY DEFINER warnings unrelated to DEV-045 migration；no DEV-045 DDL applied |
| `npm.cmd run verify:dev-039-task-filter-core` | Pass | 61 pass / 0 fail |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript noEmit passed |
| `npm.cmd run verify:settings-project-context` | Pass | 6 checks passed |
| `npx --yes esbuild supabase/functions/calendar-feed/index.ts --bundle --platform=neutral --format=esm --external:https://esm.sh/*` | Pass | Edge Function source bundled to temp output |
| `npm.cmd run build` | Pass | Vite production build passed |
| `npx --yes supabase db lint --local --fail-on error` | Not executed | Local Postgres connection failed |

## 殘留風險

- Phase 2 目前是 local source slice；產生 `.ics` 連結需套用 Supabase migration 與部署 Edge Function 後，才能宣告 production preview/feed 一致。
- Phase 3 目前是 authorized but still gated；local DB smoke 已通過，release-gate preflight 也已通過，branch cost confirmation 已完成，但 branch creation 因 Supabase 權限不足 blocked。缺 Level 3 staging/branch 或使用者明確 risk acceptance、remote Edge deploy、live `.ics` preview-feed parity 與 rollback evidence 時，不得宣告 remote DB / Edge / production release safe。
- Production currently remains on the old calendar subscription feed contract；remote apply/deploy is not a no-op and must keep rollback evidence for `calendar-feed` version 3 and DB validation function state.
- Edge Function 尚未做 Deno type check；進入 Supabase/Edge deploy gate 前需補 Deno 或 Supabase functions verification。
- Browser QC 已補 desktop / mobile / empty preview / override / exclude；尚未覆蓋 Supabase live partial/error state，需 remote/staging 或 mocked board-load failure fixture。
- 既有工作樹中存在 `.firebase/hosting.ZGlzdA.cache` 與 `.codex-remote-attachments/`，未納入本 QC 範圍。

## 下一步

- DEV-045 Phase 3：local DB smoke 與 release-gate preflight 已補；branch cost confirmation 已完成，但 branch creation 因 Supabase 權限不足 blocked。下一步需使用具 branch create 權限的 Supabase 帳號/OAuth，或由具權限者建立 branch 並提供 branch project ref；之後才能執行 branch migration apply、`calendar-feed` Edge deploy、live `.ics` preview/feed identity smoke 與 rollback evidence。
- DEV-045 live browser verifier：在 remote/staging path 可用後補 Supabase live preview/feed identity 與 partial/error state。
