# SPEC-114：任務說明全介面覆蓋與重複名稱懸浮清理

- 日期：2026-09-10（Task Details surfaces amendment）
- 狀態：RD Implementation Complete / RD Tech Lead Review PASS / 架構已定案 / DEV-114 + compatible regression PASS / NOT RELEASED
- 關聯 DEV：DEV-114
- 上游基線：DEV-111、`SPEC-111-task-description-hover-card.md`
- QA：`ai-doc/qa/QA-DEV-114-task-description-global-surfaces.md`
- 風險：Medium（跨多個可見表面、既有 click／drag ownership 與兩種唯讀說明來源）
- Source revision：`1b6450355ed81180c5abd419ac756564cff1b3c0`（分支 `持續優化3`）＋下方
  `Architecture Review Baseline`；candidate implementation 與 Task Details surfaces amendment 已完成，候選 hash 已更新

## 目的與使用者決策

DEV-111 已提供單一集中式桌面任務說明 hover card，但目前只有核心閱讀模式完整接通。使用者要求將相同行為
延伸至所有已盤點的持久任務呈現，同時移除只重複畫面既有任務名稱或位置的瀏覽器原生 tooltip。

本規格固定以下決策：

1. 說明卡只顯示非空的任務說明，不顯示任務名稱、「任務說明」標籤、helper 或第二個標題。
2. 桌面 fine pointer 持續停留 1000ms 才顯示；mobile／touch／coarse pointer 不啟動，也不新增長按或點擊替代。
3. 任務詳情的子任務列與上層任務路徑／麵包屑納入；目前任務標題仍不納入。
4. 只重複任務名稱或位置的 DOM `title` 移除；操作型 tooltip、`aria-label`、資料屬性與點擊式 popover 保留。
5. 沿用 DEV-111 的單例 controller，不建立第二套 hover 元件或每列 timer。

## Spec Impact

分類：`Intentional replacement + compatible extension`。

- `SPEC-111`：有意取代其「五個閱讀模式」及 TaskDetails／工作台排除範圍，擴充為本規格的完整位置矩陣；
  1000ms、fine pointer、plain text、單一 overlay、dismissal、viewport、a11y 與無資料變更契約繼續有效。
- `SPEC-098`：任務詳情子任務仍由共用 `TaskChecklistTree` 呈現；本期只增加 scoped hover metadata，
  不修改 `TaskDetailsSubtaskSection` 的結構或 DEV-098 行為。
- `SPEC-039`：全域任務工作台既有來源、階層、未歸位／已歸位 placement lane 與 placed-row readonly ownership 不變。
- `SPEC-045`／`ADR-038`：訂閱預覽的 canonical event identity、filter snapshot、preview／ICS parity 與 provider payload
  不變；本期只增加 presentation metadata。
- `SPEC-088`：回收桶還原、永久刪除、權限與確認流程不變；說明 hover 不得包住操作控制區。
- `SPEC-004／006／020`：TaskMention identity／序列化、紀錄 editor 流程與 task-link role 控制不變。
- `SPEC-065`：既有 task surface／subtree frame 與 drag preview ownership 不變。
- `SPEC-028／070`：不新增 command、selection 或 mutation；click、double-click、details、context menu、drag 不變。
- `SPEC-066`：`TaskNode.description` 仍是既有 plain-text compatibility projection；不建立第二份正文。
- ADR：不需要。本次是局部、可逆、無 schema／API／權限／狀態機變更的 presentation extension。

## UX Intent

- 任務／結果：使用者在任何納入的持久任務呈現上，都能以相同方式按需閱讀任務說明。
- 主物件／主焦點：游標目前停留的單一 canonical task representation。
- 預設刪除：重複名稱／位置 native tooltip、說明卡內的名稱與欄位標籤、第二套 overlay。
- 保留舉證：有穩定標題槽位且說明非空時沿用 9px 非互動說明圖示；inline mention 不新增圖示，避免改變文流。
- 非語言修復：沿用完整 task surface、單例 overlay 與 viewport clamp；不新增文字入口或框中框。
- 風險：來源解析錯誤、stale timer、雙 tooltip、inline mention 序列化漂移、跨板引用缺資料及既有互動回歸。

## 適用與排除矩陣

| # | 區域／位置 | Hover | 說明來源 | 非空標示 | Native tooltip 處置 |
|---:|---|---|---|---|---|
| 1 | 看板 L1 欄標題 | 套用 | WBS store | DEV-111 既有 | 無新增 |
| 2 | 看板 L2 任務卡 | 套用 | WBS store | DEV-111 既有 | 無新增 |
| 3 | 看板 L3+ 子任務列 | 套用 | WBS store | DEV-111 既有 | 無新增 |
| 4 | 清單所有層級任務列 | 套用 | WBS store | DEV-111 既有 | 無新增 |
| 5 | 心智圖任務節點 | 套用 | WBS store | DEV-111 既有 | 移除任務名稱 `title` |
| 6 | 甘特圖任務條 | 套用 | WBS store | DEV-111 既有 | 無新增 |
| 7 | 甘特圖共用任務側欄 | 套用 | WBS store | DEV-111 既有 | 無新增 |
| 8 | 行事曆任務日期區段 | 套用 | WBS store | DEV-111 既有 | DEV-111 已移除名稱 `title` |
| 9 | 行事曆共用任務側欄 | 套用 | WBS store | DEV-111 既有 | 無新增 |
| 10 | 任務詳情子任務列 | 套用 | WBS store | 共用列既有 | 無新增 |
| 10a | 任務詳情上層任務路徑／麵包屑 | 套用 | ancestor task ID → WBS store | 新增 explicit trigger | 移除祖先任務名稱 `title` |
| 11 | 全域任務平台未歸位任務列 | 套用 | WBS store | 新增 | 移除任務位置 `title` |
| 12 | 全域任務平台已歸位／全部任務列 | 套用 | WBS store | 新增 | 移除任務位置 `title` |
| 13 | 回收桶已封存任務的名稱／識別區 | 套用 | WBS store | 新增 | 移除任務名稱 `title`；操作欄不納入 trigger |
| 14 | 回收桶原始位置父任務名稱 | 套用 | 父 task ID → WBS store | 新增 | 不新增；無父 task ID 時不套用 |
| 15 | 紀錄編輯已連結任務的 icon＋名稱識別區 | 套用 | link node ID → WBS store | 新增 | 移除任務名稱 `title`；role select／action 不納入 trigger |
| 16 | 紀錄內容行內任務 mention | 套用 | mention node ID → WBS store | 不新增 | 移除 DOM `title`；保留序列化資料 |
| 17 | AI 助理 `wbs_items` 任務引用卡 | 套用 | citation source ID → WBS store | 來源可用時新增 | 不新增 |
| 18 | 行事曆訂閱任務事件預覽列 | 套用 | 已載入 event node 說明快照 | 新增 | 不新增 |

| 明確排除 | 契約 |
|---|---|
| 任務詳情目前任務標題 | 不啟動 hover；移除 editable／readonly 任務名稱 `title` |
| mobile／touch／coarse pointer | 不啟動 hover，不新增替代 gesture |
| 尚未轉成正式任務的快速收件內容 | 無 canonical task identity，不套用 |
| drag／drop／insert／selection preview | 暫態互動回饋，不套用 |
| context menu／confirm／toast | 操作或結果訊息，不套用 |
| 任務數量、一般文字、歷史純文字片段 | 無單一 canonical task identity，不套用 |
| AI 專案、紀錄、文件等非 `wbs_items` 引用 | 不是任務引用，不套用 |

## Architecture Closure Review

### 1. 現況與單例 ownership

- `MainLayout` 已只掛載一個 `TaskDescriptionHoverCard`；由 document-level delegated pointer listener 處理入口。
- 既有 canonical selectors 為 `[data-task-surface-source="true"][data-task-id]` 與
  `[data-task-description-hover-trigger="true"][data-task-id]`。
- 既有內容於排程前及 1000ms 到時後，都從 `useWbsStore.getState().nodes[taskId].description` 重讀。
- `TaskDescriptionIndicator` 已集中處理 trim、9px icon、11px slot、`pointer-events: none` 及 `aria-hidden`。

### 2. 已定案的候選快照與雙來源 resolver

中央 controller 以 `HoverCandidate { trigger, taskId, sourceKind, description }` 表達 pending 候選；只接受
`store`、`inline` 兩種唯讀來源，優先序與一致性固定：

1. 排程前從 trigger 解析 `taskId`、`sourceKind` 與 description；若明確具有
   `data-task-description-hover-content`，source kind 為 `inline`，以 attribute 的最新值 `trim()` 後為準；
   即使值為空，也視為有意指定空內容，不得 fallback 到 store。
2. 否則 source kind 為 `store`，以 `data-task-id` 查詢
   `useWbsStore.getState().nodes[taskId]?.description?.trim()`。
3. 1000ms 到時後必須從同一個仍 connected／hovered 的 trigger 再解析一次；只有 trigger、`taskId`、
   `sourceKind` 均與原候選相同，且最新 description 非空時才能顯示。任一 attribute 被移除、DOM row 被重用成
   另一任務、來源種類切換或內容變空，都必須取消候選並清除本功能的 `aria-describedby`。
4. `data-task-description-hover-content` 只允許行事曆訂閱預覽使用，因其已持有跨看板 `TaskNode`，不保證在目前
   WBS store；其餘 17 類入口不得複製說明快照到 DOM。
5. 所有內容由 React text node 顯示；attribute 與 React render 都必須保持純文字，不使用 `innerHTML`。
6. 訂閱預覽的 hover `data-task-id` 必須使用 canonical app identity `event.node.id`；不得沿用可能是 provider
   storage identity 的 `data-preview-event-task-id={event.node.storageId ?? event.node.id}`。既有 preview event identity
   attribute 本身不得修改，避免破壞 SPEC-045 preview／feed parity。

### 3. 缺資料、錯誤與權限

- 本功能不發出 hover-time async fetch，不新增 loading spinner、retry、cache 或 provider read。
- RAG 任務 citation、mention 或連結的 source ID 若不在目前 store，安靜地不顯示 card／indicator；不得以 citation
  title、mention title、其他 task 的 stale description 或空白 placeholder 代替。
- 既有頁面讀取權限就是本功能的權限邊界；不新增或繞過授權檢查。
- 不新增 schema、migration、API、RAG contract、索引欄位、transaction 或持久狀態。
- 跨看板 AI citation 若未來要求必須顯示，應另建 DEV 處理 citation 資料契約與 reindex，不能在本期臨時擴權。

### 4. 互動與 accessibility

- fine pointer 在同一 trigger 持續 1000ms 後顯示；離開或 identity 改變必須取消前一 timer。
- 沿用 DEV-111 的 Escape、外部 pointer down、來源 scroll、resize、blur、visibility hidden、drag start dismissal。
- Portal tooltip layer 使用 `z-[10050]`，高於 Task Details `z-[10000]` modal 與其 drag／action layers，避免卡片存在於 DOM
  卻被 modal 視覺遮蔽；仍維持 pointer grace、dismissal 與不攔截 trigger 操作的契約。
- 開啟時以 `aria-describedby` 關聯 trigger 與 `role="tooltip"`；關閉時只移除本功能加入的 ID。
- 移除 DOM `title` 不得移除 `aria-label`、button accessible name、keyboard focus、role、序列化 `data-title` 或元件
  的資料 prop。操作型 tooltip 必須保留。
- 行內 mention 不新增說明圖示、不改 Lexical JSON／HTML 序列化與 node identity，只增加 hover trigger 與 task ID。
- 回收桶只允許名稱／父任務 identity zone 成為 trigger；還原、永久刪除與其操作欄不是 trigger。紀錄已連結任務只允許
  icon＋名稱 identity zone 成為 trigger；role `select`、新增、解除或其他 action control 不是 trigger。游標停在這些
  controls 時不得排程或保留任務說明卡，原 action tooltip／accessible name 必須繼續生效。
- 工作台可維持整個 canonical task row 為 trigger；RAG citation card 與訂閱 event row 本身即為單一閱讀物件，
  可使用整個 representation。不得為少數 control 另加中央 `exclude` selector，除非實作證明精準 trigger zone
  無法成立並先回到 PM 重新審查。

### 5. 狀態、恢復與一致性

- 本功能只有 `idle → pending → visible → dismissed` 的本地 overlay 狀態；不新增產品狀態機或 persisted preference。
- pending 期間來源消失、內容變空或 trigger 被卸載時回到 idle；不得顯示上一個任務內容。
- 任務切換、route change 或 overlay dismissal 後沒有需要 rollback 的資料變更。
- overlay 發生例外時不得阻斷既有 task click／navigation；visible technical error、console/page error 或 4xx／5xx
  均視為驗證失敗，不以 UI fallback 掩蓋。

### 6. Architecture Review Baseline（2026-09-09）

- 可重現程式基線：HEAD `1b6450355ed81180c5abd419ac756564cff1b3c0`；HEAD 追蹤檔以該 commit 為準。
- 架構審查時有兩個與本 scope 相鄰的未提交檔案，實作前須比對下列 SHA-256；不相符即視為 drift，需重新審查：

| 檔案 | Review baseline SHA-256 | 邊界 |
|---|---|---|
| `src/components/TaskDetailsModal.tsx` | `6338E9D6E24265307FF7BE8D25501FE39025A5DEAB023594A19F4F6F69CC0406` | target；清理名稱 title 並補 ancestor breadcrumb metadata |
| `src/components/TaskDetailsSubtaskSection.tsx` | `87C33BDE68D565B3E3E7B6E8FED4DA8E22785DB2A909ACE548F786EBC105E4D5` | protected；不得修改 |

### 7. 2026-09-09 Working-tree Drift Review

- 架構定案期間 `TaskDetailsModal.tsx` 出現同期未提交變更：新增「回到上一階任務」導覽按鈕與 tracking placement
  解析。此變更不改目前任務標題／ancestor breadcrumb 的 identity，與本架構相容。
- 該按鈕的 `title="回到上一階任務"` 是操作型 tooltip，不是重複任務名稱；DEV-114 實作必須保留它的
  `title`、`aria-label`、click handler 與 tracking navigation，不得使用廣域刪除 `title` 的方式清理。
- `TaskDetailsSubtaskSection.tsx` 的同期 DEV-098 變更仍為 protected no-change；子任務 hover 只透過既有共用
  `TaskChecklistTree` 的 scoped metadata 驗證，不在本期重寫結構。

## File Surface 與責任邊界

### 必改檔案

| 檔案 | 唯一責任 |
|---|---|
| `src/components/TaskDescriptionHoverCard.tsx` | 加入雙來源 resolver、兩次重讀與 inline-content 優先序 |
| `src/components/TaskWorkbenchPanel.tsx` | 補齊兩類任務列 trigger／indicator，移除位置 `title` |
| `src/components/RecycleBinView.tsx` | 已封存任務及父任務入口／indicator，移除名稱 `title` |
| `src/components/Records/RecordSidebar.tsx` | 已連結任務入口／indicator，移除名稱 `title` |
| `src/components/Records/TaskMentionNode.ts` | 行內 mention trigger／task ID，移除 DOM `title`，保留序列化資料 |
| `src/components/Rag/CitationCard.tsx` | 僅 `wbs_items` citation 以 source ID 接通；缺來源 no-op；使用 keyed selector，禁止只為 hover 訂閱整個 `nodes` map |
| `src/components/CalendarSubscriptionBuilderPreview.tsx` | 唯一 inline description attribute 使用者、canonical app task ID 及非空 indicator；既有 preview identity 不變 |
| `src/components/TaskDetailsModal.tsx` | 移除目前／祖先名稱 native `title`；為 ancestor breadcrumb 加 canonical hover metadata |
| `src/components/Wbs/TaskChecklistTree.tsx` | 在 Task Details host 的共用子任務列補 scoped hover metadata；保留既有 row／drag ownership |
| `src/components/MindMap/MindMapNode.tsx` | 移除節點名稱 native `title`；既有 hover 不變 |
| `package.json` | 登記 DEV-114 static／browser verifier scripts |

### 實作期新增檔案

- `scripts/verify-dev-114-task-description-global-surfaces.ts`
- `scripts/verify-dev-114-task-description-global-surfaces-browser.pw.js`

### Protected no-change zones

- `src/components/MainLayout.tsx`：保留單例 mount，不增第二 instance。
- `src/components/TaskDescriptionIndicator.tsx`：既有視覺／a11y 契約足夠，不另做變體。
- `src/components/Wbs/TaskChecklistTree.tsx`：結構、row／drag ownership 為 protected；允許本期 Task Details scoped metadata extension。
- `src/components/TaskDetailsSubtaskSection.tsx`：DEV-098 同期變更邊界；本期不得修改。
- `src/services/rag/ragContract.ts`、`src/store/useRagStore.ts`：不擴充 citation payload 或 store。
- backend、schema、migration、權限、provider、DEV-111 已通過的 QA/QC 歷史結果。

## Implementation Order

1. `WP-114-A Controller`：先完成中央 resolver、優先序、兩次重讀及靜態 verifier 骨架。
2. `WP-114-B Store-backed surfaces`：接通工作台、回收桶精準 identity zones、紀錄精準 identity zone、mention、
   RAG；同步移除指定 native `title`。
3. `WP-114-C Subscription snapshot`：只在行事曆訂閱預覽加入 inline-content 路徑與 indicator。
4. `WP-114-D Explicit exclusions`：清理 TaskDetails／MindMap title，確認 current-title exclusion 與 action tooltip 無損。
5. `WP-114-E Task Details surfaces`：將 breadcrumb 與 Task Details 子任務列接入 canonical trigger，補 z-index layering
   evidence，確認 modal 內卡片可見且不遮蔽操作 ownership。
6. `WP-114-F Verification`：凍結 candidate，執行 DEV-114 與本規格列出的 controller／直接模組 regression、
   engineering gates、證據盤點及文件收斂。

依賴：A 必須先於 B／C；B 與 C 可分開實作；D 完成後進入 E；E 完成後才可凍結，F 不得與功能碼持續變更交錯宣告 PASS。

## Acceptance Criteria

- [x] 矩陣 19 個「套用」位置在 fine pointer 停留同一任務 1000ms 後，只顯示該任務非空說明。
- [x] 說明卡沒有任務名稱、「任務說明」標籤、helper、placeholder 或第二套自動 tooltip。
- [x] 一般入口只用最新 WBS store description；訂閱預覽只用最新 inline snapshot，且 inline 值優先於 store。
- [x] 空白、缺來源、stale identity、DOM row reuse 或 pending 期間 source-kind 改變時不顯示 card／indicator，
  不 fallback 到名稱或其他任務內容。
- [x] 訂閱 hover 使用 `event.node.id` 作為 canonical app task ID，並保留原 `data-preview-event-*` identity、
  filter、preview payload 與 ICS feed 行為。
- [x] 穩定標題槽位顯示既有 9px／11px indicator；inline mention 不新增 indicator。
- [x] 指定的名稱／位置 native `title` 全部移除；操作 tooltip、`aria-label`、focus、role、資料與序列化屬性保留。
- [x] 回收桶 restore／delete controls 與紀錄 role select／actions 不會啟動或保留說明卡；任務 identity zone 仍可觸發。
- [x] 任務詳情目前標題、mobile／touch 及其他排除位置不啟動說明 hover；ancestor breadcrumb 與子任務列可觸發。
- [x] Escape、leave、scroll、resize、blur、visibility、pointer down、drag start 皆無 stale card。
- [x] click、double-click、details、selection、context menu、drag、restore／delete、citation navigation 與 mention
  serialization 無回歸。
- [x] 1440×900、1024×768 與 390×844 實際瀏覽器證據通過；無 overflow、裁切、visible error、console/page
  error 或非預期 4xx／5xx。
- [x] 無 schema／API／RAG contract／permission／backend／migration 變更；protected structure／data contract 無未授權 drift。

## 驗證與證據契約

- Static：`npm run verify:dev-114-task-description-global-surfaces`
- Browser：`npm run verify:dev-114-task-description-global-surfaces-browser`
- Direct regressions：DEV-111、DEV-028、DEV-039 placement lanes、DEV-045 builder preview、DEV-088 lifecycle、
  DEV-098、DEV-006 editor、DEV-107 record layout；具 browser runner 者 static/browser 均須執行。
- Engineering：受影響檔案 ESLint、`npx tsc --noEmit`、`npm run build:test`、`git diff --check`。
- Browser evidence：`output/playwright/dev-114-task-description-global-surfaces/`，包含 route、viewport、fixture、
  dwell timing、卡片內容、排除與 visible-error 證據。
- Browser runtime：固定入口 `npm run dev:local`、`http://localhost:4000`；先確認可否安全重用，否則記錄 task-owned
  PID／process tree／port／purpose，完成後只停止該 process tree 並確認 port 已釋放。

## Model Discretion、禁止事項與停止條件

RD 可在不改契約下微調 selector helper 名稱、屬性擺放層級與測試 fixture 組織；不得自行新增文字標籤、第二套
overlay、hover-time fetch、跨板權限、RAG payload、mobile gesture、schema 或 fallback 文案。

下列任一成立必須停止並回報 PM，不得自行擴張：

1. 實作前 target files、DEV-111 controller contract、TaskMention serialization 或 RAG citation identity 已與本 revision 漂移。
2. 任何入口無法取得 canonical task ID，且必須新增 provider/API/schema 才能完成。
3. 移除 `title` 會使控制項失去唯一 accessible name，而現有 `aria-label` 無法在本 scope 內安全保留。
4. 需要修改 protected no-change zone，尤其 `TaskDetailsSubtaskSection`、RAG contract/store 或 backend。
5. 既有 DEV-111／028／039／045／088／098／006／107 direct regression 失敗，且無法證明與本 candidate 無關。
6. 出現資料寫入、權限提升、跨 workspace 資料外洩、錯任務說明或無法清除的 stale overlay。

## Release Boundary

`RD Implementation Complete／架構已定案` 代表本地 candidate 已完成並通過 DEV-114 與 compatible regression；仍不代表
commit、push、deploy 或 release。若要納入正式版本，另走 deployment/release gate。

## 變更紀錄

- 2026-09-09：由 Brief 一次升級至 RD Implementation Ready；完成來源優先序、跨板缺資料策略、18＋8 位置矩陣、
  indicator 決策、file surface、no-change zones、工作包、驗證與停止條件，架構定案。
- 2026-09-09：RD Tech Lead Review PASS；補上不可漂移的 `HoverCandidate`、互動控制精準 trigger zone、訂閱
  canonical app task ID、相鄰規格／回歸 gates 與可重現 working-tree hash baseline。未新增 service、schema 或第二套 overlay。
- 2026-09-09：完成 WP-114-A→E；DEV-114 static 27/27、browser B01～B26 26/26（含 1440×900／1024×768／390×844）、
  compatible static／browser（含 DEV-006 editor input browser）、TypeScript、targeted ESLint、test build 與 diff check PASS；
  DEV-039／DEV-002 verifier 已同步目前已定案契約，正式 release 仍另走 deployment/release gate。
- 2026-09-10：依瀏覽器 annotation 將 Task Details ancestor breadcrumb 納入，並為 Task Details scoped checklist rows
  補 canonical `taskId`／trigger metadata；修正共用卡在 `z-[10000]` modal 下不可見的 layering 缺口。TaskDetailsModal
  candidate SHA-256=`517071B7C143555DBD59129349FE63641F23264A40966F769BE8A4D187088151`，TaskChecklistTree candidate
  SHA-256=`883A848ECCACE32B6032D7A68696909E7EE9B4565722B29DAFB1825439FCFDCA`。DEV-114 static 29/29、browser 27/27
  （B01～B26＋B02a）PASS，其他 title／touch／control 邊界維持原契約。

使用思考習慣：#系統描繪、#差距分析、#可驗證性
