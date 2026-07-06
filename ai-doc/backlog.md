# ProJED Backlog

## Backlog Update - 2026-07-05

### DEV-041: PWA 更新通知與快取恢復

| DEV | Status | Type | Priority | Scope | Evidence |
|---|---|---|---|---|---|
| DEV-041 | Production Release Deployed / Local + Production Smoke Passed | 交付點 | P0 production update visibility, P0 stale cache recovery, P1 release-readiness evidence | 在正式部署前建立可見的新版本更新提示與更新按鈕；沿用現有 Vite PWA prompt update 架構，讓 `onNeedRefresh` 通知全域 UI，使用者按更新後才套用；補 stale chunk/cache recovery、reload loop guard、ErrorBoundary recovery 整合與 DEV-034 PWA install guidance regression。 | `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md`, `ai-doc/qa/QA-DEV-041-pwa-update-notification-cache-recovery.md`, `ai-doc/qc/QC-DEV-041-pwa-update-notification-cache-recovery.md` |

驗收重點:
- 有新版本時，使用者必須看到可見更新提示。
- 更新提示必須有明確「更新」按鈕；正常更新不得在使用者未按更新時強制刷新。
- stale chunk / cache failure 必須有 recovery path 與 reload loop guard。
- cache recovery 不得清除未授權業務資料。
- 390x844 mobile 與 1440x900 desktop viewport 下提示可見、可點、不溢出。
- DEV-034 PWA install guidance 不得被破壞。
- RD implementation 與 production deploy 已完成，local QC、production artifact smoke、Firebase deploy、post-deploy smoke 與 authenticated production UI smoke 均已通過；手機更新提示 hotfix 已補上 bundle hash check 與「已更新到新版」提示，正式 bundle `assets/index-BXtRfIba.js`。
- 強制更新、release notes backend、analytics、push/email notification、DB schema/migration/RLS/RPC 均未授權。

## Backlog Update - 2026-07-04

### DEV-029: 手機 Pan-First 觸控手勢仲裁

| DEV | Status | Type | Priority | Scope | Evidence |
|---|---|---|---|---|---|
| DEV-029 | Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed | 交付點 | P0 mobile board pan usability, P1 DEV-028 mobile gesture compatibility | 手機 BoardView 採 pan-first 手勢仲裁：任務卡、L2+ 子任務列、欄位與空白處短滑優先移動畫面並 suppress click-through；L2+ 垂直/水平 pan 已驗證可推動 `scrollTop` / `scrollLeft`；手機 task surface 無位移 tap 仍開任務詳情；長按才觸發任務操作或既有 long press flow；互動控制例外；Phase 2 才處理未來手機非 board modes，H01-H04 真機補充尚未執行。 | `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md`, `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md`, `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md`, DEV-028 compatibility note |

驗收重點:
- 390x844 手機 viewport 下，使用者在任務卡主體、L2+ 子任務列、欄位與空白處短滑都能移動畫面或至少 suppress click-through，不必找卡片縫隙；browser matrix 已驗證 L2+ `scrollTop: 0 -> 38`、`scrollLeft: 0 -> 120`。
- 短滑不得開 `TaskDetailsModal`、rename input、context menu 或 drag preview。
- 長按任務卡 / 任務列仍可進入任務操作選單或既有 long press flow。
- filter、input、button、date、dependency、assignee、tag、popover、modal controls 不得被 pan guard 擋住。
- Desktop DEV-028 click-to-details 不得被改壞。
- 手機非 board modes、再次取消或重定義手機 tap-to-details、production deploy、DB/schema/RLS/migration 都不屬於目前授權範圍。

## Backlog Update - 2026-07-02

### DEV-039: 任務過濾器核心與全域任務平台兩欄篩選重構

| DEV | Status | Type | Priority | Scope | Evidence |
|---|---|---|---|---|---|
| DEV-039 | Phase 1/1A Local Automated QC Passed / Phase 1B Implemented + Local Automated QC Passed / Phase 1C Implemented + Local Automated QC Passed / Production Release Not Deployed + Requires Explicit Authorization / Phase 2 RD Contract Ready / All-Phase Coverage Complete | 交付點 | P0 workbench placement drag parity, P1 task focus consistency, P1 workbench UX clarity, P1 filter result parity | Phase 1 已建立任務過濾器共用核心、五視圖一致性、顯示設定分離與 Workbench 單一過濾器入口；工作台主畫面只保留 `過濾器` 按鈕，popover 內選看板並調同看板過濾器，不做設定檔/儲存/複製；Phase 1B 已補回未歸位 / 已歸位看板 placement lanes、雙向拖移與未歸位任務功能等價；Phase 1C 已完成 filter result parity 實作與本機自動化 QC，要求同看板同條件下看板與工作台 `matchedTaskIds` 一致；production release 仍需明確部署授權與 deployment-release-gate；Phase 2 補全部可見任務資料來源契約；已補 All-Phase Coverage Matrix 與 Deferred Scope Audit。 | `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`, `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md`, `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md` |

驗收重點:
- 任務過濾條件收斂到共用 predicate，不再每個視圖各寫一套。
- active filter count 只計算真正過濾條件，不計算顯示設定。
- 甘特、日曆、心智圖與清單/看板的狀態、到期日、負責人、標籤結果一致。
- 全域任務平台不再提供 `目前工作區`、`目前看板` 作為來源範圍。
- Phase 1 全域任務平台預設包含目前已載入任務集合，不以 `待歸位 / 已歸位` 作為 filter 或預設排除條件；全部可見任務資料層留 Phase 2。
- 全域任務平台主畫面只保留一顆 `過濾器` 按鈕；使用者在 popover 內選看板並逐看板設定過濾器。
- 全域任務平台 popover 內的看板欄只切換正在設定哪個看板的過濾器；已歸位任務清單跨看板顯示目前已載入任務，並依各任務所屬看板套用該看板 filter state。
- 下方顯示區名稱為 `所有任務排序`，合併未歸位任務與符合 filter 的已歸位任務；預設依到期日由早到晚排序，未設到期日者排最後。
- 全域任務平台過濾器必須是按鈕 + overlay，視覺上不可像第二個下拉欄位。
- `未歸位 / 已歸位看板` 已以 placement lanes 補回；它們不是過濾器、不是任務狀態，也不是看板 selector 選項。
- 未歸位任務與已歸位任務功能必須一樣，僅位置不同。
- 任務可藉由拖移在未歸位與已歸位看板間雙向移動，且不得遺失或重複資料。
- 同一 selected board、同一組 status / due / assignee / tag / keyword filter 下，看板與全域任務平台的 `matchedTaskIds` 必須一致。
- 看板可顯示不符合 filter 的父層欄位 / 卡片作為 context-only container，但不得把它算成符合結果；全域任務平台只列真正符合條件的任務 identity。
- 看板與全域任務平台的負責人 filter option source 必須對齊 selected board context，避免表面條件相同但實際 id/source 不同。
- 全域任務平台不得出現設定檔、儲存、另存、複製、全域 profile 或看板專屬 profile。
- 產品定位修正：全域任務平台不可改成獨立整頁；需保留 BoardView 左側跨看板拖拉中繼站。Phase 1 資料來源標示為目前已載入任務集合，真正全部可見任務留 Phase 2。
- RD 不得只修改 `dist/assets/TaskZoneView-*.js`，必須恢復或重建可維護 source。
- Phase 1B Workbench Placement Lanes Restore 已通過本機自動化 QC；不得宣稱已部署 production。
- Phase 1C Filter Result Parity 已通過本機自動化 QC；不得宣稱已部署 production。
- 正式環境發布 / production smoke / deployment-release-gate 仍需使用者明確部署授權。
- Phase 2 已有 RD Contract，但未授權直接開工；後端 sync、migration、profile governance 不屬於 DEV-039 目前範圍。
- All-Phase Coverage Matrix 已明列 Phase 0-4 與 Production Release Gate 的 authorization、entry condition、acceptance 與 evidence；Deferred Scope Audit 已將 future/backend/production 範圍分類完成。

## Backlog Update - 2026-06-29

### DEV-038: 設定中心作用範圍一致性與高風險防呆

| DEV | Status | Type | Priority | Scope | Evidence |
|---|---|---|---|---|---|
| DEV-038 | Implemented / Local Automated QC Passed / DB unchanged / Production Not Deployed | 交付點 | P0 backup/import/trash risk, P1 settings IA consistency | 已建立設定中心作用範圍 taxonomy，修正全頁 `目前看板` 語境混用；備份頁拆分全域匯出與目前看板匯入，匯入前增加目標確認；回收桶改為目前看板回收桶；看板權限與快速開啟標示各自作用範圍。 | `ai-doc/specs/SPEC-038-settings-scope-consistency-and-risk-guardrails.md`, `ai-doc/qa/QA-DEV-038-settings-scope-consistency-and-risk-guardrails.md`, `ai-doc/qc/QC-DEV-038-settings-scope-consistency-and-risk-guardrails.md` |

驗收重點:
- 設定中心頁首不再把所有頁籤都框在目前看板。
- 每個設定 section 都顯示作用範圍。
- 匯出明確是全域快照；匯入明確是匯入至目前看板。
- 匯入備份前必須確認目標 Workspace / Board。
- 回收桶清空前必須顯示目前看板與永久刪除數量。
- 快速開啟必須標示為此裝置 / 目前帳號範圍。

### DEV-037: 行事曆訂閱來源範圍清晰化

| DEV | Status | Type | Priority | Scope | Evidence |
|---|---|---|---|---|---|
| DEV-037 | Ready for RD / SPEC + QA Ready | 交付點 | P1 settings IA and data-scope clarity | 重構行事曆訂閱的來源範圍語意：預設目前看板、支援工作區全部看板與自訂範圍、每筆訂閱顯示來源/條件 summary，並延伸 filters / Edge Function / DB validation 讓 Board scope 真正只輸出該看板任務。 | `ai-doc/specs/SPEC-037-calendar-subscription-source-scope-clarity.md`, `ai-doc/qa/QA-DEV-037-calendar-subscription-source-scope-clarity.md` |

驗收重點:
- 從 active board 進入設定時，新增訂閱預設為 `目前看板`。
- 訂閱列表每筆都顯示 `來源` 與 `條件`，不再要求使用者從訂閱名稱猜測資料範圍。
- Board scope 的 `.ics` feed 不得包含其他 Board 任務。
- Legacy workspace-only 訂閱仍可讀取與修改，UI 顯示為 `工作區全部看板`。
- 若資料層仍只能支援 workspace scope，不得把 UI 選項命名為 `目前看板`。

### DEV-034: App 快速啟動與加入主畫面 UX

| DEV | Status | Type | Priority | Scope | Evidence |
|---|---|---|---|---|---|
| DEV-034 | Done / Browser QC Passed / Local-first scope / QuickCaptureShell Retired | 交付點 | P0 mobile quick-capture readiness | 降低 App 開啟等待與加入主畫面摩擦：PWA 更新基礎、平台分流安裝助理、設定頁快速開啟入口、local-first pending InboxItem queue；右下角 QuickCaptureShell 已由 DEV-039 全域任務平台 `未歸位` lane 取代。正式雲端 Inbox/轉任務接 SPEC-002 後續。 | `ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md`, `ai-doc/qc/QC-DEV-034-fast-start-pwa-install-guidance.md`, `verify:dev-034-pwa-install-guidance`, `verify:dev-034-pwa-install-guidance-browser`, `output/playwright/dev-034-quick-capture-shell-removed-mobile.png`, `output/playwright/dev-034-pwa-install-guidance-desktop.png`, `output/playwright/dev-034-pwa-install-guidance-mobile.png` |

驗收重點:
- 使用者不需額外設定快取與更新；App 背景檢查更新，避免輸入中強制刷新。
- 加入主畫面引導需在合適平台自動出現，且可在設定頁永久回查。
- iOS 指引只保留三步驟：點分享、選加入主畫面、點新增。
- 內建瀏覽器先提示用 Safari / Chrome 開啟，不用 403 或瀏覽器政策作主說明。
- 使用者可選稍後或不再提示，且設定頁可重新顯示提示。
- 右下角 QuickCaptureShell 浮窗不得再渲染；舊 `InboxItem` localStorage 僅保留為全域任務平台 `未歸位` lane 的遷移來源。
- 正式雲端 Inbox、跨裝置同步、今日區塊與轉正式任務仍接 SPEC-002 後續交付，不在本輪宣告完成。

## Backlog Update - 2026-06-26

### DEV-028: 四模式一致的 Trello-like 任務操作契約

| DEV | Status | Type | Priority | Scope | Evidence |
|---|---|---|---|---|---|
| DEV-028 | Implemented / Browser Smoke Passed / Manual Click QC Pending | 交付點 | P0 UI/UX interaction consistency | 清單、心智圖、看板、甘特四模式採用一致任務操作契約：單擊 = 選取 + 開詳情、明確改名入口、新增任務命名桌機/手機分流、ESC 關閉最上層暫時性 UI、右鍵/長按任務選單、拖曳/選取 guard；不做看板卡片正面資訊降噪、不把 Level 3+ 收進 Card back。 | `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md`, `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md`, `verify:dev-028-cross-mode-task-interactions`, `verify:dev-028-cross-mode-task-interactions-browser`, MAN-028 manual click QC pending |

驗收重點:
- 四模式單擊既有任務都先選取，再開啟同一個 `TaskDetailsModal`；關閉詳情後保留選取狀態。
- 四模式任務名稱不因單擊直接進入編輯；改名需用鉛筆、右鍵、`t` 或 F2。
- 新增任務採 2C：桌機四模式新增後只選取新任務並可直接打字改名；手機新增後自動開命名鍵盤。
- 快捷鍵採 1A：清單、看板、甘特 `Enter` 開詳情；心智圖 `Enter` 保留新增同階。
- 右鍵/長按採 3A：四模式都開任務操作選單；心智圖關聯線入口改走 toolbar、快捷鍵或 selected-node action。
- 心智圖保留 selection-first keyboard flow、關聯線模式與直接打字改名。
- 看板 Level 3+ 仍顯示在卡片正面，卡片資訊密度不因本 DEV 下降。
- 甘特拖曳/拉伸仍代表排程，且拖曳後不誤開詳情。

## Backlog Update - 2026-06-19

### DEV-027F: Mind map UI polish after relationship-line QC

| DEV | Status | Type | Priority | Scope | Evidence |
|---|---|---|---|---|---|
| DEV-027F | Implemented / Browser QC Passed | UI/UX polish | P0 | Fix relationship-line viewport overflow, zoom-scaled hit targets, inline editor placement, oversized arrow marker, and creation-mode hitbox interference | `ai-doc/qc/QC-DEV-027F-mindmap-ui-polish.md`, `output/playwright/dev-027F-mindmap-ui-desktop.png`, `output/playwright/dev-027F-mindmap-ui-mobile.png` |

### DEV-027E: Xmind-like note relationship line UX parity

Status: Implemented / Browser QC Passed (2026-06-19)

Delivered:
- Note-only relationship line upgraded from MVP to Xmind-like editable canvas object.
- Inline label edit replaces prompt as the main create/edit flow.
- Selected relationship exposes endpoint handles, Bezier control handles, style popover, keyboard delete/edit, toolbar selected-node flow, shortcut flow, and right-click start flow.
- Browser QC evidence: `ai-doc/qc/QC-DEV-027E-xmind-note-relationship-line-ux-parity.md`.

| DEV | 狀態 | 類型 | 優先級 | 範圍 | 文件 |
|---|---|---|---|---|---|
| DEV-027E | Ready | 後續開發點 / 心智圖 UI/UX parity | P1 | 將 DEV-027C 筆記型關聯線升級為 Xmind-like 可直接操作圖形物件：inline label edit、線條本體選取、endpoint/control point 拖曳、樣式控制、快捷鍵與右鍵入口 | `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md`, `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md` |

範圍邊界：
- 保留筆記型關聯線，不做任務依賴、不影響排程。
- 不做 floating topic，除非另開 ProJED WBS 外自由節點模型。
- 不做 Xmind 匯入/匯出、summary boundary、marker、attachment。

驗收重點：
- 關聯線本體與 label 都可直接選取。
- Space / double-click 可在畫布上 inline 編輯 label，不使用 prompt 作主流程。
- 選取後顯示 circular endpoints 與 square control points。
- endpoint 可拖曳調整連接位置或重新連到另一任務。
- control point 可拖曳調整曲線。
- 樣式控制可調顏色、粗細、線型、箭頭與 label 文字樣式。
- DEV-027B/027C/027D browser regression 需通過。

### DEV-027D: Mind map date display and existing filter integration

| DEV | 狀態 | 類型 | 優先級 | 範圍 | 文件 |
|---|---|---|---|---|---|
| DEV-027D | Implemented / QC Pending | 功能補強 / 心智圖 UX parity | P1 | 心智圖節點顯示日期，並沿用既有 WBS 狀態、到期、負責人、標籤 filter；開始日期由既有 `showStartDate` 控制 | `ai-doc/specs/SPEC-027D-mindmap-date-display-filter.md`, `ai-doc/qa/QA-DEV-027D-mindmap-date-display-filter.md`, `ai-doc/qc/QC-DEV-027D-mindmap-date-display-filter.md` |

驗收重點：
- 節點日期 badge 不得破壞 Xmind-like branch 閱讀與 connector geometry。
- `showStartDate=false` 時不得顯示開始日期。
- `dueWithinDays`、status、assignee、tag filter 必須與 List/Kanban 既有規則一致。
- 父任務被 filter 隱藏時，子任務不得孤立顯示。

### DEV-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview polish

最新範圍補充（2026-06-19）：
- 心智圖新增任務後只選取，不立即開啟 rename input。
- 選取狀態可連續 `Enter` / `Tab` 新增同階或子階任務。
- 方向鍵可移動選取；選取任務後直接打字才改名。
- QA/QC 必須用 DOM、鍵盤流程與截圖驗證此行為，不得沿用舊的 input 連續新增驗收。

| DEV | 狀態 | 節點類型 | 優先級 | 目標 | 文件 |
|---|---|---|---|---|---|
| DEV-027B | Implemented / Browser QC Passed | 開發點 | P0 UI quality reopen | 補齊心智圖模式的 Xmind-like 核心操作缺口：`Enter` 必須在目前任務下方新增同階任務；畫布必須可縮放且維持高解析；connector 必須像使用者圖 1 一樣以整齊 trunk / bracket 呈現而非雜亂交錯；拖曳時必須像使用者圖 2 一樣明確畫出預期插入位置與最終落點。 | `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md`, `ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md`, `ai-doc/qc/QC-DEV-027B-xmind-interaction-polish.md` |

觸發原因：
- 使用者指出目前 `Enter` 行為仍不符合 Xmind：必須在選取任務的「下面」產生同 parent、同 side、同階任務，不能新增到任意位置或只在資料上同階。
- 使用者要求心智圖畫布可縮放，且縮放後文字、節點與線條解析度要夠，不可模糊、鋸齒或錯位。
- 使用者圖 1 顯示同一 parent 底下多個子題需共用整齊垂直 trunk / rounded bracket；目前若線條呈現雜亂曲線、交錯或散落，仍不符合 Xmind-like。
- 使用者圖 2 顯示拖曳中的預覽必須明確畫出插入位置：淡色 placeholder / insertion bar、預期 connector 與 ghost node 必須讓使用者在 mouseup 前知道任務會落在哪裡。

交付邊界：
- DEV-027B 是 DEV-027 的支援開發點，不新增資料模型、不做 Xmind 匯入/匯出、不做 style panel、不做 relationship / summary boundary。
- 需要新增或更新 browser verifier，驗證 keyboard insertion order、zoom rendering、tidy connector topology、drag insertion preview、desktop/laptop/mobile viewport 與 visible error sweep。
- DEV-027A 已通過的 connector endpoint、same-side persistence、viewer read-only、cycle guard 不得退化。

交付證據：
- RD 已完成 `Enter` insert-after-selected sibling，root sibling 會繼承同側 placement。
- RD 已新增 zoom toolbar、reset / fit controls 與 Ctrl/Meta + wheel zoom；connector endpoint 依 zoom 校正。
- RD 已將 parent-child connector 改為 shared trunk / bracket-like H/V topology，並補 children group metadata。
- RD 已新增 explicit insertion placeholder、ghost node clamp、pre-drop connector 與 parent/sibling/side preview metadata。
- QC 已通過 DEV-027B static/browser verifier、DEV-027/DEV-027A regressions、TypeScript、lint、build:test 與 core regression。

## Backlog Update - 2026-06-18

### DEV-027A: Xmind-like connector line and drag interaction repair

| DEV | 狀態 | 節點類型 | 優先級 | 目標 | 文件 |
|---|---|---|---|---|---|
| DEV-027A | Implemented / Browser QC Passed | 開發點 | P0 UI quality reopen | 修復心智圖 branch connector line 與拖曳互動，使父子節點、兄弟 trunk、中心主題到 root branch 的連線形成 Xmind-like 連續拓撲；拖動任務時顯示階層與位置變化的即時預覽動畫；任務可拖到同一側並保留同側布局意圖，並補 connector geometry 與 drag preview browser verifier。 | `ai-doc/qa/QA-DEV-027A-xmind-connector-line-visual-validation.md`, `ai-doc/qc/QC-DEV-027A-xmind-connector-drag-ui.md` |

觸發原因：
- 使用者截圖顯示樹狀圖線條殘破，存在孤立短線、父子關係斷裂、connector endpoint 未貼齊節點等 UI fail。
- 原 DEV-027 browser smoke 有驗證拖曳與 viewport，但未對 branch connector topology 做幾何驗證。
- 使用者新增需求要求拖動任務時需像 Xmind 一樣有任務變化即時預覽動畫，不能只靠原生 drag ghost 或靜態 drop target。
- 使用者新增需求要求任務可拖動到同一側，ProJED 不得再以 root index 強制平均拆成左右兩側。

交付證據：
- RD 已改為 centralized SVG connector overlay，connector endpoint 由 node bbox 計算並隨 resize / scroll / collapse / drag 重算。
- RD 已新增拖曳中的 preview node 與 connector preview，並保存使用者 root side placement 意圖。
- QC 已通過 `verify:dev-027-xmind-connector-lines-browser`、`verify:dev-027-xmind-drag-preview-browser`、`verify:dev-027-xmind-like-mind-map-browser`、static/type/lint/build/core regression gates。

### DEV-027: Xmind-like 心智圖模式

| DEV | 狀態 | 節點類型 | 優先級 | 目標 | 文件 |
|---|---|---|---|---|---|
| DEV-027 | Implemented / Browser QC Passed | 交付點 | P1 planning UX migration | 新增 `心智圖` 模式，讓 active board 的 WBS 任務以 Xmind-like 心智圖呈現；一個任務就是一個分支，只顯示任務名稱，並支援核心鍵盤與拖曳階層操作。 | `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md`, `ai-doc/qa/QA-DEV-027-xmind-like-mind-map-mode.md`, `ai-doc/qc/QC-DEV-027-xmind-like-mind-map-mode.md` |

交付邊界：
- 採 HCS 引導決策 `1A 2B 3A`：核心心智圖 MVP、Xmind-like 視覺布局與互動但不複製品牌細節、完全共用現有 WBS 任務資料。
- 第一版支援模式切換、分支顯示、展開/收合、拖曳階層、雙擊/鍵盤改名、`Enter` 同層、`Tab` 子層、`Delete` 刪除。
- 不新增資料表、migration、草稿區、Xmind 匯入/匯出、關聯線、摘要框、標記、貼紙、style panel、自由縮放定位或任務欄位完整顯示。
- 已補 DEV-027 static verifier 與 browser QC；拖曳階層、cycle guard、viewer 唯讀權限與 mobile viewport 均已由 Playwright browser script 驗證。

### DEV-026: Trello-like 看板分享體驗

| DEV | 狀態 | 節點類型 | 優先級 | 目標 | 文件 |
|---|---|---|---|---|---|
| DEV-026 | Implemented / Browser Smoke Passed | 交付點 | P1 UI/UX migration | 將看板邀請加入流程改為 Trello-like：active board topbar `分享` 入口、`分享看板` modal、email invite、角色 dropdown、複製連結、pending invite 與成員列表；role permission matrix 降層留在設定頁。 | `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md`, `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md` |

交付邊界：
- 保留既有 `board_invites`、accept/revoke、RLS、audit 與 OAuth invite token preserve。
- 不新增 migration，不做名稱 autocomplete，不改工作區層級成員管理。
- 已補 `verify:dev-026-trello-like-board-share-ui`，並完成 desktop 與 390x844 mobile browser smoke；DB role smoke 仍需在 release gate 需要時用 service-role 旗標執行。

## Backlog Update - 2026-06-15

### DEV-024: AI整理保留手寫內容與章節結構

| DEV | 狀態 | 節點類型 | 優先級 | 主題 | 文件 |
|---|---|---|---|---|---|
| DEV-024 | Implemented / Static + Deterministic QC Passed / Browser ROT Not Executed / DB unchanged | 開發點 | P1 AI synthesis guard | 修正 `AI整理` 覆蓋使用者已手寫內容與自訂章節的風險；已新增 deterministic human-draft merge guard，承接 DEV-011 / DEV-012 / DEV-020，並維持 DEV-021 / DEV-022 回歸。 | `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md`, `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md`, `ai-doc/qc/QC-DEV-024-ai-synthesis-preserve-human-draft.md` |

AI synthesis guard 註記：
- `AI整理` 必須整理、補強與統整手寫草稿，不得直接覆蓋 preserved draft。
- 手寫段落、自訂章節、task mention 與 project change evidence 都必須合流到同一份紀錄。
- 禁止只靠 prompt；需有 deterministic merge guard、idempotent test 與真實操作驗證。

### DEV-023: 專案變化匯入整併為紀錄流程第一步

| DEV | 狀態 | 節點類型 | 優先級 | 主題 | 文件 |
|---|---|---|---|---|---|
| DEV-023 | Implemented / Browser QC Passed | 開發點 | P1 UX refinement | 將 `先匯入專案變化` 從流程上方獨立大卡片整併為紀錄流程第一步；父交付點 DEV-020，不新增產品交付點。 | `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md`, `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md`, `ai-doc/qc/QC-DEV-023-record-project-change-import-workflow-step.md`, `verify:dev-023-record-project-change-import-workflow-step`, `verify:dev-020-project-change-import-browser` |

UX refinement 註記：
- 會議紀錄流程：`匯入 -> 速記 -> AI整理 -> 校稿 -> 發布`。
- 個人工作紀錄流程：`匯入 -> 撰寫 -> 存草稿 -> 發布`。
- 匯入仍為 optional step，不阻擋直接撰寫、存草稿或發布。
- DEV-021 / DEV-022 preserve 與 single-record guard 需保持通過。
- 2026-06-29 已通過 DEV-023 static、DEV-020 browser、DEV-021 preserve、DEV-022 single-record 與 TypeScript gate。

### DEV-022: 專案變化匯入後 AI整理同整成單一會議紀錄

| DEV | 狀態 | 節點類型 | 優先級 | 主題 | 文件 |
|---|---|---|---|---|---|
| DEV-022 | Done | 交付點 | P1 | 修正 DEV-021 preserve append 造成匯入內容以第二份完整會議紀錄保留；改為把專案變化 evidence 統整進同一份 AI整理結果。 | `ai-doc/specs/SPEC-022-project-change-single-record-integration.md`, `ai-doc/qa/QA-DEV-022-project-change-single-record-integration.md`, `ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md` |

CAPA 註記：
- DEV-021 已解決「匯入內容不丟失」。
- DEV-022 已補上 integrated synthesis guard，避免輸出出現兩組 `1. 本次會議總結 / 2. 任務討論與結論 / 3. 待校稿項目`。

### DEV-021: 專案變化匯入後 AI整理保留機制

| DEV | 狀態 | 節點類型 | 優先級 | 主題 | 文件 |
|---|---|---|---|---|---|
| DEV-021 | Done | 交付點 | P1 | 修正先匯入專案變化後再 AI整理會覆蓋既有匯入內容；新增 deterministic merge guard、preserve/idempotent verifier 與 QA gate。 | `ai-doc/specs/SPEC-021-project-change-ai-preserve.md`, `ai-doc/qa/QA-DEV-021-project-change-ai-preserve.md` |

DEV-020 狀態風險：
- DEV-020 的「專案變化匯入」與「AI整理」流程已形成可操作路徑，但缺少「已匯入專案變化是受保護內容」的不變式。
- DEV-021 已於 2026-06-15 補齊 deterministic merge guard、preserve/idempotent verifier 與 taskLinks merged-content 驗證。
- DEV-020 的資料保留風險已由 DEV-021 關閉；後續若改動 AI整理回寫，需重跑 DEV-021 gate。

## Backlog Update - 2026-06-11

### DEV-018：會議紀錄防呆 UX/UI 流程重設計

| DEV | 狀態 | 類型 | 優先度 | 摘要 | 文件 |
|---|---|---|---|---|---|
| DEV-018 | In Verification | 交付點 | P1 | 重設會議紀錄側欄為四階段防呆工作流，將 AI整理改為建議性動作，新增未儲存離開三選一防呆。 | `ai-doc/specs/SPEC-018-meeting-record-guardrail-workflow-redesign.md` |
| DEV-019 | Done | 開發點 | P1 | 補足紀錄類型層級：區分會議紀錄、個人工作紀錄與會議流程，避免使用者把類型誤認成流程步驟。 | `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md` |
| DEV-020 | Done | 交付點 | P1 | 重構紀錄功能：看板主入口、開始前決定紀錄類型、預設專案變化匯入、完整未儲存防呆與含流程圖的功能說明。 | `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` |

範圍邊界：

- 不新增資料表或 migration。
- 不改 `KnowledgeRecord`、`record_task_links`、RAG token 格式。
- 不新增 BoardView 上方會議操作列。
- 不把 AI整理改成自動任務修改。
- 手機版會議紀錄工作流不列入 release gate。

更新日期：2026-06-11

## Backlog 管理原則

- 產品完成率只計入 `交付點` DEV。
- 支援交付、補測、RLS 修正、adapter 抽象等工作列為 `開發點`，必須掛在父交付點下。
- PM evidence 文件不計入產品完成率。
- 新增交付點或擴大交付範圍前，需先取得使用者確認。

## Active 交付點

| DEV | 狀態 | 節點類型 | 優先級 | 主題 | 文件 |
|---|---|---|---|---|---|
| DEV-002 | Done | 交付點 | P1 | 會議紀錄與個人工作紀錄 MVP | `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md` |
| DEV-005 | Done | 交付點 | P1 | 會議看板主畫面紀錄工作流 | `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` |
| DEV-006 | Done | 交付點 | P1 | Gmail-like 會議紀錄輸入器穩定化 | `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` |
| DEV-007 | Done | 交付點 | P1 | 會議中原生看板編輯與任務變更紀錄 | `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` |
| DEV-008 | Done | 交付點 | P1 | 任務會議細節快速查找 | `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` |
| DEV-009 | Done | 交付點 | P1 | 會議模式任務詳情內快速補記 | `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` |
| DEV-010 | Done | 交付點 | P1 | 會議紀錄操作按鈕狀態溝通設計 | `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` |
| DEV-011 | In Verification | 交付點 | P1 | AI 任務導向會議紀錄統整工作流 | `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` |
| DEV-012 | In Verification | 交付點 | P1 | AI 會議紀錄自然語言品質提升 | `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` |
| DEV-013 | Done | 交付點 | P1 | 右鍵清單任務複製，包含子任務與子樹內部依賴 | `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` |
| DEV-020 | Done | 交付點 | P1 | 紀錄功能重構與專案變化匯入流程 | `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` |
| DEV-027 | Implemented / Static + Browser Smoke Passed | 交付點 | P1 planning UX migration | Xmind-like 心智圖模式 | `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md` |

## Active 開發點

| DEV | 狀態 | 父交付點 | 優先級 | 主題 | 文件 |
|---|---|---|---|---|---|
| DEV-019 | Done | DEV-002 / DEV-005 / DEV-018 | P1 | 紀錄類型與會議流程層級重整 | `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md` |
| DEV-023 | Ready | DEV-020 | P1 UX refinement | 專案變化匯入整併為紀錄流程第一步 | `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md` |
| DEV-024 | Implemented / Static + Deterministic QC Passed / Browser ROT Not Executed / DB unchanged | DEV-011 / DEV-012 / DEV-020 | P1 AI synthesis guard | AI整理保留手寫內容與章節結構 | `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md` |

## DEV-002 範圍摘要

目標：在 ProJED 中建立「會議紀錄」與「個人工作紀錄」功能，透過 task node 連結紀錄與任務，並為後續 AI 全域分析建立可索引的知識資料基礎。

MVP 必須包含：

- 會議紀錄表單：紀錄時間、參與人員文字輸入、內容、關聯任務。
- 個人工作紀錄表單：記錄人員固定為目前登入者、時間區間預設一週前到今天、內容、關聯任務。
- 可收疊右側紀錄填寫欄。
- 進入任務選取模式時，自動收起右側欄。
- 看板式任務選取器。
- 紀錄列表。
- 任務詳情頁相關紀錄時間軸。
- published record 同步進 RAG documents。
- AI citation 可回到原始紀錄。

MVP 不包含：

- 語音逐字稿。
- 參與人員 member mapping。
- AI 自動修改任務。
- 複雜審批流程。

## DEV-005 範圍摘要

目標：將會議紀錄工作流從「紀錄頁主導」調整為「議題看板主導、紀錄輔助」，讓開會時所有人以 active board 的 Kanban 議題作為共同畫面，記錄者用右側速記欄同步記錄與連結任務。

MVP 必須包含：

- 上方會議入口：啟動後建立或開啟 meeting draft，切到 `board` view。
- `BoardView` 會議狀態列：會議標題、已連結任務數、速記欄展開/收合、儲存草稿、發布、結束會議。
- 會議模式下點 Kanban card / checklist item 可直接插入 `@[title](task:id)`。
- `RecordSidebar` 在 meeting mode 下優先顯示內容編輯器，最近紀錄列表降級。
- `RecordsView` 保留為會後查閱與整理的紀錄庫，不作為會議主畫面。

MVP 不包含：

- 完整會議管理。
- AI 決議抽取或自動建立任務。
- 跨 board 會議。
- 多記錄者即時協作。
- 新增 migration 或修改 `KnowledgeRecord` / `record_task_links` 資料格式。

## DEV-006 範圍摘要

目標：將會議紀錄內容輸入器改為 Gmail-like 基本撰寫體驗，修正目前自製 `contentEditable` 的選取、換行、貼上、undo/redo 與 IME 問題，並讓已關聯任務 chip 可複製、剪下、貼上與移動。

MVP 必須包含：

- 導入成熟 editor engine，取代手寫 DOM serialize / replaceChildren 同步。
- 保留既有 `@[title](task:id)` token 與 `record_task_links` 資料契約。
- 支援 `Ctrl+A`、`Ctrl+Z`、`Ctrl+Y`、Enter、貼上多行、中文 IME。
- 支援 task chip copy / cut / paste / move / Backspace / Delete。
- 新增自動 verifier 與實際輸入測試證據。

MVP 不包含：

- Gmail 富文字工具列。
- bold / italic / link / list 儲存。
- 新增 migration 或 editor JSON 後端格式。

## DEV-007 範圍摘要

目標：會議中看板仍維持一般編輯模式，不劫持卡片點擊；任務狀態、移動與關鍵變更在背景收集，儲存或發布會議紀錄時自動附加到內容。

MVP 必須包含：

- 會議模式不改變 Kanban card / checklist item 的主要點擊、拖曳與編輯行為。
- 任務變更自動收集為 meeting activity。
- 儲存/發布時將尚未附加的 activity 以 `@[title](task:id)` token 形式加入紀錄內容。
- 不新增 migration，不改 `KnowledgeRecord` / `record_task_links`。

## DEV-008 範圍摘要

目標：未來專案成員可從任務詳情快速查找該任務在會議或工作紀錄中被討論過的細節，不需要進入紀錄庫翻整篇紀錄。

MVP 必須包含：

- 任務詳情頁將「關聯紀錄」升級為「任務知識」區塊。
- 已關聯紀錄優先顯示包含目前任務 inline tag 的段落片段。
- 沒有 inline tag 但有 `record_task_links` 的紀錄仍顯示整篇關聯 fallback。
- 提供目前任務範圍內的搜尋，涵蓋任務備註、會議片段、工作紀錄片段與 DEV-007 任務變更片段。
- 點擊片段可開啟原始紀錄。

MVP 不包含：

- AI 問答或語意搜尋。
- AI 自動摘要、決議抽取或自動標記任務。
- 新增 migration、meeting event table 或修改紀錄資料格式。

## DEV-009 範圍摘要

目標：會議模式下，使用者可在任務詳情內直接補記目前任務的討論內容，系統自動把補記 append 到目前 meeting draft 並連到該任務。

MVP 必須包含：

- `TaskDetailsModal` 在 meeting mode 顯示「本次會議」快速補記。
- 補記內容 append 到目前 meeting draft，不寫入任務備註。
- 系統自動加入目前任務 inline tag，並同步 `record_task_links`。
- 支援「加入紀錄」與 `Ctrl+Enter`。
- 發布後可由 DEV-008 任務知識查到。

MVP 不包含：

- 在任務詳情內編輯整篇會議紀錄。
- AI 摘要、決議抽取或任務自動更新。
- 新增資料模型或多人即時協作。

## DEV-010 範圍摘要

目標：修正會議模式中 `存草稿`、`發布`、`結束會議` 按鈕狀態不透明的 UX 問題。當按鈕不可操作時，系統需說明原因與下一步；`存草稿` 與 `發布` 需拆成不同條件；`結束會議` 需改成更清楚的 `離開會議模式` 語意，並保護未儲存內容。

MVP 必須包含：

- 會議狀態列顯示目前 draft 狀態、阻塞原因與下一步。
- `存草稿` 在 meeting draft 存在且有 workspace / board 時可用，不因內容空白被靜默鎖住。
- `發布` 只有在內容、任務補記或 pending meeting activity 足夠時可用。
- disabled / aria-disabled 按鈕需有 hover、focus 與狀態列提示。
- `結束會議` 改為 `離開會議模式` 或提供等價說明；有未儲存內容時需確認。
- `BoardView` 與 `RecordSidebar` 共用同一套 action state 判斷。

MVP 不包含：

- 手機版會議紀錄工作流。
- 新增 migration 或調整 `KnowledgeRecord` / `record_task_links`。
- AI 摘要、會議管理、跨 board 會議。

## DEV-011 範圍摘要

目標：將會議紀錄從逐筆 append 流水帳改為 AI 發布前統整草稿。AI 讀取速記、任務補記、meeting activity 與任務脈絡，產出任務導向草稿；人類校稿後才發布。

MVP 必須包含：

- 發布前先由後端 AI 統整 meeting draft。
- AI 只更新 draft content，不修改任務。
- 原始 activity 不逐筆進入 published 正文。
- 保留 task tag，支援 DEV-008 任務知識查找。
- AI 失敗時保留原草稿。

MVP 不包含：

- 即時 AI 統整。
- 新增 migration 或修改紀錄資料格式。
- AI 自動建立、修改、移動任務。

## DEV-012 範圍摘要

目標：提升 DEV-011 AI 草稿品質，讓會議紀錄更像人類整理出的任務紀要，而不是死板欄位填空。保留三個大章節與 task tag，但任務內容只整理會中實際變更、速記與任務詳情補記，不用專案既有狀態補內容，也不自行推論下一步。

MVP 必須包含：

- 任務段落以階層編號與 task tag 呈現，例如 `2.1 @[列表](task:id)`、`2.1.1 @[卡片](task:id)`、`2.1.1.1 @[子任務](task:id)`。
- 任務內容使用自然語言摘要，不使用五欄固定模板。
- 每個任務保留 1 段紀要；只有人類明確講到時才列下一步。
- 不輸出目前任務狀態、任務背景、既有備註或沒有會議資訊的填充句。
- Edge Function 預設首選模型為 `gemini-3.5-flash`，並保留 env override；未設定 env override 且首選模型 unavailable 時，可受控 fallback 到 `gemini-3.1-flash-lite`，但 response 必須揭露 `warnings` 與實際 `model`。
- Golden samples verifier 檢查自然語言品質與 DEV-008 片段抽取相容性。

MVP 不包含：

- 新增 migration。
- AI 自動修改任務。
- 即時 AI 統整。
- 手機版會議紀錄工作流。

## 後續候選交付

| 候選項目 | 狀態 | 說明 |
|---|---|---|
| 紀錄 RAG 整合強化 | Backlog | 若 DEV-002 只完成基本 documents mirror，後續可獨立強化 chunking、embedding job、citation 開啟紀錄與 indexing retry。 |
| AI 全域分析 | Backlog | 加入 graph expansion retrieval，支援專案健康、延期原因、會議決議、個人投入與任務進度分析。 |
| 會議紀錄模板與決議抽取 | Backlog | 從會議紀錄抽取決議、阻塞、待辦，但 AI 只能建議，不能直接修改任務。 |

## 開放決策

| 決策 | PM 建議 | 影響 |
|---|---|---|
| 個人工作紀錄預設可見性 | `project` | 可保留 AI 專案分析價值；若改為 `private`，全域分析資料量會降低。 |
| 部門會議跨 board 連結 | 支援 | MVP UI 先從 active board 開始，再提供 board 切換。 |
| AI 是否可直接修改任務 | 不可 | AI 只提出建議，使用者確認後才新增或更新任務。 |

## 目前阻塞 / 待人工驗證

- Firebase Hosting 已部署到 `https://projed-cc78d.web.app`。
- DEV-011 / DEV-012 production backend AI smoke 已通過：正式 Edge Function 以授權 user JWT 呼叫回 `200`，實際模型為 `gemini-3.5-flash`。
- DEV-011 / DEV-012 尚待 production UI smoke：正式前端使用 Google OAuth，需互動式登入後驗證 meeting mode、AI整理、校稿發布、紀錄庫與任務知識查找。
- DEV-013 已完成 QC fact report。

---

## PM Backlog Update - 2026-06-04

| DEV | 狀態 | 類型 | 優先級 | 標題 | 規格 |
|---|---|---|---|---|---|
| DEV-003 | Done | Product UX refinement | P1 | 紀錄內容內嵌任務標籤 | `ai-doc/specs/SPEC-004-record-content-inline-task-tags.md` |
| DEV-005 | Done | Product UX refinement | P1 | 會議看板主畫面紀錄工作流 | `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` |
| DEV-006 | Done | Product UX refinement | P1 | Gmail-like 會議紀錄輸入器穩定化 | `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` |
| DEV-008 | Done | Product UX refinement | P1 | 任務會議細節快速查找 | `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` |
| DEV-009 | Done | Product UX refinement | P1 | 會議模式任務詳情內快速補記 | `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` |
| DEV-010 | Done | Product UX refinement | P1 | 會議紀錄操作按鈕狀態溝通設計 | `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` |
| DEV-011 | In Verification | Product UX refinement | P1 | AI 任務導向會議紀錄統整工作流 | `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` |
| DEV-012 | In Verification | Product UX refinement | P1 | AI 會議紀錄自然語言品質提升 | `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` |
| DEV-013 | Done | Product UX refinement | P1 | 右鍵清單任務複製，包含子任務與子樹內部依賴 | `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` |

### DEV-003 摘要

修改紀錄與任務的關聯流程：使用者從看板點選任務後，任務需以 Codex-like inline tag 直接插入紀錄 `內容` 編輯器目前游標位置。

### 驗收重點

- 使用者可把游標放在紀錄內容中，並將看板任務插入該位置。
- 插入任務需顯示為 visual chip/tag，不只是下方關聯任務列。
- 同一任務可在內容中被引用多次。
- 結構化 `record_task_links` 保持唯一，權限與 RAG 行為不變。
- 沿用既有看板選取模式，不開啟另一個 task picker page。

### DEV-005 摘要

改善會議進行中的紀錄 UX：主畫面固定為議題看板，右側紀錄欄只作為速記與任務連結輔助。此項承接 DEV-002 的紀錄基礎與 DEV-003 的 inline task tag，不改資料模型。

### DEV-005 驗收方向

- 開會入口啟動後停留在 `board` view。
- 會議狀態列清楚顯示 draft、已連結任務數與儲存/發布操作。
- 點 Kanban card / checklist item 可插入 task tag。
- 速記欄收合/展開不遺失 draft。
- 紀錄庫只作為會後查閱與整理。

---

## Future Upgrade Tracking - SPEC-002 全人個人與團隊待辦平台

來源規格：`ai-doc/specs/SPEC-002-whole-person-todo-platform.md`

治理原則：

- 未來升級不得只停留在對話或口頭共識中。
- 狀態使用 `future`、`planned`、`in_progress`、`done`、`dropped`。
- 升級進入 `planned` 時，需建立或更新對應 spec、dev task 與驗證計畫。
- 涉及資料模型、後端同步、權限或 AI 自動化時，需明確記錄風險與驗證方式。

| 升級項目 | 狀態 | 觸發條件 | 主要風險 | 驗證方式 |
|---|---|---|---|---|
| Supabase / Firebase 雙後端一致性 | future | DEV-004 MVP 在 Firebase/local backend 穩定後 | schema drift、RLS、adapter 行為不一致 | Firebase/Supabase 雙後端 CRUD smoke、RLS smoke、build/typecheck |
| 完整同步佇列 UI | future | pending 離線項目量增加或使用者需要手動重試 | 重複建立、同步順序錯誤、使用者誤判狀態 | 離線/恢復連線流程測試、重試與失敗狀態測試 |
| AI 分類、日期、看板與任務位置建議 | future | 手動整理流程穩定且資料足夠後 | AI 誤判造成錯誤分類或錯誤承諾 | 建議只預填不寫入、人工確認率與更正率追蹤 |
| 團隊承諾功能 | future | 輕量共享與正式任務轉換使用穩定後 | 責任流過重、通知噪音、權限不清 | QA FMEA、週回顧流程測試、通知壓力檢查 |
| browser notification / email / calendar 外部提醒 | future | 站內提醒中心可信且使用者仍漏看時 | 通知轟炸、外部同步錯誤、時區問題 | 通知頻率測試、取消/退訂流程、calendar/email smoke |
| 拖曳式看板定位 | future | 點選插入線互動穩定後 | 拖曳碰撞判定、觸控與捲動衝突 | 桌面/手機拖曳 smoke、插入順序與 rollback 測試 |
| 通知稍後提醒 | future | 已讀/未讀通知不足以支援使用者節奏時 | reminder 模型擴張、重複提醒噪音 | snooze 邏輯測試、badge/通知狀態一致性測試 |
| 進階歷史搜尋與日期篩選 | future | 歷史資料量增加導致文字搜尋不足 | 搜尋效能、篩選條件混淆 | 歷史搜尋效能測試、日期/類型篩選測試 |

## Planned 交付候選 - DEV-004 全人個人與團隊待辦平台 MVP

DEV-004 為 umbrella PM delivery program；實際 RD/QA/QC 追蹤以 DEV-004A 到 DEV-004D 四個獨立交付點執行。四個交付點都完成後，DEV-004 才視為 MVP 交付完成。

| DEV | 狀態 | 節點類型 | 父交付點 | 優先級 | 標題 | 規格 |
|---|---|---|---|---|---|---|
| DEV-004A | Planned | 交付點 | DEV-004 | P1 | 資料模型與 service/store | `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` |
| DEV-004B | Planned | 交付點 | DEV-004 | P1 | 全域收件匣與頂部快速捕捉 | `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` |
| DEV-004C | Planned | 交付點 | DEV-004 | P1 | 右側抽屜、我的今日、通知與歷史 | `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` |
| DEV-004D | Planned | 交付點 | DEV-004 | P1 | 看板定位 overlay 與正式任務轉換 | `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` |
