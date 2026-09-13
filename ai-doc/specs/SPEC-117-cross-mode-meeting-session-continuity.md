# SPEC-117：會議紀錄六模式不中斷與 Session 連續性

- 狀態：`Target Authority / RD Tech Lead Review PASS / Architecture Confirmed / Implemented / Targeted QC PASS / NOT RELEASED`
- 日期：2026-09-10
- 對應 DEV：DEV-117
- 架構決策：`ai-doc/decisions/ADR-049-meeting-session-view-independence.md`
- QA authority：`ai-doc/qa/QA-DEV-117-cross-mode-meeting-session-continuity.md`
- 決策來源：`USER-20260910-CROSS-MODE-MEETING-CONTINUITY`、
  `USER-20260910-DEV116-RD-CONTRACT-UPGRADE`、
  `USER-20260910-DEV116-ARCHITECTURE-CONFIRMATION`、
  `USER-20260910-GOAL-MODE-MEETING-CONTINUITY`
- 風險：Medium（可見導航、live meeting 狀態與跨模式資料路徑）
- 文件成熟度：`RD Implementation Ready`
- 架構定案：`已定案`

DEV-117 原五模式功能與 Targeted QC PASS 是已完成歷史事實；2026-09-10 最新使用者決策將 DEV-116 goal
納入同一份 store-owned policy。這是有意取代先前 goal-negative amendment 的 current contract，不回寫原歷史證據。

## 1. 真正需求與成功結果

使用者在會議中會依問題切換任務階層、看板狀態、關聯、排程與日期。現在開始會議會強制進入看板，
會議進行中又禁止切換視圖，使「不同視角閱讀同一看板資料」被誤當成「離開會議」。

成功結果：桌機／筆電使用者可從看板、清單、心智圖、甘特、日曆或 OKR 模式開始同一場會議，會議中任意切換
這六種 view，右側會議紀錄、草稿、workflow、local recovery 與 live capture segment 均不中斷。

使用思考習慣：#目的、#系統描繪、#限制條件

## 2. Human Decision Brief 與 Spec Impact

- Human confirmed：會議紀錄應可在既有五種模式與 OKR 模式使用；會議中切換模式不得中斷會議。
- Current phase interpretation：只涵蓋同一 active workspace／board 的六個 task projections。
- `Intentional replacement`：取代 SPEC-005 的 fixed-board runtime lock、SPEC-106 的 continuity-view-exit 語意，
  以及 SPEC-109 的 continuity-view-close-segment 語意。
- `Compatible exception`：SPEC-105 reservation 仍限 Board；record task-selection 可暫時導向 Board 後返回原 view。
- Rejected：跨 board／workspace meeting、手機 meeting、在六模式各複製一套 meeting store／sidebar／capture。
- `Intentional replacement`：2026-09-10 最新使用者決策明確取代 DEV-116 先前 goal-negative amendment；`goal`
  加入既有 allowlist。從 goal 開始 meeting、live switch 與 recovery 都保留 goal，仍只由 record store 私有 set
  與 exported pure predicate 管理，不新增第二份 meeting context。

## 3. Scope

### 3.1 In Scope

- 六個 continuity views：`board`、`list`、`mindmap`、`gantt`、`calendar`、`goal`。
- 從任一 continuity view 啟動 live meeting 時保留原 view。
- live meeting 中以既有 ModeSwitcher 切換六個 views，不退出、不保存、不重建、不切段。
- 共用 `RecordSidebar`、draft content、workflow stage、AI synthesis state、recovery state 與 capture runtime 持續存在。
- 各 view 的既有 Task Details、task mutation 與 meeting quick-note 路徑做相容驗證。
- 更新因舊 fixed-board 契約而失效的 DEV-010／020 static assertions。

### 3.2 Out of Scope

- `home`、`records`、`settings`、`calendar_subscriptions`、`recycle_bin` 的會議連續性。
- 切換 active board／workspace；其離開與草稿安全仍由 DEV-106 管理。
- mobile/coarse pointer／`<=640px` meeting UI。
- 將 reservation、Board inline marks、context-menu reservation editor 擴至 List／Mindmap／Gantt／Calendar／Task Details。
- 重寫 ModeSwitcher、RecordSidebar、meeting workflow、editor、draft recovery、AI synthesis 或 live capture aggregate。
- schema、migration、RLS／record access、API、provider adapter、record metadata 格式或新 event table。

## 4. 架構與狀態不變條件

### 4.1 Authority

| 責任 | Authority | DEV-117 契約 |
|---|---|---|
| 目前 projection | `useBoardStore.currentView` | 只表示中央 view；不擁有 meeting lifecycle |
| meeting lifecycle | `useRecordStore.isMeetingMode`、`draft` | view switch 不修改 |
| meeting UI | `MainLayout` 外層的 `RecordSidebar` | 六 view 切換時保持 mounted |
| local recovery | `useMeetingDraftRecovery` | scope／snapshot schema／clear token 不變 |
| live capture | `meetingLiveCaptureRuntime.segment`、`useWbsStore` commit path | 同 board view switch 不 close／recreate segment |
| task selection | `useRecordStore.isTaskSelectionMode` | transient lock 可維持，完成後返回原 view |
| reservation | DEV-105 metadata＋Board presenters | Board-only，相容例外 |

### 4.2 View Transition Invariant

令 `M` 為 live meeting state、`V` 為 `currentView`。當 `V1`、`V2` 都屬 continuity views，且
active workspace／board 不變：

```text
switchView(V1 -> V2)
  => currentView = V2
  => draft.id、isMeetingMode、isPanelOpen、isPanelCollapsed 不因切換改變
  => workflow／content／task links／recovery identity 不因切換改變
  => live capture segment.id、startedAt、aggregates 不因切換重設
  => meeting exit guard、force flush、canonical save、AI synthesis request 均不被切換觸發
```

非同步保存狀態可因原本已排程的工作自然前進；QA 比對的是「沒有由 view switch 造成 clear、duplicate、
new segment 或 lifecycle transition」，不是要求所有非同步欄位凍結。

### 4.3 Minimal View Policy

DEV-117原baseline的五個continuity views，加上本次`goal`，由`src/store/useRecordStore.ts`內的readonly set與
exported pure predicate唯一管理；不新增helper或第二份allowlist。

DEV-116 target amendment：goal導入後增加recovery／live option consumer，但policy仍服務meeting lifecycle，
不足以成為獨立module。readonly set留在store private，export同一predicate供MainLayout使用；不得另寫第二份allowlist。

- 在 continuity view 呼叫 `startMeetingRecord()`：保持原 view。
- 若既有入口可從其他 view 呼叫：沿用 fallback 到 `board` 再建立 meeting；這只是既有入口相容行為，
  不將該 view 納入 continuity scope。
- DEV-116 `goal` 屬 continuity view：從 goal 開始 meeting、live switch與recovery均保留goal。
- ViewMode type、localStorage key 與 `useBoardStore.setView` 不變。

## 5. UI Entry Contract 與模式矩陣

Target actor：已登入、對目前 board 可使用既有 meeting entry 的桌機／筆電使用者。

正常起點：目前 active board 已載入，使用者位於六個 continuity views 任一處；topbar 顯示既有
`新增會議記錄` 或 `紀錄中`，右側使用既有 `RecordSidebar`。

| View | 正常入口 | 會議中 ModeSwitcher | RecordSidebar | Task Details／人工補記 | Live capture | 專屬例外 |
|---|---|---|---|---|---|---|
| Board | 目前 topbar meeting entry | 可切六模式 | 持續 | 沿用 | 沿用 | reservation 可見／可編輯 |
| List | 同一入口；不跳 Board | 可切六模式 | 持續 | 沿用 | 既有 persistence-confirmed mutation | 無 reservation |
| Mindmap | 同一入口；不跳 Board | 可切六模式 | 持續 | 沿用 | 既有 persistence-confirmed mutation | 無 reservation |
| Gantt | 同一入口；不跳 Board | 可切六模式 | 持續 | 沿用 | 既有 persistence-confirmed mutation | 無 reservation |
| Calendar | 同一入口；不跳 Board | 可切六模式 | 持續 | 沿用 | 既有 persistence-confirmed mutation | 無 reservation |
| OKR (`goal`) | 同一入口；不跳 Board | 可切六模式 | 持續 | 沿用 | 既有 persistence-confirmed mutation | 無 reservation |

UI rules：

- live meeting 本身不再 disable ModeSwitcher；dependency selection 或 record task-selection 仍可 disable。
- live meeting 的 selectable options 只含六個 continuity views並包含goal；goal不採disabled／no-op／helper文案變體。
- disabled 文案只描述真正的 transient selection，不再顯示「紀錄中先離開紀錄再切換檢視」。
- `紀錄中` 保持唯一 meeting 狀態訊號；不得新增跨模式 badge、toast、helper、教學卡或第二個狀態列。
- 切換時不自動展開已收合的 RecordSidebar，也不搶回 editor focus；使用者游標／內容由既有 editor state 保留。
- ModeSwitcher menu 的 role、aria-checked、focus 與 Escape 契約不變。

## 6. Data、API、Permission、Lifecycle

- Data model：無變更；不新增 meeting session row、record field、metadata namespace 或 view-specific draft。
- API／provider：無變更；view switch 產生 0 record write、0 task-link write、0 AI request。
- Permission：沿用目前 board、record、task mutation 與 reservation guards；DEV-117 不提升任何角色能力。
- Transaction／idempotency：mode switch 不是 mutation；DEV-109 mutation ID、segment aggregate 與 exactly-once 契約不變。
- Recovery：snapshot schema、scope key、TTL、IndexedDB／session fallback 與 explicit restore 不變。
- PWA safety：record-draft owner 已覆蓋 app surfaces；view epoch 可更新，但不得遺失 record dirty reason。
- Lifecycle：continuity view switch 不走 DEV-106 safe-leave；明確 meeting exit、record replacement、
  board／workspace 與 system-page navigation 維持 DEV-106 既有 guarded transition。DEV-117 不重新定義
  這些 transition 是否 close meeting。

## 7. Repo／Module／File Impact

### 7.1 新增

| File | Responsibility |
|---|---|
| `scripts/verify-dev-117-cross-mode-meeting-continuity.ts` | source contract、policy、protected boundaries 與舊 verifier convergence |
| `scripts/verify-dev-117-cross-mode-meeting-continuity-browser.pw.js` | 真實入口、六模式 sequence、state probe、capture／quick-note／viewport evidence |

### 7.2 修改

| File | Required change | Forbidden expansion |
|---|---|---|
| `src/store/useRecordStore.ts` | private predicate；`startMeetingRecord`只在非continuity fallback Board | 不改draft/snapshot schema、capture、selection lifecycle |
| `src/components/MainLayout.tsx` | meeting不再是disabled reason；沿用既有六 view options與更新後 copy | 不重做topbar／ModeSwitcher／RecordSidebar layout |
| `scripts/verify-dev-010-action-feedback.mjs` | 移除舊 meeting-lock positive assertion，改驗真正的 selection lock | 不放寬離開／保存 safety |
| `scripts/verify-dev-020-record-workflow-redesign.mjs` | 同上，加入 cross-mode continuity source assertion | 不改 record workflow stage |
| `package.json` | 登錄 DEV-117 static／browser commands | 不改 build/runtime/dependencies |
| SPEC-005／106／109、DEV-117 docs | 收斂 intentional replacement 與 evidence | 不改其他歷史完成事實 |

### 7.3 Inspect-only／Protected

- `src/components/ui/ModeSwitcher.tsx`：既有 generic disabled／menu contract 足夠，預期不修改。
- `src/App.tsx`：六 view projection與global sidebar mount不改；DEV-116已提供goal case與record loaded truth。
- `src/store/useBoardStore.ts`：`setView` 與 ViewMode persistence 不改。
- `src/hooks/useMeetingDraftRecovery.ts`、`useMeetingModeExitGuard.ts`、`useRecordDraftGuard.ts`：DEV-117 frozen
  candidate不改recovery／exit safety semantics。
- DEV-105 reservation presenters／metadata、provider adapters、schema／migration、AI synthesis 與 editor serializer：禁止修改。

### 7.4 DEV-116 Target Amendment（INTENTIONAL REPLACEMENT / IMPLEMENTED CANDIDATE）

- `src/store/useRecordStore.ts`保留private readonly set並export `isMeetingContinuityView()`；把goal加入set，start／restore
  因此保留goal；draft／snapshot schema／capture aggregate不變。
- `src/components/MainLayout.tsx`繼續只import store-owned predicate產生live options；ModeSwitcher generic contract不變。
- DEV-116／117 verifier加入goal positive與六模式正常入口；歷史artifact不重寫，新candidate另產生evidence。

## 8. RD Implementation Contract 與順序

1. **WP-117-A — Failing contract**：先建立 source verifier，證明 current code 的 forced Board 與 meeting-lock 會失敗。
2. **WP-117-B — Store-local policy**：建立唯一private pure predicate；六views原地開始，其他可到達views
   fallback Board；不改 recovery snapshot／restore contract。
3. **WP-117-C — Navigation behavior**：`MainLayout`只以dependency／task-selection禁止switch；沿用既有
   六模式 options，六模式 change 直接 `setView`。
4. **WP-117-D — Regression convergence**：更新 DEV-010／020 assertions；確認 DEV-105、106、108、109、028、097 protected gates。
5. **WP-117-E — Candidate gate**：執行 DEV-117 static、TypeScript、targeted ESLint、build 與 protected-diff check 後 freeze candidate。
6. **WP-117-F — Targeted QC**：只對 frozen candidate 執行六模式 UI、state probe、代表性 capture、visible-error 與 viewport evidence。

實作模型可自行決定：test fixture名稱、局部變數名與不改契約的internal type alias；DEV-116不得另行抽出policy module。

實作模型不得決定：增加第七個 continuity view、放行 board/workspace、修改 mobile availability、擴張 reservation、
重建capture segment、改schema/API/permission/recovery或覆寫user-owned dirty changes。

## 9. Failure Recovery 與 Compatibility

- view lazy load／render 失敗時不得清除 meeting state；可見錯誤依既有 app error boundary 處理，本 DEV 不新增替代頁。
- 任一 view mutation 未經 persistence-confirmed，不得因會議存在而提前 capture。
- 快速往返或重複選同 view 不得 duplicate record content、task link、activity、aggregate 或 local snapshot。
- task selection／dependency selection 依既有 transient owner 契約禁止切換；一般 context menu 行為不由
  DEV-117 重定義，但切換後不得殘留遮擋目前 view 的 stale overlay。
- 既有 draft、published record、recovery snapshot、localStorage view preference 無 migration；只在restore前正規化
  persisted non-continuity view，不改snapshot payload。
- RD 開始前重新檢查 `MainLayout.tsx`、`ModeSwitcher.tsx` 與文件的 dirty diff；重疊無法安全合併時停止。

## 10. Acceptance Criteria

- AC-117-01：從 Board／List／Mindmap／Gantt／Calendar／Goal 各自點既有 meeting entry，meeting 在原 view 開始。
- AC-117-02：live meeting 依序 `board → list → mindmap → gantt → calendar → goal → board`，全程可操作且沒有 exit／save dialog。
- AC-117-03：序列前後 draft ID、meeting mode、panel state、workflow、content 與 capture segment ID 保持同一 session。
- AC-117-04：切換產生 0 meeting close、0 new segment、0 recovery clear、0 record／task-link write、0 AI request。
- AC-117-05：RecordSidebar open／collapsed state 均保持；不出現第二個 meeting panel、狀態列、toast 或 helper。
- AC-117-06：六 views 都可由既有入口開 Task Details；active meeting 的 DEV-108 人工補記直接加入同一
  draft 且 exactly once，切換後仍可見；此路徑不偽裝成 DEV-109 task mutation capture。
- AC-117-07：Board 狀態、Gantt 日期與從非 Board view 開啟 Task Details 後保存任務備註三種不同
  persistence owner 的代表性 task mutation，只在確認保存後進同一 DEV-109 segment 且 exactly once；
  不要求各 view 新增原本不存在的 edit action。
- AC-117-08：record task-selection／dependency selection 仍能禁止 switch；退出 transient flow 後 ModeSwitcher 恢復可用，meeting 未中斷。
- AC-117-09：DEV-105 reservation 只在 Board surfaces 出現；其他四 view 與 Task Details 均為 0 entrance／0 mark。
- AC-117-10：明確 meeting exit、record replacement、board／workspace／system navigation、save／discard、
  F5 recovery 與 PWA reload safety 沿用既有契約；本 DEV 不新增其 terminal-state 判斷。
- AC-117-11：1440×900、1024×768、200% zoom 無 sidebar／view／topbar 遮擋、雙重捲動、水平 overflow 或文字截斷；390×844 仍為 meeting-negative。
- AC-117-12：鍵盤可開啟 ModeSwitcher、切換、Escape 關閉並維持可見 focus；meeting 狀態不只靠顏色。

## 11. QA／QC Evidence Plan

- Static／pure：驗store-local continuity policy、start fallback、disabled predicate與protected boundaries；
  DEV-116 exported predicate／goal positive由QA-DEV-116與DEV-117在新candidate重驗。
- Browser：正常 topbar entry，不用 direct store call 代替；local-test owner fixture 只建立 board／tasks 前置資料。
- State probe：browser verifier 只讀 DOM-visible draft marker、workflow marker、view、meeting／panel state；segment
  identity 與 persistence-confirmed capture 沿用 DEV-109 static／browser evidence，不新增 production debug hook 或預造成功結果。
- Visual：1440×900、1024×768、200% zoom；每個 view 至少保留 sequence 或代表性 screenshot，並做 visible-error／console／HTTP sweep。
- Regression：DEV-010、020、028、069、097、105、106、108、109 targeted commands，以及 TypeScript、targeted ESLint、`build:test`。
- QC：依凍結 candidate 執行，不修改產品；第一個 failure 回送 RD，修正後重驗受影響範圍。

## 12. Stop Conditions

命中任一項立即停止並回送規劃模型／PM：

1. 必須修改 schema、migration、provider adapter、permission、record metadata 或 recovery snapshot。
2. 必須讓 meeting 跨 board／workspace，或變更 DEV-106 的真正 exit／discard semantics。
3. 必須把 reservation 或 Board presenter 擴到其他 view 才能完成 core continuity。
4. 同 board view switch 無法在不 close／recreate DEV-109 segment 的情況下運作。
5. 既有 view 使用非 canonical task mutation，導致 capture 需要建立第二套 UI-specific capture path。
6. 需要修改 `ModeSwitcher` generic contract、RecordSidebar layout、editor serializer、AI contract 或 mobile availability。
7. 文件與程式出現未記錄衝突，或 user-owned dirty changes 無法安全保留。
8. 任一必要 browser path 出現 visible error、資料歸零、duplicate capture、draft identity 改變或 meeting 無聲結束。

## 13. Future Phase Capsule

`Future Phase Captured / Not Requested`：完整六模式專屬操作等價。

- 目的：評估 reservation mark/editor、task mention selection、mode-native meeting actions 是否需在每個 presenter 原生呈現。
- 邊界：須逐項證明使用價值，不得因 core continuity 已完成而自動擴張。
- 依賴：DEV-117 production usage evidence、各 view presenter capability 與 DEV-105 identity／permission contract。
- 驗收方向：功能在有意義的 view 可發現且不重複，不增加第二套資料或 action semantics。
- Re-entry trigger：使用者明確要求某項 Board-only meeting action 在其他 view 原生可用，或 usage evidence 顯示 Board hop 是主要阻塞。

2026-09-10 最新使用者決策已把 `goal` 加入 `MEETING_CONTINUITY_VIEWS`；從 goal 開始meeting、live switch與
recovery都保留goal。future phase只保留mode-native reservation等價性，不再把goal continuity列為未請求功能。

mobile meeting 與 cross-board meeting 不建立 future DEV；只有使用者另行提出才重新規劃。

## 14. Architecture Closure Review

- Source revision：branch `持續優化3`，HEAD `fea16712f2ff4093984f06336da2e045a8d9f696`，另含既有未提交 DEV-042 等變更。
- Cross-module flow、authority、state invariants、data/API/permission、idempotency、failure recovery、file surface、順序、acceptance、evidence 與 stop conditions 已鎖定。
- DEV-116 compatibility amendment 已完成；產品仍由 DEV-117 的 store-private baseline 擁有 session policy，DEV-116
  只使用匯出的 pure predicate；session、snapshot、capture authority均不變。
- ADR-049 Accepted；P0／P1 readiness gap = 0。
- 結論：DEV-117為`Implemented / Targeted QC PASS / NOT RELEASED`；DEV-116 amendment為
  `Implemented / Targeted QA-QC PASS / NOT RELEASED`。兩者均未由本文件宣告 production release。

## 15. Change Log

- 2026-09-10：建立 DEV-117 current-phase contract，完成 Architecture Closure Review。
- 2026-09-10：RD Tech Lead 修正 AC 編號、system navigation 證據邊界與過量 helper 抽象；QA 改採
  五模式入口全覆蓋加代表性 mutation-owner 風險覆蓋。
- 2026-09-10：DEV-116 Architecture Closure Review當時新增goal start／recovery／live-option negative；此歷史邊界已被後述latest amendment取代。
- 2026-09-10：DEV-116 RD Tech Lead R2撤銷以consumer數量抽module的規劃；改為store保留private set並export
  pure predicate，維持最少file surface與單一ownership。
- 2026-09-10：DEV-116 WP-116-A～F完成，當時goal-negative compatibility由QA-DEV-116驗證；此歷史結果不作為latest contract。
- 2026-09-10：依 `USER-20260910-GOAL-MODE-MEETING-CONTINUITY` 有意取代goal-negative amendment；goal納入
  同一store-owned continuity set，六模式共用meeting session／snapshot／capture authority。
