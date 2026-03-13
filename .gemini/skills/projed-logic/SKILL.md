---
name: projed-logic
description: ProJED Development Logic, Mobile Roadmap, and Synchronization Strategy
---

# ProJED Development Logic & Mobile Roadmap

這份文件定義了 ProJED 的核心開發邏輯，特別是針對行動版 (Mobile) 化與跨裝置同步的技術規劃。

## 1. 專案目標 (Project Objective)
ProJED 是一個參考 Trello 的專案管理工具，可同時在電腦及手機使用，主要在筆電使用，手機輔助。並實現網頁端與手機端的即時數據同步。

### 1.1 開發優先序 (Development Priority)
開發優先從電腦版開始開發，技術選用皆須預留擴充到手機版，待電腦版開發完成再開始開發手機版。

---

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
    *   若功能在手機版實現有較大風險或複雜度時，不可擅自決定。
5.  **Database Selection**: 資料庫統一使用 **Firebase (Firestore)**，確保跨端數據同步的穩定性。
6.  **Cost Optimization**: 嚴禁產生多餘的讀寫次數。開發時必須優化數據讀取邏輯 (如使用快取、局部更新)，嚴格控制雲端運作預算。
