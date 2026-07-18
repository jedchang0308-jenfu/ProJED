# ProJED Dev Task Control Board

Active repo：`C:\VIBE CODING\ProJED\ProJED`。不要從 `C:\VIBE CODING\ProJED`
外層遞迴讀取 sibling clone 或備份資料夾。

Cold start：先讀下方 `## 總任務清單`；需要特定 DEV 詳細歷史時，再搜尋
`ai-doc/archived/dev_task_pm_updates_2026-07-15.md` 的 DEV ID 並只讀命中段落。

## 總任務清單

此區是 `dev_task.md` 的 canonical index；詳細契約、歷史與完整證據保留在直接連結的
SPEC / QA / QC / release 文件，以及 `ai-doc/archived/dev_task_pm_updates_2026-07-15.md` 的命中段落。

- ✓ DEV-001 [交付點] [完成] [P2] [已交付] 四模式一致化緊湊 UI 系統
  - 摘要：建立跨主要任務模式的一致緊湊 UI 基礎。
  - 證據：`SPEC-001`、舊 dev_task archive
  - 計入交付：是
- ✓ DEV-002 [交付點] [完成] [P1] [已交付] 會議紀錄與個人工作紀錄 MVP
  - 摘要：交付會議紀錄與個人工作紀錄主流程。
  - 證據：`SPEC-003`、`verify:dev-002-records`
  - 計入交付：是
- ✓ DEV-003 [開發點] [完成] [P2] [已交付] 紀錄內容 inline task tag
  - 摘要：支援 DEV-002 的紀錄內容任務標註。
  - 父任務：DEV-002
  - 證據：`verify:dev-003-record-tags`
  - 計入交付：否
- ↷ DEV-004 [交付點] [延後] [P3] [等待重啟] 全人個人與團隊待辦平台 MVP
  - 摘要：待使用者重新啟動的 whole-person 待辦平台 umbrella。
  - 阻塞 / 恢復條件：使用者重新確認產品範圍
  - 證據：`SPEC-002`
  - 計入交付：否
- ✓ DEV-005 [交付點] [完成] [P1] [已交付] 會議看板主畫面紀錄工作流
  - 摘要：建立會議看板主要紀錄工作流。
  - 證據：`SPEC-005`、PM report
  - 計入交付：是
- ✓ DEV-006 [交付點] [完成] [P1] [已交付] Gmail-like 會議紀錄輸入器
  - 摘要：穩定化 Gmail-like 紀錄輸入體驗。
  - 證據：`SPEC-006`、`QA-DEV-006`
  - 計入交付：是
- ✓ DEV-007 [交付點] [完成] [P1] [已交付] 會議中看板編輯與任務活動
  - 摘要：會議模式保留完整看板編輯與活動捕捉。
  - 證據：`SPEC-007`、`verify:dev-007-meeting-activity`
  - 計入交付：是
- ✓ DEV-008 [交付點] [完成] [P2] [已交付] 任務會議細節快速查找
  - 摘要：讓任務可快速查找會議知識與細節。
  - 證據：`SPEC-008`、`verify:dev-008-task-knowledge`
  - 計入交付：是
- ✓ DEV-009 [交付點] [完成] [P2] [已交付] 任務詳情會議快速補記
  - 摘要：提供任務詳情內的快速會議補記流程。
  - 證據：`SPEC-009`、`QA/QC-DEV-009`
  - 計入交付：是
- ✓ DEV-010 [交付點] [完成] [P2] [已交付] 會議紀錄操作狀態溝通
  - 摘要：改善紀錄操作 CTA 與狀態回饋。
  - 證據：`SPEC-010`、`verify:dev-010-action-feedback`
  - 計入交付：是
- ✓ DEV-011 [交付點] [完成] [P1] [正式環境已交付] AI 任務導向會議紀錄統整
  - 摘要：交付 AI 任務導向會議紀錄統整與 production smoke。
  - 證據：`SPEC-011`、`QC-DEV-011-012-production-ai-smoke`
  - 計入交付：是
- ✓ DEV-012 [交付點] [完成] [P1] [正式環境已交付] AI 會議紀錄自然語言品質
  - 摘要：提升 AI 會議紀錄自然語言品質並完成 production smoke。
  - 證據：`SPEC-012`、`QC-DEV-011-012-production-ai-smoke`
  - 計入交付：是
- ✓ DEV-013 [交付點] [完成] [P2] [已交付] 任務子樹複製
  - 摘要：提供任務與子樹依賴一致的右鍵複製。
  - 證據：`SPEC-013`、`QC-DEV-013`
  - 計入交付：是
- ✓ DEV-014 [開發點] [完成] [P3] [已交付] 會議紀錄階層編號
  - 摘要：以階層編號改善 AI 會議紀錄結構。
  - 父任務：DEV-011、DEV-012
  - 證據：DEV-011/012 regression
  - 計入交付：否
- ✓ DEV-015 [開發點] [完成] [P3] [已交付] 會議紀錄主線摘要品質
  - 摘要：改善 DEV-012 的會議摘要主線品質。
  - 父任務：DEV-012
  - 證據：`verify:dev-015-meeting-summary-mainline`
  - 計入交付：否
- ✓ DEV-016 [開發點] [完成] [P3] [已交付] 紀錄庫條列清單
  - 摘要：將紀錄庫改為可掃描的條列清單。
  - 父任務：DEV-002
  - 證據：`verify:dev-016-records-list-view`
  - 計入交付：否
- ✓ DEV-017 [開發點] [完成] [P3] [已交付] 紀錄側欄寬度調整
  - 摘要：提供紀錄側欄拖拉與寬度記憶。
  - 父任務：DEV-005、DEV-010
  - 證據：`verify:dev-017-record-sidebar-resize`
  - 計入交付：否
- ✓ DEV-018 [開發點] [完成] [P2] [已交付] 會議紀錄防呆流程重設計
  - 摘要：重設會議紀錄工作流與離開防呆。
  - 父任務：DEV-002、DEV-005
  - 證據：DEV-018 RD/QA/QC 章節
  - 計入交付：否
- ✓ DEV-019 [開發點] [完成] [P2] [已交付] 紀錄類型與會議流程層級
  - 摘要：整理紀錄類型與會議模式層級。
  - 父任務：DEV-002、DEV-005、DEV-018
  - 證據：`SPEC-019`、`QA-DEV-019`
  - 計入交付：否
- ✓ DEV-020 [交付點] [完成] [P1] [已交付] 紀錄重構與專案變化匯入
  - 摘要：交付紀錄流程重構與專案變化匯入主線。
  - 證據：`SPEC-020`、`QA-DEV-020`
  - 計入交付：是
- ✓ DEV-021 [開發點] [完成] [P2] [已交付] 專案變化 AI 整理保留
  - 摘要：保護專案變化匯入後的 AI 整理內容。
  - 父任務：DEV-020
  - 證據：`SPEC-021`、DEV-021 verifier
  - 計入交付：否
- ✓ DEV-022 [開發點] [完成] [P2] [已交付] 專案變化單一紀錄整合
  - 摘要：將專案變化與 AI 整理收斂成單一紀錄。
  - 父任務：DEV-020
  - 證據：`SPEC-022`、DEV-022 verifier
  - 計入交付：否
- ✓ DEV-023 [開發點] [完成] [P2] [已交付] 專案變化匯入流程第一步
  - 摘要：把專案變化匯入整合為紀錄流程第一步。
  - 父任務：DEV-020
  - 證據：`SPEC-023`、`QA/QC-DEV-023`
  - 計入交付：否
- ✓ DEV-024 [開發點] [完成] [P1] [正式環境已驗證] AI 整理保留手寫內容
  - 摘要：確保 AI 整理保留手寫草稿與章節結構。
  - 父任務：DEV-011、DEV-012、DEV-020
  - 證據：`SPEC-024`、`QC-DEV-024`
  - 計入交付：否
- ◇ DEV-025 [交付點] [驗證中] [P1] [需受控 DB fixture] 受控跨工作區移動專案
  - 摘要：產品實作與 read-only preflight 已完成，尚待受控 mutating DB QC。
  - 下一步：在安全 fixture 執行 role / RLS / audit / consistency matrix
  - 阻塞 / 恢復條件：需 staging 或 production-safe test workspace
  - 證據：`SPEC-025`、`QA/QC-DEV-025`
  - 計入交付：是
- ✓ DEV-026 [交付點] [完成] [P2] [本機已驗證] Trello-like 看板分享
  - 摘要：交付看板分享 UI 與 browser smoke。
  - 證據：`SPEC-026`、`QA-DEV-026`
  - 計入交付：是
- ✓ DEV-027 [交付點] [完成] [P2] [本機已驗證] Xmind-like 心智圖模式
  - 摘要：交付心智圖模式與後續互動改善。
  - 證據：`SPEC-027`、`QA/QC-DEV-027`
  - 計入交付：是
- ✓ DEV-028 [交付點] [完成] [P1] [本機與人工已驗證] 四模式任務操作契約
  - 摘要：完成跨模式任務操作一致性與人工點擊驗證。
  - 證據：`SPEC-028`、`QA/QC-DEV-028`
  - 計入交付：是
- ✓ DEV-029 [交付點] [完成] [P1] [本機已驗證] 手機 Pan-First 與 compact action rail
  - 摘要：完成手機捲動優先、長按操作、拖放仲裁與大型新增 CTA short-pan pass-through；欄位新增任務、看板尾端新增 CTA、TaskWorkbench 未歸位新增 CTA 不再是平移死角。
  - 證據：`SPEC-029`、`QA/QC-DEV-029`；2026-07-17 canvas CTA hotfix：DEV-029 static 38/38、browser B10-B12、DEV-054/053/046 static/browser、TypeScript、build 通過。
  - 計入交付：是
- ✓ DEV-034 [交付點] [完成] [P2] [本機已驗證] App 快速啟動與加入主畫面
  - 摘要：交付 PWA 快速啟動與安裝引導。
  - 證據：`SPEC-034`、`QC-DEV-034`
  - 計入交付：是
- ✓ DEV-035 [交付點] [完成] [P1] [DB role QC 已通過] 工作區刪除持久化
  - 摘要：完成工作區刪除持久化與 Supabase role matrix。
  - 證據：`SPEC-035`、`QA/QC-DEV-035`
  - 計入交付：是
- ✓ DEV-036 [交付點] [完成] [P1] [本機已驗證] Trello-like Workspace Governance
  - 摘要：建立 workspace / board 治理模型與 UI 契約。
  - 證據：`ADR-036`、`SPEC-036`、`QA/QC-DEV-036`
  - 計入交付：是
- ✓ DEV-037 [交付點] [完成] [P1] [正式環境已交付] 行事曆訂閱來源範圍
  - 摘要：v1 source-scope已由DEV-045 v3向後相容契約承接，production DB / Edge與既有Google Calendar v1觀察通過。
  - 證據：`SPEC-037`、`QA/QC-DEV-037`
  - 計入交付：是
- ✓ DEV-038 [交付點] [完成] [P1] [正式環境已交付] 設定中心範圍一致性與防呆
  - 摘要：完成設定中心 IA、資料範圍與高風險防呆。
  - 證據：`SPEC-038`、`QA/QC-DEV-038`
  - 計入交付：是
- ✓ DEV-039 [交付點] [完成] [P1] [本機已驗證] 全域任務工作台與任務過濾器
  - 摘要：完成任務 filter core、跨看板工作台與 row-root parity。
  - 證據：`SPEC-039`、`QA/QC-DEV-039`
  - 計入交付：是
- ◇ DEV-040 [交付點] [驗證中] [P0] [remote Edge gate pending] 正式環境同型 BUG 風險硬化
  - 摘要：原始 BUG 已發布驗證，P0 bounded-failure addendum 尚待 remote Edge gate。
  - 下一步：依專項 release gate 處理 remote Edge / injection evidence
  - 證據：`SPEC-040`、`QA/QC-DEV-040`
  - 計入交付：是
- ✓ DEV-041 [交付點] [完成] [P1] [正式環境已交付] PWA 更新通知與快取恢復
  - 摘要：完成 PWA 更新通知、快取恢復與 production smoke。
  - 證據：`SPEC-041`、`QA/QC-DEV-041`
  - 計入交付：是
- ✓ DEV-042 [交付點] [完成] [P1] [正式環境與真機已驗證] 手機左側欄 Off-Canvas
  - 摘要：手機 closed state 零佔寬，展開採 overlay / drawer。
  - 證據：`SPEC-042`、`QA/QC-DEV-042`
  - 計入交付：是
- ✓ DEV-044 [交付點] [完成] [P1] [safe scope 正式環境已交付] 上一步復原範圍擴充
  - 摘要：完成低成本 ordinary undo 與 safe slice；破壞性 recovery 另行 gate。
  - 證據：`SPEC-044`、`QA/QC-DEV-044`
  - 計入交付：是
- ✓ DEV-045 [交付點] [完成] [P1] [正式環境已交付 / Level 4通過] 行事曆訂閱逐看板篩選器
  - 摘要：逐看板獨立filter snapshot、preview / live ICS identity、token lifecycle、v1相容與cleanup已在production通過。
  - 父任務：DEV-037、DEV-039
  - 證據：`ADR-038`、`SPEC-045`、`QA-DEV-045`、`QC-DEV-045` v3 addendum、`PREPRODUCTION-DEV-045-20260713.md`
  - 計入交付：是
- ◇ DEV-046 [交付點] [驗證中] [P1] [人工真機 supplemental pending] 全任務表面拖曳一致化
  - 摘要：桌機 / 手機 whole-task drag 與把手退役已完成本機自動驗證。
  - 下一步：需要時補人工真機 supplemental；production release另行 gate
  - 證據：`SPEC-046`、`QA-DEV-046`
  - 計入交付：是
- ✓ DEV-047 [交付點] [完成] [P0] [Phase 1 本機開發與 QA/QC 完成 / 待批次發版] 看板備份套件 V2 與交易式匯入
  - 摘要：單看板 V2 package、canonical export、inspect/plan、copy default、
    same-origin transactional replace、readback verification、RWD UI 與人類可辨識的條件式備份檔名已完成本機驗證。
  - 父任務：DEV-038
  - 下一步：未來收到 release 指令時進入 ProJED-TEST Level 3 與 production deployment gate；Phase 2/3 需 Human Re-entry
  - 證據：`ADR-041`、`SPEC-047`、`QA-DEV-047`、`QC-DEV-047`
  - 計入交付：是
- ✓ DEV-048 [交付點] [完成] [P1] [TEST + production 已驗證 / Level 4通過] 多人主責與協作指派
  - 摘要：任務可設定多位主責與多位協作，兩種角色互斥；本輪明確不新增最終負責人。
  - 來源 ID：`USER-20260715-assignment-optimization`
  - release 結果：ProJED-TEST migration、authenticated Level 3、production migration、Firebase deploy 與 Level 4 已通過；5 個既有 migration provenance hash mismatch 保留為 governance residual
  - 證據：`SPEC-048`、`QA-DEV-048`、`QC-DEV-048`、`verify:dev-048-task-multi-person-assignment`
  - 計入交付：是
- ↷ DEV-051 [交付點] [延後] [P1] [已回復 main 基準] 看板跨父層拖拉停留鎖定
  - 摘要：DEV-051 新拖拉架構因反覆出現定位、預覽與抖動問題已撤出；目前看板拖拉
    回復 `main` 的既有行為，DEV-051 規格與 QA/QC 只保留歷史參考。
  - 來源 ID：`USER-20260716-kanban-cross-parent-drag-lock`
  - 父任務：DEV-046、DEV-029
  - 下一步：若再次啟動，先以 `main` 建立 characterization baseline，經使用者確認後
    才能重新導入跨父層鎖定；不得直接恢復已撤出的 DEV-051 模組。
  - 阻塞 / 恢復條件：需有可重現的分層拖拉案例、單一落點權威與真實操作通過標準。
  - 證據：runtime 與 DEV-029／046 基準檔已對齊 `main`；DEV-029 32/32 + browser、
    DEV-046 27/27 + browser、DEV-039 26/26 + browser、DEV-044 25/25 + browser、
    DEV-048、TypeScript 與 `build:test` 均通過。`SPEC-051`、`QA-DEV-051`、
    `QC-DEV-051` 均標記為歷史／已撤回。
  - 計入交付：是
- ✓ DEV-053 [交付點] [完成] [P1] [本機 QA True Operation Gate 已通過] 任務拖拉肌肉記憶一致化
  - 摘要：以目前 main runtime 為基準完整重構任務拖拉子系統，保留已滿意的電腦版拖拉 UI，並明確 Workbench placed row 不能拖。
  - 來源 ID：`USER-20260717-task-drag-muscle-memory-consistency`
  - 父任務：DEV-029、DEV-039、DEV-046
  - 下一步：原 DEV 功能與架構交付維持完成；使用者回報的手機定位精準度缺口另由 DEV-054 執行。若要 production deploy，需另行授權並執行 release gate。
  - 阻塞 / 恢復條件：不得復活 DEV-052 或 DEV-051 parent-lock baseline；若要改 DB、production 或恢復 placed-row drag 需 Human Re-entry。
  - 證據：`SPEC-053`、`QA-DEV-053`、`QC-DEV-053`；DEV-053 static 30/30、browser 10/10、DEV-029/046/039/028 browser、DEV-044、TypeScript、`build:test` 與 T01-T14 全數通過；不代表真機定位精準度已簽核。
  - 計入交付：是
- ◇ DEV-054 [交付點] [驗證中] [P1] [RD Rework 4 Browser + User Revalidation Passed / Physical Gate Required] 手機任務拖拉定位精準度優化
  - 摘要：使用者第四次模擬手機證明 Rework 3 將 preview 停靠 indicator 是錯誤補償，且 checklist source 會在 innermost target 無效後誤命中 expanded parent card。RD rework 4 改為 preview 永遠跟 raw finger、exact innermost target ownership、invalid ancestor blocking、card primary bounded geometry，並移除 nearest-target 磁吸；桌機 dnd-kit UI、topbar、action rail 與 placed-row no-drag 契約維持不變。
  - 來源 ID：`USER-20260717-mobile-task-drag-precision`
  - 父任務：DEV-053、DEV-029、DEV-046
  - 下一步：QA/QC 依 `QA-DEV-054` 補齊 B01-B12 正式 trace matrix 與 iOS / Android 各 50 次真機操作；兩台實機 gate 均通過後才可關閉 DEV-054。
  - 阻塞 / 恢復條件：不得改變桌機 approved baseline、不得恢復 DEV-051/052、不得讓 Workbench placed row 可拖；任一實機缺席或 wrong commit > 0 不得完成。
  - 證據：四次使用者失敗均保留；R10 修正前以 `636x764` 重現 preview 跳離手指與 parent-card fall-through，修正後 DEV-054 static 34/34、browser R01-R10 與指定回歸通過。使用者已於 2026-07-17 以原路徑確認「成功、效果非常好、跨階層移動非常清楚」。仍缺 physical trial sheet、錄影與 QC report，故目前不得標記完成。
  - 計入交付：是
- ✓ DEV-055 [交付點] [完成] [P1] [正式環境已交付 / Level 4 通過] 電腦版任務拖拉落點清晰化與跨階層定位升級
  - 摘要：第一次自動化通過後，使用者 T01-T08 真實桌機操作回報「同一格定位線會飄」與「L3+ 任務被定位線推開」。RD Rework 1 在保留現有桌機 DragOverlay、8px 起手門檻與滑鼠跟手感的前提下，改為 fixed overlay-only indicator、overlay checklist append hit area、card/checklist sortable displacement freeze、同 target rect micro-retain；Workbench placed row 維持不能拖。2026-07-17 使用者重跑 T01-T08 後回報測試通過，確認同格不飄、L3+ 不被定位線推開、桌機手感沒有被重做；同日 Firebase Hosting production release 與 Level 4 smoke 通過。
  - 來源 ID：`USER-20260717-desktop-task-drag-target-clarity`
  - 父任務：DEV-053、DEV-054
  - 下一步：DEV-055 已交付正式環境；若後續要做 authenticated production drag smoke，需使用者在正式站登入後補人工操作證據。
  - 阻塞 / 恢復條件：不得直接移植手機 retain/hysteresis、action rail 或 touch lifecycle；不得改變桌機 overlay、drag start threshold、click/right-click、commit/undo 結果。若任一既有桌機操作回歸，停止並回復該 Slice 設計。
  - 證據：`ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md`、`ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md`、`ai-doc/qc/QC-DEV-055-desktop-task-drag-target-clarity.md`；RD Rework 1 後 DEV-055 static 27/27、browser B01-B16 16/16、DEV-046 static/browser、DEV-053 static/browser 10/10、DEV-054 static/browser R01-R10、TypeScript、build 均通過。B15 證明 L3+ row top/bottom delta = 0、parentTransform = `none`、同格 indicator rect delta = 0；最新 DEV-055 evidence base 為 `output/playwright/dev-055-desktop-drag-1784301885366-*`。2026-07-17 使用者回報 RD Rework 1 後 T01-T08 測試通過。Production release branch `codex/dev055-production-release-20260717-234436`、artifact commit `e07ba4b`；Firebase preview `level3-smoke` 與 production `https://projed-cc78d.web.app` Level 4 smoke 通過，正式站載入 `assets/index-DpRjvQu-.js` / `assets/index-B8eLAVHK.css`，線上 hash 與本機 production artifact 一致。
  - 計入交付：是
- ✓ DEV-056 [交付點] [完成] [P0] [正式環境已交付 / Level 4 通過] 正式環境手機長按完整選單誤開修正
  - 摘要：使用者於 2026-07-18 回報正式環境手機版長按右側任務清單時，同時出現頂部 compact action rail 與完整 task context menu。根因是 Android / Chrome 長按可合成 `contextmenu`，而同一 task surface 仍保留桌機右鍵 handler；手機長按進入 action rail 後，contextmenu 事件仍可能冒泡到 `GlobalContextMenu`。RD hotfix 已改為 mobile task action session 期間由頂部 action rail 作唯一 UI owner，capture phase 與 document phase 都抑制完整選單；桌機右鍵完整選單維持。
  - 來源 ID：`USER-20260718-production-mobile-long-press-extra-menu`
  - 父任務：DEV-029、DEV-046、DEV-054、DEV-055
  - 下一步：正式登入後可由使用者以 Android 手機在右側清單長按補人工真機證據；預期只出現頂部 action rail，不再出現中央完整選單。
  - 阻塞 / 恢復條件：若桌機 B10 右鍵選單失效、手機 action rail 不可點、mobile 長按仍出現 `data-global-context-menu` 或正式站未載入 `assets/index-DKsVgGEA.js`，即停止並回送 RD。
  - 證據：hotfix code commit `e891f29`；release evidence commit `812e9aa`；`npx tsc --noEmit`、DEV-029 static 39/39、DEV-046 static 31/31、DEV-053 static 30/30、DEV-054 static 34/34、DEV-055 static 27/27、production build 通過。Local browser：DEV-029 mobile pan/action rail passed、DEV-046 universal task surface passed、DEV-054 mobile precision R01-R10 10/10 passed、DEV-055 desktop B01-B16 16/16 passed。Firebase Hosting production deploy to `https://projed-cc78d.web.app` completed on 2026-07-18; Level 4 app-shell smoke passed and production HTML loads `assets/index-DKsVgGEA.js` / `assets/index-B8eLAVHK.css`. Online JS/CSS SHA-256 match local production artifact: JS `618D53411E17661613BFD45AE3EE330DCAC4EC30B4EABA1FEC7CD3C176915A68`; CSS `BC7359535F85D3F5CAB38E8FFA2A15674F709FCD3E902FA5811E2A944D4B7755`. Authenticated production mobile long-press operation was not automated; user phone check remains supplemental evidence.
  - 計入交付：是
- ✓ DEV-057 [交付點] [完成] [P1] [正式環境已交付 / Level 4 通過] 任務詳情明確儲存與桌面游標預選框
  - 摘要：任務詳情 X 左側新增儲存鈕與已儲存回饋，X 關閉前也會寫入尚未失去焦點的標題與備註；桌面普通游標移入任務時，沿用既有藍色 inset 選取樣式框選 exact innermost task，父層不會同時亮起，拖曳期間停用普通 hover 框。
  - 來源 ID：`USER-20260718-task-save-and-desktop-hover-preview`
  - 父任務：DEV-033、DEV-046、DEV-055
  - 下一步：已交付正式環境；後續若調整 task surface 或 context menu，需重跑儲存 / X、左鍵、右鍵與桌面拖曳回歸。
  - 阻塞 / 恢復條件：不得將這個樣式套用到拖曳預覽，不得讓父子 task surface 同時顯示 hover 框，不得使 X 關閉遺失最後輸入。
  - 證據：artifact commit `1c7c060`；release branch `codex/task-save-hover-release-20260718-151753`；DEV-033 browser 通過；desktop hover parent / child / column exact ownership 通過；DEV-055 browser B01-B16 16/16 通過；production build、Level 2 local artifact smoke、Firebase Level 3 preview 與 Level 4 production smoke 通過。正式站已登入抽查儲存鈕與 X 同列，實際下層任務游標預選僅顯示一個 `2px inset` 藍框。完整證據：`ai-doc/release/LEVEL4-production-deploy-evidence-20260718-task-save-hover.md`。
  - 計入交付：是


## PM Update 歷史歸檔

2026-07-17：DEV-052 已從 active 總任務清單移除；歷史 SPEC / QA 封存至
`ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md` 與
`ai-doc/archived/QA-DEV-052-kanban-drag-subsystem-refactor.md`。DEV-052 不得直接執行；
未來若需要拖拉子系統重構，需另立以目前 `main` runtime 為基準的新 DEV。

2026-07-15：歷史 `PM Update` 詳細段落已移至 `ai-doc/archived/dev_task_pm_updates_2026-07-15.md`。

- Active `dev_task.md` 只保留 `## 總任務清單` 作為冷啟動與派工入口。
- 需要特定 DEV 的歷史、release evidence 或詳細 PM 更新時，先用 DEV ID 搜尋 archive，再只讀命中的段落。
- 不要從 `C:\VIBE CODING\ProJED` 外層遞迴讀取 sibling clone；active repo 固定為 `C:\VIBE CODING\ProJED\ProJED`。
