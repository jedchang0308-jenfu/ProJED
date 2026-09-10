# ADR-049：會議 Session 與同看板視圖投影解耦

- 狀態：`Accepted / RD Tech Lead Review PASS / Architecture Confirmed / DEV-117 Implemented / Targeted QC PASS / NOT RELEASED`
- 日期：2026-09-10
- 關聯：DEV-117、SPEC-117、QA-DEV-117、DEV-005、DEV-028、DEV-069、DEV-105、DEV-106、DEV-109；
  DEV-116 目標模式 compatibility amendment
- 決策來源：`USER-20260910-CROSS-MODE-MEETING-CONTINUITY`、
  `USER-20260910-DEV116-RD-CONTRACT-UPGRADE`、
  `USER-20260910-DEV116-ARCHITECTURE-CONFIRMATION`

DEV-117 的 store-private baseline 已實作並完成 Targeted QC；以下 DEV-116 compatibility amendment 仍是
未實作的 future candidate，不回寫 DEV-117 的完成證據。

2026-09-10 DEV-116 amendment：`goal` current phase 不加入 `MEETING_CONTINUITY_VIEWS`。非 meeting 可使用
goal；從 goal 開始 meeting fallback 至 Board；live meeting selectable options 不含 goal；recovery 遇
persisted goal 先正規化為 Board。DEV-116 尚未實作；R2 review確認consumer數量不等於獨立責任，故仍由
record store擁有allowlist，只把pure predicate匯出給MainLayout。此amendment不改變原五模式continuity、
session authority、snapshot或capture決策。

## Context

目前 `useRecordStore` 已獨立保存 live meeting 的 draft、workflow、recovery 與 capture runtime，
`RecordSidebar` 也掛在五個任務視圖之外；但 `startMeetingRecord()` 仍強制切到 `board`，
`MainLayout` 又把 `isMeetingMode` 視為禁止切換視圖的選取狀態。產品行為因此把「會議 session」
錯誤綁定為「看板 projection」。

使用者要求會議紀錄可在看板、清單、心智圖、甘特與日曆五種模式使用，並在會議中切換模式而不
中斷會議。會議仍有明確的 active workspace／board scope；本決策不擴張為跨看板會議。

## Options

### A. 維持會議期間固定看板

- 優點：不需修改既有導航限制。
- 缺點：使用者為了閱讀階層、關聯、排程或日期而被迫結束會議，與同資料多投影的產品模型衝突。
- 結論：不採用。

### B. 同看板會議 session 與視圖 projection 解耦

- `useRecordStore` 繼續擁有 meeting lifecycle；`useBoardStore.currentView` 只表示中央 projection。
- 五個任務視圖間的切換不是 meeting lifecycle transition，不關閉、保存、重建或切段。
- active board／workspace 仍是 meeting scope；跨 board／workspace 與 system page navigation 不由本決策放行。
- 結論：採用。

### C. 會議可跨看板、跨工作區移動

- 優點：自由度最高。
- 缺點：會改變 capture segment、recovery scope、record ownership、權限與 task link 邊界，已超過本需求。
- 結論：不採用；只有使用者另行提出後才重新規劃。

## Decision

採用 B。架構不新增第二套 meeting context，也不把 meeting state 複製到各 view component。

```text
active workspace + active board ───────┐
                                       │
useRecordStore                         │
  draft / workflow / recovery          ├─ 同一個 live meeting session
  live capture segment                 │
                                       │
useBoardStore.currentView ─────────────┘
  board / list / mindmap / gantt / calendar
  只替換中央 projection，不改 meeting lifecycle
```

Continuity view classification 由 `src/store/useRecordStore.ts` 內的唯一 private pure predicate 擁有：

```ts
const MEETING_CONTINUITY_VIEWS = new Set<ViewMode>([
  'board', 'list', 'mindmap', 'gantt', 'calendar',
]);

isMeetingContinuityView(view: ViewMode): boolean;
```

DEV-117 baseline採store-private predicate，不新增helper module；`useRecordStore`仍是meeting lifecycle唯一authority，
`MainLayout`仍只管理visible option與current view。

DEV-116 Architecture Closure Review R2完成re-entry：goal導入會新增recovery normalization與live option consumer，
但分類規則仍直接服務meeting lifecycle，沒有獨立state、side effect或release cadence，不足以形成新module。
target改為private readonly set留在`useRecordStore.ts`，只export `isMeetingContinuityView()`給MainLayout；store內的
start／recovery也使用同一predicate。layout與各view不得另寫allowlist。這不推翻DEV-117 frozen candidate當時的
合理性與Targeted QC PASS。

## Chosen Rules

1. 從五個 continuity views 任一處開始會議時保留目前 `currentView`；若既有 meeting entry 可從其他 view
   觸發，沿用 fallback 到 `board`，但這不代表其他 view 納入 continuity scope。
2. live meeting 中切換五個 continuity views，只執行既有 `setView(nextView)`；不得呼叫 draft guard、
   `exitMeetingMode`、`closePanel`、`forceFlushMeetingDraft` 或 `startMeetingRecord`。
3. 切換前後保留 draft ID、meeting workflow、panel open/collapsed state、capture segment ID、人工內容與 recovery snapshot identity。
4. 非同步 local debounce 或 persistence acknowledgment 可自然前進；切換本身不得 clear recovery、建立新 segment 或製造重複 capture。
5. dependency selection 與 record task-selection 是 transient operation，仍可暫時禁止 mode switch；live meeting 本身不再是禁止條件。
6. `enterTaskSelectionMode()` 可維持暫時切到看板、完成後返回原 view 的既有行為；它不是 meeting session 中斷。
7. DEV-105「預約時間」與 reservation mark 維持 Board-only；其他 view 不新增入口、mark 或 presenter。
8. DEV-108 任務明細會議補記與 DEV-109 persistence-confirmed live capture 沿用共用資料路徑，依各 view 既有操作能力運作。
9. mobile/coarse pointer 與 `<=640px` 的 meeting unavailable 邊界不變。

## Consequences

- 好處：解除 UI 導航與 meeting lifecycle 的錯誤耦合，不增加 schema、API、provider、權限或資料副本。
- 代價：五個 view 都成為會議中的回歸表面；QA 必須逐模式驗證 continuity、Task Details／人工補記與
  UI 幾何，DEV-109 capture 則依差異化 persistence owner 做代表性風險覆蓋。
- 相容性：`currentView` 的 localStorage 行為不變；既有 meeting draft、recovery snapshot 與 record metadata 不需 migration。
- 已知限制：Board-only reservation 與 Board-routed task mention selection 是刻意保留的產品邊界，
  不可被誤報為五模式功能完全等價，也不因此建立平行 meeting presenter。
- DEV-116 compatibility：目標模式已是 RD Implementation Ready／架構已定案，current phase 明確不納入 continuity allowlist；
  Board fallback、live option exclusion 與 recovery normalization 依store-owned predicate執行。future 若要支援 live meeting，
  必須再次 amendment ADR-049／SPEC-117 與 mode matrix。

## Superseded / Amended Contracts

- SPEC-005「meeting 主畫面固定 board」改為歷史基線；board 可是常用視角，但不再是 runtime lock。
- SPEC-106 中把 continuity view switch 視為「一般離開」並 force-flush 的敘述，由 SPEC-117 取代；
  明確 meeting exit、record replacement、board／workspace 與 system-page navigation 的既有安全契約不變。
- SPEC-109 中「切換 view 會 close capture segment」由 SPEC-117 取代；同 board continuity view switch 維持同一 segment。
- SPEC-105 的 Board-only surface 是相容例外，不被取代。

## Architecture Closure Review

- Source revision：branch `持續優化3`，HEAD `fea16712f2ff4093984f06336da2e045a8d9f696`。
- Repo evidence：`MainLayout` 全域掛載 `RecordSidebar`；`App` 只替換中央 view；`useBoardStore.setView`
  無 meeting side effect；`useRecordStore.startMeetingRecord` 是強制 board 的唯一 meeting start owner；
  live capture 由 `useWbsStore` persistence-confirmed path 提交。
- Dirty boundary：規劃時工作樹已有 DEV-042 等未提交變更，且與 `MainLayout.tsx`、`ModeSwitcher.tsx`、
  `dev_task.md`、`documentation_map.md` 重疊。DEV-117 RD 必須保留這些 user-owned changes，禁止整檔回復或覆寫。
- Data／API／permission／migration：全部不變。
- Tech Lead Review：最短控制流固定為 `ModeSwitcher -> setView`；五view分類只存在於
  `useRecordStore.ts` private readonly set與exported pure predicate，未新增context、event、schema、helper module或第二套presenter。
- System-page、board／workspace navigation 只標示為 DEV-106 既有 guarded transition；本 ADR 不推定
  它們一定 close meeting，也不把它們納入 continuity acceptance。
- P0／P1 unresolved architecture blockers：0（已修正 policy ownership 與 navigation 語意）。
- 結論：DEV-117為`Implemented / Targeted QC PASS / NOT RELEASED`；DEV-116 store-owned-policy amendment為
  `RD Implementation Ready / NOT IMPLEMENTED`，實作仍須依SPEC-116／117 stop conditions執行。

## Change Log

- 2026-09-10：建立 ADR，確立同看板 meeting session 與五種 view projection 解耦。
- 2026-09-10：RD Tech Lead 收斂為 store-local policy，移除無必要 helper module，並修正 system-page
  transition 的證據邊界。
- 2026-09-10：RD implementation 依定案採 store-private continuity predicate；goal 保持 meeting-negative，
  session／snapshot／capture authority 不變。
- 2026-09-10：DEV-116 RD Tech Lead R2確認不以consumer數量建立module；target只把store-owned predicate匯出給
  MainLayout，allowlist仍private，DEV-117歷史產品與QC證據不變。
