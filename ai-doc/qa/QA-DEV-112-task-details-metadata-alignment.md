# QA-DEV-112：任務詳情基本資料列對齊驗證

- 日期：2026-09-09
- 狀態：Executed / Local targeted PASS / NOT RELEASED
- 對應 SPEC：`ai-doc/specs/SPEC-112-task-details-metadata-alignment.md`

## FMEA

| 失效模式 | 使用者影響 | 偵測 | 對策 |
|---|---|---|---|
| 日期標籤高於其他標籤 | 第一列看起來歪斜 | rendered label top/bottom | desktop row gap 統一為 4px |
| 日期 input 溢出 grid track | 箭頭留白不對稱、控制項互壓 | date part rect readback | 明確 128／32／128／96px 軌道 |
| 加寬日期擠壓主責欄 | 人員摘要裁切 | assignment/date width comparison | 88／384／flex＋12px gutter |
| 桌機修正污染手機 | 窄版 overflow 或控制不可用 | responsive source boundary＋mobile gate | 主要 class 限定 `lg`；既有 mobile CSS 保留 |
| 只看 source、實畫面仍不齊 | 使用者問題未解 | in-app browser＋DEV-028 browser | 收集真實 bounding rect 與 screenshot |

## Cases 與結果

| Case | 結果 | Evidence |
|---|---|---|
| S01 格線／箭頭／selector 靜態契約 | PASS 10/10 | DEV-112 static artifact |
| B01 1298×698 標籤與控制基線 | PASS | label top 全為 129.5px；controls top/bottom 全為 149.4875／181.4875px |
| B02 日期軌道連續且不重疊 | PASS | 128／32／128／96px，四段左右邊界相接 |
| B03 viewport 與 visible error | PASS | documentWidth=viewportWidth=1298；visible alert／inline error 0 |
| R01 DEV-028 static | PASS 48/48 | 四模式 TaskDetailsModal 契約 |
| R02 DEV-028 browser | PASS | click/details/selection、metadata geometry、390px board reachability |
| E01 TypeScript／targeted ESLint／test build | PASS | `tsc --noEmit`、ESLint 0 error、Vite test build |

## 限制

額外執行舊 `verify-task-details-mobile-meta-layout-browser.pw.js` 時，在 metadata assertions 之前等待
`[data-task-record-timeline-actions="true"]` 逾時。該 selector 屬既有會議紀錄 fixture 前置條件，並非本次修改的
`TaskDetailsModal` metadata target；因此不將此 gate 宣稱為 PASS，也不把它誤記為本次版面回歸。

## Runtime Lifecycle

本次重用已存在的 `http://localhost:4000/` local-test runtime（既有 listener PID 22260），未建立新的 app server。
DEV-028 與 mobile verifier 的隔離 browser session 已由 wrapper 結束；不終止既有 runtime。
