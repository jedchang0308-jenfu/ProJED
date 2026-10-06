# QA-DEV-091：工作台上下區域高度調整

- 關聯 DEV：DEV-091、DEV-039
- 規格：`SPEC-039` DEV-091 addendum
- 風險：Medium；主要 UI 互動＋帳號 layout preference
- 狀態：Executed / QA PASS / QC PASS / 未 Release

## 驗證範圍與通過標準

- 正常入口開啟全域任務平台，只出現一條位於未歸位／已歸位之間的水平分隔線。
- pointer 上下拖曳與鍵盤 `ArrowUp`／`ArrowDown`／`Home`／`End` 改變正確區域，高度限制 18%～82%，不破壞兩區捲動與 sticky header。
- 放開才持久化；panel cache 與 account layout preference 相同，reload 還原，帳號 scope 隔離。
- 1440×900 與 390×844 無重疊、裁切、文件級水平溢出、visible alert、HTTP error、console/page error。
- DEV-039 未歸位／已歸位 placement lane、row、filter 與 task drag 不回歸。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 測試 |
|---|---|---|---|---|---|
| 拖錯方向或兩區一起變大 | ratio／flex 計算錯誤 | 無法配置空間 | 前後 geometry 差值 | P0 | 向下／向上實拖並比對兩區高度 |
| 任一區被壓成不可用 | 無 clamp | 標題與任務不可達 | Home／End＋header geometry | P0 | 固定 18%～82% |
| 拖曳產生高頻遠端寫入 | pointermove 直接 persist | 成本與競態上升 | source contract | P1 | move只改 state，up/cancel才 persist |
| 偏好跨帳號污染 | 非 uid scope | 他人版面被覆蓋 | A／B storage test | P0 | account-scoped key＋account layout namespace |
| 重載或跨裝置不還原 | 只存 component state | 每次需重調 | local readback／hydrate source | P1 | local cache＋既有 remote profile preference |
| 分隔線與任務拖曳衝突 | owner／hit target 混用 | 誤搬任務 | DEV-039 browser regression | P0 | divider置於lane間、primary guard |
| 鍵盤或輔助科技不可用 | 非語意 div | 無法操作 | role／ARIA／focus／keyboard | P1 | separator pattern與value text |
| 窄版破版或水平溢出 | handle／panel寬度錯誤 | 內容不可讀 | 390×844 screenshot與scrollWidth | P1 | divider限制在panel內 |

## 執行結果

| Case | Evidence | 結果 |
|---|---|---|
| Source/model/account isolation | `verify:dev-091-task-workbench-lane-resize` 16 checks | PASS |
| Desktop pointer／keyboard／clamp／reload | DEV-091 browser 1440×900 | PASS |
| Narrow pointer／overflow／error sweep | DEV-091 browser 390×844 | PASS |
| Placement regression | DEV-039 static 31/31＋browser | PASS |
| Compile／lint／artifact | TypeScript、targeted ESLint、`build:test`、`git diff --check` | PASS |

Remote authenticated two-device smoke 未執行；目前 evidence 證明既有 account preference remote adapter 已接入新欄位與本機 UI delivery path，不能替代正式環境跨裝置驗證。
