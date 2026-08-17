# QA-DEV-070：跨模式互動策略核心零差異驗證計畫

- 關聯 DEV：DEV-070
- 規格：SPEC-070、SPEC-027B、SPEC-028、SPEC-029
- 架構決策：ADR-043
- QA 狀態：Execution Complete / FMEA Reassessed / QC Evidence Recorded
- QC 狀態：Functional PASS（57/57；required regression 全綠）；Release Overlay Blocked
- 風險：High / Release Gate Blocked（跨模式 interaction routing、驗證逃逸、dirty release boundary、artifact provenance、context menu、快捷鍵、transient mode、drag/mobile 與 Firebase cache）
- Execution Boundary：本輪由 RD 修復 runtime／verifier 阻塞後，QC 以 local fixture 重跑 57-case functional gate、rendered matrix、baseline/after/diff 與受影響 regression；不執行 deploy／release。另有 12 項 release overlay gate 維持獨立判定。

## 1. 驗證目標

證明 DEV-070 只改內部 routing 架構，沒有改變任何使用者可觀察行為；並證明未來 Base、Host Mode、Origin、Node Role 或 Transient 變更可精確列出影響範圍。

本 QA 不以「新 resolver 有測試」代替相容性證據。通過需要三類證據同時成立：

1. pure resolver／catalog／guard contract 正確。
2. 重構前後 golden interaction matrix 無未核准差異。
3. 真實 rendered surface、鍵盤、menu、modal、mobile gesture 與 drag regression 無漂移。

## 2. FMEA 風險優先順序

評分尺度：Severity／Occurrence／Detection（S/O/D）各 1～10，Detection 越高代表越難在正式環境前發現，`RPN = S × O × D`。`RPN ≥ 250` 為 Critical、150～249 為 High、80～149 為 Medium、低於 80 為 Low。權限／危險操作繞過、重複 mutation、dirty／unknown artifact 或 production provenance mismatch 不論 RPN 均為 P0 hard gate。

| ID | 失效模式 | 可能原因 | 使用者影響 | S | O | D | RPN | 優先級 | 偵測方式／對策／建議測試 |
|---|---|---|---|---:|---:|---:|---:|---|---|
| F-01 | 未提交或未知變更被包入正式產物 | 直接從 dirty worktree build；DEV-069、service、Auth、Record 或 Edge Function 變更未分類 | 部署未核准功能、資料流程或遠端契約 | 10 | 8 | 7 | 560 | Critical / P0 | REL-070-001～003；clean release worktree、included/excluded manifest、artifact source SHA |
| F-02 | 發布 commit 不可由遠端重建 | HEAD 領先 upstream、未 push、branch／main release path 不明 | 無法追溯、重建、協作或可靠 rollback | 9 | 7 | 8 | 504 | Critical / P0 | upstream reachability、remote SHA、release path declaration、rollback reference |
| F-03 | `dist` 不是目標 commit 的 exact artifact | stale `dist`、從 dirty source build、build 後 source 又變更 | 驗證與實際部署不是同一份程式 | 9 | 7 | 8 | 504 | Critical / P0 | clean build、source SHA、asset manifest／SHA-256、build-after diff=0 |
| F-04 | 正式站資產無法對應 release evidence | production bundle 名稱／hash 與最近文件、cache 或 candidate 不一致 | 問題發生時無法定位版本或確定回滾點 | 9 | 5 | 8 | 360 | Critical / P0 | REL-070-004、009～012；pre/post deploy hash chain 與 provider release ID |
| F-05 | QA harness 低估覆蓋並產生假通過 | 目前 static 只覆蓋 14 assertions，browser 只做三 viewport smoke；未輸出完整 matrix／diff | mode、menu、permission、command 或 transient 缺陷逃逸到正式站 | 9 | 9 | 8 | 648 | Critical / P0 | 57 項功能案例逐項 evidence；baseline/after/diff artifact contract；缺一不得進 QC |
| F-06 | Base／Host／Origin sparse precedence 錯誤 | merge operator 或 location registry 漏項 | 單一變更污染其他模式／子表面 | 8 | 4 | 6 | 192 | High / P0 | QA-070-001～010、016～018；affected-location＋negative diff |
| F-07 | menu 使用 render-time `currentView` 或錯 target | 沒保存 open-time host/origin/task snapshot | 切模式或 selection 後執行錯任務、錯 menu | 8 | 5 | 6 | 240 | High / P0 | QA-070-020～029；開 menu 後切 view／task 的 target identity test |
| F-08 | legacy 與 kernel 雙重執行或 dedupe 失效 | migration state/wiring 不完整、同一事件多路 dispatch | 任務重複新增、刪除、移動或重複 toast | 10 | 4 | 7 | 280 | Critical / P0 | QA-070-014、019、040、057；executor=1、mutation=1、duplicate=noop |
| F-09 | Guard／permission／danger confirmation 被繞過 | Profile 直接 enabled/mutation、direct command 未二次拒絕 | 未授權修改或無確認刪除 | 10 | 3 | 8 | 240 | Critical / P0 | QA-070-011～013、017、028、056；owner/viewer role matrix、cancel/confirm pair |
| F-10 | transient owner 或 drag/resize click-through | owner 仲裁錯、mouseup compatibility click 未 suppress | 建依賴、拖曳或紀錄擷取時誤開詳情／誤動作 | 8 | 5 | 5 | 200 | High / P0 | QA-070-018、050～053、059；move/no-move、owner conflict、command=0 |
| F-11 | mobile tap／pan／long-press state 漂移 | desktop profile 蓋過 mobile broker、門檻或 cancel lifecycle 改變 | 不能捲動、誤開詳情、危險操作誤觸 | 8 | 6 | 5 | 240 | High / P0 | QA-070-054～059、062；390x844 quick tap／short pan／long press／cancel |
| F-12 | 心智圖鍵盤語意被共用快捷鍵覆蓋 | Global Enter/Tab handler 未檢查 mode/focus/IME | 無法建立同階／子階或錯開詳情 | 7 | 5 | 4 | 140 | Medium / P0 | QA-070-035～038；Mindmap Enter/Tab/arrow 與 input/modal/IME negative cases |
| F-13 | Calendar／Workbench／Shared Sidebar 繼承錯 host 能力 | 只記 origin 或 fallback 到 list/board | 點擊、右鍵或依賴項目與所在模式不符 | 7 | 5 | 6 | 210 | High / P0 | QA-070-023～026、034、039；每一 host×origin pair true operation |
| F-14 | 既有跨模式階層視覺回歸 | Kernel wiring 或相鄰 UI 變更使 L2／L3+ hierarchy contract 漂移 | 使用者難以辨識階層、誤判任務層級 | 6 | 6 | 3 | 108 | Medium / P1 | DEV-028 static/browser 必須全綠；目前 44/45，未關閉前不放行 |
| F-15 | viewport、focus、menu/modal 浮層不可操作 | responsive、scroll owner、focus lifecycle 未覆蓋 | 手機／低高度畫面裁切、遮擋或鍵盤不可用 | 6 | 5 | 4 | 120 | Medium / P1 | QA-070-029、060～066；1440x900、1024x768、390x844 screenshot＋DOM |
| F-16 | production env/auth/config 錯誤 | build env 缺 key、test auth 洩入 production、target 錯誤 | blank app、登入失敗或連到錯 backend | 9 | 3 | 3 | 81 | Medium / P0 | REL-070-005～007；env probe、production-auth 5/5、preview authenticated read-only smoke |
| F-17 | Service Worker／cache 提供舊 HTML 或失效 chunk | cache 切換、index/chunk hash 或 normal reload 未驗證 | 更新後白畫面、ChunkLoadError、版本混用 | 9 | 5 | 7 | 315 | Critical / P0 | REL-070-008～012；hard reload＋normal navigation＋SW／asset 200＋hash match |
| F-18 | 可見錯誤或內部診斷外洩 | runtime exception、failed request、diagnostic 被渲染 | 使用者看到錯誤、工程資訊或無法完成工作 | 9 | 4 | 3 | 108 | Medium / P0 | QA-070-063、065 與所有 release smoke 的 visible-error／noise sweep |

目前已成立且尚未關閉的 blocker：F-01、F-02、F-03、F-04。F-05 已由 57-case verifier、完整 interaction artifact 與 baseline/after/diff 關閉；F-14 已由 DEV-028 45/45 targeted regression 關閉。F-16 的 production auth 靜態檢查雖已通過，但只能作為先前 QA evidence，必須在 exact release artifact 上重驗。

## 3. Test Harness 與 Golden Master 契約

### 3.1 Baseline 時點

- WP0 必須在 DEV-070 產品 wiring 修改前，以當時 HEAD、working-tree boundary、fixture version 與 runtime URL 建立 baseline。
- 若開工時 worktree 與本計畫日期不同，必須重錄；不得沿用舊 screenshot 或聊天記憶。
- baseline 與 after snapshot 必須使用相同 fixture、viewport、permission role、host mode、origin 與 trigger sequence。
- S0 是 RD 可直接執行的第一片；baseline 尚未產生不構成規格缺口，但 S0 未通過前不得進 S1 以後的任何產品 wiring。

### 3.2 可機讀 artifact

每個 case 至少保存下列結構或語意等效格式；內容不得含真實個資：

```json
{
  "schemaVersion": 1,
  "gitHead": "<sha>",
  "fixtureId": "dev-070-v1",
  "interactionId": "fixture-interaction-id",
  "location": { "hostMode": "board", "origin": "task-workbench" },
  "surfaceId": "task-workbench.placed-row",
  "nodeRole": "task",
  "modality": "fine-pointer",
  "trigger": "pointer.secondary",
  "transientOwners": [],
  "blockers": [],
  "resolved": {
    "actionId": "task.open-menu",
    "sourceLayer": "origin",
    "suppressedReason": null
  },
  "menu": {
    "actionIds": [],
    "enabled": {}
  },
  "effects": {
    "selectedTaskId": "fixture-task-id",
    "detailsTaskId": null,
    "commandCount": 0,
    "mutationCount": 0,
    "commandOutcome": null
  },
  "visibleErrors": []
}
```

動態值（timestamp、DOM-generated ID、animation frame、座標微差）必須 normalize；task ID、Action ID、menu order、enabled state、modal identity、command／mutation count 不得 normalize 掉。

### 3.3 Runtime lifecycle

- DEV-070 destructive local-test seed 固定使用 task-owned `127.0.0.1:4000` 或另一個已記錄的臨時 port；不得在受保護的 `127.0.0.1:4173` 清 localStorage、換 fixture、停止、重啟或清除 port。
- 啟動臨時 runtime 前記錄 project、purpose、port、process tree 與 cleanup condition；完成後只清理該 task-owned process tree，確認臨時 port 已釋放，並再次確認 4173 仍 listening／頁面可達。
- QA baseline 不得要求 production、遠端 provider、schema 或真實帳號資料。

### 3.4 Frozen fixture／artifact contract

- fixture ID：`dev-070-v1`；workspace `dev070-workspace`、board `dev070-board`、cross-board `dev070-board-b`、owner `local-test-user`、denied role `local-test-viewer`。
- required task IDs：`dev070-root-a`、`dev070-card-a`、`dev070-card-completed`、`dev070-child-a`、`dev070-deep-a`、`dev070-milestone-a`、`dev070-other-board-task`、`task_workbench_unplaced_dev070`。
- source of truth 是 `scripts/verify-dev-070-interaction-kernel-browser.pw.js` 內的 frozen seed；baseline／after 必須記錄 fixture hash。若 seed 有任何欄位改動，舊 baseline 作廢並回 S0，不得只更新 after expected。
- artifact 根目錄固定 `output/playwright/dev-070/{baseline,after,diff}`；`interaction-matrix.json`、三 viewport screenshots、visible-error sweep 與 diff 不得缺一。
- Browser runner 必須以 `DEV070_ARTIFACT=<single-line-json>` marker 輸出，`run-dev-070-interaction-kernel-browser.ps1 -Phase baseline|after` 保存；after 不可覆寫 baseline。

## 4. Pure Resolver／Profile Cases

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-070-001 | P0 | 同一完整 context 重複解析 100 次，輸出 deep-equal，resolver 無 store／DOM／Date／random side effect |
| QA-070-002 | P0 | `undefined` 繼承上一層；明確 `disabled` 停用；null／missing 不得意外覆蓋 |
| QA-070-003 | P0 | precedence 固定為 Base → TaskDefault → HostMode → Origin → NodeRole → Transient；Guard 不參與 profile merge |
| QA-070-004 | P0 | unknown host mode、origin、trigger、Action ID 均 fail closed，輸出 diagnostic，不 fallback 到 list／board |
| QA-070-005 | P1 | resolved output 正確標記 source layer；相同 action 被較窄層覆寫時可追溯 |
| QA-070-006 | P0 | 修改 Base 可列出所有 changed locations；未命中的 location 不能漏報 |
| QA-070-007 | P0 | 只改 mindmap HostMode snapshot，list／board／gantt／calendar 與所有 origin 均 zero diff |
| QA-070-008 | P0 | 只改 task-workbench Origin，mode-primary／shared-sidebar／calendar-segment zero diff |
| QA-070-009 | P0 | `(board, task-workbench)` composite override 不污染同 origin 的其他 host mode |
| QA-070-010 | P0 | Profile object deep-freeze／readonly；resolver 與 command 不把 runtime mutable state寫回 Profile |
| QA-070-011 | P0 | Action Catalog stable ID 唯一；每個 mutation action 恰有一個 command；presentation／selection action 不誤掛 mutation |
| QA-070-012 | P0 | `task.delete-request` 只開確認；未確認 mutation=0；確認後 delete command=1 |
| QA-070-013 | P0 | permission 在 menu enabled 與 direct command invocation 都生效；偽造 Profile 不可繞過 Guard |
| QA-070-014 | P0 | shadow-resolve 階段 kernel command count 永遠為 0；kernel-authoritative 階段 legacy executor count 為 0 |
| QA-070-015 | P1 | migration manifest 只允許四個狀態與合法單向 transition；不寫 backend／localStorage |
| QA-070-016 | P0 | Trigger=`replace`、Menu=`patch-by-action-id`、metadata=`catalog-only`、permission=`deny-wins`、Command=`non-mergeable`；不得落入通用 deep merge |
| QA-070-017 | P0 | menu include／exclude 依 stable ID 合併；預設 Catalog section/order 不漂移；missing anchor、duplicate ID、Profile 強設 enabled 均 configuration error |
| QA-070-018 | P0 | exclusive transient owner 0/1 個正常；2 個以上回 `transient-owner-conflict`、action=null、command=0，不自行選優先者 |
| QA-070-019 | P0 | 同一 interactionId 重送 pointerup／touchend／click 時 mutation 最多 1 次；outcome 可區分 executed／noop／denied／cancelled／failed且 denied 不 fallback |

## 5. Location Snapshot／Task Menu Cases

目前 task menu 的相容性集合需由 WP0 實錄；下表是必驗語意，不以文件硬寫結果取代 baseline：

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-070-020 | P0 | List mode-primary 右鍵：action IDs、順序、enabled、divider 與執行結果 before=after |
| QA-070-021 | P0 | Mindmap mode-primary 右鍵：before=after、無外層 rename、無未支援依賴項目 |
| QA-070-022 | P0 | Board L1／L2／L3+ 右鍵：before=after，依賴開始／結束與 assignment 能力不漂移 |
| QA-070-023 | P0 | Gantt task bar 與 shared-task-sidebar 分別記錄 origin；menu before=after |
| QA-070-024 | P0 | Calendar segment 以 calendar host／origin 開 menu，before=after，不因 kernel 出現 board/list action |
| QA-070-025 | P0 | Task Workbench 在每個實際可出現的 host mode 逐一錄製；origin 相同但 host 能力正確繼承 |
| QA-070-026 | P0 | 開 menu 後以 test harness 改變 current view；新架構固定以 open-time location／target snapshot 執行，且正常使用路徑的 before／after menu snapshot 仍 zero diff；此 internal invariant 不以 legacy 的 render-time 猜測作 expected |
| QA-070-027 | P0 | task A 開 menu 後 selection／view 改成 task B；執行 action 仍依既有 menu target lifecycle，不誤改 B |
| QA-070-028 | P0 | canCreate／edit／move／delete／assign／dependency 各自 denied；menu enabled 與 command denial before=after |
| QA-070-029 | P1 | menu 靠 viewport 邊緣、長 title、低高度 1024x768；位置、maxHeight、scroll owner 無漂移 |

## 6. Primary Action／Keyboard／Post-create Cases

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-070-030 | P0 | List task body click：selected ID 與 details modal task ID 正確；close／ESC 後 lifecycle before=after |
| QA-070-031 | P0 | Mindmap node click：selected node＋details；relationship／drag active 時不誤開 |
| QA-070-032 | P0 | Board L1／L2／L3+ click：selected ID＋details；status／assignee／date／dependency／expand／drag controls 不誤開 |
| QA-070-033 | P0 | Gantt bar／Shared Sidebar click：details 正確；move／resize 有位移時 suppress，無位移 click 保留 |
| QA-070-034 | P1 | Calendar／Workbench primary click before=after，沒有新增未核准 keyboard binding |
| QA-070-035 | P0 | List／Board／Gantt 已選 task 按 Enter 開詳情；input、modal、IME composition 時不攔截 |
| QA-070-036 | P0 | Mindmap Enter 建同階、Tab 建子階、四方向導航；不被全域 Enter handler 開詳情或外層 rename |
| QA-070-037 | P0 | Escape 依窄到廣關閉 transient／menu／details／selection，before=after，不觸發 mutation |
| QA-070-038 | P1 | Shift+F10 若 WP0 無現行 binding，after 仍 disabled；不得因 Base capability 新增行為 |
| QA-070-039 | P0 | List／Mindmap／Board／Workbench／drag-create 等目前 post-create 入口，selected／pending title／modal／task count before=after |
| QA-070-040 | P0 | 連續 Enter／Tab／post-create event 不重複建立；每次 successful create 對應一個 post-create command |

## 7. Transient／Drag／Mobile Cases

| Case | Priority | 驗證步驟／Expected |
|---|---:|---|
| QA-070-050 | P0 | Mindmap relationship draft、line label edit、control point、node drag 優先於 task open-details |
| QA-070-051 | P0 | Board dependency selection 點 target 執行既有依賴流程，不開一般 details |
| QA-070-052 | P0 | Record capture／task mention mode 點 task 插入 mention，不開 details、不改一般 profile |
| QA-070-053 | P0 | Desktop drag start／move／drop、no-op、cancel、mouse up：commit／Undo／click suppression before=after |
| QA-070-054 | P0 | 390x844 quick tap 無位移開 details；短滑水平／垂直可 pan 且不開 details/action rail |
| QA-070-055 | P0 | mobile long press 450–550ms 進單一 action mode；rail 恰為完成、新增同階、新增子階、刪除 |
| QA-070-056 | P0 | mobile delete tap／drop 只開確認；cancel mutation=0；confirm mutation=1 |
| QA-070-057 | P0 | mobile add sibling／child、complete、task-position drop 各 command=1，無重複 task／錯序 |
| QA-070-058 | P0 | touchcancel／pointercancel／blur／pagehide／hidden／Escape／timeout 退出 action mode且不 commit |
| QA-070-059 | P0 | DEV-053／054／055／067／068 受影響 targeted verifier 全通過；任一首個失敗即停止 cleanup |

## 8. Rendered UX／Accessibility／Visible-error Cases

| Case | Viewport | Priority | 驗證步驟／Expected |
|---|---:|---:|---|
| QA-070-060 | 1440x900 | P0 | 四主模式 click、keyboard、context menu、details、selection 截圖／DOM before=after |
| QA-070-061 | 1024x768 | P0 | menu、modal、Workbench、Gantt sidebar 無遮擋、裁切、非預期 overflow 或 scroll-owner 漂移 |
| QA-070-062 | 390x844 | P0 | Board／Workbench quick tap、pan、long press、action rail viewport-safe；非開放模式仍不出現 |
| QA-070-063 | all | P0 | `.inline-error`、`[role=alert]` failure、HTTP 4xx/5xx、Not Found、raw `/api/`、console/page error sweep 為空 |
| QA-070-064 | all | P1 | hover／focus／selected／disabled／pressed state before=after；顏色不是唯一 permission/selection 訊號 |
| QA-070-065 | all | P1 | 產品 UI 不出現 DEV-070、profile layer、migration state、source layer、raw action ID 等工程資訊 |
| QA-070-066 | keyboard | P1 | context menu／actions 維持可聚焦、可關閉、disabled 不可執行；focus 不被重構後遺失 |

## 9. Acceptance Traceability

| Acceptance | 自動化／結構證據 | Rendered／操作證據 |
|---|---|---|
| AC-070-001 | QA-070-001～005、016～018 | configuration error 不進 authoritative runtime |
| AC-070-002 | QA-070-007～010 | other-location negative diff |
| AC-070-003 | QA-070-020～027 | menu 開啟後切 view／selection 的 target identity |
| AC-070-004 | QA-070-011～013、017、028 | denied menu／direct command 與 delete confirmation |
| AC-070-005 | QA-070-020～040 | QA-070-060～063 before／after evidence |
| AC-070-006 | QA-070-035～038 | keyboard focus／IME／modal true operation |
| AC-070-007 | QA-070-030～034 | 四模式 click、control exclusion、modal identity |
| AC-070-008 | QA-070-017、020～029 | menu section／order／enabled／viewport |
| AC-070-009 | QA-070-039～040 | new task selection／pending title／details identity |
| AC-070-010 | QA-070-018、050～053 | relationship／dependency／record／drag true operation |
| AC-070-011 | QA-070-054～059 | QA-070-062 mobile rendered evidence |
| AC-070-012 | QA-070-006～009 | affected-location 與 negative diff artifact |
| AC-070-013 | QA-070-014～015、019 | shadow／authoritative executor counter |
| AC-070-014 | QA-070-019、040、057 | repeated event、post-create、mobile action command count |
| AC-070-015 | QA-070-029、060～066 | 三 viewport、focus、visible-error、noise sweep |
| AC-070-016 | QA-070-015＋required source/static boundary | browser network／storage spy negative evidence；無對應 API 時記錄「not applicable」與 source proof |

任何 AC 缺少可重現 evidence 即為未通過；不得只以相鄰 QA case 或 RD 自述推定覆蓋。

## 10. WP Exit Gate 與 Regression Commands

| Work Package | Exit gate |
|---|---|
| WP0 | QA-070-020～040 baseline artifact 完整；既有 DEV-027B／028／029 綠燈 |
| WP1 | QA-070-001～019 通過；shadow command count=0 |
| WP2 | QA-070-020～029 通過；menu snapshot zero diff；executor count=1 |
| WP3 | 每遷移一 mode，該 mode 030～040 通過且其他 mode negative diff=0 |
| WP4 | QA-070-050～066 與 auxiliary location cases 通過 |
| WP5 | 全矩陣、dead-path、targeted regressions、TypeScript、build 通過 |

Slice promotion rule：每個 binding 只可 `legacy-only → shadow-resolve → kernel-authoritative → legacy-removed`。S3～S10 每次 promotion 都需保存當片 browser evidence、其他 location negative diff、legacy/kernel executor count；沒有證據不得批次把多個 binding 直接改成 `legacy-removed`。

S0 baseline 指令介面固定為：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-dev-070-interaction-kernel-browser.ps1 -Phase baseline -BaseUrl http://127.0.0.1:4000/ -OutputDirectory output/playwright/dev-070
```

S3～S11 after／diff 指令介面固定為：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-dev-070-interaction-kernel-browser.ps1 -Phase after -BaseUrl http://127.0.0.1:4000/ -OutputDirectory output/playwright/dev-070
npm.cmd run verify:dev-070-interaction-kernel
```

上述 runner 只連已登記的 temporary runtime；由 runtime owner 依 AGENTS boundary 啟停／清理，不得由 verifier 終止未知 process。

實作完成後最低命令集合：

- `npm.cmd run verify:dev-070-interaction-kernel`
- `npm.cmd run verify:dev-070-interaction-kernel-browser`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish`
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`
- `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency`
- `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser`
- `npm.cmd run verify:dev-054-mobile-task-drag-precision`
- `npm.cmd run verify:dev-054-mobile-task-drag-precision-browser`
- `npm.cmd run verify:dev-055-desktop-task-drag-target-clarity`
- `npm.cmd run verify:dev-055-desktop-task-drag-target-clarity-browser`
- `npm.cmd run verify:dev-067-kanban-l1-drag`
- `npm.cmd run verify:dev-067-kanban-l1-drag-browser`
- `npm.cmd run verify:dev-068-task-title-center-child-drop`
- `npm.cmd run verify:dev-068-task-title-center-child-drop-browser`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`

若 package script 在實作前改名，QC 必須記錄實際替代命令；不得靜默略過。DEV-053～068 只執行實際受 wiring 影響的 targeted 集合，但 DEV-054 mobile、DEV-055 desktop 及直接命中的 DEV-067／068 預設不可省略。

### 10.1 Evidence owner／handoff

| 產物 | 產生者 | Review／裁決者 | Gate |
|---|---|---|---|
| S0 fixture、baseline matrix、fixture hash | RD | QA review | 未核准不得接 wiring |
| pure resolver／catalog／guard／dedupe result | RD | QA review | P0/P1 fail=0 |
| 每片 shadow／authoritative diff | RD | QA review | other-location diff=0、executor=1 |
| 三 viewport screenshots、keyboard/menu/modal、mobile/drag true operation | QC 獨立執行 | QA 彙整；PM 查狀態 | QC 不改產品碼；finding 回 RD |
| 最終 spec/implementation drift、交付狀態 | Dev PM | Human/Release owner | QA/QC PASS 仍不等於 release |

RD 自測結果只可標 `RD Self-Test`; QA 在證據完整前維持 `未執行／執行中`，QC 未獨立驗證前不得標 `PASS`。

## 11. Stop Conditions／Failure Routing

- 任一 P0 before／after diff、雙重 executor、permission bypass、dangerous action bypass 或 unknown fallback：停止當前 WP，回 RD 修 resolver／adapter，不修改產品契約。
- baseline 無法重現、fixture 漂移或舊 spec drift 迫使測試選擇產品行為：標記 `Blocked Human Re-entry`，不得用 update snapshot 解決。
- 只有 snapshot 因刻意產品需求改變時才能更新，且須有新的 Change ID、Spec Impact 與使用者決策來源。
- 任一 visible runtime error、關鍵 viewport 不可操作或 mobile pan/drag regression：QA/QC 不通過。
- 需要 provider、schema、migration、RLS、production 或 deployment：超出 DEV-070，停止並回 Dev PM 分流。

## 12. Exit Criteria

- 本計畫 57 項 in-scope required cases 全部 PASS，16 項 AC 均有直接證據，P0／P1 finding=0。
- golden master before／after 未核准 diff=0；Action executor count 恆為 1。
- `SPEC-070`、`ADR-043`、DEV-070、QA evidence 與實際實作一致，Spec Drift 判定為 `In sync / No contract drift`。
- QC 報告需記錄 route、viewport、fixture、操作、visible-error sweep、screenshots／trace、命令與殘餘限制；未執行前不得標 PASS。
- 不包含 deploy／release；local QA/QC PASS 也不等於 Release Ready。

## 13. Post-implementation QA Reassessment

本節是實作後 QA 重新評估，不變更 SPEC-070 的 Phase 1 產品契約，也不把 release 納入 DEV-070 功能完成率。2026-08-17 本輪 RD→QC 已修復 Gantt mode entry 的 `dragStateRef` TDZ runtime error、手機長按狀態誤綁定與相鄰版面回歸，並完成 local functional gate；release overlay 仍獨立阻擋。

### 13.1 本輪 QC 結果

| 證據層 | 實際結果 | QC 判定 |
|---|---|---|
| DEV-070 pure／source gate | QA-070-001～066 共 57/57 PASS；`commandCount=1` | PASS |
| rendered interaction matrix | `dev-070-v1`；1440x900、1024x768、390x844；desktop 5 modes、mobile board-only；menu／details／selection close evidence；各 viewport errors=0 | PASS |
| golden master | baseline／after 均重建；`fixtureMatch=true`、3 viewport `equal=true`、`ok=true` | PASS |
| required regression | DEV-027B browser PASS；DEV-028 45/45；DEV-029 39/39；DEV-053 30/30 + browser PASS；DEV-054 44/44 + browser 15/15；DEV-055 28/28 + browser 16/16；DEV-067 13/13 + browser 8/8；DEV-068 73/73 + browser 30/30 | PASS |
| implementation health | `npm.cmd exec tsc -- --noEmit` PASS；`npm.cmd run build:test` PASS | PASS |

### 13.2 修復與證據邊界

- RD root cause：`src/components/Gantt/GanttTaskBar.tsx` 在 `useTaskInteractionBinding` 參數中先讀取尚未宣告的 `dragStateRef`，切入甘特圖即觸發 `ReferenceError: Cannot access 'dragStateRef' before initialization`；已將 ref 移到 hook 之前，未改變使用者互動契約。
- 相鄰回歸修復：`TaskDetailsModal` 的日期／工期欄位恢復既有 1024px 幾何；`KanbanCard` 僅在真實 long-press session active 時掛 transient owner，保留手機 quick tap 開詳情；DEV-055 verifier 的標準 drop 只用單步移動，避免測試本身跨過 DEV-068 的 1 秒 child dwell。
- SPEC-028 相容性：DEV-027B 關係線 verifier 改為遵循「關閉詳情即清除 selection」後重新進入 relationship mode 並顯式選 source；不是讓產品保留已清除的 selection。
- Browser：`npm.cmd run verify:dev-070-interaction-kernel-browser`（after）通過三 viewport，包含 visible-error sweep、task data sanity、desktop list/mindmap/board/gantt/calendar、Gantt shared sidebar、mobile board-only、task details／Escape lifecycle。
- Golden diff：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-dev-070-interaction-kernel-browser.ps1 -Phase diff -BaseUrl http://127.0.0.1:4000/ -OutputDirectory output/playwright/dev-070` 通過，diff artifact 為 `output/playwright/dev-070/diff/interaction-diff.json`。
- Runtime boundary：本輪只使用 task-owned Playwright；受保護 4173 與既有 4000 均未停止、重啟或清除。未執行 deploy、push 或 production mutation。

本節 Functional PASS 只代表 local fixture、rendered matrix 與 required regression 已通過；F-01～F-04 仍須依 Gate A／B／C 分流，不得以 local QC PASS 宣告 Release Ready。

## 14. FMEA-to-Test Traceability

| FMEA | 必要功能／回歸 evidence | 必要 release overlay evidence |
|---|---|---|
| F-01～F-04 | 不適用於 local function parity | REL-070-001～006、009～012 |
| F-05 | QA-070-001～066 全矩陣；artifact contract | REL-070-007～008 |
| F-06 | QA-070-001～010、016～018 | REL-070-007 |
| F-07 | QA-070-020～029 | REL-070-007、012 |
| F-08～F-09 | QA-070-011～019、028、040、056～057 | REL-070-007；production 僅做 read-only negative assertion |
| F-10～F-13 | QA-070-023～026、030～040、050～059 | REL-070-007、009、012 |
| F-14 | DEV-028 static＋browser | REL-070-008 |
| F-15 | QA-070-029、060～066 | REL-070-006、009、012 |
| F-16 | production auth／env static checks | REL-070-005～006、009、011～012 |
| F-17 | PWA/cache targeted regression | REL-070-006、009～012 |
| F-18 | QA-070-063、065 | REL-070-006、009、011～012 |

## 15. Risk-based Verification Plan

### Gate A：Release Boundary Readiness

目的：先證明「要驗證的是哪一份程式」。Gate A 未通過不得 build candidate artifact。

| Case | Priority | 前置／步驟 | Expected／Evidence |
|---|---:|---|---|
| REL-070-001 | P0 | 宣告 source branch、target SHA、base／rollback SHA、release path；列出所有 included DEV／commit | scope 無 unknown；若只發 DEV-070，candidate 固定為 clean `288d2ce` 或後續核准修正版 |
| REL-070-002 | P0 | 在 release worktree 執行 `git status --short --branch`、`git diff --name-only`、`git ls-files --others --exclude-standard` | release worktree clean；任何 dirty／untracked 均已分類且 excluded，不得從 canonical dirty worktree build |
| REL-070-003 | P0 | 檢查 upstream、remote reachability 與 target SHA | target commit 已 push、可由遠端 clone／fetch 重建；branch intent 明確 |
| REL-070-004 | P0 | 記錄部署前 production URL、index ETag、JS/CSS/SW asset names／SHA-256、provider release ID、已知 rollback reference | 現行 production provenance 可稽核；找不到 commit mapping 時先建立可操作 rollback point |

### Gate B：Exact Artifact 與 Level 0／2

目的：從 Gate A 的 exact commit 建立唯一 artifact，並證明 artifact 能啟動。build 後 source、lockfile、env contract 或 config 任一改變，Gate B 全部失效重跑。

| Case | Priority | 前置／步驟 | Expected／Evidence |
|---|---:|---|---|
| REL-070-005 | P0 | 在 clean worktree 執行 production env probe、`npm.cmd run verify:production-auth-mode`，檢查 test auto-login／test credential 不進 production | production auth 5/5；required env 無 blocking missing；輸出不含 secret value |
| REL-070-006 | P0 | 執行 `npm.cmd run verify:source` 或等效完整 source gate；從空 `dist` 產生 artifact，記錄 index／JS／CSS／SW manifest 與 SHA-256 | lint 無 error、tsc/build/static gates PASS；artifact 與 target SHA 一對一；warning 逐項分類 |
| REL-070-007 | P0 | 對 exact source/artifact 執行本文件 57 項功能案例與 section 10 regression commands | P0/P1 fail=0；完整 matrix、baseline/after/diff、三 viewport evidence 存在 |
| REL-070-008 | P0 | 啟動 exact production artifact 的 local preview；hard reload＋normal navigation，檢查 shell、assets、SW、console/pageerror/network | Level 2 PASS；HTTP 200、non-empty app shell、critical error=0、asset hash 等於 manifest |

### Gate C：Firebase Preview／Production-like

目的：驗證 Firebase Hosting rewrite、cache、production env、登入與 production-class backend 差異。即使 DEV-070 單獨可視為 Lane 1，因目前存在 provenance/cache 歷史缺口，本次仍要求 Level 3 preview；若 release scope 包含 service、Auth、remote query、Edge Function 或 DEV-069，則為 Lane 2 mandatory。

| Case | Priority | 前置／步驟 | Expected／Evidence |
|---|---:|---|---|
| REL-070-009 | P0 | 將 Gate B exact artifact 部署至唯一 Firebase preview channel；記錄 project、channel、URL、release ID | preview JS/CSS/SW 名稱與 SHA-256 逐檔等於 Gate B；target 明確為 `projed-cc78d` |
| REL-070-010 | P0 | Preview 以未登入與既有安全測試帳號分別 hard reload、normal reload；檢查 auth、資料 sanity、SW/cache/chunk | app shell／登入／讀取正常；無 missing env、ChunkLoadError、4xx/5xx、all-zero unexpected counters |
| REL-070-011 | P0 | Preview 於 1440x900、1024x768、390x844 執行受影響模式 read-only smoke；mutation、drag commit、delete 只在 local fixture 驗證 | List／Mindmap／Board／Gantt／Calendar／Workbench／Sidebar 可切換；visible error=0；viewport-safe |

### Gate D：Production Level 4

目的：只在 Gate A～C 全綠、rollback ready 後執行；Deploy success 不等於 Release PASS。

| Case | Priority | 前置／步驟 | Expected／Evidence |
|---|---:|---|---|
| REL-070-012 | P0 | 部署 Gate B 的同一 artifact；立即比對 production URL、index ETag、release ID、JS/CSS/SW hashes，執行 app-shell＋authenticated read-only feature smoke | production artifact 與 Gate B/C 完全一致；HTTP/assets 200、critical error=0、模式入口與 task read-only interaction正常；若 hash／版本不符立即 rollback |

## 16. Test Data／Viewport／Evidence Contract

### 16.1 測試資料

- Local mutation／permission／drag 使用 `dev-070-v1`：owner＋viewer、L1～L4、completed parent、milestone、dependency、placed／unplaced、cross-board task。
- Preview／production 使用既有安全登入帳號，只做 read-only smoke；不得建立、移動、完成、刪除正式 task，除非另有 disposable fixture 與明確 mutation authorization。
- menu permission matrix 必須至少有 owner／viewer；不得以 owner-only pass 推定 deny-wins。
- artifact、console、trace、screenshot 不得包含 email、真實 task title、member name、access token 或完整 API payload。

### 16.2 必測 viewport／操作面

| Viewport | 必測 surface／互動 |
|---|---|
| 1440x900 | List、Mindmap、Board、Gantt、Calendar、Workbench、Shared Sidebar；primary、secondary、keyboard、menu、modal、selection |
| 1024x768 | menu edge positioning、modal、Workbench、Gantt sidebar、scroll owner、長 title |
| 390x844 | Board／Workbench quick tap、short pan、long press、compact rail、cancel、confirm dialog viewport；非開放模式不得意外出現 |

### 16.3 Evidence 最小集合

- Git：branch、target SHA、upstream、clean status、included/excluded manifest、rollback SHA。
- Functional：fixture hash、57-case result、interaction matrix、menu/permission/command counters、baseline/after/diff。
- UI：每 viewport 的 route、timestamp、操作、screenshot、DOM state、visible-error／information-noise sweep。
- Runtime：console/pageerror、failed network、HTTP status、auth/data sanity。
- Artifact：build command、index ETag、JS/CSS/SW names＋SHA-256、Firebase preview／production release ID。
- Release：preview／production hash equality、authenticated read-only smoke、rollback readiness/result。

## 17. QC Execution Order／Stop Rules

QC 必須依 `Gate A → B → 57-case functional gate → Gate C → Gate D` 順序執行。第一個 P0 failure 即停止，不繼續用後段成功掩蓋前段失敗。

硬性 stop conditions：

1. target SHA、release path、included/excluded scope 或 rollback reference 任一不明。
2. release worktree dirty，或 build 後 source／lockfile／env contract 改變。
3. browser verifier 未產生完整 matrix／diff，或 baseline/after 被覆寫。
4. DEV-028、DEV-029、drag/mobile targeted regression 任一必要案例失敗。
5. permission bypass、double mutation、wrong task target、danger confirmation bypass、unknown fallback。
6. 任一 in-scope viewport 出現 visible error、critical console/pageerror、failed chunk、重疊／裁切／不可操作。
7. Preview／production asset hash 不等於 Gate B artifact，或 production artifact 無 provider release mapping。
8. 正式站需要寫資料才能證明功能；改回 local/disposable fixture，不在 production 冒險補證據。

## 18. QA Release Decision Rule

- `QA Functional PASS`：57 項功能案例、16 項 AC、required regressions、rendered evidence 全綠；只代表 DEV-070 local behavior-preserving contract 通過。
- `Release Candidate Ready`：另需 REL-070-001～011 全綠、exact artifact 與 rollback ready。
- `Production Release PASS`：只有 REL-070-012 的 Level 4 production smoke 與 artifact provenance 通過後才成立。
- `Blocked`：目前狀態。F-01～F-04 尚未關閉；本輪 local functional evidence 不得取代 Gate A provenance、exact artifact、preview 或 Release Ready 判定。
- Residual-risk gate：控制措施執行後不得保留 Critical／High residual risk；Medium residual risk 必須有可重現 evidence、owner、rollback／recovery，並由 release owner 明確接受。
