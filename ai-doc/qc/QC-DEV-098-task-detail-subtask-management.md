# QC-DEV-098：任務明細子任務管理區

- 結論：`LOCAL INDEPENDENT QC PASS / ADJACENT REGRESSION AUDIT PASS / 未 Deploy / 未 Release`
- Source：`working-tree` boundary；未宣稱 immutable commit
- 環境：Windows、local-test browser、task-owned `http://localhost:4011/`（完成後已釋放）
- 角色：對 DEV-098 frozen local implementation 與 QA artifacts 的獨立 read-only postcondition readback；QC 期間未修改產品程式、資料、schema 或 deployment 設定
- 直接證據：`output/qc/dev-098/task-detail-subtasks-qc-result.json`

## 1. QC 方法與範圍

QC 以 `npm run verify:dev-098-task-detail-subtasks-qc` 執行，直接讀取 DEV-098 的 static／pure／browser artifacts、clean-baseline disposition 與目前 source files；不以 RD 摘要或 case 名稱單獨推定通過。

本次 QC 覆蓋：

- shared `TaskChecklistTree` 與 Board adapter／Details host 邊界；
- Details local `DndContext`、`targetScopeRef`、root drop 與既有 authoritative placement commit；
- modal 單例 navigation、save failure gate、context menu／Escape layer ownership；
- desktop／keyboard／mobile drag、invalid descendant drop、permission guard、source retention 與四個 viewport layout；
- clean baseline 結果與 runtime／remote release boundary。

QC 不把 local-test／loopback 證據當成 remote provider、schema／migration、production 或 release evidence；不替 DEV-046／053／055 的既有失敗建立 waiver。

## 2. 獨立事實結果

| Gate | 結果 | 直接證據 |
|---|---|---|
| Core evidence envelope | PASS，static 22/22、pure 10/10、browser 16/16、diagnostics 0 | `output/qa/dev-098/result.json`、`output/qa/dev-098/pure-result.json`、`output/playwright/dev-098/result.json` |
| Shared renderer boundary | PASS，Board／Details 均使用 `TaskChecklistTree`；host-specific dependency／record state 留在 adapter | `QC-098-02`、source readback |
| Details drag scope | PASS，local DnD、scope filter、root drop 與 authoritative commit 均存在；modal shell／metadata／背景 view 不在 drop scope | `QC-098-03`、`QC-098-04` |
| Navigation／save／overlay | PASS，單一 modal、push／back、reject stay／retry、menu z-index、Escape／outside click | `QC-098-05`、`QC-098-06` |
| Mobile／permission／layout | PASS，390／320 gesture、readonly／tracking guard、1440／1024／390／320 無水平 overflow | `QC-098-07` |
| Failure recovery | PASS，tracking placement failure 保留來源位置與 identity | `QC-098-08` |
| Adjacent regression disposition | PASS，DEV-046 32/32＋5/5、DEV-053 31/31＋10/10、DEV-055 34/34＋18/18、DEV-095 4/4；未使用 waiver | `QC-098-09`、`output/qa/dev-098/adjacent-audit-final-20260902.json` |
| Baseline disposition | PASS，clean HEAD `13888b2` 的原始 findings 保留為 historical pre-existing facts，未錯誤歸因給 DEV-098 | `output/qa/dev-098/baseline-audit.json` |
| Remote／release boundary | PASS，未宣稱 schema、migration、remote provider、deploy 或 release | `QC-098-10` |

獨立 QC summary：`PASS=10 / FAIL=0 / NOT_RUN=0 / BLOCKED=0`。

## 3. 反向檢查結論

- Details 與 Board 共用 neutral row／tree、interaction controller 與 placement contract；未將 Board `DndContext` 提升為全域 runtime。
- Details 的 drag scope 只包住 modal 內子任務 host 與 root drop zone；modal 外框、標題／日期／notes metadata、backdrop 後方 Board／Workbench 不會成為 drop target。
- 子任務開啟、Back、Close 與 save rejection 均維持單一 modal 與 typed transition owner；沒有以 timeout 推導 save unknown。
- invalid self／descendant、readonly／tracking permission、short-scroll 與 placement failure 均 fail closed 或保留 source；沒有 ghost／duplicate／cycle／假成功證據。
- clean baseline audit 保留原始 pre-existing facts；本輪 affected cases 已完成修正後重跑並通過，沒有以 baseline 取代現行 regression evidence。

## 4. 未覆蓋與阻塞

- 相鄰 regression audit 已完成：DEV-046／053／055／095 affected cases 修正後全數重跑通過，未使用 waiver；
  final structured disposition 見 `output/qa/dev-098/adjacent-audit-final-20260902.json`。
- 實機 touch／IME、remote provider readback、deployment、production smoke 與 release 未執行；若 release owner 要求，另開 release supplemental／deployment gate。

## 5. QC 判定

DEV-098 核心 local implementation 的獨立 read-only QC 可接受，`QC-098-01～10` 全數通過；`AC-098-012` 的相鄰 regression disposition 已完成，但 DEV-099 persistence、實機與 release gate 尚未完成，因此仍不得標記為 Release Ready。

目前狀態：`RD Implemented / Core Local Automated QA PASS / Independent QC PASS / Adjacent Regression Audit PASS / 未 Release`。

## 6. QC Evidence Envelope

- Verifier：`scripts/verify-dev-098-task-detail-subtasks-qc.mjs`
- Command：`npm run verify:dev-098-task-detail-subtasks-qc`
- Artifact：`output/qc/dev-098/task-detail-subtasks-qc-result.json`
- Artifact 內含 consumed artifact／source files 的 bytes 與 SHA-256、`working-tree` revision、local environment、remote boundary 與 baseline disposition。
- DEV-098 隔離 baseline runtime 已停止且 port 4010 已確認釋放；本輪 task-owned Vite port 4011 亦已停止並確認釋放，
  runtime ownership／cleanup 見 `output/qa/dev-098/adjacent-audit-final-20260902.json`。
- 2026-09-02 fresh core rerun重建 `output/playwright/dev-098/result.json`（B01～B16 16/16、diagnostics 0），
  並執行獨立 QC-098-01～10 10/10；相鄰 DEV-046／053／055／095 affected cases 修正後全數通過。
- `adjacent-audit-followup-20260902.json` 保留歷史 follow-up；現行 QC 只採用 final artifact，不把 historical
  failure 或 clean-baseline result 誤算為現行 blocker。
- 2026-09-03 clean integration supplemental：production-base `codex/capa-001-dev099-integrated@c904435`
  以 task-owned runtime 4015 重跑 B01～B16 16/16、diagnostics=0；static 22/22、pure 10/10與本文件
  QC-098-01～10 10/10均通過，DEV-046／053／055／095 affected regression亦 PASS且未使用 waiver。
  證據：`output/playwright/dev-098/result-clean-integrated-final-20260903.json`、
  `output/qa/dev-099/clean-integrated-dev098-qc-20260903.json`；4015已釋放。此不取代本 QC 的
  working-tree source boundary，也不解除 DEV-099 persistence與release gate。
