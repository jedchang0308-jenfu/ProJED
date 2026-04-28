# 架構字典 (Architecture Dictionary)

本文件紀錄 ProJED 專案的核心設計意圖 (Design Intent) 與架構決策。依照開發規範，每完成重大功能或 UI 優化均需更新此文件。

---

## 1. 甘特圖組件 (`GanttView.jsx`)

### 1.1 視覺層次設計 (Visual Hierarchy)
- **設計意圖**：在單一時間軸上清晰區分容器、實體與子任務。
- **實現方式** (按層級)：
    - **列表 (List)**：深色實心底色 (`brightness-75`) + 全白文字。帶有淺灰色實體邊框的分組背景塊。
    - **卡片 (Card)**：白底 + 深色實體外框 (`border-2`) + 深色狀態色文字。
    - **待辦 (Checklist)**：白底 + 淺色實體外框 (`border` + `opacity-30`)，視覺上最輕盈。

### 1.2 滾動優化邏輯 (Scroll Optimization)
- **設計理念**：解決 Z-Index 在 Tailwind 任意值 (arbitrary values) 系統中的不穩定性。
- **關鍵決策**：
    - 使用內聯 `style={{ zIndex: 100 }}` 強制拉高時間軸標頭。
    - 標頭採用實色背景 (`bg-slate-50`, `bg-white`) 並移除透明度，確保內容在捲動時能被完美遮擋。
    - 控制標籤與指標的 Z-Index 權重，使其不「穿透」導航欄位。

### 1.3 空間佈局規範 (Layout Metrics)
- **行高 (BAR_HEIGHT)**：固定為 `28px` (優化佈局緊湊感)。
- **進度條高度 (barHeight)**：固定為 `25px`。
- **文字大小**：內部標籤 `11px`，外部/里程碑標籤 `12px`。
- **圓角規範**：採用 `rounded-[6px]`。

### 1.4 拖曳效能優化 (Performance Engine)
- **設計意圖**：徹底解決快速拖曳時進度條與鼠標脫鉤的問題。
- **實現方式 (方案 B)**：
    - **useRef 狀態追踪**：使用 `dragStateRef` 即時紀錄位置，不觸發 React 渲染迴圈。
    - **rAF 節流渲染**：透過 `requestAnimationFrame` 確保 setState 頻率與螢幕刷新率同步 (≈60fps)。
    - **事件解耦**：移除 `useEffect` 中不必要的重型依賴陣列項目，防止事件監聽器過度重建。

### 1.5 時間邊界處理與依賴對齊 (Time Boundary & Dependency Alignment)
- **設計意圖**：解決甘特圖中 0 天間隔任務因數學計算（Start = End）導致視覺上產生「間隙」的問題。
- **實現方式**：
    - 在繪製進度條寬度與計算拖曳熱區時，將視覺結束點從實體日期 `end` 擴展至 `end + 1` 的邊界。
    - 這確保了當前置任務在某日結束且後續任務在同日開始時，兩者在畫面上能精確地共享一條垂直切線。

---

## 2. 資料流與狀態管理

### 2.1 Firebase 同步
- **設計意圖**：全域單一資料源 (Single Source of Truth)，使用 Firebase Firestore。
- **規範**：嚴禁混用其他資料庫，確保跨裝置即時同步。

---
 
 ## 3. 編輯狀態緩衝 (Editing State Buffering)
- **設計意圖**：避免受控元件 (Controlled Components) 在輸入過程中因頻繁更新全域狀態而導致頁面重渲染並失焦。
- **實現方式**：在 `CardModal.jsx` 中引入 `localState` 作為緩衝層。`onChange` 僅更新本機狀態，`onBlur` 時才將最終值提交至 `useBoardStore`。

## 4. 依賴排程保護 (Dependency Scheduling Protection)
- **設計意圖**：確保 `fixBoardDependencies` 在自動調整日期時不會覆蓋掉使用者的原始輸入意圖，尤其是當日期為空時。
- **實現方式**：在比對邏輯中排除「完全無日期」的任務，且在單邊有日期時以計算值為基準進行比對，避免因假值填補產生的錯誤覆蓋。

### 4.1 時間連動強化 (Scheduling Reinforcement)
- **設計意圖**：確保手動修改日期後，所有相依任務均能即時同步，避免部分 UI 更新無法觸發串聯排程的問題。
- **改動細節**：
    - **類型統一**：使 `updateTaskDate` 同時支援 `checklist` 與 `checklistitem` 類型標籤，確保不同 UI 組件（卡片與甘特圖）的更新行為一致。
    - **強制校準機制**：移除 `deltaDays === 0` 的跳過限制。即使位移量為 0，只要日期欄位有變動（例如：縮短工時），即強制執行 `fixBoardDependencies` 以鎖定全域依賴關係。

## 5. 全域非同步對話框系統 (Global Async Dialog System)
- **設計意圖**：原生 `window.prompt` 與 `window.confirm` 為阻斷式 (Blocking) 調用，會鎖死瀏覽器執行緒並導致自動化測試工具（如 Playwright/Agent）無法與頁面互動。
- **實現方式**：
    - **狀態管理**：建立 `useDialogStore` (Zustand)，利用 Promise 的 `resolve` 機制將對話框操作轉化為非同步 (Async/Await) 流程。
    - **全域組件**：在 `App.jsx` 最外層掛載 `GlobalDialog.jsx`，確保對話框能覆蓋所有 UI 層級。
    - **互動優化**：支援 `Enter` 確認與 `Esc` 取消，並在顯示時自動聚焦輸入框，維持與原生對話框一致的操作習慣，同時提供更佳的視覺整合感。

## 6. UX 與導覽優化 (UX & Navigation Enhancements)

### 6.1 日期輸入預設邏輯 (Default Date Selection)
- **設計意圖**：減少使用者在設定新任務日期時的點擊與輸入次數。
- **實現方式**：在 `CardModal.jsx` 的日期輸入框中加入 `onClick` 事件。若欄位為空，點擊時自動填入並儲存「今日」日期。

### 6.2 甘特圖導覽精確化 (Precise Gantt Navigation)
- **設計意圖**：修正甘特圖中 Checklist 項目點擊後導向錯誤 Modal 的邏輯錯誤。
- **實現方式**：在 `GanttView.jsx` 的 `handleItemClick` 中，針對 `checklist` 類型明確調用 `openModal('checklistitem', ...)`，而非導向一般的卡片 Modal。

### 6.3 甘特圖狀態過濾修復 (Gantt Status Filter Fix)
- **設計意圖**：確保甘特圖模式下的狀態過濾功能（如隱藏「已完成」任務）能完整作用於所有資料層級。
- **解決方案**：在 `GanttView.jsx` 的 `flattenedItems` 資料收集邏輯中，補足對待辦事項 (`Checklist Items`) 的狀態過濾檢查。這確保了當父層卡片顯示時，其內部的待辦事項仍會根據自身的狀態與全域過濾器設定進行顯示或隱藏。

---
*更新日期：2026-03-23 (甘特圖狀態過濾修復)*

## 7. 月曆模式 (`CalendarView.jsx`)

### 7.1 設計意圖
- 提供 Google Calendar 風格的月檢視，讓使用者以日曆格線直覺查看任務排程。
- 複用甘特圖側邊欄的層級展示邏輯與看板模式的狀態過濾器，降低維護成本。

### 7.2 架構決策
- **雙層週覆蓋渲染 (Double-layer Week Overlay)**：為了實現跨日/跨週任務不被格線切斷的視覺效果（同 Google Calendar），捨棄了傳統的格線內填充方式。
  - **底層 (Grid Layer)**：靜態日期格，僅負責渲染日期數字與背景。
  - **頂層 (Task Layer)**：使用 `absolute` 定位，任務條依據當週起始點 (`left%`) 與長度 (`width%`) 橫跨複數欄位，徹底解決標籤被過濾或截斷的問題。
- **側邊欄共用化 (`SharedTaskSidebar.jsx`)**：為了維護一致性與降低 Bug 發生率。
  - 提取獨立元件封裝 `dnd-kit` 狀態，使月曆也具備與甘特圖完全同級的拖曳排序與層級管理能力。
- **資料扁平化**：`flattenedItems` 邏輯與 `GanttView` 完全一致，確保側邊欄顯示結果無差異。
- **零新增依賴**：僅使用現有的 `dayjs`，不引入第三方日曆套件。

### 7.3 狀態色彩映射
- 與甘特圖共享同一份 `statusFilters`（全域 Zustand 狀態），5 種狀態色彩一致：
  - 進行中 (`todo`)、延遲 (`delayed`)、完成 (`completed`)、不確定 (`unsure`)、暫緩 (`onhold`)。

---
*更新日期：2026-03-24 (優化跨日任務顯示、引入共用側邊欄與 Dnd 修復)*

## 8. 狀態更新與拖曳保護 (Store Consistency & Drag Protection)

### 8.1 跨列表拖曳消失修復
- **設計意圖**：解決在開啟過濾器（隱藏部分任務）時，拖曳卡片到新列表標題導致資料遺失的問題。
- **解決方案**：
  - **精確索引計算**：在 `SharedTaskSidebar` 中，目標索引不再依靠 DOM 或過濾後的 `flattenedItems` 陣列，而是直接從 `activeBoard.lists` 原始資料中獲取正確的插入位置。
  - **原子化操作保護**：修正 `useBoardStore` 中的 `moveCardToList` 邏輯，明確區分「相同列表內移動」與「跨列表移動」，防止在相同列表操作時卡片被意外 filter 掉後未補回。
  - **強制校準機制**：每次移動卡片時強制重設 `listId`，確保 React 渲染樹與 Store 狀態完全同步。

---

## 9. TypeScript 基礎設施與型別安全 (TypeScript Infrastructure)

### 9.1 設計意圖
- 打破純 JavaScript 專案中長期的「型別盲區」，降低執行時期的 Runtime 錯誤發生率（如 `undefined` 存取、屬性拼字錯誤）。
- 大幅提升開發者體驗 (DX) 與編輯器的自動補全能力，確保未來新增功能時的穩定性。

### 9.2 架構決策
- **漸進式遷移 (Incremental Migration)**：在 `tsconfig.json` 開啟 `allowJs: true`，允許 `.js` 與 `.ts` 檔案共存，分階段把底層模組、全域狀態到 UI 元件順序過渡。
- **單一型別來源 (Single Source of Truth for Types)**：建立 `src/types/index.ts` 集中管理所有業務模型，包含 `Workspace`, `Board`, `List`, `Card` 等，所有介面必須依賴此來源。
- **嚴格模式 (Strict Mode)**：為保證型別品質，不妥協地開啟 `strict: true`。禁止任何隱式的 `any` 綁定，並修復了原先 `useBoardStore` 中多處潛在的 Nullable 與未定義參數錯誤。
- **Zustand 泛型約束**：在 `useBoardStore` 與 `useDialogStore` 中，全面改用泛型寫法 `create<BoardStore>()(...)`，使得所有 Actions 的參數與回傳值受到編譯器保護。

---

## 10. Google Calendar 同步模組 (`googleCalendarService.ts`)

### 10.1 設計意圖
- 將 ProJED 中所有具備日期的任務（列表、卡片、待辦項目）**單向同步**至用戶的 Google **主日曆 (Primary Calendar)**，
  確保訂閱者能直接查看，無需額外設定子日曆權限。
- 同步範圍為**所有工作區、所有看板**的任務。
- **僅同步結束日期**：為了保持日曆清爽，所有任務均以其「結束日期」作為單日全天事件呈現。

### 10.2 架構決策
- **從 Legacy v2 移植並改良**：原始邏輯位於 `_legacy_v2/app.js` L557-855，遷移至 TypeScript 模組化架構。
- **職責分離**：
  - `googleCalendarService.ts` — 純邏輯層，處理 API 呼叫與資料轉換
  - `useCalendarSyncStore.ts` — Zustand 狀態管理，管理連接狀態與 Event ID 快取
  - `useCalendarSync.ts` — React Hook，負責 App mount 時初始化
  - `MainLayout.tsx` — UI 層，三態按鈕（未連接 / 已連接 / 同步中）
- **REST API 直接呼叫**：捨棄 GAPI client library，改用 `fetch` 呼叫 Google Calendar REST API v3，
  避免 GAPI 初始化延遲與版本相依問題。
- **Client ID 環境隔離**：存於 `.env.development` / `.env.production` 的 `VITE_GOOGLE_CLIENT_ID`，
  遵守 `devops_policy` 禁止金鑰寫死在程式碼中的規範。

### 10.3 相較舊版的改良

| 項目 | 舊版 (v2) | 新版 (v3) |
|:---|:---|:---|
| Token 管理 | localStorage 手動操作散落各處 | `TokenManager` class 封裝，過期自動偵測 |
| Event ID 關聯 | 每次從 description 搜尋 | 本地快取 `eventIdCache` (localStorage 持久化) |
| 日期格式 | 只取 endDate 作為單日事件 | 固定僅同步結束日期 (End-date only)，保持版面清爽 |
| 同步範圍 | 僅當前看板 | 所有工作區所有看板 |
| 錯誤處理 | console.error | 統一型別 + UI toast + 自動重置連接狀態 |
| Client ID | 寫死在 JS 中 | 環境變數 (`import.meta.env`) |
| 型別安全 | 無 | 完整 TypeScript 支援 |
| 隱私權限 | 預設 | 強制 `visibility: public` 確保訂閱者可見 |
| 寫入目標 | 獨立子日曆 | 直接寫入 **主日曆 (Primary)**，免除共用設定債 |

### 10.4 同步流程

```
用戶點擊「連接 Google 日曆」
    → requestAccessToken (OAuth) → TokenManager.save()
    → 自動觸發 syncAll()
      → getOrCreateCalendar("primary")
      → 讀取 Google 主日曆事件
      → 逐項比對 → 新增 / 更新 / 刪除 / 跳過
      → 設定 visibility: 'public'
    → 更新 lastSyncAt / eventIdCache
```

---
*更新日期：2026-04-01 (Google Calendar 同步模組移植)*

---

## 11. 清單模式 (`ListView.tsx`) 與視圖持久化

### 11.1 設計意圖
- **底層資料展示**：清單模式作為所有任務的「底層資料來源視圖」，以全版面表格清單呈現三層結構（列表 → 卡片 → 待辦項目）。其他模式（看板、甘特、月曆）皆從同一份 `useBoardStore` 資料抓取，用不同 UI 呈現。
- **完整欄位資訊**：清單模式顯示狀態標籤、起始日、截止日、備註四個附加欄位，提供比其他模式更高的資訊密度。
- **功能完整性**：支援與甘特圖/月曆側邊欄等效的全部互動操作（拖曳排序、展開收疊、新增子項、點擊開啟 Modal）。

### 11.2 視圖順序
導航列按鈕由左至右排列為：**清單 → 看板 → 甘特圖 → 月曆**。
清單模式排在最前，語意上代表「最原始的資料結構入口」。

### 11.3 架構決策

#### 資料流（不變）
```
useBoardStore (Zustand + Firestore)
    ↓
    ├── ListView   — 全版面表格清單（資料底層展示）
    ├── BoardView  — 看板（水平卡片排列）
    ├── GanttView  — 甘特圖（時間軸）
    └── CalendarView — 月曆（日曆格線）
```

- **不涉及資料模型變更**：清單模式直接讀取 `activeBoard.lists`，與其他模式共享同一份 Store 狀態。
- **複用資料扁平化邏輯**：`flattenedItems` 演算法與 GanttView / CalendarView 完全一致，確保三者在相同過濾條件下顯示相同任務。
- **拖曳邏輯複用**：dnd-kit 的排序與跨層移動邏輯直接從 `SharedTaskSidebar` 提取，確保行為一致性。

#### 超出截止日高亮
- **設計意圖**：若任務未完成且截止日早於今日，截止日欄位自動以紅色（`text-status-delayed`）顯示，提醒使用者注意。

### 11.4 視圖位置持久化 (`useBoardStore.ts`)
- **設計意圖**：記住使用者離開前的視圖位置，頁面重新載入後自動恢復，提升連貫性。
- **實現方式**：
  - 常數 `VIEW_STORAGE_KEY = 'projed-last-view'`，使用 `localStorage` 儲存。
  - `getStoredView()`：初始化時讀取，只恢復「工作視圖」（list / board / gantt / calendar）；若無記錄或為 home/recycle_bin，則預設回到 `home`。
  - `setView()`：每次切換視圖時同步寫入 localStorage。
  - `switchBoard()`：切換看板時固定回到 `'board'`（維持原有行為），不套用記憶視圖。

---
*更新日期：2026-04-08 (清單模式 + 視圖位置持久化)*

## 12. 共用 UI 模組庫 (Shared UI Library / Design System)

### 12.1 設計意圖
- **解決樣式冗餘 (DRY Principles)**：針對系統中大量重複的 Tailwind CSS 類名進行抽象化，降低維護成本。
- **提升一致性 (UI Consistency)**：確保所有按鈕 (Button)、標籤 (Badge) 與輸入框 (Input) 在全系統中具備 100% 統一的視覺與互動邏輯。
- **強化型別安全**：利用 TypeScript 的 `ComponentProps` 繼承原生屬性，確保開發者在使用自定義組件時仍能保有完整的 HTML 原生功能與編輯器自動補全。

### 12.2 架構核心
- **`src/utils/cn.ts`**：核心工具函式。整合 `clsx` (條件類名) 與 `tailwind-merge` (樣式覆蓋保護)。解決傳入 `className` 時常見的樣式衝突問題（例如：外部 margin 覆蓋組件內部 margin）。
- **底層元件封裝 (`src/components/ui/`)**：
    - **`<Button>`**：封裝了 `primary`, `secondary`, `ghost`, `dashed`, `danger` 五種變體與多種尺寸，支援 `isLoading` 與 `fullWidth` 狀態。
    - **`<Badge>`**：統一了狀態標籤（如 todo, delayed, completed）的配色與圓角規範。
    - **`<Input>`**：統一處理 Focus Ring、Error Message 提示與 Icon 嵌入佈局。
- **重構驗證 (PoC)**：首波針對 `Card.tsx` 與 `List.tsx` 進行重構，將寫死的 HTML 標籤全數替換為共用組件，驗證了組件在複雜 React 渲染環境（如 DnD 排序、Modal 觸發）下的穩定性。

---
*更新日期：2026-04-21 (共用 UI 模組庫建立與首波重構完成)*
