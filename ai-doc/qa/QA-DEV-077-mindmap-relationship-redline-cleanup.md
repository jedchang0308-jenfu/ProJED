# QA-DEV-077 心智圖關聯線多餘導引線清理

## 2026-08-25 契約校正

- 使用者澄清：原紅線只要求刪除控制 UI 多畫的一條線，沒有要求移除 control arms 或 square control points。
- 先前「control arms／square points 全部為 0」的 QA acceptance 與 browser PASS 只證明當時實作符合錯誤規格，不能證明符合使用者意圖。
- 現行產品通過標準由 `SPEC-085`、`QA-DEV-085`、`QC-DEV-085` 與 DEV-085 browser artifact 承接；下方舊執行證據只保留為歷史誤讀紀錄。

## 驗證結論

- 判定：歷史執行結果已被使用者澄清推翻；DEV-085 更正已完成，現行 QA／QC PASS／未 Release。
- 主要風險：把「刪除多畫的一條中央 guide」誤做成刪除完整 control affordance，使曲線失去可調整性。

## Acceptance traceability

| ID | 驗收項目 | 自動證據 | 結果 |
| --- | --- | --- | --- |
| QA-077-001 | selected relationship 不渲染 `control-1 → control-2` 中央 guide | DEV-085 static／browser | PASS |
| QA-077-002 | 兩條 endpoint control arms 與兩個 square control points 可見 | DEV-085 static／browser | PASS |
| QA-077-003 | control point 拖曳即時改曲線並保存 | QA-DEV-085 B02／B03 | PASS |
| QA-077-004 | endpoint circles 與 endpoint drag 保留 | DEV-085／DEV-027E regression | PASS |
| QA-077-005 | path、label、inline editor 與 style owner 保留 | DEV-027E regression | PASS |
| QA-077-006 | 1440×900、1024×768、390×844 無 visible error／overflow | QA-DEV-085 B07／B08 | PASS |

## QC focus

- Visible Error Sweep：檢查 `.inline-error`、`[role=alert]`、console、network 與空白畫面。
- Information Noise Sweep：只移除 control point 彼此相連的中央 guide；控制臂與方形 control point 必須保留且不重複。
- 視覺缺陷：關係線不與節點／label 重疊，endpoint 仍貼近節點邊界，style drawer 不被畫布遮住。
- Interaction：selected、hover、inline edit、endpoint drag、Delete／Backspace、zoom、left-pan 與 Escape recovery。

## Evidence

- Static: `npm run verify:dev-077-mindmap-relationship-redline-cleanup`
- Engineering: TypeScript、targeted ESLint、`npm run build:test`
- Browser: DEV-085 selected／drag／reload screenshots，證明 2 arms、2 square controls、center guide=0。

## 實際證據

- Static: `npm.cmd run verify:dev-077-mindmap-relationship-redline-cleanup` → 6/6 PASS。
- Historical browser artifact: `output/playwright/dev-077-mindmap-relationship-redline-cleanup/result.json`；其 controls 全為 0 的結果已被判定為誤讀證據，不得用來否定 DEV-085 方向搖桿。
- Regression: DEV-027E static 24/24、browser PASS；DEV-027B browser PASS。
- Engineering: TypeScript PASS、targeted ESLint PASS、`npm.cmd run build:test` PASS。
- Runtime: 重用既有專案 primary server `127.0.0.1:4000`，本輪未啟動或停止 server。

## Runtime boundary

沿用專案既有本機 primary server；若需啟動暫時 browser worker，須記錄 PID／port 並於驗證完成後只清理本輪建立的 process tree。
