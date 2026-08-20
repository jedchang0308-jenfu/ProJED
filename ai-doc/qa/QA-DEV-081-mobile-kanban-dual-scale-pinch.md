# QA-DEV-081：手機看板 A／B 2～3 倍閱讀尺寸與雙指切換

狀態：`Executed smoke / Automated UI PASS (9 cases) / Physical Mobile Pending / Full 20-case matrix Not Run`

## QA 定位與邊界

- 驗證對象：`SPEC-081`／`DEV-081`。
- QA 角色：制定風險、案例、證據與停止條件；本文件不修改產品、不宣稱已執行或 PASS。
- 驗證層級：AI 只能透過實際渲染 UI 操作產品；允許唯讀 DOM／computed style／geometry 量測與錯誤收集，不得用內部狀態直接製造通過結果。
- 本次 evidence：`output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json`；9 個 browser smoke cases 全 PASS，console／page／request errors=0。此結果不等同完整 QA PASS，20-case matrix 與 iPhone Safari／Android Chrome physical gate 仍為 Not Run。
- 風險重點：兩指 pinch 與既有 pan、tap、long-press、task drag、控制項 owner、原生 browser zoom 的互斥，以及 B 的 2～3 倍幾何是否真實可用。
- 既有 authority：`QA-DEV-029`、`QA-DEV-054`；本計畫新增多指模式切換，不降低兩者的通過門檻。

## 環境與證據邊界

### Canonical environment

- 固定 local-test URL：`http://localhost:4000/`。
- Browser matrix：Chromium touch emulation `320x844`、`390x844`、`430x932`、landscape `844x390`、touch tablet `1024x768`。
- Negative matrix：desktop fine pointer `1024x768`、`1440x900`。
- Physical supplemental gate：至少 iPhone Safari 與 Android Chrome 各一台。AI automated browser 可先給 `Automated UI PASS/FAIL`；沒有真機證據時，整體 mobile release 結論必須是 `未充分驗證`，不可寫成 release-ready。
- 若測試需啟動臨時 runtime，執行前必須記錄專案、目的、port、owner process tree 與 cleanup condition；完成後只停止該任務擁有的 process tree 並確認 port 釋放。可安全重用既有 primary runtime 時不得另啟 server。

### Fixture

- 使用隔離 local QA 帳號與 disposable board；先以`http://localhost:4000/?qcReset=1&qcSize=96`載入既有、受支援的local-test bootstrap，取得3欄、每欄約8張L2與L3+階層，再navigate到乾淨的`http://localhost:4000/`執行cases，避免reload重複reset。URL navigation屬case前置，不是通過證據。
- 長中英混合標題、emoji與代表性標籤若seed尚未提供，browser verifier必須透過可見TaskDetails／tag UI建立；日期沿用可見seed內容。不得呼叫`window.__PROJED_QC__`、直接寫localStorage／store／DB／API補fixture。
- case開始前展開至少一張含L3+的卡，確認新增列表CTA與可拖曳任務可見；所有準備步驟記入artifact，fixture準備失敗即`Blocked`，不可縮減oracle。
- 需要資料變更的 drag case，只能在 disposable board 透過可見 UI 完成；case 前後以可見順序與 hard reload 比對。重置只能重開乾淨 fixture 或使用產品可見的合法 UI，不呼叫隱藏 test mutation API。

### 允許

- locator 驅動的 click、keyboard、pointer、wheel 與 Chromium CDP `Input.dispatchTouchEvent` 多 touch points。
- 真實頁面 navigation／reload、可見 UI control、截圖／錄影。
- 唯讀 `page.evaluate`：讀取 DOM attribute、文字、bounding box、computed style、scrollWidth／clientWidth、active overlays；收集 console、page、network 與 visible runtime errors。

### 禁止

- `useWbsStore.setState`、`window.__*TestApi` mutation 或任何直接 store mutation。
- 直接 service／RPC／REST／DB 呼叫來建立、移動、刪除或驗證任務。
- 直接 localStorage／sessionStorage／IndexedDB 寫入來切換 A／B 或準備通過狀態。
- 修改 DOM class／style／attribute，或用 `element.dispatchEvent(...)` 假裝真實 pinch、tap、drag。
- 只靠 source scan、unit test、build 或 synthetic state assertions 判定 UI PASS。

## RD Binding 與 Slice Gates

QA 只驗證 `SPEC-081` 已固定的 owner，不接受實作另建第二套 pinch／zoom 路徑：

| Slice | 必須存在的實作 binding | QA 進入條件 | Slice fail 回送 |
|---|---|---|---|
| S0 | `kanbanViewSize.ts`、Provider、anchor helper；key=`projed-kanban-view-size:v1` | pure normalize／threshold／cancel verifier PASS | preference、reducer或anchor helper owner不明即回RD |
| S1 | App provider、MainLayout `data-kanban-size-toggle`、Board root `data-kanban-view-size` | UI toggle、reload、account與desktop negative smoke PASS | 出現第二個state owner、遠端sync或非board污染即停止 |
| S2 | `useMobilePanBroker` 為唯一multi-touch owner；long-press/tap defense；drag `multitouch` cancel | threshold、single commit、slow pinch、active drag＋第二指browser cases PASS | 任一誤click／rail／drag／drop為P0 fail |
| S3 | scoped CSS layout tokens、L3 depth variable、六組ratio probes | 六組ratio、anchor、overflow、B合法drag與Surface Audit PASS | CSS zoom／scale transform或幾何不一致即停止 |
| S4 | 新 verifier、DEV-029／054 regression、engineering gates、artifact | automated UI evidence完整 | 缺viewport／screenshot／原始touch trace只能未充分驗證 |

### Stable selectors／debug contract

- Root：`[data-mobile-pan-surface="board"][data-kanban-view-size]`。
- Pinch phase：`data-kanban-pinch-state="idle|candidate|committed|wait-all-release"`；body active owner=`data-kanban-pinch-active="true"`。
- Toggle：`[data-kanban-size-toggle="true"]`＋`data-kanban-size-current`＋`aria-pressed`。
- Ratio probes：column header/L2/L3 `data-task-title-slot`、`data-task-date-badge`、`data-kanban-tag-front`、`data-kanban-column`、`data-mobile-task-card-primary`。
- Drag conflict：既有 body `data-task-drag-touch-active`；debug需出現 `cancel:reset` reason=`multitouch`，不得出現 commit。
- Test-mode debug：沿用 `window.__projedMobilePanDebug` 並新增 phase、touchCount、d0、d、ratio、delta、transition、anchorDrift；只讀取作 evidence，不得由測試寫入或控制產品。

### Engineering／browser commands

```text
npm run verify:dev-081-mobile-kanban-dual-scale-pinch
npm run verify:dev-081-mobile-kanban-dual-scale-pinch-browser
npm run verify:dev-029-mobile-pan-first-interactions
npm run verify:dev-029-mobile-pan-first-interactions-browser
npm run verify:dev-054-mobile-task-drag-precision
npm run verify:dev-054-mobile-task-drag-precision-browser
npx tsc --noEmit
npx eslint src/App.tsx src/components/MainLayout.tsx src/components/BoardView.tsx src/hooks/useMobilePanBroker.ts src/hooks/useLongPress.ts src/hooks/useTouchTapGuard.ts src/components/Wbs/taskDrag/useTaskDragSession.ts src/components/Wbs/KanbanColumn.tsx src/components/Wbs/KanbanCard.tsx src/components/Wbs/KanbanChecklist.tsx src/features/kanbanViewSize/*.ts src/features/kanbanViewSize/*.tsx
npm run build:test
git diff --check
```

- static/pure verifier只能支持 implementation contract；不得取代 UI-001～UI-020。
- DEV-029／054 browser結果只作 regression；若其測試資料準備不符合本文件UI-only boundary，不得替代DEV-081 primary artifact。
- browser primary artifact固定為`output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json`。

## FMEA 評分規則

- Severity（S）、Occurrence（O）、Detection difficulty（D）各 `1～5`；`RPN = S × O × D`。
- 優先級：`P0` 為核心需求未達、可能造成錯誤資料提交、核心手勢失效、不可復原卡死或主要可存取能力被停用；`P1` 為 RPN ≥ 36 或高影響可用性；其餘為 `P2`。
- P0 零容忍；所有 P0／P1 case 必跑且通過，否則停止。

## Pre-implementation FMEA

| ID | 失效模式 | 可能原因 | 使用者影響 | S/O/D | RPN | 優先 | 偵測方式 | 對策／驗證 case |
|---|---|---|---|---:|---:|---|---|---|
| F-081-01 | B 實際小於 2 倍或超過 3 倍 | 只微調字級、token 漂移 | 需求未達成或畫面失控 | 4/3/2 | 24 | P0 | 六組 computed geometry 比例 | 固定 ratio oracle；`UI-001`、`UI-003` |
| F-081-02 | 只放大文字，容器／間距未同步 | 局部 CSS override | 重疊、裁切、點擊目標錯位 | 4/3/3 | 36 | P1 | screenshot＋box overlap audit | layout token 同源；`UI-016` |
| F-081-03 | pinch 同時啟動 long-press／action rail／drag | 多個 hook 各自判斷 touches[0] | 誤操作甚至資料異動 | 5/4/2 | 40 | P0 | overlay、事件 trace、資料前後比對 | 第二指取消未提交 owner；`UI-007`～`UI-011` |
| F-081-04 | pinch release 開啟任務明細／CTA | tap guard 未吃掉 pinch stream | 非預期導頁／建立動作 | 4/3/2 | 24 | P0 | release 後 modal／route／count | all-release re-arm；`UI-008` |
| F-081-05 | 看板 pinch 與 browser 原生 zoom 衝突 | touch-action／preventDefault 範圍過大 | 頁面亂縮或輔助縮放失效 | 4/3/4 | 48 | P0 | board vs non-board physical trace | 僅 board owner；禁用全頁攔截；`UI-015`、`PHY-001` |
| F-081-06 | pan 與 pinch 雙 owner | broker 分散、第二指未提升 owner | 捲動跳動、誤切模式 | 5/3/3 | 45 | P0 | touch trace＋scroll delta | 單一仲裁器；`UI-004`、`UI-006`、`UI-009` |
| F-081-07 | active drag 遇第二指仍 drop 或切模式 | drag cancel path 不完整 | 任務移錯欄／錯排序 | 5/2/3 | 30 | P0 | 可見順序＋hard reload | 零提交 cancel；`UI-010` |
| F-081-08 | 同一次 pinch 因抖動連續 A↔B | 無 hysteresis／release lock | 畫面閃動、失去方向 | 4/3/3 | 36 | P1 | mode transition count | 單次 commit＋WAIT_ALL_RELEASE；`UI-005` |
| F-081-09 | 兩指等距平移被當 pinch | 只看方向、不看距離比 | 使用者移動畫面時誤切 | 3/3/3 | 27 | P2 | controlled parallel touch trace | ratio＋absolute threshold；`UI-006` |
| F-081-10 | 第三指／cancel／blur 後 owner 卡死 | cleanup event 不完整 | 後續全部手勢失效 | 5/2/3 | 30 | P0 | cancel matrix 後 fresh tap/pan | 單一 reset；`UI-012` |
| F-081-11 | 切換後跳到別欄或空白區 | reflow 未保持 pinch anchor | 失去閱讀上下文 | 3/4/3 | 36 | P1 | anchor box 前後座標 | 中點 anchor＋edge clamp；`UI-013` |
| F-081-12 | B 讓 body／App shell 水平溢位 | scroll owner 錯誤 | 整頁飄移、topbar 離屏 | 4/3/2 | 24 | P0 | body/client/board scroll audit | overflow 僅看板；`UI-016` |
| F-081-13 | transform 後 hit-test／drag overlay 不一致 | 視覺與 canonical geometry 分離 | 看得到卻拖不到或 drop 錯位 | 5/3/3 | 45 | P0 | 真實 B drag＋overlay screenshot | layout reflow 同源；`UI-011` |
| F-081-14 | modal／input／action rail 的雙指穿透到底層 | protected target 判定不完整 | 編輯中看板突變、誤寫入 | 5/2/3 | 30 | P0 | owner matrix、mode state | protected owner first；`UI-014` |
| F-081-15 | A 被新 token 改壞 | 共用 CSS selector 範圍過廣 | 既有使用者介面回歸 | 4/3/3 | 36 | P1 | baseline screenshot／geometry diff | A=1.0 frozen；`UI-001`、`UI-018` |
| F-081-16 | 偏好未保留或跨帳號污染 | global storage key／scope 錯誤 | 重載失憶或他人偏好外洩 | 3/2/4 | 24 | P1 | UI 切換、reload、帳號切換 | account/device scoped preference；`UI-017` |
| F-081-17 | 雙指是唯一入口或控制不可存取 | 忽略 discoverability／a11y | 單手或輔助使用者無法操作 | 4/2/2 | 16 | P0 | keyboard／role／name／state audit | 可見 toggle；`UI-017` |
| F-081-18 | desktop 或其他模式也被放大 | selector／preference scope 外溢 | 跨模式 UI 回歸 | 4/2/2 | 16 | P1 | desktop＋mode negative matrix | board mobile scope；`UI-018` |
| F-081-19 | B reflow 造成明顯 jank／layout thrash | 大量逐節點量測或重排 | 手勢延遲、畫面凍結 | 4/3/3 | 36 | P1 | trace、long task、transition time | token batch update；`UI-019` |
| F-081-20 | emulator PASS、iOS／Android 真機失敗 | browser 手勢／touch-action 差異 | 上線後核心功能不可用 | 5/3/5 | 75 | P0 | physical device matrix | automated 與 physical 分層結論；`PHY-001`～`PHY-004` |
| F-081-21 | visible error 被技術 gate 掩蓋 | 只看 console/build | 使用者看到錯誤或空畫面 | 5/2/2 | 20 | P0 | surface audit＋error arrays | visible error hard gate；所有 case |

## AI UI-only 操作驗證案例

### A. 尺寸、切換與門檻

| Case | AI 真實 UI 操作 | 通過條件 | 必要證據 |
|---|---|---|---|
| UI-001 | 以 A 開啟 fixture，捲動並截取欄頭、L2、L3、日期、標籤與 padding | root=`compact`；A 與既有 baseline 相容；無 overlap／overflow | A screenshot、六組 box／computed style |
| UI-002 | 在看板空白區用 CDP 兩 touch points pinch-out | 只切 A→B 一次；無 modal、rail、drag、CTA、資料變更 | touch trace、transition count、before/after screenshot |
| UI-003 | 在 B 用 pinch-in | 只切 B→A 一次；六組 B/A ratio 各 `2.0～3.0` | ratio JSON、root state、screenshot |
| UI-004 | 分別從空白、欄頭、L2、L3+、canvas CTA 非控制區 pinch-out／in | 每一表面都能切換；不觸發其原 action | origin matrix、overlay/action counts |
| UI-005 | 做 23px／未達 ratio、剛跨門檻、跨門檻後抖動與反向移動 | 門檻前 0 次、跨越後 1 次、全釋放前仍 1 次 | distance/ratio trace、transition count |
| UI-006 | 兩指等距同方向水平及垂直移動 | A／B 不切換；無 stuck owner；既有 scroll owner 不跳動 | touch/scroll trace、mode state |

### B. 既有手勢與寫入安全

| Case | AI 真實 UI 操作 | 通過條件 | 必要證據 |
|---|---|---|---|
| UI-007 | 在 L2／L3 上慢速 pinch，總時間跨過 650ms | 不開 action rail、不進 drag；只依方向切一次 | video／trace、overlay count |
| UI-008 | pinch 後放開，再做一次全新的 clean tap | pinch release 不開 details；新 tap 才開正確 details | modal timeline、selected task text |
| UI-009 | A、B 各做單指水平／垂直 pan 與 quick tap | pan 不開 details；tap 開正確 task；兩模式行為一致 | scroll delta、modal screenshot |
| UI-010 | 以 UI long-press 啟動 task drag，拖途中加入第二指 | drag 取消、模式不變、任務可見順序不變；hard reload 後仍不變 | before/after/reload order、drag owner trace |
| UI-011 | 在 B 以 UI 完成一次合法 long-press drag 到指定欄／位置 | overlay、hit-test、drop 位置與可見目標一致；只提交一次 | full video、drop screenshot、reload order |
| UI-012 | pinch candidate 分別注入第三指、touchcancel、pointercancel、blur、visibility/pagehide；回頁後 clean tap/pan | 未達門檻不切、已切者不重切；owner 全清；後續操作正常 | cancel matrix、active overlay/owner count |

### C. 上下文、owner、可存取性與回歸

| Case | AI 真實 UI 操作 | 通過條件 | 必要證據 |
|---|---|---|---|
| UI-013 | 在中央與四個 edge 附近，以指定 task 為 pinch 中點切換 | 非 clamp 漂移 ≤24px；clamp 時同 task／欄仍可見、無空白死區 | pre/post anchor box、scroll positions |
| UI-014 | 開啟 details modal、input/edit、popover、action rail，再於其內做雙指 | 底層看板模式不變；各 owner 原功能正常；關閉後可再切換 | owner matrix screenshot、mode timeline |
| UI-015 | 看板內 pinch、看板外 App shell／合法非 board surface 的縮放能力檢查 | board 只切模式；無全頁 viewport 禁縮或全域 preventDefault | viewport meta／event trace、physical evidence placeholder |
| UI-016 | 在所有 mobile viewport 以 A／B 檢查長文、emoji、日期、標籤、L3 展開、CTA、topbar | 無重疊、非預期裁切、遮擋；body 無水平 overflow；看板可完整 pan | viewport screenshots、surface/overflow audit |
| UI-017 | 以可見 toggle、鍵盤與 touch 切 A／B，reload，再切換 QA 帳號 | accessible name/state/focus 正確；reload 保留；另一帳號不被污染 | accessibility snapshot、UI/reload timeline |
| UI-018 | 走 desktop 1024／1440 與清單、甘特、行事曆、心智圖 | desktop／非board不出現size toggle；desktop board effective root固定`compact`，不受已保存large preference影響 | negative screenshots、selector counts |
| UI-019 | 在最大 fixture 連續執行 10 回 A↔B（每回皆全釋放） | 每 gesture 恰 1 transition；無 long task >200ms、無累積 owner／overlay、最後仍可操作 | performance trace、counts、final smoke |
| UI-020 | 每 viewport 完成 console/page/request/visible error 與焦點、scroll owner 總檢 | error arrays=0；無 error overlay、焦點陷阱、雙 scroll owner | result.json、final screenshots |

### D. Physical supplemental cases

| Case | 裝置操作 | 通過條件 |
|---|---|---|
| PHY-001 | iPhone Safari：board pinch A↔B、board 外原生 zoom／輔助縮放 | board 手勢正確且未全頁禁縮 |
| PHY-002 | Android Chrome：同 PHY-001 | 行為與 automated contract 一致 |
| PHY-003 | 兩平台各做 pan、quick tap、slow pinch、long-press、active drag＋第二指 | 無雙 owner、誤觸、誤 drop 或 stuck state |
| PHY-004 | 兩平台 portrait／landscape 與 reload preference | 無 body overflow；偏好、錨點與可見控制正確 |

## 量測與 artifact schema

建議輸出：`output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json`，至少包含：

- `baseUrl`、commit／working tree identifier、timestamp、browser／device、viewport、fixture board id（不得含密鑰）。
- 每 case 的 `status`、起始／結束 mode、touch points、`d0`／`d`／ratio、transition count。
- 六組 A／B geometry、各自 B/A ratio、anchor drift、body／board scroll metrics。
- details modal、action rail、drag owner、CTA、visible error 的前後 count。
- disposable board 的可見 task order before／after／reload。
- console errors、page errors、request failures、visible runtime errors、long tasks。
- screenshot／video／trace 路徑與 cleanup 結果。

## Acceptance Traceability

| SPEC acceptance | Primary cases | 必要判定 |
|---|---|---|
| AC-081-01 倍率 | UI-001、UI-003、UI-016 | 六組B/A各2.0～3.0；A baseline相容 |
| AC-081-02 origin matrix／單次切換 | UI-002～UI-005 | 每gesture transition count恰為0或1 |
| AC-081-03 threshold／cancel | UI-005、UI-006、UI-012 | 門檻內、平移、第三指、cancel不得誤切或卡死 |
| AC-081-04 零誤觸／drag cancel | UI-007、UI-008、UI-010 | 無details／rail／CTA／drop／domain write |
| AC-081-05 既有手勢與B drag | UI-009～UI-011 | pan/tap/long-press/drag在A/B皆可用且幾何一致 |
| AC-081-06 anchor | UI-013 | 非edge drift≤24px；edge同欄／task仍可見 |
| AC-081-07 layout／scroll owner | UI-016、UI-020 | body overflow=0；board為唯一水平owner |
| AC-081-08 fallback／persistence／a11y | UI-017 | touch/keyboard/name/state/reload/account scope通過 |
| AC-081-09 protected owner／native zoom | UI-014、UI-015、PHY-001～PHY-003 | 不穿透，不全域禁用原生zoom |
| AC-081-10 negative／errors | UI-018～UI-020 | 非board/desktop無污染；error arrays=0 |

## 通過標準

- `Automated UI PASS`：UI-001～UI-020 全部通過；FMEA P0／P1 無 open failure；六組倍率全為 2.0～3.0；每次 gesture transition count 正確；無錯誤資料提交、誤觸、stuck owner、可見錯誤、body overflow 或座標錯位。
- `Physical Mobile PASS`：PHY-001～PHY-004 在 iPhone Safari 與 Android Chrome 均通過。
- `QA PASS / Release-ready candidate`：Automated UI PASS、Physical Mobile PASS、必要 regression 與 engineering gates 全通過後才可提出；本文件本身不授權 release。
- 若只有 automated evidence：可記 `Automated UI PASS / Physical device pending / 未充分驗證`，不得升格為完整 mobile QA PASS。

## 失敗證據與停止條件

任一 case 失敗時保存第一個可重現失敗的完整 touch trace、前後 screenshot／video、mode timeline、scroll／geometry、可見 task order、error arrays 與 viewport；不得只留文字描述。下列任一情況立刻停止：

- 任務／看板資料非預期變更、錯誤 drop 或 hard reload 後順序不一致。
- pinch 開啟 details、action rail、CTA、drag，或 cancel 後無法操作。
- B 比例超界、body overflow、控制項不可用、錨點／hit-test／overlay 明顯錯位。
- 測試必須使用 store／API／storage／DOM mutation 才能通過。
- console／page／request／visible error 非 0，或 physical browser 與 automated browser 行為分歧。

## QC 執行指示

- QC 依本案例順序獨立重跑，不沿用 QA 已改動的 disposable board。
- 先確認 runtime owner 與 fixture，再執行 automated UI；需要暫時 runtime 時依專案 lifecycle 規則清理並確認 port 狀態。
- QC 必須抽查至少一組原始 CDP multi-touch trace、六組倍率原始 box、active drag＋第二指的 hard reload 證據，以及一台 iPhone／一台 Android 的實機影片。
- 最終報告分開列 `Automated UI`、`Physical Mobile`、`Engineering`、`Spec Drift`、`Runtime cleanup`；任何未執行項目明列 `Not Run`，不可換算成 PASS。

## 本輪實際執行結果

- `npm run verify:dev-081-mobile-kanban-dual-scale-pinch`：PASS（純狀態／契約檢查）。
- `npm run verify:dev-081-mobile-kanban-dual-scale-pinch-browser`：PASS；QA-081-R01～R09 全 PASS，實際 viewport 為 390×844 touch、844×390 touch、1024×768 desktop negative；artifact：`output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json`。
- 未執行：320×844、430×932、touch 1024×768、DEV-029／DEV-054 regression、iPhone Safari、Android Chrome、完整 UI-001～UI-020 matrix；不可標示為完整 mobile QA PASS。
