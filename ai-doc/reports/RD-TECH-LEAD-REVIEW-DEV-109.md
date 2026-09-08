# RD 技術主管審查：DEV-109 會議期間看板變更即時記錄與 AI 整理修復

- 日期：2026-09-08
- 審查對象：DEV-109、SPEC-109、QA-DEV-109、SPEC-007／011／012／020／069／106 amendments、現行 WBS／record／synthesis／recovery 路徑
- 結論：`有條件通過 / Conditions Incorporated / RD Implementation Ready at review time`
- 風險：Medium
- 審查執行邊界：本次技術主管審查只優化開發文件；後續候選實作與驗證狀態以 `DEV-109`、`SPEC-109`、`QA-DEV-109` 為準。

## 結論與最短因果鏈

DEV-109 應修的是「已成功保存的會中任務變更沒有立即成為可見會議內容」，不是替 `AI整理` 增加歷史查詢。
現行 AI 只整理目前草稿與 session activities、不查 provider history，這個邊界正確；缺口在變更來源不完整、記錄時點早於
persistence truth，且 evidence 只停在 memory buffer。文件已收斂為一條最小資料流：

`會議開始建立 segment → mutation 前建立暫態 ticket → persistence ack／canonical readback 成功`
`→ volatile aggregate 計算 segment baseline→latest → 唯一持久化 projection 寫入 draft.content`
`→ AI 只重整目前 content；失敗則原稿不變`。

最短根因鏈：

`內容欄位事件缺漏 + activity 在保存確認前寫入 + meetingActivities 不投影 draft.content`
→ 成功修改後 editor 仍可能空白
→ AI quality gate fail closed 只能保留空稿
→ 將捕捉接到 persistence-confirmed 邊界並直接投影既有 `draft.content`
→ AI 成敗不再決定變更證據是否存在。

## 五項關鍵發現與文件修正

### F1 — 根因是 persistence-to-draft 鏈斷裂，不是 AI 缺少歷史資料

- 證據：現行 `useWbsStore` 的部分 activity 在 persistence terminal success 前建立；`recordMeetingTaskActivity`
  只追加 `meetingActivities`，沒有更新 `draft.content`。`synthesizeMeetingDraft` 不查 provider history 是既有正確邊界。
- 風險：若以「AI 匯入過去專案變更」修正，會把會前／會外資料混入目前會議，並與 DEV-020／094 的明確匯入重疊。
- 修正：SPEC-109 將 capture truth 固定在 provider ack 或 canonical readback；同 mutation 不再雙寫 record store legacy
  `meetingActivities`，但 provider audit log 保持獨立。`AI整理` 的 network history／import call count 必須為 0。
- 判定：通過；方案已切斷最短因果鏈，沒有以歷史補抓掩蓋 live capture 缺陷。

使用思考習慣：#問對問題、#反事實思考、#可驗證性

### F2 — 原方案建立四份狀態，超過問題所需

- 原缺口：`draft.content`、DEV-109 aggregate activity、recovery nested live state、Edge live-only event 會同時描述同一變更；
  任一 reconcile 漏接就形成 silent drift。
- 修正：唯一可持久化 live evidence 收斂為既有 `draft.content`；DEV-109 不另寫 `meetingActivities`、不新增 Edge event、
  不擴張 recovery schema／signature。aggregate、anchor、dedupe 與 segment 只存在目前分頁 runtime。
- F5／crash：DEV-106 本來就 round-trip `draft.content`，因此只恢復已可見文字並建立新 segment，不續接 reload 前 volatile state。
- 判定：修正後通過；system of record 未增加，`useMeetingDraftRecovery` 與 recovery service 預期 0 產品修改。

使用思考習慣：#限制條件、#系統描繪、#奧卡姆剃刀

### F3 — 精確 net diff 必須承認一份暫態全文 baseline

- 原矛盾：若只保存 bounded fragments／hash，又要求 A→B→C 精確重算為 A→C，通用文字差異無法只靠截斷片段可靠組合。
- 修正：description／note 的完整純文字 baseline 與目前 ticket afterText 可存在目前 tab volatile memory；每次 confirmed commit
  直接重算 baseline→latest，再只把 bounded fragments＋SHA-256 放入 aggregate／projection。
- 隱私邊界：全文不得進 Zustand 可序列化 state、draft metadata、recovery、provider payload、activity、log 或 telemetry；
  terminal、segment close、draft switch、reload、logout 後引用必須釋放。
- 判定：修正後通過；移除 custom symbolic／Myers composition 契約，差異演算法保持 pure、deterministic 且可替換。

使用思考習慣：#限制條件、#反直覺、#可驗證性

### F4 — AI 整理需處理 projection 與 synthesis trace 的一致性

- 風險：AI 成功後若只改 `draft.content`，後續系統 replace／remove live line 卻未同步
  `meetingSynthesis.sourceContent`／`outputContent`，下一次整理可能把舊 AI output 誤當新人類內容，造成重複或回流。
- 修正：每條 active system line 在 merged result 必須 exact-once；有效 trace 與 projection 同 transaction rebase。
  人工編輯導致無法唯一 reconcile 時，保留正文、清除 stale trace並 detach，禁止猜配或覆寫人工內容。
- 失敗邊界：quality、provider、timeout、merge、anchor 任一失敗，content、metadata、taskLinks 與 runtime projection 狀態全部不變。
- 判定：有條件通過；條件已寫入 SPEC／QA，但必須由 repeat-AI、AI 後再修改與 ambiguity failure injection 證明。

使用思考習慣：#系統描繪、#反事實思考、#可驗證性

### F5 — 最大實作風險在保存重試與 segment concurrency

- 風險：TaskDetails retry 現有 `skipActivity`、provider timeout/readback、out-of-order completion 與 close-in-flight 可能造成漏記、
  重複、latest 倒退或跨 segment 污染。
- 修正：mutation 首次 dispatch 建立 stable ticket；ack/readback/retry 共用同 `mutationId`、segment 與原 before。
  只有 terminal success commit，closed／wrong draft／wrong board 的 late completion 一律丟棄。
- 驗證：QA-DEV-109 固定 normal UI persistence path、readback match/mismatch、retry、雙 callback、batch partial failure、
  close-in-flight、reload-new-segment 與 network-zero-history；mock-only、source scan 或截圖不得單獨作 PASS。
- 判定：有條件通過；施工順序維持 Pure contract → Persistence truth → Projection/lifecycle → AI preserve → Candidate verification。

使用思考習慣：#優先排序、#系統描繪、#可驗證性、#當責

## 最小架構與責任邊界

```text
useWbsStore / TaskDetailsModal
  暫態 ticket + persistence-confirmed commit
                  ↓
meetingLiveTaskChanges（pure）
  normalization / hash / bounded diff / aggregate / reconcile
                  ↓
useRecordStore
  volatile segment runtime ──投影──> draft.content（唯一持久化 live evidence）
                                      ↓
meetingRecordSynthesis / Edge
  只整理目前 raw content；0 history/import；失敗 preserve
```

- 預期新增：一個 pure domain utility、集中 runtime 型別、兩個 verifier。
- 預期小幅修改：WBS persistence 接線、TaskDetails stable retry identity、record store lifecycle／projection、synthesis preserve。
- 預期不改：database／RLS／provider schema、DEV-106 recovery schema與 IDB、historical import contract、mobile unavailable boundary。
- 受控技術債：純文字 projection 以 `lineIndex + exactText + fingerprint + generation` 定位；人工修改或多候選時 fail closed／detach。
  未來只有 editor 提供 stable structured node 時才另案遷移。

## 最終 Gate

- 文件阻擋項目：無。原多重 truth、recovery 擴張、diff composition 與 AI trace 缺口已修正並同步到 SPEC／QA／cross-spec amendment。
- RD 可依 WP-109-A→E 開工；A 的 privacy/diff vectors、B 的 persistence truth、D 的 preserve/exact-once 未通過前，不得進下一交付 gate。
- 本結論只代表文件在審查當時已達可實作門檻；後續候選實作不改變本審查的歷史判定，完整 QA/QC、release 與 production fixed 狀態仍以 `DEV-109` 的現行權威文件為準。

使用思考習慣：#問對問題、#多層次分析、#系統描繪、#可驗證性
