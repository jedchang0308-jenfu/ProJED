# QC-DEV-024: AI整理保留手寫內容與章節結構

對應 DEV: DEV-024
對應 SPEC: `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md`
對應 QA: `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md`
狀態: Static + Deterministic QC Passed / Browser ROT Not Executed / DB unchanged
日期: 2026-07-06

## QC Scope

本輪驗證 DEV-024 的 deterministic human-draft merge guard 是否已落地，且 AI整理回寫不再只使用裸 `result.content` 覆蓋 preserved draft。

包含：

- 手寫純文字 preserve。
- 手寫自訂章節 preserve。
- 手寫 task mention preserve 與 taskLinks 同步。
- project change evidence + human supplemental evidence 同時保留。
- 最終內容只有一組主會議紀錄 heading。
- 重複 merge idempotent。
- DEV-021 / DEV-022 / DEV-011 / DEV-012 回歸。
- TypeScript 與 production build。

不包含：

- Browser ROT-001 至 ROT-004 真實操作截圖。
- Production deploy / production UI smoke。
- DB schema / migration / RLS / RPC。
- 模型風格調參或人工校稿品質簽核。

## Implementation Facts

- `src/utils/humanDraftSynthesisMerge.ts` 新增 `mergeHumanDraftWithAiSynthesis(aiContent, preservedDraftContent)`。
- helper 先呼叫 `mergeProjectChangeImportBlocks(aiContent, preservedDraftContent)`，保留 DEV-021 / DEV-022 的 project change merge guard。
- helper 從 preserved draft 抽取手寫段落、自訂章節與 task mention evidence，使用 normalized fingerprint 避免重複追加。
- task / risk / decision / due-ish evidence 會補入任務討論區；其他 evidence 補入 `3. 其他` 的 `手寫補充`。
- `src/store/useRecordStore.ts` 的 AI synthesis writeback 已改用 `mergeHumanDraftWithAiSynthesis(result.content, preservedDraft.content)`。
- `src/components/Records/RecordSidebar.tsx` 的 AI整理 tooltip 已更新為會保留目前手寫內容。

## Commands

Passed:

```powershell
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft
npm.cmd run verify:dev-021-project-change-ai-preserve
npm.cmd run verify:dev-022-project-change-single-record
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Build note:

- `npm.cmd run build` 通過；Vite 顯示 Browserslist/caniuse-lite 資料偏舊提示，非 DEV-024 失敗。

## QC Result

Pass for local static / deterministic scope.

DEV-024 可宣稱：

- `AI整理` 回寫路徑已有 deterministic human-draft merge guard。
- 手寫純文字、自訂章節、task mention 與 project change evidence 在 verifier 覆蓋下可保留。
- DEV-021 / DEV-022 / DEV-011 / DEV-012 回歸未退化。
- DB unchanged。

DEV-024 不可宣稱：

- Browser ROT-001 至 ROT-004 已通過。
- 真實 AI 模型輸出在 production UI 已驗證。
- production deploy 已完成。

## Residual Risk

- Fingerprint 是 deterministic 文字規則，仍無法判斷所有語意等價；若 AI 改寫成完全不同措辭，fallback 可能保守補回原段落。
- Browser ROT 未執行，因此仍需後續以實際 composer / AI整理流程補截圖與內容節錄。
- 本輪不處理模型品質風格、摘要自然語氣或人工校稿標準。
