# QC-DEV-106：會議安全草稿生命週期（Phase 0 Local Safety Slice）

- QC 狀態：`Phase 0 QC PASS / Phase 1 Readiness Pending / NOT RELEASED`
- 驗證日期：2026-09-04
- Candidate：working tree（未建立 commit）
- 範圍：只驗證 Phase 0 local safety slice；Phase 1 結束會議／待整理與 Phase 2 雲端 recovery 不在本次交付。

## 結論

本候選已證明主要資料流失因果鏈的本機修正可運作：transaction `oncomplete` 才算提交、同 scope 僅保留最新寫入、app 內快速關閉先 force-flush、一般離開不清 recovery、明確捨棄才以 terminal barrier 清除，且 meeting cloud checkpoint 已停用。

瀏覽器候選目前 14/14 cases PASS；包含 IDB open failure 的恢復型 dialog、save/delete abort、2,000ms force-flush timeout、1024px 紀錄庫／設定／系統頁返回守門、紀錄庫開舊／正常入口開新、canonical cleanup、canonical cleanup abort／retry readback、四個 provider adapter checkpoint spy、provider／正式紀錄／event／record store action／Undo push failure injection isolation、explicit discard 取消／abort 後焦點復原、390px negative，以及 remote recovery request=0／visible error=0／side-effect storage delta=0。

本次已完成 Phase 0 QA/QC PASS。ROT-106-010 已補足 discard failure 的 focus／keyboard、ROT-106-011 已補足開舊／開新入口、ROT-106-008 已補足 cleanup retry readback、ROT-106-012 已補足 provider／正式紀錄／event／record store action／Undo push failure isolation；Phase 1 readiness與正式 release 仍是獨立 gate。

## 實際證據

| Evidence | 結果 |
|---|---|
| `npm run verify:dev-106-meeting-local-safety` | PASS：34/34 assertions；v1/v2 normalize、transaction truth、latest queue、clear barrier、0 cloud checkpoint wiring、recovery hook side-effect import boundary；`output/qa/dev-106-meeting-local-safety/result.json` |
| `npm run verify:dev-106-meeting-local-safety-browser` | PASS：14/14；runtime harness、快速關閉、F5 復原、failure dialog、2,000ms timeout、1024px 多 view transition、開舊／開新入口、canonical cleanup／cleanup abort／retry readback、四個 provider adapter checkpoint spy、provider／正式紀錄／event／record store action／Undo push failure isolation、discard 取消／abort focus、明確捨棄清除 IndexedDB/sessionStorage、390px negative；remote recovery request=0；`output/playwright/dev-106-meeting-local-safety/result.json` |
| `npm run verify:dev-069-meeting-draft-recovery`／browser | PASS：既有本機復原與桌機／手機邊界 |
| `npm run verify:dev-010-action-feedback` | PASS：更新後的 recovery failure dialog 契約 |
| `npm run verify:dev-020-record-workflow-redesign` | PASS：既有紀錄庫與 guarded open flow |
| `npm run verify:dev-020-project-change-import-browser` | PASS：個人紀錄 unavailable contract、meeting workflow／exit 與 1440／1024 rendered boundary |
| `npm run verify:dev-094-meeting-direct-note`／pure／browser | PASS |
| `npm run verify:dev-105-meeting-task-reservation-number`／browser | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS，0 errors；保留既有 warnings |
| `npm run build:test` | PASS |
| `git diff --check` | PASS（僅 CRLF warning） |
| 2026-09-08 UI addendum | PASS：live meeting 的 `會議操作` 依序為 `儲存草稿`／`儲存並離開`／`刪除並離開`，標題列無 X；1440×900 browser 證明 menu 不改 composer geometry、canonical save 成功後才 close、已發布紀錄可離開且維持 `published`；1536×639 目前本機頁面證明 sidebar 開關前後皆為 440×599.2、無水平溢出與 visible alert。artifact：`output/playwright/dev-094/result.json`、`output/playwright/dev-094/meeting-actions-1440x900.png` |

## Gate disposition

- TC-106-003～008 已由 runtime harness 涵蓋主要 failure／abort／queue／clear 路徑，並由 ROT-106-006 證明 2 秒 timeout、ROT-106-008 證明 canonical cleanup abort／retry 後的 UI/readback 保留、ROT-106-009 證明四個 provider adapter checkpoint 均為 0、ROT-106-010 證明 discard 取消／abort 後內容與焦點均保留、ROT-106-012 證明 provider／正式紀錄／event／record store action／Undo push failure injection 不影響本機 recovery；Phase 0 side-effect provenance 與 case-to-case evidence 已封關。
- ROT-106-002～004 已有 1024px records／settings／system-return、failure dialog、discard、390px negative evidence；ROT-106-010 已補足 failure dialog 的鍵盤／focus，ROT-106-011 補足開舊／開新 rendered entry。
- 全 provider 已由 static kill switch、四個 adapter-level spy、failure injection與瀏覽器 remote recovery request=0 證明 recovery 不呼叫 cloud checkpoint；Phase 0不宣稱已具備雲端 cleanup，雲端能力維持 future capsule。
- Phase 1 readiness gaps（canonical atomicity／compensation、same-ID idempotency、legacy mapping、projection race）仍存在。
- 2026-09-08 UI addendum 通過 targeted static、browser、TypeScript、lint 與完整 `verify:source`；屬入口與文案的意圖性替換，不改 local discard、canonical baseline、provider 或發布語意。

## 風險與 release boundary

- 不修改 remote schema、RLS、Firestore rules、migration、正式資料或部署。
- 現有測試伺服器為他工作階段持有的 `127.0.0.1:4000` runtime，本次僅重用，未停止或改動其 process tree。
- 進入正式 release 前，仍須另走 release gate（含 candidate provenance、部署環境、production smoke 與 rollback readiness）；本報告只提供 Phase 0 local safety QC sign-off，不取代 release gate。
