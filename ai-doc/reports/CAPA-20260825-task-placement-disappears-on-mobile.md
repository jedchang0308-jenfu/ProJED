# CAPA-20260825-01 跨 ownership 任務搬移失效

建立：2026-08-25
成效失敗重啟：2026-08-26
關聯：DEV-089、DEV-086、DEV-039、SPEC-089 Rework 1
狀態：Effectiveness Reopened／RD Rework 1 Local PASS／Supabase TEST／Level 3／Production Effectiveness Pending／P0 Stop-Ship

## 1. 不符合與影響

### 1.1 原始不符合

使用者將 `回覆聖島, 發明核准` 從全域工作台未歸位拖入看板後，一個裝置曾呈現 optimistic 已歸位，另一裝置依 canonical readback 找不到目的 task。production 唯讀診斷顯示來源仍在 `task_workbench_unplaced_items`，未發生資料遺失，但形成跨裝置 ownership 分歧風險。

### 1.2 2026-08-26 成效失敗

原 CAPA 上線後，在 production 真實「未歸位 → 看板」操作出現：

```text
歸位失敗，任務已保留在未歸位。
Error: Task placement transaction must cross the unplaced ownership boundary.
```

operation ledger 為 0，證明錯誤發生在 RPC 前；來源 task 仍在未歸位，故 containment 有效，但 intended successful flow 不可用。依既定 threshold「任何 exactly-one-source／雙向功能不符合即 reopen」，本 CAPA 判定 ineffective 並重啟。

風險仍為 P0：使用者無法把未歸位任務歸位或跨板搬移，且若錯誤地放寬 guard，可能轉為跨看板重排、duplicate 或 task loss。

## 2. Immediate containment

- 不刪除、不複製、不人工搬動 production 來源 task；canonical 未歸位來源已確認存在。
- 維持 ownership boundary guard，不以移除 exception 作為 hotfix。
- DEV-089、SPEC-089、QA、QC 全部重啟；2026-08-25 PASS 只標為歷史基線。
- production release 維持 stop-ship，直到 v2 command、DB／UI雙向證據及 migration history gate 全數通過。

## 3. Root Cause Analysis（多層次）

| 層次 | 原始根因 | 2026-08-26 補充根因 |
|---|---|---|
| UI/Gesture | optimistic UI 曾造成成功錯覺 | mobile gesture 已成功進入共用 commit；不是 touch-only defect |
| Intent | drag intent 可描述 target | intent 被展開為 generic node update batch，責任過大 |
| State/Ordering | client 先改 local ownership | `buildTaskParentIndex` 只用 `parentId || 'root'`，把不同 board/workspace root 混成 siblings |
| Commit adapter | create/delete 舊路徑不原子 | `normalizeTaskMoveUpdates` 把非目的看板 root siblings 夾帶進 cross-boundary batch |
| Boundary guard | 原本沒有 exactly-one-source owner | 新 guard 正確拒絕混合 batch；問題在 guard 上游，不能放寬 |
| Database | 缺單一 transaction／ledger | v1 RPC 已存在但本次未被呼叫；v1 仍過度依賴 client placement/order payload |
| Verification | local success／failure coverage 不足 | Level 3 只驗看板→未歸位，沒有同 artifact 反向 UI＋reload |
| Governance | ownership failure 被低估 | CAPA exit 沒把「雙向 UI evidence completeness」做成 machine/enforced stop condition |

## 4. 五個為什麼（本次 reopen）

1. 為什麼歸位失敗？因 client transaction validator 判定 batch 沒有乾淨跨越未歸位 boundary。
2. 為什麼 batch 不乾淨？因它同時含 moved subtree 與其他看板 root siblings。
3. 為什麼會混入其他看板？因 sibling index 只用 parent key，忽略 workspace／board ownership scope。
4. 為什麼 client 會傳 sibling patches？因 API 契約讓 gesture layer負責展開目的排序，而不是只傳 anchor/position 意圖。
5. 為什麼 release 前沒發現？因 Level 3 只完成單向看板→未歸位，驗證 gate 沒強制雙向同 artifact。

系統根因：`placement scope 未成為一級領域概念，且 client／server 責任切分錯置`。

## 5. Correction／CA／PA 對策

| 類型 | 對策 | Owner | 完成證據 | 狀態 |
|---|---|---|---|---|
| Correction | 保留來源、維持 pending/failure訊息與 boundary guard | RD | production來源存在、ledger=0、無 mutation | 已確認 |
| Correction | 導入 discriminated ownership：看板=`workspace+board`、未歸位=`auth account`；`PlacementScope=ownership+parent` | RD | property 1,000 fixtures 非 affected scope deep equal，未歸位仍是全域單一 lane | Local PASS |
| CA | 跨 ownership 改用 `MoveTaskSubtreeCommand v2`；client 只送 subtree IDs、source、destination parent、anchor、position | RD | source contract與request capture | Local PASS |
| CA | server 依穩定順序鎖 exact subtree＋source/destination siblings，計算 canonical dense order，原子寫入目的／刪來源／activity／ledger | RD/DB | TEST DB02 success/readback | Local PostgreSQL harness PASS；TEST待執行 |
| CA | forward-only migration新增 v2 RPC與 immutable ledger欄位，不修改已套用 migration | RD/DB | DB01 migration/RLS/grants/history | Migration created／local compile PASS；TEST待執行 |
| CA | same operation replay、parallel placements、wrong-scope anchor 全部具明確結果 | RD/QA | DB03/DB04 matrix | Replay/mismatch local PASS；parallel/TEST待執行 |
| PA | source gate 禁止 cross-boundary v1 fallback、generic patches、parent-only index | QA | static verifier | PASS |
| PA | randomized multi-workspace/board property test | QA | seed/fixture/result artifact | PASS／1,000 fixtures |
| PA | Level 3／Level 4 強制 desktop＋mobile雙向、跨板、reload、ledger/canonical readback | QA/QC | evidence matrix完整 | 待實作 |
| PA | production migration history mismatch 成為 predeploy stop condition | Release owner | repo/remote history一致 | 待執行 |

## 6. 核准的架構原則

```text
mobile / desktop gesture
  → shared DropIntent
  → MoveTaskSubtreeCommand v2
  → single Supabase atomic transaction
  → canonical placement/order result
  → frontend apply success effects
```

此設計不以 client filter 掩蓋單一 bug，而是收斂 mutation authority：client 描述意圖，server決定 exact affected rows 與 order。手機與桌機不分叉，未來新增看板或 workspace 也不會因同為 `parentId=null` 被誤認為 siblings。

## 7. Preventive gate 與 effectiveness plan

| 時點 | 指標／抽樣 | 通過條件 | 目前狀態 |
|---|---|---|---|
| Historical Local | 390×844 failure injection | 來源3／目的0、parent chain preserved | 歷史 PASS；不代表 successful reverse flow |
| Historical TEST | v1 DB01-DB03 | transaction/RLS/rejection | 歷史 PASS；不代表 v2/scope isolation |
| Historical Level 3 | 看板→未歸位＋reload | 單向 canonical persisted | 歷史 PASS；coverage incomplete |
| Production 2026-08-26 | 未歸位→看板 | 成功且 exactly-one-source | FAIL；CAPA reopened |
| Rework source/property | S01-S08＋1,000 randomized graphs | 非 affected scope 100% deep equal | PASS |
| Rework local DB harness | disposable PostgreSQL 18 migration／雙向／nested／replay／postcondition | exactly-one-source、canonical moved IDs完整、dense order | PASS；非Supabase TEST evidence |
| Rework local rendered UI | desktop＋390×844＋320×844雙向／跨工作區／failure containment | 完整子樹、parent links、無unexpected pageerror | PASS |
| Rework TEST DB01-DB04 | migration/security/success/rejection/replay/concurrency | 全部 PASS、fixture cleanup=0 | NOT RUN |
| Rework Level 3 | desktop＋mobile雙向／跨板／reload | 同 artifact、ledger/canonical一致、visible error=0 | NOT RUN |
| Rework Level 4 T+0 | production exact fixture雙向 | 100% exactly-one-source、無 scope leak | NOT RUN |
| T+7／T+30 | ledger errors＋canonical抽查 | 0 lost/duplicate/partial；同 code不連續3次 | NOT RUN |

任何一筆兩邊皆有、兩邊皆無、partial subtree、非 affected scope mutation或 optimistic 假成功，立即判 CAPA ineffective；`failed / total > 1%` 或同 error code 連續3次觸發 RD review。permission／linked-data預期拒絕須有穩定 error code，另行統計。

## 8. 文件與追溯

- RD contract：`ai-doc/specs/SPEC-089-authoritative-task-placement-transaction.md`
- QA plan：`ai-doc/qa/QA-DEV-089-authoritative-task-placement-transaction.md`
- QC verdict：`ai-doc/qc/QC-DEV-089-authoritative-task-placement-transaction.md`
- PM index：`ai-doc/dev_task.md` 的 DEV-089
- 文件索引：`ai-doc/documentation_map.md`

## 9. 結論與 release boundary

CAPA 的原始 failure containment 仍有效，任務沒有遺失；production intended reverse flow 的既有 artifact 已證實失敗。Rework 1 的程式、forward-only migration、1,000-fixture property、local transaction harness與desktop/mobile rendered UI 已完成並通過；但這只支持 `RD local correction implemented`，不支持 production effectiveness closure。

本文件不授權 production migration、deploy或資料 mutation。CAPA 仍保持 open／stop-ship；只有在 Supabase TEST DB01-DB04、Level 3雙向、migration history reconciliation、production Level 4與後續T+7/T+30通過後才能關閉。
