# QA-DEV-053：任務拖拉肌肉記憶一致化驗證計畫

關聯 DEV：DEV-053
關聯 SPEC：`ai-doc/specs/SPEC-053-task-drag-muscle-memory-consistency.md`
狀態：Executed / T01-T14 Passed / Local Static + Browser Regression Passed / Physical Phone Supplemental Not Executed
風險等級：Medium；手勢回歸、錯誤提交、placed row 可拖為 Stop Ship
建立日期：2026-07-17
最近更新：2026-07-17

執行證據：`ai-doc/qc/QC-DEV-053-task-drag-muscle-memory-consistency.md`

使用思考習慣：#可驗證性、#系統描繪、#證據品質

## 1. QA 任務與完成邊界

本 QA 驗證 DEV-053 的完整拖拉子系統重構是否達到一致肌肉記憶：

- 使用者已滿意的電腦版拖拉 UI / 操作方式被保留，不被重構改壞。
- 桌機 task surface 可拖、可點、可右鍵，互不誤觸。
- 手機 quick tap / short pan / long press 三者清楚分流。
- Workbench unplaced row 可拖入 placed lane。
- Workbench placed row 不能拖，手機長按不進 action rail。
- Mobile action rail / drop / cancel / auto-scroll 不殘留、不 double-submit。

依使用者決策 `3A` 與 2026-07-17 補充，DEV-053 完成門檻為 static verifier、browser verifier、指定 regression 與下方 QA True Operation Gate 全部通過。Physical iOS / Android 為 supplemental；未執行時不得宣稱真機手感簽核。

## 2. Required Commands

DEV-053 新增 gate：

```powershell
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser
```

Regression gates：

```powershell
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-046-universal-task-surface-drag
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-044-undo-coverage
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

## 3. Static Gate

| ID | 驗證 | 通過標準 |
|---|---|---|
| QA-053-S01 | New module boundary | 存在 `src/components/Wbs/taskDrag/` 並包含 types、gesture policy、surface hook、target adapter、session、committer、presenter |
| QA-053-S02 | BoardView exit gate | `BoardView.tsx` 不直接持有 mobile task action state/ref/timers/global touch listeners/target priority/commit fallback |
| QA-053-S03 | Sensor split | `useDragSensors.ts` 在 mobile action mode / coarse pointer 下不啟用 task `TouchSensor` |
| QA-053-S04 | Shared surface binding | Kanban card、checklist row、task-backed column/header、workbench unplaced row 使用 shared gesture surface 或等效 helper |
| QA-053-S05 | Placed row no source | Workbench placed row 不呼叫 `useDraggable`、不掛 `data-task-workbench-drag-surface`、不產生 `TaskDragSource` |
| QA-053-S06 | Placed row no mobile rail | Workbench placed row 不註冊 mobile task action long press，不呼叫 `mobileTaskAction.begin` |
| QA-053-S07 | Target priority | mobile action rail、task position、workbench placed lane、none 只有一份 priority 定義 |
| QA-053-S08 | Terminal guard | session controller 有 committed/cancelled/no-op terminal guard，commit function 依 `sessionId` at-most-once |
| QA-053-S09 | Store write boundary | store write 僅在 committer，hover / preview / auto-scroll / cancel 不寫 store |
| QA-053-S10 | Package scripts | `package.json` 登錄 DEV-053 static / browser scripts |
| QA-053-S11 | Desktop UI freeze contract | SPEC / verifier 明確禁止未經確認改變使用者已滿意的電腦版拖拉 UI，不新增 desktop drag handle、lock text、progress、breadcrumb 或 desktop action rail |

## 4. Browser Gate

| ID | Viewport | Case | 通過標準 |
|---|---|---|---|
| QA-053-B00 | 1440x900 / 1024x768 | Desktop approved drag UI baseline | 以截圖 / trace 保存目前使用者已滿意的桌機拖拉 UI；重構後視覺回饋、drag start、drop、click / right-click 分流與 baseline 等價 |
| QA-053-B01 | 1440x900 | Kanban card click / drag / right click | click 開 details；drag move 不誤開 details；right click 開 task menu |
| QA-053-B02 | 1440x900 | Checklist row click / drag / right click | deep checklist row 行為同 card，無 handle-only dead zone |
| QA-053-B03 | 390x844 | Mobile quick tap | task body tap 開正確 details |
| QA-053-B04 | 390x844 | Mobile short pan | 不開 details、不開 action rail、不開始 drag；可測得 scroll 或 click suppression |
| QA-053-B05 | 390x844 | Mobile long press draggable task | 出現 action rail + single preview；release invalid no-op |
| QA-053-B06 | 390x844 | Mobile complete action | drop 到完成 / 取消完成只切換 status，不同時 move |
| QA-053-B07 | 390x844 | Mobile add-child action | drop 到新增下階建立 child 並開 details / naming flow，無 duplicate |
| QA-053-B08 | 390x844 | Mobile delete action | drop 到刪除只開 confirm，不直接 delete |
| QA-053-B09 | 390x844 | Mobile edge auto-scroll | 靠近 board / column edge 可 scroll，line / target 跟最新 observation |
| QA-053-B10 | 390x844 | touchcancel / pointercancel / blur / Escape | session cleanup，0 write，下一次可立即操作 |
| QA-053-B11 | 1440x900 | Workbench unplaced drag | unplaced row 可拖到 placed lane，且不誤開 details |
| QA-053-B12 | 1440x900 | Workbench placed drag attempt | placed row 嘗試拖回 unplaced no-op；無 duplicate；無 local unplaced persistence |
| QA-053-B13 | 390x844 | Workbench placed long press | 不出現 action rail、不出現 drag preview、不寫 store；quick tap 仍開 details |
| QA-053-B14 | 320x844 / 430x932 | Viewport safety | action rail、preview、drop indicator 無裁切、重疊、水平 overflow、visible runtime error |

## 5. Regression Matrix

| Source | 必保行為 |
|---|---|
| DEV-028 | click-to-details、detail-only title edit、right-click menu 不回歸 |
| DEV-029 | mobile pan-first、compact action rail、cancel safety、edge auto-scroll 通過 |
| DEV-039 | Workbench filters / placement lanes / placed row read-only contract 通過 |
| DEV-044 | move / placement / mobile action 仍可形成正確 undo grouping |
| DEV-046 | whole task surface drag 在 card / checklist / unplaced row 通過；placed row 例外生效；桌機拖拉 UI 維持使用者已滿意 baseline |

## 6. Visible Error Sweep

每個 browser case 需檢查：

- `.inline-error`
- `[role=alert]`
- `Not Found`
- `Internal Server Error`
- 可見 `/api/` error text
- `document.body.scrollWidth <= window.innerWidth`
- console error / failed network request（測試預期錯誤需列原因）

## 7. Stop Ship

任一成立即 Fail：

- Workbench placed row 可拖、可 reorder、可拖回 unplaced，或 mobile 長按進 action rail。
- 電腦版拖拉 UI / 操作方式相對 approved baseline 出現未授權改變。
- mobile short pan 觸發 drag / action rail / details。
- action rail 與 position drop double-submit。
- 同一 session batch count > 1。
- cancel 後仍殘留 preview / line / source hidden / pending target。
- Browser verifier 失敗但宣稱 DEV done。
- QA True Operation Gate 未執行、任一必要案例失敗，或缺少 route／viewport／操作步驟／截圖與前後狀態證據。
- archived DEV-052 被當作 executable contract。

## 8. QA True Operation Gate（完成必要）

本節不是自動 verifier 的重複執行。QA／QC 必須在 `http://127.0.0.1:4173/` 的實際渲染頁面完成連續操作；核心拖拉須走滑鼠 down/move/up 或瀏覽器觸控事件路徑，不得以直接呼叫 store、手動改 localStorage 結果或只檢查 selector 代替。fixture seed 允許使用 localStorage，但開始操作後的產品結果必須由 UI 產生。

### 8.1 執行前置

- 測試環境：`npm.cmd run dev:test:status` 顯示本 repo 的 local test server 正在 `http://127.0.0.1:4173/`。
- 固定資料：至少 2 個 column、4 個 card、2 個 checklist child、1 個 Workbench unplaced row、1 個 placed row。
- 桌機 viewport：`1440x900`、`1024x768`；手機 viewport：`390x844`，viewport safety 另補 `320x844`、`430x932`。
- 每個案例記錄：case ID、時間、route、viewport、操作步驟、操作前後 node parent/order/status/count、截圖或 trace、visible-error sweep、Pass/Fail。
- 桌機 baseline 使用 Slice A 已保存的核准畫面作前後比對；不得新增 drag handle、lock text、progress、breadcrumb 或 desktop action rail。

### 8.2 真實操作案例

| ID | 實際操作 | 必須觀察的通過結果 |
|---|---|---|
| QA-053-T01 | 桌機點擊 card、checklist row、column header | 各自開正確 details；未產生 reorder／move |
| QA-053-T02 | 桌機從 card surface 按住拖到同欄另一位置，再跨欄拖放 | overlay 與核准 baseline 等價；只提交一次；details 不誤開；parent/order 正確 |
| QA-053-T03 | 桌機從 checklist whole surface 拖曳排序／移動 | 無 handle-only dead zone；只提交一次；階層與 order 正確 |
| QA-053-T04 | 桌機右鍵 card／checklist／column header；在看板空白處拖曳平移 | 右鍵只開 task menu；空白處只平移；不誤啟動 task drag |
| QA-053-T05 | 手機 quick tap card／checklist／column header | 開正確 details；無 action rail、preview 或殘留 session |
| QA-053-T06 | 手機在 task surface 短滑超過 tolerance | 畫面／欄位可捲動；不開 details、不開 rail、不寫 store |
| QA-053-T07 | 手機長按可拖 task，停在無效區放開，再立即重做一次 | rail 與單一 preview 出現；第一次 no-op 且完整 cleanup；第二次可立即開始 |
| QA-053-T08 | 手機依序拖到完成、新增下階、刪除 action | 完成只切 status；新增只產生 1 個 child 並開 naming/details；刪除只開 confirmation、確認前 node 仍存在 |
| QA-053-T09 | 手機拖到另一 task 的 before／after，並靠近 board 右緣與 column 底緣 | target／indicator 跟隨最新位置；水平與垂直 auto-scroll 生效；只提交最後一個 move |
| QA-053-T10 | active session 中觸發 touchcancel、pointercancel、Escape、blur／visibility hidden | 0 write；preview、indicator、source hidden、hover、timer、RAF 全清；下一次可立即操作 |
| QA-053-T11 | 桌機將 Workbench unplaced row 拖到 placed lane | 任務只歸位一次；workspace／board／parent／order 正確；details 不誤開 |
| QA-053-T12 | 桌機嘗試拖 placed row；手機長按 placed row；最後 quick tap | 前兩者皆 no-op，無 rail／preview／unplaced persistence；quick tap 仍開正確 details |
| QA-053-T13 | 在 `320x844`、`390x844`、`430x932` 重做 T06-T09 的 rail／preview／indicator | 無水平 overflow、裁切、重疊、按鈕擠壓或不可操作 |
| QA-053-T14 | 每個 viewport 完成 visible-error sweep 與 console/network 檢查 | 無 `.inline-error`、非預期 `[role=alert]`、HTTP 4xx/5xx、Not Found、Internal Server Error、可見 `/api/` error 或未解釋 console/page error |

### 8.3 判定與證據

- `通過`：T01-T14 全數 Pass；browser/static/regression commands 全數通過；桌機 baseline 無未授權差異；Stop Ship 為 0。
- `未通過`：任一 T case 不符合預期、出現 double-submit、placed row 可拖、桌機基準改變、可見錯誤、殘留 session 或 viewport 缺陷。
- `未充分驗證`：缺任一必要 viewport、沒有操作前後資料證據、沒有截圖／trace、只用 selector/static 判斷，或核心拖拉不是從實際輸入事件路徑完成。
- 結果須寫入 DEV-053 QC evidence；QA True Operation Gate 未明確記為 `通過` 前，`dev_task.md` 不得標記完成。

## 9. Supplemental Physical Touch

Physical iOS Safari / Android Chrome 建議補跑：

- quick tap / short pan / long press。
- Workbench placed long press no action rail。
- edge auto-scroll。
- touchcancel / app switch cleanup。

這些是 supplemental，不阻塞 DEV-053 done；未執行時，QC 結論需寫明 `Physical phone supplemental not executed`。
