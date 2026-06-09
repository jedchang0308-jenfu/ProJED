# QC-DEV-013 右鍵任務複製事實驗證報告

日期：2026-06-09
狀態：Pass
對應 DEV：DEV-013
規格：`ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md`
驗證範圍：任務右鍵複製、子樹複製、內部依賴 remap、undo/redo、PM 文件與 release gate 回歸。

## 驗證結論

DEV-013 通過 QC。程式碼與 verifier 已確認右鍵選單提供「複製任務」，複製流程會建立新的 root / descendant ids，深拷貝 detail notes，排除 archived descendants，只複製子樹內部依賴並 remap endpoints，且以單一 undo command 移除 / redo 還原複製子樹與依賴。

## 執行項目

```powershell
npm.cmd run verify:dev-013-task-duplicate
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run verify:dev-015-meeting-summary-mainline
npm.cmd run verify:dev-016-records-list-view
npm.cmd run verify:dev-017-record-sidebar-resize
npm.cmd run lint -- --quiet
npm.cmd run build
git diff --check
```

## 實際結果

- `verify:dev-013-task-duplicate`：Pass。確認 context menu action、create_task guard、dependency permission guard、archived task exclusion、field copy、detail note id renewal、internal dependency remap、parent-first persistence、single undo/redo command、SPEC / backlog / dev_task / documentation map entry。
- `verify:dev-008-task-knowledge`：Pass。任務知識片段、fallback、search 與 UI hooks 回歸通過。
- `verify:dev-011-ai-meeting-synthesis`：Pass。
- `verify:dev-012-meeting-record-quality`：Pass。
- `verify:dev-015-meeting-summary-mainline`：Pass。
- `verify:dev-016-records-list-view`：Pass。
- `verify:dev-017-record-sidebar-resize`：Pass。
- `lint`：Pass。
- `build`：Pass；僅出現既有 dynamic import / chunk size warning。
- `git diff --check`：Pass；僅出現 Git line-ending warning，未發現 whitespace error。

## 驗收對照

| 驗收項目 | 結果 | 證據 |
|---|---|---|
| 右鍵選單顯示「複製任務」 | Pass | `GlobalContextMenu.tsx` 與 `verify:dev-013-task-duplicate` |
| 需要 `create_task` 權限 | Pass | menu `disabled={!canCreateTask}` |
| 子樹複製排除 archived descendants | Pass | `collectTree` exclusion verifier |
| root 標題加上 `（副本）`，descendants 保留原標題 | Pass | store verifier |
| detail notes 使用新 note ids | Pass | `detailNotes` deep copy verifier |
| 只複製子樹內部依賴，外部依賴不複製 | Pass | internal dependency filter / remap verifier |
| 缺 dependency 權限時不可 partial copy | Pass | dependency permission guard verifier |
| parent-first persist，再寫入 dependencies | Pass | order assertion verifier |
| undo / redo 作為單一命令處理整個複製結果 | Pass | copied node / dependency removal and redo verifier |

## 問題與阻塞

- 未發現 DEV-013 阻塞。
- 本次未新增 browser automation；4173 頁面可連，但專案目前沒有直接可用的 Playwright bin。DEV-013 以程式碼 verifier、lint、build 與相關 release gate 回歸作為 QC 證據。
- Build warning 為既有 bundle chunk / dynamic import warning，未阻塞 DEV-013。
