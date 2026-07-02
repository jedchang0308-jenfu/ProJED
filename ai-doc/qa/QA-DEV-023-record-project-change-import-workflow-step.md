# QA-DEV-023: 專案變化匯入整併為紀錄流程第一步驗證計畫

對應 DEV: DEV-023  
父交付點: DEV-020  
節點類型: 開發點  
狀態: Browser QC Passed
優先級: P1

## 驗證目標

確認 `先匯入專案變化` 不再作為獨立大型前置卡片，而是整併為會議紀錄與個人工作紀錄流程的第一個 optional step。驗證必須包含自動化檢查與真實操作測試，不能只用靜態字串或 RD 自述判定通過。

此變更必須同時滿足：

- 預設 UI 高度下降，匯入設定預設收合。
- 會議與個人工作紀錄都以 `匯入` 作為流程第一步。
- 點擊 `匯入` 後，設定面板只在 workflow card 內展開。
- 插入、跳過、空資料、錯誤狀態都可辨識。
- DEV-021 / DEV-022 的 project change preserve 與 single-record integration guard 無回歸。

## 驗證範圍

包含：

- 會議紀錄流程：`匯入 -> 速記 -> AI整理 -> 校稿 -> 發布`。
- 個人工作紀錄流程：`匯入 -> 撰寫 -> 存草稿 -> 發布`。
- project change import collapsed / expanded / skipped / inserted / empty / error states。
- 新的 project change 插入路徑會把預覽內容直接寫入 `2. 任務討論與結論`，既有 AI整理 merge guard 回歸。
- 1024px 與 1440px viewport 的水平 overflow、重疊、截斷與按鈕可點擊性。
- 真實操作測試：由 QC 在 browser 中實際點擊、輸入、整理、插入、跳過、存草稿或發布。

不包含：

- 新資料庫 schema。
- 新 persistence 格式。
- 新 AI prompt policy。
- 手機版 release gate。

## 使用者關鍵流程

1. 會議紀錄使用者開啟 composer，第一眼只看到精簡流程列，`匯入` 是第一步但不佔大型卡片高度。
2. 使用者可直接速記，不需要先處理匯入。
3. 使用者點擊 `匯入`，設定日期與範圍，整理專案變化，確認預覽後插入紀錄。
4. 使用者使用 AI整理，已匯入的 project change evidence 被統整進同一份會議紀錄，不產生第二份完整會議內容。
5. 個人工作紀錄使用者可點擊 `匯入` 後跳過，也可直接撰寫、存草稿或發布。

## FMEA 風險表

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 匯入仍以大型卡片顯示在流程上方 | 只更新文件，未改 DOM 或 render 順序 | 使用者仍覺得流程割裂、版面過高 | 真實開啟 composer，確認 workflow 上方沒有 `data-project-change-import-panel` | P1 | ROT-001、ROT-004、browser DOM check |
| `匯入` 沒有成為兩種紀錄的第一步 | 只修會議流程，漏掉個人工作紀錄 | 個人紀錄 UX 不一致 | 檢查 meeting/work-log step 數量與第一格文字 | P1 | TC-001、TC-002、ROT-001、ROT-004 |
| 點擊 `匯入` 後面板展開在 workflow 外 | 面板搬移不完整，仍在舊容器 | UI 語意仍不符合 DEV-023 | 檢查 `data-project-change-import-panel` 是否為 `data-record-composer-workflow` descendant | P1 | TC-004、ROT-002、ROT-005 |
| 插入後破壞 DEV-021 preserve guard | 改 UI 時未將預覽內容納入會議紀錄正文 | AI整理或保存時丟失匯入內容 | 跑 DEV-021 verifier，並真實操作匯入後 AI整理 | P1 | TC-006、TC-009、ROT-003 |
| AI整理後產生兩份會議內容 | fallback append 行為回歸 | 會議紀錄混亂、校稿成本增加 | 跑 DEV-022 verifier，檢查發布前內容只存在一組 `1/2/3` 主結構 | P1 | TC-009、ROT-003 |
| 跳過狀態不可辨識 | step state 未更新或收合後沒有訊號 | 使用者不知道自己是否已處理匯入 | 真實點擊跳過，觀察 `匯入` step hint | P2 | TC-007、ROT-005 |
| 空資料或錯誤阻擋撰寫 | empty/error 狀態處理不當 | 使用者無法繼續紀錄 | 使用無變化日期或起訖日期錯誤測試 | P2 | TC-008、ROT-006 |
| 1024 viewport 發生溢出或按鈕擠壓 | 5 step arrow 在窄寬側欄下過密 | 使用者看不到或點不到流程步驟 | 1024x768 screenshot 與 scrollWidth 檢查 | P1 | TC-010、ROT-007 |
| 真實資料與固定測試資料結果不同 | 只驗固定測試環境，未測實際事件 | 上線後匯入沒有真實可用性證據 | 使用本機測試環境實際建立/修改任務產生活動事件 | P2 | ROT-002、ROT-003 |

## 資料需求

真實操作測試需至少準備：

- 一個可操作看板。
- 最近 7 天內至少 3 筆任務變化，建議包含：
  - 新增任務。
  - 狀態變更。
  - 子任務新增、封存、日期或移動任一種。
- 一個無資料日期範圍，例如未來日期或沒有事件的歷史區間。
- 一筆會議紀錄草稿。
- 一筆個人工作紀錄草稿。

若固定測試環境沒有足夠活動資料，QC 應先在測試看板上手動新增或修改任務，再返回紀錄 composer 執行匯入。

## Test Cases

| ID | 類型 | 情境 | 步驟 | 預期結果 |
|---|---|---|---|---|
| TC-001 | Static / Browser | 會議流程顯示匯入第一步 | 開啟會議紀錄 composer | workflow 顯示 `匯入 -> 速記 -> AI整理 -> 校稿 -> 發布`，且有 `data-meeting-workflow-step="project_import"`。 |
| TC-002 | Static / Browser | 個人流程顯示匯入第一步 | 開啟個人工作紀錄 composer | workflow 顯示 `匯入 -> 撰寫 -> 存草稿 -> 發布`，且有 `data-work-log-workflow-step="project_import"`。 |
| TC-003 | Browser | 移除流程上方獨立大卡片 | 開啟任一 composer，檢查 DOM 順序 | workflow 上方不得出現獨立 `先匯入專案變化` 大卡片；預設不顯示 `data-project-change-import-panel`。 |
| TC-004 | Browser / Manual | 點擊匯入後才展開設定 | 預設開啟 composer，再點擊 `匯入` step | 預設不顯示完整日期/範圍/預覽設定；點擊後才展開 `data-project-change-import-panel`，且該 panel 位於 workflow card 內。 |
| TC-005 | Manual | 匯入控制可用 | 展開匯入面板 | 可操作起始日期、結束日期、整個看板、整個工作區、整理專案變化、插入與跳過。 |
| TC-006 | Manual / Automated | 插入後狀態可辨識 | 有 project changes 時執行整理與插入 | 內容直接插入 `2. 任務討論與結論`；`匯入` step 顯示已插入與事件數；面板收合。 |
| TC-007 | Manual | 跳過後狀態可辨識 | 展開面板後點擊跳過 | `匯入` step 顯示已略過；面板收合；可繼續撰寫、存草稿或發布。 |
| TC-008 | Manual | 空資料與錯誤 | 使用無變化日期範圍；再測起始日期晚於結束日期 | 面板內顯示 empty/error 訊息；不阻擋後續流程。 |
| TC-009 | Automated / Manual | AI整理 preserve 回歸 | 匯入後使用 AI整理，再存草稿/發布 | DEV-021 preserve verifier 與 DEV-022 single-record verifier 仍通過；真實內容不得產生第二份完整會議內容。 |
| TC-010 | Browser / Manual | Viewport | 在 1024px 與 1440px 檢查 composer | 預設版面比 DEV-020 獨立卡片更精簡，且無水平 overflow、文字重疊或控制項裁切。 |

## 真實操作測試

QC 必須至少執行以下真實操作測試。這些測試需在 browser 中實際點擊，不可只用靜態 verifier 代替。

| ID | 前置條件 | 操作步驟 | 預期結果 | 必留證據 |
|---|---|---|---|---|
| ROT-001 | 啟動 `http://127.0.0.1:4173/`，使用固定測試環境或測試帳號 | 開啟會議紀錄 composer，不點擊任何匯入操作 | 第一眼只看到 workflow card；5 個 step 依序為 `匯入 / 速記 / AI整理 / 校稿 / 發布`；workflow 上方沒有大型匯入卡片 | 1440px 截圖、DOM count：`data-project-change-import-panel = 0` |
| ROT-002 | 測試看板最近 7 天有任務變化 | 點擊會議流程的 `匯入`，確認日期、切換看板/工作區，按 `整理專案變化` | 面板在 workflow card 內展開；可看到預覽、事件數與插入 CTA | 展開後截圖、日期範圍、scope、事件數 |
| ROT-003 | ROT-002 已產生預覽 | 點擊 `插入紀錄並開始撰寫`，再按 `AI整理`，確認內容後存草稿或發布 | 匯入 step 顯示已插入；面板收合；內容保留 project change evidence；AI整理後只有一份會議紀錄主結構 | 插入後截圖、AI整理後內容節錄、草稿/發布時間 |
| ROT-004 | 開啟個人工作紀錄 composer | 不點擊匯入，直接輸入標題與內容，存草稿 | 個人流程顯示 4 step；預設不展開匯入面板；未使用匯入也可存草稿 | 1440px 截圖、存草稿成功訊息 |
| ROT-005 | 開啟個人工作紀錄 composer | 點擊 `匯入` 後按 `跳過`，再撰寫並存草稿 | 匯入 step 顯示已略過；面板收合；後續撰寫與存草稿不受阻擋 | 跳過後截圖、草稿狀態 |
| ROT-006 | 開啟任一 composer | 點擊 `匯入`，設定起始日期晚於結束日期並按整理；再設定無資料日期範圍 | 錯誤與空資料訊息留在面板內；使用者仍可關閉或繼續撰寫 | error/empty 截圖、實際日期 |
| ROT-007 | 同一測試環境 | 分別在 1024x768 與 1440x950 重複 ROT-001 與展開匯入 | 無水平 overflow、無文字重疊、無按鈕被裁切；展開後仍可操作主要 CTA | 兩個 viewport 截圖、scrollWidth <= clientWidth 記錄 |

## Static / Verifier Expectations

文件 verifier、靜態檢查或 browser smoke 需涵蓋：

- `data-meeting-workflow-step="project_import"`。
- `data-work-log-workflow-step="project_import"`。
- `data-project-change-import-panel` 位於 workflow card 內。
- 預設不存在 `data-project-change-import-panel`。
- 不存在 workflow 上方獨立匯入卡片順序。
- `wrapProjectChangeImportContent` 仍保留作為 legacy / merge guard；新插入內容應直接落在 `2. 任務討論與結論`。
- DEV-021 / DEV-022 regressions 仍列入 release gate。
- QA 文件必須保留 `真實操作測試` 與 ROT-001 至 ROT-007。

## QC 執行指令

自動化與建置 gate：

```powershell
npm.cmd run verify:dev-023-record-project-change-import-workflow-step
npm.cmd run verify:dev-020-record-workflow-redesign
npm.cmd run verify:dev-020-project-change-import-browser
npm.cmd run verify:dev-021-project-change-ai-preserve
npm.cmd run verify:dev-022-project-change-single-record
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

真實操作測試：

```powershell
npm.cmd run dev:test:server
```

然後由 QC 在 browser 開啟 `http://127.0.0.1:4173/`，依 ROT-001 至 ROT-007 實際點擊並收集證據。

## 失敗時需收集的證據

- 測試 ID。
- viewport。
- URL / route。
- 操作步驟。
- 實際結果與預期結果差異。
- 截圖路徑。
- console error 或 network error。
- 若涉及匯入，需記錄日期範圍、scope、事件數與插入後內容節錄。
- 若涉及 AI整理，需記錄 AI整理後內容是否只有一組 `1. 本次會議總結 / 2. 任務討論與結論 / 3. 其他或待校稿項目` 主結構。

## QA 判定

DEV-023 可交付 QC 的條件：

- TC-001 至 TC-010 有明確驗證方式。
- ROT-001 至 ROT-007 可由 QC 實際操作。
- 自動化 verifier 能重複執行。
- 真實操作測試有截圖、viewport 與操作證據要求。
- DEV-021 / DEV-022 guard 無回歸。
- PM 文件明確標示 DEV-023 為 DEV-020 UX refinement 開發點，不新增產品交付點。

## 本輪 QC 結果（2026-06-29）

- Pass：`npm.cmd run verify:dev-023-record-project-change-import-workflow-step`，18 checks。
- Pass：`npm.cmd run verify:dev-020-record-workflow-redesign`。
- Pass：`npm.cmd run verify:dev-020-project-change-import-browser`，產出 1440px 與 1024px 截圖。
- Pass：`npm.cmd run verify:dev-021-project-change-ai-preserve`。
- Pass：`npm.cmd run verify:dev-022-project-change-single-record`。
- Pass：`npm.cmd exec tsc -- --noEmit`。
- Pass：`$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build`。

註記：DEV-020 browser verifier 已修正 linked-task selector 的過時假設。現行 UI 是先點 `關聯任務` toggle，再於 `data-record-linked-tasks-list` 中顯示 `選取任務` 按鈕。
