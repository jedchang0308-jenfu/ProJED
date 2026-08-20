# SPEC-081：手機看板 A／B 2～3 倍閱讀尺寸與雙指切換

狀態：`Implemented / Automated UI PASS / Physical Mobile Pending / 未 Release`

## 文件定位

- 關聯 DEV：`DEV-081`
- 文件成熟度：`Implemented / Automated UI PASS`
- 風險等級：`Medium`（手機核心看板 UI 與多手勢仲裁；不改資料、API 或權限）
- Spec Impact：`Compatible extension`。延伸 `SPEC-029` 的 mobile Pan-First 與 `SPEC-054` 的 mobile task drag precision；不取代既有單指平移、點擊、長按、拖曳或控制項 owner。
- ADR：不新增。此案為可逆的看板 UI 模式與手勢延伸；若未來要全 App 共用、改成 browser viewport zoom 或建立跨模式縮放引擎，再重評 ADR。

## 問題與使用者價值

目前手機看板的緊湊模式適合總覽，但部分文字與控制項對使用者過小。產品需要保留現行 A 模式，同時提供明顯更大的 B 模式，讓使用者在同一張看板透過雙指放大切到 B、雙指縮小切回 A。

B 不是把 12～14px 微調成 14～16px；其主要可讀內容與操作幾何相對 A 必須達到 `2.0～3.0 倍`，設計／實作預設基準為 `2.5 倍`。所有線性尺寸若採 2.5 倍，畫面面積需求約為 A 的 6.25 倍，因此 B 只看到局部內容是預期結果；產品必須以可靠的看板內平移、錨點保持與清楚的模式狀態補足，而不是假裝仍能維持 A 的資訊量。

## Human Decision Brief

- `HD-081-01`：保留現況為 A（緊湊，倍率 `1.0`）。
- `HD-081-02`：新增 B（放大閱讀），可接受倍率 `2.0～3.0`；RD 預設採 `2.5`，不得以小幅字級增加冒充完成。
- `HD-081-03`：手機看板任一「看板工作區」可雙指向外切至 B、雙指向內切回 A。
- `HD-081-04`：雙指手勢不可成為唯一入口；既有看板工具列需提供可見、可鍵盤／輔助技術操作的 A／B 切換控制。
- `HD-081-05`：B 是看板局部 UI 模式，不是 browser viewport zoom；不可停用看板外的瀏覽器／OS 放大能力。

## 範圍

### In scope

- 手機／touch 看板的 A、B 兩個離散顯示模式。
- 看板工作區的雙指 pinch-out／pinch-in 模式切換。
- 欄標題、L2 任務卡、L3+ 子層列、標題、日期、標籤、圖示、卡片內距、列距、欄寬及可點擊目標的協調放大。
- 看板工作區內的單一多手勢仲裁器、取消／復原狀態與錨點保持。
- 可見的 A／B 備援切換控制、可存取狀態與同帳號同裝置顯示偏好。
- A／B 兩模式下既有 pan、tap、long-press、drag、控制項、modal 與 action rail 回歸。

### Out of scope

- 清單、甘特圖、行事曆、心智圖及桌機版的顯示倍率變更。
- App topbar、全域導覽、modal／drawer、toast、compact action rail 或 browser viewport 整體放大。
- browser 原生 pinch zoom、OS 輔助放大或 WCAG zoom 的替代品。
- 任務資料、欄位、排序規則、schema、API、permission model 或 production release。
- 連續無段縮放、任意倍率滑桿、縮放動畫引擎。

## 名詞與 UI 狀態契約

| 狀態 | 使用者語意 | 倍率契約 | 穩定可觀測狀態 |
|---|---|---:|---|
| A / Compact | 現行緊湊總覽 | `1.0` | 看板 root：`data-kanban-view-size="compact"` |
| B / Large | 放大閱讀與操作 | `2.0～3.0`，預設 `2.5` | 看板 root：`data-kanban-view-size="large"` |

- 可見控制需具穩定 selector，例如 `data-kanban-size-toggle`，並提供可理解名稱（例如「放大看板」／「切回緊湊看板」）、焦點樣式與 `aria-pressed` 或等價狀態。
- 切換後可顯示短暫、非阻塞狀態訊息；訊息不得搶焦點或遮住主要操作。
- 顯示偏好只存於同帳號同裝置的 UI preference，不寫入 board／task domain data，不新增遠端 schema；切換看板後沿用該裝置最後選擇。

## 視覺與幾何契約

### B 必須真的達到 2～3 倍

以下代表性量測的 `B/A` 線性比例皆須落在 `2.0～3.0`：

1. 欄標題字級。
2. L2 任務標題字級。
3. L3+ 子層標題字級。
4. 日期與標籤字級。
5. 欄寬。
6. 代表性任務卡水平／垂直內距與主要點擊目標。

邊框厚度、陰影、圓角及不承載資訊的裝飾可不等比例；但不得只放大字、不放大容器／間距，造成重疊、裁切或觸控目標仍過小。A 的既有幾何與密度須維持相容基準。

### 幾何實作邊界

- 優先以離散 layout token／CSS variable／class 讓 DOM 重新排版，使捲動、hit-test、drag overlay 與實際可見幾何同源。
- 不得用 CSS `zoom` 實作 B。
- 不接受只對看板套用 `transform: scale(...)` 後，另外補償拖曳、捲動與 overlay 座標的雙重幾何；除非 RD 能以單一 canonical geometry 與 QA case 證明 hit-test／scroll／drag／overlay 完全一致，否則視為停止條件。
- B 可只顯示一欄的一部分；水平 overflow 只能由看板既有 scroll owner 承擔，`html`／`body`／App shell 不得新增水平捲動。

### 切換錨點

- pinch 中點所在的欄／任務／局部座標是切換錨點。
- layout reflow 後，同一錨點應維持在 pinch 中點 `±24 CSS px`；受捲動邊界 clamp 時，至少同一欄／任務仍可見且不得出現空白死區。
- 使用工具列切換時，以目前 viewport 中心的第一個可見任務或欄作錨點。

## 手勢仲裁演算法

### 輸入

- 只接受看板工作區內的 touch／pointer stream。
- 記錄 active touches、初始兩點距離 `d0`、目前距離 `d`、pinch 中點、起始模式、起始 target owner 與是否已有 drag／modal／input／action rail 等 transient owner。

### 狀態機

`IDLE → PINCH_CANDIDATE → COMMITTED → WAIT_ALL_RELEASE → IDLE`

1. `IDLE`
   - 單指仍交由 `SPEC-029`／`SPEC-054`：移動超過既有 threshold 是 pan；低位移 quick tap 是開啟明細；靜止約 450～550ms 才可 long-press。
   - 第二指進入且尚未有 active drag／受保護 owner 時，取消尚未 commit 的 tap、pan、long-press timer，進入 `PINCH_CANDIDATE`。
2. `PINCH_CANDIDATE`
   - A → B：同時滿足 `d / d0 >= 1.15` 且 `d - d0 >= 24px`。
   - B → A：同時滿足 `d / d0 <= 0.87` 且 `d0 - d >= 24px`。
   - 低於門檻不切換；兩指同方向平移但距離大致不變不切換。
3. `COMMITTED`
   - 每次 gesture 最多 commit 一次；切換完成後立刻進入 `WAIT_ALL_RELEASE`，抖動或反向移動不得再次切換。
4. `WAIT_ALL_RELEASE`
   - 所有 touches／pointers 釋放後才能 re-arm。
   - `touchcancel`、`pointercancel`、第三指、window blur、visibility change 或 pagehide 一律清除暫態；未 commit 者保持原模式。

### Owner 與衝突處理

- 「任一處」只指看板 canvas、空白區、欄標題、L2 卡片、L3+ 列與 canvas CTA 的非受保護表面。
- input、textarea、contenteditable、select、modal、drawer、popover、compact action rail、依賴選取、錄音／附件控制及其控制項保有 owner；其內部雙指不得穿透切換下層看板。
- task drag 已 active 後才出現第二指：立即取消 drag、不得 commit drop、不得切換 A／B，等所有 touches 釋放後復原 `IDLE`。
- pinch 候選／完成期間不得啟動 details click、long-press action rail、task drag、CTA 或其他寫入動作；釋放後下一個全新單指 gesture 才能操作。
- 看板內 app pinch 會優先於該區域的 browser pinch；只限 board surface。不得以 viewport `user-scalable=no` 或全頁 `preventDefault` 禁用看板外原生縮放。

## 資料、API、權限與依賴

- Domain data：無變更；切換不可 dirty board／task、改排序、狀態、欄位或 activity log。
- Storage：僅既有 account/device-scoped UI preference；不得共用未命名 global key 造成帳號互相污染。
- API／schema：無變更。
- Permission：所有可查看看板者都可切換自己的顯示偏好；不要求 edit capability。
- 直接 authority：`SPEC-029`、`SPEC-054`、`QA-DEV-029`、`QA-DEV-054`。
- RD 需集中修改／擴充 mobile gesture broker；不可在 Board、Card、Checklist 各自建立互不知情的 pinch handler。

## Current Architecture Impact

目前看板已有一套 mobile Pan-First 與 dedicated task drag session，但尚無多指 owner：

| 現行 owner | 現況 | DEV-081 處置 |
|---|---|---|
| `src/components/BoardView.tsx` | 組裝 board canvas、mobile pan broker、mouse pan 與 task drag session | 改用單一 board canvas ref；接入 view-size context、pinch request、錨點 adapter 與穩定 mode／phase attributes。 |
| `src/hooks/useMobilePanBroker.ts` | 只接受單指；第二指會直接 reset，未取消第一指已啟動的 long-press timer | 擴充為看板 touch 仲裁唯一 owner；單指維持既有 pan，多指只在此判斷 A／B 切換。 |
| `src/hooks/useLongPress.ts` | 以 `touches[0]` 啟動 500ms timer，沒有 multi-touch guard | 加入 `touches.length === 1` 與全域 board-pinch owner guard；pinch 期間絕不觸發 callback。 |
| `src/hooks/useTouchTapGuard.ts` | 以第一個 touch 判斷 pan，沒有 multi-touch guard | 多指一律標記 suppress compatibility click，直到全釋放／既有 timeout。 |
| `src/components/Wbs/taskDrag/useTaskDragSession.ts` | 以 body `data-task-drag-touch-active` 表示 active drag，已有 `cancelWithReason` | 對 BoardView 暴露穩定 `cancelForGestureConflict()`，固定 reason=`multitouch`；不改 commit resolver。 |
| `src/index.css` | mobile A 欄寬 252px、board gap 8px、L2 14px、L3 12px、date/tag 9px | 把既有 A 值收斂為 view-size tokens，新增 B 的 2.5 倍離散 tokens；不用 `zoom`／`transform: scale`。 |
| `src/App.tsx`／`MainLayout.tsx` | 無看板顯示尺寸 provider／入口 | App 以登入帳號建立 provider；MainLayout 只在 mobile/touch board 顯示單一可存取 toggle。 |

此變更不建立新 domain store、不進 `useBoardStore` undo stack、不呼叫 board／task service；現行 DnD commit、task permissions、filter projection 與其他 view mode 不變。

## Implementation Architecture

### 新增模組與唯一責任

1. `src/features/kanbanViewSize/kanbanViewSize.ts`
   - 純型別、常數、preference normalize/read/write、pinch distance／threshold resolver。
   - 不 import React、Zustand、board store 或 task service，可由 `tsx` verifier 直接 import。
2. `src/features/kanbanViewSize/KanbanViewSizeProvider.tsx`
   - 唯一的 view-size React state owner。
   - 依 `accountId` hydrate 本機偏好；提供 `viewSize`、`requestViewSize` 與 viewport adapter registration。
   - `requestViewSize` 先 capture anchor、再更新 state／storage，最後在 layout commit 後 restore anchor。
3. `src/features/kanbanViewSize/kanbanViewSizeAnchor.ts`
   - 只負責 board DOM 的 anchor capture／restore 與 clamp 後 drift measurement。
   - 不寫 domain state；只修改 board `scrollLeft` 與命中欄的 `scrollTop`。

不得另建 Card／Checklist pinch hook、不得把顯示尺寸塞進 task／board model，也不得把本機偏好加入 `accountPreferencesService` 遠端同步。

### Typed public contract

```ts
export type KanbanViewSize = 'compact' | 'large';
export type KanbanPinchPhase = 'idle' | 'candidate' | 'committed' | 'wait-all-release';
export type KanbanViewAnchorKind = 'task' | 'column' | 'board-content';

export const KANBAN_LARGE_VIEW_ENABLED = true;
export const KANBAN_LARGE_SCALE = 2.5;
export const KANBAN_VIEW_SIZE_PREFS_KEY = 'projed-kanban-view-size:v1';
export const KANBAN_PINCH_OUT_RATIO = 1.15;
export const KANBAN_PINCH_IN_RATIO = 0.87;
export const KANBAN_PINCH_MIN_DISTANCE_DELTA_PX = 24;

export type KanbanViewSizeChangeOrigin =
  | { kind: 'pinch'; clientX: number; clientY: number; target: EventTarget | null }
  | { kind: 'toolbar' };

export interface KanbanViewAnchor {
  scopeKey: string; // active board id at capture time
  kind: KanbanViewAnchorKind;
  nodeId: string | null;
  columnId: string | null;
  normalizedX: number;
  normalizedY: number;
  clientX: number;
  clientY: number;
  boardContentX: number;
  columnContentY: number | null;
  boardScrollLeft: number;
  columnScrollTop: number;
}

export interface KanbanPinchDecisionInput {
  viewSize: KanbanViewSize;
  initialDistance: number;
  currentDistance: number;
  touchCount: number;
  alreadyCommitted: boolean;
}

export const resolveKanbanPinchTarget = (
  input: KanbanPinchDecisionInput,
): KanbanViewSize | null;
export const normalizeKanbanViewSize = (value: unknown): KanbanViewSize;
export const readKanbanViewSize = (accountId: string | null | undefined): KanbanViewSize;
export const writeKanbanViewSize = (
  accountId: string | null | undefined,
  value: KanbanViewSize,
): void;

export interface KanbanViewportAdapter {
  capture(origin: KanbanViewSizeChangeOrigin): KanbanViewAnchor | null;
  restore(anchor: KanbanViewAnchor): { driftPx: number; clamped: boolean };
}

export interface KanbanViewSizeContextValue {
  viewSize: KanbanViewSize;
  requestViewSize(next: KanbanViewSize, origin: KanbanViewSizeChangeOrigin): boolean;
  registerViewportAdapter(adapter: KanbanViewportAdapter | null): void;
}

export interface UseMobilePanBrokerOptions<TElement extends HTMLElement> {
  surfaceRef: React.RefObject<TElement | null>;
  enabled: boolean;
  viewSize: KanbanViewSize;
  requestViewSize(next: KanbanViewSize, origin: KanbanViewSizeChangeOrigin): boolean;
  cancelActiveTaskDrag(): void;
}
```

- `requestViewSize` 在 `next === viewSize` 時回傳 `false` 且不寫 storage／不執行 anchor restore；成功排入變更回傳 `true`。
- provider unmount、帳號切換或 `accountId=null` 時重設 `compact`、清除 pending adapter request；不刪除其他帳號的 preference。
- context hook 在 provider 外使用必須 throw 明確工程錯誤，避免靜默出現第二個 state owner。

## Preference 與 Migration Contract

- Base key：`projed-kanban-view-size:v1`。
- 實際 key：沿用 `getAccountScopedStorageKey`，即 `projed-kanban-view-size:v1:account:<encoded-account-id>`。
- JSON value 只允許字串 `"compact"` 或 `"large"`；缺值、解析錯誤、未知值、未登入一律 normalize 為 `compact`。
- 寫入沿用 `writeStorageJson` best-effort 行為。寫入失敗時目前 session 的 UI 仍可切換；reload 回 A 是可接受降級，不顯示阻塞 toast。
- Migration：`None`。此 key 為新值，沒有 legacy key、遠端資料或 cache migration。
- `src/services/accountPreferencesService.ts`、profiles `ui_preferences`、database types、API 與 schema 明確不修改；本 DEV 的「同帳號同裝置」不可被實作成跨裝置同步。

## Provider、入口與 DOM Contract

### Provider wiring

- `src/App.tsx`：在已通過 AuthGate 的 `AppContent` 內，以現有 `userId` 將 `<MainLayout>` 包在 `<KanbanViewSizeProvider accountId={userId}>`。
- provider 只包 authenticated app content；`AppUpdatePrompt`、install assistant 與 AuthGate 外部 UI 不讀取此 context。

### MainLayout toggle

- `src/components/MainLayout.tsx` 使用 `useKanbanViewSize()`，只在 `currentView === 'board' && isMobileBoardOnly` 時，放入現有 `data-topbar-board-controls` 群組。
- 使用單一 `button`，沿用 `topbarClassNames.iconButton`，固定使用既有`lucide-react`的`ALargeSmall size={15}`；large時加`border-primary-300 bg-primary-50 text-primary-700` pressed style，不新增說明卡、第二工具列或浮動面板。
- 穩定 contract：
  - `data-kanban-size-toggle="true"`
  - `data-kanban-size-current="compact|large"`
  - `aria-pressed={viewSize === 'large'}`
  - compact 時 `aria-label/title="切換為放大看板（2.5 倍）"`
  - large 時 `aria-label/title="切回緊湊看板"`
- `isSelectingMode` 時 disabled 並沿用現有 disabled title；modal／action rail 的上層 surface 以 z-order／pointer ownership 擋住底層 toggle。desktop 與非 board view 不 render 此控制。

### Board root 與 test selectors

- `src/components/BoardView.tsx` 的既有 `data-mobile-pan-surface="board"` 同一元素新增：
  - `data-kanban-view-size="compact|large"`，desktop/fine-pointer effective value 固定 `compact`。
  - `data-kanban-pinch-state="idle|candidate|committed|wait-all-release"`。
- mode preference 可保存 `large`，但非 mobile/touch render 必須用 effective `compact`；返回 mobile/touch 時再恢復 preference。
- BoardView沿用`useMeetingRecordAvailability()`判定mobile/touch layout：`effectiveViewSize = isMeetingRecordUnavailable ? viewSize : 'compact'`；broker的`enabled = isMeetingRecordUnavailable && !dependencySelection && !isRecordTaskSelectionMode`。task drag／armed rail不放入此布林值，而由broker在enabled判斷前以既有body owner優先取消並進`WAIT_ALL_RELEASE`。
- 現有 ratio oracle 直接使用，不為測試增加可見工程文案：
  - L1：`[data-kanban-column-header] [data-task-title-slot="true"]`
  - L2：`[data-task-hierarchy-level="L2"] [data-task-title-slot="true"]`
  - L3+：`[data-task-hierarchy-level="L3+"] [data-task-title-slot="true"]`
  - 日期／標籤：`[data-task-date-badge="true"]`、`[data-kanban-tag-front="true"]`
  - 欄寬：`[data-kanban-column="true"]`
  - 卡片：`[data-mobile-task-card-primary="true"]`
- `KanbanColumn`／`KanbanCard`／`KanbanChecklist` 的 status/date controls 若現有 selector 不足，僅補 `data-kanban-meta-chip="true"`、`data-kanban-task-checkbox="true"`；不得引入 DEV/test 可見文字。

## CSS Layout Token Contract

在 `src/index.css` 現有 mobile media query 內，以 board root variables 取代分散 hardcode；A 需維持目前 computed baseline，B 使用下表離散值：

| Token／量測 | A Compact | B Large | B/A | 套用範圍 |
|---|---:|---:|---:|---|
| board gap | 8px | 20px | 2.5 | board 直屬欄距 |
| column width | 252px | 630px | 2.5 | column 與 root drop zone |
| column header padding Y/X | 6px / 7px | 15px / 17.5px | 2.5 | 欄頭 |
| column body padding | 5px | 12.5px | 2.5 | column scroll surface |
| L1 title font | 14px | 35px | 2.5 | 欄標題 |
| task card padding Y/X | 2px / 5px | 5px / 12.5px | 2.5 | L2 primary card surface |
| L2 title font | 14px | 35px | 2.5 | L2 title |
| L3+ row min-height | 20px | 50px | 2.5 | checklist row |
| L3+ title font | 12px | 30px | 2.5 | checklist title |
| date/tag/meta font | 9px | 22.5px | 2.5 | board inline metadata；popover 不套用 |
| tag front/sticker height | 13px / 15px | 32.5px / 37.5px | 2.5 | inline tag sticker |
| hierarchy indent/base | 14px / 4px | 35px / 10px | 2.5 | L3+ depth |
| card/title/meta gap | 4px | 10px | 2.5 | card content |

- B 的 icon 與 protected control 不納入六組 ratio oracle，但實際 touch target 不得小於 44px；task primary card surface 會由字級、line-height 與 padding 自然放大。
- `KanbanChecklist.tsx` 移除 inline `depth * 14 + 4` hardcode，改以 `--kanban-checklist-depth` 與 root indent/base variables 計算，避免 B 仍使用 A 的階層距離。
- add-column CTA、inline input／form button與 checklist toggle 在 B 需同步提高 font／icon／height，使可讀且可操作；不放大 app topbar、modal、tag popover、toast、drag action rail 或 fixed drag preview。
- B 規則必須在現有 mobile density declarations 後覆寫，限定 `[data-mobile-pan-surface="board"][data-kanban-view-size="large"]` descendants；不得用全域 `button`／`.task-title-text` 規則污染其他 view。
- 禁止 `zoom`、`transform: scale`、改 viewport meta、`user-scalable=no` 或全頁 touch-action override。

## Touch Arbitration Implementation Contract

### Event source 與 listener ordering

- multi-touch 只以 native `TouchEvent` stream 為 authority；PointerEvent 只保留既有單指 pan compatibility，不建立第二套 pinch reducer。
- board `touchstart` listener 改為 `{ capture: true, passive: false }`，確保第二指進入時可在 React task handlers 前取得 owner；`touchmove` 維持 capture／non-passive。
- pinch candidate 起始時同步設 `document.body[data-kanban-pinch-active="true"]`、suppress next compatibility click，並取消 pan state；所有 touches 釋放、cancel、blur、visibility hidden、pagehide 或 unmount 後必須移除 body attr。
- PointerEvent 在 body pinch attr 存在時不得驅動 pan／drag；只做 consume 或 no-op，避免同一實體手勢重複處理。

### Deterministic transition order

1. 第一指：若非 protected target，建立現行 pan candidate；不建立 pinch。
2. 第二指：
   - 若 `data-task-drag-touch-active` 已存在，先呼叫 `cancelActiveTaskDrag()`，reason=`multitouch`，進 `WAIT_ALL_RELEASE`；模式不變。
   - 若 `enabled=false`、任一 touch target 為 protected control，或 task action rail／selection owner 已存在，取消 pan／tap 相容 click並進 `WAIT_ALL_RELEASE`；模式不變。
   - 其餘才記錄 `d0`、中心、起始 mode，進 `PINCH_CANDIDATE`。
3. 兩指 move：A→B 同時滿足 `ratio >= 1.15` 與 `delta >= 24px`；B→A 同時滿足 `ratio <= 0.87` 與 `delta <= -24px`。commit 後立即鎖定單次 transition並進 `WAIT_ALL_RELEASE`。
4. 第三指：未 commit 則取消、不切；已 commit 保留結果。兩者都等所有 touches 釋放。
5. touchend：仍有 touch 時不得 re-arm；`touches.length === 0` 才回 `IDLE`。

protected control 使用既有 `isTaskPrimaryActionTarget`，但 `data-mobile-pan-pass-through="true"` 仍允許從 canvas CTA 的非提交手勢提升為 pinch。modal／popover／action rail 若透過 portal render 在 board 外，本來就不會進入 board listener；不可另掛 document-wide pinch handler。

`COMMITTED`需至少保留一個animation frame，讓root selector與debug trace可觀測；下一個frame進`WAIT_ALL_RELEASE`。此期間不得因React rerender重複呼叫`requestViewSize`。

### Long-press／tap defense in depth

- `useLongPress.onTouchStart` 在 touches 不是 1 時先 `cancel()` 並不建立 timer；timer callback 執行前再次檢查 body pinch attr。
- `useTouchTapGuard.onTouchStart/onTouchMove` 遇 multi-touch 時設定 `pannedRef` 與 `suppressNextTapRef`，不得以 touches[0] 繼續單指判斷。
- broker 的 click capture 是最外層 hard gate；內層 hook guard 是 defense in depth。pinch 全釋放後，下一個全新單指 gesture 才可 tap／long-press。
- `useTaskDragSession`新增`cancelForGestureConflict = useCallback(() => cancelWithReason('multitouch'), [cancelWithReason])`並只在hook return暴露給BoardView；`MobileTaskActionContextValue.cancel(event?)`與現有surface callers不改signature。

## Anchor Capture／Restore Algorithm

1. `requestViewSize` 在 React state 更新前呼叫 registered adapter `capture(origin)`。
2. pinch origin 使用實際中點；toolbar origin 使用 board viewport 中心。
3. capture priority：中點下最內層 `[data-task-hierarchy-level][data-task-id]` → `[data-kanban-column][data-task-id]` → 第一個與中心線相交的可見 task／column → board content coordinate fallback。
4. anchor 保存 stable task/column id、kind、element 內 normalized X/Y、board scrollLeft、column scrollTop 與 client target point；不得保存 transient overlay node。
5. provider 更新 mode 後，以兩個 `requestAnimationFrame` 等待 CSS reflow；adapter 在同一 board root 重新 query stable id，計算新 anchor client point。
6. 水平差異只調整 board `scrollLeft`；垂直差異只調整原欄的 `scrollTop`。瀏覽器自然 clamp 後再量一次，非 edge drift >24px 時允許一次 correction pass。
7. anchor element 已不存在時使用 fallback content coordinate；不得 throw、開 modal或寫 domain state。
8. orientation／resize／account change／view unmount 會丟棄 pending restore，不得把舊 board anchor 套到新 board。

## Per-file Patch Manifest

| 檔案 | Patch intent | 不可改變 |
|---|---|---|
| `src/features/kanbanViewSize/kanbanViewSize.ts`（new） | 型別、常數、storage normalize、pinch threshold pure functions | 不依賴 domain store/service |
| `src/features/kanbanViewSize/KanbanViewSizeProvider.tsx`（new） | account-scoped state、request、adapter lifecycle | 不做 remote preference sync |
| `src/features/kanbanViewSize/kanbanViewSizeAnchor.ts`（new） | capture／restore／drift／clamp | 只寫 scroll position |
| `src/App.tsx` | authenticated provider wiring | view routing、data sync 不變 |
| `src/components/MainLayout.tsx` | mobile board topbar toggle | mode switcher、filters、undo/redo 不變 |
| `src/components/BoardView.tsx` | external canvas ref、context、broker options、adapter、root attrs | DnD resolver／commit與 CRUD 不變 |
| `src/hooks/useMobilePanBroker.ts` | 單一 pan＋pinch仲裁、body lifecycle、debug trace | 既有單指 8px pan與 pass-through 維持 |
| `src/hooks/useLongPress.ts` | multi-touch／pinch guard | 500ms、8px與 non-board behavior 不變 |
| `src/hooks/useTouchTapGuard.ts` | multi-touch compatibility-click suppression | 單指 threshold與 public API 不變 |
| `src/components/Wbs/taskDrag/useTaskDragSession.ts` | 暴露 `cancelForGestureConflict` | commit／target／action rail不變 |
| `src/components/Wbs/KanbanColumn.tsx` | 必要 probe/meta attributes | 欄拖曳、日期、filter projection 不變 |
| `src/components/Wbs/KanbanCard.tsx` | 必要 probe/meta/checkbox attributes | tap/details、long-press、L2 hierarchy 不變 |
| `src/components/Wbs/KanbanChecklist.tsx` | CSS depth variable＋probe attributes | recursive hierarchy／drop target 不變 |
| `src/index.css` | mobile board scoped A/B tokens | 非 board、desktop、modal、rail不變；保護既有 dirty worktree 內容 |
| `scripts/verify-dev-081-mobile-kanban-dual-scale-pinch.ts`（new） | pure/static contract與 threshold cases | 不宣稱 rendered UI PASS |
| `scripts/verify-dev-081-mobile-kanban-dual-scale-pinch-browser.pw.js`（new） | QA-DEV-081 UI-only cases與 artifact | 不直接 mutation store/API/storage/DOM |
| `package.json` | 兩個 DEV-081 verifier commands | 既有 scripts 不改名 |

## RD Execution Slices

| Slice | 執行內容 | Slice gate |
|---|---|---|
| S0 Preference/kernel | 三個 feature modules、pure threshold與 anchor helpers | 新 pure verifier 的 normalize、threshold、single-commit、cancel cases PASS；TypeScript PASS |
| S1 Provider/entry | App provider、MainLayout toggle、BoardView effective mode／selectors | toolbar click A↔B、reload、desktop/non-board negative smoke；無 domain write |
| S2 Gesture owner | broker、long-press、tap guard、drag conflict cancel | CDP two-touch threshold／jitter／slow pinch／active drag＋第二指 cases PASS；DEV-029 targeted regression PASS |
| S3 Layout/geometry | CSS tokens、checklist indent、meta probes、anchor restore | 六組 B/A ratio、viewport surface audit、anchor drift、B drag hit-test PASS |
| S4 Convergence | 完整 DEV-081 browser、DEV-029／054 regression、engineering gates與文件 drift | Automated UI gate收斂；實機仍依 QA 分層，不阻止本地 RD implemented 狀態但阻止完整 mobile QA/release-ready |

第一個 slice failure、未知 domain write、需要改遠端 preference/schema、或既有 dirty source 與本 patch 無法安全分離時停止；不得跳到後續 slice 掩蓋。

## Failure Recovery

- preference parse/write failure：normalize／降級到 A；session change可保留，無資料補償。
- pinch/cancel lifecycle error：finally/unmount 清 body attr、pan state、pending click與anchor request；下一個 clean gesture必須可用。
- active drag conflict：只走 `cancelWithReason('multitouch')`，不得呼叫 finish／commit；可見 order與hard reload order皆不變。
- anchor target lost：fallback到 board content coordinate；若仍無法保持，保證目標欄可見並記錄 debug，不做第二套 transform。
- B rendering failure：feature path回到 `compact`並保留既有 A；不需要資料 rollback。實作可保留常數級 kill switch `KANBAN_LARGE_VIEW_ENABLED`，預設 `true`，只控制 B入口與pinch，不散布多處 flags。
- visible runtime error、body overflow、owner stuck或錯誤資料提交：立即停止，不以 storage reset、reload或改 QA oracle掩蓋。

## Required Verification and Evidence

### Commands

```text
npm run verify:dev-081-mobile-kanban-dual-scale-pinch
npm run verify:dev-081-mobile-kanban-dual-scale-pinch-browser
npm run verify:dev-029-mobile-pan-first-interactions
npm run verify:dev-029-mobile-pan-first-interactions-browser
npm run verify:dev-054-mobile-task-drag-precision
npm run verify:dev-054-mobile-task-drag-precision-browser
npx tsc --noEmit
npx eslint src/App.tsx src/components/MainLayout.tsx src/components/BoardView.tsx src/hooks/useMobilePanBroker.ts src/hooks/useLongPress.ts src/hooks/useTouchTapGuard.ts src/components/Wbs/taskDrag/useTaskDragSession.ts src/components/Wbs/KanbanColumn.tsx src/components/Wbs/KanbanCard.tsx src/components/Wbs/KanbanChecklist.tsx src/features/kanbanViewSize/*.ts src/features/kanbanViewSize/*.tsx
npm run build:test
git diff --check
```

### Package scripts

```json
"verify:dev-081-mobile-kanban-dual-scale-pinch": "tsx scripts/verify-dev-081-mobile-kanban-dual-scale-pinch.ts",
"verify:dev-081-mobile-kanban-dual-scale-pinch-browser": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev081-kanban-scale -Filename scripts/verify-dev-081-mobile-kanban-dual-scale-pinch-browser.pw.js -OutputDirectory output/playwright/dev-081-mobile-kanban-dual-scale-pinch -ArtifactWindowKey __DEV081_ARTIFACT -ArtifactPath output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json"
```

- Primary rendered artifact：`output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json`，schema遵守 `QA-DEV-081`。
- 本次 automated smoke evidence 已寫入 primary artifact；9 個 UI-only cases 全 PASS，涵蓋 A/B toolbar、pinch out/in、第三指取消、active drag 多指衝突、touch landscape、desktop negative，console／page／request errors 均為 0。完整 20-case matrix 與 iPhone Safari／Android Chrome physical gate 尚未宣告完成。
- 必要 screenshots：每個 mobile viewport 的 A／B、pinch origin matrix、active drag＋第二指、B合法drag、modal/control owner、desktop negative。
- DEV-029／054 舊 evidence是 regression輔助；DEV-081 UI PASS只能由符合 UI-only boundary 的新 verifier與QC實際畫面支持。
- browser verifier base URL固定 `http://localhost:4000/`；若啟動臨時 runtime，遵守工作區 runtime owner／cleanup規則。

## RD Readiness Closure

- P0／P1產品決策：`0 open`。2～3倍範圍、預設2.5、入口、持久化範圍、protected owners、原生zoom邊界均已固定。
- P0／P1工程決策：`0 open`。owner、typed contract、key、threshold、tokens、anchor、cancel、selectors、file manifest、slice、commands與artifact已固定。
- Migration：`None`；API/schema/permission：`No impact`；ADR：`Not needed`。
- Spec conflict：`Compatible extension`；`SPEC-029`／`SPEC-054`不改寫，DEV-081只新增multi-touch上層仲裁與顯示模式。
- RD 可依 S0→S4 直接開始；真機證據是完整 mobile QA/release gate，不是本地實作啟動 blocker。

## 驗收標準

- `AC-081-01`：A 維持現況；B 的六組代表性 `B/A` 比例各為 `2.0～3.0`，預設目標約 `2.5`。
- `AC-081-02`：看板空白區、欄標題、L2、L3+ 與 canvas CTA 非受保護表面均能以一次 pinch-out A→B、一次 pinch-in B→A；每個 gesture 最多切一次。
- `AC-081-03`：低於門檻、兩指平移、抖動、第三指及 cancel matrix 不得誤切；取消後無 stuck owner。
- `AC-081-04`：pinch 不會開啟明細、action rail、CTA、拖曳或資料寫入；active drag 遇第二指會零提交取消。
- `AC-081-05`：A／B 的單指 pan、quick tap、long-press、合法 task drag 與控制項仍可使用，且 drag hit-test／overlay 與畫面一致。
- `AC-081-06`：切換後錨點漂移不超過 24 CSS px；edge clamp 時同一欄／任務仍可見。
- `AC-081-07`：B 無文字／圖示重疊、非預期裁切、控制項遮蔽或 App shell 水平 overflow；看板是唯一水平 scroll owner。
- `AC-081-08`：可見 A／B 控制可用 touch、鍵盤與輔助技術操作，狀態可讀；reload 後保留同帳號同裝置偏好。
- `AC-081-09`：modal／drawer／popover／input／action rail 內手勢不穿透；看板外 browser／OS zoom 能力未被全域禁用。
- `AC-081-10`：清單、甘特、行事曆、心智圖與 desktop negative viewport 不受影響；console、page、request、visible error 均為 0。

## 停止條件與回復

發生以下任一情況立即停止並回 RD／PM，不得以「大致可用」通過：

- B 任一主要比例低於 2.0 或高於 3.0。
- pinch 造成 task／board 寫入、錯誤 drop、details／action rail／CTA 誤觸或 stuck gesture owner。
- App shell／body 新增水平 overflow、B 無法平移、控制項被遮住或幾何 hit-test 與畫面不一致。
- 必須禁用全頁 browser zoom、修改 schema／API／permission，或需要跨模式共用縮放架構。
- 自動化只能靠直接 store／API／DOM mutation 才能通過。
- iOS Safari／Android Chrome 真機與 automated browser 結果有行為分歧。

回復策略：模式切換為純 UI preference；若未通過，關閉 B 入口／pinch broker feature path，保留 A 與 `SPEC-029`／`SPEC-054` 現行行為，不做資料 rollback。

## Execution Boundary

- Current phase：DEV-081 S0～S4 已完成本地實作與 automated UI evidence；iPhone Safari／Android Chrome physical gate 尚待 QA 執行。
- Future Phase Captured / Not Requested：全 App連續縮放、任意倍率、跨裝置同步或改用browser viewport zoom。只有使用者另行要求且會影響多view／remote preference時，另立DEV並重評ADR／資料契約。
- Release boundary：`Implemented / Automated UI PASS`不等於Release Ready；browser automated PASS不取代iOS／Android實機sign-off。
- 本文件不授權commit、push、PR、merge、deploy、production data或release。
