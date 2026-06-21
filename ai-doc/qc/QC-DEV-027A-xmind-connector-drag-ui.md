# QC-DEV-027A: Xmind-like connector line and drag UI repair

日期：2026-06-18
狀態：Browser QC Passed
對應 DEV：DEV-027A
父交付點：DEV-027
QA：`ai-doc/qa/QA-DEV-027A-xmind-connector-line-visual-validation.md`

## QC 結論

DEV-027A 通過嚴格 UI 驗證。原使用者截圖中的心智圖線條斷裂、孤立短線、父子節點無法追蹤問題已由 centralized SVG connector overlay 修正；拖曳任務時已有 ProJED 自己的即時 preview node 與 connector preview；root branch 可被拖到同一側，且 mode switch / hard reload 後同側布局意圖仍保留。

本輪 QC 判定重點不是「看得到線」而已，而是線條必須能承擔 Xmind-like branch topology：center-to-root、parent-to-child、同側 root connector 都要可追蹤，並且不得穿過節點文字、不得留下殘留 stub、不得在拖曳或 reload 後錯位。

## 本輪實作事實

- `src/components/MindMap/MindMapView.tsx`：connector 改由整張 mind map 的 SVG overlay 繪製，使用實際 node bounding box 計算 endpoint。
- `src/components/MindMap/MindMapView.tsx`：新增 drag preview state，拖曳中輸出 `data-mindmap-drag-preview` 與 `data-mindmap-drop-preview`。
- `src/components/MindMap/MindMapView.tsx`：新增 side-aware root layout 與 localStorage side placement，支援多個 root branches 在同一側。
- `src/components/MindMap/MindMapNode.tsx`：新增可驗證的 node level、direction、parent metadata，並把 drag move 事件交回 view 層。
- `scripts/verify-dev-027-xmind-connector-lines-browser.pw.js`：新增 connector 幾何 UI verifier。
- `scripts/verify-dev-027-xmind-drag-preview-browser.pw.js`：新增拖曳 preview、同側 drop、side persistence UI verifier。
- `scripts/run-playwright-code.ps1`：新增 Playwright run-code wrapper，確保 browser verifier 可穩定產出截圖證據。

## 驗證命令

```powershell
npm.cmd run verify:dev-027-xmind-like-mind-map-mode
npm.cmd exec tsc -- --noEmit
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-027-xmind-connector-lines-browser
npm.cmd run verify:dev-027-xmind-drag-preview-browser
npm.cmd run verify:dev-027-xmind-like-mind-map-browser
npm.cmd run build:test
npm.cmd run verify:core-regression-static
```

本輪已執行結果：
- `verify:dev-027-xmind-like-mind-map-mode`：Pass，31 checks。
- `tsc --noEmit`：Pass。
- `lint --quiet`：Pass。
- `verify:dev-027-xmind-connector-lines-browser`：Pass。
- `verify:dev-027-xmind-drag-preview-browser`：Pass。
- `verify:dev-027-xmind-like-mind-map-browser`：Pass。
- `build:test`：Pass；僅既有 Vite dynamic import / chunk size warning。
- `verify:core-regression-static`：Pass，10 checks。

## UI Evidence

Browser target：`http://127.0.0.1:4173/`

截圖證據：
- `output/playwright/dev-027A-connector-desktop.png`
- `output/playwright/dev-027A-connector-laptop.png`
- `output/playwright/dev-027A-connector-mobile.png`
- `output/playwright/dev-027A-drag-preview-sequence/`

幾何 verifier 檢查：
- 每條 `data-mindmap-connector-path` 必須有 `fromNodeId`、`toNodeId`、`depth`、`direction` metadata。
- connector endpoint 到來源 / 目標 node edge 距離需在 6px 內。
- 不允許 orphan-length connector stub。
- 不允許 connector path 與 node bbox 產生不可接受重疊。
- desktop `1440x900`、laptop `1024x768`、mobile `390x844` 均需通過。

拖曳 verifier 檢查：
- 拖曳中必須出現 `data-mindmap-drag-preview`。
- 拖曳中必須出現 `data-mindmap-drop-preview`。
- pointer move 後 preview bounding box 必須改變，不能只在 drop 後重排。
- root branch 可 drop 到同一側，至少兩個 root branches 需呈現相同 direction。
- mode switch 與 hard reload 後，同側 side placement 不得消失。

## Gate Result

| Gate | Result | Evidence |
|---|---|---|
| Xmind-like connector continuity | Pass | `verify:dev-027-xmind-connector-lines-browser` |
| Endpoint anchoring <= 6px | Pass | connector geometry verifier |
| Orphan segment prevention | Pass | connector geometry verifier |
| Node / text overlap guard | Pass | connector geometry verifier |
| Drag preview animation | Pass | `verify:dev-027-xmind-drag-preview-browser` |
| Same-side root drop | Pass | drag preview verifier |
| Side persistence after mode switch / reload | Pass | drag preview verifier |
| DEV-027 baseline browser flow | Pass | `verify:dev-027-xmind-like-mind-map-browser` |
| Static, type, lint, build, core regression | Pass | final regression suite |

## QC 決策

DEV-027A 可關閉。若後續要再提高 Xmind 相似度，應另開後續 DEV 處理縮放、框選、多選、自由布局、marker/icon、relationship 線、summary boundary 或 style panel；不得把這些擴張項目回塞到 DEV-027A 的 connector / drag repair 範圍。
