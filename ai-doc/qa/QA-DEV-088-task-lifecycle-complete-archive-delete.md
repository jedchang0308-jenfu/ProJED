# QA-DEV-088：任務完成、封存與永久刪除驗證計畫

- 狀態：Executed / PASS / 未 Release
- 日期：2026-08-25
- 依據：SPEC-088
- 風險：Medium

## 驗證範圍

驗證 local-test 環境中的完成切換、跨任務入口封存、回收桶還原、單筆永久刪除與清空回收桶。UI 證據至少涵蓋 desktop 1440×900 與 mobile 390×844；production、正式資料與真機不在本輪。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|---|
| 封存仍顯示刪除 | 舊 label／selector 殘留 | 誤認為不可復原 | source + rendered text sweep | P1 | 跨入口文字驗證 |
| 封存移除 dependency | 沿用舊 removeNode 清理 | 還原後關聯遺失 | 封存前後 fixture fingerprint | P0 | archive／restore round trip |
| 永久刪除仍只是軟封存 | 回收桶呼叫 archive action | 資料未真正清除 | storage reload + DOM | P0 | 單筆 hard-delete reload |
| 永久刪除留下子節點／關聯 | 未收集子樹或 dependency | orphan data／任務復活 | fixture row/dependency counts | P0 | parent subtree delete |
| 失敗卻從 UI 消失 | optimistic local removal | 假成功、資料不一致 | 注入 persistence failure | P0 | fail-keeps-item negative case |
| 危險入口出現在 active surface | action catalog／menu 未隔離 | 誤觸不可逆刪除 | action selector sweep | P0 | active surfaces 只允許 archive |
| mobile rail 擠壓或誤標 | 四 action 文字變更 | 操作不可讀／誤觸 | 390×844 screenshot + geometry | P1 | rail labels／overflow |
| icon-only 回收桶操作不可存取 | 只有 title、無 accessible name | 鍵盤／screen reader 無法使用 | role/name + keyboard | P1 | aria-label／focus flow |

## 測試案例

- QA-088-001：未完成任務切換完成，再取消完成；任務仍 active。
- QA-088-002：從桌機任務選單封存；確認 active view 隱藏、回收桶顯示「封存任務」。
- QA-088-003：還原任務；確認 identity、status、parent 與 dependency fingerprint 不變。
- QA-088-004：mobile action rail 顯示 `完成／取消完成、新增並列、新增子任務、封存任務`，不含刪除。
- QA-088-005：取消永久刪除；項目與 storage 保持不變。
- QA-088-006：永久刪除封存 parent；確認子樹與命中 dependency 被刪除，reload 後不復活。
- QA-088-007：清空回收桶顯示 board、數量與不可復原警告；確認後清空。
- QA-088-008：注入持久層失敗；UI 保留封存項並出現可見錯誤。
- QA-088-009：desktop／mobile 無水平溢出、重疊、文字截斷；按鈕有可存取名稱與焦點。
- QA-088-010：執行 DEV-029／038／044／062／070 targeted regressions、TypeScript、build:test 與 visible-error sweep。

## 通過標準與證據

所有 P0/P1 案例通過；console、page error、可見 `[role=alert]` 非預期錯誤與 HTTP 4xx/5xx 為 0。UI 必須保存 viewport、URL、操作步驟、結果 JSON 與 screenshot；缺 rendered evidence 判定為未充分驗證。

## QC 指令

- `npm run verify:dev-088-task-lifecycle`
- `npm run verify:dev-088-task-lifecycle-browser`
- `npm run verify:dev-029-mobile-pan-first-interactions`
- `npm run verify:dev-029-mobile-pan-first-interactions-browser`
- `npm run verify:dev-038-settings-scope-consistency`
- `npm run verify:dev-044-undo-coverage`
- `npm run verify:dev-062-simplified-task-status`
- `npm run verify:dev-070-interaction-kernel`
- `npx tsc --noEmit`
- `npm run build:test`

## 執行結果（2026-08-25）

- DEV-088 static contract：PASS。
- DEV-088 browser：PASS；完成／取消完成 round trip、封存、還原、dependency 保留、取消永久刪除、注入 persistence failure 保留封存項、確認永久刪除 2 筆子樹與 reload 不復活均通過。
- Viewport：desktop 1440×900、mobile 390×844；無水平溢出，回收桶還原／永久刪除控制具 accessible name，人工畫面檢查後提高操作按鈕可見度並重驗 PASS。
- Regression：DEV-029 static 39/39 + browser PASS；DEV-038 static 20/20 + browser PASS；DEV-044 26/26；DEV-062 PASS；DEV-070 58/58；DEV-027G 97/97。
- 工程 gate：TypeScript PASS、`build:test` PASS、targeted ESLint 0 error（8 個既有 warning）、`git diff --check` PASS。
- 證據：`output/playwright/dev-088-task-lifecycle/result.json`、`desktop-recycle-bin.png`、`mobile-recycle-bin.png`、`ai-doc/qc/QC-DEV-088-task-lifecycle-complete-archive-delete.md`。
