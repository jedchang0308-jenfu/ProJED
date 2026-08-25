# SPEC-086 全域工作台子樹暫存與跨看板搬移

日期：2026-08-25
狀態：Authoritative／Mobile touch addendum Implemented／QA-QC PASS／未 Release
關聯 DEV：DEV-086／DEV-039／DEV-053／DEV-065
來源：`USER-20260825-GLOBAL-WORKBENCH-SUBTREE-STAGING`、response annotations 與 `USER-20260825-UNPLACED-INSERTION-PREVIEW`

## 目標與使用者價值

全域工作台的「未歸位」區是跨工作區、跨看板的帳號級暫存面。使用者可把目前看板的任務拖入未歸位區，切換工作台目的看板，再把任務拖回目的看板；若來源任務有子任務，整棵子樹一起搬移並保留父子關係。

這不是新增第二套任務模型。任務 ID、標題、狀態與子樹結構維持原值，只改變 placement；已歸位清單仍是查閱面，不成為拖曳來源。

## Spec Impact

`Intentional replacement`：2026-08-25 使用者要求把看板→未歸位、整棵子樹與共用定位線補進手機版；手機不導入子樹 hover 等價效果，也不因此開放清單／甘特／日曆模式。

- 擴充 DEV-039 的單向「未歸位 → 看板」為雙向 staging flow。
- 沿用 DEV-053 的 task drag payload、drop intent 與看板手感；沿用 DEV-065 的來源列＋完整子樹非語言 hover 預覽。
- 未歸位有效落點直接使用看板既有 `KanbanInsertionMarker`，不複製圓點、線條、顏色或尺寸 token。
- 手機沿用既有 500ms 長按拖曳 session；看板來源進入未歸位 lane 時由同一 mobile target adapter 產生 append intent，不另建 touch-only 任務模型。
- 已歸位工作台列的唯讀／不可拖契約不變；只有未歸位列可從工作台開始拖曳。
- 不改 task schema、API、permission、任務 ID 或帳號隔離；未歸位 JSONB 已可保存完整 `TaskNode`。

## 來源與目的矩陣

| 拖曳來源 | 目的地 | 結果 |
|---|---|---|
| 看板 L1／L2／L3+ 任務 | 工作台未歸位區 | 桌機 pointer／手機長按 touch 皆允許；整棵 canonical、未封存子樹進入全域暫存 |
| 工作台未歸位任務 | 工作台選定看板的已歸位投放區 | 允許；整棵子樹進入該看板，root 成為頂層任務 |
| 工作台未歸位任務 | 當前看板的合法精確目標 | 允許；root 依 drop intent 定位，descendants 保留父子關係 |
| 工作台已歸位列 | 任意目的地 | 禁止；列維持唯讀且沒有 drag surface |
| 看板任務 | 工作台已歸位清單內容列 | 禁止；只有明確投放區可接收 |

## 資料與交易不變量

1. 子樹範圍以來源 root 的 canonical `parentId` 關係計算，只包含同來源 workspace／board 且未封存的節點。
2. 看板進入未歸位時，root 的 `parentId=null`；所有 descendants 保留原有 `parentId`，每個節點的 `boardId` 改為未歸位 sentinel。原 `workspaceId` 可保留作來源 metadata，但不得拿來限制全域清單範圍。
3. 未歸位回看板時，每個節點寫入目的 `workspaceId`／`boardId`；root 依 drop intent 指定 parent／order／node type，descendants 保留原 parent link。
4. 未歸位資料正規化與遠端讀回不得清除非空 `parentId`。
5. 本地狀態以單一 batch 更新並形成一個 undo entry，不得逐節點產生多次部分狀態。
6. 寫入未歸位採 leaves-first；回看板採 root-first。單節點跨儲存面時必須先建立／保存目的資料，再刪除來源資料，避免搬移失敗造成任務遺失。
7. undo／redo 對整批子樹生效，並反轉必要的持久化拓樸順序。
8. orphan／cycle 資料不得造成無限遞迴；無法掛入可見 root 的節點以安全 root 呈現，且每個 ID 最多投影一次。

## 全域範圍與權限

- 未歸位區以目前帳號為作用域，不綁定單一工作區；所以可先從工作區 A／看板 A 暫存，再在工作區 B／看板 B 歸位。
- 歸位時仍使用目的工作區／看板的既有編輯權限與資料服務；本 DEV 不放寬權限。
- 已歸位列只提供搜尋、檢視與狀態資訊；不因跨工作區能力而取得 drag handle。

## UI 契約

- 未歸位子樹使用與看板 L3+ checklist 相同的精簡段落語言：單列約 20px、12px 字級、tight line-height、無卡片框中框。
- desktop 每層縮排 6px；窄 viewport（≤767px）每層 5px；數值由 `SPEC-001` 的跨模式 `--task-hierarchy-indent` 治理，工作台不另設例外。
- 每棵 root 只畫一條低對比階層 rail；不得為每一層新增容器框。
- 搬入未歸位的 L1 group 必須可見，不受已歸位清單的「顯示列表／群組」篩選影響；否則投放後會看似消失。
- desktop hover／drag preview 用來源列框與完整 descendant subtree 框表示範圍，不顯示「含 N 個子任務」等文字；手機不提供 hover 或長按子樹框選等價效果。
- 看板任務進入未歸位有效投放區時，在實際 append 邊界顯示一個 horizontal compact `KanbanInsertionMarker`；未歸位為空時顯示在第一個落點，已有任務時定位線中心貼齊最後一列底邊。
- 手機 marker 由既有 `TaskDragPresenter` 呈現，使用 `workbench-unplaced-lane` target kind 與同一個 `KanbanInsertionMarker`；不得回到 lane highlight-only。
- 定位線必須使用零高度 overlay anchor，不得推動任務列、空白狀態或捲動容器；離開投放區或完成 drop 後立即移除。空白提示可在有效命中期間隱藏，但幾何位置必須保留。
- 共用 `data-task-surface-*`、`data-desktop-task-hover-scope`、checklist depth 與 `--task-hierarchy-indent` 展示契約；不直接掛載含看板 context、store mutation、selection 與 DnD owner 的 `KanbanChecklist` 元件。
- 已歸位列維持現有排版與 `data-task-workbench-readonly-task-card="true"`，且不得具有 drag-surface attribute。

## 失敗與恢復

- 目的儲存失敗時不得先刪除來源；錯誤沿既有 persistence error path 回報，本地 optimistic batch 可由 undo 或重載 canonical 資料恢復。
- 任一節點缺少合法目的 board／workspace、來源不是可拖 surface、或目的不是明確 lane／board target 時，drop 必須 no-op。
- 不允許只搬 root、留下 descendants 指向不存在父節點，或在來源與目的各殘留一份同 ID 任務。

## Out of Scope

- 不提供已歸位列直接拖曳、跨帳號搬移、複製任務、拆散子樹、批次勾選或新文字說明。
- 不導入手機子樹 hover／長按框選預覽；手機只保留拖曳卡與落點定位線。
- 不因本 addendum 開放手機清單、甘特或日曆模式；這三種模式的 5px 縮排不列入手機交付。
- 不新增資料庫 migration、task identity、權限模型或正式環境 release。
- 不在本輪 commit、push、PR、merge、deploy 或寫入 production data。

## 驗收標準

- AC-086-001：看板 L1／L2／L3+ 任務可用桌機 pointer 或手機長按 touch 拖到未歸位投放區。
- AC-086-002：來源 root 有 child／grandchild 時，未歸位區同時出現整棵子樹且深度為 0／1／2；L1 group 搬入後亦保持可見與原 node type，L2 descendants 一起暫存。
- AC-086-003：暫存後 root parent 為 null，descendant parent links 與任務 ID 不變。
- AC-086-004：跨工作區切換工作台目的看板後，拖回已歸位投放區會把全子樹寫到目的 workspace／board。
- AC-086-005：歸位後 parent links 為 root null、child→root、grandchild→child；目的看板能正常承接階層。
- AC-086-006：已歸位工作台列唯讀、無 drag surface，不能作為拖曳來源。
- AC-086-007：desktop 未歸位列高 ≤21px，每層實際縮排 6±1px；窄 viewport token 為 5px。
- AC-086-008：hover 同時標示來源列與完整子樹；DOM／畫面沒有 descendant-count 文字。
- AC-086-009：未歸位正規化與遠端 round-trip 保存 `parentId`。
- AC-086-010：batch update 是單一 undo 單位；目的先寫、來源後刪，且 root-first／leaves-first 順序符合方向。
- AC-086-011：DEV-039、DEV-044、DEV-053、DEV-065 targeted regressions 與 TypeScript 通過。
- AC-086-012：實際瀏覽器流程沒有 page error；三張 desktop／narrow／restored 截圖可人工確認版面與結果。
- AC-086-013：拖入未歸位時直接呈現共用 horizontal compact `KanbanInsertionMarker`；empty／populated 兩種狀態都不造成 layout shift，populated marker 中心與最後一列底邊誤差 ≤1px，離開／重新進入／放開生命週期正確。
- AC-086-014：390×844 與 320×844 touch emulation 均能完成看板 parent→未歸位；root／child／grandchild 同批移動、parent links 保留、定位線在 viewport 內，drop 後 transient marker／preview／action rail 清除且無可見錯誤或文件級水平溢出。
- AC-086-015：手機不呈現 subtree hover scope；`list`／`gantt`／`calendar` 仍維持 mobile board-only gate，不列為本 addendum 缺陷。

## 驗證命令

- `npm.cmd run verify:dev-086-task-workbench-subtree-transfer`
- `npm.cmd run verify:dev-086-task-workbench-subtree-transfer-browser`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser`
- `npm.cmd run verify:dev-044-undo-coverage`
- `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency`
- `npm.cmd run verify:dev-065-task-subtree-hover-preview`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`
