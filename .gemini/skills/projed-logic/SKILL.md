---
name: projed-logic
description: ProJED Development Logic, Mobile Roadmap, and Synchronization Strategy
---

# ProJED Development Logic & Mobile Roadmap

這份文件定義了 ProJED 的核心開發邏輯，特別是針對行動版 (Mobile) 化與跨裝置同步的技術規劃。

## 1. 專案目標 (Project Objective)
目標是將 ProJED 專案管理工具擴展至手機平台，並實現網頁端與手機端的即時數據同步。短期透過 PWA 實現，長期目標為原生 App。

---

## 2. 階段性開發計畫 (Phased Roadmap)

### Phase 1: Backend Sync Foundation (目前階段)
**核心任務：從本地存儲 (LocalStorage) 遷移至雲端資料庫 (Firestore)。**

*   **目標**: 
    1.  建立「單一真實數據源」(Source of Truth) 於雲端。
    2.  實現多裝置即時同步 (電腦 <-> 手機)。
*   **執行步驟**:
    1.  **Authentication**: 實作 Firebase Google Login。
    2.  **Database Design**: 
        *   將 Zustand 的單一巨大 JSON state 拆解為 Firestore Collections。
        *   結構參考: `workspaces/{id}`, `boards/{id}`, `lists/{id}`, `cards/{id}`。
    3.  **Sync Logic**:
        *   修改 `useBoardStore`。
        *   讀取：使用 `onSnapshot` 監聽雲端變更。
        *   寫入：採用 **Optimistic UI (樂觀更新)** 策略，先更新畫面，再背景寫入 Firestore。
    4.  **Migration**: 撰寫遷移腳本，將現有 LocalStorage 資料上傳至使用者帳號下。

### Phase 2: Mobile Web Optimization (PWA)
**核心任務：讓現有網頁在手機上好操作且可安裝。**

*   **執行步驟**:
    1.  **RWD 優化**: 
        *   隱藏 Sidebar 改為漢堡選單。
        *   優化看板水平捲動體驗 (針對觸控)。
    2.  **PWA 配置**:
        *   `manifest.json`: 支援安裝至主畫面。
        *   Service Worker: 靜態資源快取。
    3.  **Touch UX**:
        *   調整 Drag & Drop (`dnd-kit`) 參數以適應觸控。
        *   按鈕與點擊區域放大。

### Phase 3: Native App Wrapper
**核心任務：發布至雙平台 App Store 並整合原生功能。**

*   **技術選型**: Capacitor (推薦，可直接封裝現有 React 專案)。
*   **原生功能**:
    *   推播通知 (Push Notifications)。
    *   系統分享 (Share Intent)。
    *   生物辨識登入。

---

## 3. 技術架構 (Technical Architecture)

```mermaid
graph TD
    User[用戶 User] --> React[React Frontend (Vite)]
    React --> Zustand[Zustand Store (State)]
    
    subgraph "Sync Layer"
        Zustand <--> SyncService[Sync Service]
    end
    
    subgraph "Firebase Backend"
        SyncService <--> Auth[Authentication]
        SyncService <--> Firestore[Firestore DB]
    end
```

## 4. 開發規範 (Development Principles)

1.  **Optimistic UI First**: 用戶操作必須立即反應在 UI 上，不能等待網路請求完成。
2.  **Offline Capability**: 必須支援離線檢視 (利用 Firebase Offline Persistence)。
3.  **Code Consistency**: 新增功能時，必須同時考慮 Desktop 與 Mobile 的顯示效果。
4.  **Feature Exclusion**: 行動版 APP **不提供甘特圖 (Gantt Chart)** 功能，開發時應確保該模組僅在桌面版載入。
5.  **Development Priority (Priority: Web > Mobile)**:
    *   本專案以 **網頁版為主，手機版為輔**。
    *   所有新功能預設優先於網頁版實現。
    *   若功能在手機版實現有較大風險或複雜度時，**必須先詢問使用者**是否需要同步實現在手機上，不可擅自決定。
