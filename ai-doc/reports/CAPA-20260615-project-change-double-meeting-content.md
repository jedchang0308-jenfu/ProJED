# CAPA-20260615: 專案變化匯入後 AI整理產生兩份會議內容

日期: 2026-06-15
關聯 DEV: DEV-020 / DEV-021 / DEV-022
狀態: Closed
嚴重度: P1

## 問題描述

使用者測試「先匯入專案變化 -> AI整理」後，最後會議紀錄出現兩段完整會議內容：

1. 第一段是 AI整理後的新會議紀錄，包含「1. 本次會議總結 / 2. 任務討論與結論 / 3. 待校稿項目」。
2. 第二段在 `[專案變化匯入開始]` 與 `[專案變化匯入結束]` 內，也是一份完整的「本次會議總結 / 任務討論與結論 / 待校稿項目」。

使用者期望：專案變化匯入內容不得遺失，但最後應該統整進同一份會議紀錄，不應形成第二份會議內容。

## 事實與證據

目前流程證據：

- `src/components/Records/RecordSidebar.tsx` 的專案變化 preview 由 `synthesizeMeetingRecord(createProjectChangeSynthesisInput(...))` 產生。
- `createProjectChangeSynthesisInput` 使用 meeting synthesis pipeline，因此 preview 本身已經是完整會議紀錄格式。
- DEV-021 的 `wrapProjectChangeImportContent` 會把 preview 包成受保護區塊。
- `src/store/useRecordStore.ts` 的 `mergeProjectChangeImportBlocks(result.content, preservedDraft.content)` 會在 AI 結果沒有包含受保護區塊時，把原受保護區塊追加回去。
- 因此系統行為是「不丟失」但不是「統整」，會把已整理過的匯入紀錄作為第二份完整紀錄保留。

## Root Cause

根因不是單純 prompt 問題，而是資料語意層設計錯誤：

1. 專案變化 preview 被設計成「可直接插入正文的會議紀錄格式」。
2. DEV-021 的 preserve guard 把整段 preview 視為不可改寫的受保護內容。
3. AI整理回寫時，merge guard 採用 append preserve 策略，沒有提供「把匯入內容當 evidence 重新統整」的語意。
4. QA/Verifier 只驗證「不丟失 / 不重複追加」，未驗證「最後只能有一份會議結構」。

## Contributing Factors

- DEV-021 為了快速關閉資料遺失風險，優先保證 preserve，不足以保證 integrated synthesis。
- `專案變化匯入` 的 UI 文案讓使用者期待「先放入素材，再由 AI整理統整」，但資料層實際是「放入一份已整理紀錄」。
- 目前受保護區塊保護的是 rendered text，不是 normalized event evidence。
- Verifier 沒有檢查輸出中是否出現第二組 `1. 本次會議總結 / 2. 任務討論與結論 / 3. 待校稿項目`。

## Containment

短期處置：

- 保留 DEV-021 的防資料遺失 guard，不回退。
- 將此問題開成 DEV-022 follow-up，因為這不是同一個 bug 的單純補丁，而是 preserve -> integrate 的語意升級。
- 在 DEV-022 完成前，PM 文件需標示：DEV-021 已解決「不丟失」，但尚未完成「同整成同一份」。

## Corrective Action

DEV-022 應修正為：

1. 專案變化匯入區塊不得保存為第二份完整會議紀錄。
2. 匯入內容應轉成 source/evidence block 或 structured event evidence，供下一次 AI整理統整。
3. AI整理輸出應只有一組主結構：
   - `1. 本次會議總結`
   - `2. 任務討論與結論`
   - `3. 待校稿項目`
4. project change evidence 中的任務、事件與摘要必須被納入同一份主結構。
5. 若 AI 統整未納入部分匯入 evidence，deterministic guard 應補入「未統整的專案變化」為 evidence note，而不是追加完整第二份會議紀錄。

## Preventive Action

新增 QA / verifier gate：

- 驗證「匯入 -> AI整理」後，輸出只能有一組 `1. 本次會議總結`。
- 驗證輸出不能包含 `[專案變化匯入開始]` 的完整 rendered meeting record。
- 驗證 project change task mentions 仍存在於主 `2. 任務討論與結論`。
- 驗證 AI 回傳缺漏時，fallback 只能補 evidence note，不得補第二份完整紀錄。
- 驗證重複 AI整理仍 idempotent。

## DEV-022 建議

DEV-022: 專案變化匯入後 AI整理同整成單一會議紀錄

狀態: Ready
節點類型: 交付點
優先級: P1
父交付點: DEV-021

交付目標：

- 把 DEV-021 的 preserve guard 升級為 integrate guard。
- 保護的是匯入 evidence，不是完整 rendered meeting record。
- 最終 editor content 必須是一份統整後會議紀錄。

## Release Gate

DEV-022 完成前，不可用 DEV-021 的 verifier 代表此問題已解決。DEV-021 verifier 只證明「不丟失」，不證明「同整」。

## Closure Evidence

關閉日期: 2026-06-15

- DEV-022 已新增 integrated single-record guard。
- `wrapProjectChangeImportContent` 會將 rendered meeting record 正規化為 evidence。
- `mergeProjectChangeImportBlocks` 不再把 import marker block 追加進最終正文。
- 缺漏 evidence 時只補 `2.x 專案變化補充`，不補第二份完整會議紀錄。

已通過：
- `npm.cmd run verify:dev-022-project-change-single-record`
- `npm.cmd run verify:dev-021-project-change-ai-preserve`
- `npm.cmd run verify:dev-020-record-workflow-redesign`
- `npm.cmd run verify:dev-011-ai-meeting-synthesis`
- `npm.cmd run verify:dev-012-meeting-record-quality`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`
