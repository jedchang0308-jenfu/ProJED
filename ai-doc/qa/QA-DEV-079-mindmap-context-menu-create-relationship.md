# QA-DEV-079：心智圖右鍵選單建立關聯線

狀態：`Executed / QA PASS / QC PASS / 未 Release`

## 驗證計畫

| Gate | 方法 | 通過條件 |
|---|---|---|
| Static contract | `npm run verify:dev-079-mindmap-context-menu-create-relationship` | PASS：6/6 action type/catalog/profile/menu/event/receiver assertions |
| Browser interaction | `npm run verify:dev-079-mindmap-context-menu-create-relationship-browser` | PASS：右鍵 action、source／target、inline label、Escape、board exclusion、390 boundary；artifact `output/playwright/dev-079-mindmap-context-menu-create-relationship/result.json` |
| Engineering | `npx tsc --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check` | PASS：無 error；targeted ESLint 僅既有 GlobalContextMenu 2 warnings |

## Browser evidence

- 共用既有 `127.0.0.1:4000` local test server，不啟動第二個 runtime。
- 測試建立隔離的 local QA 節點，驗證 1440x900 主要流程、1024x768 menu、390x844 boundary；artifact 顯示 `overflow=0`。
- 收集 console、page、request failure 與 visible runtime error；均為空。

## 回歸邊界

- 關聯線幾何、紅線標記清理、Delete／ESC、滑鼠平移與工具列清理沿用 DEV-027C、DEV-027E、DEV-077、DEV-076、DEV-078 的既有 evidence。
- 本 DEV 不執行 commit、push、PR、merge、deploy 或 production data 操作。
