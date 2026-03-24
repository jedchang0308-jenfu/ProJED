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
- **側邊欄**：建立 `CalendarSidebarRow`（簡化版 `SortableGanttRow`），保留層級展示與收疊/展開，但移除拖曳排序以降低複雜度。
- **資料扁平化**：`flattenedItems` 邏輯與 `GanttView` 完全一致，確保側邊欄顯示結果無差異。
- **任務分組 (tasksByDate)**：將 `flattenedItems` 依日期分組至 Map，支援跨日任務（一個任務出現在 startDate ~ endDate 每一天），並標記起始/中間/結束以控制圓角方向。
- **效能限制**：單日格子最多顯示 4 個任務，超出以「+N 更多」提示，避免格子內容溢出。
- **零新增依賴**：僅使用現有的 `dayjs`，不引入第三方日曆套件。

### 7.3 狀態色彩映射
- 與甘特圖共享同一份 `statusFilters`（全域 Zustand 狀態），5 種狀態色彩一致：
  - 進行中 (`todo`)、延遲 (`delayed`)、完成 (`completed`)、不確定 (`unsure`)、暫緩 (`onhold`)。

---
*更新日期：2026-03-24 (新增月曆模式)*
