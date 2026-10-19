# QA-DEV-118：任務篩選器正向包含與跨介面共用控制驗證計畫

## 2026-10-19 Current V6 verification authority

- 關聯 DEV：DEV-118、DEV-039、DEV-045、DEV-048、DEV-062、DEV-090
- 工程權威：`SPEC-039` 的「全選顯示與完整分類矩陣 v6（2026-10-19）」
- 計畫狀態：`Local implementation acceptance PASS / Independent QC PASS / NOT RELEASED`
- 執行邊界：本地產品與直接回歸；不含正式 migration、remote apply、deploy、release 或正式資料寫入

本輪驗證 Board／Workbench 的 V6 明確 `all / none / selected`、四桶日期、V5 無損相容、持久化恢復與
真實 UI 操作。Calendar 保持 V5 query 與既有 v1～v4 subscription payload、permission、preview／feed；
不再要求 V6 Board／Workbench 與 V5 Calendar 使用同一 query 得到相同結果。跨版本三 surface parity 已退役。

判定分成三條，不互相代替：

1. 同一 V6 query／source／Taipei today 下，Board 與 Workbench matched IDs 一致；hierarchy context 不增加匹配筆數。
2. Calendar V5 preview 與既有 Edge／feed fixture identity 一致，外層 payload、權限與 token 語意不變。
3. 正常 UI 入口實際完成選取、reload、鍵盤、零筆恢復與 scope 隔離；model／source scan／build 不算 UI 證據。

<a id="dev-118-v6-local-acceptance-20261019"></a>

### 本輪本機驗收結果（2026-10-19）

獨立QC最終判定為本機指定範圍PASS，P0／P1／P2與必要證據缺口皆為0。完整產品矩陣維持上方SPEC authority；本節只記實際執行結果。

| 層級 | 實際結果與證據 |
|---|---|
| Model／相容性 | V6 model 17／17；偏好migration／恢復18／18。Calendar V5舊fixture、Edge與v3 model／feed原oracle通過。 |
| 直接回歸 | 初輪14個專用／直接verifier通過；rework後重驗受影響的migration、DEV-090、DEV-048、DEV-039；最後core67／67、parity26／26、cross-board23／23。logs：`output/qa/dev-118/v6/final-run1-group*.json`、`rework1-group1.json`、`rework1-parity-corrected.log`、`rework2-workbench-regressions.json`。 |
| 編譯／建置／lint | `typecheck-final-run3.log`、`build-final-run3.log`與`lint-final-workbench-run3.log`通過。整批changed-source lint為0 error／13既有warning；`lint-head-baseline.log`確認HEAD同樣13 warning。建置保留原chunk／Browserslist warning。 |
| 主介面 | `output/playwright/dev-118/v6/browser-result.json`：12組PASS，正常Board／Workbench／設定→Calendar入口、完整鍵盤、三態、N0／8／9與invalid輸入、AND／階層／五模式、scope隔離、無reload新tag、legacy轉換、unknown／invalid鎖定均通過；console:error／pageerror為0。 |
| Undo／redo | `output/playwright/dev-118/v6/undo-result.json`：2組PASS；選中B時復原／重做A，不改B的query或選定scope；diagnostics空。 |
| Calendar完整UI回歸 | `output/playwright/dev-118/v6/calendar-regression-result.json`：原DEV-045 verifier PASS，原斷言未改；7張圖涵蓋1440／1024／390／320、事件日期、各板獨立、排除與恢復、copy不連動、mobile Escape／focus。wrapper只隔離本任務前置storage、捕捉metadata及改截圖輸出目錄。 |
| 視覺／視窗 | 獨立QC實際檢視主UI 9張及Calendar代表圖；1440×900／390×844無出界或不可操作控制。root另以原始1242×668正常Board入口驗證panel bottom=660、可內捲至顯示設定；`reported-viewport.log`及兩張同名圖為實際證據。 |
| SQL | `output/qa/dev-118/v6/pg-receipt.json`：隔離PostgreSQL18＋auth stubs，default6、舊row不改、none roundtrip、updated_at CAS／競態、old／future rejection與RLS通過。只證本機SQL。 |

候選綁定：`持續優化@06079ce676b638cb7370b75c8c4d9a58d06aa5c6`加dirty manifest；
`output/qa/dev-118/v6/candidate-final-ui.json` contentHash為
`2aaf28e231cc48207d342e8122d7aa1d687492f9d8d4b39e81c269acbc8fe859`。
獨立QC重算42／42檔hash相符，產品／SQL snapshot 27／27亦相符。PM收尾只改4份直接文件的狀態與證據摘要，不改受測產品或測試。

失敗保留與處置：

- 首輪3個P1：journal落盤失敗後假synced、mixed delete journal未鎖定、Workbench錯scope選項；已修正並經獨立inline proof關閉，見`qc-round1-findings.json`與`qc-rework1-results.json`。
- 真實UI再發現state updater內pushUndo觸發MainLayout更新錯誤，以及隔離選項未隨同scope新tag刷新；兩項均修正，正常UI／undo證據與QC source review關閉。
- Browser run1～5保留各次失敗；錯member label、測試自行關閉Workbench、把獨立Workbench結果算進Board、把其他board結果算進selected-board parity、builder自身ready attr誤找descendant，均為具體fixture／selector／scope oracle修正，未改產品矩陣。
- Calendar首輪two-board fixture受前序本任務storage污染；`calendar-regression-first-result.json`保留失敗，隔離同session前置資料後原verifier與原斷言通過。

本輪採平衡路由：Coordinator沿用current session（名稱未獨立驗證）；Tech Lead為GPT-6 Astra xhigh；RD、QA與獨立QC為GPT-5.6 Sol high。
專用browser PID14796及PostgreSQL PID22312已停止，55418已釋放；原4000／PID45224保留。
資源治理session已ended、runtime與lease已release，見`runtime-cleanup.json`及`governor-session-end.json`。

未執行且不宣稱通過：Supabase provider／正式migration／正式資料／部署／release／真實多裝置驗收。
正常account A/B UI因無既有切換入口保持NOT RUN，帳號／board isolation由repository行為與store generation guard證據支持。
本地成果保留於同一工作樹，未commit／push；舊V5結果僅作歷史相容基線。

### Existing evidence reuse and oracle replacement

| Evidence／tool | 本輪處理 |
|---|---|
| `scripts/run-playwright-code.ps1` | 沿用 task-owned session、artifact window與cleanup；不負責啟動app。 |
| `scripts/fixtures/dev-118-task-filter-conformance.json` | 凍結為 V5／Calendar 基線；不得改 expected 來配合 V6。 |
| `scripts/fixtures/dev-118-task-filter-v6-conformance.json` | 新 V6 truth fixture；固定 today、timezone、日期桶、缺值、未來選項與 exact IDs。 |
| DEV-090 browser fixture | 沿用正常 shell、local-test資料、五模式、reload、帳號／看板隔離、hierarchy、zero recovery、截圖及 error sweep。 |
| DEV-090 projection | 沿用 matched／visible／context-only、archived／orphan／cycle／cross-board gate；query改成 V6。 |
| DEV-045 model／feed／browser | 原 V5 expected 全保留；只做明確 V5 import／variant 接線。 |
| 舊 DEV-118 model 10 cases | 改用 V5 helper 後保留為歷史相容基線；不得當作 V6 PASS。 |
| 舊 DEV-118 DB／Edge source scan | 只證 Calendar 舊邊界仍存在；不能證 V6、CAS、真實 UI 或 provider。 |
| DEV-048 `未指派` oracle | 必須更新為主責與協作皆空；collaborator-only 不再命中未指派。 |
| v5 空選＝不限、舊日期、active count | 僅在 V5／legacy-v5 路徑保留；V6 oracle 全部改用明確 mode。 |

Fixture 可準備來源資料、舊偏好與注入失敗，但不可直接把案例要驗的最終 query／畫面結果寫進 store。
核心互動必須從正常 UI 點擊完成；直接 module state 只限 loading／error／timeout 等 fault injection，且證據標示層級。

### Model and projection matrix

| ID | Required case | Pass oracle |
|---|---|---|
| QA-118-V6-M01 | V6 default、normalize兩次、strict decode | `version=6`；四組all、N8、keyword空、active count 0；冪等且錯版／混版／非法值拒絕。 |
| QA-118-V6-M02 | status／people／tags逐組 all、selected、none | all全通過；none全不通過；selected組內OR；空selected canonical為none，不變all。 |
| QA-118-V6-M03 | due四桶的16種subset | 每個subset為桶聯集；四桶互斥且完整，all全通過、none零筆。 |
| QA-118-V6-M04 | N=0／8／365、N+1、Taipei跨午夜、null／invalid、completed past | inclusive邊界、台北日曆日與expected IDs exact；completed past命中before_today。 |
| QA-118-V6-M05 | 多人／協作／無人員、雙標籤／無標籤、停用或未知ID | 主責∪協作組內OR；只有兩者皆空才無人員；tagIds空才無標籤；保存ID不被清掉。 |
| QA-118-V6-M06 | status＋due＋people＋tags＋keyword | 跨組AND；keyword trim、英文不分大小寫且只搜title；active count 0～5按非all組計。 |
| QA-118-V6-M07 | dynamic all vs selected snapshot | restore時即使列滿目前選項仍selected；新增ID只被all納入；normalize／options更新不升all。 |
| QA-118-V6-M08 | projection／deferred status | Board／Workbench exact matched IDs；context-only ancestors可見但不計數；archived／orphan／cycle／跨板不洩漏。 |

### Compatibility, persistence and recovery matrix

| ID | Required case | Pass oracle |
|---|---|---|
| QA-118-V6-L01 | V5空status／people／tags與inactive due | 轉V6 all；V5空選不限不得誤變V6 none。 |
| QA-118-V6-L02 | V5明確四status、列滿現有人員／標籤 | 轉selected並保留snapshot；future ID不自動納入。 |
| QA-118-V6-L03 | V5 due四種組合 × completed／noncompleted × past／today／future／missing | native V5與轉換後V6 exact identity equivalent；active條件保留`legacy-v5`原值。 |
| QA-118-V6-L04 | 過去未完成＋近期任意狀態 | legacy-v5不被展平成純日期bucket＋status；保留舊overdue分支未完成限制。 |
| QA-118-V6-L05 | legacy date開關panel、reload、切scope、其他組編輯 | 顯示沿用舊日期；上述動作不轉換；只有明確「改用日期分類」或clear才成V6 date all/N8。 |
| QA-118-V6-P01 | local V4／V5 cache與pending upsert／delete | 依既有V4→V5再轉V6；完整write＋canonical readback前不刪來源，delete intent不變upsert。 |
| QA-118-V6-P02 | remote 4／5→6 upgrade | CAS帶expected version＋原updated_at；0-row重讀最新再轉，不blind overwrite。 |
| QA-118-V6-P03 | 6→6 rapid writes／late response／auth或scope generation change | latest intent保留；舊scope response不套用；只移除已ack相同mutation ID。 |
| QA-118-V6-P04 | timeout已提交／未提交、cache／pending write與readback fail | 先provider readback；已等價才成功，否則保留journal／raw／warning與可恢復選擇。 |
| QA-118-V6-P05 | unknown 7、unknown低版、invalid／mixed current payload | unsupported／invalid；禁止write、reset、pending replay或fallback舊key覆寫；不可冒充default/zero。 |
| QA-118-V6-P06 | Workbench多board／account隔離 | queries、selectedBoardId、panel prefs完整一次讀回；Board、Workbench、Calendar互不串寫。 |
| QA-118-V6-P07 | clear group／clear all | 回V6 all；clear-all N8＋keyword空；display settings、來源看板及Workbench panel prefs不變。 |

### Calendar V5 preservation matrix

| ID | Required case | Pass oracle |
|---|---|---|
| QA-118-V6-C01 | 新Calendar draft | outer snapshot仍V4，內層為V5；safe default只選current user，date_types預設due date。 |
| QA-118-V6-C02 | 開啟v1～v4但未save | 0 remote write、0 token regeneration；included、date_types、permission與既有preview不變。 |
| QA-118-V6-C03 | Calendar controls操作／序列化 | `calendar-v5`空選、日期及permission disabled語意保留；serializer拒絕V6，不產生四桶／無標籤欄位。 |
| QA-118-V6-C04 | 原V5 fixture跑browser compiler與Edge | exact task IDs／event date types一致；不修改舊expected。 |

### Normal UI delivery path

正常入口固定為：Board上方「過濾器」；Board開啟左側所有任務後的「過濾器」；
設定→行事曆訂閱→建立／編輯。Direct URL、DOM injection或model結果不能取代正常入口。

| ID | Action | Required evidence |
|---|---|---|
| QA-118-V6-U01 | 無偏好進Board與Workbench | 四組All為checked、N8、計數0、全fixture IDs可見；兩個surface各自state。 |
| QA-118-V6-U02 | 鍵盤Tab／Shift+Tab／Space／Enter操作All與個別項，Escape關閉 | `aria-checked=true/mixed/false`正確；focus回trigger；無focus loss。 |
| QA-118-V6-U03 | all取消一項、selected最後取消、勾上最後未選、點All | 依V6 transition；mixed不只靠顏色；selected-full短註記與future item行為正確。 |
| QA-118-V6-U04 | 日期四桶、N0／8、invalid空白／負數／小數／366、legacy日期轉換 | exact IDs；invalid保留最後有效query且blur恢復；legacy只因明確操作轉換。 |
| QA-118-V6-U05 | 任一組none造成零筆，再按零筆CTA／clear | 顯示真正filtered-zero；可恢復default；loading／error／unsupported不誤報零筆。 |
| QA-118-V6-U06 | 改display後clear、reload、切Board A/B、Board/Workbench | display不變；none仍none；各board／surface scope精確恢復且不串用。account隔離由repository behavior證據承接；本地無正常account切換入口時UI維持NOT RUN。 |
| QA-118-V6-U07 | 子命中父不命中，在Board/List/MindMap/Gantt/Calendar board modes切換 | canonical matched IDs一致；父只作context；日期視圖無日期提示不刪matched truth。 |
| QA-118-V6-U08 | Calendar正常入口建立／編輯 | V5 controls與safe permission不變；Board／Workbench V6操作不改draft。 |
| QA-118-V6-U09 | 1440×900與390×844同route default／mixed／zero／recovered | same-view screenshots、無overflow／裁切；console/pageerror/非預期HTTP/visible error為0。 |

Browser artifact 使用 `window.__DEV118_V6_ARTIFACT`，由主流程在已登記的task-owned browser session擷取到
`output/playwright/dev-118/v6/browser-result.json`；本QA不另開未登記session。artifact必須含主流程freeze提供的
dirty candidate file manifest與內容hash，HEAD只作次要來源資訊，不能把未提交candidate錯綁成未變HEAD。
其餘至少含fixture schema／counts、today／timezone、route、viewport、query payload、matched／visible／context IDs、
scope keys、步驟結果、screenshots與diagnostics。
模型PASS不能寫進UI case；UI未執行保持`NOT RUN`。

### Required commands and directly affected regressions

專用 gate 沿用既有 package scripts，不新增另一套入口：

```powershell
npm.cmd run verify:dev-118-task-filter-model
npm.cmd run verify:dev-118-task-filter-migration
npm.cmd run verify:dev-118-task-filter-edge
npm.cmd run verify:dev-118-calendar-filter-db
npm.cmd run verify:dev-118-task-filter-browser
```

直接回歸分母依實際受影響claim選測：

```powershell
npm.cmd run verify:dev-090-task-filter-contract
npm.cmd run verify:dev-090-task-filter-projection
npm.cmd run verify:dev-048-task-filter-collaborators
npm.cmd run verify:dev-039-task-filter-core
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-039-task-workbench-cross-board-source
npm.cmd run verify:dev-045-calendar-subscription-builder-preview
npm.cmd run verify:dev-045-calendar-subscription-builder-preview-browser
npm.cmd run verify:dev-045-calendar-subscription-v3-model
npm.cmd run verify:dev-045-calendar-subscription-v3-feed
npm.cmd run verify:dev-062-simplified-task-status
npm.cmd exec tsc -- --noEmit
```

替代映射：舊DEV-090 browser的default／reload／board隔離／hierarchy／zero／mobile error sweep由
U01、U05～U07、U09在新版正常入口承接；account隔離只由repository動態scope案例承接，沒有正常account切換入口時不記UI PASS。DEV-048 browser的人員OR、collaborator-only與Workbench parity由
U03、U06承接；DEV-039 parity／cross-mode browser由U06～U07承接；DEV-062 browser的新版status控制與viewport
由U01～U03、U09承接。這些舊browser不重複列為required；若新版專用案例未實際覆蓋，對應claim維持NOT RUN，
不能以model PASS補位。Calendar builder browser保留，因逐看板date types、copy、draft、mobile與focus有獨立價值。

Model／migration先行。Browser、server、build由主流程統一管理，QA test-authoring階段不自行啟動。
Calendar DB／Edge gate只證本地舊邊界，不能宣稱authenticated provider或live feed。

### V6執行過程紀錄（保留各階段事實，最終結果以上方驗收為準）

`2026-10-19 / baseline HEAD 06079ce676b638cb7370b75c8c4d9a58d06aa5c6`：

- 第一個有效 RED：舊V5 10例PASS後，V6 default因`version`為`undefined`而非6失敗；不是missing import／0 tests。
- 擴充矩陣的第一輪有效 RED：共16例，14 PASS／2 FAIL；只選「未指派」或只選「無標籤」時，
  normalizer把`selected`誤轉`none`，實際matched IDs為空。產品修正後，同一矩陣增補active count與people／tags none，
  `verify:dev-118-task-filter-model`實跑17／17 PASS。
- `verify:dev-118-task-filter-migration`初擴為15例時出現兩個有效RED：initial invalid V6仍送出一次pending write，
  timeout且readback unavailable送出第二次write。修正後再加入source readiness與mutation lock consumer接線，實跑16／16 PASS：strict decoder、Calendar V5 runtime reject、V4／V5 local
  cache與pending升級、write/readback留源、delete intent、remote updated_at CAS、衝突重讀、unsupported／invalid quarantine、
  unknown outcome readback、scope isolation、store auth＋scope＋generation、blocked mutation lock，以及Board／Workbench task source readiness接線；
  mutation readback遇future／invalid後的`controlsLocked`也由store套用，Board把偏好警告送入error state，優先於filtered-zero。
- QC再發現current V6 delete journal可混入V5 `filters`／unknown field，以及current journal寫入失敗後retry可能在remote未寫時誤報同步。
  第一輪新增delete strict案例為16 PASS／1 FAIL並保留；產品修正後加入volatile upsert／delete intent recovery與selected-scope readiness動態矩陣，
  `verify:dev-118-task-filter-migration`最終實跑18／18 PASS。writePending持續失敗時仍維持sync-error且remote 0 write；真正補存journal後才可同步成功。
- 直接回歸實跑：DEV-090 contract 10／10 PASS、projection 5／5 PASS、DEV-048 collaborators 7 checks PASS、
  DEV-062 simplified status PASS、DEV-039 core 67／67 PASS、result parity 26／26 PASS、cross-board source 23／23 PASS；
  DEV-039三個原始失敗均為V5 shape／舊helper signature／direct predicate的stale source oracle，必要rewiring後通過，非產品行為失敗。
  Calendar v3 model曾因V2 outer `enabled` envelope被strict V5 boundary拒絕而有效失敗，修正後14／14 PASS。
  `node --check scripts/verify-dev-118-browser.pw.js` PASS，只證語法，不是UI PASS。
- 本機一次性 PostgreSQL 18＋auth stub receipt：`output/qa/dev-118/v6/pg-receipt.json`為PASS，證明default6、舊row
  全欄不改、none roundtrip、updated_at stale／fresh CAS、舊client與future-version guard，以及既有DEV-090 RLS matrix。
  此證據不是Supabase provider、正式環境、HTTP builder或UI證據。
- Browser run1／run2失敗artifact均保留；run2已實證U01～U04b（含五模式、keyword空白、active count 5）PASS，
  U05因測試先關閉Workbench後reload仍維持關閉而timeout，已改為由正常主介面toggle重新開啟，屬test flow修正；當時後續案例待完整重跑，最終run6已12組PASS。
- QA authoring交接時，專用browser、Calendar builder browser、root tsc與build為NOT RUN；後續主流程已實跑通過，結果見上方本輪驗收。正常account A/B UI因無既有正常切換入口維持NOT RUN，未以model結果冒充UI。

## 2026-09-11 Historical V5 plan and evidence

以下舊計畫與執行紀錄只適用 V5／Calendar 相容基線；與上方V6相反的oracle均已被取代。

- 關聯 DEV：DEV-118、DEV-039、DEV-045、DEV-062、DEV-090
- 關聯 SPEC：`SPEC-039-task-filter-core-and-workbench-profiles.md`、
  `SPEC-045-calendar-subscription-filter-builder-preview.md`、
  `SPEC-062-simplified-task-status-and-derived-overdue.md`
- 狀態：`Local Candidate QA-QC PASS / NOT RELEASED / Authenticated DB + Release Gate Pending`
- 架構狀態：`RD Implementation Ready / Architecture Confirmed`
- 風險：Browser query／UI／local migration Medium；Calendar validator／Edge／remote release High
- 日期：2026-09-11

## Verification objective and authority

驗證唯一心智模型確實貫穿資料、演算法、UI與外部feed：`未選＝不限；選取＝只顯示符合者；同組OR；
跨組AND`。Browser三個surface必須共用canonical compiler與controlled `TaskConditionFilterControls`；Calendar Edge
可有獨立row adapter，但只能因runtime／資料shape不同，matched truth必須與同一份fixture一致。

本QA是DEV-118新candidate的驗收權威。DEV-039／045／062／090既有PASS只作regression baseline，不能證明
v5 query、v4→v5 migration、shared Board UI、Calendar v4或Edge parity已完成。沒有同一source boundary下的
model、migration、正常UI入口、authenticated DB與feed evidence，只能判定Not verified。產品與演算法契約
不在本QA重述；發現不一致時回到`SPEC-039`／`SPEC-045`修正，再更新直接受影響case。

## Frozen UX Intent

- 任務／結果：熟悉使用者選擇想留下的任務，立即預測Board、Workbench與Calendar preview結果。
- 主物件／主焦點：單一filter panel中的query controls；surface selector、display settings或subscription controls
  是wrapper內容，不建立第二個filter truth。
- 預設刪除：排除語意、全選表示不限、常駐helper、重複摘要、狀態專屬彩色selected規則、巢狀卡片、
  到期按鈕的日期icon與「日」、第二份Board filter JSX。
- 保留舉證：status／date／people／tag／keyword是決定結果的五組；display settings保留但獨立；逾期為可辨識
  風險條件；到期＋天數compound避免兩個控制被誤認為兩個條件。
- 非語言修復：固定順序、section spacing／divider、neutral inactive、brand-blue pressed、focus ring、`aria-pressed`、
  full-value controlled update、局部disabled與error。
- 風險與驗證：migration不覆寫新版本、permission不放寬、source partial不假完整、Escape focus restore、
  keyboard／screen reader、320～1440 viewport、visible error與public feed parity。

## Required deterministic fixtures

唯一fixture檔固定為`scripts/fixtures/dev-118-task-filter-conformance.json`。Browser model verifier與
`supabase/functions/calendar-feed/taskFilterV4.ts` verifier都必須讀此檔；不得各自手寫一份期望值。

| Fixture group | Required data／expected edge |
|---|---|
| Today | 固定`today=2026-09-11`、timezone=`Asia/Taipei`；另有跨午夜`2026-09-10T15:59:59Z`／`16:00:00Z` clock case |
| Status | todo、in_progress、onhold、completed及legacy delayed／unsure；空、單選、多選、四選全開 |
| Due | 2026-09-10逾期、09-11今天、09-18第7天、09-19第8天、null、invalid；completed past與archived past |
| People | owner A、owner B、collaborator A、primary B＋collaborator A、完全未指派、無primary但有collaborator |
| Tags | tag-1、tag-2、兩者都有、無tag；多tag選擇預期OR |
| Keyword | 大小寫、前後空白、繁中、空字串、不命中；title缺省防禦案例 |
| Hierarchy | parent不命中但child命中、canonical duplicate placement、archived ancestor、missing parent、cycle |
| Scale | 500個有效task、5組active query；結果非零且有固定identity checksum |
| Legacy Board | v4 all-status-true、1～3 true、all-false、due only、overdue+due、`__unassigned__`、duplicate IDs、invalid days |
| Local journal | v4 cache、pending upsert、pending delete、write fail、readback fail、remote v4／v5／v6、CAS conflict |
| Workbench | account A scoped v4，兩個board query＋selectedBoardId；account B與panel prefs隔離 |
| Calendar | v1、v2、v3無overdue、defensive v3 overdue、v4 own-only、v4 unrestricted、unassigned、other-user、mixed／unknown shape |
| Actors | owner／project_manager／member／viewer／suspended／anon；manage權限只存在Board A的跨板負向案例 |

所有fixture必須先assert關鍵來源筆數、角色與預期集合非零；0-row、0-event或空assertion不得通過。

## FMEA and zero-tolerance failures

| Failure mode | Impact | Detection | Result |
|---|---|---|---|
| Active status仍代表排除，或四個預設active | 使用者無法預測、badge錯 | M01、B01 | Fail |
| `逾期`與`N天內`做AND | 同時選取只剩交集／空集合 | M03、B03、E03 | Fail |
| `N天內`包含過去 | 已逾期工作混入upcoming | M03、E03 | Fail |
| People／tag第二選項變AND | 合法結果被靜默縮小 | M04、B04 | Fail |
| collaborator-only被算未指派 | 人員責任誤判 | M04、E04 | Fail |
| clear-all改動display／selected board／date types | 非篩選偏好遺失 | B05 | Fail |
| Board仍保留重複filter JSX或Partial merge | 三surface漂移／nested value遺失 | S01、B02 | Fail |
| projection逐task compile或讀clock | 大資料抖動／午夜不一致 | M06、P01 | Fail |
| v4 local值先刪後寫、pending delete變upsert | 偏好遺失或重現 | G01～G04 | Fail |
| v4 client／CAS race覆寫v5／v6 | 新版本資料被破壞 | G05～G07 | Fail |
| Calendar preview正確、Edge仍用v3 matcher | 外部訂閱錯誤 | E01～E06 | Fail |
| v4 broad people由member通過 | 外部資料越權 | D05～D09、E05 | Fail |
| union prefilter漏掉unrestricted board | feed少事件但無錯 | E06 | Fail |
| partial source／unknown version fallback unrestricted | 不完整或越權輸出 | B10、D10、E07 | Fail |
| 正常畫面新增helper／框中框／雙重scroll | filter噪音與阻斷 | B11～B15 | Fail |

## Source and model cases

| ID | Action | Expected／explicit fail condition |
|---|---|---|
| QA-118-S01 | 靜態盤點runtime imports／exports與三wrapper | runtime只用`TaskFilterQuery`／target normalizer；只有既有`TaskConditionFilterControls`承載filter section JSX；UI不importlegacy type；domain不importReact／store／Supabase |
| QA-118-S02 | 檢查surface ownership | Board remote、Workbench local、Calendar draft互不寫入；shared controls不碰persistence／permission／shell |
| QA-118-S03 | 檢查Edge boundary | v4 pure adapter與index dispatch分離；v1～v3 branch仍在；兩runtime verifier引用同一fixture path |
| QA-118-M01 | normalize default／status組合兩次 | deterministic、idempotent；statuses依domain order、people／tags依code-point排序；空status不限，selected為include，四選不折疊，unknown移除 |
| QA-118-M02 | 五組truth table | 同組OR、跨組AND；group未啟用視為true；keyword為AND |
| QA-118-M03 | due matrix | overdue OR today～N；N=0／7邊界正確；past不因upcoming通過；missing／invalid只在date inactive通過 |
| QA-118-M04 | assignment／tag matrix | selected IDs與unassigned各組內OR；只有所有assignment空才unassigned；tags多選OR |
| QA-118-M05 | active count／summary／group clear | 最大5、每組只計1；clear group不動其他組；clear-all只回query default |
| QA-118-M06 | compiler／projection | 固定today；每projection compile once；matched／visible／context-only／canonical identity穩定 |
| QA-118-P01 | WP-A以目前v4凍結500-task baseline；candidate在同fixture／環境跑v5各20次 | checksum一致；記錄兩者絕對p95，v5不得高於v4的1.25倍；不保留runtime v4 benchmark path；沒有逐task Set／clock建立或query不變時重複compile |

## Migration, persistence and concurrency cases

| ID | Setup／action | Expected／explicit fail condition |
|---|---|---|
| QA-118-G01 | v4 all statuses true／1～3 true／all false | 依SPEC mapping；all false轉unrestricted並記intentional expansion |
| QA-118-G02 | due only、overdue only、兩者同時 | 保存v4實際集合：due only轉overdue＋upcoming；overdue優先使舊due冗餘 |
| QA-118-G03 | `__unassigned__`＋collaborator-only | query轉includeUnassigned；target identity有意排除collaborator-only，evidence明列差異 |
| QA-118-G04 | v4 cache／pending寫v5時注入write或readback fail | v4不刪、pending不丟、memory可用；重跑後收斂且無duplicate side effect |
| QA-118-G05 | remote v4無pending hydrate | CAS 4→5成功；cache v5與remote一致；CAS conflict後re-read而非blind overwrite |
| QA-118-G06 | remote v5／v6、local v4 pending upsert／delete | v5按journal與CAS規則收斂；v6block；reset不得刪v6；auth／scope change不送舊mutation |
| QA-118-G07 | rapid writes、network timeout、late response | latest intent保留；outcome unknown保留journal／warning；stale generation不套到新scope |
| QA-118-G08 | Workbench A v4兩board遷移兩次 | v5逐boardquery與selectedBoardId保留；panel prefs／account B不變；readback前不刪v4 |
| QA-118-G09 | display key為非default，query升v5／reset | `TASK_DISPLAY_SETTINGS_VERSION=4`與值原樣；不被query migration或clear-all重設 |

## Calendar DB and Edge cases

所有DB permission結果必須用authenticated actor session執行。service-role只可建立／清除已核對identity的disposable
fixture；不得以service-role成功取代RLS／validator evidence。

| ID | Payload／actor | Expected／explicit fail condition |
|---|---|---|
| QA-118-D01 | v1／v2／v3合法row | 新dispatcher仍接受；既有row 0 background rewrite |
| QA-118-D02 | strict合法v4 own-only | member可在可讀board建立／更新；function grants只有authenticated |
| QA-118-D03 | v4 unknown key、mixed marker、duplicate／invalid status、days -1／366／1.5、invalid UUID | client與DB都拒絕，既有row不變 |
| QA-118-D04 | project_ids／board_filters key缺少、額外、重複、跨workspace | fail closed；不得fallback default snapshot |
| QA-118-D05 | member own-only | 允許；people badge=1 |
| QA-118-D06 | member unrestricted／unassigned／other user | 每張included board均拒絕 |
| QA-118-D07 | project_manager broad Board A | Board A允許；不自動授權Board B |
| QA-118-D08 | owner／membership撤銷、suspended、deleted board | 下一request不輸出該board；edit顯示unresolved，不放寬scope |
| QA-118-D09 | anon直接execute v4／dispatcher helper | denied |
| QA-118-D10 | unknown v5 outer subscription／invalid v4 row | Edge受控失敗，0 data leak，不走v1 unrestricted |
| QA-118-E01 | 同v4 fixture跑browser／Edge matcher | matched task IDs exact equal |
| QA-118-E02 | v1～v3未save edit | public token event identities不變；0 remote write／0 token regeneration |
| QA-118-E03 | overdue＋7天、N=0、past／future／completed | browser preview與feed以task ID＋date type exact equal |
| QA-118-E04 | unassigned／collaborator-only／selected users | browser與feed identity一致；prefilter可多取但final matcher不得誤收 |
| QA-118-E05 | broad scope role matrix、撤權後request | Edge重新檢查permission；不得信任儲存時結果 |
| QA-118-E06 | A unrestricted、B user narrow、C tag narrow | union prefilter不漏A；最終各board matcher與event date types正確 |
| QA-118-E07 | source query失敗／task limit／partial board | 不宣稱完整；依既有failure contract回受控結果與可追溯診斷 |

## Browser delivery-path cases

正常入口固定：Board由上方`過濾器`；Workbench由Board開工作台再開`過濾器`；Calendar由
`設定 → 行事曆訂閱 → 建立／編輯 → 過濾器`。Direct URL或DOM injection不能取代入口證據。

| ID | Viewport／action | Expected／evidence |
|---|---|---|
| QA-118-B01 | 1440×900依序開三surface | section順序、label、chip／compound due／search／people／tags一致；Board只有一份filter controls |
| QA-118-B02 | 各surface選兩status、兩people、兩tags | 同組OR；selected為brand blue＋pressed／outline，inactive neutral；matched IDs一致 |
| QA-118-B03 | 點逾期，再點到期預設7並改0／清空 | 逾期獨立；到期＋數值同compound；按鈕無icon／「日」；date OR與clear正確 |
| QA-118-B04 | status＋date＋people＋tag＋keyword | 跨組AND、badge=5；第二個同組option不增加badge |
| QA-118-B05 | Board改display後group clear／clear-all；Workbench／Calendar同做 | display、selectedBoardId、list/group、included、date types、copy draft不變 |
| QA-118-B06 | Calendar member嘗試他人／未指派／不限 | control disabled且有可存取原因；full-value change仍被wrapper守成exact current user；save不越權 |
| QA-118-B07 | assignee／tag loading→ready、empty、error | selection保留；暫時空不觸發reconcile；empty只有最短狀態，error有局部恢復路徑 |
| QA-118-B08 | Board hydrate／sync fail→retry、v6 remote | hydrating期間controls disabled；warning非阻斷；retry收斂；newer version不允許mutation |
| QA-118-B09 | Workbench切A／B再reload與account switch | 每board／account v5 query獨立；Board remote state與Calendar draft不受影響 |
| QA-118-B10 | Calendar某board source partial／save fail | preview標示不完整、save／generate disabled、draft保留；恢復後可重試 |
| QA-118-B11 | keyboard Tab／Shift+Tab／Space／Enter／Escape | 視覺順序等於focus順序，chip可操作，Escape關閉並回trigger，無focus trap/loss |
| QA-118-B12 | screen reader／forced colors／reduced motion | accessible name／pressed／disabled reason可得；移除顏色仍辨識selected；無動畫依賴 |
| QA-118-B13 | 320×700、390×844、768×1024、1024×768、1440×900 | 無水平overflow、雙重scroll、panel裁切／遮擋；最長成員／tag／board名稱安全truncate／wrap |
| QA-118-B14 | Quietness audit | 無helper、摘要卡、框中框、重複selected訊號；display section只在適用surface存在且不搶主焦點 |
| QA-118-B15 | visible-error／console／HTTP sweep | 0非預期alert、pageerror、console error、4xx／5xx與不合理全零；fixture counts附證據 |

## Required implementation commands

RD必須建立下列同名`package.json` scripts與實際verifier；命名、輸入fixture與artifact root已凍結。任一命令
尚不存在、被skip、只作source字串搜尋或沒有non-zero assertion，該gate為Not verified。

| Package command | Owning verifier／artifact |
|---|---|
| `verify:dev-118-task-filter-model` | `scripts/verify-dev-118-task-filter-model.ts` → `model-result.json` |
| `verify:dev-118-task-filter-migration` | `scripts/verify-dev-118-task-filter-migration.ts` → `migration-result.json` |
| `verify:dev-118-task-filter-edge` | `scripts/verify-dev-118-calendar-edge.ts` → `edge-result.json` |
| `verify:dev-118-calendar-filter-db` | `scripts/verify-dev-118-calendar-db.ps1` → `db-result.json` |
| `verify:dev-118-task-filter-browser` | `scripts/verify-dev-118-browser.pw.js`經既有`run-playwright-code.ps1`、Base URL `http://localhost:4000/` → `browser-result.json` |

```powershell
npm.cmd run verify:dev-118-task-filter-model
npm.cmd run verify:dev-118-task-filter-migration
npm.cmd run verify:dev-118-task-filter-edge
npm.cmd run verify:dev-118-calendar-filter-db
npm.cmd run verify:dev-118-task-filter-browser
```

直接受影響regression gate：

```powershell
npm.cmd run verify:dev-039-task-filter-core
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-045-calendar-subscription-builder-preview
npm.cmd run verify:dev-045-calendar-subscription-v3-model
npm.cmd run verify:dev-045-calendar-subscription-v3-feed
npm.cmd run verify:dev-062-simplified-task-status
npm.cmd run verify:dev-090-task-filter-contract
npm.cmd run verify:dev-090-task-filter-projection
npm.cmd run verify:account-scoped-filter-prefs
npm.cmd run verify:supabase:static
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

既有regression若assert舊v4 shape，不得刪除案例或放寬成source-presence；應保留原風險意圖並更新為v5期望。
Calendar local DB gate必須在transaction／disposable database執行並rollback；它不是remote migration evidence。

## Phase gates and handoff order

| Gate | Entry | Exit |
|---|---|---|
| WP-118-A Fixture freeze | 架構定案 | JSON fixture、M／G failing tests存在且確實先Fail |
| WP-118-B Domain | A通過 | M01～M06、P01、projection／deferred regressions通過 |
| WP-118-C Persistence | B通過 | G01～G09、account／scope／CAS／display不變通過 |
| WP-118-D Shared UI | C通過 | S01～S02、B01～B15與Board／Workbench／Calendar local identity通過 |
| WP-118-E Calendar v4 source | D payload凍結 | S03、D01～D10、E01～E07、v1～v3 regressions與local rollback通過 |
| WP-118-F Candidate | A～E通過 | 全命令、TS、build、evidence provenance與QC handoff完成；仍NOT RELEASED |

任何前一gate未通過，不得用後一層畫面／build PASS抵銷。若實作需要改boolean semantics、surface ownership、
v1～v3 defensive read、permission或release順序，停止並回送架構，不得在RD階段自行改spec。

## Evidence contract and runtime lifecycle

建議evidence root：`output/playwright/dev-118-task-filter/`，至少包含：

- `model-result.json`、`migration-result.json`、`edge-result.json`、`db-result.json`、`browser-result.json`。
- source HEAD／dirty file manifest、fixture checksum、actor／role、provider／DB target、today／timezone、route、viewport。
- 三surface query payload、matched／visible／context IDs；Calendar preview／feed event IDs；CAS request／readback結果。
- 正常、selected、loading、empty、error、disabled、mobile／desktop與recovery screenshots。
- visible error、console、HTTP、v4／v5 performance samples與non-zero fixture counts。

若啟動local app／DB／Edge runtime，執行前記錄project、purpose、port、owning process tree與cleanup condition；
完成後只停止本任務確認擁有的process tree並證明port released。既有他人runtime只可安全reuse，不得全域終止node或清未知port。

## Pass, fail and release boundary

- PASS：WP-118-A～F在同一candidate source全部通過，conformance fixture兩runtime exact parity，所有P0／P1
  FMEA無缺口，evidence provenance完整。
- FAIL：任一語意錯誤、identity drift、scope污染、資料遺失、CAS overwrite、permission放寬、partial假完整、
  visible runtime error、accessibility阻斷或必要viewport失效。
- NOT VERIFIED：缺正常UI入口、缺authenticated DB、缺Edge matcher／feed、只跑舊regression、只有source scan／build、
  fixture全零或沒有today／role／source證據。
- STOP：需background rewrite正式rows、移除v1～v3 read、建立surface-specific predicate、把display混入query、
  修改task schema／RLS／status lifecycle，或無法保留user-owned dirty changes。
- 本QA通過最多只把DEV-118標為`Local Candidate QA-QC PASS / NOT RELEASED`。Remote migration、Edge deploy、
  app deploy、live `.ics`、rollback與production smoke必須收到獨立release指令並使用deployment／Supabase gate。

## Current execution record

`2026-09-11 / Local candidate`：已建立並執行conformance fixture、model／migration／Edge／DB static／browser
verifier；`npx tsc --noEmit`、`npm run build`與DEV-039 direct regression PASS。Authenticated DB matrix、live
`.ics` parity、remote migration、deploy／release尚未執行，依release boundary保留為後續獨立 gate。
