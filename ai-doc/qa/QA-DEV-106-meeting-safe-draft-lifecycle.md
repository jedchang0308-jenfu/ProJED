# QA-DEV-106：會議安全草稿、結束與待整理生命週期驗證計畫

- 關聯 DEV：DEV-106
- 規格：SPEC-106、SPEC-069、SPEC-020
- QA 狀態：`Phase 0 QA PASS (14/14 browser cases) / Phase 1 QA Plan Pending Readiness / NOT RELEASED`
- 驗證日期：2026-09-04
- Spec Impact：本計畫只驗證 Phase 0 local safety slice。DEV-069 的舊 direct-leave／cloud checkpoint PASS 不可換算成 DEV-106 PASS；本次已完成 static、deterministic runtime、rendered browser、回歸與完整 side-effect failure-injection evidence（含 canonical cleanup abort／retry readback、四個 provider adapter checkpoint spy、開新／開舊入口、discard 取消／abort 後焦點復原、provider／正式紀錄／event、record store action／Undo push isolation）。Phase 0 QA gate 已封關，Phase 1 仍待 readiness。

## 1. 驗證結論邊界

Phase 0 要證明的不是「永遠不會遺失任何一個字」，而是：

- 系統不把 IndexedDB request success 冒充 transaction commit。
- app 內一般離開自動保護目前 signature，成功後才離開；失敗則保留畫面與輸入。
- 一般離開不清 recovery；只有明確 discard 會清目前 scope。
- meeting recovery 不產生任何 Supabase、Firestore 或 local-test remote read/write。
- recovery 流程不產生 AI、task-link、undo、document、RAG 或 event side effect。

瀏覽器／OS 在 transaction commit前突然終止仍可能遺失未提交尾段；測試必須量出並誠實記錄 RPO，不得把 session fallback 算成 durable PASS。

使用思考習慣：#可驗證性、#風險評估、#事實與推論分離

## 2. Fixture Boundary

| Fixture | 狀態 | 用途 |
|---|---|---|
| F106-A | 空白 meeting，無 recovery／canonical | 空白直接離開、不建立 snapshot |
| F106-B | 有內容，最新 signature 已 local committed | 安靜離開、重開復原 |
| F106-C | 有內容，debounce尚未觸發 | app內離開立即 force-flush |
| F106-D | IDB request success，transaction complete延遲／abort | commit truth與假成功防治 |
| F106-E | IDB失敗、session成功；兩者皆失敗 | degraded/error與failure dialog |
| F106-F | 已有 canonical baseline後再輸入 | discard保留baseline、canonical success cleanup |
| F106-G | 同scope S1/S2/S3與clear race，可控排程 | latest queue與terminal barrier |
| F106-H | Supabase／Firestore／local-test adapter spies | 0 remote recovery read/write |
| F106-I | AI、task-link、undo、document/version/chunk/embedding、RAG、event spies | 0 side-effect delta |
| F106-J | work_log、DEV-094直接速記、DEV-105預約資料 | regression boundary |

所有 fixture 必須記錄 actor、workspace、board、draftId、scopeKey、signature、writeSequence、route、viewport、provider、source revision與 dirty boundary。

## 3. FMEA

| Failure mode | 根因 | 使用者後果 | 偵測方式 | Gate |
|---|---|---|---|---|
| request success被當成 durable | 未等待transaction complete | UI顯示安全但重開無資料 | delayed complete／abort facade | P0 |
| 舊 completion覆寫新內容 | 同scope平行寫或generation缺失 | 復原到較舊版本 | deterministic S1/S2/S3 schedule | P0 |
| 一般離開仍清 recovery | 舊 guard/store token殘留 | 無意刪除會議 | 全入口storage readback | P0 |
| 自動 flush失敗仍離開 | navigation先於ack | 記憶體內容消失 | IDB fail／timeout injection | P0 |
| discard與in-flight put競速 | clear不是terminal barrier | 捨棄後草稿復活 | controlled clear race | P0 |
| cloud path仍可呼叫 | 舊DEV-069 adapter/hook殘留 | 隱私／衝突／成本風險 | provider network spies | P0 |
| canonical success後舊recovery重複提示 | baseline與cleanup順序錯誤 | 使用者誤判資料版本 | canonical readback + restore | P0 |
| end meeting建立duplicate或partial state | Phase1原子性／冪等未定 | 待整理資料不一致 | Phase1 readiness gate | P1 blocker |

## 4. Harness 要求

- IndexedDB facade可分別控制 request success、transaction complete、abort、error、blocked與open failure。
- queue scheduler可重現 S1寫入中收到S2/S3、舊completion、clear barrier與scope切換。
- browser harness必須從正常產品入口建立meeting，不以direct URL或預造store state替代主要交付路徑。
- provider spy同時記錄method、URL／collection、operation與payload byte count；Phase 0期望remote recovery count為0。
- side-effect spy記錄AI、task links、undo、documents、versions、chunks、embeddings、RAG jobs與event log前後delta；ROT-106-012 另以 record store action／Undo push failure injection 覆蓋未直接暴露為 provider adapter 的入口。
- 每個browser case都記錄visible error、console error、page error、network failure、route、viewport與screenshot path。

## 5. Phase 0 Automated Contract Cases

| ID | Arrange／Act | Expected | Evidence |
|---|---|---|---|
| TC-106-001 | 讀v1 snapshot，再寫v2；request success後延遲transaction complete | v1可讀且不回寫／刪除；DB version/store/session prefix不變；complete前saving，complete後才local_committed | normalized snapshot、event order |
| TC-106-002 | 同scope快速排入S1/S2/S3，控制舊completion與一次abort | single in-flight + latest pending；S2可coalesce；最終只恢復S3；abort不更新成功狀態 | queue trace、storage readback |
| TC-106-003 | IDB fail/session success，再令兩者皆失敗 | 前者session_only、後者error；兩者均不得顯示durable或允許安靜離開 | durability transition |
| TC-106-004 | 逐一由X、離開模式、切view、開新／舊record離開C狀態 | 每條路徑先force-flush目前signature；ack後才navigation；snapshot保留，無implicit clear | action matrix、storage readback |
| TC-106-005 | 在force-flush注入fail與2,000ms timeout | 原navigation不執行、輸入不reset；只顯示重試保護／存草稿後離開／繼續編輯；無discard／直接離開 | UI state、focus、event order |
| TC-106-006 | in-flight put期間執行explicit discard；涵蓋取消、success、IDB delete fail、另一scope存在 | 取消0 delta；success以terminal barrier清目前scope後才離開；fail保留session與畫面；其他scope不變；舊put不復活 | queue trace、storage diff |
| TC-106-007 | canonical save／publish／archive分別success、provider fail、cleanup fail後重新restore | canonical success才更新baseline；provider fail保留輸入/recovery；cleanup fail不否定canonical success，restore忽略相同或較舊snapshot | canonical/readback diff |
| TC-106-008 | 在Supabase、Firestore、local-test fixture執行autosave、restore、close、discard；同時掛side-effect spies | remote recovery read/write count=0；AI/task-link/undo/document/RAG/event delta=0；不出現cloud confirmed訊號 | network與side-effect JSON |

## 6. Rendered Browser／QC Cases

| ID | Viewport／流程 | Expected |
|---|---|---|
| ROT-106-001 | 1440×900；正常入口開會、輸入、等待autosave、點X、重開 | 離開不詢問discard；同draft完整復原；保存訊號與signature一致 |
| ROT-106-002 | 1024×768；尚未debounce即依序測X、離開模式、切view、開新／舊record | 每個入口自動flush後才離開；無重複dialog、遮擋或焦點遺失 |
| ROT-106-003 | 1024×768；explicit discard取消／失敗／成功 | discard獨立且有confirm；鍵盤Esc/Tab/Enter與focus return正確 |
| ROT-106-004 | 390×844；由正常入口嘗試meeting並監看network/errors | 維持meeting-negative；remote recovery request=0；visible/console/page error=0 |
| ROT-106-005／006 | 1024×768；IDB open failure與force-flush timeout | failure dialog只有三個恢復型action；2,000ms timeout不導航、不 reset，輸入與 focus 可保留 |
| ROT-106-007／008 | 1024×768；canonical save success與cleanup abort | canonical成功後清理成功會移除同scope recovery；清理 abort 顯示可重試狀態，正式內容與 recovery 均保留 |
| ROT-106-009 | 1024×768；四個 provider adapter spy | meeting autosave／restore／close／discard 不呼叫 dataBackend、local-test、Firestore 或 Supabase checkpoint |
| ROT-106-010 | 1024×768；explicit discard 取消與 IDB abort，鍵盤／focus | 取消與清理失敗均保留內容；Escape／Enter 可操作，焦點回到會議操作入口；fail-closed 狀態可見 |
| ROT-106-011 | 1024×768；紀錄庫開啟既有紀錄，再由正常入口新增會議紀錄 | 開舊紀錄前先保留原 meeting recovery；關閉後可從正常入口開新 meeting，不誤清 recovery |
| ROT-106-012 | 1024×768；注入 provider checkpoint、正式紀錄 upsert/delete、event log、record store actions 與 Undo push 失敗 | autosave／close／discard 不觸發注入服務；本機 recovery 與 side-effect storage 維持隔離 |

Browser case必須使用真實 `page.reload()` 驗復原；不可只重新mount component或直接讀service結果。

## 7. Regression Boundary

候選固定後至少執行：

- `npm run verify:dev-106-meeting-local-safety`
- `npm run verify:dev-106-meeting-local-safety-browser`
- `npm run verify:dev-069-meeting-draft-recovery`（先將舊direct-leave與cloud checkpoint expected標為歷史，保留local F5／scope／RAG／mobile相容回歸）
- `npm run verify:dev-020-record-workflow-redesign`
- `npm run verify:dev-010-action-feedback`
- DEV-094 meeting direct-note與DEV-105 meeting reservation的現有targeted verifier
- TypeScript、targeted ESLint、production build

QA-069 中「直接離開後清除」的舊 expected 必須改為歷史 baseline，不得要求新候選保留錯誤行為。work_log非meeting guard契約維持不變。

若browser verifier啟動暫時 runtime，須依專案規範記錄project、purpose、port、process tree與cleanup condition；完成後只停止task-owned process tree並確認port釋放。

## 8. Evidence Required

- `output/qa/dev-106-meeting-local-safety/result.json`
- `output/playwright/dev-106-meeting-local-safety/result.json`
- storage event order與S1/S2/S3／clear trace
- provider network count與side-effect delta JSON
- 1440×900、1024×768 positive/failure screenshots
- 390×844 negative screenshot
- source revision、dirty-boundary diff、OS/browser/provider、actor/scope與執行時間
- type/lint/build及所有regression command的raw result摘要

檔案存在本身不算PASS；每筆evidence必須能回指candidate、fixture、case與actual assertion。

## 9. Stop／Exit Criteria

遇到下列任一情況即停止並退回RD／技術主管：

- transaction abort後仍出現local_committed或navigation已發生。
- 任一一般離開入口清除 recovery、出現 `不儲存離開` 或繞過force-flush。
- explicit discard failure後local/session已被清除，或舊put在clear ack後復活。
- 任一 Phase 0 meeting recovery remote read/write count大於0。
- recovery造成任何AI、task-link、undo、document、RAG或event delta。
- 需要remote schema／RLS／rules、待整理UI、結束會議或跨裝置能力才能讓case通過。
- visible error、console/page error、關鍵操作被遮擋或手機meeting-negative退化。

Phase 0 exit：TC-106-001～008與ROT-106-001、ROT-106-001-reload、ROT-106-002～012全部PASS，P0／P1 finding=0，regression全綠，evidence provenance完整；本次已達成。這只代表 Phase 0 QA PASS，不代表 Phase 1 implementation readiness 或正式 release 通過。

## 10. Phase 1 與 Future Verification Capsules

- Phase 1 在SPEC-106列出的canonical原子性／補償、same-ID冪等、legacy mapping、projection與race缺口解除後，才建立可執行case；目前不得把初步方向算成QA Plan Ready。
- Future cloud recovery必須有獨立owner-private authority、雙actor privacy matrix、provider concurrency、migration／rollback與retention evidence；不得復用Phase 0的0-request PASS宣稱功能完成。
- 智慧收尾、心跳、版本與跨裝置另建QA文件，驗證不覆寫原始內容、不自動發布、不silent merge。

## 11. 變更紀錄

- 2026-09-04：建立DEV-106初版QA plan，曾同時涵蓋local durability、provider CAS、cloud recovery、end meeting與待整理。
- 2026-09-04：依RD技術主管審查收斂為Phase 0 local safety executable plan；刪除未必要的cloud CAS／remote-only restore／tombstone cases，改以全provider 0 remote request、自動force-flush、terminal discard與誠實RPO為gate。
- 2026-09-04：完成 Phase 0 QA gate；browser 14/14 PASS，ROT-106-008 驗證 canonical cleanup abort／retry、ROT-106-009 驗證四個 provider adapter checkpoint 0 次呼叫、ROT-106-010 驗證 explicit discard 取消／IDB abort focus、ROT-106-011 驗證紀錄庫開舊／正常入口開新、ROT-106-012 驗證 provider／正式紀錄／event／record store action／Undo push failure isolation；side-effect provenance 封關，Phase 1 readiness與正式 release仍待後續 gate。

## 12. 本次候選執行紀錄

- Static contract：`npm run verify:dev-106-meeting-local-safety` PASS，34/34 assertions；涵蓋 v1/v2 normalize、transaction `oncomplete`、per-scope latest queue、terminal clear barrier、delete-abort 後保留 session、force-flush wiring、紀錄庫／設定／看板切換守門、meeting cloud checkpoint kill switch 與 recovery hook 無正式／side-effect service import。artifact：`output/qa/dev-106-meeting-local-safety/result.json`。
- Browser candidate：`npm run verify:dev-106-meeting-local-safety-browser` PASS，14/14 cases；包含 runtime harness（transaction acknowledgement、S1/S2/S3 coalesce、clear barrier、IDB open failure、save/delete abort、session fallback、兩端失敗）、ROT-106-001 快速關閉、ROT-106-001-reload 真實 F5 復原、ROT-106-005 failure dialog、ROT-106-006 2,000ms force-flush timeout、ROT-106-002 1024px 紀錄庫／設定／系統頁返回、ROT-106-011 開舊／開新入口、ROT-106-007 canonical cleanup、ROT-106-008 canonical cleanup abort／retry readback、ROT-106-009 四個 provider adapter checkpoint spy、ROT-106-012 provider／正式紀錄／event／record store action／Undo push failure injection isolation、ROT-106-010 discard 取消／abort focus、ROT-106-003 explicit discard、ROT-106-004 390px negative。artifact：`output/playwright/dev-106-meeting-local-safety/result.json`；diagnostics、HTTP failures、remote recovery requests 均為 0，side-effect storage delta 為空。
- Regression：DEV-069 static/browser、DEV-010、DEV-020 static/browser、DEV-094 static/pure/browser、DEV-105 static/browser 均 PASS；DEV-020 browser verifier 已改為驗證個人紀錄功能的明確 unavailable contract，並保留 meeting workflow／exit assertions。
- Build gate：`npx tsc --noEmit`、`npm run lint`（0 errors，既有 warnings）、`npm run build:test`、`git diff --check` PASS。
- Gate disposition：TC／ROT 已完成 Phase 0 需求覆蓋；ROT-106-011 補足紀錄庫開舊／正常入口開新，ROT-106-010 補足 discard failure focus／keyboard，ROT-106-008 補足 cleanup retry readback，ROT-106-012 補足 provider／正式紀錄／event／store action／Undo push failure isolation。Phase 0 QA PASS；Phase 1 readiness與正式 release 仍維持獨立 gate。
