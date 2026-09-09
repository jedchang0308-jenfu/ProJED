# QC-DEV-112：任務詳情基本資料列對齊

- 日期：2026-09-09
- 結論：PASS（Local desktop targeted slice）/ NOT RELEASED
- 產品來源：working tree
- 環境：local-test / Codex in-app browser 1298×698＋isolated Chromium DEV-028 regression

## 事實驗證結果

- 標籤基線：狀態、日期、主責／協作的 top 均為 129.5px；bottom 差異 0.79px，符合 1px round-off。
- 控制基線：狀態、開始日、日期箭頭、結束日、工期、主責／協作均為 top 149.4875px、bottom 181.4875px、height 32px。
- 日期 geometry：開始日 245.6～373.6、箭頭 373.6～405.6、結束日 405.6～533.6、工期 533.6～629.6px；連續且沒有 overlap。
- 欄位 geometry：狀態 88px、日期 384px、主責／協作 510.4px；主責欄仍大於日期欄。
- Overflow／error：document width 與 viewport width 均為 1298px；visible alert／inline error 0。
- DEV-028 browser：PASS；新增標籤基線與日期精確間距 assertion 後，四模式詳情與 selection lifecycle 仍通過。
- 工程 gate：DEV-112 static 10/10、DEV-028 static 48/48、TypeScript、targeted ESLint、test build PASS。

## 判定邊界

- 本次是桌機 `lg` class-only layout refinement；未修改資料、事件處理、權限或持久化。
- 舊 mobile metadata browser gate 在進入本次 target 前被既有 timeline fixture selector timeout 阻擋；不宣稱通過，亦無證據指向本次桌機格線修正。
- 未 deploy，未驗證 production artifact；本報告不可作為 release PASS。
