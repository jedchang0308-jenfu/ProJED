# 02 Architecture Rules

## 技術棧

核心應用：

- React 19
- Tailwind CSS 4
- Zustand 5
- Firebase Firestore
- TypeScript with `strict: true`
- Vite
- dnd-kit
- dayjs

AI Agent / 後端運算擴充層：

- Python 可用於 AI agent、批次運算、排程推理、RAG、文件解析與重型後端邏輯。
- Python 不得成為前端狀態、UI 邏輯或跨視圖資料真相來源。
- Python 服務必須透過明確 API 與 ProJED 溝通，資料契約以 TaskNode JSON schema 為準。
- ProJED 前端仍以 Zustand 作為 SSoT；Python 回傳建議、分析結果或可套用 patch，不直接覆寫本地狀態。

新增功能優先沿用既有核心技術棧，不得任意引入替代狀態管理、資料庫或大型 UI 框架。

## 核心開發底線

- 手機版禁用甘特圖：不得提供甘特圖視圖、拖曳、排程編輯或隱藏入口。
- 嚴格預算控制：避免拖曳期間高頻寫入 Firestore；使用批次、去抖、節流與有限查詢。
- 樂觀 UI：先更新 Zustand，再同步 Firestore；失敗時提供回滾、重試或提示。
- Zustand SSoT：跨視圖任務資料只由 store 派生；local state 僅作表單、暫存或 UI 開關。

## 架構決策字典

### Z-Index 滾動處理

- sticky 區塊必須有實色背景。
- z-index 層級需一致，避免分散疊加修補。
- Dialog、Context Menu、Toast 必須高於一般視圖與拖曳預覽。

### 甘特圖拖曳 rAF 效能優化

- 拖曳暫態座標優先放在 `useRef`。
- 使用 `requestAnimationFrame` 合併視覺更新。
- 拖曳結束後才提交日期與 Firestore 同步。
- 日期計算必須處理零天、同日起訖與 end-date 邊界。

### Global Dialog 非同步對話框系統

- 不在主要流程使用 `window.alert`、`window.confirm`、`window.prompt`。
- Dialog 狀態由 Zustand 管理，API 支援 Promise 與 `async/await`。
- `Enter`、`Esc`、焦點與可存取性行為需一致。
- 由 App 層統一掛載 Global Dialog component。

### 共用 UI 模組

共用元件集中管理，建議包含：

- `Button`
- `Badge`
- `Input`
- `Toast`
- `Dialog`
- `GlobalContextMenu`
- `StatusFilterBar`

元件需支援 TypeScript、`className` 合併與 Tailwind 衝突處理。

## 外部整合

### Google Calendar 單向同步

ProJED 是任務資料來源，Google Calendar 僅作外部呈現目標。

- 只同步符合條件且有日期的 TaskNode。
- 快取 Google Calendar event ID，避免重複建立。
- 同步失敗用非阻塞 Toast 或同步狀態呈現。
- Client ID 由 `VITE_GOOGLE_CLIENT_ID` 提供。
- Google Calendar 不得反向覆寫 ProJED 任務資料。
