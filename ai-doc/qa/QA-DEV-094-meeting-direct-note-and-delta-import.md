# QA-DEV-094：免匯入直接會議速記與增量帶入驗證計畫

- 關聯 DEV：DEV-094、DEV-020、DEV-023、DEV-069、DEV-092
- Authoritative spec：`SPEC-020` 2026-08-28 免匯入直接速記 addendum
- 風險：Medium；使用者可見主流程、鍵盤焦點、跨會議 cutoff metadata 與 activity query boundary
- QA 狀態：`QA Plan Ready / implementation smoke PASS / NOT RUN`
- QC 狀態：`NOT RUN`
- Release：`未 Release`

## 1. 驗證目標與通過標準

DEV-094 的核心交付不是「匯入按鈕換文案」，而是證明匯入不再是會議編輯 gate，且一鍵帶入的週會 cutoff 不會因存草稿、失敗、撤銷或未匯入發布而誤推進。

通過必須同時證明：

- 正常新建 meeting draft 後，不點匯入即可直接輸入、存草稿、重開、AI整理與發布。
- `速記` 只聚焦 editor，沒有 record write、status change 或隱含 save。
- meeting 預設匯入是 `帶入上次會議後變更` one-click；work-log 舊設定／preview 流程不受影響。
- default window 精確為上次合格 published cutoff exclusive 到 click inclusive；首次使用為 meeting occurredAt 往前七天。
- 同 draft 只加入 event-ID delta；成功 commit 是 content 與 metadata 原子更新，失敗／empty／stale response 是 no-commit。
- 只有含 active successful batch 的 publish success 才讓 cutoff 生效；draft save、checkpoint、F5、undo、publish failure、record undo 與 archive 不得誤算。
- custom gap／rollback 依使用者決定直接執行，不顯示 warning／confirmation；成功可見資訊只有 `已完成`。
- 1440×900 實際 meeting UI 可操作；390×844 依 SPEC-069 做 meeting 不存在的負向驗證。

## 2. Test harness 與 fixture contract

### 2.1 Deterministic pure fixtures

future static/pure verifier 必須可注入 `now`，且至少建立：

- board `board-A`、meeting draft `meeting-current`，`occurredAt = 2026-08-28T14:05:00+08:00`。
- published eligible records：
  - `meeting-old`：較舊 `updatedAt`、cutoff `T0`。
  - `meeting-last`：較新 `updatedAt`、cutoff `T1`。
  - draft／published-no-import／archived／wrong-board／invalid-schema records；全部不得被選中。
- activity events：
  - `E-start` at `T1`，必須因 exclusive start 排除。
  - `E-1`、`E-2` in `(T1, Tclick)`。
  - `E-end` at `Tclick`，必須因 inclusive end 納入。
  - `E-after` after `Tclick`，必須排除。
  - duplicate `E-1` response 與 missing-ID event，用來驗證 provider invariant。
- custom range：連續、開始晚於舊 cutoff 的 gap、結束早於舊 cutoff 的 rollback、today clamp、future、start > end。
- metadata：valid v1、unknown schema、wrong board、NaN／Infinity timestamp、duplicate／empty event IDs、missing batch。

### 2.2 Browser delivery fixture

- primary browser backend：`local-test`，使用 deterministic local records 與 activity events；fixture 不得含真實會議內容或帳號資料。
- normal delivery path：建立／修改任務產生 event → 新建 meeting → one-click → protected block + metadata → 存草稿／reload → 發布 → 新建下一筆 meeting → 驗證 baseline。
- 網路／service seam 必須記錄：record list read、activity query boundaries、AI synthesis call、record upsert count、request token 與錯誤注入。
- focus evidence 使用 `document.activeElement`、Lexical editor root 與 dialog root；不得只以 `autofocus` 字串或 screenshot 推論。
- no-save evidence 使用 record upsert／checkpoint request count、`lastSaveFeedback`、draft status 與 baseline signature；只看 UI 沒出現訊息不足以判定。

## 3. FMEA

| 失效模式 | 使用者影響 | 優先級 | 必要偵測／對策 |
|---|---|---:|---|
| 新 meeting 仍先聚焦匯入／標題或完全無焦點 | 仍以為匯入是 gate | P0 | browser activeElement；TC-094-001 |
| existing／recovery／dialog 被 editor 搶焦點 | 錯誤操作、衝突決策中斷 | P0 | 三種真實 focus fixture；TC-094-002 |
| `速記` 仍觸發 saveDraft | 空白草稿被暗存，語意不符 | P0 | provider request count=0；TC-094-003 |
| default import 使用 stale records 或錯誤 record 排 baseline | 遺漏／重複整週變更 | P0 | refresh spy + selection matrix；TC-094-005 |
| start 仍 inclusive | cutoff 同值事件重複 | P0 | exact timestamp event；TC-094-006 |
| 成功前先改 content，AI/error 後留下半成品 | 會議草稿毀損 | P0 | delayed/error injection、deep equality；TC-094-009 |
| loading 期間輸入被舊 snapshot 覆蓋 | 速記遺失 | P0 | delay synthesis while typing；TC-094-010 |
| event 沒 stable ID 仍加入 | 無法可靠 dedupe | P0 | missing-ID fixture 必須 fail closed；TC-094-008 |
| 存草稿／empty／失敗推進 cutoff | 下一週漏資料 | P0 | publish eligibility matrix；TC-094-013 |
| editor undo 後仍推進 cutoff | 已移除資料仍改歷程 | P0 | real Ctrl+Z + publish + next meeting；TC-094-014 |
| custom gap／rollback 被產品自行警告或阻擋 | 違反 15C 決策 | P1 | dialog/alert count=0；TC-094-016 |
| success 洩漏區間／筆數或新增專用 undo | 違反 16C 決策 | P1 | visible text/action scan；TC-094-017 |
| DEV-023 work-log 匯入被一併簡化 | 非目標流程回歸 | P1 | work-log browser regression；TC-094-020 |
| 12 小時後 action disable／自動發布 | 週會整理資料遺漏 | P0 | clock +13h fixture；TC-094-018 |
| stale response 寫到另一 draft／board | 跨紀錄資料污染 | P0 | switch target during delay；TC-094-011 |

## 4. Automated contract cases

| ID | Priority | 類型 | 驗證步驟／Expected |
|---|---:|---|---|
| TC-094-001 | P0 | Browser | 經 MainLayout 與「補一筆會後紀錄」正常建立新 meeting；editor root 取得 focus、selection 在內容尾端，可立即輸入。 |
| TC-094-002 | P0 | Browser | 分別 open existing、F5 restore、顯示 recovery conflict／guard dialog；editor 不得搶 focus。選 cloud existing 後進 meeting mode也不自動搶焦點。 |
| TC-094-003 | P0 | Browser/Spy | 點 `速記`；focus 移到 editor，record upsert=0、checkpoint immediate request=0、status/baseline/content/import metadata 不變。 |
| TC-094-004 | P1 | Rendered | idle first cell 為 optional secondary，不使用 pending 綠色 override；完整可見 `帶入上次會議後變更`，default 不 render date/scope/preview/confirm/skip panel。 |
| TC-094-005 | P0 | Pure/Service | 每次 default click 先 refresh board records；只選最新 `updatedAt` 的 valid published imported meeting，tie 以 id 穩定；draft／no-import／archived／wrong-board／invalid 都忽略。 |
| TC-094-006 | P0 | Provider/Pure | query `(T1,Tclick]`：排除 `E-start`、納入 `E-end`、排除 `E-after`；省略 `startBoundary` 的 legacy query 仍 inclusive。 |
| TC-094-007 | P0 | Pure | 沒有 valid prior cutoff 時起點等於 `draft.occurredAt - 7 days`，不是 click-7d、startOfDay 或固定六天。 |
| TC-094-008 | P0 | Pure/Service | provider duplicate ID 只留一筆；current draft 已 active 的 IDs 全排除；missing ID 使整次 typed error/no-commit。 |
| TC-094-009 | P0 | Browser/Service | records、activity、AI 各自 timeout/error 與 zero delta；content、metadata、cursor、baseline deep equality，empty 不顯示 `已完成`。 |
| TC-094-010 | P0 | Browser | AI delay 期間持續輸入；成功 block 附加於最新文字末端，人工輸入 byte-for-byte 保留，cursor/focus 位於 block 後。 |
| TC-094-011 | P0 | Browser | request pending 時切 draft、切 board或發布；late response 不寫入任何新 target，request state安全復位。 |
| TC-094-012 | P0 | Browser/Pure | 同 draft 連點兩次，第二次 query可重讀範圍但只 synthesis／append 新 event IDs；舊 block、人工修改與 task links 不覆蓋。 |
| TC-094-013 | P0 | Store/Provider | 新建、draft save、checkpoint、empty、error、未匯入 publish 均不產生 eligible cutoff；只有 active batch + publish upsert success 產生。 |
| TC-094-014 | P0 | Browser/Store | 匯入後 real Ctrl+Z 回到 `beforeContentSignature` 再發布；batch失效、下一 meeting 不採該 cutoff。AI merge 前後 undo path 都不可產生 phantom cutoff。 |
| TC-094-015 | P0 | Store/Provider | publish failure 不改 status/cutoff；global record undo 後該 record 不 eligible，redo success 後恢復；archive 後 provider list 不再選取。 |
| TC-094-016 | P1 | Browser/Pure | custom date today end clamp click；gap／rollback均直接執行且 dialog/alert/warning=0；future、missing、start>end只顯示 inline validation且0 request。 |
| TC-094-017 | P1 | Rendered | default/custom success visible text只有 `已完成`；不可見 range/count/gap/rollback/專用undo；metadata可保留內部 event IDs作正確性用途。 |
| TC-094-018 | P0 | Pure/Browser | clock 位於 meeting +11h59m 與 +13h；action均可用且 window未截斷，無 TTL、auto-publish、auto-close。 |
| TC-094-019 | P0 | Recovery/Provider | draft save、checkpoint、F5 restore round-trip batches；status draft無有效 cutoff；invalid metadata忽略但可見內容保留。Supabase／local metadata readback相等。 |
| TC-094-020 | P1 | Regression | work-log 仍可展開日期／board-workspace scope／preview／insert；project-change protected merge、single-record AI、meeting save/publish/exit guard與 SPEC-069 mobile boundary無回歸。 |

## 5. Rendered QC cases

| ID | Viewport | 操作與必驗結果 | 必留證據 |
|---|---:|---|---|
| ROT-094-001 | 1440×900 | 正常新 meeting，完全不碰匯入；直接輸入、空白／有內容存草稿、reload、AI整理、發布 | initial focus、no-import draft reload、published screenshot、request summary |
| ROT-094-002 | 1440×900 | 點 one-click，確認無 panel／preview；成功 block末端、cursor後置、只顯示 `已完成`；再產生 event 後重點一次 | before/after content hash、event ID sets、兩次 screenshot、activeElement |
| ROT-094-003 | 1440×900 | custom gap 與 rollback；確認沒有 alert/dialog，再發布並開下一 meeting | selected dates、published metadata fixture、next baseline query、dialog/alert count |
| ROT-094-004 | 1440×900 | delayed import時輸入並切換 target；回應不得覆蓋輸入或污染 target | delay trace、兩 draft content hashes、console/page/network errors |
| ROT-094-005 | 1440×900 | 匯入後 Ctrl+Z、發布、再開 meeting；撤銷 batch不作 cutoff | undo前後 content／metadata、publish record、next query |
| ROT-094-006 | 1440×900 | existing、recovery、guard/conflict dialog focus；再點 `速記` | activeElement sequence、dialog screenshot、upsert count=0 |
| ROT-094-007 | 390×844 | 依 SPEC-069 驗證 meeting入口、editor、import、actions、status均不存在；work-log仍可用 | negative DOM counts、screenshot、overflow sweep |
| ROT-094-008 | 1440×900 | work-log 舊匯入設定、scope、preview、insert 流程 | screenshot、DOM selectors、DEV-023 regression result |

所有 rendered cases 都要掃描：水平 overflow、重疊、裁切、keyboard focus order、visible `alert`／error、HTTP 4xx/5xx、console error、page error。產品可見錯誤或 P0/P1 finding 任一存在即不得通過。

## 6. Planned verifier 與指令

下列前兩支 script／package command 已在 WP-094-E 落地；目前只完成 implementation smoke，完整 QA 狀態仍為 NOT RUN，不得以 smoke 證據代替完整通過：

```powershell
npm.cmd run verify:dev-094-meeting-direct-note
npm.cmd run verify:dev-094-meeting-direct-note-pure
npm.cmd run verify:dev-094-meeting-direct-note-browser
npm.cmd run verify:dev-020-record-workflow-redesign
npm.cmd run verify:dev-020-project-change-import-browser
npm.cmd run verify:dev-021-project-change-ai-preserve
npm.cmd run verify:dev-022-project-change-single-record
npm.cmd run verify:dev-023-record-project-change-import-workflow-step
npm.cmd run verify:dev-069-meeting-draft-recovery
npm.cmd run verify:dev-092-record-sidebar-quietness
npm.cmd exec tsc -- --noEmit
npm.cmd exec eslint -- src/components/Records/RecordSidebar.tsx src/components/Records/RecordContentEditor.tsx src/components/Records/MeetingProjectChangeImportControl.tsx src/store/useRecordStore.ts src/utils/meetingRecordWorkflow.ts src/utils/meetingProjectChangeImport.ts src/services/localTestService.ts src/services/supabase/projedService.ts scripts/verify-dev-094-meeting-direct-note.mjs scripts/verify-dev-094-meeting-direct-note-browser.pw.js
npm.cmd run build:test
git diff --check
```

Browser verifier 使用既有受管理的 local-test runtime；若需另開 temporary runtime，必須先記錄 project、purpose、port、owning process tree 與 cleanup condition，完成後只停止該 task-owned tree 並確認 port released。

## 7. Evidence contract

Future verifier 必須產出：

- `output/qa/dev-094/result.json`：pure cases、provider boundaries、event ID sets、content／metadata before-after hashes、request counts、PASS/FAIL。
- `output/playwright/dev-094/result.json`：ROT case、viewport、activeElement sequence、DOM counts、network／console／page error summary。
- `output/playwright/dev-094/desktop-no-import.png`
- `output/playwright/dev-094/desktop-import-complete.png`
- `output/playwright/dev-094/desktop-custom-override.png`
- `output/playwright/dev-094/mobile-meeting-negative.png`

JSON 至少包含：

```json
{
  "status": "NOT_RUN",
  "cutoff": {
    "selectedRecordId": null,
    "startedAt": null,
    "startBoundary": "exclusive",
    "endedAt": null,
    "endBoundary": "inclusive"
  },
  "eventIds": {
    "returned": [],
    "deduped": [],
    "committed": []
  },
  "recordRequests": {
    "list": 0,
    "upsert": 0,
    "checkpoint": 0
  },
  "visibleErrors": [],
  "consoleErrors": [],
  "pageErrors": []
}
```

不得輸出真實會議文字、token、使用者識別資訊或完整 production metadata；content evidence 使用 deterministic fixture、hash 與必要短片段。

## 8. QA／QC exit criteria

- TC-094-001～020 與 ROT-094-001～008 全部有可追溯實測結果；沒有 skip 被誤列 PASS。
- P0/P1 finding = 0。P2 若 deferred，必須記錄 owner、影響、期限與 re-entry trigger。
- Supabase 至少有 adapter query spy 與 metadata readback；若 production release 使用 Supabase，再依 release gate 補 TEST environment smoke。Firebase只驗 explicit empty/no-false-success，不把 project-change import標成 supported。
- DEV-020／021／022／023／069／092 targeted regressions、TypeScript、targeted ESLint、build:test、git diff check 通過。
- QA PASS 後仍需獨立 QC 依 rendered evidence與 service facts判定；本計畫不建立 production、deploy 或 release 授權。

## 9. 本輪狀態

- 2026-08-28：建立 RD 可執行 QA plan；implementation verifier 與既有 local-test runtime smoke 已執行，但完整 QA、獨立 QC 與 release evidence 尚未建立。
- 2026-08-28：DEV-094 implementation wiring 已落地；static 12 checks、純函式 cutoff／exclusive boundary／stable-ID dedupe／publish projection smoke、TypeScript、targeted ESLint、DEV-020／023／092 static regressions 與既有 local-test 1440×900 UI smoke 通過。證據：`output/qa/dev-094/result.json`、`output/playwright/dev-094/desktop-no-import.png`。TC-094-001～020、ROT-094-001～008、390×844 negative、完整 provider/error/recovery、獨立 QA/QC 與 release 仍為 NOT RUN，不得將 implementation smoke 視為 QA PASS。
- 2026-08-28：DEV-094 implementation wiring 已落地；static 13 checks、pure 7 checks（`output/qa/dev-094/pure-result.json`）、TypeScript、targeted ESLint、DEV-020／023／092 static regressions、local-test 1440×900 UI smoke與390×844 meeting-negative smoke通過。證據：`output/qa/dev-094/result.json`、`output/playwright/dev-094/result.json`、`desktop-no-import.png`、`mobile-meeting-negative.png`。TC-094-001～020、ROT-094-001～008、完整 provider/error/recovery、獨立 QA/QC 與 release 仍為 NOT RUN，不得將 implementation smoke 視為 QA PASS。
