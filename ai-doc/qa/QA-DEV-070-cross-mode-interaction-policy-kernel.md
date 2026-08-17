# QA-DEV-070：跨模式互動策略核心零差異驗證計畫

- 關聯 DEV：DEV-070
- 規格：SPEC-070、SPEC-027B、SPEC-028、SPEC-029
- 架構決策：ADR-043
- QA 狀態：Plan Ready / Supports RD Implementation Ready / 未執行
- QC 狀態：Not Started
- 風險：Medium（跨模式 interaction routing、context menu、快捷鍵、transient mode 與 drag/mobile 邊界）
- Execution Boundary：本文件已可直接交 RD；本輪仍只完善文件，尚未修改／執行產品或測試程式

## 1. 驗證目標

證明 DEV-070 只改內部 routing 架構，沒有改變任何使用者可觀察行為；並證明未來 Base、Host Mode、Origin、Node Role 或 Transient 變更可精確列出影響範圍。

本 QA 不以「新 resolver 有測試」代替相容性證據。通過需要三類證據同時成立：

1. pure resolver／catalog／guard contract 正確。
2. 重構前後 golden interaction matrix 無未核准差異。
3. 真實 rendered surface、鍵盤、menu、modal、mobile gesture 與 drag regression 無漂移。

## 2. FMEA 風險優先順序

| 失效模式 | 使用者影響 | 風險 | 必要控制／證據 |
|---|---|---:|---|
| Base 變更誤套所有模式 | 多個模式同時退步 | 高 | affected-location diff、other-mode negative snapshot |
| 只記 origin、遺失 host mode | Workbench／Sidebar menu 能力錯誤 | 高 | `hostMode + origin` snapshot 與 nested-origin cases |
| menu render 時重新讀 `currentView` | 開啟後切 view 造成項目／command 漂移 | 高 | event-time location freeze case |
| legacy 與 kernel 雙重執行 | 重複建立、移動、刪除或 toast | 高 | executor count=1、mutation count=1 |
| unknown location fallback 到 board/list | 出現不該有的 action | 高 | fail-closed case、diagnostic |
| Profile 直接 mutation／繞過 Guard | 權限、安全、確認失效 | 高 | architecture static check＋direct command denial |
| 心智圖 Enter／Tab 被全域 Enter 覆蓋 | 結構編輯失效 | 高 | keyboard mode matrix |
| relationship／dependency／record mode 被一般 click 攔截 | 暫時操作失效或誤開詳情 | 高 | transient precedence browser cases |
| drag mouseup click-through | 移動後誤開詳情 | 高 | move／resize／no-move pair cases |
| mobile short pan／long press 漂移 | 誤開詳情、不能捲動或刪除誤觸 | 高 | DEV-029 full targeted regression |
| task menu item/order/enabled 漂移 | 功能消失、權限誤判 | 高 | stable action ID snapshot＋role matrix |
| post-create 漂移 | 命名入口或 selection 改變 | 高 | before/after state＋modal identity |
| selection／modal lifecycle 漂移 | 殘留選取框或錯 task detail | 中 | selected ID／modal ID／close/ESC cases |
| UI 加入 debug／migration 資訊 | 介面雜訊與工程資訊外洩 | 中 | information-noise sweep |

## 3. Test Harness 與 Golden Master 契約

### 3.1 Baseline 時點

- WP0 必須在 DEV-070 產品 wiring 修改前，以當時 HEAD、working-tree boundary、fixture version 與 runtime URL 建立 baseline。
- 若開工時 worktree 與本計畫日期不同，必須重錄；不得沿用舊 screenshot 或聊天記憶。
- baseline 與 after snapshot 必須使用相同 fixture、viewport、permission role、host mode、origin 與 trigger sequence。
- S0 是 RD 可直接執行的第一片；baseline 尚未產生不構成規格缺口，但 S0 未通過前不得進 S1 以後的任何產品 wiring。

### 3.2 可機讀 artifact

每個 case 至少保存下列結構或語意等效格式；內容不得含真實個資：

```json
{
  "schemaVersion": 1,
  "gitHead": "<sha>",
  "fixtureId": "dev-070-v1",
  "interactionId": "fixture-interaction-id",
  "location": { "hostMode": "board", "origin": "task-workbench" },
  "surfaceId": "task-workbench.placed-row",
  "nodeRole": "task",
  "modality": "fine-pointer",
  "trigger": "pointer.secondary",
  "transientOwners": [],
  "blockers": [],
  "resolved": {
    "actionId": "task.open-menu",
    "sourceLayer": "origin",
    "suppressedReason": null
  },
  "menu": {
    "actionIds": [],
    "enabled": {}
  },
  "effects": {
    "selectedTaskId": "fixture-task-id",
    "detailsTaskId": null,
    "commandCount": 0,
    "mutationCount": 0,
    "commandOutcome": null
  },
  "visibleErrors": []
}
```

動態值（timestamp、DOM-generated ID、animation frame、座標微差）必須 normalize；task ID、Action ID、menu order、enabled state、modal identity、command／mutation count 不得 normalize 掉。

### 3.3 Runtime lifecycle

- DEV-070 destructive local-test seed 固定使用 task-owned `127.0.0.1:4000` 或另一個已記錄的臨時 port；不得在受保護的 `127.0.0.1:4173` 清 localStorage、換 fixture、停止、重啟或清除 port。
- 啟動臨時 runtime 前記錄 project、purpose、port、process tree 與 cleanup condition；完成後只清理該 task-owned process tree，確認臨時 port 已釋放，並再次確認 4173 仍 listening／頁面可達。
- QA baseline 不得要求 production、遠端 provider、schema 或真實帳號資料。

### 3.4 Frozen fixture／artifact contract

- fixture ID：`dev-070-v1`；workspace `dev070-workspace`、board `dev070-board`、cross-board `dev070-board-b`、owner `local-test-user`、denied role `local-test-viewer`。
- required task IDs：`dev070-root-a`、`dev070-card-a`、`dev070-card-completed`、`dev070-child-a`、`dev070-deep-a`、`dev070-milestone-a`、`dev070-other-board-task`、`task_workbench_unplaced_dev070`。
- source of truth 是 `scripts/verify-dev-070-interaction-kernel-browser.pw.js` 內的 frozen seed；baseline／after 必須記錄 fixture hash。若 seed 有任何欄位改動，舊 baseline 作廢並回 S0，不得只更新 after expected。
- artifact 根目錄固定 `output/playwright/dev-070/{baseline,after,diff}`；`interaction-matrix.json`、三 viewport screenshots、visible-error sweep 與 diff 不得缺一。
- Browser runner 必須以 `DEV070_ARTIFACT=<single-line-json>` marker 輸出，`run-dev-070-interaction-kernel-browser.ps1 -Phase baseline|after` 保存；after 不可覆寫 baseline。

## 4. Pure Resolver／Profile Cases

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-070-001 | P0 | 同一完整 context 重複解析 100 次，輸出 deep-equal，resolver 無 store／DOM／Date／random side effect |
| QA-070-002 | P0 | `undefined` 繼承上一層；明確 `disabled` 停用；null／missing 不得意外覆蓋 |
| QA-070-003 | P0 | precedence 固定為 Base → TaskDefault → HostMode → Origin → NodeRole → Transient；Guard 不參與 profile merge |
| QA-070-004 | P0 | unknown host mode、origin、trigger、Action ID 均 fail closed，輸出 diagnostic，不 fallback 到 list／board |
| QA-070-005 | P1 | resolved output 正確標記 source layer；相同 action 被較窄層覆寫時可追溯 |
| QA-070-006 | P0 | 修改 Base 可列出所有 changed locations；未命中的 location 不能漏報 |
| QA-070-007 | P0 | 只改 mindmap HostMode snapshot，list／board／gantt／calendar 與所有 origin 均 zero diff |
| QA-070-008 | P0 | 只改 task-workbench Origin，mode-primary／shared-sidebar／calendar-segment zero diff |
| QA-070-009 | P0 | `(board, task-workbench)` composite override 不污染同 origin 的其他 host mode |
| QA-070-010 | P0 | Profile object deep-freeze／readonly；resolver 與 command 不把 runtime mutable state寫回 Profile |
| QA-070-011 | P0 | Action Catalog stable ID 唯一；每個 mutation action 恰有一個 command；presentation／selection action 不誤掛 mutation |
| QA-070-012 | P0 | `task.delete-request` 只開確認；未確認 mutation=0；確認後 delete command=1 |
| QA-070-013 | P0 | permission 在 menu enabled 與 direct command invocation 都生效；偽造 Profile 不可繞過 Guard |
| QA-070-014 | P0 | shadow-resolve 階段 kernel command count 永遠為 0；kernel-authoritative 階段 legacy executor count 為 0 |
| QA-070-015 | P1 | migration manifest 只允許四個狀態與合法單向 transition；不寫 backend／localStorage |
| QA-070-016 | P0 | Trigger=`replace`、Menu=`patch-by-action-id`、metadata=`catalog-only`、permission=`deny-wins`、Command=`non-mergeable`；不得落入通用 deep merge |
| QA-070-017 | P0 | menu include／exclude 依 stable ID 合併；預設 Catalog section/order 不漂移；missing anchor、duplicate ID、Profile 強設 enabled 均 configuration error |
| QA-070-018 | P0 | exclusive transient owner 0/1 個正常；2 個以上回 `transient-owner-conflict`、action=null、command=0，不自行選優先者 |
| QA-070-019 | P0 | 同一 interactionId 重送 pointerup／touchend／click 時 mutation 最多 1 次；outcome 可區分 executed／noop／denied／cancelled／failed且 denied 不 fallback |

## 5. Location Snapshot／Task Menu Cases

目前 task menu 的相容性集合需由 WP0 實錄；下表是必驗語意，不以文件硬寫結果取代 baseline：

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-070-020 | P0 | List mode-primary 右鍵：action IDs、順序、enabled、divider 與執行結果 before=after |
| QA-070-021 | P0 | Mindmap mode-primary 右鍵：before=after、無外層 rename、無未支援依賴項目 |
| QA-070-022 | P0 | Board L1／L2／L3+ 右鍵：before=after，依賴開始／結束與 assignment 能力不漂移 |
| QA-070-023 | P0 | Gantt task bar 與 shared-task-sidebar 分別記錄 origin；menu before=after |
| QA-070-024 | P0 | Calendar segment 以 calendar host／origin 開 menu，before=after，不因 kernel 出現 board/list action |
| QA-070-025 | P0 | Task Workbench 在每個實際可出現的 host mode 逐一錄製；origin 相同但 host 能力正確繼承 |
| QA-070-026 | P0 | 開 menu 後以 test harness 改變 current view；新架構固定以 open-time location／target snapshot 執行，且正常使用路徑的 before／after menu snapshot 仍 zero diff；此 internal invariant 不以 legacy 的 render-time 猜測作 expected |
| QA-070-027 | P0 | task A 開 menu 後 selection／view 改成 task B；執行 action 仍依既有 menu target lifecycle，不誤改 B |
| QA-070-028 | P0 | canCreate／edit／move／delete／assign／dependency 各自 denied；menu enabled 與 command denial before=after |
| QA-070-029 | P1 | menu 靠 viewport 邊緣、長 title、低高度 1024x768；位置、maxHeight、scroll owner 無漂移 |

## 6. Primary Action／Keyboard／Post-create Cases

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-070-030 | P0 | List task body click：selected ID 與 details modal task ID 正確；close／ESC 後 lifecycle before=after |
| QA-070-031 | P0 | Mindmap node click：selected node＋details；relationship／drag active 時不誤開 |
| QA-070-032 | P0 | Board L1／L2／L3+ click：selected ID＋details；status／assignee／date／dependency／expand／drag controls 不誤開 |
| QA-070-033 | P0 | Gantt bar／Shared Sidebar click：details 正確；move／resize 有位移時 suppress，無位移 click 保留 |
| QA-070-034 | P1 | Calendar／Workbench primary click before=after，沒有新增未核准 keyboard binding |
| QA-070-035 | P0 | List／Board／Gantt 已選 task 按 Enter 開詳情；input、modal、IME composition 時不攔截 |
| QA-070-036 | P0 | Mindmap Enter 建同階、Tab 建子階、四方向導航；不被全域 Enter handler 開詳情或外層 rename |
| QA-070-037 | P0 | Escape 依窄到廣關閉 transient／menu／details／selection，before=after，不觸發 mutation |
| QA-070-038 | P1 | Shift+F10 若 WP0 無現行 binding，after 仍 disabled；不得因 Base capability 新增行為 |
| QA-070-039 | P0 | List／Mindmap／Board／Workbench／drag-create 等目前 post-create 入口，selected／pending title／modal／task count before=after |
| QA-070-040 | P0 | 連續 Enter／Tab／post-create event 不重複建立；每次 successful create 對應一個 post-create command |

## 7. Transient／Drag／Mobile Cases

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-070-050 | P0 | Mindmap relationship draft、line label edit、control point、node drag 優先於 task open-details |
| QA-070-051 | P0 | Board dependency selection 點 target 執行既有依賴流程，不開一般 details |
| QA-070-052 | P0 | Record capture／task mention mode 點 task 插入 mention，不開 details、不改一般 profile |
| QA-070-053 | P0 | Desktop drag start／move／drop、no-op、cancel、mouse up：commit／Undo／click suppression before=after |
| QA-070-054 | P0 | 390x844 quick tap 無位移開 details；短滑水平／垂直可 pan 且不開 details/action rail |
| QA-070-055 | P0 | mobile long press 450–550ms 進單一 action mode；rail 恰為完成、新增同階、新增子階、刪除 |
| QA-070-056 | P0 | mobile delete tap／drop 只開確認；cancel mutation=0；confirm mutation=1 |
| QA-070-057 | P0 | mobile add sibling／child、complete、task-position drop 各 command=1，無重複 task／錯序 |
| QA-070-058 | P0 | touchcancel／pointercancel／blur／pagehide／hidden／Escape／timeout 退出 action mode且不 commit |
| QA-070-059 | P0 | DEV-053／054／055／067／068 受影響 targeted verifier 全通過；任一首個失敗即停止 cleanup |

## 8. Rendered UX／Accessibility／Visible-error Cases

| Case | Viewport | Priority | 驗證步驟／Expected |
|---|---:|---:|---|
| QA-070-060 | 1440x900 | P0 | 四主模式 click、keyboard、context menu、details、selection 截圖／DOM before=after |
| QA-070-061 | 1024x768 | P0 | menu、modal、Workbench、Gantt sidebar 無遮擋、裁切、非預期 overflow 或 scroll-owner 漂移 |
| QA-070-062 | 390x844 | P0 | Board／Workbench quick tap、pan、long press、action rail viewport-safe；非開放模式仍不出現 |
| QA-070-063 | all | P0 | `.inline-error`、`[role=alert]` failure、HTTP 4xx/5xx、Not Found、raw `/api/`、console/page error sweep 為空 |
| QA-070-064 | all | P1 | hover／focus／selected／disabled／pressed state before=after；顏色不是唯一 permission/selection 訊號 |
| QA-070-065 | all | P1 | 產品 UI 不出現 DEV-070、profile layer、migration state、source layer、raw action ID 等工程資訊 |
| QA-070-066 | keyboard | P1 | context menu／actions 維持可聚焦、可關閉、disabled 不可執行；focus 不被重構後遺失 |

## 9. Acceptance Traceability

| Acceptance | 自動化／結構證據 | Rendered／操作證據 |
|---|---|---|
| AC-070-001 | QA-070-001～005、016～018 | configuration error 不進 authoritative runtime |
| AC-070-002 | QA-070-007～010 | other-location negative diff |
| AC-070-003 | QA-070-020～027 | menu 開啟後切 view／selection 的 target identity |
| AC-070-004 | QA-070-011～013、017、028 | denied menu／direct command 與 delete confirmation |
| AC-070-005 | QA-070-020～040 | QA-070-060～063 before／after evidence |
| AC-070-006 | QA-070-035～038 | keyboard focus／IME／modal true operation |
| AC-070-007 | QA-070-030～034 | 四模式 click、control exclusion、modal identity |
| AC-070-008 | QA-070-017、020～029 | menu section／order／enabled／viewport |
| AC-070-009 | QA-070-039～040 | new task selection／pending title／details identity |
| AC-070-010 | QA-070-018、050～053 | relationship／dependency／record／drag true operation |
| AC-070-011 | QA-070-054～059 | QA-070-062 mobile rendered evidence |
| AC-070-012 | QA-070-006～009 | affected-location 與 negative diff artifact |
| AC-070-013 | QA-070-014～015、019 | shadow／authoritative executor counter |
| AC-070-014 | QA-070-019、040、057 | repeated event、post-create、mobile action command count |
| AC-070-015 | QA-070-029、060～066 | 三 viewport、focus、visible-error、noise sweep |
| AC-070-016 | QA-070-015＋required source/static boundary | browser network／storage spy negative evidence；無對應 API 時記錄「not applicable」與 source proof |

任何 AC 缺少可重現 evidence 即為未通過；不得只以相鄰 QA case 或 RD 自述推定覆蓋。

## 10. WP Exit Gate 與 Regression Commands

| Work Package | Exit gate |
|---|---|
| WP0 | QA-070-020～040 baseline artifact 完整；既有 DEV-027B／028／029 綠燈 |
| WP1 | QA-070-001～019 通過；shadow command count=0 |
| WP2 | QA-070-020～029 通過；menu snapshot zero diff；executor count=1 |
| WP3 | 每遷移一 mode，該 mode 030～040 通過且其他 mode negative diff=0 |
| WP4 | QA-070-050～066 與 auxiliary location cases 通過 |
| WP5 | 全矩陣、dead-path、targeted regressions、TypeScript、build 通過 |

Slice promotion rule：每個 binding 只可 `legacy-only → shadow-resolve → kernel-authoritative → legacy-removed`。S3～S10 每次 promotion 都需保存當片 browser evidence、其他 location negative diff、legacy/kernel executor count；沒有證據不得批次把多個 binding 直接改成 `legacy-removed`。

S0 baseline 指令介面固定為：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-dev-070-interaction-kernel-browser.ps1 -Phase baseline -BaseUrl http://127.0.0.1:4000/ -OutputDirectory output/playwright/dev-070
```

S3～S11 after／diff 指令介面固定為：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-dev-070-interaction-kernel-browser.ps1 -Phase after -BaseUrl http://127.0.0.1:4000/ -OutputDirectory output/playwright/dev-070
npm.cmd run verify:dev-070-interaction-kernel
```

上述 runner 只連已登記的 temporary runtime；由 runtime owner 依 AGENTS boundary 啟停／清理，不得由 verifier 終止未知 process。

實作完成後最低命令集合：

- `npm.cmd run verify:dev-070-interaction-kernel`
- `npm.cmd run verify:dev-070-interaction-kernel-browser`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`
- `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency`
- `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser`
- `npm.cmd run verify:dev-054-mobile-task-drag-precision`
- `npm.cmd run verify:dev-054-mobile-task-drag-precision-browser`
- `npm.cmd run verify:dev-055-desktop-task-drag-target-clarity`
- `npm.cmd run verify:dev-055-desktop-task-drag-target-clarity-browser`
- `npm.cmd run verify:dev-067-kanban-l1-drag`
- `npm.cmd run verify:dev-067-kanban-l1-drag-browser`
- `npm.cmd run verify:dev-068-task-title-center-child-drop`
- `npm.cmd run verify:dev-068-task-title-center-child-drop-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`

若 package script 在實作前改名，QC 必須記錄實際替代命令；不得靜默略過。DEV-053～068 只執行實際受 wiring 影響的 targeted 集合，但 DEV-054 mobile、DEV-055 desktop 及直接命中的 DEV-067／068 預設不可省略。

### 10.1 Evidence owner／handoff

| 產物 | 產生者 | Review／裁決者 | Gate |
|---|---|---|---|
| S0 fixture、baseline matrix、fixture hash | RD | QA review | 未核准不得接 wiring |
| pure resolver／catalog／guard／dedupe result | RD | QA review | P0/P1 fail=0 |
| 每片 shadow／authoritative diff | RD | QA review | other-location diff=0、executor=1 |
| 三 viewport screenshots、keyboard/menu/modal、mobile/drag true operation | QC 獨立執行 | QA 彙整；PM 查狀態 | QC 不改產品碼；finding 回 RD |
| 最終 spec/implementation drift、交付狀態 | Dev PM | Human/Release owner | QA/QC PASS 仍不等於 release |

RD 自測結果只可標 `RD Self-Test`; QA 在證據完整前維持 `未執行／執行中`，QC 未獨立驗證前不得標 `PASS`。

## 11. Stop Conditions／Failure Routing

- 任一 P0 before／after diff、雙重 executor、permission bypass、dangerous action bypass 或 unknown fallback：停止當前 WP，回 RD 修 resolver／adapter，不修改產品契約。
- baseline 無法重現、fixture 漂移或舊 spec drift 迫使測試選擇產品行為：標記 `Blocked Human Re-entry`，不得用 update snapshot 解決。
- 只有 snapshot 因刻意產品需求改變時才能更新，且須有新的 Change ID、Spec Impact 與使用者決策來源。
- 任一 visible runtime error、關鍵 viewport 不可操作或 mobile pan/drag regression：QA/QC 不通過。
- 需要 provider、schema、migration、RLS、production 或 deployment：超出 DEV-070，停止並回 Dev PM 分流。

## 12. Exit Criteria

- 本計畫 57 項 in-scope required cases 全部 PASS，16 項 AC 均有直接證據，P0／P1 finding=0。
- golden master before／after 未核准 diff=0；Action executor count 恆為 1。
- `SPEC-070`、`ADR-043`、DEV-070、QA evidence 與實際實作一致，Spec Drift 判定為 `In sync / No contract drift`。
- QC 報告需記錄 route、viewport、fixture、操作、visible-error sweep、screenshots／trace、命令與殘餘限制；未執行前不得標 PASS。
- 不包含 deploy／release；local QA/QC PASS 也不等於 Release Ready。
