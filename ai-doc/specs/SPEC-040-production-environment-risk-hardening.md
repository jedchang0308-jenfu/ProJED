# SPEC-040: 正式環境同型 BUG 風險硬化與驗證

狀態: Production Release Deployed / Original BUG Smoke Passed / P0 Local Addendum Implemented / P0 Remote Read-only Preflight Executed / Extended Matrix Partially Covered
關聯 DEV: DEV-040
建立日期: 2026-07-03
文件責任: Dev PM / RD / QA

## Human Decision Brief

決策來源:
- 使用者回報正式環境出現 2 個本機環境不易重現的 BUG：
  - 新增會議記錄 > 匯入 > 整理專案變化，正式環境卡住不動。
  - 全域任務平台新增未歸位任務後，切換不同看板任務消失。
- 使用者要求依原因分析推導，評估其他可能 BUG，並由 QA 針對 7 點制定驗證計畫。
- 使用者要求 Dev PM 寫成開發文件。

已確認決策:
- 本 DEV 以正式環境差異造成的同型風險為主，不只處理已發生的 2 個症狀。
- 本 DEV 的範圍包含 7 個高風險點：備份匯入 dependencies、RAG/知識檢索 timeout、新增看板 temp id race、成員 stale response、標籤 stale response、Google Calendar timeout、心智圖 localStorage-only 語意。
- Phase 0 原始範圍先建立開發文件與 QA 驗證計畫；後續 hotfix slice 已完成產品程式修正與 local/source/browser automated QC。
- 使用者後續已授權正式環境驗證；本輪已完成 Firebase Hosting production deploy 與原始 2 BUG flow 的正式站 authenticated UI smoke。
- 2026-07-06 使用者已授權 Phase 1 P0 bounded-failure local addendum；已完成備份匯入 dependencies persistence 與 RAG / knowledge retrieval timeout/fallback 的本機 RD + automated QC。
- 2026-07-07 已完成 Phase 1 P0 production read-only preflight：production project `ProJED` healthy；`wbs_dependencies` table / RLS / constraints / policies 存在且目前有資料；`match_project_knowledge` DB RPC 權限符合 authenticated-only 呼叫，但 deployed Edge Function `match_project_knowledge` version 4 尚未包含本地 timeout guard，故 Edge deploy、production timeout injection 與完整 DB count smoke 仍未完成。
- 本 DEV 仍不得宣稱 7 點延伸矩陣全部關閉；member/tag stale、Google Calendar REST timeout、MindMap 跨裝置語意與完整備份匯入 DB count 仍需後續專項驗證。

AI assumptions:
- 正式環境問題的主要共因是 async operation 沒有 bounded failure、workspace/board 切換時 stale response 覆蓋新狀態、以及 local-only 資料與正式資料來源語意不清。
- P0 優先處理會導致資料遺失或 UI 無限等待的項目；P1 處理切換競態與 stale overwrite；P2 處理外部服務 timeout 與需要產品語意確認的 local-only 資料。
- 心智圖 note relationships / root side overrides 目前先視為「可能 BUG」。若使用者確認它們只是此裝置偏好，則只需文件化與 QA negative test；若確認是專案資料，才進入後端同步設計。

Rejected / not authorized:
- 不跳過 QA/QC gate 直接部署正式環境。
- 不在未授權下修改 Supabase schema、RLS、migration 或正式資料。
- 不把 localStorage-only 心智圖資料自動升級成雲端專案資料，除非使用者明確確認產品語意。

Re-entry triggers:
- 需要 production deploy、遠端 migration、正式資料修復或資料刪除。
- RAG / Google Calendar timeout policy 會引入額外 token、第三方 API 成本或付費服務。
- 心智圖 localStorage-only 資料要改成跨裝置專案資料。
- 發現正式資料已遺失，需要補資料、重跑匯入或人工修復。

使用思考習慣: #多層次分析、#可驗證性、#風險分級

## Problem

本機測試通過但正式環境出錯，代表風險不只在單一 UI flow，而是在正式環境才明顯放大的系統性條件：

- 正式環境網路、Edge Function、RPC、第三方 API 可能慢、失敗或被瀏覽器中止。
- Supabase / Google OAuth / 多 workspace board 切換會讓 response 回來順序與使用者當下畫面不一致。
- localStorage / memory cache 與 Supabase sync 的資料來源真相不一致時，hard reload 或切換看板會覆蓋使用者剛新增的資料。
- 有些功能在本機是單帳號單裝置可用，但正式環境需要跨裝置、權限與資料持久化語意。

## Scope

DEV-040 包含以下 7 個風險點的 RD contract 與 QA gate：

1. 備份匯入後 dependencies 可能消失。
2. RAG / 知識檢索可能重演正式環境卡住。
3. 新增看板 temp id 與 Supabase sync 競態。
4. 成員 / 權限資料 stale response 覆蓋當前看板。
5. 標籤同步 workspace overlap / stale response。
6. Google Calendar fetch 無 timeout，批量同步可能卡住。
7. 心智圖 localStorage-only 資料語意不清，可能清快取或換裝置消失。

## Out of Scope

- production deploy、rollback、正式 smoke；同 spec Phase 4 管控，需使用者授權與 deployment-release-gate。
- 遠端 Supabase schema/RLS/migration；若 RD 發現需要，停止並回報。
- 正式資料修復、資料刪除、補匯入；分類為 Blocked Human Re-entry。
- DEV-039 已完成的全域任務平台 filter / placement lanes 本體重構；本 DEV 只處理同型正式環境風險。
- DEV-037 行事曆訂閱 ICS feed source scope；本 DEV 只處理前端 Google Calendar REST sync timeout。
- DEV-027 心智圖視覺或互動 polish；本 DEV 只判定 localStorage-only 資料歸屬與風險。

## End-State Architecture

正式環境同型風險硬化完成後，ProJED 應符合以下不可破壞規則：

- 任何外部 I/O、Edge Function、RPC、第三方 API、長查詢都必須有 timeout、visible error 或 deterministic fallback；不得讓使用者只看到無限 spinner。
- 任何 workspace / board / modal context 切換後才回來的 response，不得覆蓋當前 context 的資料。
- 任何使用者剛新增或匯入的資料，必須有明確 source of truth；若仍是 local-only，UI / QA 文件要標明它是此裝置資料或暫存資料。
- 匯入、同步、切換看板、hard reload 後，任務、依賴、成員、標籤與心智圖資料不得 silent disappear。
- 正式環境驗證必須能留下 DB count、Network / Console、UI 截圖與 verifier command evidence。

## Architecture Memory Capsule

同型失效模式:
- Bounded failure 缺口：正式環境 I/O 無 timeout，使用者流程卡住且沒有錯誤狀態。
- Source-of-truth 缺口：local cache / memory 新資料被 Supabase sync 的 older snapshot 覆蓋。
- Stale-response 缺口：快速切換 workspace / board 後，舊請求晚回覆覆蓋新畫面。
- Persistence-semantics 缺口：localStorage-only 資料在本機像正常資料，正式使用時卻可能因換裝置或清快取消失。

涉及模組:
- `src/services/dataBackend.ts`：備份匯入與資料後端入口。
- `src/store/useWbsStore.ts`：任務 nodes、dependencies 與 setNodes merge 行為。
- `src/services/rag/ragRetrievalService.ts`、`supabase/functions/match_project_knowledge/index.ts`：RAG 查詢與 Edge Function。
- `src/store/useBoardStore.ts`：新增看板 temp id 與 active board sync。
- `src/store/useMemberStore.ts`、`src/hooks/useMemberSync.ts`：成員 / 權限載入。
- `src/hooks/useTagSync.ts`：workspace tag 同步。
- `src/services/googleCalendarService.ts`：Google Calendar API 呼叫與批量同步。
- `src/components/MindMap/mindMapRelationshipStorage.ts`、`src/components/MindMap/mindMapSideStorage.ts`：心智圖 localStorage-only 資料。

不可破壞規則:
- 不得以「本機 verifier passed」取代 production-like Supabase / OAuth / reload / cross-board smoke。
- 不得用全域 store clear 或 setNodes replace 讓 local-only pending data 消失。
- 不得在舊 request 完成時只靠 setState 覆蓋，不檢查 workspaceId / boardId / request sequence。
- 不得把 timeout 失敗吞掉成成功；UI 必須可見失敗、fallback 或 retry。

## Phase Roadmap

### Phase 0: PM / QA Documentation

Authorization: Authorized
Document status: Done

Scope:
- 建立 DEV-040 spec、QA plan、dev_task 與 documentation map 索引。
- 將 7 個可能 BUG 轉成 RD handoff contract、QA cases、stop conditions 與 evidence required。

Out of scope:
- 不修改產品程式。
- 不執行 production deploy、remote migration 或資料修復。

Acceptance:
- DEV-040 已在 `ai-doc/dev_task.md` 登錄。
- `documentation_map.md` 指向 SPEC-040 與 QA-DEV-040。
- 所有 deferred scope 已分類。

Evidence:
- 文件 diff。

### Phase 1: P0 Bounded Failure 與資料持久化硬化

Authorization: Authorized / Local implementation complete; Edge deploy and production injection not authorized
Document status: Implemented / Local Automated QC Passed / Remote Read-only Preflight Executed / Edge Deploy Pending / Production Injection Not Executed

Purpose:
- 先處理會造成資料遺失或 UI 卡死的最高風險點。

Scope:
- 備份匯入 dependencies persistence：匯入、Supabase restore、hard reload 後，`wbs_dependencies` 與 UI dependency lines 不消失。
- RAG / knowledge retrieval timeout：`match_project_knowledge` / Edge Function / Gemini fetch 有 timeout、visible error 或 fallback。

Out of scope:
- 不新增 schema，除非 RD 證明現有 `wbs_dependencies` 不足；若需要 migration，停止。
- 不更換 RAG 模型或新增付費外部服務。
- 不修正 Google Calendar、member、tag、board race；這些在 Phase 2 / 3。
- 不部署 `match_project_knowledge` Edge Function、不做 production timeout injection、不做完整備份匯入後 Supabase `wbs_dependencies` DB count smoke；這些需另行 gate。

Implementation contract:
- 匯入 dependencies：
  - 檢查 local import path 與 Supabase import path 對 `nodes` / `dependencies` 的處理是否等價。
  - Supabase import 若清空 `wbs_dependencies`，必須重建 dependency rows，且 node legacy id remap 後 from/to 都指向新 item。
  - import 應回報 nodes count、dependencies count；失敗需保留可見錯誤，不得 silent partial success。
  - hard reload 後從 Supabase 重新讀取，dependency count 與 UI 線條應一致。
- RAG timeout：
  - client service 呼叫需有 timeout / abort signal 或 supabase invoke timeout。
  - Edge Function 若呼叫 Gemini / RPC timeout，需回傳可辨識錯誤或空結果 fallback。
  - UI 端不得無限 loading；需顯示重試、縮小查詢或暫無結果。
  - timeout 失敗不得污染 knowledge cache 或生成偽引用。

Data / API / permission impact:
- 優先使用既有 `wbs_dependencies` table 與 RLS。
- RAG 權限維持 authenticated user 與既有 RLS，不放寬 anon / public execute。
- 若需要新增 index / RPC / Edge Function env，進入 stop condition。

QA/QC gate:
- Local gate 已通過：`verify:dev-040-p0-bounded-failure`、TypeScript、targeted ESLint、`verify:p9-edge-function`、`verify:supabase:static`、DEV-020 regression 與 `build:test`。
- 2026-07-07 production read-only preflight 已確認 production `wbs_dependencies` 表、RLS、FK/unique constraints、project index、policy 與目前 dependency rows 存在；`match_project_knowledge` DB RPC 已限制 anon execute=false、authenticated/service_role execute=true。
- Remote Edge parity 未通過：deployed `match_project_knowledge` version 4 尚未包含本地 `GEMINI_*_TIMEOUT_MS`、`RAG_RPC_TIMEOUT_MS`、`LIVE_SNAPSHOT_TIMEOUT_MS` 與 `fetchWithTimeout` / `withTimeout` guard。
- Edge deploy、production timeout injection 與完整備份匯入 DB count smoke 尚未執行；不得用 local automated QC 或 read-only preflight 取代 live gate。

Stop conditions:
- 匯入 dependencies 需要 schema/RLS/migration 才能安全保存。
- 發現正式資料已經遺失，需要資料修復。
- RAG timeout policy 會增加 token / 外部服務成本或改變引用可信度。

Evidence required:
- 匯入前後 `wbs_dependencies` count、hard reload 後 count、UI dependency line 截圖。
- RAG timeout / error network evidence、UI 結束狀態截圖、Console 無未處理錯誤。
- 已完成 local evidence 記錄於 `ai-doc/qc/QC-DEV-040-production-environment-risk-validation.md`；live evidence 需另行授權後補。

### Phase 2: P1 Context Race / Stale Response 硬化

Authorization: Not Authorized
Document status: RD Contract Ready / Not Authorized

Purpose:
- 修正快速切換 workspace / board / view 後，舊資料覆蓋新畫面的風險。

Scope:
- 新增看板 temp id 與 Supabase sync race。
- member / permission stale response。
- tag sync stale response 與 workspace overlap。

Out of scope:
- 不改 Workspace / Board 核心資料模型。
- 不重做分享權限 UI 或 tag 系統 IA。
- 不執行 production deploy。

Implementation contract:
- 新增看板 temp id：
  - `addBoard` 必須有明確 pending create 狀態，後端正式 id 回來後原子替換 temp id。
  - activeBoardId 不得被中間 sync 清成不存在 board 或切回首頁。
  - create failure 必須移除 ghost board 並顯示錯誤。
  - hard reload 後不得保留 temp id。
- 成員 stale response：
  - `loadMembers(workspaceId, boardId)` 回來時必須確認當前 context 或 request token。
  - 權限 CTA、member list、invite state 必須只反映當前 board。
  - 切換過程可以顯示 loading skeleton，但不得顯示前一看板的可操作權限。
- 標籤 stale response：
  - tag load / subscription response 必須綁定 workspaceId。
  - workspace 切換時 invalid tag filters 必須清除或標為 unavailable，不得殘留套用。
  - 建立 / 刪除 tag 不得寫入錯 workspace。

Data / API / permission impact:
- 預期為 client store / hook 層修正，不需要 schema。
- 若 board creation 需要 backend transaction 或 RPC，停止並回報 Phase 2 擴權。

QA/QC gate:
- QA-P1-001 到 QA-P1-009 必須通過。
- 需包含快速切換、hard reload、create failure、不同角色權限、不同 workspace tags。

Stop conditions:
- board id remap 需要改正式資料模型。
- 權限問題需要 RLS policy 變更。
- tag 資料已跨 workspace 污染，需要資料修復。

Evidence required:
- 快速切換錄影或逐步截圖。
- DB / localStorage 檢查 temp id 不殘留。
- Network response 順序與 UI 最終 state 證據。

### Phase 3: P2 External Service Timeout 與 Local-only 語意決策

Authorization: Not Authorized
Document status: RD Contract Ready / Not Authorized；心智圖雲端同步為 Blocked Human Re-entry

Purpose:
- 處理較低頻但正式環境會造成長時間卡住或資料預期落差的風險。

Scope:
- Google Calendar REST API fetch timeout / batch sync bounded failure。
- 心智圖 note relationships / root side overrides localStorage-only 的產品語意判定與 guardrail。

Out of scope:
- 不重做行事曆訂閱 ICS feed。
- 不新增通知系統。
- 不自動把心智圖 localStorage 資料上雲。

Implementation contract:
- Google Calendar：
  - `apiCall` 增加 timeout / AbortController。
  - `syncAll` 批次同步每筆 event 失敗需累積 result，不得讓整個 UI 卡死。
  - token expired / 401 / 403 需顯示重新授權；500 / timeout 需顯示 retry。
  - 批量 50 筆以上需能結束並回報成功 / 失敗統計。
- 心智圖 localStorage-only：
  - 若定位為本機偏好：文件化 UI / QA 語意，清快取或換裝置消失不算資料遺失，但不得破壞任務資料。
  - 若定位為專案資料：需另開或同 phase 擴充後端同步設計，包含 schema/RLS/migration、跨裝置 merge、權限與資料修復策略。

Data / API / permission impact:
- Google Calendar 預期只改 client timeout 與 error handling。
- 心智圖雲端同步會觸發 schema/RLS/migration，未授權。

QA/QC gate:
- QA-P2-001 到 QA-P2-006 必須通過。
- 心智圖若維持本機偏好，QA 需驗證清 localStorage 後任務主資料不受損。

Stop conditions:
- Google Calendar timeout policy 需要付費服務或改 OAuth scope。
- 心智圖產品語意需使用者決策。
- 需要遠端 migration 或資料修復。

Evidence required:
- Google Calendar timeout / 401 / 500 / 50 items sync 截圖與 console/network evidence。
- 心智圖 localStorage clear / cross-browser 行為截圖與資料不破壞證據。

### Phase 4: Production Release / Smoke Gate

Authorization: Authorized for this hotfix production verification
Document status: Production Release Deployed / Original BUG Smoke Passed / Extended Matrix Partially Covered

Scope:
- 將已完成並通過 local / production-like QC 的修正部署正式環境。
- 執行 production smoke：本輪已完成原始 2 BUG flow 的正式站 authenticated UI smoke；7 點延伸矩陣剩餘項需另行排程。

Out of scope:
- 不做正式資料修復、schema/RLS/migration 或延伸矩陣剩餘項的高風險操作，除非另行授權。

Entry condition:
- Phase 1 至少完成 P0 gate；是否包含 Phase 2 / 3 由使用者授權範圍決定。
- local lint / TypeScript / build / targeted verifier 通過。
- deployment-release-gate 啟動。

Acceptance:
- 正式環境不再出現已知 2 個 BUG。
- P0/P1 原始 flow 在正式環境有 UI 結束狀態、正式 Supabase 臨時資料、Network / Console evidence。
- 延伸 7 點未完成項必須在 QC 文件明列，不得過度宣稱。

Evidence:
- deployment-release-gate evidence、production URL、commit / branch、smoke 截圖、rollback readiness。

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 PM / QA Documentation | Authorized | Done | SPEC-040、QA-DEV-040、dev_task、documentation_map | 程式修改、deploy、migration、資料修復 | 使用者要求寫成開發文件 | 文件與索引完成，deferred scope 已分類 | 文件 diff |
| Phase 1 P0 Bounded Failure + Persistence | Authorized / Local complete | Implemented / Local Automated QC Passed / Remote Read-only Preflight Executed / Edge Deploy Pending / Production Injection Not Executed | dependencies import persistence、RAG timeout/fallback | schema/RLS/migration、模型更換、Edge deploy、production injection、完整 DB count smoke | 使用者授權 RD | 本機 verifier 無資料遺失、無無限 loading；read-only preflight 確認 production DB substrate；live Edge parity 仍待 deploy gate | local verifier、TypeScript、build、Edge source static、production DB read-only preflight；live DB count / Network evidence pending |
| Phase 2 P1 Context Race / Stale Response | Not Authorized | RD Contract Ready / Not Authorized | addBoard temp id race、members、tags stale guard | core data model、RLS、deploy | Phase 1 or direct authorization | 切換後 UI state 只屬於當前 context | rapid-switch evidence、DB/localStorage evidence |
| Phase 3 P2 External / Local-only Semantics | Not Authorized | RD Contract Ready / Not Authorized; MindMap cloud sync Blocked Human Re-entry | Google Calendar timeout、MindMap local-only guardrail | ICS feed、notification、cloud sync without decision | 使用者授權；MindMap 語意需決策 | API timeout 可見結束；local-only 不破壞主資料 | timeout evidence、localStorage clear evidence |
| Phase 4 Production Release / Smoke | Authorized | Production Release Deployed / Original BUG Smoke Passed / Extended Matrix Partially Covered | deploy、formal smoke、rollback readiness | 正式資料修復、完整備份匯入 DB count、member/tag delayed response、Google Calendar REST timeout、MindMap cloud semantics | RD/QC passed + 使用者正式環境驗證授權 | 原始 2 BUG 正式站 smoke 通過；延伸 7 點剩餘項明列 | deployment-release-gate evidence、production authenticated UI smoke |

## Deferred Scope Audit

| Deferred scope | Classification | Tracking / reason |
|---|---|---|
| production deploy / production smoke | Same Spec Phase | Phase 4 已完成原始 2 BUG flow production smoke；延伸矩陣剩餘項另行追蹤。 |
| remote schema / RLS / migration | Blocked Human Re-entry | 若 Phase 1-3 發現需要，停止並回報；不得自行執行。 |
| 正式資料修復 / 補匯入 / 刪資料 | Blocked Human Re-entry | 涉及正式資料風險，需使用者明確授權、備份與 rollback plan。 |
| 心智圖 localStorage 資料雲端同步 | Blocked Human Re-entry | 產品語意未確認；若定位為專案資料才新增後端同步設計。 |
| Google Calendar subscription ICS source scope | New DEV | 已由 DEV-037 管控，本 DEV 不重複。 |
| DEV-039 工作台 filter / placement lanes 功能重構 | No Tracking | DEV-039 已有 SPEC/QA/QC，本 DEV 只處理同型正式環境風險。 |
| DEV-004 全人待辦平台 / notification / formal Inbox cloud sync | New DEV | 非本輪正式環境風險硬化範圍，續接既有 DEV-004 umbrella。 |

## RD Acceptance

DEV-040 任一實作 phase 完成時，必須同時滿足：

- 使用者流程有 bounded completion：成功、錯誤、fallback、retry 或可見取消，不得無限等待。
- 快速切換 workspace / board / view 後，舊 response 不覆蓋當前 context。
- hard reload 後資料與 DB / localStorage 語意一致。
- Console 無 unhandled promise rejection；Network 4xx/5xx 有可見 UI 行為。
- 新增 verifier 或更新既有 verifier，避免同型問題回歸。
- 文件更新 dev_task / QA / QC evidence，不只修改程式。

## QA / QC Gate

最小 gate:
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- 對應 targeted verifier。
- production-like Supabase manual smoke。

建議 targeted verifier:
- dependencies import persistence verifier。
- RAG timeout / fallback verifier。
- board create temp-id race verifier。
- members stale-response verifier。
- tag workspace stale-response verifier。
- Google Calendar timeout verifier。
- MindMap localStorage semantics verifier。

QC 必須保留:
- 操作前 / 後截圖。
- hard reload 後截圖。
- Console error sweep。
- Network 4xx/5xx / timeout evidence。
- DB count 或 localStorage evidence。
- 測試命令與 pass/fail 結果。

## Stop Conditions

- 任何 phase 需要 production deploy、remote migration、資料修復或資料刪除。
- 心智圖 local-only 資料要改為跨裝置專案資料，但尚未取得使用者語意決策。
- timeout fallback 會產生錯誤資料、偽引用或讓使用者誤以為 AI 成功。
- stale-response 修正需要放寬權限或修改 RLS。
- 無法重現或無法留下 evidence，但準備宣告正式環境已修復。

## Evidence Required

每個 BUG 風險點至少需有：

- 一個 automated verifier 或 static contract check。
- 一個 production-like manual case。
- 一個失敗模式 case，例如 timeout、401/500、舊 response 晚回覆、hard reload、清 localStorage。
- 一個資料持久化證據，例如 DB count、localStorage key、active id、UI identity。

正式 release 前必須另由 deployment-release-gate 產出 deploy evidence 與 rollback readiness。
