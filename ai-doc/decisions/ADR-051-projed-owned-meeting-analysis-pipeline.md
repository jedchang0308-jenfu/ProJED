# ADR-051：ProJED 擁有會議分析排程、原始資料面與草稿投影

- 狀態：`Accepted / Architecture Confirmed / Production Control Plane Deployed / Frontend Feature-Gated / Provider Qualification Gate Pending`
- 日期：2026-09-14
- 關聯：[DEV-123](../dev_task.md#dev-123會議任務辨識與滑鼠停留輔助連結)、[SPEC-123](../specs/SPEC-123-meeting-task-resolution-audio-pointer.md)、[QA-DEV-123](../qa/QA-DEV-123-meeting-task-resolution-audio-pointer.md)、SPEC-109／110／117、ADR-049
- Source revision：branch `持續優化3`；發布身分由不可變 release manifest 保存
- 決策來源：使用者已確認錄音、pointer、會後處理、保存、預算、品質、權限與人工發布邊界，並要求升級到架構確定。供應商保存條件固定為「不得保留可回取的會議內容」，不再以問卷題號作為工程依賴。

## Context

目標是把會議討論連回ProJED既有任務，並可由人工追溯／更正。關閉分頁後仍須完成，且受7日錄音、24h處理、NT$1,000月額、95/90品質、editor-only raw與provider不得保留可回取內容的保存條件約束。
repo已有useRecordStore／RecordSidebar、canonical hover、RAG及同步整理；現行record與links非transaction寫入、同步整理有30秒client timeout，無法承擔長音訊與可靠重試。

## Options

| 選項 | 主要取捨 | 結論 |
|---|---|---|
| 擴充synthesize_meeting_record同步endpoint | 檔案少，但長連線、截斷、重試、清理及draft版本缺口仍須另補 | 不採 |
| ProJED DB job／lease＋短Edge worker，provider單次推論 | 新增有明確生命週期的capture、job、cleanup及projection責任；能由ProJED追蹤來源／費用／更正 | 採用 |
| 端到端第三方scribe／Graphiti | 仍需canonical task限制，另增加資料保存／歷史記憶／同步與外部服務責任 | 首版不採 |

## Decision

採ProJED-owned durable pipeline；Gemini不擁有conversation/background state。
責任分開但只有一個meeting lifecycle：

```text
useRecordStore / knowledge_records：會議與草稿
browser / private Storage / source tables：錄音與時間證據
control API / DB run + lease + budget / Cron：可恢復處理
人工decision / CAS projection / record_task_links：正文與任務連結
```

1. 手動每場開始錄音，audio controller不另造meeting session；canonical task ID來自live WBS。
2. Raw與published資料分離，control API每次驗edit權限；provider key／raw資料不進reader、一般RAG或logs。
3. Worker有界、單unit；先持久化attempt及cleanup obligation再dispatch。DB具租約、來源版本及費用transaction；provider仍可能重複收費，不能宣稱外部exactly once。
4. Provider不得保留可回取的會議內容；若採 Gemini，project須核准ZDR，Interactions `store=false`，Files用畢主動delete及crash sweep，清理未確認不能ready。運算暫存與ProJED 7日副本的語意詳見SPEC。
5. 語意／lexical／pointer提供合法候選，pointer不能單獨auto-link；多任務與無對應均可表達。
6. 人工決定可跨rematch／ASR revision保留；唯一CAS保存路徑同步content／links，投影ownership避免重複append或刪人工內容。
7. 刪會議與停止計算不得刪掉外部cleanup或未知usage責任；月額、expiry及版本不能由retry重設。

## Consequences

- 新增的資料責任限capture/source、run、human resolution、projection及cleanup/budget ledger；各有不同生命週期或一致性要求。
- 保留既有manual/synchronous meeting路徑供未使用DEV-123的紀錄，DEV-123使用同saveDraft入口分流；不留同record雙寫。
- Qualification必須實测project/API/cleanup/timestamps，品質必須frozen gold。fake實作、官方能力清單或GitHub人氣都不能代替。
- Schema/API/數值/檔案/QA不在ADR複製；唯一實作權威是[SPEC-123](../specs/SPEC-123-meeting-task-resolution-audio-pointer.md)，測量方法是[QA-DEV-123](../qa/QA-DEV-123-meeting-task-resolution-audio-pointer.md)。

## Tech Lead修訂（2026-09-14）

使用者要求優化開發文件，分類為已選架構的工程契約補齊；已確認產品決策與SPEC-109/110/117、ADR-049相容。
修正單unit/雙claim矛盾、run混入review狀態、provider-only清理表及資格驗證循環；來源分段、manifest完整性、人工保護及原子投影責任由SPEC明確化。控制面以 additive migration 補上 source-version reservation／verification、stop／complete-upload 的 expected source version、signed playback expiry、cleanup identity、`SKIP LOCKED` lease claim、budget reservation／settlement，以及 `complete_meeting_upload_v1` 的鎖定、驗證、唯一 run 與重送冪等；`capture-progress` 只更新 timeline，不再接受 client 偽造 verified audio row。projection transaction 另以 `request_key + payload_hash` 建立同內容 replay no-op／異內容 conflict 的 durable boundary，避免網路重送重複改寫正文與 links。pointer merge 以 clock epoch 為邊界，不合併 pause/resume 前後區間。projection Edge 與 security-definer RPC 同時重驗 private meeting editor；worker 先以 active lease 結算 usage，再收斂 ready；成功投影另受 capture 可執行狀態條件保護，避免取消與晚到結果競態時復活 capture。這些是 durable pipeline invariant，不由 client 猜測。MediaRecorder 輪替目前宣告實測 `overlap_ms=0`，不以 metadata 偽造重疊證據；非零重疊屬後續架構修訂。
預定provider_files表改由private artifact_cleanup統一處理Storage／provider外部物件；projection receipt是避免刪人工內容的必要所有權記錄。
Provider qualification 未通過時，sweeper 對 `kind=provider` obligation 只可留下明確的 `PROVIDER_CLEANUP_ADAPTER_REQUIRED` failed/retryable 狀態；不得略過、標記 deleted 或把未確認的外部檔案當成不存在。這讓 local candidate 的 retention invariant 可被驗證，也保留後續合格 adapter 的接點。
清理 ledger 的 update error 必須讓 maintenance run fail-fast；sweeper 以 `lease_token／lease_expires_at` 做單 row claim，`deleting` row 以 `due_at` 留在下一輪掃描集合，避免 concurrent worker 或 crash 後形成無人負責的 orphan state。
排程 worker 與 purge route 使用分離的 secret header；缺失或不符時在 claim／cleanup 前拒絕，避免把一般使用者的 function invocation 權限當成全域工作授權。
manual retry 不再由 Edge 先 insert run、再另一次 update capture；`retry_meeting_analysis_v1` 以 source run／capture row lock、request-key replay 與 transaction 內 editor recheck，原子完成 run insert 與 capture queue transition。競爭 request key、cancelled 或 expired capture 直接拒絕，避免 orphan queued run。
pointer append 失敗不會被當成空集合：controller 會先保留已封存音訊，再以 partial source completeness 凍結並留下可續傳 recovery；錄音／finalize／control API 失敗會關閉 recorder、observer 與 tracks，清除假 recording 狀態。MediaRecorder 建立／start 失敗時，controller 會停止 server capture 並以 missing source completeness 凍結。progress／stop 的 server update 重套 state predicate，並行 cancel 勝出時不接受晚到寫入；cancelled／expired capture 不簽發 playback URL。reload recovery 若只有本機 finalized audio，因無法重建記憶體中的 pointer batch／完整 manifest，也只能以 partial 凍結並要求重新確認；不得用空 pointer hash 或局部音訊清單宣稱 complete。projection RPC 逐筆重驗 live task、tenant／project ownership、task 類型及 archived 條件，stale、deleted、archived 或 cross-project link 以 `TASK_OUTSIDE_PROJECT` 整筆拒絕；review callback的 `resolutionLinkSet`只標記它實際新增的draft link，reject／clear-all不會誤刪既有人工link。無新的公開產品功能或角色權限擴張，沒有遠端schema變更；local candidate 的補連／改連入口只使用既有WBS任務與editor CAS權限。後續若需改provider保存條件、產品指標或existing authority，回Tech Lead修訂，不由實作模型靜默改規則。

架構狀態維持Accepted／Architecture Confirmed；DEV-123已有local candidate（capture control、分段音訊、pointer evidence、pause/resume、reservation／verification、playback、atomic retry／cancel、review/decision、CAS projection），但Provider Qualification Gate Pending／NOT RELEASED。第六份 migration 讓projection transaction從stored accepted decision補入缺漏的related task link，並在寫入前重驗accepted task仍屬同tenant／project、live task／milestone且未封存；第七份 migration 讓complete-upload在capture lock內重驗manifest timeline與verified segment exact set；第八份 migration 讓projection request key對同內容重送 no-op、異內容重送 conflict；browser callback只作draft即時同步，不能取代server authority。第六至八份 migration 與前五份 control-plane core、完成上傳原子交易已在隔離 PostgreSQL readback；task-owned local Auth／Storage readback亦已通過 synthetic fixture 與 cleanup；含 Edge runtime 的 `verify:dev-123-control-api-local` 亦已完成 Auth、pointer/audio upload／verify、complete replay、playback／cancel 與 service-role raw readback（artifact：`output/qa/dev-123/control-api-local-result.json`）。private schema 的 API exposure 僅服務於 service-role Edge 路徑，private table／RPC grants 仍拒絕 PUBLIC／anon／authenticated。`verify:dev-123-provider-contract` 在 fake mode 產生 `PENDING` 且不做 network dispatch（artifact：`output/qa/dev-123/provider-contract-result.json`），只證明 fail-closed 契約，不代表ZDR或synthetic qualification。local candidate 的固定 `10,000,000` twd_micros 初次預留仍是 Provider Qualification 前的明示技術債，尚不代表正式費用上限。下一步仍是0a唯讀、真實browser/media、hosted authenticated DB／Storage，再以0b synthetic及費用ledger驗證，詳SPEC第9/16節。

### Tech Lead follow-up（2026-09-15）

針對 owner 邊界與來源完整性完成定案：private meeting 由 record creator／recorder 通過 editor check，非 private meeting 保留 project editor check；complete-upload 將 client manifest 綁定 server verified segment 的 epoch／offset／gap／overlap 與 exact set。accepted decision 由 projection transaction 作最後 task-link authority，browser callback 只提供草稿即時反映。此 follow-up 維持 `Architecture Confirmed / Local Candidate Implemented / Provider Qualification Gate Pending / NOT RELEASED`，不把 fake、isolated DB 或 route-mocked evidence 誤標為 provider、完整 DB 或 QA/QC PASS。

補充的生命週期邊界是：stop 凍結 server epoch manifest、最後 pointer sequence 與 source gaps；append/reserve 重新驗證 identity、timeline、digest、payload 上限與冪等衝突；pointer surface 被回收或 pointer cancel/drag 時關閉區間，audio track 中斷或 recorder `stop()` 例外則以 missing source 收斂並完成 server-stop recovery。這讓 pointer 只作同一 capture timeline 的輔助 evidence，不會因 UI 回收、錄音器例外或晚到資料偽造任務關聯。

Recorder UI 只有在 `MediaRecorder.start()` 成功後才進入 recording／resumed 狀態；建立或啟動失敗不更新假狀態，直接沿既有 server-stop 與 missing-source recovery 收斂。這個順序是 lifecycle invariant，並由 B04 start-failure candidate evidence 覆蓋。

候選證據亦沿同一邊界保存：transcript word offsets 與 candidate quote range 隨 review 回傳，UI 明示原句範圍；沒有 quote 的 pointer-only 候選不能被當成可直接採用的文字匹配。

使用思考習慣：#多層次分析、#系統描繪、#限制條件

### Production fail-closed follow-up（2026-09-15）

正式 project 已套用授權範圍的9份migration並部署3個Edge Functions；hosted readiness 6/6、一次性Auth／Storage／control fixture 18/18 PASS且cleanup readback為0。此證據仍由fake worker產生，沒有Provider network dispatch或費用，不能代替ZDR、Files lifecycle及95/90品質。

由於未具資格的production入口會讓使用者建立無法完成真實轉錄的queue，前端activation採顯式build-time gate：production預設`VITE_DEV123_MEETING_TASK_RESOLUTION_ENABLED=false`，local／staging保留測試入口。Gate通過後必須把值改為true、重建不可變artifact並重新走candidate／activation，不能只改後端secret或直接操作資料庫繞過release gate。
