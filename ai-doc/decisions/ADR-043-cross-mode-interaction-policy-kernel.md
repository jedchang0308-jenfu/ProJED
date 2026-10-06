# ADR-043：以稀疏繼承 Profile 與 Semantic Action Kernel 治理跨模式互動

- 狀態：Accepted / DEV-070 RD Implementation Contract Locked
- 日期：2026-08-17
- 關聯：DEV-070、SPEC-070、DEV-027B、DEV-028、DEV-029

## Context

清單、心智圖、看板、甘特及輔助任務表面目前直接綁定選取、開詳情、快捷鍵、右鍵選單與 post-create helper。這些表面今天多數行為相同，但心智圖偏向結構編輯、看板偏向執行管理，未來必須允許不同操作語法。如果繼續在元件或 `GlobalContextMenu` 內堆疊 `currentView` 判斷，每次需求會同時複製權限、確認、Undo 與資料 mutation，難以判斷一項改動是全域預設還是單一模式差異。

Phase 1 又有強制限制：只能建立架構，不得改變任何現有互動。因此新架構必須可以逐 Surface 遷移、保留 legacy adapter，並以解析後矩陣證明重構前後相同。

## Decision

1. 採用 typed Interaction Policy Kernel：`Trigger → Profile Resolver → Semantic Action → Guard → Command`。
2. Profile 以 key-level sparse cascade 合併：`System Base → Task Default → Host Mode → Origin → Node Role → Transient Override → Runtime Guard`；未宣告值繼承，明確 disabled 才停用。
3. Host Mode／Origin 只宣告差異，不複製完整 Base／Task Default；需求未明示全域時採最小影響原則建立指定 mode／origin override。
4. 右鍵選單、快捷鍵、工具列與 mobile compact rail 共用 Action Catalog、permission、danger metadata 與 Command；各呈現層只選擇 action 集合、順序與 UI。
5. task context target 顯式攜帶事件當下的 `interactionLocation = { hostMode, origin }`；menu render／execute 不再由全域 `currentView` 猜測語境。巢狀 Workbench／Shared Sidebar 先繼承 host mode，再疊 origin 差異。
6. Resolver 必須 pure、deterministic、可輸出 source layer 與 affected-location diff；unknown location／trigger fail closed。
7. Phase 1 採逐 location compatibility migration：`legacy-only → shadow-resolve → kernel-authoritative → legacy-removed`；shadow 只比較不執行，已遷移與 legacy path 不得雙重 dispatch。
8. Profile、interaction location、migration state 與 resolved matrix 只屬前端架構，不持久化到資料庫或 localStorage。
9. 合併運算子依契約固定：trigger replace、menu stable-ID patch、metadata catalog-only、permission deny-wins、Command non-mergeable；禁止任意 deep merge。
10. exclusive transient owner 同時超過一個時 fail closed，不以隱藏 priority 猜測；同一 `interactionId` 的 mutation 在 event lifecycle 內最多執行一次。
11. Host mode 由 `src/App.tsx` 的單一 `TaskInteractionScope` 提供；Surface 只宣告 stable `surfaceId`、origin 與 node role。巢狀 Shared Sidebar 依 scope 自動區分 Gantt／Calendar，不由 parent 重複傳完整 click policy。
12. 新 Kernel 以 pure modules（types／profiles／resolver／catalog／guard）與 effect modules（React binding／Command executor／menu renderer）分層；pure modules 不得依賴 React、Zustand、DOM、Date、random 或 I/O。
13. `GlobalContextMenu` 的 task branch 使用 open-time location／target snapshot；Workspace／Board menu 不納入本次重寫。Calendar 的現行 primary action是切到 List，而非開詳情，必須以 Host Profile 保留。
14. 分片 migration manifest 只存在於 source／test，S11 全綠後刪除；不發佈成終端使用者設定。mutation dedupe 使用 bounded in-memory ledger，不建立 backend idempotency 或 persisted state。

## Consequences

- 優點：未來看板或心智圖改操作時只新增局部 override；Base 變更可列出所有受影響模式；權限、確認與 mutation 不再多份漂移。
- 優點：同一 Action 可由右鍵、快捷鍵、工具列或手勢觸發，但仍走同一 Guard／Command；QA 可比較解析矩陣而非只搜尋 scattered handler。
- 成本：Phase 1 需要先錄製 golden master，並暫時維護 legacy adapter 與新 resolver 的分片邊界。
- 成本：`ContextMenuState` 與所有 task menu origin 需補 host mode／origin snapshot；Calendar、Task Workbench、Shared Sidebar 也必須納入相容性盤點。
- 成本：Phase 1 需新增 stable surface／binding registry、`dev-070-v1` fixture 與逐片 evidence；RD 不可一次全面替換 handler。
- 約束：不得把所有差異塞進一個巨大 `switch(currentView)`；不得讓 Profile 直接 mutation；不得把不確定的 surface 默認成 board 或 list。
- 約束：Profile 不得硬寫 enabled 繞過 Guard、覆寫同一 Action 的 label／danger metadata，或以整份 menu array replacement 複製共用項目。
- 約束：Phase 1 不因架構更合理而順便調整 click、menu 或 keyboard；產品行為差異必須另行 Human Re-entry。

## Rejected Alternatives

- 各 View 自行維護完整 handler：初期直接，但權限、menu 與 mutation 會重複，跨模式行為容易漂移。
- 在 `GlobalContextMenu` 或共用 helper 建立巨大 `currentView` switch：集中檔案但沒有分離政策、Guard 與 Command，也無法可靠輸出影響範圍。
- 只做共用 React hook，不建立 Semantic Action／Command：可減少 event wiring，仍會讓快捷鍵、menu 與 toolbar 各自執行不同 mutation。
- 導入通用 event bus／plugin rule engine：擴充性高，但 Phase 1 無終端使用者配置需求，增加 runtime ordering、debug 與資料安全複雜度。
- 一次性全面改寫所有 Surface：無法逐片確認零差異，也讓 rollback 與根因定位成本過高。
