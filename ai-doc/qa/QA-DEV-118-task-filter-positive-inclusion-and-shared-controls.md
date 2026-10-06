# QA-DEV-118：任務篩選器正向包含與跨介面共用控制驗證計畫

- 關聯 DEV：DEV-118、DEV-039、DEV-045、DEV-062、DEV-090
- 關聯 SPEC：`SPEC-039-task-filter-core-and-workbench-profiles.md`、
  `SPEC-045-calendar-subscription-filter-builder-preview.md`、
  `SPEC-062-simplified-task-status-and-derived-overdue.md`
- 狀態：`Local Candidate QA-QC PASS / NOT RELEASED / Authenticated DB + Release Gate Pending`
- 架構狀態：`RD Implementation Ready / Architecture Confirmed`
- 風險：Browser query／UI／local migration Medium；Calendar validator／Edge／remote release High
- 日期：2026-09-11

## Verification objective and authority

驗證唯一心智模型確實貫穿資料、演算法、UI與外部feed：`未選＝不限；選取＝只顯示符合者；同組OR；
跨組AND`。Browser三個surface必須共用canonical compiler與controlled `TaskConditionFilterControls`；Calendar Edge
可有獨立row adapter，但只能因runtime／資料shape不同，matched truth必須與同一份fixture一致。

本QA是DEV-118新candidate的驗收權威。DEV-039／045／062／090既有PASS只作regression baseline，不能證明
v5 query、v4→v5 migration、shared Board UI、Calendar v4或Edge parity已完成。沒有同一source boundary下的
model、migration、正常UI入口、authenticated DB與feed evidence，只能判定Not verified。產品與演算法契約
不在本QA重述；發現不一致時回到`SPEC-039`／`SPEC-045`修正，再更新直接受影響case。

## Frozen UX Intent

- 任務／結果：熟悉使用者選擇想留下的任務，立即預測Board、Workbench與Calendar preview結果。
- 主物件／主焦點：單一filter panel中的query controls；surface selector、display settings或subscription controls
  是wrapper內容，不建立第二個filter truth。
- 預設刪除：排除語意、全選表示不限、常駐helper、重複摘要、狀態專屬彩色selected規則、巢狀卡片、
  到期按鈕的日期icon與「日」、第二份Board filter JSX。
- 保留舉證：status／date／people／tag／keyword是決定結果的五組；display settings保留但獨立；逾期為可辨識
  風險條件；到期＋天數compound避免兩個控制被誤認為兩個條件。
- 非語言修復：固定順序、section spacing／divider、neutral inactive、brand-blue pressed、focus ring、`aria-pressed`、
  full-value controlled update、局部disabled與error。
- 風險與驗證：migration不覆寫新版本、permission不放寬、source partial不假完整、Escape focus restore、
  keyboard／screen reader、320～1440 viewport、visible error與public feed parity。

## Required deterministic fixtures

唯一fixture檔固定為`scripts/fixtures/dev-118-task-filter-conformance.json`。Browser model verifier與
`supabase/functions/calendar-feed/taskFilterV4.ts` verifier都必須讀此檔；不得各自手寫一份期望值。

| Fixture group | Required data／expected edge |
|---|---|
| Today | 固定`today=2026-09-11`、timezone=`Asia/Taipei`；另有跨午夜`2026-09-10T15:59:59Z`／`16:00:00Z` clock case |
| Status | todo、in_progress、onhold、completed及legacy delayed／unsure；空、單選、多選、四選全開 |
| Due | 2026-09-10逾期、09-11今天、09-18第7天、09-19第8天、null、invalid；completed past與archived past |
| People | owner A、owner B、collaborator A、primary B＋collaborator A、完全未指派、無primary但有collaborator |
| Tags | tag-1、tag-2、兩者都有、無tag；多tag選擇預期OR |
| Keyword | 大小寫、前後空白、繁中、空字串、不命中；title缺省防禦案例 |
| Hierarchy | parent不命中但child命中、canonical duplicate placement、archived ancestor、missing parent、cycle |
| Scale | 500個有效task、5組active query；結果非零且有固定identity checksum |
| Legacy Board | v4 all-status-true、1～3 true、all-false、due only、overdue+due、`__unassigned__`、duplicate IDs、invalid days |
| Local journal | v4 cache、pending upsert、pending delete、write fail、readback fail、remote v4／v5／v6、CAS conflict |
| Workbench | account A scoped v4，兩個board query＋selectedBoardId；account B與panel prefs隔離 |
| Calendar | v1、v2、v3無overdue、defensive v3 overdue、v4 own-only、v4 unrestricted、unassigned、other-user、mixed／unknown shape |
| Actors | owner／project_manager／member／viewer／suspended／anon；manage權限只存在Board A的跨板負向案例 |

所有fixture必須先assert關鍵來源筆數、角色與預期集合非零；0-row、0-event或空assertion不得通過。

## FMEA and zero-tolerance failures

| Failure mode | Impact | Detection | Result |
|---|---|---|---|
| Active status仍代表排除，或四個預設active | 使用者無法預測、badge錯 | M01、B01 | Fail |
| `逾期`與`N天內`做AND | 同時選取只剩交集／空集合 | M03、B03、E03 | Fail |
| `N天內`包含過去 | 已逾期工作混入upcoming | M03、E03 | Fail |
| People／tag第二選項變AND | 合法結果被靜默縮小 | M04、B04 | Fail |
| collaborator-only被算未指派 | 人員責任誤判 | M04、E04 | Fail |
| clear-all改動display／selected board／date types | 非篩選偏好遺失 | B05 | Fail |
| Board仍保留重複filter JSX或Partial merge | 三surface漂移／nested value遺失 | S01、B02 | Fail |
| projection逐task compile或讀clock | 大資料抖動／午夜不一致 | M06、P01 | Fail |
| v4 local值先刪後寫、pending delete變upsert | 偏好遺失或重現 | G01～G04 | Fail |
| v4 client／CAS race覆寫v5／v6 | 新版本資料被破壞 | G05～G07 | Fail |
| Calendar preview正確、Edge仍用v3 matcher | 外部訂閱錯誤 | E01～E06 | Fail |
| v4 broad people由member通過 | 外部資料越權 | D05～D09、E05 | Fail |
| union prefilter漏掉unrestricted board | feed少事件但無錯 | E06 | Fail |
| partial source／unknown version fallback unrestricted | 不完整或越權輸出 | B10、D10、E07 | Fail |
| 正常畫面新增helper／框中框／雙重scroll | filter噪音與阻斷 | B11～B15 | Fail |

## Source and model cases

| ID | Action | Expected／explicit fail condition |
|---|---|---|
| QA-118-S01 | 靜態盤點runtime imports／exports與三wrapper | runtime只用`TaskFilterQuery`／target normalizer；只有既有`TaskConditionFilterControls`承載filter section JSX；UI不importlegacy type；domain不importReact／store／Supabase |
| QA-118-S02 | 檢查surface ownership | Board remote、Workbench local、Calendar draft互不寫入；shared controls不碰persistence／permission／shell |
| QA-118-S03 | 檢查Edge boundary | v4 pure adapter與index dispatch分離；v1～v3 branch仍在；兩runtime verifier引用同一fixture path |
| QA-118-M01 | normalize default／status組合兩次 | deterministic、idempotent；statuses依domain order、people／tags依code-point排序；空status不限，selected為include，四選不折疊，unknown移除 |
| QA-118-M02 | 五組truth table | 同組OR、跨組AND；group未啟用視為true；keyword為AND |
| QA-118-M03 | due matrix | overdue OR today～N；N=0／7邊界正確；past不因upcoming通過；missing／invalid只在date inactive通過 |
| QA-118-M04 | assignment／tag matrix | selected IDs與unassigned各組內OR；只有所有assignment空才unassigned；tags多選OR |
| QA-118-M05 | active count／summary／group clear | 最大5、每組只計1；clear group不動其他組；clear-all只回query default |
| QA-118-M06 | compiler／projection | 固定today；每projection compile once；matched／visible／context-only／canonical identity穩定 |
| QA-118-P01 | WP-A以目前v4凍結500-task baseline；candidate在同fixture／環境跑v5各20次 | checksum一致；記錄兩者絕對p95，v5不得高於v4的1.25倍；不保留runtime v4 benchmark path；沒有逐task Set／clock建立或query不變時重複compile |

## Migration, persistence and concurrency cases

| ID | Setup／action | Expected／explicit fail condition |
|---|---|---|
| QA-118-G01 | v4 all statuses true／1～3 true／all false | 依SPEC mapping；all false轉unrestricted並記intentional expansion |
| QA-118-G02 | due only、overdue only、兩者同時 | 保存v4實際集合：due only轉overdue＋upcoming；overdue優先使舊due冗餘 |
| QA-118-G03 | `__unassigned__`＋collaborator-only | query轉includeUnassigned；target identity有意排除collaborator-only，evidence明列差異 |
| QA-118-G04 | v4 cache／pending寫v5時注入write或readback fail | v4不刪、pending不丟、memory可用；重跑後收斂且無duplicate side effect |
| QA-118-G05 | remote v4無pending hydrate | CAS 4→5成功；cache v5與remote一致；CAS conflict後re-read而非blind overwrite |
| QA-118-G06 | remote v5／v6、local v4 pending upsert／delete | v5按journal與CAS規則收斂；v6block；reset不得刪v6；auth／scope change不送舊mutation |
| QA-118-G07 | rapid writes、network timeout、late response | latest intent保留；outcome unknown保留journal／warning；stale generation不套到新scope |
| QA-118-G08 | Workbench A v4兩board遷移兩次 | v5逐boardquery與selectedBoardId保留；panel prefs／account B不變；readback前不刪v4 |
| QA-118-G09 | display key為非default，query升v5／reset | `TASK_DISPLAY_SETTINGS_VERSION=4`與值原樣；不被query migration或clear-all重設 |

## Calendar DB and Edge cases

所有DB permission結果必須用authenticated actor session執行。service-role只可建立／清除已核對identity的disposable
fixture；不得以service-role成功取代RLS／validator evidence。

| ID | Payload／actor | Expected／explicit fail condition |
|---|---|---|
| QA-118-D01 | v1／v2／v3合法row | 新dispatcher仍接受；既有row 0 background rewrite |
| QA-118-D02 | strict合法v4 own-only | member可在可讀board建立／更新；function grants只有authenticated |
| QA-118-D03 | v4 unknown key、mixed marker、duplicate／invalid status、days -1／366／1.5、invalid UUID | client與DB都拒絕，既有row不變 |
| QA-118-D04 | project_ids／board_filters key缺少、額外、重複、跨workspace | fail closed；不得fallback default snapshot |
| QA-118-D05 | member own-only | 允許；people badge=1 |
| QA-118-D06 | member unrestricted／unassigned／other user | 每張included board均拒絕 |
| QA-118-D07 | project_manager broad Board A | Board A允許；不自動授權Board B |
| QA-118-D08 | owner／membership撤銷、suspended、deleted board | 下一request不輸出該board；edit顯示unresolved，不放寬scope |
| QA-118-D09 | anon直接execute v4／dispatcher helper | denied |
| QA-118-D10 | unknown v5 outer subscription／invalid v4 row | Edge受控失敗，0 data leak，不走v1 unrestricted |
| QA-118-E01 | 同v4 fixture跑browser／Edge matcher | matched task IDs exact equal |
| QA-118-E02 | v1～v3未save edit | public token event identities不變；0 remote write／0 token regeneration |
| QA-118-E03 | overdue＋7天、N=0、past／future／completed | browser preview與feed以task ID＋date type exact equal |
| QA-118-E04 | unassigned／collaborator-only／selected users | browser與feed identity一致；prefilter可多取但final matcher不得誤收 |
| QA-118-E05 | broad scope role matrix、撤權後request | Edge重新檢查permission；不得信任儲存時結果 |
| QA-118-E06 | A unrestricted、B user narrow、C tag narrow | union prefilter不漏A；最終各board matcher與event date types正確 |
| QA-118-E07 | source query失敗／task limit／partial board | 不宣稱完整；依既有failure contract回受控結果與可追溯診斷 |

## Browser delivery-path cases

正常入口固定：Board由上方`過濾器`；Workbench由Board開工作台再開`過濾器`；Calendar由
`設定 → 行事曆訂閱 → 建立／編輯 → 過濾器`。Direct URL或DOM injection不能取代入口證據。

| ID | Viewport／action | Expected／evidence |
|---|---|---|
| QA-118-B01 | 1440×900依序開三surface | section順序、label、chip／compound due／search／people／tags一致；Board只有一份filter controls |
| QA-118-B02 | 各surface選兩status、兩people、兩tags | 同組OR；selected為brand blue＋pressed／outline，inactive neutral；matched IDs一致 |
| QA-118-B03 | 點逾期，再點到期預設7並改0／清空 | 逾期獨立；到期＋數值同compound；按鈕無icon／「日」；date OR與clear正確 |
| QA-118-B04 | status＋date＋people＋tag＋keyword | 跨組AND、badge=5；第二個同組option不增加badge |
| QA-118-B05 | Board改display後group clear／clear-all；Workbench／Calendar同做 | display、selectedBoardId、list/group、included、date types、copy draft不變 |
| QA-118-B06 | Calendar member嘗試他人／未指派／不限 | control disabled且有可存取原因；full-value change仍被wrapper守成exact current user；save不越權 |
| QA-118-B07 | assignee／tag loading→ready、empty、error | selection保留；暫時空不觸發reconcile；empty只有最短狀態，error有局部恢復路徑 |
| QA-118-B08 | Board hydrate／sync fail→retry、v6 remote | hydrating期間controls disabled；warning非阻斷；retry收斂；newer version不允許mutation |
| QA-118-B09 | Workbench切A／B再reload與account switch | 每board／account v5 query獨立；Board remote state與Calendar draft不受影響 |
| QA-118-B10 | Calendar某board source partial／save fail | preview標示不完整、save／generate disabled、draft保留；恢復後可重試 |
| QA-118-B11 | keyboard Tab／Shift+Tab／Space／Enter／Escape | 視覺順序等於focus順序，chip可操作，Escape關閉並回trigger，無focus trap/loss |
| QA-118-B12 | screen reader／forced colors／reduced motion | accessible name／pressed／disabled reason可得；移除顏色仍辨識selected；無動畫依賴 |
| QA-118-B13 | 320×700、390×844、768×1024、1024×768、1440×900 | 無水平overflow、雙重scroll、panel裁切／遮擋；最長成員／tag／board名稱安全truncate／wrap |
| QA-118-B14 | Quietness audit | 無helper、摘要卡、框中框、重複selected訊號；display section只在適用surface存在且不搶主焦點 |
| QA-118-B15 | visible-error／console／HTTP sweep | 0非預期alert、pageerror、console error、4xx／5xx與不合理全零；fixture counts附證據 |

## Required implementation commands

RD必須建立下列同名`package.json` scripts與實際verifier；命名、輸入fixture與artifact root已凍結。任一命令
尚不存在、被skip、只作source字串搜尋或沒有non-zero assertion，該gate為Not verified。

| Package command | Owning verifier／artifact |
|---|---|
| `verify:dev-118-task-filter-model` | `scripts/verify-dev-118-task-filter-model.ts` → `model-result.json` |
| `verify:dev-118-task-filter-migration` | `scripts/verify-dev-118-task-filter-migration.ts` → `migration-result.json` |
| `verify:dev-118-task-filter-edge` | `scripts/verify-dev-118-calendar-edge.ts` → `edge-result.json` |
| `verify:dev-118-calendar-filter-db` | `scripts/verify-dev-118-calendar-db.ps1` → `db-result.json` |
| `verify:dev-118-task-filter-browser` | `scripts/verify-dev-118-browser.pw.js`經既有`run-playwright-code.ps1`、Base URL `http://localhost:4000/` → `browser-result.json` |

```powershell
npm.cmd run verify:dev-118-task-filter-model
npm.cmd run verify:dev-118-task-filter-migration
npm.cmd run verify:dev-118-task-filter-edge
npm.cmd run verify:dev-118-calendar-filter-db
npm.cmd run verify:dev-118-task-filter-browser
```

直接受影響regression gate：

```powershell
npm.cmd run verify:dev-039-task-filter-core
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-045-calendar-subscription-builder-preview
npm.cmd run verify:dev-045-calendar-subscription-v3-model
npm.cmd run verify:dev-045-calendar-subscription-v3-feed
npm.cmd run verify:dev-062-simplified-task-status
npm.cmd run verify:dev-090-task-filter-contract
npm.cmd run verify:dev-090-task-filter-projection
npm.cmd run verify:account-scoped-filter-prefs
npm.cmd run verify:supabase:static
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

既有regression若assert舊v4 shape，不得刪除案例或放寬成source-presence；應保留原風險意圖並更新為v5期望。
Calendar local DB gate必須在transaction／disposable database執行並rollback；它不是remote migration evidence。

## Phase gates and handoff order

| Gate | Entry | Exit |
|---|---|---|
| WP-118-A Fixture freeze | 架構定案 | JSON fixture、M／G failing tests存在且確實先Fail |
| WP-118-B Domain | A通過 | M01～M06、P01、projection／deferred regressions通過 |
| WP-118-C Persistence | B通過 | G01～G09、account／scope／CAS／display不變通過 |
| WP-118-D Shared UI | C通過 | S01～S02、B01～B15與Board／Workbench／Calendar local identity通過 |
| WP-118-E Calendar v4 source | D payload凍結 | S03、D01～D10、E01～E07、v1～v3 regressions與local rollback通過 |
| WP-118-F Candidate | A～E通過 | 全命令、TS、build、evidence provenance與QC handoff完成；仍NOT RELEASED |

任何前一gate未通過，不得用後一層畫面／build PASS抵銷。若實作需要改boolean semantics、surface ownership、
v1～v3 defensive read、permission或release順序，停止並回送架構，不得在RD階段自行改spec。

## Evidence contract and runtime lifecycle

建議evidence root：`output/playwright/dev-118-task-filter/`，至少包含：

- `model-result.json`、`migration-result.json`、`edge-result.json`、`db-result.json`、`browser-result.json`。
- source HEAD／dirty file manifest、fixture checksum、actor／role、provider／DB target、today／timezone、route、viewport。
- 三surface query payload、matched／visible／context IDs；Calendar preview／feed event IDs；CAS request／readback結果。
- 正常、selected、loading、empty、error、disabled、mobile／desktop與recovery screenshots。
- visible error、console、HTTP、v4／v5 performance samples與non-zero fixture counts。

若啟動local app／DB／Edge runtime，執行前記錄project、purpose、port、owning process tree與cleanup condition；
完成後只停止本任務確認擁有的process tree並證明port released。既有他人runtime只可安全reuse，不得全域終止node或清未知port。

## Pass, fail and release boundary

- PASS：WP-118-A～F在同一candidate source全部通過，conformance fixture兩runtime exact parity，所有P0／P1
  FMEA無缺口，evidence provenance完整。
- FAIL：任一語意錯誤、identity drift、scope污染、資料遺失、CAS overwrite、permission放寬、partial假完整、
  visible runtime error、accessibility阻斷或必要viewport失效。
- NOT VERIFIED：缺正常UI入口、缺authenticated DB、缺Edge matcher／feed、只跑舊regression、只有source scan／build、
  fixture全零或沒有today／role／source證據。
- STOP：需background rewrite正式rows、移除v1～v3 read、建立surface-specific predicate、把display混入query、
  修改task schema／RLS／status lifecycle，或無法保留user-owned dirty changes。
- 本QA通過最多只把DEV-118標為`Local Candidate QA-QC PASS / NOT RELEASED`。Remote migration、Edge deploy、
  app deploy、live `.ics`、rollback與production smoke必須收到獨立release指令並使用deployment／Supabase gate。

## Current execution record

`2026-09-11 / Local candidate`：已建立並執行conformance fixture、model／migration／Edge／DB static／browser
verifier；`npx tsc --noEmit`、`npm run build`與DEV-039 direct regression PASS。Authenticated DB matrix、live
`.ics` parity、remote migration、deploy／release尚未執行，依release boundary保留為後續獨立 gate。
