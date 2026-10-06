# SPEC-119：OKR 內容儲存格直接編輯與自動展開／收合

- 文件版本：R10，2026-09-14；同步全系統共用捲軸基底、明確例外、單一編輯框精簡、編輯狀態辨識修正、編輯模式行距修正、收合命中修正與 targeted QA/QC 結果。
- 成熟度：`RD Implementation Ready / Implemented / Targeted QA-QC PASS / NOT RELEASED`。
- 審查性質：實作與文件收斂；本機 targeted QA/QC 已通過，非正式 release gate。
- 對應：DEV-119（開發點），父交付點 DEV-116；風險 Medium。
- 需求來源：`USER-20260914-GOAL-CELL-DIRECT-EDIT-AUTOFIT-TOGGLE`、`USER-20260914-SYSTEM-SCROLLBAR-FOUNDATION`。
- 驗收權威：[QA-DEV-119](../qa/QA-DEV-119-goal-cell-direct-edit-and-content-fit.md)；狀態入口：[dev_task](../dev_task.md)。

## DEV-121 群組範圍面 compatible amendment（2026-09-14；架構已定案／未實作）

[SPEC-121](SPEC-121-goal-hierarchy-comparison-grid.md) 可在真實 `rowSpan > 1` owner `td` 增加低對比 group surface
與 scope rail，但不得新增 covered cell、複製內容或改 owner。task／planning reading guide 明確排除 content owner cell。
本文件的 rowSpan、headers、tabIndex、cell key、editor/session、expand／collapse、Y-scroll、content menu、
meeting 唯讀與 PWA owner authority全部保留；selected／editing／error outline 的可見優先序高於新 group surface。

## 1. 目標與範圍

讓現有扁平 OKR 表格具備兩個熟悉的操作：A 在原格編輯任務目的；B 展開完整內容，再執行一次收合並恢復 Y 軸捲動。
不增加常駐工具列、卡片、展開按鈕或純裝飾容器；必要 scroll 元素、編輯器及失敗恢復入口不能因「拆容器」而刪除。

範圍只含目前有 DOM 的 description／meeting owner cell。covered cell 不新增 DOM，整欄空白不新增 placeholder；
新增空白目的仍走 Task Details。會議聚合唯讀；任務名稱、負責人、狀態、日期與工期沿用既有操作。
不建立完整 spreadsheet grid、range selection、公式、列高拖曳、手機 Goal 或持久化展開偏好。

參考 Excel 的雙擊／F2 編輯、Enter 完成、Esc 取消、Alt+Enter 換行，以及雙擊列下邊界 AutoFit。
Google Sheets 的非空格雙擊編輯與 Ctrl+Enter（Windows）／Cmd+Enter（Mac）換行同樣保留。
「在內容格底邊切換，第二次收合」是 ProJED 的在地化設計，不是宣稱 Excel／Sheets 原生 AutoFit 可反向切換。
來源：[Excel 編輯](https://support.microsoft.com/en-us/excel/edit-cell-contents)、
[Excel 列高](https://support.microsoft.com/en-us/excel/change-the-column-width-and-row-height)、
[Sheets 編輯](https://support.google.com/docs/answer/46973?hl=en)。

## 2. 現況證據與架構決策

本節區分目前程式行為與本 DEV 要實作的修正；不得把 target 當成已存在功能。

R10 Spec Impact Preflight：`Intentional replacement / cross-system visual foundation`。使用者明確要求把本輪 3px 簡約捲軸做成共用件；
以低 specificity 的全域 CSS 基底取代各 surface 重複的捲軸 class，不增加 React wrapper／DOM 容器。資料、API、權限、scroll owner、overflow 行為與事件所有權不變。
效用評估以「一致性與維護收益－遷移／DOM／互動成本」為準；CSS 基底的淨效用高於新增 `ScrollArea` component。

| 原始碼證據 | R2 決策與理由 |
|---|---|
| GoalView 的 sparse projection 依 description 判斷 owner／欄位是否存在；updateNode 先 optimistic set | 清空最後一格可能卸載 editor。編輯 session 未結束前只保留來源 purpose 的 projection anchor，不能只靠 cell 內 error state。 |
| AppContent 切換 view 會卸載 GoalView | 選取／展開留在 GoalView；唯一未完成編輯 session 提升到同帳號 AppContent 生命週期，避免切換畫面丟失草稿或重試入口。 |
| TaskDetailNoteEditor 已共用 Lexical，但初始 state、toolbar hotkeys 與高度偏好綁在 details surface | 擴充同一 editor 的 cell variant；保留 engine／serializer，隔離 cell 鍵盤與 sizing，不另造 editor。 |
| updateNode shallow compare，先更新本機；onPersistSuccess 早於 meeting capture，completion 包含 capture await | 以 persistence callback 判定任務保存；仍觀察 completion 的 capture 異常。不把 no_changes、timeout 或 optimistic 值當成遠端成功。 |
| skipActivity 不阻止 Undo 或 meeting capture；forcePersistence 可在無差異時 pushUndo | retry 重新讀最新 node、重用無差異物件；只在 hasChanges 時新增 Undo。保留 store-owned meeting capture，不承諾整條管線零副作用。 |
| PWA inline-editor owner 目前只查 focused activeElement | 同一 owner 必須另外讀取未完成 Goal session marker；失焦或換 view 後不能被誤判 safe。 |
| native td 為 cell role，並非 gridcell | 保留 table 語意，以 focus／current-cell outline 呈現目前格，不使用不適用的 aria-selected。 |

ARIA 依據：[WAI-ARIA cell](https://www.w3.org/TR/wai-aria-1.2/#cell)、
[aria-selected 的適用角色](https://www.w3.org/TR/wai-aria-1.2/#aria-selected)。

## 3. 操作契約（唯一 UX authority）

| 操作／狀態 | 行為 |
|---|---|
| 單擊內容格 | focus 該 owner cell，一個藍色 inset outline；不開詳情、不啟動 row DnD、不寫資料。key 固定為 column＋ownerTaskId，不用 index／文字。 |
| A：雙擊內容／F2 | 只有具 canEditTask 的 description owner 可進入同一 td 的 cell editor；meeting 與 viewer 不可編輯。 |
| Enter／Ctrl+S／Cmd+S | dirty draft 提交一次；乾淨編輯直接結束且不寫資料。Enter 成功後移到同欄下一個可見 owner；save shortcut 留在來源格。 |
| Tab／Shift+Tab | 結束編輯並提交一次，焦點按當前 native DOM tab order 前進／後退，不新增跨欄 grid navigation；保存失敗不搶回焦點。 |
| 真正離開 editor 的 blur | 提交一次；editor 自己的必要 controls 內移焦不提交。非使用者操作的 unmount 不以 cleanup 自動保存。 |
| Esc | dispatch 前取消草稿，零 mutation；accepted 後不是 rollback，不顯示「已取消保存」。 |
| Alt+Enter／Ctrl+Enter／Cmd+Enter | 插入換行，不提交。composition 中 Enter／blur 不提交；compositionend 後僅處理已排定的真實離焦，不能保存半截中文。 |
| B：雙擊內容 scroll 區底邊 12px | 閱讀狀態 B 優先於 A，命中使用內容元素 rect；游標 row-resize，不加可見 handle。 |
| B：收合 → 展開 | 同一內容元素由 max-height=rowSpan×32px、overflow-y:auto，改成 max-height:none、height:auto、overflow-y:visible；原生 table 增高，外層捲動仍存在。 |
| B：展開 → 收合 | 恢復 bounded Y-scroll。已展開永遠可收合；未展開且內容未溢位時 no-op。多格可各自展開。 |
| 內容格右鍵／Shift+F10 | 按需出現短選單：可用時「編輯內容」與「展開全部內容／收合內容」。Esc 關閉回來源格；外部點擊關閉但不搶走被點目標焦點。 |

- 同時間只允許一個未完成 Goal 編輯 session。dirty editor 要切另一格 A 時先保存，成功後才開下一格；
  saving／unknown／error 未解決時不建立第二個 editor，提供目前 session 的恢復入口。
- A 沿用進入前 B 狀態；編輯期間底邊 B 停用，editor 內保留原生文字右鍵及選取。
- B／單擊／短選單本身只改 presentation，task／record persistence 都是零。
- task-name 的右鍵與 Shift+F10 仍走既有 GlobalContextMenu；內容格短選單只包含本地 cell action，不進 task action catalog。
- 只攔截本 cell 已處理的事件；鍵盤 Enter/F2 不冒泡觸發全域 task command。不要用全域 selectedTaskId 表示 current cell。
- td 保留 headers、rowSpan、tabIndex 與欄名＋任務名；aria-describedby 提供隱藏操作說明／展開狀態。
  不在 td 加 aria-selected／aria-expanded，不把 table 改成 grid。編輯器具 textbox 名稱及 multiline 語意，錯誤用按需 status/alert。
- 閱讀只保留一個 scroll／fit 元素；編輯只保留 Lexical 實際需要的 DOM。格線、padding、outline 由 td 承擔。
  不恢復日期 input 等既有扁平控制的純 layout wrapper；複合控制的實際互動結構保留。
- 所有原生 scroll owner 預設繼承共用系統捲軸基底：WebKit 寬／高 3px、Firefox `scrollbar-width:thin`、透明軌道、低對比滑塊且不顯示箭頭；不再由 Goal、Sidebar、Workbench、Board、Recycle Bin、Shared Task、Task Note、Kanban、WBS List 各自維護 class。
  `.no-scrollbar` 保留給產品明確要求隱藏捲軸的表面；`.scrollbar-gantt` 保留 12px／`scrollbar-width:auto`，因甘特圖是雙軸導覽且需要直接拖曳。展開內容仍移除內層 overflow，滾輪、拖曳與鍵盤捲動語意不變。

## 4. 第一則備註與 shared editor 契約

### 4.1 唯一正文及 pure helper

延用 [SPEC-066](SPEC-066-task-note-semantic-rich-text.md)：第一則 note 有 richContent 時，它是 canonical 正文；
content／description 均由同一 richContent 衍生。既有 `src/utils/taskNoteRichContent.ts` 增補以下 pure exports，不新增 taskPurpose.ts：

```ts
getTaskPurposeNote(node: Pick<TaskNode, 'detailNotes' | 'description'>): TaskDetailNote;
buildTaskPurposeUpdates(
  latest: Pick<TaskNode, 'detailNotes' | 'description'>,
  draft: TaskDetailNote,
): Pick<TaskNode, 'detailNotes' | 'description'>;
```

- 已有 notes：保留最新第一則的 id／title，只合併本次正文；其餘 notes 保留最新值、次序及 identity。
  無 notes：使用 note_default／任務目的，以 legacy description 初始化；只有真實內容或格式變更才 lazy upgrade。
- draft 只保存 note，不另存 plainText 副本。content 直接由 taskNoteRichContentToPlainText 產生，description 等於 content。
  清空得到空字串，禁止用 fallback 到舊 note.content 的讀取 helper 重建已清空正文。
- 無語意差異時重用最新 notes／note reference，使 store 的 shallow no-change 檢查有效。
- mount、focus、selection 與 Lexical 初始化正規化不是使用者修改。dirty 同時要求使用者正文／格式變更及與編輯起點的語意差異；
  修改後完整還原亦為 clean。不得因初始化 onUpdate 就 upgrade、寫入或新增 Undo。

### 4.2 同一 Lexical engine、不同 surface

`TaskDetailNoteEditor` 改用 discriminated props；原 details variant 為省略 variant 的預設，原 props／autosave 不變。
cell variant 最小介面如下，禁止為了重用傳入無作用的 onAdd／onDelete：

```ts
type CellNoteEditorProps = {
  variant: 'cell';
  taskId: string;
  note: TaskDetailNote;
  canEdit: boolean;
  onUpdate: (updates: Pick<TaskDetailNote, 'content' | 'richContent'>) => void;
  onCommit: (intent: 'enter' | 'blur' | 'tab' | 'shift-tab' | 'save') => void;
  onCancel: () => void;
};
```

- 共用 nodes allowlist、RichTextPlugin、History/List/Link、LinkSafetyPlugin 與 serializer；session identity 作 React key，
  不能讓前一個 note 的 initialConfig 留在下一個 cell。
- cell 不 render note header、toolbar、add/delete、card、resize handle；亦不讀寫 details 的高度偏好／localStorage。
  cell sizing 由 OwnedCell 的 scroll／fit contract 決定，不套 details 最小／最大高度。
- cell editor 的 paragraph 採 `min-h-5 leading-5`，與閱讀模式 `leading-5` 維持同一 20px 行距；cell heading 移除 details 專用的上下外距。
  details variant 繼續使用原 `editorTheme`，不改既有備註編輯器版面。
- cell 進入 A 編輯後在原生 `td` 標記 `data-goal-cell-editing="true"`，只保留 primary 淡底色與單一 2px inset 外框，
  editor 以淡白底與 caret color 區分，不再疊加內層 border／focus ring；shared cell editor 掛載後主動 focus contenteditable，避免 lazy render 時序讓編輯狀態不明顯。
- Ctrl/Cmd+S 由 cell key handler 保留；toolbar 隱藏不能連帶刪除 save、URL safety 或 rich-text 行為。
- pending 保存為 readonly；callback 交 session owner 做寫入，不讓 editor 直接呼叫 store。

## 5. Session、保存結果與恢復

### 5.1 最小責任邊界

```text
AppContent（同帳號生命週期）
  └─ GoalCellSessionProvider：唯一 draft／attempt／outcome
       ├─ GoalView：current cell、expanded keys、按需 cell menu
       │    └─ OwnedCell → shared TaskDetailNoteEditor(cell)
       └─ GoalCellRecoveryNotice：來源格不可見時的必要恢復列
                         ↓
             pure note mapping → useWbsStore.updateNode
```

新增 `src/components/GoalCellSessionProvider.tsx`，同檔 export provider／context hook／RecoveryNotice。
在 AppContent 的 view switch／Suspense 外掛載，以 userId 作 key；notice 放在 MainLayout 內容區，平常不 render。
這一層只有「editor DOM 可消失，但未完成寫入不能跟著消失」的生命週期責任，不是第二個業務 store。

- 單一 discriminated session：idle／editing／saving／error／unknown；含 account/workspace/board/task/note identity、
  原始正文 snapshot、draft note、一次 attempt identity 及必要錯誤。禁止再建 editingCell＋saveStateByCell 多份平行狀態。
- presentation state 只在 GoalView；換 board/view 清空 current／expanded／menu，filter/collapse 後剔除不存在 owner key。
  draft／accepted attempt 不因上述卸載而清空；重回同一可見來源格繼續同一 session。
- session 未結束前，僅對來源 description 的 sparse projection 輸入使用進入時非空值作 anchor，
  讓清空正文不立刻移除 owner／最後一欄。其他列、樹形、filter、collapse、meeting projection 仍照最新資料計算。
  anchor 不寫 store、不是舊正文 renderer；來源 task 被刪除／離開 scope 時不得造出不存在列。
- 若來源格因 filter、collapse、換 board/view 消失，保留 draft，notice 顯示來源識別與狀態。
  提供「複製內容」；settled error 可重試／放棄重試，未提交 draft 可捨棄；pending/unknown 不提供會假裝撤回已送出寫入的取消。
  使用者循現有導航回來源 board/Goal 並使 task 可見即接回原格；不自動清除 filter、展開任務樹或跳開新編輯面板。
- 保存成功／乾淨結束／dispatch 前取消才移除 anchor。Enter 的下一格以進入前可見 owner ID 次序定位並與最新 DOM 核對；
  來源欄消失時回來源 task name，task 亦消失時回表格可見入口。使用者已主動移焦／離開 view 時不遲到搶焦。
- session 僅記憶體；登出／換帳號清空，不能跨帳號暴露草稿。沒有 crash recovery／自動儲存草稿承諾。

### 5.2 Commit／retry 與結果

1. commit 前重讀最新 node；核對同帳號、workspace／board、task 未刪除／封存、第一則 note identity 及目前 scope 的 canEditTask。
   權限尚在 loading 或目前不在來源 board 時不得提交／重試；保留草稿，回來源 scope 且權限確定後才能重試。
2. 比較最新第一則正文與 session 原始正文；若編輯期間該正文已改變，標記 conflict，不用舊 draft 覆蓋。
   保留複製／捨棄後重開入口；只改其他 notes／第一則 title 則合併最新值。此為本機可見資料 guard，不是伺服器 CAS。
3. clean session 不 dispatch。dirty session 由最新 node 與 draft 生成同一 `{detailNotes, description}` payload，
   只呼叫既有 updateNode；一次 attempt 未 settled 前禁止再次提交。Intent 重複事件（Enter 接 blur）共用同一提交鎖。
4. 用 `onPersistSuccess` 判定任務已保存，`onPersistError` 判定保存失敗；仍訂閱 completion 並 catch rejection。
   前者已成功而 completion 後續失敗屬 meeting capture 異常，沿用現有錯誤通知，不將任務降格成未保存、不重送 task。
   completion 的 persisted 不等於 meeting capture 已通過端到端 QC。
5. 未取得保存結果超過 10 秒只提示「仍在儲存」並維持鎖定；沒有 callback 的異常 rejection 進 unknown。
   unknown 只允許複製與等待／明確提示重新載入可能丟失未確認內容，不自動重試、不猜成功。
   有效 callback 仍可結束該 attempt；observer 用 attempt token 防止處理過期 UI，不宣稱 token 能排序遠端寫入。
6. `accepted:false / missing_node` 為不可重試 error。`no_changes` 只表示本機無差異，不能清掉先前失敗或未確認保存。
   初次 clean 已由步驟 3 結束；dirty 意外收到 no_changes 時保留非成功狀態並重新核對，不循環自動重送。
7. 已知 failed 的手動 retry 先重新核對步驟 1；最新第一則正文須仍等於上次提交值，否則 conflict。
   重新合併最新其他 notes，使用 `forcePersistence:true, skipActivity:true`；無差異引用必須重用，
   store 僅把 pushUndo 限定在 hasChanges 時執行，避免空 Undo。不得直接 nodeService、私改 store rollback 或重送舊整份 notes。
8. 放棄重試只清除 session，不回滾已 optimistic 套用的值，也不能顯示「已保存」；文案說明尚未確認遠端保存。
   原有 Undo 是獨立任務命令，不是本 session 的私有取消。

保留既有 persistence 的跨頁／多使用者 last-writer 行為；本 DEV 不增加交易、寫入佇列、服務端版本鎖或全域 editor lock。
本地 guard 與一次 Goal attempt 只減少本 surface 競態，不保證跨 surface 同時寫入不互相覆蓋。

### 5.3 Meeting 與 reload safety

- 人工 quick-note aggregate 依 [SPEC-108](SPEC-108-task-detail-meeting-note-persistent-list.md) 唯讀；
  A 不直接呼叫 record write，B／選取不觸發任何 task/record mutation。
- live meeting 下，A 的 task change 可經 store 產生 DEV-109 capture，這是既有合法副作用，不是「record write 必須 0」。
  detailNotes／description 同一修改依原 capture mapper 去除 alias 重複；不新增人工 quick note。
  retry 不繞過原 capture，且不承諾失敗後補捕或 exactly-once；那是現有 capture 的限制，不在本 DEV 重構。
- provider 在必要 host DOM 暴露不含正文的 `data-goal-edit-session-state` marker。
  PwaReloadSafetyBridge 的既有 inline-editor owner 除 activeElement 外，亦檢查 dirty editing／saving／error／unknown marker，
  並隨 session 改變刷新 snapshot；不得另註冊相同 owner ID。manifest authority 補入 Goal session，surfaces 不改。
- 未完成 session 阻止自動 PWA reload；beforeunload 僅在 dirty/pending/error/unknown 掛載原生離頁提醒。
  不保證瀏覽器強制關閉、系統中止或使用者明確略過提醒後草稿仍存在；不新增 storage／service-worker 寫入。

## 6. Repo surface 與派工

| 檔案 | 允許變更／驗證責任 |
|---|---|
| src/components/GoalView.tsx | current/expanded/menu、OwnedCell A/B、projection anchor、focus、權限入口；span 演算法不改。 |
| src/components/GoalCellSessionProvider.tsx（new） | 第 5 節唯一 session、commit/retry、跨 view 恢復列、reload marker。 |
| src/components/TaskNotes/TaskDetailNoteEditor.tsx | 第 4 節 discriminated cell variant；details 行為等價。 |
| src/utils/taskNoteRichContent.ts | 兩個 pure purpose exports 與無差異引用重用；原 serializer authority 不變。 |
| src/App.tsx | AppContent 同帳號 provider placement、按需 RecoveryNotice；不改 route/auth 邏輯。 |
| src/components/PwaReloadSafetyBridge.tsx、src/services/pwaReloadOwnerManifest.ts | 既有 inline-editor owner 納入 Goal session；不新增 owner／SW protocol。 |
| src/store/useWbsStore.ts | 僅 updateNode 的 pushUndo 加 hasChanges guard；不得變更 persistence／meeting capture／回傳 API。 |
| src/components/TaskDetailsModal.tsx | 預設不改；如 discriminated props 需調整，只允許等價 wiring，不能改 autosave。 |
| src/index.css；既有原生 overflow consumers | 單一 3px 系統捲軸 token／base rules；移除重複 surface class，只保留 `.no-scrollbar` 與 `.scrollbar-gantt` 兩個語意例外，不新增 layout wrapper。 |

新 verifier：`scripts/verify-dev-119-goal-cell-actions.ts`、
`scripts/verify-dev-119-goal-cell-actions-browser.pw.js`，package.json 僅新增對應兩個 verify script。
既有 DEV-116 verifier 如含「永遠不能編輯／bounded」斷言，僅在本 candidate 增量更新被 SPEC-119 明確取代的部分；
歷史結果不回填。文件同步 SPEC-119、QA-DEV-119、dev_task、documentation_map，並補 SPEC-066／116 的 scoped target cross-reference。

| WP | 順序與退出條件 |
|---|---|
| WP-119-A | 先依 QA 建立 failing 契約及 fixtures；確認 dirty baseline ownership，不把 stub／空 cases 當 PASS。 |
| WP-119-B | pure note mapping、語意 no-op、clear、最新 notes 合併；純測試通過。 |
| WP-119-C | 同一 Lexical cell variant；DEV-066 details rich-text／browser 回歸通過後才能接 Goal。 |
| WP-119-D | session host、保存恢復、最小 Undo guard、PWA 整合與 OwnedCell A/B；負向生命週期可重現。 |
| WP-119-E | 執行 QA-DEV-119 與直接受影響回歸，保留 evidence，再由 QC 對固定 candidate 獨立驗證。 |

## 7. 驗收、架構結論與接手邊界

| Acceptance | 不可妥協的結果 | QA 對應 |
|---|---|---|
| AC-119-01 | A/B 如第 3 節，Y-scroll 可恢復、rowSpan 與扁平表格不退化 | B01–B04、V01–V04 |
| AC-119-02 | 一份 rich 正文、兩份一致 plain alias；no-op／取消不寫，其他 notes 不遺失 | P01–P03、B05–B07 |
| AC-119-03 | permissions、事件、IME、meeting readonly、task menu 與原生 table a11y 正確 | P04、B02–B04、B07–B08、B14 |
| AC-119-04 | 失敗／unknown／清空／換 view 不假成功、不丟恢復入口、不重送 stale notes | P05–P07、B09–B13 |
| AC-119-05 | live capture 邊界、PWA、安全回歸及可重現 QC evidence | P08、B15–B16、QA 第 5–7 節 |
| AC-119-06 | cell 編輯模式的段落行高／最小高度／上下外距與閱讀模式一致，不因進入編輯而放大行間距 | B04A、V02 |
| AC-119-07 | 進入 cell 編輯後，人眼可由 cell 淡底色、單一清楚外框、淡白 editor surface 與 caret focus 辨識 editing state，且不形成框中框 | B04B、V02 |
| AC-119-08 | 收合內容保留可操作但低干擾的 3px 簡約 Y-scroll；展開後移除內層捲軸，重複 B 可恢復 | B01、B08–B09、V02 |
| AC-119-09 | 系統原生 scroll owner 共用同一 3px 基底，且不增加 DOM 容器；隱藏式與甘特圖 12px 直接拖曳維持明確例外 | P18、S01–S02 |

R10 延續 R9 的本機實作，將 Goal 專用捲軸提升為低 specificity 的全系統 CSS 基底；原生 overflow surface 自動取得 3px、透明軌道、低對比滑塊與無箭頭，
並刪除重複 per-surface class。此方案不增加 React wrapper 或 UI 容器；`.no-scrollbar` 與甘特圖 12px 直接拖曳樣式維持語意例外，不改變必要 Y-scroll、scroll owner 或展開／收合邏輯。R7 同時依使用者回饋精簡實際操作中「編輯狀態線條過多」：同一 `td` 只保留一個 editing frame，
以淡白 editor surface 保留對比，不新增內層框線或額外容器；R6 的「進入編輯後 UI 不夠明顯」仍由 editing data state、caret 與穩定 focus 解決，
並修正 lazy editor 掛載後焦點不穩定；R5 的「進入編輯後多行內容行距變大」仍由 cell variant 緊湊 Lexical paragraph theme 解決，
details variant 維持原版面；同時保留 R4 已修正的「展開後再次雙擊 td 不易命中」：B 直接由內容 scroll 元素判定，
底邊命中區由 6px 放寬至 12px，事件在內容元素完成 toggle 後停止冒泡；同一 Lexical cell variant、pure purpose mapping、Goal-local A/B presentation、
AppContent 生命週期 session、保存 callback／completion 分流、最小 Undo guard 與既有 PWA inline-editor owner 整合。
不新增 editor engine、task command、業務 store 或持久化資料模型；meeting aggregate 仍唯讀，task／record／capture 責任仍分離。

本機 candidate 已完成 targeted QA/QC：DEV-119 static 18/18、browser 17/17（含 B01 Goal 3px、S01 Workbench 3px、S02 Gantt 12px 例外的 computed-style，以及 B04A 行距與 B04B editing state 量測），並通過 DEV-066、DEV-108、DEV-109、
DEV-114、DEV-116、DEV-097 相關 static／browser 回歸、TypeScript、build 與 ESLint（0 errors）。完整 failure injection、
權限撤銷／跨 view 恢復矩陣與正式環境 release gate 不在本輪 PASS 宣告內。
若需改 schema/API、permission authority、rowSpan ownership、meeting capture 語意、全域 task command、
服務端 concurrency，或新增本文以外的跨模組責任，停止並回 PM 更新 scope，不自行擴大 DEV-119。

Source candidate：branch `持續優化3`、HEAD `e335eaa07c14313afb5a27607a2c009ace3bcbc3`、working tree；關鍵檔案 SHA-256：

- `src/components/GoalView.tsx` `056AC9BAAC9D68F5A13298D62E361A1836CA11F878B9437DAAF05E7281A407DB`。
- `src/components/GoalCellSessionProvider.tsx` `3c292fc301bff7d5e748b61e8576a925b6afd5c2bbe9ed9768c5a56d6ace5da3`。
- `src/components/TaskNotes/TaskDetailNoteEditor.tsx` `3372b61ea78e88961d14aac047bb9f7e379b55ccce277b6c582b04514d587265`。
- `src/index.css` `1D41BFCC12610FCDF5143034545B918E34759EDC18986B36D91D43DF00BF34F9`。
- `src/components/BoardView.tsx` `05E8B62B6AE62CF7F38CF9DF836EDF03960C50C62478E6D6D2EB55052189AD92`。
- `src/components/RecycleBinView.tsx` `5F42548480C4DB1DAAE8BF0CE3001AB56623BEBFAAA5FF997B37A7D464B9AD3B`。
- `src/components/SharedTaskSidebar.tsx` `F2CC428BD78F31343F3584A3771FE60E071EBF317AA0DC9F4D3B4F75F188DC45`。
- `src/components/Sidebar.tsx` `E869073D0E96DE625501B91ABCA3DE08639F43322D6F9E59F9ED13B65CD958D6`。
- `src/components/TaskWorkbenchPanel.tsx` `F041D13E808330799A281C7B6EB0F423766D9F3DD82803DFC34ED06F253B1DA0`。
- `src/components/TaskNotes/TaskNoteContentSurface.tsx` `248CBD6014C5045ADDEB46A5EE010536BF7909D314596B55FE129B271428FBC7`。
- `src/components/Wbs/KanbanColumnPresentation.tsx` `6AD3556B21D620E0C7D1EAFB4A9DC097BCC803E24E2D8975ECB1539C5B631B25`。
- `src/components/Wbs/WbsListView.tsx` `D5A34EDD94D7133A183BAD683C212BF892D8A6B90E1E539ECCED29D346FE8C74`。
- `src/utils/taskNoteRichContent.ts` `b4b63e619365ceac2777c80897956126a1042c11881354a3060d39c407900509`。
- `src/store/useWbsStore.ts` `96e32bc8de3e4deb86dffa34fef7bf0e8e7f43040e804580d21c4e180de34af6`。
- `scripts/verify-dev-039-task-workbench-placement-lanes.mjs` `E24C30C447C2252F6487FF3FD36E906DBC88D1134DF19E6239F30A95AECFF380`。
- `scripts/verify-dev-108-task-meeting-note-persistent-list.ts` `AA5B99944D08C9DA6BD268DC019994D3316773D2E4AC1172C5C1A73548635AD2`。
- `scripts/verify-dev-113-task-note-autosize-board-width.ts` `88B2318EEDF4416EAE53EBAA0103A249DE3D7054AEA7BBAAB2E1CBF3B00C1197`。
- `scripts/verify-dev-119-goal-cell-actions.ts` `2778F58647E4969F4A2DFEE71F146E65DEF2AC2F9B7208AFAD0AF7B0044606A4`。
- `scripts/verify-dev-119-goal-cell-actions-browser.pw.js` `4469854B9C6467325B40C5B52C028C5F187CF921CCA79D201F5F63465B80C670`。
- `scripts/verify-resizable-navigation-panels-browser.pw.js` `EADAB748B6AFC8D9BD4F6FF344EFBE149F04BA5D2C860A996A7A1B05EBB63CC1`。

上述 hashes 是本輪 candidate 證據，不代表已 commit；保留使用者既有 dirty diff，不 reset／覆蓋／commit／push／deploy／release。

使用思考習慣：#效用理論、#限制條件、#系統描繪
