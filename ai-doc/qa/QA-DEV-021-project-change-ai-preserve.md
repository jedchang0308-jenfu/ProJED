# QA-DEV-021: 專案變化匯入後 AI整理保留驗證計畫

對應 DEV: DEV-021
父交付點: DEV-020 / DEV-011 / DEV-012
狀態: Passed
日期: 2026-06-15

## 驗證目標

驗證「匯入專案變化 -> AI整理 -> 存草稿/發布」流程不會丟失使用者已確認匯入的專案變化，並確認 deterministic merge guard 具備 preserve 與 idempotent 行為。

## 風險矩陣

| 風險 | 失效模式 | 影響 | 必要防護 |
|---|---|---|---|
| AI 回寫覆蓋 draft | `result.content` 直接寫回 `draft.content` | 已匯入專案變化消失 | deterministic merge guard |
| Prompt 未保留匯入內容 | 模型整理結果省略專案變化區塊 | 資料遺失且測試不穩 | helper-level preserve 測試 |
| 重複 AI整理 | 每次都追加同一份匯入內容 | 紀錄膨脹、可讀性下降 | idempotent 測試 |
| 任務連結遺失 | 只信任 AI `linkedTaskIds` | `taskLinks` 與內容不一致 | merged content 重新同步 |
| UI 驗證假綠 | 只測按鈕與畫面，不測內容保留 | release gate 失真 | 可重複 verifier |

## 測試案例

### TC-001: 匯入後 AI整理必須保留專案變化

前置條件：
- 已有一份 meeting draft。
- project change preview 至少包含兩筆任務變化與可辨識任務名稱。
- AI synthesis mock 或測試替身回傳不含 project change import block 的 `result.content`。

步驟：
1. 開啟紀錄編輯流程。
2. 執行「先匯入專案變化」並確認插入。
3. 執行「AI整理」。
4. 檢查 editor content。

預期：
- editor content 同時包含 AI整理後正文與原專案變化匯入內容。
- 專案變化匯入區塊出現一次。
- draft 仍處於未儲存或待儲存狀態，等待使用者存草稿或發布。

### TC-002: 重複 AI整理必須 idempotent

步驟：
1. 延續 TC-001 結果。
2. 再次執行「AI整理」。
3. 檢查 editor content。

預期：
- 同一份專案變化匯入區塊仍只出現一次。
- AI整理正文可更新，但受保護區塊不得被刪除或重複追加。

### TC-003: taskLinks 必須依 merged content 同步

步驟：
1. 建立含任務提及的 project change preview。
2. 讓 AI 回傳的 `linkedTaskIds` 不包含其中至少一筆匯入內容任務。
3. 執行 AI整理。
4. 檢查 draft taskLinks 或發布後的 record task links。

預期：
- merged content 中仍存在的任務提及都能同步到 taskLinks。
- AI 回傳缺漏的任務連結不會造成最終 taskLinks 遺失。

### TC-004: 存草稿後必須保留 merged content

步驟：
1. 完成「匯入 -> AI整理」。
2. 執行存草稿。
3. 重新開啟草稿。

預期：
- 草稿內容包含專案變化匯入區塊。
- 區塊不重複。
- taskLinks 與內容一致。

### TC-005: 發布後必須保留 merged content

步驟：
1. 完成「匯入 -> AI整理」。
2. 發布紀錄。
3. 開啟已發布紀錄。

預期：
- 已發布紀錄包含專案變化匯入區塊。
- 發布流程不會自動修改任務狀態。
- 已發布紀錄的 task links 與 merged content 一致。

### TC-006: prompt-only 修補不得通過

步驟：
1. 僅修改 AI prompt，保留 `result.content` 直接寫回 draft 的行為。
2. 執行 DEV-021 verifier。

預期：
- verifier 必須失敗。
- 失敗訊息需指出缺少 deterministic merge guard 或 raw AI content direct write 仍存在。

## Verifier 要求

新增或擴充自動驗證時，至少需涵蓋：

- 可重複執行的 preserve helper 測試。
- 可重複執行的 idempotent helper 測試。
- 靜態檢查：AI整理回寫不得直接使用裸 `result.content`。
- 靜態檢查：合併後必須以 merged content 同步 task links。
- Browser 或 store-level 驗證：匯入後 AI整理的 editor content 包含受保護區塊。

建議命令名稱：

```bash
npm run verify:dev-021-project-change-ai-preserve
```

若專案最後採用既有 verifier 聚合命令，DEV-021 測項也必須被 release gate 呼叫。

## QA 放行條件

- TC-001 到 TC-006 全部通過。
- DEV-020 既有 verifier 仍通過。
- DEV-011 / DEV-012 相關 AI整理與紀錄發布回歸案例未退化。
- 失敗訊息能指出 preserve、idempotent、taskLinks 或 direct write 的具體缺口。

## 驗證結果

驗證日期: 2026-06-15

已通過：
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`

驗證覆蓋：
- 匯入區塊 wrapper 會產生穩定 start/end marker。
- AI 結果省略匯入區塊時，merge guard 會補回。
- 重複 merge 不會重複追加同一份匯入區塊。
- AI 回傳缺漏任務連結時，`syncTaskLinksFromRecordContent` 會從 merged content 補回匯入內容中的 task mentions。
- `useRecordStore` 使用 merged content 回寫 draft 與 cursor offset。
- `saveDraft` 保存 current draft content，因此存草稿/發布會保存 merge 後內容。
