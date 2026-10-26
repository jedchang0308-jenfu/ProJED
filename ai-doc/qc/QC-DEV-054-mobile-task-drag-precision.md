# QC-DEV-054：手機任務拖拉定位精準度事實驗證

關聯 DEV：DEV-054
關聯 SPEC：`ai-doc/specs/SPEC-054-mobile-task-drag-precision.md`
關聯 QA：`ai-doc/qa/QA-DEV-054-mobile-task-drag-precision.md`
狀態：歷史 Automated QA-QC PASS；現行自用裝置確認待補，雙平台量化阻塞已解除
歷史驗證日期：2026-08-14；2026-10-19 由 RD 更新契約／關卡說明，不改歷史觀測為新 QC PASS。

## 1. 結論

- RD Rework 5 的本機 automated QA-QC：`PASS`。
- 使用者回報的「手機長按先圈選文字、沒有進入任務拖拉」已由 rendered browser 證據直接覆蓋；L1、L2、L3+ 與 Workbench 未歸位列在長按前即為 `user-select:none`，active long press 的 selection 與完整 context menu 均為 0。
- 844x390 與 1024x768 觸控 viewport 都能進入專用 touch drag session，證明不再受舊 `innerWidth <= 768` gate 影響。
- 2026-08-24 補充 QC：390x844 shared inline Workbench 中，新建未歸位任務已跨面板命中右側 `qc-card-1`，`boardId` 從 `__task_workbench_unplaced__` 更新為 `local-test-mobile-ui-board`，`terminal:complete` exactly once；placed row 仍不可拖。
- 歷史雙平台實機量化驗證未執行；現行要求已由 SPEC §9.2／QA §8–§10 取代。DEV-054 保留實際自用裝置重點確認，不因另一平台缺席、無工作簿或無錄影阻塞，也不阻擋 DEV-097。未測實機不標 PASS。

## 2. 根因與修正事實

| 層次 | 修正前事實 | RD Rework 5 |
|---|---|---|
| 瀏覽器預設行為 | `preventDefault()` 到 500ms 長按成立後才發生，原生文字圈選／iOS callout 可先啟動 | eligible task surface 從 touchstart 套用 selection/callout ownership |
| 輸入判定 | mobile action path 依 `innerWidth <= 768`，橫向手機／平板 touch 可能退回桌機 context menu | 實際 React `TouchEvent` 直接走 touch session，不以 viewport 作輸入 gate |
| 表面一致性 | L1/L2/L3+/Workbench 套用選取保護不一致 | 共用 `data-task-touch-gesture-surface` 契約覆蓋所有可長按來源 |
| 捲動副作用 | 全域 `touch-action:none` 會破壞 Workbench native pan | 僅抑制 selection/callout；Workbench 保持 `touch-action:auto` |
| 桌機回歸 | touch 修正可能影響 mouse dnd-kit、click/right-click | Mouse/Keyboard sensors、approved overlay 與桌機 context menu 保留，相關 browser suites 全通過 |

## 3. 歷史 Automated QA Matrix（以下為原執行證據）

### 3.1 DEV-054 targeted

- Static：45/45 passed。
- Browser：R01-R15，15/15 passed。
- 主要情境：native touch buttons、long-press/armed action exactly-once、same-parent/cross-level targeting、boundary jitter、stale indicator、invalid zero-write、320/390/430 viewport、L1/L2/L3+ selection ownership、430ms/7px/9px gesture boundaries、844x390/1024x768 wide touch、Workbench native pan、unplaced 跨 inline 分欄歸位、placed-row no-drag。
- Runtime：console errors 0、network failures 0、visible errors 0、horizontal overflow 0。

### 3.2 相鄰拖拉回歸

| Gate | Result |
|---|---|
| DEV-029 mobile pan-first static / browser | 39/39；41 browser cases passed |
| DEV-039 Workbench placement static / browser | 31/31；browser passed |
| DEV-046 universal task surface static / browser | 31/31；browser passed |
| DEV-053 muscle-memory static / browser | 30/30；10/10 passed |
| DEV-055 desktop clarity static / browser | 27/27；16/16 passed |
| DEV-067 L1 drag static / browser | 13/13；8/8 passed |

### 3.3 Engineering gates

- `npx tsc -b --pretty false`：passed。
- Targeted ESLint：0 errors；`BoardView.tsx` 保留 2 個非本輪新增 warning。
- `npm run build:test`：passed。
- `git diff --check`：passed；僅工作樹既有 LF/CRLF 通知。

## 4. 零容忍判定

| 指標 | 結果 |
|---|---|
| Native text selection / iOS-style callout path | 0 observed |
| Mobile fallback to desktop context menu | 0 |
| Wrong target / wrong parent | 0 |
| Duplicate action or move commit | 0 |
| Invalid/stale target write | 0 |
| Placed Workbench row drag | 0 |
| Console / network error | 0 |

## 5. Evidence Boundary

- 最新 DEV-054 rendered evidence：`output/playwright/dev-054-mobile-drag-1786719820247-*`。
- 2026-08-24 inline Workbench rendered evidence：`output/playwright/dev-054-mobile-drag-1787570225277-R15-workbench-to-inline-board.png`；該輪 browser `15/15`、console/network error 0。
- DEV-053 rendered regression evidence：`output/playwright/dev-053-task-drag-1786719548171-*`。
- 本輪在既有 dirty shared worktree 內執行，未覆寫無關變更、未 commit、未 push、未 deploy。
- Browser automation 使用 Chromium CDP 合成真實 touch lifecycle，可驗證 DOM、事件、幾何與資料寫入；不能替代 Safari/Chrome 實體裝置的 callout、手指接觸面與平台事件雜訊。

## 6. 歷史實機附件與現行剩餘確認

- 實機 trial workbook 已建立：`C:/Users/user/.codex/visualizations/2026/08/14/01a0005f-6eab-7ae0-87dc-69484889efab/outputs/01a0005f-6eab-7ae0-87dc-69484889efab/DEV-054-手機拖拉實機驗證表.xlsx`。工作簿含雙平台主要 50 次、P06-P12 各 66 列、下拉結果、Timecode、公式統計與裝置 gate；已通過全綠及 wrong-target 失敗雙向公式模擬、公式錯誤掃描與六分頁 visual QA。
- 2026-08-14 本機只讀偵測結果：ADB unavailable、`idevice_id` unavailable、Windows present portable devices 無 iPhone/iPad/Android；本輪沒有可由 Codex 操作的實體裝置。
- 上述 workbook／裝置偵測是歷史附件，現行不再要求雙平台固定次數、成功率與逐筆錄影／簽核；不刪除或改寫當時未執行的事實。
- 剩餘確認：實際常用裝置的原失敗路徑與主要拖拉／action／取消及復原，簡記版本、裝置與結果。錯誤 target／parent／action、duplicate effect 或 cancel write 仍判失敗；未測平台標未驗證。

目前 DEV-054 保持「驗證中／自用裝置確認待補」；本次治理修正與 RD 自查不等於新獨立 QC 或實機驗收。DEV-097 依自身驗收前進，正式發布仍需其既有 release gate。

2026-10-19 RD 自查續接見 [QA §15](../qa/QA-DEV-054-mobile-task-drag-precision.md#15-2026-10-19-精簡實作與-rd-自查)：DEV-054 46/46 static、15/15 browser，DEV-053／029 各5項選測及兩個選測器負向均符合預期；原R01／R15版型預期失敗保留。此補記不改上方歷史QC的身分、版本或結果。
