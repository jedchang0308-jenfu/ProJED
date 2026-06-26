# QC-DEV-034: 手機看板全區拖移改善事實驗證

狀態：Browser QC Passed
關聯規格：`ai-doc/specs/SPEC-034-mobile-board-full-surface-pan.md`
關聯 QA：`ai-doc/qa/QA-DEV-034-mobile-board-full-surface-pan.md`
驗證日期：2026-06-26

## 驗證結論

DEV-034 已完成 RD 實作與自動化 QC。手機 / coarse pointer 下仍只顯示看板模式；從卡片、下層任務、欄位空白與看板空白拖移時，browser verifier 已量測到對應 `scrollLeft` / `scrollTop` displacement，且 pan 後未誤開 `TaskDetailsModal`。

## 實作證據

- 新增 `src/hooks/useMobileBoardDragScroll.ts`。
- `BoardView` 將 hook 掛到外層 `[data-mobile-pan-surface="board"]`，並提供 `data-mobile-board-pan="true"` telemetry。
- Hook 使用 native capture touch listener，避免卡片與下層任務的 React `stopPropagation()` 阻斷 board pan 判斷。
- Hook 預設排除 input、button、拖曳把手、任務互動控制、modal / dialog / popover；欄位底部新增任務 input / button 以 `data-mobile-board-pan-allow="true"` 明確放行拖移，短點仍保留原互動語意。
- `scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js` 已從「pan 後不誤開詳情」升級為實際 scroll displacement 驗證。

## 已通過 Gate

```powershell
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-031-mobile-density-browser
npm.cmd run build
```

## 覆蓋的自動化案例

- 390x844 coarse pointer：只顯示 board mode entry。
- 卡片拖移：board `scrollLeft` 增加，且 modal count = 0。
- 下層任務水平拖移：board `scrollLeft` 增加，且 modal count = 0。
- 下層任務垂直拖移：所在 column `scrollTop` 增加，且 modal count = 0。
- 欄位空白處垂直拖移：所在 column `scrollTop` 增加。
- 看板空白處水平拖移：board `scrollLeft` 增加。
- suppress timeout 後短點卡片與下層任務：開啟對應 `TaskDetailsModal`。
- 新增任務 input：可 focus / fill。
- 新增任務 input 拖移：所在 column `scrollTop` 下降，且 modal count = 0。
- 新增任務 button 拖移：所在 column `scrollTop` 下降，且 modal count = 0。
- 390x844 visible error sweep：通過。

## 殘留風險

- 未執行人工真機手勢錄影；目前證據為 Playwright browser verifier 的 DOM displacement 與互動結果。
- 未重跑任務拖曳排序 browser smoke；本次實作以 selector 排除 `[data-task-drag-handle="true"]` 保留拖曳把手語意。
