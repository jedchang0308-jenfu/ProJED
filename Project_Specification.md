# ProJED 專案規格書 (Project Specification)

> **版本：** 2.0  
> **日期：** 2026-05-08  
> **狀態：** 執行中 (Active)

---

## 1. 專案願景 (Project Vision)
ProJED 是一款全方位、高效能的專案與任務管理工具，旨在提供類似 Trello 的直覺體驗，同時引入強大的 **WBS (Work Breakdown Structure)** 階層管理與 **甘特圖 (Gantt Chart)** 視覺化能力。

### 1.1 核心目標
*   **跨平台無縫體驗**：以筆記型電腦為核心生產力工具，手機版提供即時查閱與輔助操作。
*   **即時數據同步**：利用 Firebase 雲端技術，實現多裝置間毫秒級的狀態同步。
*   **離線作業能力**：確保使用者在網路不穩定或中斷時仍能流暢作業，並在連線後自動同步。
*   **靈活的任務階層**：從簡單的清單到複雜的 WBS 樹狀結構，滿足不同規模的專案需求。

---

## 2. 技術架構 (Technical Architecture)

ProJED 採用現代化的單頁應用程式 (SPA) 架構，結合強大的後端即服務 (BaaS)。

| 層級 | 技術選型 | 說明 |
| :--- | :--- | :--- |
| **前端框架** | **React 19 (Vite)** | 使用最新版 React，保證高效能與現代化 Hook API。 |
| **樣式系統** | **Tailwind CSS 4** | 採用最新的 JIT 引擎與變數系統，實現極致的視覺自訂。 |
| **狀態管理** | **Zustand 5** | 輕量且強大的原子化狀態管理，支援 Redux DevTools。 |
| **後端/DB** | **Firebase (Firestore)** | 提供 NoSQL 實時資料庫、身分驗證 (Auth) 與雲端儲存。 |
| **拖放系統** | **dnd-kit** | 高效能、可擴展且支援觸控與鍵盤的拖曳解決方案。 |
| **日期處理** | **dayjs** | 輕量化且功能齊全的日期運算庫。 |
| **PWA** | **vite-plugin-pwa** | 支援離線緩存與安裝至桌面/手機主畫面。 |

---

## 3. 功能規格 (Feature Specifications)

### 3.1 核心視圖 (View Modes)
*   **🏠 首頁 (Home)**：專案總覽與最近活動。
*   **📋 清單視圖 (List)**：以扁平化方式管理所有任務。
*   **📊 看板視圖 (Board)**：經典 Kanban 模式，支援跨直行 (Stage) 拖放。
*   **📅 甘特圖 (Gantt)**：**電腦版專屬**。視覺化時間軸，支援任務依賴連線與自動排程。
*   **🗓️ 日曆視圖 (Calendar)**：以月/週視圖查看任務分佈，支援與 Google Calendar 同步。
*   **🗑️ 回收站 (Recycle Bin)**：軟刪除機制，支援誤刪恢復。

### 3.2 任務管理 (Task Management)
*   **WBS 結構**：採用 Adjacency List 模型，支援 `Workspace > Board > List > Card > Checklist` 階層。
*   **任務狀態**：`待辦 (Todo)`、`執行中 (In Progress)`、`延遲 (Delayed)`、`已完成 (Completed)`、`不確定 (Unsure)`、`暫停 (On Hold)`。
*   **依賴關係 (Dependencies)**：支援任務間的邏輯約束（例如 A 完成後才能開始 B）。
*   **撤銷/重做 (Undo/Redo)**：基於命令模式 (Command Pattern)，全域追蹤操作歷程。

### 3.3 行動端優化 (Mobile Optimization)
*   **觸控友好的拖曳**：實作 `Long Press` (長按) 觸發拖曳，避免與捲動手勢衝突。
*   **導航調整**：採用底部導航欄 (Bottom Tab Bar)，確保大螢幕手機亦能單手操作。
*   **介面投影**：Modal 彈窗在手機端自動轉化為全螢幕頁面或底部抽屜 (Bottom Sheet)。

---

## 4. 資料模型 (Data Architecture)

### 4.1 核心物件模型 (Unified TaskNode)
為了解決傳統 `List > Card` 結構的僵化，ProJED 正遷移至 **TaskNode** 模型：

```typescript
interface TaskNode {
  id: string;
  parentId: string | null; // Adjacency List
  title: string;
  description?: string;
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  nodeType: 'group' | 'milestone' | 'task';
  order: number;
  kanbanStageId?: string; // 視圖投影屬性
}
```

### 4.2 資料階層
1.  **Workspace**：最上層容器（如：公司、個人）。
2.  **Board**：專案/看板單位。
3.  **TaskNode**：統一的節點，可根據 `parentId` 形成任意深度的樹。

---

## 5. 開發與設計原則 (Development Principles)

### 5.1 性能與成本控制
*   **Firebase 優化**：嚴格限制讀寫次數。使用 `where` 過濾與 `limit` 分頁。
*   **數據快取**：Zustand Store 作為第一層緩存，Firestore 離線持久化作為第二層。

### 5.2 程式碼規範
*   **型別安全**：100% TypeScript 覆蓋。
*   **元件原子化**：拆分極小化、高複用度的 UI 元件。
*   **邏輯抽離**：將複雜計算（如日期自動排程、Cascade 計算）抽離至獨立的 `utils` 或 `services`。

### 5.3 視覺美學 (Aesthetics)
*   **Premium Design**：拒絕原生色彩，使用精選配色（HSL 系統）。
*   **微互動**：所有按鈕、拖放與切換均需具備平滑過渡 (Transitions)。
*   **Dark Mode**：原生支援深色模式。

---

## 6. 未來藍圖 (Roadmap)
- [ ] 全面完成舊版資料模型至 `TaskNode` 的遷移。
- [ ] 強化甘特圖的自動關鍵路徑 (Critical Path) 計算。
- [ ] 整合語音輸入與多媒體附件。
- [ ] 支援跨專案的資源負載圖。

---

> **Antigravity AI 驅動開發**  
> *這份規格書是由 AI 助手根據當前 codebase 與設計意圖自動生成並優化。*
