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
  - 摘要：會議模式保留完整看板編輯與有語意活動捕捉；逐筆 append 與純位置活動已由 DEV-011/012 現行契約取代。
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
- ✓ DEV-042 [交付點] [本機驗證完成] [P1] [共用 Inline 寬度對齊已通過 / 尚未部署] 手機與桌機共用左側面板排列
  - 摘要：手機與桌機共用同一套 `Sidebar`／`TaskWorkbenchPanel`，開啟時 inline 排在看板左側並縮小相鄰畫布；本輪補上手機工作區清單寬度與全域工作台一致的契約。
  - 下一步：若要交付正式環境，另走 release gate，並補 production mobile smoke；本輪未獲部署授權。
  - 證據：`SPEC-042`、`QA/QC-DEV-042`；DEV-042 static `22/22`、browser `8/8`、390／320 inline screenshots、TypeScript、targeted ESLint、`build:test` 與 `git diff --check` 均通過
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
- ○ DEV-066 [交付點] [待排] [P1] [Rework 4 Brief Ready / Human Confirmed / 未實作] 任務備註語意富文字與 AI 可讀內容
  - 摘要：移除手機唯讀＋純文字追加分流，所有 viewport 統一使用既有 Lexical 任務備註編輯器；只保留 RWD 差異，canonical rich state、plain compatibility alias 與 AI 安全投影不變。
  - 來源 ID：`USER-20260812-TASK-NOTE-RICH-TEXT-AI-READABLE`、`USER-20260820-DEV066-UNIFIED-MOBILE-TASK-NOTE-EDITOR`
  - 父任務：DEV-006、DEV-008、DEV-057
  - 下一步：使用者要求實作時，先把 Rework 4 補至 `RD Implementation Ready`，再由 RD 移除手機分流／追加流程、共用既有 editor 並執行更新後的 QA/QC。
  - 阻塞 / 恢復條件：不得新增第二套手機 editor、改變資料／API／權限／格式 allowlist／會議紀錄 editor，或以手機純文字全文覆寫 canonical rich state；命中任一項即停止並回 PM。
  - 證據：`SPEC-066` Rework 4 Brief、`ADR-042` 2026-08-20 amendment、`QA-DEV-066` pre-implementation plan；`QC-DEV-066` 僅保留 Rework 1～3 歷史證據，舊 mobile zero-editor／append PASS 不再作為目前 release acceptance。
  - 計入交付：是（Rework 4 尚未實作）
- ● DEV-067 [交付點] [已完成] [P1] [QC PASS / 未 Release] 看板任務拖曳升級為 L1 列表
  - 摘要：讓 L2／L3+ 任務可拖到列表標頭升級為 L1，並以既有單一定位條顯示插入位置；列表內容區仍維持 L2 drop，尾端新增 L1 append target。
  - 來源 ID：`USER-20260814-KANBAN-L1-DRAG-PROMOTION`
  - 父任務：DEV-053、DEV-054、DEV-055、DEV-058
  - 下一步：功能已完成；若要交付正式環境，另走 release gate。
  - 阻塞 / 恢復條件：不得恢復 DEV-051／052、不得改 Workbench placed-row no-drag、來源 no-op、單一 marker、raw finger、click/right-click 或 schema；任何 indicator／commit 不一致即停止。
  - 證據：`SPEC-067`、`QA-DEV-067`、`QC-DEV-067`；DEV-067 static 13/13、browser 8/8、DEV-055 desktop 16/16、DEV-054 mobile 11/11、DEV-053／054／055／058 static regression、TypeScript、targeted ESLint、test build 與 1440／1024／390 rendered QC 通過。
  - 計入交付：是
- ◐ DEV-068 [交付點] [執行中] [P1] [Targeted Title-Anchor + Reorder Boundary Browser PASS / Adjacent L1 Placeholder Regression Open / Physical Mobile 未充分驗證 / 未 Release] 任務完整預選範圍停留移入子任務
  - 摘要：把「移到指定任務底下」改成跨 L1／L2／L3+ 一致的完整 hover-scope 落點；前 1 秒保留既有同階／lane 操作，滿 1,000ms 後插入線固定對齊放開後最終階層的同層標題起點。L2／L3+ 標題固定在條件式控制項之前；空層級以相同版面 token 提供 title anchor。Candidate standard `after` marker 在展開任務時固定使用完整 task scope bottom，不得出現在 L2 標題正下方。
  - 來源 ID：`USER-20260815-TASK-TITLE-CENTER-CHILD-DROP`
  - 父任務：DEV-053、DEV-054、DEV-055、DEV-058、DEV-065、DEV-067
  - 下一步：另案處理既有 L1 source placeholder 高度 28.09375px vs 32px 的相鄰回歸；接入 AI 可控 iPhone Safari 與 Android Chrome 完成 physical precision gate。若要交付正式環境，另走 release gate。
  - 阻塞 / 恢復條件：本輪不含部署或 release。缺 iPhone Safari／Android Chrome AI 可控實機時，只能標記 browser gate 通過，不得宣稱完整 physical mobile sign-off。
  - 證據：歷史基線與 QC 證據保留。2026-08-25 Rework 15：rendered `DEV068-DESK-DEPTH-LINE` 證實 L2／L3／L4+ marker 與最終同層 title anchor 差≤1px。Rework 16：failure-first 精準重現 standard marker 停在 primary bottom；修正後 desktop centerY=`274.09375px`、mobile centerY=`254.09375px`，均等於完整 scope bottom；static 76/76、DEV-055 static 29/29、desktop/mobile targeted browser 各 2/2、TypeScript、`build:test` PASS。完整矩陣的已知 L1 source placeholder 高度差與 physical iPhone／Android gate 仍維持開放；未部署、未 release。
  - 計入交付：是
- ◐ DEV-069 [交付點] [RD Implemented / Local QA-QC PASS / Provider Smoke Pending / 未 Release] [P1] 會議草稿 F5 復原與低成本雲端備份
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
- ✓ DEV-076 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 心智圖左鍵抓取畫布平移
  - 摘要：讓桌機使用者可在心智圖空白畫布按住滑鼠左鍵直接平移，同時保護節點拖曳、關係線、快速命名、空白點擊與單一 Scene 幾何契約。
  - 來源 ID：`USER-20260820-MINDMAP-LEFT-MOUSE-CANVAS-PAN`
  - 父任務：DEV-027
  - 下一步：若要正式交付，依既有 release gate 另行驗證；本輪不含 commit、push、deploy 或 release。
  - 阻塞 / 恢復條件：若節點／control 起手也會 pan、拖曳後誤清 selection、純 pan dirty world geometry、touch／中鍵回歸或需要改資料／權限，立即停止並回 RD／PM。
  - 證據：`SPEC-076`、`QA-DEV-076`（Executed / QA PASS / QC PASS）、`output/playwright/dev-076-mindmap-left-mouse-pan/result.json`、DEV-076 static 12/12、1440／1024 rendered mouse trace、390 boundary、DEV-027B browser、DEV-074／075／073／027B static、TypeScript、lint 與 `build:test`。
  - 計入交付：是（未 Release）
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
- ✓ DEV-083 [交付點] [完成] [P0] [Released / FMEA Credential Exception Accepted] 正式發版環境隔離與 artifact 完整性閘門
  - 摘要：以 production env隔離、sealed artifact與單一正式發版入口，阻止測試Supabase／localhost設定再次進入production。
  - 來源 ID：`USER-20260821-PRODUCTION-OAUTH-LOCALHOST-INCIDENT`
  - 下一步：後續正式發版回到 P1 `release:production`；Management PAT輪替與P2技術防繞過保留為已接受資安／治理債，不阻塞本次release結案。
  - 阻塞 / 恢復條件：若 canonical smoke、artifact identity或OAuth回歸失敗，回滾至Firebase version `93c2a80ddc1a798e`；DEV-081實機與DEV-082 production remote gate仍由各自DEV管理。
  - 證據：release `20260821144058-509110`、commit `4ee8bf8`、candidate version `880dfc3bbbc5d8b3`、live version `ca48cc7d514432d8`、39/39 remote hash、OAuth與authenticated smoke PASS。
  - 計入交付：是（P0＋P1已發布；PAT strict gate依使用者FMEA例外不宣稱PASS）
- ✓ DEV-084 [開發點] [完成] [P1] [RD Implemented / QA-QC PASS / 未 Release] 非主按鍵不得觸發主按鍵互動
  - 摘要：以共用 raw-input guard 修正中鍵／右鍵誤啟動 task drag、Gantt／panel resize、mindmap relationship primary action與 modal backdrop close，同時保留左鍵、鍵盤、觸控、右鍵 menu及心智圖中鍵 pan。
  - 來源 ID：`USER-20260822-NON-PRIMARY-POINTER-ISOLATION`
  - 父任務：DEV-070；相容權威 DEV-028、DEV-053、DEV-076、DEV-077
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

## DEV-066：任務備註語意富文字與 AI 可讀內容

- 文件成熟度：Rework 4 `Brief Ready / Human Confirmed`；Rework 1～3 為歷史 `Implemented / QC PASS`
- 狀態：待排 / Rework 4 尚未實作 / 未 Release
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
- Module Boundary：不得新增 mobile editor module；現有 `TaskDetailNoteDesktopEditor` 應泛化／重新命名為裝置中立元件。原 mobile readonly renderer 可僅在載入 fallback 或共用 readonly 需求確實需要時保留，不得再作為手機專用寫入分支。
- Clipboard/security：不儲存 raw HTML；未知 node 轉成其文字 children，連結只允許 `http:`、`https:`、`mailto:`、`tel:`，其餘以純文字顯示。
- AI：`wbsRagAdapter` 由 rich state 生成受控 Markdown 投影並加入 note id/title metadata；有 `detailNotes` 時不再另輸出 `description`，無 detail notes 時才使用 legacy description fallback。
- Rework 4 repo impact：`src/components/TaskNotes/TaskDetailNoteField.tsx`、現有 `TaskDetailNoteDesktopEditor.tsx` 的泛化／重新命名、`src/utils/taskNoteRichContent.ts` 未使用 append helper 清理、DEV-066 verifier 與受影響 browser verifier。`src/types/index.ts`、`TaskDetailsModal` save contract、`wbsRagAdapter`、Lexical dependency 與 schema 預期不需產品行為變更，只做 regression gate。

### 執行邊界與下一步

- 本輪執行邊界：只同步 Rework 4 的 Human Decision 與 Brief；未授權產品程式、測試、migration、production 資料操作、部署或 release。
- 下一步：使用者要求實作或完成 dev_task 時，補齊逐檔 patch intent、touch／keyboard failure recovery 與 executable evidence commands，將 Rework 4 升級為 `RD Implementation Ready` 後再交 RD。
- Quality gate 方向：TypeScript、targeted verifier、DEV-033／050 與既有資料／AI regression；1440／1024／390 rendered QC，加上 iOS Safari／Android Chrome 實機觸控選字與軟鍵盤證據。
- Stop condition：若必須新增第二套 editor、改 schema／API／權限／格式 allowlist／會議紀錄 editor，或只能以 plain text 覆寫 canonical rich state，停止並回到 PM／Human Decision；本輪不自動 release。

### 歷史 Completion Evidence（Rework 1～3）

- RD：完成版本化 Lexical JSON canonical、desktop on-demand semantic editor、mobile safe renderer＋append-only merge、plain compatibility alias 與 AI safe Markdown projection。
- QA：targeted contract suite、TypeScript、ESLint、P9 RAG local smoke、test build、DEV-006／008 static 與 DEV-033／050 browser regressions 通過。
- QC：1440 desktop、1024 laptop、390 mobile 共 13 cases PASS；popover geometry 穩定，手機為 0 editor／0 format toggle／0 contenteditable，append 前段 rich nodes byte-for-byte 不變，console/page error 與 visible alert 皆為 0。
- Rework 1：將不直覺的 `¶`、`H3`、刪除線等格式 glyph 改為完整中文標籤；targeted lint、TypeScript、static verifier 與 1440／1024／390 browser suite 再驗 PASS，沒有規格契約漂移。
- Rework 2：依使用者標註恢復粗體／斜體／底線的 B／I／U 圖示，刪除線改用不含 S 的 Aa 加水平線圖示；三種 viewport browser suite 再驗 PASS，沒有規格契約漂移。
- Rework 3：依使用者圖片將工具列移到 header 的 A 按鈕左側；輸入、outside click 與 Escape 不收起，只有再次點 A 關閉。SPEC／QA 已按明示需求作 `Intentional replacement`，targeted lint、TypeScript、static verifier 與 1440／1024／390 browser suite PASS。
- 證據文件：SPEC-066、ADR-042、QA-DEV-066、QC-DEV-066；screenshots 位於 output/playwright/dev-066-task-note-*.png。
- Rework 4 證據邊界：上述 mobile zero-editor／append PASS 是舊契約的歷史事實，不得作為新統一 editor 契約的通過證據；Rework 4 尚未實作或驗證。
- Release：未執行；Rework 4 完成並重跑新 QA/QC 前不得進入 DEV-066 release gate。

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
- 保存狀態的桌機 UI：「已保存在此裝置」、「已備份至雲端 HH:mm」、「雲端備份失敗，本機內容仍安全」。
- 離線期間合併成單一最新快照，重新連線時最多補送一份。
- 維持 draft 不產生 RAG document version、chunk、sync job 或 embedding；發布時才依 content hash 進入現有 RAG 流程。

### Out of Scope

- 手機版會議紀錄入口、編輯器、本機復原、雲端備份狀態與會議流程驗收。
- 多人即時共編、跨裝置文字合併、每次輸入版本歷史或完整事件溯源。
- 每次按鍵即呼叫雲端儲存，或用現有完整 `saveDraft()` 作為高頻自動儲存。
- draft 期間觸發 AI 整理、RAG、embedding 或重建所有 task links。
- 不含 schema／migration、production 操作、部署或 release。

### Frozen Implementation Contract

- 本機層：500ms debounce 同步產生 sessionStorage emergency copy 與 IndexedDB v1 durable snapshot；TTL 7 天，以 user/workspace/board/draft 分區。latest IndexedDB 成功才顯示「已保存在此裝置」；只有 sessionStorage 成功顯示 degraded；兩者失敗才顯示高風險警告。
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


## DEV-076：心智圖左鍵抓取畫布平移

- 文件成熟度：`RD Implementation Ready` → `Implemented / QA-QC PASS`
- 狀態：完成 / Implemented / QA PASS / QC PASS / 未 Release
- 節點類型：開發點
- 父交付點：DEV-027
- 是否計入產品交付完成：是（未 Release）
- 原始需求邊界：`USER-20260820-MINDMAP-LEFT-MOUSE-CANVAS-PAN`
- 風險等級：Medium（心智圖主要 pointer owner、selection lifecycle 與 world geometry regression；不涉及資料模型或後端）
- Spec Impact：`Intentional replacement / mindmap-only extension`

### Authoritative Package

- 實作契約：`ai-doc/specs/SPEC-076-mindmap-left-mouse-canvas-pan.md`
- 驗證計畫：`ai-doc/qa/QA-DEV-076-mindmap-left-mouse-canvas-pan.md`
- 座標與 viewport authority：SPEC-074；task interaction／quick-title authority：SPEC-070／071／073；mobile boundary：SPEC-029。
- ADR：不新增。這是 mindmap-only、可逆且由既有 viewport scroll authority 承接的手勢擴充。

### Current Execution Contract

- **目的**：空白畫布左鍵拖曳超過 6px 後以 direct pan 公式更新 viewport 兩軸 scroll，呈現 grab／grabbing 回饋。
- **Interaction Owner**：task node、center、toggle、relationship controls、semantic controls、native scrollbar、relationship/tool drag 狀態不得被 canvas pan 接管。
- **Selection**：有效 pan 吞掉後續 click並保留選取；門檻內普通 blank click 仍清除選取。
- **Architecture**：left pan 與既有 middle velocity pan 使用獨立 ephemeral refs；不以 React state 驅動 pointermove，不修改 scene matrix、world path、geometry dirty、資料或 undo。
- **Acceptance**：SPEC-076 AC-001～007、QA-DEV-076 case 001～010、1440／1024 rendered evidence、390 mobile negative boundary與 visible-error hard gate。
- **Stop Conditions**：第一個 owner、selection、geometry、data、touch/middle、cursor cleanup 或 visible error drift 即停止並回 RD。
- **Release Boundary**：本輪只含 local code、test、evidence 與必要文件；不含 commit、push、PR、merge、deploy、production data 或 release。

### Execution Result

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

- 文件成熟度：`Implemented / Released / FMEA Credential Exception Accepted`
- 狀態：P0＋P1已實作並發布；Edge Functions新key遷移與legacy停用完成；Management PAT輪替／strict gate依使用者FMEA例外跳過
- 節點類型：交付點
- 父交付點：無（Release Governance；相容延伸 ADR-037）
- 是否計入產品交付完成：是（實作與 QC 通過前不得計為已交付）
- 原始需求邊界：使用者確認執行P0＋P1並不做P2；P0＋P1程式與開發文件已完成，P2不納入。
- 風險等級：Medium implementation／Lane 2 release；正式Edge Function與legacy停用為Lane 3；PAT未輪替為已接受High residual risk
- Spec Impact：P0＋P1為 `Compatible extension`；2026-08-22使用者以FMEA明確核准一次性release exception，僅跳過PAT輪替／strict credential gate，其餘candidate、activation與canonical smoke保留，分類為`Intentional replacement`。
- 規格／驗證權威：`ai-doc/specs/SPEC-083-production-release-environment-integrity.md`、
  `ai-doc/qa/QA-DEV-083-production-release-environment-integrity.md`

### Human Confirmed Execution Boundary

- Current phase：P0環境／artifact fail-closed與P1入口已完成；sealed release `20260821144058-509110`通過candidate後啟用正式Hosting，canonical smoke PASS。
- Credential phase：`calendar-feed`／`match_project_knowledge`已改用新key、部署與停用legacy均完成；使用者於2026-08-22接受FMEA後明確跳過Management PAT輪替與strict gate，舊PAT保持有效。
- P2：使用者明確不採用；不建立CI workflow、protected environment、IAM或direct-deploy技術封鎖。
- 必要人類決策：本次production activation go/no-go已由使用者確認；未發生額外re-auth／2FA。
- 本機一次性 env profile migration 已提供 `npm run migrate:test-env-profile`；目前 dry-run 因 `.env.local` 與 `.env.test.local` 的 `VITE_DATA_BACKEND` 值不同而 fail-closed，未自動覆寫，需人類先決定保留哪個 test profile。
- 成本：P0＋P1沿用既有 Firebase Hosting／Supabase／Playwright，不新增固定月費；candidate／activation仍可能消耗既有 Hosting preview quota與網路流量。
- 本輪已完成local、candidate與canonical production驗證；release完成但帶有明確credential exception，不得宣稱strict credential gate PASS。

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
- P1 remediation：Edge Functions已改讀新publishable／secret JSON key maps，production smoke後已停用legacy；PAT輪替／strict gate由本次FMEA例外取代，保留為殘留風險。
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
- 本次一次性例外不得被解讀為strict credential gate通過；舊Management PAT仍active，後續release預設恢復原P1 gate。

### RD Slices、QA/QC 與 Evidence

- S0：先建立process-env、local-env、secret、tamper、OAuth與phase negative fixtures。
- S1：production contract、local/server loader與sanitized child env。
- S2：sealed build、release-meta、manifest與artifact verifier。
- S3：OAuth safe cancel self-check與production-bound adapter。
- S4：`release:production` prepare／candidate／activate orchestration與browser provenance。
- S5：依`QA-DEV-083`完成local mandatory matrix、Spec Drift與QC handoff；第一個失敗即停止。
- S6：Function rollback snapshot、新key部署／smoke、legacy停用／readback已完成；Management PAT輪替與strict gate由使用者FMEA例外跳過並保存客觀未完成狀態。
- Evidence root：`output/release/dev-083/<release-id>/`；generated artifact/evidence不加入Git，secret不落盤。

### 文件、執行與 Release Boundary

- RD Readiness：`PASS`。P0＋P1具repo/file impact、env/manifest/phase contract、failure recovery、QA FMEA、QC cases、stop conditions與evidence path；S0～S5及受控release已完成。
- ADR：不新增。DEV-083保持ADR-037 compatible extension，Level 3 authority、provider與activation ownership未改。
- Release Feasibility：現有Firebase Hosting/Supabase能力足夠，不需新固定月費；實際release屬Lane 2，
  仍需Layer 1-2、targeted Level 3、inactive production candidate、獨立activation decision與canonical smoke。
- 實作與證據：`npm run verify:source` PASS（lint 0 errors／tsc／sealed build／既有 Supabase static、migration alias、calendar、core regression、P9 gate）；
  `npm run verify:dev-083-production-release-gate` PASS（19項 local fixture／negative／sanitized runtime child／credential evidence mode／full-manifest remote hash／supported command contract／live-channel snapshot與phase safety；QA-083-01～05 local PASS）；
  `npm run verify:production-artifact` PASS（最新 manifest tree／contract／ref／secret／tamper scan）；
  `npm run verify:dev-083-oauth-cancel` PASS（valid／invalid synthetic 302 chain）；`npm run verify:dev-083-layer2` PASS（exact artifact browser／provenance／cleanup）；`node scripts/p8-preflight.mjs --strict` PASS、`npm run verify:production-bound-readiness` PASS。`node scripts/p8-credential-rotation-check.mjs --strict`目前因三組old credential只有`human-attested`而如預期BLOCK；candidate前需客觀inactive probe或明確release exception。
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
- 父任務：DEV-027；更正 DEV-077；相容 DEV-027E、DEV-076、DEV-084
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

## PM Update 歷史歸檔

2026-07-17：DEV-052 已從 active 總任務清單移除；歷史 SPEC / QA 封存至
`ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md` 與
`ai-doc/archived/QA-DEV-052-kanban-drag-subsystem-refactor.md`。DEV-052 不得直接執行；
未來若需要拖拉子系統重構，需另立以目前 `main` runtime 為基準的新 DEV。

2026-07-15：歷史 `PM Update` 詳細段落已移至 `ai-doc/archived/dev_task_pm_updates_2026-07-15.md`。

- Active `dev_task.md` 只保留 `## 總任務清單` 作為冷啟動與派工入口。
- 需要特定 DEV 的歷史、release evidence 或詳細 PM 更新時，先用 DEV ID 搜尋 archive，再只讀命中的段落。
- 不要從 `C:\VIBE CODING\ProJED` 外層遞迴讀取 sibling clone；active repo 固定為 `C:\VIBE CODING\ProJED\ProJED`。
