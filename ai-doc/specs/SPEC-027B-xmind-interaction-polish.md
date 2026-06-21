# SPEC-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview polish

日期: 2026-06-19
狀態: Implemented / Browser QC Passed
父層 DEV: DEV-027
類型: P0 UI quality reopen

## 背景

DEV-027B 補強 ProJED 心智圖模式，使 WBS 任務操作更接近 Xmind。使用者新增最新要求：Xmind 在新增任務後不會立即進入任務名稱編輯模式，而是只選取新任務；此時仍可用方向鍵移動選取，並可在選取任務上直接打字進入改名。

本規格以「新增後只選取，不立即進入編輯」作為鍵盤互動核心。舊版「新增後自動開啟 rename input」與「rename input 內 Enter/Tab 連續新增」不再是需求，且不得作為驗收條件。

## UX 規格

### 1. 新增後只選取，不立即進入編輯

- 點擊新增 root、按 `Enter` 新增同階任務、按 `Tab` 新增子任務後，系統只選取新任務。
- 新任務不得自動開啟 rename input。
- 新任務仍以預設名稱顯示，例如 `新任務`。
- 焦點必須留在心智圖任務節點上，讓下一個鍵盤操作可以立即接續。

### 2. 連續新增任務

- 在選取任務上按 `Enter`，於目前任務下方建立同 parent、同 level、同 side 的同階任務。
- 在選取任務上按 `Tab`，於目前任務下方建立子任務。
- 因為新增後新任務保持選取，使用者可連續按 `Enter` 或 `Tab` 連續建立多個任務。
- 連續新增不依賴 rename input；這是選取狀態下的 keyboard command。

### 3. 方向鍵移動選取

- `ArrowUp` / `ArrowDown`：依目前畫面可見任務順序移動到上一個或下一個任務。
- `ArrowLeft`：選取目前任務的 parent；若已是 root，維持目前選取。
- `ArrowRight`：若目前任務有子任務，展開並選取第一個子任務。
- 方向鍵移動不得建立任務、不得開啟 rename input。

### 4. 直接打字改名

- 任務被選取且非編輯中時，直接輸入一般文字鍵會進入 rename mode。
- rename input 的初始內容應包含使用者第一個輸入字元，避免第一個字被吃掉。
- `Enter` 在 rename input 中只 commit 名稱；不建立下一個同階任務。
- `Escape` 在 rename input 中取消編輯。
- `Ctrl` / `Alt` / `Meta` 組合鍵不得被誤攔截為改名。

### 5. Zoomable high-resolution canvas

- 心智圖畫布支援 zoom in、zoom out、reset 100%、fit to content。
- Zoom 後文字、節點邊框、connector、selection ring、drag preview 不得模糊、錯位或失去 hit target。
- Connector endpoint 必須在 zoom 後仍貼齊節點邊緣。

### 6. Tidy connector topology

- parent-to-child connector 採用 tidy bracket / shared trunk 拓撲。
- parent + 5 children 的 fixture 必須呈現整齊的垂直 trunk，不得出現殘破短線、交錯線、穿過節點或孤立 segment。
- collapse / expand、zoom、scroll、drag 後 connector geometry 必須重新計算。

### 7. Drag insertion preview fidelity

- 拖動任務時必須即時顯示 ghost node、insertion placeholder 與 intended connector。
- Preview 必須明確呈現將落在 parent、before sibling、after sibling 或 root side。
- Preview metadata 必須包含 `targetParentId`、`siblingBeforeId`、`siblingAfterId`、`dropPosition`、`direction`。
- Mouseup 後實際 parent / order / side 必須與 preview 一致。

## 不在本輪範圍

- Xmind 匯入 / 匯出。
- marker、relationship、summary boundary、style panel。
- AI 自動生成心智圖。

## 驗收條件

- 新增任務後沒有 `data-mindmap-title-input`。
- 新增任務後 `aria-selected="true"` 落在新任務。
- 連續 `Enter` 可建立 5 個同階任務，且每次新增後新任務保持選取。
- 連續 `Tab` 可建立 child -> grandchild。
- `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` 可移動選取。
- 直接打字可進入 rename mode 並成功改名。
- Zoom、tidy connector、drag insertion preview 的 DEV-027B 既有 gates 必須維持通過。
