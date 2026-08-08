# CAPA-20260807：DEV-012 AI整理成功判定與正式環境證據缺口

日期：2026-08-07
關聯 DEV：DEV-012
狀態：Corrective Action Implemented Locally / Production Effectiveness Pending
嚴重度：P1

## 問題描述

使用者已確實執行 AI整理，但輸出仍出現空父節點、重複／no-op 內容或結構退化。原結案證據只證明舊版正式流程曾成功回傳與發布，不能證明 2026-08-07 修正已部署，也無法從 UI 判斷本次輸出來自 Gemini 或 deterministic fallback。

## 多層次根因

1. 直接原因：前端只要收到非空 `content` 就標示成功，沒有 output quality gate。
2. 契約原因：client 與 Edge Function 沒有版本握手；舊函式可被新前端誤當成已改善版本。
3. 追溯原因：provider/model/function version/run ID/quality result 未完整持久化，無法證明單次執行身分。
4. 語意原因：完整 task path 的父節點曾被誤當成直接會議證據；匯入 evidence 又把 task path 與敘述拆行，造成空正文或 merge fallback。
5. 流程原因：QA 偏重成功路徑與格式存在，缺少故障注入、重複整理 idempotency、merge 後品質與同一案例前後對照。
6. 結案原因：本機 source 修正與歷史 production pass 被放在同一個「完成」狀態，形成 evidence scope 誤算。

## Containment

- DEV-012 重新開啟；正式環境 v2 驗證完成前，不宣稱問題已改善。
- 保留原草稿策略升級為 fail-closed：合約、trace、AI output 或 merge integrity 任一不通過即拒絕覆蓋。
- 正式部署與 production fixture 未獲本次授權，未執行。

## Corrective Actions

| ID | Action | 狀態 |
|---|---|---|
| CA-1 | 實作 `meeting-synthesis-v2` request/response handshake | Local Done |
| CA-2 | Edge + client 雙重品質閘門 | Local Done |
| CA-3 | 回傳並持久化 run ID、provider/model、function version、normalization、quality | Local Done |
| CA-4 | UI 區分 AI 與規則整理 | Local Done |
| CA-5 | 修正完整路徑的直接證據判定；父節點只保留於 heading path | Local Done |
| CA-6 | 匯入 evidence 將 task path 與敘述合併，拒絕空正文／孤立 `2.x` | Local Done |
| CA-7 | 重複整理沿用 source snapshot，merge 後再做完整性檢查 | Local Done |
| CA-8 | 同一 commit 部署 frontend + Edge，執行 production v2 fixture | Pending Authorization/Release |

## Preventive Actions

- PA-1：把 contract mismatch、trace missing、空父節點、空正文、task link 缺漏、重複／低價值內容納入 DEV-012 negative verifier。
- PA-2：production smoke 必須讀 UI trace attributes，不能只找「AI整理完成」文字。
- PA-3：儲存後 DB metadata run ID 必須與 UI run ID 一致，作為單次執行閉環證據。
- PA-4：任何 AI fallback 必須以不同使用者文案揭露，不得與模型成功共用 success label。
- PA-5：AI 內容需驗證三層：模型 response、human merge 後成品、持久化後重載結果。
- PA-6：歷史 production evidence 與新 contract effectiveness evidence 分開標示，避免跨版本誤用。

## Effectiveness Verification Plan

### 本機（已完成）

- Contract/quality negative fixtures：Pass。
- TypeScript：Pass。
- 真實瀏覽器 5/5：Pass。
- 連續整理兩次：主章節數量維持 1；task token、人工補充、狀態敘述不遺失。
- UI：規則整理文案、v2、run ID、quality=passed 可查。
- Persistence：local record metadata 保存完整 trace。

### 正式環境（待完成）

- 同一 commit 部署 Edge 與 frontend。
- 使用授權 fixture 呼叫實際 Gemini，確認 `provider=gemini`。
- 驗證 UI trace、Edge log 與 DB metadata 的 run ID 一致。
- 使用原失敗型案例做前後對照，並連續執行兩次。
- 發布後驗證紀錄庫、任務知識、RAG 與 cleanup。

## Closure Rule

只有 production v2 gate 全部通過才能把 CAPA 與 DEV-012 關閉。本機 pass、source diff、歷史 v1 production pass 或單次非空 response 均不足以結案。
