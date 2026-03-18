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

---
*更新日期：2026-03-18 (正式發佈 V4.6)*
