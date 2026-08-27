# QA-DEV-092：會議紀錄側欄資訊精簡

- 關聯 DEV：DEV-092、DEV-020
- 規格：`SPEC-020` 2026-08-27 UI 精簡 addendum
- 風險：Medium；使用者可見 header、收合互動與任務選取入口
- 狀態：Executed / QA PASS / QC PASS / 未 Release

## 驗證範圍與通過標準

- header 只保留紀錄標題、位於右側抽屜最左側的 Chevron 收合控制與離開控制；收合箭頭向右、展開箭頭向左，說明入口與裝飾 icon 不存在。
- 會議流程不顯示 `會議流程` 標題、輔助說明或 `AI選用` badge；本機與雲端同步完成的成功 checkpoint 不建立常駐 banner，必要的失敗／衝突／暫停／保存中狀態仍可見。
- 新會議標題不自動顯示時間；`紀錄時間` 顯示 `YYYY/MM/DD HH:mm` 24 小時制，且不出現上午／下午。
- 會議模式的 `標題` 與 `紀錄時間` 位於同一個橫向欄位列；個人工作紀錄的時間欄位排列不受影響。
- 會議流程保留五個主要階段標籤與操作，只移除各階段 icon 及副標題；按鈕的可存取名稱與 tooltip 不變。
- 會議流程階段按鈕採緊湊高度，且只有可操作階段顯示 `pointer` cursor／hover 回饋（含目前階段）；停用階段維持不可操作游標與狀態。
- 會議底部不顯示 `AI整理來源：任務變更` 摘要／展開列；任務變更資料仍可供 AI整理使用。
- 會議模式的狀態／分享範圍控制列採單列緊湊版，使用可讀短標籤且較原排列約縮減 50% 高度；個人工作紀錄排列不受影響。
- 內容編輯器採 flex 填滿抽屜剩餘高度；流程、欄位、狀態與 action 維持固定／自然高度，會議內容區至少 220px、個人工作紀錄至少 150px，窄版不足時可捲動且不得與控制列重疊。
- 會議空白關聯任務不顯示 `0 / 未選取` 摘要或 `選取任務` action；個人工作紀錄入口與已有關聯任務管理維持。
- 1440×900 與 390×844 可開啟、收合／展開、無水平溢出、重疊、裁切、visible alert、HTTP 4xx/5xx、console error 或 page error。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 測試 |
|---|---|---|---|---|---|
| 收合控制仍未位於抽屜最左側或箭頭方向不一致 | header flex 順序／icon 未統一 | 不易辨識面板方向 | DOM geometry＋方向 data attribute＋實際截圖 | P1 | 右側抽屜收合用 `ChevronRight` 並置於標題前、展開用 `ChevronLeft`，與 close 分離 |
| 刪除說明入口時失去必要流程資訊 | 移除 modal 但 workflow 無法理解 | 操作中斷 | visible flow／static contract | P1 | 保留流程 step 與必要狀態回饋，不留常駐教學牆 |
| 正常保存訊息造成資訊噪音 | success status 常駐 | 側欄空間被佔用 | status selector＋截圖 | P2 | saved/saved 隱藏，error/conflict 等 actionable 狀態保留 |
| 會議空白任務狀態仍殘留選取 action | meeting 分支未完全移除 | 介面仍有非核心入口與空間噪音 | DOM selector＋390／1440 截圖 | P2 | 會議空白狀態不渲染 `選取任務` action；工作紀錄與已有關聯時依既有契約保留入口 |
| 標題與時間仍垂直堆疊 | meeting meta 未使用同列 grid | 欄位佔用過多垂直空間 | DOM geometry＋1440／390 截圖 | P1 | 兩欄同列且各欄保留可讀寬度 |
| 內容編輯器被其他區塊擠壓或與控制列重疊 | drawer 內層缺少 flex 高度鏈／min-height 邊界 | 可輸入面積不足或遮擋下方控制 | DOM 高度、最小高度、上下界與窄版截圖 | P1 | 內容欄位 flex-fill 剩餘空間，保留最小高度並讓窄版由抽屜捲動 |
| 窄版控制溢出或遮擋 | header／bottom sheet 尺寸錯誤 | 無法離開或編輯 | 390×844 screenshot、scrollWidth | P1 | 窄版實際操作收合／展開與 overflow sweep |
| 日期時間仍顯示上午／下午 | 依賴 `datetime-local` 的 locale 顯示 | 24 小時制需求未達成，可能誤讀時間 | DOM type／value 與實際畫面 | P1 | 使用受控文字輸入並驗證 `YYYY/MM/DD HH:mm` |
| 階段操作被誤刪或流程難以辨識 | 刪除 icon／副標題時誤移除 step button | 無法保存、整理或發布會議紀錄 | 五個 step button、主要標籤與互動 smoke | P1 | 只刪視覺輔助元素，保留 step 狀態、操作與 aria label |

## QC 執行指令

```text
npm run verify:dev-092-record-sidebar-quietness
npm run verify:dev-092-record-sidebar-quietness-browser
npm run verify:dev-020-record-workflow-redesign
npm run verify:dev-002-records
npm run verify:dev-028-cross-mode-task-interactions
npm exec tsc -- --noEmit
npm exec eslint -- src/components/Records/RecordSidebar.tsx src/components/Records/RecordContentEditor.tsx scripts/verify-dev-092-record-sidebar-quietness.mjs scripts/verify-dev-092-record-sidebar-quietness-browser.pw.js
git diff --check
```
