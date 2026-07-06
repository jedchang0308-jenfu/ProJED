# QA-DEV-024: AI整理保留手寫內容與章節結構驗證計畫

對應 DEV: DEV-024  
父交付點: DEV-011 / DEV-012 / DEV-020  
關聯回歸: DEV-021 / DEV-022  
節點類型: 開發點  
狀態: Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Not Executed
優先級: P1

## 驗證目標

驗證 `AI整理` 不再覆蓋使用者已手動填寫的會議紀錄內容，也不因標準化章節而丟失原章節內容。此驗證需證明改善不是 prompt-only，而是具備 deterministic human-draft merge guard。

## 驗證範圍

包含：

- 手寫純文字 preserve。
- 手寫自訂章節 preserve。
- 手寫 task mention preserve。
- 專案變化匯入 + 手寫補充 + AI整理 single-record integration。
- 重複 AI整理 idempotent。
- DEV-021 / DEV-022 project change preserve 與 single-record 回歸。

不包含：

- 新 DB schema。
- 新 persistence 格式。
- 手機版 release gate。
- 模型品質風格調參。

## FMEA 風險表

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 手寫內容被 AI整理覆蓋 | 回寫仍以 AI result 取代 draft content | 使用者失去人工紀錄與信任 | 手寫段落後按 AI整理，比對語意是否存在 | P1 | TC-001 / ROT-001 |
| 自訂章節內容消失 | AI 標準化章節時未映射原章節內容 | 校稿脈絡中斷 | 手寫自訂章節後 AI整理 | P1 | TC-002 / ROT-002 |
| task mention 丟失 | fallback 未同步 taskLinks 或 normalized content | 任務關聯紀錄失效 | 手寫 task mention 段落後 AI整理 | P1 | TC-003 |
| 專案變化與手寫內容形成兩份紀錄 | preserve fallback 直接 append 原文 | 會議紀錄出現重複主結構 | 檢查 `1/2/3` 主結構次數 | P1 | TC-004 / DEV-022 regression |
| 重複按 AI整理造成內容重複 | merge guard 不具 idempotent | 草稿越整理越長 | 連按兩次 AI整理並計算段落次數 | P1 | TC-005 |
| 只靠 prompt 修補 | 未新增 deterministic helper 或 verifier | 問題不穩定復發 | 靜態檢查 helper / tests / docs | P1 | Static verifier |
| fallback 分類錯誤 | 段落分類規則不足 | 內容雖保留但難校稿 | 驗證 task / risk / other placement | P2 | TC-006 |

## Test Cases

| ID | 類型 | 情境 | 步驟 | 預期結果 |
|---|---|---|---|---|
| TC-001 | Automated / Manual | 手寫純文字 preserve | 在會議內容輸入 `客戶要求 6/20 前確認報價風險`，按 AI整理 | AI整理後仍保留該語意，不得消失。 |
| TC-002 | Automated / Manual | 手寫自訂章節 preserve | 手寫 `## 會議背景` 與一段背景內容，按 AI整理 | 章節名稱可調整，但背景內容不得消失。 |
| TC-003 | Automated | task mention preserve | 手寫含 task mention 的段落，按 AI整理 | content 與 taskLinks 仍包含該 task。 |
| TC-004 | Automated / Manual | project change + human draft single record | 先匯入專案變化，再手寫補充，再按 AI整理 | 最終只有一份會議紀錄主結構，專案變化與手寫補充都被統整。 |
| TC-005 | Automated | idempotent | 對同一草稿連按 AI整理兩次 | 手寫 fallback 段落不得重複追加。 |
| TC-006 | Automated | fallback placement | 手寫風險、決議、待辦與一般補充，按 AI整理 | 風險/決議/待辦應進入合理章節；不能丟失。 |
| TC-007 | Static | prompt-only 防回歸 | 檢查實作是否有 deterministic merge helper 與 verifier | 不得只改 prompt 或 tooltip。 |

## 真實操作測試

QC 至少需在 browser 中執行：

| ID | 前置條件 | 操作步驟 | 預期結果 | 必留證據 |
|---|---|---|---|---|
| ROT-001 | 開啟會議紀錄 composer | 手寫一段純文字，再按 `AI整理` | AI整理後手寫語意仍在內容中 | AI整理前後截圖、內容節錄 |
| ROT-002 | 開啟會議紀錄 composer | 手寫自訂章節與內容，再按 `AI整理` | 章節內容不丟失；若章節名稱被標準化，內容仍可追溯 | AI整理前後截圖、章節內容節錄 |
| ROT-003 | 有可匯入專案變化 | 匯入專案變化、手寫補充、按 AI整理 | 最終只有一份主紀錄，且兩種 evidence 都存在 | 截圖、`1/2/3` 主結構次數、內容節錄 |
| ROT-004 | ROT-003 完成 | 再按一次 AI整理 | 手寫補充不重複，專案變化不重複 | 第二次整理後內容節錄、段落次數 |

## Static / Verifier Expectations

後續 RD verifier 需涵蓋：

- helper 名稱或等效功能：`mergeHumanDraftWithAiSynthesis`。
- hand-written paragraph fingerprint。
- section mapping / fallback placement。
- idempotent repeated synthesis。
- task mention preserve。
- project change preserve 與 single-record regression。
- prompt-only change 不得通過。

## QC 執行指令

RD 完成後至少執行：

```powershell
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft-browser
npm.cmd run verify:dev-021-project-change-ai-preserve
npm.cmd run verify:dev-022-project-change-single-record
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

2026-07-06 本機自動化 QC 已通過上述全部指令；其中 DEV-024 deterministic verifier 覆蓋手寫純文字、自訂章節、task mention、project change + human draft、single-record heading count、idempotency、store integration 與 docs references；browser verifier 覆蓋會議紀錄 composer UI、`AI整理` 操作、專案變化匯入、存草稿後內容驗證與 ROT-001 至 ROT-004。

真實操作測試：

```powershell
npm.cmd run dev:test:server
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft-browser
```

QC 在 browser 開啟 `http://127.0.0.1:4173/`，依 ROT-001 至 ROT-004 收集截圖與內容節錄。2026-07-06 已留存：

- ROT-001 screenshot: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-001.png`
- ROT-002 screenshot: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-002.png`
- ROT-003/004 screenshot: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-003-004.png`

2026-07-06 狀態：ROT-001 至 ROT-004 已在 local-test browser 通過；因 local-test 使用 deterministic synthesis，仍不得宣稱 production UI smoke 或正式模型前端流程已通過。

## 失敗時需收集的證據

- 測試 ID。
- AI整理前內容。
- AI整理後內容。
- 被丟失或重複的段落。
- 是否含 task mention。
- 是否含 project change import block。
- 主結構 `1. 本次會議總結 / 2. 任務討論與結論 / 3. ...` 出現次數。
- 截圖路徑與 viewport。

## QA 判定

DEV-024 可進 RD 的條件：

- SPEC 明確定義 deterministic human-draft merge guard。
- QA 覆蓋純文字、自訂章節、task mention、project change + human draft、idempotent。
- Regression gate 包含 DEV-021 / DEV-022。
- 明確禁止 prompt-only 修補。

2026-07-06 判定：RD implementation、本機 deterministic verifier 與 local browser ROT 已完成；production smoke 仍保留為未執行邊界。
