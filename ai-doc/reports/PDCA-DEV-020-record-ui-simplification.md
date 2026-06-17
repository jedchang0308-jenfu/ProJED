# PDCA-DEV-020：紀錄 UI 精簡與資訊層級優化

日期：2026-06-15  
狀態：Done  
關聯 DEV：DEV-020 / DEV-019 / DEV-010  
範圍：會議紀錄與個人工作紀錄 composer 的 topbar、側欄 header、摘要區與流程卡資訊層級。

## P：Plan

### 問題

使用者截圖指出會議紀錄與個人工作紀錄雖已共用 composer grammar，但畫面仍有過多重複狀態資訊：

- topbar 已顯示 `會議紀錄中` / `個人紀錄中`。
- 側欄 header 又顯示 `會議紀錄` / `個人工作紀錄`。
- 側欄第一張摘要卡再次顯示紀錄類型、`會議中` / `撰寫中`、`建立時已決定`。

這造成兩個問題：

- 第一視覺高度被低價值資訊佔用，真正要操作的 `專案變化匯入` 與 `紀錄流程` 被往下推。
- 會議與個人紀錄看起來仍像兩套不同 UI，而不是同一套 composer grammar。

### 目標

- topbar 只回答「目前有紀錄在進行」。
- 側欄 header 只回答「目前是哪一種紀錄」。
- 流程卡只回答「目前到哪一步、下一步能做什麼」。
- 摘要區不再顯示低價值重複資訊，但保留 DOM marker 供驗證與輔助語意使用。

### 驗收條件

- topbar active state 統一顯示 `紀錄中`。
- 用 `data-active-record-kind="meeting" | "work-log"` 保留狀態辨識，不靠長文案判斷。
- 側欄不再可見顯示 `會議中`、`撰寫中`、`建立時已決定` 這些重複 chip。
- `data-record-context-summary` / `data-record-composer-summary` 保留，但改為 `sr-only`。
- 會議與個人紀錄仍保留 `專案變化匯入 -> 紀錄流程 -> 表單` 的可見順序。
- 不改資料模型、store state、儲存、發布、AI 整理或未儲存防呆。

## D：Do

### 實作內容

- `src/components/MainLayout.tsx`
  - active record topbar 從 `會議紀錄中` / `個人紀錄中` 精簡為共同 `紀錄中`。
  - 新增 `data-active-record-kind="meeting"` 與 `data-active-record-kind="work-log"`。
  - 將 active state 視覺統一為同一套藍色 outline 狀態提示。
  - 將 mode switcher disabled tooltip 從 `會議紀錄中先離開紀錄再切換檢視` 精簡為 `紀錄中先離開紀錄再切換檢視`。

- `src/components/Records/RecordSidebar.tsx`
  - `RecordContextSummary` 改為 `sr-only` 語意 marker。
  - 保留 `data-record-context-summary`、`data-record-composer-summary`、`data-record-type-state`。
  - 新增 `data-record-summary-kind`、`data-record-summary-status`、`data-record-summary-task-count`。
  - 移除摘要卡可見 chip：紀錄類型、狀態、建立時已決定、任務數。
  - 移除未使用的 `MEETING_TERMS` dead constant。

- 驗證腳本
  - 靜態驗證改為檢查 `sr-only` 語意 marker 與 `data-*` marker。
  - Browser smoke 對 summary marker 改用 `attached`，不再要求可見。
  - Browser smoke 改查 `data-active-record-kind` 與 `紀錄中`。

## C：Check

### 自動驗證

已通過：

```powershell
npm.cmd run verify:dev-020-record-workflow-redesign
npm.cmd run verify:dev-010-action-feedback
npm.cmd run verify:dev-019-record-type-layering-browser
npm.cmd run verify:dev-020-project-change-import-browser
npm.cmd run build
```

Build 結果：

- 成功。
- 僅有既有 Vite chunk size / dynamic import warning，與本次 UI 精簡無關。

### 視覺驗證

Playwright 截圖：

- `output/playwright/dev-019-meeting-1440.png`
- `output/playwright/dev-019-work-log-1440.png`
- `output/playwright/dev-019-meeting-1024.png`
- `output/playwright/dev-020-record-workflow-1440.png`
- `output/playwright/dev-020-record-workflow-1024.png`

檢查結果：

- topbar 會議與個人 active state 均顯示 `紀錄中`。
- 側欄 header 分別顯示 `會議紀錄` 與 `個人工作紀錄`。
- 原本第一列摘要 chip 不再可見。
- 會議與個人紀錄第一個可見內容都直接進入 `專案變化匯入`。
- `專案變化匯入` 後接各自流程卡：
  - 會議：`速記 -> AI整理 -> 校稿 -> 發布`
  - 個人：`撰寫 -> 存草稿 -> 發布`
- 1024 與 1440 viewport 無水平 overflow。

### 結論

本次優化達成「減少低價值資訊、保留必要語意、統一會議與個人紀錄 UI grammar」的目標。使用者第一眼可更快進入操作，不會在 topbar、header、摘要卡之間反覆讀到同一件事。

## A：Act

### 標準化規則

後續紀錄 composer UI 採用以下標準：

- active topbar 只顯示共同狀態，不顯示紀錄類型細節。
- 紀錄類型只放在側欄 header。
- 流程階段只放在 workflow card。
- 若資訊只是供測試、自動化或輔助語意使用，優先使用 `sr-only` 與 `data-*` marker，不佔可見 UI 高度。
- 不用 chip 重複表達已由其他區塊承擔的資訊。

### 後續觀察點

- 若使用者仍覺得右側資訊量偏高，下一輪應優先檢查 `專案變化匯入` 卡片密度，而不是恢復摘要卡。
- 若 `紀錄中` 太抽象，可考慮只在 hover tooltip 或 aria 說明補類型，不回到可見長文案。
- 個人紀錄目前仍有底部「目前狀態」資訊，若後續被判定也屬低價值重複，可再移到流程卡或 `sr-only`。

### DEV-023 follow-up

2026-06-15 使用者確認下一輪優化由 DEV-023 承接，將 `先匯入專案變化` 整併為會議紀錄與個人工作紀錄的流程 step。此 follow-up 修正本 PDCA 仍保留「專案變化匯入在 workflow 上方、後接紀錄流程」的殘留 UX 風險，後續 RD 不應再維持獨立大型匯入卡片。

### 防回歸措施

- 靜態驗證禁止恢復可見的 `建立時已決定`、`會議紀錄中`、`個人紀錄中`。
- Browser smoke 以 `data-active-record-kind` 驗證 active state，不依賴長文案。
- Browser smoke 保留 composer DOM 順序檢查，確保 `summary marker -> project import -> workflow` 的結構仍可追蹤。
