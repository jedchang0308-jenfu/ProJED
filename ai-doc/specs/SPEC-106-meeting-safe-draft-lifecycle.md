# SPEC-106：會議安全草稿、結束與待整理生命週期

## DEV-117 Same-board View Continuity Amendment（2026-09-10）

- Board／List／Mindmap／Gantt／Calendar 之間的同 active board view switch 不再屬於「離開紀錄」，
  不呼叫 force-flush、save、close、exit 或 recovery clear；由 `SPEC-117`／`ADR-049` 管理。
- 本文件既有「切 view」離開敘述只保留為 DEV-106 當時的歷史驗證基線。真正 meeting exit、record replacement、
  board／workspace switch 與 system-page navigation 仍由本文件的 local safety contract 管理。
- local durability、explicit discard、mobile meeting-negative、provider 0 remote recovery request 與 Phase 1 邊界不變。

- 關聯 DEV：DEV-106
- 文件成熟度：`Phase 0 QA/QC PASS / Phase 1 RD Contract Ready / Cloud Recovery Future Capsule / NOT RELEASED`
- 風險 lane：Phase 0 Medium；remote schema／RLS／Firestore rules、跨裝置、部署或 release 另行升級
- 來源：`USER-20260904-MEETING-SAFE-DRAFT-LIFECYCLE`
- 承接：DEV-069、SPEC-069、DEV-094、SPEC-020、SPEC-010
- 技術主管審查：`ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-106.md`
- 決策日期：2026-09-04
- Spec Impact：`Intentional replacement / Phase 0 QA-QC passed`。本文件是 DEV-106 的目標契約；Phase 0 已在 working tree 落地並完成 static、deterministic runtime、rendered browser、回歸與 side-effect failure-injection gate。Phase 1／Cloud Recovery 維持未實作，正式 release 仍需另走 release gate。

## DEV-109 Active Capture Recovery No-change Boundary（2026-09-08）

- Spec Impact：`No schema change / regression authority / Implemented Candidate / QA-QC Pending / NOT RELEASED`。DEV-106 的 transaction truth、
  force-flush、terminal clear、side-effect isolation 與 0 remote recovery request 全部維持。
- DEV-109 不增加 snapshot 欄位或 remote payload。已投影的 live line 由既有 `draft.content` 與 transaction truth 保護；
  segment、plaintext baseline、aggregate、ticket、mutation id 與 anchor 只存在目前 tab runtime。
- F5／crash restore 保留正文並建立新 segment；使用者主動離開後再開同樣建立新 segment。不得續接、推測或 backfill
  reload 前的 volatile state，也不得讓 DEV-109 改變現行 signature／IDB 契約。

## 1. 真正問題與最短因果鏈

使用者在會議中應專注於討論，不應靠記得按「存草稿」或「發布」維持資料存活。

```text
持續輸入
  -> 最新內容仍在記憶體，或 IndexedDB request success 被誤認為 transaction committed
  -> 關閉側欄／離開會議／切換紀錄時，舊流程清除 recovery 並 reset store
  -> 缺少可重建最新內容的 durable snapshot
  -> 會議資料流失
```

反事實驗證：若最新 signature 已由 IndexedDB transaction `oncomplete` 證明落盤，且一般離開不清除該 snapshot，則關閉後重新開啟仍可復原。這已足以切斷本次使用者問題的主要因果鏈；雲端 CAS、跨裝置合併、智慧摘要不是第一個必要條件。

Phase 0 只承諾以下結果：

- 編輯中自動建立本機 recovery，不要求使用者按「存草稿」。
- app 內一般導覽離開前自動嘗試把目前 signature 強制落盤；成功後才離開。
- 會議面板內的主動離開只由明確的 `儲存並離開` 或二次確認的 `刪除並離開` 觸發。
- 所有 meeting cloud checkpoint 在 Phase 0 停用，避免沿用未完成驗證的遠端寫入與隱私假設。
- 瀏覽器／OS 在 transaction commit 前突然終止時，仍可能遺失最後尚未提交的尾段；不得宣稱零資料遺失。

使用思考習慣：#問對問題、#底層邏輯、#風險先行

## 2. 不變條件

1. 一般導覽離開只改變畫面位置，不等於儲存、發布、封存或刪除；`儲存並離開` 是使用者明確選擇的複合操作。
2. 草稿 recovery 由系統自動建立；`存草稿` 是把內容寫入 canonical record 的次要操作，不是資料存活的必要步驟。
3. `發布` 只改變正式狀態與可見性，不得兼作編輯中內容的唯一救援機制。
4. 一般關閉 dialog 不得提供 `不儲存離開`、`直接離開` 或任何隱含清除 recovery 的 action。
5. `刪除並離開` 必須是獨立 overflow danger action，經確認後只清除目前 scope 尚未正式儲存的內容；既有 canonical baseline 保留。
6. recovery、restore、close、discard 不觸發 AI、task-link、undo、document/version/chunk/embedding、RAG 或 event log。
7. Phase 0 只保證目前 tab runtime 的寫入順序；同一草稿多 tab／跨裝置同時編輯不在本期保證範圍，文件與UI不得宣稱已支援。
8. 手機／coarse-pointer 的 meeting-negative boundary 維持 DEV-069／DEV-094 現況。

## 3. 分期與交付邊界

| Phase | 成熟度 | 交付內容 | 明確不做 |
|---|---|---|---|
| 0：Local Safety Slice | Implemented / QA-QC PASS | transaction commit truth、per-scope latest queue、app 內離開前自動 flush、明確 discard、canonical save 後清理、cloud checkpoint kill switch、side-effect isolation | 雲端 recovery、跨裝置、待整理 UI、結束會議、remote migration／rules |
| 1：安全收尾與待整理 | RD Contract Ready | `結束會議`、canonical draft、`recording -> needs_review`、既有紀錄庫待整理 projection、發布 gate | AI 自動整理、多人 merge、版本歷史 |
| 2：安全雲端 recovery | Future Capsule | owner-private 獨立 recovery authority、provider concurrency、跨裝置續編 | 未經 ADR／migration／rules 審查不得實作 |
| 3：智慧收尾與版本 | Future Capsule | 摘要、決議、待辦、版本檢視、衝突處理 | 不自動發布、不覆寫原始內容 |

## 4. Phase 0 使用者行為契約

### 4.1 自動保存與可誠實承諾的 RPO

- 延用 500ms idle debounce；有實質內容後自動排入本機 snapshot write。
- `request.onsuccess` 只表示 request 完成，不代表資料已 durable；只有 transaction `oncomplete` 可更新 `localCommittedSignature`。
- routine autosave 的未提交窗口約為 `500ms debounce + IndexedDB transaction time`。
- app 內離開會略過 debounce，立即 force-flush 目前 signature；預設等待上限為 2,000ms。
- `pagehide`／`visibilitychange` 可寫 session emergency copy並觸發 best-effort local write，但不得顯示為 durable success。
- `beforeunload` 只在最新 signature 尚未 local committed 或 canonical saved 時註冊，由瀏覽器顯示原生提示；產品不得承諾該事件一定完成 async IndexedDB write。

### 4.2 App 內一般離開

適用於離開 meeting mode、切換 view、切換看板、開新紀錄、開啟另一筆紀錄。RecordSidebar 在 live meeting 不顯示語意不明的 X；面板內主動離開改由 4.3 的明確結果操作負責。

| 當下狀態 | 系統行為 |
|---|---|
| 無實質內容，且無 recovery／canonical record | 直接執行原 navigation，不建立 snapshot |
| 最新 signature 已 local committed 或 canonical saved | 執行原 navigation；保留 recovery，不清除 scope |
| 最新 signature 尚未 committed | 自動 force-flush；commit 成功後執行原 navigation |
| force-flush 失敗或 2,000ms timeout | 不離開、不 reset；顯示 `重試保護`、`存草稿後離開`、`繼續編輯` |

一般離開不先詢問使用者是否要保存。只有自動保護失敗時才顯示恢復型 dialog，且不得放入 discard action。

### 4.3 會議面板明確結果操作

- live meeting 標題列只保留收合與 `會議操作` overflow，不顯示另一個 X；overflow 第一層固定依序顯示 `儲存草稿`、`儲存並離開`、`刪除並離開`。
- `儲存草稿`：沿用 canonical draft save；成功後停留在會議面板，失敗保留內容與面板。
- `儲存並離開`：編輯中先等待 canonical draft save 成功才關閉面板；失敗不得 close/reset，並顯示可重試錯誤。若紀錄已發布，直接關閉面板且不得降回 draft。
- `刪除並離開`：沿用 explicit discard。確認文案必須說明只刪除目前尚未正式儲存的內容；若已有 canonical baseline，該 baseline 保留。
- discard 取消時不改變 storage、store、route 或 meeting mode；確認時執行同 scope terminal clear barrier，成功後才 reset／離開。
- IDB delete 失敗時保留 session copy與目前畫面，不顯示成功；不得改用 archive、hard delete 或清除其他 scope。
- Phase 0 cloud recovery 已停用，因此 discard 不做任何 remote mutation。

### 4.4 Canonical 存草稿／發布／封存後清理

- canonical save、publish 或 archive 必須先由既有完整流程回傳成功，才能把相同 signature 視為安全基線。
- canonical mutation 成功後，即使 local recovery cleanup 失敗，內容仍已由 canonical record 保存；UI 可離開，但需保留可重試 cleanup 狀態。
- restore reader 若發現 recovery signature 與 canonical baseline signature 相同或較舊，忽略該 recovery，避免重複提示；cleanup 可於下次啟動重試。
- canonical mutation 失敗時保留輸入與 local recovery，不更新成功訊號、不 reset。

### 4.5 Cloud checkpoint kill switch

Phase 0 對 Supabase、Firestore、local-test 一律停用 meeting cloud recovery：

- hook 不呼叫 `recordService.checkpointDraft` 或等價遠端方法。
- adapter 中僅供 DEV-069 的 recovery checkpoint surface 應移除或改成不可呼叫的明確 unsupported contract，避免未來誤接。
- network spy 必須證明 autosave、close、restore、discard 的 remote recovery read/write count 都是 0。
- 不新增 provider revision、cloud envelope v2、private scaffold、tombstone、RPC、migration、RLS 或 Firestore rules。
- 既有開發／測試環境可能已有 DEV-069 recovery metadata；Phase 0 不自動刪除正式資料。release 前另做 inventory 與 data-governance 決策。

## 5. Phase 0 本機資料契約

### 5.1 Snapshot v2

```ts
interface MeetingDraftRecoverySnapshotV2 {
  schemaVersion: 2;
  scopeKey: string;
  ownerUserId: string;
  workspaceId: string;
  boardId: string;
  draftId: string;
  savedAt: number;
  writeSequence: number;
  localSignature: string;
  canonicalBaselineSignature: string | null;
  contentCursorOffset: number | null;
  draft: KnowledgeRecordInput;
  meetingActivities: MeetingTaskActivity[];
  appendedMeetingActivityIds: string[];
}
```

- `MEETING_DRAFT_RECOVERY_DB_VERSION` 維持 1；object store、scope key 與 session key prefix 不變。
- reader 接受 schemaVersion 1／2；v1 的 `baselineSignature` 在記憶體 normalize 為 `canonicalBaselineSignature`，既有 `remoteSignature` 僅忽略，不回寫、不刪除。
- writer 只寫 v2；每個 scope 保留一個 active snapshot，7 天 TTL 與 owner/workspace/board/draft isolation 不變。
- snapshot 不包含 token、session、API key、DOM/editor instance、raw provider error 或任何遠端 concurrency token。

### 5.2 Durability state

```ts
type MeetingDraftDurability =
  | { kind: 'idle' }
  | { kind: 'saving'; signature: string }
  | { kind: 'session_only'; signature: string; reason: string }
  | { kind: 'local_committed'; signature: string; committedAt: number }
  | { kind: 'error'; signature: string; reason: string };
```

- `session_only` 是 degraded fallback，不得讓 safe-close 判定為可安靜離開。
- UI 的「已保護」只可對應目前 draft signature 的 `local_committed` 或 canonical saved。
- reason 必須是可分類的產品錯誤碼，不保存 raw provider／storage error。

## 6. IndexedDB 與佇列演算法

### 6.1 Transaction truth

- `withStore` 分開保存 request result 與 transaction outcome。
- `request.onsuccess` 只暫存 result；read、write、delete 都在 transaction `oncomplete` 後 resolve success。
- `transaction.onerror`、`transaction.onabort`、open error、blocked 或同步 exception 只能 settle failure 一次，並關閉 database handle。
- abort 後不得更新 committed signature、savedAt 或成功 feedback。

### 6.2 Per-scope latest queue

- 每個 scope 只允許一個 `inFlight` 與一個 `pendingLatest`。
- 新 snapshot 可覆蓋尚未開始的 pending snapshot；不得平行寫相同 scope。
- S1 寫入期間若收到 S2、S3，S2 可被 coalesce；S1 完成後只需再寫 S3。
- 只有 `completed.writeSequence === currentLatestSequence` 且 signature 仍等於目前 draft，才可更新 UI 的 committed state。
- restore 比較順序為 `writeSequence`，相同時再比較 `savedAt`；runtime 從已讀最大 sequence 繼續遞增。
- 此保證只涵蓋目前 tab；另一 tab 同時寫相同 scope 可能造成最後提交者覆蓋，屬已揭露限制。若需求要求跨tab正確性，停止Phase 0並進future concurrency設計，不臨時加入merge。

### 6.3 Terminal clear barrier

1. 遞增 scope generation，丟棄尚未開始的 pending put。
2. 等待已開始的 in-flight put settle。
3. 執行 IDB delete，並等待 transaction `oncomplete`。
4. IDB delete 成功後才移除 session copy。
5. clear ack 後，舊 generation completion 不得重建 snapshot 或更新 UI。

若已知有 local-committed snapshot而無法打開／刪除 IndexedDB，discard fail closed；只有 session-only snapshot 時，session remove 成功即可完成。

## 7. Phase 0 實作影響面

| 檔案 | 變更責任 | 禁止事項 |
|---|---|---|
| `src/types/index.ts` | snapshot v1/v2 union、durability state、force-flush／clear result | 不新增 remote revision、DB status 或 cloud envelope |
| `src/utils/meetingRecordWorkflow.ts` | 保留 DEV-105 變更；加入 pure close/discard decision 與 signature helper | 不直接存取 DOM、store、IndexedDB、provider |
| `src/services/meetingDraftRecoveryService.ts` | transaction-complete helper、per-scope latest queue、v1 read/v2 write、terminal clear barrier | 不升 IDB version、不把 session success 當 durable |
| `src/hooks/useMeetingDraftRecovery.ts` | debounce、forceFlush、generation、beforeunload、準確 durability state | 不呼叫 remote checkpoint、不呼叫完整 `saveDraft()` 代替 autosave |
| `src/hooks/useMeetingDraftDiscard.ts`（new） | 集中 `刪除並離開` confirm、scope terminal clear與fail-closed feedback | 不複製 storage 邏輯、不加入一般 close discard |
| `src/hooks/useMeetingModeExitGuard.ts`、`src/hooks/useRecordDraftGuard.ts` | meeting 分支接入 safety actions；work_log 舊行為不變 | meeting 不得顯示 `直接離開／不儲存，繼續` |
| `src/store/useRecordStore.ts` | 移除 closePanel/openNewRecord/openExistingRecord 的 implicit recovery clear；canonical success才請求cleanup | 不覆蓋使用者既有 DEV-105 dirty hunk |
| `src/components/Records/RecordSidebar.tsx` | overflow 三個明確結果操作、移除 live meeting X、focus return與失敗 feedback | 不增加固定版面高度、不把 danger action做成主 CTA、不 hard delete canonical baseline |
| `src/components/MainLayout.tsx`、`src/components/Sidebar.tsx`、`src/components/Records/RecordsView.tsx`、`src/components/SettingsView.tsx` | 所有既有 view／board return 與切換入口接入 shared draft guard | 不新增 Phase 1 待整理 UI 或改變非 meeting navigation semantics |
| `src/services/dataBackend.ts`、`src/services/supabase/projedService.ts`、`src/services/firestoreService.ts`、`src/services/localTestService.ts` | decommission meeting recovery checkpoint surface，或明確回 unsupported 且 0 request | 不改 schema／migration／RLS／rules，不保留可誤呼叫的 unsafe path |
| `scripts/verify-dev-106-meeting-local-safety.ts`（new） | pure/service/queue/storage/cloud-zero verifier | source scan 不得單獨算行為 PASS |
| `scripts/verify-dev-106-meeting-local-safety-browser.pw.js`（new） | 正常入口、close/discard/failure、1440/1024/390、error/network sweep | 不用 direct URL／預造結果替代 delivery path |
| `scripts/verify-dev-069-meeting-draft-recovery.ts` 與其browser verifier | 把舊direct-leave/cloud checkpoint expected標為歷史；保留local F5、timing、scope、RAG與mobile negative回歸 | 不得要求DEV-106候選繼續發remote checkpoint |
| `package.json` | 新增兩支 DEV-106 verifier script，保留既有 scripts | 不重排或刪除其他 DEV scripts |

`MainLayout.tsx`、`Sidebar.tsx`、`RecordsView.tsx`、`SettingsView.tsx` 已加入 shared draft guard integration，僅保護現有 view／board transitions，不新增待整理分組、remote recovery row 或主資訊架構。若施工需要擴張到上述資訊架構，停止並回 PM／技術主管審查。

## 8. Work Packages

1. **WP-106-L0-A — Contract 與 kill switch**：建立 pure decision tests；關閉所有 provider meeting checkpoint 呼叫，先證明 0 remote read/write。
2. **WP-106-L0-B — Local durability**：實作 transaction truth、queue、v1/v2 compatibility與 clear barrier。
3. **WP-106-L0-C — Safe leave 與 discard**：建立共用 safety actions，接入全部 app 內離開入口與 overflow confirm。
4. **WP-106-L0-D — Canonical cleanup 與 regression**：只在既有 canonical mutation成功後cleanup；保持 work_log、DEV-094、DEV-105行為。
5. **WP-106-L0-E — Candidate verification**：執行 DEV-106兩支 verifier、既有回歸、type/lint/build並凍結 evidence；RD 不得自封 QC PASS。

施工順序固定 A -> B -> C -> D -> E。UI 不得先接到未證明的 durability state。

## 9. Phase 0 驗收與證據

- [x] request success 後、transaction complete 前仍顯示 saving；abort 不產生假成功。
- [x] 快速 S1/S2/S3、out-of-order completion、clear race 最終只可恢復合約允許的最新內容。
- [x] v1 snapshot 可讀、v2 可寫，DB version／store／session prefix 不變。
- [x] 離開模式、切 view、開新／舊 record 都先自動 force-flush；成功才離開，失敗／timeout 保留輸入與畫面。
- [x] live meeting 不顯示 X；overflow 只以 `儲存草稿`、`儲存並離開`、`刪除並離開` 表達結果，且不改變 composer 幾何。
- [x] `儲存並離開` 在編輯中只於 canonical save 成功後 close；save failure 保留輸入與畫面；已發布時可直接離開且不降回 draft。
- [x] 一般導覽 close 沒有 discard／不儲存 action；explicit discard 取消、成功、IDB failure 均符合 fail-closed。
- [x] autosave、restore、close、discard 在 Supabase、Firestore、local-test fixture 的 remote recovery read/write count 都是 0。
- [x] recovery side-effect 的 AI、task links、undo、documents、RAG、event delta 都是 0；ROT-106-012 以 provider checkpoint、正式紀錄、event log、record store actions、Undo push failure injection 與 side-effect storage delta 證明不會進入正式副作用路徑。
- [x] 1440×900、1024×768 正常與失敗流程可操作；390×844 保持 meeting-negative，無 visible/console/page error。
- [x] DEV-069未被取代的local F5／scope／RAG／mobile基線，以及DEV-020、DEV-010、DEV-094、DEV-105相關回歸沒有退化；DEV-069舊direct-leave與cloud expected已改列歷史。

Phase 0 勾選項目已由 static contract、deterministic runtime、rendered browser 與回歸 evidence 封關；最低 evidence 已具備 QA／browser JSON、storage event order、各 provider network count、side-effect delta、1440／1024 positive screenshots、390 negative screenshot、source revision 與 dirty-boundary diff。這不代表 Phase 1 或正式 release 已完成。

詳細案例以 `ai-doc/qa/QA-DEV-106-meeting-safe-draft-lifecycle.md` 為 authority。本候選已完成 targeted static/browser cases、deterministic failure harness、2,000ms timeout、canonical cleanup abort／retry readback、四個 provider adapter checkpoint spy、開新／開舊入口、discard 取消／abort focus、provider／正式紀錄／event failure isolation，以及 store action／Undo push failure injection evidence；Phase 0 gate 已通過。

## 10. Stop Conditions

- 需要改 remote schema、RPC、RLS、grant、Firestore rules 或正式資料。
- 需要在 Phase 0 建立 remote recovery row、provider CAS、跨裝置恢復或 merge。
- 需要改待整理資訊架構、meeting lifecycle status 或手機 meeting availability。
- 無法對全部 app 內離開入口套用同一 force-flush contract。
- IndexedDB v1 compatibility 需刪資料或升版時無法證明 migration 安全。
- explicit discard 必須依賴 hard delete、archive 或遠端 tombstone。
- 現有 dirty hunks 無法做 hunk-level 整合而需整檔覆蓋。

命中任一條即停止 Phase 0，退回技術主管／PM；不得用臨時例外擴大 scope。

## 11. Phase 1：安全收尾與待整理（Contract Ready）

### 11.1 產品目標

- `結束會議` 將同一 stable ID 以完整 canonical save 寫為 `status='draft'`、meeting lifecycle `stage='needs_review'`。
- 成功後退出 meeting mode但保留同一 RecordSidebar；紀錄庫會議分區可找到同一筆 `待整理`。
- recording 不可直接發布；needs_review 有未保存變更時先 canonical save，成功後才發布。
- recovery、結束、開啟待整理、發布都不自動觸發 AI；AI整理仍需明確操作。

### 11.2 尚未解除的 Implementation Readiness 缺口

Phase 1 不得開工，直到以下問題有欄位級契約與 failure tests：

1. canonical save 涉及 record、metadata、task links、undo／RAG side effects時的原子性或補償順序。
2. provider ack成功但client readback失敗時，如何以同 stable ID冪等重試，避免 duplicate。
3. `recording／needs_review` metadata 與 legacy meeting draft 的 authoritative mapping。
4. local recovery、canonical draft在紀錄庫投影的去重、排序、錯誤與 conflict呈現。
5. end／publish race 與舊 autosave completion 的 invalidation證據。

## 12. Future Capsules

### 12.1 安全雲端 recovery 與跨裝置

未來不得再把未保存內容疊加在一般 canonical `knowledge_records.metadata`，因 project／tenant record 可能對其他成員可讀，且 Firestore 現行 workspace-member rules沒有 owner-only record邊界。

重啟條件：使用者確認跨裝置需求與資料可見性；完成 ADR、獨立 owner-private recovery entity、retention、provider concurrency、Supabase RLS/grant、Firestore rules、migration/backfill/rollback與雙 actor privacy smoke。完成前保持 0 remote recovery write。

### 12.2 智慧收尾、心跳與版本

- 心跳偵測：後端辨識意外中斷並封存最後已確認片段。
- 草稿收件匣：首頁集中顯示待整理會議。
- 智慧收尾：明確啟動後產生摘要、決議與待辦，但保持草稿狀態。
- 多版本復原／跨裝置續編：可查看版本並處理衝突，不 silent overwrite。

重啟前提：Phase 1穩定，且另有成本、權限、版本、AI evidence與使用者確認契約。

## 13. ADR 與技術債

- Phase 0 不需新 ADR：採既有本機 IndexedDB authority，並移除未證明安全的 cloud path，屬可逆的風險收斂。
- Future cloud recovery 必須建立 ADR；獨立 recovery authority、retention與 provider policy 是跨產品／資料治理決策。
- Firestore `workspaces/{wsId}/{subcollection=**}` 目前僅以 workspace membership 授權，是既有安全債。Phase 0 以 0 recovery write隔離新增風險；若正式環境已有未保存 payload 或多人使用，release 前仍需 inventory 與獨立治理。
- 無法消除 browser／OS 在本機 transaction commit前突然終止的尾段風險；本文件以誠實 RPO、beforeunload與 app內 force-flush降低風險，不宣稱 exactly-once或 zero-loss。

## 14. 變更紀錄

- 2026-09-04：由 Brief升級為 RD Contract Ready，建立 safe close、discard、cloud recovery、meeting lifecycle與待整理初版契約。
- 2026-09-04：初版 Phase 0 升級為 RD Implementation Ready，曾同時納入 provider CAS、owner-private overlay、Firestore降級與remote-only restore；產品／QA／QC未執行。
- 2026-09-04：依 RD技術主管審查移除 Phase 0 cloud/CAS/tombstone/remote-only restore過度設計；Phase 0 收斂為 local safety slice，改採 app內離開自動 force-flush、明確本機 discard與全 provider 0 remote recovery request。Phase 1保留Contract Ready，future cloud改要求獨立 authority與ADR。
- 2026-09-04：完成 Phase 0 local implementation、deterministic failure harness、2,000ms force-flush timeout、canonical cleanup abort／retry readback、四個 provider adapter checkpoint spy、開新／開舊入口、discard 取消／abort focus、provider／正式紀錄／event failure isolation、store action／Undo push failure injection evidence；DEV-106 browser 14/14、static、既有 DEV-010／020／069／094／105 回歸與 type/lint/build 全數 PASS，Phase 0 QA/QC gate 封關；Phase 1 readiness與正式 release仍未完成。
- 2026-09-08：依使用者決策做 UI 意圖性替換；live meeting 移除語意不明的 X，既有 overflow 收斂為 `儲存草稿`、`儲存並離開`、`刪除並離開`。前兩者明示 canonical save 是否伴隨離開；danger action 只更名並保留 local discard／canonical baseline 不 hard delete 的安全邊界。
