# 01 System Context

## 專案目標

ProJED 是跨平台專案管理工具，支援發散與收斂兩種開發週期：

- 發散期：快速建立任務、拆解 WBS、整理需求。
- 收斂期：確認依賴、排程、狀態與交付成果。
- 跨平台：電腦版提供完整規劃；手機版提供檢視、更新與輕量操作。

所有視圖必須共用同一份任務資料，不得各自維護狀態。

## 核心視圖

- 清單：WBS 任務樹的主要入口，用於階層檢視、內容編輯、排序與子任務建立。
- 看板：用於狀態流轉與工作階段管理，是 TaskNode 的視覺投影。
- 甘特圖：只限電腦版，用於排程、日期調整與依賴檢視；手機版不得開放。
- 日曆：用於日期導向任務檢視與 Google Calendar 同步狀態呈現。

## 核心資料模型

ProJED 以 `TaskNode` 作為統一任務模型，使用 Adjacency List 表示樹狀結構。

```typescript
interface TaskNode {
  id: string;
  parentId: string | null;
  title: string;
  description?: string;
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  nodeType: 'group' | 'milestone' | 'task';
  order: number;
  kanbanStageId?: string;
}
```

模型規則：

- `parentId` 是唯一父子關係來源。
- `order` 只負責同層排序。
- `status`、`startDate`、`endDate` 為跨視圖共用資料。
- `kanbanStageId` 只表示看板階段，不取代 `parentId` 或 `status`。
- 依賴、日期連動與排程防護應由 TaskNode 計算，不依賴 DOM 順序。
