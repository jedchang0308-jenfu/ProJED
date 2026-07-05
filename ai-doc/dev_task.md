# ProJED Dev Task Control Board

## PM Update - 2026-07-05

### DEV-041: PWA 更新通知與快取恢復

狀態: Production Release Deployed / Local + Production Smoke Passed
節點類型: 交付點
父交付點: Production release readiness / PWA lifecycle reliability
是否計入產品交付完成: 是，限正式部署前的使用者更新可見性、快取恢復與版本切換可靠性
建立日期: 2026-07-05

原始需求邊界:
- 使用者想把新版本部署到正式環境，但擔心使用者不知道有更新，或快取未清造成異常。
- 使用者詢問是否可像市面 APP 一樣提供更新通知與更新按鈕。
- HCS/PM 判斷：可以，且應在正式部署前先完成；正常更新應由使用者可見提示與手動更新按鈕承接，cache/chunk-load 類異常才走較強恢復。

Human Decision Brief:
- 已確認：需要可見的新版本更新通知，不再只依賴 service worker 背景更新。
- 已確認：需要更新按鈕，讓使用者主動套用新版本。
- AI 補充契約：正常更新不得在使用者操作中強制刷新；按下更新後才套用。
- AI 補充契約：stale chunk / cache failure 需要 recovery path 與 reload loop guard。
- AI 補充契約：Phase 1 不新增後端 schema、release API、push notification、analytics 或 production deploy。

目前授權邊界:
- Authorized: DEV-041 Phase 1 RD implementation、QA/QC verifier、文件更新、Firebase Hosting production deploy 與 deployment-release-gate execution。
- Not Authorized: 強制更新政策、release notes 後端、版本 API、analytics、push/email notification、DB schema / migration / RLS / RPC。

End-State Architecture:
- `pwaUpdateService` 成為 PWA lifecycle 單一資料源，統一管理 update available、offline ready、apply update、cache recovery 與 failed state。
- 全域 `AppUpdatePrompt` 或等效元件接收 update state，顯示「有新版本」與「更新」按鈕。
- 使用者按更新後才執行 `updateSW(true)` 或 service 封裝的 `applyUpdate()`。
- chunk-load failure 與 `GlobalErrorBoundary` 使用同一套 recovery guard，避免無限 reload。
- production deploy 前必須能驗證新版本提示、更新按鈕、cache recovery 與 DEV-034 PWA install guidance regression。

RD Handoff:
- Phase 1: Visible PWA Update Prompt & Cache Recovery，Document status 為 `Local + Browser QC Passed / Complete`。
- Phase 1 scope：擴充 `src/services/pwaUpdateService.ts` update state、掛載全域更新提示 UI、實作更新按鈕、dismiss/later、chunk-load/cache recovery guard、ErrorBoundary recovery 整合、static/browser verifier。
- Phase 1 touchpoints：`src/services/pwaUpdateService.ts`、`src/main.tsx`、`src/App.tsx` 或全域 layout、`src/components/AppUpdatePrompt.tsx` 或等效新元件、`src/components/GlobalErrorBoundary.tsx`、DEV-041 verifier scripts。
- Phase 2: Production Release Gate，Document status 為 `Production Release Deployed / Post-Deploy Smoke Passed`；已套用 `deployment-release-gate`。
- Phase 3: Optional Release Metadata / Mandatory Policy，Document status 為 `RD Contract Ready / Not Authorized`；release notes、版本 API、強制更新與 analytics 另行決策。

Acceptance:
- `onNeedRefresh` 觸發時，畫面出現可見更新提示。
- 更新提示包含明確「更新」按鈕，按下後只執行一次套用流程並可 reload 到新版本。
- dismiss/later 不得讓本 session 反覆被打擾，也不得錯誤遺失已知 update callback。
- stale chunk / cache failure 有可驗收 recovery path，且具備 reload loop guard。
- cache recovery 不得清除未授權業務資料。
- 390x844 mobile 與 1440x900 desktop viewport 下提示可見、可點、不溢出、不遮蔽主要工作流。
- DEV-034 PWA install guidance 不得被破壞。
- 不得宣稱 production deploy 或正式站 smoke 完成，除非另走 deployment-release-gate。

QA / QC gate:
- `npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery`
- `npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser`
- `npm.cmd run verify:dev-034-pwa-install-guidance`
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`

QC evidence（2026-07-05）:
- `npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery` passed，21/21。
- `npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser` passed；mobile update prompt visible/tappable、dismiss keeps queued update state、update button invokes callback、recovery prompt exposes cache action。
- DEV-034 static/browser regression passed。
- DEV-028 static/browser regression passed；static 35/35。
- DEV-029 static/browser regression passed；static 27/27。
- DEV-039 task-filter-core static/browser passed；static 61/61。
- DEV-039 filter-result-parity static/browser passed；static 26/26。
- DEV-039 placement lanes static/browser passed；static 22/22。
- DEV-039 cross-board source static/browser passed；static 23/23。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build:test` passed。
- `npm.cmd run build` passed；production bundle `assets/index-C2sty1Hz.js`，CSS `assets/index-Bz5Y4Esx.css`，PWA `sw.js` generated。
- Production-like preview smoke passed at `http://127.0.0.1:4174/` with service worker ready and no critical runtime errors。
- Firebase Hosting deploy passed：`npx.cmd firebase deploy --only hosting --project projed-cc78d --non-interactive`，Hosting URL `https://projed-cc78d.web.app`。
- Post-deploy HTTP smoke passed：`web.app` and `firebaseapp.com` HTTP 200 and load `index-C2sty1Hz.js`。
- Post-deploy browser smoke passed：app shell non-empty, `sw.js` ready, no critical console/pageerror/failed request。
- `npm.cmd run verify:dev-040-production-auth-ui-smoke` passed；temporary Supabase user/tenant cleaned up, project import resolved, task workbench unplaced task persisted after board switch。
- QC report: `ai-doc/qc/QC-DEV-041-pwa-update-notification-cache-recovery.md`。

Deferred Scope Audit:
- production deploy / Firebase Hosting release: Blocked Human Re-entry，需使用者明確授權並走 deployment-release-gate。
- mandatory update / forced refresh: RD Contract Ready / Not Authorized，牽涉使用者工作中斷風險。
- release notes backend / remote version API: Deferred / New DEV Candidate。
- analytics / update adoption tracking: Deferred / New DEV Candidate。
- push notification / email notification: No Tracking Until Requested。
- DB schema / Supabase migration / RLS / RPC: Not In Scope。

All-Phase Coverage Matrix:

| Phase | 名稱 | 文件狀態 | 授權狀態 | Exit Evidence |
|---|---|---|---|---|
| 0 | PM/RD Contract | Complete | Authorized | SPEC/QA/dev_task/documentation_map/backlog updated |
| 1 | Visible PWA Update Prompt & Cache Recovery | Local + Browser QC Passed | Authorized / Complete | local static/browser verifier、TypeScript、build:test、DEV-034 regression |
| 2 | Production Release Gate | Production Release Deployed / Post-Deploy Smoke Passed | Authorized / Complete | deployment-release-gate evidence、post-deploy smoke、rollback readiness |
| 3 | Optional Release Metadata / Mandatory Policy | RD Contract Ready | Not Authorized | separate human decision、SPEC addendum or new DEV |

文件:
- `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md`
- `ai-doc/qa/QA-DEV-041-pwa-update-notification-cache-recovery.md`

## PM Update - 2026-07-04

### DEV-029: 手機 Pan-First 觸控手勢仲裁

狀態: Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed
節點類型: 交付點
父交付點: DEV-028 mobile interaction follow-up
是否計入產品交付完成: 是，限手機看板主要操作可用性
建立日期: 2026-07-04

原始需求邊界:
- 使用者指出手機模式下移動畫面只能按任務卡縫隙，不好用。
- 使用者提出方向：「短按所有畫面都可以移動，長按才觸發其他功能」，並要求用 HCS `#批判 #演算法 #最佳化` 判斷是否適合。
- HCS 判斷：方向適合，但需精準化為「短滑 / 移動優先」而不是「短按一下即移動畫面」；手機要採 pan-first，長按才進入任務功能。
- 使用者要求由 Dev PM 寫成開發文件；後續使用者明確要求 Dev PM 指揮 RD 修正，直到 QA 驗證通過，故 DEV-029 Phase 1 RD implementation 已授權並完成。

Human Decision Brief:
- 已確認：手機主要使用情境是瀏覽、定位與移動畫面，任務卡主體不得成為阻擋 pan 的區域。
- 已確認：短滑任務卡、子任務列、欄位與空白處不得誤開詳情、rename、context menu 或 drag；無位移 tap 仍開任務詳情，長按才進入任務操作選單。
- 已確認：按鈕、輸入框、日期、依賴、負責人、標籤、filter popover、modal 內控制與 explicit drag handle 是例外，不得被 pan-first 攔截。
- AI 補充契約：`touchmove` 位移超過 8-10px 視為 pan，需 suppress compatibility click；長按門檻採 450-550ms 並需低位移容忍。
- AI 補充契約：DEV-028 的右鍵 / 長按任務操作選單仍有效；若與手機短滑安全衝突，DEV-029 對手機 coarse pointer pan 仲裁優先。

目前授權邊界:
- Authorized: DEV-029 Phase 1 前端 pan-first RD implementation、static/browser verifier 更新、PM/DEV/SPEC/QA/QC/documentation_map/backlog 文件更新與 DEV-028 相容註記。
- Not Authorized: production deploy、資料庫 schema / migration / RLS / RPC、手機非 board modes 重新開放、再次取消或重定義手機 tap-to-details。

End-State Architecture:
- BoardView mobile surface 採集中式 gesture arbitration，而不是各卡片自行堆例外。
- `useTouchTapGuard` / `useLongPress` / `useDragSensors` / CSS `touch-action` 形成同一條觸控判斷鏈。
- `KanbanCard`、`KanbanChecklist`、`KanbanColumn`、BoardView scroll surface、TaskWorkbenchPanel mobile overlay 均接受 pan-first 合約。
- explicit interactive controls 保留原本 click/tap 行為；explicit drag handle 才可比主卡面更積極攔截 touch。

RD Handoff:
- Phase 1: Board Mobile Pan-First，Document status 為 `Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed`。
- Phase 1 scope：手機看板任務卡、子任務列、欄位、空白處與任務台 mobile overlay 的短滑 pan safety；長按任務功能；互動控制例外。
- Phase 1 touchpoints：`src/hooks/useTouchTapGuard.ts`、`src/hooks/useLongPress.ts`、`src/hooks/useDragSensors.ts`、`src/components/BoardView.tsx`、`src/components/Wbs/KanbanCard.tsx`、`src/components/Wbs/KanbanChecklist.tsx`、`src/components/Wbs/KanbanColumn.tsx`、`src/components/TaskWorkbenchPanel.tsx`、`src/index.css`、DEV-029 static/browser verifiers。
- Phase 2: Future Mobile Non-Board Modes，Document status 為 `RD Contract Ready / Not Authorized`，僅在手機重新開放 list / mindmap / gantt / calendar 時啟動。

RD Implementation 摘要:
- 2026-07-04 真機回饋修正：手機 pan-first 不應取消任務詳情入口；無位移 tap 需開 `TaskDetailsModal`，短滑 pan 才 suppress click-through。
- 2026-07-04 L2+ 真機回饋修正：L2+ checklist row 不得成為不可移動的操作 window；手機從子任務列起手垂直 pan 應推動 column `scrollTop`，水平 pan 應推動 board `scrollLeft`。
- `KanbanCard` / `KanbanChecklist` 保留一般 `selectAndOpenTaskDetails()`；由 `useTouchTapGuard()` 負責短滑後 suppress compatibility click。
- `BoardView` 掛載 `useMobilePanBroker()`；`KanbanCard` 忽略 checklist row touch；`KanbanChecklist` 移除 touch `stopPropagation()`；隱藏 rename pencil 不可見時不攔截 pointer event。
- `TaskWorkbenchPanel` 的未歸位與所有任務排序 row 套用 `useTouchTapGuard()`，短滑後 suppress compatibility click，避免 row pan 後誤開詳情。
- DEV-029 static/browser verifier 補上「tap 開詳情、pan 不開詳情」、L2+ scroll displacement、隱藏控制項 hit-test 與 workbench row tap guard 檢查。

Acceptance:
- 390x844 手機 viewport 下，在 task card body、checklist row、column body、board empty surface 上短滑，不得開 `TaskDetailsModal`、rename input、context menu 或 drag preview。
- 任務卡主體不可要求使用者找縫隙才能 pan。
- 長按任務卡 / 任務列可觸發任務操作選單或既有 long press flow。
- filter button、add input、date / dependency / assignee / tag control、modal / popover controls 可正常點擊與輸入。
- Desktop click-to-details 契約不得被一起改壞；DEV-028 桌機語意仍有效。
- 手機 viewport 不得出現 horizontal overflow、modal 裁切、popover 重疊或 visible runtime error。

QA / QC gate:
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`

QC evidence（2026-07-04）:
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions` passed，27/27。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` passed，wrapper exit code 0。
- Fixed Playwright session `dev029-l2-scroll-clean` matrix passed，25/25；`QA-029-B07` L2+ vertical pan `scrollTop: 0 -> 38`，`QA-029-B08` L2+ horizontal pan `scrollLeft: 0 -> 120`，`QA-029-D01` mobile quick tap 開啟正確 `TaskDetailsModal`，`QA-029-B06` workbench row pan 不誤開詳情，`QA-029-D03` desktop click-to-details 保留。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions` passed，35/35。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes` passed，22/22。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` passed。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build:test` passed。
- `git diff --check` passed with CRLF warnings only。
- QC report: `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md`。

Stop conditions:
- 任務卡主體短滑仍開詳情。
- 只有卡片縫隙可 pan。
- 長按任務操作選單消失或與 pan 互相誤觸。
- interactive controls 被 pan guard 擋住。
- dnd-kit 在短滑時先搶走 touch，造成畫面不能自然移動。
- 需要恢復手機 tap-to-details、手機拖曳排序優先或 production deploy，但未取得使用者重新授權。

Deferred Scope Audit:

| Deferred / Out-of-scope item | Classification | Tracking target | Resume condition |
|---|---|---|---|
| 手機非 board modes pan-first | Same Spec Phase | DEV-029 Phase 2 | 重新開放 mobile list / mindmap / gantt / calendar |
| Mobile tap-to-details 恢復 | No Tracking | DEV-029 Phase 1 | 已依 2026-07-04 真機回饋恢復；後續若要再次取消或重定義，需重新授權 |
| 手機任務拖曳排序全面重設計 | New DEV | Backlog after DEV-029 Phase 1 | 使用者要求手機拖曳排序優先於 pan |
| Production deploy | Blocked Human Re-entry | deployment-release-gate | 使用者明確授權部署 |
| DB / schema / RLS / migration | No Tracking | None | 本需求為前端手勢，不涉及資料層 |

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Acceptance | Evidence |
|---|---|---|---|---|---|
| DEV-029 Phase 1 | Authorized by user 2026-07-04 | Phase 1 Implemented / Local Automated QA Passed / Production Not Deployed | Board mobile pan-first gesture arbitration | 任務卡/子任務/欄位/空白短滑可 pan；長按才任務功能；interactive controls 可用 | DEV-029 static/browser、DEV-028 regression、DEV-039 workbench mobile regression、TS、build:test、QC-DEV-029 |
| DEV-029 Phase 2 | Not Authorized | RD Contract Ready / Not Authorized | Future mobile non-board modes pan-first normalization | 各模式 pan-first 且不破壞模式專屬操作 | mode-specific browser verifiers、DEV-027/028 regression |
| Production Release Gate | Not Authorized | Blocked Human Re-entry | 正式環境發布與 smoke | production smoke + rollback readiness | deployment-release-gate |

交付文件:
- `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md`
- `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md`
- `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md`
- `ai-doc/documentation_map.md`
- `ai-doc/backlog.md`

Next condition:
- 若要宣告完整 physical-phone UX，需補 H01-H04 真機 iOS Safari / Android Chrome 錄影或等效裝置證據。
- Phase 2、production deploy、再次取消或重定義手機 tap-to-details 仍需另行授權。

### DEV-039 Phase 2 Addendum：全域任務平台跨看板資料來源與刪除有效可見性

狀態: Phase 2 Cross-Board Source Slice Implemented / Local Automated QC Passed / No DB-RLS-Migration / Production Not Deployed
節點類型: 交付點內 Phase 2 implementation slice
父交付點: DEV-039
是否計入產品交付完成: 是，限 `所有任務排序` 跨看板來源與刪除有效可見性 slice；不包含 partial/error summary、remote migration、RLS/RPC、production deploy 或資料修復
建立日期: 2026-07-04

原始需求邊界:
- 使用者指出 `所有任務排序` 必須跨越所有看板同時顯示在工作台中，而不是只顯示現在看板。
- 使用者指出看板將任務刪除後，`所有任務排序` 裡應該同步消失，但目前仍殘留。
- 使用者要求用 HCS `#系統描繪` 釐清架構後，再由 Dev PM 寫成開發文件。
- 2026-07-04 follow-up：使用者截圖回報已刪除項目仍在 `所有任務排序`；HCS `#多層次分析` 判定殘留來源包含排序候選未區分 task-like 與 `group/list` 容器，以及缺父節點 orphan 被 effective visibility 放行。
- 2026-07-04 HCS `#引導模式` 決策：使用者選擇 `1C`，因此列表/群組容器不是永久硬排除，而是預設不顯示、可由工作台顯示設定切換；第 2 / 3 題未指定選項，依建議採 `2A / 3A`，orphan 仍不可見並需 static/browser 驗證。
- 2026-07-04 UI follow-up：使用者要求排版更密集、去除不必要元素、只保留文字資訊；依 HCS `#效用理論 #批判`，任務台清單改為 dense text rows，移除大卡片、拖曳點圖示、陰影與日期 chip，拖曳能力改由整列承接。
- 2026-07-04 hierarchy follow-up：使用者指出 `所有任務排序` 將所有 level 放在一起難以辨識階層；依 HCS `#心理成因 #捷思法`，保留日期排序，但用縮排與字重/灰階呈現 parent-child hierarchy。
- 2026-07-04 sticky title follow-up：使用者指出 `未歸位` 與 `所有任務排序` 是區塊標題，需用不同 UI 呈現且不可因區塊捲動被隱藏；依 UI/UX gate，兩者改為 sticky section headers。
- 2026-07-04 chevron collapse follow-up：使用者指出折疊 UI 符號需一致，選用精簡 chevron；collapsed rail 寬度縮小 50%，且展開狀態的收合按鈕也需從 panel icon 改成 `ChevronLeft`。

Human Decision Brief:
- 已確認：`所有任務排序` 的目標來源是所有可見看板任務，不是 active board，也不是 popover selected board。
- 已確認：`過濾器` popover 裡的看板 selector 只表示正在設定哪個看板的 filter state，不是來源範圍。
- 已確認：任務在看板刪除後不得留在 `所有任務排序`；若刪除父層/list/card，descendant 不得因扁平投影而殘留。
- 已確認目標架構：`listWorkbenchTasks()` 跨所有可見看板取任務，`mergeUnplacedTasks()` 合併未歸位，`projectTaskFilterResults by boardId` 依各看板 filter 投影，`sortTasksByDueDate` 排序。
- AI 補充契約：需新增 `effectiveVisibility()` gate，排除 archived task、archived ancestor、已刪看板、無權看板與 orphan task。

目前授權邊界:
- Authorized: 使用者最新 `執行開發` 指令授權 DEV-039 Phase 2 前端 / local-test / Firestore / 既有 Supabase service adapter slice；PM 文件、SPEC / QA / QC / dev_task / documentation_map 更新。
- Not Authorized: Supabase RPC/RLS/migration、production deploy、正式資料修復、正式資料刪除、未歸位任務跨裝置同步、可見 partial/error summary UI。

RD Implementation 摘要:
- 新增 `src/features/taskWorkbench/source.ts`，提供 `listWorkbenchTasks()` 與 `mergeUnplacedTasks()`。
- 新增通用 `nodeService.listByProject()`，接到 local-test、Firestore 與既有 `supabaseNodeService.listByProject()`。
- `TaskWorkbenchPanel` 會以所有 `boardOptions` 載入跨看板 task source，不再只依賴 active board sync side effect。
- `useWbsStore.setNodes()` 新增 `scopeBoardIds` / `preserveOutOfScope`，避免 active board snapshot 覆蓋 cross-board source；同時允許成功載入的 board 清掉 stale nodes。
- `projectTaskFilterResults()` 新增 `isTaskEffectivelyVisible()` gate，排除 archived task 與 archived ancestor descendant。
- `isTaskEffectivelyVisible()` 補強缺父節點 orphan gate；合法 `root` / board root parent 仍視為根，其他 missing parent 不得進入投影。
- `localTestService.sanitizeNodes()` 不再把 missing-parent / cycle node 自動 re-root 成可見 `group`；改為封存，避免本機測試模式把已刪父層的子節點復活。
- `所有任務排序` 新增 `列表 / 群組` 顯示偏好，預設關閉時只列 task-like 節點；使用者可在過濾器 popover 內開啟容器顯示。
- `未歸位` 與 `所有任務排序` 清單列改為密集文字列；不再顯示獨立拖曳把手或大卡片外框，保留點選詳情與整列拖移。
- `所有任務排序` 每列計算 parent chain depth，透過縮排與較輕字重呈現 L1/L2/L3+ 差異；排序仍維持到期日優先，不改成樹狀分組。
- `未歸位` 與 `所有任務排序` 標題改為 sticky header band，和任務列視覺分離；未歸位區塊有最大高度與自身捲動，避免大量未歸位任務擠掉下方排序區。
- 工作台 collapsed rail 從 `w-12` 改為 `w-6`，開啟符號改用 `ChevronRight`，展開狀態的收合按鈕改用 `ChevronLeft`，並保留可點擊開啟與小型任務數 badge。
- `所有任務排序` 使用 effective visible placed tasks + localStorage 未歸位任務合併後依到期日排序；filter popover selected board 不改來源範圍。

Acceptance:
- Active board 為 A 時，`所有任務排序` 同時顯示 A/B 等所有可見 board 中符合各自 filter 的任務。
- 切換 active board 後，cross-board result 不收縮成新 active board。
- Filter popover 切換 selected board 只影響該 board filter state，不影響來源範圍。
- 刪除單一任務後，該 task id 立即從看板與 `所有任務排序` 消失，reload 後不得復活。
- 刪除父層/list/card 後，descendant 不得因本身未 archived 而殘留在 `所有任務排序`。
- `所有任務排序` 預設不得列出列表/群組容器；使用者開啟 `列表 / 群組` 後才可顯示有效可見容器。
- 缺父節點 orphan task 不得因扁平投影被當成有效任務，即使開啟容器顯示也不得出現。
- `未歸位` 與 `所有任務排序` 標題需保持 sticky；在各自區塊捲動後仍可見，且不得被任務列混淆成一般 task row。
- 工作台 collapsed rail 寬度不得回到 48px，大圖示/Notebook/PanelLeftClose button 不得回流；精簡 chevron pair 與 badge 不得造成水平 overflow。
- 復原任務或父層後，符合權限與 filter 的任務可重新出現且不重複。
- 無權 board/task 不得出現在 source、store、UI、console debug 或 verifier expected output。

QA / QC gate:
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source`
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser`
- `npm.cmd run verify:dev-039-filter-result-parity`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`
- `npm.cmd run verify:dev-039-task-filter-core`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`
- 若導入 Supabase RPC/RLS/migration：加跑 `npm.cmd run verify:supabase:static`，並補 owner/admin/member/viewer/anon DB role matrix evidence。

Stop conditions:
- Query 只能列 active board、assigned-to-me、local cached tasks 或部分看板，卻宣稱全部可見任務。
- 無法證明 membership/RLS 不外洩無權 board/task。
- 需要新增或修改 Supabase migration/RLS/RPC、production deploy、正式資料修復或資料刪除，但尚未取得明確授權。
- active board snapshot / `setNodes(activeBoardNodes)` 仍覆蓋 cross-board workbench source。
- 刪除父層後 descendants 仍可在 `所有任務排序` 出現，或 undo/redo 造成重複。
- partial failure 被靜默吞掉，UI 仍宣稱清單完整。

QC evidence（2026-07-04）:
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source`，23/23 passed。
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` passed，fixture 覆蓋 active board A/B 切換、A/B 任務同時出現在 `所有任務排序`、到期日跨看板排序、archived task / archived ancestor descendant 排除、`group/list` 容器預設不顯示與手動切換顯示、missing-parent orphan 排除、刪除後 reload 不復活、hierarchy indentation 與 sticky section headers。
- `npm.cmd run verify:dev-039-filter-result-parity`，26/26 passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`，22/22 passed。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build:test` passed。

交付文件:
- `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
- `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md`
- `ai-doc/documentation_map.md`

Next condition:
- 若需要可見 partial/error summary UI，另行授權 Phase 2 follow-up slice。
- 若需要 remote migration、RLS、RPC、production deploy、正式資料修復或資料刪除，停止並要求明確授權。
- 正式環境發布仍需使用者明確 deployment authorization 與 `deployment-release-gate`。

## PM Update - 2026-07-03

### DEV-040: 正式環境同型 BUG 風險硬化與驗證

狀態: Production Release Deployed / Production Authenticated UI Smoke Passed for Original BUG Flows / Extended 7-Point Matrix Partially Covered
節點類型: 交付點
優先級: P0 production freeze/data-loss risk, P1 context race/stale response, P2 external timeout/local-only semantics
父交付點: 無；關聯 DEV-011 / DEV-020 / DEV-027 / DEV-037 / DEV-039
是否計入產品交付完成: 是
建立日期: 2026-07-03

原始需求邊界:
- 使用者回報正式環境 BUG：新增會議記錄 > 匯入 > 整理專案變化，正式環境卡住不動。
- 使用者回報正式環境 BUG：全域任務平台新增未歸位任務，切換不同看板後任務消失。
- 使用者要求依原因分析推導其他可能 BUG，並由 QA 針對 7 點制定驗證計畫。
- 使用者要求由 Dev PM 寫成開發文件；後續已完成本機 hotfix / verifier 修正與 local automated QC。

交付文件:
- `ai-doc/specs/SPEC-040-production-environment-risk-hardening.md`
- `ai-doc/qa/QA-DEV-040-production-environment-risk-validation.md`
- `ai-doc/qc/QC-DEV-040-production-environment-risk-validation.md`

Human Decision Brief:
- 已確認：本 DEV 以正式環境同型風險為交付點，範圍包含 7 個風險點。
- 已確認：本輪 local/source/browser automated QC 已通過；使用者已授權正式環境驗證，production deploy 與正式站 authenticated UI smoke 已完成。
- 已確認：兩個原始正式 BUG flow 已在正式站通過 smoke；7 點延伸矩陣仍有 member/tag stale、Google Calendar REST timeout、MindMap 跨裝置語意等待專項驗證。
- AI assumption：正式環境問題主要來自 bounded failure 缺口、source-of-truth 缺口、stale-response 缺口與 localStorage-only 語意缺口。
- Re-entry：production deploy、遠端 migration、資料修復 / 刪除、心智圖雲端同步語意、付費 / 第三方成本改變需使用者重新授權。

Phase Roadmap:
- Phase 0: PM / QA Documentation，建立 SPEC-040、QA-DEV-040、dev_task 與 documentation map 索引；本輪完成。
- Phase 1: P0 Bounded Failure + Persistence，處理備份匯入 dependencies 持久化、RAG / knowledge retrieval timeout / fallback；RD Contract Ready / Not Authorized。
- Phase 2: P1 Context Race / Stale Response，處理新增看板 temp id race、member stale response、tag stale response；RD Contract Ready / Not Authorized。
- Phase 3: P2 External Service Timeout + Local-only Semantics，處理 Google Calendar timeout 與 MindMap localStorage-only 語意；RD Contract Ready / Not Authorized，MindMap 雲端同步為 Blocked Human Re-entry。
- Phase 4: Production Release / Smoke Gate，部署與正式環境 smoke；Done for original 2 BUG flows，必須保留 deployment-release-gate evidence。

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 PM / QA Documentation | Authorized | Done | SPEC-040、QA-DEV-040、PM 索引 | 程式修改、deploy、migration、資料修復 | 使用者要求寫成開發文件 | 文件與索引完成 | 文件 diff |
| Phase 1 P0 Bounded Failure + Persistence | Not Authorized | RD Contract Ready / Not Authorized | dependencies import persistence、RAG timeout/fallback | schema/RLS/migration、deploy、模型更換 | 使用者授權 RD | 無資料遺失、無無限 loading | verifier、DB count、UI/Network evidence |
| Phase 2 P1 Context Race / Stale Response | Not Authorized | RD Contract Ready / Not Authorized | addBoard temp id、member stale guard、tag stale guard | core data model、RLS、deploy | 使用者授權 RD | 快速切換後只顯示當前 context | rapid-switch evidence、localStorage / DB evidence |
| Phase 3 P2 External / Local-only Semantics | Not Authorized | RD Contract Ready / Not Authorized; MindMap cloud sync Blocked Human Re-entry | Google Calendar timeout、MindMap local-only guardrail | ICS feed、notification、cloud sync without decision | 使用者授權；MindMap 語意需決策 | 外部 API 失敗可見結束；local-only 不破壞主資料 | timeout evidence、localStorage clear evidence |
| Phase 4 Production Release / Smoke | Authorized | Production Release Deployed / Original BUG Smoke Passed / Extended Matrix Partially Covered | deploy、formal smoke、rollback readiness | 正式資料修復、完整備份匯入 DB count、member/tag delayed response、Google Calendar REST timeout、MindMap cloud semantics | RD/QC passed + 使用者正式環境驗證授權 | 原始 2 BUG 正式站 smoke 通過；延伸 7 點剩餘項明列 | deployment-release-gate evidence、production authenticated UI smoke |

Deferred Scope Audit:
- Same Spec Phase: production deploy / smoke 由 Phase 4 管控，需使用者授權與 deployment-release-gate。
- Blocked Human Re-entry: remote schema/RLS/migration、正式資料修復 / 補匯入 / 刪資料。
- Blocked Human Re-entry: MindMap localStorage-only 資料若要升級為跨裝置專案資料，需使用者先確認產品語意。
- New DEV: Google Calendar subscription ICS source scope 續接 DEV-037；DEV-004 全人待辦平台 / formal Inbox cloud sync 續接既有 umbrella。
- No Tracking: DEV-039 工作台 filter / placement lanes 本體重構已由 DEV-039 管控，本 DEV 不重複。

Next condition:
- 若使用者要求繼續關閉 7 點延伸矩陣，針對 member/tag stale、Google Calendar REST timeout、MindMap 跨裝置語意另開專項驗證或 DEV。
- 若任一後續修正需要遠端 migration、資料修復或再次 deploy，停止並取得明確授權。
- 僅可回報「原始 2 個正式 BUG flow 已通過 production smoke」；不得宣稱 7 點延伸矩陣全部關閉。

Stop conditions:
- 需要 production deploy、remote migration、正式資料修復或資料刪除。
- RAG / timeout fallback 會產生偽引用、錯誤資料或額外第三方成本。
- stale-response 修正需要放寬權限或修改 RLS。
- 心智圖 local-only 資料語意需改為專案資料但未取得使用者確認。

Evidence required:
- targeted verifier、TypeScript、build、production-like Supabase manual smoke。
- 每個風險點至少保留操作前 / 後 / reload 截圖、Console / Network evidence、DB count 或 localStorage evidence。

Local QC evidence - 2026-07-03:
- `npm run verify:source` 通過。
- `npm run verify:dev-020-project-change-import-browser` 通過。
- `npm run verify:dev-039-task-workbench-placement-lanes-browser` 通過。
- `npm run verify:dev-027g-mindmap-system-health-browser` 通過。
- `npm run verify:dev-028-cross-mode-task-interactions-browser` 通過。
- 詳細證據記錄於 `ai-doc/qc/QC-DEV-040-production-environment-risk-validation.md`。

Production release / smoke evidence - 2026-07-03:
- Release commit：`42aa451d5ddaa4190bbd3216b60626d7195f67bd`。
- Branch：`codex/正式環境BUG修正` pushed to `origin/codex/正式環境BUG修正`。
- Firebase Hosting：`npx firebase deploy --only hosting --project projed-cc78d --non-interactive` 通過，URL `https://projed-cc78d.web.app`。
- Artifact：正式 `index.html` 載入 `index-CZrWLuKx.js` / `index-CwzdflxX.css`，舊 `index-BCr1zfI2.js` 不存在。
- `npm run verify:dev-040-production-auth-ui-smoke` 通過：正式站臨時 Supabase user/tenant/2 boards/activity event，專案變化整理產生 1 筆預覽，未歸位任務切換看板後仍存在，cleanup 刪除臨時 tenant/user。

## PM Update - 2026-07-02

### DEV-039: 任務過濾器核心與全域任務平台兩欄篩選重構

狀態: Phase 1/1A Local Automated QC Passed / Phase 1B Implemented + Local Automated QC Passed / Phase 1C Implemented + Local Automated QC Passed / Phase 2 Cross-Board Source Slice Implemented + Local Automated QC Passed / Production Release Not Deployed + Requires Explicit Authorization / All-Phase Coverage Complete
節點類型: 交付點
優先級: P0 workbench placement drag parity, P1 task focus consistency, P1 workbench UX clarity
父交付點: 無；與 DEV-027D / DEV-028 / DEV-036 關聯
關聯開發點: DEV-027D 心智圖日期顯示與既有過濾器串接、DEV-028 四模式任務操作契約、DEV-037 行事曆訂閱來源範圍清晰化
是否計入產品交付完成: 是
建立日期: 2026-07-02

關聯需求:
- 使用者要求盤點 ProJED 目前多處過濾器，並確認全域任務平台截圖中的 `篩選器 / 調整篩選` 是否與既有 `過濾器` 共用。
- 已確認既有看板任務視圖使用 `StatusFilterBar` / `projed-filters`，全域任務平台 build 產物使用獨立 `projed-task-zone-source-panel` state，兩者目前沒有共用同一套 state。
- 使用者要求用第一性原理分析核心需求，評估是否共用同一個模組；結論為共用 filter core，但不共用單一全域 UI state。
- 使用者修正全域任務平台語意：全域任務平台本身就是跨工作區、跨看板，因此新版篩選不需要 `目前工作區` 或 `目前看板` 來源範圍；任務狀態也不需要分 `待歸位 / 已歸位`，預設就是全部。
- 使用者要求全域任務平台篩選必須能依看板有不同設定，且不需要跳到別的看板。
- 使用者修正產品定位：全域任務平台原本是看板左側的跨看板拖拉中繼站，不得改成獨立整頁；本 DEV 必須恢復 BoardView 左側 panel。
- 使用者最新決策：全域任務平台不要有設定檔、儲存、另存、複製、全域 profile 或看板專屬 profile；主畫面中跟過濾器有關的功能只保留一顆 `過濾器` 按鈕，點開後在 popover 內先選看板，再調同看板過濾器，讓使用者看板一個一個設定。
- 使用者再次修正：第一欄看板 / 過濾器是每個看板獨立設定；第二欄任務清單是跨看板全部顯示。過濾器需做成像看板過濾器一樣的按鈕，點開 overlay，以區分兩者架構不同。
- 使用者要求把之前的 `未歸類任務` 新增及顯示介面加回來，且明確定義它不需要、也不屬於過濾器。
- 使用者再次修正：任務必須可藉由拖移功能在 `未歸位` 與 `已歸位看板` 間移動；`未歸類任務 / 未歸位任務` 的功能與已歸位任務一模一樣，僅位置不同。
- 使用者要求原先正式環境發布相關開發文件與 gate 順序排在此功能補回之後。
- 使用者指出全域任務平台篩選器與看板內篩選器使用相同條件卻得到不同結果，要求先分析差異、判斷正確邏輯，再依此制定開發文件；本輪不改產品程式碼。
- 使用者隨後授權依 DEV-039 開發文件執行 Phase 1C Filter Result Parity；本輪已完成本機 RD 與 QC，不包含 production deployment。

HCS / 最新決策:
- 原 `1A`: 新增獨立開發點 DEV-039，仍保留。
- 原 `2A`、`3A` 的全域任務平台 profile/storage 方向已被使用者最新決策取代。
- 新方向：共用 filter core；全域任務平台主畫面只提供一顆過濾器按鈕，popover 內提供看板與同看板過濾器；不得提供 profile/save/copy 類功能。
- 最新修正：`未歸位 / 已歸位看板` 是 placement lanes，不是篩選器或任務狀態；未歸位任務與已歸位任務必須同功能，且可雙向拖移。
- Phase 1C 決策：canonical truth 是同看板同條件下的 `matchedTaskIds`；看板可顯示祖先欄位 / 卡片作為 context-only container，但全域任務平台只列真正符合條件的任務 identity。

授權邊界:
- Phase 0 PM / Architecture Alignment 已完成。
- Phase 1 Shared Filter Core + Two-Column Workbench Filter 已授權可進 RD。
- Phase 1B Workbench Placement Lanes Restore 已實作並通過本機自動化 QC。
- Phase 1C Filter Result Parity 已實作並通過本機自動化 QC。
- Phase 2 Workbench Data Source Truth + Cross-Board Query Contract 已完成 cross-board source / deletion effective visibility slice；`listWorkbenchTasks()`、`mergeUnplacedTasks()`、`effectiveVisibility()` 與 scoped `setNodes()` 已實作並通過本機 QC。Partial/error summary UI、Supabase RPC/RLS/migration、production deploy 與正式資料修復仍未授權。
- Phase 3 Filter Section Componentization 只到 Deferred / Not Authorized；不得新增儲存功能。
- Phase 4 Legacy Profile Cleanup Guardrails 只到 Deferred / Not Authorized；不得重啟 profile governance。
- 正式環境發布 / production deploy 仍需使用者明確 deployment authorization 並另走 `deployment-release-gate`。
- 未經額外授權，不得執行 production deploy、遠端 migration、資料修復、資料刪除或任何 profile 後端同步。

Phase Roadmap:
- Phase 0: PM / Architecture Alignment，建立 all-phase SPEC / QA / 控制板索引。本輪完成。
- Phase 1: Shared Filter Core + One-Button Workbench Filter，建立 `src/features/taskFilters`、修正五個任務視圖一致性、重建 Task Workbench source 並嵌回 BoardView 左側、工作台主畫面只保留一顆過濾器按鈕，popover 內設定看板與同看板過濾器。
- Phase 1A: Workbench Unclassified Inbox Restore，歷史中間狀態；加回未歸類任務新增與顯示，沿用 existing local-first `InboxItem` / quick capture store，不接入過濾器。
- Phase 1B: Workbench Placement Lanes Restore，補回 `未歸位` / `已歸位看板` 兩個位置區、雙向拖移、未歸位任務與已歸位任務功能等價；已通過本機自動化 QC。
- Phase 1C: Filter Result Parity，對齊看板階層式篩選與全域任務平台扁平篩選；同看板同條件下 `matchedTaskIds` 一致，父層容器只作 context；已通過本機自動化 QC。
- Phase 2: Workbench Data Source Truth + Cross-Board Query Contract，已完成前端 service adapter 版 cross-board source、scoped store merge、`effectiveVisibility()`、刪除/archived ancestor 不殘留與 local-test browser QC；partial/error summary UI、RPC/RLS/migration 與 DB role matrix 仍為未授權 follow-up。
- Phase 3: Filter Section Componentization，將重複 UI section 元件化；不新增儲存、profile 或同步。
- Phase 4: Legacy Profile Cleanup Guardrails，清理 profile 遺留文件/測試/keys 與防回流 gate；不做 profile governance。

核心問題:
- 任務過濾條件目前分散在 `StatusFilterBar`、`useBoardStore`、`useTagStore`、各任務視圖 predicate 與全域任務平台獨立 state。
- `showDependencies`、`showStartDate`、`showTags` 是顯示設定，不是真正過濾條件，卻被放在過濾器 panel 並影響 active 狀態。
- 清單/看板/甘特/日曆/心智圖對標籤與入口的套用不一致。
- 全域任務平台曾缺少可維護 source，只能在 `dist/assets/TaskZoneView-*.js` 看見；RD 不得只修改 build 產物。
- 全域任務平台需要 board-contextual filter state，但不得用 profile 歸屬、儲存或複製處理。
- 看板目前是階層式投影，父層不符合 filter 時可能藏掉符合條件的子任務；全域任務平台目前是扁平投影，因此同條件會得到不同 visible results。
- 看板與全域任務平台的負責人 filter option source 目前不同，可能造成使用者以為條件相同但實際 assignee id / option scope 不同。

交付文件:
- `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
- `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md`
- `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md`

Phase 1 RD 執行範圍:
- 建立 `src/features/taskFilters` 共用核心，包含型別、預設值、predicate、summary 描述與 storage adapter。
- 將 `StatusFilterBar` 或替代元件改接共用核心，並把顯示設定從過濾條件中拆出。
- 統一 `list`、`board`、`gantt`、`calendar`、`mindmap` 的 filter predicate，補齊甘特/日曆標籤篩選與心智圖可操作入口。
- 恢復或重建全域任務平台 source，不能只修改 `dist/assets/TaskZoneView-*.js`。
- 實作全域任務平台單一過濾器入口：主畫面只顯示 `過濾器` 按鈕；popover 內提供看板 selector + 同看板過濾器；過濾器使用 shared task filter core。
- Phase 1A 加回未歸類任務新增與顯示區塊，資料來源為 `captureStatus=untriaged` 且尚未轉正式任務的 `InboxItem`；Phase 1B 已升級成與已歸位任務等價的 task card contract。
- 移除全域任務平台 profile/storage 型別、API 與 UI。
- 補 static verifier、browser verifier 與 package scripts。

Phase 1 交付邊界:
- 不做 Supabase schema、RLS、migration 或跨裝置同步。
- 不做全域任務平台設定檔、儲存、另存、複製、全域 profile 或看板專屬 profile。
- 不把行事曆訂閱 filter 併入任務過濾器；行事曆訂閱續接 DEV-037。
- 不重做紀錄匯入、紀錄列表、TagPicker 內部搜尋。
- 不做完整 DEV-004 全人待辦平台、正式 InboxItem 轉 TaskNode 流程或通知系統。
- 不改 Workspace / Board 核心資料模型。
- 不做 production deployment；production release 已具備 Phase 1C 本機前置 QC，但仍需明確部署授權。

Phase 1 RD acceptance:
- `src/features/taskFilters` 提供共用型別、預設值、predicate、summary 描述與 storage adapter。
- 看板任務視圖的 active filter count 只計算真正過濾條件，不計算開始日期、標籤顯示、依賴線顯示。
- `list`、`board`、`gantt`、`calendar`、`mindmap` 對狀態、到期日、負責人、標籤的套用結果一致。
- 心智圖若讀取既有 filter state，使用者必須能在該模式操作同一組任務視圖過濾器。
- 全域任務平台 filter source summary 不再提供 `目前工作區`、`目前看板` 來源範圍選項。
- 全域任務平台主畫面只保留一顆過濾器按鈕；看板 selector 移入過濾器 popover。
- 選擇看板 A 或看板 B 時，只切換正在編輯的看板 filter state；已歸位任務清單仍跨看板顯示目前已載入任務。
- 過濾器只作用於目前選擇看板的當次 UI state，並影響該看板任務在跨看板清單中的顯示；不提供保存、profile、另存或複製。
- 未歸類任務不受看板 selector 或過濾器影響；新增後立即顯示，reload 後仍可見。
- Phase 1 全域任務平台顯示目前已載入任務集合，不以 `待歸位 / 已歸位` 作為 filter 或預設排除條件，且 UI 不宣稱已取得全部可見任務。
- Phase 1B 已以 placement lane 形式補回 `未歸位 / 已歸位看板`，不得回流成 filter。
- 全域任務平台不是獨立整頁 route；桌面嵌在 BoardView 左側，手機預設 rail，點開後 overlay 操作。
- 390px mobile viewport 下，工作台不擠出看板卡片；過濾器 panel 與兩欄 controls 不重疊、不裁切主要 CTA、不出現水平 overflow。

Phase 1 RD exit gate:
- `npm.cmd run verify:dev-039-task-filter-core`
- `npm.cmd run verify:dev-039-task-filter-core-browser`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`
- `npm.cmd run verify:dev-034-pwa-install-guidance`
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

Phase 1B RD 執行範圍:
- 在 BoardView 左側全域任務平台補回兩個 placement lanes：`未歸位` 與 `已歸位看板`。
- `未歸位 / 已歸位看板` 只能是位置區，不得是 filter panel 條件、來源範圍選項或預設排除條件。
- 未歸位任務與已歸位任務共用同一套 task card interaction contract：點擊開詳情、拖拉、狀態/日期/負責人/標籤顯示、既有任務操作入口與可辨識 task identity。
- 新增未歸位任務後，立即以完整任務卡出現在未歸位 lane。
- 拖移 `未歸位 -> 已歸位看板` 時，任務被放入目前選擇看板，保留內容與 identity，且未歸位 lane 不留重複。
- 拖移 `已歸位看板 -> 未歸位` 時，任務從該看板 lane 移除，保留內容與 identity，且未歸位 lane 顯示同功能卡片。
- 若 existing `InboxItem` / quick capture store 無法支援完整 task card 功能，RD 必須建立正規化或 promote contract；若需 schema/RLS/migration，停止並回報需額外授權，不得交付簡化版。

Phase 1B 交付邊界:
- 不新增設定檔、儲存、另存、複製、全域 profile 或看板專屬 profile。
- 不把未歸位 / 已歸位加回過濾器。
- 不改成獨立整頁工作台。
- 不執行 production deployment；正式發布仍需另取得明確部署授權。
- 不做資料刪除、遠端 migration 或 Supabase schema/RLS 變更，除非使用者另外明確授權。

Phase 1B RD acceptance:
- 工作台第一眼可分辨 `未歸位` 與 `已歸位看板` 兩個位置區。
- 工作台篩選控制仍只有一個主入口：`過濾器` 按鈕；看板 selector 在 popover 內。
- 未歸位任務卡與已歸位任務卡功能等價，差別只在 lane 位置。
- 任務可雙向拖移於未歸位與已歸位看板間。
- 拖移後 title、status、date、assignee、tags、notes 或詳情資訊不遺失。
- 拖移後同一任務不得同時留在兩個 lane。
- 看板 selector / 過濾器只影響已歸位看板 lane，不隱藏或改動未歸位 lane。
- 390px mobile viewport 下，兩個 lane 不擠出看板卡片、不裁切主要 CTA、不出現水平 overflow。

Phase 1B RD exit gate:
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser`
- `npm.cmd run verify:dev-039-task-filter-core`
- `npm.cmd run verify:dev-039-task-filter-core-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

Phase 1B QC evidence（2026-07-02）:
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`，19/19 passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` passed。
- `npm.cmd run verify:dev-039-task-filter-core`，57/57 passed。
- `npm.cmd run verify:dev-039-task-filter-core-browser` passed。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`，35/35 passed。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser` passed。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build` passed。

Conditional gate:
- 若 RD 同步觸及 DEV-037 行事曆訂閱程式碼，需加跑 `npm.cmd run verify:dev-037-calendar-subscription-source-scope`；若未觸及，QC 可標示為 not touched，不阻塞 DEV-039。

Phase 1C RD Contract summary:
- Scope: 建立 filter result projection helper，輸出 `matchedTaskIds`、`visibleContainerIds`、`contextOnlyContainerIds`；看板階層 renderer 使用 projection 保留符合子任務的 ancestor context；全域任務平台已歸位看板 lane 使用同一 `matchedTaskIds`，只列真正符合條件的任務；對齊 selected board 的負責人 option source。
- Out of scope: 不新增 profile/storage/sync、DB schema、RLS、migration、Supabase RPC、production deploy；不做 Phase 2 全部可見任務資料來源；不改任務 hierarchy data model。
- Gate: `npm.cmd run verify:dev-039-filter-result-parity`, `npm.cmd run verify:dev-039-filter-result-parity-browser`, Phase 1/1B regression, TypeScript, build。
- Acceptance: 同看板同條件下看板與全域任務平台 `matchedTaskIds` 完全一致；看板可顯示 context-only ancestors，但工作台不得把 ancestors 列為符合結果；父層不符合時符合子任務仍可見。
- Stop: 若現有資料無法區分 matched task / context-only ancestor / hidden sibling，或需要 schema/RLS/migration 才能達成，停止並回報；不得自行擴 scope。

Phase 1C QC evidence（2026-07-02）:
- `npm.cmd run verify:dev-039-filter-result-parity`，25/25 passed。
- `npm.cmd run verify:dev-039-filter-result-parity-browser` passed。
- `npm.cmd run verify:dev-039-task-filter-core`，60/60 passed。
- `npm.cmd run verify:dev-039-task-filter-core-browser` passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`，19/19 passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` passed。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`，35/35 passed。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser` passed。
- `npm.cmd exec tsc -- --noEmit` passed。
- `npm.cmd run build` passed。

Phase 2 implementation slice summary:
- Scope done: 建立 workbench cross-board task source adapter、`listWorkbenchTasks()`、`mergeUnplacedTasks()`、`isTaskEffectivelyVisible()`、backend-neutral `nodeService.listByProject()`、scoped `setNodes()` ownership boundary、active board sync preserve-out-of-scope、local-test browser fixture。
- Acceptance done: active board A/B 切換時 `所有任務排序` 仍顯示 A/B 可見任務；刪除 task 或 archived ancestor 後不在排序清單殘留；popover selected board 只改 filter state，不改 source scope。
- Gate passed: `npm.cmd run verify:dev-039-task-workbench-cross-board-source`, `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser`, `npm.cmd run verify:dev-039-filter-result-parity`, `npm.cmd run verify:dev-039-task-workbench-placement-lanes`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run build:test`。
- Remaining authorization: visible partial/error summary UI、Supabase RPC/RLS/migration、DB role matrix、production deploy、正式資料修復 / 刪除。

Phase 3 RD Contract summary:
- Scope: filter UI section componentization，減少工作台與看板 filter UI 重複。
- Gate: static/browser regression、TypeScript、build。
- Stop: 元件化若造成 filter 結果、summary 或 active count 行為漂移，停止。

Phase 4 RD Contract summary:
- Scope: profile 遺留清理與防回流 gate。
- Gate: static guard、docs audit。
- Stop: 任何 profile/save/copy UI、type、storage key 回到 DEV-039，停止。

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 PM / Architecture Alignment | Done | Done | 盤點既有 filter、確認方案 B、建立全期 SPEC/QA/PM 索引 | 不進產品程式實作 | HCS decisions `1A 2A 3A` completed | 文件與授權邊界清楚 | SPEC-039、QA-DEV-039、dev_task、documentation_map、backlog |
| Phase 1 Shared Filter Core + Two-Column Workbench Filter | Authorized | Local Automated QC Passed | shared task filter core、五視圖一致性、顯示設定分離、Workbench 兩欄看板/過濾器 | profile/storage/copy/sync、calendar subscription、production deploy | Phase 0 done；RD 確認不只改 `dist` | Phase 1 RD acceptance 全通 | DEV-039 static/browser verifier、DEV-027D/DEV-028 regression、TypeScript、build、screenshots、QC-DEV-039 |
| Phase 1B Workbench Placement Lanes Restore | Authorized | Implemented / Local Automated QC Passed | `未歸位` / `已歸位看板` placement lanes、雙向拖移、未歸位任務與已歸位任務功能等價 | profile/storage/copy/sync、production deploy、DB migration unless separately authorized | Phase 1/1A local QC passed + 使用者最新授權 | 任務可雙向移動且資料不重複/不遺失；未歸位與已歸位卡片同功能 | placement lane static/browser verifier、DEV-028 regression、TypeScript、build、Phase 1B QC |
| Phase 1C Filter Result Parity | Authorized | Implemented / Local Automated QC Passed | filter result projection、matchedTaskIds 一致、context-only ancestors、負責人 option source 對齊 | profile/storage/sync、schema/RLS/migration、Phase 2 全部可見任務資料來源、production deploy | 使用者授權執行 Phase 1C RD | 同看板同條件下看板與工作台 `matchedTaskIds` 一致 | parity static/browser verifier、Phase 1/1B regression、TypeScript、build |
| Production Release Gate | Blocked Pending Human Authorization | Must Follow Phase 1C QC | 正式環境發布、production smoke、deployment evidence | 未授權部署或跳過 deployment-release-gate | Phase 1C QC passed + 使用者明確 deployment authorization | deployment-release-gate passed | deployment-release-gate evidence、production smoke |
| Phase 2 Workbench Data Source Truth + Cross-Board Query Contract | Frontend/local slice Authorized | Cross-Board Source Slice Implemented / Local Automated QC Passed | `listWorkbenchTasks()`、`mergeUnplacedTasks()`、`effectiveVisibility()`、backend-neutral task list adapter、scoped store merge、刪除後不殘留 | Profile sync、shared defaults、未歸位跨裝置同步、visible partial/error summary UI、production migration/deploy/data repair、RPC/RLS | 使用者授權 Phase 2 RD；不含 remote/DB/deploy | active board A/B 仍顯示所有可見 board 任務；刪除/archived ancestor 後不殘留；selected board 不改 source scope | cross-board static/browser verifier、parity/placement regression、TypeScript、build:test |
| Phase 3 Filter Section Componentization | Not Authorized | Deferred / Not Authorized | 重複 filter UI section 元件化 | 儲存功能、profile governance | Phase 1 UI 穩定且 RD 判定有維護成本 | 行為不變、重複降低 | Regression verifier、TypeScript、build |
| Phase 4 Legacy Profile Cleanup Guardrails | Not Authorized | Deferred / Not Authorized | profile 遺留文件/測試/keys 清理、防回流 gate | profile sync/governance | Phase 1/2 穩定後 | 舊 profile 概念不再回流 DEV-039 | static guard、docs audit |

Deferred Scope Audit:
- Same Spec Phase: Phase 1B 承接未歸位 / 已歸位看板 placement lanes、雙向拖移與任務卡功能等價；已實作並通過本機自動化 QC。
- Same Spec Phase: Phase 1C 承接看板階層式篩選與全域任務平台扁平篩選結果一致性；已實作並通過本機自動化 QC。
- Same Spec Phase: Phase 2 已完成前端 / local-test / existing-service adapter 的全部可見任務來源 slice、cross-board query、`effectiveVisibility()` 與刪除後不殘留；RLS role matrix、visible partial/error summary UI、remote migration/RPC 仍需另行授權。
- Same Spec Phase: Phase 3 承接 filter UI section componentization；不新增儲存功能。
- Same Spec Phase: Phase 4 承接 profile 遺留清理與防回流 gate。
- New DEV: 行事曆訂閱 source/filter contract 續接 DEV-037；DEV-004 InboxItem/CaptureItem/通知平台需另行啟動。
- No Tracking: 紀錄匯入、紀錄列表與 TagPicker 內部搜尋不是 DEV-039 任務列表過濾器，不納入本 DEV。
- Cancelled for DEV-039: profile/storage/copy/sync/governance 已被使用者最新決策取消；未來若要重啟需新增 DEV 並重新決策。
- Blocked Human Re-entry: production deploy、remote migration、資料修復/刪除、AI profile recommendation、cross-tenant marketplace 均需使用者重新授權；其中 production deploy 必須排在 Phase 1C QC passed 之後。

Next condition:
- Phase 1 已完成本機自動化 QC。
- Phase 1B 已完成本機自動化 QC；不得宣稱已部署 production。
- Phase 1C 已完成本機自動化 QC；不得宣稱已部署 production。
- Phase 2 cross-board source slice 已完成本機自動化 QC；不得宣稱已部署 production 或 DB/RLS/RPC 已完成。
- Single-Command Mode 若要 production release，仍必須取得使用者明確部署授權並走 `deployment-release-gate`。
- Phase 2 visible partial/error summary、DB/RLS/RPC 與 production deploy 仍需另行授權。
- Production release 已具備 Phase 1C 前置 QC；仍必須取得使用者明確 deployment authorization。
- Phase 2 follow-up 需 Phase 2 slice QC passed 且使用者或 PM 明確授權。
- Phase 3 僅限 filter UI section componentization，不得新增儲存、profile 或同步。
- Phase 4 僅限 legacy cleanup / guardrails，不得重啟 profile governance。

Stop conditions:
- 如果 `src` 內仍找不到可維護的全域任務平台 source，停止，不得只改 `dist` build 產物。
- 如果全域任務平台資料來源實際只能取得 `指派給我` 或已載入本機任務，UI 不得宣稱為全部任務；必須改成清楚的資料來源 summary 或另開資料層 DEV。
- 如果各視圖只是複製貼上條件判斷，沒有收斂到共用 predicate，停止，不得宣告完成。
- 如果新版全域任務平台新增設定檔、儲存、另存、複製、全域或看板專屬 profile，停止。
- 如果 `目前工作區`、`目前看板` 被保留為全域任務平台來源範圍選項，停止。
- 如果 `待歸位 / 已歸位` 被保留為任務狀態 filter 或預設排除條件，停止。
- 如果 `未歸位 / 已歸位看板` 沒有以 placement lanes 補回，停止。
- 如果未歸位任務卡功能少於已歸位任務卡，停止。
- 如果任務無法在未歸位與已歸位看板間雙向拖移，停止。
- 如果同看板同條件下看板與全域任務平台的 `matchedTaskIds` 不一致，停止。
- 如果看板因父層不符合 filter 而藏掉符合條件的子任務，停止。
- 如果全域任務平台把 context-only ancestor 列為符合結果，停止。
- 如果要新增後端同步、DB schema、RLS 或 production release，另開 DEV 並走對應 gate。
- 如果 production release 排在 Phase 1C QC passed 之前，停止。

## PM Update - 2026-06-29

### DEV-038: 設定中心作用範圍一致性與高風險防呆

狀態: RD Contract Ready / SPEC + QA Ready
節點類型: 交付點
優先級: P0 backup/import/trash risk, P1 settings IA consistency
父交付點: DEV-036 Trello-like Workspace Governance
關聯開發點: DEV-037 行事曆訂閱來源範圍清晰化
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者追問：依行事曆訂閱邏輯，設定裡其他頁面是否也有邏輯不一致。
- 已確認 `備份與資料`、`回收桶`、`權限設定`、`快速開啟` 存在不同作用範圍混用問題。
- 使用者要求由 Dev PM 寫成開發文件，不足處用 HCS `#引導模式` 補足。

HCS 引導決策（採建議預設）:
- `1A`: 保留單一設定中心，但每個頁籤明確標示 `設定範圍`；暫不拆成多個設定入口。
- `2A`: 備份頁明確分成 `匯出全域快照` 與 `匯入至目前看板`；不在本 DEV 做完整 Workspace/Board 還原。
- `3A`: 回收桶改為 `目前看板回收桶`，清空前顯示看板名稱與任務數量。
- `4A`: 行事曆訂閱續接 DEV-037，不在本 DEV 重複實作資料契約。

核心問題:
- `SettingsView` 頁首目前以 `系統設定與管理 / 目前看板` 統包所有設定，導致全域快照、看板匯入、外部連結、裝置設定混在同一語境。
- `exportData` 實際匯出全域 `nodes/dependencies/tags/workspaces` 快照；`importData` 卻要求 active workspace/board 並匯入至目前看板。
- `RecycleBinView` 實際只依 `activeBoardId` 顯示封存任務，但入口與標題未明確說是目前看板回收桶。

交付文件:
- `ai-doc/specs/SPEC-038-settings-scope-consistency-and-risk-guardrails.md`
- `ai-doc/qa/QA-DEV-038-settings-scope-consistency-and-risk-guardrails.md`

RD 執行範圍:
- 更新 `SettingsView.tsx` 頁首、頁籤文案與各 section scope summary。
- 更新 `BackupSettings`，拆分全域匯出與目前看板匯入，並在匯入前新增確認摘要。
- 更新 `RecycleBinView` 文案與清空確認，明確標示 active board 範圍。
- 更新 `BoardMembersPanel` embedded mode 的 `看板權限` 文案與 target summary。
- 更新 `AppInstallAssistant` settings mode 的 `此裝置 / 目前帳號` scope summary。
- 補 static verifier、browser verifier 與 package scripts。

交付邊界:
- 不改 `exportData` / `importData` 的資料格式。
- 不做完整全域還原、Workspace 還原或 Board 還原 wizard。
- 不新增全工作區或全系統回收桶。
- 不修改 Supabase schema、RLS、migration。
- 不取代 DEV-037 的行事曆訂閱資料契約。

RD acceptance:
- 設定中心頁首不再用 `目前看板` 框住所有頁籤。
- 每個設定 section 都能看出作用範圍。
- 備份頁清楚區分全域匯出與目前看板匯入。
- 匯入備份前有目標看板確認，不會直接選檔後立即匯入。
- 回收桶明確是目前看板回收桶，清空前顯示目標看板與永久刪除數量。
- 看板權限頁顯示目前看板目標，不再與分享邀請主流程混淆。
- 快速開啟頁顯示此裝置 / 目前帳號範圍，不受 active board 語境影響。
- 390px mobile viewport 不因 scope summary 出現文字重疊、裁切或水平 overflow。

RD exit gate:
- `npm.cmd run verify:dev-038-settings-scope-consistency`
- `npm.cmd run verify:dev-038-settings-scope-consistency-browser`
- `npm.cmd run verify:settings-project-context`
- `npm.cmd run verify:settings-project-context-browser`
- `npm.cmd run verify:dev-036-trello-like-workspace-governance`
- `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`
- `npm.cmd run verify:dev-026-trello-like-board-share-ui`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

Conditional gate:
- 若本輪同步觸及 `CalendarSubscriptionsView` 或 DEV-037 已實作，需加跑 `npm.cmd run verify:dev-037-calendar-subscription-source-scope`；若 DEV-037 尚未實作，QC 記錄為 deferred dependency，不阻塞 DEV-038 的 Settings/Backup/RecycleBin 交付。

Stop conditions:
- 如果 RD 發現匯入實際會覆寫目前看板任務但無法在 UI 前置確認，停止，不得宣告完成。
- 如果清空回收桶確認無法取得正確 active board 與刪除數量，停止，不得改成更模糊的全域文案。
- 如果要改 import/export 資料格式或新增還原 wizard，另開 DEV，不納入本 DEV。
- 如果要改 DB schema、RLS 或 production release，必須走對應 Supabase / deployment-release-gate。

### DEV-037: 行事曆訂閱來源範圍清晰化

狀態: RD Contract Ready / SPEC + QA Ready
節點類型: 交付點
優先級: P1 settings IA and data-scope clarity
父交付點: DEV-036 Trello-like Workspace Governance
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者指出設定頁「工作區」與「看板」邏輯混亂，看不出來自己在訂閱哪一個範圍。
- 需要用 HCS `#問對問題 #差距分析 #設計思考 #溝通設計` 提出優化方案，並由 Dev PM 寫成開發文件。
- DEV-036 已決定 Workspace 採 Trello-like 容器模型；行事曆訂閱必須延續該語意。

HCS 引導補齊:
- `#問對問題`：這個頁面真正要回答的是「我要把哪個任務範圍同步到外部行事曆？」
- `#差距分析`：現有 filters 只有 `workspace_ids / assignee / date_types`，不能明確表達單一 Board scope；UI 也沒有 canonical source summary。
- `#設計思考`：從 active board 進入設定時，使用者最常見期待是訂閱目前看板；進階的 workspace / custom scope 不能成為預設。
- `#溝通設計`：每筆訂閱必須拆成 `來源` 與 `條件`，訂閱名稱只作為使用者自訂標籤。

核心決策:
- 新增訂閱預設來源：有 active board 時為 `目前看板`；沒有 active board 時為目前 Workspace 的 `工作區全部看板`。
- UI 第一段改為 `訂閱範圍`，支援 `目前看板`、`工作區全部看板`、`自訂範圍` 的語意分層。
- 資料契約延伸 `CalendarSubscriptionFilters`，加入 `scope_type?: 'board' | 'workspace' | 'custom'` 與 `project_ids?: string[]`。
- 既有缺少 `scope_type` 的訂閱視為 legacy `workspace` scope，UI 顯示 `工作區全部看板`。
- Board scope 必須由 Edge Function 與 DB validation 共同保證，不可只有前端文案。

交付文件:
- `ai-doc/specs/SPEC-037-calendar-subscription-source-scope-clarity.md`
- `ai-doc/qa/QA-DEV-037-calendar-subscription-source-scope-clarity.md`

RD 執行範圍:
- 更新 `CalendarSubscriptionFilters` type、service normalizer 與 create/update payload。
- 新增或延伸 Board / Project ref 查詢，讓 UI 能顯示 Workspace / Board path。
- 更新 `public.calendar_subscription_filter_allowed(filters jsonb)`，驗證 `scope_type` / `project_ids` / project-to-workspace 關係與使用者權限。
- 更新 `supabase/functions/calendar-feed/index.ts`，feed request 每次依 membership 與 project scope 重新計算 allowed projects。
- 改造 `CalendarSubscriptionsView`：建立表單、即時預覽、訂閱列表 summary、edit flow 與 mobile layout。
- 補 static verifier、browser verifier 與 ICS feed verifier。

交付邊界:
- 不做 Google Calendar write API 或雙向同步。
- 不新增 billing、seat、quota 或 realtime subscription。
- 不重做整個 Settings IA。
- 不變更 DEV-036 Workspace / Board 核心模型。

RD acceptance:
- 使用者建立訂閱前能清楚知道來源是目前看板、工作區全部看板，或自訂範圍。
- Board scope 的 `.ics` feed 不包含其他看板任務。
- Workspace scope 的 `.ics` feed 只包含使用者仍有權讀取的看板任務。
- 既有 legacy 訂閱仍可讀取、修改、停用、重新產生連結，且 UI 顯示為 `工作區全部看板`。
- 訂閱列表每筆都有 `來源` 與 `條件`，不需要使用者從名稱猜測。
- Mobile viewport 不因來源摘要造成文字重疊、裁切或水平 overflow。

RD exit gate:
- `npm.cmd run verify:dev-037-calendar-subscription-source-scope`
- `npm.cmd run verify:dev-037-calendar-subscription-source-scope-browser`
- `npm.cmd run verify:calendar-feed-ics`
- `npm.cmd run verify:settings-project-context`
- `npm.cmd run verify:settings-project-context-browser`
- `npm.cmd run verify:dev-036-trello-like-workspace-governance`
- `npm.cmd run verify:dev-026-trello-like-board-share-ui`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

Stop conditions:
- 如果無法在 Edge Function 中可靠限制 `project_id`，停止，不得宣告 Board scope 完成。
- 如果 DB validation 無法驗證 `project_ids`，停止並先補 migration / DB QC。
- 如果 UI 只能改文案但資料仍只能表達 workspace scope，不得把選項命名為 `目前看板`。
- 如果需要部署 Edge Function 或套 migration，必須走 deployment-release-gate。

### DEV-036: Trello-like Workspace Governance

狀態: Implemented / Local Automated QC Passed / DB unchanged
節點類型: 交付點
優先級: P1 workspace governance / IA correction
父交付點: 無
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者決定 ProJED 改成與 Trello 類似的 Workspace 模型。
- 開發計畫不得再局限於固定「我的工作區」與「共用工作區」兩項。
- Workspace 應作為多張 Board 的治理容器；Board 作為具體專案與任務執行單位。

核心決策:
- 採 Trello-like Workspace 模型。
- 使用者可建立多個 Workspace。
- 不限制為「我的工作區 / 共用工作區」兩筆固定資料。
- 「我的 / 共用」若保留，只能作為輔助 filter / view，不是資料模型。
- Board sharing 不會自動搬移 Workspace。
- Board 跨 Workspace 移動仍沿用 DEV-025 受控搬移。

HCS 引導決策（2026-06-29）:
- `1A`: 新增 Workspace 入口放在 Sidebar「工作區選單」標題列右側，以 `+` icon button 呈現，tooltip / accessible label 為 `新增工作區`。
- `2A`: Workspace create 採 backend-success-first；後端成功前不得寫入前端 Workspace 清單、active workspace 或 localStorage。
- `3A`: First-run 只自動建立 `我的工作區`，但使用者後續可建立多個 Workspace；authenticated user 可建立 Workspace，建立者成為 owner。

交付文件:
- `ai-doc/decisions/ADR-036-trello-like-workspace-governance.md`
- `ai-doc/specs/SPEC-036-trello-like-workspace-governance.md`
- `ai-doc/qa/QA-DEV-036-trello-like-workspace-governance.md`
- `ai-doc/qc/QC-DEV-036-trello-like-workspace-governance.md`

End-State Architecture:
- `tenants` 保持作為 Workspace。
- `projects` 保持作為 Board。
- `tenant_members` 管 Workspace 成員與 owner/admin 繼承。
- `project_members` 管 Board 可見性與寫入權限。
- Workspace 可代表公司、部門、團隊、外部協作範圍或大型工作群。

Phase Roadmap:
- Phase 0：PM / Architecture Alignment，建立 ADR / SPEC / QA / 文件索引。本輪完成。
- Phase 1：Workspace Create / Navigation MVP，Sidebar 工作區選單標題列右側新增 `+` 入口、dialog 建立 Workspace、backend-success-first create、First-run 建立 `我的工作區`、Home/Sidebar 支援多 Workspace 分組瀏覽、空 Workspace 建立 Board CTA。
- Phase 2：Workspace Settings / Member Governance，補 Workspace members、roles、owner/admin 管理與 Board guest-like access 說明。
- Phase 3：Board Placement / Move UX Polish，整合 DEV-025 preview/confirm flow，維持受控搬移。
- Phase 4：Workspace Overview，規劃跨 Board table/calendar/activity overview。

本輪 RD 實作範圍:
- Sidebar「工作區選單」標題列右側新增 `新增工作區` `+` icon button。
- 新增 Workspace dialog 具備名稱輸入、空白阻擋、建立中防 double submit、成功/失敗可見回饋。
- `addWorkspace` 改為 Promise / awaitable contract，採 backend-success-first，後端成功後才更新 store 與 localStorage。
- First-run 自動建立 `我的工作區` 改走相同 Promise flow；失敗時 toast，不建立本機假 workspace。
- Home 改為 Workspace 分組呈現 Boards；空 Workspace 顯示 `建立看板` CTA。
- local-test seed 修正為可恢復 `home + no activeBoard` 狀態，避免新增空 Workspace 後 reload 被帶回基準看板。
- 補 DEV-036 static verifier、browser verifier、package scripts 與 QC 文件。

交付邊界:
- 未新增 Supabase migration。
- 未修改 RLS、Workspace member settings、Board guest-like access、billing、quota 或 production deployment。

Phase 1 RD acceptance:
- Sidebar 工作區選單標題列右側有 `新增工作區` `+` icon button。
- 新增 Workspace dialog 具備名稱輸入、空白阻擋、建立中防 double submit、成功/失敗可見回饋。
- `addWorkspace` 或等效 store action 採 Promise / awaitable contract，後端成功後才更新 store 與 localStorage。
- First-run 沒有任何 Workspace 時建立 `我的工作區`，且失敗時不建立本機假資料。
- Home 以 Workspace 分組呈現 Boards；空 Workspace 顯示 `建立看板` CTA。
- 建立第二個以上 Workspace 後 reload 仍存在，且 Board 不會混入其他 Workspace。

Phase 1 RD exit gate:
- `npm.cmd run verify:dev-036-trello-like-workspace-governance`
- `npm.cmd run verify:dev-036-trello-like-workspace-governance-browser`
- `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`
- `npm.cmd run verify:dev-035-workspace-delete-browser`
- `npm.cmd run verify:dev-030-sidebar-rename-contract`
- `npm.cmd run verify:dev-030-sidebar-rename-contract-browser`
- `npm.cmd run verify:dev-025-project-workspace-transfer`
- `npm.cmd run verify:dev-026-trello-like-board-share-ui`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

本輪驗證結果:
- Pass: `npm.cmd run verify:dev-036-trello-like-workspace-governance`，24/24。
- Pass: `npm.cmd run verify:dev-036-trello-like-workspace-governance-browser`。
- Pass: `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`，22/22。
- Pass: `npm.cmd run verify:dev-035-workspace-delete-browser`。
- Pass: `npm.cmd run verify:dev-030-sidebar-rename-contract`，9/9。
- Pass: `npm.cmd run verify:dev-030-sidebar-rename-contract-browser`。
- Pass: `npm.cmd run verify:dev-025-project-workspace-transfer`。
- Pass: `npm.cmd run verify:dev-026-trello-like-board-share-ui`，15/15。
- Pass: `npm.cmd exec tsc -- --noEmit`。
- Pass: `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build`。

Stop conditions:
- 若發現既有 schema / RLS 無法支援多 Workspace 建立與 Board visibility，需停止並補 Supabase design review。
- 若需要更改 `tenant_members` / `project_members` constraint 或 guest-like access，需另開 migration plan 與 DB QC。
- 若 Workspace create 無法做到 backend-success-first，需停止，不得改回 optimistic ghost workspace。
- 若要部署或套 migration，需走 deployment-release-gate。

### DEV-035: 工作區刪除持久化修正

狀態: Implemented / Local Automated QC Passed / Supabase DB QC Pending
節點類型: 交付點
優先級: P0 data consistency bug
父交付點: 無
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者回報工作區已刪除，但重新整理後又出現在工作區清單。
- 截圖顯示刪除入口來自工作區右鍵選單，正式站重新整理後後端資料重新載回。

任務目標:
- 工作區刪除必須以後端持久化成功為準，不得先讓 UI 假裝刪除成功。
- Supabase 正式環境需提供 owner-only workspace delete RPC，避免直接依賴缺少 RLS policy 的 `tenants.delete()`。
- 刪除失敗時必須顯示使用者可見錯誤，不可只 `console.error`。
- 刪除 active workspace 後必須清除 active workspace / board / modal 與 localStorage 殘留，避免重新整理後指向不存在資料。

目前根因判斷:
- `useBoardStore.removeWorkspace` 目前先 optimistic 移除 state，再呼叫 `workspaceService.delete(wsId).catch(console.error)`。
- `supabaseWorkspaceService.delete` 目前直接刪 `public.tenants`。
- 現有 Supabase migration 沒有 `tenants` delete policy 或受控 delete RPC；正式 backend delete 很可能失敗，reload 後 `useSupabaseSync` 重新載回同一筆 workspace。

交付文件:
- `ai-doc/specs/SPEC-035-workspace-delete-persistence-fix.md`
- `ai-doc/qa/QA-DEV-035-workspace-delete-persistence-fix.md`
- `ai-doc/qc/QC-DEV-035-workspace-delete-persistence-fix.md`

RD 執行範圍:
- 新增 Supabase `public.delete_workspace(target_tenant_id uuid)` RPC，限定 active owner 可執行，並設定 revoke/grant。
- `supabaseWorkspaceService.delete` 改呼叫 RPC。
- `removeWorkspace` 改為 async，後端成功後才更新 Zustand state。
- `GlobalContextMenu` await delete result，成功/失敗 toast 清楚回報。
- 補 static verifier、browser verifier 與 package scripts。

RD exit gate:
- `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`
- `npm.cmd run verify:dev-035-workspace-delete-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

本輪驗證結果:
- Pass: `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`，21/21。
- Pass: `npm.cmd run verify:dev-035-workspace-delete-browser`，涵蓋取消確認、刪除後 reload 不復活、active workspace cleanup、mobile reload smoke。
- Pass: `npm.cmd exec tsc -- --noEmit`。
- Pass: `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build`。
- Pass: `npm.cmd run verify:core-regression-static`，10/10。
- Pass: `npm.cmd run verify:dev-030-sidebar-rename-contract`，9/9。
- Pass: `npm.cmd run verify:dev-030-sidebar-rename-contract-browser`。

交付邊界:
- 已新增 Supabase migration 檔，但本輪未套用到遠端資料庫、未部署正式站。
- Supabase CLI 在本機不可用，因此 owner/admin/member/viewer DB role QC 需等 migration 套用到目標資料庫後執行。

QA 驗證計畫:
- Static：migration RPC、owner-only guard、revoke/grant、service RPC、store async contract、UI toast、package script。
- Browser：local-test 刪除 workspace 後 reload 不復活；刪 active workspace 不殘留 active board；取消 confirm 不刪除；mobile viewport 不重疊。
- Supabase DB QC：owner 成功、admin/member/viewer 失敗、cascade 後一般 authenticated user 不可讀 tenant-scoped data。

治理註記:
- 不另建 ADR；本輪是修復既有 owner-only delete 行為，未新增新的 workspace lifecycle、soft delete 或角色政策。
- 若後續要做 workspace recycle bin、復原或 admin 可刪除，需另開 ADR。

### DEV-034: App 快速啟動與加入主畫面 UX

狀態: Done / Browser QC Passed / Local-first scope
節點類型: 交付點
優先級: P0 mobile quick-capture readiness
父交付點: 無
是否計入產品交付完成: 是
建立日期: 2026-06-29

關聯需求:
- 使用者指出 App 開啟等待時間對出差臨時記雜事不友善。
- 使用者要求快取與更新不需使用者另外操作，或最多第一次操作一次後永久設定。
- 使用者指出加入主畫面 UI 說明太複雜，使用者不知道怎麼用，需做到不再回頭問開發人員。

任務目標:
- App Shell 透過 PWA 快取與背景更新策略提升再次開啟速度，且更新不可被舊快取卡死。
- 加入主畫面引導需自動出現或在設定頁永久可查，不要求使用者理解技術名詞。
- 依平台分流：iOS Safari 顯示三步驟、Android/Desktop 可用原生安裝提示、內建瀏覽器先導到 Safari / Chrome。
- QuickCaptureShell 已由 DEV-039 全域任務平台 `未歸位` lane 取代，右下角浮窗不得再全域掛載。
- local-first pending queue 保留為舊本機快記資料來源，用於未歸位任務遷移與提升。

目前 RD 範圍:
- DEV-034A：PWA 更新基礎已先行完成，採 `vite-plugin-pwa`、背景檢查與下次開啟套用策略。
- DEV-034B：PWA 安裝助理已驗證，新增自動提示、設定頁快速開啟入口、安裝偏好記憶與平台分流文案。
- DEV-034C：QuickCaptureShell 已退役；`src/App.tsx` 不再掛載，`src/components/QuickCaptureShell.tsx` 已移除。
- DEV-034D：local-first pending queue 已驗證，以 localStorage 保存 `syncStatus=pending` 的私人 `InboxItem`；正式雲端 Inbox 與轉任務接 SPEC-002 後續。

交付文件:
- `ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md`
- `ai-doc/qc/QC-DEV-034-fast-start-pwa-install-guidance.md`

RD exit gate:
- `npm.cmd run verify:dev-034-pwa-install-guidance`
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build`
- Browser smoke：設定頁需可看到 `快速開啟` 與加入主畫面助理，不得出現水平溢位或對使用者暴露技術詞。
- Browser smoke：未登入手機畫面可先存一筆快記到本機收件匣，且不得遮擋後續設定入口。

Verified（2026-06-29）:
- `npm.cmd run verify:dev-034-pwa-install-guidance`: Pass，24/24。
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`: Pass，輸出 `output/playwright/dev-034-quick-capture-before-login-mobile.png`、`output/playwright/dev-034-pwa-install-guidance-desktop.png`、`output/playwright/dev-034-pwa-install-guidance-mobile.png`。
- `npm.cmd exec tsc -- --noEmit`: Pass。
- `npm.cmd run lint -- --quiet`: Pass。
- `npm.cmd run build`: Pass，產出 `dist/sw.js`、`dist/workbox-6c1be909.js`、`dist/manifest.webmanifest`。

殘留邊界:
- 本輪 local-first queue 不等於正式雲端 Inbox；跨裝置同步、今日區塊、指派/分享、轉正式任務仍屬 SPEC-002 後續交付。

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

狀態: Implemented / Browser QC Passed / DB unchanged
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
- `ai-doc/qc/QC-DEV-023-record-project-change-import-workflow-step.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Implemented | SPEC-023 |
| 驗證計畫 | QA | Browser QC Passed | QA-DEV-023 |
| 實作 | RD | Implemented | workflow first-step integration |
| 事實驗證 | QC/Verifier | Browser QC Passed | DEV-023 workflow-step verifier |

驗證證據：
- Pass: `npm.cmd run verify:dev-023-record-project-change-import-workflow-step`，18 checks。
- Pass: `npm.cmd run verify:dev-020-record-workflow-redesign`。
- Pass: `npm.cmd run verify:dev-020-project-change-import-browser`，截圖 `output/playwright/dev-020-record-workflow-1440.png`、`output/playwright/dev-020-record-workflow-1024.png`。
- Pass: `npm.cmd run verify:dev-021-project-change-ai-preserve`。
- Pass: `npm.cmd run verify:dev-022-project-change-single-record`。
- Pass: `npm.cmd exec tsc -- --noEmit`。
- Pass: `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build`。

交付邊界：
- 不新增資料庫 schema、migration 或 record content persistence 格式。
- QA 文件要求的 ROT-001 至 ROT-007 人工真實點擊測試尚未人工簽核；本輪完成自動化 browser QC。

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
| 1 | DEV-040 Phase 1 P0 正式環境同型風險 RD | RD Contract Ready / Not Authorized | RD / QA / QC | 使用者授權後處理 dependencies 匯入持久化與 RAG timeout/fallback，通過 QA-DEV-040 P0 gate。 |
| 2 | DEV-011 / DEV-012 production UI smoke | In Verification | QC / 使用者 | 以已登入 Google 的正式前端完成：開會、AI整理、校稿發布、紀錄庫與任務知識查找。 |
| 3 | DEV-026 Trello-like 看板分享體驗 RD | Done | RD | 已完成 topbar 分享入口、分享 modal、設定頁權限矩陣降層與 DEV-026 verifier。 |
| 4 | DEV-011 / DEV-012 production backend AI smoke | Done | QC | 正式 Edge Function 以授權 user JWT 呼叫成功，回傳 AI 統整內容與實際模型。 |
| 5 | DEV-028 四模式一致的 Trello-like 任務操作契約 QC | Manual Click QC Pending | QC | 依 QA-DEV-028 補做 MAN-028-001 至 MAN-028-027 人工親自點擊驗證，附 viewport、截圖或錄影、visible error sweep。 |
| 6 | DEV-020 紀錄功能重構 RD | Done | RD | 已依 SPEC-020 重構紀錄入口、專案變化匯入、未儲存保護與功能說明。 |
| 7 | 文件同步清理 backlog / documentation map | Done | PM | backlog、dev_task、documentation map 與 QC evidence 狀態一致。 |

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
| DEV-040 | 交付點 | Production Release Deployed / Original BUG Smoke Passed / Extended Matrix Partially Covered | 是 | 正式環境同型 BUG 風險硬化與驗證 | `SPEC-040`、`QA-DEV-040`、`QC-DEV-040`、`verify:dev-040-production-auth-ui-smoke` | 原始 2 BUG 正式站 smoke 通過；延伸 7 點剩餘項需另行驗證 |

### 交付點完成率

- Done：10 個交付點。
- In Verification：2 個交付點。
- Implemented / Browser Smoke Passed：1 個交付點。
- Implemented / Browser Smoke Passed / Manual Click QC Pending：1 個交付點。
- Production Release Deployed / Original BUG Smoke Passed / Extended Matrix Partially Covered：1 個交付點。
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
| DEV-023 | 開發點 | DEV-020 | Implemented / Browser QC Passed / DB unchanged | 專案變化匯入整併為紀錄流程第一步 | `SPEC-023`、`QA-DEV-023`、`QC-DEV-023`、`verify:dev-023-record-project-change-import-workflow-step`、`verify:dev-020-project-change-import-browser` |
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
