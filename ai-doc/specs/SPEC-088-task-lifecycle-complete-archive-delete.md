# SPEC-088：任務完成、封存與永久刪除生命週期

- 狀態：RD Implemented / QA-QC PASS / Human Confirmed / 未 Release
- 日期：2026-08-25
- 關聯：DEV-088、DEV-029、DEV-038、DEV-044、DEV-062、DEV-070
- 節點類型：交付點
- 風險：Medium（跨任務入口與不可逆刪除；不改 schema、API 或角色來源）
- Spec Impact：`Intentional replacement`

## 1. 決策與目標

使用者明確採用以下任務生命週期：

`完成／取消完成` → `封存` → `永久刪除`

完成是可切換狀態；封存是可還原的 active-board 移除；永久刪除是不可復原的資料刪除，而且只能從目前看板回收桶執行。此規格取代 DEV-029、DEV-038 與 DEV-070 中把軟封存稱為「刪除任務」的舊 UI 與 action 語意。

## 2. 狀態轉換

| 來源 | 動作 | 結果 | 是否可逆 | 入口 |
|---|---|---|---:|---|
| 未完成、active | 完成 | `status = completed` | 是 | 任務狀態控制、mobile action rail |
| 已完成、active | 取消完成 | 回到既有未完成狀態契約 | 是 | 任務狀態控制、mobile action rail |
| 任一 active 狀態 | 封存 | `isArchived = true`；從 active views 隱藏 | 是 | 任務選單、心智圖、mobile action rail |
| 已封存 | 還原 | `isArchived = false`；保留原身分與關聯 | 是 | 目前看板回收桶 |
| 已封存 | 永久刪除 | 從持久層與前端狀態移除 | 否 | 目前看板回收桶 |

完成與封存是正交狀態：已完成任務可封存，還原後仍保留封存前的完成狀態。封存不得刪除 dependency；還原後原關聯必須仍存在。永久刪除才清除命中任務／子樹與相關 dependency。

## 3. UI 與互動契約

- active task surfaces 不得顯示「刪除任務」；一律顯示「封存任務」或最短等價名稱。
- mobile compact action rail 保留四項：完成／取消完成、新增並列、新增子任務、封存任務。
- 封存使用中性 archive 語意與樣式；不得使用紅色 trash affordance 冒充永久刪除。
- 回收桶使用「封存任務」「封存時間」；提供「還原」與紅色「永久刪除」。
- 永久刪除前必須顯示目標任務與影響數量，並明確說明無法復原。
- 清空回收桶前必須顯示看板名稱、永久刪除數量與不可復原警告。
- 一般 active task surface 不得提供永久刪除捷徑。

## 4. 資料與失敗契約

- `archiveNode` 只更新 `isArchived`，不得先移除 dependency。
- `permanentlyDeleteNodes` 只接受已封存 root；以 cycle-safe canonical parent 關係收集其子樹並去重。
- 永久刪除先清理命中子樹相關 dependency，再以 leaves-first 刪除 task rows；所有持久層操作成功後才更新前端狀態。
- 持久層失敗時回收桶項目保持可見並顯示錯誤，不得以成功畫面掩蓋失敗。
- 永久刪除不建立一般 undo command；封存與還原維持既有 undo／recovery 能力。
- 本 DEV 不執行 production migration、production delete、deploy 或 release。

## 5. 權限與相容性

- 沿用既有 `delete_task`／`canDeleteTask` capability，UI 名稱改為「封存／永久刪除任務」；本 DEV 不拆新 role capability。
- 完成／取消完成仍使用 edit capability。
- `task.delete-request` 改為 `task.archive`；mobile action key `delete` 改為 `archive`。舊 key 不再由現行 UI 發出。
- `TaskStatus`、`isArchived`、Supabase schema、Firestore collection 與 local-test storage shape 不變。

## 6. Scope / Out of Scope

Scope：任務選單、心智圖封存、手機 action rail、WBS store、目前看板回收桶、權限顯示名稱、targeted verifier 與受影響 active specs。

Out of Scope：Workspace／Board lifecycle、retention 天數、自動清除、audit event 新型別、批次跨看板回收桶、production migration／deploy、角色 capability 拆分。

## 7. Acceptance Criteria

- AC-088-001：所有 active task surface 只顯示「封存」，沒有「刪除任務」。
- AC-088-002：完成與取消完成仍可切換，且不會自動封存。
- AC-088-003：封存後任務從 active views 消失並出現在目前看板回收桶。
- AC-088-004：還原後 task identity、status、parent 與 dependency 保留。
- AC-088-005：永久刪除只能從回收桶觸發，且需要不可逆確認。
- AC-088-006：確認永久刪除後，命中子樹及其 dependency 從持久層與前端狀態移除。
- AC-088-007：取消或持久層失敗均維持原封存項目；沒有假成功。
- AC-088-008：回收桶文案使用封存／永久刪除語意，桌機與窄版無溢出、遮擋或不可辨識的 icon-only 控制。
- AC-088-009：TypeScript、targeted verifier、既有 DEV-029／038／044／062／070 regression 與真實 browser flow 通過。

## 8. 治理結論

ADR not needed：使用者已直接選定單一路徑，既有 `status`／`isArchived` 與回收桶足以承接，不新增 schema、外部 API 或新 permission model。SPEC-088 是現行生命週期 authoritative source；受影響舊規格只保留歷史理由。

## 9. DEV-093 compatible extension（2026-08-28）

「典藏任務」不新增第四個 task endpoint 或 status。SPEC-093 的 dedicated transaction 先建立不可變 asset，並在同一 durable commit 把來源 root 設為 `isArchived=true`；後續仍由本規格的回收桶還原／永久刪除承接。典藏使用新 `collect_task` capability，不改本規格既有 `delete_task` 對一般封存／永久刪除的 authority。來源 task 永久刪除不得刪除 task_collection snapshot；來源 board 刪除仍會依現行 board-scoped cascade 刪除典藏，確認畫面需揭露數量。
