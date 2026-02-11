# ProJED 行動應用程式開發規格書 (Mobile App Spec)

## 1. 專案目標 (Project Objective)
目標是將 ProJED 專案管理工具擴展至手機平台，並實現網頁端與手機端的即時數據同步。
短期目標是透過 PWA 技術快速提供行動體驗，長期目標是開發原生應用程式 (Native App) 提供更深度的系統整合（如推播通知、離線存取、Widget）。

---

## 2. 階段性開發計畫 (Phased Roadmap)
我們建議分三個階段進行，從基礎建設開始，逐步過渡到原生體驗。

### 第一階段：後端同步基礎建設 (Backend Sync Foundation)
**核心任務：從本地存儲 (LocalStorage) 遷移至雲端資料庫 (Firestore)。**
目前 ProJED 的數據僅存在瀏覽器中。要實現跨裝置同步，必須將「單一真實數據源」(Source of Truth) 移至雲端。

*   **1.1 數據結構遷移**：設計 Firestore collections (workspaces, boards, lists, cards) 以取代現有的巨大 JSON state。
*   **1.2 用戶認證系統**：整合 Firebase Authentication (Google Login)，確保每個用戶只能存取自己的看板。
*   **1.3 即時同步 (Real-time Sync)**：修改 `useBoardStore`，使其監聽 Firestore 的 `onSnapshot` 事件，實現多裝置即時更新。
*   **1.4 離線支持**：啟用 Firestore 的 offline persistence，允許在無網路時操作，連線後自動同步。

### 第二階段：行動網頁優化與 PWA (Mobile Web & PWA)
**核心任務：讓現有網頁在手機上「好用」且「可安裝」。**

*   **2.1 響應式佈局 (Responsive Design)**：
    *   隱藏或摺疊側邊欄 (Sidebar)，改為漢堡選單 (Hamburger Menu)。
    *   調整看板 (Board) 的水平捲動體驗，確保在窄螢幕上不僅能上下滑動列表 (List)，也能左右切換列表。
    *   優化按鈕尺寸與點擊區域，適應觸控操作 (Touch-friendly)。
*   **2.2 PWA 封裝**：
    *   配置 `manifest.json`，允許用戶將 ProJED "新增至主畫面"。
    *   配置 Service Worker，緩存靜態資源 (Assets)，提升加載速度。
*   **2.3 觸控手勢優化**：
    *   確保 Drag & Drop 在手機上流暢 (使用 `@dnd-kit` 的 TouchSensor)。
    *   長按 (Long-press) 開啟右鍵選單 (Context Menu)。

### 第三階段：原生應用程式封裝 (Native App Wrapper)
**核心任務：發布至 App Store / Google Play 並使用原生功能。**
建議使用 **Capacitor** 或 **React Native**。考慮到現有代碼庫為 React，Capacitor 是最快路徑（直接封裝現有 Web App）。

*   **3.1 原生功能整合**：
    *   **推播通知 (Push Notifications)**：當卡片被指派或有變更時通知用戶。
    *   **相機整合**：直接在卡片中拍照上傳附件。
    *   **系統分享 (Share Intent)**：從其他 App 分享文字/連結直接建立新卡片。
    *   **生物辨識**：FaceID / Fingerprint 解鎖 App。
*   **3.2 桌面小工具 (Widgets)**：手機桌面顯示「今日待辦」或「進行中任務」。

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

## 5. 立即行動建議 (Immediate Action Plan)

若要開始此計畫，建議優先執行 **Phase 1 (後端同步)**。
因為沒有雲端數據庫，手機 App 無法與電腦端資料互通，開發 App 將失去意義。

**建議下一步驟：**
1.  配置 Firebase Authentication。
2.  重構 `useBoardStore` 以支援 Firestore 讀寫。
3.  測試多視窗/多裝置同步效果。
