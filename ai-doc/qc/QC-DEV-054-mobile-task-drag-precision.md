# QC-DEV-054：手機任務拖拉定位精準度事實驗證

關聯 DEV：DEV-054
關聯 SPEC：`ai-doc/specs/SPEC-054-mobile-task-drag-precision.md`
關聯 QA：`ai-doc/qa/QA-DEV-054-mobile-task-drag-precision.md`
狀態：Automated QA-QC PASS / Blocked on Physical iOS-Android Devices / Overall 未充分驗證
驗證日期：2026-08-14

## 1. 結論

- RD Rework 5 的本機 automated QA-QC：`PASS`。
- 使用者回報的「手機長按先圈選文字、沒有進入任務拖拉」已由 rendered browser 證據直接覆蓋；L1、L2、L3+ 與 Workbench 未歸位列在長按前即為 `user-select:none`，active long press 的 selection 與完整 context menu 均為 0。
- 844x390 與 1024x768 觸控 viewport 都能進入專用 touch drag session，證明不再受舊 `innerWidth <= 768` gate 影響。
- 整體 DEV 仍判定 `未充分驗證`：SPEC 明定的 iPhone Safari 與 Android Chrome 實機 50-trial gate 尚未執行。這是 release/completion gate，不否定本輪 automated PASS。

## 2. 根因與修正事實

| 層次 | 修正前事實 | RD Rework 5 |
|---|---|---|
| 瀏覽器預設行為 | `preventDefault()` 到 500ms 長按成立後才發生，原生文字圈選／iOS callout 可先啟動 | eligible task surface 從 touchstart 套用 selection/callout ownership |
| 輸入判定 | mobile action path 依 `innerWidth <= 768`，橫向手機／平板 touch 可能退回桌機 context menu | 實際 React `TouchEvent` 直接走 touch session，不以 viewport 作輸入 gate |
| 表面一致性 | L1/L2/L3+/Workbench 套用選取保護不一致 | 共用 `data-task-touch-gesture-surface` 契約覆蓋所有可長按來源 |
| 捲動副作用 | 全域 `touch-action:none` 會破壞 Workbench native pan | 僅抑制 selection/callout；Workbench 保持 `touch-action:auto` |
| 桌機回歸 | touch 修正可能影響 mouse dnd-kit、click/right-click | Mouse/Keyboard sensors、approved overlay 與桌機 context menu 保留，相關 browser suites 全通過 |

## 3. Automated QA Matrix

### 3.1 DEV-054 targeted

- Static：44/44 passed。
- Browser：R01-R15，15/15 passed。
- 主要情境：native touch buttons、long-press/armed action exactly-once、same-parent/cross-level targeting、boundary jitter、stale indicator、invalid zero-write、320/390/430 viewport、L1/L2/L3+ selection ownership、430ms/7px/9px gesture boundaries、844x390/1024x768 wide touch、Workbench native pan、placed-row no-drag。
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
- DEV-053 rendered regression evidence：`output/playwright/dev-053-task-drag-1786719548171-*`。
- 本輪在既有 dirty shared worktree 內執行，未覆寫無關變更、未 commit、未 push、未 deploy。
- Browser automation 使用 Chromium CDP 合成真實 touch lifecycle，可驗證 DOM、事件、幾何與資料寫入；不能替代 Safari/Chrome 實體裝置的 callout、手指接觸面與平台事件雜訊。

## 6. 尚待 Physical Gate

- 實機 trial workbook 已建立：`C:/Users/user/.codex/visualizations/2026/08/14/01a0005f-6eab-7ae0-87dc-69484889efab/outputs/01a0005f-6eab-7ae0-87dc-69484889efab/DEV-054-手機拖拉實機驗證表.xlsx`。工作簿含雙平台主要 50 次、P06-P12 各 66 列、下拉結果、Timecode、公式統計與裝置 gate；已通過全綠及 wrong-target 失敗雙向公式模擬、公式錯誤掃描與六分頁 visual QA。
- 2026-08-14 本機只讀偵測結果：ADB unavailable、`idevice_id` unavailable、Windows present portable devices 無 iPhone/iPad/Android；本輪沒有可由 Codex 操作的實體裝置。
- iPhone / iOS Safari：P01-P12、50 trials、裝置與版本資訊、錄影、trial sheet。
- Android / Chrome：P01-P12、50 trials、裝置與版本資訊、錄影、trial sheet。
- 每台 first-release correct 必須至少 48/50；wrong target、wrong parent、wrong action、duplicate commit 必須為 0。

Physical gate 完成前，DEV-054 不得標記 Complete 或進入 release；目前可交付結論是「RD 修正完成且 automated QA-QC 通過，等待兩平台實機簽核」。
