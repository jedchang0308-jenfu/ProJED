# QA-DEV-027E: Xmind-like Note Relationship Line UX Parity

日期：2026-06-19
狀態：Ready
關聯規格：`ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md`

## QA 目標

驗證 ProJED 筆記型關聯線是否從「可建立的線」升級為「Xmind-like 可直接操作的圖形物件」。

## UI 驗證原則

- 必須使用真實瀏覽器，不接受只靠 static check。
- 必須截圖留證，至少包含：
  - 建立後初始選取狀態
  - inline label editing
  - endpoint drag preview
  - control point drag preview
  - style panel / popover
  - zoom 後 endpoints / control points 對齊
- 任一 visible runtime error、文字重疊、控制點偏移、hitbox 不可點選，皆為 Fail。

## 測試矩陣

| ID | 驗證項目 | 操作 | 通過標準 |
|---|---|---|---|
| QA-027E-001 | 線條本體可選取 | 點擊關聯線 path 中段 | 關聯線進入 selected state，任務 selection 清空 |
| QA-027E-002 | label 可選取 | 點擊 label | 關聯線 selected，label 有 active affordance |
| QA-027E-003 | inline label edit by double click | 雙擊線或 label | 不開 modal；畫布上出現 inline editor |
| QA-027E-004 | inline label edit by Space | 選取關聯線後按 Space | 進入 inline editor |
| QA-027E-005 | commit / cancel | inline edit 後 Enter / Escape / blur | Enter/blur 儲存；Escape rollback |
| QA-027E-006 | Delete / Backspace | 選取關聯線後按 Delete / Backspace | 關聯線從畫布與資料中移除 |
| QA-027E-007 | endpoints visible | 選取關聯線 | 兩端 circular endpoints 可見且貼近任務邊界 |
| QA-027E-008 | endpoint drag anchor | 拖曳 endpoint 沿同一任務邊界 | 連接點即時更新，mouseup 後位置保存 |
| QA-027E-009 | endpoint reconnect | 拖曳 endpoint 到第三個任務 | fromId/toId 更新，線條連到新任務 |
| QA-027E-010 | control point drag | 拖曳 square control point | 曲線即時改變，mouseup 後 geometry 保存 |
| QA-027E-011 | style panel | 選取關聯線後改顏色/粗細/線型/箭頭 | SVG path 與 label style 更新並保存 |
| QA-027E-012 | Reset Style | 套用自訂樣式後 Reset | 回到 ProJED 預設樣式 |
| QA-027E-013 | toolbar selected-node flow | 先選任務再按關聯線 | 選取任務成為 source，下一次點任務完成建立 |
| QA-027E-014 | toolbar two-click flow | 未選任務時按關聯線 | 依序選 source / target 完成建立 |
| QA-027E-015 | shortcut flow | `Ctrl+Shift+R` / `Shift+Command+R` | 進入關聯線建立模式 |
| QA-027E-016 | right-click flow | 任務右鍵建立關聯線 | 進入以該任務為 source 的建立模式 |
| QA-027E-017 | zoom stability | 50%、100%、150%、200% | hitbox、endpoints、control points、label 與 path 不偏移 |
| QA-027E-018 | collapse/filter resilience | collapse/filter endpoint 任務 | 資料不被誤刪；重新顯示後關聯線恢復 |
| QA-027E-019 | archived endpoint pruning | 封存或刪除 endpoint 任務 | 殘缺關聯線可被清理，不留下 orphan path |
| QA-027E-020 | regression | 跑 DEV-027B/027C/027D browser gates | 既有鍵盤、拖曳、日期、舊關聯線行為不退化 |

## 自動化 Gate

- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity`
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser`
- `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`

## Fail Criteria

- 使用者必須點透明 hitbox 才能選關聯線。
- inline editing 仍使用 modal / prompt 作為主流程。
- endpoints 或 control points 只是裝飾，不能拖。
- zoom 後控制點與 path 明顯錯位。
- style panel 改樣式後 reload 遺失。
- filter / collapse 誤刪仍存在的關聯線。
- 拖曳 endpoint 改連接對象後資料 fromId/toId 未更新。
- 任一 browser screenshot 出現 visible runtime error、重疊、overflow 或不可讀文字。
