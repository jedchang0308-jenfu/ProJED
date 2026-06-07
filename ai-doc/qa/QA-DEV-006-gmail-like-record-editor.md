# QA-DEV-006：Gmail-like 會議紀錄輸入器驗證計畫

狀態：Ready for QC
日期：2026-06-06
關聯：DEV-006、SPEC-006

## 驗證範圍

- 會議模式右側速記欄的 `內容` 輸入器。
- 紀錄庫開啟既有會議紀錄後的 `內容` 輸入器。
- inline task chip 的複製、剪下、貼上、移動與刪除。
- 既有紀錄 token 格式與 `record_task_links` 同步。

## 使用者關鍵流程

- 開始會議紀錄，直接在內容欄輸入與換行。
- 在內容中插入 task chip。
- 對已關聯 task chip 做 copy / cut / paste / move。
- 儲存或發布後重新開啟紀錄，確認內容一致。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| `Ctrl+A` 後打字未替換全文 | selection 與 controlled DOM 不一致 | 使用者快速改寫內容失敗 | 實際輸入測試 | P1 | 由 editor engine 接管 selection |
| `Ctrl+Z` 無效或觸發全域 undo | history scope 錯誤 | 會議內容無法復原 | 實際輸入測試 | P1 | editor focus 時攔截 editor undo |
| 多行貼上黏行 | HTML/text paste 序列化錯誤 | 會議紀錄不可讀 | 貼上測試與儲存字串檢查 | P1 | newline 正規化為 `\n` |
| IME 吃字或重字 | composition 期間重建 DOM | 中文輸入不可用 | 中文 IME 實測 | P1 | composition 期間不重建 editor state |
| task chip 複製後變普通文字 | clipboard metadata 缺失 | 關聯任務遺失 | copy/paste 測試 | P1 | copy 同時輸出 token 與 HTML metadata |
| task chip 剪下後關聯未同步 | content 與 taskLinks 同步缺漏 | 任務時間軸錯誤 | cut 後 link count 檢查 | P1 | content change 後重算 taskLinks |
| chip 移動後發布重開位置錯誤 | serialize/parse 不穩 | 會議內容失真 | 發布重開測試 | P2 | round trip verifier |
| 筆電 viewport 速記欄壓縮輸入 | viewport 佈局不足 | 桌機/筆電會議記錄不順 | 1024x768 viewport 測試 | P2 | 速記欄與輸入器需保留可操作空間 |

## 自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-002-records
npm.cmd run verify:dev-003-record-tags
npm.cmd run verify:dev-006-gmail-editor
npm.cmd run verify:dev-006-browser-input
npm.cmd run build
```

## 實際輸入測試

使用 `http://127.0.0.1:4173/` 固定測試環境。

1. 開始會議紀錄，點內容欄，輸入 `Alpha`、Enter、`Beta`。
   - 通過：畫面為兩行；儲存字串包含 `Alpha\nBeta`。
2. 在內容欄 `Ctrl+A` 後輸入 `Gamma`。
   - 通過：全文只剩 `Gamma`，沒有殘留舊文字。
3. 輸入 ` UndoX` 後按 `Ctrl+Z`，再按 `Ctrl+Y`。
   - 通過：undo 移除 `UndoX`；redo 恢復 `UndoX`。
4. 貼上 `Paste A\nPaste B`。
   - 通過：畫面與儲存字串都是兩行，不得變成 `Paste APaste B`。
5. 使用中文 IME 輸入 `今天討論開發進度`。
   - 通過：文字完整、不重複、不漏字。
6. 將游標放在句子中間，點看板任務插入 task chip。
   - 通過：chip 出現在游標位置，前後文字順序不變。
7. 選取單一 task chip，`Ctrl+C`，移到下一行 `Ctrl+V`。
   - 通過：貼上後仍是 chip；關聯任務摘要不重複。
8. 選取單一 task chip，`Ctrl+X`。
   - 通過：原位置移除；若內容沒有其他同任務 chip，關聯任務同步移除。
9. 將剪下的 chip 貼到段落 B。
   - 通過：chip 出現在段落 B；關聯任務恢復。
10. 選取「文字 + chip + 文字」混合內容，copy/paste 到下一段。
    - 通過：文字順序、換行與 chip 都保留。
11. 對 chip 邊界按 Backspace/Delete。
    - 通過：一次刪除整顆 chip，不留下破碎 token。
12. 發布後切到紀錄庫重新開啟。
    - 通過：文字、換行、chip、關聯任務一致。
13. 1024x768 筆電 viewport 重複輸入、貼上與 chip copy/cut/paste。
    - 通過：輸入區可見，不被速記欄或任務詳情遮蔽。

## 證據收集方式

- 自動驗證命令輸出。
- Browser DOM snapshot 或截圖。
- 發布前後的 editor 顯示內容。
- 必要時收集 local storage 中的 `KnowledgeRecord.content` 與 taskLinks。
