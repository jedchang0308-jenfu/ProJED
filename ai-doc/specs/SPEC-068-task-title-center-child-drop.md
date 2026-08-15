# SPEC-068：任務標題中央停留移入子任務

狀態：RD Contract Ready / Human Confirmed / QA Plan Ready / Not Implemented

優先級：P1

風險：Medium-to-High（核心拖曳意圖、跨階層 parent/order、桌機／手機手勢與既有同階排序肌肉記憶）

父任務：DEV-053、DEV-054、DEV-055、DEV-058、DEV-065、DEV-067

來源 ID：`USER-20260815-TASK-TITLE-CENTER-CHILD-DROP`

QA 計畫：`ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md`

文件成熟度：RD Contract Ready

## 1. 問題與目標

目前 L2 卡片的「子任務追加區」是拖曳時才啟用的透明命中區；L3+ 任務列又沒有相同的子任務落點。使用者無法從畫面知道某個任務可以接收既有任務成為子任務，也無法在放開前確認最終 parent。

DEV-068 將「移入特定任務底下」改成跨階層一致的明確意圖：把來源拖到目標任務標題中央，持續停留 1 秒後才鎖定子任務意圖；鎖定時顯示可辨識的子任務預覽，只有放開才提交。桌機與手機使用相同語意，但各自保留既有 mouse threshold、mobile pan-first、long-press 與 action rail。

成功不是只有資料能移動，而是使用者在放開前能回答：

- 目前鎖定的是哪一個父任務。
- 來源會成為該任務的子任務，而不是同階 before／after。
- 尚未鎖定、離開目標或取消時不會改寫資料。

## 2. Human Decision Brief

- 子任務目標改為「任務標題中央安全區」，不再依賴 L2 卡片底部的透明追加區。
- 來源進入中央安全區後必須連續停留 1,000ms 才鎖定；計時從真正進入該目標安全區後開始。
- 鎖定只建立 preview，不寫資料；使用者放開後才提交。
- 預覽必須讓使用者看出來源會縮排到目標任務底下，不能只顯示與同階排序相同的一條線。
- 桌機與手機採同一產品語意；手機仍須先通過既有 long-press drag-action 入口。
- 本輪要求為所有風險建立「AI 在真實渲染畫面操作」的驗證計畫；不得只用 store mutation、static scan、unit test、lint 或 build 宣稱通過。

## 3. Spec Impact

- `Intentional replacement`：取代 DEV-055 的 L2 卡片底部透明 `checklist-drop`／append hit area 作為「指定父任務」的主要 child-drop 入口。
- `Intentional replacement`：局部覆寫 DEV-067「任務本體／column header 皆為同階定位」；只有標題中央安全區完成 1 秒鎖定後改為 child intent，其他區域仍維持 DEV-067 的 L1 reorder／promotion 與 lane semantics。
- `Compatible exception`：DEV-054 的 raw finger、exact innermost ownership、target stability、release freshness、action rail priority、mobile pan-first 與 cancel cleanup 必須保留，新增的 dwell state 不得建立第二套 mobile commit path。
- `Compatible exception`：DEV-053 的單一 drag session、at-most-once commit、permission revalidation、cycle guard、undo 與 Workbench placed-row no-drag 必須保留。
- `Compatible exception`：DEV-058 的 origin/no-op 藍色標題欄位繼續有效；來源原地、child candidate、child armed 與一般 position indicator 同一時間只能顯示一種主要回饋。
- `Compatible exception`：DEV-065 的 drag 前來源子樹 hover 預覽保持；真正開始拖曳後由 DEV-068 target preview 接管，不得讓 source hover frame 與 child target preview 混淆。
- 不恢復 DEV-051 的跨父層 750ms parent-lock，也不重新啟動 archived DEV-052。DEV-068 的 1,000ms dwell 只治理「標題中央 child intent」，不鎖整個父層或一般跨欄排序。

ADR 判定：不建立。此變更雖改變主要 UI flow，但仍是看板內局部、可逆、無 schema／API／權限或外部契約的產品互動；替代方案與後果由本 SPEC 保存。

## 4. UX Intent

- 使用者與情境：桌機以滑鼠整理看板階層，或手機以長按拖曳整理 L1／L2／L3+ 任務。
- 主要任務與成功結果：把既有任務精準放到指定任務底下，放開前能明確預知 parent 與階層。
- 熟悉 pattern：拖到目標中央並停留表示「進入／收納」，上／下或外圍表示排序。
- 最可能誤解點：中央 child intent 與既有同階排序、手機 long-press/action rail、來源原地 no-op 使用相似藍色回饋。
- 安全預設：尚未滿 1 秒、離開中央區、目標無效、權限失效、取消或 stale timer 一律 zero-write。
- 不能發生：hover/dwell 自動提交、未滿 1 秒變成子任務、舊目標 timer 鎖定新目標、preview 與實際 parent 不一致、同一 release 同時 reorder 與 child commit。

## 5. Interaction State Contract

### 5.1 狀態

| 狀態 | 進入條件 | 可見回饋 | Release 結果 |
|---|---|---|---|
| `dragging` | 桌機超過既有 8px threshold；手機完成既有 long-press drag-action 入口 | 既有 DragOverlay／finger preview | 依一般有效落點提交，無落點則 no-op |
| `child-candidate` | pointer／raw finger 進入另一個有效任務的標題中央安全區 | 目標標題出現低干擾候選框；不得顯示已鎖定子任務 preview | no-op；不得 reorder、不得成為 child |
| `child-armed` | 同一 source、同一 target、同一中央安全區連續停留滿 1,000ms | 顯示唯一 child placement preview | 放開後提交 child move 一次 |
| `cancelled` | 離開中央區、切換 target、Escape、pointer/touch cancel、blur、pagehide、visibility hidden、session timeout | 所有 candidate／armed preview 清除 | zero-write |
| `committed` | `child-armed` 中放開且 release revalidation 通過 | 新位置短暫高亮；必要時展開目標子任務區 | 寫入一次，可一次 undo |

### 5.2 計時與切換

- dwell 固定為 1,000ms；必須有 deterministic clock／timer 測試。
- 桌機 mouse-down 至開始拖曳、手機 touch-down 至 long-press drag-action 的時間不得計入 child dwell。
- 計時 key 至少包含 `sessionId + sourceNodeId + targetNodeId`；pointer 離開中央區或 target 改變立即取消並歸零。
- `<1,000ms` 不得進入 `child-armed`；`>=1,000ms` 後應在下一個 render frame 產生 armed preview。
- armed 後若離開中央區，立即解除 armed；不得保留 grace period 提交舊 child target。
- auto-scroll、DOM reflow、filter、collapse、permission 或 target snapshot 改變後，release 必須以最新 geometry／store／permission 重新驗證。

### 5.3 標題中央安全區

- 使用 `.task-title-text` 或等效 canonical title geometry，必須包含標題幾何中心。
- 安全區不得涵蓋展開按鈕、完成控制、日期、標籤、依賴按鈕、context menu 或其他 interactive controls。
- Desktop fine pointer 的安全區需可穩定命中，不得退化為單一像素或只依文字實際 glyph 寬度。
- Mobile coarse pointer 的語意中心相同，但命中區至少 44x44 CSS px；可在不超出 canonical task primary surface 的前提下擴大 invisible hit geometry。
- 長中文、截斷英文、空白／未命名標題與多層縮排都必須有穩定中心；視覺預覽不得因文字長度改變 parent 語意。

## 6. Drop Semantics

### 6.1 所有看板階層

| 目標 | 中央停留鎖定後結果 | 非中央區既有行為 |
|---|---|---|
| L1 列表標題 | 來源成為該 L1 的直接 L2 child | L1 reorder／promotion 依 DEV-067 |
| L2 卡片標題 | 來源 append 成為該卡片的直接 L3 child | 同階 card before／after 或 lane move |
| L3+ 任務標題 | 來源 append 成為該列的直接下一階 child | 同父層 checklist before／after |

- child commit 固定 `parentId = targetNode.id`，order 為 target canonical active children 末尾。
- L1／group source 被移入非 root target 時，沿用既有 normalize 規則轉為 `nodeType: task`；其完整非封存子樹隨來源移動。
- source、target、source descendant、archived/missing target、跨 board 不合法 target、權限不足都不可 armed 或 commit。
- 一次 child move 只建立一次 batch／undo command；undo／redo 必須完整還原 parent、order、nodeType 與 ancestor rollup。

### 6.2 保留與退役的落點

- `column-drop` 保留作為「把任務放入該列表」的 broad lane target；不依 title dwell，並維持 L2 lane semantics。
- `root-drop` 保留作為看板尾端 L1 append。
- L2 卡片底部透明 append overlay 不再作為指定父任務的 child commit 入口，避免同一 parent 有兩套不可辨識命中方式。
- checklist/card 背景空白不應隱性建立 child intent；指定父任務只能由標題中央 dwell 鎖定。

## 7. Preview 與完成回饋

### 7.1 Candidate

- 進入中央安全區後立即以低干擾 outline／inset frame 表示「此處可停留」，但不得顯示完整 child placement preview。
- candidate 不得只靠顏色；DOM／accessibility 應提供 child-candidate 語意。
- 不顯示數字倒數、progress bar、breadcrumb 或常駐教學文字。

### 7.2 Armed Preview

- 1 秒到期後，目標任務被明確標示為 parent，來源以縮排一層的 ghost row／card 呈現在目標底下，並有短標籤或圖示表達「子任務」。
- Preview 必須是 overlay／portal，不得插入 normal flow、推開兄弟任務、改變 column width、scrollHeight 或 board scrollWidth。
- 畫面同一時間只允許一個主要 target preview；armed child preview、一般 insertion marker、origin field 不得同時存在。
- 手機 preview 必須避開手指與頂部 action rail，且不超出 viewport。

### 7.3 Commit 後

- 只有 release revalidation 通過才移動；若 target 在 release 前失效則 no-op 並清除 preview。
- 目標若收合，成功後自動展開到可看見新 child；新位置以低干擾 highlight/focus 暫時標示，不建立常駐提示卡或逐項 CTA。
- 可及性必須有一次性的成功 announcement，內容至少可辨識來源與新 parent；畫面不強制顯示 toast。

## 8. Desktop Contract

- 保留既有 8px drag threshold、DragOverlay、click-to-details、right-click、blank-canvas pan、dependency／record selection suppression。
- 未啟動 drag 時，標題中央不攔截 click、double click、context menu 或 hover subtree preview。
- active drag 中，中央安全區擁有 child candidate/armed 判定；標題非中央區與 task outer surface 繼續提供同階／lane target。
- Release before 1,000ms in center 必須 no-op，不得退回 ancestor 或同階 target。
- Escape、blur、pagehide、visibility hidden、pointercancel 與 unmount 清理 timer、preview、target metadata 與 source hidden state。

## 9. Mobile Contract

- quick tap 仍開詳情；short pan 仍捲動畫面；只有既有 long-press drag-action 啟動後才可進入 child candidate。
- child dwell 從 raw finger 進入 target title center 後開始，不含 long-press 啟動時間。
- action rail target 優先於 child candidate/armed；拖進 action rail 立即取消 child timer，且每次 release 只能執行 action 或 move 其中一個。
- Finger occlusion 下 armed preview 顯示於手指上方／安全位置，目標 parent 與 ghost child 仍需可辨識。
- edge auto-scroll 後必須重新 hit-test；不得以 scroll 前的 timer/target armed。
- touchcancel、pointercancel、原生 contextmenu 合成事件、app background／rotation 後不得殘留 preview、timer 或下一次手勢卡死。

## 10. Scope

### In Scope

- 看板 L1／L2／L3+ 的 title-center child candidate、1 秒 dwell、armed preview 與 release commit。
- 桌機 mouse 與手機 long-press touch 的同源語意。
- 同階排序、L1 promotion、column/root lane、origin no-op、action rail、cycle/permission/undo 回歸。
- AI 真實瀏覽器操作、timing instrumentation、store read-only snapshots、三以上 viewport 與 visible-error evidence。

### Out of Scope

- WBS 清單、甘特圖、月曆、心智圖的新 child-center drop UI。
- 新增偏好設定、可調 dwell 秒數、鍵盤拖曳或 desktop modifier key。
- 修改手機 action rail 的 action set；「新增子任務」仍是建立新任務，不是移動來源。
- DB schema、migration、RLS、RPC、遠端資料、production deploy 或 release。
- 恢復 DEV-051 parent-lock、DEV-052 架構或舊卡片底部透明 child commit。

## 11. Current Architecture Impact

預期受影響面：

- `src/components/BoardView.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/taskDrag/taskDragTypes.ts`
- `src/components/Wbs/taskDrag/taskDropIntent.ts`
- `src/components/Wbs/taskDrag/taskDragTargetAdapter.ts`
- `src/components/Wbs/taskDrag/useTaskDragSession.ts`
- `src/components/Wbs/taskDrag/desktopTaskDropPreview.ts`
- `src/components/Wbs/taskDrag/taskDragCommit.ts`
- `src/components/Wbs/taskDrag/TaskDragPresenter.tsx`
- targeted verifier 與 browser true-operation suite

不影響 `TaskNode` schema、Supabase、external API 或權限模型。RD Implementation Ready 階段需把 desktop/mobile dwell state 收斂到單一 normalized child-intent state，禁止各寫一套 timer／commit。

## 12. Acceptance Criteria

- L1／L2／L3+ title center 都能在連續 1,000ms 後產生唯一 child armed preview，且 release 後 parentId 等於 exact target id。
- `<1,000ms` center release、進入後離開、快速切換 target、auto-scroll stale target、cancel／blur／hidden 全部 zero-write。
- Armed preview 明確呈現 parent＋縮排 ghost child＋非純色 child 語意；不得與一般 marker／origin field 同時存在。
- 非中央區的同階排序、L1 promotion、column body L2 drop、root append 保持可用且不受 dwell timer 延遲。
- quick tap、short pan、long-press、action rail、right-click、8px threshold、blank pan、interactive controls、Workbench placed row no-drag 不回歸。
- self／descendant／missing／archived／permission denied／cross-board invalid target 不得 armed 或寫入。
- 一次 release 最多一筆 batch；source subtree、nodeType normalization、ancestor rollup、undo／redo 一致。
- 1440x900、1024x768、390x844、430x932 無 layout shift、重疊、裁切、非預期 overflow、preview 遮擋或 runtime-visible error。
- AI 必須在真實 rendered page 使用實際 mouse／touch event path 操作；直接改 store 只可建立 fixture，不得當作操作證據。

## 13. Stop Conditions

- child preview 與 release 後 parent/order/nodeType 不一致。
- 未滿 1 秒即 child commit、離開後 stale timer armed、同一 release double commit 或 cycle 成立。
- 中央 child zone 使非中央同階排序、L1 promotion、mobile pan/action rail 或桌機 click/right-click 回歸。
- 新舊 child commit hit area 同時有效，造成同一 parent 有兩套不可辨識落點。
- Preview 插入 normal flow、推動任務、被 action rail／手指遮住、超出 viewport 或只靠顏色表達。
- 缺少桌機與手機真實 rendered interaction、timing、screenshot／video、before-after snapshot 或 visible-error evidence；此時只能判定 `未充分驗證`。
- 需要 schema、remote data、production 或恢復 DEV-051／052 才能完成。

## 14. Execution Boundary

本輪只完成 RD Contract 與 QA 計畫，不修改產品程式、不執行 QC、不部署。下一步若使用者要求實作，先補到 RD Implementation Ready，再由 RD 實作並依 `QA-DEV-068` 由 AI 真實操作；正式環境仍須另走 release gate。

