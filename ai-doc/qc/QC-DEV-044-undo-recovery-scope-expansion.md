# QC-DEV-044: 上一步復原範圍擴充與低資料庫成本治理

關聯 DEV: DEV-044
關聯 SPEC: `ai-doc/specs/SPEC-044-undo-recovery-scope-expansion.md`
關聯 QA: `ai-doc/qa/QA-DEV-044-undo-recovery-scope-expansion.md`
狀態: Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production QC Passed
日期: 2026-07-06

## QC Scope

本次 QC 驗證 DEV-044 Phase 1 low-cost ordinary undo 與 Phase 2 safe slice 擴充:

- `UndoCommand` 支援 async `undo` / `redo`、`scope`、`entityIds`、`mergeKey`。
- `useUndoStore` 具備 `isApplying` suppress guard，undo / redo 執行期間不污染 stack。
- 工作區 / 看板 title edit、看板新增、紀錄儲存 / 封存、篩選與顯示設定已納入 ordinary undo。
- 高風險 destructive recovery 仍排除在 ordinary undo 之外。
- Editor focus 中的文字 undo 仍由 editor history 處理。
- `useWbsStore.batchUpdateNodes` 以單一 `scope: 'batch'` command 包住多筆任務 patch。
- Board/List/Sidebar drag/reorder 與 task workbench unplaced/placed placement caller 不再把同一次操作拆成多筆 undo。
- Board workspace transfer 未納入 ordinary undo，因既有 transfer 有 members / invites / tags 等副作用，不屬 strictly reversible operation。

## Evidence

| Command | Result | Coverage |
|---|---|---|
| `npm.cmd run verify:dev-044-undo-coverage` | Pass, 25/25 | Static contract: async/scope command、suppress guard、board/workspace title、stable board id、filter local-only snapshot、record save/archive snapshot、Phase 2 batch command、drag/reorder/placement caller、高風險 exclusion、B03 browser coverage guard。 |
| `npm.cmd run verify:dev-044-undo-coverage-browser` | Pass | Browser smoke: board title undo/redo label、suppress guard after undo、record archive undo restore snapshot。 |
| `npm.cmd run verify:dev-013-task-duplicate` | Pass | 任務複製與既有 task undo/redo regression。 |
| `npm.cmd run verify:dev-039-task-workbench-placement-lanes` | Pass, 27/27 | 工作台 placement lanes、unplaced/placed source、closed null-panel/top-nav entry static regression。 |
| `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` | Pass | 工作台 placement lanes browser regression。 |
| `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` | Pass | 全域任務平台跨看板資料來源 regression。 |
| `npm.cmd run verify:dev-006-browser-input` | Pass | Gmail-like editor input、`Ctrl+Z` / `Ctrl+Y`、task chip copy/cut/paste regression。 |
| `npm.cmd exec tsc -- --noEmit` | Pass | TypeScript compile gate。 |
| Targeted ESLint | Pass with warnings only | 本輪 touched files 無 ESLint error；warnings 為既有 unused / hook-deps / fast-refresh 類 warning。 |
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
- Phase 2 batch/reorder/placement only changes undo stack granularity; it does not add `undo_logs`, `history`, `versions`, schema, migration, RLS or RPC.

## Not Executed / Not Claimed

- DB schema, migration, RLS, RPC and remote history service were not executed.
- Cross-device or reload-persistent undo is not implemented.
- Workspace delete recovery is not implemented.
- Board delete with full child restore is not implemented.
- Board workspace transfer ordinary undo is not implemented because existing transfer side effects require lifecycle/audit recovery semantics.
- Permission/member/role undo, import overwrite rollback and AI batch rewrite rollback are not implemented.
- Physical-device supplemental QA is not executed.

## Production Release Evidence - 2026-07-06

| Gate | Result | Evidence |
|---|---|---|
| Release boundary | Pass | Branch `持續優化1`; release commit `b78540e`; Firebase Hosting project `projed-cc78d`; rollback target is previous Firebase Hosting release in project console. |
| Build | Pass | `npm.cmd run build`; generated `dist/assets/index-BU14rK7W.js` and `dist/assets/index-CYqvildz.css`; non-blocking Browserslist/caniuse-lite warning only. |
| Pre-deploy preview smoke | Pass | `http://127.0.0.1:4174/` loaded expected JS/CSS, root was non-empty, service worker ready, no critical console/pageerror/failed request. |
| Deploy | Pass | `node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive`; 32 files found in `dist`, 17 new uploads, version finalized and released. |
| Post-deploy HTTP artifact check | Pass | `https://projed-cc78d.web.app/` and `https://projed-cc78d.firebaseapp.com/` returned HTTP 200 and referenced `/assets/index-BU14rK7W.js` + `/assets/index-CYqvildz.css`; old `/assets/index-BXtRfIba.js` absent. |
| Post-deploy browser smoke | Pass | Production URL `https://projed-cc78d.web.app/`; app shell non-empty login shell; loaded `/assets/index-BU14rK7W.js`; no critical console/pageerror/failed request. |
| Authenticated production UI smoke | Pass | `npm.cmd run verify:dev-040-production-auth-ui-smoke`; temporary Supabase user/tenant created and cleaned; app loaded after authenticated session injection. |

## QC Conclusion

DEV-044 Phase 1 and Phase 2 safe slice are locally implemented, production released, and passed the automated static/browser/regression plus production artifact/browser/auth smoke gates listed above. The completed scope is ordinary, current-session undo expansion only: Phase 2 adds batch/reorder/placement command grouping, not durable recovery. Board workspace transfer and destructive recovery remain separate authorization gates.
