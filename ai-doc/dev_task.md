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
- ! DEV-054 [交付點] [阻塞] [P1] [RD Rework 5 Automated QA-QC Passed / Awaiting Physical Devices] 手機任務拖拉定位精準度優化
  - 摘要：Rework 5 修正長按計時器成立前瀏覽器已啟動文字圈選／iOS callout，以及真實 TouchEvent 被 `innerWidth <= 768` gate 誤導回桌機路徑的根因；L1、L2、L3+ 與 Workbench 未歸位任務表面現在從 touchstart 宣告 selection ownership，實際 touch 不再依 viewport 寬度分流。Workbench 保留 native pan，已歸位列仍不可拖；桌機 dnd-kit、click/right-click 與 approved overlay 契約維持。
  - 來源 ID：`USER-20260717-mobile-task-drag-precision`
  - 父任務：DEV-053、DEV-029、DEV-046
  - 下一步：Automated QA-QC 已通過，實機驗證工作簿亦已備妥；連接 iPhone Safari 與 Android Chrome 後依工作簿各執行主要 50 次與 P06-P12 補充情境，兩台實機 gate 均通過後才可關閉 DEV-054。
  - 阻塞 / 恢復條件：2026-08-14 連續三輪完成稽核均未偵測到可操作的 iPhone/iPad/Android 裝置；需提供 iPhone Safari 與 Android Chrome 實機，或回傳填妥且附錄影的驗證工作簿後恢復。不得改變桌機 approved baseline、恢復 DEV-051/052 或讓 Workbench placed row 可拖；任一實機缺席或 wrong commit > 0 不得完成。
  - 證據：`SPEC-054`、`QA-DEV-054`、`QC-DEV-054`；2026-08-14 DEV-054 static 44/44、browser R01-R15 15/15、DEV-029 browser 41 cases、DEV-039/046 browser、DEV-053 10/10、DEV-055 16/16、DEV-067 8/8、全部指定 static regression、TypeScript、targeted ESLint（0 error）與 `build:test` 通過。R12-R15 直接證明 L1/L2/L3+ 零圈選、500ms/8px 邊界、寬觸控 viewport 與 Workbench pan/no-drag 契約。實機驗證工作簿已完成公式雙向模擬與六分頁 visual QA；本機未偵測到可操作的 iOS/Android 實體裝置，故仍不得標記完整完成。
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
- ● DEV-066 [交付點] [已完成] [P1] [QC PASS / 未 Release] 任務備註語意富文字與 AI 可讀內容
  - 摘要：桌機／筆電讓每個任務備註欄以按需開啟的浮動工具編輯語意格式；手機不載入富文字編輯器，改為格式化唯讀與純文字追加；AI 取得去重且保留結構的安全文字投影。
  - 來源 ID：`USER-20260812-TASK-NOTE-RICH-TEXT-AI-READABLE`
  - 父任務：DEV-006、DEV-008、DEV-057
  - 下一步：功能已完成；若要交付正式環境，另走 release gate。既有 nanoid advisory 與 DEV-047 MOD-047-013 finding 另立維護 DEV，不混入本交付。
  - 阻塞 / 恢復條件：本輪無交付阻塞；未授權 migration、production 資料操作、部署或 release。
  - 證據：2026-08-12 `/grilling` 決策 `1A／2A／3A`；`SPEC-066`、`ADR-042`、`QA-DEV-066`、`QC-DEV-066`；targeted lint、TypeScript、test build、RAG smoke、DEV-006／008／033／050 regression 與 1440／1024／390 rendered QC 通過。Rework 1 將 `本文／小標題` 改為完整中文標籤；Rework 2 恢復 B／I／U 與 Aa 刪除線圖示；Rework 3 將工具列移到 header 的 A 左側並改為 toggle-only 常駐。1024 toolbar 無裁切或水平 overflow。
  - 計入交付：是
- ● DEV-067 [交付點] [已完成] [P1] [QC PASS / 未 Release] 看板任務拖曳升級為 L1 列表
  - 摘要：讓 L2／L3+ 任務可拖到列表標頭升級為 L1，並以既有單一定位條顯示插入位置；列表內容區仍維持 L2 drop，尾端新增 L1 append target。
  - 來源 ID：`USER-20260814-KANBAN-L1-DRAG-PROMOTION`
  - 父任務：DEV-053、DEV-054、DEV-055、DEV-058
  - 下一步：功能已完成；若要交付正式環境，另走 release gate。
  - 阻塞 / 恢復條件：不得恢復 DEV-051／052、不得改 Workbench placed-row no-drag、來源 no-op、單一 marker、raw finger、click/right-click 或 schema；任何 indicator／commit 不一致即停止。
  - 證據：`SPEC-067`、`QA-DEV-067`、`QC-DEV-067`；DEV-067 static 13/13、browser 8/8、DEV-055 desktop 16/16、DEV-054 mobile 11/11、DEV-053／054／055／058 static regression、TypeScript、targeted ESLint、test build 與 1440／1024／390 rendered QC 通過。
  - 計入交付：是
- ◐ DEV-068 [交付點] [執行中] [P1] [AI Browser QA-QC PASS / Physical Mobile 未充分驗證 / 未 Release] 任務完整預選範圍停留移入子任務
  - 摘要：把「移到指定任務底下」改成跨 L1／L2／L3+ 一致的完整 hover-scope 落點；拖離來源後原位置保留尺寸穩定的虛線框；前 1 秒不顯示子任務藍框並保留既有同階／lane 操作，連續滿 1,000ms 只顯示下一子階插入線；若結果回到原位則顯示原任務名稱並 zero-write，否則放開後提交 exact parent。
  - 來源 ID：`USER-20260815-TASK-TITLE-CENTER-CHILD-DROP`
  - 父任務：DEV-053、DEV-054、DEV-055、DEV-058、DEV-065、DEV-067
  - 下一步：接入 AI 可控 iPhone Safari 與 Android Chrome，完成各平台 physical precision gate；兩者通過後才可標完整 mobile sign-off。若要交付正式環境，另走 release gate。
  - 阻塞 / 恢復條件：本輪不含部署或 release。缺 iPhone Safari／Android Chrome AI 可控實機時，只能標記 browser gate 通過，不得宣稱完整 physical mobile sign-off。
  - 證據：基線 commit `56baa77`、RD 續作前 checkpoint commit `ca41403`；`QC-DEV-068`；使用者重驗依序修正 title slot、title-only scope、來源卡遮擋、控制項 overlay 命中、candidate 搶走 standard drop、Workbench來源誤入child intent、文字ghost不一致、desktop viewport-change cleanup、candidate藍框過早出現、child-origin名稱預覽、來源原位虛線框、子任務定位藍框完全取消與不可取消 touchcancel。來源卡為pointer/finger上方fixed overlay；DEV-068 static 73/73、browser 30/30，全部相鄰browser 64/64。70項對照見`QA-DEV-068-coverage-matrix`。未偵測到iPhone／Android實機。
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

## DEV-066：任務備註語意富文字與 AI 可讀內容

- 狀態：Completed / QC PASS / Human Confirmed / 未 Release
- 節點類型：交付點
- 父交付點：DEV-006、DEV-008、DEV-057
- 是否計入產品交付完成：是
- 原始需求邊界：`USER-20260812-TASK-NOTE-RICH-TEXT-AI-READABLE`
- 風險等級：Medium（跨桌機／手機 UI、內容相容與 AI indexing）

### 問題與使用者價值

目前任務詳情的備註內容是純文字 `textarea`。使用者需要在桌機以 Gmail／Word／Excel 熟悉的方式表達標題、重點、清單與連結，但格式功能不常用，不應常態占用版位；同一份內容還必須讓 AI 穩定讀取與索引。手機的主要任務是閱讀與快速補記，不應載入或顯示富文字編輯器。

完成後，使用者可以在需要時才叫出格式工具，平時仍保有目前緊湊的備註畫面；桌機格式、手機補記與 AI 讀取走明確的資料方向，不因跨裝置操作而靜默遺失格式或重複餵給 AI。

### Human Decision Brief

- `1A`：手機不提供富文字編輯器。既有內容以安全的格式化唯讀方式呈現，另提供純文字追加欄；追加不得覆寫或降級原有桌機格式。
- `2A`：桌機第一版只提供語意格式：本文／小標題、粗體、斜體、底線、刪除線、項目清單、編號清單、連結與清除格式。
- `3A`：每一個備註欄使用相同行為，各自具有按需叫出的格式按鈕與工具，不限定第一個預設備註。
- 已拒絕：手機完整純文字覆寫、手機完全不可補記、Word-like 字型／字級／顏色／對齊／表格／圖片，以及只讓第一個備註支援格式。

### 主要流程

#### 桌機／筆電

1. 每個備註標題右側顯示低干擾的「文字格式」按鈕，與該備註的新增／刪除動作相鄰但語意分離。
2. 工具列預設關閉且不占版位；點擊按鈕後顯示在同一 header row、格式按鈕左側，不推擠內容欄或改變 modal 高度。
3. 工具列開啟後保持顯示；點進內容、持續輸入、點外部或按 `Escape` 均不收起，只有再次按同一個格式按鈕才關閉。
4. 工具列操作需保留原本文字 selection；儲存、關閉前寫入、undo／redo、中文 IME、複製貼上與多備註行為不得退步。

#### 手機

1. 不顯示格式按鈕，不掛載富文字編輯器或浮動工具列。
2. 既有備註以安全 renderer 顯示其語意格式，使用者不能在手機直接覆寫格式化本文。
3. 每個備註提供簡單純文字追加欄；成功追加後成為該備註的新段落，不改寫既有格式節點。
4. 追加失敗時保留尚未提交的文字並提供可發現的重試方式，不得清空輸入。

### 初步範圍

- 任務詳情中的所有 `TaskDetailNote` 內容欄。
- 桌機／筆電按需開啟、header-inline 且 toggle-only 關閉的單列語意格式工具列，以及可見 focus／pressed 狀態與 tooltip。
- 本文／小標題、粗體、斜體、底線、刪除線、項目清單、編號清單、連結、清除格式。
- Gmail／Word 貼上時只保留允許的語意格式；一般 `Ctrl+C/V`、純文字貼上、中文 IME、undo／redo 與 editor focus 內快捷鍵需一致。
- 手機格式化唯讀 renderer 與每個備註的純文字追加流程。
- 舊純文字備註向下相容，以及桌機保存／重開後格式 round-trip。
- AI indexing 使用由受控內容模型產生的 Markdown 或等效語意文字投影，不把 raw HTML 直接送入 AI。
- AI 文件需以備註為單位保留 `taskId`、`noteId`、`noteTitle` 與可用的更新資訊，並避免第一個備註由 `description` 與 `detailNotes` 重複索引。

### 初步範圍外

- 手機富文字工具列、手機直接覆寫格式化本文。
- 字型、任意字級、文字／背景顏色、對齊、表格、圖片、附件、嵌入內容與程式碼區塊。
- Excel 儲存格轉原生表格；第一版只保證可安全貼成純文字或允許的基本段落。
- 多人即時協作、留言／修訂模式、版本歷史與 Word 等級版面能力。
- 修改會議紀錄 `RecordContentEditor` 的既有產品行為；若 RD 後續抽共用 editor core，必須維持 DEV-006 回歸契約。
- 本 Brief 階段的 schema migration、production 操作、部署與 release artifact。

### 驗收方向

- 桌機每個備註欄都有自己的格式按鈕；工具列關閉時不占垂直版位，開啟後顯示在按鈕左側並持續存在，編輯內容不自動收起，開啟／關閉不造成 modal layout shift、裁切或非預期捲動。
- 桌機語意格式、連結、清單、selection、中文 IME、貼上、undo／redo、明確儲存與 X 關閉前寫入，在保存並重開後結果一致。
- 桌機 editor focus 內的 `Ctrl+B/I/U/K/Z/Y` 等熟悉快捷鍵作用於目前備註且不洩漏到外層任務快捷鍵；是否納入 `Ctrl+S` 於 RD Contract 階段依既有儲存契約決定。
- 1440px 與 1024px viewport 可完整操作 header-inline toolbar；390px mobile 不出現格式按鈕、Lexical contenteditable 或水平 overflow。
- 手機能閱讀桌機建立的格式化內容並以純文字追加；追加前後原有格式與文字不變，離線／失敗時輸入不遺失。
- 舊的純文字備註不需人工轉檔即可閱讀、編輯與被 AI 搜尋；任何 lazy upgrade 必須可回復且不得產生空內容。
- AI 輸入能保留標題、段落、清單、強調、連結與備註 metadata，不包含未清理 HTML／script，且相同第一備註不重複出現在同一份 RAG document。
- 真實 rendered surface 的 desktop／laptop／mobile QC 必須包含主要互動、可見錯誤掃描、長內容、長連結、空內容、多備註與 readonly／disabled 狀態。

### 限制、風險與待 RD 決定事項

- 現有 `recordLexicalContent` serializer 只保存純文字與 task mention token；不能直接加格式工具後沿用原 serializer，否則格式會在儲存時消失。
- RD Contract 階段需決定單一 canonical rich state、純文字 fallback、AI 語意投影與 schema/version 邊界；投影是衍生資料，不得形成可各自編輯而漂移的三份正文。
- 手機追加需有明確的 merge contract，保證只新增段落並處理同時更新；不得以手機純文字覆蓋整份 desktop rich state。
- Gmail／Word HTML 貼上需 allowlist、URL protocol 檢查與清理；未知 node 或轉換失敗時降級為純文字，不得中斷輸入或保存不安全內容。
- 既有 `description = 第一個備註` 相容別名與 RAG adapter 同時輸出 description／detailNotes 的重複風險，需在實作契約中指定唯一 AI owner 與 legacy fallback。

### Architecture Memory Capsule

- 延續既有 Lexical 能力與經驗，不在同一產品中引入第二套 editor engine；是否抽成共用 core 於 RD Contract 階段依回歸成本決定。
- 富文字原稿與 AI 輸入分層：原稿負責無損重開，AI 只讀安全且去重的語意投影；raw HTML 不作 canonical source，也不直接送入 AI。
- 手機永遠不掛載富文字 editor；若未來要求手機直接修改格式化本文，視為產品方向改變並重新進入 Human Decision／RD Contract。

### RD Implementation Contract

- Canonical：`TaskDetailNote.richContent` 儲存帶 `task-note.lexical-v1` 版本的 Lexical JSON；`content` 為由 canonical state 衍生的純文字相容別名，`description` 繼續只鏡像第一則備註純文字。投影不可反向覆寫 rich state。
- Legacy：沒有 `richContent` 的舊備註以 `content` 開啟，只在首次實際編輯或手機追加時 lazy upgrade；無 migration，現有 Supabase `detail_notes` JSONB 繼續完整儲存可選欄位。
- Desktop：只在 `min-width: 768px` 掛載 Lexical；每則備註各有一個格式按鈕與 header-inline toolbar，工具列絕對定位於按鈕左側且不改變 card/modal 幾何。開啟狀態只由該按鈕切換，editor focus、內容輸入、outside click 與 Escape 不關閉。格式限於 2A allowlist，`Ctrl+S` 阻止瀏覽器另存並呼叫任務明確儲存。
- Mobile：低於 768px 不 render 格式按鈕、LexicalComposer 或 `contenteditable`；安全 renderer 僅處理 allowlist node，追加只在 root 尾端新增純文字 paragraph，失敗前不清空 draft。
- Clipboard/security：不儲存 raw HTML；未知 node 轉成其文字 children，連結只允許 `http:`、`https:`、`mailto:`、`tel:`，其餘以純文字顯示。
- AI：`wbsRagAdapter` 由 rich state 生成受控 Markdown 投影並加入 note id/title metadata；有 `detailNotes` 時不再另輸出 `description`，無 detail notes 時才使用 legacy description fallback。
- Repo impact：`src/types/index.ts`、`src/utils/taskNoteRichContent.ts`、`src/components/TaskNotes/*`、`src/components/TaskDetailsModal.tsx`、`src/services/rag/wbsRagAdapter.ts`、Lexical 直接相依、DEV-066 verifier 與現有備註 browser verifier 相容更新。

### 執行邊界與下一步

- 本輪執行邊界：已授權完成 DEV-066 的 RD、最小 QA 與 targeted QC；不含 migration、production 資料操作、部署與 release。
- Quality gate：必須通過 TypeScript、targeted static/unit verifier、現有受影響備註回歸，並在 1440／1024／390 viewport 完成真實 rendered QC 與可見錯誤掃描。
- Stop condition：如需改動 Supabase schema、會議紀錄 editor 行為、手機全文覆寫或格式 allowlist，停止並重回 Human Decision；本輪不自動 release。

### Completion Evidence

- RD：完成版本化 Lexical JSON canonical、desktop on-demand semantic editor、mobile safe renderer＋append-only merge、plain compatibility alias 與 AI safe Markdown projection。
- QA：targeted contract suite、TypeScript、ESLint、P9 RAG local smoke、test build、DEV-006／008 static 與 DEV-033／050 browser regressions 通過。
- QC：1440 desktop、1024 laptop、390 mobile 共 13 cases PASS；popover geometry 穩定，手機為 0 editor／0 format toggle／0 contenteditable，append 前段 rich nodes byte-for-byte 不變，console/page error 與 visible alert 皆為 0。
- Rework 1：將不直覺的 `¶`、`H3`、刪除線等格式 glyph 改為完整中文標籤；targeted lint、TypeScript、static verifier 與 1440／1024／390 browser suite 再驗 PASS，沒有規格契約漂移。
- Rework 2：依使用者標註恢復粗體／斜體／底線的 B／I／U 圖示，刪除線改用不含 S 的 Aa 加水平線圖示；三種 viewport browser suite 再驗 PASS，沒有規格契約漂移。
- Rework 3：依使用者圖片將工具列移到 header 的 A 按鈕左側；輸入、outside click 與 Escape 不收起，只有再次點 A 關閉。SPEC／QA 已按明示需求作 `Intentional replacement`，targeted lint、TypeScript、static verifier 與 1440／1024／390 browser suite PASS。
- 證據文件：SPEC-066、ADR-042、QA-DEV-066、QC-DEV-066；screenshots 位於 output/playwright/dev-066-task-note-*.png。
- Release：未執行；Supabase schema/migration、production 資料與部署均未變更。

### Spec Governance 結論

- SPEC-006：`Intentional successor`；保留其「DEV-006 不含富文字工具列與 editor JSON」歷史完成邊界，DEV-066 另行承接新能力。
- SPEC-008／DEV-057：`Compatible extension`；任務知識仍由任務詳情查找，儲存與 X 關閉前寫入不可退步。
- ADR：建立 `ADR-042`，記憶 canonical Lexical JSON／plain compatibility alias／safe AI projection 的跨模組單向資料契約。
- Spec／QA 文件：建立 `SPEC-066` 與 `QA-DEV-066`，作為本輪 RD／QA／QC 交接契約。
- 剩餘產品決策：無。格式 allowlist、desktop/mobile 邊界與每備註一致性已由 `1A／2A／3A` 確認。

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

- 狀態：Implemented / AI Browser QA-QC Passed / Physical Mobile 未充分驗證 / 未 Release
- 節點類型：交付點
- 父交付點：DEV-053、DEV-054、DEV-055、DEV-058、DEV-065、DEV-067
- 是否計入產品交付完成：是
- 原始需求邊界：`USER-20260815-TASK-TITLE-CENTER-CHILD-DROP`
- 風險等級：Medium-to-High（核心拖曳意圖、parent/order、跨階層與桌機／手機手勢衝突）

### 問題與使用者價值

舊版只有 L2 卡片底部透明追加區，後續 title-only 方案仍與使用者看見的任務範圍不一致。最終方案把 DEV-065 完整預選範圍（主任務＋可見子樹）當作 child dwell scope；未滿 1 秒不顯示子任務藍框、放開仍走既有 standard drop，滿 1 秒後只顯示「下一子階插入線」並由 child intent 接管。

### Human Decision / RD Contract

- L1／L2／L3+ 共用 DEV-065 complete-hover-scope child intent；canonical target 是 outer scope，不是 title span。標題尾端與主表面空白都屬於 scope；內層任務以 exact innermost ownership 接管，展開、輸入、連結、選單等內部控制依實際矩形排除。
- 真正開始拖曳後才計 child dwell；同一 source、target 與完整hover scope連續 1,000ms 才 armed。未滿 1 秒放開依當下 standard drop，不得提交 child。
- Candidate 與 armed 都不顯示子任務 target 藍框；candidate 保留 standard insertion marker，armed 清除後只顯示下一子階唯一 child insertion marker。插入線沿用既有圓點＋線條樣式，起點依 L2／L3／L4+ 逐層右移；Preview 使用 overlay／portal，不得推動 layout。
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


## PM Update 歷史歸檔

2026-07-17：DEV-052 已從 active 總任務清單移除；歷史 SPEC / QA 封存至
`ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md` 與
`ai-doc/archived/QA-DEV-052-kanban-drag-subsystem-refactor.md`。DEV-052 不得直接執行；
未來若需要拖拉子系統重構，需另立以目前 `main` runtime 為基準的新 DEV。

2026-07-15：歷史 `PM Update` 詳細段落已移至 `ai-doc/archived/dev_task_pm_updates_2026-07-15.md`。

- Active `dev_task.md` 只保留 `## 總任務清單` 作為冷啟動與派工入口。
- 需要特定 DEV 的歷史、release evidence 或詳細 PM 更新時，先用 DEV ID 搜尋 archive，再只讀命中的段落。
- 不要從 `C:\VIBE CODING\ProJED` 外層遞迴讀取 sibling clone；active repo 固定為 `C:\VIBE CODING\ProJED\ProJED`。
