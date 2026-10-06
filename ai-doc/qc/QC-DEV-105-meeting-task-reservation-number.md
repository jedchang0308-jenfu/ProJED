# QC-DEV-105：會議任務討論時間預約數字事實驗證

- 日期：2026-09-04
- 狀態：`Local QC PASS / Evidence Verified / 未 Deploy / 未 Release`
- 對應規格：`ai-doc/specs/SPEC-105-meeting-task-reservation-number.md`
- 對應 QA：`ai-doc/qa/QA-DEV-105-meeting-task-reservation-number.md`
- RD 審查：`ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-105.md`
- Evidence root：`output/qa/dev-105/`、`output/playwright/dev-105/`、`output/playwright/dev-070/after/`

## 1. QC 結論

以 current working tree 的 source、deterministic result、實際 browser result 與三張 viewport screenshots 交叉核對，DEV-105 local implementation 判定 QC PASS。主持人限定、右鍵同選單 inline 數字輸入、L1／L2／L3+共用顯示、canonical tracking projection與非會議／非主持人 negative boundary均有直接證據；未把本機測試外推為 provider 欄位級安全或 release 核准。

## 2. Fresh fact 核對

| 核對項目 | 直接證據 | 判定 |
|---|---|---|
| Pure metadata與格式 | `output/qa/dev-105/result.json`：TC-105-01～10 10/10，含 ASCII `1..999`、empty clear、unknown schema、stable signature、Guard與surface contract | PASS |
| Host右鍵寫入 | `output/playwright/dev-105/result.json`：ROT-105-01，1440×900真實右鍵與Enter；L1=`5`、L2=`15`、L3=`999` | PASS |
| Tracking canonical identity | 同一 browser artifact 的 tracking L2=`15`，與primary共用值；source由canonical task ID lookup | PASS |
| Layout／顯眼度 | `desktop-board-hierarchy.png`與`tablet-long-title.png`；date後才出現整合 token，L2為`title → date → number → toggle`，1024px overflow=false | PASS |
| Empty與copy | browser result empty task mark為`[]`；有值時各 mark 都是無框亮黃色底黑字、僅顯示數字的單一 token，且可見字串僅`5`／`15`／`999`，無圖示、`[]`、「分」、placeholder或人員明細 | PASS |
| Invalid／取消 | ROT-105-04：錯誤為`請輸入 1–999 的整數`、focus與menu保留；Escape／outside／scroll後值仍為`15` | PASS |
| Non-host與mobile negative | ROT-105-03：member actionCount=0但可讀既有mark；ROT-105-05：390px meeting entry／workflow／editor／mark皆不存在 | PASS |
| Regression／build | DEV-002 16/16、DEV-007 5/5、DEV-028 48/48、DEV-029 42/42、DEV-069 PASS、DEV-070 58/58、DEV-095 4/4；TypeScript、test build、diff check皆PASS | PASS |

## 3. 技術邊界與反向檢查

- `task.edit-meeting-reservation`以`defaultMenu=false`及單一 `MEETING_TASK_MENU_PROFILE` opt-in；非 Board surface、Task Details與非 meeting 沒有 action或mark。
- `GlobalContextMenu`只在當下 Board task snapshot疊加 action；Guard與`useRecordStore` commit時再次檢查 meeting、`recordedBy`、task存在／封存／board與value，避免 stale menu直接寫入。
- reservation只在 `metadata.meetingTaskReservations` namespace；不修改 `TaskNode`、不新增provider schema／migration／activity，signature使用normalized canonical task projection。
- L3+由`KanbanChecklist`注入共用`TaskChecklistTree` adapter；Task Details不注入，避免共用tree洩漏功能。
- DEV-007／DEV-029驗證器曾對目前共用 renderer／controller 邊界持有過時字串要求；本輪只同步 verifier contract，未以死碼或弱化 assertion讓產品通過。DEV-070則重新產出完整 after interaction matrix後再判定58/58。

## 4. Evidence inventory

- [Deterministic result]：`output/qa/dev-105/result.json`
- [Rendered result]：`output/playwright/dev-105/result.json`
- [QC readback result]：`output/qc/dev-105/result.json`
- [Desktop screenshot]：`output/playwright/dev-105/desktop-board-hierarchy.png`
- [Tablet screenshot]：`output/playwright/dev-105/tablet-long-title.png`
- [Mobile negative screenshot]：`output/playwright/dev-105/mobile-meeting-negative.png`
- [Interaction matrix]：`output/playwright/dev-070/after/interaction-matrix.json`

## 5. 未覆蓋與禁止外推

- 未執行正式 Supabase／Firestore L3 provider mutation、兩使用者 server readback、RLS／Firestore 欄位級 ACL、Realtime、跨裝置或跨 tab exactly-once。
- provider 現行為 record-level write policy；官方產品路徑的 host-only 由 action visibility、execution Guard與store recheck提供，不能宣稱惡意 client無法修改欄位。
- 未執行 deploy、production mutation、migration、rollback或release；`releaseStatus`維持 `NOT READY`／`Release Not Requested`。

## 6. QC 判定

DEV-105 已達 local implementation、QA與QC handoff條件：WP-105-A～E、TC-105-01～10、ROT-105-01～05與既有 targeted regressions均有可追溯證據，沒有本地P0／P1 open finding。正式 provider security、deploy與release仍須另走對應 gate，不由本文件解除。

使用思考習慣：#問對問題、#多層次分析、#可驗證性
