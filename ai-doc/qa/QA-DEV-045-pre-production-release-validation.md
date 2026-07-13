# QA-DEV-045-PREPROD：行事曆訂閱正式部署前驗證計畫

關聯 DEV：DEV-045、DEV-037、DEV-039
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
關聯 ADR：`ADR-037-fixed-test-environment-and-level3-release-gate.md`、`ADR-038-calendar-subscription-per-board-filter-snapshot.md`
執行環境：Firebase Hosting `level3-smoke` + Supabase `ProJED-TEST`
正式站：`https://projed-cc78d.web.app/`
狀態：Execution In Progress / G0-G2 Partial Passed / G3 Pending / Production Deploy Not Authorized
日期：2026-07-12

2026-07-13 release scope決策：使用者確認目前工作樹內所有 staged、unstaged與untracked產品、驗證及文件變更均納入同一批release。原「範圍未分類」阻塞已解除；仍須形成乾淨、可追溯的committed HEAD，並為同批DEV-029、DEV-031、DEV-046等變更執行各自回歸gate。

## 1. 驗證目的

在任何 production migration、Edge Function或Firebase Hosting正式發布前，證明下列結果：

1. 發布產物只包含已確認的release scope，且可追溯到唯一branch / commit。
2. v1、defensive v2與canonical v3訂閱可在相同DB / Edge版本下安全共存。
3. 使用者在Builder看到的 `task ID + date type`事件集合，與公開 `.ics` feed中的 `VEVENT`集合一致。
4. 每張看板的任務條件與開始／到期日期彼此隔離，不發生跨看板條件外溢。
5. owner、member、project manager、outsider、權限撤銷與匿名token邊界符合契約。
6. production artifact可在Firebase preview HTTPS、Supabase Auth / RLS / DB / Edge真實路徑下完成建立、讀取、更新、停用、token重生與cleanup。
7. 發布前具備可執行rollback decision tree；部署後仍必須完成Level 4 smoke才能宣告release完成。

## 2. QA目前判定

目前判定：`NO-GO / Level 3執行中，尚未具備正式部署資格`。

部署前阻塞：

- Production migration source已完成reconciliation，仍須把本輪ADR、aliases與recovered migrations形成可追溯且乾淨的committed HEAD。
- 目前branch為`持續優化2`，production branch仍為`main`；尚未決定merge / release commit與artifact來源。
- `verify:dev-045-calendar-subscription-remote-readiness`已更新為v3 migration / normalizer / Edge / Level 3契約；仍須從最終committed HEAD重跑並保存通過證據。
- `ProJED-TEST` migration已在新backup後補齊為38/38；staging env解析通過，TEST Edge下載source與repo逐檔相同。仍須完成Firebase preview OAuth與live `.ics` parity。
- Level 3尚未完成authenticated UI、token lifecycle、v1/v2 compatibility、external calendar client與cleanup。
- production rollback基準尚未為本次release記錄DB function definition、Edge version/source、subscriptions版本分布與Firebase bundle。

既有本機QA / QC只計為Level 0-1 baseline，必須從最終release commit重跑，不得直接累計成Level 3通過。

## 3. 驗證邊界

### In scope

- `20260706091804_calendar_subscription_source_scope.sql`
- `20260706162052_calendar_subscription_v2_filters.sql`
- `20260711171058_calendar_subscription_v3_per_board_filters.sql`
- `calendar-feed` Edge Function與`ics.mjs`
- 行事曆訂閱Builder、逐看板filter、事件預覽、建立 / 修改 / 停用 / token重生
- v1 / v2 / v3相容、RLS / validator / execute grants、匿名token安全
- Firebase staging artifact、PWA / service worker、responsive UI、visible-error sweep
- Level 3 fixture建立、外部calendar client smoke與完整cleanup

### Out of scope

- Google Calendar write API或雙向同步
- production資料修復、background v1/v2 row rewrite
- 未經授權的production migration / Edge / Hosting deploy
- 未經備份的`ProJED-TEST`破壞性或大量資料測試
- 與本批release無關的新需求；已確認納入的DEV-029 / DEV-031 / DEV-046等變更仍須通過各自QA gate

## 4. Release Entry Criteria

全部滿足才可開始Level 3：

| Entry | 必要條件 | Evidence |
|---|---|---|
| E01 Source boundary | 每個dirty file分類為included / excluded / generated；無unknown risk | `git status`、release scope表 |
| E02 Provenance | release branch、commit、upstream與target branch確定；建置工作樹乾淨 | commit SHA、branch、clean status |
| E03 v3 readiness gate | 舊v2 remote-readiness已更新或由新v3 verifier取代 | verifier pass log |
| E04 TEST health | `ProJED-TEST`為ACTIVE_HEALTHY；project ref經雙重核對 | read-only project evidence |
| E05 Staging env | `npm run verify:staging-env`確認Vite staging解析到固定TEST ref、不等於production，且不解析本機測試帳密或自動登入；build後執行`verify:staging-artifact-secrets` | redacted verifier與artifact scan結果 |
| E06 Auth | Firebase preview redirect與staging測試帳號可用 | Auth設定 / 登入證據 |
| E07 Backup | TEST migration / Edge前已記錄backup時間、範圍、方式、restore path | backup evidence ID |
| E08 Rollback baseline | production既有Firebase bundle、Edge version/source、DB functions與subscription版本分布已保存 | rollback evidence package |

## 5. 測試資料矩陣

所有remote fixture使用`LEVEL3-DEV045-YYYYMMDD-HHMM-*`前綴，不得使用真實客戶資料。

| Fixture | 最小資料 |
|---|---|
| Workspace A | owner、member、outsider；Board A、Board B |
| Workspace B | owner、project_manager；Board C |
| Board A | date_types=`start_date`；own task、other assignee task、unassigned task、missing start task |
| Board B | date_types=`due_date`；tagged / untagged、keyword match / mismatch、missing due task |
| Board C | `included=false`，仍保留完整snapshot |
| Dual-date task | 同時有start / due，用於兩個VEVENT與UID suffix驗證 |
| Status set | todo、in_progress、delayed、completed、unsure、onhold |
| Subscription rows | 1筆v1、1筆defensive v2、1筆v3；token只記hash / redacted URL |
| Limit fixture | 只在隔離且核准後建立；驗證FEED_TASK_LIMIT warning，不在一般smoke大量造數 |

Cleanup必須刪除fixture subscriptions、workspace / board / task、測試membership與臨時Auth user；重新查詢應全部為0。

## 6. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 部署混入其他功能 | dirty worktree未分類 | 正式站出現未驗證回歸 | commit diff / artifact provenance | P0 | G0 source boundary硬擋 |
| v3 UI先於DB validator | 發布順序錯誤 | 建立訂閱失敗 | staging create / DB error | P0 | DB→Edge→Frontend順序 |
| Edge仍為舊版 | deploy target或version錯 | Preview正確但feed錯誤 | Edge source/version + live ICS | P0 | bundle/source fingerprint |
| A看板日期套到B看板 | projection key錯誤 | 外部日曆事件錯誤 | task+date type parity | P0 | A start-only / B due-only fixture |
| Preview task數等同event數 | 任務與VEVENT混淆 | 使用者誤判輸出 | DOM event rows vs ICS UID | P1 | dual-date task測試 |
| 權限跨板外溢 | manage permission只在workspace判定 | member讀到未授權任務 | role matrix / revoke smoke | P0 | per-board permission cases |
| 公開token洩漏過多資料 | token未限縮或可猜測 | 資料外洩 | random / disabled / old token cases | P0 | 404 / 410與scope檢查 |
| v1/v2訂閱失效 | migration或Edge只支援v3 | 現有行事曆中斷 | legacy row live feed | P0 | backward compatibility gate |
| 缺日期任務被錯誤輸出 | event projection fallback | 空白或錯日事件 | missing-date fixture | P1 | 未產生原因 + ICS absent |
| PWA快取舊bundle | service worker / cache | 使用者仍看到舊UI | preview hard reload / bundle hash | P1 | artifact / SW smoke |
| nested scroll / mobile截斷 | responsive回歸 | 無法確認事件內容 | 1440/1024/390/320 screenshot | P1 | overflow與5秒理解gate |
| fixture未清理 | smoke中斷或刪除失敗 | TEST污染、下次誤判 | prefix residual query | P1 | cleanup為exit criterion |
| rollback破壞新v3 rows | DB退版未檢查資料版本 | 已建立訂閱失效 | rollback前v3 row count | P0 | 優先只回退Frontend；DB採forward-compatible策略 |

## 7. Gate與測試案例

### G0：Git / Release Scope Gate

| ID | 驗證 | 預期 |
|---|---|---|
| G0-01 | 記錄branch、commit、upstream、dirty status | release輸入唯一且可追溯 |
| G0-02 | 對所有local change分類 | 無unknown-risk change |
| G0-03 | 從release commit建立乾淨worktree重跑 | build不讀取未提交或excluded file |
| G0-04 | 記錄`dist/index.html`引用JS / CSS | 後續preview / production可比對同一artifact |

### G1：Level 0-2 Source / Local Gate

| ID | 驗證 | 預期 |
|---|---|---|
| G1-01 | lint、TypeScript、production build | 0 error；dist生成成功 |
| G1-02 | DEV-045 static / browser / model / feed / ICS | 全部pass |
| G1-03 | DEV-037、DEV-039、Settings與PWA相關regression | 全部pass |
| G1-04 | Deno check與Supabase DB lint | 0 error |
| G1-05 | local DB transaction smoke | 22+ allow / deny / grant cases pass且ROLLBACK |
| G1-06 | v3 remote-readiness | 只驗證v3 canonical contract；不得以舊v2 gate代替 |
| G1-07 | production artifact local preview | root / assets / route / login shell / console / failed request smoke pass |

### G2：Supabase TEST Migration / Edge Gate

執行前核對target project name與ref，禁止連到`ProJED`。

| ID | 驗證 | 預期 |
|---|---|---|
| G2-01 | TEST backup與restore path | 證據完整後才能套schema / Edge |
| G2-02 | 依序套DEV-037→DEV-045 v2→DEV-045 v3 migration | history順序正確；無partial apply |
| G2-03 | validator shape與grants | authenticated可執行；anon / PUBLIC不可直接執行validator |
| G2-04 | v1 / v2 / v3 row allow / deny | 合法通過；missing key、top-level date、0 included、invalid assignee拒絕 |
| G2-05 | deploy staging `calendar-feed`且`verify_jwt=false` | version/source與release commit一致 |
| G2-06 | random token / disabled / expired / regenerated old token | 分別為404 / 410 / 410 / 404；不得洩漏內容 |
| G2-07 | owner失去board access | 下一次feed立即排除該board |
| G2-08 | manager只管理Board B | broad Board B可通過；Board A不可借權限 |

### G3：Firebase Preview + Live UI / ICS Gate

使用已通過`verify:staging-env`的Vite staging mode建置production artifact，部署到Firebase `level3-smoke` preview channel；不得部署live channel。

| ID | 操作 | 預期 |
|---|---|---|
| G3-01 | HTTPS preview開啟與登入 | app shell非空、Auth成功、無visible / console / page error |
| G3-02 | 建立A/B/C逐看板訂閱 | UI建立成功並取得read-only URL |
| G3-03 | A start-only / B due-only / C excluded | Preview與ICS只含對應board / date type |
| G3-04 | dual-date task選兩種date | Preview兩列；ICS兩個VEVENT；UID suffix分別start_date / due_date |
| G3-05 | 比對事件identity | Preview DOM `(task ID,date type,date,board)`與ICS VEVENT完全相同 |
| G3-06 | missing selected date | UI列入未產生原因；ICS不得出現該事件 |
| G3-07 | 依日期 / 依看板切換 | 只改分組；事件集合與總數不變 |
| G3-08 | 修改task日期 / title / status後重抓feed | feed反映最新資料；UID穩定、內容更新 |
| G3-09 | 修改訂閱filters並儲存 | 舊token仍可用且輸出依新snapshot；不產生隱藏inheritance |
| G3-10 | regenerate token | 新token可用；舊token失效；filters JSON不變 |
| G3-11 | disable / enable | disabled回410；enable後有效token恢復輸出 |
| G3-12 | v1 / defensive v2 feed | 既有scope、assignee、date輸出不縮小；編輯儲存後升v3 |
| G3-13 | 外部calendar client訂閱 | 至少一個Google Calendar或Outlook測試帳號看見正確標題 / 日期；測後移除 |
| G3-14 | 1440 / 1024 / 390 / 320 | CTA、filter drawer、事件摘要、完整事件名稱無重疊 / overflow |
| G3-15 | hard reload / SW / cache | preview仍載入本次bundle；不回退舊UI |
| G3-16 | cleanup與residual query | 所有`LEVEL3-DEV045-*`資料與Auth user清除，查詢為0 |

### G4：Production Go / No-Go Review

僅在G0-G3全綠後召開release review：

- 確認release commit、Level 3 preview URL、bundle hash、TEST migration history、Edge version與cleanup。
- 確認production現況備份：migration history、validator definitions、Edge rollback source/version、v1/v2/v3 row counts、Firebase current bundle。
- 確認發布順序：production DB migrations → production Edge → Firebase Hosting frontend。
- 確認新Edge向後支援v1/v2，DB migration向後支援舊frontend；任何一步失敗立即停止，不進下一步。
- 由release owner明確核准production mutation；QA不代替release authorization。

### G5：Level 4 Post-deploy Mandatory Smoke

這些案例在正式部署後執行，未通過不得宣告release complete：

- production URL HTTP 200、載入預期bundle且舊bundle不再被引用。
- hard reload、service worker、console / pageerror / failed request、visible error sweep。
- 使用production-safe測試帳號建立最小own-task v3訂閱，驗證preview / live ICS事件identity。
- random / disabled / old token安全檢查。
- fixture cleanup與production residual query為0。
- 觀察既有v1 feed仍可讀；不得修改既有正式訂閱內容。

## 8. QC執行指令

以下為Level 0-2必要命令；必須在最終release commit的乾淨worktree執行：

```powershell
git status --short --branch
git log --oneline --decorate -5
npm run verify:source
npm run verify:dev-045-calendar-subscription-builder-preview
npm run verify:dev-045-calendar-subscription-builder-preview-browser
npm run verify:dev-045-calendar-subscription-v3-model
npm run verify:dev-045-calendar-subscription-v3-feed
npm run verify:calendar-feed-ics
node scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs --run-local-db
npx supabase db lint --local --level warning
npx --yes deno-bin check --no-lock supabase/functions/calendar-feed/index.ts
npm run verify:dev-037-calendar-subscription-source-scope
npm run verify:dev-037-calendar-subscription-source-scope-browser
npm run verify:dev-039-task-filter-core
npm run verify:dev-039-filter-result-parity
npm run build:test
```

Level 3共用入口：

```powershell
npx vite build --mode staging
npx firebase-tools hosting:channel:deploy level3-smoke --project projed-cc78d --expires 1d
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-level3-firebase-preview.ps1 -Url "<PREVIEW_URL>"
```

Supabase TEST migration / Edge命令由`deployment-release-gate`在target ref、backup與authorization確認後產生並執行；本QA計畫不提供可誤打production的未綁定mutation命令。

## 9. Evidence Package

QC必須提交：

- release branch / commit / clean status / included file list。
- build command、`dist/index.html`、JS / CSS bundle names與hash。
- TEST project health、redacted env target、migration history、Edge version/source fingerprint。
- Level 3 Firebase preview URL與expiry。
- 角色權限矩陣、validator allow / deny、token HTTP status與response headers。
- Preview DOM event export與ICS parsed VEVENT export；附identity diff結果。
- 1440、1024、390、320 screenshots；事件分組、missing reason、drawer、CTA狀態。
- Browser console、pageerror、failed request、visible-error sweep。
- 外部calendar client畫面或可稽核結果。
- fixture cleanup與residual count=0。
- production rollback baseline與Go / No-Go簽核。

Evidence不得包含anon key以外的secret、service-role key、完整token、未遮罩使用者email或正式資料內容。

## 10. Pass / Fail / Stop Conditions

### PASS

- G0-G3所有P0 / P1案例通過。
- Preview與ICS event identity零差異。
- v1 / v2 / v3、角色權限、token lifecycle與permission revoke均通過。
- Level 3使用production artifact + Firebase HTTPS + ProJED-TEST真實DB / Auth / Edge。
- 所有fixture cleanup完成；evidence package完整。

### FAIL

- 任一P0 / P1案例失敗、可見runtime error、事件數或identity不一致、資料越權、舊feed失效、mobile overflow、cleanup殘留。
- 修復後必須從受影響Gate重跑；不能以build / lint成功覆蓋live failure。

### STOP / NO-GO

- release scope不明、dirty build、artifact無法追溯。
- `ProJED-TEST` inactive / polluted、Auth / env / account不可用。
- staging migration partial apply、backup / restore path不存在。
- v3 readiness verifier仍是舊v2契約。
- Preview / ICS identity有任何extra / missing event。
- 無production rollback baseline或release owner未核准production mutation。

## 11. Rollback Decision Contract

- 前端缺陷：優先回退Firebase至前一個已知良好artifact；保留向後相容DB / Edge。
- Edge缺陷：回退至記錄的前一版source/version；先確認沒有新v3 row依賴被回退能力。
- DB migration為function / validator演進，不預設直接down migration。若production已產生v3 rows，禁止在未處理v3資料前回退到不認得v3的validator / Edge。
- 每次rollback前先查v3 row count；若大於0，採forward fix或保留v3-compatible DB / Edge，只回退frontend。
- rollback後重新執行既有v1 feed、token safety與production artifact smoke。

## 12. QA Handoff Conclusion

本計畫已達`QA Plan Ready`。執行責任交給QC與release owner；QA不修改產品、不執行production deploy，也不因既有本機測試通過而提前標記Release Ready。最早可轉為`GO`的條件是：乾淨release commit、v3 remote-readiness更新、ProJED-TEST恢復健康、Level 3 G0-G3全綠、cleanup完成與rollback evidence齊備。
