# QA-DEV-111：任務說明跨閱讀模式懸浮視窗

- 日期：2026-09-08（2026-09-09 觸發範圍與微型標示修訂）
- 狀態：Executed / 微型標示 amendment Local QA PASS / NOT RELEASED
- 對應 SPEC：`ai-doc/specs/SPEC-111-task-description-hover-card.md`
- Fixture：`dev-111-v3`
- Evidence：`output/playwright/dev-111-task-description-hover-card/`

## 驗證範圍

- 五個 desktop reading modes：board、list、mindmap、gantt、calendar。
- 看板 L1／L2／L3+ 與清單直接引用選取預覽藍框 surface，並覆蓋標題之外的 surface 點位。
- 既有 `TaskNode.description` plain-text projection、非空／空白、換行與 HTML-like 文字。
- 1000ms dwell、提前離開取消、hoverable、Escape、scroll、pointer down、drag start。
- portal geometry、viewport overflow、native title 衝突、`role=tooltip` 與 `aria-describedby` cleanup。
- 非空任務的 9px 微型說明圖示、11px 固定槽位、空白不占位、pointer／focus ownership 與窄版版面。
- DEV-028 click/details/selection 與 DEV-066 note/description projection targeted regression。

## FMEA

| 失效模式 | 使用者影響 | 偵測 | 對策 |
|---|---|---|---|
| 尚未滿 1 秒就出現 | 掃描畫面時大量閃動 | 760ms negative assertion | 固定 1000ms timer |
| 離開後 stale 視窗才出現 | 說明對錯任務 | leave-before-timeout case | 每次 surface transition 取消 timer |
| 空白說明顯示空框 | 製造無意義 UI | empty fixture | canonical surface 可存在，但 controller 不開 card |
| 說明範圍與藍框漂移 | 使用者停在看似可用區卻無反應 | title 外／surface 內點位 | 直接解析既有 `data-task-surface-source` |
| rich text 被當 HTML 執行 | 內容或安全錯誤 | `<b>` literal fixture | React text child，禁止 raw HTML |
| 被模式容器裁切 | 說明無法閱讀 | 五模式 rect／screenshot | body portal＋viewport clamp |
| hover 視窗阻斷閱讀 | 無法移入或關閉 | hoverable＋Escape | 120ms grace＋Escape dismissal |
| 與拖曳／點擊競爭 | 誤操作或殘留 overlay | pointer／drag dismissal、DEV-028 | pointer down／drag start 關閉 |
| 原生 title 同時出現 | 雙重 tooltip | calendar title readback | 移除 calendar segment title |
| touch 誤啟動 | 手機 pan／tap 退化 | static fine-pointer gate | hover/fine media query |
| 圖示在空白任務誤顯示 | 使用者誤以為存在說明 | non-empty／whitespace fixture | 共用元件集中 `trim()` gate |
| 圖示成為第二個按鈕或攔截滑鼠 | hover 範圍縮小、click／drag 行為漂移 | pointer target、attributes readback | `pointer-events:none`、`aria-hidden`、無 focus／title |
| 圖示擠壓標題或控制 | 小卡、窄版出現截斷或 overflow | 五模式 screenshot＋390px geometry | 固定 11px、title `min-width:0`、不新增容器 |

## QA Cases 與結果

| Case | 結果 | Evidence |
|---|---|---|
| B-board/list/mindmap/gantt/calendar-hover | PASS 5/5 | 760ms=0；約 1.09～1.11 秒顯示正確 task／description |
| B-*-hoverable | PASS 5/5 | 游標移入 card 後仍可見 |
| B-*-escape | PASS 5/5 | card 移除，`aria-describedby` 清理 |
| B-board-L1/L2/L3-selected-preview-surface-range | PASS 3/3 | title 外、藍框內點位皆顯示對應說明 |
| B-list-selected-preview-surface-range | PASS | 整列右側、title 外點位顯示對應說明 |
| B-dwell-cancelled-on-leave | PASS | 480ms 離開後不延遲顯示 |
| B-scroll-dismisses | PASS | reading canvas scroll 關閉 |
| B-pointerdown-dismisses | PASS | pointer down 關閉 |
| B-dragstart-dismisses | PASS | drag start 關閉 |
| B-empty-description | PASS | 空白 description 的 canonical surface 存在，但 card 與 indicator 數量均為 0 |
| B-calendar-native-title | PASS | task segment `title=null` |
| B-console-errors | PASS | console/page error 0 |
| B-*-description-indicator | PASS 5/5 | 五模式逐一量測 icon=9px、slot=11px、pointer-events=none、aria-hidden=true、無 title／focus、border-width=0 |
| B-shared-sidebar-description-indicator | PASS | 甘特／行事曆共用側欄的非空任務顯示同一元件 |
| B-mobile-board-indicator-layout | PASS | 390px documentWidth=390；標題、11px 標示與卡片邊界無重疊 |
| B-visible-errors | PASS | 無可見 alert／inline error／HTTP 錯誤文字 |

總計：34/34 PASS。五模式完整畫面、五張近距離 indicator 與 390px 窄版截圖、machine-readable artifact 位於
evidence 目錄；artifact 記錄 source revision `working-tree`、環境 `local-test / Chromium`、viewport 與 fixture 名稱。

## Static / Build / Regression

- `verify:dev-111-task-description-hover-card`：38/38 PASS。
- `tsc --noEmit`：PASS。
- `build:test`：PASS；只有既有 bundle size 與 browserslist freshness warning。
- targeted ESLint：0 error；只保留 `GanttTaskBar` 既有 3 warnings與兩個 presentation 檔既有 fast-refresh warning，
  新增 `TaskDescriptionIndicator` 無 warning。
- DEV-028 static：48/48 PASS；browser click/details/selection/mobile visibility PASS。
- DEV-066 note/description projection：PASS。
- DEV-065 static 在未修改的 props-object 表達遇到 stale JSX literal assertion；browser 的 hover geometry、handoff、
  native title 等前段案例通過，後段在未修改的 DragOverlay descendant summary 失敗。此限制不改寫為 DEV-111 FAIL，
  也不冒稱 DEV-065 整套 PASS；若要修復舊 gate／drag summary，另立 corrective scope。

## UI QC

- Viewport／資料：1440x900＋390x844；非空多行說明、空白說明、HTML-like 文字。
- 覆蓋狀態：正常、延遲、取消、空白、長內容邊界、關閉、drag／scroll 競爭、visible error。
- Quietness：PASS；只增加一個 9px、無底無框的內容存在標示，沒有文字、數量、badge 或第二入口。
- Task flow：PASS；看板／清單直接引用藍框 surface；五模式均從完整任務 surface 取得相同內容。
- Risk／Recovery：PASS；所有 transient dismissal 與 stale timer cancellation 通過。
- Accessibility：PASS；indicator 為 `aria-hidden`、無 focus／title 且不攔截 pointer；tooltip role、describedby
  與 Escape dismissal 有直接 readback。
- Viewport：PASS；五模式 rect 在 viewport 內，390px documentWidth 未增加，圖示未與標題或卡片邊界重疊。

## Runtime Lifecycle

瀏覽器 verifier 使用專案既有 `http://localhost:4000/` local-test runtime（listener PID 22260）；該 runtime
在本 DEV 開始前已存在且符合本專案，因此只重用、不終止。每次 Playwright 隔離 session 由 wrapper 關閉；本 DEV
未建立新的 app server process tree。
