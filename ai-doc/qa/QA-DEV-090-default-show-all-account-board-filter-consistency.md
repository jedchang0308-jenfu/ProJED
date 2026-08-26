# QA-DEV-090：預設全顯示與帳號看板篩選一致性驗證計畫

- 關聯 DEV：DEV-090、DEV-039
- 關聯 SPEC／ADR：`SPEC-039-task-filter-core-and-workbench-profiles.md`、`ADR-045-account-board-task-filter-preferences.md`
- 狀態：Executed / Local Automated QA PASS / QC PASS / Release Not Run
- 風險：本地實作 Medium；schema/RLS release High
- 日期：2026-08-26

## Verification Scope and Boundary

本計畫驗證四個不可分割的結果：未設定 filter 確實全部顯示、偏好只屬 account × board、五種板內模式共用 canonical identities、失敗時不跨 scope 或假裝同步。工作台 placement、Realtime、團隊共用 filter profile、行事曆訂閱 snapshot 與 production release 不在本計畫。

驗證分層：

- Source/model：default、normalization、v4 migration、repository state machine、canonical projection與 consumer wiring。
- DB/RLS：可丟棄 local Supabase 或指定 TEST 專案的 authenticated role matrix；production 不得作開發 fixture。
- Browser：固定 local-test UI 驗證正常入口、五模式、帳號／看板隔離、failure feedback與 viewport。
- Regression：DEV-027D／DEV-039、TypeScript與 `build:test`；不得用 regression PASS 取代 DEV-090 新案例。

Evidence 只適用於同一 source revision/dirty boundary、artifact、environment、role、route、fixture與 viewport；任一項改變需重跑受影響案例。

## Required Fixtures

| Fixture | Required data |
|---|---|
| Accounts | A、B 兩個 authenticated 帳號；都可讀 board-1，只有 A 可讀 private-board |
| Boards | 同 workspace 的 board-1、board-2；另有 A 無權的 inaccessible-board |
| Status set | todo、in_progress、onhold、completed 各至少一筆；legacy delayed/unsure 至少各一筆 normalization case |
| Hierarchy | root container 不符合 assignee，child/grandchild 符合；parity組有有效日期，另有 no-date、archived ancestor、missing-parent orphan、cycle fixture |
| Assignment/tag | A/B 不同 assignee、collaborator、unassigned；有效與失效 member/tag IDs |
| Empty states | 一張真無 task board；一張有 task 但可被 filter 全排除的 board |
| Legacy storage | board v1/v2/v3 payload 含 `completed:false`、assignee/tag；display settings 非 default；workbench v3 有 selectedBoardId 與 filtersByBoardId |
| Failure injection | preference read 失敗、upsert 失敗、delete 失敗、延遲/亂序 response；task data保持正常 |

API/DB 可建立上述案例開始前的帳號、membership、board與 task。凡驗收目標是「UI 寫入偏好／reset」，不得直接用 API/DB 建立其成功 postcondition。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| Default 仍隱藏 completed | 舊常數或 browser assertion 未改 | 未操作 filter 就少任務 | S01、B01 | P0 | 單一 default source＋四狀態 UI fixture |
| Board A filter 污染 board B | cache key 只有 account 或 stale hydrate | 切看板後誤顯示空白 | S03、B04、B13 | P0 | exact-scope key＋generation guard |
| A 帳號偏好套到 B | logout 未清 memory、pending job 用新 session | 跨帳號隱私／誤判 | DB03、B05、B13 | P0 | RLS、auth generation、account switch test |
| Layout preference 被 filter write 覆寫 | 回用 `profiles.ui_preferences` whole-json | 側欄／工作台寬度遺失 | S02、DB01 | P1 | 專用 table＋禁止 whole-json static guard |
| Parent 不命中造成整支消失 | View 仍逐層 predicate | 清單／心智圖／甘特空白 | S04、B07、B08 | P0 | 五模式只用 canonical projection |
| Context ancestor 被算成 match | visible/matched 混用 | count與工作台結果失真 | S04、B08 | P1 | identity snapshot 比對 |
| Remote 無 row 卻保留 stale cache | hydrate arbitration錯誤 | reset 後舊 filter 回流 | S03、B03、DB06 | P0 | row absence authoritative default |
| Write 失敗仍顯示 synced | catch 只 console.warn | 使用者誤以為跨裝置已保存 | B12、visible sweep | P1 | pending journal＋visible warning＋retry readback |
| Option loading 清掉有效 preference | 空 member/tag list被當 final | preference 靜默遺失 | S03、B14 | P1 | 只在成功載入後 reconcile |
| 真無資料與 filtered zero混淆 | 只看 rendered roots length | 使用者以為資料遺失 | S05、B09、B10 | P0 | totalTaskCount/matchedTaskIds state table |
| DB row可被他人讀寫 | policy/grant缺漏 | 個人偏好外洩或污染 | DB01～DB04 | P0 | 每 operation policy＋authenticated role matrix |
| Migration先刪舊值後寫新值失敗 | localStorage quota/private mode | display preference遺失 | S02 | P1 | write/readback before remove＋idempotent retry |

## Source / Model Cases

| Case | Action | Expected / explicit fail condition |
|---|---|---|
| QA-090-S01 | 驗證 `createDefaultTaskFilters()`、reset、active count | 六個 status key true、其他條件無限制、count=0；任何第二套 default 或 `completed:false` 為 fail |
| QA-090-S02 | 對 board/workbench v1～v3 fixture 執行 migration兩次 | filter 全 reset、不上傳；display/panel/selectedBoardId保留；第二次結果相同；新值未 readback 就移除 legacy為 fail |
| QA-090-S03 | 模擬 cache/remote row/remote none/pending/unknown version與快速 scope change | arbitration/state machine符合 SPEC；stale response、跨 scope fallback、unknown version overwrite為 fail |
| QA-090-S04 | 對 hierarchy fixture跑 canonical projection並盤點五模式 source | matched/visible/context/total正確；五 consumer不再直接逐層 predicate；任一 mode另建 identity truth為 fail |
| QA-090-S05 | 逐組合 task loading/error/total/matched | observable state優先序唯一；有資料 filtered-zero不得顯示 true empty |
| QA-090-S06 | 檢查 `profiles.ui_preferences`、Realtime publication、workbench adapter | DEV-090 不寫 whole-json、不加 Realtime、不把工作台 active state併入板內 state |
| QA-090-S07 | rapid filter changes、scope-keyed queue與filter undo/redo model | 最後操作最後持久化；切帳號／看板先清 undo/redo；logout後舊帳號 job不使用新 session |

## DB / RLS Cases

| Case | Authenticated operation | Expected / explicit fail condition |
|---|---|---|
| QA-090-DB01 | 檢查 migration schema、constraint、index、trigger、grants、policies | 與 SPEC 完全一致；anon保有任一 table privilege或缺 operation policy為 fail |
| QA-090-DB02 | A 對可讀 board-1 執行 select/insert/upsert/update/delete | own-row CRUD通過，updated_at由 DB更新，reset後 row=0 |
| QA-090-DB03 | B 對 A 的 board-1 row執行 CRUD | select=0，insert/update/delete denied或 affected=0；能讀到 filters為 fail |
| QA-090-DB04 | A 對 inaccessible-board 建立或讀 preference | 全部 denied/0；FK error或 policy結果不得洩漏 filter內容 |
| QA-090-DB05 | viewer 對自己的 readable board row CRUD，再嘗試 task mutation | preference CRUD通過；task mutation仍依原任務權限拒絕 |
| QA-090-DB06 | 刪除 disposable project/profile parent | preference row cascade移除；不得殘留 orphan row |
| QA-090-DB07 | 以非 object filters、version 0 寫入 | DB constraint拒絕，既有合法 row不被破壞 |

DB fixture cleanup 只可刪除本案例建立且已核對 identity 的 disposable rows；不得清空 shared table、production project或其他任務資料。

## Browser / Delivery-path Cases

正常入口固定為：登入 → 左側 Workspace/Board → mode switcher → 上方 `過濾器`。除非案例本身驗證 route error，direct URL 不可取代入口證據。

| Case | Steps | Expected / explicit fail condition | Evidence |
|---|---|---|---|
| QA-090-B01 | A 首次進 board-1，不操作 filter | 四人工狀態與 legacy-normalized任務皆可見，active count=0 | 1440×900 screenshot、visible task IDs、count |
| QA-090-B02 | A 在 board-1 UI選 assignee/tag/date | 立即只顯示 matched＋必要 ancestors；DB列 account=A/project=board-1 | 操作前後 screenshot、DB readback |
| QA-090-B03 | reload、重新登入或離開再進 board-1 | 恢復 B02 最後成功提交的完整狀態；remote row不存在時恢復 default | UI＋network/DB evidence |
| QA-090-B04 | A 從 filtered board-1切到從未設定的 board-2 | board-2全部顯示、count=0；切回 board-1才恢復其偏好 | 兩板 task IDs與filter control |
| QA-090-B05 | 切換 B 帳號進相同 board-1 | B 不繼承 A；B主動設定後 A也不受影響 | A/B畫面＋DB row ownership |
| QA-090-B06 | 植入 v3 legacy payload後登入 | filter全部 reset；display/panel/selectedBoardId保留；legacy條件未出現在DB | migration storage snapshot＋UI |
| QA-090-B07 | 在同 fixture依序切看板/清單/心智圖/甘特/行事曆 | 五模式 matched IDs一致，無模式誤空白 | 每模式 route、DOM IDs、screenshots |
| QA-090-B08 | 套用 parent不命中、grandchild命中條件 | 五模式保留可理解 ancestor path；match count只含真正命中者 | matched/visible/context snapshot |
| QA-090-B09 | 套用不命中任何 task條件，再按清除 | 顯示 filtered-zero文案＋單一清除；清除後全部恢復且remote row刪除 | 操作前後 screenshot＋DB row=0 |
| QA-090-B10 | 進入真無 task board | 顯示 true-empty；不得顯示 filtered-zero或同步錯誤 | screenshot＋fixture row count |
| QA-090-B11 | preference read故障、task data正常 | exact cache或default可用，出現非阻斷 warning；不得空白或跨 scope | warning、UI IDs、journal/source |
| QA-090-B12 | UI改 filter時注入upsert/delete故障，之後解除 | 目前UI保留選擇、顯示未同步、journal pending；retry後DB收斂且warning消失/不重複 | failure/recovery screenshot、DB readback |
| QA-090-B13 | 延遲 board-1 response，快速切 board-2/account B | 延遲結果被丟棄；目前scope不變；舊job不以新auth送出 | request timeline、scope telemetry、UI |
| QA-090-B14 | member/tag loading先空後成功，並含真正失效ID | loading時不清偏好；成功後只清真正失效ID並持久化 | filter state timeline＋DB readback |
| QA-090-B15 | 390×844正常進入可達Board filter、選條件、reset、warning | 無水平overflow、重疊、裁切；CTA與toast可操作 | mobile screenshot＋layout metrics |
| QA-090-B16 | 全流程 visible error sweep | 無非預期 alert、4xx/5xx、pageerror、console error、不合理全零/空白 | diagnostics log |
| QA-090-B17 | 開工作台檢查shared default/migration | 未設定工作台 filter count=0、v3 filtersByBoardId已reset；不存在DEV-090 cloud upload或板內active state串接 | workbench UI＋network absence |
| QA-090-B18 | 以matched但無有效日期的task切到甘特／行事曆 | canonical/SharedTaskSidebar仍含task；grid無bar/segment只屬mode eligibility，不得顯示true empty或filtered zero | sidebar IDs、mode提示、screenshot |

## Required Automated and Regression Gates

RD 實作必須在 `package.json` 註冊等價命令；名稱可在不改變證據邊界下調整，QA 文件與 DEV 必須同步：

```powershell
npm.cmd run verify:dev-090-task-filter-contract
npm.cmd run verify:dev-090-task-filter-projection
npm.cmd run verify:dev-090-task-filter-db
npm.cmd run verify:dev-090-task-filter-browser
npm.cmd run verify:account-scoped-filter-prefs
npm.cmd run verify:dev-039-task-filter-core
npm.cmd run verify:dev-039-task-filter-core-browser
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-039-filter-result-parity-browser
npm.cmd run verify:dev-027d-mindmap-date-display-filter
npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

既有 DEV-039 browser verifier 中 default active count=1／hide completed 是預期中的歷史衝突，RD 必須改成 DEV-090 契約；不得跳過該 script 或刪除 assertion 以取得假 PASS。

## QC Execution Instructions

1. 凍結本 QA 與 SPEC acceptance，記錄 source revision或明確 dirty boundary。
2. 使用 task-owned disposable DB／fixture；記錄 Supabase target、migration list、role與 cleanup identity。
3. 先跑 source/model與DB gates；任一 P0/P1 fail立即回送 RD，不繼續用 browser成功掩蓋。
4. 以固定 local-test entrypoint啟動 task-owned UI runtime，記錄 project、port、process tree與 cleanup condition；完成後只停止該 runtime並確認 port釋放。
5. 從正常 UI 入口執行 B01～B18；五模式收集 DOM task identities，1440×900與390×844收集 screenshot/overflow metrics。
6. 每次故障案例保留 failure evidence，再解除 injection、retry並收集 recovery evidence；不得刪掉原失敗紀錄。
7. 跑 targeted regression、TypeScript、`build:test`，彙整同一 artifact 的命令結果與 visible error sweep。

建議 evidence root：`output/playwright/dev-090/`；正式 QC report 若建立，使用 `ai-doc/qc/QC-DEV-090-default-show-all-account-board-filter-consistency.md`。

## Pass / Fail / Stop Rules

- 通過：S01～S07、DB01～DB07、B01～B18與 required regressions在同一 source state全部通過，evidence provenance完整。
- 未通過：任一 scope污染、default少任務、mode identity不一致、RLS越權、stale response套用、錯誤畫面或必要案例失敗。
- 未充分驗證：只有 source/model/build/API/DB、只用 direct URL、缺 authenticated RLS、缺五模式 UI、缺 viewport/截圖或 evidence provenance。
- 阻塞：無可用 authenticated DB target、正常UI入口、必要帳號/board fixture或可控制 failure injection；不得降低 evidence要求換取通過。
- DEV-090 只有 QC通過後才能標 `✓ 完成`；production migration/deploy仍需獨立 release gate，不能由本地QC自動推定 Released。

## Execution Record - 2026-08-26

### Evidence provenance

- Source：Git HEAD `3b59c1c` 加上目前 DEV-090 dirty working-tree boundary；結果只適用於 2026-08-26 19:50 +08:00 前完成驗證的同一份本機來源。
- UI environment：`http://localhost:4000/` task-owned local-test runtime；desktop `1440×900`、mobile `390×844`。
- Accounts／boards：`local-test-user`、`local-test-admin`；`dev090-board-a`、`dev090-board-b`、`dev090-board-empty`。
- DB environment：task-owned disposable PostgreSQL 18，實際套用 `20260826104321_dev_090_account_board_task_filter_preferences.sql`；以 Supabase-compatible `auth.uid()` helper、`authenticated`／`anon` roles 驗證 grants、RLS與CRUD。最近一次動態 port `58343`，完成後 `released=true`、暫存 cluster已移除。
- Browser artifact：`output/playwright/dev-090/result.json`；screenshots位於 `output/playwright/dev-090/`。第一次 B18 失敗證據 `failure-B02-B08-five-mode-context-parity.png` 保留，修正無日期 Gantt fallback bar 後同案例重跑 PASS。
- Runtime cleanup：local-test server由本任務啟動，驗證後以固定 entrypoint停止；`dev:test:status=STOPPED` 且 `PORT_4000_RELEASED=true`。

### Automated gate results

| Gate | Result | Coverage note |
|---|---:|---|
| `verify:dev-090-task-filter-contract` | PASS 10/10 | S01～S03、S06～S07；default、normalization、migration、remote-none、pending、unknown version、scope queue |
| `verify:dev-090-task-filter-projection` | PASS 5/5 | S04～S05；matched/context/visible、archived/orphan/cycle、stable identity、exclusive state priority |
| `verify:dev-090-task-filter-db` | PASS | DB01～DB07；schema/grants/RLS/own CRUD/other account/inaccessible/viewer/anon/constraint/trigger/cascade |
| `verify:dev-090-task-filter-browser` | PASS | B01～B18整合；五模式 parity、migration、board/account isolation、empty/reset、loading/error/warning、no-date eligibility、mobile、diagnostics |
| `verify:account-scoped-filter-prefs` + browser | PASS 7/7 + PASS | v4 exact account×board cache與工作台帳號隔離 |
| `verify:dev-039-task-filter-core` + browser | PASS 66/66 + PASS | 歷史 default/count assertions改為 DEV-090 契約；status refresh、工作台、mobile回歸保留 |
| `verify:dev-039-filter-result-parity` + browser | PASS 26/26 + PASS | Board／Workbench canonical matched identity與mobile回歸 |
| `verify:dev-027d-mindmap-date-display-filter` + browser | PASS 11/11 + PASS | canonical hierarchy下的日期、狀態、負責人與顯示設定 |
| `tsc --noEmit` | PASS | TypeScript零錯誤 |
| `build:test` | PASS | Vite/PWA artifact成功；只有既有 chunk-size與Browserslist資料提示 |

### QA/QC disposition

- S01～S07、DB01～DB07與B01～B18均有對應自動化證據；正常 UI delivery path的五模式 canonical IDs皆為 `dev090-root`、`dev090-parent`、`dev090-target`，diagnostics與4xx/5xx皆為空。
- B11～B14採分層證據：pure repository failure/version/scope state machine負責故障事實，browser顯示層負責驗證 task data不被清空、非阻斷 warning與retry互動；member/tag reconcile只在成功完成對應 scope載入後執行。
- QC 判定：`Local Automated QA-QC PASS`。未執行 remote Supabase migration、production data mutation、deploy、Level 3／Level 4或release；正式發版仍須獨立 deployment/release gate。
