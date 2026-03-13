# ProJED 開發規格書 (ProJED Spec)

## 1. 專案目標 (Project Objective)
ProJED 是一個參考 Trello 的專案管理工具，可同時在電腦及手機使用，主要在筆電使用，手機輔助。並實現網頁端與手機端的即時數據同步。

### 1.1 開發優先序 (Development Priority)
開發優先從電腦版開始開發，技術選用皆須預留擴充到手機版，待電腦版開發完成再開始開發手機版。

---

---

## 3. 功能規格細節 (Feature Specs)

| 功能模組 | 網頁版 (Web) | 行動版 (Mobile) | 備註 |
| :--- | :--- | :--- | :--- |
| **導航列** | 頂部導航 + 左側邊欄 | 底部導航欄 (Bottom Tab Bar) <br> 或 左上角抽屜式選單 | 手機操作重心在螢幕下半部，底部導航較佳。 |
| **看板視圖** | 水平排列列表 | 分頁式列表 (Swiper) <br> 或 垂直堆疊 (Vertical Stack) | 手機水平空間有限，建議一次顯示一個列表，左右滑動切換。**注意：行動版不包含甘特圖功能。** |
| **拖放操作** | 滑鼠拖曳 | 長按後拖曳 (避免與捲動衝突) | 需特別調校 dnd-kit 參數。 |
| **任務編輯** | 彈出式模態框 (Modal) | 全螢幕頁面 (Full Screen Page) <br> 或 底部抽屜 (Bottom Sheet) | 手機上 Modal 體驗不佳，Bottom Sheet 是現代主流。 |
| **Gantt 視圖** | 支援 | **不支援** | 甘特圖在手機窄螢幕體驗極佳限制，故行動版不提供此功能。 |
| **輸入方式** | 鍵盤全功能 | 支援語音輸入、相機拍照 | 利用手機原生優勢。 |

---

## 4. 技術架構建議 (Technical Architecture)

```mermaid
graph TD
    UserMobile[手機用戶 (App/PWA)]
    UserWeb[電腦用戶 (Web)]
    
    subgraph Frontend
        ReactApp[React App (Vite)]
        Store[Zustand Store]
        SyncService[Sync Service]
    end
    
    subgraph Backend_Firebase
        Auth[Authentication]
        Firestore[Firestore DB]
        Storage[Storage (Images/Files)]
    end

    UserMobile --> ReactApp
    UserWeb --> ReactApp
    
    ReactApp --> Store
    Store <--> SyncService
    
    SyncService <--> Auth
    SyncService <--> Firestore
    
    ReactApp --> Storage
```

---

## 5. 開發規範 (Development Principles)

*   **資料庫選型**: 全域統一使用 **Firebase (Firestore)** 作為資料庫，嚴禁混用其他資料庫。
*   **數據同步**: 必須支援跨裝置即時同步。
*   **離線支持**: 必須啟用 Firebase 的離線持久化 (Offline Persistence) 功能。
*   **預算與效能控制**: 嚴禁產生多餘的讀寫次數。開發時應優化查詢邏輯、使用快取並避免不必要的資料重載，以嚴格控制雲端預算。

