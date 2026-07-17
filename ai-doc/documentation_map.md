# ProJED Documentation Map

## Active Repository / Cold Start Rule

- Active repo 固定為 `C:\VIBE CODING\ProJED\ProJED`。
- 不要從 `C:\VIBE CODING\ProJED` 外層遞迴讀取 sibling clone，例如
  `ProJED-dev011012-hotfix`、`ProJED-main-ai-data-fix` 或備份資料夾。
- 冷啟動先讀 `ai-doc/dev_task.md` 的 `## 總任務清單` 與本檔最前方最新狀態；選定 DEV 後，只讀該 DEV 直接連結的 SPEC / QA / QC / release 文件。
- 歷史 PM Update 已歸檔至 `ai-doc/archived/dev_task_pm_updates_2026-07-15.md`；只有追查特定 DEV 歷史、release evidence 或 cross-task consistency 時才搜尋該檔。
- Spec Impact Preflight：修改產品程式前，若已知 DEV，先讀該 DEV 直接連結的 active SPEC / ADR / QA；若未知 DEV，先以功能名、component、route、API、table、status、permission 或錯誤訊息搜尋本檔與 `dev_task.md`，只讀命中項。結論需分類為 `No conflict`、`Compatible exception`、`Intentional replacement` 或 `Unresolved conflict`；`Unresolved conflict` 不得直接改碼。

## Documentation Map Update - 2026-07-17（手機新增 CTA 平移死角修正）

使用者回報手機模式按住「新增任務」時無法移動畫面，表示 pan-first 的可選擇窗口尚未涵蓋全任務畫面。盤點後判定 Spec Impact=`Compatible exception`：精準控制如 input、filter popover、modal、action rail 仍是 pure interactive control；但畫布上的大型新增 CTA 必須同時支援無位移 tap 與 short-pan pass-through。

### DEV-029：手機 Pan-First 觸控手勢仲裁（Canvas CTA Pass-Through Covered）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Phase 1 + Phase 1B Implemented / Canvas CTA Pass-Through Covered | DEV-029 / DEV-053 / DEV-054 / DEV-046 | 補明大型畫布 CTA 的雙重語意：欄位新增任務、看板尾端新增 CTA、TaskWorkbench 未歸位新增 CTA 可 tap，但 short pan 必須交給 mobile pan broker。 |
| `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QA Passed / B10-B12 Added | DEV-029 | 新增 B10-B12 驗證欄位新增任務水平/垂直短滑與看板尾端新增 CTA 短滑均可 pan，且不新增任務/欄位、不開 modal、不進 action rail。 |
| `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QC Passed / Canvas CTA Pass-Through Covered | DEV-029 | 記錄 root cause、RD 修正事實、DEV-029 static 38/38、browser B10-B12、DEV-054/053/046 回歸、TypeScript 與 build 證據。 |
| `ai-doc/dev_task.md` | DEV-029 Complete / Hotfix Evidence Updated | DEV-029 | DEV-029 完成狀態不變，摘要補入大型新增 CTA 平移死角修正；production 與真機 supplemental 仍未執行。 |

PM 治理註記：不得把所有 button 都改為 pan pass-through。只有大型畫布 CTA 可採 `data-mobile-pan-pass-through="true"`；表單、輸入框、select、filter、modal、TaskDetails controls、action rail 與日期/依賴/負責人控制仍維持精準互動優先。DEV-055 桌機驗收已於 2026-07-17 Rework 1 後通過；本手機 hotfix 不回寫或改寫桌機完成證據。

## Documentation Map Update - 2026-07-17（電腦版任務拖拉升級驗證）

使用者確認 DEV-054 Rework 4 成功，手機版跨階層移動的落點呈現甚至比電腦版更清楚。此成功經驗另立 DEV-055；不回開 DEV-054 scope，也不直接將 mobile touch stability 邏輯移植到桌機。

### DEV-055：電腦版任務拖拉落點清晰化與跨階層定位升級（Production Released / Level 4 Passed）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md` | Production Released / Automated QA-QC + User Desktop Acceptance + Level 4 Passed | DEV-055 / DEV-053 / DEV-054 / DEV-046 / DEV-051 | 使用者 T01-T08 Attempt 1 回報同格定位線漂移與 L3+ 被推開；Rework 1 改為 fixed overlay-only indicator、overlay append hit area、sortable displacement freeze 與 rect micro-retain；2026-07-17 使用者重驗通過並已發布 Firebase production。 |
| `ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md` | Executed / Automated + T01-T08 User Desktop Acceptance + Production Level 4 Passed | DEV-055 / DEV-053 / DEV-054 / DEV-046 | DEV-055 static 27/27、browser B01-B16 16/16、指定回歸、TypeScript 與 build 通過；T01-T08 共 38 次真實桌機重驗已由使用者回報通過；Firebase preview 與 production smoke 通過。 |
| `ai-doc/qc/QC-DEV-055-desktop-task-drag-target-clarity.md` | QC Passed / Production Released / Level 4 Passed | DEV-055 | 記錄使用者驗收失敗回送 RD、Rework 1 事實、browser/store 證據、representative screenshots、user acceptance pass、release branch `e07ba4b`、Level 3 preview 與 Level 4 production smoke。 |
| `ai-doc/dev_task.md` | DEV-055 Production Released / Level 4 Passed | DEV-055 / DEV-053 / DEV-054 | RD Rework 1、自動 QC、使用者 T01-T08 重驗、Firebase production deploy 與 Level 4 smoke 均通過。 |

PM 治理註記：DEV-055 為新交付點且計入完成率。第一次自動化 pass 不等於完成，因使用者 T01-T08 Attempt 1 已回報失敗；RD Rework 1 自動 QA/QC 通過後，2026-07-17 使用者回報 T01-T08 重驗通過，並明確要求部署正式環境。Release 走 clean worktree branch `codex/dev055-production-release-20260717-234436`，artifact commit `e07ba4b`，排除主工作樹中會議紀錄 / Supabase Edge 相關未確認變更；production live 於 2026-07-17 23:56:26 發布並通過 Level 4 unauthenticated app-shell smoke。Authenticated production drag smoke 未由 Codex 自動登入執行，需使用者登入正式站後補人工操作證據。不得將手機 retain/hysteresis、action rail 或 touch lifecycle 搬到桌機；不得改變已獲使用者核准的桌機 DragOverlay、起手門檻、click/right-click、commit/undo 契約。任一 displayed/committed mismatch、ancestor fallback、same-cell drift、L3+ push、placed row 可拖或桌機手感回歸皆為 stop condition。

## Documentation Map Update - 2026-07-17（手機任務拖拉定位精準度）

使用者操作回饋：DEV-054 第四次模擬手機證明 Rework 3 的 preview-to-indicator docking 讓拖曳物跳離手指，且 checklist source 在 innermost target 無效後會 fall through 到 expanded parent card。R10 已用 `636x764` 重現。RD rework 4 改為 preview 永遠跟 raw finger、exact innermost ownership、invalid ancestor blocking、bounded card primary rect，並移除 nearest-target 磁吸。使用者已於 2026-07-17 以原失敗路徑重驗通過；DEV-053 歷史完成證據與桌機 frozen baseline 維持，physical gate 仍不可省略。

### DEV-054：手機任務拖拉定位精準度優化（RD Rework 4 Implemented / Automated Browser + User Revalidation Passed / Physical Gate Pending）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-054-mobile-task-drag-precision.md` | RD Rework 4 Implemented / Automated Browser + User Revalidation Passed / Physical Gate Pending | DEV-054 / DEV-053 / DEV-029 / DEV-046 | 保留 desktop approved baseline；preview 永遠跟 raw finger；target 採 innermost exact hit、ancestor blocking、bounded card primary geometry；retain 外 direct handover；mobile source placeholder 不畫 marker；pan / edge-scroll 契約維持。 |
| `ai-doc/qa/QA-DEV-054-mobile-task-drag-precision.md` | RD Rework 4 Automated + User Revalidation Passed / Full Matrix + Physical Not Executed | DEV-054 | 四次使用者失敗與修正證據均保留；DEV-054 static 34/34、browser R01-R10，R06 驗證 bounded card primary，R10 驗證 `636x764` ancestor blocking、finger coupling、zero write。使用者原失敗路徑已重驗通過；B01-B12 與 iOS / Android 各 50 trials 仍為 required。 |
| `ai-doc/dev_task.md` | DEV-054 Verifying / P1 / Physical Gate Required | DEV-054 | RD rework、browser 與使用者原路徑重驗已通過；physical device gate 與 QC report 通過前不得標記完成。 |

PM 治理註記：Spec Impact=`Compatible exception`。DEV-054 不回寫 DEV-053 QC 歷史結果；使用者原失敗路徑已重驗通過，但 physical iOS / Android 任一未通過，仍不得宣稱手機定位精準度或完整肌肉記憶一致性已完成。Workbench placed row 仍不能拖；desktop drag UI 仍以使用者核准的 DragOverlay / threshold / click-right-click 為 baseline。DEV-055 Rework 1 後 user revalidation 已通過，桌機升級本機完成；仍未 production deploy。

## Documentation Map Update - 2026-07-17（任務拖拉肌肉記憶一致化）

使用者已確認 Workbench `placed row` 不能拖。這是目前權威產品決策，覆寫 DEV-039 舊版
Phase 1B / Phase 2A 中「已歸位 row 可雙向拖回未歸位」與「已歸位 row 也應共用 draggable
root」的描述。DEV-039 既有 QA/QC 中對應案例保留為歷史證據，不再作為目前產品契約。

### DEV-053：任務拖拉肌肉記憶一致化（Implemented / QA True Operation Gate Passed）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-053-task-drag-muscle-memory-consistency.md` | Implemented / Local Static + Browser + QA True Operation Passed / Production Not Deployed | DEV-053 / DEV-029 / DEV-039 / DEV-046 | HCS `1C 2A 3A` 的完整拖拉子系統重構已完成；Workbench placed row 不可拖且手機長按不進 action rail；Desktop Drag UI Freeze 保留使用者核准 baseline。後續真機定位精準度由 DEV-054 處理。 |
| `ai-doc/qa/QA-DEV-053-task-drag-muscle-memory-consistency.md` | Executed / T01-T14 Passed / Physical Phone Supplemental Not Executed | DEV-053 | static / browser / regression 與真實滑鼠、合成觸控、cancel lifecycle 操作均通過；T01-T14 為 DEV-053 歷史完成 gate，不代表 physical precision 已簽核。 |
| `ai-doc/qc/QC-DEV-053-task-drag-muscle-memory-consistency.md` | Local QA True Operation Gate Passed / Production Not Deployed | DEV-053 | 記錄 T01-T14 route、viewport、操作前後狀態、截圖、console/network sweep、required command 與 placed-row no-drag 證據。 |
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Superseded in placed-row drag scope | DEV-039 / DEV-053 | DEV-039 的 placed-row draggable parity / bidirectional drag 描述由 DEV-053 覆寫；placed row 目前應視為 read-only placement list entry。 |
| `ai-doc/specs/SPEC-046-universal-task-surface-drag.md` | Superseded in workbench placed-row drag scope | DEV-046 / DEV-053 | DEV-046 whole-surface drag 仍適用於看板、清單、checklist 與 workbench unplaced row；workbench placed row 依 DEV-053 不能拖。 |
| `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md` | QA cases amended / Regression Passed | DEV-046 / DEV-053 | Workbench placed row 可拖回 unplaced / reorder 的舊案例已改為不可拖驗收方向；DEV-046 static/browser regression 已於 DEV-053 QC 通過。 |
| `ai-doc/dev_task.md` | DEV-053 Complete / DEV-054 Follow-up Active | DEV-053 / DEV-054 | DEV-053 本機功能與架構交付已完成；手機定位精準度另由 DEV-054 執行。 |

PM 治理註記：Spec Impact=`Intentional replacement`。使用者 HCS 決策為 `1C 2A 3A`：
完整拖拉子系統重構、placed row 手機長按不進 action rail、static + browser 作為自動化門檻。
2026-07-17 使用者再確認 QA 真實操作驗證計畫必須通過才算 DEV-053 完成；Physical iOS / Android 仍為 supplemental。
2026-07-17 使用者補充：電腦版拖拉 UI / 操作方式目前已滿意，DEV-053 RD 只能保留與穩定化，
不得以重構名義重設計桌機拖拉體驗。
本輪已完成產品程式重構、static/browser verifier、指定回歸與 QA True Operation Gate；未修改 DB/schema/API，未執行 production release。
DEV-052 已封存，不得作為 DEV-053 的實作基準；只可作 historical reference。

## Documentation Map Update - 2026-07-16（拖拉回復 main）

目前權威狀態：DEV-051 的 drop-intent／parent-lock 實作已從工作樹撤出；看板拖拉 runtime、
DEV-029 browser verifier 與 DEV-046 browser verifier回復 `main` 基準。DEV-051 的 SPEC／QA／QC
改為歷史證據，不得作為目前產品行為；DEV-052 因依賴已撤回基準而封存且不可執行。

### DEV-052：看板拖拉子系統重構與行為穩定化（Archived）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md` | Archived / Historical / Do Not Execute | DEV-052 / DEV-051 / DEV-046 / DEV-029 | 歷史重構提案；依賴的 DEV-051 行為已撤回，不得直接實作。 |
| `ai-doc/archived/QA-DEV-052-kanban-drag-subsystem-refactor.md` | Archived / Historical / Not Executed | DEV-052 | 保留真實操作 gate 作未來參考；目前不執行。 |
| `ai-doc/backlog.md` | DEV-052 removed from backlog | DEV-052 | DEV-052 不再保留為 backlog 候選；若重啟需另立以 `main` 為基準的新 DEV。 |
| `ai-doc/dev_task.md` | DEV-052 removed from active index / Archived | DEV-052 | Active 總任務清單不再列 DEV-052；不計入產品交付完成率。 |

PM 治理註記：Spec Impact=`Intentional replacement`。使用者明確要求回復 `main`，因此
SPEC-052 已封存且不再是 active implementation contract。ADR 不另建；DB/schema/API/release boundary 不變。

### DEV-051: 看板跨父層拖拉停留鎖定與落點定位（Withdrawn / Historical）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-051-kanban-cross-parent-drag-lock.md` | Withdrawn / Historical | DEV-051 / DEV-046 / DEV-029 | 保留已嘗試的 750ms parent-lock 契約，不再描述目前 runtime。 |
| `ai-doc/qa/QA-DEV-051-kanban-cross-parent-drag-lock.md` | Historical Evidence / Not Current | DEV-051 | 舊測試與人工腳本可作未來研究資料，不得當成目前版本通過證據。 |
| `ai-doc/qc/QC-DEV-051-kanban-cross-parent-drag-lock.md` | Historical Evidence / Superseded | DEV-051 | 記錄已撤回版本曾執行的 QC；結論不適用目前 runtime。 |
| `ai-doc/backlog.md` | Deferred / Restored to main | DEV-051 / DEV-046 / DEV-029 | 目前採 `main` 的既有拖拉行為。 |
| `ai-doc/dev_task.md` | DEV-051 延後 / 已回復 main | DEV-051 | 不宣稱 DEV-051 交付完成。 |

PM 治理註記：`main` 的 DEV-029／046 行為重新成為 active baseline。DEV-051／052 都不得
在未重新確認需求與 characterization gate 前恢復；既有多人指派與任務卡編輯改善不在回復範圍。

## Documentation Map Update - 2026-07-15

### DEV-048: 多人主責與協作指派

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-048-task-multi-person-assignment.md` | Implemented / TEST + Production Migration Verified / Firebase Production Released / Level 4 Passed | DEV-048 | Authoritative contract：任務支援多位主責與多位協作，主責/協作互斥，canonical `assigneeIds` 保留 legacy `assigneeId` alias；明確排除「最終負責人」。 |
| `ai-doc/qa/QA-DEV-048-task-multi-person-assignment.md` | QA-QC Executed / TEST + Production Release Gate Passed / Alias Governance Residual Accepted | DEV-048 | 驗證計畫與 release addendum 涵蓋 helper、UI picker、TEST/production migration、authenticated Level 3、production Level 4 與 rollback evidence。 |
| `ai-doc/qc/QC-DEV-048-task-multi-person-assignment.md` | QC Passed / TEST + Production Release Gate Passed / Existing Alias Residual | DEV-048 | 記錄 verifier、TypeScript、build、TEST authenticated Level 3、production schema/data checks、Firebase Level 4 與 5 個未改動舊 production source hash residual。 |
| `ai-doc/dev_task.md` | DEV-048 Released / Level 4 Passed | DEV-048 | DEV-048 已完成 TEST/production migration、Firebase production release 與 Level 4；既有 migration provenance residual 與 DEV-047 RPC boundary 仍保留治理註記。 |

PM 治理註記：本輪依使用者註記不新增「最終負責人」。TEST/production 已驗證 `wbs_items.assignee_ids` migration、trigger、legacy alias、role/data API 行為，並完成 authenticated Level 3 與 Firebase Level 4。既有 DEV-047 遠端 backup RPC 仍可能是 first-primary compatible，維持 frozen boundary。`verify:supabase:migration-aliases` 的 5 個舊 production source hash mismatch 未修改，保留為 release governance residual。

## Documentation Map Update - 2026-07-14

### DEV-047: 看板備份套件 V2 與交易式匯入

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-041-board-backup-package-v2-transactional-import.md` | Accepted / Human Confirmed / Implemented Locally / Release Pending | DEV-047 / DEV-038 / DEV-040 | 決定第一階段採 board-only `projed-backup` v2、canonical backend read、copy-to-new-board default、same-origin replace、Supabase transaction/fingerprint/idempotency、out-of-package reference blocker與legacy inspect-first。 |
| `ai-doc/specs/SPEC-047-board-backup-package-transactional-import.md` | Phase 1 Implemented / Local Automated QA-QC Passed / Release Gate Required / Production Not Deployed | DEV-047 / DEV-038 | Authoritative product/engineering contract與完成證據：manifest/checksum/exclusions、package schema、import modes、inspection/plan、ID/tag/member mapping、transaction RPC、error taxonomy、UI communication及future workspace/account capsules。 |
| `ai-doc/qa/QA-DEV-047-board-backup-package-transactional-import.md` | Local QA-QC Executed and Passed / Level 3 Not Executed / Release Gate Required | DEV-047 | 已驗證 package canonicality、round-trip、transaction failure injection、idempotency、concurrency、role/RLS、record-link blocker、legacy/tamper/oversize、browser communication與viewport；遠端 Level 3 保留。 |
| `ai-doc/qc/QC-DEV-047-board-backup-package-transactional-import.md` | Local Automated QC Passed / Isolated Supabase Transaction Passed / Production Not Deployed | DEV-047 | 記錄 static `30/30`、model `10/10`、local transaction `9/9`、isolated Supabase RPC matrix、browser/RWD、regression、TypeScript/build與release residual risks。 |
| `ai-doc/dev_task.md` | DEV-047 Phase 1 Local Complete / Batch Release Pending | DEV-047 | 任務狀態已更新為本機開發與QA/QC完成；記錄Level 3、production、Phase 2/3與release artifact仍需Human Re-entry。 |

PM 治理註記：DEV-047 是 DEV-038 的後續資料架構交付，不回寫或否定 DEV-038 已發布的過渡 UI。Phase 1 產品碼、migration/RPC source 與本機 automated QA/QC 已完成；新流程不再把 Zustand 已載入資料視為完整全域備份，也不讓 legacy global/ambiguous 檔案直接攤平成單一看板。TEST mutation、遠端 migration、Firebase preview、production release與release artifacts均未執行；收到release型指令後才進入固定ProJED-TEST Level 3與deployment-release-gate。Phase 2/3需另行Human Re-entry。

## Documentation Map Update - 2026-07-13

### DEV-045 production release + Level 4 execution

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-040-production-migration-history-reconciliation.md` | Accepted / Production Executed / 38-of-38 Aligned | DEV-045 / Release Governance | Production 11筆history-only repair經schema hash hard gate證明無DDL；5筆真實migration已套用，DB lint與contract query通過。 |
| `ai-doc/release/PREPRODUCTION-DEV-045-20260713.md` | Production Released / Level 4 Passed / Cleanup Complete | DEV-045 / DEV-037 | 記錄TEST Level 3、production backup / migration / Edge / Firebase provenance、authenticated v3 preview / ICS identity、token lifecycle、既有v1 client觀察、rollback與0 residual證據。 |
| `ai-doc/qa/QA-DEV-045-pre-production-release-validation.md` | Executed / Level 3 + Level 4 Passed | DEV-045 / DEV-037 | 正式部署gate已執行；Google Calendar符合外部client要求，Outlook維持non-blocking supplemental。 |
| `ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md` | Production Released / Level 4 QC Passed | DEV-045 | 保留v2歷史證據並新增production DB / Edge / Hosting、v3 identity、token lifecycle、v1 observation與cleanup事實。 |
| `ai-doc/dev_task.md` | DEV-037 + DEV-045 Production Delivered | DEV-037 / DEV-045 | 任務狀態已關閉production release gate；正式環境與Level 4證據均已連結。 |
| `scripts/verify-supabase-migration-aliases.mjs` | 65/65 Passed | Release Governance | 鎖定11份comment-only alias、canonical hash、remote evidence與5份production source migration SHA-256。 |

PM治理註記：release owner已核准並完成production DB → Edge → Firebase順序部署；Level 4與cleanup全綠。Outlook為QA明定的non-blocking supplemental，不影響本次release完成判定。

## Documentation Map Update - 2026-07-12

### DEV-045: 逐看板獨立篩選快照取代 v2 繼承模型

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-038-calendar-subscription-per-board-filter-snapshot.md` | Accepted / Human Confirmed / Release Gate Required | DEV-045 / DEV-037 / DEV-039 | 記錄逐看板快照取代 global / override、state isolation、batch copy、v3 data contract、v1/v2 compatibility與舊 remote gate freeze的架構決策。 |
| `ai-doc/decisions/ADR-039-supabase-migration-version-aliases.md` | Accepted / TEST Reconciliation Authorized / Production Pending | DEV-045 / Release Governance | 保存ProJED-TEST四組remote/canonical migration等價證據、comment-only alias策略、history repair guardrails與production排除邊界。 |
| `ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md` | Phase 1-2 Local Implemented / Automated QA-QC Passed / Former v2 Remote Gate Frozen | DEV-045 / DEV-037 / DEV-039 | Authoritative v3 contract與已完成本機實作：Calendar / Workbench共用條件 UI語意但隔離 state；每張看板持有獨立 task filters與 `date_types` snapshot；預覽以task + date type呈現實際行事曆事件、開始／到期統計與未產生原因；支援included toggle、一次性批次複製、v1/v2 materialization與per-board permission recheck。 |
| `ai-doc/qa/QA-DEV-045-pre-production-release-validation.md` | QA Plan Ready / Level 3 Static + Unauthenticated Preview Passed / Auth Smoke Pending / Production Deploy Not Authorized | DEV-045 / DEV-037 | 正式部署前專用Gate：Git與artifact provenance、ProJED-TEST migration / Edge、Firebase level3-smoke、preview / ICS事件identity、v1/v2/v3相容、角色與token安全、外部calendar client、cleanup、rollback與Go / No-Go。 |
| `ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md` | Revised v3 QA Executed / Phase 1-2 Local Gates Passed / Release Gate Required | DEV-045 | 已執行 shared controls、state isolation、board draft、batch copy、v3 normalization、v1/v2 compatibility、permission matrix、preview/feed fixture與 320-1440 viewport gates。 |
| `ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md` | Per-Board v3 Phase 1-2 Local QC Passed / Historical v2 Evidence Preserved | DEV-045 | v3 addendum記錄 static/browser/model/feed、local DB 20-behavior rollback smoke、Deno check、DB lint、TypeScript/build與 regression evidence；舊 v2 remote path仍 frozen。 |
| `ai-doc/dev_task.md` | DEV-045 Phase 1-2 Local Complete / Release Hygiene Fixed / Phase 3-4 Release Gate Required | DEV-045 | 總任務清單與 PM Update已關閉本機 RD/QA/QC；production artifact 已加入 test credential guard，remote migration、Edge deploy、live `.ics`與 production release仍等待 release gate。 |

PM 治理註記：本次不新增重複 DEV，而是 intentional replacement。HCS 引導未逐題回覆後，使用者以「繼續」採建議 `1A / 2A / 3A`：只共用 UI / filter 語意、所有當下可讀看板建立獨立安全預設 snapshot、提供一次性批次複製且複製後不連動。2026-07-12批判修訂再把事件日期類型納入逐看板 snapshot，v3不保留頂層 `date_types`。production尚未部署 DEV-045 v2 migration / Edge matcher，read-only evidence為 v2 rows 0；目前 v3 Phase 1/2本機實作與驗證已完成，remote migration、Edge deploy、production release與 background row rewrite仍需人類重返 / release gate。

## Documentation Map Update - 2026-07-09

### Release Governance: Fixed TEST Environment + Level 3 Gate

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-037-fixed-test-environment-and-level3-release-gate.md` | Accepted | Release governance / Supabase / Firebase Hosting | 固定 `ProJED` 為 production、`ProJED-TEST` 為 staging/test/controlled blast-zone、Firebase Hosting `level3-smoke` preview 為正式部署前 Level 3 production-like smoke；AI 後續需自動判斷是否需要 Level 3，但 production deploy、Supabase Branch、破壞性測試與正式資料操作仍需明確授權。 |
| `ai-doc/release/LEVEL3-firebase-preview-supabase-test-runbook.md` | Active Fixed Runbook | Release governance / Level 3 smoke | 定義固定低成本路徑：staging build 指向 `ProJED-TEST`、部署到 Firebase preview channel `level3-smoke --expires 1d`、執行 HTTPS browser smoke、手動 auth/read-write/reload/cleanup smoke，並記錄證據。 |
| `scripts/verify-level3-firebase-preview.ps1` | Active Helper | Release governance / Level 3 smoke | 對 Firebase preview URL 執行 Playwright browser smoke；僅驗證 preview URL，不替代手動登入與 `ProJED-TEST` read/write cleanup smoke。 |
| `ai-doc/dev_task.md` | Release Gate Rule Updated | Release governance | Release Gate 指令已補固定規則：正式部署前預設需要 Level 3；`ProJED-TEST` 是固定測試環境與受控試爆場；Supabase Branch 預設不用，只保留明確授權例外。 |

PM 治理註記：本決策採 HCS 引導模式 `1B/2B/3B`。後續 AI 可自動判斷 Level 3 是否 required / not required / blocked；若判定 skip，必須記錄理由。此規則不授權自動 production deploy、不授權自動接受 Supabase Branch 成本、不授權在未備份下執行破壞性 `ProJED-TEST` 測試。

## Documentation Map Update - 2026-07-07

### DEV-046: 全任務表面拖曳一致化與拖曳把手退役

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-046-universal-task-surface-drag.md` | Implemented / Local Automated QA Passed / Production Not Authorized | DEV-046 / DEV-028 / DEV-029 / DEV-039 / DEV-044 | 定義並記錄桌機與手機所有階層 task surface 都從整個任務本體拖曳，不再依賴拖曳把手；已完成 WBS list、Kanban card、checklist row、task-backed column header、shared sidebar 與 workbench row-root implementation，並保留 click-to-details、桌機右鍵、手機 pan-first、mobile compact action rail、workbench row-root drag 與 undo grouping。 |
| `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md` | Automated QA Passed / Manual QC Not Executed / Physical-Phone Supplemental Not Executed / Production Not Authorized | DEV-046 | QA 真實操作驗證計畫與本機自動化證據，包含所有階層 desktop/list/card/checklist/workbench whole-surface drag、mobile quick tap / short pan / long press、deep hierarchy、interactive controls、permission、undo、visible error sweep 與極限操作測試；人工真機 supplemental 尚未執行。 |
| `ai-doc/dev_task.md` | DEV-046 Implemented / Local Automated QA Passed / Production Not Authorized | DEV-046 | 登錄 Human Decision Brief、授權邊界、RD Handoff Contract、Deferred Scope Audit、All-Phase Coverage Matrix、完成 gates 與未完成的人工真機 / production release 邊界。 |

PM 治理註記：DEV-046 是新的交付點，不能被視為 DEV-039 Phase 2A 的小修。DEV-039 只處理全域任務平台 row-root drag parity；DEV-046 擴大到桌機/手機、所有階層的列表/卡片/待辦清單任務 surface 與拖曳把手退役。2026-07-07 已完成本機 RD implementation 與 automated QA gates；production deploy、merge/PR/release artifacts 與手機實機 supplemental 仍未授權/未執行。

## Documentation Map Update - 2026-07-06

### Current Direct-Work Boundary

本輪續接 `[$dev-pm] 完成DEV-045開發` 時，`ai-doc/dev_task.md` 是唯一任務排序與授權入口。2026-07-12 DEV-045 Phase 1 shared condition UI / per-board Builder與 Phase 2 local v3 service / validator / Edge source已完成本機 RD/QA/QC。DEV-025 mutating DB QC、DEV-040 remote Edge / production injection、DEV-044 destructive recovery與 DEV-045 Phase 3/4仍需 Supabase、deployment-release-gate、人類重返或受控 production gate。

2026-07-09 使用者回報 DEV-028 人工親自點擊 QC 通過；後續開發排序不再把 DEV-028 manual QC 當作 active blocker，但 production deploy 仍需另行授權。`verify:remaining-external-gates` 是 read-only PM evidence，用來確認剩餘 gate 邊界未被誤關閉，不代表任一外部 Gate 完成。

| 類別 | 目前狀態 | 下一步 |
|---|---|---|
| 產品 RD | DEV-045 Per-Board v3 Phase 1-2 Local Implemented / Automated QA-QC Passed | 本機開發已完成；舊 v2 remote path frozen。需要發布時以 v3 source進入 Level 3與 deployment-release-gate。 |
| PM task board | Canonical Index Added / DEV-045 v3 Redirect Applied | `dev_task.md` 已補總任務清單；DEV-045 / DEV-037 維持同一行事曆 workstream；`verify:remaining-external-gates` 已更新為現行 v3 release-boundary evidence，仍只讀且不代表 remote gate 完成。其他 DEV 邊界不變。 |
| DEV-011 / DEV-012 | Done / Production Release Deployed / Production UI Smoke Passed | `verify:dev-011-012-production-ui-smoke-readiness` 與 guarded executor self-check 已通過；2026-07-09 使用者允許 production fixture 後第一次實跑揭露 `rag_sync_jobs` first-publish ordering 問題，已以 hotfix branch `codex/dev011012-rag-order-hotfix` commit `7704e2f` 走 release gate 部署。正式站載入 `assets/index-BkwGqGCZ.js` / `assets/index-BrAYM5iH.css`，重跑 production fixture smoke 通過，DB 查證 `published_record_found=true`、`record_task_links=2`、`rag_enabled=true`、`source_document_present=true`，cleanup 通過。 |
| DEV-025 | DB Read-only Preflight Passed / Fixture + Execution Readiness Gates Added / Guarded Mutating Executor Added / Mutating QC Pending | 正式 DB 已具備 RPC / grants / constraints；已新增 read-only fixture-readiness harness、execution-readiness static gate 與 guarded mutating executor self-check。下一步需 staging / disposable fixture 或 production-safe test workspace/board，先驗證腳本防呆、fixture 標記、最小資料形狀與 mutation opt-in，再驗證 RPC、RLS、audit log、資料一致性與 RAG visibility。 |
| DEV-028 | Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | `verify:dev-028-manual-click-qc-readiness` 已補 read-only checklist gate；2026-07-09 使用者回報 MAN-028-001 至 MAN-028-028 人工親自點擊通過，若需稽核級證據仍應補逐項截圖/錄影。 |
| DEV-035 | Supabase DB Role QC Passed / Production Not Deployed | `delete_workspace` owner/admin/member/viewer/outsider matrix、workspace list reload、tenant-scoped cascade 與 execute grants 已通過；production front-end release 需另行授權。 |
| DEV-037 / DEV-045 / DEV-040 | Calendar workstream + P0 guards | DEV-045 v3 Phase 1/2本機 RD/QA/QC已完成，舊 v2 remote gate frozen；DEV-037 v1 compatibility由 v3 materialization / feed regression承接；DEV-040 remote Edge仍走獨立 Supabase / release gate。 |
| DEV-038 / DEV-042 / DEV-044 | Production Release Deployed / Local + Production Smoke Passed | Firebase Hosting 正式站載入 `assets/index-BU14rK7W.js` / `assets/index-CYqvildz.css`；HTTP artifact check、production browser smoke 與 authenticated production UI smoke passed；DEV-042 真機驗證已由使用者回報通過。DEV-044 durable/destructive recovery 仍需另行 gate。 |
| DEV-045 | Production Released / Level 4 Passed / Cleanup Complete | 逐看板獨立filter snapshot、v3 DB / Edge、Firebase live、preview / ICS identity、token lifecycle、v1 client觀察與cleanup均已完成。 |

### DEV-045: 行事曆訂閱篩選器建構器與即時預覽

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md` | Per-Board v3 Phase 1-2 Local Implemented / Automated QA-QC Passed / Release Gate Required | DEV-045 / DEV-037 / DEV-039 | 逐看板 `board_filters`、shared controls、state isolation、batch copy、v1/v2 materialization、permission與 preview/feed parity已完成本機實作；v2 inheritance被 intentional replacement。 |
| `ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md` | Revised v3 QA Executed / Local Gates Passed / Release Gate Required | DEV-045 | 已執行 v3 UI、state、payload、compatibility、DB/Edge source、permission與 viewport驗證；舊 v2 passes維持歷史證據。 |
| `ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md` | Per-Board v3 Phase 1-2 Local QC Passed / Historical v2 Evidence Preserved | DEV-045 | 保存舊 v2事實，並新增 current v3 automated QC、local DB rollback、Deno與 regression evidence。 |
| `ai-doc/dev_task.md` | DEV-045 Phase 1-2 Local Complete / Phase 3-4 Release Gate Required | DEV-045 | 登錄完成狀態、current evidence、Deferred Scope Audit與 release re-entry boundary。 |

PM 治理註記：DEV-045 仍承接 DEV-037 的 source-scope / permission / feed safety，但 v3 不再使用 global / override。v1 rows保持可讀與原 feed；編輯時 materialize 成逐看板 draft，使用者預覽並儲存後才升級。預設所有當下可讀看板進入 snapshot，未來新增看板不自動進入既有外部連結。

### DEV-044: 上一步復原範圍擴充與低資料庫成本治理

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-044-undo-recovery-scope-expansion.md` | Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production Smoke Passed | DEV-044 / DEV-001 / DEV-028 / DEV-039 | 定義 ordinary undo 與 destructive recovery 分流；Phase 1 已擴充低成本 client-side command stack，Phase 2 safe slice 已加入 batch/reorder/placement command grouping；已發布 safe scope，不新增 DB history table，不把 workspace delete、權限、匯入覆蓋、AI 批次改寫或 board workspace transfer 納入一般 Ctrl+Z。 |
| `ai-doc/qa/QA-DEV-044-undo-recovery-scope-expansion.md` | Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production Smoke Passed | DEV-044 | 記錄 Phase 1 undo coverage、async/suppress stack guard、record snapshot restore、board stable id、editor history scope、service write count、Phase 2 batch/placement/reorder gate、destructive action exclusion cases 與 production release evidence。 |
| `ai-doc/qc/QC-DEV-044-undo-recovery-scope-expansion.md` | Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production QC Passed | DEV-044 | 記錄 DEV-044 本機 QC 事實與 release evidence：static 25/25、browser board title / suppress / record archive restore、Phase 2 batch/reorder/placement static gate、DEV-013/039/006 regression、TypeScript、production build、artifact/browser/auth smoke。 |
| `ai-doc/dev_task.md` | DEV-044 Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production Smoke Passed | DEV-044 | 登錄目前交付邊界：Phase 1 local ordinary undo 與 Phase 2 safe slice 已完成並發布；DB migration、durable recovery、board workspace transfer undo 與 destructive recovery 仍需另行 gate。 |

PM 治理註記：DEV-044 不是建立遠端歷史紀錄系統，而是先把既有 `useUndoStore` Command Pattern 擴充到高頻、低成本、可用既有 service 反向操作復原的範圍。Phase 1 + Phase 2 safe slice 已完成本機實作、自動化 gate 與 Firebase Hosting production release；資料庫費用 guardrail 仍是本 DEV 的一級驗收：push undo 不得新增遠端寫入；只有使用者真的按 undo / redo 時才執行等同正常操作的反向寫入。Durable recovery、跨裝置 undo、workspace / board delete 完整復原、board workspace transfer undo、權限 audit、匯入 rollback、AI 批次版本化仍需另行授權。

## Documentation Map Update - 2026-07-05

### DEV-042: 手機左側欄收疊零佔寬與全域任務平台 Off-Canvas

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-042-mobile-left-sidebar-offcanvas-collapse.md` | Production Release Deployed / Local + Production Smoke Passed / User-Reported Physical Phone Supplemental Passed | DEV-042 / DEV-039 / DEV-001 | 定義並記錄手機版 collapsed Sidebar / TaskWorkbench 不保留 in-flow rail；手機展開採 overlay / drawer，不推擠主內容；桌機保留受控 compact rail；已發布 production 且使用者回報真機通過。 |
| `ai-doc/qa/QA-DEV-042-mobile-left-sidebar-offcanvas-collapse.md` | Production Release Deployed / Local + Production Smoke Passed / User-Reported Physical Phone Supplemental Passed | DEV-042 | 記錄 DEV-042 static/browser viewport gate、overlay open/close、DEV-029 pan-first、DEV-039 workbench regression gate、production release evidence 與使用者回報真機通過。 |
| `ai-doc/qc/QC-DEV-042-mobile-left-sidebar-offcanvas-collapse.md` | Production Release Deployed / Local + Production + User-Reported Physical Phone QC Passed | DEV-042 | 記錄 RD 修正、static/browser screenshots、DEV-029/DEV-039 regression、TypeScript、production build、artifact/browser/auth smoke 與使用者回報 physical-phone supplemental passed evidence。 |
| `ai-doc/dev_task.md` | DEV-042 Production Release Deployed / Local + Production Smoke Passed / User-Reported Physical Phone Supplemental Passed | DEV-042 | 記錄授權邊界：產品程式碼、verifier、本機 automated QA/QC、production release 與使用者回報真機通過已完成；DB/RLS/migration 與正式資料修復不屬於本 DEV。 |

PM 治理註記：DEV-042 修正的是「手機 collapsed state 不應被桌機 compact rail 語意綁住」。本輪已同時處理主工作區側欄與全域任務平台：mobile closed 不再渲染 in-flow rail，open state 以 overlay 顯示；desktop compact rail 保留。2026-07-06 已發布 Firebase Hosting production，且使用者回報真機驗證通過。DB schema、migration、RLS/RPC、完整 Sidebar IA redesign 不在本輪完成範圍。

### DEV-028 Addendum: 任務名稱僅限詳情頁編輯

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Detail-Only Title Edit Addendum Implemented / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 / DEV-029 | 任務名稱唯一編輯入口已落到 `TaskDetailsModal` / 任務詳情頁 title input；看板卡片、L3+ 待辦列、工作台排序列、清單列、甘特列與心智圖節點不再提供 pencil、F2、`t`、右鍵重新命名、雙擊標題或直接打字 rename。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | Detail-Only Title Edit QA Updated / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 / DEV-029 | 更新 Zero-Tolerance、MAN-028、FMEA 與 QC handoff evidence；`verify:dev-028-manual-click-qc-readiness` 保護人工 checklist 與證據邊界；自動化已覆蓋外層 task surface 無 rename、詳情頁 title edit、context menu 無重新命名、新增任務導向詳情 title edit、DEV-029 mobile pan-first regression；2026-07-09 使用者回報人工親自點擊通過。 |
| `ai-doc/qc/QC-DEV-028-detail-only-title-edit-addendum.md` | Local Automated QC Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 / DEV-029 | 記錄本輪 RD/QC 事實驗證、通過命令、manual readiness gate、lint 既有 unrelated blocker、production 未部署與 2026-07-09 使用者回報 MAN-028 人工親自點擊通過。 |
| `ai-doc/dev_task.md` | DEV-028 Addendum Implemented / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed / Production Not Deployed | DEV-028 | 記錄授權邊界：已完成產品碼與 verifier 實作，並新增 manual readiness gate；2026-07-09 使用者回報人工親自點擊 QC 通過；production deploy、schema/migration 另行 gate。 |

PM 治理註記：本 addendum 取代 DEV-028 舊版「明確改名入口 / 桌機直接打字 / 手機命名鍵盤 / 外層 rename」契約。本輪已依使用者授權完成 RD：任務名稱編輯集中到任務詳情頁 title edit；外層任務 surface 只負責開詳情、拖曳、選取與其他非 rename 控制。資料模型、DB schema、production deploy 不在本輪授權範圍。

### DEV-029 Addendum: 手機精簡任務操作列與長按拖放

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Phase 1B Implemented / Local Automated QA Passed / Production Not Deployed / Hotfix Covered | DEV-029 / DEV-028 | 依 HCS `1B 2B 3A` 完成手機限定 addendum：手機長按任務後任務浮起，viewport 上方顯示有文字標籤的 compact action rail；只保留標示完成/取消完成、新增同階、新增下層、刪除；可拖曳到任務位置排序，也可 drop 到低風險操作；drop 到刪除只開確認。2026-07-05 已補手機拖曳把手短滑 pan、把手長按分流、drag-action 邊緣 auto-scroll 與 touchcancel / pointercancel / blur / visibility / Escape / timeout 退出不卡死。電腦版完全不改。 |
| `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Phase 1B Local Automated Browser QA Passed / Physical Phone Supplemental Not Executed / Hotfix Covered | DEV-029 | 新增並執行 QA-029-I 與 hotfix 可自動化案例，驗證手機頂部文字 compact action rail 精簡、任務浮起、拖曳排序、手機拖曳把手短滑 pan、拖曳把手長按進 mobile action mode、drag-action 右邊緣 auto-scroll board、欄位底部 auto-scroll column、touchcancel 退出不卡死、drop 到完成/新增下層/刪除確認、短滑 pan 不被破壞、quick tap 開詳情、工作台列長按 action rail 與桌機 click regression。 |
| `ai-doc/dev_task.md` | DEV-029 Addendum Implemented / Local Automated QA Passed / Production Not Deployed | DEV-029 | 記錄本輪已授權並完成產品程式碼、verifier 與本機自動化 QA；production deploy、schema/migration、手機非 board modes 與 physical-phone supplemental 仍未授權 / 未執行。 |

PM 治理註記：DEV-029 Phase 1B 是 mobile-only interaction addendum，不推翻 Phase 1 pan-first。短滑仍優先 pan，quick tap 仍開詳情，長按才進 drag-action mode。刪除、改名、指派、依賴、複製、升降階等桌機或高風險功能不得回流到手機 compact action rail；桌機 context menu 必須保持原樣。本輪 RD implementation、拖曳把手 / touchcancel 防卡死 hotfix、edge auto-scroll hotfix 與 local automated QA 已完成；production deploy 與 physical-phone supplemental 尚未執行。

### DEV-041: PWA 更新通知與快取恢復

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md` | Production Release Deployed / Local + Production Smoke Passed / One-Click Latest Local Hotfix Passed | DEV-041 / DEV-034 | 定義並實作正式部署前的新版本可見更新提示、更新按鈕、PWA lifecycle state、stale chunk/cache recovery、reload loop guard、ErrorBoundary recovery 整合、DEV-034 regression 與 production release gate 邊界；2026-07-07 已補一鍵更新到最新版 local hotfix，production redeploy 未執行。 |
| `ai-doc/qa/QA-DEV-041-pwa-update-notification-cache-recovery.md` | Local + Production QC Passed / Production Release Deployed / One-Click Latest QA Updated | DEV-041 / DEV-034 | 規劃 static/browser QA：`onNeedRefresh` 顯示更新提示、更新按鈕 latest reload flow、dismiss/later、offline ready、chunk-load recovery、cache clear scope、ErrorBoundary integration、mobile/desktop UI、accessibility、DEV-034 regression、TypeScript/build 與 production deploy evidence 禁止過度宣稱。 |
| `ai-doc/qc/QC-DEV-041-pwa-update-notification-cache-recovery.md` | Production Release Deployed / Local + Production QC Passed / Mobile Visibility Hotfix Passed / One-Click Latest Local Hotfix Passed | DEV-041 / DEV-034 / DEV-039 / DEV-029 | 記錄 release boundary、local QC、production build artifact、pre-deploy production-like smoke、Firebase deploy、post-deploy HTTP/browser smoke、authenticated production UI smoke、mobile update visibility hotfix、2026-07-07 one-click latest local hotfix、residual risks 與 rollback target。 |

PM 治理註記：DEV-041 已完成 Phase 1 implementation、local QC 與 Firebase Hosting production release；正式站 `https://projed-cc78d.web.app/` 已於 hotfix 後載入 `assets/index-BXtRfIba.js` 並通過 post-deploy browser smoke。手機未看到更新提示的缺口已補：app shell bundle hash check、`updated` state 與「已更新到新版」提示。2026-07-07 已完成 local one-click latest hotfix：使用者按更新時清 app Cache Storage / service worker registration 後 reload 最新 app shell，避免 stale queued worker callback；此 hotfix 尚未部署 production。強制更新、release notes 後端、版本 API、analytics、push/email notification、DB schema / migration / RLS / RPC 不屬於目前授權範圍。

## Documentation Map Update - 2026-07-04

### DEV-029: 手機 Pan-First 觸控手勢仲裁

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Phase 1 + Phase 1B Implemented / Local Automated QA Passed / Production Not Deployed / Hotfix Covered | DEV-029 / DEV-028 | 定義並記錄手機 coarse pointer 的 pan-first 手勢仲裁：任務卡、子任務列、欄位、空白處與手機拖曳把手短滑優先移動畫面並 suppress click-through；手機 task surface 無位移 tap 仍開任務詳情；長按進入 compact action rail 與 drag-action mode，可排序、完成、新增下層、刪除確認；drag-action 靠近 board / column 邊緣會 auto-scroll；touchcancel / pointercancel / blur / visibility / Escape / timeout 可退出不卡死；桌機不變。 |
| `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Phase 1 + Phase 1B Local Automated Browser QA Passed / Physical Phone Supplemental Not Executed / Hotfix Covered | DEV-029 | 驗證手機任務卡主體、L2+ 子任務列與拖曳把手不需找縫隙即可 pan，短滑不得開 `TaskDetailsModal`、rename、context menu 或 drag；L2+ 垂直/水平 pan 需產生 `scrollTop` / `scrollLeft` 位移；Phase 1B compact action rail、長按浮起、把手長按、edge auto-scroll、touchcancel 退出、drop target、工作台列與桌機不變回歸均已納入 browser matrix；真機 H01-H04 未執行。 |
| `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QC Passed / Physical Phone Supplemental Not Executed / Production Not Deployed / Hotfix Covered | DEV-029 | 記錄 RD 修正、DEV-029 static 32/32、browser matrix 覆蓋 L2+ scroll displacement、手機拖曳把手短滑 pan、把手長按、edge auto-scroll、touchcancel 退出不卡死、DEV-028 regression、TypeScript、build:test evidence；明確標示未執行 production deploy、Phase 2 與 physical-phone supplemental cases。 |
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Compatibility Note Added for DEV-029 / Existing Implementation Preserved | DEV-028 / DEV-029 | 補充手機相容例外：DEV-028 的單擊開詳情仍治理桌機與一般 cross-mode 契約，但手機 coarse pointer 的任務卡短滑安全由 DEV-029 優先；長按任務操作選單仍保留。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | Compatibility Note Added for DEV-029 / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 / DEV-029 | 補充 QA 相容註記：MAN-028 mobile cases 若在 DEV-029 實作後執行，需把手機短滑任務卡不開詳情納入零容忍；手機 tap-to-details 不得覆蓋 pan-first；manual readiness gate 已保護 checklist 與 evidence boundary；2026-07-09 使用者回報人工親自點擊通過。 |

PM 治理註記：DEV-029 是 DEV-028 mobile interaction follow-up，不推翻桌機 click-to-details，也不取消手機 quick tap 開詳情。Phase 1 已依使用者要求完成 RD implementation 與本機 automated/browser QC；真機回饋後已恢復手機無位移 tap 開詳情。2026-07-05 Phase 1B 已完成手機 compact action rail 與長按拖放實作及本機自動化 QA；同日依真機回饋補強手機拖曳把手 pan pass-through、drag-action edge auto-scroll、touchcancel / pointercancel / blur / visibility / Escape / timeout 退出防卡死，並通過本機 browser QA。production deploy、手機非 board modes 重新開放、再次取消或重定義手機 tap-to-details、桌機 context menu 修改仍需要使用者另行授權。H01-H04 physical-phone 補充案例尚未完整執行，不得宣稱真機手感已簽核。

### DEV-039 Phase 2A Addendum: 全域任務平台任務列拖曳觸發窗口一致化

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Phase 2A Implemented / Local Automated QC Passed / Release Not Authorized | DEV-039 / DEV-028 / DEV-029 | 已完成 `已歸位任務` 與 `未歸位任務` 拖曳觸發窗口一致化，採未歸位任務的整列 root 觸發方式為主；只收斂 `TaskWorkbenchPanel.WorkbenchDragCard` row shell / root hit area，保留左鍵詳情、右鍵 `GlobalContextMenu`、手機長按 compact action rail、hierarchy cue 與日期資訊，不改 sensor、資料模型、DB/RLS/migration 或 production deploy。 |
| `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2A QA Passed / Local Automated QC Passed | DEV-039 | 已執行真實操作驗證：static gate 檢查兩種 row root 都掛 draggable/touch/click/context-menu bindings，browser gate 驗證未歸位 row 與所有任務排序 row 的左側、title 中段、右側三個 sample points 都命中 row root，並以真實雙向 placement drag 覆蓋拖曳流程；同時驗證右鍵選單與 `Escape`、left click details、mobile long press action rail、DEV-028/029/039 regression、TypeScript 與 build。 |
| `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2A Local Automated QC Passed / DB-Unchanged / Production Not Deployed | DEV-039 | 記錄 Phase 2A static 30/30、browser row-root hit-test、shared right-click menu、真實雙向 placement drag、DEV-028/029 regression、TypeScript 與 `build:test` evidence；明確標示未執行 DB/RLS/migration、production deploy 或手機新手勢。 |

PM 治理註記：本 addendum 已完成產品碼與本機自動化 QC，不代表 production release 已完成。若後續實作需要改 sensor、資料模型、DB/RLS/migration、production deploy 或手機新手勢，必須停止並回到人類授權。

### DEV-039 Phase 2 Addendum: 全域任務平台跨看板資料來源與刪除有效可見性

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Phase 2 Cross-Board Source Slice Implemented / Local Automated QC Passed / DB-Unchanged | DEV-039 / DEV-028 / DEV-036 | 依使用者確認的系統架構完成 Phase 2 cross-board source / deletion effective visibility slice：`所有任務排序` 跨所有可見看板顯示任務，不再只依 active board；資料源由 `listWorkbenchTasks()` / `mergeUnplacedTasks()` / `isTaskEffectivelyVisible()` 形成，排除 archived task、archived ancestor descendant、missing-parent orphan，並以 `列表 / 群組` 顯示設定控制 `group/list` 容器；任務台清單採 dense text rows，移除大卡片、獨立拖曳圖示與日期 chip，以縮排/字重呈現 hierarchy depth，`未歸位` / `所有任務排序` 為 sticky section headers，collapsed rail 與 expanded collapse button 改為 chevron pair。 |
| `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2 Cross-Board Source Slice QA Passed / Partial-Error UI Follow-up Not Authorized | DEV-039 | 補入並驗證 Phase 2：active board independence、active board switch stability、filter selected board semantics、deleted task removal、archived ancestor removal、group/list 預設不顯示與手動顯示、missing-parent orphan 排除、dense text rows、hierarchy indentation、sticky section headers、compact collapsed rail、整列拖移、unplaced merge identity、source overwrite guard、browser cross-board/deletion proof；visible partial/error summary、RPC/RLS/migration、production smoke 未納入本輪。 |
| `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2 Cross-Board Source Slice Local Automated QC Passed / DB-Unchanged / Production Not Deployed | DEV-039 | 記錄 cross-board source static/browser verifier、group/list 顯示設定與 orphan 殘留 hardening、dense text row placement regression、sticky section header scroll proof、compact collapsed rail / expanded chevron collapse proof、parity regression、TypeScript、build:test evidence；明確標示未執行 Supabase RPC/RLS/migration、正式資料修復/刪除與 production deploy。 |

PM 治理註記：本次已依使用者 `執行開發` 授權完成 DEV-039 Phase 2 的前端 / local-test / existing-service adapter slice，不代表已授權 remote migration、RLS/RPC、production deploy、正式資料修復或資料刪除。Visible partial/error summary UI 仍是 follow-up；若需要 Supabase RPC/RLS/migration、正式資料修復或資料刪除，必須停下走 human re-entry 與對應 gate。

## Documentation Map Update - 2026-07-03

### DEV-040: 正式環境同型 BUG 風險硬化與驗證

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-040-production-environment-risk-hardening.md` | Production Release Deployed / Original BUG Smoke Passed / P0 Local Addendum Implemented / P0 Remote Read-only Preflight + Remote Readiness Static Gate Passed / Extended Matrix Partially Covered | DEV-040 / DEV-011 / DEV-020 / DEV-027 / DEV-037 / DEV-039 | 依正式環境 2 個已發生 BUG 推導同型風險，定義 7 個高風險點：備份匯入 dependencies、RAG timeout、新增看板 temp id race、member stale response、tag stale response、Google Calendar timeout、MindMap localStorage-only 語意；包含 End-State、Architecture Memory Capsule、Phase Roadmap、RD Handoff Contract、Deferred Scope Audit 與 All-Phase Coverage Matrix。原 hotfix slice 已部署 production，原始 2 BUG flow 正式站 smoke 通過；2026-07-06 補 P0 本機 addendum；2026-07-07 production read-only preflight 與 remote-readiness static gate 確認 DB substrate 與本機 Edge/source governance，但 remote Edge 尚未部署 timeout guard。 |
| `ai-doc/qa/QA-DEV-040-production-environment-risk-validation.md` | QA Plan Complete / Local + P0 Addendum QC Executed / P0 Remote Read-only Preflight + Remote Readiness Static Gate Passed / Production Smoke Executed for Original BUG Flows | DEV-040 | 針對 7 個正式環境風險制定 FMEA、P0/P1/P2 測試案例、local / production-like / production smoke evidence 要求，以及 regression gate；已完成原始 2 BUG production authenticated UI smoke、2026-07-06 P0 local addendum QC、2026-07-07 P0 read-only production preflight 與 remote-readiness static gate。 |
| `ai-doc/qc/QC-DEV-040-production-environment-risk-validation.md` | Production Release Deployed / Production Authenticated UI Smoke Passed for Original BUG Flows / P0 Local Addendum QC Passed / P0 Remote Read-only Preflight + Remote Readiness Static Gate Passed / Extended 7-Point Matrix Partially Covered | DEV-040 / DEV-011 / DEV-020 / DEV-027G / DEV-028 / DEV-039 | 記錄 local/source/browser QC、Firebase Hosting deploy、artifact hash、post-deploy smoke、Supabase P5/P6 smoke、OAuth start smoke、正式站 authenticated UI smoke、P0 local addendum、P0 production read-only preflight 與 remote-readiness static gate；原始 2 BUG flow 通過，Edge deploy、production timeout injection、完整 DB count smoke 與 member/tag/Google Calendar/MindMap 等延伸矩陣剩餘項未過度宣稱。 |

PM 治理註記：DEV-040 是正式環境同型 BUG 風險硬化交付點，來源為「本機測沒問題、正式環境才卡住或資料消失」的系統性差異。本輪已完成 local/source/browser automated QC、Firebase Hosting production deploy、原始 2 BUG 正式站 authenticated UI smoke、P0 production read-only preflight 與 remote-readiness static gate；可宣稱原始 2 BUG flow 已通過 production smoke，且 production DB 具備依賴資料 substrate，本機 Edge/source governance 已可進入受控 deploy gate。不得宣稱 RAG timeout 已 live-protected，因 remote Edge Function 尚未部署本地 timeout guard；也不得宣稱 7 點延伸矩陣全部關閉。member/tag stale、Google Calendar REST timeout、MindMap 跨裝置語意與完整備份匯入 DB count 仍需後續專項驗證。

## Documentation Map Update - 2026-07-02

### DEV-039: 任務過濾器核心與全域任務平台兩欄篩選重構

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Phase 1/1A Implemented / Local Automated QC Passed / Phase 1B Implemented / Local Automated QC Passed / Phase 1C Implemented / Local Automated QC Passed / Phase 2 Cross-Board Source Slice Implemented / Local Automated QC Passed / Phase 2A Drag Trigger Parity Implemented / Local Automated QC Passed / Production Release Not Deployed + Requires Explicit Authorization / All-Phase Coverage Complete | DEV-039 / DEV-027D / DEV-028 / DEV-029 / DEV-036 | 定義任務過濾器共用核心、看板任務視圖一致化、顯示設定與過濾條件分離、全域任務平台單一過濾器入口：主畫面一顆 `過濾器` 按鈕，popover 內選看板並調同看板過濾器；Phase 1B 已補回未歸位 / 已歸位看板 placement lanes、雙向拖移與未歸位任務功能等價；Phase 1C 已完成 filter result parity 實作與本機自動化 QC；Phase 2 cross-board source slice 已完成 `listWorkbenchTasks()` / `mergeUnplacedTasks()` / `isTaskEffectivelyVisible()` / scoped `setNodes()`；Phase 2A 已完成未歸位與所有任務排序 row 使用一致 root drag surface，保留左鍵詳情、右鍵選單、手機長按、hierarchy cue 與日期資訊；明確取消 profile/storage/copy/sync，並保留 Production Release Gate、Deferred Scope Audit 與 All-Phase Coverage Matrix。 |
| `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 1/1A QA Passed / Phase 1B QA Passed / Phase 1C QA Passed / Phase 2 Cross-Board Source Slice QA Passed / Phase 2A QA Passed / Local Automated QC Passed / All-Phase Coverage Complete | DEV-039 | 驗證計畫涵蓋共用 predicate、active filter count、五視圖一致性、Workbench 單一過濾器按鈕與 popover 內看板/過濾器、未歸位 / 已歸位看板 placement lanes、雙向拖移、任務卡功能等價、Phase 1C matchedTaskIds 結果一致、context-only ancestor、負責人 option source 對齊、Phase 2 cross-board source truth、deleted task removal、archived ancestor removal、group/list 顯示設定、missing-parent orphan 排除、source overwrite guard、Phase 2A row-root drag hit area、禁止 profile/save/copy UI、mobile viewport gates、phase exit rules 與 deferred verification audit。 |
| `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 1/1A + Phase 1B + Phase 1C + Phase 2 Cross-Board Source Slice + Phase 2A Drag Trigger Parity Local Automated QC Passed / DB unchanged / Production Not Deployed | DEV-039 | 記錄 DEV-039 兩欄簡化、未歸位 / 已歸位看板 placement lanes、雙向拖移、任務卡功能等價、Phase 1C result parity、Phase 2 cross-board source / deletion effective visibility、Phase 2A row-root drag trigger parity，以及 static/browser/regression/TypeScript/build gates；production release 未執行，後續仍需使用者明確部署授權與 deployment-release-gate。 |

PM 治理註記：DEV-039 採使用者最新一顆按鈕方案。全域任務平台是 BoardView 左側跨看板拖拉工作流，不得改成獨立整頁 route；工作台主畫面只保留 `過濾器` 按鈕，點開 popover 後才選看板並調同看板過濾器，讓使用者看板一個一個設定。Popover 內看板欄只切換正在設定哪個看板的過濾器；`所有任務排序` 目標是跨所有可見看板顯示，依各任務所屬看板套用該看板 filter state；看板 selector 不得與過濾器按鈕並列常駐在主畫面，也不得被當成來源範圍。`未歸位` 與 `已歸位看板` 是 placement lanes，不是過濾器或任務狀態；未歸位任務與已歸位任務功能等價且可雙向拖移，Phase 1B 已通過本機自動化 QC。Phase 1C 已完成實作與本機自動化 QC：同看板同條件下，看板與工作台必須以同一組 `matchedTaskIds` 作為結果真相；看板的祖先欄位 / 卡片可作 context-only container，工作台不得列為符合結果。Phase 2 cross-board source slice 已完成：`所有任務排序` 不再只取 active board，刪除 task / archived ancestor descendant 不得殘留；依 HCS `1C` 決策，`group/list` 容器預設不顯示但可由 `列表 / 群組` 顯示設定切換，missing-parent orphan 永遠不得當成有效任務；依使用者 UI 決策，任務台清單採密集文字列，移除不必要圖示、拖曳把手、大卡片、陰影與日期 chip，只保留文字資訊，並以縮排/字重/灰階提示 hierarchy depth；`未歸位` 與 `所有任務排序` 是 sticky section headers，不得被任務列捲動隱藏；collapsed rail 使用 `ChevronRight`，expanded collapse button 使用 `ChevronLeft`，不得回到 Notebook/clipboard/PanelLeftClose 類圖示卡片。Phase 2A 已完成工作台任務列 row-root drag surface parity 與 shared right-click menu，未改 sensor 或手機手勢。visible partial/error summary UI、RPC/RLS/migration、production deploy、正式資料修復仍需另行授權。profile、設定檔、儲存、另存、複製、全域/看板專屬 profile 已取消，不得回流到本 DEV。正式環境發布 / production release 未執行，仍需使用者明確 deployment authorization 與 deployment-release-gate。

## Documentation Map Update - 2026-06-29

### DEV-038: 設定中心作用範圍一致性與高風險防呆

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-038-settings-scope-consistency-and-risk-guardrails.md` | Production Release Deployed / Local + Production Smoke Passed / DB unchanged | DEV-038 / DEV-036 / DEV-037 | 定義並已實作設定中心共同作用範圍 taxonomy，將目前看板、目前工作區、全域快照、外部連結、此裝置/目前帳號分清楚；特別處理備份全域匯出、目前看板匯入、目前看板回收桶與快速開啟的範圍語意；已發布 production。 |
| `ai-doc/qa/QA-DEV-038-settings-scope-consistency-and-risk-guardrails.md` | Production Release Deployed / Local + Production Smoke Passed / DB unchanged | DEV-038 | 驗證計畫與證據涵蓋 Settings header、section scope summary、匯入前確認、目前看板回收桶清空確認、看板權限 target、快速開啟裝置/帳號範圍、mobile viewport、regression gates 與 production release evidence。 |
| `ai-doc/qc/QC-DEV-038-settings-scope-consistency-and-risk-guardrails.md` | Production Release Deployed / Local + Production QC Passed / DB unchanged | DEV-038 | 記錄 DEV-038 static/browser/regression/TypeScript/build gates 與 production artifact/browser/auth smoke，並標示 DEV-037 source-scope Edge/DB contract 尚未執行。 |

PM 治理註記：DEV-038 是設定中心的橫向 IA 修正，優先保護高風險資料操作。本輪已完成本機 RD + QC 與 Firebase Hosting production release，未修改資料格式、DB schema、RLS 或 migration。DEV-037 繼續處理行事曆訂閱的資料來源契約；DEV-038 不重複其 Edge Function / DB validation 範圍。

### DEV-037: 行事曆訂閱來源範圍清晰化

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-037-calendar-subscription-source-scope-clarity.md` | Implemented / Local Automated QC Passed / DB Deploy Pending / Production Not Deployed | DEV-037 / DEV-036 | 定義並已本機實作行事曆訂閱來源範圍模型，將 `目前看板`、`工作區全部看板`、`自訂範圍` 與 `來源 / 條件` summary 分清楚；filters 已支援 `scope_type` / `project_ids`，Edge Function 原始碼與 DB validation migration 已限制 Board scope 不外溢。 |
| `ai-doc/qa/QA-DEV-037-calendar-subscription-source-scope-clarity.md` | Implemented / Local Automated QC Passed / Supabase Live QC Pending | DEV-037 | 驗證計畫涵蓋 UI source summary、legacy subscription、Board scope ICS feed、Workspace scope 權限、DB validation、Edge Function、mobile viewport 與 Settings/Workspace regression gates；本輪完成 local automated gates，live Supabase DB/feed smoke 待 deploy gate。 |
| `ai-doc/qc/QC-DEV-037-calendar-subscription-source-scope-clarity.md` | Local Automated QC Passed / DB Deploy Pending / Production Not Deployed | DEV-037 | 記錄 DEV-037 static/browser/ICS/regression/TypeScript/build:test gates；明確標示 migration 未 apply、Edge Function 未 deploy、真 Supabase feed smoke 未執行。 |

PM 治理註記：DEV-037 是 DEV-036 Trello-like Workspace 模型在行事曆訂閱功能上的語意落地。本輪已完成本機 RD/QC 與 migration/function source，未套用遠端資料庫、未部署 Edge Function、未做 production smoke；正式啟用需另走 deployment-release-gate / Supabase gate。

### DEV-036: Trello-like Workspace Governance

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-036-trello-like-workspace-governance.md` | Accepted | DEV-036 | 記錄採用 Trello-like Workspace 模型的架構決策：Workspace 是可新增的多 Board 治理容器，不限制為「我的工作區 / 共用工作區」兩筆固定資料；Board sharing 不等於 Board moving。 |
| `ai-doc/specs/SPEC-036-trello-like-workspace-governance.md` | Implemented / Local Automated QC Passed / DB unchanged | DEV-036 | 定義 DEV-036 End-State Architecture、Phase Roadmap、Fixed/Deferred Decisions、Phase 1 Workspace Create / Navigation MVP、Sidebar `+` 入口、backend-success-first create、First-run `我的工作區` 與 RD exit gate；Phase 1 已實作並通過本機自動化 QC。 |
| `ai-doc/qa/QA-DEV-036-trello-like-workspace-governance.md` | Local Automated QC Passed | DEV-036 | 驗證 Trello-like Workspace 治理模型，涵蓋多 Workspace 建立、create failure no-ghost、reload persistence、Board 建立/分享/搬移、Sidebar/Home 文案、mobile viewport 與回歸 gate。 |
| `ai-doc/qc/QC-DEV-036-trello-like-workspace-governance.md` | Local Automated QC Passed / DB unchanged | DEV-036 | 記錄 DEV-036 static、browser、DEV-035/030/025/026 regression、TypeScript、build 與 mobile 截圖證據；明確標示本 Phase 未新增 migration、RLS、billing 或 production deployment。 |

PM 治理註記：DEV-036 取代「只做我的工作區 / 共用工作區兩項」的舊方向。新方向是 UI 與資料模型均保留多 Workspace 能力；「我的 / 共用」若保留，只能作為 filter/view，不是固定資料容器。2026-06-29 HCS 引導決策已採 `1A / 2A / 3A`：Sidebar 工作區標題列 `+` 入口、Workspace create backend-success-first、First-run 建立 `我的工作區` 並允許後續多 Workspace。Phase 1 已實作 UI / store / local-test 驗證，不含 DB migration、RLS 或 production。

### DEV-035: 工作區刪除持久化修正

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-035-workspace-delete-persistence-fix.md` | Implemented / Local Automated QC Passed / Supabase DB Role QC Passed / Production Not Deployed | DEV-035 | 定義工作區刪除後重新整理又出現的根因與修正方案：Supabase owner-only delete RPC、前端後端成功後才移除 UI、失敗 toast、active workspace/board/localStorage cleanup；2026-07-06 補 production Supabase DB role QC。 |
| `ai-doc/qa/QA-DEV-035-workspace-delete-persistence-fix.md` | Local Automated QC Passed / Supabase DB Role QC Passed / Production Not Deployed | DEV-035 | 驗證計畫涵蓋 static contract、local-test browser reload persistence、active workspace cleanup、Supabase owner/admin/member/viewer/outsider DB QC、failure-mode 與 regression gates；DB role matrix 已通過。 |
| `ai-doc/qc/QC-DEV-035-workspace-delete-persistence-fix.md` | Local Automated QC Passed / Supabase DB Role QC Passed / Production Not Deployed | DEV-035 | 記錄 DEV-035 static、browser、TypeScript、build、core regression、DEV-030 context menu regression、mobile 截圖與 production Supabase rollback-only DB role QC；另記錄 migration history drift 未覆寫 function。 |

PM 治理註記：DEV-035 是 P0 data consistency bug 交付點。此任務不重做工作區分組 UI、不新增回收桶；重點是把刪除成功定義改回「後端持久化成功」，並讓失敗可見。2026-07-06 已完成 target production Supabase DB role QC；production front-end release 仍需另行授權。

### SPEC-034: App 快速啟動、PWA 更新與加入主畫面指引 UX

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md` | Done / Browser QC Passed / Local-first scope / QuickCaptureShell Retired | DEV-034 | 彙整本對話中對 App 開啟等待、出差臨時快記、PWA 自動更新、加入主畫面指引過於複雜的分析與開發方案；目前保留 PWA 安裝助理、設定頁快速開啟入口與本機 pending InboxItem queue；AuthGate 外 QuickCaptureShell 已由 DEV-039 全域任務平台 `未歸位` lane 取代。 |
| `ai-doc/qc/QC-DEV-034-fast-start-pwa-install-guidance.md` | Browser QC Passed | DEV-034 | 記錄 DEV-034 static、browser、TypeScript、lint、build 與截圖證據；明確排除正式雲端 Inbox、跨裝置同步與轉正式任務。 |

PM 治理註記：使用者已要求 `pm-dev 執行開發`，SPEC-034 提升為 `DEV-034 [交付點] App 快速啟動與加入主畫面 UX`。本輪安裝引導已通過 Browser QC；右下角 QuickCaptureShell 浮窗已退役，local-first pending queue 僅作全域任務平台未歸位資料來源。正式雲端 Inbox、跨裝置同步、今日區塊與轉正式任務不在本輪宣告完成，接 SPEC-002 後續交付。

## Documentation Map Update - 2026-06-26

### DEV-028: 四模式一致的 Trello-like 任務操作契約

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Implemented / 2026-07-05 Addendum Supersedes Rename Contract | DEV-028 | 定義清單、心智圖、看板、甘特四模式共用任務操作契約：單擊 = 選取 + 開詳情、保留 `TaskDetailsModal`、右鍵/長按任務選單、保留看板 Level 3+ 正面顯示與卡片資訊密度。2026-07-05 addendum 已取代舊版外層 rename / 直接打字命名契約，任務名稱只能在詳情頁 title edit。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | QA Plan Updated / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 | 定義 DEV-028 Zero-Tolerance failures、四模式手動驗證矩陣、自動化 gate、MAN-028 人工親自點擊測試矩陣、ESC 關閉最上層暫時性 UI 與 QC handoff evidence；2026-07-06 已完成外層 rename 移除與詳情頁 title edit 自動化驗證，2026-07-07 已補 manual readiness gate，2026-07-09 使用者回報人工親自點擊 QC 通過。 |

DEV-028 已依 HCS 引導決策 1A / 2C / 3A / 4A / 5A / 6A 實作：快捷鍵採模式優先、右鍵/長按統一任務選單、單擊既有任務先選取再開詳情、保留 `TaskDetailsModal`、選取視覺採最小 highlight / ring。2026-07-05 使用者追加決策已取代 2C 與 explicit rename 相關契約：新增任務命名與既有任務改名都不得使用外層 rename，需進入詳情頁 title edit。2026-07-06 已完成 RD implementation 與本機 automated QC；使用者後續要求補人工親自點擊操作驗證，QA-DEV-028 已新增 MAN-028-001 至 MAN-028-028，2026-07-07 已補 `verify:dev-028-manual-click-qc-readiness` 保護 checklist 與 evidence boundary，2026-07-09 使用者回報人工親自點擊 QC 通過；production deploy 仍需另行授權。

## Documentation Map Update - 2026-06-19

### DEV-027F: Mind map UI polish after relationship-line QC

| Document | Status | DEV | Purpose |
|---|---|---|---|
| `ai-doc/qc/QC-DEV-027F-mindmap-ui-polish.md` | Browser QC Passed | DEV-027F | Records UI failures, fixes, screenshot evidence, and browser gate for viewport-safe relationship-line UI polish. |

### DEV-027E: Xmind-like note relationship line UX parity

2026-06-19 completion map:

| Document | Status | DEV | Purpose |
|---|---|---|---|
| `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md` | Implemented | DEV-027E | Defines Xmind-like note relationship line parity scope and non-goals. |
| `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Executed | DEV-027E | Defines strict UI verification matrix for inline edit, endpoints, control points, style, shortcut, right-click, and zoom. |
| `ai-doc/qc/QC-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Browser QC Passed | DEV-027E | Records static/browser/type/lint/build/regression evidence. |

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md` | Implemented / Browser QC Passed | DEV-027E | 定義並已落地 ProJED 筆記型關聯線與 Xmind Relationship 的 UI/UX parity、資料延伸與 RD exit gate |
| `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Browser QC Passed | DEV-027E | 驗證關聯線本體選取、inline label edit、endpoint/control point 拖曳、樣式控制、快捷鍵與 zoom 穩定性 |

### DEV-027D: Mind map date display and existing filter integration

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027D-mindmap-date-display-filter.md` | Implemented / Browser QC Passed | DEV-027D | 心智圖日期顯示與既有 WBS filter 串接規格，定義 `showStartDate`、date badge metadata、root/child visibility 規則 |
| `ai-doc/qa/QA-DEV-027D-mindmap-date-display-filter.md` | Browser QC Passed | DEV-027D | QA 驗證矩陣，包含 UI bounds、開始日期開關、到期篩選、狀態篩選、負責人篩選與標籤 wiring |
| `ai-doc/qc/QC-DEV-027D-mindmap-date-display-filter.md` | Browser QC Passed | DEV-027D | QC 執行證據入口，記錄 static/browser/type/lint/build/regression gates |

### DEV-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview polish

最新文件修訂（2026-06-19）：
- `SPEC-027B`、`QA-DEV-027B`、`QC-DEV-027B` 已改以 selection-first keyboard UX 為準。
- 新增任務後只選取，不立即進入編輯；原本直接打字改名的任務名稱契約已被 DEV-028 2026-07-05 addendum 覆蓋，WBS 任務名稱需改走詳情頁 title edit。
- 自動化驗證需覆蓋方向鍵選取、連續 `Enter` / `Tab` 新增、zoom、tidy connector 與 drag insertion preview。

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md` | Implemented / Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027B | 定義心智圖模式下一輪 Xmind-like polish：`Enter` 在目前任務下方新增同階任務、可縮放高解析畫布、shared trunk / bracket 整齊 connector、拖曳中明確 insertion placeholder / connector preview / ghost node；舊直接打字外層改名契約已由 DEV-028 覆寫。 |
| `ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md` | Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027B | 定義 DEV-027B 嚴格 UI 驗證計畫，包含 keyboard insertion order、zoom clarity / hit-test、tidy connector topology、drag insertion preview fidelity、desktop/laptop/mobile 截圖、DEV-027A regression gates 與 detail-only 命名覆寫。 |
| `ai-doc/qc/QC-DEV-027B-xmind-interaction-polish.md` | Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027B | 記錄 DEV-027B 事實驗證：Enter insert-after-selected、zoom controls / endpoint alignment、parent + 5 children tidy bracket、drag insertion preview fidelity、mobile zoom、DEV-027A regression gates；外層改名已由 DEV-028 QC 覆蓋。 |

DEV-027B 是 DEV-027 的支援開發點，承接使用者 2026-06-19 補充截圖與需求；不新增資料模型、不做 Xmind 匯入/匯出、不做 style panel。已落地 `Enter` insert-after-selected、zoom state / controls、parent-group bracket connector renderer 與 drag insertion preview，並補 `verify:dev-027b-xmind-interaction-polish`、`verify:dev-027b-xmind-interaction-polish-browser`。

## Documentation Map Update - 2026-06-18

### DEV-027: Xmind-like 心智圖模式

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md` | Implemented / Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027 | 定義 ProJED 新增 `心智圖` 模式：active board title 作為中心主題、WBS 任務作為分支、節點只顯示任務名稱、核心 Xmind-like 鍵盤與拖曳操作、直接共用既有 WBS 任務資料；2026-07-06 已加註 DEV-028 detail-only title edit 覆寫外層 rename。 |
| `ai-doc/qa/QA-DEV-027-xmind-like-mind-map-mode.md` | Browser QC Passed / UI Reopen Addendum / DEV-028 Detail-Only Alignment | DEV-027 | 定義並記錄心智圖入口、中心主題、分支顯示、Enter/Tab/Delete、詳情頁 title input 命名、展開/收合、拖曳階層、權限、跨視圖同步與 viewport 驗證；已加註 connector line、drag interaction UI reopen 與 detail-only 命名覆寫。 |
| `ai-doc/qc/QC-DEV-027-xmind-like-mind-map-mode.md` | Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027 | 記錄 DEV-027 static gates、Playwright browser QC、detail-only title input alignment、drag hierarchy、cycle guard、viewer read-only、desktop/mobile viewport 與 visible error sweep。 |
| `ai-doc/qa/QA-DEV-027A-xmind-connector-line-visual-validation.md` | Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027A | 針對使用者截圖揭露的 branch connector line 斷裂問題，以及新增的 Xmind-like 拖曳即時預覽動畫與同側拖放需求，定義 Xmind UI 參考、失效判定、acceptance criteria、manual UI matrix、自動化 geometry / drag verifier 要求與 QC handoff gate；視覺互動矩陣已移除外層 F2 rename 暗示。 |
| `ai-doc/qc/QC-DEV-027A-xmind-connector-drag-ui.md` | Browser QC Passed | DEV-027A | 記錄 connector endpoint 幾何驗證、orphan segment 檢查、node overlap 檢查、drag preview movement、same-side root drop、side persistence、desktop/laptop/mobile screenshot 與 final regression gates。 |

DEV-027 的核心決策來自 HCS 引導模式 `1A 2B 3A`：第一版做核心心智圖 MVP；視覺布局與互動高度接近 Xmind 類產品，但避免一比一複製品牌細節；心智圖模式完全共用現有 WBS 任務資料，所有新增、命名、刪除與拖曳階層都直接更新任務。DEV-028 後命名入口統一為 `TaskDetailsModal` title input，外層 `data-mindmap-title-input` 不得回復。已補 `verify:dev-027-xmind-like-mind-map-mode`、`verify:dev-027-xmind-like-mind-map-browser`、`verify:dev-027-xmind-connector-lines-browser` 與 `verify:dev-027-xmind-drag-preview-browser`，並完成 owner drag/cycle/mobile smoke、viewer read-only browser QC、connector geometry QC、drag preview / same-side persistence QC。

### DEV-026: Trello-like 看板分享體驗

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md` | Implemented / Browser Smoke Passed | DEV-026 | 定義看板右上角 `分享` 入口、Trello-like `分享看板` modal、email invite、複製連結、pending invite、看板成員與設定頁權限矩陣降層；RD 已落地 topbar 入口、modal 與 settings split。 |
| `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md` | Static + Browser Smoke Passed / DB Smoke Pending | DEV-026 | 定義並記錄 DEV-026 browser flow、權限不足、pending invite、設定頁保留與 viewport 驗證；desktop 與 390x844 mobile smoke 已通過，service-role DB smoke 未啟用。 |

DEV-026 的核心決策是保留既有 `board_invites` 與 RLS/audit 資料層，把重點放在 Trello 使用者熟悉的主畫面分享入口與單一任務 modal；role permission matrix 留在設定頁。已補 `verify:dev-026-trello-like-board-share-ui`，並修正 mobile topbar 中 filter control 覆蓋分享按鈕的 hit-target 問題。

### DEV-025: 受控跨工作區移動專案

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md` | Implemented / DB Read-only Preflight Passed / Fixture + Execution Readiness Gates Added / Guarded Mutating Executor Added / Mutating QC Pending | DEV-025 | 定義專案/看板跨工作區受控搬移方案，包含效用理論決策、權限條件、preflight preview、Supabase RPC、資料表搬移範圍、audit/RAG 風險控制與驗收條件。RD 已落地 migration、service/store、UI 入口、安全 fixture readiness gate 與 guarded mutating executor。 |
| `ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md` | Static QA Done / DB Read-only Preflight Passed / Fixture + Execution Readiness Gates Added / Guarded Mutating Executor Added / Mutating QC Pending | DEV-025 | 定義 DEV-025 QA 驗證矩陣，包含權限、preflight、成功搬移、交易原子性、RLS、UI/UX 與 QC 事實驗證。靜態 verifier、TypeScript 與 build 已通過；正式 DB read-only preflight 已確認 RPC / grants / constraints 存在，且新增 fixture-readiness gate 與 guarded executor 防止誤搬真實資料；mutating role-data QC 仍待安全 fixture。 |
| `ai-doc/qc/QC-DEV-025-controlled-project-workspace-transfer.md` | DB Read-only Preflight Passed / Fixture Readiness Harness Added / Execution Readiness Static Gate Added / Guarded Mutating Executor Added / Mutating Role-Data QC Pending | DEV-025 | 記錄 production Supabase read-only evidence：RPC exists、anon denied、authenticated/service_role allowed、constraints exist、RPC contains permission / lock / audit / RAG / invite revoke coverage；新增 `verify:dev-025-mutating-qc-fixture-readiness` read-only harness、`verify:dev-025-mutating-qc-readiness` 與 `verify:dev-025-mutating-qc-execution` guarded mutating executor；未執行 production move。 |

DEV-025 的核心決策是採用「受控搬移」，不採用自由拖拉或複製。已新增 `preview_project_workspace_transfer` / `move_project_to_workspace` RPC、前端 preview/confirm flow、local-test fallback、`verify:dev-025-project-workspace-transfer`、read-only `verify:dev-025-mutating-qc-fixture-readiness` 與 guarded mutating executor `verify:dev-025-mutating-qc-execution`。2026-07-07 確認正式 DB 已有 RPC/grants/constraints；下一步是安全 fixture 上先跑 fixture readiness / executor self-check，再做實際搬移 QC。

## Documentation Map Update - 2026-06-15

### DEV-024: AI整理保留手寫內容與章節結構

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md` | Implemented / Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 / DEV-011 / DEV-012 / DEV-020 | 定義並落地 `AI整理` 必須保留使用者手寫內容、自訂章節、task mention 與 project change evidence；已新增 deterministic human-draft merge guard、browser ROT verifier 與 production fixture smoke，不只靠 prompt。 |
| `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md` | Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 / DEV-021 / DEV-022 | 驗證手寫段落、自訂章節、任務 mention、專案變化匯入、idempotent、fallback placement；本機 deterministic verifier、browser ROT、regression gate 與 production UI smoke 已通過。 |
| `ai-doc/qc/QC-DEV-024-ai-synthesis-preserve-human-draft.md` | Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 / DEV-021 / DEV-022 / DEV-011 / DEV-012 | 記錄 DEV-024 helper、store writeback、tooltip、DEV-024 browser ROT、DEV-024/021/022/011/012 verifier、TypeScript、build 與 `verify:dev-024-production-ui-smoke` evidence；`DEV024_ALLOW_PRODUCTION_FIXTURE=1` 實跑後 `published_record_found=true`、cleanup `tenantDeleted=true`、`userDeleted=true`。 |

DEV-024 將 DEV-021 / DEV-022 的保護範圍，從 project change evidence 延伸到使用者已輸入的 human draft content；本輪已完成本機 deterministic helper、store writeback、deterministic verifier、local browser ROT 與 production UI smoke，且不新增資料庫 schema，也不改 record content persistence 格式。本輪未重新 production deploy，因目前正式 artifact 已含 DEV-024 實作；殘留風險限於模型格式 polish。

### DEV-023: 專案變化匯入整併為紀錄流程第一步

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md` | Implemented / Browser QC Passed | DEV-023 / DEV-020 | 定義將 `先匯入專案變化` 整併為會議與個人紀錄流程第一步，預設收合，點擊 `匯入` 後才展開設定；目前已通過 DEV-020/021/022/023 自動化與 browser QC。 |
| `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md` | Browser QC Passed | DEV-023 / DEV-020 | 驗證會議與個人流程都有 `匯入` 第一格、獨立大型匯入卡片移除、展開面板、插入/跳過/empty/error 與 viewport。 |
| `ai-doc/qc/QC-DEV-023-record-project-change-import-workflow-step.md` | Browser QC Passed / DB unchanged | DEV-023 / DEV-020 | 記錄 DEV-023 static、DEV-020 browser、DEV-021 preserve、DEV-022 single-record 與 TypeScript 證據；本 DEV 不新增 DB schema 或 persistence 格式。 |
| `ai-doc/reports/PDCA-DEV-020-record-ui-simplification.md` | Superseded risk by DEV-023 | DEV-020 / DEV-023 | DEV-023 supersedes PDCA-DEV-020 中「專案變化匯入仍在流程上方」的殘留 UI 風險。 |

### DEV-022: 專案變化匯入後 AI整理同整成單一會議紀錄

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-022-project-change-single-record-integration.md` | Implemented | DEV-022 | 定義 project change evidence normalization、single-record merge guard 與 fallback evidence note。 |
| `ai-doc/qa/QA-DEV-022-project-change-single-record-integration.md` | Passed | DEV-022 | 驗證最終內容只有一組 `1/2/3` 主結構、marker 移除、taskLinks preserve 與 idempotent。 |
| `ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md` | Closed | DEV-022 / DEV-021 | 分析 DEV-021 preserve append 導致兩份會議內容的根因，已由 DEV-022 integrated synthesis guard 關閉。 |

### DEV-021: 專案變化匯入後 AI整理保留機制

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-021-project-change-ai-preserve.md` | Implemented | DEV-021 | 定義已匯入專案變化為受保護內容，AI整理不得丟失；已落實 deterministic merge guard 與 taskLinks 依 merged content 同步。 |
| `ai-doc/qa/QA-DEV-021-project-change-ai-preserve.md` | Passed | DEV-021 | 定義並通過匯入後 AI整理、存草稿/發布保存、preserve/idempotent、taskLinks 與 prompt-only regression 驗證。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Risk closed by DEV-021 | DEV-020 | DEV-020 未涵蓋 AI整理後保留匯入內容的缺口，已由 DEV-021 補齊。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Risk closed by DEV-021 | DEV-020 | DEV-020 QA 未涵蓋「匯入 -> AI整理 -> 存草稿/發布」保留驗證，已由 DEV-021 補齊。 |

## PDCA Update - 2026-06-15

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/reports/PDCA-DEV-020-record-ui-simplification.md` | Done | DEV-020 / DEV-019 / DEV-010 | 紀錄 UI 精簡 PDCA：統一 topbar `紀錄中`、將重複摘要 chip 改為 `sr-only` marker、更新靜態與 browser smoke 驗證。 |

## Documentation Map Update - 2026-06-11

### DEV-018 文件索引

| 文件 | 狀態 | 對應 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-018-meeting-record-guardrail-workflow-redesign.md` | Implemented | DEV-018 | 會議紀錄側欄四階段防呆工作流、AI整理動作化、直接發布語意與未儲存離開保護。 |
| `ai-doc/qa/QA-DEV-018-meeting-record-guardrail-workflow.md` | QC Covered | DEV-018 | 驗證空白草稿、直接發布、AI整理、AI 失敗、未儲存離開、已儲存離開、任務變更來源與 viewport。 |
| `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 補足紀錄類型與會議流程分層，避免 `會議紀錄 / 個人工作紀錄` 被誤解成流程步驟。 |
| `ai-doc/qa/QA-DEV-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 驗證一般紀錄模式、會議模式、個人工作紀錄狀態、離開與收合分離、viewport。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Implemented | DEV-020 | 重構紀錄功能為先選類型、匯入專案變化、撰寫、儲存或發布的完整工作流。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Passed | DEV-020 | 驗證看板主入口、專案變化匯入、未儲存防呆、功能說明與 viewport。 |

產品方向補充：

- DEV-018 supersedes DEV-010 的舊會議操作列期待；會議防呆入口以 `RecordSidebar` workflow 為主。
- DEV-018 supersedes DEV-011 / DEV-012 的「發布前必須 AI整理」假設；AI整理是建議動作，直接發布只保存目前編輯器內容。
- DEV-018 不變更資料模型與 RAG token，只重設會議紀錄 UX/UI workflow。
- DEV-019 clarifies DEV-018：`會議紀錄 / 個人工作紀錄` 是紀錄類型，`速記 / AI整理 / 校稿 / 發布` 才是會議模式流程。
- DEV-020 supersedes DEV-019 的局部補強：紀錄類型必須在開始撰寫前決定，並把專案變化匯入、功能說明與未儲存保護納入完整紀錄工作流。

更新日期：2026-06-11

## Active PM 文件

| 文件 | 狀態 | 用途 |
|---|---|---|
| `ai-doc/backlog.md` | Active | PM backlog、交付點與後續候選範圍。 |
| `ai-doc/dev_task.md` | Active | DEV 任務主控板，只保留狀態、下一步、阻塞與驗證證據索引。 |
| `ai-doc/documentation_map.md` | Active | 文件索引與目前交付邊界。 |

## Archived PM 文件

| 文件 | 狀態 | 用途 |
|---|---|---|
| `ai-doc/archived/dev_task_2026-06-09_before_restructure.md` | Archived | 2026-06-09 重整前的完整 dev_task 長版內容；保留歷史細節與舊 RD/QA/QC 紀錄。 |

## Active 規格文件

| 文件 | 狀態 | 對應 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-001-unified-compact-ui-system.md` | Done reference | DEV-001 | 統一 compact UI 系統規格。 |
| `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` | Draft | 未分配 | Whole-person todo / inbox 類功能草案；目前未列入 active 交付點。 |
| `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md` | Implemented / DEV-002 Done Source Spec | DEV-002 | 會議紀錄與個人工作紀錄工作流設計；保留為 DEV-002 主要需求來源與後續 refinements 的 historical source spec，不代表仍有未完成 RD 範圍。 |
| `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` | Implemented | DEV-005 | 會議看板主畫面紀錄工作流；承接 DEV-002 / DEV-003 的 UX refinement。 |
| `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` | Implemented | DEV-006 | Gmail-like 會議紀錄輸入器穩定化；承接 DEV-003 / DEV-005 的 editor UX refinement。 |
| `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` | Implemented | DEV-007 | 會議中保留原生看板編輯，並將任務變更納入會議紀錄。 |
| `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` | Implemented | DEV-008 | 任務詳情中的會議細節快速查找；承接 DEV-002 / DEV-007 的 task knowledge UX refinement。 |
| `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` | Implemented | DEV-009 | 會議模式下任務詳情內快速補記；承接 DEV-005 / DEV-007 / DEV-008 的 meeting workflow UX refinement。 |
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Implemented | DEV-010 | 會議紀錄操作按鈕狀態溝通設計；承接 DEV-005 / DEV-006 / DEV-007 / DEV-009 的 meeting workflow UX refinement。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-011 | AI 任務導向會議紀錄統整工作流；承接 DEV-007 / DEV-008 / DEV-009 / DEV-010 的 meeting record synthesis refinement；hotfix `7704e2f` 已部署，production fixture smoke 與 DB proof 通過。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-012 | AI 會議紀錄自然語言品質提升；承接 DEV-011 / DEV-008 的 meeting record synthesis quality refinement；hotfix `7704e2f` 已部署，production fixture smoke 與 DB proof 通過。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` | Implemented | DEV-013 | 定義右鍵清單任務複製，包含子任務欄位與子樹內部依賴複製。 |
| `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 定義紀錄類型層、會議流程層與個人工作紀錄簡單狀態。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Implemented | DEV-020 | 定義紀錄功能重構、專案變化匯入、功能說明、dirty guard 與 RD/QA/QC 邊界。 |
| `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md` | Implemented / Browser QC Passed | DEV-023 | 定義專案變化匯入整併為會議與個人紀錄流程第一步；父交付點 DEV-020。 |
| `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md` | Implemented / Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 | 定義並落地 AI整理保留手寫內容與章節結構；父交付點 DEV-011 / DEV-012 / DEV-020；production fixture smoke `verify:dev-024-production-ui-smoke` passed。 |
| `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md` | Implemented / Browser Smoke Passed | DEV-026 | 定義 Trello-like 看板分享入口、分享 modal 與邀請流程 UI/UX。 |
| `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md` | Implemented / Static + Browser Smoke Passed / DEV-028 Detail-Only Alignment | DEV-027 | 定義 Xmind-like 心智圖模式，讓 WBS 任務以心智圖分支呈現並可用鍵盤與拖曳編輯；任務命名已依 DEV-028 統一到 `TaskDetailsModal` title input，外層 `data-mindmap-title-input` 不得回復。 |
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Implemented / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed / Production Not Deployed | DEV-028 | 定義清單、心智圖、看板、甘特四模式一致的 Trello-like 任務操作契約；detail-only title edit 與 manual readiness gate 已完成自動化驗證，2026-07-09 使用者回報 MAN-028 人工親自點擊 QC 通過；production deploy 未執行。 |
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Phase 1 + Phase 1B Implemented / Local Automated QA Passed / Production Not Deployed / Physical Phone Supplemental Not Executed / Canvas CTA Pass-Through Covered | DEV-029 | 定義手機 BoardView / Kanban / TaskWorkbench pan-first 觸控仲裁，手機 task surface、拖曳把手與大型新增 CTA 短滑不誤開詳情且可 pan，無位移 tap 仍開詳情或執行新增；Phase 1B compact action rail、長按拖放、edge auto-scroll 與 cancel/blur/Escape/timeout 防卡死已完成本機 QA，production 與真機 supplemental 未執行。 |
| `ai-doc/specs/SPEC-051-kanban-cross-parent-drag-lock.md` | Implemented / Local Automated QA + Browser UI QC Passed / Production Not Deployed | DEV-051 / DEV-046 / DEV-029 | 定義並落地同父層即時排序、跨父層 750ms lock、empty/collapsed child lane、locked before/after/append、filter canonical order、桌機/手機共用 resolver、commit/undo 與取消安全。 |
| `ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md` | Archived / Historical / Do Not Execute | DEV-052 / DEV-051 / DEV-046 / DEV-029 | 歷史 targeted drag subsystem refactor 提案；依賴已撤回的 DEV-051 baseline，不得直接實作。 |
| `ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md` | Done / Browser QC Passed / Local-first scope / QuickCaptureShell Retired | DEV-034 | 定義 App 快速啟動、PWA 自動更新、加入主畫面平台分流指引與本機 pending InboxItem queue；QuickCaptureShell 已退役並由 DEV-039 全域任務平台 `未歸位` lane 取代；正式雲端 Inbox、跨裝置同步與轉正式任務接 SPEC-002 後續。 |

## 目前交付邊界

目前 active 產品交付點：

- DEV-002：會議紀錄與個人工作紀錄 MVP。
- DEV-005：會議看板主畫面紀錄工作流。
- DEV-006：Gmail-like 會議紀錄輸入器穩定化。
- DEV-007：會議中原生看板編輯與任務變更紀錄。
- DEV-008：任務會議細節快速查找。
- DEV-009：會議模式任務詳情內快速補記。
- DEV-010：會議紀錄操作按鈕狀態溝通設計。
- DEV-011：AI 任務導向會議紀錄統整工作流。
- DEV-012：AI 會議紀錄自然語言品質提升。
- DEV-013：右鍵清單任務複製，包含子任務與子樹內部依賴。
- DEV-020：紀錄功能重構與專案變化匯入流程。
- DEV-025：受控跨工作區移動專案。
- DEV-026：Trello-like 看板分享體驗。
- DEV-027：Xmind-like 心智圖模式。
- DEV-028：四模式一致的 Trello-like 任務操作契約。
- DEV-029：手機 Pan-First 觸控手勢仲裁與 compact action rail。
- DEV-034：App 快速啟動與加入主畫面 UX。
- DEV-035：工作區刪除持久化修正。
- DEV-036：Trello-like Workspace Governance。
- DEV-037：行事曆訂閱來源範圍清晰化。
- DEV-038：設定中心作用範圍一致性與高風險防呆。
- DEV-039：任務過濾器核心與全域任務平台兩欄篩選重構。
- DEV-040：正式環境同型 BUG 風險硬化與驗證。
- DEV-041：PWA 更新通知與快取恢復。
- DEV-042：手機左側欄收疊零佔寬與全域任務平台 Off-Canvas。
- DEV-044：上一步復原範圍擴充與低資料庫成本治理。
- DEV-045：行事曆訂閱篩選器建構器與即時預覽。
- DEV-046：全任務表面拖曳一致化與拖曳把手退役。

DEV-002 的產品邊界：

- 建立紀錄資料模型與任務關聯。
- 建立右側可收疊紀錄填寫欄。
- 建立看板式任務選取器。
- 建立紀錄列表與任務詳情頁紀錄時間軸。
- 建立紀錄到 RAG documents 的 indexing 基礎。

不包含：

- 語音逐字稿。
- AI 自動修改任務。
- 複雜審批。
- 完整部門級 BI 報表。

DEV-005 的產品邊界：

- 將會議中的主畫面固定為 active board 的 `board` view。
- 建立會議狀態列與會議導向入口。
- 讓右側紀錄欄成為速記與任務連結輔助。
- 會議模式下點 Kanban card / checklist item 可插入 inline task tag。
- 保留 `RecordsView` 作為會後查閱與整理的紀錄庫。

不包含：

- 完整會議管理。
- AI 決議抽取或自動建立任務。
- 跨 board 會議。
- 多記錄者即時協作。
- 新增 migration 或變更紀錄資料格式。

DEV-006 的產品邊界：

- 以成熟 editor engine 修正會議紀錄內容輸入。
- 保留 `@[title](task:id)` 與 `record_task_links` 資料契約。
- 支援 task chip copy / cut / paste / move。
- 支援 Gmail-like 基本輸入肌肉記憶。

不包含：

- Gmail 富文字工具列。
- 新增 migration 或 editor JSON 後端格式。
- 多人即時協作。

DEV-007 的產品邊界：

- 會議模式不劫持看板卡片或 checklist 的主要點擊行為。
- 會議中看板維持一般編輯、拖曳、context menu 行為。
- 任務狀態、移動與關鍵變更在背景收集為 meeting activity。
- 儲存或發布時將 activity append 到會議紀錄內容。

不包含：

- 新增 meeting event table。
- 多人即時協作 event stream。
- AI 決議抽取。

DEV-008 的產品邊界：

- 任務詳情頁提供任務知識入口。
- 已關聯紀錄優先顯示目前任務的會議或工作紀錄片段。
- 任務內搜尋涵蓋任務備註、關聯紀錄片段與會議中任務變更。
- 點擊片段可回到原始紀錄。

不包含：

- AI 問答、語意搜尋或自動摘要。
- 新增資料表或修改紀錄資料格式。

DEV-009 的產品邊界：

- 會議模式下任務詳情顯示「本次會議」快速補記。
- 補記內容 append 到目前 meeting draft 的任務討論區塊。
- 自動插入目前任務 inline tag 並同步 task link。
- 保留任務詳情一般任務編輯功能。

不包含：

- 任務詳情內完整會議紀錄編輯器。
- AI 摘要或決議抽取。
- 新增資料模型。

DEV-010 的產品邊界：

- 會議模式狀態列需說明 `存草稿`、`發布`、`離開會議模式` 的差異。
- 按鈕不可操作時需揭露原因與下一步，不可只灰掉。
- `存草稿` 與 `發布` 需使用不同啟用條件。
- `BoardView` 與 `RecordSidebar` 共用同一套 action state 判斷。
- 離開會議模式需避免使用者誤以為已保存或已發布。

不包含：

- 手機版會議紀錄工作流。
- 新增資料模型或 migration。
- AI 摘要、完整會議管理或跨 board 會議。

DEV-011 的產品邊界：

- 會議紀錄發布前先由後端 AI 統整成任務導向草稿。
- AI 只更新 meeting draft content，不建立、修改、移動或刪除任務。
- 原始 meeting activity 僅作為 AI input source，不逐筆進入 published 正文。
- 人類必須校稿後再次發布。
- published 正文保留 `@[title](task:id)`，讓 DEV-008 任務知識查找可用。

不包含：

- 即時 AI 統整。
- 手機版會議紀錄工作流。
- 新增資料模型或 migration。
- 完整會議管理、跨 board 會議或多記錄者即時協作。

DEV-012 的產品邊界：

- 保留 DEV-011 的發布前 AI 統整流程。
- 保留三個大章節；任務段落以階層編號與 task tag 呈現，例如 `2.1 @[列表](task:id)`、`2.1.1 @[卡片](task:id)`、`2.1.1.1 @[子任務](task:id)`。
- 任務段落改成自然語言任務紀要，不使用五欄固定模板。
- 會議紀錄只整理 rawContent 與 meeting activity，不使用專案既有狀態補內容。
- `下一步` 只在會議速記或任務補記中明確出現行動時輸出。
- Edge Function 預設首選模型為 `gemini-3.5-flash`，並保留 env override；未設定 env override 且首選模型 unavailable 時，可受控 fallback 到 `gemini-3.1-flash-lite`，但 response 必須揭露 `warnings` 與實際 `model`。
- Golden samples verifier 檢查自然語言品質與 DEV-008 任務片段抽取相容性。

不包含：

- 新增資料模型或 migration。
- AI 自動修改任務。
- 即時 AI 統整。
- 手機版會議紀錄工作流。

## 建議 QA / QC 文件位置

DEV-002 已完成，未建立獨立 `QA-DEV-002` / `QC-DEV-002` 檔案；不得把下列歷史建議當成缺漏文件。

現有 DEV-002 evidence：

- `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md`
- `ai-doc/reports/PM-DEV-002-meeting-work-records-implementation.md`
- `ai-doc/archived/dev_task_2026-06-09_before_restructure.md`
- `verify:dev-002-records`

## 文件治理備註

- `SPEC-002` 目前為未追蹤新檔，且未綁定 active DEV；保留為草案，不納入 DEV-002 完成率。
- `SPEC-003` 是 DEV-002 的主要需求來源。
- 後續若要把 AI 全域分析做成獨立交付點，需先由使用者確認新增 DEV。

---

## PM Update - 2026-06-04

### Active Spec Addendum

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/specs/SPEC-004-record-content-inline-task-tags.md` | Implemented | DEV-003 / DEV-002 follow-up | 定義紀錄內容內嵌任務標籤 UX，讓看板選取的任務以 Codex-like tag 插入內容游標位置。 |
| `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` | Implemented | DEV-005 / DEV-002 follow-up / DEV-003 follow-up | 定義會議中以議題看板為主畫面、右側紀錄欄為輔助速記與任務連結的工作流。 |
| `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` | Implemented | DEV-006 / DEV-003 follow-up / DEV-005 follow-up | 定義 Gmail-like 會議紀錄輸入器與 task chip copy/cut/paste/move 行為。 |
| `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` | Implemented | DEV-007 / DEV-005 follow-up / DEV-006 follow-up | 定義會議中保留原生看板編輯，並把任務變更納入會議紀錄。 |
| `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` | Implemented | DEV-008 / DEV-002 follow-up / DEV-007 follow-up | 定義任務詳情中的任務知識查找、片段抽取與任務內搜尋。 |
| `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` | Implemented | DEV-009 / DEV-005 follow-up / DEV-008 follow-up | 定義會議模式任務詳情內快速補記與 meeting draft append 行為。 |
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Implemented | DEV-010 / DEV-005 follow-up / DEV-009 follow-up | 定義會議紀錄操作按鈕狀態、阻塞原因提示、草稿/發布條件拆分與離開保護。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-011 / DEV-007 follow-up / DEV-008 follow-up / DEV-009 follow-up | 定義 AI 任務導向會議紀錄統整、發布前校稿流程、後端模型執行與不改任務邊界；hotfix `7704e2f` 上線後 production fixture smoke 通過。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-012 / DEV-011 follow-up / DEV-008 follow-up | 定義 AI 會議紀錄自然語言品質、任務紀要格式、模型預設與 golden samples 驗證；hotfix `7704e2f` 上線後 production fixture smoke 通過。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` | Implemented | DEV-013 | 定義右鍵清單任務複製、任務子樹欄位保留、內部依賴 remap 與驗證邊界。 |

### Current Product Direction

- DEV-002 已交付會議/工作紀錄基礎設施與看板式任務選取。
- 下一個 UX refinement 是讓任務關聯成為撰寫流程的一部分。
- 從看板選取的任務要插入 `Content` 編輯器目前游標位置，並顯示為 inline task chip。
- `record_task_links` 仍作為 AI 分析使用的結構化 graph link；內容 tag 是使用者撰寫時的前景介面。
- DEV-005 進一步調整會議中的主視角：開會時應停留在議題看板，紀錄欄只作為輔助速記，不再讓紀錄庫頁成為會議主畫面。
- DEV-007 修正會議看板互動：會議中仍使用一般看板編輯，任務變更由背景 meeting activity 納入紀錄。
- DEV-010 補齊會議狀態列的溝通設計：按鈕不可操作時必須顯示原因與下一步，避免使用者只看到灰色按鈕。
- DEV-012 提升 AI 會議紀錄品質：保留任務導向與 task tag，但輸出改為自然語言任務紀要，且 AI 不補寫人類沒講過或沒做過的事。

### Delivery Reports

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/reports/PM-DEV-003-record-content-inline-task-tags-implementation.md` | Done | DEV-003 | DEV-003 交付範圍、驗證結果與殘留風險。 |
| `ai-doc/reports/PM-DEV-005-meeting-board-primary-workflow-implementation.md` | Done | DEV-005 | DEV-005 交付範圍、驗證結果與殘留風險。 |
| `ai-doc/reports/PM-DEV-006-gmail-like-record-editor-implementation.md` | Done | DEV-006 | DEV-006 editor engine、task chip clipboard、實際輸入測試與殘留風險。 |
| `ai-doc/reports/PM-DEV-007-meeting-activity-capture-implementation.md` | Done | DEV-007 | DEV-007 原生看板編輯保留、meeting activity 收集與驗證結果。 |
| `ai-doc/reports/PM-DEV-008-task-meeting-detail-lookup-implementation.md` | Done | DEV-008 | DEV-008 任務知識查找、片段抽取與驗證結果。 |
| `ai-doc/reports/PM-DEV-009-meeting-task-detail-quick-note-implementation.md` | Done | DEV-009 | DEV-009 任務詳情內會議快速補記、append 行為與驗證結果。 |

### QA Validation Plans

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/qa/QA-DEV-003-record-content-inline-task-tags-ux-validation.md` | Done / Static QC Covered | DEV-003 | 使用者視角 UX 驗證計畫，聚焦看板直接選任務、內容游標 inline tag、右側欄收合、重複 tag 與唯一關聯摘要。 |
| `ai-doc/qa/QA-DEV-006-gmail-like-record-editor.md` | Done / Browser Input QC Passed | DEV-006 | Gmail-like 實際輸入驗證計畫，包含多行、undo/redo、IME、task chip copy/cut/paste/move 與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-007-meeting-activity-capture.md` | Done / Static QC Covered | DEV-007 | 會議中看板原生編輯與任務變更自動納入紀錄的驗證計畫。 |
| `ai-doc/qa/QA-DEV-008-task-meeting-detail-lookup.md` | Done / Static QC Covered | DEV-008 | 任務會議細節快速查找驗證計畫，包含任務片段抽取、搜尋、fallback 與原始紀錄追溯。 |
| `ai-doc/qa/QA-DEV-009-meeting-task-detail-quick-note.md` | Passed by QC | DEV-009 | 會議模式任務詳情內快速補記驗證計畫，包含 meeting draft append、task tag 與資料邊界。 |
| `ai-doc/qa/QA-DEV-010-meeting-record-action-feedback.md` | Implemented | DEV-010 | 會議紀錄操作按鈕狀態溝通 UX 驗證計畫，包含 disabled reason、tooltip/focus、離開保護與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-011-ai-meeting-record-synthesis.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-011 | AI 任務導向會議紀錄統整 UX 驗證計畫，包含實際輸入、AI 失敗保留草稿、校稿發布、桌機/筆電 viewport、readiness gate、guarded executor self-check、hotfix `7704e2f` 與 production fixture smoke / DB proof。 |
| `ai-doc/qa/QA-DEV-012-ai-meeting-record-natural-language-quality.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-012 | AI 會議紀錄自然語言品質驗證計畫，包含 golden samples、實際輸入、模型不可用、任務知識查找相容性、readiness gate、guarded executor self-check、hotfix `7704e2f` 與 production fixture smoke / DB proof。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Passed | DEV-020 | 紀錄功能重構驗證計畫，包含看板主入口、專案變化匯入、未儲存防呆、功能說明與 viewport。 |
| `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md` | Browser QC Passed | DEV-023 | 驗證專案變化匯入作為紀錄流程第一步、預設收合、展開面板、插入/跳過與 DEV-021/022 回歸。 |
| `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md` | Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 | 驗證 AI整理不得覆蓋使用者手寫內容、章節結構、task mention 與 project change evidence；本機 verifier、local browser ROT 與 production UI smoke 已通過，`DEV024_ALLOW_PRODUCTION_FIXTURE=1` 實跑後 `published_record_found=true`、cleanup `tenantDeleted=true`、`userDeleted=true`。 |
| `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md` | Static + Browser Smoke Passed / DB Smoke Pending | DEV-026 | 驗證 Trello-like 分享入口、modal 邀請、複製連結、pending invite、成員 tab、權限不足與 viewport。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | QA Plan Updated / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 | 驗證四模式單擊選取並開詳情、任務名稱只在詳情頁 title edit、外層 rename 移除、新增任務命名導向詳情、右鍵/長按任務選單無重新命名、看板 Level 3+ 保留、甘特 drag/click 互斥、viewport、manual readiness gate 與 2026-07-09 使用者回報 MAN-028 人工親自點擊通過。 |
| `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QA Passed / Physical Phone Supplemental Not Executed / Phase 1B Hotfix Covered / B10-B12 Added | DEV-029 | 驗證手機 pan-first：任務卡、L2+ 子任務、欄位、工作台 row、手機拖曳把手與大型新增 CTA 短滑不誤開詳情且可 pan，L2+ pan 可推動 `scrollTop` / `scrollLeft`，無位移 tap 可開詳情或執行新增；Phase 1B 覆蓋 compact action rail、長按浮起、拖曳把手長按、touchcancel 退出不卡死、drop target、刪除確認與桌機右鍵不變驗證。 |
| `ai-doc/qa/QA-DEV-051-kanban-cross-parent-drag-lock.md` | QA Plan Updated / Local Automated QA + Browser UI QC Passed / Manual Real Operation Not Executed / Physical Phone Supplemental Not Executed | DEV-051 | 驗證 750ms/200ms/20px 邊界、1A/2A/3A、desktop/mobile、filter、cycle、雙 ancestor rollup、undo、stable selectors 與 DEV-029/039/044/046/048 回歸；新增 R01～R14 人工操作腳本。 |
| `ai-doc/archived/QA-DEV-052-kanban-drag-subsystem-refactor.md` | Archived / Historical / Not Executed | DEV-052 | 歷史驗證設計；因 DEV-052 已封存，不得作為目前 QA ready 或實作 gate。 |
| `ai-doc/qa/QA-DEV-040-production-environment-risk-validation.md` | QA Plan Complete / Local + P0 Addendum QC Executed / P0 Remote Read-only Preflight + Remote Readiness Static Gate Passed / Production Smoke Executed for Original BUG Flows / Extended Matrix Partially Covered | DEV-040 | 驗證正式環境同型 BUG 風險：dependencies 匯入、RAG timeout、看板 temp id、member/tag stale response、Google Calendar timeout、MindMap local-only 語意與 production smoke evidence；已完成原始 2 BUG production authenticated UI smoke、2026-07-06 P0 local addendum QC、2026-07-07 read-only preflight 與 remote-readiness static gate，延伸矩陣剩餘項需另行驗證。 |

### QC Fact Reports

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/qc/QC-DEV-009-meeting-task-detail-quick-note-ux.md` | Pass | DEV-009 | DEV-009 UX 驗證事實報告，確認桌機與筆電會議補記工作流通過。 |
| `ai-doc/qc/QC-DEV-011-012-production-ai-smoke.md` | Backend Pass / Production Release Deployed / Production UI Smoke Passed | DEV-011 / DEV-012 | 正式 Hosting 部署與 Edge Function AI smoke 事實報告；後端正式 AI 統整通過，hotfix `7704e2f` 已部署，production fixture smoke、DB proof 與 cleanup 均通過。 |
| `ai-doc/qc/QC-DEV-013-task-tree-duplicate-context-menu.md` | Pass | DEV-013 | DEV-013 右鍵任務複製事實驗證報告，確認子樹複製、內部依賴 remap、undo/redo 與 release gate 回歸通過。 |
| `ai-doc/qc/QC-DEV-024-ai-synthesis-preserve-human-draft.md` | Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 | DEV-024 AI整理保留手寫內容事實驗證報告，確認 helper、store writeback、tooltip、DEV-024 browser ROT、DEV-024/021/022/011/012 verifier、TypeScript、build 與 production fixture smoke 通過；`verify:dev-024-production-ui-smoke` passed。 |
| `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QC Passed / Physical Phone Supplemental Not Executed / Production Not Deployed / Hotfix Covered / Canvas CTA Pass-Through Covered | DEV-029 | DEV-029 手機 pan-first 觸控仲裁事實驗證，記錄 static 38/38、browser matrix 覆蓋 L2+ scroll displacement、手機拖曳把手短滑 pan、大型新增 CTA short-pan pass-through、把手長按、edge auto-scroll、touchcancel 退出不卡死、DEV-028 regression、TypeScript、build 與真機補充未執行邊界。 |
| `ai-doc/qc/QC-DEV-051-kanban-cross-parent-drag-lock.md` | Local Automated + Browser UI QC Passed / Production Not Deployed | DEV-051 | DEV-051 當時的事實驗證報告記錄 static 28/28、browser 6/6、desktop/mobile 截圖與相鄰回歸；後續 DEV-051 baseline 已擴充為 33/33 與 7-case matrix，見最新 SPEC／QA。 |
| `ai-doc/qc/QC-DEV-053-task-drag-muscle-memory-consistency.md` | Local Static + Browser + QA True Operation Gate Passed / Production Not Deployed | DEV-053 | 記錄 T01-T14 真實滑鼠／觸控操作、桌機核准 baseline、placed row no-drag、10-case DEV-053 browser、指定回歸、viewport 與 console/network evidence；physical phone supplemental 未執行。 |
