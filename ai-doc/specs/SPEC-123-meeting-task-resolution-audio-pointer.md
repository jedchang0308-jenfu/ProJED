# SPEC-123：會議錄音、滑鼠線索與既有任務辨識

- 狀態：`Architecture Confirmed / Production Control Plane Deployed / Hosted Synthetic PASS / Frontend Feature-Gated / Provider Qualification Gate Pending`
- 文件角色：DEV-123 current-phase implementation authority
- 建立日期：2026-09-14
- Source revision：branch `持續優化3`；發布身分由 release manifest 的 source commit、tree SHA 與逐檔 hash 固定
- 需求來源：`USER-20260914-MEETING-TASK-RESOLUTION`、`USER-20260914-POINTER-DWELL-EVIDENCE`、`USER-20260914-ARCHITECTURE-CONFIRMATION`
- 架構記憶：[ADR-051](../decisions/ADR-051-projed-owned-meeting-analysis-pipeline.md)
- QA authority：[QA-DEV-123](../qa/QA-DEV-123-meeting-task-resolution-audio-pointer.md)
- DEV：[DEV-123](../dev_task.md#dev-123會議任務辨識與滑鼠停留輔助連結)
- 相容契約：[SPEC-109](SPEC-109-meeting-live-task-change-capture.md)、[SPEC-110](SPEC-110-unplaced-task-meeting-record-boundary.md)、[SPEC-117](SPEC-117-cross-mode-meeting-session-continuity.md)、[ADR-049](../decisions/ADR-049-meeting-session-view-independence.md)

## 1. Current-phase outcome

具會議編輯權限的主持人在既有會議草稿中手動按「開始錄音」後，ProJED 以主持電腦麥克風收音，同步記錄游標停在哪個 canonical task surface。停止後先完成音訊分段上傳，再由 ProJED 擁有的非同步工作逐段轉錄、產生同看板合法候選、以逐字稿及滑鼠線索判定討論任務，最後將明確連結及模糊候選放回同一會議草稿供人工修正。使用者仍是唯一發布者。

首版成功條件：

- 60 分鐘會議自「所有音訊分段完成上傳」起，正常成功路徑 24 小時內得到可重新讀取的草稿結果。
- 人工修正前，自動段落－任務連結 precision `>= 95%`、recall `>= 90%`；合法 ID、同看板與權限錯誤必須為 0。
- 供應商不得保留可回取的會議內容。若採 Gemini，僅可使用已核准且涵蓋轉錄、embedding、配對及摘要各路徑的專案 ZDR；Interactions 一律 `store=false`，不用 provider background／history／grounding／explicit cache。Files 僅作轉錄必要的推論暫存，完成或失敗都主動刪除並追蹤清理；資格證據不足時不得傳送真實會議內容。
- ProJED 錄音自錄音結束起 7 天可回聽及重新轉錄，到期立即失去讀取／重轉資格並排程刪除。完整逐字稿與採用的配對依據隨會議保存。
- 原始錄音、完整逐字稿、原始滑鼠區間與候選脈絡只供該會議編輯者讀取；閱讀者只讀發布正文、已引用原句及本來就有權讀的任務連結。

speaker diarization、會中即時建議、遠端／系統音訊、跨看板、多操作端、自動建任務、自動發布及 Graphiti 不在 current phase。

## 2. 第一性原理與唯一 truth

本功能要解的是「這段討論對應哪個已存在任務」，不是只把音訊轉成流暢摘要。唯一可落盤的任務 identity 是目前專案中仍合法的 `wbs_items.id`；模型產生的名稱、滑鼠座標、RAG 文件 ID、hover card 或 provider interaction ID 都不能取代 canonical task ID。

五類 truth 分開管理：

| Truth | Authority | 不得冒充 |
|---|---|---|
| 會議 session／draft | `useRecordStore`、`knowledge_records` | view component、錄音 controller |
| 任務 identity／ownership | `wbs_items`、SPEC-110 canonical owner | RAG document、tracking reference、父層 surface |
| 發言內容及時間 | versioned transcript segment + audio-relative offset | ASR 回應到達時間、摘要句 |
| 滑鼠線索 | audio-clock-aligned canonical task interval | 任務異動、人工補記、會議正文事實 |
| 發布內容 | 使用者確認後的 `knowledge_records.content` + `record_task_links` | raw transcript、候選 JSON、模型自報信心 |

滑鼠只改變候選排序及可信度，不能單獨創造一段討論；沒有可引用逐字稿內容時不得自動建立 task link。人工 decision 一旦寫入，後續同來源或重跑不得覆蓋。

## 3. 架構決策與 dependency direction

採用 ProJED-owned durable pipeline。Browser 只負責收音、時間線、分段及受控上傳；Postgres 保存狀態與租約；Supabase Edge worker 每次只處理一個有界單元；Gemini 是無狀態 provider adapter。既有 30 秒同步 `synthesize_meeting_record` 不接收 raw audio／full transcript，也不擁有本流程的排程或重試。

```text
RecordSidebar（手動開始／停止／就地核對）
  ├─ MeetingRecordingControls ─ MediaRecorder ─ local audio outbox
  ├─ TaskInteractionScope ─ canonical pointer interval
  └─ meetingAnalysisService ─ meeting_capture_control Edge Function
                                  ├─ private Storage: `meeting-audio`
                                  ├─ Postgres manifests / run / lease / budget
                                  └─ process_meeting_analysis (Cron + pg_net)
                                       ├─ Gemini Files → Transcribe(store=false) → delete
                                       ├─ Gemini embedding + current WBS candidate RPC
                                       ├─ Gemini structured match/summary(store=false)
                                       └─ transcript / match result / draft projection

useRecordStore remains meeting lifecycle authority
knowledge_records + record_task_links remain published record authority
```

Dependency direction 固定為：component → feature controller／pure contract → service adapter → Edge API → DB／Storage／provider。Component 不直接建立 Storage path、呼叫 Gemini、讀 raw tables或實作匹配門檻。Edge provider adapter 不更新 React／Zustand state。

## 4. Session、capture 與 analysis state machines

### 4.1 Capture state

`idle → preparing → recording ↔ paused → stopping → uploading → uploaded`；
明確取消進 `cancelled`，不可恢復錯誤進 `failed`。狀態由 controller 投影 server capture，不另建 meeting session。

- `startMeetingRecord()` 只進會議模式；明確按錄音才請求 microphone、保存既有 draft、建立 server capture。MediaRecorder.start 成功後才進 recording；server begin 失敗須關 tracks。
- 每個 record 同時最多一個未結束 capture；partial unique constraint 配合 begin idempotency。第二個分頁只能讀狀態，不能接管收音。重載不錄音，只續傳 finalized outbox。
- pause／stop／device loss 均關閉 recorder 與 pointer interval；resume 開新 epoch。view change 僅換 surface，不終止會議。
- `stop-capture` 凍結 end、epoch manifest 及最後 pointer sequence；可重試，不因晚到封包向後延長。
- 活躍 capture 每 60 秒送一次 `capture-progress`，記 server receipt 與最後有效 media offset；失聯 180 秒轉 interrupted。恢復只可提交已 finalized 分段與已記錄 gaps，不自動收音；progress／stop 的 update 會再次套用 server state predicate，並行 cancel 勝出時回 `MEETING_RECORD_CONFLICT`。
- 正常 stopped_at 由 server begin anchor + 可驗證 epoch elapsed 推導，不採 client 任意日期；interrupted 以最後有效 progress／segment end 收斂。七日從這個終點起算；晚到上傳、retry、retranscribe 不延期。

### 4.2 Analysis state與人工狀態

`awaiting_budget → queued → transcribing → retrieving → matching → composing → ready`。
每個 stage 可進 `retry_wait`；run 保存 `resume_stage`。未完成 provider 清理時進 `provider_cleanup_pending`，清理後回 resume_stage；只有全部計算及清理完成才 ready。
取消、到期、不可恢復錯誤分別為 `cancelled | expired | failed_terminal`。終止計算不終止 cleanup／usage reconciliation。

`ready` 是計算終點；review/projection 使用獨立的 `review_revision`／`applied_revision`，不把 reviewed/projected 串入 worker state。零匹配、全 pending、多次人工更正均可表達。
狀態、cursor、lease、next_attempt_at、deadline 由 DB 保存；upload_completed_at + 24h 固定不重設，逾時另記 overdue_at。重試沿用原 deadline，新的分析版本也不得掩蓋原失敗。

manual retry 必須由 `public.retry_meeting_analysis_v1` 在同一 transaction 鎖定 source run 與 capture，再檢查 request key、source version、audio expiry 及 editor 權限；只有 `ready | failed_retryable | failed_terminal` 的 run 與 `stopped | ready | failed_retryable | failed_terminal` 的 capture 可建立新 run。相同 request key 回傳既有 run；capture 已被其他 retry 排入 `queued` 時，衝突 request 直接拒絕，不能留下孤兒 queued run。取消或過期後不得重試。

## 5. 錄音、分段與本機恢復

### 5.1 Browser capture contract

- 單一 `getUserMedia({ audio: true })` microphone stream。優先 WebM/Opus，再以 MediaRecorder.isTypeSupported 及 provider MIME allowlist 選格式；不收集裝置名稱或無用途裝置指紋。
- 目標 64 kbps；每個 **audio segment** 是最長 5 分鐘、可獨立解碼的檔案，不是討論段落。不能把 timeslice 任一 Blob 當獨立檔。輪替可重疊最多 500ms，保存實際區間；較短分段屬相同架構，須通過解碼／邊界驗證。
- 每個 epoch 記 `epochId, captureOffsetMs, monotonicStart, durationMs, gapBeforeMs`。audio 與 pointer 共用 performance.now；錄音暫停時間在 capture timeline 保留為 gap。provider offset 經 segment start 映射到 capture timeline，絕不以回應到達時間對齊。
- finalized Blob 先寫獨立 IndexedDB outbox，scope 為本人／workspace／project／record／capture；transaction complete + readback 後才釋放記憶體。server verified ack 後刪 local Blob。pointer batches 同樣具 pending/ack，無內容寫入 recovery snapshot 或 logs。
- reload 僅續傳本人 finalized 資料；未 finalized 尾段明示 gap。outbox 存 persisted expiry；啟動、登入／帳號切換及讀取前先 purge expired，再顯示或上傳。
- reload 後若只能取得本機 finalized audio、無法重建記憶體中的 pointer batch／完整 manifest，續傳只可把來源凍結為 `partial` 並明示需重新確認；不得以空 pointer hash 或局部 manifest 靜默宣稱 `complete`、排入分析。
- Browser 關閉時無法保證定時實體刪除；本機到期先禁止應用存取，下次開啟即清除。Server Storage 定時清理獨立執行；不得把離線本機清理宣稱為已驗證即時刪除。

### 5.2 Upload、完整性與凍結

- Private bucket `meeting-audio`。server 建不可變 UUID path、segment reservation 與 cleanup obligation，再簽 upload token；client 只能使用回傳 path，不能指定／列舉任意 path。禁止 upsert。
- 每檔上限 10MiB；須小於等於目標 project global／bucket 實際限制。50 MB 是 Supabase Free plan 可設上限，不是所有專案固定設定。超限保留 recovery、顯示錯誤，禁止靜默截斷。
- `complete-segment` 單段讀回 object，驗 bytes／MIME、重新計算 SHA-256 與 declared digest 比對，再 transaction ack；不同 segment 可有相同 hash（例如靜音），同 segment 重送相同 digest no-op、不同 digest conflict。
- index／epoch／offset／gap／overlap 與 pointer batch sequence 完整才可 complete-upload。可明確接受 partial source，但必須提供 missing ranges、pointer loss 標記與 source version；coverage 不得標完整，也不得從品質／SLO失敗統計移除。
- `complete-upload` 由 `public.complete_meeting_upload_v1` 在同一 transaction 鎖 capture／record／verified segments，凍結 source_version、audio manifest hash、pointer manifest hash／missing flag，寫一次 upload_completed_at、建立唯一 run；有額度 queued，無額度 awaiting_budget。重送同一 manifest 只回既有 run，不重複建立 run 或預留第一次 worst-case budget；凍結後的補傳須先用 revise-source 由server建立新版本；原run及原deadline不變。
- Supabase createSignedUploadUrl 有效期為 **2 小時**，不是可自行設定的短 TTL。取消／刪除後舊 token 仍可能上傳；finalize 必須拒絕，cleanup obligation 保留 token expiry 並處理晚到 object。清理不能只刪一次就完成。

## 6. 滑鼠任務線索

沿用 TaskInteractionScope 的 canonical resolver，僅 recording + fine pointer 時採集；
`[data-task-description-hover-card][data-task-id]` 是同任務的延伸 surface。

每筆 interval：`capture_id, clock_epoch, sequence, canonical_task_id, surface_kind, started_offset_ms, ended_offset_ms, visible, termination_reason`。
不保存座標、DOM path、raw movement 或會議外事件；不進 DEV-109 activity／content／task persistence。

- pointerout、scroll、drag、element disconnect、hidden、blur、pause、stop、view/board/account change 關 interval；同 canonical task 到 preview 的交接合併，不能重複計分。合併必須限於同一 `clockEpoch`，pause/resume 前後即使 task、surface與offset相接也保留邊界。scroll/layout recycling 後須重新確認實際 surface。
- 最低 dwell、附近時間窗、飽和、衰減與 score cap 用 **calibration set** 決定，再凍結測 held-out；不能用 held-out 調參，也不沿用 1000ms 預覽延遲。
- 只對 discussion segment 附近的文字加權，不用整場停留排行榜。明確談 B 時停 A 不能蓋過 B；pointer-only 不能直接接受，必須有原句 quote 或明確人工 add/replace。
- 無 pointer、失焦、coarse pointer、時鐘無效或丟包標 missing/invalid，保留 text-only 路徑，不填 0 作反證。
- `append-pointer` 每批最多 500 intervals／128KiB，使用 batchKey + digest；相同 key/digest no-op，不同 digest conflict。server 驗 capture scope、tenant／project、live task／milestone、非 archived、epoch、時間範圍及 sequence；只回 ack sequence。
- stop 後先 flush 已關 intervals，再 complete-upload 凍結 pointer snapshot。即使 pointer 遺失，主持人可沿既有部分來源確認繼續；不可把未抵達資料默認當作完整空集合。
- MediaRecorder 建立、`start()` 或 `stop()` 失敗時，controller 必須停止 server capture、以 `missing` source completeness 凍結、關閉 recorder／tracks 並顯示 recovery；不可只把 React state 清成 safe 而留下 server `recording`。`stop()` 例外也必須進同一條 server-stop／complete-upload recovery，不得因本機 finalize 失敗而遺留 active capture。

## 7. 資料模型與保存面

RD 用 `supabase migration new` 生成 migration 名稱；本輪已生成八份 additive migration：`supabase/migrations/20260914122616_dev_123_meeting_task_resolution.sql`、`supabase/migrations/20260914130548_dev_123_review_decisions.sql`、`supabase/migrations/20260914133819_dev_123_control_hardening.sql`、`supabase/migrations/20260914154451_dev_123_retry_atomicity.sql`、`supabase/migrations/20260914161741_dev_123_projection_task_scope.sql`、`supabase/migrations/20260915103000_dev_123_projection_accepted_links.sql`、`supabase/migrations/20260915133000_dev_123_manifest_timeline_integrity.sql`、`supabase/migrations/20260915170000_dev_123_projection_request_idempotency.sql`。第三份補上 server anchor、source-version reservation／verification、playback expiry、cleanup identity、`SKIP LOCKED` claim 與原子 budget ledger；第四份把 manual retry 的 run 建立與 capture 排隊收斂為單一 transaction，並在 transaction 內重驗 editor boundary；第五份讓 projection 對 stale、archived、deleted 或 cross-project task link 整筆 fail closed；第六份讓同一 projection transaction 從 stored accepted decisions 補入缺漏的 related task links，並對 accepted task 的現況 scope 做 fail-closed 重驗；第七份讓 complete-upload 在同一 capture lock 內重新驗證 epoch、offset、gap、overlap、bytes/hash/path/mime 與 verified segment exact set；第八份把 projection 的 `request_key + payload_hash` 收斂成同內容重送 no-op、異內容衝突的 transaction 邊界。尚未套用遠端或重置既有 local migration history。
以下是最小責任與欄位契約，可補必要 constraint/index，不另建通用 workflow framework。

| Table | 最小資料與唯一鍵 | 保存／責任 |
|---|---|---|
| `public.meeting_capture_sessions` | id, tenant/project/record/created_by, idempotency_key, state, epoch_manifest, last_progress_at, stopped_at, audio_expires_at, source_version, audio/pointer manifest hashes, source_completeness, review_revision, active_transcript_revision_id；unique(record_id,idempotency_key)＋一 record 一 active capture | editor-only；權威來源與人工聚合版本 |
| `public.meeting_capture_segments` | id, capture_id, source_version, segment_index, reservation_key, epoch, start/end/overlap/gap_ms, object_path, mime, bytes, sha256, upload_state, upload_token_expires_at, verified_at, last_error；unique(capture_id,source_version,segment_index)＋reservation key | expiry 刪 object，manifest hash／時間保留；續傳與晚到上傳可對帳 |
| `public.meeting_pointer_intervals` | 第6節欄位、batch_key/digest；unique(capture_id,sequence) | 七日清 raw；已採用 feature 摘要隨證據保存 |
| `public.meeting_analysis_runs` | id, capture_id, source_version, request_key, transcript_revision_id, config_version, state, resume_stage, stage_cursor, attempt_count, next_attempt_at, lease_token/expiry, upload_completed_at, deadline_at, budget_month, reserved/actual_twd_micros, error_code, overdue_at；unique(capture_id,request_key) | job 與有界 stage checkpoint，client 不可寫 |
| `public.meeting_transcript_segments` | id, capture_id, transcript_revision_id, producer_run_id, segment_index, source_audio_ranges, start/end_ms, raw_text, normalized_text, word_offsets, source_hash；unique(transcript_revision_id,segment_index) | **discussion segment**；版本凍結後不可原地修改，不隨 retry/run 刪除 |
| `public.meeting_segment_resolutions` | id, capture_id, transcript_segment_id, candidate_snapshot, latest_run_id, resolution_state, revision, human_reviewed, human_empty_decision, protected_source_ranges, config_version；unique(capture_id,transcript_segment_id) | 同 transcript 重配共用 resolution；無候選也有 row，可補連／拒絕整段 |
| `public.meeting_task_match_results` | id, resolution_id, task_id, quote_range, semantic_score, pointer_feature, ai_suggestion_version, decision, decision_source, corrected_by/at；unique(resolution_id,task_id) | 每段 0..N tasks；父 resolution revision 作整組 CAS，人工優先 |
| `private.meeting_draft_projections` | record_id PK, capture_id, applied_run_id, applied_review_revision, last_request_key/payload_hash, block markers/hashes, manual_link_set, auto_link_set, record_version | 投影 ownership；只含已接受正文／版本，不另存全文 transcript |
| `private.meeting_artifact_cleanup` | obligation_id, capture/run/attempt identity snapshot, kind(storage/provider), object_locator/display_name, external_file_id, state, lease_token/expiry, upload_token_expires_at, due_at, last_verified_at, attempts, error_code；unique(attempt_id,kind) | 取代 provider-only files 表；先建 obligation 再外部操作；**不得 FK cascade 刪除** |
| `private.meeting_ai_budget_months` | pilot scope, Asia/Taipei month, limit/reserved/spent_twd_micros | global 每月 NT$1,000 |
| `private.meeting_ai_usage_attempts` | attempt_id PK, capture/run/unit identity snapshot, dispatch_month, provider/model/price version, reserved/actual/usage/outcome | 不含內容；record 刪除仍保留未知 usage 對帳責任，不 cascade |

所有 public raw tables 啟用 RLS，撤銷 PUBLIC/anon/authenticated table grants，明確給 service_role 最小權限；private tables 撤銷 client schema/table/function access。
表／FK 必須維持 record→capture→source→resolution 同 tenant/project，禁止接受 client scope 或串接不同會議 ID。
`knowledge_records.metadata` 最多放 latestAnalysisRunId、appliedDecisionVersion 及非敏感版本／計數；raw tables 不進共用 documents/RAG。

永久刪除 record 前在同 transaction 將 object/provider obligation 與未結算 usage 的必要 locator/identity 保存於 private ledger，再 cascade raw content。
cleanup row 不依賴已刪的 record 才能執行；刪除不釋放不明帳務預留。清完 locator 可去除，僅保留不含內容的完成證據。

## 8. API、授權與 Storage 邊界

### 8.1 meeting_capture_control

所有 op 除 OPTIONS 都以 JWT `auth.getUser()` 驗 actor；Origin/method/content type/UUID/payload 上限亦驗。
Verified actor 交 service-only security-invoker RPC，在 transaction 以實際 record edit 語意再驗；private helper 全名引用、search_path=''，只允許 service_role execute。
私人 record 使用 creator/recorded_by 規則，非私人 record 使用現行 project write 規則；另驗 lifecycle，不把 read 權當 edit。

| Op | 必要輸入（scope 由 server 解析） | 成功輸出／原子行為 |
|---|---|---|
| begin | recordId, idempotencyKey, capability | captureId、server time/clock anchor、sourceVersion；非 private 依 project editor 語意，private 限 creator/recorded_by；published/archived record 拒絕；相同 key 回同 capture |
| capture-progress | captureId, progressSequence, epochProgress | receipt；只更新 capture timeline，音訊 segment 不可由此寫入或偽造 verified 狀態；不接受任意 expiry |
| reserve-segment | captureId, segmentIndex, SegmentClock | segmentId、server path/upload token/expiry；先建 reservation/cleanup |
| complete-segment | captureId, segmentId, digest | verified ack；單段 readback/hash |
| append-pointer | captureId, batchKey, digest, intervals | ackSequence；冪等批次 |
| stop-capture | captureId, expectedSourceVersion, epochManifest, finalPointerSequence, gaps | frozen stoppedAt/expiry；不取消分析 |
| complete-upload | captureId, expectedSegments, sourceVersion, manifests, partialAcceptance | `complete_meeting_upload_v1` 在 capture lock 下驗 verified segment、source freeze、唯一 run、deadline 與 budget；回 runId、queued/awaiting_budget 或 partial stopped |
| revise-source | captureId, expectedSourceVersion, requestKey | server配置新sourceVersion，引用原有效segments並重新收集差異manifest；不改已排run，不延長錄音期限 |
| status | recordId, cursor? | 安全 state、progress、reviewRevision；分頁最多100列，不含全文 |
| transcript／matches | recordId, runId, cursor? | editor-only 分頁段落／resolution＋目前人工決定 |
| playback-url | recordId, segmentId | URL、expiresAt；TTL 見8.2 |
| decide-match | resolutionId, expectedResolutionRevision, operations[] | accept/reject/add/replace/clear-all **整組原子**；新 resolutionRevision/reviewRevision。補連用 taskId，不要求已有 matchId |
| save-projection | recordId, requestKey, expectedRecordUpdatedAt, expectedReviewRevision, userDraft, status | server 重建 accepted projection，CAS 回 saved record/version；禁止 client 自報已接受結果 |
| retry | runId, requestKey, mode(retry/rematch/retranscribe) | `retry_meeting_analysis_v1` 原子鎖 source run/capture；同 key replay，衝突 key 或 cancelled/expired capture 拒絕且不留孤兒 run；保留原 deadline、人工保護與到期；重新預留 |
| cancel | captureId, expectedSourceVersion, reason | 停 capture/compute，建立 cleanup；不刪手寫草稿 |

所有寫操作驗 chain、版本及 task live 權限。返回錯誤固定為 AUTH_REQUIRED/FORBIDDEN、SOURCE_INCOMPLETE、SOURCE_CONFLICT、MEETING_RECORD_CONFLICT、BUDGET_REQUIRED、AUDIO_EXPIRED、PROVIDER_UNQUALIFIED、CLEANUP_PENDING；不能回 provider body、SQL、JWT 或 secret。
status/transcript/matches/playback 發新內容前重驗權限；worker 每次 dispatch 及結果套用亦重驗原發起者權限／record lifecycle。已發出的 provider request 無法撤回，late result 只能按 guard 決定保存或清理。

### 8.2 Storage capability

- Private bucket；browser 無 list/read/delete/createSignedUrl 權限，只能持有 server 指定單物件 upload capability 或 playback URL，不能自行選路徑。
- Playback TTL = `min(60, floor(audio_expires_at - now))` 秒，<=0 不簽；cancelled／expired capture 立即拒絕播放。權限撤銷最多有原 TTL 殘存，**網址不得跨七日到期**；不寫 localStorage／metadata／logs。
- Upload token 固定2小時（第5節）；角色撤銷、取消、到期後拒絕 finalize／讀取，purge 持續處理遲到 object。未確認 token 失效及晚到上傳清理前，不宣稱實體清理完成。
- Service key 只在 Edge secrets。RPC revoke execute from public, anon, authenticated 後只 grant service_role；不為方便改公開 security definer。

## 9. Durable worker、lease、重試與 provider

### 9.1 單一工作單元

`pg_cron + pg_net` 每分鐘觸發 process_meeting_analysis；Vault 存 project URL 與獨立 worker secret，function 驗 `DEV123_WORKER_SECRET`（`x-projed-worker-secret`）後才執行 claim。purge maintenance route 同樣要求 `DEV123_PURGE_SECRET`（`x-projed-purge-secret`）；secret 缺失或不符時 fail closed，不回傳資料庫／provider 錯誤內容。
DB 用 `FOR UPDATE SKIP LOCKED` 每 invocation **只 claim 1 unit**，lease 150秒；同 run 不得並行 stage。claim 上限不是全專案兩個 worker，global 費用由 ledger 控制。

Unit 以 `(runId, stage, sourceSegmentId/mergeNode, attemptNo)` 定位：
transcribe 一 audio segment；retrieve-query 一 discussion embedding；match 一 discussion；compose 一有界合併節點。
stage_cursor 存已完成 source IDs／merge coverage，只有 lease token 與 cursor 都吻合才 commit／前進；不用另一套 generic jobs 系統。

- 每 unit 最多 **1 次付費 AI 推論**，不把 Files upload/get/delete 等必要 HTTP 混稱同一 request。Download/upload/poll/inference 共用95秒 deadline，清理最多15秒，DB回寫預留10秒，總目標<120秒；超限中止／記cleanup，不依賴400秒。
- attempt 在外部 dispatch **之前** transaction 登帳，含 worst-case reserve、config/price、provider file prefix；SDK 自動重試關閉。失去 lease 時不再 dispatch，但仍可針對自己的 attempt 記usage與cleanup。
- 429/5xx/timeout 最多2次自動付費attempt（初次＋1次）；唯一自動 retry 在1分鐘＋有界jitter後。第二次仍失敗即 failed_terminal，不能因 lease重領或SDK重試重置次數。auth/ZDR/schema/unsupported media 不自動重付費。
- manual retry 用新 requestKey；未完成 unit 才重跑，成功的 immutable transcript/embedding/checkpoint 重用。`retry_meeting_analysis_v1` 以 capture row lock 將 run insert 與 capture queue transition 放在同一 transaction；同 key 只回既有 run，不會因併發留下 orphan run。retranscribe 明確建立新 transcript revision。每次都驗 expiry、budget、權限與 deadline。
- cleanup 是獨立 maintenance lease，不依賴 run ready、actor仍存在、AI額度或計算可重試；purge_meeting_audio 每分鐘處理有界批次／分頁，掃描 `pending/deleting/failed/unknown` 的到期 obligation，以 `lease_token／lease_expires_at` 做單 row claim，失敗退避最多10分鐘，持續留下待清理責任。任何 ledger update 失敗都要 fail-fast；中途停在 `deleting` 的 row 仍可由下一輪依 `due_at` 重試。
- 在 provider qualification 尚未通過前，purge 遇到 `kind=provider` 的 obligation 必須明確寫成可重試的 `failed`（`PROVIDER_CLEANUP_ADAPTER_REQUIRED`）並保留 `due_at`，不得略過、偽造 `deleted` 或把未知外部物件當成不存在；`storage` obligation 缺少 `object_locator` 時同樣寫成 `STORAGE_LOCATOR_MISSING`，不可靜默跳過。這是 local candidate 的 fail-closed 行為，不是 provider cleanup qualification 證據。
- Cron、expiry、record刪除與 late worker 的共同不變條件：計算可停，外部暫存及未知 usage 的責任不可消失。

### 9.2 Gemini 與資格入口

專用 `GEMINI_MEETING_ZDR_API_KEY`、核准 project ID 與 immutable provider config：
Transcribe=`gemini-3.5-transcribe`（verbatim、word timestamps、無speaker/custom vocabulary）；
query embedding=`gemini-embedding-001` 3072維；match/compose 以 `gemini-3.5-flash` 作本輪待驗候選。變更精確型號須重新 qualification，不能靜默 fallback。
Interactions 一律 store=false、background=false，無history、grounding、tools或explicit cache。

Files upload 前建立 `meeting_artifact_cleanup` row，displayName=`projed-dev123-{attemptId}`；外部ID取得即保存，推論 success/failure 都 finally delete並verify。
Sweeper 只處理此專用project/prefix且 attempt 已terminal／lease失效的檔案，不能刪仍有active lease的upload。
DB漏記external ID時以預先保存attempt prefix查找；record被刪也可查ledger。Provider list分頁未掃完、upload結果不明或delete未確認時不能ready；401/403/5xx不當作404成功。
Local candidate 尚未包含合格的 provider Files adapter；因此上述 cleanup obligation 會由 sweeper 保留在 failed/retryable，而不是宣稱清理完成。只有通過 WP-123-0a/0b 並能以 provider readback 證明 delete/list 結果後，才可將該路徑標記為 qualified。
官方ZDR仍允許project隔離的RAM暫存；本契約要求無可回取state／持久內容，用畢Files清理，不承諾零運算暫存。能力參考固定為 [Gemini ZDR 文件](https://ai.google.dev/gemini-api/docs/zdr) 與 [Gemini Files API（含 get/list/delete）](https://ai.google.dev/api/files?hl=en)；文件能力清單本身不算本專案的 qualification evidence。
2026-09-15 官方文件 readback 顯示 `gemini-3.5-transcribe` 仍提供 word-level timestamps，啟用 timestamps／diarization 時單檔上限為 30 分鐘；這支持目前 5 分鐘 segment 設計，但不替代 project ZDR、價格、API key 或 Files delete readback。參考 [模型能力](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe) 與 [音訊轉錄契約](https://ai.google.dev/gemini-api/docs/transcribe)。

資格拆成兩步，消除「全通過才能開始驗證」：
- **WP-123-0a（唯讀）**：確認實際project ZDR核准、API/model可用性、pricing/config、現有RAG coverage/freshness；缺證據記Pending。
- **WP-123-0b（synthetic實測）**：0a的ZDR/目標/價格前提及可用的測試費用ledger先成立，再測request、時間戳、耗時及Files故障清理。測試費用計入7A，不另開第二份額度；本輪文件不啟用付費呼叫。
- fake-provider與local DB implementation可先完成；real probe 不需等待自己待產生的cleanup/品質證據。QA Q01～Q10＋Q11 repository條件全數具證據才標 Provider Qualification Gate PASS。真實會議仍須此PASS後才可試點。

Provider設定／project指紋改變即停止內容dispatch並重驗，不以paid tier或request unit test取代project核准。

## 10. 預算、跨月與未知帳務

Budget固定 `meeting-task-resolution-pilot`，Asia/Taipei曆月 NT$1,000，以整數 twd_micros 算，不是per user/tenant/run。

1. complete-upload 先固定來源／deadline；目標契約是 server 依有效音訊時長、分段上限、模型價格與FX緩衝、輸入／輸出／thinking cap、最多2次attempt形成 reservation。現行 local candidate 先以固定保守額度 `10,000,000` twd_micros 建立第一次 reservation，worker 的 bounded retry 以獨立 attempt identity 追加預留；此固定額度是 Provider Qualification 前的明示技術債，不能當成實際費用上限。相同 transaction 鎖 month row，spent+reserved+new <= limit 才 queued，否則 awaiting_budget。
2. 未知 discussion/compose節點數不得憑空承諾整場成本上限。ASR完成後依凍結段落數與bounded merge計畫重新估算；dispatch前若剩餘reserved不足，只能transaction補額，失敗awaiting_budget。過長prompt先分合法段或停止，不能截掉尾段或繞過cap。
3. 每個attempt先鎖run→month（固定鎖序；多month按月份排序）預留，回覆後依可信usage移spent且unique attempt只結算一次。Timeout、missing usage、未知幣別保留最壞reserved並停止新的paid stage；不能假設未回應就免費。
4. 跨月以 **dispatch month** 計費。已發出的attempt留原月對帳；尚未dispatch的舊月預留，在新月明確retry時原子釋放並重作新月預留。新月額度不足不發送；不得把舊月reservation當新月免費通行證。
5. cancel/delete釋放的是未dispatch的額度；在途或未知attempt的預留保留於無cascade private ledger。人工更正、reader權限、七日／24h時鐘均不受帳務重試影響。
6. Qualification／重轉／rematch／embedding／compose與automatic/manual retry都計入同pilot。測試用ledger必須有可核對的同月已用額與專用probe上限；禁止獨立local帳自行再提供NT$1,000。
7. 實際供應商費率或usage無法建立保守上界時fail closed，不能以AI自報費用或歷史每小時試算當封頂保證。Storage/egress依7A另列。

上述保證是受控dispatch及ledger上限；帳單換匯／稅費差異另readback。既有6C數字只作歷史估算，執行前須重驗價格。

## 11. 討論分段、任務候選與人工優先

### 11.1 三種單元不能混用

**audio segment** 是5分鐘內的可解碼上傳檔；**discussion segment** 是配對單元；**gold segment** 是人工在模型執行前依原始音訊標註的驗收單元。

ASR先保存word文字／時間；映射capture timeline，只在檔案重疊時間內去重同一發言，不能全場刪重複句。
以句末／停頓切discussion，單段最多30秒或800個Unicode字元；超過時在最近word boundary再切。保留前後各一段、各最多400字元作上下文，不能用上下文的task當本段發言。
word_offsets 保留 `text, start_ms, end_ms, source_audio_segment_id, source_word_index`；quote用fromWord/toWord引用，normalized text保留回raw映射。
revision凍結後分段／word indices不可改；重新ASR另建revision，retry/rematch重用同revision。

### 11.2 Candidate set

每段最多12個canonical tasks，先live scope filter再去重：
1. 明確title/code/path lexical top4。
2. current-hash task-only RAG top6。
3. 時間附近pointer top2。
重疊後空位以未用lexical/RAG候選補滿；各來源按score再canonical ID穩定排序。pointer不能擠掉全部文字候選，無pointer時全數可給文字。

新 service-only `match_meeting_task_candidates` 只讀同project active task/milestone，source_table=wbs_items/source_type=wbs_item，documents/chunks/embedding與當前內容hash一致。
送模型前讀live WBS title/path/description摘要/status/updated_at；每個candidate最多800字，snapshot保存hash。stale/缺索引時用lexical＋pointer降級並記coverage，禁止偷偷重建全專案索引；Q11評估與最終95/90實測決定是否可啟用。

### 11.3 結果、CAS 與重新分析

模型只回 `[{candidateTaskId, quote:{fromWord,toWord}, relation, evidenceScore}]` 或空結果；unknown fields/IDs、越界quote、跨scope、archived/deleted一律拒絕。
每個task獨立需原文支持、live合法、校準score達標；若同一引文在互斥候選間難分才檢查margin。明確同時討論A/B可接受兩筆，不能用全段top-two margin把多任務誤判成模糊。
討論關聯與決議／行動分開：例如「防水測試先不要做」可以related，不可自動改成待辦或修改task。

resolution是整段人工交易單元，可含accepted/pending/rejected混合；父state由rows推導。none亦保留resolution，可add或clear-all。
decide-match鎖capture→resolution，驗expectedResolutionRevision，在同transaction改0..N rows、遞增resolution revision及capture.review_revision；clear-all保留human_empty_decision，防止「無task row所以忘記拒絕」。

同transcript重配更新ai_suggestion，不能覆寫human決定；所有新／刪除／改判定都使review_revision遞增，舊projection必須衝突。
重新轉錄可能改段落邊界：原human resolution保留原引文及capture-time protected ranges；新revision任何重疊區間不得自動取代舊決定或復活clear-all。新建議可看，只有使用者明確套用新revision才retire對應舊決定；無法唯一映射保持待確認。
人工link／正文保留與機器輸出ownership由第12節控制，不依賴run ID碰巧一致。

### 11.4 Calibration與品質入口

matching_config含分段、candidate分配、dwell/time-window/cap、score、margin、prompt/model及價格版本，初始只用synthetic/calibration資料校準。
先freeze config，再以held-out跑auto accepted結果；evaluation mode允許計算但禁止投影正式會議，不須先取得自己待計算的95/90 PASS。
只有QA held-out precision>=95%、recall>=90%且invalid/unauthorized/cross-board=0，才允許production auto-accept。
Held-out不得回流調參；失敗須報fail並另立未看過的held-out版本。正式分母與時間對齊規則由QA第9節唯一維護。

## 12. 同草稿核對與原子保存

RecordSidebar沿用目前composer。錄音控制就近顯示開始、active時間／暫停／停止；結果以「辨識任務」就地列accepted／pending，點擊才展開path、原句及期限內回聽。無候選段落亦可補連；不新增matching page或常駐教學區。
只有編輯者可取raw review；reader只讀既有正文與已引用內容。鍵盤／錯誤／窄版沿既有meeting availability，保留手寫草稿與恢復動作。

### 12.1 唯一保存路徑

`useRecordStore.saveDraft`仍擁有完整保存／發布流程；DEV-123 record由dataBackend路由到save-projection，**不能先舊upsert再新RPC**。
UI停止run後，server亦須驗無active compute才publish；舊client直接save不得繞過此record guard。
對DEV-123 record，既有undo/redo、reload merge及相關record/link寫入口同樣路由CAS；其他record保持舊服務。
本地backend用相同契約fake adapter驗證，不宣稱具雲端durability。

Server鎖record→capture→resolutions→projection，驗record.updated_at與capture.review_revision、edit權限、lifecycle及live task，從stored decisions重建安全projection。browser review在draft上同步已採用 task link 供立即可見，但這只是UI投影；save-projection transaction仍從 `meeting_task_match_results` 的 accepted rows 重建／補入 related link，client遺漏或偽造候選都不能改變accepted權威。
Client送userDraft及預期版本，不能把client提供的候選／confidence當accepted權威；transaction同時寫content、record_task_links、metadata最小版本與private projection receipt，回saved record供store一次更新。已採用決定若在儲存前變成stale／archived／cross-project，整筆以 `TASK_OUTSIDE_PROJECT` fail closed。
existing quick-note invariants及RAG同步仍在同保存路徑處理；RAG只見已投影正文。相同requestKey且payload hash相同才可回原receipt；同key異payload衝突，不能把相同review版本的不同人工文字當no-op。任何版本衝突保留本地unsaved內容供merge。

### 12.2 正文與link ownership

private.meeting_draft_projections追蹤每個AI區塊的穩定marker（capture＋source anchor）及上次hash、manual/auto link集合。

- 只投影accepted task mentions及必要引文；pending、候選／全文逐字稿、音訊路徑均不可入一般正文。
- 相同marker＋未變hash可replace/remove；人已改寫區塊則轉manual ownership並保留，後續AI不刪。不能每次append整份summary。
- link唯一鍵沿現行 `(record_id,item_id,role)`。AI討論link一律related；明確manual link／manual正文mention及其他role保留。同task同時manual＋AI時，reject AI仍保留manual support。
- client draft metadata可帶 `resolutionLinkSet`，只標記由review callback實際補進draft的link；reject／clear-all只回收此集合，不能刪除同task原本的人工link。最終持久化仍以stored accepted decision為authority。
- 移除AI link前確認沒有任何accepted resolution、manual link或manual mention支持；多段連同task不得一段reject就全刪。
- receipt含applied run/source/review revision；重跑產生的新run若未明確獲准取代受保護human範圍，不得成為新的active projection。
- record archived/deleted、published而非明確使用者編輯、late worker、跨project或舊review revision都不能自動改正文。

資料庫guard只限制DEV-123 record的自動投影／未完成run發布；不得藉此改全域record角色權限或禁用既有合法人工編輯。需要越過此scope時回Tech Lead。

## 13. Failure recovery、刪除與相容性

| Failure | 必要結果 |
|---|---|
| microphone denied／device lost | 不進recording或關閉當前segment；原草稿保留，顯示重試／換裝置 |
| tab crash／PWA reload | PWA safety owner在recording、finalizing、local blob未readback時阻擋自動reload；重開不收音，只恢復本人finalized outbox及server狀態 |
| partial upload | 未明確接受partial source前維持incomplete、不起算24h、不開始付費；已上傳segment可續用；確認部分來源後依第5節凍結並保留缺口 |
| provider timeout／429／5xx | bounded retry、lease及budget皆可追；不重複套draft |
| provider file delete失敗 | cleanup pending且可見；sweeper重試，未確認刪除不得ready |
| task rename | evidence顯示當時snapshot與目前path；套用時使用最新title/path及同一ID |
| task archived／deleted／moved | 不自動link；轉pending/none，跨project拒絕 |
| permission revoked | 新status、transcript、playback、decision及projection請求立即拒絕；既簽播放URL最多再有效60秒 |
| record archived／deleted | cancel jobs；delete清raw content，保留獨立budget/cleanup obligation；晚到worker只可清理，不能還原 |
| audio expiry | API先拒絕新讀取／重轉，signed URL不跨expiry，再清server object；local按第5節讀取前清理 |
| budget exhausted | `awaiting_budget`，0新付費call；recording與手寫草稿仍可用 |

Recording capture不改 `meetingLiveCaptureRuntime` segment identity，不寫 `meetingDraftRecoverySnapshot` blob，不改 SPEC-117 continuity allowlist。Existing manual／task-activity synthesis仍可供未使用DEV-123錄音的meeting；含DEV-123 run的draft不能把full transcript送進舊同步endpoint，也不能用其deterministic fallback冒充task-resolution完成。

## 14. Security、performance 與 observability

- Edge auth採真正 `auth.getUser()`；control request rate limit以actor + record + operation計算，begin／retry／signed URL另設較低上限。
- Provider／worker log只留 `captureId/runId/stage/duration/attempt/usage/errorCode/hash`，不得留title、participants、audio、transcript、quote、candidate text、task title或provider raw body。
- Provider prompt／response cap由immutable config設定並在dispatch前檢查；match每次只含一discussion、有限上下文及最多12候選。Compose每node最多8個子摘要、各最多2000字，輸出最多2000字；summary文本可壓縮，source coverage集合不可漏。node output/hash/source ranges作editor-only run checkpoint存stage_cursor，重試不丟已完成結果；超限或漏coverage回錯誤，不截掉會議尾段。
- DB index至少覆蓋 `(record_id,created_at)`, `(capture_id,segment_index)`, `(state,next_attempt_at)`, `(lease_expires_at)`, `(transcript_revision_id,segment_index)`, `(audio_expires_at)`、cleanup `(state,due_at)`及human decision lookup；explain evidence由isolated DB verifier保存。
- Worker每次claim 1 unit；budget row lock及lease避免並行超額／重複回寫。外部call沒有provider idempotency時，以attempt reservation及unique result防止財務／資料無界，不能宣稱網路層exactly once。
- SLO metrics：upload completion rate、segment gap/overlap、transcription coverage、run latency/p50/p95/overdue、provider cleanup lag、RAG freshness、precision/recall、pending rate、human correction time、reserved/spent。不得將原文送到analytics。

## 15. Exact write surface

### 15.1 Existing files allowed to modify

- `src/components/Records/RecordSidebar.tsx`：錄音控制、狀態、同draft review入口；不放provider／Storage邏輯。
- `src/interactions/task/TaskInteractionScope.tsx`、`src/interactions/task/taskPlacementHover.ts`：輸出canonical pointer surface／preview identity；既有linked-hover不改語意。
- `src/store/useRecordStore.ts`：只保存小型capture/run UI identity與draft projection hooks；不保存Blob、raw transcript或worker state。
- `src/services/dataBackend.ts`、`src/services/supabase/projedService.ts`（DEV-123保存分流）及 `src/services/supabase/database.types.ts`：新增feature adapter及DB types。
- `src/components/PwaReloadSafetyBridge.tsx`或其owner manifest/service：登錄audio dirty owner，沿用現行reload arbitration。
- `package.json`：只新增DEV-123 verifier scripts；未證明必要不得新增Graphiti、Python服務或大型meeting SDK。
- 由CLI生成的八份DEV-123 additive migration、`supabase/config.toml`必要function auth設定，以及本節新functions。

### 15.2 New modules

```text
src/features/meetingTaskResolution/
  meetingAnalysisContract.ts
  meetingAudioOutbox.ts
  meetingPointerEvidence.ts
  meetingAnalysisService.ts
src/components/Records/
  MeetingRecordingControls.tsx
  MeetingTaskMatchReview.tsx
supabase/functions/meeting_capture_control/index.ts
supabase/functions/process_meeting_analysis/index.ts
supabase/functions/purge_meeting_audio/index.ts
scripts/verify-dev-123-meeting-task-resolution.ts
scripts/verify-dev-123-meeting-task-resolution-browser.pw.js（B01～B03 smoke；完整media仍是後續WP）
scripts/verify-dev-123-meeting-task-resolution-db-isolated.ps1
scripts/verify-dev-123-meeting-task-resolution-db-bootstrap.sql
scripts/verify-dev-123-meeting-task-resolution-db-matrix.sql
（isolated DB control-plane verifier已建立並有artifact；task-owned local Auth／Storage readback已PASS；hosted authenticated DB／Storage、provider qualification與真實browser/media仍是後續WP，不得把局部readback宣稱成完整PASS）
```

新檔按責任分組；檔名是交接落點，不是強制新增無邏輯wrapper。Provider integration 後續只保留一個受資格門控的 adapter seam；目前 worker 只允許 local fake，沒有任何真實 provider wrapper 或傳送真實會議內容。

### 15.3 Forbidden expansion

- 不修改 view-owned meeting session、跨board/workspace permission、DEV-109 persistence-confirmed mutation allowlist或SPEC-110 owner。
- 不把raw content塞入 `knowledge_records.metadata`、`documents`、`document_chunks`、`llm_access_logs`、activity/audit payload、local diagnostics或公開Storage。
- 不讓browser持有service key、Gemini key、可自行選擇的object path、budget amount或worker secret。
- 不復用 `match_project_knowledge`整個answer生成endpoint；只共用embedding契約並建立task-only、current-hash server retrieval。
- 不優先實作speaker label、realtime AI、Graphiti、Sentence Transformers service、remote/system audio或new-task extraction。

## 16. Work packages 與順序

1. **WP-123-0a 唯讀資格盤點**：依第9節確認target/ZDR/API/model/pricing與RAG coverage；缺證據記Pending。**0b synthetic實測**在WP1～4的fake/ledger/cleanup可用後執行，不要求全qualification先PASS才可測。
2. **WP-123-1 Failing contracts**：建立pure/static、provider fake、DB及browser failing cases，固定state、auth、retention、pointer-only禁止、budget concurrency與draft projection。
3. **WP-123-2 Migration／control plane**：CLI建立migration；tables、constraints、private budget、RLS/grants、service-only RPC、private bucket、control Edge API與isolated DB control-plane core PASS；task-owned local Auth／Storage readback已具證據，hosted authenticated Storage／API readback仍需獨立 gate。
4. **WP-123-3 Browser capture**：manual start、mic lifecycle、5分鐘segment、clock epochs、IDB outbox、signed upload、PWA reload owner與pointer observer。
5. **WP-123-4 Durable worker／cleanup**：Cron/Vault invocation、lease、single-unit stages、Gemini Files lifecycle、transcription、expiry及provider orphan sweep。
6. **WP-123-5 Candidate／matching**：task-only retrieval、live snapshot、pointer union、structured output、validation、human precedence及frozen matching config。
7. **WP-123-6 Draft review／transactional projection**：同composer review、evidence/playback、human corrections、CAS save/publish及late-result guards。
8. **WP-123-7 Calibration／RD self-test**：frozen corpus text-only vs text+pointer、95/90、60分鐘24h、NT$1,000 concurrency、protected regressions。
9. **WP-123-8 QA／QC**：QA依QA-DEV-123重跑；QC只在frozen candidate執行normal UI path、real visual/data readback。Provider activation／release另走deployment gate。

依賴：0a → 1 → 2 → 3/4 → 0b → 5/6 → 7 → 8。3/4及5/6僅表示獨立模組可分開實作，不要求多agent。外部證據缺失時1～7的fake/local工作仍可前進；真實內容／功能啟用等待完整provider及quality gate。WP-123-0a/0b合稱WP-123-0，保留既有ID。

## 17. 實作模型權限與 stop conditions

實作模型可自行決定：局部type／function名稱、非公開folder細分、測試fixture ID、非worker推論的有界maintenance batch size，以及依frozen calibration evidence調整dwell／decay／score threshold。所有選擇需同步config version及測試。

實作模型不得自行決定：改供應商保存條件、提高月額、降低95/90、改24h／7日、讓reader讀raw資料、開始自動錄音、增加speaker label/realtime/cross-board、新增未核准provider fallback、以pointer-only自動link、把full transcript送舊endpoint或改existing meeting authority。

命中任一項停止並回規劃／Tech Lead：

1. Gemini目標專案或任一必要API/model無法取得ZDR／`store=false`／Files清理證據。
2. 最長5分鐘及較短合法segment皆無法在受支援browser穩定解碼，或仍無法在Edge單unit120秒目標／256MB內處理。
3. 必須接受未核准provider background／55日state或無法追蹤的Files orphan才能達24h。
4. Raw資料無法和reader-visible record/RAG/API隔離，或現有權限無法映射真正meeting edit。
5. Budget transaction在並行fixture可超過NT$1,000，或provider usage無法建立保守reservation。
6. Held-out corpus無法同時達95% precision、90% recall與0非法link；不得暗改分母或把pending算成功。
7. 必須覆寫human content／decision、以last-write-wins套draft，或無法做到old job late-write rejection。
8. 需要修改SPEC-109／110／117或ADR-049 authority、跨board ownership、mobile availability及existing release boundary。
9. User-owned dirty diff與target surface無法安全語意合併；禁止reset、checkout或整檔覆寫。

## 18. Acceptance criteria

- **AC-123-01**：正常會議入口後仍須按開始錄音；old record、recovery、reload、view switch均0次getUserMedia／MediaRecorder start。
- **AC-123-02**：mic granted才進recording；denied、device lost、pause/resume、stop各有可見狀態且保留manual draft。
- **AC-123-03**：60分鐘synthetic capture形成完整可解碼segment manifest，時間可還原，gap／overlap有證據；未確認的partial manifest不排付費job。
- **AC-123-04**：pointer interval只含canonical task/time/surface；preview合併、flyover、stationary A/talk B、drag/scroll/hidden/view change、no pointer均符合第6節。
- **AC-123-05**：關閉page後server job繼續；重開同record讀到相同run、deadline、status/result。local reload不收音，只續本人finalized upload。
- **AC-123-06**：editor可status/full transcript/playback/decision；reader及no-access無法取得新的raw內容；已簽capability的殘存效力與expiry依第8節驗證。
- **AC-123-07**：audio在停止後第7日到期時先不可讀／不可重轉，再刪Storage；local於下次啟動／讀取前purge；retry/retranscribe不延長。transcript及adopted evidence仍可讀。
- **AC-123-08**：Gemini轉錄／embedding／matching／summary各路徑使用核准project；Interactions `store=false`、無background/history/grounding/cache；Files在success/failure/cancel/crash sweep後可證明刪除，否則run不ready。
- **AC-123-09**：同upload/retry/late worker不重複transcript、match、task link或付費無界；human correction不被rerun覆蓋。
- **AC-123-10**：global Asia/Taipei month在N=20並行job仍不超NT$1,000；不足時0新paid call，reload/account/tenant不能重置。
- **AC-123-11**：held-out gold先凍結；text-only及text+pointer用同model/candidate budget；後者在人工修正前precision>=95%、recall>=90%、invalid/unauthorized/cross-board=0。
- **AC-123-12**：同名不同客戶、別名、代詞、多任務、無對應、ASR漏字、tail segment、task rename/archive/delete及no-pointer均有真實結果／錯誤，不預植成功link。
- **AC-123-13**：accepted／pending在同一RecordSidebar草稿就地顯示；可查看原句/path、補連／更換／拒絕，save/reopen/rerun後human decision仍在。
- **AC-123-14**：publish transaction保留manual content及人工links，只投影accepted safe excerpts；pending/raw/provider資料不進content/metadata/RAG。CAS conflict不覆寫。
- **AC-123-15**：60分鐘complete upload正常成功run在24h內ready且可重新讀取；timeout/overdue保留分母與safe error。
- **AC-123-16**：1440×900、1024×768、200% zoom下錄音控制／狀態／review不遮內容、不雙捲動；鍵盤、focus、screen reader狀態及reduced motion可用。
- **AC-123-17**：SPEC-106／108／109／110／117 protected regressions通過；speaker label、realtime、cross-board、remote/system audio surfaces為0。

## 19. Verification commands 與 evidence boundary

目前已建立並通過的 local preflight，以及仍待建立／執行的 Gate：

```text
npm run verify:dev-123-meeting-task-resolution
npm run verify:dev-123-local-preflight
npm run verify:dev-123-meeting-task-resolution-browser
（B01～B03 smoke PASS；isolated DB control-plane verifier已建立並執行；`verify:dev-123-provider-contract` 已建立並在 fake mode 產生 `PENDING` artifact（`output/qa/dev-123/provider-contract-result.json`，無 network dispatch），local preflight 另以不具資格設定產生 `FAIL_CLOSED` artifact（`output/qa/dev-123/provider-contract-fail-closed-result.json`，預期 exit code=2）；task-owned local Auth／Storage 與含 Edge runtime 的 Control API readback已PASS，hosted authenticated DB／Storage、provider qualification與真實browser/media仍待執行）
npm run verify:dev-123-auth-storage-local
（需由 task-owned Supabase full-stack runtime 提供 URL／anon key／service role key；本輪已完成 Auth、raw table RLS、private bucket／object 與 synthetic fixture cleanup readback，artifact=`output/qa/dev-123/auth-storage-local-result.json`；不替代 hosted authenticated gate）
npm run verify:dev-123-control-api-local
（含 Edge runtime 的 task-owned full-stack；Auth、missing／invalid auth、same-project begin/status、cross-project begin／pointer deny、pointer／audio path、signed upload／verify、complete replay、manual retry atomic／same-key idempotency／conflict no-orphan、playback／cancel、fake worker ready／transcript／budget settlement、purge cleanup、service-role raw readback；artifact=`output/qa/dev-123/control-api-local-result.json`；verifier 對 token／signed URL 做 evidence redaction；不替代 hosted gate）
npm run verify:dev-123-hosted-readiness
（read-only；需明確提供 hosted project ref／Supabase access token，檢查 remote migration history、Edge function presence、linked schema lint 與 DEV-123 table／private schema readback；artifact=`output/qa/dev-123/hosted-readiness-result.json`；不部署、不寫入遠端）
Hosted authenticated gate 需另行確認 `private` schema exposure 已在 hosted project 套用，且 private table／RPC 對 PUBLIC、anon、authenticated 仍拒絕；再以同一 control API／Storage verifier 重跑，不得以 local config 取代。
npm run verify:dev-106-meeting-local-safety
npm run verify:dev-108-task-meeting-note-persistent-list
npm run verify:dev-109-meeting-live-task-change-capture
npm run verify:dev-110-unplaced-task-meeting-record-boundary
npm run verify:dev-117-cross-mode-meeting-continuity
npx tsc --noEmit
npx eslint <DEV-123 changed source files>
npm run build:test
git diff --check -- <DEV-123 owned files>
```

Provider contract預設fake。real synthetic probe依第9節0a前提＋有帳務上限的0b執行，不要求尚待產生的完整qualification marker；真實會議則要求完整Gate PASS。QA artifact需記branch/HEAD/dirty files、migration/function hashes、browser/OS/MIME、Supabase ref/plan、provider project alias與evidence date、price/config versions、actor aliases、record/capture/run IDs、network/console/visible error及cleanup readback；不得保存secret或會議原文。
`npm run verify:dev-123-local-preflight` 會串接上述 local steps，輸出 `output/qa/dev-123/local-preflight-result.json`（目前 18 steps／7 artifacts）；`PASS_WITH_EXTERNAL_GATES_PENDING` 只代表 local evidence 全部通過，不得升格為 provider、hosted authenticated DB／Storage、完整 QA/QC 或 release PASS。
`npm run verify:dev-123-hosted-readiness` 是獨立的 read-only hosted readiness probe，不屬於 local preflight；它只確認部署／schema／function 的前置狀態，不會替代 authenticated actor、Storage、provider 或完整 QA/QC。

Quality corpus、gold alignment、calibration/held-out門檻與分母以QA第3及9節為唯一驗證契約。

## 20. Architecture Closure Review（2026-09-14，Tech Lead修訂）

- Repo readback：`useRecordStore`已有stable client draft UUID但只在save後成為DB record；開始錄音必須先保存draft。`RecordSidebar`是現行composer與人工發布入口。`TaskInteractionScope`已有document pointer observation及canonical resolver。既有RAG contract為Gemini 3072維，現行retrieval混合多source且會生成回答，不可直接當task-only matcher。現行`synthesize_meeting_record`是30秒同步path並有12,000字／80 task限制，不適合本pipeline。
- Data readback：`knowledge_records` reader與writer policy不同；raw access固定映射update語意。現行record upsert與task link寫入非transactional，DEV-123 projection用新CAS transaction，不擴大成全域重構。
- Platform readback：Supabase Edge上限256MB、Free 150s／Paid 400s；Storage private bucket、signed URL及object RLS行為已納入。DEV-123 的 private schema 只為 service-role Edge function 的 PostgREST 路徑加入 API exposure，migration 仍撤銷 PUBLIC／anon／authenticated table grants；Edge private RPC 亦只授予 service_role。2026 changelog的public table exposure變更以BFF + explicit grants處理。Durability採job table／Cron，不依賴background task或pgmq delay。
- Provider readback：Gemini 3.5 Transcribe需Files API，word timestamp將單檔限制30分鐘且可能降accuracy；current phase切5分鐘、無speaker label／custom vocabulary。ZDR需project approval，Interactions `store=false`及File手動delete；這是qualification gate而非隱藏假設。
- Architecture、module responsibility、data/API/permission、migration、transaction、idempotency、failure recovery、retention、budget、performance、observability、exact surface、implementation order、model discretion、acceptance、commands及stop conditions均已鎖定。
- Tech Lead follow-up：manual retry 的 editor query 對 enum role／visibility 一律先轉 `text` 再比較，避免 PostgreSQL 將 `suspended` 或空字串隱式轉 enum 而誤失敗；control API verifier 另對 capability-bearing token／signed URL 做遞迴 redaction，並以 missing／invalid auth、cross-project、retry atomic／idempotency／conflict cases 固定回歸。
- 本輪修訂：補pointer/stop API、audio/discussion/gold分界、source freeze、跨run人工保護、projection ownership、單unit worker、獨立cleanup/usage ledger及0a/0b資格入口；刪除provider wrapper與重複worker review狀態。Local candidate 已落地 capture control、5分鐘音訊分段／IDB outbox、pause/resume clock epoch、pointer evidence、review/decision API與RecordSidebar面板（含WBS補連／改連）、manifest完整性檢查、fake worker、清理與CAS projection。控制面再補上八份 additive migration，其中第六份讓projection transaction從stored accepted decision補入任務連結，第七份讓complete-upload把manifest timeline綁定server segment readback，第八份讓projection request key同內容重送不重複寫入、異內容重送 fail closed；另補上reservation／verify、source-version CAS、signed playback、manual retry／cancel、worker lease與budget settlement、原子 complete-upload／manual-retry RPC；capture-progress 只寫 timeline，cancel 只釋放未 dispatch reservation；review 段落提供 editor-only 短效原音回聽入口。現行 MediaRecorder 輪替沒有雙錄音器重疊，因此 candidate 宣告實測 `overlap_ms=0`，不得把 metadata 當成 overlap 證據；reload 只可明確觸發 finalized outbox recovery，不能自動開麥克風。
- `npx tsc --noEmit`、DEV-123 pure verifier、`npm run verify:dev-123-meeting-task-resolution-db-isolated`、`npx supabase db lint --local`、`npm run build:test` 已通過；browser B01～B03 smoke 及 B04～B11 route-mocked browser/media candidate smoke 亦通過。B04～B11 使用受控 fake MediaRecorder、getUserMedia 與 Edge route mock，包含 recorder start／stop throw、audio track ended、pause/resume、single finalize、review candidate 與 human accept decision；只證明 UI lifecycle、分段、outbox 清空與 recovery 的 local candidate 邊界，不提供真實麥克風、hosted authenticated DB／Storage、provider 或品質證據。隔離 DB artifact 為 `output/qa/dev-123/db-isolated-result.json`，task-owned PostgreSQL 已以八份 migration 執行 control-plane core readback（source-version unique、budget reserve／settle、`SKIP LOCKED` claim、decision CAS、`complete_meeting_upload_v1` 原子重送、manifest timeline guard、manual retry 同 key replay／衝突不留 orphan run、accepted decision 缺省 link 仍由projection補入、projection 對 stale／archived／cross-project task link fail closed、projection request key 同內容重送 no-op／異內容衝突）並清理 runtime；task-owned local Auth／Storage readback另以 synthetic fixture 通過。仍無真實 browser/media、hosted authenticated DB／Storage、provider／品質／QA/QC證據；架構定案只適用本SPEC的條件式實作範圍，0a/0b失敗依第17節回送，不預填實測PASS。

結論：DEV-123已達 `Architecture Confirmed / Production Control Plane Deployed / Hosted Synthetic PASS / Frontend Feature-Gated / Provider Qualification Gate Pending`。hosted control API／Storage 已用 disposable fixture驗證並清理；下一個合法動作是WP-123-0a與真實browser/media，再以合格專案進WP-123-0b。沒有provider evidence前只准synthetic/fake資料，production build 必須將入口關閉。

### 20.1 Tech Lead follow-up（2026-09-15）

本輪稽核將 private meeting 的 editor 判定收斂為 `created_by／recorded_by` owner；非 private meeting 仍要求同 tenant／project 的 project editor。`complete_meeting_upload_v1` 現在於 capture lock 內重驗 manifest 的 epoch、offset、gap、overlap 與 verified segment exact set；Edge normalization 也先拒絕不合法 timeline。review task 查詢與 append-pointer 同樣限制 live、未封存、同 tenant／project 的 task／milestone。上述修訂已由 pure verifier、SQL lint、isolated PostgreSQL matrix、build 與 B01～B11 candidate smoke readback；不改變 provider qualification、完整 QA/QC 或 release gate。

本輪再補上 stop 的 frozen `epoch_manifest`、`final_pointer_sequence` 與 `source_gaps`，使 server 終點不會被晚到封包向後延長；append-pointer 限制單批 128KiB 並逐筆重驗 capture identity、epoch、offset、sequence 與 batch digest，reserve-segment 亦重驗 segment timeline 與冪等 reservation。pointer observer 在 element disconnect、drag、pointer cancel 時收斂區間，MediaStream track `ended` 會進入 missing-source recovery。這些控制面修訂已加入 static／browser-media／isolated evidence，仍不取代真實 provider、authenticated DB／Storage 或完整 QA/QC。

錄音控制的 UI 狀態也收斂為「`MediaRecorder.start()` 成功後才顯示 recording」；建立／啟動失敗會直接走 server-stop 與 missing-source recovery，不留下表面上錄音中的假狀態。pause/resume 同樣先確認 recorder 已成功啟動，再更新 UI 狀態。

fake worker／review path 也保留 transcript word offsets 與每個候選的 `quoteRange`；UI 在任務候選旁顯示原句詞範圍，pointer-only 候選明示仍需原句確認。這使「辨識哪一個既有任務」仍由文字證據主導，鼠標只做時間附近的輔助排序。

## 21. Platform／provider source snapshot

以下官方資料於 2026-09-14 完成readback；它們支持本SPEC的外部限制，不取代WP-123-0對實際project、API、model、價格與繁中品質的驗證：

- [Gemini Audio transcription](https://ai.google.dev/gemini-api/docs/transcribe)：長音訊使用Files API；word timestamps限制、相容性與accuracy風險。
- [Gemini Zero data retention](https://ai.google.dev/gemini-api/docs/zdr)：Interactions需`store=false`；Files API獨立於ZDR，必須主動刪除。
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)：256MB、Free 150秒、Paid 400秒及150秒request idle timeout。
- [Supabase signed upload URL](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl)：上傳capability有效兩小時，清理須涵蓋晚到upload。
- [Supabase Storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits)：實際global/bucket限制需檢查；50 MB是Free方案上限。
- [Supabase signed downloads](https://supabase.com/docs/guides/storage/serving/downloads)：已簽URL在TTL內有效，不因Auth key變更立即撤銷。
- [Supabase public table exposure breaking change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)：2026-10-30對既有專案套用新table explicit-grant行為；RLS與grants為不同層。

使用思考習慣：#多層次分析、#系統描繪、#限制條件
