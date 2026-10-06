# QC-DEV-110 未歸位任務會議紀錄邊界

- 判定：`QC PASS with evidence boundary / L3 pending / NOT RELEASED`
- 日期：2026-09-08
- 分支：`持續優化3`
- CAPA：`CAPA-DRAFT-20260908-unplaced-task-meeting-record-boundary`
- 原始缺陷：account-unplaced task detail 觸發 Supabase `wbs_items` not-found，並存在 unresolved task-link silent skip 風險。

## 1. 判定摘要

DEV-110 的 corrective implementation、local QA、Supabase TEST integration 與相鄰回歸已完成；正式流量仍未啟用。
DEV-095 的 source verifier 基線缺口已修正：Board host adapter 現在由 shared `TaskChecklistTree` 負責 controller/tree
契約驗證，不再要求 `KanbanChecklist.tsx` 重複持有 controller。

本 QC 不把未執行的 production mutation、正式 migration 或 activation 寫成 PASS。L3 preview 與
production-bound candidate 必須在本文件所述 source commit 凍結後另行產生同版 evidence。

## 2. Evidence matrix

| Gate | Result | Evidence / scope |
|---|---:|---|
| DEV-110 static | PASS 19/19 | `output/qa/dev-110/static-result.json`；含 capability、source scope、generation、typed error、preflight、exact-set、archived readback migration contract。 |
| DEV-110 browser | PASS B01～B04 4/4 | `output/playwright/dev-110-unplaced-task-meeting-record-boundary/result.json`；1440×900、390×844、network/console/page error sweep=0。 |
| DEV-110 stale/transient | PASS at deterministic/TEST layer | static generation/error assertions；Supabase TEST post-preflight fault returns error and no link partial state。獨立 B05/B06 browser seam未宣稱為browser PASS。 |
| Supabase TEST | PASS T00～T07 10/10 | `output/qa/dev-110/supabase-test-result.json`；authenticated TEST user、isolated tenant、official placement RPC、source-board history、T04/T05 zero mutation、T06 lifecycle/fault、cleanup residual=0。 |
| DEV-108 static | PASS 14/14 | `output/playwright/dev-108-task-meeting-note-persistent-list/static-result.json`。 |
| DEV-108 browser | PASS B01～B09 9/9 | `output/playwright/dev-108-task-meeting-note/result.json`；desktop/mobile、archive、expand、append、overflow、visible error。 |
| DEV-095 source | PASS | `npm run verify:dev-095-task-tracking-references`；model/migration/provider/UI boundary。 |
| DEV-095 cross-mode | PASS 12/12 | `npm run verify:dev-095-task-tracking-references-cross-mode`。 |
| DEV-095 browser | PASS 16/16 | fresh local-test artifact `output/playwright/dev-095/result.json`，涵蓋 reference identity、same/cross-board、keyboard/mobile、nested subtree、readonly details。 |
| Source gate | PASS | `npm run verify:source`；lint 0 errors／70 existing warnings、TypeScript、sealed build、auth/Supabase static、migration aliases、ICS、core regression、P9 edge function。 |

## 3. Supabase TEST corrective finding

第一輪 T06 發現既有 TEST RLS 缺口：`knowledge_records` 的 authorized SELECT policy 以
`status <> 'archived'` 排除封存列，導致 authorized owner/reader 無法讀取歷史，也使 UPDATE 的 PostgreSQL
row visibility 不成立。DEV-110 migration 已將 record 與 record-task-link history readback 政策對齊：
一般清單仍可由 service filter 隱藏 archived，但 authorized history read 與 link exact-set readback 不再被政策擋住。

已套用（僅 TEST project ref `fhisnnufoeulxqrchldf`）：

- `supabase/migrations/20260908050000_dev_110_record_archive_readback.sql`
- `supabase/migrations/20260908052000_dev_110_archived_link_readback.sql`

Production project ref `knodlkxqpcqyrtgwpdst` 未執行上述 migration，亦未寫入 production data。
TEST migration 後 advisors 的既有告警仍包含未加政策 table、security-definer execute、mutable search path、
auth leaked-password protection、未索引 FK／RLS initplan／multiple permissive policies；本次未把這些全域既有項目
擴張為 DEV-110 blocker。

## 4. CAPA disposition

- 矯正措施：unplaced capability gate、canonical source-board scope、generation guard、cross-board append defense、
  resolve-all task-link preflight、exact-set readback、generic UI error mapping。
- 預防措施：DEV-110 static/browser/Supabase TEST gates、same-commit release evidence、TEST-only RLS regression、
  production-bound candidate 只允許 smoke/readiness，不允許在 candidate 階段啟用正式流量。
- 有效性驗證：T01～T06 全 PASS，fixture cleanup residual=0；DEV-108、DEV-095 相鄰 regression 已重跑。
- 未結案條件：L3 preview 同版 smoke、production-bound candidate、以及 activation 後的 production verification 尚未完成；
  因此本 QC 不等同於 production release。

## 5. Reproducible commands

```text
npm run verify:dev-095-task-tracking-references
npm run verify:dev-095-task-tracking-references-cross-mode
npm run verify:dev-110-unplaced-task-meeting-record-boundary
npm run verify:dev-110-unplaced-task-meeting-record-boundary-browser
npm run verify:dev-110-unplaced-task-meeting-record-boundary-supabase-test
npm run verify:dev-108-task-meeting-note-persistent-list
npm run verify:dev-108-task-meeting-note-persistent-list-browser
npm run verify:source
git diff --check
```

使用思考習慣：#第一性原理、#可驗證性、#多層次分析、#失效模式與效應分析
