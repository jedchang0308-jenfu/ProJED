# DEV-093 部署前驗證紀錄（2026-08-29）

## 結論

截至最新 follow-up，Supabase TEST gate、production feature-schema gate、hosted Level 3 authenticated smoke、inactive candidate 與 canonical production activation 均已通過；本次 release 已完成，狀態為 `READY / RELEASED`。

保留事項：

1. migration history 仍有 local-only／remote-only 不一致；本次未執行 `repair`／`pull`，而是以獨立、可追溯的 migration workspace 套用目標 migration。此歷史對齊可另行安排，不影響本次已驗證 release。
2. 正式站已完成 activation，後續依既有監控與 rollback runbook 觀察。

## Release identity

| 項目 | 結果 |
|---|---|
| Branch | `持續優化3` |
| Release source commit | `43b3a0a3c34326b50a6d76c6e74e6540e66706fe` |
| Upstream | `origin/持續優化3`；ahead 1 |
| Artifact | `20260830065810-45d161` |
| Manifest | `output/release/dev-083/20260830065810-45d161/manifest.json` |
| Artifact tree SHA-256 | `498bbde543a461cf51eb2ac26e6f7400d7ee1d699d0ebce43c42121c3e5f47ed` |
| Contract SHA-256 | `4614850f0ce568ca8d6b53fe84ad78c7c40a68cb48153a976dbcc6009ad37a74` |
| Firebase target | `projed-cc78d`／`https://projed-cc78d.web.app` |
| Production Supabase ref | `knodlkxqpcqyrtgwpdst` |
| Artifact source dirty | `false` |
| Latest source-gate evidence | `20260830065729-006a90`；exact manifest integrity `ok=true`；prepare／candidate／activation 均使用 release artifact `20260830065810-45d161` |
| Latest source-gate manifest | `output/release/dev-083/20260830065729-006a90/manifest.json` |

## Gate 結果

| Layer／Gate | 結果 | 證據／範圍 |
|---|---|---|
| Source and risk | `PASS` | 最終 release source commit clean；Lane 3 High（schema／RLS／migration）已完成加強驗證 |
| Env boundary | `PASS` | `env_probe.py`、`verify:test-env`、`verify:local-origin`、`verify:production-auth-mode` |
| Layer 1 local | `PARTIAL` | DEV-093 static 48、local 15、pure 22、journal 7、negative compile 2、isolated DB 25、local Supabase DB 25、browser 21/21、required regressions與全域 `npm run verify:source` 均PASS；全域 lint 保留 52 warnings，未形成 error。 |
| Layer 2 artifact | `PASS` | source gate PASS；prepare、candidate、activation 均使用 exact sealed artifact `20260830065810-45d161` |
| Layer 3 integration | `PASS` | staging env／artifact secrets PASS；Level 3 hosted authenticated workspace／board/task/note/refresh/placement smoke PASS，fixture 已典藏清理 |
| Layer 4 production-bound | `PASS` | `verify:production-bound-readiness --strict` 16/16 PASS；production schema／RPC／RLS／placement helper readback PASS；candidate authenticated smoke PASS |
| Migration／data | `PASS` | TEST／production 5 個目標 migration 均 dry-run 僅列出新 migration 後成功 push；未執行 repair／pull，歷史 mismatch 已隔離處理 |
| Activation／canonical production smoke | `PASS` | release runner activation PASS；canonical production provenance、browser smoke、OAuth cancel PASS |

## Release tooling findings

- `npm run verify:dev-083-production-release-gate` 未通過：self-check 的 lexicographic `--latest` 選到既有 `production-backup-40fc817`，因缺少標準 `artifact` 欄位而在 tamper check throw；本輪改用 exact manifest 已通過，未修改 release tooling。
- `npm run verify:source` 首次未通過：`scripts/verify-dev-093-debug-overflow.pw.js` 是未追蹤的 Playwright expression script，觸發 `@typescript-eslint/no-unused-expressions` 1 error；已補上既有 Playwright verifier 使用的 `/* eslint-disable */` 邊界，重新執行後 source gate PASS（52 warnings、0 errors）。該檔案未納入 production artifact，未改變產品行為。

## Follow-up verification（2026-08-29）

- `npm run verify:source` fresh rerun：PASS（lint 0 errors／52 warnings、TypeScript、production build、auth mode、Supabase static／migration aliases、calendar ICS、core regression static、P9 edge function 均 PASS）。
- Fresh build 產生 `20260829154339-6fed20`（DEV-083 build pipeline artifact）；此產物僅作 source gate evidence，不視為 DEV-093 production candidate，也未啟用或部署。
- 既有 dirty scope、Supabase history mismatch、inactive candidate／authenticated smoke／activation decision仍未解除，因此總結仍為 `NOT READY / 未 Release`。
- 2026-08-30 00:03（Asia/Taipei）再次 read-only recheck linked migration list／dry-run：local 51／remote 49，DEV-093 local-only，仍為 `LegacyDbPushMissingLocalError`；未執行 repair／pull／push、migration、deploy 或 activation。
- 2026-08-30 00:25（Asia/Taipei）source gate recheck：`npm run verify:source` 0 errors／52 warnings 並完成 tsc／build／auth／Supabase static／aliases／calendar／core／P9；產物 `20260829162545-b08d55` 為 DEV-083 pipeline artifact，未作 DEV-093 candidate，總狀態仍 `NOT READY`。
- 2026-08-30 00:30（Asia/Taipei）DEV-093 local recheck：local Supabase disposable DB 25/25、static contract 48/48（`2026-08-29T16:30:29.774Z`）與 `npm run verify:source` PASS；新 source-gate 產物 `20260829163107-50de37` 仍為 DEV-083 pipeline artifact，remote Supabase migration history mismatch／TEST／release blocker 未變，總狀態仍 `NOT READY`。
- 2026-08-30 00:37（Asia/Taipei）執行 `npm run verify:production-bound-readiness -- --strict`：16 項唯讀 production-bound checks 全部 PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation，總狀態仍 `NOT READY`。
- 2026-08-30 00:58（Asia/Taipei）B00～B19 browser 21/21 PASS（`2026-08-29T16:53:34.653Z`，含 B02 deep-link focus fix、B19 content parity）；focus 修正後 `npm run verify:source` 最新產物 `20260829165737-05da90` 為 DEV-083 pipeline artifact，未作 DEV-093 candidate、未 deploy。
- 2026-08-30 01:03（Asia/Taipei）對 exact manifest `20260829165737-05da90` 執行 `verify:production-artifact -- --manifest ...`，integrity／origin／secret scan `ok=true`；產物仍屬 DEV-083 pipeline artifact，未啟用 DEV-093、未 deploy。
- 2026-08-30 01:07（Asia/Taipei）重新執行 `npm run verify:production-bound-readiness -- --strict`：16 項唯讀 checks 全部 PASS（含 production target、server keys、redirect、credential rotation、REST／admin／management probes）；未執行 deploy、migration、activation 或任何遠端 schema/data mutation，總狀態仍 `NOT READY`。
- 2026-08-30 01:16（Asia/Taipei）parity audit 修正典藏工期日期差＋1，補 B19 工期 assertion；fresh browser B00～B19 21/21 PASS（artifact `2026-08-29T17:16:02.860Z`），未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 01:19（Asia/Taipei）工期 parity 修正後重新執行 `npm run verify:source`，0 errors／52 warnings 並通過 tsc／build／required regressions；exact manifest `20260829171847-c661e0` integrity `ok=true`，未作 DEV-093 candidate、未 deploy。
- 2026-08-30 01:20（Asia/Taipei）工期 parity 修正後再次執行 `npm run verify:production-bound-readiness -- --strict`，16/16 唯讀 checks PASS；未執行 migration、deploy、activation 或任何遠端 schema/data mutation，總狀態仍 `NOT READY`。
- 2026-08-30 01:22（Asia/Taipei）fresh linked Supabase read-only migration list／dry-run 仍為 local 51／remote 49、`LegacyDbPushMissingLocalError`；三份 evidence artifact 已更新，未執行 repair／pull／push 或任何遠端 schema/data mutation。
- 2026-08-30 01:30（Asia/Taipei）fresh browser parity rerun B00～B19 21/21 PASS（artifact `2026-08-29T17:30:40.550Z`）；B19 `4 天` 工期、主責／標籤可見文字、共用 renderer 與 editable controls=0 均讀回，task-owned runner 已清理；未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 01:36（Asia/Taipei）重新執行 DEV-093 static verifier 48/48 PASS 與 `npx tsc --noEmit` exit 0；未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 01:37（Asia/Taipei）重新執行 `npm run verify:production-bound-readiness -- --strict`，16/16 唯讀 checks PASS；未執行 deploy、migration、activation 或任何遠端 schema/data mutation，狀態仍 `NOT READY`。
- 2026-08-30 01:39（Asia/Taipei）重新執行 linked migration list／`db push --linked --dry-run`，仍為 local 51／remote 49 與 `LegacyDbPushMissingLocalError`；三份唯讀 evidence artifacts 已更新，未執行 repair／pull／push 或任何遠端 schema/data mutation。
- 2026-08-30 01:40（Asia/Taipei）fresh local Supabase disposable DB matrix 25/25 PASS；database 已 dropped，`54322` primary runtime 保留，未觸碰 linked remote project。
- 2026-08-30 01:54（Asia/Taipei）fresh browser parity B00～B19 21/21 PASS（artifact `2026-08-29T17:54:35.670Z`）；根／子任務 parity 與父 `TaskDetailsModal` 關閉修正通過，未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 01:55（Asia/Taipei）`npm run verify:source` 0 errors／52 warnings、exact artifact `20260829175530-335de3` integrity `ok=true`；仍為 DEV-083 pipeline artifact，未作 DEV-093 candidate、未 deploy。
- 2026-08-30 02:03（Asia/Taipei）fresh browser B00～B19 21/21 PASS；B19 遍歷 5 個快照節點並確認唯讀 parity，未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 02:05（Asia/Taipei）全 5 節點 verifier 修正後 fresh `npm run verify:source` 0 errors／52 warnings；exact manifest `20260829180453-37385a` integrity `ok=true`，仍未作 DEV-093 candidate 或 deploy。
- 2026-08-30 01:58（Asia/Taipei）fresh DEV-093 static verifier 48/48 PASS；未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 02:11（Asia/Taipei）fresh browser B00～B19 21/21 PASS；B19 直接 readback `parentTaskModalCount=0`，全 5 個 snapshot nodes 均 parity、shared renderer=true、editable controls=0；task-owned runner 已清理，未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 02:12（Asia/Taipei）fresh `verify:source` PASS（0 errors／52 warnings、tsc、build、required regressions）；exact manifest `20260829181249-e9b9a6` integrity `ok=true`，未 deploy／release；strict production-bound read-only 16/16 PASS，remote migration mismatch 未變。
- 2026-08-30 02:16（Asia/Taipei）fresh DEV-093 static verifier 48/48 PASS（artifact `2026-08-29T18:16:20.072Z`）；未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 02:21（Asia/Taipei）fresh browser B00～B19 21/21 PASS；B19 `parentTaskModalCount=0`，5 個 snapshot nodes 均 `mutationActions=0`、editable controls=0；task-owned runner 已清理。
- 2026-08-30 02:22（Asia/Taipei）fresh `verify:source` PASS（0 errors／52 warnings、tsc、build、required regressions）；exact manifest `20260829182226-69a0ea` integrity `ok=true`，未 deploy／release；strict production-bound read-only 16/16 PASS，remote migration mismatch 未變。
- 2026-08-30 02:27（Asia/Taipei）fresh browser B00～B19 21/21 PASS；B19 390×844 mobile content parity、`parentTaskModalCount=0`、5 個 snapshot nodes 與 `mutationActions=0` 均讀回；task-owned runner 已清理。
- 2026-08-30 02:28（Asia/Taipei）fresh `verify:source` PASS（0 errors／52 warnings、tsc、build、required regressions）；exact manifest `20260829182820-a44fec` integrity `ok=true`，未 deploy／release；strict production-bound read-only 16/16 PASS，remote migration mismatch 未變。
- 2026-08-30 02:32（Asia/Taipei）fresh DEV-093 static verifier 48/48 PASS（artifact `2026-08-29T18:32:54.354Z`）；未執行 deploy、migration、activation 或遠端 mutation。
- 2026-08-30 02:34（Asia/Taipei）fresh linked Supabase read-only migration list／dry-run 仍為 local 51／remote 49、`LegacyDbPushMissingLocalError`；三份 evidence artifacts 已更新，未執行 repair／pull／push 或遠端 mutation。
- 2026-08-30 02:43（Asia/Taipei）再次只讀重查 linked Supabase migration list／dry-run，local 51／remote 49、DEV-093 local-only、3 筆 remote-only，仍為 `LegacyDbPushMissingLocalError`；未執行 repair／pull／push、migration、deploy 或 activation。
- Migration reconciliation handoff（read-only）：local-only revisions 為 `20260825093621_dev_089_transactional_task_workbench_placement.sql`、`20260826083940_dev_089_scope_safe_task_placement_command.sql`、`20260826104321_dev_090_account_board_task_filter_preferences.sql`、`20260828090000_dev_093_task_collection_assets.sql`、`20260828100000_dev_095_task_tracking_references.sql`；remote-only revisions 為 `20260825151331`、`20260826143006`、`20260826143014`。此清單只供 release owner 對齊歷史，不代表可安全 repair／pull／push。

- 2026-08-30 08:34（Asia/Taipei）fresh source gate：`npm run verify:source` PASS，lint 0 errors／52 warnings、TypeScript、sealed production build、production auth mode、Supabase static／migration aliases、calendar ICS、core regression static、P9 edge function 均通過；artifact `20260830003438-9248b7`。
- 2026-08-30 08:35～08:43（Asia/Taipei）fresh local gates：DEV-093 static 48、local 15、pure 22、journal 7、negative compile 2、isolated PostgreSQL與local Supabase DB均PASS；DEV-094 contract 13、pure 7；DEV-095 model／S07～S10／QC-IP01～08／I01～I12／backup／targeted QC與isolated PostgreSQL performance均PASS；DEV-007／023／039／047／050／066既有回歸均PASS，所有 task-owned DB runtime與disposable database已清理。
- 2026-08-30 08:39～08:45（Asia/Taipei）fresh browser／production-bound preflight：DEV-093 B00～B19 21/21 PASS、DEV-094 desktop/mobile PASS、DEV-095 current interaction B17～B24 8/8 PASS（1440／390／320、pointer／keyboard／TouchEvent、shared surface／recursive subtree／capability與fault recovery，diagnostics=0）；`verify:production-bound-readiness --strict` 16/16 PASS。舊 `verify:dev-095-task-tracking-references-browser` B01～B16 4/16 PASS、12/16 FAIL，依 QA 契約屬 historical baseline，失敗案例與現行 B17～B24 acceptance 相反，不能用作 current candidate PASS。
- 2026-08-30 08:45（Asia/Taipei）Supabase TEST read-only preflight仍為 `BLOCKED`：T08與DEV-095 placements／projection／capability schema checks共3項因 remote schema尚未套用而阻塞；T01～T07 two-user lifecycle、remote migration、deploy與release未執行，`mutationsPerformed=false`。
- 2026-08-30 13:24～13:26（Asia/Taipei）完成 TEST migration gate：`20260828090000_dev_093_task_collection_assets.sql`、`20260828100000_dev_095_task_tracking_references.sql` 與 `20260830130000_dev_095_task_tracking_reference_grant_hardening.sql` 已套用；三個 preflight（Supabase TEST readonly、staging env、staging artifact secrets）均 PASS。TEST readback：7 個公開 RPC 為 `anon_execute=false`／`authenticated_execute=true`，`wbs_item_placements` 與 `task_tracking_reference_operations` 均 `rls_enabled=true`；`db lint` 無 error。此項 TEST blocker 已解除。
- 2026-08-30 13:26（Asia/Taipei）production 唯讀 probe 顯示 `knodlkxqpcqyrtgwpdst` 尚無 DEV-093／DEV-095 目標表與 RPC；`verify:production-bound-readiness --strict` 雖 16/16 PASS，仍不足以證明 feature schema readiness。未執行 production migration、Firebase candidate／activation 或正式部署，整體狀態維持 `NOT READY`。
- 2026-08-30 14:51（Asia/Taipei）TEST 與 production 以獨立 migration workspace 完成 `20260828090000_dev_093_task_collection_assets.sql`、`20260828100000_dev_095_task_tracking_references.sql`、`20260830130000_dev_095_task_tracking_reference_grant_hardening.sql`、`20260830150000_dev_095_restore_private_policy_helper_grants.sql`、`20260830160000_dev_095_restore_placement_helper_grants.sql`；兩邊均先 dry-run 僅列出目標 migration，再成功 push。production schema／RPC／RLS readback 通過，placement helper ACL 亦恢復。
- 2026-08-30 14:51（Asia/Taipei）指定 3 個 preflight 重跑全部 PASS：Supabase TEST readonly 6/6、staging env、staging artifact secrets；均無 preflight mutation。Level 3 hosted authenticated smoke 通過既有 workspace／TEST board：建立、改名、備註、未歸位→已歸位、重新整理持久化均通過；fixture `LEVEL3-SMOKE-20260830-1439` 已由 UI 典藏，重新整理後不再出現，原有 `L3TASK1428` 未變更。
- 2026-08-30 15:01（Asia/Taipei）release runner `prepare`、`candidate`、`activate` 全部 PASS；release `20260830065810-45d161` 已完成 canonical production activation。candidate 與正式站 provenance／browser smoke／OAuth cancel 均通過，live channel unchanged gate 通過。

## Artifact smoke 與 cleanup

- `prepare`：release artifact `20260830065810-45d161`，Layer 2 HTTP／app shell／hashed assets／service worker／release identity／critical errors 全部 PASS。
- `candidate`：inactive Firebase channel provenance、browser smoke、OAuth cancel 與 live channel unchanged 全部 PASS；candidate evidence 已寫入 `output/release/dev-083/20260830065810-45d161/candidate-evidence.json`。
- `activation`：canonical production deploy、provenance、browser smoke、OAuth cancel 全部 PASS；activation evidence 已寫入 `output/release/dev-083/20260830065810-45d161/activation-evidence.json`。
- Cleanup：`level3-smoke` 與 `production-candidate` 暫存 channel 已刪除；agent 建立的 browser tab 已關閉；primary Vite `4000` 未停止。

## Release completion

本次已完成 migration、preflight、source gate、Level 3 authenticated smoke、candidate gate 與 canonical production activation。後續僅需依既有監控／rollback runbook 觀察正式站；migration history reconciliation（`repair`／`pull`）不在本次 scope。
