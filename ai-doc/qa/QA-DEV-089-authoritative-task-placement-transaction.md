# QA-DEV-089 全域工作台權威任務搬移交易

日期：2026-08-25  
狀態：Executed／Local QA PASS／TEST DB01-DB02 PASS／Level 3 PASS／未 Release
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
| S04 | migration exact subtree、row locks、delete count、RLS/search_path/revoke | PASS；DEV-089 static；TEST migration/RLS readback PASS |
| S05 | server `move_task` 判定與 client configurable role matrix 一致，來源／目的皆檢查 | PASS；DEV-089 static；TEST owner round-trip PASS |
| S06 | 第二次 transport ambiguity 以同 operation ledger readback 判定；client 不可偽造 committed | PASS；DEV-089 static；TEST idempotent replay PASS |
| F01 | 390×844 touch board→unplaced，注入 700ms delay＋failure | PASS；fault injection |
| F02 | pending 時原 board root 可見且 subtree spinner=3 | PASS；rendered DOM |
| F03 | failure 後 local/runtime 三節點仍在 source board，parents=`column/root/child` | PASS |
| F04 | failure 後 unplaced copy=0、pending/transient=0 | PASS |
| F05 | failure toast 正確；durable commit attempt=1、ancestor roll-up=0 | PASS |
| R01 | DEV-086 subtree success source contract | PASS |
| R02 | DEV-039 workbench placement/cross-device static | PASS |
| R03 | TypeScript、build:test、targeted lint、diff check | PASS |
| R04 | linked migration history、schema error lint、security advisor 唯讀 preflight | PASS WITH BASELINE WARN；production 未變更；TEST advisors 僅既有 baseline WARN |
| TEST backup | custom-format logical dump + `pg_restore --list` | PASS；712,269 bytes；SHA-256 `df4bf7008fdf46f2a36bf781fbb3592efa196398eb6369292f730386c1639b19` |
| DB01 | Supabase TEST migration apply + schema/RLS/grant readback | PASS；Management API migration version `20260825125421`；table/RPC/RLS/3 policies；`PUBLIC/anon` ACL 已撤銷；匿名 REST 401 |
| DB02 | TEST to_unplaced/to_board success、exact subtree、activity、idempotent replay、fixture cleanup | PASS；3 層 parent chain；board=3／unplaced=0；兩方向 committed；activity=6；replay 不新增 mutation；fixture counts=0 |
| DB03 | TEST outsider/RLS、partial subtree、linked/dependency reject | PASS；匿名 Data API 401；authenticated outsider=`42501`、partial subtree=`22023`、linked record／dependency=`55000`；拒絕後 fixture／operation counts=0 |
| L3 | 同 commit Firebase preview + Supabase TEST authenticated smoke | PASS；preview `https://projed-cc78d--level3-smoke-49uruan8.web.app`；已登入帳號建立測試看板／任務，執行看板→未歸位、刷新持久性；清除一次舊 service-worker cache 後刷新成功；測試資料已精確清理 |

## Browser evidence

- Viewport：390×844，CDP touch emulation，500ms 長按既有 mobile drag owner。
- Fixture：`回覆聖島, 發明核准` root＋child＋grandchild。
- fault injection：只在 `import.meta.env.MODE === 'test'` 生效；production build 不提供控制入口。
- Screenshot：`output/playwright/dev-089/mobile-placement-failure-retains-source.png`。
- 視覺複查：未歸位為空；已歸位列表仍顯示完整三層；頂部 failure toast 明確表示來源保留，沒有額外 modal／說明文字或 layout overflow。

## Level 3 authenticated smoke

- Commit：`60907d3`；Firebase Hosting preview：`https://projed-cc78d--level3-smoke-49uruan8.web.app`。
- 同一登入帳號建立 `LEVEL3-SMOKE-20260825-2115` 看板與 `LEVEL3-SMOKE-TASK-20260825-2115` 任務（含備註），由看板拖入全域工作台「未歸位」後，畫面顯示未歸位計數 `1` 與該任務。
- 刷新第一次遇到舊 service-worker chunk cache；使用產品內建「清除應用程式快取並回首頁」後，重新刷新通過：無錯誤頁、看板標題存在、未歸位區與測試任務仍存在（task occurrence `1`）。
- 測試看板、任務、未歸位列與關聯資料已由 TEST exact-fixture cleanup 移除，既有資料未修改。
- DB03 dedicated fixture cleanup：WBS、record link、knowledge record、dependency、operation ledger、unplaced counts 全部為 `0`。

## QA 結論

Local RD/QA acceptance、TEST DB01／DB02／DB03、Level 3 authenticated smoke 與 CAPA 的程式矯正、手機 failure-first 證據、防再發 static gate 已完成。production Level 4 與 effectiveness check 仍是 stop-ship gate，不得把本報告解讀為 production 已修復。
