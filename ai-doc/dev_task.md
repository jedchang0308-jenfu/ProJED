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
  - 摘要：把「移到指定任務底下」改成跨 L1／L2／L3+ 一致的完整 hover-scope 落點；前 1 秒不顯示子任務藍框並保留既有同階／lane 操作，連續滿 1,000ms 才讓 DEV-065 同款藍框與下一子階定位同步出現；若結果回到原位則顯示原任務名稱並 zero-write，否則放開後提交 exact parent。
  - 來源 ID：`USER-20260815-TASK-TITLE-CENTER-CHILD-DROP`
  - 父任務：DEV-053、DEV-054、DEV-055、DEV-058、DEV-065、DEV-067
  - 下一步：接入 AI 可控 iPhone Safari 與 Android Chrome，完成各平台 physical precision gate；兩者通過後才可標完整 mobile sign-off。若要交付正式環境，另走 release gate。
  - 阻塞 / 恢復條件：本輪不含部署或 release。缺 iPhone Safari／Android Chrome AI 可控實機時，只能標記 browser gate 通過，不得宣稱完整 physical mobile sign-off。
  - 證據：基線 commit `56baa77`、RD 續作前 checkpoint commit `ca41403`；`QC-DEV-068`；使用者重驗依序修正 title slot、title-only scope、來源卡遮擋、控制項 overlay 命中、candidate 搶走 standard drop、Workbench來源誤入child intent、文字ghost不一致、desktop viewport-change cleanup、candidate藍框過早出現與child-origin名稱預覽。來源卡為pointer/finger上方fixed overlay；DEV-068 static 66/66、browser 29/29，全部相鄰browser 64/64。68項對照見`QA-DEV-068-coverage-matrix`。未偵測到iPhone／Android實機。
  - 計入交付：是

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

舊版只有 L2 卡片底部透明追加區，後續 title-only 方案仍與使用者看見的任務範圍不一致。最終方案把 DEV-065 完整預選範圍（主任務＋可見子樹）當作 child dwell scope；未滿 1 秒不顯示子任務藍框、放開仍走既有 standard drop，滿 1 秒後藍框與「下一子階插入線」才同步出現並由 child intent 接管。

### Human Decision / RD Contract

- L1／L2／L3+ 共用 DEV-065 complete-hover-scope child intent；canonical target 是 outer scope，不是 title span。標題尾端與主表面空白都屬於 scope；內層任務以 exact innermost ownership 接管，展開、輸入、連結、選單等內部控制依實際矩形排除。
- 真正開始拖曳後才計 child dwell；同一 source、target 與完整hover scope連續 1,000ms 才 armed。未滿 1 秒放開依當下 standard drop，不得提交 child。
- Candidate 不顯示子任務藍框，只保留 standard insertion marker；armed 後 parent/subtree frame 與下一子階唯一 child insertion marker 同步出現。插入線沿用既有圓點＋線條樣式，起點依 L2／L3／L4+ 逐層右移；Preview 使用 overlay／portal，不得推動 layout。
- 原始任務卡以raw pointer／finger為anchor固定於右上方16px；靠右時改放左上方並保留8px viewport margin，且不得遮住parent frame或child insertion marker。
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
- 使用者重驗顯示時序修正：candidate 的子任務 primary/subtree/scope frame 全為0；armed 才與下一子階 insertion marker 同步顯示。
- 使用者重驗原位修正：child append 若父層／型態／兄弟順序均不變，armed 改顯示既有藍底白字來源名稱欄位；一般 marker=0，release 完整 node snapshot 不變且無成功播報。同父層但實際換序仍維持一般 marker 與 commit。
- Commit 後 RD 稽核：failure-first 抓到 desktop orientationchange 後仍可提交，補 orientationchange／resize cancel 後 7 種終止來源回歸通過。
- 核心 gate：DEV-068 static 66/66、desktop/mobile browser true operation 29/29；68 個 QA case 均已連回 AI 操作證據。
- 相鄰回歸：DEV-065 40/40＋15/15、DEV-053 30/30＋10/10、DEV-054 44/44＋15/15、DEV-055 28/28＋16/16、DEV-058 26/26、DEV-067 13/13＋8/8，全部 PASS。
- 工程 gate：TypeScript PASS；targeted ESLint 0 error／2 個既存 warning；`npm run build:test` PASS（2000 modules）。
- Rendered viewports：1440x900、1024x768、390x844、430x932、320x844；console／network／visible-error／overflow sweep PASS。
- QC authoritative evidence：`ai-doc/qc/QC-DEV-068-task-title-center-child-drop.md`。
- Remaining gate：本機未偵測到 ADB 或 Windows iPhone／Android portable device；依 QA 契約維持執行中，不標記 Complete 或 release ready。

### RD Readiness Gate

- 共用 `task-title-child` target、complete-hover-scope geometry、candidate/standard coexist、desktop/mobile child-intent state、timer cleanup、release revalidation、single commit與 success feedback 的檔案級契約已寫入 `SPEC-068`。
- 無 schema／migration／API／remote／權限模型變更；P0/P1 產品決策與工程 readiness 缺口均已清除。
- 本輪可執行產品程式、targeted verifier與本機 RD→QC；production deploy／release仍需另走 release gate。


## PM Update 歷史歸檔

2026-07-17：DEV-052 已從 active 總任務清單移除；歷史 SPEC / QA 封存至
`ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md` 與
`ai-doc/archived/QA-DEV-052-kanban-drag-subsystem-refactor.md`。DEV-052 不得直接執行；
未來若需要拖拉子系統重構，需另立以目前 `main` runtime 為基準的新 DEV。

2026-07-15：歷史 `PM Update` 詳細段落已移至 `ai-doc/archived/dev_task_pm_updates_2026-07-15.md`。

- Active `dev_task.md` 只保留 `## 總任務清單` 作為冷啟動與派工入口。
- 需要特定 DEV 的歷史、release evidence 或詳細 PM 更新時，先用 DEV ID 搜尋 archive，再只讀命中的段落。
- 不要從 `C:\VIBE CODING\ProJED` 外層遞迴讀取 sibling clone；active repo 固定為 `C:\VIBE CODING\ProJED\ProJED`。
