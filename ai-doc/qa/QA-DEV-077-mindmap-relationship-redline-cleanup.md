# QA-DEV-077 心智圖關係線紅線標記元素清理

## 驗證結論

- 判定：通過（QA PASS／QC PASS／未 Release）
- 主要風險：移除 selected relationship 的輔助視覺時誤刪 endpoint、path、label 或既有刪除／編輯入口。

## Acceptance traceability

| ID | 驗收項目 | 自動證據 | 結果 |
| --- | --- | --- | --- |
| QA-077-001 | selected relationship 不渲染 control arms／guide | `REL-077-002`、`REL-077-004`、browser DOM counts | PASS |
| QA-077-002 | selected relationship 不渲染 square control points | `REL-077-002`、`REL-077-004`、browser DOM counts | PASS |
| QA-077-003 | endpoint circles 與 endpoint drag 保留 | `REL-077-001`、`REL-077-003`、endpoint count=2 | PASS |
| QA-077-004 | path、label、inline editor 與 style owner 保留 | `REL-077-005`、path=1／label=1／style drawer visible | PASS |
| QA-077-005 | existing relationship geometry data 不被清空 | DEV-027E stale geometry／zoom regression | PASS |
| QA-077-006 | 1440x900、1024x768、390x844 無 visible error／overflow | DEV-077 browser artifact、DEV-027B browser、error arrays=0 | PASS |

## QC focus

- Visible Error Sweep：檢查 `.inline-error`、`[role=alert]`、console、network 與空白畫面。
- Information Noise Sweep：紅筆刪除測試確認控制臂、導引線與方形控制點移除後不損失操作判斷。
- 視覺缺陷：關係線不與節點／label 重疊，endpoint 仍貼近節點邊界，style drawer 不被畫布遮住。
- Interaction：selected、hover、inline edit、endpoint drag、Delete／Backspace、zoom、left-pan 與 Escape recovery。

## Evidence

- Static: `npm run verify:dev-077-mindmap-relationship-redline-cleanup`
- Engineering: TypeScript、targeted ESLint、`npm run build:test`
- Browser: selected relationship screenshots and DOM counts for endpoint/path/label with zero control-point/arm elements.

## 實際證據

- Static: `npm.cmd run verify:dev-077-mindmap-relationship-redline-cleanup` → 6/6 PASS。
- Browser artifact: `output/playwright/dev-077-mindmap-relationship-redline-cleanup/result.json`；1440 desktop selected／zoomed、390 mobile boundary，redline selectors 全為 0；endpoint=2、path=1、label=1；console/page/network errors 全為 0。
- Regression: DEV-027E static 24/24、browser PASS；DEV-027B browser PASS。
- Engineering: TypeScript PASS、targeted ESLint PASS、`npm.cmd run build:test` PASS。
- Runtime: 重用既有專案 primary server `127.0.0.1:4000`，本輪未啟動或停止 server。

## Runtime boundary

沿用專案既有本機 primary server；若需啟動暫時 browser worker，須記錄 PID／port 並於驗證完成後只清理本輪建立的 process tree。
