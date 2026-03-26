# API 文件 (API Documentation)

本文件定義 ProJED 組件間的接口與核心邏輯函數。

---

## 1. 甘特圖組件 (`GanttView.tsx`)

### 1.1 組件 Props
| 參數 | 類型 | 描述 |
| :--- | :--- | :--- |
| `activeBoard` | `Object` | 當前選中的看板資料，包含 `lists`, `cards`, `dependencies` 等。 |
| `activeBoardId` | `String` | 當前看板的 UUID。 |
| `currentUser` | `Object` | 當前登入用戶資訊。 |

### 1.2 核心工具函數 (Internal Helpers)

#### `getX(date, colWidth)`
根據日期計算在時間軸上的橫向像素位置。
- **輸入**: `date` (String/Dayjs), `colWidth` (Number)
- **輸出**: `Number` (像素位移量)

#### `getDependencyLabel(index)`
將相依關係的索引轉換為英文標籤 (A, B, C...)。
- **輸入**: `index` (Number)
- **輸出**: `String`

#### `handleDragStart(e, item, type)`
啟動拖拽邏輯，支援移動、左側縮放、右側縮放。
- **輸入**: `e` (Event), `item` (Object), `type` ('move'|'left'|'right')

---

## 2. 數據結構 (Data Structures)

扁平化項目 (Flattened Item)
甘特圖中用來渲染的標準對象：
```typescript
interface FlattenedItem {
  id: string;
  type: 'list' | 'card' | 'checklist' | 'checklistitem';
  title: string;
  startDate?: string;
  endDate?: string;
  status: TaskStatus; // 'todo' | 'delayed' | 'completed' | 'unsure' | 'onhold'
  row: number; // 垂直對齊行號
}
```

---
*更新日期：2026-03-18*
