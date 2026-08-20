# SPEC-079：心智圖右鍵選單建立關聯線

狀態：`Implemented / QA-QC PASS / 未 Release`

## 目的

在心智圖任務節點的右鍵操作選單加入「建立關聯線」，讓使用者以目前右鍵選取的節點作為關聯線起點，再點擊另一個節點完成既有的關聯線建立與標籤編輯流程。

## 範圍與權威

- 只新增心智圖 `mindmap.node` task context menu action；清單、看板、甘特圖、行事曆不顯示此動作。
- 沿用既有關聯線 draft、endpoint selection、inline label editor、permission guard、Escape cancel 與 persistence contract。
- 不新增資料欄位、storage shape、API、schema 或 release 行為；`SPEC-027C`／`SPEC-027E` 仍是關聯線互動與幾何 authority。

## 驗收條件

- AC-001：心智圖任務右鍵選單可見 `[data-task-action-id="task.create-relationship"]`，顯示「建立關聯線」及起點提示。
- AC-002：動作以右鍵節點作為 source，關閉選單後啟用既有關聯線工具並保留節點選取。
- AC-003：點擊第二個節點後使用既有 inline label editor；送出標籤可看到具備正確 `fromNodeId`／`toNodeId` 的關聯線。
- AC-004：Escape 可取消由右鍵動作啟動的 transient relationship mode；不可建立自連線。
- AC-005：不可編輯任務時動作維持 disabled；非心智圖 task menu 不顯示此動作。
- AC-006：1440、1024、390 viewport 不出現可見錯誤、request failure 或新增水平溢位。

## 實作契約

- `task.create-relationship` 使用 `edit` capability、`transient` kind，歸入 create section。
- `GlobalContextMenu` 以 `start-mindmap-relationship` DOM event 將 task id 傳給已掛載的 `MindMapView`，並以 `preserveTaskSelection` 關閉選單。
- `MindMapView` 收到 event 後呼叫既有 `beginRelationshipDraftSelectionWithCleanup` 並啟用 `relationshipToolActive`；其餘 endpoint、label、cancel 行為不另建第二套流程。

## 停止條件

若右鍵動作影響既有新增／刪除／開啟明細、權限 disabled、關聯線選取／標籤、Escape cleanup、非心智圖 menu 或 responsive boundary，停止並回 PM；需要 schema／API／permission model 變更時不在本 DEV 範圍內。
