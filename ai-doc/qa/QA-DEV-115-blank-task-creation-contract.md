# QA-DEV-115：空白任務建立契約驗證計畫與結果

- 日期：2026-09-10
- 狀態：`Executed / DEV-115 targeted PASS / Tech Lead Optimized / NOT RELEASED`
- 對應 DEV：DEV-115
- 對應 CAPA：CAPA-002
- 對應 SPEC：`ai-doc/specs/SPEC-115-blank-task-creation-contract.md`
- Architecture：`ADR-048 Accepted / Architecture Confirmed`
- 風險：Medium

## 1. 驗證目標與範圍

驗證 7 個檔案中的 11 個已知 blank-create constructors 都改走 shared factory，且任何 blank output 都沒有 own
`description` property；工作台原始缺陷須以正常入口完成 store、重新載入與 UI readback。其他模式只驗本次可能
改壞的 adapter input 與代表性 UI 整合，不重複執行相同的完整生命週期。

capture、clone、import、restore 是 source-derived flows，只做相容回歸。本期不改畫面、hover 元件、資料模型、
permission 或 interaction kernel，因此不做視覺重設計，也不把完整 DEV-111／114 browser suite 當成必要 Gate。

## 2. 證據分層

| Layer | 要證明的事 | 適用範圍 | 不可替代 |
|---|---|---|---|
| L1 Pure/type | factory defaults、time、explicit field pick、description absent | factory | 不能證明入口可操作或持久化 |
| L2 Source/adapter | 11/11 已知 constructors 接 factory；caller-owned ID/placement/nodeType/permission/post-create 未漂移 | 全 11 點 | 不能取代原始缺陷的 browser readback |
| L3 Browser/data | 正常入口、store、reload、detail、rename、hover negative、visible error | 原始缺陷＋高風險代表入口 | 不能用其他模式成功推定全部 source 已遷移 |
| L4 Compatible regression | capture/duplicate/import/restore 與既有 workbench/hover contracts | source-derived 與相鄰契約 | 不擴張成正式環境驗證 |

## 3. Entry Criteria 與 candidate freeze

- [x] SPEC-115 已達 `RD Implementation Ready / Architecture Confirmed`，架構 P0／P1 blocker = 0。
- [x] CAPA-002 已確認 root cause、CA／PA 與歷史資料邊界。
- [x] RD 完成 WP-115-1／2，11-entry manifest、TypeScript 與 protected-boundary review 通過。
- [x] candidate 記錄 HEAD、DEV-115 變更檔案與 hash；重疊的 user-owned dirty changes 已辨識且未被覆寫。
- [x] local-test actor、workspace、board 與 unique-prefix fixture 可使用。

只有 Entry Criteria 全部滿足才執行 final browser run。candidate freeze 後若產品 source 改變，只重跑受影響層；
若 factory 或 constructor contract 改變，L1～L4 全部重開。

## 4. UI Entry Contract

| 表面 | Actor／起始狀態 | 正常入口 | 本期 oracle |
|---|---|---|---|
| 工作台未歸位 | 已登入 owner/editor、有 active workspace | App shell → 全域任務工作台 → 未歸位 lane → `[data-task-workbench-unclassified-modal-add="true"]` | title=`新任務`；`[data-task-detail-note-content-input="true"]` 空白；reload 後仍空白 |
| Board／List | owner/editor、有 active board | 各模式既有 root 新增控制 | root、`group`、order、naming 不變；新 task description absent |
| Shared sidebar | owner/editor、Gantt／Calendar | 共用側欄既有 root／child 新增控制 | host mode 可操作；root/child placement 與 description invariant 正確 |
| Context／TaskDetails | owner/editor、有既有 task | context menu child/sibling；TaskDetails 子任務新增 | parent/order/nodeType、menu/details navigation 與 description invariant 正確 |
| Mobile rail | owner/editor、390×844、有 selected task | 既有 sibling／child action | commit result、placement、detail readback 正確；不新增 hover 行為 |
| MindMap | owner/editor、MindMap mode | 既有 root／child command | selection/title edit、parent/order 與 description invariant 正確 |

不得以直接 mount、手工插 DOM、跳過 permission guard 或直接呼叫 `addNode()` 取代正常入口。入口不可達時，記錄
route、actor、viewport 與原因並判定 Fail／Blocked，不得用 source assertion 冒充 UI PASS。

## 5. Fixture

| Fixture | 必要資料 | 用途 |
|---|---|---|
| F01 | default、whitespace、explicit title 與 fixed `now` | factory boundary |
| F02 | 每個 browser-created task 使用唯一 `DEV115-*` prefix 並記錄 created ID | readback 與安全 cleanup |
| F03 | root group、child task、completed/collapsed parent | placement 與 post-create compatibility |
| F04 | owner/editor 與 no-create actor | permission positive／negative |
| F05 | Inbox 有 note、無 note但有 title；另有非空 source description 的 duplicate/import/restore fixture | source-derived regression |

清理只能使用本次 artifact 記錄的 created IDs；不得以 title 或 prefix 做未經 readback 的廣域刪除。

## 6. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| description 仍被預填 | helper 遺留 assignment／spread input | 假說明持久化並觸發 hover | P01～P03、B01 reload | P0 | explicit field pick＋own-property assertion |
| constructor 漏遷移 | manifest 不完整或新增 bypass | 不同模式再次漂移 | S01、repo heuristic review | P0 | 11/11 known manifest；heuristic 命中逐筆分類 |
| placement／nodeType 漂移 | factory 接管 mode policy | 任務出現在錯層或型別錯誤 | S02、B02～B05 | P0 | caller 明確傳值，對照 baseline expression |
| source content 被清空 | source-derived flow 誤接 blank factory | 使用者內容遺失 | S03、R04 | P0 | creation-kind boundary guard |
| permission／post-create 回歸 | 遷移時移動 guard 或 handler | 未授權建立、焦點／導覽錯誤 | S02、B02～B06 | P1 | handler 前後契約與代表 UI smoke |
| UI 看似成功但資料錯誤 | 只驗 DOM／placeholder | reload 後再次出錯 | B01 store＋reload＋detail | P0 | 原始入口完整 delivery-path evidence |

## 7. Pure、source 與 adapter cases

| Case | 驗證 |
|---|---|
| P01 | default／whitespace title fallback=`新任務`；explicit title trim；fixed `now` 同時寫 createdAt／updatedAt |
| P02 | output 只含明列欄位；即使 runtime input 經 `any` 帶入 description，也不會被 spread 到 output |
| P03 | input type 明列 `description?: never`；所有 production call sites 通過 `tsc --noEmit` |
| S01 | baseline manifest 恰為 11 點／7 檔且全部呼叫 shared factory；repo heuristic 無未分類 blank constructor |
| S02 | 每一點的 ID、workspace/board、parent、order、nodeType、permission guard 與 post-create expression 未漂移 |
| S03 | capture、duplicate、import/backup、restore 不 import blank factory；既有 description mapping 保留 |
| S04 | `TaskNode`、`addNode`、TaskDetails、hover、interaction kernel、provider/schema/migration 沒有 DEV-115 契約變更 |

Repo heuristic 只用來找候選，不得宣稱可形式化證明全 repo 永遠沒有 bypass；每個命中都必須分類為 blank、
source-derived 或 false positive，並把新 blank point 加回 authoritative manifest。

## 8. Browser 與 compatible regression cases

| Case | 路徑／情境 | 期望 |
|---|---|---|
| B01 | 工作台 create→detail→close/reopen→hard reload→rename→reload→1000ms hover negative | description own property absent／readback 空白；rename 不同步；無 indicator／hover card |
| B02 | Board root | root input、naming 與 description absent；建立後可關閉詳情 |
| B03 | context child | parent、nodeType、naming 與 description absent；既有 context menu flow 不變 |
| B04 | Shared sidebar host smoke（Gantt） | shared adapter root creation、placement 與 description absent |
| B05 | Shared sidebar host smoke（Calendar） | shared adapter root creation、placement 與 description absent |
| B06 | MindMap root/child command | ID、parent/order、selection/title edit 與 description absent |
| B07 | normal path error sweep | visible alert、console/page error、unexpected HTTP 4xx/5xx 皆為 0 |
| B10 | permission-denied actor | 本次未執行獨立 permission-denied browser fixture；保留 release/QC gate |
| R01 | DEV-039 workbench placement static | unplaced normalization／placement 無回歸 |
| R02 | DEV-111／114 static | hover 仍只依真實非空 description；未新增 `新任務` 字串例外 |
| R03 | DEV-028／098 targeted | cross-mode interaction 與 TaskDetails child 契約無回歸 |
| R04 | DEV-013 duplicate＋DEV-047 backup/import contract＋capture cases | source description 完整保留；blank factory 不介入 |

B01 是完整 persistence evidence；B02～B06 是 adapter integration smoke，不必各自重複 hard reload、rename 與 hover。
所有 normal cases 必須檢查 visible alert/load failure、console/page error 與非預期 4xx/5xx；任一未解釋錯誤即 Fail。

## 9. Viewport 與 UI 邊界

- 1440×900：desktop 正常入口、TaskDetails readback 與 fine-pointer hover negative。
- 390×844：本次未執行 DEV-115 browser；因沒有 layout/CSS 變更，保留為 release/QC 階段的 mobile gate。
- 本期沒有 layout/CSS 變更，不要求額外 1024×768 視覺回歸；若實作實際觸及 UI markup/layout，重新加入窄桌面 Gate。
- 既有 accessible name、keyboard focus、pending title edit 與 details return focus 必須保持；不得加入新的說明、
  tooltip、badge 或 error panel。

## 10. 執行命令與 evidence

1. `npm run verify:dev-115-blank-task-creation`
2. `npm run verify:dev-115-blank-task-creation-browser`
3. `npm run verify:dev-039-task-workbench-placement-lanes`
4. `npm run verify:dev-111-task-description-hover-card`
5. `npm run verify:dev-114-task-description-global-surfaces`
6. `npm run verify:dev-028-cross-mode-task-interactions`
7. `npm run verify:dev-098-task-detail-subtasks-pure`
8. `npm run verify:dev-013-task-duplicate`
9. `npm run verify:dev-047-backup-package-contract`
10. `npx tsc --noEmit`
11. targeted ESLint：7 constructor files、new factory 與 DEV-115 verifiers
12. `npm run build:test`
13. `git diff --check`

DEV-115 browser artifact 固定於 `output/playwright/dev-115-blank-task-creation/result.json`；包含 candidate/source
identity、route、actor、viewport、fixture／created IDs、store own-property、reload readback、可見錯誤、console/page
error、unexpected HTTP failure 與 cleanup result。既有 verifier 只記 exit code／版本與適用 case，不複製其全部 artifact。

### 10.1 實際執行結果（2026-09-10）

- P01～P03：PASS；DEV-115 static verifier 17/17 assertions。
- S01～S04：PASS；7 檔 known manifest = 11/11，source-derived inbox mapping、protected zones 與 TypeScript contract 均通過。
- B01：PASS；工作台新增→詳情→關閉／reload→改名→reload，`description` own-property absent、note 空白、indicator=0、
  1000ms hover card=0。
- B02～B06：PASS；Board root、context child、Gantt shared sidebar、Calendar shared sidebar、MindMap command 均建立新任務且
  `description` absent；B07～B09 visible／browser／HTTP error sweep = 0。
- R01～R04：PASS；DEV-039 33/33、DEV-111 38/38、DEV-114 27/27、DEV-028 48/48、DEV-098 10/10、DEV-013 PASS、
  DEV-047 30/30。
- Engineering：`npx tsc --noEmit`、targeted ESLint（0 error；18 existing warnings）、`npm run build:test`、
  `git diff --check` PASS。
- Artifact：`output/playwright/dev-115-blank-task-creation/result.json`；actor=`local-test-user/owner`、viewport=1440×900、
  route=`/`、fixture=`dev115-workspace/dev115-board`、0 browser/page/HTTP failure。
- 判定：`DEV-115 targeted QA PASS`。本次未執行獨立 permission-denied actor 與 390×844 mobile fixture，兩者保留 release/QC gate。

## 11. Runtime lifecycle

先執行 `npm run dev:test:status`。若 `http://localhost:4000/` 已有 matching runtime，記錄 owner 並重用，不停止它；
若由 DEV-115 啟動，記錄 project、purpose、port、process tree 與 cleanup condition，完成後只停止 DEV-115 擁有的
runtime 並確認 port 釋放。不得終止所有 `node.exe` 或未知 runtime。

## 12. PASS、QC 與回送

DEV-115 targeted QA PASS 需要 P01～P03、S01～S04、B01～B07、R01～R04、engineering commands、error sweep、artifact
provenance 與 cleanup 全數通過，且 final run 後 candidate 未漂移；B10 permission-denied 與 mobile viewport 是未完成的後續 gate。

Targeted independent QC 只需重新核對四個高風險證據：B01 原始缺陷、S01 11-point manifest、B03/B04 non-workbench adapter、
R04 source-content preservation，再抽查一個非工作台 mode adapter；QC 不修改產品或以 QA 結論代替事實。

下列任一成立即 Fail／回送 RD：description 非 absent、manifest 有未分類 bypass、placement/nodeType/permission 漂移、
source content 遺失、B01 缺 store/reload、normal UI 有未解釋錯誤、candidate/evidence 不相符或 cleanup 不安全。
若修正需要改 SPEC-115 的 factory responsibility、schema、provider、permission 或 interaction ownership，停止並回送
Architecture Closure Review。

目前 QA-DEV-115 已完成 targeted execution；獨立 QC 證據索引已回寫至 `ai-doc/qc/QC-DEV-115-blank-task-creation-contract.md`。
正式 release、permission-denied／390×844 gate 與 CAPA effectiveness 仍未完成。

使用思考習慣：#可驗證性、#限制條件、#風險意識
