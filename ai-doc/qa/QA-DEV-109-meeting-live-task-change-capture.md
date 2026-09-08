# QA-DEV-109 會議期間看板變更即時記錄與 AI 整理修復驗證計畫

- 狀態：`QA Plan Ready / Candidate Smoke Evidence Captured / Full Execution Pending / NOT RELEASED`
- 日期：2026-09-08
- 對應：DEV-109、SPEC-109
- 風險：Medium
- Evidence rule：deterministic 行為、真實 task persistence、真實 browser 主流程、失敗注入、TypeScript、build 與 targeted
  regression 必須同時通過；source scan、mock-only 或畫面截圖不能單獨作 PASS。

## 0. Candidate implementation evidence（非 QA PASS）

- `npm run verify:dev-109-meeting-live-task-change-capture`：PASS（normalization、SHA-256、allowlist、純 placement 零捕捉、
  baseline/latest、net no-op、bounded fragment）。
- `npx tsc --noEmit`：PASS。
- targeted ESLint（DEV-109 新增／修改 TypeScript）：0 error；3 個既有 `useWbsStore.ts` unused-vars warning，未新增 error。
- `npm run build:test`：PASS。
- localhost browser smoke：開啟會議 → 任務說明保存 → 右側 editor 即時出現單一 `會中變更` 行 → 清除並保存後淨值行移除；
  測試任務已還原。此案例只代表 candidate smoke，不取代本文件第 4～7 節的完整 QA／QC、failure injection 與相依回歸。
- 可重跑腳本：`npm run verify:dev-109-meeting-live-task-change-capture-browser`；artifact：
  `output/playwright/dev-109-meeting-live-task-change-capture/result.json`，B01～B04 為 PASS、console errors=0、HTTP failures=0。

## 1. QA 目標與範圍

驗證 live meeting capture 的時間邊界、save-level truth、資料最小化、同欄位 net aggregation、可見 editor projection、
離開／重入、local recovery、AI-only-reorganize、人工內容保護與 idempotency。

不驗證：歷史匯入新能力、永久 audit archive、provider schema／migration、跨裝置 recovery、多人即時合併、手機 meeting
開放、AI 自動改任務、production deployment 或正式資料修補。

## 2. 固定 fixture 與正常入口

### 2.1 Fixture

- Workspace／board：local-test owner，具 task／record edit；另備 viewer fixture 驗證無權保存即零 capture。
- Draft M1：新 live meeting，content 空白；Draft M2：含人工速記、DEV-108 quick note 與 DEV-094 protected import。
- Task A（L1）：title=`API 權限`、status=`todo`、description=`確認範圍`、default note 相同、其他 note N1=`備註／舊內容`、
  assignee A、collaborator B、tag T1、dates 皆固定、未封存。
- Task B（L2）／Task C（L3+）：用於跨階層、task link 與 batch cases；capture 規則不得因層級不同。
- 每個 mutation 使用固定 mutationId、dispatch／confirm sequence 與 expected SHA-256 golden value；不得依測試執行時間推算。
- 內容向量包含：空白、CRLF、NBSP、emoji、中文標點、長英文 token、rich note、整段替換與超過 fragment 上限的長文。

### 2.2 主流程入口

- URL：local QA primary runtime `http://localhost:4000/`；先依專案固定 `dev:local` lifecycle 檢查／啟動，不占用未知 runtime。
- 入口：登入 → 選 workspace／board → 既有「會議紀錄」入口開始 meeting → 從看板／任務明細執行真實保存。
- 禁止用 `useRecordStore.setState`、直接修改 fixture content 或直接呼叫 aggregate reducer代替 B01～B09 的 delivery path。
- Desktop 1440×900、laptop 1024×768 為 positive；390×844 只驗證既有 unavailable negative boundary。

## 3. Deterministic／static gate

新增並執行 `npm run verify:dev-109-meeting-live-task-change-capture`，至少覆蓋：

1. 每次正常 start 產生新 segment；相同 draft re-entry id 不同、舊 content 相同；F5／crash recovery 保留 content 但不得沿用原 active segment。
2. allowlist field mapping 完整；`parentId/order/kanbanStageId`、純 drag／sort、未變更 patch、逐鍵輸入為零 ticket。
3. title 完整 before／after；description fallback 與 default detail note 不雙算；其他 notes 依 note id 比較，reorder no-op。
4. normalization golden vectors、SHA-256 golden values、deterministic diff vectors、120-code-point／3-fragment bounds 與 truncation flag；不限定內部 diff 演算法。
5. description／note 全文 baseline／latest 只允許存在目前分頁的 volatile runtime；draft、metadata、recovery、provider payload、console、error 與 telemetry 均不得序列化或洩漏全文，segment close／reload／logout 後記憶體引用歸零。
6. 每次 confirmed commit 由 segment baseline 與 latest 重新計算 A→C；A→B→A 以 hash equality 清除；aggregate／projection 不保存完整舊稿。
7. scalar/list canonicalization：id 去重排序、display name 變動不算 canonical change、dates／archive reverse net no-op。
8. mutationId dedupe；provider ack + late readback、雙 callback、retry 同 id 只能 commit 一次。
9. confirmed commit sequence 可處理 out-of-order completion；closed／wrong draft／wrong board 的 late commit 被丟棄。
10. persistence reject／unknown 不投影；readback match 才 commit；retry 沿用原 segment、mutationId、baseline。
11. add、update、batch、forest、dependency schedule 與含 allowlist delta 的複合 placement 路徑，都只有在對應 persistence success／finalize 後 commit；純 placement／drag 為 0 ticket。
12. projection insert／replace／remove、lineIndex exact、唯一 exact relocation；零／多候選 detach 且正文 byte-preserve。
13. task mention 與 taskLinks 同步；net no-op 不刪除仍被 manual／quick-note／import／其他 aggregate 使用的 link。
14. DEV-109 confirmed capture 只更新 `draft.content`，不新增 `meetingActivities`；legacy activity 仍照既有流程相容，且不得與 active system line 表示同一次 mutation。
15. 既有 recovery v1／v2 snapshot、signature、IDB version／store／scope／TTL 不變；content 可 round-trip，snapshot 不得新增 `meetingLiveCapture` 或等效 volatile-state 欄位。
16. reload 後 volatile aggregate、anchor、dedupe、ticket 與全文 baseline 皆為空，既有 recovery signature 不因這些 runtime 值變化；remote checkpoint call count 維持 0。
17. synthesis input 不呼叫 project-change query/import；目前 raw content 是 DEV-109 唯一 live source，每條 active system line 在 merged result 中恰好一次，human-owned line 保留。
18. AI success、重複 AI、AI 後同欄再改、人工修改 AI output 的 source baseline與 net latest 正確；成功時 `meetingSynthesis.sourceContent`／`outputContent` 一併 rebase，無法唯一 reconcile 時保留正文並清除 stale trace。
19. quality/contract/provider/timeout/merge/anchor failure 時 draft content、metadata、links、aggregate、projection byte-for-byte 相同。
20. 不新增 live-only event type，也不以 `PROJECT_CHANGE` 代表 live capture；DEV-094 cutoff／metadata／provider query golden result不變。

Static verifier 必須產出逐案例 expected／actual JSON；只檢查檔名、字串或 function existence 不算行為 PASS。

## 4. Browser scenarios

### B01 保存成功後立即可見

1. 1440×900 正常開始 M1，不操作 `匯入專案變化`。
2. 從 Task A 明細把名稱 `API 權限` 改成 `API 權限整理` 並完成保存。
3. provider/local-test readback 證明保存後，右側 editor 在不按 AI 的情況出現一行：
   `會中變更｜@[API 權限整理](task:...)：名稱「API 權限」→「API 權限整理」`。
4. 斷言只有一行、task link 一筆、沒有 toast／卡片／事件計數；保存完成前不得提前出現。

### B02 完整 allowlist 與跨層級

- 依序在 L1／L2／L3+ 修改任務說明、其他備註、狀態、日期、主責、協作、標籤、封存／還原並建立新任務。
- 每個 confirmed mutation 產生正確 task／field line；description/default note 不雙份，rich note 顯示 plain-text changed fragment。
- note reorder、card drag、同欄無值變化、取消編輯與 IME 未提交不改 editor。

### B03 同欄 net aggregation

1. 同一 segment 將 title A→B→C；每次等保存完成。
2. editor 始終只有一條 A→latest；B 不以獨立 line 殘留。
3. 再 C→A；系統 line 消失，且不得產生 DEV-109 `meetingActivities`。若無其他 mention，task link 消失；人工 mention 存在時 link 保留。
4. 對 description／note 重複相同流程，檢查 bounded fragments 與 hash no-op，不得在 DOM／recovery evidence 出現完整舊稿。

### B04 Persistence failure／readback／retry

- 注入 provider reject：任務既有錯誤呈現保留，meeting editor 不新增 line。
- 注入 completion timeout + readback match：恰好一行；原 completion 晚到不增加第二行。
- 注入 timeout + readback mismatch／unavailable：不顯示假成功；點既有重試後成功，仍用第一次 before 與同 mutation identity。
- 在 retry 前關閉 meeting：晚到成功不得寫入 closed 或下一 segment。

### B05 離開、會外變更與重入

1. M2 live segment S1 完成 Task A status 變更並看到 line；依 DEV-106 正常離開。
2. 非 meeting mode 修改 Task A title 並保存，確認 M2 沒新增／改寫內容。
3. 重開相同 M2，確認既有內容存在且建立 S2；再改 title，S2 before 以重開後當下值為準。
4. S1 與 S2 內容互不覆寫；AI 不補抓步驟 2 的會外修改。

### B06 F5 recovery

- Active segment 完成兩個欄位後等待 IndexedDB transaction complete，再 reload／選擇 local recovery。
- 確認已投影的正文與 task links 依既有 DEV-106 round-trip 恢復；reload 前 segment、aggregate、anchor、dedupe、ticket 與全文 baseline 均不恢復。
- `restoreMeetingDraftSnapshot` 恢復既有 live meeting mode 時立即建立新 segment；第一個新 mutation 的 before 取自 reload 後當下任務值，不延續 reload 前 baseline，也不重複既有正文。
- 以 legacy v1／v2 snapshot 恢復：既有正文／legacy activities 依原契約保留，並以新的 runtime segment 接續使用者後續操作；不得出現新 live-state schema、history query 或 silent whole-draft reset。

### B07 AI 只整理目前內容

1. 會議開始前先完成 Task B 修改；開始後完成 Task A 修改，且完全不點歷史匯入。
2. network／service spy 歸零 project-change query 與 import action；執行 `AI整理`。
3. output 可包含 Task A 本次 evidence，不得出現 Task B 會前內容或 provider 靜態 description／notes。
4. 再執行一次 AI，只有一份 `1／2／3` 主結構，Task A 中間值不回流；每條 active system line、task mention／link 均恰好一次。
5. AI 成功後同欄再改並再次整理，最終使用 segment baseline→latest，不把前一次 AI output 當新人類來源。

### B08 AI degraded／preserve

- 對 M2 分別注入 `QUALITY_GATE_FAILED`、timeout、contract mismatch、provider error、human merge violation、projection
  anchor ambiguity。
- 每次執行前後保存 content／metadata／taskLinks 與 runtime aggregate／projection signature；必須完全相同。
- 人工速記、DEV-108 quick note、DEV-094 protected evidence 與 live line 都存在；錯誤靠近 editor、可重試、不出現成功狀態。

### B09 人工修改 projection

1. 使用者直接修改一條 system live line，或整列刪除。
2. 下一次同 task／field 保存時，已修改的文字 byte-for-byte 保留；系統另開 projection generation，不覆寫舊文字。
3. 建立兩個相同 exact candidate，確認 fail closed／detach；不得猜配另一行。
4. Undo／redo 人工內容仍走既有 editor 行為，capture reducer 不把文字操作當 task mutation。

### B10 UI、accessibility 與 viewport

| Viewport | Gate |
|---|---|
| 1440×900 | 看板與 record sidebar 並列，長 line 自然換行；無新增卡片、計數、第二 editor 或水平 overflow。 |
| 1024×768 | 任務明細保存、sidebar editor、錯誤重試皆可操作；無遮擋、按鈕擠壓或雙重 scroll regression。 |
| 390×844 | meeting 入口／composer 維持既有 unavailable；不得因 DEV-109 偷開 live capture。 |

鍵盤必測：Tab 與既有視覺順序一致、task save 後 focus 不被 record editor 搶走、AI error retry 可達、200% zoom
仍可讀。顏色不是唯一狀態訊號。檢查 console errors、page errors、failed requests、unhandled rejection 與 horizontal overflow。

## 5. Regression gate

候選最低命令矩陣：

```text
npm run verify:dev-109-meeting-live-task-change-capture
npm run verify:dev-109-meeting-live-task-change-capture-browser
npm run verify:dev-007-meeting-activity
npm run verify:dev-011-ai-meeting-synthesis
npm run verify:dev-012-meeting-record-quality
npm run verify:dev-020-record-workflow-redesign
npm run verify:dev-021-project-change-ai-preserve
npm run verify:dev-022-project-change-single-record
npm run verify:dev-024-ai-synthesis-preserve-human-draft
npm run verify:dev-066-task-note-rich-text
npm run verify:dev-094-meeting-direct-note
npm run verify:dev-106-meeting-local-safety
npm run verify:dev-108-task-meeting-note-persistent-list
npx tsc --noEmit
npm run build:test
git diff --check
```

另執行 DEV-024、094、106、108 的 browser targeted verifier。Targeted ESLint 至少涵蓋 DEV-109 新增／修改 TS／TSX
與 Edge Function；若既有 repo-wide lint 有 baseline issue，必須分開記錄，不得以 baseline 掩蓋 DEV-109 新錯誤。

## 6. Failure injection matrix

| ID | Injection | Expected evidence |
|---|---|---|
| F109-01 | node create reject | 0 meeting line／activity；task save error 可見 |
| F109-02 | update reject | ticket 未 commit；原 before 保留供 retry |
| F109-03 | completion timeout + readback match | exactly-once commit；late completion no-op |
| F109-04 | readback unavailable | 0 假成功；retry context 可用 |
| F109-05 | dependency batch partial/reject | 只 commit confirmed group；failed group 0 line |
| F109-06 | SHA-256／diff reject | task 已保存不回滾；capture error 可重試，無全文洩漏 |
| F109-07 | line anchor zero／multi match | content preserve；projection detached |
| F109-08 | IDB transaction abort | memory content 保留；DEV-106 degraded/error；不標 durable |
| F109-09 | reload／legacy snapshot recovery | visible content 恢復、volatile live state 為空、新 start 建立新 segment、0 history query |
| F109-10 | close while persistence in-flight | late commit dropped；next segment 不污染 |
| F109-11 | AI quality/provider/merge reject | all preserved signatures identical |
| F109-12 | duplicate mutationId/retry | one aggregate、one line、0 DEV-109 meeting activity |

## 7. Evidence package

- Static JSON：`output/playwright/dev-109-meeting-live-task-change-capture/static-result.json`
- Browser JSON：`output/playwright/dev-109-meeting-live-task-change-capture/result.json`
- 截圖：B01 immediate、B03 net-no-op、B05 re-entry、B08 degraded、1024 long-line、390 negative 各至少一張。
- Network evidence：每次 AI 整理的 request list 與 `project-change query/import count = 0`；不得只靠 source scan。
- Persistence evidence：mutationId、segmentId、dispatch/confirm sequence、provider ack/readback、aggregate key、rendered line count。
- Privacy evidence：記錄 volatile ticket／baseline 在 terminal／close／reload 後引用歸零；列出 draft、metadata、recovery、provider payload、log／telemetry 的序列化 keys、fragment lengths 與 hash。fixture 完整舊稿不得出現在任何持久化 artifact、console、error 或 network payload。
- Browser evidence 每案保存 role、fixture ids、route、viewport、expected／actual、console/page errors、failed requests、overflow
  metric、screenshot path 與 source revision。
- QA 執行後建立 `ai-doc/qc/QC-DEV-109-meeting-live-task-change-capture.md`；未執行不得預填 PASS。

## 8. Pass／Fail gate

全部 P0/P1、failure injection、targeted regression、type/lint/build 與 browser evidence 通過，才可標本機 `QA-QC PASS`。

任一情況直接 Fail：保存前出現內容、保存失敗仍記錄、同 mutation 重複、完整舊稿被序列化／留在 terminal 後 runtime／進 recovery artifact、同欄中間值
殘留、會外／會前變更被補抓、AI 發出歷史查詢、AI 失敗清空或改稿、人工 projection 被覆寫、late completion 跨 segment、
reload 沿用舊 segment、recovery silent reset、task link 誤刪、手機意外開放、可見 runtime error、水平 overflow 或未能由正常 UI 路徑重現。

本 QA 計畫完成不代表已執行，也不代表 production ready。Commit、push、deploy 與正式 smoke 必須另走 release gate。

使用思考習慣：#問對問題、#系統描繪、#可驗證性、#當責
