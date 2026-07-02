# SPEC-023: 專案變化匯入整併為紀錄流程第一步

對應 DEV: DEV-023  
父交付點: DEV-020  
節點類型: 開發點  
狀態: Implemented / Browser QC Passed
優先級: P1  
是否計入產品交付完成: 否

## 背景

DEV-020 已完成紀錄功能重構，並把「先匯入專案變化」放在紀錄流程前方。使用者後續實測指出，獨立大型匯入卡片與下方「會議流程」形成上下分離，實際上同屬一段紀錄作業，卻被 UI 表達成兩個作業區。這會增加版面高度、降低流程連續性，也讓使用者誤以為匯入是紀錄流程外的前置功能。

DEV-023 定義為 DEV-020 的 UX refinement 開發點，不新增產品交付點。目標是把 `先匯入專案變化` 整併為紀錄流程第一步，讓會議紀錄與個人工作紀錄都使用同一種流程語法。

## 目標

- 會議紀錄與個人工作紀錄都以 `匯入` 作為 optional first step。
- 預設版面精簡，只顯示流程步驟與必要狀態。
- 使用者點擊 `匯入` step 後，才展開日期、範圍、預覽、插入與跳過。
- 保留既有 project change import preview、legacy protected content / single-record merge guard 行為；實際插入時，project change 預覽應直接寫入 `2. 任務討論與結論`。
- 不改資料庫 schema，不改 record content persistence 格式。

## 流程定義

會議紀錄流程必須顯示 5 個 step：

```text
匯入 -> 速記 -> AI整理 -> 校稿 -> 發布
```

個人工作紀錄流程必須顯示 4 個 step：

```text
匯入 -> 撰寫 -> 存草稿 -> 發布
```

`匯入` 是 optional step。使用者可以跳過匯入，直接速記、撰寫、存草稿或發布。

## UI 行為

- `先匯入專案變化` 不再作為 workflow 上方的獨立大卡片。
- `匯入` step 顯示在 workflow card 第一格。
- 預設收合匯入設定，只顯示 step 名稱、狀態與匯入事件數。
- 使用者點擊 `匯入` step 後，在同一個 workflow card 內展開 `data-project-change-import-panel`。
- 匯入面板保留以下控制：
  - 起始日期
  - 結束日期
  - 整個看板
  - 整個工作區
  - 整理專案變化
  - 插入紀錄並開始撰寫
  - 跳過
- 點擊 `跳過` 後，`匯入` step 顯示已略過，面板收合，不阻擋後續流程。
- 點擊 `插入紀錄並開始撰寫` 後，`匯入` step 顯示已插入與事件數，面板收合，游標與下一步操作應回到紀錄撰寫脈絡；插入內容應落在 `2. 任務討論與結論`。
- 空資料與錯誤狀態應在展開面板內呈現，不阻擋後續撰寫、存草稿或發布。

## 不變式

- `wrapProjectChangeImportContent` 保留作為 legacy / merge guard，相容舊草稿；新插入路徑應直接寫入 `2. 任務討論與結論`，不得改回 raw preview 直接 append 到文末。
- DEV-021 的「已匯入專案變化不得被 AI整理丟失」guard 必須仍成立。
- DEV-022 的「匯入內容必須統整進同一份會議紀錄」guard 必須仍成立。
- 不得新增資料庫 schema、migration 或持久化 record content 格式。
- `data-project-change-import-panel` 必須位於 workflow card 內，不可回到 workflow 上方獨立卡片。
- `匯入` step 的 collapsed / expanded / skipped / inserted / error 狀態必須可被 UI 與 verifier 辨識。

## Data / Interface Markers

RD implementation must expose these stable markers for verification:

- `data-record-composer-workflow`
- `data-meeting-workflow-step="project_import"`
- `data-work-log-workflow-step="project_import"`
- `data-project-change-import-panel`

The product implementation should keep existing DEV-020 / DEV-021 / DEV-022 markers unless a later spec explicitly replaces them.

## Acceptance Criteria

- 會議紀錄流程顯示 5 個 step：`匯入`、`速記`、`AI整理`、`校稿`、`發布`。
- 個人工作紀錄流程顯示 4 個 step：`匯入`、`撰寫`、`存草稿`、`發布`。
- `先匯入專案變化` 不再是流程上方獨立大卡片。
- 匯入設定只在使用者點擊 `匯入` step 後展開。
- 匯入、跳過、插入後的流程狀態必須可辨識。
- 不改資料庫 schema，不改 record content persistence 格式。
- DEV-021 / DEV-022 project change preserve 與 single-record merge verifier 必須仍通過。

## 實作與 QC 結果

2026-06-29 已確認 DEV-023 行為落地：

- 會議紀錄 workflow 第一格為 `匯入`，流程為 `匯入 -> 速記 -> AI整理 -> 校稿 -> 發布`。
- 個人工作紀錄 workflow 第一格為 `匯入`，流程為 `匯入 -> 撰寫 -> 存草稿 -> 發布`。
- `data-project-change-import-panel` 預設收合，點擊 `匯入` 後在 `data-record-composer-workflow` 內展開。
- Project change preview 可沿用既有摘要生成；插入時應將預覽內文寫入 `2. 任務討論與結論`，legacy protected block 只保留相容性。
- DEV-021 preserve 與 DEV-022 single-record guard 已通過回歸。
- 本 DEV 未新增資料庫 schema、migration 或 record content persistence 格式。

## Regression Gate

RD 完成後至少需通過：

```powershell
npm.cmd run verify:dev-020-record-workflow-redesign
npm.cmd run verify:dev-020-project-change-import-browser
npm.cmd run verify:dev-021-project-change-ai-preserve
npm.cmd run verify:dev-022-project-change-single-record
npm.cmd run verify:dev-023-record-project-change-import-workflow-step
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```
