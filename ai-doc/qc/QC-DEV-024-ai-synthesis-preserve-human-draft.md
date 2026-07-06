# QC-DEV-024: AI整理保留手寫內容與章節結構

對應 DEV: DEV-024
對應 SPEC: `ai-doc/specs/SPEC-024-ai-synthesis-preserve-human-draft.md`
對應 QA: `ai-doc/qa/QA-DEV-024-ai-synthesis-preserve-human-draft.md`
狀態: Static + Deterministic + Local Browser ROT QC Passed / DB unchanged / Production UI Smoke Not Executed
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
- Browser ROT-001 至 ROT-004 local-test composer 操作與截圖。
- DEV-021 / DEV-022 / DEV-011 / DEV-012 回歸。
- TypeScript 與 production build。

不包含：

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
npm.cmd run verify:dev-024-ai-synthesis-preserve-human-draft-browser
npm.cmd run verify:dev-021-project-change-ai-preserve
npm.cmd run verify:dev-022-project-change-single-record
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Browser evidence:

- ROT-001 plain handwritten paragraph preserved: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-001.png`
- ROT-002 custom handwritten section content preserved: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-002.png`
- ROT-003/004 project change import + handwritten supplement preserved; repeated `AI整理` did not duplicate supplement and kept single 1/2/3 record headings: `output/playwright/dev-024-ai-synthesis-1783346377975-ROT-003-004.png`

Build note:

- `npm.cmd run build` 通過；Vite 顯示 Browserslist/caniuse-lite 資料偏舊提示，非 DEV-024 失敗。

## QC Result

Pass for local static / deterministic / browser ROT scope.

DEV-024 可宣稱：

- `AI整理` 回寫路徑已有 deterministic human-draft merge guard。
- 手寫純文字、自訂章節、task mention 與 project change evidence 在 verifier 覆蓋下可保留。
- ROT-001 至 ROT-004 已在 local-test browser composer 通過，含截圖與存草稿後內容驗證。
- DEV-021 / DEV-022 / DEV-011 / DEV-012 回歸未退化。
- DB unchanged。

DEV-024 不可宣稱：

- 真實 AI 模型輸出在 production UI 已驗證。
- production deploy 已完成。

## Residual Risk

- Fingerprint 是 deterministic 文字規則，仍無法判斷所有語意等價；若 AI 改寫成完全不同措辭，fallback 可能保守補回原段落。
- Local browser ROT 使用 test mode deterministic synthesis，因此仍需後續以已登入 production UI smoke 驗證正式前端與模型路徑。
- 本輪不處理模型品質風格、摘要自然語氣或人工校稿標準。
