# QA-DEV-123：會議錄音、滑鼠線索與既有任務辨識

- 狀態：`Architecture Confirmed / Local Preflight PASS / Hosted Control API 18/18 PASS / Production Frontend Feature-Gated / Full QA NOT EXECUTED / Provider Qualification Gate Pending`
- 對應 SPEC：[SPEC-123](../specs/SPEC-123-meeting-task-resolution-audio-pointer.md)
- 對應 DEV：[DEV-123](../dev_task.md#dev-123會議任務辨識與滑鼠停留輔助連結)
- Architecture Memory：[ADR-051](../decisions/ADR-051-projed-owned-meeting-analysis-pipeline.md)
- Risk lane：High；涉及麥克風、原始會議資料、Storage、editor-only授權、外部AI、非同步工作、刪除、預算與自動task link。
- 角色：RD先依本計畫self-test；QA重跑可重現案例；QC對frozen candidate只觀察正常UI／API／DB／Storage事實，不修改產品或補造成功資料。

## 1. Verification goal

證明具meeting edit權限的主持人每場手動開始錄音後，ProJED能以主持電腦麥克風與audio-clock-aligned pointer intervals建立完整manifest；上傳後即使關閉頁面，durable worker仍能在受控預算及provider ZDR契約內產生帶時間戳逐字稿與同看板既有任務結果。明確結果與模糊候選在同一meeting draft就地檢查，人工更正可保存並壓過後續AI，最後只有使用者發布。

QA同時證明以下負向事實：reader／no-access取不到raw audio、full transcript或candidate context；pointer-only、stale task、跨board、模型自造ID、late worker、重複submit、過期audio及額度不足都不能生成非法link或付費無界；Gemini File未確認刪除時不能標ready。

RD local preflight（2026-09-15）已通過：`npx tsc --noEmit`、`npm run verify:dev-123-meeting-task-resolution`、`npm run verify:dev-123-meeting-task-resolution-db-isolated`、`npx supabase db lint --local`、`npm run build:test`；browser B01～B03 smoke（控制可見、預設安全狀態、鼠標輔助提示）亦通過，artifact 為 `output/playwright/dev-123-meeting-task-resolution/result.json`。另已通過 `npm run verify:dev-123-meeting-task-resolution-browser-media` 的 B04～B11 route-mocked candidate smoke，artifact 為 `output/playwright/dev-123-meeting-task-resolution-media/result.json`；此候選只驗受控 fake MediaRecorder／getUserMedia／Edge route mock 的 UI lifecycle、分段、outbox 清空、單次 finalize、review candidate 顯示與 human accept decision，不替代真實 browser/media、provider 或品質證據。Provider contract gate 亦已執行，fake mode 只產生 `PENDING`，artifact 為 `output/qa/dev-123/provider-contract-result.json`，且 `dispatchPerformed=false`、`networkCallPerformed=false`；將 mode 切到未具資格的 `gemini` 時，gate 產生 `FAIL_CLOSED` 且同樣不 dispatch。Local candidate 另已落地 pause/resume、review/decision API、同草稿面板（含補連／改連）、reservation／verify、source-version、playback／retry／cancel、editor-only 短效原音回聽、音訊 manifest timeline 完整性檢查、pointer/audio IDB pending/ack outbox 與明確 recovery。隔離 DB artifact 為 `output/qa/dev-123/db-isolated-result.json`，control-plane core 已讀回 unique／budget／claim／decision CAS／raw table grants、stop metadata default/freeze、pointer-only acceptance guard、cleanup obligation identity unique、`complete_meeting_upload_v1` 的同 manifest 重送冪等與唯一 run、manifest timeline 的 `completeUploadTimelineGuard`、stale source version 的 `completeUploadSourceVersionGuard`、取消後晚到 worker 不得復活 capture 的 `cancelLateWorkerGuard`、manual retry 同 key replay／衝突不留 orphan run 的 `retryAtomicity`、private meeting projection 的 `saveProjectionPrivateAuth`、published late projection guard、accepted decision 缺省 task link 仍由transaction補入的 `acceptedDecisionProjection` 與 stale／archived／cross-project task link fail-closed 的 `projectionTaskScope`；append-pointer 另驗 tenant／project、live task／milestone／非 archived scope，單批 payload 上限 128KiB 且重驗 capture identity、epoch、offset、sequence、digest，reserve-segment 亦重驗 timeline 與冪等 reservation；stop 凍結 epoch manifest、最後 pointer sequence 與 source gaps，pointer element disconnect／drag／cancel 會關閉區間，MediaRecorder start failure 或 audio track ended 會 server-stop 並 freeze missing source。Review callback會把已採用任務同步進draft供即時顯示，但save-projection仍由server accepted rows作最終authority。hosted authenticated DB／Storage control path 已另以一次性fixture通過；尚未以真實 browser/media與合格provider證明完整產品資料路徑，因此不替代完整 phase gate、provider與QA/QC證據。

本輪新增的 recorder `stop()` throw case 已由 B04 media verifier 讀回 `stop` → `complete-upload`，capture state=`queued`；因此本機 finalize 例外不會留下 server `recording`。此為 local recovery evidence，仍不替代真實 browser/media 與完整 QA/QC。

另補強 recorder start lifecycle：B04 的 start-failure case 會確認 `MediaRecorder.start()` 成功前不進入 recording UI；建立／啟動失敗仍沿 server-stop／missing-source recovery 收斂，pause/resume 也先成功啟動 recorder 才更新畫面狀態。這是 local candidate 的狀態一致性證據，不替代真實裝置與完整 browser/media gate。

Provider fail-closed 也納入 local preflight：fake mode 產生 `PENDING` 且不 dispatch；隔離的未具資格 mode 產生 `FAIL_CLOSED`、預期 exit code=2 且同樣不 dispatch，artifact 為 `output/qa/dev-123/provider-contract-fail-closed-result.json`。這只證明安全邊界，仍不等於 WP-123-0a/0b qualification。

另以 task-owned Supabase full-stack runtime 完成 `npm run verify:dev-123-auth-storage-local`：Auth login/user readback、raw capture 對 anonymous/authenticated user 的拒絕、service-role readback、`meeting-audio` private bucket、private object 的 user 拒絕／service readback、capture fixture 與 cleanup 均 PASS（artifact：`output/qa/dev-123/auth-storage-local-result.json`）。這是 local authenticated DB／Storage evidence；hosted evidence 另由下段獨立記錄。

另以含 Edge runtime 的 task-owned Supabase full-stack 完成 `npm run verify:dev-123-control-api-local`，P01/P02/P05/P06/P07/P09/P10/P14/P15、P01 missing／invalid auth、P02/P13 cross-project deny、P21 cancelled retry deny、P21 retry precondition／atomic／same-key idempotency／conflict no-orphan 與空候選 review cases 全數 PASS（Auth actor、begin/status、pointer append replay、signed upload、SHA-256 verify、stop freeze、complete-upload replay、fake worker ready／transcript／budget settlement、purge secret／expired audio cleanup、signed playback、cancel、cancel後 playback deny、service-role raw readback）；artifact：`output/qa/dev-123/control-api-local-result.json`。verifier 對 token／signed URL 做遞迴 evidence redaction；此 runner 以 host-reachable origin 重寫 Docker 內部 signed URL，private schema 僅供 service-role Edge function 的 PostgREST 路徑使用，private table grants 仍拒絕 PUBLIC／anon／authenticated；不替代 hosted authenticated DB／Storage、真實 browser/media、provider 或完整 QA/QC。
Hosted gate 已針對正式 project `knodlkxqpcqyrtgwpdst` 執行：9份授權migration與3個Edge Functions已部署，PostgREST exposure為`public,private,graphql_public`，private grants仍限制service-role。`npm run verify:dev-123-hosted-readiness` 6/6 PASS；另以disposable Auth user／tenant／project／WBS task／meeting／synthetic audio／pointer interval執行control API與Storage 18/18 PASS，辨識回唯一合法任務並完成fixture cleanup。worker固定fake、provider dispatch=false、actual cost=0，因此只證明hosted control path，不代表Provider ZDR／Files cleanup／真實轉錄或品質。artifact：`output/qa/dev-123/hosted-readiness-result.json`、`output/qa/dev-123/hosted-control-api-result.json`。

補充工程檢查：`npm run lint` 全 repo 通過（0 errors；既有 65 warnings），不將既有 warning 誤算為 DEV-123 failure。

WP-123-0a 官方能力 readback 已確認目前文件仍列 `gemini-3.5-transcribe` 的 word timestamps 與 timestamp／diarization 時單檔 30 分鐘上限；project-level ZDR 核准、實際 API/model/config/price 與 Files delete readback 仍未取得，因此資格狀態維持 Pending。

純契約 verifier 另覆蓋 auth／Storage 邊界：control function 必須以 Bearer token 呼叫 `auth.getUser()` 建立 actor，raw capture 表與 private cleanup 表撤銷 anon/authenticated 權限並只授予 `service_role`，`meeting-audio` bucket 必須是 private；這是 static contract evidence，仍不替代 authenticated runtime readback。新增的 `20260915170000_dev_123_projection_request_idempotency.sql` 讓 `save_meeting_projection_v1` 對相同 `request_key + payload_hash` 重送為 no-op，key reuse 搭配不同 payload 會在任何 record/link mutation 前回 `PROJECTION_REQUEST_CONFLICT`；isolated matrix 已含 replay／conflict readback。

## 2. Candidate freeze、環境與清理

每輪記錄：

```text
date/timezone + branch + HEAD + git status --short
changed source / migration / Edge function / verifier hashes
build id + base URL + backend + Supabase project ref / plan / region
browser exact version + OS + viewport + deviceScaleFactor + supported MIME
provider project alias + ZDR evidence date + model/API/config/price versions
actor aliases + tenant/project/record/capture/run ids
worker/Cron/Vault configuration fingerprints（不含secret）
runtime project / purpose / port / process tree / cleanup condition
```

只可使用isolated/local或明確approved non-production project。任何Vite、Supabase local stack、browser、provider probe、test recorder或worker皆先記owner；結束時只停止本DEV建立的process tree、釋放port、關閉task-owned browser surface並清理fixture Storage/provider Files。不得停止其他任務runtime或清production資料。

Provider預設fake。WP-123-0a先唯讀核實project/ZDR/API/價格；0b在這些前提與同pilot測試ledger就緒後用synthetic實測。0b不能要求Q03～Q08先PASS才能執行，因其目的正是產生這些證據。真實會議須完整provider gate後才可試點；沒有資格時標Pending／Not verified，不用fake PASS取代。

## 3. Controlled fixtures

### 3.1 Actors與meeting records

- Actor A：project member，能edit非private meeting；是private meeting A的creator/recorded_by。
- Actor B：同project viewer，只能read已發布正文，不能edit或讀raw。
- Actor C：另一project writer，無A project權限。
- Actor D：同workspace另一project writer，用於cross-board negative。
- Record R1：A可編輯、status=draft、visibility=project，含人工文字及人工task link。
- Record R2：A private meeting；B即使是project member也不能讀。
- Record R3：published meeting；late run不能修改。
- Record R4：archived/deleted lifecycle fixture。

### 3.2 WBS與gold corpus

至少建立：

- 同名不同父層／不同客戶tasks；完整path不同。
- title code、繁中口語別名、中英混說、發音相近task。
- task／milestone／group、archived、deleted、rename、move-to-other-project版本。
- pointer A但明確說B、先說後指、先指後說、換題後不動、一段多task、無task、無pointer。
- tracking reference、unplaced、merged cell、hover card、no-description task及跨view同canonical task。

正式held-out至少10場、100個gold段落－task pairs，另有獨立calibration meetings與無gold meetings；held-out不可兼作調參。Gold在ASR／模型前由原始audio時間範圍標註，保存gold ID、task快照、多task及quote容許規則；不使用ASR產生的transcriptSegmentId作gold identity。ASR漏段仍留在G。

### 3.3 Audio與pointer fixture

- 可解碼WebM/Opus或browser fallback格式：30秒、5分鐘boundary、60分鐘多segment。
- 現行 local candidate 以 MediaRecorder stop/start 輪替，manifest 宣告實測 `overlap_ms=0`；synthetic fixture 仍須獨立驗證 rotation gap／overlap 欄位與解碼涵蓋，不能把欄位值當成實體重疊證據。若產品要求非零重疊，需另開 dual-recorder architecture amendment。
- quiet/no speech、noise、code-switch、專有名詞、重複句、segment overlap、rotation gap、corrupt blob、wrong MIME、>10MiB。
- MediaRecorder fake：granted、denied、device lost、pause/resume、ondata late、start/stop throw、crash before/afterIDB readback。
- Pointer stream：flyover、1s/5s/30s dwell、task→hover card、scroll、drag、blur、hidden、element recycled、view switch、clock epoch reset。
- Fixture輸入全部synthetic／去識別，不包含真實客戶或員工對話。

### 3.4 DB／worker fixture

- Isolated PostgreSQL包含DEV-123 migration、auth.users/profiles/tenant/project/wbs/knowledge record最小基線、Storage metadata stub及RLS helpers。
- Fake provider可暫停在upload、interaction、response、DB write、file delete前後，回429/5xx/timeout/malformed JSON/invalid ID/usage missing。
- N=20 concurrent complete-upload／retry／worker claims；stale lease、late response、decision CAS、record updated_at conflict、month boundary及audio expiry可控制時鐘。
- Storage fake區分reserved/not uploaded、wrong bytes/hash、complete、deleted、signed URL expired；provider file list含已追蹤及crash orphan prefix。

Fixture sanity失敗、gold已被模型輸出污染、actor權限不明或預置expected match時，整輪Fail／Blocked，不能以空結果或seed成功資料通過。

## 4. WP-123-0a／0b Qualification cases

| ID | 必要證據／通過條件 |
|---|---|
| Q01 | 供應商文件或核准證據對應實際Gemini project ID alias；ZDR已核准，不只paid tier、關閉log或口頭說明。 |
| Q02 | `gemini-3.5-transcribe`、`gemini-embedding-001`及matching/summary model各在同核准project／API適用範圍；無未核准fallback。 |
| Q03 | Transcribe Interactions request readback為`store=false`、`background=false`、無previous ID；verbatim word timestamp、無diarization/custom vocab。 |
| Q04 | Matching/summary Interactions `store=false`、無background/history/grounding/tools/explicit cache；embedding只送單segment。 |
| Q05 | Gemini File success、provider error、cancel及cleanup retry都由File API get/list證明not found/deleted；未刪除run不ready。 |
| Q06 | 在upload完成後、DB記external ID前模擬worker crash；專用project中固定display prefix sweeper可找到並刪除orphan。 |
| Q07 | 5分鐘或SPEC允許的較短完整segment，synthetic繁中／中英混說在95秒external I/O預算、<120秒整unit內回傳word offsets；含Files lifecycle、decode、memory及回應上限。 |
| Q08 | timestamp accuracy與transcript word coverage可支援pointer window；若不足，標Fail並命中stop condition，不用speaker label或smart mode偷換。 |
| Q09 | 價格、usage欄位、currency及price version可轉成保守reservation；usage缺失時不結算為0。 |
| Q10 | qualification缺失、key/project mismatch、store=true或fallback未核准時，control/worker在送content前fail closed。 |
| Q11 | Repo readback：current task-only索引coverage/freshness、Gemini3072維相容、Storage global/bucket限制、record edit/save/link規則；缺索引列實際降級與後續品質影響。 |

0a收Q01/Q02/Q09/Q11唯讀前提；0b在WP1～4的probe/ledger/cleanup可用後收Q03～Q08/Q10實測。Q01～Q11全數有證據才標完整Qualification PASS。API/model可用性需0b實際呼叫覆核；不以文件列有型號代替。

## 5. Static／pure contract cases

| ID | 驗證 |
|---|---|
| S01 | `startMeetingRecord`仍只啟用meeting mode；錄音只由RecordingControls明確action進入。Recovery/load/view change無getUserMedia import side effect。 |
| S02 | Capture state machine、clock epoch、5分鐘rotation、overlap/gap、IDB readback、manifest completion及audio expiry為單一contract。 |
| S03 | Pointer resolver只輸出canonical task ID；hover card交接合併；x/y、DOM path、raw movement及會議外事件不在schema。 |
| S04 | Pointer event未呼叫DEV-109 commit／activity／content projection；pointer-only不能進accepted。 |
| S05 | Candidate union只含same-project active task/milestone；RAG source/hash/current WBS guard、max12及live revalidation存在。 |
| S06 | Structured output parser拒絕unknown field、invalid quote range、ID不在candidate、跨board、archived/deleted及malformed multi-task。 |
| S07 | Human decision version優先；rerun/late worker不能覆寫`decision_source=human`。 |
| S08 | Draft projection只含accepted safe excerpt/task mention；pending/raw transcript/candidate/provider/file path不進content/metadata/RAG。 |
| S09 | Projection保存使用record updated_at + review revision CAS及transactional exact-set links；相同requestKey/hash回receipt，同key異內容conflict，人工link保留。 |
| S10 | Job claim為SKIP LOCKED + lease token/stage cursor；late completion拒絕；每unit最多1 paid AI call、固定1unit/invocation、最多2自動attempt。 |
| S11 | Budget以global pilot Asia/Taipei month及integer micros；server計reservation，client無amount；missing usage保留reserve。 |
| S12 | 所有raw public tables RLS enabled、anon/auth grants revoked、service role explicit；public service RPC security invoker + empty search_path + service-only execute。 |
| S13 | Edge control每request auth.getUser + transaction edit recheck；private record與nonprivate writer語意等同現行update policy。 |
| S14 | Storage bucket private、path server-generated、no upsert/public URL；signed playback TTL<=60s，audio expiry檢查在sign前。 |
| S15 | Logs/metrics schema沒有title、participants、audio、transcript、quote、task title、candidate text、provider response或secret。 |
| S16 | Gemini adapter只有dedicated ZDR key及allowlist；獨立artifact cleanup ledger + finally delete + prefix sweeper，Interactions store=false。 |
| S17 | Package scripts、SPEC／ADR／QA／DEV／map互鏈；status保持Local Candidate Implemented／NOT EXECUTED，沒有把局部smoke預填成完整PASS。 |
| S18 | audio/discussion/gold identity分離；quote word offsets映射可回原audio，rematch重用immutable transcript revision；held-out無調參依賴。 |
| S19 | `process_meeting_analysis` 與 `purge_meeting_audio` 都要求獨立排程 secret；缺失／錯誤 secret fail closed，logs 不含 secret，未通過前不 claim／不清理／不 dispatch。 |
| S20 | `retry_meeting_analysis_v1` 在同一 transaction 鎖 source run/capture 並重驗 editor；同 request key replay，併發衝突／cancelled／expired retry 拒絕且不留下 orphan run。 |

## 6. Browser functional／visual cases

| ID | 操作與通過條件 |
|---|---|
| B01 | 從正常meeting入口開始，只有按「開始錄音」才出browser mic prompt；old record、reload、recovery、六view switch均0 prompt/start。 |
| B02 | granted後依序顯示準備中→錄音時間；server begin失敗時tracks停止、草稿仍在、沒有假recording。 |
| B03 | denied、no device、device lost、MediaRecorder 建立／start／stop error都保留manual content並有最短原因／重試；server capture 必須收斂為 stopped/missing，不能留下 recording；role=alert/status可由screen reader取得。 |
| B04 | pause同時關audio/pointer interval；resume新clock epoch。Stop finalize一次，不因double click產生兩capture/run。 |
| B05 | 60分鐘fixture形成可解碼ordered segments；每段local IDB complete/readback後才送，server ack後才刪local blob。 |
| B06 | upload中reload／offline後，重開同meeting不收音，能續傳本人finalized segments；current tail loss明示gap。若無法重建完整 pointer batch／audio manifest，續傳後只能標 `partial`，不得靜默排入分析。 |
| B07 | A recording期間task surface→hover preview為一連續interval；flyover/drag/scroll/hidden/recycled element/view switch符合close/restart規則。 |
| B08 | A→B明確發言、pointer停A，review不得accepted A；no pointer仍產生text candidates；pointer-only candidate不得直接accept，需原句證據或明確人工add/replace。 |
| B09 | complete upload後關browser，worker fake完成；重開R1讀到相同run/deadline/accepted/pending。 |
| B10 | Accepted與pending在同一RecordSidebar內容附近，不另開matching page；點擊後才讀path/context/playback。 |
| B11 | 人工accept/replace/add/reject保存後reopen仍在；review callback把accepted task寫入draft link set，rerun顯示new suggestion但current human decision不變。 |
| B12 | Save/publish保留原手寫content及人工links；review callback即時同步accepted task link，projection transaction再從stored accepted rows補入缺漏link，pending不進；CAS conflict保留兩邊並可恢復。 |
| B13 | Run未terminal時publish需等待或明確cancel；published R3不被late result改寫。 |
| B14 | Editor playback能在期限內取得短效URL；viewer B/no-access C看不到control/full transcript/audio/candidates。 |
| B15 | expiry前1秒簽URL，其expiresAt不可跨audio expiry；到期新URL拒絕。已關閉browser的local Blob於下次啟動／讀取前purge，不宣稱關閉期間已實體刪除。 |
| B16 | budget insufficient顯示待額度，0 provider request；manual meeting/save/publish路徑仍可用。 |
| B17 | 錄音中、finalizing、local blob未readback時PWA reload safety阻擋自動reload；安全後依既有更新流程。 |
| B18 | 1440×900、1024×768、200% zoom無遮擋、雙捲動、水平overflow或截斷；control不與publish等權重混淆。 |
| B19 | Tab/Shift+Tab/Enter/Space/Escape可操作record/pause/stop/review/popover，focus回來源；狀態不只靠顏色，reduced motion正常。 |
| B20 | 390×844/coarse pointer維持現行meeting unavailable；沒有偷偷擴張mobile recording或broken partial UI。 |
| B21 | 第二分頁begin不重複收音；crash後180秒interrupted，以最後progress/segment收斂stoppedAt，晚到傳輸不延期。 |
| B22 | pointer flush先於complete-upload；延遲／重送batch及freeze後補資料不改已排run的source hash；無pointer時明示missing。append 失敗時停止流程保留已封存音訊、標記 partial source，不得把遺失線索當成完整空集合；UI/API失敗後不得假留在 recording。 |
| B23 | 無match row的段落可add/clear-all；ASR重轉split/merge後原human accept/reject/empty仍受保護，只有明確套新revision可取代。 |
| B24 | 人改AI區塊、同task由兩段支持、同task兼人工link：重跑／reject一段後正文不append重複、不刪仍有支持的link。 |

UI QC依 `ui-qc-checklist`：正常狀態不加常駐教學卡；每個狀態只在受影響物件附近顯示一份訊號；高損失stop/cancel/provider pending保留必要恢復；evidence popover不形成第二主畫面。

## 7. API／DB／Storage authorization cases

| ID | 驗證 |
|---|---|
| P01 | Missing/invalid/expired JWT及anonymous user對每個control op固定回 `AUTH_REQUIRED`／401，viewer、private non-owner與跨project固定回 `FORBIDDEN`／403，0 service mutation。只帶Authorization header但getUser失敗不得通過；未知 backend／SQL/provider detail 不得原樣回傳。 |
| P02 | A可begin R1/R2；同 project editor 可操作非 private R1，private 仍限 creator／recorded_by；B read-only、C foreign project、D cross-board與 published/archived record 均不能 begin/status/transcript/playback/decision/projection。 |
| P03 | Private R2只有creator/recorded_by依現行edit語意通過；project writer但非owner不得因一般write權讀private raw。 |
| P04 | Client不能指定tenant/project/actor/path/budget/provider/model/expiry；都由record/session/server config解析。 |
| P05 | Same begin idempotency key回同capture；different actor/record collision拒絕。Same complete segment/hash no-op，different hash conflict。 |
| P06 | Manifest expected count、contiguous index、bytes/MIME/hash/Storage object readback任一不符不寫upload_completed_at、不reserve。 |
| P07 | Complete upload同transaction寫immutable timestamp/deadline、budget reserve及唯一run；commit不明重試不產生第二run。 |
| P08 | N=20並行complete/retry後`spent+reserved<=NT$1000`；跨actor/tenant仍共用同pilot bucket。 |
| P09 | N=20 worker claim每unit只有一active lease；late token/stage response拒絕。Provider side effect可能重試，但result/link/ledger有界。 |
| P10 | Reader/no-access直接REST tables、RPC、Storage list/download/createSignedUrl都拒絕；service-only grants及RLS readback吻合。 |
| P11 | Actor permission在auth check後、RPC transaction前撤銷，transaction再檢查並拒絕；沒有TOCTOU service write。 |
| P12 | Decision CAS及record projection CAS conflict不覆寫；accepted task在transaction前archive/delete/move後拒絕link；client省略accepted link時仍由server補入，stale task整筆拒絕。 |
| P13 | RAG query只回current-hash WBS task/milestone；pointer append與projection也必須拒絕 knowledge record、group、archived、stale document與foreign project，不能靠過濾 join 靜默丟棄。 |
| P14 | Archive/cancel/expiry/deletion建立Storage/provider cleanup obligation；late worker只能cleanup，不能recreatecontent。 |
| P15 | Purge先讓API不可讀再刪object；cancelled／expired capture立即不可播放，delete失敗仍不可簽URL，重試不改audio_expires_at。 |
| P16 | 永久刪record後raw rows不存在，Storage/provider cleanup與未知usage ledger仍在；晚到worker不可還原內容，仍可清理／結算一次。 |
| P17 | 同segment同digest重送no-op、改digest conflict；不同index相同hash合法。server實際重算bytes/hash，不信client宣告。 |
| P18 | resolution整組add/replace/clear-all CAS，capture.review_revision一起遞增；同時save-projection必衝突而不部分套用。 |
| P19 | DEV-123同saveDraft／undo／redo只走CAS路徑，舊client直接published在active run被DB guard攔；非DEV-123路徑維持。 |
| P20 | 月底reserve、隔月dispatch時舊預留不能通行；需明確retry及新月原子reserve。刪record不釋放已dispatch未知usage。 |
| P21 | Manual retry 的 run insert 與 capture queue transition 必須由 `retry_meeting_analysis_v1` 原子完成；同 key 回既有 run，另一 request key 不得在 capture 已排隊後新增 run。 |

DB verifier另對高量 `meeting_analysis_runs(state,next_attempt_at)`、segments、transcript及expiry query執行`EXPLAIN`，確認使用SPEC列出的index；測試規模與實際plan另列，不以index存在文字判PASS。

## 8. Worker／provider failure matrix

| ID | Fault | Oracle |
|---|---|---|
| W01 | Cron重複／重疊invocation | lease隔離；每unit最多一active owner，無duplicate result |
| W02 | Worker於provider upload前中止 | 無provider file，lease expiry後可重試 |
| W03 | File upload後、DB external ID前crash | display prefix orphan sweeper list/delete，run未ready |
| W04 | Interaction timeout／429／5xx | 1m/10m bounded retry、attempt與reservation可讀，第三次自動call為0 |
| W05 | Invalid transcript offsets／malformed JSON | terminal safe error或可控retry；不寫partial accepted match |
| W06 | File delete 5xx | cleanup_pending；draft result不ready，sweeper後才轉ready |
| W07 | Worker lease過期後late成功 | stale response不能覆寫；provider file仍清理，usage仍入帳一次/attempt |
| W08 | Deadline超過 | overdue_at保存、status真實；case留在SLO分母 |
| W09 | Audio在retry前到期 | 不重新上傳provider；轉expired並清理 |
| W10 | Record publish/archive/delete於run中 | publish依UI契約cancel/等待；archive/delete拒絕projection並cleanup；取消先完成時，晚到worker不得把capture由`cancelled`復活成`ready` |
| W11 | Usage missing／currency unknown | reservation不釋放為0，visible billing error，0後續paid stage；usage settlement先於`ready`，不得留下ready／reserved不一致 |
| W12 | ZDR config/project fingerprint drift | 在content dispatch前fail closed並要求requalification |
| W13 | 舊2小時signed upload token在取消／刪除後上傳 | finalize拒絕，surviving cleanup obligation找到並刪object；token到期／晚到傳輸前不報清理完成 |
| W14 | Sweeper遇active upload lease或provider list分頁未完 | 不誤刪active file、不因第一頁空就ready；orphan只按ledger／失效lease清理 |
| W15 | Crash在dispatch前登attempt後／provider扣費後 | attempt不歸零，SDK不額外重試；unknown usage保持worst-case預留 |
| W16 | Actor在排隊後失去edit權 | dispatch前拒絕；在途回應不套draft，cleanup/usage仍執行 |
| W17 | 未通過provider qualification卻以非fake mode入列 | fail closed；不得送出內容，已建立的初次預留以known zero usage釋放，run保留明確錯誤 |
| W18 | 排隊或未dispatch run 被取消 | 未發出的 `reserved` attempt 以 known zero usage 原子釋放；unknown/in-flight attempt 保留對帳責任 |
| W19 | 兩個不同 requestKey 同時 manual retry，或 retry 撞上 cancel/expiry | capture row lock 串行化；只有一個新 run 可入列，其他請求明確衝突，cancelled/expired 一律拒絕且不產生孤兒 run |

## 9. Matching quality與滑鼠增益

Calibration與held-out分開，至少樣本要求見第3節。兩組用同audio、ASR revision、discussion切分、model/prompt、最多12候選及token cap：
A=text-only（關pointer候選／feature）；B=text+pointer。候選內容可以不同，預算與非pointer排序規則相同。先凍結config再測，不能用held-out調score/dwell。

Gold G 的key為 `(humanGoldSegmentId, canonicalTaskId)`，由原始audio標註，含ASR完全漏掉的發言。
Prediction quote先經word offsets轉capture時間，與**不重疊的gold時間區間**對齊：最大時間重疊且覆蓋prediction quote至少50%時歸該gold ID；同分或未達50%記unmatched prediction，不能刪掉。
此映射只看時間、不看正確task答案；同gold/task的重複自動候選去重為一pair，多task分開。Quote跨多gold不可一筆算多TP；unmatched/wrong task進FP。Mapping規則及允許邊界在calibration結束時凍結。

```text
P = 映射後、人工修正前的auto accepted pairs（含unmatched標記）
TP = |P ∩ G|
FP = |P| - TP
FN = |G| - TP
precision = TP / |P|
recall = TP / |G|
```

有G但P空：recall=0；無gold meeting另報false positives，空precision不填100%。
至少包含完全ASR漏段、ASR split/merge、同task重複提及、同段多task、無task／無pointer及長會議尾段。
B達95% precision／90% recall、invalid/unauthorized/cross-board=0才可正式auto-accept；報A→B差異、各場TP/FP/FN、candidate recall、pending、ASR coverage、時間戳偏差及人工修正負擔。
Evaluation mode可先計算auto結果但不得投影真實會議，避免「已達品質才可測品質」循環；失敗須保留原結果，不能回調參後重用同held-out宣稱首次通過。
這是工程point estimate，不宣稱統計保證；另附樣本數與信賴區間。


## 10. Timing、retention與cost cases

- T01：60分鐘complete upload transaction的`upload_completed_at`到ready持久readback `<=24h`；包含正常queue/retry/cleanup，browser可全程關閉。
- T02：partial upload不啟動clock；完成後重開／retry不重設。Worker開始時間不作起點。
- T03：audio expiry固定server收斂的`stopped_at + 7 days`；含interrupted、晚到upload、retranscribe、cleanup及cross-month。播放TTL不跨expiry；closed browser以next-start purge驗證。
- T04：timezone boundary以Asia/Taipei；dispatch month與reservation轉移依SPEC10；Q probe/local測試不得獨立再取得一份NT$1,000。
- T05：60分鐘provider call/usage/Storage bytes/egress及reservation與價格版本可重算；試算和invoice差異分列。
- T06：provider unavailable、budget insufficient、overdue、expired都留在各自分母；不刪失敗案例後宣稱100%。

## 11. Protected regressions

必跑：

```text
npm run verify:dev-106-meeting-local-safety
npm run verify:dev-108-task-meeting-note-persistent-list
npm run verify:dev-109-meeting-live-task-change-capture
npm run verify:dev-110-unplaced-task-meeting-record-boundary
npm run verify:dev-117-cross-mode-meeting-continuity
```

驗證pointer不進DEV-109 activity；六view切換不重建meeting/capture；manual quick note與content不丟失；unplaced/tracking reference仍用canonical owner；recovery不自動收音；published record、existing synchronous synthesis及meeting-negative mobile維持原契約。

## 12. Planned commands

```text
npm run verify:dev-123-meeting-task-resolution
npm run verify:dev-123-local-preflight
npm run verify:dev-123-provider-contract
npm run verify:dev-123-meeting-task-resolution-db-isolated
npm run verify:dev-123-meeting-task-resolution-browser
npx tsc --noEmit
npx eslint <DEV-123 changed source files>
npm run build:test
git diff --check -- <DEV-123 owned files>
```

目前已建立純契約、provider contract gate、B01～B03入口 browser smoke，以及 B04～B11 route-mocked browser/media candidate smoke，並完成 task-owned PostgreSQL control-plane core readback；provider contract 在 fake mode 只產生 `PENDING`，不執行網路呼叫，也不替代 WP-123-0a/0b。B04～B11 只驗證正常 UI 入口在受控 fake MediaRecorder、getUserMedia 與 Edge route mock 下的開始／recorder start failure／audio track device loss／暫停／恢復／停止、分段、outbox 清空、單次 finalize、review candidate 顯示與 human accept decision；它不提供真實瀏覽器麥克風、hosted authenticated DB／Storage、provider 或品質證據，也不把 route mock 當成完整 browser/media QA。Cleanup sweeper 對 `kind=provider` 會寫入 `PROVIDER_CLEANUP_ADAPTER_REQUIRED` 的 failed/retryable 狀態，對缺 locator 的 storage row 會寫入 `STORAGE_LOCATOR_MISSING`，並以 `lease_token／lease_expires_at` 避免重複處理，不會靜默略過或偽造刪除；`deleting` 中途失敗的 row 會依 `due_at` 再掃描，ledger update 錯誤會 fail-fast；這只證明 fail-closed 邊界，不能代替 provider Files delete/list readback。task-owned local Auth／Storage readback已獨立通過，但 hosted authenticated DB／Storage、provider synthetic evidence與真實browser/media scripts仍未完成，因此這份文件不宣稱QA PASS。Browser verifier須從正常meeting入口及真實task surface產生capture／pointer／review，fixture只能建前置data，不能直接insert expected match或修改store冒充UI成功。

Protected regression static preflight 已執行並通過 DEV-106、DEV-108、DEV-109、DEV-110、DEV-117；這只代表相鄰契約未被本輪修改破壞，仍不等同本 QA 的完整 browser／QA／QC gate。

補充：`verify:dev-123-meeting-task-resolution-browser-media` 的 B04～B11 僅是 route-mocked candidate smoke（含 review candidate 與 human accept）；完整 gate 仍要求真實麥克風、hosted authenticated DB／Storage、provider synthetic evidence 與品質矩陣，故不改變 `Full QA NOT EXECUTED`。`npm run verify:dev-123-local-preflight` 已將 local pure/provider、isolated DB、task-owned Auth／Storage、含 Edge runtime 的 Control API、schema／type／lint／build、protected regression 與 browser/media candidate steps 串接，產生 `output/qa/dev-123/local-preflight-result.json`，結果為 `PASS_WITH_EXTERNAL_GATES_PENDING`；該結果不替代 hosted gate、完整 QA/QC 或 release。

## 13. Phase gate與證據

| Gate | 最小出口 | 尚不能證明 |
|---|---|---|
| WP0a | Q01/Q02/Q09/Q11可核對的唯讀前提；缺項記Pending | 真實API/cleanup/品質 |
| WP1～2 | 已具實作的pure/auth/source/job/budget/cleanup schema案例；後續matching/projection/UI案例保持待對應WP執行，不能要求全QA先PASS | 雲端project資格及後續UI |
| WP3～4 | Browser capture/source freeze、worker fault/cleanup；B21/22、W13～16 | 語意95/90 |
| WP0b | synthetic實際API證據，完整Q01～11；無循環marker前提 | 真實會議品質、release |
| WP5～7 | B23/24、resolution/projection、held-out及timing/budget | 獨立QC或release |
| WP8 | 適用QA全部結果與frozen candidate QC的正常UI/DB readback | 尚未執行的部署 |

## 14. Evidence與判定

Evidence至少包含：command/exit code、source/verifier/migration/function hashes、audio manifest及decode probe、clock gap/overlap、network/console/visible error、DB rows/RLS actor matrix、Storage/provider cleanup readback、run/lease/attempt/budget ledger、quality TP/FP/FN、24h timestamps、UI screenshots、accessibility/focus probe及task-owned resource cleanup。

不得保存真實audio/transcript、JWT、Gemini/Supabase key、worker secret、signed URL、participant/task title或provider raw body；artifact以synthetic aliases及hash表達。

判定：

- `QA PASS`：所有適用P0/P1、provider qualification、95/90、24h、7日、budget、editor-only、cleanup、protected regressions及UI QC有真實證據。
- `FAIL`：非法link、raw資料洩漏、自動收音、人工決定被覆寫、預算超額、未刪provider file卻ready、draft/data loss或visible error。
- `NOT VERIFIED/BLOCKED`：缺provider核准、裝置、時間、環境或無法觸發。不得折算PASS。

QC只對QA通過且source/hash frozen candidate執行。第一個產品或資料缺陷回RD；修正後重跑受影響案例與相鄰protected regressions，不由QC直接改碼。

使用思考習慣：#可驗證性、#限制條件、#系統描繪
