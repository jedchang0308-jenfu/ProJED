# SPEC-044: 上一步復原範圍擴充與低資料庫成本治理

關聯 DEV: DEV-044
父交付點: DEV-001 緊湊 UI 系統 / DEV-028 跨模式任務互動 / DEV-039 全域任務平台
任務類型: Undo/Redo interaction contract / Recovery scope / Data-cost guardrail
狀態: Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed
優先級: P1 user recovery confidence, P1 database cost guardrail
建立日期: 2026-07-06

## Human Decision Brief

決策來源:

- 使用者指出目前「上一步」可復原範圍不夠，有些動作不能恢復。
- 使用者要求評估可增加哪些範圍，且資料庫費用不要增加太多。
- PM 依目前程式碼確認 `useUndoStore` 已採 Command Pattern，最多保留 50 步；目前任務核心操作多集中在 `useWbsStore`，但工作區 / 看板 / 紀錄庫 / 設定偏好等 store 尚未完整納入。

已確認決策:

- 第一版擴充應優先沿用前端 command stack，不新增資料庫 undo history table。
- 正常操作不應因為「記錄可復原」而額外寫入資料庫；只有使用者真的按下 undo / redo 時，才執行等同正常操作的資料寫入。
- 高損失、低頻率、涉及權限或資料刪除的動作，不應混入一般 Ctrl+Z，而應走確認、回收站、audit 或另開資料生命週期規格。

已拒絕選項:

- 為每次操作新增遠端歷史紀錄表。
- 把 workspace delete、權限變更、匯入覆蓋、AI 批次改寫直接做成一般一步復原。
- 對文字輸入每個 key stroke 都推入全域 undo stack。

AI assumptions:

- 本 DEV 的第一個可實作 phase 是低成本、client-side command 擴充；不改 schema、不做 migration、不新增 RLS/RPC。
- `UndoCommand` 可以在 RD 時擴充為 async-aware command，並加入 suppress guard，避免 undo / redo 執行反向 action 時再次污染 stack。
- Phase 1 已於 2026-07-06 在本機完成 low-cost ordinary undo implementation、static verifier、browser verifier 與 regression gate；production deploy、DB schema / migration、RLS/RPC、durable recovery 仍未授權。

Re-entry triggers:

- 需要跨裝置或重新整理後仍可復原。
- 需要 workspace / board 刪除後完整復原子資料。
- 需要記錄可稽核的永久 undo history。
- 需要修改 DB schema、RLS、RPC、migration、production deploy 或正式資料修復。
- 需要把權限、成員、邀請、匯入覆蓋、AI 批次改寫納入一般 undo。

## Current System Reading

目前已存在:

- `src/store/useUndoStore.ts`：全域 undo / redo command stack，上限 50 步，push 時清空 redo。
- `src/store/useWbsStore.ts`：已對任務新增、複製、修改、刪除 / 復原、移動、依賴新增 / 刪除 / 修改推入 undo command。
- `src/components/MainLayout.tsx`：提供 toolbar undo / redo 與 `Ctrl+Z` / `Ctrl+Shift+Z`。

主要缺口:

- `src/store/useBoardStore.ts` 的工作區 / 看板標題、新增看板、刪除看板、移動看板、篩選器 / 顯示設定多數未推入 undo。
- `src/store/useRecordStore.ts` 的紀錄草稿、儲存、發布狀態、封存 / 還原尚未推入全域 undo。
- 高風險動作沒有明確分流：哪些可一般 undo、哪些必須回收站或 confirmation。
- 目前 `UndoCommand` 型別是同步 `() => void`，但紀錄與看板操作多為 async service action；RD 應先補 async / suppress contract，避免 race 與 stack 污染。

## Scope

### Phase 0 - Documentation Contract

狀態: Complete / Authorized

- 建立本 SPEC。
- 建立 DEV-044 QA plan。
- 更新 `documentation_map.md` 與 `dev_task.md`。
- 不修改產品程式碼、不新增 verifier、不跑 QA/QC。

### Phase 1 - Low-Cost Undo Expansion

狀態: Implemented / Local Automated QA Passed / Production Not Deployed

目標: 擴充高頻、低成本、可用既有資料寫入復原的操作。

納入範圍:

- 工作區標題修改：保存舊標題 / 新標題。
- 看板標題修改：保存舊標題 / 新標題。
- 新增看板：redo 建立看板，undo 刪除或封存剛建立的看板；必須等 stable backend board id 後才 push undo。
- 紀錄庫封存 / 還原：保存被封存 record snapshot，undo 時還原 status 與原內容。
- 紀錄庫儲存 / 發布狀態：保存儲存前 record snapshot 與儲存後 payload；新建紀錄 undo 為封存，既有紀錄 undo 為回寫舊 snapshot。
- 紀錄草稿中任務連結、visibility、title、date range 的明確提交動作：只在儲存或完成一段編輯時合併成單一 undo，不逐字記錄。
- 篩選器 / 顯示設定：只影響本機偏好或目前 board filter state，可用 undo 還原上一組偏好；不得增加遠端 DB 寫入。

Phase 1 不納入:

- Workspace delete。
- Board delete 若後端會 cascade child data，不能用一般 undo 宣稱完整復原。
- 權限、成員、邀請、匯入覆蓋、AI 批次產出。
- 跨裝置、重新整理後仍可 undo。

### Phase 2 - Batch / Cross-View Recovery

狀態: RD Contract Ready / Not Authorized

目標: 擴充中高價值、需要 batch patch 或跨 store coordination 的操作。

納入範圍:

- 批次任務狀態 / 日期 / 指派 / 標籤修改：以一個 command 保存每筆 affected node 的 before / after patch。
- 工作台跨看板或未歸位 placement：保存每個任務的 workspaceId、boardId、parentId、order、status 與 placement metadata。
- Board move between workspaces：保存來源 workspace、目標 workspace、board metadata；若後端 operation 是 destructive 或 cascade，需停下轉 Phase 3。
- Drag / reorder coalescing：同一任務連續拖曳在短時間內合併成一個 undo item。

### Phase 3 - Destructive Recovery / Lifecycle Redesign

狀態: RD Contract Ready / Not Authorized / Human Re-entry Required

目標: 對高損失動作建立回收站、soft delete、audit 或版本快照，不混入普通一步復原。

候選範圍:

- Workspace delete recovery。
- Board delete with child tasks / records / tags / dependencies restore。
- Import overwrite rollback。
- Permission / member / role matrix change recovery。
- AI batch generation / rewrite rollback。
- Cross-device or persistent undo history。

Phase 3 需要另行確認:

- 是否接受 DB schema / migration / RLS / RPC。
- 保留期限、費用上限、資料刪除法規 / 隱私邊界。
- audit log 與 ordinary undo 的分工。

## End-State Architecture

- Ordinary undo 是「短期、使用者當前 session 的操作復原」，不是永久歷史紀錄。
- Durable recovery 是「高風險資料生命週期能力」，用回收站、soft delete、audit 或版本快照治理。
- 每個 action 在進入 undo stack 前必須有明確 cost class:
  - `local-only`: 只改前端 state / localStorage。
  - `normal-write`: undo / redo 時只做既有正常 API 寫入。
  - `snapshot-needed`: 需要保存資料快照，但 snapshot 優先留在記憶體或 session，不新增遠端歷史表。
  - `lifecycle-required`: 不可普通 undo，需另行設計資料生命週期。

## Implementation Contract

### Undo Store

- 將 `UndoCommand` 擴充為 async-aware:

```ts
interface UndoCommand {
  label: string;
  scope?: 'task' | 'board' | 'workspace' | 'record' | 'filter' | 'batch';
  entityIds?: string[];
  mergeKey?: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}
```

- `useUndoStore` 增加 `isApplying` 或等效 suppress guard。
- Undo / redo 執行期間，store action 若被反向 command 呼叫，不得再次 push 新 command。
- 支援 command coalescing：同一 `mergeKey` 在短時間內可合併，例如 title edit blur、drag end、filter batch change。
- 保留 50 步上限；不得為了擴充範圍無限制成長。

### Board / Workspace Store

- `updateWorkspaceTitle`、`updateBoardTitle` 推入 title before / after command。
- `addBoard` 必須在 backend 回傳 stable board id 後才推入 undo；temp id 不得成為永久 undo entity id。
- `removeBoard` 若只刪 board metadata 且 child data 仍可由 restore path 取回，才可納入 Phase 1/2；若後端 cascade child data，必須轉 Phase 3。
- `moveBoardToWorkspace` 只能在 backend 支援可逆 transaction 或可補償 restore 時納入。

### Record Store

- `saveDraft` 在呼叫 `recordService.upsert` 前，從 `records` 或現有 draft baseline 取得 previous snapshot。
- 新建 record 的 undo 為封存剛建立 record；redo 為重新 upsert saved payload。
- 既有 record 的 undo 為 upsert previous snapshot；redo 為 upsert saved snapshot。
- `archiveRecord` 必須在 archive 前保存 record snapshot；undo 以 upsert snapshot 或 restore service 還原。
- 不逐字記錄 editor typing；editor 自己的 history 繼續處理文字輸入，避免和全域 undo 衝突。

### Filter / Display Preferences

- 篩選器、顯示設定、dueWithinDays、assignee filter 可以作為 local-only undo。
- 若偏好目前已寫 localStorage，undo / redo 只重寫 localStorage 與 Zustand state，不新增遠端資料。
- Filter undo label 需明確，例如 `復原篩選條件`，避免使用者誤以為在復原任務資料。

### Database Cost Guardrails

- Push undo command 本身不得造成遠端 DB write。
- 一次普通操作的 DB write count 不得因記錄 undo 而增加。
- Undo / redo 的 DB writes 應等同一次反向正常操作，不另寫 history row。
- 不為 Phase 1 建立 `undo_logs`、`history`、`versions` 等遠端表。
- Board / workspace / record snapshot 優先放在記憶體 command payload；若需跨 session durable recovery，必須進 Phase 3。

## Acceptance Criteria

- 工作區 / 看板重新命名後，toolbar undo 可還原舊標題，redo 可恢復新標題。
- 新增看板後，undo 不留下 temp id、空看板或 active board 殘留；redo 使用 stable id 或可接受的新 stable id，且 UI 狀態一致。
- 封存紀錄後，undo 可讓紀錄重新出現在紀錄庫，內容、狀態、visibility、task links 不遺失。
- 既有紀錄儲存後，undo 回到儲存前 snapshot；redo 回到儲存後 snapshot。
- 篩選器或顯示設定 undo 不產生遠端 DB write。
- Editor focus 中的 `Ctrl+Z` 仍使用 editor history，不觸發全域 undo。
- Undo / redo 執行中不會因反向 action 再 push 新 command 而造成 stack 震盪。
- Phase 1 不新增 DB schema、migration、RLS、RPC 或遠端 history table。

## QA / QC Gate

詳細 QA plan: `ai-doc/qa/QA-DEV-044-undo-recovery-scope-expansion.md`

QC evidence: `ai-doc/qc/QC-DEV-044-undo-recovery-scope-expansion.md`

建議 RD exit gate:

```powershell
npm.cmd run verify:dev-044-undo-coverage
npm.cmd run verify:dev-044-undo-coverage-browser
npm.cmd run verify:dev-013-task-duplicate
npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser
npm.cmd run verify:dev-006-browser-input
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

已通過本機 gate - 2026-07-06:

- `npm.cmd run verify:dev-044-undo-coverage` passed，19/19。
- `npm.cmd run verify:dev-044-undo-coverage-browser` passed；覆蓋 board title undo/redo、suppress guard、record archive undo restore。
- `npm.cmd run verify:dev-013-task-duplicate` passed。
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` passed。
- `npm.cmd run verify:dev-006-browser-input` passed；覆蓋 editor Ctrl+Z / Ctrl+Y 與 task chip 操作。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build:test` passed。
- `git diff --check` passed；僅 LF/CRLF warning，無 whitespace error。

## Stop Conditions

- 任一 Phase 1 action 需要新增遠端 history table 才能完成。
- Undo / redo 會造成資料重複、錯 board、錯 workspace 或 active state 指向不存在 entity。
- Record undo 會丟失 content、taskLinks、visibility 或 published/draft 狀態。
- Board delete 被納入普通 undo，但後端實際 cascade child data。
- 需要 production deploy、DB migration、RLS/RPC 或正式資料修復。
- 使用者要求跨裝置 / reload 後仍可 undo，需轉 Phase 3。

## Deferred Scope Audit

| Deferred scope | Classification | Reason / tracking |
|---|---|---|
| Product code implementation | Same Spec Phase / Complete for Phase 1 | Phase 1 已完成本機 RD；Phase 2/3 未授權。 |
| Automated verifier implementation | Same Spec Phase / Complete for Phase 1 | 已建立並通過 `verify:dev-044-undo-coverage` 與 `verify:dev-044-undo-coverage-browser`。 |
| Production deploy | Blocked Human Re-entry | 需 deployment-release-gate 與使用者明確授權。 |
| DB schema / migration / RLS / RPC | Blocked Human Re-entry | Phase 1 明確不需要；Phase 3 若啟動需另行授權。 |
| Persistent cross-device undo history | New DEV Candidate | 不屬於低成本 ordinary undo；需成本與隱私決策。 |
| Workspace delete recovery | New DEV Candidate / Human Re-entry | 需資料生命週期、soft delete 或回收站規格。 |
| Board delete with full child restore | Same Spec Phase 3 | 若後端 cascade，需 Phase 3 lifecycle redesign。 |
| Permission/member/role undo | New DEV Candidate | 涉及權限與 audit，不納入普通 undo。 |
| Import overwrite rollback | New DEV Candidate | 涉及資料覆寫與備份，需要獨立 rollback contract。 |
| AI batch rewrite rollback | New DEV Candidate | 涉及 AI 輸出治理與內容版本，不納入 Phase 1。 |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0: PM/RD Contract | Authorized | Complete | SPEC / QA / dev_task / documentation_map | Product code, verifier, deploy | 使用者要求寫成開發文件 | 文件包含 scope、cost guardrail、RD contract、QA gate | File diff |
| Phase 1: Low-Cost Undo Expansion | Authorized / Local Complete | Implemented / Local Automated QA Passed | Title edits, board create, record save/archive restore, filter/display prefs, async/suppress undo guard | DB history, workspace delete, permission undo, import rollback | Phase 0 contract complete | DEV-044 static/browser verifier and regressions pass；normal operation 不新增 history write | DEV-044 static/browser verifier, DEV-013/039/006 regression, TS, build |
| Phase 2: Batch / Cross-View Recovery | Not Authorized | RD Contract Ready | Batch task patches, cross-view placement, board move if reversible, drag coalescing | Destructive cascade restore, persistent history | Phase 1 stable and user authorizes batch/cross-view scope | Batch undo/redo atomic enough; no duplicate entities | Batch verifier, workbench regression |
| Phase 3: Destructive Recovery | Human Re-entry Required | RD Contract Ready / Not Authorized | Workspace/board delete lifecycle, import rollback, permission/audit, persistent history | Ordinary Ctrl+Z semantics | 使用者確認成本、retention、DB migration | Recovery model documented and gated by lifecycle tests | ADR/SPEC/QA/QC plus migration evidence |

## ADR Decision

本輪不建立 ADR。理由:

- Phase 1 是既有 Command Pattern 的範圍擴充，不改資料身份、主生命週期或權限模型。
- 需要 ADR 的項目已分類到 Phase 3 / New DEV Candidate：workspace / board lifecycle recovery、persistent history、permission audit、import rollback。

若使用者授權 Phase 3，需重新評估是否建立 ADR。
