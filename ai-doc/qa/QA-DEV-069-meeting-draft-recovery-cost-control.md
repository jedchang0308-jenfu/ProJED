# QA-DEV-069：會議草稿 F5 復原與低成本雲端備份驗證計畫

- 關聯 DEV：DEV-069
- 規格：SPEC-069、SPEC-003、SPEC-010
- QA 狀態：Executed local-test／browser cases PASS；provider smoke pending
- QC 狀態：Local Browser QC PASS；Supabase／Firestore provider gate pending
- 風險：Medium

## 1. 驗證策略

本計畫分四層：純函式／儲存契約、provider request-count、真實 F5 browser flow、rendered UI/手機負向回歸。QA 設計測試與證據格式；QC 必須以實際程式、網路紀錄、IndexedDB/sessionStorage 與真實 rendered 畫面判定，不可只看 RD 自述或 source scan。

Required gate 必須使用 deterministic clock / network seam，否則無法可靠證明 20 秒、180 秒、rolling hour、backoff 與 single-flight。

## 2. FMEA 風險優先順序

| 失效模式 | 影響 | 風險 | 必要控制／證據 |
|---|---|---:|---|
| F5 後草稿仍遺失或欄位不完整 | 核心需求失敗 | 高 | immediate F5、debounced F5、full snapshot deep equality |
| UI 提前顯示已保存／已備份 | 使用者錯誤信任 | 高 | signature 對照與 delayed/failing storage/network |
| 每次輸入打 server | 成本失控 | 高 | route interception；100 次輸入 network=0 |
| retry storm / F5 重置配額 | 成本失控 | 高 | rolling ledger、backoff、F5、多 tab lease |
| checkpoint 觸發 task-link rebuild 或 RAG | 額外寫入與 AI 成本 | 高 | provider spy + Supabase table delta/RAG counters = 0 |
| 自動 checkpoint 覆寫 published/archived | 正式資料退回草稿 | 高 | provider status conflict fixture |
| 跨帳號／跨 board 恢復 | 資料外洩 | 高 | owner/scope mismatch、logout cleanup |
| 手機出現 meeting editor/status | 違反產品邊界 | 高 | 390 DOM 與 action guard negative checks |
| sessionStorage/IndexedDB 其中一層失敗卻無告警 | F5 保護能力被誤判 | 中 | degraded/error matrix |
| 手動存草稿／發布、undo、RAG 回歸 | 既有流程退步 | 高 | DEV-007/008/009/010/020 regression |

## 3. Test Harness / 可測性要求

- `recordDraftCheckpointPolicy` 接收 `now`、attempt ledger、last change、last attempt/success、retry count、online、payload bytes，純函式輸出 eligibility / nextAt / reason。
- persistence service 注入 IndexedDB/sessionStorage facade，測試 quota、open failure、out-of-order async completion。
- provider adapter 可注入 client spy；禁止只用 source regex 宣稱 request count。
- browser verifier 可攔截 Supabase/PostgREST 或 Firestore request，記錄 method、URL、payload bytes 與時間。
- F5 case 必須使用真實 `page.reload()`，不可用 store action 模擬 restore。
- browser script 只連既有 `BASE_URL`；不得自行停止／重啟受保護的 127.0.0.1:4173。若另開臨時 runtime，需依 workspace lifecycle 規則登記、清理並確認 4173 仍健康。

## 4. Automated Contract Cases

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-069-001 | P0 | snapshot round-trip：title/content/participants/time/visibility/metadata/taskLinks/activity buffer/appended IDs/cursor/baseline/signatures 全值相等，token/session 不在 payload |
| QA-069-002 | P0 | 連續變更 500ms debounce 只落最新 signature；舊 IndexedDB promise 晚完成不得覆寫新值 |
| QA-069-003 | P0 | `pagehide` / immediate F5 在 500ms 前仍由 sessionStorage emergency copy 恢復最新字元 |
| QA-069-004 | P1 | IndexedDB 成功=`saved`；IDB fail + session success=`degraded`；兩者 fail=`error`，文案不得提前成功 |
| QA-069-005 | P0 | TTL >7 天、schema 錯誤、owner/workspace/board/draft mismatch 均不恢復並安全清理 |
| QA-069-006 | P0 | logout、直接離開、放棄後開新紀錄、封存、發布成功清除；手動存草稿但仍在 meeting mode 不清除 |
| QA-069-007 | P0 | 只有預設 meeting draft 不送 server；有實質變更後 idle 20 秒才 eligible；持續輸入最多 5 分鐘送最新值 |
| QA-069-008 | P0 | 100 次 keystroke 在 20 秒內 server request=0；本機 write 可 debounce，不跟 server 耦合 |
| QA-069-009 | P0 | 任兩次 attempt >=180 秒；rolling 60 分鐘最多 20，成功與失敗都計數；F5 後 ledger 不歸零 |
| QA-069-010 | P0 | backoff 3m/5m/15m/30m；排程期間內容改變只替換 latest payload，不建立 retry queue |
| QA-069-011 | P0 | offline 10 分鐘與 F5 仍可本機恢復；online 後只送最新 snapshot 一次，且仍受 180 秒／20h 限制 |
| QA-069-012 | P1 | 兩 tab 同 draft 以 Web Lock / lease 僅一個 checkpoint in flight；lease holder crash 後 30 秒可接手 |
| QA-069-013 | P0 | payload 512KiB 可送，>512KiB 設 oversize 且同 signature 0 request；本機內容完整保留 |
| QA-069-014 | P0 | Supabase new insert / existing draft update 各為單一 knowledge-record request；0 record_task_links mutation、0 RAG call、0 full reload、0 per-checkpoint getUser；legacy scope 首次 resolver 各最多 1 read 且後續 cache hit |
| QA-069-015 | P0 | Supabase update 條件含 `status='draft'`；published、duplicate insert、RLS no-row 轉 typed conflict，不自動改 ID 重送 |
| QA-069-016 | P0 | Firestore 每 checkpoint 最多 1 read + 1 write；published/archived transaction 不寫入並回 conflict |
| QA-069-017 | P1 | local-test stable UUID replace，不產生 duplicate；deterministic clock/network seam 可覆蓋所有 policy branches |
| QA-069-018 | P0 | checkpoint 前後 documents/document_versions/chunks/embeddings/RAG jobs/event logs/undo stack delta 全為 0 |
| QA-069-019 | P0 | 手動存草稿仍 normalize task links、更新 baseline/records/feedback/undo；發布仍走既有 RAG lifecycle，checkpoint 不把 UI 標成已發布 |
| QA-069-020 | P0 | remote published 或 remote newer+different 顯示三選項；restore-as-new 產生新 UUID，cloud choice 清 local，later choice 不送 request |

## 5. Rendered Browser / QC Cases

| Case | Viewport | Priority | 步驟／Expected |
|---|---:|---:|---|
| QA-069-021 | 1440x900 | P0 | 建立 meeting、修改所有支援欄位與 task activity，立即 F5；恢復 meeting panel/mode、資料與游標，不自動發布／AI整理 |
| QA-069-022 | 1024x768 | P0 | 同上，含側欄展開／收合；保存狀態單一、可讀、`aria-live=polite`，無遮擋、裁切、水平 overflow |
| QA-069-023 | 1440/1024 | P0 | 人工延遲／失敗 local 與 cloud；依序看到 saving/saved/degraded/error/offline/rate/oversize/conflict 正確文案，無 raw API error、undefined/null |
| QA-069-024 | 390x844 | P0 | 無新增／補會議入口、meeting list row、meeting editor、restore dialog、local/cloud 保存狀態；直接 action/event 也不能開 meeting；非 meeting work log 不受影響；meeting snapshot/network request 均為 0 |
| QA-069-025 | all | P1 | 掃描 role alert、inline error、toast、console error、page error、overflow；無產品可見錯誤或非本 DEV 回歸 |

## 6. Provider / Cost Evidence Matrix

QC evidence 必須輸出可機讀摘要：

```json
{
  "keystrokes": 100,
  "localLatestSignature": "...",
  "checkpointAttemptsIn60m": 20,
  "maxConcurrentCheckpoint": 1,
  "supabaseRecordRequests": 20,
  "supabaseTaskLinkMutations": 0,
  "firestoreReads": 20,
  "firestoreWrites": 20,
  "ragDocumentDelta": 0,
  "ragVersionDelta": 0,
  "chunkDelta": 0,
  "embeddingDelta": 0
}
```

- 未使用該 provider 的本地開發環境可用 adapter spy / emulator 證明 contract，但 release 前若該 provider 為 production backend，必須補真實 provider smoke。
- server request 上限以 attempt 為準；timeout/5xx 也算，不得只算成功寫入。
- QC 另輸出 `activeBrowserHours * attemptLimit` 容量試算；8h × 22d fixture 應為 3,520 attempts，並分別換算 Supabase mutation 與 Firestore read/write 上限。
- Supabase 可能對 GET/HEAD 做 client 自動 retry；本 DEV checkpoint 是 mutation，不得假設 SDK 會代管 retry。

## 7. Regression Boundary

- `verify:dev-007-meeting-activity`
- `verify:dev-008-task-knowledge`
- `verify:dev-009-task-detail-quick-note`
- `verify:dev-010-action-feedback`
- DEV-020 meeting desktop workflow 既有 browser verifier
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `npm.cmd run verify:dev-069-meeting-draft-recovery`
- `npm.cmd run verify:dev-069-meeting-draft-recovery-browser`

若現有 package script 名稱與上述歷史 verifier 不一致，RD 先以 `package.json` 實際名稱為準並在 QC 記錄對應，不得靜默略過。

## 7.1 Execution Addendum（2026-08-17）

- 已執行：DEV-069 static verifier、真實 `page.reload()` F5 flow、1440x900、1024x768、390x844 negative boundary、visible-error sweep。
- 已執行：DEV-007、DEV-008、DEV-009、DEV-010、DEV-020 meeting／record regression、TypeScript、production build。
- browser evidence：`output/playwright/dev-069/browser-1440-after-reload.png`、`browser-1024.png`、`browser-390-negative.png`。
- 未執行：真實 Supabase／Firestore request-count、RLS／transaction emulator、storage failure injection、offline 10 分鐘與雙 tab race；這些維持 provider smoke pending，不轉寫為 PASS。
- 詳細 QC 結論：`ai-doc/qc/QC-DEV-069-meeting-draft-recovery-cost-control.md`。

## 8. QC Evidence Required

- targeted verifier 完整輸出、TypeScript/build 與既有回歸結果。
- 1440x900、1024x768、390x844 screenshots；390 僅證明 meeting 功能不存在。
- F5 前後 snapshot key、schema、signature、欄位 equality（敏感內容以 hash/fixture，不貼真實會議資料）。
- network trace / adapter spy：request count、method、target table/document、payload bytes、in-flight max、attempt timestamps。
- local persistence failure matrix與 visible copy。
- Supabase/Firestore status conflict 證據與 RAG/task-link delta。
- `ai-doc/qc/QC-DEV-069-meeting-draft-recovery-cost-control.md` 記錄實測、findings、殘餘限制；未執行前不得建立 PASS 結論。

## 9. Exit Criteria

- QA-069-001～025 required cases 全部 PASS。
- P0/P1 finding = 0；P2 若 deferred 必須有 owner、影響與 re-entry。
- 未執行 production deploy/release；本 QA PASS 只代表本機／測試環境 implementation readiness 已驗證。
