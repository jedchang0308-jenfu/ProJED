# SPEC-027E: Xmind-like Note Relationship Line UX Parity

日期：2026-06-19
狀態：Implemented / Browser QC Passed
關聯 DEV：DEV-027C
優先級：P1 UI/UX parity

## 背景

DEV-027C 已在 ProJED 心智圖模式加入「筆記型關聯線」：使用者可在兩個任務之間建立一條只有筆記用途的關聯線，該關聯線不產生任何任務依賴或功能連動。

使用者要求進一步比對 Xmind Relationship 功能後，補齊 ProJED 在 UI/UX 上不像 Xmind 的地方。本 DEV 將 ProJED 的筆記型關聯線從「功能存在」提升為「可直接操作的圖形物件」。

Xmind 參考來源：
- Xmind Relationship user guide：`https://xmind.com/user-guide/relationship-new`
- Xmind Mind Mapping feature page：`https://xmind.app/mindmapping/`
- Xmind Text user guide：`https://xmind.com/user-guide/text-new`

## 目前 ProJED 與 Xmind 的差異

| 面向 | Xmind 行為 | ProJED 目前行為 | 差距 |
|---|---|---|---|
| 建立方式 | 可選 topic 後按 Relationship、Insert menu、選兩個 topic、快捷鍵建立 | 只能按心智圖 toolbar 的關聯線按鈕，再依序點兩個任務 | 建立入口不足，肌肉記憶不接近 Xmind |
| 文字編輯 | 選取後按 Space、雙擊、右鍵 Edit，可直接在關聯線文字上輸入 | 使用 modal / prompt 輸入文字 | 不像畫布原生物件，打斷心智圖操作流 |
| 選取命中 | 關聯線本體是可選取物件 | 主要靠 label 附近透明 hitbox，線條本體不吃 pointer event | 點線選取不直覺 |
| 端點調整 | 選取後顯示 circular endpoints，可拖端點改連接位置或改連到其他 topic | endpoint 只是顯示用圓點，不能拖 | 無法調整連接位置 |
| 曲線調整 | 顯示 square control points，可拖曳改線條形狀 | 無 control point | 無法整理交叉線與曲線 |
| 樣式設定 | Format panel 可調線型、粗細、顏色、箭頭、文字樣式 | 固定藍色、固定虛線、固定單端箭頭、固定文字樣式 | 視覺表達能力不足 |
| 刪除 | 選取後 Delete 或右鍵 Delete | 選取後 Delete 可刪除 | 部分接近 |
| 空白處建立 floating topic | 可點空白處建立 floating topic 並連線 | ProJED 無 floating topic 概念 | 本輪不納入，避免破壞 WBS 任務模型 |

## 產品原則

1. 關聯線仍是「筆記型關聯線」，不產生任務依賴、不改任務狀態、不影響排程。
2. 關聯線應像 Xmind 的 Relationship 一樣成為可選取、可編輯、可調整的畫布物件。
3. 若任務刪除、封存、filter、collapse 造成端點不可用：
   - 任務資料不存在或封存：可刪除殘缺關聯線。
   - 任務只是 filter / collapse 隱藏：不刪除資料，只暫不顯示或顯示可恢復狀態。
4. UI 不得犧牲 DEV-027A/027B 已修好的 connector tidy topology、drag preview、zoom clarity。

## 開發範圍

### Phase 1：直接操作與文字編輯

- 關聯線本體與 label 都可點選。
- 選取狀態要明確：
  - 線條高亮
  - endpoints 顯示
  - label 呈現 active 狀態
- `Delete` / `Backspace` 刪除選取關聯線。
- `Escape` 取消選取或取消編輯。
- `Space` 進入關聯線文字 inline edit。
- 雙擊關聯線或 label 進入 inline edit。
- `Enter` commit，blur commit，`Escape` rollback。
- 建立後預設可立即輸入文字，且不使用 modal / prompt 作為主流程。

### Phase 2：端點與曲線控制

- 選取關聯線時顯示：
  - circular endpoints
  - square control points
- 端點可沿任務節點邊緣拖曳，調整連接位置。
- 端點可拖到另一個任務上，完成重新連接。
- control point 可拖曳調整 Bezier 曲線。
- 拖曳時要有即時 preview，不得等 mouseup 才更新。
- zoom 下端點、control point、曲線位置必須穩定。

### Phase 3：Xmind-like 樣式控制

- 選取關聯線後顯示格式控制區，優先採右側 Format Panel；若現有 layout 不適合，先用選取關聯線附近的 compact popover，但需保留未來升級 panel 的資料結構。
- 可調整：
  - 線條顏色
  - 線條粗細
  - 實線 / 虛線
  - 箭頭方向：無、單向、雙向
  - label 字體大小
  - label 顏色
- 提供 Reset Style，回到 ProJED 預設樣式。

### Phase 4：建立入口補齊

- 選取任務後按 toolbar 關聯線：以選取任務作為起點。
- 未選任務時按 toolbar 關聯線：進入依序選起點、終點模式。
- 支援快捷鍵：
  - Windows：`Ctrl+Shift+R`
  - Mac：`Shift+Command+R`
- 任務右鍵 context menu 增加「建立關聯線」。
- 支援先選兩個任務再建立關聯線；若現有心智圖尚無多選，列為後續子項，不阻塞 Phase 1-3。

## 非範圍

- 不做任務依賴關係。
- 不做 critical path / 排程連動。
- 不做 Xmind floating topic，除非 ProJED 另開 WBS 外自由節點模型。
- 不做 summary boundary、marker、attachment、image。
- 不做 Xmind 匯入/匯出。

## Data Contract

現有 `MindMapNoteRelationship` 至少需可延伸下列欄位：

```ts
interface MindMapNoteRelationship {
  id: string;
  boardId: string;
  fromId: string;
  toId: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  style?: {
    strokeColor?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    arrowStart?: boolean;
    arrowEnd?: boolean;
    labelColor?: string;
    labelFontSize?: number;
  };
  geometry?: {
    fromAnchor?: { xRatio: number; yRatio: number };
    toAnchor?: { xRatio: number; yRatio: number };
    controlPoints?: Array<{ x: number; y: number }>;
  };
}
```

資料仍不得包含 dependency semantics，例如 `dependencyType`、`fromSide`、`toSide`、critical path 欄位。

## 驗收標準

- 關聯線可直接點選，不需點 label 附近透明區才選得到。
- 選取後可看到 endpoints 與 control points。
- 雙擊線或 label 可 inline 編輯文字。
- 選取後按 Space 可 inline 編輯文字。
- 建立關聯線後可連續輸入 label，不跳出 modal 作為主流程。
- 拖曳 endpoint 可改連接位置；拖到另一任務可改連接對象。
- 拖曳 control point 可改曲線，畫面即時 preview。
- 樣式 panel / popover 可改線條顏色、粗細、線型、箭頭、label 文字樣式。
- Delete / Backspace 可刪除選取關聯線。
- zoom 50% 到 200% 下 hitbox、endpoints、control points、label 不偏移。
- DEV-027B keyboard / drag / tidy connector browser regression 需通過。
- DEV-027D date badge filter browser regression 需通過。

## RD Exit Gate

- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity`
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`
