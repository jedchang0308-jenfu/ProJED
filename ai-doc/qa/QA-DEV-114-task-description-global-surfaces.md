# QA-DEV-114：任務說明全介面覆蓋與重複名稱懸浮清理驗證計畫

- 日期：2026-09-10（Task Details surfaces amendment）
- 狀態：Executed / DEV-114 + compatible regression PASS / NOT RELEASED
- 對應 DEV：DEV-114
- 對應 SPEC：`ai-doc/specs/SPEC-114-task-description-global-surfaces.md`
- 驗證階段：Local candidate；DEV-114 targeted QA-QC 已完成；尚未 release
- 風險：Medium

## 驗證目標與邊界

驗證 19 個納入位置共用 DEV-111 的單例桌面 hover card，只有非空任務說明在 fine pointer 停留 1000ms 後顯示；
說明卡不含任務名稱或欄位標籤，指定 native `title` 已移除，current-title／touch／control 排除位置與既有互動維持不變。

本計畫不接受只看 DOM 或只跑單元測試即宣告完成。最終 PASS 必須同時具備 static contract、實際瀏覽器互動、
viewport、visible-error sweep、console/page error、network failure 與既有回歸證據。

## Entry Criteria

- [x] DEV-114 與 SPEC-114 已升級為 RD Implementation Complete，沒有 DEV-114 P0／P1 blocker。
- [x] 實作 revision 與 SPEC source revision 完成 drift check；TaskDetailsModal 的預期 title 清理差異及 owner 已記錄。
- [x] `TaskDetailsSubtaskSection.tsx` protected baseline SHA-256 維持一致；`TaskDetailsModal.tsx` 只有 SPEC 定義的名稱 title 清理與 breadcrumb metadata 變更。
- [x] 只修改 SPEC 定義的 file surface；protected no-change zones 無本期功能 drift。
- [x] 19 個位置的 fixture 可辨識且說明內容互不相同；DEV-114 browser fixture 使用唯一 `DEV114-*` 字串。
- [x] Task Details surfaces amendment candidate 已於最後 browser run 後凍結；之後僅更新文件與證據。
- [x] 重用既有 matching runtime：`http://localhost:4000/`、Vite listener PID `28532`、wrapper PID `3264`；本任務未擁有且未停止，
  cleanup condition 為保留既有 runtime，不終止其他 `node.exe`。

## 測試資料與 Fixture

| Fixture | 必要資料 | 用途 |
|---|---|---|
| F01 | current board L1／L2／L3+，各有唯一非空多行說明 | 核心模式與內容對應 |
| F02 | whitespace-only 與完全空白說明任務 | no-card／no-indicator |
| F03 | 含 `<b>not html</b>`、換行、長文字的說明 | 純文字、安全與 overflow |
| F04 | 工作台未歸位、已歸位／全部任務，各有唯一說明 | 兩類工作台列 |
| F05 | archived child＋可解析 parent，各有不同說明 | 回收桶 identity |
| F06 | 紀錄已連結任務＋inline mention，任務說明互異 | link／mention identity 與 serialization |
| F07 | RAG `wbs_items` task citation、non-task citation、store 缺來源 task citation | 類型與 missing-source no-op |
| F08 | 訂閱預覽跨板 event，其 node 不在目前 WBS store | inline-content 唯一路徑 |
| F09 | 同 task ID 的 store 說明與訂閱 inline 說明刻意不同 | inline 優先序 |
| F10 | 長任務名稱、長父路徑、窄 viewport | truncation、native tooltip 與排除 |
| F11 | pending 期間同一 DOM row 的 `data-task-id`／inline source kind 被替換 | virtualized／reused row stale guard |
| F12 | 回收桶 restore/delete controls、紀錄 role select 與 action controls | trigger ownership 與 action tooltip 競爭 |

Fixture 必須使用可追蹤唯一字串，例如 `DEV114-WORKBENCH-DESC`；不得用相同說明造成錯任務仍誤判 PASS。

## FMEA 與風險導向測試

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| resolver 優先序錯誤 | inline presence 與空值語意未區分 | 訂閱預覽顯示目前 store 的錯內容 | F08／F09，pending 前後重讀 | P0 | inline presence 優先；空值不得 fallback |
| timer 顯示 stale task | timer 捕捉舊 ID、row reuse、source-kind 改變 | 誤導使用者正在看的任務 | F11 在 1000ms 內替換 ID／來源／卸載 | P0 | 比對 trigger＋taskId＋sourceKind 候選快照 |
| control hover 誤啟動說明 | trigger 掛在含 button/select 的整列 | 說明卡與操作提示競爭 | F12 逐一 hover／click／keyboard controls | P1 | trigger 只掛 identity zone，不加廣域 exclude |
| canonical ID 選錯 | 把 provider storage ID 當 app task ID | 卡片 identity／a11y 關聯錯誤 | F08 檢查兩種 ID 與原 preview identity | P0 | hover 固定用 `event.node.id`，保留既有 preview attrs |
| 缺來源 fallback 到 title | 將 citation／mention 名稱誤作描述 | 把名稱冒充說明 | F07 missing-source negative | P1 | no-card／no-indicator／no-fetch |
| DOM `title` 未清除或誤刪 action title | 廣域刪除或漏改 | 雙 tooltip或控制不可理解 | F10/F12 attribute＋accessible-name audit | P1 | 僅精準移除指定名稱 title，保留 action a11y |
| mention 序列化被破壞 | 把 DOM title 與 serialized title 混用 | 紀錄資料回歸 | save／reload／HTML+JSON round trip | P1 | 保留 node ID、data-title 與 serialized title |
| hover trigger 攔截既有互動 | wrapper／listener 改變 event ownership | click、drag、restore/delete 回歸 | direct module regressions＋真實操作 | P1 | presentation-only attributes；既有 handlers 不變 |
| 排除位置誤接或 touch 啟動 | selector 過廣／媒體判定漂移 | 冗餘入口或手機誤操作 | title/breadcrumb/touch negative | P1 | 390×844 coarse pointer 必須完全 no-op |
| 長內容或技術錯誤被掩蓋 | viewport clamp／error sweep 不完整 | 無法閱讀或假 PASS | 四邊幾何＋normal/error fixture sweep | P1 | 12px margin；預期與非預期 error 分流記錄 |

## UI Entry Contract

| 表面 | Actor／起始畫面 | 正常入口與測試限制 |
|---|---|---|
| 核心五模式／TaskDetails | 已登入且對目前看板有讀取權的 owner、member 或 viewer；App shell 已選定 workspace／board | 由既有 ModeSwitcher 進入各模式；由既有任務操作進入 TaskDetails，不可直接 mount component |
| 全域任務工作台 | 同上 | 使用 topbar `data-mobile-task-workbench-nav-entry="true"`／既有平台切換；390px 只驗證 coarse-pointer no-op |
| 回收桶 | 有目前看板讀取權；編輯／刪除 actor 另依 control case | 設定 → 備份／資料移轉 → `data-settings-open-current-board-trash="true"`「目前看板回收桶」；不得用私有 route 取代正常導覽 |
| 紀錄 link／mention | 可開啟紀錄庫與既有紀錄 composer 的 actor | Sidebar「紀錄庫」或既有紀錄 composer → 已連結任務／正文 mention；round trip 必須經正式 save/reload 路徑 |
| AI task citation | 可開啟 AI 助理且有目前 project 讀取權 | topbar `data-ai-analysis-open="true"` → 正常提問；在既有 Supabase Function network boundary 回傳 deterministic citation fixture，不改 `useRagStore`、不直接注入 DOM、不得依賴 live model |
| 訂閱預覽 | 有設定讀取權的 actor | Sidebar 設定 → `data-settings-section-tab="calendar"` → 既有 create/edit builder → preview event；不得直接 mount preview component |

underlying surface 的 normal／loading／empty／error／permission-denied／narrow state 必須維持既有行為。本功能不新增
loading 或 error UI；loading、empty、permission denied 或預期 error state 中若沒有 canonical task representation，
不得出現說明卡。normal fixture 出現任何 visible alert／載入失敗／console/page error／非預期 4xx/5xx 即 Fail；
刻意測試既有 error state 時，預期 alert 可存在，但必須事先列為 fixture oracle，且不得產生新的 hover error。

## Static Contract Cases

| Case | 驗證 |
|---|---|
| S01 | `TaskDescriptionHoverCard` 仍為 MainLayout 單例，無第二 controller／per-row timer |
| S02 | resolver 以 trigger＋taskId＋sourceKind 建立候選；inline 優先、store 次之，兩個時點都重讀並拒絕 row reuse |
| S03 | inline attribute 只出現在 `CalendarSubscriptionBuilderPreview` |
| S04 | 工作台兩類列、回收桶兩種 identity、record link、mention、task citation 具有 canonical task ID；訂閱 hover 明確用 `event.node.id` |
| S05 | `CitationCard` 只允許 `wbs_items`，missing source 無 fallback／fetch |
| S06 | mention 保留 node ID、serialized title／`data-title`，僅移除 DOM native `title` |
| S07 | MindMap、Workbench、Recycle、RecordSidebar、TaskDetails 指定名稱／位置 `title` 不存在 |
| S08 | 回收桶／紀錄 trigger 只在 task identity zone；action/control `title`／tooltip、`aria-label`、role、focus 未被廣域刪除 |
| S09 | stable title slots 使用共用 `TaskDescriptionIndicator`；inline mention 不新增 indicator |
| S10 | `ragContract`、`useRagStore`、backend、schema、migration、permission 無變更 |
| S11 | `TaskDetailsSubtaskSection`、`MainLayout`、indicator 元件無結構變更；`TaskChecklistTree` 僅保留 row／drag ownership 並增加 Task Details scoped metadata |
| S12 | package scripts 與 browser evidence 路徑已登記，無 completed marker 假宣告 |

## Browser Cases

本表以行為群組列出 B01～B22；實際 browser verifier 為 B01～B26＋B02a，另拆出 1024×768 clamp、mobile overflow／coarse pointer 與錯誤掃描證據。

| Case | 路徑／情境 | 期望 |
|---|---|---|
| B01 | 看板 L1／L2／L3+、清單、心智圖、甘特、行事曆與共用側欄 | 既有入口 1000ms 後顯示正確純文字說明 |
| B02 | 任務詳情子任務列 | 共用列顯示子任務說明；Task Details scoped trigger metadata 不改 row／drag ownership |
| B02a | 任務詳情上層任務路徑／麵包屑 | ancestor task ID 對應自身說明；卡片位於 modal 上層且不顯示 ancestor 名稱 |
| B03 | 工作台未歸位任務列 | 完整列 hover、正確 indicator、無位置 native tooltip |
| B04 | 工作台已歸位／全部任務列 | 與 B03 同契約，click/details 不回歸 |
| B05 | 回收桶 archived task identity zone 與 restore/delete controls | identity zone 顯示說明；controls 不啟動／保留說明卡，action tooltip 與操作不受影響 |
| B06 | 回收桶父任務名稱 | 顯示父任務說明，不誤用 child 說明 |
| B07 | 紀錄已連結任務 identity zone 與 role/action controls | icon＋名稱顯示說明；select/actions 不啟動／保留說明卡，既有 role/navigation 不回歸 |
| B08 | inline task mention | 顯示 mention task 說明，無 indicator/native title，save/reload identity 不變 |
| B09 | RAG task citation | 來源在 store 時顯示；citation navigation 不回歸 |
| B10 | RAG non-task／missing-source | 不顯示 card／indicator，也無名稱 fallback 或新 network request |
| B11 | subscription cross-board event | store 無 node仍顯示 inline 最新說明；hover ID=`event.node.id`，既有 preview event ID/filter/feed 不變 |
| B12 | inline 與 store 同 ID 內容不同 | 必須顯示 inline 內容，證明優先序 |
| B13 | whitespace／empty description | 所有代表入口都沒有 card／indicator |
| B14 | 1000ms 前離開、切 task、清空內容、卸載，或同一 DOM row 改 task ID／source kind | timer 取消，不顯示 stale card |
| B15 | card 內容 | 只有 description；無 task title、欄位 label、helper，HTML-like 字串不解析 |
| B16 | Escape、外部 pointerdown、source scroll、resize、blur、visibility、drag start | card 收合；內部 scroll 不誤關閉 |
| B17 | 1440×900／1024×768 四邊＋長內容 | portal 不裁切、距 viewport 至少 12px、內部可捲動 |
| B18 | 390×844 touch/coarse 模擬 | 所有位置不啟動 hover；無長按／點擊替代 |
| B19 | TaskDetails 目前標題、drag/drop/select preview、非任務 citation | 明確排除位置不啟動；ancestor breadcrumb 已由 B02a 納入 |
| B20 | 指定 native title 與操作 tooltip 對照 | 重複名稱／位置 tooltip 不存在，操作提示仍存在且可存取 |
| B21 | click、double-click、details、selection、context menu、drag、restore/delete | 全部維持既有 ownership |
| B22 | 每一路徑 visible error sweep | normal fixture 無 alert／載入失敗／錯誤空態／console/page error／非預期 4xx/5xx；預期 error fixture 依已登記 oracle 判定且無新增 hover error |

## Viewport 與 Accessibility Matrix

- 1440×900：桌面主證據、完整 19 位置、四邊幾何與長內容。
- 1024×768：窄桌面、truncate、popover/overlay 競爭、viewport clamp。
- 390×844：touch/coarse negative；不以 browser mouse hover 假代 touch。
- `role="tooltip"`、`aria-describedby` 開關、其他 describedby token 保留、indicator `aria-hidden` 與非 focus 必須量測。
- 原生 `title` 清理後，互動控制仍須有可計算 accessible name。

## 自動化與人工證據

依序執行：

1. `npm run verify:dev-114-task-description-global-surfaces`
2. `npm run verify:dev-114-task-description-global-surfaces-browser`
3. `npm run verify:dev-111-task-description-hover-card`
4. `npm run verify:dev-111-task-description-hover-card-browser`
5. `npm run verify:dev-028-cross-mode-task-interactions`
6. `npm run verify:dev-028-cross-mode-task-interactions-browser`
7. `npm run verify:dev-098-task-detail-subtasks`
8. `npm run verify:dev-098-task-detail-subtasks-browser`
9. `npm run verify:dev-039-task-workbench-placement-lanes`
10. `npm run verify:dev-039-task-workbench-placement-lanes-browser`
11. `npm run verify:dev-045-calendar-subscription-builder-preview`
12. `npm run verify:dev-045-calendar-subscription-builder-preview-browser`
13. `npm run verify:dev-088-task-lifecycle`
14. `npm run verify:dev-088-task-lifecycle-browser`
15. `npm run verify:dev-006-gmail-editor`
16. `npm run verify:dev-006-browser-input`
17. `npm run verify:dev-107-record-sidebar-layout`
18. `npm run verify:dev-107-record-sidebar-layout-browser`
19. `npm run verify:dev-002-records`（CitationCard／紀錄基線靜態 guard）
20. 受影響檔案 ESLint、`npx tsc --noEmit`、`npm run build:test`、`git diff --check`

## Execution Record

| Gate | 結果 | 證據／備註 |
|---|---|---|
| DEV-114 static | PASS 29/29 | `npm run verify:dev-114-task-description-global-surfaces` |
| DEV-114 browser | PASS B01～B26＋B02a（27/27） | Chromium、1440×900／1024×768／390×844；`output/playwright/dev-114-task-description-global-surfaces/result.json`；0 browser/page/HTTP error；Task Details screenshot confirms card above modal |
| Engineering | PASS | `npx tsc --noEmit`、受影響檔案 ESLint（0 error；TaskMentionNode 既有 2 warnings）、`npm run build:test`、`git diff --check` |
| Compatible static gates | PASS | DEV-111 38/38（verifier 相容新 resolver）、DEV-028 48/48、DEV-039 33/33（同步目前 capability／shared date module contract）、DEV-098 22/22、DEV-045 19/19、DEV-088、DEV-006、DEV-107 20/20、DEV-002 16 file groups（同步 DEV-110 typed unresolved-link contract） |
| Compatible browser gates | PASS | DEV-039 placement-lanes browser、DEV-006 editor input browser 均 PASS（`output/playwright/dev-006-gmail-editor.png`）；DEV-114 專用 browser 已補 1024×768 證據，其餘既有 gate 證據沿用同一 local candidate／固定 artifact。 |

Browser evidence 固定寫入 `output/playwright/dev-114-task-description-global-surfaces/`。每組證據必須記錄 route、viewport、
fixture ID、預期／實際內容、dwell 時間與失敗畫面；只有 pass count 沒有實畫面證據不構成 QC PASS。

## Runtime Lifecycle

實際瀏覽器驗證使用專案固定入口 `npm run dev:local`（預期 `http://localhost:4000`）。開始前先檢查是否已有可安全
重用的 matching runtime；若新啟動，記錄 project、purpose、port、owning PID/process tree 及 cleanup condition。
完成或中止時只停止 DEV-114 擁有的 process tree，並確認 port 已釋放；不得終止所有 `node.exe` 或未知 runtime。

## Exit、Fail 與 Reopen Gate

PASS 需要 S01～S12、B01～B26＋B02a、engineering gates 與 evidence inventory 全數通過，且 candidate hash 未在驗證中改變。

下列任一成立即 Fail／reopen：錯 task description、stale card、名稱 fallback、touch 啟動、雙 tooltip、操作 tooltip／
accessible name 遺失、control hover 誤啟動、canonical ID 錯置、serialization 漂移、click/drag 回歸、normal fixture
visible error、console/page error、非預期 4xx／5xx、
protected file drift、runtime 未清理或證據不足。不得以「預期如此」覆寫未在 SPEC 登記的失敗。

## 目前結論

DEV-114 candidate 已完成並凍結；DEV-114 專用 static／browser、1024×768 窄桌面證據、相容 static／browser 與 engineering gates PASS。
觸控／mobile／coarse pointer 仍維持 no-op，任務名稱／位置重複 tooltip 已移除，操作型 tooltip 與既有 popover 未被清理。
本文件仍標示 `NOT RELEASED`，因為正式版本仍須另走 release gate；這不構成 DEV-114 開發 blocker。

使用思考習慣：#可驗證性、#風險意識、#完成定義
