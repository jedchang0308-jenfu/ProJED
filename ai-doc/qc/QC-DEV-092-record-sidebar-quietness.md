# QC-DEV-092：會議紀錄側欄資訊精簡

- 結論：`Local QC PASS / 未 Release`
- Source：DEV-092 working-tree boundary（保留既有 DEV-091 變更）
- 環境：Windows、local-test backend、`http://localhost:4000/`
- Viewport：1440×900、390×844
- 角色：`local-test-user`

## 執行事實

| 項目 | 實際結果 |
|---|---|
| Header 精簡 | 標題無裝飾 icon；無 `紀錄功能說明` button／modal；ChevronRight 收合控制位於右側抽屜最左側、ChevronLeft 展開，與離開控制分離 |
| Workflow | `會議流程` 標題與輔助說明、各階段 icon／副標題、`AI選用`、`AI整理來源：任務變更` 摘要列不存在；五個主要階段操作仍在；階段按鈕採緊湊高度，可操作階段使用 pointer cursor／hover、停用階段使用不可操作游標；新會議標題不含時間，紀錄時間為 `YYYY/MM/DD HH:mm` 且無上午／下午；idle／saved success recovery banner 不存在 |
| 關聯任務 | 會議空白摘要 `關聯任務 0 未選取` 與空白狀態 `選取任務` action 不存在；個人工作紀錄入口與已有關聯任務管理維持 |
| 表單版面 | 會議 `標題` 與 `紀錄時間` 位於同一橫列，24 小時文字格式維持；內容編輯器填滿其他固定區塊後的剩餘高度並保留最小可用高度，狀態／分享範圍控制列改為單列緊湊版，使用可讀短標籤且較原排列約縮減 50% 高度 |
| 互動 | desktop／窄版收合→展開成功，收合後 `ChevronLeft` 展開控制可用 |
| RWD／錯誤 | 390×844 bottom sheet 無水平溢出；visible alert、HTTP error、console error、page error 均為 0 |

## Evidence

- `npm run verify:dev-092-record-sidebar-quietness`（43 checks）
- `npm run verify:dev-092-record-sidebar-quietness-browser`（1440×900、390×844）
- `output/playwright/dev-092/record-sidebar-1440x900.png`
- `output/playwright/dev-092/record-sidebar-390x844.png`
- `npm run verify:dev-020-record-workflow-redesign`
- `npm run verify:dev-002-records`
- `npm run verify:dev-028-cross-mode-task-interactions`
- `npm exec tsc -- --noEmit`
- targeted ESLint、`git diff --check`

## QC trace 與限制

- 舊 `verify:dev-020-project-change-import-browser` 仍假設全域可用的 `新增個人紀錄`，但目前產品按既有契約顯示為未開放；本輪以 DEV-092 專用 meeting-record browser verifier 取得目標 UI 證據，不將該既有 baseline failure 歸因於 DEV-092。
- 未執行 production deploy、正式資料或 authenticated cross-device smoke；本結論只適用本地來源與 local-test UI。
