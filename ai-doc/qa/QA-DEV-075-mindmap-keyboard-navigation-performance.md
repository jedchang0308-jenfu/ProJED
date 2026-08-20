# QA-DEV-075：心智圖方向鍵快速巡覽效能驗證計畫

- 狀態：`Execution Complete / QA PASS / QC PASS / 未 Release`
- 關聯 DEV：DEV-075
- 規格：SPEC-075
- 風險：Medium
- Evidence boundary：local-test fixture與本地真實Chromium；不代表production release或實體mobile mindmap已驗證。

## 1. 驗證目的與角色邊界

- QA 驗證設計：證明方向鍵巡覽在大型心智圖中反應即時、順序正確、selection render被隔離、focus與既有interaction不漂移。
- RD 依S0～S4實作並先完成self-check；QA不得因RD自述或build通過把任務標完成。
- QC 依本計畫操作真實rendered surface與收集artifact；QC預設不改產品程式。任一失敗回RD，不修改expected掩蓋。
- 必要UI證據：route／URL、viewport、fixture、實際鍵盤操作、performance／DOM telemetry、screenshots、console/page/visible errors。lint／build／unit只作輔助。

使用思考習慣：#可驗證性、#拆解問題、#系統描繪

## 2. 環境與資料

- Repo／commit：記錄實際branch、HEAD與`git status --short`；working tree含既有DEV-074變更時需保存baseline touched diff。
- Browser：Playwright Chromium；記錄version、user agent、device scale factor、headless/headed與React StrictMode。
- Route：`http://127.0.0.1:4000/?dev075Phase=baseline|after`；local-test帳號與localStorage fixture，不連production。
- Viewports：1440x900、1024x768；390x844只驗證既有mobile boundary與visible-error，不側向開放心智圖。
- Dataset `dev-075-v1`：50／200／500 visible nodes、左右roots、至少4層、長中文／全形標題、collapsed branch、filter candidate與20條note relationships；所有測量在initial layout／font／geometry穩定後開始。
- Performance sequence：warm-up 20次；測量100次；33ms hold cadence與16ms burst；每個case 3 runs，artifact保留每run並取median p95。

## 3. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|---|
| 大圖仍LAG | hot path仍DOM query/tree traversal或View render | 鍵盤巡覽停頓 | latency、source/static、render telemetry | P0 | P01／P04／P05 |
| 漏步／跳錯節點 | selection被debounce、stale current ID或index錯序 | 定位錯任務 | input count與final ID對照 | P0 | F02／P03／P05 |
| index stale | expand/filter/delete/root-side後未invalidate | 選到隱藏或錯誤節點 | DOM order對照 | P0 | F04～F07 |
| 全樹仍render | View訂閱selected ID、global store notify all | 節點數越多越慢 | view/node render-count delta | P0 | P01／P04 |
| 雙selection owner | legacy state與store並存 | 多個ring、清除不乾淨 | aria-selected count與static | P0 | F01／F08 |
| focus落在舊節點 | rAF未取消或registry stale | 後續鍵盤作用錯物件 | activeElement與selected ID | P0 | F03／P03 |
| quick-title被搶focus | selection frame未檢查editor | 輸入中斷／誤命令 | quick-title／IME實際操作 | P0 | I01～I03 |
| relationship模式被穿透 | owner guard回歸 | 箭頭誤改任務selection | relationship操作 | P1 | I04 |
| selection引發geometry | selected style改bounds或dirty deps漂移 | 線／格再次跑掉 | recompute/path/DOMRect | P0 | G01～G03 |
| selected視覺跳動 | transition-all或border尺寸改變 | 畫面閃爍、connector抖動 | screenshot／DOMRect | P1 | V01／G03 |
| perf probe污染結果 | probe使用setState或全域subscription | 假性lag／假性PASS | probe off/on比較 | P1 | P06 |
| visible runtime error | store lifecycle／hook訂閱錯誤 | 頁面不可用 | visible-error／console/page | P0 | E01 |

## 4. Functional／Lifecycle Cases

| ID | 前置 | 操作 | 預期／通過標準 | 證據 |
|---|---|---|---|---|
| F01 | 50 nodes、initial load | 進入mindmap | 第一root唯一selected，activeElement同node | DOM＋screenshot |
| F02 | 中間node selected | 真實鍵盤Up／Down各20次 | 每步符合DOM可見順序，details/quick-title=0 | step log |
| F03 | 左右root／leaf／middle | Left／Right與邊界 | 依分支方向向內選parent、向外選first child；root向內可雙向跨中央看板名稱；center永不取得selection/focus | DOM log＋center bridge screenshot |
| F04 | 有collapsed subtree | collapse後快速Down；再expand | collapsed child不在順序；expand後立即納入且index只重建一次 | order＋build count |
| F05 | 可套filter fixture | 套用／取消filter後導航 | 只選可見node；filter變更重建，純selection不重建 | DOM＋telemetry |
| F06 | root-side／order可變 | 改side／order後導航 | model index與rendered DOM順序一致 | order artifact |
| F07 | selected node可刪 | Delete並確認 | 沿用delete plan next selection與focus | selected/active ID |
| F08 | node selected | 選relationship、空白click、Escape、外部clear、board switch | node ring清除或新board initial selection正確；任一時刻node selected count<=1 | state matrix |
| F09 | 100次rapid input | Up／Down混合後接Enter/Tab以外只讀檢查 | final selection符合完整input序列；不得因隱藏queue重排 | input/final log |

## 5. Interaction／Focus Regression

| ID | 操作 | 通過標準 | 證據 |
|---|---|---|---|
| I01 | fine-pointer單擊node後等待quick-title | selection成立，quick-title依SPEC-073取得focus；pending selection rAF不得搶回node | activeElement／DOM |
| I02 | quick-title輸入中文／IME並按方向鍵 | 文字游標／IME處理，mindmap selection不移動 | screen recording／DOM |
| I03 | 雙擊／右鍵開details後按方向鍵 | modal擁有keyboard，底層selection不移動；關閉後focus依既有規則 | modal／focus evidence |
| I04 | relationship tool/draft/selected relationship狀態按方向鍵 | exclusive owner維持，node navigation不穿透 | relationship state |
| I05 | drag開始／結束與方向鍵前後 | 不重複dispatch、不留stale selection/focus | event／DOM |
| I06 | Enter／Tab新增與Delete | 新增／命名／刪除契約維持，不因store改為stale ID | node hierarchy／quick-title |

## 6. Performance／Render Cases

| ID | Dataset／條件 | 操作 | Hard Gate | Evidence |
|---|---|---|---|---|
| P01 | 500、100%、probe | 單次ArrowDown | View render delta=0；render count變動node IDs<=2；notification delta<=2 | telemetry before/after |
| P02 | 50、100% | 33ms cadence 100次×3 | median p95<=32ms；long task count=0 | latency runs |
| P03 | 200、100% | 33ms cadence 100次×3 | median p95<=32ms；final ID正確；漏步=0 | artifact |
| P04 | 500、100% | 33ms cadence 100次×3 | median p95<=50ms；final ID正確；index build delta=0 | artifact |
| P05 | 200／500 | 16ms burst 100次 | final ID正確；max backlog不造成stale focus；long task count=0 | burst trace |
| P06 | 200 | probe off與on各一run | probe不得造成>20% p95差異；一般URL無probe attributes | comparison |
| P07 | baseline vs after | 相同環境／fixture | baseline超gate時after至少改善30%且達absolute gate；baseline已達gate時after惡化<=20% | before/after |

Latency定義：capture-phase keydown的`performance.now()`到MutationObserver首次觀察新node `aria-selected="true"`。Playwright真實鍵盤case與in-page固定cadence量測都必須執行；前者證明操作，後者控制頻率。

## 7. Geometry／Zoom／Visual Cases

| ID | 條件／操作 | 通過標準 | 證據 |
|---|---|---|---|
| G01 | 200 nodes＋20 relationships，100次導航 | recompute count delta=0；connector／relationship `d`不變 | DEV-074 telemetry/path snapshot |
| G02 | 50%／100%／200%各100次導航 | 每倍率G01成立；zoom／scroll值不被selection重設 | zoom/scroll/path artifact |
| G03 | 相鄰兩node切換selection | node DOMRect位置／尺寸差<=0.5px；selection只改color/ring，無layout shift | DOMRect＋screenshot |
| V01 | 1440x900／1024x768快速導航 | ring可見、無閃爍、重疊、裁切、斷線、不可操作或overflow | viewport screenshots |
| V02 | 390x844 hard reload | mobile boundary維持，不因DEV-075側向開放mindmap；既有頁面無visible error | screenshot＋route |

## 8. Visible Error Hard Gate

每個desktop/laptop主要case與mobile boundary都必須記錄：

- URL／route、viewport、timestamp、fixture與screenshot path。
- `.inline-error`、`[role=alert]`、load failed banner、visible `HTTP 4xx/5xx`、`Not Found`、`Internal Server Error`、visible `/api/` error text。
- console errors、page errors、failed requests；fixture預期有50／200／500 nodes，unexpected zero node／connector count直接Fail。
- 使用者目前可見surface若與fresh run矛盾，重新開啟QC；不得用build或另一新tab消除原畫面失敗。

## 9. Artifact Schema

Browser完成後設定`window.__DEV075_ARTIFACT`，wrapper寫入`output/playwright/dev-075-mindmap-keyboard-performance/result.json`：

```ts
type Dev075Evidence = {
  verifier: 'DEV-075';
  contract: 'mindmap-keyboard-navigation-performance';
  fixtureId: 'dev-075-v1';
  phase: 'baseline' | 'after';
  baselineRef: string;
  environment: { url: string; userAgent: string; viewport: { width: number; height: number } };
  cases: Array<{
    visibleNodeCount: 50 | 200 | 500;
    zoom: 0.5 | 1 | 2;
    eventIntervalMs: 16 | 33;
    eventCount: number;
    expectedSelectedNodeId: string;
    actualSelectedNodeId: string;
    missedSteps: number;
    latencyMs: { p50: number; p95: number; max: number };
    longTaskCount: number;
    viewRenderDelta: number;
    changedNodeRenderIds: string[];
    notificationDelta: number;
    navigationIndexBuildDelta: number;
    geometryRecomputeDelta: number;
    focusMatchesSelection: boolean;
    screenshot: string;
  }>;
  consoleErrors: string[];
  pageErrors: string[];
  visibleErrors: string[];
  regressionCommands: Array<{ command: string; exitCode: number }>;
  passed: boolean;
};
```

- baseline artifact存於`baseline/keyboard-before.json`且不得被after覆寫。
- static verifier在browser前允許after artifact不存在；browser後第二次必須驗schema、case matrix、threshold、error arrays與passed=true。

## 10. QC 執行順序

1. 確認S0 baseline與Git/touched-path evidence存在。
2. 啟動或重用符合AGENTS lifecycle的本地4000 runtime；記錄owner與cleanup obligation。
3. 執行DEV-075 static/browser/static；確認artifact與screenshots。
4. 執行SPEC-075列出的DEV-027B／027G／028／070／071／073／074 regressions。
5. 執行TypeScript、targeted ESLint、`build:test`。
6. 人工／AI真實鍵盤走查F01～F09、I01～I06、V01～V02並做visible-error sweep。
7. 若本任務啟動runtime，停止且只停止該process tree，確認port釋放；重用他人runtime時不得停止。
8. 全部必要case通過才更新QA為Executed並由QC判Pass；第一個Fail保存證據並回RD。

## 11. 判定

- `通過`：所有P0/P1 cases、AC-075-001～011、absolute／relative performance、render isolation、geometry、focus、viewport、visible-error與required regression都有相同source state證據且通過。
- `未通過`：任一漏步、錯序、全樹render、stale focus、quick-title搶focus、geometry recompute、performance gate、visible error或主要regression失敗。
- `未充分驗證`：缺baseline、browser artifact、真實鍵盤、render/latency量測、1440／1024 screenshot、visible-error sweep或必要regression；build／lint成功不能補足。
- `阻塞`：無法啟動local app、fixture不成立、browser不可用或工作樹衝突無法隔離，致必要case不能執行。

## 12. 實際執行結果（2026-08-20）

### 12.1 執行環境與證據邊界

- Active repo：`C:\VIBE CODING\ProJED\ProJED`；branch=`持續優化3`；S0 baseline HEAD=`df27be99711fe44462c96174c0e495d44d6a7209`。
- Browser：Chromium `151.0.7922.140`；fixture=`dev-075-v1`；artifact generatedAt=`2026-08-20T02:38:43.809Z`。
- 重用既有且匹配的`http://127.0.0.1:4000` primary runtime（listener PID 42856）；本任務未啟動runtime，因此不得停止且沒有cleanup obligation。
- Before evidence：`output/playwright/dev-075-mindmap-keyboard-performance/baseline/keyboard-before.json`與同目錄Git/status/touched-path records；After evidence：`output/playwright/dev-075-mindmap-keyboard-performance/result.json`。
- 本結果只代表相同source state的本地真實Chromium、自動化viewport與fixture；未執行production release或實體mobile mindmap。

### 12.2 效能結果

| Visible nodes | Baseline median p95 | After median p95 | 改善 | Gate | 結果 |
|---:|---:|---:|---:|---:|---|
| 50 | 25.9ms | 1.2ms | 95.4% | <=32ms | PASS |
| 200 | 59.4ms | 0.7ms | 98.8% | <=32ms且baseline超標時改善>=30% | PASS |
| 500 | 123.4ms | 0.7ms | 99.4% | <=50ms且baseline超標時改善>=30% | PASS |

- 16ms burst p95：200 nodes=0.7ms、500 nodes=0.6ms；200 nodes於50%／200% zoom p95分別為0.7／0.8ms。
- 全case missed steps=0、Long Task=0、`MindMapView` render delta=0、navigation index build delta=0、geometry recompute delta=0。
- 每次selection只改前後兩個node；100 events的notification delta=200，single-step=2；path data穩定、DOMRect delta=0、focus與最終selection一致。

### 12.3 真實操作、互動owner與畫面結果

- initial selection、ArrowUp／Down／Left／Right、collapsed／filter／order、delete-next、clear／board boundary均符合既有語意。
- 中央橋接：右root `dev075-node-0000`按Left選到左root `dev075-node-0001`，再按Right回到原root；中央看板名稱`centerSelected=false`且最終focus與selection一致。
- quick-title在IME composition與一般ArrowDown時保有輸入owner；Escape後node focus可恢復。Modal保有方向鍵與focus owner；relationship被選取時ArrowDown不改relationship，且node selected count=0。
- 50%／100%／200% zoom及20條relationship期間path不漂移、純selection不觸發geometry recompute。
- 1440x900、1024x768與390x844 boundary皆完成rendered檢查；mobile維持board fallback、未側向開放mindmap。
- Screenshots：`50-100-overview.png`、`200-50-overview.png`、`200-100-overview.png`、`200-200-overview.png`、`500-100-overview.png`、`laptop-1024x768.png`、`mobile-390x844.png`，均位於after artifact目錄。
- 中央橋接專屬截圖：`center-bridge-left-selected.png`（after artifact目錄）。
- console errors=0、page errors=0、failed requests=0、visible errors=0；一般route不掛probe attributes，probe-off p95 0.7ms，未見測試instrumentation污染產品路徑。

### 12.4 缺陷回送與修正閉環

- 第一次執行DEV-027B browser regression時，發現quick-title以Enter建立／完成後input unmount，focus未回到selected node，下一次Enter無法沿用鍵盤流程。
- RD將callback補為明確`restoreNodeFocus` intent：只有鍵盤Enter／Escape要求回復node focus；blur與滑鼠／modal流程不回復，並保留editable／dialog focus guard。
- 修正後重跑DEV-027B browser與完整矩陣均PASS，未放寬既有expected。

### 12.5 Regression、靜態與建置

- 受影響回歸：DEV-027B static 32/32與browser、DEV-027D browser、DEV-027G expansion 7 checks／system-health 97/97／browser／bundle-health 9/9、DEV-028 static 45/45與browser、DEV-070 58 cases、DEV-071 static/browser、DEV-073 static/browser、DEV-074 static/browser均PASS。
- `npm exec tsc -- --noEmit`、targeted ESLint與`npm run build:test`均PASS；production build app chunk=457.69KB。
- 最終artifact含13個DEV-075 browser cases與14項`exitCode=0` regression command results；final `--require-regressions` verifier PASS。

### 12.6 QA／QC 判定

`QA PASS / QC PASS`。AC-075-001～011、absolute／relative performance、render isolation、geometry、focus、interaction owner、viewport、visible-error與required regression均有同source state證據且通過。DEV-075可標示本地開發完成；本判定不包含commit、push、PR、merge、deploy或release。
