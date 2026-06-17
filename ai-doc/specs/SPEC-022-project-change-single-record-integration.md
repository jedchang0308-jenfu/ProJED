# SPEC-022: 專案變化匯入後 AI整理同整成單一會議紀錄

對應 DEV: DEV-022
父交付點: DEV-021
狀態: Implemented
日期: 2026-06-15

## 背景

DEV-021 解決了「先匯入專案變化後再 AI整理會丟失匯入內容」的問題，但使用 preserve append 策略，導致匯入內容若本身是完整 rendered meeting record，最後會形成第二份會議內容。

DEV-022 將保護目標從「完整 rendered text」改為「project change evidence」。AI整理後的 editor content 必須只有一份主會議紀錄結構。

## 不變式

1. 匯入專案變化不得遺失。
2. AI整理後不得保留第二份完整會議紀錄。
3. 最終內容只能有一組主要結構：
   - `1. 本次會議總結`
   - `2. 任務討論與結論`
   - `3. 待校稿項目`
4. 專案變化 evidence 中的 task mentions 必須存在於最終內容，或由 deterministic fallback 補入。
5. fallback 只能補「專案變化補充」 evidence note，不得補 `[專案變化匯入開始]` marker block 或第二組 `1/2/3` 結構。

## 實作要求

- `wrapProjectChangeImportContent` 需先將 rendered meeting record 正規化為 evidence。
- `normalizeProjectChangeImportEvidence` 需移除 `1. 本次會議總結`、`2. 任務討論與結論`、`3. 待校稿項目` 與待校稿 placeholder。
- `mergeProjectChangeImportBlocks` 需 strip 掉 AI 輸出中的 import marker block。
- 若 AI 統整後缺少匯入 task mention，merge guard 在 `3. 待校稿項目` 前補入 `2.x 專案變化補充`。
- 重複 AI整理必須 idempotent。

## 實作證據

- `src/utils/projectChangeImport.ts`
  - `normalizeProjectChangeImportEvidence`
  - `extractProjectChangeImportEvidenceBlocks`
  - `mergeProjectChangeImportBlocks`
- `scripts/verify-dev-022-project-change-single-record.mjs`
- `package.json`
  - `verify:dev-022-project-change-single-record`

## 驗收標準

- 匯入 rendered meeting record 後再 AI整理，最終內容只有一組 `1/2/3` 主結構。
- 最終內容不包含 `[專案變化匯入開始]` 或 `[專案變化匯入結束]`。
- 匯入內容中的任務 mention 仍存在於最終內容與 taskLinks。
- 重複 merge 不會重複追加補充段落。
- DEV-021 preserve verifier 仍通過。

