# QA-DEV-089 全域工作台權威任務搬移交易

日期：2026-08-25  
狀態：Executed／Local QA PASS／Remote DB + Level 3 Pending／未 Release  
規格：SPEC-089  
CAPA：CAPA-20260825-01

## 驗證策略

風險為 P0 資料 ownership 一致性。測試分為 source contract、手機 fault injection、既有成功 flow regression、DB transaction/RLS matrix 與 exactly-one-source release effectiveness。local-test 證據不能替代 Supabase TEST 或 production。

## FMEA

| 失效模式 | 影響 | 預防／偵測 | Gate |
|---|---|---|---|
| 前端先搬、遠端失敗 | 跨裝置假成功／看似消失 | await-before-local-commit＋fault injection | P0 |
| 只搬 root | orphan／階層破裂 | server recursive exact full subtree | P0 |
| create 成功、delete 失敗 | duplicate／完成率失真 | single DB transaction＋exact delete count | P0 |
| delete 成功、create 失敗 | 任務遺失 | destination/source 同 transaction | P0 |
| response 丟失後重送 | 重複 mutation | immutable owner-scoped idempotency key | P0 |
| 第二次 response 仍遺失 | 把已 committed 誤報為失敗 | pending→failed row-lock serialization＋ledger readback＋unknown outcome message | P0 |
| realtime 提前替換 pending source | UI 在結果前跳位 | pending source wins refresh merge | P1 |
| 連結／相依資料被 cascade 消失 | 知識或排程破壞 | unsupported subtree fail-safe reject | P0 |
| 跨帳號讀／寫 operation，或繞過 `move_task` 設定 | 資料外洩／未授權搬移 | RLS、auth.uid、capability matrix、revokes | P0 |
| failure 仍寫 activity／undo／roll-up | 稽核與狀態失真 | success-effects-only assertion | P1 |

## 案例與結果

| ID | 驗證 | 結果 |
|---|---|---|
| S01 | store persistence await 發生在 local update 前 | PASS；DEV-089 static |
| S02 | pending source refresh、整棵 disabled、共用 spinner | PASS；DEV-089 static/browser |
| S03 | operation begin `ignoreDuplicates`，RPC immutable payload | PASS；DEV-089 static |
| S04 | migration exact subtree、row locks、delete count、RLS/search_path/revoke | PASS；DEV-089 static；實際 DB apply 待 TEST |
| S05 | server `move_task` 判定與 client configurable role matrix 一致，來源／目的皆檢查 | PASS；DEV-089 static；角色資料實測待 TEST |
| S06 | 第二次 transport ambiguity 以同 operation ledger readback 判定；client 不可偽造 committed | PASS；DEV-089 static；網路 fault DB 實測待 TEST |
| F01 | 390×844 touch board→unplaced，注入 700ms delay＋failure | PASS；fault injection |
| F02 | pending 時原 board root 可見且 subtree spinner=3 | PASS；rendered DOM |
| F03 | failure 後 local/runtime 三節點仍在 source board，parents=`column/root/child` | PASS |
| F04 | failure 後 unplaced copy=0、pending/transient=0 | PASS |
| F05 | failure toast 正確；durable commit attempt=1、ancestor roll-up=0 | PASS |
| R01 | DEV-086 subtree success source contract | PASS |
| R02 | DEV-039 workbench placement/cross-device static | PASS |
| R03 | TypeScript、build:test、targeted lint、diff check | PASS |
| R04 | linked migration history、schema error lint、security advisor 唯讀 preflight | PASS WITH BASELINE WARN；`20260825093621` 僅 local、remote 空白；remote schema `No schema errors found`；advisor 為既有 `touch_updated_at` search-path、既有 callable DEFINER functions、leaked-password protection 告警，新 migration 尚未 apply、故不代表 DEV-089 advisor PASS |
| DB01 | Supabase local／TEST migration parse + db lint | PENDING；本機 Docker daemon 未運行；本機 PostgreSQL 18 雖 listening，但受密碼保護且本輪未提供受控測試憑證，未碰既有 DB |
| DB02 | TEST to_unplaced/to_board success、rollback、idempotent replay | PENDING release gate |
| DB03 | TEST outsider/RLS、partial subtree、linked/dependency reject | PENDING release gate |
| L3 | 同 commit Firebase preview + Supabase TEST authenticated smoke | PENDING release gate |

## Browser evidence

- Viewport：390×844，CDP touch emulation，500ms 長按既有 mobile drag owner。
- Fixture：`回覆聖島, 發明核准` root＋child＋grandchild。
- fault injection：只在 `import.meta.env.MODE === 'test'` 生效；production build 不提供控制入口。
- Screenshot：`output/playwright/dev-089/mobile-placement-failure-retains-source.png`。
- 視覺複查：未歸位為空；已歸位列表仍顯示完整三層；頂部 failure toast 明確表示來源保留，沒有額外 modal／說明文字或 layout overflow。

## QA 結論

Local RD/QA acceptance 通過；CAPA 的程式矯正、手機 failure-first 證據與防再發 static gate 已完成。由於 migration 尚未套用任何遠端環境，DB01～DB03、Level 3、production Level 4 與 effectiveness check 仍是 stop-ship gate，不得把本報告解讀為 production 已修復。
