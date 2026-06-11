# ProJED Dev Task Control Board

## PM Update - 2026-06-10

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
| 3 | 文件同步清理 backlog / documentation map | Done | PM | backlog、dev_task、documentation map 與 QC evidence 狀態一致。 |

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

### 交付點完成率

- Done：9 個交付點。
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
