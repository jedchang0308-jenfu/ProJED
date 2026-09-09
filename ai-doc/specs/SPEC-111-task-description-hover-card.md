# SPEC-111：任務說明跨閱讀模式懸浮視窗

- 日期：2026-09-08（2026-09-09 觸發範圍與微型標示修訂）
- 狀態：Implemented / Local QA-QC PASS / NOT RELEASED
- 關聯 DEV：DEV-111
- QA：`ai-doc/qa/QA-DEV-111-task-description-hover-card.md`
- QC：`ai-doc/qc/QC-DEV-111-task-description-hover-card.md`
- 風險：Medium（跨五個閱讀模式的使用者可見互動）

## 目的與使用者決策

使用者希望先以一個最小功能讓團隊在閱讀任務時快速理解任務目的與大方向，不新增 OKR 欄位或固定格式。
本期直接使用現有「任務說明」自由文字；桌面滑鼠停留任務 1 秒後顯示懸浮說明視窗，並套用到所有任務閱讀模式。

使用者於 2026-09-08 明確撤回「說明直接顯示在任務列下方」方案。本規格只交付 hover 視窗，不加入目的、
Objective、KR 或方向欄位，也不限制只有某一任務階層可以填寫。

使用者於 2026-09-09 進一步指定：懸浮說明的啟動範圍必須與「選取預覽藍框」相同，並直接引用該既有
task surface，不得由任務標題另建一套較小的 hover window。

使用者同日選定：有非空任務說明的任務，於標題旁顯示一個 9px 的微型說明圖示，固定占用約 11px；
圖示只提示「此任務有說明」，不成為按鈕、tooltip 入口或第二套 hover 範圍。

## Spec Impact

分類：`Intentional replacement`（只替換本規格原本「不新增 icon」的限制；其他契約仍是 compatible extension）。

- `SPEC-066`：沿用 `TaskNode.description` 作為第一則備註的 plain-text compatibility projection；不建立第二份正文，
  不改 rich content、editor、save、AI projection 或 schema。
- `SPEC-065`：看板與清單直接把既有 `data-task-surface-source`（選取／hover 藍框的 canonical source surface）
  作為說明啟動範圍，不複製 title-only trigger；來源／子樹框本身不變。拖曳開始或按下指標時關閉說明，
  避免與 drag preview 競爭；不得恢復瀏覽器原生黑色 title tooltip。
- `SPEC-028／070`：本功能是唯讀 presentation，不新增 semantic action、command、selection 或 mutation；既有 click、
  double-click、context menu、quick title、detail modal 與 drag ownership 不變。
- 本輪依使用者明確選擇，以單一微型圖示取代先前 no-icon 決策；不影響資料、command、hover surface ownership
  或可存取名稱。ADR 不需要，這仍是局部、可逆、無資料契約變更的呈現功能。

## UX Intent

- 任務／結果：閱讀任務時可在不打開明細的情況下取得既有任務說明。
- 主物件／主焦點：目前滑鼠停留的單一任務。
- 預設刪除：不顯示常駐摘要、placeholder、欄位標籤、教學文字、數量或可點擊說明按鈕。
- 保留舉證：沒有可見標示時，使用者無法在掃描任務時辨識哪些任務存在 hover 內容，只能逐項停留 1 秒試探；
  最小保留形式為單一 9px 線性圖示。
- 非語言修復：標題旁 11px 固定槽位＋低對比圖示提示內容存在；閱讀仍由藍框 surface 的 1 秒 dwell、
  單一 overlay、viewport flip／clamp 與離開即收合完成。
- 風險與驗證：空白說明誤顯示、圖示擠壓標題、窄版 overflow、滑鼠事件被攔截、長文字、HTML-like 文字、
  viewport 邊界、drag／scroll／Escape、五模式與 console error。

## 行為契約

1. 適用入口為桌面 fine pointer 的五個任務閱讀模式：
   - 看板：L1、L2、L3+ 直接使用選取預覽藍框的完整來源 surface；標題之外但仍在藍框內也會啟動。
   - 清單：直接使用整列選取預覽藍框 surface；任務名稱之外的同列區域也會啟動。
   - 心智圖：任務節點；quick-title 編輯中停用。
   - 甘特圖：任務條及同畫面共用任務側欄。
   - 行事曆：任務區段及同畫面共用任務側欄。
2. 只有 `description.trim()` 非空時才允許開啟；空白說明即使位於既有 canonical task surface，也不顯示視窗、
   不保留空間或 placeholder。
3. 同一個非空判斷控制微型標示：看板 L1／L2／L3+、清單、心智圖、甘特圖、行事曆與共用任務側欄，
   都在任務標題旁顯示單一 9px 線性說明圖示，外層固定為 11px × 11px；空白說明不渲染圖示也不占位。
4. 圖示無背景、外框、文字、數量與原生 `title`；使用低對比灰藍色，`pointer-events: none`、`aria-hidden=true`、
   不可 focus。它不是控制項，完整藍框 task surface 仍是唯一 hover 啟動範圍。
5. 游標持續停留同一入口滿 1000ms 才顯示；在到時前離開或切到另一任務必須取消前一個 timer。
6. 內容以 React 純文字呈現並保留換行；`<b>` 等 HTML-like 字串不得被解析成 DOM 或執行。
7. 視窗只顯示使用者內容，不額外顯示「任務說明」、操作教學或成功訊息。
8. 視窗以 body portal 呈現，不被卡片、畫布、甘特或行事曆的 overflow 裁切。寬度上限 380px、高度上限
   320px，並保持在 viewport 12px 邊界內；長內容可在視窗內捲動。
9. 游標可移入視窗繼續閱讀；按 `Escape`、離開、在外部 pointer down、捲動來源畫面、resize、window blur、
   visibility hidden 或 drag start 時關閉。內部捲動不得誤關閉。
10. 開啟時由 `aria-describedby` 關聯目前 trigger 與 `role="tooltip"`；關閉時移除本功能加入的 ID，保留其他既有 ID。
11. touch／coarse pointer 不啟動 hover card；微型標示可隨既有閱讀模式呈現，但不新增手機長按或點擊行為。
12. 行事曆任務區段移除會與 1 秒 custom hover 競爭的原生 `title`；既有 `aria-label` 保留任務名稱。

## Implementation Contract

- `MainLayout` 只掛載一個 `TaskDescriptionHoverCard`，使用 document-level delegated pointer listener，避免每張任務
  各自建立 timer 或 overlay。
- 看板 L1／L2／L3+ 與清單由 controller 直接解析既有 `[data-task-surface-source="true"][data-task-id]`；
  不在 title 重複提供 description trigger。心智圖、甘特圖、行事曆及共用側欄沿用各自完整 task surface 上的
  `data-task-description-hover-trigger` 與 canonical `data-task-id`。
- 顯示當下重新從 `useWbsStore.getState().nodes[taskId].description` 讀取最新 plain text，避免 1 秒期間資料變更後
  顯示 stale 內容。
- 微型標示由共用 `TaskDescriptionIndicator` 元件集中執行 `description.trim()`、9px icon、11px slot、非互動與
  `aria-hidden` 契約；各閱讀模式只決定標題旁的插入位置。
- 本期不修改 `TaskNode`、provider、API、權限、migration、local storage 或 persisted UI preference。

## Acceptance Criteria

- [x] 看板、清單、心智圖、甘特圖、行事曆都在持續 hover 1 秒後顯示同一份既有任務說明。
- [x] 有非空說明的任務在看板 L1／L2／L3+、清單、心智圖、甘特圖、行事曆與共用側欄顯示 9px 圖示／11px 固定槽位；空白說明不顯示且不占位。
- [x] 圖示無背景、外框、文字、數量、`title`、focus 或 pointer ownership；藍框完整 task surface 仍是唯一 hover trigger。
- [x] 1440×900 五模式與 390px 窄版沒有標題／其他控制重疊、來源 layout shift 或 document 水平 overflow。
- [x] 看板 L1／L2／L3+ 與清單在「標題外、選取預覽藍框內」停留也會顯示；title-only trigger 已移除。
- [x] 760ms 時仍未顯示；離開後 timer 取消，不會延遲冒出 stale 視窗。
- [x] 空白說明不顯示；換行保留；HTML-like 文字只顯示為純文字。
- [x] 五模式視窗皆在 viewport 內，沒有 document 水平 overflow 或來源 layout shift。
- [x] 視窗可 hover，Escape、scroll、pointer down 與 drag start 都能關閉。
- [x] `role="tooltip"`、`aria-describedby` 建立／清理與原生 calendar title 移除通過。
- [x] DEV-028 跨模式 click／details／selection browser regression 與 DEV-066 description projection 通過。
- [x] TypeScript、targeted ESLint、test build 與 visible console/page error gate 通過。

## Out of Scope / Stop Conditions

- 不新增 OKR、Purpose、Objective、KR 或「方向」欄位，不設計填寫格式、必填或階層繼承。
- 不把任務說明常駐展開在任務列，不新增 modal、drawer 或設定開關；除本輪選定的單一微型存在標示外，
  不新增文字標籤、badge、數量、第二種 icon 或可點擊入口。
- 不將 rich-content JSON 直接渲染於閱讀模式，也不改任務說明編輯器。
- 不擴張到 mobile touch gesture、TaskDetailsModal 內部閱讀區或工作台的新入口。
- 若後續要求結構化 OKR、可編輯 hover、跨帳號資料、權限或 provider 變更，另行建立 DEV 並重新判定風險。
- 本期不 deploy 或 release；正式交付另走 release gate。

## Evidence

- Static：`verify:dev-111-task-description-hover-card`，38/38。
- Browser：`verify:dev-111-task-description-hover-card-browser`，34/34；fixture `dev-111-v3`，Chromium
  1440x900＋390x844，五模式 rendered／近距離 indicator screenshots、9px glyph／11px slot、空白不渲染、
  shared sidebar、L1／L2／L3+／清單完整藍框範圍、純文字、timing、dismissal、a11y、overflow 與 visible／console 0 error。
- Regression：DEV-028 static 48/48＋browser PASS；DEV-066 targeted PASS；TypeScript、test build、targeted
  ESLint 0 errors、`git diff --check` PASS。
- DEV-065 既有 static literal gate 與 drag overlay summary gate 仍有與本次修改無交集的漂移；其 hover geometry、
  native title 與 source handoff 案例通過。詳見 QC 限制。
