# QA-DEV-027A: Xmind-like connector line and drag interaction visual validation

日期：2026-06-18
狀態：Browser QC Passed
對應 DEV：DEV-027
缺陷來源：使用者截圖 `codex-clipboard-56314e2e-6fc6-427b-b0b4-c87cb1587b78.png`

## QA 結論

目前心智圖連線視覺不合格。使用者截圖顯示多處 branch line 只剩孤立水平短線、父子節點之間沒有連續路徑、左右兩側樹狀分支的 trunk 與 sub-branch 未形成可讀拓撲。使用者本輪又新增拖曳互動要求：拖動任務時必須有任務變化的即時預覽動畫，且任務可被拖動到同一側。這些都不是美觀偏好，而是 Xmind-like 心智圖的核心 UI 失效；DEV-027 的 QC 必須 reopen。

本 QA 計畫要求 RD 修復後，用真實瀏覽器畫面、截圖、DOM/SVG geometry、pointer drag evidence 與 side placement metadata 同時驗證，不得只用 lint、build、「data-mindmap-connector 存在」或 drop 後結果宣告通過。

## 嚴厲 UI 驗證原則

本輪 QA 採「肉眼可見問題即 Fail」原則。只要使用者能在正常工作距離下看出線條斷裂、節點關係不明、拖曳結果不可預測、同側拖放失效、文字重疊或 viewport 破版，即使自動化測試全部通過，QC 仍必須判定 Fail。

不可接受的通過理由：
- 「功能可用」但線條仍破碎。
- 「DOM 有 connector path」但截圖看起來仍像孤立短線。
- 「拖曳後資料有更新」但拖曳中沒有即時預覽動畫。
- 「桌機看起來可以」但 laptop 或 mobile viewport 斷線、遮擋、不可拖曳或不可判讀。
- 「只差一點視覺」但使用者仍需靠任務名稱猜父子階層。
- 「Xmind-like 不必一模一樣」但已偏離 Xmind 的基本心智圖操作心智模型。

QC 不得以 lint、typecheck、build、static verifier、RD 自述或單一 happy path screenshot 取代 UI 驗證。UI 驗證必須同時包含 rendered surface、viewport、截圖、互動步驟、geometry / metadata 證據與 fail gate 判斷。

## Xmind UI 樣式理解

資料來源：
- Xmind Topic guide：`https://xmind.com/user-guide/topic-editing-new`
- Xmind Branch guide：`https://xmind.app/user-guide/xmind/branch-new/`
- Xmind Skeleton guide：`https://xmind.com/user-guide/skeleton-new`
- Xmind Sheet / format guide：`https://xmind.app/user-guide/xmind/sheet-new/`

QA 擷取的樣式原則：
- Topic 是心智圖的基本元素；Xmind 區分 central topic、main topic、subtopic、floating topic、summary topic。
- Branch 是從中心概念延伸出的可視路徑；main branches 可再分為 sub-branches。
- Xmind topic 編輯支援透過 drag and drop 調整 topic hierarchy；因此 ProJED 的拖曳過程必須讓使用者在 mouseup 前看懂預期 hierarchy / side 變化。
- Xmind 的 branch style 不只是線存在，還包含 line shape、line thickness、colored branch、line tapering 等視覺屬性。
- Skeleton 會統一結構、topic shape、line shape，目的是讓整張圖具備 visual coherence。
- Xmind 提供 Mind Map、Logic Chart、Org Chart、Tree Chart 等結構。ProJED DEV-027 目前採中心主題向左右延伸的 mind-map / tree-like hybrid，因此 connector 必須同時滿足 radial center-to-main continuity 與 parent-to-child tree continuity。

## 使用者截圖缺陷分析

截圖中可見問題：
- 多個子節點右側或左側只有水平短線，沒有接回父節點或垂直 trunk。
- 左側分支 `QC task 5 / 6 / 3` 的父子關係視覺斷裂，使用者無法靠線條追蹤 hierarchy。
- 右側 `QC task 1 / QC task 2` 的子節點群只顯示孤立 connector stub，parent-to-child continuity 不成立。
- 中心主題到部分 main topic 的連線缺失或過淡，整體拓撲讀起來像散落卡片。
- 線條有延伸到畫面邊界之外的片段，代表 connector 不是依實際節點 bounding box 計算。
- 目前拖曳互動若只在 drop 後更新階層，使用者無法像 Xmind 一樣於拖動途中預判任務會移到哪個 parent、哪個 sibling 位置或哪一側。
- 目前 root branch 若被演算法固定拆成左右兩側，無法支援使用者將多個主要任務集中到同一側做工作計畫整理。

Hard fail 條件：
- 任一可見 parent-child pair 沒有連續 connector path。
- 任一 connector line 只連到空白，不連到節點邊界或 trunk。
- 任一 connector 被節點遮擋到無法判斷父子關係。
- 任一 connector 穿過節點文字或互動區。
- 任一 screenshot 中使用者需要靠節點命名排序才能推測 hierarchy，而不是靠線條理解。
- 拖曳途中只有瀏覽器原生 ghost、沒有 ProJED 自己的 animated preview 或 drop result preview。
- root branch drop 到指定側後，被 root index parity 或重排演算法強制移回另一側。

## 驗證目標

RD 修復後，ProJED 心智圖需要達到以下 Xmind-like 基準：
- 中心主題到每個 root branch 有連續線條。
- parent branch 到每個 child branch 有連續線條。
- 多個 siblings 必須共用可讀 trunk 或等效曲線，不可出現孤立短線。
- 左側 branch 與右側 branch 的線條方向相反但規則一致。
- connector 的端點必須貼近 topic card 邊界，不可從任意空白處開始或結束。
- connector 使用低干擾色彩與穩定線寬，與節點 shadow、border 協調。
- 節點 selected、hover、editing、drag-over 狀態不得破壞 connector continuity。
- 拖曳時即時顯示 Xmind-like preview：節點、connector、預期 parent / sibling / side 需在 pointer move 時連續更新。
- 多個 root branches 可位於同一側，且同側布局在 drop、reload、模式切換或 layout recompute 後不被強制打回左右平均。

## Zero-Tolerance UI Fail Gates

以下任一項出現即 Fail，不進入「可接受小瑕疵」討論：

| Gate | Fail 條件 | 必要證據 |
|---|---|---|
| ZT-001 | 任一可見 parent-child pair 無法沿 connector 追溯父子關係 | 標註節點對的 screenshot + DOM node ids |
| ZT-002 | viewport 內存在長度 > 12px 的孤立 connector segment | screenshot + path bbox / endpoint metadata |
| ZT-003 | connector endpoint 距離來源或目標 node edge 超過 6px，且未接到共同 trunk | node bbox + path endpoint distance |
| ZT-004 | connector 穿過任務文字、展開按鈕、input、drag handle 或主要 hit target | overlay screenshot + element bbox |
| ZT-005 | 拖曳過程中只有瀏覽器原生 ghost，沒有 ProJED 自己的 animated preview / connector preview | 拖曳中截圖序列或影片 |
| ZT-006 | preview 顯示的 parent / sibling / side 與 drop 後實際結果不一致 | pre-drop metadata + post-drop metadata |
| ZT-007 | root branch 無法被放到同一側，或 drop 後被固定演算法拆回左右兩側 | 同側 drop 前後 screenshot + side metadata |
| ZT-008 | hard reload、模式切換或 resize 後，connector 錯位、殘留或同側布局消失 | before/after screenshot + reload/mode-switch step |
| ZT-009 | 1440x900、1024x768、390x844 任一 viewport 中，節點重疊、文字裁切到不可讀、toolbar/sidebar 遮住主要操作 | viewport screenshot + bbox check |
| ZT-010 | visible error sweep 出現 `.inline-error`、`[role=alert]`、`HTTP 4xx/5xx`、`Not Found`、`Internal Server Error`、`TypeError` 或 `ReferenceError` | screenshot / console / DOM evidence |

## 量測門檻

RD 與 QC 的自動化或手動量測至少需覆蓋：

- `endpointToNodeEdgeDistance <= 6px`；超過即 Fail，除非 endpoint 明確接到共同 trunk，且 trunk 再接到 node。
- `orphanVisibleSegmentLength <= 12px`；超過即 Fail。
- `connectorTextOverlapArea === 0`；線條不可穿過文字 bbox。
- `nodeNodeOverlapArea === 0`；同層或跨層節點不可互相覆蓋。
- `previewFrameCount >= 3`；拖曳驗證需至少有 drag start、drag hover、pre-drop 三個不同 preview frame 或等效 DOM state。
- `previewPositionChanged === true`；pointer move 後 preview node bbox 或 connector path 必須改變。
- `sameSideRootCount >= 2`；同側拖放驗證需證明至少兩個 root branches 在同一 side。
- `sideStableAfterReload === true` 或 RD 提供等效可驗證設計；否則 Fail。
- `viewportScreenshots.length >= 3`；至少 desktop、laptop、mobile 三種 viewport。

## Acceptance Criteria

| ID | 驗證項 | Pass 標準 | Fail 標準 |
|---|---|---|---|
| UX-027A-001 | center-to-main connector | 每個 root branch 與中心主題之間有連續可見 path | root branch 與中心主題之間只有空白或孤立短線 |
| UX-027A-002 | parent-to-child connector | 每個 child branch 可沿線追溯到 parent branch | child 只出現短 stub，無法追溯 parent |
| UX-027A-003 | sibling trunk | 同一 parent 下的 2 個以上 children 共用 trunk 或等效曲線群 | children 各自散落，線條彼此不相交也不接 parent |
| UX-027A-004 | endpoint anchoring | connector endpoint 距離相關 node bounding box 邊界 <= 6px | endpoint 落在空白、超出畫布、或距離節點過遠 |
| UX-027A-005 | no text crossing | connector 不穿過任務名稱、button、select、input | 線條穿過文字或可點擊區 |
| UX-027A-006 | no orphan segment | viewport 內不存在長度 > 12px 的孤立線段 | 線段沒有 parent、child 或 trunk attachment |
| UX-027A-007 | symmetric direction | 左側與右側分支方向相反但 geometry 規則一致 | 左右連線規則不同造成 hierarchy 判讀混亂 |
| UX-027A-008 | responsive continuity | 1440x900、1024x768、390x844 都維持可追蹤連線 | 任一 viewport 下 connector 斷裂或被 sidebar/toolbar 遮蔽 |
| UX-027A-009 | interaction continuity | selected、hover、editing、drag-over 後線條仍連續 | 狀態改變造成線消失、錯位或殘影 |
| UX-027A-010 | screenshot match | 視覺接近 Xmind-like branch topology，不要求品牌細節一比一 | 卡片散落感強，線條無法承擔資訊結構 |
| UX-027A-011 | drag preview animation | 拖曳任務時，節點與 connector preview 會隨 pointer move 即時動畫更新 | 拖曳中只有原生 ghost、靜態 highlight，或 drop 後才突然重排 |
| UX-027A-012 | pre-drop hierarchy preview | mouseup 前可辨識預期 parent、sibling before/after 與 insertion position | 使用者只能放開後才知道任務被移到哪裡 |
| UX-027A-013 | same-side root drop | root branch 可拖到左側或右側，且多個 root branches 可保留在同一側 | root branch 被 index parity 強制平均拆成左右兩側 |
| UX-027A-014 | same-side connector recompute | 同側 root branches 的 center connector、root trunk 與 child connector 仍連續 | 同側後 connector 交錯、斷裂、穿過節點或殘留舊線 |
| UX-027A-015 | side persistence | reload、模式切換或 layout recompute 後，使用者 side placement 意圖仍被保留或有等效可驗證設計 | 同側 drop 完成後一重算就回到固定左右分配 |

## 測試資料

至少建立以下固定資料，避免只測 1 層節點：
- Center：active board title。
- Right root：`QC task 1`，children：`QC task 1.1`、`QC task 1.2`、`QC task 1.3`，grandchild：`QC task 1.1.1`。
- Right root：`QC task 2`，children：`QC task 2.1`、`QC task 2.2`、`QC task 2.3`。
- Left root：`QC task 3`，children：`QC task 3.1`、`QC task 3.2`，grandchild：`QC task 3.1.1`。
- Left root：`QC task 5`，child：`QC task 5.1`，grandchild：`QC task 5.1.1`。
- Left root：`QC task 6`，child：`QC task 6.1`，grandchild：`QC task 6.1.1`。
- Single root：`XXX`，用來驗證單節點 connector 不產生多餘 trunk。

## Manual UI Test Matrix

| Case | Viewport | 操作 | 必要證據 |
|---|---|---|---|
| UI-027A-001 | 1440x900 | 開啟心智圖，置中到 active board | full-page screenshot、connector overlay screenshot |
| UI-027A-002 | 1440x900 | 展開所有 branch | parent-child pair checklist、無 orphan line screenshot |
| UI-027A-003 | 1440x900 | 收合 `QC task 1` 後再展開 | 收合時子分支線消失；展開後線條回到正確位置 |
| UI-027A-004 | 1440x900 | 選取、hover、F2 編輯 `QC task 1.2` | selected/editing 狀態不破壞 connector |
| UI-027A-005 | 1440x900 | 拖曳 `QC task 2.3` 到 `QC task 1` 底下 | 拖曳後 connector 重新接到新 parent |
| UI-027A-006 | 1024x768 | hard reload 後開啟心智圖 | laptop viewport 無斷線、無重疊 |
| UI-027A-007 | 390x844 | 收合 sidebar，水平捲動左右分支 | mobile viewport 分支線可追蹤，不被 toolbar/sidebar 遮住 |
| UI-027A-008 | 1440x900 | 開啟 viewer 角色 | read-only badge 不遮住 connector，禁用狀態不改變線條 |
| UI-027A-009 | 1440x900 | 拖曳 `QC task 2.3` 到 `QC task 1` 底下，拖曳途中停留 300ms | 截圖序列或錄影顯示節點/connector preview 即時動畫與預期 parent |
| UI-027A-010 | 1440x900 | 將 `QC task 1` 拖到與 `QC task 2` 同一側 | drop 後兩個 root branches 留在同一側，connector 重新計算且無斷線 |
| UI-027A-011 | 1440x900 | 同側 drop 後切到清單再回心智圖，或 hard reload | 同側布局意圖仍保留，未被固定左右平均重排 |
| UI-027A-012 | 1024x768 / 390x844 | 在窄 viewport 中拖曳 root branch 到同側 | preview 不被 toolbar/sidebar 遮蔽；drop 後可水平瀏覽並看懂連線 |
| UI-027A-013 | 1440x900 | 開啟所有分支後用 5 秒視覺掃描判讀 `QC task 1.1.1`、`QC task 5.1.1`、`QC task 6.1.1` 的 parent chain | 不看資料表、不看 DOM，只靠畫面線條可判讀 parent chain；任一 chain 需猜測即 Fail |
| UI-027A-014 | 1440x900 | 拖曳中快速穿過 3 個候選 drop target | preview 必須跟著切換 target，不可殘留上一個 target 的 connector 或 ghost |
| UI-027A-015 | 1024x768 | resize 後立即收合 / 展開 `QC task 1` | connector 不錯位、不殘留、不跳到舊座標 |
| UI-027A-016 | 390x844 | mobile 中水平捲動到左右兩端後各截圖一次 | 任一端不得出現孤立短線、文字與 connector 重疊或不可操作節點 |

## Automated QC Requirement

RD 修復後必須新增或擴充 browser verifier，不能只保留現有 smoke。

建議新增：

```powershell
npm.cmd run verify:dev-027-xmind-connector-lines-browser
npm.cmd run verify:dev-027-xmind-drag-preview-browser
```

最低自動化檢查：
- 每個 `data-mindmap-node` 有可追蹤的 `data-mindmap-connector-path` 或等效 SVG path metadata。
- connector metadata 必須包含 `fromNodeId`、`toNodeId`、`depth`、`direction`。
- 以 `getBoundingClientRect()` 驗證 path endpoint 與 source/target node edge 距離。
- 驗證不存在孤立 connector：沒有 `from`/`to` metadata 或 endpoint 不貼近任何 node 的 path 必須 fail。
- 對 `1440x900`、`1024x768`、`390x844` 都輸出 screenshot 到 `output/playwright/`。
- pointer drag 過程中必須能偵測 preview element，例如 `data-mindmap-drag-preview`、`data-mindmap-drop-preview` 或等效 metadata。
- preview metadata 必須揭露預期 `targetParentId`、`siblingBeforeId` / `siblingAfterId`、`dropPosition`、`direction` 或等效資訊。
- drag preview 的 bounding box / SVG preview path 必須在 pointer move 後改變，不能只在 drop 後一次性重排。
- same-side drop 後至少兩個 root branches 的 `data-mindmap-branch-direction` 或等效 side state 相同。
- 模式切換或 reload 後，同側 root branches 不得被強制拆回左右兩側；若 RD 採非持久化設計，必須提供等效 deterministic rule 與 verifier。
- visible error sweep：不得有 `.inline-error`、`[role=alert]`、`Internal Server Error`、`Not Found`、`HTTP 4xx/5xx`、`TypeError`、`ReferenceError`。

Browser verifier 必須在失敗時輸出可除錯證據：
- `output/playwright/dev-027A-connector-desktop.png`
- `output/playwright/dev-027A-connector-laptop.png`
- `output/playwright/dev-027A-connector-mobile.png`
- `output/playwright/dev-027A-drag-preview-sequence/`，至少包含 drag start、hover target、pre-drop、post-drop。
- geometry evidence，包含 node bbox、path endpoint、distance、overlap、side metadata、preview metadata；可用 persisted JSON、run-code structured return payload，或 verifier 失敗時的 structured error details 表達。

Verifier 若只回傳 `ok: true/false`、沒有截圖與 geometry evidence，視為未充分驗證。

## UI FMEA

| Failure Mode | 影響 | 偵測方式 | 嚴重度 | RD 防治要求 |
|---|---|---|---|---|
| connector 由每個 node 自己畫局部線 | 兄弟節點無共同 trunk，產生斷線 | screenshot + endpoint geometry | High | 改用整張 map 的 SVG overlay 或集中 layout engine |
| 只用 CSS absolute short line | 線段無法跨層連接 | orphan segment detector | High | path 必須由 parent/child bounding boxes 計算 |
| connector 被 node shadow 或 z-index 蓋住 | hierarchy 不可讀 | visual sweep | Medium | 線層固定在 node 下方、canvas 上方 |
| resize / scroll 後未重算線條 | viewport 下錯位 | 1024/mobile reload + scroll | High | ResizeObserver / layout recompute |
| collapse 展開後殘留舊線 | 使用者看到不存在的關係 | fold/unfold test | High | connector 資料由 visible tree derive |
| drag 後 connector 未更新 | WBS 關係與視覺不一致 | drag hierarchy test | High | updateNode 後重算 geometry |
| left/right 演算法不一致 | 左側 branch 特別破碎 | symmetry checklist | Medium | direction-aware path helper 共用同一套規則 |
| 拖曳中沒有即時預覽 | 使用者無法預判 drop 結果，與 Xmind 操作肌肉記憶不符 | pointer drag screenshot sequence / DOM metadata | High | drag state 必須驅動 animated preview node + connector |
| root branch 被固定平均左右分配 | 使用者無法把相關任務集中同側規劃 | same-side drop + reload test | High | side placement 必須由使用者 drop 意圖或可驗證 layout state 決定 |
| preview connector 與 drop 後 connector 不一致 | 使用者看到的預期結果與實際結果不同 | pre-drop vs post-drop geometry diff | High | preview 與 final layout 共用同一套 geometry helper |
| 截圖證據太簡單 | 3 節點 smoke 掩蓋複雜樹狀斷線 | fixture coverage audit | High | 必須使用與使用者截圖同等複雜度 fixture |
| UI 通過被自動化誤判 | selector 存在但畫面不可讀 | visual hard gate + manual scan | High | QC 必須做肉眼掃描與 bbox 證據交叉驗證 |
| mobile 只驗可開啟 | mobile 可開但不可操作或不可讀 | 390x844 drag + scroll evidence | High | mobile 必須驗可讀、可捲動、可選取、可拖曳或明確降級 |

## 必交 UI 證據包

RD 送 QC 前必須提交以下證據；缺任一項，QC 判定 `未充分驗證`：

- `before`：使用者缺陷同等複雜度 fixture 的修復前或重現截圖。
- `after-desktop`：1440x900 展開全部分支的完整截圖。
- `after-laptop`：1024x768 hard reload 後截圖。
- `after-mobile`：390x844 sidebar 收合、水平捲動後截圖。
- `connector-overlay`：顯示 node bbox、connector endpoint、trunk、parent-child pair 的 overlay 或 geometry JSON。
- `drag-sequence`：拖曳開始、拖曳中 hover target、pre-drop、post-drop 的截圖序列或影片。
- `same-side-proof`：至少兩個 root branches 同側的截圖與 side metadata。
- `persistence-proof`：同側 drop 後 reload 或 mode switch，再次截圖證明 side 沒被重排。
- `visible-error-sweep`：三個 viewport 的 visible error / console / network 掃描結果。
- `manual-5-second-scan`：QC 肉眼確認 5 秒內可判讀 parent chain 的結果紀錄。

## QC Handoff Gate

QA 交付 QC 前，RD 必須提供：
- 修復摘要：連線渲染策略、layout 計算方式、resize/scroll/collapse/drag 重算機制。
- 修復摘要：drag preview animation、same-side placement、side persistence 或等效 deterministic side layout 設計。
- 自動化證據：connector browser verifier pass、drag preview / same-side browser verifier pass。
- 截圖證據：desktop、laptop、mobile 三種 viewport。
- 拖曳證據：至少一組拖曳中、drop 前、drop 後的截圖序列或影片，證明 preview 不是 drop 後才出現。
- 同側證據：至少兩個 root branches 同側、reload / mode switch 後仍同側的 screenshot 或 DOM metadata。
- 視覺證據：至少一張與使用者截圖同等複雜度的 fixture，不得只用 3 個節點。
- Git evidence：修復檔案與 QA/QC 文件已暫存或 commit。

QC 判定：
- 只要再出現使用者截圖中的孤立短線、斷裂 trunk、父子線無法追蹤，即 Fail。
- 若自動化通過但截圖仍肉眼可見斷線，仍 Fail。
- 若只修 desktop、不修 390x844 mobile，仍 Fail。
- 若 connector 修好但拖曳沒有即時 preview animation，仍 Fail。
- 若拖曳 root branch 仍只能被固定分配到左右兩側，無法同側保留，仍 Fail。
- 若缺少必交 UI 證據包，判定 `未充分驗證`，不得判 Pass。
- 若 QA/QC 結論與使用者當前可見畫面衝突，以使用者可見畫面為準，立即 reopen。
