# QA-DEV-044: 上一步復原範圍擴充與低資料庫成本治理

關聯 DEV: DEV-044
關聯 SPEC: `ai-doc/specs/SPEC-044-undo-recovery-scope-expansion.md`
狀態: Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production Smoke Passed
建立日期: 2026-07-06

## QA Goal

驗證 DEV-044 Phase 1/Phase 2 safe slice 擴充後，使用者能復原更多高頻誤操作，同時不因記錄 undo 而增加正常操作的資料庫寫入成本。

## Test Strategy

- Static verifier: 檢查 `UndoCommand` async/suppress contract、受控 action 是否推入 undo、禁止高風險 action 混入 ordinary undo。
- Browser verifier: 驗證使用者實際流程中的 undo / redo、toolbar disabled state、keyboard shortcut 與 editor history scope。
- Regression gate: 保留既有任務 undo / redo、任務複製、工作台跨看板來源、Gmail-like editor undo。
- Cost gate: Phase 1 push undo 不應觸發遠端 service write；只有按下 undo / redo 時才呼叫既有 service action。
- Phase 2 static gate: 驗證 `batchUpdateNodes` 只推一筆 `scope: 'batch'` command，並確認 Board/List/Sidebar drag 與工作台 placement caller 不再用多筆 `updateNode` 拆散 undo。

## Execution Evidence - 2026-07-06

- `npm.cmd run verify:dev-044-undo-coverage` passed，25/25；檢查 async/suppress contract、board/workspace title undo、board create stable id、filter local-only snapshot、record save/archive snapshot、高風險 exclusion、Phase 2 batch command、drag/reorder/placement caller 與 browser verifier B03 coverage。
- `npm.cmd run verify:dev-044-undo-coverage-browser` passed；覆蓋 `QA-044-B01` board title undo/redo command label、`QA-044-B02` suppress guard stack behavior、`QA-044-B03` record archive undo restore snapshot。
- `npm.cmd run verify:dev-013-task-duplicate` passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes` passed，27/27；確認工作台 placement lanes 與關閉態 top-nav/null-panel contract。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` passed。
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` passed。
- `npm.cmd run verify:dev-006-browser-input` passed；覆蓋 editor `Ctrl+Z` / `Ctrl+Y` 與 task chip copy/cut/paste。
- `npm.cmd exec tsc -- --noEmit` passed。
- Targeted ESLint passed with warnings only for existing unrelated issues in `BoardView.tsx`, `WbsListView.tsx`, and `useWbsStore.ts`。
- `npm.cmd run build:test` passed。
- `git diff --check` passed；僅 LF/CRLF warning，無 whitespace error。

## Production Release Evidence - 2026-07-06

| Gate | 結果 | 證據 |
|---|---|---|
| Release boundary | Pass | Branch `持續優化1`，release commit `b78540e`，Firebase project `projed-cc78d`，public directory `dist` |
| Production build | Pass | `npm.cmd run build`；main JS `dist/assets/index-BU14rK7W.js`，CSS `dist/assets/index-CYqvildz.css` |
| Production-like preview smoke | Pass | `http://127.0.0.1:4174/` 載入 expected bundle，root non-empty，service worker ready，無 critical console/pageerror/failed request |
| Firebase deploy | Pass | `node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive`；正式 URL `https://projed-cc78d.web.app` |
| Post-deploy production smoke | Pass | 正式站 HTTP artifact check 與 browser smoke 均載入 `index-BU14rK7W.js` / `index-CYqvildz.css`；authenticated production UI smoke passed |

未執行 / 不宣稱:

- DB schema / migration / RLS / RPC 未執行且不屬 Phase 1。
- Cross-device / reload-persistent undo 未執行且不屬 Phase 1。
- Workspace delete、permission/member、import overwrite、AI batch rewrite recovery 未納入 ordinary undo。
- Board move between workspaces 未納入 ordinary undo；現有 transfer 會處理 members / invites / tags 等副作用，需 lifecycle / audit gate。

## FMEA

| Risk | Cause | User impact | Gate | Severity |
|---|---|---|---|---|
| Undo stack 被反向 action 污染 | undo 執行時 store action 再 pushUndo | Ctrl+Z 結果錯亂或無限堆疊 | static + unit-style verifier | P0 |
| Record restore 遺失內容 | archive 前未保存完整 snapshot | 紀錄庫資料損失 | browser record archive/restore | P0 |
| Board create undo 使用 temp id | addBoard 在 backend id 尚未回來前 push command | undo 刪錯或留下幽靈看板 | static + browser board create | P0 |
| Editor Ctrl+Z 觸發全域 undo | focus scope guard 失效 | 寫紀錄時誤復原看板資料 | browser editor history regression | P1 |
| 記錄 undo 造成額外 DB write | pushUndo 時寫遠端 history | 成本增加且資料膨脹 | cost/static verifier | P1 |
| 高風險刪除被普通 undo 包裝 | board/workspace cascade delete 仍納入 Ctrl+Z | 使用者誤信可復原但資料已消失 | static guard + manual review | P0 |
| Filter undo label 不清楚 | local-only action 和 data action 混雜 | 使用者誤解復原了任務資料 | browser UI label check | P2 |

## Phase 1 Acceptance Cases

| ID | Case | Preconditions | Steps | Expected |
|---|---|---|---|---|
| QA-044-P1-001 | Workspace title undo/redo | 至少一個 workspace | 修改 workspace title，按 undo，再按 redo | title 回舊值，再回新值；無錯 workspace 更新 |
| QA-044-P1-002 | Board title undo/redo | active board exists | 修改 board title，按 undo / redo | breadcrumb、sidebar、active board title 同步 |
| QA-044-P1-003 | Board create undo | backend 回傳 stable board id | 新增看板，等待建立完成，按 undo | 新看板消失；active board 不指向不存在 id |
| QA-044-P1-004 | Board create redo | QA-044-P1-003 後 | 按 redo | 看板可再次出現且 UI 狀態一致；不得使用殘留 temp id |
| QA-044-P1-005 | Record archive undo | existing record | 封存紀錄，按 undo | 紀錄重新出現在紀錄庫；content、status、visibility、taskLinks 保留 |
| QA-044-P1-006 | Existing record save undo | existing record | 修改 title/content/visibility/taskLinks 後儲存，按 undo | 回到儲存前 snapshot |
| QA-044-P1-007 | Existing record save redo | QA-044-P1-006 後 | 按 redo | 回到儲存後 snapshot |
| QA-044-P1-008 | New record save undo | new draft | 建立並儲存新紀錄，按 undo | 新紀錄不再出現在 active list；不影響其他 records |
| QA-044-P1-009 | Filter undo local-only | active board with tasks | 切換 filter/display option，按 undo | filter/display state 回復；不呼叫遠端 node/board/record service |
| QA-044-P1-010 | Editor history guard | record editor focused | 輸入文字後 Ctrl+Z | 只復原 editor 文字，不觸發全域 board/record undo |
| QA-044-P1-011 | Toolbar label clarity | undo stack has filter and data commands | hover undo / redo | title 顯示正確 action label，例如 `復原篩選條件`、`復原紀錄變更` |
| QA-044-P1-012 | Suppress guard | undo of board/record/title action | 執行 undo / redo 後檢查 stack | 不新增反向 command 到 undoStack，redoStack 行為正常 |

## Phase 2 Safe Slice Acceptance Cases

| ID | Case | Preconditions | Steps | Expected |
|---|---|---|---|---|
| QA-044-P2-001 | Board drag batch undo | active board has at least two siblings | 拖曳任務造成 dragged node 與 sibling order 同時更新 | undo stack 只新增一筆 `移動任務位置`，一次 undo 還原所有 affected node |
| QA-044-P2-002 | WBS list reorder batch undo | list mode has at least two siblings | 同層交換順序 | undo stack 只新增一筆 `重排任務`，不需要按兩次 undo |
| QA-044-P2-003 | Left sidebar reorder batch undo | task sidebar open | 同層交換或跨層移動 | undo stack 只新增一筆 command，sidebar 與主畫面狀態一致 |
| QA-044-P2-004 | Task workbench unplaced placement undo | workbench open and draggable task exists | 任務拖到 `未歸位` lane | undo 可回到原 board/workspace/parent/order，不新增遠端 history row |
| QA-044-P2-005 | Task workbench placed-board placement undo | unplaced task exists and selected board lane exists | 任務拖回看板 | undo 可回到 unplaced local lane；redo 可歸位到看板 |
| QA-044-P2-006 | Board workspace transfer exclusion | two workspaces exist | 使用看板移動到另一 workspace | 不宣稱 ordinary undo；需 separate lifecycle/audit gate |

## Negative / Exclusion Cases

| ID | Case | Expected |
|---|---|---|
| QA-044-N-001 | Workspace delete ordinary undo | 不得被 Phase 1 ordinary undo 覆蓋；需要 confirmation / lifecycle follow-up |
| QA-044-N-002 | Permission role change ordinary undo | 不得被 Phase 1 ordinary undo 覆蓋；需 audit / permission-specific spec |
| QA-044-N-003 | Import overwrite ordinary undo | 不得被 Phase 1 ordinary undo 覆蓋；需 rollback / backup contract |
| QA-044-N-004 | AI batch rewrite ordinary undo | 不得被 Phase 1 ordinary undo 覆蓋；需 AI output versioning decision |
| QA-044-N-005 | Page reload persistent undo | Phase 1 reload 後可失去 undo stack；不得宣稱跨 session recovery |
| QA-044-N-006 | Board workspace transfer ordinary undo | 不得被 Phase 2 safe slice 普通 undo 覆蓋；現有 transfer 具有 permission/tag/invite 副作用 |

## Cost Verification

Phase 1 verifier 應攔截或 mock service calls，確認:

- `pushUndo` 不呼叫 `workspaceService`、`boardService`、`recordService`、`nodeService` 或遠端 history service。
- Workspace / board title 正常修改只呼叫一次 update；記錄 undo 不新增第二次遠端 write。
- Record save 正常操作只呼叫既有 upsert；記錄 undo 不新增 history upsert。
- Filter/display undo 不呼叫遠端 service。
- Undo / redo 呼叫的是既有正常 service action，不另寫 `undo_logs` / `versions` / `history`。
- Phase 2 batch/reorder/placement 只改變 undo stack 粒度；實際資料寫入仍是既有 node update/create/delete/localStorage path。

## Recommended Commands

```powershell
npm.cmd run verify:dev-044-undo-coverage
npm.cmd run verify:dev-044-undo-coverage-browser
npm.cmd run verify:dev-013-task-duplicate
npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser
npm.cmd run verify:dev-006-browser-input
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

## QC Handoff

QC 已回報於 `ai-doc/qc/QC-DEV-044-undo-recovery-scope-expansion.md`。QC 執行時需回報:

- 產品 diff 是否只涵蓋 DEV-044 授權範圍。
- 各 command 的 undo / redo action label。
- Stack guard 是否通過。
- Service call count / mock evidence。
- Browser screenshots 或 trace，至少包含 board title、record archive、editor Ctrl+Z。
- 明確標示未執行項目：production deploy、DB migration、persistent history、workspace delete recovery。

## Stop Conditions

- 任一 P0 / P1 case 失敗。
- 需要 DB schema / migration 才能完成 Phase 1。
- 普通操作因記錄 undo 多寫遠端資料。
- 高風險 destructive action 被包裝成一般 Ctrl+Z。
- Editor history 與全域 undo 衝突。
