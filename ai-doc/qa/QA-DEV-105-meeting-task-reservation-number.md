# QA-DEV-105：會議任務討論時間預約數字驗證計畫

- 關聯 DEV：DEV-105、DEV-005、DEV-007、DEV-069、DEV-070
- Authoritative spec：`SPEC-105-meeting-task-reservation-number.md`
- 風險：Medium
- QA 狀態：`QA PASS / Tech Lead Optimized / 10 TC + 5 ROT PASS`
- QC 狀態：`Targeted QC PASS / Evidence Verified`
- Release：未授權

## 1. 驗證目標與證據邊界

驗證active meeting host能從L1／L2／L3+任務的真實右鍵選單，以同一流程直接輸入單一數字，且資料只屬於目前meeting draft與canonical task；各階只有有值時才在due date後顯示，L2精確符合`title → due date → number → toggle`，且不破壞既有任務操作、draft recovery或其他模式。

本計畫只證明官方產品路徑的 host-only：action visibility、execution Guard 與 store owner recheck。既有 provider 沒有 metadata 欄位級 ACL，因此不得從測試結果推論「惡意 client 無法修改」或「RLS／Firestore 已限制只有主持人」。

通過需同時具備：

- 真實右鍵、focus、normal Enter、IME Enter、Escape／outside／scroll取消證據。
- host／non-host、meeting狀態、canonical／tracking與stale target矩陣。
- metadata round-trip、dirty signature、local recovery、cloud checkpoint seam與save／publish readback。
- L1／L2／L3+同一eligibility與顯示規則、exact copy／order、無值DOM=0、1440×900、1024×768與390×844 mobile-negative畫面。
- task menu、card click／drag、record capture、tracking與meeting recovery targeted regression。

## 2. Deterministic fixtures

- users：`host-1`、`member-2`；active meeting draft 的 `recordedBy = host-1`。
- boards：`board-A` active、`board-B` cross-board。
- meeting records：new unsaved stable ID、saved draft、published、missing-recordedBy、unknown metadata schema。
- tasks：
  - L1 `task-l1`；title `後端重構`；date `09/10`。
  - L2 `task-l2`；title `API 權限整理`；date `09/12`；有 child toggle。
  - L3 `task-l3`與L4 `task-l4`；各自有／無date組合。
  - `task-l2` 的 tracking reference；reference ID 與 canonical task ID 不同。
  - archived task、missing task、board-B task。
- values：empty、`1`、`15`、`999`；invalid `0`、`-1`、`1.5`、`1e2`、`+2`、`1000`、全形數字、字母、`NaN`、`Infinity`。
- provider seam：Local Test metadata round-trip；Supabase mapper／checkpoint stub；Firebase explicit metadata passthrough stub。

測試輸出不得包含真實會議內容、token、email或production ID。

## 3. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---:|---|
| non-host仍有action或可寫入 | 只做UI判斷，mutation未重查owner | 多人誤改同一值 | action DOM與direct mutation state diff | P0 | non-host action DOM=0且draft deep-equal；既有mark仍可讀 |
| value寫到TaskNode | 誤把預約視為任務永久屬性 | 下一場會議沿用錯值 | source scan與兩meeting readback | P0 | 兩meeting fixture隔離 |
| tracking使用reference ID | presenter／adapter未正規化target | 正本與副本顯示不同 | metadata key與projection assertion | P0 | canonical projection case |
| signature未含reservation | 只更新metadata helper | F5／離開時遺失 | dirty、snapshot與reload comparison | P0 | recovery round-trip |
| Enter重複送出或誤開詳情 | menu keyboard owner衝突 | 重複寫入／錯誤導航 | dispatch count、activeElement與event trace | P0 | IME／normal Enter成對測試 |
| invalid被寬鬆轉型 | 使用`Number()`或number input | 顯示錯誤值 | invalid matrix與command count | P0 | ASCII parser contract |
| stale menu仍提交 | 只信事件當下snapshot | 寫錯meeting／task | 切換meeting／target後提交 | P0 | execution Guard與store重查 |
| 某階未接入或邏輯分歧 | renderer各自判斷eligibility／copy | L1／L2／L3+行為不一致 | 三surface action、DOM與style matrix | P1 | 共用profile、selector與mark component |
| 無值仍有badge／gap | 空容器持續render | 密度與對齊破壞 | DOM count、height與geometry diff | P1 | 各階empty case |
| mark排序或文案錯誤 | presenter slot責任不清 | 違反確認版面 | element x-order與visible copy scan | P1 | 各階date後mark；L2完整順序 |
| recovery/provider錯誤冒充成功 | 把draft mark當同步狀態 | 使用者誤判保存 | error seam、request/readback | P1 | 無success indicator且保留既有error |
| shared tree洩漏到Details | Board adapter邊界失效 | 非範圍UI出現預約值 | Details DOM與action golden set | P1 | 只有KanbanChecklist注入reservation map |
| 長標題造成換行或遮擋 | metadata不可shrink、title未截斷 | header／card／row高度改變 | 1440／1024 geometry assertions | P1 | 三階長標題rendered case |

## 4. Automated contract cases

| ID | Priority | 類型 | 步驟／Expected |
|---|---:|---|---|
| TC-105-01 | P0 | Pure metadata | parser只接受ASCII `1..999`；empty→clear；invalid全拒絕。read／set／clear保留其他namespace；unknown schema fail closed；最後一筆清除移除namespace。 |
| TC-105-02 | P0 | Signature | reservation依task ID穩定排序；value變更使draft dirty；相同內容不同insertion order不dirty。 |
| TC-105-03 | P0 | Store／Guard | host可新增、覆寫、清除；相同值noop。non-host、missing owner、non-meeting、published與invalid全部denied且draft deep-equal。 |
| TC-105-04 | P0 | Target | missing、archived、cross-board、stale meeting／task全部拒絕；tracking adapter只傳canonical task ID。 |
| TC-105-05 | P0 | Kernel | `task.edit-meeting-reservation` defaultMenu=false；同一overlay只在active meeting的`board.column-header`／`board.card`／`board.checklist-row`出現；Details與其他模式action set不變。 |
| TC-105-06 | P0 | Menu | 點action立即focus/select existing；IME Enter不提交；normal Enter只commit一次；Escape／outside／scroll／target switch取消。 |
| TC-105-07 | P0 | Invalid／Failure | invalid顯示`請輸入 1–999 的整數`且command=0；denied／exception保留editor與draft，不顯示false success。 |
| TC-105-08 | P1 | Render／Projection | L1／L2／L3+無值mark DOM=0；有值時由單一無框亮黃色底黑字 token 顯示純數字且`15`可見文字精確為`15`，不得有圖示或`[]`；primary與tracking同值；Details DOM=0。 |
| TC-105-09 | P0 | Recovery／Provider | commit後dirty=true；約500 ms local snapshot、F5 restore、約20 s checkpoint seam、save／publish readback均保留namespace；三provider mapper不需schema request。 |
| TC-105-10 | P0 | Regression | card click、真實right-click、drag、record capture、date、tags、toggle、task details、tracking與既有menu golden set維持。 |

## 5. Rendered operation cases

| ID | Viewport | 操作與可見證據 |
|---|---|---|
| ROT-105-01 | 1440×900 | host真實右鍵→「預約時間」→input autofocus→輸入15→Enter；卡片呈現無框亮黃色底黑字純數字 token＋`API 權限整理   09/12 15 ▸`，可見數字字串精確為`15`且無圖示與`[]`。 |
| ROT-105-02 | 1024×768 | 同一畫面含L1／L2／L3+長標題、日期、純數字 token 與`999`；各階title截斷、mark在date後，header／card／row高度不增加且元素不遮擋。 |
| ROT-105-03 | 1440×900 | member查看同一active meeting時三階既有mark可見但action DOM=0；published與missing owner不可寫，Details與其他模式無action／mark；direct mutation均denied。 |
| ROT-105-04 | 1440×900 | invalid保留menu與focus；IME Enter不送出；Escape、outside、scroll與target switch均不改draft；editor展開後仍在viewport。 |
| ROT-105-05 | 390×844 | 依SPEC-069正常入口無meeting mode，因此無action、editor與mark；不得只靠CSS隱藏。 |

Rendered evidence 必須來自實際產品 UI 與真實事件；不得用靜態HTML、DOM注入、人工改store或只截元件故事替代。

## 6. 最小驗證命令

新增 verifier 後，依序執行：

```powershell
npm run verify:dev-105-meeting-task-reservation-number
npm run verify:dev-105-meeting-task-reservation-number-browser
npm run verify:dev-002-records
npm run verify:dev-007-meeting-activity
npm run verify:dev-028-cross-mode-task-interactions
npm run verify:dev-029-mobile-pan-first-interactions
npm run verify:dev-069-meeting-draft-recovery
npm run verify:dev-070-interaction-kernel
npm run verify:dev-070-interaction-kernel-browser
npm run verify:dev-095-task-tracking-interaction-parity
npm run build:test
```

若任一 targeted command 失敗，先判定與DEV-105的因果關係，不可以大範圍測試通過掩蓋 targeted failure。沒有執行的命令一律記為 `NOT RUN`。

## 7. Evidence contract

最低 artifacts：

- `output/qa/dev-105/result.json`
- `output/playwright/dev-105/result.json`
- `output/playwright/dev-105/desktop-board-hierarchy.png`
- `output/playwright/dev-105/tablet-long-title.png`
- `output/playwright/dev-105/mobile-meeting-negative.png`

每個 machine-readable result 至少包含：commit／working-tree identity、command、exit code、assertion count、case IDs、viewport、duration、failure detail、artifact path、`qaStatus`與`releaseStatus`。Screenshot 必須能追溯到對應case，不得單獨作為PASS證據。

## 8. 實際執行結果

### 8.1 DEV-105 gates

| Gate | Command | 結果 | Evidence |
|---|---|---|---|
| Pure／source contract | `npm run verify:dev-105-meeting-task-reservation-number` | PASS，TC-105-01～10 10/10 | `output/qa/dev-105/result.json` |
| Rendered operation | `npm run verify:dev-105-meeting-task-reservation-number-browser` | PASS，ROT-105-01～05 5/5；diagnostics／HTTP failures皆為0 | `output/playwright/dev-105/result.json` |
| TypeScript | `npx tsc --noEmit` | PASS，exit 0 | command output |
| Test build | `npm run build:test` | PASS，exit 0；僅既有 chunk／Browserslist warning | `dist/` build output |
| Diff hygiene | `git diff --check` | PASS，exit 0 | command output |

### 8.2 Targeted regression gates

| DEV | 結果 |
|---|---|
| DEV-002 | PASS，16 file groups |
| DEV-007 | PASS，5 file groups；驗證器已同步目前 `TaskChecklistTree` adapter 契約 |
| DEV-028 | PASS，48/48 |
| DEV-029 | PASS，42/42；驗證器已同步共用 `useTaskPlacementController`／presentation 邊界 |
| DEV-069 | PASS，local recovery／checkpoint／mobile boundary |
| DEV-070 | PASS，58/58；重新產出完整 after interaction matrix |
| DEV-095 | PASS，S07～S10 4/4 |

DEV-105 browser 的三張畫面已實際目視抽查：`desktop-board-hierarchy.png` 確認L1／L2／L3+與tracking以同一時間膠囊 token 顯示純數字且無圖示；`tablet-long-title.png`確認1024px不換行／不溢出；`mobile-meeting-negative.png`確認390px沒有meeting入口、editor或mark。所有 rendered case 均使用實際右鍵、鍵盤與viewport事件，沒有以靜態HTML或直接store mutation代替。

## 9. Exit criteria 與目前狀態

QA PASS 必須符合：

- TC-105-01～10全通過，P0為零失敗。
- ROT-105-01～05全通過，畫面與Human Decision一致。
- product-path host-only、canonical identity、recovery與provider readback均有證據。
- technical debt如實揭露，不宣稱欄位級server ACL。
- build與targeted regressions通過，且沒有新增schema／migration／provider branch。

目前狀態：`QA PASS`。TC-105-01～10與ROT-105-01～05均通過，targeted regressions、TypeScript、test build與diff hygiene均通過；本文件仍不構成QC或Release核准。

限制：本輪證明 local-test 官方產品路徑與 source/provider metadata passthrough contract；未執行正式 Supabase／Firestore L3、惡意 client 欄位級 ACL、production mutation、deploy或release。provider record-level write policy 的欄位級 ACL技術債依規格保留，不能由本地 QA 外推為 server security。

使用思考習慣：#問對問題、#多層次分析、#可驗證性
