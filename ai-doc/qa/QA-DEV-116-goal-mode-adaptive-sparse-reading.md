# QA-DEV-116：全層級目標模式與自適應留白閱讀

- 狀態：`Plan Ready / Architecture Confirmed / NOT EXECUTED`
- 日期：2026-09-10
- 對應：DEV-116、SPEC-116
- 風險：Medium；P0為資料所有權／scope／錯誤偽空／N+1／meeting state，P1為互動／a11y／viewport／mobile。
- Source baseline：branch `持續優化3`、HEAD `fea16712f2ff4093984f06336da2e045a8d9f696`＋執行時frozen candidate dirty boundary。

## 1. 驗證目標

證明goal是可由正常桌機入口到達、全層級一致、只讀且scope-safe的主畫面；空白內容確實退出版面，父層
rowSpan不改資料所有權；會議摘要只來自latest valid DEV-108 provenance；錯誤、loading與真正空白可區分；
不產生N+1或任何task／record／link write；mobile、tracking、live meeting維持negative。

既有PASS只作baseline，不得預填DEV-116。QC只驗frozen candidate，第一個P0/P1 failure停止並回RD。

使用思考習慣：#風險優先、#可驗證性、#反例

## 2. Roles and Responsibilities

| Role | 責任 | 禁止 |
|---|---|---|
| RD | 依SPEC-116 WP完成、產生candidate與自驗證evidence | 在QC中改code、擴scope |
| QA | 建立case、fixture、oracle、failure injection與commands | 以source assertion取代UI delivery path |
| QC | frozen candidate獨立執行、比對artifact與可見畫面 | 修code後仍沿用舊PASS |

## 3. FMEA

| Failure mode | User impact | Detection | Priority | Gate |
|---|---|---|---|---|
| 父層文字被誤認為子層own data | 目標／責任誤判 | span owner、screen-reader、details readback | P0 | 不可靠即no-rowspan fallback |
| scope A records顯示在B | 跨板／跨帳號資料污染 | delayed A/B race fixture | P0 | stale settle不得commit |
| record error被視為empty | 使用者誤判沒有會議方向 | injected load failure＋column state | P0 | error欄存在且可retry |
| per-row records request | 延遲／成本／限流 | request counter＋10/500 rows | P0 | count固定1 board load |
| invalid／archived／AI文字進主畫面 | 錯誤決策依據 | mixed provenance fixture | P0 | unsupported text DOM=0 |
| goal進live meeting | session／capture漂移 | start、switch options、recovery | P0 | Board normalization；identity不變 |
| task filter/collapse後stale span | 內容遮蔽／錯owner | live recompute matrix | P1 | projection fingerprint更新 |
| goal繼承list mutation menu | 意外編輯／刪除 | pointer secondary、Shift+F10、DnD | P0 | menu/action/write=0 |
| compact UI失去focus／a11y | 鍵盤／讀屏不可用 | tab order、Enter/Space、AX readback | P1 | details entry＋owner可辨識 |
| mobile誤開goal | 未驗證畫面破裂 | 390＋coarse＋persisted goal | P1 | option=0、view=board |
| tracking placement進goal | 半套／越權資訊 | cross-board tracking fixture | P1 | placement DOM=0 |
| PWA不認goal durable intent | reload safety fail closed／錯誤提示 | manifest／intent pure probe | P1 | generic owners有goal、drag無goal |

## 4. Fixtures and Oracles

### 4.1 Canonical task tree

使用固定IDs，不以畫面文字作唯一identity：

```text
G-L1-A  description own
  G-L2-A1 blank
    G-L3-A1a blank
  G-L2-A2 meeting own          <- description span仍可跨；meeting barrier
    G-L3-A2a blank
  G-L2-A3 description own      <- description barrier
    G-L3-A3a blank
G-L1-B  both blank
  G-L2-B1 both blank
G-L1-C  meeting own
```

另建立：同一board 500 task performance tree、其他board canonical task、指向其他board source的tracking reference、
viewer與editor actor。Filter fixtures涵蓋status、assignee、tag、search與filtered-zero；collapse涵蓋L1與L2。

### 4.2 Records

- valid published與persisted draft DEV-108 entries。
- 同task不同occurredAt、同occurredAt不同recordId、同recordId不同entryId。
- archived、legacy正文、AI/RAG、activity、一般task link、non-meeting record、active unsaved draft。
- invalid namespace、duplicate entry ID、anchor mismatch、scope A slow response、scope B fast response、load failure/retry。

Oracle：latest按 `(occurredAt, recordId, entryId)` 最大；invalid record整筆隔離但其他valid結果保留；archived與
unsupported sources DOM=0。

## 5. Static／Pure／Store Cases

| ID | Case | Expected |
|---|---|---|
| P01 | View registration | ViewMode/App/MainLayout/Sidebar/store/PWA/local-test皆含goal；mobile block含goal |
| P02 | hierarchy authority | Goal只用task filter＋hierarchy utilities；無tracking projector、無task copy |
| P03 | sparse all blank | rows保留，兩content columns=false，cells無placeholder |
| P04 | description spans | own owner只跨連續descendant blanks；level<=owner或own content停止 |
| P05 | independent columns | description／meeting barriers與rowSpan互不影響 |
| P06 | post-barrier blank | 舊owner不恢復、不複製；輸出null structural cell |
| P07 | recompute | filter／collapse後以新rows產生新fingerprint，無stored span |
| P08 | latest index | exact scope/type/status、total order與canonical text正確 |
| P09 | invalid isolation | invalidRecordIds去重排序；valid records仍輸出 |
| P10 | complexity | parser每record最多一次；無task loop包records loop、無listByNode |
| P11 | load success/failure | `RecordListLoadState`依idle/loading/ready/error合法轉移；failure records=[]且exact scope error存在 |
| P12 | stale race | A start→B start→B success→A settle仍保持B |
| P13 | clear/logout | records與scope清空，pending token失效 |
| P14 | recovery loaded truth | App無local `.finally()`推測；只有exact scope的`status='ready'`才recordsLoaded |
| P15 | goal interaction | primary/double/tap/Enter/Space=open-details；secondary/Shift+F10/post-create/menu disabled |
| P16 | no hover/DnD | Goal source無`data-task-surface-source`、Dnd sensors、GlobalContextMenu dispatch |
| P17 | meeting policy | store-private五view set＋單一exported predicate；goal=false；MainLayout不複製allowlist |
| P18 | PWA | generic APP_SURFACES含goal；task-drag surfaces不含；durable intent可解析goal |
| P19 | no platform change | provider/schema/migration/RLS/dependencies無DEV-116變更 |
| P20 | doc drift | SPEC/QA/DEV/ADR/SPEC-117狀態、file surface與goal negative一致 |

Static artifact：`output/playwright/dev-116-goal-mode/static-result.json`，每case含ID、status、details；assertion
count不得為0，任一failure使process exit 1。

## 6. Browser Delivery-path Cases

### B01 Normal entry and return

1. 1440×900登入local-test editor、active board ready。
2. 以topbar「視角」打開menu，點「目標模式」；不得direct set store。
3. 驗證`data-goal-view`、current view與critical task count。
4. 切回Board再回Goal；board/filter不變，無資料重建錯誤。

### B02 All levels and content matrix

用4.1 tree驗證L1/L2/L3+都顯示own content，五種presence矩陣、兩欄independent visibility與compact blank rows。
空白文字、空框、`尚無任務說明`、`尚無關聯紀錄`、`＋說明`、`＋紀錄`的DOM／可見count均為0。

### B03 Span barriers／filter／collapse／live update

- 讀取每個owner的`data-goal-span`與row order，確認subtree／own-content barriers。
- 套用search、status、assignee／tag filter與collapse，確認projection重算且owner不跨hidden或unrelated row。
- 由Task Details替blank L2新增description後返回，舊parent span立即中斷；刪除後重建。
- 不允許page reload作為live update唯一同步手段。

### B04 Column collapse

分別建立description-only board、meeting-only board、both-empty board。檢查header／cell DOM count、table寬度與
task/status/owner骨架；records loading/error期間meeting column不得提前消失。

### B05 Meeting provenance／latest／invalid

一次載入mixed records；檢查latest、date、original text與tie-break。unsupported文字全部不出現。invalid source只
出現一個compact warning，valid highlights照常。active unsaved draft不投影。

### B06 Request／mutation budget

對10 rows與500 rows各從normal entry進Goal，記錄record provider requests；兩者都只允許現有board-level load，
Goal額外per-row request=0。點擊、filter、collapse、開關Details後task write、record write、task-link write均為0；
僅B03明確editor save可產生既有task write，必須與Goal自身counter分開。

### B07 Scope race／error／retry

- 延遲A response，切到B並先完成；B畫面不得顯示A唯一文字，A late settle後仍不變。
- 注入record load error：task／description仍可讀，meeting欄一個error＋retry；不得顯示empty。
- retry成功後error消失、scope正確、valid highlight出現。
- task error與filtered-zero、true-empty三者畫面與可恢復action可區分。

### B08 Details-only interaction and permissions

viewer／editor、L1／L2／L3+各至少一筆：pointer、Enter、Space開同一Task Details；close後焦點回原identity。
viewer readonly，editor可沿既有guard編輯。right-click、Shift+F10、long-press simulation、drag、double-click不得
出現mutation menu、create或inline edit；description hover card count=0。

### B09 Tracking negative

建立active board tracking reference與source-board task。Goal只顯示active board canonical primaries，tracking
placement ID／source-board private meeting text DOM=0；Board/List既有tracking visibility與identity仍正常。

### B10 Meeting compatibility

1. 非meeting Goal點正常`新增會議記錄`：current view變Board後meeting啟動。
2. live meeting打開ModeSwitcher：goal option DOM=0，不是disabled或no-op。
3. 將persisted view設goal後走既有F5 recovery notice／restore：restore前先Board；draft ID、snapshot content、
   recovery identity與capture segment contract不被goal重建。
4. 五模式DEV-117 sequence照常通過。

### B11 Mobile negative

390×844與desktop width＋coarse pointer各一組：goal option／view DOM=0；persisted goal在active board ready後為Board。
不以CSS hidden但可focus的item冒充排除；tab order也不得碰到goal option。

## 7. Visual／Accessibility／Performance

| ID | Environment | Required evidence |
|---|---|---|
| V01 | 1440×900 | full table、span ownership、normal entry screenshot |
| V02 | 1024×768 | 無column overlap、不可讀截斷、雙重scroll；Task Details入口可達 |
| V03 | 1440×900先進desktop goal後200% zoom | menu、table、wrapped text、focus可用；無重要內容被裁切；不以預先窄viewport誤測mobile |
| V04 | long zh/en/unbroken text | wrap與break-word，不用hover取代全文 |
| V05 | keyboard | DFS tab order、collapse獨立button、Enter/Space、Escape/focus return |
| V06 | screen reader/AX | header關聯、rowSpan owner task可辨識；不只靠顏色 |
| V07 | 500 rows | projection時間與request count有界，互動無明顯凍結 |
| V08 | error sweep | console/page/HTTP/visible unexpected arrays全空；critical counts > 0 |

若V06不能可靠表達owner，切換SPEC-116定義的no-rowspan fallback後重跑B02～B04、V01～V06；不能加helper
或複製parent text作替代。

## 8. Planned Commands

依序：

1. `npm run verify:dev-116-goal-mode`
2. `npm run verify:dev-116-goal-mode-browser`
3. `npm run verify:dev-039-task-filter-core`
4. `npm run verify:dev-070-interaction-kernel`
5. `npm run verify:dev-097-pwa-safe-reload`
6. `npm run verify:dev-108-task-meeting-note-persistent-list`
7. `npm run verify:dev-114-task-description-global-surfaces`
8. `npm run verify:dev-115-blank-task-creation`
9. `npm run verify:dev-117-cross-mode-meeting-continuity`
10. `npm run verify:dev-117-cross-mode-meeting-continuity-browser`
11. `npx tsc --noEmit`
12. targeted ESLint：SPEC-116 changed TS/TSX files
13. `npm run build:test`
14. `git diff --check -- <DEV-116 owned files>`
15. protected diff：provider/schema/migration/RLS/TaskDetails/ModeSwitcher／tracking/capture/reservation不得有DEV-116 diff

風險式取樣理由：DEV-116 browser已直接覆蓋interaction、hover exclusion、DEV-108 provenance與blank description；
因此不重跑DEV-070／108／115的整套browser，DEV-114 static守說明卡surface，DEV-117 browser保留作meeting
lifecycle高風險回歸。若owned diff實際觸及被省略suite的產品owner，該suite自動恢復為required。

若package現有實際script名稱與文件不同，先修文件或package使其一致；不得跳過並口頭宣稱等價。

## 9. Browser Artifact Schema

`output/playwright/dev-116-goal-mode/result.json`至少包含：

```json
{
  "devId": "DEV-116",
  "sourceRevision": "<sha + dirty boundary>",
  "passed": false,
  "cases": [],
  "actors": [],
  "fixtureIds": [],
  "viewports": [],
  "requestCounts": {},
  "mutationCounts": { "task": 0, "record": 0, "taskLink": 0 },
  "consoleErrors": [],
  "pageErrors": [],
  "httpErrors": [],
  "visibleErrors": [],
  "screenshots": [],
  "runtime": { "port": 0, "ownerPid": 0, "cleaned": false, "portReleased": false }
}
```

Verifier不得用預造空error arrays、空cases或0 fixtures形成PASS；每個critical count必須有明確下限assertion。

## 10. Runtime／Cleanup

Browser verifier使用既有`run-playwright-code.ps1`管理temporary runtime。啟動前記錄project、purpose、port、
owner process tree與cleanup condition；只清理本DEV擁有的process tree，確認port released。不得kill所有node.exe、
未知port或其他task runtime。若可安全重用相同runtime，須記錄owner與不清理原因。

## 11. Pass／Fail and Re-test

- PASS：P01～P20、B01～B11、V01～V08、required regressions與build全通過，artifact完整，protected diff=0。
- FAIL：任一P0/P1 case失敗、資料scope污染、error偽空、N+1、unexpected write、goal live/mobile/tracking洩漏、
  a11y owner不明且fallback未通過、critical fixture=0、visible/console/HTTP error或runtime未清理。
- Blocked：只有測試環境／credential／外部provider確實不可用且已證明無安全local替代時；不得把產品失敗寫成blocked。
- Re-test：RD修正後先重跑失敗case與相同authority鄰接case，再跑完整DEV-116與直接受影響regressions；
  任何source變動使舊QC artifact失效。

## 12. Current Result

`NOT EXECUTED`。本文件只完成Architecture Confirmed驗證計畫，沒有產品、browser、QA或QC PASS可回報。
