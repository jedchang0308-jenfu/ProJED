# QC-DEV-088：任務完成、封存與永久刪除生命週期

- 結論：PASS（local implementation / 未 Release）
- 日期：2026-08-25
- 依據：SPEC-088、QA-DEV-088
- 環境：local-test；desktop 1440×900、mobile 390×844

## 事實驗證

| 驗證面 | 結果 | 證據 |
|---|---|---|
| 完成／取消完成 | PASS | Task details status `todo → completed → todo`；全程 `isArchived = false`。 |
| Active task 封存入口 | PASS | 桌機 menu 只顯示 `封存任務`／`task.archive`；無刪除或永久刪除入口。 |
| 封存與還原 | PASS | 封存後 active card 隱藏；回收桶可還原；dependency fingerprint 保留。 |
| 取消永久刪除 | PASS | 任務與 1 個子任務均保留。 |
| Persistence failure | PASS | 注入 dependency delete rejection；錯誤可見，封存子樹、dependency 與回收桶項目均保留。 |
| 永久刪除 | PASS | 確認後刪除 parent + child 共 2 筆及命中 dependency；reload 後未復活。 |
| UI／RWD／a11y | PASS | 無水平溢出；還原與永久刪除有 accessible name；人工檢查後提高 mobile 按鈕對比並重驗。 |
| Browser diagnostics | PASS | console error 0、page error 0、HTTP 4xx/5xx 0、非預期 visible alert 0。 |

## Regression 與工程 Gate

- DEV-088 static／browser：PASS。
- DEV-029：static 39/39、browser PASS。
- DEV-038：static 20/20、browser PASS。
- DEV-044：26/26；DEV-062：PASS；DEV-070：58/58；DEV-027G：97/97。
- TypeScript：PASS；`build:test`：PASS；targeted ESLint：0 error（8 個既有 warning）；`git diff --check`：PASS。

## Artifact

- `output/playwright/dev-088-task-lifecycle/result.json`
- `output/playwright/dev-088-task-lifecycle/desktop-recycle-bin.png`
- `output/playwright/dev-088-task-lifecycle/mobile-recycle-bin.png`
- `output/playwright/dev-070/after/interaction-matrix.json`

## 殘餘邊界

- 本輪未碰 production data、migration、deploy 或 release。
- 現行跨多筆持久層刪除採可重試的序列操作，不是 production database transaction。若要 release，需在 deployment/release gate 驗證正式 backend 的 partial-failure 回復策略或 transactional RPC。
- 既有 DEV-027 legacy verifier 仍有 3 項與本 DEV 無關的精確字串漂移；DEV-027G 系統健康 gate 97/97 PASS，本次改動的 archive subtree guard 已 PASS。
