# ProJED Dev Task Control Board

Active repo：`C:\VIBE CODING\ProJED\ProJED`。不要從 `C:\VIBE CODING\ProJED`
外層遞迴讀取 sibling clone 或備份資料夾。

Cold start：先讀下方 `## 總任務清單`；需要特定 DEV 詳細歷史時，再搜尋
`ai-doc/archived/dev_task_pm_updates_2026-07-15.md` 的 DEV ID 並只讀命中段落。

## Release update - 2026-09-15（REL-001）

DEV-119～DEV-123 已由 source commit `3e21b862c58a9952c4207b6d53904915a530bfcd` 啟用至正式站，release ID 為 `20260915032709-a1b629`。正式 migration、Edge Functions、sealed frontend artifact、Level 3、candidate、canonical browser smoke 與 OAuth safe-cancel 均有獨立證據，詳見 [REL-001 release record](release/REL-001-DEV-119-123-20260915.md)。

DEV-123 的 control plane 已部署並完成 hosted synthetic 18/18；因專案級 ZDR、真實 Provider cleanup 與品質 qualification 仍 Pending，正式 bundle 保持 `VITE_DEV123_MEETING_TASK_RESOLUTION_ENABLED=false`，錄音／任務辨識入口不對使用者開放。這是 release boundary，不代表 Provider 功能已完成。

## Release update - 2026-09-17（REL-002）

DEV-122已由clean source commit `5ee11786da4db07b9f125b0e315873dda479d1c9`的sealed artifact啟用至Firebase canonical live，release ID `20260917080116-1a5f27`、live release `1789648827546000`、version `59da8efd9cc1e02c`。45/45 provenance、root browser、OAuth safe-cancel、390×844 quick zero-read與production-safe同帳號建立／工作台唯一讀回／cleanup均PASS，詳見[REL-002 release record](release/REL-002-DEV-122-20260917.md)。

依release-owner決策，本次仍保留Android／iPhone實機、DEV-096 real-SW最新FAIL及完整B／W／P／效能／獨立QA-QC缺口為accepted residual risks；原始case不改寫為PASS。DEV-122終態為`Production Verified with Accepted Exceptions`。

## Release update - 2026-09-17（REL-003 DEV-123 / Direct Production Verification）

依使用者明確授權，DEV-123 已由 clean source commit `31df112b70f77061d1a69a3570d83c27d74e2be7` 以 production flag `VITE_DEV123_MEETING_TASK_RESOLUTION_ENABLED=true` 建立 sealed artifact，並啟用至 Firebase canonical live，release ID `20260917150720-6533b0`。45/45 provenance、production-bound readiness、credential rotation、canonical browser smoke、OAuth safe-cancel 與正式 bundle feature marker 均通過；完整證據見 [REL-003 release record](release/REL-003-DEV-123-20260917.md)。

本次是正式環境可見性與 control-path 驗證，`process_meeting_analysis` 仍為 fake provider，未呼叫真實 transcription provider；Provider ZDR、真實 API/model/pricing、Files cleanup 與 95/90 品質 qualification 仍列為 Pending。正式入口已開放供授權驗證，但不得將 fake worker 結果視為真實語音品質或商用 provider 完成。

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
  - 摘要：會議模式保留完整看板編輯與有語意活動捕捉；逐筆 append 與純位置活動已由 DEV-011/012 現行契約取代。
  - 證據：`SPEC-007`、`verify:dev-007-meeting-activity`
  - 計入交付：是
- ✓ DEV-008 [交付點] [完成／UI 後續退場] [P2] [Local-only / NOT RELEASED] 任務會議細節快速查找
  - 摘要：歷史曾交付任務明細知識查找；2026-09-10 依使用者決策移除整個歷史資訊入口與面板，僅保留紀錄資料及片段解析相容能力。
  - 證據：`SPEC-008`、`QA-DEV-008`、`verify:dev-008-task-knowledge`、DEV-108 browser regression
  - 計入交付：是（歷史交付事實保留；現行任務明細 UI 已退場）
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
- ◇ DEV-012 [交付點] [驗證中] [P1] [Contract v2 本機 QA/QC 通過／正式環境待驗證] AI 會議紀錄自然語言品質
  - 摘要：使用者已確實執行 AI整理；重開後完成 `meeting-synthesis-v2` 握手、Edge/client 雙重品質閘門、執行追溯與 metadata persistence、AI／規則整理來源揭露、直接證據與 merge idempotency 修正。本機 verifier、TypeScript、真實瀏覽器 5/5 已通過；尚未部署或驗證 production v2。
  - 證據：`SPEC-012`、`QA-DEV-012`、`QC-DEV-011-012-production-ai-smoke` 的 2026-08-07 addendum、`CAPA-20260807-dev-012-ai-synthesis-verification-gap`
  - 下一關：同一 commit 部署 frontend + Edge，production UI/DB/Edge trace run ID 一致，並以同型失敗案例完成前後對照與連續整理驗證。
  - 計入交付：否
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
- ✓ DEV-021 [開發點] [完成] [P2] [已交付] 專案變化 AI整理保留
  - 摘要：保護專案變化匯入後的 AI整理內容。
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
- ◇ DEV-028 [交付點] [驗證中] [P1] [本機 QC 通過 / 選取生命週期增補待人工補證] 四模式任務操作契約
  - 摘要：原跨模式任務操作一致性已完成；本輪依使用者回饋增補選取生命週期，詳情關閉、ESC、空白點擊與切換檢視後不得殘留選取框，心智圖清除後不得自動回選根節點。
  - 來源 ID：`USER-20260805-SELECTION-LIFECYCLE-CLEAR`
  - 下一步：若要上正式環境，另走 release gate；本輪未獲部署授權。
  - 阻塞 / 恢復條件：不得改變 click-to-details、拖曳／關聯線／會議紀錄選取模式；若後續再調整選取視覺，需維持 close、ESC、空白點擊與切換檢視後零殘留。
  - 證據：`SPEC-028`、`QA-DEV-028`（Selection Lifecycle Addendum）；DEV-028 static 45/45、browser 四模式 click-to-details + close／ESC selected count = 0 + mindmap blank/Escape 皆通過，console 0 errors、TypeScript、ESLint、test build、1440／390 viewport smoke 與截圖通過；1024／人工點擊仍依 QA 矩陣待補。
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
- ◇ DEV-039 [交付點] [驗證中] [P1] [正式環境已交付 / authenticated two-device smoke待補] 全域任務工作台與任務過濾器
  - 摘要：完成任務 filter core、跨看板工作台、row-root parity、跨看板 `所有任務排序`，並新增 Supabase 帳號歸屬的未歸位任務同步與本機一次性合併；Supabase migration 已套用 production，Firebase Hosting 已部署。
  - 下一步：使用者登入正式站後補同帳號桌機/手機新增、修改、刪除與移入已歸位的 authenticated two-device smoke；目前自動化環境沒有 production OAuth 測試帳號，因此不冒稱已完成。
  - 證據：`SPEC-039` Phase 2B、`QA/QC-DEV-039`、status-filter refresh static／browser QC；`20260715143000` 與 `20260810093403` migration history/readback、RLS table/policy/grant readback、TypeScript、lint、build、Level 2 artifact smoke、Firebase production deploy 與 Level 4 app-shell/artifact provenance smoke；release commit `963befe`，production bundle `assets/index-DiYPWj3V.js` / `assets/index-CwBhkroa.css`，並保留 `setNodes(activeBoardNodes)` 不得覆蓋工作台來源的回歸條件。
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
- ✓ DEV-042 [交付點] [本機驗證完成] [P1] [共用 Inline 寬度與 Topbar 看板切換器已通過 / 尚未部署] 手機與桌機共用左側面板排列
  - 摘要：手機與桌機共用同一套 `Sidebar`／`TaskWorkbenchPanel`；topbar 已把選單 icon 與目前看板名稱整合成位於顯示 `All` 的全域任務平台入口左側的單一 Sidebar 切換器，保留既有改名安全契約。
  - 下一步：若要交付正式環境，另走 release gate，並補 production mobile smoke；本輪未獲部署授權。
  - 證據：`SPEC-042`、`QA/QC-DEV-042`；2026-09-10 topbar 增補 DEV-042 static `22/22`、browser `8/8`、DEV-030 static `11/11` 與 browser、390／320／1440 screenshots、TypeScript、targeted ESLint、`build:test` 與 `git diff --check` 均通過
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
  - 摘要：以目前 main runtime 為基準完整重構任務拖拉子系統，並明確 Workbench placed row 不能拖。2026-08-24 依使用者最新決策，桌機來源預覽保留既有視覺語彙但整體縮放為 50%，以 gap=0 精準貼在滑鼠熱點右上方；手機 preview 與實際 drop intent 不變。
  - 來源 ID：`USER-20260717-task-drag-muscle-memory-consistency`、`USER-20260824-desktop-task-drag-overlay-half-scale-pointer-anchor`
  - 父任務：DEV-029、DEV-039、DEV-046
  - 下一步：原 DEV 功能與架構交付維持完成；使用者回報的手機定位精準度缺口另由 DEV-054 執行。若要 production deploy，需另行授權並執行 release gate。
  - 阻塞 / 恢復條件：不得復活 DEV-052 或 DEV-051 parent-lock baseline；若要改 DB、production 或恢復 placed-row drag 需 Human Re-entry。
  - 證據：`SPEC-053`、`QA-DEV-053`、`QC-DEV-053`；2026-08-24 最新桌機預覽實測 rect=`120x20`、pointer=`(185,100)`、rect left=`185`／bottom=`100`，DEV-053 static 30/30、browser 10/10、TypeScript、targeted ESLint 0 error、`build:test` 通過；DEV-068 本次變更案例通過，但完整相鄰 suite 仍揭露既有來源虛線框高度 `28.09px → 32px` 差異，不歸因於 fixed 預覽縮放。未部署。
  - 計入交付：是
- ! DEV-054 [交付點] [阻塞] [P1] [RD Rework 5 Automated QA-QC Passed / Awaiting Physical Devices] 手機任務拖拉定位精準度優化
  - 摘要：Rework 5 修正長按計時器成立前瀏覽器已啟動文字圈選／iOS callout，以及真實 TouchEvent 被 `innerWidth <= 768` gate 誤導回桌機路徑的根因；L1、L2、L3+ 與 Workbench 未歸位任務表面現在從 touchstart 宣告 selection ownership，實際 touch 不再依 viewport 寬度分流。Workbench 保留 native pan，已歸位列仍不可拖；桌機 dnd-kit、click/right-click 與 collision 契約維持，overlay 尺寸／offset 已由 2026-08-24 使用者最新決策另行覆寫為 50%／gap=0。
  - 來源 ID：`USER-20260717-mobile-task-drag-precision`
  - 父任務：DEV-053、DEV-029、DEV-046
  - 下一步：Automated QA-QC 已通過，實機驗證工作簿亦已備妥；連接 iPhone Safari 與 Android Chrome 後依工作簿各執行主要 50 次與 P06-P12 補充情境，兩台實機 gate 均通過後才可關閉 DEV-054。
  - 阻塞 / 恢復條件：2026-08-14 連續三輪完成稽核均未偵測到可操作的 iPhone/iPad/Android 裝置；需提供 iPhone Safari 與 Android Chrome 實機，或回傳填妥且附錄影的驗證工作簿後恢復。不得改變桌機 approved baseline、恢復 DEV-051/052 或讓 Workbench placed row 可拖；任一實機缺席或 wrong commit > 0 不得完成。
  - 證據：`SPEC-054`、`QA-DEV-054`、`QC-DEV-054`；2026-08-14 DEV-054 static 44/44、browser R01-R15 15/15、DEV-029 browser 41 cases、DEV-039/046 browser、DEV-053 10/10、DEV-055 16/16、DEV-067 8/8、全部指定 static regression、TypeScript、targeted ESLint（0 error）與 `build:test` 通過。R12-R15 直接證明 L1/L2/L3+ 零圈選、500ms/8px 邊界、寬觸控 viewport 與 Workbench pan/no-drag 契約。實機驗證工作簿已完成公式雙向模擬與六分頁 visual QA；本機未偵測到可操作的 iOS/Android 實體裝置，故仍不得標記完整完成。
  - 計入交付：是
- ✓ DEV-055 [交付點] [完成] [P1] [正式環境歷史已交付 / 2026-08-25 本機邊界修正未 Release] 電腦版任務拖拉落點清晰化與跨階層定位升級
  - 摘要：第一次自動化通過後，使用者 T01-T08 真實桌機操作回報「同一格定位線會飄」與「L3+ 任務被定位線推開」。RD Rework 1 在保留現有桌機 DragOverlay、8px 起手門檻與滑鼠跟手感的前提下，改為 fixed overlay-only indicator、overlay checklist append hit area、card/checklist sortable displacement freeze、同 target rect micro-retain；Workbench placed row 維持不能拖。2026-07-17 使用者重跑 T01-T08 後回報測試通過並完成 production release。2026-08-25 再修正展開 L2 standard `after` marker：命中仍用 primary geometry，垂直顯示改用完整 task scope bottom，不再切在標題與子樹之間；此最新修正僅本機驗證，未 release。
  - 來源 ID：`USER-20260717-desktop-task-drag-target-clarity`
  - 父任務：DEV-053、DEV-054
  - 下一步：DEV-055 已交付正式環境；若後續要做 authenticated production drag smoke，需使用者在正式站登入後補人工操作證據。
  - 阻塞 / 恢復條件：不得直接移植手機 retain/hysteresis、action rail 或 touch lifecycle；不得改變桌機 overlay、drag start threshold、click/right-click、commit/undo 結果。若任一既有桌機操作回歸，停止並回復該 Slice 設計。
  - 證據：`ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md`、`ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md`、`ai-doc/qc/QC-DEV-055-desktop-task-drag-target-clarity.md`；RD Rework 1 與 2026-07-17 production 歷史證據保留。2026-08-25 最新本機修正 failure-first 為 primary bottom=`201.09375px`、scope bottom=`274.09375px`；修正後 marker centerY=`274.09375px`，DEV-055 static 29/29＋browser B01-B16 16/16、DEV-068 static 76/76、desktop/mobile boundary browser 各 2/2、TypeScript 與 `build:test` PASS。DEV-055 evidence base：`output/playwright/dev-055-desktop-drag-1787593310935-*`；邊界視覺：`output/playwright/dev-068-title-child-drop-1787592996400-desktop-candidate-expanded-l2-boundary.png`。最新修正未部署、未 release。
  - 計入交付：是
- ✓ DEV-056 [交付點] [完成] [P0] [正式環境已交付 / Level 4 通過] 正式環境手機長按完整選單誤開修正
  - 摘要：使用者於 2026-07-18 回報正式環境手機版長按右側任務清單時，同時出現頂部 compact action rail 與完整 task context menu。根因是 Android / Chrome 長按可合成 `contextmenu`，而同一 task surface 仍保留桌機右鍵 handler；手機長按進入 action rail 後，contextmenu 事件仍可能冒泡到 `GlobalContextMenu`。RD hotfix 已改為 mobile task action session 期間由頂部 action rail 作唯一 UI owner，capture phase 與 document phase 都抑制完整選單；桌機右鍵完整選單維持。
  - 來源 ID：`USER-20260718-production-mobile-long-press-extra-menu`
  - 父任務：DEV-029、DEV-046、DEV-054、DEV-055
  - 下一步：正式登入後可由使用者以 Android 手機在右側清單長按補人工真機證據；預期只出現頂部 action rail，不再出現中央完整選單。
  - 阻塞 / 恢復條件：若桌機 B10 右鍵選單失效、手機 action rail 不可點、mobile 長按仍出現 `data-global-context-menu` 或正式站未載入 `assets/index-DKsVgGEA.js`，即停止並回送 RD。
  - 證據：hotfix code commit `歷史 hotfix artifact`；release evidence commit `歷史部署 artifact`；`npx tsc --noEmit`、DEV-029 static 39/39、DEV-046 static 31/31、DEV-053 static 30/30、DEV-054 static 34/34、DEV-055 static 27/27、production build 通過。Local browser：DEV-029 mobile pan/action rail passed、DEV-046 universal task surface passed、DEV-054 mobile precision R01-R10 10/10 passed、DEV-055 desktop B01-B16 16/16 passed。Firebase Hosting production deploy to `https://projed-cc78d.web.app` completed on 2026-07-18; Level 4 app-shell smoke passed and production HTML loads `assets/index-DKsVgGEA.js` / `assets/index-B8eLAVHK.css`. Online JS/CSS SHA-256 match local production artifact: JS `618D53411E17661613BFD45AE3EE330DCAC4EC30B4EABA1FEC7CD3C176915A68`; CSS `BC7359535F85D3F5CAB38E8FFA2A15674F709FCD3E902FA5811E2A944D4B7755`. Authenticated production mobile long-press operation was not automated; user phone check remains supplemental evidence.
  - 計入交付：是
- ✓ DEV-057 [交付點] [完成] [P1] [正式環境已交付 / Level 4 通過] 任務詳情明確儲存與桌面游標預選框
  - 摘要：任務詳情 X 左側新增儲存鈕與已儲存回饋，X 關閉前也會寫入尚未失去焦點的標題與備註；桌面普通游標移入任務時，沿用既有藍色 inset 選取樣式框選 exact innermost task，父層不會同時亮起，拖曳期間停用普通 hover 框。
  - 來源 ID：`USER-20260718-task-save-and-desktop-hover-preview`
  - 父任務：DEV-033、DEV-046、DEV-055
  - 下一步：已交付正式環境；後續若調整 task surface 或 context menu，需重跑儲存 / X、左鍵、右鍵與桌面拖曳回歸。
  - 阻塞 / 恢復條件：不得將這個樣式套用到拖曳預覽，不得讓父子 task surface 同時顯示 hover 框，不得使 X 關閉遺失最後輸入。
  - 證據：artifact commit `歷史 task-save-hover artifact`；release branch `歷史 task-save-hover release`；DEV-033 browser 通過；desktop hover parent / child / column exact ownership 通過；DEV-055 browser B01-B16 16/16 通過；production build、Level 2 local artifact smoke、Firebase Level 3 preview 與 Level 4 production smoke 通過。正式站已登入抽查儲存鈕與 X 同列，實際下層任務游標預選僅顯示一個 `2px inset` 藍框。完整證據：`ai-doc/release/LEVEL4-production-deploy-evidence-20260718-task-save-hover.md`。
  - 計入交付：是
- ✓ DEV-058 [開發點] [完成] [P2] [正式環境已交付 / Level 4 通過] 跨裝置拖曳原地文字欄位藍色回饋
  - 摘要：Attempt 1 原地粗插入線通過自動化但使用者判定不夠直覺。Rework 1 已完成桌面藍底白字原地欄位；Rework 2 依使用者要求將同樣設計套用手機長按拖曳，其他有效落點維持既有一般插入線。
  - 來源 ID：`USER-20260803-desktop-drag-origin-insertion-feedback`
  - 父任務：DEV-055、DEV-054
  - 下一步：已交付正式環境；手機正式資料拖曳提交未由 Codex 執行，後續可由使用者補真機操作證據。
  - 阻塞 / 恢復條件：不得改變 `collision:source-block`、commit / undo、8px 起手門檻、click / right-click、手機 raw finger / target stability / action rail 或既有正常落點線；來源放開必須零寫入，且畫面任一時間只能有一種 drop feedback。
  - 證據：`ai-doc/specs/SPEC-058-desktop-drag-origin-insertion-feedback.md`、`ai-doc/qa/QA-DEV-058-desktop-drag-origin-insertion-feedback.md`；Rework 2 static：DEV-058 26/26、DEV-054 37/37、DEV-055 27/27、DEV-046 31/31、DEV-053 30/30；browser：DEV-054 R01-R11 11/11、DEV-055 B01-B16 16/16、DEV-053 10/10、DEV-046 全表面回歸；320/390/430 visual、ESLint、TypeScript 與 production build 通過。Artifact commit `339bf27` 已部署，Level 3 preview、Level 4 production smoke 與線上 hash provenance 通過；完整證據：`ai-doc/release/LEVEL4-production-deploy-evidence-20260804-continuous-optimization-3.md`。
  - 計入交付：是
- ✓ DEV-059 [開發點] [完成] [P2] [正式環境已交付 / Level 4 通過] 看板階層統計徽章精簡
  - 摘要：依使用者截圖移除任務卡頂部的下層任務 `完成數/總數` Badge，以及每個下層任務列右側的子項目數量 Badge；當時保留日期、卡片藍色進度條、階層展開內容與欄位標頭統計。2026-08-04 後續明示決策已再移除 L1／L2 進度條與非必要巢狀框線，改以 L1 淡外框、L2 無框陰影、L3+ 淡底與間距分層。
  - 來源 ID：`USER-20260803-kanban-hierarchy-count-badge-removal`
  - 父任務：DEV-028、DEV-058
  - 下一步：既有 DEV 已交付正式環境；本輪進度條與框線精簡目前僅完成本機實作與 QC，尚未部署。後續若調整卡片 metadata，需重跑 DEV-028 與登入後視覺抽查。
  - 阻塞 / 恢復條件：2026-08-04 使用者已明示移除 L1／L2 進度條及標題、卡片、L3+ 容器／列、新增任務、看板日期與標籤的非必要描邊，取代本 DEV 的舊限制；仍不得刪除日期、標籤或欄位標頭統計，也不得改變進度資料、任務階層、拖曳、選取、focus 或展開行為。
  - 證據：DEV-028 static 37/37、DEV-055 static 27/27 + browser B01-B16 16/16、DEV-054 static 37/37 + browser R01-R11 11/11、TypeScript、ESLint、4173 DOM / screenshot 與 production build 通過。Artifact commit `339bf27` 已部署，登入後正式站確認重複數量徽章已移除；完整證據：`ai-doc/release/LEVEL4-production-deploy-evidence-20260804-continuous-optimization-3.md`。最新本機框線精簡另通過 DEV-028 41/41、DEV-029 39/39、DEV-031 17/17、DEV-055 27/27、DEV-061 18/18、TypeScript、ESLint、test build 與 1440／1024／390 browser QC。
  - 計入交付：是
- ✓ DEV-060 [開發點] [完成] [P2] [到期日單值本機 QC 通過 / 尚未部署] 看板任務日期僅顯示到期日
  - 摘要：看板 L1／L2／L3+ 共用緊湊無描邊淡底 `TaskDateBadge checklist` surface，正面只顯示 `endDate`；不顯示開始日、箭頭或空到期日 placeholder。開始日與到期日資料、排程、依賴、工期鎖定、今日到期警示及其他檢視不變。
  - 來源 ID：`USER-20260803-kanban-l2-l3-date-parity`、`USER-20260804-kanban-due-date-only`
  - 父任務：DEV-028、DEV-059
  - 下一步：若要上正式環境，另走 release gate；本輪未獲部署授權。後續調整看板日期需維持所有階層同一到期日單值契約。
  - 阻塞 / 恢復條件：本輪明示決策只取代看板的 `showStartDate` 顯示控制；不得複製新日期樣式、刪除 `startDate`／`endDate` 資料、移除到期警示或依賴／工期鎖定，也不得改變其他檢視、日期編輯或拖曳 geometry。
  - 證據：本輪 DEV-060 browser QA-060-001～005 5/5、DEV-028 42/42、DEV-061 20/20、DEV-029 39/39、DEV-031 17/17、DEV-055 27/27、TypeScript、ESLint 0 errors（55 個既存 warnings）、test build、1440／1024／390 screenshot 與 console 0 errors 通過；`output/playwright/dev-060-kanban-due-date-only-1785827955188-*.png`。歷史箭頭區間版本 commit `339bf27` 與 Level 4 evidence 只代表既有 production。
  - 計入交付：是
- ✓ DEV-061 [開發點] [完成] [P2] [堆疊貼紙本機 QC 通過 / 尚未部署] 看板標籤堆疊式尾標貼紙
  - 摘要：使用者以堆疊式尾標貼紙取代全看板名稱收疊與圓點；L2／L3+ 在任務名稱尾端使用同一單行貼紙，第一標籤顯示名稱，後續最多露出兩層並以 `+N` 計數，點擊／鍵盤 focus 只開該任務完整標籤 popover，不再造成全看板排版跳動。
  - 來源 ID：`USER-20260804-kanban-trello-label-collapse`、`USER-20260804-kanban-stacked-tag-sticker-replacement`
  - 父任務：DEV-028、DEV-059、DEV-060
  - 下一步：若要上正式環境，另走 release gate；本輪未獲部署授權。
  - 阻塞 / 恢復條件：不得改標籤資料、標籤篩選、TagPicker 編輯流程、任務詳情／拖曳契約；貼紙不得遮字、另占一列或因舊 `showTagNames` 偏好跳版，手機不可新增水平溢出。
  - 證據：本輪 DEV-061 static 20/20 + browser QA-061-001～008 8/8、DEV-028 42/42、DEV-029 39/39、DEV-031 17/17、DEV-055 27/27、TypeScript、ESLint 0 errors、test build 與 1440／1024／390 screenshot 通過；`output/playwright/dev-061-kanban-tag-sticker-1785827105925-*.png`。歷史圓點版 commit `8713481` 與 Level 4 evidence 只代表既有 production。
  - 計入交付：是
- ✓ DEV-062 [開發點] [完成] [P1] [本機 QC 通過 / 尚未部署] 任務狀態精簡與截止日衍生逾期
  - 摘要：人工狀態收斂為待辦、進行中、暫緩、完成；逾期改由截止日自動判斷，狀態 UI 移除圖示與彩色圓點並收斂為深灰、藍、淺灰。
  - 來源 ID：`USER-20260804-SIMPLIFIED-TASK-STATUS-DERIVED-OVERDUE`
  - 父任務：DEV-028、DEV-039、DEV-060
  - 下一步：若要上正式環境，另走 release gate；本輪未獲部署授權。
  - 阻塞 / 恢復條件：不得自動回寫遠端 legacy status 或執行 enum migration；正式部署需先確認既有 delayed／unsure 資料轉換策略。
  - 證據：`SPEC-062`、`QA-DEV-062`、DEV-062 static／browser、DEV-039、DEV-045、DEV-028、DEV-061、TypeScript 與三 viewport screenshot 通過。
  - 計入交付：是
- ✓ DEV-063 [交付點] [完成] [P1] [本機 QC 通過 / 尚未部署] 看板 L2／L3+ 視覺層級強化
  - 摘要：L2 使用完整中性外框與陰影；L3+ 使用內嵌左導軌與無線條扁平列，以結構而非同層分隔或新增色相強化父子層級。
  - 來源 ID：`USER-20260804-KANBAN-L2-L3-HIERARCHY-VISUAL`
  - 父任務：DEV-028、DEV-060、DEV-061
  - 下一步：若要上正式環境，另走 release gate；本輪未獲部署授權。
  - 阻塞 / 恢復條件：不得改拖曳、點擊、標籤、日期、狀態、資料或 schema 契約；手機不得新增水平 overflow。
  - 證據：`SPEC-028 DEV-063 增補`、`QA-DEV-028 DEV-063 增補`、DEV-028 42/42、DEV-060 browser、DEV-061 static／browser、TypeScript、targeted ESLint、test build 與三 viewport screenshot 通過。
  - 計入交付：是
- ✓ DEV-064 [交付點] [完成] [P1] [本機 QC 通過 / 尚未部署] 全系統品牌藍統一
  - 摘要：以既有 `#6366F1` 建立品牌藍 50–950 色階，讓主要操作、選取、focus、進行中、拖曳與心智圖共用同一色相；工作台藍灰容器改為中性 slate，保留成功／警告／危險功能色。
  - 來源 ID：`USER-20260804-SYSTEM-BRAND-BLUE-UNIFICATION`
  - 父任務：DEV-027E、DEV-039、DEV-057、DEV-058、DEV-062
  - 下一步：若要上正式環境，另走 release gate；本輪未獲部署授權。
  - 阻塞 / 恢復條件：不得把成功、警告、危險、逾期或自訂非藍色改成品牌藍；不得改互動、資料、schema、權限或拖曳 commit。
  - 證據：`SPEC-064`、`QA-DEV-064`；DEV-064 static 20/20、browser 6/6、DEV-039 31/31、DEV-047、DEV-062、DEV-058 26/26、DEV-027E 24/24、TypeScript、targeted ESLint、test build 與四張 viewport／surface screenshot 通過。
  - 計入交付：是
  - ✓ DEV-065 [交付點] [已完成] [P1] [Rework 13 Card + List Two-Layer QC 通過 / 不部署] 任務子樹 hover 與拖曳影響範圍預覽
  - 摘要：統一 L1／L2／L3+ 游標預選為「來源任務＋完整可見後代」的子樹範圍；L1 卡片內容區補上完整群組 overlay，L2 來源框放在整張卡片最外層，標題列不另加框，子任務區保留第二層完整範圍框，並在實際拖曳 overlay 揭露 canonical 後代數量，讓使用者在移動前知道連帶影響。
  - 來源 ID：`USER-20260805-TASK-SUBTREE-HOVER-PREVIEW`
  - 父任務：DEV-057、DEV-055、DEV-028
  - 下一步：若要處理既有 DEV-055 B06 checklist drop hit-cache 回歸，另立 DEV；若要上正式環境，另走 release gate。
  - 阻塞 / 恢復條件：不得改變 click、right-click、8px threshold、drag commit／undo、cycle guard、手機 long-press、資料或 schema；本輪沒有部署授權。
  - 證據：`SPEC-065`、`QA-DEV-065`；Rework 14 為 DEV-068 補 outer scope／primary source 責任分離與 selected/focus-visible gate；Rework 13 依使用者示意將 L2 source marker 放回卡片 root，整張卡片使用 `primary-500` outer source frame，標題列不另加框，子任務區維持 `primary-400` 完整 group frame；既有雙層範圍、native tooltip、text/cursor與L3+完整框均保留。DEV-065 static 40/40、browser QA-065-001～015 15/15、TypeScript、ESLint、test build 與新截圖通過。
  - 計入交付：是
- ◇ DEV-066 [交付點] [驗證中] [P1] [Rework 4 Implemented / Local Simulated QC PASS / Physical Device Pending / 未 Release] 任務備註語意富文字與 AI 可讀內容
  - 摘要：移除手機唯讀＋純文字追加分流，所有 viewport 統一使用既有 Lexical 任務備註編輯器；只保留 RWD 差異，canonical rich state、plain compatibility alias 與 AI 安全投影不變。
  - 來源 ID：`USER-20260812-TASK-NOTE-RICH-TEXT-AI-READABLE`、`USER-20260820-DEV066-UNIFIED-MOBILE-TASK-NOTE-EDITOR`
  - 父任務：DEV-006、DEV-008、DEV-057
  - 下一步：以 iOS Safari／Android Chrome 實機完成觸控選字、中文 IME、貼上、soft keyboard、保存與重開 gate；若要正式交付，另走 release gate。
  - 阻塞 / 恢復條件：不得新增第二套手機 editor、改變資料／API／權限／格式 allowlist／會議紀錄 editor，或以手機純文字全文覆寫 canonical rich state；命中任一項即停止並回 PM。
  - 證據：`SPEC-066`、`ADR-042`、`QA-DEV-066`、`QC-DEV-066`；static、TypeScript、targeted ESLint、test build、DEV-066 1440／1024／390／320／landscape browser、DEV-033／050 regressions與 rendered screenshots 通過。舊 mobile zero-editor／append PASS 只保留為歷史證據。
  - 計入交付：是（RD 已實作；完整 mobile physical gate 尚未完成）
- ● DEV-067 [交付點] [已完成] [P1] [QC PASS / 未 Release] 看板任務拖曳升級為 L1 列表
  - 摘要：讓 L2／L3+ 任務可拖到列表標頭升級為 L1，並以既有單一定位條顯示插入位置；列表內容區仍維持 L2 drop，尾端新增 L1 append target。
  - 來源 ID：`USER-20260814-KANBAN-L1-DRAG-PROMOTION`
  - 父任務：DEV-053、DEV-054、DEV-055、DEV-058
  - 下一步：功能已完成；若要交付正式環境，另走 release gate。
  - 阻塞 / 恢復條件：不得恢復 DEV-051／052、不得改 Workbench placed-row no-drag、來源 no-op、單一 marker、raw finger、click/right-click 或 schema；任何 indicator／commit 不一致即停止。
  - 證據：`SPEC-067`、`QA-DEV-067`、`QC-DEV-067`；DEV-067 static 13/13、browser 8/8、DEV-055 desktop 16/16、DEV-054 mobile 11/11、DEV-053／054／055／058 static regression、TypeScript、targeted ESLint、test build 與 1440／1024／390 rendered QC 通過。
  - 計入交付：是
- ◐ DEV-068 [交付點] [執行中] [P1] [Targeted Browser 40/40 PASS / Physical Mobile 未充分驗證 / 未 Release] 任務完整預選範圍停留移入子任務
  - 摘要：把「移到指定任務底下」改成跨 L1／L2／L3+ 一致的完整 hover-scope 落點；前 1 秒保留既有同階／lane 操作，滿 1,000ms 後插入線固定對齊放開後最終階層的同層標題起點。L2／L3+ 標題固定在條件式控制項之前；空層級以相同版面 token 提供 title anchor。Candidate standard `after` marker 在展開任務時固定使用完整 task scope bottom，不得出現在 L2 標題正下方。
  - 來源 ID：`USER-20260815-TASK-TITLE-CENTER-CHILD-DROP`
  - 父任務：DEV-053、DEV-054、DEV-055、DEV-058、DEV-065、DEV-067
  - 下一步：接入 AI 可控 iPhone Safari 與 Android Chrome 完成 physical precision gate。若要交付正式環境，另走 release gate。
  - 阻塞 / 恢復條件：本輪不含部署或 release。缺 iPhone Safari／Android Chrome AI 可控實機時，只能標記 browser gate 通過，不得宣稱完整 physical mobile sign-off。
  - 證據：歷史基線與 QC 證據保留。2026-08-25 Rework 15～16 已證實完整 scope boundary。2026-09-16 DEV-068 static 101/101、browser 完整矩陣 40/40（含 7 種 desktop cancel、invalid cycle、viewport 與 mobile trials）、console／HTTP／visible error=0；未部署、未 release。Physical iPhone／Android gate 仍待執行。
  - 計入交付：是
- ◐ DEV-069 [交付點] [RD Implemented / Local QA-QC PASS / Provider Smoke Pending / 未 Release] [P1] 會議草稿 F5 復原與低成本雲端備份
  - 2026-09-08 corrective amendment：修正啟動時自動進入會議紀錄的行為；有效 local snapshot 僅顯示恢復提示，使用者明確按「恢復」後才進入 meeting mode，關閉提示不刪除草稿。沿用既有 snapshot schema、scope、TTL 與保存契約。
  - 摘要：桌機／筆電會議紀錄採本機即時復原與低頻雲端 checkpoint，避免 F5 丟失並限制寫入、重試與 RAG 成本；手機版不開放會議紀錄功能。
  - 來源 ID：`USER-20260817-MEETING-DRAFT-RECOVERY-COST-CONTROL`
  - 父任務：DEV-002、DEV-005、DEV-010、DEV-020
  - 下一步：補 Supabase／Firestore 真實 provider smoke 與 QA-069-014～020、QA-069-023；本輪不含 deploy／release。
  - 阻塞 / 恢復條件：不得以每次按鍵呼叫完整 `saveDraft()`；若需要 migration、server 全域硬限流、多端 merge 或開放手機功能，停止並 Human Re-entry。
  - 證據：`SPEC-069`、`QA-DEV-069`、`QC-DEV-069`、DEV-069 static/browser verifier、DEV-007/008/009/010/020 regression、TypeScript、build、1440/1024/390 screenshots。
  - 計入交付：是
- ✓ DEV-070 [開發點] [完成] [P1] [RD Implemented / QC Functional PASS / Release Gate Blocked] 跨模式互動策略核心與差異治理
  - 摘要：建立行為相容的 Interaction Kernel，以 Base／Host Mode／Origin／Transient sparse override 治理；Phase 1 零行為變更。
  - 來源 ID：`USER-20260817-CROSS-MODE-INTERACTION-POLICY-KERNEL`
  - 父任務：DEV-027B、DEV-028、DEV-029
  - 下一步：RD 依 `SPEC-070` S0 先建立 `dev-070-v1` golden master；S0 通過後才依 S1→S11 逐 binding shadow／authoritative 遷移。
  - 阻塞 / 恢復條件：Phase 1 任何 click、右鍵、快捷鍵、詳情、mobile gesture 或拖曳行為差異都必須停止；產品行為變更需另行 re-entry。
  - 證據：本檔 DEV-070、`SPEC-070`、`ADR-043`、`QA-DEV-070`、`SPEC-027B`、`SPEC-028`、`SPEC-029`。
  - 計入交付：否
- ✓ DEV-071 [開發點] [完成] [P1] [RD Implemented / Local QA-QC PASS / 未 Release] 心智圖選取與明細入口差異
  - 摘要：心智圖單擊任務只選取；雙擊或右鍵選單「開啟明細」才開啟任務明細；Enter／Tab 可建立任務但不自動開啟明細；其他模式維持既有單擊開明細。
  - 來源 ID：`USER-20260818-MINDMAP-SELECTION-DETAILS`
  - 父任務：DEV-070、DEV-027B、DEV-028
  - 下一步：完成文件同步與 commit；不含 deploy／release。
  - 阻塞 / 恢復條件：心智圖單擊誤開明細、雙擊／右鍵開錯任務、其他模式 menu 或單擊漂移時，回 RD 修 Host Mode Profile／surface adapter。
  - 證據：`SPEC-070` DEV-071 addendum、`SPEC-028` DEV-071 addendum、`QA-DEV-071`、DEV-071 static/browser verifier、DEV-028 static/browser regression、TypeScript。
  - 計入交付：否
- ✓ DEV-072 [開發點] [完成] [P1] [RD Implemented / Local QA-QC PASS / 未 Release] 共用彈窗按鈕鍵盤導航
  - 摘要：所有模式共用 `GlobalDialog` 的預設鍵盤互動；confirm／prompt 預設確認、action 預設第一個 action；左右鍵循環選擇，Enter 執行，prompt 輸入框保留原生游標左右鍵。
  - 來源 ID：`USER-20260818-GLOBAL-DIALOG-KEYBOARD-NAVIGATION`
  - 父任務：DEV-010、DEV-028、DEV-070
  - 下一步：完成正式 release gate 前的整合驗證；本輪不含 deploy／release。
  - 阻塞 / 恢復條件：若任一模式出現不同預設、Enter 執行錯誤按鈕、prompt 游標被攔截或按鍵穿透底層模式，回 RD 修正 `GlobalDialog` 共用契約，不在模式元件增加分支。
  - 證據：`SPEC-072`、`QA-DEV-072`、DEV-072 static/browser verifier、DEV-028 regression、TypeScript、`build:test`。
  - 計入交付：否
- ✓ DEV-073 [開發點] [完成] [P1] [RD Implemented / Local QA-QC PASS / 未 Release] 心智圖 XMind 式快速命名
  - 摘要：只有心智圖新增任務後或細滑鼠單擊既有任務會進入節點快速命名；可直接打字，按一次 Enter 只保存並離開、不新增任務，按一次 Tab 即保存並新增子任務。其他模式維持原本進入任務明細 title edit；心智圖雙擊與右鍵仍開任務明細。
  - 來源 ID：`USER-20260818-TASK-TITLE-EDIT-DEFAULTS`
  - 父任務：DEV-028、DEV-071、DEV-070
  - 下一步：若要正式交付，依既有 release gate 另行驗證；本輪不含 deploy／release。
  - 阻塞 / 恢復條件：若新增／單擊入口未 focus title、Enter 誤新增任務、Tab 建立層級錯誤、IME 組字誤新增、單擊開 modal、雙擊被 quick-title 攔截、右鍵入口錯誤或權限／relationship／觸控邊界漂移，回 RD 修正 MindMap host adapter。
  - 證據：`SPEC-073`、`QA-DEV-073`、DEV-073 static/browser verifier、DEV-028 static regression、TypeScript、`build:test`。
  - 計入交付：否
- ✓ DEV-074 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 心智圖單一 Scene 座標系重構
  - 摘要：將心智圖節點、階層連線、關係線與互動 overlay 收斂到同一 world coordinate scene，
    讓 zoom／pan 只改變視埠 transform，不再以 CSS `zoom` 引發重排與座標漂移。
  - 來源 ID：`USER-20260819-MINDMAP-SINGLE-SCENE-TRANSFORM`
  - 父任務：DEV-027
  - 下一步：若要正式交付，依既有 release gate 另行驗證；本輪不含 deploy／release。
  - 阻塞 / 恢復條件：沒有 P0/P1 產品或架構決策缺口；若必須改 schema、world origin、persisted control points、permission 或 quick-title／expansion expected，停止並回 PM／ADR。不得與 immediate dirty-latch 止血混為同一交付。
  - 證據：`SPEC-074`、`ADR-044`、`QA-DEV-074`（S0～S5 Executed / QA PASS / QC PASS）、`QA-DEV-074-ai-real-operation-verification`（AI real-operation 25/25、必跑 21/21、QC PASS）、`output/playwright/dev-074-single-scene/geometry-evidence.json`、`output/playwright/dev-074-ai-real-operation/result.json`、DEV-027B/D/E/G、028/070/071/073 regression、TypeScript、targeted lint、bundle health、`build:test`。
  - 計入交付：是（未 Release）
- ✓ DEV-075 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 心智圖方向鍵快速巡覽效能
  - 摘要：消除方向鍵快速移動延遲，並讓左右分支root可跳過中央看板名稱雙向穿越；中心維持非任務、非selection owner。
  - 來源 ID：`USER-20260820-MINDMAP-KEYBOARD-NAV-LAG`、`USER-20260820-MINDMAP-CENTER-BRIDGE`
  - 父任務：DEV-027
  - 下一步：若要正式交付，依既有 release gate 另行驗證；本輪不含 commit、push、deploy 或 release。
  - 阻塞 / 恢復條件：不得改變 DEV-027B／070／071／073 的鍵盤、選取、快速命名與 interaction owner，或 DEV-074 的單一 Scene／geometry dirty 契約；任一行為差異、selection 雙 owner、geometry recompute、效能 gate 失敗或需改資料／權限時立即停止。
  - 證據：`SPEC-075`、`QA-DEV-075`（Executed / QA PASS / QC PASS）、`output/playwright/dev-075-mindmap-keyboard-performance/result.json`、immutable baseline、center bridge rendered evidence、50／200／500節點真實鍵盤效能、互動／幾何／viewport evidence與targeted regressions。
  - 計入交付：是（未 Release）
- × DEV-076 [開發點] [跳過] [P1] [已撤回] 心智圖左鍵抓取畫布平移
  - 摘要：依使用者指示放棄並復原心智圖左鍵抓取畫布平移；原始規格與驗證證據保留為歷史紀錄。
  - 來源 ID：`USER-20260820-MINDMAP-LEFT-MOUSE-CANVAS-PAN`
  - 父任務：DEV-027
  - 下一步：無；若未來重新提出，需建立新的產品契約與驗證範圍。
  - 阻塞 / 恢復條件：只有使用者重新明確提出心智圖左鍵平移需求時才重開，不得由既有歷史驗證自動恢復。
  - 證據：歷史 `SPEC-076`、`QA-DEV-076` 與 `output/playwright/dev-076-mindmap-left-mouse-pan/result.json`。
  - 計入交付：否
- ✓ DEV-077 [開發點] [完成／契約誤讀已由 DEV-085 更正] [P2] [歷史實作；未 Release] 心智圖關係線多餘中央導引線清理
  - 摘要：2026-08-25 使用者澄清原附圖只要求刪除控制 UI 多畫的一條「搖桿 1 → 搖桿 2」中央線；控制臂與方形控制點不得移除。歷史 DEV-077 驗證只證明錯誤契約被實作，不再作為現行產品驗收。
  - 來源 ID：使用者附圖與「紅線的元素刪除」；2026-08-25 response annotation correction。
  - 父任務：DEV-027
  - 下一步：若要正式交付，依既有 release gate 另行驗證；本輪不含 commit、push、deploy 或 release。
  - Spec Impact：`Compatible correction`；現行權威轉至 DEV-085，更正 SPEC-077／QA-DEV-077，不改資料／API／權限。
  - 證據：更正後 `SPEC-077`、`QA-DEV-077` 與 DEV-085 package；舊 artifact 僅保留歷史稽核，不代表目前 acceptance。
  - 計入交付：否（歷史誤讀已被 DEV-085 取代）
- ✓ DEV-078 [開發點] [完成] [P2] [RD Implemented / QA-QC PASS / 未 Release] 心智圖工具列新增入口與快捷提示清理
  - 摘要：移除心智圖工具列「新增任務」與快捷鍵提示，保留空畫布首個任務 fallback 及 Enter／Tab／Delete 鍵盤契約。
  - 來源 ID：使用者 Browser Comment 1、Comment 2；刪除標註的兩個心智圖工具列元素。
  - 父任務：DEV-027
  - 下一步：若要正式交付，依既有 release gate 另行驗證；本輪不含 commit、push、deploy 或 release。
  - Spec Impact：`Intentional replacement / mindmap-only visual cleanup`；不改資料／API／權限。
  - 證據：`SPEC-078`、`QA-DEV-078`（Executed / QA PASS / QC PASS）、`output/playwright/dev-078-mindmap-toolbar-cleanup/result.json`、DEV-078 static 5/5、1440／1024／390 browser matrix、Enter browser + Tab／Delete source／既有 keyboard regression、TypeScript、targeted ESLint、`build:test`。
  - 計入交付：是（未 Release）
- ✓ DEV-079 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 心智圖右鍵選單建立關聯線
  - 摘要：在心智圖任務右鍵選單加入「建立關聯線」，以目前節點為起點沿用既有 endpoint selection 與 inline label 流程。
  - 來源 ID：`USER-20260820-MINDMAP-CONTEXT-MENU-CREATE-RELATIONSHIP`
  - 父任務：DEV-027
  - 下一步：若要正式交付，依既有 release gate 另行驗證；本輪不含 commit、push、deploy 或 release。
  - Spec Impact：`Intentional extension / mindmap-only context-menu action`；不改 schema、storage、API 或 permission model。
  - 證據：`SPEC-079`、`QA-DEV-079`（Executed / QA PASS / QC PASS）、`output/playwright/dev-079-mindmap-context-menu-create-relationship/result.json`、DEV-079 static 6/6、browser source／target／label／Escape／board exclusion、TypeScript、targeted ESLint、`build:test`、`git diff --check`。
  - 計入交付：是（未 Release）
- ✓ DEV-080 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 固定地端測試入口改用 localhost:4000
  - 摘要：將固定測試環境的瀏覽器入口、Auth redirect、啟動器與 active browser verifier 統一為 `http://localhost:4000/`，保留 loopback bind 與歷史證據相容性。
  - 來源 ID：`USER-20260820-CANONICAL-LOCALHOST-4000`
  - 父任務：無（ADR-037 治理來源）
  - 下一步：若要正式交付，依既有 release gate 另行驗證；本 DEV 不含 commit、push、deploy 或 release。
  - 阻塞 / 恢復條件：若 `localhost:4000` 無法連線、Auth redirect／browser origin 不一致或 port owner 無法安全辨識，停止並回報，不改用另一個 canonical URL。
  - 證據：`npm run verify:local-origin`（455 active files、無 stale reference）、`npm run verify:test-env`、`npm run dev:local`／`http://localhost:4000/` HTTP 200、DEV-079 browser smoke（canonical BaseUrl、console/page/network errors=0）、PowerShell parse、TypeScript、`build:test`、lint（0 errors／55 existing warnings）、`git diff --check`。
  - 計入交付：否
- ◐ DEV-081 [交付點] [進行中] [P1] [Implemented / Automated UI PASS（9 cases）/ Physical Mobile Pending / 未 Release] 手機看板 A／B 2～3 倍閱讀尺寸與雙指切換
  - 摘要：保留手機看板現行 A 緊湊模式，新增 B 放大閱讀模式；B 的主要文字與幾何相對 A 必須為 2.0～3.0 倍（預設 2.5 倍），以看板內 pinch-out／pinch-in 或可見控制切換。
  - 來源 ID：`USER-20260820-MOBILE-KANBAN-DUAL-SCALE-PINCH`
  - 父任務：DEV-001、DEV-029；DEV-054 為 mobile drag regression authority。
  - 下一步：QA／QC 依 `QA-DEV-081` 補完 20-case matrix、DEV-029／054 regression 與 iPhone Safari／Android Chrome physical gate；本輪不宣告 release。
  - 阻塞 / 恢復條件：若 B 低於 2 倍、pinch 與 pan／tap／long-press／drag 雙 owner、需禁用全頁原生 zoom、需改資料／API／權限，或只能靠直接 store／API mutation 通過，停止並回 PM／RD。
  - 證據：`SPEC-081`（Implemented / Automated UI PASS）、`QA-DEV-081`（21 項 FMEA；9-case browser smoke PASS；完整 matrix／實機 Not Run）、`output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json`。
  - 計入交付：是（RD implemented；完整 mobile QA 尚未完成）
- ◇ DEV-082 [交付點] [驗證中] [P1] [Remote Gate Pending] 看板多人即時同步
  - 摘要：補齊 Supabase Realtime publication、訂閱競態關閉、事件合併與標籤／成員同步，讓同一看板的其他已授權使用者自動收到更新。
  - 來源 ID：`USER-20260820-BOARD-REALTIME-COLLABORATION`
  - 父任務：DEV-026、DEV-036
  - 下一步：release lane 先在 ProJED-TEST 套用 migration 並以兩個授權帳號完成新增／改名／拖曳／封存／標籤／依賴的雙瀏覽器 smoke；通過後才可套用 production migration 與部署。
  - 阻塞 / 恢復條件：本輪未授權遠端 migration 或 deploy；沒有 authenticated two-user fixture，不宣稱正式環境即時同步已啟用。
  - 證據：`SPEC-082`、`scripts/verify-dev-082-board-realtime-sync.ts` PASS、TypeScript、targeted ESLint、`build:test`、DEV-081 rendered browser 9/9 PASS（console／page／network errors=0）、`git diff --check`。
  - 計入交付：是（本地實作完成；Remote Gate Pending）
- ✓ DEV-083 [交付點] [完成] [P0] [Released / Permanent Credential Unrecoverable Policy] 正式發版環境隔離與 artifact 完整性閘門
  - 摘要：以 production env隔離、sealed artifact與單一正式發版入口，阻止測試Supabase／localhost設定再次進入production。
  - 來源 ID：`USER-20260821-PRODUCTION-OAUTH-LOCALHOST-INCIDENT`
  - 下一步：後續正式發版回到 P1 `release:production`；Management PAT輪替與P2技術防繞過保留為已接受資安／治理債，不阻塞本次release結案。
  - 阻塞 / 恢復條件：若 canonical smoke、artifact identity或OAuth回歸失敗，回滾至Firebase version `93c2a80ddc1a798e`；DEV-081實機與DEV-082 production remote gate仍由各自DEV管理。
  - 證據：release `20260821144058-509110`、commit `4ee8bf8`、candidate version `880dfc3bbbc5d8b3`、live version `ca48cc7d514432d8`、39/39 remote hash、OAuth與authenticated smoke PASS。
  - 計入交付：是（P0＋P1已發布；PAT strict gate依使用者FMEA例外不宣稱PASS）
- ✓ DEV-084 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 非主按鍵不得觸發主按鍵互動
  - 摘要：以共用 raw-input guard 修正中鍵／右鍵誤啟動 task drag、Gantt／panel resize、mindmap relationship primary action與 modal backdrop close，同時保留左鍵、鍵盤、觸控、右鍵 menu及心智圖中鍵 pan。
  - 來源 ID：`USER-20260822-NON-PRIMARY-POINTER-ISOLATION`
  - 父任務：DEV-070；相容權威 DEV-028、DEV-053、DEV-077
  - 下一步：保留 local-only evidence；若要進正式環境，另走 deployment/release gate；本輪不 release。
  - 阻塞 / 恢復條件：若 DEV-084 required static/rendered gate、non-primary isolation、合法 middle-pan/right-menu/left/keyboard 或 automated mobile boundary 回歸，回 RD 修正；physical iPhone Safari／Android Chrome 為 supplemental Not Run，不得冒稱真機通過。
  - 證據：`SPEC-084`（Implemented / QA-QC PASS）、`QA-DEV-084`（static 7/7、rendered 13/13、Calendar local fixture）、`output/playwright/dev-084-primary-pointer-isolation/result.json`、required DEV-028／029／046／053／054／070／076／077／DEV-017／resizable-navigation regressions、TypeScript／targeted ESLint／build:test／git diff --check。
  - 計入交付：是（local implementation + complete required QA/QC；未 Release）
- ✓ DEV-085 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 心智圖關聯線方向搖桿、端點外側定位與 DEV-077 意圖更正
  - 摘要：選取關聯線時提供兩條端點控制臂與兩個方形方向搖桿，可獨立拖曳調整貝茲曲線方向；起點／終點各自固定在所屬分支的外側框線；僅移除多餘中央導引線，並修正首拖 fallback、持久化、縮放命中區、關聯線本體 44px 置中點擊 window、完整 click 選取生命週期與非主按鍵／Escape 邊界。
  - 來源 ID：`USER-20260825-MINDMAP-RELATIONSHIP-DIRECTION-JOYSTICKS`、response annotation correction、`USER-20260825-MINDMAP-RELATIONSHIP-ENDPOINT-OUTER-EDGE`。
  - 父任務：DEV-027；更正 DEV-077；相容 DEV-027E、DEV-076、DEV-084。
  - 下一步：若要正式交付，另走 deployment/release gate；本輪不 commit、push、deploy 或 release。
  - Spec Impact：`Compatible correction / restore original relationship control intent`；不改 schema、API、permission 或既有 relationship identity。
  - 證據：`SPEC-085`、`QA-DEV-085`、`QC-DEV-085`、DEV-085 static 9/9、右→左兩端外框誤差各 `0.0044px`、window centerline 至曲線 `0.24px` 與中心／18px edge-tolerance true click、DEV-077 corrected static 6/6、DEV-027E 24/24、DEV-027G 97/97、DEV-084 7/7、TypeScript、targeted ESLint、`build:test` 與 `output/playwright/dev-085-mindmap-relationship-direction-joysticks/result.json`。
  - 計入交付：是（local implementation + QA/QC；未 Release）
- ✓ DEV-086 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 全域工作台子樹暫存與跨看板搬移
  - 摘要：桌機 pointer 與手機長按 touch 都可把看板 L1／L2／L3+ 的完整父子樹拖入帳號級全域未歸位區，切換目的看板後再整棵歸位；保留任務 ID 與 parent links，已歸位清單仍唯讀不可拖。未歸位 UI 採精簡 L3+ 段落與直接共用看板 `KanbanInsertionMarker` 的 append 定位線；手機不新增 subtree hover，也不開放清單／甘特／日曆模式。
  - 來源 ID：`USER-20260825-GLOBAL-WORKBENCH-SUBTREE-STAGING`、response annotations、`USER-20260825-UNPLACED-INSERTION-PREVIEW`。
  - 父任務：DEV-039；相容 DEV-044、DEV-053、DEV-065。
  - 下一步：若要正式交付，另走 deployment/release gate；本輪不 commit、push、deploy 或 release。
  - Spec Impact：`Intentional replacement`；把原 desktop-only 反向 staging 契約擴至手機 touch，但不改 schema、API、permission、task identity 或 placed-row read-only 契約。
  - 證據：`SPEC-086`、`QA-DEV-086`、`QC-DEV-086`、DEV-086 static／browser PASS（desktop pointer＋390px／320px touch）、DEV-039 31/31＋browser PASS、DEV-053 30/30、DEV-054 46/46、DEV-065 40 checks、TypeScript、`build:test` 與 desktop／mobile `output/playwright/dev-086` 截圖。
  - 計入交付：是（local implementation + QA/QC；未 Release）
- ✓ DEV-087 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 跨模式任務階層縮排一致化
  - 摘要：以單一 token 將看板 L3+、清單、甘特與日曆左側清單的每層 title X 位移統一為 desktop 6px／≤767px 5px，保留各模式原有 base inset、字級、列高與操作面。
  - 來源 ID：`USER-20260825-CROSS-VIEW-HIERARCHY-INDENT`、response annotation 1。
  - 父任務：DEV-001、DEV-086；Intentional replacement DEV-081 hierarchy indent exception。
  - 下一步：若要正式交付，另走 deployment/release gate；本輪不 commit、push、deploy 或 release。
  - Spec Impact：`Intentional replacement / cross-view consolidation`；只取代分散的 20px／14px／35px depth increment，不改資料、排序、拖曳、字級、列高或權限。
  - 證據：`SPEC-001`、`SPEC-081`、DEV-087 static 9/9、browser 8/8、DEV-081 static 32/32＋browser 10/10、DEV-086 static／browser PASS、TypeScript、`output/playwright/dev-087/result.json` 與八張截圖。
  - 計入交付：是（local implementation + QA/QC；未 Release）
- ✓ DEV-088 [交付點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 任務完成、封存與永久刪除生命週期
  - 摘要：採用「完成／取消完成 → 封存 → 永久刪除」；active 任務表面只提供可還原封存，永久刪除只在目前看板回收桶確認後執行，並修正回收桶原本誤呼叫軟封存的資料缺口。
  - 來源 ID：`USER-20260825-TASK-LIFECYCLE-COMPLETE-ARCHIVE-DELETE`
  - 父任務：DEV-029、DEV-038、DEV-044、DEV-062、DEV-070
  - 下一步：若要正式交付，另走 deployment/release gate 並驗證 production backend 的不可逆刪除邊界；本輪不 deploy 或 release。
  - Spec Impact：`Intentional replacement`；以 SPEC-088 取代舊「刪除任務＝isArchived」UI／action 語意，不改 schema 或 permission source。
  - 證據：`SPEC-088`、`QA-DEV-088`、`QC-DEV-088`、DEV-088 static／browser PASS、TypeScript、build:test 與 targeted regression PASS。
  - 計入交付：是（local implementation + QA/QC；未 Release）
- ◐ DEV-089 [開發點] [執行中] [P0] [Production Reopen / Rework 1 RD Implementation Ready / Stop-Ship] 全域工作台權威任務搬移交易
  - 摘要：production 證實「未歸位→看板」在 RPC 前被混合 ownership batch 拒絕；重構為共用 `MoveTaskSubtreeCommand v2`，由 server 依完整 PlacementScope 鎖定目的 siblings 並回傳 canonical order，失敗保留完整來源子樹。
  - 來源 ID：`USER-20260825-TASK-PLACEMENT-MOBILE-DIVERGENCE`、`USER-20260825-CAPA-COMPLETE`、`USER-20260826-UNPLACED-TO-BOARD-SCOPE-LEAK`、`USER-20260826-RD-ARCHITECTURE-REVIEW`。
  - 父任務：DEV-086、DEV-039；CAPA：`CAPA-20260825-01`。
  - 下一步：RD 依 SPEC-089 Rework 1 完成 WP1-WP6；QA 執行 scope property、DB01-DB04、桌機／手機雙向與 Level 3；完成前禁止 production release。
  - Spec Impact：`Compatible corrective amendment + Intentional replacement`；保留 v1 transaction invariants，但以 v2 intent command 取代跨 ownership generic node batch／client sibling order。
  - 證據：production toast、browser boundary error、operation ledger=0、canonical來源保留與 parent-only root bucket code trace；2026-08-25 Local／TEST／單向 Level 3 只列歷史基線，不再構成現行 PASS。
  - 計入交付：否（Rework 未實作、QA/QC 未通過、production stop-ship）
- ✓ DEV-090 [交付點] [P1] [RD Implemented / Local QA-QC PASS / Not Released / Release Gate Required] 預設全顯示與帳號看板篩選一致性
  - 摘要：將未設定篩選改為全部任務，以專用 RLS 資料列保存個人帳號 × 看板偏好，並讓五種板內模式共用 canonical matched identities 與 ancestor-aware projection。
  - 來源 ID：`USER-20260826-FILTER-DEFAULT-SHOW-ALL`、
    `USER-20260826-ACCOUNT-FILTER-PREFERENCES`、`PROD-20260826-CROSS-MODE-FILTER-EMPTY`。
  - 父任務：DEV-039；相容 DEV-028、DEV-045、DEV-062。
  - 下一步：如需正式上線，另啟 deployment/release gate 執行 remote migration、deploy與 authenticated smoke；本輪不自動進入release。
  - 執行邊界：可修改本地產品、forward-only migration file與測試；不得套用 remote migration、修改正式資料、deploy或release。
  - 證據：`SPEC-039` DEV-090 addendum、`ADR-045`、`QA-DEV-090`、`QC-DEV-090`；contract 10/10、projection 5/5、isolated PostgreSQL RLS、五模式browser、390×844、targeted regressions、TypeScript與build全部PASS。
  - 計入交付：是
- ✓ DEV-091 [開發點] [完成] [P1] [Local QA-QC PASS / 未 Release] 工作台上下區域高度調整與帳號偏好
  - 摘要：在未歸位與已歸位之間加入可上下拖曳、可鍵盤操作的分隔線，並以登入帳號保存兩區比例。
  - 來源 ID：`USER-20260827-TASK-WORKBENCH-Y-SPLIT`
  - 父任務：DEV-039
  - 證據：`SPEC-039` DEV-091 addendum、`QA-DEV-091`、`QC-DEV-091`；static 16 checks、DEV-039 31/31、desktop／390×844 rendered browser、TypeScript、ESLint與build:test全部PASS。
  - 計入交付：否
- ✓ DEV-092 [開發點] [完成] [P2] [Local QA-QC PASS / 未 Release] 會議紀錄側欄資訊精簡
  - 摘要：依瀏覽器留言移除裝飾性標題 icon、說明入口、會議流程標題與輔助說明、各階段 icon／副標題、AI badge與常駐成功 checkpoint 文案；新會議標題固定為「會議紀錄」，紀錄時間改為 24 小時制；會議標題與紀錄時間同列；收合控制改用全域工作台同款方向並移到右側抽屜最左側，會議空白關聯任務不再顯示選取 action。
  - 來源 ID：`USER-20260827-RECORD-SIDEBAR-QUIETNESS`
  - 父任務：DEV-020
  - 證據：`SPEC-020` UI 精簡 addendum、`QA-DEV-092`、`QC-DEV-092`；static 43 checks、1440×900／390×844 rendered browser、內容區剩餘高度／最小高度與不重疊、收合／展開、表單同列與緊湊控制列、空白狀態檢查、TypeScript、ESLint與git diff --check PASS。
  - 計入交付：否
- ⊘ DEV-093 [交付點] [已撤銷] [P1] [Removed by DEV-104 / Never Released] 收藏任務與子任務資產化
  - 摘要：依使用者決策停止開發；產品程式、provider、權限、migration、驗證腳本與現行規格已由 DEV-104 移除。
  - 資料邊界：`20260828090000` 未進入共享 local／remote migration history，因此不執行資料庫回滾或 migration repair。
  - 證據：`SPEC-104`、`QA-DEV-104`、`QC-DEV-104`。
  - 計入交付：否
- ◐ DEV-094 [開發點] [開發中] [P1] [RD Implementation In Progress / Human Confirmed / static＋pure＋browser smoke PASS / QA・QC NOT RUN / 未 Release] 免匯入直接會議速記
  - 摘要：新會議直接聚焦內容；`速記` 只聚焦；`帶入上次會議後變更` 依上次已發布成功截止點
    至本次點擊時間一鍵加入 delta。首次回溯七天，另提供可覆寫下次截止點的低頻自訂日期；
    會議內容下方保留 `存草稿`；`發布` 只由會議 workflow 提供。
  - 來源 ID：`USER-20260828-MEETING-DIRECT-NOTE-WITHOUT-IMPORT`、response annotation 1。
  - 父任務：DEV-020；相容 DEV-018、DEV-019、DEV-023、DEV-069、DEV-092。
  - 下一步：補齊 QA-DEV-094 TC-094-001～020 與 ROT-094-001～008 的完整 evidence，再交獨立 QA/QC；不直接進 release。
  - Spec Impact：`Compatible corrective addendum + intentional meeting-import interaction replacement`；落實既有「匯入 optional、可直接速記」契約，並取代 meeting 固定日期／必經設定互動；work-log 匯入維持。
  - 證據：`src/utils/meetingProjectChangeImport.ts`、`MeetingProjectChangeImportControl.tsx`、store focus／atomic import／publish projection、local-test／Supabase exclusive boundary、`scripts/verify-dev-094-meeting-direct-note.mjs` 13 checks、`scripts/verify-dev-094-meeting-direct-note.pure.ts` 7 checks、`output/qa/dev-094/result.json`、`output/qa/dev-094/pure-result.json`、1440×900 browser smoke 截圖／artifact `output/playwright/dev-094/desktop-no-import.png`／`result.json`、390×844 negative `mobile-meeting-negative.png`、TypeScript、targeted ESLint、`npm.cmd run build:test`、DEV-020／023／092 static regressions；完整 QA/QC、Firebase negative與 release 仍未完成。
  - 計入交付：是（implementation smoke 完成；完整 QA／QC 未完成，對完成率貢獻仍為 0）
- ◇ DEV-095 [交付點] [驗證中] [P1] [Local Interaction Parity QA-QC PASS / Supabase TEST 未執行 / 未 Release] 任務追蹤副本與跨看板多重投影
  - 摘要：任務保留單一 canonical 身分與主要父任務；追蹤副本除外層虛線與 placement command route 外，必須與正本共用相同 surface view、點擊／右鍵 interaction、pointer／keyboard／mobile DnD 與 recursive 子任務 tree。
  - 來源 ID：`USER-20260828-TASK-TRACKING-COPY-MULTI-BOARD-PROJECTION`
  - 相容任務：DEV-036、DEV-039、DEV-044、DEV-086、DEV-088、DEV-089。
  - 下一步：本地interaction parity已完成；待release授權後先對齊remote migration history、受控套用Supabase TEST schema並執行T01～T09兩使用者RLS／Realtime readback，再進deployment/release gate。
  - 阻塞 / 恢復條件：目前 TEST read-only preflight 已驗證 authentication／scope，但 capability RPC、`wbs_item_placements` 與 projection RPC 尚未存在；另 `supabase db push --dry-run --linked` 因 `LegacyDbPushMissingLocalError` 拒絕（remote 有 3 筆 local 缺少的 migration，DEV-093／DEV-095 等 local migration 尚未出現在 remote），未寫入任何遠端資料。待 migration history reconciliation、受控 migration 套用且 read-only readiness probe 通過後，才可恢復 T01～T09 與 release gate。
  - 進度：已移除`TrackingReferenceItem`，primary／tracking共用`TaskSurfaceFrame`、`useTaskPlacementController`、`TaskPlacementTree`與相同List／Kanban／Checklist renderer。S07～S10 4/4、B17～B24 8/8、獨立QC-IP01～08 8/8、cross-mode 12/12、backup 4/4、TypeScript、targeted ESLint 0 error與build均PASS；最新證據含390／320 short-tap／scroll negative、long-press commit、兩層subtree、capability revoke、stale revision及provider fault。
  - Spec Impact：`Compatible product extension + Intentional data-model expansion + Intentional interaction-contract replacement`；
    保留 DEV-089 單一 canonical ownership，但實作時必須拆開 task identity 與
    placement identity，不得複製任務列或以 `parentIds[]` 代替。
  - 證據：current `output/qa/dev-095/interaction-parity-source-result.json`、`output/playwright/dev-095/interaction-parity-result.json`、三張1440／390／320 PNG及`output/qc/dev-095/interaction-parity-qc-result.json`；historical model／DB／B01～B16另保留。Supabase TEST／migration history與release阻塞維持原紀錄。
  - 計入交付：是（本地interaction slice已完成；整體交付仍待Supabase TEST與release gate，不標為完成）
- ✓ DEV-096 [交付點] [完成] [P0] [RD Implemented / Local QA-QC PASS / 未 Release] PWA 更新交易收斂與提示精簡
  - 摘要：以持久化 transaction、owner fence、Web Locks＋PWA-owned IndexedDB 原子鎖、waiting-worker retarget、controllerchange reload fallback 與 post-reload current/target 對帳，修正一次更新後同版本提示又出現、需連續按數次的問題；同時依使用者紅線指示移除一般更新提示的圖示與說明，將 CTA 縮為「一鍵更新」並壓縮留白。
  - 來源 ID：`USER-20260830-PWA-UPDATE-REPEATED-PROMPT-AND-COMPACT-UI`
  - 父任務：DEV-041；相容 DEV-034。
  - 下一步：如需正式上線，另行授權 deployment/release gate；本輪不 commit、merge、push、deploy 或 release。
  - 證據：`src/services/pwaUpdateTransaction.ts`、`src/services/pwaUpdateService.ts`、`src/components/AppUpdatePrompt.tsx`、`vite.config.js`、`scripts/verify-dev-096-pwa-update-transaction-convergence.*`、`QA-DEV-096`、`QC-DEV-096`；static 25/25、local UI browser、real SW A/B/C＋雙分頁＋retarget、DEV-041／034 regression、TypeScript、build:test、artifact parity 與 targeted ESLint 均 PASS。
  - 計入交付：是（本地 implementation + QA/QC；未 Release）
- ◐ DEV-097 [交付點] [驗證中] [P1] [RD Implemented / Local Automated QA + Independent QC PASS / Physical Device Supplemental Not Verified / 未 Release] PWA 安全重新載入協調
  - 摘要：把更新機制從「請使用者同意取得新版」改為只在可能中斷工作時協調 reload；
    safe client 於自然邊界靜默收斂，dirty／unsafe client 才顯示最小提示。
  - 來源 ID：`USER-20260831-PWA-SAFE-RELOAD-DESIGN-CRITIQUE`
  - 父任務：DEV-041；建立於 DEV-096 的版本真值與單次 activation transaction，架構決策見 ADR-047。
  - 下一步：補DEV-054 iOS／Android實機，或確認不納入本次release；若需正式上線，另走deployment/release gate。
  - 證據：`ADR-047`、`SPEC-041` DEV-097 addendum、`QA-DEV-097`、`QC-DEV-097`；static 23/23、真實九-owner／dual-tab／flush-cancel-failure readback browser、real-SW A→B→C two-tab convergence、DEV-028／034／041／045／047／054／069／092／095／RAG regressions、TypeScript、32-file ESLint 0 errors、`build:test`與`git diff --check` PASS。
  - 計入交付：是（RD已實作且local automated QA／independent QC PASS；實機補充與release gate尚未完成，對完成率貢獻仍為0）
- ◐ DEV-098 [交付點] [驗證中] [P1] [RD Implemented / Core Local QA-QC PASS / Adjacent Regression Audit PASS / Persistence Re-development Gate Pending / 未 Release] 任務明細子任務管理區
  - 摘要：在任務明細底部加入預設展開、可收合的子任務樹，與看板 L3+ 共用任務列、
    interaction controller 與 placement commit；支援編輯入口、明細導航、右鍵及桌機／手機／鍵盤拖曳。
  - 來源 ID：`USER-20260901-TASK-DETAIL-SUBTASK-SURFACE`
  - 父任務：DEV-028、DEV-046、DEV-070；相容 DEV-053、DEV-089、DEV-095。
  - 執行文件：`SPEC-098-task-detail-subtask-management.md`、`QA-DEV-098-task-detail-subtask-management.md`。
  - 下一步：任務儲存可靠性必須依 DEV-099 的最小 capsule 從目前程式重新設計與驗證；既有 DEV-098 callback-only evidence 不作 persistence release authority。實機 supplemental 與 release 另走對應 gate。
  - 證據：`SPEC-098`、`QA-DEV-098`、`QC-DEV-098`；`verify:dev-098-task-detail-subtasks` 22/22、pure P01～P10 10/10、DEV-098 browser B01～B16 16/16、diagnostics 0；獨立 QC-098-01～10 10/10；`npx tsc --noEmit`、`build:test`；DEV-046 static/browser 32/32＋5/5、DEV-053 31/31＋10/10、DEV-055 34/34＋18/18、DEV-095 4/4；完整 disposition 見 `output/qa/dev-098/adjacent-audit-final-20260902.json`，基線摘要見 `output/qa/dev-098/baseline-audit.json`，QC artifact 見 `output/qc/dev-098/task-detail-subtasks-qc-result.json`。
  - 計入交付：是（local implementation、核心 QA/QC 與指定相鄰 regression 已完成；儲存可靠性重開發、實機 supplemental 與 release gate 未完成，完成率仍依專案規則處理）
- ↷ DEV-099 [交付點] [延後] [P1] [舊實作已放棄 / Brief Ready / 重新開發需另行授權 / 禁止發版] 任務儲存可靠性重新設計
  - 摘要：舊候選實作、整合方式及驗證證據已依使用者決策全部放棄；未來只從目前分支與當時正式環境重新盤點，不沿用舊程式或舊設計。
  - 來源 ID：`USER-20260910-CLEAN-REDEVELOP`
  - 父任務：相容 DEV-057、DEV-097、DEV-098。
  - 下一步：只有使用者重新啟動時，才依目前程式與正式環境建立全新的 RD contract、實作及 QA/QC。
  - 阻塞 / 恢復條件：重新開發完成前，不得把目前分支視為此問題的 release-ready source；不得以已放棄的實作或證據作為驗收依據。
  - 證據：本索引的最小重開發驗收契約；無舊分支、commit、worktree 或測試 artifact 依賴。
  - 計入交付：是（延後，完成率貢獻 0）
- ↷ DEV-100 [交付點] [待排] [P1] [Future Phase Captured / Lane 3 / Not Requested] 一般任務建立重試冪等
  - 摘要：為一般任務create建立可證明的operation identity與冪等replay，避免使用者在狀態未知下合理重試時產生第二筆資料。
  - 來源 ID：`USER-20260902-TASK-CREATE-RETRY-DUPLICATE`；使用者已確認第二筆「大陸PCT」是其重試產物。
  - 下一步：重啟時先確認同一次操作的key lifetime、跨分頁與response-lost語意，再建立Lane 3 SPEC／QA與DB方案；不得以title／parent／時間窗猜測重複。
  - 阻塞 / 恢復條件：需PM／使用者另行啟動實作，並核准schema／RPC／migration與TEST rehearsal邊界。
  - 證據：使用者回報；尚無 implementation 或 QA evidence。
  - 計入交付：是（future phase，完成率貢獻0）
- ↷ DEV-101 [交付點] [待排] [P1] [Future Phase Captured / Lane 3 / Independent Closure] 任務排序整數契約
  - 摘要：修正前端可產生fractional order、DB `bigint`拒絕`8.5`的已確認系統缺陷；與永久saving事故保持獨立因果與closure。
  - 來源 ID：`PRODUCTION-POSTGRES-20260902-ORDER-BIGINT-EVIDENCE`。
  - 下一步：重啟時盤點全部order writers並決定bigint-compatible integer canonical order或經核准的numeric migration；目前建議integer方案。
  - 阻塞 / 恢復條件：需RD lead／DB owner完成資料契約決策與Lane 3 migration impact、backup／rollback review。
  - 證據：production Postgres 2026-09-02 09:11:13 記錄；事故 operation linkage 未確認，尚無 implementation 或 QA evidence。
  - 計入交付：是（future phase，完成率貢獻0）

- ☑ DEV-102 [交付點] [已實作] [P1] [Implemented / Local Automated QA-QC Passed / Tech Lead Reviewed R3 + UI Follow-up / Human Confirmed / Local-only / 未 Release] 心智圖矩形圈選、多選右鍵與剪貼操作
  - 摘要：心智圖新增desktop矩形圈選與private multi-selection authority；以心智圖專屬右鍵presenter只顯示當下可執行動作，支援批次指派／封存，以及copy／cut共用in-app clipboard後於exact任務anchor貼在其後；不可用action不進入選單。
  - 來源 ID：`USER-20260903-MINDMAP-MARQUEE-MULTISELECT-CLIPBOARD`。
  - 父任務：DEV-027、DEV-028、DEV-070；相容DEV-013、DEV-048、DEV-074、DEV-075、DEV-079、DEV-084、DEV-088、DEV-095。
  - Spec Impact：`Intentional replacement + compatible extension`；只取代DEV-075單選cardinality與心智圖immediate duplicate入口，保留其keyed store／效能authority；DEV-076左鍵抓圖平移維持放棄。
  - 下一步：本機開發交付已結束；若要上線，另進release gate，補正式provider／權限／production-bound smoke後才可deploy。
  - Release boundary：未執行commit、push、PR、deploy、production mutation、正式provider transaction或跨裝置驗證；維持未Release。
  - 證據：SPEC-102、QA-DEV-102、QC-DEV-102、RD Tech Lead R1／R2／R3與`output/playwright/dev-102-mindmap-marquee-multiselect-clipboard/result.json`；local gates PASS。
  - 計入交付：是（本機產品交付完成率100；release完成率0）

- ⊘ DEV-103 [交付點] [已撤銷] [P1] [Removed by DEV-104 / Never Released] 工作區收藏任務系統看板
  - 摘要：依使用者決策停止開發，未追蹤的系統看板實作、migration與驗證資產已刪除。
  - 父任務：DEV-093（同時撤銷）。
  - 計入交付：否

- ✓ DEV-104 [開發點] [完成] [P1] [Implemented / Local QA-QC Passed / Never Released] 完整移除收藏任務功能
  - 摘要：移除 DEV-093／DEV-103 的 UI、domain/store、權限與 action、Local Test／Firebase／Supabase 接線、migration 與專屬驗證資產；紀錄庫只保留會議紀錄與個人工作紀錄。
  - Spec Impact：`Intentional replacement / feature retirement`。
  - 資料邊界：共享 local／remote migration history 均未套用 DEV-093／103，不做遠端 DDL、資料刪除或 migration history repair。
  - 證據：`SPEC-104`、`QA-DEV-104`、`QC-DEV-104`；TypeScript、build、static residual scan與實際瀏覽器回歸。
  - 計入交付：否（退場工作，不新增產品能力）
- ○ DEV-105 [交付點] [待排] [P1] [Brief Ready / Human Confirmed] 會議任務討論時間預約
  - 摘要：主持人在會議模式從任務右鍵選單填入單一預約數字；有值時在任務截止日後、展開按鈕前顯示純數字標記，沒有值時不顯示。
  - 來源 ID：`USER-20260904-MEETING-TASK-RESERVATION-NUMBER`
  - 父任務：DEV-005
  - 相容任務：DEV-007、DEV-070
  - 下一步：使用者要求開始實作時，將同一 DEV 補到 `RD Contract Ready`，確認主持人身分來源、會議範圍資料生命週期與持久化邊界後交 RD 評估。
  - 阻塞 / 恢復條件：目前無 Brief blocker；未達 `RD Contract Ready` 前不得直接修改產品程式或資料結構。
  - 證據：本文件 `DEV-105` 詳細段落；使用者於 2026-09-04 確認 UI、權限與排除範圍。
  - 計入交付：是（Brief 階段，完成率貢獻 0）

- ✓ DEV-106 [交付點] [完成] [P1] [Phase 0 Implemented / QA-QC PASS / Phase 1 Contract Ready / NOT RELEASED] 會議安全草稿、結束與待整理生命週期
  - 摘要：本機 recovery、transaction commit truth、離開前 force-flush、明確 discard 與 provider 0 recovery request；Phase 1 cloud／跨裝置／待整理維持 future capsule。
  - 證據：`SPEC-106`、`QA-DEV-106`、`QC-DEV-106`；static PASS、browser 14/14 PASS。
  - 計入交付：否（正式 release 另需 release gate）

- ✓ DEV-107 [開發點] [完成] [P1] [Implemented / Targeted QA-QC PASS / Local-only / NOT RELEASED] 會議草稿側欄模式與排版收斂
  - 摘要：以單一 composer variant 修正既有 meeting record 誤顯示個人流程、draft/recent 重疊、editor resize 與 drawer scroll responsibility。
  - 父任務：DEV-020；corrective follow-up DEV-092；相容 DEV-019、DEV-094、DEV-106。
  - 證據：DEV-107 static 20/20、browser 5/5；DEV-020／092／094／106 targeted regression、TypeScript、targeted ESLint、build:test、diff check PASS；詳見 `QC-DEV-107-record-sidebar-draft-layout.md`。
  - 計入交付：否（Local-only；release candidate 需另走完整 QA matrix 與 release gate）

- ✓ DEV-108 [交付點] [完成] [P1] [Implemented / QA-QC PASS / Local-only / NOT RELEASED] 任務明細會議補記持續呈現
  - 摘要：任務明細的人工會議補記加入後立即顯示，會議結束後仍以緊湊純文字列表留在第一層；預設顯示最新三筆並可原地展開。
  - 來源 ID：`USER-20260907-TASK-DETAIL-MEETING-NOTE-PERSISTENT-LIST`
  - 父任務：DEV-009；相容 DEV-008 保留的片段解析、DEV-066、DEV-106。
  - 下一步：若納入 release candidate，依 `QA-DEV-108` 重跑完整 matrix 並交 release gate；目前不自動 deploy。
  - 阻塞 / 恢復條件：Local-only 已通過；若 release 前發現 provider/RLS、正式資料或權限變更需求，停止並回 PM 升級風險。
  - 證據：`SPEC-108`、`QA-DEV-108`、`RD-TECH-LEAD-REVIEW-DEV-108`、`QC-DEV-108`；static 16 assertions、browser B01～B09、DEV-008／009／024／066／105／106／107 targeted regression、TypeScript、targeted ESLint、build:test、`git diff --check` PASS。
  - 計入交付：是（Local implementation 完成；正式 release 另需 gate）

- ◐ DEV-109 [開發點] [開發中] [P1] [Implemented Candidate / QA-QC Pending / NOT RELEASED] 會議期間看板變更即時記錄與 AI 整理修復
  - 摘要：會議功能開啟後，有意義的看板變更須即時成為目前會議紀錄內容；AI 只重新整理既有會議內容，不回溯匯入過去專案變更。
  - 來源 ID：`USER-20260907-MEETING-PROJECT-CHANGE-IMPORT-QUALITY-GATE-GAP`、`USER-20260908-LIVE-MEETING-CHANGE-CAPTURE-AI-ORGANIZE-ONLY`
  - 父任務：DEV-007；相容 DEV-011、DEV-012、DEV-020、DEV-021、DEV-022、DEV-024、DEV-094。
  - 下一步：QA 依 `QA-DEV-109` 執行完整 deterministic、browser、failure injection 與 targeted regression gate；正式 release 另走 deployment gate。
  - 阻塞 / 恢復條件：無 P0/P1 產品決策或工程契約阻塞；candidate implementation 與 smoke 已完成，但尚未標 QA PASS 或 release ready。
  - 證據：`SPEC-109`、`QA-DEV-109`、`RD-TECH-LEAD-REVIEW-DEV-109`、SPEC-007／011／012／020／069／106 定向修訂；deterministic verifier、TypeScript、targeted ESLint、build:test 與 DEV-109 browser B01～B04 artifact 已通過。
  - 計入交付：否（DEV-007 corrective 開發點）

- ◐ DEV-110 [開發點] [驗證中] [P1] [RD Implementation Complete / QA PASS with evidence boundary / L3 Pending / NOT RELEASED] 未歸位任務會議紀錄邊界修正
  - 摘要：阻止account-unplaced與跨板tracking reference誤入project-scoped會議紀錄讀寫，並將Supabase unresolved task link由silent skip改為mutation前拒絕。
  - 來源 ID：`CAPA-DRAFT-20260908-unplaced-task-meeting-record-boundary`、`USER-20260908-CAPA-RD-IMPLEMENTATION-READY`。
  - 父任務：DEV-108；相容DEV-009、DEV-039、DEV-095。
  - 下一步：完成L3 preview同版證據與production-bound candidate；不得啟動正式流量。
  - 阻塞 / 恢復條件：無P0/P1工程阻塞；若需unplaced record schema、跨project link、transactional RPC、production mutation或migration apply，停止並回PM。
  - 證據：`SPEC-110`、`QA-DEV-110`、`QC-DEV-110`、CAPA draft；DEV-110 static 19/19、browser B01～B04、
    DEV-108 static 16 assertions＋browser B01～B09、DEV-095 source/cross-mode/browser、Supabase TEST T00～T07 10/10、
    TypeScript、`verify:source`與`git diff --check` PASS；B05/B06保留deterministic／TEST evidence boundary。
  - 計入交付：否（DEV-108 corrective開發點；文件ready不算產品完成）

- ✓ DEV-111 [交付點] [完成] [P2] [Local QA-QC PASS / NOT RELEASED] 任務說明跨閱讀模式懸浮視窗
  - 摘要：沿用既有任務說明；桌面滑鼠停留任務 1 秒後，在看板、清單、心智圖、甘特圖與行事曆顯示
    同一款 viewport-bounded 純文字懸浮視窗；非空任務另以 9px 圖示／11px 槽位提示內容存在，看板與清單
    仍直接引用選取預覽藍框 surface 作啟動範圍。
  - 來源 ID：`USER-20260908-TASK-DESCRIPTION-HOVER-CARD-ALL-READING-MODES`。
  - 相容任務：DEV-028、DEV-065、DEV-066、DEV-070。
  - 下一步：若納入正式版本，另走 release gate；目前不自動 deploy。
  - 證據：`SPEC-111`、`QA-DEV-111`、`QC-DEV-111`；static 38/38、browser 34/34、DEV-028
    static/browser、DEV-066、TypeScript、targeted ESLint、test build、diff check PASS。
  - 計入交付：是（Local implementation 完成；正式 release 另需 gate）

- ✓ DEV-112 [開發點] [完成] [P2] [Local QA-QC PASS / NOT RELEASED] 任務詳情基本資料列對齊
  - 摘要：整理任務詳情的狀態、日期與主責／協作區；三個標籤與控制項共用基線，日期箭頭左右留白對稱，日期與工期不再靠 grid overflow 接合。
  - 來源 ID：`USER-20260909-TASK-DETAIL-METADATA-ALIGNMENT`。
  - 父任務：DEV-028；相容 DEV-031、DEV-066、DEV-098。
  - 下一步：若納入正式版本，另走 release gate；目前不自動 deploy。
  - 證據：`SPEC-112`、`QA-DEV-112`、`QC-DEV-112`；DEV-112 static 10/10、DEV-028 static 48/48＋browser PASS、TypeScript、targeted ESLint、test build、1298×698 in-app browser geometry／visible-error QC PASS。
  - 限制：舊 `verify-task-details-mobile-meta-layout-browser.pw.js` 在進入 metadata 驗證前等待既有 `data-task-record-timeline-actions` fixture timeout；不改寫成通過，也不歸因於本次桌機 class-only 修正。
  - 計入交付：是（Local desktop layout refinement 完成；正式 release 另需 gate）

- ✓ DEV-113 [開發點] [完成] [P2] [Local QA-QC PASS / NOT RELEASED] 任務說明單行預設與底邊縱向尺寸
  - 摘要：任務說明編輯器預設只占一行，內容增加時自動增高完整顯示；拖曳底部整條框線只調整該帳號、該任務、該備註欄的高度，不再由同看板所有任務共用。
  - 來源 ID：`USER-20260909-TASK-NOTE-COMPACT-AUTOSIZE-WIDTH-PREFERENCE`、`USER-20260909-TASK-NOTE-VERTICAL-BOTTOM-EDGE-RESIZE`、`USER-20260910-TASK-NOTE-HEIGHT-ACCOUNT-TASK-SCOPE`。
  - 父任務：DEV-066；相容 DEV-028、DEV-111。
  - 下一步：若納入正式版本，另走 release gate；目前不自動 deploy。
  - 證據：`SPEC-113`、`QA-DEV-113`、`QC-DEV-113`；static 15/15、browser 15/15、任務 A／任務目的 `204px` 重開讀回、同任務其他備註與任務 B 均為 `36px`、808×698 無水平 overflow、TypeScript、targeted ESLint 與 test build PASS。
  - 限制：高度偏好目前是 browser localStorage 的 `accountId + taskId + noteId` scoped UI preference，不是後端跨裝置同步設定；舊 v1 看板共用偏好不遷移。
  - 計入交付：是（Local implementation 完成；正式 release 另需 gate）

- ✓ DEV-114 [交付點] [完成] [P2] [RD Implementation Complete / Tech Lead Review PASS / QA-QC PASS / NOT RELEASED] 任務說明全介面覆蓋與重複名稱懸浮清理
  - 摘要：把桌面任務說明懸浮視窗延伸至所有持久任務呈現，保留觸控不啟動，並移除只重複顯示
    畫面既有任務名稱／位置的原生 tooltip；操作型 tooltip 與明確點擊 popover 維持不變。
    本次 amendment 另納入 Task Details 的 ancestor breadcrumb 與子任務列，並修正 modal layer 下卡片不可見問題。
  - 來源 ID：`USER-20260909-TASK-DESCRIPTION-GLOBAL-SURFACE-COVERAGE-AND-NAME-TOOLTIP-REMOVAL`。
  - 相容任務：DEV-004／006／020、DEV-028、DEV-039、DEV-045、DEV-065、DEV-066、DEV-070、DEV-088、
    DEV-098、DEV-107、DEV-111。
  - 下一步：DEV-114 candidate 與相容 regression gate 已完成；若要納入正式版本再走 deployment/release gate。
  - 阻塞 / 恢復條件：DEV-114 開發本身無 P0／P1 blocker；若 canonical task ID、controller／mention／RAG contract 漂移，或需修改
    protected structure／data contract，立即停止並回報 PM。正式 release 另依 release gate 判定。
  - 權威文件：`ai-doc/specs/SPEC-114-task-description-global-surfaces.md`、
    `ai-doc/qa/QA-DEV-114-task-description-global-surfaces.md`。
  - 證據：本文件 `DEV-114` 詳細段落、SPEC-114、QA-DEV-114、QC-DEV-114；DEV-114 static 29/29、browser B01～B26＋B02a 27/27（含
    1440×900／1024×768／390×844）、0 browser/page/HTTP error、TypeScript、targeted ESLint（0 error）與 test build PASS；
    DEV-111／028／039／098／045／088／006／107／002 相容 static／browser gates PASS。
  - 計入交付：是（Local implementation 與相容 regression 完成；正式 release 另走 deployment/release gate）

- ☑ DEV-115 [交付點] [完成] [P1] [CAPA-002 / RD Implementation Complete / Targeted QA-QC PASS / NOT RELEASED] 空白任務建立契約與任務說明污染修正
  - 摘要：修正工作台空白新增把「新任務」寫入任務說明，並以共用 domain factory 統一 11 個空白建立點；
    capture／clone／import 維持來源語意分流，不合併成大型 UI 元件。
  - 來源 ID：`CAPA-002`、`USER-20260909-BLANK-TASK-DESCRIPTION-PREFILL-CAPA`。
  - 下一步：若要納入正式版本，執行 deployment/release gate；並於 release 後依 CAPA-002 完成 permission／mobile smoke、
    歷史資料 dry-run 與 effectiveness E-02／E-03。
  - 阻塞 / 恢復條件：若 shared factory 必須接管 placement、permission、UI navigation、capture／clone／import
    content，立即停止並回規劃模型；歷史資料 provenance 不阻擋本 DEV，任何清理仍不得執行。
  - 證據：CAPA-002、ADR-048、SPEC-115、QA-DEV-115、QC-DEV-115；static 17/17、browser B01～B09、相容 regression、
    TypeScript、targeted ESLint、test build 與 diff gate PASS；permission／mobile／production evidence 與 effectiveness 仍待 gate。
  - 計入交付：是（Local implementation 與 targeted QA-QC 完成；正式 release 另走 deployment/release gate）

- ✓ DEV-116 [交付點] [完成] [P1] [Interaction parity implemented / Targeted QA-QC PASS / NOT RELEASED] 全層級 OKR 模式與自適應留白閱讀
  - 摘要：新增以目標與方向為主的閱讀模式，直接呈現各層任務自己的任務說明與 scope 內全部會議紀錄補記；
    空白內容不占位，父層內容可視覺跨列使用連續空白，但不得形成資料繼承或限制任務編輯。
  - 來源 ID：`USER-20260909-OKR-GOAL-MODE-ADAPTIVE-SPARSE-LAYOUT`、
    `USER-20260910-REMOVE-INLINE-ADD-DESCRIPTION-RECORD-ACTIONS`、
    `USER-20260910-DEV116-MOBILE-RECORD-LAYER-DECISIONS`、
     `USER-20260910-DEV116-RD-CONTRACT-UPGRADE`、
     `USER-20260910-DEV116-ARCHITECTURE-CONFIRMATION`、
     `USER-20260910-GOAL-LIST-TASK-CAPABILITY-PARITY`、
     `USER-20260910-GOAL-BOARD-CONTEXT-MENU-PARITY`、
     `USER-20260910-GOAL-STICKY-DARK-HEADER`、
     `USER-20260910-GOAL-FLAT-HEADER-LABELS`、
     `USER-20260910-GOAL-PROGRESS-LIST-ONLY`、
     `USER-20260910-GOAL-TASK-COLUMN-30PCT`。
  - 相容任務：DEV-039、DEV-070、DEV-095、DEV-108、DEV-111、DEV-114、DEV-115、DEV-117。
  - 結果：interaction parity amendment已完成；List／Goal只共用階層display primitive，Goal自行組裝
    tag／planning controls／desktop DnD與PWA owner，進度條／百分比維持List presenter；OKR任務名稱區的右鍵／`Shift+F10`則與Board
    共用同一profile、`GlobalContextMenu`／`TaskActionMenu`、catalog／guards／commands，未新增第二套menu。
  - UI補強：使用者可見模式名稱改為「OKR模式」並保留 internal `goal` value；表頭、資料cell、每列與外框補上低對比完整格線，
    用於辨識欄位與rowSpan跨度；欄名改為「任務名稱」、
    「任務目的」與「會議紀錄」；並拆除表格卡片式外框、任務名稱／說明的非必要包裹層及重複頁內介紹 header，表格直接銜接
    全域 topbar。ModeSwitcher 也移除可見「切換模式」標題列與關閉叉號，保留非視覺 menu name、Escape／外部點擊／trigger
    關閉與焦點回復；`清除篩選`只在 filtered-zero 狀態就地顯示，保留必要復原能力而不常駐占位。
    欄位表頭改為固定頂部欄、深色不透明底與白字；每個`th`自行sticky並直接承擔欄名，不再包覆內層flex／裝飾容器；任務名稱欄縮為252px（原360px的70%），交會格同時固定top／left並提高層級；
    長任務目的／會議紀錄由owner `td` 內一層必要內容容器承擔Y軸捲動，保留rowSpan、換行、格線與table語意，避免把下方任務推開；
    同一任務的全部補記共用無狀態 `MeetingQuickNoteRows`，不再只顯示最新一筆。
  - 阻塞 / 恢復條件：P0／P1 readiness blocker=0；若第一版要納入手機、tracking references、live meeting
    continuity、新的完整紀錄聚合畫面、schema／provider fetch／權限或跨看板讀取，立即停止並回規劃模型。
  - 證據：SPEC-116、QA-DEV-116、QC-DEV-116、本文件 Architecture Closure Review、SPEC-117／ADR-049 store-owned
    policy amendment；DEV-116 static 28/28、browser 40/40（含 V25 全部補記與欄內Y軸捲動）及DEV-039／046／053／070／097／117回歸PASS。
  - 計入交付：是（local implementation 與 targeted QA-QC 完成；正式 release 另走 deployment/release gate）

- ✓ DEV-117 [交付點] [完成] [P1] [Six-view Amendment Implemented / Targeted QA-QC PASS / NOT RELEASED] 會議紀錄六模式不中斷
  - 摘要：讓同一 active board 的會議 session 可在看板、清單、心智圖、甘特、日曆與OKR模式間持續切換，
    保留同一草稿、右側紀錄欄、recovery 與 live capture segment，不把 view switch 誤當成離開會議。
  - 來源 ID：`USER-20260910-CROSS-MODE-MEETING-CONTINUITY`。
  - 相容任務：DEV-002、DEV-005、DEV-007、DEV-028、DEV-069、DEV-094、DEV-105、DEV-106、DEV-108、
    DEV-109、DEV-116；最新需求有意取代goal-negative邊界，goal加入meeting continuity allowlist。
  - 結果：原五模式DEV-117 targeted QC PASS保留為歷史事實；六模式candidate已完成新revision QA-QC，仍保留 Board-only reservation、mobile 與跨看板 meeting 邊界。
  - 阻塞 / 恢復條件：若需修改 schema／provider／permission／recovery、重建 capture segment、放行跨 board／workspace，
    或無法保留既有 DEV-042 等 user-owned dirty changes，停止並回送規劃模型。
  - 證據：`SPEC-117`、`ADR-049`、`QA-DEV-117`；static／browser artifacts 位於 `output/playwright/dev-117-meeting-continuity/`。
  - 計入交付：是（只有產品實作與 QA/QC 通過後才完成；文件定案不計完成）

- ☑ DEV-118 [開發點] [驗證中] [P2] [RD Implementation Complete / Local Candidate QA-QC PASS / NOT RELEASED] 任務篩選器正向包含邏輯與跨介面共用架構
  - 摘要：統一為「未選不限、選取即包含」；同一條件組 OR、不同條件組 AND。以單一 v5 query、
    純 compile／match 演算法與受控共用 UI 服務 Board／Workbench／Calendar，並修正日期區間、
    未指派、active group count 與既有 v4／Calendar v3 相容遷移。
  - 來源 ID：`USER-20260910-TASK-FILTER-UI-UNIFICATION`、`USER-20260911-TASK-FILTER-LOGIC-ARCHITECTURE`。
  - 父任務：DEV-039；相容 DEV-045、DEV-062、DEV-064。
  - 下一步：等待明確實作指令；接手 RD 必須依凍結的 WP-118-A～F 與 file surface 執行，
    不得重開 filter engine、ownership 或 boolean semantics。遠端 migration／Edge／app 發布仍需獨立 release 指令。
  - 證據：`TaskFilterState`／predicate／summary／v4 preference repository、Workbench v4 local prefs、
    Calendar v3 snapshot／DB validator／Edge matcher與三個 UI consumer 的 2026-09-11 repo 靜態盤點；
    本次未執行產品 QA/QC。
  - 計入交付：否

- ✓ DEV-119 [開發點] [完成] [P1] [Implemented / Targeted QA-QC PASS / NOT RELEASED] OKR 內容儲存格直接編輯與自動展開／收合
  - 摘要：以 Excel／Google Sheets 肌肉記憶為基礎，OKR 任務目的 owner cell 可雙擊內容或 `F2` 就地編輯；
    任務目的／會議紀錄 owner cell 可雙擊底邊完整展開，再執行一次收合並恢復欄內 Y 軸捲動；R10 將 3px 簡約捲軸提升為全系統 CSS 基底，保留隱藏式與甘特圖 12px 例外。
  - 來源 ID：`USER-20260914-GOAL-CELL-DIRECT-EDIT-AUTOFIT-TOGGLE`、`USER-20260914-SYSTEM-SCROLLBAR-FOUNDATION`。
  - 父交付點：DEV-116；保留富文字／Goal／meeting／task menu 權威，PWA 沿用既有 owner。
  - 下一步：保留後續 release gate；本機 candidate 已依 SPEC-119 R5 的 WP-119-A→E 完成實作、編輯行距與收合命中修正及 targeted QA/QC，完整 failure injection／正式環境驗證另案執行。
  - 阻塞 / 恢復條件：目前無未決產品選項；若需超出 SPEC §6 的資料／權限／rowSpan／meeting capture／
    全域 task command 變更，或無法保留既有 dirty baseline，停止並回 PM。
  - 權威文件：`ai-doc/specs/SPEC-119-goal-cell-direct-edit-and-content-fit.md`、
    `ai-doc/qa/QA-DEV-119-goal-cell-direct-edit-and-content-fit.md`。
  - 計入交付：否（本機 candidate targeted QA-QC PASS；未 commit／push／deploy／release）

- ✓ DEV-120 [交付點] [完成] [P1] [Implemented / Targeted QA-QC PASS / NOT RELEASED] OKR 規劃欄極簡高密度介面
  - 摘要：將 OKR 負責人、狀態、日期與工期改為 mounted quiet controls，移除常駐框體、pill 與重複 icon；
    任務名稱固定為資料表格左側 frozen column，其餘欄位由同一 X 軸捲軸移動檢視。
  - 來源 ID：`USER-20260914-OKR-PLANNING-COLUMNS-MINIMAL-DENSITY`、
    `USER-20260914-GOAL-TABLE-FROZEN-TASK-NAME-COLUMN`。
  - 父任務：DEV-116；相容 DEV-119。
  - 下一步：保留獨立 release gate；不得重開 frozen column、單一 native table／X-scroll owner、canonical mutation
    或 Goal-only presentation 邊界。完整 persistence／dependency failure injection、原生瀏覽器 zoom parity 與正式環境驗證另案執行。
  - 阻塞 / 恢復條件：若需修改 projection、GoalCellSessionProvider、schema/API/permission/store/persistence、
    shared default consumer，或 native table 無法達成 sticky／track／a11y 契約，停止並回送規劃模型。
  - 證據：DEV-120 static 13/13、browser 19/19（1440／1298／814 viewport、frozen/X-scroll、quiet chrome、
    native date/status、validation 保值、empty-date focus、lock／due signal、portal、2x zoom、read-only、visible-error sweep）；
    DEV-116 static 30/30＋browser 全案例、DEV-119 static 18/18＋browser 全案例；
    DEV-048 multi-person static、clear-primary browser、TypeScript、ESLint、test build 均通過。證據見
    `output/playwright/dev-120-goal-planning-minimal-density/`、`output/playwright/dev-119-goal-cell-actions/result.json`。
  - 計入交付：是（本機 candidate 已完成實作與 targeted QA-QC；未 commit／push／deploy／release）

- ✓ DEV-121 [交付點] [完成] [P1] [R28 RD Implementation Complete / Targeted QA PASS / QC Ready / NOT RELEASED] OKR 父子任務樹狀對照與群組範圍
  - 摘要：保留任務目的／會議紀錄的 native `rowSpan`，將看板模式的父層錨點、樹狀導引線、
    群組邊界與橫向閱讀導引轉譯到 OKR 表格，降低父子關係及任務欄位比對錯列。
  - 來源 ID：`USER-20260914-GOAL-HIERARCHY-COMPARISON`、
    `USER-20260914-KEEP-GOAL-CONTENT-ROWSPAN`、`USER-20260915-GOAL-CONTENT-REVERSE-LOCATION`、
    `USER-20260915-GOAL-NODE-TOGGLE`。
  - 父任務：DEV-116；延續 DEV-120；相容 DEV-119。
  - 交付結果：已依 [SPEC-121](specs/SPEC-121-goal-hierarchy-comparison-grid.md) 完成 WP-121-A → E，並依
    [QA-DEV-121](qa/QA-DEV-121-goal-hierarchy-comparison-grid.md) 完成同一 candidate 的 static／browser self-test。
  - 阻塞 / 恢復條件：需改 canonical hierarchy／projection、取消或模擬 `rowSpan`、改 content session、
    改 shared default、建立 split table／第二個 X-scroll owner時停止並回送規劃模型。
  - 證據：Architecture Closure R2＋R12 RowSpan Ownership Contrast Closure＋R13 Reverse Content Location Closure＋R14 Scrollable Gridline Scope Closure＋R15 Interactive Tree Node Toggle Closure；DEV-121 static 18/18、browser 28/28；
    DEV-116 30/30＋42/42、DEV-119 18/18＋17/17、DEV-120 13/13＋19/19；rowSpan owner 邊界與 active tint ownership、
    TypeScript、targeted ESLint、test build 與 diff check PASS。
    證據見 `output/playwright/dev-121-goal-hierarchy-comparison/` 及相容 regression output 目錄。
  - 計入交付：是（本機 candidate 已完成實作與 targeted QA；QC Ready；未 commit／push／deploy／release）

- ✓ DEV-122 [交付點] [完成] [P1] [Production Verified with Accepted Exceptions] ProJED 手機零資料載入快速建待辦
  - 摘要：安裝 ProJED 主程式即包含指向 `/quick-task/` 的「快速建待辦」應用程式捷徑；支援的平台可從主程式圖示直接開啟零業務資料載入的名稱輸入，既有第二個獨立快速圖示保留為選用安裝。
  - 來源 ID：`USER-20260914-MOBILE-QUICK-TODO-ZERO-DATA-LOAD`、
    `USER-20260914-MOBILE-QUICK-TODO-DIRECT-VOICE-ENTRY`、`USER-20260914-GUIDED-DECISIONS-1A-2A-3B`。
  - 父任務：DEV-034、DEV-039；相容 DEV-041、DEV-096、DEV-097、DEV-115。
  - 下一步：本次release已結案；accepted residual risks只屬REL-002，後續若要補實機或完整QA/QC，以新的DEV／release範圍處理，不回寫本次未執行案例為PASS。
  - 阻塞 / 恢復條件：若實作需要第二 worker／origin、新 API／schema／RLS、把 root start URL 改成 quick、移除獨立 quick manifest，或以未驗證的平台 UI 宣稱普遍支援，立即停止並回 ADR-050 amendment。
  - 證據：Human Confirmed `1A 2A 3B`、SPEC-122、ADR-050；targeted ESLint、test build、25 項 static、
     quick browser local smoke 15 assertions、root browser R01-R03＋B22-B24、W07 manifest A→B、DEV-034／041 static／browser、DEV-096 static＋browser、DEV-097 static＋browser＋real-SW、DEV-115 static＋browser、isolated PostgreSQL core matrix（22 checks）、固定 fixture pgbench concurrent transport（20 clients／20 rows／0 failed）與 mixed-writer-compatible transport（40 clients／20 Quick RPC＋20 test-only existing append fixture／40 unique orders／0 failed）均 PASS；DEV-096 real-SW目前重跑兩次未通過，full `npx tsc --noEmit` PASS；證據見
    `output/playwright/dev-122-mobile-zero-data-quick-task/` 與 `output/qa/dev-122/`。本輪已依使用者授權完成Level 3、production-sealed inactive candidate及REL-002 canonical activation；HTTPS root／quick、manifest／SW、45檔provenance與production-safe同帳號單筆建立／工作台readback／cleanup均PASS。URL、release／version、rollback anchor與accepted-risk邊界見 [REL-002 release record](release/REL-002-DEV-122-20260917.md)及[DEV-122 release evidence](release/PREPRODUCTION-DEV-122-20260917.md)。未通過或未執行的案例保留原始事實，並由2026-09-17 release exception明確承接其殘餘風險。
  - 計入交付：是（`Production Verified with Accepted Exceptions`；REL-002 canonical與同帳號替代結案證據PASS）

- ◐ DEV-123 [交付點] [架構已定案] [P2] [Production Backend Deployed / Frontend Feature-Gated / Hosted Synthetic PASS / Provider Qualification Gate Pending] 會議任務辨識與滑鼠停留輔助連結
  - 摘要：會中同步錄音與滑鼠線索，會後以雲端轉錄與 AI 辨識既有任務；明確匹配加入草稿、模糊者待確認，
    保留原文追溯與人工修正，講者標籤延後；會議室麥克風收音、錄音保留 7 天。
    已確認：試點每月 NT$1,000、上傳後 24 小時內草稿、正確率至少 95%／涵蓋至少 90%。
    `10A 11A 12A` 已確認：每場手動錄音、草稿就地修正，原始錄音與完整逐字稿限會議編輯者。
    供應商不得保留可回取的會議內容；若採 Gemini，需專案級 ZDR、`store=false` 及用畢清理；ProJED 自己的 7 日音訊與會議保存規則維持不變。
  - 來源 ID：`USER-20260914-MEETING-TASK-RESOLUTION-POINTER-CONTEXT`、
    `USER-20260914-DEV123-GUIDED-1A-2A-3A`、`USER-20260914-DEV123-GUIDED-4A-5A-6C`、
    `USER-20260914-DEV123-GUIDED-7A-8C-9C`、`USER-20260914-DEV123-GUIDED-10A-11A-12A`、
    `USER-20260914-PROVIDER-RETENTION-BOUNDARY`（本段對話需求追蹤碼）。
  - 父任務：DEV-002；相容 DEV-003、DEV-011／012、DEV-109／110、DEV-111／114、DEV-117。
  - 下一步：完成 `WP-123-0a` 的專案級 ZDR／model／API／pricing 證據，再以合格 Provider 執行 `WP-123-0b` synthetic probe、Files cleanup readback、品質校準與真實 browser/media；通過前正式 build 固定隱藏 DEV-123 錄音／review 入口。
  - 阻塞 / 恢復條件：產品與架構決策已補齊；provider ZDR核准、各model/API、Files清理及繁中timestamp尚無專案級證據。
    Gate通過前不得傳真實會議內容；若無法符合ZDR、24h、7日、NT$1,000、95%／90%或raw權限，依SPEC stop condition回規劃。
  - 證據：SPEC-123、ADR-051、QA-DEV-123 與 Tech Lead 文件修訂；`npx tsc --noEmit`、DEV-123 pure verifier、targeted ESLint、`npm run verify:dev-123-provider-contract`（fake mode=`PENDING`、無 network dispatch）、`npm run verify:dev-123-meeting-task-resolution-db-isolated`、`npx supabase db lint --local`、`npm run build:test` PASS；`npm run verify:dev-123-meeting-task-resolution-browser` 的 B01～B03入口smoke PASS（artifact：`output/playwright/dev-123-meeting-task-resolution/result.json`），`npm run verify:dev-123-meeting-task-resolution-browser-media` 的 B04～B11 route-mocked candidate smoke PASS（artifact：`output/playwright/dev-123-meeting-task-resolution-media/result.json`；fake MediaRecorder／getUserMedia／Edge route mock，非完整 browser/media QA）。隔離 DB artifact 為 `output/qa/dev-123/db-isolated-result.json`；八份 migration 已在 task-owned PostgreSQL loopback 完成 control-plane core readback（source-version unique、cleanup identity unique、budget reserve／settle、`SKIP LOCKED` claim、decision CAS、complete upload 原子重送與 manifest timeline guard、manual retry `retryAtomicity`、accepted decision 缺省 link 由projection補入、published projection guard 與 frozen partial downgrade rejection、projection request key 同內容重送 no-op／異內容衝突）並清理 runtime；browser review callback會把accepted task同步進draft，save-projection仍由server accepted rows作最終authority；progress 不再寫入 verified audio row，append-pointer 另驗 tenant／project、live task／milestone／非 archived scope，cancel 只釋放未 dispatch 預留；worker／purge 已加獨立排程 secret fail-closed gate，worker 遇 published/archived record 不能建立新 transcript/projection；purge 對 provider cleanup obligation 已補上 fail-closed／retryable marker，不再靜默略過，且以 `lease_token／lease_expires_at` 避免重複處理、`deleting` row 會依 `due_at` 重掃、ledger update 失敗會 fail-fast；完整真實 browser/media、hosted authenticated DB／Storage、provider 0a/0b、95/90、24h、7日、budget 與 QA/QC 尚未取得證據。
  - 計入交付：否（control plane 已部署並以 disposable fixture 驗證；產品入口仍 feature-gated，provider、品質與完整 QA/QC 通過後才可視為功能交付）。
  - Local preflight：`npm run verify:dev-123-local-preflight` 已串接 pure/provider contract、isolated DB、task-owned Auth／Storage、含 Edge runtime 的 Control API、schema lint、typecheck、lint/build、protected regressions 與 browser/media candidate checks；結果為 `PASS_WITH_EXTERNAL_GATES_PENDING`（18 steps／7 artifacts，`output/qa/dev-123/local-preflight-result.json`）。同時保留 fake `PENDING` 與未具資格 mode 的 `FAIL_CLOSED` provider artifact，只收斂 local evidence，不取代 hosted authenticated DB／Storage、provider、完整 QA/QC 或 release gate。
  - Auth/Storage local readback：task-owned Supabase full-stack 已通過 `npm run verify:dev-123-auth-storage-local`（Auth、raw table RLS、private `meeting-audio` bucket/object、service-role readback、synthetic fixture cleanup；artifact：`output/qa/dev-123/auth-storage-local-result.json`）；不替代 hosted authenticated DB／Storage gate。
  - Control API local readback：含 Edge runtime 的 task-owned Supabase full-stack 已通過 `npm run verify:dev-123-control-api-local`（Auth actor、missing／invalid auth、same-project begin/status、cross-project begin／pointer deny、pointer append replay、signed upload／SHA-256 verify、stop freeze、complete-upload replay、fake worker ready／transcript／budget settlement、manual retry atomic／same-key idempotency／conflict no-orphan、purge secret／expired audio cleanup、signed playback、cancel／cancel後 playback deny、service-role raw readback；artifact：`output/qa/dev-123/control-api-local-result.json`）。驗證器對 token／signed URL 做遞迴 evidence redaction，不將 capability 寫入 artifact；retry RPC 的 enum boundary 已以 text cast 固定，避免 enum 與空字串比較造成誤失敗。private schema 僅供 service-role Edge 路徑使用，private table／RPC grants 仍拒絕 PUBLIC／anon／authenticated；不替代 hosted authenticated DB／Storage、provider 或完整 QA/QC gate。
  - Hosted follow-up：已將 hosted PostgREST schema exposure 收斂為 `public,private,graphql_public`；private table／RPC grants 仍拒絕 PUBLIC／anon／authenticated，只由 service-role Edge 路徑使用。Provider adapter、Cron/Vault 啟用與真實內容仍維持封鎖。
  - Hosted readiness／control readback：正式 project `knodlkxqpcqyrtgwpdst` 已套用授權範圍內 9 份 migration，部署 `meeting_capture_control`、`process_meeting_analysis`、`purge_meeting_audio`；`npm run verify:dev-123-hosted-readiness` 6/6 PASS。另以 disposable Auth user／tenant／project／WBS task／meeting／synthetic audio／pointer interval 跑完整 control API 與 Storage，18/18 PASS；辨識回同一合法任務，pointer feature `0.4166666666666667`、semantic score `0.5`，清理後 fixture tenant／capture 均為 0。worker 固定 fake、provider dispatch=false、費用=0，故不得解讀為 ZDR／真實轉錄／品質 PASS。artifact：`output/qa/dev-123/hosted-readiness-result.json`、`output/qa/dev-123/hosted-control-api-result.json`。
  - Lifecycle hardening：`MeetingRecordingControls` 只有在 `MediaRecorder.start()` 成功後才更新 recording／resumed UI；建立／啟動失敗沿 server-stop／missing-source recovery 收斂，B04 start-failure evidence 已通過。

- ◇ DEV-124 [交付點] [驗證中] [P1] [RD Implementation Complete / 架構已定案 / R14 Targeted QA PASS / QC Pending / NOT RELEASED] OKR 共用看板任務拖拉核心
  - 摘要：Board／Goal共用drag presenter、canonical commit與child dwell狀態機；Goal預覽與正式樹線改由同一
    `GoalHierarchyGuides`／segment renderer呈現，並在同一semantic anchor恢復共用Kanban定位線；樹分支端點仍直接對齊放開後title edge。
  - 來源 ID：`USER-20260916-OKR-SHARED-KANBAN-TASK-DRAG`、`USER-20260916-GOAL-INSERTION-LINE-REENTRY`、`USER-20260917-CROSS-MODE-DRAG-BEHAVIOR-PARITY`、`USER-20260917-GOAL-DRAG-TREE-PREVIEW`、`USER-20260917-GOAL-ALL-PLACEMENT-TREE-PREVIEW`、`USER-20260917-GOAL-DRAG-TREE-PREVIEW-EXCLUSIVITY`、`USER-20260917-GOAL-DRAG-PREVIEW-COMMITTED-TREE-PARITY`、`USER-20260917-GOAL-RESTORE-INSERTION-MARKER`、`USER-20260917-GOAL-DRAG-OVERLAY-HALF-SIZE`、`USER-20260917-GOAL-EQUIVALENT-BOUNDARY-RIGHT-STYLE`、`USER-20260917-GOAL-TREE-STEM-TOP-DOWN-ONLY`、`USER-20260917-GOAL-CHILD-ENTRY-WINDOW-70-CANDIDATE-LOCATION`、`USER-20260917-GOAL-ARMED-CHILD-PARENT-LOCATION-PERSIST`。
  - 父任務：DEV-116；相容 DEV-053、DEV-055、DEV-058、DEV-068、DEV-120、DEV-121。
  - 本輪完成：WP-124-Y／Z將Goal child-entry window縮為primary surface中心70%寬×70%高，candidate起算即只定位目標列；WP-124-AA／AB讓1000ms後切換child線時父任務定位持續存在，子孫不染色。Board維持原行為。
  - 阻塞 / 恢復條件：未決架構選擇0；若必須改Board approved marker樣式、schema／API／permission／rowSpan或canonical commit即停止回送規劃模型。TD-124-01／02仍為已揭露限制。
  - 證據：R14 fail-first S40／B52重現armed後父任務定位消失；修正後DEV-124 static 40/40、Chromium 27/27，browser／HTTP error=0。
  - 回歸：B51證明outer guard candidate=0、中心target-only tint=1；B52證明armed target parent=1、descendant=0且child feedback；B49／B50、Board shared presenter與Goal定位／樹線／浮卡／commit均PASS。TypeScript、targeted ESLint、`build:test`與diff check PASS。
  - 計入交付：是（R14 RD implementation與targeted QA已完成；獨立QC、真機／正式持久化與release gate未完成，維持驗證中）

## DEV-066：任務備註語意富文字與 AI 可讀內容

- 文件成熟度：Rework 4 `Implemented / Local Simulated QC PASS / Physical Device Pending`；Rework 1～3 為歷史 `Implemented / QC PASS`
- 狀態：驗證中 / Rework 4 已實作 / Physical Device Pending / 未 Release
- 節點類型：交付點
- 父交付點：DEV-006、DEV-008、DEV-057
- 是否計入產品交付完成：是（Rework 4 完成前不得視為目前契約已交付）
- 原始需求邊界：`USER-20260812-TASK-NOTE-RICH-TEXT-AI-READABLE`；2026-08-20 `USER-20260820-DEV066-UNIFIED-MOBILE-TASK-NOTE-EDITOR`
- 風險等級：Medium（跨桌機／手機 UI、內容相容與 AI indexing）
- Spec Impact：`Intentional replacement`；只取代舊 `1A` 手機 zero-editor／append-only 契約，`2A／3A`、canonical rich state 與 AI 投影維持。

### 問題與使用者價值

既有 DEV-066 已在桌機提供 Lexical 語意富文字編輯器，但低於 768px 時切換成格式化唯讀內容與常駐純文字追加欄。這個手機專用分流占用狹窄 viewport、阻止使用者直接修改原備註，也讓同一個工作物件存在兩套操作心智模型。

Rework 4 的真正需求不是新增手機編輯能力模組，而是移除裝置分流：手機與電腦共用同一個任務備註 editor、同一格式 allowlist、同一資料與儲存方向，只以 responsive layout 適應 viewport。完成後手機不再出現「追加文字」區塊，可直接編輯原備註且不降級桌機格式。

### Human Decision Brief

- `1A`（2026-08-20 superseded）：手機不提供富文字編輯器，改用格式化唯讀與純文字追加。
- `2A`：桌機第一版只提供語意格式：本文／小標題、粗體、斜體、底線、刪除線、項目清單、編號清單、連結與清除格式。
- `3A`：每一個備註欄使用相同行為，各自具有按需叫出的格式按鈕與工具，不限定第一個預設備註。
- `4A`（Human Confirmed）：手機與電腦使用同一個既有 Lexical 任務備註 editor；完全刪除手機追加欄與 append-only 操作，不另寫手機 editor 模組。
- 保留：`2A／3A`、既有格式 allowlist、每則備註獨立 editor、canonical rich state、plain compatibility alias、AI 安全投影與權限行為。
- 已拒絕：手機專用第二套 editor、手機純文字全文覆寫、維持 append-only 分流，以及擴張字型／任意字級／顏色／對齊／表格／圖片。

### 主要流程

#### 所有 viewport

1. 每個備註標題右側顯示低干擾的「文字格式」按鈕，與該備註的新增／刪除動作相鄰但語意分離。
2. 每個可編輯備註直接掛載同一個 Lexical editor；不得依 `768px` breakpoint 切換成另一個內容編輯流程。
3. 工具列預設關閉且不占版位；點擊按鈕後顯示同一組格式功能。桌機維持 header-inline placement，手機只做必要 responsive placement／overflow，不建立另一套 toolbar 行為。
4. 工具列開啟後保持顯示；點進內容、持續輸入、點外部或按 `Escape` 均不收起，只有再次按同一個格式按鈕才關閉。
5. 工具列操作需保留原本文字 selection；儲存、關閉前寫入、undo／redo、中文 IME、複製貼上與多備註行為不得退步。
6. 沒有編輯權限時，同一 editor 以 readonly／disabled 狀態安全呈現，且不顯示可提交或格式控制。

#### 手機 responsive 邊界

1. 不顯示舊「追加文字」label、textarea、追加按鈕或 append-only error surface。
2. 手機可直接修改既有格式化本文，使用與桌機相同的本文／小標題／強調／清單／連結／清除格式及 undo／redo 能力。
3. 軟鍵盤、觸控選字與格式按鈕不得造成 selection 遺失、modal 雙捲動、內容遮蔽、水平 overflow 或儲存失敗。
4. 手機與桌機功能契約相同；允許的差異僅限工具列排列、可見寬度、觸控尺寸與 viewport/safe-area 適配。

### 初步範圍

- 任務詳情中的所有 `TaskDetailNote` 內容欄。
- 所有 viewport 共用既有 Lexical 任務備註 editor、按需開啟且 toggle-only 關閉的語意格式工具，以及可見 focus／pressed 狀態與 accessible name。
- 本文／小標題、粗體、斜體、底線、刪除線、項目清單、編號清單、連結、清除格式。
- Gmail／Word 貼上時只保留允許的語意格式；一般 `Ctrl+C/V`、純文字貼上、中文 IME、undo／redo 與 editor focus 內快捷鍵需一致。
- 移除 `useDesktopNoteEditor`、`TaskDetailNoteMobile` 與手機 append-only UI；現有 editor 元件改成不含裝置語意的共用元件，可重新命名但不得另建手機 editor。
- `appendPlainTextToTaskNote` 僅在確認無其他 consumer 後移除；不得影響 safe renderer／projection 中仍被其他路徑使用的 utility。
- 舊純文字備註向下相容，以及所有 viewport 保存／重開後格式 round-trip。
- AI indexing 使用由受控內容模型產生的 Markdown 或等效語意文字投影，不把 raw HTML 直接送入 AI。
- AI 文件需以備註為單位保留 `taskId`、`noteId`、`noteTitle` 與可用的更新資訊，並避免第一個備註由 `description` 與 `detailNotes` 重複索引。

### 初步範圍外

- 新增手機專用 editor engine、第二套儲存流程或不同格式 allowlist。
- 字型、任意字級、文字／背景顏色、對齊、表格、圖片、附件、嵌入內容與程式碼區塊。
- Excel 儲存格轉原生表格；第一版只保證可安全貼成純文字或允許的基本段落。
- 多人即時協作、留言／修訂模式、版本歷史與 Word 等級版面能力。
- 修改會議紀錄 `RecordContentEditor` 的既有產品行為；若 RD 後續抽共用 editor core，必須維持 DEV-006 回歸契約。
- 本 Brief 階段的 schema migration、production 操作、部署與 release artifact。

### 驗收方向

- 1440／1024／390 viewport 的每個可編輯備註都由同一 Lexical editor 模組擁有，具有相同格式功能；手機 DOM 不存在 append-only UI。
- 語意格式、連結、清單、selection、中文 IME、貼上、undo／redo、明確儲存與 X 關閉前寫入，在跨裝置保存並重開後結果一致。
- 桌機既有 header-inline toolbar 幾何不得退步；手機格式工具完整可達、沒有 viewport 裁切或非預期水平 overflow。
- 手機實際觸控選字後可套用格式且 selection 不遺失；軟鍵盤開啟時目前備註、工具列與儲存／關閉路徑仍可操作。
- 舊的純文字備註不需人工轉檔即可閱讀、編輯與被 AI 搜尋；任何 lazy upgrade 必須可回復且不得產生空內容。
- AI 輸入能保留標題、段落、清單、強調、連結與備註 metadata，不包含未清理 HTML／script，且相同第一備註不重複出現在同一份 RAG document。
- 真實 rendered surface 的 desktop／laptop／mobile QC 必須包含主要互動、可見錯誤掃描、長內容、長連結、空內容、多備註與 readonly／disabled 狀態。

### 限制、風險與待 RD 決定事項

- 現有 `recordLexicalContent` serializer 只保存純文字與 task mention token；不能直接加格式工具後沿用原 serializer，否則格式會在儲存時消失。
- `ADR-042` 已固定單一 canonical rich state、純文字 fallback、AI 語意投影與 schema/version 邊界；Rework 4 不重新決策或修改這些契約。
- 移除手機 append merge 路徑後，所有裝置都只能由 Lexical editor state 更新 canonical rich state，再單向產生 plain compatibility alias；不得引入裝置別寫入來源。
- Gmail／Word HTML 貼上需 allowlist、URL protocol 檢查與清理；未知 node 或轉換失敗時降級為純文字，不得中斷輸入或保存不安全內容。
- 既有 `description = 第一個備註` 相容別名與 RAG adapter 同時輸出 description／detailNotes 的重複風險，需在實作契約中指定唯一 AI owner 與 legacy fallback。

### Architecture Memory Capsule

- 直接泛化既有任務備註 Lexical editor，不抽出新手機 core、不引入第二套 editor engine，也不修改會議紀錄 editor。
- 富文字原稿與 AI 輸入分層：原稿負責無損重開，AI 只讀安全且去重的語意投影；raw HTML 不作 canonical source，也不直接送入 AI。
- 任務備註只有一個 editor responsibility boundary；desktop/mobile 是同一元件的 responsive 呈現，不是兩個產品模式或兩套寫入來源。

### 既有 Architecture Contract 與 Rework 4 Direction（非 Implementation Ready）

- Canonical：`TaskDetailNote.richContent` 儲存帶 `task-note.lexical-v1` 版本的 Lexical JSON；`content` 為由 canonical state 衍生的純文字相容別名，`description` 繼續只鏡像第一則備註純文字。投影不可反向覆寫 rich state。
- Legacy：沒有 `richContent` 的舊備註以 `content` 開啟，只在任一 viewport 首次實際編輯時 lazy upgrade；無 migration，現有 Supabase `detail_notes` JSONB 繼續完整儲存可選欄位。
- Unified Editor：移除 `min-width: 768px` editor gate；每則可編輯備註在所有 viewport 掛載同一 Lexical editor、同一格式 toggle／commands／save flow。桌機維持既有 header-inline 幾何，手機只新增同元件內的 responsive style 與必要 touch selection protection。
- Module Boundary：不得新增 mobile editor module；原 `TaskDetailNoteDesktopEditor` 已泛化／重新命名為裝置中立 `TaskDetailNoteEditor`。readonly renderer 只保留為 lazy loading fallback，不再作為手機專用寫入分支。
- Clipboard/security：不儲存 raw HTML；未知 node 轉成其文字 children，連結只允許 `http:`、`https:`、`mailto:`、`tel:`，其餘以純文字顯示。
- AI：`wbsRagAdapter` 由 rich state 生成受控 Markdown 投影並加入 note id/title metadata；有 `detailNotes` 時不再另輸出 `description`，無 detail notes 時才使用 legacy description fallback。
- Rework 4 repo impact：`src/components/TaskNotes/TaskDetailNoteField.tsx`、`TaskDetailNoteEditor.tsx` 的裝置中立泛化、`src/utils/taskNoteRichContent.ts` 未使用 append helper 清理、DEV-066 verifier 與受影響 browser verifier。`src/types/index.ts`、`TaskDetailsModal` save contract、`wbsRagAdapter`、Lexical dependency 與 schema 未改產品行為，只做 regression gate。

### 執行邊界與下一步

- 本輪執行邊界：已授權並完成本機產品程式、targeted tests 與 simulated browser QC；未授權 migration、production 資料操作、部署或 release。
- 下一步：補 iOS Safari／Android Chrome 實機觸控選字、中文 IME、貼上、soft keyboard、保存／關閉／重開 evidence；完成前維持驗證中。
- Quality gate：TypeScript、targeted verifier、DEV-033／050、test build、1440／1024／390／320／landscape rendered QC 已通過；physical mobile gate 尚未執行。
- Stop condition：若必須新增第二套 editor、改 schema／API／權限／格式 allowlist／會議紀錄 editor，或只能以 plain text 覆寫 canonical rich state，停止並回到 PM／Human Decision；本輪不自動 release。

### 歷史 Completion Evidence（Rework 1～3）

- RD：完成版本化 Lexical JSON canonical、desktop on-demand semantic editor、mobile safe renderer＋append-only merge、plain compatibility alias 與 AI safe Markdown projection。
- QA：targeted contract suite、TypeScript、ESLint、P9 RAG local smoke、test build、DEV-006／008 static 與 DEV-033／050 browser regressions 通過。
- QC：1440 desktop、1024 laptop、390 mobile 共 13 cases PASS；popover geometry 穩定，手機為 0 editor／0 format toggle／0 contenteditable，append 前段 rich nodes byte-for-byte 不變，console/page error 與 visible alert 皆為 0。
- Rework 1：將不直覺的 `¶`、`H3`、刪除線等格式 glyph 改為完整中文標籤；targeted lint、TypeScript、static verifier 與 1440／1024／390 browser suite 再驗 PASS，沒有規格契約漂移。
- Rework 2：依使用者標註恢復粗體／斜體／底線的 B／I／U 圖示，刪除線改用不含 S 的 Aa 加水平線圖示；三種 viewport browser suite 再驗 PASS，沒有規格契約漂移。
- Rework 3：依使用者圖片將工具列移到 header 的 A 按鈕左側；輸入、outside click 與 Escape 不收起，只有再次點 A 關閉。SPEC／QA 已按明示需求作 `Intentional replacement`，targeted lint、TypeScript、static verifier 與 1440／1024／390 browser suite PASS。
- 證據文件：SPEC-066、ADR-042、QA-DEV-066、QC-DEV-066；screenshots 位於 output/playwright/dev-066-task-note-*.png。
- Rework 4：2026-08-28 已移除 mobile breakpoint／readonly append branch，泛化為單一 `TaskDetailNoteEditor`；390px 直接編輯、格式 round-trip、零 append UI、320／landscape overflow、DEV-033／050 regression與可見錯誤掃描通過。iOS／Android 實機 touch／IME／soft-keyboard仍未充分驗證。
- Release：未執行；physical mobile gate 或明確 release risk decision 前不得宣稱完整完成或 release-ready。

### Spec Governance 結論

- SPEC-006：`Intentional successor`；保留其「DEV-006 不含富文字工具列與 editor JSON」歷史完成邊界，DEV-066 另行承接新能力。
- SPEC-008／DEV-057：`Compatible extension`；任務知識仍由任務詳情查找，儲存與 X 關閉前寫入不可退步。
- ADR：建立 `ADR-042`，記憶 canonical Lexical JSON／plain compatibility alias／safe AI projection 的跨模組單向資料契約。
- Rework 4：使用者 2026-08-20 明確取代舊 `1A`，分類為 `Intentional replacement`；`2A／3A` 與資料／AI architecture 相容保留，不新增 DEV 或 ADR。
- Spec／ADR／QA／QC／documentation map：已同步新的 authoritative direction；QC 僅保留歷史 evidence validity notice。
- 剩餘產品決策：無。下一個 re-entry 是使用者要求實作時補至 `RD Implementation Ready`，不是再詢問是否需要手機專用模組。

## DEV-067：看板任務拖曳升級為 L1 列表

- 狀態：Completed / QC PASS / Local Only / 未 Release
- 節點類型：交付點
- 父交付點：DEV-053、DEV-054、DEV-055、DEV-058
- 是否計入產品交付完成：是
- 原始需求邊界：`USER-20260814-KANBAN-L1-DRAG-PROMOTION`
- 風險等級：Medium（核心拖曳 parent/order/nodeType 與跨裝置落點）

### 問題與使用者價值

目前任務只能拖進既有列表成為 L2，無法在看板內直接升成 L1。完成後，使用者拖到列表標頭即可升階並看到與其他階層一致的定位條；拖到列表內容仍表示放進列表，無需新增選單或額外按鈕。

### RD Implementation Contract

- `column-header` 對所有 task source 都代表與 target 同階定位；非 L1 來源升階時轉為 `parentId: null`、`nodeType: group`。
- 看板尾端新增 `root-drop` append surface，包住既有新增列表 CTA；一般 tap／pan 不變，drag release 不得新增額外列表。
- 桌機與手機 preview／commit 共用 `resolveTaskDropIntent()`；單一 marker、origin zero-write、cycle guard、stale preview no-op 與 undo 維持。
- 列表內容 `column-drop` 仍只把來源放成該列表 L2，不得被 root semantics 汙染。
- 本輪只改本機產品程式、targeted verifier 與必要文件；不含 migration、production、release 或遠端資料。

### QA / QC Gate

- Resolver、desktop L1 header、desktop root append、column body regression、mobile L1 header／root append、invalid/origin no-op、subtree preserve、三 viewport geometry 與 visible-error sweep。
- 必須通過 DEV-067 targeted static/browser、DEV-054／055 targeted regression、TypeScript、targeted ESLint 與 test build。
- UI 需有 1440／1024／390 真實 rendered interaction 或等效 DOM／screenshot 證據；未具備時只能判定未充分驗證。

### Spec Governance 結論

- 對 DEV-054／055 舊 `column-header` 非 L1 語意為 `Intentional replacement`；使用者本輪明示需求足以授權。
- 對 DEV-053／058 其餘 canonical resolver、commit safety 與 marker 基線為 `Compatible exception`／`No conflict`。
- ADR 不需要：變更局部、可逆、無 schema／外部 API／權限或跨模組治理基準。
- Authoritative source：`SPEC-067`；QA source：`QA-DEV-067`。

### Completion Evidence

- Targeted resolver／source contract 13/13、DEV-067 browser 8/8、DEV-055 desktop regression 16/16、DEV-054 mobile regression 11/11 PASS。
- DEV-053／054／055／058 static regression 30/30、37/37、27/27、26/26 PASS。
- TypeScript、targeted ESLint（0 error；2 個既存 warning）、`build:test` 與 1440x900／1024x768／390x844 rendered QC PASS。
- QC authoritative evidence：`ai-doc/qc/QC-DEV-067-kanban-l1-drag-promotion.md`；Physical iOS／Android 手感列 supplemental。

## DEV-068：任務完整預選範圍停留移入子任務

- 狀態：Implemented / Targeted Title-Anchor Browser Passed / Adjacent L1 Placeholder Regression Open / Physical Mobile 未充分驗證 / 未 Release
- 節點類型：交付點
- 父交付點：DEV-053、DEV-054、DEV-055、DEV-058、DEV-065、DEV-067
- 是否計入產品交付完成：是
- 原始需求邊界：`USER-20260815-TASK-TITLE-CENTER-CHILD-DROP`
- 風險等級：Medium-to-High（核心拖曳意圖、parent/order、跨階層與桌機／手機手勢衝突）

### 問題與使用者價值

舊版只有 L2 卡片底部透明追加區，後續 title-only 方案仍與使用者看見的任務範圍不一致。最終方案把 DEV-065 完整預選範圍（主任務＋可見子樹）當作 child dwell scope；未滿 1 秒不顯示子任務藍框、放開仍走既有 standard drop，滿 1 秒後只顯示「下一子階插入線」並由 child intent 接管。2026-08-25 再將插入線起點明確收斂為「放開後最終階層的同層標題起點」，不再受展開鍵、紀錄勾選框或空層 fallback 影響。

### Human Decision / RD Contract

- L1／L2／L3+ 共用 DEV-065 complete-hover-scope child intent；canonical target 是 outer scope，不是 title span。標題尾端與主表面空白都屬於 scope；內層任務以 exact innermost ownership 接管，展開、輸入、連結、選單等內部控制依實際矩形排除。
- 真正開始拖曳後才計 child dwell；同一 source、target 與完整hover scope連續 1,000ms 才 armed。未滿 1 秒放開依當下 standard drop，不得提交 child。
- Candidate 與 armed 都不顯示子任務 target 藍框；candidate 保留 standard insertion marker，armed 清除後只顯示下一子階唯一 child insertion marker。插入線沿用既有圓點＋線條樣式，起點與放開後最終同層 title anchor 差≤1px，並依 L2／L3／L4+ 逐層右移；無既有任務時使用同 token 的 empty-level anchor。Preview 使用 overlay／portal，不得推動 layout。
- 原始任務卡以raw pointer／finger為anchor固定於右上方16px；靠右時改放左上方並保留8px viewport margin，且不得遮住child insertion marker。
- 任務拖離後，原位置保留唯一 `primary-400` 2px 內縮虛線框；L1/L2/L3+ 與手機共用視覺語言，框的 left/top/width/height 與原佔位差≤1px，結束或取消後清除。
- Release 重新驗證 exact target、geometry、permission、cycle 與 store freshness；通過才寫入一次並提供單次 undo。
- 桌機保留 8px threshold、click/right-click 與一般排序；手機保留 pan-first、long-press、raw finger 與 action rail priority。
- DEV-055 的 L2 卡片底部透明 child commit 入口退役；column body L2 drop、root L1 append、非中央同階排序與 L1 promotion 保留。
- Authoritative source：`ai-doc/specs/SPEC-068-task-title-center-child-drop.md`。

### QA / QC Gate

- QA authoritative source：`ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md`。
- AI 必須在真實 rendered page 使用 mouse down/move/hold/up 與 mobile touch/long-press 路徑；直接改 store 只可建立 fixture，不得代替操作。
- 必測 1440x900、1024x768、390x844、430x932 與 320x844；需保存 timing、座標、preview、before/after store、screenshot/video、console/network/visible-error evidence。
- wrong parent、未滿 1 秒提交、stale timer、double commit、cycle、subtree loss、permission bypass 或 visible runtime error 任一發生即不通過。
- iPhone Safari 與 Android Chrome 實機是完整 mobile sign-off gate；若 AI 無可控實機，結果必須標記 `AI Browser QA/QC Passed / Physical Mobile 未充分驗證`。

### Spec Governance 結論

- DEV-055 底部透明 L2 child append target：`Intentional replacement`。
- DEV-067 同階定位：`Compatible extension`；candidate 前 1 秒不顯示子任務藍框並保留既有 insertion/promotion/lane target，只有 armed 後改由 child intent 獨占 release。
- DEV-053／054／058／065 的 session safety、mobile input、origin feedback 與 drag 前 subtree hover：`Compatible exception`。
- ADR 不需要：看板內局部、可逆，無 schema、外部 API、權限模型或跨模組資料架構變更。
- 本輪已完成產品實作與本機 AI 真實 rendered QA/QC；physical iPhone Safari／Android Chrome 未執行，部署與 release 也未執行。

### Execution Evidence（2026-08-16）

- 開發前基線 commit：`56baa77 docs: define DEV-068 child drop contract`。
- RD 續作前 checkpoint commit：`ca41403 feat: implement DEV-068 child drop workflow`。
- 使用者重驗修正：最終明示命中區不是 flex slot 或 shrink-wrapped title `SPAN`，而是圖片中 DEV-065 完整藍框；已改為 whole hover scope，並新增 task-source `role="button"` 保留、內部控制排除與 candidate/standard coexist gate。
- 使用者重驗遮擋修正：來源任務卡原先覆蓋parent frame／當時的child ghost；直接修改dnd-kit modifier的第一輪與仍有1.75px／2px相交的第二輪均判FAIL並留存證據，最終改為與collision解耦的pointer-upper-right fixed overlay。
- 使用者重驗階層語言修正：可見文字ghost退役，改用現有`KanbanInsertionMarker`；L2／L3／L4+起點相對欄位左側實測19／29／43px。
- 使用者重驗顯示修正：candidate 與 armed 的子任務 primary/subtree/scope frame 全為0；armed 只顯示下一子階 insertion marker。
- 使用者重驗原位修正：child append 若父層／型態／兄弟順序均不變，armed 改顯示既有藍底白字來源名稱欄位；一般 marker=0，release 完整 node snapshot 不變且無成功播報。同父層但實際換序仍維持一般 marker 與 commit。
- 使用者重驗來源位置修正：三階來源離開後共用2px虛線框；failure-first rendered gate抓到L1舊有scale/rotate與固定高度使原位偏移，移除transform並恢復36px原高後，desktop與mobile的L1/L2/L3+座標／尺寸全數差≤1px。
- Commit 後 RD 稽核：failure-first 抓到 desktop orientationchange 後仍可提交，補 orientationchange／resize cancel 後 7 種終止來源回歸通過。
- 核心 gate：DEV-068 static 73/73、desktop/mobile browser true operation 30/30；70 個 QA case 均已連回 AI 操作證據。
- 相鄰回歸：DEV-065 40/40＋15/15、DEV-053 30/30＋10/10、DEV-054 44/44＋15/15、DEV-055 28/28＋16/16、DEV-058 26/26、DEV-067 13/13＋8/8，全部 PASS。
- 工程 gate：TypeScript PASS；targeted ESLint 0 error；test build `output/build-dev068-no-child-blue-20260816` PASS（2000 modules）。
- Rendered viewports：1440x900、1024x768、390x844、430x932、320x844；console／network／visible-error／overflow sweep PASS。
- QC authoritative evidence：`ai-doc/qc/QC-DEV-068-task-title-center-child-drop.md`。
- Remaining gate：本機未偵測到 ADB 或 Windows iPhone／Android portable device；依 QA 契約維持執行中，不標記 Complete 或 release ready。

### Rework 15 Execution Evidence（2026-08-25）

- Failure-first static gate 先攔下 L2 標題前仍有條件式展開鍵／紀錄勾選框；RD 將 L2/L3+ title slot 移到列首，三層 scope 補 canonical empty-level anchor，desktop/mobile/armed resolver 共用 `taskTitleAnchor.ts`。
- DEV-068 static 73/73、TypeScript `--noEmit`、`build:test` 與 `git diff --check` PASS。
- 完整 rendered mouse/touch 重跑中，`DEV068-DESK-DEPTH-LINE` PASS；L2／L3／L4+ marker 與最終同層標題、實際／空層 anchor 均在 1px 內，L2 有／無展開鍵的 title left 一致。視覺證據：`output/playwright/dev-068-title-child-drop-1787590112800-desktop-depth-insertion.png`。
- 唯一剩餘失敗為既存 L1 source placeholder 高度 28.09375px vs 32px，已在 DEV-053 相鄰證據中記錄且不歸因於本輪 title-anchor 修改；未放寬斷言、未部署、未 release。

### RD Readiness Gate

- 共用 `task-title-child` target、complete-hover-scope geometry、candidate/standard coexist、desktop/mobile child-intent state、timer cleanup、release revalidation、single commit與 success feedback 的檔案級契約已寫入 `SPEC-068`。
- 無 schema／migration／API／remote／權限模型變更；P0/P1 產品決策與工程 readiness 缺口均已清除。
- 本輪可執行產品程式、targeted verifier與本機 RD→QC；production deploy／release仍需另走 release gate。


## DEV-069：會議草稿 F5 復原與低成本雲端備份

- 狀態：RD Implemented / Local QA-QC PASS / Provider Smoke Pending / 未 Release
- 節點類型：交付點
- 父交付點：DEV-002、DEV-005、DEV-010、DEV-020
- 是否計入產品交付完成：是
- 原始需求邊界：`USER-20260817-MEETING-DRAFT-RECOVERY-COST-CONTROL`
- 風險等級：Medium（跨瀏覽器生命週期、本機持久化、多 backend adapter 與伺服器成本邊界）

### 問題與使用者價值

會議紀錄的核心任務是不中斷捕捉討論、決議與追蹤事項。現況草稿主要留在前端記憶體，應用程式內的 dirty guard 無法覆蓋 F5，造成已輸入內容永久遺失。反之，若每次輸入都呼叫現有完整儲存路徑，會放大資料庫寫入、task link 重建、重試與後續 RAG 誤觸發風險。

交付後，桌機／筆電使用者誤按 F5 可恢復最新未完成草稿，並能區分「已保存在此裝置」與「已備份至雲端」；伺服器使用量由明確上限控制，不隨按鍵數量線性成長。

### Human Decision Brief

- 2026-08-17 使用者確認：必須解決 F5 造成的會議草稿遺失，且必須控制伺服器成本。
- 2026-08-17 使用者確認：手機版不開放會議紀錄功能；不建立手機會議編輯、復原或保存狀態 UI。
- 保留現有「存草稿」與「發布」語意；自動復原不得自動發布。
- `SPEC-010` 的桌機／筆電限定為目前手機邊界依據；`SPEC-005` 早期 Mobile 右側欄設想視為歷史方向，不是 DEV-069 現行契約。

### 主要流程

1. 使用者在桌機／筆電會議紀錄編輯器輸入內容。
2. 系統先寫入本機可復原快照，不發送伺服器請求。
3. 符合內容已變更、最小間隔與最大過期條件後，只將最新草稿送往輕量雲端 checkpoint。
4. 誤按 F5 後，系統在相同帳號、workspace 與 board 下恢復較新的本機草稿，並顯示復原結果。
5. 手動「存草稿」會立即完成雲端儲存；「發布」才進入正式紀錄與 RAG lifecycle。

### Current Scope

- 桌機／筆電會議紀錄的標題、內容、與會者、task links、會議活動 buffer 與必要草稿識別資訊。
- 本機即時快照、F5 復原、過期清理、登出清理與 terminal action 清理；meeting mode 持續期間即使雲端已確認仍保留最新本機快照。
- 輕量雲端 checkpoint，只儲存最新草稿，不建立每次輸入版本歷史。
- 保存狀態的桌機 UI 只在需要使用者注意時顯示：「已備份至雲端 HH:mm」、「雲端備份失敗，本機內容仍安全」；正常本機保存不另佔用畫面列。
- 離線期間合併成單一最新快照，重新連線時最多補送一份。
- 維持 draft 不產生 RAG document version、chunk、sync job 或 embedding；發布時才依 content hash 進入現有 RAG 流程。

### Out of Scope

- 手機版會議紀錄入口、編輯器、本機復原、雲端備份狀態與會議流程驗收。
- 多人即時共編、跨裝置文字合併、每次輸入版本歷史或完整事件溯源。
- 每次按鍵即呼叫雲端儲存，或用現有完整 `saveDraft()` 作為高頻自動儲存。
- draft 期間觸發 AI 整理、RAG、embedding 或重建所有 task links。
- 不含 schema／migration、production 操作、部署或 release。

### Frozen Implementation Contract

- 本機層：500ms debounce 同步產生 sessionStorage emergency copy 與 IndexedDB v1 durable snapshot；TTL 7 天，以 user/workspace/board/draft 分區。latest IndexedDB 成功後保持內部 committed state，但正常本機保存不顯示狀態列；只有 degraded、error、conflict 等需要注意的狀態才顯示提示。
- F5 restore：auth 與 scope ready、record load settle 後取兩種媒介較新有效值；離線仍恢復。remote published 或 remote newer+different 時不得覆寫，提供「本機另存新草稿／使用雲端／稍後決定」，不做 merge。
- 雲端層：首個 checkpoint 需 idle 20 秒；持續輸入最晚 5 分鐘；任兩次 attempt 至少 180 秒；rolling 60 分鐘最多 20 attempts；單次 payload <=512KiB；single-flight、latest-only、3m/5m/15m/30m backoff。
- 同瀏覽器多 tab 以 Web Locks、localStorage lease/ledger 協調；跨裝置全域 20/h 硬限流不在本版承諾範圍，若需要則 re-entry server quota 設計。
- provider-neutral `recordService.checkpointDraft()`：Supabase 每次最多 1 次 `knowledge_records` mutation、0 task-link mutation、0 full reload、0 RAG；Firestore 最多 1 transaction read + 1 write；local-test 0 server request。
- Supabase recovery payload 使用既有 `metadata.projedDraftRecovery`，沿用現有 RLS/grants，不新增 migration、RPC、Edge Function 或 service-role。
- checkpoint 不更新 `draftBaselineSignature`、不寫 undo、不讓 UI 誤判已手動存草稿或已發布；手動存草稿／發布仍走完整既有路徑。
- 手機 authoritative boundary：`coarse pointer || viewport <=640px` 時不 render meeting 入口、list row、editor、restore/conflict/save status，也不執行 snapshot/checkpoint；非 meeting work log 不受影響，390x844 僅負向回歸。

### Repo / Module Impact

- 新增：`meetingDraftRecoveryService.ts`、`recordDraftCheckpointPolicy.ts`、`useMeetingDraftRecovery.ts`、`useMeetingRecordAvailability.ts`、DEV-069 static/browser verifier。
- 修改：`types/index.ts`、`App.tsx`、record/auth stores、dataBackend、Supabase/Firestore/local-test record adapters、MainLayout、Sidebar、RecordsView、RecordSidebar、TaskRecordTimeline、record guards、meeting workflow、package scripts。
- 不新增 runtime dependency；使用 browser native IndexedDB、sessionStorage、Web Locks / localStorage lease。

### RD Work Packages

1. WP1：型別、signature、validator、IndexedDB/sessionStorage 與純 checkpoint policy。
2. WP2：store subscription、page lifecycle、restore/conflict、terminal cleanup。
3. WP3：local-test、Supabase、Firestore adapter 與可稽核 request/RAG cost seam。
4. WP4：桌機單一狀態位置、產品化錯誤、共用手機 availability hard guard。
5. WP5：targeted verifier、既有 meeting regression、1440/1024 rendered QC、390 negative QC。

### 驗收方向

- 桌機 1440x900 與筆電 1024x768：輸入後立即 F5，標題、內容、任務關聯與必要會議 buffer 完整恢復，不得自動發布。
- 本機快照完成前不得誤顯示「已保存在此裝置」；雲端確認前不得誤顯示「已備份至雲端」。
- 模擬一小時持續輸入，自動 checkpoint 不超過 20 次；每次按鍵不產生伺服器請求。
- 模擬離線十分鐘後 F5 仍可復原；重新連線後僅補送最新快照一次，不重播中間版本。
- draft 內容變更期間，RAG job、document version、chunk 與 embedding 增量均為 0；發布後才依有效 content hash 進入現有同步流程。
- 手機 390x844 只做負向回歸：不出現會議紀錄入口、編輯器或保存狀態；不執行手機會議紀錄功能驗收。
- 雲端儲存失敗時，桌機 UI 必須說明「本機內容仍安全」與可恢復路徑，不得顯示 raw HTTP 或 API 錯誤。

### 限制與 Re-entry Trigger

- 7 天本機保留、3 分鐘最小 attempt 間隔、5 分鐘持續輸入上限、20 attempts/hour/browser-account 與 512KiB payload 已固化為本版工程決策；更短跨裝置 RPO 或全域硬 quota 必須連同成本模型重新決策。
- 不做即時共編或跨裝置 merge；若未來開放同一草稿多端同時編輯，另立 conflict/version contract。
- 若公司安全政策禁止 IndexedDB/sessionStorage 保存會議內容，停止 WP1 並 Human Re-entry；不得暗中退化為高頻 server write。

### 文件成熟度與下一步

- `SPEC-069` 已固化資料封包、狀態機、restore/conflict、provider adapter、成本計數、失敗恢復、手機排除、repo impact 與 RD work packages。
- `QA-DEV-069` 已定義 25 項 required cases、provider request/RAG cost evidence 與 rendered QC；P0/P1 readiness gap 為 0，可直接派 RD。
- 下一步：RD 依 WP1→WP5 實作並交 QA/QC；未通過 QC 前不得標 Implemented / PASS，未走 release gate 前不得部署。


## DEV-070：跨模式互動策略核心與差異治理

- 狀態：RD Implemented / QC Functional PASS / Release Gate Blocked
- 節點類型：開發點
- 父交付點：DEV-027B、DEV-028、DEV-029
- 是否計入產品交付完成：否
- 原始需求邊界：`USER-20260817-CROSS-MODE-INTERACTION-POLICY-KERNEL`
- 風險等級：Medium（跨心智圖、看板與共用任務表面的主要互動契約；不涉及資料模型或後端）
- 關聯規格：`SPEC-070-cross-mode-interaction-policy-kernel.md`
- 架構決策：`ADR-043-cross-mode-interaction-policy-kernel.md`
- 驗證計畫：`QA-DEV-070-cross-mode-interaction-policy-kernel.md`

### 問題與使用者價值

現況將「選取任務、開啟詳情、建立任務後命名、右鍵選單」等行為直接綁在各 Surface 元件與共用 `GlobalContextMenu`。當心智圖需要結構編輯語法、看板需要執行管理語法時，若持續在元件內加入 `currentView` 判斷，會造成每種模式重複設定、權限與選單行為漂移，且修改共用 helper 時容易無意改動其他模式。

完成後，產品先維持所有既有點擊、快捷鍵、右鍵與暫時操作語意，但底層不再複製任務 CRUD、權限、Undo 與安全規則；後續行為需求可明確判定為「全域預設」或「模式差異」，並可列出實際受影響模式。

### Human Decision Brief

- 2026-08-17 使用者確認：心智圖、看板與未來其他模式必須能擁有不同互動模式，不能再假設所有任務 Surface 都共用相同操作語法。
- 2026-08-17 使用者確認：不希望每個模組重新設定完整互動邏輯；模式應只宣告與預設不同的差異。
- 2026-08-17 使用者確認：後續變更需可判斷為 Base 預設、Surface 差異、Transient Override 或 Guard／Command 規則；未明示全域時採最小影響原則。
- 2026-08-17 使用者確認：Phase 1 只建立架構，不改心智圖、看板、清單、甘特或手機現有行為；既有 resolved interaction matrix 是零差異基線。
- 未來要變更心智圖或看板單擊、右鍵或快捷鍵時，再以獨立 Host Mode／Origin Profile 差異進入產品決策與驗收，不回溯擴張 Phase 1。

### 主要流程

1. 任務元件只回報標準化 Trigger、Surface、Entity 與必要互動上下文，不直接決定資料或 UI 結果。
2. Interaction Resolver 依 Base、Host Mode、Origin、節點角色與 Transient Mode 的優先序解析 Semantic Action。
3. Action Catalog 提供一致的名稱、圖示、可用條件與執行入口；右鍵選單、快捷鍵與工具列共用同一份 Action 定義。
4. Guard 執行權限、輸入焦點、拖曳、危險操作與狀態限制；Command 負責共用資料異動、Undo、確認與結果。
5. QA 以解析後互動矩陣比較變更前後結果；Base 變更必須揭露所有受影響 Surface，Surface 變更不得讓其他模式 snapshot 漂移。

### Architecture Memory Capsule

- 核心資料流：`Raw Trigger → Normalizer → Policy Resolver → Semantic Action → Guard → Command`。
- 設定優先序：`System Base → Task Default → Host Mode → Origin → Node Role → Transient Override → Runtime Guard`。
- View root 只設定一次 `InteractionScope`；任務卡、節點與列透過共用 hook 取得 bindings，不逐層傳遞完整 profile。
- Base 只放跨模式不變量，例如 secondary pointer trigger、`Escape` 關閉暫時 UI、輸入元件不攔截模式快捷鍵；`Shift+F10` 若 WP0 證明目前未綁定，Phase 1 必須維持 disabled。
- Host Mode Profile 放主要模式差異；Origin Profile 放 Workbench／Shared Sidebar 等巢狀表面差異。未宣告項目逐層繼承，只有特定組合不同時才用 composite override。
- Transient Override 放關聯建立、拖曳、紀錄擷取、行動版 long-press action mode 等有生命週期的暫時語意。
- Guard／Command 放權限、安全、資料一致性、確認與 Undo，不因 Surface 複製實作。

### Frozen Scope

- 建立 typed `TaskActionId`、標準化 Trigger、Interaction Context 與可解析的 Profile 契約。
- 建立 Base、Host Mode、Origin、Node Role、Transient Override 與 deterministic resolver。
- 建立共用 Task Action Catalog／Command facade，使右鍵、快捷鍵與工具列共用 capability、permission 與執行入口。
- Task context target 必須快照事件當下的 `hostMode + origin`；選單 render／execute 不再讀全域 `currentView` 推測語境。
- 建立 resolved interaction matrix 與 affected-location diff，作為 Base／差異變更的驗證證據。
- 以 `SPEC-028` 現行四模式操作契約建立心智圖、看板、清單與甘特 Compatibility Profile；Profile 的解析結果必須與重構前一致。
- 手機 Board interaction 透過 `SPEC-029` 相容 adapter／Transient Override 接入，不重開手機非 Board 模式，也不改 pan-first、無位移 tap 或 long-press lifecycle。
- Calendar、Task Workbench 與 Shared Task Sidebar 雖非四個主要模式，但會開啟共用 task context menu 或詳情；Phase 1 必須補 explicit source Surface 並納入零差異盤點，不能因 `GlobalContextMenu` 遷移而被動改變。

### RD Handoff Contract

- `SPEC-070` 是 Phase 1 的 authoritative architecture／verification contract；產品行為 authority 仍為目前 runtime、既有 DEV-027B／028／029 verifier、較新的 `SPEC-028` 與 mobile authority `SPEC-029`。
- typed pipeline 固定為 `Trigger → Profile Resolver → Semantic Action → Runtime Guard → Command`；Resolver 必須 pure、deterministic、可輸出 source layer 與 affected-location diff。
- merge precedence 固定為 `System Base → Task Default → Host Mode → Origin → Node Role → Transient Override → Runtime Guard`；Mode／Origin 只能宣告 sparse override。
- task context state 必須快照 `interactionLocation = { hostMode, origin }`；此欄位只屬前端 ephemeral context，不持久化。
- Action Catalog 集中 stable ID、label／icon、permission、danger level 與 Command；menu／shortcut／toolbar／mobile rail 可有不同呈現集合，但不得分叉 mutation。
- merge operator 依契約固定：trigger replace、menu stable-ID patch、metadata catalog-only、permission deny-wins、Command non-mergeable；Profile 不使用任意 deep merge。
- exclusive transient owner 超過一個時 fail closed；同一 `interactionId` 的 mutation 最多執行一次，Command outcome 必須區分 executed／noop／denied／cancelled／failed。
- 逐片遷移固定為 WP0 golden master → WP1 pure kernel → WP2 catalog／context origin → WP3 List／Mindmap／Board／Gantt adapter → WP4 auxiliary／transient adapter → WP5 legacy cleanup。
- 每個 location 依 `legacy-only → shadow-resolve → kernel-authoritative → legacy-removed` 遷移；shadow 只比較不執行，任何時點只有一個 Command executor。

### Compatibility Baseline 摘要

| Surface | 主要操作必須維持 | 模式差異必須維持 |
|---|---|---|
| List | 單擊選取＋開詳情；post-create 依目前入口進詳情命名 | `Enter` 開詳情；task menu 有目前依賴項目 |
| Mindmap | 單擊選取＋開詳情；無外層 rename | `Enter` 同階、`Tab` 子階、方向鍵導航；selection-first insert；relationship／drag 優先；menu 無目前未支援的依賴項目 |
| Board | L1／L2／L3+ 單擊選取＋開詳情 | `Enter` 開詳情；dependency／record capture／drag 優先；mobile 依 `SPEC-029` |
| Gantt | 任務條與 Shared Sidebar 單擊選取＋開詳情 | `Enter` 開詳情；move／resize 後 suppress click-through |
| Calendar／Workbench | Calendar segment／其 Shared Sidebar 維持切到 List；Workbench 維持開詳情 | 只補來源 context，不新增快捷鍵或 menu 項目 |

已知 pre-existing spec drift：`SPEC-027B` 舊文字的「心智圖新增後只選取」與目前 `MindMapView.createTask() → prepareNewTaskNaming()` 會開詳情的 runtime 不一致。Phase 1 以重構前 runtime＋browser evidence 作 golden master；不得在架構重構中順便更改產品行為。後續若要選擇其中一種語意，另立 Human Re-entry。

### Data／API／Permission Impact

- Data／schema／migration／provider API／RLS：無。
- Permission source：沿用 `useBoardPermissions` 或等效 facade；Profile 不得自創角色或規避 Command 二次檢查。
- State：只擴充前端 task interaction context／menu origin；不寫入 backend、URL 或 localStorage。
- Release：本 DEV 不含 production、deploy 或 release。

### Repo Impact

- 新增檔名、單一責任與禁止依賴已固定於 `SPEC-070` 7.1：pure types／profiles／resolver／catalog／guard 與 effect scope／binding／menu／command 分層，另含 manifest、static verifier、browser verifier 與 artifact runner。
- 逐檔 patch intent 已固定於 `SPEC-070` 7.2，涵蓋 App scope、ephemeral state、Global task menu、List／Mindmap／Board／Gantt／Calendar／Workbench／Shared Sidebar、mobile command bridge 與既有 source verifier。
- 可派工順序固定為 S0～S11；binding IDs、owner、完成定義與 rollback point見 `SPEC-070` 8.6，不得一次全面替換。
- 測試 fixture 固定為 `dev-070-v1`，artifact 路徑與 temporary runtime boundary 見 `SPEC-070` 8.7 及 `QA-DEV-070` 3.4。本輪已完成產品／驗證實作與 local QC；不執行 deploy、push 或 release。

### Out of Scope

- 不修改 TaskNode、workspace、board、dependency、assignment 等資料模型、後端 API、schema、migration 或權限來源。
- 不重寫 DEV-053～DEV-068 已驗證的拖曳、落點、hover scope、mobile raw-finger 或 commit／undo 子系統。
- 不在本 Brief 改變任務名稱編輯入口；`SPEC-027B` 與 `SPEC-028` 的 detail-only title edit 仍有效。
- 不重新開放手機 list／mindmap／gantt／calendar；`SPEC-029` 的 pan-first、無位移 tap、長按 compact action rail 與刪除確認仍有效。
- 不重做 `TaskDetailsModal`、任務資料內容、視覺設計系統、部署或 release。
- 不在 Phase 1 導入任何新的 click、double-click、keyboard、context-menu、toolbar、long-press 或 post-create 行為。

### Base／差異變更治理

| 需求性質 | 修改層級 | 判定規則 |
|---|---|---|
| 所有模式必須一致的不變量 | Base Profile | 使用者明示「所有模式／全域」，或屬輸入安全、關閉暫時 UI 等跨 Surface 不變量 |
| 特定模式工作方式 | Host Mode Profile | 需求明示心智圖、看板、清單或甘特；未明示全域時採最小影響原則 |
| 巢狀表面工作方式 | Origin／Composite Profile | 只影響 Task Workbench、Shared Sidebar 或特定 mode＋origin 組合 |
| 暫時操作狀態 | Transient Override | 關聯模式、拖曳、紀錄擷取、mobile action mode 等進入／退出明確的 session |
| 權限、安全與資料規則 | Guard／Command | 相同 Action 在任何 Surface 都必須遵守，禁止以 Profile 規避 |
| 純視覺差異 | Component／Design Token | 不改 Semantic Action、資料結果或安全契約 |

### 驗收方向

- 新 Surface 若沒有特殊需求，可只引用 Base Profile；不得複製整份 click、context menu、shortcut handler。
- Phase 1 的心智圖、看板、清單、甘特及手機 Board resolved interaction matrix 必須與重構前逐項相同，包括 primary action、task menu、快捷鍵與 post-create 行為。
- 不同 Surface 可擁有獨立 Compatibility Profile，但相同 Action 只存在一份 permission、guard 與 command 實作。
- 任一 Base Profile 變更都能輸出所有受影響 Surface；未預期 Surface 的 resolved matrix 改變即判定失敗。
- 任一 Host Mode／Origin Profile 變更都不改其他 location 的解析 snapshot、資料結果、權限與 Undo 行為。
- Context menu、快捷鍵與工具列對同一 Action 的 enabled／disabled、permission 與執行結果一致。
- focus 位於 input／textarea／select／contenteditable／modal 時不得攔截 Surface 快捷鍵；危險操作不得因快捷鍵或 Profile 繞過確認。
- 既有 `SPEC-027B` 心智圖鍵盤新增與方向選取、`SPEC-029` mobile pan-first，以及 DEV-053～DEV-068 drag regression 必須在各自受影響邊界維持通過。

### Spec Impact 與限制

- Phase 1 分類：`No contract drift / behavior-preserving architecture refactor`。`SPEC-028` 的四模式單擊、詳情與 task menu 現行契約仍是驗收基線，不在本階段改寫。
- Future Phase Capsule：架構通過零差異 gate 後，若使用者要求心智圖或看板採不同互動，才以 Host Mode／Origin override 建立產品行為變更；屆時再判定 `Compatible exception` 或 `Intentional replacement` 並同步 authoritative spec。
- `SPEC-027B` 的 `Enter` 新增同階、`Tab` 新增子階、方向鍵選取與 detail-only title edit 是既有相容基線；若未來要改外層 rename，需另行明確決策。
- `SPEC-029` 繼續治理 coarse pointer／mobile 手勢仲裁；Interaction Kernel 不得把 desktop profile 直接套用到 mobile gesture lifecycle。
- 若 resolver 需要重寫 drag sensor、mobile broker、資料 store 或既有權限模型，視為 scope 擴張，停止並以 Human Re-entry 修訂 RD Contract；不得直接實作。

### 必要證據與 Stop Conditions

- WP0 必須依 `QA-DEV-070` 保存每個 host mode／origin／role／trigger 的 resolved action、selection、modal、post-create、menu 與 transient result；沒有 baseline evidence 不得開始 wiring。
- 新 resolver 需有 Base affected-location diff、Mode／Origin negative diff、unknown location fail-closed、shadow command=0 與 authoritative executor=1 證據。
- `SPEC-070` 的 AC-070-001～016 必須逐項連到 `QA-DEV-070` 的直接證據；不得以相鄰案例或 RD 自述推定覆蓋。
- 完成後至少重跑 DEV-070、DEV-027B、DEV-028、DEV-029 static/browser、受影響 drag regression、TypeScript 與 `build:test`；rendered gate 為 1440x900、1024x768、390x844。
- 任一 click、keyboard、menu、post-create、selection、modal、gesture、drag、permission、confirmation 或 Undo 漂移即停止；不得以修改產品行為讓測試通過。
- 發生雙重 dispatch、重複建立、錯誤 task、unknown location／非法 merge／transient conflict 誤 fallback、silent failure、資料層／部署需求時，停止並回到最近通過 parity 的 slice。

### 文件成熟度與下一步

- 目前成熟度：`Implemented / QC Functional PASS`；產品決策、public API、檔案邊界、相容 seed、逐檔 patch、S0～S11 manifest、fixture、evidence、owner、failure recovery 與 rollback 的 P0／P1 規格缺口為 0；release overlay 仍 blocked。
- `ADR-043` 已鎖定 App-level scope、稀疏繼承 Profile、pure/effect 邊界、Semantic Action／Command、open-time location snapshot、single executor 與 source/test-only migration。
- `QA-DEV-070` 為 `Execution Complete / Functional PASS / Release Gate Blocked`，含 57 項 QA cases、16 項 AC traceability、frozen fixture、artifact path、逐 WP exit gate、runtime lifecycle、regression 與 evidence owner；F-01～F-04 仍由 release overlay 管理。
- QC 證據：DEV-070 57/57、baseline/after/diff 三 viewport、DEV-027B/028/029/053/054/055/067/068 required regression、TypeScript 與 `build:test` 均通過；詳見 `QA-DEV-070` 13.1。
- 下一步：若要進入 release，先完成 Gate A～C 的 clean worktree、exact artifact、upstream/provenance、preview hash 與 rollback evidence；未完成前不得部署。
- Execution Boundary：本輪完成 RD 修復與 local QA/QC；未執行 merge、deploy 或 release。`Functional PASS` 不等於 `Release Ready`。

## DEV-071：心智圖選取與明細入口差異

- 狀態：RD Implemented / Local QA-QC PASS / 未 Release
- 節點類型：開發點
- 父任務：DEV-070、DEV-027B、DEV-028
- 是否計入產品交付完成：否
- 原始需求邊界：`USER-20260818-MINDMAP-SELECTION-DETAILS`
- 風險等級：Medium（心智圖主要互動入口與共用 task menu；不涉及資料模型、API、權限或後端）
- 關聯規格：`SPEC-070` DEV-071 addendum、`SPEC-028` DEV-071 addendum
- 驗證計畫：`QA-DEV-071-mindmap-selection-details.md`

### 行為契約

- 心智圖 `mindmap.node` 單擊：只選取節點，不開啟 `TaskDetailsModal`。
- 心智圖 `mindmap.node` 雙擊：開啟同一節點的 `TaskDetailsModal`。
- 心智圖右鍵：維持 task context menu，新增「開啟明細」；點擊後開啟右鍵事件快照所指向的任務。
- 清單、看板、甘特、Workbench、Shared Sidebar 與 Calendar 不因本 DEV 改變既有單擊／選單行為。
- 心智圖 Enter／Tab 仍建立同階／子任務並選取新任務，但不得自動開啟 `TaskDetailsModal`；方向鍵、relationship、drag、mobile pan-first 與 title edit 邊界不變。

### 實作邊界

- 只在 `mindmap` Host Mode Profile 宣告 `pointer.primary → task.select`、`pointer.double → task.open-details` 與 menu include `task.open-details`。
- `task.select`、`task.open-details` 仍由共用 Action／Command facade 執行；不在 MindMapNode 複製明細或權限邏輯。
- TaskActionMenu 支援 profile 明確 include 的 navigation action；預設模式不顯示「開啟明細」。
- 不改 TaskNode、workspace、board、dependency、assignment、schema、migration、provider API 或 persisted interaction state。

### 實際驗證結果

- DEV-071 static verifier：PASS；mindmap primary=`task.select`、double=`task.open-details`、menu include=`task.open-details`；board primary/menu 維持原契約。
- DEV-071 browser verifier：PASS；1440x900，心智圖單擊選取-only、Enter／Tab 新增後 modal 維持關閉、雙擊開明細、右鍵「開啟明細」開正確任務、看板單擊仍開明細；console error=0。
- DEV-028 static regression：45/45 PASS。
- TypeScript：`npm.cmd exec tsc -- --noEmit` PASS。
- Test build：`npm.cmd run build:test` PASS；Vite 2012 modules，PWA service worker generated。
- Execution Boundary：本輪未執行 merge、deploy 或 release；commit 需保留 DEV-069 與其他未分類 dirty changes 在提交範圍外。

> 契約更新註記：DEV-073 曾暫時取消心智圖單擊 inline title edit；使用者本輪再次明確要求「僅心智圖」滑鼠單擊進入與新增後相同的 XMind 式 quick-title。現行 fine-pointer 單擊為選取 + quick-title；Enter 只保存並離開、不建立新任務，Tab 保存並建立子任務；雙擊／右鍵仍開明細，非心智圖仍維持詳情 title edit default。

## DEV-072：共用彈窗按鈕鍵盤導航

- 狀態：RD Implemented / Local QA-QC PASS / 未 Release
- 節點類型：開發點
- 父任務：DEV-010、DEV-028、DEV-070
- 是否計入產品交付完成：否
- 原始需求邊界：`USER-20260818-GLOBAL-DIALOG-KEYBOARD-NAVIGATION`
- 風險等級：Medium（共用阻塞式 UI 與鍵盤焦點；不涉及資料模型、API、權限或各模式 task profile）
- 關聯規格：`SPEC-072-global-dialog-keyboard-navigation.md`
- 驗證計畫：`QA-DEV-072-global-dialog-keyboard-navigation.md`

### 行為契約

- 所有模式共用同一個 `GlobalDialog`，不在看板、清單、甘特、心智圖等模式重複設定。
- `confirm` 開啟時預設聚焦「確認」；`action` 開啟時預設聚焦第一個 action；`prompt` 保持輸入框 focus 並選取既有文字。
- `ArrowLeft`／`ArrowRight` 在決策按鈕間循環；`Enter` 執行目前聚焦按鈕；`Escape`／X 維持既有關閉回傳。
- prompt 輸入框的左右鍵仍由原生文字編輯器處理，避免將游標移動誤判為按鈕導航。

### 實作邊界

- 變更集中於 `src/components/GlobalDialog.tsx`：focus group refs、初始焦點、capture keydown、循環索引、focus-visible ring 與穩定 DOM markers。
- `useDialogStore` 的 `showConfirm`／`showPrompt`／`showActionDialog` 公開 API 與 result 型別不變。
- 不改 `Interaction Kernel`、Host Mode Profile、任務點擊／右鍵／Enter／Tab 行為，不新增各模式 override。

### 實際驗證結果

- DEV-072 static verifier：PASS；共用 dialog marker、ARIA、confirm/action 預設索引、左右鍵、Enter、prompt caret guard 與 preventDefault 均存在。
- DEV-072 browser verifier：PASS；1440x900 confirm dialog 預設聚焦「確認」，ArrowLeft + Enter 取消且不刪除，ArrowLeft／Right 可循環回到「確認」；console error=0。
- DEV-028 static regression：PASS；TypeScript：PASS；`build:test`：PASS。
- Execution Boundary：本輪未執行 merge、deploy 或 release；維持既有 dirty worktree，不將不相關變更納入本開發點。

## DEV-073：心智圖 XMind 式快速命名（新增與滑鼠單擊）

- 狀態：RD Implemented / Local QA-QC PASS / 未 Release
- 節點類型：開發點
- 父任務：DEV-028、DEV-071、DEV-070
- 是否計入產品交付完成：否
- 原始需求邊界：`USER-20260818-TASK-TITLE-EDIT-DEFAULTS`
- 風險等級：Medium（心智圖新增／細滑鼠單擊 focus、雙擊仲裁、quick-title lifecycle、Enter／Tab 層級與非心智圖負向邊界；不涉及資料模型、API 或 provider）
- 關聯規格：`SPEC-073-task-title-edit-defaults.md`；修訂 `SPEC-028`／`SPEC-070` 的 DEV-071 addendum 邊界
- 驗證計畫：`QA-DEV-073-task-title-edit-defaults.md`

### 行為契約

- 心智圖 toolbar、Enter、Tab 新增任務後，使用 mindmap-local post-create adapter 掛載視覺低干擾的 quick-title input，自動 focus；使用者可直接打字且不開啟 `TaskDetailsModal`。
- 清單、看板、甘特、Workbench、Shared Sidebar 等非心智圖模式維持 `TASK_DEFAULT_PROFILE['task.post-create'] → task.open-details-for-naming` 與既有 `prepareNewTaskNaming()`。
- 心智圖 fine-pointer 單擊立即選取節點，經可取消的 240ms 雙擊判定窗後進入與 post-create 相同的 quick-title；自動 focus／全選既有名稱且不開 `TaskDetailsModal`。
- quick-title 只貼合節點文字，不顯示右圖的滿版輸入框或藍色反白；輸入層不攔截指標事件，節點外層保持 draggable，兼具快速拖曳與快速命名。
- 心智圖雙擊開啟同一任務明細；右鍵「開啟明細」維持既有入口。
- quick-title 中按一次 Enter：提交目前名稱並離開 quick-title，不建立新任務；按一次 Tab：提交目前名稱、建立子任務、選取子任務並延續 quick-title focus，不需要先離開編輯模式。
- blur 保存目前名稱並退出；Escape 取消目前 draft 且不新增；IME composition 期間 Enter 不觸發新增。key action 與 blur 必須具一次性 guard，避免重複提交或重複建立。

### 實作邊界

- 非心智圖共用 post-create 行為留在 interaction default profile 與既有 `prepareNewTaskNaming`；各模式不複製命名 command。
- 心智圖差異集中於 `MindMapView` post-create／pointer-primary／continuation adapter 與 `MindMapNode` 可控 quick-title editor；共用 title commit／permission／data command，不把差異擴散到其他模式。
- pointer-primary quick-title timer 在 selection、雙擊、右鍵、畫布點擊、relationship selection 與 unmount 時取消；coarse pointer、唯讀、relationship mode 與 drag 不進入 quick-title。
- 不改 schema、API、權限模型、relationship／drag／direction keyboard、context menu snapshot 或雙擊 details command。

### 實際驗證結果

- DEV-073 static verifier：PASS；非心智圖 shared details naming、心智圖 quick-title continuation、IME guard、fine/coarse pointer split、click arbitration、double-click／menu wiring 均符合契約。
- DEV-073 browser verifier：PASS；1440x900、0 console error；toolbar 建立後可直接輸入，Enter 一次保存並離開且不建立新任務，Tab 一次保存並建立子任務；細滑鼠單擊進入 quick-title、Escape 取消草稿，快速雙擊仍開正確明細，快速切換節點只由最新 selection 進入命名；quick-title 不滿版、反白透明、輸入層不攔 pointer 且節點仍 draggable。
- DEV-028 static regression：45/45 PASS；TypeScript：PASS；`build:test`：PASS。
- Execution Boundary：本輪未執行 merge、deploy 或 release；保留既有 dirty worktree。

## DEV-074：心智圖單一 Scene 座標系重構

- 文件成熟度：`RD Implementation Ready` → `Implemented / QA-QC PASS`
- 狀態：完成 / Implemented / QA PASS / QC PASS / 未 Release
- 節點類型：開發點
- 父交付點：DEV-027
- 是否計入產品交付完成：是（未 Release）
- 原始需求邊界：`USER-20260819-MINDMAP-SINGLE-SCENE-TRANSFORM`
- 風險等級：Medium（viewport、HTML／SVG、relationship、drag 與 hit testing 的跨模組前端架構重構；不涉及資料模型或後端）
- Spec Impact：`Intentional replacement / No product contract drift`

### Authoritative Package

- 架構與行為契約：`ai-doc/specs/SPEC-074-mindmap-single-scene-coordinate-system.md`
- 長期決策：`ai-doc/decisions/ADR-044-mindmap-single-scene-coordinate-system.md`
- 驗證計畫：`ai-doc/qa/QA-DEV-074-mindmap-single-scene-coordinate-system.md`
- 既有產品行為 authority：SPEC-027／027B／027E／070／073；SPEC-074 只取代「zoom 後重算 connector」的技術策略。

### Human Decision Brief

- 使用者已指定採用「單一 Scene transform」作為長期架構，並要求補齊到 RD 可直接實作。
- 縮放產品手感採行為相容：wheel 維持 pointer anchor；工具列 `+`／`-`／`100%` 與 fit 維持提交後置中內容。
- immediate dirty-latch hotfix 與單一 Scene 重構是不同交付，不得以止血修正宣稱 DEV-074 完成。
- 沒有待人類確認的資料、隱私、外部成本、權限或不可逆決策。

### Current Phase RD Handoff Contract

- **目的**：讓 zoom／pan 成為純 world-to-viewport 投影，消除節點與 overlay 因 layout reflow／geometry snapshot 不同步而漂移。
- **主要輸出**：viewport／stageSizer／scene、單一 typed coordinate mapper、world geometry dirty lifecycle、可回復 S0～S5 migration 與 screen-space evidence。
- **Scope**：hierarchy connector、note relationship、label、handles、hit target、inline editor、drag connector／insertion preview、zoom／fit／center／pan。
- **Out of Scope**：TaskNode／relationship schema、API、permission、後端、其他模式產品行為、mobile mindmap、全新 renderer、部署與 release。
- **Behavior Contract**：25%～400% 縮放範圍與既有入口不變；純 zoom／pan 不重算 world paths；layout mutation 才 coalesced recompute。
- **Data／API／Permission Impact**：無變更；既有 relationship anchors／control points 保持 world units 與 storage shape，不做 migration。
- **Dependencies**：DEV-027B／027E／027G geometry baseline、DEV-070 interaction ownership、DEV-073 quick-title baseline、DOMMatrix／ResizeObserver。
- **Acceptance Boundary**：端點距離 `<= 3px`、wheel anchor drift `<= 2px`、world/client round-trip `<= 0.01 world px`，並通過 1440x900、1024x768 rendered gate 與 390x844 mobile boundary。
- **QA／QC Gate**：QA-DEV-074 的 S0～S5 slice gate、screen geometry、scroll reachability、visible-error sweep 與既有受影響 regression。
- **Stop Conditions**：第一個 geometry drift、path 被純 zoom 改寫、scroll extent 失效、persisted geometry 改變、雙重 interaction owner 或主要 regression 差異即停止並回復上一 slice。
- **Evidence Required**：pure transform tests、static authority verifier、browser `getScreenCTM()`／DOMRect evidence、viewport screenshots、regression、TypeScript、targeted lint 與 build:test。

### RD Implementation Manifest

- **Repo baseline**：active repo `C:\VIBE CODING\ProJED\ProJED`；盤點時 branch `持續優化3`、HEAD `df27be9`；working tree 有使用者既存 MindMap／verifier／package 修改，RD 只能增量編輯，不得從 HEAD 重建或整檔覆寫。
- **S1 kernel**：新增 `mindMapCoordinateSystem.ts`，固定 scene layout、world/client inverse、anchor scroll、clamp pure API；`mindMapDomGeometry.ts` 只做 DOM adapter。
- **S2 shell**：`MindMapCanvasShell.tsx` 固定為唯一 scroll viewport → stageSizer → 單一 matrix scene；100% 先相容。
- **S3 authority**：`MindMapView.tsx`、`mindMapZoom.ts`、`mindMapViewport.ts`、`mindMapLayoutStyle.ts`、`mindMapOverlayPaths.ts` 移除 CSS zoom、150ms preview/suppress 與 zoom recompute，改 rAF zoom intent + dirty latch。
- **S4 overlays**：relationship SVG visual-only、HTML interaction layer single owner且 screen hit target 保持尺寸；drag badge screen-space，connector/insertion scene world-space。
- **S5 evidence**：新增兩個 DEV-074 verifier/package scripts，更新既有 verifier 只能替換舊 architecture markers，不得放寬行為 expected；完整倍率 artifact 與 regression 已完成。
- **Artifact**：fixture `dev-074-v1`；`output/playwright/dev-074-single-scene/geometry-evidence.json` + desktop/laptop 全倍率 screenshots + mobile boundary。
- **Owner**：RD 執行 S0～S5/self-check；QA 執行計畫與 regressions；QC 獨立核對 rendered surface；PM 只處理 stop/scope/release re-entry。

### Execution Boundary / Next Condition

- 本輪已完成 S0～S5 實作與驗證：single-scene matrix、world/client mapper、dirty latch、relationship single owner、drag preview world-space、完整倍率 artifact 與回歸 gate 均落地。
- QA/QC 證據已寫入 `output/playwright/dev-074-single-scene/geometry-evidence.json`；RD／QA／QC 已完成本輪交付判定，不需再次做 planning/contract upgrade。
- 本地實作授權不包含 commit、push、PR、merge、deploy、production data 或 release；完成 RD/QA/QC 後仍需使用者另行要求 release。

### Deferred Scope Audit

- immediate dirty-latch hotfix：獨立開發點或相容修正；若另行要求，需保留與 DEV-074 的雙軌邊界。
- minimap、動畫、自由畫布、Canvas／WebGL 與 mobile mindmap：一般 future scope，不影響目前 contract，不建立新 DEV。
- release：只保留 re-entry condition；待 RD／QA／QC 完成且使用者提出 release 再進入 release gate。

## DEV-075：心智圖方向鍵快速巡覽效能

- 文件成熟度：`RD Implementation Ready` → `Implemented / QA-QC PASS`
- 狀態：完成 / Implemented / QA PASS / QC PASS / 未 Release
- 節點類型：開發點
- 父交付點：DEV-027
- 是否計入產品交付完成：是（未 Release）
- 原始需求邊界：`USER-20260820-MINDMAP-KEYBOARD-NAV-LAG`；行為修訂：`USER-20260820-MINDMAP-CENTER-BRIDGE`
- 風險等級：Medium（高頻互動、React render boundary、focus lifecycle 與既有心智圖鍵盤／幾何回歸；不涉及資料模型或後端）
- Spec Impact：`Intentional replacement / horizontal navigation is side-aware and bridges the center`

### Authoritative Package

- 實作契約：`ai-doc/specs/SPEC-075-mindmap-keyboard-navigation-performance.md`
- 驗證計畫：`ai-doc/qa/QA-DEV-075-mindmap-keyboard-navigation-performance.md`
- 產品行為 authority：SPEC-027B／070／071／073；座標與 geometry authority：SPEC-074。
- ADR：不新增。selection store 與 navigation index 是心智圖內部、可分片回復的效能 authority，未改跨模式或外部契約；替代方案與禁止事項已由 SPEC-075 固定。

### Implemented Architecture Impact

- S0 baseline確認舊版垂直方向鍵每次掃描完整 DOM並線性搜尋；`selectedNodeId`位於`MindMapView`，使selection更新重新執行遞迴tree render，focus effect再查一次DOM。
- 現已落地模型衍生且不受selection invalidated的navigation index、按node ID精準通知的心智圖私有selection store、節點ref registry與last-focus-wins rAF；index另含side／root bridge metadata，水平鍵不查DOM即可穿越中心。純selection不re-render `MindMapView`，也不dirty world geometry。
- TaskNode、board store、interaction profile、資料／API／permission／migration 與 DEV-074 scene matrix 均不變。

### Implemented Contract

- **目的**：讓方向鍵巡覽成本不隨可見節點數線性增加，且一次 selection commit 只影響前後兩個節點。
- **Scope**：navigation order/index、mindmap private selection owner、node keyed subscription、focus registry、selection transition、test-only performance probe、static/browser verifier 與必要 regression marker 更新。
- **Behavior**：上下維持DOM可見順序；水平鍵依左右分支決定向內parent／向外first child，root向內時跳過中央標題橋接到對側root。中央標題不取得selection或focus；initial、clear、relationship、delete-next、quick-title、Enter／Tab與focus `preventScroll`語意維持。
- **Data／API／Permission**：無變更、無 migration、無持久化；同 ID selection 必須 idempotent。
- **Acceptance**：50／200 節點 p95 `<= 32ms`、500 節點 p95 `<= 50ms`；Long Task `>50ms` 為 0；單步 View render delta=0、受影響 node IDs `<=2`、navigation index build delta=0、geometry recompute delta=0，且最終 selection 無漏步。
- **QA／QC**：執行 QA-DEV-075 performance／lifecycle／viewport／visible-error matrix，以及 DEV-027B／027G／070／071／073／074 受影響 regression；build／lint 不得取代 rendered evidence。
- **Stop Conditions**：任一語意漂移、雙 selection owner、stale focus、quick-title focus 被搶、全樹 render、geometry recompute、可見錯誤、效能未達 gate或需要資料／權限變更即停止。
- **Evidence**：`dev-075-v1` baseline、unit/static summary、browser JSON、screenshots、console/page/visible errors、render／notification／index／geometry telemetry 與 regression command results。

### RD Implementation Manifest（S0～S4 Completed）

- **S0 Baseline**：已在產品改動前保存HEAD/status/touched diff、50／200／500 fixture的before latency與行為順序；baseline artifact維持不可覆寫。
- **S1 Pure kernels**：已新增`mindMapNavigation.ts`、`mindMapSelectionStore.ts`，完成order/index、O(1) vertical／horizontal lookup、side／root bridge、keyed old/new notifications與same-ID idempotence unit gate。
- **S2 Selection authority**：`MindMapView`已由store取代React `selectedNodeId` state；`MindMapNode`以`useSyncExternalStore` keyed subscription取得`isSelected`；runtime無legacy/store雙owner。
- **S3 Navigation／focus／paint**：已接入memoized model index、移除keydown DOM query、建立node ref registry與latest-only focus rAF、移除舊focus effect、把`transition-all`限縮為colors，並加入test-only probe telemetry。
- **S4 QA／QC**：已更新既有source-marker verifier但未放寬產品expected；QA-DEV-075、受影響regression、TypeScript、lint與build均通過。
- **Repo boundary**：active repo `C:\VIBE CODING\ProJED\ProJED`，branch `持續優化3`，盤點 HEAD `df27be99711fe44462c96174c0e495d44d6a7209`；工作樹已有 DEV-074 與其他使用者修改，RD 只能增量 patch，不得從 HEAD 重建、整檔覆寫、reset 或 checkout 使用者檔案。

### Execution Boundary / Next Condition

- S0～S4已完成；50／200／500節點100% zoom的baseline median p95分別為25.9／59.4／123.4ms，after為1.2／0.7／0.7ms，改善約95.4%／98.8%／99.4%，Long Task、漏步、View render與geometry recompute皆為0。
- 真實鍵盤／interaction owner／quick-title／IME／modal／relationship／focus／50%～200% zoom／1440x900、1024x768與390x844 boundary皆通過；console、page、network與visible error皆為0。
- 首次DEV-027B browser regression發現quick-title以Enter結束後未回復node focus；RD改為「僅鍵盤Enter／Escape帶明確focus restore intent」，同時保護blur／modal focus，重跑後DEV-027B與全矩陣皆通過。
- 2026-08-20中心橋接修訂：右root按Left可選左root，再按Right回原root；左分支向外鍵選child、向內鍵選parent，中心`centerSelected=false`且focus跟隨最終task selection。
- 證據：`output/playwright/dev-075-mindmap-keyboard-performance/result.json`、`baseline/keyboard-before.json`、`center-bridge-left-selected.png`與同目錄screenshots；artifact含13個DEV-075 cases及targeted regression command results。
- 本地實作未執行commit、push、PR、merge、deploy、production data或release；若要release，需由使用者另行提出並進既有release gate。

### Future Phase Capsule

- 若 500+ 可見節點在 selection isolation 後仍無法達成 gate，再評估 subtree virtualization 或 renderer 分層；re-entry 前必須先確認可見順序、focus accessibility、connector anchor 與搜尋／跳轉行為不被破壞。
- 若使用者希望方向鍵依畫面幾何選最近節點，而不是現行可見 DOM 順序，另立產品行為契約，不與 DEV-075 效能修正合併。


## DEV-076：心智圖左鍵抓取畫布平移（已撤回）

- 文件成熟度：`RD Implementation Ready` → `Reverted / Historical`
- 狀態：已撤回 / Abandoned by user / 歷史紀錄
- 節點類型：開發點
- 父交付點：DEV-027
- 是否計入產品交付完成：否
- 原始需求邊界：`USER-20260820-MINDMAP-LEFT-MOUSE-CANVAS-PAN`
- 風險等級：Medium（心智圖主要 pointer owner、selection lifecycle 與 world geometry regression；不涉及資料模型或後端）
- Spec Impact：`Intentional replacement / mindmap-only extension`

本 DEV 已依使用者 2026-09-03 指示撤回；以下規格、QA/QC 與 evidence 只作歷史追蹤，不代表現行產品契約。

### Authoritative Package

- 實作契約：`ai-doc/specs/SPEC-076-mindmap-left-mouse-canvas-pan.md`
- 驗證計畫：`ai-doc/qa/QA-DEV-076-mindmap-left-mouse-canvas-pan.md`
- 座標與 viewport authority：SPEC-074；task interaction／quick-title authority：SPEC-070／071／073；mobile boundary：SPEC-029。
- ADR：不新增。這是 mindmap-only、可逆且由既有 viewport scroll authority 承接的手勢擴充。

### Historical Contract (reverted)

- **目的**：空白畫布左鍵拖曳超過 6px 後以 direct pan 公式更新 viewport 兩軸 scroll，呈現 grab／grabbing 回饋。
- **Interaction Owner**：task node、center、toggle、relationship controls、semantic controls、native scrollbar、relationship/tool drag 狀態不得被 canvas pan 接管。
- **Selection**：有效 pan 吞掉後續 click並保留選取；門檻內普通 blank click 仍清除選取。
- **Architecture**：left pan 與既有 middle velocity pan 使用獨立 ephemeral refs；不以 React state 驅動 pointermove，不修改 scene matrix、world path、geometry dirty、資料或 undo。
- **Acceptance**：SPEC-076 AC-001～007、QA-DEV-076 case 001～010、1440／1024 rendered evidence、390 mobile negative boundary與 visible-error hard gate。
- **Stop Conditions**：第一個 owner、selection、geometry、data、touch/middle、cursor cleanup 或 visible error drift 即停止並回 RD。
- **Release Boundary**：本輪只含 local code、test、evidence 與必要文件；不含 commit、push、PR、merge、deploy、production data 或 release。

### Historical Execution Result (before reversal)

- Spec Impact Preflight：使用者本輪指令明確擴充 SPEC-074 的既有 middle-pan baseline，分類為 `Intentional replacement / mindmap-only extension`；SPEC-074 已加入 DEV-076 left-pan 相容增補。
- RD 已在 `mindMapPan.ts` 建立 6px pure threshold／direct scroll／blocked-target／scrollbar guard，在 `MindMapView` 以 refs + window lifecycle 接管 active-only pan／click suppression，CanvasShell／CSS 提供 telemetry 與 grab/grabbing；未改 scene matrix、資料或 permission。
- QA/QC：DEV-076 static 12/12；1440x900 與 1024x768 的 `-120/-80` pointer 均精確得到 `+120/+80` scroll，selection／paths／recompute／task與relationship storage 不變，node／center／toggle／relationship-tool owner、2px blank click 與 cancel cleanup通過。
- Rendered evidence：`output/playwright/dev-076-mindmap-left-mouse-pan/result.json`；desktop/laptop active/final與390 boundary screenshots已目視，scroll owner=1、document overflow=0，console/page/network/visible errors=0。
- Regression／工程 gate：DEV-027B browser（含middle pan、relationship、node drag、zoom）PASS；DEV-074／075／073／027B static、TypeScript、targeted ESLint、`build:test` PASS。
- Spec Drift：`In sync`。SPEC-076、SPEC-074增補、QA、runtime與evidence一致；ADR不需要，沒有高影響 deferred scope或 blocker。
- Runtime boundary：重用同專案既有 primary port 4000（listener PID 42856），本輪未啟動或停止 server，沒有新增 cleanup obligation。
- 本地實作未執行commit、push、PR、merge、deploy、production data或release；若要release，需由使用者另行提出並進既有release gate。

## DEV-077：心智圖關係線多餘中央導引線清理（2026-08-25 契約更正）

- 文件成熟度：`RD Implementation Ready` → `Implemented / QA-QC PASS`
- 狀態：歷史實作完成，但原契約誤讀；現行意圖與 acceptance 已由 DEV-085 更正／未 Release
- 節點類型：開發點
- 父交付點：DEV-027
- 是否計入產品交付完成：否（歷史誤讀不計入；由 DEV-085 接續）
- 原始需求邊界：使用者附圖與「紅線的元素刪除」；附圖紅筆僅作視覺標註，不是產品內容。
- 風險等級：Low–Medium（selected relationship visual owner 與 endpoint 操作；不涉及資料模型或後端）
- Spec Impact：`Compatible correction`；只刪除多畫的一條中央導引線

### Authoritative Package

- 實作契約：`ai-doc/specs/SPEC-077-mindmap-relationship-redline-cleanup.md`
- 驗證計畫：`ai-doc/qa/QA-DEV-077-mindmap-relationship-redline-cleanup.md`
- 產品與座標 authority：SPEC-027E、SPEC-074、SPEC-076、SPEC-085；本 DEV 只移除 selected relationship 的中央控制點互連 guide。
- ADR：不新增；不改 schema、storage shape、permission 或後端。

### Current Execution Contract

- **移除**：只移除 `control-1 → control-2` 的多餘中央導引線。
- **保留**：兩側 `endpoint → control point` control arms、兩個 square direction joysticks、兩端 circular endpoint，以及 relationship path／arrow／style／label、hover／selection／inline edit／Delete、endpoint anchor／reconnect。
- **資料相容**：既有 `geometry.controlPoints` 仍可被 path builder 讀取，不因視覺清理被重設或刪除。
- **驗收**：現行驗收以 SPEC-085／QA-DEV-085／QC-DEV-085 為準；更正後 DEV-077 static 6/6 必須同時證明 endpoint=2、direction arm=2、direction joystick=2、center guide=0。
- **停止條件**：endpoint、path、label、style drawer、Delete／Escape 或 viewport 出現行為差異；或需要資料／權限／後端變更時停止並回 PM。

### Execution Result

- 2026-08-25 使用者明確澄清：「當時我沒有要移除這些功能，而是當初的控制臂 UI 多畫了一條，我請他刪掉一條。」因此舊 RD／QA 結果只證明誤讀契約被忠實執行，不能證明使用者需求已達成。
- DEV-085 已恢復兩側 control arms 與方形 direction joysticks，只保留中央 guide 的刪除，並補上可獨立拖曳、首拖 fallback、持久化、zoom 與 input isolation 驗證。
- Spec Drift：`Corrected by DEV-085`。歷史 artifact 保留稽核用途，不再作為現行 acceptance。
- 本輪未執行 commit、push、PR、merge、deploy、production data 或 release；若要 release，需由使用者另行提出並進 release gate。

## DEV-078：心智圖工具列新增入口與快捷提示清理

- 文件成熟度：`RD Implementation Ready` → `Implemented / QA-QC PASS`
- 狀態：完成／Implemented／QA PASS／QC PASS／未 Release
- 節點類型：開發點
- 父交付點：DEV-027
- 是否計入產品交付完成：是（未 Release）
- 原始需求邊界：Browser Comment 1、Comment 2；只刪除標註的「新增任務」按鈕與快捷鍵提示，不把圖片上的文字視為額外指令。
- 風險等級：Low（toolbar DOM cleanup；keyboard／empty-state fallback regression）
- Spec Impact：`Intentional replacement / mindmap-only visual cleanup`

### Authoritative Package

- 實作契約：`ai-doc/specs/SPEC-078-mindmap-toolbar-cleanup.md`
- 驗證計畫：`ai-doc/qa/QA-DEV-078-mindmap-toolbar-cleanup.md`
- 產品 authority：SPEC-027、SPEC-027B、SPEC-073；本 DEV 僅清理 toolbar visual affordance，不改 keyboard／quick-title／資料契約。
- ADR：不新增；不改 schema、storage shape、permission 或後端。

### Current Execution Contract

- **移除**：toolbar `data-mindmap-create-root` button 與快捷鍵提示文字。
- **保留**：關聯線、zoom、唯讀 badge、empty-state 首個任務 fallback、Enter／Tab／Delete commands。
- **資料相容**：`handleCreateRoot`、`createTask` 與既有 permission guard 保留。
- **驗收**：SPEC-078 AC-001～005、QA-DEV-078、1440／1024／390 viewport visible-error sweep 與 keyboard regression；DEV-078 static 5/5 + browser pass。
- **停止條件**：新增／刪除／關聯線／zoom 行為差異、empty-state 失去建立入口、手機 boundary overflow 或需資料／權限／後端變更時停止並回 PM。

### Execution Result

- RD 已移除 toolbar「新增任務」與快捷鍵提示，並移除 toolbar 不再需要的 props／icon；empty-state fallback 與 keyboard command 維持。
- QA/QC：DEV-078 static 5/5；1440x900、1024x768、390x844 browser artifact 的 create button／hint 均為 0，zoom／relationship 保留，Enter root browser 與 Tab／Delete source contract 通過，console/page/network errors=0。
- Spec Drift：`In sync`。SPEC-078、QA、runtime、artifact 與 Browser Comments scope 一致；不新增 ADR，無 blocker。
- 本輪未執行 commit、push、PR、merge、deploy、production data 或 release；若要 release，需由使用者另行提出並進 release gate。

## DEV-079：心智圖右鍵選單建立關聯線

- 文件成熟度：`RD Implementation Ready` → `Implemented / QA-QC PASS`
- 狀態：完成／Implemented／QA PASS／QC PASS／未 Release
- 節點類型：開發點
- 父交付點：DEV-027
- 原始需求邊界：使用者要求「心智圖模式下, 右鍵清單新增建立關聯線」；只處理心智圖 task context menu，不把附圖或瀏覽器 ambient text 視為額外需求。
- 風險等級：Medium（context-menu action routing、transient relationship mode、permission／mode exclusion）
- Spec Impact：`Intentional extension / mindmap-only context-menu action`

### Authoritative Package

- 實作契約：`ai-doc/specs/SPEC-079-mindmap-context-menu-create-relationship.md`
- 驗證計畫：`ai-doc/qa/QA-DEV-079-mindmap-context-menu-create-relationship.md`
- 關聯線互動 authority：SPEC-027C、SPEC-027E；task menu／interaction authority：既有 task action catalog、profiles、GlobalContextMenu。
- ADR：不新增；不改 schema、storage shape、API 或 permission model。

### Current Execution Contract

- **新增**：心智圖 task menu action `task.create-relationship`，顯示「建立關聯線」與起點提示。
- **路由**：右鍵 action dispatch `start-mindmap-relationship`，由 `MindMapView` 進入既有 relationship draft selection，使用右鍵節點作為 source。
- **完成**：點擊 target 後沿用 inline label editor、關係線 persistence、既有 self-link guard；Escape 取消 transient mode。
- **邊界**：list／board／gantt／calendar menu 排除 action；`edit` capability disabled guard 保留。
- **驗收**：SPEC-079 AC-001～006、QA-DEV-079 browser source／target／label／Escape／non-mindmap exclusion 與 responsive visible-error gate。
- **停止條件**：右鍵 menu label／visibility、source selection、target editor、Escape、permission disabled、既有 Delete／開啟明細或 mobile boundary 出現差異時停止並回 PM。
- **Release Boundary**：本 DEV 只含 local code、test、evidence 與必要文件；不含 commit、push、PR、merge、deploy、production data 或 release。

### Execution Result

- RD 已完成 action type／catalog／profile／menu rendering、GlobalContextMenu event routing 與 MindMapView relationship draft activation；沿用既有 endpoint／label／cancel owner，未新增第二套關聯線資料流程。
- QA/QC：DEV-079 static 6/6；browser 右鍵 action、source／target、inline label、Escape、board exclusion、1440／1024／390 viewport 通過，artifact 的 console/page/request errors=0、overflow=0；DEV-027E relationship UX parity browser regression 亦通過；TypeScript、targeted ESLint、`build:test`、`git diff --check` 通過（targeted ESLint 僅既有 GlobalContextMenu 2 warnings）。
- Spec Drift：`In sync`。SPEC-079、QA、runtime 與 artifact 一致；不新增 ADR，無 blocker。
- Runtime boundary：重用同專案既有 primary port 4000；本 DEV 不啟動第二個 server，完成後不停止使用者既有 primary runtime。
- 本地實作未執行 commit、push、PR、merge、deploy、production data 或 release；若要 release，需由使用者另行提出並進既有 release gate。

## DEV-080：固定地端測試入口改用 localhost:4000

- 文件成熟度：`RD Implementation Ready`
- 狀態：完成／Implemented／QA PASS／QC PASS／未 Release
- 節點類型：開發點
- 父交付點：無（ADR-037 治理來源）
- 原始需求邊界：使用者選定 `http://localhost:4000/` 作為長期固定地端測試入口；只處理 local-test browser origin，不把 production、P9／preview port 或資料庫 loopback 位址一併改寫。
- 風險等級：Medium（跨 launcher、Auth redirect、browser verifier、測試證據與 origin-scoped browser state）
- Spec Impact：`Compatible exception / local browser origin canonicalization`；不改 schema、storage shape、API contract、permission model 或 production domain。

### Authoritative Package

- 決策 authority：`ai-doc/decisions/ADR-037-fixed-test-environment-and-level3-release-gate.md`
- 防回歸 verifier：`scripts/verify-local-origin.mjs`／`npm run verify:local-origin`
- 直接受影響：`package.json`、`.env.test.example`、`.env.test.local`、`scripts/local-test-server.ps1`、active browser verifier 與 `README.md`。
- 歷史 QA/QC、archive、Supabase DB loopback、P9／preview URL 不在本 DEV 修改範圍。

### Current Execution Contract

- **Canonical**：所有 local-test browser opening、Auth redirect、新 QA/QC 證據與文件使用 `http://localhost:4000/`。
- **Bind**：Vite 維持 loopback-only bind；`127.0.0.1` 可作 server bind，不作 user-facing URL。
- **Safety**：固定 port 被占用時先辨識 owner；未驗證 owner 不可 stop／restart。
- **State**：`localhost` 與 `127.0.0.1` 是不同 browser origin，既有 local state 不自動搬移。
- **Release boundary**：本 DEV 只含 local code、test、evidence 與必要文件；不含 commit、push、PR、merge、deploy、production data 或 release。

### 驗收標準

- `npm run dev:local` 啟動或重用固定伺服器後，輸出並開啟 `http://localhost:4000/`。
- active `package.json`／launcher／browser verifier／test env 不再產生 `http://127.0.0.1:4000`。
- `npm run verify:local-origin`、`npm run verify:test-env`、TypeScript、targeted lint／build 通過。
- 既有 `127.0.0.1` bind、資料庫/API loopback、P9／preview 與歷史 evidence 未被誤改。

### Execution Result

- RD：已完成 canonical origin、launcher URL、active browser verifier、test redirect 與 README 收斂；新增未驗證 port owner 保護與 local-origin verifier。
- QA/QC：`verify:local-origin` 通過（455 active files、staleReferences=0）；`verify:test-env` 通過且 redirect=`http://localhost:4000/`；`npm run dev:local` 重用既有 primary runtime（PID 42856）並輸出 canonical URL；HTTP smoke 200；PowerShell syntax、TypeScript、`build:test`、`git diff --check` 通過；lint 0 errors／55 warnings；DEV-079 browser smoke 以 canonical BaseUrl 通過，console/page/network errors=0、390px overflow=0。
- Spec Drift：`In sync`。ADR-037、DEV-080、launcher、active verifier、test env、README 與 runtime evidence 一致；不改 production、DB loopback、P9／preview 或歷史 evidence，無 blocker。
- 本地實作未執行 commit、push、PR、merge、deploy、production data 或 release；若要 release，需由使用者另行提出並進既有 release gate。

## DEV-081：手機看板 A／B 2～3 倍閱讀尺寸與雙指切換

### 2026-08-24 `4a947ef` 階層回歸修復與提交盤點

- 根因：`4a947ef` 將 `KanbanChecklist` 原本全 viewport 的 inline `paddingLeft = depth * 14 + 4` 改成 `--kanban-checklist-depth`，但當時只有手機／touch selector 會消費該變數，造成桌機父子任務 computed `padding-left` 同為 `0px`。
- 修復：保留共用 `KanbanChecklist` 與單一深度變數，在全域 `.kanban-checklist-item` 建立唯一的 depth-to-padding 規則；桌機／手機緊湊 fallback 為 base `4px`、每層 `14px`，手機放大只透過既有 token 覆寫為 base `10px`、每層 `35px`，沒有新增桌機或手機分支元件。
- Prevention：DEV-081 static verifier 新增「consumer 必須位於 mobile media 之外」契約；browser verifier 新增同一卡片 depth 0／1 的 computed padding 與 title X 差，並增加 `QA-081-R10` desktop hierarchy case。
- Rendered evidence：1024×768 desktop=`4/18px`、delta=`14px`、title delta=`14px`；390×844 compact=`4/18px`、delta=`14px`；390×844 large=`10/45px`、delta=`35px`。三種模式均由真實 localhost DOM computed geometry 量測。
- 提交盤點：該提交共 146 files、`+5308/-741`，混合 DEV-076～079、DEV-081～082、TaskDetails autosave、realtime 與 local-origin test infrastructure。逐一檢查 production source deletion／replacement 後，唯一確認的產品回歸是本次桌機 hierarchy indentation；另確認一個 QA 缺口（原 `R09` 只驗 mobile toggle／effective size，沒有量父子幾何）與一個 change-isolation 風險（多個獨立 DEV 合併於單一提交，降低 rollback／bisect 精準度）。
- 相關 gate：DEV-076 `12/12`、DEV-077 `6/6`、DEV-078 `5/5`、DEV-079 `6/6`、DEV-081 static `32/32`、DEV-082 contract PASS；遠端 Supabase two-user 與 iPhone／Android physical gates 仍是既有 pending，不列為本提交已確認 defect。
- Engineering gate：`tsc --noEmit`、targeted ESLint、canonical local-origin 478-file scan、`build:test`（2020 modules）與 `git diff --check` PASS。
- Runtime：重用既有 primary `http://localhost:4000/`；卡住的隔離 CLI browser 啟動流程及其 task-owned process 已停止，改用 in-app browser 完成只讀幾何驗證；primary server 保留。

- 文件成熟度：`Implemented / Automated UI PASS`
- 狀態：完成 RD 本地實作／9-case browser smoke PASS／完整 QA 與實機待補／未 Release
- 節點類型：交付點
- 父交付點：DEV-001、DEV-029；DEV-054 為 task drag regression authority
- 原始需求邊界：使用者要求保留手機看板現況 A，新增明顯較大的 B，於看板工作區以雙指放大切 B、雙指縮小切 A；後續明確更正放大幅度至少 2～3 倍。
- 風險等級：Medium（手機核心 UI、多指手勢仲裁、捲動／拖曳幾何與可存取性）
- Spec Impact：`Compatible extension`；不取代 `SPEC-029` Pan-First、`SPEC-054` drag owner，不改 schema、API、permission 或 domain data。

### 問題與產品決策

現行緊湊看板適合總覽，但部分文字與操作面過小。B 不採 12～16px 的微調方案，而是把欄頭、L2／L3+ 標題、日期／標籤、欄寬、卡片內距及主要點擊目標協調放大；六組代表性線性尺寸的 `B/A` 都必須在 `2.0～3.0`，RD 預設基準為 `2.5`。

2.5 倍線性放大約需 6.25 倍面積，因此 B 只顯示局部內容是預期行為。產品以看板內平移、pinch 中點錨定與唯一 scroll owner 維持方向感；不得用縮小幅度換取假總覽，也不得把 App shell 一起放大。

### Authoritative Package

- 產品／RD 契約：`ai-doc/specs/SPEC-081-mobile-kanban-dual-scale-pinch.md`
- QA FMEA／AI UI-only 驗證：`ai-doc/qa/QA-DEV-081-mobile-kanban-dual-scale-pinch.md`
- 既有互動 authority：`SPEC-029`／`QA-DEV-029`、`SPEC-054`／`QA-DEV-054`
- 不新增 ADR；若未來要全 App 連續縮放、browser viewport zoom 或跨模式縮放引擎，再另立決策。

### Implemented Package / QA Evidence

- 新增 `kanbanViewSize.ts`、`KanbanViewSizeProvider.tsx`、`kanbanViewSizeAnchor.ts`，分別擁有純契約／本機帳號偏好、React state與anchor adapter、board scroll capture／restore。
- `App.tsx`負責authenticated provider；`MainLayout.tsx`負責mobile board可見toggle；`BoardView.tsx`以單一canvas ref接合provider、pan broker、drag cancel與root selectors。
- `useMobilePanBroker.ts`是唯一multi-touch owner；`useLongPress.ts`、`useTouchTapGuard.ts`只做defense in depth；`useTaskDragSession.ts`固定暴露reason=`multitouch`的零提交cancel。
- preference key固定`projed-kanban-view-size:v1:account:<encoded-account-id>`，只存本機`compact|large`；不修改`accountPreferencesService`、profiles、schema、API或permission。
- CSS以board-root tokens將A現況與B=2.5倍離散重排；L3 indent改用CSS depth variable。禁止CSS `zoom`、`transform: scale`、全頁touch-action或viewport禁縮。
- 逐檔patch manifest、typed contract、threshold、anchor演算法、failure recovery、S0～S4 slice、commands、artifact與本機feature recovery已寫入`SPEC-081`；P0／P1 readiness gap=`0`。

### 核心契約

- A=`compact/1.0`；B=`large/2.0～3.0`，預設 `2.5`。看板 root 暴露穩定 mode state，工具列提供可見且可存取的 A／B toggle，pinch 不得是唯一入口。
- 手勢狀態機為 `IDLE → PINCH_CANDIDATE → COMMITTED → WAIT_ALL_RELEASE → IDLE`；第二指先取消尚未提交的 tap／pan／long-press，單次 gesture 最多切換一次。
- A→B 需同時達 `d/d0 >= 1.15` 與距離增加至少 24px；B→A 需 `d/d0 <= 0.87` 與距離減少至少 24px。兩指等距平移、門檻內抖動、第三指或 cancel 不得誤切。
- active task drag 後加入第二指時，只能零提交取消 drag，不得 drop 或切模式；modal／input／popover／action rail 等受保護 owner 內手勢不得穿透看板。
- 切換採 layout reflow 與 canonical geometry；不用 CSS `zoom`，不得以視覺 transform 建立第二套 hit-test／drag／overlay 座標。
- 顯示模式僅為同帳號同裝置 preference，不 dirty board／task，不寫 activity log，不新增 schema／API／permission。

### QA 交付與驗收

- QA 已完成 21 項 pre-implementation FMEA，風險包含倍率不足、long-press／drag 雙 owner、pinch release 誤點、browser 原生 zoom 衝突、active drag 誤 drop、stuck state、scroll owner、anchor drift、transform 座標錯位、偏好污染、desktop 外溢與 emulator／真機落差。
- AI 計畫包含 20 項 browser UI-only cases；只允許真實 locator／keyboard／pointer 與 CDP multi-touch 操作，加上唯讀 DOM／geometry／error 收證。禁止直接 store、API、storage、DOM mutation 或 `dispatchEvent` 製造通過狀態。
- Automated browser matrix：320x844、390x844、430x932、844x390、touch 1024x768；desktop 1024x768／1440x900 為 negative boundary。
- iPhone Safari 與 Android Chrome 各需 physical supplemental gate。只有 automated evidence 時，結論最多為 `Automated UI PASS / Physical device pending / 未充分驗證`。
- 本輪 evidence：`npm run verify:dev-081-mobile-kanban-dual-scale-pinch` PASS；browser `QA-081-R01～R09` 全 PASS，artifact=`output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json`，console／page／request errors=0；320／430／touch-1024、DEV-029／054 regression 與實機尚未執行。

### 下一步、停止條件與 release boundary

- 下一步：QA／QC 補完 20-case matrix、DEV-029／054 regression 與 iPhone Safari／Android Chrome physical gate；第一個 slice failure 或 scope 升級即停止。
- 任一倍率低於 2.0／高於 3.0、pinch 造成資料異動或誤觸、body overflow、控制項不可用、stuck owner、需停用全頁 browser zoom、需改 schema／API／permission，立即停止。
- 本輪已完成 S0～S4 產品與 verifier 實作，啟動並清理本地 test runtime，執行 pure verifier、typecheck、test build 與 9-case browser smoke；未執行完整 20-case QA、實機、commit、push、PR、merge、deploy、production data 或 release。


## DEV-082：看板多人即時同步

- 文件成熟度：`Implemented / Local QA-QC PASS`
- 狀態：本地實作完成／remote migration 與 authenticated two-user smoke 待 release gate／未 Release
- 節點類型：交付點
- 父交付點：DEV-026、DEV-036
- 是否計入產品交付完成：是（Remote Gate Pending）
- 原始需求邊界：不同已授權使用者同時開啟同一看板時，任務與其可見協作資料需自動同步，不要求重新整理。
- 風險等級：Medium（共享資料即時訂閱、publication、跨使用者一致性；正式 migration 屬 High gate）
- Spec Impact：`Intentional extension`；沿用 Supabase、現行 RLS、partial update 與 optimistic UI，不改 role capability 或資料欄位。

### 效用決策與範圍

現有產品已使用 Supabase Postgres Changes client channel，但 migration history 沒有 publication contract，且 callback 對每個事件平行整板重讀。相較另建 Broadcast trigger／private topic／Realtime Authorization，補強既有 Postgres Changes 的導入成本與回歸風險較低，能最快取得目前團隊規模所需的同步效用；未來若 event volume、授權檢查成本或延遲超過 gate，再以 Broadcast 作 re-entry。

ADR not needed：本輪不更換 provider 或既有 realtime 架構，只把現行 Postgres Changes 補到可運作且可驗證；Broadcast 是規模門檻觸發後的 future re-entry，不是本輪互斥架構決策。

本 DEV 包含 task、dependency、tag assignment、workspace／board metadata、member／role／profile 的現行 channel tables；不包含 presence、逐字共編、CRDT／OT、離線 merge、欄位鎖或版本歷史。同一欄位同時寫入仍由資料庫最後提交者生效。

### Authoritative Package / Implemented Package

- `ai-doc/specs/SPEC-082-board-realtime-collaboration.md`：資料流、race closure、single-flight、failure recovery、migration、驗收與 release boundary。
- `supabase/migrations/20260820080310_board_realtime_collaboration.sql`：以 `pg_publication`／`pg_publication_tables` 可重複檢查後，把現行 subscription tables 加入 `supabase_realtime`；不改 RLS。
- `src/utils/coalescedAsyncRefresh.ts`：40ms burst coalescing、single in-flight、one trailing read 與 cleanup cancellation。
- `useSupabaseSync.ts`：active board subscription、`SUBSCRIBED` 後一致性讀取、tag assignment、unfiltered hard DELETE 補抓、online／visibility recovery。
- `useTagSync.ts`／`useMemberSync.ts`：同一 scheduler 與 subscription race closure，避免 task 已更新但標籤或成員顯示停留舊狀態。

### QA／QC Evidence

- `npx tsx scripts/verify-dev-082-board-realtime-sync.ts`：burst coalescing、single-flight + trailing read、cleanup、subscription race、DELETE／tag coverage、publication contract PASS。
- `npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` PASS。
- Rendered QC：重用 `http://localhost:4000/` primary runtime，DEV-081 browser 390x844、844x390、1024x768 共 9/9 PASS；console errors=0、page errors=0、HTTP 4xx/5xx=0，最新 screenshot=`output/playwright/dev-081-mobile-kanban-dual-scale-pinch-1787213265640-final.png`。
- QC 結論：本地程式與 rendered app `PASS`；因 local-test backend 不會啟用 Supabase hook，且本輪沒有兩個 authenticated Supabase 測試帳號，遠端 two-user 行為為 `未充分驗證`，不得等同 production ready。

### Spec Drift／Runtime／Release Boundary

- Spec Drift：`In sync`。SPEC-082、migration、三個 sync hooks、scheduler 與 verifier 一致；既有 App／BoardView 工作中變更未被覆蓋。
- Runtime：只重用既有 primary `localhost:4000`（listener PID 18288）；Playwright session 已由 runner 關閉，沒有新增 cleanup obligation；primary runtime 維持運作。
- 未執行 commit、push、PR、merge、Supabase remote migration、deploy、production data 或 release。下一步必須進 deployment/release gate，先 test project 再 production。

## DEV-083：正式發版環境隔離與 artifact 完整性閘門

- 文件成熟度：`Implemented / Released / Permanent Credential Unrecoverable Policy`
- 狀態：P0＋P1已實作並發布；Edge Functions新key遷移與legacy停用完成；DEV-083 retired credential set 已由使用者永久判定不可回收，strict gate改採 project-bound policy waiver
- 節點類型：交付點
- 父交付點：無（Release Governance；相容延伸 ADR-037）
- 是否計入產品交付完成：是（實作與 QC 通過前不得計為已交付）
- 原始需求邊界：使用者確認執行P0＋P1並不做P2；P0＋P1程式與開發文件已完成，P2不納入。
- 風險等級：Medium implementation／Lane 2 release；正式Edge Function與legacy停用為Lane 3；歷史 PAT 值不可回收為已接受High residual risk，現行 credential active probe仍保留
- Spec Impact：P0＋P1為 `Compatible extension`；2026-08-26使用者以`Intentional replacement`明確核准 DEV-083 retired credential set 的永久 policy waiver，僅對該 credential set 缺值時不再阻擋，其餘candidate、activation與canonical smoke保留。
- 規格／驗證權威：`ai-doc/specs/SPEC-083-production-release-environment-integrity.md`、
  `ai-doc/qa/QA-DEV-083-production-release-environment-integrity.md`

### Human Confirmed Execution Boundary

- Current phase：P0環境／artifact fail-closed與P1入口已完成；sealed release `20260821144058-509110`通過candidate後啟用正式Hosting，canonical smoke PASS。
- Credential phase：`calendar-feed`／`match_project_knowledge`已改用新key、部署與停用legacy均完成；使用者於2026-08-26確認 DEV-083 retired credential set 永久不可回收，policy 綁定production project ref，現行 PAT／publishable／secret key 仍保持 active probe。
- P2：使用者明確不採用；不建立CI workflow、protected environment、IAM或direct-deploy技術封鎖。
- 必要人類決策：本次production activation go/no-go已由使用者確認；未發生額外re-auth／2FA。
- 本機一次性 env profile migration 已提供 `npm run migrate:test-env-profile`；目前 dry-run 因 `.env.local` 與 `.env.test.local` 的 `VITE_DATA_BACKEND` 值不同而 fail-closed，未自動覆寫，需人類先決定保留哪個 test profile。
- 成本：P0＋P1沿用既有 Firebase Hosting／Supabase／Playwright，不新增固定月費；candidate／activation仍可能消耗既有 Hosting preview quota與網路流量。
- 本輪已完成local、candidate與canonical production驗證；credential policy 已納入 release gate，strict check 在缺少既定 retired credential set 值時可通過，但不得套用到新 project 或新 credential generation。

### 問題、影響與使用者價值

2026-08-20 18:05 的 Firebase Hosting 版本 `d8b523` 將測試 Supabase project
`fhisnnufoeulxqrchldf` 寫入 production bundle `assets/index-DG4UDv9H.js`；Google OAuth
因而使用測試專案的 callback 設定，登入後導向 `localhost:3000`。2026-08-21 09:09 已將
Hosting rollback 至 2026-08-20 12:10 的 `1a798e`，正式站改載
`assets/index-DcU8rMpv.js`、只包含 production project
`knodlkxqpcqyrtgwpdst`，OAuth callback 與登入後資料載入 smoke 通過。

Rollback 只修復目前事故，未改變造成錯誤的發版機制。本 DEV 的使用者價值是：任何正式發布在
啟用流量前，系統都能客觀證明 build 使用正確 production 環境、部署的是同一份已驗證 artifact，
且 OAuth 最終回到正式網域；錯誤環境應自動阻擋，而不是依賴發布者人工注意。

使用思考習慣：#多層次分析、#效用理論、#可驗證性

### 已確認根因與控制失效

| 層次 | 已確認事實 | 控制失效 |
|---|---|---|
| 症狀 | Google 登入後跳到 `localhost:3000` | 正式站使用了錯誤 Auth 專案 |
| 直接原因 | production JS 內嵌 ProJED-TEST Supabase ref | build artifact 沒有環境身分檢查 |
| 作用機制 | `p7-release-gate.mjs` import `load-local-env.mjs`，再把污染後的 `process.env` 傳給包含 `verify:source`／Vite build 的所有 child process | 測試驗證與 production build 共用同一個可變 process environment |
| 貢獻因素 | 通用 loader 依序讀取 `.env.p8.local`、`.env.local`、development／production local 與 `.env`，並把 `VITE_SUPABASE_*` alias 成 `SUPABASE_*` | 沒有 profile allowlist、環境一致性 invariant 或 cross-profile rejection |
| 漏檢原因 | 現有 production auth verifier 檢查 auth mode／test credentials 清除，browser smoke 檢查 app shell／asset／console，但未驗證 bundle 中實際 Supabase ref、redirect 與 callback 最終 Location | gate 證明「build 可運作」，沒有證明「build 屬於 production」 |
| 系統性根因 | staging、production build、remote readiness 與人工確認未綁定同一 artifact identity | release gate 不是 fail-closed、artifact-centric contract |

反事實檢查：若 production build 使用獨立且拒絕污染的環境、artifact 必須通過預期 project／redirect
掃描、OAuth callback 必須回正式網域，則相同的測試 ref 即使存在於本機，也無法進入可部署 artifact；
同類事故會在啟用前被阻擋。

### CAPA／PA 追溯

| 根因 | 立即矯正 CA | 永久預防 PA | 效用判斷 | 驗證證據 | 建議流向 |
|---|---|---|---|---|---|
| 錯誤 artifact 已上線 | Hosting rollback `d8b523` → `1a798e` | 不以 rollback 取代 release gate 修正 | 已恢復服務，但不降低下一次污染機率 | 正式 bundle、Supabase ref、OAuth callback 與登入後 app smoke | QC incident evidence |
| process env 污染 production build | 無追加 production 變更 | 測試 `VITE_*` 移出通用 `.env.local`；release 使用明確 production profile 與 allowlist | 高效益、低 runtime 風險 | 污染注入 negative test、缺 env fail-closed | dev_task／release gate |
| build 與 remote verifier 共用 env | 無 | P7／P8 不得用通用 loader 建 production artifact；build env 與 server-only verification env 分離 | 同時降低錯環境與管理金鑰傳入 Vite 風險 | child env contract、secret boundary test | dev_task／project SOP |
| artifact 身分未驗證 | 無 | build 後掃描 project ref／redirect／forbidden origin，記錄 entry bundle 與 SHA-256 | 可直接攔截本事故 | artifact manifest、forbidden-value verifier | release gate |
| OAuth 只驗證起始 URL或人工旗標 | 安全 cancel callback 已手動驗證 | 自動模擬 OAuth cancel callback，最終 Location 必須為正式網域；evidence 綁定 artifact hash | 不需真實登入或寫資料即可驗證核心風險 | authorize/callback 302 chain | QA plan／release gate |
| staging 證據被誤當 production artifact 證據 | 無 | Level 3 繼續驗證 ProJED-TEST 整合；production artifact 另做 env／artifact／production-bound read-only gate | 保留既有測試效益並消除證據越界 | 各層 artifact identity 與 evidence boundary | ADR-037 addendum／release gate |

### Current Phase Scope（P0＋P1）

- P0：`.env.production`成為production public-env唯一authority；test/local與`.env.p8.local` server env分流。
- P0：Vite使用task-owned isolated envDir與sanitized child env；P7／P8改為per-step server-key allowlist。
- P0：build once後建立release-meta、deterministic manifest/tree hash、project-ref／secret／tamper verifier。
- P0：OAuth manual boolean gate改為不登入、不寫資料的safe cancel callback 302-chain verifier。
- P1：唯一正式入口`release:production`分成prepare、candidate、activate三phase；candidate不可自動activation。
- P1：inactive Firebase candidate與live production都需remote entry hash、release-meta與OAuth provenance。
- P1 remediation：Edge Functions已改讀新publishable／secret JSON key maps，production smoke後已停用legacy；DEV-083 retired credential set 由永久 policy 取代找回要求，並保留現行 credential active probe與 project-bound scope。
- 完整loader、public/server keys、manifest schema、逐檔impact、failure recovery與phase contract見`SPEC-083`。

### Out of Scope

- 不建立CI workflow、protected production environment、Firebase credential owner或IAM/direct-deploy限制（P2）。
- 不修改DB schema、RLS、migration、正式資料、Supabase Auth dashboard、Google OAuth scope或登入UI。
- 不把ProJED-TEST的localhost redirect視為錯誤；錯誤是production artifact指向test project。
- 不以硬編碼URL、擴大redirect allowlist、教育訓練或人工checklist作為唯一PA。
- 不自動rollback；post-deploy失敗由release gate保留previous version並回到go/no-go決策。

### Final Acceptance Summary

- Conflicting parent env、缺production key、錯Supabase ref／redirect／Firebase target都在build或deploy前失敗。
- `.env.local`不得影響sealed build；`.env.p8.local`的service role／DB password／PAT不得進入Vite或artifact。
- production artifact只允許`knodlkxqpcqyrtgwpdst`與`https://projed-cc78d.web.app/`的resolved identity；
  app-owned local origin、test ref或test credential literal命中即失敗，vendor generic localhost不得假陽性。
- manifest tree hash可重算，任一byte改變即使candidate／activate失效；不得自動修manifest或rebuild接續證據。
- OAuth authorize→safe cancel callback最終Location回正式origin，不需真實登入或資料寫入。
- prepare沒有remote side effect、candidate不啟用live、activate缺獨立approval release ID必須失敗。
- canonical smoke驗證HTTP／asset、app shell、errors、remote hashes、release-meta、Supabase ref與OAuth callback。
- P2不得出現在code/config；manual direct deploy仍可繞過P1，列為使用者已接受殘留風險。
- 本次永久 policy 僅對 `scripts/release/credential-rotation-policy.json` 明列的 DEV-083 retired credential set 生效；strict gate 對該 set 缺值時通過，提供值時仍探測，其他 project／generation／release gates 不受豁免。

### RD Slices、QA/QC 與 Evidence

- S0：先建立process-env、local-env、secret、tamper、OAuth與phase negative fixtures。
- S1：production contract、local/server loader與sanitized child env。
- S2：sealed build、release-meta、manifest與artifact verifier。
- S3：OAuth safe cancel self-check與production-bound adapter。
- S4：`release:production` prepare／candidate／activate orchestration與browser provenance。
- S5：依`QA-DEV-083`完成local mandatory matrix、Spec Drift與QC handoff；第一個失敗即停止。
- S6：Function rollback snapshot、新key部署／smoke、legacy停用／readback已完成；Management PAT歷史值以永久不可回收 policy 收斂，現行 credential active probe與 strict gate evidence 已通過。
- Evidence root：`output/release/dev-083/<release-id>/`；generated artifact/evidence不加入Git，secret不落盤。

### 文件、執行與 Release Boundary

- RD Readiness：`PASS`。P0＋P1具repo/file impact、env/manifest/phase contract、failure recovery、QA FMEA、QC cases、stop conditions與evidence path；S0～S5及受控release已完成。
- ADR：不新增。DEV-083保持ADR-037 compatible extension，Level 3 authority、provider與activation ownership未改。
- Release Feasibility：現有Firebase Hosting/Supabase能力足夠，不需新固定月費；實際release屬Lane 2，
  仍需Layer 1-2、targeted Level 3、inactive production candidate、獨立activation decision與canonical smoke。
- 實作與證據：`npm run verify:source` PASS（lint 0 errors／tsc／sealed build／既有 Supabase static、migration alias、calendar、core regression、P9 gate）；
  `npm run verify:dev-083-production-release-gate` PASS（19項 local fixture／negative／sanitized runtime child／credential evidence mode／full-manifest remote hash／supported command contract／live-channel snapshot與phase safety；QA-083-01～05 local PASS）；
  `npm run verify:production-artifact` PASS（最新 manifest tree／contract／ref／secret／tamper scan）；
  `npm run verify:dev-083-oauth-cancel` PASS（valid／invalid synthetic 302 chain）；`npm run verify:dev-083-layer2` PASS（exact artifact browser／provenance／cleanup）；`node scripts/p8-preflight.mjs --strict` PASS、`npm run verify:production-bound-readiness` PASS。`node scripts/p8-credential-rotation-check.mjs --strict` PASS（policy `DEV-083-retired-credential-set-20260826`；current keys active，retired set 缺值以`permanently-unrecoverable`通過）；flags=false fixture亦 PASS。
- Release evidence：commit `4ee8bf8024daf3c7a92a208c733404d7cc63058a`、release `20260821144058-509110`、tree `c8abe0ce...b113c54`；candidate `https://projed-cc78d--production-candidate-k86qbpc8.web.app`／version `880dfc3bbbc5d8b3`，live version `ca48cc7d514432d8`。
- Candidate與canonical均39/39 entries hash、release-meta、browser root、console/page/network、OAuth callback PASS；既有authenticated Chrome session重載後留在canonical URL、工作區與真實資料可見、無visible alert／inline error／localhost。回滾reference為version `93c2a80ddc1a798e`。
- Generated evidence：`output/release/dev-083/20260821144058-509110/{risk-acceptance,candidate-evidence,activation-evidence}.json`（gitignored、無secret）。

## DEV-084：非主按鍵不得觸發主按鍵互動

- 文件成熟度：`RD Implemented / QA-QC PASS`
- 狀態：已實作／QA PASS／QC PASS／未 Release
- 節點類型：開發點
- 父任務：DEV-070；相容權威 DEV-028、DEV-053、DEV-076、DEV-077
- 是否計入產品交付完成：是（local required gates；未 Release）
- 原始需求邊界：`USER-20260822-NON-PRIMARY-POINTER-ISOLATION`；使用者回報看板中鍵誤啟動左鍵功能，並要求以多層次分析盤點全系統同型問題後寫到 RD 可實作。
- 風險等級：Medium；P0 defect path 可改動 task order／parent、Gantt date 或 relationship，P1 path 可持久化 panel width或中斷 dialog flow。
- Spec Impact：`Compatible correction / raw-input isolation`；修正實作漂移，不取代既有 primary／secondary／middle-pan／keyboard／mobile產品契約。

### 問題、根因與價值

系統已在 `DEV-070 / ADR-043` 定義 `Raw Input → Trigger Normalizer → Profile Resolver → Semantic Action → Guard → Command`，但 raw button eligibility 沒有共用實作。`useTaskInteractionBinding` 接收的是已具語意的 trigger，sensor、resize handle、relationship layer 與 backdrop各自決定是否把 DOM event當成 primary；部分入口只排除右鍵，部分完全未檢查 button。

盤點與真實瀏覽器已確認五類缺口：共用 `SmartMouseSensor` 讓中鍵跨過8px門檻後進入 task drag；Gantt左右日期 handle接受中鍵；Workspace／Task Workbench／Record三個 resizer接受任意 pointer button；Mindmap relationship path／label／endpoint會以中鍵選取或拖曳並搶走既有 middle pan；Task Details／Board Share／Calendar delete backdrop以任意mousedown關閉。

反事實檢查：若每一個 raw primary owner在第一個 side effect前都套用同一個 `button===0 && isPrimary!==false` guard，則相同中鍵事件不會建立 drag／resize／selection／dismiss state；同時因事件沒有被 prevent／stop，Mindmap canvas仍可取得有意的 middle-pan owner。這是本 DEV 的最小充分修正。

使用思考習慣：#多層次分析、#風險導向、#可驗證性、#反事實檢查

### Authoritative package

- 產品／RD contract：`ai-doc/specs/SPEC-084-primary-pointer-button-isolation.md`
- QA FMEA／QC matrix：`ai-doc/qa/QA-DEV-084-primary-pointer-button-isolation.md`
- 架構 authority：`SPEC-070`、`ADR-043`；本 DEV補齊既有 Trigger Normalizer前置不變量，不改 semantic dispatch API。
- 行為 regression authority：`SPEC-028`（跨模式 primary／secondary）、`SPEC-053`（task drag）、`SPEC-076`（left/middle canvas pan）、`SPEC-077`（relationship endpoint）。
- ADR：不新增；未更換 Interaction Kernel、profile、provider、資料模型或長期架構。

### Current phase contract

新增 pure `src/interactions/pointerActivation.ts`，輸出 `isPrimaryPointerActivation({button,isPrimary?})`。Mouse `button=0`與 Pointer `button=0,isPrimary!==false`可進 primary；middle/right、non-primary touch／pen與非0 barrel button fail closed。Helper只判 eligibility，不做 permission、mode、action或data決策。

所有 rejected event必須在 `preventDefault()`、`stopPropagation()`、pointer capture、state、listener、cursor、preference或domain mutation前return。修正範圍固定為：

| Owner | RD contract | 保留契約 |
|---|---|---|
| `useDragSensors.ts` | SmartMouseSensor在原activator前拒絕非primary | 8px、KeyboardSensor、interactive target、mobile long-press不變 |
| `GanttTaskBar.tsx` | shared starter與兩個resize handle defense-in-depth guard | locked handle不得冒泡成bar move；日期算法不變 |
| Sidebar／Workbench／Record resizer | 三個pointerdown在side effect前共用guard | clamp、方向鍵、preference key不變 |
| Mindmap relationship layer／View | path、label、endpoint拒絕非primary且不吞事件 | relationship左鍵／鍵盤、middle pan、single Scene不變 |
| 三個 modal backdrop | 只有primary且exact backdrop target才close | content、X、Escape、confirm、自動儲存不變 |

通用 non-mutating popover／picker outside-dismiss、原生 button click與合法 context-menu不在本輪改寫。這個排除是為避免把「終止 transient layer」誤當成domain primary action而造成過度修正。

### RD slices 與完成定義

- S0：新增 DEV-084 pure/static與browser failure-first cases，保存五類修正前 fail摘要與可重置 fixture。
- S1：完成 pure normalizer與共用 task drag sensor；Board／List／Workbench／Shared Sidebar的middle/right矩陣通過。
- S2：完成 Gantt與三 resizer；non-primary不得改日期、geometry、width、preference或cursor lifecycle。
- S3：完成 Mindmap relationship owner仲裁；relationship target起手的middle pan可用且relationship零寫入。
- S4：完成三 modal backdrop；middle/right保持開啟，left／X／Escape／confirm不回歸。
- S5：執行 `SPEC-084` required commands、`QA-DEV-084` B01～B19、Spec Drift與QC handoff；Calendar 使用 query-gated local fixture，artifact固定 `output/playwright/dev-084-primary-pointer-isolation/result.json`。

Done 已滿足 AC-084-001～012 的 owner/static/rendered 覆蓋：QA S01～S08、DEV-084 browser B01～B03／B06～B10／B12（Task Details／Board Share／Calendar）／B13，並以 DEV-028／029／046／053／054／070／076／077、DEV-017、resizable-navigation regression 覆蓋 B04／B05／B11／B14～B19；non-primary domain/preference commit=0；console/page/visible/request error=0；runtime與 browser session cleanup 完成。Physical mobile supplemental gate仍明確標示 Not Run；Static、TypeScript或build仍不能取代 rendered UI evidence。

### Failure recovery、停止條件與 execution boundary

- Slice第一個有效失敗即停止，記錄button、target、viewport、座標、before/during/after、資料污染與screenshot，回RD修正後重跑直接受影響slice及regression。
- 正向控制若改 local fixture／preference，必須以相同 UI在 `finally`回到起始值；不得直接呼叫store、API、DOM mutation或production資料製造通過。
- 若本任務啟動port 4000 runtime，需記錄owner process tree並在結束時只停止該tree；重用matching primary runtime時不得停止。
- 非primary仍可寫task/date/relationship/preference、right menu／middle pan／left／keyboard／touch回歸、stuck cursor/overlay、visible error或需改schema／permission／backend，立即停止。
- 本輪已完成產品程式實作與 local QA/QC evidence；仍未授權 commit、push、PR、merge、deploy、production data、production smoke 或 release。Physical mobile supplemental gate若要執行，另由具設備能力的 QA 流程補驗，不回寫為本地 desktop completion 的阻塞。

### Readiness conclusion

`RD Implemented = PASS；QA-QC PASS`。Repo/file owner、pure API、button matrix、逐檔 patch、S0～S5、QA FMEA、rendered evidence、artifact、failure recovery、角色分工與 non-release boundary 均已固定；Calendar rendered local fixture 已通過，physical mobile 僅維持 supplemental Not Run，不延伸為真機完整通過。

## DEV-085：心智圖關聯線方向搖桿、端點外側定位與 DEV-077 意圖更正

- 文件成熟度：`RD Implemented / QA-QC PASS`
- 狀態：已實作／QA PASS／QC PASS／未 Release
- 節點類型：開發點
  - 父任務：DEV-027；更正 DEV-077；相容 DEV-027E、DEV-084
- 是否計入產品交付完成：是（local implementation + QA/QC；未 Release）
- 原始需求邊界：`USER-20260825-MINDMAP-RELATIONSHIP-DIRECTION-JOYSTICKS`、response annotation correction 與 `USER-20260825-MINDMAP-RELATIONSHIP-ENDPOINT-OUTER-EDGE`。
- Spec Impact：`Compatible correction / restore original relationship control intent`

### 使用者意圖與產品契約

使用者要求新製圖的關聯線增加如 XMind 的方向調整搖桿，並澄清先前沒有要移除控制臂與方形控制點；原意只是在控制臂 UI 多畫一條線時刪除那一條。現行 authoritative contract 因此固定為：

- 未選取關聯線時不顯示控制 UI；選取後顯示兩個 circular endpoints、兩條 `endpoint → control point` arms 與兩個 square direction joysticks。
- 不顯示 `control-1 → control-2` 中央導引線，也不恢復舊重複 SVG／HTML control points。
- 兩個搖桿可獨立拖曳；first drag 必須以畫面已計算的完整 c1/c2 pair 作 fallback，不能讓未拖曳側塌縮。
- pointerup 保存兩個 map-local control points，reload 後幾何一致，relationship from/to identity 不變。
- 命中區維持約 28 CSS px 且不因 zoom 改寫 map-local 座標；middle/right 不寫入，Escape 還原拖曳前 snapshot。
- 關聯線起點與終點各自依節點 branch direction 固定在外側垂直框線：右分支取右框線、左分支取左框線；既有 anchor 只保留 Y，建立 preview 亦相同。

### Authoritative package 與實作

- RD contract：`ai-doc/specs/SPEC-085-mindmap-relationship-direction-joysticks.md`
- QA plan：`ai-doc/qa/QA-DEV-085-mindmap-relationship-direction-joysticks.md`
- QC evidence：`ai-doc/qc/QC-DEV-085-mindmap-relationship-direction-joysticks.md`
- Product owners：`mindMapGeometry.ts`／`mindMapOverlayPaths.ts`（兩端外側 anchor 與各自出線方向）、`MindMapRelationshipOverlay.tsx`（兩條控制臂）、`MindMapRelationshipInteractionLayer.tsx`（兩個可存取搖桿）、`MindMapView.tsx`（preview、pointer lifecycle 與 fallback snapshot）、`mindMapRelationshipCommands.ts`（單點純更新與另一點保留）。
- ADR：不新增；沒有改 schema、storage key、API、permission 或 Interaction Kernel。

### Verification 與結論

- failure-first：修正前 DEV-085 static 2/7 PASS、5/7 FAIL，證實缺口可重現。
- 修正後：DEV-085 static 9/9、corrected DEV-077 6/6、DEV-027E 24/24、DEV-027G 97/97、DEV-084 7/7、TypeScript、targeted ESLint、`build:test` PASS；關聯線曲線／直線 fallback hit window=44px，移除重複 translate 並改為完整 click 後提交 selection；拖成曲線後 centerline 至 path `0.24px`，中心與 18px edge-tolerance 真實點擊成功。
- Rendered browser：1440×900 右分支→左分支 fixture 故意保存相反 anchor xRatio，起點對來源右框線、終點對目標左框線的誤差均為 `0.0044px`，Y 均在節點高度內；selected counts=`endpoint 2 / arm 2 / joystick 2 / center guide 0 / legacy 0`；拖曳 preview、pointerup persistence、reload、identity、middle/right negative、Escape rollback、100%／110% 28px hit target 全部通過。
- Responsive／error：1024×768 overflow=0；390×844 維持既有 mobile mindmap hidden boundary且 overflow=0；console/page/request/visible error=0。實機 iPhone／Android 未執行，不冒稱通過。
- Artifact：`output/playwright/dev-085-mindmap-relationship-direction-joysticks/result.json` 與四張對應截圖；已人工目視確認沒有中央多餘線。
- Runtime：重用既有同專案 port 4000（驗證時 listener `node.exe` PID 22732），本 DEV 未啟動或停止；自有 Playwright sessions 已關閉。
- 結論：`RD Implemented = PASS；QA-QC PASS；Spec Drift = In sync after correction`。未執行 commit、push、PR、merge、deploy、production data 或 release。

## DEV-086：全域工作台子樹暫存與跨看板搬移

- 文件成熟度：`RD Implemented / QA-QC PASS`
- 狀態：已實作／QA PASS／QC PASS／未 Release
- 節點類型：開發點
- 父任務：DEV-039；相容 DEV-044、DEV-053、DEV-065
- 是否計入產品交付完成：是（local implementation + QA/QC；未 Release）
- 原始需求邊界：`USER-20260825-GLOBAL-WORKBENCH-SUBTREE-STAGING`、response annotations 與 `USER-20260825-UNPLACED-INSERTION-PREVIEW`。
- Spec Impact：`Intentional replacement`（依 2026-08-25 使用者決策，將反向 staging、完整子樹與共用定位線納入手機 touch；排除 mobile subtree hover 與其他模式）

### 使用者意圖與產品契約

全域工作台不只是目前工作區內的暫存看板，而是目前帳號跨工作區、跨看板的 staging surface。使用者可將看板任務拖到未歸位區，切換目的看板後再拖回；父任務一律連同 canonical、未封存子樹搬移，暫存與歸位都保留 descendant parent links。工作台已歸位清單維持查閱用途，不提供 drag surface，只有未歸位列能開始拖曳。

### 根因、實作與設計判定

- 原本未歸位 lane 雖可接受工作台來源，但 BoardView 的 outside-board collision guard 會攔下看板來源，因此 UI 看似有投放區、實際無法完成反向 drop。
- 原本 placement normalizer／remote adapter 會把未歸位節點 `parentId` 清成 null，commit 也只更新 active root；即使打開 drop，仍會失去子樹結構。
- 原 mobile adapter 的 target union 沒有 `workbench-unplaced-lane`，因此即使桌機反向 staging 已完成，手機長按來源仍無法產生合法未歸位 intent。
- 新 pure subtree placement helper 統一計算兩方向 updates；store 以單一 batch／undo entry 更新，並以 leaves-first／root-first 控制跨儲存面順序，單節點 transition 固定先保存目的再刪來源。
- 未歸位 UI 重用 L3+ 的 checklist depth token、row class 與 task-surface／hover attributes，但不直接掛載耦合看板 context、selection、store mutation 與 DnD owner 的 `KanbanChecklist`。因此畫面與互動語言一致，同時保留單一責任與已歸位唯讀邊界。
- 未歸位 append 預覽則直接掛載看板既有 `KanbanInsertionMarker`；只新增零高度 overlay anchor，不複製 marker 視覺，也不讓定位線參與清單 layout。
- Mobile target adapter 新增明確的 `workbench-unplaced-lane` append intent；desktop／mobile commit 共用同一個 subtree-to-unplaced owner，`TaskDragPresenter` 以既有 marker 呈現水平落點。手機不新增 subtree hover 等價效果，清單／甘特／日曆仍維持 mobile board-only boundary。
- 不新增 ADR 或 migration；現有 JSONB 可保存完整 `TaskNode`，Supabase adapter 改為保留 `parentId`。

### Authoritative package

- RD contract：`ai-doc/specs/SPEC-086-task-workbench-subtree-staging.md`
- QA plan：`ai-doc/qa/QA-DEV-086-task-workbench-subtree-staging.md`
- QC evidence：`ai-doc/qc/QC-DEV-086-task-workbench-subtree-staging.md`
- Product owners：`taskSubtreePlacement.ts`、`taskDragTypes.ts`、`taskDragTargetAdapter.ts`、`taskDragCommit.ts`、`TaskDragPresenter.tsx`、`placementModel.ts`、`taskWorkbenchUnplacedService.ts`、`useWbsStore.ts`、`BoardView.tsx`、`TaskWorkbenchPanel.tsx` 與 `index.css`。

### Verification 與結論

- DEV-086 static PASS：移出／歸位皆為 3 節點，parent links preserved；TypeScript PASS。
- Rendered browser PASS：真實 pointer drag 完成 workspace A／board A→unplaced→切至 workspace B／board B；depth 0／1／2，列高 ≤21px，desktop indent 6px、narrow indent 5px，來源列＋完整子樹 hover 均可見且 count text=0。
- Mobile rendered PASS：390×844 與 320×844 以 CDP 原生 touch events 長按看板 parent，均命中 `workbench-unplaced-lane`、顯示共用 horizontal marker 並把三節點子樹整批放入未歸位；390×844 另完成跨工作區／跨看板整棵歸位，parent links 與 identity 保留。
- 歸位後三節點 workspaceId／boardId 都是目的 workspace B／board B，parentIds 為 `null`、root、child；placed root readonly=true 且沒有 drag surface；page error=0。
- L1 專屬 `wbs-column` 真實拖曳亦通過：group＋L2 child 進未歸位後保持可見，再跨工作區歸位時 group nodeType、child parent link 與 placed readonly 契約不變。
- 定位線真實拖曳通過：empty／populated 都使用同一 horizontal compact marker；dot 8×8px、bar 6px、wrapper height=0，list／empty anchor 位移 0px，populated marker 對最後一列底邊誤差 ≤1px；離開、重新進入與 drop cleanup 正確。
- Mobile boundary：subtree hover 預覽未導入；手機仍只開放 board mode，清單／甘特／日曆 5px 縮排不屬本 addendum。實機 iOS／Android與輔助科技未執行，不冒稱通過。
- Regression：DEV-039 31/31＋browser PASS、DEV-053 30/30、DEV-054 46/46、DEV-065 40 checks、`build:test` PASS。
- Artifact：既有 desktop 五張，以及 mobile 390／320 的 insertion preview、subtree result 與 390 cross-workspace restored screenshot。
- Runtime：重用既有同專案 port 4000 primary runtime，本 DEV 未啟動或停止；自有 Playwright session 已結束。
- 結論：`RD Implemented = PASS；QA-QC PASS；Spec Drift = In sync`。未執行 commit、push、PR、merge、deploy、production data 或 release。

## DEV-087：跨模式任務階層縮排一致化

- 文件成熟度：`RD Implemented / QA-QC PASS`
- 狀態：已實作／QA PASS／QC PASS／未 Release
- 節點類型：開發點
- 父任務：DEV-001、DEV-086；取代 DEV-081 的 hierarchy indent 尺寸例外
- 是否計入產品交付完成：是（local implementation + QA/QC；未 Release）
- 原始需求邊界：`USER-20260825-CROSS-VIEW-HIERARCHY-INDENT`、response annotation 1。
- 風險等級：Medium（跨四個主要視圖與 mobile A/B 契約）
- Spec Impact：`Intentional replacement / cross-view consolidation`

### 實作與優雅性判定

- `--task-hierarchy-indent` 是唯一 depth increment source：desktop `6px`、≤767px `5px`；不在四個元件各留一組常數。
- 看板保留 compact／large base `4px／10px`，清單 base `0px`，甘特／日曆共用側欄 base `10px`；這些是 surface 起點，不是階層增量。
- 清單移除 `level * 1.25rem`，甘特／日曆移除 `level * 14px`；共用 `SharedTaskSidebar` 以 surface identity 同時服務兩模式。
- 甘特／日曆的展開鍵與 leaf placeholder 統一為 18px；否則 leaf 的可見 title 會比 token 額外偏移 2px。
- 只新增非視覺 data attributes 作幾何 oracle；沒有新增 badge、helper、說明文字、容器或模式專用分支。

### QA／QC 結論

- Static：DEV-087 `9/9`、DEV-081 `32/32`、DEV-086 PASS；TypeScript PASS。
- Rendered：1440×900 與 760×900 覆蓋 board／list／gantt／calendar 共 8 組；每一組逐層 computed padding 與 title X delta 分別為 `6px／5px`，body overflow=0、console/page error=0。
- DEV-081 browser `10/10`：mobile compact／large indent 都是 5px，desktop 是 6px；其他 A/B 放大與 pinch cases 維持 PASS。
- DEV-086 真實 drag browser PASS：工作台未歸位 6px／5px、定位線與跨工作區子樹 round-trip 未回歸。
- Artifact：`output/playwright/dev-087/result.json`、`board-*`、`list-*`、`gantt-*`、`calendar-*` 八張畫面；已人工確認無重疊、額外容器或 document-level overflow。
- Runtime：重用既有同專案 `localhost:4000` primary runtime（listener PID 24272），本 DEV 未啟動或停止；自有 Playwright sessions 均已結束。
- 結論：`RD Implemented = PASS；QA-QC PASS；Spec Drift = In sync after intentional replacement`。未執行 commit、push、PR、merge、deploy、production data 或 release。

## DEV-088：任務完成、封存與永久刪除生命週期

- 文件成熟度：`RD Implemented / QA-QC PASS / Human Confirmed`
- 狀態：本機實作與 QA/QC 完成／未 Release
- 節點類型：交付點
- 父任務：DEV-029、DEV-038、DEV-044、DEV-062、DEV-070
- 是否計入產品交付完成：是（local implementation + QA/QC；未 Release）
- 原始需求邊界：使用者採用 `完成／取消完成 → 封存 → 永久刪除`。
- 風險等級：Medium（跨任務入口與不可逆刪除，不改 schema、provider 或角色來源）
- Spec Impact：`Intentional replacement`

### 目標與範圍

- active 任務表面保留完成切換並把「刪除任務」改為中性「封存任務」。
- 封存只改 `isArchived` 並保留依賴；回收桶還原後資料與關聯可恢復。
- 回收桶新增真正持久層永久刪除，命中子樹與 dependency，失敗不得假成功。
- 更新 DEV-029／038／070 authoritative addendum、targeted verifier 與 browser evidence。
- 不做 production migration、正式資料刪除、deploy、release、retention 或 permission schema 拆分。

### 驗收與停止條件

- active surface 無「刪除任務」；永久刪除只在回收桶且必須確認。
- archive／restore 保留 status、parent、identity 與 dependency；permanent delete reload 後不復活。
- P0/P1 static／browser／regression、TypeScript、build:test 與 visible-error gate全數通過。
- 任一永久刪除假成功、orphan、依賴遺失、無確認、非預期 4xx/5xx 或 UI 可見錯誤即停止並回 RD。

### 直接文件

- `ai-doc/specs/SPEC-088-task-lifecycle-complete-archive-delete.md`
- `ai-doc/qa/QA-DEV-088-task-lifecycle-complete-archive-delete.md`
- `ai-doc/qc/QC-DEV-088-task-lifecycle-complete-archive-delete.md`

### RD／QA／QC 結果（2026-08-25）

- RD：active task action 統一為 `task.archive`；mobile action key 改為 `archive`；WBS store 分離 `archiveNode` 與 `permanentlyDeleteNodes`；回收桶提供還原、單筆永久刪除與清空確認。
- Data：封存只更新 `isArchived`；還原保留 task identity／status／parent／dependency；永久刪除 cycle-safe 收集子樹、先清 dependency、再 leaves-first 刪 task，持久層成功後才收斂前端 state。
- DEV-088 browser：完成→取消完成、archive→restore、dependency fingerprint、取消刪除、注入 persistence failure、2 筆子樹永久刪除與 reload 均 PASS；console／page／response error 為 0。
- Rendered QC：1440×900 與 390×844 無 overflow；人工檢查發現 mobile action icon 對比不足後已提高綠色還原／紅色永久刪除辨識度，重驗 PASS。
- Regression：DEV-029 static 39/39 + browser PASS；DEV-038 static 20/20 + browser PASS；DEV-044 26/26；DEV-062 PASS；DEV-070 58/58；DEV-027G 97/97；TypeScript、build:test、targeted ESLint 0 error、diff check PASS。
- Runtime：使用本 DEV 專屬 `localhost:4001` Vite test runtime；完成前停止並確認 port 釋放。既有 `localhost:4000` primary runtime 不變。
- 結論：`RD Implemented = PASS；QA-QC PASS；Spec Drift = In sync after intentional replacement`。未執行 commit、push、PR、merge、deploy、production data 或 release。

## DEV-089：全域工作台權威任務搬移交易

- 文件成熟度：Rework 1 `RD Implemented / Local QA-QC PASS`；2026-08-25 實作／TEST／Level 3 為歷史 baseline
- 狀態：Production Reopen／Local Rework PASS／Supabase TEST與Level 3待執行／P0 Stop-Ship／未 Release
- 節點類型：開發點
- 父任務：DEV-086、DEV-039
- 是否計入產品交付完成：否（RD local完成；production 反向 flow仍是既知失敗，release gates未通過）
- 風險：P0 資料 ownership 一致性
- Spec Impact：`Compatible corrective amendment + Intentional replacement`；保留 SPEC-089 v1 的 transaction/security invariants，以 v2 intent command 取代 generic placement batch 與 client sibling order。

### Production reopen 事實

- 2026-08-26 production 真實操作「未歸位→看板」顯示 `歸位失敗，任務已保留在未歸位。`。
- Browser error：`Task placement transaction must cross the unplaced ownership boundary.`
- operation ledger 本次紀錄為 0，故 defect 位於 RPC 前的 client normalization／validation，不是 DB permission 或 rollback。
- canonical task 仍在未歸位，目的看板 identity 正常，無資料遺失。
- 直接 root cause：`buildTaskParentIndex` 只以 `parentId || 'root'` 分組；`normalizeTaskMoveUpdates` 因而夾帶不同 workspace／board root siblings，形成 mixed ownership batch。
- 桌機／手機共用 path，不能定義為 mobile-only hotfix；Level 3 先前只驗看板→未歸位，coverage 不完整。

### Rework 1 RD handoff contract

- 架構：`shared DropIntent → MoveTaskSubtreeCommand v2 → single Supabase atomic transaction → canonical placement/order result → frontend apply`。
- `TaskOwnershipRef` 區分 `board(workspaceId, boardId)` 與 `account_unplaced(auth.uid)`；`PlacementScope=ownership+parentId`，未歸位保持帳號級單一全域 lane，placement／reorder 不得再用 parent-only index。
- cross-boundary client 只送 root、exact subtree IDs、source、destination parent、anchor、before/after/append；不得送 task content、generic `BatchNodeUpdates` 或目的 sibling patches。
- server 鎖定 exact source subtree及 source／destination direct siblings，驗證 anchor scope、permission、hierarchy、idempotency，依穩定 scope 順序取 lock 並計算 dense order，在單一 transaction 內寫目的、刪來源、activity與 ledger result。
- 新增 forward-only v2 migration，不修改已套用 v1 migration；v1 不得成為新 UI path fallback。
- pending／failure／unknown 保留既有來源穩定與 success-effects-only；不改雙向拖曳、500ms mobile gesture、定位線、已歸位唯讀或視覺排版。

### RD work packages

1. WP1：`taskDropIntent.ts`／`taskDragCommit.ts` 導入 scope-safe index，補 randomized multi-board property test。
2. WP2：新增共用 `taskPlacementCommand.ts`，建立 intent→command 唯一 adapter。
3. WP3：`useWbsStore.ts` cross-boundary durable owner 改送 v2 command，成功才套 canonical result。
4. WP4：Supabase service／types 新增 v2 RPC adapter，移除新 path 的 v1 fallback。
5. WP5：建立 `20260826083940_dev_089_scope_safe_task_placement_command.sql`，完成 ledger amendment、locks、ordering、RLS/grants。
6. WP6：補 source/property、DB01-DB04、桌機／手機 rendered UI、Level 3/4 雙向 gates。

### Authoritative package

- CAPA：`ai-doc/reports/CAPA-20260825-task-placement-disappears-on-mobile.md`
- RD contract：`ai-doc/specs/SPEC-089-authoritative-task-placement-transaction.md`
- QA plan：`ai-doc/qa/QA-DEV-089-authoritative-task-placement-transaction.md`
- QC verdict：`ai-doc/qc/QC-DEV-089-authoritative-task-placement-transaction.md`
- Historical v1 migration：`supabase/migrations/20260825093621_dev_089_transactional_task_workbench_placement.sql`
- Implemented v2 migration：`supabase/migrations/20260826083940_dev_089_scope_safe_task_placement_command.sql`

### QA／QC acceptance 與 stop conditions

- Property：至少 1,000 組 multi-workspace／board／parent fixtures，所有非 affected scope deep equal。
- DB：TEST backup、migration/RLS/grants、兩方向／before／after／append／跨 workspace、rejection、replay、parallel placement 全部 PASS。
- Browser：desktop 與 390×844 mobile 都要真實拖曳「看板→未歸位→同看板」及「未歸位→另一看板」，每步 canonical／ledger／reload readback。
- Level 3／Level 4 必須同 artifact 雙向完成；單向 evidence 不得判 PASS。
- v1 fallback、generic patches、parent-only index、跨 scope mutation、missing readback、migration mismatch、visible error、partial/duplicate/lost task 任一出現即 stop-ship。

### Rework evidence、historical baseline 與 release boundary

- 2026-08-26 RD：WP1-WP5 已完成；cross-boundary desktop/mobile 共用 `MoveTaskSubtreeCommand v2`，client不再送 sibling patches；server 回 canonical placement，並以 exactly-one-source／canonical moved IDs postcondition fail-safe rollback。
- Source/property：DEV-089 static contract PASS；seed `0x5908926` 的1,000組 multi-workspace／board fixtures雙向 PASS；DEV-039、DEV-068、DEV-086 targeted regression PASS；TypeScript與ESLint 0 error。
- Local DB：可丟棄 PostgreSQL 18 instance 完成 migration compile、root/nested雙向、dense order、same-operation replay、immutable mismatch、來源零殘留與canonical moved IDs完整；runtime已停止、port 55489釋放、資料目錄移除。此證據不等於Supabase TEST/RLS/concurrency。
- Rendered UI：desktop、390×844、320×844成功路徑PASS；390×844完成看板→未歸位→跨工作區另一看板；DEV-089 fault injection證明來源三層子樹保留、目的0、parent chain preserved、transient/pending清空。localhost:4000 runtime已停止並確認釋放。

- 2026-08-25 Local、TEST DB01-DB03、commit `60907d3` 單向 Level 3 保留作 v1 baseline，不代表 Rework 1 或 production通過。
- 2026-08-26 production reverse flow 是目前最高權重 evidence，QC 判定 FAIL、CAPA ineffective。
- 本文件只授權 RD 依契約實作與送驗，不授權 production migration、deploy 或 data mutation。
- 重新進入 release 前，必須 reconcile repo／production migration history，再由獨立 deployment/release gate 執行 backup、migration、deploy與 Level 4。
- 結論：`RD Implemented／Local QA-QC PASS；Supabase TEST DB/RLS/concurrency與Level 3 NOT RUN；Production known FAIL；Production Stop-Ship`。

## DEV-090：預設全顯示與帳號看板篩選一致性

- 文件成熟度：`Implemented / Local Automated QA-QC Passed / Human Confirmed`
- 狀態：完成本地開發與QA-QC／未套用remote migration／未 Deploy／未 Release
- 節點類型：交付點
- 父交付點：DEV-039
- 是否計入產品交付完成：是
- 原始需求邊界：`USER-20260826-FILTER-DEFAULT-SHOW-ALL`、
  `USER-20260826-ACCOUNT-FILTER-PREFERENCES`、`PROD-20260826-CROSS-MODE-FILTER-EMPTY`
- 風險等級：本地實作 Medium；schema/RLS release High
- Spec Impact：`Intentional replacement + corrective follow-up`；取代 `completed: false` 預設、
  uid-only 看板篩選記憶與 mode-local hierarchy filtering；不改任務資料、任務權限、
  Realtime、工作台 placement 或任務生命週期。
- ADR：`ADR-045 Accepted`；採專用 `account_board_task_filter_preferences`，不延伸 `profiles.ui_preferences` whole-json。

### 任務目標

- 正式資料存在，但個人負責人篩選與各模式不一致的 ancestor handling 造成看板只顯示部分任務、清單與心智圖誤顯示空白。
- 交付後「未設定條件＝全部任務」是唯一 default；使用者主動選取後只保存到本人該看板；同條件切換看板、清單、心智圖、甘特與行事曆時 canonical matched identities 一致。

### 開發範圍

- [x] WP1：統一全狀態 default、active count 0、reset 與 v1～v4 migration；板內／工作台
  legacy filters reset，display/panel/selected-board 保留。
- [x] WP2：新增 preference table migration、explicit grants、四個 RLS policies、DB types、
  Supabase adapter 與 pure repository；local cache只作 exact-scope fallback/pending journal。
- [x] WP3：新增 `useTaskFilterStore`，搬移 Board/Tag filter ownership，實作 account/board
  generation guard、queue/retry、logout與failure feedback。
- [x] WP4：看板、清單、心智圖、甘特、行事曆只消費 canonical projection；hierarchy使用 visible IDs，match/count使用 matched IDs。
- [x] WP5：統一 loading、task load failed、true empty、filtered zero與preference sync failed的可見狀態；不新增 profile/save/copy UI。
- [x] WP6：新增 DEV-090 source/model/DB/browser gates，修訂 DEV-039 歷史 default assertions，
  執行 targeted regression與 QA/QC handoff。

### Out of Scope

- 團隊共用篩選、filter profile、另存／複製／管理 UI。
- 任務資料與其 RLS、成員權限、Realtime、指派模型、工作台 placement、工作台 filter cloud persistence。
- `created_by`／`updated_by` 稽核修復、production migration、deploy 或 release。

### 驗收標準

- [x] 新帳號、未設定看板與 migration 後帳號全部顯示，active filter count = 0；reset 刪除 remote row並維持同一 default。
- [x] A／B 帳號隔離、同帳號 board A／B 隔離；reload/relogin/re-enter只恢復本人該看板最後成功提交的完整偏好。
- [x] 父節點不命中而後代命中時，階層模式保留 context-only ancestors，matched count不多算祖先。
- [x] 看板、清單、心智圖、甘特與行事曆對同 fixture 的 canonical matched IDs一致；archived/missing/cyclic ancestor不殘留。
- [x] 真無資料、filtered zero、task load failed與preference sync failed採不同畫面／warning；filtered zero只有單一reset CTA。
- [x] remote read/write/delete failure保留exact-scope cache或default與pending journal，不跨 scope、不假 synced；retry後DB收斂。
- [x] owner/viewer own-row CRUD通過；other-account、inaccessible-project、anon全拒絕；FK cascade與constraint通過。
- [x] 1440×900五模式與390×844可達Board UI無visible error、overflow、重疊或CTA裁切。

### RD 執行計畫與依賴

- [x] 依 `SPEC-039` 的 Repository Impact與 WP 順序修改；不得以保留 global BoardStore filter、
  mode-local predicate或 `profiles.ui_preferences` whole-json 作捷徑。
- [x] Migration 使用 forward-only 新檔，不改寫既有 migration；無server backfill、無Realtime publication。
- [x] QA 在 QC 前凍結 `QA-DEV-090`；若 schema/scope/fallback/consumer漂移，先更新 authoritative contract再重跑受影響案例。
- [x] 依 QA-DEV-090 建立 disposable fixture、failure injection與 evidence provenance；不以
  direct URL、service-role、DB row或build取代正常UI delivery path。

### 驗證計畫與結果

- [x] `verify:dev-090-task-filter-contract`、`projection`、`db`、`browser` 全部通過。
- [x] DEV-039 core/parity、DEV-027D mindmap、account-scoped preference targeted regressions通過；
  既有 `completed:false`／count=1 assertion須改成新契約，不得刪測試求PASS。
- [x] TypeScript `--noEmit` 與 `build:test` 通過。
- [x] QC report 收齊 source/dirty boundary、artifact、環境、role/account、workspace/board、
  fixture、route/mode、viewport、時間、命令與截圖/DB evidence。
- 結果：`Local Automated QA-QC PASS`。DEV-090 browser五模式 IDs一致，DB/RLS矩陣、390×844、targeted regressions、TypeScript與build均通過；未執行remote migration、deploy或release。

### Stop Conditions / Release Boundary

- RD stop：migration/type/RLS不一致、board ID無法安全對應 project UUID、stale hydrate可套用、
  fallback可跨scope或任一mode無法接canonical projection。
- QA/QC stop：正常入口不可達、fixture不合理空白、visible alert/4xx/5xx、RLS矩陣失敗或證據不足。
- Release boundary：本 DEV 只授權本地實作、migration file與驗證；remote migration、
  production data、deploy、smoke與release artifact須另走 deployment-release gate。

### 相關文件

- SPEC：`ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
- ADR：`ai-doc/decisions/ADR-045-account-board-task-filter-preferences.md`
- QA：`ai-doc/qa/QA-DEV-090-default-show-all-account-board-filter-consistency.md`
- QC：`ai-doc/qc/QC-DEV-090-default-show-all-account-board-filter-consistency.md`

### 變更紀錄

- 2026-08-26：建立 Brief Ready／Human Confirmed。
- 2026-08-26：完成 repo/schema/RLS/migration/failure/五模式/QA-QC readiness review，
  升級為 `RD Implementation Ready`；未實作、未驗證、未 Release。
- 2026-08-26：完成RD實作與local automated QA-QC；contract/projection/DB/browser/regression/TypeScript/build全部PASS。狀態更新為`Implemented / Local QA-QC PASS / Not Released`。

## DEV-091：工作台上下區域高度調整與帳號偏好

- 文件成熟度：`Implemented / Local Automated QA-QC Passed / Human Confirmed`
- 狀態：本地開發與 QA-QC 完成／未 Deploy／未 Release
- 節點類型：開發點
- 父交付點：DEV-039
- 是否計入產品交付完成：否
- 原始需求邊界：`USER-20260827-TASK-WORKBENCH-Y-SPLIT`
- 風險等級：Medium（主要 UI 互動＋帳號 layout preference 路徑）
- Spec Impact：`Compatible extension`；保留未歸位 staging、已歸位唯讀、任務拖曳與篩選契約，只新增版面比例控制。

### 任務目標與範圍

- [x] 在未歸位／已歸位兩個獨立捲動區之間加入單一水平分隔線，沿 Y 軸拖曳即可改變空間比例。
- [x] 分隔線支援 `ArrowUp`／`ArrowDown` 微調及 `Home`／`End` 邊界，提供 separator role、水平 orientation、目前比例與可存取名稱。
- [x] 比例限制在 18%～82%，預設 50%，以比例而非像素保存，避免不同裝置高度直接套用錯誤尺寸。
- [x] 只在 pointer 結束時提交偏好；本機帳號 cache 即時保存，Supabase backend 沿用 `profiles.ui_preferences.layout.taskWorkbenchUnplacedRatio` 跨裝置路徑。
- [x] 不新增說明面板、設定頁、按鈕、資料 schema、migration、任務狀態或新的 placement drag owner。

### 驗收與驗證結果

- [x] 初始兩區各半且不重疊；分隔線位於兩區邊界，視覺只保留一條細線與 hover／focus／active 回饋。
- [x] 向下拖曳時未歸位增高、已歸位降低；向上相反；邊界時兩個 sticky header 與獨立捲動仍可用。
- [x] pointer 與鍵盤結果寫入本人 panel cache 與 account UI preference；reload 還原，A／B 帳號 storage scope 不互相污染。
- [x] 1440×900 與 390×844 無文件級水平溢出、重疊、裁切、visible alert、HTTP 4xx/5xx、console error 或 page error。
- [x] `verify:dev-091-task-workbench-lane-resize` 16 checks、DEV-091 browser PASS、DEV-039 placement static 31/31 與 browser PASS。
- [x] TypeScript、targeted ESLint、`build:test`、`git diff --check` 通過；build僅保留既有 chunk-size／Browserslist warning。

### 邊界與相關文件

- Remote authenticated two-device smoke 未在本輪執行；遠端欄位沿用已存在的 account preference JSON 路徑，未新增 migration 或正式環境操作。
- 本輪未 commit、push、deploy 或 release；若要正式交付，另走 deployment/release gate。
- SPEC：`ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
- QA：`ai-doc/qa/QA-DEV-091-task-workbench-lane-resize.md`
- QC：`ai-doc/qc/QC-DEV-091-task-workbench-lane-resize.md`

### 變更紀錄

- 2026-08-27：依使用者附圖建立並完成 DEV-091；本地 RD、QA、QC 與真實畫面檢查通過。

## DEV-092：會議紀錄側欄資訊精簡

- 文件成熟度：`Implemented / Local Automated QA-QC Passed / Human Confirmed`
- 狀態：本地開發與 QA-QC 完成／未 Deploy／未 Release
- 節點類型：開發點
- 父交付點：DEV-020
- 是否計入產品交付完成：否
- 原始需求邊界：`USER-20260827-RECORD-SIDEBAR-QUIETNESS`（瀏覽器留言 Comments 1–7）
- 風險等級：Medium（使用者可見側欄互動與流程入口精簡）
- Spec Impact：`Intentional replacement`；SPEC-020 原有功能說明入口視為歷史契約，現行以 UI 精簡 addendum 為準；不改紀錄資料、保存、AI整理或未儲存防呆。

### 任務目標與範圍

- [x] 標題只保留紀錄文字，移除裝飾性 icon與 `紀錄功能說明` 按鈕／modal。
- [x] 移除會議流程標題、輔助說明、各階段 icon／副標題、`AI選用` 與正常完成 checkpoint 常駐文案；新會議標題固定為「會議紀錄」，紀錄時間改為 24 小時制；保存失敗、衝突、暫停與保存中狀態仍可見。
- [x] 收合控制改用 `ChevronRight`，放在右側抽屜最左側、位於標題前；收合後以 `ChevronLeft` 展開。
- [x] 會議模式標題與紀錄時間位於同一橫列；會議模式不顯示 `關聯任務` 管理入口、`0 / 未選取` 摘要或 `選取任務` action；個人工作紀錄入口與已有關聯任務管理維持。
- [x] 會議流程階段按鈕高度縮為 `h-9`；可操作階段使用 pointer cursor／既有 hover 回饋（含目前階段），停用階段維持不可操作游標。
- [x] 移除會議底部 `AI整理來源：任務變更` 摘要／展開列；任務變更仍保留給 AI整理流程使用。
- [x] 會議模式將 `存草稿` 與分享範圍控制合併為單列緊湊版；個人工作紀錄排列維持。
- [x] drawer 內層改為縱向 flex 高度鏈，內容編輯器填滿流程／欄位／action 固定後的剩餘空間；會議至少 220px、工作紀錄至少 150px，窄版不足時捲動且不與控制列重疊。

### 驗收與驗證結果

- [x] `verify:dev-092-record-sidebar-quietness` 43 checks 通過。
- [x] 1440×900 與 390×844 實際頁面通過：無 help／AI badge／成功 checkpoint 文案，collapse control 位於右側抽屜最左側且方向正確，標題／時間同列，會議空白任務摘要與選取 action 隱藏。
- [x] 收合／展開互動、窄版無水平溢出、visible error sweep、console/page error 均通過。
- [x] `verify:dev-020-record-workflow-redesign`、`verify:dev-002-records`、`verify:dev-028-cross-mode-task-interactions`、TypeScript、targeted ESLint與`git diff --check`通過。

### 邊界與相關文件

- 本輪不新增資料 schema、migration、API、權限或保存格式；不修改功能流程與未儲存防呆。
- 本輪未 commit、push、deploy 或 release；若要正式交付，另走 deployment/release gate。
- SPEC：`ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md`
- QA：`ai-doc/qa/QA-DEV-092-record-sidebar-quietness.md`
- QC：`ai-doc/qc/QC-DEV-092-record-sidebar-quietness.md`

### 變更紀錄

- 2026-08-27：依瀏覽器 Comments 1–7 完成側欄資訊精簡與實際畫面驗證。
- 2026-08-27：依新增瀏覽器留言移除會議流程標題與輔助說明，並重跑靜態與 rendered browser 驗證。
- 2026-08-27：依新增瀏覽器留言將會議流程階段列改為緊湊高度，並補上可操作階段 pointer cursor／停用階段不可操作游標。
- 2026-08-27：依新增瀏覽器留言移除會議底部 `AI整理來源：任務變更` 摘要／展開列，保留任務變更資料供 AI整理流程使用。
- 2026-08-27：依新增瀏覽器留言將會議模式狀態／分享範圍控制列改為單列緊湊版，約縮減 50% 高度。
- 2026-08-27：依新增瀏覽器留言讓內容編輯器填滿側欄剩餘空間，並補上桌機／窄版最小高度與不重疊驗證。
- 2026-08-27：依新增瀏覽器留言移除新會議標題時間片段，並將紀錄時間改為無上午／下午的 24 小時制輸入。
- 2026-09-01：依最新瀏覽器留言移除新會議標題中的日期片段，標題預設固定為「會議紀錄」；紀錄日期與時間只在 `紀錄時間` 欄位呈現。
- 2026-08-27：依新增瀏覽器留言移除會議流程各階段的 icon 與副標題，並保留五個主要階段操作。
- 2026-09-01：依最新瀏覽器留言移除會議流程列重複的 `匯入` step 與 `校稿` step；匯入改由下方唯一控制項提供，內容直接確認並使用內容區下方 `存草稿` 保存。
- 2026-08-27：依新增瀏覽器留言修正右側面板收合／展開箭頭方向、將會議標題與紀錄時間排在同一橫列，並移除空白狀態 `選取任務` action。
- 2026-08-27：依新增瀏覽器留言將收合控制移到右側抽屜 header 最左側、位於紀錄標題前。

## DEV-093：收藏任務與子任務資產化（已撤銷）

- 文件成熟度：`Historical / Removed by DEV-104`
- 狀態：已撤銷／未 Release
- 使用者決策：2026-09-04 決定不再開發，並要求連同原始收藏／典藏能力全部移除。
- 移除範圍：UI、domain/store、權限與 action、provider、migration、專屬 scripts／SPEC／QA／QC／predeploy。
- 資料邊界：相關 migration 從未進入共享 local／remote history；不執行遠端 rollback、repair、reset或資料 mutation。
- 現行 authority：`SPEC-104-task-collection-feature-removal.md`。
## DEV-094：免匯入直接會議速記

- 文件成熟度：`RD Implementation In Progress / Human Confirmed / static＋pure＋browser smoke PASS / QA・QC NOT RUN / 未 Release`
- 狀態：開發中／implementation smoke PASS／待 QA・QC
- 節點類型：開發點
- 父交付點：DEV-020
- 是否計入產品交付完成：否
- 原始需求邊界：`USER-20260828-MEETING-DIRECT-NOTE-WITHOUT-IMPORT`、response annotation 1
- 風險等級：Medium（改變使用者可見主要互動、焦點與保存入口，並新增跨會議 cutoff metadata／query boundary）
- Spec Impact：`Compatible corrective addendum + intentional meeting-import interaction replacement`

### 問題與使用者價值

使用者不一定需要匯入專案變化，但目前 pending `匯入` 的主色樣式與 `速記 -> saveDraft` 的隱含 command，讓未先操作匯入的使用者點擊速記後看不到相符結果。目標是讓會議草稿從建立當下即可直接輸入，同時保留匯入、AI整理、存草稿、發布與離開防呆。

2026-08-28 已完成 WP-094-A～E 的第一版產品 wiring：metadata／cutoff／stable-ID pure contract、exclusive activity boundary、focus token、meeting one-click／custom UI、原子內容＋metadata append、publish-only cutoff projection、local-test／Supabase adapter與 static／browser smoke verifier；尚未宣稱完整 QA/QC 或 release。

2026-09-01 最新 UI refinement：meeting 匯入改為內容區第一層單一 `匯入專案變化` 入口，點擊後以覆蓋式第二層提供 `帶入上次會議後變更`／`自訂日期`；自訂日期表單在第二層內切換，第一層排版維持不變。
同日補充：會議模式不再顯示 `關聯任務` 管理入口；個人工作紀錄的任務關聯操作維持。
同日補充：移除會議與工作紀錄底部控制列的 `目前狀態／草稿` 摘要；會議模式將 `存草稿` 與分享範圍合併為同一列，流程與保存結果沿用既有 workflow／就地回饋。

### Human Confirmed 方案

- 只有正常新建 meeting draft 時自動聚焦內容編輯器；existing／recovery／conflict／dialog 不得被搶焦點。
- `速記` step 點擊只聚焦內容，不執行存草稿。
- `匯入` 保留第一格並改用次要選用樣式；預設點擊直接匯入目前看板「上一筆已發布且成功匯入的截止時間（不含）→本次點擊時間（含）」；首次沒有前次截止點時，從本次會議記錄時間往前七天開始。預設路徑不顯示設定、預覽、確認或跳過面板，固定六天方案淘汰。
- meeting import 的第一層只顯示 `匯入專案變化`；點擊後以不改變第一層排版的覆蓋式第二層呈現預設匯入與 `自訂日期`，自訂日期欄位在第二層內切換並可返回或關閉。
- `存草稿` 移到會議內容編輯器下方成為獨立次要文字按鈕；`發布` 只保留 workflow 入口；保留空白草稿可存契約。
- 加入完全不點匯入也能輸入、存草稿、AI整理及發布的回歸驗證。
- 相同來源防重複；成功後只顯示 `已完成`，不顯示區間、筆數或匯入專用撤銷；無資料或失敗時不得改動草稿。既有編輯器通用 undo 能力不主動移除。
- 匯入內容附加在現有內容最後方，完成後游標位於區塊後方；再次匯入只加入尚未匯入的新事件，不覆蓋或重複既有內容。
- 會後十二小時是 soft window；期間與逾時後皆可再次匯入 delta，不封鎖、不自動發布。
- 只有含成功匯入事件的會議紀錄發布後，才以最後成功匯入時間推進同看板下次預設起點；開啟、存草稿、未匯入、查無資料、失敗或撤銷均不得推進。
- 預設一鍵動作文案固定為 `帶入上次會議後變更`；這是簡化顯示名稱，實際起點仍是同看板上次已發布成功截止點。
- `自訂日期` 是低頻次要入口，不得成為預設匯入的必經步驟；有效自訂範圍成功加入至少一筆事件並發布後，自訂結束時間一律取代下次截止點，即使範圍不連續或使截止點往前調整。
- 自訂範圍造成缺口或截止點倒退時不警告、不確認、不阻擋；預設與自訂匯入成功後都只顯示 `已完成`，不揭露區間、筆數或匯入專用撤銷。此為 15C／16C accepted risk，取代先前 6A 的可見成功回饋部分。

### RD Entry Contract

- UI Entry：MainLayout `新增會議記錄` 與 RecordsView／RecordSidebar `補一筆會後紀錄`；只有 guard 完成後真的建立新 meeting draft 才自動 focus。existing／recovery／conflict／dialog 不發 focus token。
- Normal delivery：one-click capture time → refresh board records → resolve published cutoff → `(start,end]` activity query → stable event ID delta → AI synthesis → protected block＋metadata atomic append → draft save／publish → reload 後供下一 meeting baseline。
- Metadata：沿用 `KnowledgeRecord.metadata.meetingProjectChangeImport` v1；draft只保存 batches，publish payload 才寫 `effectiveCutoffAt`。未知 schema／wrong board／非法 timestamp／缺 event ID fail closed；沒有 DB migration/backfill。
- Query API：`ActivityEventListQuery.startBoundary?: 'inclusive'|'exclusive'`，default inclusive；DEV-094 使用 exclusive，end維持 inclusive。local-test `>`、Supabase `.gt()`；Firebase activity仍 explicit empty，不得假成功。
- Focus API：meeting workflow capture command 改 `focusContent`；store提供 ephemeral `contentFocusRequestId`，editor只在 token改變時 focus/select end。點 `速記` request count=0。
- Recovery：draft save／checkpoint／F5可 round-trip batches但不生效；editor undo回到 `beforeContentSignature` 使 batch失效；AI成功才標 `ai_integrated`；publish failure／record undo／archive都不能作 baseline。
- Scope：meeting composer初始焦點、`帶入上次會議後變更`、自訂日期、周會 cutoff、十二小時 soft window、末端附加／delta-only、防重複、content-below save／workflow publish、免匯入回歸。
- Out of Scope：重做整條 workflow、移除 import step、增加新模式、改 work-log 匯入、改 project-change allowlist／AI output、擴張 Firebase activity、解禁手機會議、deploy／release。

### 逐檔影響與 work packages

- `WP-094-A Pure contract`：`src/types/index.ts`、新增 `src/utils/meetingProjectChangeImport.ts`、`src/utils/projectChangeImport.ts`；完成 metadata parser、cutoff/window、stable-ID dedupe、undo reconciliation與 publish projection。
- `WP-094-B Store／Focus`：`src/store/useRecordStore.ts`、`src/utils/meetingRecordWorkflow.ts`、`src/components/Records/RecordContentEditor.tsx`；完成 atomic apply、signature、AI integration、publish-only cutoff與 focus token。
- `WP-094-C UI`：`src/components/Records/RecordSidebar.tsx`、新增 `MeetingProjectChangeImportControl.tsx`；完成 two-layer one-click／custom disclosure／secondary tone／minimal feedback／bottom actions，隔離 work-log panel。
- `WP-094-D Provider`：`src/services/localTestService.ts`、`src/services/supabase/projedService.ts` 與既有 adapter；只擴 exclusive start，不建 migration／RLS／grant。
- `WP-094-E Verification`：新增 DEV-094 static/pure/browser verifier與 package commands，更新 DEV-020／023 過時的 meeting panel假設，執行 `QA-DEV-094` evidence gate。

Sequencing 固定 A→B→C→D→E；A 未通過不得接 active UI。P0產品決策 gap=0、P1 implementation gap=0；ADR不建立，因 record metadata／provider ownership未改變。

### 驗收方向

- 正常入口新建 meeting draft 後，不操作匯入即可直接輸入。
- `速記` click 只移動焦點，不保存、不改狀態、不遺失內容。
- idle `匯入` 是次要選用訊號；預設點擊後直接加入「同看板上次已發布成功截止點（不含）→本次點擊時間（含）」的事件，首次使用回溯七天，不出現設定／預覽／確認／跳過面板。
- 第一層入口顯示 `匯入專案變化`；第二層預設動作文案為 `帶入上次會議後變更`，只有進入第二層後選擇 `自訂日期` 才按需出現日期範圍控制。
- loading 不可重複觸發；相同來源防重複，成功只顯示 `已完成` 且不顯示區間、筆數或匯入專用撤銷；無資料或失敗時內容不變。
- 匯入內容附加在末端並將游標放到區塊後方；再次點擊只加入新事件，不覆蓋人工文字或既有匯入區塊。
- 會後十二小時內外皆可匯入 delta；不得因逾時封鎖、自動發布或縮短查詢區間。
- 只有含成功匯入事件的紀錄發布後才推進下次起點；存草稿、未匯入、查無資料、失敗與撤銷均不推進。
- 自訂開始不得晚於結束、結束不得晚於操作當下；自訂範圍成功加入至少一筆事件並發布後，不論是否與原截止點連續，一律以自訂結束時間覆寫下次起點。
- 自訂開始晚於原截止點或結束早於原截止點時，不警告、不確認、不阻擋；完成後不額外揭露因此產生的缺口或重疊。
- 獨立 `存草稿` 可保存空白與有內容草稿，失敗保留輸入。
- 不操作匯入時，AI整理與發布只依既有內容條件啟用。
- 既有匯入、AI preserve、發布、未儲存防呆、1440×900／390×844、鍵盤與 visible-error sweep 列為後續 QA/QC 必驗。

### QA／QC 與 evidence

- 可執行計畫：`ai-doc/qa/QA-DEV-094-meeting-direct-note-and-delta-import.md`，含 deterministic fixture、FMEA、TC-094-001～020、ROT-094-001～008、provider boundary、focus／request count、viewport與 evidence JSON。
- evidence path：`output/qa/dev-094/result.json`、`output/playwright/dev-094/result.json` 及 desktop／mobile screenshots；目前已產生 static artifact 與 desktop smoke screenshot，完整 QA/QC evidence 仍 NOT RUN，不得預填 QA PASS。
- required regressions：DEV-020／021／022／023／069／092、TypeScript、targeted ESLint、build:test、git diff check。

### 執行邊界與下一步

- 本輪已完成 WP-094-A～E implementation wiring、provider boundary、static／browser smoke verifier與 package scripts；未新增 migration、未修改 Git index、未套用遠端、未 deploy 或 release。瀏覽器 smoke 重用既有 local-test runtime。
- 下一步補齊 QA-DEV-094 TC/ROT factual evidence並交獨立 QA/QC；不得以 implementation smoke 誤稱完整驗收或可 release。

### 相關文件

- Authoritative addendum：`ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md`
- Executable QA plan：`ai-doc/qa/QA-DEV-094-meeting-direct-note-and-delta-import.md`
- Existing optional-import contract：`ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md`
- 文件索引：`ai-doc/documentation_map.md`

### 變更紀錄

- 2026-08-28：依使用者附圖與 response annotation 1 建立 `Brief Ready / Human Confirmed` 文件；方案已確認，產品尚未實作或驗證。
- 2026-08-28：升級為 `RD Implementation Ready`；固定 metadata v1、publish-only cutoff、exclusive/inclusive query、stable event ID、undo／AI／recovery、focus token、逐檔 WP、provider matrix與 `QA-DEV-094`。產品、verifier與 QA/QC 仍未執行。
- 2026-08-28：依 WP-094-A～E 完成第一版產品 wiring與 verifier；static 12 checks、pure smoke、TypeScript、targeted ESLint、DEV-020／023／092 regression及1440×900 local-test browser smoke通過，完整 QA/QC、390×844 negative與 release仍待執行。

## DEV-095：任務追蹤副本與跨看板多重投影

- 文件成熟度：`RD Implementation Ready / Human Confirmed / Local Interaction Parity Implemented`
- 狀態：Local Automated QA-QC PASS／Supabase TEST與L3 NOT RUN／未 Deploy／未 Release
- 節點類型：交付點
- 父交付點：無
- 是否計入產品交付完成：是（本地interaction slice已完成；整體DEV仍待Supabase TEST與release gate，不宣稱完成）
- 原始需求邊界：`USER-20260828-TASK-TRACKING-COPY-MULTI-BOARD-PROJECTION`
- 風險等級：High（任務 identity／placement 拆分、跨看板讀取權、生命週期、拖曳與跨 UI／service／DB 路徑）
- Spec Impact：`Compatible product extension + Intentional data-model expansion + Intentional interaction-contract replacement`

### 問題與使用者價值

同一任務可能同時被研發看板、主管看板與具有相關關係的父任務追蹤。目前 `TaskNode` 將任務內容、`boardId` 與單一 `parentId` 綁在同一個 board-scoped adjacency node；若用複製任務或 `parentIds[]` 解決，會產生多份狀態、重複統計、刪除歧義與雙邊維護成本。

目標是「單一任務、一個主要歸屬、多個非 owning 追蹤投影」。任務內容、執行狀態、負責人、日期、備註與生命週期只維護一份；不同看板只維護各自的顯示位置、父層與順序。

### Human Decision Brief

- 不為追蹤者新增主管狀態、關注狀態或任何 placement-local 工作流狀態；追蹤副本只是 canonical 任務的投影。
- 每個任務只有一個主要父任務負責工時、成本、進度與完成率彙總；其他位置均為追蹤引用，不重複計算。
- 任務新增可發現的「建立追蹤副本」文字按鈕；成功後先在被點選 placement 的同一父層、相鄰後方建立虛線副本，再由使用者拖曳到要追蹤的位置。
- 實線 primary placement 拖曳維持現行主要歸屬搬移語意；虛線 tracking placement 拖曳只搬移該副本，即使跨看板也不得改變 canonical ownership。
- 建立追蹤副本就是授權目標看板成員查看完整原任務；授權適用目標看板現有與未來成員。
- 投影衍生的只有讀取權；使用者只有在原任務權限邊界本來就具有 `edit_task` 時，才能從副本進入編輯。
- 移除某個副本只代表「移除此處追蹤」；最後一個可見投影移除後，撤銷該看板衍生讀取權，但不影響來源看板或其他直接授權。
- 原任務完成時所有副本同步顯示完成；封存時一同離開一般看板，還原時恢復，永久刪除時移除全部副本。
- 把副本放到相關或有依賴性的父任務下，只代表視覺追蹤；不因建立或拖曳副本而自動建立 formal dependency。
- 追蹤任務與正本必須共用相同元件與功能行為，包括單擊／雙擊／右鍵、pointer／keyboard／mobile拖曳、展開／收合與recursive子任務；唯一常駐視覺差異是外層虛線。
- 互動parity不放寬資料權限：target Board衍生讀取者使用同一details／action元件但mutation受guard；本來具有canonical source capability者才可從reference執行相同合法更新。
- 建立一筆tracking reference只建立一個placement，不自動複製整棵canonical子樹；要在reference下追蹤子任務，為對應canonical task建立明確tracking placement並掛在該reference placement下。

### Architecture Memory Capsule

- `Task identity != Placement identity`。Task 是內容與生命週期的單一真相；placement 是某張看板內的顯示位置。
- 每個 task 必須恰有一個 active `primary` placement，並可有零至多個 active `tracking_reference` placement。
- 父層關係、看板、排序與虛線類型屬於 placement；標題、內容、狀態、人員、日期、備註與封存屬於 task。
- 看板 tree 與 drag identity 必須使用 `placementId`；任務詳情、dependency、會議紀錄關聯與 canonical 更新繼續使用 `taskId`。
- 主要階層彙總只沿 `primary` placement edge 計算；看板統計與跨投影查詢使用 distinct `taskId`，不因投影數量放大。
- 投影可見性是活性關係：使用者可讀取任一自己可讀看板中的 active tracking placement，但 task mutation 仍只依 canonical source capability 決定。
- surface架構固定為`TaskPlacementController + TaskSurfaceFrame + pure surface views + TaskPlacementTree`；List／Kanban／Checklist保留各自pure view，但primary／tracking不得各做一份內容、gesture或child renderer。

### UX Intent 與主要流程

- 使用者與結果：希望在不複製任務內容的前提下，把同一任務放到多個上下文追蹤。
- 主物件與主焦點：任務 placement；每次操作只聚焦「建立副本」或「搬移此 placement」。
- 可發現入口：沿用既有任務 action surface，加入一個文字按鈕「建立追蹤副本」；不新增常駐工具列、helper、教學卡或第二個追蹤面板。
- 視覺區分：副本只以虛線外框作為主要可見訊號，不疊加狀態 badge、色塊或說明文字；accessible name 需包含「追蹤副本」，不得只靠視覺外框。
- 成功回饋：新副本在原 placement 下方即時可見、為虛線並可拖曳；不顯示常駐成功宣告。
- 失敗與復原：建立失敗不產生 ghost copy；副本拖曳失敗保留原位置與讀取權，並以最短可恢復錯誤訊息回饋。
- 行為一致：primary／tracking從正常入口使用同一interaction binding、action catalog、drag sensors、collision／insertion marker、focus return、live region與recursive placement tree；placement kind只在frame與commit command分流。

### Scope

- 同一 Workspace 內，同看板與跨 Board 的手動追蹤副本建立、拖曳、排序、移除與 reload 後持久。
- 每任務一個 primary placement、多個 tracking placements，並保持任務內容、生命週期與主要彙總的單一來源。
- 建立副本導致的目標看板衍生讀取權，以及副本移除後的有效權限重算。
- 完成、封存、還原、永久刪除與「移除此處追蹤」的明確生命週期。
- 既有 dependency、record link、undo／activity、realtime、backup／import 與五種任務模式的 identity 相容性盤點。
- shared surface/controller/tree refactor，以及tracking reference的click、context action、pointer／keyboard／mobile DnD與nested child parity。

### Out of Scope

- 不新增主管追蹤狀態、placement-local workflow、審核狀態或可自訂追蹤欄位。
- 不讓多個父任務同時彙總工時、成本或完成率；不建立加權分攤模型。
- 不因副本的父層、建立或拖曳而自動新增 dependency。
- 不自動建立 smart view、條件式投影、訂閱或通知。
- 建立一筆parent reference時不自動物化canonical descendants；子任務追蹤使用明確tracking placements。
- 不因target Board具有derived read就新增canonical edit／archive／delete授權。
- 第一期不支援跨 Workspace 投影，不將投影當作跨租戶分享機制。
- 本輪已建立 implementation contract、ADR、QA plan、schema／migration／RPC／RLS、provider adapter、store／UI 與 local verifier；仍不套用 production migration、不 deploy、不 release。

### 驗收方向

- 從正常 task action 入口點選「建立追蹤副本」後，在被點選 placement 同父層、相鄰後方只建立一個虛線 tracking placement，且 task ID 與 canonical 內容不變。
- 虛線副本可在同看板跨父層與跨看板拖曳；只改 placement 的 board／parent／order，primary ownership 與其他投影不變。
- 任務在任一位置所見標題、內容、狀態、人員、日期與備註必須來自同一 task；reload／realtime 後仍一致。
- 只有 primary placement 參與主要父層彙總；看板與跨看板計數對 `taskId` 去重，不因多重投影放大。
- 目標看板現有與未來成員可查看完整任務，但不因投影取得編輯權；最後一個可見投影移除後，無其他資格者不得繼續讀取。
- 完成、封存、還原與永久刪除在所有投影上收旂；「移除此處追蹤」不改變原任務或其他投影。
- 副本的建立、搬移、移除都不得新增、刪除或改寫 formal dependency。
- 虛線是副本唯一常駐可見區分；無說明卡、狀態 badge 或新面板，但鍵盤、焦點、screen reader 與 1440×900／390×844 仍可完成建立、辨識、搬移與移除。
- 建立、拖曳、RLS 或 realtime 失敗時不產生 ghost／duplicate／partial grant，不讓任務同時「兩邊都有」或「兩邊都沒有」的不明結果。
- primary／tracking必須由同一surface view與interaction controller呈現；不得以相同`data-*` marker掩蓋duplicate JSX。
- reference點擊、action、pointer／keyboard／mobile DnD、focus與visible error需和primary走同一binding；只有command與capability結果可不同。
- tracking placement與其nested children使用同一recursive `TaskPlacementTree`；展開／收合、click、drag、remove／undo均可操作，parent reference移動整個tracking subtree且不影響primary roll-up。

### RD Implementation Entry Contract

- Authoritative source 為 `ai-doc/specs/SPEC-095-task-tracking-reference-projections.md`；架構記憶來源為 `ADR-046`，QA 入口為 `QA-DEV-095`。RD 不得只依本 capsule 猜測 schema 或權限。
- 第一版 provider 固定 Supabase＋local-test；Firebase explicit unsupported 且 action 隱藏。正式環境 Supabase schema readiness probe 通過前不得顯示功能。
- DB 採 expand-first：新增 `wbs_item_placements`、operation ledger、primary backfill、compatibility mirror、`manage_task_reference`、derived-read RLS與 create/move/remove/restore RPC；不得改寫既有 migration。
- client 採 `tasksById + placementsById` normalization；task filter／dependency／record link用 taskId，render tree／parent／drag/drop用 placementId；primary-only roll-up與 distinct task count 為硬 invariant。
- reference 跨 Board 使用工作台 destination Board 的 atomic root drop，不進 account-unplaced；有 active reference 的 canonical task 本期禁止移入 account-unplaced。
- UI rework依SPEC-095 WP5→WP6→WP6A→WP9：先抽取`TaskPlacementInteractionContext`與shared controller，再抽取三個pure surface views／frame／recursive tree，最後接回Board／List／Kanban／Checklist與interaction browser verifier。`TrackingReferenceItem`不得保留task content／action／gesture／child JSX。
- 進QA前必須有source duplication gate、primary/reference action capability matrix、pointer／keyboard／mobile drag、nested child與desktop／390／320 rendered evidence；既有B01～B16不得預填為新parity PASS。

### Existing Implementation Evidence／Rework Gap（2026-08-29）

- 已新增 `src/features/taskTracking/{types,errors,model,localService}.ts`：task/placement identity、同 scope 去重、cycle guard、idempotency、remove/restore 與 projection builder。
- 已新增 `src/services/supabase/taskTrackingReferenceService.ts`，並在 `dataBackend.ts` 固定 Supabase＋local-test；Firebase explicit unsupported 且 action hidden。
- `useWbsStore` 保留既有 canonical `nodes`，新增 `trackingReferences`、capability、create/move/remove/restore、projection selector；移往 account-unplaced 時遇 active reference 回傳 `TRACKING_REFERENCE_BLOCKS_UNPLACED`。
- `GlobalContextMenu`／task action catalog保留「建立追蹤副本」；`TrackingReferenceItem.tsx`已移除，List／Kanban／Checklist直接以同一renderer接收optional reference，點擊／action／drag統一由`useTaskPlacementController`處理，虛線只由`TaskSurfaceFrame`提供。
- Gantt／Calendar／共用時間側欄維持跨看板 collapsed canonical projection；Mind Map 改用 expanded placement projection，讓同一 task 的多個追蹤位置各自顯示，並以 ephemeral `canonicalTaskId` 回到唯一內容。所有 projection 均加入虛線與 accessible name；時間側欄與 Mind Map hierarchy drag 使用 placement identity 呼叫 reference move，不回寫 canonical `TaskNode`。Supabase create action 未帶 primary revision 時改送 `null`，由 RPC 鎖定現況；backup v3 對 payload 外 canonical task 以 `OUT_OF_PACKAGE_REFERENCE` fail closed。
- `BoardView`／`TaskWorkbenchPanel` 已接上 cross-board reference root drop（目標看板由工作台選擇）；失敗由 toast 回饋且不改變來源位置，DEV-095 browser core 已以真實 local-test delivery path 驗證工作台跨板 root drop 與目標看板可見。
- `supabase/migrations/20260828100000_dev_095_task_tracking_references.sql` 為 expand-first migration，包含 primary backfill、operation ledger、derived-read RLS、canonical-source write guard、create/move/remove/restore RPC、Realtime publication。
- Current interaction evidence：S07～S10 4/4、browser B17～B24 8/8、independent QC-IP01～08 8/8；B20含390／320 short-tap／scroll negative、cancel與commit，B21含Board／List／Checklist style parity，B24含source capability revoke、stale revision與provider fault。Historical model 14、source 21、B01～B16 16/16與isolated DB 15/15仍只用於原契約baseline。
- Isolated evidence：`npm run verify:dev-095-task-tracking-references-db-isolated` PASS（migration／RLS／RPC／concurrency＋tenant／grant boundary＋10k tasks／25k placements EXPLAIN，共15 checks；artifact：`output/qa/dev-095/db-isolated-result.json`，plan：`output/qa/dev-095/db-performance.txt`，runtime cleanup confirmed）。
- Pending evidence只剩remote gate：兩使用者Supabase TEST T01～T09、migration history reconciliation、受控remote migration、L3／remote QC、deploy與release；本地shared component／interaction／gesture／recursive child／desktop-mobile visible-error evidence已完成。

### Future Phase Capsule：跨 Workspace 投影

- 目的：讓不同 Workspace 的看板可引用同一任務，同時保持唯一真相來源。
- 邊界：本期不實作，不允許以直接 FK／RLS 放寬偷渡跨 Workspace 資料。
- Re-entry trigger：使用者明確要求跨 Workspace 追蹤、外部協作或公司級 portfolio 投影時，另評估 workspace／tenant ownership、跨邊界 ACL、移除生命週期、稽核與 export／backup。

### Spec Governance 結論

- DEV-089／SPEC-089：`Compatible extension`。「每個 task ID 只有一個 canonical ownership surface」保留；tracking placements 明確為非 owning projection，不是第二 canonical source。
- DEV-039／SPEC-039：`Compatible extension`。保留 canonical matched task identities；新多重投影查詢與統計必須以 `taskId` 去重，不得把 placement 當新任務結果。
- DEV-036／ADR-036：`Compatible extension`。Board 仍是實際執行與授權邊界；追蹤副本新增的是可撤銷衍生讀取路徑，不取代 Workspace／Board 治理。
- DEV-044／086／088：`Compatible extension requiring regression contract`。undo、工作台搬移與 archive／restore／delete 需區分 task 與 placement，但不改其現行主要任務語意。
- Interaction contract：`Intentional replacement`。最新使用者指令取代「reference另做簡化renderer／固定唯讀context」；primary／tracking改以shared controller／surface／tree及capability-aware action為authority。
- ADR：`ADR-046`已加入interaction parity amendment，拒絕duplicate reference renderer與單一mega variant component。
- QC：既有QC01～QC07只保留為interaction rework前baseline；current independent QC-IP01～08已8/8 PASS。
- 衝突：0 個 `Unresolved conflict`；權限、子任務物化邊界、元件責任與stop conditions均維持。文件成熟度仍為`RD Implementation Ready`，產品狀態更新為`Local Interaction Parity QA-QC PASS／Supabase TEST NOT RUN`。

### 執行邊界與下一步

  - 本地interaction parity rework與獨立QA／QC已完成；既有DB migration未因UI refactor重寫。
  - 下一可執行phase需另有release授權：先處理remote migration history與Supabase TEST readiness，再執行T01～T09、remote QC及release gate。本地artifacts不得替代兩使用者RLS／Realtime證據。
- 任何遠端／正式 migration、權限資料修補、deploy 或 production release 都需另行 release gate，不屬本文件任務。

### 變更紀錄

- 2026-08-29：完成shared surface/controller/tree rework與本地QA-QC。移除`TrackingReferenceItem`，新增`TaskSurfaceFrame`、`useTaskPlacementController`、`TaskPlacementTree`與source/browser/independent-QC verifier；S07～S10 4/4、B17～B24 8/8、QC-IP01～08 8/8、cross-mode 12/12、backup 4/4、TypeScript、targeted ESLint 0 error及build PASS。Supabase TEST、remote migration、deploy與release未執行。
- 2026-08-29：依使用者「追蹤任務要有一模一樣的功能行為，包括點擊、拖曳、子任務」及元件共用審查，將DEV-095 reopen為`Interaction Parity Rework Required`。固定shared controller／frame／List-Kanban-Checklist pure views／recursive placement tree，interaction parity保留canonical permission guard，不自動物化整棵子樹。舊B01～B16／QC01～QC07降為historical baseline，新parity尚未實作或驗證。
- 2026-08-28：依使用者要求將 DEV-095 現行文件狀態統一為 `RD Implementation Ready`；補記 desktop／390／320px rendered screenshot spot-check PASS。local implementation、isolated DB 與 targeted local QC 證據保留，L3／remote migration／release 仍為獨立 gate。
  - 2026-08-28：補強 DEV-095 Workbench cross-board derived-read hydration：Supabase/local-test provider 可依 canonical taskId 補水，不因 source Board 不可讀而隱藏已授權 target reference；Workbench 以 primary 優先、taskId distinct collapse 並保留 reference 虛線／accessible name。cross-mode 12/12、browser B01～B16 16/16 與 targeted QC 7/7 重新通過；B16 同步補上 readonly context/details rendered evidence。
  - 2026-08-28：以 linked Supabase read-only 執行 `npx supabase db lint --linked --fail-on error`，無 error、僅一筆與 DEV-095 無關的既有 warning；artifact：`output/qa/dev-095/supabase-db-lint.json`，未執行任何 migration／repair／pull／push 或資料 mutation。
  - 2026-08-28：擴充 DEV-095 task-owned PostgreSQL matrix 至 15/15，新增 tenant isolation、future viewer read/revoke、custom capability 與 private helper grant boundary；migration 收斂 private helper execute 權限，並以 fresh disposable runtime 重跑通過，runtime cleanup confirmed。
- 2026-08-29：fresh rerun DEV-095 browser B01～B16 16/16、backup 4/4、cross-mode I01～I12 12/12、isolated PostgreSQL 15/15 與 targeted QC 7/7；task-owned browser／DB runtime 均釋放，未執行 remote migration、deploy 或 release。
- 2026-08-28：修正 DEV-095 Supabase derived-read hydration 的 canonical board identity 映射；優先保留可讀 legacy board ID，其次使用 task metadata，最後才使用 DB project UUID，避免把 target reference Board 誤當 source Board；source contract gate 更新為 20 checks。
- 2026-08-28：補強 DEV-095 local-test placement resolver；before／after 拖曳現在會解析 `primary:<taskId>` anchor、驗證 target parent／anchor 的 workspace、Board 與 parent scope，並讓 append order 同時考慮 primary 與 tracking siblings；model verifier 更新為 14 checks，cross-mode 12/12、browser 15/15、targeted QC 7/7 重跑通過。
- 2026-08-28：補上 tracking projection 的 interaction context 傳遞；工作台／Mind Map／清單／Gantt／Calendar 開啟追蹤副本詳情時保留 reference identity，context menu 僅提供檢視，詳情 modal 以唯讀呈現；source contract gate 更新為 21 checks，TypeScript、browser、QC 與 build 重跑通過。
- 2026-08-28：重新執行 Supabase TEST read-only migration list 與 `db push --dry-run --linked`；確認 remote/local history mismatch，dry-run 以 `LegacyDbPushMissingLocalError` fail closed，未執行 repair／pull／push 或任何遠端 mutation。
- 2026-08-28：補齊 Mind Map 多 placement expanded projection 與 canonical filter dedupe；B10 更新為 placement surfaces 顯示多位置、Gantt／Calendar 保留單一 canonical time identity，browser 15/15 與 targeted QC 6/6 重跑通過。
- 2026-08-28：依使用者要求升級至 `RD Implementation Ready`；新增 SPEC-095、ADR-046 與 QA-DEV-095，固定 schema、RLS、RPC、provider、normalized store、演算法、跨 Board DnD、Realtime、undo、backup、migration rollout、逐檔 WP、AC 與 stop conditions。
- 2026-08-28：進入 implementation slice；補上 domain／provider／store／UI／DnD／Realtime／migration 與 local verifier，並將文件狀態收斂為 `RD Implementation Ready / Implementation In Progress`；isolated DB、完整 QA-QC、remote migration 與 release 仍 pending。
- 2026-08-28：完成 task-owned PostgreSQL 18 isolated migration/RLS/RPC/concurrency matrix，結果 PASS 並確認 temporary runtime cleanup；文件同步標記 `Isolated DB PASS`，完整 cross-mode QA/QC、Supabase TEST、remote migration 與 release 仍 pending。
- 2026-08-28：完成 DEV-095 local-test browser core B01～B07、B09 共 8/8 PASS；涵蓋建立／虛線／同板拖曳／工作台跨板 root drop／reload 後目標看板可見／鍵盤移除／reference ordinary undo-redo／390×844 long-press，artifact 為 `output/playwright/dev-095/result.json`。B08、B10～B14、完整 cross-mode QA/QC、Supabase TEST 與 release 仍 pending。
- 2026-08-28：補齊 Gantt／Calendar／共用側欄／Mind Map 的 placement-only dashed projection marker 與 placement-aware drag；跨板 reference 不再沿用 canonical child toggle，backup v3 對 payload 外 canonical task 以 `OUT_OF_PACKAGE_REFERENCE` fail closed。model／source contract artifacts 已產生並 PASS；完整 cross-mode、Supabase TEST、QC 與 release 仍 pending。
- 2026-08-28：重跑 browser B01～B07、B09～B11 共 10/10 PASS，並補強 WbsList／Kanban／Board 根層與巢狀 reference subtree renderer、reference drop anchor、tracking subtree workspace refresh 與唯讀管理 guard；`npx tsc --noEmit`、targeted ESLint、`build:test`、model/source contract 與 isolated PostgreSQL matrix 均再次 PASS。完整 QA/QC、Supabase TEST、performance/EXPLAIN 與 release 仍 pending。
- 2026-08-28：依使用者「單一任務、多看板／多父位置追蹤」需求建立 DEV-095，經 grill-me 三輪確認純投影、單一主要彙總、衍生讀取權、虛線副本拖曳、生命週期與不自動建立 dependency；文件達 `Brief Ready / Human Confirmed`，產品尚未實作或驗證。

## DEV-096：PWA 更新交易收斂與提示精簡

- 文件成熟度：`RD Implemented / Local QA-QC PASS / 未 Release`
- 狀態：本地實作完成／核心 QA・QC 通過／未 Deploy／未 Release
- 節點類型：交付點
- 父交付點：DEV-041；相容 DEV-034、DEV-083
- 是否計入產品交付完成：是（本地 implementation + QA/QC；正式 release 另行授權）
- 原始需求邊界：`USER-20260830-PWA-UPDATE-REPEATED-PROMPT-AND-COMPACT-UI`
- 風險等級：Medium（P0 更新失效模式：跨 reload、Service Worker 與多分頁共享狀態）
- Spec Impact：`Implementation needs correction / SPEC-041 DEV-096 Corrective Addendum is authoritative`

### Human Decision Brief

- 使用者確認問題：按一次更新後，同一個更新提示可能立即再次出現，必須連按數次才停止。
- 使用者確認 UI：紅線代表刪除其下元素；一般更新提示刪除左側圖示與說明，CTA 改為「一鍵更新」，版面縮緊。
- 固定產品語意：同一 `targetVersion` 一次使用者確認、一次 apply transaction、一次 `updateSW`；每個受 controller 接管影響的 client 最多一次正常 reload，成功必須以 reload 後版本對帳成立為準。
- 固定安全語意：一般更新不清除 SW／Cache Storage；全量 unregister／cache delete 只保留為使用者主動選擇的錯誤恢復，且不得觸碰登入或業務資料。
- 不需人類再決定：target identity、交易欄位、timeout、跨分頁協調、狀態轉移、檔案邊界與測試矩陣均已在本契約固定。
- 需要人類重新授權：production deploy／release、強制更新、遠端版本服務、遙測或擴大 storage 清除範圍。

### 問題、根因與使用者價值

修正前的更新流程同時存在 app-shell hash check、`onNeedRefresh`、background／`pagehide` apply、以及按鈕觸發的 unregister／cache delete／reload 等多個 writer，卻沒有持久化同一目標版本從「可用」到「接管、reload、版本驗證」的唯一交易。局部 callback 完成或 state 提早回到 `idle`，不等於新 bundle 已載入，因此同版本可以再次被判定為待更新。

完成後，同一 target 只由一個分頁擁有 apply lease 並送出一次 `updateSW`；每個受接管影響的頁面最多正常 reload 一次，新頁面以不可變 release ID 對帳成功後才完成交易。若失敗，流程進入有界限 recovery／failed，不再把同一 CTA 當作重試迴圈。

已確認證據邊界：2026-08-30 唯讀抽查正式站 8 次 no-store app shell 均回傳 `index-yMpCxp-i.js`，`sw.js` 也引用同一 bundle，未支持 CDN 長時間交錯版本為主因；特定使用者裝置的完整 event timeline 尚未取得，因此 QA 必須用真實 SW 生命週期尋找反例，不把單一 race 假說當既成事實。

### Scope／Out of Scope

Scope：
- 建立 crash-safe `targetVersion` transaction、同分頁重入防護、跨分頁 owner lease 與結果同步。
- 以既有 sealed release `releaseId` 對帳 production current／latest，local／test 才允許 bundle hash fallback。
- 正常更新改走 `registration.update()`、waiting worker、`updateSW()`／controlling reload 與 startup verification。
- 移除 background／`pagehide` 自動 apply；visibility 僅可檢查更新，不可在未點擊時接管或 reload。
- 一般提示刪除圖示與說明，精簡 CTA 與 spacing；recovery／failed 保留必要原因和動作。
- 建立 pure、test-mode browser 與真實 SW A→B→C／多分頁 evidence。

Out of Scope：
- 不改 Supabase schema／RLS／RPC，不清登入資料、IndexedDB 或非 PWA-owned storage。
- 不做強制更新、release notes API、analytics、push／email 或原生商店更新。
- 不在本 DEV 的 RD／QA／QC 工作包中 deploy 或 release；正式站驗證另走 release gate。
- 不把 recovery／failed 文案一起刪除，也不以 test-mode synthetic event 取代真實 SW evidence。

### 版本真值契約

- Canonical 格式：production 為 `release:<releaseId>`；local／test fallback 為 `bundle:<entryHash>`。不同 namespace 不得直接判定相等。
- Current production identity：`scripts/release/build-production-artifact.mjs` 已把 `PROJED_RELEASE_ID` 帶入 sealed Vite child process；`vite.config.js` 必須將它 define 成 `import.meta.env.VITE_PROJED_RELEASE_ID`，`src/vite-env.d.ts` 補型別。空值或 malformed production ID 必須 fail closed。
- Latest production identity：每次檢查以 `cache: 'no-store'` 讀 `/release-meta.json?projed_update_check=<nonce>`，只接受 `schemaVersion === 1` 與非空 `releaseId`，轉成相同 namespace 後比較。
- Local／test：缺 release metadata 時可由 app-shell entry asset 解析 `bundle:<hash>`；production 不得靜默退回不可靠的空 ID。無法取得可信 latest 時保留 current state，記錄可診斷錯誤，不顯示假更新。
- `scripts/release/verify-production-artifact.mjs` 必須新增 artifact 內注入 ID、`release-meta.json` 與 manifest 三者一致檢查；不一致為 release artifact P0 failure。

### 交易資料與所有權契約

新增 pure module `src/services/pwaUpdateTransaction.ts`，唯一 schema 為：

```ts
type PwaUpdatePhase =
  | 'available'
  | 'applying'
  | 'awaiting-controller'
  | 'verifying'
  | 'recovering'
  | 'failed'

interface PwaUpdateTransactionV1 {
  schemaVersion: 1
  transactionId: string
  sourceVersion: string
  targetVersion: string
  phase: PwaUpdatePhase
  ownerTabId: string
  ownerFence: number
  normalReloadReserved: boolean
  recoveryAttemptCount: 0 | 1
  createdAt: number
  updatedAt: number
  leaseExpiresAt: number
  errorCode?: string
}
```

- PWA-owned keys 固定為 localStorage `projed.pwa-update.transaction.v1`、`projed.pwa-update.completed-version.v1`；sessionStorage `projed.pwa-update.tab-id.v1`、`projed.pwa-update.dismissed-target.v1`、`projed.pwa-update.recovery.v1`。另允許獨立 PWA IndexedDB `projed-pwa-update-v1`／`locks` store 作不支援 Web Locks 時的原子鎖 fallback；不得存入或清除業務 IndexedDB。parser 對未知 schema、非法 phase、空 version、非正整數 fence、非有限 timestamp fail closed；不得清除其他 key。
- 同 target 只允許一個 active `transactionId` 與 owner。優先以 `navigator.locks.request('projed.pwa-update.apply.v1', { mode: 'exclusive', ifAvailable: true })` 取得互斥；不支援 Web Locks 時，必須以獨立 PWA IndexedDB 單一 readwrite transaction 原子讀寫 lock record，不得只靠 localStorage read-then-write。
- owner lease 為 30 秒、active owner 每 10 秒續租；每次取得／接管遞增 `ownerFence`。任何 effect 或 commit 前都必須 reread 並確認 transactionId／ownerTabId／ownerFence／lease；其他分頁只投影狀態，不得呼叫 skip-waiting。owner 關閉或逾期後，另一分頁才可接管；舊 fence 永久失效。
- 跨分頁 channel 固定為 `BroadcastChannel('projed.pwa-update.v1')`，並用 localStorage `storage` event 作 fallback。訊息只傳 transaction／completed change signal；接收端一律重讀並驗證 persisted state，不信任訊息 payload。
- 同分頁 apply promise 必須 singleton；重複 click、visibility、`pagehide`、舊 callback 或重複 `onNeedRefresh` 不得產生第二筆 transaction。
- completed version 只有 `currentVersion === targetVersion` 時可寫入；同 target 後續 `onNeedRefresh`／meta check 必須被抑制。只有有效 owner 在 `applying` 的 stable-target preflight 可於同一 transaction retarget 一次；進入 `awaiting-controller` 後不得改 target。完成舊 target 後再偵測到更高版本時，才建立新交易。

### 狀態機與時序契約

公開 UI state 保留既有狀態並新增 `awaiting-controller`、`verifying`、`recovering`；正常路徑如下：

1. `onNeedRefresh` 或 foreground check 取得可信 latest；`latest !== current` 且不等於 completed／dismissed target 時，persist `available` 並顯示提示。`onNeedRefresh` 只保存最新 queued `updateSW`，不得 background apply。
2. 使用者按「一鍵更新」後取得 30 秒 owner lease，state 進 `applying`，UI 立即 disable CTA 並阻止 later／close 造成第二入口。
3. owner 呼叫 `registration.update()`，等待 registration 出現 waiting worker，timeout 15 秒。再 no-store 讀 latest；若 target 改變，更新 transaction target 並重做一次 preflight。最多兩輪仍變動則以 `TARGET_UNSTABLE` 失敗，0 次 reload。
4. waiting target 穩定後，先 persist `awaiting-controller` 且 `normalReloadReserved=true`，再呼叫最新 queued `updateSW()`，並以目前 registration 的 waiting worker 直接送 `SKIP_WAITING` 作 callback race fallback。controllerchange 先停止舊頁面 writer；套件 controlling handler 或 coordinator 短延遲 fallback 完成唯一有效的 normal reload。
5. startup 先 hydrate transaction，進 `verifying` 並取得 current identity。`current === target` 時原子式寫 completed、移除 active transaction、廣播完成；同 target 提示不再出現。
6. normal reload 後 mismatch 時，若 `recoveryAttemptCount === 0`，寫 `recovering/1` 並只做一次帶 nonce 的 cache-busting navigation；此步仍不 unregister／delete cache。再次 mismatch 或 15 秒內無可信 current，進 `failed`，停止自動 reload。
7. `failed` 只提供明確重試檢查與「清除應用程式快取後重整」人工 recovery。後者才可處理同 origin SW registration／Cache Storage，且要檢查每個 boolean 結果；失敗保留可見 error，不得假裝成功。

非法轉移、舊 owner commit、target downgrade、第二次 normal reload、第二次 automatic recovery、或未點擊就 apply 必須 fail closed。transaction 超過 5 分鐘仍未完成時可標 `failed/TRANSACTION_STALE`，不可靜默刪除後重新提示。

### UI Entry Contract

- Entry：`AppUpdatePrompt` 維持 `src/App.tsx` 的全域掛載、位於 AuthGate 外；actor 為任何已開啟 ProJED web／PWA 的使用者，登入狀態不影響更新能力。
- Trigger：可信 target 可用且非 completed／本 session dismissed；或 transaction 進 recovery／failed。Visibility change 只可觸發 check。
- Normal visible set 必須且只能包含：標題「有新版本可用」、關閉按鈕、primary CTA「一鍵更新」、secondary「稍後」。刪除左側 Refresh 圖示、說明段落、版本 badge 與「到最新版」字樣。
- Applying／awaiting：primary 顯示「更新中」且 disabled；later／close 隱藏或 disabled，避免狀態看似可中止但 effect 已開始。Recovery／failed 可另顯示最小原因、恢復 action 與 icon，不受 normal delete 規則限制。
- Layout：使用一層扁平 surface，縮小 icon 移除後的左側空洞、內距、段距與 action gap；不得新增框中框。1440×900、390×844、320×844 均無水平 overflow、文字截斷、按鈕擠壓或 safe-area 遮蔽。
- Accessibility：dialog／status role 與 aria-live 不重複朗讀；close 有可辨識 label；keyboard focus 不落到 disabled／hidden control；apply 前後 focus 與 visible state 一致。
- Exit：稍後只寫本 session dismissed target；關閉同義。版本 target 改變可再次提示。成功 reload 後由 startup verification 結束，不以 callback resolve 提早結束。

### Repo Impact 與 Work Packages

| WP | 修改範圍 | RD 輸出與完成條件 |
|---|---|---|
| WP-096-A | `src/services/pwaUpdateTransaction.ts`（新增） | schema、strict parser、transition、lease／takeover、completed suppression 與 pure tests；無 browser／storage side effect。 |
| WP-096-B | `vite.config.js`、`src/vite-env.d.ts`、`scripts/release/verify-production-artifact.mjs` | production release ID 注入與 artifact 三方一致 gate；既有 sealed build contract 不降級。 |
| WP-096-C | `src/services/pwaUpdateService.ts` | 重構 `fetchLatestAppShellVersion`、`recordLoadedAppVersion`、`runQueuedUpdate`、`applyPwaUpdate`、`setupPwaLifecycle` 為單一 transaction orchestrator；加入 latest meta、waiting preflight、標準 updateSW、startup verify、BroadcastChannel／Web Locks／IDB fallback 與 bounded recovery；刪除 `applyUpdateWhenBackgrounded` 綁定及 normal cache purge。 |
| WP-096-D | `src/components/AppUpdatePrompt.tsx` | 重構 `AppUpdatePrompt` 的 fixed visible set、緊湊 layout、applying／recovery／failed state 與 accessibility；`src/App.tsx` 預期只做 regression，除非掛載 contract 確有必要才修改。 |
| WP-096-E | DEV-041 verifiers、`package.json`、新增 DEV-096 static／browser／real-SW verifier | 舊 assertion 改依 DEV-096 authority；產生 pure、test-mode、A→B→C、多分頁與 storage safety evidence。 |
| WP-096-F | `ai-doc/dev_task.md`、SPEC-041 addendum、`QA-DEV-096`、後續 QC | RD 回填實際 diff／commands；QA 依 frozen candidate 執行；QC 獨立事實驗證，不修改產品。 |

`src/main.tsx`、`src/components/GlobalErrorBoundary.tsx` 與 DEV-034 install flow 預期只做相容性 regression；若實作必須修改其 public behavior、build pipeline 產不出穩定 release ID、或 `vite-plugin-pwa` 實際 controlling 行為與已檢查版本不同，立即停止 WP 並 Human Re-entry，不可自行換成第二套 reload writer。

### Acceptance／QA／QC Contract

- AC-096-01：同 target 在單頁、連點、hide/show、`pagehide`、reload 與多分頁競態下最多一筆 transaction、一個有效 owner fence 與一次 `updateSW`；每個受 controller 接管影響的 client 最多一次正常 reload，不得形成任一 client 的 reload loop。
- AC-096-02：A→B、B→C、B waiting 時發布 C 均收斂到最新穩定 target；reload 後只有 current===target 才 completed，同版本 normal CTA 不再出現。
- AC-096-03：owner crash 可於 lease 到期後被接管，舊 owner 不得 commit；malformed／stale state 進可見 failed，不形成 loop。
- AC-096-04：正常流程不 unregister SW、不 delete Cache Storage、不清業務 storage；人工 recovery 僅處理 PWA cache 範圍並有結果 readback。
- AC-096-05：一般提示 exact visible set 與 1440／390／320 viewport、focus／ARIA 全通過，visible error、console error、pageerror、HTTP 4xx／5xx、白畫面均為 0。
- AC-096-06：DEV-041 更新 verifier 後通過、DEV-034 regressions 通過、TypeScript 與 `build:test` exit 0；合成 event 不得單獨支持 SW lifecycle PASS。

QA authority：`ai-doc/qa/QA-DEV-096-pwa-update-transaction-convergence.md`。它固定 CT、UI、TX、SW、MT、SAFE、REG cases、FMEA、真實 immutable A／B／C fixture、evidence path 與 stop conditions；核心 acceptance 已執行並由 `QC-DEV-096` 完成 local fact readback。

本次 local QA/QC 已依序執行：

```text
npm.cmd run verify:dev-096-pwa-update-transaction-convergence
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-browser
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-sw
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser
npm.cmd run verify:dev-034-pwa-install-guidance
npm.cmd run verify:dev-034-pwa-install-guidance-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

前三個 DEV-096 commands／scripts 已建立並通過；QA／QC 保留 result JSON、real-SW trace、console／network observation、A/B/C artifact、雙分頁 transaction evidence 與 rendered screenshots。production deploy／remote smoke／release 仍維持未授權邊界。

### FMEA／Fail-Seeking 與 Stop Conditions

最高風險反例：兩分頁同時在 B waiting 時按更新，而 C 又在 preflight 期間發布。驗證必須刻意讓兩頁競搶 owner、讓第一輪 target 改變並中止一個 owner，證明最後只有一個有效 fence／一次 `updateSW` 收斂 C、沒有 B 回退、任一 client 第二次 reload 或同版本提示。

以下任一成立即 P0 stop，不得標 implemented／QA PASS／QC PASS：current≠target 卻 completed、同 target 兩 owner／兩 reload、未點擊自動 apply、production identity 空值仍當成功、正常路徑清 SW／Cache、清除業務資料、同版本 CTA 再出現、缺真實 SW 或多分頁 evidence、任一 visible error／白畫面。資料層、強制更新、release policy 或 production 行為需要擴 scope 時 Human Re-entry。

### Spec Governance、執行邊界與下一步

- `SPEC-041` 已加入 `DEV-096 Corrective Addendum`，明確取代 2026-07-07 normal cache-purge hotfix、舊 CTA 與 background apply；DEV-041 歷史 release evidence 不被改寫。
- `QA-DEV-041` 保留歷史 Phase 1 baseline；B02 舊 CTA 與 C01～C04 normal apply 語意由 `QA-DEV-096` 取代，其餘仍做 regression。
- ADR：不新增。此變更仍在既有 `vite-plugin-pwa` prompt 架構與 DEV-083 release artifact governance 內，沒有跨子系統不可逆決策。
- 衝突：0 個 `Unresolved conflict`；P0／P1 readiness gap 為 0。文件與產品狀態為 `RD Implemented / Local QA-QC PASS / 未 Release`。
- Git／執行邊界：readiness baseline 為 branch `持續優化3`、HEAD `5326a1446f166e25ffa9e205344c8622fa8de8b0`。RD 只可修改 WP-096 列出的產品、測試與文件；保留工作樹既有未提交內容，五個 update-dialog PNG 為既有使用者 artifact，不得修改或刪除。不得 commit、merge、push、deploy 或 release，除非使用者另行授權。
- 下一步：如需正式上線，重新取得使用者授權後進 deployment/release gate；本輪不 commit、merge、push、deploy 或 release。

### 變更紀錄

- 2026-08-30：依使用者重複更新提示回報、紅線刪除與緊湊版面要求建立 DEV-096；文件達 `Brief Ready`，未修改產品程式、未 deploy 或 release。
- 2026-08-30：升級為 `RD Implementation Ready / Human Confirmed`；固定 release ID、transaction schema、lease、狀態機、bounded recovery、UI Entry Contract、逐檔 WP 與 `QA-DEV-096`。產品與 verifier 尚未實作，QA／QC 未執行，未 Deploy／未 Release。
- 2026-08-30：完成 WP-096-A～E 本地實作；加入 transaction／fence、release identity、waiting-worker retarget、controllerchange quiesce／reload fallback、bounded recovery、compact prompt、artifact parity 與 static／browser／real-SW verifier。
- 2026-08-30：local QA/QC fresh evidence 通過：static 25/25、real-SW A→B／B→C／B waiting→C retarget、雙分頁、DEV-041／034 regression、TypeScript、build:test、artifact parity、targeted ESLint；更新 `QA-DEV-096`、`QC-DEV-096` 與 evidence JSON。未 Deploy／未 Release。

## DEV-097：PWA 安全重新載入協調

- 文件成熟度：`RD Implementation Ready / Human Confirmed / Tech Lead Review Remediated`
- 狀態：RD Implemented／Local Automated QA PASS／Independent QC PASS／Physical Device Supplemental Not Verified／未 Release
- 節點類型：交付點
- 父交付點：DEV-041；依賴DEV-096，並相容DEV-034、DEV-083；架構authority為ADR-047
- 是否計入產品交付完成：是（RD 已實作且local automated QA與independent QC PASS；實機補充與release gate尚未完成，對完成率貢獻仍為0）
- 原始需求邊界：`USER-20260831-PWA-SAFE-RELOAD-DESIGN-CRITIQUE`、
  `USER-20260831-GUIDED-DECISIONS-1A-2A-3A`
- 風險等級：Medium（改變所有 web／PWA 使用者可見的更新時機與中斷行為）
- Spec Impact：`Intentional replacement / SPEC-041 DEV-097 addendum is product-and-implementation authority / RD implemented`。
  本契約取代 DEV-096「一般更新一律等待使用者點擊」的產品語意；目前已完成RD實作、
  local automated QA與independent QC，但實機補充與release gate前不得宣稱正式交付。

### Human Decision Brief

- `1A`：只有可能遺失或中斷工作的狀態阻止自動 reload。包含未儲存文字／表單、
  active drag、尚未 durable 的 import／publish、pending write 與 dirty modal。
- 可恢復且已有 durable server identity 的背景 AI／server job、唯讀 modal 不阻止 reload；
  若結果只存在 client memory 或 reload 後無法取回，仍視為 dirty／unsafe。
- `2A`：自然安全邊界依序為下一次開啟、回到前景且 safe，以及目前操作完成後的
  route transition；不得用任意 idle timeout 在原畫面中途 reload。
- `3A`：normal update 在 dirty 期間不以時間強制；dirty 清除後於下一個自然邊界收斂。
  舊版本超出支援期限時另進 critical policy，不偷渡到 normal update。
- Rejected：任何工作執行中一律阻止、dirty 清除立即在原畫面 reload、只等下次開啟、
  固定期限後強制 reload，以及讓使用者永久拒絕同一 normal target。
- Current phase 無剩餘 P0／P1 人類產品決策；repo mapping 與介面細節由後續 RD readiness
  review 決定，不回頭詢問產品選擇。

### 問題與批判結論

瀏覽器在首次開站、無既有 Service Worker 控制或已取得新 app shell 時，本來就會直接載入
目前版本；此時沒有舊版介面可先詢問使用者。已被舊 Service Worker 控制的 client 則可能
先執行舊 bundle，偵測新版後才有機會顯示提示。因此「電腦沒提示、手機仍顯示舊 UI」
可能是 lifecycle／cache state 不同，而不是裝置類型的產品差異。

現行提示把選擇描述成「是否更新」，但系統真正需要使用者決定的是「現在 reload 是否會
中斷工作」。任何更新都要求同意會形成假選擇、增加版本碎片與支援成本。舊版 client 在
完成更新前也只能顯示舊 bundle 內建 UI，新 UI 無法回頭改變已執行的舊程式，必須以
N→N+1 實際轉版驗證。

### 產品核心與使用者價值

更新機制的核心不是取得「使用新版本」的同意，而是同時完成四件事：

1. 讓 client 在合理時間內收斂到可信且受支援的版本。
2. 不在編輯、拖曳、送出或其他不可安全中斷的工作中突然 reload。
3. 保留登入、業務資料與尚未提交內容，失敗時提供有界限恢復。
4. 同一版本只處理一次，跨分頁結果一致，不把通知本身當成功條件。

使用者只在其選擇會改變結果時被打擾。沒有工作中斷風險時，系統自行完成技術維護；有資料遺失或流程中斷風險時，系統才讓使用者選擇重新載入時機。

### 主要流程

1. 系統偵測 N+1 並在背景完成可安全執行的準備，不先用提示打斷使用者。
2. 每個document依自己的產品層owners判定`safe`或`dirty／unsafe`；readiness或signal未知時
   local fail closed。
3. safe document可在自己的下一個自然邊界activation／reload；不顯示一般提示，也不在操作中途
   強制navigation。activation不claim其他documents，舊release cache保留。
4. 任一 client dirty／unsafe 時，只在該 client 顯示「新版已就緒／重新載入／稍後」。
5. 點「重新載入」先請local dirty owners flush、commit或安全取消transient action；全部成功後才
   取得activation owner或執行local reload。任一失敗不得navigation。
6. 點「稍後」只延後 reload；dirty 清除後於下一個自然邊界靜默收斂，不再次要求同意。
7. reload 後沿用 DEV-096 current／target 對帳、completed suppression 與跨分頁 transaction；
   相同 target 不再提示或重載。
8. 更新失敗或版本不一致時進入有界限 recovery／failed UI，才顯示必要原因與恢復動作。

### Current Phase RD Handoff Contract

#### Scope

- 定義 normal update 的 `safe`、`dirty／unsafe` 與 recovery 可見狀態，以及各狀態是否需要使用者決策。
- 建立產品層 reload-safety authority，由編輯、拖曳、匯入／發布、pending write 與 modal
  owners 依本文件固定 interface 提供可聚合訊號。
- `safe` client 在自然邊界靜默套用，`dirty／unsafe` client 才顯示最小重新載入提示。
- 跨分頁採 controller／cache isolation，不採 heartbeat all-safe gate；任一 dirty client只延後
  自己的reload，其他分頁可activation waiting worker，但不得接管、刪除其舊資產或迫使它navigation。
- 桌機與手機採同一狀態契約；只有排版依 viewport 響應。
- 保留 DEV-096 release identity、單一 transaction、跨分頁 owner、post-reload verification、
  bounded recovery 與 business storage 安全邊界。
- 以真實 Service Worker N→N+1 fixture 驗證 safe、dirty、跨分頁與舊 UI bootstrap 路徑。

#### Out of Scope

- 不承諾在 fresh／uncontrolled client 首次取得目前 app shell 前詢問更新同意，也不做每位使用者的 server-side 版本 pinning。
- 不新增 backend coordination、公共 lifecycle platform、第二套 router 或第二個 global store；
  repo file list、interface、Workbox ownership、cache isolation、failure code與測試命令已於下方固定。
- 不擴充 release notes API、analytics、push／email、原生 App Store／Play Store 更新流程。
- 不在 normal update 清除登入或業務資料；cache／Service Worker 清理仍限可見的失敗恢復。
- critical／security mandatory update 不納入 normal update 第一版實作，另以下方 future capsule 保存。

#### 行為、所有權與相容契約

- `safe`／`dirty` 只描述目前 document。所有目前 scope 要求的 owner 都已 ready，且沒有可能
  遺失或不可恢復的 client-only 工作時才是 safe；未知 owner、manifest缺口、signal fault或
  prepare timeout一律 unsafe。
- `dirty／unsafe`：至少一個 local owner 有未 durable工作、active drag、未完成 mutation、dirty
  modal，或 background job結果只存在 client memory。
- Durable background job／唯讀 modal不阻止；重新載入後必須可由 stable ID重新查詢或恢復。
- Natural boundary限 app open、foreground resume且safe，或目前操作完成後的view transition。
  view intent必須在reload後保留；`pagehide`、hidden、任意idle timer不得自行apply。
- 跨分頁安全不採 all-live consensus。依 ADR-047，worker activation固定不 claim既有documents、
  舊release cache保留；因此另一分頁dirty只阻止自己的reload，不阻止safe分頁activation，且不會
  被controllerchange或套件fallback迫使navigation。
- 點「重新載入」是 local flush-and-reload，不是放棄變更。所有 local owners成功確認
  durable／recoverable後才可取得DEV-096 apply owner或執行per-client reload；失敗或timeout保留原頁。
- 點「稍後」只隱藏目前document／target的normal prompt；不清target、不標local已收斂，也不
  形成永久版本pin。dirty→safe後等待自己的下一個natural boundary。
- DEV-096 transaction只約束target detection／activation／有效owner reload／current===target
  verification並保留五分鐘stale；其他documents的延後收斂是session-local obligation，不是
  transaction `verifying`，不得因長時間dirty把已成功activation改判失敗。

#### UI Entry Contract

- Actor：所有 web／PWA 使用者，登入狀態與業務角色不改變更新能力。
- Fresh／uncontrolled 或 controlled-safe：沒有一般更新提示；只在 natural boundary reload。
- Controlled-dirty exact visible set：「新版已就緒」、「重新載入」、「稍後」。不顯示 icon、
  說明段落、版本 badge、close 或一般成功宣告。
- Applying：主動作改為「準備重新載入」或等效最短狀態並 disabled；「稍後」不可重入。
- Prepare 失敗或另一分頁仍 dirty：保留最短原因與恢復動作，不得 reload 或清除資料。
- Recovery／failed：可顯示必要原因、重試與人工 cache recovery；不受 normal exact set 限制。
- 1440×900、390×844、320×844 必須無 overflow、重疊、裁切、safe-area 遮擋與焦點遺失。

#### 資料、API、權限與依賴

- Backend／DB／schema／RLS／RPC／業務 API：預期無變更；若 RD 發現必須新增，停止並回到
  contract review，不得自行擴 scope。
- Client storage：沿用 DEV-096 PWA-owned metadata；不得讀寫 auth token、業務 IndexedDB
  或非 PWA-owned keys。reload-safety owner 只回報狀態或執行既有 save／flush 能力。
- Permission：AuthGate 內外與所有業務角色套用相同更新契約；不新增管理者 override。
- 依賴：DEV-096 version truth／transaction、既有 draft recovery／save 行為、view lifecycle、
  drag lifecycle，以及 cross-tab change signal。實作固定如下，不得另建 router、第二套 global
  state framework 或 backend coordination service。

### RD Implementation Architecture

#### Effect ownership 與啟動順序

1. 先完成 ADR-047 的 worker isolation。`package.json`把 `workbox-window`列為直接依賴；
   `src/services/pwaUpdateService.ts`移除`virtual:pwa-register`，自行建立`Workbox` instance、監聽
   waiting／activated／redundant並送`messageSkipWaiting()`。不得保留套件內建reload handler。
2. `vite.config.js`維持`injectRegister:false`，改為`clientsClaim:false`、`skipWaiting:false`、
   `cleanupOutdatedCaches:false`，並以DEV-083不可變release ID設定release-scoped `cacheId`。production
   release ID缺失時fail closed；不同release不得共用precache namespace。
3. 新增`src/services/pwaReloadSafety.ts`，只持有目前document的owner registry、readiness tokens、
   prepare aggregation、boundary gate與session reload reservation；不得持有heartbeat／TTL或用遠端
   client狀態決定local safety，也不得import React、Zustand或業務service。
4. 新增`src/services/pwaReloadOwnerManifest.ts`，以typed owner ID、repo authority、適用surface與
   readiness scope固定mandatory owner set；static verifier必須證明matrix每個owner均有adapter與case。
5. 新增`src/hooks/usePwaReloadSafetyOwner.ts`，只把React component的signal／prepare callback註冊到
   domain service。component與owner不得呼叫worker、navigation、transaction writer或cache recovery。
6. 新增`src/components/PwaReloadSafetyBridge.tsx`。AuthGate外層只回報app-open、hidden→visible與
   `currentView` intent，不得宣告safe；`AuthGate`與`AppContent`內部分別明確回報`auth-shell`、
   `active-view` readiness。專案沒有React Router，view transition仍沿用
   `useBoardStore.currentView`，不得引入router。
7. `pwaUpdateService.ts`是detection、single activation、navigation、verification與recovery的唯一
   effect owner。owner、Bridge與prompt只能送intent；`controllerchange`／Workbox event只更新狀態，
   不直接reload。
8. 初始document為`booting`且不可auto apply。只有version readback、auth-shell、active-view與目前
   manifest-required owners全部ready後才可分類`safe／dirty`；animation frame只可debounce revision，
   不得作為owner完整註冊的證據。任何readiness缺口fail closed為`blocked`。

#### Natural-boundary orchestration

- `app-open`：Bridge ready、document visible、目前 app shell 完成 version readback後送一次。
- `foreground`：只接受 `hidden → visible`；hidden、`pagehide`、一般 timer 不是 boundary。
- `view-transition`：Bridge 觀察 `currentView` 真正變更後送出；reload 前必須 readback
  `localStorage['projed-last-view'] === currentView`。workspace／board intent 沿用既有
  `projed-last-ws`、`projed-last-board`。readback 失敗回 `VIEW_INTENT_NOT_DURABLE` 並留在原頁。
- 使用者點「重新載入」在 owners prepare 成功後本身即為 explicit boundary；不必再等待下一個
  view transition。dirty 自行清除不是 boundary，不得立刻在原畫面 reload。
- waiting worker已由其他client activation、但目前document仍是N時，不再送`messageSkipWaiting()`或
  重開activation transaction；目前client只在自己的下一個boundary取得session reservation後reload。
- activation後舊document的application不得自動navigation；若old lazy asset／API無法readback、
  application因controllerchange意外reload或normal path刪除舊cache，視為`OLD_RELEASE_ISOLATION_FAILED`
  並停止交付。controllerchange本身需記錄，但不是單獨 failure。

### Local Reload-Safety Interface 與 Transaction Boundary

```ts
export type PwaReloadSafetyState = 'booting' | 'safe' | 'dirty' | 'preparing' | 'blocked';
export type PwaReloadBoundary = 'app-open' | 'foreground' | 'view-transition' | 'user-confirmed';
export type PwaReloadReadinessScope = 'version-shell' | 'auth-shell' | 'active-view';

export type PwaReloadSafetyReason =
  | 'RECORD_DRAFT_UNSAVED'
  | 'RECORD_SAVE_IN_FLIGHT'
  | 'CLIENT_JOB_IN_FLIGHT'
  | 'FORM_DRAFT_UNSAVED'
  | 'PENDING_WRITE'
  | 'BACKUP_RESTORE_IN_FLIGHT'
  | 'TRANSIENT_DRAG_ACTIVE'
  | 'DIRTY_MODAL'
  | 'OWNER_SIGNAL_UNKNOWN';

export type PwaReloadSafetyFailureCode =
  | 'SAFETY_NOT_READY'
  | 'OWNER_SIGNAL_FAULT'
  | 'OWNER_ACTION_REQUIRED'
  | 'OWNER_PREPARE_FAILED'
  | 'OWNER_PREPARE_TIMEOUT'
  | 'LOCAL_READBACK_DIRTY'
  | 'OWNER_MANIFEST_INCOMPLETE'
  | 'VIEW_INTENT_NOT_DURABLE'
  | 'RELOAD_RESERVATION_FAILED'
  | 'RELOAD_NAVIGATION_NOT_STARTED'
  | 'WORKER_ACTIVATION_FAILED'
  | 'OLD_RELEASE_ISOLATION_FAILED';

export interface PwaReloadSafetyOwnerSnapshot {
  ownerId: string;
  state: 'safe' | 'dirty';
  reasonCodes: PwaReloadSafetyReason[];
  revision: number;
}

export interface PwaReloadSafetyOwner {
  ownerId: string;
  getSnapshot(): PwaReloadSafetyOwnerSnapshot;
  prepareForReload(): Promise<
    | { ok: true; revision: number }
    | { ok: false; code: PwaReloadSafetyFailureCode }
  >;
}

export type PwaReloadGateResult =
  | { ok: true; code: null; localState: 'safe' }
  | {
      ok: false;
      code: PwaReloadSafetyFailureCode;
      localState: PwaReloadSafetyState;
    };

export function registerPwaReloadSafetyOwner(owner: PwaReloadSafetyOwner): () => void;
export function setPwaReloadReadiness(
  scope: PwaReloadReadinessScope,
  epoch: string,
  ready: boolean,
): void;
export function requestPwaReloadBoundary(
  boundary: PwaReloadBoundary,
  currentView: ViewMode | null,
): Promise<PwaReloadGateResult>;
export function preparePwaReloadOwners(): Promise<PwaReloadGateResult>;
export function reservePwaReloadForTarget(targetVersion: string): boolean;
```

- `ownerId` 在同一 document 必須唯一；duplicate、throw、invalid revision 或未知 reason 均為
  `OWNER_SIGNAL_FAULT`。prepare 使用同一個 15 秒 global deadline 平行執行，完成後重新讀取所有
  owner snapshots；任一仍 dirty、revision 倒退或 timeout 都不得 navigation。
- `src/services/pwaReloadOwnerManifest.ts`固定typed owner IDs、適用surface與readiness producer；目前
  scope宣告ready時若expected owner未註冊，回`OWNER_MANIFEST_INCOMPLETE`。owner mount數量或一個
  animation frame不得替代manifest對帳。
- session reservation key固定為`projed.pwa-reload.reserved-target.v1`，同一document／target最多一次
  normal reload。reservation只保存target與startedAt，不存user／workspace／board／內容。
- 不建立per-document heartbeat、TTL、all-live ack array或remote safety record。跨分頁只沿用
  DEV-096 transaction／completed change signal；任何absence／expired metadata都不得推論遠端safe。
- `PwaUpdateTransactionV1`維持schema 1與五分鐘stale。它在有效owner document
  `currentVersion===targetVersion`時completed，不等待其他documents；其他documents的
  `currentVersion!==latestVersion`只形成local pending target，不讓global transaction維持verifying。
- 修正DEV-096 suppression：`completedVersion===latestVersion`只有在目前document同時
  `currentVersion===latestVersion`時可suppress。舊／恢復client看到global completed後，仍依local
  owner safety在自己的boundary收斂。
- `controllerchange`、Workbox `activated`與BroadcastChannel只更新target／controller狀態，不得直接
  navigation。跨分頁dirty protection由`clientsClaim:false`與release cache isolation提供，不以
  preflight timing或local hard gate宣稱阻止套件內部reload。
- reservation 在呼叫 reload前寫入並 readback；新 document只有在 `currentVersion===reservedTarget`
  時清除。若 reload後仍 mismatch，保留 reservation並進 DEV-096 bounded recovery，不再 normal
  reload；若3秒內未收到本 document的 `pagehide`，清除本次 reservation、回
  `RELOAD_NAVIGATION_NOT_STARTED`，讓使用者可在原頁重試。transaction完成retarget後，舊 target
  reservation才可由 service以新 target取代。
- normal activation不得清除precache。每個production release使用獨立cache namespace，且新worker
  不claim舊document；N dirty tab在N+1 activation後仍須能由N controller載入N lazy asset。自動舊
  cache回收留在ADR-047 future capsule，不能以TTL或「應該沒有分頁」猜測實作。

### V1 Reload-Safety Owner Matrix

以下是 repo audit 後的 mandatory owner set；未列出的唯讀 panel、filter、popover、單純 pan／resize
與已有 durable stable ID 的 server job 不註冊。RD 不得只實作 record draft 或單一 drag surface。

| Owner ID／檔案 | Dirty signal | `prepareForReload`／readback |
|---|---|---|
| `record-draft`：`src/components/Records/RecordSidebar.tsx`、`src/hooks/useMeetingDraftRecovery.ts`、`src/store/useRecordStore.ts` | draft signature≠baseline、`saving`、meeting synthesis／project-import client job in flight | 一般紀錄呼叫既有 `saveDraft` 並驗 signature；會議草稿先 `saveMeetingDraftSnapshot`，只接受 `saved／degraded` 且可 load readback。client-only job 等待完成；deadline 到則失敗，不中止並假裝 durable。 |
| `task-details`：`src/components/TaskDetailsModal.tsx` | local title／notes 與 node 不同、pending persist count、failed updates、collection pending | 重用 `savePendingTaskDetails／retryFailedSave`；等待 pending=0 且 failed map empty，否則 prepare failed／timeout。 |
| `calendar-subscription-form`：`src/components/CalendarSubscriptionsView.tsx` | builder payload／name 已改、`isSaving` | 已送出的 save 等待 readback；未提交／不完整 form 不自動建立訂閱，回 `OWNER_ACTION_REQUIRED`，要求先儲存或取消。 |
| `backup-import`：`src/components/BackupSettings.tsx` | selected inspection／plan 尚未完成，或 `inspectLoading／planLoading／executeLoading` | inspection／plan draft 回 action-required；execute 中禁止 cancel／reload，等待完成或 timeout。沿用目前 `beforeunload` guard。 |
| `rag-query`：`src/components/Rag/RagSidebar.tsx`、`src/store/useRagStore.ts` | 未送出的 input，或 `isLoading` 且結果僅在 client memory | 未送 input 回 action-required；現行 RAG 無 stable job ID，in-flight 一律等完成或 timeout，不能誤列 durable job。 |
| `board-member-invite`：`src/components/BoardMembersPanel.tsx` | invite form 已輸入或 invite write in flight | 未送 form 回 action-required；pending write 等 settled readback。 |
| `inline-editor`：`src/components/Sidebar.tsx`、`src/components/Tags/TagPicker.tsx`、`src/components/MindMap/MindMapNode.tsx`、`src/components/MindMap/MindMapView.tsx` | workspace／board／tag／mind-map title 或 relationship label local draft | 呼叫各 component 既有 commit callback並比對 store／local durable value；invalid value 回 action-required。不得靠 synthetic blur 當成功證據。 |
| `dirty-dialog`：`src/components/GlobalDialog.tsx` | input dialog 有尚未決定的 value／action | 不替使用者確認 destructive 或 semantic action；回 action-required。純 confirm／read-only dialog 不 dirty。 |
| `task-drag`：`src/components/BoardView.tsx`、`src/components/Wbs/WbsListView.tsx`、`src/components/SharedTaskSidebar.tsx`、`src/components/Gantt/GanttTaskBar.tsx`、`src/components/MindMap/MindMapView.tsx`、`src/components/Wbs/taskDrag/useTaskDragSession.ts` | 任一 desktop／mobile drag、Gantt resize、mind-map node／relationship pointer drag active | 呼叫現有 cancel／clear path，Gantt 清 preview不 commit，再驗 active state、overlay、simulated dates 全清。不得半套 commit task position。 |

新增 local editor、modal、client-only job 或 pending mutation 時，若可能在 reload 遺失，必須在同一
PR 註冊 owner 並補 verifier；這是 extension rule，不是本 DEV 要建立通用 workflow platform。

### State、Failure 與 UI Mapping

`PwaUpdateState`增加`reloadSafetyState`、`reloadSafetyCode`、`pendingBoundary`、
`pendingLocalTarget`；不新增第二個global store。normal target detected時：

- `safe`：`updateAvailable=true` 可供 orchestration，但 `AppUpdatePrompt` 不 render；boundary取得
  gate 後進既有 `applying／awaiting-controller／verifying`。
- `dirty`：render exact set「新版已就緒／重新載入／稍後」。點 primary 後為 `preparing`，
  文字固定「準備重新載入」、兩按鈕 disabled。
- `booting`：不 apply、不顯示 normal prompt；readiness完成後再決定。
- `blocked`：留在原頁；可見文字依 code 最短化，不能清資料。`recovering／failed` 仍沿用
  DEV-096必要 retry／cache-recovery UI。

| Code | 觸發 | 可見／恢復行為 |
|---|---|---|
| `SAFETY_NOT_READY`、`OWNER_SIGNAL_FAULT`、`OWNER_MANIFEST_INCOMPLETE` | readiness未完成、owner缺漏／throw／invalid | 不reload；「目前無法確認內容是否已保存。」 |
| `OWNER_ACTION_REQUIRED` | form／dirty dialog 不能代替使用者 commit | 不 reload；「請先儲存或取消目前編輯。」 |
| `OWNER_PREPARE_FAILED`、`OWNER_PREPARE_TIMEOUT` | save／flush／cancel failure 或超過 15 秒 | 不 reload；「內容尚未保存，請完成後再試。」 |
| `LOCAL_READBACK_DIRTY` | prepare 後 snapshot 仍 dirty／revision 不可信 | 不 reload；同 prepare failure。 |
| `VIEW_INTENT_NOT_DURABLE` | `projed-last-view` readback 不符 destination | 不 reload；保留已切換畫面並允許稍後重試。 |
| `RELOAD_RESERVATION_FAILED` | session target reservation無法寫入／readback | 不 reload，避免同 target loop。 |
| `RELOAD_NAVIGATION_NOT_STARTED` | 呼叫reload後3秒仍無`pagehide` | 清本次reservation、保留頁面並允許重試。 |
| `WORKER_ACTIVATION_FAILED` | waiting worker未進activated／redundant／message失敗 | 不reload；沿用DEV-096 bounded recovery。 |
| `OLD_RELEASE_ISOLATION_FAILED` | 舊document被claim、舊lazy asset遺失或normal path刪precache | P0 Stop-Ship；保留資料並進recovery，不宣稱safe rollout。 |

DEV-096 的 `TARGET_UNSTABLE`、`CONTROLLER_TIMEOUT`、`OWNER_LEASE_LOST`、
`POST_RELOAD_MISMATCH`、`TRANSACTION_STALE`、`COMPLETED_VERSION_WRITE_FAILED` 維持原 recovery
authority；不得用 safety code 吞掉 transaction failure。

### Repo Impact 與 RD Work Packages

| WP | 檔案／模組 | 交付內容 | Exit evidence |
|---|---|---|---|
| WP-097-A Workbox isolation | 修改`package.json`／lock、`vite.config.js`、`src/services/pwaUpdateService.ts` | `workbox-window`直接依賴；移除virtual helper；`clientsClaim=false`、release cacheId、no normal cleanup；application-owned waiting／activation events | source assertion＋real-SW證明無內建reload、N cache／controller在N+1 activation後仍可用 |
| WP-097-B Local safety／readiness | 新增`src/services/pwaReloadSafety.ts`、`src/services/pwaReloadOwnerManifest.ts`、`src/hooks/usePwaReloadSafetyOwner.ts`、`src/components/PwaReloadSafetyBridge.tsx`；修改`src/App.tsx`與`AuthGate.tsx` | local registry、typed manifest、explicit version/auth/view readiness、prepare deadline、boundary、session reservation；無heartbeat／TTL／all-live gate | pure＋browser覆蓋manifest缺漏、readiness epochs、revision、same-target reservation與三種boundary |
| WP-097-C Owner adapters | 修改 owner matrix 所列 component／hook／store | mandatory local drafts、pending writes、client jobs與全部 drag surfaces 註冊 signal／prepare／readback | owner matrix fixture逐項 PASS；任一省略即未完成 |
| WP-097-D Transaction split／UI | 修改`src/services/pwaUpdateService.ts`、`src/components/AppUpdatePrompt.tsx`；`src/services/pwaUpdateTransaction.ts`只允許相容assertion、不升schema | activation transaction與per-client convergence分離、local boundary reload、completed suppression correction、compact prompt／failure mapping | browser＋real-SW N→N+1／N+2、多分頁dirty isolation、5分鐘stale與同target reload count |
| WP-097-E Verifiers | 新增 `scripts/verify-dev-097-pwa-safe-reload.ts`、`scripts/verify-dev-097-pwa-safe-reload-browser.pw.js`、`scripts/verify-dev-097-pwa-safe-reload-sw.mjs`；修改 `package.json` | static／browser／real-SW commands 與 deterministic result JSON | 三個 DEV-097 commands exit 0 且 artifacts complete |
| WP-097-F QA／QC handoff | 更新 DEV、SPEC-041、QA-DEV-097、documentation map；RD完成後新增 QC evidence | frozen revision、fresh rerun、visible-error、runtime cleanup、regression | QA／QC各自 evidence；readiness 不等於 PASS |

Backend／Supabase／migration／RLS／hosting capability預期無變更；`vite.config.js`、package dependency與
build artifact cache namespace是本期明確scope。`PwaUpdateTransactionV1`維持schema 1，不新增client
heartbeat metadata或business migration。normal path不得刪Cache Storage、SW registration、auth、
draft-recovery或業務localStorage／IndexedDB；normal release在舊client收斂期間必須維持API相容，
否則停止並轉critical／mandatory contract。

### Executable Verification Contract

RD 完成後依序執行，任一 fail 不得交 QA：

```powershell
npm.cmd run verify:dev-097-pwa-safe-reload
npm.cmd run verify:dev-097-pwa-safe-reload-browser
npm.cmd run verify:dev-097-pwa-safe-reload-sw
npm.cmd run verify:dev-096-pwa-update-transaction-convergence
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-browser
npm.cmd run verify:dev-096-pwa-update-transaction-convergence-sw
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery
npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser
npm.cmd run verify:dev-034-pwa-install-guidance
npm.cmd run verify:dev-034-pwa-install-guidance-browser
npm.cmd run verify:dev-069-meeting-draft-recovery
npm.cmd run verify:dev-092-record-sidebar-quietness
npm.cmd run verify:dev-045-calendar-subscription-builder-preview
npm.cmd run verify:dev-047-backup-package-contract
npm.cmd run verify:p9-rag-local
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-054-mobile-task-drag-precision
npm.cmd run verify:dev-095-task-tracking-interaction-parity
npm.cmd exec tsc -- --noEmit
$dev097LintFiles = @(
  'vite.config.js', 'src/App.tsx', 'src/components/AuthGate.tsx',
  'src/services/pwaUpdateService.ts', 'src/services/pwaUpdateTransaction.ts',
  'src/services/pwaReloadSafety.ts', 'src/services/pwaReloadOwnerManifest.ts',
  'src/hooks/usePwaReloadSafetyOwner.ts', 'src/components/PwaReloadSafetyBridge.tsx',
  'src/components/AppUpdatePrompt.tsx', 'src/components/Records/RecordSidebar.tsx',
  'src/hooks/useMeetingDraftRecovery.ts', 'src/store/useRecordStore.ts',
  'src/components/TaskDetailsModal.tsx', 'src/components/CalendarSubscriptionsView.tsx',
  'src/components/BackupSettings.tsx', 'src/components/Rag/RagSidebar.tsx',
  'src/store/useRagStore.ts', 'src/components/BoardMembersPanel.tsx',
  'src/components/GlobalDialog.tsx', 'src/components/Sidebar.tsx',
  'src/components/Tags/TagPicker.tsx', 'src/components/MindMap/MindMapNode.tsx',
  'src/components/MindMap/MindMapView.tsx', 'src/components/BoardView.tsx',
  'src/components/Wbs/WbsListView.tsx', 'src/components/SharedTaskSidebar.tsx',
  'src/components/Gantt/GanttTaskBar.tsx',
  'src/components/Wbs/taskDrag/useTaskDragSession.ts'
)
npm.cmd exec eslint -- $dev097LintFiles
npm.cmd run build:test
git diff --check
```

固定 artifacts：`output/qa/dev-097/static-result.json`、
`output/playwright/dev-097/ui-result.json`、
`output/playwright/dev-097/sw-integration-result.json`，以及同目錄 1440×900、390×844、320×844
screenshots。real-SW result必須含immutable N／N+1／N+2 identity、served-byte parity、Workbox
registration owner、waiting／activated state、N／N+1 controller與cache namespace、local
boundary／reason、transaction／fence、activation count、per-client navigation count、completed write
與runtime cleanup。上述verifier已在2026-08-31 frozen candidate fresh執行並通過；詳細結果以
`QA-DEV-097` execution record與固定JSON為準，仍不等同independent QC或production release evidence。

### Acceptance、Evidence 與 Stop Conditions

- Fresh／uncontrolled client 直接取得目前版本且不顯示更新提示；此結果屬預期行為，不宣稱使用者曾同意版本切換。
- controlled-safe client 只在 natural boundary 收斂 N+1；無一般提示、不在操作中途 reload，
  reload 後 current===target。
- controlled-dirty client 只顯示 exact visible set，不遺失未提交內容；flush 成功後才執行一次
  transaction，flush 失敗則保持原頁並顯示可恢復錯誤。
- Tab A safe可由單一owner activation N+1；Tab B dirty保持 application navigation count=0、N release
  asset與原資料可 readback；shared-scope `controllerchange`若發生不得觸發 application reload。B只在
  自己的boundary reload，且不重開activation transaction。
- activation transaction在有效owner document `current===target`後completed；其他dirty／hidden client
  不延長五分鐘transaction，也不能被global completed誤判為local已收斂。
- 同一 lifecycle 與 dirty state 的桌機／手機行為一致；1440×900、390×844、320×844 的必要提示無 overflow、遮擋或不可達操作。
- 真實 N 舊 bundle 必須先顯示 N 內建 UI，完成 N→N+1 後才驗證新 UI；不得用 N+1 fresh load 截圖冒充舊 client 已獲得新提示。
- 連點、hide／show、reload、多分頁、owner crash 與 target retarget 後，相同 target 仍只有一筆有效 transaction、一次有效 apply，且 completed 後不再出現。
- Evidence 分開記錄 source／artifact identity、真實 SW trace、dirty fixture、跨分頁 gate、
  使用者操作與 viewport screenshot；build 或 synthetic event 不單獨支持 UI／SW PASS。
- QA authority：`ai-doc/qa/QA-DEV-097-pwa-safe-reload-orchestration.md`。

以下任一成立即 stop：dirty work／登入或業務資料遺失、任一分頁可迫使另一dirty分頁reload、
任意 idle／pagehide apply、normal target 以時間強制、safe path 顯示一般提示、dirty path 缺 CTA
或多出被刪除元素、同 target 多 transaction／多 apply／重複提示、current≠target 卻 completed、
仍import`virtual:pwa-register`、`clientsClaim=true`、activation刪除舊release資產、ready只靠animation
frame、owner manifest缺漏、visible error／白畫面，或缺真實N→N+1／多分頁／viewport evidence卻
宣稱PASS。

### Future Phase Capsule：Critical／Security Mandatory Update

狀態：`Future Phase Captured / Not Requested`。

- 目的：在安全漏洞、資料相容性破壞或後端不再支援舊 client 時，縮短不可接受的版本暴露時間。
- 邊界：不得直接沿用 normal update 的靜默規則；需要版本支援政策、critical 判定來源、draft save／restore、倒數或阻擋語意與可稽核 release evidence。
- 驗收方向：先保存可恢復工作，再清楚告知原因並要求重新載入；不得造成登入或業務資料遺失，也不得形成 reload loop。
- Re-entry trigger：產品確認需要 mandatory update，或 release／security incident 明確宣告舊版本必須停止使用時，另升級 contract；目前不建立獨立 DEV。

### Future Phase Capsule：Verified Old-Cache Reclamation

狀態：`Future Phase Captured / Not Requested`；Architecture Memory Source為ADR-047。

- 目的：在不破壞仍由舊controller服務的documents前提下，自動回收已無client使用的release cache。
- 邊界／依賴：需要可靠的Service Worker client census、client↔release identity、PWA-owned cache
  allowlist、quota failure evidence與版本支援政策；heartbeat／TTL或record absence不得當成client死亡證據。
- 驗收方向：N client仍存在時N lazy assets持續可用；最後client離開後只刪允許的舊release cache；
  census未知或不支援時fail safe為不刪除。
- Re-entry trigger：至少一個DEV-097 release完成真實production lifecycle驗證，且產品要求自動回收
  Cache Storage時另立DEV／spec；本期normal path固定不自動清precache。

### Spec Governance、執行邊界與下一步

- Cross-spec：`Intentional replacement`。SPEC-041 DEV-097 addendum 成為新產品／實作 contract；
  DEV-096 保留歷史 implementation／evidence，現行程式標 `Implementation needs correction`。
- ADR：已建立`ADR-047`，固定application-owned Workbox registration、`clientsClaim:false`、
  release-scoped cache retention、activation transaction／per-client convergence分離與explicit readiness。
- Deferred Scope Audit：critical／security mandatory update與verified old-cache reclamation皆已以上方
  capsule保存；兩者未被偷渡到normal第一版。
- Tech Lead Review Remediation：已移除virtual helper隱藏reload、all-live completion／五分鐘stale衝突、
  heartbeat TTL safety推論與one-frame readiness；QA同時擴到全部owner adapters與相鄰regressions。
- Readiness Gate：scope、ADR、repo／module impact、Workbox／cache contract、local owner interface、
  transaction boundary、failure／recovery、work packages、commands、evidence與stop conditions已固定；
  P0／P1 readiness gap=0，可直接由RD依WP-097-A～F實作。
- 執行邊界：本輪已修改DEV-097 scope內產品、verifier、build config、package lock與文件；未修改
  migration、deploy或release。`Local Automated QA PASS`與`Independent QC PASS`均不代表production
  release PASS；實機補充仍未驗證。
- Git boundary：readiness baseline固定為branch `持續優化3`、HEAD
  `3a924ae5890f958d1010beb66db4c57c9cd76e20`（相對`origin/持續優化3` ahead 15）。目前文件變更
  未提交，屬本 DEV既有工作樹；RD開工前須重讀status並保留其他未提交變更，不得自動commit／push。
- 下一步：若納入本次release，先補DEV-054 iOS／Android實機或由產品明確確認不納入，再走
  deployment-release-gate與production smoke。不得由本次HeadlessChrome evidence取代實機gate。

### 變更紀錄

- 2026-08-31：依使用者對更新機制核心用意、合理性與批判性設計要求建立 DEV-097；文件達 `Brief Ready / Need Human Decisions`，未修改產品程式或現行 SPEC authority。
- 2026-08-31：使用者以引導模式確認 `1A／2A／3A`；固定 risk-based dirty scope、natural
  boundary 與 normal no-time-force policy，文件升級 `RD Contract Ready / Human Confirmed`，
  同步 SPEC-041 DEV-097 addendum 與 QA-DEV-097；產品尚未實作或驗證。
- 2026-08-31：完成 repo／module audit，固定 client-only reload-safety service、per-document
  heartbeat／ack schema、所有 mandatory dirty owners、view-transition bridge、failure codes、
  WP-097-A～F、verifier commands／artifacts 與 migration／storage boundary；升級為
  `RD Implementation Ready / Human Confirmed / Not Implemented`。本輪未修改產品或執行 QA／QC。
- 2026-08-31：RD技術主管審查判定原契約不通過：`virtual:pwa-register`仍可繞過gate reload、
  all-live completion與五分鐘stale／dirty無期限延後互斥、heartbeat TTL不能證明client死亡、
  one-frame readiness與QA覆蓋不足。新增ADR-047並完成corrective replacement：改採application-owned
  Workbox、`clientsClaim:false`、release-scoped cache retention、per-client local convergence、explicit
  readiness／typed owner manifest及完整owner regression gate；重新通過RD Readiness Gate，仍未實作。
- 2026-08-31：依使用者授權完成 DEV-097 WP-097-A～E：改為 application-owned Workbox registration、
  release-scoped cache namespace、local readiness／typed owner manifest、9 類核心 owner adapter（另接入 DEV-122 quick-task-capture）、
  boundary safety／session reservation、compact prompt 與三層 verifier；`verify:dev-097-pwa-safe-reload`
  11/11、browser smoke、real-SW N→N+1 isolation、TypeScript、targeted ESLint、`build:test` 與 DEV-096
  static／browser／real-SW regressions fresh PASS。完整 QA／QC、production deploy／release 尚未執行。
- 2026-08-31：QA回送並完成根因修正：readiness最後producer立即重評、九個真實owner UI訊號／取消與
  readback、stable waiting-worker activation、桌面縮手機寬時收側欄，以及DEV-047 V3 verifier同步。
  DEV-097 static `23/23`、browser九類核心 owner／雙分頁／失敗讀回、DEV-096／097 real-SW A→B→C、
  DEV-028／034／041／045／047／054／069／092／095／RAG regressions、TypeScript、32-file ESLint
  （0 errors）、`build:test`與`git diff --check` fresh PASS。DEV-054 8px案例修正harness競態後連續兩輪
  `15/15`。當時狀態升為`Local Automated QA PASS / Independent QC Pending / 未 Release`，後續已由獨立QC
  完成複核並更新為`Independent QC PASS / Physical Device Supplemental Not Verified / 未 Release`。
- 2026-08-31：依使用者授權執行獨立本機QC：DEV-097／DEV-096／DEV-041／DEV-034／DEV-028／DEV-045／
  DEV-047／DEV-054／DEV-069／DEV-092／DEV-095／RAG static與browser fresh PASS，DEV-096／097 real-SW
  亦PASS；artifact hash、runtime cleanup與hardware discovery均留存於`QC-DEV-097`。因本機無`adb`、
  `idevice_id`或可操作Portable Device，iOS／Android實機補充標記`Not Verified`，未執行deploy／release。

## DEV-098：任務明細子任務管理區

- 文件成熟度：`RD Implementation Ready / Human Confirmed / Tech Lead Reviewed → RD Implemented`
- 狀態：`Implemented / Core Local QA-QC PASS / Adjacent Regression Audit PASS / Persistence Re-development Gate Pending / 未 Release`
- 節點類型：交付點
- 父交付點：DEV-028、DEV-046、DEV-070；相容 DEV-053、DEV-089、DEV-095
- 是否計入產品交付完成：是（核心 implementation、local automated QA、獨立 QC 與指定相鄰 regression 已完成；儲存可靠性重開發、實機 supplemental 與 release gate 未完成，完成率仍依專案規則處理）
- 原始需求邊界：`USER-20260901-TASK-DETAIL-SUBTASK-SURFACE`
- 風險等級：Medium（新增可見入口、明細內導航、拖曳作用域、overlay／focus 與權限一致性）
- Spec Impact：`Compatible extension / prior out-of-scope re-entry`。DEV-028／046／070 先前不改
  `TaskDetailsModal` 內部資訊架構的限制只約束當時 DEV；本 DEV 明確重新進入該範圍，但不改
  canonical task／placement、權限或 authoritative transaction 語意。
- 執行規格：`ai-doc/specs/SPEC-098-task-detail-subtask-management.md`
- QA 計畫：`ai-doc/qa/QA-DEV-098-task-detail-subtask-management.md`
- QC 報告：`ai-doc/qc/QC-DEV-098-task-detail-subtask-management.md`
- ADR：不需要；局部 drag host 是本 DEV 可逆 UI 架構決策，領域權威已在 SPEC-089／095。

### 問題與使用者價值

目前使用者在父任務明細中無法直接看見與操作其子任務，必須關閉明細、回到看板尋找對應
L3+ 任務，再重新進入其他任務明細。此切換破壞父子脈絡，也讓同一批任務在看板與明細產生
兩套操作位置。成功結果是在父任務明細內直接完成子任務瀏覽、建立、編輯入口、拖曳、明細
切換與右鍵操作，同時維持看板既有資料、權限、交易、復原與互動語意。

### Human Confirmed 決策與 Architecture Memory Capsule

- 任務明細底部新增「子任務」區，預設展開並可收合；收合時仍保留標題與直屬子任務數量。
- 子任務採看板 L3+ 的扁平階層列與遞迴樹，不複製另一份 task/date/tag/action JSX。
- 看板與任務明細各自擁有局部 drag host；共用任務列、`useTaskPlacementController`、drop intent、
  placement commit 與 failure／undo contract。不得為追求同一 runtime context 而把看板
  `DndContext`、L1／欄位／工作台碰撞規則提升為全域 Provider。
- 任務明細遮住看板期間，拖曳目標只包含目前明細的可見子樹與「目前任務直屬層」；不允許
  拖向遮罩後方的看板、工作台或其他檢視。
- 點開子任務使用同一個明細視窗切換，不疊第二個 modal；需保留返回父任務的可辨識路徑。
- 從看板等入口直接開啟有父任務的明細時，標題列提供「回到上一階任務」按鈕，沿用同一 modal
  navigation stack 與 save guard。
- 父任務本機草稿必須先安全寫入；保存 pending或失敗時阻止切換，不能用導航掩蓋資料風險。
- 右鍵選單位於明細 overlay 上層；Escape 關閉順序固定為右鍵／子層浮窗優先，最後才是明細。
- 不新增第二層捲軸；子任務區跟隨明細主內容捲動。手機短滑維持捲動優先，長按才進入拖曳。

RD 執行時不得把「明細也在拖曳範圍內」解讀成背景看板也可命中。可拖曳範圍精確固定為：

```text
TaskDetailsModal 內目前可見 placement subtree
+ current details root 的 append-child drop target
- modal 外 Board／Workbench／other view targets
```

### RD 技術主管 Gate

- 結論：`通過（文件修正後）`。本方案處理 private Board row、Board-only drag host與單 ID details host
  的直接根因；沒有引入第二套 transaction或資料模型。
- 最小實作：抽一份 neutral checklist row／tree；Details建立local drag host；將既有 close-save
  continuation泛化為單一 typed transition；由小型 `useTaskDetailsNavigation` hook保存 stack。
- 明確不做：global `DndContext`、通用 overlay manager、多 modal／breadcrumb framework、完整重構
  `GlobalContextMenu`、或無 provider readback依據的 10 秒 save unknown狀態。
- 有界技術債：`GlobalContextMenu` 暫留 details host。只有未來出現第二個非 menu details host時，
  才另立 DEV／ADR拆為 details provider；不得在 DEV-098 預作框架。

### 主要流程

1. 使用者從既有任務入口開啟任務明細，向下即可看到預設展開的子任務區。
2. 區內依 placement order 顯示直屬子任務並遞迴呈現更深層任務；收合只隱藏樹，不改資料。
3. 點擊子任務前先完成目前明細草稿保存；成功後在同一 modal 切換至子任務，可返回父任務。
4. 右鍵或鍵盤選單沿用同一 task action catalog 與 permission guard；編輯仍進入任務明細，
   不新增 checklist row 行內改名。
5. 拖曳可在可見子樹內同層排序、改掛為其他可見任務的下層，或拉回目前任務直屬層；
   durable commit 成功才收斂畫面，失敗保留原位置並提供既有錯誤／復原回饋。
6. 合法 primary placement沒有子任務時顯示最小空白狀態與唯一「新增子任務」入口，沿用既有
   create-child command；tracking／readonly empty依 UI Entry Contract不顯示誤導 CTA。

### Current Scope

- [x] 明細底部的預設展開／可收合子任務區、直屬數量與最小空白狀態。
- [x] 看板 L3+ 與明細共用 task row／recursive placement tree／interaction controller；只由 host
      adapter 提供不同拖曳作用域與表面識別。
- [x] 細滑鼠點擊／右鍵、鍵盤 Enter／Shift+F10、手機 tap／scroll／long-press 行為一致。
- [x] 同層排序、可見子樹改掛、拉回目前任務直屬層，以及 primary／tracking placement 權限路由。
- [x] 同 modal 子任務導航、父路徑返回、draft flush、pending／failure 阻擋與 focus restore。
- [x] context menu／popover／modal 的 layer、outside click 與 Escape ownership。
- [x] 正常、載入、空白、錯誤、唯讀、權限拒絕、窄版、長內容與鍵盤狀態。

### Out of Scope

- 將看板與明細合併為單一全域 `DndContext`，或搬入看板專屬 L1／欄位／工作台 collision 邏輯。
- 從 modal 拖到被遮住的看板、跨檢視拖曳、工作台 staging 或新增跨看板導航。
- 重做任務明細為 drawer／route、堆疊多個 modal，或重設看板 L3+ 視覺語言。
- 在 checklist row 新增行內 title editor，或建立第二套右鍵、權限、gesture、transaction／undo 實作。
- 修改 task／placement schema、API、migration、RLS／角色能力、canonical ownership 或追蹤副本物化規則。
- 強化既有 task create 的 durable／rollback 語意；本 DEV 只共用現行 create-child command。
- commit、merge、push、deploy、production smoke 或 release。

### UI Entry Contract

- 子任務區固定插入 `TaskDetailsModal` notes section之後、歷史資訊 trigger之前，使用既有 modal body
  作唯一 vertical scroll owner。
- 扁平 header只有 chevron、「子任務」、直屬 placement count與合法時的「新增子任務」；
  展開後直接接共用 checklist tree，不新增 card shell、說明卡或內層 scrollbar。
- 目前任務直屬層仍保留可拖放語意，但移除「拖曳到此處新增為直屬子任務」文字、虛線與額外容器，
  不再佔用一整列版面；拖曳提示只在實際 hover 時顯示最小化底線。
- 直接開啟或切換到的子任務若存在可讀父 placement，標題列只顯示可聚焦的「回到上一階任務」按鈕；
  不顯示 navigation stack Back 控制。
- 標題下方完整階層路徑的每個祖先任務名稱均為可聚焦文字連結入口；點擊後沿用同一 modal
  navigation stack 與 save guard 導覽到該任務，當前任務標題維持非連結。
- `aria-expanded`、`aria-controls`、Enter／Space完整；entry首次 mount預設展開，同 entry可收合，
  navigate／back／reopen後重新預設展開，不寫 localStorage或 provider。
- primary empty且有create capability時只有一個 CTA；readonly只有中性空白文字。tracking root只投影
  explicit tracking children，empty時不顯示會暗示不存在 atomic tracking-child create的 CTA。
- 1440×900、1024×768、390×844、320×844不得有水平 overflow、menu／preview裁切或雙層縱向捲動。

### Implementation Contract

#### Shared surface

- 從 `KanbanChecklist.tsx` 抽出 neutral `TaskChecklistTree`／row，Board與Details都直接使用；
  task title／status／date／tag／action／gesture JSX只能存在一份。
- 看板專屬 dependency selection、record capture與filter projection改由 Board host adapter提供；
  Details adapter固定一般互動，不得 import `BoardView` context。
- `useTaskPlacementController` 只新增可選 `origin`／`commandDependencies`，其他 surface預設行為不變。
- `TaskInteractionSurfaceId` 新增 `task-details.subtask-row`；primary／tracking仍帶完整
  `taskId + placementId + placementKind`。

#### Local drag host

- `TaskDetailsSubtaskDragHost` 擁有 local `DndContext`、`MobileTaskActionContext`、desktop preview與
  `useTaskDragSession`。Board保留自己的 host，兩者不可巢狀或全域合併。
- `useTaskDragSession` 將 `boardSurfaceRef` 泛化為 drag／scroll／target scope refs；Details target adapter
  只接受 scope內 element，同 session mobile action rail是唯一例外。
- before／after、append-child與root append都必須 normalize至既有 drop intent，再呼叫
  `commitDesktopTaskDrag`／`commitTaskDragObservation`；Details不得自行改 `parentId`／`order`。
- root task不是 drag source；self、descendant、primary-under-reference、archived、missing、cross-workspace、
  scope外、permission-denied一律 no-op並清 transient。
- mobile short-scroll維持 scroll優先；long-press才進 session。auto-scroll owner是 modal body；
  presenter／rail layer必須高於 modal且低於 details-open context menu。

#### Same-modal navigation／draft gate

- `GlobalContextMenu` 透過 `useTaskDetailsNavigation` 把單一 `detailsNodeId` 改為 details entry stack，
  保存 task／placement／tracking identity、`returnFocusPlacementId`與 optional title focus intent；不保存DOM element。
- child click／Enter／menu open-details成功後 push；Back成功後 pop；Close清 stack與selection。
  DOM中 `TaskDetailsModal`數量恆為 1。
- `TaskDetailsModal` 將既有 `closeRequestedRef` 泛化為單一 `pendingTransitionRef`，共用 close、push、back、
  create-and-navigate：取消title／notes debounce、收集draft與failed updates、等待目前task版本既有callbacks settle。
- 只有 pending=0且failed=0且source task/version仍一致才執行一次 transition。save reject停留目前task、
  保留draft／Retry並清該次transition。此callback-only流程是歷史implementation baseline；2026-09-02起，
  accepted／not-accepted terminal、deadline／unknown 與 canonical readback 必須在任務儲存可靠性重開發時重新定案。
- pending期間其他transition請求no-op；placement pending、target missing／forbidden也不得切換。
- `taskDetailsHasLocalChanges` 在 transition pending／saving／failed期間保持 dirty，維持 DEV-097 safety。

#### Context menu／Escape／focus

- details-open時 global task menu backdrop／menu高於 modal與drag presenter；details關閉時保持既有層級。
- Escape一次只處理一層：active drag → context menu／popover／nested dialog → modal。
- context menu open、collapse、navigate、back、close前取消 local drag並清 preview、indicator、timer、body flag。
- menu／Back後優先回觸發 row；row消失時回 section heading；Close仍回既有外部 details origin。

### Repo／file impact

Implemented new files：

- `src/components/Wbs/TaskChecklistTree.tsx`
- `src/components/Wbs/taskDrag/taskMoveUpdateNormalization.ts`
- `src/components/TaskDetailsSubtaskSection.tsx`
- `src/components/taskDetailsNavigation.ts`
- `scripts/verify-dev-098-task-detail-subtasks.mjs`
- `scripts/verify-dev-098-task-detail-subtasks-pure.ts`
- `scripts/verify-dev-098-task-detail-subtasks-browser.pw.js`

Implemented modified files：

- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/TaskPlacementTree.tsx`
- `src/components/Wbs/useTaskPlacementController.ts`
- `src/components/Wbs/taskDrag/taskDragCommit.ts`
- `src/components/Wbs/taskDrag/taskChildDropTarget.ts`
- `src/components/Wbs/taskDrag/useTaskDragSession.ts`
- `src/components/Wbs/taskDrag/taskDragTargetAdapter.ts`
- `src/components/Wbs/taskDrag/TaskDragPresenter.tsx`
- `src/components/TaskDetailsModal.tsx`
- `src/components/GlobalContextMenu.tsx`
- `src/interactions/task/types.ts`
- `src/interactions/task/resolveTaskInteraction.ts`
- `src/services/localTestService.ts`
- `package.json`
- `ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、`ai-doc/specs/SPEC-098-task-detail-subtask-management.md`、
  `ai-doc/qa/QA-DEV-098-task-detail-subtask-management.md`

Schema、migration、provider／API、RLS、permission model、backup format與deployment environment均無變更。
若 RD 判定必須修改其中任一項，立即停止並回 PM／技術主管做 scope expansion review。

### Work Packages

| WP | 內容 | Gate |
|---|---|---|
| WP-098-A | 抽 shared checklist row／tree、Board adapter、controller command dependencies | source duplication＋DEV-095 parity |
| WP-098-B | focused navigation hook、單一 pending transition、push／back／close、focus | pure navigation＋save failure browser |
| WP-098-C | local drag host、root target、scope filter、section UI、overlay／Escape與4 viewports | background rejection＋gesture／RWD evidence |
| WP-098-D | verifier、targeted regression、artifacts與 QA handoff | S01～S08、P01～P10、B01～B16且no P0/P1 open |

執行順序固定 A→B→C→D；A未證明 Board baseline不變前不得保留兩份 row，B未完成前不得啟用
child navigation，C scope rejection未通過前不得開啟 drag。

### Acceptance Criteria

- `AC-098-001`：有／無子任務的明細都能辨識子任務區；首次開啟預設展開，切換可由 pointer
  與鍵盤操作，收合不改任何任務資料。
- `AC-098-002`：明細與看板 L3+ 的 primary／tracking 任務使用同一 task content、controller、
  tree 與 action source；host 差異不得形成 duplicate renderer 或第二套 commit。
- `AC-098-003`：桌面、手機與鍵盤可在明細可見子樹完成排序、改掛與回到直屬層；背景看板
  不可命中。
- `AC-098-004`：無效 self／descendant、唯讀或缺權限 drop 必須 fail closed，且不得產生重複、
  遺失或循環。
- `AC-098-005`：點開子任務不堆疊 modal；直接開啟或切換到的子任務可由標題列唯一按鈕回父任務，不顯示
  Back 按鈕；Close stack 與 focus 結果正確。
- `AC-098-006`：父任務 title／notes 等本機草稿保存成功後才切換，
  pending或failure時停留原任務並顯示可恢復狀態。
- `AC-098-007`：右鍵選單完整可見於明細之上，outside click 與 Escape 只關閉最上層互動，
  不得誤關明細或遺留 selected／focus／drag transient state。
- `AC-098-008`：primary／tracking／viewer／derived／revoked actor使用相同 guard；tracking只顯示
  explicit descendants且不越權。
- `AC-098-009`：primary empty CTA與readonly／tracking empty狀態符合 UI Entry Contract。
- `AC-098-010`：同一動作沿用 DEV-089 authoritative placement transaction 與既有 undo／failure
  contract；provider fault 後來源位置與完整子樹仍可讀且不出現假成功。
- `AC-098-011`：明細只有一個主要縱向捲動 owner；1440×900、1024×768、390×844、320×844
  無水平 overflow、浮層裁切、重疊或手機短滑誤拖。
- `AC-098-012`：從清單、看板、甘特、行事曆及心智圖既有明細入口進入時功能一致；
  正常 fixture 不得出現 visible error、異常空資料或權限外 action。

### Failure／Recovery Contract

| Failure | 必要結果 |
|---|---|
| save pending／failed | current task、draft、stack不變；callback settle／Retry前不導航 |
| target missing／forbidden | current entry不變，section近端顯示錯誤 |
| placement pending | navigation暫停；source subtree仍可讀 |
| invalid／scope外 drop | no-op、清 transient、無 success feedback |
| placement persistence failure／unknown | 沿用 SPEC-089 source retention，parent／order不 optimistic |
| create command未產生 target | 不 push；沿用既有 create-child error feedback，不另造第二個 shell |

### Verification／Evidence Contract

- Executed commands：`verify:dev-098-task-detail-subtasks`、
  `verify:dev-098-task-detail-subtasks-pure`、`verify:dev-098-task-detail-subtasks-browser`、
  `verify:dev-098-task-detail-subtasks-qc`、
  `npx tsc --noEmit`、`npm run build:test`。
- Artifacts：`output/qa/dev-098/result.json`、`output/playwright/dev-098/result.json`、
  `output/playwright/dev-098/screenshots/`、`output/qc/dev-098/task-detail-subtasks-qc-result.json`、
  `output/qa/dev-098/runtime-cleanup.json`、`output/qa/dev-098/runtime-cleanup-final-20260902.json`、
  `output/qa/dev-098/adjacent-audit-final-20260902.json`。
- 核心 gate為 S01～S08、P01～P10、B01～B16；詳見 `QA-DEV-098`。本輪 S00～S08 已 22/22 PASS，
  pure P01～P10 已 10/10 PASS，browser B01～B16 已 16/16 PASS、diagnostics 0；完整 DEV-098 核心證據
  已取代早期 targeted 5/5 紀錄。獨立 QC 已由獨立 read-only verifier 另行確認，不由 local automated evidence 推定。
- 首要 regression：DEV-028、046、053、054、055、070、089、095、097；source assertion／build不得
  取代 normal UI rendered evidence。
- 暫時 server必須記錄 project／purpose／port／process tree／cleanup condition，完成前只停止 task-owned
  runtime並確認 port released。

### Stop Conditions

- Details存在 duplicate row／action／commit，或為共用而提升 global Board `DndContext`。
- modal可命中背景 surface，或 task／placement／tracking identity混用。
- dirty／pending／failed／unknown仍可切換，或舊 callback污染新 entry。
- context menu／drag presenter被遮、Escape一次關兩層、focus落 body。
- tracking descendants／mutation越權，或 placement failure產生 ghost／duplicate／cycle／假成功。
- 任一必要 viewport水平 overflow、雙層 scrollbar、short pan誤 drag。
- P0／P1未關閉、必要 verifier／normal UI evidence／受影響 regression缺失。

### RD Readiness Gate

- 產品決策待確認：0。
- 歷史 Spec preflight：`Compatible extension / prior out-of-scope re-entry`；舊 persistence amendment 已放棄，文件衝突必須在重新開發時重新判定。
- Persistence amendment：新契約尚未建立；
  任務儲存可靠性尚未重新開發與驗證，故 DEV-098 不得視為 persistence release-ready。
- DEV-098 原 scope 文件缺口：0；新增 P1 persistence 缺口由 DEV-099 最小 capsule 管制，不能沿用本行宣稱 release ready。
- RD implementation：完成；shared surface、local drag scope、single-modal navigation、typed save continuation、
  overlay ownership與verifiers已落地。
- Local automated QA：DEV-098 核心 S00～S08 22/22、pure P01～P10 10/10、browser B01～B16 16/16、
  diagnostics 0，並通過 TypeScript、build:test、DEV-002、DEV-028、DEV-054、DEV-070、DEV-089、DEV-095、
  DEV-097；fresh affected-case regression audit 的 DEV-046 32/32＋5/5、DEV-053 31/31＋10/10、
  DEV-055 34/34＋18/18、DEV-095 4/4 均 PASS，未使用 waiver。狀態為
  `Core Local Automated QA PASS / Independent QC PASS / Adjacent Regression Audit PASS`；任務儲存可靠性重開發、
  實機 supplemental 與 release gate pending。

### 變更紀錄

- 2026-09-01：依使用者需求與 RD 技術主管 Gate 建立 DEV-098；固定「獨立 drag host、共用元件與
  領域核心」、同 modal 導航、draft／overlay safety 與 modal 內可見子樹邊界。文件達
  `Brief Ready / Human Confirmed`；未修改產品、SPEC、QA／QC、deploy 或 release。
- 2026-09-01：依使用者指示升級至 `RD Implementation Ready / Human Confirmed`；新增 SPEC-098與
  QA-DEV-098，固定 UI Entry、shared component、local DnD、navigation／save gate、overlay／permission、
  repo impact、WP、AC、failure recovery、verifier／artifact與 stop conditions。產品仍未實作或驗證。
- 2026-09-01：依 RD 技術主管 review完成優化並維持 `RD Implementation Ready`。移除無契約支撐的
  save timeout／unknown狀態與獨立 layer module；navigation改為 focused hook＋單一 typed continuation，
  entry只存placement ID；WP由6包縮為A～D，QA由原11／15／32案例收斂為8／10／16案例。
- 2026-09-01：依 WP-098-A～D 完成 local implementation；抽出 Board／Details 共用 checklist tree，接入 Details
  local drag scope、single-modal navigation stack、typed save continuation、overlay ownership與targeted verifiers。
  Source gate 22/22、browser targeted 5/5、diagnostics 0，文件狀態更新為 `RD Implemented / Local Automated QA PASS (targeted)`；
  獨立 QC、實機與 release 仍為後續 gate。
- 2026-09-01：依 RD 技術主管 fresh regression audit 更新證據邊界：DEV-098 核心 S／P／B 改以 22/22、10/10、
  16/16 為準；DEV-028／054／070／089／095／097通過，DEV-046-D02、DEV-053-B13/B14與 DEV-055 多個
  desktop placement／menu／indicator案例失敗。文件改標 `Adjacent Regression Audit Blocked`，不把未歸因的
  相鄰失敗算入 DEV-098 完成率或 release readiness。
- 2026-09-01：DEV-095 source contract verifier 改以 shared `TaskChecklistTree` 為檢查對象，移除 Board adapter
  的舊文字相容標記；避免 source gate 依賴註解而非實際共用實作。
- 2026-09-01：在乾淨 baseline HEAD `13888b2` 的隔離 worktree 重跑相鄰 regression；DEV-046-D02、DEV-053-B14
  與 DEV-055 所列失敗可重現，DEV-053-B13未重現但仍列 current-run instability。新增 `baseline-audit.json`，
  將 pre-existing evidence 與 DEV-098 核心結果分離。
- 2026-09-01：執行獨立 read-only QC；QC-098-01～10 10/10 PASS，補入 QC 報告與 machine-readable artifact。
  DEV-098 核心 QC gate 已通過；相鄰 regression disposition、實機 supplemental 與 release 仍維持 pending。
- 2026-09-02：以全新 task-owned Vite `127.0.0.1:4011` 強制重新 optimize dependencies 重跑 DEV-046／053／055，
  重現 D02、B13/B14與 DEV-055 原列失敗並排除 504 blank-page runtime 假象；新增
  `output/qa/dev-098/adjacent-audit-20260902.json`，port 4011 已確認釋放。
- 2026-09-02：同一 fresh task-owned runtime 重跑 DEV-098 core browser B01～B16 16/16、diagnostics 0，
  source gate 22/22、pure P01～P10 10/10、`npx tsc --noEmit`與獨立 QC-098-01～10 10/10 均通過；
  對 DEV-046-D02 做最小資料集歸因檢查仍不足以支持安全的相鄰產品修正，未偽造 waiver，DEV-098 整體
  regression gate 仍待相鄰 owner 修正或正式 waiver 後重跑。
- 2026-09-02：完成相鄰 affected-case 修正與 fresh rerun：DEV-046 32/32＋5/5、DEV-053 31/31＋10/10、
  DEV-055 34/34＋18/18、DEV-095 4/4 均 PASS；`npm run build:test`與 task-owned runtime cleanup
  亦完成，port 4011 已確認釋放，未使用 waiver。任務儲存可靠性重開發、實機 supplemental
  與 release 仍未執行，故維持 `Not Released`。
- 2026-09-10：依使用者清理決策，舊 persistence 實作、規格與驗證證據全部放棄；既有 DEV-098 核心
  QA/QC 僅保留 surface／navigation baseline，persistence release 改由 DEV-099 最小重開發 capsule 阻擋。
- 2026-09-09：依使用者回饋補上直接開啟子任務時的「回到上一階任務」標題列按鈕；支援 canonical／tracking
  parent placement，沿用單一 modal navigation stack 與 save guard，並納入 B03 844×698 evidence。
- 2026-09-10：依使用者回饋移除標題列「返回上一個任務詳情」按鈕；所有可解析父 placement 的情境只保留
  「回到上一階任務」入口，B03 同步驗證舊按鈕不存在。
- 2026-09-10：依使用者回饋將完整階層路徑的祖先任務名稱改為可聚焦連結入口；B03 同步驗證
  canonical 祖先連結與單一 modal 導覽。

## DEV-099：任務儲存可靠性重新設計

狀態：延後
開發文件成熟度：Brief Ready
節點類型：交付點
是否計入產品交付完成：是（延後，完成率貢獻 0）
原始需求邊界：使用者於 2026-09-10 決定放棄既有候選實作、設計與驗證歷史，未來從目前程式重新開發。

### 重開發目的

任務儲存流程必須有可觀察、可收斂且不遺失使用者輸入的結果。重新開發前需重新比對目前分支與正式環境，任何舊實作、舊測試結果或舊 release 資料都不具權威性。

### 最小驗收契約

- 已接受的儲存操作必須能從 canonical source 讀回；未接受的操作不得留下永久 pending。
- request 成功、失敗、逾時或 response lost 都必須收斂為明確狀態，重試不得產生重複資料。
- 快速連續編輯、自動儲存、切換任務及晚到回應不得以舊值覆蓋新值。
- 關閉、返回、重新開啟與重新載入後，標題及其他已確認欄位不得遺失。
- 測試必須涵蓋權限拒絕、網路中斷、並行寫入、canonical readback 與 fixture 完整清理。
- 新實作通過同一 source revision 的 QA/QC 與 release gate 前，不得部署。

### Re-entry trigger

只有使用者明確重新啟動此需求後，才建立新的 SPEC、QA、QC 與實作分支。第一步是重新盤點現行程式、正式環境行為、資料契約及可重現案例，不得從已放棄內容直接移植。

## DEV-100：一般任務建立重試冪等

- 文件成熟度：`Future Phase Captured / Brief Ready / Lane 3 / Not Requested`
- 狀態：待排；未授權實作
- 節點類型：交付點
- 來源：`USER-20260902-TASK-CREATE-RETRY-DUPLICATE`；使用者確認第二筆「大陸PCT」為其重試產物
- 是否計入產品交付完成：是（目前完成率貢獻0）

### Future Phase Capsule

- 問題：一般任務create缺少operation key／authoritative replay；使用者在UI狀態未知下合理重試，可建立第二筆。
- 先決產品決策：定義「同一次建立操作」identity、key lifetime、reload／跨分頁／response-lost retry語意。
- 建議方向：client持有stable operation key，DB unique或authoritative RPC回傳canonical row與replay結果；不得用title、parent或短時間窗猜測重複。
- Acceptance方向：同key sequential、parallel、response-lost retry最終exactly one row；不同operation即使同名也可建立兩筆。
- 風險／Lane：任何schema、unique、RPC或migration屬Lane 3，需Supabase TEST rehearsal、backup／rollback、RLS與release gate。
- 關係：與 DEV-099 分開重開發；兩者均不得沿用已放棄的實作或證據。
- 重新進入：PM／使用者另行啟動後，建立獨立SPEC／QA；目前不得產生migration或預填PASS。

## DEV-101：任務排序整數契約

- 文件成熟度：`Future Phase Captured / Brief Ready / Lane 3 / Independent Closure`
- 狀態：待排；未授權實作
- 節點類型：交付點
- 來源：`PRODUCTION-POSTGRES-20260902-ORDER-BIGINT-EVIDENCE`
- 是否計入產品交付完成：是（目前完成率貢獻0）

### Future Phase Capsule

- 問題：`wbs_items.sort_order`為bigint，但前端多個排序入口可產生fractional order；這是production已確認缺陷。
- 因果邊界：錯誤時間與任務儲存事件接近，但沒有 operation correlation 證明兩者相同；必須獨立處理。
- 建議方向：維持bigint-compatible integer canonical order，由共用command／server依before／after／parent intent計算；非safe integer在boundary fail closed，不可silent round。
- 替代方向：只有產品確定長期需要fractional ranking，且完成migration／index／RPC／backup效能盤點後，才評估numeric。
- Acceptance方向：drag、insert、Mind Map、context menu、primary／tracking placement、Realtime與backup roundtrip均不讓decimal抵達bigint。
- 風險／Lane：Lane 3；需writer inventory、ADR／SPEC、Supabase TEST migration rehearsal、rollback與獨立release evidence。
- 關係：獨立 P1 缺陷；未完成前不得宣稱 order defect 已關閉。
- 重新進入：RD lead／DB owner核准資料契約後，建立獨立SPEC／QA；目前不得修改既有migration或production schema。

## DEV-102：心智圖矩形圈選、多選右鍵與剪貼操作

- 文件成熟度：`Implemented / Local Automated QA-QC Passed / Tech Lead Reviewed R3 + UI Follow-up / Human Confirmed / 未 Release`
- 狀態：本機開發交付完成；未Release
- 節點類型：交付點
- 優先級／風險：P1／Medium-High
- 父交付點：DEV-027、DEV-028、DEV-070
- 相容交付點：DEV-013、DEV-048、DEV-074、DEV-075、DEV-079、DEV-084、DEV-088、DEV-095
- 原始需求：`USER-20260903-MINDMAP-MARQUEE-MULTISELECT-CLIPBOARD`
- 是否計入產品交付完成：是（本機產品交付完成率100；release完成率0）
- Spec Impact：`Intentional replacement + compatible extension`。以`selectedPlacementIds + primaryPlacementId`取代DEV-075單一selection cardinality，明確區分visual placement與canonical task；保留private keyed store、單一Scene與interaction kernel。心智圖`複製`改為clipboard copy，其他模式immediate duplicate不變；DEV-076左鍵抓圖平移維持已放棄狀態。
- 技術主管結論：R1、R2的文件條件均已解除；R3及2026-09-04 UI follow-up完成implementation review，判定`通過；Local Implementation Verified + UI Follow-up Verified，未授權Release`。審查紀錄見R1、R2、`ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102-R3.md`。

### 交付目標

- 空白畫布primary-left drag達6 CSS px後進入矩形圈選；node client-space中心點命中，支援50／100／200% zoom與scroll。
- selection可包含多個visual placements，mutation前解析canonical IDs；copy／cut／archive把父子重疊正規化成top-most forest roots，assignment保留每個明確選取task。
- 新增心智圖專屬context-menu presenter，但共用action catalog、permission guards、assignment normalization、archive lifecycle與store command，不fork業務邏輯。
- multi menu可執行copy、cut、指派、封存；details、新增、relationship、升降階、tracking reference、收藏等不具批次語意的動作直接隱藏，不顯示不可點擊列或鎖定圖示。
- copy／cut共用單一memory clipboard；在同看板任一有效exact anchor選擇`貼在此任務之後`，將forest roots連續插入為next siblings。copy可重複貼上；cut成功後清clipboard。
- batch mutation全部preflight、await completion、零partial success、一筆undo；paste plan同時涵蓋node、所有被reindex siblings與root side overrides。cycle、stale、projection、permission、cross-board、side storage與provider failure fail closed；indeterminate在same-tab reload後仍維持target lock與readback。

### RD Work Packages（已完成）

1. ✅ `WP-102-A`：完成placement-typed selection store、pure marquee、overlay、pointer owner與transform cancel；200／500-node geometry保持穩定。
2. ✅ `WP-102-B`：完成MindMapContextMenu、clipboard action opt-in、不可用action隱藏、compact high-contrast row與native focus；其他mode action語意未外洩。
3. ✅ `WP-102-C`：完成shared clone plan、awaitable node batch／forest create、integer order、side readback、compensation與same-tab recovery descriptor。
4. ✅ `WP-102-D`：完成tri-state assignment、batch archive、copy snapshot、cut fingerprint與paste-after orchestration。
5. ✅ `WP-102-E`：完成DEV-102 pure/browser、四方向200／500-node performance、rendered／fault／viewport evidence及指定回歸。

### 已知技術債

- 現行provider沒有同看板forest／multi-node ACID transaction。DEV-102只能以awaitable batch、完整operation target lock、compensation、same-tab session recovery與canonical readback提供application convergence；網路分割時允許明確`indeterminate`，不得假稱atomic success。此機制不保證跨tab／tab-close exactly-once，也不自動重播未知operation。若indeterminate頻率／恢復時間超出owner門檻，或provider已有atomic batch API，必須另案移除此債。

### 驗收與證據

- Authoritative spec：`ai-doc/specs/SPEC-102-mindmap-marquee-multiselect-clipboard.md`。
- QA plan：`ai-doc/qa/QA-DEV-102-mindmap-marquee-multiselect-clipboard.md`。
- RD技術主管審查：R1 `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102.md`；R2 `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102-R2.md`；R3 `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102-R3.md`。
- QC：`ai-doc/qc/QC-DEV-102-mindmap-marquee-multiselect-clipboard.md`。
- Required evidence：DEV-102 static／pure與browser artifacts、copy／cut／assignment／archive／undo／redo before-after fingerprints、完整affected/reindexed IDs、root side reload/undo、session recovery、permission／fault injection、success-effect counts、integer order、selection notification、geometry/performance、viewport screenshots、visible-error、cleanup及指定回歸。
- 已執行命令：`verify:dev-102-mindmap-marquee-multiselect-clipboard`、`verify:dev-102-mindmap-marquee-multiselect-clipboard-browser`、指定回歸、targeted ESLint、`tsc --noEmit`、`build:test`與`git diff --check`。
- 目前結果：`Local Automated QA-QC PASS（DEV-102 UI slice）`。browser artifact `passed=true`，menu visibility／contrast／density、performance／failure recovery／viewport／error arrays／runtime cleanup全數過gate；current full `tsc --noEmit`另受工作樹既有非DEV-102錯誤阻斷，未commit、push、deploy、production mutation或release。

### Stop Conditions

- 需要schema／migration／RLS／RPC／provider transaction或production mutation。
- 同看板paste只能產生fractional order，或必須無邊界地吞入DEV-101全域排序重構。
- UI需直接N次fire-and-forget／public `updateNode`、無法補償node＋side／readback、無法列出全部reindexed siblings，或出現partial mutation／假成功。
- `sessionStorage` recovery descriptor無法在第一筆mutation前write-readback，或hard reload後無法在readback前維持相同target lock。
- 多選造成第二selection authority、整樹subscription／render、geometry recompute、pointer owner衝突或tracking projection結構寫入。
- 任一既有回歸只能靠刪除expected、放寬assertion或覆寫dirty工作樹才能通過。

## DEV-103：工作區收藏任務系統看板（已撤銷）

- 文件成熟度：`Historical / Removed by DEV-104`
- 狀態：已撤銷／未 Release
- 使用者決策：系統看板方案與原始 DEV-093 能力一併停止。
- 移除內容：workspace system row、view/context、L1／L2 collection projection、workspace query／RPC、DEV-103 migration與專屬驗證文件。
- 現行 authority：`SPEC-104-task-collection-feature-removal.md`。

## DEV-104：完整移除收藏任務功能

- 文件成熟度：`RD Implementation Ready → Implemented / Local QA-QC Passed`
- 狀態：完成／未 Release（退場變更）
- 節點類型：開發點
- 父任務：DEV-093、DEV-103（retirement）
- 原始需求：`USER-20260904-REMOVE-TASK-COLLECTION-ALL`
- Spec Impact：`Intentional replacement / feature retirement`
- 是否計入產品交付完成：否（移除未 Release 功能，不新增產品能力）

### 完成範圍

- 移除所有收藏任務入口、對話框、詳情、系統看板與 sidebar／topbar context。
- 移除 `task_collection` domain、store、pending／snapshot／journal／projection與 action／permission。
- 移除 Local Test、Firebase、Supabase provider 接線、DB types與 DEV-093／103 migration files。
- 移除 package commands、DEV-093／103 scripts與已失效的 SPEC／QA／QC／predeploy文件。
- 紀錄庫只保留 meeting／work_log；Local Test 讀取時以 allowlist 清掉舊的不支援 record family。

### 資料與 release 邊界

- read-only preflight 已確認共享 local migration history未含 DEV-093／103；相關 schema／RPC未存在。
- 未對共享 local、linked remote或production執行 migration、rollback、repair、reset、資料刪除、deploy或release。
- Git 歷史仍可復原被刪除的程式與文件。

### 驗收

- `src`、`scripts`、`package.json`、`supabase` 無收藏功能識別與專屬檔案。
- TypeScript、test build、受影響 DEV-095／099 regression與實際browser操作通過。
- 工作區側欄、紀錄庫、一般任務明細與右鍵選單無收藏入口；一般看板、會議紀錄、個人工作紀錄可正常操作。
- QA／QC authority：`QA-DEV-104-task-collection-feature-removal.md`、`QC-DEV-104-task-collection-feature-removal.md`。

## DEV-105：會議任務討論時間預約

- 文件成熟度：`Brief Ready / Human Confirmed`
- 狀態：待排
- 節點類型：交付點
- 父交付點：DEV-005
- 相關契約：DEV-007、DEV-070
- 是否計入產品交付完成：是（尚未實作，完成率貢獻 0）
- 原始需求邊界：`USER-20260904-MEETING-TASK-RESERVATION-NUMBER`
- 風險等級：Medium（新增會議模式右鍵入口、主持人限定寫入、會議與任務關聯資料、任務卡可見狀態）
- Spec Impact：`Intentional scope extension`；使用者明確解除 SPEC-005「不做逐項時間控管」中與本功能衝突的局部非範圍，但仍不建立完整議程主持、計時、總額或投票系統。SPEC-007 的原生任務操作與 SPEC-070 的共用 Semantic Action／Guard／Command 邊界維持有效。

### 問題與使用者價值

- 會議主持人目前需在系統外收集各議題預約數字，任務卡本身無法顯示該議題已安排的值。
- 成功結果是主持人可在不中斷會議看板工作的情況下，直接從任務右鍵填值；所有觀看同一會議任務的人可從任務列辨識已預約數字。
- 任務名稱維持主要視覺焦點；預約值只在存在時占用最小空間，不替未預約任務建立提示、占位或額外列。

### Human Decision Brief（2026-09-04）

- 第一版由會議主持人統一預約；不開放其他參與者新增或修改。
- 一個會議中的一個任務只保留一個預約數字；不支援多人預約、合計或人員明細。
- 預約入口只放在任務右鍵選單；點擊「預約時間」後直接進入數字輸入。
- 任務有預約值時才顯示；沒有值時完全不顯示未預約狀態或空白占位。
- 卡片顯示單一無框亮黃色底黑字時間膠囊 token 與純數字，例如 `15`；不顯示圖示、單位或額外說明。
- 卡片資訊順序固定為「任務名稱 → 截止日 → `[預約數字]` → 下層任務展開按鈕」。無截止日或無下層任務時，缺少的既有元素自然省略，預約數字仍維持在標題後方的 metadata 區域。
- 已拒絕：參與者自行預約、多人預約、未預約提示、分鐘文案、總時數、卡片左側時間籤與完整會議時間管理。

### 主要流程

1. 主持人進入會議模式，在任務上開啟既有右鍵選單。
2. 選單顯示「預約時間」；點擊後在同一選單範圍直接顯示並聚焦數字輸入，不另開 Modal 或新面板。
3. 已有值時輸入框預選既有數字；主持人輸入正整數後以 `Enter` 儲存，或以 `Escape` 放棄修改。
4. 儲存成功後選單關閉，任務卡在截止日後、展開按鈕前顯示純數字標記。
5. 主持人清空既有值並儲存時取消預約；標記隨即消失。

### 角色與狀態矩陣

| 角色／狀態 | 右鍵「預約時間」 | 已預約數字 | 寫入能力 |
|---|---|---|---|
| 會議模式／主持人 | 顯示 | 有值才顯示 | 可新增、修改、清除 |
| 會議模式／非主持人 | 不顯示 | 有值才顯示 | 無 |
| 非會議模式／任何角色 | 不顯示 | 不顯示 | 無 |

### 第一版範圍

- 在會議模式的既有任務右鍵選單加入主持人限定的「預約時間」。
- 以同一選單中的最小 inline editor 接受數字輸入；不建立獨立 Modal、Drawer 或常駐工具列。
- 在會議看板可見的任務表面呈現單一純數字標記，且同一 canonical task 的投影不得出現互斥值。
- 預約資料邏輯上屬於「本次會議 × canonical task」；不得把跨會議會變動的值誤當成永久 TaskNode 屬性。
- 保留既有任務卡主要點擊、拖曳、右鍵開啟、截止日、標籤與下層任務展開行為。

### 非範圍

- 參與者自助預約、多人預約、預約者姓名、多人加總與明細。
- 未預約提示、空值 badge、主持人待排清單或自動提醒。
- 單位顯示、開始／結束時刻、倒數計時、超時提示、總時數、會議預算或自動議程排序。
- 完整議程管理、投票、跨 board 會議或新的會議操作列。
- 非會議模式的預約顯示與編輯。

### Architecture Memory Capsule

- Logical identity：每筆值由 active meeting identity 與 canonical task identity 唯一定位；tracking placement 只投影同一值，不建立第二份預約資料。
- Write owner：產品契約是「主持人唯一可寫」；主持人實際身分來源、Guard 與 provider 權限檢查點在升級 `RD Contract Ready` 時依現行 record／board role authority 固定。
- Presentation owner：新增動作需沿用 DEV-070 的 task action catalog、profile、permission guard 與 command 邊界；右鍵 presenter 不得直接自行寫資料。
- Display：新增共用 `MeetingTaskReservationMark` 集中純數字的單一無框亮黃色底黑字時間膠囊 token、semibold、tabular numbers 與空值 DOM=0 規則；不渲染圖示。L1、L2 與 L3+ presenter 都在 date 後使用；L2 另以 `rowTrailing` 把 toggle 固定在 mark 後。

### 驗收方向

- [ ] 從正常會議入口進入後，主持人右鍵任務可找到「預約時間」，非主持人與非會議模式看不到該動作。
- [ ] 點擊動作即出現已聚焦的數字輸入；已有值時可直接覆寫，`Enter` 儲存、`Escape` 取消，清空後儲存可移除。
- [ ] 任務只有在存在預約值時顯示純數字時間膠囊 token；不顯示圖示、`[]`、單位、預約者、未預約提示或占位。
- [ ] 顯示順序為「任務名稱 → 截止日 → `[數字]` → 展開按鈕」，且不增加任務卡高度或建立新資訊列。
- [ ] 正常卡片點擊、拖曳、右鍵、日期、標籤與下層任務展開行為沒有退化。
- [ ] 儲存、取消、清除、重新載入與同一 canonical task 投影的結果一致；失敗時不得顯示未持久化的成功值。
- [ ] 1440×900、1024×768 與 390×844 的實際畫面沒有水平 overflow、重疊、按鈕擠壓或必要標題異常截斷。
- [ ] 所有控制具有可存取名稱、鍵盤焦點與清楚的失敗狀態；不能只靠顏色判斷是否有預約。

### 驗證與證據方向

- UI Entry：以會議建立者／主持人從正常會議入口開啟看板，再從任務右鍵進入 inline editor；不得只用 direct component harness 證明入口存在。
- Happy path：新增、覆寫與清除預約值，驗證卡片顯示、持久化 readback 與重新載入一致。
- Fail-seeking：以非主持人開啟相同任務，確認 action 不進入 DOM 且 mutation 被 Guard 拒絕；另模擬保存失敗，確認卡片不出現假成功值。
- UI evidence：最終 frozen candidate 需記錄 source revision、角色、route、viewport、操作步驟、右鍵輸入狀態、保存後卡片截圖、visible-error sweep 與 overflow 量測。
- Engineering evidence：至少包含 action/profile/permission pure 或 integration test、meeting/task identity persistence test、TypeScript、targeted lint、test build 與受影響 task-menu／meeting-mode regression。

### 待 RD Contract Ready 固定的工程決策

- 主持人的權威身分來源與 meeting draft 尚未持久化時的識別生命週期。
- 預約值的正整數範圍、空值清除契約、並行寫入與失敗恢復方式。
- 現有 Local Test、Firebase、Supabase 各 provider 的最小持久化／讀取邊界，以及是否需要 migration。
- L2 卡片、L3+ checklist、tracking projection 與其他 task surface 的精確顯示／編輯矩陣。

### Execution Boundary

- 本輪只完成 `Brief Ready` 文件與 canonical map／DEV 登錄；不修改產品程式、測試、schema、migration、provider、Git index或 release artifacts。
- 使用者提出「交 RD 評估」時升級同一 DEV 到 `RD Contract Ready`；提出「開始開發」或「完成 dev_task」時，先補齊 Medium lane 的 `RD Implementation Ready`、最小 QA 與 targeted QC 契約再實作。

### 變更紀錄

- 2026-09-04：依使用者確認建立 Brief；固定主持人單一輸入、右鍵 inline editor、有值才顯示純數字及卡片 metadata 順序。
- 2026-09-04：依瀏覽器回饋將 Clock3 與預約數字整合為單一時間膠囊 token，採無框芥末黃底白字，保留 `1..999` 範圍並避免 Unicode 圓圈數字相容性問題。
- 2026-09-07：依附圖取樣將預約 token 背景調整為亮黃色 `#f6cd03`，改用黑字與無框樣式。
- 2026-09-07：依瀏覽器回饋移除預約 token 內的 Clock3 圖示，保留純數字顯示與既有資料／權限邏輯。
- 2026-09-07：依瀏覽器回饋移除任務右鍵清單上方的目前任務名稱標題列；右鍵操作項目、預約入口與資料生命週期不變。
- 2026-09-07：依瀏覽器回饋移除會議紀錄區的正常本機保存成功提示「已保存在此裝置」；保存與失敗保護邏輯不變，僅保留需注意的 degraded/error/conflict 提示。

## DEV-106：會議安全草稿、結束與待整理生命週期

- 文件成熟度：`Phase 0 Implemented / QA-QC PASS / Phase 1 RD Contract Ready / NOT RELEASED`
- 狀態：完成（Phase 0 local safety slice）
- 節點類型：交付點；父交付點：DEV-020
- 範圍：本機 recovery、transaction commit truth、離開前 force-flush、明確 discard 與 provider 0 recovery request；Phase 1 cloud／跨裝置／待整理維持 future capsule。
- 證據：`ai-doc/specs/SPEC-106-meeting-safe-draft-lifecycle.md`、`ai-doc/qa/QA-DEV-106-meeting-safe-draft-lifecycle.md`、`ai-doc/qc/QC-DEV-106-meeting-safe-draft-lifecycle.md`；static PASS、browser 14/14 PASS。
- Release boundary：未 commit、未 push、未 deploy；正式 release 仍需獨立 release gate。
- 2026-09-08 UI addendum：live meeting 移除語意不明的 X；`會議操作` 收斂為 `儲存草稿`、`儲存並離開`、`刪除並離開`。編輯中的 save-and-exit 必須 canonical save 成功才 close，失敗留在原畫面；已發布時直接離開且不降回 draft；danger action 維持只清未儲存 local recovery、保留既有 canonical baseline。DEV-094 browser PASS（選單 exact labels／無 X／geometry／canonical save before close）、DEV-094／106 static、TypeScript、targeted lint、完整 `verify:source` 與目前本機可見畫面 QC PASS；Local-only / NOT RELEASED。

## DEV-107：會議草稿側欄模式與排版收斂

- 文件成熟度：`Implemented / Targeted QA-QC PASS / Local-only / NOT RELEASED`
- 狀態：完成（local corrective slice）
- 節點類型：開發點；父交付點：DEV-020；corrective follow-up DEV-092；相容 DEV-019、DEV-094、DEV-106。
- 原始需求邊界：`USER-20260907-MEETING-DRAFT-SIDEBAR-LAYOUT-HEALTH-CHECK`。
- 修復結果：以單一 `live-meeting | meeting-record | work-log | empty | invalid` variant 收斂 sidebar；既有 meeting record 維持 `isMeetingMode=false`，不再顯示個人流程／work-log workflow；有 draft 時移除 recent section；drawer 為唯一垂直 scroll owner；editor `resize=none`，meeting minimum 220px、work-log 150px；會議流程的外層卡片視覺容器移除，保留步驟操作與語意標記。
- 產品檔案：`src/components/Records/RecordSidebar.tsx`、`src/components/Records/RecordContentEditor.tsx`、`src/utils/recordComposerVariant.ts`；新增 DEV-107 static/browser verifier 與 package scripts。無 store schema、provider、API、權限、migration 或 recovery contract 變更。
- 驗證：DEV-107 static 20/20、browser 5/5（1902／1440／1024、live meeting、390 mobile-negative）；DEV-020／092／094／106 targeted regression PASS；TypeScript、targeted ESLint、build:test、`git diff --check` PASS。詳見 `ai-doc/qc/QC-DEV-107-record-sidebar-draft-layout.md` 與 `output/playwright/dev-107-record-sidebar-layout/result.json`。
- Release boundary：Local-only；未 commit、未 push、未 deploy、未 release。若進 release candidate，須依 `QA-DEV-107` 重跑完整 matrix 與 release gate。

## DEV-108：任務明細會議補記持續呈現

- 文件成熟度：`Implemented / QA-QC PASS / Local-only / NOT RELEASED`
- 狀態：完成（local implementation；release 尚未啟動）
- 節點類型：交付點
- 父交付點：DEV-009；相容 DEV-008 保留的片段解析、DEV-066、DEV-106
- 是否計入產品交付完成：是（Prepared 階段完成率貢獻 0）
- 原始需求邊界：`USER-20260907-TASK-DETAIL-MEETING-NOTE-PERSISTENT-LIST`
- 風險等級：Medium（改變使用者可見入口、跨會議狀態的資料投影與失敗恢復）
- Spec Impact：`Intentional partial replacement / implemented`。`SPEC-108` 已成為本 DEV 的 authoritative
  current state，取代 SPEC-009「補記後只以清空輸入框及右側 meeting draft 作為成功回饋」與「非 meeting mode
  不顯示補記區」的局部契約；其餘 append、task mention、空白 no-op、快捷鍵及 TaskNode 資料邊界維持。

### 問題與使用者價值

目前在任務明細按「加入紀錄」後，文字只 append 到當次 meeting draft，任務明細立即清空輸入框，
卻不在相同畫面顯示剛加入的內容。使用者會把正常清空誤認為資料消失；會議模式結束後，整個
「本次會議」區塊也因 `isMeetingMode` 條件消失，必須改走紀錄庫的完整會議紀錄才能找回。

本 DEV 要讓人工補記在送出後立即成為任務明細第一層的可見內容，且會議結束、重新開啟任務或
切換模式後仍可閱讀。列表以純文字、少容器及低干擾方式呈現，降低確認成本而不擠壓任務說明、
一般備註與子任務。

### Human Decision Brief

- `1A`：列表只顯示從此任務明細按「加入」建立的人工補記；不混入 AI 整理、一般任務變更或
  其他僅因 task link 關聯的會議片段。
- `2A`：原始會議紀錄是唯一資料來源。原紀錄修改時列表同步更新；封存後仍顯示；永久刪除後
  才從任務明細移除。不得複製到 `TaskNode.detailNotes` 建立第二份權威資料。
- `3A`：第一層預設顯示最新三筆，依提交時間正序排列，使最新一筆靠近輸入區；畫面只顯示月／日，
  不顯示幾點幾分；超過三筆時用
  「其餘 N 筆」在原位置展開全部，不跳頁、不開 Modal、Drawer 或第二層面板。
- 會議模式只控制新增輸入區；只要任務仍有人工補記，「會議紀錄」列表在會議結束後必須持續存在。
- 已確認版面順序：任務基本資料 → 任務說明 → 會議紀錄 → 其他備註 → 子任務。
- 已拒絕：顯示所有關聯會議片段、把內容複製進任務備註、永遠展開全部、只留最新一筆、
  以完整卡片／藍色區塊／成功提示／額外歷史面板呈現。

### UX Intent

- 使用者／結果：會議中的任務編輯者送出補記後，能在原任務明細立即確認內容；會議結束後仍能
  從同一任務第一層閱讀。
- 主物件／主焦點：該任務的人工會議補記文字；會議中唯一主要動作為「加入」。
- 預設刪除：外層卡片、藍色背景、每筆紀錄框線、裝飾 icon、badge、常駐成功訊息、操作教學與搜尋列。
- 保留舉證：日期（日）用於區分多次會議脈絡；「會議紀錄」標籤用於區分任務說明與一般備註；
  「其餘 N 筆」避免歷史累積壓縮主要任務內容。
- 非語言修復：以固定順序、鄰近、留白、低對比日期與單一分隔線建立層級；新增成功以文字列出現
  並清空輸入框表示，不建立 toast 或成功面板。
- Viewport 假設：歷史列表跟隨任務明細支援的所有 viewport；新增輸入仍沿用既有手機版
  meeting-mode unavailable 邊界，除非後續另案變更。

### 第一層版面草稿

```text
任務說明                                      A  ＋
確認供應商交期，預計 9/8 回覆。

會議紀錄
09/07　確認供應商明日回覆
09/07　RD 補充測試條件與驗證方式
09/07　決議先完成測試，再確認交期
其餘 2 筆
────────────────────────────────
輸入本次會議內容                              加入

備註                                          A  ＋
輸入備註內容……
```

### 主要流程與狀態

| 狀態 | 會議紀錄列表 | 新增輸入區 | 預期行為 |
|---|---|---|---|
| 會議中、無紀錄 | 不顯示空白列 | 顯示 | 可輸入並加入；不顯示空白說明卡 |
| 會議中、有紀錄 | 顯示最新三筆或已展開列表 | 顯示 | 成功後新文字立即出現在列表，再清空輸入 |
| 非會議、有紀錄 | 持續顯示 | 隱藏 | 關閉／重開任務、切換模式或重載後仍可閱讀 |
| 非會議、無紀錄 | 整區不顯示 | 隱藏 | 不保留空標題、空框或 helper |
| 原紀錄封存 | 持續顯示 | 依 meeting mode | 不因封存而遺失任務脈絡 |
| 原紀錄永久刪除 | 移除相應補記 | 依 meeting mode | 不保留無來源副本 |
| 寫入失敗 | 不新增假成功列 | 保留原輸入 | 就地顯示最短錯誤與可重試狀態 |

### Current Scope

- 任務明細第一層新增「會議紀錄」純文字列表，位置固定在「任務說明」之後、其他備註之前。
- 只投影由任務明細快速補記入口建立、且屬於目前 task ID 的人工內容。
- 顯示最小資訊：`MM/DD` 與使用者原文；不顯示幾點幾分，也不重複任務名稱、meeting title、task tag 或來源類型。
- 會議中保留單一輸入入口與「加入」動作；成功時先讓新列可見，再清空輸入。
- 預設最新三筆；「其餘 N 筆」只提供一次性原地展開全部，展開後不顯示「收合」控制；新加入內容必須落在預設可見的三筆內。
- 原始 meeting record 維持唯一資料來源，active draft、已儲存草稿、待整理、已發布及封存狀態皆由
  同一投影規則處理，永久刪除才移除。
- 不使用卡片包卡片；列表列無獨立框線，區段最多保留一條低對比分隔線，輸入控制只保留必要
  邊界與 focus 樣式。

### Out of Scope

- 不顯示 AI 整理、系統活動、任務變更或所有 task-linked record 片段。
- 不把人工補記複製到 `TaskNode.description`、`TaskNode.detailNotes` 或建立第二份可獨立編輯副本。
- 不在列表直接編輯、刪除、重新排序或搜尋補記；內容生命週期跟隨原始會議紀錄。
- 不新增完整時間軸、卡片、來源 badge、參與者、附件、留言、反應或通知。
- 不改變既有會議主持人、任務編輯權限、AI 整理、發布、封存或永久刪除流程。
- 不新增 database schema／migration；使用既有 `KnowledgeRecord.metadata` versioned namespace 與
  task-scoped provider read option，詳細資料契約見 `SPEC-108`。
- 不包含 commit、push、PR、deploy、production migration 或 release 驗證。

### 驗收方向

- [ ] 從正常看板入口進入會議模式並開啟任務明細，可看到既有人工補記與單一新增入口。
- [ ] 輸入非空白內容並按「加入」後，相同文字與日期（日）立即出現在第一層列表；確認可見後才清空輸入。
- [ ] 關閉並重新開啟任務、結束會議、切換模式及重新載入後，既有列表仍存在；非會議模式不顯示輸入區。
- [ ] 列表只包含由任務明細加入的人工補記，不混入 AI 整理、系統活動或其他 task-linked 內容。
- [ ] 原始會議紀錄修改後列表同步；封存仍顯示；永久刪除後相應項目移除。
- [ ] 一至三筆全部顯示；第四筆起預設只顯示最新三筆，「其餘 N 筆」可在原位置一次性展開全部，
  展開後不顯示「收合」控制。
- [ ] 列表沒有外層卡片或每筆框線；歷程列以單一 200px bounded Y-scroll 容器保留可發現邊界，
  展開後可捲動，且「其餘 N 筆」與 composer 不被容器包住；不增加裝飾 icon、badge、搜尋列或常駐成功提示。
- [ ] 空白內容不新增；寫入失敗保留輸入，重試不產生重複項目或先清空造成資料遺失。
- [ ] 1440×900、1024×768 與 390×844 的任務明細無水平 overflow、重疊、按鈕擠壓或不可讀截斷；
  390×844 只驗證歷史列表，仍不得出現既有 mobile meeting composer。
- [ ] 鍵盤焦點順序與視覺順序一致，`Ctrl／Cmd + Enter` 行為維持，展開控制具 accessible name 與狀態。

### RD Implementation Contract

- Authoritative spec：`ai-doc/specs/SPEC-108-task-detail-meeting-note-persistent-list.md`。
- QA plan：`ai-doc/qa/QA-DEV-108-task-detail-meeting-note-persistent-list.md`。
- 資料：同一 `KnowledgeRecord` 的 `metadata.meetingTaskQuickNotes.v1` 是 task-detail list 的 canonical
  representation；正文是 DEV-009／task knowledge／AI workflow 的 compatibility projection。這是同 record
  內受控雙表示，Store append／reconcile 必須原子更新並驗證 invariant；不得寫入 `TaskNode`，legacy 正文
  不得猜測回填。
- Identity：提交前固定 `submissionId + occurredAt`；projection key 為 `record.id:entry.id`。active draft
  與 loaded record 同 id 時 draft 覆蓋，避免 save／publish／exit transition 出現 0 或 2 筆。
- 生命週期：新增 `recordService.listByNode(..., { includeArchived: true })` 的 task-only read；全域
  `listByProject` 仍排除 archived。Archive 保留、source hard delete 後 reload 移除。
- 修改同步：anchor 為 `lineIndex + sourceToken`；原行、唯一 exact candidate、唯一 sourceToken 依序匹配。
  修改冒號後文字更新同 id；刪行、破壞 task/time token 或多候選歧義時 detach 並保留正文。人工或 AI
  新增相似列不得自動建立 provenance。
- UI：在第一個「任務說明」後插入 `TaskMeetingQuickNoteSection`；預設 latest 3、原地展開、純文字，
  歷程列使用單一 200px bounded Y-scroll，控制與 composer 位於容器外。meeting mode 只控制 composer；
  不增加外層卡片／每筆框線／icon／badge／搜尋／成功提示。
- 失敗：denied 不清空輸入；local recovery 或 remote save 失敗保留已進 draft 的 entry；load failure
  不得顯示假空白，保留 active draft 並提供最短就地重試。
- Success boundary：「加入」成功只代表同一筆資料已進 current in-memory draft，不代表 remote save；
  durability 沿用 DEV-106 recovery 與既有 save feedback。

### RD 實作批次與依賴

1. **Batch A — Data kernel**：新增 `meetingTaskQuickNotes.ts`，完成 v1 parser、append、reconcile、projection、
   deterministic sort/dedupe；擴充三 provider `listByNode` 的 `includeArchived` option。此批完成前不得接 UI。
2. **Batch B — Store transaction**：升級 `appendTaskDiscussionToMeetingDraft` 顯式結果與單次 state commit；
   串接 human content update reconcile、DEV-024 synthesis merge 後 anchor rebase／invariant fail-safe 與
   DEV-106 signature/recovery。
3. **Batch C — First-layer UI**：新增 task-scoped hook 與 compact section，在 `TaskDetailsModal` 正確位置
   替換舊藍色「本次會議」區；完成 loading/error/retry、latest-3、a11y、viewport。
4. **Batch D — Verification**：新增 DEV-108 static/browser verifier 與 package scripts，執行 QA-DEV-108
   matrix、DEV-008／009／024／066／106 targeted regression、TypeScript、targeted ESLint、build:test、
   diff check；建立 QC 文件前不得宣稱 PASS。

Batch B 依賴 A；C 依賴 A/B；D 可先建立 fixture，但 browser PASS 依賴 A/B/C。每批只修改 SPEC-108
列出的檔案；發現 DB／RLS／permission boundary 需擴張時停止，不得順手加入。

### 實作檔案

- 新增：`src/utils/meetingTaskQuickNotes.ts`、`src/hooks/useTaskMeetingQuickNotes.ts`、
  `src/components/TaskNotes/TaskMeetingQuickNoteSection.tsx`、DEV-108 static/browser verifier。
- 修改：`meetingTaskDiscussion.ts`、`useRecordStore.ts`、`TaskDetailsModal.tsx`、`dataBackend.ts`、
  Firestore／local-test／Supabase record services、`package.json`。
- 不修改：TaskNode schema、database migrations、permission matrix、`taskKnowledgeSnippets`、production config
  或 release workflow。`TaskRecordTimeline` 已於 2026-09-10 依使用者決策移除。

### Verification Contract

- Deterministic：metadata validation、submission idempotency、正文修改／刪除 reconcile、manual/AI negative、
  active/saved dedupe、total order、latest-3、三 provider archived option、failure/recovery。
- Browser：正常入口加入、快捷鍵、跨 meeting exit／reopen／reload、edit sync、archive persist、source absence、
  load/save/recovery failure、1440×900、1024×768、390×844、200% zoom、keyboard/a11y 與 Quietness Audit。
- Evidence：`output/playwright/dev-108-task-meeting-note-persistent-list/` JSON、四張以上代表性截圖、
  provider readback、console/page/request errors、rendered key count 與實際執行命令。
- Gate：所有 P0/P1 與 regression PASS 才可進 QC；舊 DEV-009 evidence 不得外推。

### Stop Conditions

- 無法穩定區分「任務明細人工補記」與 AI 整理／一般任務活動時停止，不得用文字正規表示式冒充資料契約。
- 若方案需要把補記複製進 `detailNotes` 或建立第二個可獨立修改的來源，停止並回 PM 重新確認 `2A`。
- 若 active draft 與 persisted record 在會議結束時會重複顯示、短暫消失或改變時間順序，停止實作並補身份契約。
- 若需新增 provider schema、migration、權限或遠端資料變更，升級規格與風險 lane 後再執行。
- 若精簡版面隱藏寫入錯誤、移除鍵盤 focus 或造成窄版 overflow，視為未通過，不得以 build／unit test 取代 UI evidence。

### 文件與執行邊界

- 本輪完成 `RD Implementation Ready`、authoritative SPEC、QA plan 與 map 收斂；未修改產品程式、
  runtime、測試實作、schema、migration、Git index 或 release artifact。
- Readiness：使用者決策、資料形狀、provider query、store transaction、UI placement、failure/recovery、
  test fixture、evidence path 與 stop conditions 已固化；目前無 P0/P1 open question。
- ADR not needed：採既有 metadata JSON、內部可逆 query option 與 UI；不改外部 API、主資料、權限或 schema。
- 下一步可直接由 RD 依 Batch A→D 實作；本狀態不等於 `RD Implemented`、QA PASS、QC PASS 或 release。

### 技術主管審查結論

- 結論：`通過（文件修正後）`；無 P0/P1 readiness blocker。
- 原 P1：metadata／正文雙表示權威不清、`HH:mm + occurrence` anchor 可能錯配。
- 已修正：明定 canonical metadata／compatibility projection、aggregate invariant、`lineIndex + sourceToken`
  fail-closed reconcile、AI merge 後 anchor rebase、成功／durability 分層與受控技術債。
- 完整紀錄：`ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-108.md`。

### 變更紀錄

- 2026-09-07：完成 RD 技術主管審查並修正；結論為文件可實作。將雙表示改為明確 canonical／projection，
  anchor 改為 `lineIndex + sourceToken`，加入 invariant、fail-closed、durability 邊界與技術債移除條件。
- 2026-09-07：依使用者要求升級為 `RD Implementation Ready`；新增 SPEC-108／QA-DEV-108，固化
  metadata v1、正文 reconcile、archived task read、active draft identity、四批實作與證據 gate。
- 2026-09-07：依使用者引導決策 `1A／2A／3A` 建立 Brief；確認只顯示人工快速補記、
  原會議紀錄為唯一來源、封存保留／永久刪除移除，以及最新三筆＋原地展開的第一層緊湊版面。

使用思考習慣：#效用理論、#系統描繪、#可驗證性

## DEV-109：會議期間看板變更即時記錄與 AI 整理修復

- 文件成熟度：`Implemented / Candidate Verification In Progress / QA-QC Pending / NOT RELEASED`
- 狀態：開發完成，候選驗證中；尚未進入正式 release
- 節點類型：開發點
- 父交付點：DEV-007；相容 DEV-011、DEV-012、DEV-020、DEV-021、DEV-022、DEV-024、DEV-066、DEV-094、DEV-106、DEV-108
- 是否計入產品交付完成：否（修正既有交付點，不新增獨立產品能力）
- 原始需求邊界：`USER-20260907-MEETING-PROJECT-CHANGE-IMPORT-QUALITY-GATE-GAP`、`USER-20260908-LIVE-MEETING-CHANGE-CAPTURE-AI-ORGANIZE-ONLY`
- 風險等級：Medium（使用者可見流程，跨 task mutation、meeting session activity、draft content 與 AI synthesis）

### 問題與使用者價值

使用者在會議中調整專案內容後，預期變更可成為會議紀錄草稿的一部分；正式環境目前卻顯示
`AI整理失敗，原草稿已保留` 與 `AI synthesis output did not pass the meeting record quality gate`，內容編輯器仍為空白。

真正問題不是 AI 沒有回溯匯入，而是既有 live meeting capture 沒有完整落實：部分內容修改沒有 meeting activity，
且已捕捉的 activity 只留在記憶體 buffer，沒有立即成為使用者可見的目前會議紀錄內容。使用者因此必須按 `AI整理`
才可能看見變更；一旦 AI 品質閘門失敗，editor 就像完全沒有記錄。

成功結果是：開啟會議功能的當下建立 capture boundary，之後有意義的看板變更在任務儲存成功時即時進入目前會議草稿；
`AI整理` 只重新組織這些既有內容與人工速記，不查詢或匯入會議開始前的專案變更。

### 已確認事實與根因鏈

1. `startMeetingRecord` 將 `isMeetingMode` 設為 `true` 並建立或沿用 meeting draft；這是既有 live capture 的啟停邊界。
2. `useWbsStore` 在看板 mutation 後呼叫 `recordMeetingTaskActivity`；record store 只在 live meeting 接受並寫入 `meetingActivities`。
3. 現行 `recordMeetingTaskActivity` 只追加 memory buffer，不更新 `draft.content`，所以使用者無法即時看到已捕捉內容。
4. `buildTaskUpdateActivities` 尚未涵蓋任務名稱、任務說明及備註內容修改，造成這些儲存級變更完全沒有 live source。
5. `synthesizeMeetingDraft` 使用目前草稿與目前 session 的 `meetingActivities`；不查詢 provider history 是正確責任邊界，不是缺陷。
6. `SPEC-007` 已定義會議開始後收集任務變更；DEV-011／012 只要求 AI 將來源整理成自然語言、避免發布逐筆流水帳。
7. `匯入專案變化` 是 DEV-020／094 的獨立明確操作，用於使用者主動選擇的過去區間，不得暗中併入 `AI整理`。
8. AI quality gate 失敗會保留原草稿；但若 live evidence 從未投影到原草稿，正確的 fail-closed 行為仍會呈現不合理空白。

### Spec Impact Preflight

- `SPEC-007`：`Implementation needs correction + intentional refinement`。保留會議開始後自動捕捉；補足內容欄位並把 activity 即時投影成可見 working content，但不得恢復無限逐筆流水帳。
- `SPEC-011／012`：`Compatible clarification`。AI source 仍限目前草稿、人工補記與會中實際變更；AI 只重新整理，不做歷史查詢或即時 AI 生成。
- `SPEC-020／094`：`No-change boundary`。過去專案變更仍只能由使用者明確操作 `匯入專案變化`；其日期、cutoff、protected batch 與 provider query 不納入本 DEV 主流程。
- `SPEC-012`：仍禁止把任務靜態狀態或未變更快照當會議內容；只允許 capture boundary 後實際發生且可追溯的差異。
- `SPEC-021／022／024`：保留單一紀錄、人工內容與明確匯入內容的 preserve guard；AI 失敗不得移除 live working content。
- `SPEC-109`：`Target authority / RD Implementation Ready`。固定 save-level ticket、segment／aggregate、內容最小化、
  working projection、recovery、AI source、failure 與 work package。
- `QA-DEV-109`：`QA Plan Ready / Execution Pending`。固定 deterministic、真實 browser、failure injection、privacy 與回歸 gate。
- `SPEC-069／106`：`No-change recovery boundary`。Snapshot v2、signature、IDB version／store／scope／TTL 全部不變；
  既有 `draft.content` 仍會被本機 snapshot 保存。F5／crash recovery 只恢復已可見正文，重新開啟後建立新 segment，
  不續接 reload 前的暫態 baseline、ticket 或 aggregate。
- ADR：不需要。沿用既有 task mutation、meeting draft、local recovery 與 synthesis authority；若後續需擴張長期保留、
  跨工作區可見性、provider schema、remote recovery 或權限，再停止並重新判斷。

### Human Decision Brief

- 2026-09-08 決策 1：第一版有意義變更 allowlist 為任務名稱、任務說明、備註、狀態、日期、主責／協作、標籤、建立與封存。
- 決策 1 邊界：只在完成儲存後建立事件；排除逐鍵輸入、純排序、純拖曳及不改變任務語意的版面操作。
- 2026-09-08 決策 2：任務名稱保存前後值；任務說明與備註保存實際改動的正規化純文字片段及不可逆的前後內容雜湊，不保存整份舊稿。
- 決策 2 修正邊界：上述資料只作目前 meeting session evidence 與 draft 去重；provider activity history 不是 live meeting 紀錄的權威來源，不新增長期內容事件保存。
- 2026-09-08 決策 3：開啟會議功能後才開始捕捉看板變更，並在任務儲存成功時即時寫入目前會議紀錄內容；會議開始前的變更不自動帶入。
- 決策 3 AI 邊界：`AI整理` 只重新整理目前會議紀錄內容與本次 meeting activity，不觸發過去專案變更查詢；歷史匯入維持獨立明確操作。
- 2026-09-08 決策 4：同一 meeting session 內，同一任務同一欄位的反覆修改，在可見 working content 中只合併為「會議開始值 → 最新值」，不顯示中間過程。
- 決策 4 淨值邊界：若最新值回到會議開始值，該欄位視為 net no-op，從 working content 與 AI source 移除；底層只保留去重與 reconcile 所需的 event identity，不在正文呈現。
- 2026-09-08 決策 5：離開會議模式即關閉目前 capture segment；重新開啟同一草稿時保留既有內容，但從重新開啟時間建立新的 segment 與欄位基準。
- 決策 5 中斷邊界：會議關閉期間的看板變更不補抓、不回溯，亦不得由 `AI整理` 帶入；不同 segment 的既有正文不得因新 segment 啟動而被清除。
- Rejected：完整任務快照、逐鍵記錄、內容 before／after 全文雙份保存、另建永久 audit archive、將所有拖曳／排序流水帳當會議內容。
- Allowed engineering assumptions：差異演算法、正規化與雜湊格式由 RD 依現有 TypeScript／provider 慣例決定，但必須 deterministic、不可由雜湊還原內容且可跨重試去重。
- Human decision gate：產品語意、資料邊界與主要驗收已完成；repo 級工程契約已由 `SPEC-109` 固定，不再需要使用者補工程選項。

### 目標流程

```text
開啟會議功能
  → 建立新的 capture segment 與 boundary
  → 使用者在看板完成一次有意義變更儲存
  → 建立資料最小化的 session activity
  → 即時更新目前 draft 的可見 working content
  → 使用者可繼續速記或按 AI整理
      ├─ AI 成功：重整目前 draft 與本次 activities，保留人工內容與 task links
      └─ AI 失敗：原 working content 原樣保留，可重試

離開會議功能
  → 關閉目前 capture segment
  → 會外看板變更不記錄、不補抓
  → 重開同一草稿時保留既有內容，另建新 segment 後繼續即時記錄

過去專案變更
  → 只有使用者明確操作「匯入專案變化」時才依既有 DEV-020／094 流程處理
```

### Current Scope

- 修復既有 meeting-mode live capture，不建立新的歷史匯入或 provider readback 路徑。
- 將 capture boundary 後的看板變更在儲存成功時即時正規化、去重並更新目前 draft working content。
- AI quality gate、timeout 或模型錯誤不得撤銷已存在於草稿的 live change evidence。
- 第一版 allowlist 固定為任務名稱、任務說明、備註、狀態、日期、主責／協作、標籤、建立與封存；一律在完成儲存後建立事件。
- 名稱保留前後值；說明／備註只使用實際變動的純文字片段與前後雜湊，不保存完整舊稿或新增永久 event payload。
- 以 `meeting draft + capture segment + task + field` 作為可見合併鍵；同 segment 後續儲存只更新最新值，不追加中間版本，回到該 segment 開始值時移除該欄位的淨變更。
- 離開會議模式即停止接受新 activity；重開同一草稿時保留舊 segment 正文，建立新 segment、時間邊界與欄位基準後再接受新變更。
- 保留同一事件只呈現一次、同一會議一份主紀錄與 task links 可追溯；歷史匯入 cutoff 契約維持獨立且不變。
- `AI整理` 只重整目前內容，不查詢 provider activity history，也不自動觸發 `匯入專案變化`。

### Out of Scope

- 不把任務目前完整 description／detail notes 快照直接灌入會議紀錄。
- 不記錄每次鍵盤輸入、游標移動、純排序、純拖曳或低價值版面操作。
- 不在會議正文或 AI 輸出保留同欄位的中間修改流水帳；使用者自行輸入的人工速記不受此限制。
- 不保存任務說明／備註的完整舊稿，不新增永久 audit archive 或擴張既有資料可見性／保存期限。
- 不讓 `AI整理` 回溯、補抓或自動匯入會議開始前的專案變更。
- 不捕捉、查詢或推測兩個 capture segment 之間的會外看板變更，也不跨 segment 改寫既有事件的起始基準。
- 不修改 `匯入專案變化` 的日期、cutoff、provider query、protected batch 或發布基準。
- 不把 `AI整理` 變成發布前必經條件；使用者仍可直接手寫、存草稿或依既有流程發布目前內容。
- 不建立逐字稿、錄音、跨看板匯入、完整 audit viewer、版本差異瀏覽器或新的會議流程面板。
- 原文件升級階段不修改 schema、migration、provider、Edge Function、產品程式、測試、Git index 或 release artifact；目前
  implementation 已依 `SPEC-109` 落在既有 TypeScript store／utility 路徑，仍未進行 schema、migration 或正式 release 變更。

### UX Intent 與 UI Entry

- Target actor：已進入會議模式、可編輯目前看板與會議草稿的使用者。
- 正常入口：使用者由既有入口開啟會議功能即開始 capture；看板任務儲存是即時記錄觸發點，右側 `AI整理` 只整理目前內容。
- 主物件仍是會議內容 editor；不得新增常駐摘要卡、事件計數面板或第二套結果容器。
- 正常成功以 editor 內出現內容為主要回饋；一般成功提示維持最小且短暫。
- AI 降級時使用「AI整理失敗，原內容已保留」的等效短訊息並保留重試；即時 working content 不得消失。
- `匯入專案變化` 維持既有獨立入口，不因點擊 AI 而改變狀態、日期或 cutoff。

### RD Engineering Contract

- Authoritative spec：`ai-doc/specs/SPEC-109-meeting-live-task-change-capture.md`。
- QA authority：`ai-doc/qa/QA-DEV-109-meeting-live-task-change-capture.md`。
- Capture truth：WBS mutation 前建立 immutable ticket，只有 provider ack 或 canonical readback 確認後才 commit；
  `mutationId` 跨 completion／readback／retry 穩定且 exactly-once。
- Segment truth：每次 `startMeetingRecord` 都新建 segment；主動離開、F5、crash 或頁面重載都終止原 segment。
  recovery 只保留既有 `draft.content`，不得續接 reload 前的暫態 baseline、ticket 或 aggregate。
- Aggregate truth：key 為 `draftId + segmentId + nodeId + fieldKey`；baseline 固定、latest 依 confirmed commit sequence 更新，
  hash 回到 baseline 即移除 net no-op。
- Content privacy：title 保存完整前後值；為正確計算「segment 起始值 → 最新值」，description／note 的完整純文字 baseline
  只允許存在目前分頁的 volatile runtime。每次 confirmed commit 由 baseline 與 latest 重新計算 deterministic bounded diff
  與 SHA-256；完整 baseline／latest 不得進 draft、metadata、recovery、provider payload、log 或 telemetry，segment 關閉／reload／logout 即釋放。
- Note alias：`detailNotes` 為 UI canonical；同 mutation 同時更新 `description` 時抑制 compatibility duplicate。Note 依 id 比對，純重排 no-op。
- Projection：在既有 editor 直接顯示 `- 會中變更｜@[任務](task:id)：欄位 before→after`；無常駐容器。
  以 `lineIndex + exactText` reconcile；人工修改／刪除後 preserve + detach，後續另開 projection generation。
- Recovery：不新增 recovery schema 或 signature 欄位；沿用 DEV-106 對 `draft.content` 的既有 round-trip。remote recovery request 維持 0。
- AI：權威輸入是目前 editor raw content；DEV-109 新 capture 不另寫 `meetingActivities`，避免同一證據出現第二份來源。
  每條 active system projection 在合併結果中恰好一次，且不得呼叫 history/import。AI 成功時同步 rebase
  `meetingSynthesis.sourceContent`／`outputContent`；若人工編輯使 trace 無法唯一 reconcile，保留正文、清除 stale trace 並 detach projection。
  任何 quality/provider/merge/reconcile failure 都 byte-preserve 原稿與 evidence。
- Historical import：DEV-109 不新增 live-only event type，也不得重用 `PROJECT_CHANGE` 表示 live capture；DEV-020／094
  provider query、cutoff、protected batch 與 publish baseline 維持原樣。

### Data／API 與 failure boundary

- 新增集中型別：`MeetingLiveCaptureTicket`、`MeetingLiveCaptureSegment`、`MeetingLiveFieldAggregate`、
  `MeetingLiveContentValue`、`MeetingLiveProjectionAnchor`、`MeetingLiveCaptureRuntime`；禁止 UI/store/service 重複定義。
- 新增 pure owner `src/utils/meetingLiveTaskChanges.ts`，負責 allowlist、normalization、SHA-256、bounded diff、net-change aggregate、
  projection 與 anchor reconcile；不得存取 provider／DOM／Zustand。差異演算法屬內部實作，但 golden vectors、fragment 上限與 deterministic output 必須固定。
- `useWbsStore.updateNode` 回傳／重試路徑必須攜帶 stable capture context；TaskDetails 不得因既有 `skipActivity` 漏掉後續
  confirmed live capture。Create、batch、forest、dependency schedule 與含 allowlist delta 的複合 placement 路徑各自在 persistence terminal success 後 commit；純 placement／drag 為 0 ticket。
- `useWbsStore` 對 allowlist mutation 不得再雙寫 record store legacy `meetingActivities`；provider audit/activity log 可維持獨立路徑，
  但其 success／failure 都不是 DEV-109 capture truth。
- 如果 task persistence 失敗／unknown，不顯示 live line；如果 task 已保存但 hash／projection 失敗，不回滾 task，保留 draft，
  於 editor 附近顯示最短可重試錯誤。
- late completion 若 segment closed、draft／board 不符，直接丟棄；不得寫入下一 segment。
- link removal 只能經既有 content sync，且無 manual／legacy／quick-note／import／其他 aggregate 引用時才可移除。
- reload／recovery 後僅以已恢復正文為權威並建立新 segment；不得從歷史任務資料推測 reload 前 aggregate。
  AI failure 保留 content、metadata、taskLinks 與目前 runtime aggregate／projection signature。

### Work Packages／依賴順序

1. `WP-109-A Pure contract`：型別、normalization、SHA-256、bounded diff、net no-op、projection reconcile 與 volatile-runtime privacy guard。
2. `WP-109-B Persistence truth`：update/create/batch/forest/placement/dependency 的 confirmed commit；TaskDetails stable retry identity。
3. `WP-109-C Draft projection/lifecycle`：record store segment、volatile aggregate、editor line、task links、reload 新 segment 與 late-close isolation；DEV-106 recovery schema 不變。
4. `WP-109-D AI source/preserve`：raw-content source、system-line exact-once、meetingSynthesis trace rebase、repeat synthesis、human/import/quick-note preserve 與 failure rollback；不新增 live event type。
5. `WP-109-E Candidate verification`：static、browser、failure injection、targeted regression、type/lint/build、evidence freeze。

順序固定 A→B→C→D→E。A 的 privacy/diff vectors 未過不得進 B；B 的 persistence truth 未過不得在 C 顯示成功；
D 的 preserve gate 未過不得覆蓋草稿。RD 只可在 E 後交 QA/QC，不能自封 PASS。

### File Ownership

| 檔案 | RD 責任 |
|---|---|
| `src/types/index.ts` | live runtime 集中型別；不新增 recovery／provider schema。 |
| `src/utils/meetingLiveTaskChanges.ts`（new） | pure capture、privacy、aggregation、projection 與 reconcile authority。 |
| `src/store/useWbsStore.ts` | persistence-confirmed ticket lifecycle；activity log 與 live capture 解耦。 |
| `src/components/TaskDetailsModal.tsx` | 保存／readback／retry 穩定 capture identity；不直接寫 draft。 |
| `src/store/useRecordStore.ts` | segment、aggregate、projection、task links、AI transaction。 |
| `src/hooks/useMeetingDraftRecovery.ts`、`src/services/meetingDraftRecoveryService.ts` | 預期 0 修改；以 regression 證明既有 content round-trip、signature、IDB 與 0 remote request 均未變。 |
| `src/utils/meetingRecordSynthesis.ts`、`src/utils/humanDraftSynthesisMerge.ts` | raw-content exact-once、trace rebase、preserve/reconcile。 |
| `supabase/functions/synthesize_meeting_record/index.ts` | 不新增 live event；僅在既有 contract 內強化 system-line preserve／dedupe，且不讀 project history。 |
| `scripts/verify-dev-109-*.ts/js`、`package.json` | deterministic／browser gate 與 scripts。 |

### 驗收方向

- [ ] 開啟會議功能後修改 allowlist 欄位並完成儲存，不需按 `AI整理`，變更即時出現在目前會議草稿內容。
- [ ] 任務名稱事件可辨識前後值；任務說明／備註事件只含實際差異純文字片段與前後雜湊，無完整舊稿或未變更快照。
- [ ] 逐鍵輸入、取消編輯、純排序與純拖曳不更新會議內容；完成儲存恰好產生一筆可去重 evidence。
- [ ] 同一任務同一欄位連續儲存三次時，working content 只有一條「會議開始值 → 最新值」，中間值不出現在正文或 AI 整理結果。
- [ ] 同一欄位最後改回會議開始值時，該欄位淨變更自動從 working content 與 AI source 移除；若任務已無其他 evidence，對應 task link 亦不殘留。
- [ ] 離開會議模式後修改看板，再重開同一草稿：舊內容仍存在、會外修改未出現，且重開後完成的新儲存以新 segment 基準即時加入。
- [ ] 同一任務同一欄位跨兩個 segment 修改時，各 segment 的已確認正文可追溯且互不覆蓋；`AI整理` 不得推測或補齊中斷區間。
- [ ] 會議開始前完成的變更不會因 `AI整理` 出現在草稿；只有明確操作 `匯入專案變化` 才可帶入過去變更。
- [ ] 模擬 `QUALITY_GATE_FAILED`、timeout 與 Edge error，既有人工內容及 live working content byte-for-byte 保留。
- [ ] 成功 AI 整理後只有一份 `1／2／3` 主結構，protected evidence、task mentions、taskLinks 與人工內容均未遺失。
- [ ] 空白、loading、complete、empty、AI-degraded 與 hard-error 可從原操作附近辨識，沒有新增框中框或常駐技術錯誤文字。
- [ ] 1440×900 與 1024×768 正常入口無 overflow、重疊或按鈕擠壓；手機版既有 unavailable 邊界不變。

### Implementation Readiness／風險

- Human confirmed：有意義欄位、save-level 邊界、內容差異最小化、live capture 時點、同欄位淨變更合併、重入新 segment 與 AI-only-reorganize 責任已固定。
- Tech Lead reviewed：已移除 recovery schema、live-only Edge event 與 symbolic diff composition 等非必要設計；權威資料收斂為既有 `draft.content`，另以單一分頁 volatile runtime 維持 segment baseline／aggregate。
- Implemented：WP-109-A～C 及現有 AI raw-content 邊界已落實於 `src/types/index.ts`、
  `src/utils/meetingLiveTaskChanges.ts`、`src/store/useWbsStore.ts` 與 `src/store/useRecordStore.ts`；
  新增 deterministic verifier，並完成 TypeScript、targeted ESLint、test build 與瀏覽器冒煙驗證。
- Pending：完整 QA-DEV-109 failure matrix、相依回歸與獨立 QC 尚未完成；目前不可宣稱 QA PASS 或 release ready。
- 相依：DEV-012 contract v2 quality gate、DEV-020／094 import metadata 與 cutoff、DEV-021／022／024 preserve guards、
  DEV-066 rich note projection、DEV-106 recovery、DEV-108 quick-note provenance。
- Stop：若需改變既有 retention／權限、將完整敏感文字長期寫入新遠端欄位、執行 migration 或正式資料修補，停止並升級風險。

### Evidence Direction

- Deterministic：meeting start boundary、allowlist、save-level dedupe、內容 diff／hash、同欄位淨值聚合、net no-op 移除、working-content reconcile、AI failure preserve、retry idempotency。
- Integration：start meeting → task mutation save → segment activity → visible draft content → stop → off-meeting mutation → reopen same draft/new segment → save → AI reorganize；不依賴 provider history readback。
- Browser：正常入口開始會議，驗證變更即時可見、停止後不捕捉、重開保留舊內容、AI 前後內容、AI-degraded、重試，以及 AI 不帶入會前或中斷期間變更。
- Production regression fixture：凍結 candidate 後以可清理 fixture 重現 `QUALITY_GATE_FAILED`；通過條件是 editor 仍保有專案變更。

### Execution Boundary

- 本輪已完成 RD 依 WP-109-A→D 的產品實作與候選驗證：不新增 schema、migration、provider、Edge Function 或 recovery schema。
- 下一步是 QA/QC 依 `QA-DEV-109` 執行完整 failure／回歸矩陣；正式 release 仍須另走 deployment gate。

### 變更紀錄

- 2026-09-08：完成 RD 技術主管審查並有條件通過文件。移除多重 truth source、recovery schema 擴張、
  live-only Edge event 與 symbolic diff composition；改以 `draft.content` 為唯一持久化 live evidence，完整內容 baseline
  只存在目前分頁 volatile runtime，reload 後保留正文並新建 segment。詳見 `RD-TECH-LEAD-REVIEW-DEV-109`。
- 2026-09-08：依使用者「確認」升級為 `RD Implementation Ready`；新增 SPEC-109／QA-DEV-109，固定 save-level
  ticket、segment/aggregate、bounded content diff + SHA-256、純文字 projection、existing-content recovery boundary、
  AI-only-reorganize、failure matrix、WP-109-A→E 與證據 gate；產品與 QA/QC 尚未執行。
- 2026-09-08：使用者修正核心流程：會議功能開啟後即時捕捉並寫入目前紀錄；AI 只整理本次內容，不匯入過去變更。同步移除 provider history／AI hydrate 的錯誤方案。
- 2026-09-08：依使用者「確認」固定決策 5；重開同一草稿建立新 capture segment，保留舊內容但不補抓會議關閉期間的看板變更，完成 Brief 產品決策 gate。
- 2026-09-08：依使用者「同意」固定決策 4；同一任務同一欄位只呈現會議開始值至最新值，回到開始值即移除淨變更，AI 不得保留中間版本。
- 2026-09-08：完成 DEV-109 candidate implementation。新增集中型別、純函式 allowlist／bounded diff／SHA-256／net no-op，
  將 WBS create／update／batch／forest／placement／dependency 的 confirmed persistence 接到 meeting draft projection，
  並建立 `verify:dev-109-meeting-live-task-change-capture`；TypeScript、targeted ESLint、build:test、deterministic verifier
  與 localhost browser smoke 通過，完整 QA/QC 與 release 尚未執行。
- 2026-09-08：依使用者第二次「照建議」確認內容最小化；經決策 3 校正後只作 session／draft evidence，不新增長期 provider content payload。
- 2026-09-08：依使用者第一次「照建議」固定第一版 allowlist 與 save-level 邊界；排除逐鍵輸入、純排序與純拖曳。
- 2026-09-07：依正式環境空白內容與 `QUALITY_GATE_FAILED` 建立 Brief；固定「變更證據不得被 AI 失敗阻斷」。

使用思考習慣：#問對問題、#系統描繪、#可驗證性

## DEV-110：未歸位任務會議紀錄邊界修正

- 文件成熟度：`RD Implementation In Progress / Local Candidate Implemented / NOT RELEASED`
- 狀態：RD本機候選已完成；等待QA/QC
- 節點類型：開發點
- 父交付點：DEV-108；相容DEV-009、DEV-039、DEV-095
- 是否計入產品交付完成：否（corrective開發點；文件ready貢獻0）
- 原始需求邊界：Production截圖顯示未歸位任務的會議紀錄區出現
  `Supabase WBS item not found for legacy node id`；使用者於2026-09-08要求CAPA升級到RD可實作。
- 風險等級：Medium（使用者可見錯誤、跨ownership/provider、record task-link完整性）
- Authoritative spec：`ai-doc/specs/SPEC-110-unplaced-task-meeting-record-boundary.md`
- QA authority：`ai-doc/qa/QA-DEV-110-unplaced-task-meeting-record-boundary.md`
- CAPA source：`ai-doc/reports/CAPA-DRAFT-20260908-unplaced-task-meeting-record-boundary.md`（未正式編號）

### 問題與產品決策

同一個`TaskDetailsModal`會接收板內canonical task、tracking reference對應的canonical task與account-owned
unplaced task。DEV-108 hook目前只收裸`taskId`，並固定搭配active board呼叫板內`listByNode`；因此U1不在
`wbs_items`時必然not found，跨板reference也可能以target board查source task。Supabase write另會把無法解析
的requested task link靜默略過，讓record body成功與task traceability分離。

本期採current-phase最小例外：未歸位任務必須先進入目前會議的看板才能使用project-scoped會議紀錄；
tracking reference讀取使用canonical source board，只有source board meeting可append。這是對SPEC-039功能等價
的窄幅例外，不建立unplaced record schema，也不把placement identity寫成record task identity。

### Current scope／不變量

- capability以canonical `TaskNode.boardId`判定；不得依`task_workbench_unplaced_*` prefix判定，因任務歸位後
  可保留該legacy ID。
- unplaced：read/refresh零provider call；非meeting無空section，meeting只顯示單一歸位提示，無composer/retry。
- tracking reference：歷史查詢固定`node.workspaceId/node.boardId/node.id`；target board不是record owner。
- cross-board meeting append由UI隱藏與store denied雙層阻擋；不得改draft content/metadata/taskLinks。
- Supabase upsert在任何mutation前resolve全部requested links；任一unresolved即typed fail，record/body/舊links
  維持pre-call狀態。reload link exact set不等不得回傳成功。
- provider exception映射generic Traditional Chinese；Supabase/table/legacy ID/SQL/RLS不得出現在可見UI。
- DEV-108的metadata/projection、latest-3、archive、active draft、recovery、a11y與版面契約不變。

### RD執行計畫

- [x] WP-110-A：新增pure capability resolver；補unplaced、歸位後legacy prefix、same/cross-board reference與
  identity incomplete決策；store append增加task board defense。
- [x] WP-110-B：hook改用canonical scope並加入request generation；TaskDetailsModal/section落實unsupported、
  loading、error與composer矩陣，task切換清除前一task暫存輸入/error。
- [x] WP-110-C：新增record task-link typed contract；Supabase resolve-all preflight前移、移除silent skip、
  save reload exact-set gate；Firestore/local-test維持相同success invariant。
- [~] WP-110-D：建立DEV-110 deterministic/browser/Supabase TEST assets；目前 deterministic/static、browser B01～B04、
  DEV-108 static、TypeScript、lint、build:test與diff check已PASS，Supabase TEST、B05～B07及DEV-039／095 targeted
  regressions待QA執行。

實作依賴：A → B；A/C可平行；D可先建fixture但PASS依賴A～C。RD不得把舊DEV-108 local PASS重用為
DEV-110結果，也不得在本DEV內啟動deploy。

### 驗收標準

- [ ] 非meeting開unplaced detail沒有meeting section、query、error、retry或composer。
- [ ] meeting開unplaced detail只有「請先將任務放入目前會議的看板，再新增會議紀錄。」且direct store
  append仍denied、draft fingerprint不變。
- [ ] unplaced經正式placement進板後，即使ID prefix不變也恢復query/append能力。
- [ ] tracking reference以canonical source identity載入；cross-board只讀source history且不可append target record。
- [ ] A→unplaced→B快速切換沒有stale records/error/loading。
- [ ] transient/RLS failure只顯示generic錯誤與有效retry；可見technical error sweep=0。
- [ ] Supabase partial/all unresolved link皆在mutation前fail且existing body/metadata/status/links逐欄不變；
  0 unresolved可進入save並須通過reload exact-set。
- [ ] resolved save的requested/persisted `(nodeId,role)` exact set相等；不得silent partial success。
- [ ] QA-DEV-110 B01～B07、T01～T06、指定回歸、三viewport與cleanup全部PASS。

### Failure／recovery／stop

- Load失敗保留active draft/input；retry僅對supported canonical scope有效，scope改變後舊response失效。
- Preflight失敗沿用既有save failure/recovery並保留draft，不更新成功baseline。
- 若preflight後fault injection證實cross-table partial state，DEV-110停止進release並啟動SPEC-110 transactional
  RPC Future Phase Capsule；不得降低驗收。
- 若產品改為讓unplaced直接擁有records、需跨project links、RLS放寬、production data repair或migration apply，
  停止並回PM取得新決策／授權。

### Spec governance／release boundary

- Conflict：`Intentional narrow exception` to SPEC-039；`Corrective amendment` to SPEC-108；與SPEC-095 canonical
  task/placement identity一致，無unresolved conflict。
- ADR：不需要；目前為局部可逆guard/adapter。若啟動transactional RPC，再重新判斷。
- Deferred：unplaced專屬record ownership不在本期；transaction RPC已有re-entry capsule，無P0/P1 RD blocker。
- Release impact：會改frontend bundle與Supabase client write行為，但不改schema/migration。完成local QA/QC後仍需
  獨立deployment gate、exact artifact、production-bound smoke與post-deploy verification。
- 未授權：正式CAPA編號、production query/mutation、commit、push、deploy、activation或release。

### 變更紀錄

- 2026-09-08：依使用者要求將未編號CAPA升級為RD Implementation Ready；登錄DEV-110、SPEC-110與
  QA-DEV-110，固定ownership/read/append、unresolved-link preflight、UI狀態、工作包、驗收與停止條件。
- 2026-09-08：完成DEV-110 local candidate implementation；新增canonical capability／generation guard、UI
  unsupported boundary、store append defense、record task-link exact-set contract與Supabase resolve-all preflight；
  DEV-110 static 18/18、browser B01～B04、DEV-108 static 14/14、TypeScript、lint、build:test與diff check PASS，
  QA/QC與release未執行。

使用思考習慣：#第一性原理、#效用理論、#多層次分析、#可驗證性

## DEV-111：任務說明跨閱讀模式懸浮視窗

- 開發文件成熟度：`RD Implementation Ready / Implemented / Local QA-QC PASS`
- 狀態：完成（Local-only / NOT RELEASED）
- 節點類型：交付點
- 父交付點：無；相容 DEV-028、DEV-065、DEV-066、DEV-070
- 是否計入產品交付完成：是（本機功能完成；release 另行計算）
- 原始需求邊界：使用者要求只增加一個功能，直接用現有「任務說明」自由文字，在所有閱讀模式中
  滑鼠靜置 1 秒後顯示懸浮說明視窗。
- 風險等級：Medium（跨五個閱讀模式的使用者可見互動）
- Authoritative spec：`ai-doc/specs/SPEC-111-task-description-hover-card.md`
- QA／QC：`ai-doc/qa/QA-DEV-111-task-description-hover-card.md`、
  `ai-doc/qc/QC-DEV-111-task-description-hover-card.md`

### 任務目標與範圍

- [x] 不新增欄位，唯讀使用 `TaskNode.description` 的最新非空 plain-text projection。
- [x] 看板 L1/L2/L3+ 與清單直接使用選取預覽藍框 task surface；心智圖、甘特條／側欄、行事曆區段／
  側欄使用各自完整 task surface。
- [x] 1000ms dwell、stale timer cancellation、hoverable、Escape／scroll／pointer／drag dismissal。
- [x] body portal、viewport clamp、長內容內捲、純文字與換行、tooltip a11y 關聯。
- [x] 空白、touch/coarse pointer、mindmap quick-title editing 不啟動。
- [x] 非空任務在看板三層、清單、心智圖、甘特圖、行事曆與共用側欄顯示 9px 圖示／11px 固定槽位；
  空白任務不顯示、不占位，圖示不承接 pointer、focus 或可存取名稱。
- [x] 不改 click、details、selection、context menu、drag、TaskNode、provider、schema、權限或 persistence。

### 驗收與結果

- [x] Static 38/38；browser 34/34，五模式 rendered／indicator screenshot、L1/L2/L3+／清單 title 外藍框內點位、
  9／11px、空白不渲染、390px、timing、content、geometry、dismissal、a11y 與 visible／console error 全部 PASS。
- [x] DEV-028 static 48/48＋browser PASS；DEV-066 targeted PASS；TypeScript、test build、targeted
  ESLint 0 error、`git diff --check` PASS。
- [x] DEV-065 前段 hover geometry／source handoff／native title browser cases PASS；其未修改的 stale static literal
  與 DragOverlay summary gate 失敗保留為相鄰限制，不擴張本 DEV。

### Spec governance／release boundary

- Spec Impact：`Intentional replacement`（只替換本 DEV 先前 no-icon 限制）；SPEC-066 plain projection、
  SPEC-065 subtree hover、SPEC-028／070 interaction command 契約均不被取代。
- ADR：不需要；局部可逆且無資料／權限／跨模組狀態決策。
- Deferred Scope：結構化 OKR 欄位、階層繼承、必填規則、mobile touch 替代入口與可編輯 hover 均未要求。
- Release：不改 build/runtime/schema/migration；本輪未 commit、push、deploy 或 release。

### 變更紀錄

- 2026-09-08：依使用者 annotation 收斂為單一 hover 功能；完成規格、跨模式 trigger、集中式 portal、
  static/browser verifier、targeted regression 與 Local QA-QC。
- 2026-09-09：依使用者回饋將看板／清單啟動範圍改為直接引用既有選取預覽藍框 surface，移除四處
  title-only trigger；新增 L1／L2／L3+／清單範圍 browser gate 並完成 Local QA-QC。
- 2026-09-09：依使用者選定方案，在非空任務標題旁加入共用 9px `AlignLeft` 圖示與 11px 固定槽位；
  圖示無背景／外框／文字且不攔截互動，完成五模式、共用側欄、空白與 390px Local QA-QC。

使用思考習慣：#使用者視角、#溝通設計、#可驗證性

## DEV-114：任務說明全介面覆蓋與重複名稱懸浮清理

- 開發文件成熟度：`RD Implementation Complete / RD Tech Lead Review PASS`
- 架構定案：`已定案（2026-09-09 技術主管複核）`
- 狀態：`Local implementation complete / DEV-114 + compatible regression QA-QC PASS / NOT RELEASED`
- 節點類型：交付點
- 父交付點：無；延伸 DEV-111，相容 DEV-004／006／020、DEV-028、DEV-039、DEV-045、DEV-065、DEV-066、
  DEV-070、DEV-088、DEV-098、DEV-107
- 是否計入產品交付完成：是（Local implementation 與相容 regression 完成；正式 release 另需 gate）
  - Source revision：`1b6450355ed81180c5abd419ac756564cff1b3c0`（`持續優化3`）＋ SPEC-114
    `Architecture Review Baseline`；candidate implementation 與 Task Details surfaces amendment 已完成，候選 hash 已更新
- Authoritative Spec：`ai-doc/specs/SPEC-114-task-description-global-surfaces.md`
- QA Plan：`ai-doc/qa/QA-DEV-114-task-description-global-surfaces.md`（Executed / DEV-114 + compatible regression PASS）
- 原始需求邊界：使用者要求把任務說明懸浮視窗套用至先前盤點的所有持久任務位置，觸控裝置維持
  不套用；另移除懸浮時只重複顯示任務名稱或位置的原生 tooltip，並重整完整位置表。
- 風險等級：Medium（跨多個使用者可見表面、hover ownership 與既有點擊／拖曳互動）

### RD Tech Lead Review 結論

- 結論：`PASS / 可進 RD 實作`；無未決 blocker。核心方向正確：以既有單例 controller 擴充 presentation metadata，
  不建立 service、schema、第二份說明資料或第二套 overlay。
- 核心理由：真正風險不是卡片樣式，而是 `task identity → content source → dwell candidate → trigger ownership → evidence`
  是否同一條鏈。文件已把這五段收斂為可驗收契約。
- 已修正的五項高價值缺口：
  1. pending timer 原可能捕捉舊 task ID；改為比對 `trigger＋taskId＋sourceKind` 的不可漂移候選快照。
  2. 回收桶與紀錄整列含 button／select；改為只讓任務 identity zone 觸發，控制項不排程或保留說明卡。
  3. 訂閱 preview 同時有 app ID 與 provider storage ID；hover 固定用 `event.node.id`，既有 preview identity 不變。
  4. 原回歸只覆蓋共用 controller；補上 Workbench、subscription、recycle、record／mention 的直接 module gates 與正常入口。
  5. working tree 不是可重現 revision；SPEC 已記錄兩個相鄰未提交檔案 SHA-256，漂移時必須重審。
- 最小修正原則：不新增中央 exclude 機制、不擴 RAG payload、不 hover-time fetch；若精準 trigger zone 無法成立，
  才停止並回 PM，而不是先加抽象層。

### 問題與使用者價值

DEV-111 已完成看板、清單、心智圖、甘特圖與行事曆的共同任務說明懸浮視窗，但工作台、回收桶、
紀錄任務引用、AI 任務引用與行事曆訂閱預覽等持久任務呈現尚未完整套用。部分位置另有瀏覽器原生
`title`，懸浮時只重複畫面已看得到的任務名稱或位置，形成第二個無必要的浮層與內容競爭。

完成後，桌面使用者在任何已納入的持久任務呈現上，都以同一個 1 秒任務說明懸浮視窗取得內容；
不再看到只重複任務名稱／位置的原生 tooltip。手機與觸控流程、操作控制提示及點擊式 popover 不變。

### Human Decision Brief

- 已確認：所有持久、可辨識且代表單一任務的閱讀位置都納入；既有五模式入口繼續保留。
- 已確認：任務詳情的子任務列與上層任務路徑／麵包屑納入；目前任務標題仍不納入說明 hover。
- 已確認：mobile／touch／coarse pointer 維持不啟動，不新增長按或點擊替代入口。
- 已確認：只重複任務名稱或位置的原生 tooltip 移除；有操作語意的 control tooltip 保留。
- 已確認：說明卡不顯示任務名稱、欄位標籤、教學或第二個標題，只顯示非空任務說明。

### UX Intent

- 任務／結果：在不同功能區掃描任務時，可按需閱讀同一份任務說明，不被重複名稱浮層干擾。
- 主物件／主焦點：游標目前停留的單一持久任務呈現。
- 預設刪除：任務名稱／位置原生 tooltip、說明卡內的任務名稱、欄位標籤、helper 與第二套 hover card。
- 保留舉證：非空說明的 9px 微型圖示用於辨識可讀內容；無文字操作控制的 tooltip 用於命名控制。
- 非語言修復：沿用完整 task surface、既有 9px 圖示與單一集中式 overlay，不新增文字入口或容器。
- 風險與驗證：長標題／長說明、truncate、inline mention、跨看板引用、viewport 邊界、drag／click ownership、
  鍵盤與 accessible name、390px touch 排除及 visible error sweep。

### 套用位置矩陣

| 區域 | 任務位置 | 任務說明 hover | 現況／本期處置 | 名稱／位置原生 tooltip |
|---|---|---|---|---|
| 看板 | L1 欄標題 | 套用 | DEV-111 已有；保留並回歸 | 無需新增 |
| 看板 | L2 任務卡 | 套用 | DEV-111 已有；保留並回歸 | 無需新增 |
| 看板 | L3+ 子任務列 | 套用 | DEV-111 已有；保留並回歸 | 無需新增 |
| 清單 | 所有層級任務列 | 套用 | DEV-111 已有；保留並回歸 | 無需新增 |
| 心智圖 | 任務節點 | 套用 | DEV-111 已有；保留並回歸 | 移除節點名稱 `title` |
| 甘特圖 | 任務條 | 套用 | DEV-111 已有；保留並回歸 | 無需新增 |
| 甘特圖 | 共用任務側欄列 | 套用 | DEV-111 已有；保留並回歸 | 無需新增 |
| 行事曆 | 任務日期區段 | 套用 | DEV-111 已有；保留並回歸 | DEV-111 已移除名稱 `title` |
| 行事曆 | 共用任務側欄列 | 套用 | DEV-111 已有；保留並回歸 | 無需新增 |
| 任務詳情 | 子任務列 | 套用 | 共用任務列已可觸發；本期正式納入與回歸 | 無需新增 |
| 任務詳情 | 上層任務路徑／麵包屑 | 套用 | 各 ancestor button 以 canonical task ID 接入共用 hover；卡片層級高於 modal | 移除祖先名稱 `title` |
| 全域任務平台 | 未歸位任務列 | 套用 | 既有 surface 僅部分接通；補齊內容、標示與驗證 | 移除任務位置 `title` |
| 全域任務平台 | 已歸位／全部任務列 | 套用 | 補共同 trigger、非空標示與驗證 | 移除任務位置 `title` |
| 回收桶 | 已封存任務名稱／識別區 | 套用 | 補共同 trigger、非空標示與驗證；操作欄不納入 | 移除任務名稱 `title` |
| 回收桶 | 原始位置中的父任務名稱 | 套用 | 以父任務 identity 讀取父任務說明 | 目前無原生名稱 tooltip |
| 紀錄編輯 | 已連結任務 icon＋名稱識別區 | 套用 | 補共同 trigger、非空標示與驗證；role select／action 不納入 | 移除任務名稱 `title` |
| 紀錄內容 | 行內任務 mention | 套用 | 以 mention node identity 讀取說明，不改序列化資料 | 移除 DOM `title`，保留資料欄位 |
| AI 助理 | `wbs_items` 任務引用卡 | 套用 | 只套用任務型引用；補 canonical 任務說明解析 | 目前無原生名稱 tooltip |
| 行事曆訂閱 | 任務事件預覽列 | 套用 | 使用預覽已載入的任務 identity／說明 | 目前無原生名稱 tooltip |

### 明確不套用位置

| 位置／情境 | 任務說明 hover | 處置理由 |
|---|---|---|
| 任務詳情目前任務標題 | 不套用 | 同一畫面已直接提供任務說明；移除 editable／readonly 名稱 `title` |
| mobile／touch／coarse pointer | 不套用 | 維持既有決策，不新增長按或點擊行為 |
| 尚未轉成正式任務的快速收件內容 | 不套用 | 尚無 canonical task identity／description |
| 拖曳預覽、插入預覽與選取藍框 | 不套用 | 暫態互動回饋，不是持久閱讀位置 |
| 右鍵選單、確認視窗、toast | 不套用 | 操作／結果訊息，不是任務閱讀位置 |
| 任務數量、一般文字、紀錄歷史純文字片段 | 不套用 | 不代表可解析的單一 canonical 任務 |
| AI 助理的專案、紀錄與文件引用卡 | 不套用 | 不是任務型 `wbs_items` 引用 |

### 既有懸浮／浮層盤點與處置

| 類型 | 是否存在 | 本期處置 |
|---|---|---|
| 集中式任務說明 hover card | 是 | 作為唯一自動任務內容浮層；擴充入口，不複製元件 |
| 任務名稱／位置原生 `title` tooltip | 是 | 依上表移除；說明卡內也不得重複名稱 |
| 操作控制 tooltip | 是 | 保留，例如新增、收合、還原、刪除、鎖定、resize 與重試 |
| 點擊／focus 後開啟的 popover | 是 | 保留，例如標籤與篩選器；不視為任務說明 hover |
| 選取、drop 與 drag preview | 是 | 保留既有視覺回饋；不成為說明 hover 入口 |

### 架構定案

- [x] 沿用 DEV-111 的單一 `TaskDescriptionHoverCard` controller、1000ms dwell、plain-text、portal、viewport
  clamp、dismissal 與 `aria-describedby`，不得建立第二套 overlay 或每列 timer。
- [x] 一般入口只傳 `data-task-id`，於排程前及 1000ms 到時後從最新 WBS store 解析 description。
- [x] pending 候選固定記錄 `trigger＋taskId＋sourceKind`；到時後從同一 trigger 重解，DOM row reuse、ID／來源改變、
  attribute 移除或內容變空都取消，不得顯示 stale card。
- [x] 唯一例外為行事曆訂閱預覽：可使用已載入 event node 的
  `data-task-description-hover-content` 純文字快照；該值即使為空也優先，不 fallback store。
- [x] 訂閱 hover 的 `data-task-id` 固定使用 `event.node.id`，不得取代或重用既有可能含 storage ID 的
  `data-preview-event-task-id`；SPEC-045 preview／feed identity 不變。
- [x] RAG task citation、mention 或 link 的 source ID 不在目前 store 時安靜 no-op；不得 fetch、用 title 冒充、
  顯示 stale description 或擴充 RAG contract。
- [x] 穩定標題槽位沿用共用 9px／11px 非互動 indicator；inline mention 不新增 indicator，避免文流與序列化漂移。
- [x] 移除指定 DOM `title`，保留 `aria-label`、role、focus、序列化 `data-title`、資料 prop 與操作型 tooltip。
- [x] 回收桶只在任務名稱／父任務 identity zone 觸發；紀錄 link 只在 icon＋名稱 identity zone 觸發。restore、
  delete、role select 與 action controls 不得啟動或保留說明卡。
- [x] 無 schema、migration、API、provider、permission、transaction、RAG payload 或 persisted state 變更；ADR 不需要。

### 工作包與實作順序

1. `WP-114-A Controller`：中央雙來源 resolver、兩次重讀、stale guard、static verifier 骨架。
2. `WP-114-B Store-backed surfaces`：工作台、回收桶／紀錄精準 identity zones、mention、RAG task citation 與 native title 清理。
3. `WP-114-C Subscription snapshot`：行事曆訂閱預覽的唯一 inline-content path 與 indicator。
4. `WP-114-D Explicit exclusions`：TaskDetails／MindMap title 清理、current-title 排除與 action tooltip 守門。
5. `WP-114-E Task Details surfaces`：接入 ancestor breadcrumb／scoped checklist metadata，並以高於 modal 的 layer
   完成可見性證據。
6. `WP-114-F Verification`：凍結 candidate，執行 DEV-114、DEV-111、DEV-028、DEV-098 gates 與文件收斂。

A 必須先於 B／C；B、C 可分開實作；D 完成後才可 candidate freeze；E 期間不得持續改功能碼後仍宣告 PASS。

### File Surface

- 必改：`TaskDescriptionHoverCard.tsx`、`TaskWorkbenchPanel.tsx`、`RecycleBinView.tsx`、
  `Records/RecordSidebar.tsx`、`Records/TaskMentionNode.ts`、`Rag/CitationCard.tsx`、
  `CalendarSubscriptionBuilderPreview.tsx`、`TaskDetailsModal.tsx`、`MindMap/MindMapNode.tsx`、`package.json`。
- 實作期新增：`scripts/verify-dev-114-task-description-global-surfaces.ts`、
  `scripts/verify-dev-114-task-description-global-surfaces-browser.pw.js`。
- Protected no-change：`MainLayout.tsx`、`TaskDescriptionIndicator.tsx`、`TaskDetailsSubtaskSection.tsx`；
  `Wbs/TaskChecklistTree.tsx` 僅允許 Task Details scoped metadata extension；`services/rag/ragContract.ts`、`store/useRagStore.ts`、backend／schema／migration／
  permissions，以及 DEV-111 歷史 QA/QC 結果。

### Acceptance Contract

- [x] 19 個「套用」位置在 fine pointer 持續停留同一任務 1000ms 後，只顯示該任務非空說明。
- [x] 說明卡沒有任務名稱、「任務說明」標籤、helper、placeholder 或第二套自動 tooltip。
- [x] 一般入口使用最新 store description；訂閱預覽使用最新 inline snapshot，且 inline 值優先。
- [x] 空白、缺來源、stale identity、DOM row reuse 或 source-kind 改變時不顯示 card／indicator，也不 fallback 名稱或其他任務內容。
- [x] 訂閱 hover 使用 canonical `event.node.id`，既有 preview event ID、filter、payload 與 ICS feed 行為不變。
- [x] 穩定標題槽位顯示共用 indicator；inline mention 不新增 indicator。
- [x] 指定名稱／位置 native `title` 已移除；操作 tooltip、popover、accessible name、focus 與序列化仍有效。
- [x] 回收桶／紀錄 action controls 不會啟動或保留說明卡；其 action tooltip、keyboard 與 click 行為仍有效。
- [x] 任務詳情目前標題、mobile／touch 及其他排除位置不啟動說明 hover；ancestor breadcrumb 與子任務列可觸發。
- [x] Escape、leave、scroll、resize、blur、visibility、pointer down、drag start 後沒有 stale card。
- [x] click、double-click、details、selection、context menu、drag、restore／delete、citation navigation、mention
  serialization 與既有五模式無回歸。
- [x] 1440×900、1024×768、390×844 實瀏覽器證據通過；無 overflow、visible error、console/page error、
  載入失敗、錯誤空態或非預期 4xx／5xx。
- [x] static/browser DEV-114、DEV-111、DEV-028、DEV-039 placement lanes、DEV-045 builder、DEV-088 lifecycle、
  DEV-098、DEV-006 editor、DEV-107 layout，以及 DEV-002 static、ESLint、TypeScript、build 與 diff check 通過。

### Entry、Evidence 與停止條件

- Entry：RD 先把 HEAD／working tree 與本 source revision 對照；目標檔或 identity contract 漂移須記錄並重新審查。
- Drift review：架構定案期間 `TaskDetailsModal.tsx` 新增同期「回到上一階任務」控制；判定與本期相容，其
  操作型 `title`／`aria-label`／navigation 必須保留，不得納入名稱 tooltip 清理。
- Reproducible baseline：review 前 `TaskDetailsModal.tsx` SHA-256=`6338E9D6E24265307FF7BE8D25501FE39025A5DEAB023594A19F4F6F69CC0406`；
  amendment candidate SHA-256=`517071B7C143555DBD59129349FE63641F23264A40966F769BE8A4D187088151`（名稱 title 清理＋breadcrumb metadata）；
  TaskChecklistTree candidate SHA-256=`883A848ECCACE32B6032D7A68696909E7EE9B4565722B29DAFB1825439FCFDCA`；protected `TaskDetailsSubtaskSection.tsx`
  SHA-256=`87C33BDE68D565B3E3E7B6E8FED4DA8E22785DB2A909ACE548F786EBC105E4D5`。
- Evidence：`QA-DEV-114`；browser artifacts 固定在
  `output/playwright/dev-114-task-description-global-surfaces/`，記錄 route、viewport、fixture 與 timing。
- Runtime：沿用固定 `npm run dev:local`／`http://localhost:4000`；若需新啟動，必須記錄 PID tree／port／cleanup，
  完成後只停止本任務擁有的 runtime 並確認 port 釋放。
- Stop：無 canonical task ID、需新增 fetch／API／schema／權限、需修改 protected zone、accessible name 會遺失、
  direct module regression 無法歸因，或出現錯任務／跨 workspace／資料寫入風險時立即停下回報 PM。
- Model discretion：可微調 helper 名稱、attribute 落點與 fixture 組織；不得新增標籤、第二 overlay、mobile gesture、
  fallback 文案、RAG payload、hover-time fetch 或跨板權限。

### 限制、依賴與 Release Boundary

- 跨看板 AI citation 若未載入目前 store，本期明確不顯示；若未來要求完整支援，另建 DEV 處理 citation scope、
  data contract 與 reindex，不在本期隱性擴張。
- Spec Impact：`Intentional replacement + compatible extension`；SPEC-111 已加入 DEV-114 amendment，歷史 PASS 不回寫。
- `RD Implementation Complete／架構已定案` 代表本地 candidate 已完成並通過 DEV-114 與 compatible regression；仍不代表
  commit、push、deploy 或 release。若要納入正式版本，另走 deployment/release gate。

### 變更紀錄

- 2026-09-09：依使用者逐項 annotation 與補充要求建立 Brief；固定全位置矩陣、mobile／touch 排除、
  任務詳情標題／麵包屑排除，以及重複任務名稱／位置 native tooltip 清理範圍。
- 2026-09-09：一次升級至 `RD Implementation Ready／架構已定案`；完成雙來源 resolver、缺資料策略、indicator
  決策、file/no-change boundary、工作包、QA Plan、evidence 與 stop conditions。產品實作仍未開始。
- 2026-09-09：RD Tech Lead Review PASS；以最小修正補齊 candidate identity guard、精準 trigger ownership、
  canonical preview ID、直接模組回歸與 working-tree hash baseline。架構維持單例且無過度設計。
- 2026-09-09：完成 WP-114-A→E；DEV-114 static 27/27、browser B01～B26 26/26（含 1440×900／1024×768／390×844）、
  compatible static／browser、工程 gates PASS。DEV-111 verifier 已相容新 `HoverCandidate` resolver；DEV-039／DEV-002 verifier
  已同步目前已定案契約。本 DEV 標記完成，正式版本仍維持 NOT RELEASED，等待 deployment/release gate。
- 2026-09-10：依瀏覽器 annotation 將 Task Details ancestor breadcrumb 納入，並為 scoped checklist rows 補 canonical
  `taskId`／trigger metadata；將共用卡提升至 `z-[10050]`，修正 modal layer 下卡片不可見。DEV-114 static 29/29、
  browser 27/27（B01～B26＋B02a）PASS；Task Details screenshot、mobile/coarse no-op 與既有 control 邊界同步驗證。

使用思考習慣：#系統描繪、#差距分析、#可驗證性

## DEV-115：空白任務建立契約與任務說明污染修正

- 狀態：`RD Implementation Complete / Tech Lead Optimized / Targeted QA-QC PASS / NOT RELEASED`
- 開發文件成熟度：`RD Implementation Ready`
- 架構定案：`已定案（2026-09-09 Architecture Closure Review）`
- 架構決策：`ADR-048 Accepted / Architecture Confirmed`
- 節點類型：交付點
- 父交付點：無
- 是否計入產品交付完成：是（Local implementation 與 targeted QA-QC 完成；正式 release 另走 deployment/release gate）
- 原始需求邊界：使用者回報部分新增入口把「新任務」預填進任務說明，要求查明範圍，並要求從
  長期多閱讀模式成長角度審視共用元件；2026-09-09 明確要求制定 CAPA。
- Authoritative CAPA：`ai-doc/reports/CAPA-20260909-blank-task-description-prefill.md`
- Architecture Memory Source：`ai-doc/decisions/ADR-048-blank-task-creation-contract.md`
- Authoritative SPEC：`ai-doc/specs/SPEC-115-blank-task-creation-contract.md`
- QA authority：`ai-doc/qa/QA-DEV-115-blank-task-creation-contract.md`
- Source revision：branch `持續優化3`、HEAD `1b6450355ed81180c5abd419ac756564cff1b3c0` + SPEC-115
  working-tree SHA-256 manifest；hash drift 先分 `unrelated`／`contract`，不得為符合 hash 回復 user-owned change
- 相容基線：DEV-039、DEV-070、DEV-111、DEV-114、ADR-043、ADR-046
- 風險等級：Medium（跨模式 task creation payload 與持久內容；無 schema／migration／permission 變更）

### 任務目標

停止工作台新任務把顯示預設名稱保存為任務說明，並建立可供未來閱讀模式重用的空白任務 domain
creation contract。完成後所有現有空白建立點都產生 absent description；有來源內容的 capture／clone／import
則保留各自語意與資料，不因共用化而遺失。

### 開發範圍

- [x] WP-115-1 Guard + factory：分類 source drift，建立 11-entry known manifest、repo heuristic、failing guard
  與 `createBlankTaskNode()` pure contract。
- [x] WP-115-2 Atomic migration：同一 candidate 遷移 7 檔 11 點；保留各模式 ID、parent、order、permission、
  nodeType、addNode 與 post-create ownership，source-derived flows 不接 blank factory。
- [x] WP-115-3 Verification + convergence：凍結 candidate，依 QA-DEV-115 執行 layered QA、targeted independent
  QC 與文件回寫；只有經 release gate 才可部署。

### 明確排除

- 不把各模式新增按鈕、版面、placement/order、permission 或 navigation 合併成 mega React component。
- 不把 capture、clone、import、backup restore 接到 blank factory；來源內容不得為了共用率被清空。
- 不把 modal／hover 改成忽略「新任務」字串，也不自動刪除既有相同 description。
- 不在本 DEV 順手改 schema、migration、RLS、provider 或 DEV-070 全部 interaction migration。

### 驗收標準

- [x] 工作台空白新增的 title 是「新任務」，description absent；detail、關閉重開與 reload 後都空白。
- [x] rename title 不會同步 description；空白說明沒有 indicator，fine pointer 停留 1000ms 不開 hover。
- [x] 11 個已知 construction points 全數使用 shared factory；repo heuristic 沒有未分類 blank candidate。
- [x] 快速收件 note、clone、import 與 backup round-trip 保留既有 description 語意。
- [x] 11 點 adapter mapping 與 task placement、permission、undo、activity、naming、details navigation、
  post-create profile 無回歸。
- [ ] 工作台跑完整 store/reload/rename/hover；其他模式跑風險導向代表 UI。1440×900 已通過；390×844 與
  permission-denied fixture 保留 release/QC gate；本期不改 layout，只有實際觸及 markup/layout 才重開 1024×768 Gate。
- [x] TypeScript、targeted lint、test build、DEV-039、DEV-111、DEV-114 targeted regression PASS。

### RD 執行計畫

1. 重算 baseline 並分類 drift；建立 failing guard、known manifest／repo heuristic 與純 factory。
2. 在同一 candidate 原子遷移 11 點；不得只修工作台後保留雙軌並宣稱完成。
3. 凍結 candidate，依 QA-DEV-115 分層驗證與 targeted QC 後回寫文件。歷史 dry-run 留在 CAPA-002，
   production mutation 或 release 需另外授權與 gate。

### 架構定案交接

- [x] 真正共用單元是 blank task domain factory，不是新增任務 UI 元件。
- [x] factory 擁有 canonical blank defaults；surface 擁有 ID、scope、parent、order、nodeType 與互動。
- [x] `addNode()` 繼續擁有 persistence／undo／activity；`task.post-create` 繼續擁有 naming/navigation policy。
- [x] taskWorkbench 保留 unplaced normalization、專用 ID 與遠端同步。
- [x] capture／clone／import 是不同 creation kind，禁止隱性 fallback 到 blank contract。
- [x] new-mode registration 必須聲明 creation adapter；TaskInteractionScope fail-closed debt 留在 DEV-070 相容邊界。
- [x] 已對 actual repo、schema、store、interaction、TaskDetails 與 hover 完成 Architecture Closure Review；P0／P1
  unresolved architecture blocker=0。
- [x] 已固定 factory API、7 檔 11 點責任、protected zones、work packages、QA evidence、實作裁量與 stop conditions。
- [x] RD 進場時重算 SPEC-115 baseline hashes 並分類；只有 constructor／creation-kind／ownership 的 contract drift
  才停止重審，unrelated drift 不得被回復或誤當 blocker。

實作模型可自行決定測試 helper、局部命名與 import cleanup；不得改 factory path/purpose、`description?: never`、
11 點範圍、mode-owned placement/permission/post-create、source-derived creation、schema/provider/interaction 或歷史資料。

### 驗證計畫與結果

- [x] Pure：blank factory output 沒有 own `description` property，輸入型別不接受 description。
- [x] Source/adapter：11 個 known manifest entries 全數 import shared factory；repo heuristic 無未分類候選；
  caller-owned mapping 未漂移。
- [x] Browser：工作台完成 create→detail→close/reopen→reload→rename→hover；其他模式依 QA-DEV-115 做
  代表性 adapter smoke，不重複完整生命週期。
- [x] Source-derived：quick-capture 有 note／無 note、clone、import 與 backup regression PASS。
- [x] Independent QC：核對 store、persisted readback、可見 UI、console/page error 與 artifact identity。
- [ ] Effectiveness（CAPA-002／release lane）：release smoke 與 T+7 read-only audit；不阻擋 DEV-115 local done，
  任何歷史修復另立 capsule。

### 實作證據（2026-09-10）

- `src/features/taskCreation/createBlankTaskNode.ts`：blank payload 的唯一 domain factory；`description?: never`，output
  不建立 own `description`。
- 7 檔 11 點 constructor migration：`placement` 1、`BoardView` 1、`WbsListView` 1、`SharedTaskSidebar` 2、
  `GlobalContextMenu` 3、`taskDragCommit` 2、`MindMap` 1。
- Static：`npm run verify:dev-115-blank-task-creation` PASS 17/17。
- Browser：`output/playwright/dev-115-blank-task-creation/result.json` PASS B01～B09；B01 包含 store／reload／rename／hover
  negative，B02～B06 覆蓋 Board、context、Gantt、Calendar、MindMap；B07～B09 error sweep=0。
- Compatible／engineering：DEV-039 33/33、DEV-111 38/38、DEV-114 27/27、DEV-028 48/48、DEV-098 10/10、DEV-013 PASS、
  DEV-047 30/30；TypeScript、targeted ESLint、`build:test`、`git diff --check` PASS。
- Runtime reused：localhost:4000 matching listener PID 28532／wrapper PID 3264；未停止非本任務 runtime。
- 未宣稱：permission-denied、390×844、production smoke、historical dry-run 與 CAPA E-02／E-03，均保留各自 gate。

### Stop Conditions

- factory 需要知道 React state、DOM、current view、permission、remote provider 或 navigation。
- 既有特殊 ID／placement／nodeType 行為無法保持，或要修改 schema／權限才能完成。
- capture／clone／import regression 出現內容遺失，或測試只能檢查 placeholder 而無 store/readback。
- source 差異改變 constructor count、creation-kind 或 ownership；單純 hash 不同但 contract 未漂移不構成停止條件。

### 相關文件

- CAPA：`ai-doc/reports/CAPA-20260909-blank-task-description-prefill.md`
- Register：`ai-doc/reports/CAPA-Register.md`
- Architecture：`ai-doc/decisions/ADR-048-blank-task-creation-contract.md`
- Implementation SPEC：`ai-doc/specs/SPEC-115-blank-task-creation-contract.md`
- QA plan：`ai-doc/qa/QA-DEV-115-blank-task-creation-contract.md`
- 互動／identity：`ai-doc/decisions/ADR-043-cross-mode-interaction-policy-kernel.md`、
  `ai-doc/decisions/ADR-046-task-identity-and-placement-projection.md`
- 相容規格：`ai-doc/specs/SPEC-070-cross-mode-interaction-policy-kernel.md`、
  `ai-doc/specs/SPEC-111-task-description-hover-card.md`、`ai-doc/specs/SPEC-114-task-description-global-surfaces.md`

### 變更紀錄

- 2026-09-09：依 CAPA-002 建立 DEV-115；完成 RD Contract Ready、ADR-048、11-point scope、
  AC、工作包、QA/QC 與 stop conditions。產品程式尚未修改。
- 2026-09-09：完成 SPEC-115、QA-DEV-115、source/hash baseline 與 Architecture Closure Review；升級為
  `RD Implementation Ready / 架構已定案 / 可執行`。產品程式與 QA/QC 尚未開始。
- 2026-09-09：RD Tech Lead 優化：五個工作包收斂為三個；11 點 source/adapter 全覆蓋、browser 風險抽樣；
  hash 採語意 drift 分類；歷史資料 dry-run 移回 CAPA-002。架構與產品 scope 不變。
- 2026-09-10：完成 DEV-115 WP-115-1～3；新增 shared blank-task factory、遷移 7 檔 11 點、完成 static／browser
  verifier 與 targeted QA/QC。狀態更新為 `RD Implementation Complete / Targeted QA-QC PASS / NOT RELEASED`；
  permission／mobile／release／effectiveness gate 保留。

使用思考習慣：#系統描繪、#效用理論、#可驗證性

## DEV-116：全層級目標模式與自適應留白閱讀

- 狀態：`Interaction parity implemented / Targeted QA-QC PASS / NOT RELEASED`
- 開發文件成熟度：`RD Implementation Ready / Implemented`
- 架構定案：`已定案`
- 技術主管審查：`R2 PASS`
- 節點類型：交付點
- 父交付點：無
- 是否計入產品交付完成：是（產品實作與 QA/QC 通過後才完成）
- 原始需求邊界：使用者要推行 OKR 文化，希望閱讀主畫面不只呈現待辦與時間，也能直接看見任務目標、
  方向及過去決策；後續明確要求所有任務層級保有相同資料與編輯自由、空白欄位自動讓出版面，並移除
  列內「＋說明／＋紀錄」快捷功能。
- 來源 ID：`USER-20260909-OKR-GOAL-MODE-ADAPTIVE-SPARSE-LAYOUT`、
  `USER-20260910-REMOVE-INLINE-ADD-DESCRIPTION-RECORD-ACTIONS`、
  `USER-20260910-DEV116-MOBILE-RECORD-LAYER-DECISIONS`、
   `USER-20260910-DEV116-RD-CONTRACT-UPGRADE`、
   `USER-20260910-DEV116-ARCHITECTURE-CONFIRMATION`、
   `USER-20260910-GOAL-LIST-TASK-CAPABILITY-PARITY`、
   `USER-20260910-GOAL-BOARD-CONTEXT-MENU-PARITY`
- 風險等級：Medium（新增使用者入口、閱讀模式、跨層級資料投影、inline mutation、DnD、狀態相容與可存取性）

### 問題與使用者價值

目前看板、清單、心智圖、甘特圖與日曆主要以待辦、狀態及時間為閱讀焦點。任務目的已存在
`TaskNode.description`，會議決策亦可透過既有任務關聯資料取得，但使用者通常要 hover 或打開任務詳情，
無法在主畫面快速回答「我們為什麼做、方向是什麼、先前決定了什麼」。

DEV-116 的價值不是新增一套 OKR 資料庫，而是把既有資訊重新編排成可掃描的「目標模式」：所有層級
都能呈現自己的內容；沒有內容時不顯示 placeholder、不保留高列，讓有限畫面優先服務有決策價值的資訊。

### 已確認產品決策

1. L1、L2、L3+ 都有相同的任務說明、會議紀錄與既有編輯能力；層級只表達脈絡，不決定欄位資格。
2. 第一版直接使用既有「任務說明」，不要求新增 Objective、KR、Purpose、分數或必填格式。
3. 任務說明與會議紀錄都不是必填；trim 後為空或資料 absent 時，不顯示 placeholder、空框、空標題或
   固定高度。
4. 父層有內容且連續可見子孫在同一欄位沒有自己的內容時，父層內容可以類似 Excel 合併儲存格的方式
   視覺跨列使用空間；這只是 presentation，不代表子任務繼承、複製或保存父層資料。
5. 任一子任務在該欄位有自己的內容時，必須顯示自己的內容並中斷該欄跨列；任務說明與會議紀錄
   兩欄各自獨立判斷。
6. 空白任務列不提供「＋說明／＋紀錄」；仍顯示任務名稱、階層、已啟用標籤及可用planning欄位；進度條／百分比只在清單模式顯示。
7. 任務名稱、任務目的與會議內容編輯仍走既有詳情／會議流程；負責人、狀態、日期、工期與primary placement
   拖曳可在Goal依既有permission guard操作，不因層級或視覺跨列受限。
8. 第一版不開放手機「目標模式」入口；維持現行 mobile board-only navigation contract，不把桌機合併表格
   壓縮或改造成手機版。
9. 主畫面會議欄投影 exact workspace × board scope 內全部具明確 provenance 的人工會議補記；所有其他
   task-linked records 維持由既有紀錄庫按需查閱的次要資訊層，不進入目標模式主表格。

### Current phase scope normalization

1. 目標模式主畫面的會議欄保留每任務全部合格 DEV-108 entries，依 `(occurredAt, recordId, entryId)` 排序；
   在 owner cell 的 `rowSpan × 32px` 高度不足時，使用欄內 Y 軸捲動，不顯示「其餘 N 筆」或列內展開。
   Task Details 的 latest-3／展開全部與紀錄庫查閱契約不變。
2. 第一版只呈現 active board 的 canonical primary placements。tracking references 在既有模式照常存在，
   但不進入目標模式，避免在沒有 source-board record contract 下顯示不完整或越權的會議資訊。
3. 2026-09-10 最新使用者決策有意取代先前排除邊界：`goal`加入DEV-117 `MEETING_CONTINUITY_VIEWS`；
   從目標模式開始會議、live switch與recovery均保留goal，並沿用同一meeting session。
4. 最新互動決策再取代details-only／0 task write／no-DnD邊界：Goal保留標籤並開放既有planning controls及
   desktop primary placement拖曳；進度條／百分比維持List。使用者明確說明這些能力不需抽成共用元件；只共用階層縮排。
5. 最新右鍵決策再取代goal context-menu disabled邊界：OKR任務名稱區右鍵／`Shift+F10`與Board共用同一
   `GlobalContextMenu`／`TaskActionMenu`、profile、catalog／guards／commands；不複製menu或改permission model。
6. 上述項目是第一版可逆工程／UX 邊界，不覆蓋使用者已確認的全層級欄位與編輯自由；若要擴張，
   依各段 re-entry trigger 回到產品規劃。

### Spec Impact Preflight

分類：`Intentional replacement / interaction amendment implemented`。

- `SPEC-111／DEV-111`：使用者先前撤回「在既有任務列直接常駐說明」只適用原五種閱讀模式；本次新指令
  明確新增目標模式，僅在該模式直接顯示內容。既有模式的 1000ms hover、indicator 與歷史 PASS 不回寫。
- `SPEC-114／DEV-114`：目標模式若直接顯示同一任務說明，該可見內容區不得再觸發重複 hover；其餘
  canonical task surfaces、單例 controller、identity 與 touch 排除契約維持。
- `SPEC-108／DEV-108`：主畫面重用具有明確 provenance 的人工會議補記投影，保留每任務全部 persisted、
  non-archived entries；Task Details 原有 include-archived、latest-3 與展開全部不變；
  其他 task-linked records 維持既有紀錄庫次要查閱，已退場的 `TaskRecordTimeline` 不得暗中恢復。
- `SPEC-115／DEV-115`：空白任務的 description absent 是合法正常狀態；DEV-116 必須原生處理，不得以
  title、placeholder 或預設文案補值。
- `SPEC-039／DEV-039`：目標模式應沿用目前看板、工作區、帳號及 task placement／filter 邊界，不得擴大
  可見資料範圍。
- `SPEC-070／DEV-070`：新增 host mode 時須登錄稀疏 mode profile／surface identity；不得複製整份 handler
  或繞過既有 click、details、permission、selection 與 transient-owner guard。
- `SPEC-095／DEV-095`：tracking reference 的 canonical identity 與既有模式能力不變；第一版目標模式不投影
  tracking placements，也不因此修改 reference schema、derived read 或 source-board permission。
- `ADR-049／SPEC-117／DEV-117`：最新intentional replacement把`goal`加入meeting continuity allowlist；
  從goal開始會議、live meeting與recovery都可停留或切入goal。

### UX Intent

- 任務／結果：管理者與執行者在同一主畫面辨識目標、方向、近期決議及其下層行動。
- 主物件／主焦點：目前看板的可見任務樹；唯一主判斷是「目標與行動是否一致」。
- 預設刪除：空欄、空標題、placeholder、額外說明卡、列內新增按鈕、重複任務說明 hover 與裝飾 badge。
- 保留舉證：任務名稱、階層、狀態及負責人用於辨識責任；父層內容所有權需有非顏色視覺錨點，避免
  使用者把跨列內容誤認為子任務自己的資料。
- 非語言修復：以縮短列高、縮排、連續邊界、位置及父層錨點表達空白與跨列，不以 helper 補救結構。
- 風險與驗證：資料所有權誤判、filter／collapse 後錯誤跨列、每列各自載入造成 N+1、手機或 live meeting
  誤出現未開放入口、鍵盤／screen reader 表格關聯、選取區被跨列遮住及大量任務重算效能。

### 第一版主要流程

1. 桌機使用者在已有權限且已選定工作區／看板的正常畫面，打開既有 topbar「視角」選單。
2. 選擇「OKR模式」，系統使用 active board 已載入的 canonical primary task tree 與現行 filter；不另建
   per-row task／record request。
3. 桌機以階層表格呈現「任務與層級、任務目的、會議紀錄、狀態與負責人」；會議欄從目前看板
   已載入 records 一次建立 task index，每任務顯示全部合格 DEV-108 人工補記，超出 owner cell 高度時於欄內捲動。
4. 有內容的任務直接顯示自己的摘要；沒有內容的任務縮成最小列。父層內容只在同一分支、同一欄位的
   連續空白子孫範圍內視覺跨列。
5. 使用者點擊任何層級的任務辨識區，沿用既有任務詳情入口；新增、編輯與保存仍由既有流程負責。
6. 使用者在任務名稱區按右鍵或`Shift+F10`，由DEV-070 binding開啟與Board相同的全域task menu；權限及動作
   仍由既有guards／commands處理。
7. 使用者切換、搜尋、篩選、收合或資料更新時，欄位可見性與跨列依目前可見樹重新計算，不保留 stale span。
8. 從目標模式點「新增會議記錄」時保留goal並啟動既有meeting；live meeting期間的視角選單顯示OKR模式，
   可切入／切出且不新增說明訊息或第二個狀態列。

### Current Phase Scope

- [x] 在既有「視角」選單新增「OKR模式」入口；沿用既有切換、Escape焦點返回與 current-view 管理。
- [x] 新增primary task tree projection，不建立第二份任務、任務說明或會議紀錄資料；Task Details入口維持既有command。
- [x] 所有層級使用相同行為矩陣，不以 `level` 決定任務目的、會議紀錄或planning controls資格。
- [x] 依欄位獨立實作 sparse layout：own content 優先、只跨連續可見 descendant blanks、不得跨 branch。
- [x] 可見任務全部沒有任務目的或合格會議補記時，移除相對應整欄與欄名；只有一個內容欄存在時，
      將可用內容寬度分配給該欄，兩欄皆空時只保留任務、狀態與負責人骨架。
- [x] 空白任務採最小列高並保留identity、階層、標籤與planning controls；不渲染列內新增 action；進度條／百分比只由List顯示。
- [x] List／Goal共用layout-neutral階層縮排與展開元件；Goal自行組裝標籤、欄位控制及desktop DnD，List保留進度指示。
- [x] 依既有permission guard在Goal編輯負責人、狀態、日期與工期；purpose／meeting仍由既有流程維護。
- [x] 主畫面會議欄一次消費 active board 已載入 records，依 DEV-108 provenance／invariant 建立 all-entry task index，
      每任務保留全部有效補記並在 owner cell 內以 Y 軸捲動承接；其他 task-linked records 不進主表格，維持由既有紀錄庫按需查閱。
- [x] OKR 與 Task Details 共用無狀態 `MeetingQuickNoteRows`（日期＋內容）；各 surface 自行維持捲動、展開與新增邊界。
- [x] 備註欄與 Task Details 會議歷程共用 `TaskNoteContentSurface` 的框線、圓角、內距與 scrollbar 視覺表面；編輯／唯讀語意分離。
- [x] 將goal登錄為DEV-070 host profile；task identity提供Details，任務名稱區右鍵／`Shift+F10`與Board共用
      profile及既有全域task menu；desktop primary placement拖曳由既有sortable與permission primitive處理，
      重複description hover仍排除。
- [x] 落實 DEV-117 continuity：goal加入meeting continuity，meeting start／recovery保留goal且live option可用；
      必須由同一 view policy 決定，不在 UI 各寫一份 allowlist。
- [x] 完成載入、正常、空白、filter、collapse、desktop窄版、390 mobile negative及會議continuity的targeted gates；
      1024／200% zoom、viewer、500-row與實機mobile完整矩陣保留給release gate。

### 明確排除

- 不新增結構化 OKR／Objective／KR 欄位、進度計分、對齊關係、必填規則或層級繼承。
- 不修改任務說明與會議紀錄的既有 editor、schema、migration、provider、RLS／權限或保存流程。
- 不把父層文字寫入子任務，不建立快照副本，不在匯出資料中產生「合併儲存格」語意。
- 不新增「＋說明／＋紀錄」快捷按鈕、空白提示、教學卡或第二套 detail drawer。
- 不在第一版開放手機目標模式；手機維持現行 board-only navigation 與既有閱讀流程。
- 第一版支援goal的desktop live meeting continuity；不改DEV-117既有session、sidebar或capture contract。
- 不在第一版投影 tracking references；不查詢 source board meeting record，也不改 DEV-095 identity／permission。
- 不在主畫面聚合全文會議記錄、一般 task-linked records、RAG 摘要、AI 自動判讀或跨看板紀錄。
- 不在第一版新增完整 task-linked records 次要聚合畫面；若要建立，列為
  `Future Phase Captured / Not Requested`，須先定義入口、資料、排序、封存與權限契約。
- 本文件不授權修改產品程式、建立 release candidate、push、deploy 或 release。

### 自適應跨列行為契約

| 情境 | 任務說明欄 | 會議補記欄 | 任務列 |
|---|---|---|---|
| 任務兩欄都有 own content | 顯示本任務內容 | 顯示本任務內容 | 一般高度 |
| 只有任務說明 | 顯示本任務內容 | 可由最近祖先在連續空白範圍內跨列 | 依內容高度 |
| 只有會議紀錄 | 可由最近祖先在連續空白範圍內跨列 | 顯示本任務內容 | 依內容高度 |
| 兩欄都沒有 | 可由最近祖先分欄跨列 | 可由最近祖先分欄跨列 | 最小高度，只留 identity／狀態 |
| 父層也沒有該欄內容 | 不顯示 placeholder，不虛構內容 | 同左 | 維持最小列 |
| child own content 新增／刪除 | 立即中斷／重建該欄 span | 兩欄獨立 | 不 reload 另一份資料 |
| filter／search／collapse | 只依目前可見同分支重算 | 同左 | 不跨隱藏或不相干分支 |

跨列內容必須可由父層任務名稱、階層錨點或等效非顏色訊號辨識所有權；不得讓子任務列看起來擁有
父層文字，也不得擴張子任務的 hit target、keyboard order 或 editable cell boundary。

#### Pure sparse projection rule

令 `R` 為 filter 與 collapse 後，以 active board primary task tree 做 depth-first preorder 得到的可見列；
`D(r)` 為該列 task 自己 trim 後的 description，`M(r)` 為該 task 全部合格會議補記集合；集合只用於
判斷 owner presence，實際 entries 由 all-entry batch index 提供並依 deterministic order 呈現。

1. `D`、`M` 各自獨立。某欄在全部 `R` 都沒有 own content，且不處於 loading／error 時，整欄與欄名都不 render。
2. 兩內容欄都不存在時，畫面只保留任務／層級、狀態、負責人；只存在一欄時，該欄取得全部內容寬度。
3. 有 own content 的 row 是該欄的 owner。cell 可向後跨入連續可見且沒有同欄 own content 的 descendant rows；
   遇到第一筆同欄 own content、離開 owner subtree、branch 邊界或可見序列結束即停止。
4. owner content 只 render 一次，不得在 barrier 後複製以填滿不連續空白；後續無可合法承接者的空列維持最小高度。
5. description 與 meeting span 長度可不同；任一欄的 span 不得改變另一欄 content ownership 或 row click target。
6. filter、search、collapse、task update 或 record reload 只以最新 input 重算 pure projection；不得保存 rowSpan 到資料層、
   不得讓上一版 span 穿越到新可見樹。
7. 若可存取性驗證無法可靠表達跨列所有權，產品降級為「不跨列、欄位自動隱藏、空列最小化」；不得以
   錯誤的 table／tree semantics 換取視覺密度。

### Current Architecture Impact

- View state：在 `ViewMode`、App renderer、topbar option、Sidebar active-board 判斷、view persistence、local-test restore、
  PWA durable intent／owner manifest 增加 `goal`；desktop與live meeting可正常還原，mobile/coarse pointer仍
  fail closed 正規化為 `board`。desktop DnD啟用後，PWA `task-drag` owner surfaces涵蓋goal。
- View host：新增 `goal` host mode 與 `goal.row` surface，profile 把 primary／double／tap／Enter／Space 導向
  `task.open-details`；最新amendment讓goal與board直接指向同一profile，使secondary／Shift+F10走既有
  `task.open-menu`與`GlobalContextMenu`。Goal不掛`data-task-surface-source`，避免重複description hover；menu target
  由既有binding context擁有，不以`list`假冒、不複製menu handler／catalog／guard／command。
- Task projection：`GoalView` 只消費 `useWbsStore.nodes／parentNodesIndex`，以
  `projectTaskFilterResults(nodes, filters,{boardId})`取得visible IDs，再以`buildHierarchicalTaskItems`取得
  active-board primary DFS preorder與collapse；不使用
  `WbsListView` 的 tracking projection、不建立 task copy 或第二份 hierarchy authority。
- Record read state：現行 `loadRecords` 會在失敗後仍由 App `.finally()` 標成 loaded，且沒有 scope token／stale
  response guard。實作以單一discriminated `RecordListLoadState`取代泛用`loading`，另保留editor/action `error`；
  scope切換先清空，過期response不得覆蓋新board。`useMeetingDraftRecovery`、GoalView與既有record list consumers
  共用同一exact-scope truth，不再由App local state推測成功。
- Record projection：新增 DEV-108 canonical batch projector，對 exact workspace／board 的 persisted、non-archived
  meeting records 每 record 解析一次、一次建立 all-entry-by-task index；invalid source 隔離並回報 record ID，禁止
  每列 `listByNode`、includeArchived 或任何新增 provider request。
- Meeting policy：六模式allowlist與meeting lifecycle繼續由`useRecordStore.ts`擁有；private readonly set不外露，
  只export `isMeetingContinuityView()`供MainLayout使用。`goal`明確在allowlist。consumer數量不構成獨立
  responsibility，因此不新增policy module；這是ADR-049／SPEC-117相容amendment，不改session authority或snapshot schema。
- Layout：新增 `src/features/goalMode/projection.ts` 純 presentation projection，輸出每欄 owner／`rowSpan`／
  visible-column state；兩欄獨立，owner cell 只能向後跨連續可見、同 subtree 且無 own content 的 rows，遇 own
  content 或離開 subtree 永久停止，不複製 owner text。資料模型、parent、description、record metadata 與 task link
  均不寫回。
- Architecture Memory：不另建 ADR。SPEC-116 是本交付實作 authority；DEV-070、SPEC-108、ADR-049／SPEC-117
  分別治理 interaction、quick-note provenance 與 meeting view policy。本期是可逆 UI/read-model extension。

### Architecture Topology（已定案）

```text
ModeSwitcher(goal) -> useBoardStore.currentView -> App/TaskInteractionScope(goal)
                                            |
                                            v
                                        GoalView
                           ┌----------------┴----------------┐
                           v                                 v
useWbsStore.nodes -> task filter -> hierarchy rows   useRecordStore exact-scope records
                           |                                 |
                           |                     DEV-108 batch projector
                           └----------------┬----------------┘
                                            v
                              pure sparse/rowSpan projection
                                            |
                                            v
                            semantic table -> Task Details command

useRecordStore.isMeetingContinuityView -> start fallback / recovery normalization / live option set
```

依賴方向固定為 store／既有 pure utility → feature pure projector → `GoalView` presenter；component 不呼叫 provider，
projector 不讀 store，meeting policy 不依賴 React。任何反向依賴、第二份 allowlist 或 row-level service call 都是 drift。

### Data／API／Permission／State Contract

#### Task description

- 唯一來源是目前 primary task 的 `TaskNode.description`；只接受該 task own value，trim 後空字串視為 absent。
- 顯示保留原文字與換行，不使用 title、父層內容或預設文案補值；父層跨列只改 presentation ownership。
- 點擊task identity才進既有Task Details；任務目的本身不在Goal inline編輯，Goal只提供已確認的planning controls，
  並且不提供purpose／meeting新增按鈕。

#### Meeting records

- 輸入只使用 current workspace／board 已由 `recordService.listByProject` 載入 `useRecordStore.records` 的 persisted、
  non-archived records；只有`recordListLoad.status === 'ready'`且`scopeKey`等於current workspace／board key才是
  成功資料；不合併目前尚未保存的`useRecordStore.draft`。
- Eligibility：record type 必須為 `meeting`，DEV-108 `meetingTaskQuickNotes` v1 metadata 可辨識、aggregate invariant
  成立、entry `taskId` 等於 primary task id。Legacy 正文、AI、activity、一般 task link、RAG 與自由文字不得納入。
- 每 task 保留全部有效 entries，依 `(occurredAt, recordId, entryId)` 建立 deterministic 升冪順序。畫面逐列顯示
  `MM/DD + 原文`；owner cell 以 `rowSpan × 32px` 限制可視高度，超出時欄內 `overflow-y:auto`，不把 draft／published
  狀態改寫成「決議」語意。
- persisted draft 與 published record 都可顯示；archived record 只留在 DEV-108 Task Details／既有次要查閱契約，
  不進目標模式主畫面。save／archive／reload 後由 records reload 重新投影。
- Projection 必須先按 record 建立一次 task index；request count 不得隨可見 task row 數增加。

Canonical pure I/O 固定為：

```ts
type GoalRecordScope = Readonly<{ workspaceId: string; boardId: string }>;
type MeetingTaskQuickNoteIndex = Readonly<{
  byTaskId: ReadonlyMap<string, readonly MeetingTaskQuickNoteProjection[]>;
  invalidRecordIds: readonly string[];
}>;

projectMeetingTaskQuickNotesByTask(
  records: readonly EditableKnowledgeRecord[],
  scope: GoalRecordScope,
): MeetingTaskQuickNoteIndex;
```

Total order 由 `(occurredAt, recordId, entryId)` 由小至大比較後保留全部；`invalidRecordIds` 去重並以 record ID
排序，供單一欄級 partial-warning 舉證。單一 invalid record 不得抹除其他 valid records 的結果。

#### Exact-scope records load state

```ts
type RecordListLoadState =
  | Readonly<{ status: 'idle'; scopeKey: null; error: null }>
  | Readonly<{ status: 'loading'; scopeKey: string; error: null }>
  | Readonly<{ status: 'ready'; scopeKey: string; error: null }>
  | Readonly<{ status: 'error'; scopeKey: string; error: string }>;

recordListLoad: RecordListLoadState;
createRecordScopeKey(workspaceId: string, boardId: string): string;
loadRecords(workspaceId: string, boardId: string): Promise<void>;
resetRecordList(): void;
```

`createRecordScopeKey`以單一無歧義tuple encoding供store／App／Goal共用，不允許三處自行拼字串。

1. `loadRecords` start：增加module-local request sequence，`records=[]`、state=`loading(target)`；不得保留上一scope資料。
2. 最新request success：只在token仍current時commit records與state=`ready(target)`。
3. 最新request failure：records保持空、state=`error(target,message)`；不得寫入editor/action `error`，也不得把
   `.finally()`視為成功。
4. stale success／failure：不改 store；board A 慢回覆不得覆蓋 board B。
5. logout、workspace／board absent：App呼叫`resetRecordList()`，同時invalidate pending request並回到idle。
6. `useMeetingDraftRecovery.recordsLoaded` 只由 exact loaded truth 推導；Goal retry 只呼叫目前 exact scope 的
   `loadRecords`。此變更不改 provider、record schema、draft recovery snapshot 或保存行為。

#### API、permission 與 mutation

- API／provider：不新增 endpoint、schema、migration、metadata namespace 或跨看板 fetch；沿用現有
  `recordService.listByProject`、WBS store 與 filter store。
- Read permission：task 與 record 只使用目前登入者已能載入的 active workspace／board 資料；不得以 client
  projection 擴張 provider authorization、derived read 或 RLS。
- Edit permission：所有角色皆可在既有讀取權限內進入goal；Task Details與Goal planning controls分別沿用既有
  `canEditTask`／`canAssignTask`／`canMoveTask` guard。只有明確editor／DnD action可產生task write；Goal不產生
  record或task-link write。
- View persistence：`goal` 可寫入既有 view preference；登出、無 active board或mobile的fallback沿用現行
  navigation／SPEC-117 safety；active meeting保留goal，不新增跨帳號狀態。

#### Pure sparse layout I/O

```ts
type GoalProjectionInputRow = Readonly<{
  taskId: string;
  level: number;
  description: string | null;
  meeting: MeetingTaskQuickNoteProjection | null;
}>;
type GoalOwnedCell<T> = Readonly<{
  ownerTaskId: string;
  rowSpan: number;
  content: T;
}>;
type GoalProjectionRow = GoalProjectionInputRow & Readonly<{
  descriptionCell: GoalOwnedCell<string> | null | 'covered';
  meetingCell: GoalOwnedCell<MeetingTaskQuickNoteProjection> | null | 'covered';
}>;

buildGoalSparseProjection(rows: readonly GoalProjectionInputRow[]): Readonly<{
  rows: readonly GoalProjectionRow[];
  hasDescriptionColumn: boolean;
  hasMeetingColumn: boolean;
}>;
```

- `null` 表示此列在仍可見欄中需 render 結構性空 cell；`covered` 表示由前方 owner 的 native `rowSpan`
  覆蓋而不得再 render cell。輸入與輸出 immutable，時間 O(rows)，不得讀 store／DOM 或保存 span。
- 對 owner row `i`，最多跨到第一個 `level <= owner.level`、第一個該欄 own content 或序列尾端之前；
  owner subtree 內不同 child branches 若全為空，可連續跨越。遇 barrier 後不得在後段複製／恢復同一 owner。
- description trim 後為 null；meeting content 以 batch index presence 判斷。兩欄各自運算，不得互相借用 span。

#### Visible state contract

| State | Required UI | Forbidden interpretation |
|---|---|---|
| Task loading | 保留主區局部 skeleton／既有 loading state | 不顯示為真正空看板 |
| Task load error | 顯示既有可恢復錯誤；不 render stale tree | 不以舊節點冒充成功 |
| Records loading | 保留單一 meeting 欄 loading state；description 與 task tree 可先讀 | 不先判定整欄 absent 造成假空白 |
| Records load error | meeting 欄顯示一次最短錯誤與 retry；其他欄可用 | 不逐列重複錯誤、不把 error 當無紀錄 |
| Invalid quick-note source | 隔離 source，顯示一次 partial error | 不 silent reset、不顯示 stale metadata text |
| Filtered zero | 沿用既有 filter zero state／reset action | 不顯示新增目標說明或教學卡 |
| Both content columns absent | 移除兩欄與欄名，顯示 compact task skeleton | 不保留空框、placeholder、空工具列 |
| Permission denied | 顯示既有資料層錯誤或不可用狀態 | 不 fallback 到跨板／跨帳號 cache |

### RD Implementation Surface（Closed）

#### 新增

| File | 單一責任 | 不得承接 |
|---|---|---|
| `src/components/GoalView.tsx` | 組合active-board read model、semantic sparse table、planning controls、desktop DnD與既有menu intent binding；OKR不呈現進度條／百分比 | provider query、record save、schema、menu catalog／permission／command implementation |
| `src/components/TaskNotes/MeetingQuickNoteRows.tsx` | 提供 Task Details 與 OKR 共用的無狀態日期＋內容歷程列 | 捲動邊界、展開狀態、編輯／新增入口與資料載入 |
| `src/components/TaskNotes/TaskNoteContentSurface.tsx` | 提供備註欄與唯讀會議歷程共用的邊框、圓角、內距與 scrollbar 視覺表面 | 編輯器狀態、格式化、資料載入、會議補記語意 |
| `src/components/Wbs/TaskHierarchyIndentedRow.tsx` | List／Goal共用的layout-neutral縮排、disclosure slot與children slot | Grid／Table容器、store、progress、tag、editor或DnD commit |
| `src/features/goalMode/projection.ts` | O(rows) immutable sparse column／rowSpan projection | store、React、DOM、localStorage、record parsing |
| `scripts/verify-dev-116-goal-mode.ts` | pure／source／store state／manifest contract 與 JSON artifact | 假造 browser PASS、修改產品 |
| `scripts/verify-dev-116-goal-mode-browser.pw.js` | 正常入口、真實 rendered behavior、request/mutation/state/viewport evidence | direct store switch 取代正常 UI、production debug hook |
| `ai-doc/specs/SPEC-116-goal-mode-adaptive-sparse-reading.md` | Implementation authority | 完成宣告 |
| `ai-doc/qa/QA-DEV-116-goal-mode-adaptive-sparse-reading.md` | QA／QC evidence authority | 預填 PASS |

#### 修改

| File | Required change | Protected boundary |
|---|---|---|
| `src/types/index.ts` | `ViewMode` 加 `goal` | TaskNode／record schema不變 |
| `src/App.tsx` | lazy GoalView、`case 'goal'`、exact record scope truth、無 scope clear | 不改 providers／migration／global sidebar mount |
| `src/components/MainLayout.tsx` | Target icon option、desktop/task-filter/workspace lists、mobile block、live meeting option exclusion／normalization | 保留 DEV-042 topbar 與既有 ModeSwitcher component contract |
| `src/components/ui/ModeSwitcher.tsx` | 依使用者明示刪除可見標題列與關閉叉號；保留 aria menu name、Escape／outside／trigger close | 不改 option value、selection、portal positioning 或 disabled contract |
| `src/components/Sidebar.tsx` | board workspace view 判斷加 goal | 不改 board CRUD／drag／rename |
| `src/components/Records/RecordsView.tsx` | list loading/error改讀`RecordListLoadState` | 不改紀錄分類、入口或編輯流程 |
| `src/components/Records/RecordSidebar.tsx` | 最近紀錄區改讀list load state；editor/action error維持分離 | 不重做sidebar或meeting workflow |
| `src/store/useBoardStore.ts` | stored view、host/surface mapping加 goal | 不改 selection／context-menu／workspace transaction semantics |
| `src/store/useRecordStore.ts` | single record-list load state、stale token、reset；export既有meeting predicate供layout使用 | 不改 draft schema、save、archive、capture aggregate、provider API |
| `src/interactions/task/types.ts` | `TaskHostMode='goal'`、`goal.row` | action catalog不變 |
| `src/interactions/task/profiles.ts` | Board／Goal共用同一task profile；details與secondary／Shift+F10沿用既有resolver | 不複製 menu／mutation action，不改catalog／guards／commands |
| `src/interactions/task/TaskInteractionScope.tsx` | fallback mapping辨識 goal | hover controller契約不變 |
| `src/interactions/task/resolveTaskInteraction.ts` | known host modes加 goal | precedence／transient guard不變 |
| `src/utils/meetingTaskQuickNotes.ts` | exact-scope all-entry-by-task batch projector | DEV-108 per-task/include-archived projector不變 |
| `src/services/pwaReloadOwnerManifest.ts` | APP_SURFACES與task-drag surfaces加goal | owner數量／authority不變 |
| `src/services/pwaUpdateService.ts` | durable view intent allowlist加 goal | PWA transaction/reload safety不變 |
| `src/utils/localTestEnvironment.ts` | desktop test restore allowlist加 goal | production資料與 seed schema不變 |
| `scripts/verify-dev-039-task-filter-core.mjs` | task-filter view source assertion納入 goal | 既有五 view filter cases不放寬 |
| `scripts/verify-dev-117-cross-mode-meeting-continuity.ts` | store-owned exported policy、goal positive、recovery continuity assertions | 六模式 continuity acceptance |
| `package.json` | 登錄 DEV-116 static／browser commands | dependency與runtime scripts不變 |
| `ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、SPEC-117、ADR-049、QA-DEV-117 | maturity、store-owned-policy amendment、evidence／boundary同步 | 歷史 PASS／未實作事實不回寫 |
| `src/components/Wbs/WbsNodeItem.tsx` | List改用共用階層display primitive | List遞迴Grid、tracking與欄位控制不搬入shared component |
| `src/components/TaskAssignmentPicker.tsx` | 增加可選portal，使Table內浮層不被後續row遮蔽 | selection與permission semantics不變；List預設路徑不變 |
| `src/components/TaskNotes/TaskDetailNoteEditor.tsx` | 備註編輯器引用共用內容表面樣式來源 | Lexical editor、格式化、調高、保存與權限語意不變 |
| `src/components/TaskNotes/TaskMeetingQuickNoteSection.tsx` | 會議歷程容器改用共用 `TaskNoteContentSurface` | latest-3／展開／新增／封存語意不變 |

#### Inspect-only／禁止修改

- `src/components/TaskDetailsModal.tsx`、既有 TaskNotes editor 的資料／permission authority：保留 description／quick-note 編輯、格式化、
  高度與保存語意；僅允許引用共用內容表面。`TaskMeetingQuickNoteSection` 可消費共用列與內容表面元件，但不改其新增／展開／封存語意。
- `src/components/GlobalContextMenu.tsx`、task action catalog／executor：inspect-only且維持唯一authority；Goal只接入既有
  presenter／actions／guards，不修改其implementation或新增mode-specific mutation。
- `src/components/Wbs/WbsListView.tsx` 與 taskTracking feature：tracking reference current phase 排除。
- record provider adapters、schema／migration／RLS、recovery snapshot serializer、DEV-109 capture utilities、DEV-105 reservation presenters。
- `src/index.css` 預期不修改；以現有 tokens／局部 classes 完成。若無法在不新增全域 override 下符合 UI，先回報。

### RD Work Packages 與順序

1. **WP-116-A — Failing contracts**：先新增 static/pure verifier，鎖 ViewMode、scope loader、batch index、sparse
   barriers、goal profile、mobile negative／meeting continuity／PWA；確認 current candidate 因功能未存在而 fail。
2. **WP-116-B — Read authorities**：完成single record-list state／race invalidation、App recovery truth、既有list
   consumers、DEV-108 batch projector與store-owned exported meeting predicate；先跑pure/store cases。
3. **WP-116-C — Goal projection／interaction**：完成 sparse projector、goal types/profile/scope與 GoalView semantic table；
   初始candidate不接入DnD／inline edit／context menu；DnD與controls由WP-116-G取代，context menu排除再由WP-116-H取代；
   description hover source維持排除。
4. **WP-116-D — Navigation／compatibility**：接入 ViewMode、App、MainLayout、Sidebar、persistence、PWA／local-test；
   更新 DEV-039／117 verifier與 ADR/SPEC amendment；ModeSwitcher 僅套用後續使用者明示的最小降噪修改。
5. **WP-116-E — Candidate gate**：跑 DEV-116 static、直接受影響 regressions、TypeScript、targeted ESLint、
   `build:test`、owned diff／protected diff；全部通過才 freeze candidate。
6. **WP-116-F — Targeted QA/QC**：依 QA-DEV-116 從正常 topbar 入口做 browser evidence、a11y／visual、
   failure injection、request/mutation counters與 live meeting/mobile negative；QC 不得修改 candidate。
7. **WP-116-G — Interaction parity amendment**：抽出layout-neutral階層元件；Goal自行組裝標籤、planning
   controls、portal assignment與desktop DnD，List保留進度指示；更新PWA owner並重新執行static／browser／visual／regression gates。
8. **WP-116-H — Context-menu parity amendment**：Goal task-name identity接入既有`openMenu` binding；Board／Goal共用
   同一profile、全域presenter、catalog／guards／commands，驗證右鍵、`Shift+F10`、Escape及0 unintended write。

實作模型可自行決定：局部 component 切分、CSS class 組合、fixture 名稱、test helper、Map compare helper、
不改 I/O 的 internal type alias 與 import cleanup。

實作模型不得決定：改欄位資格、加入說明／紀錄inline action、把task-linked records拉回主表、開放手機／tracking、
改all-entry eligibility／order、允許stale records、改schema/API/permission、改Task Details、
改 sparse barrier／fallback 或覆寫 user-owned dirty changes。

第一個 source/file conflict、必須超出上表、需要修改 public API／schema／permission／recovery snapshot／跨模組
authority，或無法用正常入口驗證時，立即停止並回送 PM／規劃模型；不得自行重設架構。

### Acceptance Contract

- [x] 「視角」選單可發現並進入OKR模式；切回其他模式後目前看板、filter與canonical task值符合既有規則。
- [x] L1、L2、L3+ primary task都使用相同階層與欄位資格，並可由既有
      task identity 入口開啟詳情；同級與層級深度不改變欄位資格。
- [ ] description＋record、description-only、record-only、兩者皆空與父層皆空五種 fixture 符合上表。
- [ ] 兩筆以上連續空白 descendant 時，父層內容可使用其空間且所有權清楚；遇到 child own content、branch
  邊界、filter、search 或 collapse 即正確中斷／重算。
- [x] 空白任務不出現「尚無任務說明」、「尚無關聯紀錄」、空框、保留列高或「＋說明／＋紀錄」。
- [ ] 點擊空白任務仍能從既有 Task Details 編輯；儲存 own content 後返回目標模式，span 與內容立即更新。
- [ ] description 欄、meeting 欄、兩欄都沒有三種 board/filter fixture，分別得到一欄、另一欄與零內容欄；
      剩餘內容欄使用可用寬度，header、placeholder 與空 cell 不得殘留。
- [x] 每 task 顯示全部 persisted、non-archived、valid DEV-108 entries，依 occurredAt／recordId／entryId deterministic
      排序；owner cell 超出 `rowSpan × 32px` 時出現欄內Y軸捲動。active unsaved draft、archived、legacy、AI、activity、
      一般 task link、全文與 RAG 不出現。
- [ ] 一個 active board record load 支援全部可見 rows；fixture 增加 task 數時，record request count 不增加。
- [x] 所有 task-linked records 需查閱時走既有紀錄庫；主表格與 task row 不新增展開、計數、查看、
      「＋說明」或「＋紀錄」action。
- [x] 不修改 `TaskNode`／KnowledgeRecord schema、permission model或既有purpose／meeting editor；父層內容不寫入子任務。
- [x] Editor可在Goal依既有guard修改負責人、狀態、日期、工期及primary placement；List讀回同一canonical task。
      明確操作可產生task write，record／task-link write維持0。Viewer完整實機矩陣留在release gate。
- [ ] task／record loading、task error、record error、invalid quick-note、filtered zero 與 true empty 可區分；
      error 不得被欄位自動隱藏誤報為無資料，retry 成功後錯誤與 loading state 消失。
- [ ] tracking reference 不出現在第一版 goal；其既有模式 visibility、identity、permission 與互動不退化。
- [x] 非meeting與live meeting均可進goal；從goal開始meeting與persisted goal recovery保留goal，
      draft／segment／recovery identity不被破壞。
- [x] goal task identity提供Details與desktop DnD；planning controls可編輯，任務名稱區右鍵／`Shift+F10`開啟
      與Board相同的全域task menu，並沿用相同guards／commands。重複TaskDescriptionHoverCard維持排除；
      鍵盤Enter／Space與可見focus可進入同一Task Details。
- [ ] 1440×900、1024×768 沒有欄位重疊、stale span、水平 overflow 或重要文字不可讀。
- [ ] 200% zoom由1440×900 desktop goal起點執行；表格仍可讀且focus可達，不以預先窄CSS viewport誤測成mobile fallback。
- [x] 390px不出現「OKR模式」入口，ModeSwitcher 的現行 mobile board-only 隱藏行為與既有手機流程不變。
- [ ] 鍵盤焦點順序與任務樹順序一致；screen reader 可辨識內容真正所屬任務，狀態不只靠顏色。
- [x] 實際 browser visible-error／console／page error sweep 為 0；任一 4xx／5xx、錯誤空態或非預期全空資料為 Fail。

### QA／QC Contract（Executed / Targeted QA-QC PASS / NOT RELEASED）

| 失效模式 | 使用者影響 | 偵測方式 | 優先級 | 對策／必要案例 |
|---|---|---|---|---|
| 父層內容看似屬於子任務 | 方向與責任誤判 | own-content barrier、owner label、screen reader readback | P0 | 驗證多層 span、branch、filter、collapse；不可靠即降級不跨列 |
| record error 被當成真正空白 | 使用者誤以為沒有決策 | 注入 load failure／invalid metadata | P0 | 單一欄級 error＋retry，禁止 column collapse 掩蓋錯誤 |
| 每列發出 record request | 大看板延遲、成本與限流 | request counter＋大量 task fixture | P0 | 只允許既有 board-level load；task 數增加時 request count 固定 |
| 非人工或 stale 內容進主畫面 | 錯誤決策依據 | legacy／AI／activity／invalid／archived fixture | P0 | 僅 DEV-108 valid metadata＋aggregate invariant；其餘隔離 |
| goal 進入 live meeting continuity | draft／capture 狀態漂移 | meeting start、switch、recovery state probe | P0 | goal在單一allowlist；start／recovery保留goal，live menu可用 |
| tracking reference 顯示半套資料 | 跨板資訊缺漏或越權 | source-board private／reference fixture | P1 | current phase 不 render tracking reference；既有 views 必須回歸 |
| 自動隱欄或 rowspan stale | 版面錯位、內容遮蔽 | description／meeting presence matrix＋更新事件 | P1 | pure derive；每次 visible inputs 改變重算，不保存 presentation |
| 精簡造成不可操作或不可存取 | 鍵盤／讀屏使用者無法進詳情 | keyboard、focus、semantic treegrid/table check | P1 | task identity 為唯一可操作入口；不可靠即採無跨列 fallback |
| 手機顯示 goal | 未驗證版面破裂 | 390×844 normal navigation＋persisted goal | P1 | 入口不存在，persisted goal 正規化 Board |

最小驗證批次：

1. Pure projection：depth-first rows、own-content presence、all-entry deterministic ordering、column collapse、span
   barrier、filter／collapse recompute、invalid source isolation。
2. Store／request：active board records只載入一次；goal render與task count變化不新增provider request；只有明確
   editor／DnD產生task write，record／task-link write維持0。
3. Browser happy path：由正常 topbar「視角」進 goal，驗證 L1／L2／L3+、五種 content presence、Task Details
   開啟與返回後更新；不得以 direct URL 或 store mutation代替入口。
4. Browser negative：viewer、record load error／retry、filtered zero、tracking reference、live meeting、persisted goal
   recovery、390×844、200% zoom、長中英文與 visible-error／console／HTTP sweep。
5. Regression：DEV-039／070／108／111／114／115／117 的直接受影響 static／browser cases，加上 TypeScript、
   targeted lint 與 test build。既有 PASS 只能作 baseline，不能預填 DEV-116 UI PASS。

Evidence required：source revision／dirty boundary、fixture IDs、actor／permission、route、viewport、操作序列、
request／mutation counters、pure result、browser screenshot 與 error sweep。QC 必須在 frozen candidate 後以唯讀方式
執行；第一個 P0／P1 failure 回送 RD，修正後重驗受影響案例。

Planned commands（candidate 完成後執行，實際 package script 名稱即為契約）：

```text
npm run verify:dev-116-goal-mode
npm run verify:dev-116-goal-mode-browser
npm run verify:dev-039-task-filter-core
npm run verify:dev-070-interaction-kernel
npm run verify:dev-097-pwa-safe-reload
npm run verify:dev-108-task-meeting-note-persistent-list
npm run verify:dev-114-task-description-global-surfaces
npm run verify:dev-115-blank-task-creation
npm run verify:dev-117-cross-mode-meeting-continuity
npm run verify:dev-117-cross-mode-meeting-continuity-browser
npx tsc --noEmit
npx eslint <DEV-116 changed TS/TSX files>
npm run build:test
git diff --check -- <DEV-116 owned files>
```

Primary artifacts：

- `output/playwright/dev-116-goal-mode/static-result.json`
- `output/playwright/dev-116-goal-mode/result.json`
- `output/playwright/dev-116-goal-mode/screenshots/*.png`

Static JSON 必須列 assertion ID／status／source revision；browser JSON 必須列入口、fixture IDs、actor、viewport、
current view、task／record request count、三種 mutation count、console／page／HTTP／visible error arrays與 runtime cleanup。
空陣列或 critical fixture count=0 不得自動視為 PASS。

### UI Entry Contract（RD Contract）

- Target actor：使用桌機且具有目前工作區／看板讀取權限的 viewer／editor；Task Details 編輯仍依既有
  `canEditTask`／command guard。手機使用者與 live meeting actor 不在第一版 goal 範圍。
- 正常起點：已選定 active workspace 與 active board 的 topbar。
- 可辨識入口：既有「視角」按鈕 → menu item「OKR模式」。
- Destination：同看板、同 filter context 的目標模式，不建立新看板或資料副本。
- Delivery path：ModeSwitcher → current view／goal profile → active-board primary task＋filter projection →
  board-level records／DEV-108 meeting index → sparse layout → rendered UI；點 task identity 走既有 Task Details command。
- Meeting path：goal → topbar「新增會議記錄」→ existing meeting session且保留goal；live meeting
  ModeSwitcher 的 selectable set包含goal並可切入／切出。
- Evidence layer：正常導航入口、實際資料 fixture、1440／1024 desktop browser 操作與 screenshot，加上
  390 手機與 live meeting option 排除回歸；pure/static、request counter 與 store probe 只補充資料與狀態，
  不能取代可見 UI evidence。

### 風險與停止條件

- 若「最近會議紀錄」必須查詢目前權限邊界以外的 record、跨看板／跨 workspace 資料或新增 provider fetch，
  停止並補資料、權限與錯誤契約，不得以 title 或 stale cache 猜測。
- 若實作以每個 task 呼叫 `listByNode`、產生與 row 數量成長的 request，或需要把 archived records 加入
  board-level load 才能通過，停止並回 RD Contract；不得用 N+1 換取完整度。
- 若跨列只能以實際資料繼承、複製父層內容或改 schema 才能完成，停止並回產品決策；第一版只允許 presentation。
- 若新增 mode 必須繞過 DEV-070 interaction kernel、現行 ModeSwitcher disabled guard 或 DEV-039 scope/filter，停止重審。
- 若除「將goal加入store-owned `MEETING_CONTINUITY_VIEWS`」外還要修改 meeting draft／capture／recovery aggregate
  或snapshot schema，停止並amendment
  ADR-049／SPEC-117；不得只加 menu item。
- 若第一版必須納入 tracking reference、source-board record 或 derived read，停止並補 DEV-095／110 的 identity、
  permission、request-count、錯誤與 cross-board evidence contract。
- 若 merged presentation 無法提供正確 table／tree semantics、鍵盤焦點或 screen reader ownership，桌機降級為
  不跨列但零 placeholder 的緊湊表格，不以 accessibility 換取密度。
- 任一情況出現錯任務、跨 branch、跨帳號資料、選取 hit target 遮蔽、filter 後 stale span，或手機誤出現
  「目標模式」入口即 Fail。

### Human Decision Brief（2026-09-10）

1. `Human Confirmed`：第一版不開放手機「目標模式」；先維持現行 mobile board-only navigation contract。
   先前 390×844 單欄概念只保留為 future 方向，不屬本期交付。
2. `Human Confirmed`：所有 task-linked records 降到次要畫面；主畫面只保留近期且具 provenance 的
   DEV-108 人工會議補記 projection，其餘維持由既有紀錄庫按需查閱，避免歷史全文與低頻資料競爭
   OKR 主焦點。
3. `AI scope normalization`：第一版不新增已退場的 Task Details 歷史面板或另一套完整聚合頁；如使用者
   要求把完整 task-linked records 次要畫面納入同一期，須重新進入規劃並補入口、選取、摘要、排序、
   封存、跨板 ownership、權限失敗與驗收契約。

### Future Phase Capsule：手機與任務導向完整紀錄聚合畫面

- 狀態：`Future Phase Captured / Not Requested`。
- 目的：在不稀釋桌機 OKR 主畫面的前提下，按需提供手機目標閱讀，或在既有紀錄庫之外新增以任務為中心的
  完整 task-linked records 聚合查閱。
- 邊界：不得恢復已退場 UI、擴大 scope／權限或建立新 provider fetch，除非先完成對應 RD Contract。
- Re-entry trigger：使用者明確要求將手機入口或新的完整關聯紀錄次要畫面排入可執行 phase。
- 驗收方向：次要資訊可被找到但不與主焦點競爭；手機不得等比例壓縮桌機 merged table。

### Future Phase Capsule：tracking reference 與 meeting continuity parity

- 狀態：`Future Phase Captured / Not Requested`。
- 目的：讓 goal 可安全呈現 tracking placements，或評估goal原生reservation等Board-only meeting actions。
- 邊界：須先固定 canonical／placement identity、source-board meeting provenance、derived read／permission、
  constant-request strategy，以及 ADR-049／SPEC-117 draft／capture／recovery mode matrix。
- Re-entry trigger：使用者明確要求 tracking reference 或 live meeting 可使用 goal，或 usage evidence 顯示 current
  exclusion 阻斷主要 OKR／meeting workflow。
- 驗收方向：內容完整且不越權、不重複 canonical task、不產生 N+1；meeting switch 不重建 session 或 segment。

### Interaction parity amendment（2026-09-10）

- Component boundary：List的`WbsNodeItem`是recursive Grid且自行render children；Goal是flat DFS semantic Table並擁有
  independent rowSpan。禁止把整列直接共用；兩者只共用`TaskHierarchyIndentedRow`與6px階層幾何。
- Goal-owned capabilities：標籤、負責人、狀態、開始日期、結束日期、工期與desktop sortable rows由
  `GoalView`自己的row presenter組合既有store／picker／style／permission／DnD primitives；進度條／百分比由List presenter保留，
  不新增跨模式wrapper。
- Interaction boundary：primary／double／Enter／Space維持Details；right click／Shift+F10由task-name identity觸發
  與Board相同的既有全域task menu。表單控制不得冒泡、開menu或啟動drag；task write只能由明確editor／DnD或
  使用者執行的既有menu command產生，record／task-link write為0。mobile Goal與tracking placement仍disabled。
- PWA：task-drag manifest加入goal；mobile Goal仍blocked，因此不新增Goal touch／mobile action surface。
- ADR：不新增。此為SPEC-116內可回復的surface capability amendment，沿用既有DEV-070、046、053與097 authority，
  不改schema、provider、permission model或public command semantics。
- QA：舊details-only QC已superseded；最新candidate已完成P21～P28、B12～B17、雙模式canonical readback與
  814／1440 visual gate，並以B05／B18／V22驗證Board-shared右鍵menu後重新freeze。

### Execution Boundary 與變更紀錄

- Current phase：`Interaction parity implemented / Targeted QA-QC PASS / NOT RELEASED`；原details-only candidate為歷史baseline，
  WP-116-G／H已實作並重驗。正式release仍須另走
  deployment/release gate，不得把 local targeted PASS 等同 production release。
- Implementation boundary：只允許已列 file surface 與相容文件；若發現需要額外產品檔案，先判定是否為
  import／type mechanical dependency。任何新 authority、public contract或 protected file 變更必須停止回規劃。
- Release boundary：未要求 commit、push、PR、deploy、migration、production smoke 或 release；不建立 REL artifact。
- 2026-09-10：由 Brief Ready 升級至 RD Contract Ready；完成 code／SPEC-108／SPEC-117／ADR-049 readback，
  固定 latest-one、board-level records、column collapse、span、primary-only、desktop-only 與 meeting-negative contract。
- 2026-09-10：完成 actual repo Architecture Closure Review；新增 SPEC-116、QA-DEV-116，鎖 exact-scope record
  loader、batch meeting index、pure sparse I/O、當時的details-only goal profile、meeting policy、逐檔 surface、
  WP、commands、artifact、drift／stop conditions；升級為 `RD Implementation Ready / 架構已定案`。
- 2026-09-10：RD Tech Lead R2完成四項收斂：meeting policy留在record store只匯出predicate；三個平行load
  scalars改為單一`RecordListLoadState`並納入既有list consumers；sparse input移除冗餘`parentId`；相鄰
  browser回歸改採風險式最小集合。產品scope與Human Decisions不變。
- 2026-09-10：依最新使用者指示，以intentional replacement開放OKR任務名稱區右鍵／`Shift+F10`；Goal與Board
  直接共用同一profile與既有`GlobalContextMenu`／`TaskActionMenu`、catalog／guards／commands，不新增選單元件。
- 2026-09-10：依最新使用者 UI 回饋移除 OKR 各欄表頭內層 UI 容器；欄名直接由`th`承擔，保留sticky深色表頭、格線與a11y語意，並更新V23幾何驗證。
- 2026-09-10：依最新使用者 UI 回饋將 OKR 任務名稱欄縮減30%至252px，並同步表格最小寬度、colgroup與drag overlay，更新V23幾何驗證。
- 2026-09-10：依最新使用者 UI 回饋移除 OKR 負責人欄裝飾性 `Users` trigger icon；共用`TaskAssignmentPicker`以`showIcon`控制顯示，
  保留負責人文字、下拉、鍵盤／aria與清單模式原icon，並更新B12／B14回歸驗證。

- 2026-09-10：依最新使用者 UI 回饋移除任務目的／會議紀錄 owner cell 的額外內容包裹層，改由語意`td`直接承擔文字；
  保留rowSpan／換行／格線，V23改驗證無巢狀內容UI容器。
- 2026-09-10：依最新使用者 UI 回饋補上 OKR 表頭／資料列邊界對齊檢查；1298px量測第一／最後cell左右差異皆為0px，
  table外框相對誤差為±0.5px，確認表頭與資料列共用同一組column tracks，未新增同步容器。
- 2026-09-11：依最新使用者 UI 回饋恢復任務目的／會議紀錄 owner cell 的最小內容容器與Y軸捲動；容器以`rowSpan × 32px`
  限制可視高度，V23實測長目的`scrollHeight=100`、`clientHeight=96`、`overflow-y:auto`，下方任務未被推開。
- 2026-09-11：依最新使用者差距分析，會議欄由 latest-only 改為 exact scope 內全部有效補記；新增
  `projectMeetingTaskQuickNotesByTask` 與共用無狀態 `MeetingQuickNoteRows`。兩筆 meeting records、六筆補記以 browser
  V25 驗證全部出現，`clientHeight=64`／`scrollHeight=120` 時欄內Y軸捲動生效；DEV-116 browser 更新為40/40 PASS。

### Architecture Closure Review（2026-09-10）

- Source baseline：branch `持續優化3`、HEAD `a7510fcbb1f8793fe8ea3cb2a37a7b07f4371286`；review 對象包含
  當前 working tree，並非假設 clean HEAD。
- Repo evidence（implementation 前基線與 closure）：`ViewMode`／App／MainLayout／Sidebar／persistence 已接入
  goal allowlist；DEV-070 kernel 有 typed host/profile/surface；task filter／hierarchy 沿用 pure projection；record
  load 已改為 exact-scope discriminated state 並加 stale-request guard；DEV-108 batch all-entry index 與 DEV-116
  pure sparse projector 已接入；DEV-117 policy 仍位於 store-local predicate，MainLayout只消費同一store的 pure predicate。
- Dirty boundary：工作樹已有 user-owned DEV-042／117／其他未提交變更，且 `MainLayout.tsx`、`Sidebar.tsx`、
  `TaskDetailsModal.tsx`、`useRecordStore.ts`、`package.json`、DEV-117 docs／verifier 等有重疊。RD 必須先讀
  `git diff -- <target>`，採小 patch保留；禁止整檔回復、checkout或把非 DEV-116 變更納入完成宣告。
- Architecture decisions：資料／API／permission／schema／migration不變；新增一個pure feature helper與一個
  presenter；record scope race以single discriminated store truth修正；meeting allowlist留在lifecycle owner並只匯出
  predicate；native semantic table
  優先，a11y 無法證明時固定降級為無 rowspan 緊湊表格。
- Non-functional：task/record read requests 對 row count 維持常數；batch／sparse projection O(records+entries+rows)；
  初始render與menu開關為0 product writes；1024與200% zoom可讀；mobile入口為0；錯誤不得偽裝成空白；stale scope fail closed。
- QA readiness：SPEC-116、QA-DEV-116、AC、FMEA、normal-entry browser、request/mutation counters、artifact paths、
  regression commands、runtime cleanup、first-failure return均已鎖定。
- P0／P1 unresolved architecture blockers：`0`。
- 結論：原reading architecture維持定案；interaction amendment架構已確認並完成local implementation與targeted
  QA-QC，未commit／push／deploy／release。

### Implementation／Targeted QA-QC Closure（2026-09-10）

- WP-116-A～F 已完成：新增 `GoalView` 與純 O(rows) sparse rowSpan projector；接入 active-board primary hierarchy、
  現行 filter/collapse、exact workspace×board record load state、DEV-108 all-entry valid batch index、初始details-only goal
  interaction，以及 desktop／mobile／meeting／PWA compatibility。依最新 UI 回饋移除可見 L1／L2／L3+ 文字標籤，
  改以縮排與收合狀態表達層級，讓 task identity 回到清單模式單行列高；screen reader 層級資訊保留在 accessible name。
- Interaction amendment：List／Goal只共用`TaskHierarchyIndentedRow`；Goal自行組裝標籤、planning controls、
  assignment portal與desktop DnD，List保留進度指示，PWA task-drag owner加入goal。右鍵amendment讓Goal與Board共用同一task profile、
  `GlobalContextMenu`／`TaskActionMenu`與catalog／guards／commands；Goal沒有第二套menu。
- UI candidate補強：OKR表頭固定於主內容捲動頂部並採深底白字；任務目的／會議紀錄 owner `td` 內保留一層必要內容容器
  承擔Y軸捲動，保留rowSpan、換行、格線與table語意；表頭與資料列共用同一native table grid，左右邊界對齊。
- 驗證結果：DEV-116 static 28/28、browser 40/40 PASS；DEV-039 66/66、DEV-046 32/32、DEV-053 31/31、
  DEV-070 58/58、DEV-097 23/23、DEV-108 14/14、DEV-114 29/29、DEV-115 21/21、DEV-117 static 21/21與
  browser 8/8 PASS；`npx tsc --noEmit`、targeted ESLint、
  `npm run build:test` PASS。
- 證據：`output/playwright/dev-116-goal-mode/static-result.json`、`output/playwright/dev-116-goal-mode/result.json`、
  `output/playwright/dev-116-goal-mode/V01-goal-table-1440x900.png`、
  `output/playwright/dev-116-goal-mode/V15-goal-table-814x698.png`、
  `output/playwright/dev-116-goal-mode/V19-goal-capabilities-1440x900.png`、
  `output/playwright/dev-116-goal-mode/V21-goal-after-drag-1440x900.png`、
  `output/playwright/dev-116-goal-mode/V24-goal-task-column-1298x698.png`、
  `output/playwright/dev-116-goal-mode/V22-goal-global-context-menu-1440x900.png`、
  `output/playwright/dev-116-goal-mode/V23-goal-sticky-dark-header-1440x180.png`、
  `output/playwright/dev-116-goal-mode/V17-mode-switcher-without-introduction-row-814x698.png`。Browser 使用既有 localhost:4000 runtime（PID
  28532）並標記 reused；未停止其他 runtime。
- Boundary：這是 local targeted QA-QC PASS；1024／200% zoom、viewer、500-row、remote provider、production smoke、
  deploy、release 與實機 mobile 仍是獨立 gate，未被本輪結果預填。
- 現行狀態：`Interaction parity implemented / Targeted QA-QC PASS / NOT RELEASED`；先前details-only證據只作歷史baseline。

使用思考習慣：#系統描繪、#限制條件、#可驗證性

## DEV-117：會議紀錄六模式不中斷與 Session 連續性

- 狀態：`完成 / Implemented / Targeted QC PASS / NOT RELEASED`
- 開發文件成熟度：`RD Implementation Ready`
- 架構定案：`已定案`
- 技術主管審查：`PASS`
- 節點類型：交付點
- 父交付點：無；相容 DEV-002、005、007、028、069、094、105、106、108、109、116；DEV-116 goal
  current phase 不加入 meeting continuity allowlist
- 是否計入產品交付完成：是（產品實作與 QA/QC 通過後才完成）
- 原始需求邊界：會議紀錄可在看板、清單、心智圖、甘特與日曆使用；會議中切換模式不中斷。
- 來源 ID：`USER-20260910-CROSS-MODE-MEETING-CONTINUITY`
- 風險等級：Medium（可見導航、meeting lifecycle 與跨模式 capture continuity）
- Spec Impact：`Intentional replacement + compatible exception`。取代 fixed-board／view-as-exit 契約；
  保留 Board-only reservation、mobile meeting-negative 與跨 board safety。

### 任務目標

把會議 session 與中央 view projection 解耦。同一 active workspace／board 內，六個 task views 切換只改
`currentView`，不關閉、保存、重建或切分 meeting；右側紀錄欄、同一 draft、recovery 與 DEV-109
capture segment 持續。

使用思考習慣：#目的、#系統描繪、#效用理論

### Current Phase Scope

- [x] 六個 continuity views 任一處開始 meeting 時保留原 view。
- [x] live meeting 中 ModeSwitcher 可切六 views；meeting 本身不再是 disabled reason。
- [x] draft／workflow／panel／recovery／capture segment identity 跨 view 持續。
- [x] 各 view 既有 Task Details、人工會議補記與 persistence-confirmed mutation 相容。
- [x] DEV-105 reservation 維持 Board-only；record task-selection transient Board hop 可維持。
- [x] 更新 DEV-010／020 舊 fixed-board assertions，補 DEV-117 static／browser verifier。

### Out of Scope

- mobile meeting、跨 board／workspace meeting、system page continuity。
- reservation／Board inline mark 在其他 view 的 presenter parity。
- schema、migration、provider、permission、record metadata、AI、editor 或 recovery redesign。
- release、deploy、production smoke 或正式資料操作。

### Architecture Contract

- ADR-049 是 session／view ownership authority；SPEC-117 是 implementation／acceptance authority。
- `useRecordStore` 唯一擁有 meeting lifecycle，`useBoardStore.currentView` 只擁有 projection。
- 六模式分類與meeting lifecycle都由`useRecordStore`擁有；readonly set保持private，只export pure predicate。
  DEV-116 goal使start／recovery／live options成為多consumer，但MainLayout不得自行維護allowlist。
- `MainLayout`移除meeting lock並以store匯出的predicate產生live ModeSwitcher options；六模式切換不新增lifecycle side effect。
- 同 board view switch 不得呼叫 guard、flush、save、close、exit、start 或重建 DEV-109 segment。
- Board／workspace／system navigation 仍由 DEV-106 管理；本 DEV 不放寬。
- Data／API／permission／migration 均不變。

### RD Execution Boundary

本輪可執行 WP-117-A～F：failing contract、store-owned policy、navigation behavior、regression convergence、
candidate gate、targeted QC。新增兩個verifier；修改`useRecordStore.ts`、`MainLayout.tsx`、
DEV-010／020／117 verifier與`package.json`。`ModeSwitcher.tsx`、`useBoardStore.ts`、exit guard、reservation、
provider、schema與editor為inspect-only／protected；recovery snapshot／aggregate不改，僅restore前view normalization。

RD 開始前必須重新讀取 overlapping dirty diff；`MainLayout.tsx`、`ModeSwitcher.tsx`、本 dev_task 與
documentation map 已含 user-owned DEV-042 等變更，不得整檔回復或覆寫。

### Acceptance

- [x] 從六 views 各自開始 meeting 不跳 Board。
- [x] `board → list → mindmap → gantt → calendar → goal → board` 全程無 exit／save dialog，draft／segment identity 不變。
- [x] view switch 本身為 0 record write、0 task-link write、0 AI request、0 recovery clear、0 duplicate capture。
- [x] panel open／collapsed、人工內容、workflow 與 local recovery 持續。
- [x] 六 views 均可沿既有入口開 Task Details；DEV-108 人工補記直接、exactly once 進入同一 draft。
- [x] Board 狀態、Gantt 日期與非 Board Task Details 任務備註三種代表性 persistence owner，只在確認保存後
  exactly-once 進入 DEV-109 segment；純位置／排序仍為 0 capture。
- [x] task-selection／dependency selection 仍安全禁止 switch，結束後 meeting 與原 view 可恢復。
- [x] reservation 在非 Board／Task Details 為 0 entrance／0 mark；切回 Board 資料仍在。
- [x] 1440×900、1024×768、200% zoom、keyboard／ARIA 與 390×844 mobile-negative 通過。
- [x] visible-error／console／HTTP sweep 為 0，critical fixture count 不得意外全零。

### Evidence Required

- `verify:dev-117-cross-mode-meeting-continuity` static／pure。
- `verify:dev-117-cross-mode-meeting-continuity-browser` normal-entry／state／visual artifact。
- DEV-010、020、028、069、097、105、106、108、109 targeted regressions；DEV-109 browser regression 已通過。
  DEV-106 browser 現存通用 meeting close selector 與目前 explicit overflow exit 契約不相容，已記錄為 legacy
  verifier authority drift；不以改動 DEV-117 session／view 邊界的方式消除。
- TypeScript、targeted ESLint、`build:test`、DEV-117 owned diff check。
- Browser evidence 必須含 source／dirty boundary、actor、route、fixture、viewport、state probe、screenshots、
  visible errors、server PID／port owner／cleanup 與 port released。

### Stop Conditions

- 需要 schema／provider／permission／recovery snapshot內容或aggregate、跨 board／workspace 或 mobile meeting 變更；
  persisted non-continuity view的Board normalization除外。
- 需要為某 view 建立第二套 capture、meeting store、sidebar 或 task mutation path。
- 必須擴張 reservation／Board presenters，或 close／recreate segment 才能切 view。
- 需修改 protected files／contract，或 user-owned dirty changes 無法安全保留。
- 任一必要 UI path 出現 meeting identity 改變、無聲 exit、duplicate／missing capture、visible error 或資料歸零。

### 架構定案交接

- [x] 已對照 branch `持續優化3`、HEAD `fea16712f2ff4093984f06336da2e045a8d9f696`、實際 repo、
  既有 specs、store、MainLayout、App、recovery、capture 與 regression tests 完成 Architecture Closure Review。
- [x] ADR-049 已決定 authority、依賴方向、state invariant、相容例外、file surface 與 forbidden expansion。
- [x] SPEC-117／QA-DEV-117 已凍結 acceptance、fixture、evidence、FMEA、commands 與 stop conditions。
- [x] P0／P1 unresolved architecture blockers = 0。
- [x] RD Tech Lead 已修正 `AC-116-*` 誤編號與system navigation無證據的terminal假設；DEV-116導入前的
  baseline採store-local private predicate；DEV-116導入後只export該predicate給MainLayout，allowlist仍由record
  store唯一擁有，沒有新policy module或第二套meeting context。

首個文件／程式衝突、需改架構契約、需跨 protected boundary 或 acceptance 無法實作時，實作模型立即停止
並回送規劃模型；不得自行補寫新架構。

### Future Phase Capsule

`Future Phase Captured / Not Requested`：依 production usage evidence 再評估 reservation、task mention selection
與 mode-native meeting actions 的六模式等價；未獲明確需求前不建立新 presenter 或資料模型。

DEV-116 OKR模式依最新需求加入meeting continuity allowlist；從goal開始meeting、live switch與recovery皆保留goal。
此為先前goal-negative決策的intentional replacement，並以ADR-049／SPEC-116／117與完整UI evidence共同收斂。

### 相關文件

- `ai-doc/specs/SPEC-117-cross-mode-meeting-session-continuity.md`
- `ai-doc/decisions/ADR-049-meeting-session-view-independence.md`
- `ai-doc/qa/QA-DEV-117-cross-mode-meeting-session-continuity.md`
- Amended：SPEC-005、SPEC-106、SPEC-109
- Compatible：SPEC-028、SPEC-069、SPEC-105、SPEC-108

### 變更紀錄

- 2026-09-10：建立 DEV-117，完成 `RD Implementation Ready + 架構定案`；尚未修改產品或執行 QA/QC。
- 2026-09-10：RD Tech Lead 審查後優化 policy ownership、navigation 證據邊界、acceptance ID 與風險式 QA 範圍；
  結論由有條件通過收斂為通過，產品狀態仍為 NOT IMPLEMENTED。
- 2026-09-10：完成 DEV-117 原五模式實作與 targeted QC；`useRecordStore` 以私有allowlist保留起始 view，
  `MainLayout` 移除 meeting-only mode lock；static／browser／TypeScript／build 與直接受影響 regressions PASS。
- 2026-09-10：依最新需求把goal加入同一allowlist；六模式static/browser、Goal直接開始meeting、live quick note、
  TypeScript、targeted ESLint、build與直接回歸PASS；未commit／push／deploy／release。
  未 commit／push／deploy／release；DEV-106 browser 舊 close selector drift 已在 QA artifact 與文件標註。

## DEV-118：任務篩選器正向包含邏輯與跨介面共用架構

狀態：驗證中（`Local Candidate QA-QC PASS / NOT RELEASED`；Authenticated DB／live feed／release gate pending）
開發文件成熟度：RD Implementation Ready + Implementation Complete
架構定案：`已定案（2026-09-11 Architecture Closure Review；Tech Lead 文件複核完成）`
技術主管審查：`PASS`
節點類型：開發點
父交付點：DEV-039
是否計入產品交付完成：否
原始需求邊界：`USER-20260910-TASK-FILTER-UI-UNIFICATION`、
`USER-20260911-TASK-FILTER-LOGIC-ARCHITECTURE`
風險等級：本機 query／UI／consumer refactor 為 Medium；遠端偏好與 Calendar DB／Edge 發布為 High，
須另走 release gate。
Spec Impact：`Intentional replacement + compatible extension`；取代v4篩選語意，保留既有ownership、
projection、逾期定義、Calendar snapshot與permission authority。

### 真正需求與成功條件

現況把「包含」、「排除」與「顯示設定」混在同一組 active control，且日期條件互相 AND，
使用者無法預測結果。目標只保留一個心智模型：

> 未選＝不限；選取＝只顯示符合者。同一類條件 OR，不同類條件 AND。

成功不是三個畫面長得相同，而是相同 query、source 與 `today` 在 Board、Workbench、
Calendar preview 得到相同 matched task IDs，Calendar feed 另以同一 fixture 證明等價 truth。

### 文件權威與責任分工

| 權威文件 | 唯一責任 |
|---|---|
| `SPEC-039` DEV-118 section | v5 query、compiler、projection、Board／Workbench persistence與shared controls。 |
| `SPEC-045` DEV-118 addendum | Calendar v4 snapshot、permission、DB validator、Edge adapter、preview／feed 與發布順序。 |
| `QA-DEV-118` | fixtures、FMEA、case IDs、commands、evidence 與 Pass／Fail／Stop。 |
| 本 DEV | 狀態、範圍、工作包、接手規則與 release boundary；不重複完整演算法、SQL 或測試矩陣。 |

同一規則若在文件間表述不一致，依上表回到單一權威修正，不以本 DEV 的摘要覆蓋 SPEC 或 QA。

### Current Phase Scope

- 建立 `TaskFilterQuery` v5、唯一 v4→v5 converter、browser compiler 與 group count。
- 修正日期 OR、未指派、空選取與 hierarchy projection 的 matched／visible／context-only 邊界。
- 沿用並收斂既有 `TaskConditionFilterControls.tsx` 為唯一 controlled filter section；
  三個 surface 各保留 state owner、shell、權限、資料來源與專屬控制。
- 遷移 Board remote／local、Workbench local 與 Calendar v1～v3 read boundary。
- 新增 Calendar v4 strict validator 與獨立 Edge row adapter，使用共同 conformance fixture。

### Out of Scope

- 不建立通用 schema-driven filter engine、exclude mode、任意 AND／OR builder 或巢狀群組。
- 不新增 filter profile、另存／共用偏好，也不合併三個 surface 的 active state 或 persistence。
- 不改任務狀態生命週期、逾期定義、task schema／RLS、Workbench placement 或 Calendar event date types。
- 本輪已修改產品、測試、local migration 與 Edge source；不執行正式環境 migration、commit／push／deploy／release。

### Frozen Product and UX Contract

- status、people、tag 為組內 OR；status、date、people、tag、keyword 五組跨組 AND。
- 日期組為「逾期 OR 今天至 N 天」；`N=0` 代表今天。日期組啟用時，缺失／無效日期不命中。
- `未指派` 只在主責與協作皆空時命中；顯示設定不進 query、badge 或 clear-all。
- badge 計 active groups，最大 5；section clear 只清該組，clear-all 只清 query。
- `逾期` 獨立；「到期」與天數為單一 compound control，按鈕不顯示日期 icon 或「日」。
- 順序固定為任務狀態 → 到期日與搜尋 → 介面顯示（適用時）→ 負責人／協作 → 標籤。
- inactive 使用中性色，selected 使用品牌藍並有非顏色訊號；逾期只保留最小 warning cue。
- 不增加 helper、摘要卡、框中框或雙重捲動；保留 keyboard、focus restore 與可存取名稱。

完整 type、truth table、日期／人員邊界及 legacy mapping 只以 `SPEC-039` 為準。

### Architecture Closure Handoff

Closure source：branch `持續優化3`、HEAD
`522e92318d1da05cd06e19604656f3b35fe9e3e9` 加 DEV-118 文件 diff。已對照 domain、
stores、repositories、三個 UI consumers、Calendar service／SQL／Edge 與直接 regression。
P0／P1 unresolved blockers = 0；ADR not needed，因 ownership、table 與外部系統邊界均未改變。

```text
surface wrapper
  ├─> TaskConditionFilterControls (controlled, full-value onChange)
  └─> taskFilters domain
         ├─ normalize -> compile once -> browser projection
         └─ shared conformance fixture -> Calendar Edge v4 adapter
```

#### Frozen implementation boundary

- Domain：`src/features/taskFilters/` 建立 v5 type、default、唯一 converter、compiler、
  summary與projection；不得import React、store、storage adapter、Calendar或Supabase。
- Board：`useTaskFilterStore`擁有account×board query／sync；repository管local journal與version；
  remote adapter只做version-aware CAS。
- Workbench：保留account-scoped `filtersByBoardId`、selected board與panel prefs；
  不接Board remote row。
- Shared UI：就地改造`TaskConditionFilterControls.tsx`為full-value controlled component；
  不改檔名、不新增compatibility component。Board移除重複filter JSX，既有style檔就地調整。
- Calendar：App建v4 draft；`filters.ts`是唯一legacy materializer；service strict normalize；
  DB strict validate；Edge v4 adapter負責snake_case row matching。
- Verification：只在`QA-DEV-118`維護fixture、verifier、完整命令與evidence contract。

`TaskFilterQuery` 是 v5 runtime type；legacy type只存在 converter／Calendar v1～v3 boundary。
shared control 接受 `value: TaskFilterQuery` 與 `onChange(next: TaskFilterQuery)`，不接受 nested
`Partial` merge。private helper、內部 component 拆分與等價 class 組合由 RD 決定。

#### Persistence and compatibility invariants

| Consumer | Target |
|---|---|
| Board remote／cache／pending | query version 5；v4 先轉換、寫入並 readback，再移除舊值；remote 使用 CAS，`>5` fail-safe。 |
| Display settings | version 4 與既有 key／value 保持獨立，不因 query migration 或 reset 改變。 |
| Workbench local | v4 逐 board 轉 v5，readback 前不刪舊值；account、selectedBoardId、panel prefs 不變。 |
| Calendar subscription | v1～v3 defensive read；只 materialize local v4 draft，使用者儲存才原子寫 v4；不 background rewrite。 |

Board controls在 remote hydration 完成前 disabled。任何 write／readback／CAS outcome unknown 都保留
legacy 或 pending intent；不得 blind overwrite／delete。Calendar v4 payload、broad-scope permission、
validator 與 Edge state machine只以 `SPEC-045` 為準。

### Frozen Work Packages

1. `WP-118-A`：建立共同 fixture 與會先失敗的 model／migration tests。
2. `WP-118-B`：實作 v5 domain、normalizer、compiler、projection 與 deferred-status adapter。
3. `WP-118-C`：完成 Board v5 local／remote CAS 與 Workbench local migration。
4. `WP-118-D`：就地收斂 `TaskConditionFilterControls`，接入 Board／Workbench／Calendar preview。
5. `WP-118-E`：完成 Calendar v4 app／DB／Edge source，只在 disposable local 環境驗證。
6. `WP-118-F`：依 `QA-DEV-118` 跑全 gate、直接 regression 並建立 local QC candidate。

每包須通過自己的新 gate與受影響舊 gate後才能進下一包。禁止先讓 app 寫 v4、先做 UI 後回填
query，或建立 surface-specific predicate。實作前須重讀 `git status` 與 overlap diff，
只做可分離的最小 patch，不覆寫其他 DEV／使用者變更。

### Acceptance Summary

- [x] default query 無 active filter、顯示全部 canonical tasks且 badge=0；Calendar safe default 依權限預選目前使用者。
- [x] 同組 OR／跨組 AND、日期、未指派、group count與 clear 邊界符合 `SPEC-039`。
- [x] 三個 browser consumers 使用同一 controlled compiler；hierarchy projection維持 matched／context 邊界。
- [x] Board／Workbench／Calendar legacy fixtures完成可恢復、冪等且 newer-version-safe 的 migration。
- [x] Calendar v4 DB／Edge adapter static contract與本機 matcher通過；正式 authenticated DB／feed仍屬 release gate。
- [x] 三個正常入口的本機 browser smoke 通過，未發現本次 filter panel visible error。
- [x] `QA-DEV-118`已建立並執行 model／migration／edge／DB static／browser、TypeScript、build與DEV-039 direct regression。

效能 gate 採WP-118-A在同fixture／環境凍結的v4基準：v5 500-task projection p95不得高於
該baseline的1.25倍，並記錄兩者絕對值；另以source assertion證明query／today不變時只compile一次，
逐 task 不重建 Set或讀取時鐘。不得再以未量測的固定100ms作架構門檻。

### Stop, Release and Execution Boundary

- 下一個合法動作：依 `QA-DEV-118` 補 authenticated DB／live `.ics` 與 release gate；架構定案與 local candidate PASS 不等於 production 授權。
- 若需改凍結 boolean semantics、surface ownership、v1～v3 read、permission、task schema／RLS，
  或無法保留 user-owned dirty changes，停止並回送規劃。
- Exclude mode、advanced builder、team-shared presets：`Future Phase Captured / Not Requested`。
- Local candidate PASS最多標為 `QA-QC PASS / NOT RELEASED`；DB migration、Edge／app deploy、
  live `.ics`、rollback與 production smoke須收到獨立 release 指令。

### Evidence and Related Documents

- Repo fact：本候選已升為 TaskFilterQuery v5、日期 OR、group count；Board／Workbench／Calendar
  persistence 與 Edge adapter已完成本機candidate驗證，authenticated DB／live feed與正式發布仍未升版。
- 歷史 1298×698 畫面只證明既有版面 smoke，不證明 v5、migration、consumer 或 feed parity。
- 權威：`SPEC-039` DEV-118、`SPEC-045` DEV-118、`QA-DEV-118`；`SPEC-062`
  的 `isTaskOverdue` 與 `SPEC-064` brand roles維持不變。

### 變更紀錄

- 2026-09-10：依 browser comments 建立 `Brief Ready`，記錄看板 UI 與共用候選。
- 2026-09-11：完成正向包含、同組 OR／跨組 AND、日期／未指派修正、v5／Calendar v4
  compatibility與 QA／release boundary，升級 `RD Contract Ready`。
- 2026-09-11：完成 Architecture Closure Review，凍結 runtime boundary、migration／CAS、
  WP-118-A～F 與 QA contract，狀態為 `RD Implementation Ready / NOT IMPLEMENTED`（歷史快照）。
- 2026-09-11：Tech Lead 文件複核；移除純命名 component／style 搬移與重複命令／演算法，
  改由 SPEC／QA 單一權威承接，效能 gate 改為同環境相對非退化基準。
- 2026-09-11：完成 DEV-118 WP-118-A～F 本機實作：TaskFilterQuery v5、controlled shared controls、
  Board／Workbench／Calendar consumer、local migration／CAS、Calendar Edge adapter、fixture與verifier；
  `npx tsc --noEmit`、`npm run build`、DEV-039 static、model／migration／edge／DB static／browser smoke PASS；
  狀態更新為 `Local Candidate QA-QC PASS / NOT RELEASED`，未做 remote migration、deploy或release。

## DEV-119：OKR 內容儲存格直接編輯與自動展開／收合

- 狀態：完成；`Implemented / Targeted QA-QC PASS / NOT RELEASED`。
- 文件與實作審查：2026-09-14 R10 收斂完成；R2 架構已落地，R10 將 3px 簡約捲軸提升為全系統低 specificity CSS 基底、移除重複 surface class，並保留 `.no-scrollbar` 與甘特圖 12px 例外；R8 單一 cell frame、R6 focus／辨識、R5 行距與 R4 內容 scroll 區收合命中修正維持。本機 targeted QA/QC 通過，非正式 release gate。
- 節點類型：開發點；父交付點 DEV-116；風險 Medium；計入產品交付：否。
- 需求來源：`USER-20260914-GOAL-CELL-DIRECT-EDIT-AUTOFIT-TOGGLE`、`USER-20260914-SYSTEM-SCROLLBAR-FOUNDATION`。

### 需求與文件權威

A：description owner cell 雙擊內容／F2，就地編輯同一富文字目的。
B：description／meeting owner cell 雙擊底邊展開全文，再執行一次收合並恢復 Y 軸捲動；另有鍵盤短選單。
保持扁平表格，meeting aggregate 唯讀；必要 scroll／editor／失敗恢復 UI 不刪除。收合內容捲軸繼承系統 3px 低干擾基底，展開後可再次收合。

| 文件 | 唯一責任 |
|---|---|
| [SPEC-119](specs/SPEC-119-goal-cell-direct-edit-and-content-fit.md) | UX、資料／保存／生命週期、允許檔案、WP、AC、source baseline 與架構邊界。 |
| [QA-DEV-119](qa/QA-DEV-119-goal-cell-direct-edit-and-content-fit.md) | fixtures、cases、oracles、命令、evidence 與 exit gate；本輪 Targeted QA-QC PASS。 |
| SPEC-066／116 | 富文字資料與父 Goal authority；已加入 DEV-119 局部 target 修訂交叉引用。 |
| 本 DEV | 進度、接手順序與交付邊界；不另複製互動／狀態／測試矩陣。 |

### 架構確認（R2）

已盤點 GoalView／projection、Lexical shared editor、Task Details、WBS callbacks/Undo、meeting capture 與 App/PWA 生命週期。
修正 R1 的 no_changes 假成功、舊 payload retry、清空最後一欄與換 view 丟失恢復入口、ARIA 與 record 零寫入誤述。

最小方案：同一 Lexical 的 cell variant、既有 rich-content utils 增補 pure mapping、
GoalView-local presentation state，以及同帳號 AppContent 的唯一暫存 edit session。
只有 draft／未完成保存需要跨 view 保留；不新增業務 store、持久化草稿、task command 或第二套 editor。
task persistence 與 live meeting capture 分開判讀；PWA 沿用既有 inline-editor owner。

R10 共用捲軸採全域 CSS tokens＋`:where(*)` base rules，不建立 React `ScrollArea` component，避免系統性增加 DOM 容器與 consumer migration；
一般原生 overflow surface 取得 3px 基底，`.no-scrollbar` 與 `.scrollbar-gantt`（12px／雙軸直接拖曳）為唯一明確例外。此為 `Intentional replacement / cross-system visual foundation`，不改資料、API、權限、scroll owner 或事件契約。

架構已定案，無待使用者裁決事項；產品行為已由 RD 實作，並完成共用捲軸基底、單一 editing frame、focus、行距與收合命中修正後的本機 targeted QA/QC。
R2 允許的 App/session／最小 Undo guard／PWA 改動已明列 SPEC 第 6 節，不再受 R1 的 provider/store 全面禁改文字阻擋。
跨 surface last-writer、capture 補捕與 crash recovery 限制明載 SPEC，不擴大為本 DEV 的新保證。

### RD 接手

依 SPEC 的 WP-119-A→E：failing contracts → pure note mapping → shared editor/details 回歸
→ session／A-B／保存與 PWA → 新功能及直接回歸／獨立 QC。詳細退出條件只以 SPEC 與 QA 為準。
開工前核對 SPEC source revision 與三個既有 dirty hashes；保留扁平化修改，不 reset／覆蓋他人工作。

下一個合法動作是依 QA exit gate 補完整 failure injection／正式環境驗證。若需要改 schema/API、permission、rowSpan ownership、meeting capture 語意、
全域 task command 或服務端 concurrency，停止並回 PM 更新架構。
本輪未授權 commit、push、deploy 或 release；任何超出 SPEC §6 的變更仍須回 PM 更新架構。

## DEV-120：OKR 規劃欄極簡高密度介面

- 狀態：完成；`Implemented / Targeted QA-QC PASS / 架構已定案 / NOT RELEASED`。
- 節點類型：交付點；父任務 DEV-116；相容 DEV-119；風險 Medium；計入產品交付：是。
- 需求來源：`USER-20260914-OKR-PLANNING-COLUMNS-MINIMAL-DENSITY`、
  `USER-20260914-GOAL-TABLE-FROZEN-TASK-NAME-COLUMN`。
- Human Confirmed：極簡、極度降噪與版面利用率優先；任務名稱固定是指資料表格內左側 frozen first
  column，其他欄位用表格同一條 X 軸捲軸移動，不是 app sidebar 或第二張 table。

### 需求與文件權威

目前五個 planning columns 的常駐 input/pill/icon/frame 在大量任務下形成主要視覺噪音，且設定寬度合計
580px。DEV-120 保留既有 controls 與 handlers，正常狀態只呈現值，hover／focus／open 才顯示必要 affordance；
目標 planning tracks 合計 428px。任務名稱維持資料表格內左側 frozen column，右側所有欄位在單一 native
table／single X-scroll owner 內移動。

| 文件 | 唯一責任 |
|---|---|
| [SPEC-120](specs/SPEC-120-goal-planning-minimal-density.md) | UX、intentional replacement、frozen column／X-scroll、呈現與互動、repo surface、WP、AC、source baseline 與架構邊界。 |
| [QA-DEV-120](qa/QA-DEV-120-goal-planning-minimal-density.md) | fixtures、FMEA、static/browser/visual/a11y cases、commands、evidence、Pass／Fail／Stop。 |
| SPEC-116 | Goal 入口、native table、projection／rowSpan、records、planning mutation、DnD／menu authority；局部 visual target 由 SPEC-120 取代。 |
| SPEC-119 | description／meeting cell editor、expand／scroll、跨 view session、PWA 與共用 scrollbar authority；DEV-120 不接管。 |
| 本 DEV | 任務狀態、執行邊界、下一步與交付判定；不複製完整 contract。 |

### 架構定案與執行邊界

Architecture Closure Review R2 已對照 branch `持續優化3`、HEAD
`e335eaa07c14313afb5a27607a2c009ace3bcbc3` 與 current dirty tree。最小架構是 GoalView-local fixed／elastic
`<col>` 分配與 mounted control quiet presentation，加上 default-preserving 的 `TaskAssignmentPicker` quiet trigger；
不新增 planning active-cell、draft、formatter、presenter 或 session state。status quiet style 不改 shared default；
現有 canonical handlers、permission／dependency truth、useWbsStore、projection、GoalCellSessionProvider、records與 persistence 全部維持。

Current execution boundary 只包含 SPEC-120 WP-120-A→E 的本機產品實作、DEV-116 scoped verifier convergence、
DEV-119／picker／status相容 regression及 QA-DEV-120 QA/QC。P0／P1 architecture blockers=0。

實作模型可自行決定 Goal-local width／class constant 命名、class 排列與空日期 overlay DOM 次序；不得
改變 frozen task-name、single native table/X-scroll owner、欄順序／tracks、mounted native controls、canonical
mutation、shared default、SPEC-119 session、驗收閾值或禁止區，也不得新增 planning edit state。首個 contract
drift 或需越界修改時立即停止回送規劃模型。

本輪已依 WP-120-A→E 完成實作與 candidate freeze。DEV-120 static contract 13/13、browser 19/19，並完成
DEV-116／DEV-119／DEV-048 受影響回歸、TypeScript、ESLint 與 test build；browser 證據重用既有
`localhost:4000` local-test runtime，未啟動新 server。額外 DEV-048 collaborator-filter browser smoke 仍在
fixture boot wait timeout，未納入本 DEV PASS；該案例需另案釐清 fixture／入口等待問題。
本輪已完成本機產品與 QA/QC；未 commit／push／deploy／release。完整 persistence／dependency failure injection、
原生瀏覽器 UI zoom parity 與正式環境驗證保留給獨立 gate。

使用思考習慣：#問對問題、#簡潔優先、#系統描繪、#限制條件、#可驗證性

## DEV-121：OKR 父子任務樹狀對照與群組範圍

- 狀態：完成；`R28 RD Implementation Complete / Targeted QA PASS / QC Ready / NOT RELEASED`。
- 開發文件成熟度：`RD Implementation Complete`；保留 Tech Lead R2 資料流，使用者確認的 owned-connector
  wired-tree 契約與 WP-121-B → E 已落地；R8 已完成 X 軸緊縮與端點移除，R9 完成樹線柔和化，R10 完成目前任務自有 incoming relation 高亮，
  R11 完成 active 線寬與欄位對比強化，R12 修正 rowSpan owner 與 active descendant 的視覺歸屬，R13 增加所有欄位反向定位，R14 恢復可捲動欄位格線，R15 將展開／收合整併為樹線節點，R16 移除定位 task 上游垂直／水平段的 active 筆畫，R17 將樹狀線 X 軸間隔增加 30%，R18 讓任務名稱固定欄維持原生底色並將定位色留在 planning／content owner，R19 將所有層級任務名稱欄統一為同一白色底色，R20 將定位 task-name tint 調整為柔和色階，R21 增加任務目的欄收合控制，R22 將全欄位收合與帳號偏好保存統一到同一套欄位設定，R23 取消任務名稱欄收合鈕並固定 252px 左側樹狀欄，R24 將其餘欄位收合鈕收斂為 24px hit target／18px 視覺框與柔和狀態回饋，R25 將收合軌道縮為 22.4px 並把收合控制縮為 20px hit target／16px 視覺框，R26 移除空白日期額外 `—` 並使規劃欄寬容納標題與標準內容，R27 移除結束日期欄重複的工期鎖定 `L` 標記，R28 讓會議紀錄內部捲軸只顯示完整文字行並隱藏部分可視的 quick-note row。
- 節點類型：交付點；父任務 DEV-116；延續 DEV-120；相容 DEV-119；計入產品交付：是。
- 風險：Medium（改變 OKR 階層、群組與 hover／focus 的可見語意，但不變更資料或權限）。
- 需求來源：`USER-20260914-GOAL-HIERARCHY-COMPARISON`、
  `USER-20260914-KEEP-GOAL-CONTENT-ROWSPAN`、
  `USER-20260915-GOAL-ROWSPAN-OWNERSHIP-CONTRAST`、
  `USER-20260915-GOAL-CONTENT-REVERSE-LOCATION`、
  `USER-20260915-GOAL-SCROLLABLE-GRIDLINES`、
  `USER-20260915-GOAL-NODE-TOGGLE`、
  `USER-20260915-GOAL-ACTIVE-UPSTREAM-VERTICAL-SUPPRESSION`、
  `USER-20260915-GOAL-TREE-X-SPACING-30`、
  `USER-20260915-GOAL-TASK-CELL-NEUTRAL-SURFACE`、
  `USER-20260915-GOAL-TASK-CELL-UNIFORM-SURFACE`、
  `USER-20260916-GOAL-SOFT-LOCATION-TINT`、
  `USER-20260916-GOAL-DESCRIPTION-COLUMN-COLLAPSE`、
  `USER-20260916-GOAL-ALL-COLUMN-COLLAPSE-PREFERENCE`、
  `USER-20260916-GOAL-COMPACT-COLLAPSE-CONTROLS`、
  `USER-20260917-GOAL-DATE-PLACEHOLDER-AND-CONTENT-FIT-WIDTH`、
  `USER-20260917-GOAL-REMOVE-DURATION-LOCK-MARKER`、
  `USER-20260917-GOAL-MEETING-TEXT-NO-CLIP`。
- 規格權威：[SPEC-121](specs/SPEC-121-goal-hierarchy-comparison-grid.md)。
- 驗收權威：[QA-DEV-121](qa/QA-DEV-121-goal-hierarchy-comparison-grid.md)。

### 目標、問題與差距

目前 OKR 表格適合逐欄查看資料，但父子關係主要依賴小幅縮排與任務名稱欄的局部底色；原本獨立展開箭頭與樹線形成兩套視覺訊號，
每列分隔線權重接近，使用者需要逐列推理某個子任務屬於哪個父任務，以及一組子樹在哪裡結束。
眼睛跨越負責人、狀態、日期與工期時，也缺少從固定任務名稱欄延伸到個別任務欄位的閱讀導引，
容易把相鄰列的資料看錯。

看板模式已使用 L1 父層標題、L2 任務範圍、L3+ inset rail、縮排與父子鄰接建立層級感。
本 DEV 將必要的非語言關係訊號轉譯到表格，使使用者能同時完成：

1. 沿固定任務名稱欄快速辨識父任務、子任務、孫任務與群組終點。
2. 保留任務目的／會議紀錄對整個子樹的群組脈絡。
3. 從任務名稱橫向比對同一列的負責人、狀態、日期與工期，不誤讀相鄰列。

底層差距是同一表格同時承載「一列一任務」的 planning 軸與「一格涵蓋連續子樹」的 content 軸，
格線必須只服務可捲動比較區，不能把任務名稱固定欄切成一般資料格。

### Human Decisions 與不可變條件

- Human Confirmed：任務目的與會議紀錄保留目前 native table `rowSpan`；它們是父層資訊涵蓋子樹的群組範圍，
  不改成每一個子任務各自空白的獨立內容格。
- Human Confirmed：任務名稱仍固定在資料表格左側第一欄，其他欄位使用同一條 X 軸捲軸移動。
- Human Confirmed：任務名稱固定欄不顯示資料列格線；任務目的、會議紀錄與 planning 欄位顯示水平／垂直格線，root group 邊界只落在可捲動欄位。
- 已拒絕：取消跨任務合併儲存格、將父層內容複製到子任務列、把 OKR 每個父任務卡片化。
- Human Confirmed 的工程翻譯：保留 covered cell 無 DOM、內容 owner、展開／收合、欄內 Y-scroll、
  session 與 persistence；connector reading guide 不進入 shared `rowSpan` cell，只有目前任務本身的 planning／content owner 才套用 active tint，
  固定任務名稱欄所有層級共用同一白色底色，
  active descendant 不染 ancestor owner；游標／焦點進入 description／meeting owner cell 時以 `ownerTaskId` 反向定位該任務。
- 保留同一 native table、252px sticky-left task-name first column、single X-scroll owner、
  shared 6px hierarchy default、Goal-local 10.4px depth step 與 DEV-120 quiet planning controls。

上述條件不得由 RD 以 CSS／DOM 困難為由更改；需要越界時停止並回到規劃模型。

### UX Intent 與刪除預設

- 任務／結果：熟悉 OKR 的使用者在大量父子任務中，能快速判斷群組歸屬並正確比較每列 planning 資訊。
- 主物件／主焦點：固定任務名稱欄中的任務樹；個別 planning 欄位是橫向比較結果。
- 預設刪除：卡片框、斑馬紋、層級文字標籤、常駐說明、重複父任務名稱、常駐子任務數量與額外 toolbar。
- 保留舉證：`rowSpan` 保留父層脈絡；樹狀導引線避免父子誤判；父群組邊界指出子樹終點；
  hover／focus 閱讀導引避免跨欄錯列；收合後代數量只在內容不可見時補足範圍事實。
- 非語言修復：先使用位置、縮排、線段、留白、淡背景與狀態轉換，不以 helper 或 badge 疊加說明。

### 架構定案

#### 單向投影

1. 現有 `buildHierarchicalTaskItems` 以實際 `collapsedIds` 產生 rendered DFS rows；它繼續是 row order、
   level、parent、filter 與可見性的 canonical truth。
2. 同一 builder 以 empty `collapsedIds` 再產生 fully-expanded eligible rows；結果 memoize，僅供收合後代計數。
3. 新增 Goal-only pure `buildGoalHierarchyDecorations({ renderedItems, fullyExpandedItems })`，輸出
   `ReadonlyMap<taskId, decoration>`；每筆含 parent、visible child、ancestor path、帶 owner 的 continuation、
   last sibling 與 eligible descendant count。taskId 由 map key 承擔，level／root boundary 直接使用 rendered row，不重複投影。
4. GoalView 把 decoration 傳入既有 GoalRow；Goal sparse projection 仍獨立決定 content owner／covered／rowSpan。
5. Goal-local CSS 只在 frozen task cell、planning cells 與真實 content owner cell 疊加視覺語法。

這個架構刻意不修改 `src/utils/taskHierarchy.ts`、`TaskHierarchyIndentedRow.tsx` 或 Goal content projection，
避免把 OKR 的樹線需求擴散到 Calendar、Gantt、List 與 Board，也避免建立第二套 hierarchy truth。

#### Tech Lead R2 瘦身與呈現契約

- projector 保留 R8 畫 owned relation 所需的最小事實；移除重複 `taskId`、`level`、root-group start／end。
- DOM 先重用既有 `data-goal-task-row`、`data-goal-level`、`data-goal-planning-control`、
  `data-goal-cell-kind`、`data-goal-span`，只新增 task-cell、group-span、guides／last-sibling、descendant-count hooks。
- frozen task cell：Goal 局部使用 10.4px depth（8px baseline × 1.3）；1px owned rails 以 14.4px incoming branch（12px 基準加上 2.4px 間隔增量）直接接到任務文字，不渲染裝飾 endpoint，
  最後 sibling 在列中心終止且 root groups 不跨接；有子任務的 disclosure 以 20×20px hit target 整併為 own-lane node dot；L0 以 semibold與低對比不透明底成為錨點，
  只有第二個及後續 root 畫 2px group top boundary；最後 group 由 table bottom 收束，不插 spacer row。
- content owner：只有 `rowSpan > 1` 加低對比 group surface 與 2px inset scope rail；不 clone、不補 covered cell。
- reading guide：pointer／focus 位於 task 或 planning cell 時，只連接該列的 task＋planning cells；只有目前任務本身是
  rowSpan owner 時同步 tint，covered descendant 不染 ancestor owner。pointer／focus 位於 description／meeting owner cell
  時回報該 cell 的 `ownerTaskId`，沿同一 scope 定位固定任務欄。selector 使用直接子 cell hooks 與 scoped `:has()`；
  禁止泛用 `tr:hover > *`，避免 rowSpan 命中誤亮 owner row。
- collapsed count：只有 `collapsed && eligibleDescendantCount > 0` 顯示弱化 `+N`，且具
  `aria-label="已收合 N 個下層任務"`；展開時不存在。
- guide layer：`aria-hidden`、`pointer-events:none`、不進 tab order；不改 native table role、headers、scope、rowSpan。

完整型別、資料流、幾何、DOM hooks、CSS hitbox 與 a11y 契約由 SPEC-121 §5 唯一管理。

### 使用流程

1. 使用者由既有 topbar `視角 → OKR模式` 進入同一 active board。
2. 使用者沿固定任務名稱欄的父層錨點、緊縮樹線與最後 sibling 終止位置辨識一個完整子樹。
3. 使用者將滑鼠或鍵盤焦點移到任務列，沿橫向閱讀導引比較該任務的 planning 資訊。
4. 使用者水平捲動查看右側欄位時，任務名稱與樹狀關係維持可見。
5. 使用者收合父任務後看到最小後代數量；再次展開後恢復原順序、rowSpan 群組範圍與互動。

### 實際 Repo Surface

| 類型 | Files |
|---|---|
| 新增 | `src/features/goalMode/hierarchyPresentation.ts`、DEV-121 static／browser verifier、SPEC-121、QA-DEV-121。 |
| 修改 | `src/components/GoalView.tsx`、`src/index.css`、`package.json`、`ai-doc/dev_task.md`、`ai-doc/documentation_map.md`。 |
| 條件修改 | DEV-116／119／120 verifiers 只可接受 additive hooks，不得刪除或放寬既有 assertions。 |
| 禁止 | shared hierarchy builder／row component、Goal content projection、TaskNode／filter／schema／API／permission／store／persistence／PWA session owner。 |

### Work Packages

| WP | 工作 | Gate |
|---|---|---|
| WP-121-A | 凍結 candidate hashes、建立 controlled fixture 與 fail-first tests。 | baseline、actor、fixture、runtime owner 可追溯。 |
| WP-121-B | 實作 Goal-only owned decoration projector。 | parent／ancestor／owner／sibling／count／invalid-input static cases 全通過，無重複 row metadata。 |
| WP-121-C | GoalView／Goal-scoped CSS 接入 tree、group surface、reading guide、`+N`。 | 不改 shared default、projection、mutation 或 scroll owner。 |
| WP-121-D | 真實 browser geometry、pointer／keyboard、actor、rowSpan、DnD、X/Y scroll、zoom、visual evidence。 | QA B／V／A／G cases 全部有 artifact。 |
| WP-121-E | DEV-116／119／120 回歸、type／lint／build／diff，凍結 RD candidate。 | 同一 source hash 全綠後交 QA／QC。 |

執行順序固定 A → B → C → D → E。

### 驗收與證據 Gate

- 兩個 root groups、L1～L4+、兄弟尾端、深層分支、長名稱、rowSpan owner／barrier、collapse、filter
  與 editor／viewer fixture 完整。
- 任一可見子任務可由非顏色 rail／elbow／位置追溯父路徑，並可辨識 root group 終點。
- content owner 數、rowSpan、covered DOM absence、內容、edit／expand／scroll session 接入前後等價。
- task／planning hover／focus 只導引同一 task row；shared content hover／focus 反向定位真實 owner，covered descendant 不誤亮 owner row。
- X-scroll 後 task-name／tree sticky left delta ≤1px；右側位移與 scroll delta 相差 ≤1px；scroll owner=1。
- disclosure、task details、right-click／Shift+F10、planning、content cell 與 DnD hitbox 無退化。
- 1440×900、1298×698、814×698、2x CSS zoom proxy、keyboard、editor／viewer 均有 computed geometry 與截圖。
- static S01～S23、browser B01～B13、visual V01～V20、a11y A01～A04、error G01～G02
  及 DEV-116／119／120 required regressions 必須在同一 frozen candidate 全通過。

```text
npm run verify:dev-121-goal-hierarchy-comparison
npm run verify:dev-121-goal-hierarchy-comparison-browser
npm run verify:dev-116-goal-mode
npm run verify:dev-116-goal-mode-browser
npm run verify:dev-119-goal-cell-actions
npm run verify:dev-119-goal-cell-actions-browser
npm run verify:dev-120-goal-planning-minimal-density
npm run verify:dev-120-goal-planning-minimal-density-browser
npx tsc --noEmit
npx eslint <DEV-121 changed TS/TSX files>
npm run build:test
git diff --check -- <DEV-121 owned files>
```

### Stop、Fail 與 Release Boundary

- Stop：需改 canonical hierarchy／projection、取消或模擬 `rowSpan`、改 content session／shared default、
  建立 split table／第二 X-scroll，或 native table 無法同時達成 sticky／guide／a11y。
- Fail：任一 order／level／rowSpan／owner drift、錯誤 rail／count、reading guide 進 group cell、hitbox 被擋、
  必要 focus／validation／locked 訊號被蓋、其他模式 drift、visible error 或 task-owned resource 未清理。
- Not verified：缺 source hash、fixture／actor provenance、computed geometry、screenshot、keyboard、viewer 或 scroll evidence。
- commit、push、PR、deploy、production smoke、原生 browser UI zoom 與正式資料環境驗證不在本 DEV 文件定案範圍。

### Architecture Closure R2（2026-09-14）

- branch `持續優化3`；HEAD `e335eaa07c14313afb5a27607a2c009ace3bcbc3`；current dirty tree。
- R2 初始定案：canonical hierarchy 兩次 pure 投影＋Goal-only decoration map＋同一 native table
  presentation layering；R7／R8 只加入 owned relation facts與 Goal-local 幾何，root boundary 與 planning selector仍重用既有 row facts／hooks。
- Tech Lead R2 結論：`PASS`；已刪除重複 projection fields／DOM hooks，不新增 selection state 或第二事件流；技術債 0。
- P0／P1 未決策：0。RD 可自行決定局部 symbol／class 名稱、等價中性色 token 與 verifier 實作細節；
  不得改動架構、資料流、幾何、hitbox、驗收門檻或禁止區。
- R2 規劃狀態已由下方 Implementation Closure R3 取代；本節保留架構決策與 baseline 紀錄。

### Implementation Closure R3（2026-09-14）

- WP-121-A～E 已完成。Goal-only pure projector、tree／group／reading presentation、收合後代數量、browser evidence、
  DEV-116／119／120 相容回歸與 quality gates 均已落地。
- 實作維持同一 native table、252px frozen-left task column 與單一 X-scroll owner；description／meeting native `rowSpan`、
  owner／covered semantics、content session、planning mutation、DnD、menu 與 viewer permission 未改變。
- DEV-121 static 12/12、browser 15/15；DEV-116 static 30/30＋browser PASS；DEV-119 static 18/18＋browser PASS；
  DEV-120 static 13/13＋browser PASS；`npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` PASS。
- Candidate evidence：`output/playwright/dev-121-goal-hierarchy-comparison/`（static result、browser result、V01／V02／V03／V05 screenshots）；
  regression evidence 於 DEV-116／119／120 對應 output 目錄。
- Release boundary：尚未 commit／push／PR／deploy／production smoke；原生 browser UI zoom、正式資料與獨立 release gate 仍 pending。

### Visual Correction Closure R4（2026-09-14）

- 依使用者回饋完成最小視覺修正：同一 root 群組內 rails 跨列重疊 1px 補齊斷點；disclosure 箭頭移到獨立左側 gutter，
  不再與父子階層連線重疊；不改 hierarchy、rowSpan、content session 或 single X-scroll owner。
- 新增 `V09-connector-continuity-and-disclosure-gutter`；DEV-121 browser 15/15，測得群組內最大 rail gap `0px`、
  disclosure-to-rail gap `8px`；DEV-116／119／120 browser regressions 均 PASS。
- Final source hashes：`GoalView.tsx`=`00FC3AD61B2CA3859844C1DD2AED81760C62D998A6D44CA8096A35F47F18056B`、
  `index.css`=`8FEF3E1EA3553CB1513CD865D5291FC48169141766271CDC0B49BBBA51BC28BE`、
  DEV-121 static=`0DBE8839E91E5E76AD99842AA85923DDA973EF6FEA43CE00654C0CC1ED7B483C`、
  browser=`512BA0AC53400FA3DA2DC1B8255C4B277960FBD3563E7F8498EA827E57C75D0E`。

### Visual Correction Closure R5（2026-09-14）

- 依使用者回饋移除 OKR 任務列之間的常駐橫向格線；保留欄位垂直邊界與 root group 2px 上邊界，
  不改階層連線、rowSpan、content session 或 single X-scroll owner。
- 新增 `V10-no-inter-task-gridlines`；DEV-121 static 13/13、browser 16/16，測得 task rows `bottomBorders=[]`、
  `rootBoundary=2px`；DEV-116／119／120 browser regressions 均 PASS。
- Final source hashes：`GoalView.tsx`=`E5DDAD392625EFF0F9D7B217600C331041F78B4B7DD600FA76A8466168E2A75E`、`index.css`=`7B2BFBD4BC811CADD0230C37502DABD302C71131BCFC2E6A8C5814AA95AA6DE7`、
  DEV-121 static=`FBFDD9A8C3C62A342D35A4B27F22DB4959DA012C6FCF4CF3738E3A90E0C1270E`、browser=`613280C9D0494F1C77350429EE951006682880EEAFA674C1BFEF66BB843E2A64`。

### Visual Correction Closure R6（2026-09-14）

- 依使用者回饋移除任務名稱欄最外側 level-0 continuation rail；level-0 elbow 保留短 branch，
  使階層仍可由縮排、箭頭、分支與更深層 rail 辨識。
- 新增 `V11-outermost-continuation-rail-removed`；DEV-121 static 14/14、browser 17/17，確認 continuation hidden、
  elbow vertical background transparent、branch 保留；DEV-116／119／120 browser regressions 均 PASS。
- Final source hashes：`GoalView.tsx`=`E5DDAD392625EFF0F9D7B217600C331041F78B4B7DD600FA76A8466168E2A75E`、`index.css`=`7CD097E3617D07EA28FB25EBC578716C675000F57F722D9AA58F24F8F6CB8127`、
  DEV-121 static=`D6D045FC708EE97F5D6307EB42CE2C2E76B61B244CF65DED23095B60878F9329`、browser=`499C562100754370C5BFB967D4501F9A7E1ADB168EA29A169D38948C3FAE6A29`。

### R7 Implementation Reopen（2026-09-14）

- 使用者確認保留有線樹狀表格，並要求重新建立可追溯到正確父任務的連線；不採 line-free 退回方案。
- R7 使用帶 `ownerTaskId` 的 relation segments、20px Goal-only depth、同列 4px endpoint、最後 sibling 中止、
  root group 隔離，以及位於任務欄右側的 disclosure 操作槽。
- hover／focus 只強調該父任務擁有的關係線與可見子樹；ephemeral scope state 不進 store 或 persistence。
- 保留 native `rowSpan`、252px sticky-left task column、single X-scroll、無任務間橫線及既有 content／planning ownership。
- 實作與驗證依 SPEC-121 R7、QA-DEV-121 R7 執行；完成前狀態維持執行中。

### R7 Implementation Closure（2026-09-14）

- 實作完成：每條 continuation／incoming／stem 具有 relation owner，同列 endpoint 與 last-sibling termination
  可直接指出任務；root 群組不跨接；disclosure 位於任務欄右側；hover／focus 只強調所屬子樹。
- 保留 native `rowSpan`、252px sticky task column、single X-scroll、無任務間橫線、planning／content owner 與 shared 6px default；
  Goal surface 局部使用 20px depth step／32px row。
- DEV-121 static 15/15、browser 20/20；DEV-116 30/30＋42/42、DEV-119 18/18＋17/17、
  DEV-120 13/13＋19/19；TypeScript、targeted ESLint、test build、diff check PASS。
- 實測 owner-lane gap `0px`、disclosure gap `145.5px`、endpoint 對列中心偏差 ≤`0.5px`，且 0 browser／HTTP／visible errors。
- 文件與 evidence：[SPEC-121](specs/SPEC-121-goal-hierarchy-comparison-grid.md)、
  [QA-DEV-121](qa/QA-DEV-121-goal-hierarchy-comparison-grid.md)、`output/playwright/dev-121-goal-hierarchy-comparison/`。
- local candidate 完成，QC Ready；未 commit／push／PR／deploy／release。

### R8 Implementation Closure（2026-09-14）

- 依使用者要求最大限度縮小 X 軸縮排，並接受移除 endpoint；保留有線樹狀關係，不回到 line-free 方案。
- Goal-local depth 由 20px 壓為 8px，lane start 為 20px，incoming branch 由 24px 壓為 12px，root branch 為 4px；
  endpoint segment 與樣式完全移除，線直接接到任務文字。
- `.task-title-text` 移除左側 padding；browser 量測 branch-to-title 絕對距離 ≤0.5px。
- owned relation、最後 sibling 終止、root group 隔離、樹線左側 disclosure、hover／focus 子樹、native `rowSpan`、
  252px sticky task column 與 single X-scroll owner 全部保留。
- DEV-121 static 15/15、browser 20/20；DEV-116 30/30＋42/42、DEV-119 18/18＋17/17、
  DEV-120 13/13＋19/19；TypeScript、ESLint、test build、diff check PASS。
- 實測 depth `8px`、lane start `20px`、branch `12px`、endpoint count=0、owner-lane gap `0px`、disclosure-to-guide left gap `0px`、branch-to-title distance `0px`；
  evidence 依 QA-DEV-121 R8 Execution Record。local candidate 為 QC Ready，未 commit／push／PR／deploy／release。

### R9 Soft Connector Tone Closure（2026-09-14）

- 依使用者要求降低樹狀線視覺噪音：normal 使用 `rgb(148 163 184 / 42%)`、active 使用 `rgb(99 102 241 / 76%)`，
  所有 connector 加上 `border-radius: 999px`；不改 R8 幾何、owner、endpoint removal、disclosure 位置、rowSpan 或 X-scroll。
- DEV-121 static 16/16、browser 21/21；V13 已驗證低對比色與柔和端角，0 browser／HTTP／visible errors。
- TypeScript、targeted ESLint、test build、diff check PASS；local candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R10 Active Task Lineage Highlight Closure（2026-09-14）

- 即時定位（hover／focus）時，目前任務自己的 parent-owned `incoming-vertical`／`incoming-branch` 與其 child stem、後代 incoming／continuation 同步 active；root task 沒有 parent relation，維持不新增線段。
- 不相干 root continuation 與 sibling group 維持中性；active scope 仍為 Goal-local ephemeral state，不改 projector、rowSpan、single X-scroll、資料或 persistence。
- DEV-121 static 16/16、browser 22/22；V14 驗證目前任務自有 incoming relation，0 browser／HTTP／visible errors。
- TypeScript、targeted ESLint、test build、diff check PASS；local candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R11 Active Contrast Closure（2026-09-14；歷史基線，R12 已修正 rowSpan owner 邊界）

- 即時定位的 active connector 提高為 2px，並保持在線軌中心；目前任務／planning cells 使用強化 indigo tint，後代使用次級 tint；
  R11 曾讓涵蓋目前任務的 rowSpan owner content 同步染色，後續由 R12 收斂為只有實際 owner task 染色。
- R10 的 self incoming lineage、root isolation、fixed task column、single X-scroll、native table／rowSpan 與資料流維持不變。
- DEV-121 static 16/16、browser 23/23；V14 stroke、V15 scope tint 與 0 browser／HTTP／visible errors 通過（行為基線已由 R12 修正）。
- TypeScript、targeted ESLint、test build、diff check PASS；local candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R12 RowSpan Ownership Contrast Closure（2026-09-15）

- 保留 native `rowSpan` 的父層內容脈絡；active scope 落在 covered descendant 時，ancestor owner cell 維持 group surface，
  不再讓子任務看起來擁有父層任務目的或會議紀錄。
- active scope 正好位於 description／meeting 的實際 owner task 時，owner cell 仍使用明顯 active tint，染色與資料所有權一致。
- R11 的 2px active connector、self incoming lineage、root isolation、fixed task column、single X-scroll、native table 與資料流維持不變。
- DEV-121 static 16/16、browser 24/24；V15 驗證 covered owner 不誤染、V16 驗證 owner 自身會染色，0 browser／HTTP／visible errors。
- TypeScript、targeted ESLint、test build、diff check PASS；local candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R13 Reverse Content Location Closure（2026-09-15）

- description／meeting 的實際 owner cell 在 pointer hover 或 keyboard focus 時回報既有 `ownerTaskId`，
  由同一個 Goal-local active scope 將定位、樹線與欄位 tint 對回真正所屬任務。
- covered descendant 維持無 content `td`，不會被誤當成任務目的／會議紀錄 owner；任務名稱與所有 planning 欄位以 rendered row
  的 task id 定位；離開 owner cell 且沒有 cell focus 時清除 scope。
- R12 的 rowSpan owner tint 邊界、2px active connector、self incoming lineage、root isolation、fixed task column、
  single X-scroll、native table、content session 與 planning mutation 維持不變。
- DEV-121 static 16/16、browser 27/27；B11 驗證兩種內容欄反向定位，B12 驗證六個一列一任務欄位，V17 驗證回到任務列後 owner identity 不漂移；
  0 browser／HTTP／visible errors。
- TypeScript、targeted ESLint、test build、diff check PASS；local candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R14 Scrollable Gridline Scope Closure（2026-09-15）

- 任務目的、會議紀錄與 planning 欄位恢復 1px 水平／垂直 cell grid，讓可捲動比較區能直接沿欄線比對；
  任務名稱固定欄維持無資料列格線，樹狀導引線與固定欄外側分隔仍保留。
- root group 2px 上邊界只在可捲動欄位顯示；native table、rowSpan、fixed task column、single X-scroll、
  active scope、content owner 與 planning mutation 均不變，未新增 table／gutter／第二 scroll owner。
- DEV-121 static 17/17、browser 27/27；V10 實測 scrollable cells gridline、task lane open 與 root boundary，
  B01～B12、V01～V17、A01～A03、G01～G02 皆維持通過；0 browser／HTTP／visible errors。
- TypeScript、targeted ESLint、test build、diff check PASS；local candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R15 Interactive Tree Node Toggle Closure（2026-09-15）

- Goal surface 的 chevron 已移除；既有 disclosure button 移到 task 自身 tree lane，以 6px expanded 實心圓／
  8px collapsed 空心圓呈現，20×20px hit target 的右緣不越過任務標題。
- node center 對準 own child-stem／root-branch 起點；可收合 root 在 collapsed 時仍保留 4px root branch，
  使圓點、關係線與任務標題維持可追溯關係。node dot 只在有子任務時存在，不恢復裝飾 endpoint。
- canonical `onToggle`、`aria-expanded`、動態 accessible name 與鍵盤 Enter／Space 均沿用 shared control；
  shared `TaskHierarchyIndentedRow`、row order、rowSpan、single X-scroll、DnD、menu、store 與 persistence 未修改。
- DEV-121 static 18/18、browser 28/28；V09、B03、A04、6 screenshots 與 0 browser／HTTP／visible errors 通過；
  DEV-116／119／120 regressions、TypeScript、targeted ESLint、test build、diff check PASS。
- local candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R16 Active Self Upstream Vertical Suppression Closure（2026-09-15）

- 定位 task 當列的 parent-owned `incoming-vertical` 與 `incoming-branch` 改為維持 inactive 1px normal tone，
  不再顯示使用者標示的粗藍上游線段；這項局部規則有意取代 R10 的 self incoming 全段 active 基線。
- task 自己的 child stem 與後代 incoming／continuation 仍維持 2px active，所以目標的父子指向與完整子樹關係沒有被移除。
- `GoalHierarchyGuides` 只增加 segment kind 判定；pure projector、tree geometry、node toggle、rowSpan owner、
  reverse location、fixed task column、single X-scroll、資料、store 與 persistence 均不變。
- DEV-121 static 19/19、browser 28/28；V14 驗證 self upstream vertical／branch inactive 1px、
  descendant vertical active 2px，且 browser／HTTP／visible errors 為 0。
- DEV-116／119／120 regressions、TypeScript、targeted ESLint、test build、diff check PASS；local candidate 維持
  QC Ready，未 commit／push／PR／deploy／release。

### R17 Tree X-axis Spacing Closure（2026-09-15）

- Goal 樹狀線 X 軸層級間隔由 8px 增加 30% 為 10.4px；同一 token 同時驅動 rails、node center、task title inset，
  branch-to-title 維持 `0px`，不新增 gutter 或斷線。
- lane start 20px、incoming branch 14.4px、root branch 4px、20×20px node hit target、native table、fixed task column、
  single X-scroll 與 R16 定位線降噪規則維持；shared 6px default 與其他模式不變。
- DEV-121 static 20/20、browser 28/28；V02 computed depth step `10.4px`、browser／HTTP／visible errors 為 0。
- DEV-116／119／120 regressions、TypeScript、targeted ESLint、test build、diff check PASS；local candidate 維持
  QC Ready，未 commit／push／PR／deploy／release。

### R18 Neutral Task-name Surface Closure（2026-09-15）

- 定位／focus scope 生效時，frozen task cell 不再套用 active／hover fill；R19 進一步收斂所有層級到同一白色底色。planning controls 與實際 content owner cell 繼續使用 active tint，樹線與 focus ring 維持定位回饋。
- DEV-121 static 21/21、browser 28/28；DEV-116／119／120 相容 static／browser regressions、TypeScript、targeted ESLint、test build、diff check 全部 PASS。
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R19 Uniform Task-name Surface Closure（2026-09-15）

- 依使用者要求，root、L1、L2+ 所有 hierarchy levels 的 task-name fixed cells 共用 `bg-white`／`rgb(255, 255, 255)`；移除依 `node.level` 切換的 task-name surface，避免同一任務樹出現不同底色。
- task-name lane 的無資料列格線、planning／content owner active tint、樹狀線與 node focus 回饋維持；沒有改動 rowSpan ownership、reverse location、single X-scroll、資料或 persistence。
- DEV-121 static 22/22、browser 29/29；DEV-116／119／120 相容 static／browser regressions、TypeScript、targeted ESLint、test build、diff check 全部 PASS。（R19 歷史紀錄）
- 本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R20 Soft Located Task-name Tint Closure（2026-09-16）

- 依使用者要求，定位／focus scope 的固定任務名稱欄恢復必要的藍色定位訊號，但改採低飽和、半透明色階：parent 使用 `rgb(224 231 255 / 72%)`，descendant 使用 `rgb(239 246 255 / 76%)`，標題使用 `rgb(79 70 229)`。
- idle 時 root、L1、L2+ 仍共用 `rgb(255 255 255)`；planning／content owner 的既有 ownership、rowSpan 與 active scope 邊界不變，樹狀線幾何與 2px active stroke 不變。
- DEV-121 static 22/22、browser V20 computed-style readback 通過；TypeScript、targeted ESLint、test build、diff check PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。（R20 歷史紀錄）

### R21 Description Column Collapse Closure（2026-09-16）

- 任務目的欄表頭新增原生收合／還原 button；`aria-expanded=true` 表示完整內容可見，按下後 `aria-expanded=false`，欄位收斂為 32px 控制軌，目的內容與 owner cell 停止渲染。
- 收合狀態保留同一表頭控制，點擊即可恢復；placeholder 不承載內容、`ownerTaskId`、active content scope 或編輯 session，因此不改變 rowSpan ownership、欄位順序、native table 或 single X-scroll。
- DEV-121 static 23/23（含 S23）與 browser 32/32（含 B13、V20）通過；browser 實測 expanded → collapsed（32px、owner count 0）→ expanded，TypeScript、targeted ESLint、test build、diff check PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R22 All Goal Columns Collapse Preference Closure（2026-09-16）

- 任務名稱、任務目的、會議紀錄、負責人、狀態、開始日期、結束日期與工期均改用同一表頭 toggle；一般欄位收合為 32px，固定任務名稱欄收合為 88px hierarchy control track，保留樹線與節點操作。
- 收合欄位停止渲染內容、編輯器與 planning controls，只保留空白 placeholder 與還原控制；native table、欄位順序、rowSpan、固定左欄與 single X-scroll 維持。
- `goalCollapsedColumns` 以登入帳號 uid 保存於 `profiles.ui_preferences.layout`，local cache 立即寫入，remote 使用既有 preference hydration／write chain；重新載入後恢復同一帳號偏好，換帳號不共用。
- DEV-121 static 24/24（含 S23～S24）與 browser 34/34（含 B13～B15）通過；TypeScript、targeted ESLint、test build、diff check PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R23 Fixed Task-name Lane Closure（2026-09-16）

- 依使用者最新要求，移除任務名稱欄的欄位收合鈕；該欄永遠以 252px sticky lane 顯示，任務名稱、樹狀線、節點圓點與標籤保持可讀。
- 任務目的、會議紀錄、負責人、狀態、開始日期、結束日期與工期仍可由表頭收合為 22.4px（computed 約 22px）並恢復；帳號 scoped `goalCollapsedColumns` 偏好維持，既有 `task` key 由 UI normalization 忽略。
- GoalView 不再為 task lane 建立 collapse state、toggle 或 88px 寬度分支；native table、single X-scroll、rowSpan ownership 與反向定位不變。
- DEV-121 static 25/25（含 S25）與 browser 34/34（含 B14～B15）通過；TypeScript、targeted ESLint、test build、diff check PASS。本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

### R24 Compact Column Toggle Visual Closure（2026-09-16）

- 可收合欄位表頭改為低噪音 compact control：標籤與按鈕採 `justify-between` 對齊，原生 button 維持 24×24px hit／focus target，內層可見框縮為 18×18px、5px radius，箭頭為 11px。
- expanded 使用半透明白底、低對比邊框與極輕陰影；collapsed 才使用柔和 primary tint。同一箭頭旋轉 180° 表達還原方向，並保留 `aria-expanded`、accessible name、hover、focus ring、pressed feedback 與 reduced-motion。
- 任務名稱固定欄仍沒有欄位收合鈕；其他欄位的 22.4px compact track、帳號 scoped preference、rowSpan ownership、single X-scroll 與反向定位維持。
- DEV-121 static 25/25、browser 34/34 通過；B13 readback button 24px、glyph 18px、radius 5px 與 expanded／collapsed 色差，並保存 normal／collapsed screenshot。TypeScript、targeted ESLint、test build、diff check PASS；未 commit／push／PR／deploy／release。

### R25 Compact Collapsed Width Closure（2026-09-16）

- 依最新需求，其他可收合欄位的 compact track 由 32px 縮減 30% 為 CSS `22.4px`（瀏覽器 computed 約 22px）；任務名稱固定左側欄維持 252px 且仍無欄位收合鈕。
- expanded control 維持 24×24px／18×18px；collapsed control 改為 20×20px／16×16px，分別使用 5px／4px radius，保持小巧、可辨識、可鍵盤操作與 reduced-motion 行為。
- 收合 placeholder、rowSpan ownership、帳號 scoped `goalCollapsedColumns`、single X-scroll、反向定位與所有欄位順序不變。
- table 寬度同步鎖定為目前欄位總寬（`width` 與 `minWidth` 同值），多欄同時收合時不再由 `w-full` 將 22.4px compact track 拉寬；實測 7 欄全收合 table 為 409px。
- DEV-121 static 25/25、browser 34/34 通過；B13／B14 讀回 22px computed track 與 20／16px compact control，TypeScript、targeted ESLint、test build、diff check PASS；未 commit／push／PR／deploy／release。

### R26 Date Placeholder and Content-fit Width Closure（2026-09-17）

- 移除開始日期與結束日期空值時額外渲染的 `—`，避免與原生 date input 的空值呈現重複；日期編輯、鎖定與反向定位行為維持。
- 規劃欄基準寬度調整為 owner `144px`、status `72px`、start `112px`、end `112px`、duration `84px`；表頭標籤改為完整單行，不再以 `truncate` 截斷標題。
- collapsed 22.4px compact track、252px fixed task lane、table width lock、rowSpan／content owner、single X-scroll、account preference 與 tree／location renderer 均維持。
- DEV-121 static 26/26、browser 35/35（含 B16 空白日期與欄寬／標題 overflow readback）；TypeScript、targeted ESLint、`npm run build:test`、`git diff --check` PASS；未 commit／push／PR／deploy／release。

### R27 Remove Duration-lock Marker Closure（2026-09-17）

- 移除結束日期欄內由 `isDurationLocked` 產生的 `L` 標記，保留結束日期唯讀、工期鎖定切換與依賴關係 Link 提示。
- 新增 B17／S27 驗收，確認工期鎖定時日期仍受約束、工期控制仍可見，且日期欄不含重複 `L`。
- DEV-121 static 27/27、browser 36/36（含 B17 工期鎖定標記移除）；TypeScript、targeted ESLint、`npm run build:test`、`git diff --check` PASS；未 commit／push／PR／deploy／release。

### R28 Meeting History Scroll Clipping Closure（2026-09-17）

- 保留會議紀錄欄原生 rowSpan 與內部 Y 捲軸；collapsed viewport 向下對齊 20px 文字行高，維持既有 single X-scroll 與 content ownership。
- `useLayoutEffect` 監聽 scroll／ResizeObserver，將部分落在 viewport 的 quick-note row 標記為 `data-goal-content-row-clipped="true"`，以 `visibility:hidden` 隱藏整列並保留高度，捲動到完整可見時再顯示。
- 未新增資料、store、schema、persistence 或第二捲軸；expanded 內容仍可完整檢視。DEV-121 static 28/28、browser 37/37、TypeScript、targeted ESLint、test build、diff check PASS；本機 candidate 維持 QC Ready，未 commit／push／PR／deploy／release。

使用思考習慣：#設計思考、#差距分析、#問對問題、#簡潔優先、#系統描繪、#限制條件、#可驗證性

## DEV-122：ProJED 手機零資料載入快速建待辦

- 文件成熟度：`RD Implementation Complete / 架構已定案 / Human Confirmed / Production Verified with Accepted Exceptions / REL-002`。
- 審查：2026-09-16 Architecture Closure R12；使用者確認快速建立功能須隨ProJED主程式一起安裝。現有quick MPA、第二install identity、Auth／outbox／RPC與零資料載入邊界保留；R12固定manifest唯一來源、build／precache、既有安裝更新、真實icon metadata、同帳號安全鏈與平台適用性，不新增runtime、資料或權限責任。
- 架構定案：`PASS（2026-09-16 Architecture Closure R12；P0／P1 unresolved = 0）`。root `id='/'`、`start_url='/'`、`scope='/'`保持不變，`shortcuts[0].url='/quick-task/'`；quick manifest `id='/quick-task/'`仍是選用第二圖示。單次安裝不承諾自動產生兩個獨立OS圖示，既有安裝不承諾捷徑即時刷新。
- 狀態：R12 WP-122-0B已實作，Local Targeted QA-QC、Level 3、inactive production candidate與canonical production均PASS；production-safe同帳號建立、root工作台唯一讀回與cleanup亦PASS。使用者接受DEV-096 real-SW失敗、實機與完整B／W／P／獨立QA-QC缺口作為REL-002殘餘風險，終態為`Production Verified with Accepted Exceptions`。節點類型：交付點；優先級P1；已計入產品交付。
- 需求來源：`USER-20260914-MOBILE-QUICK-TODO-ZERO-DATA-LOAD`、
  `USER-20260914-MOBILE-QUICK-TODO-DIRECT-VOICE-ENTRY`、
  `USER-20260914-GUIDED-DECISIONS-1A-2A-3B`。
- 父任務：DEV-034、DEV-039；相容依賴：DEV-041／096／097、DEV-115。
- 實作權威：[SPEC-122](specs/SPEC-122-mobile-zero-data-quick-task.md)。
- 架構取捨：[ADR-050](decisions/ADR-050-mobile-quick-task-entry-and-outbox.md)。
- 驗收案例：[QA-DEV-122](qa/QA-DEV-122-mobile-zero-data-quick-task.md)。

### 問題與產品決策

現場使用者收到待辦時，只需先記住任務名稱。安裝ProJED主程式後，支援app shortcuts的平台可從ProJED圖示直接選「快速建待辦」；需要單鍵桌面入口者仍可選裝第二個「ProJED快速建待辦」圖示。兩種入口都直接開啟同一`/quick-task/`，不先載入工作區、看板、成員或任務清單；遠端owner由固定JWT、server `auth.uid()`與receipt owner readback證明。獨立quick圖示若沒有共享session則要求登入，不以同源或UI文字推測帳號。

| 題號 | 已確認決策 | 未採用方向 |
|---|---|---|
| 1 | `1A` 語音結束只更新名稱，使用者按建立／鍵盤完成才保存 | 語音結束立即建立、倒數自動建立 |
| 2 | `2A` 從游標位置加入；有選取則取代選取，保留其餘文字 | 取代整個名稱、只允許空欄使用 |
| 3 | `3B` 本機保存後停在成功畫面，提供再記一筆／前往工作台 | 自動清空、自動轉到完整工作台 |
| 4 | ProJED 主程式 manifest 內建「快速建待辦」捷徑；第二個 quick icon 保留為選用安裝 | 宣稱一次安裝自動建立兩個 OS 圖示、移除獨立 quick manifest |

名稱旁固定可見麥克風＋「語音」，觸控目標至少48×48 CSS px。Web Speech可用時在tap內啟動；
否則引導系統鍵盤聽寫，不宣稱網頁能代按鍵盤麥克風。平台限制與完整UI/voice/IME契約見SPEC第7節。

### 範圍與唯一契約

本期包括：root manifest app shortcut、獨立MPA/PWA入口、設定頁雙入口說明、最小名稱／語音／成功畫面、account-bound IDB outbox、既有Google OAuth認領、
單筆create RPC＋永久compact receipt、固定request身分、本機逐筆恢復、PWA更新整合、工作台到達／hydration相容與QA。
不包括：由一次 PWA 安裝自動建立兩個獨立 OS 圖示、保證所有 iOS／瀏覽器都顯示 app shortcut、選專案／指派／日期／附件、瀏覽既有任務、自有轉錄、native App、獨立origin、遠端migration或release。

工程參數、狀態表、錯誤碼、schema與逐檔責任只在SPEC-122維護；本DEV只保留任務進度與派工入口。
ADR記錄取捨，QA定義驗證；不得在三份文件重複維護完整RPC或state contract。

### Tech Lead R4 修正結論

| 發現與證據 | 本版修正 |
|---|---|
| SDK在request時讀最新session，account guard後仍可換成B token | 同一owner/token/epoch快照，單筆fetch固定Authorization；claim用同token驗證並CAS，不新增client |
| root首頁不保證工作台開啟，部分view或無board沒有panel host | 一次性root intent、既有open command與互斥panel host；維持view／草稿，remote hydration不等board |
| 失敗record雖保留title，原UI只有數量／泛用retry | 有backlog才顯示本機逐筆恢復；本人同ID重試，conflict複製／確認；8次暫停不被前景事件重置 |
| OAuth callback含`capture／claim`時可能因cache key不同而miss quick precache | 在唯一Workbox設定集中有限query normalization；不在頁面刪query或增加第二worker |
| 無receipt的既有capture id與int32 order邊界可能被當成一般DB錯誤 | RPC在同一transaction前置檢查並回`QT_EXISTING_ROW_INVALID`／`QT_ORDER_EXHAUSTED`；client保留原capture供人工處理 |

R2的immutable receipt、progressive bootstrap／voice、OAuth／cache及WP0修正保留；R3明確化IDB index與claim reload guard；R4把callback query與RPC資料邊界收斂在唯一基礎設施／資料庫責任點。
工程細節為 `Intentional replacement`，保留產品決策；現有unplaced PK/RLS、TaskNode內容與placement責任
為 `Compatible extension`。未決P0／P1工程問題=0，真機可行性仍是未執行的phase gate。
六個責任點（raw HTML、quick controller、IDB outbox、fixed JWT adapter、single RPC、root intent）各自只有一個authority；
不得再加入第二worker／client、通用queue、remote inbox或平行draft store，除非先提出可驗證的ADR amendment。
沒有把這次文件自我檢查宣稱為獨立QC或產品PASS。

### Implementation correction R5

- raw `quick-task` form 增加 `onsubmit="return false"`，JavaScript module 延遲時按 Enter 不導覽、不遺失原文；controller submit 同步檢查 IME composition。
- browser verifier 已補上 fallback、IME、lease／claim、geometry、delayed module、voice insertion 與零業務 HTTP request sweep；R4 六責任點、資料模型、權限與 phase gate 不變。
- full `npx tsc --noEmit` 本輪 PASS。

### Implementation correction R6

- `finishQuickCaptureLease` 在第 8 次自動 retryable failure 後，將 record 明確轉為 `failed_permanent` 並寫入 `AUTO_RETRY_EXHAUSTED`；`nextAttemptAt` 維持 `null`，foreground／online 不再重新取得 lease。
- `retryQuickCapture` 只對使用者明確按下人工 retry 的 exhausted record 重置 `attemptCount` 與 state；資料、帳號、receipt、lease owner 與 RPC 契約不變，沒有新增 state authority。
- static S19～S21 與 quick browser `SM12`／`SM13` 已驗證「未綁定 recovery 可見→明確 claim」及「8次失敗→永久暫停→下一次lease阻擋→人工retry重置」；S20 另固定 `Retry-After` 不得把永久暫停重新寫成可重試；R5 的 raw form／IME guard 與完整 phase gate維持。

### Compatibility correction R7

- DEV-097 browser 的原始 local failure 已分類為 `existing-regression-verifier-contract-mismatch`，修正後於 2026-09-14 完整 browser verifier PASS；診斷與 PASS artifact 分別為 `output/qa/dev-122/dev-097-compatibility-diagnostic.json`、`output/playwright/dev-097/ui-result.json`。verifier source SHA-256 為 `B80B3B8EF8A89C3EC9F0B7FFA513A08097E8B6947DFA86C63C11F729128F1DDE`。
- 修正後驗證器操作設定前會先展開預設收合的側欄；空標題 prepare 失敗後，會議模式 `forceFlushMeetingDraft` 只代表 IDB recovery snapshot 已保存，不能推論 canonical record owner 已 safe。verifier 仍保留 fail-closed readback，並在 recovery 後執行明確的 user-confirmed canonical boundary；若未來要改產品 navigation／owner oracle，仍須另提 ADR amendment。
- R7 不改 DEV-122 六個責任點、資料／安全／ownership boundary、worker、RPC 或 Workbench intent；DEV-097 browser gate 已解除。真機、完整 B/W/P 與正式 QA/QC 維持未驗證，並由REL-002 accepted residual risks承接，不改記PASS。

### Install guidance correction R8

- `quick-task/?install=1` 由 quick 自有輕量 install guide 處理；Android／桌面在 `beforeinstallprompt` 可用時由使用者明確點擊原生安裝，iOS／內嵌瀏覽器顯示適用指引，名稱欄保持可立即輸入。
- R8 不新增 worker、client、state authority、storage、RPC 或資料邊界；SM14／SM15 與 `quick-task-install-390x844.png`、`quick-task-install-ios-guidance-390x844.png` 已通過本機 smoke，D01～D04 真機 install promotion 仍待 QA／QC。

### Mixed-writer lock correction R9

- quick create RPC 已改用既有 `move_task_workbench_subtree_v2` 的 `account:<owner>:unplaced:parent:root` transaction advisory scope；quick 建立與 board↔unplaced placement 的排序／ownership mutation 不再各自使用不同 lock key。
- static S11-lock-scope guard 與 isolated PostgreSQL／固定 fixture pgbench 已重新 PASS；40-client mixed-writer-compatible fixture（20 Quick RPC＋20 test-only existing append fixture）產生 40 個連續唯一 order。這是 lock domain 相容性 evidence，不代表 P07 真實 mixed-writer placement transport、P10 placement 或完整 full-schema API／fault gate 已完成。

### Voice fallback lifecycle correction R10

- 根因是 voice adapter 回報 `fallback` 後 controller 保留舊 `voiceSession`；第二次 tap 只會停止舊 session，不能重新開始 recognition。
- fallback 現在立即清除 session，再顯示鍵盤聽寫引導；SM05 已驗證 fallback 後再次點擊語音可取得新 final transcript `再試語音重試`。
- 這是 quick controller 內的生命週期修正，不新增 worker、client、state authority、權限邊界或資料流；真機 permission denial／無聲音仍待 D06／D07。

### Main App bundled shortcut amendment R11

- `public/manifest.webmanifest` 新增一筆 `shortcuts` entry，顯示名稱為「快速建待辦」，URL 固定 `/quick-task/`，圖示沿用 quick identity 的既有資產；root manifest 的 `id='/'`、`start_url='/'`、`scope='/'` 與一般啟動行為不得改變。
- root shortcut 只是一個隨 ProJED 主程式安裝的快速啟動面；它與選用安裝的 quick manifest `id='/quick-task/'` 同時存在，兩者都到達既有 raw MPA。不得把 app shortcut 描述成第二個自動安裝圖示。
- `AppInstallAssistant` 在手機版與電腦版設定頁用一般使用者語言說明：安裝主程式後，支援的平台可由 ProJED 圖示選「快速建待辦」；需要桌面單鍵入口時，再選裝「ProJED快速建待辦」。不在產品文案暴露 manifest、scope 或 service worker。
- 同帳號契約不新增bridge：root shortcut不傳帳號或憑證；直接同步以固定JWT snapshot、server `auth.uid()`與receipt owner equality判定，OAuth claim才使用`getUser(snapshot.accessToken)`。session過期或獨立quick context沒有session時先登入再同步，任何情況都不得由UI或local hint自行指定owner。
- 不支援 manifest shortcuts 的平台可以忽略該 entry，ProJED 一般啟動、設定頁 quick CTA 與選用第二圖示仍須可用；iOS 不得顯示未經 target-device 證明的長按捷徑承諾。

### Tech Lead Architecture Closure R12

- `public/manifest.webmanifest`是root唯一source of truth；現行`VitePWA({manifest:false})`、root HTML單一link、`dist/manifest.webmanifest`及root worker precache由S15／W07共同鎖定。預期不修改`vite.config.js`。
- shortcut固定第一順位、URL `/quick-task/`，既有PNG實際為1024×1024，root與quick manifest都必須誠實宣告該尺寸；不建立重複icon資產。
- WP-122-0B產品write surface固定為兩份manifest metadata、`AppInstallAssistant.tsx`及DEV-122／DEV-034直接verifier。不得修改Auth、quick runtime、API、schema、RLS、worker設定或Firebase rewrite。
- 全新安裝以D08驗證；既有安裝先由W07證明Web artifact已從A更新至B，再以D10觀察平台manifest／shortcut刷新。平台可延遲或忽略，產品不增加UA猜測、輪詢、OS捷徑偵測或強制刷新。
- Android Chrome/WebAPK與Chromium桌面是主要shortcut gate；macOS Safari 17.4+有裝置時補充；iOS/iPadOS固定驗一般root launch、設定頁CTA與選用加入主畫面fallback。
- Tech Lead review：`PASS`，P0／P1 unresolved=0。2026-09-17已完成R12產品實作與local targeted gates；這不代表D08～D10、完整QA/QC或release完成。

### Architecture Closure Handoff（Tech Lead R12）

- 已凍結的六個責任點只有：raw HTML quick entry、quick controller、IndexedDB outbox、固定 JWT adapter、單一 create RPC、一次性 root intent；不得再引入第二 worker／client、remote inbox、通用 queue 或平行 draft store。
- 已凍結的資料與安全邊界：client 不讀業務清單、不計算 owner／workspace／order、不傳 owner 或 task JSON；server／既有 authority 維持 context、排序、payload defaults、idempotency、RLS 與 placement。
- WP-122-0B root bundled shortcut已在local candidate完成，S15、B22～B24、W07與受影響回歸PASS。D01～D10、完整B／W／P、真機與正式QA／QC尚未完成。root shortcut不得冒充第二圖示gate，也不得把未支援平台記為shortcut PASS。
- DEV-097 browser 相容 gate 已由修正後 verifier PASS 解除；SM05 fallback 後語音重試、`install=1` 安裝引導、原生 prompt、iOS 指引 smoke、quick／existing placement共用account-unplaced advisory lock guard與 40-client mixed-writer-compatible fixture亦已PASS；diagnostic、`ui-result.json`、SM14／SM15、S11-lock-scope與mixed-writer artifact僅證明既有 owner matrix／本機 UI事件／lock domain相容性，不能替代DEV-122的target-device、真實P07 placement、完整B／W／P或正式QA／QC證據。
- 若後續工作需要新增 API／schema／RLS／state／ownership、第二 origin／worker、放寬既有 regression oracle，立即停止受影響 WP，提出 ADR amendment 後再繼續。

### RD Work Packages 與 Phase Gates

固定順序與逐WP required cases見SPEC第8節、QA第4及11節：

| WP | 可執行交付 | 出口 |
|---|---|---|
| WP-122-0 | 最小MPA／manifest／icon／install CTA與quick routing | D01～D04依平台適用性驗證第二icon、launch、storage sentinel |
| WP-122-0B | canonical root manifest bundled app shortcut＋設定頁說明＋既有安裝更新 | S15、B22～B24、W07、D08～D10；一般root launch不變，shortcut launch仍是zero-data quick route |
| WP-122-1 | progressive shell、build/version、SW query cache、offline | S01～S05、B01/B16、W01/W05與D05所需能力 |
| WP-122-2 | input／voice／IME／success／install／accessibility | S06/S07/S09、B03～B06/B14/B17與D06所需能力 |
| WP-122-3 | RPC＋private receipt／RLS、generated types與minimal adapter | S10/S11、P01～P14；isolated DB及advisors review |
| WP-122-4 | outbox／auth claim／固定JWT sync／本機恢復／safe reload | S08/S13、B07～B12/B18/B19/B21、W02～W04/W06與D07所需能力 |
| WP-122-5 | 工作台一次性到達／互斥host／hydration與完整交付驗證 | S12/B13/B20、全部適用案例、效能與D01～D10真機證據、targeted回歸、QA/QC收斂 |

WP-122-0B 是本輪唯一可執行產品 slice，完成後回到既有 target-device／QA-QC gate。缺裝置或HTTPS candidate標示未充分驗證，不可偽造PASS；平台不實作 manifest shortcuts 時走已定 fallback，不視為第二 App feasibility PASS 或 Fail。一般implementation bug回RD，平台確實無法達到選用第二圖示才回ADR評估獨立origin。

### 驗收與執行邊界

- 名稱立即可編輯；必要module ready後才啟用建立／語音，JS延遲不造成Enter導覽或文字進URL。
- 未送出目前輸入時不產生它的RPC，業務list request始終為0；既有outbox補送及SW precache分別記錄。
- IDB commit/readback後才顯示已記下；server receipt驗證後才顯示已建立，不承諾待同步已在工作台。
- 原capture ID跨不明commit結果、timeout、離線、重開與task生命週期重播仍只建立一次。
- A待辦在account guard後切到B也不帶B token；失敗資料能從本機待處理入口逐筆取回且不覆蓋目前輸入。
- 前往工作台須真正在root打開單一panel，含需要登入／無active board；不以URL改變代替到達驗收。
- 320／390、鍵盤展開、200%文字縮放、可見語音入口、真實平台fallback、帳號切換皆符合QA。
- 新安裝 ProJED 的一般點擊仍開 `/`；支援平台從 ProJED app shortcut選「快速建待辦」時開 `/quick-task/`，不支援平台不顯示虛假承諾且仍能由設定頁進入。
- root shortcut不傳帳號；同步必須由snapshot Bearer token、server `auth.uid()`與receipt owner equality證明同一actor。選用quick icon若沒有session只能進登入／待同步流程，不能建立到其他帳號。
- UI/API/DB與真機證據須對應同一收斂candidate；source scan或build不能代替完整交付路徑。

基線repo：`C:\VIBE CODING\ProJED\ProJED`；branch `持續優化3`；current HEAD
`5ee11786da4db07b9f125b0e315873dda479d1c9`加DEV-122文件dirty tree；R12產品與verifier對HEAD無diff，source hash與local targeted artifacts已記錄於SPEC-122／QA-DEV-122。驗證期間HEAD由外部流程推進，本輪未執行commit；Git author／committer只作provenance，不推定實際開發操作者。
`PwaReloadSafetyBridge.tsx`、`pwaReloadOwnerManifest.ts`、`TaskWorkbenchPanel.tsx`、`package.json`等已有其他DEV修改；
只允許語意合併，禁止reset／checkout／整檔覆寫。超出SPEC已列file/schema/API契約才回到規劃，不把預定additive migration本身誤判為drift。

R10以前已完成DEV-122 local candidate implementation，並從乾淨detached `HEAD 7b16ddf6e3af1d3bf26e3267c19de33fe343ecd4`建立歷史staging artifact；當時working tree的DEV-116／121／124未提交修改明確排除。R12 root shortcut契約於2026-09-17完成；以下段落保存production activation前的local evidence快照，當時未執行遠端migration、commit、push或production activation，2026-09-16非live Firebase Hosting preview不含R12且已到期。
Production activation前的R12 local targeted evidence為：S15 static總計23 assertions、B22～B24、W07、DEV-034 static／browser、DEV-096 static 26/26＋browser、DEV-097 static 23/23＋browser＋real-SW、DEV-115 static 21/21＋browser B01～B09、TypeScript、targeted ESLint、test build、task-owned isolated PostgreSQL core matrix（22 checks）、20-client concurrent及40-client mixed-writer-compatible transport均PASS。DEV-096 real-SW歷史PASS仍保留作既有相容證據，但本輪連續重跑未通過，不能覆蓋最新結果。當時尚未取得新的R12 HTTPS candidate、D08～D10、真機D01～D07、P07真實mixed-writer placement transport、P10 placement／P11 advisor／P12-P14 full API/fault matrix、完整B/W regression及正式QA/QC sign-off，本機亦無ADB／Xcode simulator，故當時不可標記完成；其後Level 3、production candidate與REL-002替代結案條件已完成。獨立origin／native voice維持SPEC第12節future capsule。

Local candidate evidence（2026-09-17，`localhost:4000` reused；process owner 25128 preserved）：
`npm run verify:test-env`、`npm run verify:staging-env`（環境解析唯讀，無遠端 mutation）、targeted ESLint、`npm run build:test`、`npx tsc --noEmit` PASS、
`npm run verify:dev-122-mobile-zero-data-quick-task`（23 assertions，含S15）、
`npm run verify:dev-122-mobile-zero-data-quick-task-browser`（15 local smoke assertions PASS；含 fallback 後語音重試、`install=1` 安裝引導、原生 prompt 與 iOS 加入主畫面指引，詳細以 result.json 為準）、
`npm run verify:dev-122-mobile-zero-data-quick-task-root-browser`（R01～R03＋B22～B24 PASS）、
`npm run verify:dev-122-mobile-zero-data-quick-task-sw`、
`npm run verify:dev-122-mobile-zero-data-quick-task-db-isolated`、`npm run verify:dev-122-mobile-zero-data-quick-task-db-concurrent`、`git diff --check` 均通過。
產物與截圖位於 `output/playwright/dev-122-mobile-zero-data-quick-task/`，相容 DEV-097 browser artifact 為 `output/playwright/dev-097/ui-result.json`，DB 檔案位於 `output/qa/dev-122/`（含 `db-isolated-result.json`、`db-concurrent-pgbench.txt`、`db-concurrent-check.txt`、`db-concurrent-mixed-pgbench.txt`、`db-concurrent-mixed-check.txt`、`dev-097-compatibility-diagnostic.json`）；`db-isolated-result.json` 含 migration／matrix／concurrent fixture sourceHashes、mixed-writer-compatible result 與 runtime cleanup；isolated matrix使用task-owned loopback runtime，沒有套用遠端或既有資料庫 migration；既有 Docker Supabase runtime 僅做唯讀 schema presence check，未套用 DEV-122 migration／placement RPC。
相容回歸另完成 DEV-096 static 26/26 + browser、DEV-097 static 23/23 + browser + real-SW、DEV-115 static 21/21 + browser B01～B09；DEV-096 real-SW 本輪重跑兩次均在 B→C controller convergence 失敗，最新 fail artifact 為 `output/playwright/dev-096/sw-integration-result.json`，不得以歷史 PASS 取代本輪結果。DEV-097 browser 的原始 verifier 契約落差已修正，PASS artifact 為 `output/playwright/dev-097/ui-result.json`，不能再用 readiness timeout 描述取代實際結果。

Compatibility execution addendum（2026-09-17）：依使用者要求執行剩餘可執行的 browser QA。DEV-122 quick／root、DEV-034／041 browser、DEV-096 browser、DEV-097 browser、DEV-115 browser均PASS；DEV-122 static／SW／isolated DB／concurrent DB、DEV-034／041／096／097／115 static亦PASS。所有 browser均重用既有 `localhost:4000`，未停止 PID 25128。DEV-096 real-SW 連續兩次仍停在 `release:dev096-A`／`awaiting-controller`，兩次臨時 runtime 均已清理並確認 port released；此項維持 `Pending / verifier timing regression`。本輪仍尊重已豁免的 Android／iPhone 實機 shortcut、真實語音／鍵盤聽寫與同帳號返回，未將其他尚未執行的 device、完整 B/W/P 或獨立 QA/QC 案例改寫成 PASS。

### Release Exception Decision（2026-09-17）

- 使用者明確接受本次release不執行Android／iPhone實機shortcut、真實語音／鍵盤聽寫與同帳號返回案例，並接受DEV-096 real-SW最新兩次失敗及完整B／W／P、正式Supabase full matrix與獨立QA/QC未執行的殘餘風險。
- 此決策是`Intentional release exception`，不把FAIL改為PASS、不刪除原始artifact，也不改寫SPEC／QA的完整驗收契約；後續release仍須在紀錄中揭露這些accepted residual risks。
- 此決策本身不等於live activation授權。production sealed artifact與inactive candidate其後另行完成；REL-002再取得exact release核准並完成live activation、canonical root／quick／manifest／SW smoke、production-safe同帳號單筆建立readback與cleanup，現已標示`Production Verified with Accepted Exceptions`並計入交付。
- 正式release record須保存source commit、artifact hash、Firebase release／version、rollback anchor、production smoke與cleanup結果；若production smoke失敗，立即停止結案並依既有rollback gate處理。

### Production Candidate Verification（2026-09-17）

- Immutable release `20260917080116-1a5f27`（source `5ee1178`；tree SHA-256 `47442a73f5a5f75f31b4d204cde368a92cd24470d39bd5a0ad6fa809c4ccf383`；45 files）已部署至Firebase非live `production-candidate`，URL為<https://projed-cc78d--production-candidate-tsxgwy67.web.app>。逐檔remote provenance、production readiness、OAuth safe cancel與browser smoke PASS；candidate前後live release／version完全相同。
- 390×844 quick專屬smoke PASS：名稱欄自動聚焦、語音按鈕56px且accessible name正確、首次render業務request=0、manifest／JS／CSS正常，無critical browser／HTTP錯誤。
- Production-safe same-account synthetic PASS：一次性actor從quick建立一筆、RPC=1、IDB=`synced`，返回主程式工作台exactly one，authenticated canonical readback exactly one；task／tenant／profile／Auth user完整cleanup，三項residual count均為0。
- Firebase固定candidate URL曾對Node fetch留下404負快取；`production-release.mjs`現以release ID query作cache key並bounded retry，對應release gate共21項PASS。Guarded正式fixture executor為`scripts/verify-dev-122-production-same-account.mjs`，需env與CLI雙重opt-in。
- 此段candidate gate已由REL-002後續完成：exact release live activation、canonical production smoke、canonical同帳號建立readback／cleanup與terminal release record均已收斂；accepted residual risks維持原狀。

### REL-002 Production Closure（2026-09-17）

- 使用者核准exact release `20260917080116-1a5f27`後，Firebase live已啟用為release `1789648827546000`／version `59da8efd9cc1e02c`；啟用前rollback anchor為release `1789443231001000`／version `3bd57d3bc4a345a9`。
- Activation evidence的45/45 canonical provenance、root browser與OAuth safe-cancel均PASS；canonical root、quick、install query、兩份manifest、`sw.js`及release metadata均HTTP 200。
- 390×844 quick smoke PASS：title自動聚焦、語音入口56px且accessible name正確、root marker=0、首次業務request=0、release identity相符。
- Production-safe same-account synthetic PASS：quick RPC=1、IDB=`synced`、quick與root actor相同、工作台exactly one、canonical DB exactly one；task／tenant／profile／Auth user全數cleanup，residual counts=0。
- Terminal evidence見[REL-002](release/REL-002-DEV-122-20260917.md)。DEV-122終態為`Production Verified with Accepted Exceptions`；原accepted residual risks維持原始事實，不改記為PASS。

Hosted HTTPS historical evidence（2026-09-16）：乾淨candidate build id `build:1789531768480-4g274ymv`；quick HTML SHA-256 `EA746B9AB5BC9EE610AA89CB800021F8AF7E255AA4942CC8C504F904C2C59549`、quick JS SHA-256 `C73354AE4E63760252883CAC7D4D4D3DAC7F150020E33245D4A1D47729951E6C`、SW SHA-256 `E69D616E97250EBF3C27311814BD05AC6818ED8F88EAB098A2FF4D6B54BAFF69`，線上與本機一致。browser artifact與畫面位於`output/playwright/dev-122-mobile-zero-data-quick-task/{https-candidate-result.json,https-candidate-390x844.png}`；preview已到期且不含R12，只能作歷史R10證據，不能供本輪真機gate重用。
2026-09-17 read-only external preflight：Firebase CLI 讀取 `projed-cc78d` hosting channels 因 credentials expired 失敗；本機沒有 `adb.exe` 或 `xcodebuild`。未執行 reauth、deploy、遠端寫入或裝置操作；新的R12 HTTPS candidate與D01～D10仍等待明確遠端授權／有效登入及實體裝置。

使用思考習慣：#第一性原理、#系統描繪、#可驗證性

## DEV-123：會議任務辨識與滑鼠停留輔助連結

- 狀態：架構已定案；`Production Backend Deployed / Hosted Synthetic PASS / Frontend Feature-Gated / Provider Qualification Gate Pending`。
- 類型：交付點候選，P2初排；control plane 已落地正式環境，但產品入口仍因 Provider Gate 關閉，不計完整功能完成。
- 本輪邊界：依 `dev-pm` 與 Tech Lead 契約完成 schema、Edge control plane、前端候選及 hosted synthetic 驗證；真實 Provider、品質校準與完整 QA/QC 仍由既定 Gate 管理。
- 風險：本機文件／後續隔離實作為Medium；功能包含敏感資料、並行及刪除，需QA/QC。遠端migration、正式權限、外部付費啟用與release另屬High。
- Source：canonical repo `C:\VIBE CODING\ProJED\ProJED`，branch `持續優化3`；release 以不可變 manifest 的 source commit、tree SHA 與逐檔 hash 為準，不在長期文件硬編會過期的 HEAD。

### 問題、價值與需求來源

核心是辨識「正在討論哪個既有任務」，在會議草稿建立可追溯、可修正的連結。鼠標停留與預覽提供時間附近線索；任務辨識優先於講者標籤。
需求來自本對話的Ambience AutoScribe分析、GitHub開源選型、鼠標輔助構想、寫入開發文件、引導補齊、架構確定及本輪Tech Lead優化。
已確認產品決策以下表為準；工程契約以SPEC-123為準，不在DEV再維護schema/API副本。

### Product Decision Brief（2026-09-14，產品決策完成）

決策來源：使用者分別從 DEV-123 決策卡送出 `1A 2A 3A`、`4A 5A 6C`、`7A 8C 9C`、`10A 11A 12A`，
並以文字確認供應商不得保留可回取的會議內容；此保存條件直接記為架構 invariant，不再以題號追蹤。

| 題號與選擇 | 已確認規則 | 對原 Brief 的影響 |
|---|---|---|
| 1A | 首版會中同步錄音與滑鼠線索，會後產生逐字稿、任務連結與整理草稿；不顯示會中 AI 配對建議。 | 取代「語音輸入僅列後續整合」的 AI 建議；文字基線仍是驗證方法，不是首版交付終點。 |
| 2A | 音訊可交雲端轉錄，逐字稿及必要任務內容可交雲端 AI 配對。 | 確認雲端處理方向；費用由 7A、ProJED 保存期由 5A、原始資料存取由 12A、供應商不得保留可回取內容；未啟用付費服務。 |
| 3A | 通過原文證據與合法任務檢查的明確匹配直接加入草稿；模糊者待確認；可追溯、取消或改連結。 | 確認原先自動加入草稿建議；不代表模型自報高信心即合格，門檻仍需樣本校準。發布由使用者執行。 |
| 4A | 首版以同一會議室、主持電腦的內建或會議麥克風收音，同步紀錄 ProJED 滑鼠線索。 | 收斂為單一麥克風來源；線上／混合會議的遠端音訊與系統音訊擷取不納入首版。 |
| 5A | ProJED 的錄音副本自錄音結束起保留 7 天，期限內可回聽與重新轉錄，到期刪除；逐字稿及配對依據隨會議紀錄保存。 | 新增錄音保存規則；不能以重新轉錄延長期限。此選擇不直接控制 AI 供應商副本或其內部資料保留政策。 |
| 6C | 先依候選服務及會議情境提出成本估算，再決定額度或逐場確認方式。 | 成本情境已補，額度後由 7A 補定；此決策的估算步驟已完成，沒有執行付費推論。 |
| 7A | 整體試點的轉錄、任務配對、摘要與重試每月預算 NT$1,000；預留額度內自動處理，額度不足停止新的付費工作。 | 補定 6C 留待估算的費用規則；既有主機／儲存另計，非每人或每場 NT$1,000。本輪只寫文件，未啟用付費服務。 |
| 8C | 60 分鐘會議，上傳完成後 24 小時內取得可檢查草稿，作為一般成功處理的首版目標。 | 選擇可隔日檢查，允許評估低急迫性方案；尚非特定供應商已達成承諾。不含錄音上傳、額度不足或服務中斷，這些狀態仍須可見。 |
| 9C | 自動連結正確率至少 95%、涵蓋至少 90%；以人工標註的「討論段落－任務」配對計算。 | 明確取代原先未定案的 98% 建議與 9A 的 98%／80% 提案；優先減少漏連，接受較多草稿核對。不放寬合法 ID／權限／原文證據要求，也不改 3A 的模糊待確認與人工發布。 |
| 10A | 每場建立會議後，由主持人按「開始錄音」，同步啟用音訊與任務停留紀錄；未啟用仍可手動記錄。 | 新增明確啟用動作；可見錄音／暫停狀態與停止控制。開啟舊紀錄、重整或恢復草稿不自動收音，不記住自動錄音偏好。 |
| 11A | 直接在會議草稿中點任務連結或待確認標記，查看原句及任務完整路徑，更換、補連或取消。 | 沿用草稿作主要核對入口，不另建獨立配對工作畫面。人工更正優先；具權限且錄音未到期時可回聽。 |
| 12A | 原始錄音與完整逐字稿限具該會議編輯權限的人存取；只有閱讀權限者不得取得。 | 新增原始資料權限，須映射真正的會議資料授權；發布正文及已引用原句沿用閱讀權限，不擴大任務或跨看板權限。5A 保存規則不變。 |
| Provider retention boundary | 供應商不得保留可回取的會議內容；若採 Gemini，需專案級 ZDR、`store=false`、用畢清理暫存。未取得證據前不傳送真實會議內容。 | 不接受一般內容保留；不把 `store=false` 或刪除 Files 單獨當作 ZDR 證明。ProJED 音訊仍保留 7 天、逐字稿／依據仍隨會議，NT$1,000 月額與 12A 權限不變。 |

本輪未選：首版會中串流建議、文字試點作為唯一交付、本機轉錄／全本機推論、所有建議逐筆先確認。
上述未選方向不默認永久禁止；需要改變時回到產品決策與架構修訂，不暗中改動已確認基線。
第 4–6 題未選：線上／混合會議作為首版來源、轉錄成功即刪或隨紀錄長期保留錄音、直接採用月額或逐場付費確認。
第 7–9 題未選：每月 NT$3,000、每場付費前確認、10／30 分鐘草稿目標，以及 98%／80% 或 99%／60% 品質組合。
第 10–12 題未選：記住錄音偏好並隨開始會議啟用、獨立配對清單作主要入口、原始資料僅啟動者或全體讀者可見。
未採納：接受供應商一般內容保留；目前採「不得保留可回取內容」方向，沒有尚待回答的產品選項。
既有成本試算仍不是實測帳單，已選等待時間與品質是驗收目標，不是已達成結果。

使用思考習慣：#效用理論、#可驗證性、#限制條件

### Current-phase 範圍與相容邊界

桌面單主持端、同會議室麥克風、會中手動錄音／滑鼠，會後雲端轉錄及同看板existing task配對。
明確者進草稿，模糊者待確認，一段可連多任務；支持人工更正及唯一人工發布。討論關聯不能改寫成執行待辦，例如「測試先不要做」仍可related，但不改task狀態。

不變契約：7日音訊、完整上傳後24h、全試點月額NT$1,000、人工前95% precision／90% recall、editor-only raw、provider不得保留可回取內容。
錄音開始與既有startMeetingRecord分開；SPEC-109 persistence-confirmed activity、SPEC-110 canonical owner及SPEC-117/ADR-049同看板session continuity均保留。

| 維護位置 | 唯一責任 |
|---|---|
| 本DEV | 人類決策、需求／優先序、執行邊界、派工、完成與future scope |
| [SPEC-123](specs/SPEC-123-meeting-task-resolution-audio-pointer.md) | §4–12 state/data/API/worker/budget/匹配/保存；§15檔案；§16工作順序；§17 stop；§18 AC |
| [ADR-051](decisions/ADR-051-projed-owned-meeting-analysis-pipeline.md) | 為何選ProJED排程、原始資料分離與stateless Gemini；重要替代方案及代價 |
| [QA-DEV-123](qa/QA-DEV-123-meeting-task-resolution-audio-pointer.md) | fixture／phase gate／gold分母／實際驗證方法；狀態NOT EXECUTED |

### 選型與成本記憶

首版重用現有canonical hover、Gemini 3072維RAG及record/task links，新增局限於錄音、配對與可靠保存所需責任。
[Sentence Transformers](https://github.com/huggingface/sentence-transformers) 僅在排序瓶頸經實測證實時重評；[Graphiti](https://github.com/getzep/graphiti) 留待跨會議記憶需求。
開源熱門度、demo與抽取新任務都不能證明ProJED既有task匹配已達標；採用前重驗授權與版本，不另加Python／圖資料庫服務。

### 6C 成本情境與供應商限制（2026-09-14，未採購／未實測）

以下是可重算的規劃情境，不是實測費用分布或帳單上限。首選評估方向為專用轉錄服務搭配既有 Gemini 整理；
供應商專案 ZDR 資格／適用性尚未驗證；原試算不代表已含取得資格、支援方案或替代供應商的費用。
現有整理入口的程式預設為 `gemini-3.5-flash`，環境變數可覆寫，正式設定尚未核實。
本輪不因價格較新而替換全域模型，也不把「會後處理」直接當成可享 Batch API 折扣。

| 項目 | 官方牌價或規劃假設 | 60 分鐘會議試算（美元） |
|---|---|---|
| Gemini 3.5 Transcribe | 每百萬音訊輸入 tokens $2、文字輸出 tokens $12；音訊約每秒 25 tokens。假設計費輸出 12,000–24,000 tokens，包含實際計費的時間標記等輸出。 | 音訊 90,000 tokens 為 $0.18；加輸出後 $0.324–0.468。 |
| Gemini 3.5 Flash 任務配對＋摘要 | 每百萬輸入 tokens $1.50、輸出（含 thinking）$9。假設所有分段、配對與合併合計輸入 30,000–100,000、輸出 4,000–12,000 tokens。 | $0.081–0.258。 |
| 合計 | 一次處理；未含失敗重試、額外重整、索引更新、主機／儲存／流量與稅。 | $0.405–0.726；以規劃匯率 1 美元＝NT$32，約 NT$13–24／小時。 |

牌價來源：[Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)。
NT$32 是試算用固定匯率，非當日匯率。tokens 範圍是 AI 建議情境，尚未以繁中、術語及逐字時間標記的真實輸出校準；
時間標記密度、冗長上下文、thinking 或重試均可能使實際費用超出表列上緣。
官方約 $0.005／分鐘亦是特定輸出量下的換算，不能當成固定每分鐘封頂費率。

同一假設下，每月 20／40／80 小時分別約 NT$260–465／519–929／1,037–1,859。
若全部處理量加倍，40 小時約 NT$1,037–1,859；這只是敏感度情境，非重試率預測。
NT$1,000 已由 7A 接受為整體試點月預算；不能宣稱必定足夠處理 40 小時，也不將每月約 20 小時的建議誤列為使用時數硬限制。

備選價格參照：[Google Cloud Speech-to-Text V2](https://cloud.google.com/speech-to-text/pricing)
首級標準辨識 $0.016／分鐘、低急迫性的 dynamic batch $0.003／分鐘；以單聲道 60 分鐘加上述 AI 整理，
分別約 $1.041–1.218（NT$33–39）及 $0.261–0.438（NT$8–14）。
多聲道依各聲道計費；dynamic batch 的等待時間、繁中模型及時間標記組合須另驗證，價格較低不代表可直接替換。

音訊儲存量以假設 64 kbps 單聲道壓縮檔計，每小時約 28.8 MB；40 小時共 1.152 GB。
若均勻分布 30 天，7 天滾動保留約 0.269 GB；若集中同週，峰值可達 1.152 GB。
[Supabase Pro 公開價格](https://supabase.com/pricing) 超額檔案儲存 $0.0213／GB、一般 egress $0.09／GB；
本專案方案、共用額度與實際音訊格式未確認，不將既有額度視為免費承諾，亦未將固定方案費算成每場新增費。
既有 `gemini-embedding-001` 的索引更新費另行核實，不挪用新 embedding 模型價格，也不混用向量空間。

上述6C表為2026-09-14既有決策試算記憶，非本輪重新核價或dispatch上限。Provider精確型號、Files及ZDR限制、價格來源回查由SPEC第9/21節及WP-123-0維護；
預留／跨月／未知usage規則只在SPEC第10節維護。沒有新的付費授權，也不重新開啟已確認的保存條件。

### RD派工、入口與完成判定

下一步完成 **WP-123-0a 唯讀資格盤點**。hosted DB／Storage control path 已以 disposable fixture 通過；0a仍缺實際 Gemini project 的 ZDR、model／API／pricing及Files cleanup資格證據。fake/local與hosted synthetic可繼續，但不等同完整 browser/media或Provider Gate。
依SPEC：0a → WP1契約 → WP2資料／control → WP3錄音與WP4worker → **0b synthetic probe** → WP5配對／WP6投影 → WP7校準 → WP8 QA/QC。
0b用已核准project、synthetic內容與受7A控制的probe ledger取得API／cleanup／時間戳證據，不要求「完整qualification已PASS」才可測。沒有完整provider gate不得傳真實會議內容；沒有quality gate不得啟用正式auto-accept。

開發模型可決定局部命名、函式拆分、fixture及calibration參數；不准改人類決策、候選上限、pointer-only禁令、原權限或record/session權威。
命中SPEC第17節時帶具體失敗證據回Tech Lead；不自行換provider、放寬門檻或越過既有spec邊界。
預定的additive schema/API修訂已寫入SPEC，不把執行既定migration誤認為新產品決策。

完成需SPEC AC、QA/QC的正常UI路徑及資料readback、95/90、24h、7日、budget、權限與cleanup全數具證據；provider資格或fake單測不能取代產品完成。
遠端migration、Edge Functions 與 hosted synthetic 已完成；付費Provider與DEV-123產品入口仍須 Provider、品質及deployment activation gate。

### Tech Lead修訂與證據（2026-09-14）

根因：同一套工程決策在DEV／SPEC／ADR／map重複敘述，卻欠缺跨步驟的版本與清理契約；字面完整仍可能讓RD自行猜測。

- 補pointer batch、stop/finalize及來源快照，區分audio/discussion/gold段落；多任務分別驗證，不用單一top-two規則排除。
- 補resolution CAS、clear-all及跨ASR revision人工保護；正文／link ownership與既有saveDraft整合，避免雙寫與重複append。
- 統一一invocation一unit；先記attempt才dispatch，cleanup／usage ledger不隨record cascade遺失。
- 修正2小時upload token、播放TTL不得跨expiry、本機離線清除限制與跨月dispatch帳；0a/0b消除驗證循環。
- local candidate 的 stop endpoint 現在以 server stop time 設定七日音訊到期；pointer flush 會先批次送出並在 source freeze 前等待完成。
- worker 成功回寫 capture 改採 `queued`／`running`／`awaiting_budget` 狀態條件；取消若先取得 capture，晚到結果不能把 `cancelled` 復活成 `ready`，並保留 run／cleanup ledger 供後續對帳。
- worker 先以 active lease 結算 usage，再將 run 收斂為 `ready`；結算失敗時保留可重試狀態，不產生 ready／reserved 不一致。
- `save-projection` 的 Edge scope 改由 capture 解析並套用 private creator／recorded_by guard；security-definer projection RPC 同步重驗 actor，避免同 project writer 越過 private meeting 邊界。
- stop／complete-upload 現在要求 expected source version，並在 `complete_meeting_upload_v1` 的 capture lock 內再次驗證；isolated matrix 已加入 stale complete-upload 的 `SOURCE_CONFLICT` 案例。
- manual retry 改由 `retry_meeting_analysis_v1` 在同一 transaction 鎖 source run／capture、重驗 private meeting editor、保留原 deadline；同 request key 回既有 run，另一 request key 遇 queued／cancelled／expired capture 時拒絕，避免先 insert run 再 queue capture 造成 orphan work。isolated matrix 已加入 `retryAtomicity`。
- pointer merge 現在要求相同 `clockEpoch` 才能合併；pause/resume 邊界的同任務區間保留為兩段，不以相同 offset 或 surface 偽造連續停留；clamp 後的零長度／全負 offset 也會被丟棄。
- pointer batch 若 append 失敗，controller 會保留已封存音訊、標記 `pointerLoss`，停止時以 `partial` source completeness 完成凍結並禁止把遺失線索當成完整空集合；pause／stop／finalize/API 失敗則關閉 recorder、pointer observer 與 media tracks，清除錄音 UI 狀態並顯示可續傳的 recovery，而不是維持假錄音狀態。
- reload recovery 若只有本機 finalized audio，因無法重建記憶體中的 pointer batch／完整 manifest，一律以 `partial` 凍結並要求重新確認；不能使用空 pointer hash 或局部音訊清單靜默排入分析。
- projection RPC 現在逐筆重驗 task link 的 live、task 類型、tenant／project ownership 與非 archived 條件；stale、archived、deleted 或 cross-project link 整筆以 `TASK_OUTSIDE_PROJECT` fail closed，不以過濾 join 靜默遺失非法輸入。
- pointer append 同步要求 tenant／project、live task／milestone 與非 archived；MediaRecorder 建立／start 失敗會停止 server capture、以 `missing` 凍結並進入 recovery，避免只清 UI 狀態而留下 server recording。
- capture progress／stop 的 update 重新套用 server state predicate，並行 cancel 勝出時回 `MEETING_RECORD_CONFLICT`；cancelled／expired capture 不再簽發 playback URL。
- stop 現在凍結完整 `epoch_manifest`、`final_pointer_sequence` 與 `source_gaps`；append-pointer／reserve-segment 對 payload 上限、capture identity、epoch、offset、sequence、gap、overlap、digest 與冪等 reservation 重驗。pointer observer 遇 element disconnect、drag、pointer cancel 會結束區間，audio track `ended` 會走 missing-source recovery；這些是 server timeline 與 pointer evidence 的完整性控制，不改變講者標籤的低優先序。
- fake worker／review path 現在保存 word offsets 與 candidate `quoteRange`，候選旁顯示原句證據範圍；沒有 quote 的 pointer-only 候選明示仍需原句確認，維持任務辨識優先於講者標籤。
- `decide_meeting_match_v1` 與 review UI 同步拒絕不存在候選或 pointer-only 的直接 `accept`；只有帶原句候選可採用，明確 `add`／`replace` 才能作人工補連，避免鼠標停留單獨升格為任務關聯。
- save-projection Edge 不再把未知或跨 scope 的 task link 靜默丟掉；會保留 fail-closed 語意交由 projection scope 驗證，control API 的 auth／forbidden／conflict 也改回固定錯誤碼與 401／403／409，不回傳 SQL 或 provider 原文。
- begin 的非 private meeting 權限與一般 project editor 語意一致，private 才檢查 creator／recorded_by；published／archived record 不建立新的 capture。
- 各項失敗案例回鏈QA；刪除DEV工程副本及純轉呼叫provider wrapper。未更改已確認產品決策，SPEC-109/110/117及ADR-049維持原權威。

本輪文件證據仍不是獨立QC或Provider PASS；新增 local candidate 證據如下：

- `npx tsc --noEmit` PASS。
- `npm run lint` PASS（0 errors；既有程式碼含 65 warnings，未新增 DEV-123 lint error）。
- `npm run verify:dev-123-local-preflight` PASS_WITH_EXTERNAL_GATES_PENDING；已串接 pure/provider contract、isolated PostgreSQL、task-owned Auth／Storage、含 Edge runtime 的 Control API、schema lint、typecheck、全 repo lint/build、DEV-106/108/109/110/117 protected regressions、B01～B03 browser 與 B04～B11 browser/media，artifact：`output/qa/dev-123/local-preflight-result.json`（18 steps／7 artifacts）。此結果只代表 local evidence 收斂，不替代 hosted authenticated DB／Storage、provider、完整 QA/QC 或 release gate。
- Pure verifier 已補 auth／Storage static contract：Bearer `auth.getUser()` actor verification、raw/private tables 只允許 `service_role`、`meeting-audio` private bucket；此證據仍不宣稱 authenticated runtime PASS。
- `npm run verify:dev-123-provider-contract` PASS（fake mode=`PENDING`、`dispatchPerformed=false`、`networkCallPerformed=false`；artifact：`output/qa/dev-123/provider-contract-result.json`）。另以未具資格的 `gemini` mode 驗證 `FAIL_CLOSED`、零 dispatch。此 gate 只證明本地 fail-closed／無網路送出與契約存在，不代表 provider ZDR 或 synthetic qualification 已完成。
- Protected regressions static PASS：DEV-106、DEV-108、DEV-109、DEV-110、DEV-117；這些結果只證明既有會議／草稿／跨模式契約未被本輪 control-plane 修正破壞，不替代各自完整 browser／QA authority。
- `npm run verify:dev-123-meeting-task-resolution` PASS（segment rotation、pointer merge、pointer feature、projection revision）。
- `npx supabase db lint --local` PASS（public/private schema no errors）。
- `npm run build:test` PASS。
- `npm run verify:dev-123-meeting-task-resolution-browser` PASS（B01～B03：控制可見、預設安全狀態、鼠標輔助提示；artifact：`output/playwright/dev-123-meeting-task-resolution/result.json`）；`npm run verify:dev-123-meeting-task-resolution-browser-media` PASS（B04～B11：受控 fake MediaRecorder／getUserMedia／Edge route mock 下的開始、recorder start／stop failure、audio track device loss、暫停、恢復、停止、分段、outbox 清空、單次 finalize、review candidate 顯示與 human accept decision；recorder `stop()` 例外時已讀回 `stop`／`complete-upload` 且 capture=`queued`；artifact：`output/playwright/dev-123-meeting-task-resolution-media/result.json`）；後者只屬 local candidate smoke，不替代真實 browser/media、authenticated DB／Storage、provider 或品質 gate。隔離 PostgreSQL 另讀回 stop metadata 的 default empty gaps、frozen epoch manifest、final pointer sequence 與 worker／pointer／transcript／expiry／cleanup index plans。
- review/decision API、RecordSidebar 同草稿面板（含WBS補連／改連）、pause/resume 新 clock epoch、reservation／verify、source-version CAS、signed playback、review 原音回聽、atomic retry／cancel、worker claim／budget settlement、音訊 manifest 完整性與明確 recovery 已完成型別與靜態契約接線；isolated PostgreSQL control-plane core 已 readback PASS，但尚未宣稱完整 browser/media／authenticated DB／Storage／provider PASS。
- 完整真實 browser/media、provider 0a/0b、95/90、24h、7日、budget、QA/QC 尚未執行。hosted authenticated control API／Storage 已以一次性 fixture 18/18 PASS並完成資料清理；worker保持fake，沒有外部dispatch，故這份證據只關閉hosted control-plane缺口。
- DEV-123 八份 additive migration 與 DEV-122 一份 migration 已在正式 project 依 release scope 套用；三個 Edge Functions 已部署。正式前端以 `VITE_DEV123_MEETING_TASK_RESOLUTION_ENABLED=false` fail closed，staging／local保留驗證入口；只有 Provider Qualification、cleanup與品質Gate通過後才能改為true並重建不可變候選。

### Future Phase Captured / Not Requested

- 即時建議：會後版本驗收且出現明確需求再規劃streaming修訂／延遲／更正；目前錄音仍已包含。
- 跨會議別名／關係記憶：錯誤分析證實單場上下文不足，再評估Graphiti與權限、記憶更新及刪除。
- 多操作端、遠端／system audio、跨看板：單端試點達標且有需求，再定主持交接、clock、權重及授權。
- Speaker label、自動建任務／改狀態、自動發布及全桌面監控未納入首版。

使用思考習慣：#多層次分析、#系統描繪、#限制條件

## DEV-124：OKR 共用看板任務拖拉核心

- 狀態：驗證中；`RD Implementation Complete / 架構已定案 / R14 Targeted QA PASS / QC Pending / NOT RELEASED`。
- 開發文件成熟度：`RD Implementation Complete`。
- 架構定案：已定案（R14只加入Goal row-level parent location projection，延續candidate→armed；1000ms shared authority、Board、樹線與canonical commit維持）。
- 類型：P1交付點；父任務DEV-116；相容DEV-053／055／058／068／119／120／121。
- 計入產品交付：是；R14實作與targeted QA已完成，獨立QC、真機與release gate未完成，依治理維持驗證中。
- 需求來源：`USER-20260916-OKR-SHARED-KANBAN-TASK-DRAG`、`USER-20260916-ARCHITECTURE-FREEZE`、
  `USER-20260916-GOAL-INSERTION-LINE-REENTRY`、`USER-20260917-CROSS-MODE-DRAG-BEHAVIOR-PARITY`、
  `USER-20260917-GOAL-DRAG-TREE-PREVIEW`、`USER-20260917-GOAL-ALL-PLACEMENT-TREE-PREVIEW`、
  `USER-20260917-GOAL-DRAG-TREE-PREVIEW-EXCLUSIVITY`、`USER-20260917-GOAL-DRAG-PREVIEW-COMMITTED-TREE-PARITY`、
  `USER-20260917-GOAL-RESTORE-INSERTION-MARKER`、`USER-20260917-GOAL-DRAG-OVERLAY-HALF-SIZE`、
  `USER-20260917-GOAL-EQUIVALENT-BOUNDARY-RIGHT-STYLE`、`USER-20260917-GOAL-TREE-STEM-TOP-DOWN-ONLY`、
  `USER-20260917-GOAL-CHILD-ENTRY-WINDOW-70-CANDIDATE-LOCATION`、
  `USER-20260917-GOAL-ARMED-CHILD-PARENT-LOCATION-PERSIST`。
- 風險：Medium；涉及共用拖拉控制、parent／order、結構Undo、table geometry與Board回歸，
  但不改schema／permission／production或release。
- [SPEC-124 R14](specs/SPEC-124-shared-desktop-task-drag-host.md)：唯一實作契約，含Goal 70% child-entry window、candidate／armed parent target projection、top-down-only nested stem、shared presenter與canonical commit。
- [ADR-052 R9](decisions/ADR-052-shared-desktop-task-drag-surface-adapters.md)：lifecycle／dwell／semantic anchor／單一Goal hierarchy renderer ownership。
- [QA-DEV-124 R14](qa/QA-DEV-124-shared-desktop-task-drag-host.md)：70% geometry、candidate first-frame定位、armed父任務定位持續、1000ms切換與完整回歸。
- Readback：branch `持續優化3`、HEAD `7b16ddf6e3af1d3bf26e3267c19de33fe343ecd4`；既有dirty changes由使用者持有。

### 目標與固定範圍

OKR任務名稱以桌機主滑鼠拖拉，使用看板共用的8px啟動、fixed preview、origin、before／after、
root placement、1,000ms child dwell及一次本機結構Undo。保留native table、rowSpan、252px固定任務欄、
single X-scroll、DEV-119～121的editor／planning／tree／node-toggle與keyboard語意。

共用host持有session／terminal／external invalidation／release；layer只呈現；Board／Goal adapters只提供source capture與geometry measure。
child dwell phase由`taskChildDropTarget.ts`唯一管理，兩個surface effect只依remaining time喚醒下一次advance。
兩模式同看板primary move（含Board root reorder）進同一canonical commit，完整siblings依anchor插入排序。
Board tracking／Workbench／跨看板維持既有special facade；Goal不開這些入口。

### R3 re-entry、差距與架構定案

使用者指出Goal模式仍缺少插入定位線。working-tree readback確認這不是單純CSS問題：

1. Board standard feedback使用`KanbanInsertionMarker`，Goal仍自行畫`fixed h-0.5`線，未共用視覺primitive／presenter。
2. Goal rect以整個task lane與單列bottom計算，未提供title anchor、visible subtree bottom或next-depth child anchor。
3. armed child只更換data attribute，實際線沒有移到下一深度；exact midpoint也未依既有規格歸after。
4. 既有R2 browser B01～B04沒有驗證上述視覺與幾何，故舊PASS只能作baseline，不能維持完成判定。

架構固定為：在既有`DesktopTaskDragLayer.tsx`輸出無狀態`DesktopTaskInsertionIndicator`，內部重用
`KanbanInsertionMarker`；Board／Goal standard與armed child共用。presenter只render已計算rect，Board geometry不變，
Goal adapter負責row top、visible subtree bottom、title／next-depth anchors、cell right與viewport clipping。
不新增Goal-only線、第二controller、event bus、feature flag或資料模型。

使用思考習慣：#問對問題、#系統描繪、#限制條件

### R4 child dwell／定位線行為parity與架構定案

R4差距分析確認：兩模式雖已共用定位線presenter，Goal仍有獨立`1000ms` timer與candidate refs；Board則使用
`taskChildDropTarget.ts`共用state machine。這只能證明一般視覺相似，不能證明999／1000ms、換target、離區與scroll交錯一致。

定案與實作結果：

1. Board／Goal child intent唯一phase truth為`TASK_CHILD_DROP_DWELL_MS`、`advanceTaskChildIntent`、
   `getTaskChildIntentRemainingMs`；Goal-local timer／candidate refs已移除。
2. shared host scroll invalidation同時清除兩模式pending intent、standard marker與geometry cache；下一次pointer move重新命中並從0計時。
3. 定位線要求semantic parity而非pixel identity：standard從target title anchor開始，after位於visible subtree bottom，
   armed child從next-depth anchor開始；Board卡片與Goal table仍由各自adapter計算rect。
4. exact boundary由static注入clock證明：999ms candidate、1000ms armed；browser以足量margin驗證phase，不用不穩定的999ms sleep。

fail-first：新增S24～S27後僅S26因Goal-local timer失敗。修正後static 27/27；Chromium B01～B04、B30～B41
共16案全綠，browser／HTTP error=0。新增B37～B41分別覆蓋Goal dwell前standard、換target／離區、Goal scroll、
Board candidate→armed與Board scroll。source／verifier hash與artifact見SPEC／QA。

使用思考習慣：#問對問題、#限制條件、#可驗證性

### R5 armed-child 樹狀定位預覽與架構定案

使用者要求拖曳的定位預覽連同樹狀關係一起呈現。Spec Impact=`Compatible exception / additive re-entry`：
R4的shared marker、dwell、canonical commit與Board approved geometry不變；R5只補Goal armed-child的直系連接線。

固定契約：

1. candidate仍只顯示既有standard marker，避免1000ms前樹線閃動；只有shared child intent進入`armed`才顯示樹狀預覽。
2. 預覽只畫target父節點自身rail由row center向下的vertical stem，以及在child insertion semantic Y連至既有marker圓點中心的horizontal branch；
   不畫整棵假想樹、不移動row、不新增ghost row。
3. `goalDesktopTaskDragAdapter`輸出rail／stem／branch幾何；Goal專用無狀態presenter只render已計算rect，置於shared fixed layer內、既有marker後方。
4. marker仍由`DesktopTaskInsertionIndicator`→`KanbanInsertionMarker`呈現並維持唯一可提交feedback；connector為同一child feedback的輔助視覺，
   `aria-hidden`、`pointer-events:none`，不得被計為第二落點。
5. 換target、離開、scroll、cancel、release或unmount沿用R4 cleanup，同步清除marker與connector；不新增timer／session／commit authority。
6. Board不渲染Goal tree connector，也不修改Board marker或tree geometry。canonical hierarchy、parent／order、Undo、permission與release範圍不變。

本輪風險維持Medium；未決架構選擇為0。WP-124-J／K已完成：fail-first S28／S29先證明R4缺口，
修正後static 29/29、Chromium 18/18（B01～B04、B30～B43實際選定矩陣）全綠，browser／HTTP error=0。
B42量測stem 2px、branch 2px、父rail／row center／marker-dot endpoint皆在1px容差內，且代表截圖已人工複查；
B43證明armed後scroll與Escape同步清除connector／marker。

R5 protected regressions：DEV-068 static 101/101＋browser 40/40、DEV-116 static 30/30＋browser 42/42、
DEV-121 static 25/25＋browser 34/34；TypeScript、targeted ESLint（0 error）、`build:test`、`git diff --check`皆PASS。
candidate SHA-256：`GoalView.tsx` `15958332…4A44A9`、adapter `9001EB3F…B6BD9`、tree presenter
`1D6A0BB3…8A269`、`index.css` `E5E4B400…145DD1`、static verifier `6CDC4CB3…75BCFB`、browser verifier `4A888350…F7DC91`。
上述是同一working-tree的RD self-test／targeted QA，不是獨立QC或release證據。

使用思考習慣：#系統描繪、#限制條件、#可驗證性

### R6 全定位階樹狀預覽與架構定案

使用者確認「其他階任務定位」也要呈現樹狀線。Spec Impact=`Intentional replacement`：取代R5「candidate無connector」的
可見契約，但不改shared marker、dwell、canonical hierarchy、commit、parent／order、Undo、permission或Board。

固定契約：root standard只畫root rail至marker圓點的branch；任意深度nested standard以target parent rail畫stem＋branch，
stem連row center與before／after semantic boundary；armed child維持target own rail至child boundary。adapter輸出relation與完整幾何，
無狀態presenter只render；standard→armed只替換一組geometry，origin／invalid為0，所有cleanup同步清除。

WP-124-L／M已完成：fail-first只有S30／S31失敗，修正後static 31/31、browser 20/20、browser／HTTP error=0；
B44 root branch-only、B45 depth-2 before／after geometry與代表截圖PASS。DEV-068 101/101＋40/40、
DEV-116 30/30＋42/42、DEV-121 25/25＋34/34，以及TypeScript、targeted ESLint、build:test、diff check全綠。
candidate SHA-256：`GoalView.tsx` `46BE0FC…6B344C`、adapter `C8CA958…EA95AA`、presenter `FEA6DE8…9FA72C`、
static verifier `13A301D…7BE64`、browser verifier `509DC37…FDA16`。

使用思考習慣：#問對問題、#系統描繪、#可驗證性

### R7 拖曳樹線視覺互斥與架構定案

使用者提供畫面證據：拖曳定位connector已正確出現，但一般hover／focus的active hierarchy guide同時維持紫色高亮，
造成看似有多條定位樹線。Spec Impact=`Implementation needs correction`：R6已要求每個有效frame只有一組connector，
本輪只修正顯示優先權，不改R6幾何、shared marker、dwell、parent／order、Undo、permission或Board。

固定契約：`activeDragNode != null`期間，Goal一般hierarchy互動狀態仍可保留，但其可見投影必須為`null`；因此
`data-goal-hierarchy-guide-active="true"`與`data-goal-content-scope="active"`皆不得出現，只保留一組
`GoalTaskTreeInsertionPreview`與shared marker。中性樹狀底線是結構背景，持續保留。drag end／cancel後，一般hover／focus
依當下互動狀態恢復，不留下drag preview或永久關閉highlight。Board與共用host不修改。

WP-124-N：以單一derived visible scope在Goal projection邊界遮罩active guide與content tint；不改row DOM／CSS primitive。
WP-124-O：新增S32與B46；fail-first須重現拖曳時active guide非0，candidate須證明拖曳時active guide／content tint為0、
placement preview恰為1，取消後preview為0且hover可再次高亮。

執行結果：fail-first S32失敗；B46量得未修正時拖曳前／拖曳中active guide皆為3。修正後static 32/32、
browser 21/21，B46量得placement preview=1、active guide=0、active content=0、中性guide=11、取消後preview=0、
再次hover active guide=3，browser／HTTP error=0；代表截圖人工複查PASS。DEV-068 101/101＋40/40、
DEV-116 30/30＋42/42、DEV-121 25/25＋34/34、TypeScript、targeted ESLint、`build:test`與`git diff --check`皆PASS。
candidate SHA-256：`GoalView.tsx` `061393B1…FA1BA97`、static verifier `AE193680…6371F4E`、browser verifier
`D6F794DD…A7999C5`。同一working-tree的RD self-test／targeted QA不等於獨立QC或release證據。

使用思考習慣：#問對問題、#限制條件、#可驗證性

### R8 預覽／結果樹線同源與架構定案

使用者以拖曳中與放開後畫面指出：R7雖只剩一組active connector，預覽仍多出Kanban圓點後方長條，且branch端點
比正式樹線多4px；接著明確要求不要維護另一套預覽分支元件，而應沿用正式樹狀分支的元件與rendering。
Spec Impact=`Intentional replacement`：取代R3／R5／R6「Goal可見回饋必須render Kanban marker、connector只作輔助」條款；
不改shared host／presenter、hit-test、dwell、semantic boundary、canonical commit、Board marker或資料模型。

固定契約：

1. `DesktopTaskInsertionIndicator`仍是Board／Goal共用semantic anchor與metadata owner；Board使用預設`kanban-marker` presentation，
   Goal有效落點使用`surface-preview`，wrapper保留rect／target／position／feedback，但不render dot／bar。
2. Goal正式row與fixed drag preview皆由單一`GoalHierarchyGuides`及同一`GoalHierarchyGuideSegment` render；禁止另建
   `GoalTaskTreeInsertionPreview`或複製stroke／color／active規則。
3. preview只提供fixed座標；segment kind、active stroke、rounded style、owner metadata與branch endpoint處理由正式renderer持有。
   branch右端必須等於resulting title edge，不再加marker dot半徑4px。
4. R7互斥維持：拖曳時row-layer active guide=0，preview-layer恰為1組；中性row guide保留，terminal後正常hover恢復。
5. Board仍render既有`KanbanInsertionMarker`，其尺寸／外觀／geometry完全不變；跨模式共用的是host、presenter語意與狀態機，
   不是強迫不同layout使用同一可見shape。

fail-first：S33先因缺少`surface-preview`與title-edge endpoint失敗；B47量得preview branch `370.39→388.78px`，
result branch `370.39→384.78px`，dot／bar各1。第一輪修正後端點與tail已收斂；架構review再加入S34，移除獨立preview元件並把
row／preview收進同一renderer。最終DEV-124 static 34/34、Chromium 22/22；B47 preview／result X皆為
`370.39→384.78px`，dot／bar=0，browser／HTTP error=0，前後截圖人工複查PASS。

R8 candidate SHA-256：`GoalView.tsx` `A1894E2A…B42BCA5C`、`GoalHierarchyGuides.tsx` `84FE45B4…409059B6`、
shared layer `FE70172C…A4E8C5D0`、adapter `0229002B…3BC5F4FA`、CSS `A76D60D4…26B8D970`、
static verifier `C12C0152…467DD041`、browser verifier `0A521C68…153FF34`。

使用思考習慣：#問對問題、#系統描繪、#可驗證性

### R9 恢復共用定位插入線

使用者要求在R8「正式row與拖曳preview共用樹線renderer」的基礎上，把原本定位插入線加回來。
Spec Impact=`Intentional replacement`：只取代R8「Goal semantic anchor不可render dot／bar」條款；R8的單一樹線renderer、
title-edge endpoint、R7互斥、R6所有階層geometry、R4 dwell與canonical commit均不變。

固定契約：每個有效Goal standard／armed-child frame由同一`DesktopTaskInsertionIndicator`以`kanban-marker`呈現
8×8px dot與6px bar，同時由`GoalHierarchyGuides`呈現恰一組樹狀定位預覽。樹分支仍終止於resulting title edge／marker wrapper left，
不得重新接到dot中心，因此放開後branch parity維持≤1px。兩者是同一placement descriptor的複合視覺，不增加hit target、timer或commit path。

fail-first：更新S33後，R8 candidate因仍使用`surface-preview`而失敗。修正後static 34/34、Chromium 22/22；
B30驗證dot／bar皆存在，B42驗證armed child樹線與marker同時存在，B47驗證preview／result branch皆為
`370.39→384.78px`且dot／bar各1；browser／HTTP error=0，代表截圖人工複查PASS。
candidate SHA-256：`GoalView.tsx` `3C74C65D…C76CA77`、static verifier `2AE120A9…2D7351D`、
browser verifier `D0F61D78…49885F5`。

### R10 Goal 拖曳浮卡縮小 50%

使用者要求拖曳中的Goal浮動任務卡縮為原視覺的50%。Spec Impact=`Implementation needs correction`：SPEC-124既有
desktop overlay scale 0.5契約不變，但`GoalView`實作仍使用`scale-[1.02]`。本輪只把浮卡改為`scale-[0.5]`；保留
pointer中心定位、1°旋轉、文字截斷、來源ID與`pointer-events:none`，不改定位線、樹狀預覽、child dwell、hit-test或commit。

S35 fail-first先重現1.02 drift，修正後static 35/35。B48由正常Goal入口真實拖曳，讀回computed scale `0.5`；fixture浮卡
layout為128×38px、畫面外接矩形為64.36×20.11px（高度包含1°旋轉），來源ID與文字正確且不攔截pointer。Chromium 23/23、
browser／HTTP error=0；B30／B42／B47仍證明定位插入線、樹狀預覽與放開結果未回歸。TypeScript與targeted ESLint PASS。
代表截圖：`output/playwright/dev-124-shared-desktop-task-drag-host/B48-dev124-goal-half-size-floating-card.png`。
candidate SHA-256：`GoalView.tsx` `B6173C72…A9B50E8`、static verifier `3D0C3E27…5ED19C`、browser verifier
`5D8C0373…3E661`。同一working-tree的RD self-test／targeted QA不等於獨立QC或release證據。

使用思考習慣：#系統描繪、#限制條件、#可驗證性

### R11 等價兄弟邊界單一預覽樣式

使用者指出同一插入位置會因游標落在上一筆下半部或下一筆上半部而顯示兩種樹線方向。Spec Impact=`Intentional replacement`：
只將兩個等價可見邊界統一為右圖的previous-after視覺；不把semantic target由next-before改寫成previous-after。

Goal adapter先以原target計算canonical `orderingPosition`，再於相同parent、相鄰可見boundary且前一兄弟不是drag source／其descendant時，
將`standardTreePreview`的presentation anchor正規化為前一兄弟。marker semantic Y、title edge、shared renderer、host與commit ownership不變；
若前一筆subtree bottom不等於下一筆top、parent不同或不安全，維持原before幾何。

S36 fail-first先重現兩態stem方向不同；修正後static 36/36。B49由正常Goal入口分別命中Grandchild A下半部與Grandchild A2上半部，
兩態stem=`29.890625,157→31.890625,173`、branch=`30.390625,172.5→44.78125,174.5`、marker=`44.796875,165→247.5,181`，
preview anchor皆為Grandchild A；before-next仍回報target=Grandchild A2、position=before。放開後讀回previous order=0、moved=1、next=2，
parent為原共同parent。Chromium 24/24、browser／HTTP error=0，TypeScript與targeted ESLint PASS；兩張代表截圖人工複查一致。

R11 candidate SHA-256：`GoalView.tsx` `73958AABA66ECBC84F6D5BFFCC62062A02C73248DDD36BB1632BFAB7F20987A9`、
adapter `059049532176EC132D6261D628A6939C3328E2DDFA659E47A316399ADB82596E`、static verifier
`DA22781E11E0DF5E647A51FDFEFBA6033A490AC6EE5C155C329A0343A352BB3D`、browser verifier
`2B2BDDA54130BED2530BC46A3D6C478E247F7CDB2E31F3201D4858DA05F2CEC6`。

使用思考習慣：#差距分析、#系統描繪、#可驗證性

### R12 所有巢狀standard樹幹只由上往下

使用者實機指出R11仍遺漏`before first child`：因沒有前一個同parent兄弟，presentation anchor回退為目標列，造成stem由
boundary下方向上連。R12為`Intentional replacement`，將所有nested standard stem固定為`stemStartY <= boundaryY`。

Goal adapter的anchor選擇改為「等價前一兄弟 → 可見parent → candidate fallback」；candidate fallback再以boundary截斷，
因此即使parent不在可見rows也只會退化為零高度，絕不反向。rail仍由candidate depth計算，semantic target、orderingPosition、
marker、shared `GoalHierarchyGuides`、dwell與canonical commit均未改變。

Fail-first S30／S37先重現反向行為；修正後static 37/37。B50由正常Goal入口將Root B拖到第一個Grandchild A之前，
讀回target=`dev124-grandchild-a`、position=`before`、preview anchor=`dev124-child-a`，parent center=`125px`、boundary=`141px`、
stem=`125→141px`，marker／preview各1。Chromium 25/25、browser／HTTP error=0；B49、B42、B44～B47及Board案例維持PASS，
TypeScript、targeted ESLint與diff check PASS，代表截圖已人工複查。

R12 candidate SHA-256：`GoalView.tsx` `73958AABA66ECBC84F6D5BFFCC62062A02C73248DDD36BB1632BFAB7F20987A9`、
adapter `2C7CE7DBB9113449CB2615840C2E319DD0CF2B0E21F7C086717F73B4C6AE0A0A`、static verifier
`8C3182235DEEC52F71521437C270C201E97E0A76A13641C84AFF85A8F1E0889A`、browser verifier
`F71AF0422AAC2199197A3208B2BE87778659826C0ACCC5E9E0DFBA517DB21DDB`。

使用思考習慣：#差距分析、#系統描繪、#可驗證性

### R13 Goal child-entry 70%窗口與candidate目標定位

使用者要求Goal進入子任務的窗口縮小30%，並在1000ms開始計時時定位被指向的任務。Spec Impact=`Intentional replacement`：
只為R7的drag highlight suppression增加candidate例外；一般hover／focus仍不投影，Board既有child-entry window不改。

Goal adapter固定以primary task surface中心70%寬×70%高作child-entry rect，四邊各15%保留standard ordering。第一個candidate
frame只在目標row加暫態data state並沿用既有parent location tint，不擴散到子孫；standard marker／tree仍顯示。shared dwell滿1000ms後，
candidate tint清除並由child marker／tree取代。leave／switch／scroll／cancel／drop沿既有shared cleanup清除，不新增timer、元件或commit path。

Fail-first S38／S39與B51先證明舊實作沒有70% adapter規則與candidate定位。修正後static 39/39、Chromium 26/26，
browser／HTTP error=0；B51讀回outer edge candidate=0、中心candidate count=1、target=`dev124-root-a`、descendant=null、
background=`rgba(224, 231, 255, 0.72)`、standard feedback，1000ms後candidate=0且feedback=`child`。TypeScript、targeted ESLint、
`build:test`與diff check PASS，代表截圖人工複查PASS；既有localhost:4000未停止，task-owned browser已關閉。

R13 candidate SHA-256：`GoalView.tsx` `CC760959178D4B10DD11DB12019C9CF10989C736079881BB3AB76B2EF0581EC2`、adapter
`4893A5A65ED48F0076FBF433FA88D2B7235C045C9CBDD633ABB672F9D83EC357`、CSS `3D17FF66C7F70406CA7B2A59A234351126805A9687AD5257AAF9F0BF32192209`、
static verifier `F6DECE42EF77FEC6CB364C2FD3750558F563EBA41D7992DE5521E617C6FB26AE`、browser verifier
`7328BC9162EB9D2045C90E41E1F591BF5B8654756D0EF412E611A9CBCE614735`。

使用思考習慣：#差距分析、#系統描繪、#可驗證性

### R14 armed child持續父任務定位

R13在1000ms進入armed時只清除了candidate row state，造成畫面中的父任務失去定位。這是與使用者預期不一致的視覺狀態，
因此R14以`Intentional replacement`修正，不改shared dwell、marker／tree renderer、Board或canonical commit。

實作將Goal target分成兩個投影：`childDropCandidate`只在candidate phase存在；`childDropTarget`在candidate與armed phase皆存在，
兩者都指向同一個target parent。Goal row以既有location tint selectors渲染`data-goal-child-drop-target="true"`，armed時candidate
屬性歸零但父任務target仍恆為單一一列；子孫、其他列與一般hover／focus scope均維持中性，terminal／leave／switch／scroll／cancel／drop／unmount清理。

Fail-first S40／B52先證明舊實作armed `targetCount=0`；修正後static 40/40、Chromium 27/27，browser／HTTP error=0。
B52讀回`targetId=dev124-root-a`、`targetCount=1`、`descendantTarget=null`、`markerFeedback=child`，代表截圖
`output/playwright/dev-124-shared-desktop-task-drag-host/B52-dev124-goal-armed-parent-location.png`人工複查PASS；TypeScript、targeted ESLint、
`build:test`與diff check PASS。既有localhost:4000未停止，task-owned browser已關閉。

R14 source SHA-256：`GoalView.tsx` `6CD3A4E17D6AD0B5426263B12524C9923AB165BF620893BC55610A1B0BA16545`、adapter
`4893A5A65ED48F0076FBF433FA88D2B7235C045C9CBDD633ABB672F9D83EC357`、CSS `87BA9DC9324B25D31F6D5607AB5DC3AD82C676346098C4F71EEBD722FF8F5CF9`、
static verifier `A8E6BC26BE8D1699DBFEDCCA7BDF0395EFD2C4A18E2136397969551900AC57B0`、browser verifier
`7800DF700511057C2C327CB3CA4813CD9972FE2BC2B841EF1758C3A904D1CBC3`。

使用思考習慣：#差距分析、#系統描繪、#可驗證性

### R2 Tech Lead Review與既有基線

1. 移除adapter的revalidate／commit／cleanup callback，避免一個adapter變成另一套controller；type-only檔案可共置。
2. 收回Board root reorder的直寫分支；密集／重複order與hidden siblings依完整ID序列處理，不靠±0.5推算。
3. 固定release claim、已呈現frame、同步latest-access／plan檢查與一次dispatch；舊timer／Promise不得影響新session。
4. Goal先clip task-name lane與viewport，再以row Y判定；來源primary為origin、descendant為invalid，
   candidate保留standard feedback，scroll後重新呈現才可提交。
5. 修正R1過度承諾：one batch是local command、Undo驗收涵蓋parent／order／nodeType；
   遠端原子儲存與ancestor rollup Undo不屬現有保證，見下方限制。

R2核心ownership、canonical commit與既有targeted smoke／回歸保留為基線；DEV-068 browser 40/40已完成verifier re-entry。
R3沒有推翻R2架構，但因新增可見失效證據而重開。完整工程規則只維護在SPEC，本DEV只保留範圍、進度與交接摘要。

### 固定工作包

| 順序 | 交付與出口 |
|---|---|
| WP-124-A | 開工readback、Board baseline、Goal穩定插入／geometry的行為fail-first；module不存在不算行為證據 |
| WP-124-B | 抽shared host／layer＋Board geometry；root branch先收至facade，Board approved behavior不退化 |
| WP-124-C | root與normal primary共用commit、anchor plan、latest-access、session race與Goal pure geometry |
| WP-124-D | Goal接入、移除舊DnD／overlay／swap commit；browser／table geometry與Goal相容驗證 |
| WP-124-E | 同一candidate的必要回歸、三viewport、error sweep、hash／artifact／文件收斂 |
| WP-124-F | 先建定位線fail-first；新增shared presenter，補Goal subtree／depth／clipping／midpoint geometry，移除專用2px線 |
| WP-124-G | 凍結R3 candidate；執行三viewport、standard／child／origin／invalid與Board／Goal targeted regressions |
| WP-124-H | R4 fail-first與shared dwell authority closure；移除Goal-local timer，兩模式接shared scroll invalidation |
| WP-124-I | R4 cross-mode browser contract；dwell、switch、leave、scroll reset與semantic anchor evidence |
| WP-124-J | 已完成；R5 fail-first＋Goal armed-child直系tree connector；adapter輸出rail／stem／branch，無狀態presenter在shared layer呈現 |
| WP-124-K | 已完成；R5 targeted QA；candidate零connector、armed connector幾何、cleanup、Goal tree／Board marker protected regressions與視覺複查 |
| WP-124-L | 已完成；R6 root／任意深度standard tree connector、armed geometry互斥替換與fail-first S30／S31 |
| WP-124-M | 已完成；R6 B44／B45、代表截圖、error sweep、DEV-068／116／121與build gates |
| WP-124-N | 已完成；R7以derived visible hierarchy scope抑制拖曳中的一般active guide／content tint，保留中性底線與唯一placement connector |
| WP-124-O | 已完成；R7 S32／B46 fail-first、正常入口視覺證據、protected regressions與candidate收斂 |
| WP-124-P | 已完成；R8 S33／B47 fail-first、Goal semantic anchor改為surface-preview、移除Kanban tail並把branch endpoint收至title edge |
| WP-124-Q | 已完成；移除獨立`GoalTaskTreeInsertionPreview`，row／fixed preview共用`GoalHierarchyGuides`／segment renderer與S34架構gate |
| WP-124-R | 已完成；R9恢復共用Kanban dot／bar定位線，維持單一Goal hierarchy renderer與preview-result branch parity |
| WP-124-S | 已完成；R10將Goal浮卡scale由1.02修正為0.5，保留既有pointer定位與拖拉語意 |
| WP-124-T | 已完成；S35 fail-first、B48真實拖曳量測與代表截圖，並重驗既有定位／樹線browser矩陣 |
| WP-124-U | 已完成；R11在Goal adapter純幾何層正規化等價可見boundary的presentation anchor，semantic target／commit不變 |
| WP-124-V | 已完成；S36 fail-first、B49雙態geometry／canonical readback、代表截圖與DEV-124完整browser矩陣 |
| WP-124-W | 已完成；R12新增visible parent fallback與top-down clamp，消除before-first-child反向stem |
| WP-124-X | 已完成；S30／S37 fail-first、B50正常入口geometry／截圖與DEV-124完整browser矩陣 |
| WP-124-Y | 已完成；R13在Goal adapter建立中心70% child-entry window，candidate target以row state沿用既有location tint |
| WP-124-Z | 已完成；S38／S39／B51 fail-first、outer guard／first-frame target-only／1000ms armed切換、截圖與完整browser矩陣 |
| WP-124-AA | 已完成；R14拆分candidate-only marker state與candidate／armed共用parent location target state，沿用既有色階與row projection |
| WP-124-AB | 已完成；S40／B52 fail-first、armed target parent=1／descendant=0／child feedback、B52截圖與完整browser矩陣 |

QA命令已改為本機`build:test`，並列出Board／Goal、mobile、Workbench、tracking、Undo與primary pointer的相容集合。
因抽取失效的source-location assertion可遷移到新owner並保留等價行為證據，不能刪除行為oracle。

### 已知限制與future capsule

- `TD-124-01`：既有normal batch為optimistic local apply，沒有遠端原子receipt／rollback保證。
- `TD-124-02`：既有ancestor rollup不在batch Undo內，且不保證舊parent鏈重算；QA另存baseline差異，不宣稱本案解決。
- 兩項限制的隔離、移除觸發與驗證方法在SPEC-124 §6.1；本案不擴張store／history／persistence重構。
- mobile Goal、tracking／Workbench／跨看板Goal placement維持`Future Phase Captured / Not Requested`。
  桌機primary完成後，由明確的新需求觸發re-entry。
- schema、API、permission model、canonical hierarchy、filter、rowSpan／scroll ownership與release不在本期。

### Spec Governance與執行邊界

SPEC-124延續對SPEC-116／121拖拉ownership的intentional replacement，兩份既有amendment保留；
R3與R4是implementation correction；R5為compatible additive re-entry；R6依使用者明確要求有意取代R5 armed-only呈現條件；
R7修正R6視覺互斥的implementation drift；R8收斂正式／預覽樹線renderer；R9依使用者明確要求有意取代R8的
Goal marker suppression，恢復共用定位線但保留title-edge parity；R10修正既有0.5倍浮卡規格的實作漂移；
R11有意將等價兄弟boundary統一為previous-after預覽幾何，但保留next-before semantic commit；R12再把所有nested
standard stem固定為top-down-only，缺少可見上方anchor時退化為零高度；R13有意在candidate階段恢復單一target row定位，
並將Goal child-entry窗口收斂為中心70%寬×70%高，Board行為不變；R14再讓candidate→armed持續同一父任務location projection，
只清除candidate專用狀態，不改marker／tree／commit ownership。
WP-124-F～AB已完成；下一gate為獨立QC／真機supplemental。
要改protected surfaces或產品範圍即命中SPEC stop conditions。

實作模型可自行決定helper／fixture／局部型別名稱與不改契約的共置；不得變更shared presenter責任、
midpoint／subtree／clipping規則、canonical commit或Board approved marker樣式。Goal row與preview tree segments必須保持單一renderer。

R2已完成 WP-124-B～E 的 local implementation：Board／Goal 接入共用 `DesktopTaskDragHost`／`DesktopTaskDragLayer`，
primary move 使用 exact sibling splice 與 single local batch／Undo，Board root direct write 已收回 canonical commit，Goal row transform／自有 overlay／swap commit 已移除；
Goal task-lane geometry、candidate／armed child dwell、欄位收合 hook 與 account-scoped preference、cleanup 已接線。
R4 baseline：DEV-124 static 27/27、Chromium B01～B04與B30～B41共16案全綠，browser／HTTP error=0；
DEV-116 static 30/30／browser 42/42、DEV-121 static 25/25／browser 34/34、DEV-068 static 101/101／browser 40/40、
DEV-119 browser 17/17、DEV-120 browser 19/19，以及主要 Board／mobile／Workbench／tracking／Undo／pointer targeted regressions 均已通過；
R5 evidence為static 29/29與browser 18/18 baseline；R6為static 31/31與browser 20/20、R7為32/32與21/21；
R14 current evidence為static 40/40與browser 27/27，新增S40／B52 armed parent location continuity與B52畫面證據，並持續覆蓋R13 70% window／B51 candidate定位、R12 top-down-only、R11等價兄弟boundary、Goal浮卡computed scale 0.5、root／nested／armed connector、恢復的dot／bar、preview-result endpoint parity、單一renderer、cleanup與Board marker相容性。
獨立QC、真機、正式持久化與release gate仍未完成，故目前不是QC Ready或release ready；RD implementation與架構定案則已完成。

使用思考習慣：#多層次分析、#系統描繪、#可驗證性
