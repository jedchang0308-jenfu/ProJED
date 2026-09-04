# ProJED Documentation Map

## Documentation Map Update - 2026-09-04（DEV-105 會議任務討論時間預約 Brief Ready）

Spec Impact：`Intentional scope extension`。使用者明確把會議模式從純看板／速記延伸為「主持人可為任務設定單一預約數字」；此決策只局部解除 SPEC-005「不做逐項時間控管」的非範圍，不建立完整議程、計時、總額、投票或多人預約。SPEC-007 的原生任務操作與 SPEC-070 的共用 task action／Guard／Command 契約維持。

| 文件／程式權威 | 狀態 | DEV-105 關聯與邊界 |
|---|---|---|
| `ai-doc/dev_task.md` | `Brief Ready / Human Confirmed` | DEV-105 的 canonical 需求、角色矩陣、UX、初步資料邊界、驗收方向與 re-entry gate。 |
| `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` | Existing baseline / 局部非範圍由 DEV-105 擴充 | 看板仍是會議主畫面；只新增主持人右鍵設定與任務數字，不恢復完整會議操作列。 |
| `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` | Compatible | 卡片主要點擊、拖曳、編輯與右鍵開啟行為不得被預約功能劫持。 |
| `ai-doc/specs/SPEC-070-cross-mode-interaction-policy-kernel.md` | Compatible architecture authority | 新右鍵能力必須走集中 action catalog、profile、permission Guard 與 Command，不在 presenter 直接 mutation。 |

Human Decision：第一版僅主持人可設定；每個會議／任務一個數字；入口只在右鍵選單，點擊後直接輸入；有值才顯示；卡片只顯示純數字且順序為「任務名稱 → 截止日 → `[數字]` → 展開按鈕」。明確排除多人預約、未預約提示、單位、總額、計時與完整議程管理。

Execution boundary：本輪只更新 canonical `dev_task.md` 與 `documentation_map.md`，成熟度停在 `Brief Ready`；沒有建立 SPEC／ADR／QA／QC、修改產品程式、測試、schema、migration、provider、Git index、deploy 或 release artifact。

Re-entry：使用者要求交 RD 評估時，升級同一 DEV 到 `RD Contract Ready` 並固定主持人身分、active meeting identity、provider persistence、數值限制與 task surface matrix；要求開始實作時再補到 `RD Implementation Ready`。

使用思考習慣：#最小介面、#使用者視角、#可驗證性

## Documentation Map Update - 2026-09-04（DEV-104 完整移除收藏任務功能）

Spec Impact：`Intentional replacement / feature retirement`。使用者撤銷 DEV-093 與 DEV-103；目前產品不再提供收藏任務資產、收藏任務看板、收藏動作或相應permission／provider／migration。

| 文件／程式權威 | 狀態 | DEV-104 關聯與邊界 |
|---|---|---|
| `ai-doc/specs/SPEC-104-task-collection-feature-removal.md` | Implemented / Local QA-QC Passed | 退場範圍、資料處理、保留能力與重新啟動條件。 |
| `ai-doc/qa/QA-DEV-104-task-collection-feature-removal.md` | Executed | static、typecheck、build、targeted regression與browser delivery path。 |
| `ai-doc/qc/QC-DEV-104-task-collection-feature-removal.md` | Fact report | 區分已證明的本機退場與未執行的shared／remote mutation。 |
| `ai-doc/dev_task.md` | DEV-093／103 withdrawn；DEV-104 complete | canonical status與歷史追溯。 |
| `src`、`scripts`、`package.json`、`supabase/migrations` | 收藏能力已移除 | 不保留入口、domain/store、permission/action、provider、migration或專屬verifier。 |

Execution boundary：只修改本機工作樹。read-only preflight顯示共享local migration history未含DEV-093／103，未執行remote／shared migration、rollback、repair、reset、資料刪除、deploy或release。被刪除的來源仍可由Git歷史復原。

Human／AI decision boundary：停止功能與全部移除由使用者決定；AI採最小退場路徑，保留一般任務、看板、meeting／work_log與tracking reference能力，並以allowlist隔離舊Local Test record family。

使用思考習慣：#差距分析、#刪除優先、#可驗證性、#風險優先
## Documentation Map Update - 2026-09-04（DEV-102 Implemented / Local Automated QA-QC Passed / Tech Lead Reviewed R3 + UI Follow-up / 未 Release）

Spec Impact：`Intentional replacement + compatible extension`。DEV-102以`selectedPlacementIds + primaryPlacementId`取代SPEC-075單一selection cardinality，明確區分visual placement與canonical task；保留private keyed store、單一Scene、geometry isolation與interaction ownership。心智圖`複製`改為clipboard copy，其他模式`task.duplicate`立即複製不變；DEV-076空白畫布左鍵抓取平移維持已放棄／已回復，blank primary-left drag明確分配給矩形圈選。

| 文件／程式權威 | 狀態 | DEV-102 關聯與邊界 |
|---|---|---|
| `ai-doc/dev_task.md` | DEV-102已實作 / 本機交付100 / Release 0 | 總表與詳細交付入口；WP-102-A→E、驗證結果、技術債與release boundary已收斂。 |
| `ai-doc/specs/SPEC-102-mindmap-marquee-multiselect-clipboard.md` | Implemented / Local QA-QC Passed / Tech Lead Reviewed R3 + UI Follow-up | placement selection、心智圖專屬compact menu、不可用action DOM hiding、shared clone plan、node／reindex／side transaction、recovery與clipboard/batch action的authoritative source。 |
| `ai-doc/qa/QA-DEV-102-mindmap-marquee-multiselect-clipboard.md` | Executed / Local Automated QA PASS / UI Follow-up Covered | 記錄pure、browser、不可用action visibility、對比／密度、fault injection、performance、viewport、error arrays、regression與engineering evidence。 |
| `ai-doc/qc/QC-DEV-102-mindmap-marquee-multiselect-clipboard.md` | Local QC PASS / Evidence Verified / UI Follow-up Covered | 交叉核對source、result JSON、compact rendered menu、screenshots與實際命令；限制外推至production／release。 |
| `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102.md` | Reviewed / Conditions Resolved | 五項核心發現、最短因果鏈、必要修正、已知技術債與review gate結論。 |
| `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102-R2.md` | Reviewed R2 / Conditions Resolved | 第二輪五項發現：side/reindex交易、reload recovery、success-effect／undo邊界、真實keyboard baseline與gesture lifecycle。 |
| `ai-doc/reports/RD-TECH-LEAD-REVIEW-DEV-102-R3.md` | Reviewed R3 + UI Follow-up / Implementation Approved | 實作整合缺陷、不可用action隱藏、compact／contrast gate、performance／recovery／regression evidence與release boundary。 |
| `ai-doc/specs/SPEC-075-mindmap-keyboard-navigation-performance.md` | 既有Implemented authority；cardinality局部被取代 | private selection store、keyed notification、latest focus與render isolation仍有效；single selected ID改為set＋primary。 |
| `ai-doc/specs/SPEC-076-mindmap-left-mouse-canvas-pan.md` | 已放棄／回復 | 不恢復blank left-drag pan；中鍵與既有非衝突pan入口保留。 |
| `ai-doc/specs/SPEC-070-cross-mode-interaction-policy-kernel.md`、`SPEC-074-mindmap-single-scene-coordinate-system.md` | Compatible | menu／pointer／keyboard owner與單一Scene不變；marquee只用client-space transient overlay。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md`、`SPEC-048-task-multi-person-assignment.md`、`SPEC-088-task-lifecycle-complete-archive-delete.md` | Compatible | 共用subtree field projection、role normalization與archive lifecycle；DEV-102只增加clipboard時點與atomic multi-target adapter。 |
| `src/components/MindMap/mindMapSelectionStore.ts`、`MindMapView.tsx`、`MindMapNode.tsx` | Implemented authority | 單一selection owner、registry、marquee／keyboard wiring與keyed visual state；沒有第二套state或整樹subscription。 |
| `src/components/MindMap/MindMapContextMenu.tsx`、`src/interactions/task/TaskActionMenu.tsx`、`mindMapClipboard.ts`、`src/features/taskClonePlan.ts`、`src/store/useWbsStore.ts` | Implemented authority | local compact presenter、mindmap-only `hideDisabled`／shared action／clone rules、clipboard與same-board transactional commands；其他模式不變。 |

Execution boundary：DEV-102產品code、verifier、local-test runtime、compact rendered evidence、QA／QC與R3 UI follow-up已完成；本輪task-owned 4000 runtime已停止並確認port released。沒有執行commit、push、PR、deploy、production mutation、正式provider驗證或release。工作樹原先已有大量其他DEV未提交修改，DEV-102以增量patch完成，未覆寫或整理相鄰變更。

ADR not needed：既有SPEC-070／074／075已提供interaction、scene與selection authority；DEV-102不改schema、provider API、角色來源或跨模式資料flow。若實作需要DB transaction／migration、全域selection owner、fractional order或無readback的partial provider writes，依SPEC-102 stop condition回PM／RD，不得靜默擴張。

使用思考習慣：#系統描繪、#拆解問題、#可驗證性、#風險優先

## DEV-093 Naming Release Addendum（2026-09-03）

產品與文件中的任務名稱已全面統一為「收藏任務」，內部 `task_collection`／`collect_task` 識別維持不變。以 live source `0743ef1` 為基底的 rename release commit 為 `7e4aba851529f74790da20c1dc02cc1cbe9fd2d3`，release `20260903035254-d4cf46`，部署至 Firebase Hosting `https://projed-cc78d.web.app`。Hosted Level 3 run `33712826895`、candidate／acceptance／activation、production-bound authenticated smoke與canonical post-deploy smoke均 PASS；35/35 artifact provenance一致，線上 bundle舊詞 0、新詞 26，fixture cleanup residual=0。

Evidence：`output/release/dev-099/20260903035254-d4cf46/`、`output/qa/dev-099/level3-run-7e4aba/level3-evidence.json`。本次為 Lane 1 UI copy release，不改 schema／migration／production data；DEV-100、DEV-101仍未授權。

## DEV-099 T+0 Production Release Addendum（2026-09-03）

DEV-099 已完成正式 T+0 release：release `20260902193607-61ff71`、source `0743ef1dd8f09beffbd58db3b930d8b1197fab52`，部署至 Firebase Hosting `https://projed-cc78d.web.app`。Hosted Level 3 run `33674154248`、candidate acceptance、production-bound feature smoke、artifact provenance 35/35、canonical browser smoke、OAuth safe-cancel `302`與credential rotation均 PASS；feature fixture cleanup `residualRows=0`。live `release-meta.json` 已 HTTP 200 回讀同一 release/source。完整 evidence：`output/release/dev-099/20260902193607-61ff71/` 與 `output/qa/dev-099/level3-run-0743ef1/level3-evidence.json`。

本次只宣告 T+0 production release，不宣告 CAPA-001 closed；R01～R06 historical exact trigger因缺少 operation ID仍為 `NOT_PROVEN`，T+7/T+30 effectiveness follow-up pending。DEV-100、DEV-101維持未授權 future phase。

## Documentation Map Historical Contract Baseline - 2026-09-03（CAPA-001／DEV-099～101 Root Cause Contract與分案）

Spec Impact：`Intentional replacement + causal-track separation`。Production任務「大陸PCT」已readback保存但UI
永久顯示「儲存中」；第二筆同名資料已由使用者確認是未知狀態下的重試。RD技術主管審查確認source存在
callbackless terminal控制缺陷，但現有operation evidence不足以證明事故實際命中哪個分支，且Modal加入新
`updatedAt`使一般no-op不易成立。因此主線DEV-099維持`Incident Trigger Linkage Pending`；已在production-base clean candidate形成CA-01／CA-02，隔離 Supabase TEST provider evidence與canonical root整合 navigation evidence已完成，仍須完整incident correlation、clean hotfix與release evidence；一般create重試冪等
拆為DEV-100，fractional order／bigint則作為事故連結未證實的獨立DEV-101。

| 文件 | 狀態 | 關聯 | 說明 |
|---|---|---|---|
| `ai-doc/reports/CAPA-Register.md` | Active / CAPA-001 issued | CAPA-001 | 新 CAPA-NNN 編號序列的唯一 Register；下一個可核發號碼為 CAPA-002，既有日期型報告列為 legacy records。 |
| `ai-doc/reports/RD-TECH-LEAD-REVIEW-CAPA-001.md` | Conditional pass / T+0 Production Released / R01–R06 NOT_PROVEN / Effectiveness follow-up pending | CAPA-001／DEV-099 | RD 技術主管審查基線仍為 conditional pass；DEV-099 已以 release `20260902193607-61ff71`、source `0743ef1`、Hosted Level 3 run `33674154248`完成正式啟用，exact incident linkage與effectiveness仍待後續證據。 |
| `ai-doc/reports/CAPA-20260902-task-save-stuck-and-retry-duplicate.md` | Open / Incident Trigger Linkage NOT_PROVEN / T+0 Released / Effectiveness Pending | CAPA-001／DEV-099～101 | 區分confirmed control defect、T+0 release evidence、incident linkage pending、retry confirmed與independent order defect；保留closure與clean source boundary。 |
| `ai-doc/specs/SPEC-099-task-persistence-convergence.md` | RD Contract Ready / T+0 Production Released / Adjacent DEV-098 QC PASS / Incident Trigger Linkage NOT_PROVEN / Effectiveness Pending | DEV-099 | persistence authority與release contract已落地；source `0743ef1`、Hosted Level 3、production-bound feature smoke、activation provenance與canonical smoke均 PASS，T+7/T+30 effectiveness仍待。 |
| `ai-doc/qa/QA-DEV-099-task-persistence-convergence.md` | QA Executed / Hosted Level 3 PASS / Candidate + Activation PASS / T+0 Production Released / Incident Trigger Linkage NOT_PROVEN / T+7/T+30 Pending | DEV-099 | source/deterministic、property、candidate、production-bound feature smoke、cleanup、artifact provenance、canonical browser與OAuth safe-cancel均已通過；R01～R06 exact trigger linkage仍 NOT_PROVEN。 |
| `ai-doc/qc/QC-DEV-099-task-persistence-convergence.md` | Executed / Same-Artifact Sign-off PASS / T+0 Production Released / Incident Trigger Linkage NOT_PROVEN / Effectiveness Pending | 獨立核對 release `20260902193607-61ff71`與source `0743ef1`；Hosted Level 3、feature smoke、activation provenance、browser／OAuth與cleanup evidence均已保存；CAPA closure仍待 exact trigger與T+7/T+30。 |
| `ai-doc/specs/SPEC-098-task-detail-subtask-management.md` | RD Implemented / Core + Adjacent QA-QC PASS / Persistence T+0 Released via DEV-099 / Effectiveness Pending / Not Released | DEV-098／099 | surface／drag／navigation契約保留；§7.6 persistence條款由SPEC-099明示取代，DEV-099 T+0 release已完成。 |
| `ai-doc/qa/QA-DEV-098-task-detail-subtask-management.md` | Core QA-QC PASS / Adjacent Regression Audit PASS / DEV-099 Compatibility NOT RUN | DEV-098／099 | S/P/B、QC與DEV-046／053／055／095 targeted regression均已重跑通過；新增persistence相容Gate尚未執行。 |
| `ai-doc/dev_task.md` | DEV-099 T+0 Production Released；R01–R06 NOT_PROVEN；T+7/T+30 effectiveness pending；DEV-100／101 future phase captured | DEV-099～101 | 三條因果／交付線分開登錄；release `20260902193607-61ff71`、source `0743ef1`、Hosted Level 3 run `33674154248`、production-bound smoke、activation provenance與cleanup evidence已建立。 |

Execution boundary：本輪在production-base candidate worktree `codex/capa-001-dev099`（最新 implementation `@e00d9ac`，前序 verifier／browser commits保留）形成 application-only candidate，並執行 source／deterministic、P01–P12／1,000 seeded local property、B01–B11 local-test fault/retry/readback／race／PWA reload-safety、provider attempt trace、local-test browser evidence、隔離 Supabase TEST T00～T09與UI U01～U03；另在 canonical root dirty DEV-098 integration工作樹完成 local browser 13/13與同一 TEST fixture UI U01～U04補驗，並於 clean integrated `@60405c4` 完成 DEV-098 B01～B16 16/16、static 22/22、pure 10/10與independent QC 10/10。production 頁面與 Supabase API/Postgres／incident-window `activity_events`／wbs_items 唯讀查詢建立 correlation artifacts（仍無 task mutation／operation ID correlation；`8.5` bigint error保留為 DEV-101獨立證據），以及 TEST／production project、schema與RLS policy read-only preflight。`output/qc/dev-099/root-integration-result.json`、`output/playwright/dev-099/result-root-local-final.json`與`output/playwright/dev-099/result-root-supabase-ui-final.json`記錄 canonical root整合結果；TEST fixture residual=0、task-owned ports 4010／4013／4014／4015 released。candidate worktree在本輪完成後保持 clean，未修改schema、migration、production Supabase資料或Firebase
artifact；候選分支本身保留 `0de585e`／`7ef9953`／`6eabc3f`／`d2df71e`／`6c9710d` commits，另建立 production-base clean integrated branch（初始 `@d650098`，behavior `@105fdbc`／verifier `@88a550a`，current HEAD `@60405c4`）並完成 U01～U04；`@5bd5200`～`@60405c4`為 release adapter／Release Capsule／hosted Level 3 workflow與env authority修正，未改動 DEV-099 runtime source，current-head revalidation見 `output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`；既有 UI artifact需 current-HEAD pin；所有分支均未 deploy、activate或執行production smoke；root dirty worktree整合僅作 supplemental evidence。DEV-099仍須取得完整exact
trigger correlation並經RD技術主管升級SPEC後，才可宣稱`RD Implementation Ready`。正式hotfix必須由production
base `13888b2`乾淨worktree／等價隔離分支建立，不能默認帶入目前dirty DEV-098與相鄰變更。

### DEV-099 current evidence addendum（2026-09-03）

候選最新 source 為 `codex/capa-001-dev099@e00d9ac45ca2096da4f73dbf6c45ef15a7f69211`，worktree clean。隔離 Supabase TEST authenticated T00～T09 10/10 PASS；同候選 UI U01～U03 PASS，U04 Back/navigation 因 production-base 不含 DEV-098 surface 為 `NOT_RUN`。另建立 production-base clean integrated branch（初始 `@d650098`，behavior tree `@105fdbc`／verifier／QA metadata `@c3af71c`～`@c904435`／current HEAD `@60405c4`）並以同一 TEST fixture UI U01～U04 PASS；同一 branch 的 DEV-098 B01～B16 16/16、static 22/22、pure 10/10與independent QC 10/10亦 PASS；current-head deterministic/property/typecheck/build/lint/release-adapter self-check亦 PASS，見 `output/qa/dev-099/clean-integrated-current-head-60405c4-20260903.json`；canonical root DEV-098 integration supplemental亦 local browser B01～B11＋viewport 13/13 PASS與TEST U01～U04 PASS，確認 peer → Back 返回原 task且維持單一 modal。`output/qc/dev-099/clean-integrated-result.json`、`root-integration-result.json`及對應 browser／cleanup artifacts均已建立；4010／4013／4014／4015 ports released、fixture residual=0。既有 UI artifact仍需 current-HEAD pin；UI diagnostics 的 400／404 無 pageerror／request failure，列為 out-of-scope。此更新不解除 R01～R06 exact trigger、hosted Level 3、activation、release或T+7/T+30 effectiveness gate，也不代表 `RD Implementation Ready`。

Production correlation live addendum：以 production ref `knodlkxqpcqyrtgwpdst` 重新唯讀查詢事故窗，`activity_events=7`、`audit_logs=0`；兩筆「大陸PCT」同 parent／order且建立相隔 48.566321 秒，但 activity payload 無 operation ID，故 R01～R06 exact trigger 仍為 `NOT_PROVEN`。artifact=`output/qa/dev-099/production-incident-correlation-live-20260903.json`。

## Documentation Map Historical Baseline - 2026-09-02（DEV-098 任務明細子任務管理區）

Spec Impact：`Compatible extension / prior out-of-scope re-entry / RD Implementation Ready → RD Implemented`。使用者確認在任務明細
底部加入預設展開、可收合的子任務區，並要求與看板 L3+ 共用編輯入口、拖曳、明細、右鍵等功能。
RD 技術主管 Gate 判定「共用元件與領域核心」通過，但拒絕把看板 `DndContext` 全域提升：明細採
獨立 drag host，與看板共用 task row、interaction controller、drop intent 與 authoritative placement
commit；modal 只接受目前可見子樹與目前任務 root target。當時review移除無 provider契約支撐的10秒
save unknown狀態與獨立 layer module；此persistence決議現已由上方SPEC-099 amendment取代。DEV-098當時以focused navigation hook＋單一 typed save continuation收斂；
QA由原11／15／32案例瘦身為8／10／16案例。產品已完成 local implementation，未修改 schema、migration、
provider、RLS、deploy或release。

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | Historical Core QA-QC PASS / Adjacent Regression + DEV-099 Persistence Release Blocked | DEV-098／099 | 可派工主索引；既有S/P/B/QC為歷史baseline，現行persistence release另受DEV-099阻擋。 |
| `ai-doc/specs/SPEC-098-task-detail-subtask-management.md` | Historical Core Implemented / Persistence Guard Replaced by SPEC-099 | DEV-098／099 | 任務明細local drag scope、shared row／tree、same-modal navigation、overlay／permission保留；persistence convergence移交SPEC-099。 |
| `ai-doc/qa/QA-DEV-098-task-detail-subtask-management.md` | Historical Core QA-QC PASS / DEV-099 Compatibility NOT RUN | DEV-098／099 | S01～S08、P01～P10、B01～B16與QC保留；新增persistence相容Gate尚未執行。 |
| `ai-doc/qc/QC-DEV-098-task-detail-subtask-management.md` | Local Independent QC PASS / Adjacent Regression Audit Blocked / Not Released | DEV-098 | 直接 readback核心 artifacts、source、drag scope、navigation／save、overlay、mobile／permission、failure retention與 baseline disposition；不宣稱 remote／release。 |
| `SPEC-028`、`SPEC-046`、`SPEC-053`、`SPEC-054`、`SPEC-055`、`SPEC-070`、`SPEC-041` DEV-097 addendum／`ADR-047` | Existing authority unchanged / regression inputs | DEV-098 | 保留唯一明細、detail-only title edit、整列拖曳、gesture、interaction kernel與 dirty owner；舊 TaskDetailsModal out-of-scope只約束當時 DEV。 |
| `SPEC-089`、`SPEC-095` | Compatible authority unchanged | DEV-098／089／095 | placement transaction、canonical／tracking identity、permission、explicit tracking subtree與 shared surface parity維持；不得建立第二套 commit或renderer。 |
| `output/qa/dev-098/adjacent-audit-followup-20260902.json` | Fresh follow-up evidence / disposition retained | DEV-098／046／053／055／095 | DEV-055 B10、DEV-095 interaction parity與DEV-055 static verifier重跑結果；仍保留DEV-046-D02、DEV-053-B13/B14與DEV-055其餘9個browser finding，未建立waiver。 |

Execution boundary：DEV-098 已依 WP-098-A→D 完成 local implementation、核心 local automated QA 與獨立 read-only QC；source gate 22/22、
pure P01～P10 10/10、browser B01～B16 16/16、diagnostics 0，並通過 TypeScript、build:test、DEV-002、DEV-028、
DEV-054、DEV-070、DEV-089、DEV-095、DEV-097。fresh regression audit 的 DEV-046-D02、DEV-053-B13/B14與
DEV-055 多個 desktop placement／menu／indicator案例 FAIL；其中 DEV-055 B10 已由相鄰 DEV-095 的最小 menu-order
修正解除並完成受影響案例重跑，DEV-055 static verifier 34/34、DEV-095 interaction parity 8/8；clean baseline已重現
DEV-046-D02、DEV-053-B14與DEV-055所列失敗，fresh dependency-optimized runtime仍重現 DEV-046-D02、
DEV-053-B13/B14與 DEV-055 其餘9個browser failure，故目前不得宣稱整體 regression 或 release ready；原始輸出、QC readback與基線摘要保留於
`output/qa/dev-098/`、`output/qc/dev-098/`。
runtime ownership 與 cleanup 邊界記於 `output/qa/dev-098/runtime-cleanup.json` 與
`output/qa/dev-098/adjacent-audit-20260902.json`。獨立 QC-098-01～10 已 10/10 PASS；
下一步為相鄰 finding disposition與 owner waiver／修正後重跑；實機 supplemental、commit、merge、push、deploy、remote operation與 release
仍不在本輪授權內。

2026-09-02 follow-up：同一 fresh dependency-optimized task-owned runtime 重跑 DEV-098 core browser B01～B16
16/16、diagnostics 0，source gate 22/22、pure P01～P10 10/10、TypeScript與獨立 QC-098-01～10 10/10；
DEV-046-D02 最小資料集歸因檢查未形成可安全套用的相鄰修正，未使用未授權 waiver，故以上 regression／release boundary 維持不變。

2026-09-02 adjacent follow-up：DEV-055 B10 的 `task.create-tracking-reference` 已移至 assignment 後的既有 tracking-reference 區段，
在 1440×900／1024×768 重跑均 PASS；DEV-095 B17～B24 8/8、DEV-055 static 34/34 通過。DEV-055 完整 browser 目前 9/18 PASS、
9/18 FAIL（B01、B02、B03、B04、B06、B08、B14、B15、B15A），另 DEV-046-D02 與 DEV-053-B13/B14 仍 FAIL；相鄰 owner 尚未提供 waiver，
因此 DEV-098 維持 Adjacent Regression Audit Blocked / Not Released。

2026-09-02 final adjacent audit：DEV-046 static/browser 32/32＋5/5、DEV-053 31/31＋10/10、DEV-055
34/34＋18/18、DEV-095 4/4 均 PASS；affected cases 已完成修正後重跑，未使用 waiver。最新證據為
`output/qa/dev-098/adjacent-audit-final-20260902.json`，DEV-099 persistence、實機 supplemental與 release
仍未執行，故目前狀態為 `Adjacent Regression Audit PASS / Not Released`。

## Documentation Map Update - 2026-08-31（DEV-097 RD Implemented / Local Automated QA + Independent QC PASS / Physical Device Supplemental Not Verified / 未 Release）

Spec Impact：`Intentional replacement / ADR-047 architecture authority / SPEC-041 DEV-097 executable authority / RD implemented / Local Automated QA PASS / Independent QC PASS`。使用者確認`1A／2A／3A`後，RD技術主管審查發現原方案仍受`virtual:pwa-register`內建reload、`clientsClaim:true`、all-live completion／五分鐘stale衝突、heartbeat TTL safety推論與one-frame readiness影響。文件已完成corrective replacement，且DEV-097已落地application-owned Workbox registration、non-claiming activation、release-scoped cache retention、activation transaction／per-client convergence split、explicit readiness、typed owner manifest與compact UI；九-owner、雙分頁、flush／取消／失敗讀回、A→B→C real-SW及相鄰regressions已由local automated QA與independent QC通過。physical device supplemental與release仍待執行。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / Local Automated QA PASS / Independent QC PASS / Physical Device Supplemental Not Verified / Not Released | DEV-097 / DEV-041 / DEV-096 | Authoritative DEV；固定ADR、Workbox／cache isolation、local interface、typed manifest、transaction split、owner matrix、WP-097-A～F、commands與stop conditions。 |
| `ai-doc/decisions/ADR-047-pwa-per-client-reload-isolation.md` | Accepted / RD Implemented / Local Automated QA PASS / Independent QC PASS / Physical Device Supplemental Not Verified | DEV-097 / DEV-096 / DEV-041 | Architecture Memory Source：application-owned Workbox、`clientsClaim:false`、release cache retention、per-client convergence與old-cache reclamation future capsule。 |
| `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md` | DEV-097 Addendum Authoritative / RD Implemented / Local Automated QA PASS / Independent QC PASS / Physical Device Supplemental Not Verified | DEV-041 / DEV-096 / DEV-097 | 產品與實作authority：local safe boundary、dirty exact set、effect ownership、application navigation/cache retention isolation、transaction split、owner／failure／verification contract；shared-scope controllerchange boundary已記錄。 |
| `ai-doc/qa/QA-DEV-097-pwa-safe-reload-orchestration.md` | QA Executed / Local Automated QA PASS / Independent QC PASS / Physical Device Supplemental Not Verified / Not Released | DEV-097 | 記錄九-owner、dual-tab、flush／cancel／failed readback、A→B→C real-SW、RWD、visible-error與相鄰regression fresh evidence。 |
| `ai-doc/qc/QC-DEV-097-pwa-safe-reload-orchestration.md` | Local Independent QC PASS / Physical Device Supplemental Not Verified / Not Released | DEV-097 | 獨立事實驗證、artifact provenance、runtime cleanup與實機環境缺口。 |
| `src/services/pwaReloadSafety.ts`、`src/services/pwaReloadOwnerManifest.ts`、`src/hooks/usePwaReloadSafetyOwner.ts`、`src/components/PwaReloadSafetyBridge.tsx` | Implemented / Targeted Verifier PASS | DEV-097 | local safety domain、typed owner manifest、React adapter與boundary intent bridge；9 類 owner adapter已接入。 |
| `package.json`／lock、`vite.config.js`、`src/services/pwaUpdateService.ts`、`src/components/AppUpdatePrompt.tsx`及owner matrix components | Implemented / Static＋browser＋real-SW QA／QC PASS | DEV-096 / DEV-097 | application-owned Workbox、release cache namespace、explicit readiness、local safety gate與compact prompt已落地；physical device supplemental與release pending。 |

Execution boundary：本輪已完成DEV-097 A→F的產品、verifier、build/package、QA evidence與文件變更；未修改migration或release artifact。Cross-spec為明示的`Intentional replacement`；原技術主管P0／P1 findings已由新architecture contract收斂，unresolved conflict=0。`Local Automated QA PASS`與`Independent QC PASS`均不等於release PASS；iOS／Android實機補充為`Not Verified`，固定結果已產生於`output/qa/dev-097`與`output/playwright/dev-097`。

## Documentation Map Update - 2026-08-30（DEV-096 PWA 更新交易收斂與提示精簡 Implemented / Local QA-QC PASS / 未 Release）

Spec Impact：`Implementation needs correction / Corrective addendum authoritative`。DEV-096 沿用同一任務完成 `RD Implemented / Local QA-QC PASS / 未 Release`；SPEC-041 已加入修正附錄，固定不可變 release ID、crash-safe target transaction、controllerchange reload fallback、跨分頁 lease、post-reload 對帳、有界限 recovery 與精簡 UI。舊 DEV-041 production evidence 仍是歷史事實，但舊 CTA、normal cache purge 與 background apply 不再是現行實作權威。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / Local QA-QC PASS / 未 Release | DEV-096 / DEV-041 | Authoritative DEV；transaction、version identity、Web Locks／IndexedDB 原子鎖、controllerchange reload fallback、retarget、post-reload 對帳與 compact UI 已落地；static 25/25、browser、real-SW、regression、TypeScript、build 與 targeted lint 通過。 |
| `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md` | DEV-096 Corrective Addendum / Implemented / Local QA-QC PASS / Historical DEV-041 release retained | DEV-041 / DEV-096 | 修正現行 update authority：normal flow 走 waiting worker／controllerchange reload fallback；startup current===target 才完成；cache purge 只作人工 recovery。 |
| `ai-doc/qa/QA-DEV-096-pwa-update-transaction-convergence.md` | Local QA Executed / Core Acceptance PASS / Production Not Authorized | DEV-096 | CT／UI／TX／SW／MT-01／REG 核心 evidence 已執行；immutable A／B／C fixture、真實 SW、多分頁、retarget、viewport、visible-error、build 與 regression artifacts 已留下。 |
| `ai-doc/qc/QC-DEV-096-pwa-update-transaction-convergence.md` | Local Implementation QC PASS / 未 Deploy / 未 Release | DEV-096 | 獨立 readback local candidate；記錄 root-cause 修正、首輪失敗保留、static/UI/real-SW/雙分頁/storage safety/regression 結果與 production boundary。 |
| `ai-doc/qa/QA-DEV-041-pwa-update-notification-cache-recovery.md` | Historical Phase 1 baseline / DEV-096 authority note added | DEV-041 / DEV-096 | 歷史 PASS 保留；B02 舊 CTA 與 C01～C04 normal apply 語意已被 DEV-096 取代，其餘 cases 作 regression。 |
| `src/services/pwaUpdateTransaction.ts` | Implemented / pure PASS / WP-096-A | DEV-096 | transaction schema、strict parser、legal transition、lease／takeover 與 completed suppression 已建立。 |
| `src/services/pwaUpdateService.ts`、`src/components/AppUpdatePrompt.tsx` | Implemented / browser＋real-SW PASS / WP-096-C～D | DEV-096 | 已收斂多 writer、移除 background apply／normal cache purge、加入 startup verification、retarget、quiesce、bounded recovery 與 exact compact visible set。 |
| `vite.config.js`、`src/vite-env.d.ts`、`scripts/release/verify-production-artifact.mjs` | Implemented / artifact parity PASS / WP-096-B | DEV-096 / DEV-083 | sealed build 的 `PROJED_RELEASE_ID` 已注入 client；bundle／meta／manifest 三方 parity gate 通過。 |
| DEV-041 verifiers、DEV-096 static／browser／real-SW verifiers、`package.json` | Implemented / local evidence PASS / WP-096-E | DEV-041 / DEV-096 / DEV-034 | 已新增 A→B→C、B waiting→C、多分頁、post-reload、UI 與 regression evidence；結果存於 `output/qa/dev-096`、`output/playwright/dev-096`。 |

Execution boundary：WP-096-A→B→C→D→E 已在本地完成並交付 QA／QC evidence；不需 DB／migration。未以 DEV-041 歷史 release 充當本次 evidence。未授權 commit、merge、push、deploy 或 release；正式站 A→B 驗證仍需另走 deployment-release-gate。

## Documentation Map Update - 2026-08-29（DEV-095 RD Implementation Ready／Interaction Parity Rework Required／Existing Baseline Scoped／未 Release）

Spec Impact：`Compatible product extension + Intentional data-model expansion + Intentional interaction-contract replacement`。identity／placement、single primary roll-up、dynamic derived read、same-Workspace與provider boundary維持；最新使用者決策要求tracking reference除外層虛線與placement command route外，與primary共用相同surface view、click／context action、pointer／keyboard／mobile DnD及recursive child tree。程式審查確認現行`TrackingReferenceItem`仍複製List／card／checklist內容、直接處理details並使用獨立subtree renderer，因此舊B01～B16 16/16、QC01～QC07 7/7只能保留為identity／placement／外觀historical baseline；B16固定唯讀context acceptance已被capability-aware shared interaction contract取代。`SPEC-095`、`ADR-046`、`QA-DEV-095`與`QC-DEV-095`已同步到`RD Implementation Ready / Interaction Parity Rework Required`；新parity尚未實作或驗證，remote Supabase TEST、migration與release亦未執行。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implementation Ready / Reopened / Interaction Parity Rework Required / 未 Release | DEV-095 | 登錄最新shared component／interaction／child-tree決策、現行gap、執行邊界與historical evidence限制。 |
| `ai-doc/specs/SPEC-095-task-tracking-reference-projections.md` | Authoritative / RD Implementation Ready / Interaction Parity Rework Required | DEV-095 | 固定`TaskPlacementInteractionContext`、shared controller／frame／pure surface views／recursive tree、capability-aware action parity、WP5～WP6A、AC-095-019～024與stop conditions。 |
| `ai-doc/decisions/ADR-046-task-identity-and-placement-projection.md` | Accepted / Interaction Parity Amendment Accepted / Implementation Rework Required | DEV-095 | Architecture Memory Source；拒絕reference duplicate renderer與mega variant component，採controller／surface／tree責任分層。 |
| `ai-doc/qa/QA-DEV-095-task-tracking-reference-projections.md` | QA Plan Ready / Existing B01～B16 Baseline Scoped / New Interaction Cases NOT RUN / L3 Not Run | DEV-095 | 新增source duplication、click/action、pointer-keyboard-mobile DnD、recursive child tree、capability與visible-error parity驗證；歷史artifacts不預填新PASS。 |
| `ai-doc/qc/QC-DEV-095-task-tracking-reference-projections.md` | Reopened / Existing Local Baseline PASS / Interaction Parity QC NOT RUN / 未 Release | DEV-095 | 保留舊artifact fresh facts，但明確不支持新互動契約；待RD frozen candidate後執行新parity QC。 |
| `TaskNode`、`useWbsStore`、task interaction／placement services | Incremental implementation / local PASS | DEV-095／DEV-089 | 保留既有 canonical `nodes` 相容路徑，新增 `trackingReferences`、provider capability、projection selectors 與 placement-only actions；Firebase不建立client-only reference。 |
| `SPEC-089`、`SPEC-039`、`SPEC-044/047/082/086/088`、`ADR-036` | Existing authorities / Resolved compatibility matrix | DEV-095 | canonical ownership、filter identity、undo、backup、Realtime、workbench、lifecycle與Board治理保留；SPEC-095對tracking projection的identity／permission／consumer行為為新authority。 |

Execution boundary：目前可執行的是本地interaction parity rework與新source/browser/QC evidence；不需為此UI refactor改寫既有migration。`result.json` B01～B16、DB 15/15、backup 4/4、cross-mode 12/12與QC 7/7均為historical baseline，新interaction artifact尚不存在。remote schema readiness仍BLOCKED，未套用remote migration、未deploy、未release；既有DEV-093與其他未提交變更保留。

## Documentation Map Update - 2026-08-28（DEV-094 免匯入直接會議速記 RD Implementation In Progress）

Spec Impact：`Compatible corrective addendum + intentional meeting-import interaction replacement`。使用者確認：只有正常新建 meeting draft 時直接聚焦內容編輯器，existing／recovery／conflict／dialog 不搶焦點；`速記` step 只聚焦、不暗中存草稿；`匯入` 保留第一格、使用次要樣式，預設一鍵控制顯示 `帶入上次會議後變更`，實際加入同看板「上一筆已發布且成功匯入的截止時間（不含）→本次點擊時間（含）」事件，首次回溯七天。低頻 `自訂日期` 可直接造成 gap／rollback 且不警告；成功只顯示 `已完成`。RD contract 已固定既有 `KnowledgeRecord.metadata.meetingProjectChangeImport` v1、draft batches／publish-only `effectiveCutoffAt`、stable event ID、exclusive start query、undo／AI／F5 recovery、ephemeral focus token、atomic no-commit error path與 WP-094-A～E；Supabase／local-test不需 migration，Firebase activity維持 explicit empty。`QA-DEV-094` 已固定 20 個 automated cases、8 個 rendered cases與 evidence paths，但產品、verifier、QA/QC、遠端及 release 均未執行。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Authoritative addendum / RD Implementation Ready / Human Confirmed / implementation wiring landed | DEV-094／DEV-020 | 固定 metadata/API、cutoff algorithm、one-click transaction、undo／AI／recovery、focus、UI entry、逐檔 WP、provider／rollback與 error matrix；產品已依契約落地，完整 QA/QC 仍待執行。 |
| `ai-doc/dev_task.md` | RD Implementation In Progress / Human Confirmed / static＋pure＋browser smoke PASS / QA・QC NOT RUN | DEV-094 | 登錄不可變決策、RD entry contract、WP-094-A～E與 implementation evidence；不代表完整 QA/QC 或 release。 |
| `ai-doc/qa/QA-DEV-094-meeting-direct-note-and-delta-import.md` | QA Plan Ready / implementation smoke PASS / NOT RUN | DEV-094 | deterministic fixture、FMEA、TC-094-001～020、ROT-094-001～008、provider／focus／request-count／viewport與 evidence JSON；目前只有 static／pure／1440×900 smoke，未預填 QA PASS。 |
| `SPEC-023`、`QA-DEV-020`、`QA-DEV-023` | Existing authorities / meeting interaction superseded / work-log retained | DEV-094／DEV-023／DEV-020 | 已加 compatibility note，避免 RD 沿用舊 meeting 設定／preview／insert 驗收；歷史 PASS 不重寫，work-log 與 preserve regressions保留。 |
| `src/components/Records/RecordSidebar.tsx`、`src/components/Records/MeetingProjectChangeImportControl.tsx`、`src/store/useRecordStore.ts`、`src/utils/meetingRecordWorkflow.ts`、`src/utils/meetingProjectChangeImport.ts`、providers | Implementation landed / static 13＋pure 7＋1440×900／390×844 smoke PASS | DEV-094 | 新 meeting direct focus、`速記 -> focusContent`、meeting one-click／custom import、原子 append／metadata、publish-only cutoff與 exclusive boundary 已落地；完整 QA/QC、Firebase negative與 release仍待執行。 |

Execution boundary：DEV-094 已修改產品程式、provider boundary、static／browser verifier與 package command；未新增 schema／migration、未套用遠端、未 deploy、未 release。1440×900 browser smoke 使用既有 local-test runtime，未啟動新的 app server。

## Historical Update - 2026-08-28（DEV-093，已由 DEV-104 撤銷）

DEV-093曾定義收藏任務資產化，但從未Release，相關migration也未進入共享local／remote history。2026-09-04依使用者決策由DEV-104完整移除；舊實作與驗證細節只存在於Git歷史，不再是現行文件或產品authority。

現行authority：`SPEC-104-task-collection-feature-removal.md`、`QA-DEV-104-task-collection-feature-removal.md`、`QC-DEV-104-task-collection-feature-removal.md`。
## Documentation Map Update - 2026-08-27（DEV-092 會議紀錄側欄資訊精簡）

Spec Impact：`Intentional replacement`。依使用者瀏覽器 Comments 1–7 與後續留言，SPEC-020 原有功能說明入口視為歷史契約；現行側欄移除裝飾 icon、說明 modal、會議流程標題與輔助說明、各階段 icon／副標題、`AI選用`、`AI整理來源：任務變更` 摘要列與正常完成 checkpoint 常駐文案，新會議標題固定為「會議紀錄」，紀錄時間改為 24 小時制且不顯示上午／下午，會議標題與紀錄時間同列，內容編輯器填滿其他固定區塊後的剩餘高度並保留窄版最小高度，會議模式 `存草稿`／分享範圍控制列採單列緊湊版，會議流程階段列採緊湊高度並依可操作狀態提供 pointer／hover／不可操作游標，收合控制改用全域工作台同款方向並移到右側抽屜最左側、位於標題前，會議空白關聯任務不顯示摘要或 `選取任務` action，個人工作紀錄入口維持。保存失敗／衝突／暫停與保存中狀態、紀錄資料與未儲存防呆不變。DEV-092 狀態為 `Implemented / Local QA-QC PASS / 未 Release`。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | In sync | DEV-092／DEV-020 | 新增 UI 精簡 addendum，明確取代功能說明入口與空白摘要的歷史視覺契約。 |
| `RecordSidebar.tsx`、DEV-092 scripts | Implemented / Verified | DEV-092 | header、緊湊 workflow／控制列、內容編輯器剩餘高度 flex-fill、可操作游標／hover、AI整理來源列移除、標題／時間同列、空白任務狀態、收合／展開方向與 RWD 互動已落地。 |
| `QA-DEV-092`、`QC-DEV-092` | Executed / PASS | DEV-092 | static 43 checks、1440×900／390×844 rendered browser、內容區最小高度／控制列不重疊、互動、overflow 與 error sweep PASS。 |

## Documentation Map Update - 2026-08-27（DEV-091 工作台 Y 軸分隔線）

Spec Impact：`Compatible extension`。使用者要求調整未歸位／已歸位的 Y 軸版面並把喜好記錄在帳號；DEV-091 以單一水平 separator、18%～82% 比例、pointer／keyboard 操作與既有 account UI preference 路徑交付，不改 placement、task data、schema、permission 或 release。狀態為 `Implemented / Local QA-QC PASS / 未 Release`。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md`、`SPEC-039` DEV-091 addendum | In sync / Local QA-QC PASS | DEV-091／DEV-039 | 固定比例式split、互動／A11y、帳號偏好、out-of-scope與release boundary。 |
| `TaskWorkbenchPanel.tsx`、task workbench／account preference modules | Implemented / Verified | DEV-091 | pointer move只更新UI、結束後保存；local cache＋`profiles.ui_preferences.layout.taskWorkbenchUnplacedRatio` hydration。 |
| `QA-DEV-091`、`QC-DEV-091`、DEV-091 scripts | Executed / PASS | DEV-091 | static 16 checks、1440×900／390×844 rendered、reload、keyboard、overflow、error sweep與DEV-039 regression PASS。 |
| `output/playwright/dev-091/*.png` | Human-inspected rendered evidence | DEV-091 | 桌機／窄版分隔線、兩區幾何與無重疊／裁切證據。 |

## Documentation Map Update - 2026-08-26（DEV-090 預設全顯示與帳號看板篩選一致性）

Spec Impact：`Intentional replacement + corrective follow-up`。使用者確認未設定篩選時必須顯示全部任務，主動篩選喜好歸屬個人帳號並按看板隔離；production 診斷同時證實現行 uid-only 本機偏好與清單／心智圖逐層 predicate 會造成同看板跨模式結果不一致。DEV-090 已完成 default／v4 migration、專用 preference table與RLS、version-safe repository、獨立store、五模式canonical projection、互斥visible states及local automated QA-QC；狀態為 `Implemented / Local QA-QC PASS / Not Released / Release Gate Required`。本狀態不授權 remote migration、正式資料、deploy 或 release。

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | Implemented / Local QA-QC PASS / Not Released | DEV-090／DEV-039 | WP1～WP6與驗收清單完成；正式上線仍須獨立release gate。 |
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Authoritative Addendum / Implemented / Local QA-QC PASS | DEV-090／DEV-039 | v4 state、table/RLS、repository、legacy reset、consumer matrix、failure recovery與release boundary已落實。 |
| `ai-doc/decisions/ADR-045-account-board-task-filter-preferences.md` | Accepted / Implemented / Local QA-QC PASS | DEV-090 | 專用 `account_board_task_filter_preferences`、exact-scope cache、unknown-version guard與五模式ownership已實作。 |
| `ai-doc/qa/QA-DEV-090-default-show-all-account-board-filter-consistency.md` | Executed / Local Automated QA PASS / QC PASS | DEV-090 | source/model、isolated PostgreSQL grants/RLS、五模式browser、failure feedback、viewport與targeted regressions全部PASS。 |
| `ai-doc/qc/QC-DEV-090-default-show-all-account-board-filter-consistency.md` | Local Automated QC PASS / Release Gate Required | DEV-090 | 彙整source boundary、DB/UI artifacts、第一次B18反例與修正後重跑結果；明確維持Not Released。 |
| task-filter core/store/projection、五模式 consumers、Supabase adapter/types/migration、DEV-090 scripts | Implemented / Verified Locally | DEV-090 | forward-only migration與client已完成；production target、migration apply、deploy與smoke待獨立release gate。 |

## Documentation Map Update - 2026-08-26（DEV-089 Production Reopen／Scope-safe Placement Command）

Spec Impact：`Compatible corrective amendment + Intentional replacement`。2026-08-26 production 證實「未歸位→看板」在 RPC 前因 parent-only root bucket 混入其他 workspace／board siblings 而被 ownership boundary guard 拒絕；先前 Local／TEST／單向 Level 3 PASS 降為歷史 baseline。SPEC-089 Rework 1 保留原子性與失敗保留 invariants，以共用 `MoveTaskSubtreeCommand v2`＋server canonical ordering 取代跨 ownership generic node batch／client sibling patches。2026-08-26 已完成RD local實作、1,000-fixture property、可丟棄PostgreSQL transaction harness與desktop/mobile rendered UI；Supabase TEST、Level 3及production仍stop-ship。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | Rework 1 RD Implemented / Local QA-QC PASS / P0 Stop-Ship | DEV-089 | 原 DEV 重啟、不另建重複 DEV；登錄 production error、root cause、WP1-WP6、local evidence、QA/QC acceptance與 release re-entry boundary。 |
| `ai-doc/reports/CAPA-20260825-task-placement-disappears-on-mobile.md` | Reopened / RD Local Correction PASS / Effectiveness Pending | DEV-089／CAPA-20260825-01 | 保留來源未遺失的 containment；CA/PA local evidence已完成，Supabase TEST、Level 3、Level 4、T+7/T+30仍待執行。 |
| `ai-doc/specs/SPEC-089-authoritative-task-placement-transaction.md` | Authoritative / Rework 1 RD Implemented / Local PASS | DEV-089／DEV-086 | 固定 `PlacementScope`、command/canonical response、v2 RPC、server locks/order、exactly-one-source postcondition、UI Entry Contract、AC與release boundary。 |
| `ai-doc/qa/QA-DEV-089-authoritative-task-placement-transaction.md` | Local source/property/UI PASS / TEST-Level 3 NOT RUN | DEV-089 | 1,000 randomized property、local DB harness與desktop/mobile雙向通過；Supabase DB01-DB04完整矩陣、Level 3/4仍不可替代。 |
| `ai-doc/qc/QC-DEV-089-authoritative-task-placement-transaction.md` | RD Local Rework PASS / Production Known FAIL | DEV-089 | local return evidence可交下一階段；production既有反例仍有效，禁止在TEST/Level 3/Level 4前解除stop-ship。 |
| `taskPlacementCommand.ts`、`taskDropIntent.ts`、`taskDragCommit.ts`、`placementTransaction.ts`、`useWbsStore.ts`、Supabase service/types | Implemented / Local PASS | DEV-089 | discriminated ownership＋scope-safe index、shared desktop/mobile v2 command、canonical result store owner、fallback compensation與v2 provider adapter。 |
| `20260826083940_dev_089_scope_safe_task_placement_command.sql` | Created / Local PostgreSQL Harness PASS / TEST NOT APPLIED | DEV-089 | forward-only ledger amendment、v2 RPC、deterministic scope locks、dense order、exactly-one-source/canonical postconditions與explicit grants；既有 `20260825093621`未改寫。 |
| `scripts/verify-dev-089-*`、DEV-086 browser regression | Static + 1,000 Property + Local DB/UI PASS / Level 3-4 NOT RUN | DEV-089 | desktop、390×844、320×844雙向/跨工作區與failure containment通過；Supabase ledger/reload/concurrency仍須同artifact Level 3/4。 |

## Historical Snapshot - 2026-08-25（DEV-089／CAPA-20260825-01；已被 2026-08-26 production reopen 取代）

歷史 Spec Impact：`Intentional replacement`。本節只保存當日 evidence，不代表目前狀態；目前權威結論以正上方 2026-08-26 update 為準。當時 SPEC-089 取代 SPEC-086 的 optimistic failure recovery：看板 WBS 與帳號級未歸位之間必須先完成 idempotent canonical transaction，再收斂 local placement；failure 保留完整來源子樹。新增 operation ledger／RPC migration、手機 fault injection 與 exactly-one-source release gate；TEST DB01-DB03 與單向 Level 3 當時通過。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/reports/CAPA-20260825-task-placement-disappears-on-mobile.md` | TEST DB01-DB03 + Level 3 PASS / Production effectiveness pending | DEV-089／CAPA-20260825-01 | 記錄跨裝置分歧、五層 root cause、containment、Correction／CA／PA、DB03 rejection matrix 與 T+7／T+30 effectiveness threshold。 |
| `ai-doc/specs/SPEC-089-authoritative-task-placement-transaction.md` | Authoritative / RD Implemented / Local QA-QC PASS | DEV-089／DEV-086 | 固定 await-before-local、exactly-one-source、exact subtree、idempotency、pending、failure、security 與 release boundary。 |
| `ai-doc/qa/QA-DEV-089-authoritative-task-placement-transaction.md`、`ai-doc/qc/QC-DEV-089-authoritative-task-placement-transaction.md` | Local PASS / TEST DB01-DB03 PASS / Level 3 PASS / 未 Release | DEV-089 | FMEA、source contract、390×844 mobile fault injection、TEST transaction/RLS/rejection matrix、authenticated preview smoke 與 production 未執行邊界。 |
| `placementTransaction.ts`、`useWbsStore.ts`、`taskDragCommit.ts`、`TaskPlacementPendingIndicator.tsx` | Implemented / Local PASS | DEV-089 | awaited durable commit、pending source stability、desktop/mobile failed result、success effects only 與共用 compact spinner。 |
| `20260825093621_dev_089_transactional_task_workbench_placement.sql`、`taskWorkbenchUnplacedService.ts` | TEST Applied `20260825125421` / Production migration pending | DEV-089 | owner operation ledger、RLS/grants、full-subtree transaction RPC、與 client 一致的 configurable `move_task` capability、row lock、fail-safe link/dependency guard、same-ID retry；TEST ACL/RLS/readback 與 backup evidence 已完成，production 未套用。 |
| `scripts/verify-dev-089-*`、`output/playwright/dev-089/mobile-placement-failure-retains-source.png` | Static + Browser + TEST DB01-DB03 + Level 3 PASS | DEV-089 | 手機 fault 後 source=3、destination duplicate=0、parents preserved、roll-up=0、pending/transient=0、page error=0；authenticated preview 看板→未歸位與 reload 通過，DB03 rejection 後 fixture=0。 |

## Documentation Map Update - 2026-08-25（DEV-088 任務生命週期）

Spec Impact：`Intentional replacement`。使用者採用 `完成／取消完成 → 封存 → 永久刪除`；SPEC-088 成為任務生命週期 authoritative source。DEV-029／038／070 的「刪除任務＝isArchived」舊語意保留為歷史，active task surfaces 改為封存，永久刪除只在目前看板回收桶。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-088-task-lifecycle-complete-archive-delete.md` | RD Implemented / QA-QC PASS / 未 Release | DEV-088 | 固定完成、封存、還原、永久刪除狀態轉換、權限、失敗與驗收契約。 |
| `ai-doc/qa/QA-DEV-088-task-lifecycle-complete-archive-delete.md` | Executed / PASS | DEV-088 | P0/P1 FMEA、static、browser、dependency round trip、hard-delete reload、錯誤與 viewport gate。 |
| `ai-doc/qc/QC-DEV-088-task-lifecycle-complete-archive-delete.md` | PASS / local-test | DEV-088 | 完成切換、封存還原、failure injection、永久刪除、桌機／手機 rendered evidence 與 regression 結論。 |
| `SPEC-029`、`SPEC-038`、`SPEC-070` | Intentional replacement addendum | DEV-088／DEV-029／DEV-038／DEV-070 | 舊刪除 terminology 與 action key 被 archive semantics 取代；schema 與 permission source 不變。 |
| `ai-doc/dev_task.md` | RD Implemented / QA-QC PASS / 未 Release | DEV-088 | 本機 RD／QA／QC 已完成；不含 deploy、production data 或 release。 |

## Documentation Map Update - 2026-08-25（DEV-087 跨模式任務階層縮排一致化）

Spec Impact：`Intentional replacement / cross-view consolidation`。依使用者明確指示，以 `SPEC-001` 的共用 spacing contract 統一看板 L3+、清單、甘特與日曆左側清單的每層增量：desktop `6px`、≤767px `5px`。各模式保留原本 base inset、字級、列高、卡片內距與操作面；DEV-081 的 mobile large `35px` indent 舊例外被此決策取代，A/B 仍保留其餘 2.5x 閱讀與操作幾何。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md`、`SPEC-001`、`SPEC-081`、`SPEC-086` | In sync / QA-QC PASS / 未 Release | DEV-087／DEV-001／DEV-081／DEV-086 | 固定單一 `--task-hierarchy-indent`、6px／5px breakpoint、各 surface base inset 與 DEV-081 明確例外。 |
| `src/index.css`、`KanbanChecklist.tsx`、`WbsNodeItem.tsx`、`SharedTaskSidebar.tsx`、`GanttView.tsx`、`CalendarView.tsx` | Implemented / Rendered PASS | DEV-087 | 四模式共用 depth increment；甘特／日曆展開鍵與 leaf placeholder 同為 18px，避免最後一層額外漂移 2px。 |
| `scripts/verify-dev-087-*`、`output/playwright/dev-087/result.json` | Static 9/9 + Browser 8/8 PASS | DEV-087 | 1440×900／760×900 逐層量測 computed padding 與 title X：全數 6px／5px；body overflow=0、console/page error=0，八張截圖已人工目視。 |
| `scripts/verify-dev-081-*`、`scripts/verify-dev-086-*` | Regression PASS | DEV-081／DEV-086／DEV-087 | DEV-081 static 32/32、browser 10/10（compact/large=5px、desktop=6px）；DEV-086 static／browser PASS，工作台 6px／5px 與跨看板流程維持。 |

## Documentation Map Update - 2026-08-25（DEV-086 全域工作台子樹暫存／跨看板搬移）

Spec Impact：`Intentional replacement`。全域工作台未歸位區升級為帳號級跨工作區 staging surface：桌機 pointer 與手機長按 touch 都可把看板完整子樹放入未歸位，切換目的看板後再整棵歸位；parent links、task ID 與單一 batch／undo 邊界保留。兩端拖曳 presenter 直接使用看板既有 `KanbanInsertionMarker` 顯示 append 落點，零高度 overlay 不推動清單。已歸位列仍唯讀不可拖；手機不新增 subtree hover，也不開放清單／甘特／日曆模式。不改 schema、API、permission 或 release。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / QA-QC PASS / 未 Release | DEV-086／DEV-039／DEV-053／DEV-065 | 記錄全域 staging、根因、子樹不變量、UI 決策、證據、runtime 與 non-release boundary。 |
| `ai-doc/specs/SPEC-086-task-workbench-subtree-staging.md` | Authoritative / Implemented / QA-QC PASS | DEV-086 | 固定來源／目的矩陣、跨工作區範圍、parent links、批次與 persistence order、placed no-drag、共用 append 定位線、mobile inclusion／exclusion 與 15 項 AC。 |
| `ai-doc/qa/QA-DEV-086-task-workbench-subtree-staging.md`、`ai-doc/qc/QC-DEV-086-task-workbench-subtree-staging.md` | Executed / QA PASS / QC PASS | DEV-086 | FMEA、static、desktop pointer、390px／320px 原生 touch、geometry、storage、負向邊界與 runtime evidence。 |
| `taskSubtreePlacement.ts`、`taskDragCommit.ts`、`placementModel.ts`、`taskWorkbenchUnplacedService.ts`、`useWbsStore.ts` | Implemented / Static + browser PASS | DEV-086 | pure subtree updates、parentId round-trip、單一 batch／undo、leaves-first／root-first 與目的先存來源後刪。 |
| `BoardView.tsx`、`TaskWorkbenchPanel.tsx`、`taskDragTargetAdapter.ts`、`taskDragCommit.ts`、`TaskDragPresenter.tsx`、`KanbanInsertionMarker.tsx`、`index.css` | Implemented / Rendered PASS | DEV-086 | desktop／mobile 共用 staging target、subtree commit 與零高度 marker；desktop 保留 subtree hover，mobile 明確不導入；placed rows 仍無 drag surface。 |
| `scripts/verify-dev-086-*`、`output/playwright/dev-086/*.png` | Static + Browser PASS | DEV-086 | desktop pointer＋390px／320px touch 完成 board→unplaced；390px 再完成 workspace A／board A→workspace B／board B；三節點、parent links、marker lifecycle、cleanup 與 RWD 通過。 |

## Documentation Map Update - 2026-08-25（DEV-085 關聯線方向搖桿／DEV-077 意圖更正）

Spec Impact：`Compatible correction / restore original relationship control intent`。使用者澄清 DEV-077 原意只刪除控制 UI 多畫的一條中央線，不是移除控制臂與方形控制點；DEV-085 恢復兩條端點控制臂與兩個可獨立拖曳的方形方向搖桿，同時維持中央 guide=0、舊重複 controls=0。2026-08-25 follow-up 再固定兩端各自貼齊所屬分支外側框線，舊 anchor `xRatio` 不得把端點拉回內側。未改 schema、API、permission、relationship identity 或 release。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / QA-QC PASS / 未 Release | DEV-085 / DEV-077 / DEV-027 | 記錄使用者澄清、歷史誤讀不計交付、現行契約、rendered evidence、runtime 與 non-release boundary。 |
| `ai-doc/specs/SPEC-085-mindmap-relationship-direction-joysticks.md` | Authoritative / Implemented / QA-QC PASS | DEV-085 | 固定 selected-only controls、兩端 arms／joysticks、中央 guide 排除、首拖 fallback、persistence、zoom、input isolation、端點外側框線與 12 項 AC。 |
| `ai-doc/qa/QA-DEV-085-mindmap-relationship-direction-joysticks.md`、`ai-doc/qc/QC-DEV-085-mindmap-relationship-direction-joysticks.md` | Executed / QA PASS / QC PASS | DEV-085 | failure-first、static、browser、FMEA、人工截圖、visible-error、responsive 與 runtime ownership 證據。 |
| `ai-doc/specs/SPEC-077-mindmap-relationship-redline-cleanup.md`、`ai-doc/qa/QA-DEV-077-mindmap-relationship-redline-cleanup.md` | Corrected / historical misread superseded | DEV-077 / DEV-085 | 現行意圖只刪除 `control-1 → control-2` 中央導引線；舊「所有 controls=0」artifact 僅保留稽核用途。 |
| `mindMapGeometry.ts`、`mindMapOverlayPaths.ts`、`MindMapRelationshipOverlay.tsx`、`MindMapRelationshipInteractionLayer.tsx`、`MindMapView.tsx`、`mindMapRelationshipCommands.ts` | Implemented / Static + rendered PASS | DEV-085 | 兩端依各自 branch direction 貼齊外側框線並保留 anchor Y；兩條 control arms、兩個 28px accessible joystick hit targets、72px 預設 control offset 上限、44px transparent hit window、Bezier 中點／切線置中、完整 click 選取、fallback pair、snapshot rollback 與持久化。 |
| `scripts/verify-dev-085-*.{mjs,js}`、`output/playwright/dev-085-mindmap-relationship-direction-joysticks/result.json` | Static 9/9 + Browser PASS | DEV-085 | selected counts=`2/2/2/0/0`；右→左 fixture 即使保存反向 xRatio，兩端外框誤差皆 `0.0044px`；曲線後 window centerline 距 path `0.24px`、中心與 18px edge-tolerance true click、拖曳／重載／非主按鍵／Escape／zoom／1024／390 與 error sweep通過。 |

## Documentation Map Update - 2026-08-24（DEV-081 `4a947ef` Regression CAPA；縮排數值已由 DEV-087 取代）

Spec Impact：`Compatible correction`。恢復共用 `KanbanChecklist` 的全 viewport 階層縮排，手機只覆寫倍率 token；補齊 desktop hierarchy geometry gate，未新增分支元件、資料變更或 release 行為。

| 文件／程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `src/index.css`、`src/components/Wbs/KanbanChecklist.tsx` | Historical correction / consumer retained / values superseded by DEV-087 | DEV-081 / DEV-063 / DEV-087 | 當時恢復全域 depth consumer；`14px／35px` 歷史數值已被現行 desktop 6px／narrow 5px 共用增量取代。 |
| `scripts/verify-dev-081-mobile-kanban-dual-scale-pinch.ts` | Static 32/32 PASS | DEV-081 | 防止 depth consumer 再次只存在 mobile media 內。 |
| `scripts/verify-dev-081-mobile-kanban-dual-scale-pinch-browser.pw.js` | Updated / 10/10 PASS | DEV-081 / DEV-087 | 同一卡片量測 depth 0／1 computed padding 與 title X delta；現行 compact／large=5px、desktop=6px。 |
| `ai-doc/dev_task.md`、`SPEC-081`、`QA-DEV-081` | CAPA / audit recorded | DEV-081 | 記錄 `4a947ef` 146-file 盤點、唯一確認產品回歸、QA coverage defect、change-isolation risk 與真實畫面 3-mode evidence。 |

## Documentation Map Update - 2026-08-24（DEV-084 Implemented／QA-QC PASS／非主按鍵隔離）

Spec Impact：`Compatible correction / raw-input isolation`。新增單一 pure primary-pointer eligibility guard，修正中鍵／右鍵被 sensor或 scattered handler誤解為左鍵語意的實作漂移；不改 Interaction Kernel profile、task／relationship資料、schema、API、permission、mobile gesture或release。心智圖中鍵 pan、右鍵 menu、左鍵、鍵盤與 primary touch／pen均為必守 regression boundary。ADR不新增；DEV-084直接落實ADR-043既有 `Raw Input → Trigger Normalizer`。

| 文件／權威 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / QA-QC PASS / 未 Release | DEV-084 / DEV-070 | 記錄五類缺口已修正、pure helper、逐檔 owner、S0～S5、rendered evidence、Calendar local fixture、required regression與local-only execution boundary。 |
| `ai-doc/specs/SPEC-084-primary-pointer-button-isolation.md` | Authoritative RD Contract / Implemented / QA-QC PASS | DEV-084 | 固定button／pointer矩陣、root cause、safe/excluded入口、typed API、逐檔patch、12項AC、artifact與完整 verification evidence；physical mobile supplemental boundary 明確標示。 |
| `ai-doc/qa/QA-DEV-084-primary-pointer-button-isolation.md` | Executed / QA PASS / QC PASS | DEV-084 | 14項FMEA、8項static／pure、DEV-084 rendered 13/13、required DEV-028／029／046／053／054／070／076／077／DEV-017／resizable regression、1440／1024／390 boundary、data-sanity、visible-error與cleanup evidence。 |
| `ai-doc/specs/SPEC-070-cross-mode-interaction-policy-kernel.md`、`ai-doc/decisions/ADR-043-cross-mode-interaction-policy-kernel.md` | Existing architecture authority / Compatible | DEV-070 / DEV-084 | semantic dispatch API不變；raw button eligibility在進入 `pointer.primary`前fail closed，補齊既有Normalizer前置不變量。 |
| `ai-doc/specs/SPEC-053-task-drag-muscle-memory-consistency.md`、`SPEC-077-mindmap-relationship-redline-cleanup.md` | Existing behavior authority / Regression required | DEV-053 / DEV-077 / DEV-084 | 保留8px mouse drag、keyboard/mobile owner、既有 middle canvas pan與relationship左鍵endpoint行為。 |
| `src/interactions/pointerActivation.ts`、`src/hooks/useDragSensors.ts`、Gantt／三個panel resizer、Mindmap relationship layer、三個modal backdrop | Implemented / Static + rendered evidence PASS | DEV-084 | 共用 primary guard 已在第一個 side effect 前接入五類 owner；artifact `output/playwright/dev-084-primary-pointer-isolation/result.json`，Calendar local fixture rendered PASS；physical mobile維持 supplemental Not Run。 |

## Documentation Map Update - 2026-08-26（DEV-083 Released／Permanent Credential Unrecoverable Policy／P2不採用）

Spec Impact：`Compatible extension`。保留 ADR-037 的 ProJED production、ProJED-TEST staging／test
與 Firebase `level3-smoke` 分工；P0固定production public/server env隔離、sealed artifact與OAuth callback
fail-closed，P1固定單一`release:production`的prepare／candidate／activate phase。P2 CI/IAM防繞過由使用者
明確不採用。2026-08-26使用者確認 DEV-083 retired credential set 永久不可回收：strict gate 對該 set 的缺值採 project-bound policy waiver；exact sealed artifact、candidate、remote provenance、activation與canonical smoke均保留。

| 文件／權威 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | Released / Permanent Credential Unrecoverable Policy | DEV-083 / Release Governance | 記錄release identity、candidate/live evidence、回滾點、policy waiver、accepted residual risk與下一步。 |
| `ai-doc/specs/SPEC-083-production-release-environment-integrity.md` | Implemented / Released / Permanent Policy Recorded | DEV-083 | 固定P0＋P1契約；DEV-083 retired credential set 缺值時由 project-bound policy 取代找回要求，P2仍排除。 |
| `ai-doc/qa/QA-DEV-083-production-release-environment-integrity.md` | Candidate＋Activation＋Canonical PASS / Permanent Credential Policy | DEV-083 | 保留QA-083-06～12實際結果、policy evidence、candidate／activation／authenticated smoke與證據邊界。 |
| `ai-doc/decisions/ADR-037-fixed-test-environment-and-level3-release-gate.md` | Existing Authority / Compatible Extension | DEV-083 / Release Governance | TEST／Level 3決策維持；DEV-083不更換provider、Level 3 authority或activation ownership，ADR不需修改。 |
| `scripts/release/*`、`scripts/load-server-verification-env.mjs`、`scripts/p7-release-gate.mjs`、`scripts/p8-*.mjs`、`scripts/verify-dev-083-layer2.mjs` | Implemented / Local Gate PASS | DEV-083 | production contract、isolated envDir、sanitized preview/browser child、sealed artifact、full-manifest remote hash、project-bound permanent credential policy、credential evidence mode、OAuth safe-cancel、Layer2 browser provenance、live-channel-only snapshot與三 phase release orchestration。 |
| `scripts/load-local-env.mjs`、`vite.config.js`、`package.json`、`.env.production`、`.env.test.example` | Implemented / Boundary PASS | DEV-083 | local/test loader拒絕production profile；Vite sealed envDir；build與release命令已收斂到DEV-083入口。 |
| `scripts/migrate-test-env-profile.mjs` | Fail-closed / Human choice pending | DEV-083 | 只搬移release-controlled test keys；偵測 `.env.local`／`.env.test.local` conflict 時不覆寫、不輸出值；目前 `VITE_DATA_BACKEND` conflict 已被阻擋。 |
| Firebase live version `ca48cc7d514432d8`／release `20260821144058-509110` | Released / Canonical Smoke PASS | DEV-083 | commit `4ee8bf8`、39/39 remote hashes、release-meta、OAuth與authenticated smoke PASS；previous version `93c2a80ddc1a798e`保留為rollback reference。 |

## Documentation Map Update - 2026-08-20（DEV-082 看板多人即時同步 Local QA-QC PASS / Remote Gate Pending）

Spec Impact：`Intentional extension`。沿用既有 Supabase Postgres Changes、RLS 與 optimistic write，補齊 publication、初始讀取／訂閱 race closure、single-flight + trailing refresh、tag assignment／hard DELETE coverage，以及 online／visibility recovery；不新增 UI、presence、CRDT、欄位鎖或正式環境操作。本地契約與 rendered app 通過，remote migration／two-user smoke 尚未執行。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | Local Implemented / QA-QC PASS / Remote Gate Pending | DEV-082 / DEV-026 / DEV-036 | 記錄效用決策、範圍、實作、證據、runtime 與 non-release boundary。 |
| `ai-doc/specs/SPEC-082-board-realtime-collaboration.md` | Implemented / Local QA-QC PASS / Authoritative | DEV-082 | 固定 publication、race closure、single-flight、DELETE／tag、failure recovery、conflict 與 release 契約。 |
| `supabase/migrations/20260820080310_board_realtime_collaboration.sql` | Local Migration Ready / Remote Not Applied | DEV-082 | 可重複將現行 realtime channel tables 加入 `supabase_realtime`；RLS 不變。 |
| `src/utils/coalescedAsyncRefresh.ts` | Implemented / Pure Verifier PASS | DEV-082 | 40ms burst 合併、single in-flight、one trailing read、cleanup cancellation。 |
| `src/hooks/useSupabaseSync.ts`、`useTagSync.ts`、`useMemberSync.ts` | Implemented / Typecheck + Lint + Build PASS | DEV-082 | active board／tag／member channel race closure、錯誤診斷、online／visibility recovery 與 bounded reload。 |
| `scripts/verify-dev-082-board-realtime-sync.ts` | Executed / PASS | DEV-082 | 驗證 scheduler concurrency、cleanup、subscription／DELETE／tag 與 publication contract。 |
| `output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json` | Rendered Regression 9/9 PASS | DEV-081 / DEV-082 | 390×844、844×390、1024×768；console／page／network errors=0。 |

## Documentation Map Update - 2026-08-20（DEV-081 手機看板 A／B 2～3 倍閱讀尺寸 Implemented / Automated UI PASS）

Spec Impact：`Compatible extension`。保留 mobile Pan-First 與 task drag authority，新增看板局部 A=`1.0`／B=`2.0～3.0`（預設 `2.5`）顯示模式、單一 pinch 仲裁器、可見 fallback toggle 與 account/device-scoped UI preference；不改 domain data、schema、API、permission 或 release。S0～S4 已實作，9-case browser smoke PASS；完整 QA matrix 與 physical gate 尚未完成。

| 文件 / 權威 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | Implemented / Automated UI PASS（9 cases）/ Physical Pending | DEV-081 / DEV-001 / DEV-029 | 記錄2～3倍Human Decision、S0～S4實作、QA evidence、停止條件與non-release boundary。 |
| `ai-doc/specs/SPEC-081-mobile-kanban-dual-scale-pinch.md` | Implemented / Automated UI PASS / Authoritative | DEV-081 | 固定repo/file owner、typed contract、local preference、CSS tokens、pinch／anchor／drag cancel演算法、逐檔patch、slice、recovery、commands與evidence。 |
| `ai-doc/qa/QA-DEV-081-mobile-kanban-dual-scale-pinch.md` | Executed smoke / 9-case PASS / Full matrix + Physical Pending | DEV-081 | 21項FMEA、S0～S4 gate、20項planned browser cases、9-case artifact、acceptance traceability、physical gate與UI-only boundary。 |
| `src/features/kanbanViewSize/*`、`src/App.tsx`、`src/components/MainLayout.tsx`、`src/components/BoardView.tsx` | Implemented / Typecheck + Browser PASS | DEV-081 | 本機帳號偏好／provider、可見toggle、board root、pinch request與anchor adapter。 |
| `src/hooks/useMobilePanBroker.ts`、`useLongPress.ts`、`useTouchTapGuard.ts`、`src/components/Wbs/taskDrag/useTaskDragSession.ts`、`src/index.css` | Implemented / Browser PASS | DEV-081 / DEV-029 / DEV-054 | 單一multi-touch仲裁、defense-in-depth、零提交drag cancel與board-scoped 2.5倍layout tokens。 |
| `scripts/verify-dev-081-mobile-kanban-dual-scale-pinch.ts`、`...-browser.pw.js` | Implemented / PASS | DEV-081 | pure/static contract與AI UI-only rendered verifier；primary artifact固定`output/playwright/dev-081-mobile-kanban-dual-scale-pinch/result.json`。 |
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md`、`ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Existing behavior authority / unchanged | DEV-029 / DEV-081 | 單指 pan／tap／long-press 仍是基準；第二指只透過集中仲裁器提升 owner。 |
| `ai-doc/specs/SPEC-054-mobile-task-drag-precision.md`、`ai-doc/qa/QA-DEV-054-mobile-task-drag-precision.md` | Existing drag regression authority / unchanged | DEV-054 / DEV-081 | active drag＋第二指必須零提交取消；browser PASS 不取代 iOS／Android physical evidence。 |

## Documentation Map Update - 2026-08-20（DEV-079 心智圖右鍵選單建立關聯線 Implemented / QA-QC PASS）

Spec Impact：`Intentional extension / mindmap-only context-menu action`。心智圖 task 右鍵選單新增「建立關聯線」，以右鍵節點作為 source，沿用既有 relationship draft／target／inline label／Escape 流程；非心智圖 menu 排除，不涉及 schema、storage、API、permission model 或 release。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | DEV-079 Implemented / QA-QC PASS / 未 Release | DEV-079 / DEV-027 | 記錄 context-menu action scope、event routing、既有 relationship flow reuse 與 local-only release boundary。 |
| `ai-doc/specs/SPEC-079-mindmap-context-menu-create-relationship.md` | Implemented / QA-QC PASS | DEV-079 | 固定 mindmap-only action、source／target／label／Escape、permission guard 與 responsive acceptance。 |
| `ai-doc/qa/QA-DEV-079-mindmap-context-menu-create-relationship.md` | Executed / QA PASS / QC PASS / 未 Release | DEV-079 | static 6/6、browser interaction／390 boundary、engineering gates 與 error sweep。 |
| `src/interactions/task/types.ts`、`taskActionCatalog.ts`、`profiles.ts`、`TaskActionMenu.tsx` | Implemented / QA-QC PASS | DEV-079 | 新增 action contract、catalog label／icon、mindmap-only profile 與 menu rendering。 |
| `src/components/GlobalContextMenu.tsx`、`src/components/MindMap/MindMapView.tsx`、`src/utils/taskInteractions.ts` | Implemented / QA-QC PASS | DEV-079 | 右鍵 action 透過 DOM event 啟動既有 relationship draft selection，並保留 task selection。 |
| `scripts/verify-dev-079-mindmap-context-menu-create-relationship.mjs`、`...-browser.pw.js` | Executed / PASS | DEV-079 | static 6/6；artifact 證明 source／target／label／Escape／board exclusion、390 overflow=0 與無錯誤。 |

## Documentation Map Update - 2026-08-20（DEV-078 心智圖工具列新增入口與快捷提示清理 Implemented / QA-QC PASS）

Spec Impact：`Intentional replacement / mindmap-only visual cleanup`。依 Browser Comment 1、Comment 2 移除心智圖工具列「新增任務」與快捷鍵提示；保留空畫布首個任務 fallback、Enter／Tab／Delete、關聯線與縮放控制，不涉及 schema、API、permission 或 release。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | DEV-078 Implemented / QA-QC PASS / 未 Release | DEV-078 / DEV-027 | 記錄 toolbar cleanup scope、keyboard／empty-state compatibility、artifact 與 local-only release boundary。 |
| `ai-doc/specs/SPEC-078-mindmap-toolbar-cleanup.md` | Implemented / QA-QC PASS | DEV-078 | 固定 toolbar 元素移除與保留 controls、keyboard、empty-state、responsive acceptance。 |
| `ai-doc/qa/QA-DEV-078-mindmap-toolbar-cleanup.md` | Executed / QA PASS / QC PASS / 未 Release | DEV-078 | static 5/5、1440／1024／390 browser matrix、Enter browser + Tab／Delete source regression 與 visible-error gate。 |
| `src/components/MindMap/MindMapToolbar.tsx`、`MindMapView.tsx` | Implemented / QA-QC PASS | DEV-078 | 移除 toolbar create-task button／hint 與不再使用的 props；保留 relationship／zoom owner。 |
| `scripts/verify-dev-078-mindmap-toolbar-cleanup.mjs`、`...-browser.pw.js` | Executed / PASS | DEV-078 | static 5/5；artifact 證明三 viewport 的 DOM absence、keyboard regression、無錯誤與無 overflow。 |

## Documentation Map Update - 2026-08-20（DEV-077 歷史紀錄；2026-08-25 由 DEV-085 更正）

Spec Impact：`Corrected by DEV-085`。原段落把「刪除多畫的一條線」誤讀成移除全部控制臂與方形控制點；使用者已澄清現行意圖只移除 `control-1 → control-2` 中央導引線，兩側 `endpoint → control point` arms 與 square direction joysticks 必須保留。既有 `geometry.controlPoints` storage shape 與 path builder 相容性維持，不涉及 schema、API、permission 或 release。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | Historical misread / superseded by DEV-085 | DEV-077 / DEV-085 / DEV-027 | 舊實作不計入現行交付；更正後 scope、證據與完成狀態見 DEV-085。 |
| `ai-doc/specs/SPEC-077-mindmap-relationship-redline-cleanup.md` | Corrected | DEV-077 / DEV-085 | 只移除中央 control guide；保留 endpoint、arms、square joysticks、path 與 label。 |
| `ai-doc/qa/QA-DEV-077-mindmap-relationship-redline-cleanup.md` | Corrected / old artifact historical only | DEV-077 / DEV-085 | 舊「controls 全 0」只證明誤讀契約，不作現行 acceptance；現行 browser evidence 見 QA/QC-DEV-085。 |
| `src/components/MindMap/MindMapRelationshipOverlay.tsx`、`MindMapRelationshipInteractionLayer.tsx`、`MindMapView.tsx` | Restored / QA-QC PASS under DEV-085 | DEV-077 / DEV-085 | 中央 guide 仍移除；兩條 control arms 與兩個 direction joysticks 已恢復。 |
| `scripts/verify-dev-077-mindmap-relationship-redline-cleanup.mjs`、`...-browser.pw.js` | Corrected / PASS | DEV-077 / DEV-085 | 更正後 static 6/6 驗證 endpoint=2、arm=2、joystick=2、center guide=0、legacy duplicate=0。 |

## Documentation Map Update - 2026-09-03（DEV-076 心智圖左鍵抓取畫布平移撤回）

Spec Impact：`Reverted / abandoned by user`。使用者明確要求放棄並復原 DEV-076；現行產品移除 desktop fine-pointer 空白畫布左鍵 direct pan，保留既有中鍵 velocity pan、DEV-074 單一 viewport／Scene、DEV-073 quick-title、task／relationship interaction owner 與 SPEC-029 mobile boundary。原始 pure/static 與 rendered evidence 保留為歷史紀錄；本輪未release。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | DEV-076 Reverted / Abandoned / 歷史紀錄 | DEV-076 / DEV-027 | 記錄撤回決策、復原範圍與歷史 evidence；不計入現行產品交付。 |
| `ai-doc/specs/SPEC-076-mindmap-left-mouse-canvas-pan.md` | Reverted / Historical only | DEV-076 | 保留原始 6px threshold、direct pan、owner boundary 與 recovery 規格作稽核，不代表現行契約。 |
| `ai-doc/qa/QA-DEV-076-mindmap-left-mouse-canvas-pan.md` | Reverted / Historical only | DEV-076 | 保留原始 FMEA、pure/static、rendered 與 regression evidence，不再作為現行驗收。 |
| `ai-doc/specs/SPEC-074-mindmap-single-scene-coordinate-system.md` | Existing architecture authority / DEV-076 amendment withdrawn | DEV-074 | 現行僅保留既有 middle pan 與唯一 viewport scroll authority；DEV-076 左鍵增補已撤回。 |
| `src/components/MindMap/mindMapPan.ts`、`MindMapView.tsx`、`MindMapCanvasShell.tsx`、`src/index.css` | Reverted / middle pan retained | DEV-076 | 移除 left-pan kernel、owner、lifecycle、telemetry 與 grab/grabbing CSS；中鍵 pan 保留。 |
| `scripts/verify-dev-076-mindmap-left-mouse-pan.ts`、`verify-dev-076-mindmap-left-mouse-pan-browser.pw.js` | Removed / Historical evidence retained | DEV-076 | 移除現行驗證入口與專用 verifier；既有 artifact 僅作歷史稽核。 |

## Documentation Map Update - 2026-08-20（Active Board Topbar 改名入口移除）

使用者明確要求降低誤觸寫入 Board metadata 的風險。`MainLayout` Active Board topbar 名稱已改為 display-only；Sidebar 受控 `F2`／右鍵改名與 owner/admin 權限邊界保留。DEV-030 static 11/11、browser PASS；本輪未涉及資料模型、API、權限或 release。

## Documentation Map Update - 2026-08-20（DEV-075 心智圖方向鍵快速巡覽效能 Implemented / QA-QC PASS）

Spec Impact：`Intentional replacement / horizontal navigation is side-aware and bridges the center`。DEV-075已落地model-derived O(1) navigation index、node-keyed private selection store、node ref registry、latest-only focus rAF與test-only telemetry；2026-08-20依使用者明確要求補上左右root雙向穿越中央看板名稱，中心維持非TaskNode、非selection owner。上下順序、interaction owner、quick-title與DEV-074 scene／geometry authority不變；真實鍵盤、效能、geometry、viewport與targeted regression均通過。ADR不需要；本輪未release。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | DEV-075 Implemented / QA-QC PASS / 未 Release | DEV-075 / DEV-027 | 記錄authoritative package、S0～S4完成狀態、repo/dirty boundary、量化驗收、失敗修復、evidence與非release execution boundary。 |
| `ai-doc/specs/SPEC-075-mindmap-keyboard-navigation-performance.md` | Implemented / Contract Verified / Center Bridge Addendum | DEV-075 | 固定並驗證selection/navigation end-state、side-aware水平導航、中央橋接、typed API、telemetry、fixture、failure recovery與done gate。 |
| `ai-doc/qa/QA-DEV-075-mindmap-keyboard-navigation-performance.md` | Executed / QA PASS / QC PASS / 未 Release | DEV-075 | 已執行FMEA、50／200／500 fixture、真實鍵盤與burst、左右root雙向center bridge、latency／render／geometry、interaction owner、viewport與visible-error gate。 |
| `src/components/MindMap/MindMapView.tsx`、`MindMapNode.tsx`、`mindMapKeyboard.ts`、`mindMapNavigation.ts`、`mindMapSelectionStore.ts` | Implemented / QA-QC PASS | DEV-075 | 已移除方向鍵hot path的DOM掃描與View selection state，改由含side／root metadata的model index、keyed store、node registry及latest-only focus處理；中央標題不加入selection model。 |
| `scripts/verify-dev-075-mindmap-keyboard-performance.ts`、`verify-dev-075-mindmap-keyboard-performance-browser.pw.js` | Executed / PASS | DEV-075 | immutable baseline、pure/static contract、13個browser cases、14項regression command results、screenshots、interaction evidence與error arrays皆已收斂。 |
| `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md` | Behavior authority / Center Bridge Amended | DEV-027B / DEV-075 | 上下維持可見順序；水平鍵改依左右分支解析向內parent／向外first child，root向內可跳過中央標題選取對側root。 |
| `ai-doc/specs/SPEC-074-mindmap-single-scene-coordinate-system.md` | Existing architecture authority / unchanged | DEV-074 / DEV-075 | 純 selection 不應 dirty connector／relationship world geometry；方向鍵巡覽的 recompute delta 必須為 0。 |

## Documentation Map Update - 2026-08-19（DEV-074 心智圖單一 Scene 座標系重構 Implemented / QA-QC PASS）

Spec Impact：`Intentional replacement / No product contract drift`。使用者已指定「單一 Scene transform」為長期架構，並要求補到 RD 可直接實作。SPEC-074／ADR-044 只取代 SPEC-027B「zoom 後重算 connector」的技術策略；既有心智圖產品行為、資料／API／權限與其他模式 authority 不變。逐檔 patch、typed coordinate API、S0～S5 owner、dirty worktree 保護、fixture、commands、artifact schema、FMEA 與 failure recovery 已固定；本輪已完成實作與 QA/QC rendered evidence，未執行部署或 release。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | DEV-074 Implemented / QA-QC PASS / 未 Release | DEV-074 | 記錄 S0～S5 handoff、repo/dirty boundary、owner、stop conditions、evidence 與非 release execution boundary。 |
| `ai-doc/specs/SPEC-074-mindmap-single-scene-coordinate-system.md` | Authoritative RD Implementation Contract / New | DEV-074 | 固定 DOM、stage 公式、typed API、dirty lifecycle、逐檔 patch intent、zoom時序、fixture/artifact/commands、recovery 與 done gate。 |
| `ai-doc/decisions/ADR-044-mindmap-single-scene-coordinate-system.md` | Accepted / Implemented / QA Evidence Ready | DEV-074 | 選定 StageSizer + 單一 Scene matrix，並鎖定 kernel、rAF zoom、single interaction owner 與 revisit conditions。 |
| `ai-doc/qa/QA-DEV-074-mindmap-single-scene-coordinate-system.md` | Executed / QA PASS / QC PASS | DEV-074 | 定義並執行量化 FMEA、fixture、25%～400% screen geometry、artifact、slice、regression、rendered QC 與 runtime cleanup gate。 |
| `ai-doc/qa/QA-DEV-074-ai-real-operation-verification.md` | Executed / AI Real-Operation PASS / QC PASS | DEV-074 | AI 已以真實滑鼠、鍵盤、滾輪、拖曳、mobile boundary 與極限／對抗操作完成 25/25；必跑 21/21、console/page errors 0；artifact=`output/playwright/dev-074-ai-real-operation/result.json`，RO-12 另由 DEV-027D browser evidence 支持。 |
| `src/components/MindMap/MindMapView.tsx`、`MindMapCanvasShell.tsx`、`mindMapLayoutStyle.ts` | Implemented / scene-matrix runtime | DEV-027 / DEV-074 | 已建立 scene、接管 zoom/dirty lifecycle；CSS zoom 已移除，world paths 純投影。 |
| `mindMapCoordinateSystem.ts`、`mindMapDomGeometry.ts`、`mindMapOverlayPaths.ts`、relationship／drag overlays | Implemented / QA-QC PASS | DEV-027B / DEV-027E / DEV-027G / DEV-074 | 已收斂 typed world mapper、single snapshot 與 exclusive interaction owner；artifact 與回歸證據已產出。 |

## Documentation Map Update - 2026-08-17（跨模式互動策略核心 QC Functional PASS）

Spec Impact：`DEV-070` 的產品契約維持 `No contract drift / behavior-preserving architecture refactor`。`SPEC-070` 固定 App-level scope、pure/effect module boundary、public API、逐檔 patch intent、S0～S11 binding manifest、`dev-070-v1` fixture、artifact path、single-executor、owner 與 rollback；`ADR-043` 鎖定長期決策。`QA-DEV-070` 已完成 post-implementation FMEA 修訂，57 項功能 cases／16 項 AC traceability、required regression 與 baseline/after/diff 均已由 QC local PASS；F-01～F-04 的 release overlay 仍維持 `Release Gate Blocked`。Phase 1 只建立架構，所有 task surface 的可觀察行為維持重構前 runtime；Calendar 現行點擊切到 List 亦納入相容 seed。本輪未執行 deploy、push 或 release。

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / QC Functional PASS / Release Gate Blocked | DEV-070 | 記錄 frozen scope、S0～S11 handoff、compatibility baseline、repo／data／permission 邊界、實作證據、stop conditions 與 release overlay。 |
| `ai-doc/specs/SPEC-070-cross-mode-interaction-policy-kernel.md` | Implemented / Compatibility Verified / Release Gate Blocked | DEV-070 | 固定 location／surface、typed API、pure/effect modules、逐檔 patch、binding manifest、fixture、Action／Guard／Command、16 項 AC 與 failure recovery。 |
| `ai-doc/decisions/ADR-043-cross-mode-interaction-policy-kernel.md` | Accepted / Implementation Contract Locked | DEV-070 | 採 App scope、Host／Origin 稀疏繼承、契約專屬 merge、deny-wins、open-time snapshot、single executor 與逐 binding migration。 |
| `ai-doc/qa/QA-DEV-070-cross-mode-interaction-policy-kernel.md` | Execution Complete / Functional PASS / Release Gate Blocked | DEV-070 | 量化 FMEA、frozen fixture、artifact contract、57 項功能 cases、16 項 AC traceability、12 項 release overlay、runtime lifecycle、evidence owner、viewport、regression、Firebase preview／production provenance 與 rollback gate。 |
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Active Behavior Baseline / Unchanged | DEV-028 / DEV-070 | 現行 click-to-details、統一 task menu 與 detail-only title edit 契約；DEV-070 Phase 1 必須以 compatibility profile 完整保留。 |
| `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md` | Selection-first Keyboard Baseline / DEV-071 Runtime Alignment | DEV-027B / DEV-071 | 心智圖 `Enter`／`Tab` 建立後只選取新任務、不自動開啟明細；命名改由任務詳情 title edit 入口處理。 |
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Active Mobile Gesture Authority | DEV-029 / DEV-070 | 保留手機短滑 pan-first、無位移 tap、長按 compact action rail 與危險操作確認；不得由 desktop profile 覆蓋。 |

## Documentation Map Update - 2026-08-18（DEV-071 心智圖選取與明細入口差異）

Spec Impact：`Intentional replacement`。本節記錄 DEV-071 當時將心智圖 `mindmap.node` 單擊改為 selection-only，並新增雙擊、右鍵「開啟明細」與鍵盤新增不開明細的歷史基線；看板、清單、甘特與其他 task origin 不變。現行單擊 side effect 已由下方 DEV-073 再次覆寫為 selection + quick-title，resolver 的 `task.select` 與明細入口仍沿用 DEV-071。

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / Local QA-QC PASS / 未 Release | DEV-071 | 記錄心智圖單擊 selection-only、雙擊／右鍵開明細、Enter／Tab 新增不開明細、Host Profile 邊界、證據與未 release 狀態。 |
| `ai-doc/specs/SPEC-070-cross-mode-interaction-policy-kernel.md` | DEV-071 Product Re-entry Implemented / Local QA-QC PASS / 未 Release | DEV-070 / DEV-071 | 記錄 Intentional replacement、mindmap Host Mode Profile override、Action／Command 共用與非受影響模式 negative boundary。 |
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | DEV-071 Addendum Implemented / Local QA-QC PASS | DEV-028 / DEV-071 | 修訂心智圖 node click／double-click／context menu／keyboard insertion 入口；清單、看板、甘特既有契約維持。 |
| `ai-doc/qa/QA-DEV-071-mindmap-selection-details.md` | Execution Complete / Functional PASS / 未 Release | DEV-071 | FMEA、acceptance、static/browser evidence 與 regression boundary。 |
| `scripts/verify-dev-071-mindmap-selection-details.ts`、`scripts/verify-dev-071-mindmap-selection-details-browser.pw.js` | Executed / PASS | DEV-071 | 驗證 resolver、menu、心智圖單擊／Enter／Tab／雙擊／右鍵明細與看板單擊不回歸。 |

## Documentation Map Update - 2026-08-18（DEV-072 共用彈窗按鈕鍵盤導航）

Spec Impact：`No conflict / shared default enhancement`。需求只增加共用 `GlobalDialog` 的鍵盤焦點與按鈕選擇預設，不改各模式的 task interaction profile；附圖視為 confirm dialog 的情境參考，不新增外部文件指令。Confirm／prompt／action 以同一個 component contract 提供初始焦點、左右鍵循環與 Enter 執行，避免每個模式重複設定。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / Local QA-QC PASS / 未 Release | DEV-072 | 記錄 shared default、focus／keyboard contract、實作邊界、FMEA 證據與 release boundary。 |
| `ai-doc/specs/SPEC-072-global-dialog-keyboard-navigation.md` | Implemented / Local QA-QC PASS / 未 Release | DEV-072 | 固定 confirm／prompt／action 的預設焦點、左右鍵循環、Enter、Escape／X、prompt caret 與 non-goals。 |
| `ai-doc/qa/QA-DEV-072-global-dialog-keyboard-navigation.md` | Execution Complete / Functional PASS / 未 Release | DEV-072 | FMEA、AC traceability、confirm browser smoke、prompt/action follow-up boundary 與 runtime lifecycle。 |
| `src/components/GlobalDialog.tsx` | Implemented / Shared default | DEV-072 | 集中處理決策按鈕 focus group、左右鍵、Enter、focus-visible 與穩定 DOM marker；不新增 mode-specific 分支。 |
| `scripts/verify-dev-072-global-dialog-keyboard-navigation.mjs`、`scripts/verify-dev-072-global-dialog-keyboard-navigation-browser.pw.js` | Executed / PASS | DEV-072 | 驗證 shared dialog static contract、confirm default focus、左右鍵循環與取消不執行 destructive action。 |

## Documentation Map Update - 2026-08-18（DEV-073 心智圖 XMind 式快速命名）

Spec Impact：`Intentional replacement / mindmap-only exception`。使用者將 XMind 式快速命名限定為心智圖，且明確把 fine-pointer 單擊既有任務納入相同狀態；清單、看板、甘特與其他模式維持既有詳情 title edit。心智圖雙擊／右鍵明細入口維持；toolbar／Enter／Tab 新增或 fine-pointer 單擊皆可直接打字，按一次 Enter 保存並離開且不新增，按一次 Tab 保存並建立子任務。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / Local QA-QC PASS / 未 Release | DEV-073 | 記錄 mindmap-only post-create／pointer quick-title、Enter 提交不新增、Tab 子任務延續、非心智圖 details naming、證據與 release boundary。 |
| `ai-doc/specs/SPEC-073-task-title-edit-defaults.md` | Implemented / Local QA-QC PASS / 未 Release | DEV-073 | 固定只有心智圖新增與 fine-pointer 單擊進入 XMind 式快速命名；輸入覆蓋原標題槽，節點選取不放大／縮小且不裁切中文／全形字，保留拖曳，Enter 保存離開、Tab 建子任務，其他模式維持詳情 title edit。 |
| `ai-doc/qa/QA-DEV-073-task-title-edit-defaults.md` | Execution Complete / Functional PASS / 未 Release | DEV-073 | FMEA、quick-title continuation／層級／IME／click-double-click 仲裁、視覺貼合／拖曳並存驗收、非心智圖負向邊界與 regression evidence。 |
| `src/components/MindMap/MindMapNode.tsx`、`src/components/MindMap/MindMapView.tsx` | Implemented / Local QA-QC PASS | DEV-073 | 心智圖 fine-pointer 單擊 quick-title、雙擊 details、右鍵明細與新增後 continuation；其他模式未改。 |
| `scripts/verify-dev-073-task-title-edit-defaults.mjs`、`scripts/verify-dev-073-task-title-edit-defaults-browser.pw.js` | Executed / PASS | DEV-073 | 驗證非心智圖 shared details naming、mindmap fine/coarse pointer boundary、雙擊仲裁、Enter 提交不新增、Tab 子任務延續、中文標題寬度與選取前後節點尺寸穩定及 focus。 |

## Documentation Map Update - 2026-08-18（心智圖關係線展開／收合控制）

Spec Impact：`Intentional replacement / mindmap connector control placement`。依使用者 XMind 參考圖，具子任務節點的展開／收合控制由任務欄移至父子關係線交會點；平時隱藏，滑鼠進入關係線感應區才顯示，鍵盤 focus 仍保持可見；資料、權限、拖曳與其他模式互動不變。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md` | UX Addendum / Local Implemented | DEV-027B | 定義圓形 `+/-` 控制、關係線中點對齊、預設隱藏／關係線 hover 顯示、aria/focus、可逆展開／收合與誤觸邊界。 |
| `ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md` | Verification Addendum | DEV-027B | 新增關係線控制位置、containment、viewport 與可逆切換驗收。 |
| `src/components/MindMap/MindMapNode.tsx`、`src/components/MindMap/mindMapGeometry.ts` | Implemented / Local Browser PASS | DEV-027B | 將 toggle 移出任務欄，讓 bracket trunk 以父子水平間距中點對齊控制項，並以關係線感應區控制預設隱藏／hover 顯示。 |
| `scripts/verify-dev-073-task-title-edit-defaults.mjs`、`scripts/verify-dev-073-task-title-edit-defaults-browser.pw.js` | Executed / PASS | DEV-027B / DEV-073 | 驗證 toggle 不在 node bar 內、預設 opacity 隱藏、關係線 hover 顯示、關係線中點幾何、收合／展開可逆、既有 quick-title 與明細入口不回歸。 |

## Documentation Map Update - 2026-08-17（會議草稿 F5 復原與低成本雲端備份）

Spec Impact：`DEV-069` 已完成 RD 實作與 local-test／browser QA-QC，狀態為 Provider Smoke Pending / 未 Release。承接 `SPEC-003` 「輸入時自動儲存 draft」的未完成契約，並以 sessionStorage + IndexedDB 本機復原、低頻 provider-neutral checkpoint 與發布時 RAG 分層控制伺服器成本。`SPEC-069` 已固化 20s idle、180s 最小 attempt 間隔、20 attempts/hour/browser-account、512KiB payload、single-flight、provider request 上限、restore/conflict 與失敗降級。手機版不開放會議紀錄，390x844 只做功能不存在的負向驗證；`SPEC-005` 早期 Mobile 右側欄設想不得作為 DEV-069 驗收依據。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | RD Implemented / Local QA-QC PASS / Provider Smoke Pending / 未 Release | DEV-069 | Human Decision、frozen contract、repo impact、WP1～WP5、實作證據與 re-entry gate 已固定。 |
| `ai-doc/specs/SPEC-069-meeting-draft-recovery-cost-control.md` | Implemented / Local QA-QC PASS / Provider Smoke Pending | DEV-069 | 本機 snapshot、restore/conflict、狀態機、checkpoint policy、Supabase/Firestore/local-test adapter、成本與手機 hard guard 的 authoritative contract。 |
| `ai-doc/qa/QA-DEV-069-meeting-draft-recovery-cost-control.md` | Executed local/browser PASS / Provider Smoke Pending | DEV-069 | 25 項 required cases 的執行邊界已記錄，涵蓋 F5、storage failure、timing/budget、provider request count、RAG=0、桌機 rendered UI 與 390 negative boundary。 |
| `ai-doc/qc/QC-DEV-069-meeting-draft-recovery-cost-control.md` | Local Browser QC PASS / Provider Smoke Pending / 未 Release | DEV-069 | 實測 F5、1440/1024/390、visible-error、既有 regression、TypeScript/build；不冒充 Supabase／Firestore 真實 provider sign-off。 |
| `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md` | Historical source / Compatible completion | DEV-002 / DEV-069 | 原始契約已要求輸入時自動儲存 draft；DEV-069 負責補齊 F5 復原與成本邊界。 |
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Current mobile boundary reference | DEV-010 / DEV-069 | 維持手機版不開放會議紀錄，驗收以桌機 1440x900 與筆電 1024x768 為主；390x844 只驗證功能仍不可用。 |
| `src/store/useRecordStore.ts`、`src/services/dataBackend.ts`、三 provider record adapter | Implemented / Local QA-QC PASS | DEV-069 | 已新增獨立 `checkpointDraft()`、本機 recovery hook/service、成本 policy、desktop status 與 mobile hard guard；正式 provider smoke 仍待補。 |

## Documentation Map Update - 2026-08-25（展開 L2 standard marker 完整子樹邊界）

Spec Impact：對 DEV-055 primary collision geometry 為 `No conflict`，對舊 before／after primary bottom 顯示規則為 `Intentional replacement`。展開 L2／L3+ 的 standard `after` marker 改用完整 task scope bottom；primary geometry、innermost ownership、commit parent/order 與 child dwell 均不變。本輪未部署、未 release。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `src/components/Wbs/taskDrag/taskOrderingGeometry.ts` | Added / Local Verified | DEV-055 / DEV-068 | 桌機與手機共用完整 task scope 的 reorder marker 顯示邊界。 |
| `src/components/Wbs/taskDrag/desktopTaskDropPreview.ts`、`taskDragTargetAdapter.ts` | Rework 16 / Local Browser PASS | DEV-055 / DEV-068 | 命中保留 primary rect；standard before／after marker 改用完整 scope top／bottom。 |
| `ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md`、`SPEC-068-task-title-center-child-drop.md` | Intentional Replacement Recorded | DEV-055 / DEV-068 | 明定 marker 不得出現在 L2 標題與可見子樹之間。 |
| `ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md`、`QA-DEV-068-task-title-center-child-drop.md` | DEV-055 Browser 16/16 + Targeted Desktop/Mobile PASS | DEV-055 / DEV-068 | failure-first、桌機／手機幾何、DEV-055 完整 browser、static、TypeScript、build 與 screenshot 證據已記錄。 |

## Documentation Map Update - 2026-08-16（任務完整預選範圍停留移入子任務）

Spec Impact：DEV-068 最終依使用者畫面重驗，把 child dwell target 從 title slot／shrink-wrapped title `SPAN` 改為 DEV-065 完整 hover scope（主任務＋可見子樹）。Candidate 與 armed 都不顯示子任務 target 藍框；candidate 保留 standard insertion/lane/promotion，armed 只顯示下一子階插入線並由 child intent 接管。來源卡使用與collision解耦的pointer／finger上方fixed overlay（16px gap、8px clamp、edge fallback）；拖離後原位置保留不改變geometry的2px虛線框。Physical iPhone／Android未偵測，故不標完整mobile sign-off、release ready或已部署。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-068-task-title-center-child-drop.md` | Implemented / Targeted Title-Anchor + Reorder Boundary Browser Passed / Adjacent L1 Placeholder Regression Open / Physical Mobile 未充分驗證 / 未 Release | DEV-068 | L1／L2／L3+ 完整 DEV-065 hover scope、1,000ms dwell、最終同層標題起點，以及展開任務 standard marker 的完整 scope 邊界契約。 |
| `ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md` | Executed / Targeted Title-Anchor + Reorder Boundary Browser Passed / Adjacent L1 Placeholder Regression Open / Physical Mobile 未充分驗證 | DEV-068 | 76/76 static、TypeScript、build、L2／L3／L4+ title-anchor 與 desktop/mobile 完整 scope boundary rendered gate PASS；既有 L1 placeholder 相鄰失敗仍保留。 |
| `ai-doc/qa/QA-DEV-068-coverage-matrix.md` | 70/70 AI Coverage PASS / Physical Mobile Pending | DEV-068 | 將70個風險案例逐項連到94項browser與254項static/deterministic evidence。 |
| `ai-doc/qc/QC-DEV-068-task-title-center-child-drop.md` | AI Browser QA-QC Passed / Physical Mobile 未充分驗證 / 未 Release | DEV-068 | QC 事實報告、操作矩陣、畫面證據、錯誤 sweep 與剩餘 physical gate。 |
| `ai-doc/dev_task.md` | DEV-068 Implemented / Browser PASS / Physical Pending | DEV-068 | 基線 commit `56baa77` 與續作前 checkpoint `ca41403` 後完成 whole-hover-scope revalidation、RD 與獨立 QC；未授權 release。 |

## Documentation Map Update - 2026-08-14（手機長按文字圈選修復）

Spec Impact：對 DEV-054 為 `Compatible hardening`；不改 raw-finger、canonical target、action rail、桌機 approved overlay 或 Workbench placed-row no-drag。可長按任務表面從 touchstart 抑制 native selection/callout，實際 TouchEvent 不再依 viewport 寬度判定輸入模式；Workbench 未歸位列仍保留 native pan。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-054-mobile-task-drag-precision.md` | Rework 5 Implemented / Automated QA-QC Passed / Physical Pending | DEV-054 | 新增原生 selection/callout ownership、width-independent touch session 與 Workbench pan boundary。 |
| `ai-doc/qa/QA-DEV-054-mobile-task-drag-precision.md` | Automated QA 15/15 + regressions PASS / Physical Pending | DEV-054 | R12-R15 與擴充回歸涵蓋 L1/L2/L3+、gesture threshold、wide touch、Workbench。 |
| `ai-doc/qc/QC-DEV-054-mobile-task-drag-precision.md` | Automated QA-QC PASS / Overall 未充分驗證 | DEV-054 | 記錄 44/44 static、15/15 browser、完整相鄰回歸、zero-tolerance 與 physical gate 邊界。 |
| `ai-doc/dev_task.md` | DEV-054 Blocked / Awaiting Physical Devices | DEV-054 | RD 與 automated QA-QC 完成；連續三輪未偵測到實機，iOS/Android 各 50 trials 前不標記 Complete。 |

## Documentation Map Update - 2026-08-14（看板任務拖曳升級為 L1 列表）

Spec Impact：對 DEV-054／055 的舊 `column-header` 非 L1 落點語意為 `Intentional replacement`；對 DEV-053 canonical resolver、DEV-058 單一定位條與來源 no-op 為 `Compatible exception`／`No conflict`。L2／L3+ 拖到列表標頭會升級為 L1，拖到列表內容區仍是 L2；看板尾端另提供 L1 append target。DEV-051／052、Workbench placed row、schema、production 與 release 不在本輪。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-067-kanban-l1-drag-promotion.md` | Implemented / QC PASS | DEV-067 | L1 header、root append、nodeType group、single marker、desktop/mobile canonical resolver 與不可變更邊界。 |
| `ai-doc/qa/QA-DEV-067-kanban-l1-drag-promotion.md` | Executed / PASS | DEV-067 | Resolver、桌機／手機 L1 promotion、L2 regression、zero-write、subtree、三 viewport 與 visible-error gate 已通過。 |
| `ai-doc/qc/QC-DEV-067-kanban-l1-drag-promotion.md` | QC PASS / 未 Release | DEV-067 | DEV-067 13/13 static、8/8 browser、DEV-055 16/16、DEV-054 11/11、TypeScript、ESLint、build 與 rendered evidence。 |
| `ai-doc/dev_task.md` | DEV-067 Completed / QC PASS / 未 Release | DEV-067 | 本機 RD／QA／QC 完成；正式環境須另走 release gate。 |

## Documentation Map Update - 2026-08-20（DEV-066 Rework 4：手機／電腦共用任務備註 editor）

Spec Impact：`Intentional replacement`。使用者 2026-08-20 明確取代 DEV-066 舊 `1A` mobile zero-editor＋append-only 契約：手機與電腦共用同一個既有 Lexical 任務備註 editor、格式 allowlist、canonical write path 與儲存流程，只保留 responsive layout／touch／soft-keyboard 差異；完全刪除手機「追加文字」UI，不新增手機 editor 模組。`2A／3A`、版本化 rich state、plain compatibility alias、AI safe projection、legacy/schema 與權限邊界不變。Rework 4 已於 2026-08-28 完成本機實作與 simulated viewport QC；iOS Safari／Android Chrome 實機 touch／IME／soft-keyboard仍待驗證，沒有 production、migration、部署或 release 授權。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/dev_task.md` | DEV-066 Rework 4 Implemented / Physical Device Pending | DEV-066 | 單一 editor module、手機零 append UI 與 local simulated QC 已完成；實機 gate 前維持驗證中。 |
| `ai-doc/specs/SPEC-066-task-note-semantic-rich-text.md` | Rework 4 Implemented / Local Simulated QC PASS | DEV-066 | 所有 viewport 共用 editor；手機 append UI 為 0，responsive／touch／keyboard 為唯一裝置差異。 |
| `ai-doc/decisions/ADR-042-task-note-canonical-rich-content.md` | Accepted / 2026-08-20 Amended | DEV-066 | canonical／projection 架構不變；mobile append write path 改為同一 Lexical canonical write path，不另建 editor。 |
| `ai-doc/qa/QA-DEV-066-task-note-semantic-rich-text.md` | Rework 4 Local Simulated PASS / Physical Pending | DEV-066 | 單一元件、append absence、320／390／landscape、保存重開與 regression已執行；touch selection、IME、soft keyboard實機待補。 |
| `ai-doc/qc/QC-DEV-066-task-note-semantic-rich-text.md` | Rework 4 Local Simulated QC PASS / Physical Not Verified | DEV-066 | 保留 Rework 1～3 歷史事實，新增 2026-08-28 rendered evidence與實機證據限制。 |
| `src/components/TaskDetailsModal.tsx`、`src/components/TaskNotes/*`、`src/utils/taskNoteRichContent.ts` | Rework 4 Implemented | DEV-066 / DEV-057 | `TaskDetailNoteEditor` 為所有 viewport 單一 editor；移除 breakpoint／append branch與未使用 append helper，不新增手機模組。 |
| `src/components/Records/RecordContentEditor.tsx`、`src/utils/recordLexicalContent.ts` | Existing Lexical capability reference / no behavior change | DEV-066 / DEV-006 | 只重用 engine 經驗；不改會議紀錄 editor 或其 serializer。 |
| `src/services/rag/wbsRagAdapter.ts` | Existing verified baseline / no Rework 4 change | DEV-066 / DEV-008 | 由 rich state 產生安全 Markdown 與 note metadata；description/detailNotes 去重與 legacy fallback 契約維持。 |

## Documentation Map Update - 2026-08-10（未歸位任務帳號同步）

Spec Impact：使用者已授權執行未歸位任務跨裝置一致化。Supabase backend 現改採 `task_workbench_unplaced_items` 以 `owner_id` 隔離，首次載入以 `updatedAt` 合併 legacy localStorage 並在成功後清除 staging；Firebase / local-test 維持本機 fallback。Migration、RLS readback、正式部署與 production smoke 仍是 release gate，尚未宣稱完成。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Phase 2B Production Migration and Deploy Complete / Authenticated Smoke Pending | DEV-039 | 已完成帳號歸屬的未歸位任務資料表、owner RLS、CRUD service、一次性本機合併、remote readback 與 Firebase production deploy；authenticated two-device smoke 待補。 |
| `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2B Release Gate Passed / Authenticated Smoke Pending | DEV-039 | 已驗證 migration history、table/RLS/policy/grant readback、artifact smoke 與 production app shell；同帳號 CRUD parity 仍需使用者登入正式站人工補測。 |
| `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md` | Production Migration and Deploy Passed / Authenticated Smoke Pending | DEV-039 | 已完成 migration/service/static、TypeScript、build、Firebase deploy、Level 4 artifact provenance smoke；production OAuth feature smoke 因無安全測試帳號待人工補測。 |
| `task_workbench_unplaced_items` migration、`taskWorkbenchUnplacedService`、`placement.ts`、`useWbsStore`、`TaskWorkbenchPanel` | Production Deployed / Manual Feature Smoke Pending | DEV-039 | Supabase 帳號資料優先；遠端未就緒時保留 account-scoped local fallback，不把全域 localStorage 泄漏給不同帳號。 |

## Documentation Map Update - 2026-08-05（任務子樹 hover 與拖曳影響範圍預覽）

Spec Impact：對 DEV-057 exact-innermost 單任務 hover 框為 `Intentional replacement`；保留 innermost 來源 ownership，但把可見提示擴張為來源任務的完整子樹，實際拖曳 overlay 另顯示 canonical 非封存後代數量。DEV-055 drop target、origin no-op、commit／undo、手機與資料契約不變。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-065-task-subtree-hover-preview.md` | RD Rework 13 Implemented / Card + List Two-Layer QC Passed | DEV-065 | L1 欄位標頭與卡片內容區、L2 卡片最外層來源與子任務區、L3+ recursive scope 共用 primary-500 source／primary-400 group 語意；標題列不另加框；title color／cursor 穩定且移除原生 tooltip。 |
| `ai-doc/qa/QA-DEV-065-task-subtree-hover-preview.md` | Rework 14 Static 40/40 + Browser 15/15 Passed | DEV-065 | L1／L2／L3+ 統一拖動範圍框、outer scope／primary source 責任分離、selected/focus-visible、L1 卡片內容完整群組 overlay、L2 卡片最外層來源框＋子任務第二層、geometry、interaction 與 visible-error gate 通過。 |
| `KanbanColumn`、`KanbanCard`、`KanbanChecklist`、`BoardView`、`taskDragScope` | Rework 13 Local QC Passed | DEV-065 | L1 card lane overlay、L2 card-root source marker 與 subtree scope、L3+ 完整 inset group frame；標題列沒有額外內框、沒有原生黑色 tooltip、大片填色或第三層巢狀框。 |

## Documentation Map Update - 2026-08-04（全系統品牌藍統一）

Spec Impact：對 DEV-062 一般藍色與工作台 Morandi 藍灰為 `Intentional replacement`；對 DEV-058 legacy `bg-blue-500` class 為 `Compatible exception`，runtime 由 theme alias 轉為品牌藍。全系統主要操作、選取、focus、資訊、進行中、拖曳與心智圖藍色統一到 `#6366F1` 品牌色階；成功、警告、危險、逾期與中性灰不變。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-064-brand-blue-unification.md` | RD Implemented / Local QC Passed | DEV-064 | 品牌藍 50–950、legacy alias、SVG／持久化色值、功能色與 out-of-scope 的 authoritative contract。 |
| `ai-doc/qa/QA-DEV-064-brand-blue-unification.md` | Static + Browser QC Passed | DEV-064 | 驗證 theme、看板、詳情、工作台、心智圖、手機與 visible-error gate；6/6、console 0 errors。 |
| `src/index.css`、`brandColors.ts` | Local Implemented / QC Passed | DEV-064 | CSS 與非 CSS 的品牌藍入口；blue／sky／indigo／cyan legacy utility 對應同一色階。 |
| `TaskWorkbenchPanel`、`compactTokens`、`StatusFilterBar` | Local Implemented / Browser QC Passed | DEV-064 / DEV-039 | 藍灰容器收斂為 slate；active、drop 與 filter 使用品牌藍。 |
| `MindMapRelationshipOverlay`、`mindMapGeometry`、`MindMapDragPreviewLayer` | Local Implemented / Browser QC Passed | DEV-064 / DEV-027E | SVG 與 legacy 關係線色收斂至 `BRAND_BLUE`。 |

## Documentation Map Update - 2026-08-04（看板 L2／L3+ 視覺層級強化）

Spec Impact：對 SPEC-028 先前「L2 無框、L3+ 無容器框」為 `Intentional replacement`，並依最新指示維持同層任務無逐列分隔線。L2 使用完整中性外框與陰影；L3+ 使用內嵌左導軌與無線條扁平列。互動、資料、日期、標籤、狀態與部署邊界不變。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | DEV-063 Addendum / RD Implemented | DEV-063 / DEV-028 | L2／L3+ 新視覺層級 authoritative contract。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | DEV-063 Browser QC Passed | DEV-063 | 驗證框線、陰影、左導軌、扁平列、geometry 與三 viewport。 |
| `KanbanCard`、`KanbanChecklist` | Local Implemented / Browser QC Passed | DEV-063 | 實作 framed-elevated L2 與 inset flat-unlined L3+；三 viewport 重驗通過。 |

## Active Repository / Cold Start Rule

- Active repo 固定為 `C:\VIBE CODING\ProJED\ProJED`。
- 不要從 `C:\VIBE CODING\ProJED` 外層遞迴讀取 sibling clone，例如
  `ProJED-dev011012-hotfix`、`ProJED-main-ai-data-fix` 或備份資料夾。
- 冷啟動先讀 `ai-doc/dev_task.md` 的 `## 總任務清單` 與本檔最前方最新狀態；選定 DEV 後，只讀該 DEV 直接連結的 SPEC / QA / QC / release 文件。
- 歷史 PM Update 已歸檔至 `ai-doc/archived/dev_task_pm_updates_2026-07-15.md`；只有追查特定 DEV 歷史、release evidence 或 cross-task consistency 時才搜尋該檔。
- Spec Impact Preflight：修改產品程式前，若已知 DEV，先讀該 DEV 直接連結的 active SPEC / ADR / QA；若未知 DEV，先以功能名、component、route、API、table、status、permission 或錯誤訊息搜尋本檔與 `dev_task.md`，只讀命中項。結論需分類為 `No conflict`、`Compatible exception`、`Intentional replacement` 或 `Unresolved conflict`；`Unresolved conflict` 不得直接改碼。

## Documentation Map Update - 2026-08-04（任務狀態精簡與截止日衍生逾期）

Spec Impact：對 DEV-028「保留狀態刻痕」與 DEV-039 六種狀態 filter UI 為 `Intentional replacement`；對 Supabase legacy enum、備份與歷史資料為 `Compatible exception`。人工狀態只保留待辦、進行中、暫緩、完成；逾期由截止日自動判斷且不回寫 status。狀態 UI 使用純文字與深灰／藍／淺灰，逾期另用橘紅警示。正式資料 migration 與 production deploy 不在本輪。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-062-simplified-task-status-and-derived-overdue.md` | RD Implemented / Local QC Passed | DEV-062 | 四種人工狀態、legacy compatibility、逾期公式、視覺與部署邊界的 authoritative source。 |
| `ai-doc/qa/QA-DEV-062-simplified-task-status-and-derived-overdue.md` | Static + Browser QC Passed | DEV-062 | 覆蓋狀態正規化、逾期邊界、純文字 UI、三 viewport 與 visible-error sweep。 |
| `src/utils/taskStatus.ts`、`src/store/useWbsStore.ts` | Local Implemented | DEV-062 | 共用人工狀態正規化與逾期判斷；停止自動 delayed 持久化。 |
| `TaskDetailsModal`、`WbsNodeItem`、`StatusFilterBar`、`TaskConditionFilterControls` | Local Implemented / Browser QC Passed | DEV-062 | 只顯示四種人工狀態，移除狀態圖示／圓點並套用三色角色。 |
| `TaskDateBadge`、`taskFilters/*`、`useBoardStore` | Local Implemented / Browser QC Passed | DEV-062 / DEV-039 / DEV-060 | 逾期日期以橘紅色呈現但只顯示日期；提供只讀逾期篩選並保存本機偏好版本 3。 |
| `scripts/verify-dev-062-simplified-task-status*` | Static + Browser Passed | DEV-062 | 驗證契約、邊界、三 viewport 與 screenshot evidence。 |

## Documentation Map Update - 2026-08-04（看板任務日期僅顯示到期日）

Spec Impact：對 DEV-060 原「L2／L3+ 顯示開始日 → 到期日並受 `showStartDate` 控制」為 `Intentional replacement`；對 DEV-028 卡片正面保留日期為 `Compatible exception`。看板 L1／L2／L3+ 固定只顯示格式化 `endDate`，沒有到期日就不顯示日期；開始日與到期日資料、排程、依賴、鎖定、警示、其他檢視與日期設定不變。舊 production 日期區間 evidence 保留為歷史，不代表本機到期日單值版已發布。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | DEV-060 Replacement Addendum / Local Implemented | DEV-060 / DEV-028 | 定義所有看板階層只顯示到期日、無到期日不顯示、舊偏好隔離與不可變更資料邊界；acceptance 5/5。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | QA-060 Browser QC Passed 5/5 | DEV-060 / DEV-028 | 已驗 L2／L3+ 到期日文字、舊偏好 true／false parity、三 viewport、無 overflow 與 console 0 errors。 |
| `src/components/Wbs/KanbanColumn.tsx`、`KanbanCard.tsx`、`KanbanChecklist.tsx` | Local Implemented / Browser QC Passed | DEV-060 | L1／L2／L3+ 固定傳入 `showStartDate={false}`，不再訂閱看板的 `showStartDate`。 |
| `src/components/Wbs/TaskDateBadge.tsx` | Reused / Unchanged | DEV-060 | 沿用既有到期格式、今日警示、end/duration lock 與 `data-task-due-date`。 |
| `scripts/verify-dev-060-kanban-due-date-browser.pw.js`、`verify-dev-028-cross-mode-task-interactions.mjs` | Browser 5/5 + Static 42/42 | DEV-060 / DEV-028 | 驗證日期只等於到期日、無箭頭、偏好隔離及三 viewport；static 鎖定所有看板 surface。 |

## Documentation Map Update - 2026-08-04（看板標籤堆疊式尾標貼紙）

Spec Impact：對 DEV-061 先前「全看板名稱收疊、單一實色圓點與 `showTagNames` 控制」為 `Intentional replacement`；對 DEV-028 卡片正面保留標籤為 `Compatible exception`。L2／L3+ 改用相同單行堆疊貼紙，貼在名稱尾端的預留安全區，點擊／鍵盤 focus 只開該任務完整標籤 popover。標籤資料、篩選、TagPicker、其他檢視、詳情與拖曳不變；舊 production evidence 保留為歷史，不代表本機替代版已發布。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | DEV-061 Replacement Addendum / Local Implemented | DEV-061 / DEV-028 | 定義一致貼紙、名稱安全區、最多兩層、`+N`、task-local popover、鍵盤與互動隔離契約；acceptance 7/7。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | QA-061 Replaced / Browser QC Passed 8/8 | DEV-061 / DEV-028 | 已驗 L2／L3 parity、單行 geometry、popover、舊偏好隔離與 1440／1024／390 viewport。 |
| `src/components/Tags/KanbanTagSticker.tsx` | Local Implemented / Browser QC Passed | DEV-061 | 新增共用看板貼紙、viewport-safe task-local popover 與 Escape 回焦抑制。 |
| `src/components/Wbs/KanbanCard.tsx`、`KanbanChecklist.tsx` | Local Implemented / Browser QC Passed | DEV-061 / DEV-028 | 將 L2／L3+ 標籤移入同一標題列，移除獨立 wrap 標籤列與全看板 toggle wiring。 |
| `scripts/verify-dev-061-kanban-tag-collapse.mjs`、`verify-dev-061-kanban-tag-collapse-browser.pw.js` | Passed 20/20 + 8/8 | DEV-061 | 檔名為歷史相容入口；內容已改驗堆疊貼紙替代契約與清理 local-test fixture。 |

## Documentation Map Update - 2026-08-04（看板進度條與巢狀框線精簡）

Spec Impact：對 DEV-059「保留藍色進度條」與 DEV-028「不做卡片正面降噪」為 `Intentional replacement`。依使用者最新明示決策，移除看板 L1 列表與 L2 卡片的可見進度條，以及標題、卡片、L3+ 容器／列、新增任務、日期與可展開標籤的非必要常駐框線；改以 L1 淡外框、L2 無框陰影、L3+ 淡底與間距分層。進度資料、清單模式百分比欄、必要資訊、狀態刻痕與所有互動不變。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Compact UI Addendum / Local Implemented | DEV-028 / DEV-059 / DEV-060 / DEV-061 | 新決策取代進度條與巢狀常駐框線限制，其他卡片必要資訊與互動維持。 |
| `src/components/BoardView.tsx`、`src/components/Wbs/KanbanColumn.tsx`、`KanbanCard.tsx`、`KanbanChecklist.tsx` | Local Implemented | DEV-028 / DEV-059 | 移除進度條、標題／卡片／L3+／兩層新增任務入口的常駐框線，以色面、陰影與間距維持階層。 |
| `src/components/Wbs/TaskDateBadge.tsx`、`src/components/Tags/KanbanTagSticker.tsx` | Local Implemented | DEV-060 / DEV-061 | 看板日期維持無描邊淡底；標籤已由後續堆疊貼紙決策取代。 |
| `scripts/verify-dev-028-cross-mode-task-interactions.mjs` | Updated / Passed 42/42 + Browser QC Passed | DEV-028 / DEV-059 / DEV-060 / DEV-061 | 鎖定進度條與非必要框線不得重新出現，並納入 `KanbanTagSticker`；1440×900、1024×768、390×844 無頁面溢出或可見錯誤。 |

## Historical Documentation Map - 2026-08-04（Trello 式看板標籤收疊，已被貼紙契約取代）

本節只記錄 commit `8713481` 的歷史 production 狀態；全看板收疊與圓點已被本檔最上方堆疊貼紙契約取代，不再是目前 source contract。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | DEV-061 Addendum / Production Released | DEV-061 / DEV-028 | 定義全看板名稱收疊、單一實色圓點、hover disclosure、鍵盤操作與不可變更邊界；acceptance 7/7。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | QA-061 Passed 8/8 / Level 4 Passed | DEV-061 / DEV-028 | 已覆蓋點擊、tooltip、持久化、鍵盤、詳情／拖曳隔離、手機 viewport 與 visible-error sweep。 |
| `src/components/Tags/TagChip.tsx` | Implemented / Production Released | DEV-061 | 沿用共用 TagChip，僅在看板傳入收疊控制時改為可操作的名稱／圓點切換。 |
| `src/components/Wbs/KanbanCard.tsx`、`KanbanChecklist.tsx` | Implemented / Production Released | DEV-061 / DEV-028 | L2 與 L3+ 共用同一 `showTagNames` 偏好與 toggle。 |
| `src/store/useBoardStore.ts`、`src/features/taskFilters/*` | Implemented / Production Released | DEV-061 / DEV-039 | 在既有本機顯示偏好中保存 `showTagNames`，預設展開並支援 undo。 |
| `scripts/verify-dev-061-kanban-tag-collapse.mjs`、`verify-dev-061-kanban-tag-collapse-browser.pw.js` | Passed 18/18 + 8/8 | DEV-061 | Static contract 與本機實際 UI 驗證已通過，測試資料已清理。 |
| `ai-doc/release/LEVEL4-production-deploy-evidence-20260804-continuous-optimization-3.md` | DEV-061 Production Released / Level 4 Passed | DEV-061 | 記錄 commit `8713481`、乾淨 minified artifact、Firebase preview／production smoke、35/35 線上雜湊、feature evidence 與 rollback。 |

## Documentation Map Update - 2026-08-04（持續優化3正式發布）

`持續優化3` 已快轉合併至 `main`，artifact commit `339bf27` 已部署 Firebase Hosting production。Level 2、Level 3 preview、Level 4 production smoke、正式產物 SHA-256 與登入後唯讀 UI 抽查均通過；本次未部署 Supabase migration、Edge Function 或資料變更。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/release/LEVEL4-production-deploy-evidence-20260804-continuous-optimization-3.md` | Production Released / Level 4 Passed | DEV-058 / DEV-059 / DEV-060 / DEV-057 | 記錄 merge、來源驗證、Level 3 preview、production artifact provenance、登入後儲存鈕／日期／徽章／hover 抽查、非阻塞風險與 rollback。 |
| `ai-doc/dev_task.md` | Production Released / Level 4 Passed | DEV-058 / DEV-059 / DEV-060 | 三個開發點已由未部署更新為正式環境交付；手機正式資料拖曳仍保留為補充人工驗證。 |

## Documentation Map Update - 2026-08-03（L2 / L3+ 看板日期顯示一致化）

Spec Impact：對 DEV-028、DEV-054、DEV-055、DEV-059 為 `No conflict`。L2 不新增日期樣式，直接使用 L3+ 的 `TaskDateBadge surface="checklist"`，並同樣放在標題列右側；只統一可見樣式、位置與密度，不改日期內容、篩選、警示、鎖定、資料或拖曳契約。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `src/components/Wbs/KanbanCard.tsx` | Production Released / Level 4 Passed | DEV-060 / DEV-028 | L2 日期改用既有 L3+ checklist surface，並移到標題列右側，統一樣式與位置。 |
| `src/components/Wbs/TaskDateBadge.tsx` | Reused / Unchanged | DEV-060 | 沿用既有 checklist 日期 token、今日到期 warning 與鎖定樣式，未新增分支。 |
| `scripts/verify-dev-028-cross-mode-task-interactions.mjs` | Updated / Passed 38/38 | DEV-060 / DEV-028 | 鎖定 KanbanCard 與 KanbanChecklist 都必須使用同一 checklist 日期 surface，且 L2 日期必須位於標題列。 |
| `scripts/verify-dev-055-desktop-task-drag-target-clarity-browser.pw.js` | Updated / Passed 16/16 | DEV-060 / DEV-055 | 卡片原地拖曳驗證明確從標題列起拖，不再依賴會受卡片高度影響的百分比座標。 |

## Documentation Map Update - 2026-08-03（看板階層統計徽章精簡）

Spec Impact：對 DEV-028 舊有 `CheckSquare` 子任務完成統計呈現為 `Intentional replacement`；對 DEV-054、DEV-055、DEV-058 為 `No conflict`。只刪除卡片頂部 `完成數/總數` 與下層任務列右側子項目數量兩種重複 Badge，保留日期、藍色進度條、階層展開、欄位標頭統計與所有拖曳契約。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `src/components/Wbs/KanbanCard.tsx` | Production Released / Level 4 Passed | DEV-059 / DEV-028 | 移除卡片 metadata 列的下層任務完成數 Badge，保留藍色進度條與下層任務區。 |
| `src/components/Wbs/KanbanChecklist.tsx` | Production Released / Level 4 Passed | DEV-059 / DEV-028 | 移除深層任務列右側子項目數量 Badge，保留遞迴階層與日期。 |
| `scripts/verify-dev-028-cross-mode-task-interactions.mjs` | Updated / Passed 37/37 | DEV-059 / DEV-028 | 鎖定兩種重複階層數量 Badge 不得重新出現，其他卡片正面內容與詳情入口不變。 |

## Documentation Map Update - 2026-08-03（跨裝置拖曳原地文字欄位藍色回饋）

Spec Impact：對 DEV-055、DEV-054 為 `Compatible exception`；對 DEV-058 Attempt 1 與 Rework 1 mobile exclusion 為 `Intentional replacement`。桌面與手機都在來源範圍顯示藍底白字原地欄位，但不把來源改成可提交 target；DEV-054 的 raw finger、innermost ownership、target stability、action rail priority 與 zero-write 契約繼續有效。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-058-desktop-drag-origin-insertion-feedback.md` | Rework 2 Complete / Production Released / Level 4 Passed | DEV-058 / DEV-055 / DEV-054 | 定義跨裝置來源範圍 no-op title field、視覺層級與不可變更邊界。 |
| `ai-doc/qa/QA-DEV-058-desktop-drag-origin-insertion-feedback.md` | Rework 2 Executed / Mobile 11/11 / Desktop 16/16 | DEV-058 / DEV-055 / DEV-054 | 驗證單一藍色 title field、正常 marker 分離、零寫入與跨裝置拖曳回歸。 |
| `src/components/BoardView.tsx` | Rework 2 shared visual / local verified | DEV-058 | 依實際滑鼠位置切換正常 target indicator 與 origin/no-op 藍色 title field。 |
| `src/components/Wbs/taskDrag/desktopTaskDropPreview.ts` | Rework 2 shared geometry / local verified | DEV-058 / DEV-055 / DEV-054 | 來源 title field 共用既有 task-title primary geometry，提供 placeholder fallback。 |
| `src/components/Wbs/taskDrag/TaskOriginTitleField.tsx` | Rework 2 implemented / local verified | DEV-058 | 桌面與手機共用既有 `bg-blue-500` / `text-white` 原地標題欄位。 |
| `src/components/Wbs/KanbanInsertionMarker.tsx` | Baseline restored | DEV-058 / DEV-055 | 移除 Attempt 1 emphasized variant，正常落點 marker 回復既有樣式。 |
| `scripts/verify-dev-058-desktop-drag-origin-insertion-feedback.mjs` | Rework 2 gate passed 26/26 | DEV-058 | 鎖定 no-op、overlay-only、跨裝置藍底白字 title field 與 browser 證據契約。 |
| `src/components/Wbs/taskDrag/TaskDragPresenter.tsx` | Rework 2 implemented / local verified | DEV-058 / DEV-054 | 手機 origin/no-op 狀態沿用藍底白字 title field，一般 target marker 不變。 |
| `src/components/Wbs/taskDrag/taskDragTargetAdapter.ts` | Rework 2 implemented / local verified | DEV-058 / DEV-054 | 以目前 source placeholder rect 判斷手機 origin，不改 canonical target resolver。 |

## Documentation Map Update - 2026-08-03（低價值會議活動過濾契約同步）

Spec Impact=`Intentional replacement`：DEV-007 的原生看板操作與有語意活動捕捉仍有效，但「拖曳移動必須收集並逐筆附加正文」已由 DEV-011/012 取代。現行契約在前端 buffer、deterministic fallback、專案變化匯入與 Edge Function 一致排除 `task_moved` 及純位置／排序制式摘要；只有此類事件的任務不得建立段落或 task link。含原因、決議、風險或下一步的人工文字仍需保留。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` | Historical contract amended | DEV-007 / DEV-011 / DEV-012 | 保留原生看板與有語意活動捕捉，標示逐筆 append 與純位置 activity 已被取代。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | Source package contract amended | DEV-011 / DEV-012 | AI source package 送出前排除純位置／排序 activity。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | Active quality contract amended | DEV-012 | 定義低價值事件、跨邊界一致過濾、task section / linkedTaskIds 與人工內容保留規則。 |
| `ai-doc/qa/QA-DEV-012-ai-meeting-record-natural-language-quality.md` | QA matrix amended | DEV-012 | 新增 GS-005，驗證純位置事件不成文、有效活動不受影響、人工實質文字不誤刪。 |

## Documentation Map Update - 2026-08-07（會議整理文字密度最佳化）

Spec Impact=`Intentional replacement`：依使用者回饋，任務完整路徑改為同一標題行以「／」串接；只有階層用途的父節點不再獨立輸出，activity 先做 no-op 與 fingerprint 去重，日期變更改用自然語言呈現。進一步重開 DEV-012，新增 `meeting-synthesis-v2` 握手、Edge/client 雙重品質閘門、run trace、既有 metadata persistence、AI／規則整理來源揭露、source snapshot 與 merge integrity gate。資料庫 schema 與 record content persistence 格式未變；本機 verifier、TypeScript 與真實瀏覽器 5/5 通過，尚未部署或驗證 production v2。

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `src/utils/meetingRecordSynthesis.ts` / `src/utils/projectChangeImport.ts` | Contract v2 local implementation verified | DEV-012 | 單行完整路徑、直接證據節點、匯入 path + narrative evidence、activity 去重/no-op、日期自然語言化與 fail-closed quality report。 |
| `src/services/meetingSynthesisService.ts` / `src/store/useRecordStore.ts` | Contract + merge gate local implementation verified | DEV-012 | request version handshake、trace validation、source snapshot、merge integrity gate；不合格時保留原稿。 |
| `src/components/Records/RecordSidebar.tsx` / record services | Trace UI + persistence local verified | DEV-012 | UI 區分 AI／規則整理，提供 QC data attributes；trace 存入既有 `knowledge_records.metadata`。 |
| `supabase/functions/synthesize_meeting_record/index.ts` | Contract v2 source updated / not deployed | DEV-012 | Edge 強制 v2、執行輸出品質閘門並回傳／記錄 run trace；production 尚未部署。 |
| `scripts/verify-dev-012-meeting-record-quality.mjs` | Negative contract/quality verification passed | DEV-012 | 驗證 mismatch、trace missing source gate、空父節點／正文、task link 缺漏、重複與低價值內容。 |
| `scripts/verify-dev-024-ai-synthesis-preserve-human-draft-browser.pw.js` | Browser QC 5/5 passed | DEV-012 / DEV-024 | 真實操作驗證規則整理標示、v2/run ID/quality、metadata persistence、連續整理 idempotency 與發布。 |
| `ai-doc/reports/CAPA-20260807-dev-012-ai-synthesis-verification-gap.md` | Corrective action local done / production effectiveness pending | DEV-012 | 界定使用者操作無誤；根因為成功判定、契約、追溯、direct evidence 與跨版本結案證據缺口。 |

## Documentation Map Update - 2026-07-18（正式環境手機長按完整選單 hotfix）

使用者提供正式環境手機截圖：任務長按後除了頂部 compact action rail，畫面中央又出現完整 task context menu。Spec Impact=`Compatible exception`：不改手機拖拉定位、不改 action rail 內容、不改桌機右鍵功能；只補 mobile action session 對 `contextmenu` 的事件所有權，避免 Android / Chrome 長按合成事件穿透到桌機選單。

### DEV-056：正式環境手機長按完整選單誤開修正（Production Released / Level 4 Passed）

| 文件 / 程式 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `src/components/Wbs/taskDrag/useTaskGestureSurface.ts` | Hotfix Implemented | DEV-056 / DEV-029 / DEV-046 | mobile task action mode 的 task surface 在 React capture phase suppress `contextmenu`，不讓完整選單 handler 接到事件。 |
| `src/components/Wbs/taskDrag/useTaskDragSession.ts` | Hotfix Implemented | DEV-056 / DEV-054 | active mobile drag/action session 期間，以 document capture listener 作第二層防線，關閉 `GlobalContextMenu` 並記錄 `contextmenu:suppressed` debug。 |
| `src/components/GlobalContextMenu.tsx` | Testability Attribute Added | DEV-056 / DEV-055 | 加上 `data-global-context-menu` 與 kind attribute，讓 browser gate 能可靠驗證 mobile 不出現完整選單，同時保留桌機右鍵測試。 |
| DEV-029 / DEV-046 browser verifier | Executed / Passed | DEV-056 | 手機卡片、checklist row、欄位 header 長按後合成 `contextmenu`，驗證只保留頂部 action rail；`data-global-context-menu` 與完整選單 signature 為 0。 |
| DEV-054 / DEV-055 browser regression | Executed / Passed | DEV-056 | DEV-054 R01-R10 確認頂部欄 touch、action rail 點擊與手機定位未回歸；DEV-055 B10 確認桌機右鍵完整選單仍可用。 |
| `ai-doc/dev_task.md` | DEV-056 Production Released / Level 4 Passed | DEV-056 | 記錄 hotfix 根因、驗證、Firebase deploy、正式站 artifact provenance 與人工真機補驗邊界。 |

PM 治理註記：release branch `codex/mobile-action-menu-hotfix-20260718` 已由 clean worktree 建立並推送，runtime hotfix commit 為 `e891f29`，deployed release evidence commit 為 `812e9aa`。`npx tsc --noEmit`、DEV-029 static 39/39、DEV-046 static 31/31、DEV-053 static 30/30、DEV-054 static 34/34、DEV-055 static 27/27、DEV-029/046/054/055 browser gates、production build 與 Level 2 local artifact smoke 均通過；帶 production env 的 artifact 載入 `assets/index-DKsVgGEA.js` / `assets/index-B8eLAVHK.css`。2026-07-18 Firebase CLI reauth 後已部署 Firebase Hosting production `https://projed-cc78d.web.app`；Level 4 app-shell smoke 通過，正式站線上 JS/CSS hash 與本機 production artifact 一致。Authenticated production mobile long-press operation 未由 Codex 自動登入執行，需使用者以正式站登入後補 Android 真機操作證據；本 release 不變更 DB/schema/Auth/data。

## Documentation Map Update - 2026-07-17（手機新增 CTA 平移死角修正）

使用者回報手機模式按住「新增任務」時無法移動畫面，表示 pan-first 的可選擇窗口尚未涵蓋全任務畫面。盤點後判定 Spec Impact=`Compatible exception`：精準控制如 input、filter popover、modal、action rail 仍是 pure interactive control；但畫布上的大型新增 CTA 必須同時支援無位移 tap 與 short-pan pass-through。

### DEV-029：手機 Pan-First 觸控手勢仲裁（Canvas CTA Pass-Through Covered）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Phase 1 + Phase 1B Implemented / Canvas CTA Pass-Through Covered | DEV-029 / DEV-053 / DEV-054 / DEV-046 | 補明大型畫布 CTA 的雙重語意：欄位新增任務、看板尾端新增 CTA、TaskWorkbench 未歸位新增 CTA 可 tap，但 short pan 必須交給 mobile pan broker。 |
| `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QA Passed / B10-B12 Added | DEV-029 | 新增 B10-B12 驗證欄位新增任務水平/垂直短滑與看板尾端新增 CTA 短滑均可 pan，且不新增任務/欄位、不開 modal、不進 action rail。 |
| `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QC Passed / Canvas CTA Pass-Through Covered | DEV-029 | 記錄 root cause、RD 修正事實、DEV-029 static 38/38、browser B10-B12、DEV-054/053/046 回歸、TypeScript 與 build 證據。 |
| `ai-doc/dev_task.md` | DEV-029 Complete / Hotfix Evidence Updated | DEV-029 | DEV-029 完成狀態不變，摘要補入大型新增 CTA 平移死角修正；production 與真機 supplemental 仍未執行。 |

PM 治理註記：不得把所有 button 都改為 pan pass-through。只有大型畫布 CTA 可採 `data-mobile-pan-pass-through="true"`；表單、輸入框、select、filter、modal、TaskDetails controls、action rail 與日期/依賴/負責人控制仍維持精準互動優先。DEV-055 桌機驗收已於 2026-07-17 Rework 1 後通過；本手機 hotfix 不回寫或改寫桌機完成證據。

## Documentation Map Update - 2026-07-17（電腦版任務拖拉升級驗證）

使用者確認 DEV-054 Rework 4 成功，手機版跨階層移動的落點呈現甚至比電腦版更清楚。此成功經驗另立 DEV-055；不回開 DEV-054 scope，也不直接將 mobile touch stability 邏輯移植到桌機。

### DEV-055：電腦版任務拖拉落點清晰化與跨階層定位升級（Production Released / Level 4 Passed）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md` | Production Released / Automated QA-QC + User Desktop Acceptance + Level 4 Passed | DEV-055 / DEV-053 / DEV-054 / DEV-046 / DEV-051 | 使用者 T01-T08 Attempt 1 回報同格定位線漂移與 L3+ 被推開；Rework 1 改為 fixed overlay-only indicator、overlay append hit area、sortable displacement freeze 與 rect micro-retain；2026-07-17 使用者重驗通過並已發布 Firebase production。 |
| `ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md` | Executed / Automated + T01-T08 User Desktop Acceptance + Production Level 4 Passed | DEV-055 / DEV-053 / DEV-054 / DEV-046 | DEV-055 static 27/27、browser B01-B16 16/16、指定回歸、TypeScript 與 build 通過；T01-T08 共 38 次真實桌機重驗已由使用者回報通過；Firebase preview 與 production smoke 通過。 |
| `ai-doc/qc/QC-DEV-055-desktop-task-drag-target-clarity.md` | QC Passed / Production Released / Level 4 Passed | DEV-055 | 記錄使用者驗收失敗回送 RD、Rework 1 事實、browser/store 證據、representative screenshots、user acceptance pass、release branch `e07ba4b`、Level 3 preview 與 Level 4 production smoke。 |
| `ai-doc/dev_task.md` | DEV-055 Production Released / Level 4 Passed | DEV-055 / DEV-053 / DEV-054 | RD Rework 1、自動 QC、使用者 T01-T08 重驗、Firebase production deploy 與 Level 4 smoke 均通過。 |

PM 治理註記：DEV-055 為新交付點且計入完成率。第一次自動化 pass 不等於完成，因使用者 T01-T08 Attempt 1 已回報失敗；RD Rework 1 自動 QA/QC 通過後，2026-07-17 使用者回報 T01-T08 重驗通過，並明確要求部署正式環境。Release 走 clean worktree branch `codex/dev055-production-release-20260717-234436`，artifact commit `e07ba4b`，排除主工作樹中會議紀錄 / Supabase Edge 相關未確認變更；production live 於 2026-07-17 23:56:26 發布並通過 Level 4 unauthenticated app-shell smoke。Authenticated production drag smoke 未由 Codex 自動登入執行，需使用者登入正式站後補人工操作證據。不得將手機 retain/hysteresis、action rail 或 touch lifecycle 搬到桌機；不得改變已獲使用者核准的桌機 DragOverlay、起手門檻、click/right-click、commit/undo 契約。任一 displayed/committed mismatch、ancestor fallback、same-cell drift、L3+ push、placed row 可拖或桌機手感回歸皆為 stop condition。

## Documentation Map Update - 2026-07-17（手機任務拖拉定位精準度）

使用者操作回饋：DEV-054 第四次模擬手機證明 Rework 3 的 preview-to-indicator docking 讓拖曳物跳離手指，且 checklist source 在 innermost target 無效後會 fall through 到 expanded parent card。R10 已用 `636x764` 重現。RD rework 4 改為 preview 永遠跟 raw finger、exact innermost ownership、invalid ancestor blocking、bounded card primary rect，並移除 nearest-target 磁吸。使用者已於 2026-07-17 以原失敗路徑重驗通過；DEV-053 歷史完成證據與桌機 frozen baseline 維持，physical gate 仍不可省略。

### DEV-054：手機任務拖拉定位精準度優化（RD Rework 4 Implemented / Automated Browser + User Revalidation Passed / Physical Gate Pending）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-054-mobile-task-drag-precision.md` | RD Rework 4 Implemented / Automated Browser + User Revalidation Passed / Physical Gate Pending | DEV-054 / DEV-053 / DEV-029 / DEV-046 | 保留 desktop approved baseline；preview 永遠跟 raw finger；target 採 innermost exact hit、ancestor blocking、bounded card primary geometry；retain 外 direct handover；mobile source placeholder 不畫 marker；pan / edge-scroll 契約維持。 |
| `ai-doc/qa/QA-DEV-054-mobile-task-drag-precision.md` | RD Rework 4 Automated + User Revalidation Passed / Full Matrix + Physical Not Executed | DEV-054 | 四次使用者失敗與修正證據均保留；DEV-054 static 34/34、browser R01-R10，R06 驗證 bounded card primary，R10 驗證 `636x764` ancestor blocking、finger coupling、zero write。使用者原失敗路徑已重驗通過；B01-B12 與 iOS / Android 各 50 trials 仍為 required。 |
| `ai-doc/dev_task.md` | DEV-054 Verifying / P1 / Physical Gate Required | DEV-054 | RD rework、browser 與使用者原路徑重驗已通過；physical device gate 與 QC report 通過前不得標記完成。 |

PM 治理註記：Spec Impact=`Compatible exception`。DEV-054 不回寫 DEV-053 QC 歷史結果；使用者原失敗路徑已重驗通過，但 physical iOS / Android 任一未通過，仍不得宣稱手機定位精準度或完整肌肉記憶一致性已完成。Workbench placed row 仍不能拖；desktop drag UI 仍以使用者核准的 DragOverlay / threshold / click-right-click 為 baseline。DEV-055 Rework 1 後 user revalidation 已通過，桌機升級本機完成；仍未 production deploy。

## Documentation Map Update - 2026-07-17（任務拖拉肌肉記憶一致化）

使用者已確認 Workbench `placed row` 不能拖。這是目前權威產品決策，覆寫 DEV-039 舊版
Phase 1B / Phase 2A 中「已歸位 row 可雙向拖回未歸位」與「已歸位 row 也應共用 draggable
root」的描述。DEV-039 既有 QA/QC 中對應案例保留為歷史證據，不再作為目前產品契約。

### DEV-053：任務拖拉肌肉記憶一致化（Implemented / QA True Operation Gate Passed）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-053-task-drag-muscle-memory-consistency.md` | Implemented / Local Static + Browser + QA True Operation Passed / Production Not Deployed | DEV-053 / DEV-029 / DEV-039 / DEV-046 | HCS `1C 2A 3A` 的完整拖拉子系統重構已完成；Workbench placed row 不可拖且手機長按不進 action rail；Desktop Drag UI Freeze 保留使用者核准 baseline。後續真機定位精準度由 DEV-054 處理。 |
| `ai-doc/qa/QA-DEV-053-task-drag-muscle-memory-consistency.md` | Executed / T01-T14 Passed / Physical Phone Supplemental Not Executed | DEV-053 | static / browser / regression 與真實滑鼠、合成觸控、cancel lifecycle 操作均通過；T01-T14 為 DEV-053 歷史完成 gate，不代表 physical precision 已簽核。 |
| `ai-doc/qc/QC-DEV-053-task-drag-muscle-memory-consistency.md` | Local QA True Operation Gate Passed / Production Not Deployed | DEV-053 | 記錄 T01-T14 route、viewport、操作前後狀態、截圖、console/network sweep、required command 與 placed-row no-drag 證據。 |
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Superseded in placed-row drag scope | DEV-039 / DEV-053 | DEV-039 的 placed-row draggable parity / bidirectional drag 描述由 DEV-053 覆寫；placed row 目前應視為 read-only placement list entry。 |
| `ai-doc/specs/SPEC-046-universal-task-surface-drag.md` | Superseded in workbench placed-row drag scope | DEV-046 / DEV-053 | DEV-046 whole-surface drag 仍適用於看板、清單、checklist 與 workbench unplaced row；workbench placed row 依 DEV-053 不能拖。 |
| `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md` | QA cases amended / Regression Passed | DEV-046 / DEV-053 | Workbench placed row 可拖回 unplaced / reorder 的舊案例已改為不可拖驗收方向；DEV-046 static/browser regression 已於 DEV-053 QC 通過。 |
| `ai-doc/dev_task.md` | DEV-053 Complete / DEV-054 Follow-up Active | DEV-053 / DEV-054 | DEV-053 本機功能與架構交付已完成；手機定位精準度另由 DEV-054 執行。 |

PM 治理註記：Spec Impact=`Intentional replacement`。使用者 HCS 決策為 `1C 2A 3A`：
完整拖拉子系統重構、placed row 手機長按不進 action rail、static + browser 作為自動化門檻。
2026-07-17 使用者再確認 QA 真實操作驗證計畫必須通過才算 DEV-053 完成；Physical iOS / Android 仍為 supplemental。
2026-07-17 使用者補充：電腦版拖拉 UI / 操作方式目前已滿意，DEV-053 RD 只能保留與穩定化，
不得以重構名義重設計桌機拖拉體驗。
本輪已完成產品程式重構、static/browser verifier、指定回歸與 QA True Operation Gate；未修改 DB/schema/API，未執行 production release。
DEV-052 已封存，不得作為 DEV-053 的實作基準；只可作 historical reference。

## Documentation Map Update - 2026-07-16（拖拉回復 main）

目前權威狀態：DEV-051 的 drop-intent／parent-lock 實作已從工作樹撤出；看板拖拉 runtime、
DEV-029 browser verifier 與 DEV-046 browser verifier回復 `main` 基準。DEV-051 的 SPEC／QA／QC
改為歷史證據，不得作為目前產品行為；DEV-052 因依賴已撤回基準而封存且不可執行。

### DEV-052：看板拖拉子系統重構與行為穩定化（Archived）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md` | Archived / Historical / Do Not Execute | DEV-052 / DEV-051 / DEV-046 / DEV-029 | 歷史重構提案；依賴的 DEV-051 行為已撤回，不得直接實作。 |
| `ai-doc/archived/QA-DEV-052-kanban-drag-subsystem-refactor.md` | Archived / Historical / Not Executed | DEV-052 | 保留真實操作 gate 作未來參考；目前不執行。 |
| `ai-doc/backlog.md` | DEV-052 removed from backlog | DEV-052 | DEV-052 不再保留為 backlog 候選；若重啟需另立以 `main` 為基準的新 DEV。 |
| `ai-doc/dev_task.md` | DEV-052 removed from active index / Archived | DEV-052 | Active 總任務清單不再列 DEV-052；不計入產品交付完成率。 |

PM 治理註記：Spec Impact=`Intentional replacement`。使用者明確要求回復 `main`，因此
SPEC-052 已封存且不再是 active implementation contract。ADR 不另建；DB/schema/API/release boundary 不變。

### DEV-051: 看板跨父層拖拉停留鎖定與落點定位（Withdrawn / Historical）

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-051-kanban-cross-parent-drag-lock.md` | Withdrawn / Historical | DEV-051 / DEV-046 / DEV-029 | 保留已嘗試的 750ms parent-lock 契約，不再描述目前 runtime。 |
| `ai-doc/qa/QA-DEV-051-kanban-cross-parent-drag-lock.md` | Historical Evidence / Not Current | DEV-051 | 舊測試與人工腳本可作未來研究資料，不得當成目前版本通過證據。 |
| `ai-doc/qc/QC-DEV-051-kanban-cross-parent-drag-lock.md` | Historical Evidence / Superseded | DEV-051 | 記錄已撤回版本曾執行的 QC；結論不適用目前 runtime。 |
| `ai-doc/backlog.md` | Deferred / Restored to main | DEV-051 / DEV-046 / DEV-029 | 目前採 `main` 的既有拖拉行為。 |
| `ai-doc/dev_task.md` | DEV-051 延後 / 已回復 main | DEV-051 | 不宣稱 DEV-051 交付完成。 |

PM 治理註記：`main` 的 DEV-029／046 行為重新成為 active baseline。DEV-051／052 都不得
在未重新確認需求與 characterization gate 前恢復；既有多人指派與任務卡編輯改善不在回復範圍。

## Documentation Map Update - 2026-07-15

### DEV-048: 多人主責與協作指派

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-048-task-multi-person-assignment.md` | Implemented / TEST + Production Migration Verified / Firebase Production Released / Level 4 Passed | DEV-048 | Authoritative contract：任務支援多位主責與多位協作，主責/協作互斥，canonical `assigneeIds` 保留 legacy `assigneeId` alias；明確排除「最終負責人」。 |
| `ai-doc/qa/QA-DEV-048-task-multi-person-assignment.md` | QA-QC Executed / TEST + Production Release Gate Passed / Alias Governance Residual Accepted | DEV-048 | 驗證計畫與 release addendum 涵蓋 helper、UI picker、TEST/production migration、authenticated Level 3、production Level 4 與 rollback evidence。 |
| `ai-doc/qc/QC-DEV-048-task-multi-person-assignment.md` | QC Passed / TEST + Production Release Gate Passed / Existing Alias Residual | DEV-048 | 記錄 verifier、TypeScript、build、TEST authenticated Level 3、production schema/data checks、Firebase Level 4 與 5 個未改動舊 production source hash residual。 |
| `ai-doc/dev_task.md` | DEV-048 Released / Level 4 Passed | DEV-048 | DEV-048 已完成 TEST/production migration、Firebase production release 與 Level 4；既有 migration provenance residual 與 DEV-047 RPC boundary 仍保留治理註記。 |

PM 治理註記：本輪依使用者註記不新增「最終負責人」。TEST/production 已驗證 `wbs_items.assignee_ids` migration、trigger、legacy alias、role/data API 行為，並完成 authenticated Level 3 與 Firebase Level 4。既有 DEV-047 遠端 backup RPC 仍可能是 first-primary compatible，維持 frozen boundary。`verify:supabase:migration-aliases` 的 5 個舊 production source hash mismatch 未修改，保留為 release governance residual。

## Documentation Map Update - 2026-07-14

### DEV-047: 看板備份套件 V2 與交易式匯入

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-041-board-backup-package-v2-transactional-import.md` | Accepted / Human Confirmed / Implemented Locally / Release Pending | DEV-047 / DEV-038 / DEV-040 | 決定第一階段採 board-only `projed-backup` v2、canonical backend read、copy-to-new-board default、same-origin replace、Supabase transaction/fingerprint/idempotency、out-of-package reference blocker與legacy inspect-first。 |
| `ai-doc/specs/SPEC-047-board-backup-package-transactional-import.md` | Phase 1 Implemented / Local Automated QA-QC Passed / Release Gate Required / Production Not Deployed | DEV-047 / DEV-038 | Authoritative product/engineering contract與完成證據：manifest/checksum/exclusions、package schema、import modes、inspection/plan、ID/tag/member mapping、transaction RPC、error taxonomy、UI communication及future workspace/account capsules。 |
| `ai-doc/qa/QA-DEV-047-board-backup-package-transactional-import.md` | Local QA-QC Executed and Passed / Level 3 Not Executed / Release Gate Required | DEV-047 | 已驗證 package canonicality、round-trip、transaction failure injection、idempotency、concurrency、role/RLS、record-link blocker、legacy/tamper/oversize、browser communication與viewport；遠端 Level 3 保留。 |
| `ai-doc/qc/QC-DEV-047-board-backup-package-transactional-import.md` | Local Automated QC Passed / Isolated Supabase Transaction Passed / Production Not Deployed | DEV-047 | 記錄 static `30/30`、model `10/10`、local transaction `9/9`、isolated Supabase RPC matrix、browser/RWD、regression、TypeScript/build與release residual risks。 |
| `ai-doc/dev_task.md` | DEV-047 Phase 1 Local Complete / Batch Release Pending | DEV-047 | 任務狀態已更新為本機開發與QA/QC完成；記錄Level 3、production、Phase 2/3與release artifact仍需Human Re-entry。 |

PM 治理註記：DEV-047 是 DEV-038 的後續資料架構交付，不回寫或否定 DEV-038 已發布的過渡 UI。Phase 1 產品碼、migration/RPC source 與本機 automated QA/QC 已完成；新流程不再把 Zustand 已載入資料視為完整全域備份，也不讓 legacy global/ambiguous 檔案直接攤平成單一看板。TEST mutation、遠端 migration、Firebase preview、production release與release artifacts均未執行；收到release型指令後才進入固定ProJED-TEST Level 3與deployment-release-gate。Phase 2/3需另行Human Re-entry。

## Documentation Map Update - 2026-07-13

### DEV-045 production release + Level 4 execution

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-040-production-migration-history-reconciliation.md` | Accepted / Production Executed / 38-of-38 Aligned | DEV-045 / Release Governance | Production 11筆history-only repair經schema hash hard gate證明無DDL；5筆真實migration已套用，DB lint與contract query通過。 |
| `ai-doc/release/PREPRODUCTION-DEV-045-20260713.md` | Production Released / Level 4 Passed / Cleanup Complete | DEV-045 / DEV-037 | 記錄TEST Level 3、production backup / migration / Edge / Firebase provenance、authenticated v3 preview / ICS identity、token lifecycle、既有v1 client觀察、rollback與0 residual證據。 |
| `ai-doc/qa/QA-DEV-045-pre-production-release-validation.md` | Executed / Level 3 + Level 4 Passed | DEV-045 / DEV-037 | 正式部署gate已執行；Google Calendar符合外部client要求，Outlook維持non-blocking supplemental。 |
| `ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md` | Production Released / Level 4 QC Passed | DEV-045 | 保留v2歷史證據並新增production DB / Edge / Hosting、v3 identity、token lifecycle、v1 observation與cleanup事實。 |
| `ai-doc/dev_task.md` | DEV-037 + DEV-045 Production Delivered | DEV-037 / DEV-045 | 任務狀態已關閉production release gate；正式環境與Level 4證據均已連結。 |
| `scripts/verify-supabase-migration-aliases.mjs` | 65/65 Passed | Release Governance | 鎖定11份comment-only alias、canonical hash、remote evidence與5份production source migration SHA-256。 |

PM治理註記：release owner已核准並完成production DB → Edge → Firebase順序部署；Level 4與cleanup全綠。Outlook為QA明定的non-blocking supplemental，不影響本次release完成判定。

## Documentation Map Update - 2026-07-12

### DEV-045: 逐看板獨立篩選快照取代 v2 繼承模型

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-038-calendar-subscription-per-board-filter-snapshot.md` | Accepted / Human Confirmed / Release Gate Required | DEV-045 / DEV-037 / DEV-039 | 記錄逐看板快照取代 global / override、state isolation、batch copy、v3 data contract、v1/v2 compatibility與舊 remote gate freeze的架構決策。 |
| `ai-doc/decisions/ADR-039-supabase-migration-version-aliases.md` | Accepted / TEST Reconciliation Authorized / Production Pending | DEV-045 / Release Governance | 保存ProJED-TEST四組remote/canonical migration等價證據、comment-only alias策略、history repair guardrails與production排除邊界。 |
| `ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md` | Phase 1-2 Local Implemented / Automated QA-QC Passed / Former v2 Remote Gate Frozen | DEV-045 / DEV-037 / DEV-039 | Authoritative v3 contract與已完成本機實作：Calendar / Workbench共用條件 UI語意但隔離 state；每張看板持有獨立 task filters與 `date_types` snapshot；預覽以task + date type呈現實際行事曆事件、開始／到期統計與未產生原因；支援included toggle、一次性批次複製、v1/v2 materialization與per-board permission recheck。 |
| `ai-doc/qa/QA-DEV-045-pre-production-release-validation.md` | QA Plan Ready / Level 3 Static + Unauthenticated Preview Passed / Auth Smoke Pending / Production Deploy Not Authorized | DEV-045 / DEV-037 | 正式部署前專用Gate：Git與artifact provenance、ProJED-TEST migration / Edge、Firebase level3-smoke、preview / ICS事件identity、v1/v2/v3相容、角色與token安全、外部calendar client、cleanup、rollback與Go / No-Go。 |
| `ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md` | Revised v3 QA Executed / Phase 1-2 Local Gates Passed / Release Gate Required | DEV-045 | 已執行 shared controls、state isolation、board draft、batch copy、v3 normalization、v1/v2 compatibility、permission matrix、preview/feed fixture與 320-1440 viewport gates。 |
| `ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md` | Per-Board v3 Phase 1-2 Local QC Passed / Historical v2 Evidence Preserved | DEV-045 | v3 addendum記錄 static/browser/model/feed、local DB 20-behavior rollback smoke、Deno check、DB lint、TypeScript/build與 regression evidence；舊 v2 remote path仍 frozen。 |
| `ai-doc/dev_task.md` | DEV-045 Phase 1-2 Local Complete / Release Hygiene Fixed / Phase 3-4 Release Gate Required | DEV-045 | 總任務清單與 PM Update已關閉本機 RD/QA/QC；production artifact 已加入 test credential guard，remote migration、Edge deploy、live `.ics`與 production release仍等待 release gate。 |

PM 治理註記：本次不新增重複 DEV，而是 intentional replacement。HCS 引導未逐題回覆後，使用者以「繼續」採建議 `1A / 2A / 3A`：只共用 UI / filter 語意、所有當下可讀看板建立獨立安全預設 snapshot、提供一次性批次複製且複製後不連動。2026-07-12批判修訂再把事件日期類型納入逐看板 snapshot，v3不保留頂層 `date_types`。production尚未部署 DEV-045 v2 migration / Edge matcher，read-only evidence為 v2 rows 0；目前 v3 Phase 1/2本機實作與驗證已完成，remote migration、Edge deploy、production release與 background row rewrite仍需人類重返 / release gate。

## Documentation Map Update - 2026-07-09

### Release Governance: Fixed TEST Environment + Level 3 Gate

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-037-fixed-test-environment-and-level3-release-gate.md` | Accepted | Release governance / Supabase / Firebase Hosting | 固定 `ProJED` 為 production、`ProJED-TEST` 為 staging/test/controlled blast-zone、Firebase Hosting `level3-smoke` preview 為正式部署前 Level 3 production-like smoke；AI 後續需自動判斷是否需要 Level 3，但 production deploy、Supabase Branch、破壞性測試與正式資料操作仍需明確授權。 |
| `ai-doc/release/LEVEL3-firebase-preview-supabase-test-runbook.md` | Active Fixed Runbook | Release governance / Level 3 smoke | 定義固定低成本路徑：staging build 指向 `ProJED-TEST`、部署到 Firebase preview channel `level3-smoke --expires 1d`、執行 HTTPS browser smoke、手動 auth/read-write/reload/cleanup smoke，並記錄證據。 |
| `scripts/verify-level3-firebase-preview.ps1` | Active Helper | Release governance / Level 3 smoke | 對 Firebase preview URL 執行 Playwright browser smoke；僅驗證 preview URL，不替代手動登入與 `ProJED-TEST` read/write cleanup smoke。 |
| `ai-doc/dev_task.md` | Release Gate Rule Updated | Release governance | Release Gate 指令已補固定規則：正式部署前預設需要 Level 3；`ProJED-TEST` 是固定測試環境與受控試爆場；Supabase Branch 預設不用，只保留明確授權例外。 |
| `ai-doc/decisions/ADR-037-fixed-test-environment-and-level3-release-gate.md` | Accepted / Local browser origin addendum | Local test runtime | 固定測試瀏覽器入口為 `http://localhost:4000/`；`127.0.0.1` 僅作 loopback bind、相容性 CORS 或歷史證據，並由 `npm run verify:local-origin` 防回歸。 |
| `ai-doc/dev_task.md` | DEV-080 完成／Local QA-QC PASS／未 Release | Local test runtime | 統一 launcher、Auth redirect、active browser verifier 與新 QA/QC 證據的 canonical origin；不改 production、DB loopback、P9／preview 或歷史 evidence。 |

PM 治理註記：本決策採 HCS 引導模式 `1B/2B/3B`。後續 AI 可自動判斷 Level 3 是否 required / not required / blocked；若判定 skip，必須記錄理由。此規則不授權自動 production deploy、不授權自動接受 Supabase Branch 成本、不授權在未備份下執行破壞性 `ProJED-TEST` 測試。

## Documentation Map Update - 2026-07-07

### DEV-046: 全任務表面拖曳一致化與拖曳把手退役

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-046-universal-task-surface-drag.md` | Implemented / Local Automated QA Passed / Production Not Authorized | DEV-046 / DEV-028 / DEV-029 / DEV-039 / DEV-044 | 定義並記錄桌機與手機所有階層 task surface 都從整個任務本體拖曳，不再依賴拖曳把手；已完成 WBS list、Kanban card、checklist row、task-backed column header、shared sidebar 與 workbench row-root implementation，並保留 click-to-details、桌機右鍵、手機 pan-first、mobile compact action rail、workbench row-root drag 與 undo grouping。 |
| `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md` | Automated QA Passed / Manual QC Not Executed / Physical-Phone Supplemental Not Executed / Production Not Authorized | DEV-046 | QA 真實操作驗證計畫與本機自動化證據，包含所有階層 desktop/list/card/checklist/workbench whole-surface drag、mobile quick tap / short pan / long press、deep hierarchy、interactive controls、permission、undo、visible error sweep 與極限操作測試；人工真機 supplemental 尚未執行。 |
| `ai-doc/dev_task.md` | DEV-046 Implemented / Local Automated QA Passed / Production Not Authorized | DEV-046 | 登錄 Human Decision Brief、授權邊界、RD Handoff Contract、Deferred Scope Audit、All-Phase Coverage Matrix、完成 gates 與未完成的人工真機 / production release 邊界。 |

PM 治理註記：DEV-046 是新的交付點，不能被視為 DEV-039 Phase 2A 的小修。DEV-039 只處理全域任務平台 row-root drag parity；DEV-046 擴大到桌機/手機、所有階層的列表/卡片/待辦清單任務 surface 與拖曳把手退役。2026-07-07 已完成本機 RD implementation 與 automated QA gates；production deploy、merge/PR/release artifacts 與手機實機 supplemental 仍未授權/未執行。

## Documentation Map Update - 2026-07-06

### Current Direct-Work Boundary

本輪續接 `[$dev-pm] 完成DEV-045開發` 時，`ai-doc/dev_task.md` 是唯一任務排序與授權入口。2026-07-12 DEV-045 Phase 1 shared condition UI / per-board Builder與 Phase 2 local v3 service / validator / Edge source已完成本機 RD/QA/QC。DEV-025 mutating DB QC、DEV-040 remote Edge / production injection、DEV-044 destructive recovery與 DEV-045 Phase 3/4仍需 Supabase、deployment-release-gate、人類重返或受控 production gate。

2026-07-09 使用者回報 DEV-028 人工親自點擊 QC 通過；後續開發排序不再把 DEV-028 manual QC 當作 active blocker，但 production deploy 仍需另行授權。`verify:remaining-external-gates` 是 read-only PM evidence，用來確認剩餘 gate 邊界未被誤關閉，不代表任一外部 Gate 完成。

| 類別 | 目前狀態 | 下一步 |
|---|---|---|
| 產品 RD | DEV-045 Per-Board v3 Phase 1-2 Local Implemented / Automated QA-QC Passed | 本機開發已完成；舊 v2 remote path frozen。需要發布時以 v3 source進入 Level 3與 deployment-release-gate。 |
| PM task board | Canonical Index Added / DEV-045 v3 Redirect Applied | `dev_task.md` 已補總任務清單；DEV-045 / DEV-037 維持同一行事曆 workstream；`verify:remaining-external-gates` 已更新為現行 v3 release-boundary evidence，仍只讀且不代表 remote gate 完成。其他 DEV 邊界不變。 |
| DEV-011 / DEV-012 | Done / Production Release Deployed / Production UI Smoke Passed | `verify:dev-011-012-production-ui-smoke-readiness` 與 guarded executor self-check 已通過；2026-07-09 使用者允許 production fixture 後第一次實跑揭露 `rag_sync_jobs` first-publish ordering 問題，已以 hotfix branch `codex/dev011012-rag-order-hotfix` commit `7704e2f` 走 release gate 部署。正式站載入 `assets/index-BkwGqGCZ.js` / `assets/index-BrAYM5iH.css`，重跑 production fixture smoke 通過，DB 查證 `published_record_found=true`、`record_task_links=2`、`rag_enabled=true`、`source_document_present=true`，cleanup 通過。 |
| DEV-025 | DB Read-only Preflight Passed / Fixture + Execution Readiness Gates Added / Guarded Mutating Executor Added / Mutating QC Pending | 正式 DB 已具備 RPC / grants / constraints；已新增 read-only fixture-readiness harness、execution-readiness static gate 與 guarded mutating executor self-check。下一步需 staging / disposable fixture 或 production-safe test workspace/board，先驗證腳本防呆、fixture 標記、最小資料形狀與 mutation opt-in，再驗證 RPC、RLS、audit log、資料一致性與 RAG visibility。 |
| DEV-028 | Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | `verify:dev-028-manual-click-qc-readiness` 已補 read-only checklist gate；2026-07-09 使用者回報 MAN-028-001 至 MAN-028-028 人工親自點擊通過，若需稽核級證據仍應補逐項截圖/錄影。 |
| DEV-035 | Supabase DB Role QC Passed / Production Not Deployed | `delete_workspace` owner/admin/member/viewer/outsider matrix、workspace list reload、tenant-scoped cascade 與 execute grants 已通過；production front-end release 需另行授權。 |
| DEV-037 / DEV-045 / DEV-040 | Calendar workstream + P0 guards | DEV-045 v3 Phase 1/2本機 RD/QA/QC已完成，舊 v2 remote gate frozen；DEV-037 v1 compatibility由 v3 materialization / feed regression承接；DEV-040 remote Edge仍走獨立 Supabase / release gate。 |
| DEV-038 / DEV-042 / DEV-044 | Production Release Deployed / Local + Production Smoke Passed | Firebase Hosting 正式站載入 `assets/index-BU14rK7W.js` / `assets/index-CYqvildz.css`；HTTP artifact check、production browser smoke 與 authenticated production UI smoke passed；DEV-042 真機驗證已由使用者回報通過。DEV-044 durable/destructive recovery 仍需另行 gate。 |
| DEV-045 | Production Released / Level 4 Passed / Cleanup Complete | 逐看板獨立filter snapshot、v3 DB / Edge、Firebase live、preview / ICS identity、token lifecycle、v1 client觀察與cleanup均已完成。 |

### DEV-045: 行事曆訂閱篩選器建構器與即時預覽

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md` | Per-Board v3 Phase 1-2 Local Implemented / Automated QA-QC Passed / Release Gate Required | DEV-045 / DEV-037 / DEV-039 | 逐看板 `board_filters`、shared controls、state isolation、batch copy、v1/v2 materialization、permission與 preview/feed parity已完成本機實作；v2 inheritance被 intentional replacement。 |
| `ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md` | Revised v3 QA Executed / Local Gates Passed / Release Gate Required | DEV-045 | 已執行 v3 UI、state、payload、compatibility、DB/Edge source、permission與 viewport驗證；舊 v2 passes維持歷史證據。 |
| `ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md` | Per-Board v3 Phase 1-2 Local QC Passed / Historical v2 Evidence Preserved | DEV-045 | 保存舊 v2事實，並新增 current v3 automated QC、local DB rollback、Deno與 regression evidence。 |
| `ai-doc/dev_task.md` | DEV-045 Phase 1-2 Local Complete / Phase 3-4 Release Gate Required | DEV-045 | 登錄完成狀態、current evidence、Deferred Scope Audit與 release re-entry boundary。 |

PM 治理註記：DEV-045 仍承接 DEV-037 的 source-scope / permission / feed safety，但 v3 不再使用 global / override。v1 rows保持可讀與原 feed；編輯時 materialize 成逐看板 draft，使用者預覽並儲存後才升級。預設所有當下可讀看板進入 snapshot，未來新增看板不自動進入既有外部連結。

### DEV-044: 上一步復原範圍擴充與低資料庫成本治理

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-044-undo-recovery-scope-expansion.md` | Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production Smoke Passed | DEV-044 / DEV-001 / DEV-028 / DEV-039 | 定義 ordinary undo 與 destructive recovery 分流；Phase 1 已擴充低成本 client-side command stack，Phase 2 safe slice 已加入 batch/reorder/placement command grouping；已發布 safe scope，不新增 DB history table，不把 workspace delete、權限、匯入覆蓋、AI 批次改寫或 board workspace transfer 納入一般 Ctrl+Z。 |
| `ai-doc/qa/QA-DEV-044-undo-recovery-scope-expansion.md` | Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production Smoke Passed | DEV-044 | 記錄 Phase 1 undo coverage、async/suppress stack guard、record snapshot restore、board stable id、editor history scope、service write count、Phase 2 batch/placement/reorder gate、destructive action exclusion cases 與 production release evidence。 |
| `ai-doc/qc/QC-DEV-044-undo-recovery-scope-expansion.md` | Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production QC Passed | DEV-044 | 記錄 DEV-044 本機 QC 事實與 release evidence：static 25/25、browser board title / suppress / record archive restore、Phase 2 batch/reorder/placement static gate、DEV-013/039/006 regression、TypeScript、production build、artifact/browser/auth smoke。 |
| `ai-doc/dev_task.md` | DEV-044 Phase 1 + Phase 2 Safe Slice Production Release Deployed / Local + Production Smoke Passed | DEV-044 | 登錄目前交付邊界：Phase 1 local ordinary undo 與 Phase 2 safe slice 已完成並發布；DB migration、durable recovery、board workspace transfer undo 與 destructive recovery 仍需另行 gate。 |

PM 治理註記：DEV-044 不是建立遠端歷史紀錄系統，而是先把既有 `useUndoStore` Command Pattern 擴充到高頻、低成本、可用既有 service 反向操作復原的範圍。Phase 1 + Phase 2 safe slice 已完成本機實作、自動化 gate 與 Firebase Hosting production release；資料庫費用 guardrail 仍是本 DEV 的一級驗收：push undo 不得新增遠端寫入；只有使用者真的按 undo / redo 時才執行等同正常操作的反向寫入。Durable recovery、跨裝置 undo、workspace / board delete 完整復原、board workspace transfer undo、權限 audit、匯入 rollback、AI 批次版本化仍需另行授權。

## Documentation Map Update - 2026-07-05

### DEV-042: 手機與桌機共用左側 Inline 面板排列

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-042-mobile-left-sidebar-offcanvas-collapse.md` | Shared Inline Width Alignment Local Verification Passed / Production Not Deployed | DEV-042 / DEV-039 / DEV-054 | 目前權威契約為手機與桌機共用同一 `Sidebar`／`TaskWorkbenchPanel`，且手機兩面板 computed width 必須一致；舊 Off-Canvas／234px／default-open 只保留歷史。 |
| `ai-doc/qa/QA-DEV-042-mobile-left-sidebar-offcanvas-collapse.md` | Shared Inline Width Alignment Local QA Passed / Production Not Deployed | DEV-042 / DEV-054 | 390／320 mobile 兩面板同寬、1440 desktop、單／雙面板、無 overlay/backdrop、Escape、visible error 與未歸位任務回歸均已驗證。 |
| `ai-doc/qc/QC-DEV-042-mobile-left-sidebar-offcanvas-collapse.md` | Shared Inline Width Alignment Local QC Passed / Production Not Deployed / Physical Supplemental Pending | DEV-042 / DEV-054 | static 22/22 + browser 8/8，390px=340px、320px=272px，且兩面板共用同一 width helper 與 viewport clamp；未部署 production。 |
| `ai-doc/dev_task.md` | DEV-042 Shared Inline Width Alignment Local Verification Passed / Production Not Deployed | DEV-042 | 共用元件、inline reflow 與手機工作區清單／全域工作台同寬契約均已本機驗證；production deploy 仍需另行 release gate。 |

PM 治理註記：2026-08-24 使用者明確要求手機面板不得覆蓋看板且不得另寫元件，因此 Shared Inline 契約是對 Off-Canvas、default-open、234px 與 128px gutter 的 `Intentional replacement`。本輪再依使用者指令補上手機 Sidebar 與 TaskWorkbench computed width 必須一致，兩者共用同一 width helper 與 viewport clamp；實際內容與狀態來源仍和桌機共用。未歸位任務可由 Workbench 跨 inline 邊界拖入看板，placed row 不可拖。本輪 width alignment 已完成本機驗證，未部署；2026-07-06 production／真機證據只代表舊 Off-Canvas 版本。DB schema、migration、RLS/RPC、完整 Sidebar IA redesign 不在本輪範圍。

### DEV-028 Addendum: 任務名稱僅限詳情頁編輯

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Detail-Only Title Edit Addendum Implemented / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 / DEV-029 | 任務名稱唯一編輯入口已落到 `TaskDetailsModal` / 任務詳情頁 title input；看板卡片、L3+ 待辦列、工作台排序列、清單列、甘特列與心智圖節點不再提供 pencil、F2、`t`、右鍵重新命名、雙擊標題或直接打字 rename。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | Detail-Only Title Edit QA Updated / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 / DEV-029 | 更新 Zero-Tolerance、MAN-028、FMEA 與 QC handoff evidence；`verify:dev-028-manual-click-qc-readiness` 保護人工 checklist 與證據邊界；自動化已覆蓋外層 task surface 無 rename、詳情頁 title edit、context menu 無重新命名、新增任務導向詳情 title edit、DEV-029 mobile pan-first regression；2026-07-09 使用者回報人工親自點擊通過。 |
| `ai-doc/qc/QC-DEV-028-detail-only-title-edit-addendum.md` | Local Automated QC Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 / DEV-029 | 記錄本輪 RD/QC 事實驗證、通過命令、manual readiness gate、lint 既有 unrelated blocker、production 未部署與 2026-07-09 使用者回報 MAN-028 人工親自點擊通過。 |
| `ai-doc/dev_task.md` | DEV-028 Addendum Implemented / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed / Production Not Deployed | DEV-028 | 記錄授權邊界：已完成產品碼與 verifier 實作，並新增 manual readiness gate；2026-07-09 使用者回報人工親自點擊 QC 通過；production deploy、schema/migration 另行 gate。 |

PM 治理註記：本 addendum 取代 DEV-028 舊版「明確改名入口 / 桌機直接打字 / 手機命名鍵盤 / 外層 rename」契約。本輪已依使用者授權完成 RD：任務名稱編輯集中到任務詳情頁 title edit；外層任務 surface 只負責開詳情、拖曳、選取與其他非 rename 控制。資料模型、DB schema、production deploy 不在本輪授權範圍。

### DEV-029 Addendum: 手機精簡任務操作列與長按拖放

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Phase 1B Implemented / Local Automated QA Passed / Production Not Deployed / Hotfix Covered | DEV-029 / DEV-028 | 依 HCS `1B 2B 3A` 完成手機限定 addendum：手機長按任務後任務浮起，viewport 上方顯示有文字標籤的 compact action rail；只保留標示完成/取消完成、新增同階、新增下層、刪除；可拖曳到任務位置排序，也可 drop 到低風險操作；drop 到刪除只開確認。2026-07-05 已補手機拖曳把手短滑 pan、把手長按分流、drag-action 邊緣 auto-scroll 與 touchcancel / pointercancel / blur / visibility / Escape / timeout 退出不卡死。電腦版完全不改。 |
| `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Phase 1B Local Automated Browser QA Passed / Physical Phone Supplemental Not Executed / Hotfix Covered | DEV-029 | 新增並執行 QA-029-I 與 hotfix 可自動化案例，驗證手機頂部文字 compact action rail 精簡、任務浮起、拖曳排序、手機拖曳把手短滑 pan、拖曳把手長按進 mobile action mode、drag-action 右邊緣 auto-scroll board、欄位底部 auto-scroll column、touchcancel 退出不卡死、drop 到完成/新增下層/刪除確認、短滑 pan 不被破壞、quick tap 開詳情、工作台列長按 action rail 與桌機 click regression。 |
| `ai-doc/dev_task.md` | DEV-029 Addendum Implemented / Local Automated QA Passed / Production Not Deployed | DEV-029 | 記錄本輪已授權並完成產品程式碼、verifier 與本機自動化 QA；production deploy、schema/migration、手機非 board modes 與 physical-phone supplemental 仍未授權 / 未執行。 |

PM 治理註記：DEV-029 Phase 1B 是 mobile-only interaction addendum，不推翻 Phase 1 pan-first。短滑仍優先 pan，quick tap 仍開詳情，長按才進 drag-action mode。刪除、改名、指派、依賴、複製、升降階等桌機或高風險功能不得回流到手機 compact action rail；桌機 context menu 必須保持原樣。本輪 RD implementation、拖曳把手 / touchcancel 防卡死 hotfix、edge auto-scroll hotfix 與 local automated QA 已完成；production deploy 與 physical-phone supplemental 尚未執行。

### DEV-041: PWA 更新通知與快取恢復

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md` | Production Release Deployed / Local + Production Smoke Passed / One-Click Latest Local Hotfix Passed | DEV-041 / DEV-034 | 定義並實作正式部署前的新版本可見更新提示、更新按鈕、PWA lifecycle state、stale chunk/cache recovery、reload loop guard、ErrorBoundary recovery 整合、DEV-034 regression 與 production release gate 邊界；2026-07-07 已補一鍵更新到最新版 local hotfix，production redeploy 未執行。 |
| `ai-doc/qa/QA-DEV-041-pwa-update-notification-cache-recovery.md` | Local + Production QC Passed / Production Release Deployed / One-Click Latest QA Updated | DEV-041 / DEV-034 | 規劃 static/browser QA：`onNeedRefresh` 顯示更新提示、更新按鈕 latest reload flow、dismiss/later、offline ready、chunk-load recovery、cache clear scope、ErrorBoundary integration、mobile/desktop UI、accessibility、DEV-034 regression、TypeScript/build 與 production deploy evidence 禁止過度宣稱。 |
| `ai-doc/qc/QC-DEV-041-pwa-update-notification-cache-recovery.md` | Production Release Deployed / Local + Production QC Passed / Mobile Visibility Hotfix Passed / One-Click Latest Local Hotfix Passed | DEV-041 / DEV-034 / DEV-039 / DEV-029 | 記錄 release boundary、local QC、production build artifact、pre-deploy production-like smoke、Firebase deploy、post-deploy HTTP/browser smoke、authenticated production UI smoke、mobile update visibility hotfix、2026-07-07 one-click latest local hotfix、residual risks 與 rollback target。 |

PM 治理註記：DEV-041 已完成 Phase 1 implementation、local QC 與 Firebase Hosting production release；正式站 `https://projed-cc78d.web.app/` 已於 hotfix 後載入 `assets/index-BXtRfIba.js` 並通過 post-deploy browser smoke。手機未看到更新提示的缺口已補：app shell bundle hash check、`updated` state 與「已更新到新版」提示。2026-07-07 已完成 local one-click latest hotfix：使用者按更新時清 app Cache Storage / service worker registration 後 reload 最新 app shell，避免 stale queued worker callback；此 hotfix 尚未部署 production。強制更新、release notes 後端、版本 API、analytics、push/email notification、DB schema / migration / RLS / RPC 不屬於目前授權範圍。

## Documentation Map Update - 2026-07-04

### DEV-029: 手機 Pan-First 觸控手勢仲裁

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Phase 1 + Phase 1B Implemented / Local Automated QA Passed / Production Not Deployed / Hotfix Covered | DEV-029 / DEV-028 | 定義並記錄手機 coarse pointer 的 pan-first 手勢仲裁：任務卡、子任務列、欄位、空白處與手機拖曳把手短滑優先移動畫面並 suppress click-through；手機 task surface 無位移 tap 仍開任務詳情；長按進入 compact action rail 與 drag-action mode，可排序、完成、新增下層、刪除確認；drag-action 靠近 board / column 邊緣會 auto-scroll；touchcancel / pointercancel / blur / visibility / Escape / timeout 可退出不卡死；桌機不變。 |
| `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Phase 1 + Phase 1B Local Automated Browser QA Passed / Physical Phone Supplemental Not Executed / Hotfix Covered | DEV-029 | 驗證手機任務卡主體、L2+ 子任務列與拖曳把手不需找縫隙即可 pan，短滑不得開 `TaskDetailsModal`、rename、context menu 或 drag；L2+ 垂直/水平 pan 需產生 `scrollTop` / `scrollLeft` 位移；Phase 1B compact action rail、長按浮起、把手長按、edge auto-scroll、touchcancel 退出、drop target、工作台列與桌機不變回歸均已納入 browser matrix；真機 H01-H04 未執行。 |
| `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QC Passed / Physical Phone Supplemental Not Executed / Production Not Deployed / Hotfix Covered | DEV-029 | 記錄 RD 修正、DEV-029 static 32/32、browser matrix 覆蓋 L2+ scroll displacement、手機拖曳把手短滑 pan、把手長按、edge auto-scroll、touchcancel 退出不卡死、DEV-028 regression、TypeScript、build:test evidence；明確標示未執行 production deploy、Phase 2 與 physical-phone supplemental cases。 |
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Compatibility Note Added for DEV-029 / Existing Implementation Preserved | DEV-028 / DEV-029 | 補充手機相容例外：DEV-028 的單擊開詳情仍治理桌機與一般 cross-mode 契約，但手機 coarse pointer 的任務卡短滑安全由 DEV-029 優先；長按任務操作選單仍保留。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | Compatibility Note Added for DEV-029 / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 / DEV-029 | 補充 QA 相容註記：MAN-028 mobile cases 若在 DEV-029 實作後執行，需把手機短滑任務卡不開詳情納入零容忍；手機 tap-to-details 不得覆蓋 pan-first；manual readiness gate 已保護 checklist 與 evidence boundary；2026-07-09 使用者回報人工親自點擊通過。 |

PM 治理註記：DEV-029 是 DEV-028 mobile interaction follow-up，不推翻桌機 click-to-details，也不取消手機 quick tap 開詳情。Phase 1 已依使用者要求完成 RD implementation 與本機 automated/browser QC；真機回饋後已恢復手機無位移 tap 開詳情。2026-07-05 Phase 1B 已完成手機 compact action rail 與長按拖放實作及本機自動化 QA；同日依真機回饋補強手機拖曳把手 pan pass-through、drag-action edge auto-scroll、touchcancel / pointercancel / blur / visibility / Escape / timeout 退出防卡死，並通過本機 browser QA。production deploy、手機非 board modes 重新開放、再次取消或重定義手機 tap-to-details、桌機 context menu 修改仍需要使用者另行授權。H01-H04 physical-phone 補充案例尚未完整執行，不得宣稱真機手感已簽核。

### DEV-039 Phase 2A Addendum: 全域任務平台任務列拖曳觸發窗口一致化

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Phase 2A Implemented / Local Automated QC Passed / Release Not Authorized | DEV-039 / DEV-028 / DEV-029 | 已完成 `已歸位任務` 與 `未歸位任務` 拖曳觸發窗口一致化，採未歸位任務的整列 root 觸發方式為主；只收斂 `TaskWorkbenchPanel.WorkbenchDragCard` row shell / root hit area，保留左鍵詳情、右鍵 `GlobalContextMenu`、手機長按 compact action rail、hierarchy cue 與日期資訊，不改 sensor、資料模型、DB/RLS/migration 或 production deploy。 |
| `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2A QA Passed / Local Automated QC Passed | DEV-039 | 已執行真實操作驗證：static gate 檢查兩種 row root 都掛 draggable/touch/click/context-menu bindings，browser gate 驗證未歸位 row 與所有任務排序 row 的左側、title 中段、右側三個 sample points 都命中 row root，並以真實雙向 placement drag 覆蓋拖曳流程；同時驗證右鍵選單與 `Escape`、left click details、mobile long press action rail、DEV-028/029/039 regression、TypeScript 與 build。 |
| `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2A Local Automated QC Passed / DB-Unchanged / Production Not Deployed | DEV-039 | 記錄 Phase 2A static 30/30、browser row-root hit-test、shared right-click menu、真實雙向 placement drag、DEV-028/029 regression、TypeScript 與 `build:test` evidence；明確標示未執行 DB/RLS/migration、production deploy 或手機新手勢。 |

PM 治理註記：本 addendum 已完成產品碼與本機自動化 QC，不代表 production release 已完成。若後續實作需要改 sensor、資料模型、DB/RLS/migration、production deploy 或手機新手勢，必須停止並回到人類授權。

### DEV-039 Phase 2 Addendum: 全域任務平台跨看板資料來源與刪除有效可見性

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Phase 2 Cross-Board Source Slice Implemented / Local Automated QC Passed / DB-Unchanged | DEV-039 / DEV-028 / DEV-036 | 依使用者確認的系統架構完成 Phase 2 cross-board source / deletion effective visibility slice：`所有任務排序` 跨所有可見看板顯示任務，不再只依 active board；資料源由 `listWorkbenchTasks()` / `mergeUnplacedTasks()` / `isTaskEffectivelyVisible()` 形成，排除 archived task、archived ancestor descendant、missing-parent orphan，並以 `列表 / 群組` 顯示設定控制 `group/list` 容器；任務台清單採 dense text rows，移除大卡片、獨立拖曳圖示與日期 chip，以縮排/字重呈現 hierarchy depth，`未歸位` / `所有任務排序` 為 sticky section headers，collapsed rail 與 expanded collapse button 改為 chevron pair。 |
| `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2 Cross-Board Source Slice QA Passed / Partial-Error UI Follow-up Not Authorized | DEV-039 | 補入並驗證 Phase 2：active board independence、active board switch stability、filter selected board semantics、deleted task removal、archived ancestor removal、group/list 預設不顯示與手動顯示、missing-parent orphan 排除、dense text rows、hierarchy indentation、sticky section headers、compact collapsed rail、整列拖移、unplaced merge identity、source overwrite guard、browser cross-board/deletion proof；visible partial/error summary、RPC/RLS/migration、production smoke 未納入本輪。 |
| `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 2 Cross-Board Source Slice Local Automated QC Passed / DB-Unchanged / Production Not Deployed | DEV-039 | 記錄 cross-board source static/browser verifier、group/list 顯示設定與 orphan 殘留 hardening、dense text row placement regression、sticky section header scroll proof、compact collapsed rail / expanded chevron collapse proof、parity regression、TypeScript、build:test evidence；明確標示未執行 Supabase RPC/RLS/migration、正式資料修復/刪除與 production deploy。 |

PM 治理註記：本次已依使用者 `執行開發` 授權完成 DEV-039 Phase 2 的前端 / local-test / existing-service adapter slice，不代表已授權 remote migration、RLS/RPC、production deploy、正式資料修復或資料刪除。Visible partial/error summary UI 仍是 follow-up；若需要 Supabase RPC/RLS/migration、正式資料修復或資料刪除，必須停下走 human re-entry 與對應 gate。

## Documentation Map Update - 2026-07-03

### DEV-040: 正式環境同型 BUG 風險硬化與驗證

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-040-production-environment-risk-hardening.md` | Production Release Deployed / Original BUG Smoke Passed / P0 Local Addendum Implemented / P0 Remote Read-only Preflight + Remote Readiness Static Gate Passed / Extended Matrix Partially Covered | DEV-040 / DEV-011 / DEV-020 / DEV-027 / DEV-037 / DEV-039 | 依正式環境 2 個已發生 BUG 推導同型風險，定義 7 個高風險點：備份匯入 dependencies、RAG timeout、新增看板 temp id race、member stale response、tag stale response、Google Calendar timeout、MindMap localStorage-only 語意；包含 End-State、Architecture Memory Capsule、Phase Roadmap、RD Handoff Contract、Deferred Scope Audit 與 All-Phase Coverage Matrix。原 hotfix slice 已部署 production，原始 2 BUG flow 正式站 smoke 通過；2026-07-06 補 P0 本機 addendum；2026-07-07 production read-only preflight 與 remote-readiness static gate 確認 DB substrate 與本機 Edge/source governance，但 remote Edge 尚未部署 timeout guard。 |
| `ai-doc/qa/QA-DEV-040-production-environment-risk-validation.md` | QA Plan Complete / Local + P0 Addendum QC Executed / P0 Remote Read-only Preflight + Remote Readiness Static Gate Passed / Production Smoke Executed for Original BUG Flows | DEV-040 | 針對 7 個正式環境風險制定 FMEA、P0/P1/P2 測試案例、local / production-like / production smoke evidence 要求，以及 regression gate；已完成原始 2 BUG production authenticated UI smoke、2026-07-06 P0 local addendum QC、2026-07-07 P0 read-only production preflight 與 remote-readiness static gate。 |
| `ai-doc/qc/QC-DEV-040-production-environment-risk-validation.md` | Production Release Deployed / Production Authenticated UI Smoke Passed for Original BUG Flows / P0 Local Addendum QC Passed / P0 Remote Read-only Preflight + Remote Readiness Static Gate Passed / Extended 7-Point Matrix Partially Covered | DEV-040 / DEV-011 / DEV-020 / DEV-027G / DEV-028 / DEV-039 | 記錄 local/source/browser QC、Firebase Hosting deploy、artifact hash、post-deploy smoke、Supabase P5/P6 smoke、OAuth start smoke、正式站 authenticated UI smoke、P0 local addendum、P0 production read-only preflight 與 remote-readiness static gate；原始 2 BUG flow 通過，Edge deploy、production timeout injection、完整 DB count smoke 與 member/tag/Google Calendar/MindMap 等延伸矩陣剩餘項未過度宣稱。 |

PM 治理註記：DEV-040 是正式環境同型 BUG 風險硬化交付點，來源為「本機測沒問題、正式環境才卡住或資料消失」的系統性差異。本輪已完成 local/source/browser automated QC、Firebase Hosting production deploy、原始 2 BUG 正式站 authenticated UI smoke、P0 production read-only preflight 與 remote-readiness static gate；可宣稱原始 2 BUG flow 已通過 production smoke，且 production DB 具備依賴資料 substrate，本機 Edge/source governance 已可進入受控 deploy gate。不得宣稱 RAG timeout 已 live-protected，因 remote Edge Function 尚未部署本地 timeout guard；也不得宣稱 7 點延伸矩陣全部關閉。member/tag stale、Google Calendar REST timeout、MindMap 跨裝置語意與完整備份匯入 DB count 仍需後續專項驗證。

## Documentation Map Update - 2026-07-02

### DEV-039: 任務過濾器核心與全域任務平台兩欄篩選重構

2026-08-04 status-filter refresh addendum：狀態資料立即儲存；只有直接任務或此次 ancestor roll-up 在目前 filter 下的 membership 確實改變時，共用 filter projection 才保留變更前狀態，直到使用者點擊工具列 `更新`。變更前後都命中或都不命中時不顯示更新；membership 回到既有投影時取消 pending。過濾器與更新區以共同外框、零間距及內部分隔線形成複合控制，整組位於復原／重做左側，並以唯一直接變更任務數 badge 溝通。無待更新項目時隱藏更新區，手機使用圖示 + badge。此項是對「任何狀態變更都顯示更新」的 `Intentional replacement`，未修改資料格式、schema 或 production。

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md` | Phase 1/1A Implemented / Local Automated QC Passed / Phase 1B Implemented / Local Automated QC Passed / Phase 1C Implemented / Local Automated QC Passed / Phase 2 Cross-Board Source Slice Implemented / Local Automated QC Passed / Phase 2A Drag Trigger Parity Implemented / Local Automated QC Passed / Phase 2B Production Migration and Deploy Complete / Authenticated Smoke Pending / All-Phase Coverage Complete | DEV-039 / DEV-027D / DEV-028 / DEV-029 / DEV-036 | 定義任務過濾器共用核心、看板任務視圖一致化、顯示設定與過濾條件分離、全域任務平台單一過濾器入口：主畫面一顆 `過濾器` 按鈕，popover 內選看板並調同看板過濾器；Phase 1B 已補回未歸位 / 已歸位看板 placement lanes、雙向拖移與未歸位任務功能等價；Phase 1C 已完成 filter result parity 實作與本機自動化 QC；Phase 2 cross-board source slice 已完成 `listWorkbenchTasks()` / `mergeUnplacedTasks()` / `isTaskEffectivelyVisible()` / scoped `setNodes()`；Phase 2A 已完成未歸位與所有任務排序 row 使用一致 root drag surface，保留左鍵詳情、右鍵選單、手機長按、hierarchy cue 與日期資訊；Phase 2B 已完成未歸位任務的帳號歸屬 migration/service、RLS contract、一次性 local merge、production migration/readback 與 Firebase deploy；authenticated two-device smoke 待補；profile/storage/copy UI 仍取消。 |
| `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 1/1A QA Passed / Phase 1B QA Passed / Phase 1C QA Passed / Phase 2 Cross-Board Source Slice QA Passed / Phase 2A QA Passed / Local Automated QC Passed / All-Phase Coverage Complete | DEV-039 | 驗證計畫涵蓋共用 predicate、active filter count、五視圖一致性、Workbench 單一過濾器按鈕與 popover 內看板/過濾器、未歸位 / 已歸位看板 placement lanes、雙向拖移、任務卡功能等價、Phase 1C matchedTaskIds 結果一致、context-only ancestor、負責人 option source 對齊、Phase 2 cross-board source truth、deleted task removal、archived ancestor removal、group/list 顯示設定、missing-parent orphan 排除、source overwrite guard、Phase 2A row-root drag hit area、禁止 profile/save/copy UI、mobile viewport gates、phase exit rules 與 deferred verification audit。 |
| `ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md` | Phase 1/1A + Phase 1B + Phase 1C + Phase 2 Cross-Board Source Slice + Phase 2A Drag Trigger Parity Local Automated QC Passed / Phase 2B Production Migration and Deploy Passed / Authenticated Smoke Pending | DEV-039 | 記錄 DEV-039 static/browser/regression/TypeScript/build gates、Phase 2B migration history、RLS table/policy/grant readback、Firebase deploy 與 Level 4 artifact provenance smoke；production OAuth feature smoke 因無安全測試帳號待人工補測。 |

PM 治理註記：DEV-039 採使用者最新一顆按鈕方案。全域任務平台是 BoardView 左側跨看板拖拉工作流，不得改成獨立整頁 route；工作台主畫面只保留 `過濾器` 按鈕，點開 popover 後才選看板並調同看板過濾器，讓使用者看板一個一個設定。Popover 內看板欄只切換正在設定哪個看板的過濾器；`所有任務排序` 目標是跨所有可見看板顯示，依各任務所屬看板套用該看板 filter state；看板 selector 不得與過濾器按鈕並列常駐在主畫面，也不得被當成來源範圍。`未歸位` 與 `已歸位看板` 是 placement lanes，不是過濾器或任務狀態；未歸位任務與已歸位任務功能等價且可雙向拖移，Phase 1B 已通過本機自動化 QC。Phase 1C 已完成實作與本機自動化 QC：同看板同條件下，看板與工作台必須以同一組 `matchedTaskIds` 作為結果真相；看板的祖先欄位 / 卡片可作 context-only container，工作台不得列為符合結果。Phase 2 cross-board source slice 已完成：`所有任務排序` 不再只取 active board，刪除 task / archived ancestor descendant 不得殘留；依 HCS `1C` 決策，`group/list` 容器預設不顯示但可由 `列表 / 群組` 顯示設定切換，missing-parent orphan 永遠不得當成有效任務；依使用者 UI 決策，任務台清單採密集文字列，移除不必要圖示、拖曳把手、大卡片、陰影與日期 chip，只保留文字資訊，並以縮排/字重/灰階提示 hierarchy depth；`未歸位` 與 `所有任務排序` 是 sticky section headers，不得被任務列捲動隱藏；collapsed rail 使用 `ChevronRight`，expanded collapse button 使用 `ChevronLeft`，不得回到 Notebook/clipboard/PanelLeftClose 類圖示卡片。Phase 2A 已完成工作台任務列 row-root drag surface parity 與 shared right-click menu，未改 sensor 或手機手勢。Phase 2B 已完成 account-owned unplaced-task slice、production migration/readback、Firebase deploy 與 Level 4 artifact smoke；authenticated two-device smoke 待補。profile、設定檔、儲存、另存、複製、全域/看板專屬 profile 已取消，不得回流到本 DEV。

## Documentation Map Update - 2026-06-29

### DEV-038: 設定中心作用範圍一致性與高風險防呆

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-038-settings-scope-consistency-and-risk-guardrails.md` | Production Release Deployed / Local + Production Smoke Passed / DB unchanged | DEV-038 / DEV-036 / DEV-037 | 定義並已實作設定中心共同作用範圍 taxonomy，將目前看板、目前工作區、全域快照、外部連結、此裝置/目前帳號分清楚；特別處理備份全域匯出、目前看板匯入、目前看板回收桶與快速開啟的範圍語意；已發布 production。 |
| `ai-doc/qa/QA-DEV-038-settings-scope-consistency-and-risk-guardrails.md` | Production Release Deployed / Local + Production Smoke Passed / DB unchanged | DEV-038 | 驗證計畫與證據涵蓋 Settings header、section scope summary、匯入前確認、目前看板回收桶清空確認、看板權限 target、快速開啟裝置/帳號範圍、mobile viewport、regression gates 與 production release evidence。 |
| `ai-doc/qc/QC-DEV-038-settings-scope-consistency-and-risk-guardrails.md` | Production Release Deployed / Local + Production QC Passed / DB unchanged | DEV-038 | 記錄 DEV-038 static/browser/regression/TypeScript/build gates 與 production artifact/browser/auth smoke，並標示 DEV-037 source-scope Edge/DB contract 尚未執行。 |

PM 治理註記：DEV-038 是設定中心的橫向 IA 修正，優先保護高風險資料操作。本輪已完成本機 RD + QC 與 Firebase Hosting production release，未修改資料格式、DB schema、RLS 或 migration。DEV-037 繼續處理行事曆訂閱的資料來源契約；DEV-038 不重複其 Edge Function / DB validation 範圍。

### DEV-037: 行事曆訂閱來源範圍清晰化

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-037-calendar-subscription-source-scope-clarity.md` | Implemented / Local Automated QC Passed / DB Deploy Pending / Production Not Deployed | DEV-037 / DEV-036 | 定義並已本機實作行事曆訂閱來源範圍模型，將 `目前看板`、`工作區全部看板`、`自訂範圍` 與 `來源 / 條件` summary 分清楚；filters 已支援 `scope_type` / `project_ids`，Edge Function 原始碼與 DB validation migration 已限制 Board scope 不外溢。 |
| `ai-doc/qa/QA-DEV-037-calendar-subscription-source-scope-clarity.md` | Implemented / Local Automated QC Passed / Supabase Live QC Pending | DEV-037 | 驗證計畫涵蓋 UI source summary、legacy subscription、Board scope ICS feed、Workspace scope 權限、DB validation、Edge Function、mobile viewport 與 Settings/Workspace regression gates；本輪完成 local automated gates，live Supabase DB/feed smoke 待 deploy gate。 |
| `ai-doc/qc/QC-DEV-037-calendar-subscription-source-scope-clarity.md` | Local Automated QC Passed / DB Deploy Pending / Production Not Deployed | DEV-037 | 記錄 DEV-037 static/browser/ICS/regression/TypeScript/build:test gates；明確標示 migration 未 apply、Edge Function 未 deploy、真 Supabase feed smoke 未執行。 |

PM 治理註記：DEV-037 是 DEV-036 Trello-like Workspace 模型在行事曆訂閱功能上的語意落地。本輪已完成本機 RD/QC 與 migration/function source，未套用遠端資料庫、未部署 Edge Function、未做 production smoke；正式啟用需另走 deployment-release-gate / Supabase gate。

### DEV-036: Trello-like Workspace Governance

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/decisions/ADR-036-trello-like-workspace-governance.md` | Accepted | DEV-036 | 記錄採用 Trello-like Workspace 模型的架構決策：Workspace 是可新增的多 Board 治理容器，不限制為「我的工作區 / 共用工作區」兩筆固定資料；Board sharing 不等於 Board moving。 |
| `ai-doc/specs/SPEC-036-trello-like-workspace-governance.md` | Implemented / Local Automated QC Passed / DB unchanged | DEV-036 | 定義 DEV-036 End-State Architecture、Phase Roadmap、Fixed/Deferred Decisions、Phase 1 Workspace Create / Navigation MVP、Sidebar `+` 入口、backend-success-first create、First-run `我的工作區` 與 RD exit gate；Phase 1 已實作並通過本機自動化 QC。 |
| `ai-doc/qa/QA-DEV-036-trello-like-workspace-governance.md` | Local Automated QC Passed | DEV-036 | 驗證 Trello-like Workspace 治理模型，涵蓋多 Workspace 建立、create failure no-ghost、reload persistence、Board 建立/分享/搬移、Sidebar/Home 文案、mobile viewport 與回歸 gate。 |
| `ai-doc/qc/QC-DEV-036-trello-like-workspace-governance.md` | Local Automated QC Passed / DB unchanged | DEV-036 | 記錄 DEV-036 static、browser、DEV-035/030/025/026 regression、TypeScript、build 與 mobile 截圖證據；明確標示本 Phase 未新增 migration、RLS、billing 或 production deployment。 |

PM 治理註記：DEV-036 取代「只做我的工作區 / 共用工作區兩項」的舊方向。新方向是 UI 與資料模型均保留多 Workspace 能力；「我的 / 共用」若保留，只能作為 filter/view，不是固定資料容器。2026-06-29 HCS 引導決策已採 `1A / 2A / 3A`：Sidebar 工作區標題列 `+` 入口、Workspace create backend-success-first、First-run 建立 `我的工作區` 並允許後續多 Workspace。Phase 1 已實作 UI / store / local-test 驗證，不含 DB migration、RLS 或 production。

### DEV-035: 工作區刪除持久化修正

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-035-workspace-delete-persistence-fix.md` | Implemented / Local Automated QC Passed / Supabase DB Role QC Passed / Production Not Deployed | DEV-035 | 定義工作區刪除後重新整理又出現的根因與修正方案：Supabase owner-only delete RPC、前端後端成功後才移除 UI、失敗 toast、active workspace/board/localStorage cleanup；2026-07-06 補 production Supabase DB role QC。 |
| `ai-doc/qa/QA-DEV-035-workspace-delete-persistence-fix.md` | Local Automated QC Passed / Supabase DB Role QC Passed / Production Not Deployed | DEV-035 | 驗證計畫涵蓋 static contract、local-test browser reload persistence、active workspace cleanup、Supabase owner/admin/member/viewer/outsider DB QC、failure-mode 與 regression gates；DB role matrix 已通過。 |
| `ai-doc/qc/QC-DEV-035-workspace-delete-persistence-fix.md` | Local Automated QC Passed / Supabase DB Role QC Passed / Production Not Deployed | DEV-035 | 記錄 DEV-035 static、browser、TypeScript、build、core regression、DEV-030 context menu regression、mobile 截圖與 production Supabase rollback-only DB role QC；另記錄 migration history drift 未覆寫 function。 |

PM 治理註記：DEV-035 是 P0 data consistency bug 交付點。此任務不重做工作區分組 UI、不新增回收桶；重點是把刪除成功定義改回「後端持久化成功」，並讓失敗可見。2026-07-06 已完成 target production Supabase DB role QC；production front-end release 仍需另行授權。

### SPEC-034: App 快速啟動、PWA 更新與加入主畫面指引 UX

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md` | Done / Browser QC Passed / Local-first scope / QuickCaptureShell Retired | DEV-034 | 彙整本對話中對 App 開啟等待、出差臨時快記、PWA 自動更新、加入主畫面指引過於複雜的分析與開發方案；目前保留 PWA 安裝助理、設定頁快速開啟入口與本機 pending InboxItem queue；AuthGate 外 QuickCaptureShell 已由 DEV-039 全域任務平台 `未歸位` lane 取代。 |
| `ai-doc/qc/QC-DEV-034-fast-start-pwa-install-guidance.md` | Browser QC Passed | DEV-034 | 記錄 DEV-034 static、browser、TypeScript、lint、build 與截圖證據；明確排除正式雲端 Inbox、跨裝置同步與轉正式任務。 |

PM 治理註記：使用者已要求 `pm-dev 執行開發`，SPEC-034 提升為 `DEV-034 [交付點] App 快速啟動與加入主畫面 UX`。本輪安裝引導已通過 Browser QC；右下角 QuickCaptureShell 浮窗已退役，local-first pending queue 僅作全域任務平台未歸位資料來源。正式雲端 Inbox、跨裝置同步、今日區塊與轉正式任務不在本輪宣告完成，接 SPEC-002 後續交付。

## Documentation Map Update - 2026-06-26

### DEV-028: 四模式一致的 Trello-like 任務操作契約

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Implemented / 2026-07-05 Addendum Supersedes Rename Contract | DEV-028 | 定義清單、心智圖、看板、甘特四模式共用任務操作契約：單擊 = 選取 + 開詳情、保留 `TaskDetailsModal`、右鍵/長按任務選單、保留看板 Level 3+ 正面顯示與卡片資訊密度。2026-07-05 addendum 已取代舊版外層 rename / 直接打字命名契約，任務名稱只能在詳情頁 title edit。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | QA Plan Updated / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 | 定義 DEV-028 Zero-Tolerance failures、四模式手動驗證矩陣、自動化 gate、MAN-028 人工親自點擊測試矩陣、ESC 關閉最上層暫時性 UI 與 QC handoff evidence；2026-07-06 已完成外層 rename 移除與詳情頁 title edit 自動化驗證，2026-07-07 已補 manual readiness gate，2026-07-09 使用者回報人工親自點擊 QC 通過。 |

DEV-028 已依 HCS 引導決策 1A / 2C / 3A / 4A / 5A / 6A 實作：快捷鍵採模式優先、右鍵/長按統一任務選單、單擊既有任務先選取再開詳情、保留 `TaskDetailsModal`、選取視覺採最小 highlight / ring。2026-07-05 使用者追加決策已取代 2C 與 explicit rename 相關契約：新增任務命名與既有任務改名都不得使用外層 rename，需進入詳情頁 title edit。2026-07-06 已完成 RD implementation 與本機 automated QC；使用者後續要求補人工親自點擊操作驗證，QA-DEV-028 已新增 MAN-028-001 至 MAN-028-028，2026-07-07 已補 `verify:dev-028-manual-click-qc-readiness` 保護 checklist 與 evidence boundary，2026-07-09 使用者回報人工親自點擊 QC 通過；production deploy 仍需另行授權。

## Documentation Map Update - 2026-06-19

### DEV-027F: Mind map UI polish after relationship-line QC

| Document | Status | DEV | Purpose |
|---|---|---|---|
| `ai-doc/qc/QC-DEV-027F-mindmap-ui-polish.md` | Browser QC Passed | DEV-027F | Records UI failures, fixes, screenshot evidence, and browser gate for viewport-safe relationship-line UI polish. |

### DEV-027E: Xmind-like note relationship line UX parity

2026-06-19 completion map:

| Document | Status | DEV | Purpose |
|---|---|---|---|
| `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md` | Implemented | DEV-027E | Defines Xmind-like note relationship line parity scope and non-goals. |
| `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Executed | DEV-027E | Defines strict UI verification matrix for inline edit, endpoints, control points, style, shortcut, right-click, and zoom. |
| `ai-doc/qc/QC-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Browser QC Passed | DEV-027E | Records static/browser/type/lint/build/regression evidence. |

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md` | Implemented / Browser QC Passed | DEV-027E | 定義並已落地 ProJED 筆記型關聯線與 Xmind Relationship 的 UI/UX parity、資料延伸與 RD exit gate |
| `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md` | Browser QC Passed | DEV-027E | 驗證關聯線本體選取、inline label edit、endpoint/control point 拖曳、樣式控制、快捷鍵與 zoom 穩定性 |

### DEV-027D: Mind map date display and existing filter integration

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027D-mindmap-date-display-filter.md` | Shared Kanban Visual Addendum Implemented / Browser QC Passed | DEV-027D | 心智圖日期與既有 filter 契約；2026-09-03 起日期共用 `TaskDateBadge checklist`、標題共用狀態色，保留 `showStartDate` 與 metadata |
| `ai-doc/qa/QA-DEV-027D-mindmap-date-display-filter.md` | Shared Visual Addendum Browser QC Passed | DEV-027D | QA 驗證矩陣涵蓋共用元件、一般／逾期／完成語意、標題狀態色、UI bounds、filter 與 1440／768 viewport |
| `ai-doc/qc/QC-DEV-027D-mindmap-date-display-filter.md` | Shared Visual Addendum Local QC Passed | DEV-027D | static/browser/type/lint/build、DEV-060／062／075 回歸、rendered screenshots、失敗修正與 runtime 邊界 |

### DEV-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview polish

最新文件修訂（2026-06-19）：
- `SPEC-027B`、`QA-DEV-027B`、`QC-DEV-027B` 已改以 selection-first keyboard UX 為準。
- 新增任務後只選取，不立即進入編輯；原本直接打字改名的任務名稱契約已被 DEV-028 2026-07-05 addendum 覆蓋，WBS 任務名稱需改走詳情頁 title edit。
- 自動化驗證需覆蓋方向鍵選取、連續 `Enter` / `Tab` 新增、zoom、tidy connector 與 drag insertion preview。

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md` | Implemented / Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027B | 定義心智圖模式下一輪 Xmind-like polish：`Enter` 在目前任務下方新增同階任務、可縮放高解析畫布、shared trunk / bracket 整齊 connector、拖曳中明確 insertion placeholder / connector preview / ghost node；舊直接打字外層改名契約已由 DEV-028 覆寫。 |
| `ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md` | Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027B | 定義 DEV-027B 嚴格 UI 驗證計畫，包含 keyboard insertion order、zoom clarity / hit-test、tidy connector topology、drag insertion preview fidelity、desktop/laptop/mobile 截圖、DEV-027A regression gates 與 detail-only 命名覆寫。 |
| `ai-doc/qc/QC-DEV-027B-xmind-interaction-polish.md` | Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027B | 記錄 DEV-027B 事實驗證：Enter insert-after-selected、zoom controls / endpoint alignment、parent + 5 children tidy bracket、drag insertion preview fidelity、mobile zoom、DEV-027A regression gates；外層改名已由 DEV-028 QC 覆蓋。 |

DEV-027B 是 DEV-027 的支援開發點，承接使用者 2026-06-19 補充截圖與需求；不新增資料模型、不做 Xmind 匯入/匯出、不做 style panel。已落地 `Enter` insert-after-selected、zoom state / controls、parent-group bracket connector renderer 與 drag insertion preview，並補 `verify:dev-027b-xmind-interaction-polish`、`verify:dev-027b-xmind-interaction-polish-browser`。

## Documentation Map Update - 2026-06-18

### DEV-027: Xmind-like 心智圖模式

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md` | Implemented / Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027 | 定義 ProJED 新增 `心智圖` 模式：active board title 作為中心主題、WBS 任務作為分支、節點只顯示任務名稱、核心 Xmind-like 鍵盤與拖曳操作、直接共用既有 WBS 任務資料；2026-07-06 已加註 DEV-028 detail-only title edit 覆寫外層 rename。 |
| `ai-doc/qa/QA-DEV-027-xmind-like-mind-map-mode.md` | Browser QC Passed / UI Reopen Addendum / DEV-028 Detail-Only Alignment | DEV-027 | 定義並記錄心智圖入口、中心主題、分支顯示、Enter/Tab/Delete、詳情頁 title input 命名、展開/收合、拖曳階層、權限、跨視圖同步與 viewport 驗證；已加註 connector line、drag interaction UI reopen 與 detail-only 命名覆寫。 |
| `ai-doc/qc/QC-DEV-027-xmind-like-mind-map-mode.md` | Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027 | 記錄 DEV-027 static gates、Playwright browser QC、detail-only title input alignment、drag hierarchy、cycle guard、viewer read-only、desktop/mobile viewport 與 visible error sweep。 |
| `ai-doc/qa/QA-DEV-027A-xmind-connector-line-visual-validation.md` | Browser QC Passed / DEV-028 Detail-Only Alignment | DEV-027A | 針對使用者截圖揭露的 branch connector line 斷裂問題，以及新增的 Xmind-like 拖曳即時預覽動畫與同側拖放需求，定義 Xmind UI 參考、失效判定、acceptance criteria、manual UI matrix、自動化 geometry / drag verifier 要求與 QC handoff gate；視覺互動矩陣已移除外層 F2 rename 暗示。 |
| `ai-doc/qc/QC-DEV-027A-xmind-connector-drag-ui.md` | Browser QC Passed | DEV-027A | 記錄 connector endpoint 幾何驗證、orphan segment 檢查、node overlap 檢查、drag preview movement、same-side root drop、side persistence、desktop/laptop/mobile screenshot 與 final regression gates。 |

DEV-027 的核心決策來自 HCS 引導模式 `1A 2B 3A`：第一版做核心心智圖 MVP；視覺布局與互動高度接近 Xmind 類產品，但避免一比一複製品牌細節；心智圖模式完全共用現有 WBS 任務資料，所有新增、命名、刪除與拖曳階層都直接更新任務。DEV-028 後命名入口統一為 `TaskDetailsModal` title input，外層 `data-mindmap-title-input` 不得回復。已補 `verify:dev-027-xmind-like-mind-map-mode`、`verify:dev-027-xmind-like-mind-map-browser`、`verify:dev-027-xmind-connector-lines-browser` 與 `verify:dev-027-xmind-drag-preview-browser`，並完成 owner drag/cycle/mobile smoke、viewer read-only browser QC、connector geometry QC、drag preview / same-side persistence QC。

### DEV-026: Trello-like 看板分享體驗

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md` | Implemented / Browser Smoke Passed | DEV-026 | 定義看板右上角 `分享` 入口、Trello-like `分享看板` modal、email invite、複製連結、pending invite、看板成員與設定頁權限矩陣降層；RD 已落地 topbar 入口、modal 與 settings split。 |
| `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md` | Static + Browser Smoke Passed / DB Smoke Pending | DEV-026 | 定義並記錄 DEV-026 browser flow、權限不足、pending invite、設定頁保留與 viewport 驗證；desktop 與 390x844 mobile smoke 已通過，service-role DB smoke 未啟用。 |

DEV-026 的核心決策是保留既有 `board_invites` 與 RLS/audit 資料層，把重點放在 Trello 使用者熟悉的主畫面分享入口與單一任務 modal；role permission matrix 留在設定頁。已補 `verify:dev-026-trello-like-board-share-ui`，並修正 mobile topbar 中 filter control 覆蓋分享按鈕的 hit-target 問題。

### DEV-025: 受控跨工作區移動專案

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-025-controlled-project-workspace-transfer.md` | Implemented / DB Read-only Preflight Passed / Fixture + Execution Readiness Gates Added / Guarded Mutating Executor Added / Mutating QC Pending | DEV-025 | 定義專案/看板跨工作區受控搬移方案，包含效用理論決策、權限條件、preflight preview、Supabase RPC、資料表搬移範圍、audit/RAG 風險控制與驗收條件。RD 已落地 migration、service/store、UI 入口、安全 fixture readiness gate 與 guarded mutating executor。 |
| `ai-doc/qa/QA-DEV-025-controlled-project-workspace-transfer.md` | Static QA Done / DB Read-only Preflight Passed / Fixture + Execution Readiness Gates Added / Guarded Mutating Executor Added / Mutating QC Pending | DEV-025 | 定義 DEV-025 QA 驗證矩陣，包含權限、preflight、成功搬移、交易原子性、RLS、UI/UX 與 QC 事實驗證。靜態 verifier、TypeScript 與 build 已通過；正式 DB read-only preflight 已確認 RPC / grants / constraints 存在，且新增 fixture-readiness gate 與 guarded executor 防止誤搬真實資料；mutating role-data QC 仍待安全 fixture。 |
| `ai-doc/qc/QC-DEV-025-controlled-project-workspace-transfer.md` | DB Read-only Preflight Passed / Fixture Readiness Harness Added / Execution Readiness Static Gate Added / Guarded Mutating Executor Added / Mutating Role-Data QC Pending | DEV-025 | 記錄 production Supabase read-only evidence：RPC exists、anon denied、authenticated/service_role allowed、constraints exist、RPC contains permission / lock / audit / RAG / invite revoke coverage；新增 `verify:dev-025-mutating-qc-fixture-readiness` read-only harness、`verify:dev-025-mutating-qc-readiness` 與 `verify:dev-025-mutating-qc-execution` guarded mutating executor；未執行 production move。 |

DEV-025 的核心決策是採用「受控搬移」，不採用自由拖拉或複製。已新增 `preview_project_workspace_transfer` / `move_project_to_workspace` RPC、前端 preview/confirm flow、local-test fallback、`verify:dev-025-project-workspace-transfer`、read-only `verify:dev-025-mutating-qc-fixture-readiness` 與 guarded mutating executor `verify:dev-025-mutating-qc-execution`。2026-07-07 確認正式 DB 已有 RPC/grants/constraints；下一步是安全 fixture 上先跑 fixture readiness / executor self-check，再做實際搬移 QC。

## Documentation Map Update - 2026-06-15

### DEV-024: AI整理保留手寫內容與章節結構

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md` | Implemented / Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 / DEV-011 / DEV-012 / DEV-020 | 定義並落地 `AI整理` 必須保留使用者手寫內容、自訂章節、task mention 與 project change evidence；已新增 deterministic human-draft merge guard、browser ROT verifier 與 production fixture smoke，不只靠 prompt。 |
| `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md` | Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 / DEV-021 / DEV-022 | 驗證手寫段落、自訂章節、任務 mention、專案變化匯入、idempotent、fallback placement；本機 deterministic verifier、browser ROT、regression gate 與 production UI smoke 已通過。 |
| `ai-doc/qc/QC-DEV-024-ai-synthesis-preserve-human-draft.md` | Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 / DEV-021 / DEV-022 / DEV-011 / DEV-012 | 記錄 DEV-024 helper、store writeback、tooltip、DEV-024 browser ROT、DEV-024/021/022/011/012 verifier、TypeScript、build 與 `verify:dev-024-production-ui-smoke` evidence；`DEV024_ALLOW_PRODUCTION_FIXTURE=1` 實跑後 `published_record_found=true`、cleanup `tenantDeleted=true`、`userDeleted=true`。 |

DEV-024 將 DEV-021 / DEV-022 的保護範圍，從 project change evidence 延伸到使用者已輸入的 human draft content；本輪已完成本機 deterministic helper、store writeback、deterministic verifier、local browser ROT 與 production UI smoke，且不新增資料庫 schema，也不改 record content persistence 格式。本輪未重新 production deploy，因目前正式 artifact 已含 DEV-024 實作；殘留風險限於模型格式 polish。

### DEV-023: 專案變化匯入整併為紀錄流程第一步

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md` | Implemented / Browser QC Passed | DEV-023 / DEV-020 | 定義將 `先匯入專案變化` 整併為會議與個人紀錄流程第一步，預設收合，點擊 `匯入` 後才展開設定；目前已通過 DEV-020/021/022/023 自動化與 browser QC。 |
| `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md` | Browser QC Passed | DEV-023 / DEV-020 | 驗證會議與個人流程都有 `匯入` 第一格、獨立大型匯入卡片移除、展開面板、插入/跳過/empty/error 與 viewport。 |
| `ai-doc/qc/QC-DEV-023-record-project-change-import-workflow-step.md` | Browser QC Passed / DB unchanged | DEV-023 / DEV-020 | 記錄 DEV-023 static、DEV-020 browser、DEV-021 preserve、DEV-022 single-record 與 TypeScript 證據；本 DEV 不新增 DB schema 或 persistence 格式。 |
| `ai-doc/reports/PDCA-DEV-020-record-ui-simplification.md` | Superseded risk by DEV-023 | DEV-020 / DEV-023 | DEV-023 supersedes PDCA-DEV-020 中「專案變化匯入仍在流程上方」的殘留 UI 風險。 |

### DEV-022: 專案變化匯入後 AI整理同整成單一會議紀錄

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-022-project-change-single-record-integration.md` | Implemented | DEV-022 | 定義 project change evidence normalization、single-record merge guard 與 fallback evidence note。 |
| `ai-doc/qa/QA-DEV-022-project-change-single-record-integration.md` | Passed | DEV-022 | 驗證最終內容只有一組 `1/2/3` 主結構、marker 移除、taskLinks preserve 與 idempotent。 |
| `ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md` | Closed | DEV-022 / DEV-021 | 分析 DEV-021 preserve append 導致兩份會議內容的根因，已由 DEV-022 integrated synthesis guard 關閉。 |

### DEV-021: 專案變化匯入後 AI整理保留機制

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-021-project-change-ai-preserve.md` | Implemented | DEV-021 | 定義已匯入專案變化為受保護內容，AI整理不得丟失；已落實 deterministic merge guard 與 taskLinks 依 merged content 同步。 |
| `ai-doc/qa/QA-DEV-021-project-change-ai-preserve.md` | Passed | DEV-021 | 定義並通過匯入後 AI整理、存草稿/發布保存、preserve/idempotent、taskLinks 與 prompt-only regression 驗證。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Risk closed by DEV-021 | DEV-020 | DEV-020 未涵蓋 AI整理後保留匯入內容的缺口，已由 DEV-021 補齊。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Risk closed by DEV-021 | DEV-020 | DEV-020 QA 未涵蓋「匯入 -> AI整理 -> 存草稿/發布」保留驗證，已由 DEV-021 補齊。 |

## PDCA Update - 2026-06-15

| 文件 | 狀態 | 關聯 DEV | 說明 |
|---|---|---|---|
| `ai-doc/reports/PDCA-DEV-020-record-ui-simplification.md` | Done | DEV-020 / DEV-019 / DEV-010 | 紀錄 UI 精簡 PDCA：統一 topbar `紀錄中`、將重複摘要 chip 改為 `sr-only` marker、更新靜態與 browser smoke 驗證。 |

## Documentation Map Update - 2026-06-11

### DEV-018 文件索引

| 文件 | 狀態 | 對應 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-018-meeting-record-guardrail-workflow-redesign.md` | Implemented | DEV-018 | 會議紀錄側欄四階段防呆工作流、AI整理動作化、直接發布語意與未儲存離開保護。 |
| `ai-doc/qa/QA-DEV-018-meeting-record-guardrail-workflow.md` | QC Covered | DEV-018 | 驗證空白草稿、直接發布、AI整理、AI 失敗、未儲存離開、已儲存離開、任務變更來源與 viewport。 |
| `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 補足紀錄類型與會議流程分層，避免 `會議紀錄 / 個人工作紀錄` 被誤解成流程步驟。 |
| `ai-doc/qa/QA-DEV-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 驗證一般紀錄模式、會議模式、個人工作紀錄狀態、離開與收合分離、viewport。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Implemented | DEV-020 | 重構紀錄功能為先選類型、匯入專案變化、撰寫、儲存或發布的完整工作流。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Passed | DEV-020 | 驗證看板主入口、專案變化匯入、未儲存防呆、功能說明與 viewport。 |

產品方向補充：

- DEV-018 supersedes DEV-010 的舊會議操作列期待；會議防呆入口以 `RecordSidebar` workflow 為主。
- DEV-018 supersedes DEV-011 / DEV-012 的「發布前必須 AI整理」假設；AI整理是建議動作，直接發布只保存目前編輯器內容。
- DEV-018 不變更資料模型與 RAG token，只重設會議紀錄 UX/UI workflow。
- DEV-019 clarifies DEV-018：`會議紀錄 / 個人工作紀錄` 是紀錄類型，`速記 / AI整理 / 校稿 / 發布` 才是會議模式流程。
- DEV-020 supersedes DEV-019 的局部補強：紀錄類型必須在開始撰寫前決定，並把專案變化匯入、功能說明與未儲存保護納入完整紀錄工作流。

更新日期：2026-06-11

## Active PM 文件

| 文件 | 狀態 | 用途 |
|---|---|---|
| `ai-doc/backlog.md` | Active | PM backlog、交付點與後續候選範圍。 |
| `ai-doc/dev_task.md` | Active | DEV 任務主控板，只保留狀態、下一步、阻塞與驗證證據索引。 |
| `ai-doc/documentation_map.md` | Active | 文件索引與目前交付邊界。 |

## Archived PM 文件

| 文件 | 狀態 | 用途 |
|---|---|---|
| `ai-doc/archived/dev_task_2026-06-09_before_restructure.md` | Archived | 2026-06-09 重整前的完整 dev_task 長版內容；保留歷史細節與舊 RD/QA/QC 紀錄。 |

## Active 規格文件

| 文件 | 狀態 | 對應 DEV | 說明 |
|---|---|---|---|
| `ai-doc/specs/SPEC-001-unified-compact-ui-system.md` | Done reference | DEV-001 | 統一 compact UI 系統規格。 |
| `ai-doc/specs/SPEC-002-whole-person-todo-platform.md` | Draft | 未分配 | Whole-person todo / inbox 類功能草案；目前未列入 active 交付點。 |
| `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md` | Implemented / DEV-002 Done Source Spec | DEV-002 | 會議紀錄與個人工作紀錄工作流設計；保留為 DEV-002 主要需求來源與後續 refinements 的 historical source spec，不代表仍有未完成 RD 範圍。 |
| `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` | Implemented | DEV-005 | 會議看板主畫面紀錄工作流；承接 DEV-002 / DEV-003 的 UX refinement。 |
| `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` | Implemented | DEV-006 | Gmail-like 會議紀錄輸入器穩定化；承接 DEV-003 / DEV-005 的 editor UX refinement。 |
| `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` | Implemented | DEV-007 | 會議中保留原生看板編輯，並將任務變更納入會議紀錄。 |
| `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` | Implemented | DEV-008 | 任務詳情中的會議細節快速查找；承接 DEV-002 / DEV-007 的 task knowledge UX refinement。 |
| `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` | Implemented | DEV-009 | 會議模式下任務詳情內快速補記；承接 DEV-005 / DEV-007 / DEV-008 的 meeting workflow UX refinement。 |
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Implemented | DEV-010 | 會議紀錄操作按鈕狀態溝通設計；承接 DEV-005 / DEV-006 / DEV-007 / DEV-009 的 meeting workflow UX refinement。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-011 | AI 任務導向會議紀錄統整工作流；承接 DEV-007 / DEV-008 / DEV-009 / DEV-010 的 meeting record synthesis refinement；hotfix `7704e2f` 已部署，production fixture smoke 與 DB proof 通過。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-012 | AI 會議紀錄自然語言品質提升；承接 DEV-011 / DEV-008 的 meeting record synthesis quality refinement；hotfix `7704e2f` 已部署，production fixture smoke 與 DB proof 通過。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` | Implemented | DEV-013 | 定義右鍵清單任務複製，包含子任務欄位與子樹內部依賴複製。 |
| `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md` | Implemented | DEV-019 | 定義紀錄類型層、會議流程層與個人工作紀錄簡單狀態。 |
| `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md` | Implemented | DEV-020 | 定義紀錄功能重構、專案變化匯入、功能說明、dirty guard 與 RD/QA/QC 邊界。 |
| `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md` | Implemented / Browser QC Passed | DEV-023 | 定義專案變化匯入整併為會議與個人紀錄流程第一步；父交付點 DEV-020。 |
| `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md` | Implemented / Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 | 定義並落地 AI整理保留手寫內容與章節結構；父交付點 DEV-011 / DEV-012 / DEV-020；production fixture smoke `verify:dev-024-production-ui-smoke` passed。 |
| `ai-doc/specs/SPEC-026-trello-like-board-share-ui.md` | Implemented / Browser Smoke Passed | DEV-026 | 定義 Trello-like 看板分享入口、分享 modal 與邀請流程 UI/UX。 |
| `ai-doc/specs/SPEC-027-xmind-like-mind-map-mode.md` | Implemented / Static + Browser Smoke Passed / DEV-028 Detail-Only Alignment | DEV-027 | 定義 Xmind-like 心智圖模式，讓 WBS 任務以心智圖分支呈現並可用鍵盤與拖曳編輯；任務命名已依 DEV-028 統一到 `TaskDetailsModal` title input，外層 `data-mindmap-title-input` 不得回復。 |
| `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md` | Implemented / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed / Production Not Deployed | DEV-028 | 定義清單、心智圖、看板、甘特四模式一致的 Trello-like 任務操作契約；detail-only title edit 與 manual readiness gate 已完成自動化驗證，2026-07-09 使用者回報 MAN-028 人工親自點擊 QC 通過；production deploy 未執行。 |
| `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md` | Phase 1 + Phase 1B Implemented / Local Automated QA Passed / Production Not Deployed / Physical Phone Supplemental Not Executed / Canvas CTA Pass-Through Covered | DEV-029 | 定義手機 BoardView / Kanban / TaskWorkbench pan-first 觸控仲裁，手機 task surface、拖曳把手與大型新增 CTA 短滑不誤開詳情且可 pan，無位移 tap 仍開詳情或執行新增；Phase 1B compact action rail、長按拖放、edge auto-scroll 與 cancel/blur/Escape/timeout 防卡死已完成本機 QA，production 與真機 supplemental 未執行。 |
| `ai-doc/specs/SPEC-051-kanban-cross-parent-drag-lock.md` | Implemented / Local Automated QA + Browser UI QC Passed / Production Not Deployed | DEV-051 / DEV-046 / DEV-029 | 定義並落地同父層即時排序、跨父層 750ms lock、empty/collapsed child lane、locked before/after/append、filter canonical order、桌機/手機共用 resolver、commit/undo 與取消安全。 |
| `ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md` | Archived / Historical / Do Not Execute | DEV-052 / DEV-051 / DEV-046 / DEV-029 | 歷史 targeted drag subsystem refactor 提案；依賴已撤回的 DEV-051 baseline，不得直接實作。 |
| `ai-doc/specs/SPEC-068-task-title-center-child-drop.md` | Implemented / AI Browser QA-QC Passed / Reorder Boundary Targeted PASS / Physical Mobile 未充分驗證 / 未 Release | DEV-068 | 定義並落地 L1／L2／L3+ complete-hover-scope geometry、來源原位虛線框、1秒child-intent、candidate／armed零 target 藍框、armed插入線，以及展開任務 standard marker 的完整 scope 邊界；child append 回原位時顯示來源名稱並zero-write。 |
| `ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md` | Done / Browser QC Passed / Local-first scope / QuickCaptureShell Retired | DEV-034 | 定義 App 快速啟動、PWA 自動更新、加入主畫面平台分流指引與本機 pending InboxItem queue；QuickCaptureShell 已退役並由 DEV-039 全域任務平台 `未歸位` lane 取代；正式雲端 Inbox、跨裝置同步與轉正式任務接 SPEC-002 後續。 |

## 目前交付邊界

目前 active 產品交付點：

- DEV-002：會議紀錄與個人工作紀錄 MVP。
- DEV-005：會議看板主畫面紀錄工作流。
- DEV-006：Gmail-like 會議紀錄輸入器穩定化。
- DEV-007：會議中原生看板編輯與任務變更紀錄。
- DEV-008：任務會議細節快速查找。
- DEV-009：會議模式任務詳情內快速補記。
- DEV-010：會議紀錄操作按鈕狀態溝通設計。
- DEV-011：AI 任務導向會議紀錄統整工作流。
- DEV-012：AI 會議紀錄自然語言品質提升。
- DEV-013：右鍵清單任務複製，包含子任務與子樹內部依賴。
- DEV-020：紀錄功能重構與專案變化匯入流程。
- DEV-025：受控跨工作區移動專案。
- DEV-026：Trello-like 看板分享體驗。
- DEV-027：Xmind-like 心智圖模式。
- DEV-028：四模式一致的 Trello-like 任務操作契約。
- DEV-068：拖離任務後原位置保留尺寸穩定的虛線框；進入任務完整命中範圍後，前1秒不顯示子任務藍框並保留原standard drop，但展開任務的 `after` 線必須在完整子樹之後，不能出現在 L2 標題正下方；滿1秒只顯示下一子階插入線。若回到原位則顯示來源名稱並zero-write，否則放開才移入exact parent。目前AI Browser QA/QC與本輪 boundary targeted gate已通過，Physical Mobile未充分驗證，未Release。
- DEV-029：手機 Pan-First 觸控手勢仲裁與 compact action rail。
- DEV-034：App 快速啟動與加入主畫面 UX。
- DEV-035：工作區刪除持久化修正。
- DEV-036：Trello-like Workspace Governance。
- DEV-037：行事曆訂閱來源範圍清晰化。
- DEV-038：設定中心作用範圍一致性與高風險防呆。
- DEV-039：任務過濾器核心與全域任務平台兩欄篩選重構。
- DEV-040：正式環境同型 BUG 風險硬化與驗證。
- DEV-041：PWA 更新通知與快取恢復。
- DEV-042：手機左側欄收疊零佔寬與全域任務平台 Off-Canvas。
- DEV-044：上一步復原範圍擴充與低資料庫成本治理。
- DEV-045：行事曆訂閱篩選器建構器與即時預覽。
- DEV-046：全任務表面拖曳一致化與拖曳把手退役。

DEV-002 的產品邊界：

- 建立紀錄資料模型與任務關聯。
- 建立右側可收疊紀錄填寫欄。
- 建立看板式任務選取器。
- 建立紀錄列表與任務詳情頁紀錄時間軸。
- 建立紀錄到 RAG documents 的 indexing 基礎。

不包含：

- 語音逐字稿。
- AI 自動修改任務。
- 複雜審批。
- 完整部門級 BI 報表。

DEV-005 的產品邊界：

- 將會議中的主畫面固定為 active board 的 `board` view。
- 建立會議狀態列與會議導向入口。
- 讓右側紀錄欄成為速記與任務連結輔助。
- 會議模式下點 Kanban card / checklist item 可插入 inline task tag。
- 保留 `RecordsView` 作為會後查閱與整理的紀錄庫。

不包含：

- 完整會議管理。
- AI 決議抽取或自動建立任務。
- 跨 board 會議。
- 多記錄者即時協作。
- 新增 migration 或變更紀錄資料格式。

DEV-006 的產品邊界：

- 以成熟 editor engine 修正會議紀錄內容輸入。
- 保留 `@[title](task:id)` 與 `record_task_links` 資料契約。
- 支援 task chip copy / cut / paste / move。
- 支援 Gmail-like 基本輸入肌肉記憶。

不包含：

- Gmail 富文字工具列。
- 新增 migration 或 editor JSON 後端格式。
- 多人即時協作。

DEV-007 的產品邊界：

- 會議模式不劫持看板卡片或 checklist 的主要點擊行為。
- 會議中看板維持一般編輯、拖曳、context menu 行為。
- 任務狀態、移動與關鍵變更在背景收集為 meeting activity。
- 儲存或發布時將 activity append 到會議紀錄內容。

不包含：

- 新增 meeting event table。
- 多人即時協作 event stream。
- AI 決議抽取。

DEV-008 的產品邊界：

- 任務詳情頁提供任務知識入口。
- 已關聯紀錄優先顯示目前任務的會議或工作紀錄片段。
- 任務內搜尋涵蓋任務備註、關聯紀錄片段與會議中任務變更。
- 點擊片段可回到原始紀錄。

不包含：

- AI 問答、語意搜尋或自動摘要。
- 新增資料表或修改紀錄資料格式。

DEV-009 的產品邊界：

- 會議模式下任務詳情顯示「本次會議」快速補記。
- 補記內容 append 到目前 meeting draft 的任務討論區塊。
- 自動插入目前任務 inline tag 並同步 task link。
- 保留任務詳情一般任務編輯功能。

不包含：

- 任務詳情內完整會議紀錄編輯器。
- AI 摘要或決議抽取。
- 新增資料模型。

DEV-010 的產品邊界：

- 會議模式狀態列需說明 `存草稿`、`發布`、`離開會議模式` 的差異。
- 按鈕不可操作時需揭露原因與下一步，不可只灰掉。
- `存草稿` 與 `發布` 需使用不同啟用條件。
- `BoardView` 與 `RecordSidebar` 共用同一套 action state 判斷。
- 離開會議模式需避免使用者誤以為已保存或已發布。

不包含：

- 手機版會議紀錄工作流。
- 新增資料模型或 migration。
- AI 摘要、完整會議管理或跨 board 會議。

DEV-011 的產品邊界：

- 會議紀錄發布前先由後端 AI 統整成任務導向草稿。
- AI 只更新 meeting draft content，不建立、修改、移動或刪除任務。
- 原始 meeting activity 僅作為 AI input source，不逐筆進入 published 正文。
- 人類必須校稿後再次發布。
- published 正文保留 `@[title](task:id)`，讓 DEV-008 任務知識查找可用。

不包含：

- 即時 AI 統整。
- 手機版會議紀錄工作流。
- 新增資料模型或 migration。
- 完整會議管理、跨 board 會議或多記錄者即時協作。

DEV-012 的產品邊界：

- 保留 DEV-011 的發布前 AI 統整流程。
- 保留三個大章節；任務段落以階層編號與 task tag 呈現，例如 `2.1 @[列表](task:id)`、`2.1.1 @[卡片](task:id)`、`2.1.1.1 @[子任務](task:id)`。
- 任務段落改成自然語言任務紀要，不使用五欄固定模板。
- 會議紀錄只整理 rawContent 與 meeting activity，不使用專案既有狀態補內容。
- `下一步` 只在會議速記或任務補記中明確出現行動時輸出。
- Edge Function 預設首選模型為 `gemini-3.5-flash`，並保留 env override；未設定 env override 且首選模型 unavailable 時，可受控 fallback 到 `gemini-3.1-flash-lite`，但 response 必須揭露 `warnings` 與實際 `model`。
- Golden samples verifier 檢查自然語言品質與 DEV-008 任務片段抽取相容性。

不包含：

- 新增資料模型或 migration。
- AI 自動修改任務。
- 即時 AI 統整。
- 手機版會議紀錄工作流。

## 建議 QA / QC 文件位置

DEV-002 已完成，未建立獨立 `QA-DEV-002` / `QC-DEV-002` 檔案；不得把下列歷史建議當成缺漏文件。

現有 DEV-002 evidence：

- `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md`
- `ai-doc/reports/PM-DEV-002-meeting-work-records-implementation.md`
- `ai-doc/archived/dev_task_2026-06-09_before_restructure.md`
- `verify:dev-002-records`

## 文件治理備註

- `SPEC-002` 目前為未追蹤新檔，且未綁定 active DEV；保留為草案，不納入 DEV-002 完成率。
- `SPEC-003` 是 DEV-002 的主要需求來源。
- 後續若要把 AI 全域分析做成獨立交付點，需先由使用者確認新增 DEV。

---

## PM Update - 2026-06-04

### Active Spec Addendum

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/specs/SPEC-004-record-content-inline-task-tags.md` | Implemented | DEV-003 / DEV-002 follow-up | 定義紀錄內容內嵌任務標籤 UX，讓看板選取的任務以 Codex-like tag 插入內容游標位置。 |
| `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` | Implemented | DEV-005 / DEV-002 follow-up / DEV-003 follow-up | 定義會議中以議題看板為主畫面、右側紀錄欄為輔助速記與任務連結的工作流。 |
| `ai-doc/specs/SPEC-006-gmail-like-record-editor.md` | Implemented | DEV-006 / DEV-003 follow-up / DEV-005 follow-up | 定義 Gmail-like 會議紀錄輸入器與 task chip copy/cut/paste/move 行為。 |
| `ai-doc/specs/SPEC-007-meeting-board-native-edit-activity-capture.md` | Implemented | DEV-007 / DEV-005 follow-up / DEV-006 follow-up | 定義會議中保留原生看板編輯，並把任務變更納入會議紀錄。 |
| `ai-doc/specs/SPEC-008-task-meeting-detail-lookup.md` | Implemented | DEV-008 / DEV-002 follow-up / DEV-007 follow-up | 定義任務詳情中的任務知識查找、片段抽取與任務內搜尋。 |
| `ai-doc/specs/SPEC-009-meeting-task-detail-quick-note.md` | Implemented | DEV-009 / DEV-005 follow-up / DEV-008 follow-up | 定義會議模式任務詳情內快速補記與 meeting draft append 行為。 |
| `ai-doc/specs/SPEC-010-meeting-record-action-feedback.md` | Implemented | DEV-010 / DEV-005 follow-up / DEV-009 follow-up | 定義會議紀錄操作按鈕狀態、阻塞原因提示、草稿/發布條件拆分與離開保護。 |
| `ai-doc/specs/SPEC-011-ai-meeting-record-synthesis.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-011 / DEV-007 follow-up / DEV-008 follow-up / DEV-009 follow-up | 定義 AI 任務導向會議紀錄統整、發布前校稿流程、後端模型執行與不改任務邊界；hotfix `7704e2f` 上線後 production fixture smoke 通過。 |
| `ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-012 / DEV-011 follow-up / DEV-008 follow-up | 定義 AI 會議紀錄自然語言品質、任務紀要格式、模型預設與 golden samples 驗證；hotfix `7704e2f` 上線後 production fixture smoke 通過。 |
| `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` | Implemented | DEV-013 | 定義右鍵清單任務複製、任務子樹欄位保留、內部依賴 remap 與驗證邊界。 |

### Current Product Direction

- DEV-002 已交付會議/工作紀錄基礎設施與看板式任務選取。
- 下一個 UX refinement 是讓任務關聯成為撰寫流程的一部分。
- 從看板選取的任務要插入 `Content` 編輯器目前游標位置，並顯示為 inline task chip。
- `record_task_links` 仍作為 AI 分析使用的結構化 graph link；內容 tag 是使用者撰寫時的前景介面。
- DEV-005 進一步調整會議中的主視角：開會時應停留在議題看板，紀錄欄只作為輔助速記，不再讓紀錄庫頁成為會議主畫面。
- DEV-007 修正會議看板互動：會議中仍使用一般看板編輯，任務變更由背景 meeting activity 納入紀錄。
- DEV-010 補齊會議狀態列的溝通設計：按鈕不可操作時必須顯示原因與下一步，避免使用者只看到灰色按鈕。
- DEV-012 提升 AI 會議紀錄品質：保留任務導向與 task tag，但輸出改為自然語言任務紀要，且 AI 不補寫人類沒講過或沒做過的事。

### Delivery Reports

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/reports/PM-DEV-003-record-content-inline-task-tags-implementation.md` | Done | DEV-003 | DEV-003 交付範圍、驗證結果與殘留風險。 |
| `ai-doc/reports/PM-DEV-005-meeting-board-primary-workflow-implementation.md` | Done | DEV-005 | DEV-005 交付範圍、驗證結果與殘留風險。 |
| `ai-doc/reports/PM-DEV-006-gmail-like-record-editor-implementation.md` | Done | DEV-006 | DEV-006 editor engine、task chip clipboard、實際輸入測試與殘留風險。 |
| `ai-doc/reports/PM-DEV-007-meeting-activity-capture-implementation.md` | Done | DEV-007 | DEV-007 原生看板編輯保留、meeting activity 收集與驗證結果。 |
| `ai-doc/reports/PM-DEV-008-task-meeting-detail-lookup-implementation.md` | Done | DEV-008 | DEV-008 任務知識查找、片段抽取與驗證結果。 |
| `ai-doc/reports/PM-DEV-009-meeting-task-detail-quick-note-implementation.md` | Done | DEV-009 | DEV-009 任務詳情內會議快速補記、append 行為與驗證結果。 |

### QA Validation Plans

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/qa/QA-DEV-003-record-content-inline-task-tags-ux-validation.md` | Done / Static QC Covered | DEV-003 | 使用者視角 UX 驗證計畫，聚焦看板直接選任務、內容游標 inline tag、右側欄收合、重複 tag 與唯一關聯摘要。 |
| `ai-doc/qa/QA-DEV-006-gmail-like-record-editor.md` | Done / Browser Input QC Passed | DEV-006 | Gmail-like 實際輸入驗證計畫，包含多行、undo/redo、IME、task chip copy/cut/paste/move 與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-007-meeting-activity-capture.md` | Done / Static QC Covered | DEV-007 | 會議中看板原生編輯與任務變更自動納入紀錄的驗證計畫。 |
| `ai-doc/qa/QA-DEV-008-task-meeting-detail-lookup.md` | Done / Static QC Covered | DEV-008 | 任務會議細節快速查找驗證計畫，包含任務片段抽取、搜尋、fallback 與原始紀錄追溯。 |
| `ai-doc/qa/QA-DEV-009-meeting-task-detail-quick-note.md` | Passed by QC | DEV-009 | 會議模式任務詳情內快速補記驗證計畫，包含 meeting draft append、task tag 與資料邊界。 |
| `ai-doc/qa/QA-DEV-010-meeting-record-action-feedback.md` | Implemented | DEV-010 | 會議紀錄操作按鈕狀態溝通 UX 驗證計畫，包含 disabled reason、tooltip/focus、離開保護與桌機/筆電 viewport。 |
| `ai-doc/qa/QA-DEV-011-ai-meeting-record-synthesis.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-011 | AI 任務導向會議紀錄統整 UX 驗證計畫，包含實際輸入、AI 失敗保留草稿、校稿發布、桌機/筆電 viewport、readiness gate、guarded executor self-check、hotfix `7704e2f` 與 production fixture smoke / DB proof。 |
| `ai-doc/qa/QA-DEV-012-ai-meeting-record-natural-language-quality.md` | Done / Production Release Deployed / Production UI Smoke Passed | DEV-012 | AI 會議紀錄自然語言品質驗證計畫，包含 golden samples、實際輸入、模型不可用、任務知識查找相容性、readiness gate、guarded executor self-check、hotfix `7704e2f` 與 production fixture smoke / DB proof。 |
| `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md` | Passed | DEV-020 | 紀錄功能重構驗證計畫，包含看板主入口、專案變化匯入、未儲存防呆、功能說明與 viewport。 |
| `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md` | Browser QC Passed | DEV-023 | 驗證專案變化匯入作為紀錄流程第一步、預設收合、展開面板、插入/跳過與 DEV-021/022 回歸。 |
| `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md` | Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 | 驗證 AI整理不得覆蓋使用者手寫內容、章節結構、task mention 與 project change evidence；本機 verifier、local browser ROT 與 production UI smoke 已通過，`DEV024_ALLOW_PRODUCTION_FIXTURE=1` 實跑後 `published_record_found=true`、cleanup `tenantDeleted=true`、`userDeleted=true`。 |
| `ai-doc/qa/QA-DEV-026-trello-like-board-share-ui.md` | Static + Browser Smoke Passed / DB Smoke Pending | DEV-026 | 驗證 Trello-like 分享入口、modal 邀請、複製連結、pending invite、成員 tab、權限不足與 viewport。 |
| `ai-doc/qa/QA-DEV-028-cross-mode-trello-like-task-interactions.md` | QA Plan Updated / Local Automated QA Passed / Manual Click QC Readiness Gate Added / User-Reported Manual Click QC Passed | DEV-028 | 驗證四模式單擊選取並開詳情、任務名稱只在詳情頁 title edit、外層 rename 移除、新增任務命名導向詳情、右鍵/長按任務選單無重新命名、看板 Level 3+ 保留、甘特 drag/click 互斥、viewport、manual readiness gate 與 2026-07-09 使用者回報 MAN-028 人工親自點擊通過。 |
| `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QA Passed / Physical Phone Supplemental Not Executed / Phase 1B Hotfix Covered / B10-B12 Added | DEV-029 | 驗證手機 pan-first：任務卡、L2+ 子任務、欄位、工作台 row、手機拖曳把手與大型新增 CTA 短滑不誤開詳情且可 pan，L2+ pan 可推動 `scrollTop` / `scrollLeft`，無位移 tap 可開詳情或執行新增；Phase 1B 覆蓋 compact action rail、長按浮起、拖曳把手長按、touchcancel 退出不卡死、drop target、刪除確認與桌機右鍵不變驗證。 |
| `ai-doc/qa/QA-DEV-051-kanban-cross-parent-drag-lock.md` | QA Plan Updated / Local Automated QA + Browser UI QC Passed / Manual Real Operation Not Executed / Physical Phone Supplemental Not Executed | DEV-051 | 驗證 750ms/200ms/20px 邊界、1A/2A/3A、desktop/mobile、filter、cycle、雙 ancestor rollup、undo、stable selectors 與 DEV-029/039/044/046/048 回歸；新增 R01～R14 人工操作腳本。 |
| `ai-doc/archived/QA-DEV-052-kanban-drag-subsystem-refactor.md` | Archived / Historical / Not Executed | DEV-052 | 歷史驗證設計；因 DEV-052 已封存，不得作為目前 QA ready 或實作 gate。 |
| `ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md` | Executed / Targeted Title-Anchor + Reorder Boundary Browser Passed / Adjacent L1 Placeholder Regression Open / Physical Mobile 未充分驗證 | DEV-068 | 2026-08-25 已驗證最終同層 title anchor 與展開 L2 standard marker 的完整 scope bottom；desktop/mobile targeted 各 2/2，既有 L1 placeholder 相鄰回歸與 iOS/Android 實機待補。 |
| `ai-doc/qa/QA-DEV-040-production-environment-risk-validation.md` | QA Plan Complete / Local + P0 Addendum QC Executed / P0 Remote Read-only Preflight + Remote Readiness Static Gate Passed / Production Smoke Executed for Original BUG Flows / Extended Matrix Partially Covered | DEV-040 | 驗證正式環境同型 BUG 風險：dependencies 匯入、RAG timeout、看板 temp id、member/tag stale response、Google Calendar timeout、MindMap local-only 語意與 production smoke evidence；已完成原始 2 BUG production authenticated UI smoke、2026-07-06 P0 local addendum QC、2026-07-07 read-only preflight 與 remote-readiness static gate，延伸矩陣剩餘項需另行驗證。 |

### QC Fact Reports

| 文件 | 狀態 | 關聯任務 | 用途 |
|---|---|---|---|
| `ai-doc/qc/QC-DEV-009-meeting-task-detail-quick-note-ux.md` | Pass | DEV-009 | DEV-009 UX 驗證事實報告，確認桌機與筆電會議補記工作流通過。 |
| `ai-doc/qc/QC-DEV-011-012-production-ai-smoke.md` | Backend Pass / Production Release Deployed / Production UI Smoke Passed | DEV-011 / DEV-012 | 正式 Hosting 部署與 Edge Function AI smoke 事實報告；後端正式 AI 統整通過，hotfix `7704e2f` 已部署，production fixture smoke、DB proof 與 cleanup 均通過。 |
| `ai-doc/qc/QC-DEV-013-task-tree-duplicate-context-menu.md` | Pass | DEV-013 | DEV-013 右鍵任務複製事實驗證報告，確認子樹複製、內部依賴 remap、undo/redo 與 release gate 回歸通過。 |
| `ai-doc/qc/QC-DEV-024-ai-synthesis-preserve-human-draft.md` | Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Passed | DEV-024 | DEV-024 AI整理保留手寫內容事實驗證報告，確認 helper、store writeback、tooltip、DEV-024 browser ROT、DEV-024/021/022/011/012 verifier、TypeScript、build 與 production fixture smoke 通過；`verify:dev-024-production-ui-smoke` passed。 |
| `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md` | Local Automated Browser QC Passed / Physical Phone Supplemental Not Executed / Production Not Deployed / Hotfix Covered / Canvas CTA Pass-Through Covered | DEV-029 | DEV-029 手機 pan-first 觸控仲裁事實驗證，記錄 static 38/38、browser matrix 覆蓋 L2+ scroll displacement、手機拖曳把手短滑 pan、大型新增 CTA short-pan pass-through、把手長按、edge auto-scroll、touchcancel 退出不卡死、DEV-028 regression、TypeScript、build 與真機補充未執行邊界。 |
| `ai-doc/qc/QC-DEV-051-kanban-cross-parent-drag-lock.md` | Local Automated + Browser UI QC Passed / Production Not Deployed | DEV-051 | DEV-051 當時的事實驗證報告記錄 static 28/28、browser 6/6、desktop/mobile 截圖與相鄰回歸；後續 DEV-051 baseline 已擴充為 33/33 與 7-case matrix，見最新 SPEC／QA。 |
| `ai-doc/qc/QC-DEV-053-task-drag-muscle-memory-consistency.md` | Local Static + Browser + QA True Operation Gate Passed / Production Not Deployed | DEV-053 | 記錄 T01-T14 真實滑鼠／觸控操作、桌機核准 baseline、placed row no-drag、10-case DEV-053 browser、指定回歸、viewport 與 console/network evidence；physical phone supplemental 未執行。 |
| `ai-doc/qc/QC-DEV-068-task-title-center-child-drop.md` | AI Browser QA-QC Passed / Physical Mobile 未充分驗證 / 未 Release | DEV-068 | 記錄來源原位虛線框、whole-scope、candidate／armed零 target 藍框、armed child insertion同步、child-origin名稱預覽／zero-write、viewport cleanup、控制項／排序／Workbench衝突根因、失敗回送RD，以及73/73 DEV-068 static、30/30核心、64/64相鄰browser、五viewport、畫面複查與實機缺口。 |
