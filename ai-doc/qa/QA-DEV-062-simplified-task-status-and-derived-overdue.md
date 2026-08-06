# QA-DEV-062：任務狀態精簡與截止日衍生逾期

狀態：Static + Browser QC Passed / Production Not Deployed

## 驗證範圍

- 四種人工狀態與 legacy compatibility。
- 截止日衍生逾期及只讀逾期篩選。
- 純文字狀態控制與三色狀態視覺。
- 共用 filter、任務詳情、清單、看板日期摘要與既有跨模式回歸。

## 主要風險

| 失效模式 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|
| 截止日仍改寫成 delayed | 使用者的流程狀態被系統覆蓋 | static 搜尋與日期案例 | P0 | store／詳情不得寫入 delayed |
| 暫緩可隱藏逾期 | PM 看不到真實時程風險 | onhold + 過期日期案例 | P1 | `isTaskOverdue` 必須回傳 true |
| 完成仍顯示逾期 | 已結案任務持續告警 | completed + 過期日期案例 | P1 | 完成時衍生條件自動解除 |
| UI 仍出現六狀態或彩色圓點 | 操作負擔與色彩雜訊未降低 | DOM、文字與 child element 掃描 | P1 | 四文字按鈕、零狀態 icon/dot |
| 移除逾期文字時連橘色警示也消失 | PM 無法快速掃描時程風險 | overdue DOM class 與 screenshot | P1 | 可見文字只留日期，保留 orange 樣式與 `aria-label` |
| 手機狀態按鈕重疊 | 無法辨識或操作 | 390×844 screenshot／bounds | P1 | panel viewport-safe gate |
| legacy task 消失 | 舊任務被 filter 排除 | delayed／unsure normalization 測試 | P1 | legacy 收斂到 todo |

## 測試與結果

| ID | 驗證 | 結果 |
|---|---|---|
| QA-062-001 | 四種人工狀態順序與文案 | 通過 |
| QA-062-002 | delayed／unsure 正規化為 todo | 通過 |
| QA-062-003 | 待辦／進行中／暫緩逾期，完成／今天／未來／無日期不逾期 | 通過 |
| QA-062-004 | 逾期 filter 命中未完成過期任務、排除完成任務 | 通過 |
| QA-062-005 | 詳情與列表不再提供延遲／未定 | 通過 |
| QA-062-006 | 狀態群組無 icon、notch 與 dot | 通過 |
| QA-062-007 | 深灰／品牌藍／淺灰 palette 符合決策 | 通過；品牌色由 DEV-064 theme alias 收斂 |
| QA-062-008 | 1440／1024／390 panel bounds、無水平 overflow | 通過 |
| QA-062-009 | 逾期日期只顯示日期，以 orange warning 區分且不顯示「逾期」文字 | 通過 |
| QA-062-010 | visible error sweep 與 console error sweep | 通過，0 errors |

## 證據

- `npm run verify:dev-062-simplified-task-status`：通過。
- `npm run verify:dev-062-simplified-task-status-browser`：通過。
- `npm run verify:dev-039-task-filter-core`：更新偏好版本 gate 後通過。
- `npm run verify:dev-039-filter-result-parity`：26/26 通過。
- `npm run verify:filter-menu-portal-browser`：通過，0 console errors。
- `npm run verify:dev-045-calendar-subscription-builder-preview`：19/19 通過。
- `npm run verify:dev-028-cross-mode-task-interactions`：42/42 通過。
- `npm run verify:dev-060-kanban-due-date-browser`：通過；日期維持只顯示截止日。
- `npm run verify:dev-061-kanban-tag-collapse`：20/20 通過。
- `npx tsc --noEmit`：通過。
- `npm run lint`：通過，0 errors／54 warnings。
- `npm run build:test`：通過。
- Browser screenshot：`output/playwright/dev-062-task-status-1785829394682-1440.png`、`-1024.png`、`-390.png`、`-overdue.png`。

## QC 結論

`通過`。本輪只完成本機實作與驗證，未執行 production deploy、遠端 schema migration 或正式資料改寫。
