# QC-DEV-044: 上一步復原範圍擴充與低資料庫成本治理

關聯 DEV: DEV-044
關聯 SPEC: `ai-doc/specs/SPEC-044-undo-recovery-scope-expansion.md`
關聯 QA: `ai-doc/qa/QA-DEV-044-undo-recovery-scope-expansion.md`
狀態: Phase 1 Local Automated QC Passed / Production Not Deployed
日期: 2026-07-06

## QC Scope

本次 QC 只驗證 DEV-044 Phase 1 low-cost ordinary undo 擴充:

- `UndoCommand` 支援 async `undo` / `redo`、`scope`、`entityIds`、`mergeKey`。
- `useUndoStore` 具備 `isApplying` suppress guard，undo / redo 執行期間不污染 stack。
- 工作區 / 看板 title edit、看板新增、紀錄儲存 / 封存、篩選與顯示設定已納入 ordinary undo。
- 高風險 destructive recovery 仍排除在 ordinary undo 之外。
- Editor focus 中的文字 undo 仍由 editor history 處理。

## Evidence

| Command | Result | Coverage |
|---|---|---|
| `npm.cmd run verify:dev-044-undo-coverage` | Pass, 19/19 | Static contract: async/scope command、suppress guard、board/workspace title、stable board id、filter local-only snapshot、record save/archive snapshot、高風險 exclusion、B03 browser coverage guard。 |
| `npm.cmd run verify:dev-044-undo-coverage-browser` | Pass | Browser smoke: board title undo/redo label、suppress guard after undo、record archive undo restore snapshot。 |
| `npm.cmd run verify:dev-013-task-duplicate` | Pass | 任務複製與既有 task undo/redo regression。 |
| `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` | Pass | 全域任務平台跨看板資料來源 regression。 |
| `npm.cmd run verify:dev-006-browser-input` | Pass | Gmail-like editor input、`Ctrl+Z` / `Ctrl+Y`、task chip copy/cut/paste regression。 |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript compile gate。 |
| `npm.cmd run build:test` | Pass | Vite test-mode production build gate；僅 Browserslist/caniuse-lite outdated warning。 |
| `git diff --check` | Pass | 僅 LF/CRLF warning，無 whitespace error。 |

## Browser Evidence

- DEV-044 browser verifier writes screenshots under `output/playwright/dev-044-undo-coverage-*`.
- `QA-044-B01`: board title undo/redo command labels and final redone state.
- `QA-044-B02`: undo suppress guard prevents stack contamination after undo.
- `QA-044-B03`: record archive undo restores saved record title/content preview in records list.
- DEV-006 browser input screenshot: `output/playwright/dev-006-gmail-editor.png`.

## Cost / Data Boundary

- Phase 1 does not add `undo_logs`, `history`, `versions` or any remote history table.
- `pushUndo` remains a client-side stack operation.
- Filter / display preferences undo uses local snapshot and local preference write path.
- Record / board undo and redo use existing service actions only when the user explicitly triggers undo / redo.

## Not Executed / Not Claimed

- Production deploy and production smoke were not executed.
- DB schema, migration, RLS, RPC and remote history service were not executed.
- Cross-device or reload-persistent undo is not implemented.
- Workspace delete recovery is not implemented.
- Board delete with full child restore is not implemented.
- Permission/member/role undo, import overwrite rollback and AI batch rewrite rollback are not implemented.
- Physical-device supplemental QA is not executed.

## QC Conclusion

DEV-044 Phase 1 is locally implemented and passed the automated static/browser/regression gates listed above. The completed scope is ordinary, current-session undo expansion only. Durable recovery and production release remain separate authorization gates.
