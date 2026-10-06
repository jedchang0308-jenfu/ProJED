# RD 技術主管審查：DEV-108 任務明細會議補記持續呈現

- 日期：2026-09-07
- 審查對象：DEV-108、SPEC-108、QA-DEV-108、SPEC-009 amendment、現行 record store／provider／task detail 路徑
- 原始審查結論：`通過（文件修正後） / RD Implementation Ready / Not Implemented at review time`
- 實作後狀態：`Implemented / QA-QC PASS / Local-only / NOT RELEASED`
- 執行邊界：只審查與修正開發文件；未修改產品程式、測試實作、runtime、schema、migration、Git index、deploy 或 release

## 結論

DEV-108 的真正問題不是 meeting draft 沒有保存文字，而是 task detail 只有 meeting-mode composer，沒有以
record lifecycle 為權威的第一層投影；離開 meeting mode 後 conditional UI 整段卸載，因此使用者把可找回
的內容感知成消失。以同一 `KnowledgeRecord` 擴充 provenance、task-scoped archived read 與 active-draft
override，是目前最小可行架構，不需要建立新資料表、TaskNode 副本、全域 archived store 或新權限。

最短因果鏈：

`補記只 append active draft → TaskDetailsModal 以 isMeetingMode 控制整區 → task detail 沒有 persistent projection`
→ 送出後只看到輸入清空、會議結束後整區消失
→ 在 meeting record aggregate 內保存 stable provenance，並讓 task detail 按 record lifecycle 投影
→ 同一畫面可立即確認，會後、封存後與重載後仍存在。

## 五項關鍵發現與修正

### F1 — 「單一來源」原文過度宣稱，正文與 metadata 實際是雙表示

- 風險：若 RD 把兩者視為各自權威，文字修改、AI synthesis 或 retry 會產生 silent drift。
- 修正：SPEC-108 明定 metadata entry 是 task-detail list 的 canonical representation；正文是 DEV-009／
  task knowledge／AI workflow 的 compatibility projection。兩者必須同一 store transaction 更新，save 前驗證
  aggregate invariant。
- 判定：修正後通過；沒有跨 record／TaskNode 的第二來源，但保留受控技術債，不再用文字掩蓋。

### F2 — 原 `HH:mm + occurrence` anchor 在同分鐘重複與行移動時可能錯配

- 風險：錯配比暫時不顯示更嚴重，會把 A 內容掛到 B 的 stable id。
- 修正：anchor 改為 `lineIndex + sourceToken`；reconcile 依「原行 → 唯一 exact candidate → 唯一 sourceToken」
  順序處理，無唯一候選即 detach，保留正文且不猜測。Supported edit contract 限定修改冒號後文字或刪整列。
- 整合修正：AI synthesis 合併後也必須以前後正文 rebase anchor 並驗證 invariant；失敗沿用 DEV-024
  preserved-draft rollback，不得只 spread 舊 metadata。
- 判定：修正後通過；同分鐘／多候選與 invariant mismatch 納入 deterministic gate。

### F3 — archived persistence 不能靠擴大全域 records store

- 風險：若改 `listByProject` 包含 archived，紀錄側欄、搜尋與既有 UI 會出現隱性回歸；若只用現有 store，
  archive 後來源又會消失。
- 修正：只為 `listByNode` 增加預設關閉的 `includeArchived` option；task detail loader 明確啟用，其他 caller
  與全域側欄行為不變。三 provider 仍保留 workspace／board／task link／record type／RLS 約束。
- 判定：通過；這是最小 query surface，無 migration 或 permission expansion。

### F4 — 「加入成功」與「已持久化」必須分層

- 風險：目前 append 是同步寫入 active draft，不是 remote save；若文件把清空輸入解讀成雲端持久化成功，
  QA 會建立錯誤保證。
- 修正：加入成功只代表正文、metadata、taskLinks 已原子進入 current draft；耐久性沿用 DEV-106 local recovery
  與既有 save feedback。Append denied 保留輸入；recovery／remote save 失敗保留已進 draft 的 entry，重試同一
  aggregate，不重建 id。
- 判定：修正後通過。

### F5 — QA 必須對準新風險，不重跑未變更的角色百科

- 風險：把角色矩陣、所有歷史功能與 supplemental accessibility 都列為 blocking，會稀釋真正 P1：來源誤判、
  identity 重複、archive 消失與錯誤被當空白。
- 修正：主要角色固定 local-test owner；權限只驗 query 沒放寬既有 scope。Static gate 聚焦 provenance、anchor、
  invariant、dedupe、provider option、recovery；browser 聚焦真實入口、跨模式、edit/archive/source absence、
  latest-3、錯誤、三 viewport 與鍵盤語意。Screen reader 實機列 supplemental，不得虛報。
- 判定：修正後通過。

## 最小架構與技術債

最小新增面為一個 domain utility、一個 task-scoped loader hook、一個純呈現 section，以及既有 store／provider
的小幅擴充。`TaskRecordTimeline`、TaskNode schema、database、permission matrix 與全域 record list 均不修改。

保留技術債是同 record 內 canonical metadata 與 compatibility content projection 的雙表示。影響、隔離、
移除觸發與驗證已寫入 SPEC-108 §8.1：若未來 editor 支援 stable structured quick-note node，或 content
projection 可退場，才另案移除 anchor reconcile。現階段任何 ambiguous mapping 必須 fail closed；不得以
錯配換取表面上的「持續顯示」。

ADR 維持不需要：本次不改外部 API、主資料 identity、schema、RLS、權限或不可逆治理基準。

## 最終 Gate

- 阻擋項目：無。原 P1 雙表示與 anchor 模糊已修正為明確權威、invariant、fail-closed 與技術債契約。
- RD 可依 Batch A→D 開始；Batch A 的 parser／invariant／provider option 未通過前不得接 UI。
- 本結論只代表文件可實作，不代表產品已完成、QA/QC PASS 或 release。

使用思考習慣：#多層次分析、#系統描繪、#可驗證性

## 實作後追加審查：日粒度顯示（2026-09-07）

- 使用者修正：會議紀錄列表以「日」作為顯示記錄點，畫面顯示 `MM/DD`；幾點幾分不屬於此列表的使用者資訊。
- 最小修正：只調整 `TaskMeetingQuickNoteSection` 的呈現格式與 QA assertion；`occurredAt` 精確值仍保留，
  用於 deterministic 排序、去重、anchor／來源追蹤，避免改寫既有 `## 任務討論` compatibility projection。
- 判定：通過。這是 presentation contract 收斂，不新增資料欄位、migration、provider API 或第二份來源。
- 證據：static 14 assertions、browser B01～B09、TypeScript、targeted ESLint、`build:test`、`git diff --check` PASS。
