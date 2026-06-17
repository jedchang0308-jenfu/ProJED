# ProJED Dev Task Control Board

## PM Update - 2026-06-15

### DEV-024: AI整理保留手寫內容與章節結構

狀態: Ready
節點類型: 開發點
優先級: P1 AI synthesis guard
父交付點: DEV-011 / DEV-012 / DEV-020
關聯回歸: DEV-021 / DEV-022
是否計入完成率: 否

交付原因：
- 使用者確認在手動填寫紀錄後執行 `AI整理`，既有內容會被覆蓋，且章節結構會被改寫。
- DEV-021 / DEV-022 已保護「專案變化匯入」 evidence 與單一紀錄整合，但尚未保護使用者手寫內容與自訂章節。
- 這不是 prompt wording 問題，必須新增 deterministic human-draft merge guard，避免 AI synthesis 結果直接取代 preserved draft。

交付目標：
- `AI整理` 只能整理、補強與統整既有草稿，不得刪除使用者已輸入的段落、章節、任務 mention 或任務連結。
- 若 AI 結果未包含手寫內容，系統必須用 deterministic fallback 將 missing human evidence 放回同一份紀錄。
- 保留 DEV-021 project change preserve guard 與 DEV-022 single-record integration guard。
- 不改資料庫 schema，不改 `KnowledgeRecord.content` persistence 格式。

主要文件：
- `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md`
- `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Ready | SPEC-024 |
| 驗證計畫 | QA | Ready | QA-DEV-024 |
| 實作 | RD | Pending | human-draft merge guard |
| 事實驗證 | QC/Verifier | Pending | DEV-024 preserve verifier + real operation tests |

驗證證據暫列：
- `SPEC-024`
- `QA-DEV-024`
- `verify:dev-024-ai-synthesis-preserve-human-draft`
- 待 RD 實作後重跑 DEV-011 / DEV-012 / DEV-021 / DEV-022 regression gates。

### DEV-023: 專案變化匯入整併為紀錄流程第一步

狀態: Ready
節點類型: 開發點
優先級: P1 UX refinement
父交付點: DEV-020
是否計入完成率: 否

交付原因：
- 使用者確認「先匯入專案變化」不應作為會議流程上方的獨立大型卡片。
- 匯入專案變化、速記、AI整理、校稿與發布本質上是同一段紀錄流程，應用同一個 workflow medium 表達。
- DEV-020 已完成功能主線，但 PDCA-DEV-020 仍留下「專案變化匯入在流程上方」的殘留 UX 風險。

交付目標：
- 會議紀錄流程改為 `匯入 -> 速記 -> AI整理 -> 校稿 -> 發布`。
- 個人工作紀錄流程改為 `匯入 -> 撰寫 -> 存草稿 -> 發布`。
- 預設只顯示精簡流程步驟；點擊 `匯入` 後才展開日期、範圍、預覽、插入與跳過。
- 保留 `wrapProjectChangeImportContent`、DEV-021 preserve guard 與 DEV-022 single-record integration guard。

主要文件：
- `ai-doc/specs/SPEC-023-record-project-change-import-workflow-step.md`
- `ai-doc/qa/QA-DEV-023-record-project-change-import-workflow-step.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Ready | SPEC-023 |
| 驗證計畫 | QA | Ready | QA-DEV-023 |
| 實作 | RD | Pending | workflow first-step integration |
| 事實驗證 | QC/Verifier | Pending | DEV-023 workflow-step verifier |

驗證證據暫列：
- `SPEC-023`
- `QA-DEV-023`
- `verify:dev-023-record-project-change-import-workflow-step`
- 待 RD 實作後重跑 DEV-020 / DEV-021 / DEV-022 regression gates。

### DEV-022: 專案變化匯入後 AI整理同整成單一會議紀錄

狀態: Done
節點類型: 交付點
優先級: P1
父交付點: DEV-021
是否計入完成率: 是

CAPA 來源：
- 使用者實測發現「先匯入專案變化 -> AI整理」後，輸出同時出現 AI整理主紀錄與 `[專案變化匯入開始]` 內的第二份完整會議紀錄。
- 目前 DEV-021 的 deterministic merge guard 保證不丟失，但採 append preserve，未做到同整。

交付目標：
- 將「受保護內容」從 rendered meeting record 改為 project change evidence。
- AI整理結果最後只能有一份會議紀錄主結構。
- 匯入的任務變化必須統整進 `2. 任務討論與結論`，不得以第二份完整紀錄追加。
- fallback guard 若需要補漏，只能補 evidence note，不可補第二組 `1/2/3` 結構。

主要文件：
- `ai-doc/specs/SPEC-022-project-change-single-record-integration.md`
- `ai-doc/qa/QA-DEV-022-project-change-single-record-integration.md`
- `ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md`

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| CAPA | PM/RD | Done | CAPA-20260615 |
| 規格 | PM/RD | Done | SPEC-022 |
| 實作 | RD | Done | integrated synthesis guard |
| 驗證計畫 | QA | Done | QA-DEV-022 |
| 事實驗證 | QC/Verifier | Done | single-record verifier |

交付證據：
- `src/utils/projectChangeImport.ts`：project change evidence normalization、single-record merge guard。
- `scripts/verify-dev-022-project-change-single-record.mjs`：單一 `1/2/3` 主結構、marker 移除、taskLinks preserve、idempotent。
- `package.json`：`verify:dev-022-project-change-single-record`。

已通過驗證：
- `npm.cmd run verify:dev-022-project-change-single-record`
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

### DEV-021: 專案變化匯入後 AI整理保留機制

狀態: Done
節點類型: 交付點
優先級: P1
父交付點: DEV-020 / DEV-011 / DEV-012
是否計入完成率: 是

交付原因：
- 使用者在紀錄流程中先匯入專案變化後，再使用 AI整理時，先前匯入內容可能被 AI 結果覆蓋。
- 此問題不是文案或 prompt 問題，而是資料回寫缺少 deterministic merge guard。
- 在此交付點完成前，DEV-020 的「專案變化匯入 + AI整理」需視為有資料遺失風險。

主要文件：
- `ai-doc/specs/SPEC-021-project-change-ai-preserve.md`
- `ai-doc/qa/QA-DEV-021-project-change-ai-preserve.md`

範圍：
- SPEC 新增「已匯入專案變化是受保護內容，AI整理不得丟失」不變式。
- RD 實作 deterministic merge guard，不可只依賴 prompt。
- QA 新增「匯入 -> AI整理 -> 存草稿/發布」測試案例。
- Verifier 新增 preserve 與 idempotent 可重複測試。
- PM 將 DEV-020 標記為待 DEV-021 補齊的狀態風險。

完成條件：
- 匯入專案變化後 AI整理不會丟失已匯入內容。
- 重複 AI整理不會重複堆疊同一份匯入區塊。
- 存草稿與發布都保存 merged content。
- taskLinks 依 merged content 同步。
- prompt-only 修補不得通過 verifier。

| 階段 | 負責角色 | 狀態 | 交付物 |
|---|---|---|---|
| 規格 | PM/RD | Done | SPEC-021 |
| 實作 | RD | Done | deterministic merge guard |
| 驗證計畫 | QA | Done | QA-DEV-021 |
| 事實驗證 | QC/Verifier | Done | preserve/idempotent verifier |

交付證據：
- `src/utils/projectChangeImport.ts`：受保護匯入區塊、extractor、merge guard。
- `src/components/Records/RecordSidebar.tsx`：匯入專案變化時改插入受保護區塊。
- `src/store/useRecordStore.ts`：AI整理回寫使用 merged content，taskLinks 依 merged content 同步。
- `scripts/verify-dev-021-project-change-ai-preserve.mjs`：preserve、idempotent、taskLinks、store writeback、docs gate。

已通過驗證：
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

## PM Update - 2026-06-11

### DEV-020：紀錄功能重構與專案變化匯入流程

狀態：Done
節點類型：交付點
父交付點：DEV-002 / DEV-005 / DEV-007 / DEV-011 / DEV-012 / DEV-018 / DEV-019
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-020-record-workflow-redesign-with-project-change-import.md`
- `ai-doc/qa/QA-DEV-020-record-workflow-redesign.md`

範圍：

- 將紀錄功能重構為「先選紀錄情境、再匯入專案變化、再撰寫與發布」的工作流。
- 看板主畫面提供 `開始會議速記` 與 `新增個人工作紀錄` 主要入口。
- 紀錄類型在開始撰寫前決定；建立草稿後不在同一筆草稿上切換類型。
- 新增專案變化匯入：指定時間範圍，預設一週前到今日；範圍只保留整個看板與整個工作區。
- 專案變化預覽依任務階層排版，需使用者確認後才插入紀錄內容。
- 補齊所有關閉、切換、新增、離開時的未儲存三選一防呆。
- 新增 `功能說明` button，內含流程圖、紀錄類型差異、專案變化匯入與保存/發布/離開說明。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-020 RD | Done | RD | 已實作 workflow helper、project change import、RecordComposer、dirty guard、help dialog 與 verifier。 |
| DEV-020 QA | Done | QA | `QA-DEV-020` 已涵蓋入口、匯入、防呆、功能說明與 viewport。 |
| DEV-020 QC | Done | QC | DEV-002/003/007/010/011/012/019 回歸、DEV-020 verifier、browser verifier 與 build 通過。 |

### DEV-018：會議紀錄防呆 UX/UI 流程重設計

狀態：In Verification
節點類型：交付點
父交付點：DEV-005 / DEV-010 / DEV-011 / DEV-012
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-018-meeting-record-guardrail-workflow-redesign.md`
- `ai-doc/qa/QA-DEV-018-meeting-record-guardrail-workflow.md`

範圍：

- 將會議速記側欄改為 `速記`、`AI整理`、`校稿`、`發布` 四階段工作流。
- AI整理改為建議性動作；發布時直接保存編輯器內容，不自動呼叫 AI。
- 新增側欄狀態卡，集中呈現目前階段、下一步、草稿同步狀態、AI 狀態與直接發布風險。
- 新增未儲存離開三選一防呆：`存草稿後離開`、`直接離開`、`取消`。
- 擴充 `GlobalDialog` / `DialogStore` 支援 2-3 個自訂 action button。
- 更新 DEV-010 驗證腳本，移除過時的 BoardView 會議操作列期待。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-018 RD | Done | RD | workflow helper、RecordSidebar、MainLayout、DialogStore、useRecordStore 已更新。 |
| DEV-018 QA | Ready | QA | 依 `QA-DEV-018` 執行案例驗證。 |
| DEV-018 QC | Done | QC | DEV-007 至 DEV-012 verifier、build、1440x950 / 1024x768 viewport smoke 已通過。 |

### DEV-019：紀錄類型與會議流程層級重整

狀態：Done
節點類型：開發點
父交付點：DEV-002 / DEV-005 / DEV-018
是否計入產品交付完成：是

交付文件：

- `ai-doc/specs/SPEC-019-record-type-and-meeting-workflow-layering.md`
- `ai-doc/qa/QA-DEV-019-record-type-and-meeting-workflow-layering.md`

範圍：

- 釐清 `會議紀錄` 與 `個人工作紀錄` 是紀錄類型，不是會議流程步驟。
- Topbar 只表示全域會議模式：`開始會議速記` / `離開會議`。
- RecordSidebar 只在一般模式提供 `新增會議紀錄` / `新增個人工作紀錄`。
- 會議模式中鎖定為 `會議紀錄（會議模式）`，不顯示個人工作紀錄切換。
- 個人工作紀錄顯示簡單狀態，不套用 `AI整理 / 校稿`。

下一步：

| 項目 | 狀態 | Owner | 說明 |
|---|---|---|---|
| DEV-019 RD | Done | RD | 更新 RecordSidebar、MainLayout、workflow helper 與 verifier。 |
| DEV-019 QA | Done | QA | 已建立 `QA-DEV-019`，涵蓋紀錄類型、會議模式、個人工作紀錄與 viewport。 |
| DEV-019 QC | Done | QC | `verify:dev-010-action-feedback`、`build`、`verify:dev-019-record-type-layering-browser` 通過。 |

更新日期：2026-06-09
文件用途：本檔只做 PM 主控、交付狀態、下一步與驗證證據索引。歷史長版內容已封存到 `ai-doc/archived/dev_task_2026-06-09_before_restructure.md`。

---

## 讀法

- 先看「目前 PM 結論」與「下一步」。
- 產品完成率只計入 `交付點`。
- `開發點` 只支援交付點，不單獨計入產品完成率。
- 詳細需求、驗證計畫與歷史紀錄請看對應 SPEC / QA / QC / verifier，不再塞回本檔。

## 狀態定義

| 狀態 | 意義 |
|---|---|
| Done | 已完成實作與可用驗證，或已被使用者接受。 |
| In Verification | 已實作，等待 QC / production smoke / 使用者驗收。 |
| Ready | 規格足夠，可排 RD / QA / QC。 |
| Deferred | 暫不做，需明確恢復條件。 |
| Blocked | 有外部條件阻擋，PM/RD 無法自行完成。 |

---

## 目前 PM 結論

- `main` 持續作為正式發布分支，部署與 production smoke 證據已回寫到 PM 文件。
- Firebase Hosting 已部署到正式環境：`https://projed-cc78d.web.app`。
- Supabase Edge Function `synthesize_meeting_record` 已部署到正式 Supabase version 2，狀態 `ACTIVE`，並維持 `verify_jwt=true`。
- 2026-06-09 production backend AI smoke 已通過：匿名請求回 `401`，一次性 Supabase Auth user 呼叫回 `200`，實際模型為 `gemini-3.5-flash`。
- 會議紀錄工作流目前是主要交付主線：DEV-005 到 DEV-017 已完成多輪 UX 與 AI 品質改善。
- DEV-011 / DEV-012 尚待互動式 production UI smoke，原因是正式前端使用 Google OAuth，CLI 無法非互動完成登入與發布流程。
- 手機版會議紀錄工作流不列入目前 release gate。

## 下一步

| 順序 | 任務 | 狀態 | 負責 | 完成條件 |
|---|---|---|---|---|
| 1 | DEV-011 / DEV-012 production backend AI smoke | Done | QC | 正式 Edge Function 以授權 user JWT 呼叫成功，回傳 AI 統整內容與實際模型。 |
| 2 | DEV-011 / DEV-012 production UI smoke | In Verification | QC / 使用者 | 以已登入 Google 的正式前端完成：開會、AI整理、校稿發布、紀錄庫與任務知識查找。 |
| 3 | DEV-020 紀錄功能重構 RD | Done | RD | 已依 SPEC-020 重構紀錄入口、專案變化匯入、未儲存保護與功能說明。 |
| 4 | 文件同步清理 backlog / documentation map | Done | PM | backlog、dev_task、documentation map 與 QC evidence 狀態一致。 |

---

## 交付點總覽

| DEV | 類型 | 狀態 | 是否計入完成率 | 主題 | 主要證據 / 文件 | 下一步 |
|---|---|---|---|---|---|---|
| DEV-001 | 交付點 | Done | 是 | 四模式一致化緊湊 UI 系統 | `SPEC-001`、舊 dev_task archive | 無 |
| DEV-002 | 交付點 | Done | 是 | 會議紀錄與個人工作紀錄 MVP | `SPEC-003`、`verify:dev-002-records` | 後續只做 refinements |
| DEV-004 | 交付點 umbrella | Deferred | 否 | 全人個人與團隊待辦平台 MVP | `SPEC-002` | 等使用者重新啟動 |
| DEV-005 | 交付點 | Done | 是 | 會議看板主畫面紀錄工作流 | `SPEC-005`、PM report | 無 |
| DEV-006 | 交付點 | Done | 是 | Gmail-like 會議紀錄輸入器穩定化 | `SPEC-006`、`QA-DEV-006`、browser input verifier | 無 |
| DEV-007 | 交付點 | Done | 是 | 會議中保留看板完整編輯與任務變更紀錄 | `SPEC-007`、`verify:dev-007-meeting-activity` | 無 |
| DEV-008 | 交付點 | Done | 是 | 任務會議細節快速查找 | `SPEC-008`、`verify:dev-008-task-knowledge` | 無 |
| DEV-009 | 交付點 | Done | 是 | 任務詳情內會議快速補記 | `SPEC-009`、`QA/QC-DEV-009`、`verify:dev-009-task-detail-quick-note` | 無 |
| DEV-010 | 交付點 | Done | 是 | 會議紀錄操作按鈕狀態溝通 | `SPEC-010`、`QA-DEV-010`、`verify:dev-010-action-feedback` | 無 |
| DEV-011 | 交付點 | In Verification | 是 | AI 任務導向會議紀錄統整工作流 | `SPEC-011`、`QA-DEV-011`、`verify:dev-011-ai-meeting-synthesis`、`QC-DEV-011-012-production-ai-smoke` | production UI smoke |
| DEV-012 | 交付點 | In Verification | 是 | AI 會議紀錄自然語言品質提升 | `SPEC-012`、`QA-DEV-012`、`verify:dev-012-meeting-record-quality`、`QC-DEV-011-012-production-ai-smoke` | production UI smoke |
| DEV-013 | 交付點 | Done | 是 | 右鍵任務複製，含子任務與子樹內部依賴 | `SPEC-013`、`QC-DEV-013`、`verify:dev-013-task-duplicate` | 無 |
| DEV-020 | 交付點 | Done | 是 | 紀錄功能重構與專案變化匯入流程 | `SPEC-020`、`QA-DEV-020`、`verify:dev-020-record-workflow-redesign`、`verify:dev-020-project-change-import-browser` | 無 |

### 交付點完成率

- Done：10 個交付點。
- In Verification：2 個交付點。
- Deferred：1 個 umbrella 交付點。
- 開發點不列入完成率。

---

## 支援開發點總覽

| DEV | 類型 | 父交付點 | 狀態 | 主題 | 驗證證據 |
|---|---|---|---|---|---|
| DEV-003 | 開發點 | DEV-002 | Done | 紀錄內容 inline task tag | `verify:dev-003-record-tags` |
| DEV-014 | 開發點 | DEV-011 / DEV-012 | Done | 會議紀錄階層編號取代任務分類詞 | 併入 `verify:dev-011`、`verify:dev-012` |
| DEV-015 | 開發點 | DEV-012 | Done | 會議紀錄主線摘要品質優化 | `verify:dev-015-meeting-summary-mainline` |
| DEV-016 | 開發點 | DEV-002 | Done | 紀錄庫改為條列式清單 | `verify:dev-016-records-list-view`、browser verifier |
| DEV-017 | 開發點 | DEV-005 / DEV-010 | Done | 會議紀錄右側欄可拖拉調整並記憶寬度 | `verify:dev-017-record-sidebar-resize`、browser verifier |
| DEV-019 | 開發點 | DEV-002 / DEV-005 / DEV-018 | Done | 紀錄類型與會議流程層級重整 | `SPEC-019`、`QA-DEV-019`、`verify:dev-010-action-feedback`、`verify:dev-019-record-type-layering-browser` |
| DEV-023 | 開發點 | DEV-020 | Ready | 專案變化匯入整併為紀錄流程第一步 | `SPEC-023`、`QA-DEV-023`、`verify:dev-023-record-project-change-import-workflow-step` |
| DEV-024 | 開發點 | DEV-011 / DEV-012 / DEV-020 | Ready | AI整理保留手寫內容與章節結構 | `SPEC-024`、`QA-DEV-024`、`verify:dev-024-ai-synthesis-preserve-human-draft` |

---

## 目前阻塞 / 待人工驗證

| 項目 | 影響 | 解除方式 |
|---|---|---|
| DEV-011 / DEV-012 尚缺 production UI smoke | 後端 AI 統整已在正式環境通過，但完整前端流程尚未以 Google OAuth 登入帳號驗證 | 使用已登入 Google 的正式前端，建立或開啟看板後完成 meeting mode、AI整理、校稿發布、紀錄庫與任務知識查找。 |

---

## Release Gate 指令

### 常規自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run verify:dev-013-task-duplicate
npm.cmd run verify:dev-015-meeting-summary-mainline
npm.cmd run verify:dev-016-records-list-view
npm.cmd run verify:dev-017-record-sidebar-resize
```

### Browser / UX 驗證

```powershell
npm.cmd run verify:dev-006-browser-input
npm.cmd run verify:dev-016-records-list-browser
npm.cmd run verify:dev-017-record-sidebar-resize-browser
```

### 正式部署

```powershell
node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive
```

---

## 交付文件索引

| 類別 | 文件 |
|---|---|
| Backlog | `ai-doc/backlog.md` |
| Documentation map | `ai-doc/documentation_map.md` |
| 舊 dev_task 詳細版 | `ai-doc/archived/dev_task_2026-06-09_before_restructure.md` |
| 會議紀錄主線規格 | `ai-doc/specs/SPEC-005-meeting-board-primary-workflow.md` 到 `SPEC-012` |
| 任務複製規格 | `ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md` |
| QA 文件 | `ai-doc/qa/` |
| QC 文件 | `ai-doc/qc/` |
| PM reports | `ai-doc/reports/` |

---

## PM 維護規則

- 本檔不再貼長篇需求背景；新增細節請寫到 SPEC / QA / QC / report。
- 新增交付點前，需使用者確認。
- PM 可新增支援開發點，但必須標明父交付點與驗證證據。
- 每次 release 前只更新：狀態、下一步、阻塞、驗證證據。
- 舊任務詳細歷程保留在 archive，不再回填到 active control board。
