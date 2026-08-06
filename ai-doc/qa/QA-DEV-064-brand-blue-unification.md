# QA-DEV-064：全系統品牌藍統一

狀態：Static + Browser QC Passed / Production Not Deployed

## 驗證範圍

- 品牌藍 theme、legacy utility alias 與非 CSS 色值同步。
- 看板、任務詳情、全域任務平台、狀態篩選、心智圖與手機 viewport。
- 功能色保留與 legacy hard-coded blue／blue-gray source 掃描。

## FMEA

| 失效模式 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|
| 只改 primary，舊 blue／sky 仍是不同色相 | 同畫面仍有多種藍色 | theme alias 與 computed color 比對 | P1 | 四個 legacy family 全階對應 primary |
| SVG 繞過 Tailwind 保留 sky blue | 心智圖仍有突兀色相 | source scan、心智圖 screenshot | P1 | 共用 `BRAND_BLUE` |
| 藍灰容器被當成第二品牌色 | 工作台與 topbar 視覺分裂 | source scan、工作台 screenshot | P1 | 容器改中性 slate、active 用 primary |
| 把警告／危險誤改成品牌藍 | 使用者無法辨識風險 | semantic token source gate | P0 | 保留 orange／red／green |
| 手機浮層或 filter 破版 | 無法操作狀態與篩選 | 390×844 screenshot／bounds | P1 | viewport-safe 與 visible-error gate |

## 測試案例

| ID | 驗證 | 通過標準 | 結果 |
|---|---|---|---|
| QA-064-001 | theme runtime alias | blue／sky／indigo／cyan 50–950 均等於 primary 同階 | 通過 |
| QA-064-002 | 品牌基準色 | primary 500=`rgb(99,102,241)`、600=`rgb(79,70,229)` | 通過 |
| QA-064-003 | 看板、狀態與工作台 | 進行中使用品牌 600；兩個工作台 accent 使用品牌 500，容器為一致中性 slate | 通過 |
| QA-064-004 | 心智圖 | 中央節點、關係工具與 SVG source 使用品牌色階，legacy 關係線色會正規化 | 通過 |
| QA-064-005 | 390×844 | filter panel 在 viewport 內，無頁面水平 overflow、重疊或裁切 | 通過 |
| QA-064-006 | visible error／console | 看板、詳情、心智圖與手機操作沒有 visible error 或 console error | 通過，0 errors |

## QC 指令

- `npm run verify:dev-064-brand-blue-unification`
- `npm run verify:dev-064-brand-blue-unification-browser`
- `npm run verify:dev-039-task-workbench-placement-lanes`
- `npm run verify:dev-047-layout-visual-hierarchy`
- `npm run verify:dev-062-simplified-task-status`
- `npx tsc --noEmit`
- targeted ESLint
- `npm run build:test`

## QC 結論

`通過`。DEV-064 static 20/20、DEV-039 31/31、DEV-047、DEV-062、DEV-058 26/26、DEV-027E 24/24、TypeScript、targeted ESLint 與 test build（1975 modules）通過。Browser QA-064-001～006 共 6/6，console 0 errors；初次 QC 發現 Tailwind 會裁掉未使用 theme shade，已改用 `@theme static` 後全階重驗通過。

視覺證據：`output/playwright/dev-064-brand-blue-1785831493445-board-1440.png`、`-details-1440.png`、`-mindmap-1440.png`、`-board-390.png`。本輪未執行 production deploy。
