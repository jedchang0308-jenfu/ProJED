# SPEC-077 心智圖關係線紅線標記元素清理

## 需求與邊界

使用者提供的心智圖截圖以紅線標示「選取關係線後」不需要的視覺元素。本需求只處理紅線指向的 Bezier 輔助控制元素：

- 移除兩側端點到控制點的實線輔助臂。
- 移除控制點之間的輔助導引線。
- 移除兩個方形控制點（含 SVG 裝飾與 HTML 拖曳 hit target）。

保留未被標示且仍有工作價值的元素：

- 關係線本體、箭頭、線型、顏色與標籤。
- 關係線選取、hover、inline label edit、Delete／Backspace 刪除。
- 兩端圓形 endpoint 與既有 endpoint anchor／reconnect 操作。
- 已保存的 `geometry.controlPoints` 資料格式與路徑計算相容性；既有曲線形狀不因本次顯示清理被重設。

附圖中的紅色筆跡是使用者的視覺標註，不是要渲染到產品中的內容；不修改圖片檔本身。

## 驗收條件

1. 選取關係線時，畫面不再出現控制臂、導引線或方形控制點。
2. 選取關係線時，兩端圓形 endpoint 仍可見並可拖曳調整 anchor／重新連接任務。
3. 關係線本體、label、style drawer、inline edit 與刪除操作維持可用。
4. 未選取關係線的預設 path、hover 與建立 preview 不受影響。
5. 縮放、左鍵畫布平移與既有 interaction owner 不新增殘留 handle 或錯誤。

## 非目標

- 不刪除關係線資料，不清空既有 control point geometry。
- 不改變任務節點、階層 connector、資料 schema、權限或後端。
- 不移除 endpoint 操作或關係線樣式設定。

## 實作位置

- `src/components/MindMap/MindMapRelationshipOverlay.tsx`
- `src/components/MindMap/MindMapRelationshipInteractionLayer.tsx`
- `src/components/MindMap/MindMapView.tsx`

## 驗證

- `npm run verify:dev-077-mindmap-relationship-redline-cleanup`
- TypeScript、targeted lint、`npm run build:test`
- 既有 relationship／middle-pan／left-pan browser regression（以目前契約中仍保留的 endpoint、path、label 行為為準）。
