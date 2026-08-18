# QA-DEV-072：共用彈窗按鈕鍵盤導航驗證計畫

- 開發點：DEV-072
- 需求來源：`USER-20260818-GLOBAL-DIALOG-KEYBOARD-NAVIGATION`
- 測試類型：共用元件功能、鍵盤可及性、跨模式預設值與回歸
- 目標狀態：Local Functional PASS；正式環境需另走 release gate
- 主要規格：`SPEC-072-global-dialog-keyboard-navigation.md`

## 1. 測試範圍

驗證所有使用 `GlobalDialog` 的模式共用同一套按鈕焦點與鍵盤行為。測試不重新驗證心智圖／看板的任務操作差異；那些行為仍由 `SPEC-070`／`SPEC-028`／`SPEC-027B` 管理。附圖僅作為 confirm dialog 的視覺情境參考。

## 2. FMEA

| 失效模式 | 影響 | 原因 | S | O | D | RPN | 預防／檢出 |
|---|---|---|---:|---:|---:|---:|---|
| Confirm 預設焦點落在取消 | Enter 可能誤取消高風險操作，使用者以為已確認 | 初始索引與按鈕 DOM 順序混淆 | 8 | 3 | 3 | 72 | SPEC 固定 confirm index=1；browser case 驗證 active index |
| 左右鍵未循環或方向相反 | 鍵盤使用者無法快速選擇按鈕 | index 計算、wrap 或 RTL 語意錯誤 | 6 | 3 | 3 | 54 | ArrowLeft／Right + circular browser case |
| Enter 執行非目前聚焦按鈕 | 取消後誤刪除／誤提交 | handler 使用固定 index 或 activeElement 不同步 | 9 | 2 | 3 | 54 | 左鍵後 Enter 必須關閉且回傳取消結果 |
| Prompt 左右鍵被攔截 | 編輯文字時游標跳到按鈕，輸入內容不易修正 | 未區分 text editing target | 6 | 3 | 4 | 72 | static contract + prompt input manual/browser follow-up |
| Action dialog 未聚焦第一個 action | 多選流程 Enter 觸發錯誤 action | action 與 confirm 使用同一預設索引 | 8 | 2 | 3 | 48 | static assertion `type === action ? 0 : 1` |
| keydown 穿透底層模式 | 背景任務被選取、建立或移動 | 未 preventDefault／capture 邊界不足 | 7 | 3 | 3 | 63 | static assertion + dialog browser smoke |
| 某模式自行覆寫預設 | 看板、心智圖等模式行為分裂 | 在 mode component 重複實作 dialog keyboard | 7 | 2 | 4 | 56 | 只允許 GlobalDialog 實作；跨模式 regression |
| focus ring 不可見 | 使用者不知道目前 Enter 會執行哪個按鈕 | focus-visible 樣式缺漏 | 5 | 3 | 4 | 60 | rendered 1440x900 visual/DOM smoke |

RPN = Severity × Occurrence × Detection；RPN ≥ 60 的項目需於 local QC evidence 明確留存。

## 3. 驗證案例

| Case | 驗證 | 通過條件 | 證據 |
|---|---|---|---|
| QA-072-001 | 靜態契約 | dialog marker、ARIA、decision refs、左右鍵與 preventDefault 存在 | `verify-dev-072-global-dialog-keyboard-navigation.mjs` |
| QA-072-002 | Confirm 預設焦點 | 開啟 confirm 後 active decision index = 1 | browser verifier |
| QA-072-003 | ArrowLeft + Enter | 從確認移到取消，Enter 關閉且不執行刪除 | browser verifier |
| QA-072-004 | 循環導航 | 取消往右回確認；再次左右可重複 | browser verifier |
| QA-072-005 | Prompt 游標保護 | prompt 輸入框左右鍵維持原生 caret；Enter 提交字串 | static contract；必要時手動補測 |
| QA-072-006 | Action 預設 | action dialog 第一個 action active | static contract；action guard flow 可用時補 browser |
| QA-072-007 | 關閉與回歸 | Escape／X 維持既有回傳；DEV-028 等跨模式 regression 不變 | regression verifier + TypeScript/build |

## 4. 執行命令

```text
node scripts/verify-dev-072-global-dialog-keyboard-navigation.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-playwright-code.ps1 -SessionPrefix dev072-dialog-keyboard -Filename scripts/verify-dev-072-global-dialog-keyboard-navigation-browser.pw.js -OutputDirectory output/playwright/dev-072-dialog-keyboard
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
node scripts/verify-dev-028-cross-mode-task-interactions.mjs
```

## 5. QC 邊界

- 測試 runtime 使用既有 `127.0.0.1:4000` temporary local environment；不得停止受保護的 `127.0.0.1:4173`。
- 本計畫不含 deploy、production smoke、push 或 release sign-off。
- 若 browser verifier 受既有 fixture／資料初始化影響，須記錄為 fixture blocker，不得改以手動點擊宣稱跨模式全數通過。

## 6. 實際 QC 執行結果

- `npm.cmd run verify:dev-072-global-dialog-keyboard-navigation`：PASS。
- DEV-072 browser verifier：PASS；1440x900、0 console error；預設「確認」、ArrowLeft + Enter 取消不刪除、左右循環回到「確認」。
- `node scripts/verify-dev-028-cross-mode-task-interactions.mjs`：45/45 PASS。
- `node scripts/verify-dev-010-action-feedback.mjs`：PASS（7 file groups）。
- `npm.cmd exec tsc -- --noEmit`：PASS。
- `npm.cmd run build:test`：PASS；Vite 2012 modules、PWA service worker generated。
- Runtime：`127.0.0.1:4173` 與既有 `127.0.0.1:4000` 均維持 listening；未停止或重啟受保護環境。
