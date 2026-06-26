# ProJED Dev Task Control Board

## PM Update - 2026-06-19

### DEV-028: 四模式一致的 Trello-like 任務操作契約

狀態: Implemented / Browser Smoke Passed / Manual Click QC Pending (2026-06-26)
節點類型: 交付點
優先級: P0 UI/UX interaction consistency
父交付點: 無
是否計入產品交付完成: 是
建立日期: 2026-06-26

關聯需求:
- 使用者要求目前任務操作從「點擊即編輯」改為接近 Trello 的操作邏輯，降低 Trello 使用者跳槽摩擦。
- 使用者進一步指定清單、心智圖、看板、甘特四個模式必須高度一致，建立跨模式肌肉記憶。
- 使用者明確排除兩項: 不做看板卡片正面資訊降噪；不把 Level 3+ 下層任務預設收進 Card back。

任務目標:
- 四模式單擊既有任務都先選取該任務，再開啟同一個 `TaskDetailsModal`；關閉詳情後保留選取狀態。
- 四模式任務名稱不再因單擊任務或標題直接進入編輯。
- 改名改由明確入口觸發: 鉛筆、右鍵重新命名、`t`、F2；心智圖保留選取後直接打字改名。
- 新增任務命名採 2C: 桌機四模式新增後只選取新任務，直接打字才開始改名；手機新增後自動開命名鍵盤。
- 快捷鍵採 1A: 清單、看板、甘特 `Enter` 開詳情；心智圖 `Enter` 保留新增同階。
- 右鍵/長按採 3A: 四模式都開任務操作選單；心智圖關聯線建立改走 toolbar、快捷鍵或 selected-node action。
- 保留四模式專用能力: 心智圖鍵盤/關聯線、看板 Level 3+ 正面顯示、甘特排程拖曳、會議紀錄任務選取模式。
- 詳情容器採 5A: 保留既有 `TaskDetailsModal`；選取視覺採 6A: 最小 selected highlight / ring。

交付文件:
- `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md`
- `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md`

RD exit gate:
- Added DEV-028 static / browser verifiers covering list, mind map, board, and Gantt click-to-details, selected-state retention, explicit rename, new-task naming, task context menu, and drag/click collision.
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`: Pass, 29/29
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`: Pass
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`: Pass
- `npm.cmd exec tsc -- --noEmit`: Pass
- `npm.cmd run lint -- --quiet`: Pass
- `npm.cmd run build:test`: Pass
- QA manual click validation plan updated on 2026-06-26; DEV-028 still requires MAN-028-001 to MAN-028-027 human-operated click evidence before calling manual QC complete.

### DEV-027F: Mind map UI polish after relationship-line QC

Status: Implemented / Browser QC Passed (2026-06-19)

Scope:
- Fix visible UI errors found after DEV-027E relationship-line implementation.
- Align selected relationship editor/panel/hit targets with `ui-ux-design-principles` viewport and target-size expectations.
- Provide screenshot evidence.

Delivered:
- Relationship style panel and inline label editor moved to viewport-level overlays with clamp positioning.
- Relationship line/label hitboxes and endpoint/control handles moved to viewport-level overlays so they do not shrink under zoom.
- Relationship overlay coordinates recompute on canvas scroll.
- Existing relationship hitboxes are disabled during relationship creation mode to avoid blocking task selection.
- Arrow marker size no longer inflates when the selected line becomes thicker.
- Screenshot evidence: `output/playwright/dev-027F-mindmap-ui-desktop.png`, `output/playwright/dev-027F-mindmap-ui-mobile.png`.
- QC evidence: `ai-doc/qc/QC-DEV-027F-mindmap-ui-polish.md`.

Verified:
- `npm.cmd run verify:dev-027f-mindmap-ui-polish-browser`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`: Pass
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity`: Pass
- `npm.cmd exec tsc -- --noEmit`: Pass
- `npm.cmd run lint -- --quiet`: Pass
- `npm.cmd run build:test`: Pass, with existing Vite chunk-size/dynamic-import warnings

### DEV-027E: Xmind-like note relationship line UX parity

Status: Implemented / Browser QC Passed (2026-06-19)

Completion evidence:
- Implemented Xmind-like note relationship line object interactions in `src/components/MindMap/MindMapView.tsx` and `src/components/MindMap/MindMapNode.tsx`.
- Added inline label creation/editing, line/label selection, Space edit, Delete/Backspace delete, endpoint/control-point drag, endpoint reconnect, style popover, selected-node toolbar flow, `Ctrl+Shift+R`, and task right-click start flow.
- SVG overlay no longer blocks task nodes; relationship interaction is handled by HTML line hitboxes and handles.
- QC evidence added: `ai-doc/qc/QC-DEV-027E-xmind-note-relationship-line-ux-parity.md`.
- Added gates: `verify:dev-027e-xmind-note-relationship-line-ux-parity` and `verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`.

Verified:
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`: Pass
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines`: Pass
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`: Pass
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`: Pass
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`: Pass
- `npm.cmd exec tsc -- --noEmit`: Pass
- `npm.cmd run lint -- --quiet`: Pass
- `npm.cmd run build:test`: Pass, with existing Vite chunk-size/dynamic-import warnings

狀態：Ready
類型：後續開發點 / 心智圖 UI/UX parity
關聯：DEV-027C

需求摘要：
- DEV-027C 已完成筆記型關聯線 MVP，但目前仍不像 Xmind 的 Relationship 圖形物件。
- 本輪文件依 Xmind 官方 Relationship / Text / Mind Mapping 說明，整理 ProJED 差異與後續開發範圍。
- 關聯線仍維持筆記功能，不做任務依賴、不改排程、不做功能連動。

主要差距：
- ProJED 目前主要靠 toolbar 進入兩點建立；Xmind 支援選 topic、toolbar、Insert menu、兩 topic 建立、快捷鍵。
- ProJED label 使用 prompt；Xmind 可選線後 Space、雙擊、右鍵 Edit 直接編輯文字。
- ProJED 線條本體不可直接點選，主要靠 label hitbox；Xmind Relationship 是可選取圖形物件。
- ProJED endpoint 只是顯示，不可拖；Xmind 有 circular endpoints 與 square control points。
- ProJED 樣式固定；Xmind 可調線型、粗細、顏色、箭頭與文字樣式。

交付文件：
- `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md`
- `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md`

RD exit gate:
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity`
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`

### DEV-027D: Mind map date display and existing filter integration

狀態：Implemented / QC Pending
類型：功能補強 / 心智圖 UX parity
關聯：DEV-027 / DEV-027B / DEV-027C

需求摘要：
- 心智圖任務節點新增日期顯示，一個任務仍是一個 branch，日期作為節點內輔助 metadata。
- 日期顯示沿用既有規則：`showStartDate=true` 時顯示開始日；結束日存在時顯示結束日。
- 心智圖任務 visibility 沿用既有 WBS filter：狀態、到期日、負責人、標籤。
- filter 規則與現有 WBS 一致：父任務被 filter 隱藏時，子任務不孤立顯示。

交付文件：
- `ai-doc/specs/SPEC-027D-mindmap-date-display-filter.md`
- `ai-doc/qa/QA-DEV-027D-mindmap-date-display-filter.md`
- `ai-doc/qc/QC-DEV-027D-mindmap-date-display-filter.md`

RD exit gate:
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`

### DEV-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview polish

最新變更（2026-06-19）：
- 新增任務後只選取，不立即進入編輯。
- 可連續按 `Enter` / `Tab` 建立同階或子階任務；此流程不依賴 rename input。
- 方向鍵可移動選取任務。
- 選取任務後直接打字才進入 rename mode；rename input 內 `Enter` 只 commit 名稱。
- QC 已依最新 verifier 重新驗證並通過，狀態維持 Browser QC Passed。

狀態: Implemented / Browser QC Passed
節點類型: 開發點
優先級: P0 UI quality reopen
父交付點: DEV-027
是否計入產品交付完成: 是
關聯需求: 使用者補充心智圖模式仍缺少 Xmind-like 關鍵操作與視覺行為：按 `Enter` 要在選取任務下方新增同階任務；畫布要能縮放且解析度足夠；線條要像參考圖 1 一樣整齊，不能雜亂；任務拖動時的預覽動畫要像參考圖 2 一樣明確畫出預期插入位置。

任務目標:
- `Enter` keyboard insertion：選取任務後按 `Enter`，必須在該任務正下方建立同 parent、同 level、同 side、order 緊接其後的新任務；新任務建立後直接進入命名編輯。
- Zoomable canvas：心智圖工作區提供縮放能力，至少支援 zoom in、zoom out、reset / fit；縮放後節點文字、connector、drag preview 與 hit target 保持清晰、對齊且可操作。
- Tidy connector topology：同 parent 多子節點以 shared vertical trunk / rounded bracket 或等效整齊拓撲呈現，避免每個 child 各自拉雜亂曲線、交錯線、殘留短線或穿越節點。
- Drag insertion preview：拖曳任務時顯示明確 insertion placeholder / gap / connector preview / ghost node，能在 mouseup 前判斷會插入哪個 parent、哪個 sibling 前後、哪一側。
- 補自動化與 UI QC：新增 browser verifier 驗證 keyboard insertion order、zoom sharpness / geometry、tidy connector、drag preview position fidelity、desktop/laptop/mobile viewport、visible error sweep。
- 保留 DEV-027A 已通過能力：connector endpoint <= 6px、無 orphan segment、same-side root placement persistence、viewer read-only、cycle guard、baseline browser flow 不得退化。

交付文件:
- `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md`
- `ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md`
- `ai-doc/qc/QC-DEV-027B-xmind-interaction-polish.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| PM/RD 規格 | PM/RD | Done | SPEC-027B |
| QA 驗證計畫 | QA | Done | QA-DEV-027B |
| RD 實作 | RD | Done | Enter insertion + zoom canvas + tidy connector + drag insertion preview |
| QC 事實驗證 | QC | Browser QC Passed | browser screenshots + geometry / preview metadata evidence |

RD exit gate:
- `npm.cmd run verify:dev-027b-xmind-interaction-polish`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`
- `npm.cmd run verify:core-regression-static`

Implementation notes for RD:
- Enter 新增 sibling 時必須重算同 parent 兄弟 order，不能只 append 到 parent 最後或 root list 最後。
- Zoom 建議使用 vector-first rendering：HTML text 保持文字渲染，connector / preview 使用 SVG path，避免 bitmap scaling 模糊。
- Connector layout 必須按 parent group 計算 shared trunk / bracket，讓 child stack 先整列對齊再畫線，不得只用任意 Bezier pair 造成視覺雜亂。
- Drag preview 必須共用 final layout 的 positioning rule；preview 顯示的 parent / sibling / side 必須與 drop 後結果一致。

Implementation evidence:
- `Enter`：`createSibling` 使用 selected node 的 parent/order 插入，root sibling 會繼承 selected root side。
- Xmind-like selection-first insert：新增任務後只選取，不立即進入編輯；可連續按 `Enter` / `Tab` 新增同階或子階任務；方向鍵可移動選取；選取任務後直接打字才進入 rename mode。
- Zoom：心智圖 toolbar 新增 zoom in / zoom out / reset / fit controls，工作區提供 `data-mindmap-zoom-level`，connector 座標依 zoomLevel 校正。
- Tidy connector：parent-child connector 改為 bracket-shaped `H/V/H` path，同 parent children 共用 trunk x；children group 暴露 parent/direction metadata。
- Drag insertion preview：拖曳 hover node 時顯示 `data-mindmap-insertion-preview`、`data-mindmap-drop-preview`、`data-mindmap-drag-preview`，並提供 target parent、sibling before/after、drop position、direction metadata。

Verified:
- `npm.cmd run verify:dev-027b-xmind-interaction-polish`：Pass，16 checks。
- `npm.cmd exec tsc -- --noEmit`：Pass。
- `npm.cmd run lint -- --quiet`：Pass。
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`：Pass，31 checks。
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`：Pass。
- `npm.cmd run build:test`：Pass；僅既有 Vite dynamic import / chunk size warning。
- `npm.cmd run verify:core-regression-static`：Pass，10 checks。

## PM Update - 2026-06-18

### DEV-027A: Xmind-like connector line and drag interaction repair

狀態: Implemented / Browser QC Passed
節點類型: 開發點
優先級: P0 UI quality reopen
父交付點: DEV-027
是否計入產品交付完成: 是
關聯需求: 使用者截圖指出心智圖樹狀線條殘破，分支線只剩孤立短線，父子節點無法靠線條追蹤；本輪新增拖動任務需有 Xmind-like 即時預覽動畫，且任務可拖到同一側，不得被固定平均拆成左右兩側。

任務目標:
- 先依 Xmind 官方 Topic / Branch / Skeleton / Mind Mapping structure 文件建立視覺基準。
- 修復心智圖 connector line，使 center-to-main、parent-to-child、sibling trunk 都形成連續可讀拓撲。
- 拖動任務時，必須有任務位置與階層變化的即時預覽動畫；拖曳中不可只顯示瀏覽器原生 ghost 或靜態 drop target。
- 任務可拖動到同一側並保留同側布局意圖，不得像目前一樣由 root index 強制平均拆成左右兩側。
- 補 browser verifier，驗證 connector endpoint、orphan segment、collapse/expand、drag 後重算、desktop/laptop/mobile viewport。
- 補 browser verifier，驗證 drag preview animation、same-side drop、side persistence 與 side-aware connector recompute。
- 使用與使用者截圖同等複雜度的 fixture 驗證，不得只用簡單 3 節點 smoke。

交付文件:
- `ai-doc/qa/QA-DEV-027A-xmind-connector-line-visual-validation.md`
- `ai-doc/qc/QC-DEV-027A-xmind-connector-drag-ui.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| QA 驗證計畫 | QA | Done | QA-DEV-027A |
| RD 修復 | RD | Done | centralized SVG connector overlay + drag preview + same-side layout persistence + browser verifier |
| QC 事實驗證 | QC | Browser QC Passed | screenshot + geometry evidence + same-side persistence evidence |

RD exit gate:
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`

Implementation evidence:
- Connector rendering 改為整張 mind map 集中 SVG overlay，由實際 DOM bbox 計算 center-to-root 與 parent-to-child endpoint，避免每個 node 自畫短線造成斷裂。
- Drag interaction 新增 `data-mindmap-drag-preview` 與 `data-mindmap-drop-preview`，pointer move 時 preview node 與 connector path 會同步更新。
- Root branch side placement 改由使用者 drop 意圖保存，支援多個 root branches 留在同一側，並在 mode switch / hard reload 後保留。
- Browser verifier 已覆蓋 connector endpoint、orphan segment、node overlap、drag preview movement、same-side drop、side persistence 與 desktop/laptop/mobile screenshot。

Verified:
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`：Pass，31 checks。
- `npm.cmd exec tsc -- --noEmit`：Pass。
- `npm.cmd run lint -- --quiet`：Pass。
- `npm.cmd run verify:dev-027-xmind-connector-lines-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-drag-preview-browser`：Pass。
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`：Pass。
- `npm.cmd run build:test`：Pass；僅既有 Vite dynamic import / chunk size warning。
- `npm.cmd run verify:core-regression-static`：Pass，10 checks。

### DEV-027: Xmind-like 心智圖模式

狀態: Implemented / Browser QC Passed
節點類型: 交付點
優先級: P1 planning UX migration
父交付點: 無
是否計入產品交付完成: 是
關聯需求: 使用者常用 Xmind 心智圖規劃工作計畫，且 Xmind 樹狀分支邏輯與 ProJED WBS 階層相同；希望在 ProJED 新增心智圖模式，讓規劃可直接變成任務。

任務目標:
- 在現有模式切換列新增 `心智圖` 模式。
- Active board title 作為中心主題，既有 WBS 任務作為分支節點。
- 一個任務就是一個分支，第一版節點只顯示任務名稱。
- 視覺布局與互動高度接近 Xmind 類心智圖，但避免一比一複製品牌細節。
- 心智圖所有新增、改名、刪除、拖曳調整階層都直接更新既有 WBS 任務資料。
- 第一版支援核心 MVP：模式切換、分支顯示、展開/收合、拖曳階層、雙擊/鍵盤改名、`Enter` 新增同層、`Tab` 新增子層、`Delete` 刪除。

交付文件:
- `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md`
- `ai-doc/qa/QA-DEV-027-xmind-like-mind-map-mode.md`
- `ai-doc/qc/QC-DEV-027-xmind-like-mind-map-mode.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| PM/RD 規格 | PM/RD | Done | SPEC-027 |
| QA 驗證計畫 | QA | Done | QA-DEV-027 |
| RD 實作 | RD | Done | MindMap view mode + Xmind-like core interactions |
| QC 事實驗證 | QC | Browser QC Passed | keyboard flow + delete guard + drag hierarchy + cycle guard + viewer read-only + viewport smoke |

Regression gate:
- `npm.cmd run lint -- --quiet`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`
- `npm.cmd run verify:core-regression-static`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`

Decision evidence:
- HCS 引導決策：`1A 2B 3A`。
- 範圍：核心心智圖 MVP。
- 視覺策略：Xmind-like 視覺布局與互動，但不複製 Xmind 品牌細節。
- 資料策略：完全共用現有 WBS 任務資料，不做草稿區。

Implementation evidence:
- UI wiring: `ViewMode` 新增 `mindmap`，`MainLayout` topbar 新增 `心智圖`，`App.renderContent` 掛入 `MindMapView`。
- Components: `src/components/MindMap/MindMapView.tsx`、`src/components/MindMap/MindMapNode.tsx`。
- Data contract: 直接共用 `useWbsStore` 的 `nodes`、`parentNodesIndex`、`addNode`、`updateNode`、`removeNode`，不新增資料表或獨立草稿。
- Interaction: owner browser smoke 已驗證新增 root、`Tab` 子任務、`F2` 改名、含子任務 `Delete` 確認、清單跨視圖同步與 cleanup。
- Verified: `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`, `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`, `npm.cmd run verify:dev-027-xmind-connector-lines-browser`, `npm.cmd run verify:dev-027-xmind-drag-preview-browser`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run build:test`, `npm.cmd run verify:core-regression-static`。

### DEV-026: Trello-like 看板分享體驗

狀態: Implemented / Browser Smoke Passed
節點類型: 交付點
優先級: P1 UI/UX migration
父交付點: 無
是否計入產品交付完成: 是
關聯需求: 使用者希望邀請別人加入看板的 UI/UX 對齊 Trello，讓 Trello 使用者轉換過來時，邏輯與肌肉記憶可以無縫移轉。

任務目標:
- 將看板邀請入口移到 active board topbar 的 `分享` 按鈕。
- 以 `分享看板` modal 承載 email 邀請、角色選擇、複製連結、pending invite 與看板成員。
- 將 role permission matrix 保留在設定頁，避免干擾分享主流程。
- 保留既有 `board_invites`、accept/revoke、RLS、audit 與 OAuth invite token preserve 資料契約。
- 補齊 desktop/laptop/mobile viewport 與 visible error sweep 驗證。

交付文件:
- `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md`
- `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| PM/RD 規格 | PM/RD | Done | SPEC-026 |
| QA 驗證計畫 | QA | Done | QA-DEV-026 |
| RD 實作 | RD | Done | Trello-like share modal + topbar entry + settings split |
| QC 事實驗證 | QC | Browser Smoke Passed / DB Smoke Pending | desktop + 390x844 browser smoke, static gates, ontology static guard |

Regression gate:
- `npm.cmd run lint -- --quiet`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`
- `npm.cmd run verify:ontology-collaboration`
- `npm.cmd run verify:dev-026-trello-like-board-share-ui`

Implementation evidence:
- UI: `src/components/MainLayout.tsx` active board topbar `分享` button with member count badge and mobile-safe hit target.
- Modal: `src/components/BoardMembersPanel.tsx` exports `BoardShareDialog` for Trello-like invite flow and keeps `BoardMembersPanel` as settings role permission matrix.
- Guardrail: `src/components/Sidebar.tsx` now wires board permission capability checks; `src/components/GlobalContextMenu.tsx` dead hidden transfer code removed for lint gate.
- Verified: `npm.cmd run verify:dev-026-trello-like-board-share-ui`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run build:test`, `npm.cmd run verify:ontology-collaboration`.
- Browser smoke: `http://127.0.0.1:4173/` desktop modal visible; 390x844 mobile share button hit target fixed, modal width 366px with no left/right overflow.
- Pending: `verify:ontology-collaboration` service-role DB smoke remains pending unless run with `--db` or `ONTOLOGY_COLLABORATION_DB_QC=true`.

### DEV-025: 受控跨工作區移動專案

狀態: Implemented / QC Pending
任務類型: 功能開發 / 權限與資料一致性
優先級: P1
關聯需求: 使用者希望專案可在不同工作區之間移動，但擔心權限外洩、資料遺失與稽核斷鏈。

任務目標:
- 將「專案跨工作區移動」定義為受控搬移流程，而不是自由拖拉或複製。
- 搬移前必須提供影響預覽，包含成員保留/移除、資料列數、邀請、標籤與 RAG 影響。
- 搬移必須由後端 RPC 以交易方式完成，避免半搬移狀態。
- 搬移必須保留 `project_id`，並更新所有 project-scoped 與 workspace-scoped 關聯。
- 搬移必須留下 source tenant 與 target tenant audit log。

交付文件:
- `ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md`
- `ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md`

| 階段 | Owner | 狀態 | 輸出 |
|---|---|---|---|
| PM/RD 規格 | PM/RD | Ready | SPEC-025 |
| QA 驗證計畫 | QA | Ready | QA-DEV-025 |
| RD 實作 | RD | Done | Supabase RPC migration + frontend controlled transfer flow + local-test fallback |
| QA 靜態驗證 | QA | Done | `verify:dev-025-project-workspace-transfer`, TypeScript, production build |
| QC 事實驗證 | QC | Pending | Apply migration to Supabase target, then verify RLS, audit log, data consistency, RAG visibility evidence |

Regression gate:
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`
- `npm.cmd run verify:settings-project-context`
- `npm.cmd run verify:core-regression-static`
- `npm.cmd run verify:dev-025-project-workspace-transfer`

Implementation evidence:
- Migration: `supabase/migrations/20260618120000_controlled_project_workspace_transfer.sql`
- UI: board context menu controlled transfer dialog with preflight preview and project-name confirmation
- Service/store: Supabase RPC integration plus local-test transfer path
- Verified: `npm.cmd run verify:dev-025-project-workspace-transfer`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run build`

## PM Update - 2026-06-15

### DEV-024: AI整理保留手寫內容與章節結構

狀態: Ready
節點類型: 開發點
優先級: P1 AI synthesis guard
父交付點: DEV-011 / DEV-012 / DEV-020
關聯回歸: DEV-021 / DEV-022
是否計入完成率: 否

交付原因：
- 使用者確認在手動填寫紀錄後執行 `AI整理`，既有內容會被覆蓋，且章節結構會被改寫。
- DEV-021 / DEV-022 已保護「專案變化匯入」 evidence 與單一紀錄整合，但尚未保護使用者手寫內容與自訂章節。
- 這不是 prompt wording 問題，必須新增 deterministic human-draft merge guard，避免 AI synthesis 結果直接取代 preserved draft。

交付目標：
- `AI整理` 只能整理、補強與統整既有草稿，不得刪除使用者已輸入的段落、章節、任務 mention 或任務連結。
- 若 AI 結果未包含手寫內容，系統必須用 deterministic fallback 將 missing human evidence 放回同一份紀錄。
- 保留 DEV-021 project change preserve guard 與 DEV-022 single-record integration guard。
- 不改資料庫 schema，不改 `KnowledgeRecord.content` persistence 格式。

主要文件：
- `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md`
- `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Ready | SPEC-024 |
| 驗證計畫 | QA | Ready | QA-DEV-024 |
| 實作 | RD | Pending | human-draft merge guard |
| 事實驗證 | QC/Verifier | Pending | DEV-024 preserve verifier + real operation tests |

驗證證據暫列：
- `SPEC-024`
- `QA-DEV-024`
- `verify:dev-024-ai-synthesis-preserve-human-draft`
- 待 RD 實作後重跑 DEV-011 / DEV-012 / DEV-021 / DEV-022 regression gates。

### DEV-023: 專案變化匯入整併為紀錄流程第一步

狀態: Ready
節點類型: 開發點
優先級: P1 UX refinement
父交付點: DEV-020
是否計入完成率: 否

交付原因：
- 使用者確認「先匯入專案變化」不應作為會議流程上方的獨立大型卡片。
- 匯入專案變化、速記、AI整理、校稿與發布本質上是同一段紀錄流程，應用同一個 workflow medium 表達。
- DEV-020 已完成功能主線，但 PDCA-DEV-020 仍留下「專案變化匯入在流程上方」的殘留 UX 風險。

交付目標：
- 會議紀錄流程改為 `匯入 -> 速記 -> AI整理 -> 校稿 -> 發布`。
- 個人工作紀錄流程改為 `匯入 -> 撰寫 -> 存草稿 -> 發布`。
- 預設只顯示精簡流程步驟；點擊 `匯入` 後才展開日期、範圍、預覽、插入與跳過。
- 保留 `wrapProjectChangeImportContent`、DEV-021 preserve guard 與 DEV-022 single-record integration guard。

主要文件：
- `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md`
- `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Ready | SPEC-023 |
| 驗證計畫 | QA | Ready | QA-DEV-023 |
| 實作 | RD | Pending | workflow first-step integration |
| 事實驗證 | QC/Verifier | Pending | DEV-023 workflow-step verifier |

驗證證據暫列：
- `SPEC-023`
- `QA-DEV-023`
- `verify:dev-023-record-project-change-import-workflow-step`
- 待 RD 實作後重跑 DEV-020 / DEV-021 / DEV-022 regression gates。

### DEV-022: 專案變化匯入後 AI整理同整成單一會議紀錄

狀態: Done
節點類型: 交付點
優先級: P1
父交付點: DEV-021
是否計入完成率: 是

CAPA 來源：
- 使用者實測發現「先匯入專案變化 -> AI整理」後，輸出同時出現 AI整理主紀錄與 `[專案變化匯入開始]` 內的第二份完整會議紀錄。
- 目前 DEV-021 的 deterministic merge guard 保證不丟失，但採 append preserve，未做到同整。

交付目標：
- 將「受保護內容」從 rendered meeting record 改為 project change evidence。
- AI整理結果最後只能有一份會議紀錄主結構。
- 匯入的任務變化必須統整進 `2. 任務討論與結論`，不得以第二份完整紀錄追加。
- fallback guard 若需要補漏，只能補 evidence note，不可補第二組 `1/2/3` 結構。

主要文件：
- `ai-doc/specs/SPEC-022-project-change-single-record-integration.md`
- `ai-doc/qa/QA-DEV-022-project-change-single-record-integration.md`
- `ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| CAPA | PM/RD | Done | CAPA-20260615 |
| 規格 | PM/RD | Done | SPEC-022 |
| 實作 | RD | Done | integrated synthesis guard |
| 驗證計畫 | QA | Done | QA-DEV-022 |
| 事實驗證 | QC/Verifier | Done | single-record verifier |

交付證據：
- `src/utils/projectChangeImport.ts`：project change evidence normalization、single-record merge guard。
- `scripts/verify-dev-022-project-change-single-record.mjs`：單一 `1/2/3` 主結構、marker 移除、taskLinks preserve、idempotent。
- `package.json`：`verify:dev-022-project-change-single-record`。

已通過驗證：
- `npm.cmd run verify:dev-022-project-change-single-record`
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

### DEV-021: 專案變化匯入後 AI整理保留機制

狀態: Done
節點類型: 交付點
優先級: P1
父交付點: DEV-020 / DEV-011 / DEV-012
是否計入完成率: 是

交付原因：
- 使用者在紀錄流程中先匯入專案變化後，再使用 AI整理時，先前匯入內容可能被 AI 結果覆蓋。
- 此問題不是文案或 prompt 問題，而是資料回寫缺少 deterministic merge guard。
- 在此交付點完成前，DEV-020 的「專案變化匯入 + AI整理」需視為有資料遺失風險。

主要文件：
- `ai-doc/specs/SPEC-021-project-change-ai-preserve.md`
- `ai-doc/qa/QA-DEV-021-project-change-ai-preserve.md`

範圍：
- SPEC 新增「已匯入專案變化是受保護內容，AI整理不得丟失」不變式。
- RD 實作 deterministic merge guard，不可只依賴 prompt。
- QA 新增「匯入 -> AI整理 -> 存草稿/發布」測試案例。
- Verifier 新增 preserve 與 idempotent 可重複測試。
- PM 將 DEV-020 標記為待 DEV-021 補齊的狀態風險。

完成條件：
- 匯入專案變化後 AI整理不會丟失已匯入內容。
- 重複 AI整理不會重複堆疊同一份匯入區塊。
- 存草稿與發布都保存 merged content。
- taskLinks 依 merged content 同步。
- prompt-only 修補不得通過 verifier。

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Done | SPEC-021 |
| 實作 | RD | Done | deterministic merge guard |
| 驗證計畫 | QA | Done | QA-DEV-021 |
| 事實驗證 | QC/Verifier | Done | preserve/idempotent verifier |

交付證據：
- `src/utils/projectChangeImport.ts`：受保護匯入區塊、extractor、merge guard。
- `src/components/Records/RecordSidebar.tsx`：匯入專案變化時改插入受保護區塊。
- `src/store/useRecordStore.ts`：AI整理回寫使用 merged content，taskLinks 依 merged content 同步。
- `scripts/verify-dev-021-project-change-ai-preserve.mjs`：preserve、idempotent、taskLinks、store writeback、docs gate。

已通過驗證：
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

## PM Update - 2026-06-11

### DEV-020：紀錄功能重構與專案變化匯入流程

狀態：Done
節點類型：交付點
父交付點：DEV-002 / DEV-005 / DEV-007 / DEV-011 / DEV-012 / DEV-018 / DEV-019
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md`
- `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md`

範圍：

- 將紀錄功能重構為「先選紀錄情境、再匯入專案變化、再撰寫與發布」的工作流。
- 看板主畫面提供 `開始會議速記` 與 `新增個人工作紀錄` 主要入口。
- 紀錄類型在開始撰寫前決定；建立草稿後不在同一筆草稿上切換類型。
- 新增專案變化匯入：指定時間範圍，預設一週前到今日；範圍只保留整個看板與整個工作區。
- 專案變化預覽依任務階層排版，需使用者確認後才插入紀錄內容。
- 補齊所有關閉、切換、新增、離開時的未儲存三選一防呆。
- 新增 `功能說明` button，內含流程圖、紀錄類型差異、專案變化匯入與保存/發布/離開說明。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-020 RD | Done | RD | 已實作 workflow helper、project change import、RecordComposer、dirty guard、help dialog 與 verifier。 |
| DEV-020 QA | Done | QA | `QA-DEV-020` 已涵蓋入口、匯入、防呆、功能說明與 viewport。 |
| DEV-020 QC | Done | QC | DEV-002/003/007/010/011/012/019 回歸、DEV-020 verifier、browser verifier 與 build 通過。 |

### DEV-018：會議紀錄防呆 UX/UI 流程重設計

狀態：In Verification
節點類型：交付點
父交付點：DEV-005 / DEV-010 / DEV-011 / DEV-012
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-018-meeting-record-guardrail-workflow-redesign.md`
- `ai-doc/qa/QA-DEV-018-meeting-record-guardrail-workflow.md`

範圍：

- 將會議速記側欄改為 `速記`、`AI整理`、`校稿`、`發布` 四階段工作流。
- AI整理改為建議性動作；發布時直接保存編輯器內容，不自動呼叫 AI。
- 新增側欄狀態卡，集中呈現目前階段、下一步、草稿同步狀態、AI 狀態與直接發布風險。
- 新增未儲存離開三選一防呆：`存草稿後離開`、`直接離開`、`取消`。
- 擴充 `GlobalDialog` / `DialogStore` 支援 2-3 個自訂 action button。
- 更新 DEV-010 驗證腳本，移除過時的 BoardView 會議操作列期待。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-018 RD | Done | RD | workflow helper、RecordSidebar、MainLayout、DialogStore、useRecordStore 已更新。 |
| DEV-018 QA | Ready | QA | 依 `QA-DEV-018` 執行案例驗證。 |
| DEV-018 QC | Done | QC | DEV-007 至 DEV-012 verifier、build、1440x950 / 1024x768 viewport smoke 已通過。 |

### DEV-019：紀錄類型與會議流程層級重整

狀態：Done
節點類型：開發點
父交付點：DEV-002 / DEV-005 / DEV-018
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md`
- `ai-doc/qa/QA-DEV-019-record-type-and-meeting-workflow-layering.md`

範圍：

- 釐清 `會議紀錄` 與 `個人工作紀錄` 是紀錄類型，不是會議流程步驟。
- Topbar 只表示全域會議模式：`開始會議速記` / `離開會議`。
- RecordSidebar 只在一般模式提供 `新增會議紀錄` / `新增個人工作紀錄`。
- 會議模式中鎖定為 `會議紀錄（會議模式）`，不顯示個人工作紀錄切換。
- 個人工作紀錄顯示簡單狀態，不套用 `AI整理 / 校稿`。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-019 RD | Done | RD | 更新 RecordSidebar、MainLayout、workflow helper 與 verifier。 |
| DEV-019 QA | Done | QA | 已建立 `QA-DEV-019`，涵蓋紀錄類型、會議模式、個人工作紀錄與 viewport。 |
| DEV-019 QC | Done | QC | `verify:dev-010-action-feedback`、`build`、`verify:dev-019-record-type-layering-browser` 通過。 |

更新日期：2026-06-09
文件用途：本檔只做 PM 主控、交付狀態、下一步與驗證證據索引。歷史長版內容已封存到 `ai-doc/archived/dev_task_2026-06-09_before_restructure.md`。

---

## 讀法

- 先看「目前 PM 結論」與「下一步」。
- 產品完成率只計入 `交付點`。
- `開發點` 只支援交付點，不單獨計入產品完成率。
- 詳細需求、驗證計畫與歷史紀錄請看對應 SPEC / QA / QC / verifier，不再塞回本檔。

## 狀態定義

| 狀態 | 意義 |
|---|---|
| Done | 已完成實作與可用驗證，或已被使用者接受。 |
| In Verification | 已實作，等待 QC / production smoke / 使用者驗收。 |
| Ready | 規格足夠，可排 RD / QA / QC。 |
| Deferred | 暫不做，需明確恢復條件。 |
| Blocked | 有外部條件阻擋，PM/RD 無法自行完成。 |

---

## 目前 PM 結論

- `main` 持續作為正式發布分支，部署與 production smoke 證據已回寫到 PM 文件。
- Firebase Hosting 已部署到正式環境：`https://projed-cc78d.web.app`。
- Supabase Edge Function `synthesize_meeting_record` 已部署到正式 Supabase version 2，狀態 `ACTIVE`，並維持 `verify_jwt=true`。
- 2026-06-09 production backend AI smoke 已通過：匿名請求回 `401`，一次性 Supabase Auth user 呼叫回 `200`，實際模型為 `gemini-3.5-flash`。
- 會議紀錄工作流目前是主要交付主線：DEV-005 到 DEV-017 已完成多輪 UX 與 AI 品質改善。
- DEV-011 / DEV-012 尚待互動式 production UI smoke，原因是正式前端使用 Google OAuth，CLI 無法非互動完成登入與發布流程。
- 手機版會議紀錄工作流不列入目前 release gate。

## 下一步

| 順序 | 任務 | 狀態 | 負責 | 完成條件 |
|---|---|---|---|---|
| 1 | DEV-011 / DEV-012 production UI smoke | In Verification | QC / 使用者 | 以已登入 Google 的正式前端完成：開會、AI整理、校稿發布、紀錄庫與任務知識查找。 |
| 2 | DEV-026 Trello-like 看板分享體驗 RD | Done | RD | 已完成 topbar 分享入口、分享 modal、設定頁權限矩陣降層與 DEV-026 verifier。 |
| 3 | DEV-011 / DEV-012 production backend AI smoke | Done | QC | 正式 Edge Function 以授權 user JWT 呼叫成功，回傳 AI 統整內容與實際模型。 |
| 4 | DEV-028 四模式一致的 Trello-like 任務操作契約 QC | Manual Click QC Pending | QC | 依 QA-DEV-028 補做 MAN-028-001 至 MAN-028-027 人工親自點擊驗證，附 viewport、截圖或錄影、visible error sweep。 |
| 5 | DEV-020 紀錄功能重構 RD | Done | RD | 已依 SPEC-020 重構紀錄入口、專案變化匯入、未儲存保護與功能說明。 |
| 6 | 文件同步清理 backlog / documentation map | Done | PM | backlog、dev_task、documentation map 與 QC evidence 狀態一致。 |

---

## 交付點總覽

| DEV | 類型 | 狀態 | 是否計入完成率 | 主題 | 主要證據 / 文件 | 下一步 |
|---|---|---|---|---|---|---|
| DEV-001 | 交付點 | Done | 是 | 四模式一致化緊湊 UI 系統 | `SPEC-001`、舊 dev_task archive | 無 |
| DEV-002 | 交付點 | Done | 是 | 會議紀錄與個人工作紀錄 MVP | `SPEC-003`、`verify:dev-002-records` | 後續只做 refinements |
| DEV-004 | 交付點 umbrella | Deferred | 否 | 全人個人與團隊待辦平台 MVP | `SPEC-002` | 等使用者重新啟動 |
| DEV-005 | 交付點 | Done | 是 | 會議看板主畫面紀錄工作流 | `SPEC-005`、PM report | 無 |
| DEV-006 | 交付點 | Done | 是 | Gmail-like 會議紀錄輸入器穩定化 | `SPEC-006`、`QA-DEV-006`、browser input verifier | 無 |
| DEV-007 | 交付點 | Done | 是 | 會議中保留看板完整編輯與任務變更紀錄 | `SPEC-007`、`verify:dev-007-meeting-activity` | 無 |
| DEV-008 | 交付點 | Done | 是 | 任務會議細節快速查找 | `SPEC-008`、`verify:dev-008-task-knowledge` | 無 |
| DEV-009 | 交付點 | Done | 是 | 任務詳情內會議快速補記 | `SPEC-009`、`QA/QC-DEV-009`、`verify:dev-009-task-detail-quick-note` | 無 |
| DEV-010 | 交付點 | Done | 是 | 會議紀錄操作按鈕狀態溝通 | `SPEC-010`、`QA-DEV-010`、`verify:dev-010-action-feedback` | 無 |
| DEV-011 | 交付點 | In Verification | 是 | AI 任務導向會議紀錄統整工作流 | `SPEC-011`、`QA-DEV-011`、`verify:dev-011-ai-meeting-synthesis`、`QC-DEV-011-012-production-ai-smoke` | production UI smoke |
| DEV-012 | 交付點 | In Verification | 是 | AI 會議紀錄自然語言品質提升 | `SPEC-012`、`QA-DEV-012`、`verify:dev-012-meeting-record-quality`、`QC-DEV-011-012-production-ai-smoke` | production UI smoke |
| DEV-013 | 交付點 | Done | 是 | 右鍵任務複製，含子任務與子樹內部依賴 | `SPEC-013`、`QC-DEV-013`、`verify:dev-013-task-duplicate` | 無 |
| DEV-020 | 交付點 | Done | 是 | 紀錄功能重構與專案變化匯入流程 | `SPEC-020`、`QA-DEV-020`、`verify:dev-020-record-workflow-redesign`、`verify:dev-020-project-change-import-browser` | 無 |
| DEV-026 | 交付點 | Implemented / Browser Smoke Passed | 是 | Trello-like 看板分享體驗 | `SPEC-026`、`QA-DEV-026`、`verify:dev-026-trello-like-board-share-ui`、browser smoke | DB smoke 視 release gate 需要再啟用 |
| DEV-027 | 交付點 | Implemented / Static + Browser Smoke Passed | 是 | Xmind-like 心智圖模式 | `SPEC-027`、`QA-DEV-027`、`QC-DEV-027` | 觀察實際使用回饋 |
| DEV-028 | 交付點 | Implemented / Browser Smoke Passed / Manual Click QC Pending | 是 | 四模式一致的 Trello-like 任務操作契約 | `SPEC-028`、`QA-DEV-028`、`verify:dev-028-cross-mode-task-interactions`、browser smoke | 依 QA-DEV-028 補人工親自點擊 QC |

### 交付點完成率

- Done：10 個交付點。
- In Verification：2 個交付點。
- Implemented / Browser Smoke Passed：1 個交付點。
- Implemented / Browser Smoke Passed / Manual Click QC Pending：1 個交付點。
- Ready：1 個交付點。
- Deferred：1 個 umbrella 交付點。
- 開發點不列入完成率。

---

## 支援開發點總覽

| DEV | 類型 | 父交付點 | 狀態 | 主題 | 驗證證據 |
|---|---|---|---|---|---|
| DEV-003 | 開發點 | DEV-002 | Done | 紀錄內容 inline task tag | `verify:dev-003-record-tags` |
| DEV-014 | 開發點 | DEV-011 / DEV-012 | Done | 會議紀錄階層編號取代任務分類詞 | 併入 `verify:dev-011`、`verify:dev-012` |
| DEV-015 | 開發點 | DEV-012 | Done | 會議紀錄主線摘要品質優化 | `verify:dev-015-meeting-summary-mainline` |
| DEV-016 | 開發點 | DEV-002 | Done | 紀錄庫改為條列式清單 | `verify:dev-016-records-list-view`、browser verifier |
| DEV-017 | 開發點 | DEV-005 / DEV-010 | Done | 會議紀錄右側欄可拖拉調整並記憶寬度 | `verify:dev-017-record-sidebar-resize`、browser verifier |
| DEV-019 | 開發點 | DEV-002 / DEV-005 / DEV-018 | Done | 紀錄類型與會議流程層級重整 | `SPEC-019`、`QA-DEV-019`、`verify:dev-010-action-feedback`、`verify:dev-019-record-type-layering-browser` |
| DEV-023 | 開發點 | DEV-020 | Ready | 專案變化匯入整併為紀錄流程第一步 | `SPEC-023`、`QA-DEV-023`、`verify:dev-023-record-project-change-import-workflow-step` |
| DEV-024 | 開發點 | DEV-011 / DEV-012 / DEV-020 | Ready | AI整理保留手寫內容與章節結構 | `SPEC-024`、`QA-DEV-024`、`verify:dev-024-ai-synthesis-preserve-human-draft` |

---

## 目前阻塞 / 待人工驗證

| 項目 | 影響 | 解除方式 |
|---|---|---|
| DEV-011 / DEV-012 尚缺 production UI smoke | 後端 AI 統整已在正式環境通過，但完整前端流程尚未以 Google OAuth 登入帳號驗證 | 使用已登入 Google 的正式前端，建立或開啟看板後完成 meeting mode、AI整理、校稿發布、紀錄庫與任務知識查找。 |

---

## Release Gate 指令

### 常規自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run verify:dev-013-task-duplicate
npm.cmd run verify:dev-015-meeting-summary-mainline
npm.cmd run verify:dev-016-records-list-view
npm.cmd run verify:dev-017-record-sidebar-resize
```

### Browser / UX 驗證

```powershell
npm.cmd run verify:dev-006-browser-input
npm.cmd run verify:dev-016-records-list-browser
npm.cmd run verify:dev-017-record-sidebar-resize-browser
```

### 正式部署

```powershell
node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive
```

---

## 交付文件索引

| 類別 | 文件 |
|---|---|
| Backlog | `ai-doc/backlog.md` |
| Documentation map | `ai-doc/documentation_map.md` |
| 舊 dev_task 詳細版 | `ai-doc/archived/dev_task_2026-06-09_before_restructure.md` |
| 會議紀錄主線規格 | `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` 到 `SPEC-012` |
| 任務複製規格 | `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` |
| QA 文件 | `ai-doc/qa/` |
| QC 文件 | `ai-doc/qc/` |
| PM reports | `ai-doc/reports/` |

---

## PM 維護規則

- 本檔不再貼長篇需求背景；新增細節請寫到 SPEC / QA / QC / report。
- 新增交付點前，需使用者確認。
- PM 可新增支援開發點，但必須標明父交付點與驗證證據。
- 每次 release 前只更新：狀態、下一步、阻塞、驗證證據。
- 舊任務詳細歷程保留在 archive，不再回填到 active control board。
