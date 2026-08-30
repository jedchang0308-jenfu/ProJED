# DEV-093 部署前驗證紀錄（2026-08-29）

## 結論

`NOT READY / Lane 3 High / 不得啟用`。本次只完成部署前驗證，未執行 Firebase deploy、Supabase migration、repair、pull、push、正式資料變更或 activation。

主要阻塞為：

1. release source 為 dirty working tree，包含 DEV-093／DEV-094／DEV-095 與其他既有變更，尚未完成 production release scope 分類與確認。
2. linked Supabase migration history 不一致：local 51／remote 49；DEV-093 `20260828090000` 尚未套用，另有 3 筆 remote-only revision。`db push --linked --dry-run` 以 `LegacyDbPushMissingLocalError` exit 1 結束。
3. 尚未建立 inactive production candidate、執行 candidate authenticated smoke 或取得 activation decision；因此不能以本地／staging 證據代替 Layer 4。

## Release identity

| 項目 | 結果 |
|---|---|
| Branch | `持續優化3` |
| HEAD | `dd3245c3fb2625aa0ce8e7cb8273fe2f06e79ee4` |
| Upstream | `origin/持續優化3`；ahead 1 |
| Artifact | `20260829182820-a44fec` |
| Manifest | `output/release/dev-083/20260829182820-a44fec/manifest.json` |
| Artifact tree SHA-256 | `ba02e458bccedf3714e5bf67ebc8027110825f632609adce89507fc32ad512b8` |
| Contract SHA-256 | `4614850f0ce568ca8d6b53fe84ad78c7c40a68cb48153a976dbcc6009ad37a74` |
| Firebase target | `projed-cc78d`／`https://projed-cc78d.web.app` |
| Production Supabase ref | `knodlkxqpcqyrtgwpdst` |
| Artifact source dirty | `true`；不得直接 deploy |
| Latest source-gate evidence | `20260829182820-a44fec`；exact manifest integrity `ok=true`，仍為 DEV-083 pipeline artifact，不是 DEV-093 candidate |
| Latest source-gate manifest | `output/release/dev-083/20260829182820-a44fec/manifest.json` |

## Gate 結果

| Layer／Gate | 結果 | 證據／範圍 |
|---|---|---|
| Source and risk | `BLOCKED` | dirty worktree；Lane 3 High（schema／RLS／migration） |
| Env boundary | `PASS` | `env_probe.py`、`verify:test-env`、`verify:local-origin`、`verify:production-auth-mode` |
| Layer 1 local | `PARTIAL` | DEV-093 static 48、local 15、pure 22、journal 7、negative compile 2、isolated DB 25、local Supabase DB 25、browser 21/21、required regressions與全域 `npm run verify:source` 均PASS；全域 lint 保留 52 warnings，未形成 error。 |
| Layer 2 artifact | `PASS` | `npm run build`；exact manifest `verify:production-artifact`；release browser smoke：HTTP／app shell／hashed JS+CSS／service worker／release identity／pageerror／failed request均通過 |
| Layer 3 integration | `PARTIAL` | `verify:staging-env`與`verify:staging-artifact-secrets` PASS；尚未部署或驗證 staging candidate |
| Layer 4 production-bound | `PARTIAL` | `verify:production-bound-readiness --strict` 16 checks PASS（最新 2026-08-30T02:33:00+08:00、read-only）；inactive candidate、authenticated acceptance與migration readback未完成 |
| Migration／data | `BLOCKED` | read-only linked list 最新 2026-08-30T02:34:20+08:00；dry-run exit 1；未執行 repair／pull／push |
| Activation／canonical production smoke | `NOT RUN` | 未取得 activation decision，正式站未以本 artifact 驗證 |

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

## Artifact smoke 與 cleanup

- 暫時 runtime：exact artifact preview，`127.0.0.1:49795`，task-owned `node.exe`；browser smoke 使用 `dev083-artifact-preview`。
- 結果：HTTP 200、app root 非空、主 JS/CSS hash asset 可載入、release identity match、service worker ready／controller、critical console/pageerror/request failure 均為 0。
- Cleanup：preview process 已終止，`49795` listener 已釋放；既有 primary Vite `4000` 未停止。

## 下一步

先由 release owner 明確確認 production release scope（需將哪些 dirty changes 納入），再依 deployment/release gate 完成 migration history reconciliation、backup/readback、Supabase TEST／authenticated smoke、inactive candidate與獨立 activation decision。未完成前維持 `NOT READY / 未 Release`。
