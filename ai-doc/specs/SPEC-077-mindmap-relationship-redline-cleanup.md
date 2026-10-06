# SPEC-077 心智圖關聯線多餘導引線清理

> 2026-08-25 使用者澄清：原紅線只要求刪除控制 UI 多畫的一條線，沒有要求移除控制臂或方形控制點。先前規格與實作誤讀已由 DEV-085 修正；本文件以下內容是校正後的 authoritative intent。

## 需求與邊界

使用者提供的心智圖截圖以紅線標示「選取關聯線後」控制 UI 多畫的一條線。本需求只移除多餘的中央導引線：

- 移除 `control-1 → control-2` 之間的中央輔助導引線。
- 不移除 `endpoint → control point` 的兩側控制臂。
- 不移除兩個方形控制點及其拖曳 hit target。

保留未被標示且仍有工作價值的元素：

- 關係線本體、箭頭、線型、顏色與標籤。
- 關係線選取、hover、inline label edit、Delete／Backspace 刪除。
- 兩端圓形 endpoint 與既有 endpoint anchor／reconnect 操作。
- 兩條 endpoint control arms、兩個 square control points 與 `geometry.controlPoints` 拖曳／保存。

附圖中的紅色筆跡是使用者的視覺標註，不是要渲染到產品中的內容；不修改圖片檔本身。

## 驗收條件

1. 選取關係線時，畫面不出現 control point 彼此相連的中央導引線。
2. 選取關係線時，兩端圓形 endpoint 仍可見並可拖曳調整 anchor／重新連接任務。
3. 兩條 endpoint control arms 與兩個 square control points 可見；拖曳可即時調整曲線並保存。
4. 關係線本體、label、style drawer、inline edit 與刪除操作維持可用。
5. 未選取關係線的預設 path、hover 與建立 preview 不受影響。
6. 縮放、既有中鍵畫布平移與 interaction owner 不新增重複 handle 或錯誤。

## 非目標

- 不刪除關係線資料，不清空或停用既有 control point geometry。
- 不改變任務節點、階層 connector、資料 schema、權限或後端。
- 不移除 endpoint、direction control point 操作或關係線樣式設定。

## 實作位置

- `src/components/MindMap/MindMapRelationshipOverlay.tsx`
- `src/components/MindMap/MindMapRelationshipInteractionLayer.tsx`
- `src/components/MindMap/MindMapView.tsx`

## 驗證

- `npm run verify:dev-077-mindmap-relationship-redline-cleanup`
- TypeScript、targeted lint、`npm run build:test`
- 既有 relationship／middle-pan／left-pan browser regression（以目前契約中仍保留的 endpoint、path、label 行為為準）。
