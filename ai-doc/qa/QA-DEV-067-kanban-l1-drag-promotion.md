# QA-DEV-067：看板任務拖曳升級為 L1 列表

狀態：Executed / PASS / Synthetic Mobile

對應規格：`ai-doc/specs/SPEC-067-kanban-l1-drag-promotion.md`

## 驗證範圍

- Desktop：L2／L3+ → L1 header、任務 → board-end root append、L1 reorder、column body L2 regression。
- Mobile：長按拖曳到 L1 header 與 board-end root append，共用 canonical resolver 與單一 marker。
- Safety：self／descendant／origin／stale target no-op、subtree preserve、undo、permission、placed-row no-drag。
- UI：1440x900、1024x768、390x844、visible error sweep、overflow 與 marker geometry。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 定位條顯示 L1，提交仍進 L2 | preview 與 commit 使用不同 resolver | 任務落錯階層 | 比對 marker descriptor 與 store snapshot | P0 | QA-067-003／006 |
| header 與 column body 語意混淆 | collision ownership 或 surface type 順序錯誤 | 想升階卻移入列表，或反之 | 同一來源分別落在 header/body | P0 | QA-067-003／005 |
| 升到 L1 後仍是 task nodeType | resolver 未做 root type normalization | 工作台／日曆把列表當一般任務 | 驗證 `nodeType === group` | P1 | QA-067-001／003 |
| 尾端不能追加或會誤新增列表 | CTA 與 droppable 事件競爭 | 無法放到最後或多建空列表 | drag release 前後 root 數與 source id | P1 | QA-067-004／007 |
| 手機 marker 跳動或提交舊 target | root target 未進既有 stability/release gate | 真機誤放 | raw point、indicator、release trace | P0 | QA-067-006／007 |
| 子樹遺失或 cycle | root promotion 更新子節點或繞過 guard | 資料階層損壞 | 前後 descendant id 集合 | P0 | QA-067-002／008 |
| 定位條推開列表 | inline marker 或 dropzone 改變 flex geometry | 看板跳動 | drag 前後 column rect／scrollWidth | P1 | QA-067-009 |
| 空看板無法接收未歸位任務 | root drop 被 `anchorNodeId` 缺席停用 | 使用者必須先建立無意義空列表 | 零 column fixture 的 desktop pointer／mobile touch drop | P0 | QA-067-012 |

## 測試案例

| ID | 操作 | 預期 | 證據 |
|---|---|---|---|
| QA-067-001 | pure resolver：L2 card → L1 header | parent null、group、before target | targeted verifier |
| QA-067-002 | pure resolver：L3+ subtree → L1 header | valid root intent；descendants 不寫 parent | targeted verifier |
| QA-067-003 | Desktop 拖 L2 到另一列表標頭 | 單一 `column-header` marker；release 後成 target 前的 L1 | screenshot、DOM、store |
| QA-067-004 | Desktop 拖 L2 到「新增列表」區 | 單一 `root-drop` append marker；release 後為最後 root，未新增額外節點 | screenshot、DOM、store |
| QA-067-005 | Desktop 拖 root／card 到列表內容區 | parent 等於該列表；維持 L2 語意 | store regression |
| QA-067-006 | Mobile 長按 L3+ 到 L1 header | preview 跟 raw finger；單一 marker；release 後 root/group | screenshot、store、debug |
| QA-067-007 | Mobile 長按任務到尾端 root drop | `root-drop` marker；release 後最後 root；CTA 不被誤觸 | screenshot、store |
| QA-067-008 | self、descendant、origin 與 stale target release | 全部 zero-write，transient UI 清除 | snapshot、DOM |
| QA-067-009 | 三 viewport 拖曳中量測 | column rect／board scrollWidth 無跳動，無 overflow／重疊／裁切 | geometry、screenshots |
| QA-067-010 | click、right-click、blank pan、action rail、placed row、undo | 既有流程不回歸 | targeted regressions |
| QA-067-011 | Visible Error Sweep | 無可見 alert、HTTP 4xx/5xx、Not Found、API route error；console 無非預期 error | DOM／console |
| QA-067-012 | 未歸位 parent＋child 拖入零 L1 看板（Desktop 1440×900、Mobile 390×844） | 空白內容區可接收；單一 vertical marker；root=`parent null/order 0`、child parent link 保留；來源與 transient UI 清空；CTA 維持 270px；mobile overflow=0 | `verify-empty-board-unplaced-drop-browser.pw.js`、DOM、localStorage、四張 screenshot |

## 通過標準

- QA-067-001～012 必要案例全部通過；任何 wrong parent/order/nodeType、雙 marker、子樹遺失或可見 runtime error 即失敗。
- Desktop 與 mobile 都必須有真實 rendered interaction 證據；只有 lint、TypeScript 或 build 不足以判定通過。
- Physical iOS／Android 手感未執行時可列 supplemental，但 390x844 synthetic touch 的功能、geometry 與 release revalidation 必須通過。

## 執行結果（2026-08-14）

- QA-067 targeted resolver／source contract：13/13 PASS。
- QA-067 browser：8/8 PASS；Desktop L2／L3+ → L1 header、desktop root append、column body L2 regression、Mobile L1 header／root append、三 viewport 與 visible-error sweep 均通過。
- DEV-055 Desktop regression：16/16 PASS；DEV-054 Mobile regression：11/11 PASS。
- DEV-053／054／055／058 static regression：30/30、37/37、27/27、26/26 PASS。
- TypeScript、targeted ESLint（0 error；`BoardView.tsx` 2 個既存 warning）與 `build:test` PASS。
- Browser route：`http://127.0.0.1:4173/?qcReset=1&qcSize=72`；console 0 error，未發現 network failure、可見錯誤或頁面水平 overflow。
- Physical iOS／Android 手感未執行，保留為 supplemental，不阻擋本機 QC PASS。

## 相容性修正執行結果（2026-09-03）

- QA-067-012 PASS：1440×900 desktop pointer 與 390×844 CDP touch 均完成未歸位 parent＋child → 零 L1 看板。
- 空看板 droppable 實測為 1056×840px（看板內容區保留既有 12／10px 內距），新增列表按鈕維持 270px；拖曳中只有一條 vertical marker 與暫時提示，drop 後 transient count=0。
- Desktop／mobile 皆得到 root `parentId=null`、`order=0`，child→root link 保留，未歸位來源清空；mobile document overflow=0，visible error=0，page error=0。
- Targeted resolver／source contract 35 cases PASS；DEV-053 31/31、DEV-086 subtree、DEV-089 transaction 28/28 與 randomized scope isolation 1000 iterations PASS。
- TypeScript、targeted ESLint（0 error；`BoardView.tsx` 2 個既存 warning）與 `build:test` PASS。
- 證據：`output/playwright/empty-board-drop-desktop-preview.png`、`empty-board-drop-desktop-result.png`、`empty-board-drop-mobile-preview.png`、`empty-board-drop-mobile-result.png`、`output/playwright/empty-board-drop/result.json`。

## QC 執行指令

- `npm run verify:dev-067-kanban-l1-drag`
- `npm run verify:dev-067-kanban-l1-drag-browser`
- `npm run verify:dev-055-desktop-task-drag-target-clarity`
- `npm run verify:dev-054-mobile-task-drag-precision`
- `npx tsc --noEmit`
- targeted ESLint
- `npm run build:test`
