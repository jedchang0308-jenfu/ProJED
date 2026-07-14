# SPEC-047: 看板備份套件 V2 與交易式匯入

狀態: Phase 1 Implemented / Local Automated QA-QC Passed / Human Confirmed / Release Gate Required / Production Not Deployed
對應 DEV: DEV-047
父交付點: DEV-038
節點類型: 交付點
優先級: P0 資料完整性與破壞性匯入風險
是否計入產品交付完成: 是，完成後提供可實際回復的單看板備份與匯入能力
建立日期: 2026-07-14
最近更新: 2026-07-14

使用思考習慣: #批判思考、#設計思考、#溝通設計、#可驗證性

## Human Decision Brief

決策來源:
- 使用者指出目前「匯出全域快照」與「匯入至目前看板」不是同一套資料範圍與操作邏輯，要求提出優化方案後寫成開發文件。
- 本文件承接使用者對前一輪建議的採用，不以純文案修補取代資料契約修正。

已確認決策:
- 第一階段建立真正可 round-trip 的「單看板 Backup Package V2」。
- 匯入預設為「複製成新看板」，避免不必要的資料覆寫。
- 「取代目前看板內容」保留為進階高風險操作，必須通過相容性、權限、前置備份、並行衝突與交易式執行 gate。
- 舊版 `wbs-1.0 / 1.1 / 1.2 / 2.0 / unversioned` 檔案可被辨識與說明，但不得再直接攤平成目前看板。
- 設定中心頁籤改以「備份、還原與資料移轉」呈現；建立備份與匯入/還原使用同一個 scope -> inspect -> plan -> execute -> verify 心智模型。
- 建立備份 UI 可選「全部看板」，但仍逐張看板產生各自的 V2 單看板檔案；不得改成一個混合多看板 package。

Rejected options:
- 不只把兩張卡片改成相同視覺。現況的來源範圍、資料內容與寫入語意不同，視覺對稱會放大誤解。
- 不再把前端 Zustand 記憶體中的 WBS 子集合稱為「ProJED 全域快照」。
- 不允許舊 global/ambiguous 檔案直接寫入單一看板，因為會造成跨看板資料攤平、ID 衝突與錯誤關聯。
- 不沿用 `replaceAllByProject()` 的 delete-then-best-effort-upsert 流程；部分寫入成功不是可接受的還原結果。
- 第一階段不做工作區、帳號或整個 production 環境還原。

AI engineering assumptions:
- V2 使用 JSON 檔；checksum 提供完整性驗證，不等同加密。UI 必須提醒檔案可能包含任務內容與個人資料。
- 第一階段只支援 Supabase production-shaped backend 與 local-test adapter。Firebase backend 若沒有等價交易能力，只允許 inspect，不允許執行匯入。
- 初始安全上限為檔案 10 MiB、任務 10,000 筆、依賴 30,000 筆；常數集中管理，超過時阻擋並導向未來 server-side job，不做無上限瀏覽器匯入。
- V2 包含看板 metadata、全部 active/archived tasks、task detail notes、dependencies、被任務引用的 tag definitions；不包含工作區成員/權限、紀錄內容、附件、行事曆訂閱、audit/activity、RAG 衍生資料與其他看板。
- `replace_current_board` 只允許來源 `boardId` 等於目標 `boardId` 的同源還原；跨看板資料移轉一律使用 `copy_to_new_board`。

Re-entry triggers:
- 要把 Knowledge Records、attachments、calendar subscriptions、memberships 或 audit log 納入備份。
- 要支援整個工作區、帳號或跨環境 disaster recovery。
- 要支援加密備份、排程備份、server-side object storage 或超過 V2 browser limits 的大型匯入。
- 要讓不同來源看板直接覆寫目前看板，而不是複製成新看板。
- 要部署 migration / RPC / RLS 或發布 production。

## Problem Statement

DEV-038 已正確揭露現況是「匯出全域快照」對上「匯入至目前看板」，但刻意不改資料格式。這是已上線的過渡性風險提示，不是長期備份架構。

目前實作有下列系統性缺口:

| 位置 | 現況 | 風險 |
|---|---|---|
| `src/components/SettingsView.tsx` | `handleExport` 直接呼叫 store；選檔後以目前看板為目標 | UI 無法先說明檔案真實 scope、內容與衝突 |
| `src/store/useWbsStore.ts` | export 使用前端 `nodes/dependencies/tags/workspaces`；import 接受多個舊格式並改綁目前 workspace/board | 已載入/曾載入資料不等於全域 canonical data；跨看板資料可能被攤平 |
| `src/hooks/useSupabaseSync.ts` | 主要載入 active board 節點與依賴 | export 完整度依使用者瀏覽狀態而變動 |
| `src/hooks/useTagSync.ts` | 只載入 active workspace tags | 所謂全域快照仍缺其他 workspace tag definitions |
| `src/services/dataBackend.ts` | `replaceAllByProject` 先刪除，再逐筆 upsert；row failure 被 `.catch(console.error)` 吞掉 | 可留下半套資料並誤報成功 |
| `src/store/useBoardStore.ts` | 仍保留只輸出 console 訊息的 `exportData/importData` stub | 備份 ownership 與 API 邊界不明 |

P0 核心問題不是按鈕排列，而是使用者無法回答三件事:
1. 這個檔案到底備份了什麼、沒備份什麼？
2. 匯入後會新增、取代或遺失哪些資料？
3. 失敗時能否保證目標看板維持原狀？

## Product Goal

使用者能在設定中心完成一個可預測、可逆、可驗證的看板資料流程:

1. 選擇看板並建立範圍明確的備份。
2. 選擇檔案後先 inspect，不立即修改任何資料。
3. 系統顯示來源、版本、內容數量、排除內容、相容模式、衝突與風險。
4. 預設複製成新看板；只有同源備份可選擇取代目前看板內容。
5. 執行必須是全成或全敗，完成後提供 read-after-write 驗證報告。

## End-State Architecture

統一的是操作模型與資料契約，不是強迫所有 scope 共用同一個危險動作:

```text
BackupScope
  -> Backup Package
  -> Import Inspection
  -> Import Plan
  -> Transactional Execution
  -> Verification Report
```

責任分層:

| Layer | Responsibility | 禁止事項 |
|---|---|---|
| Settings UI | 收集 scope/target/mode、呈現 inspect/plan/report | 不 parse legacy、不直接寫 store 或 DB |
| `features/backup` domain | schema validator、canonical serializer、legacy adapter、ID mapping、plan types | 不依賴 React/Zustand 當資料真相 |
| `BackupApplicationService` | orchestrate export/inspect/plan/execute/verify | 不吞錯、不在遠端成功前改前端 canonical state |
| Backend adapter | canonical read、preflight、transaction RPC、read-after-write | 不逐筆 best-effort restore |
| Supabase RPC | server-side permission、lock/fingerprint、atomic create/replace | 不信任 client 傳入 workspace/board ownership |

## Scope

In scope:
- 單看板 Backup Package V2 匯出。
- 「全部看板」批次匯出入口：依每張可讀看板各建立一個單看板 V2 檔案，並列出無法建立的看板與原因。
- V2 file parse、schema validation、checksum、manifest 與 compatibility inspection。
- `copy_to_new_board` 預設匯入模式。
- 同源 `replace_current_board` 進階模式。
- Supabase transaction RPC 與 local-test 等價 adapter。
- V1 legacy adapter 的 read-only inspect / blocked explanation。
- Settings UI 的建立備份、檔案檢查、匯入計畫、確認、進度、結果與錯誤狀態。
- 自動化 static/model/DB/browser/regression verifier。

Out of scope:
- 工作區、帳號或全環境備份/還原。
- Knowledge Records、record content、attachments、calendar subscription config/token、memberships/roles、audit/activity、RAG derived data。
- 加密、壓縮、排程、雲端保存、跨帳號分享。
- 跨來源看板直接覆寫目前看板。
- production deploy、production data mutation、release/rollback artifact；這些需另行進入 deployment release gate。

## Backup Package V2 Contract

建議 domain types:

```ts
type BackupScope = {
  type: 'board';
  workspaceId: string;
  boardId: string;
};

interface BackupPackageV2 {
  format: 'projed-backup';
  schemaVersion: 2;
  packageId: string;
  createdAt: string;
  source: {
    appVersion: string;
    backend: 'supabase' | 'local-test';
    workspaceId: string;
    boardId: string;
    boardTitle: string;
  };
  scope: { type: 'board' };
  manifest: {
    entities: { tasks: number; dependencies: number; tags: number };
    includes: string[];
    excludes: string[];
    canonicalization: 'json-sort-v1';
    checksum: { algorithm: 'SHA-256'; value: string };
  };
  payload: {
    board: PortableBoardV2;
    tasks: PortableTaskV2[];
    dependencies: PortableDependencyV2[];
    tags: PortableTagV2[];
  };
}
```

Contract rules:
- Phase 1 的 package scope 只能是 `{ type: 'board' }`；「全部看板」只是 UI 批次操作，不是新的多看板檔案格式。
- `packageId` 使用 UUID；`createdAt` 使用 UTC ISO-8601。
- checksum 只涵蓋 canonicalized `payload`；object keys 排序，tasks/dependencies/tags 依 source ID 排序。
- `storageId`、auth token、service key、email invitation、calendar feed token、signed URL 不得輸出。
- tasks 保留 task ID、tree parent、order、title、description/detail notes、status、dates、node type、kanban stage、archive state、assignee/collaborator references 與 tag references。
- dependencies 的兩端必須都存在於 package tasks；dangling dependency 使 export/inspect 失敗，不可靜默丟棄。
- tags 只輸出被 package tasks 引用的 definitions；未被引用的 workspace tags 不屬單看板 package。
- manifest 必須以使用者可讀文案明列 exclusions，不能只用技術 enum。
- 匯出資料必須由 backend canonical query 取得，不得使用 Zustand 當完整來源。
- V2 validator 放在 `src/features/backup`，以 typed parser 實作；目前專案沒有 schema library，不為這一項強制新增 runtime dependency。

## Import Modes

### `copy_to_new_board` - default

- 使用者選擇有建立看板權限的 target workspace；預設目前 workspace。
- 新看板名稱預填 package board title，可在執行前修改；名稱衝突沿用既有看板命名規則。
- board、tasks、dependencies 全部產生新 ID；parent/dependency/tag references 必須透過單一 ID map 重建。
- tags 以 target workspace 內的 normalized name 比對：相同名稱則重用；顏色不同時保留 target definition 並在 report 顯示 warning；不存在才建立。
- assignee/collaborator 只保留仍是 target workspace member 的 user ID；無法解析者清除並列入 report，不得藉匯入增加 membership 或權限。
- 來源看板與其他看板不得被修改。

### `replace_current_board` - advanced

Compatibility gate:
- `package.source.boardId === target.boardId`，否則不顯示可執行 CTA。
- target board 必須仍存在，且 server 確認操作者具有 destructive restore 權限。
- inspect/plan 必須確認 package task IDs 未存在於其他 board。
- 目標中「package 不含、但仍被 Knowledge Record 連結」的 task 數量大於 0 時阻擋，不允許造成 out-of-package 關聯遺失。

Execution semantics:
- 保留 target workspace、board ID、board title、board order、memberships/roles、calendar subscriptions 與其他 out-of-package settings。
- package 中仍存在的 task ID 以 upsert 更新，避免不必要刪除造成 record link cascade。
- target 中 package 不含的 tasks 由 transaction 依 dependency/tree 安全順序刪除。
- dependencies 與 task-tag assignments 依 package 內容完整取代。
- assignee/collaborator 重新做 target membership validation；已失效引用清除並報告。
- 執行前必須先成功產生目前 target 的 V2 pre-replacement package；產生失敗時不得繼續。
- UI 要求使用者輸入目標看板名稱，並清楚顯示刪除/更新/保留數量；不能只用一般 confirm dialog。

## Import Inspection And Plan

建議 application service:

```ts
interface BackupApplicationService {
  exportPackage(request: ExportBackupRequest): Promise<BackupExportResult>;
  inspectPackage(file: File): Promise<BackupInspection>;
  planImport(request: PlanBackupImportRequest): Promise<BackupImportPlan>;
  executeImport(plan: BackupImportPlan): Promise<BackupExecutionResult>;
  verifyImport(result: BackupExecutionResult): Promise<BackupVerificationReport>;
}
```

`inspectPackage()` 必須 pure/read-only，輸出:
- format/schema version、source board/workspace、createdAt。
- entity counts、included/excluded domains、checksum result。
- compatible modes 與不相容原因。
- legacy limitation 或 migration requirement。

`planImport()` 必須 read-only，輸出:
- plan ID、execution ID、target、mode。
- create/update/delete/keep counts。
- new ID map summary、tag reuse/create/conflict、unresolved assignee/collaborator counts。
- dependency/tree validation、cross-board ID collision、out-of-package record-link blockers。
- target fingerprint 與到期時間；target 改變後原 plan 失效。
- warnings、blocking errors、required confirmation phrase。

## Transaction And Backend Contract

Supabase migration 建立單一受控 RPC 或等價 transaction boundary，例如 `import_board_backup_v2`:

- Input: normalized package payload、mode、target workspace/board、new board title、execution ID、expected target fingerprint。
- `auth.uid()` 不可為 null；function 自行解析 membership/role，不信任 client authorization flag。
- `SECURITY DEFINER` 時固定 `search_path`、revoke public、只 grant authenticated，所有 query 以 tenant/project scope 限制。
- 以 execution ID 實作 idempotency；重送同一成功 execution 不得建立第二份資料。
- replace 模式 lock target project，重新計算 fingerprint；不一致則整筆 rollback 並回傳 `TARGET_CHANGED`。
- copy 模式在同一 transaction 建立 project、tasks、dependencies、tag assignments。
- 任一 validation/insert/update/delete 失敗都 rollback；禁止 `.catch(console.error)`、partial success 或 client-side compensating delete 當主要一致性策略。
- 回傳 created/updated/deleted/preserved/unresolved counts、target board ID、post-write fingerprint。
- local-test adapter 必須模擬 all-or-nothing、idempotency 與 fingerprint conflict，不能只有 happy path。

Client state rule:
- 遠端 transaction 成功前不得 `setNodes()` 或改 active board canonical state。
- 成功後以 backend read-after-write reload target；失敗維持目前 UI/store 資料不變。
- `useWbsStore.exportData/importData` 與 `useBoardStore` no-op stubs 在 V2 UI 切換完成後退役；legacy parse 只留在 `LegacyBackupAdapter`。

## Legacy Compatibility

支援辨識:
- `wbs-1.0`
- `wbs-1.1`
- `wbs-1.2`
- `wbs-2.0`
- 無 version 的舊 JSON

Legacy rules:
- legacy adapter 只能 parse、normalize metadata、列出可辨識 entity counts 與限制。
- 若檔案沒有可靠的單一 source board 邊界，回傳 `LEGACY_SCOPE_AMBIGUOUS`，阻擋匯入。
- 若可可靠抽出單一 board，必須先轉成 V2 inspection，重新計算 checksum/manifest，再進 plan；不能直接呼叫 executor。
- UI 文案使用「舊版 WBS 資料檔」，不得稱為完整 ProJED 備份。
- 錯誤訊息的支援版本清單必須與實際 parser 一致。

## UI And Communication Contract

頁籤名稱: `備份、還原與資料移轉`

主畫面採兩個 task-focused sections，不做卡片內再套卡片:

1. `建立備份`
   - 看板 selector。
   - selector 提供「全部看板」選項；選取後顯示可下載檔案數、失敗看板數、合計任務/依賴/標籤與逐看板狀態。
   - 批次下載必須觸發多個獨立 `.backup.json`，每個檔案仍只包含一張看板；若部分看板失敗，CTA 文案必須說明只下載已建立的檔案。
   - 固定顯示「包含」與「不包含」。
   - backend canonical counts 載入完成後才啟用 `下載備份`。
2. `匯入或還原`
   - `選擇備份檔` 後先 inspect。
   - 顯示來源看板、建立時間、版本、checksum、entity counts、exclusions。
   - 預設模式 `複製成新看板`；只有 compatibility gate 通過才提供 `取代目前看板內容`。
   - plan 完成後才顯示最終 CTA；blocking error 只提供修正路徑，不提供強制繼續。

狀態至少包含:
- idle、loading counts、exporting、inspecting、invalid/tampered、planning、ready、executing、verifying、success、rolled back/conflict。
- 執行中防重送；離頁前警告；成功報告提供 target board 入口與 pre-replacement package 入口。
- 320/390/1024/1440 viewport 不得有 CTA 裁切、巢狀卡片、水平 overflow 或危險模式誤設為 primary。

## Error Taxonomy

| Code | Meaning | Required UX |
|---|---|---|
| `INVALID_FILE` | 非 JSON 或 schema 不合法 | 顯示可修正原因，不 mutation |
| `CHECKSUM_MISMATCH` | payload 被修改或損壞 | 阻擋，不提供忽略 checksum |
| `UNSUPPORTED_VERSION` | 無相容 adapter | 顯示版本與支援範圍 |
| `LEGACY_SCOPE_AMBIGUOUS` | 舊檔無法分離單看板 | 阻擋直接匯入，說明可用選項 |
| `PERMISSION_DENIED` | server 權限不足 | 不洩漏其他 workspace/board 資訊 |
| `TARGET_CHANGED` | plan 後目標已變動 | 要求重新產生 plan |
| `CROSS_BOARD_ID_COLLISION` | replace 不符合同源/ID gate | 導向 copy mode |
| `OUT_OF_PACKAGE_REFERENCE` | 將刪除的 task 仍有未備份關聯 | 阻擋 replace，列出數量 |
| `IMPORT_ROLLED_BACK` | transaction 失敗 | 明示 target 未變更並提供 correlation ID |
| `VERIFY_MISMATCH` | write 後 count/hash 不符 | 不宣稱成功，保持告警並進入受控調查 |

## RD Handoff Contract

### Phase 0: Development Documentation

狀態: Authorized / Complete

交付:
- 本 SPEC、ADR-041、QA-DEV-047。
- `dev_task.md` 與 `documentation_map.md` 索引。

驗收:
- Human decisions、data/transaction/permission/failure contracts、phase boundary 與 QA gates 足以讓 RD 不需重新猜需求。

### Phase 1: Board Backup Package V2

狀態: Authorized / Implemented / Local Automated QA-QC Passed

Scope:
- 建立 `src/features/backup` domain types、validator、serializer、legacy adapter、planner、ID mapper。
- 建立 canonical board export query/service，輸出 V2 package。
- 建立 Supabase migration/RPC 與 local-test transaction adapter。
- 建立 copy/replace UI flow 與 result report。
- 退役新 UI 對 Zustand legacy export/import 的直接依賴。
- 建立 static/model/local DB/browser verifier 與 DEV-038 regression。

Acceptance:
- 同一個 V2 package 可複製成新看板；normalized round-trip data 等於來源 package。
- 同源 replace 可全成或全敗；任何 injected row failure 後 target fingerprint 完全不變。
- tampered、ambiguous legacy、cross-origin replace、permission denied、target changed、out-of-package reference 全部在 mutation 前被阻擋。
- 使用者可在執行前看懂包含/不包含、目標、模式與資料變化數量。

Exit evidence:
- `verify:dev-047-backup-package-contract`
- `verify:dev-047-backup-package-model`
- `verify:dev-047-backup-transaction-local-db`
- `verify:dev-047-backup-local-supabase`
- `verify:dev-047-backup-package-browser`
- DEV-038 settings regression、TypeScript、test build、production build。

2026-07-14 local outcome:
- Static contract `30/30`、model scenario groups `10/10`、local transaction matrix `9/9` 通過。
- 隔離 Supabase database 已套用 migration source，並通過 owner/admin/project manager/member/viewer/signed-out、copy、replace、rollback、idempotency、stale fingerprint、record-link、role retention、tag color warning、kanban ID map、cross-tenant collision 與 audit matrix；fixture 以 transaction rollback，臨時 database 已刪除。
- Browser 真實執行 V2 單看板下載、全部看板多檔下載、upload/inspect/copy/replace/pre-backup/readback，並驗證 tamper、cross-origin、ambiguous legacy fail closed；1440/1024/390/320 無水平 overflow、CTA 裁切或 console/page error。
- DEV-038 static `20/20`、DEV-038 browser、settings context `6/6`、targeted ESLint、TypeScript、test build 與 production build 通過。
- 證據詳見 `ai-doc/qc/QC-DEV-047-board-backup-package-transactional-import.md`。

### Phase 2: Workspace Backup And Restore

狀態: Future Capsule / Human Re-entry Required

Purpose:
- 將多看板與 workspace-level tag/metadata 納入一致 package，而不是把多看板資料攤平成一張看板。

Boundary:
- 需重新決定 memberships、records、cross-board references、calendar subscriptions 與 workspace permissions 是否 included。
- 不可直接擴充 V2 board executor 假裝已支援 workspace transaction。

Re-entry:
- 使用者明確要求 workspace round-trip，並確認隱私、容量、角色與外部連結策略。

### Phase 3: Account / Environment Recovery

狀態: Future Capsule / Human Re-entry Required

Purpose:
- 帳號級匯出、完整環境 disaster recovery、附件/object storage 與跨環境 restore。

Boundary:
- 必須獨立治理 encryption、retention、storage cost、secrets、audit、RTO/RPO、跨租戶與 production operator 權限。
- 不屬一般設定中心的 client-side import。

Re-entry:
- 有明確 disaster recovery 或法規/資料可攜需求，並指定 owner、RTO/RPO 與儲存政策。

## All-Phase Coverage Matrix

| Concern | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Board tasks/dependencies/tags | Current implementation | Included | Included |
| Multiple boards/workspace metadata | Excluded | Planned | Included |
| Records/attachments/calendar/access | Explicitly excluded | Human decision required | Full governance required |
| Atomicity | Required board RPC | New workspace transaction | Recovery orchestration |
| Default import | Copy to new board | New workspace/copy TBD | Controlled restore only |
| Destructive restore | Same-origin board only | Human decision required | Operator runbook |
| Legacy file | Inspect/extract one board | Potential converter | Not direct |
| Release | Separate release gate | Separate release gate | Dedicated recovery gate |

## Dependencies

- DEV-038 settings IA / scope communication remains authoritative until DEV-047 ships.
- DEV-036 workspace/board governance and role semantics.
- DEV-040 bounded failure and backup-import production-risk findings.
- Existing Supabase migration governance, TEST Level 3 environment and deployment release gate.
- `TaskNode`, `Dependency`, `TaskTag`, board/member services and RLS policies.

## Risks And Guardrails

| Risk | Severity | Guardrail |
|---|---|---|
| Incomplete data called full backup | P0 | Scope manifest + explicit exclusions + board-only naming |
| Partial destructive restore | P0 | Single DB transaction + failure injection + fingerprint proof |
| Cross-board flatten/collision | P0 | Copy ID remap; replace same-origin only; legacy ambiguous blocked |
| Permission escalation | P0 | Server-side role checks; no membership/role import |
| Record link loss | P0 | Out-of-package reference preflight blocks replace |
| Stale plan overwrites concurrent edits | P1 | lock + expected fingerprint + re-plan |
| Tampered package | P1 | schema + SHA-256; no bypass |
| Duplicate submission | P1 | execution ID idempotency + disabled executing state |
| Assignment/tag mismatch | P1 | deterministic resolver + report |
| Large file browser freeze | P1 | file/entity hard limits before parse/execute |

## Stop Conditions

- Export 仍從 Zustand store 組「全域」資料，停止。
- Executor 仍呼叫 `replaceAllByProject()` 或逐筆 best-effort write，停止。
- 遠端成功前修改 local canonical nodes，停止。
- 任一 destructive path 沒有 same-origin、permission、pre-backup、fingerprint、transaction 與 verification，停止。
- Legacy global/ambiguous file 可直接匯入目前看板，停止。
- UI 稱 V2 為完整 ProJED/帳號備份，停止。
- QA 只有 happy path，沒有 failure injection、role matrix、concurrency、tamper 與 rollback proof，停止。
- 要進入 Supabase TEST/production 或 Firebase release，但沒有 deployment-release-gate 授權，停止。

## Execution Boundary

本輪已完成 Phase 1 產品程式、migration source、local-test/Supabase transaction adapter、verifier、實際瀏覽器 QC 與文件更新。Supabase migration 僅套用於每次建立後即刪除的隔離本機 database，不代表 TEST 或 production 已套用。

本輪未執行:
- `ProJED-TEST` remote migration、authenticated Firebase preview、remote mutation/cleanup。
- production migration、deploy、production smoke 或正式資料操作。
- commit、push、PR 或 release artifact 建立。

DEV-047 Phase 1 開發可結案；後續只在使用者提出 release/部署指令時進入共用 Level 3 與 production deployment gate。Phase 2/3 仍需 Human Re-entry，不因 Phase 1 完成而自動啟動。
